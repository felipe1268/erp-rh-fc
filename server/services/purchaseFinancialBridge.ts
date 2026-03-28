import { getDb } from "../db";
import {
  purchaseOrders, purchaseRequests, purchaseAccountsPayable,
  financialEntries, financialAccounts,
  fornecedores, buyerCommissions, purchaseCancellations,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createAuditLog } from "../db";
import { calcularParcelas, getTipoPagamentoInfo } from "../../shared/paymentConditions";

async function getContaId(db: any, companyId: number, codigo: string) {
  const res = await db.select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.companyId, companyId), eq((financialAccounts as any).codigo, codigo)))
    .limit(1);
  return res?.[0]?.id || null;
}

async function getSupplierFields(db: any, supplierId: number) {
  const rows = await db.select().from(fornecedores).where(eq(fornecedores.id, supplierId));
  return rows?.[0] ?? null;
}

// ── PONTO 1: OC EMITIDA → gera financial_entries + purchase_accounts_payable (N parcelas)
export async function onOCEmitida(ocId: number, userId: number, userName: string) {
  const db = await getDb();
  if (!db) return;

  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, ocId));
  const oc = rows?.[0];
  if (!oc) return;

  const codigoConta = oc.tipo === "servico" ? "3.2" : oc.tipo === "locacao" ? "3.4" : "3.3";
  const contaId = await getContaId(db, oc.companyId, codigoConta);
  const supplier = await getSupplierFields(db, oc.supplierId);

  const valorTotal = parseFloat(String(oc.valorTotal || "0"));
  const dataBase = oc.prazoEntrega || new Date().toISOString().split("T")[0];
  const tipoPag = (oc as any).tipoPagamento;

  const parcelas = tipoPag
    ? calcularParcelas(tipoPag, valorTotal, dataBase)
    : [{ numero: 1, valor: valorTotal, dataVencimento: dataBase, descricao: "Pagamento único" }];

  const entryIds: number[] = [];
  const apIds: number[] = [];

  for (const parcela of parcelas) {
    const sufixo = parcelas.length > 1 ? ` (${parcela.descricao})` : "";
    const entryResult = await db.insert(financialEntries).values({
      companyId: oc.companyId,
      obraId: oc.obraId || null,
      obraNome: oc.obraNome || null,
      contaId,
      tipo: "despesa",
      natureza: "variavel",
      valorPrevisto: String(parcela.valor.toFixed(2)),
      dataCompetencia: new Date().toISOString().split("T")[0],
      dataVencimento: parcela.dataVencimento,
      status: "previsto",
      origemModulo: "compras",
      origemId: oc.id,
      origemDescricao: `OC #${oc.numero || oc.id} — ${oc.supplierNome}${sufixo}`,
      criadoPorId: userId,
      criadoPorNome: userName,
    } as any).returning({ id: (financialEntries as any).id });

    const financialEntryId = entryResult?.[0]?.id;
    if (financialEntryId) entryIds.push(financialEntryId);

    const apResult = await db.insert(purchaseAccountsPayable).values({
      companyId: oc.companyId,
      ordemId: oc.id,
      supplierId: oc.supplierId,
      supplierNome: oc.supplierNome,
      obraId: oc.obraId || null,
      descricao: `OC #${oc.numero || oc.id} — ${oc.supplierNome}${sufixo}`,
      valorTotal: String(parcela.valor.toFixed(2)),
      status: "bloqueado",
      formaPagamento: oc.formaPagamento || null,
      dataVencimento: parcela.dataVencimento,
      parcelaNumero: parcela.numero,
      parcelaTotal: parcelas.length,
      financialEntryId,
      supplierBanco: supplier?.banco || null,
      supplierAgencia: supplier?.agencia || null,
      supplierConta: supplier?.conta || null,
      supplierPix: supplier?.pix || null,
      supplierCnpj: supplier?.cnpj || null,
    } as any).returning({ id: purchaseAccountsPayable.id });

    const apId = apResult?.[0]?.id;
    if (apId) apIds.push(apId);
  }

  await db.update(purchaseOrders).set({
    financialEntryId: entryIds[0] || null,
    accountsPayableId: apIds[0] || null,
    numeroParcelas: parcelas.length,
  } as any).where(eq(purchaseOrders.id, ocId));

  const parcelasSummary = parcelas.length > 1
    ? ` | ${parcelas.length} parcelas: ${parcelas.map(p => `R$${p.valor.toFixed(2)} venc. ${p.dataVencimento}`).join(", ")}`
    : "";

  await createAuditLog({
    userId, userName, action: "CREATE", module: "compras",
    entityType: "oc_lancamento", entityId: ocId,
    details: `OC #${oc.numero} → ${entryIds.length} financial_entries [${entryIds.join(",")}] + ${apIds.length} accounts_payable [${apIds.join(",")}]${parcelasSummary}`,
  });
}

