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

/**
 * Rev. 1643 — Versão **com hora** do cutoff (paridade exata com MS Project).
 *
 * Aceita `refIsoComHora` no formato "YYYY-MM-DDTHH:mm[:ss]" (StatusDate do
 * XML do MSP). Calcula:
 *   - Dias úteis COMPLETOS do início até o dia anterior ao do cutoff +
 *   - Fração horária do dia do cutoff (jornada padrão 08:00-17:00 = 8h
 *     com almoço 12-13). Se cutoff < 08h → 0 do dia. Se >= 17h → 1.
 *
 * Quando NÃO há calendário, cai em interpolação linear por timestamp
 * (mantém compat). Quando o cutoff é só data (sem hora), trata como fim
 * do dia (23:59) — comportamento equivalente ao `fracaoDecorrida`.
 */
const DIA_INI_H = 8;            // 08:00 início expediente padrão MSP
const DIA_FIM_H = 17;           // 17:00 fim expediente padrão MSP
const ALMOCO_INI = 12;          // 12:00-13:00 hora de almoço
const ALMOCO_FIM = 13;
const HORAS_DIA  = 8;           // jornada útil (9h - 1h almoço)

function fracaoDoDia(horaDecimal: number): number {
  if (horaDecimal <= DIA_INI_H) return 0;
  if (horaDecimal >= DIA_FIM_H) return 1;
  let trabalhadas: number;
  if (horaDecimal <= ALMOCO_INI)      trabalhadas = horaDecimal - DIA_INI_H;
  else if (horaDecimal <= ALMOCO_FIM) trabalhadas = ALMOCO_INI - DIA_INI_H;
  else                                trabalhadas = (ALMOCO_INI - DIA_INI_H) + (horaDecimal - ALMOCO_FIM);
  return Math.max(0, Math.min(1, trabalhadas / HORAS_DIA));
}

export function fracaoDecorridaComHora(
  iniIso: string | null | undefined,
  refIsoComHora: string | null | undefined,
  fimIso: string | null | undefined,
  cal: CalendarioMSProject | null,
): number {
  if (!iniIso || !fimIso || !refIsoComHora) return 0;
  const refData = refIsoComHora.slice(0, 10);
  // Hora opcional: se só veio data, trata como fim de dia (23:59).
  const m = refIsoComHora.match(/T(\d{2}):(\d{2})/);
  const horaDecimal = m ? (parseInt(m[1], 10) + parseInt(m[2], 10) / 60) : 23.99;
  if (refData < iniIso) return 0;
  if (refData > fimIso) return 1;
  if (refData === fimIso && horaDecimal >= DIA_FIM_H) return 1;
  if (iniIso === fimIso) return 1;

  if (!cal) {
    // Sem calendário — linear por timestamp ISO+hora aproximada.
    const iniMs = D(iniIso).getTime() + DIA_INI_H * 3600_000;
    const fimMs = D(fimIso).getTime() + DIA_FIM_H * 3600_000;
    const refMs = D(refData).getTime() + horaDecimal * 3600_000;
    if (fimMs <= iniMs) return 1;
    return Math.max(0, Math.min(1, (refMs - iniMs) / (fimMs - iniMs)));
  }

  const totalDias = diasUteisEntre(iniIso, fimIso, cal);
  if (totalDias <= 0) return 0;
  // Dias completos: do início até o DIA ANTERIOR ao cutoff.
  const cur = D(refData);
  cur.setUTCDate(cur.getUTCDate() - 1);
  const fimDiasCompletosIso = toIso(cur);
  const diasCompletos = fimDiasCompletosIso < iniIso ? 0 : diasUteisEntre(iniIso, fimDiasCompletosIso, cal);
  // Dia do cutoff: conta como fração SE for dia útil, senão zero.
  const fracDia = ehDiaUtil(refData, cal) ? fracaoDoDia(horaDecimal) : 0;
  const decorrido = diasCompletos + fracDia;
  return Math.max(0, Math.min(1, decorrido / totalDias));
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
