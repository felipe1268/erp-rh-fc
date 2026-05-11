// ── Helper de Dias Úteis (paridade MS Project) ──────────────────────────────
// Rev. 1642. Replica a função `ProjDateDiff(start, end, calendar)` que o MS
// Project usa para calcular % PREVISTO em todas as suas vistas. Quando o
// projeto importou um cronograma do MS Project, gravamos o calendário em
// `planejamento_projetos.calendario_json` e usamos esse calendário aqui pra
// garantir que ERP e Project nunca discordem (regra de ouro Portal × Plan.).
//
// Formato do calendário (compacto):
// {
//   "weekDays":   [false,true,true,true,true,true,false], // dom..sab working?
//   "exceptions": [{ "from":"2026-12-25", "to":"2026-12-25", "working":false }]
// }
//
// Quando NÃO há calendário gravado, todas as funções caem para "dias corridos"
// (interpolação linear no calendário gregoriano), que é o comportamento
// histórico do ERP — backward compat 100%.

export interface CalendarioMSProject {
  weekDays: boolean[];                        // 7 elementos, índice = getDay() (0=dom)
  exceptions?: Array<{ from: string; to: string; working: boolean }>;
}

export function parseCalendarioJson(raw: unknown): CalendarioMSProject | null {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || !Array.isArray(obj.weekDays) || obj.weekDays.length !== 7) return null;
    return {
      weekDays:   obj.weekDays.map((v: any) => !!v),
      exceptions: Array.isArray(obj.exceptions) ? obj.exceptions : [],
    };
  } catch { return null; }
}

const D = (s: string) => new Date(s + "T12:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Retorna se uma data ISO é dia útil segundo o calendário (default seg-sex). */
export function ehDiaUtil(iso: string, cal: CalendarioMSProject | null): boolean {
  if (!cal) {
    // Default conservador: seg-sex são úteis.
    const dow = D(iso).getUTCDay();
    return dow >= 1 && dow <= 5;
  }
  // Exceção tem prioridade
  if (cal.exceptions) {
    for (const ex of cal.exceptions) {
      if (iso >= ex.from && iso <= ex.to) return ex.working;
    }
  }
  return cal.weekDays[D(iso).getUTCDay()] === true;
}

/**
 * Conta dias úteis no intervalo [iniIso, fimIso] inclusivo. Espelha o
 * comportamento de `ProjDateDiff(start, end, calendar)` do MS Project com
 * resolução de 1 dia (suficiente para % PREVISTO). Limita a 5000 dias para
 * evitar loop em datas malformadas.
 */
export function diasUteisEntre(iniIso: string, fimIso: string, cal: CalendarioMSProject | null): number {
  if (!iniIso || !fimIso || iniIso > fimIso) return 0;
  let cur = D(iniIso);
  const end = D(fimIso);
  let n = 0;
  let safety = 0;
  while (cur.getTime() <= end.getTime() && safety < 5000) {
    if (ehDiaUtil(toIso(cur), cal)) n++;
    cur.setUTCDate(cur.getUTCDate() + 1);
    safety++;
  }
  return n;
}

/**
 * Fração 0..1 do tempo decorrido entre `ini` e `fim` quando o relógio do
 * projeto chega em `ref`. Quando há calendário, usa dias úteis (paridade
 * Project). Sem calendário, cai em interpolação linear por timestamp
 * (comportamento histórico).
 *
 * Convenção: ref < ini → 0; ref >= fim → 1; ini == fim → 1 (atividade
 * pontual / marco já vencido).
 */
export function fracaoDecorrida(
  iniIso: string | null | undefined,
  refIso: string | null | undefined,
  fimIso: string | null | undefined,
  cal: CalendarioMSProject | null,
): number {
  if (!iniIso || !fimIso || !refIso) return 0;
  if (refIso < iniIso) return 0;
  if (refIso >= fimIso) return 1;
  if (iniIso === fimIso) return 1;

  if (cal) {
    const total = diasUteisEntre(iniIso, fimIso, cal);
    if (total <= 0) return 0;
    const elapsed = diasUteisEntre(iniIso, refIso, cal);
    return Math.max(0, Math.min(1, elapsed / total));
  }

  // Fallback: linear por timestamp (comportamento histórico).
  const ini = D(iniIso).getTime();
  const fim = D(fimIso).getTime();
  const ref = D(refIso).getTime();
  if (fim <= ini) return 1;
  return Math.max(0, Math.min(1, (ref - ini) / (fim - ini)));
}

/** Versão milissegundo-aware para os call sites antigos que já tinham `Date.getTime()`. */
export function fracaoDecorridaMs(iniMs: number, refMs: number, fimMs: number, cal: CalendarioMSProject | null): number {
  if (!cal) {
    if (fimMs <= iniMs) return 1;
    if (refMs <= iniMs) return 0;
    if (refMs >= fimMs) return 1;
    return (refMs - iniMs) / (fimMs - iniMs);
  }
  const toIsoLocal = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  return fracaoDecorrida(toIsoLocal(iniMs), toIsoLocal(refMs), toIsoLocal(fimMs), cal);
}
