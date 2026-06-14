import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, createEmployee, getCompanyById, createAuditLog, getCompaniesForUser } from "../db";
import { recontratacaoSolicitacoes, employees, companies, systemCriteria, users } from "../../drizzle/schema";
import { and, eq, or, desc, isNull, inArray, notInArray, sql, ne } from "drizzle-orm";
import { EMPLOYEE_STATUS_DESLIGADOS } from "../../shared/modules";
import { sendEmail } from "../services/smtpService";
import { dispararNotificacao } from "../services/emailNotification";

// ============================================================
// RECONTRATAÇÃO (Rev. 2755)
// Fila de solicitações em STAGING com liberação do sócio (admin_master) ou
// suplentes configuráveis. NADA vira funcionário até a aprovação.
// ============================================================

const CHAVE_SUPLENTES = "recontratacao_aprovadores_suplentes";
// Rev. 3058 — sócios titulares (aprovadores automáticos) agora são CONFIGURÁVEIS.
// Lista de IDs de usuários em systemCriteria; vazio/ausente => fallback p/ todos admin_master (compat).
const CHAVE_SOCIOS_TITULARES = "recontratacao_socios_titulares";

function normalizar(s?: string | null): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function getCriterioValor(db: any, companyId: number, chave: string, fallback: string): Promise<string> {
  try {
    const rows = await db.select().from(systemCriteria)
      .where(and(eq(systemCriteria.companyId, companyId), eq(systemCriteria.chave, chave))).limit(1);
    const v = rows?.[0]?.valor;
    return (v === undefined || v === null || v === "") ? fallback : String(v);
  } catch { return fallback; }
}

async function getSuplenteIds(db: any, companyId: number): Promise<number[]> {
  const raw = await getCriterioValor(db, companyId, CHAVE_SUPLENTES, "[]");
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
  } catch { return []; }
}

// Todos os usuários com papel admin_master (fallback de compatibilidade).
async function getAdminMasterIds(db: any): Promise<number[]> {
  try {
    const rows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, "admin_master"), isNull(users.deletedAt)));
    return rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n));
  } catch { return []; }
}

// IDs dos sócios titulares (aprovadores automáticos). Se a empresa configurou uma
// lista NÃO-vazia, usa exatamente ela; senão cai no fallback = todos admin_master.
async function getSociosTitularesIds(db: any, companyId: number): Promise<number[]> {
  const raw = await getCriterioValor(db, companyId, CHAVE_SOCIOS_TITULARES, "");
  let configured: number[] = [];
  try {
    const arr = raw ? JSON.parse(raw) : [];
    configured = Array.isArray(arr) ? arr.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
  } catch { configured = []; }
  if (configured.length > 0) return configured;
  return await getAdminMasterIds(db);
}

async function isAprovador(db: any, ctx: any, companyId: number): Promise<boolean> {
  const uid = Number(ctx?.user?.id);
  const titulares = await getSociosTitularesIds(db, companyId);
  if (titulares.includes(uid)) return true;
  const suplentes = await getSuplenteIds(db, companyId);
  return suplentes.includes(uid);
}

// Rev. 2755 — Guard de tenancy: o servidor NUNCA confia no companyId/companyIds
// vindos do cliente. Resolve as empresas que o usuário pode acessar e bloqueia
// qualquer id fora desse conjunto (admin/admin_master têm acesso global).
async function assertAcessoEmpresas(ctx: any, companyIds: number[]): Promise<void> {
  const role = ctx?.user?.role;
  if (role === "admin_master" || role === "admin") return;
  const comps = await getCompaniesForUser(ctx.user.id, role);
  const permitidas = new Set(comps.map((c: any) => c.id));
  for (const id of companyIds) {
    if (!permitidas.has(id)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
    }
  }
}

// Rev. 2755 — Expande o grupo da empresa, mas intersecta com as empresas que o
// usuário pode acessar. Evita IDOR interempresa: um RH com acesso só à empresa A
// não enxerga desligados/PII de outra empresa do grupo. Admin tem grupo inteiro.
async function empresasGrupoPermitidas(ctx: any, db: any, companyId: number): Promise<number[]> {
  const grupoIds = await getCompanyIdsDoGrupo(db, companyId);
  const role = ctx?.user?.role;
  if (role === "admin_master" || role === "admin") return grupoIds;
  const comps = await getCompaniesForUser(ctx.user.id, role);
  const permitidas = new Set(comps.map((c: any) => c.id));
  return grupoIds.filter((id: number) => permitidas.has(id));
}

