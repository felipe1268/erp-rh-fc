import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Scale, AlertTriangle, ChevronRight, BarChart3,
  Calendar, Activity, DollarSign, FileText, TrendingUp,
  ShieldAlert, Eye, Loader2, Briefcase, Target, PieChart,
  BookOpen,
} from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/dateUtils";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { CHART_PALETTE, SEMANTIC_COLORS } from "@/lib/chartColors";

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
  recurso: "Recurso",
  execucao: "Execução",
  sentenca: "Sentença",
  acordo: "Acordo",
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
  decisoria: "Decisória",
  recursal: "Recursal",
  execucao: "Execução",
  encerrado: "Encerrado",
};

const TIPO_ACAO_LABELS: Record<string, string> = {
  cobranca: "Cobrança", indenizacao: "Indenização", execucao: "Execução",
  monitoria: "Monitória", consignacao: "Consignação", despejo: "Despejo",
  possessoria: "Possessória", declaratoria: "Declaratória", anulatoria: "Anulatória",
  mandado_seguranca: "Mandado de Segurança", outros: "Outros",
};

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
        data: { datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
        options: { responsive: false, cutout: "65%", plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { display: false } } },
      });
    });
    return () => { mounted = false; if (chartRef.current) chartRef.current.destroy(); };
  }, [data, colors, size]);

  return <canvas ref={canvasRef} width={size} height={size} />;
}

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
        data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 4, barThickness: 18 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
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

  return <div style={{ height: `${height}px` }}><canvas ref={canvasRef} /></div>;
}

const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; text: string }> = {
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", border: "border-l-indigo-500", text: "text-indigo-600" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-l-green-500", text: "text-green-600" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-l-amber-500", text: "text-amber-600" },
  red: { bg: "bg-red-50", icon: "text-red-600", border: "border-l-red-500", text: "text-red-600" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-l-purple-500", text: "text-purple-600" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-l-teal-500", text: "text-teal-600" },
  slate: { bg: "bg-slate-50", icon: "text-slate-600", border: "border-l-slate-500", text: "text-slate-600" },
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-l-blue-500", text: "text-blue-600" },
};

