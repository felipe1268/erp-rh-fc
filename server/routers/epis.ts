import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { createEpi, getEpis, updateEpi, deleteEpi, createEpiDelivery, getEpiDeliveries } from "../db";
import { getDb } from "../db";
import { epis, epiDeliveries, employees } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const episRouter = router({
  // ============================================================
  // CATÁLOGO DE EPIs
  // ============================================================
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(({ input }) => getEpis(input.companyId)),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      ca: z.string().optional(),
      validadeCa: z.string().optional(),
      fabricante: z.string().optional(),
      quantidadeEstoque: z.number().default(0),
    }))
    .mutation(({ input }) => createEpi(input)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      ca: z.string().optional(),
      validadeCa: z.string().optional(),
      fabricante: z.string().optional(),
      quantidadeEstoque: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateEpi(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteEpi(input.id);
      return { success: true };
    }),

  // ============================================================
  // ENTREGAS DE EPIs
  // ============================================================
  listDeliveries: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number().optional(),
      epiId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds = [eq(epiDeliveries.companyId, input.companyId)];
      if (input.employeeId) conds.push(eq(epiDeliveries.employeeId, input.employeeId));
      if (input.epiId) conds.push(eq(epiDeliveries.epiId, input.epiId));

      return db.select({
        id: epiDeliveries.id,
        companyId: epiDeliveries.companyId,
        epiId: epiDeliveries.epiId,
        employeeId: epiDeliveries.employeeId,
        quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega,
        dataDevolucao: epiDeliveries.dataDevolucao,
        motivo: epiDeliveries.motivo,
        observacoes: epiDeliveries.observacoes,
        createdAt: epiDeliveries.createdAt,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiDeliveries.dataEntrega));
    }),

  createDelivery: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      epiId: z.number(),
      employeeId: z.number(),
      quantidade: z.number().min(1).default(1),
      dataEntrega: z.string(),
      dataDevolucao: z.string().optional(),
      motivo: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await createEpiDelivery(input);
      // Atualizar estoque (decrementar)
      const db = (await getDb())!;
      await db.update(epis)
        .set({ quantidadeEstoque: sql`GREATEST(${epis.quantidadeEstoque} - ${input.quantidade}, 0)` })
        .where(eq(epis.id, input.epiId));
      return result;
    }),

  deleteDelivery: protectedProcedure
    .input(z.object({ id: z.number(), epiId: z.number(), quantidade: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(epiDeliveries).set({ deletedAt: sql`NOW()`, deletedBy: ctx.user.name ?? 'Sistema', deletedByUserId: ctx.user.id } as any).where(eq(epiDeliveries.id, input.id));
      // Devolver ao estoque
      await db.update(epis)
        .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} + ${input.quantidade}` })
        .where(eq(epis.id, input.epiId));
      return { success: true };
    }),

  // ============================================================
  // STATS
  // ============================================================
  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const allEpis = await db.select().from(epis).where(eq(epis.companyId, input.companyId));
      const allDeliveries = await db.select().from(epiDeliveries).where(eq(epiDeliveries.companyId, input.companyId));

      const hoje = new Date().toISOString().split("T")[0];
      const totalItens = allEpis.length;
      const estoqueTotal = allEpis.reduce((sum, e) => sum + (e.quantidadeEstoque || 0), 0);
      const estoqueBaixo = allEpis.filter(e => (e.quantidadeEstoque || 0) <= 5).length;
      const caVencido = allEpis.filter(e => e.validadeCa && e.validadeCa < hoje).length;
      const totalEntregas = allDeliveries.length;

      // Entregas últimos 30 dias
      const ha30dias = new Date();
      ha30dias.setDate(ha30dias.getDate() - 30);
      const ha30diasStr = ha30dias.toISOString().split("T")[0];
      const entregasMes = allDeliveries.filter(d => d.dataEntrega >= ha30diasStr).length;

      return {
        totalItens,
        estoqueTotal,
        estoqueBaixo,
        caVencido,
        totalEntregas,
        entregasMes,
      };
    }),
});
