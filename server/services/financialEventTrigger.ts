// ============================================================
// GATILHO FINANCEIRO EM TEMPO REAL
// Chamado nos pontos de ação de cada módulo (fire-and-forget).
// NÃO bloqueia a resposta HTTP — roda em background via setImmediate.
// Idempotente: ON CONFLICT DO NOTHING na bridge.
// ============================================================

function getMes(dateStr?: string): string {
  if (dateStr) return dateStr.slice(0, 7);
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Rev. 3183 — Toggle por empresa: a importação automática de dados financeiros
 * (gatilhos em tempo real + job agendado) só roda quando a empresa LIGA explicitamente
 * em Configurações → Financeiro. DEFAULT OFF (coluna `auto_import_enabled` = 0, ausente
 * ou erro → tratado como desligado). Lê `financial_tax_config.auto_import_enabled`.
 */
export async function isAutoImportFinanceiroEnabled(companyId: number): Promise<boolean> {
  if (!companyId) return false;
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return false;
    const res: any = await db.execute(sql`
      SELECT COALESCE(auto_import_enabled, 0) AS v
      FROM financial_tax_config WHERE company_id = ${companyId} LIMIT 1
    `);
    const r = res?.rows ?? (Array.isArray(res) ? res : []);
    return Number(r[0]?.v ?? 0) === 1;
  } catch {
    return false;
  }
}

async function syncNow(companyId: number, mes: string): Promise<void> {
  const { runAllDespesasImport, runAllReceitasImport } = await import("./financialIntegrationBridge");
  await Promise.all([
    runAllDespesasImport(companyId, mes).catch(() => {}),
    runAllReceitasImport(companyId, mes).catch(() => {}),
  ]);
}

/**
 * Rev. 1988 — Versão STRICT de syncNow (sem swallow de erro).
 * Diferente de `syncNow`: NÃO usa `.catch(() => {})` nos imports.
 * Se qualquer um dos imports falhar, a exceção é propagada pra cima.
 * Usar SOMENTE no caminho `triggerFinancialSyncAwaited` — fire-and-forget
 * mantém o comportamento silencioso original (compatibilidade com 8 callers).
 */
async function syncNowStrict(companyId: number, mes: string): Promise<void> {
  const { runAllDespesasImport, runAllReceitasImport } = await import("./financialIntegrationBridge");
  await Promise.all([
    runAllDespesasImport(companyId, mes),
    runAllReceitasImport(companyId, mes),
  ]);
}

// Dispara sincronização para o mês corrente (ou mês do evento).
// Fire-and-forget: não lança exceção, não bloqueia o caller.
export function triggerFinancialSync(companyId: number, eventDateStr?: string): void {
  if (!companyId) return;
  const mes = getMes(eventDateStr);
  setImmediate(async () => {
    try {
      // Rev. 3183 — só roda se a empresa LIGOU a importação automática em Configurações.
      if (!(await isAutoImportFinanceiroEnabled(companyId))) return;
      await syncNow(companyId, mes);
    } catch {
      // silencioso — não impacta o módulo de origem
    }
  });
}

/**
 * Rev. 1987 — Versão SÍNCRONA do gatilho financeiro.
 * Diferente de `triggerFinancialSync` (fire-and-forget): essa AWAITA o sync
 * e propaga falhas pro caller, permitindo log/observabilidade.
 * Usar SOMENTE em ações críticas (ex: aprovarMedicao) onde silenciar erro
 * de sync = bug invisível em produção. Custo: aumenta latência da resposta
 * HTTP em ~100-2000ms dependendo do volume de despesas/receitas do mês.
 */
export async function triggerFinancialSyncAwaited(companyId: number, eventDateStr?: string): Promise<void> {
  if (!companyId) return;
  // Rev. 3183 — respeita o toggle por empresa (default OFF). Desligado → não sincroniza.
  if (!(await isAutoImportFinanceiroEnabled(companyId))) return;
  const mes = getMes(eventDateStr);
  // Rev. 1988 — usa syncNowStrict (sem swallow) pra que falhas reais propaguem
  // pro try/catch do caller (ex: aprovarMedicao). Antes era syncNow que mascarava tudo.
  await syncNowStrict(companyId, mes);
}

// Retroação completa N meses: chamada no startup para mapear dados históricos.
export async function retroacaoStartup(companyId: number, meses = 6): Promise<number> {
  const { runAllAutoImports } = await import("./financialAutoImport");
  const { runAllDespesasImport, runAllReceitasImport } = await import("./financialIntegrationBridge");
  let total = 0;
  const hoje = new Date();
  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    try {
      const [r1, r2, r3] = await Promise.all([
        runAllAutoImports(companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 })),
        runAllDespesasImport(companyId, mes).catch(() => 0),
        runAllReceitasImport(companyId, mes).catch(() => 0),
      ]);
      total += r1.folha + r1.pj + r1.parceiros + (r2 as number) + (r3 as number);
    } catch {}
  }
  return total;
}
