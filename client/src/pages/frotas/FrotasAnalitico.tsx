import { useState, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3, PieChart as PieIcon, Fuel, Wrench, AlertTriangle,
  Truck, DollarSign, Activity, Users, Gauge, TrendingDown, Trophy, MapPin, Droplets, Calendar, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Line, Sector
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];

function InteractivePie({ data, colorOffset = 0, unit = "", valueFormatter }: {
  data: Array<{ name: string; value: number; pct: number }>;
  colorOffset?: number;
  unit?: string;
  valueFormatter?: (v: number) => string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const visibleData = useMemo(() => data.filter(d => !hidden.has(d.name)), [data, hidden]);
  const totalVisible = useMemo(() => visibleData.reduce((s, d) => s + d.value, 0), [visibleData]);
  const enriched = useMemo(() => visibleData.map(d => ({
    ...d,
    pct: totalVisible > 0 ? Math.round((d.value / totalVisible) * 100) : 0,
  })), [visibleData, totalVisible]);

  const toggle = useCallback((name: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      if (next.size >= data.length) return prev;
      return next;
    });
  }, [data.length]);

  const fmtVal = valueFormatter || ((v: number) => v.toLocaleString("pt-BR"));

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
      <g>
        <text x={cx} y={cy - 8} textAnchor="middle" className="text-base font-bold fill-foreground">{payload.name}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="text-sm fill-muted-foreground">{fmtVal(payload.value)}{unit ? ` ${unit}` : ""}</text>
        <text x={cx} y={cy + 28} textAnchor="middle" className="text-xs fill-muted-foreground">{payload.pct}%</text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.4} />
      </g>
    );
  };

  return (
    <div className="flex flex-col items-center w-full">
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={enriched}
            cx="50%" cy="50%"
            innerRadius="45%"
            outerRadius="75%"
            paddingAngle={3}
            dataKey="value"
            activeIndex={activeIndex !== null ? activeIndex : undefined}
            activeShape={renderActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {enriched.map((entry, i) => {
              const origIdx = data.findIndex(d => d.name === entry.name);
              return <Cell key={entry.name} fill={COLORS[(origIdx + colorOffset) % COLORS.length]} stroke="white" strokeWidth={2} />;
            })}
          </Pie>
          {activeIndex === null && (
            <>
              <text x="50%" y="46%" textAnchor="middle" className="text-lg font-bold fill-foreground">{fmtVal(totalVisible)}</text>
              <text x="50%" y="54%" textAnchor="middle" className="text-xs fill-muted-foreground">{unit || "total"}</text>
            </>
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-2 mt-2 px-2">
        {data.map((d, i) => {
          const isHidden = hidden.has(d.name);
          return (
            <button
              key={d.name}
              onClick={() => toggle(d.name)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                isHidden
                  ? "bg-muted/40 text-muted-foreground border-muted line-through opacity-50"
                  : "bg-white hover:bg-muted/30 border-border shadow-sm"
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: isHidden ? "#d1d5db" : COLORS[(i + colorOffset) % COLORS.length] }}
              />
              {d.name}
              <span className={`ml-0.5 ${isHidden ? "" : "font-semibold"}`}>{d.value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtK(v: number) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmt(v);
}
function fmtNum(v: number, d = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtMesAno(m: string) {
  const MS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, mo] = m.split("-");
  return `${MS[parseInt(mo) - 1]}/${y}`;
}

const CTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}:</span>
          <span className="font-bold">{typeof p.value === "number" && p.value > 100 ? fmt(p.value) : fmtNum(p.value, 2)}</span>
        </p>
      ))}
    </div>
  );
};

function SectionTitle({ icon: Icon, title, color = "text-foreground" }: { icon: any; title: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`p-1.5 rounded-lg bg-muted ${color}`}><Icon className="h-4 w-4" /></div>
      <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
    </div>
  );
}

