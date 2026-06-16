import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { runAllAutoImports } from "./financialAutoImport";
import { seedPlanoDeConta, ensureTaxConfig } from "./financialSeedAccounts";
import {
  runAllDespesasImport,
  runAllReceitasImport,
  gerarAlertasVencimento,
} from "./financialIntegrationBridge";
import { retroacaoStartup, isAutoImportFinanceiroEnabled } from "./financialEventTrigger";

// ============================================================
// JOB DE AUTO-IMPORTAÇÃO FINANCEIRA — roda a cada hora
// Integra: CLT, PJ, Parceiros, Terceiros, Frotas, Benefícios,
//          Seguro, Adiantamentos, Pro-labore, Planejamento,
//          Almoxarifado, Processos, Guias Tributárias,
//          Medições de Obra, Medições PJ, Alertas
// ============================================================

let jobInterval: ReturnType<typeof setInterval> | null = null;
let alertInterval: ReturnType<typeof setInterval> | null = null;
let jobRunning = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getAllActiveCompanyIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    // Filtra apenas empresas ativas e NÃO deletadas
    const res = await db.execute(sql`SELECT id FROM companies WHERE "isActive" = 1 AND "deletedAt" IS NULL LIMIT 100`);
    const rows = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
    const ids = rows.map((r: any) => Number(r.id)).filter((n: number) => n > 0 && Number.isFinite(n));
    if (ids.length > 0) return ids;
    const res2 = await db.execute(sql`SELECT id FROM companies WHERE "deletedAt" IS NULL LIMIT 20`);
    const rows2 = (res2 as any)?.rows ?? (Array.isArray(res2) ? res2 : []);
    return rows2.map((r: any) => Number(r.id)).filter((n: number) => n > 0 && Number.isFinite(n));
  } catch {
    return [];
  }
}

// Retorna apenas empresas que possuem funcionários cadastrados — evita processar centenas
// de empresas vazias e economiza milhares de queries desnecessárias por ciclo.
async function getCompanyIdsWithEmployees(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const res = await db.execute(sql`
      SELECT DISTINCT e.company_id
      FROM employees e
      WHERE e.deleted_at IS NULL
        AND e.company_id IS NOT NULL
      ORDER BY e.company_id
    `);
    const rows = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
    return rows.map((r: any) => Number(r.company_id)).filter((n: number) => n > 0 && Number.isFinite(n));
  } catch {
    return getAllActiveCompanyIds();
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
      // Rev. 3183 — só importa automaticamente se a empresa LIGOU o toggle em Configurações
      // → Financeiro (default OFF). Garante a config (cria a linha) antes de checar.
      await ensureTaxConfig(companyId).catch(() => {});
      if (!(await isAutoImportFinanceiroEnabled(companyId))) continue;

      // Seed plano de contas e configuração tributária
      await seedPlanoDeConta(companyId).catch(() => {});

      // FASE 2 — Importar dados CLT, PJ, Parceiros (auto-import original)
      const { folha, pj, parceiros } = await runAllAutoImports(companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 }));

      // FASE 2 — Novas fontes de despesa (15 fontes completas)
      const despesas = await runAllDespesasImport(companyId, mes).catch(() => 0);

      // FASE 3 — Fontes de receita
      const receitas = await runAllReceitasImport(companyId, mes).catch(() => 0);

      // Rev. 1630 — Projeção de Folha/Encargos/Benefícios/13º/PJ — 12 meses (idempotente)
      const { importFolhaProjecao } = await import("./payrollProjectionBridge");
      const projecao = await importFolhaProjecao(companyId).catch((e: any) => {
        console.error(`[FinancialJob] payrollProjection company=${companyId} erro:`, e?.message);
        return 0;
      });

      const total = folha + pj + parceiros + despesas + receitas + projecao;
      console.log(`[FinancialJob] company=${companyId} mes=${mes} | folha=${folha} pj=${pj} parceiros=${parceiros} despesas=${despesas} receitas=${receitas} projecao12m=${projecao} TOTAL=${total}`);
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
  const { isRecentCache, setCache } = await import("./startupCache");
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (await isRecentCache("financial_retroacao_ts", SIX_HOURS)) {
    console.log("[FinancialJob] Retroação de startup: pulada (executada há menos de 6h).");
    return;
  }
  try {
    const companyIds = await getAllActiveCompanyIds();
    if (!companyIds.length) return;
    console.log(`[FinancialJob] Retroação de startup: importando últimos 6 meses para ${companyIds.length} empresa(s)...`);
    for (const companyId of companyIds) {
      // Rev. 3183 — respeita o toggle por empresa (default OFF).
      await ensureTaxConfig(companyId).catch(() => {});
      if (!(await isAutoImportFinanceiroEnabled(companyId))) continue;
      await seedPlanoDeConta(companyId).catch(() => {});
      const total = await retroacaoStartup(companyId, 6).catch(() => 0);
      if (total > 0) console.log(`[FinancialJob] Startup: company=${companyId} → ${total} lançamentos históricos importados`);
    }
    console.log("[FinancialJob] Retroação de startup concluída.");
    await setCache("financial_retroacao_ts", new Date().toISOString());
  } catch (e: any) {
    console.error("[FinancialJob] Erro na retroação de startup:", e?.message);
  }
}

