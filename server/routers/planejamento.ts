import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import { importAtividadesCronogramaToFinancial } from "../services/financialIntegrationBridge";
import { parseCalendarioJson, fracaoDecorridaMs, minutosUteisEntre, temIntervalosUteis } from "../../shared/diasUteis";
// Rev. 1817 — Resolução automática do Responsável (FONTE ÚNICA).
import { resolverResponsaveisBatch, truncarNomeEmpresa, type ResponsavelInfo } from "../_shared/responsavelAtividade";
// Rev. 1820 — FONTE ÚNICA do recálculo de pesos (item 4 + item 10).
import { recalcularPesosCore } from "../_shared/recalcularPesos";
// Rev. 1821 — Normalização canônica do EAP (match orçamento ↔ cronograma).
import { eapCanonico } from "../_shared/normalizarEap";
import { eq, and, desc, asc, sql, isNotNull, inArray, or, ilike, lt, ne, gt } from "drizzle-orm";
import {
  planejamentoProjetos,
  planejamentoRevisoes,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoRefis,
  planejamentoCompras,
  planejamentoComprasRevisoes,
  planejamentoMedicoes,
  planejamentoMedicaoConfig,
  orcamentos,
  orcamentoItens,
  bdiFd,
  composicaoInsumos,
  almoxarifadoItens,
  equipment,
  heSolicitacoes,
  heSolicitacaoFuncionarios,
  employees,
  obras,
  companies,
  financialRevenue,
  medicaoBoletimItens,
  smoAtividadesEap,
  terceiroContratoItens,
  ocNumberConfig,
} from "../../drizzle/schema";

const n = (v: any) => parseFloat(v || "0") || 0;
// pg driver returns `date` columns as Date objects; after JSON serialization they become
// "2026-02-09T00:00:00.000Z". The frontend expects "YYYY-MM-DD" strings.
const toDateStr = (v: any): string =>
  v instanceof Date ? v.toISOString().split("T")[0] : String(v).slice(0, 10);

// Normaliza qualquer data para a segunda-feira da sua semana (YYYY-MM-DD).
// Usa UTC para evitar desvio de fuso: datas armazenadas como "YYYY-MM-DD" são
// interpretadas como midnight UTC, e getDay() em UTC é o correto aqui.
function toMondayStr(d: Date): string {
  const day  = d.getUTCDay();               // 0=dom, 1=seg, ..., 6=sáb
  const diff = day === 0 ? -6 : 1 - day;   // quantos dias voltar até segunda
  const m    = new Date(d.getTime() + diff * 86_400_000);
  return m.toISOString().split("T")[0];
}

// Rev. 2270 — Helper: zera os campos de snapshot MSP (`previstoMspSnapshot`,
// `realizadoMspSnapshot`, `statusDateSnapshot`, `envelopeStartSnapshot`,
// `envelopeFinishSnapshot`) do `calendarioJson` + `dataCorteAtual` +
// `dataCorteIso`. Calendário (jornadas/feriados) é PRESERVADO. Usado pelos
// dois "Limpar Avanços" para garantir que os cards visíveis (REALIZADO ACUM.
// e barra Avanço Físico do topo) também zerem — antes só a tabela `avancos`
// era apagada, mas a Regra de Ouro (Rev. 2264/2265) faz os cards lerem do
// snapshot MSP, então sem este reset o card continuava mostrando o valor
// do último XML mesmo após o user clicar "Todas as semanas".
async function limparSnapshotMspDoProjeto(db: any, projetoId: number) {
  const [proj] = await db.select({ calendarioJson: planejamentoProjetos.calendarioJson })
    .from(planejamentoProjetos)
    .where(eq(planejamentoProjetos.id, projetoId));
  if (!proj) return;
  let calLimpo: string | null = null;
  if (proj.calendarioJson) {
    try {
      const cal = JSON.parse(proj.calendarioJson as any);
      delete cal.previstoMspSnapshot;
      delete cal.realizadoMspSnapshot;
      delete cal.statusDateSnapshot;
      delete cal.envelopeStartSnapshot;
      delete cal.envelopeFinishSnapshot;
      // Rev. 2781 — "Limpar Avanços" também zera o HISTÓRICO de realizado por
      // semana (senão o card continuaria mostrando fotos antigas em semanas passadas).
      delete cal.realizadoSemanas;
      calLimpo = JSON.stringify(cal);
    } catch {
      calLimpo = proj.calendarioJson as any;
    }
  }
  await db.update(planejamentoProjetos).set({
    calendarioJson: calLimpo as any,
    dataCorteAtual: null as any,
    dataCorteIso: null as any,
    atualizadoEm: new Date(),
  }).where(eq(planejamentoProjetos.id, projetoId));
}

/**
 * Rev. 2603 — Caminho B: expande o PREVISTO semana-a-semana REPLICANDO a fórmula
 * NATIVA do MS Project em TEMPO ÚTIL (não mais dias corridos), usando o MESMO
 * motor de calendário (`pctRaizMSP` / `fracaoDecorridaMs` de `shared/diasUteis`)
 * que o top bar e o `mspReadOnly` já usam. Antes (Rev. 2533) o helper fazia a
 * conta inline em dias CORRIDOS (ms) e a raiz por média ponderada de peso — por
 * isso a curva divergia do MSP (0,2,4,5,7 vs 1,3,4,6,8) E do próprio top bar.
 *
 *  - RAIZ = `floor(pctRaizMSP(semana, min(BL_Start), max(BL_Finish), cal))` =
 *    fórmula do MSP sobre a baseline DA PRÓPRIA RAIZ (% do tempo útil decorrido),
 *    SEM ponderação por peso, INT (a coluna "% PREVISTO"/Texto6 do MSP é inteira).
 *  - POR ATIVIDADE = `floor(fracaoDecorridaMs(BL_Start, semana, BL_Finish, cal)
 *    × 100)` = coluna "% PREVISTO" (Texto6) de cada linha, int.
 *  - Com calendário gravado → tempo útil (paridade MSP). Sem → dias corridos
 *    (fallback do próprio motor; backward compat 100%).
 *
 * Grava o snapshot em `planejamento_projetos.previsto_semanas_json` como:
 *   { semanas: ["YYYY-MM-DD"...], raiz: [pct...],
 *     porAtividadeId: { "<id>": [pct...] }, diaCorteSemana, geradoEm }
 *
 * Janela: cutoff (default Quinta) de min(BL_Start) até max(BL_Finish), inclusivo.
 * Atividades sem baseline são puladas (snapshot vazio pra elas — UI mostra "—").
 */
async function regenerarPrevistoSemanasCaminhoB(
  db: any,
  projetoId: number,
  revisaoId: number,
): Promise<{ semanas: number; folhas: number } | null> {
  const [proj] = await db.select({
    id: planejamentoProjetos.id,
    diaCorteSemana: planejamentoProjetos.diaCorteSemana,
    calendarioJson: planejamentoProjetos.calendarioJson,
  }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, projetoId)).limit(1);
  if (!proj) return null;
  const diaCorte = proj.diaCorteSemana ?? 4;
  // Rev. 2603 — calendário MSP (Seg–Qui 9h / Sex 8h, feriados) gravado no
  // import. Alimenta o MESMO motor de tempo útil (`pctRaizMSP` /
  // `fracaoDecorridaMs`) que o top bar já usa. Sem calendário → fallback
  // dias corridos (backward compat).
  const cal = parseCalendarioJson(proj.calendarioJson ?? null);

  // Rev. 2601 — Helpers de data DECLARADOS ANTES de `folhas` (eram definidos
  // depois → `folhas` chamava `toUtc` na zona morta temporal do `const` →
  // "Cannot access 'toUtc' before initialization" → regenerar SEMPRE lançava
  // → `previsto_semanas_json` nunca era gravado → curva PREVISTO travada).
  // Rev. 2533 — Drizzle date() pode devolver Date OU string; normaliza
  // pra "YYYY-MM-DD" antes de carimbar UTC midnight/EoD. Sem isso, um Date
  // virava "Sun May 10..." e o parse retornava NaN → snapshot vazio.
  const toDateStr = (v: any): string | null => {
    if (v == null) return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return v.toISOString().slice(0, 10);
    }
    const s = String(v);
    const m = s.match(/^\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const toUtc = (v: any, endOfDay = false): number => {
    const s = toDateStr(v);
    if (!s) return NaN;
    return new Date(s + (endOfDay ? "T23:59:59Z" : "T00:00:00Z")).getTime();
  };

  const ativs = await db.select({
    id: planejamentoAtividades.id,
    isGrupo: planejamentoAtividades.isGrupo,
    disabled: planejamentoAtividades.disabled,
    pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
    baselineStart: planejamentoAtividades.baselineStart,
    baselineFinish: planejamentoAtividades.baselineFinish,
    // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
    baselineStartTs: planejamentoAtividades.baselineStartTs,
    baselineFinishTs: planejamentoAtividades.baselineFinishTs,
  }).from(planejamentoAtividades)
    .where(eq(planejamentoAtividades.revisaoId, revisaoId));

  // Rev. 2617 — parse "wall-clock" determinístico (sem TZ) do timestamp ISO da
  // baseline ("2026-06-01T07:00:00" → UTC ms). A HORA é essencial: date-only dá
  // 2/9/16/22 no PLN_816 R04, com hora dá o correto 2/9/15/20.
  const tsToMs = (v: any): number => {
    if (!v) return NaN;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  };
  // Rev. 2617 — motor minuto-a-minuto só quando o calendário tem intervalos por
  // dia (XML completo); senão cai no day-granular legado (backward compat).
  const hasMin = temIntervalosUteis(cal as any);

  const folhas = (ativs as any[])
    .filter(a => !a.isGrupo && !a.disabled && a.baselineStart && a.baselineFinish)
    .map(a => {
      const bsTs = tsToMs(a.baselineStartTs);
      const bfTs = tsToMs(a.baselineFinishTs);
      return {
        ...a,
        // Prefere o timestamp COM HORA; fallback p/ a coluna date-only (legado).
        _bs: Number.isFinite(bsTs) ? bsTs : toUtc(a.baselineStart),
        _bf: Number.isFinite(bfTs) ? bfTs : toUtc(a.baselineFinish, true),
      };
    })
    .filter(a => !isNaN(a._bs) && !isNaN(a._bf));
  if (folhas.length === 0) {
    await db.update(planejamentoProjetos)
      .set({ previstoSemanasJson: null as any, previstoSemanasGeradoEm: null as any })
      .where(eq(planejamentoProjetos.id, projetoId));
    return { semanas: 0, folhas: 0 };
  }

  let minStart = Number.POSITIVE_INFINITY;
  let maxFinish = Number.NEGATIVE_INFINITY;
  for (const a of folhas) {
    if (a._bs < minStart) minStart = a._bs;
    if (a._bf > maxFinish) maxFinish = a._bf;
  }

  const DAY = 86400000;
  const minDate = new Date(minStart);
  const dow = minDate.getUTCDay();
  const delta = (diaCorte - dow + 7) % 7;
  let cur = new Date(Date.UTC(
    minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate() + delta,
  )).getTime();
  // Garante que o último cutoff cobre o fim da última atividade.
  const semanas: string[] = [];
  let guard = 0;
  while (cur <= maxFinish + 7 * DAY && guard < 1000) {
    semanas.push(new Date(cur).toISOString().slice(0, 10));
    cur += 7 * DAY;
    guard++;
  }
  if (semanas.length === 0) return { semanas: 0, folhas: folhas.length };

  // Rev. 2644 — PREVISTO = réplica EXATA da coluna "% PREVISTO" (Texto10) do MSP:
  //   Texto10 = Int(Num Dur (Prev) ÷ PESO DUR (BL) × 100 + 0.5)  → ARREDONDA.
  // POR ATIVIDADE = round(tempo útil DECORRIDO da baseline ÷ tempo útil TOTAL).
  // RAIZ = ROLLUP do MSP = round(Σ decorrido das folhas ÷ Σ total das folhas) —
  // soma das durações das atividades-folha (Número6/Número7 fazem esse rollup no
  // summary), NÃO o vão início→fim do projeto inteiro. (Decisão do usuário Rev.
  // 2644: "verdade absoluta = Texto10". Antes: vão inteiro + Math.trunc.)
  // Feriados/almoço/sexta-mais-curta entram via `minutosUteisEntre` (o motor lê
  // `weekDayIntervals` + `exceptions` do calendário do XML). Sem intervalos (XML
  // antigo) cai no day-granular por ms do mesmo vão, preservando backward compat.
  const unitsTotal = (bs: number, bf: number): number =>
    hasMin ? minutosUteisEntre(bs, bf, cal as any) : Math.max(0, bf - bs);
  const unitsElapsed = (bs: number, w: number, bf: number): number => {
    if (w <= bs) return 0;
    if (w >= bf) return unitsTotal(bs, bf);
    return hasMin
      ? minutosUteisEntre(bs, w, cal as any)
      : fracaoDecorridaMs(bs, w, bf, cal) * Math.max(0, bf - bs);
  };

  const wMs = semanas.map(s => toUtc(s, true));
  const totaisLeaf = folhas.map(a => unitsTotal(a._bs, a._bf));

  const porAtividadeId: Record<string, number[]> = {};
  const raiz: number[] = new Array(semanas.length).fill(0);
  // RAIZ = ROLLUP MSP: Σ decorrido das folhas ÷ Σ total das folhas (arredondado).
  const raizTotal = totaisLeaf.reduce((s, t) => s + t, 0);
  const raizElapsed: number[] = new Array(semanas.length).fill(0);

  for (let i = 0; i < folhas.length; i++) {
    const a = folhas[i];
    const tot = totaisLeaf[i];
    const arr: number[] = new Array(semanas.length).fill(0);
    for (let j = 0; j < semanas.length; j++) {
      const el = unitsElapsed(a._bs, wMs[j], a._bf);
      raizElapsed[j] += el; // acumula p/ o rollup da raiz (soma das folhas)
      // % PREVISTO por atividade = round(fração de TEMPO ÚTIL da baseline × 100).
      // A fórmula do Texto10 é Int(x*100 + 0.5) = ARREDONDA (não trunca):
      // Num Dur (Prev) ÷ PESO DUR (BL).
      let pct: number;
      if (tot <= 0) pct = wMs[j] >= a._bf ? 100 : 0;
      else          pct = Math.round((el / tot) * 100);
      arr[j] = Math.max(0, Math.min(100, pct));
    }
    porAtividadeId[String(a.id)] = arr;
  }

  for (let j = 0; j < semanas.length; j++) {
    raiz[j] = raizTotal > 0
      ? Math.max(0, Math.min(100, Math.round((raizElapsed[j] / raizTotal) * 100)))
      : 0;
  }

  const snap = {
    semanas,
    raiz: raiz.map(v => +v.toFixed(4)),
    porAtividadeId,
    diaCorteSemana: diaCorte,
    geradoEm: new Date().toISOString(),
    revisaoId,
  };
  await db.update(planejamentoProjetos)
    .set({
      previstoSemanasJson: JSON.stringify(snap),
      previstoSemanasGeradoEm: new Date(),
    })
    .where(eq(planejamentoProjetos.id, projetoId));

  return { semanas: semanas.length, folhas: folhas.length };
}

// ════════════════════════════════════════════════════════════════════════════
// Rev. 2767 — Captura o "% Previsto" LITERAL (Texto10 da raiz UID=0) de CADA
// upload da aba "Avanço Semanal" e o grava por semana em `previsto_literal_json`.
// É o número que o MS Project JÁ calculou (paridade 100% com o cliente) — NÃO
// re-roda o motor (zero oscilação; revoga só a LEITURA do motor para as semanas
// JÁ enviadas — o motor segue projetando as FUTURAS). Estrutura:
//   { revisaoId: number, valores: { "<cutoffIso>": pct } }
// A chave é o cutoff (Quinta) da curva em que o StatusDate cai — MESMA lógica
// `idxAt` do cliente (maior cutoff <= StatusDate) — para o override no `raizAt`
// casar exatamente onde o card lê. É UPDATE de coluna JSON (R-001/R-007/R-010 OK).
async function capturarPrevistoLiteralSemana(
  db: any,
  projetoId: number,
  statusDateStr: string | null | undefined,
  literal: number | null | undefined,
): Promise<void> {
  if (statusDateStr == null || literal == null || !Number.isFinite(literal)) return;
  const alvo = String(statusDateStr).slice(0, 10);
  const [proj] = await db.select({
    curva: planejamentoProjetos.previstoSemanasJson,
    lit:   planejamentoProjetos.previstoLiteralJson,
  }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, projetoId)).limit(1);
  if (!proj?.curva) return; // sem curva → sem cutoffs p/ mapear (motor é a fonte)
  let curva: any;
  try { curva = JSON.parse(proj.curva); } catch { return; }
  const semanas: string[] = Array.isArray(curva?.semanas) ? curva.semanas : [];
  const revId = curva?.revisaoId ?? null;
  if (semanas.length === 0) return;
  // idxAt: maior cutoff <= StatusDate (espelha o cliente em PlanejamentoDetalhe).
  let idx = -1;
  for (let i = 0; i < semanas.length; i++) { if (semanas[i] <= alvo) idx = i; else break; }
  if (idx < 0) return; // StatusDate antes do 1º cutoff → previsto 0 (motor já dá 0)
  const key = semanas[idx];
  let store: any = {};
  try { store = proj.lit ? JSON.parse(proj.lit) : {}; } catch { store = {}; }
  // Guarda de revisão: quando a curva ATUAL tem revisão (revId numérico), qualquer
  // store cuja revisão DIVIRJA — inclusive `null`/`undefined` de dados legados —
  // é descartado, pra nunca herdar valores de outra revisão. (Rev. 2767+ endurecido.)
  if (revId != null && store?.revisaoId !== revId) store = {};
  const valores = (store && typeof store.valores === "object" && store.valores) ? store.valores : {};
  valores[key] = Math.min(100, Math.max(0, Number(literal)));
  await db.update(planejamentoProjetos)
    .set({ previstoLiteralJson: JSON.stringify({ revisaoId: revId, valores }) as any })
    .where(eq(planejamentoProjetos.id, projetoId));
  console.log(`[capturarPrevistoLiteral] projeto=${projetoId} rev=${revId} ${key}=${valores[key]}% (Texto10 literal MSP).`);
}

// ════════════════════════════════════════════════════════════════════════════
// Rev. 2633 — MODO MANUAL do "% Previsto".
// Constrói a curva (`previsto_semanas_json`) a partir dos uploads semanais crus
// (`previsto_manual_json`), reaproveitando o MESMO grid de semanas do motor
// (cutoffs do diaCorte sobre o envelope da baseline). Cada upload guarda o %
// ACUMULADO (PercentComplete) lido do XML daquela semana; entre uploads a curva
// é um degrau (carry-forward). A tela continua lendo só `previsto_semanas_json`
// pelo hook `previstoCurva` — não sabe (nem precisa) se a origem foi manual.
// ════════════════════════════════════════════════════════════════════════════
async function regenerarPrevistoManual(
  db: any,
  projetoId: number,
  revisaoId: number,
): Promise<{ semanas: number; uploads: number } | null> {
  const [proj] = await db.select({
    id: planejamentoProjetos.id,
    diaCorteSemana: planejamentoProjetos.diaCorteSemana,
    previstoManualJson: planejamentoProjetos.previstoManualJson,
  }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, projetoId)).limit(1);
  if (!proj) return null;
  const diaCorte = proj.diaCorteSemana ?? 4;

  let manual: any = null;
  try { manual = proj.previstoManualJson ? JSON.parse(proj.previstoManualJson) : null; } catch { manual = null; }
  const semObj: Record<string, any> = (manual && manual.revisaoId === revisaoId && manual.semanas) ? manual.semanas : {};
  const datasUpload = Object.keys(semObj).filter(Boolean).sort();

  // Sem nenhum upload p/ esta revisão → zera a curva (a tela cai no "—").
  if (datasUpload.length === 0) {
    await db.update(planejamentoProjetos)
      .set({ previstoSemanasJson: null as any, previstoSemanasGeradoEm: null as any })
      .where(eq(planejamentoProjetos.id, projetoId));
    return { semanas: 0, uploads: 0 };
  }

  // Envelope p/ o grid de semanas: baseline das folhas (mesma régua do motor);
  // fallback = intervalo das próprias datas de upload (quando não há baseline).
  const ativs = await db.select({
    isGrupo: planejamentoAtividades.isGrupo,
    disabled: planejamentoAtividades.disabled,
    baselineStart: planejamentoAtividades.baselineStart,
    baselineFinish: planejamentoAtividades.baselineFinish,
    baselineStartTs: planejamentoAtividades.baselineStartTs,
    baselineFinishTs: planejamentoAtividades.baselineFinishTs,
  }).from(planejamentoAtividades).where(eq(planejamentoAtividades.revisaoId, revisaoId));

  const toMs = (v: any, endOfDay = false): number => {
    if (!v) return NaN;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return NaN;
    const hasTime = m[4] != null;
    return Date.UTC(
      +m[1], +m[2] - 1, +m[3],
      hasTime ? +m[4] : (endOfDay ? 23 : 0),
      hasTime ? +m[5] : (endOfDay ? 59 : 0),
      hasTime ? (m[6] ? +m[6] : 0) : (endOfDay ? 59 : 0),
    );
  };

  let minStart = Number.POSITIVE_INFINITY;
  let maxFinish = Number.NEGATIVE_INFINITY;
  for (const a of ativs as any[]) {
    if (a.isGrupo || a.disabled) continue;
    const bsTs = toMs(a.baselineStartTs);
    const bfTs = toMs(a.baselineFinishTs);
    const bs = Number.isFinite(bsTs) ? bsTs : toMs(a.baselineStart);
    const bf = Number.isFinite(bfTs) ? bfTs : toMs(a.baselineFinish, true);
    if (Number.isFinite(bs) && bs < minStart) minStart = bs;
    if (Number.isFinite(bf) && bf > maxFinish) maxFinish = bf;
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxFinish)) {
    minStart = toMs(datasUpload[0]);
    maxFinish = toMs(datasUpload[datasUpload.length - 1], true);
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxFinish)) {
    return { semanas: 0, uploads: datasUpload.length };
  }

  const DAY = 86400000;
  const minDate = new Date(minStart);
  const dow = minDate.getUTCDay();
  const delta = (diaCorte - dow + 7) % 7;
  let cur = Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate() + delta);
  const semanas: string[] = [];
  let guard = 0;
  while (cur <= maxFinish + 7 * DAY && guard < 1000) {
    semanas.push(new Date(cur).toISOString().slice(0, 10));
    cur += 7 * DAY; guard++;
  }
  // Garante slot p/ uploads que caiam além do envelope da baseline.
  for (const d of datasUpload) {
    if (!semanas.includes(d) && d > (semanas[semanas.length - 1] ?? "")) semanas.push(d);
  }
  semanas.sort();
  if (semanas.length === 0) return { semanas: 0, uploads: datasUpload.length };

  // idx do degrau acumulado: maior cutoff <= alvo. Uploads ANTES do 1º cutoff
  // do grid (data de status anterior ao início da baseline) ancoram no slot 0 —
  // assim um upload válido nunca é descartado silenciosamente (achado code review).
  const idxAt = (alvo: string): number => {
    if (alvo < semanas[0]) return 0;
    let idx = 0;
    for (let i = 0; i < semanas.length; i++) { if (semanas[i] <= alvo) idx = i; else break; }
    return idx;
  };

  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const raiz: (number | null)[] = new Array(semanas.length).fill(null);
  const perAtivRaw: Record<string, (number | null)[]> = {};
  const ensure = (id: string) => (perAtivRaw[id] ??= new Array(semanas.length).fill(null));

  for (const d of datasUpload) {
    const slot = idxAt(d);
    if (slot < 0) continue;
    const up = semObj[d] || {};
    if (up.raiz != null && Number.isFinite(+up.raiz)) raiz[slot] = clamp(+up.raiz);
    const pa = up.porAtividadeId || {};
    for (const id of Object.keys(pa)) {
      const v = +pa[id];
      if (Number.isFinite(v)) ensure(id)[slot] = clamp(v);
    }
  }

  // Carry-forward (degrau cumulativo): antes do 1º upload = 0.
  const fill = (arr: (number | null)[]): number[] => {
    const out = new Array(arr.length).fill(0);
    let prev = 0;
    for (let j = 0; j < arr.length; j++) { if (arr[j] != null) prev = arr[j] as number; out[j] = prev; }
    return out;
  };
  const raizF = fill(raiz);
  const porAtividadeId: Record<string, number[]> = {};
  for (const id of Object.keys(perAtivRaw)) porAtividadeId[id] = fill(perAtivRaw[id]);

  const snap = {
    semanas,
    raiz: raizF.map(v => +v.toFixed(4)),
    porAtividadeId,
    diaCorteSemana: diaCorte,
    geradoEm: new Date().toISOString(),
    revisaoId,
    fonte: "manual",
  };
  await db.update(planejamentoProjetos)
    .set({ previstoSemanasJson: JSON.stringify(snap), previstoSemanasGeradoEm: new Date() })
    .where(eq(planejamentoProjetos.id, projetoId));

  return { semanas: semanas.length, uploads: datasUpload.length };
}

// Rev. 2633 — Fonte global do "% Previsto" da empresa dona do projeto
// ("manual" | "motor"). Default "motor". Lê oc_number_config.previsto_fonte.
async function getPrevistoFonteByProjeto(db: any, projetoId: number): Promise<"manual" | "motor"> {
  try {
    const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
      .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, projetoId)).limit(1);
    if (!proj) return "motor";
    const [cfg] = await db.select({ f: ocNumberConfig.previstoFonte })
      .from(ocNumberConfig).where(eq(ocNumberConfig.companyId, proj.companyId)).limit(1);
    return cfg?.f === "manual" ? "manual" : "motor";
  } catch { return "motor"; }
}

// Rev. 2633 — Hardening multi-tenant das mutations do MODO MANUAL (mesma régua do
// salvarAtividades, Rev. 1829): valida que a revisão pertence ao projeto e que o
// projeto pertence à company do usuário (admin/admin_master atravessa). Bloqueia
// IDOR por enumeração de projetoId/revisaoId.
async function assertProjetoRevisaoScope(db: any, ctx: any, projetoId: number, revisaoId: number) {
  const isAdmin = ctx?.user?.role === "admin" || ctx?.user?.role === "admin_master";
  const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
    .from(planejamentoRevisoes).where(eq(planejamentoRevisoes.id, revisaoId)).limit(1);
  if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não encontrada." });
  if (Number(rev.projetoId) !== Number(projetoId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Revisão não pertence ao projeto informado." });
  }
  if (!isAdmin) {
    const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
      .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, projetoId)).limit(1);
    if (!proj || String(proj.companyId) !== String((ctx?.user as any)?.companyId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
    }
  }
}

// Rev. 2984 — Resolução ÚNICA das obras que um usuário pode VER no Planejamento.
// Antes a mesma lógica estava DUPLICADA em `listarProjetos` e `dashboardGeral`, e
// `listarAtividades` usava um compare ESTRITO de `ctx.user.companyId` — o que QUEBRAVA
// o engenheiro de campo cuja empresa-default difere da empresa do projeto: o projeto
// aparecia na lista (listarProjetos casa por obra) mas as atividades vinham vazias
// ("Nenhuma atividade cadastrada"). Agora as 3 procedures compartilham esta fonte.
// Retorna: null = sem restrição (admin/admin_master, vê tudo da empresa); [] = restrito
// sem nenhuma obra (não vê nada); [ids] = restrito a essas obras.
async function resolvePlanAllowedObraIds(
  db: any,
  userId: number,
  role: string | null | undefined,
  email: string | null | undefined,
  companyId: number,
): Promise<number[] | null> {
  if (role === "admin" || role === "admin_master") return null;
  const userResult = await db.execute(sql`SELECT allowed_obra_ids FROM users WHERE id = ${userId}`);
  const userRows: any[] = userResult?.rows ?? userResult ?? [];
  const raw = userRows[0]?.allowed_obra_ids;
  let parsed: number[] = [];
  try { if (raw) parsed = JSON.parse(raw); } catch {}
  if (parsed.length > 0) return parsed;
  const userEmail = email ?? "";
  if (!userEmail) return [];
  const empResult = await db.execute(sql`SELECT id FROM employees WHERE "companyId" = ${companyId} AND email = ${userEmail} AND "deletedAt" IS NULL LIMIT 1`);
  const empRows: any[] = empResult?.rows ?? empResult ?? [];
  if (!empRows.length) return [];
  const employeeId = empRows[0].id;
  const obrasResult = await db.execute(sql`
    SELECT DISTINCT of2."obraId" FROM obra_funcionarios of2
    INNER JOIN obras o ON o.id = of2."obraId" AND o."companyId" = ${companyId} AND o."deletedAt" IS NULL
    WHERE of2."employeeId" = ${employeeId} AND of2."isActive" = 1
  `);
  const obrasRows: any[] = obrasResult?.rows ?? obrasResult ?? [];
  return obrasRows.map((r: any) => r.obraId);
}

export const planejamentoRouter = router({

  // ── Projetos ──────────────────────────────────────────────────────────────
  listarProjetos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedObraIds = await resolvePlanAllowedObraIds(
        db, ctx.user.id, ctx.user.role, ctx.user.email, input.companyId,
      );

      const rows = await db.select({
        id:                    planejamentoProjetos.id,
        companyId:             planejamentoProjetos.companyId,
        obraId:                planejamentoProjetos.obraId,
        orcamentoId:           planejamentoProjetos.orcamentoId,
        nome:                  planejamentoProjetos.nome,
        cliente:               planejamentoProjetos.cliente,
        local:                 planejamentoProjetos.local,
        responsavel:           planejamentoProjetos.responsavel,
        dataInicio:            planejamentoProjetos.dataInicio,
        dataTerminoContratual: planejamentoProjetos.dataTerminoContratual,
        valorContrato:         planejamentoProjetos.valorContrato,
        status:                planejamentoProjetos.status,
        descricao:             planejamentoProjetos.descricao,
        criadoEm:              planejamentoProjetos.criadoEm,
        atualizadoEm:          planejamentoProjetos.atualizadoEm,
        orcamentoTotalVenda:   orcamentos.totalVenda,
        orcamentoValorNegociado: orcamentos.valorNegociado,
      })
        .from(planejamentoProjetos)
        .leftJoin(orcamentos, eq(planejamentoProjetos.orcamentoId, orcamentos.id))
        .where(
          allowedObraIds !== null
            ? and(eq(planejamentoProjetos.companyId, input.companyId), inArray(planejamentoProjetos.obraId, allowedObraIds.length > 0 ? allowedObraIds : [0]))
            : eq(planejamentoProjetos.companyId, input.companyId)
        )
        .orderBy(desc(planejamentoProjetos.criadoEm));
      return rows;
    }),

  criarProjeto: protectedProcedure
    .input(z.object({
      companyId:             z.number(),
      obraId:                z.number().optional(),
      orcamentoId:           z.number().optional(),
      nome:                  z.string(),
      cliente:               z.string().optional(),
      local:                 z.string().optional(),
      responsavel:           z.string().optional(),
      dataInicio:            z.string().optional(),
      dataTerminoContratual: z.string().optional(),
      valorContrato:         z.number().optional(),
      status:                z.string().optional(),
      descricao:             z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      if (!input.obraId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "É obrigatório vincular uma obra ao planejamento.",
        });
      }

      const [orcamentoVinculado] = await db
        .select({
          id: orcamentos.id,
          totalCusto: orcamentos.totalCusto,
          totalVenda: orcamentos.totalVenda,
          tempoObraMeses: orcamentos.tempoObraMeses,
        })
        .from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          sql`${orcamentos.deletedAt} IS NULL`,
        ))
        .limit(1);
      if (!orcamentoVinculado) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não é possível criar um planejamento sem orçamento vinculado. Cadastre primeiro o orçamento da obra.",
        });
      }

      const [existe] = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(
          eq(planejamentoProjetos.companyId, input.companyId),
          eq(planejamentoProjetos.obraId, input.obraId),
        ))
        .limit(1);
      if (existe) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Esta obra já possui um planejamento cadastrado.",
        });
      }

      const orcId = orcamentoVinculado.id;

      const [projeto] = await db.insert(planejamentoProjetos).values({
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        orcamentoId:           orcId,
        nome:                  input.nome,
        cliente:               input.cliente ?? null,
        local:                 input.local ?? null,
        responsavel:           input.responsavel ?? null,
        dataInicio:            input.dataInicio ?? null,
        dataTerminoContratual: input.dataTerminoContratual ?? null,
        valorContrato:         String(input.valorContrato ?? 0),
        status:                input.status ?? "Em andamento",
        descricao:             input.descricao ?? null,
      }).returning();

      const today = new Date().toISOString().split("T")[0];
      const [rev] = await db.insert(planejamentoRevisoes).values({
        projetoId:   projeto.id,
        numero:      0,
        descricao:   "Baseline inicial",
        dataRevisao: today,
        motivo:      "Criação do projeto",
        isBaseline:  true,
        status:      "aprovada",
      }).returning();

      console.log(`[CriarProjeto] Projeto #${projeto.id} criado para obra #${input.obraId} com orçamento #${orcId}. Cronograma vazio — aguardando importação do MS Project.`);

      // Dispara geração automática das previsões mensais no financeiro
      try {
        const { triggerFinancialSync } = await import("../services/financialEventTrigger");
        triggerFinancialSync(input.companyId, input.dataInicio ?? new Date().toISOString().split("T")[0]);
      } catch (_) {}

      return projeto;
    }),

  atualizarProjeto: protectedProcedure
    .input(z.object({
      id:                    z.number(),
      nome:                  z.string().optional(),
      cliente:               z.string().optional(),
      local:                 z.string().optional(),
      responsavel:           z.string().optional(),
      dataInicio:            z.string().optional(),
      dataTerminoContratual: z.string().optional(),
      valorContrato:         z.number().optional(),
      status:                z.string().optional(),
      descricao:             z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const updates: any = { atualizadoEm: new Date() };
      if (data.nome !== undefined)                  updates.nome = data.nome;
      if (data.cliente !== undefined)               updates.cliente = data.cliente;
      if (data.local !== undefined)                 updates.local = data.local;
      if (data.responsavel !== undefined)           updates.responsavel = data.responsavel;
      if (data.dataInicio !== undefined)            updates.dataInicio = data.dataInicio;
      if (data.dataTerminoContratual !== undefined) updates.dataTerminoContratual = data.dataTerminoContratual;
      if (data.valorContrato !== undefined)         updates.valorContrato = String(data.valorContrato);
      if (data.status !== undefined)                updates.status = data.status;
      if (data.descricao !== undefined)             updates.descricao = data.descricao;
      await db.update(planejamentoProjetos).set(updates).where(eq(planejamentoProjetos.id, id));

      // Atualiza previsões mensais no financeiro quando datas/valor mudam
      if (data.dataInicio !== undefined || data.dataTerminoContratual !== undefined || data.valorContrato !== undefined) {
        try {
          const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
            .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, id));
          if (proj) {
            const { triggerFinancialSync } = await import("../services/financialEventTrigger");
            triggerFinancialSync(proj.companyId);
          }
        } catch (_) {}
      }

      return { success: true };
    }),

  excluirProjeto: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos).where(eq(planejamentoAvancos.projetoId, input.id));
      await db.delete(planejamentoAtividades).where(eq(planejamentoAtividades.projetoId, input.id));
      await db.delete(planejamentoRevisoes).where(eq(planejamentoRevisoes.projetoId, input.id));
      await db.delete(planejamentoRefis).where(eq(planejamentoRefis.projetoId, input.id));
      await db.delete(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.id));
      return { success: true };
    }),

  // ── Limpar todas as atividades de uma revisão (excluir cronograma importado) ─
  limparCronograma: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      try {
        // Limpa rastros em tabelas-filhas (sem FK no banco; SQL bruto pra evitar
        // erros caso alguma tabela ainda não exista neste ambiente).
        const cleanup = async (sqlText: string) => {
          try { await db.execute(sql.raw(sqlText)); } catch { /* tabela ausente: ignora */ }
        };
        await cleanup(`DELETE FROM ia_cronograma_alertas WHERE atividade_id IN (SELECT id FROM planejamento_atividades WHERE revisao_id = ${input.revisaoId})`);
        await cleanup(`DELETE FROM planejamento_custos_mo WHERE atividade_id IN (SELECT id FROM planejamento_atividades WHERE revisao_id = ${input.revisaoId})`);
        await cleanup(`DELETE FROM medicao_boletim_itens   WHERE atividade_id IN (SELECT id FROM planejamento_atividades WHERE revisao_id = ${input.revisaoId})`);

        // Apaga apenas os avanços da REVISÃO atual — nunca de outras revisões
        const delAv = await db.delete(planejamentoAvancos)
          .where(eq(planejamentoAvancos.revisaoId, input.revisaoId));
        const delAt = await db.delete(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

        // Rev. 2602 — Ao excluir o cronograma, o PREVISTO daquela revisão deve
        // sumir junto. Sem isso, a curva CAMINHO B (`previsto_semanas_json`) e o
        // snapshot MSP (`calendarioJson`) ficavam no banco e a barra superior
        // "Avanço Físico" seguia exibindo o previsto antigo (ex.: 18,37%) mesmo
        // com 0 atividades. Só limpa quando a curva armazenada PERTENCE à revisão
        // excluída (preserva curvas de outras revisões intactas).
        let previstoLimpo = false;
        try {
          const [projAtual] = await db.select({
            previstoSemanasJson: planejamentoProjetos.previstoSemanasJson,
          }).from(planejamentoProjetos)
            .where(eq(planejamentoProjetos.id, input.projetoId));
          let curvaDaRevisao = false;
          if (projAtual?.previstoSemanasJson) {
            try {
              const snap = JSON.parse(projAtual.previstoSemanasJson as any);
              curvaDaRevisao = Number(snap?.revisaoId) === Number(input.revisaoId);
            } catch { /* json inválido: trata como não pertencente */ }
          }
          if (curvaDaRevisao) {
            await db.update(planejamentoProjetos)
              .set({ previstoSemanasJson: null as any, previstoSemanasGeradoEm: null as any })
              .where(eq(planejamentoProjetos.id, input.projetoId));
            await limparSnapshotMspDoProjeto(db, input.projetoId);
            previstoLimpo = true;
          }
        } catch (e) {
          console.error("[limparCronograma] Falha ao limpar previsto:", e);
        }

        return {
          success: true,
          atividades: (delAt as any)?.rowCount ?? 0,
          avancos:    (delAv as any)?.rowCount ?? 0,
          previstoLimpo,
        };
      } catch (e: any) {
        console.error("[limparCronograma] Falha:", e);
        throw new Error(e?.message ?? "Falha ao excluir cronograma");
      }
    }),

  // ── Detalhe completo do projeto ───────────────────────────────────────────
  getProjetoById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [eq(planejamentoProjetos.id, input.id)];
      if (input.companyId) conditions.push(eq(planejamentoProjetos.companyId, input.companyId));
      const [projeto] = await db.select().from(planejamentoProjetos)
        .where(and(...conditions));
      if (!projeto) throw new Error("Projeto não encontrado");

      const [revisoes, orcamento, obra] = await Promise.all([
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.id))
          .orderBy(asc(planejamentoRevisoes.numero))
          .catch(() => db.execute(
            sql`SELECT id, projeto_id, numero, descricao, data_revisao, motivo, responsavel, aprovado_por, status, observacao, is_baseline, false as consolidado, diferencas, recovery_window_semanas, criado_em FROM planejamento_revisoes WHERE projeto_id = ${input.id} ORDER BY numero ASC`
          ).then((r: any) => Array.isArray(r) ? r : (r?.rows ?? []))),
        projeto.orcamentoId
          ? db.select().from(orcamentos).where(eq(orcamentos.id, projeto.orcamentoId)).then(r => r[0])
          : Promise.resolve(null),
        // Rev. 1662 — Obra vinculada (logos da gerenciadora/cliente + engenheiro responsável)
        // são lidos do cadastro da obra para alimentar a Visão LOTUS sem duplicar dados.
        // Rev. 1791 — empresaLogoUrl (logo da CONSTRUTORA / proponente, ex: FC Engenharia) é
        // lido via LEFT JOIN com `companies.logoUrl` para alimentar a exportação Excel
        // padrão LOTUS (3 logos no cabeçalho: gerenciadora · cliente · construtora).
        projeto.obraId
          ? db.select({
              gerenciadoraNome:    obras.gerenciadoraNome,
              gerenciadoraLogoUrl: obras.gerenciadoraLogoUrl,
              clienteLogoUrl:      obras.clienteLogoUrl,
              empresaLogoUrl:      companies.logoUrl,
              engenheiroResponsavel: obras.responsavel,
            }).from(obras)
              .leftJoin(companies, eq(companies.id, obras.companyId))
              .where(eq(obras.id, projeto.obraId)).then(r => r[0] ?? null)
          : Promise.resolve(null),
      ]);

      // Rev. 2599 — Self-heal da curva PREVISTO (Caminho B): projetos cadastrados
      // antes da Rev. 2533 (ou cujo regenerar pós-transaction falhou por timing
      // das colunas baseline) ficaram com previsto_semanas_json NULL, travando o
      // card "PREVISTO (SEMANA)" no snapshot único da raiz. Regenera UMA vez
      // (UPDATE da própria coluna JSON via função do app — NÃO é ALTER/DROP/DELETE).
      // ALVO = a MESMA revisão que o client trata como ativa (`revisaoAtiva` =
      // última aprovada → 1ª revisão), pois o client gateia a curva por
      // `revisaoId === revisaoAtiva.id`; gerar p/ outra revisão faria a guarda
      // nunca casar. Antes de regenerar, conta folhas com baseline: sem nenhuma,
      // pula (a função gravaria null→null a cada leitura = write churn inútil).
      let previstoSemanasJson = (projeto as any).previstoSemanasJson ?? null;
      let previstoSemanasGeradoEm = (projeto as any).previstoSemanasGeradoEm ?? null;
      // Rev. 2633 — reconcilia a curva com o interruptor global (motor/manual).
      // A curva guarda o marcador `fonte`; curvas antigas (sem marcador) contam
      // como "motor". Se o marcador divergir da fonte global, reconstrói (lazy) —
      // assim alternar o interruptor "simplesmente funciona" no próximo load.
      let curvaFonte: string | null = null;
      try { curvaFonte = previstoSemanasJson ? (JSON.parse(previstoSemanasJson)?.fonte ?? "motor") : null; } catch { curvaFonte = null; }
      const fonteGlobal = await getPrevistoFonteByProjeto(db, input.id);
      const precisaRebuild =
        !previstoSemanasJson ||
        (fonteGlobal === "manual" && curvaFonte !== "manual") ||
        (fonteGlobal === "motor"  && curvaFonte === "manual");
      if (precisaRebuild) {
        const revs = revisoes as any[];
        const aprovadas = revs.filter((r: any) => r.status === "aprovada");
        const alvo = aprovadas[aprovadas.length - 1] ?? revs[0];
        if (alvo?.id) {
          try {
            let res: { semanas: number } | null = null;
            if (fonteGlobal === "manual") {
              res = await regenerarPrevistoManual(db, input.id, alvo.id);
            } else {
              const [cnt] = await db.select({ n: sql<number>`count(*)::int` })
                .from(planejamentoAtividades)
                .where(and(
                  eq(planejamentoAtividades.revisaoId, alvo.id),
                  isNotNull(planejamentoAtividades.baselineStart),
                  isNotNull(planejamentoAtividades.baselineFinish),
                ));
              if ((cnt?.n ?? 0) > 0) {
                res = await regenerarPrevistoSemanasCaminhoB(db, input.id, alvo.id);
              } else {
                // Motor não consegue reconstruir (zero folhas com baseline). Se a
                // curva persistida ainda é "manual", ela está OBSOLETA (a fonte
                // global virou motor) — limpa pra a tela cair no "—" em vez de
                // mostrar uma curva manual fantasma (achado code review).
                if (curvaFonte === "manual") {
                  await db.update(planejamentoProjetos)
                    .set({ previstoSemanasJson: null as any, previstoSemanasGeradoEm: null as any })
                    .where(eq(planejamentoProjetos.id, input.id));
                }
                res = null;
              }
            }
            // Relê o estado pós-rebuild (a curva pode ter sido gerada OU zerada).
            const [fresh] = await db.select({
              j: planejamentoProjetos.previstoSemanasJson,
              g: planejamentoProjetos.previstoSemanasGeradoEm,
            }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.id)).limit(1);
            if (fresh) {
              previstoSemanasJson = fresh.j ?? null;
              previstoSemanasGeradoEm = fresh.g ?? null;
            }
            void res;
          } catch (e: any) {
            console.error(`[Previsto self-heal] projeto ${input.id}:`, e?.message || e);
          }
        }
      }

      return { ...projeto, previstoSemanasJson, previstoSemanasGeradoEm, revisoes, orcamento, obra };
    }),

  // ── Rev. 2633 — MODO MANUAL do "% Previsto" ─────────────────────────────────
  // Lista os uploads semanais já gravados (1 XML por semana).
  getPrevistoManual: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      await assertProjetoRevisaoScope(db, ctx, input.projetoId, input.revisaoId);
      const [proj] = await db.select({ j: planejamentoProjetos.previstoManualJson })
        .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
      let manual: any = null;
      try { manual = proj?.j ? JSON.parse(proj.j) : null; } catch { manual = null; }
      const sem = (manual && manual.revisaoId === input.revisaoId && manual.semanas) ? manual.semanas : {};
      const semanas = Object.keys(sem).sort().map((d) => ({
        statusDate: d,
        raiz: sem[d]?.raiz ?? null,
        atividades: sem[d]?.porAtividadeId ? Object.keys(sem[d].porAtividadeId).length : 0,
        uploadedEm: sem[d]?.uploadedEm ?? null,
        arquivo: sem[d]?.arquivo ?? null,
      }));
      return { revisaoId: input.revisaoId, semanas };
    }),

  // Grava (ou substitui) 1 upload semanal e reconstrói a curva.
  salvarPrevistoManualSemana: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      revisaoId:  z.number(),
      statusDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      raizPct:    z.number().nullable().optional(),
      itens:      z.array(z.object({ mspUid: z.string(), pct: z.number() })).default([]),
      arquivo:    z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertProjetoRevisaoScope(db, ctx, input.projetoId, input.revisaoId);
      // Resolve mspUid → atividadeId (chave estável dentro da revisão).
      const ativs = await db.select({ id: planejamentoAtividades.id, mspUid: planejamentoAtividades.mspUid })
        .from(planejamentoAtividades).where(eq(planejamentoAtividades.revisaoId, input.revisaoId));
      const uidToId = new Map<string, number>();
      for (const a of ativs as any[]) if (a.mspUid) uidToId.set(String(a.mspUid), a.id);
      const porAtividadeId: Record<string, number> = {};
      let casados = 0;
      for (const it of input.itens) {
        const id = uidToId.get(String(it.mspUid));
        if (id != null) { porAtividadeId[String(id)] = Math.max(0, Math.min(100, it.pct)); casados++; }
      }
      // Atualiza previsto_manual_json (reset se mudou a revisão).
      const [proj] = await db.select({ j: planejamentoProjetos.previstoManualJson })
        .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
      let manual: any = null;
      try { manual = proj?.j ? JSON.parse(proj.j) : null; } catch { manual = null; }
      if (!manual || manual.revisaoId !== input.revisaoId) manual = { revisaoId: input.revisaoId, semanas: {} };
      if (!manual.semanas) manual.semanas = {};
      manual.semanas[input.statusDate] = {
        raiz: input.raizPct ?? null,
        porAtividadeId,
        uploadedEm: new Date().toISOString(),
        arquivo: input.arquivo ?? null,
      };
      await db.update(planejamentoProjetos)
        .set({ previstoManualJson: JSON.stringify(manual) })
        .where(eq(planejamentoProjetos.id, input.projetoId));
      // Só reconstrói a curva visível se a fonte global estiver em MANUAL — assim
      // o upload não sobrescreve a curva do motor quando a empresa ainda está em
      // modo "motor". Ao alternar p/ manual, o self-heal do getProjeto reconstrói.
      const fonte = await getPrevistoFonteByProjeto(db, input.projetoId);
      let semanasGeradas = 0;
      if (fonte === "manual") {
        const res = await regenerarPrevistoManual(db, input.projetoId, input.revisaoId);
        semanasGeradas = res?.semanas ?? 0;
      }
      return { ok: true, aplicado: fonte === "manual", fonte, casados, total: input.itens.length, semanas: semanasGeradas };
    }),

  // Remove 1 upload semanal e reconstrói a curva.
  limparPrevistoManualSemana: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number(), statusDate: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertProjetoRevisaoScope(db, ctx, input.projetoId, input.revisaoId);
      const [proj] = await db.select({ j: planejamentoProjetos.previstoManualJson })
        .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
      let manual: any = null;
      try { manual = proj?.j ? JSON.parse(proj.j) : null; } catch { manual = null; }
      if (manual?.semanas && manual.revisaoId === input.revisaoId) {
        delete manual.semanas[input.statusDate];
        await db.update(planejamentoProjetos)
          .set({ previstoManualJson: JSON.stringify(manual) })
          .where(eq(planejamentoProjetos.id, input.projetoId));
      }
      const fonte = await getPrevistoFonteByProjeto(db, input.projetoId);
      let semanasGeradas = 0;
      if (fonte === "manual") {
        const res = await regenerarPrevistoManual(db, input.projetoId, input.revisaoId);
        semanasGeradas = res?.semanas ?? 0;
      }
      return { ok: true, aplicado: fonte === "manual", semanas: semanasGeradas };
    }),

  // ── Revisões ──────────────────────────────────────────────────────────────
  criarRevisao: protectedProcedure
    .input(z.object({
      projetoId:        z.number(),
      motivo:           z.string(),
      responsavel:      z.string().optional(),
      dataRevisao:      z.string(),
      observacao:       z.string().optional(),
      copiarAtividades: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existentes = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.numero));
      const novoNumero = existentes.length > 0 ? (existentes[0].numero ?? 0) + 1 : 1;

      const [revisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:   input.projetoId,
        numero:      novoNumero,
        descricao:   `Rev. ${String(novoNumero).padStart(2, "0")}`,
        dataRevisao: input.dataRevisao,
        motivo:      input.motivo,
        responsavel: input.responsavel ?? null,
        observacao:  input.observacao ?? null,
        isBaseline:  false,
        status:      "pendente",
      }).returning();

      if (input.copiarAtividades) {
        const revisaoAnterior = existentes.find(r => r.status === "aprovada");
        if (revisaoAnterior) {
          const atividades = await db.select().from(planejamentoAtividades)
            .where(eq(planejamentoAtividades.revisaoId, revisaoAnterior.id));
          if (atividades.length > 0) {
            await db.insert(planejamentoAtividades).values(
              atividades.map(a => ({
                revisaoId:           revisao.id,
                projetoId:           input.projetoId,
                eapCodigo:           a.eapCodigo,
                nome:                a.nome,
                nivel:               a.nivel,
                dataInicio:          a.dataInicio,
                dataFim:             a.dataFim,
                duracaoDias:         a.duracaoDias,
                predecessora:        a.predecessora,
                pesoFinanceiro:      a.pesoFinanceiro,
                recursoPrincipal:    a.recursoPrincipal,
                quantidadePlanejada: a.quantidadePlanejada,
                unidade:             a.unidade,
                ordem:               a.ordem,
                isGrupo:             a.isGrupo,
                isIndireta:          a.isIndireta ?? false,
                isMarco:             a.isMarco ?? false,
                isExterna:           a.isExterna ?? false,
                externaResponsavel:  a.externaResponsavel ?? null,
                disabled:            a.disabled ?? false,
              }))
            );
          }
        }
      }

      return revisao;
    }),

  aprovarRevisao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadoPor: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
        .from(planejamentoRevisoes).where(eq(planejamentoRevisoes.id, input.id)).limit(1);
      await db.update(planejamentoRevisoes)
        .set({ status: "aprovada", aprovadoPor: input.aprovadoPor ?? null })
        .where(eq(planejamentoRevisoes.id, input.id));

      // ─── REGRA DE OURO: Aprovação de revisão → atualiza cronograma financeiro ──
      // Quando uma revisão é aprovada, o financeiro deve refletir o novo baseline
      // imediatamente, removendo projeções obsoletas e inserindo as novas.
      const companyId = (ctx as any).user?.companyId;
      if (companyId && rev?.projetoId) {
        setImmediate(() => {
          importAtividadesCronogramaToFinancial(Number(companyId), undefined, { projetoId: rev.projetoId! })
            .then(n => console.log(`[GoldenRule][aprovarRevisao] revisao=${input.id} → ${n} entradas sync`))
            .catch(e => console.error("[GoldenRule][aprovarRevisao]", e));
        });
      }

      return { success: true };
    }),

  cancelarRevisao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem cancelar revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.isBaseline) throw new Error("O Baseline não pode ser cancelado.");
      await db.update(planejamentoRevisoes)
        .set({ status: "cancelada" })
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  reativarRevisao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadoPor: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem reativar revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.status !== "cancelada") throw new Error("Somente revisões canceladas podem ser reativadas.");
      if (rev.projetoId && ctx.user.role !== "admin_master") {
        const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, rev.projetoId));
        if (proj && String(proj.companyId) !== String(ctx.user.companyId)) throw new Error("Sem permissão para esta revisão.");
      }
      await db.update(planejamentoRevisoes)
        .set({ status: "aprovada", aprovadoPor: input.aprovadoPor ?? ctx.user.name ?? null })
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  editarRevisao: protectedProcedure
    .input(z.object({
      id: z.number(),
      motivo: z.string().optional(),
      responsavel: z.string().optional(),
      dataRevisao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").optional(),
      observacao: z.string().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem editar revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.isBaseline) throw new Error("O Baseline não pode ser editado.");
      if (rev.projetoId && ctx.user.role !== "admin_master") {
        const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, rev.projetoId));
        if (proj && String(proj.companyId) !== String(ctx.user.companyId))
          throw new Error("Sem permissão para editar esta revisão.");
      }
      const updates: Record<string, any> = {};
      if (input.motivo !== undefined) updates.motivo = input.motivo;
      if (input.responsavel !== undefined) updates.responsavel = input.responsavel;
      if (input.dataRevisao !== undefined) updates.dataRevisao = input.dataRevisao;
      if (input.observacao !== undefined) updates.observacao = input.observacao;
      if (input.descricao !== undefined) updates.descricao = input.descricao;
      if (Object.keys(updates).length === 0) return { success: true };
      await db.update(planejamentoRevisoes).set(updates)
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  excluirRevisao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new Error("Apenas administradores podem excluir revisões.");
      const db = await getDb();
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      if (!rev) throw new Error("Revisão não encontrada.");
      if (rev.isBaseline) throw new Error("O Baseline não pode ser excluído.");
      if (rev.projetoId && ctx.user.role !== "admin_master") {
        const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, rev.projetoId));
        if (proj && String(proj.companyId) !== String(ctx.user.companyId))
          throw new Error("Sem permissão para excluir esta revisão.");
      }

      // Garante que só a revisão de maior número pode ser excluída
      const todasNaoProjeto = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, rev.projetoId!))
        .orderBy(desc(planejamentoRevisoes.numero));
      const naoBaselines = todasNaoProjeto.filter(r => !r.isBaseline);
      if (!naoBaselines.length || naoBaselines[0].id !== input.id) {
        throw new Error("Apenas a revisão mais recente pode ser excluída. Exclua em ordem decrescente.");
      }

      // Apaga avanços da revisão (evita registros orfãos)
      await db.delete(planejamentoAvancos)
        .where(eq(planejamentoAvancos.revisaoId, input.id));
      await db.delete(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.id));
      await db.delete(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.id));
      return { success: true };
    }),

  // ── Transferir avanços da revisão anterior para nova revisão (herança de progresso) ─
  transferirAvancosParaNovaRevisao: protectedProcedure
    .input(z.object({ novaRevisaoId: z.number(), projetoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [novaRevisao] = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.novaRevisaoId));
      if (!novaRevisao) return { transferidas: 0 };

      // Revisão aprovada imediatamente anterior (número menor, não cancelada)
      const anteriores = await db.select().from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.projetoId, input.projetoId),
          lt(planejamentoRevisoes.numero, novaRevisao.numero!),
          ne(planejamentoRevisoes.status, "cancelada"),
        ))
        .orderBy(desc(planejamentoRevisoes.numero));

      // ── Atividades das duas revisões (para diff + transferência de avanços) ──
      const [atvsNova, atvsAnterior] = await Promise.all([
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.novaRevisaoId)),
        anteriores.length
          ? db.select().from(planejamentoAtividades)
              .where(eq(planejamentoAtividades.revisaoId, anteriores[0].id))
          : Promise.resolve([]),
      ]);

      // ── Diff automático de alterações entre revisões ──────────────────────
      type DiffItem  = { eapCodigo: string; nome: string };
      type DiffChange = { campo: string; de: string | null; para: string | null };
      type DiffAlterada = DiffItem & { mudancas: DiffChange[] };

      const adicionadas: DiffItem[] = [];
      const removidas:   DiffItem[] = [];
      const alteradas:   DiffAlterada[] = [];

      if (atvsAnterior.length > 0) {
        const mapAnt = new Map(atvsAnterior.map(a => [a.eapCodigo ?? `_${a.id}`, a]));
        const mapNova = new Map(atvsNova.map(a => [a.eapCodigo ?? `_${a.id}`, a]));

        for (const [eap, ant] of mapAnt.entries()) {
          if (!mapNova.has(eap)) removidas.push({ eapCodigo: eap, nome: ant.nome });
        }
        for (const [eap, nova] of mapNova.entries()) {
          if (!mapAnt.has(eap)) {
            adicionadas.push({ eapCodigo: eap, nome: nova.nome });
          } else {
            const ant = mapAnt.get(eap)!;
            const mudancas: DiffChange[] = [];
            if (ant.nome !== nova.nome)
              mudancas.push({ campo: "Nome", de: ant.nome, para: nova.nome });
            if (ant.dataInicio !== nova.dataInicio)
              mudancas.push({ campo: "Início", de: ant.dataInicio, para: nova.dataInicio });
            if (ant.dataFim !== nova.dataFim)
              mudancas.push({ campo: "Fim", de: ant.dataFim, para: nova.dataFim });
            if (ant.duracaoDias !== nova.duracaoDias)
              mudancas.push({ campo: "Duração (dias)", de: String(ant.duracaoDias ?? ""), para: String(nova.duracaoDias ?? "") });
            if (String(ant.pesoFinanceiro ?? "0") !== String(nova.pesoFinanceiro ?? "0"))
              mudancas.push({ campo: "Peso financeiro", de: ant.pesoFinanceiro, para: nova.pesoFinanceiro });
            if (mudancas.length) alteradas.push({ eapCodigo: eap, nome: nova.nome, mudancas });
          }
        }

        const diff = { adicionadas, removidas, alteradas };
        await db.update(planejamentoRevisoes)
          .set({ diferencas: JSON.stringify(diff) })
          .where(eq(planejamentoRevisoes.id, input.novaRevisaoId));
      }

      // ── Transferência de flags (isIndireta, isMarco, isExterna, disabled) ───
      // Rev. 1641 — isExterna + externaResponsavel também são preservados na
      // próxima revisão (não faz sentido perder a marcação de "concessionária").
      if (atvsAnterior.length > 0) {
        type FlagSet = { isIndireta: boolean; isMarco: boolean; isExterna: boolean; externaResponsavel: string | null; disabled: boolean };
        const mapAntFlags = new Map<string, FlagSet>();
        for (const a of atvsAnterior) {
          if (a.eapCodigo && (a.isIndireta || a.isMarco || a.isExterna || a.disabled || a.externaResponsavel)) {
            mapAntFlags.set(a.eapCodigo, {
              isIndireta:         !!a.isIndireta,
              isMarco:            !!a.isMarco,
              isExterna:          !!a.isExterna,
              externaResponsavel: a.externaResponsavel ?? null,
              disabled:           !!a.disabled,
            });
          }
        }
        if (mapAntFlags.size > 0) {
          const updates: { id: number; flags: Partial<FlagSet> }[] = [];
          for (const nova of atvsNova) {
            if (nova.eapCodigo && mapAntFlags.has(nova.eapCodigo)) {
              const flags = mapAntFlags.get(nova.eapCodigo)!;
              const needsUpdate = (flags.isIndireta && !nova.isIndireta) ||
                                  (flags.isMarco && !nova.isMarco) ||
                                  (flags.isExterna && !nova.isExterna) ||
                                  (flags.externaResponsavel && !nova.externaResponsavel) ||
                                  (flags.disabled && !nova.disabled);
              if (needsUpdate) {
                updates.push({ id: nova.id, flags });
              }
            }
          }
          for (const upd of updates) {
            const setObj: Record<string, any> = {};
            if (upd.flags.isIndireta)         setObj.isIndireta = true;
            if (upd.flags.isMarco)            setObj.isMarco = true;
            if (upd.flags.isExterna)          setObj.isExterna = true;
            if (upd.flags.externaResponsavel) setObj.externaResponsavel = upd.flags.externaResponsavel;
            if (upd.flags.disabled)           setObj.disabled = true;
            await db.update(planejamentoAtividades)
              .set(setObj as any)
              .where(eq(planejamentoAtividades.id, upd.id));
          }
        }
      }

      // ── Transferência de avanços ──────────────────────────────────────────
      if (!anteriores.length) return { transferidas: 0 };
      const revisaoAnterior = anteriores[0];

      const avancosAnteriores = await db.select().from(planejamentoAvancos)
        .where(eq(planejamentoAvancos.revisaoId, revisaoAnterior.id))
        .orderBy(asc(planejamentoAvancos.semana));
      if (!avancosAnteriores.length) return { transferidas: 0 };

      const eapToIdAnt = new Map<string, number>();
      for (const a of atvsAnterior) if (a.eapCodigo) eapToIdAnt.set(a.eapCodigo, a.id);
      const eapToIdNovo = new Map<string, number>();
      for (const a of atvsNova) if (a.eapCodigo) eapToIdNovo.set(a.eapCodigo, a.id);

      const idAntToIdNovo = new Map<number, number>();
      for (const [eap, idAnt] of eapToIdAnt.entries()) {
        const idNovo = eapToIdNovo.get(eap);
        if (idNovo) idAntToIdNovo.set(idAnt, idNovo);
      }

      const novosAvancos = avancosAnteriores
        .filter(av => idAntToIdNovo.has(av.atividadeId))
        .map(av => ({
          projetoId:           av.projetoId,
          atividadeId:         idAntToIdNovo.get(av.atividadeId)!,
          revisaoId:           input.novaRevisaoId,
          semana:              av.semana,
          percentualAcumulado: av.percentualAcumulado,
          percentualSemanal:   av.percentualSemanal,
          observacao:          av.observacao,
          criadoPor:           av.criadoPor,
        }));

      if (novosAvancos.length) {
        await db.transaction(async (tx) => {
          const chunkSize = 200;
          for (let i = 0; i < novosAvancos.length; i += chunkSize) {
            await tx.insert(planejamentoAvancos).values(novosAvancos.slice(i, i + chunkSize));
          }
        });
      }
      return { transferidas: novosAvancos.length };
    }),

  // ── Atividades ────────────────────────────────────────────────────────────

  listarAtividades: protectedProcedure
    .input(z.object({ revisaoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId))
        .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));

      // Rev. 1666/1818/1891 — UM ÚNICO lookup do projeto traz (a) cutoff PMBOK
      // p/ limitar realFim derivado; (b) companyId p/ guard multi-tenant; (c)
      // companyId p/ resolverResponsaveisBatch logo abaixo.
      // Rev. 1891 — BUG FIX: planejamento_atividades NÃO tem company_id —
      // `rows[0].companyId` era SEMPRE undefined. Resultado: `if (projetoId
      // && companyId)` em L795 nunca disparava e `respMap` ficava vazio →
      // PSEM exibia placeholder "FC" em vez do responsável digitado no
      // cronograma (responsavelLotus). Buscar companyId via planejamento_projetos.
      let cutoffISO: string | null = null;
      let projetoCompanyId: number | null = null;
      let projetoObraId: number | null = null;
      let projetoIdAtual: number | null = null;
      if (rows.length > 0) {
        const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
          .from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.id, input.revisaoId))
          .limit(1);
        if (rev?.projetoId) {
          projetoIdAtual = Number(rev.projetoId);
          const [proj] = await db.select({
            dataCorteAtual: planejamentoProjetos.dataCorteAtual,
            companyId:      planejamentoProjetos.companyId,
            obraId:         planejamentoProjetos.obraId,
          })
            .from(planejamentoProjetos)
            .where(eq(planejamentoProjetos.id, rev.projetoId))
            .limit(1);
          if (proj?.dataCorteAtual) cutoffISO = toDateStr(proj.dataCorteAtual as any);
          if (proj?.companyId != null) projetoCompanyId = Number(proj.companyId);
          if (proj?.obraId != null) projetoObraId = Number(proj.obraId);
        }

        // Rev. 1818/1891/2984 — Hardening multi-tenant (bloqueia IDOR via enumeração
        // de revisaoId). admin/admin_master atravessa. FAIL-CLOSED se projetoCompanyId
        // não pôde ser resolvido (dado inconsistente, revisão órfã) → bloqueia não-admin.
        // Rev. 2984 — BUG FIX: o compare ESTRITO `projetoCompanyId !== ctx.user.companyId`
        // quebrava o engenheiro de campo cuja empresa-default difere da empresa do projeto
        // (projeto aparecia na lista, mas "Nenhuma atividade cadastrada"). Agora usa a MESMA
        // resolução por OBRA de `listarProjetos`/`dashboardGeral` (`resolvePlanAllowedObraIds`):
        // se o usuário é restrito, a obra do projeto precisa estar nas suas obras permitidas.
        const role = (ctx.user as any).role;
        const isAdmin = role === "admin" || role === "admin_master";
        if (!isAdmin) {
          if (projetoCompanyId == null) {
            console.warn(`[listarAtividades] FORBIDDEN (fail-closed) revisaoId=${input.revisaoId} projCompany=null role=${role}`);
            throw new Error("Sem permissão para esta revisão.");
          }
          const allowedObraIds = await resolvePlanAllowedObraIds(
            db, ctx.user.id, role, ctx.user.email, projetoCompanyId,
          );
          if (allowedObraIds !== null) {
            if (projetoObraId == null || !allowedObraIds.includes(Number(projetoObraId))) {
              console.warn(`[listarAtividades] FORBIDDEN revisaoId=${input.revisaoId} projObra=${projetoObraId} allowed=[${allowedObraIds.join(",")}] role=${role}`);
              throw new Error("Sem permissão para esta revisão.");
            }
          }
        }
      }

      // Rev. 1662 — Padrão LOTUS: deriva Real Início/Real Fim dos avanços
      // já gravados via "Avanço Semanal" (FC), para que o LOTUS não exija
      // redigitação. Regra:
      //   • Real Início = explícito ?? (existe avanço > 0 ? dataInicio planejada : null)
      //   • Real Fim    = explícito ?? (max acumulado ≥ 100 ? menor(dataFim plan, semana do 100%) : null)
      // O explícito (`dataInicioReal/FimReal`) sempre prevalece.
      const ids = rows.map(r => r.id);
      const avMap = new Map<number, { primeira: string | null; concluiuEm: string | null; ultima: string | null }>();
      if (ids.length > 0) {
        const avs = await db.select({
          atividadeId:         planejamentoAvancos.atividadeId,
          semana:              planejamentoAvancos.semana,
          percentualAcumulado: planejamentoAvancos.percentualAcumulado,
          percentualSemanal:   planejamentoAvancos.percentualSemanal,
        })
          .from(planejamentoAvancos)
          .where(inArray(planejamentoAvancos.atividadeId, ids))
          .orderBy(asc(planejamentoAvancos.atividadeId), asc(planejamentoAvancos.semana));
        for (const a of avs) {
          const acum = parseFloat(String(a.percentualAcumulado ?? "0")) || 0;
          const sem  = parseFloat(String(a.percentualSemanal   ?? "0")) || 0;
          const cur  = avMap.get(a.atividadeId) ?? { primeira: null, concluiuEm: null, ultima: null };
          const semISO = toDateStr(a.semana as any);
          if (acum > 0 || sem > 0) {
            if (cur.primeira == null) cur.primeira = semISO;
            cur.ultima = semISO; // varrendo em ordem ASC → ultima sobe a cada iteração
          }
          if (cur.concluiuEm == null && acum >= 100) cur.concluiuEm = semISO;
          avMap.set(a.atividadeId, cur);
        }
      }
      // Rev. 1817 — Resolve em BATCH o Responsável de cada atividade
      // (override manual → contrato terceiro vinculado → FC). Fonte única
      // pra LOTUS, Padrão FC, Avanço Semanal, REFIS e exportações.
      let respMap = new Map<number, ResponsavelInfo>();
      try {
        // Rev. 1891 — usa projetoIdAtual + projetoCompanyId obtidos via lookup
        // de planejamento_projetos (planejamento_atividades não tem company_id).
        // Fallback p/ rows[0].projetoId garante compat caso o lookup acima falhe.
        const projetoId = projetoIdAtual ?? ((rows[0] as any)?.projetoId as number | undefined);
        const companyId = projetoCompanyId ?? undefined;
        if (projetoId && companyId) {
          respMap = await resolverResponsaveisBatch(
            db,
            rows.map(r => ({
              id: r.id,
              responsavelLotus: (r as any).responsavelLotus ?? null,
              isExterna: (r as any).isExterna ?? null,
              externaResponsavel: (r as any).externaResponsavel ?? null,
            })),
            projetoId,
            companyId,
          );
        } else {
          console.warn(`[listarAtividades resolverResponsaveis] SKIP — projetoId=${projetoId} companyId=${companyId} (revisaoId=${input.revisaoId})`);
        }
      } catch (e: any) {
        console.error("[listarAtividades resolverResponsaveis]", e?.message || e);
      }

      return rows.map(r => {
        const inicioPlan = r.dataInicio ? toDateStr(r.dataInicio) : null;
        const fimPlan    = r.dataFim    ? toDateStr(r.dataFim)    : null;
        const av = avMap.get(r.id);
        const realIniDigitado = r.dataInicioReal ? toDateStr(r.dataInicioReal) : null;
        const realFimDigitado = r.dataFimReal    ? toDateStr(r.dataFimReal)    : null;
        // Real Fim derivado: prioriza a semana em que atingiu 100% (concluído).
        // Caso contrário usa a ÚLTIMA semana COM avanço — atividade em
        // andamento mostra "até onde a obra chegou".
        // Rev. 1664.1 — `semana` no banco é Segunda-feira (início da semana).
        // Usar Mon como Real Fim trunca a janela para 1 dia e o LOTUS pintava
        // só a Segunda. Estende para o DOMINGO da semana (mon+6) para que a
        // janela cubra a semana inteira de execução. Limita pelo Fim planejado
        // (uma atividade prevista p/ 04-07 que concluiu na semana 04-10 deve
        // mostrar realFim=07, não 10) — assim o realizado não cria envelope
        // que o previsto não cobre.
        const endOfWeek = (mondayISO: string): string => {
          const [y, m, d] = mondayISO.split("-").map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d + 6));
          return dt.toISOString().slice(0, 10);
        };
        const realFimDerivado = (() => {
          const baseSem = av?.concluiuEm ?? av?.ultima ?? null;
          if (!baseSem) return null;
          let fim = endOfWeek(baseSem);
          // Cap pelo Fim planejado: realizado não cria envelope além do previsto
          if (fimPlan && fim > fimPlan) fim = fimPlan;
          // Rev. 1666 — Cap pelo cutoff oficial (status date PMBOK): realizado
          // nunca passa da data oficial de medição, evitando "verde no futuro".
          if (cutoffISO && fim > cutoffISO) fim = cutoffISO;
          return fim;
        })();
        return {
          ...r,
          dataInicio:       inicioPlan,
          dataFim:          fimPlan,
          dataInicioReal:   realIniDigitado ?? (av?.primeira ? inicioPlan : null),
          dataFimReal:      realFimDigitado ?? realFimDerivado,
          responsavelLotus: (r as any).responsavelLotus ?? null,
          // Rev. 1817 — Responsável resolvido (FONTE ÚNICA).
          responsavel:      respMap.get(r.id) ?? null,
        };
      });
    }),

  /**
   * Rev. 1817 — KPI de Responsáveis por projeto.
   *
   * Devolve o total de atividades (e o peso financeiro acumulado em %)
   * agrupado por Responsável resolvido. Usado pelo card compacto no topo
   * do Padrão FC e como base do filtro multi-select. Sempre EXCLUI
   * grupos / marcos / disabled — a unidade contável é a mesma que entra
   * no PV/EV.
   */
  kpiResponsavelPorProjeto: protectedProcedure
    .input(z.object({ revisaoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));
      if (!rows.length) return [] as Array<{
        chave: string;
        tipo: string;
        label: string;
        labelCurto: string;
        count: number;
        pesoPct: number;
      }>;
      const projetoId = (rows[0] as any).projetoId as number;
      // Rev. 1891 — BUG FIX: planejamento_atividades NÃO tem company_id.
      // Buscar via planejamento_projetos (mesma correção da listarAtividades).
      // Sem isso, o guard multi-tenant abaixo sempre bloqueava não-admins e o
      // resolverResponsaveisBatch recebia companyId=undefined → respMap vazio.
      const [projInfo] = await db.select({ companyId: planejamentoProjetos.companyId, obraId: planejamentoProjetos.obraId })
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, projetoId))
        .limit(1);
      const companyId = projInfo?.companyId != null ? Number(projInfo.companyId) : null;
      const projObraId = projInfo?.obraId != null ? Number(projInfo.obraId) : null;
      // Rev. 1817/2984 — Hardening multi-tenant por OBRA (leitura). admin/admin_master
      // atravessa. Rev. 2984 — antes usava compare ESTRITO de `ctx.user.companyId`, que
      // negava esta KPI ao engenheiro de campo cuja empresa-default difere da empresa do
      // projeto. Agora alinha com `resolvePlanAllowedObraIds` (mesma régua do Catálogo).
      const role = (ctx.user as any).role;
      const isAdmin = role === "admin" || role === "admin_master";
      if (!isAdmin && companyId != null) {
        const allowedObraIds = await resolvePlanAllowedObraIds(
          db, ctx.user.id, role, ctx.user.email, companyId,
        );
        if (allowedObraIds !== null && (projObraId == null || !allowedObraIds.includes(projObraId))) {
          console.warn(`[kpiResponsavelPorProjeto] FORBIDDEN revisaoId=${input.revisaoId} projObra=${projObraId} allowed=[${allowedObraIds.join(",")}] role=${role}`);
          throw new Error("Sem permissão para esta revisão.");
        }
      }
      if (companyId == null) {
        console.warn(`[kpiResponsavelPorProjeto] companyId não encontrado p/ projetoId=${projetoId} (revisaoId=${input.revisaoId})`);
        return [];
      }
      const respMap = await resolverResponsaveisBatch(
        db,
        rows.map(r => ({
          id: r.id,
          responsavelLotus: (r as any).responsavelLotus ?? null,
          isExterna: (r as any).isExterna ?? null,
          externaResponsavel: (r as any).externaResponsavel ?? null,
        })),
        projetoId,
        companyId,
      );
      // Universo: mesmas folhas que entram no PV/EV (sem grupo/marco/disabled).
      const folhas = rows.filter((r: any) => !r.isGrupo && !r.isMarco && !r.disabled);
      const totalPeso = folhas.reduce((s: number, r: any) => s + (parseFloat(String(r.pesoFinanceiro ?? "0")) || 0), 0);
      type Acc = { chave: string; tipo: string; label: string; labelCurto: string; count: number; peso: number };
      const acc = new Map<string, Acc>();
      for (const r of folhas) {
        const info = respMap.get(r.id) ?? { tipo: "fc", label: "FC ENGENHARIA", labelCurto: "FC", fonteRef: null };
        // Chave de agregação: contrato → "C{id}"; externa → "E:{label}"; manual → "M:{label}"; fc → "FC".
        const chave =
          info.tipo === "contrato_terceiro" && info.fonteRef?.contratoId ? `C${info.fonteRef.contratoId}` :
          info.tipo === "externa"   ? `E:${info.label.toUpperCase()}` :
          info.tipo === "manual"    ? `M:${info.label.toUpperCase()}` :
          "FC";
        const cur = acc.get(chave) ?? { chave, tipo: info.tipo, label: info.label, labelCurto: info.labelCurto, count: 0, peso: 0 };
        cur.count += 1;
        cur.peso  += parseFloat(String((r as any).pesoFinanceiro ?? "0")) || 0;
        acc.set(chave, cur);
      }
      const arr = Array.from(acc.values()).map(v => ({
        chave: v.chave,
        tipo: v.tipo,
        label: v.label,
        labelCurto: v.labelCurto,
        count: v.count,
        pesoPct: totalPeso > 0 ? (v.peso / totalPeso) * 100 : 0,
      }));
      // Ordena: maior peso primeiro; FC sempre por último (visualmente fica como "default").
      arr.sort((a, b) => {
        if (a.tipo === "fc" && b.tipo !== "fc") return 1;
        if (b.tipo === "fc" && a.tipo !== "fc") return -1;
        return b.pesoPct - a.pesoPct;
      });
      return arr;
    }),

  // Rev. 1662 — Datas reais por atividade (visão LOTUS).
  // Fonte única: o que o engenheiro digita aqui é o mesmo dado lido pelo
  // restante do ERP (não cria espelho fantasma).
  // Rev. 1662.1 — Hardening contra IDOR: exige companyId e valida que a
  // atividade pertence a um projeto da MESMA empresa antes de gravar.
  /**
   * Rev. 1875 — Toggle granular de "fim de semana trabalhado" por atividade.
   *
   * O engenheiro clica num quadradinho de SÁB/DOM da linha da atividade na
   * Programação Semanal LOTUS para marcar/desmarcar aquele dia como trabalhado
   * SÓ para essa atividade (não muda o calendário do projeto). O campo
   * `dias_trabalhados_extras` armazena um JSON array de datas ISO; toggle
   * insere se ausente, remove se presente. Limite defensivo de 366 datas
   * (1 ano de atividades em fds — improvável atingir).
   *
   * O `faixasCelula` no cliente trata essas datas como `ehUtil=true`, o que
   * habilita pintura do PREVISTO/REAL naquele dia mesmo com o calendário MSP
   * marcando-o como folga.
   */
  toggleDiaTrabalhadoExtra: protectedProcedure
    .input(z.object({
      atividadeId: z.number(),
      companyId:   z.number(),
      data:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar em formato YYYY-MM-DD"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db
        .select({
          projetoCompany: planejamentoProjetos.companyId,
          atual:          planejamentoAtividades.diasTrabalhadosExtras,
        })
        .from(planejamentoAtividades)
        .innerJoin(planejamentoProjetos, eq(planejamentoProjetos.id, planejamentoAtividades.projetoId))
        .where(eq(planejamentoAtividades.id, input.atividadeId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Atividade não encontrada" });
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      const userCompany = (ctx.user as any).companyId;
      if (!isAdmin && String(row.projetoCompany) !== String(userCompany)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Atividade fora da sua empresa" });
      }
      let lista: string[] = [];
      try { lista = row.atual ? JSON.parse(row.atual) : []; if (!Array.isArray(lista)) lista = []; } catch { lista = []; }
      lista = lista.filter((s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s));
      const idx = lista.indexOf(input.data);
      if (idx >= 0) lista.splice(idx, 1);
      else { if (lista.length >= 366) throw new TRPCError({ code: "BAD_REQUEST", message: "Limite de 366 dias extras por atividade" }); lista.push(input.data); }
      lista.sort();
      await db.update(planejamentoAtividades)
        .set({ diasTrabalhadosExtras: lista.length > 0 ? JSON.stringify(lista) : null })
        .where(eq(planejamentoAtividades.id, input.atividadeId));
      return { ok: true, marcado: idx < 0, total: lista.length, datas: lista };
    }),

  setRealDates: protectedProcedure
    .input(z.object({
      atividadeId:        z.number(),
      companyId:          z.number(),
      dataInicioReal:     z.string().nullable().optional(),
      dataFimReal:        z.string().nullable().optional(),
      responsavelLotus:   z.string().nullable().optional(),
      // Rev. 1817 — Override completo de Responsável (popover do Padrão FC).
      // Permite marcar uma atividade como executada por terceiro (texto livre)
      // ou limpar o flag externo para voltar à resolução automática.
      isExterna:          z.boolean().optional(),
      externaResponsavel: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const patch: any = {};
      if (input.dataInicioReal   !== undefined) patch.dataInicioReal   = input.dataInicioReal   || null;
      if (input.dataFimReal      !== undefined) patch.dataFimReal      = input.dataFimReal      || null;
      if (input.responsavelLotus !== undefined) patch.responsavelLotus = (input.responsavelLotus ?? "").trim() || null;
      if (input.isExterna        !== undefined) patch.isExterna        = !!input.isExterna;
      if (input.externaResponsavel !== undefined) patch.externaResponsavel = (input.externaResponsavel ?? "").trim() || null;
      if (Object.keys(patch).length === 0) return { ok: true };
      // Valida ownership: atividade → projeto → companyId
      const [check] = await db
        .select({
          projetoCompany:  planejamentoProjetos.companyId,
          projetoId:       planejamentoAtividades.projetoId,
          revisaoId:       planejamentoAtividades.revisaoId,
          diaCorteSemana:  planejamentoProjetos.diaCorteSemana,
        })
        .from(planejamentoAtividades)
        .innerJoin(planejamentoProjetos, eq(planejamentoProjetos.id, planejamentoAtividades.projetoId))
        .where(eq(planejamentoAtividades.id, input.atividadeId));
      if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "Atividade não encontrada" });
      // Tenant: usa SEMPRE companyId do usuário autenticado; admin/admin_master pode atravessar.
      const isAdminSet = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      const userCompany = (ctx.user as any).companyId;
      if (!isAdminSet && String(check.projetoCompany) !== String(userCompany)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Atividade fora da sua empresa" });
      }
      await db.update(planejamentoAtividades).set(patch).where(eq(planejamentoAtividades.id, input.atividadeId));

      // Rev. 1662 — Auto-avanço LOTUS:
      // Quando o engenheiro digita a data de FIM real, a atividade está
      // concluída → cria/atualiza o avanço a 100% no cutoff da semana que
      // contém o dataFimReal. Mesmo registro lido pelo Padrão FC (Avanço
      // Semanal/Curva S/SPI) — fonte única, sem espelhos.
      if (input.dataFimReal) {
        try {
          const { proximoDiaSemana, ehDiaSemana, DIA_CORTE_DEFAULT } = await import("../../shared/dataCorte");
          const dow = (check.diaCorteSemana ?? DIA_CORTE_DEFAULT) as number;
          const fimIso = String(input.dataFimReal).slice(0, 10);
          // Se o fim já cai no próprio cutoff, usa o próprio dia; senão, próximo cutoff.
          const semanaIso = ehDiaSemana(fimIso, dow) ? fimIso : proximoDiaSemana(fimIso, dow);

          const [ultimo] = await db.select({ percentualAcumulado: planejamentoAvancos.percentualAcumulado })
            .from(planejamentoAvancos)
            .where(and(
              eq(planejamentoAvancos.atividadeId, input.atividadeId),
              sql`semana < ${semanaIso}`,
            ))
            .orderBy(desc(planejamentoAvancos.semana))
            .limit(1);
          const ultimoPct = parseFloat(String(ultimo?.percentualAcumulado ?? "0")) || 0;
          const semanal = Math.max(0, 100 - ultimoPct);

          const [existente] = await db.select({ id: planejamentoAvancos.id })
            .from(planejamentoAvancos)
            .where(and(
              eq(planejamentoAvancos.atividadeId, input.atividadeId),
              eq(planejamentoAvancos.semana, semanaIso),
            )).limit(1);
          if (existente) {
            await db.update(planejamentoAvancos)
              .set({ percentualAcumulado: "100.0000", percentualSemanal: String(semanal.toFixed(4)), observacao: "Concluído via LOTUS (data fim real)" })
              .where(eq(planejamentoAvancos.id, existente.id));
          } else {
            await db.insert(planejamentoAvancos).values({
              projetoId:           check.projetoId,
              revisaoId:           check.revisaoId,
              atividadeId:         input.atividadeId,
              semana:              semanaIso,
              percentualAcumulado: "100.0000",
              percentualSemanal:   String(semanal.toFixed(4)),
              observacao:          "Concluído via LOTUS (data fim real)",
              criadoPor:           "LOTUS",
            });
          }
        } catch (e: any) {
          console.error("[setRealDates auto-avanço]", e?.message || e);
        }
      }
      return { ok: true };
    }),

  salvarAtividades: protectedProcedure
    .input(z.object({
      revisaoId: z.number(),
      projetoId: z.number(),
      // Rev. 1830 — semana ISO de referência pro snapshot de avanços (Monday).
      // Quando importa um XML SEMANA N, o frontend envia a Monday do StatusDate
      // do XML (não a data de hoje). Sem isso, o snapshot caía na semana atual
      // do servidor e a "evolução da primeira semana" ficava em branco.
      semanaIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "semanaIso inválida").optional(),
      atividades: z.array(z.object({
        id:                  z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        eapCodigo:           z.string().nullish(),
        // Rev. 1829 — UID nativo do MS Project (chave única de identidade)
        mspUid:              z.string().nullish(),
        nome:                z.string(),
        nivel:               z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        dataInicio:          z.string().nullish(),
        dataFim:             z.string().nullish(),
        duracaoDias:         z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        predecessora:        z.string().nullish(),
        pesoFinanceiro:      z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        recursoPrincipal:    z.string().nullish(),
        quantidadePlanejada: z.preprocess(v => v == null ? null : Number(v), z.number().nullish()),
        unidade:             z.string().nullish(),
        ordem:               z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        isGrupo:             z.boolean().optional(),
        isMarco:             z.boolean().optional(),
        isIndireta:          z.boolean().optional(),
        isExterna:           z.boolean().optional(),
        externaResponsavel:  z.string().nullish(),
        // Rev. 1823 — responsável manual (planejador atribui terceiro sem marcar como externa)
        responsavelLotus:    z.string().nullish(),
        disabled:            z.boolean().optional(),
        percentConcluido:    z.preprocess(v => v == null ? 0 : Number(v), z.number().min(0).max(100)).optional(),
        // Rev. 1670 — Snapshot %Previsto (Texto10) e %Realizado AUX (Texto7)
        // por atividade, lidos do XML MSP no import. Quando ausentes, ficam
        // null e o ERP cai no fallback dinâmico.
        previstoMspPct:      z.preprocess(v => v == null ? null : Number(v), z.number().min(0).max(100).nullish()),
        realizadoMspPct:     z.preprocess(v => v == null ? null : Number(v), z.number().min(0).max(100).nullish()),
        // Rev. 2533 — Caminho B: BaselineStart/Finish da Baseline 0 do MSP.
        baselineStart:       z.string().nullish(),
        baselineFinish:      z.string().nullish(),
        // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
        baselineStartTs:     z.string().nullish(),
        baselineFinishTs:    z.string().nullish(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Rev. 1829 — Hardening multi-tenant (achado de code review). Valida
      // que (a) revisão pertence ao projeto declarado e (b) projeto pertence
      // à companyId do usuário (admin/admin_master atravessa). Bloqueia IDOR
      // por enumeração de revisaoId/projetoId.
      {
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
        const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
          .from(planejamentoRevisoes).where(eq(planejamentoRevisoes.id, input.revisaoId)).limit(1);
        if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não encontrada." });
        if (Number(rev.projetoId) !== Number(input.projetoId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Revisão não pertence ao projeto informado." });
        }
        if (!isAdmin) {
          const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
            .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
          if (!proj || String(proj.companyId) !== String((ctx.user as any).companyId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
          }
        }
      }
      const rows = input.atividades.map((a, i) => {
        const isDisabled = a.disabled ?? false;
        return {
          revisaoId:           input.revisaoId,
          projetoId:           input.projetoId,
          eapCodigo:           a.eapCodigo ?? null,
          // Rev. 1829 — UID nativo do MS Project (chave única). Vazio em XLSX.
          mspUid:              (a.mspUid ?? '').toString().trim() || null,
          nome:                a.nome ?? "",
          nivel:               a.nivel ?? 1,
          dataInicio:          a.dataInicio ?? null,
          dataFim:             a.dataFim ?? null,
          duracaoDias:         a.duracaoDias ?? 0,
          predecessora:        a.predecessora ?? null,
          // Atividades desativadas (Inactive Task — estilo MS Project) não devem
          // contribuir para a soma do Peso% nem para nenhum cálculo financeiro.
          // Forçamos peso 0 aqui para garantir consistência mesmo fora do
          // auto-recalc (allPesosZero), independente do que o cliente envia.
          pesoFinanceiro:      isDisabled ? "0" : String(a.pesoFinanceiro ?? 0),
          recursoPrincipal:    a.recursoPrincipal ?? null,
          quantidadePlanejada: String(a.quantidadePlanejada ?? 0),
          unidade:             a.unidade ?? null,
          ordem:               a.ordem ?? i,
          isGrupo:             a.isGrupo ?? false,
          isMarco:             a.isMarco ?? false,
          isIndireta:          a.isIndireta ?? false,
          isExterna:           a.isExterna ?? false,
          externaResponsavel:  a.externaResponsavel ?? null,
          // Rev. 1823 — responsável manual (texto livre); vazio vira null → cai no auto-resolve
          responsavelLotus:    a.responsavelLotus === undefined ? undefined : ((a.responsavelLotus ?? '').toString().trim() || null),
          disabled:            isDisabled,
          // Rev. 1670 — snapshot por atividade (string p/ Drizzle numeric)
          previstoMspPct:      a.previstoMspPct == null ? null : String(Number(a.previstoMspPct).toFixed(4)),
          realizadoMspPct:     a.realizadoMspPct == null ? null : String(Number(a.realizadoMspPct).toFixed(4)),
          // Rev. 2533 — Caminho B: baseline lida do MSP (tag <Baseline Number=0>).
          baselineStart:       (a as any).baselineStart ?? null,
          baselineFinish:      (a as any).baselineFinish ?? null,
          // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
          baselineStartTs:     (a as any).baselineStartTs ?? null,
          baselineFinishTs:    (a as any).baselineFinishTs ?? null,
        };
      });

      // ── Rev. 1798 / R-013 — VALIDAÇÃO de EAP+NOME contra orçamento ──────
      // Se o projeto tem orçamento vinculado, fazemos AUTO-SYNC do nome da
      // atividade pela descrição do orçamento (chave estável: eapCodigo).
      //
      // Rev. 1807 / R-015 — IMPORTANTE (regressão dos projetos antigos):
      // a Rev. 1798 BLOQUEAVA o save quando o cronograma tinha algum EAP que
      // não existia no orçamento. Isso quebrou projetos PRONTOS (importados
      // antes da R-013) que tinham qualquer divergência mínima — usuário não
      // conseguia mais salvar. Agora: EAPs órfãos viram WARNING (log + retorno
      // no payload), nunca bloqueiam o save. A R-013 continua valendo para
      // novos projetos; o Diagnóstico EAP×Cronograma (botão violet ao lado
      // do Importar) sinaliza visualmente as divergências p/ o usuário corrigir
      // sem precisar abortar uma operação legítima de salvar.
      try {
        const [projVal] = await db.select({ orcamentoId: planejamentoProjetos.orcamentoId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
        if (projVal?.orcamentoId) {
          const itensOrcVal = await db.select({
            eapCodigo: orcamentoItens.eapCodigo,
            descricao: orcamentoItens.descricao,
            tipo: orcamentoItens.tipo,
          }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, projVal.orcamentoId));

          const normTxt = (s: string | null | undefined) =>
            (s ?? '').toString().toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, ' ').trim();

          // Mapa do orçamento por EAP normalizado → { descricao, tipo }
          const orcByEap = new Map<string, { descricao: string; tipo: string | null }>();
          for (const it of itensOrcVal) {
            const k = (it.eapCodigo ?? '').trim();
            if (k) orcByEap.set(k, { descricao: it.descricao ?? '', tipo: it.tipo ?? null });
          }

          const erros: Array<{ eap: string; nomeAtividade: string }> = [];
          let nomesAutoSincronizados = 0;

          for (const r of rows) {
            // Folhas diretas que devem casar com orçamento
            if (r.isGrupo || r.isMarco || r.isIndireta || r.isExterna || r.disabled) continue;
            const eap = (r.eapCodigo ?? '').trim();
            if (!eap) {
              erros.push({ eap: '(vazio)', nomeAtividade: r.nome });
              continue;
            }
            const orcIt = orcByEap.get(eap);
            if (!orcIt) {
              erros.push({ eap, nomeAtividade: r.nome });
              continue;
            }
            // ✨ AUTO-SINCRONIZA o nome com a descrição do orçamento.
            // EAP é a chave estável (R-013 imutável), portanto sempre que o EAP
            // bater, o nome do cronograma passa a ser EXATAMENTE a descrição
            // do orçamento — sem perguntar, sem botão, determinístico.
            if (normTxt(r.nome) !== normTxt(orcIt.descricao) && (orcIt.descricao ?? '').trim().length > 0) {
              r.nome = orcIt.descricao;
              nomesAutoSincronizados++;
            } else if (r.nome !== orcIt.descricao && (orcIt.descricao ?? '').trim().length > 0) {
              // Mesmo nome semanticamente, mas com diferença de caixa/acento/espaço:
              // força o textual EXATO do orçamento (paridade 100%).
              r.nome = orcIt.descricao;
              nomesAutoSincronizados++;
            }
          }

          if (nomesAutoSincronizados > 0) {
            console.log(`[salvarAtividades] R-013: ${nomesAutoSincronizados} nome(s) auto-sincronizado(s) com o orçamento (projeto ${input.projetoId}).`);
          }

          if (erros.length > 0) {
            // Rev. 1807 / R-015 — não bloqueia mais, apenas registra warning.
            // O Diagnóstico EAP×Cronograma é o canal visual para o usuário corrigir.
            const sample = erros.slice(0, 5).map(e => `${e.eap} (${(e.nomeAtividade ?? '').substring(0, 40)})`).join(', ');
            console.warn(`[salvarAtividades] R-013 warning: ${erros.length} atividade(s) com EAP fora do orçamento (projeto ${input.projetoId}). Amostra: ${sample}${erros.length > 5 ? ` … +${erros.length - 5}` : ''}. Save NÃO foi bloqueado (Rev. 1807 / R-015 — projetos legados).`);
          }
        }
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        // Falha de leitura do orçamento: não bloqueia importação (degrada graciosamente)
        console.error('[salvarAtividades] Falha na validação R-013:', e?.message ?? e);
      }

      const allPesosZero = rows.every(r => parseFloat(r.pesoFinanceiro) === 0 || r.isGrupo);
      if (allPesosZero) {
        let pesoCalculado = false;

        const [proj] = await db.select({ orcamentoId: planejamentoProjetos.orcamentoId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
        if (proj?.orcamentoId) {
          try {
            const eapItens = await db.select({
              eapCodigo: orcamentoItens.eapCodigo,
              custoTotal: orcamentoItens.custoTotal,
            }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, proj.orcamentoId));

            if (eapItens.length > 0) {
              const custoMap = new Map<string, number>();
              for (const it of eapItens) custoMap.set(it.eapCodigo ?? "", parseFloat(it.custoTotal ?? "0") || 0);

              const folhas = rows.filter(r => !r.isGrupo && !r.disabled);
              const totalCusto = folhas.reduce((s, r) => s + (custoMap.get(r.eapCodigo ?? "") ?? 0), 0);

              if (totalCusto > 0) {
                for (const r of rows) {
                  if (r.isGrupo || r.disabled) { r.pesoFinanceiro = "0"; continue; }
                  const custo = custoMap.get(r.eapCodigo ?? "") ?? 0;
                  r.pesoFinanceiro = String(+((custo / totalCusto) * 100).toFixed(4));
                }
                pesoCalculado = true;
              }
            }
          } catch (_) {}
        }

        if (!pesoCalculado) {
          const folhas = rows.filter(r => !r.isGrupo && !r.disabled && (r.duracaoDias ?? 0) > 0);
          const totalDias = folhas.reduce((s, r) => s + (r.duracaoDias ?? 0), 0);
          if (totalDias > 0) {
            for (const r of rows) {
              if (r.isGrupo || r.disabled) { r.pesoFinanceiro = "0"; continue; }
              const dur = r.duracaoDias ?? 0;
              r.pesoFinanceiro = String(+((dur / totalDias) * 100).toFixed(4));
            }
          }
        }
      }

      const inputWithIds = input.atividades.map((a, i) => ({ ...a, _idx: i }));
      const toUpdate = inputWithIds.filter(a => a.id != null && a.id > 0);
      const toInsert = inputWithIds.filter(a => a.id == null || a.id <= 0);
      const sentIds = toUpdate.map(a => a.id!);

      await db.transaction(async (tx) => {
        const existing = await tx.select({ id: planejamentoAtividades.id })
          .from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));
        const existingIds = new Set(existing.map(e => e.id));
        const toDeleteIds = [...existingIds].filter(id => !sentIds.includes(id));

        if (toDeleteIds.length > 0) {
          await tx.delete(planejamentoAtividades)
            .where(inArray(planejamentoAtividades.id, toDeleteIds));
        }

        if (toUpdate.length > 0) {
          const BATCH = 50;
          for (let b = 0; b < toUpdate.length; b += BATCH) {
            const batch = toUpdate.slice(b, b + BATCH);
            const cases = (field: string, getValue: (r: any) => string) => {
              const whens = batch.map(a => `WHEN ${a.id} THEN ${getValue(rows[a._idx])}`).join(" ");
              return `${field} = CASE id ${whens} ELSE ${field} END`;
            };
            const esc = (v: any) => v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
            const escBool = (v: any) => v ? "TRUE" : "FALSE";
            const escNum = (v: any) => v == null ? "0" : String(Number(v) || 0);
            // Rev. 1670 — numeric nullable: NULL preserva o "sem snapshot" (não vira 0)
            const escNumNull = (v: any) => v == null ? "NULL" : String(Number(v) || 0);
            const batchIds = batch.map(a => a.id!);

            await tx.execute(sql.raw(`
              UPDATE planejamento_atividades SET
                ${cases("eap_codigo", r => esc(r.eapCodigo))},
                ${cases("msp_uid", r => esc(r.mspUid))},
                ${cases("nome", r => esc(r.nome))},
                ${cases("nivel", r => escNum(r.nivel))},
                ${cases("data_inicio", r => r.dataInicio ? esc(r.dataInicio) : "NULL")},
                ${cases("data_fim", r => r.dataFim ? esc(r.dataFim) : "NULL")},
                ${cases("duracao_dias", r => escNum(r.duracaoDias))},
                ${cases("predecessora", r => esc(r.predecessora))},
                ${cases("peso_financeiro", r => esc(r.pesoFinanceiro))},
                ${cases("recurso_principal", r => esc(r.recursoPrincipal))},
                ${cases("quantidade_planejada", r => esc(r.quantidadePlanejada))},
                ${cases("unidade", r => esc(r.unidade))},
                ${cases("ordem", r => escNum(r.ordem))},
                ${cases("is_grupo", r => escBool(r.isGrupo))},
                ${cases("is_marco", r => escBool(r.isMarco))},
                ${cases("is_indireta", r => escBool(r.isIndireta))},
                ${cases("is_externa", r => escBool(r.isExterna))},
                ${cases("externa_responsavel", r => esc(r.externaResponsavel))},
                ${cases("responsavel_lotus", r => r.responsavelLotus === undefined ? "responsavel_lotus" : esc(r.responsavelLotus))},
                ${cases("disabled", r => escBool(r.disabled))},
                ${cases("previsto_msp_pct", r => escNumNull(r.previstoMspPct))},
                ${cases("realizado_msp_pct", r => escNumNull(r.realizadoMspPct))},
                ${cases("baseline_start", r => r.baselineStart ? esc(r.baselineStart) : "NULL")},
                ${cases("baseline_finish", r => r.baselineFinish ? esc(r.baselineFinish) : "NULL")},
                ${cases("baseline_start_ts", r => r.baselineStartTs ? esc(r.baselineStartTs) : "NULL")},
                ${cases("baseline_finish_ts", r => r.baselineFinishTs ? esc(r.baselineFinishTs) : "NULL")}
              WHERE id IN (${batchIds.join(",")})
                AND revisao_id = ${input.revisaoId}
            `));
          }
        }

        if (toInsert.length > 0) {
          const insertRows = toInsert.map(a => rows[a._idx]);
          // Rev. 1822 — chunk maior (500) reduz round-trips ao Postgres
          // (1900 atividades: 19 → 4 INSERTs). Postgres aguenta facilmente
          // ~10k rows/INSERT; 500 fica conservador pro tamanho da row.
          const CHUNK = 500;
          for (let i = 0; i < insertRows.length; i += CHUNK) {
            await tx.insert(planejamentoAtividades).values(insertRows.slice(i, i + CHUNK));
          }
        }
      });

      // Rev. 2533 — Caminho B: expande PREVISTO semana-a-semana logo após
      // salvar atividades+baselines. Falha silenciosa (snapshot é benefit-add;
      // ausência cai no comportamento legado de leitura de Texto6).
      try {
        // Rev. 2633 — respeita o interruptor global. Em modo MANUAL o motor NÃO
        // roda (sobrescreveria a curva manual); só reconstrói a curva a partir
        // dos uploads semanais já gravados em previsto_manual_json.
        const fonte = await getPrevistoFonteByProjeto(db, input.projetoId);
        if (fonte === "manual") {
          const resM = await regenerarPrevistoManual(db, input.projetoId, input.revisaoId);
          console.log(`[Previsto MANUAL] Projeto ${input.projetoId} rev ${input.revisaoId}: curva reconstruída (${resM?.semanas ?? 0} semanas × ${resM?.uploads ?? 0} uploads).`);
        } else {
          const res = await regenerarPrevistoSemanasCaminhoB(db, input.projetoId, input.revisaoId);
          if (res) {
            if (res.folhas > 0 && res.semanas === 0) {
              console.error(`[Caminho B] ALERTA projeto ${input.projetoId} rev ${input.revisaoId}: ${res.folhas} folha(s) com baseline mas snapshot ficou vazio (semanas=0). Verifique formato das datas de baseline.`);
            } else {
              console.log(`[Caminho B] Projeto ${input.projetoId} rev ${input.revisaoId}: snapshot gerado (${res.semanas} semanas × ${res.folhas} folhas).`);
            }
          }
        }
      } catch (e: any) {
        console.error(`[Caminho B] FALHA regenerarPrevistoSemanas projeto ${input.projetoId}:`, e?.message || e);
      }

      // ─── Importar % Concluído do arquivo como avanço da semana atual ─────────
      const atividadesComAvanco = input.atividades.filter(a => (a.percentConcluido ?? 0) > 0 && !a.isGrupo);
      console.log(`[ImportAvanco] total atividades=${input.atividades.length} com_avanco=${atividadesComAvanco.length}`);

      if (atividadesComAvanco.length > 0) {
        // Rev. 1830 — Semana de referência: usa semanaIso do XML (Monday do
        // StatusDate) quando o frontend envia. Fallback p/ Monday-de-hoje só
        // pra retrocompatibilidade. Sem isso, importar XML SEMANA 1 (StatusDate
        // 07/05) gravava snapshot na semana de hoje (11/05) e a semana 04/05
        // ficava em branco → "evolução da primeira semana incorreta".
        const ref = (input as any).semanaIso ? new Date((input as any).semanaIso + "T12:00:00Z") : new Date();
        const diaSemana = ref.getUTCDay();
        const diffParaSeg = diaSemana === 0 ? -6 : 1 - diaSemana;
        const segunda = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + diffParaSeg));
        const semanaIso = segunda.toISOString().slice(0, 10);

        // Rev. 1829 — Busca atividades da revisão. Index primário: msp_uid
        // (chave única e ESTÁVEL no MSP, preservada em rename/move). Fallback
        // secundário: eap_codigo (Item do MSP — pode mudar). Fallback por nome
        // FOI ELIMINADO (auditoria contra regras MSP — renomear quebrava match).
        const atividadesSalvas = await db.select({
          id: planejamentoAtividades.id,
          mspUid: planejamentoAtividades.mspUid,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
        }).from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

        console.log(`[ImportAvanco] atividades salvas na revisão ${input.revisaoId}: ${atividadesSalvas.length}`);

        const uidToId = new Map<string, number>();
        const eapToId = new Map<string, number>();
        for (const a of atividadesSalvas) {
          if (a.mspUid) uidToId.set(a.mspUid.trim(), a.id);
          if (a.eapCodigo) eapToId.set(a.eapCodigo.trim(), a.id);
        }

        const userName = (ctx as any).user?.name ?? "Importação MS Project";
        let inseridos = 0;
        let atualizados = 0;
        let naoEncontrados = 0;

        for (const a of atividadesComAvanco) {
          const uid = ((a as any).mspUid || "").toString().trim();
          const eap = (a.eapCodigo || "").trim();
          // Rev. 1829 — UID 1º (chave única MSP), depois EAP. Sem fallback nome.
          const atividadeId = (uid && uidToId.get(uid)) ?? eapToId.get(eap);

          if (!atividadeId) {
            naoEncontrados++;
            if (naoEncontrados <= 3) {
              console.log(`[ImportAvanco] não encontrou: uid="${uid}" eap="${eap}" nome="${a.nome}" pct=${a.percentConcluido}`);
            }
            continue;
          }

          const pct = String((a.percentConcluido ?? 0).toFixed(4));

          const [existente] = await db.select({ id: planejamentoAvancos.id })
            .from(planejamentoAvancos)
            .where(and(
              eq(planejamentoAvancos.atividadeId, atividadeId),
              eq(planejamentoAvancos.semana, semanaIso),
            )).limit(1);

          if (existente) {
            await db.update(planejamentoAvancos)
              .set({ percentualAcumulado: pct, criadoPor: userName })
              .where(eq(planejamentoAvancos.id, existente.id));
            atualizados++;
          } else {
            const [ultimo] = await db.select({ percentualAcumulado: planejamentoAvancos.percentualAcumulado })
              .from(planejamentoAvancos)
              .where(and(
                eq(planejamentoAvancos.atividadeId, atividadeId),
                sql`semana < ${semanaIso}`,
              ))
              .orderBy(desc(planejamentoAvancos.semana))
              .limit(1);
            const ultimoPct = parseFloat(String(ultimo?.percentualAcumulado ?? "0")) || 0;
            const semanal = Math.max(0, (a.percentConcluido ?? 0) - ultimoPct);

            await db.insert(planejamentoAvancos).values({
              projetoId:           input.projetoId,
              atividadeId,
              revisaoId:           input.revisaoId,
              semana:              semanaIso,
              percentualAcumulado: pct,
              percentualSemanal:   String(semanal.toFixed(4)),
              observacao:          "Importado do MS Project",
              criadoPor:           userName,
            });
            inseridos++;
          }
        }

        console.log(`[ImportAvanco] semana=${semanaIso} inseridos=${inseridos} atualizados=${atualizados} não_encontrados=${naoEncontrados}`);
      }

      // ─── Rev. 1820 / Item 10 — RECÁLCULO AUTOMÁTICO DE PESOS ──────────────
      // Sempre que o cronograma é salvo (import MS Project ou edição manual),
      // recalcula pesoFinanceiro de TODAS as folhas usando custoTotal do
      // orçamento (com rateio por duração entre folhas da mesma EAP — item 4).
      // Antes era apenas on-demand (botão "Recalcular pesos") → CHLORUM/QIU 2
      // ficaram com peso 0 em produção. Agora é automático na importação.
      // Defensivo: nunca lança (recalcularPesosCore já trata try/catch).
      try {
        const r = await recalcularPesosCore(db, input.projetoId, input.revisaoId);
        console.log(`[salvarAtividades→recalcPesos] projeto=${input.projetoId} rev=${input.revisaoId} ok=${r.ok} metodo=${r.metodo ?? "-"} folhas=${r.totalAtividades ?? 0} vinculados=${r.vinculados ?? 0}`);
      } catch (e: any) {
        console.error("[salvarAtividades→recalcPesos] falhou (não bloqueia save)", e?.message ?? e);
      }

      // ─── REGRA DE OURO: Sincroniza cronograma financeiro automaticamente ──
      // Qualquer alteração nas atividades (pesos, datas, remoção) reflete
      // imediatamente no fluxo de caixa projetado da empresa — sem intervenção manual.
      const companyId = (ctx as any).user?.companyId;
      if (companyId) {
        setImmediate(() => {
          importAtividadesCronogramaToFinancial(Number(companyId), undefined, { projetoId: input.projetoId })
            .then(n => console.log(`[GoldenRule][salvarAtividades] projeto=${input.projetoId} → ${n} entradas sync`))
            .catch(e => console.error("[GoldenRule][salvarAtividades]", e));
        });
      }

      return { success: true };
    }),

  // ── Importação MS Project com 3 modos (preservando ajustes locais) ────────
  // modo = "substituir"        → comportamento padrão (apaga revisão, recria)
  // modo = "apenas_predecessora" → casa por eapCodigo, atualiza SOMENTE predecessora
  // modo = "mesclar"            → casa por eapCodigo: atualiza datas/duração/peso/predecessora
  //                               PRESERVANDO isMarco, isIndireta, disabled, recursoPrincipal
  //                               e quantidadePlanejada das atividades existentes.
  //                               Atividades novas (não existentes no ERP) são INSERIDAS.
  //                               Atividades que existem no ERP mas NÃO vieram no XML são MANTIDAS.
  importarComModo: protectedProcedure
    .input(z.object({
      revisaoId: z.number(),
      projetoId: z.number(),
      modo: z.enum(["substituir", "apenas_predecessora", "mesclar"]),
      atividades: z.array(z.object({
        eapCodigo:        z.string().nullish(),
        // Rev. 1829 — UID nativo do MS Project (chave única de identidade)
        mspUid:           z.string().nullish(),
        nome:             z.string(),
        nivel:            z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        dataInicio:       z.string().nullish(),
        dataFim:          z.string().nullish(),
        duracaoDias:      z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        predecessora:     z.string().nullish(),
        pesoFinanceiro:   z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        recursoPrincipal: z.string().nullish(),
        ordem:            z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        isGrupo:          z.boolean().optional(),
        isMarco:          z.boolean().optional(),
        // Rev. 1786 — flag LoE/Indireta vinda da heurística do import (≥90% projeto)
        // ou marcação manual do usuário no checkbox da tabela de preview.
        // Só usada quando inserimos atividade NOVA no modo "mesclar" — para
        // atividades existentes a flag é preservada (usuário pode ter ajustado manualmente).
        isIndireta:       z.boolean().optional(),
        percentConcluido: z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
        // Rev. 1670 — Snapshot Texto10/Texto7 por atividade
        previstoMspPct:   z.preprocess(v => v == null ? null : Number(v), z.number().min(0).max(100).nullish()),
        realizadoMspPct:  z.preprocess(v => v == null ? null : Number(v), z.number().min(0).max(100).nullish()),
        // Rev. 2533 — Caminho B: baseline propagada também no mesclar.
        baselineStart:    z.string().nullish(),
        baselineFinish:   z.string().nullish(),
        // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
        baselineStartTs:  z.string().nullish(),
        baselineFinishTs: z.string().nullish(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Rev. 1829 — Hardening multi-tenant (IDOR) — mesmo padrão de salvarAtividades.
      {
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
        const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
          .from(planejamentoRevisoes).where(eq(planejamentoRevisoes.id, input.revisaoId)).limit(1);
        if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não encontrada." });
        if (Number(rev.projetoId) !== Number(input.projetoId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Revisão não pertence ao projeto informado." });
        }
        if (!isAdmin) {
          const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
            .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
          if (!proj || String(proj.companyId) !== String((ctx.user as any).companyId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
          }
        }
      }

      // Rev. 1829 — Carrega atividades existentes c/ msp_uid (chave única MSP)
      const existentes = await db.select({
        id: planejamentoAtividades.id,
        mspUid: planejamentoAtividades.mspUid,
        eapCodigo: planejamentoAtividades.eapCodigo,
      }).from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      const uidToId = new Map<string, number>();
      const eapToId = new Map<string, number>();
      for (const e of existentes) {
        if (e.mspUid) uidToId.set(e.mspUid.trim(), e.id);
        if (e.eapCodigo) eapToId.set(e.eapCodigo.trim(), e.id);
      }
      // Resolve identidade da atividade: UID 1º (estável), EAP 2º. Sem nome.
      const resolveId = (a: { mspUid?: string | null; eapCodigo?: string | null }): number | undefined => {
        const uid = (a.mspUid ?? "").toString().trim();
        if (uid && uidToId.has(uid)) return uidToId.get(uid);
        const eap = (a.eapCodigo ?? "").toString().trim();
        return eap ? eapToId.get(eap) : undefined;
      };

      let atualizados = 0;
      let inseridos   = 0;
      let naoEncontrados = 0;

      // ── Modo 1: APENAS PREDECESSORA ────────────────────────────────────────
      if (input.modo === "apenas_predecessora") {
        for (const a of input.atividades) {
          const id = resolveId(a);
          if (!id) { naoEncontrados++; continue; }
          await db.update(planejamentoAtividades)
            .set({ predecessora: a.predecessora ?? null })
            .where(eq(planejamentoAtividades.id, id));
          atualizados++;
        }
        return { success: true, modo: input.modo, atualizados, inseridos, naoEncontrados, total: input.atividades.length };
      }

      // ── Modo 2: MESCLAR (preserva ajustes locais) ──────────────────────────
      if (input.modo === "mesclar") {
        await db.transaction(async (tx) => {
          for (const [i, a] of input.atividades.entries()) {
            const id  = resolveId(a);
            const mspUidVal = (a.mspUid ?? "").toString().trim() || null;

            // Rev. 1670 — snapshot Texto10/Texto7 vindo do XML (4 casas, nullable)
            const previstoMspPct  = a.previstoMspPct  == null ? null : String(Number(a.previstoMspPct).toFixed(4));
            const realizadoMspPct = a.realizadoMspPct == null ? null : String(Number(a.realizadoMspPct).toFixed(4));

            if (id) {
              // Atualiza SOMENTE campos do XML; preserva isMarco, isIndireta, disabled,
              // recursoPrincipal, quantidadePlanejada (campos tipicamente ajustados pelo usuário)
              await tx.update(planejamentoAtividades).set({
                // Rev. 1829 — back-fill UID em projetos legados se vier no XML
                mspUid:         mspUidVal ?? undefined,
                eapCodigo:      a.eapCodigo ?? null,
                nome:           a.nome ?? "",
                nivel:          a.nivel ?? 1,
                dataInicio:     a.dataInicio ?? null,
                dataFim:        a.dataFim ?? null,
                duracaoDias:    a.duracaoDias ?? 0,
                predecessora:   a.predecessora ?? null,
                pesoFinanceiro: String(a.pesoFinanceiro ?? 0),
                ordem:          a.ordem ?? i,
                isGrupo:        a.isGrupo ?? false,
                // Rev. 1641 — isExterna/externaResponsavel também são preservados (não
                // mexemos via mesclar XML; só campos do XML são atualizados acima).
                // Rev. 1670 — snapshot por atividade SEMPRE atualizado pelo XML
                previstoMspPct,
                realizadoMspPct,
                // Rev. 2533 — Caminho B: baseline também propagada no mesclar
                // (XML semanal pode trazer baseline regravada se eng rodou
                // "Definir Linha de Base" de novo — preserva consistência).
                baselineStart:  (a as any).baselineStart ?? null,
                baselineFinish: (a as any).baselineFinish ?? null,
                // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
                baselineStartTs:  (a as any).baselineStartTs ?? null,
                baselineFinishTs: (a as any).baselineFinishTs ?? null,
              }).where(eq(planejamentoAtividades.id, id));
              atualizados++;
            } else {
              // Insere nova
              await tx.insert(planejamentoAtividades).values({
                revisaoId:      input.revisaoId,
                projetoId:      input.projetoId,
                eapCodigo:      a.eapCodigo ?? null,
                // Rev. 1829 — UID nativo do MSP (chave única de identidade)
                mspUid:         mspUidVal,
                nome:           a.nome ?? "",
                nivel:          a.nivel ?? 1,
                dataInicio:     a.dataInicio ?? null,
                dataFim:        a.dataFim ?? null,
                duracaoDias:    a.duracaoDias ?? 0,
                predecessora:   a.predecessora ?? null,
                pesoFinanceiro: String(a.pesoFinanceiro ?? 0),
                recursoPrincipal: a.recursoPrincipal ?? null,
                quantidadePlanejada: "0",
                unidade:        null,
                ordem:          a.ordem ?? i,
                isGrupo:        a.isGrupo ?? false,
                isMarco:        a.isMarco ?? false,
                // Rev. 1786 — propaga a sugestão de Indireta da heurística do import
                // (≥90% do projeto) ao inserir novas atividades. Usuário já confirmou
                // no checkbox da tabela de preview antes de chegar aqui.
                isIndireta:     a.isIndireta ?? false,
                isExterna:      false,
                externaResponsavel: null,
                disabled:       false,
                previstoMspPct,
                realizadoMspPct,
                // Rev. 2533 — Caminho B: baseline em inserts via mesclar.
                baselineStart:  (a as any).baselineStart ?? null,
                baselineFinish: (a as any).baselineFinish ?? null,
                // Rev. 2617 — baseline COM HORA (paridade minuto-a-minuto).
                baselineStartTs:  (a as any).baselineStartTs ?? null,
                baselineFinishTs: (a as any).baselineFinishTs ?? null,
              });
              inseridos++;
            }
          }
        });
        return { success: true, modo: input.modo, atualizados, inseridos, naoEncontrados, total: input.atividades.length };
      }

      // ── Modo 3: SUBSTITUIR (não cai aqui — frontend chama salvarAtividades) ─
      // Por segurança, retorna erro orientando o caller correto.
      throw new Error("Para modo 'substituir', use a procedure salvarAtividades.");
    }),

  // Helper interno exposto para gravar % Concluído editado no preview do importador
  // como avanço da semana atual (semana ISO segunda-feira). Usado pelos modos
  // mesclar / apenas_predecessora — o modo "substituir" já grava direto via salvarAtividades.
  importarAvancosDoArquivo: protectedProcedure
    .input(z.object({
      revisaoId: z.number(),
      projetoId: z.number(),
      // Rev. 1830 — semana ISO de referência (Monday do StatusDate do XML).
      semanaIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "semanaIso inválida").optional(),
      atividades: z.array(z.object({
        // Rev. 1829 — UID nativo do MSP (chave única de identidade)
        mspUid:           z.string().nullish(),
        eapCodigo:        z.string().nullish(),
        nome:             z.string().nullish(),
        percentConcluido: z.preprocess(v => v == null ? undefined : Number(v), z.number().optional()),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Rev. 1829 — Hardening multi-tenant (IDOR) — mesmo padrão de salvarAtividades.
      {
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
        const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
          .from(planejamentoRevisoes).where(eq(planejamentoRevisoes.id, input.revisaoId)).limit(1);
        if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não encontrada." });
        if (Number(rev.projetoId) !== Number(input.projetoId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Revisão não pertence ao projeto informado." });
        }
        if (!isAdmin) {
          const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
            .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
          if (!proj || String(proj.companyId) !== String((ctx.user as any).companyId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
          }
        }
      }

      const comAvanco = input.atividades.filter(a => (a.percentConcluido ?? 0) > 0);
      if (comAvanco.length === 0) return { atualizados: 0, inseridos: 0, naoEncontrados: 0 };

      // Rev. 1830 — Semana de referência: usa input.semanaIso (Monday do
      // StatusDate do XML) quando frontend envia. Fallback p/ Monday-de-hoje
      // mantém retrocompatibilidade. Sem isso, snapshot da SEMANA N do XML
      // caía na semana atual do servidor (bug "evolução semana 1 zerada").
      const ref = input.semanaIso ? new Date(input.semanaIso + "T12:00:00Z") : new Date();
      const diaSemana = ref.getUTCDay();
      const diffParaSeg = diaSemana === 0 ? -6 : 1 - diaSemana;
      const segunda = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + diffParaSeg));
      const semanaIso = segunda.toISOString().slice(0, 10);

      // Rev. 1829 — UID 1º (chave única MSP), depois EAP. Sem fallback nome.
      const atividadesSalvas = await db.select({
        id: planejamentoAtividades.id,
        mspUid: planejamentoAtividades.mspUid,
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
      }).from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      const uidToId = new Map<string, number>();
      const eapToId = new Map<string, number>();
      for (const a of atividadesSalvas) {
        if (a.mspUid) uidToId.set(a.mspUid.trim(), a.id);
        if (a.eapCodigo) eapToId.set(a.eapCodigo.trim(), a.id);
      }

      const userName = (ctx as any).user?.name ?? "Importação MS Project";
      let inseridos = 0, atualizados = 0, naoEncontrados = 0;

      for (const a of comAvanco) {
        const uid = (a.mspUid ?? "").toString().trim();
        const eap = (a.eapCodigo ?? "").trim();
        const atividadeId = (uid && uidToId.get(uid)) ?? eapToId.get(eap);
        if (!atividadeId) { naoEncontrados++; continue; }

        const pct = String((a.percentConcluido ?? 0).toFixed(4));
        const [existente] = await db.select({ id: planejamentoAvancos.id })
          .from(planejamentoAvancos)
          .where(and(
            eq(planejamentoAvancos.atividadeId, atividadeId),
            eq(planejamentoAvancos.semana, semanaIso),
          )).limit(1);

        if (existente) {
          await db.update(planejamentoAvancos)
            .set({ percentualAcumulado: pct, criadoPor: userName })
            .where(eq(planejamentoAvancos.id, existente.id));
          atualizados++;
        } else {
          const [ultimo] = await db.select({ percentualAcumulado: planejamentoAvancos.percentualAcumulado })
            .from(planejamentoAvancos)
            .where(and(
              eq(planejamentoAvancos.atividadeId, atividadeId),
              sql`semana < ${semanaIso}`,
            ))
            .orderBy(desc(planejamentoAvancos.semana))
            .limit(1);
          const ultimoPct = parseFloat(String(ultimo?.percentualAcumulado ?? "0")) || 0;
          const semanal = Math.max(0, (a.percentConcluido ?? 0) - ultimoPct);
          await db.insert(planejamentoAvancos).values({
            projetoId:           input.projetoId,
            atividadeId,
            revisaoId:           input.revisaoId,
            semana:              semanaIso,
            percentualAcumulado: pct,
            percentualSemanal:   String(semanal.toFixed(4)),
            observacao:          "Importado do MS Project (preview editado)",
            criadoPor:           userName,
          });
          inseridos++;
        }
      }
      return { atualizados, inseridos, naoEncontrados };
    }),

  // ── Rev. 1534 — Recovery Schedule (AACE 23R-02) ──────────────────────────
  // Salva a janela em semanas que o engenheiro escolheu pra diluir o débito
  // acumulado em metas semanais factíveis. PV (baseline) permanece imutável.
  setRecoveryWindow: protectedProcedure
    .input(z.object({ revisaoId: z.number(), semanas: z.number().int().min(1).max(52) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(planejamentoRevisoes)
        .set({ recoveryWindowSemanas: input.semanas } as any)
        .where(eq(planejamentoRevisoes.id, input.revisaoId));
      return { ok: true, semanas: input.semanas };
    }),

  // ── Avanços físicos semanais ──────────────────────────────────────────────
  listarAvancos: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
        ))
        .orderBy(asc(planejamentoAvancos.semana), asc(planejamentoAvancos.atividadeId));
      return rows.map(r => ({ ...r, semana: toDateStr(r.semana) }));
    }),

  // ── Rev. 1808 — diagnosticarAvancos REMOVIDO na Rev. 1809 a pedido do usuário.
  // Mantido placeholder histórico só pra orientar futuras revisões: NUNCA mais
  // criar botão/modal/endpoint de "diagnóstico" — usuário não autoriza UI extra.

  // Retorna todas as semanas que têm qualquer avanço registrado no projeto (qualquer revisão)
  listarSemanasComAvanco: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .selectDistinct({ semana: planejamentoAvancos.semana })
        .from(planejamentoAvancos)
        .where(eq(planejamentoAvancos.projetoId, input.projetoId))
        .orderBy(asc(planejamentoAvancos.semana));
      return rows.map(r => toDateStr(r.semana));
    }),

  salvarAvanco: protectedProcedure
    .input(z.object({
      projetoId:           z.number(),
      atividadeId:         z.number(),
      revisaoId:           z.number(),
      semana:              z.string(),
      percentualAcumulado: z.number(),
      percentualSemanal:   z.number(),
      observacao:          z.string().optional(),
      criadoPor:           z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(planejamentoAvancos).where(and(
        eq(planejamentoAvancos.atividadeId, input.atividadeId),
        eq(planejamentoAvancos.revisaoId,   input.revisaoId),
        eq(planejamentoAvancos.semana,      input.semana),
      ));

      if (existing.length > 0) {
        await db.update(planejamentoAvancos).set({
          percentualAcumulado: String(input.percentualAcumulado),
          percentualSemanal:   String(input.percentualSemanal),
          observacao:          input.observacao ?? null,
        }).where(eq(planejamentoAvancos.id, existing[0].id));
      } else {
        await db.insert(planejamentoAvancos).values({
          projetoId:           input.projetoId,
          atividadeId:         input.atividadeId,
          revisaoId:           input.revisaoId,
          semana:              input.semana,
          percentualAcumulado: String(input.percentualAcumulado),
          percentualSemanal:   String(input.percentualSemanal),
          observacao:          input.observacao ?? null,
          criadoPor:           input.criadoPor ?? null,
        });
      }
      return { success: true };
    }),

  // ── Batch save de avanços (import MS Project) ─────────────────────────────
  salvarAvancoLote: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      revisaoId: z.number(),
      semana:    z.string(),
      itens: z.array(z.object({
        atividadeId:         z.number(),
        percentualAcumulado: z.number(),
        percentualSemanal:   z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Carrega todos os existentes da semana DA REVISÃO de uma vez.
      // Rev. 2237.1 — adicionado filtro por `revisaoId` (paridade com
      // `salvarAvanco`) para evitar que atualizações cruzem registros
      // de OUTRAS revisões na mesma semana/atividade (corrupção de
      // histórico). Crítico agora que a auto-distribuição grava em
      // várias semanas passadas de uma vez.
      const existentes = await db.select()
        .from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
          eq(planejamentoAvancos.semana, input.semana),
        ));
      const existMap = new Map(existentes.map(e => [e.atividadeId, e.id]));

      const toUpdate: typeof input.itens = [];
      const toInsert: typeof input.itens = [];
      for (const item of input.itens) {
        if (existMap.has(item.atividadeId)) toUpdate.push(item);
        else toInsert.push(item);
      }

      // Updates em paralelo (em lotes de 50)
      const chunkSize = 50;
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        await Promise.all(
          toUpdate.slice(i, i + chunkSize).map(item =>
            db.update(planejamentoAvancos)
              .set({
                percentualAcumulado: String(item.percentualAcumulado),
                percentualSemanal:   String(item.percentualSemanal),
              })
              .where(eq(planejamentoAvancos.id, existMap.get(item.atividadeId)!))
          )
        );
      }

      // Inserts em lotes
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        await db.insert(planejamentoAvancos).values(
          toInsert.slice(i, i + chunkSize).map(item => ({
            projetoId:           input.projetoId,
            revisaoId:           input.revisaoId,
            atividadeId:         item.atividadeId,
            semana:              input.semana,
            percentualAcumulado: String(item.percentualAcumulado),
            percentualSemanal:   String(item.percentualSemanal),
          }))
        );
      }

      return { success: true, total: input.itens.length };
    }),

  // Rev. 2243 — Backfill de msp_uid: chamado pelo "Importar MS Project" do
  // Avanço Semanal quando ele consegue casar atividades por eapCodigo ou
  // por nome mas o `msp_uid` ainda está null no banco (cronogramas antigos
  // importados antes da Rev. 1829 quando msp_uid nem existia). Só atualiza
  // onde o valor atual é NULL — JAMAIS sobrescreve UID já gravado.
  backfillMspUid: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      pares: z.array(z.object({
        atividadeId: z.number(),
        mspUid:      z.string().min(1).max(20),
      })),
    }))
    .mutation(async ({ input }) => {
      if (input.pares.length === 0) return { atualizados: 0 };
      const db = await getDb();
      let atualizados = 0;
      const chunkSize = 50;
      for (let i = 0; i < input.pares.length; i += chunkSize) {
        const lote = input.pares.slice(i, i + chunkSize);
        const results = await Promise.all(
          lote.map(p =>
            db.update(planejamentoAtividades)
              .set({ mspUid: p.mspUid })
              .where(and(
                eq(planejamentoAtividades.id, p.atividadeId),
                eq(planejamentoAtividades.projetoId, input.projetoId),
                sql`${planejamentoAtividades.mspUid} IS NULL`,
              ))
              .returning({ id: planejamentoAtividades.id })
          )
        );
        atualizados += results.reduce((s, r) => s + r.length, 0);
      }
      return { atualizados };
    }),

  // ── REFIS ─────────────────────────────────────────────────────────────────
  listarRefis: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(planejamentoRefis)
        .where(eq(planejamentoRefis.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRefis.semana));
      return rows.map(r => ({ ...r, semana: toDateStr(r.semana) }));
    }),

  salvarRefis: protectedProcedure
    .input(z.object({
      projetoId:              z.number(),
      semana:                 z.string(),
      numero:                 z.number().optional(),
      avancoPrevisto:         z.number(),
      avancoRealizado:        z.number(),
      avancoSemanalPrevisto:  z.number(),
      avancoSemanalRealizado: z.number(),
      spi:                    z.number().optional(),
      cpi:                    z.number().optional(),
      custoPrevisto:          z.number().optional(),
      custoRealizado:         z.number().optional(),
      observacoes:            z.string().optional(),
      status:                 z.string().optional(),
      criadoPor:              z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(planejamentoRefis).where(and(
        eq(planejamentoRefis.projetoId, input.projetoId),
        eq(planejamentoRefis.semana, input.semana),
      ));

      const values = {
        avancoPrevisto:         String(input.avancoPrevisto),
        avancoRealizado:        String(input.avancoRealizado),
        avancoSemanalPrevisto:  String(input.avancoSemanalPrevisto),
        avancoSemanalRealizado: String(input.avancoSemanalRealizado),
        spi:                    String(input.spi ?? 1),
        cpi:                    String(input.cpi ?? 1),
        custoPrevisto:          String(input.custoPrevisto ?? 0),
        custoRealizado:         String(input.custoRealizado ?? 0),
        observacoes:            input.observacoes ?? null,
        status:                 input.status ?? "emitido",
      };

      if (existing.length > 0) {
        await db.update(planejamentoRefis).set(values)
          .where(eq(planejamentoRefis.id, existing[0].id));
      } else {
        const todos = await db.select().from(planejamentoRefis)
          .where(eq(planejamentoRefis.projetoId, input.projetoId));
        const numero = todos.length + 1;
        await db.insert(planejamentoRefis).values({
          projetoId:   input.projetoId,
          semana:      input.semana,
          numero,
          dataEmissao: new Date().toISOString().split("T")[0],
          ...values,
          criadoPor:   input.criadoPor ?? null,
        });
      }
      return { success: true };
    }),

  deletarRefis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [refis] = await db.select().from(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      if (!refis) throw new TRPCError({ code: "NOT_FOUND", message: "REFIS não encontrado." });
      // Rev. 1858 — exclusão de REFIS é sempre admin-only (paridade com UI)
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem excluir um REFIS." });
      // Rev. 1859 — valida ownership do projeto (cross-tenant guard)
      const isMaster = ctx.user.role === "admin_master";
      if (!isMaster) {
        const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, refis.projetoId));
        if (!proj || String(proj.companyId) !== String(ctx.user.companyId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "REFIS pertence a outra empresa." });
        }
      }
      await db.delete(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  // Rev. 1859 — Exclusão em lote de REFIs (admin-only, escopo de projeto)
  deletarRefisLote: protectedProcedure
    .input(z.object({ projetoId: z.number(), ids: z.array(z.number()).min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem excluir REFIs em lote." });
      const db = await getDb();
      // Valida ownership do projeto (cross-tenant guard) — admin_master ignora companyId
      const isMaster = ctx.user.role === "admin_master";
      if (!isMaster) {
        const [proj] = await db.select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
        if (!proj || String(proj.companyId) !== String(ctx.user.companyId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Projeto pertence a outra empresa." });
        }
      }
      // Delete só IDs que ESTÃO nesse projeto (defense-in-depth contra IDs estranhos no payload)
      const result: any = await db.delete(planejamentoRefis).where(and(
        eq(planejamentoRefis.projetoId, input.projetoId),
        inArray(planejamentoRefis.id, input.ids),
      ));
      const deleted = typeof result?.rowCount === "number" ? result.rowCount : input.ids.length;
      return { success: true, deleted };
    }),

  // ── Data de Corte (Status Date PMBOK / EVM) ──────────────────────────────
  // Rev. 1637 — Resolve a data de corte oficial do projeto. Default = última
  // quinta-feira ≤ today. Portal do Cliente e relatórios externos SEMPRE
  // calculam KPIs em relação a esta data; o ERP interno usa "Live (today)"
  // para o gestor mas exibe a data oficial como referência.
  getDataCorte: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [proj] = await db.select({
        companyId: planejamentoProjetos.companyId,
        obraId: planejamentoProjetos.obraId,
        dataCorteAtual: planejamentoProjetos.dataCorteAtual,
        dataCorteAtualizadaEm: planejamentoProjetos.dataCorteAtualizadaEm,
        dataCorteAtualizadaPor: planejamentoProjetos.dataCorteAtualizadaPor,
        diaCorteSemana: planejamentoProjetos.diaCorteSemana,
        cutoffConsolidado: planejamentoProjetos.cutoffConsolidado,
        cutoffConsolidadoEm: planejamentoProjetos.cutoffConsolidadoEm,
        cutoffConsolidadoPor: planejamentoProjetos.cutoffConsolidadoPor,
      }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      // Rev. 2984 — Tenant isolation por OBRA (leitura). admin/admin_master bypass.
      // Antes usava compare ESTRITO `proj.companyId !== ctx.user.companyId`, que negava
      // a Data de Corte ao engenheiro de campo cuja empresa-default difere da empresa do
      // projeto. Agora alinha com `resolvePlanAllowedObraIds` (mesma régua do Catálogo de
      // projetos): restrito → obra do projeto precisa estar nas suas obras permitidas.
      const isAdminGet = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminGet) {
        const allowedObraIds = await resolvePlanAllowedObraIds(
          db, ctx.user.id, ctx.user.role, ctx.user.email, Number(proj.companyId),
        );
        if (allowedObraIds !== null && (proj.obraId == null || !allowedObraIds.includes(Number(proj.obraId)))) {
          console.warn(`[getDataCorte] FORBIDDEN projetoId=${input.projetoId} projObra=${proj.obraId} allowed=[${allowedObraIds.join(",")}] role=${ctx.user.role}`);
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
        }
      }
      const { ultimoDiaSemanaAte, proximoDiaSemana, cutoffEfetivo, todayBR, nomeDiaSemana, DIA_CORTE_DEFAULT } = await import("../../shared/dataCorte");
      const hoje = todayBR();
      const dow = (proj.diaCorteSemana ?? DIA_CORTE_DEFAULT) as number;
      // toDateStr serializa `null` como "null" — passamos null direto pra cutoffEfetivo,
      // que trata defensivamente null/undefined/""/"null".
      const stored = proj.dataCorteAtual ? toDateStr(proj.dataCorteAtual) : null;
      const oficial = cutoffEfetivo(stored, hoje, dow);
      return {
        dataCorteOficial: oficial,
        dataCorteAtualizadaEm: proj.dataCorteAtualizadaEm,
        dataCorteAtualizadaPor: proj.dataCorteAtualizadaPor,
        proximaAtualizacao: proximoDiaSemana(oficial, dow),
        sugeridoSemFechamento: ultimoDiaSemanaAte(hoje, dow),
        hoje,
        nuncaFechado: !proj.dataCorteAtual,
        diaCorteSemana: dow,
        diaCorteNome: nomeDiaSemana(dow),
        cutoffConsolidado: !!proj.cutoffConsolidado,
        cutoffConsolidadoEm: proj.cutoffConsolidadoEm,
        cutoffConsolidadoPor: proj.cutoffConsolidadoPor,
      };
    }),

  // Rev. 1647 — Define o dia da semana do cutoff (0=Dom..6=Sáb). Bloqueado
  // se a premissa já foi consolidada (one-way lock).
  setDiaCorte: protectedProcedure
    .input(z.object({ projetoId: z.number(), diaCorteSemana: z.number().int().min(0).max(6) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [proj] = await db.select({
        companyId: planejamentoProjetos.companyId,
        cutoffConsolidado: planejamentoProjetos.cutoffConsolidado,
      }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      const isAdminSet = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminSet && String(proj.companyId) !== String(ctx.user.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      if (proj.cutoffConsolidado) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A premissa de cutoff já foi consolidada e não pode ser alterada." });
      }
      // Rev. 1654 — Opção A "Premissa redefine a leitura agora": ao trocar o
      // dia do cutoff (enquanto NÃO consolidado), recalcula a `dataCorteAtual`
      // pro último dia-de-cutoff novo até hoje. Assim o PV oficial responde
      // imediatamente à troca de molde — Qua = menos du = PV menor; Sex =
      // mais du = PV maior. Após "Consolidar", o lock one-way preserva a
      // auditoria (semana fechada não muda mais).
      const { ultimoDiaSemanaAte, todayBR } = await import("../../shared/dataCorte");
      const novaDataCorte = ultimoDiaSemanaAte(todayBR(), input.diaCorteSemana);
      // `dataCorteIso` é a fonte de verdade do `cutoffIso` consumido por
      // ProgramacaoSemanal (clip de fimEfetivo + bypass de snapshot Texto11).
      // Sem isso, a troca de premissa atualiza o top card mas deixa a Programação
      // Semanal ancorada no StatusDate antigo do MSP — quebra paridade Rev. 1651.
      const novaDataCorteIso = `${novaDataCorte}T17:00:00`;
      const quem = ctx.user.email || ctx.user.id || "—";
      await db.update(planejamentoProjetos).set({
        diaCorteSemana: input.diaCorteSemana,
        dataCorteAtual: novaDataCorte as any,
        dataCorteIso: novaDataCorteIso,
        dataCorteAtualizadaEm: new Date(),
        dataCorteAtualizadaPor: `${quem} (premissa: dia=${input.diaCorteSemana})`,
        atualizadoEm: new Date(),
      }).where(eq(planejamentoProjetos.id, input.projetoId));
      try {
        await createAuditLog({ ctx, entity: "planejamento_projetos", entityId: input.projetoId, action: "SET_DIA_CORTE", changes: { diaCorteSemana: input.diaCorteSemana, dataCorteAtual: novaDataCorte, dataCorteIso: novaDataCorteIso } });
      } catch (e: any) { console.error(`[setDiaCorte] audit log falhou:`, e?.message || e); }
      return { success: true, diaCorteSemana: input.diaCorteSemana, dataCorteAtual: novaDataCorte };
    }),

  // Rev. 1647 — Consolida a premissa do cutoff (one-way lock). A partir
  // daqui o `diaCorteSemana` não pode mais ser alterado por engano.
  consolidarCutoff: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [proj] = await db.select({
        companyId: planejamentoProjetos.companyId,
        cutoffConsolidado: planejamentoProjetos.cutoffConsolidado,
        diaCorteSemana: planejamentoProjetos.diaCorteSemana,
      }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      const isAdminCon = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminCon && String(proj.companyId) !== String(ctx.user.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      if (proj.cutoffConsolidado) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cutoff já consolidado." });
      }
      const quem = ctx.user.name || ctx.user.email || "—";
      await db.update(planejamentoProjetos).set({
        cutoffConsolidado: true,
        cutoffConsolidadoEm: new Date(),
        cutoffConsolidadoPor: quem,
        atualizadoEm: new Date(),
      }).where(eq(planejamentoProjetos.id, input.projetoId));
      try {
        await createAuditLog({ ctx, entity: "planejamento_projetos", entityId: input.projetoId, action: "CONSOLIDAR_CUTOFF", changes: { diaCorteSemana: proj.diaCorteSemana } });
      } catch (e: any) { console.error(`[consolidarCutoff] audit log falhou:`, e?.message || e); }
      return { success: true };
    }),

  // Rev. 1783 — Desconsolida a premissa do cutoff (destrava o one-way lock).
  // Restrito a admin/admin_master. Necessário quando a equipe consolida o dia
  // errado e precisa corrigir. Toda ação fica registrada no audit log com motivo.
  desconsolidarCutoff: protectedProcedure
    .input(z.object({ projetoId: z.number(), motivo: z.string().min(5, "Informe um motivo (mín. 5 caracteres).") }))
    .mutation(async ({ input, ctx }) => {
      const isAdminDes = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminDes) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem desconsolidar o cutoff." });
      }
      const db = await getDb();
      const [proj] = await db.select({
        companyId: planejamentoProjetos.companyId,
        cutoffConsolidado: planejamentoProjetos.cutoffConsolidado,
        cutoffConsolidadoEm: planejamentoProjetos.cutoffConsolidadoEm,
        cutoffConsolidadoPor: planejamentoProjetos.cutoffConsolidadoPor,
        diaCorteSemana: planejamentoProjetos.diaCorteSemana,
      }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      if (!proj.cutoffConsolidado) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cutoff não está consolidado — nada a desfazer." });
      }
      const quem = ctx.user.name || ctx.user.email || "—";
      await db.update(planejamentoProjetos).set({
        cutoffConsolidado: false,
        cutoffConsolidadoEm: null,
        cutoffConsolidadoPor: null,
        atualizadoEm: new Date(),
      }).where(eq(planejamentoProjetos.id, input.projetoId));
      try {
        await createAuditLog({
          ctx,
          entity: "planejamento_projetos",
          entityId: input.projetoId,
          action: "DESCONSOLIDAR_CUTOFF",
          changes: {
            diaCorteSemana: proj.diaCorteSemana,
            consolidadoAnteriormenteEm: proj.cutoffConsolidadoEm,
            consolidadoAnteriormentePor: proj.cutoffConsolidadoPor,
            motivo: input.motivo,
            desfeitoPor: quem,
          },
        });
      } catch (e: any) { console.error(`[desconsolidarCutoff] audit log falhou:`, e?.message || e); }
      return { success: true };
    }),

  fecharSemana: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      dataCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // default = último cutoff ≤ today
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Tenant isolation: garante que o projeto pertence à company do usuário.
      const [proj] = await db.select({
        companyId: planejamentoProjetos.companyId,
        diaCorteSemana: planejamentoProjetos.diaCorteSemana,
      }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      const isAdminFech = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminFech && String(proj.companyId) !== String(ctx.user.companyId)) {
        console.warn(`[fecharSemana] FORBIDDEN projetoId=${input.projetoId} projCompany=${proj.companyId} userCompany=${ctx.user.companyId} role=${ctx.user.role}`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      const { ultimoDiaSemanaAte, ehDiaSemana, todayBR, nomeDiaSemana, DIA_CORTE_DEFAULT } = await import("../../shared/dataCorte");
      const hojeBR = todayBR();
      const dow = (proj.diaCorteSemana ?? DIA_CORTE_DEFAULT) as number;
      const novoCorte = input.dataCorte || ultimoDiaSemanaAte(hojeBR, dow);
      // Validações: tem de ser o dia certo da semana e não pode ser futuro (Status Date PMBOK).
      if (novoCorte > hojeBR) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data de corte não pode ser no futuro." });
      }
      if (!ehDiaSemana(novoCorte, dow)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Data de corte deve cair em ${nomeDiaSemana(dow)} (premissa do projeto).` });
      }
      const quem = ctx.user.name || ctx.user.email || "—";
      // Rev. 1655 — Persiste também `dataCorteIso` (T17:00:00) — fonte do
      // `cutoffIso` consumido pela Programação Semanal (clipping + bypass do
      // snapshot Texto11). Sem isso, fechar a semana atualizava `dataCorteAtual`
      // mas a Programação Semanal continuava ancorada no StatusDate antigo do
      // MSP até reimport. Mesma convenção da `setDiaCorte` (Rev. 1654).
      const novaDataCorteIso = `${novoCorte}T17:00:00`;
      await db.update(planejamentoProjetos).set({
        dataCorteAtual: novoCorte as any,
        dataCorteIso: novaDataCorteIso,
        dataCorteAtualizadaEm: new Date(),
        dataCorteAtualizadaPor: quem,
        atualizadoEm: new Date(),
      }).where(eq(planejamentoProjetos.id, input.projetoId));
      // Auditoria: logamos falha mas não quebramos o fechamento.
      try {
        await createAuditLog({ ctx, entity: "planejamento_projetos", entityId: input.projetoId, action: "FECHAR_SEMANA", changes: { dataCorteAtual: novoCorte, dataCorteIso: novaDataCorteIso } });
      } catch (e: any) {
        console.error(`[fecharSemana] Falha ao gravar audit log (projetoId=${input.projetoId}):`, e?.message || e);
      }
      return { success: true, dataCorte: novoCorte, atualizadoPor: quem };
    }),

  // ── Rev. 1642 — Salva StatusDate + calendário do MS Project ───────────
  // Garante paridade 100% entre ERP e MS Project no cálculo de % PREVISTO:
  //   - statusDate vira `dataCorteAtual` (cutoff oficial PMBOK/EVM).
  //   - calendarioJson permite que o helper `fracaoDecorrida()` use dias
  //     úteis (ProjDateDiff) em vez de interpolação linear, eliminando o
  //     erro residual em atividades que cruzam fim-de-semana / feriados.
  salvarMetadadosMSProject: protectedProcedure
    .input(z.object({
      projetoId:      z.number(),
      statusDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      // Rev. 1643 — ISO completo do StatusDate (com hora) para precisão MSP.
      statusDateIso:  z.string().nullish(),
      calendarioJson: z.string().nullish(),
      // Rev. 1646.2 — Start/Finish da linha-resumo raiz (UID=0) do MSP.
      // Usados como base do "envelope" do projeto no cálculo de %PREVISTO
      // (paridade Texto10), em vez de min/max das folhas que pode inflar o total.
      projetoStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      projetoFinish:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      // Rev. 2765 — DE ONDE veio a chamada. "cadastro" = aba Cronograma (import
      // inicial): pode (re)gerar a curva "% Previsto". "avanco" = aba Avanço
      // Semanal: SÓ atualiza o REALIZADO (% Concluída) + StatusDate; NUNCA toca
      // no previsto (não regenera a curva e preserva o snapshot/calendário do
      // cadastro). Default "cadastro" p/ backward compat de chamadas antigas.
      origem:         z.enum(["cadastro", "avanco"]).default("cadastro"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [proj] = await db.select({
        companyId: planejamentoProjetos.companyId,
        calendarioJson: planejamentoProjetos.calendarioJson,
      })
        .from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      const isAdminMet = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminMet && String(proj.companyId) !== String(ctx.user.companyId)) {
        console.warn(`[salvarMetadadosMSProject] FORBIDDEN projetoId=${input.projetoId} projCompany=${proj.companyId} userCompany=${ctx.user.companyId} role=${ctx.user.role}`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      const quem = ctx.user.name || ctx.user.email || "—";
      const patch: any = { atualizadoEm: new Date() };
      if (input.statusDate) {
        patch.dataCorteAtual         = input.statusDate as any;
        patch.dataCorteAtualizadaEm  = new Date();
        patch.dataCorteAtualizadaPor = `${quem} (MS Project import)`;
      }
      if (input.statusDateIso) {
        patch.dataCorteIso = input.statusDateIso;
      }
      // Rev. 2767 — literal "% Previsto" (Texto10) DESTE upload semanal, capturado
      // do calendarioJson FRESCO (antes do merge sobrescrever pelo valor do cadastro).
      let literalSemanaAvanco: number | null = null;
      if (input.calendarioJson !== undefined && input.calendarioJson !== null) {
        try {
          const oldCal = proj.calendarioJson ? JSON.parse(proj.calendarioJson) : {};
          const newCal = JSON.parse(input.calendarioJson);
          if (input.origem === "avanco") {
            // Rev. 2765 — Avanço Semanal NUNCA toca o previsto. O calendarioJson
            // que chega do XML SEMANAL traz o realizado/StatusDate frescos, mas
            // também o `previstoMspSnapshot` e o calendário (jornada/feriados) DAQUELE
            // upload — que NÃO devem sobrescrever a baseline congelada no cadastro.
            // Mesclamos: previsto + calendário ficam do CADASTRO (valor antigo);
            // realizado + StatusDate vêm do novo. Assim o card de previsto (curva
            // congelada) e o self-heal (que relê o calendário) seguem idempotentes.
            // Rev. 2767 — guarda o Texto10 LITERAL desta semana ANTES do override.
            if (newCal.previstoMspSnapshot != null && Number.isFinite(Number(newCal.previstoMspSnapshot))) {
              literalSemanaAvanco = Number(newCal.previstoMspSnapshot);
            }
            if (oldCal.previstoMspSnapshot != null) newCal.previstoMspSnapshot = oldCal.previstoMspSnapshot;
            if (oldCal.weekDayIntervals)            newCal.weekDayIntervals    = oldCal.weekDayIntervals;
            if (oldCal.exceptions)                  newCal.exceptions          = oldCal.exceptions;
            if (oldCal.weekDays)                    newCal.weekDays            = oldCal.weekDays;
          }
          // Rev. 2781 — HISTÓRICO DE REALIZADO POR SEMANA (merge ADITIVO). O snapshot
          // único (`realizadoMspSnapshot`/`statusDateSnapshot`) guardava só a ÚLTIMA
          // foto → semanas passadas mostravam "—". Agora acumulamos cada foto num
          // mapa { [statusDate]: %realizado } preservando as anteriores, p/ o card
          // "REALIZADO (ACUM.)" reexibir o valor em TODAS as semanas já enviadas.
          // É UPDATE de coluna JSON via app (NÃO ALTER/DROP/DELETE — R-001/R-007/R-010 OK).
          const histReal: Record<string, number> = { ...(oldCal.realizadoSemanas || {}) };
          const sdKey = newCal.statusDateSnapshot
            ?? input.statusDate
            ?? (input.statusDateIso ? String(input.statusDateIso).slice(0, 10) : null);
          if (sdKey && newCal.realizadoMspSnapshot != null && Number.isFinite(Number(newCal.realizadoMspSnapshot))) {
            histReal[String(sdKey).slice(0, 10)] = Number(newCal.realizadoMspSnapshot);
          }
          if (Object.keys(histReal).length > 0) newCal.realizadoSemanas = histReal;
          patch.calendarioJson = JSON.stringify(newCal);
        } catch {
          // JSON inesperado → mantém o que chegou (não derruba o save).
          patch.calendarioJson = input.calendarioJson;
        }
      }
      // Rev. 1646.2 — sobrescreve dataInicio + dataTerminoContratual com os
      // valores da linha-resumo raiz do MSP. Cópia plena (sem inventar).
      if (input.projetoStart)  patch.dataInicio            = input.projetoStart  as any;
      if (input.projetoFinish) patch.dataTerminoContratual = input.projetoFinish as any;
      await db.update(planejamentoProjetos).set(patch)
        .where(eq(planejamentoProjetos.id, input.projetoId));

      // ── Rev. 2767 — CAPTURA DO "% PREVISTO" LITERAL (Texto10) POR SEMANA ────
      // No upload da aba "Avanço Semanal", grava o Texto10 LITERAL desta semana
      // (o número que o MSP já calculou) em `previsto_literal_json`, indexado
      // pelo cutoff. O cliente passa a EXIBIR esse literal nas semanas JÁ
      // enviadas (paridade 100% com o MSP) e mantém o motor só para projetar as
      // FUTURAS. NÃO re-roda o motor → zero oscilação. Nunca derruba o save.
      if (input.origem === "avanco") {
        try {
          const sdStr = input.statusDate
            ?? (input.statusDateIso ? String(input.statusDateIso).slice(0, 10) : null);
          await capturarPrevistoLiteralSemana(db, input.projetoId, sdStr, literalSemanaAvanco);
        } catch (e: any) {
          console.error(`[salvarMetadadosMSProject→literalPrevisto] projeto ${input.projetoId}:`, e?.message || e);
        }
      }

      // ── Rev. 2646 — PROPAGAÇÃO DO FIX DA Rev. 2645 A TODOS OS PROJETOS ──────
      // O calendário recém-parseado do XML (já SEM auto-injeção de feriados
      // móveis a partir da Rev. 2645) acabou de sobrescrever o `calendarioJson`.
      // Mas a curva "% PREVISTO" (Caminho B) só era regenerada no
      // `salvarAtividades` (cadastro/substituir) — então projetos ANTIGOS
      // continuavam exibindo a curva ~1% baixa (Corpus Christi injetado) até um
      // reimport MANUAL do cronograma inicial. Como `salvarMetadadosMSProject`
      // roda em TODO upload (inclusive o SEMANAL), regeneramos o previsto AQUI:
      // cada projeto antigo se AUTO-CURA no próximo envio do XML, com o
      // calendário limpo. É UPDATE da coluna JSON via função do app (NÃO é
      // ALTER/DROP/DELETE — R-001/R-007/R-010 OK) e idempotente (a baseline é
      // imutável dentro da revisão → mesma curva a cada upload). Só dispara
      // quando veio calendário novo (= é um import real, não chamada avulsa).
      //
      // Rev. 2765 — MAS NUNCA no fluxo de AVANÇO SEMANAL (`origem === "avanco"`):
      // a aba Avanço Semanal só registra o REALIZADO (% Concluída). Regenerar o
      // previsto a cada upload semanal — com o calendário daquela semana — era
      // justamente o que fazia a curva "% Previsto" DERIVAR ±1% do MSP em semanas
      // avançadas. O previsto agora é CONGELADO no cadastro (aba Cronograma) e só
      // é regerado por chamadas `origem === "cadastro"`.
      if (input.calendarioJson && input.origem !== "avanco") {
        try {
          const revs = await db.select({
            id: planejamentoRevisoes.id,
            status: planejamentoRevisoes.status,
          }).from(planejamentoRevisoes)
            .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
            .orderBy(asc(planejamentoRevisoes.numero));
          // ALVO = a MESMA revisão ativa do client (última aprovada → 1ª revisão),
          // espelhando o self-heal de leitura (Rev. 2599) e o salvarAtividades.
          const aprovadas = (revs as any[]).filter(r => r.status === "aprovada");
          const alvo = aprovadas[aprovadas.length - 1] ?? (revs as any[])[0];
          if (alvo?.id) {
            const fonte = await getPrevistoFonteByProjeto(db, input.projetoId);
            if (fonte === "manual") {
              await regenerarPrevistoManual(db, input.projetoId, alvo.id);
            } else {
              await regenerarPrevistoSemanasCaminhoB(db, input.projetoId, alvo.id);
            }
            console.log(`[salvarMetadadosMSProject→regenerarPrevisto] projeto=${input.projetoId} rev=${alvo.id} fonte=${fonte} (Rev. 2646 auto-cura).`);
          }
        } catch (e: any) {
          // Nunca quebra o save de metadados por causa da regeneração.
          console.error(`[salvarMetadadosMSProject→regenerarPrevisto] projeto ${input.projetoId}:`, e?.message || e);
        }
      }

      return { success: true, gravou: { statusDate: input.statusDate, statusDateIso: input.statusDateIso, calendar: !!input.calendarioJson, projetoStart: input.projetoStart, projetoFinish: input.projetoFinish } };
    }),

  consolidarRefis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [refis] = await db.select().from(planejamentoRefis).where(eq(planejamentoRefis.id, input.id));
      if (!refis) throw new TRPCError({ code: "NOT_FOUND", message: "REFIS não encontrado." });
      await db.update(planejamentoRefis).set({
        status: "consolidado",
        consolidadoPor: ctx.user.name || ctx.user.email,
        consolidadoEm: new Date(),
      }).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  cancelarConsolidacaoRefis: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem cancelar a consolidação." });
      const db = await getDb();
      await db.update(planejamentoRefis).set({
        status: "emitido",
        canceladoPor: ctx.user.name || ctx.user.email,
        canceladoEm: new Date(),
        consolidadoPor: null,
        consolidadoEm: null,
      }).where(eq(planejamentoRefis.id, input.id));
      return { success: true };
    }),

  consolidarRevisao: protectedProcedure
    .input(z.object({ revisaoId: z.number(), consolidado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(planejamentoRevisoes)
        .set({ consolidado: input.consolidado })
        .where(eq(planejamentoRevisoes.id, input.revisaoId));
      return { success: true };
    }),

  limparAvancos: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos)
        .where(eq(planejamentoAvancos.projetoId, input.projetoId));
      await limparSnapshotMspDoProjeto(db, input.projetoId);
      return { success: true };
    }),

  limparAvancosSemana: protectedProcedure
    .input(z.object({ projetoId: z.number(), semana: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.semana, input.semana),
        ));
      await limparSnapshotMspDoProjeto(db, input.projetoId);
      return { success: true };
    }),

  toggleMarco: protectedProcedure
    .input(z.object({ atividadeId: z.number(), isMarco: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE planejamento_atividades
        SET is_marco = ${input.isMarco}
        WHERE id = ${input.atividadeId}
      `);
      return { success: true };
    }),

  // ── Curva S ───────────────────────────────────────────────────────────────
  // ── Rev. 1670 Fase 2 — PV/EV oficiais a qualquer data ──────────────────────
  // Único endpoint que TODOS os consumidores (top card, Avanço Semanal,
  // Programação Semanal, Portal Cliente) podem chamar para obter PV/EV
  // exatos sem replicar fórmulas. Quando refDate === statusDate gravado no
  // XML, soma snapshots Texto10/Texto7 ponderados por peso financeiro
  // (paridade absoluta com MSP). Para outras datas, cai no cálculo dinâmico
  // por dias corridos. Devolve também o detalhamento por atividade para
  // auditoria/debug (modal Fase 5 consome).
  pvEvOficialAt: protectedProcedure
    .input(z.object({
      revisaoId: z.number(),
      refDate:   z.string(),               // "YYYY-MM-DD"
      modoPesoFinanceiro: z.boolean().optional().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [rev] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.revisaoId)).limit(1);
      if (!rev?.projetoId) return { pv: 0, ev: 0, spi: 0, statusDate: null, snapshotUsed: false, byActivity: [] as any[] };

      const [proj] = await db.select({
        companyId:      planejamentoProjetos.companyId,
        dataCorteAtual: planejamentoProjetos.dataCorteAtual,
        calendarioJson: planejamentoProjetos.calendarioJson,
      }).from(planejamentoProjetos).where(eq(planejamentoProjetos.id, rev.projetoId)).limit(1);
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto da revisão não encontrado." });
      // Tenant isolation: admin bypass (consolidação multi-empresa). Padrão herdado de getDataCorte.
      const isAdminPv = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminPv && String(proj.companyId) !== String(ctx.user.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta revisão." });
      }

      let statusDate: string | null = null;
      try {
        const cal = (proj as any)?.calendarioJson ? JSON.parse((proj as any).calendarioJson) : null;
        statusDate = cal?.statusDateSnapshot ?? (proj?.dataCorteAtual ? toDateStr(proj.dataCorteAtual as any) : null);
      } catch { statusDate = proj?.dataCorteAtual ? toDateStr(proj.dataCorteAtual as any) : null; }

      const [ativs, avs] = await Promise.all([
        db.select().from(planejamentoAtividades).where(eq(planejamentoAtividades.revisaoId, input.revisaoId)),
        db.select({
          atividadeId: planejamentoAvancos.atividadeId,
          semana: planejamentoAvancos.semana,
          percentualAcumulado: planejamentoAvancos.percentualAcumulado,
        }).from(planejamentoAvancos).where(eq(planejamentoAvancos.revisaoId, input.revisaoId)),
      ]);

      // Inline (cópia mínima do shared/planejamentoMath p/ não introduzir alias path no server)
      const num = (v: any): number => { const x = v == null ? 0 : (typeof v === "number" ? v : parseFloat(String(v))); return Number.isFinite(x) ? x : 0; };
      const folhas = ativs.filter(a => !a.isGrupo && !a.isMarco && !a.isIndireta && !a.disabled && a.dataInicio && a.dataFim);
      const usarSnapshot = !!statusDate && input.refDate === statusDate;
      const pesoBruto = input.modoPesoFinanceiro
        ? folhas.reduce((s, a) => s + num(a.pesoFinanceiro), 0)
        : folhas.reduce((s, a) => s + (a.duracaoDias ?? 0), 0);
      const ativComPeso = input.modoPesoFinanceiro
        ? folhas.filter(a => num(a.pesoFinanceiro) > 0).length
        : folhas.filter(a => (a.duracaoDias ?? 0) > 0).length;
      const usarIgual = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
      const pesoTotal = usarIgual ? (folhas.length || 1) : pesoBruto;
      const pesoDe = (a: any): number => usarIgual ? 1 : (input.modoPesoFinanceiro ? num(a.pesoFinanceiro) : (a.duracaoDias ?? 0));

      const latest: Record<number, { val: number; sem: string }> = {};
      for (const av of avs) {
        const semISO = toDateStr(av.semana as any);
        if (semISO > input.refDate) continue;
        const id = av.atividadeId;
        if (!latest[id] || semISO > latest[id].sem) latest[id] = { val: num(av.percentualAcumulado), sem: semISO };
      }

      const fracaoCorrida = (ini: string, ref: string, fim: string): number => {
        const i = new Date(ini + "T12:00:00Z").getTime();
        const r = new Date(ref + "T12:00:00Z").getTime();
        const f = new Date(fim + "T12:00:00Z").getTime();
        if (r <= i) return 0; if (r >= f) return 1; return (r - i) / (f - i);
      };

      let pvSoma = 0, evSoma = 0;
      const byActivity: Array<{
        id: number; eapCodigo: string | null; nome: string;
        pesoPct: number; previstoPct: number; realizadoPct: number;
        previstoSnapshot: number | null; realizadoSnapshot: number | null;
        usouSnapshotPv: boolean; usouSnapshotEv: boolean;
      }> = [];
      for (const a of folhas) {
        const w = pesoDe(a) / pesoTotal;
        const snapPv = a.previstoMspPct == null ? null : num(a.previstoMspPct);
        const snapEv = a.realizadoMspPct == null ? null : num(a.realizadoMspPct);
        let pvPct: number; let usouSnapshotPv = false;
        if (usarSnapshot && snapPv != null) { pvPct = Math.min(100, Math.max(0, snapPv)); usouSnapshotPv = true; }
        else { pvPct = fracaoCorrida(toDateStr(a.dataInicio as any), input.refDate, toDateStr(a.dataFim as any)) * 100; }
        let evPct: number; let usouSnapshotEv = false;
        if (latest[a.id]) { evPct = latest[a.id].val; }
        else if (usarSnapshot && snapEv != null) { evPct = snapEv; usouSnapshotEv = true; }
        else { evPct = 0; }
        pvSoma += pvPct * w;
        evSoma += evPct * w;
        byActivity.push({
          id: a.id, eapCodigo: a.eapCodigo, nome: a.nome,
          pesoPct: +(w * 100).toFixed(4),
          previstoPct: +pvPct.toFixed(2),
          realizadoPct: +evPct.toFixed(2),
          previstoSnapshot: snapPv,
          realizadoSnapshot: snapEv,
          usouSnapshotPv, usouSnapshotEv,
        });
      }
      const pv = +Math.min(100, Math.max(0, pvSoma)).toFixed(2);
      const ev = +Math.min(100, Math.max(0, evSoma)).toFixed(2);
      const spi = pv > 0 ? +(ev / pv).toFixed(4) : 0;
      return { pv, ev, spi, statusDate, snapshotUsed: usarSnapshot, byActivity };
    }),

  getCurvaS: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number(), baselineId: z.number(), usarPesoPorDuracao: z.boolean().optional() }))
    .query(async ({ input }) => computeCurvaSData(input)),

  // Retorna a curva planejada de cada revisão aprovada do projeto (para toggles na Curva S)
  getCurvasTodasRevisoes: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const revisoes = await db.select().from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.projetoId, input.projetoId),
          eq(planejamentoRevisoes.status, "aprovada"),
        ))
        .orderBy(asc(planejamentoRevisoes.numero));

      function gerarCurva(ativs: any[]) {
        const folhas = ativs.filter((a: any) => !a.isGrupo && !a.isIndireta && !a.disabled && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];
        const pesoBruto   = folhas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
        const ativComPeso = folhas.filter((a: any) => n(a.pesoFinanceiro) > 0).length;
        const usarIgual   = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
        const pesoTotal   = usarIgual ? folhas.length : pesoBruto;
        const dates: Map<string, number> = new Map();
        folhas.forEach((a: any) => {
          const parseD = (v: any) => new Date(toDateStr(v).slice(0, 10) + "T12:00:00Z");
          const inicio = parseD(a.dataInicio);
          const fim    = parseD(a.dataFim);
          if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return;
          const inicioSeg = new Date(toMondayStr(inicio) + "T12:00:00Z");
          const fimSeg    = new Date(toMondayStr(fim)    + "T12:00:00Z");
          const weeksDiff2 = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000);
          const dur     = Math.max(1, weeksDiff2 + 1);
          const pAtiv   = usarIgual ? 1 : n(a.pesoFinanceiro);
          const semPeso = pAtiv / dur / pesoTotal * 100;
          let cur = new Date(inicioSeg);
          for (let i = 0; i < dur; i++) {
            const key = toMondayStr(cur);
            dates.set(key, (dates.get(key) ?? 0) + semPeso);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        });
        const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        let acum = 0;
        const pts = sorted.map(([semana, val]) => {
          acum = Math.min(100, acum + val);
          return { semana, acumulado: +acum.toFixed(2) };
        });
        if (pts.length > 0) {
          const primeiraDate   = new Date(pts[0].semana + "T12:00:00Z");
          const semanaAntes    = new Date(primeiraDate.getTime() - 7 * 86400000);
          pts.unshift({ semana: toMondayStr(semanaAntes), acumulado: 0 });
        }
        return pts;
      }

      const resultado = await Promise.all(revisoes.map(async rev => {
        const ativs = await db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, rev.id));
        return {
          revisaoId:  rev.id,
          numero:     rev.numero,
          descricao:  rev.descricao ?? `Rev. ${String(rev.numero).padStart(2, "0")}`,
          isBaseline: rev.isBaseline,
          curva:      gerarCurva(ativs),
        };
      }));

      return resultado;
    }),

  // ── Curva S de Faturamento Real (medições aprovadas acumuladas) ──────────
  getCurvaMedicoes: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const meds = await db.select().from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, input.projetoId))
        .orderBy(asc(planejamentoMedicoes.competencia));
      let acumulado = 0;
      return meds.map(m => {
        acumulado += n(m.valorMedido);
        return {
          competencia:    m.competencia,        // "YYYY-MM"
          valorMedido:    n(m.valorMedido),
          valorAcumulado: +acumulado.toFixed(2),
          status:         m.status ?? "pendente",
        };
      });
    }),

  // ── Toggle disabled em bloco (remover/restaurar do escopo) ────────────────
  toggleAtividadesDisabled: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      revisaoId: z.number(),
      ids:       z.array(z.number()),
      disabled:  z.boolean(),
    }))
    .mutation(async ({ input }) => {
      if (!input.ids.length) return { updated: 0 };
      const db = await getDb();
      // Escopa por projeto+revisão para impedir que IDs de outros projetos
      // sejam alterados (broken-access-control). Só atividades pertencentes ao
      // mesmo projeto/revisão informados serão afetadas — IDs estranhos são
      // silenciosamente ignorados.
      // Quando desativando, força peso_financeiro = '0' para manter a
      // invariante "atividade disabled tem peso 0 sempre" igual ao
      // salvarAtividades. Ao reativar, mantemos o peso atual = 0 e o
      // usuário precisa rodar "Recalcular Pesos" se quiser redistribuir
      // (política conservadora, evita mexer em pesos manuais antigos).
      const setClause = input.disabled
        ? sql`SET disabled = TRUE, peso_financeiro = '0'`
        : sql`SET disabled = FALSE`;
      const res = await db.execute(sql`
        UPDATE planejamento_atividades
        ${setClause}
        WHERE id = ANY(ARRAY[${sql.raw(input.ids.join(","))}]::int[])
          AND projeto_id = ${input.projetoId}
          AND revisao_id = ${input.revisaoId}
      `);
      return { updated: (res as any)?.rowCount ?? input.ids.length };
    }),

  // ── Cronograma de Compras ──────────────────────────────────────────────────
  listarCompras: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisao: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (input.revisao !== undefined) {
        return db.select().from(planejamentoCompras)
          .where(and(
            eq(planejamentoCompras.projetoId, input.projetoId),
            eq(planejamentoCompras.revisao, input.revisao),
          ))
          .orderBy(asc(planejamentoCompras.dataNecessaria));
      }
      // Sem revisao especificada: retorna a revisão mais recente
      const maxRevRes = await db.execute(sql`
        SELECT COALESCE(MAX(revisao), 1) AS max_rev
        FROM planejamento_compras
        WHERE projeto_id = ${input.projetoId}
      `);
      const maxRev = Number((maxRevRes.rows as any[])[0]?.max_rev ?? 1);
      return db.select().from(planejamentoCompras)
        .where(and(
          eq(planejamentoCompras.projetoId, input.projetoId),
          eq(planejamentoCompras.revisao, maxRev),
        ))
        .orderBy(asc(planejamentoCompras.dataNecessaria));
    }),

  listarRevisoesCompras: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Revisões com metadados: busca da tabela de controle, complementando com contagem real
      const revisoes = await db.execute(sql`
        SELECT
          r.revisao,
          r.descricao,
          r.lead_time,
          r.total_itens,
          r.total_custo,
          r.gerado_em,
          r.gerado_por_revisao_cronograma,
          COUNT(c.id)::int                                       AS itens_reais,
          COALESCE(SUM(c.quantidade::numeric * c.custo_unitario::numeric), 0) AS custo_real
        FROM planejamento_compras_revisoes r
        LEFT JOIN planejamento_compras c
          ON c.projeto_id = r.projeto_id AND c.revisao = r.revisao
        WHERE r.projeto_id = ${input.projetoId}
        GROUP BY r.revisao, r.descricao, r.lead_time, r.total_itens, r.total_custo, r.gerado_em, r.gerado_por_revisao_cronograma
        ORDER BY r.revisao DESC
      `);
      return (revisoes.rows as any[]).map(r => ({
        revisao:                    Number(r.revisao),
        descricao:                  r.descricao ?? null,
        leadTime:                   Number(r.lead_time ?? 30),
        totalItens:                 Number(r.itens_reais ?? r.total_itens ?? 0),
        totalCusto:                 parseFloat(r.custo_real ?? r.total_custo ?? "0"),
        geradoEm:                   r.gerado_em ? String(r.gerado_em) : null,
        geradoPorRevisaoCronograma: r.gerado_por_revisao_cronograma ? Number(r.gerado_por_revisao_cronograma) : null,
      }));
    }),

  gerarCronogramaCompras: protectedProcedure
    .input(z.object({
      projetoId:              z.number(),
      leadTime:               z.number().default(30),
      descricao:              z.string().optional(),
      revisaoCronogramaId:    z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { projetoId, leadTime, descricao, revisaoCronogramaId } = input;

      // 1. Cruzamento orçamento × cronograma — itens com custo (mat ou total)
      const rows = await db.execute(sql`
        WITH matched AS (
          SELECT DISTINCT ON (i.id)
            i.id                                   AS item_id,
            i."eapCodigo"                          AS eap,
            i.descricao                            AS nome,
            CASE
              WHEN i."custoTotalMat"::numeric > 0 THEN i."custoTotalMat"::numeric
              ELSE i."custoTotal"::numeric
            END                                    AS custo_mat,
            i."custoTotal"::numeric                AS custo_total,
            i.unidade                              AS unidade,
            COALESCE(i.quantidade::numeric, 0)     AS quantidade,
            a.id                                   AS ativ_id,
            a.data_inicio::text                    AS data_inicio,
            a.data_fim::text                       AS data_fim
          FROM orcamento_itens i
          JOIN planejamento_projetos p
            ON p.orcamento_id = i."orcamentoId"
            AND p.id = ${projetoId}
          JOIN planejamento_atividades a
            ON a.projeto_id = ${projetoId}
            AND NOT a.is_grupo
            AND LOWER(REGEXP_REPLACE(TRIM(a.nome), '[\\s]+', ' ', 'g'))
              = LOWER(REGEXP_REPLACE(TRIM(i.descricao), '[\\s]+', ' ', 'g'))
          WHERE (i."custoTotalMat"::numeric > 0 OR i."custoTotal"::numeric > 0)
            AND a.data_inicio IS NOT NULL
          ORDER BY i.id, a.data_inicio ASC
        )
        SELECT * FROM matched ORDER BY data_inicio
      `);

      const itens = (rows.rows as any[]);
      if (itens.length === 0) {
        throw new Error("Nenhum item encontrado no cruzamento orçamento × cronograma. Verifique se as atividades do cronograma têm o mesmo nome dos itens do orçamento e possuem datas definidas.");
      }

      // 2. Próxima revisão
      const maxRevRes = await db.execute(sql`
        SELECT COALESCE(MAX(revisao), 0) AS max_rev
        FROM planejamento_compras_revisoes
        WHERE projeto_id = ${projetoId}
      `);
      const novaRevisao = Number((maxRevRes.rows as any[])[0]?.max_rev ?? 0) + 1;

      // 3. Gera os itens de compra
      const comprasParaInserir = itens.map((r: any) => {
        const dataInicio = r.data_inicio ? String(r.data_inicio).substring(0, 10) : null;
        let dataNecessaria = dataInicio;
        if (dataInicio) {
          const d = new Date(dataInicio + "T12:00:00");
          d.setDate(d.getDate() - leadTime);
          dataNecessaria = d.toISOString().split("T")[0];
        }
        const qtd = parseFloat(r.quantidade ?? "1") || 1;
        const custoMat = parseFloat(r.custo_mat ?? "0") || 0;
        return {
          projetoId,
          revisao: novaRevisao,
          fonte: "auto" as const,
          item: String(r.nome ?? ""),
          unidade: r.unidade ? String(r.unidade) : "un",
          quantidade: String(qtd),
          custoUnitario: String(+(custoMat / qtd).toFixed(4)),
          dataNecessaria: dataNecessaria ?? dataInicio ?? new Date().toISOString().split("T")[0],
          atividadeDataInicio: dataInicio,
          leadTime,
          eapCodigo: r.eap ? String(r.eap) : null,
          status: "pendente" as const,
          observacoes: `Gerado automaticamente — EAP ${r.eap ?? "?"} — Rev. Crono ${revisaoCronogramaId ?? "—"}`,
        };
      });

      await db.insert(planejamentoCompras).values(comprasParaInserir);

      // 4. Registra metadados da revisão
      const totalCusto = comprasParaInserir.reduce(
        (s, c) => s + parseFloat(c.quantidade) * parseFloat(c.custoUnitario), 0
      );
      await db.insert(planejamentoComprasRevisoes).values({
        projetoId,
        revisao: novaRevisao,
        descricao: descricao ?? `Gerado automaticamente (lead time ${leadTime}d)`,
        leadTime,
        totalItens: comprasParaInserir.length,
        totalCusto: String(+totalCusto.toFixed(2)),
        geradoPorRevisaoCronograma: revisaoCronogramaId ?? null,
      });

      return { revisao: novaRevisao, totalItens: comprasParaInserir.length, totalCusto };
    }),

  criarCompra: protectedProcedure
    .input(z.object({
      projetoId:      z.number(),
      item:           z.string(),
      unidade:        z.string().optional(),
      quantidade:     z.number().optional(),
      custoUnitario:  z.number().optional(),
      dataNecessaria: z.string(),
      status:         z.string().optional(),
      fornecedor:     z.string().optional(),
      observacoes:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      return db.insert(planejamentoCompras).values({
        projetoId:      input.projetoId,
        item:           input.item,
        unidade:        input.unidade ?? "un",
        quantidade:     String(input.quantidade ?? 1),
        custoUnitario:  String(input.custoUnitario ?? 0),
        dataNecessaria: input.dataNecessaria,
        status:         input.status ?? "pendente",
        fornecedor:     input.fornecedor,
        observacoes:    input.observacoes,
      }).returning();
    }),

  atualizarCompra: protectedProcedure
    .input(z.object({
      id:             z.number(),
      item:           z.string().optional(),
      unidade:        z.string().optional(),
      quantidade:     z.number().optional(),
      custoUnitario:  z.number().optional(),
      dataNecessaria: z.string().optional(),
      dataPedido:     z.string().nullable().optional(),
      status:         z.string().optional(),
      fornecedor:     z.string().nullable().optional(),
      observacoes:    z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const upd: any = { atualizadoEm: new Date() };
      if (rest.item           !== undefined) upd.item           = rest.item;
      if (rest.unidade        !== undefined) upd.unidade        = rest.unidade;
      if (rest.quantidade     !== undefined) upd.quantidade     = String(rest.quantidade);
      if (rest.custoUnitario  !== undefined) upd.custoUnitario  = String(rest.custoUnitario);
      if (rest.dataNecessaria !== undefined) upd.dataNecessaria = rest.dataNecessaria;
      if (rest.dataPedido     !== undefined) upd.dataPedido     = rest.dataPedido;
      if (rest.status         !== undefined) upd.status         = rest.status;
      if (rest.fornecedor     !== undefined) upd.fornecedor     = rest.fornecedor;
      if (rest.observacoes    !== undefined) upd.observacoes    = rest.observacoes;
      return db.update(planejamentoCompras).set(upd)
        .where(eq(planejamentoCompras.id, id)).returning();
    }),

  excluirCompra: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      return db.delete(planejamentoCompras)
        .where(eq(planejamentoCompras.id, input.id));
    }),

  deletarRevisaoCompras: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisao: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(planejamentoCompras)
        .where(and(
          eq(planejamentoCompras.projetoId, input.projetoId),
          eq(planejamentoCompras.revisao,   input.revisao),
        ));
      await db.delete(planejamentoComprasRevisoes)
        .where(and(
          eq(planejamentoComprasRevisoes.projetoId, input.projetoId),
          eq(planejamentoComprasRevisoes.revisao,   input.revisao),
        ));
      return { ok: true };
    }),

  // ── Cruzamento Orçamento × Cronograma ─────────────────────────────────────
  obterCruzamentoOrcCronograma: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Cruzamento orçamento × cronograma: usa apenas itens-FOLHA do orçamento
      // (sem sub-itens) para evitar dupla contagem de valores acumulados em itens-pai.
      // Cada item pode cruzar com MÚLTIPLAS atividades (mesmo nome em pavimentos diferentes).
      // Nesse caso o valor do item é dividido igualmente entre as N atividades (valor/N).
      const revAtiva = await db.execute(sql`
        SELECT r.id FROM planejamento_revisoes r
        WHERE r.projeto_id = ${input.projetoId}
          AND r.status = 'aprovada'
        ORDER BY r.numero DESC LIMIT 1
      `);
      const revId = (revAtiva.rows as any[])[0]?.id ?? 0;

      const rows = await db.execute(sql`
        WITH orc_scope AS (
          SELECT i.*
          FROM orcamento_itens i
          JOIN planejamento_projetos p ON p.orcamento_id = i."orcamentoId" AND p.id = ${input.projetoId}
          WHERE (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
        ),
        folhas AS (
          SELECT o.*
          FROM orc_scope o
          WHERE NOT EXISTS (
            SELECT 1 FROM orc_scope c
            WHERE c."eapCodigo" LIKE o."eapCodigo" || '.%'
              AND c.id != o.id
          )
        ),
        norm_name AS (
          SELECT *, LOWER(REGEXP_REPLACE(TRIM(descricao), '[[:space:]]+', ' ', 'g')) AS nome_norm
          FROM folhas
        ),
        norm_ativ AS (
          SELECT *, LOWER(REGEXP_REPLACE(TRIM(nome), '[[:space:]]+', ' ', 'g')) AS nome_norm
          FROM planejamento_atividades
          WHERE projeto_id = ${input.projetoId}
            AND revisao_id = ${revId}
            AND NOT is_grupo
            AND NOT disabled
            AND data_inicio IS NOT NULL
            AND data_fim IS NOT NULL
        ),
        match_exact AS (
          SELECT i.id AS item_id, a.id AS ativ_id
          FROM norm_name i
          JOIN norm_ativ a ON a.nome_norm = i.nome_norm
        ),
        match_contains AS (
          SELECT i.id AS item_id, a.id AS ativ_id
          FROM norm_name i
          JOIN norm_ativ a ON (a.nome_norm LIKE '%' || i.nome_norm || '%' OR i.nome_norm LIKE '%' || a.nome_norm || '%')
          WHERE NOT EXISTS (SELECT 1 FROM match_exact m WHERE m.item_id = i.id)
            AND LENGTH(i.nome_norm) >= 5
            AND LENGTH(a.nome_norm) >= 5
        ),
        all_matches AS (
          SELECT * FROM match_exact
          UNION ALL
          SELECT * FROM match_contains
        ),
        all_pairs AS (
          SELECT
            i.id                                   AS item_id,
            i."eapCodigo"                          AS eap,
            i.descricao                            AS nome,
            i."vendaTotal"::numeric                AS venda_total,
            i."metaTotal"::numeric                 AS meta_total,
            i."custoTotal"::numeric                AS custo_total,
            i."custoTotalMat"::numeric             AS custo_mat,
            i."custoTotalMdo"::numeric             AS custo_mdo,
            i.unidade                              AS unidade,
            COALESCE(i.quantidade::numeric, 0)     AS quantidade,
            a.id                                   AS ativ_id,
            a.data_inicio::text                    AS data_inicio,
            a.data_fim::text                       AS data_fim,
            a.ordem                                AS ordem,
            COUNT(*) OVER (PARTITION BY i.id)      AS n_ativs
          FROM folhas i
          JOIN all_matches m ON m.item_id = i.id
          JOIN norm_ativ a ON a.id = m.ativ_id
        )
        SELECT
          item_id, eap, nome,
          (venda_total / n_ativs) AS venda_total,
          (meta_total  / n_ativs) AS meta_total,
          (custo_total / n_ativs) AS custo_total,
          (custo_mat   / n_ativs) AS custo_mat,
          (custo_mdo   / n_ativs) AS custo_mdo,
          unidade,
          (quantidade  / n_ativs) AS quantidade,
          ativ_id, data_inicio, data_fim, ordem
        FROM all_pairs
        ORDER BY ordem
      `);

      // Busca totais do orçamento para normalização dos 3 cenários
      const orcRes = await db.execute(sql`
        SELECT
          COALESCE(o.valor_negociado::numeric, o."totalVenda"::numeric, o."totalMeta"::numeric, 0) AS valor_venda,
          COALESCE(o."totalMeta"::numeric, 0)       AS valor_meta,
          COALESCE(o."totalCusto"::numeric, 0)      AS valor_custo,
          COALESCE(o."totalMateriais"::numeric, 0)  AS total_mat_orc,
          COALESCE(o."totalMdo"::numeric, 0)        AS total_mdo_orc
        FROM orcamentos o
        JOIN planejamento_projetos p ON p.orcamento_id = o.id
        WHERE p.id = ${input.projetoId}
        LIMIT 1
      `);
      const orcRow     = (orcRes.rows as any[])[0];
      const valorVenda = parseFloat(orcRow?.valor_venda ?? "0") || 0;
      const valorMeta  = parseFloat(orcRow?.valor_meta  ?? "0") || 0;
      const valorCusto = parseFloat(orcRow?.valor_custo ?? "0") || 0;
      const totalMatOrc = parseFloat(orcRow?.total_mat_orc ?? "0") || 0;
      const totalMdoOrc = parseFloat(orcRow?.total_mdo_orc ?? "0") || 0;

      const rawItens = (rows.rows as any[]).map(r => ({
        ativId:      Number(r.ativ_id),
        eap:         String(r.eap ?? ""),
        nome:        String(r.nome ?? ""),
        dataInicio:  r.data_inicio ? String(r.data_inicio).substring(0, 10) : null,
        dataFim:     r.data_fim    ? String(r.data_fim).substring(0, 10)    : null,
        ordem:       Number(r.ordem ?? 0),
        vendaRaw:    parseFloat(r.venda_total ?? "0") || 0,
        metaRaw:     parseFloat(r.meta_total  ?? "0") || 0,
        custoRaw:    parseFloat(r.custo_total ?? "0") || 0,
        custoMatRaw: parseFloat(r.custo_mat   ?? "0") || 0,
        custoMdoRaw: parseFloat(r.custo_mdo   ?? "0") || 0,
        unidade:     r.unidade ? String(r.unidade) : null,
        quantidade:  parseFloat(r.quantidade  ?? "0") || 0,
      }));

      // Fatores de normalização: escalona cada cenário para o total do orçamento
      const sumVendaRaw = rawItens.reduce((s, i) => s + i.vendaRaw, 0);
      const sumMetaRaw  = rawItens.reduce((s, i) => s + i.metaRaw,  0);
      const sumCustoRaw = rawItens.reduce((s, i) => s + i.custoRaw, 0);
      const sumMatRaw   = rawItens.reduce((s, i) => s + i.custoMatRaw, 0);
      const sumMdoRaw   = rawItens.reduce((s, i) => s + i.custoMdoRaw, 0);

      const escVenda = sumVendaRaw > 0 && valorVenda > 0 ? valorVenda / sumVendaRaw : 1;
      const escMeta  = sumMetaRaw  > 0 && valorMeta  > 0 ? valorMeta  / sumMetaRaw  : escVenda;
      const escCusto = sumCustoRaw > 0 && valorCusto > 0 ? valorCusto / sumCustoRaw : escVenda;
      const escMat   = sumMatRaw   > 0 && totalMatOrc > 0 ? totalMatOrc / sumMatRaw  : escCusto;
      const escMdo   = sumMdoRaw   > 0 && totalMdoOrc > 0 ? totalMdoOrc / sumMdoRaw  : escCusto;

      const itens = rawItens.map(i => ({
        ...i,
        vendaTotal: +(i.vendaRaw    * escVenda).toFixed(4),
        metaTotal:  +(i.metaRaw     * escMeta).toFixed(4),
        custoNorm:  +(i.custoRaw    * escCusto).toFixed(4),
        custoMat:   +(i.custoMatRaw * escMat).toFixed(4),
        custoMdo:   +(i.custoMdoRaw * escMdo).toFixed(4),
      }));

      const totalVenda = itens.reduce((s, i) => s + i.vendaTotal, 0);
      const totalMeta  = itens.reduce((s, i) => s + i.metaTotal,  0);
      const totalCusto = itens.reduce((s, i) => s + i.custoNorm,  0);
      const totalMat   = itens.reduce((s, i) => s + i.custoMat,   0);
      const totalMdo   = itens.reduce((s, i) => s + i.custoMdo,   0);

      // Busca breakdown BDI do orçamento vinculado ao projeto
      const bdiRes = await db.execute(sql`
        SELECT DISTINCT ON (ob.codigo)
          ob.codigo,
          ob.percentual::float8          AS percentual,
          ob."valorAbsoluto"::float8     AS valor_absoluto
        FROM orcamento_bdi ob
        JOIN planejamento_projetos p ON p.orcamento_id = ob."orcamentoId"
        WHERE p.id = ${input.projetoId}
          AND ob.codigo IN ('CI','DI-01','DI-02','DI-03','DI-04','DI-05','DI-06','DI-07','DI-08','DI-10','L-01')
        ORDER BY ob.codigo, ob.id
      `);
      const bdiMap: Record<string, { pct: number; val: number }> = {};
      (bdiRes.rows as any[]).forEach(r => {
        bdiMap[String(r.codigo)] = {
          pct: Number(r.percentual)    || 0,
          val: Number(r.valor_absoluto) || 0,
        };
      });
      const bdiBreakdown = {
        ci:         bdiMap['CI']?.val ?? 0,   // valor absoluto do Custo Indireto da Obra
        admCentral: bdiMap['DI-01']?.pct ?? 0, // % de Venda
        impostos:   ['DI-02','DI-03','DI-04','DI-05','DI-06','DI-07']
                      .reduce((s, c) => s + (bdiMap[c]?.pct ?? 0), 0), // soma % tributos sobre Venda
        risco:      bdiMap['DI-08']?.pct ?? 0, // % de Venda
        comissao:   bdiMap['DI-10']?.pct ?? 0, // % de Venda
        lucro:      bdiMap['L-01']?.pct ?? 0,  // % de Venda (L-01 Lucro Bruto)
      };

      // Rev. 1350: MDO no preço de VENDA (com BDI aplicado) — base correta para o
      // SINAL/Mobilização quando "Sobre: Mão de Obra". Usa o mesmo padrão do
      // orcamento.ts (vendaMdo = custoMdo / bdiDivisor; equivalente a custo*venda/custo).
      const totalMdoVenda = totalCusto > 0
        ? +(totalMdo * totalVenda / totalCusto).toFixed(2)
        : totalMdo;

      return {
        itens,
        totalVenda, totalMeta, totalCusto, totalMat, totalMdo,
        totalMdoVenda,
        valorBase: valorVenda,
        valorBaseMeta: valorMeta,
        valorBaseCusto: valorCusto,
        bdiBreakdown,
      };
    }),

  // ── Medições Financeiras ───────────────────────────────────────────────────
  listarMedicoes: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, input.projetoId))
        .orderBy(asc(planejamentoMedicoes.competencia));
    }),

  salvarMedicao: protectedProcedure
    .input(z.object({
      projetoId:          z.number(),
      competencia:        z.string(),
      numero:             z.number().optional(),
      valorPrevisto:      z.number().optional(),
      valorMedido:        z.number().optional(),
      percentualPrevisto: z.number().optional(),
      percentualMedido:   z.number().optional(),
      status:             z.string().optional(),
      observacoes:        z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(planejamentoMedicoes)
        .where(and(
          eq(planejamentoMedicoes.projetoId, input.projetoId),
          eq(planejamentoMedicoes.competencia, input.competencia),
        )).limit(1);

      const data = {
        projetoId:          input.projetoId,
        competencia:        input.competencia,
        numero:             input.numero ?? 0,
        valorPrevisto:      String(input.valorPrevisto ?? 0),
        valorMedido:        String(input.valorMedido ?? 0),
        percentualPrevisto: String(input.percentualPrevisto ?? 0),
        percentualMedido:   String(input.percentualMedido ?? 0),
        status:             input.status ?? "pendente",
        observacoes:        input.observacoes ?? null,
        atualizadoEm:       new Date(),
      };

      let result;
      if (existing.length > 0) {
        result = await db.update(planejamentoMedicoes).set(data)
          .where(eq(planejamentoMedicoes.id, existing[0].id)).returning();
      } else {
        result = await db.insert(planejamentoMedicoes).values(data).returning();
      }
      // Gatilho financeiro — medição de planejamento gera receita imediatamente
      try {
        const [projRow] = await db
          .select({ companyId: planejamentoProjetos.companyId })
          .from(planejamentoProjetos)
          .where(eq(planejamentoProjetos.id, input.projetoId))
          .limit(1);
        if (projRow?.companyId) {
          const { triggerFinancialSync } = await import("../services/financialEventTrigger");
          triggerFinancialSync(projRow.companyId, input.competencia + "-01");
        }
      } catch {}
      return result;
    }),

  excluirMedicao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Antes de excluir: busca a medição para saber company e mês (para o gatilho)
      const [medicao] = await db
        .select({ projetoId: planejamentoMedicoes.projetoId, competencia: planejamentoMedicoes.competencia })
        .from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.id, input.id))
        .limit(1);

      // Remove o financial_revenue vinculado se ainda não faturado/recebido
      try {
        await db.execute(sql`
          DELETE FROM financial_revenue
          WHERE medicao_id = ${input.id}
            AND status IN ('a_faturar', 'obra_previsto')
        `);
      } catch {}

      const result = await db.delete(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.id, input.id));

      // Dispara re-sincronização financeira em background
      if (medicao?.projetoId) {
        try {
          const [projRow] = await db
            .select({ companyId: planejamentoProjetos.companyId })
            .from(planejamentoProjetos)
            .where(eq(planejamentoProjetos.id, medicao.projetoId))
            .limit(1);
          if (projRow?.companyId) {
            const { triggerFinancialSync } = await import("../services/financialEventTrigger");
            triggerFinancialSync(projRow.companyId, medicao.competencia + "-01");
          }
        } catch {}
      }

      return result;
    }),

  // ── Configuração de Modalidade de Medição ────────────────────────────────
  getConfigMedicao: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cfg] = await db.select().from(planejamentoMedicaoConfig)
        .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
        .limit(1);

      // Sugestão de Faturamento Direto: soma da aba F.D. do BDI do orçamento vinculado ao projeto.
      // O usuário pode sobrescrever esse valor (gravado em fd_valor); quando fd_valor é NULL usamos esta sugestão.
      // Rev. 1345: também retornamos o orcamentoId e o nº de itens para o usuário diagnosticar
      // casos onde o projeto está vinculado a um orçamento sem F.D. lançado.
      let fdSugerido = 0;
      let fdItensCount = 0;
      const [proj] = await db.select({ orcamentoId: planejamentoProjetos.orcamentoId })
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId))
        .limit(1);
      if (proj?.orcamentoId) {
        // Rev. 1342: db.execute retorna { rows: [...] } — destruturar como array dava undefined,
        // então fdSugerido sempre vinha 0 mesmo quando havia linhas em bdi_fd.
        const res: any = await db.execute(sql`
          SELECT COALESCE(SUM(total),0)::numeric AS total, COUNT(*)::int AS n
          FROM bdi_fd
          WHERE orcamento_id = ${proj.orcamentoId}
        `);
        const row = res?.rows?.[0] ?? res?.[0];
        fdSugerido = Number(row?.total ?? 0) || 0;
        fdItensCount = Number(row?.n ?? 0) || 0;
      }
      const orcamentoIdProj = proj?.orcamentoId ?? null;
      return cfg
        ? { ...cfg, fdSugerido, fdItensCount, orcamentoIdProj }
        : { fdSugerido, fdItensCount, orcamentoIdProj } as any;
    }),

  salvarConfigMedicao: protectedProcedure
    .input(z.object({
      projetoId:         z.number(),
      tipoMedicao:       z.enum(["avanco", "parcela_fixa"]),
      diaCorte:          z.number().min(1).max(31),
      entrada:           z.number().optional(),
      numeroParcelas:    z.number().min(1).max(120).optional(),
      inicioFaturamento: z.string().nullable().optional(),
      sinalPct:          z.number().min(0).max(100).optional(),
      sinalValor:        z.number().optional(),
      fdValor:           z.number().nullable().optional(),
      retencaoPct:       z.number().min(0).max(100).optional(),
      reterSinal:        z.boolean().optional(),
      dataInicioObra:    z.string().nullable().optional(),
      dataPrimeiroFaturamento: z.string().nullable().optional(),
      prazoRecebimentoDiasUteis: z.number().int().min(0).max(180).optional(),
      sinalBase:         z.enum(["contrato", "mao_de_obra"]).optional(),
      valorParcelaFixa:  z.number().min(0).optional(),
      revisadoPorNome:   z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Fetch current revision number to increment
      const [existing] = await db.select({
        id: planejamentoMedicaoConfig.id,
        revisaoNumero: planejamentoMedicaoConfig.revisaoNumero,
      }).from(planejamentoMedicaoConfig)
        .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
        .limit(1);

      const nextRevisao = (existing?.revisaoNumero ?? 0) + (existing ? 1 : 0);
      const revisadoPorNome = input.revisadoPorNome ?? ctx.user.name ?? ctx.user.email ?? "Sistema";
      const agora = new Date();

      const data = {
        projetoId:         input.projetoId,
        tipoMedicao:       input.tipoMedicao,
        diaCorte:          input.diaCorte,
        entrada:           String(input.entrada ?? 0),
        numeroParcelas:    input.numeroParcelas ?? 6,
        inicioFaturamento: input.inicioFaturamento
          ? (input.inicioFaturamento.length === 7 ? input.inicioFaturamento + "-01" : input.inicioFaturamento.substring(0, 10))
          : null,
        sinalPct:          String(input.sinalPct ?? 0),
        sinalValor:        String(input.sinalValor ?? 0),
        fdValor:           input.fdValor == null ? null : String(input.fdValor),
        retencaoPct:       String(input.retencaoPct ?? 5),
        reterSinal:        input.reterSinal ?? false,
        dataInicioObra:    input.dataInicioObra ?? null,
        dataPrimeiroFaturamento: input.dataPrimeiroFaturamento ?? null,
        prazoRecebimentoDiasUteis: input.prazoRecebimentoDiasUteis ?? 15,
        sinalBase:         input.sinalBase ?? "contrato",
        valorParcelaFixa:  String(input.valorParcelaFixa ?? 0),
        bloqueado:         false,
        revisaoNumero:     nextRevisao,
        revisadoPorNome:   nextRevisao > 0 ? revisadoPorNome : undefined,
        revisadoEm:        nextRevisao > 0 ? agora : undefined,
        atualizadoEm:      agora,
      };

      const updateData = {
        tipoMedicao:       data.tipoMedicao,
        diaCorte:          data.diaCorte,
        entrada:           data.entrada,
        numeroParcelas:    data.numeroParcelas,
        inicioFaturamento: data.inicioFaturamento,
        sinalPct:          data.sinalPct,
        sinalValor:        data.sinalValor,
        fdValor:           data.fdValor,
        retencaoPct:       data.retencaoPct,
        reterSinal:        data.reterSinal,
        dataInicioObra:    data.dataInicioObra,
        dataPrimeiroFaturamento: data.dataPrimeiroFaturamento,
        prazoRecebimentoDiasUteis: data.prazoRecebimentoDiasUteis,
        sinalBase:         data.sinalBase,
        valorParcelaFixa:  data.valorParcelaFixa,
        bloqueado:         false,
        revisaoNumero:     nextRevisao,
        revisadoPorNome:   data.revisadoPorNome,
        revisadoEm:        data.revisadoEm,
        atualizadoEm:      agora,
      };

      await db.insert(planejamentoMedicaoConfig)
        .values(data as any)
        .onConflictDoUpdate({
          target: planejamentoMedicaoConfig.projetoId,
          set: updateData as any,
        });

      if (nextRevisao > 0) {
        await createAuditLog({
          userId:     ctx.user.id,
          userName:   revisadoPorNome,
          action:     "UPDATE",
          module:     "planejamento",
          entityType: "medicao_config",
          entityId:   input.projetoId,
          details:    `Configuração de medição revisada (Rev ${nextRevisao}): tipo=${input.tipoMedicao}, entrada=${input.entrada ?? 0}, parcelas=${input.numeroParcelas ?? 6}`,
        });
      }

      return { success: true, revisaoNumero: nextRevisao };
    }),

  toggleBloqueioMedicao: protectedProcedure
    .input(z.object({ projetoId: z.number(), bloqueado: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!input.bloqueado && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode desbloquear a configuração de medição." });
      }
      const db = await getDb();
      const [existing] = await db.select({ id: planejamentoMedicaoConfig.id })
        .from(planejamentoMedicaoConfig)
        .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
        .limit(1);
      if (!existing) return { success: false };
      await db.update(planejamentoMedicaoConfig)
        .set({ bloqueado: input.bloqueado, atualizadoEm: new Date() })
        .where(eq(planejamentoMedicaoConfig.id, existing.id));
      if (!input.bloqueado) {
        await createAuditLog({
          userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? "Sistema",
          action: "UPDATE", module: "planejamento", entityType: "medicao_config",
          entityId: input.projetoId, details: "Configuração de medição desbloqueada pelo Admin Master para revisão.",
        });
      }
      return { success: true };
    }),

  getParcelasPagasConfig: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Usa planejamento_medicoes como fonte de verdade (syncado pelo registrarRecebimento)
      const rows = await db.select({
        competencia: planejamentoMedicoes.competencia,
        valorRecebido: planejamentoMedicoes.valorMedido,
        status: planejamentoMedicoes.status,
      }).from(planejamentoMedicoes)
        .where(and(
          eq(planejamentoMedicoes.projetoId, input.projetoId),
          eq(planejamentoMedicoes.status, "confirmado"),
          gt(planejamentoMedicoes.valorMedido, "0"),
        ));
      return { meses: rows.map(r => ({ competencia: r.competencia ?? "", valorRecebido: Number(r.valorRecebido ?? 0) })) };
    }),

  // ── Programação Semanal — recursos por EAP ───────────────────────────────
  buscarRecursosSemana: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      orcamentoId:     z.number(),
      eapCodigos:      z.array(z.string()),
      atividadeNomes:  z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      if (!input.eapCodigos.length && !input.atividadeNomes?.length) return { itens: [], insumos: [], matchedByNome: false };
      const db = await getDb();

      const colSelect = {
        eapCodigo:     orcamentoItens.eapCodigo,
        descricao:     orcamentoItens.descricao,
        unidade:       orcamentoItens.unidade,
        quantidade:    orcamentoItens.quantidade,
        custoUnitMat:  orcamentoItens.custoUnitMat,
        custoUnitMdo:  orcamentoItens.custoUnitMdo,
        custoTotal:    orcamentoItens.custoTotal,
        servicoCodigo: orcamentoItens.servicoCodigo,
        tipo:          orcamentoItens.tipo,
      };

      // 1ª tentativa: match por EAP código
      let itens: any[] = [];
      if (input.eapCodigos.length) {
        itens = await db.select(colSelect).from(orcamentoItens)
          .where(and(
            eq(orcamentoItens.orcamentoId, input.orcamentoId),
            eq(orcamentoItens.companyId,   input.companyId),
            inArray(orcamentoItens.eapCodigo, input.eapCodigos),
          ));
      }

      // 2ª tentativa: fallback por nome da atividade (quando EAPs não coincidem)
      let matchedByNome = false;
      if (itens.length === 0 && input.atividadeNomes?.length) {
        const nomes = input.atividadeNomes.slice(0, 15); // limita a 15 buscas
        const conditions = nomes
          .map(n => n.trim().substring(0, 40))
          .filter(n => n.length >= 5)
          .map(n => ilike(orcamentoItens.descricao, `%${n}%`));

        if (conditions.length) {
          itens = await db.select(colSelect).from(orcamentoItens)
            .where(and(
              eq(orcamentoItens.orcamentoId, input.orcamentoId),
              eq(orcamentoItens.companyId,   input.companyId),
              or(...conditions),
            ));
          if (itens.length > 0) matchedByNome = true;
        }
      }

      // Busca insumos das composições ligadas aos itens encontrados
      const servCodes = [...new Set(itens.map(i => i.servicoCodigo).filter(Boolean))] as string[];
      let insumos: any[] = [];
      if (servCodes.length) {
        insumos = await db.select({
          composicaoCodigo: composicaoInsumos.composicaoCodigo,
          insumoDescricao:  composicaoInsumos.insumoDescricao,
          unidade:          composicaoInsumos.unidade,
          quantidade:       composicaoInsumos.quantidade,
          alocacaoMat:      composicaoInsumos.alocacaoMat,
          alocacaoMdo:      composicaoInsumos.alocacaoMdo,
          custoUnitTotal:   composicaoInsumos.custoUnitTotal,
        }).from(composicaoInsumos)
          .where(and(
            eq(composicaoInsumos.companyId, input.companyId),
            inArray(composicaoInsumos.composicaoCodigo, servCodes),
          ));
      }

      return { itens, insumos, matchedByNome };
    }),

  // ── Equipamentos disponíveis no almoxarifado / patrimônio ────────────────
  buscarEquipamentosDisponiveis: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      termos:     z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Busca itens do almoxarifado ativos
      const almoxRows = await db.select({
        id:               almoxarifadoItens.id,
        nome:             almoxarifadoItens.nome,
        categoria:        almoxarifadoItens.categoria,
        quantidadeAtual:  almoxarifadoItens.quantidadeAtual,
        quantidadeMinima: almoxarifadoItens.quantidadeMinima,
        unidade:          almoxarifadoItens.unidade,
        codigoInterno:    almoxarifadoItens.codigoInterno,
      })
      .from(almoxarifadoItens)
      .where(and(
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ));

      // Busca cadastro de equipamentos (patrimônio)
      const equipRows = await db.select({
        id:                equipment.id,
        nome:              equipment.nome,
        tipoEquipamento:   equipment.tipoEquipamento,
        statusEquipamento: equipment.statusEquipamento,
        localizacao:       equipment.localizacao,
        responsavel:       equipment.responsavel,
      })
      .from(equipment)
      .where(eq(equipment.companyId, input.companyId));

      return {
        almoxarifado: almoxRows.map(r => ({
          id:            r.id,
          nome:          r.nome,
          categoria:     r.categoria ?? null,
          qtdDisponivel: parseFloat(r.quantidadeAtual ?? "0"),
          qtdMinima:     parseFloat(r.quantidadeMinima ?? "0"),
          unidade:       r.unidade,
          codigo:        r.codigoInterno ?? null,
          disponivel:    parseFloat(r.quantidadeAtual ?? "0") > 0,
        })),
        patrimonio: equipRows.map(r => ({
          id:        r.id,
          nome:      r.nome,
          tipo:      r.tipoEquipamento ?? null,
          status:    r.statusEquipamento,
          local:     r.localizacao ?? null,
          disponivel: r.statusEquipamento === "Ativo" || r.statusEquipamento === "Disponível",
        })),
      };
    }),

  // ── Validação EAP cronograma × orçamento ─────────────────────────────────
  validarEapCronograma: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      orcamentoId: z.number(),
      eapCodigos:  z.array(z.string()),
    }))
    .query(async ({ input }) => {
      if (!input.orcamentoId || !input.eapCodigos.length) return { ok: [], semOrcamento: [], semCronograma: [] };
      const db = await getDb();

      const itens = await db.select({ eapCodigo: orcamentoItens.eapCodigo })
        .from(orcamentoItens)
        .where(and(
          eq(orcamentoItens.orcamentoId, input.orcamentoId),
          eq(orcamentoItens.companyId,   input.companyId),
        ));

      const eapOrc  = new Set(itens.map(i => i.eapCodigo));
      const eapCron = new Set(input.eapCodigos);

      const ok             = input.eapCodigos.filter(e => eapOrc.has(e));
      const semOrcamento   = input.eapCodigos.filter(e => !eapOrc.has(e));
      const semCronograma  = [...eapOrc].filter(e => !eapCron.has(e));

      return { ok, semOrcamento, semCronograma };
    }),

  // ── Rev. 1797 — Diagnóstico EAP Orçamento ↔ Cronograma ──────────────────
  // Compara TODOS os eapCodigo do orçamento vinculado ao projeto contra
  // TODOS os eapCodigo das atividades-folha da revisão. Retorna 3 listas
  // ricas (com descrição, custo e nome) para a tela de diagnóstico.
  // Garantia da R-013: o EAP do orçamento é fonte da verdade — divergências
  // são EXIBIDAS para o usuário corrigir, NUNCA renumeradas silenciosamente.
  diagnosticoEapOrcVsCron: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();

      const [proj] = await db.select({
        id: planejamentoProjetos.id,
        companyId: planejamentoProjetos.companyId,
        obraId: planejamentoProjetos.obraId,
        orcamentoId: planejamentoProjetos.orcamentoId,
      }).from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);

      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      // Rev. 2984 — Tenant isolation por OBRA (leitura; este diagnóstico é exibido na
      // tela de detalhe sem gate de admin). admin/admin_master atravessa. Antes negava
      // o engenheiro de campo cuja empresa-default difere da empresa do projeto.
      const isAdminDg = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminDg) {
        const allowedObraIds = await resolvePlanAllowedObraIds(
          db, ctx.user.id, ctx.user.role, ctx.user.email, Number(proj.companyId),
        );
        if (allowedObraIds !== null && (proj.obraId == null || !allowedObraIds.includes(Number(proj.obraId)))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
        }
      }

      // R-013 / segurança — valida que a revisão pertence ao projeto informado
      // (impede que um usuário vaze atividades de outro projeto/tenant via revisaoId).
      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.id, input.revisaoId),
          eq(planejamentoRevisoes.projetoId, input.projetoId),
        )).limit(1);
      if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não encontrada para este projeto." });

      if (!proj.orcamentoId) {
        return {
          status: "sem_orcamento" as const,
          orcamentoId: null,
          totalOrcamento: 0,
          totalCronograma: 0,
          casados: [] as Array<{ eapCodigo: string; descricaoOrc: string; nomeCron: string; custoTotal: number; descBate: boolean }>,
          soNoOrcamento: [] as Array<{ eapCodigo: string; descricao: string; custoTotal: number; nivel: number }>,
          soNoCronograma: [] as Array<{ eapCodigo: string; nome: string; isGrupo: boolean; isMarco: boolean }>,
        };
      }

      // Defesa em profundidade: valida orçamento pertence ao mesmo tenant antes de listar itens
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos).where(eq(orcamentos.id, proj.orcamentoId)).limit(1);
      if (!orc) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento vinculado não encontrado." });
      // Rev. 2984 — defesa em profundidade: o orçamento tem de pertencer à MESMA empresa
      // do projeto já autorizado (antes comparava com ctx.user.companyId, o que negava
      // multi-empresa). Como o acesso ao projeto já foi validado por obra acima, basta
      // garantir orc.companyId === proj.companyId.
      if (!isAdminDg && String(orc.companyId) !== String(proj.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para o orçamento vinculado." });
      }

      const [itensOrc, ativs] = await Promise.all([
        db.select({
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          custoTotal: orcamentoItens.custoTotal,
          nivel: orcamentoItens.nivel,
          tipo: orcamentoItens.tipo,
        }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, proj.orcamentoId)),
        db.select({
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          isGrupo: planejamentoAtividades.isGrupo,
          isMarco: planejamentoAtividades.isMarco,
        }).from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId)),
      ]);

      // Rev. 1821 — chave NORMALIZADA via eapCanonico (mesma chave usada pelo
      // recalcularPesosCore). Antes era literal: "02.16.02.01" (orçamento) ≠
      // "2.16.2.1" (cronograma) → tudo caía em "Só no Orçamento" / "Só no
      // Cronograma" embora seja a MESMA EAP. Agora bate corretamente. O EAP
      // exibido na UI continua o LITERAL (preservamos no objeto: chave do Map
      // = canônica, valor = item original com `eapCodigo` literal).
      //
      // Fix code-review #4: AGREGAR quando 2+ itens caem na mesma chave
      // canônica em vez de sobrescrever (last-write-wins descartaria itens).
      // Caso real raro mas possível: orçamento com "02.16" e "2.16" lançados
      // como itens distintos (erro de cadastro do usuário). Aqui SOMAMOS o
      // custo (orçamento) e mantemos um representante para descrição/nome.
      const folhasOrc = itensOrc.filter(i => i.tipo !== 'Etapa/Subetapa' && parseFloat(String(i.custoTotal || 0)) > 0);
      const orcMap = new Map<string, typeof folhasOrc[number]>();
      for (const i of folhasOrc) {
        const k = eapCanonico(i.eapCodigo);
        if (!k) continue;
        const exist = orcMap.get(k);
        if (exist) {
          const somado = (parseFloat(String(exist.custoTotal || 0)) || 0) + (parseFloat(String(i.custoTotal || 0)) || 0);
          orcMap.set(k, { ...exist, custoTotal: String(somado) as any });
        } else {
          orcMap.set(k, i);
        }
      }

      // Filtra cronograma: só folhas reais (não grupo, não marco). Aqui não
      // somamos nada (atividade do cronograma não tem "custo agregável");
      // mantém o primeiro encontrado como representante (raríssimo colidir).
      const folhasCron = ativs.filter(a => !a.isGrupo && !a.isMarco && a.eapCodigo);
      const cronMap = new Map<string, typeof folhasCron[number]>();
      for (const a of folhasCron) {
        const k = eapCanonico(a.eapCodigo);
        if (!k) continue;
        if (!cronMap.has(k)) cronMap.set(k, a);
      }

      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

      const casados: Array<{ eapCodigo: string; descricaoOrc: string; nomeCron: string; custoTotal: number; descBate: boolean }> = [];
      const soNoOrcamento: Array<{ eapCodigo: string; descricao: string; custoTotal: number; nivel: number }> = [];
      const soNoCronograma: Array<{ eapCodigo: string; nome: string; isGrupo: boolean; isMarco: boolean }> = [];

      for (const [eap, orcIt] of orcMap) {
        const cronIt = cronMap.get(eap);
        if (cronIt) {
          const dOrc = norm(orcIt.descricao ?? '');
          const dCron = norm(cronIt.nome ?? '');
          const descBate = dOrc === dCron || dOrc.includes(dCron.substring(0, 20)) || dCron.includes(dOrc.substring(0, 20));
          casados.push({
            // Rev. 1821 — exibe o EAP LITERAL do orçamento (preserva
            // formato original "02.16.02.01" para o usuário).
            eapCodigo: (orcIt.eapCodigo ?? '').trim(),
            descricaoOrc: orcIt.descricao ?? '',
            nomeCron: cronIt.nome ?? '',
            custoTotal: parseFloat(String(orcIt.custoTotal || 0)),
            descBate,
          });
        } else {
          soNoOrcamento.push({
            eapCodigo: (orcIt.eapCodigo ?? '').trim(),
            descricao: orcIt.descricao ?? '',
            custoTotal: parseFloat(String(orcIt.custoTotal || 0)),
            nivel: orcIt.nivel ?? 0,
          });
        }
      }
      for (const [eap, cronIt] of cronMap) {
        if (!orcMap.has(eap)) {
          soNoCronograma.push({
            // Rev. 1821 — exibe EAP LITERAL do cronograma (formato MSP).
            eapCodigo: (cronIt.eapCodigo ?? '').trim(),
            nome: cronIt.nome ?? '',
            isGrupo: !!cronIt.isGrupo,
            isMarco: !!cronIt.isMarco,
          });
        }
      }

      // Ordenação natural por EAP (1.2 antes de 1.10)
      const cmpEap = (a: string, b: string) => {
        const pa = a.split('.').map(n => parseInt(n) || 0);
        const pb = b.split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const d = (pa[i] ?? 0) - (pb[i] ?? 0);
          if (d !== 0) return d;
        }
        return 0;
      };
      casados.sort((a, b) => cmpEap(a.eapCodigo, b.eapCodigo));
      soNoOrcamento.sort((a, b) => cmpEap(a.eapCodigo, b.eapCodigo));
      soNoCronograma.sort((a, b) => cmpEap(a.eapCodigo, b.eapCodigo));

      return {
        status: "ok" as const,
        orcamentoId: proj.orcamentoId,
        totalOrcamento: orcMap.size,
        totalCronograma: cronMap.size,
        casados,
        soNoOrcamento,
        soNoCronograma,
      };
    }),

  // ── Rev. 1798 / R-013 — Auto-sincroniza nomes do cronograma com o orçamento
  // (chamado automaticamente quando o usuário abre o Diagnóstico EAP) ──────────
  // Para os EAPs casados (existem nos dois lados) com DESCRIÇÃO divergente,
  // sobrescreve o nome da atividade no cronograma com a descrição EXATA do
  // orçamento. Determinístico (chave estável = eapCodigo), sem fuzzy match,
  // sem confirmação. Idempotente: rodar de novo não muda nada.
  autoSincronizarNomesComOrcamento: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [proj] = await db.select({
        id: planejamentoProjetos.id,
        companyId: planejamentoProjetos.companyId,
        orcamentoId: planejamentoProjetos.orcamentoId,
      }).from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      const isAdminDg = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminDg && String(proj.companyId) !== String(ctx.user.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      if (!proj.orcamentoId) return { atualizadas: 0 };

      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.id, input.revisaoId),
          eq(planejamentoRevisoes.projetoId, input.projetoId),
        )).limit(1);
      if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não pertence ao projeto." });

      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos).where(eq(orcamentos.id, proj.orcamentoId)).limit(1);
      if (!orc || (!isAdminDg && String(orc.companyId) !== String(ctx.user.companyId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para o orçamento vinculado." });
      }

      const [itensOrc, ativs] = await Promise.all([
        db.select({
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
        }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, proj.orcamentoId)),
        db.select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          isGrupo: planejamentoAtividades.isGrupo,
          isMarco: planejamentoAtividades.isMarco,
          isIndireta: planejamentoAtividades.isIndireta,
          isExterna: planejamentoAtividades.isExterna,
          disabled: planejamentoAtividades.disabled,
        }).from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId)),
      ]);

      const norm = (s: string | null | undefined) =>
        (s ?? '').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ').trim();

      const orcByEap = new Map<string, string>();
      for (const it of itensOrc) {
        const k = (it.eapCodigo ?? '').trim();
        if (k && (it.descricao ?? '').trim().length > 0) {
          orcByEap.set(k, it.descricao!);
        }
      }

      const mudancas: Array<{ id: number; nomeNovo: string }> = [];
      for (const a of ativs) {
        if (a.isGrupo || a.isMarco || a.isIndireta || a.isExterna || a.disabled) continue;
        const eap = (a.eapCodigo ?? '').trim();
        if (!eap) continue;
        const descOrc = orcByEap.get(eap);
        if (!descOrc) continue;
        if (a.nome !== descOrc) {
          mudancas.push({ id: a.id, nomeNovo: descOrc });
        }
      }

      if (mudancas.length === 0) return { atualizadas: 0 };

      await db.transaction(async (tx) => {
        for (const m of mudancas) {
          await tx.update(planejamentoAtividades)
            .set({ nome: m.nomeNovo })
            .where(eq(planejamentoAtividades.id, m.id));
        }
      });

      console.log(`[autoSincronizarNomes] R-013: ${mudancas.length} nome(s) corrigido(s) no projeto ${input.projetoId}.`);
      return { atualizadas: mudancas.length };
    }),

  // ── Rev. 1801 / R-013 — Auto-sincroniza CÓDIGOS (eapCodigo) do cronograma com o orçamento
  // Ao contrário do auto-sync de NOMES (que casa por eapCodigo), este aqui faz o caminho
  // inverso: para itens cuja DESCRIÇÃO bate de forma 1-para-1 entre orçamento e cronograma
  // mas cujo eapCodigo está divergente (ex.: orçamento "03.02.10" / cronograma "3.1.0.1"),
  // sobrescreve o eapCodigo do cronograma com o do orçamento. Cascata segura:
  //   1) planejamento_atividades.eap_codigo
  //   2) planejamento_atividades.predecessora (string com tokens separados por ; ou ,)
  //   3) medicao_boletim_itens.eap_codigo (FK direta atividade_id)
  //   4) smo_atividades_eap.eap_codigo (FK direta atividade_id)
  //   5) terceiro_contrato_itens.eap_codigo (FK direta planejamento_atividade_id)
  // Match estrito: descrição UNIQUE em ambos os lados (se aparecer 2+ vezes em qualquer
  // lado, é ambíguo e PULA — registro é exibido pro user resolver manual no Diagnóstico).
  // Idempotente. Tudo numa única transaction.
  autoSincronizarCodigosEapComOrcamento: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [proj] = await db.select({
        id: planejamentoProjetos.id,
        companyId: planejamentoProjetos.companyId,
        orcamentoId: planejamentoProjetos.orcamentoId,
      }).from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);
      if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      const isAdminDg = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminDg && String(proj.companyId) !== String(ctx.user.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      if (!proj.orcamentoId) {
        return { atualizadas: 0, predecessorasAtualizadas: 0, dependentesAtualizadas: 0, ambiguos: 0 };
      }

      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(and(
          eq(planejamentoRevisoes.id, input.revisaoId),
          eq(planejamentoRevisoes.projetoId, input.projetoId),
        )).limit(1);
      if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não pertence ao projeto." });

      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos).where(eq(orcamentos.id, proj.orcamentoId)).limit(1);
      if (!orc || (!isAdminDg && String(orc.companyId) !== String(ctx.user.companyId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para o orçamento vinculado." });
      }

      const [itensOrc, ativs] = await Promise.all([
        db.select({
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          tipo: orcamentoItens.tipo,
          custoTotal: orcamentoItens.custoTotal,
        }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, proj.orcamentoId)),
        db.select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          predecessora: planejamentoAtividades.predecessora,
          isGrupo: planejamentoAtividades.isGrupo,
          isMarco: planejamentoAtividades.isMarco,
          isIndireta: planejamentoAtividades.isIndireta,
          isExterna: planejamentoAtividades.isExterna,
          disabled: planejamentoAtividades.disabled,
        }).from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId)),
      ]);

      const norm = (s: string | null | undefined) =>
        (s ?? '').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ').trim();

      // Filtra orçamento como o diagnóstico faz (L3613-3615): só folhas reais
      // (tipo != 'Etapa/Subetapa') com custoTotal > 0. Evita remapear atividade-folha
      // do cronograma para um código de grupo/etapa do orçamento.
      const folhasOrc = itensOrc.filter(i =>
        i.tipo !== 'Etapa/Subetapa' && parseFloat(String(i.custoTotal || 0)) > 0
      );

      // Constrói índice de descrições UNIQUE no orçamento (folhas) → eapCodigo
      const orcCount = new Map<string, number>();
      const orcByDesc = new Map<string, string>(); // descNorm → eapCodigoOrc
      for (const it of folhasOrc) {
        const d = norm(it.descricao);
        if (!d) continue;
        orcCount.set(d, (orcCount.get(d) ?? 0) + 1);
        orcByDesc.set(d, (it.eapCodigo ?? '').trim());
      }

      // Constrói índice de descrições UNIQUE no cronograma (apenas folhas reais)
      const cronCount = new Map<string, number>();
      type AtivFolha = (typeof ativs)[number];
      const cronByDesc = new Map<string, AtivFolha>();
      for (const a of ativs) {
        if (a.isGrupo || a.isMarco || a.isIndireta || a.isExterna || a.disabled) continue;
        const d = norm(a.nome);
        if (!d) continue;
        cronCount.set(d, (cronCount.get(d) ?? 0) + 1);
        cronByDesc.set(d, a);
      }

      // 1ª passada: candidatos a remap (descrição UNIQUE em ambos + código divergente)
      type Cand = { id: number; codAntigo: string; codNovo: string };
      const candidatos: Cand[] = [];
      let ambiguos = 0;
      for (const [descNorm, atv] of cronByDesc.entries()) {
        const codCron = (atv.eapCodigo ?? '').trim();
        const codOrc = orcByDesc.get(descNorm);
        if (!codOrc) continue;
        if ((cronCount.get(descNorm) ?? 0) > 1 || (orcCount.get(descNorm) ?? 0) > 1) {
          ambiguos++;
          continue;
        }
        if (codCron === codOrc) continue;
        if (!codCron) continue;
        candidatos.push({ id: atv.id, codAntigo: codCron, codNovo: codOrc });
      }

      // Anti-colisão A: codAntigo aparece em 2+ candidatos (2 atividades-folha
      // compartilham eapCodigo antigo e remapeariam para destinos diferentes).
      const codAntigoCount = new Map<string, number>();
      for (const c of candidatos) codAntigoCount.set(c.codAntigo, (codAntigoCount.get(c.codAntigo) ?? 0) + 1);

      // Anti-colisão B: codNovo aparece em 2+ candidatos (2 atividades-folha distintas
      // mapeariam para o mesmo código de orçamento → ambíguo).
      const codNovoCount = new Map<string, number>();
      for (const c of candidatos) codNovoCount.set(c.codNovo, (codNovoCount.get(c.codNovo) ?? 0) + 1);

      // Anti-colisão C: codNovo já é usado por outra atividade da revisão que NÃO
      // está sendo remapeada (qualquer atividade, inclusive grupo/marco/indireta/externa
      // — a unicidade de eapCodigo dentro da revisão deve ser preservada para
      // predecessoras e diagnóstico funcionarem).
      const idsCandidatos = new Set(candidatos.map(c => c.id));
      const codigosOcupadosPorOutros = new Set<string>();
      for (const a of ativs) {
        if (idsCandidatos.has(a.id)) continue;
        const c = (a.eapCodigo ?? '').trim();
        if (c) codigosOcupadosPorOutros.add(c);
      }

      const ativsParaAtualizar: Cand[] = [];
      const remap = new Map<string, string>();
      for (const c of candidatos) {
        if ((codAntigoCount.get(c.codAntigo) ?? 0) > 1) { ambiguos++; continue; }
        if ((codNovoCount.get(c.codNovo) ?? 0) > 1) { ambiguos++; continue; }
        if (codigosOcupadosPorOutros.has(c.codNovo)) { ambiguos++; continue; }
        remap.set(c.codAntigo, c.codNovo);
        ativsParaAtualizar.push(c);
      }

      if (ativsParaAtualizar.length === 0) {
        return { atualizadas: 0, predecessorasAtualizadas: 0, dependentesAtualizadas: 0, ambiguos };
      }

      // Identifica predecessoras que precisam ser remapeadas (split por ; ou ,)
      const splitPred = (s: string) => s.split(/[;,]/).map(t => t.trim()).filter(Boolean);
      const predecessorasParaAtualizar: { id: number; predNova: string }[] = [];
      for (const a of ativs) {
        const pred = (a.predecessora ?? '').trim();
        if (!pred) continue;
        const tokens = splitPred(pred);
        let mudou = false;
        const novos = tokens.map(t => {
          // token pode vir como "1.2.3" puro ou "1.2.3FS+5d" (lag) — preserva sufixo
          const m = t.match(/^([0-9.]+)(.*)$/);
          if (!m) return t;
          const codigo = m[1];
          const sufixo = m[2] ?? '';
          const novo = remap.get(codigo);
          if (novo && novo !== codigo) {
            mudou = true;
            return novo + sufixo;
          }
          return t;
        });
        if (mudou) predecessorasParaAtualizar.push({ id: a.id, predNova: novos.join(';') });
      }

      const idsAtividadesRemapeadas = ativsParaAtualizar.map(x => x.id);
      let depAtualizadas = 0;

      await db.transaction(async (tx) => {
        // 1) eapCodigo do cronograma
        for (const m of ativsParaAtualizar) {
          await tx.update(planejamentoAtividades)
            .set({ eapCodigo: m.codNovo })
            .where(eq(planejamentoAtividades.id, m.id));
        }
        // 2) predecessoras
        for (const p of predecessorasParaAtualizar) {
          await tx.update(planejamentoAtividades)
            .set({ predecessora: p.predNova })
            .where(eq(planejamentoAtividades.id, p.id));
        }
        // 3) cascade nas tabelas dependentes que têm FK direta pra atividadeId
        // (medicao_boletim_itens, smo_atividades_eap, terceiro_contrato_itens)
        for (const m of ativsParaAtualizar) {
          const r1 = await tx.update(medicaoBoletimItens)
            .set({ eapCodigo: m.codNovo })
            .where(eq(medicaoBoletimItens.atividadeId, m.id));
          const r2 = await tx.update(smoAtividadesEap)
            .set({ eapCodigo: m.codNovo })
            .where(eq(smoAtividadesEap.atividadeId, m.id));
          const r3 = await tx.update(terceiroContratoItens)
            .set({ eapCodigo: m.codNovo })
            .where(eq(terceiroContratoItens.planejamentoAtividadeId, m.id));
          depAtualizadas += (r1.rowCount ?? 0) + (r2.rowCount ?? 0) + (r3.rowCount ?? 0);
        }
      });

      console.log(`[autoSincronizarCodigosEap] R-013: projeto ${input.projetoId} — ${ativsParaAtualizar.length} código(s) corrigido(s), ${predecessorasParaAtualizar.length} predecessora(s) remapeada(s), ${depAtualizadas} linha(s) em tabelas dependentes, ${ambiguos} ambíguo(s) ignorado(s).`);
      return {
        atualizadas: ativsParaAtualizar.length,
        predecessorasAtualizadas: predecessorasParaAtualizar.length,
        dependentesAtualizadas: depAtualizadas,
        ambiguos,
      };
    }),

  // ── Atividades por Obra (para seleção no formulário de HE) ─────────────────
  getAtividadesForObra: protectedProcedure
    .input(z.object({ obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Buscar projeto da obra
      const [projeto] = await db.select({ id: planejamentoProjetos.id, nome: planejamentoProjetos.nome })
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.obraId, input.obraId))
        .limit(1);
      if (!projeto) return [];

      // Buscar revisão mais recente (baseline ou última)
      const revisoes = await db.select()
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, projeto.id))
        .orderBy(desc(planejamentoRevisoes.criadoEm));
      if (!revisoes.length) return [];

      const revisao = revisoes.find(r => r.isBaseline) || revisoes[0];

      // Buscar atividades da revisão
      const atividades = await db.select({
        id: planejamentoAtividades.id,
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
        nivel: planejamentoAtividades.nivel,
        dataInicio: planejamentoAtividades.dataInicio,
        dataFim: planejamentoAtividades.dataFim,
        isGrupo: planejamentoAtividades.isGrupo,
        recursoPrincipal: planejamentoAtividades.recursoPrincipal,
        pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
      })
        .from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.projetoId, projeto.id),
          eq(planejamentoAtividades.revisaoId, revisao.id),
        ))
        .orderBy(asc(planejamentoAtividades.ordem));

      // Buscar maior percentual acumulado por atividade para filtrar as já concluídas (100%)
      const avancosMaxRaw = await db.execute(sql`
        SELECT atividade_id, MAX(CAST(percentual_acumulado AS numeric)) as max_pct
        FROM planejamento_avancos
        WHERE projeto_id = ${projeto.id}
        GROUP BY atividade_id
      `);
      const avancosMax = (avancosMaxRaw as any)?.rows ?? avancosMaxRaw ?? [];
      const avancoPct: Record<number, number> = {};
      for (const row of avancosMax) {
        avancoPct[row.atividade_id] = parseFloat(row.max_pct || "0");
      }

      // Filtrar: remover atividades com 100% de avanço (concluídas) e grupos
      const atividadesFiltradas = atividades
        .filter((a: any) => !a.isGrupo)
        .filter((a: any) => (avancoPct[a.id] ?? 0) < 100)
        .map((a: any) => ({ ...a, avancoPct: avancoPct[a.id] ?? 0 }));

      return { projeto, revisao, atividades: atividadesFiltradas };
    }),

  // ── Custo RH por projeto (HEs vinculadas às atividades) ────────────────────
  getHECustosByProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { atividades: [], hes: [], totalCustoPrevisto: 0, totalCustoRealizado: 0 };

      // Buscar projeto + obra
      const [projeto] = await db.select()
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId));
      if (!projeto) return { atividades: [], hes: [], totalCustoPrevisto: 0, totalCustoRealizado: 0 };

      // Buscar revisão ativa
      const revisoes = await db.select()
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.criadoEm));
      const revisao = revisoes.find(r => r.isBaseline) || revisoes[0];

      // Buscar atividades
      const atividades = revisao
        ? await db.select().from(planejamentoAtividades)
            .where(and(
              eq(planejamentoAtividades.projetoId, input.projetoId),
              eq(planejamentoAtividades.revisaoId, revisao.id),
            ))
            .orderBy(asc(planejamentoAtividades.ordem))
        : [];

      // Buscar HEs vinculadas à obra do projeto
      let hes: any[] = [];
      if (projeto.obraId) {
        hes = await db.select({
          id: heSolicitacoes.id,
          dataSolicitacao: heSolicitacoes.dataSolicitacao,
          horaInicio: heSolicitacoes.horaInicio,
          horaFim: heSolicitacoes.horaFim,
          status: heSolicitacoes.status,
          motivo: heSolicitacoes.motivo,
          planejamentoAtividadeId: heSolicitacoes.planejamentoAtividadeId,
          solicitadoPor: heSolicitacoes.solicitadoPor,
          aprovadoEm: heSolicitacoes.aprovadoEm,
        }).from(heSolicitacoes)
          .where(and(
            eq(heSolicitacoes.obraId, projeto.obraId),
          ))
          .orderBy(desc(heSolicitacoes.dataSolicitacao));

        // Para cada HE, buscar funcionários com salário
        for (const he of hes as any[]) {
          const funcs = await db.select({
            employeeId: heSolicitacaoFuncionarios.employeeId,
            nomeCompleto: employees.nomeCompleto,
            funcao: employees.funcao,
            valorHora: employees.valorHora,
            salarioBase: employees.salarioBase,
          }).from(heSolicitacaoFuncionarios)
            .leftJoin(employees, eq(heSolicitacaoFuncionarios.employeeId, employees.id))
            .where(eq(heSolicitacaoFuncionarios.solicitacaoId, he.id));

          // Calcular custo
          const calcHoras = (ini: string, fim: string) => {
            if (!ini || !fim) return 0;
            const [h1, m1] = ini.split(":").map(Number);
            const [h2, m2] = fim.split(":").map(Number);
            const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
            return mins > 0 ? mins / 60 : 0;
          };
          const horas = calcHoras(he.horaInicio || "", he.horaFim || "");
          const diaSemana = he.dataSolicitacao ? new Date(he.dataSolicitacao + "T12:00:00").getDay() : -1;
          const percentHE = (diaSemana === 0 || diaSemana === 6) ? 100 : 50;

          let custoPrevisto = 0;
          for (const f of funcs) {
            let vh: number | null = null;
            if (f.valorHora) { const v = parseFloat(String(f.valorHora).replace(",", ".")); if (!isNaN(v) && v > 0) vh = v; }
            if (!vh && f.salarioBase) { const s = parseFloat(String(f.salarioBase).replace(",", ".")); if (!isNaN(s) && s > 0) vh = s / 220; }
            if (vh && horas > 0) custoPrevisto += vh * (1 + percentHE / 100) * horas;
          }

          (he as any).funcionarios = funcs;
          (he as any).horas = horas;
          (he as any).percentHE = percentHE;
          (he as any).custoPrevisto = custoPrevisto;
          (he as any).numFuncionarios = funcs.length;
        }
      }

      const totalCustoPrevisto = (hes as any[]).reduce((s, h) => s + (h.custoPrevisto || 0), 0);
      const totalCustoRealizado = (hes as any[]).filter(h => h.status === "aprovada").reduce((s, h) => s + (h.custoPrevisto || 0), 0);

      return { atividades, hes, totalCustoPrevisto, totalCustoRealizado, projeto };
    }),

  // ── Simulador de Cronograma por Orçamento Mensal ─────────────────────────
  simularCronograma: protectedProcedure
    .input(z.object({
      revisaoId:      z.number(),
      projetoId:      z.number(),
      orcamentoMensal: z.number().positive(),
      valorTotal:     z.number().positive(),
      dataInicio:     z.string(), // YYYY-MM-DD
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Buscar todas as atividades folha da revisão
      const rows = await db.select().from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.revisaoId, input.revisaoId),
          eq(planejamentoAtividades.isGrupo, false),
        ))
        .orderBy(asc(planejamentoAtividades.ordem));

      if (rows.length === 0) throw new Error("Nenhuma atividade folha encontrada nesta revisão.");

      // 2. Verificar se existem predecessoras definidas
      const temPredecessoras = rows.some(a => a.predecessora && a.predecessora.trim() !== "");

      // 3. Sequência das atividades
      let sequencia: typeof rows = [];

      if (temPredecessoras) {
        // Usar predecessoras existentes: ordenação topológica (Kahn)
        const byEap = new Map<string, typeof rows[0]>();
        rows.forEach(a => byEap.set(a.eapCodigo || String(a.id), a));

        const inDeg = new Map<string, number>();
        const adj   = new Map<string, string[]>(); // eap → [successors]
        rows.forEach(a => { const k = a.eapCodigo || String(a.id); inDeg.set(k, 0); adj.set(k, []); });

        rows.forEach(a => {
          if (!a.predecessora) return;
          const k = a.eapCodigo || String(a.id);
          a.predecessora.split(/[,;]/).map(s => s.trim()).forEach(pk => {
            if (adj.has(pk)) {
              adj.get(pk)!.push(k);
              inDeg.set(k, (inDeg.get(k) || 0) + 1);
            }
          });
        });

        const q = rows.filter(a => (inDeg.get(a.eapCodigo || String(a.id)) || 0) === 0);
        const visited = new Set<number>();
        while (q.length > 0) {
          const node = q.shift()!;
          if (visited.has(node.id)) continue;
          visited.add(node.id);
          sequencia.push(node);
          const k = node.eapCodigo || String(node.id);
          (adj.get(k) || []).forEach(sk => {
            inDeg.set(sk, (inDeg.get(sk) || 0) - 1);
            if ((inDeg.get(sk) || 0) === 0) {
              const next = byEap.get(sk);
              if (next && !visited.has(next.id)) q.push(next);
            }
          });
        }
        // Append restantes (ciclos)
        rows.forEach(a => { if (!visited.has(a.id)) sequencia.push(a); });

      } else {
        // Sem predecessoras: pedir sequência à IA (Claude)
        try {
          const { invokeLLM } = await import("../_core/llm");
          const listaAtiv = rows.map(a =>
            `{"id":${a.id},"eap":"${a.eapCodigo || "-"}","nome":"${a.nome.replace(/"/g, "'")}"}`
          ).join(",\n");

          const prompt = `Você é um especialista em construção civil brasileiro com domínio em planejamento de obras.

Abaixo está uma lista de atividades de uma obra de construção civil. Analise os nomes e códigos EAP de cada atividade e ordene-as em sequência construtiva lógica, respeitando a ordem natural da construção civil brasileira:

1. Serviços preliminares / mobilização / canteiro
2. Terraplenagem / escavação / fundações
3. Estrutura (concreto, formas, armação)
4. Alvenaria / vedação
5. Cobertura / telhado
6. Instalações hidrossanitárias (prumadas, ramais)
7. Instalações elétricas / SPDA / cabeamento
8. Instalações especiais (ar condicionado, gás, etc.)
9. Revestimento interno (reboco, chapisco, emboço)
10. Revestimento externo (fachada)
11. Contrapiso / impermeabilização
12. Revestimento de piso (cerâmica, porcelanato, etc.)
13. Esquadrias (portas, janelas, vidros)
14. Louças e metais
15. Pintura interna e externa
16. Limpeza / entrega

Atividades da obra (JSON):
[${listaAtiv}]

Retorne APENAS um JSON válido com a lista de IDs em ordem de execução. Cada atividade deve aparecer exatamente uma vez. Formato obrigatório:
{"ordem":[id1,id2,id3,...]}`;

          const result = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
            maxTokens: 4096,
          });

          const text = typeof result.choices[0]?.message?.content === "string"
            ? result.choices[0].message.content
            : "";

          if (text) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const clean = jsonMatch ? jsonMatch[0] : text;
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed.ordem) && parsed.ordem.length > 0) {
              const idOrder = parsed.ordem as number[];
              const rowMap = new Map(rows.map(r => [r.id, r]));
              const sorted: typeof rows = [];
              idOrder.forEach(id => { const r = rowMap.get(id); if (r) sorted.push(r); });
              rows.forEach(r => { if (!sorted.find(s => s.id === r.id)) sorted.push(r); });
              sequencia = sorted;
            } else { sequencia = rows; }
          } else { sequencia = rows; }
        } catch (e) {
          console.error("[Simulador] Erro ao chamar IA:", e);
          sequencia = rows;
        }
      }

      // 4. Algoritmo guloso de distribuição mensal
      const getKey  = (a: typeof rows[0]) => a.eapCodigo || String(a.id);
      const getCusto = (a: typeof rows[0]) => (parseFloat(String(a.pesoFinanceiro ?? 0)) / 100) * input.valorTotal;

      // Build predecessor set for validation
      const predSet = new Map<number, Set<string>>();
      rows.forEach(a => {
        const preds = new Set<string>();
        if (a.predecessora) a.predecessora.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(p => preds.add(p));
        predSet.set(a.id, preds);
      });

      const meses: { mes: number; atividades: { id: number; nome: string; eapCodigo: string | null; pesoFinanceiro: number; duracaoDias: number; custo: number }[]; custoTotal: number }[] = [];
      let remaining = [...sequencia];
      const completedKeys = new Set<string>();
      let mesNum = 1;

      while (remaining.length > 0) {
        const mesAtivs: typeof sequencia = [];
        let mesCusto = 0;
        let progressed = false;

        // First pass: add activities that fit in budget with predecessors done
        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i];
          const preds = predSet.get(a.id) ?? new Set();
          const predsOk = [...preds].every(p => completedKeys.has(p));
          if (!predsOk) continue;

          const custo = getCusto(a);
          // Allow at least 1 per month even if over budget
          if (mesCusto + custo <= input.orcamentoMensal || mesAtivs.length === 0) {
            mesAtivs.push(a);
            mesCusto += custo;
            progressed = true;
          }
        }

        // Safety: if no progress (circular or stuck), force first available
        if (!progressed && remaining.length > 0) {
          mesAtivs.push(remaining[0]);
          mesCusto = getCusto(remaining[0]);
        }

        // Commit month
        mesAtivs.forEach(a => {
          completedKeys.add(getKey(a));
          remaining = remaining.filter(r => r.id !== a.id);
        });

        meses.push({
          mes: mesNum++,
          custoTotal: mesCusto,
          atividades: mesAtivs.map(a => ({
            id: a.id,
            nome: a.nome,
            eapCodigo: a.eapCodigo,
            pesoFinanceiro: parseFloat(String(a.pesoFinanceiro ?? 0)),
            duracaoDias: a.duracaoDias ?? 0,
            custo: getCusto(a),
          })),
        });

        if (mesNum > 500) break; // Safety valve
      }

      return {
        meses,
        totalMeses: meses.length,
        usouIA: !temPredecessoras,
        temPredecessoras,
        orcamentoMensal: input.orcamentoMensal,
        valorTotal: input.valorTotal,
        dataInicio: input.dataInicio,
      };
    }),

  // ── Adotar Simulação como Cronograma Oficial ──────────────────────────────
  adotarSimulacao: protectedProcedure
    .input(z.object({
      projetoId:   z.number(),
      revisaoId:   z.number(),
      dataInicio:  z.string(),
      meses: z.array(z.object({
        mes: z.number(),
        atividadeIds: z.array(z.number()),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Buscar todas as atividades da revisão (folha + grupo)
      const todasAtivs = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      // Calcular datas por atividade com base no mês
      const di = new Date(input.dataInicio + "T12:00:00");
      const atividadeDatas = new Map<number, { dataInicio: string; dataFim: string }>();

      input.meses.forEach(({ mes, atividadeIds }) => {
        const mesStart = new Date(di);
        mesStart.setMonth(mesStart.getMonth() + (mes - 1));
        const mesEnd   = new Date(mesStart);
        mesEnd.setMonth(mesEnd.getMonth() + 1);
        mesEnd.setDate(mesEnd.getDate() - 1);

        // Distribute activities sequentially within the month
        let cursor = new Date(mesStart);
        atividadeIds.forEach(id => {
          const atv = todasAtivs.find(a => a.id === id);
          const dur = Math.max(1, atv?.duracaoDias ?? 1);
          const start = new Date(cursor);
          const end   = new Date(cursor);
          end.setDate(end.getDate() + dur - 1);
          // Don't go past the month end
          const clampedEnd = end > mesEnd ? mesEnd : end;
          atividadeDatas.set(id, {
            dataInicio: start.toISOString().split("T")[0],
            dataFim:    clampedEnd.toISOString().split("T")[0],
          });
          cursor = new Date(clampedEnd);
          cursor.setDate(cursor.getDate() + 1);
        });
      });

      // Criar nova revisão com +1 no número
      const revisaoAtual = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.revisaoId))
        .then(r => r[0]);
      if (!revisaoAtual) throw new Error("Revisão não encontrada.");

      const hoje2 = new Date().toISOString().split("T")[0];
      const [novaRevisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:    input.projetoId,
        numero:       (revisaoAtual.numero ?? 0) + 1,
        descricao:    "Cronograma gerado pelo Simulador de Orçamento Mensal",
        dataRevisao:  hoje2,
        status:       "aprovada",
        aprovadoPor:  ctx.user?.name || "Sistema",
        isBaseline:   false,
        consolidado:  false,
      }).returning({ id: planejamentoRevisoes.id });

      if (!novaRevisao) throw new Error("Falha ao criar revisão.");

      // Copiar atividades com novas datas
      const rows = todasAtivs.map((a, i) => {
        const datas = atividadeDatas.get(a.id);
        return {
          revisaoId:           novaRevisao.id,
          projetoId:           input.projetoId,
          eapCodigo:           a.eapCodigo,
          nome:                a.nome,
          nivel:               a.nivel,
          dataInicio:          datas?.dataInicio ?? a.dataInicio,
          dataFim:             datas?.dataFim    ?? a.dataFim,
          duracaoDias:         a.duracaoDias,
          predecessora:        a.predecessora,
          pesoFinanceiro:      a.pesoFinanceiro,
          recursoPrincipal:    a.recursoPrincipal,
          quantidadePlanejada: a.quantidadePlanejada,
          unidade:             a.unidade,
          ordem:               a.ordem ?? i,
          isGrupo:             a.isGrupo,
          // Rev. 1641 — preserva flags na cópia para nova revisão.
          isMarco:             (a as any).isMarco ?? false,
          isIndireta:          (a as any).isIndireta ?? false,
          isExterna:           (a as any).isExterna ?? false,
          externaResponsavel:  (a as any).externaResponsavel ?? null,
          disabled:            (a as any).disabled ?? false,
        };
      });

      const CHUNK = 100;
      await db.transaction(async tx => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(planejamentoAtividades).values(rows.slice(i, i + CHUNK) as any);
        }
      });

      return { novaRevisaoId: novaRevisao.id };
    }),

  // ── Gerar Cronograma a partir do Orçamento (IA) ───────────────────────────
  gerarCronogramaDoOrcamento: protectedProcedure
    .input(z.object({
      projetoId:       z.number(),
      revisaoId:       z.number(),
      orcamentoMensal: z.number().positive(),
      valorTotal:      z.number().positive(),
      dataInicio:      z.string(),
      // Parcelas intermediárias: aporte extra de capital por mês (opcional)
      parcelas:        z.array(z.object({ mes: z.number().int().positive(), valor: z.number().positive() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Obter o projeto e seu orçamento vinculado
      const projeto = await db.select().from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId))
        .then(r => r[0]);
      if (!projeto) throw new Error("Projeto não encontrado.");
      if (!projeto.orcamentoId) throw new Error("Este projeto não tem orçamento vinculado.");

      // 2. Buscar TODOS os itens do orçamento (grupos + folhas) — preserva EAP exata do upload
      const todosItens = await db.select({
        eapCodigo:     orcamentoItens.eapCodigo,
        descricao:     orcamentoItens.descricao,
        unidade:       orcamentoItens.unidade,
        custoTotal:    orcamentoItens.custoTotal,
        custoTotalMat: orcamentoItens.custoTotalMat,
        custoTotalMdo: orcamentoItens.custoTotalMdo,
        tipo:          orcamentoItens.tipo,
      })
      .from(orcamentoItens)
      .where(and(
        eq(orcamentoItens.orcamentoId, projeto.orcamentoId),
        or(
          eq(orcamentoItens.tipo, 'Etapa/Subetapa'),
          sql`${orcamentoItens.custoTotal} > 0`,
        ),
      ))
      .orderBy(asc(orcamentoItens.eapCodigo));

      if (todosItens.length === 0) throw new Error("O orçamento vinculado não tem itens cadastrados.");

      // Separar grupos (Etapa/Subetapa) e folhas (itens com custo > 0 que não são grupos)
      const TIPO_GRUPO = 'Etapa/Subetapa';
      const gruposOrc  = todosItens.filter(i => i.tipo === TIPO_GRUPO);
      const folhasOrc  = todosItens.filter(i => i.tipo !== TIPO_GRUPO && parseFloat(String(i.custoTotal || 0)) > 0);

      if (folhasOrc.length === 0) throw new Error("O orçamento não tem atividades folha com custo > 0.");

      // Calcular ratios Mat/MdO globais a partir das folhas
      const totalMatOrc = folhasOrc.reduce((s, i) => s + parseFloat(String(i.custoTotalMat || 0)), 0);
      const totalMdoOrc = folhasOrc.reduce((s, i) => s + parseFloat(String(i.custoTotalMdo || 0)), 0);
      const totalGeral  = folhasOrc.reduce((s, i) => s + parseFloat(String(i.custoTotal    || 0)), 0);
      const ratioMat    = totalGeral > 0 ? totalMatOrc / totalGeral : 0;
      const ratioMdo    = totalGeral > 0 ? totalMdoOrc / totalGeral : 0;

      // 3. Chamar IA — APENAS para definir duracaoDias + predecessora de cada folha
      const { invokeLLM } = await import("../_core/llm");

      // Monta lista somente das folhas (grupos não precisam de duração/predecessora)
      const listaParaIA = folhasOrc.map(i => {
        const custo    = parseFloat(String(i.custoTotal    || 0));
        const custoMat = parseFloat(String(i.custoTotalMat || 0));
        const custoMdo = parseFloat(String(i.custoTotalMdo || 0));
        const pct      = totalGeral > 0 ? ((custo / totalGeral) * 100).toFixed(2) : "0";
        const matStr   = custoMat > 0 ? ` MAT:R$${custoMat.toFixed(2)}` : "";
        const mdoStr   = custoMdo > 0 ? ` MDO:R$${custoMdo.toFixed(2)}` : "";
        return `EAP:${i.eapCodigo} | ${i.descricao} | R$${custo.toFixed(2)} (${pct}%)${matStr}${mdoStr}`;
      }).join("\n");

      const valorFmt  = input.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const mensalFmt = input.orcamentoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const mesesEst  = Math.ceil(input.valorTotal / input.orcamentoMensal);

      const prompt = `Você é um especialista sênior em planejamento e cronograma de obras de construção civil, com domínio em:
- Método do Caminho Crítico (CPM/PERT) — Harold Kerzner, Gregory Horine, Aldo Dórea Mattos
- Last Planner System (Glenn Ballard) e Linha de Balanço (LOB)
- Sequência construtiva conforme ABNT, NBR 12.741 e SINDUSCON-SP
- Planejamento de obras residenciais, comerciais e industriais no Brasil

MISSÃO ESTRITA: Você receberá a lista EXATA de atividades do orçamento da obra. Para cada atividade folha, defina SOMENTE:
  1. duracaoDias: duração estimada em dias corridos
  2. predecessora: código(s) EAP da(s) atividade(s) que devem terminar antes desta iniciar (separar por vírgula se múltiplas; vazio "" se não houver)

REGRAS ABSOLUTAS — VIOLÁ-LAS INVALIDA O CRONOGRAMA:
- NÃO crie atividades que não estão na lista
- NÃO remova atividades da lista
- NÃO altere nomes, descrições ou códigos EAP
- Retorne EXATAMENTE ${folhasOrc.length} objetos — um para cada EAP da lista abaixo, na mesma ordem
- Os EAP codes das predecessoras devem referenciar SOMENTE códigos presentes nesta mesma lista

PARÂMETROS DA OBRA:
- Valor total do contrato: ${valorFmt}
- Desembolso máximo mensal: ${mensalFmt} (ritmo financeiro de execução)
- Prazo estimado: ~${mesesEst} meses
- Data de início: ${input.dataInicio}

REGRAS DE DURAÇÃO (dias corridos):
- Atividade de gestão/mobilização permanente: 300–400 dias (duração total da obra)
- Serviços de estrutura/fundação/concreto: 20–90 dias conforme porte
- Instalações prediais (elétrica, hidráulica, esgoto): 8–30 dias por andar/fase
- Revestimentos, acabamentos, pintura: 8–25 dias por fase
- Item pequeno (< 0,5% do valor): 5–10 dias
- Item médio (0,5–3%): 10–30 dias
- Item grande (3–10%): 30–60 dias
- Item major (> 10%): 60–150 dias

REGRAS DE SEQUÊNCIA CONSTRUTIVA (predecessoras):
Respeite rigorosamente a lógica física da construção:
1. Serviços preliminares e canteiro → sempre iniciam sem predecessora (início da obra)
2. Terraplenagem/escavação → após canteiro
3. Fundações (estacas, blocos, baldrame, radier) → após escavação
4. Estrutura (pilares→vigas→lajes, concretagem) → após fundações
5. Alvenaria/vedação → após estrutura do pavimento correspondente
6. Cobertura → após estrutura do último pavimento
7. Instalações elétricas/hidráulicas embutidas → paralelas com alvenaria (mesma fase)
8. Instalações aparentes/terminais → após revestimentos
9. Revestimento interno (chapisco/reboco) → após alvenaria seca
10. Impermeabilização/contrapiso → após estrutura + revestimentos molhados
11. Piso/cerâmica/porcelanato → após contrapiso
12. Esquadrias → após revestimento externo
13. Louças/metais/acessórios → após revestimento de paredes
14. Pintura final → após todos os revestimentos
15. Limpeza/entrega → última fase
- Atividades no mesmo pavimento podem ser paralelas se fisicamente possíveis
- Atividades em pavimentos diferentes do mesmo tipo podem iniciar com defasagem de 1–2 semanas

LISTA EXATA DAS ATIVIDADES DO ORÇAMENTO (${folhasOrc.length} atividades folha — retorne todas):
${listaParaIA}

Retorne SOMENTE este JSON (sem markdown, sem comentários, sem texto extra):
{
  "atividades": [
    {"eapCodigo":"EAP_EXATO_DO_ITEM","duracaoDias":NUMERO_INTEIRO,"predecessora":"EAP_PRED_OU_VAZIO"},
    ...
  ]
}`;

      let atividadesGeradas: {
        eapCodigo: string; nome: string; nivel: number; isGrupo: boolean;
        duracaoDias: number; predecessora: string; pesoFinanceiro: number; unidade: string;
      }[] = [];

      // Extrai o JSON mais externo de uma string que pode ter markdown ou texto extra
      function extractFirstJson(text: string): string | null {
        const start = text.indexOf("{");
        if (start === -1) return null;
        let depth = 0; let inStr = false; let esc = false;
        for (let i = start; i < text.length; i++) {
          if (esc) { esc = false; continue; }
          if (text[i] === '\\' && inStr) { esc = true; continue; }
          if (text[i] === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
        }
        return null; // JSON não fechado (resposta truncada)
      }

      // Quando a IA trunca a resposta, tenta salvar as atividades já geradas antes do corte.
      // Extrai todos os objetos de atividade COMPLETOS da resposta parcial.
      function repairTruncatedJson(text: string): string | null {
        const arrIdx = text.indexOf('"atividades"');
        if (arrIdx === -1) return null;
        const arrStart = text.indexOf('[', arrIdx);
        if (arrStart === -1) return null;
        const activities: string[] = [];
        let i = arrStart + 1;
        while (i < text.length) {
          while (i < text.length && /[\s,]/.test(text[i])) i++;
          if (i >= text.length || text[i] !== '{') break;
          let depth = 0; let inS = false; let es = false; let objEnd = -1;
          for (let j = i; j < text.length; j++) {
            if (es) { es = false; continue; }
            if (text[j] === '\\' && inS) { es = true; continue; }
            if (text[j] === '"') { inS = !inS; continue; }
            if (inS) continue;
            if (text[j] === '{') depth++;
            else if (text[j] === '}') { depth--; if (depth === 0) { objEnd = j; break; } }
          }
          if (objEnd === -1) break; // objeto incompleto = corte aqui
          activities.push(text.slice(i, objEnd + 1));
          i = objEnd + 1;
        }
        if (activities.length === 0) return null;
        console.log(`[repairJson] Resposta truncada — salvando ${activities.length} atividades completas`);
        return `{"atividades":[${activities.join(',')}]}`;
      }

      let rawText = "";
      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          maxTokens: 16000,
        });
        rawText = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content : "";
      } catch (e: any) {
        console.error("[gerarCronograma] Erro na chamada LLM:", e?.message ?? e);
        throw new Error(`Falha ao chamar IA: ${e?.message ?? "erro desconhecido"}`);
      }

      try {
        // Tenta JSON completo primeiro; se truncado, repara extraindo atividades completas
        let jsonStr = extractFirstJson(rawText) ?? repairTruncatedJson(rawText);
        if (!jsonStr) {
          console.error("[gerarCronograma] Resposta sem JSON recuperável:", rawText.slice(0, 400));
          throw new Error("A IA não retornou JSON válido. Tente novamente ou reduza o escopo do orçamento.");
        }
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.atividades) && parsed.atividades.length > 0) {
          atividadesGeradas = parsed.atividades;
          if (atividadesGeradas.length > 0 && !extractFirstJson(rawText)) {
            console.warn(`[gerarCronograma] Resposta truncada — ${atividadesGeradas.length} atividades recuperadas pelo repair`);
          }
        } else {
          console.error("[gerarCronograma] JSON sem campo 'atividades':", jsonStr.slice(0, 300));
        }
      } catch (e: any) {
        console.error("[gerarCronograma] Erro ao parsear JSON:", e?.message, "| raw:", rawText.slice(0, 500));
        throw new Error(`Falha ao interpretar resposta da IA: ${e?.message ?? "JSON inválido"}`);
      }

      // ── MERGE: funde resposta da IA com estrutura EXATA do orçamento ─────────
      // A IA retorna só {eapCodigo, duracaoDias, predecessora} das folhas.
      // Grupos e pesoFinanceiro vêm 100% do orçamento — a IA não toca nisso.
      {
        const aiMap = new Map<string, { duracaoDias: number; predecessora: string }>(
          atividadesGeradas.map(a => [a.eapCodigo, { duracaoDias: a.duracaoDias, predecessora: a.predecessora }])
        );
        atividadesGeradas = todosItens.map(item => {
          const isGrupo = item.tipo === TIPO_GRUPO;
          const custo   = parseFloat(String(item.custoTotal || 0));
          const nivel   = (item.eapCodigo || "").split('.').length;
          if (isGrupo) {
            return { eapCodigo: item.eapCodigo, nome: item.descricao ?? "", nivel, isGrupo: true, duracaoDias: 0, predecessora: "", pesoFinanceiro: 0, unidade: "" };
          }
          const ai = aiMap.get(item.eapCodigo);
          return {
            eapCodigo:       item.eapCodigo,
            nome:            item.descricao ?? "",
            nivel,
            isGrupo:         false,
            duracaoDias:     ai?.duracaoDias ?? 10,
            predecessora:    ai?.predecessora ?? "",
            pesoFinanceiro:  totalGeral > 0 ? (custo / totalGeral) * 100 : 0,
            unidade:         item.unidade || "vb",
          };
        });
        const folhasMerge = atividadesGeradas.filter(a => !a.isGrupo);
        console.log(`[gerarCronograma] Merge EAP: ${todosItens.length} total (${gruposOrc.length} grupos, ${folhasMerge.length} folhas). IA retornou ${aiMap.size} folhas.`);
      }

      if (atividadesGeradas.length === 0) throw new Error("A IA não retornou atividades válidas.");

      // 4. Distribuição mensal (algoritmo guloso com topologia)
      const folhasSeq = atividadesGeradas.filter(a => !a.isGrupo);

      // ── Largest Remainder Method ───────────────────────────────────────────
      // Garante que a soma exata dos custos de TODAS as atividades = valorTotal,
      // sem perda de nenhum centavo, independente de erros de ponto flutuante.
      const totalCentsTarget = Math.round(input.valorTotal * 100);
      const lrmData = folhasSeq.map(a => {
        const exactCents = (a.pesoFinanceiro / 100) * input.valorTotal * 100;
        const floored    = Math.floor(exactCents);
        return { eapCodigo: a.eapCodigo, floored, frac: exactCents - floored };
      });
      const floorSum    = lrmData.reduce((s, x) => s + x.floored, 0);
      const remainder   = totalCentsTarget - floorSum; // qtd de atividades que recebem +1 centavo
      const bonusEaps   = new Set(
        [...lrmData].sort((a, b) => b.frac - a.frac).slice(0, remainder).map(x => x.eapCodigo)
      );
      const custoCentsMap = new Map<string, number>(); // eapCodigo → centavos exatos
      lrmData.forEach(x => custoCentsMap.set(x.eapCodigo, x.floored + (bonusEaps.has(x.eapCodigo) ? 1 : 0)));

      // getCusto agora retorna valor exato em BRL (sem sub-centavo)
      const getCusto = (a: typeof folhasSeq[0]) => (custoCentsMap.get(a.eapCodigo) ?? 0) / 100;

      // Topological sort by predecessora
      const byEap = new Map(folhasSeq.map(a => [a.eapCodigo, a]));
      const inDeg = new Map(folhasSeq.map(a => [a.eapCodigo, 0]));
      const adj   = new Map(folhasSeq.map(a => [a.eapCodigo, [] as string[]]));
      folhasSeq.forEach(a => {
        if (!a.predecessora) return;
        a.predecessora.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(pk => {
          if (adj.has(pk)) { adj.get(pk)!.push(a.eapCodigo); inDeg.set(a.eapCodigo, (inDeg.get(a.eapCodigo) || 0) + 1); }
        });
      });
      const q = folhasSeq.filter(a => (inDeg.get(a.eapCodigo) || 0) === 0);
      const visited = new Set<string>();
      const sequencia: typeof folhasSeq = [];
      while (q.length > 0) {
        const node = q.shift()!;
        if (visited.has(node.eapCodigo)) continue;
        visited.add(node.eapCodigo);
        sequencia.push(node);
        (adj.get(node.eapCodigo) || []).forEach(sk => {
          inDeg.set(sk, (inDeg.get(sk) || 0) - 1);
          if ((inDeg.get(sk) || 0) === 0) { const nxt = byEap.get(sk); if (nxt && !visited.has(sk)) q.push(nxt); }
        });
      }
      folhasSeq.forEach(a => { if (!visited.has(a.eapCodigo)) sequencia.push(a); });

      const predSet = new Map(folhasSeq.map(a => [a.eapCodigo, new Set(
        (a.predecessora || "").split(/[,;]/).map(s => s.trim()).filter(Boolean)
      )]));

      // Mapa de capital extra por mês (parcelas intermediárias aprovadas), em centavos
      const extraCapCentsMap = new Map<number, number>();
      if (input.parcelas && input.parcelas.length > 0) {
        input.parcelas.forEach(p => {
          extraCapCentsMap.set(p.mes, (extraCapCentsMap.get(p.mes) ?? 0) + Math.round(p.valor * 100));
        });
        console.log(`[gerarCronograma] Parcelas intermediárias: ${input.parcelas.length} aportes, total extra = R$ ${(input.parcelas.reduce((s, p) => s + p.valor, 0)).toFixed(2)}`);
      }

      const meses: { mes: number; atividades: { eapCodigo: string; nome: string; pesoFinanceiro: number; duracaoDias: number; custo: number; custoMat: number; custoMdo: number }[]; custoTotal: number; custoMat: number; custoMdo: number }[] = [];
      let remaining = [...sequencia];
      const completedEaps = new Set<string>();
      let mesNum = 1;
      // Orçamento mensal em centavos inteiros para comparação exata
      const orcMensalCents = Math.round(input.orcamentoMensal * 100);

      while (remaining.length > 0) {
        const mesAtivs: typeof sequencia = [];
        let mesCustoCents = 0; // acumula em centavos inteiros — sem erro de ponto flutuante
        let progressed = false;
        // Teto deste mês = orçamento base + aporte extra (se houver)
        const tetoCents = orcMensalCents + (extraCapCentsMap.get(mesNum) ?? 0);

        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i];
          const preds = predSet.get(a.eapCodigo) ?? new Set<string>();
          if (![...preds].every(p => completedEaps.has(p))) continue;
          const cents = custoCentsMap.get(a.eapCodigo) ?? 0;
          if (mesCustoCents + cents <= tetoCents || mesAtivs.length === 0) {
            mesAtivs.push(a); mesCustoCents += cents; progressed = true;
          }
        }
        if (!progressed && remaining.length > 0) {
          mesAtivs.push(remaining[0]);
          mesCustoCents = custoCentsMap.get(remaining[0].eapCodigo) ?? 0;
        }

        mesAtivs.forEach(a => { completedEaps.add(a.eapCodigo); remaining = remaining.filter(r => r.eapCodigo !== a.eapCodigo); });

        // Custo do mês em centavos inteiros → converte para BRL exato
        const mesCusto = mesCustoCents / 100;

        const mesAtvsData = mesAtivs.map(a => {
          const cCents   = custoCentsMap.get(a.eapCodigo) ?? 0;
          const custo    = cCents / 100;
          // Custos Mat/Mdo por atividade: mat = floor(custo*ratioMat), mdo = custo - mat (residual exato)
          const custoMat = parseFloat((custo * ratioMat).toFixed(2));
          const custoMdo = parseFloat((custo - custoMat).toFixed(2));
          return { eapCodigo: a.eapCodigo, nome: a.nome, pesoFinanceiro: a.pesoFinanceiro, duracaoDias: a.duracaoDias, custo, custoMat, custoMdo };
        });

        // Totais Mat/Mdo do mês — Mdo é residual exato para bater com mesCusto
        const mesCustoMatCents = mesAtvsData.reduce((s, a) => s + Math.round(a.custoMat * 100), 0);
        const mesCustoMat      = mesCustoMatCents / 100;
        const mesCustoMdo      = parseFloat((mesCusto - mesCustoMat).toFixed(2));

        meses.push({ mes: mesNum++, custoTotal: mesCusto, custoMat: mesCustoMat, custoMdo: mesCustoMdo, atividades: mesAtvsData });
        if (mesNum > 500) break;
      }

      // ══════════════════════════════════════════════════════════════════════════
      // LEI DE OURO — A soma dos custoTotal de todos os meses DEVE ser
      // EXATAMENTE igual a valorTotal.  Qualquer centavo de diferença causada
      // por divisão de inteiros (/100) é absorvido pelo último mês.
      // Essa lei não pode ser violada: nenhum cronograma pode ter total diferente
      // do orçamento contratado.
      // ══════════════════════════════════════════════════════════════════════════
      if (meses.length > 0) {
        const somaCents = meses.reduce((s, m) => s + Math.round(m.custoTotal * 100), 0);
        const diffCents = totalCentsTarget - somaCents; // pode ser +1, -1, ou 0
        if (diffCents !== 0) {
          const ult = meses[meses.length - 1];
          ult.custoTotal = parseFloat(((Math.round(ult.custoTotal * 100) + diffCents) / 100).toFixed(2));
          // Ajustar também o Mdo do último mês (residual) para manter mat+mdo=custoTotal
          ult.custoMdo = parseFloat((ult.custoTotal - ult.custoMat).toFixed(2));
        }
        // Assert final (falha silenciosa no log, nunca explode para o usuário)
        const checkCents = meses.reduce((s, m) => s + Math.round(m.custoTotal * 100), 0);
        if (checkCents !== totalCentsTarget) {
          console.error(`[LEI DE OURO VIOLADA] soma=${checkCents} !== target=${totalCentsTarget} diff=${checkCents - totalCentsTarget}`);
        }
      }

      return { atividades: atividadesGeradas, meses, totalMeses: meses.length, valorTotal: input.valorTotal, orcamentoMensal: input.orcamentoMensal, dataInicio: input.dataInicio, ratioMat, ratioMdo };
    }),

  // ── Adotar Cronograma Gerado pela IA (cria atividades + datas) ────────────
  adotarCronogramaGerado: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      revisaoId:  z.number(),
      dataInicio: z.string(),
      atividades: z.array(z.object({
        eapCodigo:      z.string(),
        nome:           z.string(),
        nivel:          z.number(),
        isGrupo:        z.boolean(),
        duracaoDias:    z.number(),
        predecessora:   z.string(),
        pesoFinanceiro: z.number(),
        unidade:        z.string(),
        mes:            z.number(), // 0 = grupo sem mês direto
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const revisaoAtual = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.revisaoId)).then(r => r[0]);
      if (!revisaoAtual) throw new Error("Revisão não encontrada.");

      const hoje = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const [novaRevisao] = await db.insert(planejamentoRevisoes).values({
        projetoId:    input.projetoId,
        numero:       (revisaoAtual.numero ?? 0) + 1,
        descricao:    "Cronograma gerado por IA a partir do orçamento",
        dataRevisao:  hoje,
        status:       "aprovada",
        aprovadoPor:  ctx.user?.name || "Sistema",
        isBaseline:   false,
        consolidado:  false,
      }).returning({ id: planejamentoRevisoes.id });

      if (!novaRevisao) throw new Error("Falha ao criar revisão.");

      // Calcular datas por mês
      const di = new Date(input.dataInicio + "T12:00:00");
      const mesDatas = new Map<number, { start: Date; end: Date }>();
      for (let m = 1; m <= 600; m++) {
        const start = new Date(di); start.setMonth(start.getMonth() + (m - 1));
        const end   = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);
        mesDatas.set(m, { start, end });
      }

      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const rows = input.atividades.map((a, i) => {
        let dataInicio: string | null = null;
        let dataFim: string | null    = null;
        if (!a.isGrupo && a.mes > 0) {
          const md = mesDatas.get(a.mes);
          if (md) {
            dataInicio = fmt(md.start);
            const end  = new Date(md.start); end.setDate(end.getDate() + Math.max(1, a.duracaoDias) - 1);
            dataFim    = fmt(end > md.end ? md.end : end);
          }
        }
        return {
          revisaoId:      novaRevisao.id,
          projetoId:      input.projetoId,
          eapCodigo:      a.eapCodigo,
          nome:           a.nome,
          nivel:          a.nivel,
          dataInicio,
          dataFim,
          duracaoDias:    a.isGrupo ? null : Math.max(1, a.duracaoDias),
          predecessora:   a.predecessora || null,
          pesoFinanceiro: a.isGrupo ? null : a.pesoFinanceiro,
          unidade:        a.unidade || null,
          ordem:          i,
          isGrupo:        a.isGrupo,
          // Rev. 1641 — IA não marca externas; default false explícito para clareza.
          isExterna:      false,
          externaResponsavel: null,
        };
      });

      const CHUNK = 100;
      await db.transaction(async tx => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(planejamentoAtividades).values(rows.slice(i, i + CHUNK) as any);
        }
      });

      return { novaRevisaoId: novaRevisao.id, totalAtividades: rows.length };
    }),

  // ── Chat JULINHO no Simulador de Cronograma ────────────────────────────────
  chatSimuladorCronograma: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      messages:   z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      schedule: z.object({
        atividades:      z.array(z.any()),
        meses:           z.array(z.any()),
        valorTotal:      z.number(),
        orcamentoMensal: z.number(),
        dataInicio:      z.string(),
        ratioMat:        z.number().optional(),
        ratioMdo:        z.number().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");

      function extractFirstJson(text: string): string | null {
        const start = text.indexOf("{");
        if (start === -1) return null;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
        }
        return null;
      }

      const folhas = (input.schedule.atividades as any[]).filter((a: any) => !a.isGrupo);
      const grupos = (input.schedule.atividades as any[]).filter((a: any) => a.isGrupo);

      const eapToMes = new Map<string, number>();
      (input.schedule.meses as any[]).forEach((m: any) => m.atividades.forEach((a: any) => eapToMes.set(a.eapCodigo, m.mes)));

      const tabelaEAP = [
        "EAP | Nome | Dur(d) | Mês | Peso% | Custo | Mat | MdO | Predecessora",
        ...grupos.map((a: any) => `${a.eapCodigo} | **${a.nome}** | grupo`),
        ...folhas.map((a: any) => {
          const custo = (a.pesoFinanceiro / 100) * input.schedule.valorTotal;
          const mat   = parseFloat((custo * (input.schedule.ratioMat || 0)).toFixed(2));
          const mdo   = parseFloat((custo * (input.schedule.ratioMdo || 0)).toFixed(2));
          return `${a.eapCodigo} | ${a.nome} | ${a.duracaoDias}d | Mês${eapToMes.get(a.eapCodigo) ?? "?"} | ${Number(a.pesoFinanceiro).toFixed(2)}% | R$${custo.toFixed(2)} | R$${mat.toFixed(2)} | R$${mdo.toFixed(2)} | ${a.predecessora || "-"}`;
        }),
      ].join("\n");

      const systemPrompt = `Você é JULINHO, especialista sênior em planejamento e controle de obras de construção civil no Brasil. Você está ajudando o engenheiro a refinar o cronograma gerado pela IA.

CRONOGRAMA ATUAL:
- Valor total: R$${input.schedule.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Desembolso máximo mensal: R$${input.schedule.orcamentoMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Início: ${input.schedule.dataInicio}
- ${input.schedule.meses.length} meses · ${folhas.length} atividades folha

EAP COMPLETA:
${tabelaEAP}

SUAS CAPACIDADES:
1. Responder perguntas sobre o cronograma, sequência construtiva, dependências
2. Sugerir ajustes de duração, predecessoras, distribuição mensal
3. Explicar decisões tomadas pela IA na sequência

SE o engenheiro pedir para modificar o cronograma (ex: "mova X para o mês Y", "aumente duração de X", "coloque X depois de Y"), retorne uma resposta no seguinte formato JSON:
{
  "resposta": "Texto explicando a modificação feita e o motivo técnico.",
  "atividades": [ ... lista COMPLETA de atividades modificadas com todos os campos ... ]
}

Se for apenas uma conversa ou pergunta (sem modificação de schedule), responda em texto puro, SEM JSON.

REGRAS TÉCNICAS:
- Respeitar sempre a sequência construtiva brasileira (NBR 12.741, SINDUSCON)
- Duração mínima: 5 dias para qualquer atividade folha
- Predecessoras via eapCodigo (ex: "2.1,2.2")
- pesoFinanceiro: soma das folhas = 100
- Seja direto e técnico, tutear o engenheiro`;

      let rawText = "";
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            ...input.messages.map(m => ({ role: m.role as any, content: m.content })),
          ],
          maxTokens: 4000,
        });
        rawText = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content : "";
      } catch (e: any) {
        throw new Error(`Falha ao chamar JULINHO: ${e?.message ?? "erro desconhecido"}`);
      }

      // Tentar parsear se vier JSON com atividades modificadas
      const jsonStr = extractFirstJson(rawText);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.resposta && Array.isArray(parsed.atividades) && parsed.atividades.length > 0) {
            return { resposta: parsed.resposta, atividades: parsed.atividades, hasMod: true };
          }
        } catch { /* resposta em texto puro */ }
      }

      return { resposta: rawText.trim(), atividades: null, hasMod: false };
    }),

  // ── Curva S Financeira ───────────────────────────────────────────────────
  // ── Rev. 1670 Fase 4 — Curva S Financeira via Orçamento (R$ por atividade) ─
  // Substitui o `valor_atividade = peso% × totalVenda` por `valor_atividade =
  // custoTotal[eap_codigo] do Orçamento`. Faz join 1:1 entre
  // `planejamento_atividades.eap_codigo` (vindo do Texto5/WBS do MSP) e
  // `orcamento_itens.eap_codigo`. Atividades sem match no Orçamento caem no
  // fallback peso% × totalVenda (compatibilidade com cronogramas legados sem
  // EAP completo). R$ NUNCA vem do XML — Cost do XML é ignorado (gotcha
  // documentada: o MSP grava ×100/centavos, gera divergência).
  getCurvaSFinanceiraOrcamento: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();

      const [projeto] = await db.select({
        id: planejamentoProjetos.id,
        companyId: planejamentoProjetos.companyId,
        orcamentoId: planejamentoProjetos.orcamentoId,
        valorContrato: planejamentoProjetos.valorContrato,
      }).from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId)).limit(1);

      if (!projeto) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      // Tenant isolation
      const isAdminCsf = ctx.user.role === "admin" || ctx.user.role === "admin_master";
      if (!isAdminCsf && String(projeto.companyId) !== String(ctx.user.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este projeto." });
      }
      // Validação de relacionamento revisão↔projeto (evita cross-link via IDs)
      const [revCheck] = await db.select({ projetoId: planejamentoRevisoes.projetoId })
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.id, input.revisaoId)).limit(1);
      if (!revCheck || revCheck.projetoId !== input.projetoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Revisão não pertence ao projeto." });
      }

      if (!projeto?.orcamentoId) {
        return {
          status: "sem_orcamento" as const,
          mensagem: "Projeto sem orçamento vinculado — vincule um orçamento para usar custos por EAP.",
          totalCustoOrc: 0, totalVenda: 0, atividadesComCusto: 0,
          atividadesSemMatch: [] as Array<{ eapCodigo: string | null; nome: string }>,
          curva: [] as Array<{ semana: string; acumulado: number }>,
          curvaRealizada: [] as Array<{ semana: string; acumulado: number }>,
        };
      }

      const [orc] = await db.select({
        id: orcamentos.id,
        totalVenda: orcamentos.totalVenda,
      }).from(orcamentos).where(eq(orcamentos.id, projeto.orcamentoId)).limit(1);
      const totalVenda = n(orc?.totalVenda) || n(projeto?.valorContrato);

      const [ativs, itens, avancosRaw] = await Promise.all([
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId)),
        db.select({
          eapCodigo: orcamentoItens.eapCodigo,
          custoTotal: orcamentoItens.custoTotal,
        }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, projeto.orcamentoId)),
        db.select().from(planejamentoAvancos).where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
        )).orderBy(asc(planejamentoAvancos.semana)),
      ]);

      const custoPorEap = new Map<string, number>();
      for (const it of itens) {
        const k = (it.eapCodigo ?? "").trim();
        if (!k) continue;
        custoPorEap.set(k, (custoPorEap.get(k) ?? 0) + n(it.custoTotal));
      }
      const totalCustoOrc = [...custoPorEap.values()].reduce((s, v) => s + v, 0);

      const folhas = ativs.filter(a =>
        !a.isGrupo && !a.isMarco && !a.disabled && a.dataInicio && a.dataFim,
      );

      // Valor R$ por atividade — preferência: custo do Orçamento; fallback peso × venda.
      const pesoBruto = folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
      const ativComPeso = folhas.filter(a => n(a.pesoFinanceiro) > 0).length;
      const usarIgualPeso = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
      const pesoTotalFolhas = usarIgualPeso ? (folhas.length || 1) : pesoBruto;

      const valorPorAtiv = new Map<number, number>();
      const semMatch: Array<{ eapCodigo: string | null; nome: string }> = [];
      let comCusto = 0;
      for (const a of folhas) {
        const k = (a.eapCodigo ?? "").trim();
        const cOrc = k ? custoPorEap.get(k) : undefined;
        if (cOrc != null && cOrc > 0) {
          valorPorAtiv.set(a.id, cOrc);
          comCusto++;
        } else {
          // fallback peso × venda (mesma fórmula histórica)
          const pesoAtiv = usarIgualPeso ? 1 : n(a.pesoFinanceiro);
          const fallback = totalVenda > 0 ? (pesoAtiv / pesoTotalFolhas) * totalVenda : 0;
          valorPorAtiv.set(a.id, fallback);
          semMatch.push({ eapCodigo: a.eapCodigo, nome: a.nome });
        }
      }

      // Distribui o R$ ao longo das semanas (mesma lógica de getCurvaSFinanceira histórica)
      const dates: Map<string, number> = new Map();
      for (const a of folhas) {
        const v = valorPorAtiv.get(a.id) ?? 0;
        if (v <= 0) continue;
        const ini = new Date(toDateStr(a.dataInicio as any) + "T12:00:00Z");
        const fim = new Date(toDateStr(a.dataFim as any)    + "T12:00:00Z");
        if (isNaN(ini.getTime()) || isNaN(fim.getTime())) continue;
        const inicioSeg = new Date(toMondayStr(ini) + "T12:00:00Z");
        const fimSeg    = new Date(toMondayStr(fim) + "T12:00:00Z");
        const dur       = Math.max(1, (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000) + 1);
        const semVal    = v / dur;
        let cur = new Date(inicioSeg);
        for (let i = 0; i < dur; i++) {
          const k = toMondayStr(cur);
          dates.set(k, (dates.get(k) ?? 0) + semVal);
          cur = new Date(cur.getTime() + 7 * 86400000);
        }
      }
      const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      let acum = 0;
      const curva = sorted.map(([semana, val]) => { acum += val; return { semana, acumulado: +acum.toFixed(2) }; });
      if (curva.length > 0) {
        const primeiraDate = new Date(curva[0].semana + "T12:00:00Z");
        const semanaAntes  = new Date(primeiraDate.getTime() - 7 * 86400000);
        curva.unshift({ semana: toMondayStr(semanaAntes), acumulado: 0 });
      }

      // Curva realizada R$ — por semana, soma (acumulado% × valor R$ por atividade)
      const semanas = [...new Set(avancosRaw.map(av => toDateStr(av.semana as any)))].sort();
      const curvaRealizada = semanas.map(sem => {
        const latest: Record<number, number> = {};
        const latestSem: Record<number, string> = {};
        for (const av of avancosRaw) {
          const s = toDateStr(av.semana as any);
          if (s > sem) continue;
          const id = av.atividadeId;
          if (!latestSem[id] || s > latestSem[id]) { latestSem[id] = s; latest[id] = n(av.percentualAcumulado); }
        }
        let soma = 0;
        for (const a of folhas) {
          const v = valorPorAtiv.get(a.id) ?? 0;
          soma += (latest[a.id] ?? 0) / 100 * v;
        }
        return { semana: sem, acumulado: +soma.toFixed(2) };
      });

      return {
        status: "ok" as const,
        totalCustoOrc: +totalCustoOrc.toFixed(2),
        totalVenda: +totalVenda.toFixed(2),
        atividadesComCusto: comCusto,
        atividadesSemMatch: semMatch.slice(0, 50),
        curva,
        curvaRealizada,
      };
    }),

  // Distribui o valor total (orçamento ou contrato) pelas atividades folha
  // do cronograma, ponderado pelo peso_financeiro de cada atividade.
  // Se < 20% das atividades têm peso, usa peso igual (1/N).
  getCurvaSFinanceira: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      revisaoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [projeto] = await db.select({
        id:                    planejamentoProjetos.id,
        orcamentoId:           planejamentoProjetos.orcamentoId,
        valorContrato:         planejamentoProjetos.valorContrato,
        // Rev. 1835 — calendário MSP para distribuir o R$ em working time
        // (AACE 80R-13 §5.3 / Mattos), em vez de distribuição linear retangular.
        calendarioJson:        planejamentoProjetos.calendarioJson,
        dataInicio:            planejamentoProjetos.dataInicio,
        dataTerminoContratual: planejamentoProjetos.dataTerminoContratual,
      })
        .from(planejamentoProjetos)
        .where(eq(planejamentoProjetos.id, input.projetoId))
        .limit(1);
      // Rev. 1835 — Calendário MSP (parser unificado, mesmo da getCurvaS).
      const calMspFin = parseCalendarioJson(projeto?.calendarioJson ?? null);

      const todasAtividades = await db.select({
        id:             planejamentoAtividades.id,
        eapCodigo:      planejamentoAtividades.eapCodigo,
        nome:           planejamentoAtividades.nome,
        dataInicio:     planejamentoAtividades.dataInicio,
        dataFim:        planejamentoAtividades.dataFim,
        isGrupo:        planejamentoAtividades.isGrupo,
        isMarco:        planejamentoAtividades.isMarco,
        disabled:       planejamentoAtividades.disabled,
        pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
      })
        .from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, input.revisaoId));

      const folhas = todasAtividades.filter(a =>
        !a.isGrupo && !a.isMarco && !a.disabled && a.dataInicio && a.dataFim,
      );

      if (folhas.length === 0) {
        return { status: "ok" as const, divergencias: [], curva: [], totalVenda: 0 };
      }

      let totalVenda = 0;

      if (projeto?.orcamentoId) {
        const [orc] = await db.select({ totalVenda: orcamentos.totalVenda })
          .from(orcamentos)
          .where(eq(orcamentos.id, projeto.orcamentoId));
        if (orc) totalVenda = n(orc.totalVenda);
      }

      if (totalVenda === 0) {
        totalVenda = n(projeto?.valorContrato);
      }

      if (totalVenda === 0) {
        return { status: "ok" as const, divergencias: [], curva: [], totalVenda: 0 };
      }

      const pesoBruto   = folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
      const ativComPeso = folhas.filter(a => n(a.pesoFinanceiro) > 0).length;
      const usarIgual   = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
      const pesoTotal   = usarIgual ? folhas.length : pesoBruto;

      // Rev. 1835 — `valorPorAtiv` continua mapeando R$ total por atividade
      // (BAC_i = peso_i × totalVenda / pesoTotal). É reusado pelo BCWP.
      const valorPorAtiv = new Map<number, number>();
      // Estrutura per-folha pré-parseada (R$, ini/fim em ms) — alimenta tanto
      // a distribuição MSP quanto o fallback legado.
      type FolhaFin = { id: number; valor: number; iniMs: number; fimMs: number };
      const folhasFin: FolhaFin[] = [];
      folhas.forEach(a => {
        const iniIso = toDateStr(a.dataInicio).slice(0, 10);
        const fimIso = toDateStr(a.dataFim).slice(0, 10);
        const iniMs  = new Date(iniIso + "T12:00:00Z").getTime();
        const fimMs  = new Date(fimIso + "T12:00:00Z").getTime();
        if (!Number.isFinite(iniMs) || !Number.isFinite(fimMs)) return;
        const pesoAtiv  = usarIgual ? 1 : n(a.pesoFinanceiro);
        const valorAtiv = (pesoAtiv / pesoTotal) * totalVenda;
        valorPorAtiv.set(a.id, valorAtiv);
        folhasFin.push({ id: a.id, valor: valorAtiv, iniMs, fimMs });
      });

      // Rev. 1835 — Curva BCWS via working time MSP (per-activity).
      // Para cada Monday W do envelope: BCWS(W) = Σ valor_i × frac_i(W),
      // onde frac_i = fracaoDecorridaMs(ini_i, min(sun_W, fim_i), fim_i, calMSP).
      // Atividades pontuais (ini==fim ou marco) saltam 0→100% no dia. Quando
      // não há calMSP (XML sem calendário), cai no algoritmo legado de
      // distribuição linear retangular (preserva comportamento histórico).
      let pontos: { semana: string; acumulado: number }[] = [];
      if (calMspFin && folhasFin.length > 0) {
        const minIniMs = Math.min(...folhasFin.map(f => f.iniMs));
        const maxFimMs = Math.max(...folhasFin.map(f => f.fimMs));
        const startMonday = toMondayStr(new Date(minIniMs));
        const endMonday   = toMondayStr(new Date(maxFimMs));
        const semZero = toMondayStr(new Date(new Date(startMonday + "T12:00:00Z").getTime() - 7 * 86_400_000));
        pontos = [{ semana: semZero, acumulado: 0 }];
        const semanasEnvelope = Math.ceil((maxFimMs - minIniMs) / (7 * 86_400_000)) + 8;
        const maxIters = Math.max(8, semanasEnvelope);
        let cur = startMonday;
        for (let i = 0; i < maxIters && cur <= endMonday; i++) {
          const sunMs = new Date(cur + "T12:00:00Z").getTime() + 6 * 86_400_000;
          let soma = 0;
          for (const f of folhasFin) {
            let frac: number;
            if (f.fimMs <= f.iniMs) {
              frac = sunMs >= f.iniMs ? 1 : 0;
            } else {
              const refMs = Math.min(sunMs, f.fimMs);
              if (refMs <= f.iniMs) frac = 0;
              else frac = Math.min(1, Math.max(0, fracaoDecorridaMs(f.iniMs, refMs, f.fimMs, calMspFin)));
            }
            soma += frac * f.valor;
          }
          pontos.push({ semana: cur, acumulado: +Math.min(totalVenda, Math.max(0, soma)).toFixed(2) });
          cur = toMondayStr(new Date(new Date(cur + "T12:00:00Z").getTime() + 7 * 86_400_000));
        }
        // Garante ponto final = totalVenda quando a iteração parou logo antes
        // do término da última atividade (espelha gerarCurvaPlanejadaMSP).
        if (pontos.length > 1 && pontos[pontos.length - 1].acumulado < totalVenda) {
          pontos.push({ semana: endMonday, acumulado: +totalVenda.toFixed(2) });
        }
      } else {
        // Fallback legado — distribuição linear retangular (XML sem calendário).
        const dates: Map<string, number> = new Map();
        folhasFin.forEach(f => {
          const inicioSeg  = new Date(toMondayStr(new Date(f.iniMs)) + "T12:00:00Z");
          const fimSeg     = new Date(toMondayStr(new Date(f.fimMs)) + "T12:00:00Z");
          const weeksDiff  = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000);
          const dur        = Math.max(1, weeksDiff + 1);
          const semValor   = f.valor / dur;
          let cur = new Date(inicioSeg);
          for (let i = 0; i < dur; i++) {
            const key = toMondayStr(cur);
            dates.set(key, (dates.get(key) ?? 0) + semValor);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        });
        const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        let acum = 0;
        pontos = sorted.map(([semana, val]) => {
          acum += val;
          return { semana, acumulado: +acum.toFixed(2) };
        });
        if (pontos.length > 0) {
          const primeiraDate = new Date(pontos[0].semana + "T12:00:00Z");
          const semanaAntes  = new Date(primeiraDate.getTime() - 7 * 86400000);
          pontos.unshift({ semana: toMondayStr(semanaAntes), acumulado: 0 });
        }
      }

      const allSemanas = pontos.map(p => p.semana);

      const avancosDB = await db.select({
        atividadeId:       planejamentoAvancos.atividadeId,
        semana:            planejamentoAvancos.semana,
        percentualAcumulado: planejamentoAvancos.percentualAcumulado,
      })
        .from(planejamentoAvancos)
        .where(and(
          eq(planejamentoAvancos.projetoId, input.projetoId),
          eq(planejamentoAvancos.revisaoId, input.revisaoId),
        ));

      const bcwpMap = new Map<string, number>();
      let lastRealAvancoSemana = "";
      if (avancosDB.length > 0) {
        const ultimoPctPorAtiv = new Map<number, Map<string, number>>();
        avancosDB.forEach(av => {
          const sem = toMondayStr(new Date(av.semana + "T12:00:00Z"));
          if (!ultimoPctPorAtiv.has(av.atividadeId)) ultimoPctPorAtiv.set(av.atividadeId, new Map());
          ultimoPctPorAtiv.get(av.atividadeId)!.set(sem, n(av.percentualAcumulado));
          if (sem > lastRealAvancoSemana) lastRealAvancoSemana = sem;
        });

        allSemanas.forEach(sem => {
          if (sem > lastRealAvancoSemana) return;
          let totalEV = 0;
          for (const [ativId, valorAtiv] of valorPorAtiv) {
            const pctMap = ultimoPctPorAtiv.get(ativId);
            if (!pctMap) continue;
            let ultimoPct = 0;
            for (const s of allSemanas) {
              if (s > sem) break;
              if (pctMap.has(s)) ultimoPct = pctMap.get(s)!;
            }
            totalEV += (ultimoPct / 100) * valorAtiv;
          }
          if (totalEV > 0) bcwpMap.set(sem, +totalEV.toFixed(2));
        });
      }

      const medicoesDB = await db.select({
        competencia: planejamentoMedicoes.competencia,
        valorMedido: planejamentoMedicoes.valorMedido,
        status:      planejamentoMedicoes.status,
      })
        .from(planejamentoMedicoes)
        .where(eq(planejamentoMedicoes.projetoId, input.projetoId));

      const receitaMensal = new Map<string, number>();
      medicoesDB.forEach(m => {
        const val = n(m.valorMedido);
        if (val > 0) receitaMensal.set(m.competencia!, val);
      });

      const receitaMap = new Map<string, number>();
      if (receitaMensal.size > 0) {
        const mesParaSemana = new Map<string, string>();
        allSemanas.forEach(sem => {
          const mesSem = sem.substring(0, 7);
          mesParaSemana.set(mesSem, sem);
        });

        const compsSorted = [...receitaMensal.keys()].sort();
        let recAcum = 0;
        compsSorted.forEach(comp => {
          recAcum += receitaMensal.get(comp)!;
          const semAlvo = mesParaSemana.get(comp);
          if (semAlvo) {
            receitaMap.set(semAlvo, +recAcum.toFixed(2));
          }
        });

        if (recAcum > 0) {
          const lastSet = [...receitaMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))[0];
          if (lastSet) {
            allSemanas.forEach(sem => {
              if (sem > lastSet[0]) return;
              if (!receitaMap.has(sem)) {
                const prev = allSemanas.filter(s => s < sem && receitaMap.has(s)).pop();
                if (prev) receitaMap.set(sem, receitaMap.get(prev)!);
              }
            });
          }
        }
      }

      const bcwpSorted = [...bcwpMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

      const receitaSorted = [...receitaMap.entries()].filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0]));
      const lastReceitaSemana = receitaSorted.length > 0 ? receitaSorted[receitaSorted.length - 1][0] : null;

      const tendenciaMap = new Map<string, number>();
      if (bcwpSorted.length >= 2) {
        const pts = bcwpSorted.map(([sem, val], i) => ({ i, sem, val }));
        const nn = pts.length;
        const xs = pts.map(p => p.i);
        const ys = pts.map(p => p.val);
        const sumX  = xs.reduce((a, b) => a + b, 0);
        const sumY  = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const denom = nn * sumX2 - sumX * sumX;
        if (denom !== 0) {
          const slope = (nn * sumXY - sumX * sumY) / denom;
          const inter = (sumY - slope * sumX) / nn;

          pts.forEach(p => {
            tendenciaMap.set(p.sem, +Math.max(0, (inter + slope * p.i)).toFixed(2));
          });

          const lastIdx = nn - 1;
          const lastPlanSemana = allSemanas[allSemanas.length - 1] ?? "";
          const lastDate = new Date(pts[lastIdx].sem + "T12:00:00Z");
          for (let w = 1; w <= 52; w++) {
            const proj = inter + slope * (lastIdx + w);
            if (proj >= totalVenda * 1.05) break;
            const d = new Date(lastDate.getTime() + w * 7 * 86400000);
            const key = toMondayStr(d);
            if (key > lastPlanSemana) break;
            tendenciaMap.set(key, +Math.max(0, Math.min(totalVenda, proj)).toFixed(2));
          }
        }
      }

      if (lastRealAvancoSemana && pontos.length > 0) {
        const primeiraSemana = pontos[0].semana;
        if (!bcwpMap.has(primeiraSemana)) {
          bcwpMap.set(primeiraSemana, 0);
        }
      }

      const curvaCompleta = pontos.map(p => ({
        semana: p.semana,
        acumulado: p.acumulado,
        bcwp: (lastRealAvancoSemana && p.semana <= lastRealAvancoSemana) ? (bcwpMap.get(p.semana) ?? null) : null,
        receita: (lastReceitaSemana && p.semana <= lastReceitaSemana) ? (receitaMap.get(p.semana) ?? null) : null,
        tendencia: tendenciaMap.get(p.semana) ?? null,
      }));

      return { status: "ok" as const, divergencias: [], curva: curvaCompleta, totalVenda };
    }),

  recalcularPesosFinanceiros: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input }) => {
      // Rev. 1820 — delega ao helper FONTE ÚNICA (com rateio por duração entre
      // folhas que compartilham a mesma EAP — item 4 da auditoria vs. literatura).
      const db = await getDb();
      return await recalcularPesosCore(db, input.projetoId, input.revisaoId);
    }),

  // Rev. 1821 — Procedure `diagnosticoOrcamento` foi DESCARTADA antes de
  // shipar: o componente <DiagnosticoEapOrcCron /> e a procedure existente
  // `diagnosticoEapOrcVsCron` (L3704) já cobrem o caso. Nesta revisão a chave
  // de comparação dela passa a usar `eapCanonico()` — mesmo critério do
  // `recalcularPesosCore`. Sem UI nova, sem procedure duplicada (R-017).
  dashboardGeral: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedObraIds = await resolvePlanAllowedObraIds(
        db, ctx.user.id, ctx.user.role, ctx.user.email, input.companyId,
      );

      const projRows = await db.select({
        id:                    planejamentoProjetos.id,
        obraId:                planejamentoProjetos.obraId,
        nome:                  planejamentoProjetos.nome,
        cliente:               planejamentoProjetos.cliente,
        responsavel:           planejamentoProjetos.responsavel,
        dataInicio:            planejamentoProjetos.dataInicio,
        dataTerminoContratual: planejamentoProjetos.dataTerminoContratual,
        valorContrato:         planejamentoProjetos.valorContrato,
        status:                planejamentoProjetos.status,
        orcamentoTotalVenda:   orcamentos.totalVenda,
        orcamentoTotalCusto:   orcamentos.totalCusto,
        orcamentoTotalMeta:    orcamentos.totalMeta,
        orcamentoValorNegociado: orcamentos.valorNegociado,
      })
        .from(planejamentoProjetos)
        .leftJoin(orcamentos, eq(planejamentoProjetos.orcamentoId, orcamentos.id))
        .where(
          allowedObraIds !== null
            ? and(eq(planejamentoProjetos.companyId, input.companyId), inArray(planejamentoProjetos.obraId, allowedObraIds.length > 0 ? allowedObraIds : [0]))
            : eq(planejamentoProjetos.companyId, input.companyId)
        )
        .orderBy(desc(planejamentoProjetos.criadoEm));

      const projIds = projRows.map(p => p.id);
      if (projIds.length === 0) {
        return {
          projetos: [],
          refisData: [],
          atividadesResumo: [],
        };
      }

      const refisRows = await db.select({
        projetoId:                 planejamentoRefis.projetoId,
        semana:                    planejamentoRefis.semana,
        avancoPrevisto:            planejamentoRefis.avancoPrevisto,
        avancoRealizado:           planejamentoRefis.avancoRealizado,
        avancoSemanalPrevisto:     planejamentoRefis.avancoSemanalPrevisto,
        avancoSemanalRealizado:    planejamentoRefis.avancoSemanalRealizado,
        spi:                       planejamentoRefis.spi,
        cpi:                       planejamentoRefis.cpi,
        custoPrevisto:             planejamentoRefis.custoPrevisto,
        custoRealizado:            planejamentoRefis.custoRealizado,
        status:                    planejamentoRefis.status,
      })
        .from(planejamentoRefis)
        .where(inArray(planejamentoRefis.projetoId, projIds))
        .orderBy(desc(planejamentoRefis.semana));

      const atividadesResult = await db.execute(sql`
        SELECT
          a.projeto_id,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE a.is_grupo = false AND a.is_marco = false) as total_folhas,
          COUNT(*) FILTER (WHERE a.is_marco = true) as total_marcos
        FROM planejamento_atividades a
        INNER JOIN planejamento_revisoes r ON r.id = a.revisao_id
        WHERE a.projeto_id = ANY(${projIds})
          AND r.status = 'aprovada'
          AND a.deleted_at IS NULL
        GROUP BY a.projeto_id
      `);
      const atividadesResumo = (atividadesResult?.rows ?? atividadesResult ?? []) as any[];

      const avancosResult = await db.execute(sql`
        SELECT
          av.projeto_id,
          MAX(av.percentual_acumulado) as max_avanco
        FROM planejamento_avancos av
        INNER JOIN planejamento_revisoes r ON r.id = av.revisao_id
        WHERE av.projeto_id = ANY(${projIds})
          AND r.status = 'aprovada'
        GROUP BY av.projeto_id
      `);
      const avancosMap: Record<number, number> = {};
      for (const r of (avancosResult?.rows ?? avancosResult ?? []) as any[]) {
        avancosMap[r.projeto_id] = n(r.max_avanco);
      }

      const refisMap = new Map<number, typeof refisRows[0]>();
      for (const r of refisRows) {
        if (r.status === "consolidado" && !refisMap.has(r.projetoId)) refisMap.set(r.projetoId, r);
      }
      const atvMap = new Map<number, any>();
      for (const a of atividadesResumo) atvMap.set(a.projeto_id, a);

      const projetosEnriquecidos = projRows.map(p => {
        const ultimoRefis = refisMap.get(p.id);
        const atv = atvMap.get(p.id);
        const valor = n(p.valorContrato) || n(p.orcamentoValorNegociado) || n(p.orcamentoTotalVenda);
        const custoMeta = n(p.orcamentoTotalMeta) || n(p.orcamentoTotalCusto);

        const avancoPrev = ultimoRefis ? n(ultimoRefis.avancoPrevisto) : 0;
        const avancoReal = ultimoRefis ? n(ultimoRefis.avancoRealizado) : (avancosMap[p.id] ?? 0);
        const spi = ultimoRefis ? n(ultimoRefis.spi) : (avancoPrev > 0 ? avancoReal / avancoPrev : 1);
        const cpi = ultimoRefis ? n(ultimoRefis.cpi) : 1;

        const hoje = new Date().toISOString().split("T")[0];
        const prazo = p.dataTerminoContratual ? toDateStr(p.dataTerminoContratual) : null;
        const atrasado = prazo && prazo < hoje && !(p.status || "").toLowerCase().includes("conclu");

        let diasRestantes: number | null = null;
        if (prazo) {
          const diff = new Date(prazo).getTime() - new Date(hoje).getTime();
          diasRestantes = Math.ceil(diff / 86_400_000);
        }

        return {
          id: p.id,
          obraId: p.obraId,
          nome: p.nome,
          cliente: p.cliente,
          responsavel: p.responsavel,
          dataInicio: p.dataInicio ? toDateStr(p.dataInicio) : null,
          dataTerminoContratual: prazo,
          status: p.status,
          valorContrato: valor,
          custoMeta,
          avancoPrevisto: avancoPrev,
          avancoRealizado: avancoReal,
          desvio: avancoReal - avancoPrev,
          spi,
          cpi,
          custoPrevisto: ultimoRefis ? n(ultimoRefis.custoPrevisto) : 0,
          custoRealizado: ultimoRefis ? n(ultimoRefis.custoRealizado) : 0,
          totalAtividades: atv ? Number(atv.total_folhas) : 0,
          totalMarcos: atv ? Number(atv.total_marcos) : 0,
          atrasado: !!atrasado,
          diasRestantes,
          ultimoRefisSemana: ultimoRefis?.semana ? toDateStr(ultimoRefis.semana) : null,
        };
      });

      return {
        projetos: projetosEnriquecidos,
        refisData: refisRows.map(r => ({
          projetoId: r.projetoId,
          semana: toDateStr(r.semana),
          avancoPrevisto: n(r.avancoPrevisto),
          avancoRealizado: n(r.avancoRealizado),
          spi: n(r.spi),
          cpi: n(r.cpi),
          status: r.status,
        })),
        atividadesResumo: atividadesResumo.map((a: any) => ({
          projetoId: a.projeto_id,
          total: Number(a.total),
          totalFolhas: Number(a.total_folhas),
          totalMarcos: Number(a.total_marcos),
        })),
      };
    }),
});


// ════════════════════════════════════════════════════════════════════════════
// Rev. 3288 — Núcleo COMPARTILHADO da Curva S de Trabalho (extraído de getCurvaS
// sem mudança de comportamento). O Portal do Cliente (portalExterno.ts) reusa
// ESTA função para que a Curva S e os agregados do Portal sejam BYTE-IDÊNTICOS
// ao módulo Planejamento (single-source-of-truth = previsto_semanas_json + os
// snapshots MSP). REGRA DE OURO: o Portal só REPLICA o Planejamento, nunca recalcula.
// ════════════════════════════════════════════════════════════════════════════
export async function computeCurvaSData(input: { projetoId: number; revisaoId: number; baselineId: number; usarPesoPorDuracao?: boolean }) {
      const db = await getDb();
      const [atividades, baseline, avancosRaw, projRow] = await Promise.all([
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.revisaoId))
          .orderBy(asc(planejamentoAtividades.dataInicio)),
        db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, input.baselineId))
          .orderBy(asc(planejamentoAtividades.dataInicio)),
        db.select().from(planejamentoAvancos)
          .where(and(
            eq(planejamentoAvancos.projetoId, input.projetoId),
            eq(planejamentoAvancos.revisaoId, input.revisaoId),
          ))
          .orderBy(asc(planejamentoAvancos.semana)),
        db.select({
          calendarioJson: planejamentoProjetos.calendarioJson,
          dataInicio: planejamentoProjetos.dataInicio,
          dataTerminoContratual: planejamentoProjetos.dataTerminoContratual,
          previstoSemanasJson: planejamentoProjetos.previstoSemanasJson,
        })
          .from(planejamentoProjetos)
          .where(eq(planejamentoProjetos.id, input.projetoId))
          .limit(1),
      ]);
      // Normaliza semana para "YYYY-MM-DD" (pg retorna colunas date como Date objects)
      const avancos = avancosRaw.map(av => ({ ...av, semana: toDateStr(av.semana) }));
      // Rev. 1675 — parse do snapshot do calendarioJson para fallback do
      // Realizado quando não há lançamentos em planejamento_avancos.
      let calMspRoot: any = null;
      try { calMspRoot = projRow[0]?.calendarioJson ? JSON.parse(projRow[0].calendarioJson) : null; }
      catch { calMspRoot = null; }
      // Rev. 1689 — Calendário MSP tipado (mesmo parser usado pelo client em
      // pvMacro) para gerar a Baseline via envelope (du(início→ref)/du(envelope)).
      const calMSP = parseCalendarioJson(projRow[0]?.calendarioJson ?? null);
      const projIniIso = projRow[0]?.dataInicio ? toDateStr(projRow[0].dataInicio) : null;
      const projFimIso = projRow[0]?.dataTerminoContratual ? toDateStr(projRow[0].dataTerminoContratual) : null;

      function gerarCurvaPlanejada(ativs: typeof atividades) {
        if (!ativs.length) return [];
        const folhas = ativs.filter(a => !a.isGrupo && !a.isIndireta && !a.disabled && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];

        // Modo MS Project: pondera por duração em dias (igual ao cálculo nativo do Project)
        // Modo Financeiro: pondera por pesoFinanceiro (pesos % configurados na EAP)
        const porDuracao = !!input.usarPesoPorDuracao;
        const pesoBruto = porDuracao
          ? folhas.reduce((s, a) => s + (a.duracaoDias ?? 0), 0)
          : folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
        const ativComPeso = porDuracao
          ? folhas.filter(a => (a.duracaoDias ?? 0) > 0).length
          : folhas.filter(a => n(a.pesoFinanceiro) > 0).length;
        const usarIgual = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
        const pesoTotal = usarIgual ? folhas.length : pesoBruto;

        const dates: Map<string, number> = new Map();
        folhas.forEach(a => {
          // Parseia datas evitando desvio de fuso: usa meio-dia UTC para garantir que
          // "2026-01-26" nunca vire "2026-01-25" ao normalizar para segunda-feira.
          const parseDate = (v: any): Date => {
            const s = toDateStr(v).slice(0, 10); // "YYYY-MM-DD"
            return new Date(s + "T12:00:00Z");
          };
          const inicio = parseDate(a.dataInicio);
          const fim    = parseDate(a.dataFim);
          if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return; // ignora datas inválidas
          // Normaliza início e fim para a segunda-feira da respectiva semana
          const inicioSeg = new Date(toMondayStr(inicio) + "T12:00:00Z");
          const fimSeg    = new Date(toMondayStr(fim)    + "T12:00:00Z");
          // dur = nº de semanas que a atividade ocupa.
          const weeksDiff = (fimSeg.getTime() - inicioSeg.getTime()) / (7 * 86400000); // inteiro exato
          const dur       = Math.max(1, weeksDiff + 1);
          const pesoAtiv = usarIgual ? 1 : (porDuracao ? (a.duracaoDias ?? 0) : n(a.pesoFinanceiro));
          const semPeso  = pesoAtiv / dur / pesoTotal * 100;
          let cur = new Date(inicioSeg);
          for (let i = 0; i < dur; i++) {
            // Chave sempre é uma segunda-feira — garante alinhamento com o eixo X do gráfico
            const key = toMondayStr(cur);
            dates.set(key, (dates.get(key) ?? 0) + semPeso);
            cur = new Date(cur.getTime() + 7 * 86400000);
          }
        });

        const sorted = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        if (sorted.length === 0) return [];
        const primeiraSemana = sorted[0][0];
        const semanaAnterior = new Date(new Date(primeiraSemana + "T12:00:00Z").getTime() - 7 * 86400000);
        const semZero = toMondayStr(semanaAnterior);
        let acum = 0;
        const pontos = [{ semana: semZero, acumulado: 0 }];
        sorted.forEach(([semana, val]) => {
          acum = Math.min(100, acum + val);
          pontos.push({ semana, acumulado: +acum.toFixed(2) });
        });
        return pontos;
      }

      // Rev. 1689.1 — Curva Planejada PER-ACTIVITY com dias úteis MSP.
      // Reescrita do `gerarCurvaPlanejadaMSP`: para cada semana W (Sunday),
      // Baseline(W) = Σ peso_i × fracaoDecorridaMs(iniAtv_i, min(W, fimAtv_i), fimAtv_i, calMSP).
      // Isso devolve a forma de S natural (atividades concentram trabalho no
      // miolo do projeto) e fica próximo do card `pvMacro` em qualquer ponto,
      // porque ambos usam dias úteis MSP — apenas com granularidade diferente
      // (per-atividade aqui, envelope inteiro no card). Snapshot Texto10
      // (`previstoMspPct`) ponderado é usado quando o Sunday bate com o
      // `statusDateSnapshot` gravado no XML — paridade absoluta MSP.
      // Fallback: algoritmo legado per-activity (`gerarCurvaPlanejada`) quando
      // não houver calMSP ou faltar dataInicio/dataFim nas atividades.
      function gerarCurvaPlanejadaMSP(ativs: typeof atividades): { semana: string; acumulado: number }[] {
        if (!calMSP) return [];
        const folhas = ativs.filter(a => !a.isGrupo && !a.isIndireta && !a.disabled && a.dataInicio && a.dataFim);
        if (!folhas.length) return [];
        // Pesagem unificada (mesma regra do helper legado e do client).
        const porDuracao = !!input.usarPesoPorDuracao;
        const pesoBruto = porDuracao
          ? folhas.reduce((s, a) => s + (a.duracaoDias ?? 0), 0)
          : folhas.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
        const ativComPeso = porDuracao
          ? folhas.filter(a => (a.duracaoDias ?? 0) > 0).length
          : folhas.filter(a => n(a.pesoFinanceiro) > 0).length;
        const usarIgual = pesoBruto === 0 || ativComPeso < folhas.length * 0.2;
        const pesoTotal = usarIgual ? folhas.length : pesoBruto;
        const pesoDe = (a: typeof folhas[number]): number =>
          usarIgual ? 1 : (porDuracao ? (a.duracaoDias ?? 0) : n(a.pesoFinanceiro));
        // Pré-calcula timestamps das atividades.
        type Folha = { peso: number; iniMs: number; fimMs: number; iniIso: string; fimIso: string; previstoMspPct: number | null };
        // `previsto_msp_pct` é NUMERIC nullable em planejamento_atividades (Rev. 1670 Fase 1).
        // Tipo do row inclui essa coluna desde o ColFix do startup; tipagem explícita evita `any`.
        type AtivRow = typeof folhas[number] & { previstoMspPct?: string | number | null };
        const folhasPrep: Folha[] = folhas.map((a: AtivRow) => {
          const iniIso = toDateStr(a.dataInicio);
          const fimIso = toDateStr(a.dataFim);
          const prev = a.previstoMspPct;
          const prevNum = prev == null ? null : (typeof prev === "number" ? prev : parseFloat(String(prev)));
          return {
            peso: pesoDe(a),
            iniMs: new Date(iniIso + "T12:00:00Z").getTime(),
            fimMs: new Date(fimIso + "T12:00:00Z").getTime(),
            iniIso, fimIso,
            previstoMspPct: prevNum != null && Number.isFinite(prevNum) ? prevNum : null,
          };
        }).filter(f => Number.isFinite(f.iniMs) && Number.isFinite(f.fimMs) && f.fimMs >= f.iniMs);
        if (!folhasPrep.length) return [];
        // Janela do gráfico: do Monday da menor data até o Monday da maior.
        const minIniMs = Math.min(...folhasPrep.map(f => f.iniMs));
        const maxFimMs = Math.max(...folhasPrep.map(f => f.fimMs));
        const startMonday = toMondayStr(new Date(minIniMs));
        const endMonday   = toMondayStr(new Date(maxFimMs));
        const semZero = toMondayStr(new Date(new Date(startMonday + "T12:00:00Z").getTime() - 7 * 86_400_000));
        const pontos: { semana: string; acumulado: number }[] = [{ semana: semZero, acumulado: 0 }];
        const semanasEnvelope = Math.ceil((maxFimMs - minIniMs) / (7 * 86_400_000)) + 8;
        const maxIters = Math.max(8, semanasEnvelope);
        // Rev. 2651 — FALLBACK por datas (forma de S por tempo útil). NÃO injeta
        // mais o Texto10 por atividade numa única semana (revogada a Rev. 2650):
        // aquilo usava uma fonte DISTINTA do header e criava um DEGRAU (queda)
        // fora da curva — a linha azul deixava de ser monotônica ("não segue a
        // literatura"). A linha azul agora PREFERE o snapshot `previsto_semanas`
        // (mesma fonte do header, ver `curvaPrevistoSnapshot`); este helper só
        // atende projetos SEM esse snapshot.
        let cur = startMonday;
        for (let i = 0; i < maxIters && cur <= endMonday; i++) {
          const sunMs = new Date(cur + "T12:00:00Z").getTime() + 6 * 86_400_000;
          let soma = 0;
          for (const f of folhasPrep) {
            let pct: number;
            // Atividade pontual (marco/início/fim — ini==fim): 100% no dia que
            // o cursor atinge ou ultrapassa a data, 0% antes. Cobrir ANTES do
            // teste `refMs<=ini` pra evitar que marco fique zerado eternamente.
            if (f.fimMs <= f.iniMs) {
              pct = sunMs >= f.iniMs ? 100 : 0;
            } else {
              const refMs = Math.min(sunMs, f.fimMs);
              if (refMs <= f.iniMs) pct = 0;
              else pct = Math.min(100, Math.max(0, fracaoDecorridaMs(f.iniMs, refMs, f.fimMs, calMSP) * 100));
            }
            soma += pct * (f.peso / pesoTotal);
          }
          pontos.push({ semana: cur, acumulado: +Math.min(100, Math.max(0, soma)).toFixed(2) });
          cur = toMondayStr(new Date(new Date(cur + "T12:00:00Z").getTime() + 7 * 86_400_000));
        }
        // Garante ponto final 100% se a última semana ficou abaixo (atividade
        // que termina no meio da semana após o último Sunday iterado).
        if (pontos.length > 1 && pontos[pontos.length - 1].acumulado < 100) {
          pontos.push({ semana: endMonday, acumulado: 100 });
        }
        return pontos;
      }
      // Baseline: prefere helper MSP per-activity (forma de S + paridade card).
      // Fallback: algoritmo legado quando não há calMSP/snapshot.

      // Rev. 2651 — A linha Baseline/Previsto (azul) LÊ o snapshot
      // `previsto_semanas` (FONTE ÚNICA do "% Previsto" — a MESMA que o header lê
      // via `previstoCurva.raizAt`), re-chaveando o dia-de-corte (Quinta, diaCorte)
      // → segunda-feira da semana p/ alinhar com a curva Realizada (que usa Monday).
      // GARANTE: (a) curva S monotônica/suave (sem o degrau da Rev. 2650); (b) a azul
      // passa EXATAMENTE pelo "% Previsto" do header no ponto do status; (c) com
      // Previsto=Realizado as linhas se sobrepõem. Só vale p/ a revisão DONA do
      // snapshot (`revisaoId`); senão cai no fallback por datas.
      let previstoSnap: any = null;
      try {
        const raw = (projRow[0] as any)?.previstoSemanasJson;
        previstoSnap = raw ? JSON.parse(raw) : null;
      } catch { previstoSnap = null; }
      function curvaPrevistoSnapshot(targetRev: number): { semana: string; acumulado: number }[] | null {
        // `raiz` é o rollup ponderado por DURAÇÃO (Texto10 do MSP). Só vale p/ a
        // Curva S de Trabalho (duração); modo financeiro tem fonte/procedure própria.
        if (!input.usarPesoPorDuracao) return null;
        if (!previstoSnap) return null;
        const semanasSnap: string[] = Array.isArray(previstoSnap.semanas) ? previstoSnap.semanas : [];
        const raizSnap: number[] = Array.isArray(previstoSnap.raiz) ? previstoSnap.raiz : [];
        if (semanasSnap.length === 0 || raizSnap.length !== semanasSnap.length) return null;
        const revId = previstoSnap.revisaoId ?? null;
        // Snapshot de outra revisão → rejeita. Snapshot legado SEM revisaoId só vale
        // p/ a revisão ATIVA (input.revisaoId), p/ evitar reúso cross-revisão.
        if (revId != null) {
          if (revId !== targetRev) return null;
        } else if (targetRev !== input.revisaoId) {
          return null;
        }
        const pts: { semana: string; acumulado: number }[] = [];
        let acumPrev = 0;
        for (let i = 0; i < semanasSnap.length; i++) {
          const semStr = semanasSnap[i];
          const dt = new Date((semStr ?? "") + "T12:00:00Z");
          if (!semStr || isNaN(dt.getTime())) continue; // pula semana malformada (sem throw)
          const mon = toMondayStr(dt);
          // `raiz` já é monotônica; clamp defensivo p/ nunca regredir (curva S não cai).
          acumPrev = Math.max(acumPrev, Math.min(100, Math.max(0, Number(raizSnap[i]) || 0)));
          pts.push({ semana: mon, acumulado: +acumPrev.toFixed(2) });
        }
        if (pts.length === 0) return null;
        // Ponto-zero inicial (1 semana antes do 1º cutoff), espelhando as demais curvas.
        if (pts[0].acumulado !== 0) {
          const semZeroPrev = toMondayStr(new Date(new Date(pts[0].semana + "T12:00:00Z").getTime() - 7 * 86_400_000));
          pts.unshift({ semana: semZeroPrev, acumulado: 0 });
        }
        return pts;
      }

      const baselineSnap = curvaPrevistoSnapshot(input.baselineId);
      const baselineMSP = baselineSnap ? [] : gerarCurvaPlanejadaMSP(baseline);
      const curvaBaseline = baselineSnap ?? (baselineMSP.length > 0 ? baselineMSP : gerarCurvaPlanejada(baseline));
      // "Revisão Atual" só aparece quando difere da baseline.
      const curvaPlanejada = input.baselineId !== input.revisaoId
        ? (() => {
            const planSnap = curvaPrevistoSnapshot(input.revisaoId);
            if (planSnap) return planSnap;
            const planMSP = gerarCurvaPlanejadaMSP(atividades);
            return planMSP.length > 0 ? planMSP : gerarCurvaPlanejada(atividades);
          })()
        : [];

      // Curva realizada — acumulado ponderado por atividade
      const porDuracaoCurva    = !!input.usarPesoPorDuracao;
      const folhasParaCurva    = atividades.filter(a => !a.isGrupo && !a.isIndireta && !a.disabled);
      const pesoBrutoCurva     = porDuracaoCurva
        ? folhasParaCurva.reduce((s, a) => s + (a.duracaoDias ?? 0), 0)
        : folhasParaCurva.reduce((s, a) => s + n(a.pesoFinanceiro), 0);
      const ativComPesoCurva   = porDuracaoCurva
        ? folhasParaCurva.filter(a => (a.duracaoDias ?? 0) > 0).length
        : folhasParaCurva.filter(a => n(a.pesoFinanceiro) > 0).length;
      const usarIgualCurva     = pesoBrutoCurva === 0 || ativComPesoCurva < folhasParaCurva.length * 0.2;
      const pesoTotalCurva     = usarIgualCurva ? folhasParaCurva.length || 1 : pesoBrutoCurva;

      // Obtém todas as semanas com dados, em ordem
      const semanasComAvanco = [...new Set(avancos.map(av => av.semana))].sort();

      const curvaRealizada = semanasComAvanco.map(semana => {
        const latestMap: Record<number, { val: number; sem: string }> = {};
        avancos
          .filter(av => av.semana <= semana)
          .forEach(av => {
            const id = av.atividadeId;
            if (!latestMap[id] || av.semana > latestMap[id].sem) {
              latestMap[id] = { val: n(av.percentualAcumulado), sem: av.semana };
            }
          });
        let soma = 0;
        folhasParaCurva.forEach(a => {
          const peso = usarIgualCurva ? 1 : (porDuracaoCurva ? (a.duracaoDias ?? 0) : n(a.pesoFinanceiro));
          soma += (latestMap[a.id]?.val ?? 0) * (peso / pesoTotalCurva);
        });
        return { semana, acumulado: +Math.min(100, soma).toFixed(2) };
      });

      // Rev. 1675 — Fallback de snapshot MSP para a curva Realizada.
      // Quando o usuário importa o XML pela aba "Cronograma → Importar
      // Cronograma", populamos `realizado_msp_pct` por atividade + o
      // snapshot da raiz `realizadoMspSnapshot` no calendarioJson, MAS
      // não criamos lançamentos em `planejamento_avancos` (a tabela
      // tradicional só é populada por inputs semanais ou pelo botão
      // "Importar MS Project" do Avanço Semanal). Sem este fallback, a
      // Curva S de Trabalho fica sem linha verde mesmo o card mostrando
      // 1,38% — porque vem de fontes diferentes. Estratégia (mesma
      // hierarquia da Rev. 1675 no card e na top bar):
      //   1) snapshot da raiz `realizadoMspSnapshot` (paridade absoluta MSP)
      //   2) ponderar `realizadoMspPct` por atividade (1,38% no REVTE)
      //   3) sem nada → curva continua vazia (comportamento antigo).
      // O ponto sintético é ancorado na semana do StatusDate (segunda-feira
      // da semana de cutoff oficial gravada no XML), só é injetado se essa
      // semana ainda não tiver dado vindo de planejamento_avancos.
      // Rev. 2274 — Snapshot MSP raiz UID=0 (`realizadoMspSnapshot`) agora
      // SOBRESCREVE o ponto da semana do StatusDate quando disponível
      // (antes só era injetado se a semana NÃO tivesse entrada na tabela
      // `planejamento_avancos`, deixando a curva travada em 6,16 % ponderado
      // enquanto o topo/card mostravam 8,48 % do snapshot — linha verde
      // colava na vermelha mesmo com obra adiantada). Regra de ouro: o
      // snapshot MSP é a verdade. Fallback (`realizadoMspPct` ponderado)
      // continua aplicando-se apenas quando a semana ainda não tem ponto.
      const statusDateMsp = typeof calMspRoot?.statusDateSnapshot === "string" ? calMspRoot.statusDateSnapshot : null;
      if (statusDateMsp) {
        const semStatus = toMondayStr(new Date(statusDateMsp + "T12:00:00Z"));
        const idxJaTem = curvaRealizada.findIndex(p => p.semana === semStatus);
        let snapAcum: number | null = null;
        if (typeof calMspRoot.realizadoMspSnapshot === "number") {
          snapAcum = Math.min(100, Math.max(0, calMspRoot.realizadoMspSnapshot));
        } else if (idxJaTem < 0) {
          // Fallback ponderado só quando NÃO há snapshot raiz E a semana
          // ainda não tem ponto (preserva comportamento legado).
          let soma = 0; let temAlgumSnap = false;
          folhasParaCurva.forEach(a => {
            const snap = (a as any).realizadoMspPct == null ? null : n((a as any).realizadoMspPct);
            if (snap != null) {
              temAlgumSnap = true;
              const peso = usarIgualCurva ? 1 : (porDuracaoCurva ? (a.duracaoDias ?? 0) : n(a.pesoFinanceiro));
              soma += snap * (peso / pesoTotalCurva);
            }
          });
          if (temAlgumSnap) snapAcum = +Math.min(100, soma).toFixed(2);
        }
        if (snapAcum != null) {
          const valor = +snapAcum.toFixed(2);
          if (idxJaTem >= 0) {
            // Sobrescreve: snapshot MSP > ponderação ad-hoc da tabela de avanços.
            curvaRealizada[idxJaTem] = { semana: semStatus, acumulado: valor };
          } else {
            curvaRealizada.push({ semana: semStatus, acumulado: valor });
            curvaRealizada.sort((a, b) => a.semana.localeCompare(b.semana));
          }
        }
      }
      if (curvaRealizada.length > 0) {
        if (curvaRealizada[0].acumulado !== 0) {
          const primeiraSemReal = curvaRealizada[0].semana;
          const semAnteriorReal = new Date(new Date(primeiraSemReal + "T12:00:00Z").getTime() - 7 * 86400000);
          const semZeroReal = toMondayStr(semAnteriorReal);
          curvaRealizada.unshift({ semana: semZeroReal, acumulado: 0 });
        }
      }

      // Linha de tendência por regressão linear
      let curvaTendencia: { semana: string; acumulado: number }[] = [];
      if (curvaRealizada.length >= 2) {
        const nn = curvaRealizada.length;
        const xs = curvaRealizada.map((_, i) => i);
        const ys = curvaRealizada.map(p => p.acumulado);
        const sumX  = xs.reduce((a, b) => a + b, 0);
        const sumY  = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
        const sumX2 = xs.reduce((s, x) => s + x * x, 0);
        const slope = (nn * sumXY - sumX * sumY) / (nn * sumX2 - sumX * sumX);
        const inter = (sumY - slope * sumX) / nn;

        const lastReal = curvaRealizada[curvaRealizada.length - 1];
        const lastDate = new Date(lastReal.semana);
        curvaTendencia = curvaRealizada.map(p => ({ ...p }));

        for (let w = 1; w <= 16; w++) {
          const proj = inter + slope * (nn - 1 + w);
          if (proj >= 100) break;
          const d = new Date(lastDate.getTime() + w * 7 * 86400000);
          curvaTendencia.push({
            semana:    d.toISOString().split("T")[0],
            acumulado: Math.min(100, +proj.toFixed(2)),
          });
        }
      }

      return { curvaPlanejada, curvaBaseline, curvaRealizada, curvaTendencia };
    }
