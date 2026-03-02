import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
  Bell, FileText, CheckCircle2, XCircle, User, Calendar, TrendingDown, Info
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime, nowBrasilia } from "@/lib/dateUtils";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";

export default function PainelRH() {
  const { user } = useAuth();
  const [selectedAvisoId, setSelectedAvisoId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
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
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId, limit: 6 },
    { enabled: !!companyId }
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

        {companyId ? (
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-24" /></Card>
              ))}
            </div>
          ) : (
            <>
              {/* KPI Cards - Colaboradores */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quadro de Pessoal</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard title="Total Colaboradores" value={s?.totalFuncionarios ?? 0} icon={Users} color="blue" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Ativos" value={s?.ativos ?? 0} icon={UserCheck} color="green" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Férias" value={s?.ferias ?? 0} icon={Palmtree} color="cyan" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Afastados" value={s?.afastados ?? 0} icon={AlertTriangle} color="yellow" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Licença" value={s?.licenca ?? 0} icon={UserX} color="purple" onClick={() => navigate("/colaboradores")} />
                  <KpiCard title="Desligados" value={s?.desligados ?? 0} icon={UserX} color="red" onClick={() => navigate("/colaboradores")} />
                </div>
              </div>

              {/* KPI Cards - Operacional RH */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Indicadores RH</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard title="Obras Ativas" value={s?.obrasAtivas ?? 0} icon={Landmark} color="teal" onClick={() => navigate("/obras")} />
                  <KpiCard title="ASOs Vencidos" value={s?.asosVencidos ?? 0} icon={FileWarning} color="red" onClick={() => navigate("/controle-documentos")} alert={!!s?.asosVencidos} />
                  <KpiCard title="ASOs Vencendo (60d)" value={s?.asosVencendo ?? 0} icon={HeartPulse} color="orange" onClick={() => navigate("/controle-documentos")} />
                  <KpiCard title="Férias a Vencer" value={s?.feriasAlerta ?? 0} icon={CalendarClock} color="yellow" onClick={() => navigate("/ferias")} />
                </div>
              </div>

              {/* Contratos de Experiência */}
              {(homeData?.experiencias?.length ?? 0) > 0 ? (
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
              {(homeData?.avisosPrevios?.length ?? 0) > 0 && (() => {
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
                    {totalValorEstimado > 0 && (
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
                              {a.valorEstimado && <span className="text-[10px] font-bold text-red-600">R$ {parseFloat(a.valorEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
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
                  <Card>
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
                      {(homeData?.feriasDashboard?.custoProximo90Dias ?? 0) > 0 ? (
                        <div className="mt-2 pt-2 border-t flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Custo próx. 90 dias</span>
                          <span className="text-xs font-bold text-orange-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(homeData!.feriasDashboard.custoProximo90Dias)}</span>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                {/* Coluna 2: ASOs + Férias Período Aquisitivo */}
                <div className="space-y-4">
                  <Card>
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
                  </Card>

                  <Card>
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
                  </Card>
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

                  <Card>
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
                  </Card>

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
                    { label: "Colaboradores", icon: Users, path: "/colaboradores", color: "text-blue-600" },
                    { label: "Obras", icon: Landmark, path: "/obras", color: "text-teal-600" },
                    { label: "Fechamento Ponto", icon: Clock, path: "/fechamento-ponto", color: "text-indigo-600" },
                    { label: "Folha Pagamento", icon: Briefcase, path: "/folha-pagamento", color: "text-emerald-600" },
                    { label: "Documentos", icon: FileWarning, path: "/controle-documentos", color: "text-amber-600" },
                    { label: "Dashboards", icon: BarChart3, path: "/dashboards", color: "text-purple-600" },
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
          <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}


function AvisoRescisaoDialog({ avisoId, onClose }: { avisoId: number | null; onClose: () => void }) {
  const { data: aviso, isLoading } = trpc.avisoPrevio.avisoPrevio.getById.useQuery(
    { id: avisoId! },
    { enabled: !!avisoId }
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

  return (
    <Dialog open={!!avisoId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0">
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
            {/* Header com nome do funcionário */}
            <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a] text-white px-6 py-4 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-full">
                  <User className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold">{(aviso as any).employeeName || 'Funcionário'}</h2>
                  <div className="flex items-center gap-4 text-sm text-white/80 mt-0.5">
                    {(aviso as any).employeeCargo && <span>{(aviso as any).employeeCargo}</span>}
                    {(aviso as any).employeeCpf && (aviso as any).employeeCpf !== '-' && <span>CPF: {(aviso as any).employeeCpf}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/60 uppercase">Cálculos da Rescisão</p>
                  <Scale className="h-5 w-5 mt-1 text-white/80 ml-auto" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Dados do Aviso Prévio */}
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" /> Dados do Aviso Prévio
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Tipo</p>
                    <p className="text-xs font-semibold">{tipoLabel(aviso.tipo)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Redução de Jornada</p>
                    <p className="text-xs font-semibold">{reducaoLabel(aviso.reducaoJornada)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Salário Base</p>
                    <p className="text-xs font-bold text-blue-700">R$ {fmt(aviso.salarioBase)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Início do Aviso</p>
                    <p className="text-xs font-semibold">{fmtDate(aviso.dataInicio)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Término do Aviso</p>
                    <p className="text-xs font-semibold">{fmtDate(aviso.dataFim)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Dias de Aviso</p>
                    <p className="text-xs font-semibold">{aviso.diasAviso} dias</p>
                  </div>
                  {previsao?.dataAdmissao && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Data Admissão</p>
                      <p className="text-xs font-semibold">{fmtDate(previsao.dataAdmissao)}</p>
                    </div>
                  )}
                  {previsao?.anosServico !== undefined && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Tempo de Serviço</p>
                      <p className="text-xs font-semibold">{previsao.anosServico} ano{previsao.anosServico !== 1 ? 's' : ''}</p>
                    </div>
                  )}
                  {previsao?.dataSaida && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Data de Saída</p>
                      <p className="text-xs font-semibold">{fmtDate(previsao.dataSaida)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Separador */}
              <hr className="border-gray-200" />

              {/* Proventos e Descontos lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Verbas Rescisórias (Proventos) */}
                {proventos.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5" /> Verbas Rescisórias (Proventos)
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody>
                          {proventos.map((row, i) => (
                            <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                              <td className="px-3 py-2 text-foreground">{row.label}</td>
                              <td className="px-3 py-2 text-right font-semibold text-green-700 whitespace-nowrap">R$ {fmt(row.value)}</td>
                            </tr>
                          ))}
                          <tr className="bg-green-50 font-bold">
                            <td className="px-3 py-2 text-green-800">SUBTOTAL PROVENTOS</td>
                            <td className="px-3 py-2 text-right text-green-800 whitespace-nowrap">R$ {fmt(totalProventos)}</td>
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
                      <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <TrendingDown className="h-3.5 w-3.5" /> Descontos
                      </h3>
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <tbody>
                            {descontos.map((row, i) => (
                              <tr key={i} className="border-b last:border-b-0 hover:bg-red-50/50">
                                <td className="px-3 py-2 text-foreground">{row.label}</td>
                                <td className="px-3 py-2 text-right font-semibold text-red-600 whitespace-nowrap">- R$ {fmt(row.value)}</td>
                              </tr>
                            ))}
                            <tr className="bg-red-50 font-bold">
                              <td className="px-3 py-2 text-red-800">SUBTOTAL DESCONTOS</td>
                              <td className="px-3 py-2 text-right text-red-800 whitespace-nowrap">- R$ {fmt(totalDescontos)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                        <TrendingDown className="h-3.5 w-3.5" /> Descontos
                      </h3>
                      <div className="border rounded-lg p-4 text-center text-xs text-muted-foreground">
                        Nenhum desconto aplicável
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Total + FGTS + Observações lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Total da Rescisão */}
                <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border-2 border-red-300">
                  <p className="text-sm font-bold text-foreground">TOTAL ESTIMADO DA RESCISÃO</p>
                  <span className="text-2xl font-extrabold text-red-700 block mt-1">R$ {fmt(aviso.valorEstimadoTotal)}</span>
                  {previsao?.dataLimitePagamento && (
                    <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Prazo pgto (Art. 477 §6º CLT): <span className="font-bold text-red-700">{fmtDate(previsao.dataLimitePagamento)}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {/* FGTS Informativo */}
                  {previsao?.fgtsEstimado && parseFloat(previsao.fgtsEstimado) > 0 && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-blue-800">FGTS Estimado no Período</p>
                          <p className="text-[10px] text-blue-600 mt-0.5">{previsao.mesesTotais} meses × 8% sobre salário base</p>
                        </div>
                        <span className="text-sm font-bold text-blue-800">R$ {fmt(previsao.fgtsEstimado)}</span>
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  {aviso.observacoes && (
                    <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">Observações</p>
                      <p className="text-xs text-foreground">{aviso.observacoes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Botão para ir à página completa */}
              <div className="flex justify-end pb-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => { onClose(); window.location.href = '/aviso-previo'; }}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ver na página de Aviso Prévio
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
