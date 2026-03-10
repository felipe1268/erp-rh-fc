import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  HardHat, Package, AlertTriangle, ShieldAlert, TrendingUp, Users,
  DollarSign, Calendar, Building2, ClipboardList, Loader2,
  Shirt, Footprints, Shield, Filter, X, SlidersHorizontal,
  ChevronRight, CheckCircle2, XCircle, FileText, User,
  ArrowUp, ArrowDown, TrendingDown, BarChart3, Target,
  Zap, Repeat, Activity, Award, Flame, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// Descontos de EPI foram movidos para Folha de Pagamento > Descontos EPI

// Gera lista de meses dos últimos 24 meses para o filtro de período
function getMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ value: key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

// ============================================================
// COMPONENTE: Insight Card (para destaques)
// ============================================================
function InsightCard({ icon: Icon, title, value, sub, color, badge }: {
  icon: any; title: string; value: string; sub?: string; color: string; badge?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
    green: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", iconBg: "bg-emerald-100" },
    red: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", iconBg: "bg-red-100" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", iconBg: "bg-blue-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", iconBg: "bg-amber-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", iconBg: "bg-purple-100" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", iconBg: "bg-orange-100" },
    teal: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", iconBg: "bg-teal-100" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", iconBg: "bg-indigo-100" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        {badge && <Badge variant="secondary" className="text-[10px] ml-auto">{badge}</Badge>}
      </div>
      <p className={`text-lg font-bold ${c.text} leading-tight`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function DashEpis() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const { data, isLoading } = trpc.dashboards.epis.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  // Filtros
  const [periodoInicio, setPeriodoInicio] = useState<string>("todos");
  const [periodoFim, setPeriodoFim] = useState<string>("todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todos");
  const [obraFiltro, setObraFiltro] = useState<string>("todos");
  const [showFilters, setShowFilters] = useState(false);


  const monthOptions = useMemo(() => getMonthOptions(), []);

  const categorias = useMemo(() => {
    if (!data?.porCategoria) return [];
    return Object.keys(data.porCategoria);
  }, [data?.porCategoria]);

  const obrasDisponiveis = useMemo(() => {
    if (!data?.custoPorObraList) return [];
    return data.custoPorObraList.map((o: any) => o.nome);
  }, [data?.custoPorObraList]);

  const consumoFiltrado = useMemo(() => {
    if (!data?.consumoMensal) return [];
    let filtered = data.consumoMensal;
    if (periodoInicio !== "todos") filtered = filtered.filter((c: any) => c.mesKey >= periodoInicio);
    if (periodoFim !== "todos") filtered = filtered.filter((c: any) => c.mesKey <= periodoFim);
    return filtered;
  }, [data?.consumoMensal, periodoInicio, periodoFim]);

  const custoFiltrado = useMemo(() => {
    if (!data?.custoMensal) return [];
    let filtered = data.custoMensal;
    if (periodoInicio !== "todos") filtered = filtered.filter((c: any) => c.mesKey >= periodoInicio);
    if (periodoFim !== "todos") filtered = filtered.filter((c: any) => c.mesKey <= periodoFim);
    return filtered;
  }, [data?.custoMensal, periodoInicio, periodoFim]);

  const obrasFiltradas = useMemo(() => {
    if (!data?.custoPorObraList) return [];
    if (obraFiltro === "todos") return data.custoPorObraList;
    return data.custoPorObraList.filter((o: any) => o.nome === obraFiltro);
  }, [data?.custoPorObraList, obraFiltro]);

  const categoriasFiltradas = useMemo(() => {
    if (!data?.porCategoria) return {};
    if (categoriaFiltro === "todos") return data.porCategoria;
    const filtered: Record<string, any> = {};
    if (data.porCategoria[categoriaFiltro]) filtered[categoriaFiltro] = data.porCategoria[categoriaFiltro];
    return filtered;
  }, [data?.porCategoria, categoriaFiltro]);

  const hasActiveFilters = periodoInicio !== "todos" || periodoFim !== "todos" || categoriaFiltro !== "todos" || obraFiltro !== "todos";

  const clearFilters = () => {
    setPeriodoInicio("todos");
    setPeriodoFim("todos");
    setCategoriaFiltro("todos");
    setObraFiltro("todos");
  };

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard de EPIs</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise completa de equipamentos de proteção individual</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">!</Badge>
              )}
            </Button>
            <PrintActions title="Dashboard EPIs" />
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* FILTROS */}
            {showFilters && (
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Filter className="h-4 w-4 text-primary" /> Filtros
                    </div>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1 h-7">
                        <X className="h-3 w-3" /> Limpar filtros
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Período — De</label>
                      <Select value={periodoInicio} onValueChange={setPeriodoInicio}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os meses</SelectItem>
                          {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Período — Até</label>
                      <Select value={periodoFim} onValueChange={setPeriodoFim}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os meses</SelectItem>
                          {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                      <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas as categorias</SelectItem>
                          {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Obra</label>
                      <Select value={obraFiltro} onValueChange={setObraFiltro}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas as obras</SelectItem>
                          {obrasDisponiveis.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                      {periodoInicio !== "todos" && <Badge variant="secondary" className="text-xs gap-1">{monthOptions.find(m => m.value === periodoInicio)?.label}<X className="h-3 w-3 cursor-pointer" onClick={() => setPeriodoInicio("todos")} /></Badge>}
                      {periodoFim !== "todos" && <Badge variant="secondary" className="text-xs gap-1">Até: {monthOptions.find(m => m.value === periodoFim)?.label}<X className="h-3 w-3 cursor-pointer" onClick={() => setPeriodoFim("todos")} /></Badge>}
                      {categoriaFiltro !== "todos" && <Badge variant="secondary" className="text-xs gap-1">{categoriaFiltro}<X className="h-3 w-3 cursor-pointer" onClick={() => setCategoriaFiltro("todos")} /></Badge>}
                      {obraFiltro !== "todos" && <Badge variant="secondary" className="text-xs gap-1">{obraFiltro}<X className="h-3 w-3 cursor-pointer" onClick={() => setObraFiltro("todos")} /></Badge>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* KPIs PRINCIPAIS */}
            {/* ============================================================ */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <DashKpi label="Itens Cadastrados" value={data.resumo.totalItens} icon={HardHat} color="blue" />
              <DashKpi label="Estoque Total" value={data.resumo.estoqueTotal} icon={Package} color="green" sub="unidades em estoque" />
              <DashKpi label="Valor Inventário" value={fmtBRL(data.resumo.valorTotalInventario || 0)} icon={DollarSign} color="teal" />
              <DashKpi label="Entregas (30d)" value={data.resumo.entregasMes || 0} icon={ClipboardList} color="purple" sub="últimos 30 dias" />
              <DashKpi label="Custo Total Entregas" value={fmtBRL(data.custoTotalEntregas || 0)} icon={DollarSign} color="indigo" sub="valor total distribuído" />
            </div>

            {/* KPIs ALERTAS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <DashKpi label="Estoque Baixo" value={data.resumo.estoqueBaixo} icon={AlertTriangle} color="red" sub="≤ 5 unidades" />
              <DashKpi label="CA Vencido" value={data.resumo.caVencido} icon={ShieldAlert} color="orange" />
              <DashKpi label="CA Vencendo (90d)" value={data.resumo.casVencendoCount || 0} icon={Calendar} color="yellow" sub="próximos 90 dias" />
              <DashKpi label="Total Entregas" value={data.resumo.totalEntregas} icon={TrendingUp} color="indigo" />
              <DashKpi label="Func. Atendidos" value={data.resumo.funcUnicos || 0} icon={Users} color="slate" />
            </div>

            {/* Descontos de EPI foram movidos para Folha de Pagamento > Descontos EPI */}

            {/* ============================================================ */}
            {/* INSIGHTS PRINCIPAIS - NOVAS ANÁLISES */}
            {/* ============================================================ */}
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Insights de EPI
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Item mais utilizado */}
                {data.itemMaisUtilizado && (
                  <InsightCard
                    icon={ArrowUp}
                    title="Item Mais Utilizado"
                    value={data.itemMaisUtilizado.nome.length > 40 ? data.itemMaisUtilizado.nome.slice(0, 40) + '...' : data.itemMaisUtilizado.nome}
                    sub={`${data.itemMaisUtilizado.qtd} unidades entregues`}
                    color="green"
                    badge={data.itemMaisUtilizado.categoria}
                  />
                )}
                {/* Item menos utilizado */}
                {data.itemMenosUtilizado && (
                  <InsightCard
                    icon={ArrowDown}
                    title="Item Menos Utilizado"
                    value={data.itemMenosUtilizado.nome.length > 40 ? data.itemMenosUtilizado.nome.slice(0, 40) + '...' : data.itemMenosUtilizado.nome}
                    sub={`${data.itemMenosUtilizado.qtd} unidade(s) entregue(s)`}
                    color="amber"
                    badge={data.itemMenosUtilizado.categoria}
                  />
                )}
                {/* Item mais caro */}
                {data.itemMaisCaro && (
                  <InsightCard
                    icon={DollarSign}
                    title="Item Mais Caro"
                    value={data.itemMaisCaro.nome.length > 40 ? data.itemMaisCaro.nome.slice(0, 40) + '...' : data.itemMaisCaro.nome}
                    sub={`${fmtBRL(data.itemMaisCaro.valor)} por unidade`}
                    color="red"
                    badge={data.itemMaisCaro.categoria}
                  />
                )}
                {/* Item mais barato */}
                {data.itemMaisBarato && (
                  <InsightCard
                    icon={TrendingDown}
                    title="Item Mais Barato"
                    value={data.itemMaisBarato.nome.length > 40 ? data.itemMaisBarato.nome.slice(0, 40) + '...' : data.itemMaisBarato.nome}
                    sub={`${fmtBRL(data.itemMaisBarato.valor)} por unidade`}
                    color="teal"
                    badge={data.itemMaisBarato.categoria}
                  />
                )}
              </div>
            </div>

            {/* INSIGHTS FUNCIONÁRIOS + OBRA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Funcionário que mais recebe */}
              {data.funcMaisEpi && (
                <InsightCard
                  icon={Award}
                  title="Func. Mais Recebe EPI"
                  value={data.funcMaisEpi.nome.length > 30 ? data.funcMaisEpi.nome.slice(0, 30) + '...' : data.funcMaisEpi.nome}
                  sub={`${data.funcMaisEpi.qtd} unidades • ${data.funcMaisEpi.funcao}`}
                  color="purple"
                />
              )}
              {/* Funcionário que menos recebe */}
              {data.funcMenosEpi && (
                <InsightCard
                  icon={User}
                  title="Func. Menos Recebe EPI"
                  value={data.funcMenosEpi.nome.length > 30 ? data.funcMenosEpi.nome.slice(0, 30) + '...' : data.funcMenosEpi.nome}
                  sub={`${data.funcMenosEpi.qtd} unidade(s) • ${data.funcMenosEpi.funcao}`}
                  color="blue"
                />
              )}
              {/* Obra que mais solicita */}
              {data.obraMaisSolicita && (
                <InsightCard
                  icon={Building2}
                  title="Obra Mais Solicita EPI"
                  value={data.obraMaisSolicita.nome.length > 30 ? data.obraMaisSolicita.nome.slice(0, 30) + '...' : data.obraMaisSolicita.nome}
                  sub={`${data.obraMaisSolicita.unidades} unidades • ${data.obraMaisSolicita.entregas} entregas`}
                  color="orange"
                />
              )}
              {/* Previsão de consumo */}
              <InsightCard
                icon={Target}
                title="Previsão Próx. Mês"
                value={`~${data.mediaConsumo3m || 0} unidades`}
                sub={`Média últ. 3 meses • ~${data.mediaEntregas3m || 0} entregas`}
                color="indigo"
              />
            </div>

            {/* TAXA DE REPOSIÇÃO + CUSTO MÉDIO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InsightCard
                icon={Repeat}
                title="Taxa de Reposição"
                value={fmtPct(data.taxaReposicao || 0)}
                sub={`${data.totalReposicoes || 0} reposições de ${data.resumo.totalEntregas} entregas`}
                color="red"
              />
              <InsightCard
                icon={Activity}
                title="Custo Médio por Funcionário"
                value={fmtBRL(data.resumo.custoMedioPorFunc || 0)}
                sub={`${data.resumo.funcUnicos || 0} funcionários atendidos`}
                color="teal"
              />
              <InsightCard
                icon={Flame}
                title="EPI Mais Perdido/Estragado"
                value={data.topEpiPerdidos?.[0]?.nome?.length > 35 ? data.topEpiPerdidos[0].nome.slice(0, 35) + '...' : (data.topEpiPerdidos?.[0]?.nome || 'Nenhum')}
                sub={data.topEpiPerdidos?.[0] ? `${data.topEpiPerdidos[0].qtd} ocorrências` : 'Sem reposições registradas'}
                color="orange"
              />
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 1: Consumo Mensal + Evolução Custo */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashChart
                title={`Consumo Mensal de EPIs${hasActiveFilters ? ' (filtrado)' : ' (últimos 12 meses)'}`}
                type="bar"
                labels={consumoFiltrado.map((r: any) => r.mes)}
                datasets={[
                  { label: "Unidades", data: consumoFiltrado.map((r: any) => r.unidades), backgroundColor: CHART_PALETTE[0] },
                  { label: "Entregas", data: consumoFiltrado.map((r: any) => r.entregas), backgroundColor: CHART_PALETTE[5] },
                ]}
                height={280}
              />
              <DashChart
                title="Evolução do Custo Mensal (R$)"
                type="line"
                labels={custoFiltrado.map((r: any) => r.mes)}
                datasets={[{
                  label: "Custo Estimado (R$)",
                  data: custoFiltrado.map((r: any) => r.custoEstimado),
                  borderColor: CHART_PALETTE[1],
                  backgroundColor: CHART_FILL.verde,
                  fill: true,
                  tension: 0.3,
                }]}
                height={280}
              />
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 2: Distribuição por Categoria + Motivos de Reposição */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(categoriasFiltradas).length > 0 && (
                <DashChart
                  title="Distribuição por Categoria"
                  type="doughnut"
                  labels={Object.keys(categoriasFiltradas)}
                  datasets={[{
                    label: "Itens",
                    data: Object.values(categoriasFiltradas).map((c: any) => c.itens),
                    backgroundColor: [CHART_PALETTE[1], CHART_PALETTE[4], CHART_PALETTE[2], CHART_PALETTE[3]],
                  }]}
                  height={280}
                />
              )}
              {data.reposicaoPorMotivo && Object.keys(data.reposicaoPorMotivo).length > 0 && (
                <DashChart
                  title="Motivos de Reposição (Perdas/Danos)"
                  type="doughnut"
                  labels={Object.keys(data.reposicaoPorMotivo)}
                  datasets={[{
                    label: "Ocorrências",
                    data: Object.values(data.reposicaoPorMotivo) as number[],
                    backgroundColor: [CHART_PALETTE[3], CHART_PALETTE[2], CHART_PALETTE[4], CHART_PALETTE[0], CHART_PALETTE[6], CHART_PALETTE[8]],
                  }]}
                  height={280}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 3: Top EPIs + Top Funcionários */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.topEpis?.length > 0 && (
                <DashChart
                  title="Top 10 EPIs Mais Entregues"
                  type="horizontalBar"
                  labels={data.topEpis.map((e: any) => e.nome.length > 30 ? e.nome.slice(0, 30) + "..." : e.nome)}
                  datasets={[{ label: "Unidades", data: data.topEpis.map((e: any) => e.qtd), backgroundColor: CHART_PALETTE[1] }]}
                  height={Math.max(220, data.topEpis.length * 28)}
                />
              )}
              {data.topFuncionarios?.length > 0 && (
                <DashChart
                  title="Top 10 Funcionários (mais EPIs)"
                  type="horizontalBar"
                  labels={data.topFuncionarios.map((f: any) => f.nome.length > 25 ? f.nome.slice(0, 25) + "..." : f.nome)}
                  datasets={[{ label: "Unidades", data: data.topFuncionarios.map((f: any) => f.qtd), backgroundColor: CHART_PALETTE[4] }]}
                  height={Math.max(220, data.topFuncionarios.length * 28)}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 4: Custo por Funcionário + Entregas por Obra */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.custoPorFuncionario?.length > 0 && (
                <DashChart
                  title="Top 10 Custo de EPI por Funcionário (R$)"
                  type="horizontalBar"
                  labels={data.custoPorFuncionario.map((f: any) => f.nome.length > 25 ? f.nome.slice(0, 25) + "..." : f.nome)}
                  datasets={[{ label: "Custo (R$)", data: data.custoPorFuncionario.map((f: any) => f.custo), backgroundColor: CHART_PALETTE[2] }]}
                  height={Math.max(220, data.custoPorFuncionario.length * 28)}
                />
              )}
              {obrasFiltradas.length > 0 && (
                <DashChart
                  title={`Entregas por Obra${obraFiltro !== 'todos' ? ` — ${obraFiltro}` : ''}`}
                  type="horizontalBar"
                  labels={obrasFiltradas.map((o: any) => o.nome.length > 30 ? o.nome.slice(0, 30) + "..." : o.nome)}
                  datasets={[{ label: "Unidades", data: obrasFiltradas.map((o: any) => o.unidades), backgroundColor: CHART_PALETTE[0] }]}
                  height={Math.max(200, obrasFiltradas.length * 30)}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* GRÁFICO: EPIs Mais Perdidos/Estragados */}
            {/* ============================================================ */}
            {data.topEpiPerdidos?.length > 0 && (
              <DashChart
                title="Top 10 EPIs Mais Perdidos/Estragados"
                type="horizontalBar"
                labels={data.topEpiPerdidos.map((e: any) => e.nome.length > 35 ? e.nome.slice(0, 35) + "..." : e.nome)}
                datasets={[{ label: "Ocorrências", data: data.topEpiPerdidos.map((e: any) => e.qtd), backgroundColor: CHART_PALETTE[3] }]}
                height={Math.max(200, data.topEpiPerdidos.length * 28)}
              />
            )}

            {/* ============================================================ */}
            {/* GRÁFICO: Entregas por Motivo */}
            {/* ============================================================ */}
            {data.porMotivo && Object.keys(data.porMotivo).length > 0 && (
              <DashChart
                title="Todas as Entregas por Motivo"
                type="doughnut"
                labels={Object.keys(data.porMotivo)}
                datasets={[{
                  label: "Entregas",
                  data: Object.values(data.porMotivo) as number[],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[3], CHART_PALETTE[2], CHART_PALETTE[1], CHART_PALETTE[4], CHART_PALETTE[6]],
                }]}
                height={260}
              />
            )}

            {/* ============================================================ */}
            {/* TABELA: Resumo por Categoria */}
            {/* ============================================================ */}
            {Object.keys(categoriasFiltradas).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" /> Resumo por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Categoria</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Itens</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(categoriasFiltradas).map(([cat, vals]: [string, any]) => (
                          <tr key={cat} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium flex items-center gap-2">
                              {cat === 'EPI' && <Shield className="h-4 w-4 text-emerald-500" />}
                              {cat === 'Uniforme' && <Shirt className="h-4 w-4 text-indigo-500" />}
                              {cat === 'Calçado' && <Footprints className="h-4 w-4 text-amber-500" />}
                              {cat}
                            </td>
                            <td className="py-2 pr-3 text-right">{vals.itens}</td>
                            <td className="py-2 pr-3 text-right">{vals.estoque}</td>
                            <td className="py-2 text-right font-medium">{fmtBRL(vals.valor)}</td>
                          </tr>
                        ))}
                        {Object.keys(categoriasFiltradas).length > 1 && (
                          <tr className="border-t-2 font-bold">
                            <td className="py-2 pr-3">Total</td>
                            <td className="py-2 pr-3 text-right">{Object.values(categoriasFiltradas).reduce((s: number, v: any) => s + v.itens, 0)}</td>
                            <td className="py-2 pr-3 text-right">{Object.values(categoriasFiltradas).reduce((s: number, v: any) => s + v.estoque, 0)}</td>
                            <td className="py-2 text-right">{fmtBRL(Object.values(categoriasFiltradas).reduce((s: number, v: any) => s + v.valor, 0))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: Custo por Obra (detalhado com R$) */}
            {/* ============================================================ */}
            {data.custoPorObraRanking?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" /> Custo de EPI por Obra (detalhado)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Obra</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Entregas</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Unidades</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Custo (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.custoPorObraRanking.map((o: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{o.nome}</td>
                            <td className="py-2 pr-3 text-right">{o.entregas}</td>
                            <td className="py-2 pr-3 text-right font-bold">{o.unidades}</td>
                            <td className="py-2 text-right font-medium">{fmtBRL(o.custo || 0)}</td>
                          </tr>
                        ))}
                        {data.custoPorObraRanking.length > 1 && (
                          <tr className="border-t-2 font-bold">
                            <td className="py-2 pr-3">Total</td>
                            <td className="py-2 pr-3 text-right">{data.custoPorObraRanking.reduce((s: number, o: any) => s + o.entregas, 0)}</td>
                            <td className="py-2 pr-3 text-right">{data.custoPorObraRanking.reduce((s: number, o: any) => s + o.unidades, 0)}</td>
                            <td className="py-2 text-right">{fmtBRL(data.custoPorObraRanking.reduce((s: number, o: any) => s + (o.custo || 0), 0))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: Custo por Funcionário (detalhado) */}
            {/* ============================================================ */}
            {data.custoPorFuncionario?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-500" /> Custo de EPI por Funcionário (Top 10)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Funcionário</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Função</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Entregas</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Unidades</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Custo (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.custoPorFuncionario.map((f: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 font-medium">{f.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{f.funcao}</td>
                            <td className="py-2 pr-3 text-right">{f.entregas}</td>
                            <td className="py-2 pr-3 text-right">{f.qtd}</td>
                            <td className="py-2 text-right font-bold text-amber-700">{fmtBRL(f.custo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: EPIs Mais Perdidos/Estragados */}
            {/* ============================================================ */}
            {data.topEpiPerdidos?.length > 0 && (
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Flame className="h-4 w-4 text-red-500" /> EPIs Mais Perdidos/Estragados (Ranking)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Ocorrências</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topEpiPerdidos.map((e: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{e.ca}</Badge></td>
                            <td className="py-2 text-right font-bold text-red-600">{e.qtd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: CAs Vencendo nos próximos 90 dias */}
            {/* ============================================================ */}
            {data.casVencendo?.length > 0 && (
              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-yellow-500" /> CAs Vencendo nos Próximos 90 Dias ({data.casVencendo.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Vencimento</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.casVencendo.map((e: any, i: number) => {
                          const dias = Math.ceil((new Date(e.validadeCa + "T00:00:00").getTime() - Date.now()) / 86400000);
                          return (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-2 pr-3 font-medium">{e.nome}</td>
                              <td className="py-2 pr-3"><Badge variant="outline">{e.ca}</Badge></td>
                              <td className="py-2 pr-3">
                                <span className={dias <= 30 ? "text-red-600 font-semibold" : dias <= 60 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                                  {new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">({dias}d)</span>
                              </td>
                              <td className="py-2 text-right">{e.estoque}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: Estoque Crítico */}
            {/* ============================================================ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Estoque Crítico (menores estoques)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.estoqueCritico?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item com estoque crítico</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                          <th className="py-2 font-medium text-muted-foreground">Validade CA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.estoqueCritico?.map((e: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.ca || "-"}</td>
                            <td className={`py-2 pr-3 text-right font-bold ${e.estoque <= 5 ? "text-red-600" : "text-foreground"}`}>{e.estoque}</td>
                            <td className={`py-2 ${e.validadeCa && e.validadeCa < new Date().toISOString().split("T")[0] ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                              {e.validadeCa ? new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* TABELA: CAs Vencidos */}
            {/* ============================================================ */}
            {data.caVencidos?.length > 0 && (
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500" /> Certificados de Aprovação Vencidos ({data.caVencidos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 font-medium text-muted-foreground">Vencimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.caVencidos.map((e: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.ca || "-"}</td>
                            <td className="py-2 text-red-600 font-semibold">
                              {e.validadeCa ? new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
