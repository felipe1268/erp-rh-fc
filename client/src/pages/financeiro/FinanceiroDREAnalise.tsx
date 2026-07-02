import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  ArrowLeft, Sparkles, RefreshCw, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Minus, ShieldCheck, Lightbulb,
  Target, BookOpen, Zap, Activity, BarChart2, ChevronRight,
  ChevronDown, ExternalLink, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

const NAVY = "#1B2A4A";
const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function fBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}
function fPct(v: number, d = 1) { return `${(v ?? 0).toFixed(d)}%`; }
function signCls(v: number) {
  if (!v) return "text-gray-500";
  return v > 0 ? "text-emerald-600" : "text-red-600";
}

type Sel =
  | { tipo: "mensal"; mes: number }
  | { tipo: "trimestral"; tri: number }
  | { tipo: "semestral"; sem: number }
  | { tipo: "anual" };

function selToPeriodo(sel: Sel, ano: number): string {
  if (sel.tipo === "mensal") return `${ano}-${String(sel.mes).padStart(2, "0")}`;
  if (sel.tipo === "trimestral") {
    const m = (sel.tri - 1) * 3 + 1;
    return `${ano}-T${sel.tri}-${String(m).padStart(2, "0")}`;
  }
  if (sel.tipo === "semestral") return `${ano}-S${sel.sem}`;
  return `${ano}`;
}
function selToTipo(sel: Sel) { return sel.tipo; }
function selToLabel(sel: Sel, ano: number): string {
  if (sel.tipo === "mensal") return `${MESES_PT[(sel.mes ?? 1) - 1]}/${ano}`;
  if (sel.tipo === "trimestral") return `${sel.tri}º Trimestre/${ano}`;
  if (sel.tipo === "semestral") return `${sel.sem}º Semestre/${ano}`;
  return `Ano ${ano}`;
}

// Lê params da URL (?ano=X&mes=Y&tipo=Z)
function parseUrlSel(): { ano: number; sel: Sel } {
  const p = new URLSearchParams(window.location.search);
  const ano = parseInt(p.get("ano") ?? String(new Date().getFullYear()), 10);
  const tipo = p.get("tipo") ?? "mensal";
  if (tipo === "trimestral") return { ano, sel: { tipo: "trimestral", tri: parseInt(p.get("tri") ?? "1", 10) } };
  if (tipo === "semestral") return { ano, sel: { tipo: "semestral", sem: parseInt(p.get("sem") ?? "1", 10) } };
  if (tipo === "anual") return { ano, sel: { tipo: "anual" } };
  return { ano, sel: { tipo: "mensal", mes: parseInt(p.get("mes") ?? String(new Date().getMonth() + 1), 10) } };
}

