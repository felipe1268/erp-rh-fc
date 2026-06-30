import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { EmpNameWithStatus } from "@/components/EmpStatusBadge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  HardHat, Package, AlertTriangle, ShieldAlert, TrendingUp, Users,
  DollarSign, Calendar, Building2, ClipboardList, Loader2,
  Shirt, Footprints, Shield, Filter, X, SlidersHorizontal,
  ChevronRight, ChevronDown, CheckCircle2, XCircle, FileText, User,
  ArrowUp, ArrowDown, TrendingDown, BarChart3, Target,
  Zap, Repeat, Activity, Award, Flame, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// Artigos e preposições que ficam em minúsculas no meio da frase (PT-BR)
const PT_LOWER = new Set(["a","o","as","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas","por","para","com","sem","sob","sobre","entre","até","desde","após","ante","e","ou","que","ao","aos","à","às","se"]);
// Siglas que devem aparecer em MAIÚSCULAS mesmo após title-case
const ACRONYMS = new Set(["EPI","NR","CA","CNPJ","CPF","CIPA","PJ","CLT","OS","NF"]);

const MOTIVO_MAP: Record<string, string> = {
  regular: "Entrega Regular",
  entrega_regular: "Entrega Regular",
  "entrega regular": "Entrega Regular",
  desgaste: "Desgaste",
  desgaste_normal: "Desgaste Normal",
  "desgaste normal": "Desgaste Normal",
  perda: "Perda",
  dano: "Dano",
  extravio: "Extravio",
  vencido: "Vencido",
  troca_tamanho: "Troca de Tamanho",
  "troca tamanho": "Troca de Tamanho",
  novo_funcionario: "Novo Funcionário",
  "novo funcionario": "Novo Funcionário",
  mau_uso: "Mau Uso",
  "mau uso": "Mau Uso",
  descarte: "Descarte",
  descarte_expirado: "Descarte / Expirado",
  "descarte / expirado": "Descarte / Expirado",
  kit_admissao: "Kit Admissão",
  "kit admissao": "Kit Admissão",
  primeira_aquisicao: "Primeira Aquisição",
  "primeira aquisicao": "Primeira Aquisição",
  visita_tecnica: "Visita Técnica",
  "visita tecnica": "Visita Técnica",
};

function formatMotivo(raw: string): string {
  if (!raw) return "—";
  const key = raw.trim().toLowerCase().replace(/_/g, " ");
  if (MOTIVO_MAP[key]) return MOTIVO_MAP[key];
  // Generic: replace underscores, apply PT-BR title-case
  const words = raw.replace(/_/g, " ").trim().split(/\s+/);
  const result = words.map((w, i) => {
    const up = w.toUpperCase();
    if (ACRONYMS.has(up)) return up;
    const lo = w.toLowerCase();
    if (i > 0 && PT_LOWER.has(lo)) return lo;
    return lo.charAt(0).toUpperCase() + lo.slice(1);
  }).join(" ");
  // Fix known acronyms that may end up as "Epi", "Nr", etc.
  return result.replace(/\bEpi\b/g, "EPI").replace(/\bNr\b/g, "NR").replace(/\bCa\b/g, "CA");
}

// Agrupa porMotivo normalizando labels (funde "Entrega regular" + "Entrega Regular" etc.)
function buildPorMotivoNormalized(raw: Record<string, number>): { labels: string[]; data: number[]; rawByLabel: Record<string, string[]> } {
  const acc: Record<string, { count: number; raws: string[] }> = {};
  for (const [key, count] of Object.entries(raw)) {
    const label = formatMotivo(key);
    if (!acc[label]) acc[label] = { count: 0, raws: [] };
    acc[label].count += count;
    acc[label].raws.push(key);
  }
  const labels = Object.keys(acc);
  const data = labels.map(l => acc[l].count);
  const rawByLabel: Record<string, string[]> = {};
  for (const [l, v] of Object.entries(acc)) rawByLabel[l] = v.raws;
  return { labels, data, rawByLabel };
}

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