function RankBar({ rank, name, value, label, max, color, sub }: any) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] text-muted-foreground w-4 text-right font-bold">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="font-medium truncate">{name}</span>
          <span className="text-muted-foreground ml-2 whitespace-nowrap">{label}{sub ? ` · ${sub}` : ""}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function FrotasAnalitico() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const toggleSeries = (dataKey: string) => setHiddenSeries(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));
  const [anoDash, setAnoDash] = useState<number | undefined>(new Date().getFullYear());

  const dash = trpc.frotas.getDashboard.useQuery({ companyId: cId, ano: anoDash }, { enabled: cId > 0 });
  const fuel = trpc.frotas.listFuelRecords.useQuery({ companyId: cId }, { enabled: cId > 0 });

  if (!dash.data) {
    return (
      <DashboardLayout>
        <div className="p-4 flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  const d = dash.data;
  const allFuelRaw = fuel.data || [];
  const allFuel = anoDash
    ? (allFuelRaw as any[]).filter((f: any) => {
        const y = parseInt(((f.data || f.dataAbastecimento || "") as string).substring(0, 4));
        return y === anoDash;
      })
    : allFuelRaw;

  const custosPorVeiculo = d.custoPorVeiculo.slice(0, 15);

  const motoristas: Record<string, { litros: number; valor: number; abastecimentos: number }> = {};
  for (const f of allFuel as any[]) {
    const nome = f.motorista || "Não informado";
    if (!motoristas[nome]) motoristas[nome] = { litros: 0, valor: 0, abastecimentos: 0 };
    motoristas[nome].litros += parseFloat(f.litros || "0");
    motoristas[nome].valor += parseFloat(f.valorTotal || f.valor_total || "0");
    motoristas[nome].abastecimentos += 1;
  }
  const topMotoristas = Object.entries(motoristas)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const distCusto = [
    { name: "Combustível", value: d.totalCombustivel, pct: d.custoOperTotal > 0 ? Math.round((d.totalCombustivel / d.custoOperTotal) * 100) : 0 },
    { name: "Manutenção", value: d.totalManutCusto, pct: d.custoOperTotal > 0 ? Math.round((d.totalManutCusto / d.custoOperTotal) * 100) : 0 },
    { name: "Multas", value: d.totalMultas, pct: d.custoOperTotal > 0 ? Math.round((d.totalMultas / d.custoOperTotal) * 100) : 0 },
  ].filter(x => x.value > 0);

  const distTipo = Object.entries(d.tipoCount).map(([name, value]) => ({
    name, value, pct: d.totalVehicles > 0 ? Math.round(((value as number) / d.totalVehicles) * 100) : 0,
  }));

  const distMarca = Object.entries(d.marcaCount)
    .map(([name, value]) => ({ name, value, pct: d.totalVehicles > 0 ? Math.round(((value as number) / d.totalVehicles) * 100) : 0 }))
    .sort((a, b) => (b.value as number) - (a.value as number));

  const distCombustivel = Object.entries(d.tipoCombustivel)
    .map(([name, value]) => ({ name, value: value as number, pct: d.totalLitros > 0 ? Math.round(((value as number) / d.totalLitros) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);

  const evolucaoMensal = Object.entries(d.custosTotaisByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([m, costs]) => {
      const c = costs as any;
      return { name: fmtMesAno(m), combustivel: c.combustivel, manutencao: c.manutencao, multas: c.multas, total: c.combustivel + c.manutencao + c.multas };
    });

  const postosFrequentes: Record<string, { litros: number; valor: number; count: number }> = {};
  for (const f of allFuel as any[]) {
    const posto = f.posto || f.local || "Não informado";
    if (!postosFrequentes[posto]) postosFrequentes[posto] = { litros: 0, valor: 0, count: 0 };
    postosFrequentes[posto].litros += parseFloat(f.litros || "0");
    postosFrequentes[posto].valor += parseFloat(f.valorTotal || f.valor_total || "0");
    postosFrequentes[posto].count += 1;
  }
  const topPostos = Object.entries(postosFrequentes)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const depTop = d.depreciacaoPorVeiculo
    .filter((v: any) => v.deprecReal > 0)
    .sort((a: any, b: any) => b.deprecReal - a.deprecReal)
    .slice(0, 8);

  const topMotoristasPorLitros = useMemo(() => [...topMotoristas].sort((a, b) => b.litros - a.litros), [topMotoristas]);
  const maxCustoVeiculo = custosPorVeiculo[0]?.custoTotal || 1;
  const maxPostoValor = topPostos[0]?.valor || 1;
  const maxDep = depTop[0]?.deprecReal || 1;

  return (
    <DashboardLayout>
      <div className="p-3 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" /> Analítico de Frotas
            </h1>
            <p className="text-xs text-muted-foreground">Visão estratégica completa — custos, consumo, motoristas, veículos e desempenho</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              value={anoDash ?? ""}
              onChange={(e) => setAnoDash(e.target.value ? Number(e.target.value) : undefined)}
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
            >
              <option value="">Todos os anos</option>
              {(d.anosDisponiveis || []).map((a: number) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {anoDash && (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setAnoDash(undefined)}>
                {anoDash} <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { icon: Truck, label: "Veículos Ativos", value: String(d.totalVehicles), color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-900" },
            { icon: DollarSign, label: "Custo Operacional", value: fmt(d.custoOperTotal), color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950" },
            { icon: Fuel, label: "Combustível", value: fmt(d.totalCombustivel), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950", sub: `${fmtNum(d.totalLitros, 0)} litros` },
            { icon: Wrench, label: "Manutenção", value: fmt(d.totalManutCusto), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
            { icon: Activity, label: "Custo/km", value: `R$ ${fmtNum(d.custoKm, 2)}`, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950", sub: `${fmtNum(d.totalKm, 0)} km` },
            { icon: Gauge, label: "Consumo Médio", value: d.consumoMedio > 0 ? `${fmtNum(d.consumoMedio)} km/l` : "—", color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950" },
          ].map((k, i) => (
            <div key={i} className={`${k.bg} border rounded-xl p-3`}>
              <div className="flex items-center gap-1.5 mb-1">
                <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                <span className="text-[10px] text-muted-foreground uppercase font-medium">{k.label}</span>
              </div>
              <p className="text-sm font-bold">{k.value}</p>
              {(k as any).sub && <p className="text-[10px] text-muted-foreground">{(k as any).sub}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-500" /> Evolução Mensal de Custos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip content={<CTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                    onClick={(e: any) => toggleSeries(e.dataKey)}
                    formatter={(value: string, entry: any) => (
                      <span style={{ color: hiddenSeries[entry.dataKey] ? "#ccc" : entry.color, textDecoration: hiddenSeries[entry.dataKey] ? "line-through" : "none" }}>{value}</span>
                    )}
                  />
                  <Bar dataKey="combustivel" name="Combustível" fill="#3b82f6" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.combustivel} />
                  <Bar dataKey="manutencao" name="Manutenção" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.manutencao} />
                  <Bar dataKey="multas" name="Multas" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" hide={!!hiddenSeries.multas} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} hide={!!hiddenSeries.total} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4 text-blue-500" /> Distribuição de Custos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={distCusto} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                    {distCusto.map((_, i) => <Cell key={i} fill={["#3b82f6", "#10b981", "#ef4444"][i]} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0].payload;
                    return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{dd.name}</strong>: {fmt(dd.value)} ({dd.pct}%)</div>;
                  }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 text-xs">
                {distCusto.map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: ["#3b82f6", "#10b981", "#ef4444"][i] }} />
                    {item.name}: <strong>{item.pct}%</strong> ({fmt(item.value)})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Trophy} title="Ranking Veículos — Maior Custo" color="text-red-500" />
            </CardHeader>
            <CardContent className="space-y-0.5">
              {custosPorVeiculo.map((v: any, i: number) => (
                <RankBar
                  key={v.id}
                  rank={i + 1}
                  name={`${v.placa} ${v.modelo || ""}`}
                  value={v.custoTotal}
                  label={fmt(v.custoTotal)}
                  max={maxCustoVeiculo}
                  color="bg-gradient-to-r from-red-400 to-orange-500"
                  sub={v.consumo > 0 ? `${fmtNum(v.consumo)} km/l` : null}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Users} title="Ranking Motoristas — Gasto (R$)" color="text-purple-500" />
            </CardHeader>
            <CardContent>
              {topMotoristas.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={topMotoristas} margin={{ top: 5, right: 5, bottom: 60, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "#888" }}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={70}
                      tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 13) + "…" : v}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v.toFixed(0)}`} width={55} />
                    <Tooltip
                      formatter={(v: number, _: any, props: any) => [fmt(v), "Gasto"]}
                      labelFormatter={(name: string) => name}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {topMotoristas.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Droplets} title="Ranking Motoristas — Litros" color="text-blue-500" />
            </CardHeader>
            <CardContent>
              {topMotoristas.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={topMotoristasPorLitros} margin={{ top: 5, right: 5, bottom: 60, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "#888" }}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={70}
                      tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 13) + "…" : v}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(0)}L`} width={50} />
                    <Tooltip
                      formatter={(v: number) => [`${fmtNum(v, 0)}L`, "Litros"]}
                      labelFormatter={(name: string) => name}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="litros" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {topMotoristasPorLitros.map((_, i) => (
                        <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={MapPin} title="Postos Mais Utilizados" color="text-cyan-500" />
            </CardHeader>
            <CardContent className="space-y-0.5">
              {topPostos.length > 0 ? topPostos.map((p, i) => (
                <RankBar
                  key={i}
                  rank={i + 1}
                  name={p.name.length > 30 ? p.name.slice(0, 28) + "…" : p.name}
                  value={p.valor}
                  label={fmt(p.valor)}
                  max={maxPostoValor}
                  color="bg-gradient-to-r from-cyan-400 to-teal-500"
                  sub={`${fmtNum(p.litros, 0)}L · ${p.count}x`}
                />
              )) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /> Frota por Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {distTipo.length > 0 ? (
                <InteractivePie data={distTipo} colorOffset={0} unit="veículos" />
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /> Frota por Marca</CardTitle>
            </CardHeader>
            <CardContent>
              {distMarca.length > 0 ? (
                <InteractivePie data={distMarca} colorOffset={3} unit="veículos" />
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm flex items-center gap-2"><Droplets className="h-4 w-4 text-amber-500" /> Tipo de Combustível</CardTitle>
            </CardHeader>
            <CardContent>
              {distCombustivel.length > 0 ? (
                <InteractivePie data={distCombustivel} colorOffset={6} unit="litros" valueFormatter={(v) => fmtNum(v, 0)} />
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Gauge} title="Consumo por Veículo (km/l)" color="text-green-500" />
            </CardHeader>
            <CardContent>
              {(() => {
                const data = custosPorVeiculo
                  .filter((v: any) => v.consumo > 0)
                  .map((v: any) => ({ name: v.placa || v.modelo, consumo: Math.round(v.consumo * 100) / 100 }))
                  .sort((a: any, b: any) => b.consumo - a.consumo);
                return data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
                    <BarChart data={data} layout="vertical" margin={{ left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{payload[0].payload.name}</strong>: {fmtNum(payload[0].value as number, 2)} km/l</div>;
                      }} />
                      <Bar dataKey="consumo" name="km/l" radius={[0, 4, 4, 0]}>
                        {data.map((v: any, i: number) => (
                          <Cell key={i} fill={v.consumo >= 10 ? "#10b981" : v.consumo >= 6 ? "#3b82f6" : v.consumo >= 3 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados de consumo</p>;
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={Activity} title="Custo por Km (R$/km)" color="text-orange-500" />
            </CardHeader>
            <CardContent>
              {(() => {
                const data = custosPorVeiculo
                  .filter((v: any) => v.km > 0 && v.custoKmV > 0)
                  .map((v: any) => ({ name: v.placa || v.modelo, custoKm: Math.round(v.custoKmV * 100) / 100, km: v.km }))
                  .sort((a: any, b: any) => b.custoKm - a.custoKm);
                return data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
                    <BarChart data={data} layout="vertical" margin={{ left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${fmtNum(v, 2)}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const v = payload[0].payload;
                        return <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs"><strong>{v.name}</strong>: R$ {fmtNum(v.custoKm, 2)}/km · {fmtNum(v.km, 0)} km</div>;
                      }} />
                      <Bar dataKey="custoKm" name="R$/km" radius={[0, 4, 4, 0]}>
                        {data.map((v: any, i: number) => (
                          <Cell key={i} fill={v.custoKm <= 0.1 ? "#10b981" : v.custoKm <= 0.2 ? "#3b82f6" : v.custoKm <= 0.4 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados de km</p>;
              })()}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={TrendingDown} title="Depreciação por Veículo" color="text-amber-500" />
            </CardHeader>
            <CardContent className="space-y-0.5">
              {depTop.length > 0 ? depTop.map((v: any, i: number) => (
                <RankBar
                  key={v.id}
                  rank={i + 1}
                  name={`${v.placa} ${v.modelo || ""}`}
                  value={v.deprecReal}
                  label={fmt(v.deprecReal)}
                  max={maxDep}
                  color={v.pctDep >= 80 ? "bg-gradient-to-r from-red-400 to-red-600" : v.pctDep >= 50 ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-green-400 to-emerald-500"}
                  sub={`${v.pctDep}% dep.`}
                />
              )) : <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <SectionTitle icon={DollarSign} title="Patrimônio" color="text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center border border-blue-200">
                  <p className="text-[10px] text-blue-600 uppercase font-medium">Valor FIPE</p>
                  <p className="text-sm font-bold text-blue-700">{fmt(d.totalFipe)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center border border-green-200">
                  <p className="text-[10px] text-green-600 uppercase font-medium">Valor Compra</p>
                  <p className="text-sm font-bold text-green-700">{fmt(d.totalCompra)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center border border-red-200">
                  <p className="text-[10px] text-red-600 uppercase font-medium">Depreciação</p>
                  <p className="text-sm font-bold text-red-700">{fmt(d.depreciacao)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Proporção FIPE / Depreciação (base: compra)</div>
                <div className="h-7 bg-muted rounded-full overflow-hidden flex">
                  {d.totalCompra > 0 && (
                    <>
                      <div className="h-full bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${Math.round((d.totalFipe / d.totalCompra) * 100)}%` }}>
                        FIPE {Math.round((d.totalFipe / d.totalCompra) * 100)}%
                      </div>
                      <div className="h-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${Math.min(100, Math.round((d.depreciacao / d.totalCompra) * 100))}%` }}>
                        Dep {Math.round((d.depreciacao / d.totalCompra) * 100)}%
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Idade Média</p>
                  <p className="text-sm font-bold">{fmtNum(d.idadeFrota)} anos</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Km Total</p>
                  <p className="text-sm font-bold">{fmtNum(d.totalKm, 0)} km</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-1">
            <SectionTitle icon={BarChart3} title="Tabela Completa — Veículos" color="text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left">
                    <th className="py-2 px-2 font-semibold">#</th>
                    <th className="py-2 px-2 font-semibold">Placa</th>
                    <th className="py-2 px-2 font-semibold">Modelo</th>
                    <th className="py-2 px-2 font-semibold">Tipo</th>
                    <th className="py-2 px-2 text-right font-semibold text-blue-600">Combustível</th>
                    <th className="py-2 px-2 text-right font-semibold text-emerald-600">Manutenção</th>
                    <th className="py-2 px-2 text-right font-semibold text-red-600">Multas</th>
                    <th className="py-2 px-2 text-right font-semibold">Total</th>
                    <th className="py-2 px-2 text-right font-semibold">km/l</th>
                    <th className="py-2 px-2 text-right font-semibold">R$/km</th>
                    <th className="py-2 px-2 text-right font-semibold">Km</th>
                    <th className="py-2 px-2 text-center font-semibold">Abast.</th>
                  </tr>
                </thead>
                <tbody>
                  {custosPorVeiculo.map((v: any, i: number) => (
                    <tr key={v.id} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 px-2"><span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{v.placa}</span></td>
                      <td className="py-1.5 px-2 text-muted-foreground">{v.modelo}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{v.tipo}</td>
                      <td className="py-1.5 px-2 text-right text-blue-600">{v.custoComb > 0 ? fmt(v.custoComb) : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-600">{v.custoManut > 0 ? fmt(v.custoManut) : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-red-600">{v.custoMultas > 0 ? fmt(v.custoMultas) : "—"}</td>
                      <td className="py-1.5 px-2 text-right font-bold">{fmt(v.custoTotal)}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={v.consumo >= 10 ? "text-green-600 font-bold" : v.consumo >= 6 ? "text-blue-600" : v.consumo > 0 ? "text-amber-600" : ""}>
                          {v.consumo > 0 ? fmtNum(v.consumo, 1) : "—"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right">{v.custoKmV > 0 ? `R$ ${fmtNum(v.custoKmV, 2)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-right">{v.km > 0 ? fmtNum(v.km, 0) : "—"}</td>
                      <td className="py-1.5 px-2 text-center">{v.abastecimentos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