function KpiCard({ title, value, icon: Icon, color, onClick, isMonetary }: {
  title: string; value: string; icon: any; color: string; onClick?: () => void; isMonetary?: boolean;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.indigo;
  return (
    <Card className={`border-l-4 ${c.border} hover:shadow-md transition-all ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
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

export default function PainelCivil() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || undefined : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : (!!companyId && companyId > 0);

  const { data: dashData, isLoading: dashLoading } = trpc.dashboards.civil.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const { data: processos, isLoading: processosLoading } = trpc.processosCivis.listar.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const { data: logs } = trpc.audit.list.useQuery(
    { companyId: queryCompanyId, limit: 5, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const isLoading = dashLoading || processosLoading;

  const processosRecentes = useMemo(() => {
    if (!processos) return [];
    return [...processos].sort((a: any, b: any) => {
      const da = a.updatedAt || a.createdAt || "";
      const db2 = b.updatedAt || b.createdAt || "";
      return db2.localeCompare(da);
    }).slice(0, 5);
  }, [processos]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center shadow-sm">
                <BookOpen className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Painel Civil</h1>
                <p className="text-muted-foreground text-xs">Gestão de Processos Cíveis — KPIs, Tipos de Ação e Audiências</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => navigate("/processos-civis")}>
              <BookOpen className="h-3.5 w-3.5" /> Processos
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => navigate("/dashboards/civil")}>
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </Button>
          </div>
        </div>

        {!hasValidCompany ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel civil.</p>
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
            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visão Geral</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <KpiCard title="Total de Processos" value={fmtNum(dashData.resumo.totalProcessos)} icon={BookOpen} color="indigo" onClick={() => navigate("/processos-civis")} />
                <KpiCard title="Processos Ativos" value={fmtNum(dashData.resumo.processosAtivos)} icon={AlertTriangle} color="amber" onClick={() => navigate("/processos-civis")} />
                <KpiCard title="Encerrados" value={fmtNum(dashData.resumo.processosEncerrados)} icon={FileText} color="green" onClick={() => navigate("/processos-civis")} />
                <KpiCard title="Valor em Risco" value={fmtBRL(dashData.resumo.valorEmRisco)} icon={ShieldAlert} color="red" isMonetary />
              </div>
            </div>

            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Valores Financeiros</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <KpiCard title="Valor da Causa" value={fmtBRL(dashData.resumo.totalValorCausa)} icon={DollarSign} color="red" isMonetary />
                <KpiCard title="Condenação" value={fmtBRL(dashData.resumo.totalValorCondenacao)} icon={Scale} color="purple" isMonetary />
                <KpiCard title="Acordos" value={fmtBRL(dashData.resumo.totalValorAcordo)} icon={TrendingUp} color="teal" isMonetary />
                <KpiCard title="Valor Pago" value={fmtBRL(dashData.resumo.totalValorPago)} icon={DollarSign} color="slate" isMonetary />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-indigo-500" />
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
                              <span className="font-semibold truncate flex-1">{a.autor} vs {a.reu}</span>
                              <span className={`text-[10px] font-mono shrink-0 ${urgente ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                                {a.data ? formatDate(a.data) : "—"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-mono">{a.numero}</span>
                              <Badge className={`text-[9px] px-1 py-0 ${a.risco === "critico" || a.risco === "alto" ? "bg-red-100 text-red-700" : a.risco === "medio" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                {TIPO_ACAO_LABELS[a.tipoAcao] || a.tipoAcao}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                        .map((r: any) => { const parts = r.mes.split("-"); if (parts.length === 2) return `${parts[1]}/${parts[0].slice(2)}`; return r.mes; })}
                      data={dashData.evolucaoMensal.filter((r: any) => r.mes !== "Desconhecido").map((r: any) => r.count)}
                      color={CHART_PALETTE[3]}
                      height={180}
                    />
                  </CardContent>
                </Card>
              )}

              {dashData.porTipoAcao.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                      Por Tipo de Ação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-2">
                      {dashData.porTipoAcao.sort((a: any, b: any) => b.value - a.value).map((t: any, i: number) => {
                        const total = dashData.resumo.totalProcessos;
                        const pct = total > 0 ? Math.round((t.value / total) * 100) : 0;
                        return (
                          <div key={t.label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-muted-foreground">{TIPO_ACAO_LABELS[t.label] || t.label}</span>
                              <span className="text-xs font-bold">{t.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_PALETTE[(i + 2) % CHART_PALETTE.length] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {dashData.porFase.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                    Fase Processual
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
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
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                    Processos Recentes
                    {processos && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{processos.length} total</Badge>}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5" onClick={() => navigate("/processos-civis")}>
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
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground hidden sm:table-cell">Autor</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground hidden md:table-cell">Réu</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground">Tipo</th>
                          <th className="py-1.5 pr-2 font-medium text-muted-foreground">Risco</th>
                          <th className="py-1.5 font-medium text-muted-foreground hidden lg:table-cell">Valor Causa</th>
                          <th className="py-1.5 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {processosRecentes.map((p: any) => {
                          const rCfg = RISCO_CONFIG[p.risco] || RISCO_CONFIG.medio;
                          return (
                            <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate("/processos-civis")}>
                              <td className="py-1.5 pr-2">
                                <span className="font-mono text-[10px]">{p.numeroProcesso}</span>
                                <span className="block sm:hidden text-[10px] text-muted-foreground truncate max-w-[120px]">{p.autor}</span>
                              </td>
                              <td className="py-1.5 pr-2 hidden sm:table-cell">
                                <span className="font-medium truncate max-w-[150px] block">{p.autor}</span>
                              </td>
                              <td className="py-1.5 pr-2 hidden md:table-cell text-muted-foreground text-[10px]">{p.reu || "—"}</td>
                              <td className="py-1.5 pr-2">
                                <Badge className="text-[9px] px-1.5 py-0 bg-indigo-100 text-indigo-700 border-0">{TIPO_ACAO_LABELS[p.tipoAcao] || p.tipoAcao}</Badge>
                              </td>
                              <td className="py-1.5 pr-2">
                                <Badge className={`text-[9px] px-1.5 py-0 ${rCfg.bg} ${rCfg.text} border-0`}>{rCfg.label}</Badge>
                              </td>
                              <td className="py-1.5 hidden lg:table-cell text-muted-foreground">{p.valorCausa || "—"}</td>
                              <td className="py-1.5"><Eye className="h-3 w-3 text-muted-foreground" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-indigo-500" />
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

            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acesso Rápido</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Processos Cíveis", icon: BookOpen, path: "/processos-civis", color: "text-indigo-600", bg: "bg-indigo-50" },
                  { label: "Dashboard Civil", icon: BarChart3, path: "/dashboards/civil", color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Painel Jurídico", icon: Scale, path: "/painel/juridico", color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Todos os Dashboards", icon: PieChart, path: "/dashboards", color: "text-blue-600", bg: "bg-blue-50" },
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
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
