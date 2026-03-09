import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { medicos, clinicas } from "../../drizzle/schema";
import { eq, and, like, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";

export const medicosClinicasRouter = router({
  // ========== MÉDICOS ==========

  listarMedicos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(medicos)
        .where(companyFilter(medicos.companyId, input))
        .orderBy(medicos.nome);
    }),

  buscarMedicos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), termo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(medicos)
        .where(and(
          companyFilter(medicos.companyId, input),
          eq(medicos.ativo, 1),
          like(medicos.nome, `%${input.termo}%`)
        ))
        .orderBy(medicos.nome)
        .limit(10);
    }),

  criarMedico: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(2),
      crm: z.string().min(1),
      especialidade: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [result] = await db.insert(medicos).values({
        companyId: input.companyId,
        nome: input.nome,
        crm: input.crm,
        especialidade: input.especialidade || null,
      });
      return { id: result.insertId };
    }),

  atualizarMedico: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(2).optional(),
      crm: z.string().min(1).optional(),
      especialidade: z.string().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, companyId, ...data } = input;
      await db.update(medicos).set(data)
        .where(and(eq(medicos.id, id), eq(medicos.companyId, companyId)));
      return { success: true };
    }),

  excluirMedico: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.delete(medicos)
        .where(and(eq(medicos.id, input.id), companyFilter(medicos.companyId, input)));
      return { success: true };
    }),

  // ========== CLÍNICAS ==========

  listarClinicas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(clinicas)
        .where(companyFilter(clinicas.companyId, input))
        .orderBy(clinicas.nome);
    }),

  buscarClinicas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), termo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(clinicas)
        .where(and(
          companyFilter(clinicas.companyId, input),
          eq(clinicas.ativo, 1),
          like(clinicas.nome, `%${input.termo}%`)
        ))
        .orderBy(clinicas.nome)
        .limit(10);
    }),

  criarClinica: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(2),
      endereco: z.string().optional(),
      telefone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const [result] = await db.insert(clinicas).values({
        companyId: input.companyId,
        nome: input.nome,
        endereco: input.endereco || null,
        telefone: input.telefone || null,
      });
      return { id: result.insertId };
    }),

  atualizarClinica: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(2).optional(),
      endereco: z.string().optional(),
      telefone: z.string().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, companyId, ...data } = input;
      await db.update(clinicas).set(data)
        .where(and(eq(clinicas.id, id), eq(clinicas.companyId, companyId)));
      return { success: true };
    }),

  excluirClinica: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.delete(clinicas)
        .where(and(eq(clinicas.id, input.id), companyFilter(clinicas.companyId, input)));
      return { success: true };
    }),
});
