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
  // Rev. 2617 — Caminho B EXATO: intervalos de trabalho POR DIA DA SEMANA, em
  // minutos a partir da meia-noite (frame UTC). Índice 0=dom .. 6=sáb; cada dia
  // é uma lista de pares [fromMin, toMin] (ex.: seg-qui = [[420,720],[780,1020]]
  // = 07-12 + 13-17; sex = [[420,720],[780,960]] = 07-12 + 13-16, almoço fora).
  // Quando presente, habilita o cálculo de % PREVISTO minuto-a-minuto (paridade
  // exata com a coluna "% Concluída"/PercentComplete do MSP). Ausente → fallback
  // day-granular (comportamento histórico, projetos importados antes da Rev. 2617).
  weekDayIntervals?:  number[][][];
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
      weekDayIntervals:   Array.isArray(obj.weekDayIntervals) && obj.weekDayIntervals.length === 7 ? obj.weekDayIntervals : undefined,
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

/**
 * Rev. 1825 — `pctRaizMSP`: replica EXATAMENTE a fórmula Texto6 do MS Project
 * para a TASK RAIZ (% PREVISTO da raiz), porém SEM o `Int(...)` — preserva
 * casas decimais.
 *
 * Fórmula MSP nativa:
 *   IIf(StatusDate < BaselineStart, 0,
 *   IIf(StatusDate > BaselineFinish, 100,
 *       (ProjDateDiff(BaselineStart, StatusDate, ProjectCalendar) /
 *        ProjDateDiff(BaselineStart, BaselineFinish, ProjectCalendar)) × 100))
 *
 * Sem ponderação por custo. É a "régua puramente temporal" da raiz, em DIAS
 * ÚTEIS do calendário MSP. Foi a métrica que o usuário escolheu para o banner
 * "Avanço Físico Live" e o card "PREVISTO (SEMANA)" — paridade absoluta com
 * a coluna "% PREVISTO" que ele criou no Project (FieldID=188743746).
 *
 * Para QUALQUER refStr fora de [start, finish] devolve 0 ou 100. Para datas
 * dentro do envelope, devolve `du(start→ref) / du(start→finish) × 100`,
 * usando `fracaoDecorridaMs` (idêntico ao `ProjDateDiff` quando ambos os
 * endpoints caem em horário comercial). Função PURA, sem hooks, idempotente.
 */
export function pctRaizMSP(
  refStr: string,
  projIniIso: string | null | undefined,
  projFimIso: string | null | undefined,
  cal: CalendarioMSProject | null,
): number {
  if (!refStr || !projIniIso || !projFimIso) return 0;
  const iniIso = String(projIniIso).slice(0, 10);
  const fimIso = String(projFimIso).slice(0, 10);
  const refIso = String(refStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iniIso)) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fimIso)) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refIso)) return 0;
  const iniMs = new Date(iniIso + "T12:00:00").getTime();
  const fimMs = new Date(fimIso + "T12:00:00").getTime();
  const refMs = new Date(refIso + "T12:00:00").getTime();
  if (!Number.isFinite(iniMs) || !Number.isFinite(fimMs) || !Number.isFinite(refMs)) return 0;
  if (fimMs <= iniMs) return 0;
  if (refMs <= iniMs) return 0;
  if (refMs >= fimMs) return 100;
  return Math.min(100, Math.max(0, fracaoDecorridaMs(iniMs, refMs, fimMs, cal) * 100));
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

// ── Rev. 2617 — Motor MINUTO-A-MINUTO (Caminho B EXATO) ─────────────────────
// Conta os MINUTOS ÚTEIS entre dois timestamps (frame UTC) usando os intervalos
// de trabalho POR DIA DA SEMANA (`weekDayIntervals`) + as exceções (feriados).
// É a réplica fiel de `ActualDuration`/`ProjDateDiff` do MS Project em sua
// menor unidade — daí a paridade EXATA com a coluna "% Concluída"
// (PercentComplete) do Project. Retorna NaN quando o calendário não tem
// `weekDayIntervals` (sinaliza ao chamador que deve cair no fallback day-granular).
//
// Cache (WeakMap) do índice de exceções por dia: as exceções anuais expandidas
// somam centenas de entradas e este motor é chamado milhões de vezes ao gerar a
// curva; sem o índice O(1) o cadastro de cronograma travaria.
const _exIndexCache = new WeakMap<object, { map: Map<string, boolean>; ranges: Array<{ from: string; to: string; working: boolean }> }>();
function getExIndex(cal: CalendarioMSProject) {
  let idx = _exIndexCache.get(cal as object);
  if (!idx) {
    const map = new Map<string, boolean>();
    const ranges: Array<{ from: string; to: string; working: boolean }> = [];
    for (const ex of cal.exceptions || []) {
      if (ex.from === ex.to) map.set(ex.from, ex.working);
      else ranges.push(ex);
    }
    idx = { map, ranges };
    _exIndexCache.set(cal as object, idx);
  }
  return idx;
}

