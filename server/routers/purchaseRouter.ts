import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, ilike, or, sql, gte, lte, isNull } from "drizzle-orm";
import {
  fornecedores,
  purchaseCatalogItems,
  supplierPriceHistory,
  supplierEvaluations,
  supplierContracts,
  purchaseApprovalRules,
  purchaseSpendingLimits,
  ocNumberConfig,
  purchaseRequests,
  purchaseRequestItems,
  purchaseQuotations,
  purchaseQuotationSuppliers,
  purchaseQuotationTokens,
  purchaseNegotiations,
  purchaseOrders,
  purchaseOrderItems,
  purchaseReceipts,
  purchaseReceiptItems,
  purchaseReturns,
  purchaseAccountsPayable,
  budgetReallocations,
  buyerCommissions,
  emergencyMetrics,
  purchaseCancellations,
  obras,
} from "../../drizzle/schema";
import { onOCEmitida, onOCCancelada, onRecebimentoConfirmado, onComissaoAprovada } from "../services/purchaseFinancialBridge";
import crypto from "crypto";

const n = (v: any) => parseFloat(v ?? "0") || 0;

async function gerarNumeroOC(db: any, companyId: number): Promise<string> {
  const rows = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, companyId)).limit(1);
  let config = rows?.[0];
  if (!config) {
    await db.insert(ocNumberConfig).values({ companyId, prefixo: "OC", separador: "-", proximo_numero: 1 } as any);
    config = { prefixo: "OC", separador: "-", digitos_sequencial: 3, proximo_numero: 1, formato_ano: "4dig" };
  }
  const ano = new Date().getFullYear();
  const anoStr = config.formatoAno === "2dig" ? String(ano).slice(-2) : String(ano);
  const seq = String(config.proximoNumero || 1).padStart(config.digitosSequencial || 3, "0");
  const numero = `${config.prefixo || "OC"}${config.separador || "-"}${anoStr}${config.separador || "-"}${seq}`;
  await db.update(ocNumberConfig).set({ proximoNumero: (config.proximoNumero || 1) + 1 } as any).where(eq(ocNumberConfig.companyId, companyId));
  return numero;
}

