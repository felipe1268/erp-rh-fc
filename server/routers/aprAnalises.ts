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
        (await db.select({ id: employees.id, nome: employees.nome }).from(employees).where(inArray(employees.id, empIds)))
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
      if (apr.obraId) {
        const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, apr.obraId)).limit(1);
        obraNome = ob?.nome ?? null;
      }
      let responsavelNome: string | null = null;
      if (apr.employeeId) {
        const [emp] = await db.select({ nome: employees.nome }).from(employees).where(eq(employees.id, apr.employeeId)).limit(1);
        responsavelNome = emp?.nome ?? null;
      }
      return {
        ...apr,
        obraNome, responsavelNome,
        riscos,
        equipe: apr.equipeJson ? (() => { try { return JSON.parse(apr.equipeJson); } catch { return []; } })() : [],
        epis:   apr.epiJson   ? (() => { try { return JSON.parse(apr.epiJson);   } catch { return []; } })() : [],
      };
    }),

  // ── Create ─────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      companyId:    z.number(),
      obraId:       z.number().optional().nullable(),
      employeeId:   z.number(),
      dataEmissao:  z.string().optional().nullable(),
      atividade:    z.string().optional().nullable(),
      localServico: z.string().optional().nullable(),
      equipeJson:   z.string().optional().nullable(),
      epiJson:      z.string().optional().nullable(),
      observacoes:  z.string().optional().nullable(),
      riscos:       riscosInputSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const numero = await proximoNumero(db, input.companyId);
      const [apr] = await db.insert(aprAnalises).values({
        companyId:    input.companyId,
        obraId:       input.obraId ?? null,
        employeeId:   input.employeeId,
        numero,
        status:       "em_analise",
        dataEmissao:  input.dataEmissao ?? null,
        atividade:    input.atividade ?? null,
        localServico: input.localServico ?? null,
        equipeJson:   input.equipeJson ?? null,
        epiJson:      input.epiJson ?? null,
        observacoes:  input.observacoes ?? null,
        criadoPorId:  ctx.user.id,
        criadoPorNome: ctx.user.name ?? "Sistema",
      }).returning();
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
      const allowed = ["obraId","employeeId","dataEmissao","atividade","localServico",
        "equipeJson","epiJson","observacoes","aprovadoPorNome","aprovadoPorAss","aprovadoEm","status","fcSignSessionId"];
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
});