// Sincroniza financial_revenue (recebidos) → planejamento_medicoes
// Garante que baixas históricas do Financeiro apareçam no módulo de Planejamento.
async function syncFinancialToPlanejamento(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    // Match 1: por obra_id direto
    const r1 = await db.execute(sql`
      INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
      SELECT sub.projeto_id, sub.competencia, 0, sub.valor_medido, 'confirmado', NOW()
      FROM (
        SELECT pp.id AS projeto_id,
               TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM') AS competencia,
               SUM(fr.valor_recebido::numeric) AS valor_medido
        FROM financial_revenue fr
        JOIN planejamento_projetos pp ON pp.obra_id = fr.obra_id
        WHERE fr.status IN ('recebido_total','recebido_parcial')
          AND COALESCE(fr.valor_recebido::numeric, 0) > 0
          AND fr.obra_id IS NOT NULL AND pp.obra_id IS NOT NULL
          AND COALESCE(fr.data_recebimento, fr.data_vencimento) IS NOT NULL
        GROUP BY pp.id, TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM')
      ) sub
      WHERE NOT EXISTS (
        SELECT 1 FROM planejamento_medicoes pm
        WHERE pm.projeto_id = sub.projeto_id AND pm.competencia = sub.competencia
          AND COALESCE(pm.valor_medido::numeric, 0) > 0 AND pm.status = 'confirmado'
      )
    `);
    const n1 = (r1 as any)?.rowCount ?? 0;
    // Match 2: por nome da obra (fallback quando obra_id não coincide entre API e local)
    const r2 = await db.execute(sql`
      INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
      SELECT sub.projeto_id, sub.competencia, 0, sub.valor_medido, 'confirmado', NOW()
      FROM (
        SELECT pp.id AS projeto_id,
               TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM') AS competencia,
               SUM(fr.valor_recebido::numeric) AS valor_medido
        FROM financial_revenue fr
        JOIN planejamento_projetos pp ON (
          LOWER(TRIM(COALESCE(
            (SELECT o.nome FROM obras o WHERE o.id = pp.obra_id LIMIT 1),
            pp.nome, ''
          ))) = LOWER(TRIM(fr.obra_nome))
          AND (pp.obra_id IS NULL OR pp.obra_id != fr.obra_id)
        )
        WHERE fr.status IN ('recebido_total','recebido_parcial')
          AND COALESCE(fr.valor_recebido::numeric, 0) > 0
          AND fr.obra_nome IS NOT NULL AND fr.obra_nome != ''
          AND COALESCE(fr.data_recebimento, fr.data_vencimento) IS NOT NULL
        GROUP BY pp.id, TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM')
      ) sub
      WHERE NOT EXISTS (
        SELECT 1 FROM planejamento_medicoes pm
        WHERE pm.projeto_id = sub.projeto_id AND pm.competencia = sub.competencia
          AND COALESCE(pm.valor_medido::numeric, 0) > 0 AND pm.status = 'confirmado'
      )
    `);
    const n2 = (r2 as any)?.rowCount ?? 0;
    if (n1 + n2 > 0)
      console.log(`[FinancialSync] Sincronizadas ${n1 + n2} competências Financeiro→Planejamento (${n1} obra_id, ${n2} por nome)`);
  } catch (e: any) {
    console.warn("[FinancialSync] Sync Financeiro→Planejamento falhou (não-fatal):", e?.message);
  }
}

export function startFinancialAutoImportJob(): void {
  // Startup: retroação após 90 segundos (dá tempo para o servidor estabilizar e atender usuários)
  setTimeout(async () => {
    if (jobRunning) return;
    jobRunning = true;
    try {
      await runStartupRetroacao().catch(console.error);
      await runJob().catch(console.error);
      await syncFinancialToPlanejamento().catch(console.error);
    } finally {
      jobRunning = false;
    }
    // Job periódico: a cada 30 minutos (gatilhos em tempo real cobrem mudanças imediatas)
    jobInterval = setInterval(async () => {
      if (jobRunning) { console.log("[FinancialJob] Já em execução, pulando ciclo."); return; }
      jobRunning = true;
      try {
        await runJob().catch(console.error);
        await syncFinancialToPlanejamento().catch(console.error);
      } finally {
        jobRunning = false;
      }
    }, 30 * 60 * 1000);
  }, 90_000); // 90 segundos após o servidor subir

  // Alertas de vencimento: roda a cada 60 minutos, com delay inicial de 3 minutos
  setTimeout(async () => {
    await runAlertasJob().catch(console.error);
    alertInterval = setInterval(() => runAlertasJob().catch(console.error), 60 * 60 * 1000);
  }, 3 * 60 * 1000);

  console.log("[FinancialJob] Integração ativa · Startup em 90s · Job de segurança: 30 min · Alertas: 60 min.");
}

export function stopFinancialAutoImportJob(): void {
  if (jobInterval) { clearInterval(jobInterval); jobInterval = null; }
  if (alertInterval) { clearInterval(alertInterval); alertInterval = null; }
}

export { runJob as runFinancialJobNow };
