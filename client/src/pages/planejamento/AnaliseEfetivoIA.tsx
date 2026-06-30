import React, { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Loader2, Users, HardHat, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Lightbulb,
  ClipboardList, RefreshCw, Building2, Database, GitCompareArrows, Brain, ListChecks,
  Plus, Calculator, BookOpen, CalendarClock, DollarSign, Activity, ShieldCheck, RotateCcw,
  Award, History, Clock, BarChart3, ArrowLeft,
  HelpCircle, Send, ChevronDown, Layers, UserCheck, Briefcase, Trophy, Gauge,
  Swords, Target, Flag, Zap, Wrench, Route, Siren, Crosshair, Umbrella,
  MapPin, Archive, GraduationCap,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Cell, PieChart, Pie,
} from "recharts";
import { formatDateTime } from "@/lib/dateUtils";

type Props = {
  projetoId: number;
  companyId: number;
};

// Etapas exibidas durante o processamento (progresso simulado no cliente — a IA
// é uma única chamada async, então animamos as fases até o retorno e fechamos
// em 100% no sucesso). `ate` = teto de % onde a etapa fica "em andamento".
const ETAPAS: { label: string; detalhe: string; ate: number; Icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Lendo o efetivo alocado na obra",       detalhe: "Funcionários ativos por função, categoria MO e vínculo", ate: 22, Icon: Database },
  { label: "Cruzando com o cronograma",             detalhe: "Atividades em andamento + próximas 8 semanas",          ate: 45, Icon: GitCompareArrows },
  { label: "Agregando por função e categoria",      detalhe: "Consolidando o quadro atual da equipe",                 ate: 62, Icon: Users },
  { label: "Consultando a IA",                       detalhe: "Diagnóstico de dimensionamento (contratar/reduzir/manter)", ate: 90, Icon: Brain },
  { label: "Montando recomendações",                detalhe: "Indicadores, frentes críticas, riscos e ações",          ate: 100, Icon: ListChecks },
];

const ETAPAS_SIM: { label: string; detalhe: string; ate: number; Icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Montando o cenário simulado",           detalhe: "Aplicando os ajustes por função sobre o efetivo atual", ate: 22, Icon: Calculator },
  { label: "Cruzando com o cronograma",             detalhe: "Atividades em andamento + próximas 8 semanas",          ate: 45, Icon: GitCompareArrows },
  { label: "Aplicando a literatura de gestão",      detalhe: "Brooks, curva de aprendizado, LOB, overmanning (CII)",  ate: 62, Icon: BookOpen },
  { label: "Consultando a IA",                       detalhe: "Projeção de prazo, produtividade, custo e qualidade",   ate: 90, Icon: Brain },
  { label: "Montando o prognóstico",                detalhe: "Impactos, indicadores, riscos e referências",           ate: 100, Icon: ListChecks },
];

type Indicador = { label: string; valor: string; status?: string; descricao?: string };
type CargoLinha = { cargo: string; categoria?: string; atual: number; recomendado: number; delta: number; acao: string; justificativa?: string };
type AtividadeCritica = { atividade: string; periodo?: string; necessidade?: string };

const ACAO_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  contratar: { label: "Contratar", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: ArrowUpRight },
  reduzir:   { label: "Reduzir",   cls: "bg-amber-50 text-amber-700 border-amber-200",       Icon: ArrowDownRight },
  manter:    { label: "Manter",    cls: "bg-slate-50 text-slate-600 border-slate-200",         Icon: Minus },
};

const DIAG_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  equilibrado: { label: "Efetivo equilibrado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  contratar:   { label: "Recomenda contratar", cls: "bg-blue-50 text-blue-700 border-blue-200",          Icon: TrendingUp },
  reduzir:     { label: "Há folga (pode reduzir)", cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: TrendingDown },
  misto:       { label: "Ajustes mistos",      cls: "bg-violet-50 text-violet-700 border-violet-200",    Icon: RefreshCw },
};

// Veredito do simulador
const VEREDITO_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  favoravel: { label: "Cenário favorável",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  neutro:    { label: "Impacto neutro",     cls: "bg-slate-50 text-slate-600 border-slate-200",        Icon: Minus },
  arriscado: { label: "Cenário arriscado",  cls: "bg-amber-50 text-amber-700 border-amber-200",        Icon: AlertTriangle },
};

const IMPACTO_STATUS: Record<string, { dot: string; txt: string }> = {
  positivo: { dot: "bg-emerald-500", txt: "text-emerald-700" },
  neutro:   { dot: "bg-slate-400",   txt: "text-slate-600" },
  negativo: { dot: "bg-amber-500",   txt: "text-amber-700" },
};

function statusDot(status?: string) {
  if (status === "critico") return "bg-red-500";
  if (status === "alerta")  return "bg-amber-500";
  return "bg-emerald-500";
}

