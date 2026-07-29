import { getDb } from "../db";
import {
  purchaseOrders, purchaseRequests, purchaseAccountsPayable,
  financialEntries, financialAccounts,
  fornecedores, buyerCommissions, purchaseCancellations,
  purchaseOrderItems, notificationLogs, almoxarifadoNotificacoes,
  comprasEntregasProgramadas, comprasOrdens, obras, empresasTerceiras,
} from "../../drizzle/schema";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import { createAuditLog } from "../db";
import { calcularParcelas, getTipoPagamentoInfo } from "../../shared/paymentConditions";
import { sendEmail } from "./smtpService";
import crypto from "crypto";

async function getContaId(db: any, companyId: number, codigo: string) {
  const res = await db.select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.companyId, companyId), eq((financialAccounts as any).codigo, codigo)))
    .limit(1);
  if (res?.[0]?.id) return res[0].id;

  const CONTA_DEFAULTS: Record<string, string> = {
    "3.2": "Despesas com Serviços",
    "3.3": "Despesas com Materiais",
    "3.4": "Despesas com Locação",
  };
  const nome = CONTA_DEFAULTS[codigo] || `Conta ${codigo}`;
  const inserted = await db.insert(financialAccounts).values({
    companyId,
    codigo,
    nome,
    tipo: "despesa_variavel",
    natureza: "devedora",
    nivel: 2,
    ativo: 1,
  }).returning({ id: financialAccounts.id });
  return inserted?.[0]?.id || null;
}

async function getSupplierFields(db: any, supplierId: number) {
  const rows = await db.select().from(fornecedores).where(eq(fornecedores.id, supplierId));
  return rows?.[0] ?? null;
}

export interface OCParcelasInput {
  ocId: number;
  companyId: number;
  obraId?: number | null;
  obraNome?: string | null;
  supplierId: number | null;
  supplierNome?: string | null;
  valorTotal: number;
  tipoPagamento?: string | null;
  condicaoPagamento?: string | null;
  numeroParcelas?: number;
  dataBase?: string | null;
  formaPagamento?: string | null;
  numero?: string | null;
  tipo?: string | null;
  freteSufixo?: string;
  vehicleId?: number | null;
}

// Rev. 1624 — Detecta OS por medição (serviço/pacote pago por medição mensal).
// Esses contratos NÃO devem virar título a pagar com valor integral em data única;
// devem entrar como PREVISÃO mensal no fluxo de caixa, e o título a pagar real
// só nasce quando uma medição é aprovada no módulo Terceiros → Medição.
function detectarMedicao(input: OCParcelasInput): boolean {
  const tipoOk = input.tipo === "servico" || input.tipo === "pacote";
  if (!tipoOk) return false;
  const norm = (s?: string | null) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos
  const tp = norm(input.tipoPagamento);
  const cp = norm(input.condicaoPagamento);
  // Match estrito por palavra inteira pra evitar falsos positivos
  // (ex.: "imediato", "midia", "remediar"). Aceita "medicao", "medicoes", "por medicao", "medicao mensal".
  const re = /\bmedic(ao|oes)\b/;
  return re.test(tp) || re.test(cp);
}

