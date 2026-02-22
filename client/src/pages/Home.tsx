import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  Users, Building2, UserCheck, Palmtree, UserX, AlertTriangle, Clock,
  BarChart3, Landmark, Gavel, Cake, FileWarning, CalendarClock,
  ArrowUpRight, ArrowDownRight, TrendingUp, ShieldAlert, Activity,
  ChevronRight, HeartPulse, Briefcase, Scale, X, ExternalLink,
  Printer, Plane, DollarSign, TreePalm
} from "lucide-react";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";

const RISCO_COLORS: Record<string, string> = {
  baixo: "bg-green-100 text-green-700",
  medio: "bg-yellow-100 text-yellow-700",
  alto: "bg-orange-100 text-orange-700",
  critico: "bg-red-100 text-red-700",
};

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [alertasOpen, setAlertasOpen] = useState(false);

  const { data: homeData, isLoading } = trpc.home.getData.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId, limit: 6 },
    { enabled: !!companyId }
  );

  const s = homeData?.stats;

  // Calcular total de alertas
  const totalAlertas = (s?.asosVencidos ?? 0) + (s?.asosVencendo ?? 0) + (s?.semAso ?? 0) + (s?.feriasAlerta ?? 0) + (s?.processosRiscoAlto ?? 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel Principal</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Bem-vindo(a), <span className="font-medium text-foreground">{user?.name ?? "Usuário"}</span>
            </p>
          </div>
          {totalAlertas > 0 && (
            <button
              onClick={() => setAlertasOpen(true)}
              className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-100 hover:border-red-300 transition-colors cursor-pointer"
            >
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <span className="text-sm font-semibold text-red-700">{totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""} requer{totalAlertas !== 1 ? "em" : ""} atenção</span>
              <ChevronRight className="h-4 w-4 text-red-400" />
            </button>
          )}

          {/* ========== PAINEL DE ALERTAS ========== */}
          <AlertasDialog
            open={alertasOpen}
            onClose={() => setAlertasOpen(false)}
            homeData={homeData}
            stats={s}
            navigate={navigate}
          />
        </div>

        {companyId ? (
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 h-24" />
                </Card>
              ))}
            </div>
          ) : (
            <>
              {/* KPI Cards Row 1 - Funcionários */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recursos Humanos</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard
                    title="Total Colaboradores"
                    value={s?.totalFuncionarios ?? 0}
                    icon={Users}
                    color="blue"
                    onClick={() => navigate("/colaboradores")}
                  />
                  <KpiCard
                    title="Ativos"
                    value={s?.ativos ?? 0}
                    icon={UserCheck}
                    color="green"
                    onClick={() => navigate("/colaboradores")}
                  />
                  <KpiCard
                    title="Férias"
                    value={s?.ferias ?? 0}
                    icon={Palmtree}
                    color="cyan"
                    onClick={() => navigate("/colaboradores")}
                  />
                  <KpiCard
                    title="Afastados"
                    value={s?.afastados ?? 0}
                    icon={AlertTriangle}
                    color="yellow"
                    onClick={() => navigate("/colaboradores")}
                  />
                  <KpiCard
                    title="Licença"
                    value={s?.licenca ?? 0}
                    icon={UserX}
                    color="purple"
                    onClick={() => navigate("/colaboradores")}
                  />
                  <KpiCard
                    title="Desligados"
                    value={s?.desligados ?? 0}
                    icon={UserX}
                    color="red"
                    onClick={() => navigate("/colaboradores")}
                  />
                </div>
              </div>

              {/* KPI Cards Row 2 - Operacional */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Operacional & Jurídico</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard
                    title="Obras Ativas"
                    value={s?.obrasAtivas ?? 0}
                    icon={Landmark}
                    color="teal"
                    onClick={() => navigate("/obras")}
                  />
                  <KpiCard
                    title="Processos Ativos"
                    value={s?.processosAtivos ?? 0}
                    icon={Gavel}
                    color="slate"
                    onClick={() => navigate("/processos-trabalhistas")}
                    badge={s?.processosRiscoAlto ? `${s.processosRiscoAlto} risco alto` : undefined}
                    badgeColor="red"
                  />
                  <KpiCard
                    title="ASOs Vencidos"
                    value={s?.asosVencidos ?? 0}
                    icon={FileWarning}
                    color="red"
                    onClick={() => navigate("/controle-documentos")}
                    alert={!!s?.asosVencidos}
                  />
                  <KpiCard
                    title="ASOs Vencendo (60d)"
                    value={s?.asosVencendo ?? 0}
                    icon={HeartPulse}
                    color="orange"
                    onClick={() => navigate("/controle-documentos")}
                  />
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Coluna 1: Alertas Prioritários */}
                <div className="space-y-4">
                  {/* Aniversariantes */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Cake className="h-4 w-4 text-pink-500" />
                        Aniversariantes do Mês
                        {s?.aniversariantesHoje ? (
                          <Badge className="bg-pink-100 text-pink-700 text-[10px]">{s.aniversariantesHoje} hoje!</Badge>
                        ) : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.aniversariantes?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum aniversariante este mês</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {homeData.aniversariantes.map(a => (
                            <div
                              key={a.id}
                              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-accent/50 ${a.isHoje ? "bg-pink-50 border border-pink-200" : ""}`}
                              onClick={() => navigate("/colaboradores")}
                            >
                              <div className="flex items-center gap-2">
                                {a.isHoje && <span className="text-base">🎂</span>}
                                <div>
                                  <span className="font-medium">{a.nome}</span>
                                  {a.funcao && <span className="text-muted-foreground ml-1">({a.funcao})</span>}
                                </div>
                              </div>
                              <span className={`font-mono ${a.isHoje ? "font-bold text-pink-600" : a.jaPassou ? "text-muted-foreground line-through" : ""}`}>
                                Dia {a.dia}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Próximas Audiências */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Scale className="h-4 w-4 text-slate-600" />
                          Próximas Audiências
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/processos-trabalhistas")}>
                          Ver todos <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.proximasAudiencias?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhuma audiência agendada</p>
                      ) : (
                        <div className="space-y-2">
                          {homeData.proximasAudiencias.map(a => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer"
                              onClick={() => navigate("/processos-trabalhistas")}
                            >
                              <div>
                                <span className="font-medium">{a.reclamante}</span>
                                <span className="text-muted-foreground ml-1 text-[10px]">{a.numeroProcesso}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-[10px] ${RISCO_COLORS[a.risco] || ""}`}>{a.risco}</Badge>
                                <span className={`font-mono ${a.dias <= 7 ? "text-red-600 font-bold" : a.dias <= 30 ? "text-orange-600" : ""}`}>
                                  {a.dias === 0 ? "HOJE" : a.dias === 1 ? "Amanhã" : `${a.dias}d`}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Coluna 2: ASOs e Férias */}
                <div className="space-y-4">
                  {/* ASOs com Alerta */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <HeartPulse className="h-4 w-4 text-red-500" />
                          ASOs - Atenção Necessária
                          {(s?.asosVencidos ?? 0) > 0 && (
                            <Badge variant="destructive" className="text-[10px]">{s!.asosVencidos} vencido{s!.asosVencidos !== 1 ? "s" : ""}</Badge>
                          )}
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/controle-documentos")}>
                          Ver todos <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.asosAlerta?.length && !homeData?.semAso?.length ? (
                        <p className="text-xs text-muted-foreground">Todos os ASOs estão em dia</p>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {homeData?.asosAlerta?.slice(0, 8).map(a => (
                            <div
                              key={a.employeeId}
                              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${a.vencido ? "bg-red-50 border border-red-200" : a.diasRestantes <= 15 ? "bg-orange-50" : ""}`}
                            >
                              <div>
                                <span className="font-medium">{a.nome}</span>
                              </div>
                              <span className={`font-mono text-[10px] ${a.vencido ? "text-red-600 font-bold" : a.diasRestantes <= 15 ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
                                {a.vencido ? `Vencido há ${Math.abs(a.diasRestantes)}d` : `${a.diasRestantes}d restantes`}
                              </span>
                            </div>
                          ))}
                          {(homeData?.semAso?.length ?? 0) > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-[10px] text-red-600 font-semibold mb-1">
                                {homeData!.semAso!.length} funcionário{homeData!.semAso!.length !== 1 ? "s" : ""} sem ASO cadastrado:
                              </p>
                              {homeData!.semAso!.slice(0, 3).map(e => (
                                <div key={e.id} className="text-xs text-muted-foreground pl-2">{e.nome}</div>
                              ))}
                              {homeData!.semAso!.length > 3 && (
                                <div className="text-[10px] text-muted-foreground pl-2">
                                  e mais {homeData!.semAso!.length - 3}...
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Alertas de Férias */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-amber-500" />
                        Férias - Período Aquisitivo
                        {(s?.feriasAlerta ?? 0) > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px]">{s!.feriasAlerta} pendente{s!.feriasAlerta !== 1 ? "s" : ""}</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.feriasAlerta?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum alerta de férias no momento</p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {homeData.feriasAlerta.slice(0, 6).map(f => (
                            <div
                              key={f.id}
                              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${f.urgente ? "bg-amber-50 border border-amber-200" : ""}`}
                            >
                              <div>
                                <span className="font-medium">{f.nome}</span>
                                <span className="text-muted-foreground ml-1 text-[10px]">{f.periodoAquisitivo}º período</span>
                              </div>
                              <span className={`font-mono text-[10px] ${f.urgente ? "text-red-600 font-bold" : "text-amber-600"}`}>
                                {f.diasParaVencer <= 0 ? "VENCIDO" : `${f.diasParaVencer}d`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Dashboard de Férias - Agendadas e Em Andamento */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Plane className="h-4 w-4 text-blue-500" />
                        Férias - Painel Rápido
                        {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 && (
                          <Badge className="bg-blue-100 text-blue-700 text-[10px]">{homeData!.feriasDashboard.emAndamento.length} em gozo</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Em gozo agora */}
                      {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">De férias agora</p>
                          <div className="space-y-1">
                            {homeData!.feriasDashboard.emAndamento.slice(0, 4).map((f: any) => (
                              <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-blue-50 border border-blue-100">
                                <span className="font-medium">{f.nome}</span>
                                <span className="text-blue-600 font-mono text-[10px]">volta em {f.diasRestantes}d</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Agendadas */}
                      {(homeData?.feriasDashboard?.agendadas?.length ?? 0) > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold text-green-600 uppercase mb-1">Próximas agendadas</p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {homeData!.feriasDashboard.agendadas.slice(0, 5).map((f: any) => (
                              <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1 rounded">
                                <div>
                                  <span className="font-medium">{f.nome}</span>
                                  <span className="text-muted-foreground ml-1 text-[10px]">{f.diasGozo}d</span>
                                </div>
                                <span className="text-green-600 font-mono text-[10px]">em {f.diasAteInicio}d</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        (homeData?.feriasDashboard?.emAndamento?.length ?? 0) === 0 && (
                          <p className="text-xs text-muted-foreground">Nenhuma férias agendada nos próximos 60 dias</p>
                        )
                      )}
                      {/* Custo próximo */}
                      {(homeData?.feriasDashboard?.custoProximo90Dias ?? 0) > 0 && (
                        <div className="mt-2 pt-2 border-t flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Custo próx. 90 dias</span>
                          <span className="text-xs font-bold text-orange-600">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(homeData!.feriasDashboard.custoProximo90Dias)}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Coluna 3: Movimentações e Atividade */}
                <div className="space-y-4">
                  {/* Movimentações Recentes */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-blue-500" />
                        Movimentações (30 dias)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.movimentacoes?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhuma movimentação recente</p>
                      ) : (
                        <div className="space-y-2">
                          {homeData.movimentacoes.slice(0, 6).map((m, i) => (
                            <div key={`${m.tipo}-${m.id}-${i}`} className="flex items-center gap-2 text-xs">
                              {m.tipo === "admissao" ? (
                                <ArrowUpRight className="h-3.5 w-3.5 text-green-600 shrink-0" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5 text-red-600 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate block">{m.nome}</span>
                                <span className="text-muted-foreground text-[10px]">
                                  {m.funcao} · {new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR")}
                                </span>
                              </div>
                              <Badge className={`text-[10px] shrink-0 ${m.tipo === "admissao" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {m.tipo === "admissao" ? "Admissão" : "Demissão"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Atividade Recente do Sistema */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          Atividade Recente
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/auditoria")}>
                          Ver tudo <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!logs || logs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma atividade registrada</p>
                      ) : (
                        <div className="space-y-2">
                          {logs.map((log: any) => (
                            <div key={log.id} className="flex items-start gap-2 text-xs">
                              <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${log.action === "DELETE" ? "bg-red-500" : log.action === "CREATE" ? "bg-green-500" : "bg-blue-500"}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-foreground truncate">{log.details}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {log.userName} · {new Date(log.createdAt).toLocaleString("pt-BR")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Advertências Recentes */}
                  {(homeData?.advertenciasRecentes?.length ?? 0) > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-orange-500" />
                          Advertências Recentes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {homeData!.advertenciasRecentes!.map(a => (
                            <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-accent/50">
                              <span className="font-medium">{a.nome}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                                <span className="text-muted-foreground text-[10px]">
                                  {a.data ? new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR") : ""}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Acesso Rápido</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {[
                    { label: "Colaboradores", icon: Users, path: "/colaboradores", color: "text-blue-600" },
                    { label: "Obras", icon: Landmark, path: "/obras", color: "text-teal-600" },
                    { label: "Fechamento Ponto", icon: Clock, path: "/fechamento-ponto", color: "text-indigo-600" },
                    { label: "Folha Pagamento", icon: Briefcase, path: "/folha-pagamento", color: "text-emerald-600" },
                    { label: "Documentos", icon: FileWarning, path: "/controle-documentos", color: "text-amber-600" },
                    { label: "Dashboards", icon: BarChart3, path: "/dashboards", color: "text-purple-600" },
                  ].map(item => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-accent/50 hover:shadow-sm transition-all text-left"
                    >
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
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma empresa cadastrada</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">
                Para começar, cadastre uma empresa no menu "Empresas" na barra lateral.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// Painel de Alertas Detalhado
// ============================================================
function AlertasDialog({
  open,
  onClose,
  homeData,
  stats,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  homeData: any;
  stats: any;
  navigate: (path: string) => void;
}) {
  const s = stats;
  const handlePrint = () => {
    window.print();
  };

  // Montar lista unificada de alertas
  const alertGroups = [
    {
      title: "ASOs Vencidos",
      icon: FileWarning,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      count: s?.asosVencidos ?? 0,
      items: (homeData?.asosAlerta ?? []).filter((a: any) => a.vencido).map((a: any) => ({
        label: a.nome,
        sublabel: a.funcao || "",
        detail: `Vencido há ${Math.abs(a.diasRestantes)} dias`,
        detailColor: "text-red-600 font-bold",
      })),
      action: () => { onClose(); navigate("/controle-documentos"); },
      actionLabel: "Ver Controle de Documentos",
    },
    {
      title: "ASOs Vencendo (próx. 60 dias)",
      icon: HeartPulse,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      count: s?.asosVencendo ?? 0,
      items: (homeData?.asosAlerta ?? []).filter((a: any) => !a.vencido).map((a: any) => ({
        label: a.nome,
        sublabel: a.funcao || "",
        detail: `${a.diasRestantes} dias restantes`,
        detailColor: a.diasRestantes <= 15 ? "text-orange-600 font-semibold" : "text-muted-foreground",
      })),
      action: () => { onClose(); navigate("/controle-documentos"); },
      actionLabel: "Ver Controle de Documentos",
    },
    {
      title: "Funcionários sem ASO",
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      count: s?.semAso ?? 0,
      items: (homeData?.semAso ?? []).map((e: any) => ({
        label: e.nome,
        sublabel: e.funcao || "",
        detail: "Sem ASO cadastrado",
        detailColor: "text-amber-600",
      })),
      action: () => { onClose(); navigate("/controle-documentos"); },
      actionLabel: "Cadastrar ASO",
    },
    {
      title: "Férias - Período Aquisitivo",
      icon: CalendarClock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      count: s?.feriasAlerta ?? 0,
      items: (homeData?.feriasAlerta ?? []).map((f: any) => ({
        label: f.nome,
        sublabel: `${f.periodoAquisitivo}º período aquisitivo`,
        detail: f.diasParaVencer <= 0 ? "VENCIDO" : `${f.diasParaVencer} dias para vencer`,
        detailColor: f.urgente ? "text-red-600 font-bold" : "text-yellow-600",
      })),
      action: () => { onClose(); navigate("/colaboradores"); },
      actionLabel: "Ver Colaboradores",
    },
    {
      title: "Processos Trabalhistas - Risco Alto/Crítico",
      icon: Gavel,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      count: s?.processosRiscoAlto ?? 0,
      items: (homeData?.proximasAudiencias ?? []).filter((p: any) => p.risco === "alto" || p.risco === "critico").map((p: any) => ({
        label: p.reclamante,
        sublabel: p.numeroProcesso,
        detail: p.dataAudiencia ? `Audiência em ${p.dias}d (${new Date(p.dataAudiencia + "T00:00:00").toLocaleDateString("pt-BR")})` : "Sem audiência agendada",
        detailColor: p.dias <= 7 ? "text-red-600 font-bold" : p.dias <= 30 ? "text-orange-600" : "text-muted-foreground",
      })),
      action: () => { onClose(); navigate("/processos-trabalhistas"); },
      actionLabel: "Ver Processos",
    },
  ].filter(g => g.count > 0);

  const totalAlertas = alertGroups.reduce((acc, g) => acc + g.count, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Central de Alertas</DialogTitle>
              <p className="text-sm text-muted-foreground">{totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""} requer{totalAlertas !== 1 ? "em" : ""} atenção</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>

        {/* Resumo rápido */}
        <div className="px-6 py-3 bg-muted/30 border-b">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {alertGroups.map((g, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${g.bgColor} border ${g.borderColor}`}>
                <g.icon className={`h-4 w-4 ${g.color} shrink-0`} />
                <div>
                  <p className={`text-lg font-bold ${g.color}`}>{g.count}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{g.title.split(" - ")[0]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lista de alertas por categoria */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {alertGroups.map((group, gi) => (
            <div key={gi}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <group.icon className={`h-4 w-4 ${group.color}`} />
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <Badge variant="secondary" className="text-[10px]">{group.count}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={group.action}
                >
                  {group.actionLabel} <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1">
                {group.items.map((item: any, ii: number) => (
                  <div
                    key={ii}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 rounded-lg ${group.bgColor} border ${group.borderColor} gap-1`}
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.sublabel && <span className="text-xs text-muted-foreground ml-2">{item.sublabel}</span>}
                    </div>
                    <span className={`text-xs font-mono shrink-0 ${item.detailColor}`}>{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Atualizado em {new Date().toLocaleString("pt-BR")}</p>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// KPI Card Component
// ============================================================
const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; text: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-l-blue-500", text: "text-blue-600" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-l-green-500", text: "text-green-600" },
  cyan: { bg: "bg-cyan-50", icon: "text-cyan-600", border: "border-l-cyan-500", text: "text-cyan-600" },
  yellow: { bg: "bg-yellow-50", icon: "text-yellow-600", border: "border-l-yellow-500", text: "text-yellow-600" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-l-purple-500", text: "text-purple-600" },
  red: { bg: "bg-red-50", icon: "text-red-600", border: "border-l-red-500", text: "text-red-600" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-l-teal-500", text: "text-teal-600" },
  slate: { bg: "bg-slate-50", icon: "text-slate-600", border: "border-l-slate-500", text: "text-slate-600" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-l-orange-500", text: "text-orange-600" },
};

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  onClick,
  badge,
  badgeColor,
  alert,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  onClick?: () => void;
  badge?: string;
  badgeColor?: string;
  alert?: boolean;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <Card
      className={`border-l-4 ${c.border} hover:shadow-md transition-shadow cursor-pointer ${alert ? "ring-2 ring-red-300 animate-pulse" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-4 w-4 ${c.icon}`} />
          </div>
          {badge && (
            <Badge className={`text-[9px] ${badgeColor === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
              {badge}
            </Badge>
          )}
        </div>
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}
