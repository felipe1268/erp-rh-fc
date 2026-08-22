/**
 * purchaseAutoJobs.ts
 *
 * Periodic purchase-module jobs.
 *
 * Performance improvements:
 *  1. In-process mutex (runningCycle flag) prevents overlapping timer calls.
 *  2. Postgres advisory lock (pg_try_advisory_lock) prevents duplicate runs
 *     across horizontally-scaled instances.
 *  3. PJ document N+1 eliminated: all pjDocumentos for active contracts are
 *     fetched in one query, keyed by (employeeId, companyId).
 *  4. All broad selects project only the columns actually consumed.
 *  5. Notification inserts for entrega_proxima and pj alerts are batched.
 *  6. notificationLogs inserts for cotacao_vencendo are also batched.
 *  7. Database-backed keys make automatic alert writes idempotent even when
 *     another writer bypasses this scheduler.
 */

import { getDb } from "../db";
import {
  purchaseOrders,
  purchaseQuotations,
  supplierContracts,
  comprasEntregasProgramadas,
  purchaseOrderItems,
  almoxarifadoNotificacoes,
  notificationLogs,
  comprasCotacoes,
  pjContracts,
  pjDocumentos,
} from "../../drizzle/schema";
import { eq, and, lte, gte, inArray, sql, isNull } from "drizzle-orm";
import type { PoolClient } from "pg";
import { sendEmail } from "./smtpService";
import { buildPurchaseAlertDedupKey } from "./purchaseAutoJobKeys";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Advisory-lock key (must be a stable int64; use a fixed application-domain
// constant that is unlikely to collide with other subsystems).
// ---------------------------------------------------------------------------
const ADVISORY_LOCK_KEY = "8103508875801621349"; // 0x7075726368617365 ("purchase")

// ---------------------------------------------------------------------------
// In-process guard: prevents concurrent cycles inside one Node process.
// ---------------------------------------------------------------------------
let runningCycle = false;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function rollbackAndReleaseLockClient(client: PoolClient, context: string): Promise<void> {
  try {
    await client.query("ROLLBACK");
    try {
      client.release();
    } catch (releaseError) {
      console.error(`[PurchaseJobs] Falha ao devolver cliente após ${context}:`, releaseError);
    }
  } catch (rollbackError) {
    console.error(`[PurchaseJobs] Falha ao encerrar ${context}:`, rollbackError);
    // Never return a client with an uncertain/open transaction to the pool.
    // Passing the error makes pg.Pool destroy the underlying connection.
    try {
      client.release(toError(rollbackError));
    } catch (releaseError) {
      console.error(`[PurchaseJobs] Falha ao descartar cliente após ${context}:`, releaseError);
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Build the dedup key used for almoxarifadoNotificacoes rows. */
export function buildNotifKey(companyId: number | null | undefined, titulo: string): string {
  return `${companyId ?? ""}::${titulo}`;
}

/** Compute days remaining from today (may be negative if already past). */
export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

/** Extract YYYY-MM-DD from a JS Date. */
export function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export type PurchaseAlmoxAlertRow = {
  companyId: number;
  tipo: string;
  destinoModulo: string;
  titulo: string;
  mensagem: string;
  dedupKey: string;
};

export type PurchaseNotificationLogRow = {
  companyId: number;
  employeeName: string;
  tipoMovimentacao: string;
  recipientName: string;
  recipientEmail: string;
  titulo: string;
  corpo: string;
  statusEnvio: string;
  trackingId: string;
  disparadoPor: string;
  dedupKey: string;
};

export type PurchaseQuotationEmail = {
  titulo: string;
  corpo: string;
  dedupKey: string;
};

/**
 * Persist automatic warehouse/PJ alerts and report which rows won a
 * concurrent insert. The partial unique index on (company_id, dedup_key) is
 * the final authority; the pre-read checks in each job are only an
 * optimization.
 */
export async function persistPurchaseAlmoxAlerts(rows: PurchaseAlmoxAlertRow[]) {
  if (rows.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao persistir alertas automáticos de compras.");

  return db
    .insert(almoxarifadoNotificacoes)
    .values(rows as never)
    .onConflictDoNothing()
    .returning({ id: almoxarifadoNotificacoes.id });
}

/**
 * Persist quotation logs and send mail only for keys returned by INSERT.
 * This keeps a losing concurrent writer from sending a duplicate e-mail.
 */
export async function persistQuotationLogsAndSendEmails(
  rows: PurchaseNotificationLogRow[],
  emailQueue: PurchaseQuotationEmail[],
  emailSender: typeof sendEmail = sendEmail,
) {
  if (rows.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao persistir alertas de cotação.");

  const inserted = await db
    .insert(notificationLogs)
    .values(rows as never)
    .onConflictDoNothing()
    .returning({ dedupKey: notificationLogs.dedupKey });

  const insertedKeys = new Set(inserted.map((row) => row.dedupKey));
  for (const { titulo, corpo, dedupKey } of emailQueue) {
    if (!insertedKeys.has(dedupKey)) continue;
    try {
      await emailSender({
        to: "compras@sistema.local",
        subject: titulo,
        html: `<p>${corpo.replace(/\n/g, "<br>")}</p>`,
        text: corpo,
      });
    } catch (_) {
      // E-mail failure must not block the job or undo its idempotency claim.
    }
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------

async function runCycle(): Promise<void> {
  if (runningCycle) {
    console.log("[PurchaseJobs] Ciclo anterior ainda em execução — pulando.");
    return;
  }
  runningCycle = true;

  const db = await getDb();
  if (!db) {
    runningCycle = false;
    return;
  }

  // Neon may sit behind a transaction pooler, so a session-level advisory lock
  // is not safe even when queries use the same PoolClient: without an open
  // transaction, consecutive queries may reach different Postgres backends.
  // Keep a transaction open on a dedicated client and use an xact lock; the
  // pooler pins that backend until ROLLBACK releases the lock.
  let lockAcquired = false;
  let lockClient: PoolClient | null = null;
  let lockTransactionOpen = false;
  try {
    lockClient = await db.$client.connect();
    await lockClient.query("BEGIN");
    lockTransactionOpen = true;
    const lockResult = await lockClient.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_xact_lock($1::bigint) AS ok",
      [ADVISORY_LOCK_KEY],
    );
    lockAcquired = lockResult.rows[0]?.ok === true;
  } catch (e) {
    console.error("[PurchaseJobs] Falha ao tentar advisory lock:", e);
    if (lockClient) {
      if (lockTransactionOpen) {
        await rollbackAndReleaseLockClient(lockClient, "transação do advisory lock");
      } else {
        // BEGIN itself failed; discard the connection instead of reusing it.
        try {
          lockClient.release(toError(e));
        } catch (releaseError) {
          console.error("[PurchaseJobs] Falha ao descartar cliente após erro no BEGIN:", releaseError);
        }
      }
    }
    runningCycle = false;
    return;
  }

  if (!lockClient || !lockAcquired) {
    console.log("[PurchaseJobs] Advisory lock não obtido — outra instância em execução.");
    if (lockClient) {
      await rollbackAndReleaseLockClient(lockClient, "transação sem lock");
    }
    runningCycle = false;
    return;
  }

  try {
    await checkOCDeadlines();
    await checkQuotationExpiries();
    await checkContractExpirations();
    await checkEntregasProximas();
    await checkCotacoesVencendo();
    await checkPJContractAlerts();
  } finally {
    // Ending the transaction releases the xact advisory lock atomically.
    try {
      await rollbackAndReleaseLockClient(lockClient, "advisory lock");
    } finally {
      runningCycle = false;
    }
  }
}

export function startPurchaseJobs(): void {
  setTimeout(async () => {
    try {
      await runCycle();
    } catch (e) {
      console.error("[PurchaseJobs] Erro inicial:", e);
    }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    try {
      await runCycle();
    } catch (e) {
      console.error("[PurchaseJobs] Erro:", e);
    }
  }, 60 * 60 * 1000);

  console.log("[PurchaseJobs] Jobs de compras iniciados (intervalo: 60 min).");
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkOCDeadlines(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const hoje = toDateStr(new Date());

  // Project only the columns we log.
  const vencidas = await db
    .select({ id: purchaseOrders.id, numero: purchaseOrders.numero, prazoEntrega: purchaseOrders.prazoEntrega })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.status, "emitida"), lte(purchaseOrders.prazoEntrega, hoje)));

  for (const oc of vencidas) {
    console.log(`[PurchaseJobs] OC #${oc.numero} prazo vencido: ${oc.prazoEntrega}`);
  }
}

async function checkQuotationExpiries(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const hoje = toDateStr(new Date());

  await db
    .update(purchaseQuotations)
    .set({ status: "expirada" } as never)
    .where(and(eq(purchaseQuotations.status, "aberta"), lte(purchaseQuotations.validadeAte, hoje)));
}

async function checkContractExpirations(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const em7dias = new Date();
  em7dias.setDate(em7dias.getDate() + 7);
  const em7diasStr = toDateStr(em7dias);

  // Project only the columns we inspect.
  const vencendo = await db
    .select({
      id: supplierContracts.id,
      supplierNome: supplierContracts.supplierNome,
      dataFim: supplierContracts.dataFim,
      alertaEnviado: supplierContracts.alertaEnviado,
    })
    .from(supplierContracts)
    .where(and(eq(supplierContracts.status, "ativo"), lte(supplierContracts.dataFim, em7diasStr)));

  for (const c of vencendo) {
    if (!c.alertaEnviado) {
      console.log(`[PurchaseJobs] Contrato vencendo: ${c.supplierNome} — ${c.dataFim}`);
    }
  }
}

async function checkEntregasProximas(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const hoje = new Date();
  const hojeStr = toDateStr(hoje);
  const em3dias = new Date();
  em3dias.setDate(em3dias.getDate() + 3);
  const em3diasStr = toDateStr(em3dias);

  // Project only ordemItemId + dataEntrega + quantidade.
  const entregasPendentes = await db
    .select({
      id: comprasEntregasProgramadas.id,
      ordemItemId: comprasEntregasProgramadas.ordemItemId,
      dataEntrega: comprasEntregasProgramadas.dataEntrega,
      quantidade: comprasEntregasProgramadas.quantidade,
    })
    .from(comprasEntregasProgramadas)
    .where(
      and(
        eq(comprasEntregasProgramadas.status, "pendente"),
        gte(comprasEntregasProgramadas.dataEntrega, hojeStr),
        lte(comprasEntregasProgramadas.dataEntrega, em3diasStr),
      ),
    );

  if (entregasPendentes.length === 0) return;

  const itemIds = Array.from(new Set(entregasPendentes.map((e) => e.ordemItemId)));

  // Project only what is actually used downstream.
  const itens = await db
    .select({
      id: purchaseOrderItems.id,
      ordemId: purchaseOrderItems.ordemId,
      insumoNome: purchaseOrderItems.insumoNome,
      unidade: purchaseOrderItems.unidade,
    })
    .from(purchaseOrderItems)
    .where(inArray(purchaseOrderItems.id, itemIds));

  const itensMap: Record<number, typeof itens[number]> = {};
  for (const i of itens) itensMap[i.id] = i;

  const ordemIds = Array.from(new Set(itens.map((i) => i.ordemId)));
  const ordensMap: Record<number, { id: number; companyId: number; numero: string | null; supplierNome: string | null; obraNome: string | null }> = {};

  if (ordemIds.length > 0) {
    const ordens = await db
      .select({
        id: purchaseOrders.id,
        companyId: purchaseOrders.companyId,
        numero: purchaseOrders.numero,
        supplierNome: purchaseOrders.supplierNome,
        obraNome: purchaseOrders.obraNome,
      })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.id, ordemIds));
    for (const o of ordens) ordensMap[o.id] = o;
  }

  // Dedup: fetch today's existing keys.
  const existentes = await db
    .select({ titulo: almoxarifadoNotificacoes.titulo, companyId: almoxarifadoNotificacoes.companyId })
    .from(almoxarifadoNotificacoes)
    .where(
      and(
        eq(almoxarifadoNotificacoes.tipo, "entrega_proxima"),
        sql`DATE(${almoxarifadoNotificacoes.criadoEm}) = ${hojeStr}`,
      ),
    );
  const chavesExistentes = new Set(existentes.map((e) => buildNotifKey(e.companyId, e.titulo)));

  // Build batch of new rows.
  const novos: PurchaseAlmoxAlertRow[] = [];

  for (const entrega of entregasPendentes) {
    const item = itensMap[entrega.ordemItemId];
    if (!item) continue;
    const ordem = ordensMap[item.ordemId];
    if (!ordem) continue;

    const ocLabel = ordem.numero || String(ordem.id);
    const titulo = `Entrega se aproximando — OC #${ocLabel} — ${item.insumoNome} — ${entrega.dataEntrega}`;
    const chave = buildNotifKey(ordem.companyId, titulo);
    if (chavesExistentes.has(chave)) continue;

    const mensagem = [
      `A entrega programada para ${entrega.dataEntrega} está se aproximando.`,
      ``,
      `OC: #${ocLabel}`,
      `Item: ${item.insumoNome}`,
      `Quantidade: ${parseFloat(String(entrega.quantidade || "0"))} ${item.unidade}`,
      `Fornecedor: ${ordem.supplierNome || "N/A"}`,
      `Obra: ${ordem.obraNome || "N/A"}`,
    ].join("\n");

    novos.push({
      companyId: ordem.companyId,
      tipo: "entrega_proxima",
      destinoModulo: "almoxarifado",
      titulo,
      mensagem,
      dedupKey: buildPurchaseAlertDedupKey("entrega_proxima", entrega.id, hojeStr),
    });
    chavesExistentes.add(chave); // prevent duplicates within this batch
  }

  if (novos.length > 0) {
    const inseridos = await persistPurchaseAlmoxAlerts(novos);
    console.log(`[PurchaseJobs] ${inseridos.length} alerta(s) de entrega próxima criado(s).`);
  }
}

async function checkCotacoesVencendo(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const hoje = new Date();
  const hojeStr = toDateStr(hoje);
  const em3dias = new Date();
  em3dias.setDate(em3dias.getDate() + 3);
  const em3diasStr = toDateStr(em3dias);

  // Project only what we use.
  const cotacoesVencendo = await db
    .select({
      id: purchaseQuotations.id,
      companyId: purchaseQuotations.companyId,
      validadeAte: purchaseQuotations.validadeAte,
      compradorNome: purchaseQuotations.compradorNome,
      status: purchaseQuotations.status,
    })
    .from(purchaseQuotations)
    .where(
      and(
        eq(purchaseQuotations.status, "aberta"),
        gte(purchaseQuotations.validadeAte, hojeStr),
        lte(purchaseQuotations.validadeAte, em3diasStr),
      ),
    );

  const cotacoesCVencendo = await db
    .select({
      id: comprasCotacoes.id,
      companyId: comprasCotacoes.companyId,
      numeroCotacao: comprasCotacoes.numeroCotacao,
      dataValidade: comprasCotacoes.dataValidade,
      descricao: comprasCotacoes.descricao,
      status: comprasCotacoes.status,
    })
    .from(comprasCotacoes)
    .where(
      and(
        eq(comprasCotacoes.status, "pendente"),
        gte(comprasCotacoes.dataValidade, hojeStr),
        lte(comprasCotacoes.dataValidade, em3diasStr),
      ),
    );

  const existentes = await db
    .select({ titulo: notificationLogs.titulo, companyId: notificationLogs.companyId })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.tipoMovimentacao, "cotacao_vencendo"),
        sql`DATE(${notificationLogs.enviadoEm}) = ${hojeStr}`,
      ),
    );
  const chavesExistentes = new Set(existentes.map((e) => buildNotifKey(e.companyId, e.titulo)));

  // Build batch rows.
  const novosLogs: PurchaseNotificationLogRow[] = [];

  // Collect (titulo, corpo) for e-mail sending so we can do it after the batch insert.
  const emailQueue: PurchaseQuotationEmail[] = [];

  for (const cot of cotacoesVencendo) {
    const titulo = `Cotação #${cot.id} expira em ${cot.validadeAte}`;
    const chave = buildNotifKey(cot.companyId, titulo);
    if (chavesExistentes.has(chave)) continue;

    const corpo = [
      `A cotação #${cot.id} está prestes a expirar.`,
      `Validade: ${cot.validadeAte}`,
      `Comprador: ${cot.compradorNome || "N/A"}`,
      `Status: ${cot.status}`,
    ].join("\n");

    const dedupKey = buildPurchaseAlertDedupKey("cotacao_vencendo", `purchase-quotation-${cot.id}`, hojeStr);
    novosLogs.push({
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
      dedupKey,
    });
    emailQueue.push({ titulo, corpo, dedupKey });
    chavesExistentes.add(chave);
  }

  for (const cot of cotacoesCVencendo) {
    const titulo = `Cotação ${cot.numeroCotacao} expira em ${cot.dataValidade}`;
    const chave = buildNotifKey(cot.companyId, titulo);
    if (chavesExistentes.has(chave)) continue;

    const corpo = [
      `A cotação ${cot.numeroCotacao} está prestes a expirar.`,
      `Validade: ${cot.dataValidade}`,
      `Descrição: ${cot.descricao || "N/A"}`,
      `Status: ${cot.status}`,
    ].join("\n");

    novosLogs.push({
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
      dedupKey: buildPurchaseAlertDedupKey("cotacao_vencendo", `compras-cotacao-${cot.id}`, hojeStr),
    });
    // comprasCotacoes variant does not send e-mail (original behaviour preserved)
    chavesExistentes.add(chave);
  }

  if (novosLogs.length > 0) {
    const inseridos = await persistQuotationLogsAndSendEmails(novosLogs, emailQueue);
    console.log(`[PurchaseJobs] ${inseridos.length} alerta(s) de cotação vencendo criado(s).`);
  }
}