// Retorna os aprovadores (titulares admin_master + suplentes) com e-mail para alertas.
async function getAprovadores(db: any, companyId: number): Promise<Array<{ id: number; name: string; email: string }>> {
  const out = new Map<number, { id: number; name: string; email: string }>();
  try {
    const titularIds = await getSociosTitularesIds(db, companyId);
    if (titularIds.length > 0) {
      const titulares = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(and(inArray(users.id, titularIds), isNull(users.deletedAt)));
      for (const u of titulares) if (u.email) out.set(u.id, { id: u.id, name: u.name || "Sócio", email: u.email });
    }
  } catch { /* ignore */ }
  const suplentes = await getSuplenteIds(db, companyId);
  if (suplentes.length > 0) {
    try {
      const rows = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(and(inArray(users.id, suplentes), isNull(users.deletedAt)));
      for (const u of rows) if (u.email) out.set(u.id, { id: u.id, name: u.name || "Suplente", email: u.email });
    } catch { /* ignore */ }
  }
  return Array.from(out.values());
}

// Empresas do mesmo grupo empresarial (inclui a própria). Fallback = só a própria.
async function getCompanyIdsDoGrupo(db: any, companyId: number): Promise<number[]> {
  try {
    const [comp] = await db.select({ grupo: companies.grupoEmpresarial }).from(companies).where(eq(companies.id, companyId));
    const grupo = comp?.grupo;
    if (grupo && String(grupo).trim()) {
      const rows = await db.select({ id: companies.id }).from(companies)
        .where(and(eq(companies.grupoEmpresarial, grupo), isNull(companies.deletedAt)));
      const ids = rows.map((r: any) => r.id);
      return ids.length > 0 ? ids : [companyId];
    }
  } catch { /* ignore */ }
  return [companyId];
}

