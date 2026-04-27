import { getDb } from "../db";
import { runAllAutoImports } from "./financialAutoImport";
import { seedPlanoDeConta, ensureTaxConfig } from "./financialSeedAccounts";
import {
  runAllDespesasImport,
  runAllReceitasImport,
  gerarAlertasVencimento,
} from "./financialIntegrationBridge";

// ============================================================
// JOB DE AUTO-IMPORTAÇÃO FINANCEIRA — roda a cada hora
// Integra: CLT, PJ, Parceiros, Terceiros, Frotas, Benefícios,
//          Seguro, Adiantamentos, Pro-labore, Planejamento,
//          Almoxarifado, Processos, Guias Tributárias,
//          Medições de Obra, Medições PJ, Alertas
// ============================================================

let jobInterval: ReturnType<typeof setInterval> | null = null;
let alertInterval: ReturnType<typeof setInterval> | null = null;

async function getAllActiveCompanyIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const res = await db.execute(
      `SELECT id FROM companies WHERE ativo = 1 OR status = 'ativo' OR status = 'active' LIMIT 500`
    );
    const rows = (res as any)?.rows ?? (res as any) ?? [];
    const ids = rows.map((r: any) => Number(r.id)).filter(Boolean);
    if (ids.length > 0) return ids;

    // Fallback: pegar qualquer empresa
    const res2 = await db.execute(`SELECT id FROM companies LIMIT 50`);
    const rows2 = (res2 as any)?.rows ?? (res2 as any) ?? [];
    return rows2.map((r: any) => Number(r.id)).filter(Boolean);
  } catch {
    return [];
  }
}

function getCurrentMes(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function runJob(): Promise<void> {
  const mes = getCurrentMes();
  console.log(`[FinancialJob] Iniciando importação completa para ${mes}...`);

  let companyIds: number[];
  try {
    companyIds = await getAllActiveCompanyIds();
  } catch {
    companyIds = [];
  }

  if (!companyIds.length) {
    console.log("[FinancialJob] Nenhuma empresa encontrada.");
    return;
  }

  for (const companyId of companyIds) {
    try {
      // Seed plano de contas e configuração tributária
      await seedPlanoDeConta(companyId).catch(() => {});
      await ensureTaxConfig(companyId).catch(() => {});

      // FASE 2 — Importar dados CLT, PJ, Parceiros (auto-import original)
      const { folha, pj, parceiros } = await runAllAutoImports(companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 }));

      // FASE 2 — Novas fontes de despesa (15 fontes completas)
      const despesas = await runAllDespesasImport(companyId, mes).catch(() => 0);

      // FASE 3 — Fontes de receita
      const receitas = await runAllReceitasImport(companyId, mes).catch(() => 0);

      const total = folha + pj + parceiros + despesas + receitas;
      console.log(`[FinancialJob] company=${companyId} mes=${mes} | folha=${folha} pj=${pj} parceiros=${parceiros} despesas=${despesas} receitas=${receitas} TOTAL=${total}`);
    } catch (e: any) {
      console.error(`[FinancialJob] Erro para company ${companyId}: ${e?.message}`);
    }
  }

  console.log(`[FinancialJob] Job concluído para ${companyIds.length} empresa(s) em ${mes}.`);
}

async function runAlertasJob(): Promise<void> {
  try {
    const companyIds = await getAllActiveCompanyIds();
    for (const companyId of companyIds) {
      const alertas = await gerarAlertasVencimento(companyId).catch(() => 0);
      if (alertas > 0) {
        console.log(`[FinancialAlerts] company=${companyId} → ${alertas} alertas gerados`);
      }
    }
  } catch (e: any) {
    console.error(`[FinancialAlerts] Erro: ${e?.message}`);
  }
}

export function startFinancialAutoImportJob(): void {
  // Importação completa: aguarda 20s após o servidor subir, depois roda a cada 60 min
  setTimeout(async () => {
    await runJob().catch(console.error);
    jobInterval = setInterval(() => runJob().catch(console.error), 60 * 60 * 1000);
  }, 20_000);

  // Alertas de vencimento: roda a cada 6 horas
  setTimeout(async () => {
    await runAlertasJob().catch(console.error);
    alertInterval = setInterval(() => runAlertasJob().catch(console.error), 6 * 60 * 60 * 1000);
  }, 30_000);

  console.log("[FinancialJob] Auto-import job agendado (importação: 60 min | alertas: 6 horas).");
}

export function stopFinancialAutoImportJob(): void {
  if (jobInterval) { clearInterval(jobInterval); jobInterval = null; }
  if (alertInterval) { clearInterval(alertInterval); alertInterval = null; }
}

export { runJob as runFinancialJobNow };
