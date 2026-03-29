import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { pjMedicoes, pjContracts, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";

export const pjMedicoesRouter = router({
  // Listar medições
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional(),
      status: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [companyFilter(pjMedicoes.companyId, input)];
      if (input.mesReferencia) conditions.push(eq(pjMedicoes.mesReferencia, input.mesReferencia));
      if (input.status) conditions.push(eq(pjMedicoes.status, input.status as any));
      if (input.contractId) conditions.push(eq(pjMedicoes.contractId, input.contractId));

      const medicoes = await db.select().from(pjMedicoes)
        .where(and(...conditions))
        .orderBy(desc(pjMedicoes.createdAt));

      // Buscar contratos e funcionários
      const contractIds = Array.from(new Set(medicoes.map(m => m.contractId)));
      const empIds = Array.from(new Set(medicoes.map(m => m.employeeId)));

      let contracts: any[] = [];
      let emps: any[] = [];
      if (contractIds.length > 0) {
        contracts = await db.select().from(pjContracts).where(inArray(pjContracts.id, contractIds));
      }
      if (empIds.length > 0) {
        emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      }

      const contractMap = new Map(contracts.map((c: any) => [c.id, c]));
      const empMap = new Map(emps.map((e: any) => [e.id, e]));

      return medicoes.map(m => ({
        ...m,
        contrato: contractMap.get(m.contractId) || null,
        funcionario: empMap.get(m.employeeId) || null,
      }));
    }),

  // Criar medição
  criar: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), contractId: z.number(),
      employeeId: z.number(),
      mesReferencia: z.string(),
      horasTrabalhadas: z.string(),
      valorHora: z.string(),
      valorBruto: z.string(),
      descontos: z.string().default('0'),
      acrescimos: z.string().default('0'),
      descricaoDescontos: z.string().optional(),
      descricaoAcrescimos: z.string().optional(),
      valorLiquido: z.string(),
      notaFiscalNumero: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Verificar se já existe medição para este contrato/mês
      const existing = await db.select().from(pjMedicoes)
        .where(and(
          eq(pjMedicoes.contractId, input.contractId),
          eq(pjMedicoes.mesReferencia, input.mesReferencia),
        ));
      if (existing.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Já existe medição para este contrato neste mês' });
      }

      const [contrato] = await db.select().from(pjContracts).where(eq(pjContracts.id, input.contractId));
      let valorRetencao = 0;
      let valorLiquidoFinal = parseFloat(input.valorLiquido) || 0;

      if (contrato) {
        const retPerc = parseFloat(String((contrato as any).retencaoTecnicaPerc ?? "0")) || 0;
        if (retPerc > 0) {
          const valorBruto = parseFloat(input.valorBruto) || 0;
          valorRetencao = valorBruto * (retPerc / 100);
          valorLiquidoFinal = valorLiquidoFinal - valorRetencao;
        }

        const valorTotalContrato = parseFloat(String((contrato as any).valorTotalContrato ?? "0")) || 0;
        const valorJaMedido = parseFloat(String((contrato as any).valorMedido ?? "0")) || 0;
        if (valorTotalContrato > 0 && (valorJaMedido + parseFloat(input.valorBruto)) > valorTotalContrato * 1.001) {
          const saldoDisp = Math.max(0, valorTotalContrato - valorJaMedido);
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Valor da medição (R$ ${parseFloat(input.valorBruto).toFixed(2)}) excede o saldo do contrato (R$ ${saldoDisp.toFixed(2)}).` });
        }
      }

      await db.insert(pjMedicoes).values({
        ...input,
        valorLiquido: String(valorLiquidoFinal.toFixed(2)),
        notaFiscalNumero: input.notaFiscalNumero || null,
        observacoes: input.observacoes ? `${input.observacoes}${valorRetencao > 0 ? `\nRetenção técnica: R$ ${valorRetencao.toFixed(2)}` : ""}` : (valorRetencao > 0 ? `Retenção técnica: R$ ${valorRetencao.toFixed(2)}` : null),
        descricaoDescontos: input.descricaoDescontos || null,
        descricaoAcrescimos: input.descricaoAcrescimos || null,
        criadoPor: ctx.user.name ?? 'Sistema',
      });

      if (contrato) {
        const newMedido = parseFloat(String((contrato as any).valorMedido ?? "0")) + parseFloat(input.valorBruto);
        const newRetido = parseFloat(String((contrato as any).valorRetido ?? "0")) + valorRetencao;
        await db.update(pjContracts).set({
          valorMedido: String(newMedido.toFixed(2)),
          valorRetido: String(newRetido.toFixed(2)),
          updatedAt: new Date().toISOString(),
        } as any).where(eq(pjContracts.id, input.contractId));
      }

      return { success: true, retencaoAplicada: valorRetencao };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      horasTrabalhadas: z.string().optional(),
      descricaoDescontos: z.string().optional(),
      descricaoAcrescimos: z.string().optional(),
      notaFiscalNumero: z.string().optional(),
      observacoes: z.string().optional(),
      status: z.enum(['rascunho','pendente_aprovacao','aprovada','paga','cancelada']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [med] = await db.select().from(pjMedicoes).where(and(eq(pjMedicoes.id, input.id), eq(pjMedicoes.companyId, input.companyId)));
      if (!med) throw new TRPCError({ code: 'NOT_FOUND', message: 'Medição não encontrada' });
      if (med.status === 'paga') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Medição já paga não pode ser alterada' });
      const { id, companyId, ...rest } = input;
      const updateData: any = {};
      Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
      await db.update(pjMedicoes).set(updateData).where(and(eq(pjMedicoes.id, id), eq(pjMedicoes.companyId, companyId)));
      return { success: true };
    }),

  aprovar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const conditions: any[] = [eq(pjMedicoes.id, input.id)];
      if (input.companyId) conditions.push(eq(pjMedicoes.companyId, input.companyId));
      await db.update(pjMedicoes).set({
        status: 'aprovada',
        aprovadoPor: ctx.user.name ?? 'Sistema',
        aprovadoEm: sql`NOW()`,
      } as any).where(and(...conditions));
      return { success: true };
    }),

  registrarPagamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number().optional(),
      dataPagamento: z.string(),
      comprovanteUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [eq(pjMedicoes.id, input.id)];
      if (input.companyId) conditions.push(eq(pjMedicoes.companyId, input.companyId));
      await db.update(pjMedicoes).set({
        status: 'paga',
        dataPagamento: input.dataPagamento,
        comprovanteUrl: input.comprovanteUrl || null,
      } as any).where(and(...conditions));
      return { success: true };
    }),

  // Resumo mensal de PJ
  resumoMensal: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const medicoes = await db.select().from(pjMedicoes)
        .where(and(
          companyFilter(pjMedicoes.companyId, input),
          eq(pjMedicoes.mesReferencia, input.mesReferencia),
        ));

      const parseBRL = (v: string) => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;

      return {
        totalMedicoes: medicoes.length,
        totalBruto: medicoes.reduce((s, m) => s + parseBRL(m.valorBruto), 0),
        totalLiquido: medicoes.reduce((s, m) => s + parseBRL(m.valorLiquido), 0),
        totalDescontos: medicoes.reduce((s, m) => s + parseBRL(m.descontos || '0'), 0),
        porStatus: {
          rascunho: medicoes.filter(m => m.status === 'rascunho').length,
          pendente: medicoes.filter(m => m.status === 'pendente_aprovacao').length,
          aprovada: medicoes.filter(m => m.status === 'aprovada').length,
          paga: medicoes.filter(m => m.status === 'paga').length,
          cancelada: medicoes.filter(m => m.status === 'cancelada').length,
        },
      };
    }),
});
