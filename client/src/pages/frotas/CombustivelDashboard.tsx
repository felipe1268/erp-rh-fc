import React, { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Fuel, DollarSign, Droplet, Gauge, Truck, Users, Store, BarChart3,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowUpDown,
  ArrowUp, ArrowDown, AlertTriangle, Receipt, X, MousePointerClick, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtNum(v: number, d = 0) { return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtL(v: number) { return `${fmtNum(v, 1)} L`; }
function fmtKmL(v: number) { return v > 0 ? `${fmtNum(v, 2)} km/L` : "—"; }
function fmtData(s: any) { return s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—"; }

type DrillDim = "motorista" | "posto" | "tipo" | "mes" | "veiculo";
type DrillKey = { dim: DrillDim; value: string; label: string; subtitle?: string };

export default function CombustivelDashboard() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState<number | null>(null);
  const [yearlyPorMes, setYearlyPorMes] = useState<Array<{mes: number; qtd: number}>>([]);
  const [sortVeic, setSortVeic] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "valor", dir: "desc" });
  // Rev. 1883 — drill-down clicável em todos os gráficos. `drill` aberto =
  // modal fullscreen (Regra de Ouro tablet/iPad).
  const [drill, setDrill] = useState<DrillKey | null>(null);

  const dash = trpc.frotas.getFuelDashboard.useQuery(
    { companyId: cId, ano, mes: mes ?? undefined },
    { enabled: cId > 0 },
  );

  const detail = trpc.frotas.getFuelDrilldown.useQuery(
    { companyId: cId, ano, dim: drill?.dim || "motorista", value: drill?.value || "" },
    { enabled: !!drill && cId > 0 },
  );

  const d = dash.data;
  const kpi = d?.kpi || { qtd: 0, litros: 0, valor: 0, desconto: 0, veiculos: 0, motoristas: 0, postos: 0, precoMedio: 0, precoMin: 0, precoMax: 0, consumoMedio: 0 };
  const porMes = d?.porMes || [];
  const porVeiculo = d?.porVeiculo || [];
  const porMotorista = d?.porMotorista || [];
  const porPosto = d?.porPosto || [];
  const porTipo = d?.porTipo || [];
  const topNotas = d?.topNotas || [];

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
      mes: i + 1,
      valor: m?.valor || 0,
      litros: m?.litros || 0,
      preco: m?.precoMedio || 0,
      qtd: m?.qtd || 0,
    };
  }), [porMes]);

  const veiculosSorted = useMemo(() => [...porVeiculo].sort((a: any, b: any) => {
    const av = a[sortVeic.col] ?? 0;
    const bv = b[sortVeic.col] ?? 0;
    return sortVeic.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  }), [porVeiculo, sortVeic]);

  const toggleSort = (col: string) => setSortVeic(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  const SortIcon = ({ col }: { col: string }) => {
    if (sortVeic.col !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortVeic.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // Helper: dica visual de "clicável" no header dos cards.
  const ClickHint = () => (
    <span className="ml-auto text-[10px] text-muted-foreground inline-flex items-center gap-1 font-normal">
      <MousePointerClick className="h-3 w-3" /> toque para detalhar
    </span>
  );

  // Sentinela: mesmo string usado no backend para NULL/''.
  const SEM_MOTORISTA = "Não informado";

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
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white">
              <Fuel className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f] dark:text-emerald-300">Dashboard de Combustível</h1>
              <p className="text-sm text-muted-foreground">Análise de consumo, preço, postos, motoristas e tipos · <span className="text-emerald-700 dark:text-emerald-400 font-medium">toque em qualquer gráfico para detalhar</span></p>
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
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${mes === null ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              Ano todo
            </button>
            <span className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-0.5 shrink-0" />
            {MESES.map((m, i) => {
              const qtd = badgeCounts[i + 1] || 0;
              const active = mes === i + 1;
              return (
                <button key={i} onClick={() => setMes(active ? null : i + 1)}
                  className={`relative px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-emerald-500 text-white shadow-sm' : qtd > 0 ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  {m}
                  {qtd > 0 && <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 leading-none ${active ? 'bg-white text-emerald-600' : 'bg-emerald-400 text-white'}`}>{qtd > 99 ? '99+' : qtd}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Abastecimentos", value: fmtNum(kpi.qtd), icon: Receipt, color: "from-emerald-500 to-green-600" },
            { label: "Litros", value: fmtL(kpi.litros), icon: Droplet, color: "from-cyan-500 to-blue-500" },
            { label: "Valor Total", value: fmt(kpi.valor), icon: DollarSign, color: "from-green-500 to-emerald-600" },
            { label: "Preço Médio", value: kpi.precoMedio > 0 ? `R$ ${fmtNum(kpi.precoMedio, 3)}` : "—", icon: TrendingUp, color: "from-amber-500 to-orange-500", sub: "R$/L" },
            { label: "Consumo Médio", value: fmtKmL(kpi.consumoMedio), icon: Gauge, color: "from-violet-500 to-purple-600" },
            { label: "Veículos", value: fmtNum(kpi.veiculos), icon: Truck, color: "from-blue-500 to-indigo-600" },
            { label: "Motoristas", value: fmtNum(kpi.motoristas), icon: Users, color: "from-pink-500 to-rose-500" },
            { label: "Postos", value: fmtNum(kpi.postos), icon: Store, color: "from-teal-500 to-cyan-600" },
          ].map((k, i) => (
            <Card key={i} className="relative overflow-hidden">
              <CardContent className="p-3">
                <div className={`absolute top-0 right-0 w-12 h-12 bg-gradient-to-br ${k.color} opacity-10 rounded-bl-3xl`} />
                <k.icon className="h-4 w-4 mb-1 text-emerald-600" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className="text-lg font-bold tabular-nums">{k.value}</p>
                {k.sub && <span className="text-[10px] text-muted-foreground">{k.sub}</span>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Faixa preço min/max — útil pra ver dispersão */}
        {(kpi.precoMin > 0 || kpi.precoMax > 0) && (
          <Card className="border-l-4 border-l-amber-400">
            <CardContent className="py-3 px-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              <span className="text-muted-foreground uppercase tracking-wider font-semibold">Faixa de Preço</span>
              <span className="flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-emerald-600" /> Mín <strong className="text-emerald-700">R$ {fmtNum(kpi.precoMin, 3)}/L</strong></span>
              <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-blue-600" /> Médio <strong className="text-blue-700">R$ {fmtNum(kpi.precoMedio, 3)}/L</strong></span>
              <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-rose-600" /> Máx <strong className="text-rose-700">R$ {fmtNum(kpi.precoMax, 3)}/L</strong></span>
              {kpi.precoMax > 0 && kpi.precoMin > 0 && (
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Variação <strong className="text-amber-700">{fmtNum(((kpi.precoMax - kpi.precoMin) / kpi.precoMin) * 100, 1)}%</strong>
                </span>
              )}
              {kpi.desconto > 0 && <span className="flex items-center gap-1.5 text-emerald-700">Desconto total <strong>{fmt(kpi.desconto)}</strong></span>}
            </CardContent>
          </Card>
        )}

        {/* Evolução mensal — clicar em barra abre modal do mês */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              Evolução Mensal — Litros, Valor e Preço Médio
              <ClickHint />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
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
                      {payload.map((p: any, i: number) => {
                        const isValor = p.dataKey === "valor";
                        const isPreco = p.dataKey === "preco";
                        const isLitros = p.dataKey === "litros";
                        return <p key={i} style={{ color: p.color }}>{p.name}: {isValor ? fmt(p.value) : isPreco ? `R$ ${fmtNum(p.value, 3)}/L` : isLitros ? fmtL(p.value) : fmtNum(p.value)}</p>;
                      })}
                      <p className="text-[10px] text-muted-foreground pt-1 border-t">Toque para ver lançamentos</p>
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="valor" name="Valor (R$)" fill="#10b981" radius={[4, 4, 0, 0]} cursor="pointer"
                  onClick={(data: any) => {
                    const p = data?.payload ?? data;
                    if (p?.qtd > 0) setDrill({ dim: "mes", value: String(p.mes), label: `${MESES_FULL[p.mes - 1]}/${ano}`, subtitle: "Mês" });
                  }} />
                <Line yAxisId="right" dataKey="litros" name="Litros" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" dataKey="preco" name="Preço R$/L" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tipos de combustível + Top postos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Fuel className="h-4 w-4 text-emerald-500" /> Distribuição por Tipo de Combustível
                <ClickHint />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {porTipo.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={porTipo} dataKey="valor" nameKey="tipo" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}
                        cursor="pointer"
                        onClick={(data: any) => {
                          const p = data?.payload ?? data;
                          if (p?.tipo) setDrill({ dim: "tipo", value: p.tipo, label: p.tipo, subtitle: "Tipo de combustível" });
                        }}>
                        {porTipo.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{p.tipo}</strong><br />{fmt(p.valor)} · {fmtL(p.litros)} · R$ {fmtNum(p.precoMedio, 3)}/L<br /><span className="text-[10px] text-muted-foreground">Toque para detalhar</span></div>;
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full mt-2 space-y-1">
                    {porTipo.map((t: any, i: number) => (
                      <button key={i} type="button"
                        onClick={() => setDrill({ dim: "tipo", value: t.tipo, label: t.tipo, subtitle: "Tipo de combustível" })}
                        className="w-full flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /> {t.tipo}</span>
                        <span className="flex items-center gap-3 text-muted-foreground">
                          <span>{fmtL(t.litros)}</span>
                          <span className="font-bold text-emerald-700">{fmt(t.valor)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-teal-500" /> Postos Mais Utilizados ({porPosto.length})
                <ClickHint />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {porPosto.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, Math.min(porPosto.length, 15) * 28)}>
                  <BarChart data={porPosto.slice(0, 15)} layout="vertical" margin={{ left: 0, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)} />
                    <YAxis type="category" dataKey="posto" tick={{ fontSize: 10 }} width={170} tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 22) + "…" : v} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                          <p className="font-bold">{p.posto}</p>
                          <p>{p.qtd} abastecimentos · {fmtL(p.litros)}</p>
                          <p>Preço médio: R$ {fmtNum(p.precoMedio, 3)}/L</p>
                          <p className="font-bold text-emerald-700">{fmt(p.valor)}</p>
                          <p className="text-[10px] text-muted-foreground pt-1 border-t">Toque para detalhar</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="valor" name="Valor" radius={[0, 4, 4, 0]} cursor="pointer"
                      onClick={(data: any) => { const p = data?.payload ?? data; if (p?.posto) setDrill({ dim: "posto", value: p.posto, label: p.posto, subtitle: "Posto" }); }}
                      label={{ position: "right", fontSize: 9, formatter: (v: number) => fmt(v) }}>
                      {porPosto.slice(0, 15).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        {/* Ranking motoristas — destaca "Não informado" e abre detalhe ao clicar */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-pink-500" /> Ranking de Motoristas — Litros e Valor ({porMotorista.length})
              <ClickHint />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {porMotorista.some((m: any) => m.motorista === SEM_MOTORISTA) && (
              <div className="mb-2 text-[11px] flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span><strong>"Não informado"</strong> = abastecimentos sem o campo motorista preenchido. <strong>Toque na barra cinza</strong> para ver placa/data/posto de cada um e identificar quem foi (ex.: Camila).</span>
              </div>
            )}
            {porMotorista.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(220, Math.min(porMotorista.length, 15) * 30)}>
                <BarChart data={porMotorista.slice(0, 15)} layout="vertical" margin={{ left: 0, right: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="motorista" tick={{ fontSize: 10 }} width={180} tickFormatter={(v: string) => v.length > 26 ? v.slice(0, 24) + "…" : v} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    const isSem = p.motorista === SEM_MOTORISTA;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                        <p className="font-bold">{p.motorista}</p>
                        {isSem && <p className="text-amber-700 text-[10px]">Campo motorista vazio no lançamento</p>}
                        <p>{p.qtd} abastecimentos · {p.veiculos} veículo(s)</p>
                        <p>{fmtL(p.litros)} · <span className="font-bold text-emerald-700">{fmt(p.valor)}</span></p>
                        <p className="text-[10px] text-muted-foreground pt-1 border-t">Toque para detalhar</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="litros" name="Litros" radius={[0, 4, 4, 0]} cursor="pointer"
                    onClick={(data: any) => { const p = data?.payload ?? data; if (p?.motorista) setDrill({ dim: "motorista", value: p.motorista, label: p.motorista, subtitle: "Motorista" }); }}
                    label={{ position: "right", fontSize: 9, formatter: (v: number) => `${fmtNum(v, 0)} L` }}>
                    {porMotorista.slice(0, 15).map((m: any, i: number) =>
                      <Cell key={i} fill={m.motorista === SEM_MOTORISTA ? "#94a3b8" : COLORS[i % COLORS.length]} />
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground text-center py-6">Sem dados</p>}
          </CardContent>
        </Card>

        {/* Detalhamento por veículo — linha clicável */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4 text-violet-500" /> Detalhamento por Veículo ({porVeiculo.length})
              <ClickHint />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-left font-semibold">Veículo</th>
                    <th className="p-2.5 text-left font-semibold">Tipo</th>
                    <th className="p-2.5 text-center font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("qtd")}><span className="inline-flex items-center gap-1">Abast. <SortIcon col="qtd" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("litros")}><span className="inline-flex items-center gap-1 justify-end">Litros <SortIcon col="litros" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("valor")}><span className="inline-flex items-center gap-1 justify-end">Valor <SortIcon col="valor" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("precoMedio")}><span className="inline-flex items-center gap-1 justify-end">R$/L Médio <SortIcon col="precoMedio" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("consumoMedio")}><span className="inline-flex items-center gap-1 justify-end">Consumo <SortIcon col="consumoMedio" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("kmRodado")}><span className="inline-flex items-center gap-1 justify-end">Km Rod. <SortIcon col="kmRodado" /></span></th>
                    <th className="p-2.5 text-right font-semibold cursor-pointer hover:text-emerald-600" onClick={() => toggleSort("custoPorKm")}><span className="inline-flex items-center gap-1 justify-end">R$/Km <SortIcon col="custoPorKm" /></span></th>
                    <th className="p-2.5 text-center font-semibold">Último</th>
                  </tr>
                </thead>
                <tbody>
                  {veiculosSorted.map((v: any, idx: number) => {
                    const maxValor = Math.max(...porVeiculo.map((x: any) => x.valor), 1);
                    return (
                      <tr key={v.vehicleId} role="button" tabIndex={0}
                        onClick={() => setDrill({ dim: "veiculo", value: String(v.vehicleId), label: `${v.placa} · ${v.modelo || ""}`.trim(), subtitle: "Veículo" })}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrill({ dim: "veiculo", value: String(v.vehicleId), label: `${v.placa} · ${v.modelo || ""}`.trim(), subtitle: "Veículo" }); } }}
                        aria-label={`Ver abastecimentos de ${v.placa}`}
                        className={`cursor-pointer hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${idx % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}`}>
                        <td className="p-2.5">
                          <div className="flex flex-col">
                            <span className="font-mono font-bold text-[#1e3a5f] dark:text-emerald-300">{v.placa}</span>
                            <span className="text-muted-foreground text-[10px]">{v.modelo} {v.marca ? `· ${v.marca}` : ""}</span>
                          </div>
                        </td>
                        <td className="p-2.5"><Badge className="text-[10px]" variant="outline">{v.tipoVeiculo || "—"}</Badge></td>
                        <td className="p-2.5 text-center font-bold">{v.qtd}</td>
                        <td className="p-2.5 text-right tabular-nums">{fmtL(v.litros)}</td>
                        <td className="p-2.5 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(v.valor)}</span>
                            <div className="w-16 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                              <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${(v.valor / maxValor) * 100}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5 text-right tabular-nums">{v.precoMedio > 0 ? `R$ ${fmtNum(v.precoMedio, 3)}` : "—"}</td>
                        <td className="p-2.5 text-right tabular-nums">
                          <span className={v.consumoMedio >= 10 ? "text-emerald-700" : v.consumoMedio >= 6 ? "text-amber-700" : v.consumoMedio > 0 ? "text-rose-700" : "text-muted-foreground"}>
                            {fmtKmL(v.consumoMedio)}
                          </span>
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-muted-foreground">{v.kmRodado > 0 ? `${fmtNum(v.kmRodado, 0)} km` : "—"}</td>
                        <td className="p-2.5 text-right tabular-nums text-muted-foreground">{v.custoPorKm > 0 ? `R$ ${fmtNum(v.custoPorKm, 2)}` : "—"}</td>
                        <td className="p-2.5 text-center text-[11px] text-muted-foreground">{fmtData(v.ultimoAbastecimento)}</td>
                      </tr>
                    );
                  })}
                  {veiculosSorted.length === 0 && (<tr><td colSpan={10} className="text-center text-muted-foreground py-6">Nenhum abastecimento no período.</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top 15 maiores notas */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Maiores Abastecimentos Individuais — Top 15 (auditoria)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="p-2 text-left font-semibold">Data</th>
                    <th className="p-2 text-left font-semibold">Veículo</th>
                    <th className="p-2 text-left font-semibold">Motorista</th>
                    <th className="p-2 text-left font-semibold">Posto</th>
                    <th className="p-2 text-left font-semibold">Tipo</th>
                    <th className="p-2 text-right font-semibold">Litros</th>
                    <th className="p-2 text-right font-semibold">R$/L</th>
                    <th className="p-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topNotas.map((r: any, i: number) => (
                    <tr key={r.id} className={i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}>
                      <td className="p-2 text-muted-foreground">{fmtData(r.data)}</td>
                      <td className="p-2 font-mono font-bold">{r.placa}<span className="ml-1 text-muted-foreground font-normal">{r.modelo}</span></td>
                      <td className="p-2">{r.motorista || <span className="text-amber-700 italic">Não informado</span>}</td>
                      <td className="p-2">{r.posto || "—"}</td>
                      <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.tipo || "—"}</Badge></td>
                      <td className="p-2 text-right tabular-nums">{fmtL(r.litros)}</td>
                      <td className="p-2 text-right tabular-nums">{r.precoLitro > 0 ? `R$ ${fmtNum(r.precoLitro, 3)}` : "—"}</td>
                      <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{fmt(r.valor)}</td>
                    </tr>
                  ))}
                  {topNotas.length === 0 && (<tr><td colSpan={8} className="text-center text-muted-foreground py-6">Sem dados</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de drill-down (Regra de Ouro: fullscreen no iPad) */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none !p-0 !gap-0 flex flex-col overflow-hidden">
          {drill && (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-emerald-500 text-white shrink-0"><Fuel className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">{drill.subtitle} · {ano}</div>
                    <h2 className="text-lg font-bold text-[#1e3a5f] dark:text-emerald-300 truncate">{drill.label}</h2>
                  </div>
                </div>
                <button onClick={() => setDrill(null)} className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 shrink-0" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {drill.dim === "motorista" && drill.value === SEM_MOTORISTA && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Estes são os abastecimentos cujo <strong>campo "Motorista" ficou em branco</strong> no lançamento (ou na importação Infleet). Use a coluna Veículo + Data + Posto para identificar quem foi (provavelmente Camila ou outro motorista com nome cadastrado diferente). Para corrigir: edite o lançamento no módulo Combustível, ou crie um <em>alias</em> em Cadastros de Motoristas.</span>
                </div>
              )}

              {detail.isLoading && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
                </div>
              )}

              {!detail.isLoading && detail.data && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 border-b">
                    {[
                      { label: "Abastecimentos", value: fmtNum(detail.data.kpi.qtd), icon: Receipt },
                      { label: "Litros", value: fmtL(detail.data.kpi.litros), icon: Droplet },
                      { label: "Valor", value: fmt(detail.data.kpi.valor), icon: DollarSign },
                      { label: "Preço Médio", value: detail.data.kpi.precoMedio > 0 ? `R$ ${fmtNum(detail.data.kpi.precoMedio, 3)}` : "—", icon: TrendingUp },
                      { label: "Veículos", value: fmtNum(detail.data.kpi.veiculos), icon: Truck },
                    ].map((k, i) => (
                      <div key={i} className="bg-white dark:bg-slate-800 rounded-lg p-2 border">
                        <div className="flex items-center gap-1.5"><k.icon className="h-3.5 w-3.5 text-emerald-600" /><span className="text-[9px] uppercase tracking-wider text-muted-foreground">{k.label}</span></div>
                        <p className="text-base font-bold tabular-nums">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                        <tr>
                          <th className="p-2 text-left font-semibold">Data</th>
                          <th className="p-2 text-left font-semibold">Veículo</th>
                          {drill.dim !== "motorista" && <th className="p-2 text-left font-semibold">Motorista</th>}
                          {drill.dim !== "posto" && <th className="p-2 text-left font-semibold">Posto</th>}
                          {drill.dim !== "tipo" && <th className="p-2 text-left font-semibold">Tipo</th>}
                          <th className="p-2 text-right font-semibold">Litros</th>
                          <th className="p-2 text-right font-semibold">R$/L</th>
                          <th className="p-2 text-right font-semibold">Km</th>
                          <th className="p-2 text-right font-semibold">Total</th>
                          <th className="p-2 text-left font-semibold hidden md:table-cell">Observações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.data.rows.map((r: any, i: number) => (
                          <tr key={r.id} className={i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}>
                            <td className="p-2 text-muted-foreground whitespace-nowrap">{fmtData(r.data)}</td>
                            <td className="p-2">
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-[#1e3a5f] dark:text-emerald-300">{r.placa}</span>
                                <span className="text-[10px] text-muted-foreground">{r.modelo}{r.marca ? ` · ${r.marca}` : ""}</span>
                              </div>
                            </td>
                            {drill.dim !== "motorista" && <td className="p-2">{r.motorista || <span className="text-amber-700 italic">Não informado</span>}</td>}
                            {drill.dim !== "posto" && <td className="p-2">{r.posto || "—"}</td>}
                            {drill.dim !== "tipo" && <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.tipo || "—"}</Badge></td>}
                            <td className="p-2 text-right tabular-nums">{fmtL(r.litros)}</td>
                            <td className="p-2 text-right tabular-nums">{r.precoLitro > 0 ? `R$ ${fmtNum(r.precoLitro, 3)}` : "—"}</td>
                            <td className="p-2 text-right tabular-nums text-muted-foreground">{r.kmAtual > 0 ? fmtNum(r.kmAtual, 0) : "—"}</td>
                            <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmt(r.valor)}</td>
                            <td className="p-2 text-[11px] text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{r.observacoes || "—"}</td>
                          </tr>
                        ))}
                        {detail.data.rows.length === 0 && (
                          <tr><td colSpan={10} className="text-center text-muted-foreground py-8">Nenhum lançamento encontrado.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-4 py-2 text-[10px] text-muted-foreground border-t bg-slate-50 dark:bg-slate-900/50">
                    {detail.data.rows.length === 500 && <span className="text-amber-700">⚠ Limite de 500 lançamentos atingido — refine por mês para ver mais. </span>}
                    {detail.data.rows.length} {detail.data.rows.length === 1 ? "lançamento" : "lançamentos"}
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
