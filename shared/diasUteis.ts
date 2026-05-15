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
  // Rev. 1644 — parâmetros raiz do XML MSP (regra de ouro: leitura plena).
  defaultStartTime?:  string;                 // "07:00:00"
  defaultFinishTime?: string;                 // "17:00:00"
  minutesPerDay?:     number;                 // 540 = 9h (não confundir com janela bruta)
  // Rev. 1646.4 — snapshot oficial do %PREVISTO calculado pelo MSP na raiz,
  // válido SÓ no StatusDate do XML. Quando o ERP mostra o projeto no cutoff
  // oficial (= statusDateSnapshot), usa previstoMspSnapshot direto — paridade
  // exata com MSP, sem replicar a aritmética interna `ProjDateDiff` (minutos).
  previstoMspSnapshot?:    number;            // ex.: 1.41
  statusDateSnapshot?:     string;            // "YYYY-MM-DD"
  envelopeStartSnapshot?:  string;            // "YYYY-MM-DD" — invalida snapshot se mudou
  envelopeFinishSnapshot?: string;            // "YYYY-MM-DD"
  // Rev. 1675 — Snapshot do %REALIZADO ACUMULADO calculado pelo MSP na raiz
  // (UID=0) via ActualDuration / (ActualDuration + RemainingDuration). Tem
  // 4 casas de precisão (mesma base interna que MSP usa pra arredondar pro
  // PercentComplete inteiro). Quando o cutoff = statusDateSnapshot E o
  // envelope continua intacto E o usuário não editou nenhum avanço local,
  // o card "Realizado (Acum.)" usa esse número direto — paridade absoluta
  // com a tela de projeto do MSP. Senão, cai no agregado dinâmico do ERP
  // (Σ avanco × pesoFin). Ex.: REVTE-CIVIL UID=0 AD=2043min RD=151317min
  // → 1.3324% (= 1,33% que o MSP exibe).
  realizadoMspSnapshot?:   number;            // ex.: 1.3324
}

export function parseCalendarioJson(raw: unknown): CalendarioMSProject | null {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || !Array.isArray(obj.weekDays) || obj.weekDays.length !== 7) return null;
    return {
      weekDays:           obj.weekDays.map((v: any) => !!v),
      exceptions:         Array.isArray(obj.exceptions) ? obj.exceptions : [],
      defaultStartTime:   typeof obj.defaultStartTime  === "string" ? obj.defaultStartTime  : undefined,
      defaultFinishTime:  typeof obj.defaultFinishTime === "string" ? obj.defaultFinishTime : undefined,
      minutesPerDay:      typeof obj.minutesPerDay     === "number" ? obj.minutesPerDay     : undefined,
      previstoMspSnapshot:    typeof obj.previstoMspSnapshot    === "number" ? obj.previstoMspSnapshot    : undefined,
      statusDateSnapshot:     typeof obj.statusDateSnapshot     === "string" ? obj.statusDateSnapshot     : undefined,
      envelopeStartSnapshot:  typeof obj.envelopeStartSnapshot  === "string" ? obj.envelopeStartSnapshot  : undefined,
      envelopeFinishSnapshot: typeof obj.envelopeFinishSnapshot === "string" ? obj.envelopeFinishSnapshot : undefined,
      realizadoMspSnapshot:   typeof obj.realizadoMspSnapshot   === "number" ? obj.realizadoMspSnapshot   : undefined,
    };
  } catch { return null; }
}

