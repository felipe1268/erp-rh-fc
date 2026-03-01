import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Clock, Plus, CheckCircle, XCircle, AlertTriangle, Send,
  Calendar, Users, Building2, FileText, Loader2, Eye, RotateCcw, MessageSquare,
} from "lucide-react";

type TabType = "solicitar" | "aprovacoes" | "historico";

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-300",
  aprovada: "bg-green-100 text-green-800 border-green-300",
  rejeitada: "bg-red-100 text-red-800 border-red-300",
  cancelada: "bg-gray-100 text-gray-800 border-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

export default function SolicitacaoHE() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("solicitar");
  const [filterStatus, setFilterStatus] = useState<string>("todas");
  const [filterMes, setFilterMes] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [detailSolId, setDetailSolId] = useState<number | null>(null);
  const [adminObs, setAdminObs] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    obraId: "",
    dataSolicitacao: "",
    horaInicio: "",
    horaFim: "",
    motivo: "",
    observacoes: "",
    funcionarioIds: [] as number[],
  });

  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  // Queries
  const obrasQuery = trpc.obras.listActive.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const employeesQuery = trpc.employees.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const listQuery = trpc.heSolicitacoes.list.useQuery(
    { companyId, status: filterStatus as any, mesReferencia: filterMes || undefined },
    { enabled: companyId > 0 }
  );
  // Query separada para pendentes SEM filtro de mês (para aba Aprovações)
  const pendentesQuery = trpc.heSolicitacoes.list.useQuery(
    { companyId, status: "pendente" as any },
    { enabled: companyId > 0 }
  );
  const countsQuery = trpc.heSolicitacoes.counts.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const utils = trpc.useUtils();

  // Mutations
  const createMut = trpc.heSolicitacoes.create.useMutation({
    onSuccess: () => {
      toast.success("Solicitação de HE criada com sucesso!");
      utils.heSolicitacoes.list.invalidate();
      utils.heSolicitacoes.counts.invalidate();
      setFormData({ obraId: "", dataSolicitacao: "", horaInicio: "", horaFim: "", motivo: "", observacoes: "", funcionarioIds: [] });
      setActiveTab("historico");
    },
    onError: (err) => toast.error(err.message),
  });

  // Query para detalhes da solicitação selecionada
  const detailQuery = trpc.heSolicitacoes.getById.useQuery(
    { id: detailSolId! },
    { enabled: !!detailSolId }
  );

  const approveMut = trpc.heSolicitacoes.approve.useMutation({
    onSuccess: (res) => {
      toast.success(res.reversao ? "Solicitação revertida para APROVADA!" : "Solicitação aprovada!");
      utils.heSolicitacoes.list.invalidate();
      utils.heSolicitacoes.counts.invalidate();
      utils.heSolicitacoes.getById.invalidate();
      setDetailSolId(null);
      setAdminObs("");
      setShowRejectForm(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMut = trpc.heSolicitacoes.reject.useMutation({
    onSuccess: (res) => {
      toast.success(res.reversao ? "Solicitação revertida para REJEITADA!" : "Solicitação rejeitada.");
      utils.heSolicitacoes.list.invalidate();
      utils.heSolicitacoes.counts.invalidate();
      utils.heSolicitacoes.getById.invalidate();
      setDetailSolId(null);
      setAdminObs("");
      setRejectReason("");
      setShowRejectForm(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMut = trpc.heSolicitacoes.cancel.useMutation({
    onSuccess: () => {
      toast.success("Solicitação cancelada.");
      utils.heSolicitacoes.list.invalidate();
      utils.heSolicitacoes.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const activeEmployees = useMemo(() => {
    return (employeesQuery.data || []).filter((e: any) => e.status === "Ativo" && !e.deletedAt);
  }, [employeesQuery.data]);

  // Query para buscar funcionários alocados na obra via tabela obraFuncionarios
  const obraFuncsQuery = trpc.obras.funcionarios.useQuery(
    { obraId: formData.obraId ? parseInt(formData.obraId) : 0 },
    { enabled: !!formData.obraId && parseInt(formData.obraId) > 0 }
  );

  const obraEmployees = useMemo(() => {
    if (!formData.obraId) return activeEmployees;
    // Primeiro: buscar pela tabela obraFuncionarios (alocações ativas)
    const alocadosIds = new Set((obraFuncsQuery.data || []).map((f: any) => f.employeeId || f.id));
    // Segundo: fallback pelo campo obraAtualId do funcionário
    const filtered = activeEmployees.filter((e: any) => 
      alocadosIds.has(e.id) || String(e.obraAtualId) === formData.obraId
    );
    return filtered;
  }, [activeEmployees, formData.obraId, obraFuncsQuery.data]);

  // Usa a query dedicada sem filtro de mês para mostrar TODAS as pendentes
  const pendentes = useMemo(() => {
    return pendentesQuery.data || [];
  }, [pendentesQuery.data]);

  const isAdminMaster = user?.role === "admin_master";

  function handleSubmit() {
    if (!companyId) return;
    if (!formData.dataSolicitacao) { toast.error("Informe a data da HE"); return; }
    if (!formData.motivo || formData.motivo.length < 5) { toast.error("Informe o motivo (mínimo 5 caracteres)"); return; }
    if (formData.funcionarioIds.length === 0) { toast.error("Selecione pelo menos 1 funcionário"); return; }

    createMut.mutate({
      companyId,
      obraId: formData.obraId ? parseInt(formData.obraId) : undefined,
      dataSolicitacao: formData.dataSolicitacao,
      horaInicio: formData.horaInicio || undefined,
      horaFim: formData.horaFim || undefined,
      motivo: formData.motivo,
      observacoes: formData.observacoes || undefined,
      funcionarioIds: formData.funcionarioIds,
    });
  }

  function handleApproveFromDialog() {
    if (!detailSolId) return;
    approveMut.mutate({ id: detailSolId, observacaoAdmin: adminObs || undefined });
  }

  function handleRejectFromDialog() {
    if (!detailSolId) return;
    if (!rejectReason || rejectReason.length < 5) {
      toast.error("Motivo da rejeição obrigatório (mínimo 5 caracteres)");
      return;
    }
    rejectMut.mutate({ id: detailSolId, motivoRejeicao: rejectReason, observacaoAdmin: adminObs || undefined });
  }

  function openDetail(solId: number) {
    setDetailSolId(solId);
    setAdminObs("");
    setRejectReason("");
    setShowRejectForm(false);
  }

  function handleCancel(id: number) {
    if (!confirm("Confirma o cancelamento desta solicitação?")) return;
    cancelMut.mutate({ id });
  }

  function toggleEmployee(empId: number) {
    setFormData(prev => ({
      ...prev,
      funcionarioIds: prev.funcionarioIds.includes(empId)
        ? prev.funcionarioIds.filter(id => id !== empId)
        : [...prev.funcionarioIds, empId],
    }));
  }

  function selectAllEmployees() {
    const allIds = obraEmployees.map((e: any) => e.id);
    setFormData(prev => ({ ...prev, funcionarioIds: allIds }));
  }

  function deselectAllEmployees() {
    setFormData(prev => ({ ...prev, funcionarioIds: [] }));
  }

  const tabs: { key: TabType; label: string; icon: any; badge?: number }[] = [
    { key: "solicitar", label: "Nova Solicitação", icon: Plus },
    { key: "aprovacoes", label: "Aprovações", icon: CheckCircle, badge: countsQuery.data?.pendentes || 0 },
    { key: "historico", label: "Histórico", icon: FileText },
  ];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
            Solicitação de Horas Extras
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Art. 59 CLT — Horas extras com autorização prévia do Admin Master
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-3 md:p-4">
              <div className="text-xl md:text-2xl font-bold text-yellow-600">{countsQuery.data?.pendentes || 0}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Pendentes</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3 md:p-4">
              <div className="text-xl md:text-2xl font-bold text-green-600">{countsQuery.data?.aprovadas || 0}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Aprovadas</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-3 md:p-4">
              <div className="text-xl md:text-2xl font-bold text-red-600">{countsQuery.data?.rejeitadas || 0}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Rejeitadas</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3 md:p-4">
              <div className="text-xl md:text-2xl font-bold text-blue-600">{countsQuery.data?.total || 0}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b pb-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-t-lg transition-colors relative whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-white text-blue-700 border border-b-white -mb-px z-10 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className="ml-1 bg-red-500 text-white text-[10px] md:text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg border p-3 md:p-6">
          {/* ========== TAB: NOVA SOLICITAÇÃO ========== */}
          {activeTab === "solicitar" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-600" />
                Nova Solicitação de Horas Extras
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Obra */}
                <div className="space-y-1.5">
                  <Label>Obra (opcional)</Label>
                  <Select value={formData.obraId} onValueChange={v => setFormData(p => ({ ...p, obraId: v, funcionarioIds: [] }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                    <SelectContent>
                      {(obrasQuery.data || []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Data */}
                <div className="space-y-1.5">
                  <Label>Data da HE *</Label>
                  <Input
                    type="date"
                    value={formData.dataSolicitacao}
                    onChange={e => setFormData(p => ({ ...p, dataSolicitacao: e.target.value }))}
                  />
                </div>

                {/* Hora Início */}
                <div className="space-y-1.5">
                  <Label>Hora Início (prevista)</Label>
                  <Input
                    type="time"
                    value={formData.horaInicio}
                    onChange={e => setFormData(p => ({ ...p, horaInicio: e.target.value }))}
                  />
                </div>

                {/* Hora Fim */}
                <div className="space-y-1.5">
                  <Label>Hora Fim (prevista)</Label>
                  <Input
                    type="time"
                    value={formData.horaFim}
                    onChange={e => setFormData(p => ({ ...p, horaFim: e.target.value }))}
                  />
                </div>

                {/* Motivo */}
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Motivo *</Label>
                  <textarea
                    className="w-full border rounded-md p-2 text-sm min-h-[80px] resize-y"
                    placeholder="Descreva o motivo da necessidade de horas extras..."
                    value={formData.motivo}
                    onChange={e => setFormData(p => ({ ...p, motivo: e.target.value }))}
                  />
                </div>

                {/* Observações */}
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <Label>Observações</Label>
                  <Input
                    placeholder="Observações adicionais..."
                    value={formData.observacoes}
                    onChange={e => setFormData(p => ({ ...p, observacoes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Seleção de Funcionários */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <Label className="text-sm md:text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Funcionários ({formData.funcionarioIds.length} selecionados)
                  </Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs md:text-sm" onClick={selectAllEmployees}>
                      Selecionar Todos ({obraEmployees.length})
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs md:text-sm" onClick={deselectAllEmployees}>
                      Limpar Seleção
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                  {obraEmployees.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      Nenhum funcionário ativo encontrado{formData.obraId ? " nesta obra" : ""}
                    </div>
                  ) : (
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left w-10"></th>
                          <th className="p-2 text-left">Nome</th>
                          <th className="p-2 text-left">Função</th>
                          <th className="p-2 text-left">CPF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obraEmployees.map((emp: any) => (
                          <tr
                            key={emp.id}
                            className={`border-t cursor-pointer hover:bg-blue-50 ${formData.funcionarioIds.includes(emp.id) ? "bg-blue-50" : ""}`}
                            onClick={() => toggleEmployee(emp.id)}
                          >
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={formData.funcionarioIds.includes(emp.id)}
                                onChange={() => toggleEmployee(emp.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="p-2 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(emp.id)}>{emp.nomeCompleto}</td>
                            <td className="p-2 text-muted-foreground">{emp.funcao || "-"}</td>
                            <td className="p-2 text-muted-foreground">{emp.cpf || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSubmit}
                  disabled={createMut.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar Solicitação
                </Button>
              </div>
            </div>
          )}

          {/* ========== TAB: APROVAÇÕES (Admin Master) ========== */}
          {activeTab === "aprovacoes" && (() => {
            // Mostrar TODAS as solicitações na aba Aprovações com sub-filtros
            const allSols = listQuery.data || [];
            const aprovPendentes = allSols.filter((s: any) => s.status === "pendente");
            const aprovAprovadas = allSols.filter((s: any) => s.status === "aprovada");
            const aprovRejeitadas = allSols.filter((s: any) => s.status === "rejeitada");
            // Também incluir pendentes de outros meses via pendentesQuery
            const pendentesOutrosMeses = (pendentesQuery.data || []).filter(
              (p: any) => !aprovPendentes.some((a: any) => a.id === p.id)
            );
            const todasPendentes = [...aprovPendentes, ...pendentesOutrosMeses];
            return (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Gestão de Aprovações
                  {!isAdminMaster && (
                    <Badge variant="outline" className="ml-2 text-orange-600 border-orange-300 text-[10px] md:text-xs">
                      Somente Admin Master
                    </Badge>
                  )}
                </h2>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Input
                    type="month"
                    value={filterMes}
                    onChange={e => setFilterMes(e.target.value)}
                    className="w-full sm:w-40"
                  />
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="aprovada">Aprovadas</SelectItem>
                      <SelectItem value="rejeitada">Rejeitadas</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Mini resumo */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50">
                  {todasPendentes.length} pendentes
                </Badge>
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                  {aprovAprovadas.length} aprovadas
                </Badge>
                <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">
                  {aprovRejeitadas.length} rejeitadas
                </Badge>
              </div>

              {/* Seção: Pendentes (sempre visível se houver) */}
              {(filterStatus === "todas" || filterStatus === "pendente") && todasPendentes.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-yellow-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Aguardando Aprovação ({todasPendentes.length})
                  </h3>
                  {todasPendentes.map((sol: any) => (
                    <Card key={sol.id} className="border-l-4 border-l-yellow-400">
                      <CardContent className="p-3 md:p-4">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={STATUS_COLORS.pendente + " text-[10px] md:text-xs"}>Pendente</Badge>
                              <span className="text-xs md:text-sm text-muted-foreground">
                                #{sol.id} — {new Date(sol.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR")}
                              </span>
                              {sol.obraNome && (
                                <span className="text-xs flex items-center gap-1">
                                  <Building2 className="h-3 w-3" /> {sol.obraNome}
                                </span>
                              )}
                            </div>
                            <p className="text-xs md:text-sm"><strong>Motivo:</strong> {sol.motivo}</p>
                            {sol.horaInicio && sol.horaFim && (
                              <p className="text-[10px] md:text-xs text-muted-foreground">
                                Horário: {sol.horaInicio} — {sol.horaFim}
                              </p>
                            )}
                            <p className="text-[10px] md:text-xs text-muted-foreground">
                              Por: {sol.solicitadoPor} em {new Date(sol.createdAt).toLocaleString("pt-BR")}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(sol.funcionarios || []).slice(0, 5).map((f: any) => (
                                <Badge key={f.employeeId} variant="secondary" className="text-[10px] md:text-xs">
                                  {f.employeeName || `ID ${f.employeeId}`}
                                </Badge>
                              ))}
                              {(sol.funcionarios || []).length > 5 && (
                                <Badge variant="secondary" className="text-[10px] md:text-xs">+{(sol.funcionarios || []).length - 5}</Badge>
                              )}
                            </div>
                          </div>
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs md:text-sm shrink-0" onClick={() => openDetail(sol.id)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Analisar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Seção: Aprovadas/Rejeitadas/Todas do período */}
              {(filterStatus !== "pendente") && (() => {
                const filtered = filterStatus === "todas"
                  ? allSols.filter((s: any) => s.status !== "pendente")
                  : allSols;
                if (filtered.length === 0 && todasPendentes.length === 0) return (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma solicitação encontrada para o período</p>
                  </div>
                );
                if (filtered.length === 0) return null;
                return (
                  <div className="space-y-3">
                    {filterStatus === "todas" && (
                      <h3 className="text-sm font-semibold text-muted-foreground">Histórico de Decisões</h3>
                    )}
                    {filtered.map((sol: any) => (
                      <Card key={sol.id} className={`border-l-4 ${
                        sol.status === "aprovada" ? "border-l-green-400" :
                        sol.status === "rejeitada" ? "border-l-red-400" :
                        sol.status === "cancelada" ? "border-l-gray-400" :
                        "border-l-yellow-400"
                      }`}>
                        <CardContent className="p-3 md:p-4">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={(STATUS_COLORS[sol.status] || STATUS_COLORS.pendente) + " text-[10px] md:text-xs"}>
                                  {STATUS_LABELS[sol.status] || sol.status}
                                </Badge>
                                <span className="text-xs md:text-sm font-medium">
                                  #{sol.id} — {new Date(sol.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR")}
                                </span>
                                {sol.obraNome && (
                                  <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                    <Building2 className="h-3 w-3" /> {sol.obraNome}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs md:text-sm">{sol.motivo}</p>
                              {sol.aprovadoPor && (
                                <p className="text-[10px] md:text-xs text-muted-foreground">
                                  {sol.status === "aprovada" ? "Aprovado" : "Rejeitado"} por: {sol.aprovadoPor}
                                  {sol.aprovadoEm && ` em ${new Date(sol.aprovadoEm).toLocaleString("pt-BR")}`}
                                </p>
                              )}
                              {sol.observacaoAdmin && (
                                <p className="text-[10px] md:text-xs text-blue-700">Obs Admin: {sol.observacaoAdmin}</p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(sol.funcionarios || []).slice(0, 5).map((f: any) => (
                                  <Badge key={f.employeeId} variant="secondary" className="text-[10px] md:text-xs">
                                    {f.employeeName || `ID ${f.employeeId}`}
                                  </Badge>
                                ))}
                                {(sol.funcionarios || []).length > 5 && (
                                  <Badge variant="secondary" className="text-[10px] md:text-xs">+{(sol.funcionarios || []).length - 5}</Badge>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant="outline" className="text-xs md:text-sm shrink-0" onClick={() => openDetail(sol.id)}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Detalhes
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                );
              })()}
            </div>
            );
          })()}

          {/* ========== TAB: HISTÓRICO ========== */}
          {activeTab === "historico" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Histórico de Solicitações
                </h2>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Input
                    type="month"
                    value={filterMes}
                    onChange={e => setFilterMes(e.target.value)}
                    className="w-full sm:w-40"
                  />
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="aprovada">Aprovadas</SelectItem>
                      <SelectItem value="rejeitada">Rejeitadas</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {listQuery.isLoading ? (
                <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /></div>
              ) : (listQuery.data || []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma solicitação encontrada para o período</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(listQuery.data || []).map((sol: any) => (
                    <Card key={sol.id} className={`border-l-4 ${
                      sol.status === "aprovada" ? "border-l-green-400" :
                      sol.status === "rejeitada" ? "border-l-red-400" :
                      sol.status === "cancelada" ? "border-l-gray-400" :
                      "border-l-yellow-400"
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={STATUS_COLORS[sol.status] || STATUS_COLORS.pendente}>
                                {STATUS_LABELS[sol.status] || sol.status}
                              </Badge>
                              <span className="text-xs md:text-sm font-medium">
                                #{sol.id} — {new Date(sol.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR")}
                              </span>
                              {sol.obraNome && (
                                <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                  <Building2 className="h-3 w-3" /> {sol.obraNome}
                                </span>
                              )}
                            </div>
                            <p className="text-sm">{sol.motivo}</p>
                            {sol.horaInicio && sol.horaFim && (
                              <p className="text-xs text-muted-foreground">
                                Horário: {sol.horaInicio} — {sol.horaFim}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Solicitado por: {sol.solicitadoPor} | {new Date(sol.createdAt).toLocaleString("pt-BR")}
                            </p>
                            {sol.aprovadoPor && (
                              <p className="text-xs text-muted-foreground">
                                {sol.status === "aprovada" ? "Aprovado" : "Rejeitado"} por: {sol.aprovadoPor}
                                {sol.aprovadoEm && ` em ${new Date(sol.aprovadoEm).toLocaleString("pt-BR")}`}
                              </p>
                            )}
                            {sol.motivoRejeicao && (
                              <p className="text-xs text-red-600">Motivo rejeição: {sol.motivoRejeicao}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(sol.funcionarios || []).map((f: any) => (
                                <Badge key={f.employeeId} variant="secondary" className="text-xs">
                                  {f.employeeName || `ID ${f.employeeId}`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs md:text-sm"
                              onClick={() => openDetail(sol.id)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Detalhes
                            </Button>
                            {sol.status === "pendente" && (
                              <Button size="sm" variant="outline" className="text-xs md:text-sm text-red-600" onClick={() => handleCancel(sol.id)}>
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ========== FULLSCREEN DIALOG: ANÁLISE DETALHADA ========== */}
      <FullScreenDialog
        open={!!detailSolId}
        onClose={() => { setDetailSolId(null); setAdminObs(""); setRejectReason(""); setShowRejectForm(false); }}
        title={`Análise da Solicitação #${detailSolId || ""}`}
      >
        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : detailQuery.data ? (() => {
          const sol = detailQuery.data;
          const canApprove = isAdminMaster && sol.status !== "aprovada" && sol.status !== "cancelada";
          const canReject = isAdminMaster && sol.status !== "rejeitada" && sol.status !== "cancelada";
          return (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Status Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b">
                <div className="flex items-center gap-3">
                  <Badge className={`text-sm px-3 py-1 ${STATUS_COLORS[sol.status] || STATUS_COLORS.pendente}`}>
                    {STATUS_LABELS[sol.status] || sol.status}
                  </Badge>
                  <span className="text-lg font-semibold">Solicitação #{sol.id}</span>
                </div>
                {sol.status !== "pendente" && sol.status !== "cancelada" && isAdminMaster && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" /> Reversível
                  </Badge>
                )}
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Data da HE</p>
                  <p className="font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    {new Date(sol.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
                {sol.obraNome && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Obra</p>
                    <p className="font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      {sol.obraNome}
                    </p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Horário Previsto</p>
                  <p className="font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    {sol.horaInicio && sol.horaFim ? `${sol.horaInicio} — ${sol.horaFim}` : "Não informado"}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 sm:col-span-2 lg:col-span-3">
                  <p className="text-xs text-muted-foreground mb-1">Motivo</p>
                  <p className="font-semibold">{sol.motivo}</p>
                </div>
                {sol.observacoes && (
                  <div className="bg-gray-50 rounded-lg p-4 sm:col-span-2 lg:col-span-3">
                    <p className="text-xs text-muted-foreground mb-1">Observações do Solicitante</p>
                    <p className="text-sm">{sol.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Solicitante */}
              <div className="text-xs text-muted-foreground">
                Solicitado por: <strong>{sol.solicitadoPor}</strong> em {new Date(sol.createdAt).toLocaleString("pt-BR")}
              </div>

              {/* Funcionários */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Funcionários ({(sol.funcionarios || []).length})
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Nome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sol.funcionarios || []).map((f: any, i: number) => (
                          <tr key={f.employeeId} className="border-t hover:bg-blue-50">
                            <td className="p-2 text-muted-foreground">{i + 1}</td>
                            <td className="p-2">
                              <span
                                className="text-blue-700 font-medium cursor-pointer hover:underline"
                                onClick={() => setRaioXEmployeeId(f.employeeId)}
                              >
                                {f.employeeName || `ID ${f.employeeId}`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Histórico de decisão (se já teve) */}
              {sol.aprovadoPor && (
                <div className={`rounded-lg p-4 ${sol.status === "aprovada" ? "bg-green-50 border border-green-200" : sol.status === "rejeitada" ? "bg-red-50 border border-red-200" : "bg-gray-50 border"}`}>
                  <p className="text-sm font-semibold mb-1">
                    {sol.status === "aprovada" ? "✅ Aprovada" : sol.status === "rejeitada" ? "❌ Rejeitada" : "Decisão"} por {sol.aprovadoPor}
                  </p>
                  {sol.aprovadoEm && (
                    <p className="text-xs text-muted-foreground">Em {new Date(sol.aprovadoEm).toLocaleString("pt-BR")}</p>
                  )}
                  {sol.motivoRejeicao && (
                    <p className="text-sm mt-2"><strong>Motivo da rejeição:</strong> {sol.motivoRejeicao}</p>
                  )}
                  {sol.observacaoAdmin && (
                    <p className="text-sm mt-2"><strong>Observação do Admin:</strong> {sol.observacaoAdmin}</p>
                  )}
                </div>
              )}

              {/* Área de ação do Admin */}
              {isAdminMaster && sol.status !== "cancelada" && (
                <div className="border-t pt-6 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Ação do Administrador
                  </h3>

                  {/* Campo de observação */}
                  <div>
                    <Label className="text-sm">Observações do Admin (opcional)</Label>
                    <Textarea
                      value={adminObs}
                      onChange={e => setAdminObs(e.target.value)}
                      placeholder="Registre suas observações sobre esta solicitação..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  {/* Formulário de rejeição (aparece ao clicar Rejeitar) */}
                  {showRejectForm && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                      <Label className="text-sm font-semibold text-red-700">Motivo da Rejeição *</Label>
                      <Textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Informe o motivo da rejeição (mínimo 5 caracteres)..."
                        className="border-red-300"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleRejectFromDialog}
                          disabled={rejectMut.isPending}
                        >
                          {rejectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                          Confirmar Rejeição
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowRejectForm(false); setRejectReason(""); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Botões de ação */}
                  {!showRejectForm && (
                    <div className="flex flex-wrap gap-3">
                      {canApprove && (
                        <Button
                          className="bg-green-600 hover:bg-green-700"
                          onClick={handleApproveFromDialog}
                          disabled={approveMut.isPending}
                        >
                          {approveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                          {sol.status === "rejeitada" ? "Reverter → Aprovar" : "Aprovar Solicitação"}
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          variant="destructive"
                          onClick={() => setShowRejectForm(true)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          {sol.status === "aprovada" ? "Reverter → Rejeitar" : "Rejeitar Solicitação"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })() : (
          <div className="text-center py-12 text-muted-foreground">Solicitação não encontrada</div>
        )}
      </FullScreenDialog>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