// ---------------------------------------------------------------------------
// Required document types for PJ contracts.
// ---------------------------------------------------------------------------
export const DOCS_OBRIGATORIOS_PJ = ["CNPJ", "contrato_social", "seguro"] as const;

async function checkPJContractAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const hojeStr = toDateStr(new Date());
  const em30dias = new Date();
  em30dias.setDate(em30dias.getDate() + 30);
  const em30diasStr = toDateStr(em30dias);

  // Project only what is used.
  const contratosAtivos = await db
    .select({
      id: pjContracts.id,
      companyId: pjContracts.companyId,
      employeeId: pjContracts.employeeId,
      numeroContrato: pjContracts.numeroContrato,
      razaoSocialPrestador: pjContracts.razaoSocialPrestador,
      dataFim: pjContracts.dataFim,
      valorTotalContrato: pjContracts.valorTotalContrato,
      valorMedido: pjContracts.valorMedido,
    })
    .from(pjContracts)
    .where(and(eq(pjContracts.status, "ativo"), isNull(pjContracts.deletedAt)));

  if (contratosAtivos.length === 0) return;

  // ── Preload all pjDocumentos for active (employeeId, companyId) pairs ──────
  // Single query replaces the N+1 loop.
  const pairsKey = (employeeId: number, companyId: number) => `${employeeId}:${companyId}`;

  const uniquePairs = Array.from(
    new Map(
      contratosAtivos.map((ct) => [pairsKey(ct.employeeId, ct.companyId), { employeeId: ct.employeeId, companyId: ct.companyId }]),
    ).values(),
  );

  // Build a single OR-condition via OR of (employeeId, companyId) tuples.
  // Drizzle doesn't have a native tuple-in, so we use raw SQL.
  const tupleList = uniquePairs
    .map((p) => `(${p.employeeId}, ${p.companyId})`)
    .join(", ");

  const allDocs = await db
    .select({
      employeeId: pjDocumentos.employeeId,
      companyId: pjDocumentos.companyId,
      tipo: pjDocumentos.tipo,
    })
    .from(pjDocumentos)
    .where(
      and(
        isNull(pjDocumentos.deletedAt),
        sql`(${pjDocumentos.employeeId}, ${pjDocumentos.companyId}) IN (${sql.raw(tupleList)})`,
      ),
    );

  // Index: key → Set<tipo>
  const docsIndex = new Map<string, Set<string>>();
  for (const d of allDocs) {
    const k = pairsKey(d.employeeId, d.companyId);
    if (!docsIndex.has(k)) docsIndex.set(k, new Set());
    docsIndex.get(k)!.add(d.tipo ?? "");
  }

  // ── Dedup: today's existing notifications ───────────────────────────────
  const existentes = await db
    .select({ titulo: almoxarifadoNotificacoes.titulo, companyId: almoxarifadoNotificacoes.companyId })
    .from(almoxarifadoNotificacoes)
    .where(
      and(
        sql`${almoxarifadoNotificacoes.tipo} IN ('pj_contrato_vencendo', 'pj_saldo_90', 'pj_docs_pendentes')`,
        sql`DATE(${almoxarifadoNotificacoes.criadoEm}) = ${hojeStr}`,
      ),
    );
  const chavesExistentes = new Set(existentes.map((e) => buildNotifKey(e.companyId, e.titulo)));

  // ── Build batch rows ────────────────────────────────────────────────────
  const novos: PurchaseAlmoxAlertRow[] = [];

  function enqueue(
    companyId: number,
    tipo: string,
    resourceKey: string | number,
    titulo: string,
    mensagem: string,
  ): void {
    const chave = buildNotifKey(companyId, titulo);
    if (chavesExistentes.has(chave)) return;
    novos.push({
      companyId,
      tipo,
      destinoModulo: "terceiros",
      titulo,
      mensagem,
      dedupKey: buildPurchaseAlertDedupKey(tipo, resourceKey, hojeStr),
    });
    chavesExistentes.add(chave); // prevent duplicates within this batch
  }

  for (const ct of contratosAtivos) {
    const contratLabel = ct.numeroContrato || `#${ct.id}`;
    const prestador = ct.razaoSocialPrestador || "Prestador";

    // 1. Vencimento em 30 dias
    if (ct.dataFim && ct.dataFim <= em30diasStr) {
      const diasRestantes = daysUntil(ct.dataFim);
      enqueue(
        ct.companyId,
        "pj_contrato_vencendo",
        ct.id,
        `Contrato PJ ${contratLabel} vence em ${ct.dataFim}`,
        `O contrato ${ct.numeroContrato} (${prestador}) vence em ${diasRestantes} dia(s).\nData fim: ${ct.dataFim}.\nProvidenciar renovação ou encerramento.`,
      );
    }

    // 2. Saldo ≥ 90 %
    const valorTotal = parseFloat(String(ct.valorTotalContrato || "0"));
    const valorMedido = parseFloat(String(ct.valorMedido || "0"));
    if (valorTotal > 0 && valorMedido >= valorTotal * 0.9) {
      const pctUsado = Math.round((valorMedido / valorTotal) * 100);
      const saldoRestante = (valorTotal - valorMedido).toFixed(2);
      enqueue(
        ct.companyId,
        "pj_saldo_90",
        ct.id,
        `Saldo do contrato ${contratLabel} em ${pctUsado}%`,
        `O contrato ${ct.numeroContrato} (${prestador}) atingiu ${pctUsado}% do valor total.\nValor total: R$ ${valorTotal.toFixed(2)}\nValor medido: R$ ${valorMedido.toFixed(2)}\nSaldo restante: R$ ${saldoRestante}\nConsiderar aditivo ou novo contrato.`,
      );
    }

    // 3. Documentos obrigatórios ausentes (uses preloaded index)
    const tiposPresentes = docsIndex.get(pairsKey(ct.employeeId, ct.companyId)) ?? new Set<string>();
    const docsFaltando = DOCS_OBRIGATORIOS_PJ.filter((t) => !tiposPresentes.has(t));

    if (docsFaltando.length > 0) {
      enqueue(
        ct.companyId,
        "pj_docs_pendentes",
        ct.id,
        `Documentos pendentes — ${contratLabel} (${prestador})`,
        `O prestador ${prestador} vinculado ao contrato ${ct.numeroContrato} possui documentos obrigatórios pendentes:\n${docsFaltando.map((d) => `• ${d}`).join("\n")}\n\nFavor regularizar antes do próximo pagamento.`,
      );
    }
  }

  if (novos.length > 0) {
    const inseridos = await persistPurchaseAlmoxAlerts(novos);
    console.log(`[PurchaseJobs] ${inseridos.length} alerta(s) de contratos PJ criado(s).`);
  }
}
