// ── Data de Corte (Status Date / Cutoff Date) ─────────────────────────────
// Padrão PMBOK 7 / EVM: toda análise de cronograma deve ser referenciada a
// uma "Data de Status" (status date) explícita — nunca a `today()` cru.
// Política FC Engenharia: o ciclo oficial é semanal e fecha no dia da
// semana definido por projeto (default = quinta). A janela cobrável da
// Programação Semanal vai de DIA SEGUINTE AO ÚLTIMO CUTOFF até PRÓXIMO
// CUTOFF (ex.: cutoff=qui → semana = sex→qui), garantindo paridade entre
// previsão (PV) e medição (EV) — sem "atraso fantasma".

const D = (s: string) => new Date(s + "T12:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);

const NOMES_DOW = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const NOMES_DOW_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Hoje em America/Sao_Paulo no formato YYYY-MM-DD. NÃO use
 * `new Date().toISOString().slice(0,10)` para "hoje" — em São Paulo isso
 * vira o dia seguinte após ~21h local (offset −03:00 → UTC já cruzou meia
 * noite). Esse erro faria `ultimoCutoffAte(today)` "pular" o cutoff
 * seguinte na quarta à noite. `en-CA` retorna ISO `YYYY-MM-DD`.
 */
export function todayBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Normaliza uma referência (string ISO, Date ou undefined → today BR) para "YYYY-MM-DD". */
function refToIsoDay(ref: string | Date | undefined): string {
  if (!ref) return todayBR();
  if (typeof ref === "string") return ref.slice(0, 10);
  return ref.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Default do dia de cutoff (semanal): quinta-feira (dow=4). */
export const DIA_CORTE_DEFAULT = 4;

/** Nome legível ("Quinta-feira") do dia da semana 0..6. */
export function nomeDiaSemana(dow: number): string {
  return NOMES_DOW[((dow % 7) + 7) % 7] || "Quinta-feira";
}

/** Nome curto ("Qui") do dia da semana 0..6. */
export function nomeDiaSemanaCurto(dow: number): string {
  return NOMES_DOW_CURTOS[((dow % 7) + 7) % 7] || "Qui";
}

/** Último dia-da-semana `dow` (≤ ref). Se ref já cai em `dow`, retorna ref. */
export function ultimoDiaSemanaAte(ref: string | Date | undefined, dow: number): string {
  const d = D(refToIsoDay(ref));
  const cur = d.getUTCDay();
  const diff = (cur - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return toIso(d);
}

/** Próximo dia-da-semana `dow` (> ref). */
export function proximoDiaSemana(ref: string | Date | undefined, dow: number): string {
  const d = D(refToIsoDay(ref));
  const cur = d.getUTCDay();
  const add = ((dow - cur + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return toIso(d);
}

/** Verdadeiro se `iso` (YYYY-MM-DD) cai no dia da semana `dow`. */
export function ehDiaSemana(iso: string, dow: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return D(iso).getUTCDay() === dow;
}

/**
 * Janela COBRÁVEL da semana em torno de `ref`, alinhada ao cutoff `dow`.
 * Retorna {ini, fim} onde:
 *   - `fim` = próximo cutoff (≥ ref) — último dia da janela INCLUSIVO.
 *   - `ini` = dia seguinte ao cutoff anterior — primeiro dia da janela INCLUSIVO.
 * Ex.: ref=08/05/2026 (sex), dow=4 (qui) → { ini: 02/05 (sex), fim: 07/05 (qui) }.
 * Se ref CAI exatamente no dia do cutoff (ex.: ref=qui, dow=qui), a janela
 * é considerada FECHADA naquele dia: ini = sex anterior, fim = ref.
 */
export function semanaDoCutoff(ref: string | Date | undefined, dow: number): { ini: string; fim: string } {
  const refIso = refToIsoDay(ref);
  const d = D(refIso);
  const cur = d.getUTCDay();
  // Se ref é o próprio cutoff, fim = ref. Senão fim = próximo cutoff.
  const addToFim = (dow - cur + 7) % 7;
  const fimD = new Date(d);
  fimD.setUTCDate(fimD.getUTCDate() + addToFim);
  const iniD = new Date(fimD);
  iniD.setUTCDate(iniD.getUTCDate() - 6); // 7 dias inclusivos
  return { ini: toIso(iniD), fim: toIso(fimD) };
}

/**
 * Resolve a data de corte efetiva: usa a gravada (`stored`); senão calcula
 * o último cutoff (≤ today) considerando `diaCorteSemana` (default = qui).
 */
export function cutoffEfetivo(stored: string | null | undefined, today?: string | Date, diaCorteSemana: number = DIA_CORTE_DEFAULT): string {
  const s = stored == null ? "" : String(stored);
  if (s && s !== "null" && s !== "undefined" && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return ultimoDiaSemanaAte(today, diaCorteSemana);
}

/** "YYYY-MM-DD" → "DD/MM/AAAA" (regra de ouro: datas no padrão BR para o usuário). */
export function fmtBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// ── Aliases de compatibilidade (Rev. ≤ 1646) ──────────────────────────────
// Código antigo usa `ultimaQuintaAte`/`proximaQuinta`/`ehQuinta` — mantemos
// como aliases que fixam dow=4 (quinta), comportamento idêntico ao anterior.

/** @deprecated Use `ultimoDiaSemanaAte(ref, projeto.diaCorteSemana)`. */
export function ultimaQuintaAte(ref?: string | Date): string {
  return ultimoDiaSemanaAte(ref, 4);
}

/** @deprecated Use `proximoDiaSemana(ref, projeto.diaCorteSemana)`. */
export function proximaQuinta(ref?: string | Date): string {
  return proximoDiaSemana(ref, 4);
}

/** @deprecated Use `ehDiaSemana(iso, projeto.diaCorteSemana)`. */
export function ehQuinta(iso: string): boolean {
  return ehDiaSemana(iso, 4);
}
