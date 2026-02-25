import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { pjMedicoes, pjContracts, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const pjMedicoesRouter = router({
  // Listar medições
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string().optional(),
      status: z.string().optional(),
      contractId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [eq(pjMedicoes.companyId, input.companyId)];
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
    .input(z.object({
      companyId: z.number(),
      contractId: z.number(),
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

      await db.insert(pjMedicoes).values({
        ...input,
        notaFiscalNumero: input.notaFiscalNumero || null,
        observacoes: input.observacoes || null,
        descricaoDescontos: input.descricaoDescontos || null,
        descricaoAcrescimos: input.descricaoAcrescimos || null,
        criadoPor: ctx.user.name ?? 'Sistema',
      });
      return { success: true };
    }),

  // Atualizar medição
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      horasTrabalhadas: z.string().optional(),
      valorBruto: z.string().optional(),
      descontos: z.string().optional(),
      acrescimos: z.string().optional(),
      descricaoDescontos: z.string().optional(),
      descricaoAcrescimos: z.string().optional(),
      valorLiquido: z.string().optional(),
      notaFiscalNumero: z.string().optional(),
      observacoes: z.string().optional(),
      status: z.enum(['rascunho','pendente_aprovacao','aprovada','paga','cancelada']).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...rest } = input;
      const updateData: any = {};
      Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
      await db.update(pjMedicoes).set(updateData).where(eq(pjMedicoes.id, id));
      return { success: true };
    }),

  // Aprovar medição
  aprovar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(pjMedicoes).set({
        status: 'aprovada',
        aprovadoPor: ctx.user.name ?? 'Sistema',
        aprovadoEm: sql`NOW()`,
      } as any).where(eq(pjMedicoes.id, input.id));
      return { success: true };
    }),

  // Registrar pagamento
  registrarPagamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      dataPagamento: z.string(),
      comprovanteUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(pjMedicoes).set({
        status: 'paga',
        dataPagamento: input.dataPagamento,
        comprovanteUrl: input.comprovanteUrl || null,
      } as any).where(eq(pjMedicoes.id, input.id));
      return { success: true };
    }),

  // Resumo mensal de PJ
  resumoMensal: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const medicoes = await db.select().from(pjMedicoes)
        .where(and(
          eq(pjMedicoes.companyId, input.companyId),
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
