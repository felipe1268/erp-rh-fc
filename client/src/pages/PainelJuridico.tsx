import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  Scale, Gavel, AlertTriangle, ChevronRight, BarChart3,
  Calendar, Activity, Clock, DollarSign, FileText, TrendingUp,
  ShieldAlert, ExternalLink, Eye, ArrowUpRight, ArrowDownRight,
  Loader2, Users, Briefcase, Target, PieChart, Zap, Hash,
  Bell, BellRing, CheckCheck, Settings2, RefreshCw, Trash2
} from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/dateUtils";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { CHART_PALETTE, SEMANTIC_COLORS } from "@/lib/chartColors";

// Lazy load Chart.js
let ChartJS: any = null;
const loadChartJS = async () => {
  if (ChartJS) return ChartJS;
  const mod = await import("chart.js/auto");
  ChartJS = mod.default || mod.Chart;
  return ChartJS;
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

const STATUS_LABELS: Record<string, string> = {
  em_andamento: "Em Andamento",
  aguardando_audiencia: "Aguardando Audiência",
  aguardando_pericia: "Aguardando Perícia",
  acordo: "Acordo",
  sentenca: "Sentença",
  recurso: "Recurso",
  execucao: "Execução",
  arquivado: "Arquivado",
  encerrado: "Encerrado",
};

const RISCO_CONFIG: Record<string, { label: string; color: string; bg: string; text: string; dot: string }> = {
  critico: { label: "Crítico", color: SEMANTIC_COLORS.riscoAlto, bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  alto: { label: "Alto", color: "#F97316", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  medio: { label: "Médio", color: SEMANTIC_COLORS.riscoMedio, bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  baixo: { label: "Baixo", color: SEMANTIC_COLORS.riscoBaixo, bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
};

const FASE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  instrucao: "Instrução",
  decisoria: "Decisória (Sentença)",
  recursal: "Recursal (Opcional)",
  execucao: "Execução (Cumprimento de Sentença)",
  encerrado: "Encerrado",
};

// Mini chart component for inline use
function MiniDoughnut({ data, colors, size = 80 }: { data: number[]; colors: string[]; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    loadChartJS().then((CJS) => {
      if (!mounted || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new CJS(canvasRef.current, {
        type: "doughnut",
        data: {
          datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
        },
        options: {
          responsive: false,
          cutout: "65%",
          plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { display: false } },
        },
      });
    });
    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [data, colors, size]);

  return <canvas ref={canvasRef} width={size} height={size} />;
}

// Bar chart component for inline use
function MiniBarChart({ labels, data, color, height = 160 }: { labels: string[]; data: number[]; color: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    loadChartJS().then((CJS) => {
      if (!mounted || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new CJS(canvasRef.current, {
        type: "bar",
        data: {
          labels,
          datasets: [{ data, backgroundColor: color, borderRadius: 4, barThickness: 18 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true }, datalabels: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { font: { size: 10 }, stepSize: 1 }, grid: { display: false } },
            x: { ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
          },
        },
      });
    });
    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [labels, data, color, height]);

  return (
    <div style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// Horizontal bar chart for assuntos
function MiniHBarChart({ labels, data, color, height = 200 }: { labels: string[]; data: number[]; color: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    loadChartJS().then((CJS) => {
      if (!mounted || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new CJS(canvasRef.current, {
        type: "bar",
        data: {
          labels,
          datasets: [{ data, backgroundColor: color, borderRadius: 4, barThickness: 16 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: { legend: { display: false }, tooltip: { enabled: true }, datalabels: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { font: { size: 10 }, stepSize: 1 }, grid: { display: false } },
            y: { ticks: { font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    });
    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [labels, data, color, height]);

  return (
    <div style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function PainelJuridico() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : (!!companyId && companyId > 0);
  const [selectedProcesso, setSelectedProcesso] = useState<any>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configInterval, setConfigInterval] = useState(60);
  const [configActive, setConfigActive] = useState(true);

  // DataJud Auto-Check alerts
  const { data: alertsData, refetch: refetchAlerts } = trpc.datajudAutoCheck.listarAlertas.useQuery(
    { companyId: queryCompanyId, apenasNaoLidos: false, limit: 50, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const { data: alertCount } = trpc.datajudAutoCheck.contarNaoLidos.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany, refetchInterval: 60000 }
  );
  const { data: autoCheckConfig } = trpc.datajudAutoCheck.getConfig.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const saveConfigMut = trpc.datajudAutoCheck.saveConfig.useMutation({
    onSuccess: () => { refetchAlerts(); }
  });
  const marcarLidoMut = trpc.datajudAutoCheck.marcarLido.useMutation({
    onSuccess: () => { refetchAlerts(); }
  });
  const marcarTodosLidosMut = trpc.datajudAutoCheck.marcarTodosLidos.useMutation({
    onSuccess: () => { refetchAlerts(); }
  });
  const excluirAlertaMut = trpc.datajudAutoCheck.excluirAlerta.useMutation({
    onSuccess: () => { refetchAlerts(); }
  });
  const executarVerifMut = trpc.datajudAutoCheck.executarVerificacao.useMutation({
    onSuccess: () => { refetchAlerts(); }
  });

  // Use the full dashboard data (same as DashJuridico) for rich info
  const { data: dashData, isLoading: dashLoading } = trpc.dashboards.juridico.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  // Also get the processos list for the table
  const { data: processos, isLoading: processosLoading } = trpc.processos.listar.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  // Get audit logs for activity
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId: queryCompanyId, limit: 5, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const isLoading = dashLoading || processosLoading;

  // Derived data
  const processosAtivos = useMemo(() => {
    if (!processos) return [];
    return processos.filter((p: any) => !["encerrado", "arquivado"].includes(p.status));
  }, [processos]);

  const processosRecentes = useMemo(() => {
    if (!processos) return [];
    return [...processos].sort((a: any, b: any) => {
      const da = a.updatedAt || a.createdAt || "";
      const db2 = b.updatedAt || b.createdAt || "";
      return db2.localeCompare(da);
    }).slice(0, 5);
  }, [processos]);

  const alertDetails = useMemo(() => {
    if (!dashData || !processos) return { total: 0, riscoAlto: [] as any[], audiencias: [] as any[] };
    const riscoAltoList = processos.filter((p: any) => p.risco === "alto" || p.risco === "critico");
    const audiencias = dashData.proximasAudiencias || [];
    return { total: riscoAltoList.length + audiencias.length, riscoAlto: riscoAltoList, audiencias };
  }, [dashData, processos]);
  const datajudNaoLidos = alertCount?.count || 0;
  const totalAlertas = alertDetails.total + datajudNaoLidos;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center shadow-sm">
                <Scale className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Painel Jurídico</h1>
                <p className="text-muted-foreground text-xs">Gestão Jurídica Trabalhista</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowAlertModal(true)} className={`flex items-center gap-1.5 ${totalAlertas > 0 ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} border rounded-lg px-3 py-1.5 transition-colors cursor-pointer`}>
              {totalAlertas > 0 ? <BellRing className="h-4 w-4 text-red-600 animate-pulse" /> : <Bell className="h-4 w-4 text-gray-500" />}
              <span className={`text-xs font-semibold ${totalAlertas > 0 ? 'text-red-700' : 'text-gray-600'}`}>{totalAlertas > 0 ? `${totalAlertas} alerta${totalAlertas !== 1 ? 's' : ''}` : 'Alertas'}</span>
            </button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => navigate("/processos-trabalhistas")}>
              <Gavel className="h-3.5 w-3.5" /> Processos
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => navigate("/dashboards/juridico")}>
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </Button>
          </div>
        </div>

        {!hasValidCompany ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Scale className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel jurídico.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-20" /></Card>
              ))}
            </div>
          </div>
        ) : !dashData ? (
          <div className="text-center py-16 text-muted-foreground">Nenhum dado disponível.</div>
        ) : (
          <>
            {/* === ROW 1: KPIs Principais === */}
            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visão Geral</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <KpiCard
                  title="Total de Processos"
                  value={fmtNum(dashData.resumo.totalProcessos)}
                  icon={Gavel}
                  color="blue"
                  onClick={() => navigate("/processos-trabalhistas")}
                />
                <KpiCard
                  title="Processos Ativos"
                  value={fmtNum(dashData.resumo.processosAtivos)}
                  icon={AlertTriangle}
                  color="amber"
                  onClick={() => navigate("/processos-trabalhistas")}
                />
                <KpiCard
                  title="Encerrados"
                  value={fmtNum(dashData.resumo.processosEncerrados)}
                  icon={FileText}
                  color="green"
                  onClick={() => navigate("/processos-trabalhistas")}
                />
                <KpiCard
                  title="Valor em Risco"
                  value={fmtBRL(dashData.resumo.valorEmRisco)}
                  icon={ShieldAlert}
                  color="red"
                  isMonetary
                />
              </div>
            </div>

            {/* === ROW 2: KPIs Financeiros === */}
            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Valores Financeiros</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <KpiCard
                  title="Valor da Causa"
                  value={fmtBRL(dashData.resumo.totalValorCausa)}
                  icon={DollarSign}
                  color="red"
                  isMonetary
                />
                <KpiCard
                  title="Condenação"
                  value={fmtBRL(dashData.resumo.totalValorCondenacao)}
                  icon={Scale}
                  color="purple"
                  isMonetary
                />
                <KpiCard
                  title="Acordos"
                  value={fmtBRL(dashData.resumo.totalValorAcordo)}
                  icon={TrendingUp}
                  color="teal"
                  isMonetary
                />
                <KpiCard
                  title="Valor Pago"
                  value={fmtBRL(dashData.resumo.totalValorPago)}
                  icon={DollarSign}
                  color="slate"
                  isMonetary
                />
              </div>
            </div>

            {/* === ROW 3: Risco + Audiências + Status === */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Processos por Risco */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-amber-500" />
                    Nível de Risco
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex items-center gap-4">
                    <div className="shrink-0">
                      <MiniDoughnut
                        data={dashData.porRisco.map((r: any) => r.value)}
                        colors={dashData.porRisco.map((r: any) => RISCO_CONFIG[r.label]?.color || SEMANTIC_COLORS.neutro)}
                        size={72}
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {(["critico", "alto", "medio", "baixo"] as const).map(risco => {
                        const item = dashData.porRisco.find((r: any) => r.label === risco);
                        const count = item?.value ?? 0;
                        const cfg = RISCO_CONFIG[risco];
                        return (
                          <div key={risco} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                              <span className="text-xs text-muted-foreground">{cfg.label}</span>
                            </div>
                            <span className={`text-sm font-bold ${cfg.text}`}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Próximas Audiências */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-blue-500" />
                      Próximas Audiências
                      {dashData.proximasAudiencias.length > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0">{dashData.proximasAudiencias.length}</Badge>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {dashData.proximasAudiencias.length === 0 ? (
                    <div className="flex flex-col items-center py-4">
                      <Calendar className="h-8 w-8 text-green-400 mb-1.5" />
                      <p className="text-xs font-medium text-green-600">Nenhuma audiência agendada</p>
                      <p className="text-[10px] text-muted-foreground">Tudo em dia!</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                      {dashData.proximasAudiencias.slice(0, 5).map((a: any, i: number) => {
                        const dataAud = a.data ? new Date(a.data + "T00:00:00") : null;
                        const hoje = new Date();
                        const dias = dataAud ? Math.ceil((dataAud.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        const urgente = dias !== null && dias <= 7;
                        return (
                          <div key={i} className={`px-2.5 py-1.5 rounded-lg border text-xs ${urgente ? "bg-red-50 border-red-200" : "bg-muted/30 border-border/50"}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold truncate flex-1">{a.reclamante}</span>
                              <span className={`text-[10px] font-mono shrink-0 ${urgente ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                                {a.data ? formatDate(a.data) : "—"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-mono">{a.numero}</span>
                              <Badge className={`text-[9px] px-1 py-0 ${a.risco === "critico" || a.risco === "alto" ? "bg-red-100 text-red-700" : a.risco === "medio" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                {a.risco}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Processos por Status */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <PieChart className="h-3.5 w-3.5 text-purple-500" />
                    Por Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex items-center gap-4">
                    <div className="shrink-0">
                      <MiniDoughnut
                        data={dashData.porStatus.map((s: any) => s.value)}
                        colors={CHART_PALETTE.slice(0, dashData.porStatus.length)}
                        size={72}
                      />
                    </div>
                    <div className="flex-1 space-y-1 max-h-[160px] overflow-y-auto">
                      {dashData.porStatus.map((s: any, i: number) => (
                        <div key={s.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{STATUS_LABELS[s.label] || s.label}</span>
                          </div>
                          <span className="text-xs font-bold">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* === ROW 4: Evolução Mensal + Assuntos DataJud === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Evolução Mensal */}
              {dashData.evolucaoMensal.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                      Novos Processos por Mês
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <MiniBarChart
                      labels={dashData.evolucaoMensal
                        .filter((r: any) => r.mes !== "Desconhecido")
                        .map((r: any) => {
                          const parts = r.mes.split("-");
                          if (parts.length === 2) return `${parts[1]}/${parts[0].slice(2)}`;
                          return r.mes;
                        })}
                      data={dashData.evolucaoMensal.filter((r: any) => r.mes !== "Desconhecido").map((r: any) => r.count)}
                      color={CHART_PALETTE[0]}
                      height={180}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Assuntos DataJud */}
              {(dashData as any).topAssuntos?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-teal-500" />
                      Assuntos Mais Comuns (DataJud)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <MiniHBarChart
                      labels={(dashData as any).topAssuntos.map((a: any) => a.assunto.length > 30 ? a.assunto.slice(0, 30) + "..." : a.assunto)}
                      data={(dashData as any).topAssuntos.map((a: any) => a.count)}
                      color={CHART_PALETTE[4]}
                      height={Math.max(160, (dashData as any).topAssuntos.length * 28)}
                    />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* === ROW 5: Processos por Fase + Tipo de Ação === */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Por Fase */}
              {dashData.porFase.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                      Fase Processual
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {dashData.porFase.map((f: any, i: number) => {
                        const total = dashData.resumo.totalProcessos;
                        const pct = total > 0 ? Math.round((f.value / total) * 100) : 0;
                        return (
                          <div key={f.label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-muted-foreground">{FASE_LABELS[f.label] || f.label}</span>
                              <span className="text-xs font-bold">{f.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tipo de Ação */}
              {dashData.porTipo.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-orange-500" />
                      Tipo de Ação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {dashData.porTipo.map((t: any, i: number) => {
                        const total = dashData.resumo.totalProcessos;
                        const pct = total > 0 ? Math.round((t.value / total) * 100) : 0;
                        return (
                          <div key={t.label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-muted-foreground capitalize">{t.label}</span>
                              <span className="text-xs font-bold">{t.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: CHART_PALETTE[(i + 3) % CHART_PALETTE.length] }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* === ROW 6: Lista de Processos Recentes === */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Gavel className="h-3.5 w-3.5 text-amber-500" />
                    Processos Recentes
                    {processos && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{processos.length} total</Badge>}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5" onClick={() => navigate("/processos-trabalhistas")}>
                    Ver todos <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {!processosRecentes.length ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhum processo cadastrado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground">Processo</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground hidden sm:table-cell">Reclamante</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground hidden md:table-cell">Vara</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground">Status</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground">Risco</th>
                          <th className="py-1.5 font-medium text-muted-foreground hidden lg:table-cell">Valor Causa</th>
                          <th className="py-1.5 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {processosRecentes.map((p: any) => {
                          const rCfg = RISCO_CONFIG[p.risco] || RISCO_CONFIG.medio;
                          return (
                            <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate("/processos-trabalhistas")}>
                              <td className="py-1.5 pr-2">
                                <span className="font-mono text-[10px]">{p.numeroProcesso}</span>
                                <span className="block sm:hidden text-[10px] text-muted-foreground truncate max-w-[120px]">{p.reclamante}</span>
                              </td>
                              <td className="py-1.5 pr-2 hidden sm:table-cell">
                                <span className="font-medium truncate max-w-[150px] block">{p.reclamante}</span>
                              </td>
                              <td className="py-1.5 pr-2 hidden md:table-cell text-muted-foreground text-[10px]">{p.vara || "—"}</td>
                              <td className="py-1.5 pr-2">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0">{STATUS_LABELS[p.status] || p.status}</Badge>
                              </td>
                              <td className="py-1.5 pr-2">
                                <Badge className={`text-[9px] px-1.5 py-0 ${rCfg.bg} ${rCfg.text} border-0`}>{rCfg.label}</Badge>
                              </td>
                              <td className="py-1.5 hidden lg:table-cell text-muted-foreground">{p.valorCausa || "—"}</td>
                              <td className="py-1.5">
                                <Eye className="h-3 w-3 text-muted-foreground" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* === ROW 7: Valor por Risco + Atividade Recente === */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Valor em Risco por Nível */}
              {dashData.valorPorRisco.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-red-500" />
                      Valor em Risco por Nível
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {[...dashData.valorPorRisco].sort((a: any, b: any) => {
                        const order: Record<string, number> = { baixo: 0, medio: 1, alto: 2, critico: 3 };
                        return (order[a.risco] ?? 99) - (order[b.risco] ?? 99);
                      }).map((r: any) => {
                        const cfg = RISCO_CONFIG[r.risco] || RISCO_CONFIG.medio;
                        const totalRisco = dashData.resumo.valorEmRisco;
                        const pct = totalRisco > 0 ? Math.round((r.valor / totalRisco) * 100) : 0;
                        return (
                          <div key={r.risco}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <div className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                <span className="text-xs text-muted-foreground">{cfg.label}</span>
                              </div>
                              <span className="text-xs font-bold">{fmtBRL(r.valor)}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 pt-2 border-t flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Total em risco</span>
                      <span className="text-sm font-bold text-red-600">{fmtBRL(dashData.resumo.valorEmRisco)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Atividade Recente */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-amber-500" />
                    Atividade Recente
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {!logs || logs.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-4">Nenhuma atividade registrada</p>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-2">
                          <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${log.action === "DELETE" ? "bg-red-500" : log.action === "CREATE" ? "bg-green-500" : "bg-blue-500"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-foreground truncate">{log.details}</p>
                            <p className="text-[9px] text-muted-foreground">{log.userName} · {formatDateTime(log.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* === ROW 8: Acesso Rápido === */}
            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acesso Rápido</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Processos Trabalhistas", icon: Gavel, path: "/processos-trabalhistas", color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Dashboard Jurídico", icon: BarChart3, path: "/dashboards/juridico", color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Todos os Dashboards", icon: PieChart, path: "/dashboards", color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Aviso Prévio", icon: FileText, path: "/aviso-previo", color: "text-orange-600", bg: "bg-orange-50" },
                ].map(item => (
                  <button key={item.path} onClick={() => navigate(item.path)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-accent/50 hover:shadow-sm transition-all text-left group">
                    <div className={`h-7 w-7 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                    </div>
                    <span className="text-[11px] font-medium">{item.label}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      {/* Alert Modal - Full Screen */}
      <FullScreenDialog
        open={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={`Central de Alertas (${totalAlertas})`}
        subtitle="Movimentações DataJud, processos de risco e audiências"
        icon={<BellRing className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-red-700 to-red-500"
        footer={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setShowAlertModal(false); setShowConfigModal(true); }}>
              <Settings2 className="h-4 w-4" /> Configurações
            </Button>
            <Button size="sm" className="gap-1.5" disabled={executarVerifMut.isPending} onClick={() => executarVerifMut.mutate({ companyId: companyId! })}>
              <RefreshCw className={`h-4 w-4 ${executarVerifMut.isPending ? 'animate-spin' : ''}`} /> {executarVerifMut.isPending ? 'Verificando...' : 'Verificar Agora'}
            </Button>
          </div>
        }
      >
          <div className="space-y-6">
            {/* DataJud Auto-Check Alerts */}
            {alertsData && alertsData.alertas.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                    <Activity className="h-4 w-4" /> Movimentações DataJud ({alertsData.alertas.filter((a: any) => !a.lido).length} não lidos)
                  </h4>
                  {alertsData.alertas.some((a: any) => !a.lido) && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => marcarTodosLidosMut.mutate({ companyId: companyId! })}>
                      <CheckCheck className="h-3 w-3 mr-1" /> Marcar todos como lidos
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {alertsData.alertas.map((alerta: any) => {
                    const prioridadeColors: Record<string, string> = {
                      critica: 'bg-red-50 border-red-300',
                      alta: 'bg-orange-50 border-orange-300',
                      media: 'bg-yellow-50 border-yellow-300',
                      baixa: 'bg-blue-50 border-blue-200',
                    };
                    const prioridadeLabels: Record<string, string> = {
                      critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
                    };
                    return (
                      <div key={alerta.id} className={`border rounded-lg p-3 ${alerta.lido ? 'bg-gray-50 border-gray-200 opacity-60' : prioridadeColors[alerta.prioridade] || 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground truncate">{alerta.titulo}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                                alerta.prioridade === 'critica' ? 'bg-red-200 text-red-800' :
                                alerta.prioridade === 'alta' ? 'bg-orange-200 text-orange-800' :
                                alerta.prioridade === 'media' ? 'bg-yellow-200 text-yellow-800' :
                                'bg-blue-200 text-blue-800'
                              }`}>{prioridadeLabels[alerta.prioridade]}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{alerta.descricao}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{alerta.createdAt ? formatDateTime(alerta.createdAt) : ''}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!alerta.lido && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => marcarLidoMut.mutate({ alertaId: alerta.id })} title="Marcar como lido">
                                <CheckCheck className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => excluirAlertaMut.mutate({ alertaId: alerta.id })} title="Excluir">
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Risk Alerts */}
            {alertDetails.riscoAlto.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Processos de Risco Alto/Crítico ({alertDetails.riscoAlto.length})
                </h4>
                <div className="space-y-2">
                  {alertDetails.riscoAlto.map((p: any) => (
                    <div key={p.id} className="bg-red-50 border border-red-200 rounded-lg p-3 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => { setShowAlertModal(false); navigate("/processos-trabalhistas"); }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{p.numeroProcesso}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.risco === 'critico' ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'}`}>
                          {p.risco === 'critico' ? 'Crítico' : 'Alto'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{p.reclamante}</p>
                      {p.valorCausa && <p className="text-xs font-medium text-red-700 mt-0.5">Valor: {fmtBRL(Number(p.valorCausa))}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Hearings */}
            {alertDetails.audiencias.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" /> Próximas Audiências ({alertDetails.audiencias.length})
                </h4>
                <div className="space-y-2">
                  {alertDetails.audiencias.map((a: any, i: number) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{a.numero}</span>
                        <span className="text-xs text-amber-700 font-medium">{a.data ? formatDate(a.data) : '—'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.reclamante} {a.vara ? `• ${a.vara}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-check status */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-gray-600">Monitoramento automático: <strong>{autoCheckConfig?.isActive ? 'Ativo' : 'Inativo'}</strong></span>
                </div>
                <span className="text-[10px] text-gray-500">
                  {autoCheckConfig?.intervaloMinutos ? `A cada ${autoCheckConfig.intervaloMinutos >= 60 ? `${autoCheckConfig.intervaloMinutos / 60}h` : `${autoCheckConfig.intervaloMinutos}min`}` : 'Não configurado'}
                  {autoCheckConfig?.ultimaVerificacao ? ` • Última: ${formatDateTime(autoCheckConfig.ultimaVerificacao)}` : ''}
                </span>
              </div>
            </div>

            {totalAlertas === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum alerta no momento</p>
                <p className="text-xs mt-1">O sistema monitora automaticamente seus processos via DataJud</p>
              </div>
            )}
          </div>
      </FullScreenDialog>

      {/* Config Modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> Configuração do Monitoramento DataJud
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Status do Monitoramento</label>
              <div className="flex items-center gap-3 mt-2">
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${configActive ? 'bg-green-100 border-green-300 text-green-800' : 'bg-gray-100 border-gray-300 text-gray-600'}`}
                  onClick={() => setConfigActive(true)}
                >Ativo</button>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${!configActive ? 'bg-red-100 border-red-300 text-red-800' : 'bg-gray-100 border-gray-300 text-gray-600'}`}
                  onClick={() => setConfigActive(false)}
                >Inativo</button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Intervalo de Verificação</label>
              <p className="text-xs text-muted-foreground mb-2">Com que frequência o sistema consulta o DataJud para novas movimentações</p>
              <div className="grid grid-cols-3 gap-2">
                {[{ min: 30, label: '30 min' }, { min: 60, label: '1 hora' }, { min: 120, label: '2 horas' }, { min: 360, label: '6 horas' }, { min: 720, label: '12 horas' }, { min: 1440, label: '24 horas' }].map(opt => (
                  <button
                    key={opt.min}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${configInterval === opt.min ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => setConfigInterval(opt.min)}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                <strong>Como funciona:</strong> O sistema consulta o DataJud periodicamente pelo número de cada processo cadastrado, detectando novas movimentações (audiências, sentenças, recursos, etc.) e gerando alertas automáticos.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={saveConfigMut.isPending}
              onClick={() => {
                saveConfigMut.mutate({ companyId: companyId!, isActive: configActive, intervaloMinutos: configInterval });
                setShowConfigModal(false);
              }}
            >
              {saveConfigMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Settings2 className="h-4 w-4 mr-2" />}
              Salvar Configuração
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// KPI Card
const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; text: string; gradient: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-l-blue-500", text: "text-blue-600", gradient: "from-blue-50 to-blue-100/50" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-l-green-500", text: "text-green-600", gradient: "from-green-50 to-green-100/50" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-l-amber-500", text: "text-amber-600", gradient: "from-amber-50 to-amber-100/50" },
  red: { bg: "bg-red-50", icon: "text-red-600", border: "border-l-red-500", text: "text-red-600", gradient: "from-red-50 to-red-100/50" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-l-purple-500", text: "text-purple-600", gradient: "from-purple-50 to-purple-100/50" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-l-teal-500", text: "text-teal-600", gradient: "from-teal-50 to-teal-100/50" },
  slate: { bg: "bg-slate-50", icon: "text-slate-600", border: "border-l-slate-500", text: "text-slate-600", gradient: "from-slate-50 to-slate-100/50" },
};

function KpiCard({ title, value, icon: Icon, color, onClick, isMonetary, alert }: {
  title: string; value: string; icon: any; color: string; onClick?: () => void; isMonetary?: boolean; alert?: boolean;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <Card
      className={`border-l-4 ${c.border} hover:shadow-md transition-all ${onClick ? "cursor-pointer" : ""} ${alert ? "ring-2 ring-red-300 animate-pulse" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-2.5 sm:p-3">
        <div className="flex items-center gap-2">
          <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${c.icon}`} />
          </div>
          <div className="min-w-0">
            <p className={`${isMonetary ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'} font-bold ${c.text} truncate leading-tight`}>{value}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