export async function criarParcelasFinanceiras(
  input: OCParcelasInput,
  userId: number,
  userName: string,
): Promise<{ entryIds: number[]; apIds: number[] }> {
  const db = await getDb();
  if (!db) return { entryIds: [], apIds: [] };

  const codigoConta = input.tipo === "servico" ? "3.2" : input.tipo === "locacao" ? "3.4" : "3.3";
  const contaId = await getContaId(db, input.companyId, codigoConta);
  const supplier = input.supplierId ? await getSupplierFields(db, input.supplierId) : null;

  const dataBase = input.dataBase || new Date().toISOString().split("T")[0];
  const isMdoMedicao = detectarMedicao(input);

  let parcelas: { numero: number; valor: number; dataVencimento: string; descricao: string }[];
  if (isMdoMedicao) {
    // Distribui o valor total em N previsões MENSAIS a partir da dataBase da OS,
    // ignorando o calcularParcelas (que para 'medicao' devolveria 1 parcela cheia +30d).
    const n = Math.max(1, Number(input.numeroParcelas || 1));
    const valorParcela = Math.round((input.valorTotal / n) * 100) / 100;
    const baseDt = new Date(dataBase + "T12:00:00");
    parcelas = Array.from({ length: n }, (_, i) => {
      const dt = new Date(baseDt);
      dt.setMonth(dt.getMonth() + i);
      const isLast = i === n - 1;
      const valor = isLast
        ? Math.round((input.valorTotal - valorParcela * (n - 1)) * 100) / 100
        : valorParcela;
      return {
        numero: i + 1,
        valor,
        dataVencimento: dt.toISOString().split("T")[0],
        descricao: `Medição ${i + 1}/${n}`,
      };
    });
  } else if (input.tipoPagamento) {
    parcelas = calcularParcelas(input.tipoPagamento, input.valorTotal, dataBase);
  } else {
    parcelas = [{ numero: 1, valor: input.valorTotal, dataVencimento: dataBase, descricao: "Pagamento único" }];
  }

  const totalParcelas = parcelas.length;
  const grupoId = totalParcelas > 1 ? crypto.randomUUID() : null;
  const ocLabel = input.numero || String(input.ocId);
  const tagPrev = isMdoMedicao ? "PREVISÃO MEDIÇÃO " : "";

  const entryIds: number[] = [];
  const apIds: number[] = [];

  await db.transaction(async (tx: any) => {
    for (const parcela of parcelas) {
      const sufixo = totalParcelas > 1 ? ` (${parcela.descricao})` : "";
      const frete = input.freteSufixo || "";
      const entryResult = await tx.insert(financialEntries).values({
        companyId: input.companyId,
        obraId: input.obraId || null,
        obraNome: input.obraNome || null,
        contaId,
        tipo: "despesa",
        natureza: "variavel",
        valorPrevisto: String(parcela.valor.toFixed(2)),
        dataCompetencia: new Date().toISOString().split("T")[0],
        dataVencimento: parcela.dataVencimento,
        status: "previsto",
        origemModulo: "compras",
        origemId: input.ocId,
        origemDescricao: `${tagPrev}OC #${ocLabel} — ${input.supplierNome || "Fornecedor"}${frete}${sufixo}`,
        parcelaNumero: parcela.numero,
        parcelaTotal: totalParcelas,
        parcelaGrupoId: grupoId,
        formaPagamento: input.formaPagamento || null,
        criadoPorId: userId,
        criadoPorNome: userName,
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
      } as any).returning({ id: (financialEntries as any).id });

      const financialEntryId = entryResult?.[0]?.id;
      if (financialEntryId) entryIds.push(financialEntryId);

      // Rev. 1624 — Para OS por medição, NÃO criar accounts_payable.
      // O título a pagar real será gerado quando a medição for aprovada
      // no módulo Terceiros → Medição. Aqui fica só a previsão mensal.
      if (isMdoMedicao) continue;

      const apResult = await tx.insert(purchaseAccountsPayable).values({
        companyId: input.companyId,
        ordemId: input.ocId,
        supplierId: input.supplierId,
        supplierNome: input.supplierNome || null,
        obraId: input.obraId || null,
        descricao: `OC #${ocLabel} — ${input.supplierNome || "Fornecedor"}${sufixo}`,
        valorTotal: String(parcela.valor.toFixed(2)),
        status: "bloqueado",
        formaPagamento: input.formaPagamento || null,
        dataVencimento: parcela.dataVencimento,
        financialEntryId,
        parcelaNumero: parcela.numero,
        parcelaTotal: totalParcelas,
        parcelaGrupoId: grupoId,
        supplierBanco: supplier?.banco || null,
        supplierAgencia: supplier?.agencia || null,
        supplierConta: supplier?.conta || null,
        supplierPix: supplier?.pix || null,
        supplierCnpj: supplier?.cnpj || null,
      } as any).returning({ id: purchaseAccountsPayable.id });

      const apId = apResult?.[0]?.id;
      if (apId) apIds.push(apId);
    }
  });

  const parcelasSummary = parcelas.length > 1
    ? ` | ${parcelas.length} parcelas: ${parcelas.map(p => `R$${p.valor.toFixed(2)} venc. ${p.dataVencimento}`).join(", ")}`
    : "";

  await createAuditLog({
    userId, userName, action: "CREATE", module: "compras",
    entityType: "oc_lancamento", entityId: input.ocId,
    details: `OC #${ocLabel} → ${entryIds.length} financial_entries [${entryIds.join(",")}] + ${apIds.length} accounts_payable [${apIds.join(",")}]${parcelasSummary}`,
  });

  return { entryIds, apIds };
}

