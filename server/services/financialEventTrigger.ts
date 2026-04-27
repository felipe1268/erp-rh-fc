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

async function syncNow(companyId: number, mes: string): Promise<void> {
  const { runAllDespesasImport, runAllReceitasImport } = await import("./financialIntegrationBridge");
  await Promise.all([
    runAllDespesasImport(companyId, mes).catch(() => {}),
    runAllReceitasImport(companyId, mes).catch(() => {}),
  ]);
}

// Dispara sincronização para o mês corrente (ou mês do evento).
// Fire-and-forget: não lança exceção, não bloqueia o caller.
export function triggerFinancialSync(companyId: number, eventDateStr?: string): void {
  if (!companyId) return;
  const mes = getMes(eventDateStr);
  setImmediate(async () => {
    try {
      await syncNow(companyId, mes);
    } catch {
      // silencioso — não impacta o módulo de origem
    }
  });
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