export const purchaseRouter = router({

  // ══════════════════════════════════════════════════════════════
  // CATÁLOGO DE ITENS
  // ══════════════════════════════════════════════════════════════

  listarCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number(), busca: z.string().optional(), categoria: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db.select().from(purchaseCatalogItems)
        .where(and(eq(purchaseCatalogItems.companyId, input.companyId), eq(purchaseCatalogItems.ativo, 1)))
        .orderBy(asc(purchaseCatalogItems.nome));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        rows = rows.filter((r: any) => r.nome?.toLowerCase().includes(b) || r.codigo?.toLowerCase().includes(b));
      }
      if (input.categoria) rows = rows.filter((r: any) => r.categoria === input.categoria);
      return rows;
    }),

  criarItemCatalogo: protectedProcedure
    .input(z.object({
      companyId: z.number(), nome: z.string(), nomeAbreviado: z.string().optional(),
      codigo: z.string().optional(), unidade: z.string(), categoria: z.string().optional(),
      ncm: z.string().optional(), codigoSinapi: z.string().optional(),
      contaFinanceiraId: z.number().optional(), contaFinanceiraNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.insert(purchaseCatalogItems).values({ ...input } as any).returning();
      return item;
    }),

  atualizarItemCatalogo: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().optional(), unidade: z.string().optional(), categoria: z.string().optional(), ativo: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      await db.update(purchaseCatalogItems).set({ ...rest, updatedAt: new Date().toISOString() } as any).where(eq(purchaseCatalogItems.id, id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // SOLICITAÇÕES DE COMPRA (SC) — NOVO FLUXO
  // ══════════════════════════════════════════════════════════════

  listarSolicitacoesV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number().optional(), status: z.string().optional(),
      emergencial: z.boolean().optional(), page: z.number().default(1), limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseRequests.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(purchaseRequests.obraId, input.obraId));
      if (input.status) conditions.push(eq(purchaseRequests.status, input.status));
      if (input.emergencial !== undefined) conditions.push(eq(purchaseRequests.emergencial, input.emergencial ? 1 : 0));
      const rows = await db.select().from(purchaseRequests)
        .where(and(...conditions)).orderBy(desc(purchaseRequests.createdAt))
        .limit(input.limit).offset((input.page - 1) * input.limit);
      const withItens = await Promise.all(rows.map(async (sc: any) => {
        const itens = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.solicitacaoId, sc.id));
        return { ...sc, itens };
      }));
      return withItens;
    }),

  criarSolicitacaoV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(), obraNome: z.string().optional(),
      solicitanteId: z.number(), solicitanteNome: z.string().optional(),
      tipo: z.string().default("compra"), emergencial: z.boolean().default(false),
      justificativaEmergencial: z.string().optional(), prazoNecessidade: z.string().optional(),
      itens: z.array(z.object({
        catalogItemId: z.number().optional(), insumoNome: z.string(), unidade: z.string(),
        quantidade: z.number(), valorMetaUnitario: z.number().optional(), observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const valorEstimado = input.itens.reduce((s, i) => s + (i.quantidade * (i.valorMetaUnitario || 0)), 0);
      const [sc] = await db.insert(purchaseRequests).values({
        companyId: input.companyId, obraId: input.obraId, obraNome: input.obraNome,
        solicitanteId: input.solicitanteId, solicitanteNome: input.solicitanteNome,
        tipo: input.tipo, status: "pendente",
        emergencial: input.emergencial ? 1 : 0,
        justificativaEmergencial: input.justificativaEmergencial,
        prazoNecessidade: input.prazoNecessidade,
        valorEstimadoTotal: String(valorEstimado.toFixed(2)),
      } as any).returning();
      for (const item of input.itens) {
        await db.insert(purchaseRequestItems).values({
          solicitacaoId: sc.id, catalogItemId: item.catalogItemId,
          insumoNome: item.insumoNome, unidade: item.unidade,
          quantidade: String(item.quantidade), quantidadeAComprar: String(item.quantidade),
          valorMetaUnitario: item.valorMetaUnitario ? String(item.valorMetaUnitario) : null,
          observacoes: item.observacoes,
        } as any);
      }
      return sc;
    }),

  aprovarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadorId: z.number(), aprovadorNome: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseRequests).set({
        status: "aprovada", aprovadorId: input.aprovadorId, aprovadorNome: input.aprovadorNome,
        aprovadoEm: new Date().toISOString(),
      } as any).where(eq(purchaseRequests.id, input.id));
      return { ok: true };
    }),

  recusarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), justificativa: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseRequests).set({ status: "recusada", justificativaRecusa: input.justificativa } as any).where(eq(purchaseRequests.id, input.id));
      return { ok: true };
    }),

  cancelarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), motivo: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseRequests).set({ status: "cancelada" } as any).where(eq(purchaseRequests.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // COTAÇÕES — NOVO FLUXO
  // ══════════════════════════════════════════════════════════════

  listarCotacoesV2: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), page: z.number().default(1), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseQuotations.companyId, input.companyId)];
      if (input.status) conditions.push(eq(purchaseQuotations.status, input.status));
      const rows = await db.select().from(purchaseQuotations).where(and(...conditions))
        .orderBy(desc(purchaseQuotations.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
      const withData = await Promise.all(rows.map(async (cot: any) => {
        const fornecedoresRows = await db.select().from(purchaseQuotationSuppliers).where(eq(purchaseQuotationSuppliers.cotacaoId, cot.id));
        return { ...cot, fornecedores: fornecedoresRows };
      }));
      return withData;
    }),

  criarCotacao: protectedProcedure
    .input(z.object({
      companyId: z.number(), solicitacaoId: z.number(), compradorId: z.number().optional(),
      compradorNome: z.string().optional(), validadeDias: z.number().default(5),
      fornecedorIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const validadeAte = new Date();
      validadeAte.setDate(validadeAte.getDate() + input.validadeDias);
      const [cot] = await db.insert(purchaseQuotations).values({
        companyId: input.companyId, solicitacaoId: input.solicitacaoId,
        compradorId: input.compradorId, compradorNome: input.compradorNome,
        validadeDias: input.validadeDias, validadeAte: validadeAte.toISOString().split("T")[0],
        status: "aberta",
      } as any).returning();
      for (const suppId of input.fornecedorIds) {
        const sup = await db.select().from(fornecedores).where(eq(fornecedores.id, suppId)).limit(1);
        const [qs] = await db.insert(purchaseQuotationSuppliers).values({
          cotacaoId: cot.id, supplierId: suppId,
          supplierNome: sup?.[0]?.razaoSocial || String(suppId), status: "aguardando",
        } as any).returning();
        const token = crypto.randomBytes(32).toString("hex");
        await db.insert(purchaseQuotationTokens).values({
          companyId: input.companyId, cotacaoId: cot.id, quotationSupplierId: qs.id,
          supplierId: suppId, supplierNome: sup?.[0]?.razaoSocial,
          supplierEmail: sup?.[0]?.email, token,
          expiresAt: validadeAte.toISOString(),
        } as any);
      }
      await db.update(purchaseRequests).set({ status: "em_cotacao" } as any).where(eq(purchaseRequests.id, input.solicitacaoId));
      return cot;
    }),

  registrarPropostaFornecedor: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(), quotationSupplierId: z.number(),
      valorUnitario: z.number(), valorFrete: z.number().default(0),
      freteTipo: z.string().default("cif"), prazoEntregaDias: z.number().optional(),
      condicaoPagamento: z.string().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const total = input.valorUnitario + input.valorFrete;
      await db.update(purchaseQuotationSuppliers).set({
        status: "respondido", valorUnitario: String(input.valorUnitario),
        valorFrete: String(input.valorFrete), freteTipo: input.freteTipo,
        valorTotalComFrete: String(total.toFixed(2)),
        prazoEntregaDias: input.prazoEntregaDias, condicaoPagamento: input.condicaoPagamento,
        observacoes: input.observacoes, respondidoEm: new Date().toISOString(),
      } as any).where(eq(purchaseQuotationSuppliers.id, input.quotationSupplierId));
      return { ok: true };
    }),

  fecharCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorVencedorId: z.number(), justificativa: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseQuotations).set({
        status: "encerrada", fornecedorVencedorId: input.fornecedorVencedorId,
        justificativaVencedor: input.justificativa,
      } as any).where(eq(purchaseQuotations.id, input.cotacaoId));
      return { ok: true };
    }),

  registrarNegociacao: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(), quotationSupplierId: z.number().optional(),
      rodada: z.number().default(1), tipo: z.string().optional(),
      valorUnitarioProposto: z.number().optional(), mensagem: z.string().optional(),
      autor: z.string().optional(), autorNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.insert(purchaseNegotiations).values({ ...input, valorUnitarioProposto: input.valorUnitarioProposto ? String(input.valorUnitarioProposto) : null } as any);
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ORDENS DE COMPRA (OC) — NOVO FLUXO
  // ══════════════════════════════════════════════════════════════

  listarOrdensV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number().optional(), status: z.string().optional(),
      supplierId: z.number().optional(), page: z.number().default(1), limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseOrders.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(purchaseOrders.obraId, input.obraId));
      if (input.status) conditions.push(eq(purchaseOrders.status, input.status));
      if (input.supplierId) conditions.push(eq(purchaseOrders.supplierId, input.supplierId));
      const rows = await db.select().from(purchaseOrders).where(and(...conditions))
        .orderBy(desc(purchaseOrders.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
      const withItens = await Promise.all(rows.map(async (o: any) => {
        const itens = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.ordemId, o.id));
        return { ...o, itens };
      }));
      return withItens;
    }),

  criarOrdemV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), solicitacaoId: z.number().optional(), cotacaoId: z.number().optional(),
      supplierId: z.number(), supplierNome: z.string().optional(),
      obraId: z.number().optional(), obraNome: z.string().optional(),
      compradorId: z.number().optional(), compradorNome: z.string().optional(),
      tipo: z.string().default("compra"), formaPagamento: z.string().optional(),
      numeroParcelas: z.number().default(1), prazoEntrega: z.string().optional(),
      valorFrete: z.number().default(0), freteTipo: z.string().default("cif"),
      enderecoEntrega: z.string().optional(), cidadeEntrega: z.string().optional(),
      estadoEntrega: z.string().optional(), cepEntrega: z.string().optional(),
      retencaoINSS: z.number().default(0), retencaoIR: z.number().default(0), retencaoISS: z.number().default(0),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        catalogItemId: z.number().optional(), insumoNome: z.string(), unidade: z.string(),
        quantidadePedida: z.number(), valorUnitario: z.number(), valorMetaUnitario: z.number().optional(),
        contaFinanceiraId: z.number().optional(),
      })),
      userId: z.number(), userName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const numero = await gerarNumeroOC(db, input.companyId);
      const valorItens = input.itens.reduce((s, i) => s + i.quantidadePedida * i.valorUnitario, 0);
      const valorTotal = valorItens + input.valorFrete - input.retencaoINSS - input.retencaoIR - input.retencaoISS;
      const [oc] = await db.insert(purchaseOrders).values({
        companyId: input.companyId, numero, solicitacaoId: input.solicitacaoId,
        cotacaoId: input.cotacaoId, supplierId: input.supplierId, supplierNome: input.supplierNome,
        obraId: input.obraId, obraNome: input.obraNome, compradorId: input.compradorId,
        compradorNome: input.compradorNome, tipo: input.tipo, status: "emitida",
        valorItens: String(valorItens.toFixed(2)), valorFrete: String(input.valorFrete),
        freteTipo: input.freteTipo, valorTotal: String(valorTotal.toFixed(2)),
        formaPagamento: input.formaPagamento, numeroParcelas: input.numeroParcelas,
        prazoEntrega: input.prazoEntrega, enderecoEntrega: input.enderecoEntrega,
        cidadeEntrega: input.cidadeEntrega, estadoEntrega: input.estadoEntrega,
        cepEntrega: input.cepEntrega,
        retencaoINSS: String(input.retencaoINSS), retencaoIR: String(input.retencaoIR), retencaoISS: String(input.retencaoISS),
        observacoes: input.observacoes, emitidaEm: new Date().toISOString(),
      } as any).returning();
      for (const item of input.itens) {
        await db.insert(purchaseOrderItems).values({
          ordemId: oc.id, catalogItemId: item.catalogItemId, insumoNome: item.insumoNome,
          unidade: item.unidade, quantidadePedida: String(item.quantidadePedida),
          valorUnitario: String(item.valorUnitario), valorTotal: String((item.quantidadePedida * item.valorUnitario).toFixed(2)),
          valorMetaUnitario: item.valorMetaUnitario ? String(item.valorMetaUnitario) : null,
          contaFinanceiraId: item.contaFinanceiraId,
        } as any);
      }
      if (input.solicitacaoId) {
        await db.update(purchaseRequests).set({ status: "em_oc" } as any).where(eq(purchaseRequests.id, input.solicitacaoId));
      }
      await onOCEmitida(oc.id, input.userId, input.userName || "Sistema");
      return oc;
    }),

  cancelarOrdem: protectedProcedure
    .input(z.object({ id: z.number(), motivo: z.string(), userId: z.number(), userName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseOrders).set({ status: "cancelada" } as any).where(eq(purchaseOrders.id, input.id));
      await onOCCancelada(input.id, input.motivo, input.userId, input.userName || "Sistema");
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // RECEBIMENTOS
  // ══════════════════════════════════════════════════════════════

  listarRecebimentos: protectedProcedure
    .input(z.object({ companyId: z.number(), ordemId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseReceipts.companyId, input.companyId)];
      if (input.ordemId) conditions.push(eq(purchaseReceipts.ordemId, input.ordemId));
      if (input.status) conditions.push(eq(purchaseReceipts.status, input.status));
      return db.select().from(purchaseReceipts).where(and(...conditions)).orderBy(desc(purchaseReceipts.createdAt));
    }),

  criarRecebimento: protectedProcedure
    .input(z.object({
      companyId: z.number(), ordemId: z.number(), obraId: z.number().optional(),
      recebedorId: z.number(), recebedorNome: z.string().optional(),
      notaFiscalNumero: z.string().optional(), observacoes: z.string().optional(),
      itens: z.array(z.object({ ordemItemId: z.number(), insumoNome: z.string().optional(), unidade: z.string().optional(), quantidadePedida: z.number().optional(), quantidadeRecebida: z.number() })),
      userId: z.number(), userName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const ordemItens = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.ordemId, input.ordemId));
      const totalPedido = ordemItens.reduce((s: number, i: any) => s + n(i.quantidadePedida), 0);
      const totalRecebido = input.itens.reduce((s, i) => s + i.quantidadeRecebida, 0);
      const status = totalRecebido >= totalPedido ? "total" : "parcial";
      const valorLiberado = ordemItens.reduce((s: number, item: any) => {
        const rec = input.itens.find(i => i.ordemItemId === item.id);
        if (!rec) return s;
        return s + (n(rec.quantidadeRecebida) * n(item.valorUnitario));
      }, 0);
      const [receb] = await db.insert(purchaseReceipts).values({
        companyId: input.companyId, ordemId: input.ordemId, obraId: input.obraId,
        recebedorId: input.recebedorId, recebedorNome: input.recebedorNome,
        notaFiscalNumero: input.notaFiscalNumero, observacoes: input.observacoes,
        status, valorLiberado: String(valorLiberado.toFixed(2)),
        recebidoEm: new Date().toISOString(),
      } as any).returning();
      for (const item of input.itens) {
        await db.insert(purchaseReceiptItems).values({
          recebimentoId: receb.id, ordemItemId: item.ordemItemId,
          insumoNome: item.insumoNome, unidade: item.unidade,
          quantidadePedida: item.quantidadePedida ? String(item.quantidadePedida) : null,
          quantidadeRecebida: String(item.quantidadeRecebida),
        } as any);
        await db.update(purchaseOrderItems).set({
          quantidadeRecebida: sql`COALESCE(quantidade_recebida,0) + ${item.quantidadeRecebida}`,
        } as any).where(eq(purchaseOrderItems.id, item.ordemItemId));
      }
      if (status === "total") {
        await db.update(purchaseOrders).set({ status: "recebido" } as any).where(eq(purchaseOrders.id, input.ordemId));
      }
      await onRecebimentoConfirmado(receb.id, input.ordemId, status as any, valorLiberado, input.userId, input.userName || "Sistema");
      return { ...receb, status };
    }),

  // ══════════════════════════════════════════════════════════════
  // CONTAS A PAGAR (AP)
  // ══════════════════════════════════════════════════════════════

  listarContasPagar: protectedProcedure
    .input(z.object({
      companyId: z.number(), status: z.string().optional(), obraId: z.number().optional(),
      vencimentoAte: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseAccountsPayable.companyId, input.companyId)];
      if (input.status) conditions.push(eq(purchaseAccountsPayable.status, input.status));
      if (input.obraId) conditions.push(eq(purchaseAccountsPayable.obraId, input.obraId));
      if (input.vencimentoAte) conditions.push(lte(purchaseAccountsPayable.dataVencimento, input.vencimentoAte));
      return db.select().from(purchaseAccountsPayable).where(and(...conditions)).orderBy(asc(purchaseAccountsPayable.dataVencimento));
    }),

  marcarPago: protectedProcedure
    .input(z.object({ id: z.number(), dataPagamento: z.string(), comprovanteUrl: z.string().optional(), valorPago: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseAccountsPayable).where(eq(purchaseAccountsPayable.id, input.id)).limit(1);
      const ap = rows?.[0];
      await db.update(purchaseAccountsPayable).set({
        status: "pago", dataPagamento: input.dataPagamento,
        valorPago: String(input.valorPago ?? ap?.valorTotal ?? "0"),
        comprovanteUrl: input.comprovanteUrl,
      } as any).where(eq(purchaseAccountsPayable.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // REALOCAÇÕES DE VERBA
  // ══════════════════════════════════════════════════════════════

  listarRealocacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(budgetReallocations.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(budgetReallocations.obraId, input.obraId));
      return db.select().from(budgetReallocations).where(and(...conditions)).orderBy(desc(budgetReallocations.createdAt));
    }),

  criarRealocacao: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(),
      origemEapItemId: z.number().optional(), origemEapItemNome: z.string().optional(),
      destinoEapItemId: z.number().optional(), destinoEapItemNome: z.string().optional(),
      valorRealocado: z.number(), motivo: z.string(),
      usuarioId: z.number(), usuarioNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [r] = await db.insert(budgetReallocations).values({
        ...input, valorRealocado: String(input.valorRealocado),
      } as any).returning();
      return r;
    }),

  // ══════════════════════════════════════════════════════════════
  // COMISSÕES DE COMPRADOR
  // ══════════════════════════════════════════════════════════════

  listarComissoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), compradorId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(buyerCommissions.companyId, input.companyId)];
      if (input.status) conditions.push(eq(buyerCommissions.status, input.status));
      if (input.compradorId) conditions.push(eq(buyerCommissions.compradorId, input.compradorId));
      return db.select().from(buyerCommissions).where(and(...conditions)).orderBy(desc(buyerCommissions.createdAt));
    }),

  calcularComissoes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), compradorId: z.number(), compradorNome: z.string().optional(), obraNome: z.string().optional(), percentualParticipacao: z.number().default(5) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const ocs = await db.select().from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, input.companyId), eq(purchaseOrders.obraId, input.obraId), eq(purchaseOrders.compradorId, input.compradorId)));
      const valorComprado = ocs.reduce((s: number, o: any) => s + n(o.valorTotal), 0);
      const scs = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.obraId, input.obraId)));
      const valorMeta = scs.reduce((s: number, sc: any) => s + n(sc.valorMetaTotal), 0);
      const economia = Math.max(0, valorMeta - valorComprado);
      const comissao = economia * (input.percentualParticipacao / 100);
      const [c] = await db.insert(buyerCommissions).values({
        companyId: input.companyId, obraId: input.obraId, obraNome: input.obraNome,
        compradorId: input.compradorId, compradorNome: input.compradorNome,
        valorMetaTotal: String(valorMeta.toFixed(2)), valorCompradoTotal: String(valorComprado.toFixed(2)),
        economiaTotal: String(economia.toFixed(2)), percentualParticipacao: String(input.percentualParticipacao),
        valorComissao: String(comissao.toFixed(2)), calculadoEm: new Date().toISOString(),
      } as any).returning();
      return c;
    }),

  aprovarComissao: protectedProcedure
    .input(z.object({ id: z.number(), userId: z.number(), userName: z.string().optional() }))
    .mutation(async ({ input }) => {
      await onComissaoAprovada(input.id, input.userId, input.userName || "Diretor");
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // EMERGENCIAL
  // ══════════════════════════════════════════════════════════════

  metricsEmergencial: protectedProcedure
    .input(z.object({ companyId: z.number(), mes: z.number().optional(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const agora = new Date();
      const mes = input.mes || agora.getMonth() + 1;
      const ano = input.ano || agora.getFullYear();
      const emerg = await db.select().from(emergencyMetrics)
        .where(and(eq(emergencyMetrics.companyId, input.companyId), eq(emergencyMetrics.mes, mes), eq(emergencyMetrics.ano, ano)));
      const scsEmerg = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.emergencial, 1)));
      return { metrics: emerg, totalEmergenciais: scsEmerg.length, emergenciais: scsEmerg };
    }),

  // ══════════════════════════════════════════════════════════════
  // APROVAÇÕES PENDENTES
  // ══════════════════════════════════════════════════════════════

  pendentesAprovacao: protectedProcedure
    .input(z.object({ companyId: z.number(), aprovadorId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const scs = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.status, "pendente")))
        .orderBy(desc(purchaseRequests.emergencial), asc(purchaseRequests.prazoNecessidade));
      return scs;
    }),

  // ══════════════════════════════════════════════════════════════
  // PORTAL DO FORNECEDOR (por token)
  // ══════════════════════════════════════════════════════════════

  verificarTokenPortal: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseQuotationTokens)
        .where(eq(purchaseQuotationTokens.token, input.token)).limit(1);
      const tok = rows?.[0];
      if (!tok) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      if (tok.expiresAt && new Date(tok.expiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token expirado" });
      }
      await db.update(purchaseQuotationTokens).set({ accessedAt: new Date().toISOString() } as any).where(eq(purchaseQuotationTokens.token, input.token));
      const cot = await db.select().from(purchaseQuotations).where(eq(purchaseQuotations.id, tok.cotacaoId)).limit(1);
      const sc = cot?.[0]?.solicitacaoId
        ? await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, cot[0].solicitacaoId)).limit(1)
        : [];
      const itens = sc?.[0]?.id
        ? await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.solicitacaoId, sc[0].id))
        : [];
      return { token: tok, cotacao: cot?.[0], solicitacao: sc?.[0], itens };
    }),

  submeterPropostaPortal: protectedProcedure
    .input(z.object({
      token: z.string(), valorUnitario: z.number(), valorFrete: z.number().default(0),
      freteTipo: z.string().default("cif"), prazoEntregaDias: z.number().optional(),
      condicaoPagamento: z.string().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseQuotationTokens).where(eq(purchaseQuotationTokens.token, input.token)).limit(1);
      const tok = rows?.[0];
      if (!tok) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      const total = input.valorUnitario + input.valorFrete;
      await db.update(purchaseQuotationSuppliers).set({
        status: "respondido", valorUnitario: String(input.valorUnitario),
        valorFrete: String(input.valorFrete), freteTipo: input.freteTipo,
        valorTotalComFrete: String(total.toFixed(2)), prazoEntregaDias: input.prazoEntregaDias,
        condicaoPagamento: input.condicaoPagamento, observacoes: input.observacoes,
        respondidoEm: new Date().toISOString(),
      } as any).where(eq(purchaseQuotationSuppliers.id, tok.quotationSupplierId));
      await db.update(purchaseQuotationTokens).set({ status: "respondido", respondedAt: new Date().toISOString() } as any).where(eq(purchaseQuotationTokens.token, input.token));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES
  // ══════════════════════════════════════════════════════════════

  getConfigCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const config = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
      const regras = await db.select().from(purchaseApprovalRules)
        .where(and(eq(purchaseApprovalRules.companyId, input.companyId), eq(purchaseApprovalRules.ativo, 1)));
      const limites = await db.select().from(purchaseSpendingLimits)
        .where(and(eq(purchaseSpendingLimits.companyId, input.companyId), eq(purchaseSpendingLimits.ativo, 1)));
      return { config: config?.[0] ?? null, regras, limites };
    }),

  salvarConfigOC: protectedProcedure
    .input(z.object({
      companyId: z.number(), prefixo: z.string().optional(), separador: z.string().optional(),
      formatoAno: z.string().optional(), digitosSequencial: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, ...rest } = input;
      const existing = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, companyId)).limit(1);
      if (existing.length) {
        await db.update(ocNumberConfig).set({ ...rest, updatedAt: new Date().toISOString() } as any).where(eq(ocNumberConfig.companyId, companyId));
      } else {
        await db.insert(ocNumberConfig).values({ companyId, ...rest } as any);
      }
      return { ok: true };
    }),

  salvarRegraAprovacao: protectedProcedure
    .input(z.object({
      id: z.number().optional(), companyId: z.number(), nome: z.string(),
      obraId: z.number().optional(), nivel1AprovadorId: z.number().optional(),
      nivel1AprovadorTipo: z.string().optional(), nivel1Cargo: z.string().optional(),
      nivel1PrazoHoras: z.number().optional(), nivel2Ativo: z.boolean().optional(),
      nivel2AprovadorId: z.number().optional(), nivel2PrazoHoras: z.number().optional(),
      limiteCompraDireta: z.number().optional(), slaEmergencialHoras: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const data = { ...rest, nivel2Ativo: rest.nivel2Ativo ? 1 : 0, limiteCompraDireta: rest.limiteCompraDireta ? String(rest.limiteCompraDireta) : null } as any;
      if (id) {
        await db.update(purchaseApprovalRules).set(data).where(eq(purchaseApprovalRules.id, id));
      } else {
        await db.insert(purchaseApprovalRules).values(data);
      }
      return { ok: true };
    }),

  salvarLimiteGasto: protectedProcedure
    .input(z.object({
      id: z.number().optional(), companyId: z.number(), nome: z.string().optional(),
      obraId: z.number().optional(), catalogCategoria: z.string().optional(),
      periodoTipo: z.string().optional(), valorLimite: z.number(),
      acaoAoAtingir: z.string().optional(), alertaPercentual: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const data = { ...rest, valorLimite: String(input.valorLimite) } as any;
      if (id) {
        await db.update(purchaseSpendingLimits).set(data).where(eq(purchaseSpendingLimits.id, id));
      } else {
        await db.insert(purchaseSpendingLimits).values(data);
      }
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // DASHBOARD — painel de resumo
  // ══════════════════════════════════════════════════════════════

  dashboardCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scs, ocs, pendentes, emerg, ap] = await Promise.all([
        db.select().from(purchaseRequests).where(eq(purchaseRequests.companyId, input.companyId)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, input.companyId)),
        db.select().from(purchaseRequests).where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.status, "pendente"))),
        db.select().from(purchaseRequests).where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.emergencial, 1))),
        db.select().from(purchaseAccountsPayable).where(and(eq(purchaseAccountsPayable.companyId, input.companyId), eq(purchaseAccountsPayable.status, "pendente"))),
      ]);
      const valorTotalOCs = ocs.reduce((s: number, o: any) => s + n(o.valorTotal), 0);
      const valorAPendente = ap.reduce((s: number, a: any) => s + (n(a.valorTotal) - n(a.valorPago)), 0);
      return {
        totalSCs: scs.length, totalOCs: ocs.length,
        scsPendentes: pendentes.length, scsEmergenciais: emerg.length,
        valorTotalOCs, valorAPendente,
        statusOCs: ocs.reduce((acc: any, o: any) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {}),
      };
    }),

  // Avaliações de fornecedor
  listarAvaliacoesFornecedor: protectedProcedure
    .input(z.object({ companyId: z.number(), supplierId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(supplierEvaluations.companyId, input.companyId)];
      if (input.supplierId) conditions.push(eq(supplierEvaluations.supplierId, input.supplierId));
      return db.select().from(supplierEvaluations).where(and(...conditions)).orderBy(desc(supplierEvaluations.createdAt));
    }),

  criarAvaliacaoFornecedor: protectedProcedure
    .input(z.object({
      companyId: z.number(), supplierId: z.number(), ordemCompraId: z.number().optional(),
      notaPrazo: z.number(), notaQualidade: z.number(), notaAtendimento: z.number(),
      observacoes: z.string().optional(), avaliadorId: z.number(), avaliadorNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const media = ((input.notaPrazo + input.notaQualidade + input.notaAtendimento) / 3).toFixed(2);
      const [av] = await db.insert(supplierEvaluations).values({ ...input, mediaGeral: media } as any).returning();
      return av;
    }),

  // Contratos de fornecedor
  listarContratosFornecedor: protectedProcedure
    .input(z.object({ companyId: z.number(), supplierId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(supplierContracts.companyId, input.companyId)];
      if (input.supplierId) conditions.push(eq(supplierContracts.supplierId, input.supplierId));
      if (input.status) conditions.push(eq(supplierContracts.status, input.status));
      return db.select().from(supplierContracts).where(and(...conditions)).orderBy(desc(supplierContracts.dataFim));
    }),

  criarContratoFornecedor: protectedProcedure
    .input(z.object({
      companyId: z.number(), supplierId: z.number(), supplierNome: z.string().optional(),
      catalogItemId: z.number().optional(), itemNome: z.string().optional(),
      valorUnitario: z.number(), unidade: z.string().optional(),
      dataInicio: z.string(), dataFim: z.string(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [c] = await db.insert(supplierContracts).values({ ...input, valorUnitario: String(input.valorUnitario) } as any).returning();
      return c;
    }),

  // Histórico de preços
  historicoPrecosItem: protectedProcedure
    .input(z.object({ companyId: z.number(), catalogItemId: z.number(), supplierId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(supplierPriceHistory.companyId, input.companyId), eq(supplierPriceHistory.catalogItemId, input.catalogItemId)];
      if (input.supplierId) conditions.push(eq(supplierPriceHistory.supplierId, input.supplierId));
      return db.select().from(supplierPriceHistory).where(and(...conditions)).orderBy(desc(supplierPriceHistory.dataReferencia)).limit(50);
    }),
});
