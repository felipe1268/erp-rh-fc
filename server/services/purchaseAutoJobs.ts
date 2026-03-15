import { getDb } from "../db";
import { purchaseOrders, purchaseQuotations, supplierContracts } from "../../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";

export function startPurchaseJobs() {
  setTimeout(async () => {
    try {
      await checkOCDeadlines();
      await checkQuotationExpiries();
      await checkContractExpirations();
    } catch (e) { console.error("[PurchaseJobs] Erro inicial:", e); }
  }, 30000);

  setInterval(async () => {
    try {
      await checkOCDeadlines();
      await checkQuotationExpiries();
      await checkContractExpirations();
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
