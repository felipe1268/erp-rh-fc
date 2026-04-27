import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { runAllAutoImports } from "./financialAutoImport";
import { seedPlanoDeConta, ensureTaxConfig } from "./financialSeedAccounts";
import {
  runAllDespesasImport,
  runAllReceitasImport,
  gerarAlertasVencimento,
} from "./financialIntegrationBridge";
import { retroacaoStartup } from "./financialEventTrigger";

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
    // Usar sql template — db.execute(string) ignora parâmetros e retorna resultado incorreto
    const res = await db.execute(sql`SELECT id FROM companies WHERE "isActive" = 1 LIMIT 500`);
    const rows = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
    const ids = rows.map((r: any) => Number(r.id)).filter((n: number) => n > 0 && Number.isFinite(n));
    if (ids.length > 0) return ids;

    // Fallback: qualquer empresa cadastrada
    const res2 = await db.execute(sql`SELECT id FROM companies LIMIT 50`);
    const rows2 = (res2 as any)?.rows ?? (Array.isArray(res2) ? res2 : []);
    return rows2.map((r: any) => Number(r.id)).filter((n: number) => n > 0 && Number.isFinite(n));
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

async function runStartupRetroacao(): Promise<void> {
  try {
    const companyIds = await getAllActiveCompanyIds();
    if (!companyIds.length) return;
    console.log(`[FinancialJob] Retroação de startup: importando últimos 6 meses para ${companyIds.length} empresa(s)...`);
    for (const companyId of companyIds) {
      await seedPlanoDeConta(companyId).catch(() => {});
      await ensureTaxConfig(companyId).catch(() => {});
      const total = await retroacaoStartup(companyId, 6).catch(() => 0);
      if (total > 0) console.log(`[FinancialJob] Startup: company=${companyId} → ${total} lançamentos históricos importados`);
    }
    console.log("[FinancialJob] Retroação de startup concluída.");
  } catch (e: any) {
    console.error("[FinancialJob] Erro na retroação de startup:", e?.message);
  }
}

export function startFinancialAutoImportJob(): void {
  // Startup: retroação imediata (dados históricos) + job normal
  setTimeout(async () => {
    await runStartupRetroacao().catch(console.error);
    await runJob().catch(console.error);
    // Job periódico: a cada 5 minutos como segurança (gatilhos em tempo real já cobrem a maioria)
    jobInterval = setInterval(() => runJob().catch(console.error), 5 * 60 * 1000);
  }, 5_000); // 5 segundos após o servidor subir

  // Alertas de vencimento: roda a cada 30 minutos
  setTimeout(async () => {
    await runAlertasJob().catch(console.error);
    alertInterval = setInterval(() => runAlertasJob().catch(console.error), 30 * 60 * 1000);
  }, 15_000);

  console.log("[FinancialJob] Integração em tempo real ativa · Retroação no startup · Job de segurança: 5 min · Alertas: 30 min.");
}

export function stopFinancialAutoImportJob(): void {
  if (jobInterval) { clearInterval(jobInterval); jobInterval = null; }
  if (alertInterval) { clearInterval(alertInterval); alertInterval = null; }
}

export { runJob as runFinancialJobNow };