function BackfillFichasButton({ companyId, onDone, semFicha }: { companyId: number; onDone: () => void; semFicha: number }) {
  const backfillMut = trpc.epis.backfillFichas.useMutation({
    onSuccess: (data) => {
      onDone();
      alert(`Fichas geradas: ${data.generated} de ${data.total}${data.errors ? ` (${data.errors} erros)` : ''}`);
    },
    onError: (err) => alert('Erro ao gerar fichas: ' + err.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
      disabled={backfillMut.isPending}
      onClick={() => backfillMut.mutate({ companyId })}
    >
      <FileText className="h-3.5 w-3.5" />
      {backfillMut.isPending ? 'Gerando...' : `Gerar ${semFicha} fichas`}
    </Button>
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
  const [selectedMotivo, setSelectedMotivo] = useState<string | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [selectedEmpName, setSelectedEmpName] = useState<string>("");
  const motivoDetailRef = useRef<HTMLDivElement>(null);
  const kpiDetailRef = useRef<HTMLDivElement>(null);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [expandedEpiId, setExpandedEpiId] = useState<number | null>(null);
  const [detalheEpi, setDetalheEpi] = useState<any | null>(null);
  const [fichaModal, setFichaModal] = useState<{ employeeId: number; employeeName: string; epiNome: string } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; nome: string } | null>(null);
  const fichaDeliveriesRaw = trpc.epis.listDeliveries.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}), employeeId: fichaModal?.employeeId, limit: 200, offset: 0 },
    { enabled: !!fichaModal }
  );
  const fichaDeliveries = { ...fichaDeliveriesRaw, data: fichaDeliveriesRaw.data?.items };

  function handleKpiClick(kpi: string) {
    const newVal = activeKpi === kpi ? null : kpi;
    setActiveKpi(newVal);
    if (newVal) {
      setTimeout(() => kpiDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }

  const empDeliveriesRaw = trpc.epis.listDeliveries.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}), employeeId: selectedEmpId!, limit: 200, offset: 0 },
    { enabled: !!selectedEmpId }
  );
  const empDeliveriesQuery = { ...empDeliveriesRaw, data: empDeliveriesRaw.data?.items };


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
    <>
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
              <DashKpi label="Itens Cadastrados" value={data.resumo.totalItens} icon={HardHat} color="blue" onClick={() => handleKpiClick("itens")} active={activeKpi === "itens"} dimmed={!!activeKpi && activeKpi !== "itens"} />
              <DashKpi label="Estoque Total" value={data.resumo.estoqueTotal} icon={Package} color="green" sub="unidades em estoque" onClick={() => handleKpiClick("estoque")} active={activeKpi === "estoque"} dimmed={!!activeKpi && activeKpi !== "estoque"} />
              <DashKpi label="Valor Inventário" value={fmtBRL(data.resumo.valorTotalInventario || 0)} icon={DollarSign} color="teal" onClick={() => handleKpiClick("inventario")} active={activeKpi === "inventario"} dimmed={!!activeKpi && activeKpi !== "inventario"} />
              <DashKpi label="Entregas (30d)" value={data.resumo.entregasMes || 0} icon={ClipboardList} color="purple" sub="últimos 30 dias" onClick={() => handleKpiClick("entregas30d")} active={activeKpi === "entregas30d"} dimmed={!!activeKpi && activeKpi !== "entregas30d"} />
              <DashKpi label="Custo Total Entregas" value={fmtBRL(data.custoTotalEntregas || 0)} icon={DollarSign} color="indigo" sub="valor total distribuído" onClick={() => handleKpiClick("custoEntregas")} active={activeKpi === "custoEntregas"} dimmed={!!activeKpi && activeKpi !== "custoEntregas"} />
            </div>

            {/* KPIs ALERTAS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <DashKpi label="Estoque Baixo" value={data.resumo.estoqueBaixo} icon={AlertTriangle} color="red" sub="≤ 5 unidades" onClick={() => handleKpiClick("estoqueBaixo")} active={activeKpi === "estoqueBaixo"} dimmed={!!activeKpi && activeKpi !== "estoqueBaixo"} />
              <DashKpi label="CA Vencido" value={data.resumo.caVencido} icon={ShieldAlert} color="orange" onClick={() => handleKpiClick("caVencido")} active={activeKpi === "caVencido"} dimmed={!!activeKpi && activeKpi !== "caVencido"} />
              <DashKpi label="CA Vencendo (90d)" value={data.resumo.casVencendoCount || 0} icon={Calendar} color="yellow" sub="próximos 90 dias" onClick={() => handleKpiClick("caVencendo")} active={activeKpi === "caVencendo"} dimmed={!!activeKpi && activeKpi !== "caVencendo"} />
              <DashKpi label="Total Entregas" value={data.resumo.totalEntregas} icon={TrendingUp} color="indigo" onClick={() => handleKpiClick("totalEntregas")} active={activeKpi === "totalEntregas"} dimmed={!!activeKpi && activeKpi !== "totalEntregas"} />
              <DashKpi label="Func. Atendidos" value={data.resumo.funcUnicos || 0} icon={Users} color="slate" onClick={() => handleKpiClick("funcAtendidos")} active={activeKpi === "funcAtendidos"} dimmed={!!activeKpi && activeKpi !== "funcAtendidos"} />
            </div>

            {activeKpi && (
              <div ref={kpiDetailRef}>
                <Card className="border-blue-300 bg-blue-50/30 shadow-lg ring-2 ring-blue-300 ring-offset-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-blue-600" />
                        {activeKpi === "itens" && "Todos os EPIs Cadastrados"}
                        {activeKpi === "estoque" && "Estoque por Item"}
                        {activeKpi === "inventario" && "Valor do Inventário por Item"}
                        {activeKpi === "entregas30d" && "Entregas nos Últimos 30 Dias"}
                        {activeKpi === "custoEntregas" && "Custo das Entregas por Funcionário"}
                        {activeKpi === "estoqueBaixo" && "Itens com Estoque Crítico (≤ 5 unidades)"}
                        {activeKpi === "caVencido" && "EPIs com CA Vencido"}
                        {activeKpi === "caVencendo" && "EPIs com CA Vencendo nos Próximos 90 Dias"}
                        {activeKpi === "totalEntregas" && "Ranking de EPIs Mais Entregues"}
                        {activeKpi === "funcAtendidos" && "Funcionários que Mais Receberam EPIs"}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setActiveKpi(null)}>
                        <X className="h-3 w-3 mr-1" /> Fechar
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      {(activeKpi === "itens" || activeKpi === "estoque" || activeKpi === "inventario") && (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Categoria</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                              {activeKpi === "inventario" && <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Valor Unit.</th>}
                              {activeKpi === "inventario" && <th className="py-2 font-medium text-muted-foreground text-right">Valor Total</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {(data.todosEpisResumo || [])
                              .sort((a: any, b: any) => activeKpi === "inventario"
                                ? (b.valorUnit * b.estoque) - (a.valorUnit * a.estoque)
                                : activeKpi === "estoque" ? b.estoque - a.estoque : a.nome.localeCompare(b.nome))
                              .map((e: any, i: number) => (
                                <tr key={i} className={`border-b border-border/50 ${e.estoque <= 5 ? "bg-red-50/50" : ""}`}>
                                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                  <td className="py-2 pr-3 font-medium">{e.nome}</td>
                                  <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{e.ca || "-"}</Badge></td>
                                  <td className="py-2 pr-3 text-muted-foreground text-xs">{e.categoria}</td>
                                  <td className={`py-2 pr-3 text-right font-bold ${e.estoque <= 5 ? "text-red-600" : "text-green-700"}`}>{e.estoque}</td>
                                  {activeKpi === "inventario" && <td className="py-2 pr-3 text-right text-muted-foreground">{e.valorUnit > 0 ? fmtBRL(e.valorUnit) : "-"}</td>}
                                  {activeKpi === "inventario" && <td className="py-2 text-right font-medium text-teal-700">{e.valorUnit > 0 ? fmtBRL(e.valorUnit * e.estoque) : "-"}</td>}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}

                      {activeKpi === "estoqueBaixo" && (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                              <th className="py-2 font-medium text-muted-foreground">Validade CA</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.todosEpisResumo || []).filter((e: any) => e.estoque <= 5).sort((a: any, b: any) => a.estoque - b.estoque).map((e: any, i: number) => (
                              <tr key={i} className="border-b border-border/50 bg-red-50/30">
                                <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                <td className="py-2 pr-3 font-medium">{e.nome}</td>
                                <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{e.ca || "-"}</Badge></td>
                                <td className="py-2 pr-3 text-right font-bold text-red-600">{e.estoque}</td>
                                <td className="py-2 text-muted-foreground">{e.validadeCa ? fmtDate(e.validadeCa) : "-"}</td>
                              </tr>
                            ))}
                            {(data.todosEpisResumo || []).filter((e: any) => e.estoque <= 5).length === 0 && (
                              <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum item com estoque baixo</td></tr>
                            )}
                          </tbody>
                        </table>
                      )}

                      {activeKpi === "caVencido" && (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                              <th className="py-2 font-medium text-muted-foreground">Validade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.caVencidos || []).map((e: any, i: number) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                <td className="py-2 pr-3 font-medium">{e.nome}</td>
                                <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{e.ca || "-"}</Badge></td>
                                <td className="py-2 text-red-600 font-semibold">{e.validadeCa ? fmtDate(e.validadeCa) : "-"}</td>
                              </tr>
                            ))}
                            {(data.caVencidos || []).length === 0 && (
                              <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Nenhum CA vencido</td></tr>
                            )}
                          </tbody>
                        </table>
                      )}

                      {activeKpi === "caVencendo" && (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                              <th className="py-2 font-medium text-muted-foreground">Vence em</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.casVencendo || []).map((e: any, i: number) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                <td className="py-2 pr-3 font-medium">{e.nome}</td>
                                <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{e.ca || "-"}</Badge></td>
                                <td className="py-2 pr-3 text-right">{e.estoque}</td>
                                <td className="py-2 text-yellow-700 font-semibold">{e.validadeCa ? fmtDate(e.validadeCa) : "-"}</td>
                              </tr>
                            ))}
                            {(data.casVencendo || []).length === 0 && (
                              <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum CA vencendo nos próximos 90 dias</td></tr>
                            )}
                          </tbody>
                        </table>
                      )}

                      {(activeKpi === "totalEntregas" || activeKpi === "entregas30d") && (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Entregas</th>
                              <th className="py-2 font-medium text-muted-foreground text-right">Unidades</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(activeKpi === "entregas30d" ? (data.topEpis30d || []) : (data.topEpis || [])).map((e: any, i: number) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                <td className="py-2 pr-3 font-medium">{e.nome}</td>
                                <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{e.ca || "-"}</Badge></td>
                                <td className="py-2 pr-3 text-right font-bold text-purple-700">{e.entregas}</td>
                                <td className="py-2 text-right">{e.qtd}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {(activeKpi === "custoEntregas" || activeKpi === "funcAtendidos") && (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Funcionário</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Função</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Entregas</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Unidades</th>
                              {activeKpi === "custoEntregas" && <th className="py-2 font-medium text-muted-foreground text-right">Custo</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {(activeKpi === "custoEntregas" ? (data.custoPorFuncionario || []) : (data.topFuncionarios || []))
                              .map((f: any, i: number) => (
                                <tr
                                  key={i}
                                  className="border-b border-border/50 cursor-pointer hover:bg-purple-50 transition-colors"
                                  onClick={() => { setSelectedEmpId(f.id); setSelectedEmpName(f.nome); }}
                                  title="Clique para ver EPIs entregues"
                                >
                                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                  <td className="py-2 pr-3 font-medium text-blue-700 hover:underline flex items-center gap-1.5">
                                    <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
                                    <EmpNameWithStatus nome={f.nome} isDesligado={f.isDesligado} maxWidth="max-w-[200px]" />
                                  </td>
                                  <td className="py-2 pr-3 text-muted-foreground">{f.funcao}</td>
                                  <td className="py-2 pr-3 text-right">{f.entregas}</td>
                                  <td className="py-2 pr-3 text-right">{f.qtd}</td>
                                  {activeKpi === "custoEntregas" && (
                                    <td className="py-2 text-right font-bold text-amber-700">{fmtBRL(f.custo)}</td>
                                  )}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

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
                  value={(data.funcMaisEpi.nome.length > 30 ? data.funcMaisEpi.nome.slice(0, 30) + '...' : data.funcMaisEpi.nome) + (data.funcMaisEpi.isDesligado ? ' (Desligado)' : '')}
                  sub={`${data.funcMaisEpi.qtd} unidades • ${data.funcMaisEpi.funcao}`}
                  color="purple"
                />
              )}
              {/* Funcionário que menos recebe */}
              {data.funcMenosEpi && (
                <InsightCard
                  icon={User}
                  title="Func. Menos Recebe EPI"
                  value={(data.funcMenosEpi.nome.length > 30 ? data.funcMenosEpi.nome.slice(0, 30) + '...' : data.funcMenosEpi.nome) + (data.funcMenosEpi.isDesligado ? ' (Desligado)' : '')}
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
            {/* ANÁLISE: Vida Útil Esperada vs. Tempo Real de Troca */}
            {/* ============================================================ */}
            {data.vidaUtilAnalise?.length > 0 && (() => {
              const analise = (data.vidaUtilAnalise as any[]).sort((a: any, b: any) => a.percentual - b.percentual);
              const criticos = analise.filter((a: any) => a.status === 'critico');
              const atencao = analise.filter((a: any) => a.status === 'atencao');
              return (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-orange-600" />
                        Vida Útil Esperada vs. Tempo Real de Troca
                        <span className="text-xs text-muted-foreground font-normal ml-2">
                          (baseado nos intervalos entre entregas do mesmo EPI ao mesmo funcionário)
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {criticos.length > 0 && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" />
                            {criticos.length} EPI(s) com desgaste antecipado crítico — durando menos da metade da vida útil esperada
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            Possíveis causas: mau uso pelos funcionários, qualidade inferior do EPI, ou condições de trabalho adversas.
                          </p>
                        </div>
                      )}
                      {atencao.length > 0 && criticos.length === 0 && (
                        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm font-semibold text-yellow-700 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" />
                            {atencao.length} EPI(s) com desgaste acima do esperado — atenção recomendada
                          </p>
                        </div>
                      )}
                      <DashChart
                        title=""
                        type="horizontalBar"
                        labels={analise.map((a: any) => a.nome.length > 25 ? a.nome.slice(0, 25) + "..." : a.nome)}
                        datasets={[
                          {
                            label: "Vida Útil Esperada (dias)",
                            data: analise.map((a: any) => a.esperado),
                            backgroundColor: "rgba(34, 197, 94, 0.6)",
                          },
                          {
                            label: "Tempo Médio Real (dias)",
                            data: analise.map((a: any) => a.mediaReal),
                            backgroundColor: analise.map((a: any) =>
                              a.status === 'critico' ? "rgba(239, 68, 68, 0.7)" :
                              a.status === 'atencao' ? "rgba(234, 179, 8, 0.7)" :
                              "rgba(59, 130, 246, 0.6)"
                            ),
                          },
                        ]}
                        height={Math.max(250, analise.length * 40)}
                        onChartClick={(info) => setDetalheEpi(analise[info.dataIndex] ?? null)}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-4 w-4 text-red-600" />
                        Detalhamento — Análise de Durabilidade por EPI
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Categoria</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Esperado</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Real Médio</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Diferença</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Status</th>
                              <th className="py-2 font-medium text-muted-foreground text-right">Entregas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analise.map((a: any, i: number) => {
                              const isExpanded = expandedEpiId === a.epiId;
                              const hasFuncs = a.funcDetalhe?.length > 0;
                              const MOTIVO_LABELS: Record<string, string> = {
                                regular: formatMotivo('regular'),
                                desgaste: formatMotivo('desgaste'),
                                perda: formatMotivo('perda'),
                                dano: formatMotivo('dano'),
                                extravio: formatMotivo('extravio'),
                                vencido: formatMotivo('vencido'),
                                troca_tamanho: formatMotivo('troca_tamanho'),
                                novo_funcionario: formatMotivo('novo_funcionario'),
                              };
                              return (
                                <Fragment key={i}>
                                  <tr
                                    className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/40 ${a.status === 'critico' ? 'bg-red-50/50' : a.status === 'atencao' ? 'bg-yellow-50/30' : ''} ${isExpanded ? 'bg-muted/30' : ''}`}
                                    onClick={() => setExpandedEpiId(isExpanded ? null : a.epiId)}
                                  >
                                    <td className="py-2 pr-3 font-medium">
                                      <div className="flex items-center gap-1.5">
                                        {hasFuncs ? (
                                          isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        ) : <span className="w-3.5" />}
                                        {a.nome}
                                      </div>
                                    </td>
                                    <td className="py-2 pr-3 text-xs text-muted-foreground">{a.categoria}</td>
                                    <td className="py-2 pr-3 text-right text-green-700 font-semibold">{a.esperado}d</td>
                                    <td className={`py-2 pr-3 text-right font-bold ${a.status === 'critico' ? 'text-red-600' : a.status === 'atencao' ? 'text-yellow-700' : 'text-blue-600'}`}>
                                      {a.mediaReal}d
                                    </td>
                                    <td className="py-2 pr-3 text-right">
                                      {a.mediaReal < a.esperado ? (
                                        <span className="text-red-600 flex items-center justify-end gap-0.5">
                                          <ArrowDown className="h-3 w-3" />
                                          {a.esperado - a.mediaReal}d antes
                                        </span>
                                      ) : (
                                        <span className="text-green-600 flex items-center justify-end gap-0.5">
                                          <ArrowUp className="h-3 w-3" />
                                          +{a.mediaReal - a.esperado}d
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 pr-3">
                                      <Badge variant={a.status === 'critico' ? 'destructive' : a.status === 'atencao' ? 'outline' : 'default'}
                                        className={`text-[10px] ${a.status === 'atencao' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' : a.status === 'ok' ? 'bg-green-100 text-green-700 border-green-300' : ''}`}>
                                        {a.status === 'critico' ? 'CRÍTICO' : a.status === 'atencao' ? 'ATENÇÃO' : 'OK'}
                                      </Badge>
                                    </td>
                                    <td className="py-2 text-right text-muted-foreground">{a.totalEntregas}</td>
                                  </tr>
                                  {isExpanded && hasFuncs && (
                                    <tr>
                                      <td colSpan={7} className="p-0">
                                        <div className="bg-muted/20 border-b px-4 py-3">
                                          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5" />
                                            Funcionários que receberam — {a.nome}
                                            <span className="text-muted-foreground font-normal">({a.funcDetalhe.length} funcionário{a.funcDetalhe.length !== 1 ? 's' : ''})</span>
                                          </p>
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="text-left text-muted-foreground">
                                                  <th className="py-1 pr-3 font-medium">Funcionário</th>
                                                  <th className="py-1 pr-3 font-medium">Função</th>
                                                  <th className="py-1 pr-3 font-medium text-center">Entregas</th>
                                                  <th className="py-1 pr-3 font-medium text-center">Média (dias)</th>
                                                  <th className="py-1 font-medium">Datas das Entregas</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {a.funcDetalhe.map((f: any, fi: number) => (
                                                  <tr key={fi} className="border-t border-border/30">
                                                    <td className="py-1.5 pr-3 font-medium">
                                                      <button
                                                        className="text-left hover:text-blue-600 hover:underline cursor-pointer transition-colors flex items-center gap-2"
                                                        onClick={(e) => { e.stopPropagation(); setFichaModal({ employeeId: f.employeeId, employeeName: f.nome, epiNome: a.nome }); }}
                                                      >
                                                        {f.fotoUrl ? (
                                                          <img src={f.fotoUrl} alt={f.nome} onClick={(e) => { e.stopPropagation(); setFotoAmpliada({ url: f.fotoUrl, nome: f.nome }); }} className="h-7 w-7 rounded-full object-cover border border-gray-200 flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-blue-400 transition-all" />
                                                        ) : (
                                                          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                            <span className="text-[9px] font-bold text-blue-700">{(f.nome || "?").split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("")}</span>
                                                          </div>
                                                        )}
                                                        <EmpNameWithStatus nome={f.nome} isDesligado={f.isDesligado} maxWidth="max-w-[180px]" />
                                                      </button>
                                                    </td>
                                                    <td className="py-1.5 pr-3 text-muted-foreground">{f.funcao}</td>
                                                    <td className="py-1.5 pr-3 text-center">{f.entregas}</td>
                                                    <td className="py-1.5 pr-3 text-center">
                                                      {f.entregas >= 2 ? (
                                                        <span className={`font-bold ${f.diasReal < a.esperado * 0.5 ? 'text-red-600' : f.diasReal < a.esperado ? 'text-yellow-600' : 'text-green-600'}`}>
                                                          {f.diasReal}d
                                                        </span>
                                                      ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                      )}
                                                    </td>
                                                    <td className="py-1.5">
                                                      <div className="flex flex-wrap gap-1">
                                                        {(f.datasEntrega || []).map((dt: string, di: number) => (
                                                          <span key={di} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-background border text-[10px]">
                                                            {fmtDate(dt)}
                                                            {f.motivos?.[di] && f.motivos[di] !== 'regular' && (
                                                              <span className="text-muted-foreground">· {formatMotivo(f.motivos[di])}</span>
                                                            )}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* ============================================================ */}
            {/* GRÁFICO: Entregas por Motivo */}
            {/* ============================================================ */}
            {data.porMotivo && Object.keys(data.porMotivo).length > 0 && (() => {
              const { labels: mLabels, data: mData, rawByLabel } = buildPorMotivoNormalized(data.porMotivo as Record<string, number>);
              return (
                <DashChart
                  title="Todas as Entregas por Motivo — clique em uma fatia para ver detalhes"
                  type="doughnut"
                  labels={mLabels}
                  datasets={[{
                    label: "Entregas",
                    data: mData,
                    backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[3], CHART_PALETTE[2], CHART_PALETTE[1], CHART_PALETTE[4], CHART_PALETTE[6]],
                  }]}
                  height={260}
                  onChartClick={(info: ChartClickInfo) => {
                    const newVal = selectedMotivo === info.label ? null : info.label;
                    setSelectedMotivo(newVal);
                    if (newVal) {
                      setTimeout(() => motivoDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
                    }
                  }}
                />
              );
            })()}

            {/* ============================================================ */}
            {/* PAINEL DETALHE: Entregas filtradas por motivo */}
            {/* ============================================================ */}
            {selectedMotivo && data?.entregasDetalhe && (() => {
              const rawKeys = (() => {
                const { rawByLabel } = buildPorMotivoNormalized(data.porMotivo as Record<string, number>);
                return rawByLabel[selectedMotivo] || [selectedMotivo];
              })();
              const rows = (data.entregasDetalhe as any[]).filter(r => rawKeys.includes(r.motivo) || formatMotivo(r.motivo) === selectedMotivo);
              const totalQtd = rows.reduce((s: number, r: any) => s + r.quantidade, 0);
              const totalVal = rows.reduce((s: number, r: any) => s + (r.valorCobrado || 0), 0);
              return (
                <div ref={motivoDetailRef}>
                <Card className="border-blue-300 bg-blue-50/50 shadow-lg ring-2 ring-blue-300 ring-offset-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      <ClipboardList className="h-4 w-4 text-blue-500 shrink-0" />
                      <span>Detalhes — Motivo:</span>
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{selectedMotivo}</Badge>
                      <span className="text-muted-foreground font-normal">{rows.length} entrega{rows.length !== 1 ? 's' : ''} · {totalQtd} unidade{totalQtd !== 1 ? 's' : ''}</span>
                      {totalVal > 0 && <span className="text-muted-foreground font-normal">· {fmtBRL(totalVal)}</span>}
                      <Button
                        variant="ghost" size="sm"
                        className="ml-auto h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => setSelectedMotivo(null)}
                      >
                        <X className="h-3 w-3 mr-1" /> Fechar
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma entrega encontrada para este motivo.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Funcionário</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Função</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">EPI / Item</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground">Obra</th>
                              <th className="py-2 pr-3 font-medium text-muted-foreground text-center">Qtd</th>
                              <th className="py-2 font-medium text-muted-foreground text-right">Data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r: any, i: number) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-blue-50/50 transition-colors">
                                <td className="py-2 pr-3 font-medium">{r.funcionario}</td>
                                <td className="py-2 pr-3 text-muted-foreground text-xs">{r.funcao || '—'}</td>
                                <td className="py-2 pr-3">{r.epi}</td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground">{r.obra || '—'}</td>
                                <td className="py-2 pr-3 text-center">
                                  <Badge variant="secondary">{r.quantidade}</Badge>
                                </td>
                                <td className="py-2 text-right text-muted-foreground text-xs">{fmtDate(r.data)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
                </div>
              );
            })()}

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
                          <tr
                            key={i}
                            className="border-b border-border/50 cursor-pointer hover:bg-purple-50 transition-colors"
                            onClick={() => { setSelectedEmpId(f.id); setSelectedEmpName(f.nome); }}
                            title="Clique para ver os EPIs entregues"
                          >
                            <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-3 font-medium text-blue-700 hover:underline flex items-center gap-1.5">
                              <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
                              <EmpNameWithStatus nome={f.nome} isDesligado={f.isDesligado} maxWidth="max-w-[200px]" />
                            </td>
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

        {selectedEmpId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEmpId(null)}>
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-purple-600" />
                    EPIs Entregues — {selectedEmpName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {empDeliveriesQuery.data?.length || 0} entrega(s) registrada(s)
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEmpId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-y-auto flex-1 p-4">
                {empDeliveriesQuery.isLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                  </div>
                ) : !empDeliveriesQuery.data?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma entrega registrada</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-purple-700">{empDeliveriesQuery.data.length}</p>
                        <p className="text-[10px] text-muted-foreground">Entregas</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-blue-700">
                          {empDeliveriesQuery.data.reduce((s: number, d: any) => s + (d.quantidade || 1), 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Unidades</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-amber-700">
                          {fmtBRL(empDeliveriesQuery.data.reduce((s: number, d: any) => s + parseFloat(String(d.valorCobrado || d.valorProdutoEpi || 0)) * (d.quantidade || 1), 0))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Custo Total</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-gray-50">
                            <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                            <th className="py-2 px-3 font-medium text-muted-foreground">CA</th>
                            <th className="py-2 px-3 font-medium text-muted-foreground">Data</th>
                            <th className="py-2 px-3 font-medium text-muted-foreground text-right">Qtd</th>
                            <th className="py-2 px-3 font-medium text-muted-foreground text-right">Valor</th>
                            <th className="py-2 px-3 font-medium text-muted-foreground">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empDeliveriesQuery.data.map((d: any) => (
                            <tr key={d.id} className="border-b border-border/50 hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium">{d.nomeEpi || "-"}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className="text-xs">{d.caEpi || "-"}</Badge>
                              </td>
                              <td className="py-2 px-3 text-muted-foreground">{fmtDate(d.dataEntrega)}</td>
                              <td className="py-2 px-3 text-right">{d.quantidade || 1}</td>
                              <td className="py-2 px-3 text-right font-medium text-amber-700">
                                {fmtBRL(parseFloat(String(d.valorCobrado || d.valorProdutoEpi || 0)) * (d.quantidade || 1))}
                              </td>
                              <td className="py-2 px-3 text-muted-foreground text-xs">{formatMotivo(d.motivo || d.motivoTroca || "")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
    </DashboardLayout>

      {/* ── Dialog: Detalhe do EPI clicado no gráfico ─────────────────────── */}
      <Dialog open={!!detalheEpi} onOpenChange={() => setDetalheEpi(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
          <DialogHeader className="pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className={`p-1.5 rounded-lg ${detalheEpi?.status === 'critico' ? 'bg-red-50' : detalheEpi?.status === 'atencao' ? 'bg-yellow-50' : 'bg-green-50'}`}>
                <Activity className={`h-5 w-5 ${detalheEpi?.status === 'critico' ? 'text-red-600' : detalheEpi?.status === 'atencao' ? 'text-yellow-600' : 'text-green-600'}`} />
              </div>
              <div className="min-w-0">
                <span className="break-words">{detalheEpi?.nome}</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">{detalheEpi?.categoria}</p>
              </div>
              <Badge
                variant={detalheEpi?.status === 'critico' ? 'destructive' : 'outline'}
                className={`ml-auto shrink-0 text-xs ${detalheEpi?.status === 'atencao' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' : detalheEpi?.status === 'ok' ? 'bg-green-100 text-green-700 border-green-300' : ''}`}
              >
                {detalheEpi?.status === 'critico' ? 'CRÍTICO' : detalheEpi?.status === 'atencao' ? 'ATENÇÃO' : 'OK'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-4 pt-3">
            {/* KPIs de durabilidade */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-green-50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Vida Útil Esperada</p>
                <p className="text-2xl font-bold text-green-700">{detalheEpi?.esperado}d</p>
              </div>
              <div className={`rounded-lg border p-3 text-center ${detalheEpi?.status === 'critico' ? 'bg-red-50' : detalheEpi?.status === 'atencao' ? 'bg-yellow-50' : 'bg-blue-50'}`}>
                <p className="text-xs text-muted-foreground mb-1">Tempo Médio Real</p>
                <p className={`text-2xl font-bold ${detalheEpi?.status === 'critico' ? 'text-red-600' : detalheEpi?.status === 'atencao' ? 'text-yellow-700' : 'text-blue-600'}`}>{detalheEpi?.mediaReal}d</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Diferença</p>
                {detalheEpi && (
                  <p className={`text-2xl font-bold flex items-center justify-center gap-1 ${detalheEpi.mediaReal < detalheEpi.esperado ? 'text-red-600' : 'text-green-600'}`}>
                    {detalheEpi.mediaReal < detalheEpi.esperado
                      ? <><ArrowDown className="h-5 w-5" />{detalheEpi.esperado - detalheEpi.mediaReal}d</>
                      : <><ArrowUp className="h-5 w-5" />+{detalheEpi.mediaReal - detalheEpi.esperado}d</>}
                  </p>
                )}
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Entregas</p>
                <p className="text-2xl font-bold text-foreground">{detalheEpi?.totalEntregas}</p>
              </div>
            </div>

            {/* Barra visual de % */}
            {detalheEpi && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Tempo real vs. esperado</span>
                  <span className={`text-xs font-bold ${detalheEpi.percentual < 50 ? 'text-red-600' : detalheEpi.percentual < 80 ? 'text-yellow-700' : 'text-green-700'}`}>
                    {detalheEpi.percentual?.toFixed(0)}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${detalheEpi.percentual < 50 ? 'bg-red-500' : detalheEpi.percentual < 80 ? 'bg-yellow-400' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(detalheEpi.percentual ?? 0, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {detalheEpi.percentual < 50
                    ? 'Desgaste crítico — durando menos da metade da vida esperada'
                    : detalheEpi.percentual < 80
                    ? 'Desgaste acima do esperado — monitorar'
                    : 'Durabilidade dentro do esperado'}
                </p>
              </div>
            )}

            {/* Tabela de funcionários */}
            {detalheEpi?.funcDetalhe?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Funcionários que receberam este EPI
                  <span className="font-normal text-muted-foreground">({detalheEpi.funcDetalhe.length} funcionário{detalheEpi.funcDetalhe.length !== 1 ? 's' : ''})</span>
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 text-left text-muted-foreground border-b">
                        <th className="py-2 px-3 font-medium">Funcionário</th>
                        <th className="py-2 px-3 font-medium">Função</th>
                        <th className="py-2 px-3 font-medium text-center">Entregas</th>
                        <th className="py-2 px-3 font-medium text-center">Média (dias)</th>
                        <th className="py-2 px-3 font-medium">Datas das Entregas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const MOTIVO_LABELS: Record<string, string> = {}; // formatMotivo handles all keys
                        return detalheEpi.funcDetalhe.map((f: any, fi: number) => (
                          <tr key={fi} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="py-2 px-3 font-medium">
                              <button
                                className="text-left hover:text-blue-600 hover:underline cursor-pointer transition-colors flex items-center gap-2"
                                onClick={() => {
                                  setDetalheEpi(null);
                                  setFichaModal({ employeeId: f.employeeId, employeeName: f.nome, epiNome: detalheEpi.nome });
                                }}
                              >
                                {f.fotoUrl ? (
                                  <img src={f.fotoUrl} alt={f.nome} onClick={(e) => { e.stopPropagation(); setFotoAmpliada({ url: f.fotoUrl, nome: f.nome }); }} className="h-8 w-8 rounded-full object-cover border border-gray-200 flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-blue-400 transition-all" />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-blue-700">{(f.nome || "?").split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("")}</span>
                                  </div>
                                )}
                                <EmpNameWithStatus nome={f.nome} isDesligado={f.isDesligado} maxWidth="max-w-[160px]" />
                              </button>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{f.funcao}</td>
                            <td className="py-2 px-3 text-center">{f.entregas}</td>
                            <td className="py-2 px-3 text-center">
                              {f.entregas >= 2 ? (
                                <span className={`font-bold ${f.diasReal < detalheEpi.esperado * 0.5 ? 'text-red-600' : f.diasReal < detalheEpi.esperado ? 'text-yellow-600' : 'text-green-600'}`}>
                                  {f.diasReal}d
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1">
                                {(f.datasEntrega || []).map((dt: string, di: number) => (
                                  <span key={di} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-background border text-[10px]">
                                    {fmtDate(dt)}
                                    {f.motivos?.[di] && f.motivos[di] !== 'regular' && (
                                      <span className="text-muted-foreground">· {formatMotivo(f.motivos[di])}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!detalheEpi?.funcDetalhe?.length) && (
              <p className="text-xs text-muted-foreground text-center py-4">Sem detalhamento por funcionário disponível para este EPI.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fichaModal} onOpenChange={() => setFichaModal(null)}>
        <DialogContent resizable={false} className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 rounded-lg bg-blue-50">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <span>Entregas de EPI</span>
                <p className="text-sm font-normal text-muted-foreground mt-0.5">{fichaModal?.employeeName}</p>
              </div>
            </DialogTitle>
          </DialogHeader>
          {fichaDeliveries.isLoading ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Carregando entregas...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const deliveries = (fichaDeliveries.data || []).sort((a: any, b: any) =>
                  new Date(b.dataEntrega || 0).getTime() - new Date(a.dataEntrega || 0).getTime()
                );
                if (deliveries.length === 0) {
                  return <p className="text-center text-muted-foreground py-8">Nenhuma entrega encontrada.</p>;
                }
                const totalEntregas = deliveries.length;
                const comFicha = deliveries.filter((d: any) => d.fichaUrl).length;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
                      <div className="flex items-center gap-4">
                        <span><strong>{totalEntregas}</strong> entregas registradas</span>
                        <span className="text-border">|</span>
                        <span><strong>{comFicha}</strong> com ficha anexada</span>
                      </div>
                      {comFicha < totalEntregas && (
                        <BackfillFichasButton companyId={queryCompanyId} onDone={() => fichaDeliveries.refetch()} semFicha={totalEntregas - comFicha} />
                      )}
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 text-left text-muted-foreground">
                            <th className="py-3 px-4 font-semibold w-[25%]">EPI</th>
                            <th className="py-3 px-4 font-semibold text-center w-[10%]">CA</th>
                            <th className="py-3 px-4 font-semibold w-[15%]">Data Entrega</th>
                            <th className="py-3 px-4 font-semibold text-center w-[8%]">Qtd</th>
                            <th className="py-3 px-4 font-semibold w-[20%]">Motivo</th>
                            <th className="py-3 px-4 font-semibold text-center w-[22%]">Ficha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveries.map((d: any, i: number) => {
                            const isLocalFile = d.fichaUrl && d.fichaUrl.startsWith('/uploads/');
                            const isCloudFile = d.fichaUrl && d.fichaUrl.startsWith('http');
                            return (
                              <tr key={d.id} className={`border-t hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                                <td className="py-3 px-4 font-medium">{d.nomeEpi || '-'}</td>
                                <td className="py-3 px-4 text-center">
                                  {d.caEpi ? <Badge variant="outline" className="text-xs font-mono">{d.caEpi}</Badge> : <span className="text-muted-foreground">-</span>}
                                </td>
                                <td className="py-3 px-4">{fmtDate(d.dataEntrega)}</td>
                                <td className="py-3 px-4 text-center font-mono">{d.quantidade || 1}</td>
                                <td className="py-3 px-4">
                                  {d.motivo || d.motivoTroca ? (
                                    <Badge variant="secondary" className="text-xs">{formatMotivo(d.motivo || d.motivoTroca)}</Badge>
                                  ) : <span className="text-muted-foreground">-</span>}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {d.fichaUrl ? (
                                    <Button size="sm" variant={isCloudFile ? "default" : "outline"} 
                                      className={`h-8 text-xs gap-1.5 ${isCloudFile ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                      onClick={() => window.open(d.fichaUrl, '_blank')}>
                                      <FileText className="h-3.5 w-3.5" /> Ver PDF
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">Sem ficha</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox foto funcionário */}
      {fotoAmpliada && (
        <div
          onClick={() => setFotoAmpliada(null)}
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={fotoAmpliada.url}
              alt={fotoAmpliada.nome}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl border-4 border-white"
            />
            <div className="bg-white/95 px-5 py-2.5 rounded-xl shadow-lg">
              <p className="font-bold text-slate-800 text-center text-base">{fotoAmpliada.nome}</p>
            </div>
            <button
              type="button"
              onClick={() => setFotoAmpliada(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-slate-800 shadow-lg hover:bg-slate-100 flex items-center justify-center text-lg font-bold border border-slate-300"
            >✕</button>
          </div>
        </div>
      )}
    </>
  );
}
