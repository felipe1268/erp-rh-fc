// Rev. 4669 — DOCUMENTOS DO COLABORADOR (dossiê digital com assinatura)
// Motor da Fase 1: gera documentos por funcionário a partir dos templates da
// Central de Documentos ISO (tipos RH_COLAB_DOCS), com snapshot renderizado,
// assinatura digital (hash SHA-256 + IP + geo + termo) e checklist por
// funcionário. PDF via /api/download/rh-documento-pdf (downloadDossie.ts).
import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import {
  rhDocumentos, rhEmployerSigConfig, employees, companies, systemDocumentTemplates,
  epiDeliveries, epiAssinaturas, asos, trainings, employeeDocuments,
  systemCriteria,
} from "../../drizzle/schema";
import { eq, and, desc, isNull, inArray, sql, gte } from "drizzle-orm";
import { storagePut } from "../storage";
import { lockSocioAdministrador } from "../services/socioAdminLock";
import {
  RH_COLAB_DOCS, RH_DOCS_EVENTUAIS, DOCUMENT_TEMPLATES_META, DEFAULT_CODIGOS, SEED_BODIES,
  renderTemplate, getDocMetaOrFallback, getCategoriaFromDoc, type DocumentTemplateTipo,
} from "../../shared/documentTemplates";
import { vacationPeriods } from "../../drizzle/schema";

// Rev. 4672 — geráveis: checklist (RH_COLAB_DOCS) + eventuais (férias/folha/aditivo)
// Rev. 5047 — + documentos CUSTOM da Central ISO (tipo `custom_*` com template
// vigente) entram no checklist como opcionais e podem ser gerados/assinados.
const TIPOS_VALIDOS = [...RH_COLAB_DOCS.map(d => d.tipo), ...RH_DOCS_EVENTUAIS.map(d => d.tipo)];
const tipoSchema = z.string().min(1).max(80).refine(
  (t) => (TIPOS_VALIDOS as string[]).includes(t) || t.startsWith("custom_"),
  { message: "Tipo de documento inválido" },
);
const TIPOS_CHECKLIST = new Set(RH_COLAB_DOCS.map((doc) => doc.tipo as string));
const isTipoChecklist = (tipo: string) => TIPOS_CHECKLIST.has(tipo) || tipo.startsWith("custom_");

// ── Rev. 5101 — ALLOWLIST CENTRAL: tipos permanentes e não-contratuais elegíveis
// para assinatura do empregador (automática e em lote). Esta é a ÚNICA fonte de
// verdade — usada em todos os paths (auto, FCSign, pendentes, lote).
// Nunca inclui contratos (contrato_experiencia, contrato_trabalho_clt),
// aditivos (termo_aditivo), eventuais (aviso_previo, advertencia, ferias, folha)
// ou documentos custom_*.
const TIPOS_ELEGIVEL_EMPREGADOR = new Set<string>([
  "ficha_registro",
  "regulamento_interno",
  "codigo_etica",
  "termo_lgpd",
  "termo_confidencialidade",
  "termo_equipamentos",
  "acordo_banco_horas",
  "acordo_compensacao",
  "adesao_plano_saude",
  "adesao_vt",
  "adesao_va",
  "adesao_seguro_vida",
]);

/** Retorna true somente se o tipo está na allowlist central de elegíveis. */
function isTipoElegivelEmpregador(tipo: string): boolean {
  return TIPOS_ELEGIVEL_EMPREGADOR.has(tipo);
}

/** SQL IN literal para a allowlist (evita repetição inline). */
const SQL_TIPOS_ELEGIVEL = Array.from(TIPOS_ELEGIVEL_EMPREGADOR).map(t => `'${t}'`).join(",");

/**
 * Rev. 5102 — Lê e valida o ID do sócio administrador vigente a partir do
 * critério societário `socio_administrador_employee_id`. Retorna o ID inteiro
 * positivo, ou `null` se o critério estiver ausente/malformado (valor vazio,
 * não numérico, <= 0). NUNCA lança.
 */
async function lerSocioAdministradorCriterioId(db: any, companyId: number): Promise<number | null> {
  const rows = await db.select({ valor: systemCriteria.valor })
    .from(systemCriteria).where(and(
      eq(systemCriteria.companyId, companyId),
      eq(systemCriteria.chave, "socio_administrador_employee_id"),
    )).limit(1);
  const raw = rows[0]?.valor;
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Rev. 5102 — Validação FORTE da coerência da assinatura do empregador.
 * Exige, de forma estrita, que TODOS os seguintes existam e coincidam
 * EXATAMENTE:
 *   1. ID do sócio na configuração (cfg.socioAdminEmployeeId)
 *   2. ID do sócio no critério societário atual (obrigatório e válido)
 *   3. Um employee ativo com tipoContrato = "Socio" na empresa com esse ID
 * Qualquer ausência/divergência => retorna { ok:false, motivo }.
 * NUNCA lança — chamador decide se bloqueia (lote) ou apenas ignora (auto).
 */
async function validarSocioEmpregador(
  db: any,
  companyId: number,
  configSocioId: number | null | undefined,
): Promise<{ ok: true; socioId: number } | { ok: false; motivo: string }> {
  const cfgId = configSocioId ?? null;
  if (!cfgId || !Number.isInteger(cfgId) || cfgId <= 0) {
    return { ok: false, motivo: "Configuração sem sócio administrador válido." };
  }
  const criterioId = await lerSocioAdministradorCriterioId(db, companyId);
  if (criterioId == null) {
    return { ok: false, motivo: "Critério societário 'socio_administrador_employee_id' ausente ou malformado." };
  }
  if (criterioId !== cfgId) {
    return { ok: false, motivo: `Sócio administrador atual (${criterioId}) difere do configurado (${cfgId}).` };
  }
  // Confirma que o employee existe, é sócio ativo e da empresa
  const [socioRow] = await db.select({ id: employees.id })
    .from(employees).where(and(
      eq(employees.id, cfgId),
      eq(employees.companyId, companyId),
      eq(employees.tipoContrato, "Socio"),
      isNull(employees.deletedAt),
    )).limit(1);
  if (!socioRow) {
    return { ok: false, motivo: "Sócio administrador configurado não corresponde a um sócio ativo desta empresa." };
  }
  return { ok: true, socioId: cfgId };
}

function mensagemViaAtiva(status: string) {
  const situacao = status === "assinado"
    ? "assinado"
    : status === "nao_aplicavel"
      ? "marcado como não aplicável"
      : "gerado";
  return `Já existe um documento ${situacao} deste tipo. Exclua-o individualmente no dossiê antes de gerar uma nova via.`;
}

function isConflitoViaAtiva(error: any) {
  const detalhes = [
    error?.constraint, error?.message,
    error?.cause?.constraint, error?.cause?.message,
  ].filter(Boolean).join(" ");
  return error?.code === "23505" && detalhes.includes("uq_rhdoc_checklist_ativo");
}

// Rev. 5047 — templates CUSTOM vigentes (Central ISO) que entram no checklist.
async function listarModelosCustom(db: any): Promise<{ tipo: string; titulo: string; descricao: string | null; codigo: string | null }[]> {
  const rows = await db.select({
    tipo: systemDocumentTemplates.tipo, titulo: systemDocumentTemplates.titulo,
    descricao: systemDocumentTemplates.descricao, codigo: systemDocumentTemplates.codigo,
  }).from(systemDocumentTemplates).where(and(
    sql`${systemDocumentTemplates.tipo} LIKE 'custom\\_%'`,
    eq(systemDocumentTemplates.status, "vigente"),
    isNull(systemDocumentTemplates.deletedAt),
  )).orderBy(systemDocumentTemplates.titulo);
  // Rev. 5049 — templates de SST (código FC-SST) ficam FORA do dossiê/checklist:
  // os certificados de SST são gerados na aba Treinamentos, não aqui.
  return rows.filter((r: any) => getCategoriaFromDoc(r.tipo, r.codigo) !== "sst");
}

function fmtDateBr(v?: string | null): string {
  if (!v) return "";
  const m = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}
function fmtCpf(v?: string | null): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v || "");
}
function fmtSalario(v?: string | null): string {
  if (!v) return "";
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  if (isNaN(n)) return String(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtTel(v?: string | null): string {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(v || "");
}
function fmtCep(v?: string | null): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(v || "");
}

// ── Rev. 4979 — Ficha de Registro UNIFICADA com a "Ficha do Colaborador" da
//    aba Colaboradores (mesmo layout/conteúdo) + bloco de assinaturas
//    empregado/empregador. Substitui o seed antigo do tipo ficha_registro. ────
// Rev. 4982 — jornada formatada igual à aba Colaboradores (formatJornada do client)
const DIAS_LABELS_FICHA: Record<string, string> = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };
function fmtJornadaFicha(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) {
      let totalMin = 0;
      const groups: { dias: string[]; entrada: string; intervalo: string; saida: string }[] = [];
      for (const d of ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]) {
        if (!parsed[d]) continue;
        const { entrada, intervalo, saida } = parsed[d];
        if (entrada && saida) {
          const [eh, em2] = entrada.split(":").map(Number);
          const [sh, sm] = saida.split(":").map(Number);
          let mins = (sh * 60 + sm) - (eh * 60 + em2);
          if (intervalo) {
            const [ih, im] = intervalo.split(":").map(Number);
            mins -= (ih * 60 + im);
          }
          if (mins > 0) totalMin += mins;
        }
        const existing = groups.find(g => g.entrada === entrada && g.intervalo === intervalo && g.saida === saida);
        if (existing) existing.dias.push(DIAS_LABELS_FICHA[d] || d);
        else groups.push({ dias: [DIAS_LABELS_FICHA[d] || d], entrada, intervalo, saida });
      }
      if (groups.length === 0) return "";
      const totalH = Math.floor(totalMin / 60);
      const totalM = totalMin % 60;
      const totalStr = `${totalH}h${totalM > 0 ? String(totalM).padStart(2, "0") : ""}/sem`;
      const detail = groups.map(g => {
        const diasStr = g.dias.length > 2 ? `${g.dias[0]} a ${g.dias[g.dias.length - 1]}` : g.dias.join(", ");
        const intLabel = g.intervalo === "00:30" ? "30min" : g.intervalo === "01:00" ? "1h" : g.intervalo === "01:30" ? "1h30" : g.intervalo === "02:00" ? "2h" : g.intervalo || "";
        return `${diasStr}: ${g.entrada}-${g.saida}${intLabel ? " (" + intLabel + ")" : ""}`;
      }).join(" | ");
      return `${totalStr} — ${detail}`;
    }
  } catch { /* não é JSON — formato legado, exibe como está */ }
  return s;
}

