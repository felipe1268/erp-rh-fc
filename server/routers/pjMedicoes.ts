import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { pjMedicoes, pjContracts, employees, comprasOrdens, financialEntries, financialEntryBaixas } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { _assertCompanyAccess } from "./compras";
const n = (v: any) => parseFloat(v ?? "0") || 0;

// Último dia do mês de referência (YYYY-MM → YYYY-MM-DD)
function ultimoDiaDoMes(mesRef: string): string {
  const [ano, mes] = mesRef.split("-").map(Number);
  const ultimo = new Date(ano, mes, 0).getDate(); // dia 0 do mês seguinte
  return `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

// Monta o texto "Dados de pagamento" a partir do contrato PJ
function dadosPagamentoContrato(contrato: any): string {
  if (!contrato) return "";
  const partes: string[] = [];
  if (contrato.formaPagamento) partes.push(`Forma: ${contrato.formaPagamento}`);
  if (contrato.pixPrestador) partes.push(`PIX: ${contrato.pixPrestador}`);
  const banco = [contrato.bancoPrestador, contrato.agenciaPrestador ? `Ag ${contrato.agenciaPrestador}` : null, contrato.contaPrestador ? `Cc ${contrato.contaPrestador}` : null].filter(Boolean).join(" ");
  if (banco) partes.push(`Banco: ${banco}`);
  return partes.join(" · ");
}

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
      dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await _assertCompanyAccess(ctx.user, input.companyId);

      // Verificar se já existe medição para este contrato/mês
      const existing = await db.select().from(pjMedicoes)
        .where(and(
          eq(pjMedicoes.contractId, input.contractId),
          eq(pjMedicoes.mesReferencia, input.mesReferencia),
        ));
      if (existing.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Já existe medição para este contrato neste mês' });
      }

      const [contrato] = await db.select().from(pjContracts).where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
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

      let fdDesconto = 0;
      let fdDetalhe = "";
      if (contrato) {
        const fdConsumido = n((contrato as any).fdConsumido);
        const limiteFd = n((contrato as any).limiteFd);
        if (limiteFd > 0) {
          const ocsfd = await db.select({ id: comprasOrdens.id, fdValor: comprasOrdens.fdValor, descricao: comprasOrdens.descricao })
            .from(comprasOrdens)
            .where(and(
              eq(comprasOrdens.companyId, input.companyId),
              sql`${comprasOrdens.modalidadeFd} = 'fd_terceiro'`,
              sql`${comprasOrdens.fdStatus} = 'aprovado'`,
              sql`${comprasOrdens.status} != 'cancelada'`,
              sql`${comprasOrdens.contratoId} = ${input.contractId}`,
            ));
          const totalFdAprovado = ocsfd.reduce((s, o) => s + n(o.fdValor), 0);
          const fdPendente = totalFdAprovado - fdConsumido;
          if (fdPendente > 0) {
            fdDesconto = Math.min(fdPendente, valorLiquidoFinal);
            fdDetalhe = `Desconto FD Terceiro: R$ ${fdDesconto.toFixed(2)} (OCs: ${ocsfd.map(o => `#${o.id}`).join(", ")})`;
            valorLiquidoFinal -= fdDesconto;
          }
        }
      }

      await db.insert(pjMedicoes).values({
        ...input,
        dataVencimento: input.dataVencimento || ultimoDiaDoMes(input.mesReferencia),
        valorLiquido: String(valorLiquidoFinal.toFixed(2)),
        notaFiscalNumero: input.notaFiscalNumero || null,
        observacoes: input.observacoes ? `${input.observacoes}${valorRetencao > 0 ? `\nRetenção técnica: R$ ${valorRetencao.toFixed(2)}` : ""}` : (valorRetencao > 0 ? `Retenção técnica: R$ ${valorRetencao.toFixed(2)}` : null),
        descricaoDescontos: input.descricaoDescontos || null,
        descricaoAcrescimos: input.descricaoAcrescimos || null,
        fdDesconto: String(fdDesconto.toFixed(2)),
        fdDetalhe: fdDetalhe || null,
        criadoPor: ctx.user.name ?? 'Sistema',
      } as any);

      if (contrato) {
        const newMedido = parseFloat(String((contrato as any).valorMedido ?? "0")) + parseFloat(input.valorBruto);
        const newRetido = parseFloat(String((contrato as any).valorRetido ?? "0")) + valorRetencao;
        const updateData: any = {
          valorMedido: String(newMedido.toFixed(2)),
          valorRetido: String(newRetido.toFixed(2)),
          updatedAt: new Date().toISOString(),
        };
        if (fdDesconto > 0) {
          updateData.fdConsumido = String((n((contrato as any).fdConsumido) + fdDesconto).toFixed(2));
        }
        await db.update(pjContracts).set(updateData).where(and(eq(pjContracts.id, input.contractId), eq(pjContracts.companyId, input.companyId)));
      }

      return { success: true, retencaoAplicada: valorRetencao, fdDescontado: fdDesconto };
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [med] = await db.select().from(pjMedicoes).where(and(eq(pjMedicoes.id, input.id), eq(pjMedicoes.companyId, input.companyId)));
      if (!med) throw new TRPCError({ code: 'NOT_FOUND', message: 'Medição não encontrada' });
      if (med.status === 'paga') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Medição já paga não pode ser alterada' });
      const { id, companyId, ...rest } = input;
      const updateData: any = {};
      Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
      await db.update(pjMedicoes).set(updateData).where(and(eq(pjMedicoes.id, id), eq(pjMedicoes.companyId, companyId)));

      // Rev. 5143 — Cancelou a medição? Cancela o título vinculado no Contas a Pagar
      // (só se ainda estiver a_pagar e sem baixa ativa — título com baixa é intocável).
      if (input.status === 'cancelada') {
        try {
          const [entry] = await db.select().from(financialEntries).where(and(
            eq(financialEntries.origemModulo, 'pj_medicao'),
            eq(financialEntries.origemId, id),
            eq(financialEntries.companyId, companyId),
            sql`${financialEntries.status} NOT IN ('pago','cancelado')`,
          ));
          if (entry) {
            const baixas = await db.select({ id: financialEntryBaixas.id }).from(financialEntryBaixas)
              .where(and(eq(financialEntryBaixas.entryId, entry.id), sql`${financialEntryBaixas.estornadaEm} IS NULL`));
            if (baixas.length === 0) {
              await db.update(financialEntries).set({
                status: 'cancelado',
                motivoCancelamento: 'Medição PJ cancelada',
                updatedAt: sql`NOW()`,
              } as any).where(eq(financialEntries.id, entry.id));
            }
          }
        } catch (e: any) {
          console.error('[pjMedicoes.atualizar] falha ao cancelar título vinculado:', e?.message ?? e);
        }
      }
      return { success: true };
    }),

  aprovar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await _assertCompanyAccess(ctx.user, input.companyId);
      const conditions = [eq(pjMedicoes.id, input.id), eq(pjMedicoes.companyId, input.companyId)];
      const [med] = await db.select().from(pjMedicoes).where(and(...conditions));
      if (!med) throw new TRPCError({ code: 'NOT_FOUND', message: 'Medição não encontrada' });
      if (!['rascunho', 'pendente_aprovacao'].includes(med.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Medição não está pendente (status: ${med.status})` });
      }

      // Rev. 5143 — Aprovação + título no Contas a Pagar na MESMA transação:
      // ou aprova E cria o título, ou nada muda. Dedup por índice único parcial
      // (origem_modulo='pj_medicao', origem_id).
      const [contrato] = await db.select().from(pjContracts)
        .where(and(eq(pjContracts.id, med.contractId), eq(pjContracts.companyId, input.companyId)));
      const [emp] = await db.select().from(employees).where(eq(employees.id, med.employeeId));
      const prestador = (emp as any)?.nomeCompleto || (contrato as any)?.razaoSocialPrestador || `Contrato PJ #${med.contractId}`;
      const valorLiquido = n((med as any).valorLiquido);
      if (!Number.isFinite(valorLiquido) || valorLiquido <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Medição com valor líquido inválido — não é possível aprovar.' });
      }
      const pagto = dadosPagamentoContrato(contrato);
      const vencimento = (med as any).dataVencimento || ultimoDiaDoMes(med.mesReferencia);

      await db.transaction(async (tx) => {
        // Atualização condicional: só aprova se ainda pendente (anti-corrida)
        const upd = await tx.update(pjMedicoes).set({
          status: 'aprovada',
          aprovadoPor: ctx.user.name ?? 'Sistema',
          aprovadoEm: sql`NOW()`,
        } as any).where(and(...conditions, sql`${pjMedicoes.status} IN ('rascunho','pendente_aprovacao')`)).returning({ id: pjMedicoes.id });
        if (!upd.length) throw new TRPCError({ code: 'CONFLICT', message: 'Medição já foi processada por outra ação.' });

        await tx.insert(financialEntries).values({
          companyId: med.companyId,
          contaId: 391,
          contaNome: 'Serviços PJ / Terceirizados',
          tipo: 'despesa',
          natureza: 'variavel',
          valorPrevisto: String(valorLiquido.toFixed(2)),
          dataCompetencia: `${med.mesReferencia}-01`,
          dataVencimento: vencimento,
          status: 'a_pagar',
          origemModulo: 'pj_medicao',
          origemId: med.id,
          origemDescricao: `Medição PJ ${med.mesReferencia} — ${prestador}`,
          descricao: `Medição PJ ${med.mesReferencia} — ${prestador}${pagto ? `\nDados de pagamento (contrato): ${pagto}` : ''}`,
          fornecedorNome: prestador,
          criadoPorNome: ctx.user.name ?? 'Sistema',
        } as any).onConflictDoNothing();
      });

      return { success: true };
    }),

  registrarPagamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      comprovanteUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await _assertCompanyAccess(ctx.user, input.companyId);
      const conditions = [eq(pjMedicoes.id, input.id), eq(pjMedicoes.companyId, input.companyId)];
      const [med] = await db.select().from(pjMedicoes).where(and(...conditions));
      if (!med) throw new TRPCError({ code: 'NOT_FOUND', message: 'Medição não encontrada' });

      // Rev. 5143 — Pagamento da medição + baixa do título vinculado na MESMA
      // transação, com lock do entry (anti-corrida de baixa dupla). Se o título
      // já foi baixado pelo Financeiro, não mexe nele.
      await db.transaction(async (tx) => {
        await tx.update(pjMedicoes).set({
          status: 'paga',
          dataPagamento: input.dataPagamento,
          comprovanteUrl: input.comprovanteUrl || null,
        } as any).where(and(...conditions));

        const lockRes: any = await tx.execute(sql`
          SELECT id, valor_previsto FROM financial_entries
          WHERE origem_modulo = 'pj_medicao' AND origem_id = ${med.id}
            AND company_id = ${med.companyId}
            AND status NOT IN ('pago','cancelado')
          FOR UPDATE
        `);
        const entry = (lockRes?.rows ?? lockRes)?.[0];
        if (entry) {
          const baixas = await tx.select({ id: financialEntryBaixas.id }).from(financialEntryBaixas)
            .where(and(eq(financialEntryBaixas.entryId, entry.id), sql`${financialEntryBaixas.estornadaEm} IS NULL`));
          if (baixas.length === 0) {
            await tx.insert(financialEntryBaixas).values({
              entryId: entry.id,
              companyId: med.companyId,
              tipo: 'despesa',
              valor: entry.valor_previsto,
              data: input.dataPagamento,
              comprovanteUrl: input.comprovanteUrl || null,
              quitouTotal: 1,
              observacoes: 'Pagamento registrado no módulo Medições PJ',
            } as any);
            await tx.update(financialEntries).set({
              status: 'pago',
              valorRealizado: entry.valor_previsto,
              dataPagamento: input.dataPagamento,
              updatedAt: sql`NOW()`,
            } as any).where(eq(financialEntries.id, entry.id));
          }
        }
      });
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