function diasEntre(dataIso?: string | null): number | null {
  if (!dataIso) return null;
  const d = new Date(dataIso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Computa as sinalizações jurídicas (experiência / carência) de um par funçãoNova x vínculo anterior.
function computarSinais(opts: {
  mesmaEmpresa: boolean;
  funcaoNova?: string | null;
  funcaoAnterior?: string | null;
  diasFora: number | null;
  carenciaDias: number;
  permitirExpFuncaoDif: boolean;
}): { mesmaFuncao: boolean; experienciaPermitida: boolean; alertaJuridico: string; dentroCarencia: boolean } {
  const mesmaFuncao = normalizar(opts.funcaoNova) !== "" && normalizar(opts.funcaoNova) === normalizar(opts.funcaoAnterior);
  let experienciaPermitida = true;
  let alertaJuridico = "";
  if (opts.mesmaEmpresa && mesmaFuncao) {
    experienciaPermitida = false;
    alertaJuridico = "⚠️ MESMA EMPRESA + MESMA FUNÇÃO: contrato de experiência é VEDADO (TST entende como fraude — Súmula 188 / art. 445 CLT). Recontrate por prazo INDETERMINADO.";
  } else if (opts.mesmaEmpresa && !mesmaFuncao) {
    experienciaPermitida = opts.permitirExpFuncaoDif;
    alertaJuridico = opts.permitirExpFuncaoDif
      ? "ℹ️ MESMA EMPRESA, FUNÇÃO DIFERENTE: experiência é admissível, desde que a nova função seja efetivamente distinta (atribuições, requisitos)."
      : "⚠️ MESMA EMPRESA, FUNÇÃO DIFERENTE: a empresa optou por NÃO permitir experiência nesta hipótese (critério configurável).";
  } else {
    experienciaPermitida = true;
    alertaJuridico = "ℹ️ OUTRA EMPRESA DO GRUPO: contrato de experiência é admissível (vínculo jurídico distinto). Atenção a sucessão/grupo econômico.";
  }
  const dentroCarencia = opts.diasFora !== null && opts.diasFora < opts.carenciaDias;
  if (dentroCarencia) {
    alertaJuridico += ` | ⏳ Dentro da carência (${opts.diasFora}d de ${opts.carenciaDias}d) — apenas alerta; a liberação do sócio é a autoridade final.`;
  }
  return { mesmaFuncao, experienciaPermitida, alertaJuridico, dentroCarencia };
}

export const recontratacaoRouter = router({
  // Verifica o CPF: existe ativo (bloqueia) / vínculo desligado na empresa ou no grupo.
  verificarCpf: protectedProcedure
    .input(z.object({ cpf: z.string(), companyId: z.number(), funcao: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await assertAcessoEmpresas(ctx, [input.companyId]);
      const cleanCpf = (input.cpf || "").replace(/\D/g, "");
      if (cleanCpf.length < 11) return { ok: true as const, vinculos: [], ativoMesmaEmpresa: null as any };

      const grupoIds = await empresasGrupoPermitidas(ctx, db, input.companyId);
      const rows = await db.select().from(employees).where(and(
        // Compara só os DÍGITOS dos dois lados: o cliente manda o CPF limpo, mas no
        // banco ele pode estar formatado ("362.506.888-54") ou limpo. Sem isto, um
        // funcionário ATIVO com CPF formatado não era detectado (caía em "CPF livre").
        sql`regexp_replace(${employees.cpf}, '[^0-9]', '', 'g') = ${cleanCpf}`,
        inArray(employees.companyId, grupoIds),
        isNull(employees.deletedAt),
      )).orderBy(desc(employees.dataDemissao));

      const carenciaDias = parseInt(await getCriterioValor(db, input.companyId, "recontratacao_carencia_dias", "90"), 10) || 90;
      const permitirExpFuncaoDif = (await getCriterioValor(db, input.companyId, "recontratacao_permitir_experiencia_funcao_diferente", "1")) === "1";

      // Nomes das empresas do grupo
      const compRows = await db.select({ id: companies.id, nome: companies.nomeFantasia, razao: companies.razaoSocial })
        .from(companies).where(inArray(companies.id, grupoIds));
      const nomeEmpresa = new Map<number, string>();
      for (const c of compRows) nomeEmpresa.set(c.id, c.nome || c.razao || `Empresa ${c.id}`);

      const ativoMesmaEmpresa = rows.find((r: any) =>
        r.companyId === input.companyId && !EMPLOYEE_STATUS_DESLIGADOS.includes(r.status)) || null;

      const vinculos = rows
        .filter((r: any) => EMPLOYEE_STATUS_DESLIGADOS.includes(r.status))
        .map((r: any) => {
          const mesmaEmpresa = r.companyId === input.companyId;
          const diasFora = diasEntre(r.dataDesligamentoEfetiva || r.dataDemissao);
          const sinais = computarSinais({
            mesmaEmpresa, funcaoNova: input.funcao, funcaoAnterior: r.funcao,
            diasFora, carenciaDias, permitirExpFuncaoDif,
          });
          return {
            employeeId: r.id,
            companyId: r.companyId,
            companyNome: nomeEmpresa.get(r.companyId) || "",
            codigoInterno: r.codigoInterno,
            nomeCompleto: r.nomeCompleto,
            funcaoAnterior: r.funcao,
            cargoAnterior: r.cargo,
            status: r.status,
            dataAdmissao: r.dataAdmissao,
            dataDesligamento: r.dataDesligamentoEfetiva || r.dataDemissao,
            motivoDesligamento: r.motivoDesligamento,
            categoriaDesligamento: r.categoriaDesligamento,
            listaNegra: r.listaNegra === 1,
            motivoListaNegra: r.motivoListaNegra,
            mesmaEmpresa,
            diasFora,
            carenciaDias,
            ...sinais,
          };
        });

      // Solicitação de recontratação PENDENTE já existente p/ este CPF no grupo:
      // evita duplicar a fila e informa "já está em processo de liberação".
      const pendRows = await db.select({
        id: recontratacaoSolicitacoes.id,
        companyId: recontratacaoSolicitacoes.companyId,
        nomeCompleto: recontratacaoSolicitacoes.nomeCompleto,
        createdAt: recontratacaoSolicitacoes.createdAt,
        solicitadoPor: recontratacaoSolicitacoes.solicitadoPor,
      }).from(recontratacaoSolicitacoes).where(and(
        sql`regexp_replace(${recontratacaoSolicitacoes.cpf}, '[^0-9]', '', 'g') = ${cleanCpf}`,
        inArray(recontratacaoSolicitacoes.companyId, grupoIds),
        eq(recontratacaoSolicitacoes.status, "pendente"),
      )).orderBy(desc(recontratacaoSolicitacoes.createdAt));
      const solicitacaoPendente = pendRows[0] ? {
        id: pendRows[0].id,
        companyId: pendRows[0].companyId,
        companyNome: nomeEmpresa.get(pendRows[0].companyId) || "",
        nomeCompleto: pendRows[0].nomeCompleto,
        createdAt: pendRows[0].createdAt,
        solicitadoPor: pendRows[0].solicitadoPor,
        mesmaEmpresa: pendRows[0].companyId === input.companyId,
      } : null;

      return {
        ok: !ativoMesmaEmpresa,
        ativoMesmaEmpresa: ativoMesmaEmpresa ? {
          employeeId: ativoMesmaEmpresa.id, nomeCompleto: ativoMesmaEmpresa.nomeCompleto, status: ativoMesmaEmpresa.status,
        } : null,
        vinculos,
        solicitacaoPendente,
      };
    }),

  // Dados do vínculo anterior para pré-preencher a ficha (blocos copiáveis).
  getDadosCopia: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await assertAcessoEmpresas(ctx, [input.companyId]);
      // Só permite copiar de um vínculo DESLIGADO/INATIVO do MESMO GRUPO E em uma
      // empresa que o usuário possa acessar — fecha enumeração de PII de
      // funcionários ativos/de outras empresas do grupo por id arbitrário.
      const grupoIds = await empresasGrupoPermitidas(ctx, db, input.companyId);
      const [emp] = await db.select().from(employees)
        .where(and(
          eq(employees.id, input.employeeId),
          inArray(employees.companyId, grupoIds),
          isNull(employees.deletedAt),
          inArray(employees.status, EMPLOYEE_STATUS_DESLIGADOS),
        ));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Vínculo anterior não encontrado" });
      return emp;
    }),

  // Cria a solicitação (STAGING). Não cria funcionário.
  criarSolicitacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ficha: z.any(),
      vinculoAnteriorEmployeeId: z.number().optional(),
      vinculoAnteriorCompanyId: z.number().optional(),
      blocosCopiados: z.array(z.string()).optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await assertAcessoEmpresas(ctx, [input.companyId]);
      const ficha = input.ficha || {};
      const cpf: string = ficha.cpf || "";
      const cleanCpf = cpf.replace(/\D/g, "");
      if (!ficha.nomeCompleto || cleanCpf.length < 11) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nome e CPF válidos são obrigatórios para a solicitação." });
      }

      // Bloqueia se já existe ativo com este CPF na empresa
      const ativos = await db.select({ id: employees.id, nome: employees.nomeCompleto }).from(employees).where(and(
        or(eq(employees.cpf, cpf), eq(employees.cpf, cleanCpf)),
        eq(employees.companyId, input.companyId), isNull(employees.deletedAt),
        notInArray(employees.status, EMPLOYEE_STATUS_DESLIGADOS),
      ));
      if (ativos.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um funcionário ATIVO com este CPF: ${ativos[0].nome}.` });
      }

      // Evita duplicar solicitação pendente
      const pendentes = await db.select({ id: recontratacaoSolicitacoes.id }).from(recontratacaoSolicitacoes).where(and(
        eq(recontratacaoSolicitacoes.companyId, input.companyId),
        or(eq(recontratacaoSolicitacoes.cpf, cpf), eq(recontratacaoSolicitacoes.cpf, cleanCpf)),
        eq(recontratacaoSolicitacoes.status, "pendente"),
      ));
      if (pendentes.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma solicitação de recontratação PENDENTE para este CPF." });
      }

      // Vínculo anterior + sinais jurídicos — OBRIGATÓRIO e VALIDADO no servidor:
      // recontratação só existe a partir de um vínculo DESLIGADO/INATIVO, do MESMO
      // GRUPO, com o MESMO CPF. Fecha solicitação forjada sem vínculo real.
      if (!input.vinculoAnteriorEmployeeId || !input.vinculoAnteriorCompanyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o vínculo anterior (funcionário desligado) para a recontratação." });
      }
      const grupoIds = await empresasGrupoPermitidas(ctx, db, input.companyId);
      if (!grupoIds.includes(input.vinculoAnteriorCompanyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O vínculo anterior não pertence ao grupo desta empresa ou está fora do seu acesso." });
      }
      const [vinc] = await db.select().from(employees).where(and(
        eq(employees.id, input.vinculoAnteriorEmployeeId),
        eq(employees.companyId, input.vinculoAnteriorCompanyId),
        isNull(employees.deletedAt),
        inArray(employees.status, EMPLOYEE_STATUS_DESLIGADOS),
      ));
      if (!vinc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vínculo anterior não encontrado ou não está desligado/inativo." });
      }
      const vincCpf = (vinc.cpf || "").replace(/\D/g, "");
      if (vincCpf !== cleanCpf) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O CPF informado não corresponde ao do vínculo anterior selecionado." });
      }
      const carenciaDias = parseInt(await getCriterioValor(db, input.companyId, "recontratacao_carencia_dias", "90"), 10) || 90;
      const permitirExpFuncaoDif = (await getCriterioValor(db, input.companyId, "recontratacao_permitir_experiencia_funcao_diferente", "1")) === "1";
      const prazoDias = parseInt(await getCriterioValor(db, input.companyId, "recontratacao_prazo_resolucao_dias", "30"), 10) || 30;

      const mesmaEmpresa = vinc ? vinc.companyId === input.companyId : true;
      const diasFora = vinc ? diasEntre(vinc.dataDesligamentoEfetiva || vinc.dataDemissao) : null;
      const sinais = computarSinais({
        mesmaEmpresa, funcaoNova: ficha.funcao, funcaoAnterior: vinc?.funcao,
        diasFora, carenciaDias, permitirExpFuncaoDif,
      });

      const prazoLimite = new Date(Date.now() + prazoDias * 24 * 60 * 60 * 1000).toISOString();

      const [sol] = await db.insert(recontratacaoSolicitacoes).values({
        companyId: input.companyId,
        cpf,
        nomeCompleto: String(ficha.nomeCompleto).toUpperCase(),
        funcao: ficha.funcao || null,
        vinculoAnteriorEmployeeId: vinc?.id ?? null,
        vinculoAnteriorCompanyId: vinc?.companyId ?? null,
        vinculoAnteriorCodigo: vinc?.codigoInterno ?? null,
        vinculoAnteriorFuncao: vinc?.funcao ?? null,
        vinculoAnteriorDesligamento: vinc?.dataDesligamentoEfetiva || vinc?.dataDemissao || null,
        mesmaEmpresa: mesmaEmpresa ? 1 : 0,
        mesmaFuncao: sinais.mesmaFuncao ? 1 : 0,
        diasFora: diasFora ?? null,
        experienciaPermitida: sinais.experienciaPermitida ? 1 : 0,
        alertaJuridico: sinais.alertaJuridico,
        carenciaDias,
        dentroCarencia: sinais.dentroCarencia ? 1 : 0,
        fichaJson: JSON.stringify(ficha),
        blocosCopiados: input.blocosCopiados ? JSON.stringify(input.blocosCopiados) : null,
        status: "pendente",
        prazoLimite,
        solicitadoPor: ctx.user.name ?? "Sistema",
        solicitadoPorId: ctx.user.id,
        observacaoSolicitante: input.observacao || null,
      }).returning();

      await createAuditLog({
        userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "CREATE", module: "recontratacao",
        entityType: "recontratacao_solicitacao", entityId: sol.id,
        details: `Solicitação de recontratação criada: ${ficha.nomeCompleto} (CPF ${cpf})`,
      });

      // Alerta por e-mail aos aprovadores (fire-and-forget)
      (async () => {
        try {
          const company = await getCompanyById(input.companyId);
          const aprovadores = await getAprovadores(db, input.companyId);
          if (aprovadores.length === 0) return;
          const titulo = `🔄 Recontratação aguardando liberação — ${ficha.nomeCompleto}`;
          const corpo = `Uma solicitação de RECONTRATAÇÃO foi registrada e aguarda sua liberação.\n\n` +
            `Candidato: ${ficha.nomeCompleto}\nCPF: ${cpf}\nFunção: ${ficha.funcao || "—"}\n` +
            `Empresa: ${company?.razaoSocial || company?.nomeFantasia || ""}\n` +
            `Solicitante: ${ctx.user.name ?? "Sistema"}\n` +
            (vinc ? `Vínculo anterior: ${vinc.codigoInterno || "—"} (desligado em ${vinc.dataDesligamentoEfetiva || vinc.dataDemissao || "—"}, ${diasFora ?? "—"} dias fora)\n` : "") +
            `\n${sinais.alertaJuridico}\n\nPrazo para resolução: ${new Date(prazoLimite).toLocaleDateString("pt-BR")}\n\n` +
            `Acesse o ERP > RH/DP > Recontratações Pendentes para liberar ou recusar.`;
          for (const a of aprovadores) {
            try { await sendEmail({ to: a.email, subject: titulo, text: corpo, html: corpo.replace(/\n/g, "<br>") }); } catch { /* ignore */ }
          }
        } catch (e) { console.error("[Recontratação] Erro ao alertar aprovadores:", e); }
      })();

      return { id: sol.id, prazoLimite, alertaJuridico: sinais.alertaJuridico, experienciaPermitida: sinais.experienciaPermitida };
    }),

  // Lista as solicitações (pendentes por padrão).
  listarSolicitacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      await assertAcessoEmpresas(ctx, ids);
      const conds: any[] = [inArray(recontratacaoSolicitacoes.companyId, ids)];
      if (input.status) conds.push(eq(recontratacaoSolicitacoes.status, input.status));
      const rows = await db.select().from(recontratacaoSolicitacoes)
        .where(and(...conds)).orderBy(desc(recontratacaoSolicitacoes.createdAt));
      return rows;
    }),

  // Indicador para badge/Home: contagem de pendentes.
  contarPendentes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { pendentes: 0 };
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      await assertAcessoEmpresas(ctx, ids);
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(recontratacaoSolicitacoes)
        .where(and(inArray(recontratacaoSolicitacoes.companyId, ids), eq(recontratacaoSolicitacoes.status, "pendente")));
      return { pendentes: Number(row?.n || 0) };
    }),

  // Aprova: cria o funcionário NOVO (número novo), ligado ao registro anterior por CPF.
  aprovar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), parecer: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      if (!(await isAprovador(db, ctx, input.companyId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o sócio (Admin Master) ou um suplente autorizado pode liberar recontratações." });
      }
      const [sol] = await db.select().from(recontratacaoSolicitacoes)
        .where(and(eq(recontratacaoSolicitacoes.id, input.id), eq(recontratacaoSolicitacoes.companyId, input.companyId)));
      if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
      if (sol.status !== "pendente") throw new TRPCError({ code: "CONFLICT", message: `Solicitação já está ${sol.status}.` });

      let ficha: any = {};
      try { ficha = JSON.parse(sol.fichaJson); } catch { ficha = {}; }
      // Garantir consistência: o funcionário novo nasce na empresa da solicitação, ativo, ligado ao anterior.
      delete ficha.id;
      delete ficha.codigoInterno; // gerado automaticamente
      const novo = await createEmployee({
        ...ficha,
        companyId: input.companyId,
        status: ficha.status && !EMPLOYEE_STATUS_DESLIGADOS.includes(ficha.status) ? ficha.status : "Ativo",
        listaNegra: 0,
        recontratadoDeEmployeeId: sol.vinculoAnteriorEmployeeId ?? null,
        recontratadoDeCompanyId: sol.vinculoAnteriorCompanyId ?? null,
        recontratadoData: new Date().toISOString(),
      } as any);

      await db.update(recontratacaoSolicitacoes).set({
        status: "aprovada",
        resolvidoPor: ctx.user.name ?? "Sistema",
        resolvidoPorId: ctx.user.id,
        resolvidoData: new Date().toISOString(),
        parecer: input.parecer || null,
        employeeCriadoId: novo.id,
        updatedAt: new Date().toISOString(),
      }).where(eq(recontratacaoSolicitacoes.id, input.id));

      await createAuditLog({
        userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "APPROVE", module: "recontratacao",
        entityType: "recontratacao_solicitacao", entityId: input.id,
        details: `Recontratação LIBERADA: ${sol.nomeCompleto} → ${novo.codigoInterno}`,
      });

      // Notificação de contratação (reaproveita o pipeline existente)
      (async () => {
        try {
          const company = await getCompanyById(input.companyId);
          await dispararNotificacao(input.companyId, "contratacao", {
            nome: sol.nomeCompleto, cpf: sol.cpf, funcao: ficha.funcao || "", setor: ficha.setor || "",
            empresa: company?.razaoSocial || company?.nomeFantasia || "", dataAdmissao: ficha.dataAdmissao || "",
            dataNascimento: ficha.dataNascimento || "", estadoCivil: ficha.estadoCivil || "", salario: ficha.salarioBase || "",
            employeeId: novo.id, statusAnterior: null as any, statusNovo: "Ativo",
          }, ctx.user.id, ctx.user.name ?? "Sistema");
        } catch (e) { console.error("[Recontratação] Erro ao notificar contratação:", e); }
      })();

      return { employeeId: novo.id, codigoInterno: novo.codigoInterno };
    }),

  // Recusa a solicitação.
  recusar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), motivo: z.string().min(3, "Informe o motivo da recusa") }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      if (!(await isAprovador(db, ctx, input.companyId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o sócio (Admin Master) ou um suplente autorizado pode recusar recontratações." });
      }
      const [sol] = await db.select().from(recontratacaoSolicitacoes)
        .where(and(eq(recontratacaoSolicitacoes.id, input.id), eq(recontratacaoSolicitacoes.companyId, input.companyId)));
      if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
      if (sol.status !== "pendente") throw new TRPCError({ code: "CONFLICT", message: `Solicitação já está ${sol.status}.` });

      await db.update(recontratacaoSolicitacoes).set({
        status: "recusada",
        resolvidoPor: ctx.user.name ?? "Sistema",
        resolvidoPorId: ctx.user.id,
        resolvidoData: new Date().toISOString(),
        parecer: input.motivo,
        updatedAt: new Date().toISOString(),
      }).where(eq(recontratacaoSolicitacoes.id, input.id));

      await createAuditLog({
        userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "REJECT", module: "recontratacao",
        entityType: "recontratacao_solicitacao", entityId: input.id,
        details: `Recontratação RECUSADA: ${sol.nomeCompleto} — ${input.motivo}`,
      });
      return { ok: true };
    }),

  // Indica se o usuário atual é aprovador (para mostrar/ocultar a tela de liberação).
  souAprovador: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { aprovador: false };
      try {
        await assertAcessoEmpresas(ctx, [input.companyId]);
      } catch {
        return { aprovador: false };
      }
      return { aprovador: await isAprovador(db, ctx, input.companyId) };
    }),

  // Suplentes (configuração) — leitura. Só o Admin Master enxerga a LISTA de
  // usuários (PII) p/ o picker; os demais recebem apenas os ids já configurados.
  getSuplentes: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { suplenteIds: [] as number[], usuarios: [] as any[], socioTitularIds: [] as number[], socioTitulares: [] as any[] };
      await assertAcessoEmpresas(ctx, [input.companyId]);
      const suplenteIds = await getSuplenteIds(db, input.companyId);
      const socioTitularIds = await getSociosTitularesIds(db, input.companyId);
      // Resolução só-leitura dos titulares (visível a todos os usuários autorizados da empresa).
      let socioTitulares: any[] = [];
      if (socioTitularIds.length > 0) {
        try {
          socioTitulares = await db.select({ id: users.id, name: users.name, email: users.email })
            .from(users).where(and(inArray(users.id, socioTitularIds), isNull(users.deletedAt))).orderBy(users.name);
        } catch { /* ignore */ }
      }
      if (ctx.user.role !== "admin_master") {
        return { suplenteIds, usuarios: [] as any[], socioTitularIds, socioTitulares };
      }
      const usuarios = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, username: users.username })
        .from(users).where(isNull(users.deletedAt)).orderBy(users.name);
      return { suplenteIds, usuarios, socioTitularIds, socioTitulares };
    }),

  // Suplentes (configuração) — gravação (somente admin_master).
  setSuplentes: protectedProcedure
    .input(z.object({ companyId: z.number(), suplenteIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Admin Master pode definir os suplentes de aprovação." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const valor = JSON.stringify(input.suplenteIds);
      const [existing] = await db.select({ id: systemCriteria.id }).from(systemCriteria)
        .where(and(eq(systemCriteria.companyId, input.companyId), eq(systemCriteria.chave, CHAVE_SUPLENTES)));
      if (existing) {
        await db.update(systemCriteria).set({ valor, atualizadoPor: ctx.user.name ?? "Sistema", updatedAt: new Date().toISOString() })
          .where(eq(systemCriteria.id, existing.id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId, categoria: "recontratacao", chave: CHAVE_SUPLENTES, valor,
          descricao: "IDs dos usuários suplentes autorizados a liberar recontratações", valorPadraoClt: "[]",
          unidade: "json", atualizadoPor: ctx.user.name ?? "Sistema",
        } as any);
      }
      await createAuditLog({
        userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "recontratacao",
        entityType: "config_suplentes", entityId: 0, details: `Suplentes de recontratação atualizados: [${input.suplenteIds.join(", ")}]`,
      });
      return { ok: true };
    }),

  // Sócios titulares (configuração) — gravação (somente admin_master). Rev. 3058.
  setSociosTitulares: protectedProcedure
    .input(z.object({ companyId: z.number(), socioTitularIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Admin Master pode definir os sócios titulares." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ids = Array.from(new Set(input.socioTitularIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))));
      const valor = JSON.stringify(ids);
      const [existing] = await db.select({ id: systemCriteria.id }).from(systemCriteria)
        .where(and(eq(systemCriteria.companyId, input.companyId), eq(systemCriteria.chave, CHAVE_SOCIOS_TITULARES)));
      if (existing) {
        await db.update(systemCriteria).set({ valor, atualizadoPor: ctx.user.name ?? "Sistema", updatedAt: new Date().toISOString() })
          .where(eq(systemCriteria.id, existing.id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId, categoria: "recontratacao", chave: CHAVE_SOCIOS_TITULARES, valor,
          descricao: "IDs dos usuários sócios titulares (aprovadores automáticos de recontratação)", valorPadraoClt: "[]",
          unidade: "json", atualizadoPor: ctx.user.name ?? "Sistema",
        } as any);
      }
      await createAuditLog({
        userId: ctx.user.id, userName: ctx.user.name ?? "Sistema", action: "UPDATE", module: "recontratacao",
        entityType: "config_socios_titulares", entityId: 0, details: `Sócios titulares de recontratação atualizados: [${ids.join(", ")}]`,
      });
      return { ok: true };
    }),

  // Card "Recontratados": funcionários com vínculo anterior (recontratado_de_*) no período.
  cardRecontratados: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dataInicio: z.string().optional(), dataFim: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { total: 0, lista: [] as any[] };
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      await assertAcessoEmpresas(ctx, ids);
      const conds: any[] = [
        inArray(employees.companyId, ids),
        isNull(employees.deletedAt),
        sql`${employees.recontratadoDeEmployeeId} IS NOT NULL`,
      ];
      if (input.dataInicio) conds.push(sql`${employees.recontratadoData} >= ${input.dataInicio}`);
      if (input.dataFim) conds.push(sql`${employees.recontratadoData} <= ${input.dataFim}`);
      const rows = await db.select({
        id: employees.id, nomeCompleto: employees.nomeCompleto, codigoInterno: employees.codigoInterno,
        cpf: employees.cpf, funcao: employees.funcao, companyId: employees.companyId, status: employees.status,
        recontratadoData: employees.recontratadoData, recontratadoDeEmployeeId: employees.recontratadoDeEmployeeId,
        recontratadoDeCompanyId: employees.recontratadoDeCompanyId,
      }).from(employees).where(and(...conds)).orderBy(desc(employees.recontratadoData));

      // Enriquecer com o registro anterior (tempo fora)
      const anterioresIds = rows.map((r: any) => r.recontratadoDeEmployeeId).filter(Boolean);
      const anteriores = new Map<number, any>();
      if (anterioresIds.length > 0) {
        const ant = await db.select({ id: employees.id, codigoInterno: employees.codigoInterno, dataDesligamento: employees.dataDesligamentoEfetiva, dataDemissao: employees.dataDemissao })
          .from(employees).where(inArray(employees.id, anterioresIds));
        for (const a of ant) anteriores.set(a.id, a);
      }
      const lista = rows.map((r: any) => {
        const ant = r.recontratadoDeEmployeeId ? anteriores.get(r.recontratadoDeEmployeeId) : null;
        const desligamento = ant?.dataDesligamento || ant?.dataDemissao || null;
        let tempoForaDias: number | null = null;
        if (desligamento && r.recontratadoData) {
          const d1 = new Date(desligamento).getTime();
          const d2 = new Date(r.recontratadoData).getTime();
          if (!isNaN(d1) && !isNaN(d2)) tempoForaDias = Math.max(0, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
        }
        return { ...r, codigoAnterior: ant?.codigoInterno || null, desligamentoAnterior: desligamento, tempoForaDias };
      });
      return { total: lista.length, lista };
    }),
});
