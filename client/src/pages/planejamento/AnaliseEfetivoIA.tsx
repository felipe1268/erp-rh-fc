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
          if (p >= 95) return 95;
          const passo = p < 45 ? 3.2 : p < 70 ? 1.6 : p < 88 ? 0.9 : 0.4;
          return Math.min(95, +(p + passo).toFixed(1));
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
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
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
  const mut = trpc.iaCronograma.analisarEfetivo.useMutation({
    onSuccess: (d) => setResult(d),
  });
  const { progresso, mostrar } = useProgressoSimulado(mut.isPending, mut.isSuccess);

  const gerar = () => mut.mutate({ projetoId, companyId });
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
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…</> : <><Sparkles className="h-4 w-4 mr-2" /> {result ? "Refazer análise" : "Gerar análise"}</>}
          </Button>
        </div>
      </div>

      {mostrar && <PainelProgresso progresso={progresso} etapas={ETAPAS} titulo="Analisando efetivo × cronograma…" />}

      {mut.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{(mut.error as any)?.message ?? "Erro ao gerar a análise."}</span>
        </div>
      )}

      {!result && !mut.isPending && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <HardHat className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Clique em <strong>Gerar análise</strong> para a IA cruzar o efetivo da obra com o cronograma.</p>
        </div>
      )}

      {result && <DiagnosticoView result={result} />}
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

  const mut = trpc.iaCronograma.simularEfetivo.useMutation({
    onSuccess: (d) => setResult(d),
  });
  const { progresso, mostrar } = useProgressoSimulado(mut.isPending, mut.isSuccess);

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

  const limpar = () => { setDeltas({}); setResult(null); };
  const simular = () => {
    if (ajustes.length === 0) return;
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
              {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Simulando…</> : <><Sparkles className="h-4 w-4 mr-2" /> Simular previsão</>}
            </Button>
          </div>
        </div>
      )}

      {mostrar && <PainelProgresso progresso={progresso} etapas={ETAPAS_SIM} titulo="Projetando o cenário…" />}

      {mut.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{(mut.error as any)?.message ?? "Erro ao gerar a simulação."}</span>
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
    { id: abertaId ?? 0, companyId },
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