// Rev. 4722 — SELF-HEAL: garante que uma OC aprovada/entregue tenha o título no
// Contas a Pagar. Caminhos como o recebimento pelo Almoxarifado (registerSmartEntry)
// marcavam a OC como entregue SEM passar pela integração financeira de
// atualizarStatusOrdem → centenas de OCs entregues sem título. Esta função replica
// exatamente a semântica do bloco inline de atualizarStatusOrdem (compras.ts):
// - só cria se NÃO existe entry ativa (origem compras/origem_id OU financial_entry_id);
// - conta 3.2/3.3/3.4 por tipo; fornecedor com ciclo de fechamento → vencimento = competência;
// - entregue/entregue_parcial → a_pagar; aprovada → previsto.
// Exclusões respeitadas: FD (modalidade_fd ≠ normal), cartão, total <= 0.
// Hardening (review Rev. 4722): tenant-explícito (companyId obrigatório no WHERE),
// advisory lock transacional por OC contra corrida de recebimentos concorrentes,
// dedup considera SÓ entries não-canceladas, competência = dataLancamento || hoje
// (mesma semântica de atualizarStatusOrdem — backfill de datas antigas é só via SQL).
export async function garantirEntryDaOC(ocId: number, companyId: number, dataLancamento?: string | null): Promise<number | null> {
  const outerDb = await getDb();
  if (!outerDb) return null;
  return await outerDb.transaction(async (db: any) => {
  // Lock por OC: serializa com outros recebimentos/self-heals da mesma OC.
  await db.execute(sql`SELECT pg_advisory_xact_lock(477002, ${ocId})`);
  const [oc] = await db.select().from(comprasOrdens)
    .where(and(eq(comprasOrdens.id, ocId), eq(comprasOrdens.companyId, companyId)));
  if (!oc) return null;
  const status = String((oc as any).status || "");
  if (!["aprovada", "entregue", "entregue_parcial", "parcial", "concluida"].includes(status)) return null;
  const total = parseFloat(String((oc as any).total ?? "0")) || 0;
  if (total <= 0) return null;
  const modalidadeFd = (oc as any).modalidadeFd ?? "normal";
  if (modalidadeFd && modalidadeFd !== "normal") return null; // FD nunca vira título padrão
  if ((oc as any).cartaoId || (oc as any).formaPagamento === "cartao") return null; // vai pra fatura do cartão

  // Já tem entry ativa? (via link direto OU por origem)
  if ((oc as any).financialEntryId) {
    const [linked] = await db.select({ id: financialEntries.id, status: financialEntries.status })
      .from(financialEntries).where(eq(financialEntries.id, (oc as any).financialEntryId));
    if (linked && linked.status !== "cancelado") return null;
  }
  // Só entries ATIVAS contam como existentes — se só houver canceladas, cria de novo.
  const existentes = await db.select({ id: financialEntries.id })
    .from(financialEntries)
    .where(and(
      inArray((financialEntries as any).origemModulo, ["compras", "compra_oc", "transferencia_estoque"]),
      eq((financialEntries as any).origemId, ocId),
      eq((financialEntries as any).companyId, companyId),
      ne((financialEntries as any).status, "cancelado"),
    ));
  if (existentes.length > 0) {
    // Entries ativas existem mas o link está solto — repara o link e sai.
    const ativa = existentes[0];
    if (!(oc as any).financialEntryId) {
      await db.update(comprasOrdens).set({ financialEntryId: ativa.id } as any)
        .where(and(eq(comprasOrdens.id, ocId), eq(comprasOrdens.companyId, companyId)));
    }
    return null;
  }

  const obraNomeFin: string | null = (oc as any).obraId
    ? (await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, (oc as any).obraId)))[0]?.nome ?? null
    : null;
  const codigoConta = (oc as any).tipo === "servico" ? "3.2" : (oc as any).tipo === "locacao" ? "3.4" : "3.3";
  const contaId = await getContaId(db, (oc as any).companyId, codigoConta);

  const novoStatus = status === "aprovada" ? "previsto" : "a_pagar";
  const dataCompetenciaFin = dataLancamento || new Date().toISOString().split("T")[0];
  let vencimentoFin: string | null = (oc as any).dataVencimento ?? (oc as any).dataEntregaPrevista ?? null;
  if ((oc as any).fornecedorId) {
    const [cycleCfg] = await db.select({ cicloPagamento: (empresasTerceiras as any).cicloPagamento })
      .from(empresasTerceiras as any)
      .where(and(
        eq((empresasTerceiras as any).fornecedorId, (oc as any).fornecedorId),
        eq((empresasTerceiras as any).companyId, (oc as any).companyId),
      ))
      .limit(1);
    if (cycleCfg?.cicloPagamento && cycleCfg.cicloPagamento !== "avista") {
      vencimentoFin = dataCompetenciaFin;
    }
  }
  if (!vencimentoFin) vencimentoFin = dataCompetenciaFin;

  const [entry] = await db.insert(financialEntries as any).values({
    companyId: (oc as any).companyId,
    obraId: (oc as any).obraId ?? null,
    obraNome: obraNomeFin,
    contaId,
    tipo: "despesa",
    natureza: "variavel",
    valorPrevisto: String((oc as any).total ?? "0"),
    dataCompetencia: dataCompetenciaFin,
    dataVencimento: vencimentoFin,
    status: novoStatus,
    origemModulo: "compras",
    origemId: ocId,
    fornecedorNome: (oc as any).fornecedorNome ?? null,
    descricao: `OC ${(oc as any).numeroOc}${(oc as any).fornecedorNome ? " — " + (oc as any).fornecedorNome : ""}`,
  } as any).returning({ id: (financialEntries as any).id });
  if (entry?.id) {
    await db.update(comprasOrdens).set({ financialEntryId: entry.id } as any)
      .where(and(eq(comprasOrdens.id, ocId), eq(comprasOrdens.companyId, companyId)));
    return entry.id;
  }
  return null;
  });
}

