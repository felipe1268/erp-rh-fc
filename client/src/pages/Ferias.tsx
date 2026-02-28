import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, formatMoeda } from "@/lib/formatters";
import {
  Palmtree, Plus, Search, Calendar, DollarSign, AlertTriangle,
  Users, Trash2, Eye, X, RefreshCw, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, Ban, CalendarDays, TrendingUp,
  Zap, CheckCheck, PenLine, Info, Loader2, ArrowRight,
} from "lucide-react";
import { useState, useMemo } from "react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-100" },
  agendada: { label: "Agendada", color: "text-blue-700", bg: "bg-blue-100" },
  em_gozo: { label: "Em Gozo", color: "text-green-700", bg: "bg-green-100" },
  concluida: { label: "Concluída", color: "text-gray-700", bg: "bg-gray-100" },
  vencida: { label: "Vencida", color: "text-red-700", bg: "bg-red-100" },
  cancelada: { label: "Cancelada", color: "text-red-700", bg: "bg-red-50" },
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ============================================================
// DIALOG: Detalhes completos de férias do funcionário (Gantt click)
// ============================================================
function GanttEmployeeFeriasDialog({ companyId, employeeId, onClose, onDefinirData, refetch: parentRefetch }: {
  companyId: number;
  employeeId: number;
  onClose: () => void;
  onDefinirData: (item: any) => void;
  refetch: () => void;
}) {
  const { data, isLoading } = trpc.avisoPrevio.ferias.feriasDoFuncionario.useQuery(
    { companyId, employeeId },
    { enabled: !!companyId && !!employeeId }
  );
  const confirmarVencidasLote = trpc.avisoPrevio.ferias.confirmarVencidasLote.useMutation({
    onSuccess: (d: any) => { parentRefetch(); toast.success(`${d.confirmados} férias confirmada(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarPeriodos = trpc.avisoPrevio.ferias.gerarPeriodos.useMutation({
    onSuccess: (d: any) => { parentRefetch(); toast.success(`${d.periodosGerados} período(s) gerado(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });

  const STATUS_BADGE: Record<string, { label: string; variant: string; className: string }> = {
    pendente: { label: "Pendente", variant: "outline", className: "border-amber-400 text-amber-700 bg-amber-50" },
    agendada: { label: "Agendada", variant: "outline", className: "border-blue-400 text-blue-700 bg-blue-50" },
    em_gozo: { label: "Em Gozo", variant: "outline", className: "border-green-400 text-green-700 bg-green-50" },
    concluida: { label: "Concluída", variant: "outline", className: "border-gray-400 text-gray-700 bg-gray-100" },
    vencida: { label: "Vencida", variant: "destructive", className: "" },
    cancelada: { label: "Cancelada", variant: "outline", className: "border-gray-300 text-gray-500" },
  };

  return (
    <FullScreenDialog open={true} onClose={onClose} title="Detalhes de Férias do Funcionário" icon={<Palmtree className="h-5 w-5 text-white" />}>
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Carregando dados de férias...</span>
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-muted-foreground">Funcionário não encontrado</div>
        ) : (
          <>
            {/* Dados do funcionário */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2 bg-muted/30 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase">Colaborador</p>
                <p className="font-semibold text-lg">{data.funcionario.nome}</p>
                <p className="text-sm text-muted-foreground">{formatCPF(data.funcionario.cpf)} — {data.funcionario.cargo}</p>
                {data.funcionario.setor && <p className="text-xs text-muted-foreground mt-1">Setor: {data.funcionario.setor}</p>}
              </div>
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase">Admissão</p>
                <p className="font-semibold">{formatDate(data.funcionario.dataAdmissao)}</p>
                <p className="text-xs text-muted-foreground mt-1">Salário: {data.funcionario.salarioBase ? `R$ ${data.funcionario.salarioBase}` : '-'}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase">Status</p>
                <p className="font-semibold">{data.funcionario.status}</p>
              </div>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                <p className="text-xs text-blue-600 font-semibold uppercase">Total Períodos</p>
                <p className="text-2xl font-bold text-blue-700">{data.resumo.totalPeriodos}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                <p className="text-xs text-green-600 font-semibold uppercase">Registrados</p>
                <p className="text-2xl font-bold text-green-700">{data.resumo.totalRegistrados}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                <p className="text-xs text-amber-600 font-semibold uppercase">Não Registrados</p>
                <p className="text-2xl font-bold text-amber-700">{data.resumo.totalNaoRegistrados}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                <p className="text-xs text-red-600 font-semibold uppercase">Vencidas</p>
                <p className="text-2xl font-bold text-red-700">{data.resumo.totalVencidas}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                <p className="text-xs text-purple-600 font-semibold uppercase">Valor Estimado</p>
                <p className="text-xl font-bold text-purple-700">{formatMoeda(parseFloat(data.resumo.valorTotalEstimado))}</p>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => gerarPeriodos.mutate({ companyId, employeeId })}
                disabled={gerarPeriodos.isPending}
              >
                <Zap className="h-4 w-4 mr-1" />
                {gerarPeriodos.isPending ? 'Gerando...' : 'Gerar Períodos Automáticos'}
              </Button>
              {data.resumo.totalVencidas > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => {
                    const vencidaIds = data.periodosRegistrados.filter((p: any) => p.vencida === 1 || p.status === 'vencida').map((p: any) => p.id);
                    if (vencidaIds.length > 0 && confirm(`Confirmar ${vencidaIds.length} férias vencidas como pagas?`)) {
                      confirmarVencidasLote.mutate({ ids: vencidaIds, observacao: 'Confirmado via detalhes do funcionário' });
                    }
                  }}
                  disabled={confirmarVencidasLote.isPending}
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  {confirmarVencidasLote.isPending ? 'Confirmando...' : 'Confirmar Vencidas como Pagas'}
                </Button>
              )}
            </div>

            {/* Períodos Registrados */}
            {data.periodosRegistrados.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Períodos Registrados no Sistema ({data.periodosRegistrados.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Período Aquisitivo</th>
                        <th className="p-2 text-left">Concessivo Até</th>
                        <th className="p-2 text-left">Gozo</th>
                        <th className="p-2 text-left">Dias</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2 text-center">Status</th>
                        <th className="p-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.periodosRegistrados.map((p: any, i: number) => {
                        const st = STATUS_BADGE[p.status] || STATUS_BADGE.pendente;
                        const isVencida = p.vencida === 1 || p.status === 'vencida';
                        return (
                          <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/20 ${isVencida ? 'bg-red-50/50' : ''}`}>
                            <td className="p-2 text-muted-foreground">{p.numeroPeriodo || (i + 1)}º</td>
                            <td className="p-2">
                              <span className="font-medium">{formatDate(p.periodoAquisitivoInicio)}</span>
                              <span className="text-muted-foreground"> a </span>
                              <span className="font-medium">{formatDate(p.periodoAquisitivoFim)}</span>
                            </td>
                            <td className="p-2">{formatDate(p.periodoConcessivoFim)}</td>
                            <td className="p-2">
                              {p.dataInicio ? (
                                <span>{formatDate(p.dataInicio)} a {formatDate(p.dataFim)}</span>
                              ) : p.dataSugeridaInicio ? (
                                <span className="text-muted-foreground italic">Sugerido: {formatDate(p.dataSugeridaInicio)}</span>
                              ) : (
                                <span className="text-muted-foreground">Não definido</span>
                              )}
                            </td>
                            <td className="p-2">{p.diasGozo || 30}</td>
                            <td className="p-2 text-right font-bold">{formatMoeda(parseFloat(p.valorTotal || '0'))}</td>
                            <td className="p-2 text-center">
                              <Badge className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                              {p.pagamentoEmDobro === 1 && <Badge variant="destructive" className="ml-1 text-[9px]">2x</Badge>}
                              {p.dataAlteradaPeloRH === 1 && <Badge variant="outline" className="ml-1 text-[9px] border-purple-300 text-purple-600">RH</Badge>}
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {(p.status === 'pendente' || p.status === 'vencida') && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Definir Data" onClick={() => onDefinirData(p)}>
                                    <PenLine className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Períodos Não Registrados */}
            {data.periodosNaoRegistrados.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Períodos Não Registrados ({data.periodosNaoRegistrados.length})
                </h3>
                <p className="text-xs text-muted-foreground mb-2">Estes períodos foram calculados com base na data de admissão, mas ainda não foram registrados no sistema. Clique em "Gerar Períodos Automáticos" para registrá-los.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-amber-50/50">
                        <th className="p-2 text-left">Período Aquisitivo</th>
                        <th className="p-2 text-left">Concessivo Até</th>
                        <th className="p-2 text-right">Valor Estimado</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.periodosNaoRegistrados.map((p: any, i: number) => (
                        <tr key={i} className={`border-b last:border-0 ${p.vencida ? 'bg-red-50/50' : 'bg-amber-50/20'}`}>
                          <td className="p-2">
                            <span className="font-medium">{formatDate(p.periodoAquisitivoInicio)}</span>
                            <span className="text-muted-foreground"> a </span>
                            <span className="font-medium">{formatDate(p.periodoAquisitivoFim)}</span>
                          </td>
                          <td className="p-2">{formatDate(p.periodoConcessivoFim)}</td>
                          <td className="p-2 text-right font-bold">{formatMoeda(parseFloat(p.valorEstimado || '0'))}</td>
                          <td className="p-2 text-center">
                            <Badge variant={p.vencida ? 'destructive' : 'outline'} className="text-[10px]">
                              {p.vencida ? 'Vencida' : 'Pendente'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Observações */}
            {data.periodosRegistrados.some((p: any) => p.observacoes) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" /> Observações
                </h3>
                <div className="space-y-2">
                  {data.periodosRegistrados.filter((p: any) => p.observacoes).map((p: any) => (
                    <div key={p.id} className="bg-muted/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{p.numeroPeriodo}º Período ({formatDate(p.periodoAquisitivoInicio)} a {formatDate(p.periodoAquisitivoFim)})</p>
                      <p className="text-sm mt-1">{p.observacoes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </FullScreenDialog>
  );
}

export default function Ferias() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [tab, setTab] = useState("lista");
  const [anoCalendario, setAnoCalendario] = useState(new Date().getFullYear());
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});

  // Dialog para detalhamento do mês no Fluxo de Caixa
  const [showFluxoMesDialog, setShowFluxoMesDialog] = useState(false);
  const [fluxoMesSelecionado, setFluxoMesSelecionado] = useState<any>(null);

  // Dialog para detalhes de férias do funcionário (Gantt click)
  const [ganttEmployeeId, setGanttEmployeeId] = useState<number | null>(null);

  // Dialog para definir data de férias (RH override)
  const [showDefinirDialog, setShowDefinirDialog] = useState(false);
  const [definirItem, setDefinirItem] = useState<any>(null);
  const [definirForm, setDefinirForm] = useState<any>({});

  // Queries
  const { data: feriasList = [], refetch } = trpc.avisoPrevio.ferias.list.useQuery(
    { companyId, ...(statusFilter !== "todos" ? { status: statusFilter } : {}) },
    { enabled: !!companyId }
  );
  const { data: alertas } = trpc.avisoPrevio.ferias.alertas.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: calendarioCompleto = [] } = trpc.avisoPrevio.ferias.calendarioCompleto.useQuery(
    { companyId, ano: anoCalendario },
    { enabled: !!companyId && tab === "calendario" }
  );
  const { data: fluxoCaixa = [] } = trpc.avisoPrevio.ferias.fluxoCaixa.useQuery(
    { companyId, ano: anoCalendario },
    { enabled: !!companyId && tab === "fluxo" }
  );
  const { data: vencidasAgrupadas = [], refetch: refetchVencidas } = trpc.avisoPrevio.ferias.listarVencidas.useQuery(
    { companyId },
    { enabled: !!companyId && tab === "vencidas" }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // Mutations
  const createFerias = trpc.avisoPrevio.ferias.create.useMutation({
    onSuccess: () => { refetch(); toast.success("Férias registradas!"); setShowDialog(false); setForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateFerias = trpc.avisoPrevio.ferias.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Férias atualizadas!"); },
  });
  const deleteFerias = trpc.avisoPrevio.ferias.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Férias excluídas!"); },
  });
  const gerarPeriodos = trpc.avisoPrevio.ferias.gerarPeriodos.useMutation({
    onSuccess: (data: any) => { refetch(); toast.success(`${data.periodosGerados} período(s) gerado(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarPeriodosTodos = trpc.avisoPrevio.ferias.gerarPeriodosTodos.useMutation({
    onSuccess: (data: any) => {
      refetch();
      refetchVencidas();
      toast.success(`${data.totalCriados} período(s) gerado(s) para ${data.funcionariosProcessados} funcionário(s)!`);
      if (data.funcionariosSemAdmissao > 0) {
        toast.warning(`${data.funcionariosSemAdmissao} funcionário(s) sem data de admissão foram ignorados.`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
  const confirmarVencidasLote = trpc.avisoPrevio.ferias.confirmarVencidasLote.useMutation({
    onSuccess: (data: any) => {
      refetch(); refetchVencidas();
      toast.success(`${data.confirmados} férias confirmada(s) como paga(s)!`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const confirmarTodasVencidas = trpc.avisoPrevio.ferias.confirmarTodasVencidasFuncionario.useMutation({
    onSuccess: (data: any) => {
      refetch(); refetchVencidas();
      toast.success(`${data.confirmados} férias confirmada(s) como paga(s)!`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const definirDataFerias = trpc.avisoPrevio.ferias.definirDataFerias.useMutation({
    onSuccess: (data: any) => {
      refetch();
      setShowDefinirDialog(false);
      setDefinirItem(null);
      setDefinirForm({});
      toast.success(data.foiAlterada ? "Data definida (alterada da sugerida)!" : "Data de férias definida!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Employee search
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);
  const filteredEmps = activeEmployees.filter((e: any) => {
    if (!empSearch) return true;
    const s = empSearch.toLowerCase();
    return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, ""));
  });

  // Filtered list
  const filtered = useMemo(() => {
    return (feriasList as any[]).filter((a: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(a.employeeName || "").toLowerCase().includes(s) && !(a.employeeCpf || "").includes(s)) return false;
      }
      return true;
    });
  }, [feriasList, search]);

  // Stats
  const stats = useMemo(() => {
    const list = feriasList as any[];
    return {
      total: list.length,
      pendentes: list.filter(a => a.status === "pendente").length,
      agendadas: list.filter(a => a.status === "agendada").length,
      vencidas: list.filter(a => a.status === "vencida" || a.vencida).length,
      emGozo: list.filter(a => a.status === "em_gozo").length,
    };
  }, [feriasList]);

  // Calendar data grouped by employee
  const calendarioAgrupado = useMemo(() => {
    const map: Record<number, { employee: any; periodos: any[] }> = {};
    for (const row of calendarioCompleto as any[]) {
      if (!map[row.employeeId]) {
        map[row.employeeId] = {
          employee: { id: row.employeeId, nome: row.employeeName, cargo: row.employeeCargo, setor: row.employeeSetor },
          periodos: [],
        };
      }
      map[row.employeeId].periodos.push(row);
    }
    return Object.values(map);
  }, [calendarioCompleto]);

  const handleSubmit = () => {
    if (!form.employeeId || !form.periodoAquisitivoInicio || !form.periodoAquisitivoFim || !form.periodoConcessivoFim) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    createFerias.mutate({
      companyId,
      employeeId: form.employeeId,
      periodoAquisitivoInicio: form.periodoAquisitivoInicio,
      periodoAquisitivoFim: form.periodoAquisitivoFim,
      periodoConcessivoFim: form.periodoConcessivoFim,
      dataInicio: form.dataInicio || undefined,
      dataFim: form.dataFim || undefined,
      diasGozo: form.diasGozo || 30,
      fracionamento: form.fracionamento || 1,
      abonoPecuniario: form.abonoPecuniario || 0,
      observacoes: form.observacoes,
    });
  };

  const handleGerarPeriodos = (employeeId: number) => {
    gerarPeriodos.mutate({ companyId, employeeId });
  };

  const handleDefinirData = (item: any) => {
    setDefinirItem(item);
    setDefinirForm({
      dataInicio: item.dataInicio || item.dataSugeridaInicio || "",
      dataFim: item.dataFim || item.dataSugeridaFim || "",
      diasGozo: item.diasGozo || 30,
      observacoes: "",
    });
    setShowDefinirDialog(true);
  };

  const submitDefinirData = () => {
    if (!definirForm.dataInicio || !definirForm.dataFim) {
      toast.error("Preencha as datas");
      return;
    }
    definirDataFerias.mutate({
      id: definirItem.id,
      dataInicio: definirForm.dataInicio,
      dataFim: definirForm.dataFim,
      diasGozo: definirForm.diasGozo || 30,
      observacoes: definirForm.observacoes || undefined,
    });
  };

  // Helper: get color for calendar period
  const getCalendarColor = (periodo: any) => {
    const num = periodo.numeroPeriodo || 1;
    const isAlterado = periodo.dataAlteradaPeloRH;
    if (periodo.status === "concluida") return { bg: "bg-gray-300", text: "text-gray-700", label: "Concluída" };
    if (periodo.status === "em_gozo") return { bg: "bg-green-400", text: "text-green-800", label: "Em Gozo" };
    if (periodo.status === "vencida") return { bg: "bg-red-400", text: "text-red-800", label: "Vencida" };
    if (periodo.status === "cancelada") return { bg: "bg-gray-200", text: "text-gray-500", label: "Cancelada" };
    if (isAlterado) return { bg: "bg-purple-400", text: "text-purple-800", label: "Alterado RH" };
    // 1º período = azul, 2º+ = laranja
    if (num <= 1) return { bg: "bg-blue-400", text: "text-blue-800", label: "1º Período" };
    return { bg: "bg-orange-400", text: "text-orange-800", label: `${num}º Período` };
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Palmtree className="h-6 w-6 text-green-600" />
              Controle de Férias
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de férias conforme CLT Art. 129-145 — Períodos aquisitivos, concessivos e pagamentos
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => gerarPeriodosTodos.mutate({ companyId })}
              disabled={gerarPeriodosTodos.isPending}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              {gerarPeriodosTodos.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Gerar Períodos de Todos
            </Button>
            <Button variant="outline" onClick={() => { setShowDialog(true); setForm({}); }}>
              <Plus className="h-4 w-4 mr-2" /> Registrar Férias
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-amber-500" onClick={() => setStatusFilter("pendente")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pendentes}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-blue-500" onClick={() => setStatusFilter("agendada")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Agendadas</p>
              <p className="text-2xl font-bold text-blue-600">{stats.agendadas}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-red-500" onClick={() => { setStatusFilter("vencida"); setTab("vencidas"); }}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Vencidas</p>
              <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-green-500" onClick={() => setStatusFilter("em_gozo")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Em Gozo</p>
              <p className="text-2xl font-bold text-green-600">{stats.emGozo}</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {alertas && ((alertas.vencidas?.length || 0) > 0 || (alertas.prestesVencer?.length || 0) > 0) && (
          <div className="space-y-2">
            {(alertas.vencidas?.length || 0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {alertas.vencidas.length} Férias Vencidas — Pagamento em Dobro (Art. 137 CLT)
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.vencidas.slice(0, 5).map((v: any) => (
                    <p key={v.id} className="text-xs text-red-700">
                      <span className="font-medium cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(v.employeeId)}>{v.employeeName}</span>
                      {" — "}{v.employeeCargo} — Concessivo até {formatDate(v.periodoConcessivoFim)}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(alertas.prestesVencer?.length || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> {alertas.prestesVencer.length} Férias Prestes a Vencer (próximos 60 dias)
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.prestesVencer.slice(0, 5).map((v: any) => (
                    <p key={v.id} className="text-xs text-amber-700">
                      <span className="font-medium cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(v.employeeId)}>{v.employeeName}</span>
                      {" — "}{v.employeeCargo} — Concessivo até {formatDate(v.periodoConcessivoFim)}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="lista"><Users className="h-4 w-4 mr-1" /> Lista de Férias</TabsTrigger>
            <TabsTrigger value="vencidas" className="relative">
              <AlertTriangle className="h-4 w-4 mr-1" /> Férias Vencidas
              {stats.vencidas > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">{stats.vencidas}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendario"><CalendarDays className="h-4 w-4 mr-1" /> Calendário</TabsTrigger>
            <TabsTrigger value="fluxo"><TrendingUp className="h-4 w-4 mr-1" /> Fluxo de Caixa</TabsTrigger>
          </TabsList>

          {/* ===== ABA: LISTA ===== */}
          <TabsContent value="lista">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="em_gozo">Em Gozo</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Colaborador</th>
                        <th className="p-3 text-left font-medium">Período Aquisitivo</th>
                        <th className="p-3 text-left font-medium">Concessivo Até</th>
                        <th className="p-3 text-left font-medium">Início Gozo</th>
                        <th className="p-3 text-left font-medium">Fim Gozo</th>
                        <th className="p-3 text-center font-medium">Dias</th>
                        <th className="p-3 text-right font-medium">Valor Total</th>
                        <th className="p-3 text-left font-medium">Pagamento</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Nenhuma férias encontrada</td></tr>
                      ) : filtered.map((f: any) => {
                        const st = STATUS_LABELS[f.status] || STATUS_LABELS.pendente;
                        const isVencida = f.vencida || f.status === "vencida";
                        return (
                          <tr key={f.id} className={`border-b last:border-0 hover:bg-muted/20 ${isVencida ? "bg-red-50/50" : ""}`}>
                            <td className="p-3">
                              <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(f.employeeId)}>{f.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{f.employeeCargo}</div>
                            </td>
                            <td className="p-3 text-xs">{formatDate(f.periodoAquisitivoInicio)} a {formatDate(f.periodoAquisitivoFim)}</td>
                            <td className="p-3">
                              <span className={isVencida ? "text-red-600 font-semibold" : ""}>{formatDate(f.periodoConcessivoFim)}</span>
                              {isVencida && <Badge variant="destructive" className="ml-1 text-[10px]">VENCIDA</Badge>}
                            </td>
                            <td className="p-3">{formatDate(f.dataInicio)}</td>
                            <td className="p-3">{formatDate(f.dataFim)}</td>
                            <td className="p-3 text-center font-semibold">{f.diasGozo || 30}</td>
                            <td className="p-3 text-right font-semibold">{formatMoeda(f.valorTotal)}</td>
                            <td className="p-3 text-xs">{formatDate(f.dataPagamento)}</td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                {(f.status === "pendente" || f.status === "vencida") && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Definir Data" onClick={() => handleDefinirData(f)}>
                                    <PenLine className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedItem(f); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir?")) deleteFerias.mutate({ id: f.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ABA: FÉRIAS VENCIDAS ===== */}
          <TabsContent value="vencidas">
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-800">Férias Vencidas — Confirmação de Pagamento</h3>
                    <p className="text-sm text-red-700 mt-1">
                      Funcionários antigos podem ter férias vencidas que já foram pagas antes do sistema.
                      Confirme com <strong>1 clique</strong> se o período já foi pago, ou confirme <strong>todos de uma vez</strong> por funcionário.
                    </p>
                  </div>
                </div>
              </div>

              {(vencidasAgrupadas as any[]).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30 text-green-500" />
                  <p className="text-lg font-medium">Nenhuma férias vencida pendente!</p>
                  <p className="text-sm mt-1">Todos os períodos estão em dia ou já foram confirmados.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Botão confirmar TODAS de todos */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        const allIds = (vencidasAgrupadas as any[]).flatMap((g: any) => g.periodos.map((p: any) => p.id));
                        if (allIds.length === 0) return;
                        if (confirm(`Confirmar TODAS as ${allIds.length} férias vencidas como pagas?`)) {
                          confirmarVencidasLote.mutate({ ids: allIds, observacao: "Confirmação em lote geral" });
                        }
                      }}
                      disabled={confirmarVencidasLote.isPending}
                    >
                      {confirmarVencidasLote.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-2" />}
                      Confirmar Todas como Pagas
                    </Button>
                  </div>

                  {(vencidasAgrupadas as any[]).map((grupo: any) => (
                    <Card key={grupo.employee.id} className="border-l-4 border-l-red-400">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-semibold text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(grupo.employee.id)}>
                                {grupo.employee.nome}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {grupo.employee.cargo} · CPF: {formatCPF(grupo.employee.cpf)} · Admissão: {formatDate(grupo.employee.dataAdmissao)}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => {
                              if (confirm(`Confirmar TODOS os ${grupo.periodos.length} períodos de ${grupo.employee.nome} como pagos?`)) {
                                confirmarTodasVencidas.mutate({ companyId, employeeId: grupo.employee.id });
                              }
                            }}
                            disabled={confirmarTodasVencidas.isPending}
                          >
                            <CheckCheck className="h-3.5 w-3.5 mr-1" />
                            Confirmar Todos ({grupo.periodos.length})
                          </Button>
                        </div>

                        <div className="grid gap-2">
                          {grupo.periodos.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between bg-red-50/50 rounded-lg px-3 py-2 border border-red-100">
                              <div className="flex items-center gap-3">
                                <div className="text-center bg-red-100 rounded-lg px-2 py-1 min-w-[60px]">
                                  <p className="text-[10px] text-red-600 font-medium">Período</p>
                                  <p className="text-sm font-bold text-red-700">{p.numeroPeriodo || "?"}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    {formatDate(p.periodoAquisitivoInicio)} <ArrowRight className="inline h-3 w-3 mx-1" /> {formatDate(p.periodoAquisitivoFim)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Concessivo até: {formatDate(p.periodoConcessivoFim)}</p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => confirmarVencidasLote.mutate({ ids: [p.id] })}
                                disabled={confirmarVencidasLote.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Já foi pago ✓
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== ABA: CALENDÁRIO ===== */}
          <TabsContent value="calendario">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base">Calendário de Férias — {anoCalendario}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-lg w-16 text-center">{anoCalendario}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Legenda */}
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-blue-400" />
                    <span>1º Período</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-orange-400" />
                    <span>2º+ Período</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-purple-400" />
                    <span className="flex items-center gap-0.5">Alterado pelo RH <PenLine className="h-3 w-3" /></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-green-400" />
                    <span>Em Gozo</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-red-400" />
                    <span>Vencida</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-gray-300" />
                    <span>Concluída</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-3 rounded-full border-2 border-dashed border-blue-400" />
                    <span>Data Sugerida</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {calendarioAgrupado.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma férias encontrada para {anoCalendario}</p>
                    <p className="text-sm mt-2">Clique em <strong>"Gerar Períodos de Todos"</strong> para calcular automaticamente.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium min-w-[180px]">Colaborador</th>
                          {MESES.map(m => <th key={m} className="p-1 text-center font-medium text-xs min-w-[60px]">{m}</th>)}
                          <th className="p-2 text-center font-medium text-xs min-w-[80px]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calendarioAgrupado.map((grupo: any) => (
                          <tr key={grupo.employee.id} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="p-2">
                              <div className="font-medium text-blue-700 cursor-pointer hover:underline text-xs" onClick={() => setRaioXEmployeeId(grupo.employee.id)}>
                                {grupo.employee.nome}
                              </div>
                              <div className="text-[10px] text-muted-foreground">{grupo.employee.cargo}</div>
                            </td>
                            {MESES.map((_, mesIdx) => {
                              // Find periods that overlap this month
                              const periodosMes = grupo.periodos.filter((p: any) => {
                                const inicio = p.dataInicio || p.dataSugeridaInicio;
                                const fim = p.dataFim || p.dataSugeridaFim;
                                if (!inicio && !fim) {
                                  // Fallback: use concessivo fim
                                  const conc = p.periodoConcessivoFim ? new Date(p.periodoConcessivoFim + 'T00:00:00') : null;
                                  if (conc) {
                                    const concMonth = conc.getMonth();
                                    const concYear = conc.getFullYear();
                                    return concYear === anoCalendario && concMonth === mesIdx;
                                  }
                                  return false;
                                }
                                const dInicio = new Date(inicio + 'T00:00:00');
                                const dFim = new Date(fim + 'T00:00:00');
                                const mesStart = new Date(anoCalendario, mesIdx, 1);
                                const mesEnd = new Date(anoCalendario, mesIdx + 1, 0);
                                return dInicio <= mesEnd && dFim >= mesStart;
                              });

                              if (periodosMes.length === 0) return <td key={mesIdx} className="p-1" />;

                              return (
                                <td key={mesIdx} className="p-1">
                                  {periodosMes.map((p: any) => {
                                    const color = getCalendarColor(p);
                                    const isSugerida = !p.dataInicio && p.dataSugeridaInicio;
                                    return (
                                      <div
                                        key={p.id}
                                        className={`h-5 rounded text-[9px] font-medium flex items-center justify-center cursor-pointer mb-0.5 ${
                                          isSugerida
                                            ? `border-2 border-dashed ${color.bg.replace('bg-', 'border-')} bg-opacity-30 ${color.text}`
                                            : `${color.bg} text-white`
                                        }`}
                                        title={`${grupo.employee.nome}\n${color.label}\n${p.dataInicio ? 'Definido' : 'Sugerido'}: ${formatDate(p.dataInicio || p.dataSugeridaInicio)} - ${formatDate(p.dataFim || p.dataSugeridaFim)}${p.dataAlteradaPeloRH ? '\n⚠️ Data alterada pelo RH' : ''}`}
                                        onClick={() => handleDefinirData(p)}
                                      >
                                        {p.dataAlteradaPeloRH ? (
                                          <PenLine className="h-3 w-3" />
                                        ) : isSugerida ? (
                                          <span className="opacity-60">?</span>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            })}
                            <td className="p-2 text-center">
                              {grupo.periodos.some((p: any) => p.status === 'pendente' || p.status === 'vencida') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] text-blue-600"
                                  onClick={() => {
                                    const first = grupo.periodos.find((p: any) => p.status === 'pendente' || p.status === 'vencida');
                                    if (first) handleDefinirData(first);
                                  }}
                                >
                                  <PenLine className="h-3 w-3 mr-0.5" /> Definir
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ABA: FLUXO DE CAIXA ===== */}
          <TabsContent value="fluxo">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Fluxo de Caixa Prévio — {anoCalendario}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-lg w-16 text-center">{anoCalendario}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {(fluxoCaixa as any[]).map((m: any) => (
                    <div
                      key={m.mes}
                      className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${m.totalFuncionarios > 0 ? "bg-green-50 border-green-200 hover:border-green-400" : "bg-muted/20 hover:border-muted-foreground/30"}`}
                      onClick={() => { setFluxoMesSelecionado(m); setShowFluxoMesDialog(true); }}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{m.nomeMes}</p>
                        <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-2xl font-bold mt-1">{formatMoeda(m.valorTotal)}</p>
                      <p className="text-xs text-muted-foreground">{m.totalFuncionarios} funcionário(s)</p>
                      {m.funcionarios?.slice(0, 3).map((f: any) => (
                        <div key={f.id} className="mt-2 text-xs border-t pt-1">
                          <span className="font-medium">{f.nome}</span>
                          <span className="text-muted-foreground ml-1">{formatMoeda(f.valorEstimado)}</span>
                          {f.vencida && <Badge variant="destructive" className="ml-1 text-[9px]">VENCIDA</Badge>}
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground mt-2 text-center opacity-60">Clique para detalhes</p>
                    </div>
                  ))}
                </div>
                {(fluxoCaixa as any[]).length > 0 && (
                  <>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 flex justify-between items-center">
                    <span className="font-semibold text-blue-800">Total Estimado Anual:</span>
                    <span className="text-xl font-bold text-blue-800">
                      {formatMoeda((fluxoCaixa as any[]).reduce((sum: number, m: any) => sum + parseFloat(m.valorTotal || "0"), 0))}
                    </span>
                  </div>

                  {(() => {
                    const dados = fluxoCaixa as any[];
                    const maxVal = Math.max(...dados.map((m: any) => parseFloat(m.valorTotal || "0")), 1);
                    return (
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" /> Visualização Mensal
                        </h4>
                        <div className="flex items-end gap-2 h-48 border-b border-gray-200 pb-1">
                          {dados.map((m: any) => {
                            const val = parseFloat(m.valorTotal || "0");
                            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const hasValue = val > 0;
                            return (
                              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer" onClick={() => { setFluxoMesSelecionado(m); setShowFluxoMesDialog(true); }}>
                                {hasValue && (
                                  <span className="text-[9px] font-semibold text-green-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {formatMoeda(val)}
                                  </span>
                                )}
                                <div
                                  className={`w-full rounded-t-md transition-all ${
                                    hasValue
                                      ? "bg-gradient-to-t from-green-500 to-green-400 group-hover:from-green-600 group-hover:to-green-500"
                                      : "bg-gray-200"
                                  }`}
                                  style={{ height: `${Math.max(pct, 3)}%`, minHeight: "4px" }}
                                  title={`${m.nomeMes}: ${formatMoeda(val)} - ${m.totalFuncionarios} func.`}
                                />
                                <span className="text-[9px] text-muted-foreground font-medium">
                                  {(m.nomeMes || "").substring(0, 3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== GRÁFICO DE GANTT - TIMELINE DE FÉRIAS ===== */}
                  {(() => {
                    const dados = fluxoCaixa as any[];
                    // Collect all employees across all months (unique by id)
                    const allFuncs: Record<number, { id: number; nome: string; cargo: string; meses: { mes: number; valor: number; vencida: boolean; status: string }[] }> = {};
                    for (const m of dados) {
                      for (const f of (m.funcionarios || [])) {
                        if (!allFuncs[f.id]) {
                          allFuncs[f.id] = { id: f.id, nome: f.nome, cargo: f.cargo || "", meses: [] };
                        }
                        allFuncs[f.id].meses.push({ mes: m.mes, valor: parseFloat(f.valorEstimado || "0"), vencida: f.vencida, status: f.status || (f.vencida ? 'vencida' : 'prevista') });
                      }
                    }
                    const funcList = Object.values(allFuncs).sort((a, b) => a.nome.localeCompare(b.nome));
                    if (funcList.length === 0) return null;

                    // Status-based colors for the Gantt bars
                    const STATUS_GANTT_COLORS: Record<string, string> = {
                      prevista: "bg-blue-400",
                      pendente: "bg-blue-400",
                      agendada: "bg-emerald-400",
                      em_gozo: "bg-green-500",
                      concluida: "bg-gray-400",
                      vencida: "bg-red-400",
                      cancelada: "bg-gray-300",
                    };

                    return (
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <Calendar className="h-4 w-4" /> Gantt — Timeline de Férias {anoCalendario}
                        </h4>
                        <div className="overflow-x-auto">
                          <div className="min-w-[700px]">
                            {/* Header meses */}
                            <div className="grid grid-cols-[200px_repeat(12,1fr)] border-b border-gray-300 pb-1 mb-1">
                              <div className="text-xs font-semibold text-muted-foreground px-1">Funcionário</div>
                              {MESES.map((m, i) => (
                                <div key={i} className="text-[10px] font-semibold text-center text-muted-foreground">{m}</div>
                              ))}
                            </div>
                            {/* Rows */}
                            {funcList.map((func, idx) => (
                              <div key={func.id} className={`grid grid-cols-[200px_repeat(12,1fr)] items-center ${idx % 2 === 0 ? "bg-muted/20" : ""} py-0.5`}>
                                <div
                                  className="text-xs font-medium truncate px-1 cursor-pointer hover:text-blue-600 hover:underline"
                                  title={`${func.nome} - ${func.cargo} — Clique para ver detalhes de férias`}
                                  onClick={() => setGanttEmployeeId(func.id)}
                                >
                                  {func.nome.split(" ").slice(0, 2).join(" ")}
                                </div>
                                {Array.from({ length: 12 }, (_, mesIdx) => {
                                  const mesNum = mesIdx + 1;
                                  const entry = func.meses.find(m => m.mes === mesNum);
                                  const statusColor = STATUS_GANTT_COLORS[entry?.status || 'prevista'] || 'bg-blue-400';
                                  const statusLabel = entry?.status === 'vencida' ? 'VENCIDA' : entry?.status === 'agendada' ? 'Agendada' : entry?.status === 'em_gozo' ? 'Em Gozo' : entry?.status === 'concluida' ? 'Concluída' : 'Prevista';
                                  return (
                                    <div key={mesIdx} className="px-0.5 h-6 flex items-center">
                                      {entry ? (
                                        <div
                                          className={`w-full h-4 rounded-sm ${statusColor} opacity-80 hover:opacity-100 transition-opacity cursor-pointer relative group`}
                                          title={`${func.nome} — ${dados[mesIdx]?.nomeMes}: ${formatMoeda(entry.valor)} (${statusLabel})`}
                                          onClick={() => setGanttEmployeeId(func.id)}
                                        >
                                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white opacity-0 group-hover:opacity-100">
                                            {formatMoeda(entry.valor)}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="w-full h-4" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                            {/* Legend */}
                            <div className="flex flex-wrap items-center gap-4 mt-3 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-blue-400" />
                                <span className="text-[10px] text-muted-foreground">Previstas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                                <span className="text-[10px] text-muted-foreground">Agendadas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-green-500" />
                                <span className="text-[10px] text-muted-foreground">Em Gozo</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-gray-400" />
                                <span className="text-[10px] text-muted-foreground">Concluídas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-red-400" />
                                <span className="text-[10px] text-muted-foreground">Vencidas</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground ml-auto">Clique no nome ou barra para ver detalhes</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ===== DIALOG: DETALHAMENTO DO MÊS - FLUXO DE CAIXA ===== */}
        <Dialog open={showFluxoMesDialog} onOpenChange={(open) => { if (!open) { setShowFluxoMesDialog(false); setFluxoMesSelecionado(null); } }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Detalhamento — {fluxoMesSelecionado?.nomeMes} {anoCalendario}
              </DialogTitle>
            </DialogHeader>
            {fluxoMesSelecionado && (
              <div className="space-y-4">
                {/* Resumo do mês */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <p className="text-xs text-green-600 font-semibold uppercase">Total do Mês</p>
                    <p className="text-xl font-bold text-green-700 mt-1">{formatMoeda(fluxoMesSelecionado.valorTotal)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                    <p className="text-xs text-blue-600 font-semibold uppercase">Funcionários</p>
                    <p className="text-xl font-bold text-blue-700 mt-1">{fluxoMesSelecionado.totalFuncionarios}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                    <p className="text-xs text-amber-600 font-semibold uppercase">Média por Func.</p>
                    <p className="text-xl font-bold text-amber-700 mt-1">
                      {fluxoMesSelecionado.totalFuncionarios > 0
                        ? formatMoeda(parseFloat(fluxoMesSelecionado.valorTotal) / fluxoMesSelecionado.totalFuncionarios)
                        : "R$ 0,00"}
                    </p>
                  </div>
                </div>

                {/* Tabela detalhada */}
                {fluxoMesSelecionado.funcionarios?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/30">
                          <th className="py-2 px-3 font-medium text-muted-foreground">#</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Funcionário</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Cargo</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">Salário Base</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">Férias (30d)</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">1/3 Const.</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">Total</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fluxoMesSelecionado.funcionarios.map((f: any, i: number) => {
                          const salario = typeof f.salario === 'string' ? parseFloat(f.salario.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : (f.salario || 0);
                          const valorFerias = salario;
                          const terco = salario / 3;
                          const total = parseFloat(f.valorEstimado || "0");
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/20">
                              <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                              <td className="py-2 px-3 font-medium">{f.nome}</td>
                              <td className="py-2 px-3 text-muted-foreground">{f.cargo || "-"}</td>
                              <td className="py-2 px-3 text-right">{formatMoeda(salario)}</td>
                              <td className="py-2 px-3 text-right">{formatMoeda(valorFerias)}</td>
                              <td className="py-2 px-3 text-right">{formatMoeda(terco)}</td>
                              <td className="py-2 px-3 text-right font-bold text-green-700">{formatMoeda(total)}</td>
                              <td className="py-2 px-3 text-center">
                                {f.vencida ? (
                                  <Badge variant="destructive" className="text-[10px]">VENCIDA</Badge>
                                ) : (
                                  <Badge className="bg-green-100 text-green-700 text-[10px]">Prevista</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-green-300 bg-green-50">
                          <td colSpan={6} className="py-2 px-3 font-bold text-green-800">TOTAL DO MÊS</td>
                          <td className="py-2 px-3 text-right font-bold text-green-800 text-lg">{formatMoeda(fluxoMesSelecionado.valorTotal)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhum funcionário com férias previstas neste mês.</p>
                  </div>
                )}

                {/* Observação sobre cálculo */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    <strong>Nota:</strong> Os valores são estimativas baseadas no salário base atual. O valor final pode variar conforme fracionamento, abono pecuniário, médias de horas extras e outros adicionais.
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ===== DIALOG: DEFINIR DATA DE FÉRIAS (RH Override) ===== */}
        <Dialog open={showDefinirDialog} onOpenChange={(open) => { if (!open) { setShowDefinirDialog(false); setDefinirItem(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenLine className="h-5 w-5 text-blue-600" />
                Definir Data de Férias
              </DialogTitle>
            </DialogHeader>
            {definirItem && (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="font-semibold">{definirItem.employeeName || "Funcionário"}</p>
                  <p className="text-xs text-muted-foreground">
                    Período: {formatDate(definirItem.periodoAquisitivoInicio)} a {formatDate(definirItem.periodoAquisitivoFim)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Concessivo até: {formatDate(definirItem.periodoConcessivoFim)}
                  </p>
                </div>

                {definirItem.dataSugeridaInicio && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" /> Data Sugerida pelo Sistema
                    </p>
                    <p className="text-sm font-medium text-blue-800 mt-1">
                      {formatDate(definirItem.dataSugeridaInicio)} a {formatDate(definirItem.dataSugeridaFim)}
                    </p>
                    <p className="text-[10px] text-blue-600 mt-1">
                      Se alterar, será marcado como "Alterado pelo RH" no calendário
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Data Início *</label>
                    <Input type="date" value={definirForm.dataInicio || ""} onChange={e => setDefinirForm({ ...definirForm, dataInicio: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Data Fim *</label>
                    <Input type="date" value={definirForm.dataFim || ""} onChange={e => setDefinirForm({ ...definirForm, dataFim: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Dias de Gozo</label>
                    <Input type="number" value={definirForm.diasGozo || 30} onChange={e => setDefinirForm({ ...definirForm, diasGozo: parseInt(e.target.value) || 30 })} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Observações</label>
                  <Textarea value={definirForm.observacoes || ""} onChange={e => setDefinirForm({ ...definirForm, observacoes: e.target.value })} rows={2} placeholder="Motivo da alteração (opcional)" />
                </div>

                {definirItem.dataSugeridaInicio && definirForm.dataInicio && definirForm.dataInicio !== definirItem.dataSugeridaInicio && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Data diferente da sugerida
                    </p>
                    <p className="text-[10px] text-purple-600 mt-1">
                      Esta alteração será registrada e indicada visualmente no calendário com cor roxa e ícone de edição.
                    </p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDefinirDialog(false); setDefinirItem(null); }}>Cancelar</Button>
              <Button onClick={submitDefinirData} disabled={definirDataFerias.isPending}>
                {definirDataFerias.isPending ? "Salvando..." : "Confirmar Data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        {selectedItem && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedItem(null); }} title="Detalhes das Férias" icon={<Palmtree className="h-5 w-5 text-white" />}>
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Colaborador</p>
                  <p className="font-semibold text-lg">{selectedItem.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{formatCPF(selectedItem.employeeCpf)} — {selectedItem.employeeCargo}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Status</p>
                  <p className="font-semibold text-lg">{STATUS_LABELS[selectedItem.status]?.label}</p>
                  {selectedItem.vencida ? <Badge variant="destructive">Pagamento em Dobro</Badge> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 uppercase font-semibold">Período Aquisitivo</p>
                  <p className="font-medium">{formatDate(selectedItem.periodoAquisitivoInicio)} a {formatDate(selectedItem.periodoAquisitivoFim)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-xs text-amber-600 uppercase font-semibold">Concessivo Até</p>
                  <p className="font-medium">{formatDate(selectedItem.periodoConcessivoFim)}</p>
                </div>
              </div>
              {selectedItem.dataInicio && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Início Gozo</p>
                    <p className="font-bold text-lg">{formatDate(selectedItem.dataInicio)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Fim Gozo</p>
                    <p className="font-bold text-lg">{formatDate(selectedItem.dataFim)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Dias</p>
                    <p className="font-bold text-lg">{selectedItem.diasGozo || 30}</p>
                  </div>
                </div>
              )}
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-xs text-green-600 uppercase font-semibold mb-2">Valores</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between"><span>Férias:</span><span className="font-medium">{formatMoeda(selectedItem.valorFerias)}</span></div>
                  <div className="flex justify-between"><span>1/3 Constitucional:</span><span className="font-medium">{formatMoeda(selectedItem.valorTercoConstitucional)}</span></div>
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between text-lg font-bold text-green-700">
                  <span>TOTAL:</span>
                  <span>{formatMoeda(selectedItem.valorTotal)}</span>
                </div>
                {selectedItem.dataPagamento && (
                  <p className="text-xs text-green-600 mt-2">Pagamento até: {formatDate(selectedItem.dataPagamento)} (2 dias antes do início)</p>
                )}
              </div>
            </div>
          </FullScreenDialog>
        )}

        {/* Create Dialog */}
        <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setForm({}); }} title="Registrar Férias" icon={<Palmtree className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Dica:</strong> Selecione um colaborador e clique em "Gerar Períodos Automáticos" para calcular automaticamente os períodos aquisitivos com base na data de admissão.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Colaborador *</label>
                <div className="relative" style={{ zIndex: 60 }}>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 relative" style={{ zIndex: 61 }} onClick={() => { if (!empDropdownOpen) setEmpDropdownOpen(true); }}>
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Digite nome ou CPF..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setEmpDropdownOpen(false); setEmpSearch(''); } }} onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione..."}
                      </span>
                    )}
                    {form.employeeId && (
                      <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setForm({ ...form, employeeId: undefined }); setEmpSearch(""); setEmpDropdownOpen(false); }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {empDropdownOpen && (
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 55 }} onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto" style={{ zIndex: 62 }}>
                        {filteredEmps.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">Nenhum resultado para "{empSearch}"</div>
                        ) : filteredEmps.slice(0, 20).map((e: any) => (
                          <div key={e.id} className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm flex justify-between" onClick={() => { setForm({ ...form, employeeId: e.id }); setEmpDropdownOpen(false); setEmpSearch(""); }}>
                            <span className="font-medium">{e.nomeCompleto}</span>
                            <span className="text-muted-foreground">{formatCPF(e.cpf)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {form.employeeId && (
                <div className="col-span-2">
                  <Button variant="outline" size="sm" onClick={() => handleGerarPeriodos(form.employeeId)} disabled={gerarPeriodos.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${gerarPeriodos.isPending ? "animate-spin" : ""}`} /> Gerar Períodos Automáticos
                  </Button>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Período Aquisitivo Início *</label>
                <Input type="date" value={form.periodoAquisitivoInicio || ""} onChange={e => setForm({ ...form, periodoAquisitivoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Período Aquisitivo Fim *</label>
                <Input type="date" value={form.periodoAquisitivoFim || ""} onChange={e => setForm({ ...form, periodoAquisitivoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Concessivo Até *</label>
                <Input type="date" value={form.periodoConcessivoFim || ""} onChange={e => setForm({ ...form, periodoConcessivoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Dias de Gozo</label>
                <Input type="number" value={form.diasGozo || 30} onChange={e => setForm({ ...form, diasGozo: parseInt(e.target.value) || 30 })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Início Gozo</label>
                <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Fim Gozo</label>
                <Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Fracionamento</label>
                <Select value={String(form.fracionamento || 1)} onValueChange={v => setForm({ ...form, fracionamento: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 período (30 dias)</SelectItem>
                    <SelectItem value="2">2 períodos (14+16)</SelectItem>
                    <SelectItem value="3">3 períodos (14+10+6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Abono Pecuniário</label>
                <Select value={String(form.abonoPecuniario || 0)} onValueChange={v => setForm({ ...form, abonoPecuniario: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Não</SelectItem>
                    <SelectItem value="1">Sim (vender 1/3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowDialog(false); setForm({}); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createFerias.isPending}>
                {createFerias.isPending ? "Salvando..." : "Registrar Férias"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      {/* ===== DIALOG: DETALHES DE FÉRIAS DO FUNCIONÁRIO (Gantt click) ===== */}
      {ganttEmployeeId && (
        <GanttEmployeeFeriasDialog
          companyId={companyId}
          employeeId={ganttEmployeeId}
          onClose={() => setGanttEmployeeId(null)}
          onDefinirData={(item: any) => { setGanttEmployeeId(null); handleDefinirData(item); }}
          refetch={refetch}
        />
      )}

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
