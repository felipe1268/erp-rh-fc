// Rev. 3901 — APR Análise Preliminar de Risco — router tRPC
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { aprAnalises, aprRiscos, employees, obras } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function assertCompany(ctx: any, companyId: number) {
  if (ctx.user?.companyId && String(ctx.user.companyId) !== String(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
  }
}

async function proximoNumero(db: any, companyId: number): Promise<string> {
  const [row] = await db
    .select({ max: sql<string>`max(${aprAnalises.numero})` })
    .from(aprAnalises)
    .where(and(eq(aprAnalises.companyId, companyId), isNull(aprAnalises.deletedAt)));
  const last = row?.max;
  if (!last) return "APR-001";
  const match = last.match(/(\d+)$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `APR-${String(next).padStart(3, "0")}`;
}

const riscosInputSchema = z.array(z.object({
  id:              z.number().optional(),
  ordem:           z.number().default(0),
  etapaAtividade:  z.string().optional().nullable(),
  perigo:          z.string().optional().nullable(),
  risco:           z.string().optional().nullable(),
  tipoRisco:       z.string().optional().nullable(),
  probabilidade:   z.number().min(1).max(5).optional().nullable(),
  gravidade:       z.number().min(1).max(5).optional().nullable(),
  medidasControle: z.string().optional().nullable(),
  tipoMedida:      z.string().optional().nullable(),
  responsavelNome: z.string().optional().nullable(),
  prazo:           z.string().optional().nullable(),
  situacao:        z.string().optional().nullable(),
}));

export const aprAnalisesRouter = router({
  // ── Lista ──────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status:    z.string().optional(),
      obraId:    z.number().optional(),
      limit:     z.number().default(50),
      offset:    z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const conds = [eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)];
      if (input.status) conds.push(eq(aprAnalises.status, input.status));
      if (input.obraId) conds.push(eq(aprAnalises.obraId, input.obraId));
      const rows = await db.select({
        id: aprAnalises.id, numero: aprAnalises.numero, status: aprAnalises.status,
        dataEmissao: aprAnalises.dataEmissao, atividade: aprAnalises.atividade,
        localServico: aprAnalises.localServico, obraId: aprAnalises.obraId,
        employeeId: aprAnalises.employeeId, criadoPorNome: aprAnalises.criadoPorNome,
        createdAt: aprAnalises.createdAt, equipeJson: aprAnalises.equipeJson,
        aprovadoPorNome: aprAnalises.aprovadoPorNome, aprovadoEm: aprAnalises.aprovadoEm,
      }).from(aprAnalises).where(and(...conds))
        .orderBy(desc(aprAnalises.createdAt)).limit(input.limit).offset(input.offset);

      const obraIds = [...new Set(rows.map(r => r.obraId).filter(Boolean))] as number[];
      const empIds  = [...new Set(rows.map(r => r.employeeId).filter(Boolean))] as number[];
      const obrasMap = new Map<number, string>();
      const empsMap  = new Map<number, string>();
      if (obraIds.length) {
        (await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds)))
          .forEach((o: any) => obrasMap.set(o.id, o.nome));
      }
      if (empIds.length) {
        (await db.select({ id: employees.id, nome: employees.nomeCompleto }).from(employees).where(inArray(employees.id, empIds)))
          .forEach((e: any) => empsMap.set(e.id, e.nome));
      }

      // Conta riscos por APR
      const aprIds = rows.map(r => r.id);
      const riskCounts = new Map<number, number>();
      if (aprIds.length) {
        const counts = await db.select({ aprId: aprRiscos.aprId, cnt: sql<number>`count(*)` })
          .from(aprRiscos).where(inArray(aprRiscos.aprId, aprIds)).groupBy(aprRiscos.aprId);
        counts.forEach((c: any) => riskCounts.set(c.aprId, Number(c.cnt)));
      }

      return rows.map(r => ({
        ...r,
        obraNome:        r.obraId ? (obrasMap.get(r.obraId) ?? null) : null,
        responsavelNome: r.employeeId ? (empsMap.get(r.employeeId) ?? null) : null,
        totalRiscos:     riskCounts.get(r.id) ?? 0,
        equipe: r.equipeJson ? (() => { try { return JSON.parse(r.equipeJson); } catch { return []; } })() : [],
      }));
    }),

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const rows = await db
        .select({ status: aprAnalises.status, cnt: sql<number>`count(*)` })
        .from(aprAnalises)
        .where(and(eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)))
        .groupBy(aprAnalises.status);
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status] = Number(r.cnt);
      return {
        total:     Object.values(byStatus).reduce((a, b) => a + b, 0),
        rascunho:  byStatus["rascunho"] ?? 0,
        em_analise: byStatus["em_analise"] ?? 0,
        aprovada:  byStatus["aprovada"] ?? 0,
        concluida: byStatus["concluida"] ?? 0,
        cancelada: byStatus["cancelada"] ?? 0,
      };
    }),

  // ── Próximo número ─────────────────────────────────────────────────────────
  proximoNumero: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      return { numero: await proximoNumero(db, input.companyId) };
    }),

  // ── Get by ID ─────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [apr] = await db.select().from(aprAnalises)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt))).limit(1);
      if (!apr) throw new TRPCError({ code: "NOT_FOUND" });
      const riscos = await db.select().from(aprRiscos)
        .where(and(eq(aprRiscos.aprId, input.id), eq(aprRiscos.companyId, input.companyId)))
        .orderBy(aprRiscos.ordem);
      let obraNome: string | null = null;
      let obraClienteLogoUrl: string | null = null;
      let obraGerenciadoraLogoUrl: string | null = null;
      let obraGerenciadoraNome: string | null = null;
      let obraClienteNome: string | null = null;
      if (apr.obraId) {
        const [ob] = await db.select({
          nome: obras.nome,
          clienteLogoUrl: obras.clienteLogoUrl,
          gerenciadoraLogoUrl: obras.gerenciadoraLogoUrl,
          gerenciadoraNome: obras.gerenciadoraNome,
          cliente: obras.cliente,
        }).from(obras).where(eq(obras.id, apr.obraId)).limit(1);
        obraNome               = ob?.nome ?? null;
        obraClienteLogoUrl     = ob?.clienteLogoUrl ?? null;
        obraGerenciadoraLogoUrl = ob?.gerenciadoraLogoUrl ?? null;
        obraGerenciadoraNome   = ob?.gerenciadoraNome ?? null;
        obraClienteNome        = ob?.cliente ?? null;
      }
      let responsavelNome: string | null = null;
      if (apr.employeeId) {
        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, apr.employeeId)).limit(1);
        responsavelNome = emp?.nome ?? null;
      }
      const parseJson = (s: string | null | undefined) => { try { return JSON.parse(s ?? "[]"); } catch { return []; } };
      return {
        ...apr,
        obraNome, responsavelNome,
        obraClienteLogoUrl, obraGerenciadoraLogoUrl, obraGerenciadoraNome, obraClienteNome,
        riscos,
        equipe:              parseJson(apr.equipeJson),
        epis:                parseJson(apr.epiJson),
        assinaturasEquipe:   parseJson((apr as any).assinaturasEquipeJson),
      };
    }),

  // ── Create ─────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      obraId:         z.number().optional().nullable(),
      employeeId:     z.number(),
      tipoAtividade:  z.string().optional().nullable(),
      checklistJson:  z.string().optional().nullable(),
      dataEmissao:    z.string().optional().nullable(),
      horaInicio:     z.string().optional().nullable(),
      atividade:      z.string().optional().nullable(),
      localServico:   z.string().optional().nullable(),
      equipeJson:     z.string().optional().nullable(),
      epiJson:        z.string().optional().nullable(),
      observacoes:    z.string().optional().nullable(),
      riscos:         riscosInputSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const numero = await proximoNumero(db, input.companyId);
      // Inicializa assinaturas da equipe a partir do equipeJson (sem ass ainda)
      let assinaturasEquipeJson: string | null = null;
      if (input.equipeJson) {
        try {
          const membros = JSON.parse(input.equipeJson);
          assinaturasEquipeJson = JSON.stringify(
            membros.map((m: any) => ({
              nome: typeof m === "string" ? m : (m?.nome ?? ""),
              ass: null, assinadoEm: null,
            })).filter((m: any) => m.nome)
          );
        } catch {}
      }

      const [apr] = await db.insert(aprAnalises).values({
        companyId:     input.companyId,
        obraId:        input.obraId ?? null,
        employeeId:    input.employeeId,
        numero,
        status:        "em_analise",
        tipoAtividade: input.tipoAtividade ?? null,
        checklistJson: input.checklistJson ?? null,
        dataEmissao:   input.dataEmissao ?? null,
        horaInicio:    input.horaInicio ?? null,
        atividade:     input.atividade ?? null,
        localServico:  input.localServico ?? null,
        equipeJson:    input.equipeJson ?? null,
        assinaturasEquipeJson,
        epiJson:       input.epiJson ?? null,
        observacoes:   input.observacoes ?? null,
        criadoPorId:   ctx.user.id,
        criadoPorNome: ctx.user.name ?? "Sistema",
      } as any).returning();
      if (input.riscos?.length) {
        await db.insert(aprRiscos).values(input.riscos.map((r, i) => ({
          aprId: apr.id, companyId: input.companyId, ordem: r.ordem ?? i,
          etapaAtividade: r.etapaAtividade ?? null, perigo: r.perigo ?? null,
          risco: r.risco ?? null, tipoRisco: r.tipoRisco ?? null,
          probabilidade: r.probabilidade ?? null, gravidade: r.gravidade ?? null,
          nivelRisco: (r.probabilidade && r.gravidade) ? r.probabilidade * r.gravidade : null,
          medidasControle: r.medidasControle ?? null, tipoMedida: r.tipoMedida ?? null,
          responsavelNome: r.responsavelNome ?? null, prazo: r.prazo ?? null,
          situacao: r.situacao ?? "aberta",
        })));
      }
      return apr;
    }),

  // ── Upsert riscos ─────────────────────────────────────────────────────────
  upsertRiscos: protectedProcedure
    .input(z.object({ aprId: z.number(), companyId: z.number(), riscos: riscosInputSchema }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [apr] = await db.select({ id: aprAnalises.id }).from(aprAnalises)
        .where(and(eq(aprAnalises.id, input.aprId), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt))).limit(1);
      if (!apr) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(aprRiscos).where(and(eq(aprRiscos.aprId, input.aprId), eq(aprRiscos.companyId, input.companyId)));
      if (input.riscos.length) {
        await db.insert(aprRiscos).values(input.riscos.map((r, i) => ({
          aprId: input.aprId, companyId: input.companyId, ordem: r.ordem ?? i,
          etapaAtividade: r.etapaAtividade ?? null, perigo: r.perigo ?? null,
          risco: r.risco ?? null, tipoRisco: r.tipoRisco ?? null,
          probabilidade: r.probabilidade ?? null, gravidade: r.gravidade ?? null,
          nivelRisco: (r.probabilidade && r.gravidade) ? r.probabilidade * r.gravidade : null,
          medidasControle: r.medidasControle ?? null, tipoMedida: r.tipoMedida ?? null,
          responsavelNome: r.responsavelNome ?? null, prazo: r.prazo ?? null,
          situacao: r.situacao ?? "aberta",
        })));
      }
      return { ok: true };
    }),

  // ── Update ─────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const allowed = ["obraId","employeeId","dataEmissao","horaInicio","atividade","localServico",
        "equipeJson","assinaturasEquipeJson","epiJson","observacoes","aprovadoPorNome","aprovadoPorAss","aprovadoEm","status","fcSignSessionId"];
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const k of allowed) { if (k in input.data) patch[k] = (input.data as any)[k]; }
      await db.update(aprAnalises).set(patch as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Aprovar ────────────────────────────────────────────────────────────────
  aprovar: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(),
      aprovadoPorNome: z.string().optional().nullable(),
      aprovadoPorAss:  z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({
        status: "aprovada",
        aprovadoPorNome: input.aprovadoPorNome ?? null,
        aprovadoPorAss:  input.aprovadoPorAss ?? null,
        aprovadoEm:      new Date().toISOString(),
        updatedAt:       new Date().toISOString(),
      } as any).where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Concluir ───────────────────────────────────────────────────────────────
  concluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ status: "concluida", updatedAt: new Date().toISOString() } as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Cancelar ───────────────────────────────────────────────────────────────
  cancelar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ status: "cancelada", updatedAt: new Date().toISOString() } as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt)));
      return { ok: true };
    }),

  // ── Excluir (soft) ─────────────────────────────────────────────────────────
  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(aprAnalises).set({ deletedAt: new Date().toISOString() } as any)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Gerar HTML para impressão ─────────────────────────────────────────────
  gerarHtml: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [apr] = await db.select().from(aprAnalises)
        .where(and(eq(aprAnalises.id, input.id), eq(aprAnalises.companyId, input.companyId), isNull(aprAnalises.deletedAt))).limit(1);
      if (!apr) throw new TRPCError({ code: "NOT_FOUND" });

      let obraNome = "";
      if (apr.obraId) {
        const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, apr.obraId)).limit(1);
        obraNome = ob?.nome ?? "";
      }
      let responsavelNome = "";
      if (apr.employeeId) {
        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, apr.employeeId)).limit(1);
        responsavelNome = emp?.nome ?? "";
      }
      const riscos = await db.select().from(aprRiscos)
        .where(and(eq(aprRiscos.aprId, input.id), eq(aprRiscos.companyId, input.companyId)))
        .orderBy(aprRiscos.ordem);

      const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      let equipeRaw: any[] = [];
      try { equipeRaw = JSON.parse(apr.equipeJson ?? "[]"); } catch {}
      const equipeNomes = equipeRaw.map((m: any) => typeof m === "string" ? m : (m?.nome ?? "")).filter(Boolean);
      const equipe = equipeNomes; // alias para compatibilidade com template
      let epis: string[] = [];
      try { epis = JSON.parse(apr.epiJson ?? "[]"); } catch {}

      const NIVEIS: Record<number, { label: string; bg: string; color: string }> = {};
      for (let p = 1; p <= 5; p++) for (let g = 1; g <= 5; g++) {
        const n = p * g;
        NIVEIS[n] = n <= 4 ? { label: "BAIXO", bg: "#d1fae5", color: "#065f46" }
                  : n <= 9 ? { label: "MÉDIO", bg: "#fef9c3", color: "#854d0e" }
                  : n <= 16 ? { label: "ALTO", bg: "#ffedd5", color: "#9a3412" }
                  : { label: "CRÍTICO", bg: "#fee2e2", color: "#991b1b" };
      }

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>APR — ${esc(apr.numero)}</title>
<style>
  @page { margin: 15mm; size: A4 landscape; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #1e293b; margin: 0; }
  @media screen { body { padding: 15mm; max-width: 297mm; margin: 0 auto; } }
  h1 { font-size: 13pt; text-align: center; margin: 0 0 4px; color: #9a3412; }
  h2 { font-size: 9pt; background: #9a3412; color: white; padding: 4px 8px; margin: 8px 0 4px; }
  .header { text-align: center; border: 2px solid #9a3412; padding: 8px; margin-bottom: 8px; border-radius: 4px; }
  .subtitle { font-size: 8pt; color: #64748b; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 4px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; }
  .grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; }
  .field { border: 1px solid #cbd5e1; padding: 3px 6px; border-radius: 3px; }
  .field-label { font-size: 7pt; color: #64748b; display: block; }
  .field-value { font-size: 9pt; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 8pt; }
  th { background: #9a3412; color: white; padding: 4px; text-align: left; font-size: 7.5pt; }
  td { border: 1px solid #e2e8f0; padding: 3px 5px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .nivel-chip { font-weight: bold; font-size: 7pt; padding: 1px 6px; border-radius: 10px; display: inline-block; }
  .epi-chip { background: #ffedd5; color: #9a3412; font-size: 7.5pt; padding: 2px 6px; border-radius: 10px; display: inline-block; margin: 1px; }
  .sig-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; text-align: center; min-height: 60px; }
  .sig-line { border-bottom: 1px solid #94a3b8; margin: 20px 10px 4px; }
  .sig-label { font-size: 7pt; color: #64748b; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>ANÁLISE PRELIMINAR DE RISCO — APR</h1>
  <div class="subtitle">FC Engenharia &nbsp;|&nbsp; ${esc(apr.numero)} &nbsp;|&nbsp; Status: ${esc(apr.status.toUpperCase())}</div>
</div>

<h2>1. IDENTIFICAÇÃO</h2>
<div class="grid4">
  <div class="field"><span class="field-label">Número APR</span><span class="field-value">${esc(apr.numero)}</span></div>
  <div class="field"><span class="field-label">Data de Emissão</span><span class="field-value">${esc(apr.dataEmissao)}</span></div>
  <div class="field"><span class="field-label">Hora Início</span><span class="field-value">${esc((apr as any).horaInicio || "—")}</span></div>
  <div class="field"><span class="field-label">Obra / Unidade</span><span class="field-value">${esc(obraNome)}</span></div>
</div>
<div class="grid2">
  <div class="field"><span class="field-label">Atividade / Serviço</span><span class="field-value">${esc(apr.atividade)}</span></div>
  <div class="field"><span class="field-label">Local do Serviço</span><span class="field-value">${esc(apr.localServico)}</span></div>
</div>
<div class="grid2">
  <div class="field"><span class="field-label">Responsável</span><span class="field-value">${esc(responsavelNome)}</span></div>
  <div class="field"><span class="field-label">Equipe</span><span class="field-value">${equipeNomes.join(", ") || "—"}</span></div>
</div>

<h2>2. MATRIZ DE RISCOS (P × G)</h2>
<table>
  <thead>
    <tr>
      <th style="width:5%">#</th>
      <th style="width:15%">Etapa/Atividade</th>
      <th style="width:14%">Perigo</th>
      <th style="width:14%">Risco</th>
      <th style="width:6%">Tipo</th>
      <th style="width:4%">P</th>
      <th style="width:4%">G</th>
      <th style="width:6%">Nível</th>
      <th style="width:22%">Medidas de Controle</th>
      <th style="width:7%">Tipo Medida</th>
      <th style="width:10%">Responsável</th>
    </tr>
  </thead>
  <tbody>
    ${riscos.map((r, i) => {
      const nivel = (r.probabilidade ?? 0) * (r.gravidade ?? 0);
      const nc = nivel > 0 ? (NIVEIS[nivel] ?? { label: String(nivel), bg: "#f1f5f9", color: "#334155" }) : null;
      return `<tr>
        <td>${i+1}</td>
        <td>${esc(r.etapaAtividade)}</td>
        <td>${esc(r.perigo)}</td>
        <td>${esc(r.risco)}</td>
        <td>${esc(r.tipoRisco)}</td>
        <td style="text-align:center">${r.probabilidade ?? "—"}</td>
        <td style="text-align:center">${r.gravidade ?? "—"}</td>
        <td style="text-align:center">${nc ? `<span class="nivel-chip" style="background:${nc.bg};color:${nc.color}">${nc.label}</span>` : "—"}</td>
        <td>${esc(r.medidasControle)}</td>
        <td>${esc(r.tipoMedida)}</td>
        <td>${esc(r.responsavelNome)}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>

${epis.length ? `<h2>3. EPIs NECESSÁRIOS</h2>
<div>${epis.map(e => `<span class="epi-chip">✓ ${esc(e)}</span>`).join(" ")}</div>` : ""}

${apr.observacoes ? `<h2>4. OBSERVAÇÕES</h2><div class="field">${esc(apr.observacoes)}</div>` : ""}

<h2>5. APROVAÇÃO</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
  <div class="sig-box">
    ${apr.aprovadoPorAss ? `<img src="${apr.aprovadoPorAss}" style="max-width:100%;max-height:45px;object-fit:contain" alt="Assinatura" />` : `<div class="sig-line"></div>`}
    <div style="font-weight:bold;font-size:8pt">${esc(apr.aprovadoPorNome) || "Aprovador SST"}</div>
    <div class="sig-label">Técnico / Engenheiro de SST</div>
    ${apr.aprovadoEm ? `<div style="font-size:7pt;color:#64748b">${new Date(apr.aprovadoEm).toLocaleString("pt-BR")}</div>` : ""}
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div style="font-weight:bold;font-size:8pt">Responsável pela Execução</div>
    <div class="sig-label">Nome / Assinatura</div>
  </div>
</div>

<div style="margin-top:12px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:7pt;color:#94a3b8;text-align:center">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} &nbsp;|&nbsp; FC Engenharia &nbsp;|&nbsp; APR ${esc(apr.numero)} &nbsp;|&nbsp; Sistema ERP
</div>
</body>
</html>`;
      return { html };
    }),
});