/** Hora "HH:mm[:ss]" → decimal (ex.: "07:30:00" → 7.5). */
function horaParaDecimal(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
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
/**
 * Fração de UM dia útil até `horaDecimal`, modelando a jornada de trabalho
 * como linear entre `startH` e `finishH` (regra de ouro MSP: a janela do
 * dia útil vem do XML — `<DefaultStartTime>` e `<DefaultFinishTime>`).
 * Antes do início → 0. Depois do fim → 1. No meio → proporcional.
 */
function fracaoDoDia(horaDecimal: number, startH: number, finishH: number): number {
  if (finishH <= startH) return 1;
  if (horaDecimal <= startH)  return 0;
  if (horaDecimal >= finishH) return 1;
  return Math.max(0, Math.min(1, (horaDecimal - startH) / (finishH - startH)));
}

export function fracaoDecorridaComHora(
  iniIso: string | null | undefined,
  refIsoComHora: string | null | undefined,
  fimIso: string | null | undefined,
  cal: CalendarioMSProject | null,
): number {
  if (!iniIso || !fimIso || !refIsoComHora) return 0;
  const refData = refIsoComHora.slice(0, 10);
  const m = refIsoComHora.match(/T(\d{2}):(\d{2})/);
  const horaDecimal = m ? (parseInt(m[1], 10) + parseInt(m[2], 10) / 60) : 23.99;
  // Janela útil do dia: do XML do MSP se houver; senão 08:00-17:00.
  const startH  = horaParaDecimal(cal?.defaultStartTime,  8);
  const finishH = horaParaDecimal(cal?.defaultFinishTime, 17);
  if (refData < iniIso) return 0;
  if (refData > fimIso) return 1;
  if (refData === fimIso && horaDecimal >= finishH) return 1;
  if (iniIso === fimIso) return 1;

  if (!cal) {
    // Sem calendário — linear por timestamp ISO+hora aproximada.
    const iniMs = D(iniIso).getTime() + startH  * 3600_000;
    const fimMs = D(fimIso).getTime() + finishH * 3600_000;
    const refMs = D(refData).getTime() + horaDecimal * 3600_000;
    if (fimMs <= iniMs) return 1;
    return Math.max(0, Math.min(1, (refMs - iniMs) / (fimMs - iniMs)));
  }

  const totalDias = diasUteisEntre(iniIso, fimIso, cal);
  if (totalDias <= 0) return 0;
  const cur = D(refData);
  cur.setUTCDate(cur.getUTCDate() - 1);
  const fimDiasCompletosIso = toIso(cur);
  const diasCompletos = fimDiasCompletosIso < iniIso ? 0 : diasUteisEntre(iniIso, fimDiasCompletosIso, cal);
  const fracDia = ehDiaUtil(refData, cal) ? fracaoDoDia(horaDecimal, startH, finishH) : 0;
  const decorrido = diasCompletos + fracDia;
  return Math.max(0, Math.min(1, decorrido / totalDias));
}

/**
 * Rev. 1644 — Deriva o cutoff ISO completo a partir do que está disponível
 * no banco. Prioridade: (1) `dataCorteIso` gravado do XML; (2) `dataCorteAtual`
 * (date) + `defaultFinishTime` do calendário (ex.: "2026-05-08" + "17:00:00"
 * → "2026-05-08T17:00:00"); (3) null. Permite que o per-row mostre Previsto%
 * MSP-compatível mesmo em projetos importados antes da Rev. 1643 (sem hora).
 */
export function derivarCutoffIso(
  dataCorteIso: string | null | undefined,
  dataCorteAtual: string | null | undefined,
  cal: CalendarioMSProject | null,
): string | null {
  if (dataCorteIso) return dataCorteIso;
  if (!dataCorteAtual) return null;
  const dataIso = String(dataCorteAtual).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null;
  const hora = (cal?.defaultFinishTime || "17:00:00").slice(0, 8);
  return `${dataIso}T${hora.length === 5 ? hora + ":00" : hora}`;
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

// ── Rev. 1811 — PREVISTO oficial: curva S por atividade ─────────────────────
// PMI Practice Standard for Scheduling §6.2 / Mattos "Planejamento e Controle
// de Obras" §7.4 / Vargas "Gerenciamento de Tempo": para CADA atividade-folha
// com datas, % esperado em `refStr` =
//   fracaoDecorridaMs(dataInicio_atv → ref, dataFim_atv, calendario) × 100.
// Pondera por pesoFinanceiro (ou por duração quando usarPesoPorDuracao=true)
// e soma. É a "linha de base" do cronograma físico — leva em conta a curva S
// real do trabalho (mobilização leve, MEPF/acabamento pesados no fim) e o
// peso de cada atividade.
//
// **NÃO confundir** com EVM linear do envelope contratual:
//   fracaoDecorridaMs(projIni → ref, projFim) × 100,
// que é apenas "% do prazo decorrido" e ignora a distribuição de peso.
// Esse número (Texto10/Texto11 da raiz do MSP) é "tempo decorrido", não
// Previsto físico. Usar pra Previsto físico produz divergência em curvas S
// não-lineares (ex.: HOTEL DO PAPA - AMPLIAÇÃO DO 5 PAV: pvMacro 84.68% vs
// curva S real 53.25%).
//
// FONTE ÚNICA de PREVISTO em todo o módulo Planejamento (top bar, cards de
// Avanço Semanal, REFIS, ProgramacaoSemanalLotus). Função pura, sem hooks.
export function pvPonderadoPorAtividade(
  refStr: string,
  folhasArr: any[],
  usarPesoPorDuracao: boolean,
  cal: CalendarioMSProject | null,
): number {
  if (!folhasArr || folhasArr.length === 0) return 0;
  const folhasComDatas = folhasArr.filter((a: any) => a.dataInicio && a.dataFim);
  if (folhasComDatas.length === 0) return 0;
  const pesoBruto = usarPesoPorDuracao
    ? folhasArr.reduce((s: number, a: any) => s + (a.duracaoDias ?? 0), 0)
    : folhasArr.reduce((s: number, a: any) => s + (parseFloat(a.pesoFinanceiro || "0") || 0), 0);
  const semPeso = pesoBruto === 0;
  const denom = semPeso ? (folhasComDatas.length || 1) : pesoBruto;
  const ref = new Date(refStr + "T12:00:00").getTime();
  let soma = 0;
  for (const a of folhasComDatas) {
    const ini = new Date(a.dataInicio + "T12:00:00").getTime();
    const fim = new Date(a.dataFim + "T12:00:00").getTime();
    const exp = fracaoDecorridaMs(ini, ref, fim, cal) * 100;
    const peso = semPeso
      ? 1
      : (usarPesoPorDuracao ? (a.duracaoDias ?? 0) : (parseFloat(a.pesoFinanceiro || "0") || 0));
    soma += (exp * peso) / denom;
  }
  return Math.min(100, Math.max(0, soma));
}