export async function onOCEmitida(ocId: number, userId: number, userName: string) {
  const db = await getDb();
  if (!db) return;

  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, ocId));
  const oc = rows?.[0];
  if (!oc) return;

  const { entryIds, apIds } = await criarParcelasFinanceiras({
    ocId: oc.id,
    companyId: oc.companyId,
    obraId: oc.obraId,
    obraNome: oc.obraNome,
    supplierId: oc.supplierId,
    supplierNome: oc.supplierNome,
    valorTotal: parseFloat(String(oc.valorTotal || "0")),
    tipoPagamento: (oc as any).tipoPagamento,
    condicaoPagamento: (oc as any).condicaoPagamento,
    numeroParcelas: oc.numeroParcelas ?? 1,
    dataBase: oc.prazoEntrega || null,
    formaPagamento: oc.formaPagamento || null,
    numero: oc.numero,
    tipo: oc.tipo,
    freteSufixo: (oc as any).freteTipo === "fob" && parseFloat((oc as any).valorFrete || "0") > 0 ? ` (FOB frete: R$${parseFloat((oc as any).valorFrete).toFixed(2)})` : "",
  }, userId, userName);

  if (entryIds.length > 0 || apIds.length > 0) {
    await db.update(purchaseOrders).set({
      financialEntryId: entryIds[0] || null,
      accountsPayableId: apIds[0] || null,
    } as any).where(eq(purchaseOrders.id, ocId));
  }

  try {
    await alertaFinanceiroOCEmitida(db, oc, userId, userName);
  } catch (e) {
    console.error("[AlertaFinanceiro] Erro ao criar alerta financeiro:", e);
  }

  try {
    await alertaAlmoxarifadoOCEmitida(db, oc, userId, userName);
  } catch (e) {
    console.error("[AlertaAlmoxarifado] Erro ao criar alerta almoxarifado:", e);
  }
}

