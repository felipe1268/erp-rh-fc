/**
 * Rev. 5042 — VALE TRANSPORTE (RH)
 *
 * Controle mensal (jan-dez) do benefício de vale-transporte:
 * - Seleciona os funcionários que recebem o benefício (sugestão: cadastro
 *   vtRecebe/vtValorDiario) e lança dias trabalhados × valor da passagem/dia.
 * - Total do mês = soma de todos os colaboradores lançados.
 * - Ciclo: aberto → consolidado → enviado ao Financeiro (título ÚNICO no
 *   Contas a Pagar, origem_modulo='vale_transporte', com a relação de
 *   colaboradores na descrição de origem e o boleto anexado).
 * - Anexo do boleto (PDF/JPEG/PNG/DOC) via storagePut; propagado ao título.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, getUserCompanyLinks } from "../db";
import { vtMeses, vtLancamentos, employees } from "../../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { storagePut } from "../storage";

function parseBRL(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, "");
  if (/,/.test(s)) return Math.round((parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0) * 100) / 100;
  // sem vírgula: "4.50" = decimal; "3.000" = milhar
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, "")) || 0;
  return Math.round((parseFloat(s) || 0) * 100) / 100;
}
function formatBRL(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  // Deny-by-default: usuário sem vínculo algum não acessa empresa nenhuma.
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

/** Lista de anexos [{url,nome}] do mês (fallback pro anexo único legado). */
function anexosOf(m: any): Array<{ url: string; nome: string }> {
  try {
    const a = JSON.parse(m?.anexosJson || "[]");
    if (Array.isArray(a) && a.length > 0) return a.filter((x: any) => x?.url);
  } catch { /* ignore */ }
  return m?.anexoUrl ? [{ url: m.anexoUrl, nome: m.anexoNome ?? "Boleto" }] : [];
}

/** Grava a lista no mês (mantém anexoUrl/anexoNome = 1º p/ compat) e espelha no título. */
async function salvarAnexos(db: any, companyId: number, m: any, lista: Array<{ url: string; nome: string }>) {
  const first = lista[0] ?? null;
  const json = JSON.stringify(lista);
  await db.update(vtMeses).set({
    anexosJson: json, anexoUrl: first?.url ?? null, anexoNome: first?.nome?.slice(0, 255) ?? null, updatedAt: sql`NOW()` as any,
  } as any).where(and(eq(vtMeses.id, m.id), eq(vtMeses.companyId, companyId)));
  if (m.entryId) {
    await db.execute(sql`
      UPDATE financial_entries SET anexo_url = ${first?.url ?? null}, anexo_nome = ${first?.nome?.slice(0, 255) ?? null}, anexos_json = ${json}, updated_at = NOW()
      WHERE id = ${m.entryId} AND company_id = ${companyId}
    `);
  }
}

/** Taxas administrativas [{descricao,valor}] do mês (1 por boleto/fornecedor). */
function taxasOf(m: any): Array<{ descricao: string; valor: number }> {
  try {
    const a = JSON.parse(m?.taxasJson || "[]");
    if (Array.isArray(a)) return a.filter((x: any) => x && Number(x.valor) > 0).map((x: any) => ({ descricao: String(x.descricao || "Taxa administrativa").slice(0, 200), valor: Math.round(Number(x.valor) * 100) / 100 }));
  } catch { /* ignore */ }
  return [];
}

async function getMesInfo(db: any, companyId: number, mes: string) {
  const [m] = await db.select().from(vtMeses).where(and(eq(vtMeses.companyId, companyId), eq(vtMeses.mesReferencia, mes)));
  return m ?? null;
}

/** Garante o registro do mês (status 'aberto') e devolve. */
async function ensureMes(db: any, companyId: number, mes: string) {
  const existente = await getMesInfo(db, companyId, mes);
  if (existente) return existente;
  await db.execute(sql`
    INSERT INTO vt_meses ("companyId", "mesReferencia") VALUES (${companyId}, ${mes})
    ON CONFLICT ("companyId", "mesReferencia") DO NOTHING
  `);
  return await getMesInfo(db, companyId, mes);
}

