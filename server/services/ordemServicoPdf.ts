// ============================================================================
// Rev. 4667 — ORDEM DE SERVIÇO (OS / NR-01) DIGITAL EM PDF (server-side)
// Gera a OS por colaborador juntando o que o sistema já tem:
//   - Dados do colaborador (nome, CPF, função, nascimento, admissão)
//   - Texto da OS cadastrado na FUNÇÃO (job_functions.ordemServico)
//   - EPIs realmente entregues ao colaborador, com C.A.
//   - Treinamentos registrados (mais recente por norma)
//   - Assinatura digital do colaborador (epi_assinaturas, tipo 'ordem_servico')
// Mesma infra da Ficha de EPI Digital (puppeteer, imagens como data URI,
// requests externos bloqueados). Entra no Dossiê ZIP em 001.4.
// ============================================================================
import { getDb } from "../db";
import { epis, epiDeliveries, epiAssinaturas, employees, companies, jobFunctions, trainings } from "../../drizzle/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { dbRetrieve } from "../storage";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s);
}
function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const s = String(v);
  const d = fmtDate(s);
  const hm = s.match(/[T ](\d{2}):(\d{2})/);
  return hm ? `${d} ${hm[1]}:${hm[2]}` : d;
}
function fmtCpf(v?: string | null): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v || "");
}

// SSRF-safe: só resolve /uploads internos ou data: URIs (memória comprovante-fetch-ssrf)
async function imgDataUri(url?: string | null): Promise<string> {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^data:image\//i.test(u)) return u;
  try {
    const m = u.match(/^\/uploads\/([^?]+)/);
    if (m) {
      const r = await dbRetrieve(decodeURIComponent(m[1]));
      if (r) return `data:${r.contentType || "image/png"};base64,${r.buffer.toString("base64")}`;
    }
  } catch { /* sem imagem */ }
  return "";
}

const TERMO_CIENCIA = "Recebi a Ordem de Serviço de mesmo teor desta, que agora assino, referente às minhas funções, elaborada atendendo à legislação trabalhista em vigor (NR-01, item 1.7, letra \"b\", da Portaria 3.214/78), a qual cumprirei. Tomo ciência de que esta OS poderá sofrer alterações e revisões, e que o não cumprimento de qualquer item implica em punição de acordo com a legislação trabalhista e as normas da empresa.";

export interface OsData {
  funcionario: { id: number; nomeCompleto: string | null; cpf: string | null; funcao: string | null; dataNascimento: string | null; dataAdmissao: string | null };
  empresa: { razaoSocial: string | null; cnpj: string | null } | null;
  textoOs: string | null;
  descricaoFuncao: string | null;
  cbo: string | null;
  episEntregues: Array<{ nome: string | null; ca: string | null }>;
  treinamentos: Array<{ norma: string | null; nome: string | null; dataRealizacao: string | null }>;
  assinatura: { assinaturaUrl: string; assinadoEm: string | null; ipAddress: string | null; hashSha256: string | null } | null;
}

