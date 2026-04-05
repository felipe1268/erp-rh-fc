import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, PieChart as PieIcon, TrendingUp, Fuel, Wrench, AlertTriangle,
  Truck, DollarSign, Activity, Users, Gauge, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, RadialBarChart, RadialBar, ComposedChart, Line, Area
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48"];

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
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, mo] = m.split("-");
  return `${MESES[parseInt(mo) - 1]}/${y}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
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

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold">{d.name}</p>
      <p className="text-muted-foreground">{fmt(d.value)} ({d.payload.pct}%)</p>
    </div>
  );
};

function KpiMini({ icon: Icon, label, value, sub, color = "text-primary" }: any) {
  return (
    <div className="bg-card border rounded-xl p-3 flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-muted/50 ${color}`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold truncate">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export default function FrotasAnalitico() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const toggleSeries = (dataKey: string) => {
    setHiddenSeries(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const dash = trpc.frotas.getDashboard.useQuery({ companyId: cId }, { enabled: cId > 0 });
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
  const allFuel = fuel.data || [];

  const custosPorVeiculo = d.custoPorVeiculo.slice(0, 15);
  const topGastadores = custosPorVeiculo.map((v: any) => ({
    name: v.placa || v.modelo,
    combustivel: v.custoComb,
    manutencao: v.custoManut,
    multas: v.custoMultas,
    total: v.custoTotal,
  }));

  const motoristas: Record<string, { litros: number; valor: number; abastecimentos: number }> = {};
  for (const f of allFuel as any[]) {
    const nome = f.motorista || "Não informado";
    if (!motoristas[nome]) motoristas[nome] = { litros: 0, valor: 0, abastecimentos: 0 };
    motoristas[nome].litros += parseFloat(f.litros || "0");
    motoristas[nome].valor += parseFloat(f.valorTotal || f.valor_total || "0");
    motoristas[nome].abastecimentos += 1;
  }
  const topMotoristas = Object.entries(motoristas)
    .map(([name, v]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, ...v }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const distCusto = [
    { name: "Combustível", value: d.totalCombustivel, pct: d.custoOperTotal > 0 ? Math.round((d.totalCombustivel / d.custoOperTotal) * 100) : 0 },
    { name: "Manutenção", value: d.totalManutCusto, pct: d.custoOperTotal > 0 ? Math.round((d.totalManutCusto / d.custoOperTotal) * 100) : 0 },
    { name: "Multas", value: d.totalMultas, pct: d.custoOperTotal > 0 ? Math.round((d.totalMultas / d.custoOperTotal) * 100) : 0 },
  ].filter(x => x.value > 0);
  const distCustoColors = ["#3b82f6", "#10b981", "#ef4444"];

  const distTipo = Object.entries(d.tipoCount).map(([name, value]) => {
    const total = d.totalVehicles;
    return { name, value, pct: total > 0 ? Math.round(((value as number) / total) * 100) : 0 };
  });

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

  const consumoPorVeiculo = custosPorVeiculo
    .filter((v: any) => v.consumo > 0)
    .map((v: any) => ({ name: v.placa || v.modelo, consumo: Math.round(v.consumo * 100) / 100 }))
    .sort((a: any, b: any) => a.consumo - b.consumo);

  const eficienciaVeiculos = custosPorVeiculo
    .filter((v: any) => v.km > 0)
    .map((v: any) => ({
      name: v.placa || v.modelo,
      custoKm: Math.round(v.custoKmV * 100) / 100,
      km: v.km,
    }))
    .sort((a: any, b: any) => b.custoKm - a.custoKm);

  const litrosPorVeiculo = custosPorVeiculo
    .filter((v: any) => v.litros > 0)
    .map((v: any) => ({ name: v.placa || v.modelo, litros: Math.round(v.litros) }))
    .sort((a: any, b: any) => b.litros - a.litros);

  const patrimonio = [
    { name: "Valor FIPE", value: d.totalFipe, pct: 100 },
    { name: "Depreciação", value: d.depreciacao, pct: d.totalCompra > 0 ? Math.round((d.depreciacao / d.totalCompra) * 100) : 0 },
  ];

  const postosFrequentes: Record<string, { litros: number; valor: number; count: number }> = {};
  for (const f of allFuel as any[]) {
    const posto = f.posto || f.local || "Não informado";
    if (!postosFrequentes[posto]) postosFrequentes[posto] = { litros: 0, valor: 0, count: 0 };
    postosFrequentes[posto].litros += parseFloat(f.litros || "0");
    postosFrequentes[posto].valor += parseFloat(f.valorTotal || f.valor_total || "0");
    postosFrequentes[posto].count += 1;
  }
  const topPostos = Object.entries(postosFrequentes)
    .map(([name, v]) => ({ name: name.length > 25 ? name.slice(0, 23) + "…" : name, ...v }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const depStatus = d.depreciacaoPorVeiculo
    .filter((v: any) => v.deprecReal > 0)
    .sort((a: any, b: any) => b.pctDep - a.pctDep)
    .slice(0, 10)
    .map((v: any) => ({
      name: v.placa || v.modelo,
      depreciacao: v.deprecReal,
      pctDep: v.pctDep,
    }));

  return (
    <DashboardLayout>
      <div className="p-2 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" /> Analítico de Frotas
            </h1>
            <p className="text-xs text-muted-foreground">Visão completa de custos, consumo e desempenho da frota</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <KpiMini icon={Truck} label="Veículos" value={d.totalVehicles} color="text-slate-600" />
          <KpiMini icon={DollarSign} label="Custo Total" value={fmt(d.custoOperTotal)} sub={`Média: ${fmt(d.totalVehicles > 0 ? d.custoOperTotal / d.totalVehicles : 0)}/veículo`} color="text-indigo-600" />
          <KpiMini icon={Fuel} label="Combustível" value={fmt(d.totalCombustivel)} sub={`${fmtNum(d.totalLitros, 0)} litros`} color="text-blue-600" />
          <KpiMini icon={Wrench} label="Manutenção" value={fmt(d.totalManutCusto)} color="text-emerald-600" />
          <KpiMini icon={Activity} label="R$/km" value={`R$ ${fmtNum(d.custoKm, 2)}`} sub={`${fmtNum(d.totalKm, 0)} km rodados`} color="text-purple-600" />
          <KpiMini icon={Gauge} label="Consumo Médio" value={d.consumoMedio > 0 ? `${fmtNum(d.consumoMedio)} km/l` : "—"} color="text-cyan-600" />
        </div>

        <Tabs defaultValue="custos" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-xl">
            <TabsTrigger value="custos" className="text-xs gap-1"><DollarSign className="h-3 w-3" /> Custos</TabsTrigger>
            <TabsTrigger value="combustivel" className="text-xs gap-1"><Fuel className="h-3 w-3" /> Combustível</TabsTrigger>
            <TabsTrigger value="frota" className="text-xs gap-1"><Truck className="h-3 w-3" /> Frota</TabsTrigger>
            <TabsTrigger value="desempenho" className="text-xs gap-1"><TrendingUp className="h-3 w-3" /> Desempenho</TabsTrigger>
          </TabsList>

          <TabsContent value="custos" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Evolução Mensal de Custos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={evolucaoMensal}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtK(v)} />
                      <Tooltip content={<CustomTooltip />} />
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4" /> Distribuição de Custos</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={distCusto} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {distCusto.map((_, i) => <Cell key={i} fill={distCustoColors[i]} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 justify-center text-xs mt-2">
                    {distCusto.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded" style={{ backgroundColor: distCustoColors[i] }} />
                        <span>{item.name}: <strong>{item.pct}%</strong></span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-500" /> Top Veículos — Maior Custo Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(200, topGastadores.length * 32)}>
                    <BarChart data={topGastadores} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="combustivel" name="Combustível" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="manutencao" name="Manutenção" fill="#10b981" stackId="a" />
                      <Bar dataKey="multas" name="Multas" fill="#ef4444" stackId="a" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><ArrowDownRight className="h-4 w-4 text-amber-500" /> Depreciação por Veículo</CardTitle>
                </CardHeader>
                <CardContent>
                  {depStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, depStatus.length * 32)}>
                      <BarChart data={depStatus} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const v = payload[0].payload;
                          return (
                            <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                              <p className="font-semibold">{v.name}</p>
                              <p>Depreciação: {fmt(v.depreciacao)}</p>
                              <p>Percentual: {v.pctDep}%</p>
                            </div>
                          );
                        }} />
                        <Bar dataKey="depreciacao" name="Depreciação" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                          {depStatus.map((v: any, i: number) => (
                            <Cell key={i} fill={v.pctDep >= 80 ? "#ef4444" : v.pctDep >= 50 ? "#f59e0b" : "#10b981"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de depreciação</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="combustivel" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4" /> Tipo de Combustível (Litros)</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={distCombustivel} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, pct }) => `${name} ${pct}%`}>
                        {distCombustivel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                            <p className="font-semibold">{d.name}</p>
                            <p>{fmtNum(d.value, 0)} litros ({d.pct}%)</p>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Fuel className="h-4 w-4" /> Litros por Veículo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(220, litrosPorVeiculo.length * 28)}>
                    <BarChart data={litrosPorVeiculo} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                            <p className="font-semibold">{payload[0].payload.name}</p>
                            <p>{fmtNum(payload[0].value as number, 0)} litros</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="litros" name="Litros" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Gasto por Motorista</CardTitle>
                </CardHeader>
                <CardContent>
                  {topMotoristas.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(220, topMotoristas.length * 28)}>
                      <BarChart data={topMotoristas} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const v = payload[0].payload;
                          return (
                            <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                              <p className="font-semibold">{v.name}</p>
                              <p>Valor: {fmt(v.valor)}</p>
                              <p>Litros: {fmtNum(v.litros, 0)}</p>
                              <p>Abastecimentos: {v.abastecimentos}</p>
                            </div>
                          );
                        }} />
                        <Bar dataKey="valor" name="Valor (R$)" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de motoristas</p>}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Postos Mais Utilizados</CardTitle>
                </CardHeader>
                <CardContent>
                  {topPostos.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, topPostos.length * 30)}>
                      <BarChart data={topPostos} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const v = payload[0].payload;
                          return (
                            <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                              <p className="font-semibold">{v.name}</p>
                              <p>Valor: {fmt(v.valor)}</p>
                              <p>Litros: {fmtNum(v.litros, 0)}</p>
                              <p>Abastecimentos: {v.count}</p>
                            </div>
                          );
                        }} />
                        <Bar dataKey="valor" name="Valor (R$)" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de postos</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Ranking Motoristas — Litros</CardTitle>
                </CardHeader>
                <CardContent>
                  {topMotoristas.length > 0 ? (
                    <div className="space-y-2">
                      {topMotoristas.map((m, i) => {
                        const maxL = topMotoristas[0]?.litros || 1;
                        const pct = (m.litros / maxL) * 100;
                        return (
                          <div key={i} className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{i + 1}. {m.name}</span>
                              <span className="text-muted-foreground">{fmtNum(m.litros, 0)}L · {m.abastecimentos} abast.</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de motoristas</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="frota" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4" /> Composição por Tipo</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={distTipo} cx="50%" cy="50%" outerRadius={75} paddingAngle={2} dataKey="value" label={({ name, pct }) => `${name} ${pct}%`}>
                        {distTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4" /> Composição por Marca</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={distMarca} cx="50%" cy="50%" outerRadius={75} paddingAngle={2} dataKey="value" label={({ name, pct }) => `${name} ${pct}%`}>
                        {distMarca.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="h-4 w-4" /> Status dos Veículos</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  {Object.keys(d.statusVeiculos).length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={Object.entries(d.statusVeiculos).map(([name, value]) => ({
                            name, value, pct: d.totalVehicles > 0 ? Math.round(((value as number) / d.totalVehicles) * 100) : 0
                          }))}
                          cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
                        >
                          {Object.keys(d.statusVeiculos).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>}
                  <div className="flex flex-wrap gap-2 justify-center text-xs mt-1">
                    {Object.entries(d.statusVeiculos).map(([name, value], i) => (
                      <span key={name} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {name}: <strong>{value as number}</strong>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Idade da Frota</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(d.idadeDistribuicao).length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={Object.entries(d.idadeDistribuicao).map(([name, value]) => ({ name, veiculos: value }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="veiculos" name="Veículos" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                          {Object.entries(d.idadeDistribuicao).map((_, i) => (
                            <Cell key={i} fill={["#10b981", "#3b82f6", "#f59e0b", "#ef4444"][i] || "#6366f1"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Patrimônio — FIPE vs Depreciação</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center border border-blue-200">
                      <p className="text-[10px] text-blue-600 uppercase font-medium">Valor FIPE Total</p>
                      <p className="text-lg font-bold text-blue-700">{fmtK(d.totalFipe)}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center border border-red-200">
                      <p className="text-[10px] text-red-600 uppercase font-medium">Depreciação Total</p>
                      <p className="text-lg font-bold text-red-700">{fmtK(d.depreciacao)}</p>
                      <p className="text-[10px] text-red-500">{d.totalCompra > 0 ? `${Math.round((d.depreciacao / d.totalCompra) * 100)}% do valor de compra` : ""}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Valor de Compra</div>
                    <div className="h-6 bg-muted rounded-full overflow-hidden flex">
                      <div className="h-full bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${d.totalCompra > 0 ? Math.round((d.totalFipe / d.totalCompra) * 100) : 0}%` }}>
                        FIPE {d.totalCompra > 0 ? Math.round((d.totalFipe / d.totalCompra) * 100) : 0}%
                      </div>
                      <div className="h-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold" style={{ width: `${d.totalCompra > 0 ? Math.min(100, Math.round((d.depreciacao / d.totalCompra) * 100)) : 0}%` }}>
                        Dep {d.totalCompra > 0 ? Math.round((d.depreciacao / d.totalCompra) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="desempenho" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4" /> Consumo por Veículo (km/l)</CardTitle>
                </CardHeader>
                <CardContent>
                  {consumoPorVeiculo.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(220, consumoPorVeiculo.length * 30)}>
                      <BarChart data={consumoPorVeiculo} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                              <p className="font-semibold">{payload[0].payload.name}</p>
                              <p>{fmtNum(payload[0].value as number, 2)} km/l</p>
                            </div>
                          );
                        }} />
                        <Bar dataKey="consumo" name="km/l" radius={[0, 4, 4, 0]}>
                          {consumoPorVeiculo.map((v: any, i: number) => (
                            <Cell key={i} fill={v.consumo >= 10 ? "#10b981" : v.consumo >= 6 ? "#3b82f6" : v.consumo >= 3 ? "#f59e0b" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de consumo</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Custo por Km (R$/km)</CardTitle>
                </CardHeader>
                <CardContent>
                  {eficienciaVeiculos.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(220, eficienciaVeiculos.length * 30)}>
                      <BarChart data={eficienciaVeiculos} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$ ${fmtNum(v, 2)}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const v = payload[0].payload;
                          return (
                            <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs">
                              <p className="font-semibold">{v.name}</p>
                              <p>R$ {fmtNum(v.custoKm, 2)}/km</p>
                              <p>{fmtNum(v.km, 0)} km rodados</p>
                            </div>
                          );
                        }} />
                        <Bar dataKey="custoKm" name="R$/km" radius={[0, 4, 4, 0]}>
                          {eficienciaVeiculos.map((v: any, i: number) => (
                            <Cell key={i} fill={v.custoKm <= 0.15 ? "#10b981" : v.custoKm <= 0.3 ? "#3b82f6" : v.custoKm <= 0.5 ? "#f59e0b" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de km</p>}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Ranking de Eficiência — Veículos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto max-h-[350px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b text-left">
                          <th className="py-2 px-1 font-semibold">#</th>
                          <th className="py-2 px-1 font-semibold">Veículo</th>
                          <th className="py-2 px-1 text-right font-semibold">km/l</th>
                          <th className="py-2 px-1 text-right font-semibold">R$/km</th>
                          <th className="py-2 px-1 text-right font-semibold">Km</th>
                          <th className="py-2 px-1 text-right font-semibold">Custo Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {custosPorVeiculo
                          .filter((v: any) => v.consumo > 0 || v.km > 0)
                          .sort((a: any, b: any) => (b.consumo || 0) - (a.consumo || 0))
                          .map((v: any, i: number) => (
                          <tr key={v.id} className="border-b hover:bg-muted/30">
                            <td className="py-1.5 px-1 text-muted-foreground">{i + 1}</td>
                            <td className="py-1.5 px-1">
                              <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{v.placa}</span>
                              <span className="ml-1 text-muted-foreground">{v.modelo}</span>
                            </td>
                            <td className="py-1.5 px-1 text-right">
                              <span className={`font-bold ${v.consumo >= 10 ? "text-green-600" : v.consumo >= 6 ? "text-blue-600" : "text-amber-600"}`}>
                                {v.consumo > 0 ? fmtNum(v.consumo, 1) : "—"}
                              </span>
                            </td>
                            <td className="py-1.5 px-1 text-right">{v.custoKmV > 0 ? `R$ ${fmtNum(v.custoKmV, 2)}` : "—"}</td>
                            <td className="py-1.5 px-1 text-right">{fmtNum(v.km, 0)}</td>
                            <td className="py-1.5 px-1 text-right font-medium">{fmt(v.custoTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Ranking Motoristas — Valor e Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto max-h-[350px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b text-left">
                          <th className="py-2 px-1 font-semibold">#</th>
                          <th className="py-2 px-1 font-semibold">Motorista</th>
                          <th className="py-2 px-1 text-right font-semibold">Valor</th>
                          <th className="py-2 px-1 text-right font-semibold">Litros</th>
                          <th className="py-2 px-1 text-right font-semibold">Abast.</th>
                          <th className="py-2 px-1 text-right font-semibold">Média/Abast.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topMotoristas.map((m, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="py-1.5 px-1 text-muted-foreground">{i + 1}</td>
                            <td className="py-1.5 px-1 font-medium">{m.name}</td>
                            <td className="py-1.5 px-1 text-right font-bold text-blue-600">{fmt(m.valor)}</td>
                            <td className="py-1.5 px-1 text-right">{fmtNum(m.litros, 0)}</td>
                            <td className="py-1.5 px-1 text-right">{m.abastecimentos}</td>
                            <td className="py-1.5 px-1 text-right text-muted-foreground">{m.abastecimentos > 0 ? fmt(m.valor / m.abastecimentos) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
