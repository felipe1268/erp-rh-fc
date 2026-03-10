import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { usePermissions } from "@/contexts/PermissionsContext";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Users, UserCheck, Palmtree, UserX, AlertTriangle, Clock,
  BarChart3, Landmark, Cake, FileWarning, CalendarClock,
  ArrowUpRight, ArrowDownRight, ShieldAlert, Activity,
  ChevronRight, HeartPulse, Briefcase, Scale, ExternalLink,
  Printer, Plane, DollarSign, ClipboardCheck, UserPlus, Ban, RefreshCw,
  Bell, FileText, CheckCircle2, XCircle, User, Calendar, TrendingDown, Info,
  BarChart2, ArrowRight, TrendingUp, Minus, GitCompareArrows
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime, nowBrasilia } from "@/lib/dateUtils";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useMenuVisibility } from "@/hooks/useMenuVisibility";

export default function PainelRH() {
  const { user } = useAuth();
  const { isAdminMaster, hasGroup, groupCanAccessRoute, groupOcultarValores, isSomenteVisualizacao, isOcultarDadosSensiveis } = usePermissions();
  const { isMenuItemVisible } = useMenuVisibility();
  // Flags de visibilidade baseadas no grupo + Painel de Controle do Menu
  const canSeeValues = isAdminMaster || !isOcultarDadosSensiveis;
  const canSeeAvisoPrevio = isMenuItemVisible('/aviso-previo') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/aviso-previo'));
  const canSeeFerias = isMenuItemVisible('/ferias') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/ferias'));
  const canSeeFolha = isMenuItemVisible('/folha-pagamento') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/folha-pagamento'));
  const canSeeColaboradores = isMenuItemVisible('/colaboradores') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/colaboradores'));
  const canSeeObras = isMenuItemVisible('/obras') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/obras'));
  const canSeeDocumentos = isMenuItemVisible('/controle-documentos') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/controle-documentos'));
  const canSeePonto = isMenuItemVisible('/fechamento-ponto') && (isAdminMaster || !hasGroup || groupCanAccessRoute('/fechamento-ponto'));
  const canSeeExperiencia = canSeeColaboradores;
  const canSeeAuditoria = isAdminMaster || user?.role === 'admin';
  const canEditExperiencia = isAdminMaster || !isSomenteVisualizacao;
  const [selectedAvisoId, setSelectedAvisoId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [expAction, setExpAction] = useState<{ type: 'prorrogar' | 'efetivar' | 'desligar'; emp: any } | null>(null);
  const [expMotivo, setExpMotivo] = useState('');
  const [expObs, setExpObs] = useState('');
  const utils = trpc.useUtils();
  const prorrogarMut = trpc.employees.prorrogarExperiencia.useMutation({
    onSuccess: () => { utils.home.getData.invalidate(); setExpAction(null); setExpObs(''); },
  });
  const efetivarMut = trpc.employees.efetivarExperiencia.useMutation({
    onSuccess: () => { utils.home.getData.invalidate(); setExpAction(null); setExpObs(''); },
  });
  const desligarMut = trpc.employees.desligarExperiencia.useMutation({
    onSuccess: () => { utils.home.getData.invalidate(); setExpAction(null); setExpMotivo(''); setExpObs(''); },
  });

  const { data: homeData, isLoading } = trpc.home.getData.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId: queryCompanyId, limit: 6, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );

  const s = homeData?.stats;
  const [alertaTab, setAlertaTab] = useState('todos');
  const totalAlertas = (s?.asosVencidos ?? 0) + (s?.asosVencendo ?? 0) + (s?.semAso ?? 0) + (s?.feriasAlerta ?? 0) + (s?.experienciasVencidas ?? 0) + (s?.experienciasUrgentes ?? 0) + (s?.avisosPreviosVencendo ?? 0);

  // Montar lista de alertas para o Dialog
  const alertasList: { id: string; tipo: string; titulo: string; descricao: string; urgencia: string; link: string }[] = [];
  if (homeData) {
    // ASOs vencidos
    (homeData.asosAlerta ?? []).filter((a: any) => a.vencido).forEach((a: any) => {
      alertasList.push({ id: `aso-v-${a.employeeId}`, tipo: 'aso', titulo: `ASO Vencido - ${a.nome}`, descricao: `Vencido há ${Math.abs(a.diasRestantes)} dias. Função: ${a.funcao || '-'}`, urgencia: 'critico', link: '/controle-documentos' });
    });
    // ASOs vencendo
    (homeData.asosAlerta ?? []).filter((a: any) => !a.vencido).forEach((a: any) => {
      alertasList.push({ id: `aso-e-${a.employeeId}`, tipo: 'aso', titulo: `ASO Vencendo - ${a.nome}`, descricao: `Vence em ${a.diasRestantes} dias. Função: ${a.funcao || '-'}`, urgencia: a.diasRestantes <= 15 ? 'urgente' : 'atencao', link: '/controle-documentos' });
    });
    // Sem ASO
    (homeData.semAso ?? []).forEach((e: any) => {
      alertasList.push({ id: `sem-aso-${e.id}`, tipo: 'aso', titulo: `Sem ASO - ${e.nome}`, descricao: `Funcionário sem ASO cadastrado. Função: ${e.funcao || '-'}`, urgencia: 'atencao', link: '/controle-documentos' });
    });
    // Férias vencendo
    (homeData.feriasAlerta ?? []).forEach((f: any) => {
      alertasList.push({ id: `ferias-${f.id}`, tipo: 'ferias', titulo: `Férias ${f.diasParaVencer <= 0 ? 'VENCIDAS' : 'Vencendo'} - ${f.nome}`, descricao: `${f.periodoAquisitivo}º período aquisitivo. ${f.diasParaVencer <= 0 ? 'Já venceu!' : `Vence em ${f.diasParaVencer} dias`}`, urgencia: f.diasParaVencer <= 0 ? 'critico' : f.urgente ? 'urgente' : 'atencao', link: '/ferias' });
    });
    // Experiências vencidas/urgentes
    (homeData.experiencias ?? []).filter((e: any) => e.urgencia === 'vencido' || e.urgencia === 'urgente').forEach((e: any) => {
      alertasList.push({ id: `exp-${e.id}`, tipo: 'experiencia', titulo: `Contrato Experiência ${e.urgencia === 'vencido' ? 'VENCIDO' : 'Urgente'} - ${e.nome}`, descricao: `Tipo: ${e.tipo}. ${e.urgencia === 'vencido' ? 'Prazo expirado!' : `${e.diasRestantes} dias restantes`}`, urgencia: e.urgencia === 'vencido' ? 'critico' : 'urgente', link: '/colaboradores' });
    });
    // Avisos prévios vencendo
    (homeData.avisosPrevios ?? []).filter((a: any) => a.urgencia === 'critico' || a.urgencia === 'vencido').forEach((a: any) => {
      alertasList.push({ id: `aviso-${a.id}`, tipo: 'aviso', titulo: `Aviso Prévio ${a.urgencia === 'vencido' ? 'VENCIDO' : 'Crítico'} - ${a.nome}`, descricao: `Tipo: ${a.tipo.replace(/_/g, ' ')}. ${a.diasRestantes <= 0 ? 'Prazo expirado!' : `${a.diasRestantes} dias restantes`}`, urgencia: 'critico', link: '/aviso-previo' });
    });
  }
  // Ordenar por urgência
  const urgOrder: Record<string, number> = { critico: 0, urgente: 1, atencao: 2 };
  alertasList.sort((a, b) => (urgOrder[a.urgencia] ?? 3) - (urgOrder[b.urgencia] ?? 3));
  const filteredAlertas = alertaTab === 'todos' ? alertasList : alertasList.filter(a => a.tipo === alertaTab);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel RH & DP</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Recursos Humanos e Departamento Pessoal
            </p>
          </div>
          {totalAlertas > 0 ? (
            <button
              onClick={() => setAlertasOpen(true)}
              className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-100 hover:border-red-300 transition-colors cursor-pointer"
            >
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <span className="text-sm font-semibold text-red-700">{totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""}</span>
              <ChevronRight className="h-4 w-4 text-red-400" />
            </button>
          ) : null}
        </div>

        {hasValidCompany ? (
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-24" /></Card>
              ))}
            </div>
          ) : (
            <>
              {/* KPI Cards - Colaboradores */}
              {canSeeColaboradores && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quadro de Pessoal</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <KpiCard title="Ativos" value={s?.ativos ?? 0} icon={UserCheck} color="green" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Férias" value={s?.ferias ?? 0} icon={Palmtree} color="cyan" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Afastados" value={s?.afastados ?? 0} icon={AlertTriangle} color="yellow" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Licença" value={s?.licenca ?? 0} icon={UserX} color="purple" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Desligados" value={s?.desligados ?? 0} icon={UserX} color="red" onClick={() => navigate("/colaboradores")} />
                </div>
              </div>
              )}

              {/* KPI Cards - Operacional RH */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Indicadores RH</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {canSeeObras && <KpiCard title="Obras Ativas" value={s?.obrasAtivas ?? 0} icon={Landmark} color="teal" onClick={() => navigate("/obras")} />}
                  {canSeeDocumentos && <KpiCard title="ASOs Vencidos" value={s?.asosVencidos ?? 0} icon={FileWarning} color="red" onClick={() => navigate("/controle-documentos")} alert={!!s?.asosVencidos} />}
                  {canSeeDocumentos && <KpiCard title="ASOs Vencendo (60d)" value={s?.asosVencendo ?? 0} icon={HeartPulse} color="orange" onClick={() => navigate("/controle-documentos")} />}
                  {canSeeFerias && <KpiCard title="Férias a Vencer" value={s?.feriasAlerta ?? 0} icon={CalendarClock} color="yellow" onClick={() => navigate("/ferias")} />}
                </div>
              </div>

              {/* Contratos de Experiência */}
              {canSeeExperiencia && (homeData?.experiencias?.length ?? 0) > 0 ? (
                <Card className="border-2 border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-orange-600" />
                        Contratos de Experiência
                        {(s?.experienciasVencidas ?? 0) > 0 ? <Badge variant="destructive" className="text-[10px] animate-pulse">{s!.experienciasVencidas} vencido{s!.experienciasVencidas !== 1 ? 's' : ''}!</Badge> : null}
                        {(s?.experienciasUrgentes ?? 0) > 0 ? <Badge className="bg-orange-100 text-orange-700 text-[10px]">{s!.experienciasUrgentes} urgente{s!.experienciasUrgentes !== 1 ? 's' : ''}</Badge> : null}
                        <Badge variant="secondary" className="text-[10px]">{s?.experienciasTotal ?? 0} total</Badge>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {homeData!.experiencias.map((exp: any) => {
                        const urgColors: Record<string, string> = { vencido: 'bg-red-100 border-red-300', urgente: 'bg-orange-100 border-orange-300', atencao: 'bg-yellow-50 border-yellow-200', normal: 'bg-white border-gray-200' };
                        const urgTextColors: Record<string, string> = { vencido: 'text-red-700 font-bold', urgente: 'text-orange-700 font-bold', atencao: 'text-yellow-700 font-semibold', normal: 'text-muted-foreground' };
                        return (
                          <div key={exp.id} className={`flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2.5 rounded-lg border ${urgColors[exp.urgencia] || urgColors.normal} gap-2`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{exp.nome}</span>
                                <Badge variant="outline" className="text-[10px]">{exp.funcao || '-'}</Badge>
                                <Badge className={`text-[10px] ${exp.status === 'prorrogado' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {exp.status === 'prorrogado' ? '2º período' : '1º período'}
                                </Badge>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {exp.tipo === '30_30' ? '30+30' : '45+45'} dias · Início: {new Date(exp.inicio + 'T12:00:00').toLocaleDateString('pt-BR')} · Fim 1º: {new Date(exp.fim1 + 'T12:00:00').toLocaleDateString('pt-BR')} · Fim 2º: {new Date(exp.fim2 + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-mono ${urgTextColors[exp.urgencia] || ''}`}>
                                {exp.diasRestantes < 0 ? `Vencido há ${Math.abs(exp.diasRestantes)}d` : exp.diasRestantes === 0 ? 'VENCE HOJE' : `${exp.diasRestantes}d restantes`}
                              </span>
                              {canEditExperiencia && (<>
                              {exp.status === 'em_experiencia' ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => { setExpAction({ type: 'prorrogar', emp: exp }); setExpObs(''); }}>
                                  <RefreshCw className="h-3 w-3" /> Prorrogar
                                </Button>
                              ) : null}
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setExpAction({ type: 'efetivar', emp: exp }); setExpObs(''); }}>
                                <UserPlus className="h-3 w-3" /> Efetivar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setExpAction({ type: 'desligar', emp: exp }); setExpMotivo(''); setExpObs(''); }}>
                                <Ban className="h-3 w-3" /> Desligar
                              </Button>
                              </>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Dialog de Ação de Experiência */}
              <Dialog open={!!expAction} onOpenChange={v => !v && setExpAction(null)}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {expAction?.type === 'prorrogar' ? <><RefreshCw className="h-5 w-5 text-blue-600" /> Prorrogar Experiência</> : null}
                      {expAction?.type === 'efetivar' ? <><UserPlus className="h-5 w-5 text-green-600" /> Efetivar Colaborador</> : null}
                      {expAction?.type === 'desligar' ? <><Ban className="h-5 w-5 text-red-600" /> Desligar na Experiência</> : null}
                    </DialogTitle>
                  </DialogHeader>
                  {expAction ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm font-semibold">{expAction.emp.nome}</p>
                        <p className="text-xs text-muted-foreground">{expAction.emp.funcao} · {expAction.emp.tipo === '30_30' ? '30+30' : '45+45'} dias · {expAction.emp.status === 'prorrogado' ? '2º período' : '1º período'}</p>
                      </div>
                      {expAction.type === 'desligar' ? (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Motivo do desligamento *</label>
                          <Textarea value={expMotivo} onChange={e => setExpMotivo(e.target.value)} placeholder="Descreva o motivo..." className="mt-1" rows={3} />
                        </div>
                      ) : null}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Observações (opcional)</label>
                        <Textarea value={expObs} onChange={e => setExpObs(e.target.value)} placeholder="Observações adicionais..." className="mt-1" rows={2} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setExpAction(null)}>Cancelar</Button>
                        {expAction.type === 'prorrogar' ? <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={prorrogarMut.isPending} onClick={() => prorrogarMut.mutate({ employeeId: expAction.emp.id, companyId: companyId!, obs: expObs || undefined })}>{prorrogarMut.isPending ? 'Prorrogando...' : 'Confirmar Prorrogação'}</Button> : null}
                        {expAction.type === 'efetivar' ? <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={efetivarMut.isPending} onClick={() => efetivarMut.mutate({ employeeId: expAction.emp.id, companyId: companyId!, obs: expObs || undefined })}>{efetivarMut.isPending ? 'Efetivando...' : 'Confirmar Efetivação'}</Button> : null}
                        {expAction.type === 'desligar' ? <Button variant="destructive" disabled={desligarMut.isPending || !expMotivo.trim()} onClick={() => desligarMut.mutate({ employeeId: expAction.emp.id, companyId: companyId!, motivo: expMotivo, obs: expObs || undefined })}>{desligarMut.isPending ? 'Desligando...' : 'Confirmar Desligamento'}</Button> : null}
                      </div>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>

              {/* Card de Avisos Prévios em Andamento */}
              {canSeeAvisoPrevio && (homeData?.avisosPrevios?.length ?? 0) > 0 && (() => {
                const avisosValidos = homeData!.avisosPrevios.filter((a: any) => a.nome && a.nome !== 'Funcionário' && a.nome !== 'Funcionário excluído');
                const totalValorEstimado = homeData!.avisosPrevios.reduce((acc: number, a: any) => acc + (parseFloat(a.valorEstimado) || 0), 0);
                return avisosValidos.length > 0 && (
                <Card className="border-2 border-red-300 bg-gradient-to-r from-red-50 to-orange-50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-600" />
                        Avisos Prévios em Andamento
                        <Badge variant="destructive" className="text-[10px]">{avisosValidos.length} ativo{avisosValidos.length !== 1 ? 's' : ''}</Badge>
                        {(s?.avisosPreviosVencendo ?? 0) > 0 && <Badge className="bg-red-600 text-white text-[10px] animate-pulse">{s!.avisosPreviosVencendo} vencendo!</Badge>}
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate('/aviso-previo')}>Ver todos <ChevronRight className="h-3 w-3 ml-1" /></Button>
                    </div>
                    {canSeeValues && totalValorEstimado > 0 && (
                      <div className="mt-2 flex items-center gap-2 bg-red-100/60 rounded-lg px-3 py-2">
                        <DollarSign className="h-4 w-4 text-red-600" />
                        <span className="text-xs text-red-700">Valor total estimado:</span>
                        <span className="text-sm font-bold text-red-700">R$ {totalValorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {avisosValidos.map((a: any) => {
                        const tipoLabel = a.tipo === 'empregador_trabalhado' ? 'Emp. Trabalhado' : a.tipo === 'empregador_indenizado' ? 'Emp. Indenizado' : a.tipo === 'empregado_trabalhado' ? 'Ped. Trabalhado' : 'Ped. Indenizado';
                        return (
                          <div key={a.id} onClick={() => setSelectedAvisoId(a.id)} className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                            a.urgencia === 'vencido' ? 'bg-red-100 border-red-300 animate-pulse' :
                            a.urgencia === 'critico' ? 'bg-red-50 border-red-200' :
                            a.urgencia === 'urgente' ? 'bg-orange-50 border-orange-200' :
                            'bg-white border-gray-200'
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-foreground">{a.nome}</span>
                              <Badge className={`text-[9px] ${
                                a.urgencia === 'vencido' ? 'bg-red-600 text-white' :
                                a.urgencia === 'critico' ? 'bg-red-500 text-white' :
                                a.urgencia === 'urgente' ? 'bg-orange-500 text-white' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {a.diasRestantes <= 0 ? 'VENCIDO!' : `${a.diasRestantes}d restantes`}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{a.funcao} · {tipoLabel}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-muted-foreground">Término: {new Date(a.dataFim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              {canSeeValues && a.valorEstimado && <span className="text-[10px] font-bold text-red-600">R$ {parseFloat(a.valorEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );})()}

              {/* Dialog de Cálculos da Rescisão */}
              <AvisoRescisaoDialog avisoId={selectedAvisoId} onClose={() => setSelectedAvisoId(null)} />

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Coluna 1: Aniversariantes + Férias Painel */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Cake className="h-4 w-4 text-pink-500" />
                        Aniversariantes do Mês
                        {s?.aniversariantesHoje ? <Badge className="bg-pink-100 text-pink-700 text-[10px]">{s.aniversariantesHoje} hoje!</Badge> : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.aniversariantes?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum aniversariante este mês</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {homeData.aniversariantes.map((a: any) => (
                            <div key={a.id} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-accent/50 ${a.isHoje ? "bg-pink-50 border border-pink-200" : ""}`} onClick={() => navigate("/colaboradores")}>
                              <div className="flex items-center gap-2">
                                {a.isHoje ? <span className="text-base">🎂</span> : null}
                                <div>
                                  <span className="font-medium">{a.nome}</span>
                                  {a.funcao ? <span className="text-muted-foreground ml-1">({a.funcao})</span> : null}
                                </div>
                              </div>
                              <span className={`font-mono ${a.isHoje ? "font-bold text-pink-600" : a.jaPassou ? "text-muted-foreground line-through" : ""}`}>Dia {a.dia}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Férias Painel Rápido */}
                  {canSeeFerias && <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Plane className="h-4 w-4 text-blue-500" />
                        Férias - Painel Rápido
                        {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 ? <Badge className="bg-blue-100 text-blue-700 text-[10px]">{homeData!.feriasDashboard.emAndamento.length} em gozo</Badge> : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 ? (
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
                      ) : null}
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
                        (homeData?.feriasDashboard?.emAndamento?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground">Nenhuma férias agendada nos próximos 60 dias</p> : null
                      )}
                      {canSeeValues && (homeData?.feriasDashboard?.custoProximo90Dias ?? 0) > 0 ? (
                        <div className="mt-2 pt-2 border-t flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Custo próx. 90 dias</span>
                          <span className="text-xs font-bold text-orange-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(homeData!.feriasDashboard.custoProximo90Dias)}</span>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>}
                </div>

                {/* Coluna 2: ASOs + Férias Período Aquisitivo */}
                <div className="space-y-4">
                  {canSeeDocumentos && <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <HeartPulse className="h-4 w-4 text-red-500" />
                          ASOs - Atenção Necessária
                          {(s?.asosVencidos ?? 0) > 0 ? <Badge variant="destructive" className="text-[10px]">{s!.asosVencidos} vencido{s!.asosVencidos !== 1 ? "s" : ""}</Badge> : null}
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/controle-documentos")}>Ver todos <ChevronRight className="h-3 w-3 ml-1" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.asosAlerta?.length && !homeData?.semAso?.length ? (
                        <p className="text-xs text-muted-foreground">Todos os ASOs estão em dia</p>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {homeData?.asosAlerta?.slice(0, 8).map((a: any) => (
                            <div key={a.employeeId} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${a.vencido ? "bg-red-50 border border-red-200" : a.diasRestantes <= 15 ? "bg-orange-50" : ""}`}>
                              <span className="font-medium">{a.nome}</span>
                              <span className={`font-mono text-[10px] ${a.vencido ? "text-red-600 font-bold" : a.diasRestantes <= 15 ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
                                {a.vencido ? `Vencido há ${Math.abs(a.diasRestantes)}d` : `${a.diasRestantes}d restantes`}
                              </span>
                            </div>
                          ))}
                          {(homeData?.semAso?.length ?? 0) > 0 ? (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-[10px] text-red-600 font-semibold mb-1">{homeData!.semAso!.length} funcionário{homeData!.semAso!.length !== 1 ? "s" : ""} sem ASO:</p>
                              {homeData!.semAso!.slice(0, 3).map((e: any) => <div key={e.id} className="text-xs text-muted-foreground pl-2">{e.nome}</div>)}
                              {homeData!.semAso!.length > 3 ? <div className="text-[10px] text-muted-foreground pl-2">e mais {homeData!.semAso!.length - 3}...</div> : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>}

                  {canSeeFerias && <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-amber-500" />
                        Férias - Período Aquisitivo
                        {(s?.feriasAlerta ?? 0) > 0 ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">{s!.feriasAlerta} pendente{s!.feriasAlerta !== 1 ? "s" : ""}</Badge> : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.feriasAlerta?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum alerta de férias no momento</p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {homeData.feriasAlerta.slice(0, 6).map((f: any) => (
                            <div key={f.id} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${f.urgente ? "bg-amber-50 border border-amber-200" : ""}`}>
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
                  </Card>}
                </div>

                {/* Coluna 3: Movimentações + Atividade + Advertências */}
                <div className="space-y-4">
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
                          {homeData.movimentacoes.slice(0, 6).map((m: any, i: number) => (
                            <div key={`${m.tipo}-${m.id}-${i}`} className="flex items-center gap-2 text-xs">
                              {m.tipo === "admissao" ? <ArrowUpRight className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate block">{m.nome}</span>
                                <span className="text-muted-foreground text-[10px]">{m.funcao} · {new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
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

                  {canSeeAuditoria && <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          Atividade Recente
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/auditoria")}>Ver tudo <ChevronRight className="h-3 w-3 ml-1" /></Button>
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
                                <p className="text-[10px] text-muted-foreground">{log.userName} · {formatDateTime(log.createdAt)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>}

                  {(homeData?.advertenciasRecentes?.length ?? 0) > 0 ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-orange-500" />
                          Advertências Recentes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {homeData!.advertenciasRecentes!.map((a: any) => (
                            <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-accent/50">
                              <span className="font-medium">{a.nome}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                                <span className="text-muted-foreground text-[10px]">{a.data ? new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR") : ""}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>

              {/* Acesso Rápido */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Acesso Rápido</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {[
                    { label: "Colaboradores", icon: Users, path: "/colaboradores", color: "text-blue-600", show: canSeeColaboradores },
                    { label: "Obras", icon: Landmark, path: "/obras", color: "text-teal-600", show: canSeeObras },
                    { label: "Fechamento Ponto", icon: Clock, path: "/fechamento-ponto", color: "text-indigo-600", show: canSeePonto },
                    { label: "Folha Pagamento", icon: Briefcase, path: "/folha-pagamento", color: "text-emerald-600", show: canSeeFolha },
                    { label: "Documentos", icon: FileWarning, path: "/controle-documentos", color: "text-amber-600", show: canSeeDocumentos },
                    { label: "Dashboards", icon: BarChart3, path: "/dashboards", color: "text-purple-600", show: true },
                  ].filter(item => item.show).map(item => (
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
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecione uma empresa</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">Selecione uma empresa no seletor acima para visualizar o painel de RH.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== DIALOG DE ALERTAS ===== */}
      <Dialog open={alertasOpen} onOpenChange={setAlertasOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-600" />
              Central de Alertas
              <Badge variant="destructive" className="text-xs">{alertasList.length}</Badge>
            </DialogTitle>
          </DialogHeader>
          <Tabs value={alertaTab} onValueChange={setAlertaTab}>
            <TabsList className="w-full">
              <TabsTrigger value="todos" className="flex-1 text-xs">Todos ({alertasList.length})</TabsTrigger>
              <TabsTrigger value="aso" className="flex-1 text-xs">ASOs ({alertasList.filter(a => a.tipo === 'aso').length})</TabsTrigger>
              <TabsTrigger value="ferias" className="flex-1 text-xs">Férias ({alertasList.filter(a => a.tipo === 'ferias').length})</TabsTrigger>
              <TabsTrigger value="experiencia" className="flex-1 text-xs">Experiência ({alertasList.filter(a => a.tipo === 'experiencia').length})</TabsTrigger>
              <TabsTrigger value="aviso" className="flex-1 text-xs">Avisos ({alertasList.filter(a => a.tipo === 'aviso').length})</TabsTrigger>
            </TabsList>
            <TabsContent value={alertaTab} className="mt-3">
              <ScrollArea className="h-[55vh]">
                {filteredAlertas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mb-3 text-green-500" />
                    <p className="text-sm font-medium">Nenhum alerta nesta categoria</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-3">
                    {filteredAlertas.map(alerta => (
                      <div
                        key={alerta.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${
                          alerta.urgencia === 'critico' ? 'bg-red-50 border-red-200 hover:border-red-300' :
                          alerta.urgencia === 'urgente' ? 'bg-orange-50 border-orange-200 hover:border-orange-300' :
                          'bg-amber-50 border-amber-200 hover:border-amber-300'
                        }`}
                        onClick={() => { navigate(alerta.link); setAlertasOpen(false); }}
                      >
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          alerta.urgencia === 'critico' ? 'bg-red-100' :
                          alerta.urgencia === 'urgente' ? 'bg-orange-100' :
                          'bg-amber-100'
                        }`}>
                          {alerta.tipo === 'aso' ? <HeartPulse className={`h-4 w-4 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} /> :
                           alerta.tipo === 'ferias' ? <CalendarClock className={`h-4 w-4 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} /> :
                           alerta.tipo === 'experiencia' ? <ClipboardCheck className={`h-4 w-4 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} /> :
                           <FileText className={`h-4 w-4 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{alerta.titulo}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{alerta.descricao}</p>
                        </div>
                        <Badge className={`text-[10px] shrink-0 ${
                          alerta.urgencia === 'critico' ? 'bg-red-600 text-white' :
                          alerta.urgencia === 'urgente' ? 'bg-orange-500 text-white' :
                          'bg-amber-500 text-white'
                        }`}>
                          {alerta.urgencia === 'critico' ? 'CRÍTICO' : alerta.urgencia === 'urgente' ? 'URGENTE' : 'ATENÇÃO'}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// KPI Card Component
const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; text: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-l-blue-500", text: "text-blue-600" },
  green: { bg: "bg-green-50", icon: "text-green-600", border: "border-l-green-500", text: "text-green-600" },
  cyan: { bg: "bg-cyan-50", icon: "text-cyan-600", border: "border-l-cyan-500", text: "text-cyan-600" },
  yellow: { bg: "bg-yellow-50", icon: "text-yellow-600", border: "border-l-yellow-500", text: "text-yellow-600" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", border: "border-l-purple-500", text: "text-purple-600" },
  red: { bg: "bg-red-50", icon: "text-red-600", border: "border-l-red-500", text: "text-red-600" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-l-teal-500", text: "text-teal-600" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-l-orange-500", text: "text-orange-600" },
};

function KpiCard({ title, value, icon: Icon, color, onClick, badge, badgeColor, alert }: {
  title: string; value: number; icon: any; color: string; onClick?: () => void; badge?: string; badgeColor?: string; alert?: boolean;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <Card className={`border-l-4 ${c.border} hover:shadow-md transition-shadow cursor-pointer ${alert ? "ring-2 ring-red-300 animate-pulse" : ""}`} onClick={onClick}>
      <CardContent className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-4 w-4 ${c.icon}`} />
          </div>
          {badge ? <Badge className={`text-[9px] ${badgeColor === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{badge}</Badge> : null}
        </div>
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}


function AvisoRescisaoDialog({ avisoId, onClose }: { avisoId: number | null; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'detalhes' | 'comparativo'>('detalhes');
  const { data: aviso, isLoading } = trpc.avisoPrevio.avisoPrevio.getById.useQuery(
    { id: avisoId! },
    { enabled: !!avisoId }
  );

  // Comparativo query - uses employeeId and dataInicio from the aviso
  const { data: comparativo, isLoading: isLoadingComp } = trpc.avisoPrevio.avisoPrevio.comparativo.useQuery(
    { employeeId: aviso?.employeeId!, dataDesligamento: aviso?.dataInicio! },
    { enabled: !!aviso?.employeeId && !!aviso?.dataInicio && activeTab === 'comparativo' }
  );

  const fmt = (v: string | number | null | undefined) => {
    const num = parseFloat(String(v || '0'));
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '-';
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  const previsao = aviso?.previsaoRescisao ? (() => {
    try { return JSON.parse(aviso.previsaoRescisao); } catch { return null; }
  })() : null;

  const tipoLabel = (t: string) => {
    if (t === 'empregador_trabalhado') return 'Empregador (Trabalhado)';
    if (t === 'empregador_indenizado') return 'Empregador (Indenizado)';
    if (t === 'empregado_trabalhado') return 'Pedido pelo Empregado (Trabalhado)';
    return 'Pedido pelo Empregado (Indenizado)';
  };

  const reducaoLabel = (r: string | null) => {
    if (r === '2h_dia') return 'Redução de 2h/dia (Art. 488 CLT)';
    if (r === '7_dias_corridos') return '7 dias corridos (Art. 488 CLT)';
    return 'Nenhuma';
  };

  // Build proventos rows
  const proventos: { label: string; value: string }[] = [];
  const descontos: { label: string; value: string }[] = [];
  if (previsao) {
    if (parseFloat(previsao.saldoSalario || '0') > 0)
      proventos.push({ label: `Saldo de Salário (${previsao.diasTrabalhadosMes || '?'} dias)`, value: previsao.saldoSalario });
    if (parseFloat(previsao.feriasProporcional || '0') > 0)
      proventos.push({ label: `Férias Proporcionais (${previsao.mesesFerias || '?'}/12 avos)`, value: previsao.feriasProporcional });
    if (parseFloat(previsao.tercoConstitucional || '0') > 0)
      proventos.push({ label: '1/3 Constitucional (Férias Proporcionais)', value: previsao.tercoConstitucional });
    if (parseFloat(previsao.feriasVencidas || '0') > 0)
      proventos.push({ label: `Férias Vencidas${previsao.periodosVencidos ? ` (${previsao.periodosVencidos} período${previsao.periodosVencidos > 1 ? 's' : ''})` : ''}`, value: previsao.feriasVencidas });
    if (parseFloat(previsao.tercoFeriasVencidas || '0') > 0)
      proventos.push({ label: '1/3 Constitucional (Férias Vencidas)', value: previsao.tercoFeriasVencidas });
    if (parseFloat(previsao.decimoTerceiroProporcional || previsao.decimoTerceiro || '0') > 0)
      proventos.push({ label: `13º Salário Proporcional (${previsao.meses13o || previsao.meses13 || '?'}/12 avos)`, value: previsao.decimoTerceiroProporcional || previsao.decimoTerceiro });
    if (parseFloat(previsao.avisoPrevioIndenizado || '0') > 0)
      proventos.push({ label: `Aviso Prévio Indenizado (${previsao.diasAvisoTotal || previsao.diasExtrasAviso || '?'} dias)`, value: previsao.avisoPrevioIndenizado });
    if (parseFloat(previsao.multaFGTS || '0') > 0)
      proventos.push({ label: 'Multa 40% FGTS', value: previsao.multaFGTS });
    if (parseFloat(previsao.vrProporcional || '0') > 0)
      proventos.push({ label: `VR/VA Proporcional (${previsao.diasTrabalhadosMes || '?'} dias × R$ ${fmt(previsao.vrDiario)})`, value: previsao.vrProporcional });
    // Descontos
    if (parseFloat(previsao.inssDesconto || '0') > 0)
      descontos.push({ label: `INSS${previsao.inssFaixa ? ` (${previsao.inssFaixa})` : ''}`, value: previsao.inssDesconto });
    if (parseFloat(previsao.irrfDesconto || '0') > 0)
      descontos.push({ label: `IRRF${previsao.irrfFaixa ? ` (${previsao.irrfFaixa})` : ''}`, value: previsao.irrfDesconto });
    if (parseFloat(previsao.adiantamentoDesconto || '0') > 0)
      descontos.push({ label: 'Adiantamento Salarial', value: previsao.adiantamentoDesconto });
  }

  const totalProventos = proventos.reduce((s, r) => s + parseFloat(r.value || '0'), 0);
  const totalDescontos = descontos.reduce((s, r) => s + parseFloat(r.value || '0'), 0);

  // Helper to build proventos list from a previsao object (for comparativo)
  const buildProventosFromPrevisao = (prev: any) => {
    const items: { label: string; value: string }[] = [];
    if (parseFloat(prev.saldoSalario || '0') > 0)
      items.push({ label: `Saldo de Salário (${prev.diasTrabalhadosMes || '?'}d)`, value: prev.saldoSalario });
    if (parseFloat(prev.feriasProporcional || '0') > 0)
      items.push({ label: `Férias Prop. (${prev.mesesFerias}/12)`, value: prev.feriasProporcional });
    if (parseFloat(prev.tercoConstitucional || '0') > 0)
      items.push({ label: '1/3 Constitucional', value: prev.tercoConstitucional });
    if (parseFloat(prev.feriasVencidas || '0') > 0)
      items.push({ label: 'Férias Vencidas', value: prev.feriasVencidas });
    if (parseFloat(prev.decimoTerceiroProporcional || '0') > 0)
      items.push({ label: `13º Prop. (${prev.meses13o}/12)`, value: prev.decimoTerceiroProporcional });
    if (parseFloat(prev.avisoPrevioIndenizado || '0') > 0)
      items.push({ label: `Aviso Indenizado (${prev.diasAvisoTotal || prev.diasExtrasAviso || '?'}d)`, value: prev.avisoPrevioIndenizado });
    if (parseFloat(prev.multaFGTS || '0') > 0)
      items.push({ label: 'Multa 40% FGTS', value: prev.multaFGTS });
    if (parseFloat(prev.vrProporcional || '0') > 0)
      items.push({ label: 'VR/VA Proporcional', value: prev.vrProporcional });
    return items;
  };

  const employeeName = (aviso as any)?.employeeName || 'Funcionário';
  const employeeCargo = (aviso as any)?.employeeCargo || '';
  const employeeCpf = (aviso as any)?.employeeCpf || '';

  return (
    <FullScreenDialog
      open={!!avisoId}
      onClose={onClose}
      title={isLoading ? 'Carregando...' : `${employeeName} — Cálculos da Rescisão`}
      subtitle={isLoading ? '' : [employeeCargo, employeeCpf && employeeCpf !== '-' ? `CPF: ${employeeCpf}` : ''].filter(Boolean).join(' • ')}
      icon={<Scale className="h-5 w-5 text-white" />}
      headerColor="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a]"
    >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
          </div>
        ) : !aviso ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Aviso prévio não encontrado.</p>
          </div>
        ) : (
          <>
            {/* Tabs: Detalhes | Comparativo */}
            <div className="border-b mb-4">
              <div className="flex gap-0">
                <button
                  onClick={() => setActiveTab('detalhes')}
                  className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === 'detalhes'
                      ? 'border-[#1B2A4A] text-[#1B2A4A]'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Scale className="h-4 w-4 inline mr-2" />
                  Detalhes da Rescisão
                </button>
                <button
                  onClick={() => setActiveTab('comparativo')}
                  className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === 'comparativo'
                      ? 'border-[#1B2A4A] text-[#1B2A4A]'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <GitCompareArrows className="h-4 w-4 inline mr-2" />
                  Comparativo: Trabalhado vs Indenizado
                </button>
              </div>
            </div>

            {/* Tab: Detalhes */}
            {activeTab === 'detalhes' && (
            <div className="space-y-6">
              {/* Dados do Aviso Prévio */}
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" /> Dados do Aviso Prévio
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3 bg-gray-50 rounded-lg p-4 border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Tipo</p>
                    <p className="text-sm font-semibold">{tipoLabel(aviso.tipo)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Redução de Jornada</p>
                    <p className="text-sm font-semibold">{reducaoLabel(aviso.reducaoJornada)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Salário Base</p>
                    <p className="text-sm font-bold text-blue-700">R$ {fmt(aviso.salarioBase)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Início do Aviso</p>
                    <p className="text-sm font-semibold">{fmtDate(aviso.dataInicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Término do Aviso</p>
                    <p className="text-sm font-semibold">{fmtDate(aviso.dataFim)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Dias de Aviso</p>
                    <p className="text-sm font-semibold">{aviso.diasAviso} dias</p>
                  </div>
                  {previsao?.dataAdmissao && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">Data Admissão</p>
                      <p className="text-sm font-semibold">{fmtDate(previsao.dataAdmissao)}</p>
                    </div>
                  )}
                  {previsao?.anosServico !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">Tempo de Serviço</p>
                      <p className="text-sm font-semibold">
                        {(() => {
                          const anos = previsao.anosServico || 0;
                          const mesesServico = previsao.mesesServico || previsao.mesesTotais || 0;
                          const mesesResto = mesesServico % 12;
                          if (anos === 0 && mesesResto === 0) {
                            // Calcular a partir das datas se disponíveis
                            if (previsao.dataAdmissao && previsao.dataSaida) {
                              const adm = new Date(previsao.dataAdmissao + 'T00:00:00');
                              const saida = new Date(previsao.dataSaida + 'T00:00:00');
                              const diffMs = saida.getTime() - adm.getTime();
                              const totalMeses = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
                              const a = Math.floor(totalMeses / 12);
                              const m = totalMeses % 12;
                              if (a > 0 && m > 0) return `${a} ano${a > 1 ? 's' : ''} e ${m} ${m > 1 ? 'meses' : 'mês'}`;
                              if (a > 0) return `${a} ano${a > 1 ? 's' : ''}`;
                              if (m > 0) return `${m} ${m > 1 ? 'meses' : 'mês'}`;
                              return 'Menos de 1 mês';
                            }
                            return 'Menos de 1 mês';
                          }
                          if (anos > 0 && mesesResto > 0) return `${anos} ano${anos > 1 ? 's' : ''} e ${mesesResto} ${mesesResto > 1 ? 'meses' : 'mês'}`;
                          if (anos > 0) return `${anos} ano${anos > 1 ? 's' : ''}`;
                          return `${mesesResto} ${mesesResto > 1 ? 'meses' : 'mês'}`;
                        })()}
                      </p>
                    </div>
                  )}
                  {previsao?.dataSaida && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">Data de Saída</p>
                      <p className="text-sm font-semibold">{fmtDate(previsao.dataSaida)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Proventos e Descontos lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Verbas Rescisórias (Proventos) */}
                {proventos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Verbas Rescisórias (Proventos)
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {proventos.map((row, i) => (
                            <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-foreground">{row.label}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-green-700 whitespace-nowrap">R$ {fmt(row.value)}</td>
                            </tr>
                          ))}
                          <tr className="bg-green-50 font-bold">
                            <td className="px-4 py-2.5 text-green-800">SUBTOTAL PROVENTOS</td>
                            <td className="px-4 py-2.5 text-right text-green-800 whitespace-nowrap">R$ {fmt(totalProventos)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Descontos */}
                <div>
                  {descontos.length > 0 ? (
                    <>
                      <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <TrendingDown className="h-4 w-4" /> Descontos
                      </h3>
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <tbody>
                            {descontos.map((row, i) => (
                              <tr key={i} className="border-b last:border-b-0 hover:bg-red-50/50">
                                <td className="px-4 py-2.5 text-foreground">{row.label}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-red-600 whitespace-nowrap">- R$ {fmt(row.value)}</td>
                              </tr>
                            ))}
                            <tr className="bg-red-50 font-bold">
                              <td className="px-4 py-2.5 text-red-800">SUBTOTAL DESCONTOS</td>
                              <td className="px-4 py-2.5 text-right text-red-800 whitespace-nowrap">- R$ {fmt(totalDescontos)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <TrendingDown className="h-4 w-4" /> Descontos
                      </h3>
                      <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                        Nenhum desconto aplicável
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Total + FGTS + Observações lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Total da Rescisão */}
                <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-5 border-2 border-red-300">
                  <p className="text-base font-bold text-foreground">TOTAL ESTIMADO DA RESCISÃO</p>
                  <span className="text-3xl font-extrabold text-red-700 block mt-2">R$ {fmt(aviso.valorEstimadoTotal)}</span>
                  {previsao?.dataLimitePagamento && (
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Prazo pgto (Art. 477 §6º CLT): <span className="font-bold text-red-700 ml-1">{fmtDate(previsao.dataLimitePagamento)}</span>
                    </p>
                  )}
                </div>

                {/* FGTS Informativo */}
                {previsao?.fgtsEstimado && parseFloat(previsao.fgtsEstimado) > 0 && (
                  <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                    <p className="text-base font-semibold text-blue-800">FGTS Estimado no Período</p>
                    <span className="text-2xl font-bold text-blue-800 block mt-2">R$ {fmt(previsao.fgtsEstimado)}</span>
                    <p className="text-xs text-blue-600 mt-2">{previsao.mesesTotais} meses × 8% sobre salário base</p>
                  </div>
                )}

                {/* Observações */}
                {aviso.observacoes && (
                  <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Observações</p>
                    <p className="text-sm text-foreground">{aviso.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Botão para ir à página completa */}
              <div className="flex justify-end pt-2">
                <Button variant="outline" size="default" onClick={() => { onClose(); window.location.href = '/aviso-previo'; }}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver na página de Aviso Prévio
                </Button>
              </div>
            </div>
            )}

            {/* Tab: Comparativo */}
            {activeTab === 'comparativo' && (
            <div>
              {isLoadingComp ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1B2A4A]" />
                  <span className="ml-3 text-sm text-muted-foreground">Calculando cenários...</span>
                </div>
              ) : !comparativo ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Não foi possível calcular o comparativo.</div>
              ) : (
                <div className="space-y-4">
                  {/* Dados do Funcionário */}
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Salário Base:</span> <span className="font-semibold">R$ {fmt(comparativo.funcionario.salarioBase)}</span></div>
                      <div><span className="text-muted-foreground">Admissão:</span> <span className="font-semibold">{fmtDate(comparativo.funcionario.dataAdmissao)}</span></div>
                      <div><span className="text-muted-foreground">Tempo de Serviço:</span> <span className="font-semibold">
                        {(() => {
                          const anos = comparativo.funcionario.anosServico || 0;
                          const meses = comparativo.funcionario.mesesServico || 0;
                          const mesesResto = meses % 12;
                          if (anos > 0 && mesesResto > 0) return `${anos} ano${anos > 1 ? 's' : ''} e ${mesesResto} ${mesesResto > 1 ? 'meses' : 'mês'}`;
                          if (anos > 0) return `${anos} ano${anos > 1 ? 's' : ''}`;
                          if (mesesResto > 0) return `${mesesResto} ${mesesResto > 1 ? 'meses' : 'mês'}`;
                          // Fallback: calculate from dates
                          if (comparativo.funcionario.dataAdmissao) {
                            const adm = new Date(comparativo.funcionario.dataAdmissao + 'T00:00:00');
                            const hoje = new Date();
                            const totalM = Math.round((hoje.getTime() - adm.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
                            const a = Math.floor(totalM / 12);
                            const m = totalM % 12;
                            if (a > 0 && m > 0) return `${a} ano${a > 1 ? 's' : ''} e ${m} ${m > 1 ? 'meses' : 'mês'}`;
                            if (a > 0) return `${a} ano${a > 1 ? 's' : ''}`;
                            if (m > 0) return `${m} ${m > 1 ? 'meses' : 'mês'}`;
                          }
                          return 'Menos de 1 mês';
                        })()}
                      </span></div>
                      <div><span className="text-muted-foreground">Desligamento:</span> <span className="font-semibold">{fmtDate(aviso.dataInicio)}</span></div>
                    </div>
                  </div>

                  {/* Cards lado a lado */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* TRABALHADO */}
                    <div className={`border-2 rounded-lg overflow-hidden ${comparativo.analise.maisEconomico === 'trabalhado' ? 'border-green-400' : 'border-gray-200'}`}>
                      <div className={`px-4 py-2.5 ${comparativo.analise.maisEconomico === 'trabalhado' ? 'bg-green-600 text-white' : 'bg-gray-100 text-foreground'}`}>
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Aviso Trabalhado
                          </h4>
                          {comparativo.analise.maisEconomico === 'trabalhado' && (
                            <Badge className="bg-white text-green-700 text-[10px]">MAIS ECONÔMICO</Badge>
                          )}
                        </div>
                        <p className="text-[10px] mt-0.5 opacity-80">{comparativo.trabalhado.diasAviso} dias trabalhados + {comparativo.trabalhado.diasExtras}d extras indenizados</p>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div><span className="text-muted-foreground">Início:</span> <span className="font-medium">{fmtDate(comparativo.trabalhado.dataInicio)}</span></div>
                          <div><span className="text-muted-foreground">Término:</span> <span className="font-medium">{fmtDate(comparativo.trabalhado.dataFim)}</span></div>
                          <div><span className="text-muted-foreground">Saída:</span> <span className="font-medium">{fmtDate(comparativo.trabalhado.dataSaida)}</span></div>
                          <div><span className="text-muted-foreground">Prazo Pgto:</span> <span className="font-medium text-red-600">{fmtDate(comparativo.trabalhado.dataLimitePagamento)}</span></div>
                        </div>
                        <hr />
                        <div className="space-y-1">
                          {buildProventosFromPrevisao(comparativo.trabalhado.previsao).map((item, i) => (
                            <div key={i} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="font-medium text-green-700">R$ {fmt(item.value)}</span>
                            </div>
                          ))}
                        </div>
                        <hr />
                        <div className="flex justify-between text-xs font-bold">
                          <span>Total Verbas</span>
                          <span className="text-green-700">R$ {fmt(comparativo.trabalhado.totalBruto)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Encargos Patronais (~36,8%)</span>
                          <span className="font-medium text-orange-600">+ R$ {fmt(comparativo.trabalhado.encargosPatronais)}</span>
                        </div>
                        <div className="bg-amber-50 rounded p-2 border border-amber-200">
                          <div className="flex justify-between text-xs font-bold">
                            <span>Custo Total Empresa</span>
                            <span className="text-amber-800">R$ {fmt(comparativo.trabalhado.custoTotalEmpresa)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* INDENIZADO */}
                    <div className={`border-2 rounded-lg overflow-hidden ${comparativo.analise.maisEconomico === 'indenizado' ? 'border-green-400' : 'border-gray-200'}`}>
                      <div className={`px-4 py-2.5 ${comparativo.analise.maisEconomico === 'indenizado' ? 'bg-green-600 text-white' : 'bg-gray-100 text-foreground'}`}>
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Aviso Indenizado
                          </h4>
                          {comparativo.analise.maisEconomico === 'indenizado' && (
                            <Badge className="bg-white text-green-700 text-[10px]">MAIS ECONÔMICO</Badge>
                          )}
                        </div>
                        <p className="text-[10px] mt-0.5 opacity-80">{comparativo.indenizado.diasAviso} dias indenizados (dispensa imediata)</p>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div><span className="text-muted-foreground">Início:</span> <span className="font-medium">{fmtDate(comparativo.indenizado.dataInicio)}</span></div>
                          <div><span className="text-muted-foreground">Término:</span> <span className="font-medium">{fmtDate(comparativo.indenizado.dataFim)}</span></div>
                          <div><span className="text-muted-foreground">Saída:</span> <span className="font-medium">{fmtDate(comparativo.indenizado.dataSaida)}</span></div>
                          <div><span className="text-muted-foreground">Prazo Pgto:</span> <span className="font-medium text-red-600">{fmtDate(comparativo.indenizado.dataLimitePagamento)}</span></div>
                        </div>
                        <hr />
                        <div className="space-y-1">
                          {buildProventosFromPrevisao(comparativo.indenizado.previsao).map((item, i) => (
                            <div key={i} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="font-medium text-green-700">R$ {fmt(item.value)}</span>
                            </div>
                          ))}
                        </div>
                        <hr />
                        <div className="flex justify-between text-xs font-bold">
                          <span>Total Verbas</span>
                          <span className="text-green-700">R$ {fmt(comparativo.indenizado.totalBruto)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Encargos Patronais</span>
                          <span className="font-medium text-gray-500">R$ 0,00</span>
                        </div>
                        <div className="bg-amber-50 rounded p-2 border border-amber-200">
                          <div className="flex justify-between text-xs font-bold">
                            <span>Custo Total Empresa</span>
                            <span className="text-amber-800">R$ {fmt(comparativo.indenizado.custoTotalEmpresa)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Descontos comuns */}
                  {comparativo.descontos.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                      <h4 className="text-xs font-bold text-red-700 mb-2">Descontos (aplicados em ambos os cenários)</h4>
                      <div className="space-y-1">
                        {comparativo.descontos.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between text-[11px]">
                            <span>{d.descricao}</span>
                            <span className="font-medium text-red-600">- R$ {fmt(d.valor)}</span>
                          </div>
                        ))}
                        <hr className="border-red-200" />
                        <div className="flex justify-between text-xs font-bold text-red-800">
                          <span>Total Descontos</span>
                          <span>- R$ {fmt(comparativo.totalDescontos)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Análise / Recomendação */}
                  <div className={`rounded-lg p-4 border-2 ${
                    comparativo.analise.maisEconomico === 'indenizado'
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                      : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-400'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${comparativo.analise.maisEconomico === 'indenizado' ? 'bg-green-100' : 'bg-blue-100'}`}>
                        <TrendingDown className={`h-5 w-5 ${comparativo.analise.maisEconomico === 'indenizado' ? 'text-green-700' : 'text-blue-700'}`} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-foreground">Análise de Custo</h4>
                        <p className="text-xs text-muted-foreground mt-1">{comparativo.analise.resumo}</p>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Custo Trabalhado</p>
                            <p className="text-sm font-bold">R$ {fmt(comparativo.trabalhado.custoTotalEmpresa)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Custo Indenizado</p>
                            <p className="text-sm font-bold">R$ {fmt(comparativo.indenizado.custoTotalEmpresa)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Economia Estimada</p>
                            <p className="text-sm font-extrabold text-green-700">R$ {fmt(comparativo.analise.economiaEstimada)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Observações legais */}
                  <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                    <p className="text-[10px] text-yellow-800">
                      <strong>Nota:</strong> Os valores são estimativas baseadas nos dados cadastrados. Encargos patronais (~36,8%) incluem INSS patronal (~28,8%) e FGTS (8%) sobre o período trabalhado. No aviso indenizado, não há encargos patronais pois o funcionário não presta serviços. Consulte o departamento contábil para valores definitivos.
                    </p>
                  </div>
                </div>
              )}
            </div>
            )}
          </>
        )}
    </FullScreenDialog>
  );
}
