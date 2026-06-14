import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, DollarSign, TrendingUp, TrendingDown, Truck, Activity,
  BarChart3, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle,
  Package, Settings, Users, Gauge, ArrowUpDown, ArrowUp, ArrowDown,
  Sparkles, Brain, Loader2, RefreshCw, ShieldCheck, ShieldAlert, Repeat, Lightbulb,
  BookOpen, ChevronDown, ChevronUp, Timer, Coins, GaugeCircle,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtNum(v: number, d = 0) { return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtCpk(v: number | null | undefined) {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ManutencoesDashboard() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [sortVeiculo, setSortVeiculo] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "custoTotal", dir: "desc" });
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [showMetodologia, setShowMetodologia] = useState(false);

  const dash = trpc.frotas.getMaintenanceDashboard.useQuery(
    { companyId: cId, ano },
    { enabled: cId > 0 },
  );

  // Rev. 2719 — PEÇAS RECORRENTES DETERMINÍSTICAS (sem IA): carrega no load.
  const rec = trpc.frotas.getRecurringPartsDashboard.useQuery(
    { companyId: cId },
    { enabled: cId > 0 },
  );

  // Rev. 2718 — análise PERSISTIDA: a query carrega o último snapshot no load
  // (fica FIXADA na tela); a mutation recalcula + regrava e o refetch atualiza.
  const aiQuery = trpc.frotas.getMaintenanceAIAnalysisLatest.useQuery(
    { companyId: cId },
    { enabled: cId > 0, refetchOnWindowFocus: false },
  );
  const aiMut = trpc.frotas.getMaintenanceAIAnalysis.useMutation({
    onSuccess: () => { aiQuery.refetch(); },
  });
  // Ao trocar de empresa, descarta o resultado da mutation anterior (que era de
  // OUTRA empresa) — senão `aiMut.data` antigo sobrescreveria o snapshot novo.
  useEffect(() => { aiMut.reset(); }, [cId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fonte de verdade: o snapshot da PRÓPRIA empresa mais RECENTE. `aiQuery.data`
  // é sempre da empresa atual; `aiMut.data` só vale se for da empresa atual.
  const ai = useMemo(() => {
    const mut = aiMut.data && (aiMut.data as any).companyId != null && (aiMut.data as any).companyId !== cId ? null : aiMut.data;
    const cands = [aiQuery.data, mut].filter(Boolean) as any[];
    if (cands.length === 0) return undefined;
    return cands.sort((a, b) => new Date(b?.geradoEm || 0).getTime() - new Date(a?.geradoEm || 0).getTime())[0];
  }, [aiQuery.data, aiMut.data, cId]);
  const aiMetrics = ai?.metrics;
  const aiParecer = ai?.ia as any;
  const aiFleet = aiMetrics?.fleet as any;

  // Barra de progresso (0-100%) durante a análise da IA. A chamada é única (sem
  // eventos de progresso reais), então animamos até ~95% enquanto pendente e
  // cravamos 100% ao concluir, para o usuário acompanhar o andamento.
  const [aiProgress, setAiProgress] = useState(0);
  useEffect(() => {
    if (!aiMut.isPending) return;
    setAiProgress(8);
    const id = setInterval(() => {
      setAiProgress((p) => {
        if (p >= 95) return 95;
        const inc = p < 45 ? 6 : p < 75 ? 3 : 1;
        return Math.min(95, p + inc);
      });
    }, 450);
    return () => clearInterval(id);
  }, [aiMut.isPending]);
  useEffect(() => {
    if (!aiMut.isPending && (ai || aiMut.isError)) setAiProgress(100);
  }, [aiMut.isPending, ai, aiMut.isError]);

  const recVeicByPlaca = useMemo(() => {
    const map: Record<string, any> = {};
    for (const v of aiMetrics?.veiculos || []) map[v.placa] = v;
    return map;
  }, [aiMetrics]);

  const recCards = useMemo(() => {
    const recs: any[] = aiParecer?.veiculos || [];
    if (recs.length > 0) {
      return recs.map((r: any) => ({ ...r, metric: recVeicByPlaca[r.placa] }));
    }
    // Fallback determinístico quando a IA não retornou parecer: ordena por sinais de risco
    return (aiMetrics?.veiculos || [])
      .map((v: any) => ({
        placa: v.placa,
        recomendacao: null,
        scoreRisco: null,
        justificativa: null,
        sinais: [],
        metric: v,
      }))
      .sort((a: any, b: any) => {
        const sa = (a.metric?.pecasRecorrentesCurtas || 0) * 100 + (a.metric?.pctCorretiva || 0) + (a.metric?.custoSobreValorPct || 0);
        const sb = (b.metric?.pecasRecorrentesCurtas || 0) * 100 + (b.metric?.pctCorretiva || 0) + (b.metric?.custoSobreValorPct || 0);
        return sb - sa;
      })
      .slice(0, 12);
  }, [aiParecer, aiMetrics, recVeicByPlaca]);

  const recoStyle = (reco: string | null) => {
    if (reco === "VENDER") return { badge: "bg-red-100 text-red-700 border-red-200", bar: "bg-red-500", border: "border-l-red-500", icon: ShieldAlert, label: "Vender" };
    if (reco === "OBSERVAR") return { badge: "bg-amber-100 text-amber-700 border-amber-200", bar: "bg-amber-500", border: "border-l-amber-500", icon: AlertTriangle, label: "Observar" };
    if (reco === "MANTER") return { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", border: "border-l-emerald-500", icon: ShieldCheck, label: "Manter" };
    return { badge: "bg-slate-100 text-slate-600 border-slate-200", bar: "bg-slate-400", border: "border-l-slate-300", icon: Truck, label: "—" };
  };

  const d = dash.data;

  const porMes = d?.porMes || [];
  const custoMesPorTipo = d?.custoMesPorTipo || [];
  const porVeiculo = d?.porVeiculo || [];
  const itensPorVeiculo = d?.itensPorVeiculo || [];
  const topItens = d?.topItens || [];
  const porFornecedor = d?.porFornecedor || [];
  const kpi = d?.kpi || { totalManutencoes: 0, preventivas: 0, corretivas: 0, custoTotal: 0, custoMedio: 0, veiculosAtendidos: 0, custoPecas: 0, custoServicos: 0 };

  // Rev. 2719 — derivados do dashboard determinístico de peças recorrentes.
  const recKpi = rec.data?.kpi || { totalRecorrencias: 0, criticas: 0, custoTotalRecorrencias: 0, veiculosAfetados: 0, pecasDistintas: 0, totalTrocas: 0 };
  const recTopCusto = (rec.data?.topPorCusto || []) as any[];
  const recDist = (rec.data?.distribuicaoIntervalo || []) as any[];
  const recPorVeic = ((rec.data?.porVeiculo || []) as any[]).slice(0, 10);
  const recPecasGlobais = (rec.data?.pecasGlobais || []) as any[];

  const evolucaoData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mesData = porMes.find((m: any) => m.mes === i + 1);
      const tipoCusto = custoMesPorTipo.find((m: any) => m.mes === i + 1);
      return {
        name: MESES[i],
        qtd: mesData?.qtd || 0,
        custo: mesData?.custo || 0,
        preventivas: mesData?.preventivas || 0,
        corretivas: mesData?.corretivas || 0,
        pecas: tipoCusto?.pecas || 0,
        servicos: tipoCusto?.servicos || 0,
      };
    });
  }, [porMes, custoMesPorTipo]);

  const veiculosSorted = useMemo(() => {
    return [...porVeiculo].sort((a: any, b: any) => {
      const col = sortVeiculo.col;
      const av = a[col] ?? 0;
      const bv = b[col] ?? 0;
      return sortVeiculo.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [porVeiculo, sortVeiculo]);

  const itensPorVeiculoMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const item of itensPorVeiculo) {
      if (!map[item.placa]) map[item.placa] = [];
      map[item.placa].push(item);
    }
    return map;
  }, [itensPorVeiculo]);

  const topPecas = topItens.filter((i: any) => i.categoria === "peca").slice(0, 15);
  const topServicos = topItens.filter((i: any) => i.categoria === "servico").slice(0, 15);

  const pctPreventivas = kpi.totalManutencoes > 0 ? Math.round((kpi.preventivas / kpi.totalManutencoes) * 100) : 0;
  const pctCorretivas = 100 - pctPreventivas;

  const distTipoData = [
    { name: "Preventiva", value: kpi.preventivas, pct: pctPreventivas },
    { name: "Corretiva", value: kpi.corretivas, pct: pctCorretivas },
  ].filter(x => x.value > 0);

  const toggleSort = (col: string) => {
    setSortVeiculo(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  };
  const SortIcon = ({ col }: { col: string }) => {
    if (sortVeiculo.col !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortVeiculo.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  if (!d) {
    return (
      <DashboardLayout>
        <div className="p-4 flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4">
        {/* Rev. 2712 — HERO header moderno: faixa gradiente escura com brilhos,
            chip de ícone elevado e seletor de ano em vidro (glassmorphism). */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e293b] via-[#1e3a5f] to-[#0f172a] p-5 sm:p-6 shadow-lg">
          <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 p-3 text-white shadow-lg shadow-orange-900/30 ring-1 ring-white/20">
                <Wrench className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Dashboard de Manutenção</h1>
                <p className="text-sm text-slate-300/90">Peças, serviços e custos por veículo — com análise inteligente de frota</p>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-white/10 px-2 py-1.5 ring-1 ring-white/15 backdrop-blur-md">
              <button onClick={() => setAno(a => a - 1)} className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[64px] text-center text-lg font-bold tabular-nums text-white">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Manutenções", value: fmtNum(kpi.totalManutencoes), icon: Wrench, color: "from-orange-500 to-amber-500" },
            { label: "Custo Total", value: fmt(kpi.custoTotal), icon: DollarSign, color: "from-emerald-500 to-green-600" },
            { label: "Preventivas", value: fmtNum(kpi.preventivas), icon: CheckCircle, color: "from-blue-500 to-cyan-500", sub: `${pctPreventivas}%` },
            { label: "Corretivas", value: fmtNum(kpi.corretivas), icon: AlertTriangle, color: "from-red-500 to-orange-500", sub: `${pctCorretivas}%` },
            { label: "Veículos", value: fmtNum(kpi.veiculosAtendidos), icon: Truck, color: "from-violet-500 to-purple-600" },
            { label: "Fornecedores", value: fmtNum(kpi.fornecedores), icon: Users, color: "from-pink-500 to-rose-500" },
            { label: "Custo Médio", value: fmt(kpi.custoMedio), icon: Gauge, color: "from-cyan-500 to-teal-500" },
            { label: "Maior OS", value: fmt(kpi.custoMax), icon: TrendingUp, color: "from-amber-500 to-yellow-500" },
          ].map((k, i) => (
            <Card key={i} className="group relative overflow-hidden border-slate-200/70 dark:border-slate-700/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${k.color}`} />
              <CardContent className="p-3">
                <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${k.color} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}>
                  <k.icon className="h-4 w-4" />
                </div>
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                <p className="text-lg font-bold leading-tight tabular-nums">{k.value}</p>
                {k.sub && <span className="text-[10px] font-medium text-muted-foreground">{k.sub}</span>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Rev. 2719 — PEÇAS RECORRENTES (DETERMINÍSTICO, SEM IA). Carrega no
            load; cruza o histórico real e mostra onde o dinheiro está vazando. */}
        <Card className="border-red-200 dark:border-red-900/40 bg-gradient-to-br from-red-50/50 to-orange-50/30 dark:from-red-950/15 dark:to-orange-950/10">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-sm">
                  <Repeat className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Peças Recorrentes</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Mesma peça trocada <span className="font-medium">2× ou mais</span> no mesmo veículo — análise automática (sem IA), com base em <span className="font-medium">todo o histórico</span>
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="border-red-200 text-red-700 dark:border-red-800 dark:text-red-300 bg-white/60 dark:bg-transparent">
                <Activity className="h-3 w-3 mr-1" /> Atualiza sozinho
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {rec.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-red-500" /> Cruzando o histórico de peças…
              </div>
            ) : (recKpi.totalRecorrencias || 0) === 0 ? (
              <div className="text-center py-10 px-4">
                <ShieldCheck className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Nenhuma peça foi trocada mais de uma vez no mesmo veículo — <span className="font-medium text-emerald-700 dark:text-emerald-400">sem recorrência detectada</span>.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Repeat className="h-3 w-3" /> Recorrências</p>
                    <p className="text-lg font-bold tabular-nums leading-tight">{fmtNum(recKpi.totalRecorrencias)}</p>
                    <p className="text-[10px] text-muted-foreground">peça × veículo</p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Críticas</p>
                    <p className="text-lg font-bold tabular-nums leading-tight text-red-600 dark:text-red-400">{fmtNum(recKpi.criticas)}</p>
                    <p className="text-[10px] text-muted-foreground">intervalo ≤ 180 dias</p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Coins className="h-3 w-3" /> Custo recorrente</p>
                    <p className="text-lg font-bold tabular-nums leading-tight text-emerald-700 dark:text-emerald-400">{fmt(recKpi.custoTotalRecorrencias)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtNum(recKpi.totalTrocas)} trocas</p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Veículos afetados</p>
                    <p className="text-lg font-bold tabular-nums leading-tight">{fmtNum(recKpi.veiculosAfetados)}</p>
                    <p className="text-[10px] text-muted-foreground">com recorrência</p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> Peças distintas</p>
                    <p className="text-lg font-bold tabular-nums leading-tight">{fmtNum(recKpi.pecasDistintas)}</p>
                    <p className="text-[10px] text-muted-foreground">tipos de peça</p>
                  </div>
                </div>

                {/* Gráficos: top por custo + distribuição de intervalo */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-emerald-500" /> Top peças por custo recorrente
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(180, recTopCusto.length * 34)}>
                      <BarChart data={recTopCusto} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }} barCategoryGap="22%">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200 dark:stroke-slate-700" />
                        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="custo" radius={[0, 4, 4, 0]}>
                          {recTopCusto.map((e, i) => <Cell key={i} fill={e.critica ? "#ef4444" : "#10b981"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-orange-500" /> Distribuição do menor intervalo entre trocas
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(180, recDist.length * 38)}>
                      <BarChart data={recDist} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 4 }} barCategoryGap="22%">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200 dark:stroke-slate-700" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="faixa" width={92} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => [`${v} peça(s)`, "Qtd"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                          {recDist.map((_, i) => <Cell key={i} fill={i <= 2 ? ["#dc2626", "#f97316", "#f59e0b"][i] : "#94a3b8"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gráficos: ranking por veículo + peças problemáticas global */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-violet-500" /> Veículos com mais recorrência (por custo)
                    </p>
                    <ResponsiveContainer width="100%" height={Math.max(180, recPorVeic.length * 34)}>
                      <BarChart data={recPorVeic} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }} barCategoryGap="22%">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200 dark:stroke-slate-700" />
                        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="placa" width={86} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="custo" radius={[0, 4, 4, 0]} fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-red-500" /> Peças mais problemáticas (toda a frota)
                    </p>
                    <div className="overflow-y-auto max-h-[280px] -mx-1">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-900/60 sticky top-0">
                          <tr>
                            <th className="p-2 text-left font-semibold">Peça</th>
                            <th className="p-2 text-center font-semibold">Veíc.</th>
                            <th className="p-2 text-center font-semibold">Trocas</th>
                            <th className="p-2 text-right font-semibold">Custo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recPecasGlobais.map((p, i) => (
                            <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}>
                              <td className="p-2 font-medium">
                                {p.peca}
                                {p.criticas > 0 && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-500" />}
                              </td>
                              <td className="p-2 text-center">{p.veiculos}</td>
                              <td className="p-2 text-center font-bold">{p.trocas}×</td>
                              <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(p.custo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Detalhe — peças que se repetem em pouco tempo
                  </p>
                  {/* Tabela completa — só em telas largas (xl+) */}
                  <div className="hidden xl:block overflow-x-auto rounded-xl border bg-white dark:bg-slate-800">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-900/60">
                        <tr>
                          <th className="p-2 text-left font-semibold">Veículo</th>
                          <th className="p-2 text-left font-semibold">Peça</th>
                          <th className="p-2 text-center font-semibold">Trocas</th>
                          <th className="p-2 text-center font-semibold">Menor intervalo</th>
                          <th className="p-2 text-center font-semibold">Intervalo médio</th>
                          <th className="p-2 text-right font-semibold">Custo total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rec.data?.recorrencias || []).slice(0, 60).map((r: any, i: number) => {
                          const critico = r.menorIntervaloDias != null && r.menorIntervaloDias <= 180;
                          return (
                            <tr key={i} className={`${i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"} ${critico ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                              <td className="p-2">
                                <span className="font-mono font-bold text-[#1e3a5f] dark:text-blue-300">{r.placa}</span>
                                <span className="block text-[10px] text-muted-foreground">{r.modelo}</span>
                              </td>
                              <td className="p-2 font-medium">{r.peca}</td>
                              <td className="p-2 text-center font-bold">{r.trocas}×</td>
                              <td className="p-2 text-center">
                                {r.menorIntervaloDias != null ? (
                                  <span className={`inline-flex items-center gap-1 font-semibold ${critico ? "text-red-600" : "text-slate-600 dark:text-slate-300"}`}>
                                    {critico && <AlertTriangle className="h-3 w-3" />}
                                    {r.menorIntervaloDias} dias
                                  </span>
                                ) : "—"}
                                {r.menorIntervaloKm != null && r.menorIntervaloKm > 0 && (
                                  <span className="block text-[10px] text-muted-foreground">{fmtNum(r.menorIntervaloKm)} km</span>
                                )}
                              </td>
                              <td className="p-2 text-center text-muted-foreground">{r.intervaloMedioDias != null ? `${r.intervaloMedioDias} dias` : "—"}</td>
                              <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(r.custoTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards expansíveis — tablet/celular (toque para abrir os detalhes) */}
                  <div className="xl:hidden space-y-2">
                    {(rec.data?.recorrencias || []).slice(0, 60).map((r: any, i: number) => {
                      const critico = r.menorIntervaloDias != null && r.menorIntervaloDias <= 180;
                      return (
                        <details key={i} className={`group rounded-xl border ${critico ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
                          <summary className="flex items-center justify-between gap-3 p-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {critico && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                <span className="font-mono font-bold text-[#1e3a5f] dark:text-blue-300">{r.placa}</span>
                                <span className="text-[10px] text-muted-foreground truncate">{r.modelo}</span>
                              </div>
                              <span className="block text-sm font-medium truncate mt-0.5">{r.peca}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${critico ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>{r.trocas}×</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                            </div>
                          </summary>
                          <div className="grid grid-cols-3 max-[360px]:grid-cols-1 gap-2 border-t border-slate-200/70 dark:border-slate-700/70 px-3 py-2.5 text-xs">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Menor intervalo</p>
                              {r.menorIntervaloDias != null ? (
                                <p className={`font-semibold ${critico ? "text-red-600" : "text-slate-700 dark:text-slate-200"}`}>{r.menorIntervaloDias} dias</p>
                              ) : <p className="text-muted-foreground">—</p>}
                              {r.menorIntervaloKm != null && r.menorIntervaloKm > 0 && (
                                <p className="text-[10px] text-muted-foreground">{fmtNum(r.menorIntervaloKm)} km</p>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Intervalo médio</p>
                              <p className="font-medium text-slate-700 dark:text-slate-200">{r.intervaloMedioDias != null ? `${r.intervaloMedioDias} dias` : "—"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Custo total</p>
                              <p className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(r.custoTotal)}</p>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                  {(rec.data?.recorrencias?.length || 0) > 60 && (
                    <p className="text-[10px] text-muted-foreground text-right mt-1">Mostrando as 60 mais críticas de {fmtNum(rec.data?.recorrencias?.length || 0)}.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rev. 2707 — ANÁLISE INTELIGENTE (IA): peças recorrentes + parecer Vender/Manter/Observar */}
        <Card className="border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-violet-50/60 to-indigo-50/40 dark:from-violet-950/20 dark:to-indigo-950/10">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Análise Inteligente (IA)
                    <Sparkles className="h-4 w-4 text-violet-500" />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Diagnóstico de frota por <span className="font-medium">TCO</span>, custo/km, confiabilidade (MTBF) e vida econômica — recomenda <span className="font-medium">vender</span>, <span className="font-medium">observar</span> ou <span className="font-medium">manter</span> cada veículo
                  </p>
                </div>
              </div>
              <button
                onClick={() => aiMut.mutate({ companyId: cId, ano })}
                disabled={aiMut.isPending || cId <= 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {aiMut.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando… {Math.round(aiProgress)}%</>
                  : ai
                    ? <><RefreshCw className="h-4 w-4" /> Atualizar análise</>
                    : <><Sparkles className="h-4 w-4" /> Gerar análise</>}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {aiQuery.isLoading && !ai && !aiMut.isPending && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Carregando última análise…
              </div>
            )}

            {!ai && !aiMut.isPending && !aiQuery.isLoading && (
              <div className="text-center py-8 px-4">
                <Brain className="h-10 w-10 mx-auto text-violet-300 mb-3" />
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  Clique em <span className="font-semibold text-violet-700 dark:text-violet-300">"Gerar análise"</span> para um diagnóstico completo da frota — <span className="font-medium">TCO, custo por km (CPK), confiabilidade (MTBF), relação corretiva×preventiva e vida econômica</span> — com score de risco e parecer <span className="font-medium">vender / observar / manter</span> por veículo. A análise fica salva até você atualizá-la.
                </p>
              </div>
            )}

            {aiMut.isPending && (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="text-sm text-muted-foreground">Cruzando o histórico de manutenções e consultando a IA…</p>
                <div className="w-full max-w-md">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">Progresso da análise</span>
                    <span className="text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300">{Math.round(aiProgress)}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-violet-900/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 transition-all duration-300 ease-out"
                      style={{ width: `${aiProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {aiMut.isError && !aiMut.isPending && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Não foi possível concluir a análise: {(aiMut.error as any)?.message || "erro desconhecido"}.</span>
              </div>
            )}

            {ai && !aiMut.isPending && (
              <div className="space-y-5">
                {ai.erro && (
                  <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{ai.erro}</span>
                  </div>
                )}

                {/* Banda de KPIs da FROTA (TCO / CPK / RCM / tendência / parecer) */}
                {aiFleet && aiFleet.totalVeiculos > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <GaugeCircle className="h-3.5 w-3.5 text-violet-500" /> Diagnóstico da frota
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
                      <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Coins className="h-3 w-3" /> TCO 12 meses</p>
                        <p className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400 leading-tight">{fmt(aiFleet.custo12mFrota || 0)}</p>
                        <p className="text-[10px] text-muted-foreground">Acum.: {fmt(aiFleet.custoTotalFrota || 0)}</p>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" /> Custo / km médio</p>
                        <p className="text-base font-bold tabular-nums leading-tight">{aiFleet.custoPorKmMedio != null ? `${fmtCpk(aiFleet.custoPorKmMedio)}/km` : "—"}</p>
                        <p className="text-[10px] text-muted-foreground">métrica-rei de TCO</p>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Wrench className="h-3 w-3" /> Corretivas</p>
                        <p className={`text-base font-bold tabular-nums leading-tight ${aiFleet.pctCorretivaFrota >= 50 ? "text-red-600 dark:text-red-400" : ""}`}>{aiFleet.pctCorretivaFrota ?? 0}%</p>
                        <p className="text-[10px] text-muted-foreground">das OS (RCM)</p>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {aiFleet.tendenciaFrotaPct != null && aiFleet.tendenciaFrotaPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} Tendência custo
                        </p>
                        <p className={`text-base font-bold tabular-nums leading-tight ${aiFleet.tendenciaFrotaPct != null && aiFleet.tendenciaFrotaPct > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {aiFleet.tendenciaFrotaPct != null ? `${aiFleet.tendenciaFrotaPct >= 0 ? "+" : ""}${aiFleet.tendenciaFrotaPct}%` : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">vs 12m anteriores</p>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Veículos</p>
                        <p className="text-base font-bold tabular-nums leading-tight">{aiFleet.totalVeiculos}</p>
                        <p className="text-[10px] text-muted-foreground">{aiFleet.osTotalFrota ?? 0} OS no total</p>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-800 border shadow-sm p-3">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Parecer</p>
                        <p className="text-sm font-bold leading-tight flex items-center gap-1.5 flex-wrap">
                          <span className="text-red-600">{aiFleet.nVender ?? 0}V</span>
                          <span className="text-amber-600">{aiFleet.nObservar ?? 0}O</span>
                          <span className="text-emerald-600">{aiFleet.nManter ?? 0}M</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">vender/observar/manter</p>
                      </div>
                    </div>
                  </div>
                )}

                {aiParecer?.resumoExecutivo && (
                  <div className="rounded-xl bg-white/70 dark:bg-slate-800/50 border border-violet-100 dark:border-violet-900/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300 mb-1.5 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> Resumo executivo
                    </p>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{aiParecer.resumoExecutivo}</p>
                  </div>
                )}

                {/* Cards de recomendação por veículo */}
                {recCards.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Parecer por veículo {aiParecer ? "" : "(ordenado por sinais de risco)"}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {recCards.map((r: any, i: number) => {
                        const st = recoStyle(r.recomendacao);
                        const m = r.metric || {};
                        const Ico = st.icon;
                        const score = typeof r.scoreRisco === "number" ? Math.max(0, Math.min(100, r.scoreRisco)) : null;
                        return (
                          <div key={i} className={`rounded-xl bg-white dark:bg-slate-800 border border-l-4 ${st.border} shadow-sm p-3 flex flex-col gap-2`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-[#1e3a5f] dark:text-blue-300">{r.placa}</span>
                                <span className="text-[10px] text-muted-foreground">{m.modelo || ""} {m.marca ? `· ${m.marca}` : ""}</span>
                              </div>
                              <Badge className={`text-[10px] border ${st.badge} gap-1`}>
                                <Ico className="h-3 w-3" /> {st.label}
                              </Badge>
                            </div>

                            {score != null && (
                              <div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                                  <span>Score de risco</span>
                                  <span className="font-bold tabular-nums">{score}/100</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${score}%` }} />
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground">Custo 12m</p>
                                <p className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(m.custo12m || 0)}</p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground flex items-center gap-0.5"><Gauge className="h-2.5 w-2.5" /> Custo/km</p>
                                <p className="font-bold">{m.custoPorKm != null ? `${fmtCpk(m.custoPorKm)}/km` : "—"}</p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground">Corretivas</p>
                                <p className={`font-bold ${(m.pctCorretiva ?? 0) >= 50 ? "text-red-600 dark:text-red-400" : ""}`}>{m.pctCorretiva ?? 0}%</p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground flex items-center gap-0.5">
                                  {m.tendenciaCustoPct != null && m.tendenciaCustoPct > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />} Tendência
                                </p>
                                <p className={`font-bold ${m.tendenciaCustoPct != null && m.tendenciaCustoPct > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{m.tendenciaCustoPct != null ? `${m.tendenciaCustoPct >= 0 ? "+" : ""}${m.tendenciaCustoPct}%` : "—"}</p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" /> MTBF</p>
                                <p className="font-bold">{m.mtbfDias != null ? `${fmtNum(m.mtbfDias)}d` : "—"}{m.mtbfKm != null ? <span className="text-muted-foreground font-normal"> · {fmtNum(m.mtbfKm)}km</span> : null}</p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground">Custo/valor</p>
                                <p className={`font-bold ${(m.custoSobreValorPct ?? 0) >= 50 ? "text-red-600 dark:text-red-400" : ""}`}>{m.custoSobreValorPct != null ? `${m.custoSobreValorPct}%` : "—"}</p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                <p className="text-muted-foreground">Peças recorrentes</p>
                                <p className="font-bold">{m.pecasRecorrentes ?? 0}{(m.pecasRecorrentesCurtas ?? 0) > 0 ? <span className="text-red-600"> ({m.pecasRecorrentesCurtas} críticas)</span> : null}</p>
                              </div>
                              {m.idade != null && (
                                <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                  <p className="text-muted-foreground">Idade</p>
                                  <p className="font-bold">{m.idade} {m.idade === 1 ? "ano" : "anos"}</p>
                                </div>
                              )}
                              {m.custoMedioOs != null && (
                                <div className="bg-slate-50 dark:bg-slate-900/40 rounded p-1.5">
                                  <p className="text-muted-foreground">Custo médio/OS</p>
                                  <p className="font-bold">{fmt(m.custoMedioOs)}</p>
                                </div>
                              )}
                            </div>

                            {r.justificativa && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{r.justificativa}</p>
                            )}
                            {Array.isArray(r.sinais) && r.sinais.length > 0 && (
                              <ul className="space-y-0.5">
                                {r.sinais.slice(0, 4).map((s: string, si: number) => (
                                  <li key={si} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                    <span className="text-violet-400 mt-0.5">•</span><span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {r.acao && (
                              <p className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 rounded px-2 py-1">
                                → {r.acao}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Peças recorrentes (determinístico) */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-red-500" /> Peças que se repetem em pouco tempo
                  </p>
                  {(aiMetrics?.recorrencias?.length || 0) > 0 ? (
                    <div className="overflow-x-auto rounded-xl border bg-white dark:bg-slate-800">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-900/60">
                          <tr>
                            <th className="p-2 text-left font-semibold">Veículo</th>
                            <th className="p-2 text-left font-semibold">Peça</th>
                            <th className="p-2 text-center font-semibold">Trocas</th>
                            <th className="p-2 text-center font-semibold">Menor intervalo</th>
                            <th className="p-2 text-center font-semibold">Intervalo médio</th>
                            <th className="p-2 text-right font-semibold">Custo total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(aiMetrics?.recorrencias || []).slice(0, 40).map((r: any, i: number) => {
                            const critico = r.menorIntervaloDias != null && r.menorIntervaloDias <= 180;
                            return (
                              <tr key={i} className={`${i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"} ${critico ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                                <td className="p-2">
                                  <span className="font-mono font-bold text-[#1e3a5f] dark:text-blue-300">{r.placa}</span>
                                  <span className="block text-[10px] text-muted-foreground">{r.modelo}</span>
                                </td>
                                <td className="p-2 font-medium">{r.peca}</td>
                                <td className="p-2 text-center font-bold">{r.trocas}×</td>
                                <td className="p-2 text-center">
                                  {r.menorIntervaloDias != null ? (
                                    <span className={`inline-flex items-center gap-1 font-semibold ${critico ? "text-red-600" : "text-slate-600 dark:text-slate-300"}`}>
                                      {critico && <AlertTriangle className="h-3 w-3" />}
                                      {r.menorIntervaloDias} dias
                                    </span>
                                  ) : "—"}
                                  {r.menorIntervaloKm != null && r.menorIntervaloKm > 0 && (
                                    <span className="block text-[10px] text-muted-foreground">{fmtNum(r.menorIntervaloKm)} km</span>
                                  )}
                                </td>
                                <td className="p-2 text-center text-muted-foreground">{r.intervaloMedioDias != null ? `${r.intervaloMedioDias} dias` : "—"}</td>
                                <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(r.custoTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-3 text-center bg-white/60 dark:bg-slate-800/40 rounded-xl border">
                      Nenhuma peça foi trocada mais de uma vez no mesmo veículo — sem recorrência detectada.
                    </p>
                  )}
                </div>

                {/* Recomendações gerais */}
                {Array.isArray(aiParecer?.recomendacoesGerais) && aiParecer.recomendacoesGerais.length > 0 && (
                  <div className="rounded-xl bg-white/70 dark:bg-slate-800/50 border border-violet-100 dark:border-violet-900/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300 mb-2 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> Recomendações gerais
                    </p>
                    <ul className="space-y-1.5">
                      {aiParecer.recomendacoesGerais.map((s: string, i: number) => (
                        <li key={i} className="text-sm text-slate-700 dark:text-slate-200 flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /><span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Nota metodológica (literatura de gestão de frota) */}
                <div className="rounded-xl border bg-slate-50/60 dark:bg-slate-900/30">
                  <button
                    type="button"
                    onClick={() => setShowMetodologia((s) => !s)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-violet-500" /> Como esta análise é calculada (metodologia)</span>
                    {showMetodologia ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {showMetodologia && (
                    <div className="px-3 pb-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 space-y-1.5">
                      <p>O diagnóstico cruza o histórico real de manutenções com indicadores consagrados na gestão de frotas:</p>
                      <ul className="space-y-1 list-none">
                        <li><span className="font-semibold text-slate-700 dark:text-slate-200">TCO (Total Cost of Ownership):</span> custo total acumulado e dos últimos 12 meses, base para comparar veículos.</li>
                        <li><span className="font-semibold text-slate-700 dark:text-slate-200">Custo por km (CPK):</span> custo ÷ km rodado — a métrica-rei de eficiência de frota; normaliza veículos de uso desigual.</li>
                        <li><span className="font-semibold text-slate-700 dark:text-slate-200">MTBF (Mean Time Between Failures):</span> intervalo médio entre corretivas (dias e km); MTBF curto = baixa confiabilidade.</li>
                        <li><span className="font-semibold text-slate-700 dark:text-slate-200">RCM (corretiva × preventiva):</span> % de OS corretivas. Frota saudável é dominada por preventiva; muita corretiva = "apagando incêndio".</li>
                        <li><span className="font-semibold text-slate-700 dark:text-slate-200">Tendência de custo:</span> custo dos últimos 12m vs os 12m anteriores — curva acelerando antecipa deterioração.</li>
                        <li><span className="font-semibold text-slate-700 dark:text-slate-200">Vida econômica / repor-vs-reparar:</span> quando a manutenção anual consome fatia alta do valor do bem, substituir tende a compensar mais que reparar.</li>
                      </ul>
                      <p className="text-muted-foreground">O score de risco (0–100) pondera esses sinais; o parecer (vender / observar / manter) deriva dos limiares combinados. O texto interpretativo é gerado por IA sobre esses mesmos números; quando a IA está indisponível, um parecer determinístico equivalente é exibido.</p>
                    </div>
                  )}
                </div>

                {ai.geradoEm && (
                  <p className="text-[10px] text-muted-foreground text-right">
                    Análise gerada em {new Date(ai.geradoEm).toLocaleString("pt-BR")} · fica salva até você clicar em "Atualizar análise"
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Evolução Mensal — Custo e Quantidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={evolucaoData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" width={108} tick={{ fontSize: 10 }} tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs space-y-1">
                        <p className="font-bold">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} style={{ color: p.color }}>{p.name}: {p.name.includes("R$") || p.name === "Custo" ? fmt(p.value) : fmtNum(p.value)}</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="pecas" name="Peças (R$)" stackId="custo" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar yAxisId="left" dataKey="servicos" name="Serviços (R$)" stackId="custo" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="qtd" name="Qtd OS" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Preventiva vs Corretiva
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {distTipoData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={distTipoData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                        {distTipoData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "#3b82f6" : "#ef4444"} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{p.name}</strong>: {p.value} ({p.pct}%)</div>;
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500" /> Preventiva: {kpi.preventivas} ({pctPreventivas}%)</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Corretiva: {kpi.corretivas} ({pctCorretivas}%)</span>
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                Peças Mais Trocadas ({topPecas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPecas.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, topPecas.length * 32)}>
                  <BarChart data={topPecas} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={160} tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + "…" : v} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                          <p className="font-bold">{d.nome}</p>
                          <p>{d.ocorrencias} ocorrências · {fmtNum(d.qtdTotal)} unidades</p>
                          <p>{d.veiculos} veículos · {fmt(d.custoTotal)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="ocorrencias" name="Ocorrências" radius={[0, 4, 4, 0]}>
                      {topPecas.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-6">Nenhuma peça registrada</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="h-4 w-4 text-orange-500" />
                Serviços Mais Realizados ({topServicos.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topServicos.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, topServicos.length * 32)}>
                  <BarChart data={topServicos} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={160} tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + "…" : v} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                          <p className="font-bold">{d.nome}</p>
                          <p>{d.ocorrencias} ocorrências · {d.veiculos} veículos</p>
                          <p>{fmt(d.custoTotal)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="ocorrencias" name="Ocorrências" radius={[0, 4, 4, 0]}>
                      {topServicos.map((_: any, i: number) => <Cell key={i} fill={COLORS[(i + 4) % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-6">Nenhum serviço registrado</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4 text-violet-500" />
              Custo por Veículo ({porVeiculo.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {porVeiculo.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, porVeiculo.length * 30)}>
                <BarChart data={porVeiculo} layout="vertical" margin={{ left: 10, right: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="placa" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                        <p className="font-bold">{v.placa} — {v.modelo}</p>
                        <p>{fmt(v.custoTotal)} · {v.qtdManutencoes} OS</p>
                        <p>Preventivas: {v.preventivas} · Corretivas: {v.corretivas}</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="custoTotal" name="Custo Total" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, formatter: (v: number) => fmt(v) }}>
                    {porVeiculo.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4 text-emerald-500" />
              Detalhamento por Veículo — O que foi trocado/realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-left font-semibold">Veículo</th>
                    <th className="p-2.5 text-left font-semibold">Tipo</th>
                    <th className="p-2.5 text-center font-semibold cursor-pointer hover:text-blue-500" onClick={() => toggleSort("qtdManutencoes")}>
                      <span className="inline-flex items-center gap-1">OS <SortIcon col="qtdManutencoes" /></span>
                    </th>
                    <th className="p-2.5 text-center font-semibold">Prev.</th>
                    <th className="p-2.5 text-center font-semibold">Corr.</th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-blue-500" onClick={() => toggleSort("custoTotal")}>
                      <span className="inline-flex items-center gap-1">Custo Total <SortIcon col="custoTotal" /></span>
                    </th>
                    <th className="p-2.5 text-center font-semibold">Última OS</th>
                    <th className="p-2.5 text-center font-semibold">Itens</th>
                  </tr>
                </thead>
                <tbody>
                  {veiculosSorted.map((v: any, idx: number) => {
                    const vItens = itensPorVeiculoMap[v.placa] || [];
                    const isExpanded = expandedVehicle === v.placa;
                    const maxCusto = Math.max(...porVeiculo.map((x: any) => x.custoTotal), 1);
                    return (
                      <React.Fragment key={v.vehicleId}>
                        <tr
                          className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/20 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"} ${isExpanded ? "bg-blue-50/80 dark:bg-blue-950/30" : ""}`}
                          onClick={() => setExpandedVehicle(isExpanded ? null : v.placa)}
                        >
                          <td className="p-2.5">
                            <div className="flex flex-col">
                              <span className="font-mono font-bold text-[#1e3a5f] dark:text-blue-300">{v.placa}</span>
                              <span className="text-muted-foreground text-[10px]">{v.modelo} {v.marca ? `· ${v.marca}` : ""}</span>
                            </div>
                          </td>
                          <td className="p-2.5">
                            <Badge className="text-[10px]" variant="outline">{v.tipoVeiculo || "—"}</Badge>
                          </td>
                          <td className="p-2.5 text-center font-bold">{v.qtdManutencoes}</td>
                          <td className="p-2.5 text-center text-blue-600">{v.preventivas}</td>
                          <td className="p-2.5 text-center text-orange-600">{v.corretivas}</td>
                          <td className="p-2.5 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(v.custoTotal)}</span>
                              <div className="w-16 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                                <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${(v.custoTotal / maxCusto) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5 text-center">{v.ultimaManutencao ? v.ultimaManutencao.split("-").reverse().join("/") : "—"}</td>
                          <td className="p-2.5 text-center">
                            {vItens.length > 0 ? (
                              <Badge variant="outline" className="text-[10px]">{vItens.length} itens</Badge>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                        {isExpanded && vItens.length > 0 && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <div className="bg-blue-50/60 dark:bg-blue-950/20 border-l-4 border-blue-400 px-4 py-2">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-semibold">
                                  Itens trocados/realizados em {v.placa}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                  {vItens.map((item: any, ii: number) => (
                                    <div key={ii} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2.5 py-1.5 text-xs">
                                      <div className="flex items-center gap-2">
                                        <Badge className={`text-[9px] px-1.5 ${item.categoria === "peca" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                                          {item.categoria === "peca" ? "Peça" : "Serviço"}
                                        </Badge>
                                        <span className="font-medium">{item.nome}</span>
                                      </div>
                                      <div className="flex items-center gap-3 text-muted-foreground">
                                        <span>Qtd: {fmtNum(item.qtd, 0)}</span>
                                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(item.custo)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-pink-500" />
                Ranking Fornecedores ({porFornecedor.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {porFornecedor.length > 0 ? (
                <div className="space-y-2">
                  {porFornecedor.map((f: any, i: number) => {
                    const maxF = Math.max(...porFornecedor.map((x: any) => x.custoTotal), 1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-medium truncate">{f.fornecedor}</span>
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 ml-2">{fmt(f.custoTotal)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(f.custoTotal / maxF) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{f.qtd} OS</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-500" />
                Preventiva vs Corretiva por Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={evolucaoData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs">
                        <p className="font-bold mb-1">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="preventivas" name="Preventivas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="corretivas" name="Corretivas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
}
