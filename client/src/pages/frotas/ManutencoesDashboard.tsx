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
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtNum(v: number, d = 0) { return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default function ManutencoesDashboard() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [sortVeiculo, setSortVeiculo] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "custoTotal", dir: "desc" });
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  const dash = trpc.frotas.getMaintenanceDashboard.useQuery(
    { companyId: cId, ano },
    { enabled: cId > 0 },
  );

  const d = dash.data;

  if (!d) {
    return (
      <DashboardLayout>
        <div className="p-4 flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  const { kpi, porMes, porVeiculo, porFornecedor, topItens, itensPorVeiculo, custoMesPorTipo } = d;

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

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white">
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">Dashboard de Manutenção</h1>
              <p className="text-sm text-muted-foreground">Análise completa de peças, serviços e custos por veículo</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-3 py-1.5 shadow-sm border">
            <button onClick={() => setAno(a => a - 1)} className="hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-bold text-lg tabular-nums min-w-[60px] text-center">{ano}</span>
            <button onClick={() => setAno(a => a + 1)} className="hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded"><ChevronRight className="h-4 w-4" /></button>
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
            <Card key={i} className="relative overflow-hidden">
              <CardContent className="p-3">
                <div className={`absolute top-0 right-0 w-12 h-12 bg-gradient-to-br ${k.color} opacity-10 rounded-bl-3xl`} />
                <k.icon className={`h-4 w-4 mb-1 bg-gradient-to-br ${k.color} bg-clip-text`} style={{ color: k.color.includes("emerald") ? "#10b981" : k.color.includes("blue") ? "#3b82f6" : k.color.includes("red") ? "#ef4444" : k.color.includes("violet") ? "#8b5cf6" : k.color.includes("pink") ? "#ec4899" : k.color.includes("cyan") ? "#06b6d4" : k.color.includes("amber") ? "#f59e0b" : "#f97316" }} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className="text-lg font-bold tabular-nums">{k.value}</p>
                {k.sub && <span className="text-[10px] text-muted-foreground">{k.sub}</span>}
              </CardContent>
            </Card>
          ))}
        </div>

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
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
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
                <ResponsiveContainer width="100%" height={Math.max(180, topPecas.length * 26)}>
                  <BarChart data={topPecas} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 9 }} width={140} />
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
                <ResponsiveContainer width="100%" height={Math.max(180, topServicos.length * 26)}>
                  <BarChart data={topServicos} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 9 }} width={140} />
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
                <BarChart data={porVeiculo} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
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
                  <Bar dataKey="custoTotal" name="Custo Total" radius={[0, 4, 4, 0]}>
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