const _MIN = 60000;
const _DAY = 86400000;
const _pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Minutos úteis em [iniMs, fimMs] segundo os intervalos por dia da semana +
 * feriados do calendário. Frame UTC: `weekDayIntervals[dow]` é minutos a partir
 * da meia-noite UTC e os timestamps são interpretados em UTC. Retorna NaN se o
 * calendário não tiver `weekDayIntervals` (chamador usa fallback day-granular).
 */
export function minutosUteisEntre(iniMs: number, fimMs: number, cal: CalendarioMSProject | null): number {
  if (!cal || !cal.weekDayIntervals) return NaN;
  if (!Number.isFinite(iniMs) || !Number.isFinite(fimMs) || fimMs <= iniMs) return 0;
  const { map, ranges } = getExIndex(cal);
  let total = 0;
  // Começa na meia-noite UTC do dia de início.
  const d0 = new Date(iniMs);
  let dayMs = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
  let guard = 0;
  while (dayMs <= fimMs && guard < 40000) {
    guard++;
    const d = new Date(dayMs);
    const dow = d.getUTCDay();
    const iso = `${d.getUTCFullYear()}-${_pad2(d.getUTCMonth() + 1)}-${_pad2(d.getUTCDate())}`;
    // Exceção tem prioridade sobre o padrão semanal.
    let working: boolean;
    if (map.has(iso)) {
      working = map.get(iso)!;
    } else {
      working = (cal.weekDays?.[dow] === true);
      if (ranges.length) {
        for (const ex of ranges) { if (iso >= ex.from && iso <= ex.to) { working = ex.working; break; } }
      }
    }
    if (working) {
      let ivs = cal.weekDayIntervals[dow] || [];
      // Exceção working=true num dia sem intervalos próprios → usa janela padrão.
      if (ivs.length === 0 && map.get(iso) === true) {
        const fm = Math.round(horaParaDecimal(cal.defaultStartTime, 8) * 60);
        const tm = Math.round(horaParaDecimal(cal.defaultFinishTime, 17) * 60);
        if (tm > fm) ivs = [[fm, tm]];
      }
      for (const iv of ivs) {
        let fm = iv[0], tm = iv[1];
        if (tm <= fm) tm += 1440; // ToTime "00:00" = meia-noite seguinte
        const s = Math.max(dayMs + fm * _MIN, iniMs);
        const e = Math.min(dayMs + tm * _MIN, fimMs);
        if (e > s) total += (e - s) / _MIN;
      }
    }
    dayMs += _DAY;
  }
  return total;
}

/**
 * Fração [0,1] do trabalho de uma atividade decorrida até `refMs`, minuto-a-
 * minuto: `minutosUteisEntre(ini, ref) / minutosUteisEntre(ini, fim)`. Retorna
 * NaN se não houver precisão de minuto (chamador usa fallback day-granular).
 */
export function fracaoMinutos(iniMs: number, refMs: number, fimMs: number, cal: CalendarioMSProject | null): number {
  const total = minutosUteisEntre(iniMs, fimMs, cal);
  if (!Number.isFinite(total)) return NaN; // sem weekDayIntervals
  if (total <= 0) return refMs >= fimMs ? 1 : 0;
  if (refMs <= iniMs) return 0;
  if (refMs >= fimMs) return 1;
  const el = minutosUteisEntre(iniMs, refMs, cal);
  return Math.max(0, Math.min(1, el / total));
}

