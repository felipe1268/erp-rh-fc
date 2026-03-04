import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { medicos, clinicas } from "../../drizzle/schema";
import { eq, and, like, desc } from "drizzle-orm";

export const medicosClinicasRouter = router({
  // ========== MÉDICOS ==========

  listarMedicos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(medicos)
        .where(eq(medicos.companyId, input.companyId))
        .orderBy(medicos.nome);
    }),

  buscarMedicos: protectedProcedure
    .input(z.object({ companyId: z.number(), termo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(medicos)
        .where(and(
          eq(medicos.companyId, input.companyId),
          eq(medicos.ativo, 1),
          like(medicos.nome, `%${input.termo}%`)
        ))
        .orderBy(medicos.nome)
        .limit(10);
    }),

  criarMedico: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(2),
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
        .where(and(eq(medicos.id, input.id), eq(medicos.companyId, input.companyId)));
      return { success: true };
    }),

  // ========== CLÍNICAS ==========

  listarClinicas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(clinicas)
        .where(eq(clinicas.companyId, input.companyId))
        .orderBy(clinicas.nome);
    }),

  buscarClinicas: protectedProcedure
    .input(z.object({ companyId: z.number(), termo: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(clinicas)
        .where(and(
          eq(clinicas.companyId, input.companyId),
          eq(clinicas.ativo, 1),
          like(clinicas.nome, `%${input.termo}%`)
        ))
        .orderBy(clinicas.nome)
        .limit(10);
    }),

  criarClinica: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(2),
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
        .where(and(eq(clinicas.id, input.id), eq(clinicas.companyId, input.companyId)));
      return { success: true };
    }),
});
