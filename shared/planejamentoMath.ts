/**
 * Rev. 1670 Fase 3 — Helpers únicos pvAt / evAt para cálculo de PV/EV
 * em qualquer ponto do tempo. Fonte única da verdade para top card,
 * Avanço Semanal, Programação Semanal, Curva S e Portal do Cliente.
 *
 * Regras de ouro embutidas:
 * 1) Quando refDate === statusDate gravado no XML do MSP E a atividade tem
 *    snapshot Texto10 (`previstoMspPct`), PV usa o snapshot direto.
 *    Mesma regra para EV via Texto7 (`realizadoMspPct`) — paridade 100%
 *    com o que o MS Project mostraria se você reabrisse o arquivo.
 * 2) Para qualquer outra data (passada, futura, ou cutoff diferente do
 *    StatusDate gravado), cai no cálculo dinâmico (du(envelope ∩ até ref)
 *    quando há calendário MSP, senão dias corridos).
 * 3) Atividades disabled/grupo/marco NÃO entram na soma — somente folhas.
 * 4) Pesos: prefere `pesoFinanceiro` quando ≥20% das folhas têm peso > 0;
 *    senão peso igual (1/N) — mesma regra das curvas existentes.
 *
 * Assinatura intencionalmente serializável (POJOs) para funcionar tanto
 * no servidor (tRPC) quanto no client (helpers do PlanejamentoDetalhe).
 */

export interface AtividadeMath {
  id: number;
  isGrupo?: boolean | null;
  isMarco?: boolean | null;
  isIndireta?: boolean | null;
  disabled?: boolean | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  duracaoDias?: number | null;
  pesoFinanceiro?: number | string | null;
  /** Snapshot Texto10 (FieldID 188743750 — %PREVISTO) gravado no import. */
  previstoMspPct?: number | string | null;
  /** Snapshot Texto7 (FieldID 188743747 — %Reali AUX) gravado no import. */
  realizadoMspPct?: number | string | null;
}