async function alertaFinanceiroOCEmitida(db: any, oc: any, userId: number, userName: string) {
  const ocLabel = oc.numero || String(oc.id);
  const valorTotal = parseFloat(String(oc.valorTotal || "0"));
  const dataBase = oc.prazoEntrega || new Date().toISOString().split("T")[0];

  const parcelas = (oc as any).tipoPagamento
    ? calcularParcelas((oc as any).tipoPagamento, valorTotal, dataBase)
    : [{ numero: 1, valor: valorTotal, dataVencimento: dataBase, descricao: "Pagamento único" }];

  const parcelasTexto = parcelas.map(p =>
    `  • Parcela ${p.numero}/${parcelas.length}: R$ ${p.valor.toFixed(2)} — Vencimento: ${p.dataVencimento}`
  ).join("\n");

  const titulo = `OC #${ocLabel} emitida — Previsão de pagamento`;
  const corpo = [
    `Ordem de Compra #${ocLabel} foi emitida.`,
    ``,
    `Fornecedor: ${oc.supplierNome || "N/A"}`,
    `Obra: ${oc.obraNome || "N/A"}`,
    `Valor Total: R$ ${valorTotal.toFixed(2)}`,
    `Forma de Pagamento: ${oc.formaPagamento || "N/A"}`,
    ``,
    `Parcelas:`,
    parcelasTexto,
  ].join("\n");

  const trackingId = crypto.randomUUID();

  await db.insert(notificationLogs).values({
    companyId: oc.companyId,
    employeeName: oc.supplierNome || "Fornecedor",
    tipoMovimentacao: "oc_emitida_financeiro",
    recipientName: "Setor Financeiro",
    recipientEmail: "financeiro@sistema.local",
    titulo,
    corpo,
    statusEnvio: "enviado",
    trackingId,
    disparadoPor: userName,
    disparadoPorId: userId,
  });

  const corpoHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<tr><td style="background:#1a365d;padding:20px 30px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:20px;">ALERTA FINANCEIRO — COMPRAS</h1>
<p style="color:#a0c4ff;margin:5px 0 0;font-size:12px;">Sistema de Gestão Integrada</p>
</td></tr>
<tr><td style="padding:30px;">
<h2 style="color:#1a365d;margin:0 0 20px;font-size:16px;border-bottom:2px solid #e2e8f0;padding-bottom:10px;">${titulo}</h2>
<div style="color:#2d3748;font-size:14px;line-height:1.6;">
<p><strong>Fornecedor:</strong> ${oc.supplierNome || "N/A"}</p>
<p><strong>Obra:</strong> ${oc.obraNome || "N/A"}</p>
<p><strong>Valor Total:</strong> R$ ${valorTotal.toFixed(2)}</p>
<p><strong>Forma de Pagamento:</strong> ${oc.formaPagamento || "N/A"}</p>
<h3 style="color:#1a365d;margin:20px 0 10px;">Parcelas</h3>
<table style="width:100%;border-collapse:collapse;">
<tr style="background:#f7fafc;"><th style="border:1px solid #e2e8f0;padding:8px;text-align:left;">Parcela</th><th style="border:1px solid #e2e8f0;padding:8px;text-align:right;">Valor</th><th style="border:1px solid #e2e8f0;padding:8px;text-align:center;">Vencimento</th></tr>
${parcelas.map(p => `<tr><td style="border:1px solid #e2e8f0;padding:8px;">${p.numero}/${parcelas.length}</td><td style="border:1px solid #e2e8f0;padding:8px;text-align:right;">R$ ${p.valor.toFixed(2)}</td><td style="border:1px solid #e2e8f0;padding:8px;text-align:center;">${p.dataVencimento}</td></tr>`).join("")}
</table>
</div></td></tr>
<tr><td style="background:#f7fafc;padding:15px 30px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#718096;font-size:11px;margin:0;">E-mail automático — ERP Gestão Integrada</p>
</td></tr></table></td></tr></table></body></html>`;

  try {
    await sendEmail({
      to: "financeiro@sistema.local",
      subject: titulo,
      html: corpoHtml,
      text: corpo,
    });
  } catch (e) {
    console.warn("[AlertaFinanceiro] SMTP não configurado ou erro no envio:", (e as any)?.message);
  }

  console.log(`[AlertaFinanceiro] Alerta financeiro criado para OC #${ocLabel}`);
}

