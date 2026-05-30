import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { gerenciadoras } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Rev. 2606 — Cadastro reutilizável de Gerenciadoras (nome + logo + contatos)
// para agilizar novas obras. Mesmo padrão de `clientes`.
export const gerenciadorasRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(gerenciadoras)
        .where(eq(gerenciadoras.companyId, input.companyId))
        .orderBy(gerenciadoras.nome);
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      nome:        z.string(),
      logoUrl:     z.string().optional(),
      cnpj:        z.string().optional(),
      telefone:    z.string().optional(),
      email:       z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(gerenciadoras).values({
        companyId:   input.companyId,
        nome:        input.nome,
        logoUrl:     input.logoUrl,
        cnpj:        input.cnpj,
        telefone:    input.telefone,
        email:       input.email,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id:          z.number(),
      companyId:   z.number(),
      nome:        z.string().optional(),
      logoUrl:     z.string().nullable().optional(),
      cnpj:        z.string().optional(),
      telefone:    z.string().optional(),
      email:       z.string().optional(),
      observacoes: z.string().optional(),
      ativo:       z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(gerenciadoras)
        .set({ ...data, atualizadoEm: new Date().toISOString() })
        .where(and(eq(gerenciadoras.id, id), eq(gerenciadoras.companyId, companyId)));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(gerenciadoras)
        .where(and(eq(gerenciadoras.id, input.id), eq(gerenciadoras.companyId, input.companyId)));
      return { success: true };
    }),
});
