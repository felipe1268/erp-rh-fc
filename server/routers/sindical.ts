import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { dissidios, dissidioFuncionarios, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { parseBRL } from "../utils/parseBRL";

// ============================================================
// MÓDULO SINDICAL — Configurações de Dissídio Simplificado
// Cadastro de ano + percentual de reajuste
// Aplicação em massa para todos os CLT ativos da empresa
// Regra: percentual NUNCA pode regredir (Art. 468 CLT)
// ============================================================

export const sindicalRouter = router({
  // Listar todos os dissídios cadastrados (ano + percentual + status)
  listar: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input }) => {
    const db = (await getDb())!;
    const result = await db.select().from(dissidios)
      .where(companyFilter(dissidios.companyId, input))
      .orderBy(desc(dissidios.anoReferencia));
    return result;
  }),

  // Cadastrar novo ano de dissídio (ano + percentual)
  cadastrar: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), anoReferencia: z.number().min(2020).max(2050),
    percentualReajuste: z.string(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode cadastrar dissídios' });
    const db = (await getDb())!;

    // Verificar duplicidade
    const [existente] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (existente) throw new TRPCError({ code: 'CONFLICT', message: `Já existe dissídio cadastrado para o ano ${input.anoReferencia}` });

    // ===== REGRA CRÍTICA: NUNCA REGREDIR =====
    const percentualNovo = parseFloat(input.percentualReajuste);
    if (isNaN(percentualNovo) || percentualNovo <= 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Percentual de reajuste deve ser maior que zero' });
    }

    const dissidiosAnteriores = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        sql`${dissidios.anoReferencia} < ${input.anoReferencia}`,
        sql`${dissidios.status} != 'cancelado'`,
      ))
      .orderBy(desc(dissidios.anoReferencia))
      .limit(1);

    if (dissidiosAnteriores.length > 0) {
      const percentualAnterior = parseFloat(dissidiosAnteriores[0].percentualReajuste);
      if (percentualNovo < percentualAnterior) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Percentual não pode ser menor que o ano anterior (${dissidiosAnteriores[0].anoReferencia}: ${percentualAnterior}%). Valor informado: ${percentualNovo}%. Art. 468 CLT — Vedada alteração contratual lesiva.`,
        });
      }
    }

    const [result] = await db.insert(dissidios).values({
      companyId: input.companyId,
      anoReferencia: input.anoReferencia,
      titulo: `Dissídio Coletivo ${input.anoReferencia}`,
      percentualReajuste: input.percentualReajuste,
      mesDataBase: 5, // Maio — padrão construção civil
      dataBaseInicio: `${input.anoReferencia}-05-01`,
      dataBaseFim: `${input.anoReferencia + 1}-04-30`,
      status: 'rascunho',
      criadoPor: ctx.user.name || 'Sistema',
    });
    return { success: true, id: result.insertId };
  }),

  // Aplicar dissídio — reajusta TODOS os CLT ativos da empresa (sem exclusão individual)
  aplicar: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), anoReferencia: z.number(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode aplicar dissídios' });
    const db = (await getDb())!;

    // Buscar o dissídio do ano
    const [dissidio] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND', message: `Dissídio do ano ${input.anoReferencia} não encontrado` });
    if (dissidio.status === 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: `Dissídio de ${input.anoReferencia} já foi aplicado` });
    if (dissidio.status === 'cancelado') throw new TRPCError({ code: 'BAD_REQUEST', message: `Dissídio de ${input.anoReferencia} foi cancelado` });

    const percentual = parseFloat(dissidio.percentualReajuste);

    // Buscar TODOS os funcionários CLT ativos (é lei, não tem exclusão)
    const funcs = await db.select().from(employees)
      .where(and(
        companyFilter(employees.companyId, input),
        sql`${employees.status} = 'Ativo'`,
        sql`${employees.tipoContrato} != 'PJ'`,
        sql`${employees.deletedAt} IS NULL`,
      ));

    let aplicados = 0;
    const hojeStr = new Date().toISOString();

    for (const func of funcs) {
      const salarioAtual = parseBRL(func.salarioBase);
      const salarioNovo = salarioAtual * (1 + percentual / 100);
      const diferenca = salarioNovo - salarioAtual;
      const percentualReal = salarioAtual > 0 ? ((salarioNovo - salarioAtual) / salarioAtual * 100) : 0;

      // Registrar aplicação individual
      await db.insert(dissidioFuncionarios).values({
        dissidioId: dissidio.id,
        employeeId: func.id,
        companyId: input.companyId,
        salarioAnterior: salarioAtual.toFixed(2),
        salarioNovo: salarioNovo.toFixed(2),
        percentualAplicado: percentualReal.toFixed(2),
        diferencaValor: diferenca.toFixed(2),
        mesesRetroativos: 0,
        valorRetroativo: '0',
        status: 'aplicado',
        aplicadoEm: hojeStr,
      });

      // Atualizar salário do funcionário
      const valorHora = (salarioNovo / 220).toFixed(2);
      await db.update(employees).set({
        salarioBase: salarioNovo.toFixed(2),
        valorHora,
      }).where(eq(employees.id, func.id));

      aplicados++;
    }

    // Marcar dissídio como aplicado
    await db.update(dissidios).set({
      status: 'aplicado',
      dataAplicacao: new Date().toISOString().split('T')[0],
      aplicadoPor: ctx.user.name || 'Sistema',
    }).where(eq(dissidios.id, dissidio.id));

    return {
      success: true,
      aplicados,
      totalFuncionarios: funcs.length,
      percentual,
      ano: input.anoReferencia,
    };
  }),

  // Excluir dissídio (apenas rascunho)
  excluir: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), anoReferencia: z.number(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
    const db = (await getDb())!;
    const [dissidio] = await db.select().from(dissidios)
      .where(and(
        companyFilter(dissidios.companyId, input),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND' });
    if (dissidio.status === 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir um dissídio já aplicado' });

    await db.delete(dissidioFuncionarios).where(eq(dissidioFuncionarios.dissidioId, dissidio.id));
    await db.delete(dissidios).where(eq(dissidios.id, dissidio.id));
    return { success: true };
  }),
});
