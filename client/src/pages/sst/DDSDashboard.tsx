import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import {
  ShieldCheck, Users, FileSignature, Calendar, BookOpen, Activity,
  TrendingUp, AlertTriangle, ClipboardCheck, UserCheck, Clock, ArrowLeft,
  Building2, GraduationCap, BarChart3, Download, Search, X as XIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

const COLORS = ["#0891b2", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];
const CAT_COLORS: Record<string, string> = {
  NR: "#0891b2",
  CAMPANHA: "#f59e0b",
  VACINACAO: "#10b981",
  LIVRE: "#8b5cf6",
  SEM_TEMA: "#94a3b8",
};
const CAT_LABELS: Record<string, string> = {
  NR: "Normas Regulamentadoras",
  CAMPANHA: "Campanhas Governamentais",
  VACINACAO: "Vacinação PNI",
  LIVRE: "Tema Livre",
  SEM_TEMA: "Sem tema vinculado",
};
const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};
const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtNum(v: number) {
  return (v ?? 0).toLocaleString("pt-BR");
}
function mesLabel(ym: string) {
  if (!ym) return "";
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
function fmtDataBR(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function KPI({
  icon: Icon, label, value, sub, color = "text-cyan-700", bg = "bg-cyan-50", border = "border-cyan-200",
}: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: string; bg?: string; border?: string;
}) {
  return (
    <Card className={`${bg} ${border} border`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">{label}</p>
            <p className={`text-2xl font-bold ${color} mt-1`}>{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{sub}</p>}
          </div>
          <Icon className={`${color} h-7 w-7 flex-shrink-0`} />
        </div>
      </CardContent>
    </Card>
  );
}

type SessaoDet = {
  id: number;
  data: string;
  obraNome: string;
  tituloTema: string;
  categoria: string;
  instrutor: string;
  status: string;
  mes: string;
  dow: number;
  totalParticipantes: number;
  presentes: number;
  assinados: number;
};

export default function DDSDashboard() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const [, navigate] = useLocation();

  const [dataInicio, setDataInicio] = useState(defaultIni());
  const [dataFim, setDataFim] = useState(defaultFim());

  // Rev. 1872 — drill-down state (regra de ouro: modal fullscreen)
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState("");
  const [drillRows, setDrillRows] = useState<SessaoDet[]>([]);
  const [drillSearch, setDrillSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = trpc.dds.dashboardKpis.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: companyId > 0 },
  );

  const k = data?.kpis;
  const sessoesDetalhe: SessaoDet[] = (data as any)?.sessoesDetalhe ?? [];

  const porCategoriaChart = useMemo(() => {
    if (!data?.porCategoria) return [];
    return data.porCategoria.map((r: any) => ({
      name: CAT_LABELS[r.categoria] || r.categoria,
      value: r.sessoes,
      categoria: r.categoria,
    }));
  }, [data?.porCategoria]);

  // Rev. 1872 — abre drill com lista filtrada
  function openDrill(title: string, filterFn: (s: SessaoDet) => boolean) {
    const rows = sessoesDetalhe.filter(filterFn);
    setDrillTitle(title);
    setDrillRows(rows);
    setDrillSearch("");
    setDrillOpen(true);
  }

  // recharts: payload do click vem em diferentes shapes (Pie passa direto o item; Bar/Line passa o data point)
  function onPieClick(p: any) {
    const cat = p?.categoria || p?.payload?.categoria;
    if (!cat) return;
    openDrill(`Sessões — ${CAT_LABELS[cat] || cat}`, (s) => s.categoria === cat);
  }
  function onLineMonthClick(_e: any, payload: any) {
    const ym = payload?.activeLabel ? null : payload?.mes; // ResponsiveContainer onClick → activeLabel
    const mes = payload?.activePayload?.[0]?.payload?.mes ?? payload?.mes;
    if (!mes) return;
    openDrill(`Sessões em ${mesLabel(mes)}`, (s) => s.mes === mes);
  }
  function onChartClick(payload: any, builder: (clicked: any) => { title: string; fn: (s: SessaoDet) => boolean } | null) {
    const item = payload?.activePayload?.[0]?.payload ?? payload?.payload ?? payload;
    if (!item) return;
    const built = builder(item);
    if (!built) return;
    openDrill(built.title, built.fn);
  }

  function exportDrillCSV() {
    if (drillRows.length === 0) return;
    const head = ["ID", "Data", "Obra", "Tema", "Categoria", "Instrutor", "Status", "Participantes", "Presentes", "Assinados"];
    const lines = [head.join(";")];
    drillRows.forEach((s) => {
      lines.push([
        s.id, fmtDataBR(s.data), s.obraNome, s.tituloTema,
        CAT_LABELS[s.categoria] || s.categoria,
        s.instrutor, STATUS_LABELS[s.status] || s.status,
        s.totalParticipantes, s.presentes, s.assinados,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    });
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dds-drill-${drillTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const drillFiltered = useMemo(() => {
    const q = drillSearch.trim().toLowerCase();
    if (!q) return drillRows;
    return drillRows.filter((s) =>
      (s.obraNome + " " + s.tituloTema + " " + s.instrutor).toLowerCase().includes(q),
    );
  }, [drillRows, drillSearch]);

  if (companyId <= 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-center text-gray-500">
              Selecione uma empresa para visualizar o dashboard de DDS.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Button size="sm" variant="ghost" onClick={() => navigate("/sst/dds")} className="h-7 px-2 text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar ao DDS
              </Button>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-cyan-600" />
              Dashboard de DDS
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Diálogo Diário de Segurança — KPIs, cobertura, frequência e qualidade dos registros.
              <span className="hidden md:inline"> Clique em qualquer barra/fatia para detalhar.</span>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] text-gray-500">Início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-8 text-xs w-[140px]" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-8 text-xs w-[140px]" />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs">
              {isFetching ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="p-8 text-center text-gray-500">Carregando KPIs...</CardContent></Card>
        ) : !data ? (
          <Card><CardContent className="p-8 text-center text-gray-500">Sem dados no período.</CardContent></Card>
        ) : (
          <>
            {/* Linha 1 — Volume */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI icon={ClipboardCheck} label="Sessões no período" value={fmtNum(k!.totalSessoes)}
                sub={`${k!.sessoesFinalizadas} finalizadas · ${k!.sessoesAbertas} abertas · ${k!.sessoesCanceladas} canceladas`} />
              <KPI icon={Activity} label="Últimos 30 dias" value={fmtNum(k!.sessoes30d)}
                sub="Sessões realizadas no último mês" color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
              <KPI icon={BookOpen} label="Temas ativos" value={fmtNum(k!.totalTemasAtivos)}
                sub="Biblioteca disponível p/ aplicação" color="text-violet-700" bg="bg-violet-50" border="border-violet-200" />
              <KPI icon={Users} label="Funcionários atendidos" value={fmtNum(k!.funcionariosAtendidos)}
                sub={`de ${fmtNum(k!.totalFuncAtivos)} ativos · ${k!.coberturaPct}% cobertura`}
                color="text-amber-700" bg="bg-amber-50" border="border-amber-200" />
            </div>

            {/* Linha 2 — Qualidade */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI icon={UserCheck} label="Taxa de presença" value={`${k!.taxaPresenca}%`}
                sub={`${fmtNum(k!.totalPresentes)} presentes / ${fmtNum(k!.totalParticipantes)} convocados`}
                color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
              <KPI icon={FileSignature} label="Taxa de assinatura" value={`${k!.taxaAssinatura}%`}
                sub={`${fmtNum(k!.totalAssinados)} assinados / ${fmtNum(k!.totalPresentes)} presentes`}
                color="text-cyan-700" bg="bg-cyan-50" border="border-cyan-200" />
              <KPI icon={AlertTriangle} label="Sem DDS no período" value={fmtNum(k!.funcionariosSemDDS)}
                sub="Funcionários ativos sem nenhuma sessão"
                color="text-rose-700" bg="bg-rose-50" border="border-rose-200" />
              <KPI icon={Clock} label="Sessões abertas" value={fmtNum(k!.sessoesAbertas)}
                sub="Pendentes de finalização (assinaturas)"
                color="text-orange-700" bg="bg-orange-50" border="border-orange-200" />
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-600" /> Sessões por mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.sessoesPorMes.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem sessões no período</div>
                  ) : (
                    <div className="w-full h-[260px] min-h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={data.sessoesPorMes.map((r: any) => ({ ...r, mesLabel: mesLabel(r.mes) }))}
                          onClick={(e: any) => onLineMonthClick(null, e)}
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="sessoes" name="Sessões" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="participantes" name="Presentes" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-violet-600" /> Sessões por categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {porCategoriaChart.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem sessões no período</div>
                  ) : (
                    <div className="w-full h-[260px] min-h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={porCategoriaChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                            label={(e: any) => `${e.value}`} labelLine={false}
                            onClick={(p: any) => onPieClick(p)}
                            style={{ cursor: "pointer" }}>
                            {porCategoriaChart.map((entry: any, i: number) => (
                              <Cell key={i} fill={CAT_COLORS[entry.categoria] || COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-600" /> Top obras (sessões)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.porObra.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem sessões no período</div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(220, data.porObra.length * 28) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.porObra}
                          layout="vertical"
                          margin={{ left: 8, right: 16 }}
                          onClick={(e: any) => onChartClick(e, (it) => it?.obra ? ({ title: `Sessões em ${it.obra}`, fn: (s) => s.obraNome === it.obra }) : null)}
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="obra" tick={{ fontSize: 10 }} width={150} />
                          <Tooltip />
                          <Bar dataKey="sessoes" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-cyan-600" /> Top 10 temas mais aplicados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topTemas.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem sessões no período</div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(220, data.topTemas.length * 28) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.topTemas}
                          layout="vertical"
                          margin={{ left: 8, right: 16 }}
                          onClick={(e: any) => onChartClick(e, (it) => it?.tema ? ({ title: `Sessões do tema "${it.tema}"`, fn: (s) => s.tituloTema === it.tema }) : null)}
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="tema" tick={{ fontSize: 10 }} width={180}
                            tickFormatter={(s) => (s.length > 25 ? s.slice(0, 24) + "…" : s)} />
                          <Tooltip />
                          <Bar dataKey="sessoes" fill="#0891b2" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts row 3 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-emerald-600" /> Top instrutores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.topInstrutores.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-gray-400">Sem sessões no período</div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(220, data.topInstrutores.length * 28) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.topInstrutores}
                          layout="vertical"
                          margin={{ left: 8, right: 16 }}
                          onClick={(e: any) => onChartClick(e, (it) => it?.instrutor ? ({ title: `Sessões do instrutor ${it.instrutor}`, fn: (s) => s.instrutor === it.instrutor }) : null)}
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="instrutor" tick={{ fontSize: 10 }} width={140}
                            tickFormatter={(s) => (s.length > 20 ? s.slice(0, 19) + "…" : s)} />
                          <Tooltip />
                          <Bar dataKey="sessoes" fill="#10b981" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-violet-600" /> Frequência por dia da semana
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-[260px] min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.porDiaSemana}
                        onClick={(e: any) => onChartClick(e, (it) => {
                          if (!it?.dia) return null;
                          const dow = DOW_LABELS.indexOf(it.dia);
                          if (dow < 0) return null;
                          return { title: `Sessões — ${it.dia}`, fn: (s) => s.dow === dow };
                        })}
                        style={{ cursor: "pointer" }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="sessoes" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Biblioteca breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-600" /> Biblioteca de temas (ativos)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.temasPorCategoria.length === 0 ? (
                    <p className="text-xs text-gray-400">Nenhum tema cadastrado. Use a tela DDS para semear a biblioteca.</p>
                  ) : data.temasPorCategoria.map((r: any) => (
                    <Badge key={r.categoria} variant="outline" className="text-xs px-2 py-1"
                      style={{ borderColor: CAT_COLORS[r.categoria] || "#cbd5e1", color: CAT_COLORS[r.categoria] || "#475569" }}>
                      {CAT_LABELS[r.categoria] || r.categoria}: <strong className="ml-1">{r.total}</strong>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Funcionários sem DDS */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Funcionários sem DDS no período
                  <Badge variant="outline" className="ml-2 text-[10px] border-rose-300 text-rose-700">
                    {fmtNum(k!.funcionariosSemDDS)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.semDDS.length === 0 ? (
                  <p className="text-xs text-emerald-600">Todos os funcionários ativos receberam ao menos 1 DDS no período. 🎯</p>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Mostrando {data.semDDS.length} de {fmtNum(k!.funcionariosSemDDS)} — gap de cobertura prioritário.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto">
                      {data.semDDS.map((f: any) => (
                        <div key={f.id} className="text-xs p-2 rounded border border-rose-100 bg-rose-50/50">
                          <div className="font-medium text-gray-800 truncate">{f.nome}</div>
                          {f.funcao && <div className="text-[10px] text-gray-500 truncate">{f.funcao}</div>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <p className="text-[10px] text-gray-400 text-center pt-2">
              Período: {data.periodo.dataInicio.split("-").reverse().join("/")} a {data.periodo.dataFim.split("-").reverse().join("/")}
            </p>
          </>
        )}
      </div>

      {/* Rev. 1872 — Drill-down fullscreen (regra de ouro) */}
      <Dialog open={drillOpen} onOpenChange={setDrillOpen}>
        <DialogContent
          resizable={false}
          className="w-screen sm:w-[98vw] sm:max-w-[1600px] h-[100dvh] sm:h-[95vh] max-h-[100dvh] sm:max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none sm:rounded-lg"
        >
          <DialogHeader className="px-4 sm:px-6 py-3 border-b bg-gradient-to-r from-cyan-50 to-violet-50 sticky top-0 z-10">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 min-w-0">
                <BarChart3 className="h-5 w-5 text-cyan-600 flex-shrink-0" />
                <span className="truncate">{drillTitle}</span>
                <Badge variant="outline" className="ml-1 flex-shrink-0">{drillRows.length}</Badge>
              </DialogTitle>
              <Button size="sm" variant="ghost" onClick={() => setDrillOpen(false)} className="h-8 w-8 p-0 flex-shrink-0">
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={drillSearch}
                  onChange={(e) => setDrillSearch(e.target.value)}
                  placeholder="Buscar obra, tema ou instrutor..."
                  className="pl-7 h-8 text-xs"
                />
              </div>
              <Button size="sm" variant="outline" onClick={exportDrillCSV} disabled={drillRows.length === 0} className="h-8 text-xs">
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-4 sm:px-6 py-3">
            {drillFiltered.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10">Nenhuma sessão.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white border-b">
                    <tr className="text-left text-gray-600">
                      <th className="py-2 px-2">Data</th>
                      <th className="py-2 px-2">Obra</th>
                      <th className="py-2 px-2">Tema</th>
                      <th className="py-2 px-2 hidden md:table-cell">Categoria</th>
                      <th className="py-2 px-2 hidden md:table-cell">Instrutor</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2 text-right">Conv.</th>
                      <th className="py-2 px-2 text-right">Pres.</th>
                      <th className="py-2 px-2 text-right">Assin.</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillFiltered.map((s) => (
                      <tr key={s.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-2 whitespace-nowrap">{fmtDataBR(s.data)}</td>
                        <td className="py-2 px-2 max-w-[200px] truncate" title={s.obraNome}>{s.obraNome}</td>
                        <td className="py-2 px-2 max-w-[280px] truncate" title={s.tituloTema}>{s.tituloTema}</td>
                        <td className="py-2 px-2 hidden md:table-cell">
                          <Badge variant="outline" className="text-[10px]"
                            style={{ borderColor: CAT_COLORS[s.categoria] || "#cbd5e1", color: CAT_COLORS[s.categoria] || "#475569" }}>
                            {CAT_LABELS[s.categoria] || s.categoria}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 hidden md:table-cell max-w-[160px] truncate" title={s.instrutor}>{s.instrutor}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={
                            s.status === "finalizada" ? "text-[10px] border-emerald-300 text-emerald-700" :
                            s.status === "cancelada" ? "text-[10px] border-gray-300 text-gray-600" :
                            "text-[10px] border-orange-300 text-orange-700"
                          }>
                            {STATUS_LABELS[s.status] || s.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right">{s.totalParticipantes}</td>
                        <td className="py-2 px-2 text-right">{s.presentes}</td>
                        <td className="py-2 px-2 text-right">{s.assinados}</td>
                        <td className="py-2 px-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => { setDrillOpen(false); navigate(`/sst/dds?sessaoId=${s.id}`); }}
                          >
                            Abrir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="px-4 sm:px-6 py-2 border-t bg-gray-50 text-[10px] text-gray-500 flex justify-between">
            <span>{drillFiltered.length} de {drillRows.length} sessão(ões)</span>
            <span>Clique em "Abrir" para ir à sessão no DDS</span>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