// ── PONTO 2: RECEBIMENTO CONFIRMADO → libera pagamento (todas as parcelas da OC)
export async function onRecebimentoConfirmado(
  recebimentoId: number,
  ordemId: number,
  status: "total" | "parcial",
  valorLiberado: number,
  userId: number,
  userName: string
) {
  const db = await getDb();
  if (!db) return;

  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, ordemId));
  const oc = rows?.[0];
  if (!oc) return;

  const allAPs = await db.select().from(purchaseAccountsPayable)
    .where(eq(purchaseAccountsPayable.ordemId, ordemId));
  const blockedAPs = allAPs.filter(ap => ap.status === "bloqueado");

  if (status === "total") {
    for (const ap of blockedAPs) {
      await db.update(purchaseAccountsPayable)
        .set({ status: "pendente" } as any)
        .where(eq(purchaseAccountsPayable.id, ap.id));
      if (ap.financialEntryId) {
        await db.update(financialEntries)
          .set({ status: "a_pagar" } as any)
          .where(eq((financialEntries as any).id, ap.financialEntryId));
      }
    }
  } else {
    const totalBloqueado = blockedAPs.reduce((s, ap) => s + parseFloat(String(ap.valorTotal) || "0"), 0);
    if (totalBloqueado <= 0) return;
    const pct = Math.min(valorLiberado / totalBloqueado, 1);
    for (const ap of blockedAPs) {
      const apVal = parseFloat(String(ap.valorTotal) || "0");
      const apLiberar = Math.round(apVal * pct * 100) / 100;
      await db.update(purchaseAccountsPayable).set({
        status: "pendente",
        valorTotal: String(apLiberar.toFixed(2)),
      } as any).where(eq(purchaseAccountsPayable.id, ap.id));
      if (ap.financialEntryId) {
        await db.update(financialEntries).set({
          status: "a_pagar",
          valorPrevisto: String(apLiberar.toFixed(2)),
          origemDescricao: `Recebimento parcial OC #${oc.numero} (${(pct * 100).toFixed(1)}%)`,
        } as any).where(eq((financialEntries as any).id, ap.financialEntryId));
      }
    }
  }

  await createAuditLog({
    userId, userName, action: "UPDATE", module: "compras",
    entityType: "recebimento", entityId: recebimentoId,
    details: `Recebimento ${status} — R$${valorLiberado.toFixed(2)} liberado para pagamento (${allAPs.length} parcelas)`,
  });
}

// ── PONTO 3: OC CANCELADA → rollback financeiro completo
export async function onOCCancelada(ocId: number, motivo: string, userId: number, userName: string) {
  const db = await getDb();
  if (!db) return;

  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, ocId));
  const oc = rows?.[0];
  if (!oc) return;

  const efeitos: string[] = [];

  const allAPs = await db.select().from(purchaseAccountsPayable)
    .where(eq(purchaseAccountsPayable.ordemId, ocId));
  for (const ap of allAPs) {
    await db.update(purchaseAccountsPayable)
      .set({ status: "cancelado" } as any)
      .where(eq(purchaseAccountsPayable.id, ap.id));
    if (ap.financialEntryId) {
      await db.update(financialEntries)
        .set({ status: "cancelado" } as any)
        .where(eq((financialEntries as any).id, ap.financialEntryId));
    }
  }
  if (allAPs.length > 0) {
    efeitos.push(`${allAPs.length} accounts_payable cancelados`);
    efeitos.push(`financial_entries cancelados`);
  }

  if (oc.solicitacaoId) {
    await db.update(purchaseRequests)
      .set({ status: "aprovada" } as any)
      .where(eq(purchaseRequests.id, oc.solicitacaoId));
    efeitos.push("sc_reaberta");
  }

  await db.insert(purchaseCancellations).values({
    companyId: oc.companyId,
    tipo: "oc",
    referenciaId: ocId,
    motivo,
    efeitos: JSON.stringify(efeitos),
    canceladoPorId: userId,
    canceladoPorNome: userName,
  } as any);

  await createAuditLog({
    userId, userName, action: "DELETE", module: "compras",
    entityType: "oc_cancelamento", entityId: ocId,
    details: `OC cancelada. Rollback: ${efeitos.join(", ")}. Motivo: ${motivo}`,
  });
}

// ── PONTO 4: COMISSÃO APROVADA → gera lançamento financeiro
export async function onComissaoAprovada(comissaoId: number, userId: number, userName: string) {
  const db = await getDb();
  if (!db) return;

  const rows = await db.select().from(buyerCommissions).where(eq(buyerCommissions.id, comissaoId));
  const comissao = rows?.[0];
  if (!comissao) return;

  const contaId = await getContaId(db, comissao.companyId, "5.3");

  const entryResult = await db.insert(financialEntries).values({
    companyId: comissao.companyId,
    obraId: comissao.obraId,
    obraNome: comissao.obraNome,
    contaId,
    tipo: "despesa",
    natureza: "variavel",
    valorPrevisto: String(comissao.valorComissao),
    dataCompetencia: new Date().toISOString().split("T")[0],
    status: "a_pagar",
    origemModulo: "comissao_comprador",
    origemId: comissaoId,
    origemDescricao: `Comissão — ${comissao.compradorNome} — ${comissao.obraNome}`,
    criadoPorId: userId,
    criadoPorNome: userName,
  } as any).returning({ id: (financialEntries as any).id });

  await db.update(buyerCommissions).set({
    financialEntryId: entryResult?.[0]?.id,
    status: "aprovada_diretor",
    aprovadoPor: userName,
    aprovadoEm: new Date().toISOString(),
  } as any).where(eq(buyerCommissions.id, comissaoId));
}
