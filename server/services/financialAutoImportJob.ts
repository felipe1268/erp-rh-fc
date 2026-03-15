import { getDb } from "../db";
import { runAllAutoImports } from "./financialAutoImport";
import { seedPlanoDeConta, ensureTaxConfig } from "./financialSeedAccounts";

// ============================================================
// JOB DE AUTO-IMPORTAÇÃO FINANCEIRA — roda a cada hora
// ============================================================

let jobInterval: ReturnType<typeof setInterval> | null = null;

async function getAllActiveCompanyIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const res = await db.execute(`SELECT id FROM companies WHERE ativo = 1 OR status = 'ativo' LIMIT 500`);
  const rows = (res as any)?.rows ?? (res as any) ?? [];
  return rows.map((r: any) => Number(r.id)).filter(Boolean);
}

function getCurrentMes(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function runJob(): Promise<void> {
  const mes = getCurrentMes();
  console.log(`[FinancialJob] Iniciando importação para ${mes}...`);

  let companyIds: number[];
  try {
    companyIds = await getAllActiveCompanyIds();
  } catch {
    companyIds = [];
  }

  // fallback: se não retornar nada, não processa
  if (!companyIds.length) {
    console.log("[FinancialJob] Nenhuma empresa ativa encontrada.");
    return;
  }

  for (const companyId of companyIds) {
    try {
      // seed plano de contas se necessário
      await seedPlanoDeConta(companyId);
      await ensureTaxConfig(companyId);
      // importar dados
      await runAllAutoImports(companyId, mes);
    } catch (e: any) {
      console.error(`[FinancialJob] Erro para company ${companyId}: ${e?.message}`);
    }
  }

  console.log(`[FinancialJob] Job concluído para ${companyIds.length} empresa(s).`);
}

export function startFinancialAutoImportJob(): void {
  // Aguarda 15s para o servidor subir, depois roda a cada 60 min
  setTimeout(async () => {
    await runJob().catch(console.error);
    jobInterval = setInterval(() => runJob().catch(console.error), 60 * 60 * 1000);
  }, 15_000);

  console.log("[FinancialJob] Auto-import job agendado (intervalo: 60 min).");
}

export function stopFinancialAutoImportJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
}

export { runJob as runFinancialJobNow };