const saudeMap: Record<string, { label: string; cls: string; dot: string; barCls: string }> = {
  excelente: { label: "Excelente", cls: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500", barCls: "bg-emerald-500" },
  boa:       { label: "Boa",       cls: "bg-blue-50 border-blue-200 text-blue-700",          dot: "bg-blue-500",    barCls: "bg-blue-500" },
  atencao:   { label: "Atenção",   cls: "bg-amber-50 border-amber-200 text-amber-700",        dot: "bg-amber-500",   barCls: "bg-amber-500" },
  critica:   { label: "Crítica",   cls: "bg-red-50 border-red-200 text-red-700",              dot: "bg-red-500",     barCls: "bg-red-500" },
};
const sevMap: Record<string, string> = {
  alta:  "bg-red-50 border-red-200 text-red-700",
  media: "bg-amber-50 border-amber-200 text-amber-700",
  baixa: "bg-gray-50 border-gray-200 text-gray-600",
};
const statusInd: Record<string, { txt: string; cls: string; Icon: any }> = {
  acima:  { txt: "Acima",  cls: "bg-emerald-50 border-emerald-200 text-emerald-700", Icon: TrendingUp },
  dentro: { txt: "OK",     cls: "bg-blue-50 border-blue-200 text-blue-700",          Icon: CheckCircle2 },
  abaixo: { txt: "Abaixo", cls: "bg-red-50 border-red-200 text-red-700",             Icon: TrendingDown },
};
function notaCor(n: number) {
  if (n >= 85) return "#059669";
  if (n >= 60) return "#2563eb";
  if (n >= 40) return "#d97706";
  return "#dc2626";
}

const IA_FASES = [
  { label: "Lendo os números do DRE",     ate: 18 },
  { label: "Calculando Pareto de custos", ate: 38 },
  { label: "Comparando com benchmarks",   ate: 58 },
  { label: "Elaborando plano de ação",    ate: 78 },
  { label: "Redigindo o diagnóstico",     ate: 95 },
];

function FonteChip({ fonte }: { fonte: any }) {
  return (
    <a
      href={fonte.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
    >
      <BookOpen className="w-2.5 h-2.5 shrink-0" />
      {fonte.titulo?.split("—")[0]?.trim() || fonte.titulo}
      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
    </a>
  );
}

function FonteChips({ ids, map }: { ids: string[]; map: Record<string, any> }) {
  if (!ids?.length) return null;
  const valid = ids.filter((id) => map[id]);
  if (!valid.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {valid.map((id) => <FonteChip key={id} fonte={map[id]} />)}
    </div>
  );
}

// Pareto chart custom tooltip
function ParetoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-lg px-3 py-2.5 text-xs max-w-[220px]">
      <p className="font-semibold text-gray-900 mb-1">{d.conta}</p>
      <p className="text-gray-600">% Receita: <span className="font-bold text-gray-800">{d.pctReceita?.toFixed(1)}%</span></p>
      <p className="text-gray-600">% Custo total: <span className="font-bold text-gray-800">{d.pctCustoTotal?.toFixed(1)}%</span></p>
      <p className="text-gray-600">Valor: <span className="font-bold text-gray-800">{fBRL(d.valor)}</span></p>
      <p className="text-gray-600">Acumulado: <span className={`font-bold ${d.pctAcumulado >= 80 ? "text-amber-600" : "text-gray-800"}`}>{d.pctAcumulado?.toFixed(0)}%</span></p>
    </div>
  );
}

