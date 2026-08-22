import React, { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { parseCalendarioJson, fracaoDecorridaMs as fracaoDecorridaMsCal, fracaoDecorridaComHora, diasUteisEntre as diasUteisEntreCal } from "../../../../shared/diasUteis";
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Loader2,
  Brain, AlertTriangle, Wrench, Users, Package, Clock,
  CheckCircle2, ArrowRight, TrendingDown, Zap, RefreshCcw,
  Home, CalendarRange, HardHat, Truck, CheckCircle, XCircle,
  Info, Hammer, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover as UiPopover, PopoverContent as UiPopoverContent, PopoverTrigger as UiPopoverTrigger } from "@/components/ui/popover";
import ProgramacaoSemanalLotus from "@/components/planejamento/ProgramacaoSemanalLotus";
// Rev. 1817 — Responsável resolvido automaticamente (override → contrato → FC).
import { ResponsavelCell } from "@/components/planejamento/ResponsavelCell";

const n = (v: any) => parseFloat(v) || 0;

// ── Classificação de insumos ──────────────────────────────────────────────────

const PALAVRAS_PESSOA = [
  "servente","pedreiro","mestre","carpinteiro","ferreiro","armador","eletricista",
  "encanador","pintor","operador","ajudante","oficial","encarregado","técnico",
  "topógrafo","instalador","montador","soldador","motorista","almoxarife",
  "auxiliar","trabalhador","operário","vigia","porteiro","gestor","coordenador",
  "engenheiro","arquiteto","fiscal","supervisor","contínuo","faxineiro",
  "serralheiro","rebocador","azulejista","impermeabilizador","jardineiro",
];

const PALAVRAS_EQUIP = [
  "vibrador","compactador","betoneira","bomba","guincho","andaime","escavadeira",
  "retroescavadeira","trator","compressor","furadeira","esmerilhadeira",
  "guindaste","grua","balancim","patrol","motoniveladora","caçamba","caminhão",
  "veículo","carro","equipamento","ferramenta","aparelho","dispositivo",
  "roçadeira","gerador","motosserra","martelete","perfurador","perfuratriz",
  "cortadora","britadeira","mangote","gabarito","forma metálica",
];

function isPessoa(desc: string): boolean {
  const d = desc.toLowerCase();
  return PALAVRAS_PESSOA.some(p => d.includes(p));
}

