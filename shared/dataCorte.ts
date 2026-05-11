// ── Data de Corte (Status Date / Cutoff Date) ─────────────────────────────
// Padrão PMBOK 7 / EVM: toda análise de cronograma deve ser referenciada a
// uma "Data de Status" (status date) explícita — nunca a `today()` cru.
// Política FC Engenharia: o ciclo oficial é semanal e fecha na quinta-feira
// (procedimento interno de atualização do cronograma toda quinta).
// Entre uma quinta e a próxima, Portal do Cliente e relatórios externos
// usam o último cutoff fechado; o módulo Planejamento interno permite ver
// "Live" (today) para uso do gestor — mas com selo claro do cutoff oficial.

const D = (s: string) => new Date(s + "T12:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Hoje em America/Sao_Paulo no formato YYYY-MM-DD. NÃO use
 * `new Date().toISOString().slice(0,10)` para "hoje" — em São Paulo isso
 * vira o dia seguinte após ~21h local (offset −03:00 → UTC já cruzou meia
 * noite). Esse erro faria `ultimaQuintaAte(today)` "pular" para a quinta
 * seguinte na quarta à noite. `en-CA` retorna ISO `YYYY-MM-DD`.
 */
export function todayBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Normaliza uma referência (string ISO, Date ou undefined → today BR) para "YYYY-MM-DD". */
function refToIsoDay(ref: string | Date | undefined): string {
  if (!ref) return todayBR();
  if (typeof ref === "string") return ref.slice(0, 10);
  // Para Date, extrai os componentes em fuso Brasília — não toISOString().
  return ref.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Última quinta-feira (≤ ref). Se ref já é quinta, retorna a própria ref. */
export function ultimaQuintaAte(ref?: string | Date): string {
  const d = D(refToIsoDay(ref));
  // 0=dom, 1=seg, ..., 4=qui, 5=sex, 6=sáb
  const dow = d.getUTCDay();
  const diff = (dow - 4 + 7) % 7; // dias a recuar para chegar na quinta
  d.setUTCDate(d.getUTCDate() - diff);
  return toIso(d);
}

/** Próxima quinta-feira (> ref). */
export function proximaQuinta(ref?: string | Date): string {
  const d = D(refToIsoDay(ref));
  const dow = d.getUTCDay();
  const add = ((4 - dow + 7) % 7) || 7; // sempre avança ao menos 1 dia
  d.setUTCDate(d.getUTCDate() + add);
  return toIso(d);
}

/** Verdadeiro se `iso` (YYYY-MM-DD) cai numa quinta-feira. */
export function ehQuinta(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return D(iso).getUTCDay() === 4;
}

/**
 * Resolve a data de corte efetiva: usa a gravada (`stored`); senão calcula
 * a última quinta ≤ today. Trata null/undefined/""/"null" defensivamente
 * (alguns helpers internos do projeto serializam `null` como "null").
 */
export function cutoffEfetivo(stored: string | null | undefined, today?: string | Date): string {
  const s = stored == null ? "" : String(stored);
  if (s && s !== "null" && s !== "undefined" && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return ultimaQuintaAte(today);
}

/** "YYYY-MM-DD" → "DD/MM/AAAA" (regra de ouro: datas no padrão BR para o usuário). */
export function fmtBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