function montarFichaColaboradorHtml(emp: any, empresa: any, heCfg?: { u: number; d: number; n: number }): string {
  const e = escHtml;
  const val = (v: any) => (v === null || v === undefined || String(v).trim() === "" ? "" : String(v));
  const sexo = emp.sexo === "M" ? "Masculino" : emp.sexo === "F" ? "Feminino" : val(emp.sexo);
  const cidadeUf = [val(emp.cidade), val(emp.estado)].filter(Boolean).join(" - ");
  const sections: Array<{ title: string; fields: Array<[string, string]> }> = [
    { title: "Dados Pessoais", fields: [
      ["CPF", fmtCpf(emp.cpf)],
      ["RG", val(emp.rg)],
      ["Nascimento", fmtDateBr(emp.dataNascimento)],
      ["Sexo", sexo],
      ["Estado Civil", val(emp.estadoCivil)],
      ["Nacionalidade", val(emp.nacionalidade)],
      ["Naturalidade", val(emp.naturalidade)],
      ["Celular", fmtTel(emp.celular)],
      ["E-mail", val(emp.email)],
      ["Nome da Mãe", val(emp.nomeMae)],
      ["Nome do Pai", val(emp.nomePai)],
      ["Contato Emergência", val(emp.contatoEmergencia)],
      ["Tel. Emergência", fmtTel(emp.telefoneEmergencia)],
      ["Parentesco", val(emp.parentescoEmergencia)],
    ]},
    { title: "Profissional", fields: [
      ["Cód. Interno (JFC)", emp.codigoInterno ? `🔒 ${val(emp.codigoInterno)}` : ""],
      ["eSocial", val(emp.matricula)],
      ["Função", val(emp.funcao)],
      ["Setor", val(emp.setor)],
      ["Admissão", fmtDateBr(emp.dataAdmissao)],
      ["Contrato", val(emp.tipoContrato)],
      ["Jornada", fmtJornadaFicha(emp.jornadaTrabalho)],
      ["Cód. Contábil", val(emp.codigoContabil)],
      ["Salário Base", fmtSalario(emp.salarioBase)],
      ["Valor da Hora", fmtSalario(emp.valorHora)],
      ["Horas/Mês", val(emp.horasMensais)],
      ["Calçado (EPI)", val(emp.tamanhoCalcado)],
      ["Camisa (EPI)", val(emp.tamanhoCamisa)],
      ["Calça (EPI)", val(emp.tamanhoCalca)],
      ["Complemento Salarial", emp.recebeComplemento ? `Sim — ${fmtSalario(emp.valorComplemento) || "R$ 0,00"}` : "Não"],
      ["Acordo HE", emp.acordoHoraExtra
        ? `Sim — ${emp.heNormal50 ?? heCfg?.u ?? 50}% / ${emp.he100 ?? heCfg?.d ?? 100}% / ${emp.heNoturna ?? heCfg?.n ?? 20}%`
        : (heCfg ? `Padrão Empresa (${heCfg.u}/${heCfg.d}/${heCfg.n}%)` : "")],
      ["Isenção Art. 62 CLT", emp.cargoConfianca ? `Sim — Art. 62${emp.cargoConfiancaInciso ? `, ${val(emp.cargoConfiancaInciso)}` : ""} CLT${emp.cargoConfiancaGratificacao ? ` (grat. ${val(emp.cargoConfiancaGratificacao)}%)` : ""}` : "Não"],
    ]},
    { title: "Documentos", fields: [
      ["CTPS", val(emp.ctps)],
      ["Série CTPS", val(emp.serieCtps)],
      ["PIS", val(emp.pis)],
      ["Título Eleitor", val(emp.tituloEleitor)],
      ["Reservista", val(emp.certificadoReservista)],
      ["CNH", val(emp.cnh)],
      ["Cat. CNH", val(emp.categoriaCnh)],
      ["Val. CNH", fmtDateBr(emp.validadeCnh)],
    ]},
    { title: "Endereço", fields: [
      ["Logradouro", val(emp.logradouro)],
      ["Nº", val(emp.numero)],
      ["Complemento", val(emp.complemento)],
      ["Bairro", val(emp.bairro)],
      ["Cidade/UF", cidadeUf],
      ["CEP", fmtCep(emp.cep)],
    ]},
    { title: "Dados Bancários", fields: [
      ["Banco", val(emp.banco) || val(emp.bancoNome)],
      ["Agência", val(emp.agencia)],
      ["Conta", val(emp.conta)],
      ["Tipo Conta", val(emp.tipoConta)],
      ["Tipo Chave PIX", val(emp.tipoChavePix)],
      ["Chave PIX", val(emp.chavePix)],
      ["Banco PIX", val(emp.bancoPix)],
    ]},
  ];

  const fotoSrc = emp.fotoUrl && String(emp.fotoUrl).startsWith("/uploads/") ? String(emp.fotoUrl).split("?")[0] : null;
  const iniciais = `${(emp.nomeCompleto || "?").charAt(0)}${(emp.nomeCompleto || "").split(" ").pop()?.charAt(0) || ""}`;

  // Rev. 4983 — cabeçalho no padrão JÁ EXISTENTE da Ficha do Colaborador
  // (faixa escura empresa + emissão), no lugar da moldura ISO.
  const dataEmissaoBar = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const statusMasc = emp.status === "Lista_Negra" ? "Inativo" : val(emp.status); // LGPD: blacklist não aparece em documento
  const statusCores = statusMasc === "Ativo" ? ["#dcfce7", "#166534"] : ["#fef3c7", "#92400e"];

  let html = `<div style="background:#1B2A4A;color:#fff;padding:12px 20px;border-radius:6px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;font-family:'Segoe UI',Arial,sans-serif;">
    <div><div style="font-size:13pt;font-weight:700;">${e(val(empresa?.razaoSocial))}</div><div style="font-size:8pt;opacity:.8;">Ficha de Registro do Empregado</div></div>
    <div style="font-size:8pt;opacity:.8;">Emitido em: ${e(dataEmissaoBar)}</div>
  </div>`;

  html += `<div style="display:flex;align-items:center;gap:20px;padding-bottom:14px;border-bottom:3px solid #1B2A4A;margin-bottom:16px;">
    ${fotoSrc
      ? `<img src="${fotoSrc}" alt="Foto" style="width:80px;height:80px;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #1B2A4A;"/>`
      : `<div style="width:80px;height:80px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#1B2A4A;border:3px solid #c5cdd8;">${e(iniciais)}</div>`}
    <div>
      <h2 style="font-size:15pt;font-weight:700;color:#1B2A4A;margin:0;">${e(val(emp.nomeCompleto))}</h2>
      <p style="font-size:10pt;color:#666;margin:4px 0 0;">${e(val(emp.funcao))}${emp.setor ? " · " + e(val(emp.setor)) : ""}</p>
      ${statusMasc ? `<span style="display:inline-block;background:${statusCores[0]};color:${statusCores[1]};padding:2px 10px;border-radius:4px;font-size:8pt;font-weight:600;margin-top:4px;">${e(statusMasc)}</span>` : ""}
      <span style="font-size:9pt;color:#888;margin-left:12px;">Empresa: ${e(val(empresa?.razaoSocial))}</span>
    </div>
  </div>`;

  for (const s of sections) {
    const fields = s.fields.filter(([, v]) => v && v !== "-");
    if (fields.length === 0) continue;
    html += `<div style="margin-top:14px;"><h3 style="font-size:10.5pt;font-weight:600;color:#1B2A4A;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin:0 0 8px;">${e(s.title)}</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px;">`;
    for (const [label, value] of fields) {
      html += `<div><span style="font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;color:#888;display:block;">${e(label)}</span><span style="font-size:9.5pt;font-weight:600;">${e(value)}</span></div>`;
    }
    html += `</div></div>`;
  }

  if (emp.observacoes) {
    html += `<div style="margin-top:14px;"><h3 style="font-size:10.5pt;font-weight:600;color:#1B2A4A;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin:0 0 8px;">Observações</h3>
      <p style="font-size:9pt;background:#f8fafc;padding:8px 12px;border-radius:4px;margin:0;">${e(val(emp.observacoes))}</p></div>`;
  }

  // Bloco de assinaturas — empregado e empregador
  html += `<div style="margin-top:48px;page-break-inside:avoid;">
    <p style="font-size:9pt;color:#333;margin:0 0 36px;">Declaro que as informações constantes nesta ficha de registro são verdadeiras e refletem meus dados cadastrais junto ao empregador.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
      <div style="text-align:center;">
        <div style="border-top:2px solid #1a1a1a;padding-top:6px;font-size:9.5pt;font-weight:700;">${e(val(emp.nomeCompleto))}</div>
        <div style="font-size:8pt;color:#666;">Assinatura do Empregado${emp.cpf ? ` — CPF ${e(fmtCpf(emp.cpf))}` : ""}</div>
      </div>
      <div style="text-align:center;">
        <div style="border-top:2px solid #1a1a1a;padding-top:6px;font-size:9.5pt;font-weight:700;">${e(val(empresa?.razaoSocial))}</div>
        <div style="font-size:8pt;color:#666;">Assinatura do Empregador${(empresa as any)?.cnpj ? ` — CNPJ ${e(String((empresa as any).cnpj))}` : ""}</div>
      </div>
    </div>
  </div>`;

  // Rodapé no padrão existente da Ficha do Colaborador (LGPD)
  html += `<div style="margin-top:30px;border-top:2px solid #e2e8f0;padding-top:10px;font-size:7pt;color:#999;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
    <span>ERP - Gestão Integrada</span>
    <span>Documento emitido em ${e(dataEmissaoBar)}</span>
    <span style="font-style:italic;color:#b91c1c;">Este documento contém dados pessoais protegidos pela LGPD (Lei 13.709/2018). Uso restrito e confidencial.</span>
  </div>`;

  return html;
}

async function assertAccess(userId: number, role: string, companyId: number) {
  const allowed = new Set((await getCompaniesForUser(userId, role)).map((c: any) => c.id));
  if (!allowed.has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à empresa informada." });
  }
}

/** Carrega o doc e valida acesso do usuário à empresa DELE (anti-IDOR). */
async function loadDocGuarded(db: any, ctx: any, docId: number) {
  const [doc] = await db.select().from(rhDocumentos)
    .where(and(eq(rhDocumentos.id, docId), isNull(rhDocumentos.deletedAt)));
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
  await assertAccess(ctx.user.id, ctx.user.role, doc.companyId);
  return doc;
}

