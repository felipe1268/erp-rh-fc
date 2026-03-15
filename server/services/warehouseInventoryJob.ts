import { getDb } from "../db";
import { warehouseInventorySessions, almoxarifadoItens } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

function getSemanaRef() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function startInventoryJob() {
  setInterval(async () => {
    try {
      await checkAndCreateInventorySessions();
    } catch (e) {
      console.error("[InventoryJob] Erro:", e);
    }
  }, 60 * 60 * 1000);

  console.log("[InventoryJob] Job de inventário semanal iniciado");
}

async function checkAndCreateInventorySessions() {
  const db = await getDb();
  if (!db) return;

  const semanaRef = getSemanaRef();
  const now = new Date();
  const diaSemana = now.getDay();

  // Só criar sessões às segundas (dia 1)
  if (diaSemana !== 1) return;

  // Verificar se já existe sessão para esta semana (busca geral - sem companyId)
  const existing = await db
    .select()
    .from(warehouseInventorySessions)
    .where(eq(warehouseInventorySessions.semanaRef, semanaRef))
    .limit(1);

  if (existing.length > 0) return;

  console.log(`[InventoryJob] Semana ${semanaRef}: aguardando almoxarife iniciar sessão manualmente.`);
}
