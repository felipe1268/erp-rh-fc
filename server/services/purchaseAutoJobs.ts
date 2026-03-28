import { getDb } from "../db";
import {
  purchaseOrders, purchaseQuotations, supplierContracts,
  comprasEntregasProgramadas, purchaseOrderItems,
  almoxarifadoNotificacoes, notificationLogs,
  comprasCotacoes,
} from "../../drizzle/schema";
import { eq, and, lte, gte, inArray, sql } from "drizzle-orm";
import { sendEmail } from "./smtpService";
import crypto from "crypto";

export function startPurchaseJobs() {
  setTimeout(async () => {
    try {
      await checkOCDeadlines();
      await checkQuotationExpiries();
      await checkContractExpirations();
      await checkEntregasProximas();
      await checkCotacoesVencendo();
    } catch (e) { console.error("[PurchaseJobs] Erro inicial:", e); }
  }, 30000);

  setInterval(async () => {
    try {
      await checkOCDeadlines();
      await checkQuotationExpiries();
      await checkContractExpirations();
      await checkEntregasProximas();
      await checkCotacoesVencendo();
    } catch (e) { console.error("[PurchaseJobs] Erro:", e); }
  }, 60 * 60 * 1000);

  console.log("[PurchaseJobs] Jobs de compras iniciados (intervalo: 60 min).");
}

async function checkOCDeadlines() {
  const db = await getDb();
  if (!db) return;
  const hoje = new Date().toISOString().split("T")[0];
  const vencidas = await db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.status, "emitida"), lte(purchaseOrders.prazoEntrega, hoje)));
  for (const oc of vencidas) {
    console.log(`[PurchaseJobs] OC #${oc.numero} prazo vencido: ${oc.prazoEntrega}`);
  }
}

async function checkQuotationExpiries() {
  const db = await getDb();
  if (!db) return;
  const hoje = new Date().toISOString().split("T")[0];
  await db.update(purchaseQuotations)
    .set({ status: "expirada" } as any)
    .where(and(eq(purchaseQuotations.status, "aberta"), lte(purchaseQuotations.validadeAte, hoje)));
}

async function checkContractExpirations() {
  const db = await getDb();
  if (!db) return;
  const em7dias = new Date();
  em7dias.setDate(em7dias.getDate() + 7);
  const em7diasStr = em7dias.toISOString().split("T")[0];
  const vencendo = await db.select().from(supplierContracts)
    .where(and(eq(supplierContracts.status, "ativo"), lte(supplierContracts.dataFim, em7diasStr)));
  for (const c of vencendo) {
    if (!c.alertaEnviado) {
      console.log(`[PurchaseJobs] Contrato vencendo: ${c.supplierNome} — ${c.dataFim}`);
    }
  }
}

async function checkEntregasProximas() {
  const db = await getDb();
  if (!db) return;

  const hoje = new Date();
  const hojeStr = hoje.toISOString().split("T")[0];
  const em3dias = new Date();
  em3dias.setDate(em3dias.getDate() + 3);
  const em3diasStr = em3dias.toISOString().split("T")[0];

  const entregasPendentes = await db.select()
    .from(comprasEntregasProgramadas)
    .where(and(
      eq(comprasEntregasProgramadas.status, "pendente"),
      gte(comprasEntregasProgramadas.dataEntrega, hojeStr),
      lte(comprasEntregasProgramadas.dataEntrega, em3diasStr),
    ));

  if (entregasPendentes.length === 0) return;

  const itemIds = [...new Set(entregasPendentes.map(e => e.ordemItemId))];

  let itensMap: Record<number, any> = {};
  if (itemIds.length > 0) {
    const itens = await db.select().from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.id, itemIds));
    for (const i of itens) {
      itensMap[i.id] = i;
    }
  }

  const ordemIds = [...new Set(Object.values(itensMap).map((i: any) => i.ordemId))];
  let ordensMap: Record<number, any> = {};
  if (ordemIds.length > 0) {
    const ordens = await db.select().from(purchaseOrders)
      .where(inArray(purchaseOrders.id, ordemIds));
    for (const o of ordens) {
      ordensMap[o.id] = o;
    }
  }

  const existentes = await db.select({
      titulo: almoxarifadoNotificacoes.titulo,
      companyId: almoxarifadoNotificacoes.companyId,
    })
    .from(almoxarifadoNotificacoes)
    .where(and(
      eq(almoxarifadoNotificacoes.tipo, "entrega_proxima"),
      sql`DATE(${almoxarifadoNotificacoes.criadoEm}) = ${hojeStr}`,
    ));
  const chaveExistentes = new Set(existentes.map(e => `${e.companyId}::${e.titulo}`));

  let criados = 0;
  for (const entrega of entregasPendentes) {
    const item = itensMap[entrega.ordemItemId];
    if (!item) continue;
    const ordem = ordensMap[item.ordemId];
    if (!ordem) continue;

    const ocLabel = ordem.numero || String(ordem.id);
    const titulo = `Entrega se aproximando — OC #${ocLabel} — ${item.insumoNome} — ${entrega.dataEntrega}`;
    const chave = `${ordem.companyId}::${titulo}`;

    if (chaveExistentes.has(chave)) continue;

    const mensagem = [
      `A entrega programada para ${entrega.dataEntrega} está se aproximando.`,
      ``,
      `OC: #${ocLabel}`,
      `Item: ${item.insumoNome}`,
      `Quantidade: ${parseFloat(String(entrega.quantidade || "0"))} ${item.unidade}`,
      `Fornecedor: ${ordem.supplierNome || "N/A"}`,
      `Obra: ${ordem.obraNome || "N/A"}`,
    ].join("\n");

    await db.insert(almoxarifadoNotificacoes).values({
      companyId: ordem.companyId,
      tipo: "entrega_proxima",
      destinoModulo: "almoxarifado",
      titulo,
      mensagem,
    } as any);

    chaveExistentes.add(chave);
    criados++;
  }

  if (criados > 0) {
    console.log(`[PurchaseJobs] ${criados} alerta(s) de entrega próxima criado(s).`);
  }
}

