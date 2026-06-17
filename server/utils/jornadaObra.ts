// ============================================================
// Jornada da OBRA prevalece sobre a do FUNCIONÁRIO
// ------------------------------------------------------------
// Regra de negócio (piloto FC): quando uma OBRA possui jornada de
// trabalho cadastrada (>= 1 dia com entrada+saída), essa jornada
// SUBSTITUI POR INTEIRO a jornada do funcionário para TODOS os dias
// em que ele está alocado/trabalhando naquela obra. Um dia vazio na
// jornada da obra = folga (nada esperado). Se a obra NÃO tem jornada
// cadastrada, vale a jornada do funcionário (comportamento legado).
//
// Este módulo é compartilhado pelo motor de import (processRecords /
// dixiPonto), pelo recálculo (recalcularPeriodo) e pelos relatórios
// read-time (getFaltasSummary / getAtrasoDetalhe) para garantir UMA
// fonte única da "jornada efetiva".
// ============================================================

export type JornadaDia = { entrada?: string | null; saida?: string | null; intervalo?: string | null };
export type JornadaParsed = Record<string, JornadaDia>;

/** Parseia jornada (string JSON ou objeto) → objeto, ou null se inválida/vazia. */
export function parseJornadaObj(j: string | null | undefined | Record<string, any>): JornadaParsed | null {
  if (!j) return null;
  try {
    const p = typeof j === "string" ? JSON.parse(j) : j;
    if (p && typeof p === "object" && !Array.isArray(p)) return p as JornadaParsed;
  } catch { /* ignore */ }
  return null;
}

/** true se a jornada (string/obj) tem ao menos 1 dia com entrada+saida definidos. */
export function obraTemJornada(j: string | null | undefined | Record<string, any>): boolean {
  const p = parseJornadaObj(j);
  if (!p) return false;
  return Object.values(p).some((d) => d && d.entrada && d.saida);
}

/**
 * Retorna a STRING JSON da jornada EFETIVA a usar no cálculo do dia.
 * A jornada da OBRA prevalece sempre que cadastrada; senão, a do funcionário.
 */
export function jornadaEfetiva(
  empJornada: string | null | undefined | Record<string, any>,
  obraJornada: string | null | undefined | Record<string, any>,
): string | null {
  if (obraTemJornada(obraJornada)) {
    return typeof obraJornada === "string" ? obraJornada : JSON.stringify(obraJornada);
  }
  if (empJornada == null) return null;
  return typeof empJornada === "string" ? empJornada : JSON.stringify(empJornada);
}

export type AlocacaoObra = { obraId: number | null; dataInicio: string | null; dataFim: string | null };

/**
 * Resolve a obra (obraId) em que o funcionário estava alocado na data `ds`
 * (YYYY-MM-DD), a partir do histórico de lotação (employee_site_history).
 * Considera dataInicio<=ds<=(dataFim||∞) e escolhe a alocação mais recente
 * (maior dataInicio). Retorna null se nenhuma cobre o dia.
 */
export function obraNaDataFromAlocacoes(alocacoes: AlocacaoObra[], ds: string): number | null {
  let best: AlocacaoObra | null = null;
  for (const a of alocacoes) {
    if (!a.dataInicio) continue;
    const ini = a.dataInicio;
    const fim = a.dataFim || "9999-12-31";
    if (ds >= ini && ds <= fim) {
      if (!best || (a.dataInicio || "") > (best.dataInicio || "")) best = a;
    }
  }
  return best?.obraId ?? null;
}