export const rhDocumentosRouter = router({
  // ── Modelos disponíveis (meta + se há template vigente na Central ISO) ────
  modelos: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const rows = await db.select({
      tipo: systemDocumentTemplates.tipo, status: systemDocumentTemplates.status,
      versaoAtual: systemDocumentTemplates.versaoAtual,
    }).from(systemDocumentTemplates)
      .where(and(inArray(systemDocumentTemplates.tipo, TIPOS_VALIDOS), isNull(systemDocumentTemplates.deletedAt)));
    const byTipo = new Map(rows.map((r: any) => [r.tipo, r]));
    const fixos = RH_COLAB_DOCS.map(d => {
      const meta = DOCUMENT_TEMPLATES_META.find(m => m.tipo === d.tipo)!;
      const row = byTipo.get(d.tipo);
      return {
        tipo: d.tipo as string,
        titulo: meta.titulo,
        descricao: meta.descricao,
        obrigatorio: d.obrigatorio,
        codigo: DEFAULT_CODIGOS[d.tipo] as string | null,
        templateVigente: row?.status === "vigente",
        versao: row?.versaoAtual ?? null,
      };
    });
    // Rev. 5047 — customs vigentes entram como opcionais
    const customs = (await listarModelosCustom(db)).map(c => ({
      tipo: c.tipo, titulo: c.titulo, descricao: c.descricao || "",
      obrigatorio: false, codigo: c.codigo, templateVigente: true, versao: null as number | null,
    }));
    return [...fixos, ...customs];
  }),

  // ── Gerar documento (snapshot renderizado) ────────────────────────────────
  // (motor de renderização compartilhado com `preview` — ver montarHtmlDocumento no fim do arquivo)
  gerar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: tipoSchema,
      /** Campos específicos digitados na geração (equipamentos, prazos, jornada…) */
      extras: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      // Documentos do checklist têm apenas uma via ativa por colaborador/tipo.
      // Uma via gerada ou assinada é um snapshot: para emitir outra, o usuário
      // precisa excluir aquela via individualmente no dossiê antes de gerar.
      // Documentos eventuais (folha, férias, aditivos etc.) seguem podendo
      // possuir várias emissões, pois cada ocorrência tem seu próprio contexto.
      const ehDocumentoDeChecklist = isTipoChecklist(input.tipo);

      try {
        return await db.transaction(async (tx: any) => {
          if (ehDocumentoDeChecklist) {
            // Serializa tentativas simultâneas para o mesmo colaborador, evitando
            // duas emissões ativas da mesma via antes que a tela seja atualizada.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.companyId}::int, ${input.employeeId}::int)`);
            const [existente] = await tx.select({
              id: rhDocumentos.id,
              status: rhDocumentos.status,
            }).from(rhDocumentos).where(and(
              eq(rhDocumentos.companyId, input.companyId),
              eq(rhDocumentos.employeeId, input.employeeId),
              eq(rhDocumentos.tipo, input.tipo),
              isNull(rhDocumentos.deletedAt),
            )).limit(1);
            if (existente) {
              throw new TRPCError({
                code: "CONFLICT",
                message: mensagemViaAtiva(existente.status),
              });
            }
          }

          const { html, meta, usaVigente, tpl, dados } = await montarHtmlDocumento(tx, input);
          const [row] = await tx.insert(rhDocumentos).values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            tipo: input.tipo,
            // Eventuais ganham referência no título p/ distinguir no histórico
            titulo: (() => {
              const ex = input.extras || {};
              if (input.tipo === "recibo_folha" && (ex.mesRef || ex.tipoRecibo)) return `${meta.titulo} — ${[ex.tipoRecibo, ex.mesRef].filter(Boolean).join(" ")}`.slice(0, 200);
              if ((input.tipo === "solicitacao_ferias" || input.tipo === "recibo_ferias") && (ex.feriasInicio || dados.feriasInicio)) return `${meta.titulo} — ${ex.feriasInicio || dados.feriasInicio}`.slice(0, 200);
              if (input.tipo === "termo_aditivo" && ex.tipoAlteracao) return `${meta.titulo} — ${ex.tipoAlteracao}`.slice(0, 200);
              return meta.titulo;
            })(),
            codigo: usaVigente ? (tpl!.codigo || DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo]) : DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo],
            versaoTemplate: usaVigente ? tpl!.versaoAtual : null,
            conteudoHtml: html,
            status: "gerado",
            criadoPorId: ctx.user.id,
            criadoPorNome: (ctx.user as any).name || (ctx.user as any).email || null,
          }).returning({ id: rhDocumentos.id });
          return { id: row.id };
        });
      } catch (error: any) {
        if (isConflitoViaAtiva(error)) {
          throw new TRPCError({ code: "CONFLICT", message: mensagemViaAtiva("gerado") });
        }
        throw error;
      }
    }),

  // ── Rev. 4978 — N/A (não se aplica): funcionário já possui o documento
  //    assinado fisicamente → marca o tipo como não aplicável e sai do
  //    "Faltando". Registro sem PDF; desfazer = excluir o registro. ─────────
  marcarNaoAplicavel: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number(), tipo: tipoSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      try {
        return await db.transaction(async (tx: any) => {
          // Compartilha o lock da geração para que N/A e gerar não possam
          // ocupar simultaneamente a mesma via do checklist.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.companyId}::int, ${input.employeeId}::int)`);
          // anti-IDOR: o funcionário precisa pertencer à empresa informada
          const [empRow] = await tx.select({ id: employees.id }).from(employees).where(and(
            eq(employees.id, input.employeeId),
            eq(employees.companyId, input.companyId),
            isNull(employees.deletedAt),
          ));
          if (!empRow) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });
          const meta = DOCUMENT_TEMPLATES_META.find(m => m.tipo === input.tipo);
          const [existente] = await tx.select({ id: rhDocumentos.id, status: rhDocumentos.status }).from(rhDocumentos).where(and(
            eq(rhDocumentos.companyId, input.companyId),
            eq(rhDocumentos.employeeId, input.employeeId),
            eq(rhDocumentos.tipo, input.tipo),
            isNull(rhDocumentos.deletedAt),
          )).limit(1);
          if (existente) throw new TRPCError({ code: "CONFLICT", message: mensagemViaAtiva(existente.status) });
          const criadoPor = (ctx.user as any).name || (ctx.user as any).email || null;
          const [row] = await tx.insert(rhDocumentos).values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            tipo: input.tipo,
            titulo: `${meta?.titulo || input.tipo} — N/A (já assinado fisicamente)`.slice(0, 200),
            conteudoHtml: `<p>Documento marcado como <b>não se aplica</b>: o colaborador já possui este documento assinado (coleta anterior/física). Marcado por ${criadoPor || "usuário"} em ${new Date().toLocaleDateString("pt-BR")}.</p>`,
            status: "nao_aplicavel",
            criadoPorId: ctx.user.id,
            criadoPorNome: criadoPor,
          }).returning({ id: rhDocumentos.id });
          return { id: row.id };
        });
      } catch (error: any) {
        if (isConflitoViaAtiva(error)) {
          throw new TRPCError({ code: "CONFLICT", message: mensagemViaAtiva("gerado") });
        }
        throw error;
      }
    }),

  // ── Rev. 4675 — Pré-visualização (olhinho): renderiza o documento com os
  //    dados do colaborador SEM salvar nada. Mesmo motor da geração. ─────────
  preview: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      tipo: tipoSchema,
      extras: z.record(z.string(), z.string()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const { html, meta } = await montarHtmlDocumento(db, input);
      return { titulo: meta.titulo, conteudoHtml: html };
    }),
  // ── Listar documentos de um funcionário ───────────────────────────────────
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const rows = await db.select({
        id: rhDocumentos.id, tipo: rhDocumentos.tipo, titulo: rhDocumentos.titulo,
        codigo: rhDocumentos.codigo, status: rhDocumentos.status,
        assinadoEm: rhDocumentos.assinadoEm, createdAt: rhDocumentos.createdAt,
        criadoPorNome: rhDocumentos.criadoPorNome,
        // Rev. 5101 — campos de assinatura do empregador (identidade + auditoria)
        empregadorAssinadoEm: rhDocumentos.empregadorAssinadoEm,
        empregadorSocioNome: rhDocumentos.empregadorSocioNome,
        empregadorModo: rhDocumentos.empregadorModo,
        empregadorAssinaturaHash: rhDocumentos.empregadorAssinaturaHash,
      }).from(rhDocumentos).where(and(
        eq(rhDocumentos.companyId, input.companyId),
        eq(rhDocumentos.employeeId, input.employeeId),
        isNull(rhDocumentos.deletedAt),
      )).orderBy(desc(rhDocumentos.createdAt));

      // Rev. 5102 — flag derivada da allowlist central: indica se o documento
      // exige assinatura do empregador (tipo elegível + já assinado pelo
      // colaborador). Permite à UI destacar pendências corretamente.
      return rows.map((r: any) => ({
        ...r,
        empregadorElegivel: r.status === "assinado" && isTipoElegivelEmpregador(r.tipo),
      }));
    }),

  // ── Detalhe (preview HTML) ────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const doc = await loadDocGuarded(db, ctx, input.id);
      // Rev. 5102 — flag derivada da allowlist central (mesma regra do listar).
      return {
        ...doc,
        empregadorElegivel: doc.status === "assinado" && isTipoElegivelEmpregador(doc.tipo),
      };
    }),

  // ── Assinatura digital do colaborador ─────────────────────────────────────
  assinar: protectedProcedure
    .input(z.object({
      docId: z.number(),
      assinaturaBase64: z.string().min(100),
      termoAceito: z.boolean(),
      geoLocation: z.object({ lat: z.string(), lng: z.string(), accuracy: z.string() }).nullable().optional(),
      /** Rev. 5049 — Declaração VT: opção assinalada pelo colaborador (SIM/NÃO) */
      opcaoAssinalada: z.enum(["sim", "nao"]).nullish(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!input.termoAceito) throw new TRPCError({ code: "BAD_REQUEST", message: "É necessário aceitar o termo para assinar." });
      const db = (await getDb())!;
      const doc = await loadDocGuarded(db, ctx, input.docId);
      // Integridade de auditoria: assinatura é IMUTÁVEL. Para reassinar,
      // exclua o documento (Admin Master) e gere um novo.
      if (doc.status === "assinado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento já está assinado. Gere um novo documento para colher outra assinatura." });
      }

      // Rev. 5049 — Declaração de Vale-Transporte: o colaborador precisa
      // assinalar SIM ou NÃO antes de assinar. Marcamos um ✕ no quadradinho
      // correspondente do snapshot (o HTML gravado é o que sai no PDF).
      let htmlMarcado: string | null = null;
      if (doc.tipo === "adesao_vt") {
        if (!input.opcaoAssinalada) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Assinale SIM ou NÃO (opção pelo Vale-Transporte) antes de assinar." });
        }
        const alvo = input.opcaoAssinalada === "sim" ? "SIM" : "N[ÃA]O";
        const re = new RegExp(`<span([^>]*)>\\s*</span>(\\s*(?:&nbsp;)*\\s*<strong>\\s*${alvo})`, "i");
        const html = String(doc.conteudoHtml || "");
        if (re.test(html)) {
          htmlMarcado = html.replace(re,
            `<span$1><span style="display:block;text-align:center;font-weight:bold;font-size:13px;line-height:17px">&#10005;</span></span>$2`);
        }
      }

      const base64 = input.assinaturaBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > 2 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura muito grande." });
      const key = `rh-doc-assinaturas/${doc.id}-${Date.now()}.png`;
      const { url } = await storagePut(key, buffer, "image/png");
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const ip = (ctx as any).req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim()
        || (ctx as any).req?.socket?.remoteAddress || null;

      // Rev. 4673 — UPDATE condicional (atômico): evita corrida com o fluxo
      // FCSign — se o doc foi assinado por outro canal entre o load e o update,
      // NÃO sobrescreve a trilha de auditoria.
      const upd = await db.update(rhDocumentos).set({
        status: "assinado",
        assinaturaUrl: url,
        assinaturaKey: key,
        assinaturaHash: hash,
        assinadoEm: sql`now()`,
        assinaturaIp: ip,
        assinaturaGeo: input.geoLocation ? JSON.stringify(input.geoLocation) : null,
        termoAceito: 1,
        ...(htmlMarcado ? { conteudoHtml: htmlMarcado } : {}),
        updatedAt: sql`now()`,
      }).where(and(eq(rhDocumentos.id, doc.id), sql`${rhDocumentos.status} <> 'assinado'`)).returning({ id: rhDocumentos.id });
      if (upd.length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Este documento acabou de ser assinado por outro canal (FCSign). Recarregue a tela." });
      }

      // Rev. 5101 — assinatura automática do empregador (fire-and-forget, nunca quebra).
      // Identidade registrada = sócio administrador (não o colaborador/operador).
      setImmediate(() => {
        aplicarAssinaturaEmpregadorAutomatica(db, doc.id, doc.companyId, doc.tipo).catch(() => {});
      });

      return { ok: true, hashSha256: hash };
    }),

  // ── Excluir (soft). Documento ASSINADO não pode ser excluído (auditoria). ──
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const doc = await loadDocGuarded(db, ctx, input.id);
      if (doc.status === "assinado" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Documento assinado não pode ser excluído (somente Admin Master)." });
      }
      await db.update(rhDocumentos).set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(rhDocumentos.id, input.id));
      return { ok: true };
    }),

  // ── Checklist documental do funcionário ───────────────────────────────────
  checklist: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const hoje = new Date().toISOString().slice(0, 10);
      const { companyId, employeeId } = input;

      const [docsRh, entregas, assinEpi, assinOs, asosVig, treinVig, anexos] = await Promise.all([
        db.select({ tipo: rhDocumentos.tipo, status: rhDocumentos.status, id: rhDocumentos.id, assinadoEm: rhDocumentos.assinadoEm })
          .from(rhDocumentos).where(and(
            eq(rhDocumentos.companyId, companyId), eq(rhDocumentos.employeeId, employeeId), isNull(rhDocumentos.deletedAt),
          )).orderBy(desc(rhDocumentos.createdAt)),
        db.select({ n: sql<number>`count(*)::int` }).from(epiDeliveries).where(and(
          eq(epiDeliveries.companyId, companyId), eq(epiDeliveries.employeeId, employeeId), isNull(epiDeliveries.deletedAt),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(epiAssinaturas).where(and(
          eq(epiAssinaturas.companyId, companyId), eq(epiAssinaturas.employeeId, employeeId), eq(epiAssinaturas.tipo, "entrega"),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(epiAssinaturas).where(and(
          eq(epiAssinaturas.companyId, companyId), eq(epiAssinaturas.employeeId, employeeId), eq(epiAssinaturas.tipo, "ordem_servico"),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(asos).where(and(
          eq(asos.companyId, companyId), eq(asos.employeeId, employeeId), gte(asos.dataValidade, hoje),
          isNull(asos.deletedAt),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(trainings).where(and(
          eq(trainings.companyId, companyId), eq(trainings.employeeId, employeeId),
          sql`(${trainings.dataValidade} IS NULL OR ${trainings.dataValidade} >= ${hoje})`,
          isNull(trainings.deletedAt),
        )),
        db.select({ n: sql<number>`count(*)::int` }).from(employeeDocuments).where(and(
          eq(employeeDocuments.companyId, companyId), eq(employeeDocuments.employeeId, employeeId), isNull(employeeDocuments.deletedAt),
        )),
      ]);

      // Documento mais recente de cada tipo (o gerado por último manda no status)
      const docPorTipo = new Map<string, { id: number; status: string; assinadoEm: string | null }>();
      for (const d of docsRh) if (!docPorTipo.has(d.tipo)) docPorTipo.set(d.tipo, d);

      // Rev. 5047 — fixos + customs vigentes da Central ISO (opcionais)
      const listaModelos: { tipo: string; titulo: string; obrigatorio: boolean }[] = [
        ...RH_COLAB_DOCS.map(m => ({ tipo: m.tipo as string, titulo: DOCUMENT_TEMPLATES_META.find(x => x.tipo === m.tipo)!.titulo, obrigatorio: m.obrigatorio })),
        ...(await listarModelosCustom(db)).map(c => ({ tipo: c.tipo, titulo: c.titulo, obrigatorio: false })),
      ];
      const modelos = listaModelos.map(m => {
        const doc = docPorTipo.get(m.tipo);
        return {
          tipo: m.tipo,
          titulo: m.titulo,
          obrigatorio: m.obrigatorio,
          situacao: !doc ? "faltando" : doc.status === "assinado" ? "assinado" : doc.status === "nao_aplicavel" ? "nao_aplicavel" : "gerado",
          docId: doc?.id ?? null,
        };
      });

      return {
        modelos,
        sst: {
          epiEntregas: entregas[0]?.n ?? 0,
          epiAssinaturas: assinEpi[0]?.n ?? 0,
          osAssinada: (assinOs[0]?.n ?? 0) > 0,
          asoVigente: (asosVig[0]?.n ?? 0) > 0,
          treinamentosVigentes: treinVig[0]?.n ?? 0,
        },
        anexos: anexos[0]?.n ?? 0,
      };
    }),

  // ── Checklist GERAL (matriz funcionário × documento, empresa inteira) ─────
  // Rev. 4671 — Controle de Documentos: visão centralizada campo a campo.
  // Consultas em LOTE (sem N+1): 1 query por fonte, agregada por funcionário.
  checklistGeral: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const allowed = new Set((await getCompaniesForUser(ctx.user.id, ctx.user.role)).map((c: any) => c.id));
      const ids = (input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId])
        .filter((id) => allowed.has(id));
      if (ids.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à(s) empresa(s) informada(s)." });
      const hoje = new Date().toISOString().slice(0, 10);

      const emps = await db.select({
        id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao,
        fotoUrl: employees.fotoUrl, companyId: employees.companyId, status: employees.status,
        cpf: employees.cpf,
      }).from(employees).where(and(
        inArray(employees.companyId, ids), isNull(employees.deletedAt),
        // Não-desligados (inclui Ativo/Aviso/Ferias/Afastado/Recluso…)
        sql`${employees.status} NOT IN ('Desligado','Lista_Negra','Inativo')`,
      )).orderBy(employees.nomeCompleto);
      const empIds = emps.map((e: any) => e.id);
      const modelosCustomGeral = (await listarModelosCustom(db)).map(c => ({ tipo: c.tipo, titulo: c.titulo, obrigatorio: false }));
      if (empIds.length === 0) return { funcionarios: [], modelos: [...RH_COLAB_DOCS.map(m => ({ tipo: m.tipo as string, titulo: DOCUMENT_TEMPLATES_META.find(x => x.tipo === m.tipo)!.titulo, obrigatorio: m.obrigatorio })), ...modelosCustomGeral] };

      const [docsRh, asosVig, treinVig, osRows, anexosRows] = await Promise.all([
        db.select({ employeeId: rhDocumentos.employeeId, tipo: rhDocumentos.tipo, status: rhDocumentos.status, id: rhDocumentos.id, createdAt: rhDocumentos.createdAt })
          .from(rhDocumentos).where(and(
            inArray(rhDocumentos.companyId, ids), inArray(rhDocumentos.employeeId, empIds), isNull(rhDocumentos.deletedAt),
          )).orderBy(desc(rhDocumentos.createdAt)),
        db.select({ employeeId: asos.employeeId, n: sql<number>`count(*)::int` }).from(asos).where(and(
          inArray(asos.companyId, ids), inArray(asos.employeeId, empIds), gte(asos.dataValidade, hoje), isNull(asos.deletedAt),
        )).groupBy(asos.employeeId),
        db.select({ employeeId: trainings.employeeId, n: sql<number>`count(*)::int` }).from(trainings).where(and(
          inArray(trainings.companyId, ids), inArray(trainings.employeeId, empIds),
          sql`(${trainings.dataValidade} IS NULL OR ${trainings.dataValidade} >= ${hoje})`, isNull(trainings.deletedAt),
        )).groupBy(trainings.employeeId),
        db.select({ employeeId: epiAssinaturas.employeeId, n: sql<number>`count(*)::int` }).from(epiAssinaturas).where(and(
          inArray(epiAssinaturas.companyId, ids), inArray(epiAssinaturas.employeeId, empIds), eq(epiAssinaturas.tipo, "ordem_servico"),
        )).groupBy(epiAssinaturas.employeeId),
        db.select({ employeeId: employeeDocuments.employeeId, n: sql<number>`count(*)::int` }).from(employeeDocuments).where(and(
          inArray(employeeDocuments.companyId, ids), inArray(employeeDocuments.employeeId, empIds), isNull(employeeDocuments.deletedAt),
        )).groupBy(employeeDocuments.employeeId),
      ]);

      // Doc mais recente por (funcionário, tipo) — a lista já vem em createdAt desc.
      const docKey = (empId: number, tipo: string) => `${empId}|${tipo}`;
      const docPorTipo = new Map<string, { id: number; status: string }>();
      for (const d of docsRh) {
        const k = docKey(d.employeeId, d.tipo);
        if (!docPorTipo.has(k)) docPorTipo.set(k, { id: d.id, status: d.status });
      }
      const toMap = (rows: any[]) => new Map(rows.map((r: any) => [r.employeeId, r.n]));
      const asoMap = toMap(asosVig), treinMap = toMap(treinVig), osMap = toMap(osRows), anexosMap = toMap(anexosRows);

      const modelosMeta: { tipo: string; titulo: string; obrigatorio: boolean }[] = [
        ...RH_COLAB_DOCS.map(m => ({
          tipo: m.tipo as string, titulo: DOCUMENT_TEMPLATES_META.find(x => x.tipo === m.tipo)!.titulo, obrigatorio: m.obrigatorio,
        })),
        ...modelosCustomGeral, // Rev. 5047 — customs vigentes (opcionais)
      ];

      const funcionarios = emps.map((e: any) => ({
        id: e.id, nomeCompleto: e.nomeCompleto, funcao: e.funcao, fotoUrl: e.fotoUrl, companyId: e.companyId, cpf: e.cpf,
        docs: Object.fromEntries(modelosMeta.map(m => {
          const d = docPorTipo.get(docKey(e.id, m.tipo));
          return [m.tipo, { situacao: !d ? "faltando" : d.status === "assinado" ? "assinado" : d.status === "nao_aplicavel" ? "nao_aplicavel" : "gerado", docId: d?.id ?? null }];
        })),
        asoVigente: (asoMap.get(e.id) ?? 0) > 0,
        osAssinada: (osMap.get(e.id) ?? 0) > 0,
        treinamentosVigentes: treinMap.get(e.id) ?? 0,
        anexos: anexosMap.get(e.id) ?? 0,
      }));

      return {
        funcionarios,
        modelos: modelosMeta,
        // Rev. 5100 — flag para gating no frontend (ocultar UI de assinatura empregador para não-admins)
        canManageEmployerSignature: ctx.user.role === "admin" || ctx.user.role === "admin_master",
      };
    }),

  // ── Rev. 5100 — Assinatura do EMPREGADOR: status/capacidade (sem expor imagem) ──
  // Retorna se há configuração ativa, quem é o sócio, e se auto-assinar está on.
  // Seguro: não devolve assinaturaUrl/Key ao frontend.
  employerSigStatus: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem consultar a configuração de assinatura do empregador." });
      }
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const [cfg] = await db.select({
        id: rhEmployerSigConfig.id,
        socioAdminEmployeeId: rhEmployerSigConfig.socioAdminEmployeeId,
        socioAdminNome: rhEmployerSigConfig.socioAdminNome,
        assinaturaHash: rhEmployerSigConfig.assinaturaHash,
        autoSignAtivo: rhEmployerSigConfig.autoSignAtivo,
        configuradoPorNome: rhEmployerSigConfig.configuradoPorNome,
        configuradoEm: rhEmployerSigConfig.configuradoEm,
        updatedAt: rhEmployerSigConfig.updatedAt,
      }).from(rhEmployerSigConfig).where(and(
        eq(rhEmployerSigConfig.companyId, input.companyId),
        isNull(rhEmployerSigConfig.deletedAt),
      )).limit(1);
      const canManage = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!cfg) return { configurada: false, autoSignAtivo: false, socioAdminNome: null, socioAdminEmployeeId: null, configuradoEm: null, canManage };
      return {
        configurada: true,
        autoSignAtivo: cfg.autoSignAtivo === 1,
        socioAdminNome: cfg.socioAdminNome,
        socioAdminEmployeeId: cfg.socioAdminEmployeeId,
        assinaturaHash: cfg.assinaturaHash,
        configuradoPorNome: cfg.configuradoPorNome,
        configuradoEm: cfg.configuradoEm,
        updatedAt: cfg.updatedAt,
        canManage,
      };
    }),

  // ── Rev. 5100 — Salvar configuração de assinatura do empregador ──────────
  // Recebe base64 do PNG (max 1MB), persiste no storage, grava config.
  // Consentimento obrigatório. Apenas admin/admin_master com acesso.
  saveEmployerSigConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      /** PNG em base64 (com ou sem prefixo data:image/png;base64,) */
      assinaturaBase64: z.string().min(100).max(1_500_000),
      /** Employee.id do sócio administrador cujo nome vai na assinatura */
      socioAdminEmployeeId: z.number().int().positive(),
      autoSignAtivo: z.boolean(),
      /** Consentimento explícito de quem configura */
      consentimentoConfirmado: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem configurar a assinatura do empregador." });
      }
      if (!input.consentimentoConfirmado) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Consentimento obrigatório para salvar a assinatura do empregador." });
      }
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);

      // Rev. 5102 — Exige critério societário vigente e válido, e que o sócio
      // informado no input coincida EXATAMENTE com o critério atual. Rejeita
      // ausência/malformação do critério ou divergência.
      const criterioSocioId = await lerSocioAdministradorCriterioId(db, input.companyId);
      if (criterioSocioId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Critério societário 'socio_administrador_employee_id' ausente ou malformado. Defina o sócio administrador antes de configurar a assinatura.",
        });
      }
      if (criterioSocioId !== input.socioAdminEmployeeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `O sócio informado (${input.socioAdminEmployeeId}) difere do sócio administrador vigente (${criterioSocioId}).`,
        });
      }

      // Valida sócio administrador pertencente à empresa (Drizzle ORM — sem raw query)
      const [socioRow] = await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto })
        .from(employees).where(and(
          eq(employees.id, input.socioAdminEmployeeId),
          eq(employees.companyId, input.companyId),
          eq(employees.tipoContrato, "Socio"),
          isNull(employees.deletedAt),
        )).limit(1);
      if (!socioRow) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário informado não é sócio desta empresa." });
      }

      // Upload no storage FORA da transação (I/O externo lento; não deve
      // segurar o advisory lock / conexão pooled). O objeto órfão é inofensivo
      // caso a revalidação sob lock falhe adiante.
      const base64 = input.assinaturaBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > 1 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem da assinatura muito grande (máx. 1 MB)." });
      }
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const key = `rh-empregador-assinaturas/${input.companyId}-${Date.now()}.png`;
      const { url } = await storagePut(key, buffer, "image/png");

      const configPorNome = (ctx.user as any).name || (ctx.user as any).email || null;
      const socioNome = socioRow.nomeCompleto || null;

      // Rev. 5103 — Revalidação FINAL do critério + upsert da config DENTRO de
      // uma transação segurando o advisory lock por empresa. Serializa com a
      // troca do sócio (financial.setSocioAdministrador) e com os demais fluxos
      // de assinatura. A config só é gravada se o critério ainda apontar
      // exatamente para o sócio informado no momento do commit (anti-TOCTOU).
      await db.transaction(async (tx: any) => {
        await lockSocioAdministrador(tx, input.companyId);

        const criterioFinal = await lerSocioAdministradorCriterioId(tx, input.companyId);
        if (criterioFinal == null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Critério societário 'socio_administrador_employee_id' ausente ou malformado. Defina o sócio administrador antes de configurar a assinatura.",
          });
        }
        if (criterioFinal !== input.socioAdminEmployeeId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `O sócio administrador foi alterado durante a operação (agora ${criterioFinal}). Recarregue e tente novamente.`,
          });
        }

        // Upsert: mantém idempotência (um registro ativo por empresa)
        const [existing] = await tx.select({ id: rhEmployerSigConfig.id })
          .from(rhEmployerSigConfig)
          .where(and(eq(rhEmployerSigConfig.companyId, input.companyId), isNull(rhEmployerSigConfig.deletedAt)))
          .limit(1);

        const configValues = {
          socioAdminEmployeeId: input.socioAdminEmployeeId,
          socioAdminNome: socioNome,
          assinaturaUrl: url,
          assinaturaKey: key,
          assinaturaHash: hash,
          autoSignAtivo: input.autoSignAtivo ? 1 : 0,
          configuradoPorId: ctx.user.id,
          configuradoPorNome: configPorNome,
        };
        if (existing) {
          await tx.update(rhEmployerSigConfig).set({
            ...configValues,
            updatedAt: sql`now()`,
          }).where(eq(rhEmployerSigConfig.id, existing.id));
        } else {
          await tx.insert(rhEmployerSigConfig).values({
            companyId: input.companyId,
            ...configValues,
          });
        }
      });
      return { ok: true, hash, socioNome };
    }),

  // ── Rev. 5100 — Listar docs pendentes de assinatura do empregador ─────────
  // Retorna documentos assinados pelo colaborador mas sem assinatura do
  // empregador, elegíveis para assinatura em lote (exclui contratos).
  pendentesAssinaturaEmpregador: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem listar documentos pendentes de assinatura do empregador." });
      }
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);

      // Usa a allowlist central — tipos elegíveis para assinatura do empregador
      const rows = await db.select({
        id: rhDocumentos.id,
        tipo: rhDocumentos.tipo,
        titulo: rhDocumentos.titulo,
        employeeId: rhDocumentos.employeeId,
        assinadoEm: rhDocumentos.assinadoEm,
        createdAt: rhDocumentos.createdAt,
      }).from(rhDocumentos).where(and(
        eq(rhDocumentos.companyId, input.companyId),
        eq(rhDocumentos.status, "assinado"),
        isNull(rhDocumentos.deletedAt),
        isNull(rhDocumentos.empregadorAssinadoEm),
        sql`${rhDocumentos.tipo} IN (${sql.raw(SQL_TIPOS_ELEGIVEL)})`,
      )).orderBy(desc(rhDocumentos.assinadoEm));

      // Busca nomes dos funcionários em lote
      const empIds = [...new Set(rows.map((r: any) => r.employeeId))];
      const empNomes: Map<number, string> = new Map();
      if (empIds.length > 0) {
        const emps = await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto })
          .from(employees).where(inArray(employees.id, empIds));
        for (const e of emps) empNomes.set(e.id, e.nomeCompleto || "");
      }

      const docs = rows.map((r: any) => ({
        ...r,
        nomeColaborador: empNomes.get(r.employeeId) || "",
      }));
      return { docs, total: docs.length };
    }),

  // ── Rev. 5100 — Assinar em lote (empregador) ─────────────────────────────
  // Aplica a assinatura do empregador em múltiplos documentos selecionados.
  // Máx. 200 docs por chamada. Contratos NUNCA são assinados em lote.
  assinarLoteEmpregador: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      docIds: z.array(z.number().int().positive()).min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem assinar documentos como empregador." });
      }
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);

      // Operador que disparou a ação em lote (admin logado)
      const operadorNome = (ctx.user as any).name || (ctx.user as any).email || "Admin";

      // Rev. 5103 — TUDO sob o advisory lock por empresa DENTRO de uma
      // transação: recarrega a config, REVALIDA o critério societário (forte) e
      // aplica os updates de documentos. Serializa com a troca do sócio e com
      // os demais fluxos de assinatura. A revalidação final acontece segurando
      // o lock, então o critério não pode mudar entre o check e o commit
      // (anti-TOCTOU — não depende só de read-then-update).
      return await db.transaction(async (tx: any) => {
        await lockSocioAdministrador(tx, input.companyId);

        // Carrega config ativa (dentro do lock)
        const [cfg] = await tx.select().from(rhEmployerSigConfig).where(and(
          eq(rhEmployerSigConfig.companyId, input.companyId),
          isNull(rhEmployerSigConfig.deletedAt),
        )).limit(1);
        if (!cfg?.assinaturaUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma assinatura do empregador configurada para esta empresa." });
        }

        // Validação FORTE: config + critério societário atual + employee sócio
        // ativo, todos com IDs coincidindo exatamente (feita sob o lock).
        const validacao = await validarSocioEmpregador(tx, input.companyId, cfg.socioAdminEmployeeId);
        if (!validacao.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Não é possível assinar como empregador: ${validacao.motivo} Atualize a configuração antes de assinar.`,
          });
        }

        // Identidade imutável do signatário = sócio administrador (não o operador)
        const socioId = cfg.socioAdminEmployeeId ?? null;
        const socioNome = cfg.socioAdminNome ?? null;

        // Valida e filtra apenas docs elegíveis da empresa (anti-IDOR + allowlist central)
        const docs = await tx.select({
          id: rhDocumentos.id,
        }).from(rhDocumentos).where(and(
          inArray(rhDocumentos.id, input.docIds),
          eq(rhDocumentos.companyId, input.companyId),
          eq(rhDocumentos.status, "assinado"),
          isNull(rhDocumentos.deletedAt),
          isNull(rhDocumentos.empregadorAssinadoEm),
          sql`${rhDocumentos.tipo} IN (${sql.raw(SQL_TIPOS_ELEGIVEL)})`,
        ));

        if (docs.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento elegível para assinatura do empregador foi encontrado." });
        }

        const eligibleIds = docs.map((d: any) => d.id);

        // Atualização condicional idempotente — signatário = sócio, operador separado.
        // A cláusula isNull(empregadorAssinadoEm) mantém idempotência mesmo se
        // outro fluxo tivesse assinado (não ocorre sob o mesmo lock, mas é defensivo).
        await tx.update(rhDocumentos).set({
          empregadorAssinaturaUrl: cfg.assinaturaUrl,
          empregadorAssinaturaKey: cfg.assinaturaKey,
          empregadorAssinaturaHash: cfg.assinaturaHash,
          empregadorAssinadoEm: sql`now()`,
          empregadorSocioId: socioId,
          empregadorSocioNome: socioNome,
          empregadorOperadorNome: operadorNome,
          empregadorModo: "lote",
          empregadorConfigId: cfg.id,
          updatedAt: sql`now()`,
        }).where(and(
          inArray(rhDocumentos.id, eligibleIds),
          isNull(rhDocumentos.empregadorAssinadoEm),
        ));

        return { ok: true, assinados: eligibleIds.length };
      });
    }),
});

/**
 * Rev. 5101 — Aplica automaticamente a assinatura do empregador após o
 * colaborador assinar, se e somente se:
 *  1. O tipo do documento está na ALLOWLIST central (TIPOS_ELEGIVEL_EMPREGADOR).
 *  2. Há configuração ativa de assinatura do empregador para a empresa.
 *  3. autoSignAtivo = 1 na configuração.
 *  4. O sócio administrador configurado bate com o critério societário atual.
 *
 * Identidade registrada: sempre o sócio administrador (cfg.socioAdminEmployeeId /
 * cfg.socioAdminNome). Operador = "Sistema" (processo automático).
 *
 * Nunca lança erro — o fluxo do colaborador não deve ser quebrado.
 * Config ID preservado como snapshot histórico mesmo após rotação de config.
 */
export async function aplicarAssinaturaEmpregadorAutomatica(
  db: any,
  docId: number,
  companyId: number,
  tipo: string,
): Promise<void> {
  try {
    // Usa a allowlist central — único ponto de decisão de elegibilidade.
    // Fast-fail fora do lock: nenhuma escrita ocorre para tipos inelegíveis.
    if (!isTipoElegivelEmpregador(tipo)) return;

    // Rev. 5103 — TUDO (reload da config + revalidação forte do critério +
    // update do doc) sob o advisory lock por empresa DENTRO de uma transação.
    // Serializa com a troca do sócio (financial.setSocioAdministrador) e com
    // saveEmployerSigConfig / assinarLoteEmpregador. A revalidação final ocorre
    // segurando o lock, então o critério não muda entre o check e o commit.
    // Chamada sempre com o `db` de topo (via setImmediate após o commit da
    // assinatura do colaborador), então abrir nova transação aqui é seguro.
    await db.transaction(async (tx: any) => {
      await lockSocioAdministrador(tx, companyId);

      const [cfg] = await tx.select().from(rhEmployerSigConfig).where(and(
        eq(rhEmployerSigConfig.companyId, companyId),
        isNull(rhEmployerSigConfig.deletedAt),
      )).limit(1);

      if (!cfg || cfg.autoSignAtivo !== 1 || !cfg.assinaturaUrl) return;

      // Validação FORTE (sob o lock): config + critério societário atual +
      // employee sócio ativo, todos com IDs coincidindo exatamente. Qualquer
      // ausência/divergência deixa o doc PENDENTE (o colaborador continua com
      // assinatura válida).
      const validacao = await validarSocioEmpregador(tx, companyId, cfg.socioAdminEmployeeId);
      if (!validacao.ok) {
        console.warn(`[EmpregadorAutoSign] empresa=${companyId} doc=${docId}: ${validacao.motivo} Deixando pendente.`);
        return;
      }

      // Signatário = sócio administrador; operador = Sistema (automático).
      // isNull(empregadorAssinadoEm) preserva idempotência.
      await tx.update(rhDocumentos).set({
        empregadorAssinaturaUrl: cfg.assinaturaUrl,
        empregadorAssinaturaKey: cfg.assinaturaKey,
        empregadorAssinaturaHash: cfg.assinaturaHash,
        empregadorAssinadoEm: sql`now()`,
        empregadorSocioId: cfg.socioAdminEmployeeId ?? null,
        empregadorSocioNome: cfg.socioAdminNome ?? null,
        empregadorOperadorNome: "Sistema",
        empregadorModo: "automatico",
        empregadorConfigId: cfg.id,
        updatedAt: sql`now()`,
      }).where(and(
        eq(rhDocumentos.id, docId),
        isNull(rhDocumentos.empregadorAssinadoEm),
        eq(rhDocumentos.status, "assinado"),
      ));
    });
  } catch (e) {
    console.warn(`[EmpregadorAutoSign] Falha ao aplicar assinatura automática do empregador (doc=${docId}):`, e);
  }
}

// ── Rev. 4675 — motor de renderização COMPARTILHADO entre `gerar` e `preview`.
//    Monta o HTML do documento com os dados do colaborador/empresa/template.
//    NÃO grava nada — quem persiste é o `gerar`.
async function montarHtmlDocumento(
  db: any,
  input: { companyId: number; employeeId: number; tipo: string; extras?: Record<string, string> },
) {
  const [emp] = await db.select().from(employees).where(and(
    eq(employees.id, input.employeeId),
    eq(employees.companyId, input.companyId),
    isNull(employees.deletedAt),
  ));
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });

  let [empresa] = await db.select().from(companies).where(eq(companies.id, input.companyId));
  // Rev. 4984 — colaborador marcado como JF: TODOS os documentos saem com os
  // dados do empregador Julio Ferraz (logo, razão social, CNPJ, endereço).
  if ((emp as any).empregadorDocumentos === "JF") {
    const [jf] = await db.select().from(companies)
      .where(sql`${companies.cnpj} LIKE '03.426.403%' AND (${companies.grupoEmpresarial} IS NOT DISTINCT FROM ${(empresa as any)?.grupoEmpresarial ?? null})`)
      .orderBy(sql`(${companies.deletedAt} IS NULL) DESC, ${companies.id} ASC`)
      .limit(1);
    if (jf) empresa = jf;
  }

  // Template: vigente da Central ISO > seed institucional (fallback)
  const [tpl] = await db.select().from(systemDocumentTemplates).where(and(
    eq(systemDocumentTemplates.tipo, input.tipo),
    isNull(systemDocumentTemplates.deletedAt),
  ));
  // Rev. 5046 — o SEED automático da Central ISO (conteúdo nunca editado) NÃO
  // sobrepõe os layouts unificados (Ficha do Colaborador / motor de Contratos).
  // Só um template realmente CUSTOMIZADO pelo usuário passa a valer como vigente
  // para esses tipos. Para os demais tipos, o comportamento segue igual.
  const tiposUnificados = ["ficha_registro", "contrato_experiencia", "contrato_trabalho_clt"];
  const seedIntocado = !!(tpl && tiposUnificados.includes(input.tipo)
    && String(tpl.conteudoHtml || "").trim() === String(SEED_BODIES[input.tipo as DocumentTemplateTipo] || "").trim());
  const usaVigente = !!(tpl && tpl.status === "vigente" && (tpl.conteudoHtml || "").trim()) && !seedIntocado;
  // Rev. 5047 — documento CUSTOM (Central ISO) não tem seed: exige template vigente
  const ehCustom = input.tipo.startsWith("custom_");
  if (ehCustom && !usaVigente) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Este documento personalizado não tem template vigente na Central de Documentos." });
  }
  const corpo = usaVigente ? tpl.conteudoHtml : SEED_BODIES[input.tipo as DocumentTemplateTipo];
  const meta = ehCustom
    ? getDocMetaOrFallback(input.tipo, tpl?.titulo || input.tipo)
    : DOCUMENT_TEMPLATES_META.find(m => m.tipo === input.tipo)!;

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  // Rev. 4982 — cidade cadastrada tem precedência; parse do endereço é fallback
  const cidade = (empresa as any)?.cidade || String((empresa as any)?.endereco || "").split("-").slice(-2, -1)[0]?.trim();
  const dados: Record<string, string> = {
    empNome: emp.nomeCompleto || "",
    empCpf: fmtCpf(emp.cpf),
    empRg: (emp as any).rg || "",
    empFuncao: emp.funcao || "",
    empMatricula: (emp as any).matricula || "",
    empAdmissao: fmtDateBr((emp as any).dataAdmissao),
    empSalario: fmtSalario((emp as any).salarioBase),
    empCtps: (emp as any).ctps || "",
    empPis: (emp as any).pis || "",
    empNascimento: fmtDateBr((emp as any).dataNascimento),
    empEstadoCivil: (emp as any).estadoCivil || "",
    empNomeMae: (emp as any).nomeMae || "",
    empTelefone: (emp as any).telefone || "",
    empBanco: (emp as any).bancoNome || (emp as any).banco || "",
    empAgencia: (emp as any).agencia || "",
    empConta: (emp as any).conta || "",
    empPix: (emp as any).bancoPix || "",
    empresaRazaoSocial: empresa?.razaoSocial || "",
    empresaCnpj: (empresa as any)?.cnpj || "",
    empresaEndereco: (empresa as any)?.endereco || "",
    // Rev. 4981 — endereço completo do colaborador (Declaração de Vale-Transporte)
    empEndereco: [
      [ (emp as any).logradouro, (emp as any).numero ].filter(Boolean).join(", "),
      (emp as any).bairro,
      [ (emp as any).cidade, (emp as any).estado ].filter(Boolean).join("/"),
      (emp as any).cep,
    ].filter(Boolean).join(" - "),
    docData: hoje,
    docLocal: cidade || "",
    docNumero: "",
  };

  // Rev. 5049 — Vale-Alimentação/Refeição: pré-preenche {{valorMensal}} da
  // config de benefícios vigente (obra do funcionário > padrão da empresa),
  // para o termo já sair com o valor correto (extras têm precedência).
  if (input.tipo === "adesao_va") {
    try {
      const { resolveMealBenefitConfig } = await import("../services/mealBenefitResolver");
      const { obraFuncionarios } = await import("../../drizzle/schema");
      const [aloc] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios)
        .where(and(eq(obraFuncionarios.employeeId, input.employeeId), eq(obraFuncionarios.isActive, 1)));
      const refDate = new Date().toISOString().slice(0, 10);
      const cfg = await resolveMealBenefitConfig(db, input.companyId, aloc?.obraId ?? null, refDate);
      if (cfg) {
        const pBR = (v: any) => {
          const s = String(v ?? "").trim();
          if (!s) return 0;
          const n = s.includes(",")
            ? parseFloat(s.replace(/\./g, "").replace(",", "."))
            : parseFloat(s);
          return isNaN(n) ? 0 : n;
        };
        const dias = Number(cfg.diasUteisRef) || 22;
        const totalIFood = pBR(cfg.totalVaIFood ?? cfg["totalVA_iFood"]);
        const cafe = (cfg.cafeAtivo === 1 || cfg.cafeAtivo === true) ? pBR(cfg.cafeManhaDia) * dias : 0;
        const lanche = (cfg.lancheAtivo === 1 || cfg.lancheAtivo === true) ? pBR(cfg.lancheTardeDia) * dias : 0;
        // Total mensal = totalVA_iFood quando informado; VA mensal é a diferença
        // (regra do Aviso Prévio). Sem iFood, VA = valor-dia × dias úteis (regra do SMO).
        const va = totalIFood > 0
          ? Math.max(0, Math.round((totalIFood - cafe - lanche) * 100) / 100)
          : pBR(cfg.valeAlimentacaoMes) * dias;
        const total = totalIFood > 0 ? totalIFood : cafe + lanche + va;
        const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        if (total > 0) {
          dados.valorMensal = brl(total);
          dados.vaValeAlimentacao = brl(va);
          // Rev. 5049 — café/lanche saem no termo pelo valor DIÁRIO (pedido do usuário)
          dados.vaCafeManha = brl((cfg.cafeAtivo === 1 || cfg.cafeAtivo === true) ? pBR(cfg.cafeManhaDia) : 0);
          dados.vaLancheTarde = brl((cfg.lancheAtivo === 1 || cfg.lancheAtivo === true) ? pBR(cfg.lancheTardeDia) : 0);
        }
      }
    } catch (e: any) {
      console.error("[rhDocumentos] adesao_va: falha ao resolver valor mensal:", e?.message || e);
    }
  }

  // Rev. 4672 — Férias: pré-preenche da última férias programada quando
  // o usuário não informou os campos (extras têm precedência).
  if (input.tipo === "solicitacao_ferias" || input.tipo === "recibo_ferias") {
    const [vp] = await db.select().from(vacationPeriods).where(and(
      eq(vacationPeriods.companyId, input.companyId),
      eq(vacationPeriods.employeeId, input.employeeId),
      isNull(vacationPeriods.deletedAt),
      sql`${vacationPeriods.status} NOT IN ('cancelada', 'cancelado')`,
    )).orderBy(desc(vacationPeriods.id)).limit(1);
    if (vp) {
      Object.assign(dados, {
        feriasInicio: fmtDateBr((vp as any).dataInicio),
        feriasFim: fmtDateBr((vp as any).dataFim),
        feriasDias: String((vp as any).diasGozo ?? ""),
        aquisitivoInicio: fmtDateBr((vp as any).periodoAquisitivoInicio),
        aquisitivoFim: fmtDateBr((vp as any).periodoAquisitivoFim),
        abonoPecuniario: (vp as any).abonoPecuniario ? "Sim" : "Não",
        valorBruto: fmtSalario((vp as any).valorTotal),
        valorLiquido: fmtSalario((vp as any).valorLiquido),
        dataPagamento: fmtDateBr((vp as any).dataPagamento),
      });
    }
  }

  // Rev. 5048 — base legal do desconto varia pelo tipo de contrato: CLT usa o
  // art. 462, §1º, da CLT; Prestador de Serviço (PJ/Sócio/Autônomo) usa o
  // Código Civil (nunca pode citar a CLT).
  const ehPrestador = /pj|prestador|s[oó]cio|aut[oô]nomo/i.test(String((emp as any).tipoContrato || ""));
  dados.baseLegalDesconto = ehPrestador
    ? "nos termos dos artigos 186 e 927 do Código Civil"
    : "nos termos do artigo 462, §1º, da CLT";

  // Rev. 5048 — itens entregues (documentos custom): o client manda um JSON
  // [{descricao, qtd, estado}] e o servidor monta a tabela HTML com escape.
  const extras = { ...(input.extras || {}) };
  const itensJson = extras["itensEntreguesJson"];
  delete extras["itensEntreguesJson"];
  if (itensJson) {
    try {
      const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const itens = (JSON.parse(String(itensJson)) as any[]).filter(i => i && String(i.descricao || "").trim()).slice(0, 50);
      if (itens.length) {
        dados.itensEntregues = `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt">
<thead><tr style="background:#0A1E3C;color:#fff">
<th style="border:1px solid #0A1E3C;padding:4px 6px;width:24px">#</th>
<th style="border:1px solid #0A1E3C;padding:4px 6px;text-align:left">Item / Descrição</th>
<th style="border:1px solid #0A1E3C;padding:4px 6px;width:50px">Qtd.</th>
<th style="border:1px solid #0A1E3C;padding:4px 6px;width:140px">Estado de Conservação</th>
</tr></thead><tbody>${itens.map((i, idx) =>
  `<tr><td style="border:1px solid #ccc;padding:4px 6px;text-align:center">${idx + 1}</td><td style="border:1px solid #ccc;padding:4px 6px">${esc(i.descricao)}</td><td style="border:1px solid #ccc;padding:4px 6px;text-align:center">${esc(i.qtd || "1")}</td><td style="border:1px solid #ccc;padding:4px 6px">${esc(i.estado || "")}</td></tr>`).join("")}</tbody></table>`;
      }
    } catch { /* JSON inválido — ignora, placeholder sai vazio */ }
  }

  // extras digitados têm precedência sobre tudo (sanitizados contra HTML).
  // Rev. 5048 — chaves calculadas pelo SERVIDOR não podem ser sobrescritas pelo
  // client (base legal CLT×Código Civil, tabela de itens já montada).
  const CHAVES_RESERVADAS = new Set(["baseLegalDesconto", "itensEntregues"]);
  for (const [k, v] of Object.entries(extras)) {
    if (/^[a-zA-Z0-9_]+$/.test(k) && !CHAVES_RESERVADAS.has(k)) {
      dados[k] = String(v).replace(/[<>]/g, "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
  }

  // Placeholders não resolvidos viram vazio no snapshot (documento limpo)
  // Rev. 4979 — ficha_registro UNIFICADA: usa o layout da "Ficha do Colaborador"
  // (aba Colaboradores) + bloco de assinaturas, salvo template vigente da Central ISO.
  let html: string;
  if (input.tipo === "ficha_registro" && !usaVigente) {
    // Rev. 4982 — % de HE padrão da empresa (mesma fonte da aba Colaboradores)
    let heCfg: { u: number; d: number; n: number } | undefined;
    try {
      const rows = await db.select().from(systemCriteria).where(eq(systemCriteria.companyId, input.companyId));
      const map: Record<string, string> = {};
      for (const r of rows) map[r.chave] = r.valor;
      heCfg = {
        u: parseFloat(map["he_dias_uteis"] || "50"),
        d: parseFloat(map["he_domingos_feriados"] || "100"),
        n: parseFloat(map["he_adicional_noturno"] || "20"),
      };
    } catch { /* sem config — usa fallbacks CLT */ }
    html = montarFichaColaboradorHtml(emp, empresa, heCfg);
  } else if ((input.tipo === "contrato_experiencia" || input.tipo === "contrato_trabalho_clt") && !usaVigente) {
    // Rev. 4980/4981 — UNIFICADO com o contrato gerado no cadastro do funcionário
    // (motor de Contratos): mesmo texto/cláusulas completas, sem duplicidade de modelos.
    const { montarContratoPreenchido } = await import("./contracts");
    const contrato = await montarContratoPreenchido(db, {
      companyId: input.companyId, employeeId: input.employeeId,
      tipo: input.tipo === "contrato_experiencia" ? "experiencia" : "indeterminado",
      semCabecalho: true, // o frame FC (abaixo) já traz logo/empresa/CNPJ
      prazoExperienciaDias: input.extras?.prazoExperienciaDias ? parseInt(input.extras.prazoExperienciaDias, 10) || undefined : undefined,
    });
    // Rev. 4983 — mesmo frame institucional do contrato impresso no cadastro
    // (buildFcDocument do client): logo central + faixa azul + Nº/Data + ASSUNTO.
    let corpoContrato = contrato.conteudoHtml
      // remove o título interno (a faixa azul do frame já traz o título)
      .replace(/<h2[^>]*>\s*CONTRATO DE TRABALHO[^<]*<\/h2>/i, "");
    const tituloFaixa = input.tipo === "contrato_experiencia"
      ? "CONTRATO DE EXPERIÊNCIA" : "CONTRATO DE TRABALHO POR PRAZO INDETERMINADO";
    const numeroDoc = input.tipo === "contrato_experiencia" && (emp as any).numeroContratoExperiencia && (emp as any).numeroContratoExperienciaAno
      ? `${String((emp as any).numeroContratoExperiencia).padStart(3, "0")}/${(emp as any).numeroContratoExperienciaAno}`
      : "S/N";
    const assuntoDoc = `${tituloFaixa} — ${String(emp.nomeCompleto || "").toUpperCase()}${emp.funcao ? ` (${String(emp.funcao).toUpperCase()})` : ""}`;
    html = montarFcDocFrame({
      empresa,
      titulo: tituloFaixa,
      numero: numeroDoc,
      dataEmissao: hoje,
      assunto: assuntoDoc,
      corpoHtml: corpoContrato,
    });
  } else {
    html = renderTemplate(corpo, dados).replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "");
    // Rev. 5048 — Prestador de Serviço: NUNCA sair citação à CLT em documento
    // custom, mesmo que o template traga o texto fixo (rede de segurança além
    // do placeholder {{baseLegalDesconto}}).
    if (ehCustom && ehPrestador) {
      html = html
        // "(ART. 462, §1º, CLT)" em títulos → remove o parêntese inteiro
        .replace(/\s*\(\s*art\.?(?:igo)?\s*462[^)]*\)/gi, "")
        // "nos termos do <strong>artigo 462, §1º, da CLT</strong>" → Código Civil
        .replace(/nos termos do\s*(?:<strong>)?\s*art\.?(?:igo)?\s*462[^<,]*?,?\s*da\s*CLT\s*(?:<\/strong>)?/gi,
          "nos termos dos artigos 186 e 927 do Código Civil")
        // menção avulsa remanescente
        .replace(/art\.?(?:igo)?\s*462\s*,?\s*(?:§\s*1º?\s*,?\s*)?(?:da\s*)?CLT/gi, "artigos 186 e 927 do Código Civil")
        // PJ não tem folha de pagamento
        .replace(/desconto em folha de pagamento/gi, "desconto ou abatimento nos pagamentos devidos");
    }
    // Rev. 4672 — Ficha de Registro (template vigente) ganha a FOTO do cadastro.
    if (input.tipo === "ficha_registro" && (emp as any).fotoUrl && String((emp as any).fotoUrl).startsWith("/uploads/")) {
      const fotoSrc = String((emp as any).fotoUrl).split("?")[0];
      html = `<div style="float:right;margin:0 0 10px 14px;text-align:center">
<img src="${fotoSrc}" alt="Foto do colaborador" style="width:96px;height:128px;object-fit:cover;border:1px solid #0A1E3C;border-radius:4px"/>
<div style="font-size:7pt;color:#555;margin-top:2px">Foto do cadastro</div></div>` + html;
    }
  }

  // ── Rev. 4678 — Moldura ISO: cabeçalho com logo + controle de revisão +
  //    rodapé LGPD em TODOS os documentos do colaborador (padrão ISO 9001).
  const codigo = usaVigente
    ? (tpl!.codigo || DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo])
    : DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo];
  const revisao = usaVigente ? (tpl!.versaoAtual ?? 1) : 1;
  // Rev. 4983 — Ficha de Registro e Contratos de Trabalho seguem o padrão de
  // impressão JÁ EXISTENTE (cabeçalho próprio); a moldura ISO fica só nos termos.
  const semMolduraIso = !usaVigente &&
    (input.tipo === "ficha_registro" || input.tipo === "contrato_experiencia" || input.tipo === "contrato_trabalho_clt");
  // idempotência: se o template já embute a moldura (sentinela), não duplica
  if (!semMolduraIso && !html.includes("<!--fc-moldura-iso-->")) html = montarMolduraIso({
    corpo: html,
    titulo: meta.titulo,
    codigo,
    revisao,
    dataEmissao: hoje,
    empresaNome: empresa?.razaoSocial || "",
    empresaCnpj: (empresa as any)?.cnpj || "",
    logoUrl: (empresa as any)?.logoUrl && String((empresa as any).logoUrl).startsWith("/uploads/")
      ? String((empresa as any).logoUrl).split("?")[0]
      : (empresa as any)?.logoUrl && /^https?:\/\//.test(String((empresa as any).logoUrl))
        ? String((empresa as any).logoUrl) : null,
  });

  return { html, meta, usaVigente, tpl, dados };
}

// Rev. 4679 — GERAÇÃO AUTOMÁTICA (poka-yoke): os módulos (Férias, Aviso Prévio,
// Advertências, Dissídio, Seguro de Vida, Admissão) chamam este helper após o
// lançamento — o documento nasce no dossiê "Aguardando assinatura" sem
// redigitação. NUNCA lança erro (não pode quebrar a mutation do módulo) e
// deduplica por (empresa, funcionário, tipo, título) — 1 doc por evento.
export async function gerarRhDocumentoAutomatico(opts: {
  companyId: number;
  employeeId: number;
  tipo: string;
  extras?: Record<string, string>;
  /** Sufixo do título que identifica o EVENTO (ex.: data de início do gozo) — é a chave de dedup. */
  refTitulo?: string;
  criadoPorId?: number | null;
  criadoPorNome?: string | null;
}): Promise<number | null> {
  try {
    if (!TIPOS_VALIDOS.includes(opts.tipo)) return null;
    const db = (await getDb())!;
    const { html, meta, usaVigente, tpl } = await montarHtmlDocumento(db, {
      companyId: opts.companyId, employeeId: opts.employeeId, tipo: opts.tipo, extras: opts.extras,
    });
    const titulo = (opts.refTitulo ? `${meta.titulo} — ${opts.refTitulo}` : meta.titulo).slice(0, 200);
    const [dup] = await db.select({ id: rhDocumentos.id }).from(rhDocumentos).where(and(
      eq(rhDocumentos.companyId, opts.companyId),
      eq(rhDocumentos.employeeId, opts.employeeId),
      eq(rhDocumentos.tipo, opts.tipo),
      eq(rhDocumentos.titulo, titulo),
      isNull(rhDocumentos.deletedAt),
    )).limit(1);
    if (dup) return null; // já existe doc deste evento — não duplica
    const [row] = await db.insert(rhDocumentos).values({
      companyId: opts.companyId,
      employeeId: opts.employeeId,
      tipo: opts.tipo,
      titulo,
      codigo: usaVigente ? (tpl!.codigo || DEFAULT_CODIGOS[opts.tipo as DocumentTemplateTipo]) : DEFAULT_CODIGOS[opts.tipo as DocumentTemplateTipo],
      versaoTemplate: usaVigente ? tpl!.versaoAtual : null,
      conteudoHtml: html,
      status: "gerado",
      criadoPorId: opts.criadoPorId ?? null,
      criadoPorNome: opts.criadoPorNome ? `${opts.criadoPorNome} (automático)` : "Automático (módulo)",
    }).onConflictDoNothing().returning({ id: rhDocumentos.id });
    return row?.id ?? null;
  } catch (e) {
    console.warn(`[RhDocsAuto] Falha ao gerar ${opts.tipo} p/ emp=${opts.employeeId}:`, e);
    return null;
  }
}

/** dd/mm/aaaa a partir de YYYY-MM-DD (helper p/ os módulos chamadores). */
export function fmtDateBrDoc(v?: string | null): string { return fmtDateBr(v); }

/**
 * Rev. 4983 — Frame institucional FC (porta server-side do buildFcDocument do
 * client/src/lib/fcDocumentTemplate.ts): logo central + razão social + CNPJ +
 * endereço, faixa azul com o título, linha Nº/Data de Emissão, bloco ASSUNTO
 * e corpo em caixa. É o padrão usado no contrato impresso pelo cadastro.
 */
function montarFcDocFrame(p: {
  empresa: any; titulo: string; numero: string; dataEmissao: string;
  assunto: string; corpoHtml: string;
}): string {
  const e = escHtml;
  const nomeEmpresa = e(p.empresa?.razaoSocial || p.empresa?.nomeFantasia || "FC ENGENHARIA");
  const cnpj = p.empresa?.cnpj ? e(String(p.empresa.cnpj)) : "";
  const enderecoFull = [p.empresa?.endereco, p.empresa?.cidade, p.empresa?.estado].filter(Boolean).map((s: any) => e(String(s))).join(" - ");
  const rawLogo = String(p.empresa?.logoUrl || "");
  const logoSrc = rawLogo.startsWith("/uploads/") ? rawLogo.split("?")[0]
    : /^https?:\/\//.test(rawLogo) ? rawLogo
    : "/logo-fc.jpg";
  return `<!--fc-moldura-iso-->
<div style="max-width:760px;margin:0 auto;font-family:'Helvetica','Arial','Liberation Sans',sans-serif;font-size:11pt;line-height:1.55;color:#1a1a1a">
  <div style="text-align:center;margin-bottom:16px">
    <img src="${e(logoSrc)}" alt="${nomeEmpresa}" style="display:inline-block;height:64px;width:auto;max-width:200px;object-fit:contain;margin-bottom:8px"/>
    <div style="font-size:13pt;font-weight:700;color:#1B2A4A;letter-spacing:.3px;line-height:1.2;margin:4px 0 2px 0">${nomeEmpresa}</div>
    ${cnpj ? `<div style="font-size:9pt;color:#6b7280;line-height:1.3">CNPJ: ${cnpj}</div>` : ""}
    ${enderecoFull ? `<div style="font-size:9pt;color:#9ca3af;line-height:1.3;margin-top:1px">${enderecoFull}</div>` : ""}
  </div>
  <div style="background-color:#1B2A4A;color:#fff;padding:10px 16px;text-align:center;border-radius:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <span style="font-size:11pt;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#fff">${e(p.titulo)}</span>
  </div>
  <table style="width:100%;border-collapse:collapse;margin:12px 0 0 0;font-size:10.5pt" role="presentation"><tbody><tr>
    <td style="text-align:left;padding:0 4px;color:#1B2A4A;font-weight:600">Nº ${e(p.numero)}</td>
    <td style="text-align:right;padding:0 4px;color:#4b5563">Data de Emissão: ${e(p.dataEmissao)}</td>
  </tr></tbody></table>
  <div style="border:1px solid #d1d5db;border-radius:3px;padding:14px 16px;margin:16px 0 20px 0">
    <div style="font-size:9pt;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">ASSUNTO:</div>
    <div style="font-size:12pt;font-weight:700;color:#1B2A4A;line-height:1.3">${e(p.assunto)}</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:3px;padding:20px 24px;margin-bottom:24px;line-height:1.6;color:#1f2937;text-align:justify">
    ${p.corpoHtml}
  </div>
  <table style="width:100%;border-collapse:collapse;margin-top:36px;border-top:1px solid #e5e7eb" role="presentation"><tbody><tr>
    <td style="text-align:left;font-size:8.5pt;color:#9ca3af;padding:8px 0 0 0">Documento gerado pelo ERP - Gestão Integrada</td>
    <td style="text-align:right;font-size:8.5pt;color:#9ca3af;padding:8px 0 0 0">Emitido em: ${e(p.dataEmissao)}</td>
  </tr></tbody></table>
</div>`;
}

/** Escapa texto p/ interpolação segura no HTML da moldura. */
function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Rev. 4678 — Moldura padrão ISO 9001 (controle de documentos) + LGPD.
 * Cabeçalho: logo da empresa · título · caixa de controle (código/rev/data).
 * Rodapé: aviso de documento controlado + cláusula LGPD (Lei 13.709/2018).
 * Inline styles apenas (o HTML vai pra preview, PDF via Puppeteer e FCSign).
 */
function montarMolduraIso(p: {
  corpo: string; titulo: string; codigo: string; revisao: number;
  dataEmissao: string; empresaNome: string; empresaCnpj: string; logoUrl: string | null;
}): string {
  const logo = p.logoUrl
    ? `<img src="${escHtml(p.logoUrl)}" alt="Logo" style="max-height:52px;max-width:150px;object-fit:contain"/>`
    : `<div style="font-weight:800;font-size:13pt;color:#0A1E3C;letter-spacing:.5px">${escHtml(p.empresaNome)}</div>`;
  return `<!--fc-moldura-iso-->
<table style="width:100%;border-collapse:collapse;border:1.5px solid #0A1E3C;margin-bottom:14px;font-family:Arial,Helvetica,sans-serif" role="presentation">
  <tr>
    <td style="border-right:1px solid #0A1E3C;padding:8px 12px;width:170px;text-align:center;vertical-align:middle">${logo}</td>
    <td style="border-right:1px solid #0A1E3C;padding:8px 12px;text-align:center;vertical-align:middle">
      <div style="font-size:12pt;font-weight:800;color:#0A1E3C;text-transform:uppercase;letter-spacing:.3px">${escHtml(p.titulo)}</div>
      <div style="font-size:7.5pt;color:#555;margin-top:2px">${escHtml(p.empresaNome)}${p.empresaCnpj ? " · CNPJ " + escHtml(p.empresaCnpj) : ""}</div>
    </td>
    <td style="padding:0;width:150px;vertical-align:middle">
      <table style="width:100%;border-collapse:collapse;font-size:7.5pt;color:#0A1E3C" role="presentation">
        <tr><td style="border-bottom:1px solid #0A1E3C;padding:3px 8px"><strong>Código:</strong> ${escHtml(p.codigo)}</td></tr>
        <tr><td style="border-bottom:1px solid #0A1E3C;padding:3px 8px"><strong>Revisão:</strong> ${String(p.revisao).padStart(2, "0")}</td></tr>
        <tr><td style="padding:3px 8px"><strong>Emissão:</strong> ${escHtml(p.dataEmissao)}</td></tr>
      </table>
    </td>
  </tr>
</table>
${p.corpo}
<div style="margin-top:22px;border-top:1.5px solid #0A1E3C;padding-top:8px;font-family:Arial,Helvetica,sans-serif">
  <p style="font-size:7pt;color:#555;text-align:justify;margin:0 0 4px 0"><strong>LGPD — Lei nº 13.709/2018:</strong> os dados pessoais contidos neste documento são tratados exclusivamente para o cumprimento de obrigações legais, contratuais e trabalhistas, com acesso restrito ao pessoal autorizado, pelo prazo exigido pela legislação. O titular pode exercer seus direitos (acesso, correção, eliminação) junto ao setor de Recursos Humanos da empresa.</p>
  <p style="font-size:7pt;color:#888;text-align:center;margin:0">${escHtml(p.codigo)} · Rev. ${String(p.revisao).padStart(2, "0")} · Documento controlado pelo Sistema de Gestão — cópia impressa ou digital fora do sistema é considerada NÃO CONTROLADA.</p>
</div>`;
}
