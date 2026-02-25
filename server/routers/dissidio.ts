import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { dissidios, dissidioFuncionarios, employees } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ============================================================
// MÓDULO DISSÍDIO COLETIVO — SEPARADO POR ANO
// Fundamentação Legal CLT + MTE:
// - Art. 611 CLT: Convenção Coletiva de Trabalho
// - Art. 611-A CLT: Prevalência do negociado sobre legislado
// - Art. 614 §3º CLT: Vigência máxima de 2 anos
// - Art. 616 CLT: Obrigatoriedade de negociação
// - MTE: Data-base anual para reajuste salarial
// - Lei 10.192/2001 Art. 13: Vedação reajuste automático por índice
// - Art. 468 CLT: Alteração contratual somente por mútuo consentimento
// - Súmula 277 TST: Ultratividade das normas coletivas
// ============================================================

export const dissidioRouter = router({
  // Listar dissídios por empresa (histórico por ano)
  listar: protectedProcedure.input(z.object({
    companyId: z.number(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    let conditions = [eq(dissidios.companyId, input.companyId)];
    if (input.status) {
      conditions.push(sql`${dissidios.status} = ${input.status}`);
    }
    const result = await db.select().from(dissidios)
      .where(and(...conditions))
      .orderBy(desc(dissidios.anoReferencia));
    return result;
  }),

  // Buscar dissídio por ID
  buscarPorId: protectedProcedure.input(z.object({
    id: z.number(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const [dissidio] = await db.select().from(dissidios).where(eq(dissidios.id, input.id));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dissídio não encontrado' });
    
    // Buscar funcionários afetados
    const funcs = await db.select().from(dissidioFuncionarios)
      .where(eq(dissidioFuncionarios.dissidioId, input.id));
    
    return { ...dissidio, funcionarios: funcs };
  }),

  // Buscar dissídio por ano
  buscarPorAno: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const [dissidio] = await db.select().from(dissidios)
      .where(and(
        eq(dissidios.companyId, input.companyId),
        eq(dissidios.anoReferencia, input.ano),
      ));
    return dissidio || null;
  }),

  // Criar novo dissídio
  criar: protectedProcedure.input(z.object({
    companyId: z.number(),
    anoReferencia: z.number(),
    titulo: z.string().min(1),
    sindicato: z.string().optional(),
    numeroCCT: z.string().optional(),
    mesDataBase: z.number().min(1).max(12).default(5),
    dataBaseInicio: z.string(),
    dataBaseFim: z.string(),
    percentualReajuste: z.string(),
    percentualINPC: z.string().optional(),
    percentualGanhoReal: z.string().optional(),
    pisoSalarial: z.string().optional(),
    pisoSalarialAnterior: z.string().optional(),
    valorVA: z.string().optional(),
    valorVT: z.string().optional(),
    valorSeguroVida: z.string().optional(),
    contribuicaoAssistencial: z.string().optional(),
    retroativo: z.number().default(1),
    dataRetroativoInicio: z.string().optional(),
    observacoes: z.string().optional(),
    documentoUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode criar dissídios' });
    const db = (await getDb())!;
    
    // Verificar se já existe dissídio para o mesmo ano
    const [existente] = await db.select().from(dissidios)
      .where(and(
        eq(dissidios.companyId, input.companyId),
        eq(dissidios.anoReferencia, input.anoReferencia),
      ));
    if (existente) throw new TRPCError({ code: 'CONFLICT', message: `Já existe dissídio cadastrado para o ano ${input.anoReferencia}` });
    
    // ===== REGRA DE NEGÓCIO CRÍTICA =====
    // Percentual de dissídio NUNCA pode regredir (diminuir) em relação ao ano anterior
    // Fundamentação: Art. 468 CLT — Alteração contratual lesiva é vedada
    // O reajuste salarial coletivo é um direito adquirido da categoria
    const percentualNovo = parseFloat(input.percentualReajuste);
    const dissidiosAnteriores = await db.select().from(dissidios)
      .where(and(
        eq(dissidios.companyId, input.companyId),
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
          message: `Percentual de reajuste não pode ser menor que o ano anterior (${dissidiosAnteriores[0].anoReferencia}: ${percentualAnterior}%). Valor informado: ${percentualNovo}%. Art. 468 CLT — Vedada alteração contratual lesiva.`,
        });
      }
    }
    
    const [result] = await db.insert(dissidios).values({
      ...input,
      criadoPor: ctx.user.name || 'Sistema',
    });
    return { success: true, id: result.insertId };
  }),

  // Atualizar dissídio
  atualizar: protectedProcedure.input(z.object({
    id: z.number(),
    titulo: z.string().optional(),
    sindicato: z.string().optional(),
    numeroCCT: z.string().optional(),
    mesDataBase: z.number().min(1).max(12).optional(),
    dataBaseInicio: z.string().optional(),
    dataBaseFim: z.string().optional(),
    percentualReajuste: z.string().optional(),
    percentualINPC: z.string().optional(),
    percentualGanhoReal: z.string().optional(),
    pisoSalarial: z.string().optional(),
    pisoSalarialAnterior: z.string().optional(),
    valorVA: z.string().optional(),
    valorVT: z.string().optional(),
    valorSeguroVida: z.string().optional(),
    contribuicaoAssistencial: z.string().optional(),
    retroativo: z.number().optional(),
    dataRetroativoInicio: z.string().optional(),
    observacoes: z.string().optional(),
    documentoUrl: z.string().optional(),
    status: z.enum(['rascunho','aguardando_homologacao','homologado','aplicado','cancelado']).optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
    const db = (await getDb())!;
    const { id, ...data } = input;
    
    // Se está atualizando o percentual, validar regra de não regressão
    if (data.percentualReajuste) {
      const [dissidioAtual] = await db.select().from(dissidios).where(eq(dissidios.id, id));
      if (dissidioAtual) {
        const percentualNovo = parseFloat(data.percentualReajuste);
        const dissidiosAnteriores = await db.select().from(dissidios)
          .where(and(
            eq(dissidios.companyId, dissidioAtual.companyId),
            sql`${dissidios.anoReferencia} < ${dissidioAtual.anoReferencia}`,
            sql`${dissidios.status} != 'cancelado'`,
          ))
          .orderBy(desc(dissidios.anoReferencia))
          .limit(1);
        
        if (dissidiosAnteriores.length > 0) {
          const percentualAnterior = parseFloat(dissidiosAnteriores[0].percentualReajuste);
          if (percentualNovo < percentualAnterior) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Percentual de reajuste não pode ser menor que o ano anterior (${dissidiosAnteriores[0].anoReferencia}: ${percentualAnterior}%). Valor informado: ${percentualNovo}%. Art. 468 CLT — Vedada alteração contratual lesiva.`,
            });
          }
        }
      }
    }
    
    await db.update(dissidios).set(data).where(eq(dissidios.id, id));
    return { success: true };
  }),

  // Simular aplicação do dissídio — mostra o impacto antes de aplicar
  simular: protectedProcedure.input(z.object({
    dissidioId: z.number(),
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const [dissidio] = await db.select().from(dissidios).where(eq(dissidios.id, input.dissidioId));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND' });
    
    const percentual = parseFloat(dissidio.percentualReajuste);
    const pisoNovo = dissidio.pisoSalarial ? parseFloat(dissidio.pisoSalarial) : 0;
    
    // Buscar funcionários ativos da empresa
    const funcs = await db.select({
      id: employees.id,
      nome: sql<string>`${employees.nomeCompleto}`.as('emp_nome'),
      funcao: sql<string>`${employees.funcao}`.as('emp_funcao'),
      salarioBase: employees.salarioBase,
      tipoContrato: employees.tipoContrato,
      dataAdmissao: employees.dataAdmissao,
    }).from(employees)
      .where(and(
        eq(employees.companyId, input.companyId),
        sql`${employees.status} = 'Ativo'`,
        sql`${employees.tipoContrato} != 'PJ'`,
      ));
    
    // Calcular retroativo
    let mesesRetro = 0;
    if (dissidio.retroativo && dissidio.dataRetroativoInicio) {
      const inicio = new Date(dissidio.dataRetroativoInicio + 'T00:00:00');
      const aplicacao = dissidio.dataAplicacao ? new Date(dissidio.dataAplicacao + 'T00:00:00') : new Date();
      mesesRetro = Math.max(0, (aplicacao.getFullYear() - inicio.getFullYear()) * 12 + (aplicacao.getMonth() - inicio.getMonth()));
    }
    
    const simulacao = funcs.map(f => {
      const salarioAtual = parseFloat(f.salarioBase || '0');
      let salarioNovo = salarioAtual * (1 + percentual / 100);
      
      // Se o novo salário ficar abaixo do piso, ajustar para o piso
      if (pisoNovo > 0 && salarioNovo < pisoNovo) {
        salarioNovo = pisoNovo;
      }
      
      const diferenca = salarioNovo - salarioAtual;
      const valorRetroativo = diferenca * mesesRetro;
      
      return {
        employeeId: f.id,
        nome: f.nome,
        funcao: f.funcao,
        tipoContrato: f.tipoContrato,
        salarioAtual: salarioAtual.toFixed(2),
        salarioNovo: salarioNovo.toFixed(2),
        percentualAplicado: percentual.toFixed(2),
        diferenca: diferenca.toFixed(2),
        mesesRetroativos: mesesRetro,
        valorRetroativo: valorRetroativo.toFixed(2),
      };
    });
    
    const totalFuncionarios = simulacao.length;
    const totalDiferencaMensal = simulacao.reduce((acc, s) => acc + parseFloat(s.diferenca), 0);
    const totalRetroativo = simulacao.reduce((acc, s) => acc + parseFloat(s.valorRetroativo), 0);
    
    return {
      dissidio,
      simulacao,
      resumo: {
        totalFuncionarios,
        percentualReajuste: percentual,
        mesesRetroativos: mesesRetro,
        totalDiferencaMensal: totalDiferencaMensal.toFixed(2),
        totalRetroativo: totalRetroativo.toFixed(2),
        custoTotalEstimado: (totalDiferencaMensal + totalRetroativo).toFixed(2),
      },
    };
  }),

  // Aplicar dissídio em massa — atualiza salários de todos os funcionários ativos
  aplicar: protectedProcedure.input(z.object({
    dissidioId: z.number(),
    companyId: z.number(),
    funcionariosExcluidos: z.array(z.number()).optional(), // IDs de funcionários a excluir
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas Admin Master pode aplicar dissídios' });
    const db = (await getDb())!;
    
    const [dissidio] = await db.select().from(dissidios).where(eq(dissidios.id, input.dissidioId));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND' });
    if (dissidio.status === 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este dissídio já foi aplicado' });
    if (dissidio.status === 'cancelado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este dissídio foi cancelado' });
    
    const percentual = parseFloat(dissidio.percentualReajuste);
    const pisoNovo = dissidio.pisoSalarial ? parseFloat(dissidio.pisoSalarial) : 0;
    const excluidos = new Set(input.funcionariosExcluidos || []);
    
    // Buscar funcionários ativos CLT
    const funcs = await db.select().from(employees)
      .where(and(
        eq(employees.companyId, input.companyId),
        sql`${employees.status} = 'Ativo'`,
        sql`${employees.tipoContrato} != 'PJ'`,
      ));
    
    // Calcular retroativo
    let mesesRetro = 0;
    if (dissidio.retroativo && dissidio.dataRetroativoInicio) {
      const inicio = new Date(dissidio.dataRetroativoInicio + 'T00:00:00');
      const agora = new Date();
      mesesRetro = Math.max(0, (agora.getFullYear() - inicio.getFullYear()) * 12 + (agora.getMonth() - inicio.getMonth()));
    }
    
    let aplicados = 0;
    let excluídosCount = 0;
    const hojeStr = new Date().toISOString();
    
    for (const func of funcs) {
      if (excluidos.has(func.id)) {
        // Registrar como excluído
        await db.insert(dissidioFuncionarios).values({
          dissidioId: input.dissidioId,
          employeeId: func.id,
          companyId: input.companyId,
          salarioAnterior: func.salarioBase || '0',
          salarioNovo: func.salarioBase || '0',
          percentualAplicado: '0',
          diferencaValor: '0',
          mesesRetroativos: 0,
          valorRetroativo: '0',
          status: 'excluido',
          motivoExclusao: 'Excluído manualmente na aplicação do dissídio',
        });
        excluídosCount++;
        continue;
      }
      
      const salarioAtual = parseFloat(func.salarioBase || '0');
      let salarioNovo = salarioAtual * (1 + percentual / 100);
      
      // Garantir piso salarial
      if (pisoNovo > 0 && salarioNovo < pisoNovo) {
        salarioNovo = pisoNovo;
      }
      
      const diferenca = salarioNovo - salarioAtual;
      const valorRetroativo = diferenca * mesesRetro;
      const percentualReal = salarioAtual > 0 ? ((salarioNovo - salarioAtual) / salarioAtual * 100) : 0;
      
      // Registrar aplicação individual
      await db.insert(dissidioFuncionarios).values({
        dissidioId: input.dissidioId,
        employeeId: func.id,
        companyId: input.companyId,
        salarioAnterior: salarioAtual.toFixed(2),
        salarioNovo: salarioNovo.toFixed(2),
        percentualAplicado: percentualReal.toFixed(2),
        diferencaValor: diferenca.toFixed(2),
        mesesRetroativos: mesesRetro,
        valorRetroativo: valorRetroativo.toFixed(2),
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
    }).where(eq(dissidios.id, input.dissidioId));
    
    return {
      success: true,
      aplicados,
      excluidos: excluídosCount,
      totalFuncionarios: funcs.length,
    };
  }),

  // Listar funcionários afetados por um dissídio
  funcionarios: protectedProcedure.input(z.object({
    dissidioId: z.number(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const result = await db.select({
      id: dissidioFuncionarios.id,
      employeeId: dissidioFuncionarios.employeeId,
      nome: sql<string>`${employees.nomeCompleto}`.as('emp_nome'),
      funcao: sql<string>`${employees.funcao}`.as('emp_funcao'),
      salarioAnterior: dissidioFuncionarios.salarioAnterior,
      salarioNovo: dissidioFuncionarios.salarioNovo,
      percentualAplicado: dissidioFuncionarios.percentualAplicado,
      diferencaValor: dissidioFuncionarios.diferencaValor,
      mesesRetroativos: dissidioFuncionarios.mesesRetroativos,
      valorRetroativo: dissidioFuncionarios.valorRetroativo,
      status: dissidioFuncionarios.status,
      motivoExclusao: dissidioFuncionarios.motivoExclusao,
      aplicadoEm: dissidioFuncionarios.aplicadoEm,
    }).from(dissidioFuncionarios)
      .leftJoin(employees, eq(dissidioFuncionarios.employeeId, employees.id))
      .where(eq(dissidioFuncionarios.dissidioId, input.dissidioId));
    return result;
  }),

  // Excluir dissídio (apenas rascunho)
  excluir: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin_master') throw new TRPCError({ code: 'FORBIDDEN' });
    const db = (await getDb())!;
    const [dissidio] = await db.select().from(dissidios).where(eq(dissidios.id, input.id));
    if (!dissidio) throw new TRPCError({ code: 'NOT_FOUND' });
    if (dissidio.status === 'aplicado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir um dissídio já aplicado' });
    
    await db.delete(dissidioFuncionarios).where(eq(dissidioFuncionarios.dissidioId, input.id));
    await db.delete(dissidios).where(eq(dissidios.id, input.id));
    return { success: true };
  }),

  // Resumo por ano — visão geral para dashboard
  resumoPorAno: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const lista = await db.select().from(dissidios)
      .where(eq(dissidios.companyId, input.companyId))
      .orderBy(desc(dissidios.anoReferencia));
    
    const resumos = [];
    for (const d of lista) {
      const [contagem] = await db.select({
        total: sql<number>`COUNT(*)`,
        aplicados: sql<number>`SUM(CASE WHEN ${dissidioFuncionarios.status} = 'aplicado' THEN 1 ELSE 0 END)`,
        excluidos: sql<number>`SUM(CASE WHEN ${dissidioFuncionarios.status} = 'excluido' THEN 1 ELSE 0 END)`,
      }).from(dissidioFuncionarios)
        .where(eq(dissidioFuncionarios.dissidioId, d.id));
      
      resumos.push({
        ...d,
        totalFuncionarios: contagem?.total || 0,
        funcionariosAplicados: contagem?.aplicados || 0,
        funcionariosExcluidos: contagem?.excluidos || 0,
      });
    }
    
    return resumos;
  }),
});
