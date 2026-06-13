import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { EmpStatusBadge } from "@/components/EmpStatusBadge";
import { PersonPhoto } from "@/components/PersonPhoto";
import { CipaBadge } from "@/components/CipaBadge";
import AnaliseExperiencia from "@/components/AnaliseExperiencia";
import DashboardLayout from "@/components/DashboardLayout";
import { usePermissions } from "@/contexts/PermissionsContext";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Users, UserCheck, Palmtree, UserX, AlertTriangle, Clock,
  BarChart3, Landmark, Cake, FileWarning, CalendarClock,
  ArrowUpRight, ArrowDownRight, ShieldAlert, Activity,
  ChevronRight, HeartPulse, Briefcase, Scale, ExternalLink,
  Printer, Plane, DollarSign, ClipboardCheck, UserPlus, Ban, RefreshCw, FileBarChart,
  Bell, FileText, CheckCircle2, XCircle, User, Calendar, TrendingDown, Info,
  BarChart2, ArrowRight, TrendingUp, Minus, GitCompareArrows, Award, Trophy, Star,
  Maximize2, Save, X, ChevronLeft, MapPin, UsersRound
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [analiseEmpId, setAnaliseEmpId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || undefined : undefined;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : (companyId || 0);
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [expAction, setExpAction] = useState<{ type: 'prorrogar' | 'efetivar' | 'desligar'; emp: any } | null>(null);
  const [expMotivo, setExpMotivo] = useState('');
  const [expObs, setExpObs] = useState('');
  const utils = trpc.useUtils();
  const prorrogarMut = trpc.employees.prorrogarExperiencia.useMutation({
    onSuccess: () => { utils.home.getData.invalidate(); setExpAction(null); setExpObs(''); toast.success('Contrato de experiência prorrogado para o 2º período.'); },
    onError: (e) => toast.error(e.message || 'Não foi possível prorrogar o contrato.'),
  });
  const efetivarMut = trpc.employees.efetivarExperiencia.useMutation({
    onSuccess: () => { utils.home.getData.invalidate(); setExpAction(null); setExpObs(''); toast.success('Colaborador efetivado com sucesso.'); },
    onError: (e) => toast.error(e.message || 'Não foi possível efetivar o colaborador.'),
  });
  const desligarMut = trpc.employees.desligarExperiencia.useMutation({
    onSuccess: () => { utils.home.getData.invalidate(); setExpAction(null); setExpMotivo(''); setExpObs(''); toast.success('Colaborador desligado durante a experiência.'); },
    onError: (e) => toast.error(e.message || 'Não foi possível desligar o colaborador.'),
  });
  // Rev. 3022 — pré-marcação "não renovar" (flag de intenção, reversível)
  const naoRenovarMut = trpc.employees.marcarNaoRenovarExperiencia.useMutation({
    onSuccess: (_d, vars) => { utils.home.getData.invalidate(); toast.success(vars.naoRenovar ? 'Contrato pré-marcado como "não renovar".' : 'Pré-marcação "não renovar" removida.'); },
    onError: (e) => toast.error(e.message || 'Não foi possível atualizar a marcação.'),
  });

  const { data: homeData, isLoading } = trpc.home.getData.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany }
  );
  const s = homeData?.stats;

  const [kpiExpand, setKpiExpand] = useState<{ title: string; items: { nome: string; funcao?: string; extra?: string; urgencia?: string; status?: string | null }[] } | null>(null);
  const [aniversariosFullOpen, setAniversariosFullOpen] = useState(false);
  const [cardExpand, setCardExpand] = useState<string | null>(null);
  const [anivMes, setAnivMes] = useState<number>(new Date().getMonth() + 1);
  const [alertaTab, setAlertaTab] = useState('todos');

  const { data: anivMesData, isLoading: anivMesLoading } = trpc.home.getAniversariantesMes.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}), mes: anivMes },
    { enabled: hasValidCompany }
  );

  // Rev. 1271 — Solicitações pendentes de HE/MO para a Central de Alertas
  const requestsAlertsQ = trpc.notifications.pendingRequestCounts.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany, refetchInterval: 60_000 }
  );
  const totalAlertas = (s?.asosVencidos ?? 0) + (s?.asosVencendo ?? 0) + (s?.semAso ?? 0) + (s?.feriasAlerta ?? 0) + (s?.experienciasVencidas ?? 0) + (s?.experienciasUrgentes ?? 0) + (s?.avisosPreviosVencendo ?? 0);

  // Montar lista de alertas para o Dialog
  const alertasList: { id: string; tipo: string; titulo: string; nome: string; empStatus?: string; descricao: string; urgencia: string; link: string; fotoUrl?: string | null }[] = [];
  if (homeData) {
    // ASOs vencidos
    (homeData.asosAlerta ?? []).filter((a: any) => a.vencido).forEach((a: any) => {
      alertasList.push({ id: `aso-v-${a.employeeId}`, tipo: 'aso', titulo: `ASO Vencido`, nome: a.nome, empStatus: a.status, descricao: `Vencido há ${Math.abs(a.diasRestantes)} dias. Função: ${a.funcao || '-'}`, urgencia: 'critico', link: '/controle-documentos', fotoUrl: a.fotoUrl });
    });
    // ASOs vencendo
    (homeData.asosAlerta ?? []).filter((a: any) => !a.vencido).forEach((a: any) => {
      alertasList.push({ id: `aso-e-${a.employeeId}`, tipo: 'aso', titulo: `ASO Vencendo`, nome: a.nome, empStatus: a.status, descricao: `Vence em ${a.diasRestantes} dias. Função: ${a.funcao || '-'}`, urgencia: a.diasRestantes <= 15 ? 'urgente' : 'atencao', link: '/controle-documentos', fotoUrl: a.fotoUrl });
    });
    // Sem ASO
    (homeData.semAso ?? []).forEach((e: any) => {
      alertasList.push({ id: `sem-aso-${e.id}`, tipo: 'aso', titulo: `Sem ASO`, nome: e.nome, empStatus: e.status, descricao: `Funcionário sem ASO cadastrado. Função: ${e.funcao || '-'}`, urgencia: 'atencao', link: '/controle-documentos', fotoUrl: e.fotoUrl });
    });
    // Férias vencendo
    (homeData.feriasAlerta ?? []).forEach((f: any) => {
      alertasList.push({ id: `ferias-${f.id}`, tipo: 'ferias', titulo: `Novo período de férias`, nome: f.nome, empStatus: f.status, descricao: `Vai abrir o ${f.periodoAquisitivo}º período aquisitivo (completa ${f.periodoAquisitivo} ano(s) de empresa). ${f.diasParaVencer <= 0 ? 'Abre hoje.' : `Em ${f.diasParaVencer} dias.`}`, urgencia: f.diasParaVencer <= 0 ? 'critico' : f.urgente ? 'urgente' : 'atencao', link: '/ferias', fotoUrl: f.fotoUrl });
    });
    // Experiências vencidas/urgentes/atenção (até 30 dias)
    (homeData.experiencias ?? []).filter((e: any) => e.urgencia === 'vencido' || e.urgencia === 'urgente' || e.urgencia === 'atencao').forEach((e: any) => {
      alertasList.push({ id: `exp-${e.id}`, tipo: 'experiencia', titulo: `Contrato Experiência ${e.urgencia === 'vencido' ? 'VENCIDO' : e.urgencia === 'urgente' ? 'Urgente' : 'Vencendo'}`, nome: e.nome, empStatus: e.empStatus, descricao: `Tipo: ${e.tipo}. ${e.urgencia === 'vencido' ? 'Prazo expirado!' : `${e.diasRestantes} dias restantes`}`, urgencia: e.urgencia === 'vencido' ? 'critico' : e.urgencia === 'urgente' ? 'urgente' : 'atencao', link: '/colaboradores', fotoUrl: e.fotoUrl });
    });
    // Avisos prévios vencendo
    (homeData.avisosPrevios ?? []).filter((a: any) => a.urgencia === 'critico' || a.urgencia === 'vencido').forEach((a: any) => {
      alertasList.push({ id: `aviso-${a.id}`, tipo: 'aviso', titulo: `Aviso Prévio ${a.urgencia === 'vencido' ? 'VENCIDO' : 'Crítico'}`, nome: a.nome, empStatus: a.empStatus, descricao: `Tipo: ${a.tipo.replace(/_/g, ' ')}. ${a.diasRestantes <= 0 ? 'Prazo expirado!' : `${a.diasRestantes} dias restantes`}`, urgencia: 'critico', link: '/aviso-previo', fotoUrl: a.fotoUrl });
    });
  }
  // Rev. 1271 — Solicitações de Hora Extra pendentes
  (requestsAlertsQ.data?.heItems ?? []).forEach((h: any) => {
    const motivo = (h.motivo || "").trim();
    alertasList.push({
      id: `he-${h.id}`,
      tipo: 'solicitacao_he',
      titulo: 'Solicitação de Hora Extra',
      nome: h.solicitadoPor || 'Solicitante',
      descricao: `${h.obraNome || 'Sem obra'} · ${h.dataSolicitacao || ''}${motivo ? ` · ${motivo.slice(0, 80)}${motivo.length > 80 ? '...' : ''}` : ''}`,
      urgencia: 'urgente',
      link: '/solicitacao-he',
    });
  });
  // Rev. 1271 — Solicitações de Mão de Obra pendentes
  (requestsAlertsQ.data?.mdoItems ?? []).forEach((m: any) => {
    const stMap: Record<string, string> = {
      enviada: 'Aguarda RH',
      aprovada_coord: 'Aguarda RH (legado)',
      aprovada_rh: 'Aguarda Diretoria',
    };
    alertasList.push({
      id: `mdo-${m.id}`,
      tipo: 'solicitacao_mo',
      titulo: 'Solicitação de Mão de Obra',
      nome: `${m.funcaoSolicitada} (${m.quantidade}x)`,
      descricao: `${m.obraNome || 'Sem obra'} · solic.: ${m.solicitanteNome || '-'} · ${stMap[m.status as string] || m.status}`,
      urgencia: m.prioridade === 'urgente' ? 'critico' : 'urgente',
      link: '/solicitacao-mdo',
    });
  });
  // Ordenar por urgência
  const urgOrder: Record<string, number> = { critico: 0, urgente: 1, atencao: 2 };
  alertasList.sort((a, b) => (urgOrder[a.urgencia] ?? 3) - (urgOrder[b.urgencia] ?? 3));
  alertasList.splice(0, alertasList.length, ...alertasList.filter(a => a.empStatus?.toLowerCase() !== 'desligado'));
  const filteredAlertas = alertaTab === 'todos' ? alertasList : alertasList.filter(a => a.tipo === alertaTab);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel RH & DP</h1>
              {hasValidCompany && canSeeColaboradores && s && (
                <button
                  onClick={() => navigate("/colaboradores?status=Todos")}
                  aria-label={`${(s?.totalFuncionarios ?? 0).toLocaleString("pt-BR")} pessoas cadastradas na empresa`}
                  title="Total de pessoas cadastradas na empresa"
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" />
                  {(s?.totalFuncionarios ?? 0).toLocaleString("pt-BR")} pessoas
                </button>
              )}
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
                  <KpiCard title="Total" value={s?.totalFuncionarios ?? 0} icon={Users} color="blue" onClick={() => navigate("/colaboradores?status=Todos")} />
                  <KpiCard title="Na Empresa" value={s?.naEmpresa ?? ((s?.totalFuncionarios ?? 0) - (s?.desligados ?? 0))} icon={UsersRound} color="teal" onClick={() => navigate("/colaboradores?status=NaEmpresa")} />
                  <KpiCard title="Ativos" value={s?.ativos ?? 0} icon={UserCheck} color="green" onClick={() => navigate("/colaboradores?status=Ativo")} />
                  <KpiCard title="Férias" value={s?.ferias ?? 0} icon={Palmtree} color="cyan" onClick={() => navigate("/colaboradores?status=Ferias")} />
                  <KpiCard title="Afastados" value={s?.afastados ?? 0} icon={AlertTriangle} color="yellow" onClick={() => navigate("/colaboradores?status=Afastado")} />
                  <KpiCard title="Licença" value={s?.licenca ?? 0} icon={UserX} color="purple" onClick={() => navigate("/colaboradores?status=Licenca")} />
                  <KpiCard title="Desligados" value={s?.desligados ?? 0} icon={UserX} color="red" onClick={() => navigate("/colaboradores?status=Desligado")} />
                </div>
              </div>
              )}

              {/* KPI Cards - Operacional RH */}
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Indicadores RH</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {canSeeObras && <KpiCard title="Obras Ativas" value={s?.obrasAtivas ?? 0} icon={Landmark} color="teal" onClick={() => navigate("/obras")} />}
                  {canSeeDocumentos && <KpiCard title="ASOs Vencidos" value={s?.asosVencidos ?? 0} icon={FileWarning} color="red" onClick={() => navigate("/controle-documentos")} alert={!!s?.asosVencidos} onExpand={(s?.asosVencidos ?? 0) > 0 ? () => setKpiExpand({ title: "ASOs Vencidos", items: (homeData?.asosAlerta ?? []).filter((a: any) => a.vencido).map((a: any) => ({ nome: a.nome, funcao: a.funcao, status: a.status, extra: `Vencido há ${Math.abs(a.diasRestantes)} dia${Math.abs(a.diasRestantes) !== 1 ? 's' : ''}`, urgencia: 'critico' })) }) : undefined} />}
                  {canSeeDocumentos && <KpiCard title="ASOs Vencendo (60d)" value={s?.asosVencendo ?? 0} icon={HeartPulse} color="orange" onClick={() => navigate("/controle-documentos")} onExpand={(s?.asosVencendo ?? 0) > 0 ? () => setKpiExpand({ title: "ASOs Vencendo (60 dias)", items: (homeData?.asosAlerta ?? []).filter((a: any) => !a.vencido).map((a: any) => ({ nome: a.nome, funcao: a.funcao, status: a.status, extra: `Vence em ${a.diasRestantes} dia${a.diasRestantes !== 1 ? 's' : ''}`, urgencia: a.diasRestantes <= 15 ? 'urgente' : 'atencao' })) }) : undefined} />}
                  {canSeeFerias && <KpiCard title="Períodos de Férias a Abrir" value={s?.feriasAlerta ?? 0} icon={CalendarClock} color="yellow" onClick={() => navigate("/ferias")} onExpand={(s?.feriasAlerta ?? 0) > 0 ? () => setKpiExpand({ title: "Períodos de Férias a Abrir", items: (homeData?.feriasAlerta ?? []).map((f: any) => ({ nome: f.nome, funcao: f.funcao, extra: f.diasParaVencer <= 0 ? `Abre hoje o ${f.periodoAquisitivo}º período` : `Abre o ${f.periodoAquisitivo}º período em ${f.diasParaVencer} dias`, urgencia: f.diasParaVencer <= 0 ? 'critico' : f.urgente ? 'urgente' : 'atencao' })) }) : undefined} />}
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
                    {(() => {
                      const lembretes = homeData!.experiencias.filter((e: any) => e.diasRestantes >= 0 && e.diasRestantes <= 5);
                      if (lembretes.length === 0) return null;
                      return (
                        <div className="mb-3 rounded-lg border-2 border-red-300 bg-red-50 p-3 animate-pulse">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Bell className="h-4 w-4 text-red-600 shrink-0" />
                            <span className="text-sm font-bold text-red-700">
                              LEMBRETE — {lembretes.length} contrato{lembretes.length !== 1 ? 's' : ''} de experiência vencendo em até 5 dias
                            </span>
                          </div>
                          <ul className="space-y-1">
                            {lembretes.map((e: any) => {
                              const isProrrog = e.status === 'prorrogado';
                              const fimRel = isProrrog ? e.fim2 : e.fim1;
                              return (
                                <li key={`lemb-${e.id}`} className="text-xs text-red-800 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold">{e.nome}</span>
                                  <Badge className={`text-[10px] ${isProrrog ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{isProrrog ? '2º período' : '1º período'}</Badge>
                                  <span>vence {e.diasRestantes === 0 ? 'HOJE' : `em ${e.diasRestantes} dia${e.diasRestantes !== 1 ? 's' : ''}`} ({new Date(fimRel + 'T12:00:00').toLocaleDateString('pt-BR')})</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })()}
                    <div className="space-y-2">
                      {homeData!.experiencias.map((exp: any) => {
                        const urgColors: Record<string, string> = { vencido: 'bg-red-100 border-red-300', urgente: 'bg-orange-100 border-orange-300', atencao: 'bg-yellow-50 border-yellow-200', normal: 'bg-white border-gray-200' };
                        const urgTextColors: Record<string, string> = { vencido: 'text-red-700 font-bold', urgente: 'text-orange-700 font-bold', atencao: 'text-yellow-700 font-semibold', normal: 'text-muted-foreground' };
                        return (
                          <div key={exp.id} className={`flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2.5 rounded-lg border ${urgColors[exp.urgencia] || urgColors.normal} gap-2`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="shrink-0">
                                <PersonPhoto src={exp.fotoUrl} alt={exp.nome} size="sm" />
                              </div>
                              <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{exp.nome}</span>
                                <EmpStatusBadge status={exp.empStatus} />
                                <Badge variant="outline" className="text-[10px]">{exp.funcao || '-'}</Badge>
                                {exp.obra ? (
                                  <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 gap-1">
                                    <MapPin className="h-2.5 w-2.5" /> {exp.obra}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] border-gray-200 text-muted-foreground gap-1">
                                    <MapPin className="h-2.5 w-2.5" /> Sem obra
                                  </Badge>
                                )}
                                <Badge className={`text-[10px] ${exp.status === 'prorrogado' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {exp.status === 'prorrogado' ? '2º período' : '1º período'}
                                </Badge>
                                {exp.naoRenovar ? (
                                  <Badge className="text-[10px] bg-rose-100 text-rose-700 border border-rose-300 gap-1" title={exp.naoRenovarEm ? `Marcado em ${new Date(exp.naoRenovarEm + 'T12:00:00').toLocaleDateString('pt-BR')}${exp.naoRenovarPor ? ` por ${exp.naoRenovarPor}` : ''}` : undefined}>
                                    <Ban className="h-2.5 w-2.5" /> Não renovar
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                                <span>{exp.tipo === '30_30' ? '30+30' : '45+45'} dias · Início: {new Date(exp.inicio + 'T12:00:00').toLocaleDateString('pt-BR')} ·</span>
                                <span className="inline-flex items-center gap-1">Fim 1º: <span className={`text-sm font-bold ${exp.status !== 'prorrogado' && exp.diasRestantes >= 0 && exp.diasRestantes <= 5 ? 'text-red-700' : 'text-gray-900'}`}>{new Date(exp.fim1 + 'T12:00:00').toLocaleDateString('pt-BR')}</span></span>
                                <span className="text-muted-foreground/60">·</span>
                                <span className="inline-flex items-center gap-1">Fim 2º: <span className={`text-sm font-bold ${exp.status === 'prorrogado' && exp.diasRestantes >= 0 && exp.diasRestantes <= 5 ? 'text-red-700' : 'text-gray-900'}`}>{new Date(exp.fim2 + 'T12:00:00').toLocaleDateString('pt-BR')}</span></span>
                              </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-mono ${urgTextColors[exp.urgencia] || ''}`}>
                                {exp.diasRestantes < 0 ? `Vencido há ${Math.abs(exp.diasRestantes)}d` : exp.diasRestantes === 0 ? 'VENCE HOJE' : `${exp.diasRestantes}d restantes`}
                              </span>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => setAnaliseEmpId(exp.id)}>
                                <FileBarChart className="h-3 w-3" /> Análise
                              </Button>
                              {canEditExperiencia && (<>
                              <label className={`flex items-center gap-1.5 h-7 px-2 rounded-md border cursor-pointer text-xs select-none ${exp.naoRenovar ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-gray-200 text-muted-foreground hover:bg-gray-50'} ${naoRenovarMut.isPending ? 'opacity-60 pointer-events-none' : ''}`} title="Pré-marcar que este contrato NÃO será renovado (aviso de não renovação). Não executa o desligamento.">
                                <Checkbox checked={!!exp.naoRenovar} onCheckedChange={(v) => naoRenovarMut.mutate({ employeeId: exp.id, companyId: (exp.companyId ?? companyId)!, naoRenovar: v === true })} className="h-3.5 w-3.5" />
                                Não renovar
                              </label>
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
                        {expAction.type === 'prorrogar' ? <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={prorrogarMut.isPending} onClick={() => prorrogarMut.mutate({ employeeId: expAction.emp.id, companyId: (expAction.emp.companyId ?? companyId)!, obs: expObs || undefined })}>{prorrogarMut.isPending ? 'Prorrogando...' : 'Confirmar Prorrogação'}</Button> : null}
                        {expAction.type === 'efetivar' ? <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={efetivarMut.isPending} onClick={() => efetivarMut.mutate({ employeeId: expAction.emp.id, companyId: (expAction.emp.companyId ?? companyId)!, obs: expObs || undefined })}>{efetivarMut.isPending ? 'Efetivando...' : 'Confirmar Efetivação'}</Button> : null}
                        {expAction.type === 'desligar' ? <Button variant="destructive" disabled={desligarMut.isPending || !expMotivo.trim()} onClick={() => desligarMut.mutate({ employeeId: expAction.emp.id, companyId: (expAction.emp.companyId ?? companyId)!, motivo: expMotivo, obs: expObs || undefined })}>{desligarMut.isPending ? 'Desligando...' : 'Confirmar Desligamento'}</Button> : null}
                      </div>
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>

              <AnaliseExperiencia employeeId={analiseEmpId} companyId={queryCompanyId} open={!!analiseEmpId} onClose={() => setAnaliseEmpId(null)} />

              {/* Card de Avisos Prévios em Andamento */}
              {canSeeAvisoPrevio && (homeData?.avisosPrevios?.length ?? 0) > 0 && (() => {
                const avisosValidos = homeData!.avisosPrevios.filter((a: any) => a.nome && a.nome !== 'Funcionário' && a.nome !== 'Funcionário excluído');
                const emAndamento = avisosValidos.filter((a: any) => a.urgencia !== 'aguardando_pagamento');
                const aguardandoPgto = avisosValidos.filter((a: any) => a.urgencia === 'aguardando_pagamento');
                const totalValorEstimado = avisosValidos.reduce((acc: number, a: any) => {
                  const saldo = a.saldoPendente != null
                    ? (parseFloat(a.saldoPendente) || 0)
                    : Math.max(0, (parseFloat(a.valorEstimado) || 0) - (parseFloat(a.valorPago) || 0));
                  return acc + saldo;
                }, 0);
                const totalJaPago = avisosValidos.reduce((acc: number, a: any) => acc + (parseFloat(a.valorPago) || 0), 0);
                return avisosValidos.length > 0 && (
                <Card className="border-2 border-red-300 bg-gradient-to-r from-red-50 to-orange-50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                        <FileText className="h-4 w-4 text-red-600" />
                        Avisos Prévios em Andamento
                        {emAndamento.length > 0 && <Badge variant="destructive" className="text-[10px]">{emAndamento.length} ativo{emAndamento.length !== 1 ? 's' : ''}</Badge>}
                        {(s?.avisosPreviosVencendo ?? 0) > 0 && <Badge className="bg-red-600 text-white text-[10px] animate-pulse">{s!.avisosPreviosVencendo} vencendo!</Badge>}
                        {aguardandoPgto.length > 0 && <Badge className="bg-amber-500 text-white text-[10px]">{aguardandoPgto.length} aguard. pgto</Badge>}
                      </CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate('/aviso-previo')}>Ver todos <ChevronRight className="h-3 w-3 ml-1" /></Button>
                    </div>
                    {canSeeValues && (totalValorEstimado > 0 || totalJaPago > 0) && (
                      <div className="mt-2 flex items-center gap-2 bg-red-100/60 rounded-lg px-3 py-2 flex-wrap">
                        <DollarSign className="h-4 w-4 text-red-600" />
                        <span className="text-xs text-red-700">Desembolso pendente (sem baixa):</span>
                        <span className="text-sm font-bold text-red-700">R$ {totalValorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {totalJaPago > 0 && (
                          <span className="text-[11px] text-emerald-700 ml-2">
                            (já baixado: R$ {totalJaPago.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        )}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {avisosValidos.map((a: any) => {
                        const tipoLabel = a.tipo === 'empregador_trabalhado' ? 'Emp. Trabalhado' : a.tipo === 'empregador_indenizado' ? 'Emp. Indenizado' : a.tipo === 'empregado_trabalhado' ? 'Ped. Trabalhado' : 'Ped. Indenizado';
                        const isAguardando = a.urgencia === 'aguardando_pagamento';
                        return (
                          <div key={a.id} onClick={() => setSelectedAvisoId(a.id)} className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                            isAguardando ? 'bg-amber-50 border-amber-300' :
                            a.urgencia === 'vencido' ? 'bg-red-100 border-red-300 animate-pulse' :
                            a.urgencia === 'critico' ? 'bg-red-50 border-red-200' :
                            a.urgencia === 'urgente' ? 'bg-orange-50 border-orange-200' :
                            'bg-white border-gray-200'
                          }`}>
                            <div className="flex items-start justify-between mb-1 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {/* Rev. 2474 — Foto real (click amplia em lightbox) ao lado do nome. */}
                                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                  <PersonPhoto src={a.fotoUrl} alt={a.nome} size="xs" />
                                </div>
                                <span className="text-xs font-bold text-foreground flex items-center gap-1 min-w-0 truncate">
                                  <span className="truncate">{a.nome}</span>
                                  <EmpStatusBadge status={a.empStatus} />
                                  <CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} />
                                </span>
                              </div>
                              <Badge className={`text-[9px] shrink-0 ${
                                isAguardando ? 'bg-amber-500 text-white' :
                                a.urgencia === 'vencido' ? 'bg-red-600 text-white' :
                                a.urgencia === 'critico' ? 'bg-red-500 text-white' :
                                a.urgencia === 'urgente' ? 'bg-orange-500 text-white' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {isAguardando ? 'Aguard. Pgto' : a.diasRestantes <= 0 ? 'VENCIDO!' : `${a.diasRestantes}d restantes`}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{a.funcao} · {tipoLabel}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-muted-foreground">Término: {new Date(a.dataFim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              {canSeeValues && a.valorEstimado && <span className="text-[10px] font-bold text-red-600">R$ {parseFloat(a.valorEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                            </div>
                            {a.ultimoDiaTrabalhado && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-slate-700">
                                  Último dia trab.: <span className="font-semibold">{new Date(a.ultimoDiaTrabalhado + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                </span>
                              </div>
                            )}
                            {a.dataLimitePagamento && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-amber-600">
                                  Prazo pgto: {new Date(a.dataLimitePagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            )}
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
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Cake className="h-4 w-4 text-pink-500" />
                          Aniversariantes do Mês
                          {s?.aniversariantesHoje ? <Badge className="bg-pink-100 text-pink-700 text-[10px]">{s.aniversariantesHoje} hoje!</Badge> : null}
                        </CardTitle>
                        <button onClick={() => { setAnivMes(new Date().getMonth() + 1); setCardExpand('aniversariantes'); }} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.aniversariantes?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum aniversariante este mês</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {homeData.aniversariantes.map((a: any) => (
                            <div key={a.id} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-accent/50 ${a.isHoje ? "bg-pink-50 border border-pink-200" : ""}`} onClick={() => navigate("/colaboradores")}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                  <PersonPhoto src={a.fotoUrl} alt={a.nome} size="xs" />
                                </div>
                                {a.isHoje ? <span className="text-base shrink-0">🎂</span> : null}
                                <div className="min-w-0">
                                  <span className="font-medium flex items-center gap-1 flex-wrap"><span className="truncate">{a.nome}</span><EmpStatusBadge status={a.status} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></span>
                                  {a.funcao ? <span className="text-muted-foreground ml-1">({a.funcao})</span> : null}
                                  {a.obra ? <span className="block text-[10px] text-blue-600 font-medium mt-0.5">📍 {a.obra}</span> : null}
                                </div>
                              </div>
                              <span className={`font-mono shrink-0 ml-2 ${a.isHoje ? "font-bold text-pink-600" : a.jaPassou ? "text-muted-foreground line-through" : ""}`}>Dia {a.dia}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Férias Painel Rápido */}
                  {canSeeFerias && <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Plane className="h-4 w-4 text-blue-500" />
                          Férias - Painel Rápido
                          {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 ? <Badge className="bg-blue-100 text-blue-700 text-[10px]">{homeData!.feriasDashboard.emAndamento.length} em gozo</Badge> : null}
                        </CardTitle>
                        <button onClick={() => setCardExpand('ferias-painel')} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 ? (
                        <div className="mb-3">
                          <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">De férias agora</p>
                          <div className="space-y-1">
                            {homeData!.feriasDashboard.emAndamento.slice(0, 4).map((f: any) => (
                              <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-blue-50 border border-blue-100 gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <PersonPhoto src={f.fotoUrl} alt={f.nome} size="xs" />
                                  <div className="min-w-0">
                                    <span className="font-medium truncate inline-flex items-center gap-1 flex-wrap">{f.nome}<CipaBadge ativo={f.cipaAtivo} estabilidade={f.cipaEstabilidade} fim={f.cipaFimEstabilidade} cargo={f.cipaCargo} /></span>
                                    {f.obra ? <span className="block text-[10px] text-blue-600 font-medium">📍 {f.obra}</span> : null}
                                  </div>
                                </div>
                                <span className="text-blue-600 font-mono text-[10px] shrink-0">volta em {f.diasRestantes}d</span>
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
                              <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1 rounded gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <PersonPhoto src={f.fotoUrl} alt={f.nome} size="xs" />
                                  <div className="min-w-0">
                                    <span className="font-medium truncate inline-flex items-center gap-1 flex-wrap">{f.nome}<CipaBadge ativo={f.cipaAtivo} estabilidade={f.cipaEstabilidade} fim={f.cipaFimEstabilidade} cargo={f.cipaCargo} /><span className="text-muted-foreground text-[10px]">{f.diasGozo}d</span></span>
                                    {f.obra ? <span className="block text-[10px] text-blue-600 font-medium">📍 {f.obra}</span> : null}
                                  </div>
                                </div>
                                <span className="text-green-600 font-mono text-[10px] shrink-0">em {f.diasAteInicio}d</span>
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
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/controle-documentos")}>Ver todos <ChevronRight className="h-3 w-3 ml-1" /></Button>
                          <button onClick={() => setCardExpand('asos')} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.asosAlerta?.length && !homeData?.semAso?.length ? (
                        <p className="text-xs text-muted-foreground">Todos os ASOs estão em dia</p>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {homeData?.asosAlerta?.slice(0, 8).map((a: any) => (
                            <div key={a.employeeId} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded gap-2 ${a.vencido ? "bg-red-50 border border-red-200" : a.diasRestantes <= 15 ? "bg-orange-50" : ""}`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <PersonPhoto src={a.fotoUrl} alt={a.nome} size="xs" />
                                <span className="font-medium truncate inline-flex items-center gap-1 flex-wrap">{a.nome}<CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></span>
                              </div>
                              <span className={`font-mono text-[10px] shrink-0 ${a.vencido ? "text-red-600 font-bold" : a.diasRestantes <= 15 ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
                                {a.vencido ? `Vencido há ${Math.abs(a.diasRestantes)}d` : `${a.diasRestantes}d restantes`}
                              </span>
                            </div>
                          ))}
                          {(homeData?.semAso?.length ?? 0) > 0 ? (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-[10px] text-red-600 font-semibold mb-1">{homeData!.semAso!.length} funcionário{homeData!.semAso!.length !== 1 ? "s" : ""} sem ASO:</p>
                              {homeData!.semAso!.slice(0, 3).map((e: any) => <div key={e.id} className="text-xs text-muted-foreground pl-2 flex items-center gap-2"><PersonPhoto src={e.fotoUrl} alt={e.nome} size="xs" /><span className="truncate">{e.nome}</span><EmpStatusBadge status={e.status} /><CipaBadge ativo={e.cipaAtivo} estabilidade={e.cipaEstabilidade} fim={e.cipaFimEstabilidade} cargo={e.cipaCargo} /></div>)}
                              {homeData!.semAso!.length > 3 ? <div className="text-[10px] text-muted-foreground pl-2">e mais {homeData!.semAso!.length - 3}...</div> : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>}

                  {canSeeFerias && <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <CalendarClock className="h-4 w-4 text-amber-500" />
                          Férias - Período Aquisitivo
                          {(s?.feriasAlerta ?? 0) > 0 ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">{s!.feriasAlerta} a abrir</Badge> : null}
                        </CardTitle>
                        <button onClick={() => setCardExpand('ferias-periodo')} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.feriasAlerta?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum alerta de férias no momento</p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {homeData.feriasAlerta.slice(0, 6).map((f: any) => (
                            <div key={f.id} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded gap-2 ${f.urgente ? "bg-amber-50 border border-amber-200" : ""}`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <PersonPhoto src={f.fotoUrl} alt={f.nome} size="xs" />
                                <div className="min-w-0">
                                  <span className="font-medium truncate inline-flex items-center gap-1 flex-wrap">{f.nome}<CipaBadge ativo={f.cipaAtivo} estabilidade={f.cipaEstabilidade} fim={f.cipaFimEstabilidade} cargo={f.cipaCargo} /><span className="text-muted-foreground text-[10px]" title={`Vai abrir o ${f.periodoAquisitivo}º período aquisitivo de férias (completa ${f.periodoAquisitivo} ano(s) de empresa)`}>abre {f.periodoAquisitivo}º período</span></span>
                                  {f.obra ? <span className="block text-[10px] text-blue-600 font-medium">📍 {f.obra}</span> : null}
                                </div>
                              </div>
                              <span className={`font-mono text-[10px] shrink-0 ${f.urgente ? "text-red-600 font-bold" : "text-amber-600"}`}>
                                {f.diasParaVencer <= 0 ? "abre hoje" : `${f.diasParaVencer}d`}
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
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4 text-blue-500" />
                          Movimentações (30 dias)
                        </CardTitle>
                        <button onClick={() => setCardExpand('movimentacoes')} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.movimentacoes?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhuma movimentação recente</p>
                      ) : (
                        <div className="space-y-2">
                          {homeData.movimentacoes.slice(0, 6).map((m: any, i: number) => (
                            <div key={`${m.tipo}-${m.id}-${i}`} className="flex items-center gap-2 text-xs">
                              {m.tipo === "admissao" ? <ArrowUpRight className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                              <PersonPhoto src={m.fotoUrl} alt={m.nome} size="xs" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate inline-flex items-center gap-1 flex-wrap">{m.nome}<CipaBadge ativo={m.cipaAtivo} estabilidade={m.cipaEstabilidade} fim={m.cipaFimEstabilidade} cargo={m.cipaCargo} /></span>
                                <span className="block text-muted-foreground text-[10px]">{m.funcao} · {new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                                {m.obra ? <span className="block text-[10px] text-blue-600 font-medium">📍 {m.obra}</span> : null}
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
                          <Award className="h-4 w-4 text-amber-500" />
                          Aniversários de Empresa
                          {(s?.aniversariosEmpresaHoje ?? 0) > 0 && (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] animate-pulse">{s!.aniversariosEmpresaHoje} hoje!</Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">{s?.aniversariosEmpresaMes ?? 0} no mês</Badge>
                          <button onClick={() => setCardExpand('aniversarios-empresa')} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!homeData?.aniversariosEmpresa?.length ? (
                        <p className="text-xs text-muted-foreground">Nenhum aniversário de empresa este mês</p>
                      ) : (
                        <div className="space-y-2">
                          {homeData.aniversariosEmpresa.slice(0, 6).map((a: any) => (
                            <div key={a.id} onClick={() => navigate("/colaboradores")} className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer transition-all ${a.isHoje ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100' : 'hover:bg-accent/60 hover:shadow-sm'}`}>
                              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                <PersonPhoto src={a.fotoUrl} alt={a.nome} size="xs" />
                              </div>
                              {a.isHoje ? <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" /> : null}
                              <div className="flex-1 min-w-0">
                                <span className={`font-medium inline-flex items-center gap-1 flex-wrap ${a.isHoje ? 'text-amber-800' : ''}`}><span className="truncate">{a.nome}</span> <EmpStatusBadge status={a.status} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></span>
                                <span className="block text-muted-foreground text-[10px]">{a.funcao}{a.obra ? ` · ${a.obra}` : ''}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <Badge className={`text-[10px] ${a.isHoje ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                  {a.anosEmpresa} ano{a.anosEmpresa !== 1 ? 's' : ''}
                                </Badge>
                                <p className="text-[10px] text-muted-foreground mt-0.5">dia {a.dia}</p>
                              </div>
                            </div>
                          ))}
                          {homeData.aniversariosEmpresa.length > 6 && (
                            <button
                              onClick={() => setAniversariosFullOpen(true)}
                              className="w-full text-[11px] text-blue-600 hover:text-blue-800 font-medium text-center pt-2 pb-1 hover:underline flex items-center justify-center gap-1 transition-colors"
                            >
                              <ChevronRight className="h-3 w-3" />
                              Ver todos — +{homeData.aniversariosEmpresa.length - 6} mais este mês
                            </button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {(homeData?.advertenciasRecentes?.length ?? 0) > 0 ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-orange-500" />
                            Advertências Recentes
                          </CardTitle>
                          <button onClick={() => setCardExpand('advertencias')} className="p-1 rounded hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Expandir em tela cheia"><Maximize2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {homeData!.advertenciasRecentes!.map((a: any) => (
                            <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-accent/50 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <PersonPhoto src={a.fotoUrl} alt={a.nome} size="xs" />
                                <span className="font-medium flex items-center gap-1 min-w-0 flex-wrap"><span className="truncate">{a.nome}</span><EmpStatusBadge status={a.empStatus} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
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

      {/* ===== FULL SCREEN CARD EXPAND ===== */}
      <FullScreenDialog
        open={!!cardExpand}
        onClose={() => setCardExpand(null)}
        title={
          cardExpand === 'aniversariantes' ? `Aniversariantes — ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][anivMes - 1]}` :
          cardExpand === 'ferias-painel' ? 'Férias — Painel Rápido' :
          cardExpand === 'asos' ? 'ASOs — Atenção Necessária' :
          cardExpand === 'ferias-periodo' ? 'Férias — Período Aquisitivo' :
          cardExpand === 'movimentacoes' ? 'Movimentações (30 dias)' :
          cardExpand === 'aniversarios-empresa' ? 'Aniversários de Empresa' :
          cardExpand === 'advertencias' ? 'Advertências Recentes' : ''
        }
        icon={
          cardExpand === 'aniversariantes' ? <Cake className="h-5 w-5" /> :
          cardExpand === 'ferias-painel' ? <Plane className="h-5 w-5" /> :
          cardExpand === 'asos' ? <HeartPulse className="h-5 w-5" /> :
          cardExpand === 'ferias-periodo' ? <CalendarClock className="h-5 w-5" /> :
          cardExpand === 'movimentacoes' ? <Activity className="h-5 w-5" /> :
          cardExpand === 'aniversarios-empresa' ? <Award className="h-5 w-5" /> :
          <ShieldAlert className="h-5 w-5" />
        }
        headerActions={
          cardExpand === 'aniversariantes' ? (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="text-white border-white/30 hover:bg-white/10 h-8 w-8 p-0" onClick={() => setAnivMes(m => m === 1 ? 12 : m - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="text-white border-white/30 hover:bg-white/10 h-8 w-8 p-0" onClick={() => setAnivMes(m => m === 12 ? 1 : m + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : cardExpand === 'asos' ? (
            <Button variant="outline" size="sm" className="text-white border-white/30 hover:bg-white/10 gap-1" onClick={() => { setCardExpand(null); navigate('/controle-documentos'); }}>
              <ExternalLink className="h-4 w-4" /> Ver Controle de Documentos
            </Button>
          ) : cardExpand === 'ferias-painel' || cardExpand === 'ferias-periodo' ? (
            <Button variant="outline" size="sm" className="text-white border-white/30 hover:bg-white/10 gap-1" onClick={() => { setCardExpand(null); navigate('/ferias'); }}>
              <ExternalLink className="h-4 w-4" /> Ir para Férias
            </Button>
          ) : null
        }
      >
        <div className="p-6">
          {/* ── ANIVERSARIANTES DO MÊS ── */}
          {cardExpand === 'aniversariantes' && (
            <div className="space-y-2">
              {anivMesLoading ? (
                <p className="text-center text-muted-foreground py-12">Carregando...</p>
              ) : !anivMesData?.length ? (
                <p className="text-center text-muted-foreground py-12">Nenhum aniversariante em {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][anivMes - 1]}</p>
              ) : anivMesData.map((a: any, i: number) => (
                <div key={a.id} onClick={() => { setCardExpand(null); navigate('/colaboradores'); }}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${a.isHoje ? 'border-pink-300 bg-pink-50 hover:bg-pink-100' : a.jaPassou ? 'border-border bg-muted/30 opacity-60' : 'border-border bg-card hover:bg-accent/50'}`}>
                  <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <PersonPhoto src={a.fotoUrl} alt={a.nome} size="md" />
                  </div>
                  {a.isHoje ? <span className="text-2xl shrink-0">🎂</span> : null}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base flex items-center gap-1.5 flex-wrap">{a.nome}<EmpStatusBadge status={a.status} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} size="sm" /></p>
                    <p className="text-sm text-muted-foreground">
                      {a.funcao || ''}
                      {a.obra ? <span className="ml-2 text-blue-600 font-medium">· 📍 {a.obra}</span> : ''}
                    </p>
                  </div>
                  <Badge className={`text-sm px-3 shrink-0 ${a.isHoje ? 'bg-pink-500 text-white' : a.jaPassou ? 'bg-gray-100 text-gray-500' : 'bg-slate-100 text-slate-700'}`}>
                    {a.isHoje ? '🎉 Hoje!' : a.jaPassou ? `Dia ${a.dia} (passou)` : `Dia ${a.dia}`}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* ── FÉRIAS PAINEL RÁPIDO ── */}
          {cardExpand === 'ferias-painel' && (
            <div className="space-y-6">
              {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-blue-600 uppercase mb-3 flex items-center gap-2"><Plane className="h-4 w-4" /> De Férias Agora ({homeData!.feriasDashboard.emAndamento.length})</h3>
                  <div className="space-y-2">
                    {homeData!.feriasDashboard.emAndamento.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <PersonPhoto src={f.fotoUrl} alt={f.nome} size="md" />
                          <div className="min-w-0">
                            <p className="font-semibold text-base inline-flex items-center gap-1.5 flex-wrap"><span className="truncate">{f.nome}</span><CipaBadge ativo={f.cipaAtivo} estabilidade={f.cipaEstabilidade} fim={f.cipaFimEstabilidade} cargo={f.cipaCargo} size="sm" /></p>
                            {f.funcao && <p className="text-sm text-muted-foreground truncate">{f.funcao}</p>}
                            {f.obra ? <p className="text-xs text-blue-600 font-medium truncate">📍 {f.obra}</p> : null}
                          </div>
                        </div>
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-300 text-sm px-3 shrink-0">volta em {f.diasRestantes}d</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(homeData?.feriasDashboard?.agendadas?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-600 uppercase mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Próximas Agendadas ({homeData!.feriasDashboard.agendadas.length})</h3>
                  <div className="space-y-2">
                    {homeData!.feriasDashboard.agendadas.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <PersonPhoto src={f.fotoUrl} alt={f.nome} size="md" />
                          <div className="min-w-0">
                            <p className="font-semibold text-base inline-flex items-center gap-1.5 flex-wrap"><span className="truncate">{f.nome}</span><CipaBadge ativo={f.cipaAtivo} estabilidade={f.cipaEstabilidade} fim={f.cipaFimEstabilidade} cargo={f.cipaCargo} size="sm" /></p>
                            {f.funcao && <p className="text-sm text-muted-foreground truncate">{f.funcao}</p>}
                            {f.obra ? <p className="text-xs text-blue-600 font-medium truncate">📍 {f.obra}</p> : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge className="bg-green-100 text-green-700 border border-green-300 text-sm px-3">{f.diasGozo}d de gozo</Badge>
                          <p className="text-xs text-muted-foreground mt-1">começa em {f.diasAteInicio}d</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {canSeeValues && (homeData?.feriasDashboard?.custoProximo90Dias ?? 0) > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4 text-orange-600" /> Custo estimado próximos 90 dias</span>
                  <span className="font-bold text-orange-700 text-lg">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(homeData!.feriasDashboard.custoProximo90Dias)}</span>
                </div>
              )}
              {(homeData?.feriasDashboard?.emAndamento?.length ?? 0) === 0 && (homeData?.feriasDashboard?.agendadas?.length ?? 0) === 0 && (
                <p className="text-center text-muted-foreground py-12">Nenhuma férias em andamento ou agendada</p>
              )}
            </div>
          )}

          {/* ── ASOs ATENÇÃO NECESSÁRIA ── */}
          {cardExpand === 'asos' && (
            <div className="space-y-2">
              {!homeData?.asosAlerta?.length && !homeData?.semAso?.length ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="font-semibold text-lg">Todos os ASOs estão em dia!</p>
                </div>
              ) : (
                <>
                  {(homeData?.asosAlerta ?? []).map((a: any) => (
                    <div key={a.employeeId} className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${a.vencido ? 'border-red-200 bg-red-50' : a.diasRestantes <= 15 ? 'border-orange-200 bg-orange-50' : 'border-border bg-card'}`}>
                      <PersonPhoto src={a.fotoUrl} alt={a.nome} size="md" />
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${a.vencido ? 'bg-red-100 text-red-700' : a.diasRestantes <= 15 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        <HeartPulse className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base flex items-center gap-1.5 flex-wrap">{a.nome}<EmpStatusBadge status={a.status} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} size="sm" /></p>
                        {a.funcao && <p className="text-sm text-muted-foreground">{a.funcao}</p>}
                      </div>
                      <Badge className={`text-sm px-3 shrink-0 ${a.vencido ? 'bg-red-100 text-red-700 border border-red-300' : a.diasRestantes <= 15 ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-yellow-100 text-yellow-700 border border-yellow-300'}`}>
                        {a.vencido ? `Vencido há ${Math.abs(a.diasRestantes)}d` : `${a.diasRestantes}d restantes`}
                      </Badge>
                    </div>
                  ))}
                  {(homeData?.semAso?.length ?? 0) > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-semibold text-red-600 mb-2">{homeData!.semAso!.length} funcionário{homeData!.semAso!.length !== 1 ? 's' : ''} sem ASO cadastrado:</p>
                      <div className="space-y-2">
                        {homeData!.semAso!.map((e: any) => (
                          <div key={e.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
                            <PersonPhoto src={e.fotoUrl} alt={e.nome} size="md" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base flex items-center gap-1.5 flex-wrap">{e.nome}<EmpStatusBadge status={e.status} /><CipaBadge ativo={e.cipaAtivo} estabilidade={e.cipaEstabilidade} fim={e.cipaFimEstabilidade} cargo={e.cipaCargo} size="sm" /></p>
                              {e.funcao && <p className="text-sm text-muted-foreground">{e.funcao}</p>}
                            </div>
                            <Badge className="bg-gray-100 text-gray-600 border border-gray-300 text-sm px-3">Sem ASO</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── FÉRIAS PERÍODO AQUISITIVO ── */}
          {cardExpand === 'ferias-periodo' && (
            <div className="space-y-2">
              {!homeData?.feriasAlerta?.length ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="font-semibold text-lg">Nenhum alerta de férias no momento!</p>
                </div>
              ) : homeData.feriasAlerta.map((f: any, i: number) => (
                <div key={f.id} className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${f.urgente ? (f.diasParaVencer <= 0 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50') : 'border-border bg-card'}`}>
                  <span className={`text-xs font-bold w-5 text-center shrink-0 ${f.urgente ? (f.diasParaVencer <= 0 ? 'text-red-700' : 'text-amber-700') : 'text-slate-500'}`}>{i + 1}</span>
                  <PersonPhoto src={f.fotoUrl} alt={f.nome} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base inline-flex items-center gap-1.5 flex-wrap"><span className="truncate">{f.nome}</span><CipaBadge ativo={f.cipaAtivo} estabilidade={f.cipaEstabilidade} fim={f.cipaFimEstabilidade} cargo={f.cipaCargo} size="sm" /></p>
                    <p className="text-sm text-muted-foreground">{f.funcao} · vai abrir o {f.periodoAquisitivo}º período de férias (completa {f.periodoAquisitivo} ano{f.periodoAquisitivo > 1 ? 's' : ''} de empresa)</p>
                    {f.obra ? <p className="text-xs text-blue-600 font-medium truncate">📍 {f.obra}</p> : null}
                  </div>
                  <Badge className={`text-sm px-3 shrink-0 ${f.diasParaVencer <= 0 ? 'bg-red-100 text-red-700 border border-red-300' : f.urgente ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-yellow-100 text-yellow-700 border border-yellow-300'}`}>
                    {f.diasParaVencer <= 0 ? 'abre hoje' : `abre em ${f.diasParaVencer}d`}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* ── MOVIMENTAÇÕES 30 DIAS ── */}
          {cardExpand === 'movimentacoes' && (
            <div className="space-y-2">
              {!homeData?.movimentacoes?.length ? (
                <p className="text-center text-muted-foreground py-12">Nenhuma movimentação nos últimos 30 dias</p>
              ) : homeData.movimentacoes.map((m: any, i: number) => (
                <div key={`${m.tipo}-${m.id}-${i}`} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all">
                  <PersonPhoto src={m.fotoUrl} alt={m.nome} size="md" />
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${m.tipo === 'admissao' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {m.tipo === 'admissao' ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base inline-flex items-center gap-1.5 flex-wrap"><span className="truncate">{m.nome}</span><CipaBadge ativo={m.cipaAtivo} estabilidade={m.cipaEstabilidade} fim={m.cipaFimEstabilidade} cargo={m.cipaCargo} size="sm" /></p>
                    <p className="text-sm text-muted-foreground">{m.funcao}</p>
                    {m.obra ? <p className="text-xs text-blue-600 font-medium truncate">📍 {m.obra}</p> : null}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={`text-sm px-3 ${m.tipo === 'admissao' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
                      {m.tipo === 'admissao' ? 'Admissão' : 'Demissão'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(m.data + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ANIVERSÁRIOS DE EMPRESA ── */}
          {cardExpand === 'aniversarios-empresa' && (
            <div className="space-y-2">
              {!homeData?.aniversariosEmpresa?.length ? (
                <p className="text-center text-muted-foreground py-12">Nenhum aniversário de empresa este mês</p>
              ) : homeData.aniversariosEmpresa.map((a: any, i: number) => (
                <div key={a.id} onClick={() => { setCardExpand(null); navigate('/colaboradores'); }}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${a.isHoje ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-border bg-card hover:bg-accent/50'}`}>
                  <span className={`text-xs font-bold w-5 text-center shrink-0 ${a.isHoje ? 'text-amber-800' : 'text-slate-500'}`}>{i + 1}</span>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <PersonPhoto src={a.fotoUrl} alt={a.nome} size="md" />
                  </div>
                  {a.isHoje ? <Trophy className="h-5 w-5 text-amber-600 shrink-0" /> : null}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-base flex items-center gap-1.5 flex-wrap ${a.isHoje ? 'text-amber-800' : ''}`}>{a.nome}<EmpStatusBadge status={a.status} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} size="sm" /></p>
                    <p className="text-sm text-muted-foreground">{a.funcao}{a.obra ? ` · ${a.obra}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <Badge className={`text-sm px-3 ${a.isHoje ? 'bg-amber-500 text-white' : a.anosEmpresa >= 5 ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-slate-100 text-slate-700'}`}>
                      {a.anosEmpresa} ano{a.anosEmpresa !== 1 ? 's' : ''}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{a.isHoje ? '🎉 Hoje!' : a.jaPassou ? `Dia ${a.dia} (passou)` : `Dia ${a.dia}`}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* ── ADVERTÊNCIAS RECENTES ── */}
          {cardExpand === 'advertencias' && (
            <div className="space-y-2">
              {!homeData?.advertenciasRecentes?.length ? (
                <p className="text-center text-muted-foreground py-12">Nenhuma advertência recente</p>
              ) : homeData.advertenciasRecentes.map((a: any) => (
                <div key={a.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all">
                  <PersonPhoto src={a.fotoUrl} alt={a.nome} size="md" />
                  <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <ShieldAlert className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base flex items-center gap-1.5 flex-wrap">{a.nome}<EmpStatusBadge status={a.empStatus} /><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} size="sm" /></p>
                    {a.funcao && <p className="text-sm text-muted-foreground">{a.funcao}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline" className="text-sm px-3">{a.tipo}</Badge>
                    <span className="text-sm text-muted-foreground">{a.data ? new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </FullScreenDialog>

      {/* ===== DIALOG TODOS OS ANIVERSÁRIOS DE EMPRESA ===== */}
      <Dialog open={aniversariosFullOpen} onOpenChange={setAniversariosFullOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[92vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5 text-amber-500" />
              Aniversários de Empresa — Mês Atual
              <Badge className="bg-amber-100 text-amber-700 text-sm ml-1">{homeData?.aniversariosEmpresa?.length ?? 0} funcionários</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden pr-2">
            <div className="space-y-2 py-2">
              {(homeData?.aniversariosEmpresa ?? []).map((a: any, i: number) => (
                <div
                  key={a.id}
                  onClick={() => { setAniversariosFullOpen(false); navigate("/colaboradores"); }}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${a.isHoje ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-border bg-card hover:bg-accent/50'}`}
                >
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${a.isHoje ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                    {a.isHoje ? <Trophy className="h-5 w-5 text-amber-600" /> : <span>{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-base flex items-center gap-1.5 flex-wrap ${a.isHoje ? 'text-amber-800' : ''}`}>{a.nome}<EmpStatusBadge status={a.status} /></p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {a.funcao}
                      {a.obra ? <span className="ml-2 text-blue-600 font-medium">· {a.obra}</span> : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <Badge className={`text-sm px-3 py-0.5 ${a.isHoje ? 'bg-amber-500 text-white' : a.anosEmpresa >= 5 ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-slate-100 text-slate-700'}`}>
                      {a.anosEmpresa} ano{a.anosEmpresa !== 1 ? 's' : ''}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {a.isHoje ? '🎉 Hoje!' : a.jaPassou ? `Dia ${a.dia} (passou)` : `Dia ${a.dia}`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG EXPANSÃO KPI ===== */}
      <Dialog open={!!kpiExpand} onOpenChange={(o) => { if (!o) setKpiExpand(null); }}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Info className="h-5 w-5 text-blue-500" />
              {kpiExpand?.title}
              <Badge variant="secondary" className="text-sm ml-1">{kpiExpand?.items.length ?? 0} funcionário{(kpiExpand?.items.length ?? 0) !== 1 ? 's' : ''}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-y-auto overflow-x-hidden pr-2">
            <div className="space-y-2 py-2">
              {kpiExpand?.items.map((item, i) => (
                <div key={i} className={`flex items-center gap-4 px-4 py-3 rounded-lg border text-sm ${item.urgencia === 'critico' ? 'border-red-200 bg-red-50' : item.urgencia === 'urgente' ? 'border-orange-200 bg-orange-50' : 'border-border bg-card'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${item.urgencia === 'critico' ? 'bg-red-100 text-red-700' : item.urgencia === 'urgente' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base flex items-center gap-1.5 flex-wrap">{item.nome}<EmpStatusBadge status={item.status} /></p>
                    {item.funcao && <p className="text-sm text-muted-foreground mt-0.5">{item.funcao}</p>}
                  </div>
                  {item.extra && (
                    <Badge className={`text-xs shrink-0 px-3 py-1 ${item.urgencia === 'critico' ? 'bg-red-100 text-red-700 border border-red-300' : item.urgencia === 'urgente' ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-yellow-100 text-yellow-700 border border-yellow-300'}`}>
                      {item.extra}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG DE ALERTAS ===== */}
      <Dialog open={alertasOpen} onOpenChange={setAlertasOpen}>
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none !m-0 flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-red-600" />
              Central de Alertas
              <Badge variant="destructive" className="text-xs">{alertasList.length}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 pt-3 pb-0 shrink-0 border-b">
            <Tabs value={alertaTab} onValueChange={setAlertaTab}>
              <TabsList className="w-full">
                <TabsTrigger value="todos" className="flex-1 text-xs">Todos ({alertasList.length})</TabsTrigger>
                <TabsTrigger value="aso" className="flex-1 text-xs">ASOs ({alertasList.filter((a: any) => a.tipo === 'aso').length})</TabsTrigger>
                <TabsTrigger value="ferias" className="flex-1 text-xs">Férias ({alertasList.filter((a: any) => a.tipo === 'ferias').length})</TabsTrigger>
                <TabsTrigger value="experiencia" className="flex-1 text-xs">Experiência ({alertasList.filter((a: any) => a.tipo === 'experiencia').length})</TabsTrigger>
                <TabsTrigger value="aviso" className="flex-1 text-xs">Avisos ({alertasList.filter((a: any) => a.tipo === 'aviso').length})</TabsTrigger>
                <TabsTrigger value="solicitacao_he" className="flex-1 text-xs">HE ({alertasList.filter((a: any) => a.tipo === 'solicitacao_he').length})</TabsTrigger>
                <TabsTrigger value="solicitacao_mo" className="flex-1 text-xs">MO ({alertasList.filter((a: any) => a.tipo === 'solicitacao_mo').length})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {filteredAlertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mb-3 text-green-500" />
                <p className="text-base font-medium">Nenhum alerta nesta categoria</p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2 pb-2">
                {filteredAlertas.map((alerta: any) => (
                  <div
                    key={alerta.id}
                    onClick={() => { navigate(alerta.link); setAlertasOpen(false); }}
                    className={`flex flex-col gap-1 p-2.5 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${
                      alerta.urgencia === 'critico' ? 'bg-red-50 border-red-200 hover:border-red-400' :
                      alerta.urgencia === 'urgente' ? 'bg-orange-50 border-orange-200 hover:border-orange-400' :
                      'bg-amber-50 border-amber-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                        alerta.urgencia === 'critico' ? 'bg-red-100' :
                        alerta.urgencia === 'urgente' ? 'bg-orange-100' : 'bg-amber-100'
                      }`}>
                        {alerta.tipo === 'aso' ? <HeartPulse className={`h-3 w-3 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} /> :
                         alerta.tipo === 'ferias' ? <CalendarClock className={`h-3 w-3 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} /> :
                         alerta.tipo === 'experiencia' ? <ClipboardCheck className={`h-3 w-3 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} /> :
                         alerta.tipo === 'solicitacao_he' ? <Clock className={`h-3 w-3 ${alerta.urgencia === 'critico' ? 'text-red-600' : 'text-blue-600'}`} /> :
                         alerta.tipo === 'solicitacao_mo' ? <Briefcase className={`h-3 w-3 ${alerta.urgencia === 'critico' ? 'text-red-600' : 'text-indigo-600'}`} /> :
                         <FileText className={`h-3 w-3 ${alerta.urgencia === 'critico' ? 'text-red-600' : alerta.urgencia === 'urgente' ? 'text-orange-600' : 'text-amber-600'}`} />}
                      </div>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate flex-1">{alerta.titulo}</span>
                      <Badge className={`text-[9px] px-1 py-0 shrink-0 ${
                        alerta.urgencia === 'critico' ? 'bg-red-600 text-white' :
                        alerta.urgencia === 'urgente' ? 'bg-orange-500 text-white' :
                        'bg-amber-500 text-white'
                      }`}>
                        {alerta.urgencia === 'critico' ? 'CRÍTICO' : alerta.urgencia === 'urgente' ? 'URGENTE' : 'ATENÇÃO'}
                      </Badge>
                    </div>
                    {alerta.tipo === 'solicitacao_he' || alerta.tipo === 'solicitacao_mo' ? (
                      <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{alerta.nome}</p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <PersonPhoto src={alerta.fotoUrl} alt={alerta.nome} size="sm" caption={alerta.titulo} />
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 flex-1 min-w-0">{alerta.nome}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-tight">{alerta.descricao}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
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

function KpiCard({ title, value, icon: Icon, color, onClick, badge, badgeColor, alert, onExpand }: {
  title: string; value: number; icon: any; color: string; onClick?: () => void; badge?: string; badgeColor?: string; alert?: boolean; onExpand?: () => void;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  const handleClick = onExpand ?? onClick;
  return (
    <Card className={`border-l-4 ${c.border} hover:shadow-md transition-all cursor-pointer ${alert ? "ring-2 ring-red-300 animate-pulse" : ""} ${onExpand ? "hover:scale-[1.02]" : ""}`} onClick={handleClick}>
      <CardContent className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-4 w-4 ${c.icon}`} />
          </div>
          <div className="flex items-center gap-1">
            {badge ? <Badge className={`text-[9px] ${badgeColor === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{badge}</Badge> : null}
            {onExpand && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          </div>
        </div>
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{title}</p>
        </div>
        {onExpand && onClick && (
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 w-fit mt-0.5"
          >
            Ver página <ArrowRight className="h-2.5 w-2.5" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}


function AvisoRescisaoDialog({ avisoId, onClose }: { avisoId: number | null; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'detalhes' | 'comparativo'>('detalhes');
  const utils = trpc.useUtils();
  const { data: aviso, isLoading } = trpc.avisoPrevio.avisoPrevio.getById.useQuery(
    { id: avisoId! },
    { enabled: !!avisoId }
  );
  const [mediasForm, setMediasForm] = useState({ mediaInsalubridade: '', mediaHorasExtras: '' });
  const [savingMedias, setSavingMedias] = useState(false);
  const editarAcerto = trpc.avisoPrevio.avisoPrevio.editarAcerto.useMutation({
    onSuccess: () => { setSavingMedias(false); utils.avisoPrevio.avisoPrevio.getById.invalidate({ id: avisoId! }); },
    onError: () => { setSavingMedias(false); },
  });
  useEffect(() => {
    if (aviso) {
      setMediasForm({
        mediaInsalubridade: (aviso as any).mediaInsalubridade || '',
        mediaHorasExtras: (aviso as any).mediaHorasExtras || '',
      });
    }
  }, [aviso]);

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

  const previsaoComplementar = (aviso as any)?.previsaoRescisaoComplementar ? (() => {
    try { return JSON.parse((aviso as any).previsaoRescisaoComplementar); } catch { return null; }
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

  // Rótulo do aviso prévio indenizado: no aviso TRABALHADO só os dias proporcionais EXCEDENTES
  // (diasExtrasAviso) são indenizados — os 30 dias-base foram trabalhados e pagos como salário
  // normal. No INDENIZADO, todo o aviso (diasAvisoTotal) é indenizado. Antes o rótulo mostrava
  // sempre diasAvisoTotal (ex.: "36 dias") mesmo quando o valor era só dos 6 dias excedentes.
  const tipoAviso = String((aviso as any)?.tipo || '');
  const avisoTrabalhado = tipoAviso.includes('trabalhado');
  const diasAvisoIndenizadosLabel = (p: any) =>
    avisoTrabalhado
      ? `Aviso Prévio Indenizado — dias proporcionais (${p?.diasExtrasAviso ?? '?'} dias)`
      : `Aviso Prévio Indenizado (${p?.diasAvisoTotal ?? p?.diasExtrasAviso ?? '?'} dias)`;

  // Build proventos rows
  const proventos: { label: string; value: string }[] = [];
  const descontos: { label: string; value: string }[] = [];
  if (previsao) {
    if (parseFloat(previsao.saldoSalario || '0') > 0)
      proventos.push({ label: `Saldo de Salário (${previsao.diasTrabalhadosMes || '?'} dias)`, value: previsao.saldoSalario });
    if (parseFloat(previsao.feriasProporcional || '0') > 0) {
      const hasMedias = parseFloat(previsao.mediaInsalubridade || '0') > 0 || parseFloat(previsao.mediaHorasExtras || '0') > 0;
      proventos.push({ label: `Férias Proporcionais (${previsao.mesesFerias || '?'}/12 avos)${hasMedias ? ' ★' : ''}`, value: previsao.feriasProporcional });
    }
    if (parseFloat(previsao.tercoConstitucional || '0') > 0)
      proventos.push({ label: '1/3 Constitucional (Férias Proporcionais)', value: previsao.tercoConstitucional });
    if (parseFloat(previsao.feriasVencidas || '0') > 0)
      proventos.push({ label: `Férias Vencidas${previsao.periodosVencidos ? ` (${previsao.periodosVencidos} período${previsao.periodosVencidos > 1 ? 's' : ''})` : ''}`, value: previsao.feriasVencidas });
    if (parseFloat(previsao.tercoFeriasVencidas || '0') > 0)
      proventos.push({ label: '1/3 Constitucional (Férias Vencidas)', value: previsao.tercoFeriasVencidas });
    if (parseFloat(previsao.decimoTerceiroProporcional || previsao.decimoTerceiro || '0') > 0) {
      const hasMedias13 = parseFloat(previsao.mediaInsalubridade || '0') > 0 || parseFloat(previsao.mediaHorasExtras || '0') > 0;
      proventos.push({ label: `13º Salário Proporcional (${previsao.meses13o || previsao.meses13 || '?'}/12 avos)${hasMedias13 ? ' ★' : ''}`, value: previsao.decimoTerceiroProporcional || previsao.decimoTerceiro });
    }
    if (parseFloat(previsao.avisoPrevioIndenizado || '0') > 0)
      proventos.push({ label: diasAvisoIndenizadosLabel(previsao), value: previsao.avisoPrevioIndenizado });
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

  // Composição gerencial do custo: 🟦 Grupo A (já provisionado / competência) x
  // 🟥 Grupo B (custo ADICIONAL gerado pela decisão de demitir). A parte da projeção
  // do aviso (avos extras de férias/13º — Súmula 371/OJ 82) vem pronta do server.
  const num = (k: string) => parseFloat((previsao as any)?.[k] || '0');
  // O incremento da projeção do aviso só é "custo adicional da demissão" quando a dispensa
  // parte do EMPREGADOR (sem justa causa). Em pedido de demissão (empregado_*), as férias/13º
  // ficam integralmente no Grupo A (provisão), sem destacar projeção no Grupo B.
  const isDemissaoEmpregador = String((aviso as any)?.tipo || '').startsWith('empregador');
  const fpProj = isDemissaoEmpregador ? num('feriasProporcionalProjecao') : 0;
  const tcProj = isDemissaoEmpregador ? num('tercoConstitucionalProjecao') : 0;
  const d13Proj = isDemissaoEmpregador ? num('decimoTerceiroProjecao') : 0;
  const grupoA: { label: string; value: string }[] = [];
  const grupoB: { label: string; value: string }[] = [];
  if (previsao) {
    if (num('saldoSalario') > 0)
      grupoA.push({ label: `Saldo de Salário (${previsao.diasTrabalhadosMes || '?'} dias)`, value: previsao.saldoSalario });
    if (num('feriasVencidas') > 0)
      grupoA.push({ label: `Férias Vencidas${previsao.periodosVencidos ? ` (${previsao.periodosVencidos} per.)` : ''}`, value: previsao.feriasVencidas });
    if (num('tercoFeriasVencidas') > 0)
      grupoA.push({ label: '1/3 Constitucional (Férias Vencidas)', value: previsao.tercoFeriasVencidas });
    if (num('feriasProporcional') - fpProj > 0.005)
      grupoA.push({ label: 'Férias Proporcionais (provisionadas até a demissão)', value: (num('feriasProporcional') - fpProj).toFixed(2) });
    if (num('tercoConstitucional') - tcProj > 0.005)
      grupoA.push({ label: '1/3 Constitucional (Férias Proporcionais)', value: (num('tercoConstitucional') - tcProj).toFixed(2) });
    if (num('decimoTerceiroProporcional') - d13Proj > 0.005)
      grupoA.push({ label: '13º Salário Proporcional (provisionado até a demissão)', value: (num('decimoTerceiroProporcional') - d13Proj).toFixed(2) });
    if (num('vrProporcional') > 0)
      grupoA.push({ label: 'VR/VA Proporcional', value: previsao.vrProporcional });
    if (num('avisoPrevioIndenizado') > 0)
      grupoB.push({ label: diasAvisoIndenizadosLabel(previsao), value: previsao.avisoPrevioIndenizado });
    if (num('multaFGTS') > 0)
      grupoB.push({ label: 'Multa 40% FGTS', value: previsao.multaFGTS });
    if (fpProj > 0.005)
      grupoB.push({ label: `Férias Prop. — incremento da projeção do aviso (+${previsao.incAvosFeriasProjecao || 0}/12 avos) ★`, value: fpProj.toFixed(2) });
    if (tcProj > 0.005)
      grupoB.push({ label: '1/3 Constitucional — incremento da projeção do aviso ★', value: tcProj.toFixed(2) });
    if (d13Proj > 0.005)
      grupoB.push({ label: `13º Prop. — incremento da projeção do aviso (+${previsao.incAvos13Projecao || 0}/12 avos) ★`, value: d13Proj.toFixed(2) });
  }
  const totalGrupoA = grupoA.reduce((s, r) => s + parseFloat(r.value || '0'), 0);
  const totalGrupoB = grupoB.reduce((s, r) => s + parseFloat(r.value || '0'), 0);
  const temProjecao = fpProj > 0.005 || d13Proj > 0.005;

  // Helper to build proventos list from a previsao object (for comparativo).
  // `isTrabalhado` distingue o cenário simulado: no trabalhado só os dias proporcionais
  // EXCEDENTES são indenizados; no indenizado, o aviso inteiro.
  const buildProventosFromPrevisao = (prev: any, isTrabalhado = false) => {
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
      items.push({ label: isTrabalhado ? `Aviso Prop. Indenizado (${prev.diasExtrasAviso ?? '?'}d)` : `Aviso Indenizado (${prev.diasAvisoTotal ?? prev.diasExtrasAviso ?? '?'}d)`, value: prev.avisoPrevioIndenizado });
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

              {/* Composição do Custo — Já provisionado x Custo adicional da demissão */}
              {previsao && (totalGrupoA > 0 || totalGrupoB > 0) && (
                <div className="rounded-xl border-2 border-slate-200 p-4 sm:p-5 bg-slate-50/60">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Scale className="h-4 w-4" /> Composição do Custo — Provisionado x Adicional da Demissão
                  </h3>
                  <p className="text-[11px] text-slate-500 mb-4">
                    Separa o que a empresa já vinha provisionando ao longo do contrato (competência) do que é gerado exclusivamente pela decisão de demitir sem justa causa. A soma dos dois grupos é igual ao subtotal de proventos.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* 🟦 Grupo A — já era custo da empresa */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
                      <div className="px-4 py-2 bg-blue-100/70 border-b border-blue-200">
                        <p className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1.5"><span>🟦</span> Já era custo da empresa</p>
                        <p className="text-[10px] text-blue-600">Competência — provisionado mês a mês</p>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {grupoA.map((row, i) => (
                            <tr key={i} className="border-b border-blue-100 last:border-0">
                              <td className="px-4 py-2 text-slate-700">{row.label}</td>
                              <td className="px-4 py-2 text-right font-semibold text-blue-700 whitespace-nowrap">R$ {fmt(row.value)}</td>
                            </tr>
                          ))}
                          <tr className="bg-blue-100/60 font-bold">
                            <td className="px-4 py-2 text-blue-900">Subtotal Grupo A</td>
                            <td className="px-4 py-2 text-right text-blue-900 whitespace-nowrap">R$ {fmt(totalGrupoA)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {/* 🟥 Grupo B — custo adicional da demissão */}
                    <div className="rounded-lg border border-red-200 bg-red-50/60 overflow-hidden">
                      <div className="px-4 py-2 bg-red-100/70 border-b border-red-200">
                        <p className="text-xs font-bold text-red-800 uppercase flex items-center gap-1.5"><span>🟥</span> Custo adicional da demissão</p>
                        <p className="text-[10px] text-red-600">Gerado pela dispensa sem justa causa</p>
                      </div>
                      {grupoB.length > 0 ? (
                        <table className="w-full text-sm">
                          <tbody>
                            {grupoB.map((row, i) => (
                              <tr key={i} className="border-b border-red-100 last:border-0">
                                <td className="px-4 py-2 text-slate-700">{row.label}</td>
                                <td className="px-4 py-2 text-right font-semibold text-red-700 whitespace-nowrap">R$ {fmt(row.value)}</td>
                              </tr>
                            ))}
                            <tr className="bg-red-100/60 font-bold">
                              <td className="px-4 py-2 text-red-900">Subtotal Grupo B</td>
                              <td className="px-4 py-2 text-right text-red-900 whitespace-nowrap">R$ {fmt(totalGrupoB)}</td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <div className="px-4 py-6 text-center text-xs text-slate-400">Sem custo adicional (não houve dispensa sem justa causa).</div>
                      )}
                    </div>
                  </div>
                  {totalGrupoB > 0 && (
                    <div className="mt-4 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 text-white px-5 py-4 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide opacity-90">Custo adicional desta demissão</p>
                        <p className="text-[11px] opacity-80">{(totalGrupoA + totalGrupoB) > 0 ? `${((totalGrupoB / (totalGrupoA + totalGrupoB)) * 100).toFixed(0)}% do subtotal de proventos` : ''}</p>
                      </div>
                      <span className="text-2xl sm:text-3xl font-extrabold">R$ {fmt(totalGrupoB)}</span>
                    </div>
                  )}
                  {temProjecao && (
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      ★ <strong>Incremento da projeção do aviso:</strong> são os avos de férias/13º que só existem porque o aviso prévio projeta o término do contrato (Súmula 371 / OJ 82 TST). Por isso entram no custo da demissão, e não na provisão de competência.
                    </p>
                  )}
                </div>
              )}

              {/* Médias de Adicionais Habituais */}
              <div className="rounded-lg border border-violet-200 p-4 bg-violet-50/50">
                <p className="text-xs font-bold uppercase text-violet-600 mb-1 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Médias de Adicionais Habituais
                </p>
                <p className="text-[10px] text-violet-500 mb-3">
                  CLT Art. 142 §5º — Médias de insalubridade e horas extras habituais integram a base de cálculo de férias e 13º. Preencha e salve para recalcular.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-violet-700">Média Insalubridade (R$/mês)</label>
                    <Input
                      type="number" min="0" step="0.01" placeholder="0,00"
                      value={mediasForm.mediaInsalubridade}
                      onChange={e => setMediasForm(f => ({ ...f, mediaInsalubridade: e.target.value }))}
                      className="h-8 text-sm border-violet-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-violet-700">Média Horas Extras (R$/mês)</label>
                    <Input
                      type="number" min="0" step="0.01" placeholder="0,00"
                      value={mediasForm.mediaHorasExtras}
                      onChange={e => setMediasForm(f => ({ ...f, mediaHorasExtras: e.target.value }))}
                      className="h-8 text-sm border-violet-200"
                    />
                  </div>
                </div>
                {(parseFloat(mediasForm.mediaInsalubridade || '0') > 0 || parseFloat(mediasForm.mediaHorasExtras || '0') > 0) && (
                  <div className="mt-2 text-xs text-violet-700">
                    <span className="font-semibold">Base ampliada:</span> Salário R$ {fmt(aviso?.salarioBase)} + R$ {(parseFloat(mediasForm.mediaInsalubridade || '0') + parseFloat(mediasForm.mediaHorasExtras || '0')).toFixed(2).replace('.', ',')} = <span className="font-bold">R$ {fmt((parseFloat(String(aviso?.salarioBase || '0').replace(',','.')) + parseFloat(mediasForm.mediaInsalubridade || '0') + parseFloat(mediasForm.mediaHorasExtras || '0')).toFixed(2))}</span>
                  </div>
                )}
                <div className="flex justify-end mt-3">
                  <Button
                    size="sm" disabled={savingMedias}
                    className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => {
                      setSavingMedias(true);
                      editarAcerto.mutate({
                        id: aviso!.id,
                        descontosAcerto: (aviso as any)?.descontosAcerto || null,
                        descontosAcertoDesc: (aviso as any)?.descontosAcertoDesc || null,
                        acrescimosAcerto: (aviso as any)?.acrescimosAcerto || null,
                        acrescimosAcertoDesc: (aviso as any)?.acrescimosAcertoDesc || null,
                        mediaInsalubridade: mediasForm.mediaInsalubridade || null,
                        mediaHorasExtras: mediasForm.mediaHorasExtras || null,
                      });
                    }}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {savingMedias ? 'Recalculando...' : 'Salvar e Recalcular'}
                  </Button>
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

              {/* Card 2: Rescisão Complementar (uso interno) — só aparece se houver complemento */}
              {previsaoComplementar && (
                <div className="rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-violet-700 tracking-wider">USO INTERNO — não oficial</p>
                      <h3 className="text-base font-bold text-violet-900 mt-1">Rescisão Complementar (sobre valor "por fora")</h3>
                      <p className="text-[11px] text-violet-700 mt-1">
                        Calculada apenas sobre o complemento salarial de R$ {fmt(previsaoComplementar.valorComplemento)} (não inclui FGTS, multa 40%, VR ou médias). Não substitui o TRCT oficial.
                      </p>
                    </div>
                    <span className="text-2xl font-extrabold text-violet-700 whitespace-nowrap">R$ {fmt(previsaoComplementar.total)}</span>
                  </div>
                  <div className="border border-violet-200 rounded-lg overflow-hidden bg-white/60">
                    <table className="w-full text-sm">
                      <tbody>
                        {parseFloat(previsaoComplementar.saldoSalario || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Saldo de Salário ({previsaoComplementar.diasTrabalhadosMes || '?'}d)</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.saldoSalario)}</td></tr>
                        )}
                        {parseFloat(previsaoComplementar.feriasProporcional || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Férias Proporcionais ({previsaoComplementar.mesesFerias}/12)</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.feriasProporcional)}</td></tr>
                        )}
                        {parseFloat(previsaoComplementar.tercoConstitucional || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">1/3 Constitucional</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.tercoConstitucional)}</td></tr>
                        )}
                        {parseFloat(previsaoComplementar.feriasVencidas || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Férias Vencidas{previsaoComplementar.periodosVencidos ? ` (${previsaoComplementar.periodosVencidos})` : ''}</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.feriasVencidas)}</td></tr>
                        )}
                        {parseFloat(previsaoComplementar.tercoFeriasVencidas || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">1/3 Férias Vencidas</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.tercoFeriasVencidas)}</td></tr>
                        )}
                        {parseFloat(previsaoComplementar.decimoTerceiroProporcional || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">13º Proporcional ({previsaoComplementar.meses13o}/12)</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.decimoTerceiroProporcional)}</td></tr>
                        )}
                        {parseFloat(previsaoComplementar.avisoPrevioIndenizado || '0') > 0 && (
                          <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Aviso Prévio Indenizado</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">R$ {fmt(previsaoComplementar.avisoPrevioIndenizado)}</td></tr>
                        )}
                        <tr className="bg-violet-100 font-bold">
                          <td className="px-3 py-2 text-violet-900">TOTAL COMPLEMENTAR</td>
                          <td className="px-3 py-2 text-right text-violet-900 whitespace-nowrap">R$ {fmt(previsaoComplementar.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TOTAL GERAL (Oficial + Complementar) — só aparece se houver complementar */}
              {previsaoComplementar && (() => {
                const oficial = parseFloat(String(previsao?.totalLiquido || previsao?.total || aviso?.valorEstimadoTotal || '0'));
                const complementar = parseFloat(String(previsaoComplementar.total || '0'));
                const totalGeral = oficial + complementar;
                return (
                  <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-5 border-2 border-slate-700">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-lg font-bold text-white">TOTAL GERAL (Oficial + Complementar)</span>
                        <p className="text-[11px] text-slate-300">Soma do TRCT oficial com o cálculo interno sobre o complemento</p>
                      </div>
                      <span className="text-3xl font-extrabold text-white">R$ {fmt(totalGeral.toFixed(2))}</span>
                    </div>
                    <div className="flex justify-end gap-4 mt-2 text-[11px] text-slate-300">
                      <span>Oficial: R$ {fmt(oficial.toFixed(2))}</span>
                      <span>Complementar: R$ {fmt(complementar.toFixed(2))}</span>
                    </div>
                  </div>
                );
              })()}

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
                          {buildProventosFromPrevisao(comparativo.trabalhado.previsao, true).map((item, i) => (
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
