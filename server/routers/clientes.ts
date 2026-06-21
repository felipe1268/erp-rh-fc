import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { clientes } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const integracaoFields = {
  integracaoRequer:        z.boolean().optional(),
  integracaoDiasSemana:    z.string().optional(),
  integracaoDuracao:       z.string().optional(),
  integracaoValidadeMeses: z.number().optional(),
  integracaoEmail:         z.string().optional(),
  integracaoPlataforma:    z.string().optional(),
  integracaoProcedimento:  z.string().optional(),
};

// Rev. 3453 — campos PF
const pfFields = {
  rg:             z.string().optional(),
  orgaoEmissor:   z.string().optional(),
  dataNascimento: z.string().nullable().optional(),
  estadoCivil:    z.string().optional(),
  sexo:           z.string().optional(),
  profissao:      z.string().optional(),
  nacionalidade:  z.string().optional(),
};

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
      logoUrl:         z.string().nullable().optional(),
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
      ...integracaoFields,
      ...pfFields,
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(clientes).values({
        companyId:               input.companyId,
        tipo:                    input.tipo,
        cnpj:                    input.cnpj,
        cpf:                     input.cpf,
        razaoSocial:             input.razaoSocial,
        nomeFantasia:            input.nomeFantasia,
        logoUrl:                 input.logoUrl,
        situacaoReceita:         input.situacaoReceita,
        endereco:                input.endereco,
        numero:                  input.numero,
        complemento:             input.complemento,
        bairro:                  input.bairro,
        cidade:                  input.cidade,
        estado:                  input.estado,
        cep:                     input.cep,
        telefone:                input.telefone,
        email:                   input.email,
        contatoNome:             input.contatoNome,
        contatoCelular:          input.contatoCelular,
        contatoEmail:            input.contatoEmail,
        observacoes:             input.observacoes,
        integracaoRequer:        input.integracaoRequer ?? false,
        integracaoDiasSemana:    input.integracaoDiasSemana,
        integracaoDuracao:       input.integracaoDuracao,
        integracaoValidadeMeses: input.integracaoValidadeMeses,
        integracaoEmail:         input.integracaoEmail,
        integracaoPlataforma:    input.integracaoPlataforma,
        integracaoProcedimento:  input.integracaoProcedimento,
        rg:                      input.rg,
        orgaoEmissor:            input.orgaoEmissor,
        dataNascimento:          input.dataNascimento || null,
        estadoCivil:             input.estadoCivil,
        sexo:                    input.sexo,
        profissao:               input.profissao,
        nacionalidade:           input.nacionalidade,
      }).returning();
      return row;
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id:              z.number(),
      companyId:       z.number(),
      tipo:            z.string().optional(),
      cnpj:            z.string().optional(),
      cpf:             z.string().optional(),
      razaoSocial:     z.string().optional(),
      nomeFantasia:    z.string().optional(),
      logoUrl:         z.string().nullable().optional(),
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
      ...integracaoFields,
      ...pfFields,
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      // Rev. 3455 — sanitizar campos de data: string vazia → null (Postgres rejeita "" em col DATE)
      if ("dataNascimento" in data) data.dataNascimento = data.dataNascimento || null;
      await db.update(clientes).set({ ...data, atualizadoEm: new Date().toISOString() }).where(and(eq(clientes.id, id), eq(clientes.companyId, companyId)));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(clientes).where(and(eq(clientes.id, input.id), eq(clientes.companyId, input.companyId)));
      return { success: true };
    }),
});