function isEquipOrcamento(desc: string): boolean {
  const d = desc.toLowerCase();
  return PALAVRAS_EQUIP.some(p => d.includes(p));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

interface Week {
  numero: number;
  ini: Date;
  fim: Date;
}

/**
 * Rev. 1647 — Janela COBRÁVEL alinhada ao cutoff (Status Date PMBOK/EVM).
 * Cada semana vai do DIA SEGUINTE AO CUTOFF ANTERIOR até o PRÓXIMO CUTOFF
 * (ex.: diaCorteSemana=4/qui → semana = sex→qui). Garante que PV (previsto)
 * e EV (realizado) cobrem exatamente a mesma janela — elimina o "atraso
 * fantasma" da semana seg→sex em que a sexta sempre ficava fora do cutoff.
 *
 * Default = 4 (quinta), padrão histórico FC.
 */
function computeWeeks(atividades: any[], diaCorteSemana: number = 4): Week[] {
  const folhas = atividades.filter((a: any) => !a.isGrupo && a.dataInicio && a.dataFim);
  if (!folhas.length) return [];

  const allIni  = folhas.map((a: any) => a.dataInicio).sort();
  const allFim  = folhas.map((a: any) => a.dataFim).sort();
  const minDate = new Date(allIni[0] + "T00:00:00");
  const maxDate = new Date(allFim[allFim.length - 1] + "T00:00:00");

  // Recuar até o PRIMEIRO dia da janela cobrável que contém minDate.
  // ini = (último cutoff < minDate) + 1d   (i.e., dia seguinte ao cutoff anterior).
  const firstIni = new Date(minDate);
  const dow0 = firstIni.getDay();
  // dias para recuar até o cutoff ANTERIOR a minDate. Se minDate cai no
  // próprio cutoff, recua 7 (essa data fecha a semana ANTERIOR; a próxima
  // janela começa no dia seguinte).
  const back = ((dow0 - diaCorteSemana + 7) % 7) || 7;
  firstIni.setDate(firstIni.getDate() - back + 1);

  const weeks: Week[] = [];
  let cur = new Date(firstIni);
  let num = 1;
  while (cur <= maxDate) {
    const ini = new Date(cur);
    const fim = new Date(cur);
    fim.setDate(fim.getDate() + 6); // 7 dias inclusivos: ini..ini+6 = cutoff
    weeks.push({ numero: num, ini, fim });
    cur.setDate(cur.getDate() + 7);
    num++;
  }
  return weeks;
}

function atividadesDaSemana(atividades: any[], week: Week) {
  const ini = dateStr(week.ini);
  const fim = dateStr(week.fim);
  return atividades.filter((a: any) =>
    !a.isGrupo &&
    a.dataInicio && a.dataFim &&
    a.dataFim >= ini && a.dataInicio <= fim
  );
}

function currentWeekIdx(weeks: Week[]): number {
  // Rev. 1532 — Considera Sáb/Dom ainda como "semana corrente" (Mon-Sun lógico),
  // não cai mais para Semana 1 no fim de semana. Pega a última Week cujo ini <= hoje.
  const today = new Date();
  let lastIdx = -1;
  weeks.forEach((w, i) => { if (w.ini <= today) lastIdx = i; });
  return lastIdx >= 0 ? lastIdx : 0;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  projetoId:   number;
  revisaoId:   number;
  orcamentoId: number | null | undefined;
  companyId:   number;
  nomeProjeto: string;
  nomeCliente: string;
  atividades:  any[];
  avancosMap:  Record<number, number>;
  refisLista?: any[];
  /** Portal mode: hides authenticated-only sections (Recursos do orçamento, JULINHO IA, Modo Relatório). */
  portalMode?: boolean;
  /** Rev. 1532 — Curva S (planejada/baseline + realizada) para computar Realizado e Aderência por semana via delta, em paridade com a aba Avanço Semanal. Opcional: quando ausente, banner mostra apenas Previsto. */
  curvaData?: {
    curvaPlanejada?: { semana: string; acumulado: number }[];
    curvaBaseline?: { semana: string; acumulado: number }[];
    curvaRealizada?: { semana: string; acumulado: number }[];
  } | null;
  /** Rev. 1534 — Janela de Recovery Schedule (AACE 23R-02): em quantas semanas
   * diluir o débito acumulado. Quando undefined, usa default 4. */
  recoveryWindow?: number | null;
  /** Quando definido (modo interno), exibe seletor que persiste no banco via
   * tRPC. Quando undefined (Portal do Cliente), só lê o valor congelado. */
  onChangeRecoveryWindow?: (semanas: number) => void;
  /** Rev. 1642 — calendário do MS Project (JSON serializado) para usar dias
   * úteis nas interpolações de Previsto%. NULL → fallback linear (legado). */
  calendarioJson?: string | null;
  /** Rev. 1643 — StatusDate completo (com hora) gravado do MS Project.
   *  Quando definido, o per-row de "Previsto%" usa esse cutoff exato (em
   *  vez de "domingo 23:59 da semana"), garantindo paridade com MSP. */
  cutoffIso?: string | null;
  /** Rev. 1683 — Lista bruta de avanços (planejamento_avancos) usada pela
   *  visão LOTUS para calcular PV/EV/Δ semanais. No ERP interno fica
   *  undefined (a LOTUS busca via tRPC); no Portal do Cliente é injetada
   *  pelo payload `portalExterno.cliente.planejamentoObra.avancosLista`. */
  avancosLista?: Array<{
    atividadeId: number;
    semana: string;
    percentualAcumulado: number | string;
    percentualSemanal: number | string;
  }> | null;
  /** Rev. 1638.4 — Prazo contratual do projeto (YYYY-MM-DD). Quando definido,
   * o seletor de janela de recuperação BLOQUEIA valores que empurrariam a data
   * de convergência (semFim + N×7 dias) além do prazo contratual. */
  dataTerminoContratual?: string | null;
  /** Rev. 1646.5 — Datas oficiais da raiz do MSP (UID=0). Quando combinadas
   * com `calendarioJson`, o "Previsto da semana" no banner usa a MESMA
   * fórmula do top card (du do envelope) em vez de peso financeiro × overlap.
   * Garante que na semana corrente o número bate com o snapshot MSP do top. */
  projetoStart?:  string | null;
  projetoFinish?: string | null;
  /** Rev. 1647 — Dia da semana de cutoff (0=Dom..6=Sáb, default qui=4).
   * Define a janela cobrável das semanas. Vem da query `getDataCorte`. */
  diaCorteSemana?: number;
  /** Rev. 1662 — Dados da gerenciadora/cliente para a Visão LOTUS (toggle no header).
   * Lidos do cadastro da obra; quando ausentes, a tela ainda funciona com placeholders. */
  gerenciadoraNome?: string | null;
  gerenciadoraLogoUrl?: string | null;
  clienteLogoUrl?: string | null;
  engenheiroResponsavel?: string | null;
}

// ── Cores de status ───────────────────────────────────────────────────────────

function statusColor(atrasada: boolean, avanco: number) {
  if (avanco >= 100) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (atrasada)      return "bg-red-100 text-red-700 border-red-200";
  if (avanco > 0)    return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function statusLabel(atrasada: boolean, avanco: number) {
  if (avanco >= 100) return "Concluída";
  if (atrasada)      return "Atrasada";
  if (avanco > 0)    return "Em execução";
  return "Prevista";
}

/**
 * Rev. 1638.1 — Regra única de "Atrasada" para a tela Programação Semanal,
 * agora com tolerância PROPORCIONAL ao peso (recomendação D + C light).
 *
 * Condição-base: cutoff = domingo 23:59 da semana anterior à `semanaIni`
 * (semanas já FECHADAS). Atrasos da semana corrente (ainda em aberto) NÃO
 * contam — refletem trabalho que ainda nem terminou.
 *
 * Atividade vira "Atrasada" SE diff (prev − real) ≥ 2pp E pelo menos UMA:
 *   (a) Vencida pelo cutoff: `fim ≤ ref` e av < 100 (cronograma diz que
 *       devia ter terminado e não terminou — sempre flaga, sem exceção).
 *   (b) Dívida material no projeto: peso% × diff / 100 ≥ 0,05pp (= 5
 *       centésimos do avanço total). Filtra atividades com peso minúsculo
 *       (ex.: 0,17%) cuja "atrasada" gera dívida desprezível (<0,01pp) e
 *       só polui visualmente o gerente.
 *   (c) Lag grotesco: diff ≥ 30pp. Mesmo que peso seja insignificante,
 *       uma atividade tão atrás do linear merece destaque (rede de
 *       segurança contra o filtro de dívida).
 *
 * Reuso por navegador, alertas IA, tabela e modo report (4 pontos).
 */
function calcAtrasada(a: any, av: number, semanaIni: Date | undefined, peso?: number): boolean {
  if (!semanaIni || !a?.dataInicio || !a?.dataFim || av >= 100) return false;
  const d = new Date(semanaIni);
  d.setDate(d.getDate() - 1);
  d.setHours(23, 59, 59, 999);
  const ref = d.getTime();
  const ini = new Date(a.dataInicio + "T12:00:00").getTime();
  const fim = new Date(a.dataFim    + "T12:00:00").getTime();
  let prev = 0;
  if (ref >= fim)      prev = 100;
  else if (ref > ini)  prev = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
  const diff = prev - av;
  if (diff < 2) return false;
  // (a) Vencida pelo cutoff — sempre atrasada.
  if (ref >= fim) return true;
  // (b) Dívida material no projeto.
  const pesoNum = typeof peso === "number" && isFinite(peso) ? peso : n(a?.pesoFinanceiro);
  const dividaPp = pesoNum * diff / 100;
  if (dividaPp >= 0.05) return true;
  // (c) Lag grotesco mesmo com peso minúsculo.
  if (diff >= 30) return true;
  return false;
}

function severidadeCor(sev: string) {
  if (sev === "alta")  return "border-l-red-500 bg-red-50";
  if (sev === "media") return "border-l-amber-500 bg-amber-50";
  return "border-l-blue-500 bg-blue-50";
}

function tipoIcon(tipo: string) {
  if (tipo === "recurso")    return <Package className="h-3.5 w-3.5 text-blue-600" />;
  if (tipo === "atraso")     return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
  if (tipo === "alternativa") return <Zap className="h-3.5 w-3.5 text-amber-600" />;
  return <RefreshCcw className="h-3.5 w-3.5 text-slate-500" />;
}

// ── Rev. 1638.4 — Seletor de janela de recuperação ────────────────────────────
// Pills (1/2/4/6/8/12) + input livre. Bloqueia valores acima de `maxSemanas`,
// que é o limite calculado para não comprometer prazo contratual / caminho
// crítico / início de próxima atividade.
function RecoveryPicker({ janelaAtual, maxSemanas, limiteData, limiteMotivo, onChange }: {
  janelaAtual: number;
  maxSemanas: number;
  limiteData: string | null;
  limiteMotivo: string | null;
  onChange: (semanas: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(janelaAtual));
  const [erro, setErro]   = useState<string | null>(null);
  // Sincroniza o input quando o valor externo muda (ex.: clicou numa pill).
  React.useEffect(() => { setDraft(String(janelaAtual)); setErro(null); }, [janelaAtual]);

  function commit(valorBruto: string) {
    const num = parseInt(valorBruto, 10);
    if (!isFinite(num) || num < 1 || num > 52) {
      setErro(`Digite um número entre 1 e 52 semanas.`);
      setDraft(String(janelaAtual));
      return;
    }
    if (num > maxSemanas) {
      setErro(`Máximo permitido: ${maxSemanas} sem (limite: ${limiteData} — ${limiteMotivo}).`);
      setDraft(String(janelaAtual));
      return;
    }
    setErro(null);
    setDraft(String(num));
    if (num !== janelaAtual) onChange(num);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-600">Recuperar em</span>
        <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded p-0.5" role="radiogroup" aria-label="Janela de recuperação">
          {[1, 2, 4, 6, 8, 12].map(nSem => {
            const ativo    = janelaAtual === nSem;
            const proibido = nSem > maxSemanas;
            return (
              <button
                key={nSem}
                type="button"
                role="radio"
                aria-checked={ativo}
                aria-disabled={proibido}
                onClick={() => proibido
                  ? setErro(`${nSem} sem comprometeria o prazo (limite: ${maxSemanas} sem — ${limiteData}).`)
                  : commit(String(nSem))
                }
                className={`text-[11px] font-semibold px-2 py-0.5 rounded transition-colors tabular-nums ${
                  ativo
                    ? "bg-blue-600 text-white shadow-sm"
                    : proibido
                      ? "text-slate-300 line-through cursor-not-allowed"
                      : "text-blue-700 hover:bg-white"
                }`}
                title={proibido
                  ? `Bloqueado — ${nSem} sem ultrapassa ${limiteMotivo} em ${limiteData}.`
                  : `Diluir o débito acumulado em ${nSem} semana${nSem === 1 ? "" : "s"}. PV (baseline) permanece intacto.`}
              >
                {nSem}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-slate-500">sem</span>
        <span className="text-slate-300">·</span>
        <span className="text-[11px] text-slate-600">ou digite</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.min(52, maxSemanas)}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setErro(null); }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          className={`w-14 text-[11px] font-semibold tabular-nums border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 ${
            erro
              ? "border-red-400 text-red-700 bg-red-50 focus:ring-red-300"
              : "border-blue-300 text-blue-700 bg-white focus:ring-blue-400"
          }`}
          title={`Digite a janela em semanas (1 a ${Math.min(52, maxSemanas)}). Pressione Enter ou clique fora para confirmar.`}
        />
        {limiteData && (
          <span className="text-[10px] text-slate-500" title={`Limite calculado a partir do ${limiteMotivo}.`}>
            (máx. <strong className="text-slate-700">{maxSemanas} sem</strong> — não passa de {limiteData})
          </span>
        )}
      </div>
      {erro && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 max-w-md">
          ⚠️ {erro}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProgramacaoSemanal({
  projetoId, revisaoId, orcamentoId, companyId,
  nomeProjeto, nomeCliente, atividades: atividadesProp, avancosMap,
  refisLista = [], portalMode = false, curvaData = null,
  recoveryWindow = null, onChangeRecoveryWindow,
  dataTerminoContratual = null,
  calendarioJson = null,
  cutoffIso = null,
  projetoStart = null,
  projetoFinish = null,
  diaCorteSemana = 4,
  gerenciadoraNome = null,
  gerenciadoraLogoUrl = null,
  clienteLogoUrl = null,
  engenheiroResponsavel = null,
  avancosLista: avancosListaProp = null,
}: Props) {
  // Rev. 1662 — Toggle entre "Padrão FC" (visão atual completa com EVM/SPI/etc.)
  // e "Padrão LOTUS" (modelo da gerenciadora — header com logos, EAP hierárquico,
  // Gantt diário com 5 cores, exportação Excel/PDF). Persiste por projeto no
  // localStorage para manter a preferência do usuário entre sessões.
  // Rev. 1682 — Quando a obra é gerenciada pela LOTUS (cadastro da obra
  // tem `gerenciadoraNome` contendo "lotus"), o padrão LOTUS é OBRIGATÓRIO
  // — não é uma opção. Escondemos o toggle e ignoramos a preferência salva.
  const isLotusForcado = useMemo(
    () => /lotus/i.test(String(gerenciadoraNome ?? "")),
    [gerenciadoraNome]
  );
  const lotusKey = `progSemView:${projetoId}`;
  const [viewMode, setViewMode] = useState<"fc" | "lotus">(() => {
    if (isLotusForcado) return "lotus";
    if (typeof window === "undefined") return "fc";
    return (localStorage.getItem(lotusKey) as "fc" | "lotus") || "fc";
  });
  useEffect(() => {
    if (isLotusForcado && viewMode !== "lotus") setViewMode("lotus");
  }, [isLotusForcado, viewMode]);
  useEffect(() => {
    // Não persiste preferência quando o modo é forçado (não veio do usuário).
    if (typeof window !== "undefined" && !isLotusForcado) localStorage.setItem(lotusKey, viewMode);
  }, [viewMode, lotusKey, isLotusForcado]);
  // Rev. 1534 — Janela atual de Recovery Schedule (default 4 semanas).
  const janelaRecuperacao = Math.max(1, recoveryWindow ?? 4);
  // Rev. 1642 — Calendário MS Project parseado uma vez por render (paridade 100%).
  const calMSPParsed = useMemo(() => parseCalendarioJson(calendarioJson), [calendarioJson]);
  // Atividades desativadas (a.disabled === true) NÃO devem aparecer em nenhuma
  // parte da Programação Semanal — nem em totais, nem em listagens, nem nos
  // alertas de IA. Filtramos uma única vez aqui para garantir consistência.
  const atividades = useMemo(
    () => (atividadesProp || []).filter((a: any) => !a.disabled),
    [atividadesProp]
  );
  const semanas  = useMemo(() => computeWeeks(atividades, diaCorteSemana ?? 4), [atividades, diaCorteSemana]);
  const refisSemanas = useMemo(() => {
    const s = new Set<string>();
    refisLista.forEach((r: any) => {
      if (r.semana) s.add(String(r.semana).substring(0, 10));
    });
    return s;
  }, [refisLista]);
  const [idx, setIdxRaw] = useState<number>(() => currentWeekIdx(semanas));
  // Rev. 1653 — Preserva a navegação do usuário entre re-renders. Antes, qualquer
  // mudança em `semanas` (cutoff, atividades, query reanimada) jogava o usuário de
  // volta para a semana atual — quebrava o fluxo de quem estava simulando uma
  // semana futura ou inspecionando uma passada. Agora:
  //   1) F5/montagem → currentWeekIdx (default)
  //   2) Clique numa semana → memoriza o ini ISO no ref
  //   3) `semanas` muda → tenta achar essa semana no novo array; se sumiu,
  //      cai pro currentWeekIdx (comportamento antigo).
  const userSelectedIniRef = useRef<string | null>(null);
  const setIdx = (next: number | ((prev: number) => number)) => {
    setIdxRaw((prev) => {
      const resolved = typeof next === "function" ? (next as (p: number) => number)(prev) : next;
      const sem = semanas[resolved];
      userSelectedIniRef.current = sem ? dateStr(sem.ini) : null;
      return resolved;
    });
  };
  const semanasKey = useMemo(() => semanas.length ? `${dateStr(semanas[0].ini)}|${dateStr(semanas[semanas.length-1].fim)}|${semanas.length}` : "", [semanas]);
  const lastKeyRef = useRef<string>("");
  useEffect(() => {
    if (semanasKey === lastKeyRef.current) return;
    lastKeyRef.current = semanasKey;
    if (!semanas.length) return;
    const wanted = userSelectedIniRef.current;
    if (wanted) {
      const found = semanas.findIndex((s: any) => dateStr(s.ini) === wanted);
      if (found >= 0) { setIdxRaw(found); return; }
    }
    setIdxRaw(currentWeekIdx(semanas));
  }, [semanasKey, semanas]);
  const [modoRelatorio, setModoRelatorio] = useState(false);
  const [qtdSemanas, setQtdSemanas] = useState(3);
  const [alertas, setAlertas]  = useState<any>(null);
  const [loadIA, setLoadIA]    = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const semanaAtual = semanas[idx];

  const atividadesSemAtualTodas = useMemo(
    () => semanaAtual ? atividadesDaSemana(atividades, semanaAtual) : [],
    [atividades, semanaAtual]
  );

  // Rev. 1641 — Last Planner: PPC/aderência mede previsibilidade do plano da
  // FC. Atividades externas (terceiros) ficam de fora porque não temos governança
  // sobre a entrega — entram só no SPI/Curva S/EV.
  const atividadesSemAtualBase = useMemo(
    () => atividadesSemAtualTodas.filter((a: any) => !a.isIndireta && !a.isExterna),
    [atividadesSemAtualTodas]
  );

  // Rev. 1817 — Filtro multi-select por Responsável (chave canônica do KPI).
  // Vazio = mostra tudo (default). Persiste APENAS em memória (não localStorage)
  // — quando o usuário muda de obra/revisão, volta ao default "tudo".
  const [filtroResp, setFiltroResp] = useState<Set<string>>(new Set());
  // Reset explícito do filtro ao trocar de revisão (e portanto de obra) —
  // evita que chips selecionados em uma obra contaminem a próxima.
  useEffect(() => {
    setFiltroResp(new Set());
  }, [revisaoId]);
  function chaveResp(a: any): string {
    const r = a?.responsavel;
    if (!r) return "FC";
    if (r.tipo === "contrato_terceiro" && r.fonteRef?.contratoId) return `C${r.fonteRef.contratoId}`;
    if (r.tipo === "externa") return `E:${(r.label || "").toUpperCase()}`;
    if (r.tipo === "manual")  return `M:${(r.label || "").toUpperCase()}`;
    return "FC";
  }
  const atividadesSemAtual = useMemo(
    () => filtroResp.size === 0
      ? atividadesSemAtualBase
      : atividadesSemAtualBase.filter((a: any) => filtroResp.has(chaveResp(a))),
    [atividadesSemAtualBase, filtroResp]
  );

  // Rev. 1817 — KPI compacto de Responsáveis (peso financeiro × atividades).
  const { data: kpiResp = [] } = trpc.planejamento.kpiResponsavelPorProjeto.useQuery(
    { revisaoId },
    { enabled: !!revisaoId, staleTime: 60_000 },
  );

  const grupoMap = useMemo(() => {
    const m = new Map<string, string>();
    atividades.forEach((a: any) => {
      if (a.isGrupo && a.eapCodigo) m.set(a.eapCodigo, a.nome);
    });
    return m;
  }, [atividades]);

  const hierarquiaOf = (eap: string | null | undefined): string[] => {
    if (!eap) return [];
    const parts = eap.split(".");
    const chain: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join(".");
      const nome = grupoMap.get(prefix);
      if (nome) chain.push(nome);
    }
    return chain;
  };

  // Rev. 1641 — folhasTodas é o UNIVERSO do cronograma (peso/criticidade/recovery
  // window/SPI/EV) — externas ENTRAM aqui pra não criar buraco no PV. A exclusão
  // do PPC/aderência é feita só no plano da semana (`atividadesSemAtual`,
  // `proximas3`), que mede previsibilidade do plano da FC.
  const folhasTodas = useMemo(() => atividades.filter((a: any) => !a.isGrupo && !a.isIndireta), [atividades]);

  // Rev. 1646.5 — "Previsto da semana" agora usa A MESMA FÓRMULA do top card
  // (dias úteis sobre envelope MSP) quando o projeto tem calendário gravado +
  // datas raiz do MSP. Garante paridade visual: na semana que contém o cutoff
  // oficial, "Previsto" = "Previsto" do top card (ex. 1,41% no REVTE-CIVIL).
  // Lógica EVM:
  //   - Semanas ANTES do cutoff: delta normal (du(semana) / du(envelope))
  //   - Semana CORRENTE (contém cutoff): du(semIni → cutoff) / du(envelope)
  //   - Semanas FUTURAS: delta normal (du(semana) / du(envelope), informativo)
  // Fallback (sem calMSP/envelope): mantém o cálculo histórico por peso
  // financeiro × overlap (Rev. 1531) para retrocompatibilidade total.
  const previstoSemanaDelta = useMemo(() => {
    if (!semanaAtual) return 0;
    const semIniMs = semanaAtual.ini.getTime();
    // Rev. 1647 — Janela cobrável termina no próprio dia do cutoff (semanaAtual.fim).
    // Exclusivo = fim + 1d. Antes (Mon-Sun lógico) somava +3d para chegar em domingo.
    const semFimMs = semanaAtual.fim.getTime() + 86400000;

    // ── Modo MSP (paridade com top card) ──────────────────────────────
    if (calMSPParsed && projetoStart && projetoFinish) {
      const cutoffStr = (cutoffIso ? cutoffIso.slice(0, 10) : null);
      const projIniStr = projetoStart.slice(0, 10);
      const projFimStr = projetoFinish.slice(0, 10);
      const semIniStr  = dateStr(semanaAtual.ini);
      // Sex (semanaAtual.fim) é o último dia útil padrão da semana FC.
      const semFimStr  = dateStr(semanaAtual.fim);
      // Limita semana ao envelope do projeto.
      const aIni = semIniStr < projIniStr ? projIniStr : semIniStr;
      const aFim = semFimStr > projFimStr ? projFimStr : semFimStr;
      // Se cutoff está dentro da semana, encurta o fim ao cutoff (PV exigível).
      const fimEfetivo = (cutoffStr && cutoffStr >= aIni && cutoffStr <= aFim) ? cutoffStr : aFim;
      if (aIni > fimEfetivo) return 0;
      // Rev. 1651 — Snapshot oficial MSP (Texto11) com paridade EXATA ao top card.
      // Quando esta semana representa EXATAMENTE o PV total do projeto até o cutoff
      // (i.e. aIni == projIniStr, fimEfetivo == statusDateSnapshot, envelope intacto),
      // retorna o snapshot — evita divergência residual de ~0.02pp (1.39% vs 1.41%)
      // que vem da aritmética de minutos do MSP que não replicamos no JS.
      const snap = (calMSPParsed as any).previstoMspSnapshot;
      const snapDate = (calMSPParsed as any).statusDateSnapshot;
      const envIni = (calMSPParsed as any).envelopeStartSnapshot;
      const envFim = (calMSPParsed as any).envelopeFinishSnapshot;
      const envOk = (!envIni || !envFim) || (envIni === projIniStr && envFim === projFimStr);
      if (snap != null && snapDate && envOk
          && aIni === projIniStr
          && fimEfetivo === snapDate) {
        return +Number(snap).toFixed(2);
      }
      const totalEnv = diasUteisEntreCal(projIniStr, projFimStr, calMSPParsed);
      if (totalEnv <= 0) return 0;
      const duSemana = diasUteisEntreCal(aIni, fimEfetivo, calMSPParsed);
      return (duSemana / totalEnv) * 100;
    }

    // ── Fallback histórico (peso financeiro × overlap) ────────────────
    let prev = 0;
    folhasTodas.forEach((a: any) => {
      if (!a.dataInicio || !a.dataFim) return;
      const aIni = new Date(a.dataInicio + "T00:00:00").getTime();
      const aFim = new Date(a.dataFim + "T00:00:00").getTime() + 86400000;
      const overlapMs = Math.max(0, Math.min(aFim, semFimMs) - Math.max(aIni, semIniMs));
      const overlapDays = overlapMs / 86400000;
      const dur = (a.duracaoDias && a.duracaoDias > 0) ? a.duracaoDias : Math.max(1, (aFim - aIni) / 86400000);
      prev += n(a.pesoFinanceiro) * (overlapDays / dur);
    });
    return prev;
  }, [folhasTodas, semanaAtual, calMSPParsed, projetoStart, projetoFinish, cutoffIso]);

  // Rev. 1532 — Realizado + Aderência da semana via delta da Curva S Realizada,
  // em paridade com a aba Avanço Semanal (mesmas fórmulas, mesmo número).
  // Quando curvaData não está disponível, retorna null e o banner esconde estes campos.
  const evmSemana = useMemo(() => {
    if (!semanaAtual || !curvaData) return null;
    // Rev. 1668 — usa o FIM da semana cutoff (Quinta) em vez do início (Sexta).
    // As curvas são indexadas por Segunda; quando cutoff=Sex→Qui, a Segunda
    // (ex.: Mon 04/05) fica DEPOIS do início da semana (Sex 01/05) e NÃO era
    // capturada pelo `<= semIni` → Realizado virava 0% indevidamente.
    // Usando `<= semFim` (Qui 07/05), a Monday 04/05 entra no balde correto.
    const semFimStr = dateStr(semanaAtual.fim);
    const semAntFimDate = new Date(semanaAtual.fim.getTime() - 7 * 86400000);
    const semAntFimStr = dateStr(semAntFimDate);
    const acumAt = (arr: { semana: string; acumulado: number }[] | undefined, semFim: string): number => {
      if (!arr || !arr.length) return 0;
      const ord = arr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
      let last = 0;
      for (const p of ord) { if (p.semana <= semFim) last = p.acumulado; else break; }
      return last;
    };
    const planejadaArr = (curvaData.curvaPlanejada?.length ? curvaData.curvaPlanejada : curvaData.curvaBaseline) ?? [];
    const realizadaArr = curvaData.curvaRealizada ?? [];
    const planAtual = acumAt(planejadaArr, semFimStr);
    const planAntes = acumAt(planejadaArr, semAntFimStr);
    const realAtual = acumAt(realizadaArr, semFimStr);
    const realAntes = acumAt(realizadaArr, semAntFimStr);
    const previstoCurvaS = Math.max(0, planAtual - planAntes);
    const realizado = Math.max(0, realAtual - realAntes);
    const aderencia = previstoCurvaS > 0 ? (realizado / previstoCurvaS) * 100 : null;
    // Rev. 1533 — Débito acumulado (Schedule Variance negativo) até o fim da
    // SEMANA ANTERIOR, baseado em PMBOK 7ª/AACE 23R-02 (Recovery Schedule).
    // PV é IMUTÁVEL (baseline). Débito é métrica gerencial, não substitui PV.
    // Meta de Recuperação = Previsto da semana + Débito acumulado anterior →
    // o quanto entregar HOJE para zerar atraso. Se 0 = obra em dia.
    const debitoAcumulado = Math.max(0, planAntes - realAntes);
    const metaRecuperacao = previstoCurvaS + debitoAcumulado; // meta agressiva (1 sem)
    // Rev. 1534 — Meta DILUÍDA em N semanas (Recovery Schedule, AACE 23R-02):
    // o engenheiro escolhe a janela; a cobrança vira factível em vez de cair
    // tudo numa única semana.
    const metaDiluida = previstoCurvaS + (debitoAcumulado / janelaRecuperacao);
    // Data prevista de convergência: fim da semana atual + N semanas.
    const semanaFimDate = new Date(semanaAtual.fim.getTime() + janelaRecuperacao * 7 * 86400000);
    const dataConvergencia = semanaFimDate.toLocaleDateString("pt-BR");
    // Janela mínima viável (camada 2): com base no MAIOR delta semanal já
    // realizado vs MÉDIA dos baselines semanais (últimos 6 períodos). Se a
    // capacidade comprovada não supera o baseline (folga≤0), retorna null.
    let janelaMinima: number | null = null;
    if (debitoAcumulado > 0.01 && realizadaArr.length >= 2 && planejadaArr.length >= 2) {
      const deltasReal: number[] = [];
      const ordReal = realizadaArr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
      for (let i = 1; i < ordReal.length; i++) {
        deltasReal.push(Math.max(0, ordReal[i].acumulado - ordReal[i - 1].acumulado));
      }
      const deltasPrev: number[] = [];
      const ordPrev = planejadaArr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
      for (let i = 1; i < ordPrev.length; i++) {
        deltasPrev.push(Math.max(0, ordPrev[i].acumulado - ordPrev[i - 1].acumulado));
      }
      const ult6Real = deltasReal.slice(-6);
      const ult6Prev = deltasPrev.slice(-6);
      const ritmoMaxReal = ult6Real.length ? Math.max(...ult6Real) : 0;
      const baselineMedio = ult6Prev.length ? ult6Prev.reduce((s, x) => s + x, 0) / ult6Prev.length : 0;
      const folga = ritmoMaxReal - baselineMedio;
      if (folga > 0.05) {
        janelaMinima = Math.max(1, Math.ceil(debitoAcumulado / folga));
      }
    }
    return {
      previstoCurvaS, realizado, aderencia,
      debitoAcumulado, metaRecuperacao, metaDiluida,
      dataConvergencia, janelaMinima,
    };
  }, [semanaAtual, curvaData, janelaRecuperacao]);

  // Rev. 1544 — "MAIOR PESO da semana" agora usa CONTRIBUIÇÃO em pp na semana
  // (peso% × ΔPrev_semana / 100), não peso TOTAL no projeto. Antes, atividades
  // multi-semana com peso projeto alto (ex. "Locação de gradil" 8,83% durando
  // 13 meses) eram destacadas mesmo contribuindo com apenas ~0,05pp na semana,
  // enquanto "Tapume autoportante" (peso projeto 0,45% × Prev 36% = 0,16pp,
  // 3× mais relevante) ficava sem destaque. Ranqueamos por contribuição real.
  //
  // Last Planner System (Lean Construction): Top 3 a 5 'constraints' por
  // semana é o sweet spot gerencial. Adotamos Top 3.
  //
  // CPM/Goldratt: atividades com float ≤ 0 (sem folga até o fim do projeto)
  // recebem badge CRÍTICA separado. Float ≤ 14 dias = QUASE CRÍTICA.
  // Float é calculado igual à aba 'Caminho Crítico' (projectEnd − dataFim).
  const pesoSemana = useMemo(() => {
    const indiretas = atividadesSemAtualTodas.filter((a: any) => a.isIndireta);
    const pesoTotal = folhasTodas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 1;
    const somaSemana = atividadesSemAtual.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const pctSemana = (somaSemana / pesoTotal) * 100;

    // projectEnd para cálculo de float (mesma lógica da aba Caminho Crítico)
    const projectEndStr = folhasTodas
      .map((a: any) => a.dataFim)
      .filter(Boolean)
      .sort()
      .pop();
    const projectEndMs = projectEndStr ? new Date(projectEndStr + "T12:00:00").getTime() : 0;

    // Rev. 1647 — Janela cobrável alinhada ao cutoff: ini..fim (cutoff inclusive).
    const semIniMs = semanaAtual ? semanaAtual.ini.getTime() : 0;
    const semFimEod = semanaAtual ? new Date(semanaAtual.fim) : null;
    if (semFimEod) semFimEod.setHours(23, 59, 59, 999);
    const semFimMs = semFimEod ? semFimEod.getTime() : 0;

    // Calcula contribuição em pp e float por atividade
    const enriched = atividadesSemAtual.map((a: any) => {
      let contribSemana = 0;
      if (a.dataInicio && a.dataFim && semIniMs && semFimMs) {
        const ini = new Date(a.dataInicio + "T12:00:00").getTime();
        const fim = new Date(a.dataFim    + "T12:00:00").getTime();
        const interp = (ref: number) => {
          if (ref >= fim) return 100;
          if (ref <= ini) return 0;
          return ((ref - ini) / (fim - ini)) * 100;
        };
        const dPrev = interp(semFimMs) - interp(semIniMs);
        contribSemana = n(a.pesoFinanceiro) * dPrev / 100; // em pp
      }
      const fimMs = a.dataFim ? new Date(a.dataFim + "T12:00:00").getTime() : 0;
      const float = (projectEndMs && fimMs)
        ? Math.round((projectEndMs - fimMs) / 86400000)
        : 999;
      return { id: a.id, contribSemana, float };
    });

    // Top 3 por contribuição (filtra contribuições > 0 — sem destaque pra zero)
    const top3 = [...enriched]
      .filter(x => x.contribSemana > 0.001)
      .sort((a, b) => b.contribSemana - a.contribSemana)
      .slice(0, 3);
    const maiorPesoIds = new Set<number>(top3.map(x => x.id));
    const contribById  = new Map<number, number>(enriched.map(x => [x.id, x.contribSemana]));
    const maiorContribVal = top3[0]?.contribSemana ?? 0;

    // Críticas / quase críticas (zero ou pouca folga até o fim do projeto).
    // Rev. 1786 — Atividades INDIRETAS (LoE) e EXTERNAS NÃO entram no caminho
    // crítico (PMBOK §6.4.2 LoE / DCMA #6 — overhead não consome float).
    const indById = new Map<number, any>(atividadesSemAtual.map((a: any) => [a.id, a]));
    const elegivel = (id: number) => {
      const a = indById.get(id);
      return a && !a.isIndireta && !a.isExterna;
    };
    const criticasIds      = new Set<number>(enriched.filter(x => x.float <= 0 && elegivel(x.id)).map(x => x.id));
    const quaseCriticasIds = new Set<number>(enriched.filter(x => x.float > 0 && x.float <= 14 && elegivel(x.id)).map(x => x.id));

    return {
      somaSemana, pctSemana,
      maiorPesoIds, maiorContribVal, contribById,
      criticasIds, quaseCriticasIds,
      diretasCount: atividadesSemAtual.length,
      indiretasCount: indiretas.length,
    };
  }, [atividadesSemAtual, atividadesSemAtualTodas, folhasTodas, semanaAtual]);

  // ── Rev. 1638.4 — Limite máximo da janela de recuperação ─────────────────
  // Calcula maxN tal que a data de convergência (semFim + N×7 dias) NÃO
  // ultrapasse:
  //   • dataTerminoContratual (prazo contratual do projeto)
  //   • menor dataFim de atividade do CAMINHO CRÍTICO ainda não concluída
  //   • menor dataInicio de atividade futura ainda não iniciada (qualquer
  //     atraso na recuperação adia o início dela)
  // Retorna { maxSemanas, limiteData, limiteMotivo } ou null se não há limite.
  const limiteRecuperacao = useMemo(() => {
    if (!semanaAtual) return null;
    // Rev. 1647 — Fim da janela cobrável = próprio dia do cutoff, end-of-day.
    const semFim = new Date(semanaAtual.fim);
    semFim.setHours(23, 59, 59, 999);
    const semFimMs = semFim.getTime();

    const candidatos: { dataMs: number; motivo: string; eap?: string; nome?: string }[] = [];

    // (1) Prazo contratual do projeto.
    if (dataTerminoContratual) {
      const ms = new Date(dataTerminoContratual + "T23:59:59").getTime();
      if (ms > semFimMs) candidatos.push({ dataMs: ms, motivo: "prazo contratual do projeto" });
    }

    // (2) Caminho crítico — calcula float para TODAS as folhas com data.
    const projectEndStr = folhasTodas.map((a: any) => a.dataFim).filter(Boolean).sort().pop();
    const projectEndMs = projectEndStr ? new Date(projectEndStr + "T12:00:00").getTime() : 0;
    if (projectEndMs) {
      let menorCritica: { dataMs: number; eap: string; nome: string } | null = null;
      let menorFutura: { dataMs: number; eap: string; nome: string } | null = null;
      for (const a of folhasTodas) {
        const av = avancosMap[a.id] ?? 0;
        if (av >= 100) continue;
        // (2a) crítica não concluída
        if (a.dataFim) {
          const fimMs = new Date(a.dataFim + "T12:00:00").getTime();
          const float = Math.round((projectEndMs - fimMs) / 86400000);
          if (float <= 0 && fimMs > semFimMs && (!menorCritica || fimMs < menorCritica.dataMs)) {
            menorCritica = { dataMs: fimMs, eap: a.eapCodigo ?? "", nome: a.nome ?? "" };
          }
        }
        // (2b) futura ainda não iniciada (av==0 e dataInicio > semFim)
        if (av === 0 && a.dataInicio) {
          const iniMs = new Date(a.dataInicio + "T12:00:00").getTime();
          if (iniMs > semFimMs && (!menorFutura || iniMs < menorFutura.dataMs)) {
            menorFutura = { dataMs: iniMs, eap: a.eapCodigo ?? "", nome: a.nome ?? "" };
          }
        }
      }
      if (menorCritica) candidatos.push({
        dataMs: menorCritica.dataMs,
        motivo: `término da atividade crítica ${menorCritica.eap} — ${menorCritica.nome}`,
        eap: menorCritica.eap, nome: menorCritica.nome,
      });
      if (menorFutura) candidatos.push({
        dataMs: menorFutura.dataMs,
        motivo: `início da próxima atividade ${menorFutura.eap} — ${menorFutura.nome}`,
        eap: menorFutura.eap, nome: menorFutura.nome,
      });
    }

    if (candidatos.length === 0) return null;
    // Pega o MENOR limite (mais restritivo)
    candidatos.sort((a, b) => a.dataMs - b.dataMs);
    const limite = candidatos[0];
    const diasDisponiveis = Math.floor((limite.dataMs - semFimMs) / 86400000);
    const maxSemanas = Math.max(1, Math.floor(diasDisponiveis / 7));
    const limiteFmt = new Date(limite.dataMs).toLocaleDateString("pt-BR");
    return { maxSemanas, limiteData: limiteFmt, limiteMotivo: limite.motivo };
  }, [semanaAtual, folhasTodas, avancosMap, dataTerminoContratual]);

  // EAP codes for the current week (for resource lookup)
  const eapsDaSemana = useMemo(
    () => [...new Set(atividadesSemAtual.map((a: any) => a.eapCodigo).filter(Boolean))] as string[],
    [atividadesSemAtual]
  );

  // ── Rev. 1638 — Frentes FORA do plano (Last Planner System) ──────────────
  // ANTECIPADAS: cronograma futuro (dataInicio > semFim), mas o engenheiro de
  // campo já abriu a frente e há avanço > 0. Lean Construction trata como
  // "make-ready / make-do" — não conta no PV/PPC da semana, mas é trabalho
  // genuíno e soma no EV global. Exibir SEPARADAMENTE preserva a aderência
  // (PPC) e ainda dá visibilidade do esforço extra.
  // ARRASTADAS: cronograma já expirado (dataFim < semIni), mas atividade
  // ainda não está 100%. Recuperação de dívida — também não está no plano da
  // semana corrente.
  // OBS: como esse componente só recebe o snapshot ATUAL de avancosMap (sem
  // delta por semana), a flag indica "frente fora do plano em execução
  // acumulada", não "executado nesta semana". O engenheiro entende — é a
  // info que ele precisa pra agir.
  const frentesForaPlano = useMemo(() => {
    if (!semanaAtual) return { antecipadas: [], arrastadas: [], totalAntPp: 0, totalArrPp: 0 };
    const semIniStr = dateStr(semanaAtual.ini);
    // Rev. 1647 — fim da janela cobrável = próprio dia do cutoff.
    const semFimStr = dateStr(semanaAtual.fim);
    const dentro = new Set<number>(atividadesSemAtual.map((a: any) => a.id));
    const antecipadas: any[] = [];
    const arrastadas: any[]  = [];
    folhasTodas.forEach((a: any) => {
      if (dentro.has(a.id)) return;
      if (a.disabled) return;
      if (!a.dataInicio || !a.dataFim) return;
      const av = avancosMap[a.id] ?? 0;
      if (av <= 0) return;                       // sem execução, não interessa
      if (a.dataInicio > semFimStr) {            // programada para FUTURO
        antecipadas.push(a);
      } else if (a.dataFim < semIniStr && av < 100) { // PASSADA não concluída
        arrastadas.push(a);
      }
    });
    // Contribuição informativa (pp do projeto): peso × av/100. Mostra quanto
    // de EV global vem dessas frentes hoje. NÃO entra em PV nem em SPI da semana.
    const totalAntPp = antecipadas.reduce((s, a) => s + (n(a.pesoFinanceiro) * (avancosMap[a.id] ?? 0) / 100), 0);
    const totalArrPp = arrastadas.reduce((s, a)  => s + (n(a.pesoFinanceiro) * (avancosMap[a.id] ?? 0) / 100), 0);
    // Ordenar pelo "peso × avanço" desc (mais relevante no topo).
    const ord = (arr: any[]) => arr.sort((x, y) =>
      (n(y.pesoFinanceiro) * (avancosMap[y.id] ?? 0)) - (n(x.pesoFinanceiro) * (avancosMap[x.id] ?? 0))
    );
    return { antecipadas: ord(antecipadas), arrastadas: ord(arrastadas), totalAntPp, totalArrPp };
  }, [folhasTodas, atividadesSemAtual, avancosMap, semanaAtual]);

  // ── Próximas N semanas para o relatório ──────────────────────────────────
  const proximas3 = useMemo(() => {
    const result = [];
    for (let i = idx; i < Math.min(idx + qtdSemanas, semanas.length); i++) {
      result.push({ semana: semanas[i], atividades: atividadesDaSemana(atividades, semanas[i]).filter((a: any) => !a.isIndireta && !a.isExterna) });
    }
    return result;
  }, [idx, semanas, atividades, qtdSemanas]);

  // ── Recursos do orçamento ─────────────────────────────────────────────────
  const todosEaps = useMemo(() => {
    const eaps = new Set<string>();
    proximas3.forEach(({ atividades: at }) => at.forEach((a: any) => a.eapCodigo && eaps.add(a.eapCodigo)));
    return [...eaps];
  }, [proximas3]);

  const atividadeNomes = useMemo(
    () => [...new Set(
      proximas3.flatMap(({ atividades: at }) => at.map((a: any) => a.nome as string).filter(Boolean))
    )],
    [proximas3]
  );

  const recursosQuery = trpc.planejamento.buscarRecursosSemana.useQuery(
    { companyId, orcamentoId: orcamentoId ?? 0, eapCodigos: todosEaps, atividadeNomes },
    { enabled: !portalMode && !!orcamentoId && (todosEaps.length > 0 || atividadeNomes.length > 0) }
  );

  const recursos = recursosQuery.data;

  // ── Equipamentos do almoxarifado / patrimônio ─────────────────────────────
  const equipQuery = trpc.planejamento.buscarEquipamentosDisponiveis.useQuery(
    { companyId },
    { enabled: !portalMode && companyId > 0 }
  );

  // ── AI alerts mutation ────────────────────────────────────────────────────
  const [iaErro, setIaErro] = useState<string | null>(null);
  const alertasMut = trpc.iaCronograma.alertasSemana.useMutation({
    onSuccess: (data) => { setAlertas(data); setLoadIA(false); setIaErro(null); },
    onError:   (err)  => { setLoadIA(false); setIaErro(err.message ?? "Erro ao consultar a IA."); },
  });

  function gerarAlertas() {
    if (proximas3.length === 0) return;
    setLoadIA(true);
    setAlertas(null);
    alertasMut.mutate({
      projetoId,
      nomeProjeto,
      semanas: proximas3.map(({ semana, atividades: at }) => ({
        numero: semana.numero,
        ini:    dateStr(semana.ini),
        fim:    dateStr(semana.fim),
        atividades: at.map((a: any) => {
          const av = avancosMap[a.id] ?? 0;
          // Rev. 1637.3 — mesma regra do badge: só atrasada com débito de semanas fechadas.
          const atrasada = calcAtrasada(a, av, semana.ini, n(a.pesoFinanceiro));
          return {
            eapCodigo:        a.eapCodigo,
            nome:             a.nome,
            dataInicio:       a.dataInicio,
            dataFim:          a.dataFim,
            recursoPrincipal: a.recursoPrincipal,
            avancoPrevisto:   parseFloat(a.pesoFinanceiro ?? "0"),
            avancoReal:       av,
            atrasada,
          };
        }),
        insumos: (recursos?.insumos ?? [])
          .filter((ins: any) => {
            const itensEap = (recursos?.itens ?? []).filter((it: any) =>
              at.some((a: any) => a.eapCodigo === it.eapCodigo) &&
              it.servicoCodigo === ins.composicaoCodigo
            );
            return itensEap.length > 0;
          })
          .map((ins: any) => ({
            descricao:  ins.insumoDescricao ?? "",
            unidade:    ins.unidade ?? "",
            quantidade: ins.quantidade ?? "",
            tipo:       parseFloat(ins.alocacaoMdo ?? "0") > 0 ? "MO" : "MAT",
          })),
      })),
    });
  }

  // ── Impressão ─────────────────────────────────────────────────────────────
  function imprimir() {
    window.print();
  }

  if (!semanas.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <CalendarRange className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhuma atividade com datas no cronograma.</p>
        <p className="text-xs mt-1">Cadastre atividades com início e fim para gerar a programação semanal.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Rev. 1662 — Visão LOTUS (modelo da gerenciadora) — substitui o conteúdo da
  // tela mantendo o toggle visível no topo. Não afeta cálculos do EVM/SPI.
  if (viewMode === "lotus") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarRange className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">Programação Semanal</span>
          <span className="text-xs text-slate-400">{semanas.length} semanas no cronograma</span>
          {/* Rev. 1682 — Toggle escondido quando a gerenciadora é a LOTUS:
              o padrão dela passa a ser obrigatório (regra de cliente). */}
          {!isLotusForcado && (
            <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 ml-2 print:hidden">
              <button
                onClick={() => setViewMode("fc")}
                className="px-3 py-1 text-xs font-semibold rounded-md text-slate-600 hover:bg-white"
              >Padrão FC</button>
              <button
                className="px-3 py-1 text-xs font-semibold rounded-md bg-white text-blue-700 shadow-sm"
              >Padrão LOTUS</button>
            </div>
          )}
          {isLotusForcado && (
            <span
              className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-50 text-blue-700 border border-blue-200"
              title={`Obra gerenciada por ${gerenciadoraNome} — exibição padronizada conforme modelo da gerenciadora.`}
            >Padrão LOTUS</span>
          )}
        </div>
        {/* Rev. 5151 — Estimativa de MO também no Padrão LOTUS (antes só existia no
            Padrão FC; obras com LOTUS forçado nunca viam o painel). print:hidden
            para não poluir o relatório padronizado da gerenciadora. */}
        {semanaAtual && (
          <div className="print:hidden">
            <EstimativaMaoObraPanel
              projetoId={projetoId}
              revisaoId={revisaoId}
              semanaIni={dateStr(semanaAtual.ini)}
              semanaFim={dateStr(semanaAtual.fim)}
              semanaNumero={semanaAtual.numero}
            />
          </div>
        )}
        <ProgramacaoSemanalLotus
          avancosOverride={avancosListaProp}
          projetoId={projetoId}
          revisaoId={revisaoId}
          companyId={companyId}
          nomeProjeto={nomeProjeto}
          nomeCliente={nomeCliente}
          atividades={atividades}
          semanas={semanas}
          semanaIdx={idx}
          onSemanaChange={setIdx}
          gerenciadoraNome={gerenciadoraNome}
          gerenciadoraLogoUrl={gerenciadoraLogoUrl}
          clienteLogoUrl={clienteLogoUrl}
          engenheiroResponsavel={engenheiroResponsavel}
          calendarioJson={calendarioJson}
          projetoStart={projetoStart}
          projetoFinish={projetoFinish}
          cutoffIso={cutoffIso}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho e navegação ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">Programação Semanal</span>
          <span className="text-xs text-slate-400">{semanas.length} semanas no cronograma</span>
          {/* Rev. 1662 — Toggle Padrão FC ↔ LOTUS (escondido quando a
              gerenciadora é LOTUS — Rev. 1682). */}
          {!isLotusForcado && (
            <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 ml-2">
              <button
                className="px-3 py-1 text-xs font-semibold rounded-md bg-white text-blue-700 shadow-sm"
              >Padrão FC</button>
              <button
                onClick={() => setViewMode("lotus")}
                className="px-3 py-1 text-xs font-semibold rounded-md text-slate-600 hover:bg-white"
              >Padrão LOTUS</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de quantidade de semanas (visível em modo relatório) */}
          {modoRelatorio && (
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2 py-1">
              <span className="text-[10px] text-slate-500 font-medium">Semanas:</span>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setQtdSemanas(n)}
                  className={`h-5 w-5 text-[10px] font-bold rounded transition-colors ${
                    qtdSemanas === n
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-600 hover:bg-blue-50 border border-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { setModoRelatorio(!modoRelatorio); }}
          >
            {modoRelatorio ? <Home className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
            {modoRelatorio ? "Visão Semanal" : `Relatório ${qtdSemanas} Semana${qtdSemanas !== 1 ? "s" : ""}`}
          </Button>
          {modoRelatorio && (
            <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={imprimir}>
              <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
            </Button>
          )}
        </div>
      </div>

      {/* ── Modo: Visão Semanal ─────────────────────────────────────────────── */}
      {!modoRelatorio && (
        <>
          {/* Navegador de semana */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>

            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-2 mb-0.5">
                <p className="text-xs text-slate-500 font-medium">Semana {semanaAtual?.numero}</p>
                {semanaAtual && dateStr(semanaAtual.ini) <= today && dateStr(semanaAtual.fim) >= today && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Semana Atual
                  </span>
                )}
                {semanaAtual && refisSemanas.has(dateStr(semanaAtual.ini)) && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">
                    <CheckCircle2 className="h-3 w-3" />
                    REFIS Emitido
                  </span>
                )}
              </div>
              <p className="text-base font-bold text-slate-800">
                {semanaAtual ? `${fmtBRDate(semanaAtual.ini)} — ${fmtBRDate(semanaAtual.fim)}` : "—"}
              </p>
              <p className="text-[11px] text-slate-400">
                Segunda a Sexta · {atividadesSemAtual.length} atividade{atividadesSemAtual.length !== 1 ? "s" : ""}
              </p>
            </div>

            <button
              onClick={() => setIdx(Math.min(semanas.length - 1, idx + 1))}
              disabled={idx === semanas.length - 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          {/* Linha de navegação rápida */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {semanas.map((s, i) => {
              const atv = atividadesDaSemana(atividades, s);
              // Rev. 1637.3 — chip vermelho do navegador segue a mesma regra:
              // só pinta vermelho se houver débito acumulado de semanas fechadas.
              const temAtrasada = atv.some((a: any) => calcAtrasada(a, avancosMap[a.id] ?? 0, s.ini, n(a.pesoFinanceiro)));
              const isCurrent   = dateStr(s.ini) <= today && dateStr(s.fim) >= today;
              const temRefis    = refisSemanas.has(dateStr(s.ini));
              return (
                <button
                  key={s.numero}
                  onClick={() => setIdx(i)}
                  title={`Sem. ${s.numero} — ${fmtBRDate(s.ini)} a ${fmtBRDate(s.fim)}${temRefis ? " ✓ REFIS emitido" : ""}`}
                  className={`h-6 min-w-[36px] px-1.5 text-[10px] font-bold rounded border shrink-0 transition-colors flex items-center gap-0.5
                    ${i === idx
                      ? "bg-blue-600 text-white border-blue-600"
                      : isCurrent
                        ? "bg-red-500 text-white border-red-600"
                        : temRefis
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                          : temAtrasada
                            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {temRefis && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {s.numero}
                </button>
              );
            })}
          </div>

          {/* Rev. 5146 — Estimativa consultiva de mão de obra da semana */}
          {semanaAtual && (
            <EstimativaMaoObraPanel
              projetoId={projetoId}
              revisaoId={revisaoId}
              semanaIni={dateStr(semanaAtual.ini)}
              semanaFim={dateStr(semanaAtual.fim)}
              semanaNumero={semanaAtual.numero}
            />
          )}

          {/* Rev. 1532 — Banner unificado: Previsto + Realizado + Aderência (SPI sem.)
              em paridade total com a aba Avanço Semanal. Mesmo número, mesmo nome. */}
          {atividadesSemAtual.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-800">
                  Semana {semanaAtual?.numero}
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-600 font-medium">Previsto:</span>
                <span className="text-sm font-bold text-orange-600 tabular-nums">
                  {/* Rev. 1650 — Quando o projeto tem calendário MSP + envelope (datas raiz),
                      usa `previstoSemanaDelta` (mesma fórmula EVM do top card e da aba
                      Avanço Semanal — du(semana∩envelope até cutoff) / du(envelope)).
                      Antes, o card preferia `evmSemana.previstoCurvaS` (curva-S keyed por
                      segunda-feira), que ficava em 0% nas semanas cobráveis pós-Rev. 1647
                      (sex→qui), pois `acumAt` lookup desalinhava com as chaves Mon. */}
                  {((calMSPParsed && projetoStart && projetoFinish) ? previstoSemanaDelta : (evmSemana?.previstoCurvaS ?? previstoSemanaDelta)).toFixed(2)}%
                </span>
              </div>
              {evmSemana && (() => {
                // Rev. 1669 — Aderência usa o MESMO "Previsto" exibido no card
                // (envelope MSP quando disponível), em vez de `previstoCurvaS`
                // (delta Mon-Mon da Curva S). Sem isso, Realizado=Previsto=1,41%
                // mostrava Aderência=63% porque o denominador era a "fatia
                // Mon-Mon" da Curva S (~2,24%), divergindo do card.
                const previstoEfetivo = (calMSPParsed && projetoStart && projetoFinish)
                  ? previstoSemanaDelta
                  : (evmSemana.previstoCurvaS || previstoSemanaDelta);
                const aderenciaEfetiva = previstoEfetivo > 0
                  ? (evmSemana.realizado / previstoEfetivo) * 100
                  : null;
                return (
                  <>
                    <span className="text-slate-300">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-600 font-medium">Realizado:</span>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                        {evmSemana.realizado.toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-slate-300">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-600 font-medium">Aderência (SPI sem.):</span>
                      <span className={`text-sm font-bold tabular-nums ${aderenciaEfetiva == null ? "text-slate-400" : aderenciaEfetiva >= 95 ? "text-emerald-600" : "text-red-600"}`}>
                        {aderenciaEfetiva == null ? "—" : `${aderenciaEfetiva.toFixed(0)}%`}
                      </span>
                    </div>
                  </>
                );
              })()}
              {/* Rev. 1638 — Sub-linha informativa de frentes FORA do plano.
                  PPC/SPI seguem só com programadas (regra Last Planner). */}
              {(frentesForaPlano.antecipadas.length > 0 || frentesForaPlano.arrastadas.length > 0) && (
                <>
                  <span className="text-slate-300">|</span>
                  {frentesForaPlano.antecipadas.length > 0 && (
                    <div
                      className="flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5"
                      title={`${frentesForaPlano.antecipadas.length} atividade(s) programada(s) para semanas FUTURAS já em execução. Soma ${frentesForaPlano.totalAntPp.toFixed(2)}pp de EV adicional ao acumulado do projeto. NÃO entra no PV/SPI desta semana — é bônus informativo.`}
                    >
                      🚀 <strong>+{frentesForaPlano.totalAntPp.toFixed(2)}pp antecipado</strong>
                      <span className="text-blue-500">({frentesForaPlano.antecipadas.length} ativ.)</span>
                    </div>
                  )}
                  {frentesForaPlano.arrastadas.length > 0 && (
                    <div
                      className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                      title={`${frentesForaPlano.arrastadas.length} atividade(s) com cronograma já expirado, ainda em execução (recuperação de dívida). EV acumulado dessas frentes: ${frentesForaPlano.totalArrPp.toFixed(2)}pp.`}
                    >
                      ⏪ <strong>+{frentesForaPlano.totalArrPp.toFixed(2)}pp recuperando</strong>
                      <span className="text-amber-500">({frentesForaPlano.arrastadas.length} ativ.)</span>
                    </div>
                  )}
                </>
              )}
              <span className="text-slate-300">|</span>
              <div className="text-[11px] text-slate-600">
                <span className="font-medium">{pesoSemana.diretasCount}</span> atividade{pesoSemana.diretasCount !== 1 ? "s" : ""}
              </div>
              {pesoSemana.indiretasCount > 0 && (
                <div className="text-[11px] text-gray-500 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                  <span className="font-medium">{pesoSemana.indiretasCount}</span> indiretas
                </div>
              )}
            </div>
            {/* Rev. 1534 — Linha 2: Débito + Meta DILUÍDA + Seletor de janela
                (Recovery Schedule, AACE 23R-02). PV permanece imutável. */}
            {evmSemana && evmSemana.debitoAcumulado > 0.01 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1.5 mt-1 border-t border-blue-200/70">
                <div className="flex items-center gap-1.5" title="Quanto a obra ficou devendo das semanas anteriores (PV acumulado − EV acumulado até a semana passada). Não é descontado do baseline; é meta gerencial.">
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-[11px] text-slate-700 font-medium">Atraso a recuperar:</span>
                  <span className="text-sm font-bold text-red-600 tabular-nums">
                    {evmSemana.debitoAcumulado.toFixed(2)}%
                  </span>
                </div>
                <span className="text-slate-300">|</span>
                <div className="flex items-center gap-1.5" title={`Meta semanal DILUÍDA em ${janelaRecuperacao} semanas = Previsto baseline + (Débito ÷ ${janelaRecuperacao}). Cobrança factível, baseline imutável.`}>
                  <Zap className="h-3.5 w-3.5 text-blue-700" />
                  <span className="text-[11px] text-slate-700 font-medium">Meta diluída ({janelaRecuperacao}{janelaRecuperacao === 1 ? " sem" : " sem"}):</span>
                  <span className="text-sm font-bold text-blue-700 tabular-nums">
                    {evmSemana.metaDiluida.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({evmSemana.previstoCurvaS.toFixed(2)}% baseline + {(evmSemana.debitoAcumulado / janelaRecuperacao).toFixed(2)}%/sem)
                  </span>
                </div>
                {/* Rev. 1638.4 — Pills + input livre, com limite por prazo.
                    Pills > maxSemanas ficam desabilitadas (não comprometem
                    prazo contratual nem caminho crítico nem início de
                    próxima atividade). Input livre aceita qualquer 1-52,
                    mas valida contra maxSemanas no commit (Enter ou blur). */}
                {!portalMode && onChangeRecoveryWindow && (
                  <RecoveryPicker
                    janelaAtual={janelaRecuperacao}
                    maxSemanas={limiteRecuperacao?.maxSemanas ?? 52}
                    limiteData={limiteRecuperacao?.limiteData ?? null}
                    limiteMotivo={limiteRecuperacao?.limiteMotivo ?? null}
                    onChange={onChangeRecoveryWindow}
                  />
                )}
                {!portalMode && evmSemana.janelaMinima != null && (
                  <span
                    className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 cursor-help"
                    title={`Com base no MAIOR avanço semanal já realizado (capacidade comprovada) vs MÉDIA do baseline das últimas 6 semanas. Janela menor que esta provavelmente não é factível.`}
                  >
                    💡 Sugerido: {evmSemana.janelaMinima} sem
                  </span>
                )}
                <span className="text-slate-300">|</span>
                <span className="text-[11px] text-slate-600" title={`Mantendo a meta diluída de ${evmSemana.metaDiluida.toFixed(2)}%/sem, o débito acumulado zera nesta data.`}>
                  📅 Atraso zerado em <strong className="text-slate-800">{evmSemana.dataConvergencia}</strong>
                </span>
                {/* Meta agressiva (1 sem) só pra engenheiro como referência de teto */}
                {!portalMode && janelaRecuperacao > 1 && (
                  <span className="text-[10px] text-slate-400" title="Meta agressiva: cobrar TODO o débito numa única semana. Quase sempre irrealista — exibido só como teto de referência.">
                    (agressiva 1 sem: {evmSemana.metaRecuperacao.toFixed(2)}%)
                  </span>
                )}
              </div>
            )}
            {/* Rev. 1638.3 — Legenda explícita por indicador. Fechado por
                padrão pra não poluir; o engenheiro abre quando quiser
                consultar a definição de cada KPI da semana. */}
            <details className="group text-[10px] text-slate-500 select-none">
              <summary className="cursor-pointer list-none flex items-center gap-1.5 hover:text-slate-700 transition-colors">
                <Info className="h-3 w-3" />
                <span className="font-semibold">O que significa cada indicador?</span>
                <span className="text-slate-400 group-open:hidden">(toque para abrir)</span>
                <span className="text-slate-400 hidden group-open:inline">(toque para fechar)</span>
              </summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 bg-white/70 border border-slate-200 rounded-lg px-3 py-2.5">
                <div>
                  <div className="text-[11px] font-semibold text-orange-700 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" /> Previsto
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    Quanto a obra <strong>deveria</strong> avançar de seg a dom segundo o cronograma baseline (Curva S). Atividades que cruzam várias semanas entram <strong>proporcionalmente</strong> (overlap dias × peso ÷ duração).
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Realizado
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    Quanto a obra <strong>de fato</strong> avançou na mesma janela seg→dom, calculado pelo delta de avanço físico (real fim − real início da semana) ponderado pelo peso de cada frente.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-slate-500" /> Aderência (SPI sem.)
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    <strong>Realizado ÷ Previsto</strong> da semana, em %. ≥ 95 % = no plano (verde); abaixo = vermelho. PMBOK chama de <em>SPI semanal</em> — mede a previsibilidade do plano (Last Planner / PPC).
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-red-700 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> Atraso a recuperar
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    Soma do <strong>débito acumulado</strong> de semanas anteriores fechadas (PV − EV até a semana passada). É métrica gerencial; <strong>não desconta do baseline</strong>.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Meta diluída ({janelaRecuperacao} sem)
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    Quanto a obra <strong>precisa avançar por semana</strong> para zerar o débito na janela escolhida = <em>Previsto baseline + (Atraso ÷ N semanas)</em>. Janela maior = meta mais factível.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                    <span className="inline-flex items-center justify-center w-3 h-3 rounded bg-blue-600 text-white text-[8px] font-bold">N</span> Recuperar em N sem
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    <strong>Janela de recuperação (Recovery Schedule, AACE 23R-02)</strong>. Define em quantas semanas o débito será diluído. Só o engenheiro edita; o cliente vê congelado no Portal.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-amber-700">💡 Sugerido: X sem</div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    Janela <strong>mínima viável</strong> calculada pelo histórico: <em>débito ÷ folga de pico</em>, onde folga = maior avanço semanal já realizado − média do baseline das últimas 6 semanas. Janela menor que isso provavelmente não é factível.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-700">📅 Atraso zerado em DD/MM/AAAA</div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    Data prevista de <strong>convergência</strong> = fim da semana atual + N × 7 dias. Se a obra entregar a Meta diluída todo sábado, o débito zera nesta data.
                  </p>
                </div>
                <div className="md:col-span-2 text-[10px] text-slate-500 italic border-t border-slate-200 pt-1.5">
                  <strong className="text-slate-700">Importante:</strong> o <strong>baseline (PV) é imutável</strong> — débito e meta diluída são métricas gerenciais, não alteram o cronograma original.
                </div>
              </div>
            </details>
            <div className="text-[10px] text-slate-400">
              Peso bruto das atividades ativas: <strong className="tabular-nums">{pesoSemana.somaSemana.toFixed(2)}%</strong>
              {pesoSemana.maiorContribVal > 0 && <> · maior contribuição na semana: <strong>{pesoSemana.maiorContribVal.toFixed(2)}pp</strong></>}
              {pesoSemana.criticasIds.size > 0 && <> · <strong className="text-red-600">{pesoSemana.criticasIds.size} crítica{pesoSemana.criticasIds.size !== 1 ? "s" : ""}</strong> (caminho crítico)</>}
              {pesoSemana.quaseCriticasIds.size > 0 && <> · <strong className="text-amber-600">{pesoSemana.quaseCriticasIds.size} quase crítica{pesoSemana.quaseCriticasIds.size !== 1 ? "s" : ""}</strong> (folga ≤ 14 d)</>}
              {" "}(informativo).
            </div>
            </div>
          )}

          {/* Rev. 1817 — KPI compacto + Filtro multi-select por Responsável.
              Texto preto puro (decisão do usuário), sem badges coloridos.
              Click no chip alterna inclusão/exclusão; "Todos" zera o filtro.
              Não aparece quando só FC executa (KPI degenera para 1 item). */}
          {kpiResp.length > 1 && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mr-1">
                Responsáveis
              </span>
              <button
                type="button"
                onClick={() => setFiltroResp(new Set())}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  filtroResp.size === 0
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                Todos
              </button>
              {kpiResp.map((k: any) => {
                const ativo = filtroResp.has(k.chave);
                return (
                  <button
                    key={k.chave}
                    type="button"
                    onClick={() => {
                      setFiltroResp(prev => {
                        const next = new Set(prev);
                        if (next.has(k.chave)) next.delete(k.chave); else next.add(k.chave);
                        return next;
                      });
                    }}
                    title={`${k.label} • ${k.count} atividade${k.count !== 1 ? "s" : ""} • ${k.pesoPct.toFixed(1)}% do peso`}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                      ativo
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-medium">{k.labelCurto}</span>
                    <span className={`text-[10px] tabular-nums ${ativo ? "text-slate-300" : "text-slate-500"}`}>
                      {k.count} · {k.pesoPct.toFixed(0)}%
                    </span>
                  </button>
                );
              })}
              {filtroResp.size > 0 && (
                <span className="text-[10px] text-slate-500 ml-1">
                  Mostrando {atividadesSemAtual.length} de {atividadesSemAtualBase.length} atividade{atividadesSemAtualBase.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Tabela de atividades */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">
                Atividades da Semana {semanaAtual?.numero}
              </span>
              <span className="text-[10px] text-slate-400 ml-1">
                {atividadesSemAtual.length} atividade{atividadesSemAtual.length !== 1 ? "s" : ""}
              </span>
            </div>

            {atividadesSemAtual.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                Nenhuma atividade prevista para esta semana.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/40 text-left text-[11px] font-semibold text-slate-500">
                      <th className="py-2 px-3 w-16">Item</th>
                      <th className="py-2 px-3">Atividade</th>
                      <th className="py-2 px-3 w-24">Início</th>
                      <th className="py-2 px-3 w-24">Fim</th>
                      {/* Rev. 1547 — Coluna "Recurso" removida em TODOS os modos
                          (portal e interno): é texto livre que quase sempre vem
                          vazio ('—') e os recursos previstos do orçamento já
                          aparecem em bloco próprio abaixo da tabela. */}
                      <th className="py-2 px-3 w-24 text-right" title="Peso da atividade NESTA semana, em pp = peso financeiro da atividade × fração do trabalho previsto para esta semana. Mostra quanto cada atividade efetivamente 'move o ponteiro' do avanço semanal. Ranking deste valor define o TOP 3 (Last Planner System).">Peso Sem%</th>
                      <th className="py-2 px-3 w-20 text-right" title="% que esta atividade DEVERIA estar concluída até o fim desta semana, calculado linearmente entre data de início e fim">Previsto%</th>
                      <th className="py-2 px-3 w-20 text-right">Real%</th>
                      <th className="py-2 px-3 w-20 text-right" title="Desvio = Real% − Previsto%. Positivo = atividade adiantada (verde). Negativo = atrasada (vermelho). Em semanas futuras o desvio fica em cinza neutro — a atividade ainda nem teve a chance de ser executada.">Desvio</th>
                      <th className="py-2 px-3 w-28 text-right" title={`Quanto esta atividade precisa avançar POR SEMANA para zerar o atraso individual, diluído na janela de Recovery Schedule (${janelaRecuperacao} semanas). Em semanas futuras é zero (atividade ainda não devia ter avançado).`}>Recuperação</th>
                      <th className="py-2 px-3 w-24 text-center">Status</th>
                      {/* Rev. 1817 — Responsável (FONTE ÚNICA: override → contrato terceiro → FC). */}
                      <th className="py-2 px-3 w-40" title="Responsável pela execução. Resolvido automaticamente: override manual → empresa do contrato terceiro vinculado a esta atividade → FC ENGENHARIA. Clique no lápis para sobrescrever.">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Rev. 1637.3 — "Atrasada" só quando há DÍVIDA ACUMULADA
                        da SEMANA PASSADA (cutoff = domingo da última semana
                        FECHADA = ini da semana atual − 1 dia). Antes a marca
                        usava `today` cru e o domingo da semana CORRENTE — o
                        que cobrava trabalho que ainda nem terminou e pintava
                        como "Atrasada" tudo que tinha cronograma para esta
                        semana ainda em aberto. Regra do usuário: "Só é
                        atrasada o que não foi feito na semana passada e
                        acumulou aqui". */}
                    {(() => null)()}
                    {atividadesSemAtual.map((a: any, i: number) => {
                      const av       = avancosMap[a.id] ?? 0;
                      // Rev. 1638.1 — regra única com tolerância proporcional ao peso.
                      const atrasada = calcAtrasada(a, av, semanaAtual?.ini, n(a.pesoFinanceiro));
                      const isMaiorPeso  = pesoSemana.maiorPesoIds.has(a.id);
                      const isCritica    = pesoSemana.criticasIds.has(a.id);
                      const isQuaseCrit  = pesoSemana.quaseCriticasIds.has(a.id);
                      const contribPp    = pesoSemana.contribById.get(a.id) ?? 0;

                      // Previsto% individual — % que a atividade DEVERIA estar
                      // concluída no fim desta semana (interpolação linear pela data).
                      // Rev. 1541 — usa DOMINGO 23:59 como fim da semana (mesma janela
                      // calendário Mon-Dom que o cabeçalho 'Previsto/Realizado da semana'
                      // do PlanejamentoDetalhe usa). Antes usávamos a sexta-feira
                      // (semanaAtual.fim), o que escondia atividades começando no
                      // sáb/dom: ex. 'Locação de gradil' inicia 08/05 (sex) — com ref=sex
                      // o per-row dava prevInd=0% e marcava 'em dia', enquanto o
                      // cabeçalho contava 3 dias de overlap (sex→dom) e cobrava o avanço
                      // proporcional. Resultado: cada linha verde, agregado vermelho.
                      // Agora as duas visões usam a MESMA janela calendário.
                      let prevInd = 0;
                      if (a.dataInicio && a.dataFim && semanaAtual?.fim) {
                        // Rev. 1643 — paridade EXATA com MS Project:
                        // se houver StatusDate ISO (com hora), usa esse cutoff
                        // e fração horária do dia útil (08-12-13-17 = 8h).
                        // Senão cai no comportamento anterior (domingo 23:59).
                        if (cutoffIso) {
                          prevInd = fracaoDecorridaComHora(a.dataInicio, cutoffIso, a.dataFim, calMSPParsed) * 100;
                        } else {
                          const ini = new Date(a.dataInicio + "T12:00:00").getTime();
                          const fim = new Date(a.dataFim    + "T12:00:00").getTime();
                          // Rev. 1647 — cutoff = próprio fim da semana (dia configurado).
                          const cutoffEod = new Date(semanaAtual.fim);
                          cutoffEod.setHours(23, 59, 59, 999);
                          const ref = cutoffEod.getTime();
                          prevInd = fracaoDecorridaMsCal(ini, ref, fim, calMSPParsed) * 100;
                        }
                      }
                      // Rev. 1511: Desvio = Real − Previsto. Positivo = adiantada (verde).
                      // Negativo = atrasada (vermelho).
                      // Rev. 1512: Para SEMANAS FUTURAS (que ainda não começaram),
                      // exibir o desvio em CINZA neutro — atividade ainda nem teve a
                      // chance de ser executada, seria injusto pintar de vermelho.
                      const desvio = av - prevInd;
                      const semanaFutura = !!semanaAtual && dateStr(semanaAtual.ini) > today;
                      // Rev. 1542 — Pill visual de aderência por atividade.
                      // Faixa neutra de ±2pp evita "ruído" para microvariações de
                      // arredondamento; > +2pp = adiantada (azul); < −2pp = atrasada
                      // (vermelho); semana futura = cinza neutro.
                      // Rev. 1637.3 — Pill segue a MESMA regra do badge
                      // Status: só vira "Atrasada" se houver débito acumulado
                      // de semanas FECHADAS (>=2pp). O desvio negativo apenas
                      // da semana corrente (ainda aberta) vira "Em curso".
                      const aderencia = semanaFutura
                        ? { label: "—", icon: "·",  cls: "bg-slate-100 text-slate-500 ring-slate-200" }
                        : atrasada    ? { label: "Atrasada",  icon: "▼", cls: "bg-red-50 text-red-700 ring-red-200" }
                        : desvio >  2 ? { label: "Adiantada", icon: "▲", cls: "bg-blue-50 text-blue-700 ring-blue-200" }
                        : desvio < -2 ? { label: "Em curso",  icon: "•", cls: "bg-amber-50 text-amber-700 ring-amber-200" }
                        :               { label: "No prazo",  icon: "●", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
                      // Rev. 1669 — Cor do Desvio (pp) por sinal: positivo=verde,
                      // negativo=vermelho, zero (no prazo)=azul. Tolerância de
                      // ±0,05pp evita ruído de arredondamento (vira azul).
                      const desvioCor = semanaFutura
                        ? "text-slate-400"
                        : desvio >  0.05 ? "text-emerald-600"
                        : desvio < -0.05 ? "text-red-600"
                        :                   "text-blue-600";
                      // Rev. 1544 — Realce de linha: CRÍTICA tem prioridade visual
                      // (vermelho) sobre MAIOR PESO (laranja); ambas podem aparecer
                      // simultaneamente nos badges do nome.
                      const rowBg = isCritica
                        ? "bg-red-50/70 border-l-4 border-l-red-500"
                        : isMaiorPeso
                          ? "bg-orange-50/60 border-l-4 border-l-orange-400"
                          : isQuaseCrit
                            ? "bg-amber-50/40 border-l-4 border-l-amber-300"
                            : atrasada
                              ? "bg-red-50/40"
                              : i % 2 === 0 ? "bg-white" : "bg-slate-50/30";
                      return (
                        <tr key={a.id ?? i} className={`border-b border-slate-50 ${rowBg}`}>
                          <td className="py-2 px-3 font-mono text-slate-500">{a.eapCodigo ?? "—"}</td>
                          <td className="py-2 px-3 text-slate-800 font-medium max-w-[300px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isCritica && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />}
                              {!isCritica && isMaiorPeso && <Zap className="h-3 w-3 shrink-0 text-orange-500" />}
                              <span className={`truncate ${isCritica ? "font-semibold text-red-900" : isMaiorPeso ? "font-semibold text-orange-900" : ""}`}>{a.nome}</span>
                              {isCritica && (
                                <span
                                  title="Caminho crítico: zero folga até o fim do projeto. Qualquer atraso aqui empurra a entrega."
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold shrink-0 ring-1 ring-red-200"
                                >
                                  CRÍTICA
                                </span>
                              )}
                              {!isCritica && isQuaseCrit && (
                                <span
                                  title="Quase crítica: folga ≤ 14 dias até o fim do projeto. Pouca margem para atraso."
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold shrink-0 ring-1 ring-amber-200"
                                >
                                  QUASE CRÍTICA
                                </span>
                              )}
                              {/* Rev. 1786 — Badge LoE/Indireta (PMBOK §6.4.2 / DCMA #6) */}
                              {(a as any).isIndireta && (
                                <span
                                  title="Indireta / Level of Effort (LoE) — atividade de apoio que NÃO compõe o caminho crítico (PMBOK §6.4.2 / DCMA #6)."
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[9px] font-bold shrink-0 ring-1 ring-slate-300"
                                >
                                  INDIRETA (LoE)
                                </span>
                              )}
                              {isMaiorPeso && (
                                <span
                                  title={`Top 3 da semana por contribuição ao Previsto: ${contribPp.toFixed(2)}pp (peso% × fração da atividade nesta semana).`}
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold shrink-0"
                                >
                                  TOP {Array.from(pesoSemana.maiorPesoIds).indexOf(a.id) + 1} · {contribPp.toFixed(2)}pp
                                </span>
                              )}
                            </div>
                            {(() => {
                              const h = hierarquiaOf(a.eapCodigo);
                              return h.length > 0 ? (
                                <div className="text-[9px] text-slate-400 mt-0.5 italic leading-tight truncate">
                                  {h.map((seg, si) => (
                                    <span key={si}>
                                      {si > 0 && <span className="mx-0.5">›</span>}
                                      <span className="text-slate-500 font-medium not-italic">{seg}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataInicio)}</td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataFim)}</td>
                          <td
                            className={`py-2 px-3 text-right tabular-nums ${
                              isMaiorPeso       ? "font-bold text-orange-700" :
                              contribPp >= 0.10 ? "font-bold text-orange-700" :
                              contribPp >= 0.01 ? "font-semibold text-slate-700" :
                                                  "text-slate-400"
                            }`}
                            title={`Peso da atividade nesta semana = peso projeto ${parseFloat(a.pesoFinanceiro ?? "0").toFixed(2)}% × fração do trabalho previsto na semana.`}
                          >
                            {contribPp < 0.005 ? "—" : `${contribPp.toFixed(2)}pp`}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500 tabular-nums">{prevInd.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-800 tabular-nums">{av.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`font-bold tabular-nums ${desvioCor}`}>
                                {desvio > 0 ? "+" : ""}{desvio.toFixed(1)}pp
                              </span>
                              <span
                                title={semanaFutura
                                  ? "Semana futura — atividade ainda não devia ter avançado."
                                  : `${aderencia.label}: Real ${av.toFixed(1)}% vs Previsto ${prevInd.toFixed(1)}% (faixa neutra ±2pp).`}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ring-1 ${aderencia.cls}`}
                              >
                                <span className="leading-none">{aderencia.icon}</span>
                                <span className="leading-none">{aderencia.label}</span>
                              </span>
                            </div>
                          </td>
                          {/* Rev. 1534 — Recuperação por atividade DILUÍDA em N semanas:
                              gap = max(0, Previsto% − Real%); pp/sem = gap ÷ N.
                              Em semanas futuras a atividade nem devia ter avançado, então 0. */}
                          <td className="py-2 px-3 text-right font-semibold tabular-nums" title={`Diluído em ${janelaRecuperacao} semana(s). Gap total: ${semanaFutura ? "0" : Math.max(0, prevInd - av).toFixed(1)}pp.`}>
                            {(() => {
                              const gap = semanaFutura ? 0 : Math.max(0, prevInd - av);
                              if (gap < 0.05) return <span className="text-emerald-600">— em dia</span>;
                              const pps = gap / janelaRecuperacao;
                              return <span className="text-blue-700">+{pps.toFixed(1)}pp/sem</span>;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(atrasada, av)}`}>
                              {statusLabel(atrasada, av)}
                            </span>
                          </td>
                          {/* Rev. 1817 — Responsável resolvido. */}
                          <td className="py-2 px-3">
                            <ResponsavelCell
                              atividadeId={a.id}
                              companyId={companyId}
                              responsavel={a.responsavel ?? null}
                              responsavelLotus={a.responsavelLotus ?? null}
                              isExterna={a.isExterna ?? null}
                              externaResponsavel={a.externaResponsavel ?? null}
                              readOnly={portalMode}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Rev. 1638 — Bloco B: Frentes Antecipadas (Last Planner System).
              Cronograma futuro, mas frente já aberta. Não entra no PPC/SPI
              da semana, mas indica esforço extra do time de campo. */}
          {frentesForaPlano.antecipadas.length > 0 && (
            <div className="bg-blue-50/40 rounded-xl border border-blue-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-blue-200 bg-blue-100/60 flex items-center gap-2">
                <span className="text-base leading-none">🚀</span>
                <span className="text-xs font-semibold text-blue-800">
                  Frentes Antecipadas — fora do plano da semana
                </span>
                <span className="text-[10px] text-blue-600 ml-1">
                  {frentesForaPlano.antecipadas.length} atividade{frentesForaPlano.antecipadas.length !== 1 ? "s" : ""} · +{frentesForaPlano.totalAntPp.toFixed(2)}pp informativo
                </span>
                <span
                  className="ml-auto text-[10px] text-blue-500 cursor-help"
                  title="Atividades com cronograma para SEMANAS FUTURAS, mas que o engenheiro de campo já iniciou. NÃO contam no PV nem no PPC desta semana (preserva a métrica de aderência ao plano). Somam normalmente no EV global do projeto."
                >
                  ℹ️ Não conta no PPC/SPI desta semana
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-100 bg-blue-50/40 text-left text-[11px] font-semibold text-blue-700">
                      <th className="py-2 px-3 w-16">Item</th>
                      <th className="py-2 px-3">Atividade</th>
                      <th className="py-2 px-3 w-32" title="Quando esta atividade deveria começar pelo cronograma">Programada para</th>
                      <th className="py-2 px-3 w-24 text-right" title="Peso da atividade no projeto">Peso projeto</th>
                      <th className="py-2 px-3 w-20 text-right">Real %</th>
                      <th className="py-2 px-3 w-32 text-right" title="Contribuição em pp ao avanço acumulado do projeto = peso × real / 100">EV gerado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frentesForaPlano.antecipadas.map((a: any, i: number) => {
                      const av  = avancosMap[a.id] ?? 0;
                      const pp  = n(a.pesoFinanceiro) * av / 100;
                      const semProgramada = semanas.find((s) => dateStr(s.ini) <= a.dataInicio && dateStr(s.fim) >= a.dataInicio);
                      return (
                        <tr key={a.id ?? i} className={`border-b border-blue-50 ${i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}`}>
                          <td className="py-2 px-3 font-mono text-blue-600">{a.eapCodigo ?? "—"}</td>
                          <td className="py-2 px-3 text-slate-800">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{a.nome}</span>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold ring-1 ring-blue-200"
                                title="Antecipação de frente: trabalho executado antes do programado."
                              >
                                🚀 ANTECIPADA
                              </span>
                            </div>
                            {(() => {
                              const h = hierarquiaOf(a.eapCodigo);
                              return h.length > 0 ? (
                                <div className="text-[9px] text-slate-400 mt-0.5 italic leading-tight truncate">
                                  {h.map((seg, si) => (
                                    <span key={si}>
                                      {si > 0 && <span className="mx-0.5">›</span>}
                                      <span className="text-slate-500 font-medium not-italic">{seg}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {fmtBR(a.dataInicio)}
                            {semProgramada && (
                              <div className="text-[9px] text-slate-400 leading-tight">Sem. {semProgramada.numero}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 tabular-nums">{n(a.pesoFinanceiro).toFixed(2)}%</td>
                          <td className="py-2 px-3 text-right font-semibold text-blue-700 tabular-nums">{av.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right font-bold text-blue-700 tabular-nums">+{pp.toFixed(3)}pp</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-100/50 border-t-2 border-blue-300 font-bold text-blue-800">
                      <td colSpan={5} className="py-2 px-3 text-right text-[11px]">Total antecipado (informativo) →</td>
                      <td className="py-2 px-3 text-right tabular-nums">+{frentesForaPlano.totalAntPp.toFixed(2)}pp</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Rev. 1638 — Bloco C: Recuperação de Atrasos (atividades expiradas).
              Cronograma já passou, mas frente continua em execução. Indica
              que o time está pagando dívida — informativo, não muda PV. */}
          {frentesForaPlano.arrastadas.length > 0 && (
            <div className="bg-amber-50/40 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-amber-200 bg-amber-100/60 flex items-center gap-2">
                <span className="text-base leading-none">⏪</span>
                <span className="text-xs font-semibold text-amber-800">
                  Recuperação de Atrasos — frentes expiradas em execução
                </span>
                <span className="text-[10px] text-amber-600 ml-1">
                  {frentesForaPlano.arrastadas.length} atividade{frentesForaPlano.arrastadas.length !== 1 ? "s" : ""} · +{frentesForaPlano.totalArrPp.toFixed(2)}pp acumulado
                </span>
                <span
                  className="ml-auto text-[10px] text-amber-600 cursor-help"
                  title="Atividades cujo cronograma JÁ EXPIROU mas continuam em execução (não atingiram 100%). Recuperação de dívida: contam no EV global, mas não estão no plano da semana corrente."
                >
                  ℹ️ Fora do plano da semana
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-100 bg-amber-50/40 text-left text-[11px] font-semibold text-amber-700">
                      <th className="py-2 px-3 w-16">Item</th>
                      <th className="py-2 px-3">Atividade</th>
                      <th className="py-2 px-3 w-32" title="Data de fim original do cronograma">Devia terminar em</th>
                      <th className="py-2 px-3 w-24 text-right">Peso projeto</th>
                      <th className="py-2 px-3 w-20 text-right">Real %</th>
                      <th className="py-2 px-3 w-32 text-right" title="Quanto ainda falta para a atividade fechar = peso × (100 − real) / 100">Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frentesForaPlano.arrastadas.map((a: any, i: number) => {
                      const av     = avancosMap[a.id] ?? 0;
                      const falta  = n(a.pesoFinanceiro) * (100 - av) / 100;
                      return (
                        <tr key={a.id ?? i} className={`border-b border-amber-50 ${i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}`}>
                          <td className="py-2 px-3 font-mono text-amber-700">{a.eapCodigo ?? "—"}</td>
                          <td className="py-2 px-3 text-slate-800">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{a.nome}</span>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold ring-1 ring-amber-200"
                                title="Atividade com cronograma expirado, ainda em execução."
                              >
                                ⏪ ARRASTADA
                              </span>
                            </div>
                            {(() => {
                              const h = hierarquiaOf(a.eapCodigo);
                              return h.length > 0 ? (
                                <div className="text-[9px] text-slate-400 mt-0.5 italic leading-tight truncate">
                                  {h.map((seg, si) => (
                                    <span key={si}>
                                      {si > 0 && <span className="mx-0.5">›</span>}
                                      <span className="text-slate-500 font-medium not-italic">{seg}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataFim)}</td>
                          <td className="py-2 px-3 text-right text-slate-600 tabular-nums">{n(a.pesoFinanceiro).toFixed(2)}%</td>
                          <td className="py-2 px-3 text-right font-semibold text-amber-700 tabular-nums">{av.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right font-bold text-amber-700 tabular-nums">−{falta.toFixed(3)}pp</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-amber-100/50 border-t-2 border-amber-300 font-bold text-amber-800">
                      <td colSpan={5} className="py-2 px-3 text-right text-[11px]">EV acumulado nessas frentes →</td>
                      <td className="py-2 px-3 text-right tabular-nums">+{frentesForaPlano.totalArrPp.toFixed(2)}pp</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Recursos do orçamento para a semana */}
          {!portalMode && orcamentoId && eapsDaSemana.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Recursos previstos no orçamento</span>
                {recursosQuery.isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400 ml-1" />}
              </div>
              {recursosQuery.data && (
                <RecursosDaSemana
                  recursos={recursosQuery.data}
                  eapsAtivas={eapsDaSemana}
                  equipDisponiveis={equipQuery.data}
                />
              )}
              {!recursosQuery.data && !recursosQuery.isLoading && (
                <p className="text-xs text-slate-400 p-4">Sem dados de recursos vinculados ao orçamento.</p>
              )}
            </div>
          )}

          {/* Bloco JULINHO Alertas */}
          {!portalMode && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 bg-gradient-to-r from-blue-50 to-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700">JULINHO — Alertas das próximas 3 semanas</span>
              </div>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1 bg-blue-600 hover:bg-blue-700"
                onClick={gerarAlertas}
                disabled={loadIA}
              >
                {loadIA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                {alertas ? "Reanalisar" : "Analisar"}
              </Button>
            </div>

            {!alertas && !loadIA && !iaErro && (
              <div className="py-8 text-center text-slate-400 text-xs">
                Clique em "Analisar" para o JULINHO avaliar as próximas 3 semanas com base no cronograma.
              </div>
            )}
            {loadIA && (
              <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Analisando programação das próximas {proximas3.length} semanas…
              </div>
            )}
            {iaErro && !loadIA && (
              <div className="m-4 flex items-start gap-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-0.5">Erro ao consultar o JULINHO</div>
                  <div className="text-red-500">{iaErro}</div>
                </div>
              </div>
            )}
            {alertas && <AlertasBlock alertas={alertas} semanas={proximas3.map(p => p.semana)} />}
          </div>
          )}
        </>
      )}

      {/* ── Modo: Relatório 3 Semanas ──────────────────────────────────────── */}
      {modoRelatorio && (
        <RelatorioTresSemanas
          proximas3={proximas3}
          avancosMap={avancosMap}
          today={today}
          nomeProjeto={nomeProjeto}
          nomeCliente={nomeCliente}
          recursos={recursos}
          equipDisponiveis={equipQuery.data}
          alertas={alertas}
          loadIA={loadIA}
          iaErro={iaErro}
          onGerarAlertas={gerarAlertas}
          hierarquiaOf={hierarquiaOf}
          portalMode={portalMode}
        />
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function cruzarComAlmox(nomeEquip: string, disponíveis: any): { almox: any | null; patrim: any | null } {
  const d = nomeEquip.toLowerCase();
  const almox = (disponíveis?.almoxarifado ?? []).find((a: any) =>
    d.split(" ").some((w: string) => w.length > 3 && a.nome.toLowerCase().includes(w))
  ) ?? null;
  const patrim = (disponíveis?.patrimonio ?? []).find((p: any) =>
    d.split(" ").some((w: string) => w.length > 3 && p.nome.toLowerCase().includes(w))
  ) ?? null;
  return { almox, patrim };
}

function RecursosDaSemana({
  recursos, eapsAtivas, equipDisponiveis,
}: {
  recursos: any;
  eapsAtivas: string[];
  equipDisponiveis?: any;
}) {
  const matchedByNome = !!recursos.matchedByNome;
  const itensAtivos = matchedByNome
    ? (recursos.itens ?? [])
    : (recursos.itens ?? []).filter((it: any) => eapsAtivas.includes(it.eapCodigo));
  const servCodes   = new Set(itensAtivos.map((it: any) => it.servicoCodigo).filter(Boolean));
  const insumos     = (recursos.insumos ?? []).filter((ins: any) => servCodes.has(ins.composicaoCodigo));

  // ── Classificação tripartida ──────────────────────────────────────────────
  // MO: itens com alocacaoMdo > 0 E descricao é ofício/pessoa
  // EQUIP: itens com alocacaoMdo > 0 MAS a descricao parece equipamento
  // MAT: itens com alocacaoMat > 0 e alocacaoMdo = 0
  const pessoaMO: any[] = [];
  const equipOrc: any[] = [];
  insumos
    .filter((i: any) => parseFloat(i.alocacaoMdo ?? "0") > 0)
    .forEach((i: any) => {
      const desc = i.insumoDescricao ?? "";
      if (isEquipOrcamento(desc)) equipOrc.push(i);
      else if (isPessoa(desc))    pessoaMO.push(i);
      else                        pessoaMO.push(i); // dúvida → vai p/ MO
    });

  const mat = insumos.filter(
    (i: any) => parseFloat(i.alocacaoMat ?? "0") > 0 && parseFloat(i.alocacaoMdo ?? "0") === 0
  );

  if (!itensAtivos.length) {
    return <p className="text-xs text-slate-400 p-4">Sem recursos de orçamento vinculados a estas atividades.</p>;
  }

  const temAlmoxCadastrado = (equipDisponiveis?.almoxarifado?.length ?? 0) + (equipDisponiveis?.patrimonio?.length ?? 0) > 0;

  return (
    <div className="p-4 space-y-4">
      {matchedByNome && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>EAPs do cronograma e orçamento não coincidem — recursos buscados por nome da atividade.</span>
        </div>
      )}

      {/* ── MÃO DE OBRA ─ pessoas / equipe ─────────────────────────────────── */}
      {pessoaMO.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <HardHat className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Mão de Obra</span>
            <span className="text-[10px] text-slate-400">(equipe necessária)</span>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] text-slate-500 border-b border-slate-100">
                <th className="pb-1 font-semibold">Ofício / Função</th>
                <th className="pb-1 font-semibold text-right w-20">Qtd</th>
                <th className="pb-1 font-semibold w-16">Un</th>
              </tr>
            </thead>
            <tbody>
              {pessoaMO.map((i: any, idx: number) => (
                <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-blue-50/20"}`}>
                  <td className="py-1 text-slate-700 font-medium">{i.insumoDescricao}</td>
                  <td className="py-1 text-right text-slate-600 font-mono">
                    {i.quantidade ? parseFloat(i.quantidade).toFixed(2) : "—"}
                  </td>
                  <td className="py-1 text-slate-400 pl-2">{i.unidade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MATERIAIS ──────────────────────────────────────────────────────── */}
      {mat.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Package className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Materiais</span>
            <span className="text-[10px] text-slate-400">({mat.length} item{mat.length !== 1 ? "s" : ""})</span>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] text-slate-500 border-b border-slate-100">
                <th className="pb-1 font-semibold">Descrição</th>
                <th className="pb-1 font-semibold text-right w-24">Quantidade</th>
                <th className="pb-1 font-semibold w-16">Un</th>
              </tr>
            </thead>
            <tbody>
              {mat.map((i: any, idx: number) => (
                <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-amber-50/20"}`}>
                  <td className="py-1 text-slate-700">{i.insumoDescricao}</td>
                  <td className="py-1 text-right text-slate-600 font-mono">
                    {i.quantidade ? parseFloat(i.quantidade).toFixed(2) : "—"}
                  </td>
                  <td className="py-1 text-slate-400 pl-2">{i.unidade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EQUIPAMENTOS ───────────────────────────────────────────────────── */}
      {(equipOrc.length > 0 || !temAlmoxCadastrado) && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Equipamentos</span>
            {!temAlmoxCadastrado && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Info className="h-2.5 w-2.5" /> Cadastre equipamentos no Almoxarifado para ver disponibilidade
              </span>
            )}
          </div>
          {equipOrc.length > 0 ? (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[10px] text-slate-500 border-b border-slate-100">
                  <th className="pb-1 font-semibold">Equipamento</th>
                  <th className="pb-1 font-semibold text-right w-24">Qtd</th>
                  <th className="pb-1 font-semibold w-16">Un</th>
                  <th className="pb-1 font-semibold w-28 text-center">Disponível</th>
                </tr>
              </thead>
              <tbody>
                {equipOrc.map((i: any, idx: number) => {
                  const { almox, patrim } = cruzarComAlmox(i.insumoDescricao ?? "", equipDisponiveis);
                  const dispAlmox  = almox ? almox.disponivel : null;
                  const dispPatrim = patrim ? patrim.disponivel : null;
                  const temCadastro = almox !== null || patrim !== null;
                  return (
                    <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-emerald-50/20"}`}>
                      <td className="py-1 text-slate-700 font-medium">{i.insumoDescricao}</td>
                      <td className="py-1 text-right text-slate-600 font-mono">
                        {i.quantidade ? parseFloat(i.quantidade).toFixed(2) : "—"}
                      </td>
                      <td className="py-1 text-slate-400 pl-2">{i.unidade ?? "—"}</td>
                      <td className="py-1 text-center">
                        {!temCadastro ? (
                          <span className="text-[10px] text-slate-400 italic">não cadastrado</span>
                        ) : (dispAlmox || dispPatrim) ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            <CheckCircle className="h-2.5 w-2.5" />
                            {almox ? `${almox.qtdDisponivel} ${almox.unidade}` : patrim?.local || "Sim"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                            <XCircle className="h-2.5 w-2.5" /> Indisponível
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[11px] text-slate-400 italic">
              Nenhum equipamento identificado no orçamento para estas atividades. Caso haja concretagem, andaimes ou máquinas — cadastre-os no Almoxarifado para rastrear disponibilidade.
            </p>
          )}
          {/* Patrimônio disponível na empresa */}
          {temAlmoxCadastrado && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Hammer className="h-2.5 w-2.5" /> Patrimônio cadastrado na empresa
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(equipDisponiveis?.patrimonio ?? []).map((p: any, i: number) => (
                  <span
                    key={i}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      p.disponivel
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {p.nome}{p.local ? ` · ${p.local}` : ""}
                    {p.disponivel ? " ✓" : " (indisponível)"}
                  </span>
                ))}
                {(equipDisponiveis?.almoxarifado ?? []).map((a: any, i: number) => (
                  <span
                    key={`alm-${i}`}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      a.disponivel
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {a.nome} — {a.qtdDisponivel} {a.unidade}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fallback: sem MO, MAT nem EQUIP → mostra composições */}
      {itensAtivos.length > 0 && !pessoaMO.length && !mat.length && !equipOrc.length && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wrench className="h-3 w-3 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">Composições</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {itensAtivos.slice(0, 10).map((it: any, idx: number) => (
              <span key={idx} className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                {it.descricao}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertasBlock({ alertas, semanas }: { alertas: any; semanas: Week[] }) {
  if (!alertas) return null;
  return (
    <div className="p-4 space-y-4">
      {alertas.resumo && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-700 leading-relaxed">
          <span className="font-semibold text-slate-800">Síntese executiva: </span>
          {alertas.resumo}
        </div>
      )}
      {alertas.alertas?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Alertas</p>
          {alertas.alertas.map((al: any, i: number) => (
            <div key={i} className={`border-l-4 rounded-r-lg p-3 ${severidadeCor(al.severidade)}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                {tipoIcon(al.tipo)}
                <span className="text-xs font-semibold text-slate-800">{al.titulo}</span>
                {al.semana && <span className="text-[10px] text-slate-500 ml-auto">Sem. {al.semana}</span>}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{al.descricao}</p>
            </div>
          ))}
        </div>
      )}
      {alertas.frentesAlternativas?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Frentes alternativas sugeridas</p>
          {alertas.frentesAlternativas.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
              <Zap className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] text-amber-600 font-semibold">Sem. {f.semana} — </span>
                <span className="text-xs text-slate-700">{f.sugestao}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {alertas.previsaoImpacto && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-[11px] font-semibold text-slate-600">Impacto estimado no prazo: </span>
            <span className="text-[11px] text-slate-600">{alertas.previsaoImpacto}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relatório 3 Semanas (tela + print) ──────────────────────────────────────

function RelatorioTresSemanas({
  proximas3, avancosMap, today, nomeProjeto, nomeCliente,
  recursos, equipDisponiveis, alertas, loadIA, iaErro, onGerarAlertas,
  hierarquiaOf, portalMode = false,
}: {
  proximas3: { semana: Week; atividades: any[] }[];
  avancosMap: Record<number, number>;
  today: string;
  nomeProjeto: string;
  nomeCliente: string;
  recursos: any;
  equipDisponiveis?: any;
  alertas: any;
  loadIA: boolean;
  iaErro: string | null;
  onGerarAlertas: () => void;
  hierarquiaOf: (eap: string | null | undefined) => string[];
  portalMode?: boolean;
}) {
  const dataGeracao = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Gerar alertas antes de imprimir */}
      {!portalMode && !alertas && !iaErro && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Brain className="h-4 w-4" />
            Gere os alertas do JULINHO para incluir no relatório
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs" onClick={onGerarAlertas} disabled={loadIA}>
            {loadIA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
            {loadIA ? "Analisando…" : "Gerar alertas IA"}
          </Button>
        </div>
      )}
      {!portalMode && iaErro && !loadIA && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-[13px]">Erro ao consultar o JULINHO</div>
              <div className="text-[11px] text-red-500 mt-0.5">{iaErro}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs border-red-200 text-red-600 hover:bg-red-100 gap-1" onClick={onGerarAlertas} disabled={loadIA}>
            <RefreshCcw className="h-3 w-3" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Relatório imprimível */}
      <div id="relatorio-semanal-print" className="bg-white rounded-xl border border-slate-200 overflow-hidden print:rounded-none print:border-none print:shadow-none">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-800 to-blue-900 text-white p-5 print:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium opacity-70 uppercase tracking-widest mb-1">Programação Semanal</p>
              <h1 className="text-lg font-bold">{nomeProjeto}</h1>
              <p className="text-sm opacity-80">{nomeCliente}</p>
            </div>
            <div className="text-right text-xs opacity-70">
              <p className="font-semibold">FC Engenharia</p>
              <p>Emitido em: {dataGeracao}</p>
              {proximas3.length > 0 && (
                <p className="mt-1">
                  Sem. {proximas3[0].semana.numero} a {proximas3[proximas3.length - 1].semana.numero}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* N colunas de semana */}
        <div className={`grid gap-0 divide-x divide-slate-200 ${
          proximas3.length >= 5 ? "grid-cols-3" :
          proximas3.length === 4 ? "grid-cols-4" :
          proximas3.length === 3 ? "grid-cols-3" :
          proximas3.length === 2 ? "grid-cols-2" : "grid-cols-1"
        } ${proximas3.length >= 5 ? "flex-wrap" : ""}`}>
          {proximas3.map(({ semana, atividades: at }) => {
            const itensEap = (recursos?.itens ?? []).filter((it: any) => at.some((a: any) => a.eapCodigo === it.eapCodigo));
            const servs    = new Set(itensEap.map((it: any) => it.servicoCodigo).filter(Boolean));
            const insEap   = (recursos?.insumos ?? []).filter((ins: any) => servs.has(ins.composicaoCodigo));
            const pessoasEap: any[] = [];
            const equipEap:   any[] = [];
            insEap.filter((i: any) => parseFloat(i.alocacaoMdo ?? "0") > 0).forEach((i: any) => {
              if (isEquipOrcamento(i.insumoDescricao ?? "")) equipEap.push(i);
              else pessoasEap.push(i);
            });
            const matEap   = insEap.filter((i: any) => parseFloat(i.alocacaoMat ?? "0") > 0 && parseFloat(i.alocacaoMdo ?? "0") === 0);
            // Rev. 1637.3 — contador do report card usa a mesma regra debt-based.
            const atrasadas = at.filter((a: any) => calcAtrasada(a, avancosMap[a.id] ?? 0, semana.ini, n(a.pesoFinanceiro))).length;

            return (
              <div key={semana.numero} className="flex flex-col">
                {/* Header da semana */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-700">SEMANA {semana.numero}</p>
                    {atrasadas > 0 && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                        {atrasadas} atrasada{atrasadas !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {fmtBRDate(semana.ini)} a {fmtBRDate(semana.fim)}
                  </p>
                  <p className="text-[10px] text-slate-400">{at.length} atividade{at.length !== 1 ? "s" : ""}</p>
                </div>

                {/* Atividades */}
                <div className="flex-1 px-3 py-2 space-y-1 min-h-[180px]">
                  {at.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-4 text-center">Sem atividades</p>
                  )}
                  {at.map((a: any, i: number) => {
                    const av       = avancosMap[a.id] ?? 0;
                    // Rev. 1637.3 — cada atividade no report card.
                    const atrasada = calcAtrasada(a, av, semana.ini, n(a.pesoFinanceiro));
                    return (
                      <div key={a.id ?? i}
                        className={`rounded p-1.5 border text-[11px] ${atrasada ? "bg-red-50 border-red-200" : av >= 100 ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold leading-tight text-slate-700">
                            {a.eapCodigo && <span className="font-mono text-slate-400 mr-1">{a.eapCodigo}</span>}
                            {a.nome}
                          </span>
                          <span className={`shrink-0 text-[10px] font-bold ${atrasada ? "text-red-600" : av >= 100 ? "text-emerald-600" : "text-blue-600"}`}>{av.toFixed(0)}%</span>
                        </div>
                        {(() => {
                          const h = hierarquiaOf(a.eapCodigo);
                          return h.length > 0 ? (
                            <div className="text-[9px] text-slate-400 mt-0.5 leading-tight truncate">
                              {h.map((seg, si) => (
                                <span key={si}>
                                  {si > 0 && <span className="mx-0.5">›</span>}
                                  <span className="text-slate-500 font-medium">{seg}</span>
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{fmtBR(a.dataInicio)} → {fmtBR(a.dataFim)}</span>
                          {a.recursoPrincipal && <span className="truncate text-slate-400">· {a.recursoPrincipal}</span>}
                          <span className="text-blue-500 font-medium">{n(a.pesoFinanceiro).toFixed(2)}%</span>
                        </div>
                        {/* Barra de progresso mini */}
                        <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${av >= 100 ? "bg-emerald-500" : atrasada ? "bg-red-500" : "bg-blue-500"}`}
                            style={{ width: `${Math.min(100, av)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recursos da semana */}
                {(pessoasEap.length > 0 || matEap.length > 0 || equipEap.length > 0 || itensEap.length > 0) && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Package className="h-2.5 w-2.5" /> Recursos necessários
                    </p>
                    {pessoasEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium flex items-center gap-0.5"><HardHat className="h-2.5 w-2.5" /> Mão de obra</p>
                        {pessoasEap.slice(0, 4).map((i: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600 pl-3">• {i.insumoDescricao}</p>
                        ))}
                      </div>
                    )}
                    {matEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5"><Package className="h-2.5 w-2.5" /> Materiais</p>
                        {matEap.slice(0, 4).map((i: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600 pl-3">• {i.insumoDescricao}{i.quantidade ? ` (${parseFloat(i.quantidade).toFixed(0)} ${i.unidade ?? ""})` : ""}</p>
                        ))}
                      </div>
                    )}
                    {equipEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5"><Truck className="h-2.5 w-2.5" /> Equipamentos</p>
                        {equipEap.slice(0, 4).map((i: any, idx: number) => {
                          const { almox, patrim } = cruzarComAlmox(i.insumoDescricao ?? "", equipDisponiveis);
                          const disp = almox?.disponivel || patrim?.disponivel;
                          return (
                            <p key={idx} className="text-[10px] text-slate-600 pl-3 flex items-center gap-1">
                              • {i.insumoDescricao}
                              {(almox || patrim) && (
                                <span className={`text-[9px] font-bold ${disp ? "text-emerald-600" : "text-red-500"}`}>
                                  {disp ? "✓" : "✗"}
                                </span>
                              )}
                            </p>
                          );
                        })}
                      </div>
                    )}
                    {!pessoasEap.length && !matEap.length && !equipEap.length && itensEap.length > 0 && (
                      <div>
                        {itensEap.slice(0, 4).map((it: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600">• {it.descricao}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Recursos texto (sem orçamento vinculado) */}
                {!recursos && at.some((a: any) => a.recursoPrincipal) && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Recursos</p>
                    {[...new Set(at.map((a: any) => a.recursoPrincipal).filter(Boolean))].slice(0, 5).map((r: any, i: number) => (
                      <p key={i} className="text-[10px] text-slate-600">• {r}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Alertas IA no rodapé */}
        {alertas && (
          <div className="border-t border-slate-200 p-5 space-y-4 bg-slate-50/40">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-bold text-slate-700">Análise JULINHO — Alertas e Recomendações</p>
            </div>
            {alertas.resumo && (
              <p className="text-xs text-slate-700 leading-relaxed bg-white border border-slate-100 rounded-lg p-3">
                <span className="font-semibold">Síntese: </span>{alertas.resumo}
              </p>
            )}
            {alertas.alertas?.length > 0 && (
              <div className="grid grid-cols-2 gap-2 print:grid-cols-2">
                {alertas.alertas.map((al: any, i: number) => (
                  <div key={i} className={`border-l-4 rounded-r-lg p-2.5 text-xs ${severidadeCor(al.severidade)}`}>
                    <div className="flex items-center gap-1 mb-0.5">
                      {tipoIcon(al.tipo)}
                      <span className="font-semibold text-slate-800">{al.titulo}</span>
                      {al.semana && <span className="text-[10px] text-slate-400 ml-auto">Sem. {al.semana}</span>}
                    </div>
                    <p className="text-[11px] text-slate-600">{al.descricao}</p>
                  </div>
                ))}
              </div>
            )}
            {alertas.frentesAlternativas?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Frentes alternativas</p>
                <div className="space-y-1">
                  {alertas.frentesAlternativas.map((f: any, i: number) => (
                    <p key={i} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                      <Zap className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                      <span><strong>Sem. {f.semana}:</strong> {f.sugestao}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {alertas.previsaoImpacto && (
              <p className="text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg p-2.5 flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span><strong>Impacto estimado:</strong> {alertas.previsaoImpacto}</span>
              </p>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div className="border-t border-slate-200 px-5 py-3 flex justify-between items-center text-[10px] text-slate-400 bg-slate-50">
          <span>FC Engenharia Civil · Sistema ERP RH&amp;DP</span>
          <span>Gerado em {dataGeracao} · Documento confidencial</span>
        </div>
      </div>

      {/* CSS de impressão embutido */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-semanal-print, #relatorio-semanal-print * { visibility: visible; }
          #relatorio-semanal-print { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Rev. 5146 — Painel CONSULTIVO de estimativa de mão de obra da semana.
// Cruza demanda (composições do orçamento; fallback produtividade média
// TCPO/SINAPI quando a EAP não casa) com o efetivo alocado na obra, por
// função, para enxergar sobra/falta e apoiar realocação. Não é vinculante.
function EstimativaMaoObraPanel({ projetoId, revisaoId, semanaIni, semanaFim, semanaNumero }: {
  projetoId: number; revisaoId: number; semanaIni: string; semanaFim: string; semanaNumero: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [verAtvs, setVerAtvs] = useState(false);
  // Rev. 5158 — clique na foto amplia (overlay simples, toque fecha)
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string } | null>(null);
  const q = trpc.planejamento.estimativaMaoObraSemana.useQuery(
    { projetoId, revisaoId, semanaIni, semanaFim },
    { enabled: projetoId > 0 && revisaoId > 0 && !!semanaIni, staleTime: 60_000 }
  );
  const d: any = q.data;
  if (q.isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Estimando mão de obra da semana...
      </div>
    );
  }
  if (!d || (d.totalHH <= 0 && d.efetivoTotal <= 0)) return null;

  // Rev. 5156 — conta em pessoas INTEIRAS (precisa=ceil, falta=precisa-tem)
  const faltas = (d.funcoes || []).filter((f: any) => f.hh > 0 && f.disponiveis != null && (f.disponiveis - Math.max(1, Math.ceil(f.pessoas))) < 0);
  const sobras = (d.funcoes || []).filter((f: any) => (f.hh > 0 ? (f.disponiveis ?? 0) - Math.max(1, Math.ceil(f.pessoas)) : (f.disponiveis ?? 0)) >= 1);
  const semMatch = (d.funcoes || []).filter((f: any) => f.semMatch && f.hh > 0);
  const nRef = (d.atividades || []).filter((a: any) => a.origem === "referencia").length;
  const nSem = (d.atividades || []).filter((a: any) => a.origem === "sem_estimativa").length;
  const corGeral = faltas.length > 0 ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/40";

  return (
    <div className={`rounded-lg border ${corGeral}`}>
      {fotoZoom && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setFotoZoom(null)}>
          <div className="flex flex-col items-center gap-2 max-w-full">
            <img src={fotoZoom.url} alt={fotoZoom.nome} className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-2xl" />
            <p className="text-white text-sm font-semibold text-center">{fotoZoom.nome}</p>
            <p className="text-white/60 text-[10px]">toque para fechar</p>
          </div>
        </div>
      )}
      <button className="w-full px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-left" onClick={() => setAberto(!aberto)}>
        <div className="flex items-center gap-2">
          <HardHat className={`h-4 w-4 ${faltas.length > 0 ? "text-red-600" : "text-emerald-600"}`} />
          <span className="text-xs font-semibold text-slate-800">Mão de Obra — Semana {semanaNumero}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">Consultivo</span>
        </div>
        <span className="text-[11px] text-slate-600">
          Precisa de <strong className="tabular-nums">{Math.ceil(d.totalPessoas)}</strong> pessoa{Math.ceil(d.totalPessoas) !== 1 ? "s" : ""} na semana
        </span>
        {d.temObra && (
          <span className="text-[11px] text-slate-600">
            Tem <strong className="tabular-nums">{d.efetivoTotal}</strong> disponíve{d.efetivoTotal !== 1 ? "is" : "l"}
          </span>
        )}
        {faltas.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Falta em {faltas.length} {faltas.length !== 1 ? "funções" : "função"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Efetivo comporta a semana
          </span>
        )}
        {sobras.length > 0 && (
          <span className="text-[11px] text-blue-700 font-medium">{sobras.length} {sobras.length !== 1 ? "funções" : "função"} com sobra p/ realocar</span>
        )}
        <ChevronRight className={`h-4 w-4 text-slate-400 ml-auto transition-transform ${aberto ? "rotate-90" : ""}`} />
      </button>

      {aberto && (
        <div className="px-4 pb-3 space-y-3">
          {(nRef > 0 || nSem > 0 || semMatch.length > 0) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800 space-y-0.5">
              {nRef > 0 && <p>⚠️ {nRef} atividade{nRef !== 1 ? "s" : ""} fora do orçamento (EAP não casa ou sem CPU) — estimada{nRef !== 1 ? "s" : ""} por produtividade média <strong>TCPO/SINAPI</strong>.</p>}
              {nSem > 0 && <p>• {nSem} atividade{nSem !== 1 ? "s" : ""} sem estimativa possível (sem composição, quantidade ou referência) — confira nos detalhes.</p>}
              {semMatch.length > 0 && <p>• {semMatch.length !== 1 ? "Funções" : "Função"} sem correspondente no efetivo da obra: {semMatch.map((f: any) => f.funcao).join(", ")}.</p>}
            </div>
          )}
          {(() => {
            // Rev. 5152 — layout agrupado: 1) funções com demanda casada com o
            // efetivo; 2) demanda sem correspondente na obra; 3) sobras (na obra
            // sem demanda na semana). Some com a "parede de ?" no meio da tabela.
            const todas = (d.funcoes || []) as any[];
            const comMatch = todas.filter((f) => f.hh > 0 && !f.semMatch);
            const semCorresp = todas.filter((f) => f.hh > 0 && f.semMatch);
            const sobrasG = todas.filter((f) => !(f.hh > 0));
            // Rev. 5153 — nomes dos alocados na função, com nº de atestados (12 meses).
            const nomes = (f: any) => {
              const lista = (f.alocados || []) as any[];
              if (lista.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {lista.map((p: any, j: number) => (
                    <span key={j} className={`inline-flex items-center gap-1 text-[9px] font-normal border rounded-full pl-0.5 pr-1.5 py-px ${p.indisponivel ? "bg-orange-50 border-orange-200 text-orange-700 line-through decoration-orange-400" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                      {p.foto ? (
                        <img
                          src={`${p.foto}${p.foto.includes("?") ? "&" : "?"}w=128`}
                          loading="lazy" alt=""
                          className="h-4 w-4 rounded-full object-cover shrink-0 cursor-zoom-in"
                          onClick={(ev) => { ev.stopPropagation(); setFotoZoom({ url: p.foto, nome: p.nome }); }}
                        />
                      ) : (
                        <span className="h-4 w-4 rounded-full bg-slate-200 text-slate-500 text-[7px] font-bold flex items-center justify-center shrink-0">{String(p.nome || "?").trim().split(/\s+/).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase()}</span>
                      )}
                      {p.nome}
                      {p.indisponivel && <span className="font-bold no-underline" style={{ textDecoration: "none" }}>{p.indisponivel}</span>}
                      {p.terceiro && <span className="text-blue-600 font-semibold">terceiro</span>}
                      {p.atestados12m > 0 && (
                        <span className={`font-bold ${p.atestados12m >= 3 ? "text-red-600" : "text-amber-600"}`} title={`${p.atestados12m} atestado(s) nos últimos 12 meses`}>
                          {p.atestados12m} atest.
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              );
            };
            // Rev. 5156 — poka-yoke: tudo em PESSOAS INTEIRAS. "Precisa 3, tem 1,
            // faltam 2" — legível de bater o olho. As horas ficam pequenas, só
            // como referência de onde veio a conta.
            const linha = (f: any, i: number) => {
              const precisa = f.hh > 0 ? Math.max(1, Math.ceil(f.pessoas)) : 0;
              const tem = f.disponiveis ?? 0;
              const dif = tem - precisa;
              return (
                <tr key={`${f.funcao}-${i}`} className={`border-b last:border-0 ${precisa > 0 && dif < 0 ? "bg-red-50/60" : ""}`}>
                  <td className="py-1.5 px-3 font-medium">{f.funcao}{nomes(f)}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums font-semibold align-top">
                    {precisa > 0 ? precisa : "—"}
                    {f.hh > 0 && <span className="block text-[8px] font-normal text-slate-400">{f.hh}h</span>}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums font-semibold align-top">{tem > 0 ? tem : "—"}</td>
                  <td className={`text-right py-1.5 px-3 align-top font-bold ${precisa > 0 && dif < 0 ? "text-red-600" : precisa > 0 ? "text-emerald-700" : dif > 0 ? "text-blue-700" : "text-slate-400"}`}>
                    {precisa > 0 && dif < 0 && `Falta${dif < -1 ? "m" : ""} ${-dif}`}
                    {precisa > 0 && dif >= 0 && (dif === 0 ? "OK" : `OK · sobra${dif > 1 ? "m" : ""} ${dif}`)}
                    {precisa === 0 && tem > 0 && `Sobra${tem > 1 ? "m" : ""} ${tem}`}
                    {precisa === 0 && tem === 0 && "—"}
                  </td>
                </tr>
              );
            };
            // Rev. 5153 — sugestão nominal: quem está em função com sobra (candidato
            // a realocar/liberar), priorizando quem tem mais atestados em 12 meses.
            // Rev. 5154 — só quem está DISPONÍVEL na semana entra como candidato;
            // quem está de férias/atestado/afastado aparece riscado na tabela.
            const candidatos = sobrasG
              .flatMap((f: any) => ((f.alocados || []) as any[]).map((p: any) => ({ ...p, funcao: f.funcao })))
              .filter((p: any) => !p.indisponivel)
              .sort((a: any, b: any) => b.atestados12m - a.atestados12m || a.nome.localeCompare(b.nome, "pt-BR"));
            const indisponiveis = todas
              .flatMap((f: any) => ((f.alocados || []) as any[]).map((p: any) => ({ ...p, funcao: f.funcao })))
              .filter((p: any) => p.indisponivel);
            const faltamTxt = todas
              .filter((f: any) => f.hh > 0 && f.disponiveis != null && (f.disponiveis - Math.max(1, Math.ceil(f.pessoas))) < 0)
              .map((f: any) => {
                const n = Math.max(1, Math.ceil(f.pessoas)) - (f.disponiveis ?? 0);
                return `${n} ${f.funcao}`;
              });
            const sugestaoBloco = (candidatos.length > 0 || faltamTxt.length > 0 || indisponiveis.length > 0) ? (
              <div className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-[10px] text-slate-700 space-y-1">
                <p className="font-bold text-blue-800 uppercase tracking-wide text-[9px]">Sugestão da semana</p>
                {faltamTxt.length > 0 && (
                  <p>🔴 <strong>Falta:</strong> {faltamTxt.join(" · ")} — completar com realocação de outra obra, contratação ou subempreita.</p>
                )}
                {indisponiveis.length > 0 && (
                  <p>
                    🟠 <strong>Fora da conta nesta semana:</strong>{" "}
                    {indisponiveis.map((p: any, j: number) => (
                      <span key={j}>{j > 0 && " · "}<strong>{p.nome}</strong> ({p.funcao} — {p.indisponivel})</span>
                    ))}
                  </p>
                )}
                {candidatos.length > 0 && (
                  <p>
                    🔄 <strong>Sugestão de realocação:</strong> {candidatos.map((p: any) => p.nome.split(" ")[0]).slice(0, 5).join(", ")}{" "}
                    {candidatos.length === 1 ? "está em função sem atividade programada" : "estão em funções sem atividade programada"} nesta semana — dá para realocar para outra obra/projeto.{" "}
                    {candidatos.map((p: any, j: number) => (
                      <span key={j}>
                        {j > 0 && " · "}
                        <strong>{p.nome}</strong> ({p.funcao}{p.terceiro ? ", terceiro" : ""}{p.atestados12m > 0 ? `, ${p.atestados12m} atest./12m` : ""})
                      </span>
                    ))}
                    <span className="text-slate-500"> — quem tem mais atestados aparece primeiro.</span>
                  </p>
                )}
              </div>
            ) : null;
            const grupoHeader = (titulo: string, cor: string) => (
              <tr className={`${cor} border-b`}>
                <td colSpan={4} className="py-1 px-3 text-[9px] font-bold uppercase tracking-wider">{titulo}</td>
              </tr>
            );
            return (
              <>
              {sugestaoBloco}
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[9px] text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-1.5 px-3">Função</th>
                      <th className="text-right py-1.5 px-2">Precisa</th>
                      <th className="text-right py-1.5 px-2">Tem na obra</th>
                      <th className="text-right py-1.5 px-3">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comMatch.length > 0 && grupoHeader("Demanda da semana × efetivo da obra", "bg-slate-100/80 text-slate-500")}
                    {comMatch.map(linha)}
                    {semCorresp.length > 0 && grupoHeader("Demanda sem função correspondente na obra (contratar / subempreitar?)", "bg-amber-50 text-amber-700")}
                    {semCorresp.map(linha)}
                    {sobrasG.length > 0 && grupoHeader("Na obra sem demanda na semana (possível realocação)", "bg-blue-50/70 text-blue-700")}
                    {sobrasG.map(linha)}
                  </tbody>
                </table>
              </div>
              </>
            );
          })()}
          <button className="text-[10px] text-slate-500 underline underline-offset-2" onClick={() => setVerAtvs(!verAtvs)}>
            {verAtvs ? "Ocultar" : "Ver"} detalhe por atividade ({(d.atividades || []).length})
          </button>
          {verAtvs && (
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-slate-50 border-b text-[9px] text-slate-500 uppercase tracking-wider">
                    <th className="text-left py-1.5 px-3">EAP / Atividade</th>
                    <th className="text-left py-1.5 px-2">Fonte</th>
                    <th className="text-right py-1.5 px-2">HH na semana</th>
                    <th className="text-right py-1.5 px-3">≈ Pessoas</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.atividades || []).map((a: any) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-1.5 px-3">
                        <span className="font-mono text-slate-400 mr-1.5">{a.eapCodigo || "—"}</span>{a.nome}
                        {a.obs && <span className="block text-[9px] text-amber-700">{a.obs}</span>}
                      </td>
                      <td className="py-1.5 px-2">
                        {a.origem === "orcamento" && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">Orçamento (CPU)</span>}
                        {a.origem === "referencia" && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">TCPO/SINAPI</span>}
                        {a.origem === "sem_estimativa" && <span className="text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">Sem estimativa</span>}
                      </td>
                      <td className="text-right py-1.5 px-2 tabular-nums">{a.hh > 0 ? `${a.hh}h` : "—"}</td>
                      <td className="text-right py-1.5 px-3 tabular-nums font-semibold">{a.pessoas > 0 ? a.pessoas : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[9px] text-slate-400">
            Estimativa consultiva: composições do orçamento quando a EAP casa; produtividade média TCPO/SINAPI quando não casa; jornada de {d.horasSemana}h/semana. Não altera cronograma nem % previsto.
          </p>
        </div>
      )}
    </div>
  );
}