export default function FinanceiroDREAnalise() {
  const { companyId } = useCompany();
  const [, navigate] = useLocation();

  const { ano: urlAno, sel: urlSel } = parseUrlSel();
  const [ano, setAno] = useState(urlAno);
  const [sel, setSel] = useState<Sel>(urlSel);
  const periodo = selToPeriodo(sel, ano);
  const tipoPeriodo = selToTipo(sel);
  const titulo = selToLabel(sel, ano);

  // Análise salva
  const analiseSalvaQ = (trpc as any).financial.getAnaliseDRESalva.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );
  const analiseSalva = analiseSalvaQ.data;
  const analiseSalvaEm = (analiseSalva as any)?.geradoEm;

  // Mutation
  const analiseMut = (trpc as any).financial.analiseDRE.useMutation();

  // Progresso animado
  const [progresso, setProgresso] = useState(0);
  const [fase, setFase] = useState(IA_FASES[0]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!analiseMut.isPending) return;
    setProgresso(0);
    timerRef.current = setInterval(() => {
      setProgresso((p) => {
        const next = p + (0.25 * (1 - p / 96));
        const f = IA_FASES.find((f) => next < f.ate) ?? IA_FASES[IA_FASES.length - 1];
        setFase(f);
        return Math.min(next, 95);
      });
    }, 300);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [analiseMut.isPending]);

  useEffect(() => {
    if (!analiseMut.isSuccess) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setProgresso(100);
    setTimeout(() => setProgresso(0), 1200);
  }, [analiseMut.isSuccess]);

  useEffect(() => {
    if (analiseMut.isError) { if (timerRef.current) clearInterval(timerRef.current); setProgresso(0); }
  }, [analiseMut.isError]);

  const mutVars: any = (analiseMut as any).variables;
  const mutMatchesPeriodo = !!analiseMut.data
    && mutVars?.periodo === periodo
    && mutVars?.tipoPeriodo === tipoPeriodo;
  const analise = mutMatchesPeriodo ? analiseMut.data : (analiseSalva ?? undefined);
  const nota: number | null = analise?.nota ?? null;
  const fontesMap: Record<string, any> = {};
  (analise?.fontes ?? []).forEach((f: any) => { fontesMap[f.id] = f; });

  const analiseDesatualizada = !!analise && (analise as any).periodo !== periodo;

  function gerarAnalise() {
    analiseMut.mutate({ companyId, periodo, tipoPeriodo }, {
      onSuccess: () => analiseSalvaQ.refetch(),
    });
  }

  // Pareto chart data (top 12)
  const paretoData = (analise?.paretoCustos ?? []).slice(0, 12).map((item: any) => ({
    ...item,
    conta: item.conta?.length > 20 ? item.conta.slice(0, 19) + "…" : item.conta,
    contaFull: item.conta,
    fill: item.categoria === "custo_obra" ? "#ef4444"
        : item.categoria === "despesa_fixa" ? "#f59e0b"
        : "#6366f1",
  }));

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50/50 pb-12">
        {/* ── Cabeçalho ────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="sm" onClick={() => navigate("/financeiro/dre")} className="text-gray-500 hover:text-gray-800 shrink-0">
                <ArrowLeft className="w-4 h-4 mr-1" /> DRE
              </Button>
              <div className="w-px h-5 bg-gray-200 shrink-0" />
              <span className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-orange-500" />
              </span>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                  Análise Inteligente · {titulo}
                  <span className="text-[10px] font-normal bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Claude Opus 4-5</span>
                  {analise?.saude && !analiseMut.isPending && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${saudeMap[analise.saude]?.cls ?? ""}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${saudeMap[analise.saude]?.dot ?? "bg-gray-400"}`} />
                      {saudeMap[analise.saude]?.label ?? analise.saude}
                    </span>
                  )}
                </h1>
                {!analiseMut.isPending && analiseSalvaEm && (
                  <p className="text-[11px] text-gray-400">Salva em {new Date(analiseSalvaEm).toLocaleString("pt-BR")}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {nota !== null && !analiseMut.isPending && (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-sm tabular-nums border-4"
                  style={{ color: notaCor(nota), borderColor: notaCor(nota), background: `${notaCor(nota)}14` }}
                  title="Nota de saúde financeira (0-100)"
                >{nota}</div>
              )}
              <Button
                size="sm"
                onClick={gerarAnalise}
                disabled={analiseMut.isPending}
                className="relative overflow-hidden bg-orange-500 hover:bg-orange-600 text-white"
              >
                {analiseMut.isPending && (
                  <span className="absolute inset-0 bg-white/15 rounded" style={{ width: `${progresso}%`, transition: "width 300ms ease-out" }} />
                )}
                <Sparkles className="w-4 h-4 mr-1.5 relative z-10" />
                <span className="relative z-10">
                  {analiseMut.isPending ? `Analisando… ${Math.round(progresso)}%` : analise ? "Refazer análise" : "Gerar análise IA"}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── SELETOR DE PERÍODO (white-card padrão) ─── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a - 1)}>
                  <ChevronDown className="w-4 h-4 rotate-90" />
                </Button>
                <span className="text-base font-bold text-gray-800 tabular-nums w-12 text-center">{ano}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a + 1)}>
                  <ChevronDown className="w-4 h-4 -rotate-90" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MESES_PT.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSel({ tipo: "mensal", mes: i + 1 })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all border ${sel.tipo === "mensal" && (sel as any).mes === i + 1 ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                  >{m.slice(0, 3)}</button>
                ))}
                {[1,2,3,4].map(tri => (
                  <button
                    key={`t${tri}`}
                    onClick={() => setSel({ tipo: "trimestral", tri })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all border ${sel.tipo === "trimestral" && (sel as any).tri === tri ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                  >{tri}ºTri</button>
                ))}
                {[1,2].map(sem => (
                  <button
                    key={`s${sem}`}
                    onClick={() => setSel({ tipo: "semestral", sem })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all border ${sel.tipo === "semestral" && (sel as any).sem === sem ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                  >{sem}ºSem</button>
                ))}
                <button
                  onClick={() => setSel({ tipo: "anual" })}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all border ${sel.tipo === "anual" ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                >Anual</button>
              </div>
            </div>
          </div>

          {/* ── PROGRESSO ────────────────────────────────── */}
          {(analiseMut.isPending || progresso > 0) && (
            <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-amber-50/40 p-5">
              <div className="flex items-end justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                    <Sparkles className="w-5 h-5 text-orange-500" />
                    {progresso < 100 && <span className="absolute inset-0 rounded-xl ring-2 ring-orange-300/60 animate-ping" />}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{progresso >= 100 ? "Análise concluída!" : "Claude Opus 4-5 analisando…"}</p>
                    <p className="text-xs text-orange-700/80 font-medium">{progresso >= 100 ? "Pronto!" : fase.label}</p>
                  </div>
                </div>
                <span className="text-3xl font-extrabold tabular-nums text-orange-600 leading-none">{Math.round(progresso)}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-100">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-300 ease-out" style={{ width: `${progresso}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                {IA_FASES.map((f, i) => {
                  const ini = i === 0 ? 0 : IA_FASES[i-1].ate;
                  const feito = progresso >= f.ate || progresso >= 100;
                  const ativo = !feito && progresso >= ini;
                  return (
                    <span key={f.label} className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${feito ? "text-emerald-600" : ativo ? "text-orange-600" : "text-gray-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${feito ? "bg-emerald-500" : ativo ? "bg-orange-500 animate-pulse" : "bg-gray-300"}`} />
                      {f.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ERRO ─────────────────────────────────────── */}
          {analiseMut.isError && !analiseMut.isPending && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold mb-1">Não foi possível gerar a análise</p>
              <p className="text-xs">{String((analiseMut.error as any)?.message ?? "Tente novamente em instantes.")}</p>
            </div>
          )}

          {/* ── ESTADO VAZIO ──────────────────────────────── */}
          {!analise && !analiseMut.isPending && !analiseMut.isError && (
            <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 py-16 flex flex-col items-center gap-4">
              <span className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-orange-400" />
              </span>
              <div className="text-center max-w-sm">
                <p className="text-base font-semibold text-gray-800 mb-1">Diagnóstico inteligente do DRE</p>
                <p className="text-sm text-gray-500">
                  Análise completa de <strong>{titulo}</strong> com benchmarks de empreitada de obra (SINDUSCON, IBGE-PAIC, Damodaran), Pareto de custos e plano de ação priorizado.
                </p>
              </div>
              <Button onClick={gerarAnalise} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Sparkles className="w-4 h-4 mr-1.5" /> Gerar análise agora
              </Button>
            </div>
          )}

          {/* ── ANÁLISE ──────────────────────────────────── */}
          {analise && !analiseMut.isPending && (
            <div className="space-y-6">

              {analiseDesatualizada && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  <Info className="w-4 h-4 shrink-0" />
                  Esta análise é do período <strong>{analise.periodo}</strong>. Clique em "Refazer análise" para o período selecionado.
                </div>
              )}

              {/* Resumo executivo + nota */}
              <div className="grid sm:grid-cols-[1fr_auto] gap-4">
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                  <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Resumo Executivo
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed">{analise.resumoExecutivo}</p>
                </div>
                {nota !== null && (
                  <div className="rounded-2xl border bg-white shadow-sm p-5 flex flex-col items-center justify-center gap-3 min-w-[120px]">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center font-extrabold text-2xl tabular-nums border-[6px]"
                      style={{ color: notaCor(nota), borderColor: notaCor(nota), background: `${notaCor(nota)}10` }}
                    >{nota}</div>
                    {analise.saude && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${saudeMap[analise.saude]?.cls ?? ""}`}>
                        <span className={`w-2 h-2 rounded-full ${saudeMap[analise.saude]?.dot ?? "bg-gray-400"}`} />
                        {saudeMap[analise.saude]?.label ?? analise.saude}
                      </span>
                    )}
                    <p className="text-[10px] text-gray-400 text-center">Saúde financeira<br/>0–100</p>
                  </div>
                )}
              </div>

              {/* Indicadores x setor */}
              {analise.indicadores?.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                  <div className="flex items-center gap-1.5 mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <Activity className="w-3.5 h-3.5" /> Indicadores × Benchmarks do Setor
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {analise.indicadores.map((ind: any, i: number) => {
                      const st = statusInd[ind.status] ?? statusInd.dentro;
                      const StIcon = st.Icon;
                      return (
                        <div key={i} className="rounded-xl border border-gray-100 p-3.5 hover:border-orange-100 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-semibold text-gray-700">{ind.nome}</p>
                            <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${st.cls}`}>
                              <StIcon className="w-2.5 h-2.5" /> {st.txt}
                            </span>
                          </div>
                          <p className="text-xl font-bold tabular-nums mb-1" style={{ color: NAVY }}>
                            {ind.unidade === "%" ? fPct(ind.valor) : fBRL(ind.valor)}
                          </p>
                          <p className="text-[10px] text-gray-400 mb-2">Setor: <span className="font-medium text-gray-500">{ind.benchmarkSetor}</span></p>
                          <p className="text-xs text-gray-600 leading-relaxed">{ind.leitura}</p>
                          <FonteChips ids={ind.fontes} map={fontesMap} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pareto de Custos — gráfico */}
              {paretoData.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <BarChart2 className="w-3.5 h-3.5 text-orange-500" /> Diagrama de Pareto — Top Ofensores de Custo
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Custo direto de obra</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Overhead/Fixo</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Variável</span>
                    </div>
                  </div>

                  {/* Gráfico de barras horizontais */}
                  <div style={{ height: Math.max(260, paretoData.length * 38) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={paretoData}
                        margin={{ top: 0, right: 60, left: 8, bottom: 0 }}
                        barSize={18}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis
                          type="number"
                          domain={[0, "dataMax"]}
                          tickFormatter={(v) => `${v.toFixed(0)}%`}
                          tick={{ fontSize: 10, fill: "#9ca3af" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="conta"
                          width={140}
                          tick={{ fontSize: 10, fill: "#374151" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ParetoTooltip />} />
                        <ReferenceLine x={0} stroke="#e5e7eb" />
                        <Bar dataKey="pctReceita" name="% Receita" radius={[0, 4, 4, 0]}>
                          {paretoData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Tabela auxiliar com acumulado */}
                  <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-gray-50/80 border-b border-gray-100">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Conta</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-16 text-right">% Rec.</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-28 text-right hidden sm:block">Valor</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-14 text-right">Acum.</span>
                    </div>
                    {(analise.paretoCustos ?? []).slice(0, 12).map((item: any, i: number) => {
                      const catColor = item.categoria === "custo_obra" ? "#ef4444" : item.categoria === "despesa_fixa" ? "#f59e0b" : "#6366f1";
                      const crossed80 = item.pctAcumulado >= 80 && (i === 0 || (analise.paretoCustos[i-1]?.pctAcumulado ?? 0) < 80);
                      return (
                        <div key={i}>
                          {crossed80 && (
                            <div className="px-4 py-2 bg-amber-50 border-y border-amber-100 text-[10px] font-semibold text-amber-700 flex items-center gap-1.5">
                              <Zap className="w-3 h-3" /> 80% do custo total acumulado — foco nestas contas dá maior retorno (Princípio de Pareto)
                            </div>
                          )}
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: catColor }} />
                                <span className="text-xs font-medium text-gray-800 truncate">{item.conta}</span>
                              </div>
                              <div className="flex items-center gap-2 pr-1">
                                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.pctCustoTotal)}%`, background: catColor, opacity: 0.8 }} />
                                </div>
                                <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">{item.pctCustoTotal?.toFixed(1)}%</span>
                              </div>
                            </div>
                            <span className="text-xs tabular-nums font-semibold text-gray-700 w-16 text-right self-center">{item.pctReceita?.toFixed(1)}%</span>
                            <span className="text-xs tabular-nums text-gray-500 w-28 text-right self-center hidden sm:block">{fBRL(item.valor)}</span>
                            <span className={`text-xs tabular-nums font-medium w-14 text-right self-center ${item.pctAcumulado >= 80 ? "text-amber-600" : "text-gray-400"}`}>
                              {item.pctAcumulado?.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 italic">Princípio de Pareto: tipicamente 20% das causas explicam 80% dos custos. Concentre as ações nas contas que aparecem antes da linha amarela.</p>
                </div>
              )}

              {/* Riscos + Recomendações */}
              <div className="grid md:grid-cols-2 gap-4">
                {analise.riscos?.length > 0 && (
                  <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                    <div className="flex items-center gap-1.5 mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Riscos Identificados
                    </div>
                    <div className="space-y-2.5">
                      {analise.riscos.map((r: any, i: number) => (
                        <div key={i} className="rounded-xl border border-gray-100 p-3.5">
                          <div className="flex items-start gap-2 mb-2">
                            <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${sevMap[r.severidade] ?? sevMap.media}`}>
                              {r.severidade}
                            </span>
                            <p className="text-sm text-gray-700 leading-relaxed">{r.texto}</p>
                          </div>
                          <FonteChips ids={r.fontes} map={fontesMap} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {analise.recomendacoes?.length > 0 && (
                  <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                    <div className="flex items-center gap-1.5 mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <Lightbulb className="w-3.5 h-3.5 text-orange-500" /> Recomendações Estratégicas
                    </div>
                    <div className="space-y-2.5">
                      {analise.recomendacoes.map((r: any, i: number) => (
                        <div key={i} className="rounded-xl border border-gray-100 p-3.5">
                          <div className="flex items-start gap-2 mb-2">
                            <Lightbulb className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-gray-700 leading-relaxed">{r.texto}</p>
                          </div>
                          <FonteChips ids={r.fontes} map={fontesMap} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Plano de Ação */}
              {analise.planoAcao?.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <Target className="w-3.5 h-3.5 text-orange-500" /> Plano de Ação Prioritário
                    </div>
                    <span className="text-[10px] text-gray-400">{analise.planoAcao.length} ações em ordem de prioridade</span>
                  </div>
                  <div className="space-y-3">
                    {analise.planoAcao.map((item: any, i: number) => {
                      const prazoMap: Record<string, { label: string; cls: string }> = {
                        imediato: { label: "Imediato", cls: "bg-red-50 text-red-700 border-red-200" },
                        "30d":    { label: "30 dias",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
                        "90d":    { label: "90 dias",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
                        "180d":   { label: "6 meses",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
                      };
                      const impactoCls: Record<string, string> = {
                        alto:  "bg-red-50 text-red-700 border-red-200",
                        medio: "bg-amber-50 text-amber-700 border-amber-200",
                        baixo: "bg-gray-50 text-gray-600 border-gray-200",
                      };
                      const prazo = prazoMap[item.prazo] ?? prazoMap["90d"];
                      const probColor = item.probabilidadeEficacia >= 70 ? "#059669" : item.probabilidadeEficacia >= 50 ? "#d97706" : "#dc2626";
                      return (
                        <div key={i} className="rounded-xl border border-gray-100 p-4 hover:border-orange-100 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 mt-0.5 text-white" style={{ background: NAVY }}>
                              {item.prioridade}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${prazo.cls}`}>{prazo.label}</span>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${impactoCls[item.impacto] ?? impactoCls.medio}`}>
                                  Impacto {item.impacto}
                                </span>
                                {item.area && <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">{item.area}</span>}
                                <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color: probColor }} title="Probabilidade de eficácia baseada em literatura setorial">
                                  {item.probabilidadeEficacia}% eficácia
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-gray-900 leading-snug">{item.acao}</p>
                              {item.justificativa && <p className="text-xs text-gray-500 leading-relaxed mt-1">{item.justificativa}</p>}
                              <FonteChips ids={item.fontes} map={fontesMap} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fontes citadas */}
              {analise.fontes?.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
                  <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <BookOpen className="w-3.5 h-3.5" /> Fontes e Literatura Consultada ({analise.fontes.length})
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {analise.fontes.map((f: any) => (
                      <a
                        key={f.id}
                        href={f.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2.5 rounded-xl border border-gray-100 p-3 hover:border-orange-100 hover:bg-orange-50/30 transition-colors group"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0 group-hover:text-orange-400" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 group-hover:text-orange-700 leading-snug">{f.titulo}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{f.autor} · <span className="text-gray-400">{f.tipo}</span></p>
                          {f.nota && <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{f.nota}</p>}
                        </div>
                        <ExternalLink className="w-3 h-3 text-gray-300 shrink-0 group-hover:text-orange-400 mt-0.5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Rodapé */}
              <p className="text-[11px] text-gray-400 italic text-center pb-4">
                Análise gerada por Claude Opus 4-5 (Anthropic) com base nos lançamentos do período e fontes públicas do setor de empreitada de obras (SINDUSCON, IBGE-PAIC, Damodaran/NYU, CBIC, FGV INCC, Bacen, Assaf Neto, Matarazzo, Brigham & Houston, CPC 26/Lei 6.404). Use como apoio à decisão — não substitui aconselhamento contábil ou fiscal.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