// ── Rev. 1811/1812 — PREVISTO oficial: curva S por atividade ────────────────
// PMI Practice Standard for Scheduling §6.2 / Mattos "Planejamento e Controle
// de Obras" §7.4 / Vargas "Gerenciamento de Tempo": para CADA atividade-folha
// com datas, % esperado em `refStr` =
//   fracaoDecorridaMs(dataInicio_atv → ref, dataFim_atv, calendario) × 100.
// Pondera por pesoFinanceiro (Earned Value clássico) e soma. É a "linha de
// base" do cronograma físico — leva em conta a curva S real do trabalho
// (mobilização leve, MEPF/acabamento pesados no fim) e o peso de cada
// atividade.
//
// **NÃO confundir** com EVM linear do envelope contratual:
//   fracaoDecorridaMs(projIni → ref, projFim) × 100,
// que é apenas "% do prazo decorrido" e ignora a distribuição de peso.
// Esse número (Texto10/Texto11 da raiz do MSP) é "tempo decorrido", não
// Previsto físico. Usar pra Previsto físico produz divergência em curvas S
// não-lineares (ex.: HOTEL DO PAPA - AMPLIAÇÃO DO 5 PAV: pvMacro 84.68% vs
// curva S real 53.25%).
//
// **Rev. 1815 — Hierarquia automática de peso com detecção de COBERTURA
// PARCIAL (PMI EVM Practice Standard §5.2 / Mattos §7.4 / Vargas §10.3)**,
// garantindo a MESMA lógica funcionando em obras NOVAS (sem orçamento),
// ANTIGAS (com peso financeiro 100%) e MISTAS (algumas folhas com peso, a
// maioria sem — o caso QIU 2 - FASE 4 pós-import parcial de orçamento):
//   1º) `usarPesoPorDuracao=true` (escolha explícita do usuário) → duração;
//   2º) **TODAS** as folhasComDatas têm pesoFinanceiro > 0 (cobertura 100%) →
//       peso financeiro (EV clássico). HOTEL DO PAPA cai aqui;
//   3º) Pelo menos uma folha tem duração computável (duracaoDias > 0 OU
//       derivável de dataFim-dataInicio) → duração (Schedule-Based EV /
//       Time-Phased Budget). QIU 2 cai aqui — cobertura parcial de peso
//       financeiro NUNCA mais satura PV em 100% por "ignorar" atividades
//       futuras sem orçamento;
//   4º) uniforme (1 por atividade-folha) — último recurso (cronograma sem
//       datas E sem duração, raríssimo).
// **Por que cobertura parcial era venenosa**: na Rev. 1812 a regra era
// `Σ peso > 0 → usa peso`. Se UMA atividade passada tinha peso e as 1505
// futuras tinham peso=0, a soma ponderada virava (peso_passada × 100% + 0 +
// 0 + ... ) / peso_passada = 100%. As folhas futuras ficavam invisíveis. Em
// QIU 2 isso saturava o PV mesmo com cronograma se estendendo até 10/12/2026.
// Rev. 1815: exige cobertura COMPLETA pra usar peso financeiro; senão duração
// — todas as folhas (passadas e futuras) entram com peso > 0.
//
// FONTE ÚNICA de PREVISTO em todo o módulo Planejamento (top bar, cards de
// Avanço Semanal, REFIS, ProgramacaoSemanalLotus). Função pura, sem hooks.
export function pvPonderadoPorAtividade(
  refStr: string,
  folhasArr: any[],
  usarPesoPorDuracao: boolean,
  cal: CalendarioMSProject | null,
  // Rev. 1819 — Modo "padrão único" (decisão usuário): SEMPRE usar peso
  // financeiro, sem fallback de duração/uniforme. Se cobertura < 100%, retorna
  // o PV calculado SÓ sobre as folhas com peso > 0 (folhas sem peso ficam
  // invisíveis — o que é desejado: força o usuário a rodar "Recalcular pesos"
  // e mantém alinhamento entre linhas semanais e rodapé no LOTUS).
  // Default false preserva comportamento da Rev. 1815 (top bar, AvancoSemanal,
  // REFIs em PlanejamentoDetalhe continuam usando hierarquia com fallback).
  strictPesoFinanceiro: boolean = false,
): number {
  if (!folhasArr || folhasArr.length === 0) return 0;
  // Rev. 1815 — blindagem contra datas inválidas (strings vazias/malformadas
  // produziam NaN no fracaoDecorridaMs e contaminavam o resultado final).
  // Folhas inválidas são silenciosamente ignoradas — nunca derrubam o PV.
  // Rev. 1816 — Normaliza qualquer formato de data (YYYY-MM-DD, ISO com
  // hora, Date object via .toString()) para YYYY-MM-DD antes de concatenar
  // "T12:00:00", senão "2026-05-15T00:00:00.000Z" + "T12:00:00" vira
  // string inválida e zera todo o cálculo silenciosamente.
  const isoDay = (v: any): string | null => {
    if (!v) return null;
    const s = typeof v === "string" ? v : (v instanceof Date ? v.toISOString() : String(v));
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  };
  const folhasComDatas = folhasArr.filter((a: any) => {
    const i = isoDay(a?.dataInicio);
    const f = isoDay(a?.dataFim);
    if (!i || !f) return false;
    const ini = new Date(i + "T12:00:00").getTime();
    const fim = new Date(f + "T12:00:00").getTime();
    return Number.isFinite(ini) && Number.isFinite(fim) && fim >= ini;
  });
  if (folhasComDatas.length === 0) return 0;
  const refIso = isoDay(refStr);
  if (!refIso) return 0;
  const refMs = new Date(refIso + "T12:00:00").getTime();
  if (!Number.isFinite(refMs)) return 0;

  // Duração robusta: prefere duracaoDias gravado; se faltar/0, deriva de
  // (dataFim - dataInicio) em dias corridos (mín. 1). Evita zerar peso de
  // folhas válidas só porque o campo duracaoDias não foi preenchido no import.
  const durOf = (a: any): number => {
    const d = Number(a.duracaoDias ?? 0);
    if (Number.isFinite(d) && d > 0) return d;
    const i = isoDay(a?.dataInicio);
    const f = isoDay(a?.dataFim);
    if (!i || !f) return 1;
    const ini = new Date(i + "T12:00:00").getTime();
    const fim = new Date(f + "T12:00:00").getTime();
    const dias = Math.max(1, Math.round((fim - ini) / 86400000) + 1);
    return Number.isFinite(dias) ? dias : 1;
  };
  const custoOf = (a: any): number => {
    const n = parseFloat(String(a?.pesoFinanceiro ?? "0"));
    return Number.isFinite(n) ? n : 0;
  };

  // Cobertura COMPLETA de peso financeiro = todas folhasComDatas com custo>0.
  // Só nesse caso faz sentido usar EV clássico (toda atividade contribui).
  const cobrePesoTotal = folhasComDatas.every((a: any) => custoOf(a) > 0);
  const somaDurTodas = folhasComDatas.reduce((s, a) => s + durOf(a), 0);

  // Hierarquia (ver bloco doc acima):
  //   0º Rev. 1819 — strictPesoFinanceiro=true → SEMPRE custo (sem fallback);
  //   1º explícito por duração; 2º cobertura 100% de custo; 3º duração;
  //   4º uniforme.
  let modo: "duracao" | "custo" | "uniforme";
  if (strictPesoFinanceiro)             modo = "custo";
  else if (usarPesoPorDuracao)          modo = "duracao";
  else if (cobrePesoTotal)              modo = "custo";
  else if (somaDurTodas > 0)            modo = "duracao";
  else                                  modo = "uniforme";

  const denom = modo === "uniforme"
    ? folhasComDatas.length
    : (modo === "custo"
        ? folhasComDatas.reduce((s, a) => s + custoOf(a), 0)
        : somaDurTodas);
  if (!Number.isFinite(denom) || denom <= 0) return 0;

  let soma = 0;
  for (const a of folhasComDatas) {
    const i = isoDay(a?.dataInicio);
    const f = isoDay(a?.dataFim);
    if (!i || !f) continue;
    const ini = new Date(i + "T12:00:00").getTime();
    const fim = new Date(f + "T12:00:00").getTime();
    let fracao = 0;
    try { fracao = fracaoDecorridaMs(ini, refMs, fim, cal); } catch { fracao = 0; }
    const exp = (Number.isFinite(fracao) ? fracao : 0) * 100;
    const peso = modo === "uniforme" ? 1 : (modo === "custo" ? custoOf(a) : durOf(a));
    if (!Number.isFinite(peso) || peso <= 0) continue;
    soma += (exp * peso) / denom;
  }
  if (!Number.isFinite(soma)) return 0;
  return Math.min(100, Math.max(0, soma));
}