export default function AnaliseEfetivoIA({ projetoId, companyId }: Props) {
  const [modo, setModo] = useState<"diagnostico" | "simulador" | "historico">("diagnostico");

  const TABS: { id: typeof modo; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "diagnostico", label: "Diagnóstico", Icon: Sparkles },
    { id: "simulador",   label: "Simulador",   Icon: Calculator },
    { id: "historico",   label: "Histórico",   Icon: History },
  ];

  return (
    <div className="space-y-5">
      {/* Alternador de modo */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {TABS.map((t) => {
          const TabIcon = t.Icon;
          return (
            <button
              key={t.id}
              onClick={() => setModo(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                modo === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <TabIcon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {modo === "diagnostico" && <Diagnostico projetoId={projetoId} companyId={companyId} />}
      {modo === "simulador" && <Simulador projetoId={projetoId} companyId={companyId} />}
      {modo === "historico" && <Historico projetoId={projetoId} companyId={companyId} />}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Traduz erros crípticos de TRANSPORTE/RUNTIME do iOS Safari numa mensagem
 * clara e acionável. As chamadas de IA (diagnóstico/simulação) são longas e
 * pesadas; o WebKit do iPad/iOS pode derrubar/abortar a requisição e expor a
 * DOMException nativa crua ("The string did not match the expected pattern.",
 * "Load failed", "The operation was aborted." etc.) direto no banner de erro,
 * sem que haja qualquer bug no nosso pipeline (server/superjson/render foram
 * auditados e estão livres de datas iOS-inseguras). Aqui amaciamos a mensagem.
 * ──────────────────────────────────────────────────────────────────────── */
function isErroTransporteIos(err: any): boolean {
  const raw = String(err?.message ?? "").trim();
  const low = raw.toLowerCase();
  return (
    raw === "" ||
    low.includes("did not match the expected pattern") ||
    low.includes("load failed") ||
    low.includes("failed to fetch") ||
    low.includes("networkerror") ||
    low.includes("network connection") ||
    low.includes("the operation couldn't be completed") ||
    low.includes("the operation couldn’t be completed") ||
    low.includes("the operation was aborted") ||
    low.includes("aborted") ||
    low.includes("timed out") ||
    low.includes("tempo limite")
  );
}

function msgErroIA(err: any, fallback: string, acao = "Tente novamente"): string {
  const raw = String(err?.message ?? "").trim();
  if (isErroTransporteIos(err)) {
    return `A IA demorou demais ou a conexão caiu durante o processamento — comum no iPad/Safari em análises longas. ${acao}. Se persistir, use um navegador atualizado ou o computador.`;
  }
  return raw || fallback;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Recuperação após queda de conexão (iPad/Safari).
 * As chamadas de IA (diagnóstico/simulação) são longas; o WebKit do iPad pode
 * DERRUBAR a requisição mesmo quando o servidor JÁ terminou e PERSISTIU o
 * resultado. Quando a mutação falha por erro de TRANSPORTE, fazemos polling de
 * `ultimaAnaliseEfetivo`: se aparecer uma análise mais nova que a baseline
 * (capturada ao iniciar), nós a exibimos em vez de mostrar o erro. Se nada
 * novo surgir dentro da janela, desistimos e o banner de erro reaparece.
 * Retorna `recuperando` (true enquanto tenta recuperar).
 * ──────────────────────────────────────────────────────────────────────── */
function useRecuperarAposQueda(opts: {
  isError: boolean;
  error: any;
  refetchUltima: () => Promise<{ data?: { criadoEm?: string | null; resultado?: any } | null }>;
  baselineCriadoEm: () => string | null | undefined;
  onRecuperado: (resultado: any) => void;
  resetMut: () => void;
}): boolean {
  const { isError, error, refetchUltima, baselineCriadoEm, onRecuperado, resetMut } = opts;
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    if (!isError || !isErroTransporteIos(error)) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;
    const baseline = baselineCriadoEm() ?? null;
    let tentativas = 0;
    const MAX = 18; // ~90s (4s inicial + 5s por tentativa)
    setRecuperando(true);

    const tick = async () => {
      if (cancelado) return;
      tentativas += 1;
      try {
        const r = await refetchUltima();
        const row = r?.data;
        if (!cancelado && row?.resultado && (row.criadoEm ?? null) !== baseline) {
          onRecuperado(row.resultado);
          resetMut();
          setRecuperando(false);
          return;
        }
      } catch { /* ignora; tenta de novo na próxima rodada */ }
      if (cancelado) return;
      if (tentativas < MAX) {
        timer = setTimeout(tick, 5000);
      } else {
        setRecuperando(false); // desiste → o banner de erro reaparece
      }
    };
    // Dá um respiro inicial pro servidor terminar de gravar.
    timer = setTimeout(tick, 4000);
    return () => { cancelado = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error]);

  return recuperando;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hook de progresso simulado (0–100%) reusado pelo diagnóstico e simulador
 * ──────────────────────────────────────────────────────────────────────── */
function useProgressoSimulado(isPending: boolean, isSuccess: boolean) {
  const [progresso, setProgresso] = useState(0);
  const [mostrar, setMostrar] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPending) {
      setMostrar(true);
      setProgresso(4);
      timerRef.current = setInterval(() => {
        setProgresso((p) => {
          // Rev. 2585 — não "trava" em 95%: após 95 segue um crawl bem lento até
          // 99 enquanto a IA finaliza, evitando a sensação de barra congelada.
          if (p >= 99) return 99;
          const passo = p < 45 ? 3.2 : p < 70 ? 1.6 : p < 88 ? 0.9 : p < 95 ? 0.4 : 0.15;
          return Math.min(99, +(p + passo).toFixed(2));
        });
      }, 180);
      return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (isSuccess) {
      setProgresso(100);
      const t = setTimeout(() => { setMostrar(false); setProgresso(0); }, 900);
      return () => clearTimeout(t);
    }
    setMostrar(false);
    setProgresso(0);
  }, [isPending, isSuccess]);

  return { progresso, mostrar };
}

function PainelProgresso({
  progresso, etapas, titulo,
}: { progresso: number; etapas: typeof ETAPAS; titulo: string }) {
  const etapaAtualIdx = etapas.findIndex((e) => progresso < e.ate);
  const etapaIdx = etapaAtualIdx === -1 ? etapas.length - 1 : etapaAtualIdx;
  // Rev. 2591 — no iPad o painel pode nascer abaixo da tabela longa de funções;
  // rola ele para a vista assim que aparece, pra o usuário ver o 0–100% + etapas.
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return (
    <div ref={ref} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-semibold text-slate-700 inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" /> {titulo}
        </span>
        <span className="text-sm font-bold text-blue-700 tabular-nums">{Math.round(progresso)}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-200 ease-out"
          style={{ width: `${progresso}%` }}
        />
      </div>
      <div className="mt-4 space-y-2.5">
        {etapas.map((e, i) => {
          const concluida = i < etapaIdx;
          const ativa = i === etapaIdx;
          const EtapaIcon = e.Icon;
          return (
            <div key={i} className={`flex items-start gap-3 ${!concluida && !ativa ? "opacity-40" : ""}`}>
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                concluida ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                : ativa ? "border-blue-200 bg-blue-50 text-blue-600"
                : "border-slate-200 bg-slate-50 text-slate-400"
              }`}>
                {concluida ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : ativa ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <EtapaIcon className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight ${ativa ? "text-slate-800" : "text-slate-600"}`}>{e.label}</p>
                <p className="text-xs text-slate-400 leading-snug mt-0.5">{e.detalhe}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Modo DIAGNÓSTICO
 * ──────────────────────────────────────────────────────────────────────── */
function Diagnostico({ projetoId, companyId }: Props) {
  const [result, setResult] = useState<any>(null);
  const [restauradaEm, setRestauradaEm] = useState<string | null>(null);
  // Restaura a última análise salva ao reabrir a tela (antes se perdia: ficava
  // só no state local). SOMENTE LEITURA; não regenera nem chama a IA.
  const ultimaQ = trpc.iaCronograma.ultimaAnaliseEfetivo.useQuery(
    { projetoId, companyId, tipo: "diagnostico" },
    { staleTime: 60_000 },
  );
  // Restaura UMA vez no primeiro carregamento. Depois disso o usuário manda no
  // estado (refazer/limpar não devem ser "revividos" pela query em cache).
  const restaurouRef = useRef(false);
  useEffect(() => {
    if (restaurouRef.current || ultimaQ.data === undefined) return;
    restaurouRef.current = true;
    if (!result && ultimaQ.data?.resultado) {
      setResult(ultimaQ.data.resultado);
      setRestauradaEm(ultimaQ.data.criadoEm ?? null);
    }
  }, [ultimaQ.data, result]);
  const mut = trpc.iaCronograma.analisarEfetivo.useMutation({
    onSuccess: (d) => { setResult(d); setRestauradaEm(null); },
  });
  const { progresso, mostrar } = useProgressoSimulado(mut.isPending, mut.isSuccess);
  // Baseline da última análise salva (capturada ao iniciar) p/ a recuperação
  // distinguir uma análise NOVA (gravada pelo servidor) da já exibida.
  const baselineRef = useRef<string | null>(null);
  const recuperando = useRecuperarAposQueda({
    isError: mut.isError,
    error: mut.error,
    refetchUltima: () => ultimaQ.refetch(),
    baselineCriadoEm: () => baselineRef.current,
    onRecuperado: (r) => { setResult(r); setRestauradaEm(null); },
    resetMut: () => mut.reset(),
  });

  const gerar = async () => {
    // Captura uma baseline FRESCA (não a do cache, que tem staleTime 60s e pode
    // estar defasada/null) p/ a recuperação distinguir com segurança uma análise
    // NOVA gravada pelo servidor. Se o refetch falhar, cai no cache.
    try {
      const fresh = await ultimaQ.refetch();
      baselineRef.current = fresh.data?.criadoEm ?? null;
    } catch {
      baselineRef.current = ultimaQ.data?.criadoEm ?? null;
    }
    mut.mutate({ projetoId, companyId });
  };
  const analise = result?.analise;

  return (
    <div className="space-y-5">
      {/* Cabeçalho / CTA */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50/60 to-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-600/10 p-2.5">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Análise de Efetivo × Cronograma (IA)</h2>
              <p className="text-sm text-slate-500 max-w-2xl mt-0.5">
                Cruza o efetivo atual alocado na obra com as atividades em andamento e das próximas 8 semanas e
                avalia, por função, se a equipe está adequada — indicando onde contratar, reduzir ou manter.
              </p>
            </div>
          </div>
          <Button onClick={gerar} disabled={mut.isPending} className="shrink-0">
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando… {Math.round(progresso)}%</> : <><Sparkles className="h-4 w-4 mr-2" /> {result ? "Refazer análise" : "Gerar análise"}</>}
          </Button>
        </div>
      </div>

      {restauradaEm && result && !mut.isPending && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 flex items-center gap-2">
          <Archive className="h-3.5 w-3.5 shrink-0" />
          <span>Análise salva exibida (gerada em {formatDateTime(restauradaEm)}). Toque em <strong>Refazer análise</strong> para atualizar.</span>
        </div>
      )}

      {mostrar && <PainelProgresso progresso={progresso} etapas={ETAPAS} titulo="Analisando efetivo × cronograma…" />}

      {recuperando && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 flex items-start gap-2">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
          <span>A conexão caiu, mas a análise pode ter sido concluída no servidor. Recuperando o resultado… aguarde alguns segundos.</span>
        </div>
      )}

      {mut.isError && !recuperando && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{msgErroIA(mut.error, "Erro ao gerar a análise.", "Toque em \u201CGerar análise\u201D novamente")}</span>
        </div>
      )}

      {!result && !mut.isPending && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <HardHat className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Clique em <strong>Gerar análise</strong> para a IA cruzar o efetivo da obra com o cronograma.</p>
        </div>
      )}

      {result && <DiagnosticoView result={result} />}

      <PerguntarIA projetoId={projetoId} companyId={companyId} />
    </div>
  );
}

// Render puro do resultado do diagnóstico — reusado pela aba e pelo histórico.
function DiagnosticoView({ result }: { result: any }) {
  const analise = result?.analise;
  const diag = DIAG_META[analise?.diagnostico] ?? DIAG_META.misto;
  const DiagIcon = diag.Icon;

  return (
    <div className="space-y-5">
      {/* Metadados */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
        {result.obra && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {result.obra}</span>}
        {result.revisao != null && <span>Revisão {result.revisao}</span>}
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {result.efetivoResumo?.total ?? 0} alocados · {result.efetivoResumo?.ativos ?? 0} ativos</span>
        <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {result.atividadesResumo?.emAndamento ?? 0} em andamento · {result.atividadesResumo?.proximas ?? 0} próximas</span>
        {result.geradoEm && <span>· gerado {formatDateTime(result.geradoEm)}</span>}
      </div>

      {result?.erroIa && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{result.erroIa}</span>
        </div>
      )}

      <LegendaAjuda />

      {Array.isArray(result?.porCargoAtual) && result.porCargoAtual.length > 0 && (
        <>
          <InsightsEfetivo result={result} />
          <PanoramaEfetivo porCargoAtual={result.porCargoAtual} />
        </>
      )}

      {analise && (
        <div className="space-y-5">
          <div className={`rounded-xl border p-5 ${diag.cls}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <DiagIcon className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{diag.label}</span>
            </div>
            {analise.tituloDiagnostico && <h3 className="text-lg font-semibold leading-snug">{analise.tituloDiagnostico}</h3>}
            {analise.resumoExecutivo && <p className="text-sm mt-1.5 opacity-90 leading-relaxed">{analise.resumoExecutivo}</p>}
          </div>

          <ReferenciaPrincipal ref0={analise.referenciaPrincipal} />

          {Array.isArray(analise.indicadores) && analise.indicadores.length > 0 && (
            <IndicadoresKPI indicadores={analise.indicadores} />
          )}

          {/* Gráficos: Atual × Sugerido + distribuição de ações */}
          <GraficosDiagnostico porCargo={analise.porCargo} />

          {Array.isArray(analise.porCargo) && analise.porCargo.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Recomendação por função</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-2 font-medium">Função</th>
                      <th className="px-4 py-2 font-medium">Categoria</th>
                      <th className="px-4 py-2 font-medium text-center">Atual</th>
                      <th className="px-4 py-2 font-medium text-center">Sugerido</th>
                      <th className="px-4 py-2 font-medium text-center">Δ</th>
                      <th className="px-4 py-2 font-medium">Ação</th>
                      <th className="px-4 py-2 font-medium">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.porCargo.map((c: CargoLinha, i: number) => {
                      const meta = ACAO_META[c.acao] ?? ACAO_META.manter;
                      const AcaoIcon = meta.Icon;
                      const delta = typeof c.delta === "number" ? c.delta : (c.recomendado - c.atual);
                      return (
                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{c.cargo}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{c.categoria || "—"}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700">{c.atual}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700 font-semibold">{c.recomendado}</td>
                          <td className={`px-4 py-2.5 text-center font-semibold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                              <AcaoIcon className="h-3 w-3" /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs max-w-md">{c.justificativa || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {Array.isArray(analise.atividadesCriticas) && analise.atividadesCriticas.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Frentes críticas para o dimensionamento</span>
              </div>
              <div className="space-y-2.5">
                {analise.atividadesCriticas.map((a: AtividadeCritica, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm font-medium text-slate-700">{a.atividade}</span>
                      {a.periodo && <span className="text-xs text-slate-400">{a.periodo}</span>}
                    </div>
                    {a.necessidade && <p className="text-xs text-slate-500 mt-1">{a.necessidade}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <ImpactoFerias impacto={analise.impactoFerias} />

          <RiscosRecomendacoes riscos={analise.riscos} recomendacoes={analise.recomendacoes} />

          <ReferenciasApoio referencias={analise.referencias} />
        </div>
      )}

      {!analise && result?.porCargoAtual?.length > 0 && (
        <EfetivoBruto porCargoAtual={result.porCargoAtual} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Modo SIMULADOR
 * ──────────────────────────────────────────────────────────────────────── */
function Simulador({ projetoId, companyId }: Props) {
  const efetivoQ = trpc.iaCronograma.efetivoAtual.useQuery({ projetoId, companyId });
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [result, setResult] = useState<any>(null);
  const [restauradaEm, setRestauradaEm] = useState<string | null>(null);
  // Restaura a última simulação salva ao reabrir a tela (antes se perdia).
  const ultimaQ = trpc.iaCronograma.ultimaAnaliseEfetivo.useQuery(
    { projetoId, companyId, tipo: "simulacao" },
    { staleTime: 60_000 },
  );
  // Restaura UMA vez no primeiro carregamento. Depois o usuário manda no estado
  // (simular/limpar não devem ser "revividos" pela query em cache).
  const restaurouRef = useRef(false);
  useEffect(() => {
    if (restaurouRef.current || ultimaQ.data === undefined) return;
    restaurouRef.current = true;
    if (!result && ultimaQ.data?.resultado) {
      setResult(ultimaQ.data.resultado);
      setRestauradaEm(ultimaQ.data.criadoEm ?? null);
    }
  }, [ultimaQ.data, result]);

  const mut = trpc.iaCronograma.simularEfetivo.useMutation({
    onSuccess: (d) => { setResult(d); setRestauradaEm(null); },
  });
  const { progresso, mostrar } = useProgressoSimulado(mut.isPending, mut.isSuccess);
  // Baseline da última simulação salva (capturada ao iniciar) p/ a recuperação
  // distinguir uma simulação NOVA (gravada pelo servidor) da já exibida.
  const baselineRef = useRef<string | null>(null);
  const recuperando = useRecuperarAposQueda({
    isError: mut.isError,
    error: mut.error,
    refetchUltima: () => ultimaQ.refetch(),
    baselineCriadoEm: () => baselineRef.current,
    onRecuperado: (r) => { setResult(r); setRestauradaEm(null); },
    resetMut: () => mut.reset(),
  });

  const porCargo: any[] = efetivoQ.data?.porCargoAtual ?? [];
  const keyOf = (cargo: string) => cargo.trim().toUpperCase();

  const setDelta = (cargo: string, d: number) =>
    setDeltas((prev) => ({ ...prev, [keyOf(cargo)]: d }));
  const bump = (cargo: string, atual: number, inc: number) => {
    const k = keyOf(cargo);
    const cur = deltas[k] ?? 0;
    const next = Math.max(-atual, cur + inc); // não deixa simulado < 0
    setDelta(cargo, next);
  };

  const ajustes = useMemo(
    () => porCargo
      .map((c) => ({ cargo: c.cargo, delta: deltas[keyOf(c.cargo)] ?? 0 }))
      .filter((a) => a.delta !== 0),
    [porCargo, deltas],
  );
  const totalAtual = useMemo(() => porCargo.reduce((s, c) => s + c.total, 0), [porCargo]);
  const totalSimulado = useMemo(
    () => porCargo.reduce((s, c) => s + Math.max(0, c.total + (deltas[keyOf(c.cargo)] ?? 0)), 0),
    [porCargo, deltas],
  );
  const deltaTotal = totalSimulado - totalAtual;

  const limpar = () => { setDeltas({}); setResult(null); setRestauradaEm(null); };
  const simular = async () => {
    if (ajustes.length === 0) return;
    // Baseline FRESCA (vê nota em `gerar`): evita falso positivo de recuperação
    // por cache defasado/null.
    try {
      const fresh = await ultimaQ.refetch();
      baselineRef.current = fresh.data?.criadoEm ?? null;
    } catch {
      baselineRef.current = ultimaQ.data?.criadoEm ?? null;
    }
    mut.mutate({ projetoId, companyId, ajustes });
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-violet-50/60 to-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-600/10 p-2.5">
            <Calculator className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">Simulador de Mão de Obra (IA)</h2>
            <p className="text-sm text-slate-500 max-w-2xl mt-0.5">
              Ajuste o efetivo por função (reduza ou aumente) e a IA projeta os impactos no
              prazo, produtividade, custo e qualidade — fundamentada nas melhores literaturas
              de gestão de obras (Lei de Brooks, curva de aprendizado, Linha de Balanço, overmanning/CII).
            </p>
          </div>
        </div>
        {efetivoQ.data && (
          <div className="flex items-center gap-4 flex-wrap mt-4 text-xs text-slate-500">
            {efetivoQ.data.obra && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {efetivoQ.data.obra}</span>}
            {efetivoQ.data.revisao != null && <span>Revisão {efetivoQ.data.revisao}</span>}
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {efetivoQ.data.efetivoResumo?.total ?? 0} alocados</span>
            <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {efetivoQ.data.atividadesResumo?.emAndamento ?? 0} em andamento · {efetivoQ.data.atividadesResumo?.proximas ?? 0} próximas</span>
          </div>
        )}
      </div>

      {/* Carregando efetivo */}
      {efetivoQ.isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" /> Carregando efetivo da obra…
        </div>
      )}
      {efetivoQ.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{(efetivoQ.error as any)?.message ?? "Erro ao carregar o efetivo."}</span>
        </div>
      )}

      {/* Editor de cenário */}
      {efetivoQ.data && porCargo.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <HardHat className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Nenhum funcionário alocado nesta obra para simular.</p>
        </div>
      )}

      {efetivoQ.data && porCargo.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-700 inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" /> Ajuste o efetivo por função
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Total <span className="font-semibold text-slate-700">{totalAtual}</span> →{" "}
                <span className="font-semibold text-violet-700">{totalSimulado}</span>{" "}
                <span className={`font-semibold ${deltaTotal > 0 ? "text-emerald-600" : deltaTotal < 0 ? "text-amber-600" : "text-slate-400"}`}>
                  ({deltaTotal > 0 ? `+${deltaTotal}` : deltaTotal})
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={limpar} disabled={ajustes.length === 0 && !result}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Limpar
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">Função</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium text-center">Atual</th>
                  <th className="px-4 py-2 font-medium text-center">Ajuste</th>
                  <th className="px-4 py-2 font-medium text-center">Simulado</th>
                  <th className="px-4 py-2 font-medium text-center">Δ</th>
                </tr>
              </thead>
              <tbody>
                {porCargo.map((c: any, i: number) => {
                  const k = keyOf(c.cargo);
                  const d = deltas[k] ?? 0;
                  const simulado = Math.max(0, c.total + d);
                  return (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{c.cargo}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{c.categoria || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-slate-700">{c.total}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => bump(c.cargo, c.total, -1)}
                            disabled={simulado <= 0}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <Input
                            type="number"
                            value={d}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setDelta(c.cargo, Math.max(-c.total, isNaN(v) ? 0 : v));
                            }}
                            className="h-7 w-14 text-center px-1 tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => bump(c.cargo, c.total, +1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-violet-700">{simulado}</td>
                      <td className={`px-4 py-2.5 text-center font-semibold ${d > 0 ? "text-emerald-600" : d < 0 ? "text-amber-600" : "text-slate-400"}`}>
                        {d > 0 ? `+${d}` : d}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-slate-400">
              {ajustes.length === 0 ? "Ajuste pelo menos uma função para simular." : `${ajustes.length} função(ões) ajustada(s).`}
            </span>
            <Button onClick={simular} disabled={mut.isPending || ajustes.length === 0} className="bg-violet-600 hover:bg-violet-700">
              {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Simulando… {Math.round(progresso)}%</> : <><Sparkles className="h-4 w-4 mr-2" /> Simular previsão</>}
            </Button>
          </div>
        </div>
      )}

      {restauradaEm && result && !mut.isPending && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 flex items-center gap-2">
          <Archive className="h-3.5 w-3.5 shrink-0" />
          <span>Última simulação salva exibida (gerada em {formatDateTime(restauradaEm)}). Ajuste o efetivo e toque em <strong>Simular previsão</strong> para uma nova.</span>
        </div>
      )}

      {mostrar && <PainelProgresso progresso={progresso} etapas={ETAPAS_SIM} titulo="Projetando o cenário…" />}

      {recuperando && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 flex items-start gap-2">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
          <span>A conexão caiu, mas a simulação pode ter sido concluída no servidor. Recuperando o resultado… aguarde alguns segundos.</span>
        </div>
      )}

      {mut.isError && !recuperando && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{msgErroIA(mut.error, "Erro ao gerar a simulação.", "Toque em \u201CSimular previsão\u201D novamente")}</span>
        </div>
      )}

      {result && <SimuladorView result={result} />}
    </div>
  );
}

// Render puro do resultado da simulação — reusado pela aba e pelo histórico.
function SimuladorView({ result }: { result: any }) {
  const prev = result?.previsao;
  const ver = VEREDITO_META[prev?.veredito] ?? VEREDITO_META.neutro;
  const VerIcon = ver.Icon;

  return (
    <div className="space-y-5">
      {result.obra && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {result.obra}</span>
          {result.revisao != null && <span>Revisão {result.revisao}</span>}
          {result.cenario && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {result.cenario.totalAtual} → {result.cenario.totalSimulado} ({result.cenario.deltaTotal > 0 ? "+" : ""}{result.cenario.deltaTotal})</span>}
          {result.geradoEm && <span>· gerado {formatDateTime(result.geradoEm)}</span>}
        </div>
      )}

      {result?.erroIa && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{result.erroIa}</span>
        </div>
      )}

      {prev && (
        <div className="space-y-5">
          <div className={`rounded-xl border p-5 ${ver.cls}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <VerIcon className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{ver.label}</span>
            </div>
            {prev.tituloCenario && <h3 className="text-lg font-semibold leading-snug">{prev.tituloCenario}</h3>}
            {prev.resumoExecutivo && <p className="text-sm mt-1.5 opacity-90 leading-relaxed">{prev.resumoExecutivo}</p>}
          </div>

          <ReferenciaPrincipal ref0={prev.referenciaPrincipal} />

          {/* Impactos */}
          {prev.impactos && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ImpactoCard titulo="Prazo" Icon={CalendarClock} imp={prev.impactos.prazo} />
              <ImpactoCard titulo="Produtividade" Icon={Activity} imp={prev.impactos.produtividade} />
              <ImpactoCard titulo="Custo" Icon={DollarSign} imp={prev.impactos.custo} />
              <ImpactoCard titulo="Qualidade & Segurança" Icon={ShieldCheck} imp={prev.impactos.qualidadeSeguranca} />
            </div>
          )}

          {/* Indicadores */}
          {Array.isArray(prev.indicadores) && prev.indicadores.length > 0 && (
            <IndicadoresKPI indicadores={prev.indicadores} />
          )}

          {/* Gráfico Atual × Simulado */}
          <GraficoAtualSimulado porCargo={prev.porCargo} />

          {/* Efeito por função */}
          {Array.isArray(prev.porCargo) && prev.porCargo.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Efeito por função no cenário</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-2 font-medium">Função</th>
                      <th className="px-4 py-2 font-medium text-center">Atual</th>
                      <th className="px-4 py-2 font-medium text-center">Simulado</th>
                      <th className="px-4 py-2 font-medium text-center">Δ</th>
                      <th className="px-4 py-2 font-medium">Efeito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prev.porCargo.map((c: any, i: number) => {
                      const delta = typeof c.delta === "number" ? c.delta : (c.simulado - c.atual);
                      return (
                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{c.cargo}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700">{c.atual}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700 font-semibold">{c.simulado}</td>
                          <td className={`px-4 py-2.5 text-center font-semibold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs max-w-md">{c.efeito || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <RiscosRecomendacoes riscos={prev.riscos} recomendacoes={prev.recomendacoes} />

          <PlanoAtaque plano={prev.planoAtaque} />

          <ReferenciasApoio referencias={prev.referencias} titulo="Fundamentação (literatura de gestão de obras)" />
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Modo HISTÓRICO — análises salvas
 * ──────────────────────────────────────────────────────────────────────── */
const TIPO_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  diagnostico: { label: "Diagnóstico", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Sparkles },
  simulacao:   { label: "Simulação",   cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: Calculator },
};

function Historico({ projetoId, companyId }: Props) {
  const listaQ = trpc.iaCronograma.listarAnalisesEfetivo.useQuery({ projetoId, companyId });
  const [abertaId, setAbertaId] = useState<number | null>(null);
  const detalheQ = trpc.iaCronograma.getAnaliseEfetivo.useQuery(
    { id: abertaId ?? 0, projetoId, companyId },
    { enabled: abertaId != null },
  );

  if (abertaId != null) {
    const reg: any = detalheQ.data;
    const resultado = reg?.resultado;
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setAbertaId(null)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar ao histórico
        </Button>
        {detalheQ.isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" /> Carregando análise…
          </div>
        )}
        {detalheQ.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{(detalheQ.error as any)?.message ?? "Erro ao carregar a análise."}</span>
          </div>
        )}
        {reg && resultado && (
          reg.tipo === "simulacao"
            ? <SimuladorView result={resultado} />
            : <DiagnosticoView result={resultado} />
        )}
        {reg && !resultado && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            Esta análise não tem detalhe salvo.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-600/10 p-2.5">
            <History className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">Histórico de análises</h2>
            <p className="text-sm text-slate-500 max-w-2xl mt-0.5">
              Todos os diagnósticos e simulações gerados ficam salvos aqui. Clique em uma análise para reabrir
              o resultado completo (indicadores, gráficos, recomendações e referência).
            </p>
          </div>
        </div>
      </div>

      {listaQ.isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" /> Carregando histórico…
        </div>
      )}
      {listaQ.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{(listaQ.error as any)?.message ?? "Erro ao carregar o histórico."}</span>
        </div>
      )}
      {listaQ.data && listaQ.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <History className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Nenhuma análise salva ainda. Gere um diagnóstico ou uma simulação para começar o histórico.</p>
        </div>
      )}
      {listaQ.data && listaQ.data.length > 0 && (
        <div className="space-y-2.5">
          {listaQ.data.map((a: any) => {
            const meta = TIPO_META[a.tipo] ?? TIPO_META.diagnostico;
            const TipoIcon = meta.Icon;
            return (
              <button
                key={a.id}
                onClick={() => setAbertaId(a.id)}
                className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0 ${meta.cls}`}>
                      <TipoIcon className="h-3 w-3" /> {meta.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 leading-snug">{a.titulo || "Análise de efetivo"}</p>
                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400 mt-1">
                        {a.obra && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {a.obra}</span>}
                        {a.revisaoNumero != null && <span>Rev. {a.revisaoNumero}</span>}
                        {a.criadoPor && <span>· {a.criadoPor}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <Clock className="h-3 w-3" /> {formatDateTime(a.criadoEm)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes compartilhados ─────────────────────────────────────── */

// Referência mais renomada do mundo no assunto (destaque em toda análise).
function ReferenciaPrincipal({ ref0 }: { ref0?: any }) {
  if (!ref0 || (!ref0.autor && !ref0.obra && !ref0.porque)) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
      <div className="flex items-center gap-2 mb-2">
        <Award className="h-4 w-4 text-amber-600" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Referência mais renomada no assunto</span>
      </div>
      <p className="text-base font-semibold text-slate-800 leading-snug">
        {ref0.obra || ref0.autor}
      </p>
      {(ref0.autor || ref0.ano) && (
        <p className="text-sm text-slate-500 mt-0.5">
          {ref0.autor}{ref0.autor && ref0.ano ? " · " : ""}{ref0.ano}
        </p>
      )}
      {ref0.porque && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{ref0.porque}</p>}
    </div>
  );
}

// Referências de apoio (literatura).
function ReferenciasApoio({ referencias, titulo }: { referencias?: any[]; titulo?: string }) {
  if (!Array.isArray(referencias) || referencias.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold text-slate-700">{titulo ?? "Outras referências de apoio"}</span>
      </div>
      <div className="space-y-2.5">
        {referencias.map((r: any, i: number) => (
          <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <p className="text-sm font-medium text-slate-700">{r.fonte}</p>
            {r.aplicacao && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{r.aplicacao}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// KPIs (indicadores) em cards.
function IndicadoresKPI({ indicadores }: { indicadores: Indicador[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {indicadores.map((ind: Indicador, i: number) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`h-2 w-2 rounded-full ${statusDot(ind.status)}`} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{ind.label}</span>
          </div>
          <div className="text-xl font-bold text-slate-800">{ind.valor}</div>
          {ind.descricao && <p className="text-xs text-slate-500 mt-1 leading-snug">{ind.descricao}</p>}
        </div>
      ))}
    </div>
  );
}

// Card que envolve um gráfico.
function GraficoCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-semibold text-slate-700">{titulo}</span>
      </div>
      {children}
    </div>
  );
}

// Gráficos do diagnóstico: barras Atual × Sugerido + pizza de distribuição de ações.
function GraficosDiagnostico({ porCargo }: { porCargo?: CargoLinha[] }) {
  const dados = useMemo(
    () => (Array.isArray(porCargo) ? porCargo : [])
      .map((c) => ({ cargo: c.cargo, atual: Number(c.atual) || 0, sugerido: Number(c.recomendado) || 0 }))
      .filter((c) => c.atual > 0 || c.sugerido > 0)
      .slice(0, 14),
    [porCargo],
  );
  const acoes = useMemo(() => {
    const cnt: Record<string, number> = { contratar: 0, reduzir: 0, manter: 0 };
    (Array.isArray(porCargo) ? porCargo : []).forEach((c) => {
      const a = (c.acao || "manter").toLowerCase();
      if (cnt[a] != null) cnt[a] += 1; else cnt.manter += 1;
    });
    return [
      { name: "Contratar", value: cnt.contratar, fill: "#10b981" },
      { name: "Reduzir",   value: cnt.reduzir,   fill: "#f59e0b" },
      { name: "Manter",    value: cnt.manter,    fill: "#94a3b8" },
    ].filter((s) => s.value > 0);
  }, [porCargo]);

  if (dados.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <GraficoCard titulo="Efetivo atual × sugerido por função">
          <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 34)}>
            <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis type="category" dataKey="cargo" width={120} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="atual" name="Atual" fill="#94a3b8" radius={[0, 3, 3, 0]} />
              <Bar dataKey="sugerido" name="Sugerido" fill="#3b82f6" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>
      </div>
      {acoes.length > 0 && (
        <GraficoCard titulo="Distribuição das indicações">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={acoes} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={44} paddingAngle={2} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false}>
                {acoes.map((s, i) => <Cell key={i} fill={s.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            </PieChart>
          </ResponsiveContainer>
        </GraficoCard>
      )}
    </div>
  );
}

// Gráfico do simulador: barras Atual × Simulado por função.
function GraficoAtualSimulado({ porCargo }: { porCargo?: any[] }) {
  const dados = useMemo(
    () => (Array.isArray(porCargo) ? porCargo : [])
      .map((c) => ({ cargo: c.cargo, atual: Number(c.atual) || 0, simulado: Number(c.simulado) || 0 }))
      .filter((c) => c.atual > 0 || c.simulado > 0)
      .slice(0, 14),
    [porCargo],
  );
  if (dados.length === 0) return null;
  return (
    <GraficoCard titulo="Efetivo atual × simulado por função">
      <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 34)}>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis type="category" dataKey="cargo" width={120} tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="atual" name="Atual" fill="#94a3b8" radius={[0, 3, 3, 0]} />
          <Bar dataKey="simulado" name="Simulado" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </GraficoCard>
  );
}

function ImpactoCard({ titulo, Icon, imp }: { titulo: string; Icon: React.ComponentType<{ className?: string }>; imp?: any }) {
  const st = IMPACTO_STATUS[imp?.status] ?? IMPACTO_STATUS.neutro;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</span>
        <span className={`ml-auto h-2 w-2 rounded-full ${st.dot}`} />
      </div>
      {imp?.estimativa && <div className={`text-base font-bold ${st.txt}`}>{imp.estimativa}</div>}
      <p className="text-xs text-slate-500 mt-1 leading-snug">{imp?.texto || "—"}</p>
    </div>
  );
}

function ImpactoFerias({ impacto }: { impacto?: any }) {
  if (!impacto || typeof impacto !== "object") return null;
  const itens = Array.isArray(impacto.itens) ? impacto.itens : [];
  if (!impacto.resumo && itens.length === 0) return null;
  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Umbrella className="h-4 w-4 text-cyan-600" />
        <span className="text-sm font-semibold text-slate-700">Impacto das férias no prazo</span>
      </div>
      {impacto.resumo && <p className="text-sm text-slate-600 mb-3 leading-relaxed">{impacto.resumo}</p>}
      {itens.length > 0 && (
        <div className="space-y-2">
          {itens.map((f: any, i: number) => (
            <div key={i} className="rounded-lg border border-cyan-100 bg-white p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-700">{f.funcionario}</span>
                {f.cargo && <span className="text-[11px] text-slate-400">{f.cargo}</span>}
                {f.periodo && (
                  <span title={f.inadiavel && f.motivoInadiavel ? f.motivoInadiavel : undefined} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${f.inadiavel ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
                    {f.periodo} período · {f.inadiavel ? "INADIÁVEL" : "remanejável"}
                  </span>
                )}
                {f.datas && <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{f.datas}</span>}
              </div>
              {f.inadiavel && f.motivoInadiavel && (
                <p className="text-[11px] text-rose-500 mt-1 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-px shrink-0" /><span><span className="font-medium">Por que é inadiável:</span> {f.motivoInadiavel}</span></p>
              )}
              {f.impacto && <p className="text-xs text-slate-500 mt-1">{f.impacto}</p>}
              {f.acao && <p className="text-xs text-cyan-700 mt-1.5 flex items-start gap-1"><ArrowUpRight className="h-3.5 w-3.5 mt-px shrink-0" />{f.acao}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RiscosRecomendacoes({ riscos, recomendacoes }: { riscos?: string[]; recomendacoes?: string[] }) {
  const temR = Array.isArray(riscos) && riscos.length > 0;
  const temRec = Array.isArray(recomendacoes) && recomendacoes.length > 0;
  if (!temR && !temRec) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {temR && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-slate-700">Riscos</span>
          </div>
          <ul className="space-y-2">
            {riscos!.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {temRec && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">Recomendações</span>
          </div>
          <ul className="space-y-2">
            {recomendacoes!.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * PLANO DE ATAQUE — campanha estilo guerra p/ manter o prazo com efetivo enxuto
 * (Linha de Balanço + estratégia militar + Teoria das Restrições)
 * ──────────────────────────────────────────────────────────────────────── */
const MANOBRA_TIPO_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  sequenciamento:       { label: "Sequenciamento",       cls: "bg-blue-50 text-blue-700 border-blue-200",       Icon: Route },
  processo_construtivo: { label: "Processo construtivo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Wrench },
  automacao:            { label: "Automação",            cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: Zap },
  logistica:            { label: "Logística",            cls: "bg-amber-50 text-amber-700 border-amber-200",    Icon: Layers },
  recurso:              { label: "Recurso",              cls: "bg-sky-50 text-sky-700 border-sky-200",          Icon: Users },
  contingencia:         { label: "Contingência",         cls: "bg-rose-50 text-rose-700 border-rose-200",       Icon: Siren },
};

const VEREDITO_PRAZO_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  mantem:            { label: "Prazo mantido",       cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30", Icon: CheckCircle2 },
  risco_parcial:     { label: "Risco parcial",       cls: "bg-amber-500/15 text-amber-300 border-amber-400/30",      Icon: AlertTriangle },
  inviavel_sem_acao: { label: "Inviável sem ação",   cls: "bg-rose-500/15 text-rose-300 border-rose-400/30",         Icon: AlertTriangle },
};

// Gráfico de Linha de Balanço (LOB) gerado pelo ERP a partir dos dados da IA.
// Eixo X = semanas; cada atividade é uma faixa diagonal (a "linha de produção")
// do início ao fim da sua janela — quanto mais inclinada, mais rápido o ritmo.
const LOB_CORES = ["#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c", "#22d3ee", "#a3e635", "#f87171", "#c084fc"];
function LinhaBalancoChart({ lob, atividades }: { lob: any; atividades: any[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const ativs = (atividades || [])
    .filter((a: any) => a && typeof a === "object")
    .map((a: any) => {
      const ini = Math.max(1, Math.round(Number(a.inicioSemana) || 1));
      const fimRaw = Math.round(Number(a.fimSemana) || ini);
      return { ...a, ini, fim: Math.max(ini, fimRaw) };
    });
  if (ativs.length === 0) return null;

  const WEEK_CAP = 40;
  const maxFim = ativs.reduce((m, a) => Math.max(m, a.fim), 1);
  const desejado = Math.max(Number(lob?.horizonteSemanas) || 0, maxFim, 1);
  const truncado = desejado > WEEK_CAP;
  const weeks = Math.min(WEEK_CAP, desejado);

  const labelW = 132;
  const colW = weeks > 18 ? 30 : 44;
  const rowH = 40;
  const headerH = 26;
  const footerH = 24;
  const width = labelW + weeks * colW + 12;
  const height = headerH + ativs.length * rowH + footerH;
  const stepLabel = weeks > 20 ? 4 : weeks > 12 ? 2 : 1;

  return (
    <div className="rounded-xl border border-sky-400/30 bg-slate-900/40 p-3.5">
      <div className="flex items-center gap-1.5 mb-1 text-sky-300 text-xs font-semibold uppercase tracking-wide">
        <BarChart3 className="h-3.5 w-3.5" /> Linha de Balanço {lob?.unidade ? `(${lob.unidade})` : ""}
      </div>
      <p className="text-[11px] text-slate-400 mb-1 leading-relaxed">
        Cada faixa é uma atividade ao longo das semanas{lob?.inicioRef ? ` (Semana 1 = ${lob.inicioRef})` : ""}. A inclinação representa o ritmo de produção; faixas que se sobrepõem no tempo são frentes em paralelo.
      </p>
      {lob?.leitura && <p className="text-[11px] text-slate-300 mb-2.5 leading-relaxed"><span className="text-sky-300 font-medium">Como ler: </span>{lob.leitura}</p>}
      {truncado && (
        <p className="text-[11px] text-amber-300 mb-2.5 leading-relaxed inline-flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
          <span>Horizonte de {desejado} semanas — o gráfico mostra as primeiras {weeks}. Veja o plano tático e o texto da Linha de Balanço para o restante.</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="min-w-full" role="img" aria-label="Gráfico de Linha de Balanço">
          {/* Gridlines de semana + cabeçalho */}
          {Array.from({ length: weeks }, (_, i) => {
            const w = i + 1;
            const x = labelW + i * colW;
            const showLabel = w === 1 || w % stepLabel === 0;
            return (
              <g key={`wk${w}`}>
                <line x1={x} y1={headerH} x2={x} y2={height - footerH} stroke="#ffffff14" strokeWidth={1} />
                {showLabel && <text x={x + colW / 2} y={headerH - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">S{w}</text>}
              </g>
            );
          })}
          <line x1={labelW + weeks * colW} y1={headerH} x2={labelW + weeks * colW} y2={height - footerH} stroke="#ffffff14" strokeWidth={1} />
          <line x1={labelW} y1={headerH} x2={labelW} y2={height - footerH} stroke="#ffffff33" strokeWidth={1} />

          {/* Faixas das atividades */}
          {ativs.map((a, i) => {
            const cor = LOB_CORES[i % LOB_CORES.length];
            const y0 = headerH + i * rowH;
            const top = y0 + 7;
            const bottom = y0 + rowH - 9;
            const iniClamp = Math.min(a.ini, weeks);
            const fimClamp = Math.min(a.fim, weeks);
            const xStart = labelW + (iniClamp - 1) * colW;
            const xEnd = labelW + fimClamp * colW;
            const bandW = Math.max(colW * 0.6, xEnd - xStart);
            const labelTxt = String(a.atividade ?? "");
            const labelShort = labelTxt.length > 20 ? labelTxt.slice(0, 19) + "…" : labelTxt;
            const ativo = sel === i;
            const apagado = sel !== null && !ativo;
            const op = apagado ? 0.18 : 1;
            return (
              <g key={`a${i}`} onClick={() => setSel(ativo ? null : i)} style={{ cursor: "pointer" }} opacity={op}>
                {/* faixa de fundo */}
                <rect x={xStart} y={top} width={bandW} height={bottom - top} rx={5} fill={cor} fillOpacity={ativo ? 0.28 : 0.16} stroke={cor} strokeOpacity={ativo ? 0.9 : 0.5} strokeWidth={ativo ? 2 : 1} />
                {/* linha de produção (diagonal) */}
                <line x1={xStart + 2} y1={bottom} x2={xStart + bandW - 2} y2={top} stroke={cor} strokeWidth={ativo ? 4 : 2.5} strokeLinecap="round" />
                <circle cx={xStart + 2} cy={bottom} r={ativo ? 4 : 3} fill={cor} />
                <circle cx={xStart + bandW - 2} cy={top} r={ativo ? 4 : 3} fill={cor} />
                {/* rótulo da atividade à esquerda */}
                <text x={6} y={(top + bottom) / 2 + 3} fontSize={11} fill="#e2e8f0" fontWeight={600}>{labelShort}</text>
                {/* ritmo/equipe sobre a faixa */}
                {a.ritmo && bandW > 70 && (
                  <text x={xStart + bandW / 2} y={(top + bottom) / 2 + 3} textAnchor="middle" fontSize={9.5} fill="#f1f5f9">{a.ritmo}</text>
                )}
                <title>{`${labelTxt} — S${a.ini} a S${a.fim}${a.ritmo ? ` · ${a.ritmo}` : ""}${a.equipe ? ` · ${a.equipe}` : ""}`}</title>
              </g>
            );
          })}
          <text x={labelW + (weeks * colW) / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">Semanas →</text>
        </svg>
      </div>
      {/* Legenda clicável equipe por atividade */}
      <p className="text-[10px] text-slate-500 mt-2.5 mb-1">Toque em uma atividade (na legenda ou no gráfico) para destacar a faixa; toque de novo para limpar.</p>
      <div className="flex flex-wrap gap-1.5">
        {ativs.map((a, i) => {
          const ativo = sel === i;
          const apagado = sel !== null && !ativo;
          return (
            <button
              type="button"
              key={i}
              onClick={() => setSel(ativo ? null : i)}
              className={`inline-flex items-center gap-1.5 text-[11px] rounded-md border px-2 py-1 transition ${ativo ? "border-sky-400/60 bg-sky-400/15 text-slate-100" : apagado ? "border-white/5 bg-white/[0.02] text-slate-500 opacity-60" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: LOB_CORES[i % LOB_CORES.length] }} />
              <span className="font-medium">{a.atividade}</span>
              {a.ritmo && <span className="text-slate-400">· {a.ritmo}</span>}
              {a.equipe && <span className="text-slate-400">· {a.equipe}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Badge de % de assertividade (verde ≥80 / âmbar 60-79 / vermelho <60). Tolerante
// a valores ausentes/fora de faixa — só renderiza com número válido.
function AssertBadge({ valor, titulo }: { valor: any; titulo?: string }) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const v = Math.max(0, Math.min(100, Math.round(n)));
  const cls = v >= 80
    ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/40"
    : v >= 60
    ? "bg-amber-400/15 text-amber-200 border-amber-400/40"
    : "bg-rose-400/15 text-rose-200 border-rose-400/40";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${cls}`} title={titulo}>
      <Gauge className="h-3 w-3" /> {v}%
    </span>
  );
}

// Linha de Balanço POR PAVIMENTO (LOB clássica): Y = pavimentos (base embaixo →
// topo em cima), X = semanas. Cada atividade vira uma faixa DIAGONAL ligando
// (pavInicio, semanaInicio) → (pavFim, semanaFim): a equipe "sobe" os pavimentos
// ao longo do tempo. Linhas paralelas = fluxo saudável; cruzamentos = colisão.
function LinhaBalancoPavimentoChart({ lob }: { lob: any }) {
  const [sel, setSel] = useState<number | null>(null);
  if (!lob || typeof lob !== "object") return null;
  const pavimentos = (Array.isArray(lob.pavimentos) ? lob.pavimentos : [])
    .filter((p: any) => typeof p === "string" && p.trim().length > 0)
    .map((p: string) => p.trim());
  const ativs = (Array.isArray(lob.atividades) ? lob.atividades : [])
    .filter((a: any) => a && typeof a === "object")
    .map((a: any) => {
      const pi = Math.round(Number(a.pavInicio) || 1);
      const pf = Math.round(Number(a.pavFim) || pi);
      const si = Math.max(1, Math.round(Number(a.semanaInicio) || 1));
      const sf = Math.round(Number(a.semanaFim) || si);
      return { ...a, pi, pf, si, sf: Math.max(si, sf) };
    });
  if (pavimentos.length === 0 || ativs.length === 0) return null;

  // PAV_CAP alto (cobre torres reais sem distorcer a geometria); só limita o caso
  // patológico. Atividades inteiramente ACIMA da janela visível são OMITIDAS (e
  // não clampadas no topo) para não colapsarem várias na mesma linha.
  const PAV_CAP = 60, WEEK_CAP = 40;
  const nPav = Math.min(PAV_CAP, pavimentos.length);
  const ativsVis = ativs.filter((a: any) => Math.min(a.pi, a.pf) <= nPav);
  if (ativsVis.length === 0) return null;
  const maxSem = ativsVis.reduce((m: number, a: any) => Math.max(m, a.sf), 1);
  const desejado = Math.max(Number(lob.horizonteSemanas) || 0, maxSem, 1);
  const truncadoSem = desejado > WEEK_CAP;
  const weeks = Math.min(WEEK_CAP, desejado);
  const truncadoPav = pavimentos.length > PAV_CAP;

  const labelW = 120, colW = weeks > 18 ? 28 : 40, rowH = 26, headerH = 26, footerH = 26;
  const width = labelW + weeks * colW + 12;
  const height = headerH + nPav * rowH + footerH;
  const stepLabel = weeks > 20 ? 4 : weeks > 12 ? 2 : 1;
  // Y do índice de pavimento (1-based, base→topo): base (1) fica EMBAIXO.
  const yPav = (idx: number) => headerH + (nPav - Math.max(1, Math.min(nPav, idx))) * rowH + rowH / 2;
  const xSem = (s: number) => labelW + (Math.max(1, Math.min(weeks, s)) - 1) * colW;

  return (
    <div className="rounded-xl border border-sky-400/30 bg-slate-900/40 p-3.5">
      <div className="flex items-center gap-1.5 mb-1 text-sky-300 text-xs font-semibold uppercase tracking-wide">
        <Layers className="h-3.5 w-3.5" /> Linha de Balanço por pavimento {lob.unidade ? `(${lob.unidade})` : ""}
      </div>
      <p className="text-[11px] text-slate-400 mb-1 leading-relaxed">
        Eixo vertical = pavimentos (base embaixo → topo em cima); eixo horizontal = semanas{lob.inicioRef ? ` (Semana 1 = ${lob.inicioRef})` : ""}. Cada linha diagonal é uma equipe subindo os pavimentos ao longo do tempo.
      </p>
      {lob.leitura && <p className="text-[11px] text-slate-300 mb-2 leading-relaxed"><span className="text-sky-300 font-medium">Como ler: </span>{lob.leitura}</p>}
      {(truncadoSem || truncadoPav) && (
        <p className="text-[11px] text-amber-300 mb-2 leading-relaxed inline-flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
          <span>{truncadoPav ? `${pavimentos.length} pavimentos — mostrando ${nPav}. ` : ""}{truncadoSem ? `Horizonte de ${desejado} semanas — mostrando as primeiras ${weeks}.` : ""}</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="min-w-full" role="img" aria-label="Linha de Balanço por pavimento">
          {/* Gridlines de semana + cabeçalho */}
          {Array.from({ length: weeks }, (_, i) => {
            const w = i + 1;
            const x = labelW + i * colW;
            const showLabel = w === 1 || w % stepLabel === 0;
            return (
              <g key={`wk${w}`}>
                <line x1={x} y1={headerH} x2={x} y2={height - footerH} stroke="#ffffff10" strokeWidth={1} />
                {showLabel && <text x={x + colW / 2} y={headerH - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">S{w}</text>}
              </g>
            );
          })}
          {/* Linhas de pavimento + rótulos */}
          {Array.from({ length: nPav }, (_, r) => {
            const idx = nPav - r; // r=0 é o topo
            const y = headerH + r * rowH + rowH / 2;
            const nome = pavimentos[idx - 1] ?? `Pav ${idx}`;
            const nomeShort = nome.length > 16 ? nome.slice(0, 15) + "…" : nome;
            return (
              <g key={`pav${idx}`}>
                <line x1={labelW} y1={y} x2={labelW + weeks * colW} y2={y} stroke="#ffffff0d" strokeWidth={1} />
                <text x={6} y={y + 3} fontSize={10.5} fill="#cbd5e1" fontWeight={600}>{nomeShort}</text>
                <title>{nome}</title>
              </g>
            );
          })}
          <line x1={labelW} y1={headerH} x2={labelW} y2={height - footerH} stroke="#ffffff33" strokeWidth={1} />

          {/* Faixas diagonais das atividades (equipe subindo os pavimentos) */}
          {ativsVis.map((a: any, i: number) => {
            const cor = LOB_CORES[i % LOB_CORES.length];
            const x1 = xSem(a.si), y1 = yPav(a.pi);
            const x2 = xSem(a.sf) + colW, y2 = yPav(a.pf);
            const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
            const labelTxt = String(a.atividade ?? "");
            const ativo = sel === i;
            const apagado = sel !== null && !ativo;
            const op = apagado ? 0.13 : ativo ? 1 : 0.9;
            const labelTxtCurto = labelTxt.length > 14 ? labelTxt.slice(0, 13) + "…" : labelTxt;
            return (
              <g key={`la${i}`} onClick={() => setSel(ativo ? null : i)} style={{ cursor: "pointer" }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={cor} strokeWidth={ativo ? 5 : 3} strokeLinecap="round" opacity={op} />
                <circle cx={x1} cy={y1} r={ativo ? 4.5 : 3.5} fill={cor} opacity={op} />
                <circle cx={x2} cy={y2} r={ativo ? 4.5 : 3.5} fill={cor} opacity={op} />
                {(ativo || (sel === null && Math.abs(x2 - x1) > 60)) && <text x={midX} y={midY - 4} textAnchor="middle" fontSize={ativo ? 10 : 9} fontWeight={ativo ? 700 : 400} fill="#e2e8f0" opacity={op}>{ativo ? labelTxt : labelTxtCurto}</text>}
                <title>{`${labelTxt} — Pav ${a.pi}→${a.pf} · S${a.si}→S${a.sf}${a.ritmo ? ` · ${a.ritmo}` : ""}${a.equipe ? ` · ${a.equipe}` : ""}`}</title>
              </g>
            );
          })}
          <text x={labelW + (weeks * colW) / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">Semanas →</text>
        </svg>
      </div>
      {/* Legenda clicável por atividade + assertividade */}
      <p className="text-[10px] text-slate-500 mt-2.5 mb-1">Toque em uma atividade (na legenda ou no gráfico) para destacar a linha; toque de novo para limpar.</p>
      <div className="flex flex-wrap gap-1.5">
        {ativsVis.map((a: any, i: number) => {
          const ativo = sel === i;
          const apagado = sel !== null && !ativo;
          return (
            <button
              type="button"
              key={i}
              onClick={() => setSel(ativo ? null : i)}
              className={`inline-flex items-center gap-1.5 text-[11px] rounded-md border px-2 py-1 transition ${ativo ? "border-sky-400/60 bg-sky-400/15 text-slate-100" : apagado ? "border-white/5 bg-white/[0.02] text-slate-500 opacity-60" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: LOB_CORES[i % LOB_CORES.length] }} />
              <span className="font-medium">{a.atividade}</span>
              {a.ritmo && <span className="text-slate-400">· {a.ritmo}</span>}
              {a.equipe && <span className="text-slate-400">· {a.equipe}</span>}
              <AssertBadge valor={a.assertividade} titulo="Assertividade da linha" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanoAtaque({ plano }: { plano: any }) {
  if (!plano || typeof plano !== "object") return null;
  const tatico = (Array.isArray(plano.planoTatico) ? plano.planoTatico : []).filter((x: any) => x && typeof x === "object");
  const guia = (Array.isArray(plano.guiaEstagiario) ? plano.guiaEstagiario : []).filter((x: any) => x && typeof x === "object");
  const lob = plano.linhaBalanco && typeof plano.linhaBalanco === "object" ? plano.linhaBalanco : null;
  const lobAtivs = (lob && Array.isArray(lob.atividades) ? lob.atividades : []).filter((x: any) => x && typeof x === "object");
  const lobPav = plano.linhaBalancoPavimentos && typeof plano.linhaBalancoPavimentos === "object" ? plano.linhaBalancoPavimentos : null;
  const lobPavAtivs = (lobPav && Array.isArray(lobPav.atividades) ? lobPav.atividades : []).filter((x: any) => x && typeof x === "object");
  // Rev. 2597 — Plano de Ataque enxuto: só Guia passo a passo + Plano Tático + Linha de Balanço.
  const temAlgo = plano.missao || tatico.length || guia.length || lobAtivs.length || lobPavAtivs.length;
  if (!temAlgo) return null;

  const ver = VEREDITO_PRAZO_META[plano.vereditoPrazo];

  return (
    <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 overflow-hidden shadow-sm">
      {/* Cabeçalho "sala de guerra" */}
      <div className="px-5 py-4 border-b border-white/10 flex items-start gap-3">
        <div className="rounded-lg bg-white/10 p-2.5 shrink-0">
          <Swords className="h-5 w-5 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold tracking-tight">Plano de Ataque</h3>
            {ver && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ver.cls}`}>
                <ver.Icon className="h-3 w-3" /> {ver.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Vencer a guerra com o efetivo que se tem — Linha de Balanço + estratégia + restrições</p>
          {plano.missao && <p className="text-sm text-slate-200 mt-2 leading-relaxed"><span className="text-amber-300 font-medium">Missão:</span> {plano.missao}</p>}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Guia do estagiário — porta de entrada didática */}
        {guia.length > 0 && (
          <div className="rounded-xl border border-teal-400/30 bg-teal-400/10 p-3.5">
            <div className="flex items-center gap-1.5 mb-1 text-teal-300 text-xs font-semibold uppercase tracking-wide">
              <GraduationCap className="h-3.5 w-3.5" /> Guia passo a passo — até um estagiário consegue seguir
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Roteiro simples para conduzir a análise e tocar o plano. Siga na ordem e confira cada passo antes de ir para o próximo.
            </p>
            <ol className="space-y-2">
              {guia.map((g: any, i: number) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-teal-300 text-slate-900 text-xs font-bold shrink-0 mt-0.5">{g.passo ?? i + 1}</span>
                  <div className="min-w-0">
                    {g.titulo && <p className="text-sm font-semibold text-slate-100 leading-snug">{g.titulo}</p>}
                    {g.oQueFazer && <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{g.oQueFazer}</p>}
                    {g.comoConferir && <p className="text-[11px] text-teal-200 mt-1 flex items-start gap-1"><CheckCircle2 className="h-3 w-3 mt-px shrink-0" /><span>Como conferir: {g.comoConferir}</span></p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* PLANO TÁTICO — alocação por ATIVIDADE do cronograma */}
        {tatico.length > 0 && (
          <div className="rounded-xl border border-indigo-400/30 bg-slate-900/40 p-3.5">
            <div className="flex items-center gap-1.5 mb-1 text-indigo-300 text-xs font-semibold uppercase tracking-wide">
              <ClipboardList className="h-3.5 w-3.5" /> Plano tático — quem faz cada atividade
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Desce ao nível da atividade do cronograma: a equipe alocada, a meta, o ritmo, como fazer no canteiro e como conferir se está no rumo.
            </p>
            <div className="space-y-3">
              {tatico.map((t: any, i: number) => {
                const equipe = (Array.isArray(t.equipe) ? t.equipe : []).filter((x: any) => x && typeof x === "object");
                const total = t.totalPessoas ?? equipe.reduce((s: number, e: any) => s + (Number(e.qtd) || 0), 0);
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 leading-snug">{t.atividade}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                          {t.frente && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{t.frente}</span>}
                          {t.periodo && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{t.periodo}</span>}
                          {t.ritmo && <span className="inline-flex items-center gap-1 text-sky-300"><BarChart3 className="h-3 w-3" />{t.ritmo}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <AssertBadge valor={t.assertividade} titulo={t.baseAssertividade || "Assertividade"} />
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-300 text-slate-900 px-2 py-0.5 text-[11px] font-bold">
                          <Users className="h-3 w-3" /> {total}
                        </span>
                      </div>
                    </div>

                    {t.meta && <p className="text-xs text-slate-300 mt-2 leading-relaxed"><span className="text-emerald-300 font-medium">Meta: </span>{t.meta}</p>}

                    {equipe.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {equipe.map((e: any, j: number) => (
                          <span key={j} className="inline-flex items-center gap-1 rounded-md bg-slate-700/70 px-2 py-0.5 text-[11px] text-slate-100">
                            <span className="font-bold text-indigo-200">{e.qtd}</span> {e.cargo}
                          </span>
                        ))}
                      </div>
                    )}

                    {t.comoFazer && <p className="text-xs text-slate-300 mt-2.5 leading-relaxed"><span className="text-slate-100 font-medium">Como fazer: </span>{t.comoFazer}</p>}
                    {t.porQue && <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed"><span className="text-slate-300 font-medium">Por quê: </span>{t.porQue}</p>}
                    {t.checagem && <p className="text-[11px] text-emerald-300 mt-1.5 flex items-start gap-1"><CheckCircle2 className="h-3 w-3 mt-px shrink-0" /><span>Checagem: {t.checagem}</span></p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Linha de Balanço por pavimento — LOB dinâmica gerada pelo ERP */}
        {lobPavAtivs.length > 0 && <LinhaBalancoPavimentoChart lob={lobPav} />}

        {/* Linha de Balanço — gráfico gerado pelo ERP */}
        {lobAtivs.length > 0 && <LinhaBalancoChart lob={lob} atividades={lobAtivs} />}

      </div>
    </div>
  );
}

/* ── Legenda interativa: "Como ler esta análise" (colapsável) ───────────── */
const LEGENDA_ITENS: { t: string; d: string }[] = [
  { t: "Atual × Sugerido", d: '"Atual" é quem está alocado hoje; "Sugerido" é o que a IA recomenda para dar conta do cronograma.' },
  { t: "Δ (delta)", d: "Diferença Sugerido − Atual. Positivo (verde) = falta gente; negativo (âmbar) = há folga." },
  { t: "Contratar / Reduzir / Manter", d: "Ação recomendada por função, considerando as frentes em andamento e das próximas 8 semanas." },
  { t: "Categoria", d: "Direto = mão de obra de produção; Indireto = apoio (engenharia, encarregado, almoxarife, administrativo)." },
  { t: "Disponibilidade", d: "Ativos x indisponíveis (férias, aviso, afastados). Indisponível não produz, mesmo alocado." },
  { t: "Indicadores (KPIs)", d: "Cartões-resumo da saúde do efetivo. Verde = ok, âmbar = atenção, vermelho = crítico." },
];

function LegendaAjuda() {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-700 inline-flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-blue-500" /> Como ler esta análise
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LEGENDA_ITENS.map((it, i) => (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold text-slate-700">{it.t}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{it.d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── "Pergunte à IA" — Q&A em linguagem natural sobre o efetivo × cronograma ─ */
const SUGESTOES_QA = [
  "Posso reduzir efetivo sem impactar o prazo?",
  "Qual função é o maior gargalo agora?",
  "O efetivo está adequado para as próximas semanas?",
  "Onde devo contratar primeiro e por quê?",
];

function PerguntarIA({ projetoId, companyId }: Props) {
  const [pergunta, setPergunta] = useState("");
  const [chat, setChat] = useState<{ q: string; a: string; erro?: string | null }[]>([]);
  const fimRef = useRef<HTMLDivElement | null>(null);

  const mut = trpc.iaCronograma.perguntarEfetivo.useMutation({
    onSuccess: (d: any, vars: any) =>
      setChat((c) => [...c, { q: vars.pergunta, a: d.resposta, erro: d.erroIa }]),
    onError: (e: any, vars: any) =>
      setChat((c) => [...c, { q: vars.pergunta, a: "", erro: msgErroIA(e, "Erro ao responder.", "Envie a pergunta novamente") }]),
  });

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat.length, mut.isPending]);

  const enviar = (q?: string) => {
    const p = (q ?? pergunta).trim();
    if (!p || mut.isPending) return;
    setPergunta("");
    mut.mutate({ projetoId, companyId, pergunta: p });
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/70 to-white p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="rounded-lg bg-blue-600/10 p-2.5">
          <HelpCircle className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800">Tire suas dúvidas com a IA</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Pergunte em linguagem natural sobre o efetivo e o cronograma desta obra — a IA responde com base nos dados reais.
          </p>
        </div>
      </div>

      {chat.length > 0 && (
        <div className="space-y-3 mb-3 max-h-96 overflow-y-auto pr-1">
          {chat.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-end">
                <div className="rounded-2xl rounded-br-sm bg-blue-600 text-white text-sm px-3.5 py-2 max-w-[85%] leading-snug">
                  {m.q}
                </div>
              </div>
              <div className="flex justify-start">
                <div className={`rounded-2xl rounded-bl-sm border text-sm px-3.5 py-2 max-w-[90%] leading-relaxed whitespace-pre-wrap ${
                  m.erro ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"
                }`}>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-500 mb-1">
                    <Sparkles className="h-3 w-3" /> JULINHO (IA)
                  </span>
                  <div>{m.erro ? m.erro : m.a}</div>
                </div>
              </div>
            </div>
          ))}
          {mut.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-sm px-3.5 py-2 text-slate-400 inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
              </div>
            </div>
          )}
          <div ref={fimRef} />
        </div>
      )}

      {chat.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGESTOES_QA.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => enviar(s)}
              disabled={mut.isPending}
              className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
          placeholder="Ex.: dá pra remanejar serventes entre as frentes?"
          disabled={mut.isPending}
          className="flex-1"
        />
        <Button onClick={() => enviar()} disabled={mut.isPending || !pergunta.trim()} className="shrink-0">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

/* ── Donut reutilizável com legenda lateral (valor + %) ─────────────────── */
function DonutCard({
  titulo, Icon, segs,
}: { titulo: string; Icon: React.ComponentType<{ className?: string }>; segs: { name: string; value: number; fill: string }[] }) {
  const segsF = segs.filter((s) => s.value > 0);
  const total = segsF.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">{titulo}</span>
      </div>
      {total === 0 ? (
        <div className="text-xs text-slate-400 text-center py-12">Sem dados</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={segsF} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={66} innerRadius={40} paddingAngle={2}>
                {segsF.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(v: any, n: any) => [`${v} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1.5 space-y-1">
            {segsF.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.fill }} /> {s.name}
                </span>
                <span className="font-semibold text-slate-700 tabular-nums">{s.value} · {Math.round((s.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Panorama do efetivo: donuts (categoria/disponibilidade/vínculo) + top funções
 *    Calculado 100% no client a partir do efetivo bruto (sem IA). ──────────── */
const CAT_COLORS: Record<string, string> = {
  "Direto": "#3b82f6",
  "Indireto (obra)": "#f59e0b",
  "Indireto (escritório)": "#8b5cf6",
  "—": "#cbd5e1",
};

function PanoramaEfetivo({ porCargoAtual }: { porCargoAtual: any[] }) {
  const dados = Array.isArray(porCargoAtual) ? porCargoAtual : [];
  const agg = useMemo(() => {
    const sum = (f: (c: any) => number) => dados.reduce((s, c) => s + (Number(f(c)) || 0), 0);
    const catAgg: Record<string, number> = {};
    dados.forEach((c) => {
      const k = c.categoria || "—";
      catAgg[k] = (catAgg[k] || 0) + (Number(c.total) || 0);
    });
    const catSegs = Object.entries(catAgg)
      .map(([name, value]) => ({ name, value, fill: CAT_COLORS[name] ?? "#94a3b8" }))
      .sort((a, b) => b.value - a.value);
    const topFuncoes = [...dados]
      .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
      .slice(0, 8)
      .map((c) => ({ cargo: c.cargo, total: Number(c.total) || 0 }))
      .filter((c) => c.total > 0);
    return {
      catSegs,
      ativos: sum((c) => c.ativos),
      indisp: sum((c) => c.indisponiveis),
      clt: sum((c) => c.clt),
      terc: sum((c) => c.terceiro),
      topFuncoes,
    };
  }, [dados]);

  if (dados.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-semibold text-slate-700">Panorama do efetivo</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutCard titulo="Composição por categoria" Icon={Layers} segs={agg.catSegs} />
        <DonutCard
          titulo="Disponibilidade"
          Icon={UserCheck}
          segs={[
            { name: "Ativos", value: agg.ativos, fill: "#10b981" },
            { name: "Indisponíveis", value: agg.indisp, fill: "#f43f5e" },
          ]}
        />
        <DonutCard
          titulo="Vínculo"
          Icon={Briefcase}
          segs={[
            { name: "CLT", value: agg.clt, fill: "#0ea5e9" },
            { name: "Terceiros", value: agg.terc, fill: "#f59e0b" },
          ]}
        />
      </div>
      {agg.topFuncoes.length > 0 && (
        <GraficoCard titulo="Top funções por efetivo (atual)">
          <ResponsiveContainer width="100%" height={Math.max(180, agg.topFuncoes.length * 32)}>
            <BarChart data={agg.topFuncoes} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis type="category" dataKey="cargo" width={130} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Bar dataKey="total" name="Efetivo" fill="#6366f1" radius={[0, 3, 3, 0]} label={{ position: "right", fontSize: 11, fill: "#475569" }} />
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>
      )}
    </div>
  );
}

/* ── Cards de insight (derivados do efetivo + do diagnóstico da IA) ──────── */
const TOM_INSIGHT: Record<string, { bg: string; border: string; iconBg: string; iconTxt: string }> = {
  positivo: { bg: "bg-emerald-50/60", border: "border-emerald-200", iconBg: "bg-emerald-100", iconTxt: "text-emerald-600" },
  alerta:   { bg: "bg-amber-50/60",   border: "border-amber-200",   iconBg: "bg-amber-100",   iconTxt: "text-amber-600" },
  info:     { bg: "bg-blue-50/60",    border: "border-blue-200",    iconBg: "bg-blue-100",    iconTxt: "text-blue-600" },
  neutro:   { bg: "bg-white",         border: "border-slate-200",   iconBg: "bg-slate-100",   iconTxt: "text-slate-500" },
};

function InsightCard({
  Icon, tom, titulo, valor, sub,
}: { Icon: React.ComponentType<{ className?: string }>; tom: keyof typeof TOM_INSIGHT; titulo: string; valor: string; sub?: string }) {
  const t = TOM_INSIGHT[tom] ?? TOM_INSIGHT.neutro;
  return (
    <div className={`rounded-xl border p-4 ${t.border} ${t.bg}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`rounded-lg p-1.5 ${t.iconBg}`}><Icon className={`h-4 w-4 ${t.iconTxt}`} /></div>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</span>
      </div>
      <div className="text-base font-bold text-slate-800 leading-tight">{valor}</div>
      {sub && <p className="text-xs text-slate-500 mt-1 leading-snug">{sub}</p>}
    </div>
  );
}

function InsightsEfetivo({ result }: { result: any }) {
  const dados: any[] = Array.isArray(result?.porCargoAtual) ? result.porCargoAtual : [];
  const analisePC: any[] = Array.isArray(result?.analise?.porCargo) ? result.analise.porCargo : [];
  const resumo = result?.efetivoResumo ?? {};
  if (dados.length === 0) return null;

  const total = Number(resumo.total) || dados.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const indisp = Number(resumo.indisponiveis) || dados.reduce((s, c) => s + (Number(c.indisponiveis) || 0), 0);
  const pctIndisp = total ? Math.round((indisp / total) * 100) : 0;
  const maisNumerosa = [...dados].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))[0];
  const pctTop = total && maisNumerosa ? Math.round(((Number(maisNumerosa.total) || 0) / total) * 100) : 0;

  const gargalo = [...analisePC].filter((c) => (Number(c.delta) || 0) > 0).sort((a, b) => (Number(b.delta) || 0) - (Number(a.delta) || 0))[0];
  const folga = [...analisePC].filter((c) => (Number(c.delta) || 0) < 0).sort((a, b) => (Number(a.delta) || 0) - (Number(b.delta) || 0))[0];
  const nContratar = analisePC.filter((c) => c.acao === "contratar").length;
  const nReduzir = analisePC.filter((c) => c.acao === "reduzir").length;
  const nManter = Math.max(0, analisePC.length - nContratar - nReduzir);

  const cards: { Icon: any; tom: keyof typeof TOM_INSIGHT; titulo: string; valor: string; sub?: string }[] = [];
  if (maisNumerosa) {
    cards.push({ Icon: Trophy, tom: "info", titulo: "Função mais numerosa", valor: maisNumerosa.cargo, sub: `${maisNumerosa.total} pessoa(s) · ${pctTop}% do efetivo` });
  }
  cards.push({ Icon: Gauge, tom: pctIndisp >= 10 ? "alerta" : "positivo", titulo: "Disponibilidade", valor: `${100 - pctIndisp}% ativos`, sub: `${indisp} indisponível(is) de ${total} alocado(s)` });
  cards.push({ Icon: Layers, tom: "neutro", titulo: "Funções distintas", valor: String(dados.length), sub: "categorias de mão de obra na obra" });
  if (gargalo) {
    cards.push({ Icon: TrendingUp, tom: "alerta", titulo: "Maior gargalo", valor: `${gargalo.cargo} +${gargalo.delta}`, sub: gargalo.justificativa || "Reforço recomendado para o cronograma" });
  }
  if (folga) {
    cards.push({ Icon: TrendingDown, tom: "positivo", titulo: "Maior folga", valor: `${folga.cargo} ${folga.delta}`, sub: folga.justificativa || "Possível redução ou realocação" });
  }
  if (analisePC.length > 0) {
    cards.push({ Icon: GitCompareArrows, tom: "neutro", titulo: "Ações sugeridas", valor: `${nContratar} contratar · ${nReduzir} reduzir`, sub: `${nManter} função(ões) a manter` });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-700">Insights rápidos</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c, i) => <InsightCard key={i} {...c} />)}
      </div>
    </div>
  );
}

function EfetivoBruto({ porCargoAtual }: { porCargoAtual: any[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Efetivo atual por função</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2 font-medium">Função</th>
              <th className="px-4 py-2 font-medium">Categoria</th>
              <th className="px-4 py-2 font-medium text-center">Total</th>
              <th className="px-4 py-2 font-medium text-center">Ativos</th>
            </tr>
          </thead>
          <tbody>
            {porCargoAtual.map((c: any, i: number) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-700">{c.cargo}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{c.categoria || "—"}</td>
                <td className="px-4 py-2.5 text-center text-slate-700">{c.total}</td>
                <td className="px-4 py-2.5 text-center text-slate-700">{c.ativos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