async function alertaAlmoxarifadoOCEmitida(db: any, oc: any, userId: number, userName: string) {
  const ocLabel = oc.numero || String(oc.id);
  const supplier = oc.supplierId ? await getSupplierFields(db, oc.supplierId) : null;

  const itens = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.ordemId, oc.id));

  const itensTexto = itens.map((item: any) =>
    `• ${item.insumoNome} — ${parseFloat(String(item.quantidadePedida || "0"))} ${item.unidade}`
  ).join("\n");

  const contatoTexto = supplier ? [
    supplier.contatoNome ? `Contato: ${supplier.contatoNome}` : null,
    supplier.telefone ? `Tel: ${supplier.telefone}` : null,
    supplier.contatoCelular ? `Cel: ${supplier.contatoCelular}` : null,
    supplier.email ? `Email: ${supplier.email}` : null,
    supplier.contatoEmail ? `Email Contato: ${supplier.contatoEmail}` : null,
  ].filter(Boolean).join("\n") : "Sem dados de contato";

  const titulo = `OC #${ocLabel} — Materiais aguardados`;
  const mensagem = [
    `Ordem de Compra #${ocLabel} emitida.`,
    `Fornecedor: ${oc.supplierNome || "N/A"}`,
    `Obra: ${oc.obraNome || "N/A"}`,
    `Data prevista de entrega: ${oc.prazoEntrega || "N/A"}`,
    ``,
    `Itens aguardados:`,
    itensTexto,
    ``,
    `Dados de contato do fornecedor:`,
    contatoTexto,
  ].join("\n");

  await db.insert(almoxarifadoNotificacoes).values({
    companyId: oc.companyId,
    tipo: "oc_emitida",
    destinoModulo: "almoxarifado",
    titulo,
    mensagem,
  } as any);

  if (itens.length > 0) {
    const itemIds = itens.map((i: any) => i.id);
    const entregas = await db.select().from(comprasEntregasProgramadas)
      .where(inArray(comprasEntregasProgramadas.ordemItemId, itemIds));

    const entregasMap: Record<number, any[]> = {};
    for (const e of entregas) {
      if (!entregasMap[e.ordemItemId]) entregasMap[e.ordemItemId] = [];
      entregasMap[e.ordemItemId].push(e);
    }

    for (const item of itens) {
      const itemEntregas = entregasMap[item.id] || [];
      for (const entrega of itemEntregas) {
        const tituloEntrega = `Entrega programada — OC #${ocLabel} — ${entrega.dataEntrega}`;
        const msgEntrega = [
          `Entrega programada para ${entrega.dataEntrega}`,
          `Item: ${item.insumoNome}`,
          `Quantidade: ${parseFloat(String(entrega.quantidade || "0"))} ${item.unidade}`,
          `Fornecedor: ${oc.supplierNome || "N/A"}`,
          `Obra: ${oc.obraNome || "N/A"}`,
          ``,
          `Dados de contato:`,
          contatoTexto,
        ].join("\n");

        await db.insert(almoxarifadoNotificacoes).values({
          companyId: oc.companyId,
          tipo: "entrega_programada",
          destinoModulo: "almoxarifado",
          titulo: tituloEntrega,
          mensagem: msgEntrega,
        } as any);
      }
    }
  }

  const corpoHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<tr><td style="background:#2d7d46;padding:20px 30px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:20px;">ALERTA ALMOXARIFADO</h1>
