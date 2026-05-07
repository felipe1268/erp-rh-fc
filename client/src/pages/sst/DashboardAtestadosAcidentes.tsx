import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  HeartPulse, AlertTriangle, FileWarning, Activity, Users, Clock,
  TrendingUp, TrendingDown, Stethoscope, ShieldAlert, FileCheck2, Calendar, RefreshCw,
  BarChart3, ArrowDown, ArrowUp, Layers, MapPin, AlarmClock, DollarSign,
  CalendarClock, Repeat, CalendarDays,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area, AreaChart,
} from "recharts";
import { ChartCard } from "@/components/sst/ChartCard";
import { EmployeeDetailDialog } from "@/components/sst/EmployeeDetailDialog";

function truncate(s: string, n = 22) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];
const GRAV_COLORS: Record<string, string> = {
  Leve: "#10b981",
  Moderado: "#f59e0b",
  Moderada: "#f59e0b",
  Grave: "#ef4444",
  Gravissima: "#7f1d1d",
  Gravíssima: "#7f1d1d",
  Fatal: "#000000",
};

function fmtNum(v: number, d = 0) {
  return (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function mesLabel(ym: string) {
  const [y, m] = ym.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}
function defaultIni() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function defaultFim() {
  return new Date().toISOString().slice(0, 10);
}

function KPI({
  icon: Icon, label, value, sub, color = "text-blue-600", bg = "bg-blue-50", border = "border-blue-200",
}: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: string; bg?: string; border?: string;
}) {
  return (
    <Card className={`${bg} ${border} border`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">{label}</p>
            <p className={`text-2xl font-bold ${color} mt-1`}>{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
          </div>
          <Icon className={`${color} h-8 w-8 flex-shrink-0`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardAtestadosAcidentes() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : companyId > 0;

  const [dataInicio, setDataInicio] = useState(defaultIni());
  const [dataFim, setDataFim] = useState(defaultFim());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showCustoDetalhe, setShowCustoDetalhe] = useState(false);

  const dash = trpc.sstAnalytics.atestadosAcidentes.useQuery(
    {
      companyId: queryCompanyId,
      ...(isConstrutoras ? { companyIds } : {}),
      dataInicio, dataFim,
    },
    { enabled: hasValidCompany },
  );

  const d = dash.data;

  const evolucaoData = useMemo(() => {
    return (d?.evolucaoMensal ?? []).map((m: any) => ({
      ...m, mesLabel: mesLabel(m.mes),
    }));
  }, [d]);

  const setRange = (months: number) => {
    const fim = new Date();
    const ini = new Date();
    ini.setMonth(ini.getMonth() - (months - 1));
    ini.setDate(1);
    setDataInicio(ini.toISOString().slice(0, 10));
    setDataFim(fim.toISOString().slice(0, 10));
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <HeartPulse className="h-7 w-7 text-emerald-600" />
              Análise de Atestados & Acidentes
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Indicadores SST consolidados por período: absenteísmo médico, gravidade, taxas e tendências.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => dash.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-gray-600">Data Início</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-gray-600">Data Fim</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setRange(1)}>Mês</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(3)}>3M</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(6)}>6M</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(12)}>12M</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(24)}>24M</Button>
              </div>
            </div>
            {d && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                <Badge variant="outline" className="gap-1">
                  <Calendar className="h-3 w-3" />
                  {d.periodo.meses} {d.periodo.meses === 1 ? "mês" : "meses"}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" /> {fmtNum(d.headcount)} colaboradores ativos
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> {fmtNum(d.horasHomem)} HH no período (220h/mês)
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {!hasValidCompany && (
          <Card><CardContent className="p-8 text-center text-gray-500">Selecione uma empresa para visualizar.</CardContent></Card>
        )}

        {hasValidCompany && dash.isLoading && (
          <Card><CardContent className="p-8 text-center text-gray-500">Carregando indicadores...</CardContent></Card>
        )}

        {d && (
          <Tabs defaultValue="visaoGeral" className="space-y-4">
            <TabsList className="bg-white border">
              <TabsTrigger value="visaoGeral">Visão Geral</TabsTrigger>
              <TabsTrigger value="atestados">Atestados</TabsTrigger>
              <TabsTrigger value="acidentes">Acidentes</TabsTrigger>
              <TabsTrigger value="avancado">Indicadores Avançados</TabsTrigger>
              <TabsTrigger value="obras">Obras / Ações</TabsTrigger>
            </TabsList>

            {/* ============ VISÃO GERAL ============ */}
            <TabsContent value="visaoGeral" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={FileCheck2} label="Total Atestados" value={fmtNum(d.atestados.total)}
                  sub={`${fmtNum(d.atestados.colaboradoresAfetados)} colaboradores`} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200" />
                <KPI icon={Clock} label="Dias Afastamento (Atestado)" value={fmtNum(d.atestados.totalDiasAfastamento)}
                  sub={`Média ${fmtNum(d.atestados.mediaDiasAtestado, 1)} dias/atestado`} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
                <KPI icon={AlertTriangle} label="Total Acidentes" value={fmtNum(d.acidentes.total)}
                  sub={`${fmtNum(d.acidentes.colaboradoresAfetados)} colaboradores`} color="text-orange-600" bg="bg-orange-50" border="border-orange-200" />
                <KPI icon={ShieldAlert} label="Dias Perdidos (Acidente)" value={fmtNum(d.acidentes.totalDiasAfastamento)}
                  sub={`${fmtNum(d.acidentes.comAfastamento)} c/ afastamento`} color="text-red-600" bg="bg-red-50" border="border-red-200" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={Activity} label="Taxa de Frequência (TF)" value={fmtNum(d.acidentes.taxaFrequencia, 2)}
                  sub="acidentes c/ afast. × 1M ÷ HH" color="text-purple-600" bg="bg-purple-50" border="border-purple-200" />
                <KPI icon={TrendingUp} label="Taxa de Gravidade (TG)" value={fmtNum(d.acidentes.taxaGravidade, 2)}
                  sub="dias perdidos × 1M ÷ HH" color="text-pink-600" bg="bg-pink-50" border="border-pink-200" />
                <KPI icon={Stethoscope} label="Atestados c/ INSS" value={fmtNum(d.atestados.totalAfastamentosINSS)}
                  sub="afastamentos > 15 dias" color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-200" />
                <KPI icon={FileWarning} label="Acidentes c/ CAT" value={`${fmtNum(d.acidentes.comCAT)} / ${fmtNum(d.acidentes.total)}`}
                  sub={`${fmtNum(d.acidentes.semCAT)} sem CAT registrada`} color="text-amber-600" bg="bg-amber-50" border="border-amber-200" />
              </div>

              {/* Evolução mensal combinada */}
              <ChartCard
                title="Evolução Mensal — Atestados x Acidentes"
                icon={<BarChart3 className="h-4 w-4" />}
                height={320}
                isEmpty={evolucaoData.length === 0}
                tableData={evolucaoData}
                tableColumns={[
                  { key: "mesLabel", label: "Mês" },
                  { key: "atestados", label: "Atestados", align: "right" },
                  { key: "acidentes", label: "Acidentes", align: "right" },
                  { key: "diasAtestado", label: "Dias Atestado", align: "right" },
                  { key: "diasAcidente", label: "Dias Acidente", align: "right" },
                ]}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    <ComposedChart data={evolucaoData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="atestados" name="Atestados" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="acidentes" name="Acidentes" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="diasAtestado" name="Dias Atestado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      <Line yAxisId="right" type="monotone" dataKey="diasAcidente" name="Dias Acidente" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              />

              {/* Últimos eventos */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-emerald-600" /> Últimos Atestados</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {d.ultimosAtestados.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum atestado no período.</p>}
                      {d.ultimosAtestados.map((a) => (
                        <div key={a.id} className="p-3 hover:bg-gray-50 flex items-start gap-3">
                          <div className="bg-emerald-100 text-emerald-700 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0">
                            <Stethoscope className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{a.nome}</p>
                            <p className="text-xs text-gray-500 truncate">{a.funcao || "—"} · {a.tipo}{a.cid ? ` · CID ${a.cid}` : ""}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold text-blue-600">{a.dias} dia(s)</p>
                            <p className="text-[10px] text-gray-500">{a.data}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Últimos Acidentes</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {d.ultimosAcidentes.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum acidente no período.</p>}
                      {d.ultimosAcidentes.map((a) => (
                        <div key={a.id} className="p-3 hover:bg-gray-50 flex items-start gap-3">
                          <div className="bg-red-100 text-red-700 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{a.nome}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {a.funcao || "—"} · {a.tipo} · <span style={{ color: GRAV_COLORS[a.gravidade] || "#6b7280" }}>{a.gravidade}</span>
                              {a.parteCorpo ? ` · ${a.parteCorpo}` : ""}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold text-red-600">{a.dias} dia(s)</p>
                            <p className="text-[10px] text-gray-500">{a.data}{a.hora ? ` ${a.hora}` : ""}</p>
                            {a.catNumero ? <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 mt-0.5">CAT {a.catNumero}</Badge> :
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 mt-0.5 border-amber-300 text-amber-700">s/ CAT</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ============ ATESTADOS ============ */}
            <TabsContent value="atestados" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={FileCheck2} label="Total" value={fmtNum(d.atestados.total)} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200" />
                <KPI icon={Clock} label="Dias de Afastamento" value={fmtNum(d.atestados.totalDiasAfastamento)} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
                <KPI icon={Users} label="Colaboradores Afetados" value={fmtNum(d.atestados.colaboradoresAfetados)} color="text-indigo-600" bg="bg-indigo-50" border="border-indigo-200" />
                <KPI icon={Stethoscope} label="Com CID / Sem CID" value={`${fmtNum(d.atestados.comCID)} / ${fmtNum(d.atestados.semCID)}`} color="text-purple-600" bg="bg-purple-50" border="border-purple-200" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Atestados por Tipo"
                  height={280}
                  isEmpty={d.atestados.porTipo.length === 0}
                  tableData={d.atestados.porTipo}
                  tableColumns={[
                    { key: "tipo", label: "Tipo" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <PieChart>
                        <Pie data={d.atestados.porTipo} dataKey="quantidade" nameKey="tipo" cx="50%" cy="45%" outerRadius={Math.min(110, h / 3)} labelLine={false}>
                          {d.atestados.porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [`${fmtNum(v as number)}`, n]} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Top 10 CIDs"
                  height={280}
                  emptyMessage="Nenhum CID registrado."
                  isEmpty={d.atestados.topCIDs.length === 0}
                  tableData={d.atestados.topCIDs}
                  tableColumns={[
                    { key: "cid", label: "CID" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={d.atestados.topCIDs} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="cid" type="category" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="quantidade" name="Qtd" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              <ChartCard
                title="Top 10 Motivos"
                height={300}
                isEmpty={d.atestados.porMotivo.length === 0}
                emptyMessage="Sem motivos registrados."
                tableData={d.atestados.porMotivo}
                tableColumns={[
                  { key: "motivo", label: "Motivo" },
                  { key: "quantidade", label: "Quantidade", align: "right" },
                  { key: "dias", label: "Dias", align: "right" },
                ]}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={(d.atestados.porMotivo ?? []).map((m: any) => ({ ...m, motivoCurto: truncate(m.motivo, 16) }))} margin={{ top: 10, right: 20, left: 0, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="motivoCurto" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} height={80} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).motivo : "")} />
                      <Legend />
                      <Bar dataKey="quantidade" name="Qtd" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="dias" name="Dias" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              />

              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 Funcionários — Atestados</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Função</th>
                          <th className="px-3 py-2 text-right">Qtd</th>
                          <th className="px-3 py-2 text-right">Dias Afastamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {d.atestados.topFuncionarios.length === 0 && (
                          <tr><td colSpan={5} className="p-4 text-center text-gray-500">Sem dados.</td></tr>
                        )}
                        {d.atestados.topFuncionarios.map((f, i) => (
                          <tr key={f.employeeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                            <td className="px-3 py-2 font-medium">
                              <button
                                type="button"
                                className="text-left text-blue-700 hover:underline hover:text-blue-900"
                                onClick={() => setSelectedEmployeeId(f.employeeId)}
                                title="Ver todos os atestados deste funcionário"
                              >
                                {f.nome}
                              </button>
                              {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-700">{f.quantidade}</td>
                            <td className="px-3 py-2 text-right text-blue-700">{f.dias}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ============ ACIDENTES ============ */}
            <TabsContent value="acidentes" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPI icon={AlertTriangle} label="Total Acidentes" value={fmtNum(d.acidentes.total)} color="text-red-600" bg="bg-red-50" border="border-red-200" />
                <KPI icon={Clock} label="Dias Perdidos" value={fmtNum(d.acidentes.totalDiasAfastamento)} color="text-orange-600" bg="bg-orange-50" border="border-orange-200" />
                <KPI icon={Activity} label="Taxa Frequência" value={fmtNum(d.acidentes.taxaFrequencia, 2)} sub="× 1.000.000 / HH" color="text-purple-600" bg="bg-purple-50" border="border-purple-200" />
                <KPI icon={TrendingUp} label="Taxa Gravidade" value={fmtNum(d.acidentes.taxaGravidade, 2)} sub="× 1.000.000 / HH" color="text-pink-600" bg="bg-pink-50" border="border-pink-200" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Por Gravidade"
                  height={280}
                  isEmpty={d.acidentes.porGravidade.length === 0}
                  tableData={d.acidentes.porGravidade}
                  tableColumns={[
                    { key: "gravidade", label: "Gravidade" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <PieChart>
                        <Pie data={d.acidentes.porGravidade} dataKey="quantidade" nameKey="gravidade" cx="50%" cy="45%" outerRadius={Math.min(110, h / 3)} labelLine={false}>
                          {d.acidentes.porGravidade.map((g, i) => <Cell key={i} fill={GRAV_COLORS[g.gravidade] || COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Por Tipo de Acidente"
                  height={280}
                  isEmpty={d.acidentes.porTipo.length === 0}
                  tableData={d.acidentes.porTipo}
                  tableColumns={[
                    { key: "tipo", label: "Tipo" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={(d.acidentes.porTipo ?? []).map((x: any) => ({ ...x, tipoCurto: truncate(x.tipo, 22) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="tipoCurto" type="category" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).tipo : "")} />
                        <Bar dataKey="quantidade" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Top Partes do Corpo Atingidas"
                  height={280}
                  isEmpty={d.acidentes.porParteCorpo.length === 0}
                  tableData={d.acidentes.porParteCorpo}
                  tableColumns={[
                    { key: "parte", label: "Parte do corpo" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={(d.acidentes.porParteCorpo ?? []).map((x: any) => ({ ...x, parteCurto: truncate(x.parte, 22) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="parteCurto" type="category" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).parte : "")} />
                        <Bar dataKey="quantidade" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Top Locais"
                  height={280}
                  isEmpty={d.acidentes.porLocal.length === 0}
                  tableData={d.acidentes.porLocal}
                  tableColumns={[
                    { key: "local", label: "Local" },
                    { key: "quantidade", label: "Quantidade", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={(d.acidentes.porLocal ?? []).map((x: any) => ({ ...x, localCurto: truncate(x.local, 22) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="localCurto" type="category" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).local : "")} />
                        <Bar dataKey="quantidade" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 Funcionários — Acidentes</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Função</th>
                          <th className="px-3 py-2 text-right">Qtd</th>
                          <th className="px-3 py-2 text-right">Dias Afastamento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {d.acidentes.topFuncionarios.length === 0 && (
                          <tr><td colSpan={5} className="p-4 text-center text-gray-500">Sem dados.</td></tr>
                        )}
                        {d.acidentes.topFuncionarios.map((f, i) => (
                          <tr key={f.employeeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                            <td className="px-3 py-2 font-medium">
                              <button
                                type="button"
                                className="text-left text-blue-700 hover:underline hover:text-blue-900"
                                onClick={() => setSelectedEmployeeId(f.employeeId)}
                                title="Ver todos os acidentes deste funcionário"
                              >
                                {f.nome}
                              </button>
                              {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-red-700">{f.quantidade}</td>
                            <td className="px-3 py-2 text-right text-orange-700">{f.dias}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ============ AVANÇADO ============ */}
            <TabsContent value="avancado" className="space-y-4">
              {/* Comparativo período anterior */}
              {d.comparativoPeriodoAnterior && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Comparativo com Período Anterior</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500 mb-3">Período anterior: {d.comparativoPeriodoAnterior.periodoAnterior.dataInicio} → {d.comparativoPeriodoAnterior.periodoAnterior.dataFim}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Atestados", k: d.comparativoPeriodoAnterior.atestados, color: "text-emerald-700" },
                        { label: "Dias Atestado", k: d.comparativoPeriodoAnterior.diasAtestado, color: "text-blue-700" },
                        { label: "Acidentes", k: d.comparativoPeriodoAnterior.acidentes, color: "text-red-700" },
                        { label: "Dias Acidente", k: d.comparativoPeriodoAnterior.diasAcidente, color: "text-orange-700" },
                      ].map((it) => {
                        const up = it.k.varPct > 0;
                        const down = it.k.varPct < 0;
                        const isAtestadoOuAcidente = /Atestado|Acidente/i.test(it.label);
                        const ruim = isAtestadoOuAcidente ? up : up;
                        return (
                          <div key={it.label} className="border rounded-lg p-3">
                            <p className="text-xs uppercase text-gray-500">{it.label}</p>
                            <p className={`text-2xl font-bold ${it.color}`}>{fmtNum(it.k.atual)}</p>
                            <p className="text-[11px] text-gray-500">vs. {fmtNum(it.k.anterior)} anterior</p>
                            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${ruim ? "text-red-600" : down ? "text-emerald-600" : "text-gray-500"}`}>
                              {up ? <ArrowUp className="h-3 w-3" /> : down ? <ArrowDown className="h-3 w-3" /> : null}
                              {fmtNum(Math.abs(it.k.varPct), 1)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pirâmide de Bird + Cobertura CAT + Custo */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-amber-600" /> Pirâmide de Bird</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { label: "Graves / Fatal", v: d.piramideBird?.graves ?? 0, color: "bg-red-600", w: "w-1/4" },
                        { label: "Moderados / Leve c/ Afast", v: d.piramideBird?.moderados ?? 0, color: "bg-orange-500", w: "w-2/4" },
                        { label: "Leves / Primeiros Socorros", v: d.piramideBird?.leves ?? 0, color: "bg-yellow-500", w: "w-3/4" },
                        { label: "Quase-acidentes", v: d.piramideBird?.quaseAcidentes ?? 0, color: "bg-blue-500", w: "w-full" },
                      ].map((it, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className={`mx-auto ${it.w} ${it.color} text-white text-center py-2 rounded-md font-bold text-lg shadow`}>{it.v}</div>
                          </div>
                          <div className="w-56 text-xs text-gray-700">{it.label}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-3">A pirâmide invertida mostra que pequenos eventos (base) prenunciam os graves (topo). Quanto maior a base reportada, melhor a maturidade SST.</p>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <Card className="bg-amber-50 border-amber-200 border">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase text-gray-600">Cobertura CAT</p>
                        <p className="text-3xl font-bold text-amber-700">{fmtNum(d.coberturaCAT ?? 0, 1)}%</p>
                        <p className="text-[11px] text-gray-500 mt-1">% de acidentes (que exigem) com CAT emitida</p>
                      </div>
                      <FileWarning className="h-10 w-10 text-amber-600" />
                    </CardContent>
                  </Card>
                  <Card
                    className="bg-green-50 border-green-200 border cursor-pointer hover:bg-green-100 hover:shadow transition"
                    onClick={() => setShowCustoDetalhe(true)}
                    title="Clique para ver a memória de cálculo por colaborador"
                  >
                    <CardContent className="p-4">
                      <p className="text-xs uppercase text-gray-600 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Custo Estimado de Afastamento</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">R$ {fmtNum(d.custoEstimadoAfastamento?.total ?? 0, 2)}</p>
                      <div className="text-[11px] text-gray-600 mt-2 grid grid-cols-2 gap-1">
                        <div>Atestados: <span className="font-semibold">R$ {fmtNum(d.custoEstimadoAfastamento?.atestados ?? 0, 2)}</span></div>
                        <div>Acidentes: <span className="font-semibold">R$ {fmtNum(d.custoEstimadoAfastamento?.acidentes ?? 0, 2)}</span></div>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">Base: salário-base ÷ 30 × dias afastados (não inclui encargos)</p>
                      <p className="text-[10px] text-green-700 font-medium mt-1">→ Clique para ver memória de cálculo por colaborador</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Heatmap dia/hora */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlarmClock className="h-4 w-4" /> Mapa de Calor — Acidentes por Dia da Semana × Hora</CardTitle></CardHeader>
                <CardContent>
                  {(d.heatmapDiaHora ?? []).length === 0 ? <p className="text-sm text-gray-500">Sem registros com hora informada.</p> : (() => {
                    const max = Math.max(1, ...(d.heatmapDiaHora ?? []).map((c: any) => c.qtd));
                    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                    const cellMap = new Map<string, number>();
                    for (const c of d.heatmapDiaHora ?? []) cellMap.set(`${c.diaIdx}_${c.hora}`, c.qtd);
                    return (
                      <div className="overflow-x-auto">
                        <table className="text-xs border-collapse">
                          <thead><tr><th className="p-1"></th>{Array.from({ length: 24 }, (_, h) => <th key={h} className="p-1 text-gray-500 font-normal">{h}h</th>)}</tr></thead>
                          <tbody>
                            {dias.map((dia, di) => (
                              <tr key={dia}>
                                <td className="p-1 pr-2 font-semibold text-gray-700">{dia}</td>
                                {Array.from({ length: 24 }, (_, h) => {
                                  const v = cellMap.get(`${di}_${h}`) || 0;
                                  const op = v === 0 ? 0 : 0.15 + (v / max) * 0.85;
                                  return (
                                    <td key={h} className="p-0.5">
                                      <div className="w-7 h-7 rounded text-center text-[10px] font-bold flex items-center justify-center"
                                        style={{ backgroundColor: v > 0 ? `rgba(220, 38, 38, ${op})` : "#f3f4f6", color: op > 0.5 ? "white" : "#374151" }}
                                        title={`${dia} ${h}h: ${v} acidente(s)`}>
                                        {v || ""}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Atestados/Acidentes por dia da semana */}
              <div className="grid md:grid-cols-2 gap-4">
                <ChartCard
                  title="Atestados por Dia da Semana"
                  icon={<CalendarDays className="h-4 w-4 text-emerald-600" />}
                  height={260}
                  isEmpty={(d.atestadosPorDiaSemana ?? []).length === 0}
                  tableData={d.atestadosPorDiaSemana ?? []}
                  tableColumns={[
                    { key: "dia", label: "Dia" },
                    { key: "qtd", label: "Atestados", align: "right" },
                    { key: "dias", label: "Dias", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={d.atestadosPorDiaSemana ?? []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="qtd" name="Atestados" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="dias" name="Dias" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
                <ChartCard
                  title="Acidentes por Dia da Semana"
                  icon={<CalendarDays className="h-4 w-4 text-red-600" />}
                  height={260}
                  isEmpty={(d.acidentesPorDiaSemana ?? []).length === 0}
                  tableData={d.acidentesPorDiaSemana ?? []}
                  tableColumns={[
                    { key: "dia", label: "Dia" },
                    { key: "qtd", label: "Acidentes", align: "right" },
                  ]}
                  renderChart={(h) => (
                    <ResponsiveContainer width="100%" height={h}>
                      <BarChart data={d.acidentesPorDiaSemana ?? []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="qtd" name="Acidentes" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                />
              </div>

              {/* Atestados recorrentes */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4 text-purple-600" /> Funcionários com Atestados Recorrentes (3+)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Função</th>
                          <th className="px-3 py-2 text-right">Qtd Atestados</th>
                          <th className="px-3 py-2 text-right">Dias Acumulados</th>
                          <th className="px-3 py-2 text-right">Média/Atestado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(d.atestadosRecorrentes ?? []).length === 0 && (<tr><td colSpan={5} className="p-4 text-center text-gray-500">Nenhum funcionário com atestado recorrente no período.</td></tr>)}
                        {(d.atestadosRecorrentes ?? []).map((f: any) => (
                          <tr key={f.employeeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">
                              <button
                                type="button"
                                className="text-left text-blue-700 hover:underline hover:text-blue-900"
                                onClick={() => setSelectedEmployeeId(f.employeeId)}
                                title="Ver todos os atestados deste funcionário"
                              >
                                {f.nome}
                              </button>
                              {f.codigoInterno ? <span className="text-xs text-gray-400 ml-1">#{f.codigoInterno}</span> : (f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-purple-700">{f.quantidade}</td>
                            <td className="px-3 py-2 text-right text-blue-700">{f.dias}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtNum(f.dias / Math.max(1, f.quantidade), 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ============ OBRAS / AÇÕES ============ */}
            <TabsContent value="obras" className="space-y-4">
              {/* Dias sem acidente */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-600" /> Dias sem Acidente — por Obra</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Obra</th>
                          <th className="px-3 py-2 text-left">Último Acidente</th>
                          <th className="px-3 py-2 text-right">Dias sem Acidente</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(d.diasSemAcidente ?? []).length === 0 && (<tr><td colSpan={4} className="p-4 text-center text-gray-500">Sem obras cadastradas.</td></tr>)}
                        {(d.diasSemAcidente ?? []).map((o: any) => (
                          <tr key={o.obraId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{o.obraNome}</td>
                            <td className="px-3 py-2 text-gray-600">{o.ultimaData || <span className="text-emerald-600">Nunca</span>}</td>
                            <td className="px-3 py-2 text-right">
                              {o.dias === null
                                ? <span className="font-bold text-emerald-600">— </span>
                                : <span className={`font-bold text-lg ${o.dias >= 90 ? "text-emerald-600" : o.dias >= 30 ? "text-blue-600" : "text-orange-600"}`}>{o.dias}</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {o.dias === null
                                ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">Sem registros</Badge>
                                : o.dias >= 90 ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">Excelente</Badge>
                                  : o.dias >= 30 ? <Badge className="bg-blue-100 text-blue-700 border-blue-300" variant="outline">Bom</Badge>
                                    : <Badge className="bg-orange-100 text-orange-700 border-orange-300" variant="outline">Atenção</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Ranking de obras por nº acidentes */}
              <ChartCard
                title="Ranking de Obras com Mais Acidentes"
                icon={<BarChart3 className="h-4 w-4 text-red-600" />}
                height={Math.max(260, (d.rankingObras ?? []).length * 32)}
                isEmpty={(d.rankingObras ?? []).length === 0}
                emptyMessage="Sem acidentes vinculados a obras no período."
                tableData={d.rankingObras ?? []}
                tableColumns={[
                  { key: "obraNome", label: "Obra" },
                  { key: "qtd", label: "Acidentes", align: "right" },
                  { key: "dias", label: "Dias Perdidos", align: "right" },
                ]}
                renderChart={(h) => (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={(d.rankingObras ?? []).map((o: any) => ({ ...o, obraCurta: truncate(o.obraNome, 24) }))} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis dataKey="obraCurta" type="category" tick={{ fontSize: 11 }} width={170} />
                      <Tooltip labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as any).obraNome : "")} />
                      <Legend />
                      <Bar dataKey="qtd" name="Acidentes" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="dias" name="Dias Perdidos" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              />

              {/* Ações corretivas */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KPI icon={Activity} label="Ações Corretivas (total)" value={fmtNum(d.acoesCorretivas?.total ?? 0)} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
                <KPI icon={ShieldAlert} label="Ações em Aberto" value={fmtNum(d.acoesCorretivas?.abertas ?? 0)} color="text-amber-600" bg="bg-amber-50" border="border-amber-200" />
                <KPI icon={AlertTriangle} label="Ações Vencidas" value={fmtNum(d.acoesCorretivas?.vencidas ?? 0)} color="text-red-600" bg="bg-red-50" border="border-red-200" />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Ações Corretivas Vencidas</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Funcionário</th>
                          <th className="px-3 py-2 text-left">Obra</th>
                          <th className="px-3 py-2 text-left">Ação</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-right">Prazo</th>
                          <th className="px-3 py-2 text-right">Dias Vencido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(d.acoesCorretivas?.listaVencidas ?? []).length === 0 && (<tr><td colSpan={6} className="p-4 text-center text-emerald-600">Nenhuma ação vencida 🎉</td></tr>)}
                        {(d.acoesCorretivas?.listaVencidas ?? []).map((a: any) => {
                          const dv = Math.floor((new Date().getTime() - new Date(a.prazo + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <tr key={a.id} className="hover:bg-red-50">
                              <td className="px-3 py-2">{a.employeeNome || "—"}</td>
                              <td className="px-3 py-2 text-gray-700">{a.obraNome || "—"}</td>
                              <td className="px-3 py-2 text-gray-700 max-w-md truncate">{a.acao}</td>
                              <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{a.status}</Badge></td>
                              <td className="px-3 py-2 text-right text-gray-700">{a.prazo}</td>
                              <td className="px-3 py-2 text-right font-bold text-red-600">{dv} dia(s)</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <EmployeeDetailDialog
          open={selectedEmployeeId !== null}
          onOpenChange={(v) => { if (!v) setSelectedEmployeeId(null); }}
          employeeId={selectedEmployeeId}
          dataInicio={dataInicio}
          dataFim={dataFim}
        />

        {/* Memória de cálculo do Custo Estimado de Afastamento */}
        <Dialog open={showCustoDetalhe} onOpenChange={setShowCustoDetalhe}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] p-0 overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border"
          >
            <DialogHeader className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
                Custo Estimado de Afastamento — Memória de Cálculo
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1">
                Período: {dataInicio.split("-").reverse().join("/")} a {dataFim.split("-").reverse().join("/")} ·
                Fórmula por colaborador: <strong>(salário-base ÷ 30) × dias afastados</strong>.
                Não inclui encargos (INSS patronal, FGTS, provisões).
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-4">
              {(() => {
                const det: any[] = (d?.custoEstimadoAfastamento as any)?.detalhe ?? [];
                const totAt = d?.custoEstimadoAfastamento?.atestados ?? 0;
                const totAc = d?.custoEstimadoAfastamento?.acidentes ?? 0;
                const tot = d?.custoEstimadoAfastamento?.total ?? 0;
                const totDiasAt = det.reduce((s, r) => s + (r.diasAtestado || 0), 0);
                const totDiasAc = det.reduce((s, r) => s + (r.diasAcidente || 0), 0);
                if (det.length === 0) {
                  return <p className="text-sm text-gray-500 py-12 text-center">Nenhum afastamento com salário-base cadastrado no período.</p>;
                }
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                      <Card className="bg-gray-50 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-gray-500">Colaboradores afetados</p>
                        <p className="text-xl font-bold text-gray-800 mt-1">{det.length}</p>
                      </CardContent></Card>
                      <Card className="bg-blue-50 border-blue-200 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-blue-700">Custo Atestados</p>
                        <p className="text-xl font-bold text-blue-800 mt-1">R$ {fmtNum(totAt, 2)}</p>
                        <p className="text-[10px] text-blue-700 mt-0.5">{totDiasAt} dia(s)</p>
                      </CardContent></Card>
                      <Card className="bg-red-50 border-red-200 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-red-700">Custo Acidentes</p>
                        <p className="text-xl font-bold text-red-800 mt-1">R$ {fmtNum(totAc, 2)}</p>
                        <p className="text-[10px] text-red-700 mt-0.5">{totDiasAc} dia(s)</p>
                      </CardContent></Card>
                      <Card className="bg-green-50 border-green-200 border"><CardContent className="p-3">
                        <p className="text-[11px] uppercase text-green-700">Custo Total</p>
                        <p className="text-xl font-bold text-green-800 mt-1">R$ {fmtNum(tot, 2)}</p>
                        <p className="text-[10px] text-green-700 mt-0.5">{totDiasAt + totDiasAc} dia(s)</p>
                      </CardContent></Card>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 text-gray-700 text-xs uppercase">
                          <tr>
                            <th className="text-left p-2 w-10">#</th>
                            <th className="text-left p-2">Colaborador</th>
                            <th className="text-left p-2">Função</th>
                            <th className="text-right p-2">Salário-base</th>
                            <th className="text-right p-2">Valor/dia</th>
                            <th className="text-right p-2 text-blue-700">Dias atest.</th>
                            <th className="text-right p-2 text-red-700">Dias acid.</th>
                            <th className="text-right p-2 text-blue-700">Custo atest.</th>
                            <th className="text-right p-2 text-red-700">Custo acid.</th>
                            <th className="text-right p-2 text-green-700">Custo total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.map((r: any, i: number) => (
                            <tr
                              key={r.employeeId}
                              className="border-t hover:bg-gray-50 cursor-pointer"
                              onClick={() => { setShowCustoDetalhe(false); setSelectedEmployeeId(r.employeeId); }}
                              title="Ver detalhamento do colaborador"
                            >
                              <td className="p-2 text-gray-500">{i + 1}</td>
                              <td className="p-2">
                                <div className="font-medium text-gray-800">{r.nome}</div>
                                <div className="text-[10px] text-gray-500">#{r.codigoInterno || r.matricula || r.employeeId}</div>
                              </td>
                              <td className="p-2 text-gray-600 text-xs">{r.funcao || "—"}</td>
                              <td className="p-2 text-right tabular-nums">R$ {fmtNum(r.salarioBase, 2)}</td>
                              <td className="p-2 text-right tabular-nums text-gray-600">R$ {fmtNum(r.valorDia, 2)}</td>
                              <td className="p-2 text-right tabular-nums text-blue-700">{r.diasAtestado || 0}</td>
                              <td className="p-2 text-right tabular-nums text-red-700">{r.diasAcidente || 0}</td>
                              <td className="p-2 text-right tabular-nums text-blue-700">R$ {fmtNum(r.custoAtestado, 2)}</td>
                              <td className="p-2 text-right tabular-nums text-red-700">R$ {fmtNum(r.custoAcidente, 2)}</td>
                              <td className="p-2 text-right tabular-nums font-semibold text-green-700">R$ {fmtNum(r.custoTotal, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold text-sm">
                          <tr className="border-t-2">
                            <td colSpan={5} className="p-2 text-right text-gray-700">TOTAIS</td>
                            <td className="p-2 text-right tabular-nums text-blue-700">{totDiasAt}</td>
                            <td className="p-2 text-right tabular-nums text-red-700">{totDiasAc}</td>
                            <td className="p-2 text-right tabular-nums text-blue-700">R$ {fmtNum(totAt, 2)}</td>
                            <td className="p-2 text-right tabular-nums text-red-700">R$ {fmtNum(totAc, 2)}</td>
                            <td className="p-2 text-right tabular-nums text-green-800">R$ {fmtNum(tot, 2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <p className="text-[11px] text-gray-500 mt-3">
                      Dica: clique em uma linha para abrir o detalhamento completo do colaborador (atestados, acidentes e documentos).
                    </p>
                  </>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