/** Coleta os dados da OS de um funcionário. Guard de tenant é do CHAMADOR. */
export async function coletarDadosOs(companyId: number, employeeId: number): Promise<OsData | null> {
  const db = (await getDb())!;

  const [emp] = await db.select({
    id: employees.id, nomeCompleto: employees.nomeCompleto, cpf: employees.cpf,
    funcao: employees.funcao, dataNascimento: employees.dataNascimento, dataAdmissao: employees.dataAdmissao,
    empregadorDocumentos: (employees as any).empregadorDocumentos,
  }).from(employees).where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)));
  if (!emp) return null;

  let [empresa] = await db.select({ razaoSocial: companies.razaoSocial, cnpj: companies.cnpj, logoUrl: companies.logoUrl })
    .from(companies).where(eq(companies.id, companyId));

  // Rev. 5044 — empregador documental "JF": a OS sai com os dados da JULIO
  // FERRAZ (inclui soft-deletada; mesmo grupo empresarial). Só exibição —
  // companyId de consultas/EPIs/treinamentos continua o da empresa dona.
  if ((emp as any)?.empregadorDocumentos === "JF") {
    const [jf] = await db.select({ razaoSocial: companies.razaoSocial, cnpj: companies.cnpj, logoUrl: companies.logoUrl })
      .from(companies)
      .where(and(
        sql`${companies.cnpj} LIKE '03.426.403%'`,
        sql`${companies.grupoEmpresarial} IS NOT DISTINCT FROM (SELECT c2."grupoEmpresarial" FROM companies c2 WHERE c2.id = ${companyId})`,
      ))
      .orderBy(sql`(${companies.deletedAt} IS NULL) DESC`, companies.id);
    if (jf) empresa = jf;
  }

  // Texto da OS cadastrado na função (match por nome, case-insensitive)
  let textoOs: string | null = null, descricaoFuncao: string | null = null, cbo: string | null = null;
  if ((emp.funcao || "").trim()) {
    const [fn] = await db.select({ ordemServico: jobFunctions.ordemServico, descricao: jobFunctions.descricao, cbo: jobFunctions.cbo })
      .from(jobFunctions)
      .where(and(
        eq(jobFunctions.companyId, companyId),
        isNull(jobFunctions.deletedAt),
        sql`LOWER(TRIM(${jobFunctions.nome})) = LOWER(TRIM(${emp.funcao}))`,
      )).limit(1);
    textoOs = fn?.ordemServico || null;
    descricaoFuncao = fn?.descricao || null;
    cbo = fn?.cbo || null;
  }

  // EPIs entregues (distintos, com CA)
  const entregas = await db.select({ nome: epis.nome, ca: epis.ca })
    .from(epiDeliveries)
    .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
    .where(and(
      eq(epiDeliveries.companyId, companyId),
      eq(epiDeliveries.employeeId, employeeId),
      isNull(epiDeliveries.deletedAt),
    ));
  const vistos = new Set<string>();
  const episEntregues = entregas.filter(e => {
    const k = `${(e.nome || "").toUpperCase()}|${e.ca || ""}`;
    if (!e.nome || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // Treinamentos — mais recente por norma
  const trAll = await db.select({ norma: trainings.norma, nome: trainings.nome, dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade })
    .from(trainings).where(and(eq(trainings.employeeId, employeeId), isNull(trainings.deletedAt)));
  const porNorma = new Map<string, typeof trAll[0]>();
  for (const t of trAll) {
    const k = String(t.norma || t.nome || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "SEM";
    const atual = porNorma.get(k);
    if (!atual || String(t.dataValidade || "") > String(atual.dataValidade || "")) porNorma.set(k, t);
  }
  const treinamentos = [...porNorma.values()].sort((a, b) => String(a.norma || "").localeCompare(String(b.norma || "")));

  // Assinatura digital da OS (mais recente)
  const [assin] = await db.select({
    assinaturaUrl: epiAssinaturas.assinaturaUrl, assinadoEm: epiAssinaturas.assinadoEm,
    ipAddress: epiAssinaturas.ipAddress, hashSha256: epiAssinaturas.hashSha256,
  }).from(epiAssinaturas)
    .where(and(
      eq(epiAssinaturas.companyId, companyId),
      eq(epiAssinaturas.employeeId, employeeId),
      eq(epiAssinaturas.tipo, "ordem_servico"),
    ))
    .orderBy(desc(epiAssinaturas.assinadoEm), desc(epiAssinaturas.id))
    .limit(1);

  return {
    funcionario: emp,
    empresa: empresa ? { razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj } : null,
    textoOs, descricaoFuncao, cbo,
    episEntregues,
    treinamentos,
    assinatura: assin || null,
    // logoUrl vai só pro HTML (não exposto no tipo público)
    ...( { _logoUrl: empresa?.logoUrl || "" } as any),
  };
}

// ── Rev. 5044 — Parser do texto da OS cadastrado na função ──────────────────
// O texto livre da função costuma vir com marcadores conhecidos ("Riscos
// Ocupacionais Identificados:", "Físicos:", "Medidas de Prevenção...", etc.).
// Extraímos as seções para o layout visual (modelo do TST); o que não for
// reconhecido cai no fallback (texto integral).
const OS_SECOES = [
  { key: "atividades", re: /Descri[cç][aã]o das Atividades( e Procedimentos de Trabalho)?\s*:/i },
  { key: "riscos", re: /Riscos Ocupacionais( Identificados)?\s*:/i },
  { key: "medidas", re: /Medidas de Preven[cç][aã]o( e Controle)?\s*:/i },
  { key: "episObrig", re: /EPIs? Obrigat[oó]rios?( para a Fun[cç][aã]o)?\s*:/i },
  { key: "emergencia", re: /Procedimentos? em Caso de Emerg[eê]ncia\s*:/i },
  { key: "nrs", re: /Normas Regulamentadoras( Aplic[aá]veis)?\s*:/i },
  { key: "obrigacoes", re: /Obriga[cç][oõ]es do Trabalhador( Quanto [aà] Seguran[cç]a)?\s*:/i },
] as const;

function parseTextoOs(texto: string): Record<string, string> {
  const hits: Array<{ key: string; start: number; bodyStart: number }> = [];
  for (const s of OS_SECOES) {
    const m = s.re.exec(texto);
    if (m) hits.push({ key: s.key, start: m.index, bodyStart: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Record<string, string> = {};
  for (let i = 0; i < hits.length; i++) {
    const fim = i + 1 < hits.length ? hits[i + 1].start : texto.length;
    out[hits[i].key] = texto.slice(hits[i].bodyStart, fim).trim().replace(/[.;,\s]+$/, "");
  }
  return out;
}

// Dentro do bloco de riscos, destaca cada categoria em linha própria.
const RISCO_CATS = [
  { label: "Risco Físico", re: /F[ií]sicos?\s*:/i },
  { label: "Risco Químico", re: /Qu[ií]micos?\s*:/i },
  { label: "Risco Biológico", re: /Biol[oó]gicos?\s*:/i },
  { label: "Risco Ergonômico", re: /Ergon[oô]micos?\s*:/i },
  { label: "Risco de Acidente", re: /(De\s+)?Acidentes?\s*:/i },
  // Rev. 5044 — NR-01 (1.5.3.1.1) inclui riscos psicossociais
  { label: "Risco Psicossocial", re: /Psicossociais?\s*:/i },
] as const;

function parseRiscos(bloco: string): Array<{ label: string; texto: string }> {
  const hits: Array<{ label: string; start: number; bodyStart: number }> = [];
  let cursor = 0;
  for (const c of RISCO_CATS) {
    const m = c.re.exec(bloco.slice(cursor));
    if (m) {
      hits.push({ label: c.label, start: cursor + m.index, bodyStart: cursor + m.index + m[0].length });
      cursor = cursor + m.index + m[0].length; // categorias vêm em ordem no texto padrão
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits.map((h, i) => ({
    label: h.label,
    texto: bloco.slice(h.bodyStart, i + 1 < hits.length ? hits[i + 1].start : bloco.length).trim().replace(/[.;,\s]+$/, ""),
  }));
}

// Textos fixos do modelo do TST (seções sem fonte estruturada no ERP)
const EPC_TEXTO = "Usar as medidas de proteção coletiva que forem determinadas para o desenvolvimento de suas atividades. Essas medidas serão determinadas e divulgadas através da APR (Análise Preliminar de Risco) das atividades.";
const PROIBICOES = [
  "É proibido realizar a operação na ocorrência de falta de qualquer EPI e/ou EPC relacionados;",
  "É proibido realizar a operação na ocorrência de condição anormal de trabalho;",
  "É proibido realizar qualquer operação utilizando adornos, tais como: anéis, pulseiras ou outros adornos pessoais;",
  "É proibido utilizar jato de ar comprimido para limpeza pessoal;",
  "Durante o expediente e deslocamentos (da casa ao trabalho e vice-versa) evitar correrias, brincadeiras ou atitudes incompatíveis com o bom relacionamento interpessoal.",
];
const PROC_ACIDENTE = [
  "Comunicar imediatamente ao mestre de obra e/ou Técnico de Segurança do Trabalho, procurando fornecer todas as informações solicitadas;",
  "Prestar primeiros socorros ao acidentado somente se for apto para este procedimento;",
  "Somente remover o acidentado com ferimento grave com autorização do brigadista e/ou socorrista (pessoa treinada e habilitada para prestar primeiros socorros);",
  "Isolar e manter afastadas do local do acidente pessoas estranhas às ações de socorro;",
  "Efetuar o isolamento do local do acidente com orientação do brigadista e/ou Cipeiro e/ou Técnico de Segurança.",
];
const DECLARACAO = "DECLARO ter recebido informações, orientações, treinamento e uma cópia desta Ordem de Serviço, para permitir a execução de trabalho seguro nas minhas atividades. DECLARO também estar ciente de que a não obediência das normas estabelecidas neste documento poderá sujeitar-me às penalidades disciplinares definidas no Regulamento Interno da Empresa e dispositivos legais aplicáveis.";
const AVISO_FINAL = "As orientações aqui contidas não esgotam o assunto sobre prevenção de acidentes, devendo ser observadas todas as instruções existentes, ainda que verbais, e em especial as Normas Regulamentadoras da Empresa. Não executar quaisquer atividades sem treinamento e pleno conhecimento dos riscos e cuidados a serem observados. O não cumprimento desta Ordem de Serviço será passível das punições previstas na NR-01, item 1.8.";

// Rev. 5044 — assinaturas coletadas no fluxo de Treinamentos (dialog de
// assinaturas): dataURLs de canvas. Colaborador só é usado quando NÃO há
// assinatura digital de EPI (que tem hash/IP e prevalece).
export interface OsSigs {
  colaborador?: string | null;
  instrutor?: string | null;
  instrutorNome?: string | null;
}

const sigDataUri = (s?: string | null) =>
  s && /^data:image\/(png|jpe?g|webp);base64,/i.test(s) && s.length < 2_000_000 ? s : null;

async function montarHtmlOs(companyId: number, employeeId: number, sigs?: OsSigs): Promise<string | null> {
  const d = await coletarDadosOs(companyId, employeeId);
  if (!d) return null;
  // Sem texto de OS na função E sem EPIs → não há o que emitir
  if (!(d.textoOs || "").trim() && d.episEntregues.length === 0) return null;

  const [logoUri, sigUri] = await Promise.all([
    imgDataUri((d as any)._logoUrl),
    imgDataUri(d.assinatura?.assinaturaUrl),
  ]);

  const texto = (d.textoOs || "").trim();
  const sec = texto ? parseTextoOs(texto) : {};
  const riscos = sec.riscos ? parseRiscos(sec.riscos) : [];

  const epiRows = d.episEntregues.map(e =>
    `<tr><td>${esc(e.nome)}</td><td class="c">${esc(e.ca || "—")}</td></tr>`).join("");
  const trRows = d.treinamentos.map(t =>
    `<tr><td class="c">${esc(t.norma || "—")}</td><td>${esc(t.nome || "—")}</td><td class="c">${fmtDate(t.dataRealizacao) || "—"}</td></tr>`).join("");

  // Rev. 5044 — o texto da função costuma vir com markdown (** negrito, * item);
  // converte para HTML real e descarta artefatos (linhas só com "**" ou "**4").
  const brl = (s: string) => {
    const linhas = String(s).split(/\r?\n/)
      .filter(l => !/^\s*\*+\s*\d*\s*$/.test(l)); // remove "*", "**", "**4", "**5"…
    const html = linhas.map(l => {
      let t = esc(l);
      t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); // **negrito**
      t = t.replace(/^(\s*)\*\s+/, "$1&bull; ");        // "* item" → "• item"
      t = t.replace(/\*\*/g, "");                        // ** órfãos restantes
      return t;
    });
    return html.join("<br/>");
  };
  const numLista = (itens: string[]) => `<ol>${itens.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;

  // II — riscos destacados por categoria (fallback: bloco/texto integral)
  const riscosHtml = riscos.length > 0
    ? riscos.map(r => `<div class="risco"><span class="rl">${esc(r.label)}:</span> ${brl(r.texto || "N/A")}</div>`).join("")
    : (sec.riscos ? `<div class="risco">${brl(sec.riscos)}</div>` : `<div class="risco"><i>Riscos não descritos no cadastro da função.</i></div>`);

  // I texto de atividades (parsed) ou texto integral da OS quando não reconhecido
  const atividadesHtml = sec.atividades ? brl(sec.atividades)
    : (texto && !sec.riscos ? brl(texto) : (d.descricaoFuncao ? brl(d.descricaoFuncao) : `<i>Função sem descrição de atividades cadastrada. Cadastre em Recursos Humanos &rarr; Funções.</i>`));

  const sigColabTrein = sigDataUri(sigs?.colaborador);
  const sigInstrTrein = sigDataUri(sigs?.instrutor);
  const sigImg = (uri: string) => `<img src="${uri}" alt="assinatura" style="height:40px;max-width:200px;object-fit:contain;display:block;margin:0 auto"/>`;
  const assinaturaBloco = d.assinatura
    ? `${sigImg(sigUri!)}
       <div class="aut">Assinado digitalmente em ${esc(fmtDateTime(d.assinatura.assinadoEm))}${d.assinatura.ipAddress ? ` · IP ${esc(d.assinatura.ipAddress)}` : ""}${d.assinatura.hashSha256 ? `<br/>SHA-256 ${esc(String(d.assinatura.hashSha256).slice(0, 24))}…` : ""}</div>`
    : sigColabTrein
      ? `${sigImg(sigColabTrein)}<div style="border-top:1px solid #333;padding-top:3px">Assinatura do Colaborador</div>`
      : `<div style="border-top:1px solid #333;margin-top:34px;padding-top:3px">Assinatura do Colaborador</div>`;
  const assinaturaInstrBloco = sigInstrTrein
    ? `${sigImg(sigInstrTrein)}<div style="border-top:1px solid #333;padding-top:3px">Responsável / Técnico de Segurança do Trabalho${sigs?.instrutorNome ? `<br/>${esc(sigs.instrutorNome)}` : ""}</div>`
    : `<div style="border-top:1px solid #333;margin-top:34px;padding-top:3px">Responsável / Técnico de Segurança do Trabalho</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .top { border: 1.5px solid #0A1E3C; }
  .titulo { background: #0A1E3C; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 8px; display: flex; align-items: center; min-height: 34px; }
  .titulo .logobox { width: 110px; flex: 0 0 110px; } .titulo .logobox img { background:#fff;border-radius:3px;padding:2px 5px;max-height:24px;max-width:100px;object-fit:contain;display:block; }
  .titulo .t { flex: 1; text-align: center; line-height: 1.3; } .titulo .t small { display:block;font-size:8px;font-weight:normal;opacity:.85 }
  .titulo .sp { width: 110px; flex: 0 0 110px; text-align:right; font-size:8px; font-weight:normal; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
  .grid div { padding: 4px 6px; border-bottom: 1px solid #ccd; font-size: 10px; } .grid b { color: #0A1E3C; }
  h3 { background:#0A1E3C;color:#fff;font-size:10px;padding:3px 8px;margin:10px 0 0;letter-spacing:.5px }
  .box { border:1px solid #99a;border-top:0;padding:7px 8px;font-size:9.5px;text-align:justify;line-height:1.5 }
  .risco { padding:3px 0; border-bottom:1px dashed #dde; } .risco:last-child { border-bottom:0 }
  .rl { display:inline-block; background:#eef1f7; color:#0A1E3C; font-weight:bold; border:1px solid #c5cede; border-radius:3px; padding:1px 6px; margin-right:4px; font-size:9px }
  ol { margin:2px 0 2px 18px; padding:0 } ol li { margin:2px 0 }
  table { width:100%;border-collapse:collapse } th { background:#eef1f7;color:#0A1E3C;font-size:9px;padding:3px;border:1px solid #99a }
  td { border:1px solid #99a;padding:3px 5px;font-size:9.5px } td.c { text-align:center }
  .assin { display:flex;gap:24px;margin-top:16px } .assin > div { flex:1;text-align:center;font-size:9px }
  .aut { font-size:7px;color:#555;margin-top:2px;line-height:1.3 }
  .aviso { margin-top:10px;font-size:8.5px;color:#333;border:1px solid #99a;padding:6px 8px;background:#fffbea;line-height:1.5;text-align:center;font-weight:bold }
  .rodape { margin-top:10px;font-size:8.5px;color:#333;border:1px solid #99a;padding:6px 8px;background:#f8fafc;line-height:1.5 }
  .footer { margin-top:8px;display:flex;justify-content:space-between;font-size:8px;color:#777 }
</style></head><body>
<div class="top">
  <div class="titulo">
    <div class="logobox">${logoUri ? `<img src="${logoUri}" alt="logo"/>` : ""}</div>
    <span class="t">ORDEM DE SERVIÇO DE SEGURANÇA DO TRABALHO<small>Conforme item 1.7, letra "b", NR-01 da Portaria 3.214/78</small></span>
    <div class="sp">REVISÃO: 00</div>
  </div>
  <div class="grid">
    <div><b>EMPRESA:</b> ${esc(d.empresa?.razaoSocial || "")}</div>
    <div><b>CNPJ:</b> ${esc(d.empresa?.cnpj || "")}</div>
    <div><b>NOME:</b> ${esc(d.funcionario.nomeCompleto)}</div>
    <div><b>CPF:</b> ${esc(fmtCpf(d.funcionario.cpf))}</div>
    <div><b>FUNÇÃO:</b> ${esc(d.funcionario.funcao || "—")}${d.cbo ? ` &nbsp; <b>CBO:</b> ${esc(d.cbo)}` : ""}</div>
    <div>${d.funcionario.dataNascimento ? `<b>DATA DE NASC.:</b> ${fmtDate(d.funcionario.dataNascimento)} &nbsp; ` : ""}${d.funcionario.dataAdmissao ? `<b>ADMISSÃO:</b> ${fmtDate(d.funcionario.dataAdmissao)}` : ""}</div>
  </div>
</div>

<h3>I — ATIVIDADE OPERACIONAL: ${esc((d.funcionario.funcao || "").toUpperCase() || "—")}</h3>
<div class="box">${atividadesHtml}</div>

<h3>II — RISCOS OCUPACIONAIS</h3>
<div class="box">${riscosHtml}</div>

<h3>III — EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL (EPIs ENTREGUES)</h3>
${d.episEntregues.length > 0
  ? `<table><thead><tr><th>EPI</th><th style="width:90px">C.A.</th></tr></thead><tbody>${epiRows}</tbody></table>`
  : `<div class="box">${sec.episObrig ? brl(sec.episObrig) : "<i>Nenhum EPI entregue registrado.</i>"}</div>`}

<h3>IV — EQUIPAMENTOS DE PROTEÇÃO COLETIVA (EPC)</h3>
<div class="box">${esc(EPC_TEXTO)}</div>

${sec.medidas ? `<h3>V — MEDIDAS DE PREVENÇÃO E PRECAUÇÕES</h3><div class="box">${brl(sec.medidas)}</div>` : ""}

<h3>${sec.medidas ? "VI" : "V"} — PROIBIÇÕES</h3>
<div class="box">${numLista(PROIBICOES)}</div>

<h3>${sec.medidas ? "VII" : "VI"} — PROCEDIMENTOS EM CASO DE ACIDENTE DE TRABALHO</h3>
<div class="box">${sec.emergencia ? brl(sec.emergencia) : numLista(PROC_ACIDENTE)}</div>

${d.treinamentos.length > 0 ? `<h3>TREINAMENTOS REALIZADOS</h3>
<table><thead><tr><th style="width:70px">Norma</th><th>Treinamento</th><th style="width:80px">Realização</th></tr></thead><tbody>${trRows}</tbody></table>` : ""}

<h3>${sec.medidas ? "VIII" : "VII"} — DECLARAÇÃO DO TRABALHADOR / TERMO DE CIÊNCIA</h3>
<div class="box">${esc(DECLARACAO)}<br/><br/>${esc(TERMO_CIENCIA)}</div>

<div class="aviso">${esc(AVISO_FINAL)}</div>

<div class="assin">
  <div>${assinaturaBloco}</div>
  <div>${assinaturaInstrBloco}</div>
</div>

${d.assinatura ? `<div class="rodape"><b>AUTENTICAÇÃO DIGITAL:</b> A assinatura desta Ordem de Serviço foi coletada eletronicamente, com registro de data/hora, endereço IP e hash criptográfico SHA-256 da imagem da assinatura, garantindo integridade e autenticidade nos termos da MP 2.200-2/2001 (ICP-Brasil) e NR-01 do MTE.</div>` : ""}
<div class="footer"><span>ERP Gestão Integrada — Ordem de Serviço Digital (NR-01)</span><span>Emitido em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>
</body></html>`;
}

export async function launchBrowser() {
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function pdfFromHtml(browser: any, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on("request", (req: any) => { req.url().startsWith("data:") || req.url() === "about:blank" ? req.continue() : req.abort(); });
    await page.setContent(html, { waitUntil: "load" });
    const raw = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", right: "12mm", bottom: "12mm", left: "12mm" } });
    return Buffer.from(raw);
  } finally {
    await page.close().catch(() => {});
  }
}

/** PDF da OS de UM funcionário. null se não houver conteúdo. Tenant guard é do CHAMADOR. */
export async function gerarOrdemServicoPdf(companyId: number, employeeId: number, sigs?: OsSigs): Promise<Buffer | null> {
  const html = await montarHtmlOs(companyId, employeeId, sigs);
  if (!html) return null;
  const browser = await launchBrowser();
  try {
    return await pdfFromHtml(browser, html);
  } finally {
    await browser.close();
  }
}

/** OS de vários funcionários com UM Chromium (dossiê ZIP em lote). */
export async function gerarOrdensServicoPdfLote(
  companyId: number,
  employeeIds: number[],
  onPdf: (employeeId: number, buf: Buffer) => void | Promise<void>,
): Promise<void> {
  if (employeeIds.length === 0) return;
  let browser: any = null;
  try {
    for (const id of employeeIds) {
      try {
        const html = await montarHtmlOs(companyId, id);
        if (!html) continue;
        if (!browser) browser = await launchBrowser();
        await onPdf(id, await pdfFromHtml(browser, html));
      } catch (e) {
        console.warn(`[OrdemServicoPdf] Falha ao gerar OS emp=${id}:`, e);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
