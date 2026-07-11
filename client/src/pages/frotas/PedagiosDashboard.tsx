import React, { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, DollarSign, MapPin, Truck, BarChart3, ChevronLeft, ChevronRight,
  TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Tag, Route,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtNum(v: number, d = 0) { return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default function PedagiosDashboard() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState<number | null>(null);
  const [yearlyPorMes, setYearlyPorMes] = useState<Array<{mes: number; qtd: number}>>([]);
  const [sortVeic, setSortVeic] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "valor", dir: "desc" });

  const dash = trpc.frotas.getPedagiosDashboard.useQuery(
    { companyId: cId, ano, mes: mes ?? undefined },
    { enabled: cId > 0 },
  );

  const d = dash.data;
  const kpi = d?.kpi || { qtd: 0, valor: 0, veiculos: 0, pracas: 0, rodovias: 0, tags: 0, valorMedio: 0, valorMax: 0, qtdPedagio: 0, qtdSemParar: 0, valorPedagio: 0, valorSemParar: 0 };
  const porMes = d?.porMes || [];
  const porVeiculo = d?.porVeiculo || [];
  const porPraca = d?.porPraca || [];
  const porRodovia = d?.porRodovia || [];
  const topPassagens = d?.topPassagens || [];

  useEffect(() => {
    if (mes === null && d?.porMes?.length) setYearlyPorMes(d.porMes as Array<{mes: number; qtd: number}>);
  }, [mes, d]);
  const badgeCounts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const r of yearlyPorMes) m[r.mes] = r.qtd || 0;
    return m;
  }, [yearlyPorMes]);

  const evolucao = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = porMes.find((x: any) => x.mes === i + 1);
    return {
      name: MESES[i],
      pedagio: m?.pedagio || 0,
      semParar: m?.semParar || 0,
      qtd: m?.qtd || 0,
    };
  }), [porMes]);

  const veiculosSorted = useMemo(() => [...porVeiculo].sort((a: any, b: any) => {
    const av = a[sortVeic.col] ?? 0;
    const bv = b[sortVeic.col] ?? 0;
    return sortVeic.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  }), [porVeiculo, sortVeic]);

  const distCategoria = [
    { name: "Pedágio Físico", value: kpi.valorPedagio, qtd: kpi.qtdPedagio },
    { name: "Sem Parar / Tag", value: kpi.valorSemParar, qtd: kpi.qtdSemParar },
  ].filter(x => x.value > 0);

  const toggleSort = (col: string) => setSortVeic(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  const SortIcon = ({ col }: { col: string }) => {
    if (sortVeic.col !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortVeic.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f] dark:text-sky-300">Dashboard de Pedágios</h1>
              <p className="text-sm text-muted-foreground">Análise de pedágios físicos, Sem Parar e gastos por praça, rodovia e veículo</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-3 py-1.5 shadow-sm border">
            <button onClick={() => { setAno(a => a - 1); setMes(null); setYearlyPorMes([]); }} className="hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-bold text-lg tabular-nums min-w-[60px] text-center">{ano}</span>
            <button onClick={() => { setAno(a => a + 1); setMes(null); setYearlyPorMes([]); }} className="hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Seletor de Mês */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border shadow-sm px-3 py-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setMes(null)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${mes === null ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              Ano todo
            </button>
            <span className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5 shrink-0" />
            {MESES.map((m, i) => {
              const qtd = badgeCounts[i + 1] || 0;
              const active = mes === i + 1;
              return (
                <button key={i} onClick={() => setMes(active ? null : i + 1)}
                  className={`relative px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-sky-500 text-white shadow-sm' : qtd > 0 ? 'bg-sky-50 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  {m}
                  {qtd > 0 && <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 leading-none ${active ? 'bg-white text-sky-600' : 'bg-sky-400 text-white'}`}>{qtd > 99 ? '99+' : qtd}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Passagens", value: fmtNum(kpi.qtd), icon: Receipt, color: "text-sky-600" },
            { label: "Valor Total", value: fmt(kpi.valor), icon: DollarSign, color: "text-emerald-600" },
            { label: "Veículos", value: fmtNum(kpi.veiculos), icon: Truck, color: "text-violet-600" },
            { label: "Praças", value: fmtNum(kpi.pracas), icon: MapPin, color: "text-rose-600" },
            { label: "Rodovias", value: fmtNum(kpi.rodovias), icon: Route, color: "text-amber-600" },
            { label: "Tags", value: fmtNum(kpi.tags), icon: Tag, color: "text-indigo-600" },
            { label: "Ticket Médio", value: kpi.valorMedio > 0 ? fmt(kpi.valorMedio) : "—", icon: TrendingUp, color: "text-teal-600" },
            { label: "Maior Passagem", value: kpi.valorMax > 0 ? fmt(kpi.valorMax) : "—", icon: AlertTriangle, color: "text-orange-600" },
          ].map((k, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <k.icon className={`h-4 w-4 mb-1 ${k.color}`} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className="text-lg font-bold tabular-nums">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-sky-500" /> Evolução Mensal — Pedágio vs Sem Parar</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={evolucao}>
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
                          <p key={i} style={{ color: p.color }}>{p.name}: {p.dataKey === "qtd" ? fmtNum(p.value) : fmt(p.value)}</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="pedagio" name="Pedágio (R$)" stackId="v" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar yAxisId="left" dataKey="semParar" name="Sem Parar (R$)" stackId="v" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="qtd" name="Passagens" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Tag className="h-4 w-4 text-emerald-500" /> Físico vs Sem Parar</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {distCategoria.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={distCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                        {distCategoria.map((_, i) => <Cell key={i} fill={i === 0 ? "#3b82f6" : "#10b981"} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload;
                        const pct = kpi.valor > 0 ? (p.value / kpi.valor * 100).toFixed(1) : "0";
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{p.name}</strong><br />{fmt(p.value)} ({pct}%) · {p.qtd} passagens</div>;
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 text-xs w-full mt-2">
                    <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Pedágio Físico</span>
                      <span className="font-bold text-blue-700">{fmt(kpi.valorPedagio)} <span className="text-muted-foreground font-normal">· {kpi.qtdPedagio}</span></span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Sem Parar / Tag</span>
                      <span className="font-bold text-emerald-700">{fmt(kpi.valorSemParar)} <span className="text-muted-foreground font-normal">· {kpi.qtdSemParar}</span></span>
                    </div>
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-500" /> Praças com Mais Gasto ({porPraca.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {porPraca.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(220, Math.min(porPraca.length, 15) * 30)}>
                  <BarChart data={porPraca.slice(0, 15)} layout="vertical" margin={{ left: 0, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)} />
                    <YAxis type="category" dataKey="praca" tick={{ fontSize: 10 }} width={170} tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 22) + "…" : v} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                          <p className="font-bold">{p.praca}</p>
                          {p.rodovia !== "—" && <p className="text-muted-foreground">{p.rodovia}</p>}
                          <p>{p.qtd} passagens · {p.veiculos} veículo(s)</p>
                          <p className="font-bold text-emerald-700">{fmt(p.valor)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="valor" name="Valor" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 9, formatter: (v: number) => fmt(v) }}>
                      {porPraca.slice(0, 15).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Route className="h-4 w-4 text-amber-500" /> Rodovias ({porRodovia.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {porRodovia.length > 0 ? (
                <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                      <tr>
                        <th className="p-2 text-left font-semibold">Rodovia</th>
                        <th className="p-2 text-center font-semibold">Praças</th>
                        <th className="p-2 text-center font-semibold">Veíc.</th>
                        <th className="p-2 text-center font-semibold">Passag.</th>
                        <th className="p-2 text-right font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porRodovia.map((r: any, i: number) => (
                        <tr key={i} className={i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}>
                          <td className="p-2 font-medium">{r.rodovia}</td>
                          <td className="p-2 text-center">{r.pracas}</td>
                          <td className="p-2 text-center">{r.veiculos}</td>
                          <td className="p-2 text-center">{r.qtd}</td>
                          <td className="p-2 text-right font-bold text-emerald-700">{fmt(r.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2"><Truck className="h-4 w-4 text-violet-500" /> Detalhamento por Veículo ({porVeiculo.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-left font-semibold">Veículo</th>
                    <th className="p-2.5 text-left font-semibold">Tipo</th>
                    <th className="p-2.5 text-center font-semibold cursor-pointer hover:text-sky-600" onClick={() => toggleSort("qtd")}><span className="inline-flex items-center gap-1">Passagens <SortIcon col="qtd" /></span></th>
                    <th className="p-2.5 text-center font-semibold">Físico</th>
                    <th className="p-2.5 text-center font-semibold">Sem Parar</th>
                    <th className="p-2.5 text-center font-semibold cursor-pointer hover:text-sky-600" onClick={() => toggleSort("pracas")}><span className="inline-flex items-center gap-1">Praças <SortIcon col="pracas" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-sky-600" onClick={() => toggleSort("valor")}><span className="inline-flex items-center gap-1 justify-end">Valor Total <SortIcon col="valor" /></span></th>
                    <th className="p-2.5 text-center font-semibold">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {veiculosSorted.map((v: any, idx: number) => {
                    const maxValor = Math.max(...porVeiculo.map((x: any) => x.valor), 1);
                    return (
                      <tr key={v.vehicleId} className={`hover:bg-sky-50/40 dark:hover:bg-sky-950/20 ${idx % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}`}>
                        <td className="p-2.5">
                          <div className="flex flex-col">
                            <span className="font-mono font-bold text-[#1e3a5f] dark:text-sky-300">{v.placa}</span>
                            <span className="text-muted-foreground text-[10px]">{v.modelo} {v.marca ? `· ${v.marca}` : ""}</span>
                          </div>
                        </td>
                        <td className="p-2.5"><Badge className="text-[10px]" variant="outline">{v.tipoVeiculo || "—"}</Badge></td>
                        <td className="p-2.5 text-center font-bold">{v.qtd}</td>
                        <td className="p-2.5 text-center text-blue-600">{v.qtdPedagio}</td>
                        <td className="p-2.5 text-center text-emerald-600">{v.qtdSemParar}</td>
                        <td className="p-2.5 text-center">{v.pracas}</td>
                        <td className="p-2.5 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(v.valor)}</span>
                            <div className="w-16 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                              <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${(v.valor / maxValor) * 100}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5 text-center text-[11px] text-muted-foreground">{v.ultimo ? String(v.ultimo).slice(0, 10).split("-").reverse().join("/") : "—"}</td>
                      </tr>
                    );
                  })}
                  {veiculosSorted.length === 0 && (<tr><td colSpan={8} className="text-center text-muted-foreground py-6">Nenhuma passagem no período.</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Maiores Passagens — Top 15 (auditoria)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="p-2 text-left font-semibold">Data</th>
                    <th className="p-2 text-left font-semibold">Veículo</th>
                    <th className="p-2 text-left font-semibold">Categoria</th>
                    <th className="p-2 text-left font-semibold">Praça / Rodovia</th>
                    <th className="p-2 text-left font-semibold">Tag</th>
                    <th className="p-2 text-center font-semibold">Eixos</th>
                    <th className="p-2 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {topPassagens.map((r: any, i: number) => (
                    <tr key={r.id} className={i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}>
                      <td className="p-2 text-muted-foreground">{r.data ? String(r.data).slice(0, 10).split("-").reverse().join("/") : "—"}</td>
                      <td className="p-2 font-mono font-bold">{r.placa}<span className="ml-1 text-muted-foreground font-normal">{r.modelo}</span></td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-[10px] ${r.categoria === "sem_parar" ? "border-emerald-300 text-emerald-700" : "border-blue-300 text-blue-700"}`}>
                          {r.categoria === "sem_parar" ? "Sem Parar" : "Pedágio"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <span className="font-medium">{r.praca || r.descricao || "—"}</span>
                        {r.rodovia && <span className="block text-[10px] text-muted-foreground">{r.rodovia}</span>}
                      </td>
                      <td className="p-2 font-mono text-[11px]">{r.tagId || "—"}</td>
                      <td className="p-2 text-center">{r.eixos || "—"}</td>
                      <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(r.valor)}</td>
                    </tr>
                  ))}
                  {topPassagens.length === 0 && (<tr><td colSpan={7} className="text-center text-muted-foreground py-6">Sem dados</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