function assertMesAberto(m: any) {
  if (m && m.status !== "aberto") {
    throw new TRPCError({ code: "CONFLICT", message: `Mês ${m.mesReferencia} está ${m.status === "enviado" ? "ENVIADO ao Financeiro" : "CONSOLIDADO"} — reabra antes de alterar.` });
  }
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const baseInput = z.object({
  companyId: z.number(),
  mes: z.string().regex(MES_RE),
});

export const valeTransporteRouter = router({

  /** Visão do mês: registro do mês + lançamentos (com nome) + total. */
  getMes: protectedProcedure.input(baseInput).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const mesInfo = await getMesInfo(db, input.companyId, input.mes);
    const lancs = await db.select({
      id: vtLancamentos.id,
      employeeId: vtLancamentos.employeeId,
      diasTrabalhados: vtLancamentos.diasTrabalhados,
      valorDiario: vtLancamentos.valorDiario,
      valorTotal: vtLancamentos.valorTotal,
      observacoes: vtLancamentos.observacoes,
      nome: employees.nomeCompleto,
      funcao: employees.cargo,
      status: employees.status,
    }).from(vtLancamentos)
      .leftJoin(employees, and(eq(employees.id, vtLancamentos.employeeId), eq(employees.companyId, vtLancamentos.companyId)))
      .where(and(eq(vtLancamentos.companyId, input.companyId), eq(vtLancamentos.mesReferencia, input.mes)))
      .orderBy(employees.nomeCompleto);
    const total = lancs.reduce((s, l) => s + parseBRL(l.valorTotal), 0);
    // Título vinculado (p/ badge de status financeiro)
    let entry: any = null;
    if (mesInfo?.entryId) {
      const r: any = await db.execute(sql`
        SELECT id, status, valor_previsto AS valor, anexo_url AS "anexoUrl" FROM financial_entries
        WHERE id = ${mesInfo.entryId} AND company_id = ${input.companyId}
      `);
      entry = (Array.isArray(r) ? r[0] : r?.rows?.[0]) ?? null;
    }
    const taxas = mesInfo ? taxasOf(mesInfo) : [];
    const totalTaxas = Math.round(taxas.reduce((s, t) => s + t.valor, 0) * 100) / 100;
    return {
      mesInfo, lancamentos: lancs, entry,
      anexos: mesInfo ? anexosOf(mesInfo) : [],
      taxas, totalTaxas,
      totalColaboradores: Math.round(total * 100) / 100,
      total: Math.round((total + totalTaxas) * 100) / 100,
    };
  }),

  /** Resumo do ano p/ o seletor jan-dez (nº de lançamentos, total, status). */
  resumoAno: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int().min(2000).max(2100),
  })).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const pref = `${input.ano}-`;
    const lancs = await db.select({
      mes: vtLancamentos.mesReferencia,
      valorTotal: vtLancamentos.valorTotal,
    }).from(vtLancamentos).where(and(
      eq(vtLancamentos.companyId, input.companyId),
      sql`${vtLancamentos.mesReferencia} LIKE ${pref + "%"}`,
    ));
    const meses = await db.select().from(vtMeses).where(and(
      eq(vtMeses.companyId, input.companyId),
      sql`${vtMeses.mesReferencia} LIKE ${pref + "%"}`,
    ));
    const out: Record<string, { qtd: number; total: number; status: string }> = {};
    for (let i = 1; i <= 12; i++) {
      const k = `${input.ano}-${String(i).padStart(2, "0")}`;
      out[k] = { qtd: 0, total: 0, status: meses.find(m => m.mesReferencia === k)?.status ?? "aberto" };
    }
    for (const l of lancs) {
      const b = out[l.mes];
      if (b) { b.qtd++; b.total = Math.round((b.total + parseBRL(l.valorTotal)) * 100) / 100; }
    }
    return out;
  }),

  /** Funcionários elegíveis (ativos, não-PJ) c/ dados de VT do cadastro. */
  elegiveis: protectedProcedure.input(baseInput).query(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const emps = await db.select({
      id: employees.id,
      nome: employees.nomeCompleto,
      funcao: employees.cargo,
      status: employees.status,
      tipoContrato: employees.tipoContrato,
      vtRecebe: employees.vtRecebe,
      vtValorDiario: employees.vtValorDiario,
      vtOperadora: employees.vtOperadora,
    }).from(employees).where(and(
      eq(employees.companyId, input.companyId),
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra', 'Inativo')`,
      sql`COALESCE(${employees.tipoContrato}, '') NOT IN ('PJ', 'Socio', 'Sócio')`,
    )).orderBy(employees.nomeCompleto);
    const jaLancados = await db.select({ employeeId: vtLancamentos.employeeId }).from(vtLancamentos)
      .where(and(eq(vtLancamentos.companyId, input.companyId), eq(vtLancamentos.mesReferencia, input.mes)));
    const setLancados = new Set(jaLancados.map(l => l.employeeId));
    return emps.map(e => ({
      ...e,
      recebeVT: String(e.vtRecebe ?? "").trim() === "1" || String(e.vtRecebe ?? "").toLowerCase() === "sim" || parseBRL(e.vtValorDiario) > 0,
      valorDiarioSugerido: parseBRL(e.vtValorDiario),
      jaLancado: setLancados.has(e.id),
    }));
  }),

  /** Gera os lançamentos do mês p/ os funcionários selecionados. */
  gerarMes: protectedProcedure.input(baseInput.extend({
    employeeIds: z.array(z.number().int().positive()).min(1).max(2000),
    diasPadrao: z.number().int().min(0).max(31).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await ensureMes(db, input.companyId, input.mes);
    assertMesAberto(m);
    // Só funcionários DA empresa (anti-IDOR)
    const emps = await db.select({
      id: employees.id, vtValorDiario: employees.vtValorDiario,
    }).from(employees).where(and(
      eq(employees.companyId, input.companyId),
      inArray(employees.id, Array.from(new Set(input.employeeIds))),
    ));
    // Dias padrão: dias úteis (seg-sáb excl. domingo) simplificado — user ajusta depois
    const [ano, mesN] = input.mes.split("-").map(Number);
    const diasNoMes = new Date(ano, mesN, 0).getDate();
    let uteis = 0;
    for (let d = 1; d <= diasNoMes; d++) {
      const dow = new Date(ano, mesN - 1, d).getDay();
      if (dow !== 0 && dow !== 6) uteis++;
    }
    const dias = input.diasPadrao ?? uteis;
    let criados = 0;
    for (const e of emps) {
      const vd = parseBRL(e.vtValorDiario);
      const res: any = await db.execute(sql`
        INSERT INTO vt_lancamentos ("companyId", "employeeId", "mesReferencia", "diasTrabalhados", "valorDiario", "valorTotal", "criadoPor")
        VALUES (${input.companyId}, ${e.id}, ${input.mes}, ${dias}, ${formatBRL(vd)}, ${formatBRL(Math.round(vd * dias * 100) / 100)}, ${ctx.user?.name ?? "?"})
        ON CONFLICT ("companyId", "employeeId", "mesReferencia") DO NOTHING
        RETURNING id
      `);
      if ((Array.isArray(res) ? res[0] : res?.rows?.[0])?.id) criados++;
    }
    return { ok: true, criados, diasPadrao: dias };
  }),

  /** Edita dias/valor de um lançamento (recalcula o total). */
  atualizarLancamento: protectedProcedure.input(z.object({
    companyId: z.number(),
    id: z.number(),
    diasTrabalhados: z.number().int().min(0).max(31),
    valorDiario: z.string(),
    observacoes: z.string().max(500).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [l] = await db.select().from(vtLancamentos).where(and(eq(vtLancamentos.id, input.id), eq(vtLancamentos.companyId, input.companyId)));
    if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    const m = await getMesInfo(db, input.companyId, l.mesReferencia);
    assertMesAberto(m);
    const vd = parseBRL(input.valorDiario);
    const total = Math.round(vd * input.diasTrabalhados * 100) / 100;
    await db.update(vtLancamentos).set({
      diasTrabalhados: input.diasTrabalhados,
      valorDiario: formatBRL(vd),
      valorTotal: formatBRL(total),
      observacoes: input.observacoes ?? l.observacoes,
      updatedAt: sql`NOW()` as any,
    } as any).where(and(eq(vtLancamentos.id, input.id), eq(vtLancamentos.companyId, input.companyId)));
    return { ok: true, valorTotal: total };
  }),

  removerLancamento: protectedProcedure.input(z.object({
    companyId: z.number(),
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [l] = await db.select().from(vtLancamentos).where(and(eq(vtLancamentos.id, input.id), eq(vtLancamentos.companyId, input.companyId)));
    if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    const m = await getMesInfo(db, input.companyId, l.mesReferencia);
    assertMesAberto(m);
    await db.delete(vtLancamentos).where(and(eq(vtLancamentos.id, input.id), eq(vtLancamentos.companyId, input.companyId)));
    return { ok: true };
  }),

  /** Consolida (trava edição) ou reabre o mês. */
  consolidar: protectedProcedure.input(baseInput).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await ensureMes(db, input.companyId, input.mes);
    if (m.status !== "aberto") throw new TRPCError({ code: "CONFLICT", message: "Mês já consolidado/enviado." });
    const lancs = await db.select({ id: vtLancamentos.id }).from(vtLancamentos)
      .where(and(eq(vtLancamentos.companyId, input.companyId), eq(vtLancamentos.mesReferencia, input.mes)));
    if (lancs.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum lançamento no mês — gere os lançamentos antes de consolidar." });
    await db.update(vtMeses).set({
      status: "consolidado", consolidadoPor: ctx.user?.name ?? "?", consolidadoEm: sql`NOW()` as any, updatedAt: sql`NOW()` as any,
    } as any).where(and(eq(vtMeses.id, m.id), eq(vtMeses.companyId, input.companyId)));
    return { ok: true };
  }),

  reabrir: protectedProcedure.input(baseInput).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await getMesInfo(db, input.companyId, input.mes);
    if (!m) throw new TRPCError({ code: "NOT_FOUND" });
    if (m.status === "enviado") {
      // Só reabre se o título ainda não tem baixa ativa; cancela o título.
      if (m.entryId) {
        const r: any = await db.execute(sql`
          SELECT COUNT(*)::int AS n FROM financial_entry_baixas
          WHERE entry_id = ${m.entryId} AND estornada_em IS NULL
        `);
        const n = Number((Array.isArray(r) ? r[0] : r?.rows?.[0])?.n) || 0;
        if (n > 0) throw new TRPCError({ code: "CONFLICT", message: "O título deste mês já tem pagamento (baixa) registrado no Financeiro — estorne a baixa antes de reabrir." });
        const upd: any = await db.execute(sql`
          UPDATE financial_entries SET status='cancelado', updated_at=NOW()
          WHERE id = ${m.entryId} AND company_id = ${input.companyId} AND status NOT IN ('pago','recebido','cancelado')
          RETURNING id
        `);
        const cancelou = (Array.isArray(upd) ? upd.length : (upd?.rows?.length ?? 0)) > 0;
        if (!cancelou) {
          // Título nem cancelável nem inexistente-cancelado? Verifica se ainda está ativo.
          const chk: any = await db.execute(sql`
            SELECT status FROM financial_entries WHERE id = ${m.entryId} AND company_id = ${input.companyId}
          `);
          const st = (Array.isArray(chk) ? chk[0] : chk?.rows?.[0])?.status;
          if (st && st !== "cancelado") {
            throw new TRPCError({ code: "CONFLICT", message: `Título #${m.entryId} está '${st}' e não pôde ser cancelado — resolva no Financeiro antes de reabrir.` });
          }
        }
      }
    }
    await db.update(vtMeses).set({ status: "aberto", entryId: null, updatedAt: sql`NOW()` as any } as any)
      .where(and(eq(vtMeses.id, m.id), eq(vtMeses.companyId, input.companyId)));
    return { ok: true };
  }),

  /** Anexa o boleto (PDF/JPEG/PNG/DOC) ao mês; propaga ao título se já enviado. */
  anexarBoleto: protectedProcedure.input(baseInput.extend({
    fileName: z.string().max(300),
    // 15 MB binário ≈ 20 MB em base64 — rejeita ANTES de decodificar (DoS)
    fileBase64: z.string().max(21 * 1024 * 1024),
    contentType: z.string().max(100),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const ALLOWED = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
    ]);
    const ct = (input.contentType || "").toLowerCase().split(";")[0].trim();
    if (!ALLOWED.has(ct)) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo não permitido. Use PDF, JPEG/PNG ou DOC." });
    const buf = Buffer.from(input.fileBase64, "base64");
    if (buf.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
    if (buf.length > 15 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo excede 15 MB." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await ensureMes(db, input.companyId, input.mes);
    const safeName = input.fileName.replace(/[^\w.\-]+/g, "_");
    const key = `vale-transporte/${input.companyId}/${input.mes}-${Date.now()}-${safeName}`;
    const { url } = await storagePut(key, buf, ct);
    // Rev. 5043 — ACRESCENTA à lista (múltiplos boletos de fornecedores diferentes)
    const lista = anexosOf(m);
    lista.push({ url, nome: input.fileName.slice(0, 255) });
    await salvarAnexos(db, input.companyId, m, lista);
    return { ok: true, url };
  }),

  /** Define as taxas administrativas do mês (uma por boleto/fornecedor). */
  salvarTaxas: protectedProcedure.input(baseInput.extend({
    taxas: z.array(z.object({
      descricao: z.string().max(200),
      valor: z.number().min(0).max(1000000),
    })).max(20),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await ensureMes(db, input.companyId, input.mes);
    if (m.status === "enviado") throw new TRPCError({ code: "CONFLICT", message: "Mês já ENVIADO ao Financeiro — reabra antes de alterar as taxas." });
    const taxas = input.taxas.filter(t => t.valor > 0).map(t => ({ descricao: t.descricao.trim() || "Taxa administrativa", valor: Math.round(t.valor * 100) / 100 }));
    await db.update(vtMeses).set({ taxasJson: JSON.stringify(taxas), updatedAt: sql`NOW()` as any } as any)
      .where(and(eq(vtMeses.id, m.id), eq(vtMeses.companyId, input.companyId)));
    return { ok: true, taxas };
  }),

  /** Remove um anexo da lista do mês (e espelha no título, se houver). */
  removerAnexo: protectedProcedure.input(baseInput.extend({
    url: z.string().max(1000),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await getMesInfo(db, input.companyId, input.mes);
    if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Mês não encontrado." });
    const lista = anexosOf(m).filter((a) => a.url !== input.url);
    await salvarAnexos(db, input.companyId, m, lista);
    return { ok: true };
  }),

  /** Envia ao Financeiro: título ÚNICO com o total do mês + relação de colaboradores. */
  enviarFinanceiro: protectedProcedure.input(baseInput.extend({
    dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const m = await getMesInfo(db, input.companyId, input.mes);
    if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Mês sem lançamentos." });
    if (m.status === "aberto") throw new TRPCError({ code: "CONFLICT", message: "Consolide o mês antes de enviar ao Financeiro (poka-yoke)." });
    if (m.status === "enviado" && m.entryId) throw new TRPCError({ code: "CONFLICT", message: "Este mês já foi enviado ao Financeiro." });

    const lancs = await db.select({
      valorTotal: vtLancamentos.valorTotal,
      diasTrabalhados: vtLancamentos.diasTrabalhados,
      valorDiario: vtLancamentos.valorDiario,
      nome: employees.nomeCompleto,
    }).from(vtLancamentos)
      .leftJoin(employees, and(eq(employees.id, vtLancamentos.employeeId), eq(employees.companyId, vtLancamentos.companyId)))
      .where(and(eq(vtLancamentos.companyId, input.companyId), eq(vtLancamentos.mesReferencia, input.mes)))
      .orderBy(employees.nomeCompleto);
    const totalColab = Math.round(lancs.reduce((s, l) => s + parseBRL(l.valorTotal), 0) * 100) / 100;
    const taxas = taxasOf(m);
    const totalTaxas = Math.round(taxas.reduce((s, t) => s + t.valor, 0) * 100) / 100;
    const total = Math.round((totalColab + totalTaxas) * 100) / 100;
    if (total <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Total do mês é zero — nada a enviar." });

    const [ano, mesN] = input.mes.split("-");
    const compet = `${input.mes}-01`;
    const venc = input.dataVencimento ?? compet;
    const desc = `Vale Transporte ${mesN}/${ano} — ${lancs.length} colaborador(es)`;
    // Relação completa p/ o Financeiro saber a quem o boleto se refere
    const relacao = lancs.map(l => `${l.nome ?? "?"}: ${l.diasTrabalhados}d × R$ ${l.valorDiario ?? "0,00"} = R$ ${l.valorTotal ?? "0,00"}`).join(" | ");
    const relTaxas = taxas.length > 0 ? ` | Taxas administrativas: ${taxas.map(t => `${t.descricao}: R$ ${t.valor.toFixed(2).replace(".", ",")}`).join(" | ")}` : "";
    const origemDesc = `${desc}. ${relacao}${relTaxas}`.slice(0, 4000);

    // ATÔMICO: INSERT protegido pelo índice único parcial uq_fin_entries_vale_transporte
    // (company_id, origem_id WHERE origem_modulo='vale_transporte' AND status<>'cancelado')
    // + atualização do mês na MESMA transação — sem janela p/ título duplicado/órfão.
    let entryId: number | null = null;
    await db.transaction(async (tx: any) => {
      const res: any = await tx.execute(sql`
        INSERT INTO financial_entries (
          company_id, conta_nome, tipo, natureza,
          valor_previsto, data_competencia, data_vencimento, status,
          origem_modulo, origem_id, origem_descricao, descricao,
          anexo_url, anexo_nome, anexos_json, created_at, updated_at
        ) VALUES (
          ${input.companyId}, ${'VALE TRANSPORTE'}, 'despesa', 'variavel',
          ${total.toFixed(2)}, ${compet}, ${venc}, 'a_pagar',
          'vale_transporte', ${m.id}, ${origemDesc}, ${desc},
          ${m.anexoUrl ?? null}, ${m.anexoNome ?? null}, ${JSON.stringify(anexosOf(m))}, NOW(), NOW()
        )
        ON CONFLICT (company_id, origem_id) WHERE origem_modulo = 'vale_transporte' AND status <> 'cancelado' DO NOTHING
        RETURNING id
      `);
      entryId = Number((Array.isArray(res) ? res[0] : res?.rows?.[0])?.id) || null;
      if (!entryId) throw new TRPCError({ code: "CONFLICT", message: "Já existe título ativo para este mês no Financeiro." });
      await tx.update(vtMeses).set({
        status: "enviado", entryId, enviadoPor: ctx.user?.name ?? "?", enviadoEm: sql`NOW()` as any, updatedAt: sql`NOW()` as any,
      } as any).where(and(eq(vtMeses.id, m.id), eq(vtMeses.companyId, input.companyId)));
    });
    console.log(`[ValeTransporte] ${desc}: título #${entryId} de R$ ${total.toFixed(2)} (venc. ${venc}) por ${ctx.user?.name}.`);
    return { ok: true, entryId, total };
  }),
});
