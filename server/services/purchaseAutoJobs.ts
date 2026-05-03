import { getDb } from "../db";
import {
  purchaseOrders, purchaseQuotations, supplierContracts,
  comprasEntregasProgramadas, purchaseOrderItems,
  almoxarifadoNotificacoes, notificationLogs,
  comprasCotacoes, pjContracts, pjDocumentos,
} from "../../drizzle/schema";
import { eq, and, lte, gte, inArray, sql, isNull, ne } from "drizzle-orm";
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
      await checkPJContractAlerts();
    } catch (e) { console.error("[PurchaseJobs] Erro inicial:", e); }
  }, 5 * 60 * 1000); // 5 minutos após startup

  setInterval(async () => {
    try {
      await checkOCDeadlines();
      await checkQuotationExpiries();
      await checkContractExpirations();
      await checkEntregasProximas();
      await checkCotacoesVencendo();
      await checkPJContractAlerts();
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

const DOCS_OBRIGATORIOS_PJ = ["CNPJ", "contrato_social", "seguro"];

async function checkPJContractAlerts() {
  const db = await getDb();
  if (!db) return;

  const hojeStr = new Date().toISOString().split("T")[0];
  const em30dias = new Date();
  em30dias.setDate(em30dias.getDate() + 30);
  const em30diasStr = em30dias.toISOString().split("T")[0];

  const contratosAtivos = await db.select().from(pjContracts)
    .where(and(
      eq(pjContracts.status, "ativo"),
      isNull(pjContracts.deletedAt),
    ));

  const existentes = await db.select({
    titulo: almoxarifadoNotificacoes.titulo,
    companyId: almoxarifadoNotificacoes.companyId,
  }).from(almoxarifadoNotificacoes)
    .where(and(
      sql`${almoxarifadoNotificacoes.tipo} IN ('pj_contrato_vencendo', 'pj_saldo_90', 'pj_docs_pendentes')`,
      sql`DATE(${almoxarifadoNotificacoes.criadoEm}) = ${hojeStr}`,
    ));
  const chavesExistentes = new Set(existentes.map(e => `${e.companyId}::${e.titulo}`));

  let criados = 0;

  for (const ct of contratosAtivos) {
    if (ct.dataFim && ct.dataFim <= em30diasStr) {
      const titulo = `Contrato PJ ${ct.numeroContrato || "#" + ct.id} vence em ${ct.dataFim}`;
      const chave = `${ct.companyId}::${titulo}`;
      if (!chavesExistentes.has(chave)) {
        const diasRestantes = Math.ceil((new Date(ct.dataFim).getTime() - Date.now()) / 86400000);
        await db.insert(almoxarifadoNotificacoes).values({
          companyId: ct.companyId,
          tipo: "pj_contrato_vencendo",
          destinoModulo: "terceiros",
          titulo,
          mensagem: `O contrato ${ct.numeroContrato} (${ct.razaoSocialPrestador || "Prestador"}) vence em ${diasRestantes} dia(s).\nData fim: ${ct.dataFim}.\nProvidenciar renovação ou encerramento.`,
        } as any);
        chavesExistentes.add(chave);
        criados++;
      }
    }

    const valorTotal = parseFloat(String(ct.valorTotalContrato || "0"));
    const valorMedido = parseFloat(String(ct.valorMedido || "0"));
    if (valorTotal > 0 && valorMedido >= valorTotal * 0.9) {
      const pctUsado = Math.round((valorMedido / valorTotal) * 100);
      const titulo = `Saldo do contrato ${ct.numeroContrato || "#" + ct.id} em ${pctUsado}%`;
      const chave = `${ct.companyId}::${titulo}`;
      if (!chavesExistentes.has(chave)) {
        const saldoRestante = (valorTotal - valorMedido).toFixed(2);
        await db.insert(almoxarifadoNotificacoes).values({
          companyId: ct.companyId,
          tipo: "pj_saldo_90",
          destinoModulo: "terceiros",
          titulo,
          mensagem: `O contrato ${ct.numeroContrato} (${ct.razaoSocialPrestador || "Prestador"}) atingiu ${pctUsado}% do valor total.\nValor total: R$ ${valorTotal.toFixed(2)}\nValor medido: R$ ${valorMedido.toFixed(2)}\nSaldo restante: R$ ${saldoRestante}\nConsiderar aditivo ou novo contrato.`,
        } as any);
        chavesExistentes.add(chave);
        criados++;
      }
    }

    const docs = await db.select({ tipo: pjDocumentos.tipo }).from(pjDocumentos)
      .where(and(
        eq(pjDocumentos.employeeId, ct.employeeId),
        eq(pjDocumentos.companyId, ct.companyId),
        isNull(pjDocumentos.deletedAt),
      ));
    const tiposPresentes = new Set(docs.map(d => d.tipo));
    const docsFaltando = DOCS_OBRIGATORIOS_PJ.filter(t => !tiposPresentes.has(t));

    if (docsFaltando.length > 0) {
      const titulo = `Documentos pendentes — ${ct.numeroContrato || "#" + ct.id} (${ct.razaoSocialPrestador || "Prestador"})`;
      const chave = `${ct.companyId}::${titulo}`;
      if (!chavesExistentes.has(chave)) {
        await db.insert(almoxarifadoNotificacoes).values({
          companyId: ct.companyId,
          tipo: "pj_docs_pendentes",
          destinoModulo: "terceiros",
          titulo,
          mensagem: `O prestador ${ct.razaoSocialPrestador || ""} vinculado ao contrato ${ct.numeroContrato} possui documentos obrigatórios pendentes:\n${docsFaltando.map(d => `• ${d}`).join("\n")}\n\nFavor regularizar antes do próximo pagamento.`,
        } as any);
        chavesExistentes.add(chave);
        criados++;
      }
    }
  }

  if (criados > 0) {
    console.log(`[PurchaseJobs] ${criados} alerta(s) de contratos PJ criado(s).`);
  }
}

export { DOCS_OBRIGATORIOS_PJ };
