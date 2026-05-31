import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getEffectiveAllowedObraIds } from "../db";
import { eq, and, desc, asc, or, sql, lte, inArray } from "drizzle-orm";
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
  purchaseAccountsPayable,
  budgetReallocations,
  buyerCommissions,
  emergencyMetrics,
  purchaseCancellations,
  obras,
  almoxarifadoRecebimentos,
  almoxarifadoRecebimentoItens,
  comprasOrdens,
  comprasOrdensItens,
  comprasSolicitacoesItens,
} from "../../drizzle/schema";
import { onOCEmitida, onOCCancelada, onRecebimentoConfirmado, onComissaoAprovada } from "../services/purchaseFinancialBridge";
import crypto from "crypto";

const n = (v: any) => parseFloat(v ?? "0") || 0;

// Rev. 2483 — Delegação pra fonte de verdade ÚNICA (compras.gerarProximoNumeroOC).
// O gerador antigo aqui usava padStart(3) enquanto compras.ts usava padStart(4) sobre
// o MESMO contador `ocNumberConfig.proximoNumero` — resultado: OCs visualmente
// duplicadas (218 vs 0218). Agora ambos compartilham a mesma função com advisory
// lock + persistência atômica + padStart(4).
import { gerarProximoNumeroOC } from "./compras";
async function gerarNumeroOC(_db: any, companyId: number): Promise<string> {
  return await gerarProximoNumeroOC(companyId, "compra");
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseRequests.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(purchaseRequests.obraId, input.obraId));
      if (input.status) conditions.push(eq(purchaseRequests.status, input.status));
      if (input.emergencial !== undefined) conditions.push(eq(purchaseRequests.emergencial, input.emergencial ? 1 : 0));
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(purchaseRequests.obraId, allowed));
      }
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
      freteTipo: z.string().default("cif"), transportadora: z.string().optional(),
      prazoEntregaDias: z.number().optional(),
      condicaoPagamento: z.string().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const freteParaTotal = input.freteTipo === "fob" ? input.valorFrete : 0;
      const total = input.valorUnitario + freteParaTotal;
      await db.update(purchaseQuotationSuppliers).set({
        status: "respondido", valorUnitario: String(input.valorUnitario),
        valorFrete: String(input.valorFrete), freteTipo: input.freteTipo,
        transportadora: input.transportadora ?? null,
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseOrders.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(purchaseOrders.obraId, input.obraId));
      if (input.status) conditions.push(eq(purchaseOrders.status, input.status));
      if (input.supplierId) conditions.push(eq(purchaseOrders.supplierId, input.supplierId));
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(purchaseOrders.obraId, allowed));
      }
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
      tipoPagamento: z.string().optional(),
      numeroParcelas: z.number().default(1), prazoEntrega: z.string().optional(),
      valorFrete: z.number().default(0), freteTipo: z.string().default("cif"),
      transportadora: z.string().optional(),
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
      const freteParaTotal = input.freteTipo === "fob" ? input.valorFrete : 0;
      const valorTotal = valorItens + freteParaTotal - input.retencaoINSS - input.retencaoIR - input.retencaoISS;
      const [oc] = await db.insert(purchaseOrders).values({
        companyId: input.companyId, numero, solicitacaoId: input.solicitacaoId,
        cotacaoId: input.cotacaoId, supplierId: input.supplierId, supplierNome: input.supplierNome,
        obraId: input.obraId, obraNome: input.obraNome, compradorId: input.compradorId,
        compradorNome: input.compradorNome, tipo: input.tipo, status: "emitida",
        valorItens: String(valorItens.toFixed(2)), valorFrete: String(input.valorFrete),
        freteTipo: input.freteTipo, transportadora: input.transportadora ?? null,
        valorTotal: String(valorTotal.toFixed(2)),
        portalToken: crypto.randomBytes(32).toString("hex"),
        formaPagamento: input.formaPagamento, tipoPagamento: input.tipoPagamento,
        numeroParcelas: input.numeroParcelas,
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

  listarParcelasOC: protectedProcedure
    .input(z.object({ ordemId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const parcelas = await db.select().from(purchaseAccountsPayable)
        .where(and(eq(purchaseAccountsPayable.ordemId, input.ordemId), eq(purchaseAccountsPayable.companyId, input.companyId)))
        .orderBy(asc(purchaseAccountsPayable.id));
      return parcelas;
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
      const rows = await db.select().from(purchaseReceipts).where(and(...conditions)).orderBy(desc(purchaseReceipts.createdAt));

      const almoxConditions: any[] = [
        eq(almoxarifadoRecebimentos.companyId, input.companyId),
        sql`${almoxarifadoRecebimentos.ordemCompraId} IS NOT NULL`,
      ];
      if (input.ordemId) almoxConditions.push(eq(almoxarifadoRecebimentos.ordemCompraId, input.ordemId));
      const almoxRows = await db.select().from(almoxarifadoRecebimentos)
        .where(and(...almoxConditions))
        .orderBy(desc(almoxarifadoRecebimentos.criadoEm));

      const almoxMapped = almoxRows
        .filter(ar => {
          if (!input.status) return true;
          const mapped = ar.temDivergencia ? "parcial" : (ar.totalItensRecebidos ?? 0) > 0 ? "total" : "pendente";
          return mapped === input.status;
        })
        .map(ar => {
          const st = ar.temDivergencia ? "parcial" : (ar.totalItensRecebidos ?? 0) > 0 ? "total" : "pendente";
          return {
            id: ar.id,
            ordemId: ar.ordemCompraId!,
            companyId: ar.companyId,
            obraId: ar.obraId,
            recebedorId: ar.usuarioId,
            recebedorNome: ar.usuarioNome || "Almoxarifado",
            status: st,
            notaFiscalNumero: ar.numeroNf || null,
            notaFiscalUrl: ar.fotoNfUrl || null,
            fotoMaterialUrl: ar.fotoMaterialUrl || null,
            observacoes: ar.observacoes,
            valorLiberado: null as string | null,
            recebidoEm: ar.criadoEm,
            createdAt: ar.criadoEm,
            _source: "almoxarifado" as const,
          };
        });

      const allRows = [
        ...rows.map(r => ({ ...r, _source: "compras" as const })),
        ...almoxMapped.filter(am => !rows.some(r => r.ordemId === am.ordemId && r.recebidoEm === am.recebidoEm)),
      ].sort((a, b) => new Date(b.recebidoEm || b.createdAt).getTime() - new Date(a.recebidoEm || a.createdAt).getTime());

      const purchaseOcMap = new Map<number, any>();
      const almoxOcMap = new Map<number, any>();

      const purchaseOcIds = [...new Set(rows.map(r => r.ordemId).filter(Boolean))];
      for (const oid of purchaseOcIds) {
        try {
          const [oc] = await db.select({
            transportadora: (purchaseOrders as any).transportadora,
            codigoRastreamento: (purchaseOrders as any).codigoRastreamento,
            freteTipo: (purchaseOrders as any).freteTipo,
            fornecedorNome: (purchaseOrders as any).fornecedorNome,
            numeroOc: (purchaseOrders as any).numeroOc,
          }).from(purchaseOrders).where(and(eq(purchaseOrders.id, oid), eq(purchaseOrders.companyId, input.companyId))).limit(1);
          if (oc) purchaseOcMap.set(oid, oc);
        } catch (e: any) {
          console.warn(`[listarRecebimentos] Erro ao buscar purchaseOrder ${oid}:`, e.message);
        }
      }

      const almoxOcIds = [...new Set(almoxMapped.map(r => r.ordemId).filter(Boolean))];
      for (const oid of almoxOcIds) {
        try {
          const [oc] = await db.select({
            transportadora: comprasOrdens.transportadora,
            codigoRastreamento: comprasOrdens.codigoRastreamento,
            freteTipo: comprasOrdens.freteTipo,
            fornecedorNome: comprasOrdens.fornecedorNome,
            numeroOc: comprasOrdens.numeroOc,
          }).from(comprasOrdens).where(and(eq(comprasOrdens.id, oid), eq(comprasOrdens.companyId, input.companyId))).limit(1);
          if (oc) almoxOcMap.set(oid, oc);
        } catch (e: any) {
          console.warn(`[listarRecebimentos] Erro ao buscar comprasOrdens ${oid}:`, e.message);
        }
      }

      return allRows.map(r => {
        const ocData = r._source === "almoxarifado" ? almoxOcMap.get(r.ordemId) : purchaseOcMap.get(r.ordemId);
        return {
          ...r,
          transportadora: ocData?.transportadora ?? null,
          codigoRastreamento: ocData?.codigoRastreamento ?? null,
          freteTipo: ocData?.freteTipo ?? null,
          fornecedorNome: ocData?.fornecedorNome ?? null,
          numeroOc: ocData?.numeroOc ?? null,
        };
      });
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
        try {
          const [oc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.ordemId)).limit(1);
          if (oc && (oc as any).compradorId && (oc as any).obraId) {
            const compradorId = Number((oc as any).compradorId);
            const obraId = Number((oc as any).obraId);
            const valorComprado = n((oc as any).valorTotal);
            const ocItens = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.ordemId, input.ordemId));
            const valorMeta = ocItens.reduce((s: number, i: any) => s + (n(i.quantidadePedida) * n(i.valorMetaUnitario)), 0);
            const economia = Math.max(0, valorMeta - valorComprado);
            if (economia > 0) {
              const cfg = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
              const pct = cfg.length ? Number(cfg[0].comissaoPercentual ?? 10) : 10;
              const comissao = economia * (pct / 100);
              await db.insert(buyerCommissions).values({
                companyId: input.companyId, obraId, obraNome: (oc as any).obraNome,
                compradorId, compradorNome: (oc as any).compradorNome,
                valorMetaTotal: String(valorMeta.toFixed(2)), valorCompradoTotal: String(valorComprado.toFixed(2)),
                economiaTotal: String(economia.toFixed(2)), percentualParticipacao: String(pct),
                valorComissao: String(comissao.toFixed(2)), calculadoEm: new Date().toISOString(),
              } as any);
            }
          }
        } catch (_) {}
      }
      await onRecebimentoConfirmado(receb.id, input.ordemId, status as any, valorLiberado, input.userId, input.userName || "Sistema");
      return { ...receb, status };
    }),

  excluirRecebimentosEmLote: protectedProcedure
    .input(z.object({
      comprasIds: z.array(z.number()).default([]),
      almoxIds: z.array(z.number()).default([]),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { getCompaniesForUser } = await import("../db");
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c: any) => c.id === input.companyId))
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });

      let count = 0;

      if (input.comprasIds.length > 0) {
        const owned = await db.select({ id: purchaseReceipts.id })
          .from(purchaseReceipts)
          .where(and(inArray(purchaseReceipts.id, input.comprasIds), eq(purchaseReceipts.companyId, input.companyId)));
        const ownedIds = owned.map(r => r.id);
        if (ownedIds.length > 0) {
          await db.delete(purchaseReceiptItems).where(inArray(purchaseReceiptItems.recebimentoId, ownedIds));
          await db.delete(purchaseReceipts).where(inArray(purchaseReceipts.id, ownedIds));
          count += ownedIds.length;
        }
      }

      if (input.almoxIds.length > 0) {
        const almoxOwned = await db.select({ id: almoxarifadoRecebimentos.id })
          .from(almoxarifadoRecebimentos)
          .where(and(inArray(almoxarifadoRecebimentos.id, input.almoxIds), eq(almoxarifadoRecebimentos.companyId, input.companyId)));
        const validAlmoxIds = almoxOwned.map(r => r.id);
        if (validAlmoxIds.length > 0) {
          await db.delete(almoxarifadoRecebimentoItens).where(inArray(almoxarifadoRecebimentoItens.recebimentoId, validAlmoxIds));
          await db.delete(almoxarifadoRecebimentos).where(inArray(almoxarifadoRecebimentos.id, validAlmoxIds));
          count += validAlmoxIds.length;
        }
      }

      return { count };
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

  analiseComissoesOCs: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ocs = await db.select().from(comprasOrdens)
        .where(eq(comprasOrdens.companyId, input.companyId))
        .orderBy(asc(comprasOrdens.criadoEm));
      if (ocs.length === 0) return [];

      const ocIds = ocs.map(oc => oc.id);
      const allItens = await db.select().from(comprasOrdensItens)
        .where(inArray(comprasOrdensItens.ordemId, ocIds));

      const scItemIds = [...new Set(allItens.map(i => i.solicitacaoItemId).filter((id): id is number => !!id))];
      const allScItens = scItemIds.length > 0
        ? await db.select().from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds))
        : [];
      const scItemMap = new Map(allScItens.map(si => [si.id, si]));

      const { comprasSolicitacoes, orcamentoItens: orcItensTable } = await import("../../drizzle/schema");

      const scIdList = [...new Set(allScItens.map(si => (si as any).solicitacaoId).filter(Boolean))];
      const scObraMap: Record<number, number> = {};
      if (scIdList.length > 0) {
        const scs = await db.select({ id: comprasSolicitacoes.id, obraId: comprasSolicitacoes.obraId })
          .from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.id, scIdList));
        for (const sc of scs) scObraMap[sc.id] = sc.obraId ?? 0;
      }

      const orcItemIds = [...new Set(allScItens.map(si => (si as any).orcamentoItemId).filter(Boolean))];
      const orcItemQtyMap: Record<number, number> = {};
      if (orcItemIds.length > 0) {
        const orcRows = await db.select({ id: orcItensTable.id, quantidade: orcItensTable.quantidade })
          .from(orcItensTable).where(inArray(orcItensTable.id, orcItemIds));
        for (const r of orcRows) orcItemQtyMap[r.id] = n(r.quantidade);
      }

      const orcBudgetByKey: Record<string, number> = {};
      for (const scItem of allScItens) {
        const orcItemId = (scItem as any).orcamentoItemId;
        const scObraId = scObraMap[(scItem as any).solicitacaoId] ?? 0;
        if (orcItemId && orcItemQtyMap[orcItemId] !== undefined) {
          const budgetKey = `${scObraId}:orc:${orcItemId}`;
          orcBudgetByKey[budgetKey] = orcItemQtyMap[orcItemId];
        }
      }

      const firstScQtyByKey: Record<string, number> = {};
      for (const scItem of allScItens) {
        const orcItemId = (scItem as any).orcamentoItemId;
        const insumoCodigo = (scItem as any).insumoCodigo;
        const scObraId = scObraMap[(scItem as any).solicitacaoId] ?? 0;
        if (!orcItemId && insumoCodigo) {
          const budgetKey = `${scObraId}:ins:${insumoCodigo}`;
          if (firstScQtyByKey[budgetKey] === undefined) {
            firstScQtyByKey[budgetKey] = n(scItem.quantidade);
          }
        }
      }

      const itensByOrdem = new Map<number, typeof allItens>();
      for (const item of allItens) {
        const arr = itensByOrdem.get(item.ordemId!) || [];
        arr.push(item);
        itensByOrdem.set(item.ordemId!, arr);
      }

      const budgetConsumed: Record<string, number> = {};

      const results = ocs.map(oc => {
        const itens = itensByOrdem.get(oc.id) || [];
        let valorMeta = 0;
        let temMeta = false;
        for (const item of itens) {
          if (!item.solicitacaoItemId) continue;
          const scItem = scItemMap.get(item.solicitacaoItemId);
          if (!scItem) continue;
          const orcItemId = (scItem as any).orcamentoItemId;
          const insumoCodigo = (scItem as any).insumoCodigo;
          const precoMeta = n((scItem as any).precoMeta);
          if (precoMeta <= 0) continue;
          temMeta = true;
          const qty = n(item.quantidade);
          const obraKey = `${oc.obraId ?? 0}`;

          let budgetKey = "";
          let totalBudgetQty = 0;
          if (orcItemId) {
            budgetKey = `${obraKey}:orc:${orcItemId}`;
            totalBudgetQty = orcBudgetByKey[budgetKey] ?? 0;
          } else if (insumoCodigo) {
            budgetKey = `${obraKey}:ins:${insumoCodigo}`;
            totalBudgetQty = firstScQtyByKey[budgetKey] ?? 0;
          }

          if (budgetKey && totalBudgetQty > 0) {
            const alreadyConsumed = budgetConsumed[budgetKey] ?? 0;
            const remainingBudgetQty = Math.max(0, totalBudgetQty - alreadyConsumed);
            const coveredQty = Math.min(qty, remainingBudgetQty);
            valorMeta += precoMeta * coveredQty;
            budgetConsumed[budgetKey] = alreadyConsumed + qty;
          } else if (budgetKey) {
            valorMeta += precoMeta * qty;
            budgetConsumed[budgetKey] = (budgetConsumed[budgetKey] ?? 0) + qty;
          } else {
            valorMeta += precoMeta * qty;
          }
        }
        const valorComprado = n(oc.total);
        const economia = temMeta ? (valorMeta - valorComprado) : 0;
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          fornecedorNome: oc.fornecedorNome,
          obraId: oc.obraId,
          status: oc.status,
          valorComprado,
          valorMeta: temMeta ? valorMeta : null,
          economia,
          temMeta,
          totalItens: itens.length,
          criadoEm: oc.criadoEm,
        };
      });

      results.sort((a, b) => new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime());
      return results;
    }),

  calcularComissoes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), compradorId: z.number(), compradorNome: z.string().optional(), obraNome: z.string().optional(), percentualParticipacao: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let pct = input.percentualParticipacao;
      if (pct === undefined || pct === null) {
        const cfg = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
        pct = cfg.length ? Number(cfg[0].comissaoPercentual ?? 10) : 10;
      }
      const ocs = await db.select().from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, input.companyId), eq(purchaseOrders.obraId, input.obraId), eq(purchaseOrders.compradorId, input.compradorId)));
      const valorComprado = ocs.reduce((s: number, o: any) => s + n(o.valorTotal), 0);
      const scs = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.obraId, input.obraId)));
      const valorMeta = scs.reduce((s: number, sc: any) => s + n(sc.valorMetaTotal), 0);
      const economia = Math.max(0, valorMeta - valorComprado);
      const comissao = economia * (pct / 100);
      const [c] = await db.insert(buyerCommissions).values({
        companyId: input.companyId, obraId: input.obraId, obraNome: input.obraNome,
        compradorId: input.compradorId, compradorNome: input.compradorNome,
        valorMetaTotal: String(valorMeta.toFixed(2)), valorCompradoTotal: String(valorComprado.toFixed(2)),
        economiaTotal: String(economia.toFixed(2)), percentualParticipacao: String(pct),
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
      freteTipo: z.string().default("cif"), transportadora: z.string().optional(),
      prazoEntregaDias: z.number().optional(),
      condicaoPagamento: z.string().optional(), tipoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseQuotationTokens).where(eq(purchaseQuotationTokens.token, input.token)).limit(1);
      const tok = rows?.[0];
      if (!tok) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      const freteParaTotal = input.freteTipo === "fob" ? input.valorFrete : 0;
      const total = input.valorUnitario + freteParaTotal;
      await db.update(purchaseQuotationSuppliers).set({
        status: "respondido", valorUnitario: String(input.valorUnitario),
        valorFrete: String(input.valorFrete), freteTipo: input.freteTipo,
        transportadora: input.transportadora ?? null,
        valorTotalComFrete: String(total.toFixed(2)), prazoEntregaDias: input.prazoEntregaDias,
        condicaoPagamento: input.condicaoPagamento, tipoPagamento: input.tipoPagamento,
        numeroParcelas: input.numeroParcelas ?? null,
        observacoes: input.observacoes, respondidoEm: new Date().toISOString(),
      }).where(eq(purchaseQuotationSuppliers.id, tok.quotationSupplierId));
      await db.update(purchaseQuotationTokens).set({ status: "respondido", respondedAt: new Date().toISOString() } as any).where(eq(purchaseQuotationTokens.token, input.token));
      return { ok: true };
    }),

  atualizarDadosEntregaOC: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ordemId: z.number(),
      transportadora: z.string().optional(),
      codigoRastreamento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [oc] = await db.select({ id: purchaseOrders.id, companyId: purchaseOrders.companyId })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, input.ordemId), eq(purchaseOrders.companyId, input.companyId)))
        .limit(1);
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem não encontrada" });
      const updates: any = { updatedAt: new Date().toISOString() };
      if (input.transportadora !== undefined) updates.transportadora = input.transportadora || null;
      if (input.codigoRastreamento !== undefined) updates.codigoRastreamento = input.codigoRastreamento || null;
      await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, input.ordemId));
      return { ok: true };
    }),

  verificarTokenOCPortal: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseOrders)
        .where(eq((purchaseOrders as any).portalToken, input.token)).limit(1);
      const oc = rows?.[0];
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido ou OC não encontrada" });
      return {
        id: oc.id, numero: oc.numero, supplierNome: oc.supplierNome,
        obraNome: oc.obraNome, status: oc.status,
        freteTipo: (oc as any).freteTipo, valorFrete: (oc as any).valorFrete,
        transportadora: (oc as any).transportadora, codigoRastreamento: (oc as any).codigoRastreamento,
        valorTotal: oc.valorTotal, prazoEntrega: oc.prazoEntrega,
      };
    }),

  atualizarEntregaPortalOC: protectedProcedure
    .input(z.object({
      token: z.string(),
      transportadora: z.string().optional(),
      codigoRastreamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({ id: purchaseOrders.id }).from(purchaseOrders)
        .where(eq((purchaseOrders as any).portalToken, input.token)).limit(1);
      const oc = rows?.[0];
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      const updates: any = { updatedAt: new Date().toISOString() };
      if (input.transportadora !== undefined) updates.transportadora = input.transportadora || null;
      if (input.codigoRastreamento !== undefined) updates.codigoRastreamento = input.codigoRastreamento || null;
      await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, oc.id));
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
      comissaoPercentual: z.number().optional(),
      prefixoOs: z.string().optional(),
      retencaoTecnicaPerc: z.number().optional(),
      diaCorte: z.number().optional(),
      prazoAprovacaoDias: z.number().optional(),
      diaPagamento: z.number().optional(),
      alertaReservasAtivo: z.boolean().optional(),
      previstoFonte: z.enum(["motor", "manual"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, alertaReservasAtivo, ...rest } = input;
      const vals: any = { ...rest, updatedAt: new Date().toISOString() };
      if (alertaReservasAtivo !== undefined) {
        vals.alertaReservasAtivo = alertaReservasAtivo ? 1 : 0;
      }
      if (vals.comissaoPercentual !== undefined) {
        vals.comissaoPercentual = String(vals.comissaoPercentual);
      }
      if (vals.retencaoTecnicaPerc !== undefined) {
        vals.retencaoTecnicaPerc = String(vals.retencaoTecnicaPerc);
      }
      const existing = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, companyId)).limit(1);
      if (existing.length) {
        await db.update(ocNumberConfig).set(vals).where(eq(ocNumberConfig.companyId, companyId));
      } else {
        await db.insert(ocNumberConfig).values({ companyId, ...vals } as any);
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