<p style="color:#a0ffa0;margin:5px 0 0;font-size:12px;">Sistema de Gestão Integrada</p>
</td></tr>
<tr><td style="padding:30px;">
<h2 style="color:#2d7d46;margin:0 0 20px;font-size:16px;border-bottom:2px solid #e2e8f0;padding-bottom:10px;">${titulo}</h2>
<div style="color:#2d3748;font-size:14px;line-height:1.6;">
<p><strong>Fornecedor:</strong> ${oc.supplierNome || "N/A"}</p>
<p><strong>Obra:</strong> ${oc.obraNome || "N/A"}</p>
<p><strong>Data prevista:</strong> ${oc.prazoEntrega || "N/A"}</p>
<h3 style="color:#2d7d46;margin:20px 0 10px;">Itens Aguardados</h3>
<table style="width:100%;border-collapse:collapse;">
<tr style="background:#f0fff4;"><th style="border:1px solid #c6f6d5;padding:8px;text-align:left;">Item</th><th style="border:1px solid #c6f6d5;padding:8px;text-align:right;">Qtd</th><th style="border:1px solid #c6f6d5;padding:8px;">Unid</th></tr>
${itens.map((item: any) => `<tr><td style="border:1px solid #c6f6d5;padding:8px;">${item.insumoNome}</td><td style="border:1px solid #c6f6d5;padding:8px;text-align:right;">${parseFloat(String(item.quantidadePedida || "0"))}</td><td style="border:1px solid #c6f6d5;padding:8px;">${item.unidade}</td></tr>`).join("")}
</table>
<h3 style="color:#2d7d46;margin:20px 0 10px;">Contato do Fornecedor</h3>
<p>${contatoTexto.replace(/\n/g, "<br>")}</p>
</div></td></tr>
<tr><td style="background:#f7fafc;padding:15px 30px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#718096;font-size:11px;margin:0;">E-mail automático — ERP Gestão Integrada</p>
</td></tr></table></td></tr></table></body></html>`;

  try {
    await sendEmail({
      to: "almoxarifado@sistema.local",
      subject: titulo,
      html: corpoHtml,
      text: mensagem,
    });
  } catch (e) {
    console.warn("[AlertaAlmoxarifado] SMTP não configurado ou erro no envio:", (e as any)?.message);
  }

  console.log(`[AlertaAlmoxarifado] Alerta almoxarifado criado para OC #${ocLabel} (${itens.length} itens)`);
}

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

  // Rev. 1624 — OS por medição não tem AP, mas cria previsões diretas.
  // Cancela previsões remanescentes (entries vivos) que apontem para esta OC.
  const previsoesRes = await db.update(financialEntries)
    .set({ status: "cancelado" } as any)
    .where(and(
      eq((financialEntries as any).origemModulo, "compras"),
      eq((financialEntries as any).origemId, ocId),
      inArray((financialEntries as any).status, ["previsto", "a_pagar"]),
    ))
    .returning({ id: (financialEntries as any).id });
  if (previsoesRes && previsoesRes.length > 0) {
    efeitos.push(`${previsoesRes.length} previsões financeiras canceladas (medição/órfãs)`);
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