async function checkCotacoesVencendo() {
  const db = await getDb();
  if (!db) return;

  const hoje = new Date();
  const hojeStr = hoje.toISOString().split("T")[0];
  const em3dias = new Date();
  em3dias.setDate(em3dias.getDate() + 3);
  const em3diasStr = em3dias.toISOString().split("T")[0];

  const cotacoesVencendo = await db.select()
    .from(purchaseQuotations)
    .where(and(
      eq(purchaseQuotations.status, "aberta"),
      gte(purchaseQuotations.validadeAte, hojeStr),
      lte(purchaseQuotations.validadeAte, em3diasStr),
    ));

  const cotacoesCVencendo = await db.select()
    .from(comprasCotacoes)
    .where(and(
      eq(comprasCotacoes.status, "pendente"),
      gte(comprasCotacoes.dataValidade, hojeStr),
      lte(comprasCotacoes.dataValidade, em3diasStr),
    ));

  const existentes = await db.select({
      titulo: notificationLogs.titulo,
      companyId: notificationLogs.companyId,
    })
    .from(notificationLogs)
    .where(and(
      eq(notificationLogs.tipoMovimentacao, "cotacao_vencendo"),
      sql`DATE(${notificationLogs.enviadoEm}) = ${hojeStr}`,
    ));
  const chavesExistentes = new Set(existentes.map(e => `${e.companyId}::${e.titulo}`));

  let criados = 0;

  for (const cot of cotacoesVencendo) {
    const titulo = `Cotação #${cot.id} expira em ${cot.validadeAte}`;
    const chave = `${cot.companyId}::${titulo}`;
    if (chavesExistentes.has(chave)) continue;

    const corpo = [
      `A cotação #${cot.id} está prestes a expirar.`,
      `Validade: ${cot.validadeAte}`,
      `Comprador: ${cot.compradorNome || "N/A"}`,
      `Status: ${cot.status}`,
    ].join("\n");

    await db.insert(notificationLogs).values({
      companyId: cot.companyId,
      employeeName: cot.compradorNome || "Comprador",
      tipoMovimentacao: "cotacao_vencendo",
      recipientName: cot.compradorNome || "Comprador",
      recipientEmail: "compras@sistema.local",
      titulo,
      corpo,
      statusEnvio: "enviado",
      trackingId: crypto.randomUUID(),
      disparadoPor: "Sistema",
    });

    try {
      await sendEmail({
        to: "compras@sistema.local",
        subject: titulo,
        html: `<p>${corpo.replace(/\n/g, "<br>")}</p>`,
        text: corpo,
      });
    } catch (_) {}

    chavesExistentes.add(chave);
    criados++;
  }

  for (const cot of cotacoesCVencendo) {
    const titulo = `Cotação ${cot.numeroCotacao} expira em ${cot.dataValidade}`;
    const chave = `${cot.companyId}::${titulo}`;
    if (chavesExistentes.has(chave)) continue;

    const corpo = [
      `A cotação ${cot.numeroCotacao} está prestes a expirar.`,
      `Validade: ${cot.dataValidade}`,
      `Descrição: ${cot.descricao || "N/A"}`,
      `Status: ${cot.status}`,
    ].join("\n");

    await db.insert(notificationLogs).values({
      companyId: cot.companyId,
      employeeName: "Comprador",
      tipoMovimentacao: "cotacao_vencendo",
      recipientName: "Comprador",
      recipientEmail: "compras@sistema.local",
      titulo,
      corpo,
      statusEnvio: "enviado",
      trackingId: crypto.randomUUID(),
      disparadoPor: "Sistema",
    });

    chavesExistentes.add(chave);
    criados++;
  }

  if (criados > 0) {
    console.log(`[PurchaseJobs] ${criados} alerta(s) de cotação vencendo criado(s).`);
  }
}
