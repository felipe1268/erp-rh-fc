import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Shield, HardHat, HeartPulse, FileWarning, AlertTriangle,
  ChevronRight, BarChart3, ShieldCheck, ClipboardList, Activity,
  Clock, Users, Search, Filter, X, UserPlus
} from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { removeAccents } from "@/lib/searchUtils";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useMenuVisibility } from "@/hooks/useMenuVisibility";

export default function PainelSST() {
  const { user } = useAuth();
  const { hasGroup, groupCanAccessRoute, isAdminMaster } = usePermissions();
  const { isMenuItemVisible } = useMenuVisibility();
  const canSee = (route: string) => {
    if (!isMenuItemVisible(route)) return false;
    return isAdminMaster || !hasGroup || groupCanAccessRoute(route);
  };
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;

  const { data: homeData, isLoading } = trpc.home.getData.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId: queryCompanyId, limit: 6, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const s = homeData?.stats;
  const totalAlertasSST = (s?.asosVencidos ?? 0) + (s?.asosVencendo ?? 0) + (s?.semAso ?? 0);

  // Capacidade de Contratação
  const { data: capData } = trpc.epiAvancado.capacidadeContratacao.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const [showAlertasDialog, setShowAlertasDialog] = useState(false);
  const [alertFilter, setAlertFilter] = useState<string>("todos");
  const [alertSearch, setAlertSearch] = useState("");
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Build unified alerts list
  const allAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      employeeId: number;
      nome: string;
      funcao: string | null;
      tipo: string;
      tipoLabel: string;
      detalhe: string;
      urgencia: "critico" | "alerta" | "atencao";
      diasRestantes?: number;
    }> = [];

    // ASOs vencidos/vencendo
    (homeData?.asosAlerta || []).forEach((a: any) => {
      alerts.push({
        id: `aso-${a.employeeId}`,
        employeeId: a.employeeId,
        nome: a.nome,
        funcao: a.funcao,
        tipo: "aso",
        tipoLabel: a.vencido ? "ASO Vencido" : "ASO Vencendo",
        detalhe: a.vencido
          ? `Vencido há ${Math.abs(a.diasRestantes)} dia${Math.abs(a.diasRestantes) !== 1 ? "s" : ""} (${new Date(a.dataValidade + "T12:00:00").toLocaleDateString("pt-BR")})`
          : `Vence em ${a.diasRestantes} dia${a.diasRestantes !== 1 ? "s" : ""} (${new Date(a.dataValidade + "T12:00:00").toLocaleDateString("pt-BR")})`,
        urgencia: a.vencido ? "critico" : a.diasRestantes <= 15 ? "alerta" : "atencao",
        diasRestantes: a.diasRestantes,
      });
    });

    // Sem ASO
    (homeData?.semAso || []).forEach((e: any) => {
      alerts.push({
        id: `sem-aso-${e.id}`,
        employeeId: e.id,
        nome: e.nome,
        funcao: e.funcao,
        tipo: "sem_aso",
        tipoLabel: "Sem ASO",
        detalhe: "Nenhum ASO cadastrado no sistema",
        urgencia: "critico",
      });
    });

    // Advertencias recentes (segurança)
    (homeData?.advertenciasRecentes || []).forEach((a: any) => {
      alerts.push({
        id: `adv-${a.id}`,
        employeeId: a.employeeId,
        nome: a.nome,
        funcao: null,
        tipo: "advertencia",
        tipoLabel: `Advertência: ${a.tipo}`,
        detalhe: a.data ? `Ocorrência em ${new Date(a.data + "T12:00:00").toLocaleDateString("pt-BR")}` : "Data não informada",
        urgencia: "alerta",
      });
    });

    return alerts;
  }, [homeData]);

  const filteredAlerts = useMemo(() => {
    let list = allAlerts;
    if (alertFilter !== "todos") {
      if (alertFilter === "aso_vencido") list = list.filter(a => a.tipo === "aso" && a.urgencia === "critico");
      else if (alertFilter === "aso_vencendo") list = list.filter(a => a.tipo === "aso" && a.urgencia !== "critico");
      else if (alertFilter === "sem_aso") list = list.filter(a => a.tipo === "sem_aso");
      else if (alertFilter === "advertencia") list = list.filter(a => a.tipo === "advertencia");
    }
    if (alertSearch.trim()) {
      const term = removeAccents(alertSearch.toLowerCase());
      list = list.filter(a => removeAccents(a.nome.toLowerCase()).includes(term) || removeAccents(a.tipoLabel.toLowerCase()).includes(term));
    }
    return list;
  }, [allAlerts, alertFilter, alertSearch]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Shield className="h-4 w-4 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel SST</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Saúde e Segurança do Trabalho
            </p>
          </div>
          {totalAlertasSST > 0 ? (
            <button
              onClick={() => setShowAlertasDialog(true)}
              className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-100 hover:border-red-300 transition-colors cursor-pointer"
            >
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-semibold text-red-700">{totalAlertasSST} alerta{totalAlertasSST !== 1 ? "s" : ""} de SST</span>
            </button>
          ) : null}
        </div>

        {hasValidCompany ? (
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-24" /></Card>
              ))}
            </div>
          ) : (
            <>
              {/* KPI Cards - SST */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Indicadores de Segurança</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard title="ASOs Vencidos" value={s?.asosVencidos ?? 0} icon={FileWarning} color="red" onClick={() => navigate("/controle-documentos")} alert={!!s?.asosVencidos} />
                  <KpiCard title="ASOs Vencendo (60d)" value={s?.asosVencendo ?? 0} icon={HeartPulse} color="orange" onClick={() => navigate("/controle-documentos")} />
                  <KpiCard title="Sem ASO" value={s?.semAso ?? 0} icon={AlertTriangle} color="yellow" onClick={() => navigate("/controle-documentos")} />
                  {canSee('/colaboradores') && <KpiCard title="Total Colaboradores" value={s?.totalFuncionarios ?? 0} icon={Users} color="blue" onClick={() => navigate("/colaboradores")} />}
                </div>
              </div>

              {/* Card Capacidade de Contratação */}
              {capData && (
                <div>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Capacidade de Contratação (EPIs)</h2>
                  <Card
                    className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${
                      capData.capacidade >= 20 ? 'border-l-green-500' :
                      capData.capacidade >= 10 ? 'border-l-yellow-500' :
                      capData.capacidade >= 5 ? 'border-l-orange-500' : 'border-l-red-500'
                    }`}
                    onClick={() => navigate('/epis')}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            capData.capacidade >= 20 ? 'bg-green-50' :
                            capData.capacidade >= 10 ? 'bg-yellow-50' :
                            capData.capacidade >= 5 ? 'bg-orange-50' : 'bg-red-50'
                          }`}>
                            <UserPlus className={`h-5 w-5 ${
                              capData.capacidade >= 20 ? 'text-green-600' :
                              capData.capacidade >= 10 ? 'text-yellow-600' :
                              capData.capacidade >= 5 ? 'text-orange-600' : 'text-red-600'
                            }`} />
                          </div>
                          <div>
                            <p className={`text-3xl font-bold ${
                              capData.capacidade >= 20 ? 'text-green-600' :
                              capData.capacidade >= 10 ? 'text-yellow-600' :
                              capData.capacidade >= 5 ? 'text-orange-600' : 'text-red-600'
                            }`}>{capData.capacidade}</p>
                            <p className="text-xs text-muted-foreground">novos funcionários equipáveis</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className={`text-xs ${
                            capData.nivel === 'OTIMO' ? 'bg-green-100 text-green-800 border-green-300' :
                            capData.nivel === 'BOM' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                            capData.nivel === 'BAIXO' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                            'bg-red-100 text-red-800 border-red-300'
                          }`}>
                            {capData.nivel === 'OTIMO' ? 'ÓTIMO' : capData.nivel}
                          </Badge>
                          {capData.gargalo && (
                            <p className="text-[10px] text-muted-foreground mt-1 max-w-[140px]">
                              Gargalo: {capData.gargalo.nome}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ASOs com Alerta */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <HeartPulse className="h-4 w-4 text-red-500" />
                        ASOs - Atenção Necessária
                        {(s?.asosVencidos ?? 0) > 0 ? <Badge variant="destructive" className="text-[10px]">{s!.asosVencidos} vencido{s!.asosVencidos !== 1 ? "s" : ""}</Badge> : null}
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/controle-documentos")}>
                        Ver todos <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!homeData?.asosAlerta?.length && !homeData?.semAso?.length ? (
                      <div className="flex flex-col items-center py-6">
                        <ShieldCheck className="h-10 w-10 text-green-400 mb-2" />
                        <p className="text-sm font-medium text-green-600">Todos os ASOs estão em dia!</p>
                        <p className="text-xs text-muted-foreground">Nenhuma pendência encontrada</p>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {homeData?.asosAlerta?.slice(0, 10).map((a: any) => (
                          <div key={a.employeeId} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${a.vencido ? "bg-red-50 border border-red-200" : a.diasRestantes <= 15 ? "bg-orange-50" : ""}`}>
                            <span className="font-medium">{a.nome}</span>
                            <span className={`font-mono text-[10px] ${a.vencido ? "text-red-600 font-bold" : a.diasRestantes <= 15 ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
                              {a.vencido ? `Vencido há ${Math.abs(a.diasRestantes)}d` : `${a.diasRestantes}d restantes`}
                            </span>
                          </div>
                        ))}
                        {(homeData?.semAso?.length ?? 0) > 0 ? (
                          <div className="mt-2 pt-2 border-t">
                            <p className="text-[10px] text-red-600 font-semibold mb-1">{homeData!.semAso!.length} sem ASO cadastrado:</p>
                            {homeData!.semAso!.slice(0, 5).map((e: any) => <div key={e.id} className="text-xs text-muted-foreground pl-2">{e.nome}</div>)}
                            {homeData!.semAso!.length > 5 ? <div className="text-[10px] text-muted-foreground pl-2">e mais {homeData!.semAso!.length - 5}...</div> : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Advertências Recentes (disciplinar/segurança) */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Ocorrências de Segurança
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(homeData?.advertenciasRecentes?.length ?? 0) > 0 ? (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {homeData!.advertenciasRecentes!.map((a: any) => (
                          <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-accent/50">
                            <span className="font-medium">{a.nome}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                              <span className="text-muted-foreground text-[10px]">{a.data ? new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR") : ""}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma ocorrência recente</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Atividade Recente - apenas para admins */}
              {(isAdminMaster || user?.role === 'admin') && <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-500" />
                      Atividade Recente - SST
                    </CardTitle>
                  </div>
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
              </Card>}

              {/* Acesso Rápido SST - filtrado por permissões do grupo */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Acesso Rápido - SST</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "EPIs", icon: HardHat, path: "/epis", color: "text-emerald-600" },
                    { label: "ASOs / Documentos", icon: HeartPulse, path: "/controle-documentos", color: "text-red-600" },
                    { label: "CIPA", icon: ShieldCheck, path: "/cipa", color: "text-blue-600" },
                    { label: "Dashboards", icon: BarChart3, path: "/dashboards/epis", color: "text-purple-600" },
                  ].filter(item => canSee(item.path)).map(item => (
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
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel de SST.</p>
            </CardContent>
          </Card>
        )}
      </div>
      {/* FullScreen Dialog de Alertas SST */}
      <FullScreenDialog
        open={showAlertasDialog}
        onClose={() => setShowAlertasDialog(false)}
        title={`Alertas de SST (${allAlerts.length})`}
        subtitle="Saúde e Segurança do Trabalho — Todos os alertas ativos"
        icon={<AlertTriangle className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-red-700 to-red-900"
      >
        <div className="p-4 md:p-6 space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou tipo..."
                value={alertSearch}
                onChange={e => setAlertSearch(e.target.value)}
                className="pl-9"
              />
              {alertSearch && (
                <button onClick={() => setAlertSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={alertFilter} onValueChange={setAlertFilter}>
              <SelectTrigger className="w-full sm:w-52">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Alertas</SelectItem>
                <SelectItem value="aso_vencido">ASO Vencido</SelectItem>
                <SelectItem value="aso_vencendo">ASO Vencendo</SelectItem>
                <SelectItem value="sem_aso">Sem ASO</SelectItem>
                <SelectItem value="advertencia">Advertências</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="destructive" className="text-xs">
              {allAlerts.filter(a => a.urgencia === "critico").length} críticos
            </Badge>
            <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs">
              {allAlerts.filter(a => a.urgencia === "alerta").length} alertas
            </Badge>
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
              {allAlerts.filter(a => a.urgencia === "atencao").length} atenção
            </Badge>
            <span className="text-xs text-muted-foreground self-center ml-2">
              Exibindo {filteredAlerts.length} de {allAlerts.length}
            </span>
          </div>

          {/* Alerts table */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-3 text-left font-semibold text-xs">Funcionário</th>
                  <th className="p-3 text-left font-semibold text-xs hidden md:table-cell">Função</th>
                  <th className="p-3 text-left font-semibold text-xs">Tipo</th>
                  <th className="p-3 text-left font-semibold text-xs">Detalhe</th>
                  <th className="p-3 text-center font-semibold text-xs">Urgência</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>Nenhum alerta encontrado</p>
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map(alert => (
                    <tr key={alert.id} className={`border-t hover:bg-accent/30 ${
                      alert.urgencia === "critico" ? "bg-red-50/50" :
                      alert.urgencia === "alerta" ? "bg-orange-50/30" : ""
                    }`}>
                      <td className="p-3">
                        <button
                          className="font-medium text-blue-700 hover:underline text-left"
                          onClick={() => setRaioXEmployeeId(alert.employeeId)}
                        >
                          {alert.nome}
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">{alert.funcao || "-"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-[10px] md:text-xs whitespace-nowrap ${
                          alert.tipo === "aso" && alert.urgencia === "critico" ? "border-red-300 text-red-700 bg-red-50" :
                          alert.tipo === "sem_aso" ? "border-red-300 text-red-700 bg-red-50" :
                          alert.tipo === "aso" ? "border-orange-300 text-orange-700 bg-orange-50" :
                          "border-yellow-300 text-yellow-700 bg-yellow-50"
                        }`}>
                          {alert.tipoLabel}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{alert.detalhe}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block h-3 w-3 rounded-full ${
                          alert.urgencia === "critico" ? "bg-red-500" :
                          alert.urgencia === "alerta" ? "bg-orange-500" : "bg-yellow-500"
                        }`} title={alert.urgencia} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </FullScreenDialog>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// KPI Card
const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; text: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-l-blue-500", text: "text-blue-600" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-l-green-500", text: "text-green-600" },
  yellow: { bg: "bg-yellow-50", icon: "text-yellow-600", border: "border-l-yellow-500", text: "text-yellow-600" },
  red: { bg: "bg-red-50", icon: "text-red-600", border: "border-l-red-500", text: "text-red-600" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-l-orange-500", text: "text-orange-600" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", border: "border-l-emerald-500", text: "text-emerald-600" },
};

function KpiCard({ title, value, icon: Icon, color, onClick, alert }: {
  title: string; value: number; icon: any; color: string; onClick?: () => void; alert?: boolean;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <Card className={`border-l-4 ${c.border} hover:shadow-md transition-shadow cursor-pointer ${alert ? "ring-2 ring-red-300 animate-pulse" : ""}`} onClick={onClick}>
      <CardContent className="p-3 flex flex-col gap-2">
        <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}
