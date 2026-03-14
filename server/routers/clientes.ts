import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { clientes } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const clientesRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(clientes)
        .where(eq(clientes.companyId, input.companyId))
        .orderBy(clientes.razaoSocial);
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      tipo:            z.string().default("PJ"),
      cnpj:            z.string().optional(),
      cpf:             z.string().optional(),
      razaoSocial:     z.string(),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      observacoes:     z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(clientes).values({
        companyId:       input.companyId,
        tipo:            input.tipo,
        cnpj:            input.cnpj,
        cpf:             input.cpf,
        razaoSocial:     input.razaoSocial,
        nomeFantasia:    input.nomeFantasia,
        situacaoReceita: input.situacaoReceita,
        endereco:        input.endereco,
        numero:          input.numero,
        complemento:     input.complemento,
        bairro:          input.bairro,
        cidade:          input.cidade,
        estado:          input.estado,
        cep:             input.cep,
        telefone:        input.telefone,
        email:           input.email,
        contatoNome:     input.contatoNome,
        contatoCelular:  input.contatoCelular,
        contatoEmail:    input.contatoEmail,
        observacoes:     input.observacoes,
      }).returning();
      return row;
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id:              z.number(),
      tipo:            z.string().optional(),
      cnpj:            z.string().optional(),
      cpf:             z.string().optional(),
      razaoSocial:     z.string().optional(),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      observacoes:     z.string().optional(),
      ativo:           z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(clientes).set({ ...data, atualizadoEm: new Date().toISOString() }).where(eq(clientes.id, id));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(clientes).where(eq(clientes.id, input.id));
      return { success: true };
    }),
});
