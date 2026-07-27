// ============================================================================
// Rev. 4672 — FASE 4: PDI (Plano de Desenvolvimento Individual) + FEEDBACKS
// no módulo Avaliação de Desempenho. Guards anti-IDOR em todas as operações
// (getCompaniesForUser + load-guarded nas mutações por id).
// ============================================================================
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { avaliacaoPdis, avaliacaoFeedbacks, employees } from "../../drizzle/schema";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";

async function assertAccess(userId: number, role: string, companyId: number) {
  const allowed = new Set((await getCompaniesForUser(userId, role)).map((c: any) => c.id));
  if (!allowed.has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à empresa informada." });
  }
}

async function assertEmp(db: any, companyId: number, employeeId: number) {
  const [emp] = await db.select({ id: employees.id }).from(employees).where(and(
    eq(employees.id, employeeId),
    eq(employees.companyId, companyId),
    isNull(employees.deletedAt),
  ));
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });
}

export const avaliacaoPdiRouter = router({
  // ── PDI ────────────────────────────────────────────────────────────────────
  listarPdis: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const conds = [
        eq(avaliacaoPdis.companyId, input.companyId),
        isNull(avaliacaoPdis.deletedAt),
      ];
      if (input.employeeId) conds.push(eq(avaliacaoPdis.employeeId, input.employeeId));
      const rows = await db.select().from(avaliacaoPdis).where(and(...conds)).orderBy(desc(avaliacaoPdis.id));
      const empIds = [...new Set(rows.map(r => r.employeeId))];
      const emps = empIds.length
        ? await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao, fotoUrl: employees.fotoUrl })
            .from(employees).where(inArray(employees.id, empIds))
        : [];
      const byId = new Map(emps.map(e => [e.id, e]));
      return rows.map(r => ({ ...r, empregado: byId.get(r.employeeId) || null }));
    }),

  criarPdi: protectedProcedure
    .input(z.object({
      companyId: z.number(), employeeId: z.number(),
      titulo: z.string().min(2).max(255),
      objetivo: z.string().max(4000).nullish(),
      acoes: z.string().max(4000).nullish(),
      prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      await assertEmp(db, input.companyId, input.employeeId);
      const [row] = await db.insert(avaliacaoPdis).values({
        companyId: input.companyId, employeeId: input.employeeId,
        titulo: input.titulo.trim(), objetivo: input.objetivo?.trim() || null,
        acoes: input.acoes?.trim() || null, prazo: input.prazo || null,
        criadoPorId: ctx.user.id,
        criadoPorNome: (ctx.user as any).name || (ctx.user as any).email || null,
      }).returning({ id: avaliacaoPdis.id });
      return { id: row.id };
    }),

  atualizarPdi: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().min(2).max(255).optional(),
      objetivo: z.string().max(4000).nullish().optional(),
      acoes: z.string().max(4000).nullish().optional(),
      prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().optional(),
      status: z.enum(["em_andamento", "concluido", "cancelado"]).optional(),
      progresso: z.number().int().min(0).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [pdi] = await db.select().from(avaliacaoPdis)
        .where(and(eq(avaliacaoPdis.id, input.id), isNull(avaliacaoPdis.deletedAt)));
      if (!pdi) throw new TRPCError({ code: "NOT_FOUND", message: "PDI não encontrado." });
      await assertAccess(ctx.user.id, ctx.user.role, pdi.companyId);
      const set: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (input.titulo !== undefined) set.titulo = input.titulo.trim();
      if (input.objetivo !== undefined) set.objetivo = input.objetivo?.trim() || null;
      if (input.acoes !== undefined) set.acoes = input.acoes?.trim() || null;
      if (input.prazo !== undefined) set.prazo = input.prazo || null;
      if (input.status !== undefined) {
        set.status = input.status;
        if (input.status === "concluido") set.progresso = 100;
      }
      if (input.progresso !== undefined) set.progresso = input.progresso;
      await db.update(avaliacaoPdis).set(set).where(eq(avaliacaoPdis.id, input.id));
      return { ok: true };
    }),

  excluirPdi: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [pdi] = await db.select().from(avaliacaoPdis)
        .where(and(eq(avaliacaoPdis.id, input.id), isNull(avaliacaoPdis.deletedAt)));
      if (!pdi) throw new TRPCError({ code: "NOT_FOUND", message: "PDI não encontrado." });
      await assertAccess(ctx.user.id, ctx.user.role, pdi.companyId);
      await db.update(avaliacaoPdis).set({ deletedAt: new Date().toISOString() }).where(eq(avaliacaoPdis.id, input.id));
      return { ok: true };
    }),

  // ── Feedbacks ──────────────────────────────────────────────────────────────
  listarFeedbacks: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const conds = [
        eq(avaliacaoFeedbacks.companyId, input.companyId),
        isNull(avaliacaoFeedbacks.deletedAt),
      ];
      if (input.employeeId) conds.push(eq(avaliacaoFeedbacks.employeeId, input.employeeId));
      const rows = await db.select().from(avaliacaoFeedbacks).where(and(...conds))
        .orderBy(desc(avaliacaoFeedbacks.data), desc(avaliacaoFeedbacks.id));
      const empIds = [...new Set(rows.map(r => r.employeeId))];
      const emps = empIds.length
        ? await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao, fotoUrl: employees.fotoUrl })
            .from(employees).where(inArray(employees.id, empIds))
        : [];
      const byId = new Map(emps.map(e => [e.id, e]));
      return rows.map(r => ({ ...r, empregado: byId.get(r.employeeId) || null }));
    }),

  criarFeedback: protectedProcedure
    .input(z.object({
      companyId: z.number(), employeeId: z.number(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipo: z.enum(["positivo", "construtivo", "one_on_one"]),
      resumo: z.string().min(3).max(4000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      await assertEmp(db, input.companyId, input.employeeId);
      const [row] = await db.insert(avaliacaoFeedbacks).values({
        companyId: input.companyId, employeeId: input.employeeId,
        data: input.data, tipo: input.tipo, resumo: input.resumo.trim(),
        autorId: ctx.user.id,
        autorNome: (ctx.user as any).name || (ctx.user as any).email || null,
      }).returning({ id: avaliacaoFeedbacks.id });
      return { id: row.id };
    }),

  excluirFeedback: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [fb] = await db.select().from(avaliacaoFeedbacks)
        .where(and(eq(avaliacaoFeedbacks.id, input.id), isNull(avaliacaoFeedbacks.deletedAt)));
      if (!fb) throw new TRPCError({ code: "NOT_FOUND", message: "Feedback não encontrado." });
      await assertAccess(ctx.user.id, ctx.user.role, fb.companyId);
      await db.update(avaliacaoFeedbacks).set({ deletedAt: new Date().toISOString() }).where(eq(avaliacaoFeedbacks.id, input.id));
      return { ok: true };
    }),
});
