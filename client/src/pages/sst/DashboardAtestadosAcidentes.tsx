import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  HeartPulse, AlertTriangle, FileWarning, Activity, Users, Clock,
  TrendingUp, Stethoscope, ShieldAlert, FileCheck2, Calendar, RefreshCw,
  BarChart3, ArrowDown, ArrowUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area, AreaChart,
} from "recharts";

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
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Evolução Mensal — Atestados x Acidentes</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={evolucaoData}>
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
                </CardContent>
              </Card>

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
                <Card>
                  <CardHeader><CardTitle className="text-base">Atestados por Tipo</CardTitle></CardHeader>
                  <CardContent>
                    {d.atestados.porTipo.length === 0 ? <p className="text-sm text-gray-500">Sem dados.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={d.atestados.porTipo} dataKey="quantidade" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.tipo} (${e.quantidade})`}>
                            {d.atestados.porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Top 10 CIDs</CardTitle></CardHeader>
                  <CardContent>
                    {d.atestados.topCIDs.length === 0 ? <p className="text-sm text-gray-500">Nenhum CID registrado.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={d.atestados.topCIDs} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="cid" type="category" tick={{ fontSize: 11 }} width={70} />
                          <Tooltip />
                          <Bar dataKey="quantidade" name="Qtd" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 Motivos</CardTitle></CardHeader>
                <CardContent>
                  {d.atestados.porMotivo.length === 0 ? <p className="text-sm text-gray-500">Sem motivos registrados.</p> : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={d.atestados.porMotivo}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="motivo" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="quantidade" name="Qtd" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="dias" name="Dias" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

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
                            <td className="px-3 py-2 font-medium">{f.nome}{f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null}</td>
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
                <Card>
                  <CardHeader><CardTitle className="text-base">Por Gravidade</CardTitle></CardHeader>
                  <CardContent>
                    {d.acidentes.porGravidade.length === 0 ? <p className="text-sm text-gray-500">Sem dados.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={d.acidentes.porGravidade} dataKey="quantidade" nameKey="gravidade" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.gravidade} (${e.quantidade})`}>
                            {d.acidentes.porGravidade.map((g, i) => <Cell key={i} fill={GRAV_COLORS[g.gravidade] || COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Por Tipo de Acidente</CardTitle></CardHeader>
                  <CardContent>
                    {d.acidentes.porTipo.length === 0 ? <p className="text-sm text-gray-500">Sem dados.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={d.acidentes.porTipo} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="tipo" type="category" tick={{ fontSize: 11 }} width={120} />
                          <Tooltip />
                          <Bar dataKey="quantidade" fill="#ef4444" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Top Partes do Corpo Atingidas</CardTitle></CardHeader>
                  <CardContent>
                    {d.acidentes.porParteCorpo.length === 0 ? <p className="text-sm text-gray-500">Sem dados.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={d.acidentes.porParteCorpo} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="parte" type="category" tick={{ fontSize: 11 }} width={120} />
                          <Tooltip />
                          <Bar dataKey="quantidade" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Top Locais</CardTitle></CardHeader>
                  <CardContent>
                    {d.acidentes.porLocal.length === 0 ? <p className="text-sm text-gray-500">Sem dados.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={d.acidentes.porLocal} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="local" type="category" tick={{ fontSize: 11 }} width={120} />
                          <Tooltip />
                          <Bar dataKey="quantidade" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
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
                            <td className="px-3 py-2 font-medium">{f.nome}{f.matricula ? <span className="text-xs text-gray-400 ml-1">#{f.matricula}</span> : null}</td>
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
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
