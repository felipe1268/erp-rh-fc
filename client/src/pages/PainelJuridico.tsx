import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Scale, Gavel, AlertTriangle, ChevronRight, BarChart3,
  Calendar, Activity, Clock, DollarSign, FileText, TrendingUp
} from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";

export default function PainelJuridico() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;

  const { data: homeData, isLoading } = trpc.home.getData.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId, limit: 6 },
    { enabled: !!companyId }
  );

  const s = homeData?.stats;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <Scale className="h-4 w-4 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel Jurídico</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Departamento Jurídico - Processos Trabalhistas
            </p>
          </div>
          {(s?.processosRiscoAlto ?? 0) > 0 ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-semibold text-red-700">{s!.processosRiscoAlto} processo{s!.processosRiscoAlto !== 1 ? "s" : ""} de risco alto/crítico</span>
            </div>
          ) : null}
        </div>

        {companyId ? (
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-24" /></Card>
              ))}
            </div>
          ) : (
            <>
              {/* KPI Cards - Jurídico */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Indicadores Jurídicos</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard title="Processos Ativos" value={s?.processosAtivos ?? 0} icon={Gavel} color="amber" onClick={() => navigate("/processos-trabalhistas")} />
                  <KpiCard title="Risco Alto/Crítico" value={s?.processosRiscoAlto ?? 0} icon={AlertTriangle} color="red" onClick={() => navigate("/processos-trabalhistas")} alert={!!s?.processosRiscoAlto} />
                  <KpiCard title="Audiências (30d)" value={homeData?.proximasAudiencias?.length ?? 0} icon={Calendar} color="blue" onClick={() => navigate("/processos-trabalhistas")} />
                  <KpiCard title="Valor Provisionado" value={0} icon={DollarSign} color="green" onClick={() => navigate("/processos-trabalhistas")} isMonetary customValue={
                    homeData?.proximasAudiencias?.reduce((acc: number, p: any) => acc + (p.valorCausa || 0), 0) ?? 0
                  } />
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Próximas Audiências */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-500" />
                        Próximas Audiências
                        {(homeData?.proximasAudiencias?.length ?? 0) > 0 ? <Badge className="bg-blue-100 text-blue-700 text-[10px]">{homeData!.proximasAudiencias.length}</Badge> : null}
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/processos-trabalhistas")}>
                        Ver todos <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!homeData?.proximasAudiencias?.length ? (
                      <div className="flex flex-col items-center py-6">
                        <Calendar className="h-10 w-10 text-green-400 mb-2" />
                        <p className="text-sm font-medium text-green-600">Nenhuma audiência agendada</p>
                        <p className="text-xs text-muted-foreground">Tudo em dia!</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {homeData.proximasAudiencias.map((p: any) => {
                          const urgColor = p.dias <= 7 ? "bg-red-50 border-red-200" : p.dias <= 30 ? "bg-orange-50 border-orange-200" : "bg-white border-gray-200";
                          const urgText = p.dias <= 7 ? "text-red-600 font-bold" : p.dias <= 30 ? "text-orange-600 font-semibold" : "text-muted-foreground";
                          return (
                            <div key={p.id} className={`px-3 py-2 rounded-lg border ${urgColor}`}>
                              <div className="flex items-center justify-between">
                                <div className="min-w-0">
                                  <span className="text-sm font-semibold">{p.reclamante}</span>
                                  <span className="text-xs text-muted-foreground ml-2">{p.numeroProcesso}</span>
                                </div>
                                <Badge className={`text-[10px] ${p.risco === 'critico' ? 'bg-red-100 text-red-700' : p.risco === 'alto' ? 'bg-orange-100 text-orange-700' : p.risco === 'medio' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                  {p.risco}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {p.dataAudiencia ? new Date(p.dataAudiencia + "T00:00:00").toLocaleDateString("pt-BR") : "Sem data"}
                                </span>
                                <span className={`text-xs font-mono ${urgText}`}>
                                  {p.dias === 0 ? "HOJE" : p.dias === 1 ? "Amanhã" : `em ${p.dias}d`}
                                </span>
                              </div>
                              {p.valorCausa ? (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  Valor da causa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valorCausa)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Processos por Risco */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-amber-500" />
                      Processos por Nível de Risco
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { label: "Crítico", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", count: homeData?.proximasAudiencias?.filter((p: any) => p.risco === 'critico').length ?? 0 },
                        { label: "Alto", color: "bg-orange-500", textColor: "text-orange-700", bgColor: "bg-orange-50", count: homeData?.proximasAudiencias?.filter((p: any) => p.risco === 'alto').length ?? 0 },
                        { label: "Médio", color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50", count: homeData?.proximasAudiencias?.filter((p: any) => p.risco === 'medio').length ?? 0 },
                        { label: "Baixo", color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-50", count: homeData?.proximasAudiencias?.filter((p: any) => p.risco === 'baixo').length ?? 0 },
                      ].map(r => (
                        <div key={r.label} className={`flex items-center justify-between px-3 py-2 rounded-lg ${r.bgColor}`}>
                          <div className="flex items-center gap-2">
                            <div className={`h-3 w-3 rounded-full ${r.color}`} />
                            <span className={`text-sm font-medium ${r.textColor}`}>{r.label}</span>
                          </div>
                          <span className={`text-lg font-bold ${r.textColor}`}>{r.count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Total de processos ativos</span>
                        <span className="text-lg font-bold text-foreground">{s?.processosAtivos ?? 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Atividade Recente */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-amber-500" />
                    Atividade Recente - Jurídico
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!logs || logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma atividade registrada</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {logs.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-2 text-xs">
                          <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${log.action === "DELETE" ? "bg-red-500" : log.action === "CREATE" ? "bg-green-500" : "bg-blue-500"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate">{log.details}</p>
                            <p className="text-[10px] text-muted-foreground">{log.userName} · {formatDateTime(log.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Acesso Rápido Jurídico */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Acesso Rápido - Jurídico</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { label: "Processos Trabalhistas", icon: Gavel, path: "/processos-trabalhistas", color: "text-amber-600" },
                    { label: "Dashboard Jurídico", icon: BarChart3, path: "/dashboards/juridico", color: "text-purple-600" },
                  ].map(item => (
                    <button key={item.path} onClick={() => navigate(item.path)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-accent/50 hover:shadow-sm transition-all text-left">
                      <item.icon className={`h-4 w-4 ${item.color} shrink-0`} />
                      <span className="text-xs font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Scale className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel jurídico.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// KPI Card
const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; text: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-l-blue-500", text: "text-blue-600" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-l-green-500", text: "text-green-600" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-l-amber-500", text: "text-amber-600" },
  red: { bg: "bg-red-50", icon: "text-red-600", border: "border-l-red-500", text: "text-red-600" },
};

function KpiCard({ title, value, icon: Icon, color, onClick, alert, isMonetary, customValue }: {
  title: string; value: number; icon: any; color: string; onClick?: () => void; alert?: boolean; isMonetary?: boolean; customValue?: number;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  const displayValue = isMonetary
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(customValue ?? value)
    : String(value);
  return (
    <Card className={`border-l-4 ${c.border} hover:shadow-md transition-shadow cursor-pointer ${alert ? "ring-2 ring-red-300 animate-pulse" : ""}`} onClick={onClick}>
      <CardContent className="p-3 flex flex-col gap-2">
        <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
        <div>
          <p className={`${isMonetary ? 'text-lg' : 'text-2xl'} font-bold ${c.text}`}>{displayValue}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}