export interface AvancoMath {
  atividadeId: number;
  semana: string;
  percentualAcumulado: number | string | null;
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

/** Filtra folhas que CONTAM em PV/EV (regra de ouro #3). */
export function folhasContaveis<T extends AtividadeMath>(ativs: T[]): T[] {
  return ativs.filter(a =>
    !a.isGrupo && !a.isMarco && !a.isIndireta && !a.disabled
    && !!a.dataInicio && !!a.dataFim,
  );
}

export interface PesoCalc {
  pesoTotal: number;
  pesoDe: (a: AtividadeMath) => number;
  usarIgual: boolean;
}

/** Estratégia de pesagem unificada (regra de ouro #4). */
export function calcularPesos(folhas: AtividadeMath[], modo: "financeiro" | "duracao" = "financeiro"): PesoCalc {
  const pesoBruto = modo === "duracao"
    ? folhas.reduce((s, a) => s + (a.duracaoDias ?? 0), 0)
    : folhas.reduce((s, a) => s + num(a.pesoFinanceiro), 0);
  const ativComPeso = modo === "duracao"
    ? folhas.filter(a => (a.duracaoDias ?? 0) > 0).length
    : folhas.filter(a => num(a.pesoFinanceiro) > 0).length;
  const usarIgual = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
  const pesoTotal = usarIgual ? (folhas.length || 1) : pesoBruto;
  const pesoDe = (a: AtividadeMath): number =>
    usarIgual ? 1 : (modo === "duracao" ? (a.duracaoDias ?? 0) : num(a.pesoFinanceiro));
  return { pesoTotal, pesoDe, usarIgual };
}

/**
 * Fração decorrida em dias corridos (fallback quando não há calendário MSP).
 * Sempre clipa em [0,1]. Compatível com a fórmula histórica do ERP.
 */
export function fracaoDecorridaCorrida(iniIso: string, refIso: string, fimIso: string): number {
  const ini = new Date(iniIso + "T12:00:00Z").getTime();
  const ref = new Date(refIso + "T12:00:00Z").getTime();
  const fim = new Date(fimIso + "T12:00:00Z").getTime();
  if (!Number.isFinite(ini) || !Number.isFinite(ref) || !Number.isFinite(fim)) return 0;
  if (ref <= ini) return 0;
  if (ref >= fim) return 1;
  const total = fim - ini;
  if (total <= 0) return 1;
  return (ref - ini) / total;
}

/**
 * Calcula PV(refDate) % do projeto inteiro (0-100).
 *
 * Quando `refDate === statusDate`, soma snapshots Texto10 ponderados.
 * Caso contrário, ou para folhas sem snapshot, interpola por dias corridos
 * (use uma versão estendida com calendário MSP no client se necessário).
 *
 * @returns número 0-100 com 2 casas decimais.
 */
export function pvAt(
  ativs: AtividadeMath[],
  refDate: string,
  statusDate: string | null | undefined,
  opts: { modoPesoFinanceiro?: boolean } = {},
): number {
  const folhas = folhasContaveis(ativs);
  if (folhas.length === 0) return 0;
  const usarSnapshot = !!statusDate && refDate === statusDate;
  const { pesoTotal, pesoDe } = calcularPesos(folhas, opts.modoPesoFinanceiro === false ? "duracao" : "financeiro");
  let soma = 0;
  for (const a of folhas) {
    let pct: number;
    if (usarSnapshot && a.previstoMspPct != null) {
      // Snapshot Texto10 do MSP — paridade exata com o Project.
      pct = Math.min(100, Math.max(0, num(a.previstoMspPct)));
    } else {
      pct = fracaoDecorridaCorrida(a.dataInicio!, refDate, a.dataFim!) * 100;
    }
    soma += pct * (pesoDe(a) / pesoTotal);
  }
  return +Math.min(100, Math.max(0, soma)).toFixed(2);
}

/**
 * Calcula EV(refDate) % do projeto inteiro (0-100).
 *
 * Prioridade por atividade:
 *   1) avanço gravado em planejamento_avancos com semana ≤ refDate (último);
 *   2) snapshot Texto7 quando refDate === statusDate;
 *   3) zero.
 */
export function evAt(
  ativs: AtividadeMath[],
  avancos: AvancoMath[],
  refDate: string,
  statusDate: string | null | undefined,
  opts: { modoPesoFinanceiro?: boolean } = {},
): number {
  const folhas = folhasContaveis(ativs);
  if (folhas.length === 0) return 0;
  const { pesoTotal, pesoDe } = calcularPesos(folhas, opts.modoPesoFinanceiro === false ? "duracao" : "financeiro");
  // Último avanço por atividade até refDate.
  // Normaliza `semana` para "YYYY-MM-DD" — pode vir como Date object (pg) ou ISO com hora.
  const normSem = (s: any): string => {
    if (s == null) return "";
    if (typeof s === "string") return s.slice(0, 10);
    if (s instanceof Date) return s.toISOString().slice(0, 10);
    return String(s).slice(0, 10);
  };
  const refStr = refDate.slice(0, 10);
  const latest: Record<number, number> = {};
  const latestSem: Record<number, string> = {};
  for (const av of avancos) {
    const sem = normSem(av.semana);
    if (!sem || sem > refStr) continue;
    const id = av.atividadeId;
    if (!latestSem[id] || sem > latestSem[id]) {
      latestSem[id] = sem;
      latest[id] = num(av.percentualAcumulado);
    }
  }
  const usarSnapshot = !!statusDate && refDate === statusDate;
  let soma = 0;
  for (const a of folhas) {
    let pct = latest[a.id];
    if (pct == null && usarSnapshot && a.realizadoMspPct != null) {
      pct = num(a.realizadoMspPct);
    }
    if (pct == null) pct = 0;
    soma += pct * (pesoDe(a) / pesoTotal);
  }
  return +Math.min(100, Math.max(0, soma)).toFixed(2);
}

/** SPI = EV/PV (PMBOK 7ª). 0 quando PV=0 (evita div/0). */
export function spi(ev: number, pv: number): number {
  if (pv <= 0) return 0;
  return +(ev / pv).toFixed(4);
}
