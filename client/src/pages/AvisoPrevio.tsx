import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, formatMoeda, fmtNum } from "@/lib/formatters";
import { removeAccents } from "@/lib/searchUtils";
import {
  AlertTriangle, Plus, Search, Clock, Calendar, DollarSign,
  Users, Trash2, Pencil, Eye, X, FileText, ArrowRight,
  CheckCircle2, XCircle, Timer, Ban, ChevronsUpDown, Check, Download, Printer, RefreshCw, RotateCcw,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const TIPO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  empregador_trabalhado: { label: "Empregador (Trabalhado)", color: "text-blue-700", bg: "bg-blue-100" },
  empregador_indenizado: { label: "Empregador (Indenizado)", color: "text-purple-700", bg: "bg-purple-100" },
  empregado_trabalhado: { label: "Empregado (Trabalhado)", color: "text-amber-700", bg: "bg-amber-100" },
  empregado_indenizado: { label: "Empregado (Indenizado)", color: "text-orange-700", bg: "bg-orange-100" },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  em_andamento: { label: "Em Andamento", color: "text-blue-700", bg: "bg-blue-100", icon: Timer },
  concluido: { label: "Concluído", color: "text-green-700", bg: "bg-green-100", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "text-red-700", bg: "bg-red-100", icon: XCircle },
};

const REDUCAO_LABELS: Record<string, string> = {
  "2h_dia": "2 horas/dia (Art. 488 CLT)",
  "7_dias_corridos": "7 dias corridos (Art. 488 CLT)",
  nenhuma: "Nenhuma",
};

export default function AvisoPrevio() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Form state
  const [form, setForm] = useState<any>({});
  const [calculoPreview, setCalculoPreview] = useState<any>(null);

  // Queries
  const { data: avisosList = [], refetch } = trpc.avisoPrevio.avisoPrevio.list.useQuery(
    { companyId, companyIds, ...(statusFilter !== "todos" ? { status: statusFilter } : {}) },
    { enabled: !!companyId || (companyIds && companyIds.length > 0) }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // tRPC utils for imperative queries & invalidation
  const utils = trpc.useUtils();

  // Mutations
  const createAviso = trpc.avisoPrevio.avisoPrevio.create.useMutation({
    onSuccess: (data: any) => {
      refetch();
      utils.obras.efetivoPorObra.invalidate();
      toast.success(`Aviso prévio criado! ${data.diasAviso} dias, término: ${formatDate(data.dataFim)}`);
      setShowDialog(false);
      setForm({});
      setCalculoPreview(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateAviso = trpc.avisoPrevio.avisoPrevio.update.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Aviso prévio atualizado!"); },
  });
  const deleteAviso = trpc.avisoPrevio.avisoPrevio.delete.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Aviso prévio excluído!"); },
  });
  const revertConcluido = trpc.avisoPrevio.avisoPrevio.revertConcluido.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Status revertido para Em Andamento!"); },
    onError: (err) => { toast.error(err.message || "Erro ao reverter status"); },
  });

  // Cálculo automático via useEffect
  const [calculoLoading, setCalculoLoading] = useState(false);
  const calcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executarCalculo = useCallback(async (empId: number, tipo: string, dataDeslig: string, diasOverride?: string) => {
    setCalculoLoading(true);
    try {
      const result = await (utils as any).avisoPrevio.avisoPrevio.calcular.fetch({
        employeeId: empId,
        tipo,
        dataDesligamento: dataDeslig,
        diasTrabalhadosOverride: diasOverride ? Number(diasOverride) : undefined,
      });
      setCalculoPreview(result);
    } catch (e: any) {
      console.error("Erro ao calcular rescisão:", e);
      setCalculoPreview(null);
    } finally {
      setCalculoLoading(false);
    }
  }, [utils]);

  // Disparar cálculo automaticamente quando os 3 campos obrigatórios estão preenchidos
  useEffect(() => {
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current);
    if (!form.employeeId || !form.tipo || !form.dataDesligamento) {
      setCalculoPreview(null);
      return;
    }
    // Debounce de 500ms para evitar chamadas excessivas
    calcTimerRef.current = setTimeout(() => {
      executarCalculo(form.employeeId, form.tipo, form.dataDesligamento, form.diasTrabalhadosOverride);
    }, 500);
    return () => { if (calcTimerRef.current) clearTimeout(calcTimerRef.current); };
  }, [form.employeeId, form.tipo, form.dataDesligamento, form.diasTrabalhadosOverride, executarCalculo]);

  // Filtered list
  const filtered = useMemo(() => {
    return (avisosList as any[]).filter((a: any) => {
      if (search) {
        const s = removeAccents(search);
        if (!(a.employeeName || "").toLowerCase().includes(s) && !(a.employeeCpf || "").includes(s)) return false;
      }
      return true;
    });
  }, [avisosList, search]);

  // Recalcular mutation
  const recalcularTodos = trpc.avisoPrevio.avisoPrevio.recalcularTodos.useMutation({
    onSuccess: (data: any) => {
      refetch();
      utils.obras.efetivoPorObra.invalidate();
      toast.success(`${data.recalculados} avisos recalculados com sucesso!${data.erros > 0 ? ` (${data.erros} erros)` : ''}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Stats
  const stats = useMemo(() => {
    const list = avisosList as any[];
    const emAndamentoList = list.filter(a => a.status === "em_andamento");
    const concluidosList = list.filter(a => a.status === "concluido");
    const canceladosList = list.filter(a => a.status === "cancelado");
    return {
      total: list.length,
      emAndamento: emAndamentoList.length,
      concluidos: concluidosList.length,
      cancelados: canceladosList.length,
      valorTotal: list.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
      valorEmAndamento: emAndamentoList.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
      valorConcluidos: concluidosList.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
    };
  }, [avisosList]);

  // Employee search for form (Popover + Command)
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);

  const handleSubmit = () => {
    if (!form.employeeId || !form.tipo || !form.dataDesligamento) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (editingItem) {
      // Modo edição
      updateAviso.mutate({
        id: editingItem.id,
        tipo: form.tipo,
        dataInicio: form.dataDesligamento,
        dataDesligamento: form.dataDesligamento,
        reducaoJornada: form.reducaoJornada || "nenhuma",
        observacoes: form.observacoes,
        diasTrabalhados: form.diasTrabalhadosOverride ? Number(form.diasTrabalhadosOverride) : undefined,
      });
      setShowDialog(false);
      setEditingItem(null);
      setForm({});
      setCalculoPreview(null);
    } else {
      createAviso.mutate({ companyId, companyIds, employeeId: form.employeeId,
        tipo: form.tipo,
        dataInicio: form.dataDesligamento,
        dataDesligamento: form.dataDesligamento,
        reducaoJornada: form.reducaoJornada || "nenhuma",
        observacoes: form.observacoes,
        diasTrabalhados: form.diasTrabalhadosOverride ? Number(form.diasTrabalhadosOverride) : undefined,
      });
    }
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    // dataDesligamento = último dia trabalhado = dataInicio do aviso - 1 dia
    // Porque calcularDataInicioAviso(dataDesligamento) adiciona 1 dia
    const dtInicio = new Date(item.dataInicio + 'T00:00:00');
    dtInicio.setDate(dtInicio.getDate() - 1);
    const ultimoDiaTrab = dtInicio.toISOString().split('T')[0];
    setForm({
      employeeId: item.employeeId,
      tipo: item.tipo,
      dataDesligamento: ultimoDiaTrab,
      reducaoJornada: item.reducaoJornada || "nenhuma",
      observacoes: item.observacoes || "",
      diasTrabalhadosOverride: "",
    });
    setCalculoPreview(null);
    setShowDialog(true);
  };

  const handleConcluir = (id: number) => {
    updateAviso.mutate({ id, status: "concluido", dataConclusao: new Date().toISOString().split("T")[0] });
  };

  const handleCancelar = (id: number) => {
    const motivo = prompt("Motivo do cancelamento:");
    if (motivo) {
      updateAviso.mutate({ id, status: "cancelado", motivoCancelamento: motivo });
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              Aviso Prévio
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de avisos prévios conforme CLT Art. 487-491 e Lei 12.506/2011
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => recalcularTodos.mutate({ companyId })}
              disabled={recalcularTodos.isPending || stats.emAndamento === 0}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${recalcularTodos.isPending ? 'animate-spin' : ''}`} />
              {recalcularTodos.isPending ? 'Recalculando...' : 'Recalcular Todos'}
            </Button>
            <Button onClick={() => { setForm({}); setCalculoPreview(null); setEditingItem(null); setShowDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Novo Aviso Prévio
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Total</p>
                  <p className="text-2xl font-bold">{fmtNum(stats.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{formatMoeda(stats.valorTotal)}</p>
                </div>
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500" onClick={() => setStatusFilter("em_andamento")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Em Andamento</p>
                  <p className="text-2xl font-bold text-blue-600">{fmtNum(stats.emAndamento)}</p>
                  <p className="text-xs text-blue-600/70 mt-1 font-medium">{formatMoeda(stats.valorEmAndamento)}</p>
                </div>
                <Timer className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500" onClick={() => setStatusFilter("concluido")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Concluídos</p>
                  <p className="text-2xl font-bold text-green-600">{fmtNum(stats.concluidos)}</p>
                  <p className="text-xs text-green-600/70 mt-1 font-medium">{formatMoeda(stats.valorConcluidos)}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-red-500" onClick={() => setStatusFilter("cancelado")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Cancelados</p>
                  <p className="text-2xl font-bold text-red-600">{fmtNum(stats.cancelados)}</p>
                </div>
                <Ban className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Legislação Aplicável
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 text-xs text-amber-700">
            <div>
              <strong>Art. 487 CLT:</strong> Aviso prévio de 30 dias (mínimo) + 3 dias por ano de serviço (máx. 90 dias).
            </div>
            <div>
              <strong>Art. 488 CLT:</strong> Redução de 2h/dia OU 7 dias corridos no final do aviso (escolha do empregado).
            </div>
            <div>
              <strong>Lei 12.506/2011:</strong> Aviso prévio proporcional ao tempo de serviço.
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluido">Concluídos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="p-3 text-left font-medium">Colaborador</th>
                    <th className="p-3 text-left font-medium">CPF</th>
                    <th className="p-3 text-center font-medium">Data Aviso</th>
                    <th className="p-3 text-center font-medium">Redução</th>
                    <th className="p-3 text-center font-medium">Dia Trabalhado</th>
                    <th className="p-3 text-center font-medium">Último Dia</th>
                    <th className="p-3 text-center font-medium">Data Pagamento</th>
                    <th className="p-3 text-right font-medium">Valor Estimado</th>
                    <th className="p-3 text-center font-medium">Status</th>
                    <th className="p-3 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Nenhum aviso prévio encontrado</td></tr>
                  ) : filtered.map((a: any) => {
                    const st = STATUS_LABELS[a.status] || STATUS_LABELS.em_andamento;
                    const reducaoShort = a.reducaoJornada === '2h_dia' ? '2 HORAS' : a.reducaoJornada === '7_dias_corridos' ? '7 DIAS' : '-';
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(a.employeeId)}>
                          {a.employeeName}
                        </td>
                        <td className="p-3 text-xs">{formatCPF(a.employeeCpf)}</td>
                        <td className="p-3 text-center">{formatDate(a.dataDiaTrabalhado)}</td>
                        <td className="p-3 text-center font-medium">{reducaoShort}</td>
                        <td className="p-3 text-center">{formatDate(a.dataInicio)}</td>
                        <td className="p-3 text-center">{(() => {
                          // Se redução é 7 dias corridos, último dia trabalhado = dataFim - 7 dias
                          if (a.reducaoJornada === '7_dias_corridos' && a.dataFim) {
                            const dt = new Date(a.dataFim + 'T00:00:00');
                            dt.setDate(dt.getDate() - 7);
                            return formatDate(dt.toISOString().split('T')[0]);
                          }
                          return formatDate(a.dataFim);
                        })()}</td>
                        <td className="p-3 text-center font-semibold text-red-600">{formatDate(a.dataLimitePagamento)}</td>
                        <td className="p-3 text-right font-semibold">{formatMoeda(a.valorEstimadoTotal)}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={async () => { setSelectedItem(a); setShowDetailDialog(true); try { const detail = await utils.avisoPrevio.avisoPrevio.getById.fetch({ id: a.id }); if (detail) setSelectedItem(detail); } catch(e) { console.error('Erro ao buscar detalhes:', e); } }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {a.status === "em_andamento" && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Editar" onClick={() => handleEdit(a)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Concluir" onClick={() => handleConcluir(a.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Cancelar" onClick={() => handleCancelar(a.id)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {a.status === "concluido" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Reverter para Em Andamento" onClick={() => {
                                if (confirm('Tem certeza que deseja reverter o status de Concluído para Em Andamento?')) {
                                  revertConcluido.mutate({ id: a.id });
                                }
                              }}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este aviso prévio?")) deleteAviso.mutate({ id: a.id }); }}>
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

        {/* Detail Dialog */}
        {selectedItem && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedItem(null); }} title="Detalhes do Aviso Prévio" icon={<AlertTriangle className="h-5 w-5 text-white" />}>
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
                  <p className="text-sm text-muted-foreground">{TIPO_LABELS[selectedItem.tipo]?.label}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <Calendar className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-xs text-blue-600 uppercase">Início</p>
                  <p className="font-bold text-lg">{formatDate(selectedItem.dataInicio)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <Clock className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                  <p className="text-xs text-amber-600 uppercase">Dias de Aviso</p>
                  <p className="font-bold text-lg">{selectedItem.diasAviso} dias</p>
                  <p className="text-xs text-amber-500">{(() => {
                    // Calcular anos, meses e dias de serviço usando dataAdmissao do previsaoRescisao
                    let admStr = '';
                    try {
                      const prev = JSON.parse(selectedItem.previsaoRescisao || '{}');
                      admStr = prev.dataAdmissao || '';
                    } catch {}
                    if (!admStr || !selectedItem.dataFim) return `${selectedItem.anosServico} anos de serviço`;
                    const adm = new Date(admStr + 'T00:00:00');
                    const fim = new Date(selectedItem.dataFim + 'T00:00:00');
                    let anos = fim.getFullYear() - adm.getFullYear();
                    let meses = fim.getMonth() - adm.getMonth();
                    let dias = fim.getDate() - adm.getDate();
                    if (dias < 0) {
                      meses--;
                      const mesAnterior = new Date(fim.getFullYear(), fim.getMonth(), 0);
                      dias += mesAnterior.getDate();
                    }
                    if (meses < 0) { anos--; meses += 12; }
                    const parts = [];
                    if (anos > 0) parts.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
                    if (meses > 0) parts.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
                    parts.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
                    return parts.join(', ') + ' de serviço';
                  })()}</p>
                  {selectedItem.anosServico > 0 && selectedItem.tipo?.includes('trabalhado') && (
                    <p className="text-[10px] text-amber-600 mt-1">+ {Math.min(selectedItem.anosServico * 3, 60)} dias indenizados</p>
                  )}
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <Calendar className="h-5 w-5 mx-auto text-green-600 mb-1" />
                  <p className="text-xs text-green-600 uppercase">Término</p>
                  <p className="font-bold text-lg">{formatDate(selectedItem.dataFim)}</p>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-blue-600 uppercase font-semibold mb-2">Redução de Jornada (Art. 488 CLT)</p>
                <p className="font-medium">{REDUCAO_LABELS[selectedItem.reducaoJornada] || "Nenhuma"}</p>
              </div>
              {selectedItem.previsaoRescisao && (() => {
                let prev: any;
                try { prev = JSON.parse(selectedItem.previsaoRescisao); } catch { prev = null; }
                if (!prev) return null;
                return (
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-xs text-green-600 uppercase font-semibold mb-3 flex items-center gap-1">
                      <DollarSign className="h-4 w-4" /> Previsão de Rescisão
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">Saldo de Salário ({prev.diasTrabalhadosMes}/{prev.diasReaisMes || 30} dias):</span><span className="font-semibold">{formatMoeda(prev.saldoSalario)}</span></div>
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">Férias Prop. + 1/3 ({prev.mesesFerias} meses):</span><span className="font-semibold">{formatMoeda(prev.totalFerias)}</span></div>
                      {parseFloat(prev.feriasVencidas) > 0 && (
                        <div className="flex justify-between py-1 border-b border-red-100 bg-red-50 px-1 rounded"><span className="text-red-600">Férias Vencidas ({prev.periodosVencidos} per.):</span><span className="font-semibold text-red-700">{formatMoeda(prev.feriasVencidas)}</span></div>
                      )}
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">VR Proporcional (R$ {prev.vrDiario}/dia × {prev.diasTrabalhadosMes}):</span><span className="font-semibold">{formatMoeda(prev.vrProporcional)}</span></div>
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">13º Proporcional ({prev.meses13o}/12):</span><span className="font-semibold">{formatMoeda(prev.decimoTerceiroProporcional)}</span></div>
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">Aviso Prévio Indenizado ({prev.diasExtrasAviso} dias extras):</span><span className="font-semibold">{formatMoeda(prev.avisoPrevioIndenizado)}</span></div>
                      <div className="mt-2 pt-1">
                        <p className="text-[10px] text-gray-400 uppercase font-bold">FGTS (informativo)</p>
                        <div className="flex justify-between py-0.5"><span className="text-xs text-gray-400">FGTS Estimado:</span><span className="text-xs text-gray-500">{formatMoeda(prev.fgtsEstimado)}</span></div>
                        <div className="flex justify-between py-0.5"><span className="text-xs text-gray-400">Multa 40%:</span><span className="text-xs text-gray-500">{formatMoeda(prev.multaFGTS)}</span></div>
                      </div>
                    </div>
                    <div className="border-t-2 border-green-300 mt-3 pt-3 flex justify-between text-lg font-bold text-green-700">
                      <span>TOTAL RESCISÃO:</span>
                      <span>{formatMoeda(prev.total)}</span>
                    </div>
                    {prev.dataLimitePagamento && (
                      <p className="text-[10px] text-red-500 mt-1 text-right">Prazo pagamento: {formatDate(prev.dataLimitePagamento)} (Art. 477 §6º CLT)</p>
                    )}
                  </div>
                );
              })()}
              {selectedItem.observacoes && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Observações</p>
                  <p className="text-sm mt-1">{selectedItem.observacoes}</p>
                </div>
              )}
              {/* Botão Exportar PDF/TRCT */}
              <div className="flex gap-3 justify-center pt-4 border-t">
                <Button
                  variant="outline"
                  className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={async () => {
                    try {
                      toast.info('Gerando TRCT...');
                      const pdfData = await utils.avisoPrevio.avisoPrevio.gerarPdf.fetch({ id: selectedItem.id });
                      const w = window.open('', '_blank', 'width=800,height=1100');
                      if (!w) { toast.error('Popup bloqueado. Permita popups para gerar o PDF.'); return; }
                      w.document.write(`<!DOCTYPE html><html><head><title>TRCT - ${pdfData.funcionario.nome}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 15mm; size: A4; } }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; max-width: 800px; margin: 0 auto; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
  h2 { text-align: center; font-size: 12px; font-weight: normal; color: #555; margin-top: 0; }
  .header-box { border: 2px solid #333; padding: 12px; margin-bottom: 12px; }
  .section { border: 1px solid #999; margin-bottom: 8px; }
  .section-title { background: #2d5016; color: white; padding: 4px 8px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-body { padding: 8px; }
  .row { display: flex; gap: 8px; margin-bottom: 4px; }
  .field { flex: 1; }
  .field-label { font-size: 8px; color: #666; text-transform: uppercase; }
  .field-value { font-weight: bold; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  table th, table td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; }
  table th { background: #f0f0f0; font-weight: bold; text-transform: uppercase; font-size: 9px; }
  .total-row { background: #e8f5e9; font-weight: bold; font-size: 12px; }
  .total-row td { border-top: 2px solid #2d5016; }
  .footer { margin-top: 30px; font-size: 9px; color: #666; text-align: center; }
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
  .sig-line { width: 45%; text-align: center; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  .no-print { text-align: center; margin: 10px 0; }
  @media print { .no-print { display: none; } }
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#2d5016;color:white;border:none;border-radius:4px;">Imprimir / Salvar PDF</button></div>
<h1>Termo de Rescisão do Contrato de Trabalho</h1>
<h2>TRCT - Conforme Art. 477 da CLT</h2>
<div class="section">
  <div class="section-title">Identificação do Empregador</div>
  <div class="section-body">
    <div class="row"><div class="field"><div class="field-label">Razão Social</div><div class="field-value">${pdfData.empresa.nome}</div></div><div class="field"><div class="field-label">CNPJ</div><div class="field-value">${pdfData.empresa.cnpj}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Endereço</div><div class="field-value">${pdfData.empresa.endereco || '-'}, ${pdfData.empresa.cidade || ''} - ${pdfData.empresa.estado || ''}</div></div></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Identificação do Trabalhador</div>
  <div class="section-body">
    <div class="row"><div class="field"><div class="field-label">Nome</div><div class="field-value">${pdfData.funcionario.nome}</div></div><div class="field"><div class="field-label">CPF</div><div class="field-value">${pdfData.funcionario.cpf}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Cargo/Função</div><div class="field-value">${pdfData.funcionario.cargo}</div></div><div class="field"><div class="field-label">Data Admissão</div><div class="field-value">${pdfData.funcionario.dataAdmissao ? pdfData.funcionario.dataAdmissao.split('-').reverse().join('/') : '-'}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">CTPS</div><div class="field-value">${pdfData.funcionario.ctps || '-'}</div></div><div class="field"><div class="field-label">Série</div><div class="field-value">${pdfData.funcionario.serieCtps || '-'}</div></div></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Dados do Aviso Prévio</div>
  <div class="section-body">
    <div class="row"><div class="field"><div class="field-label">Tipo</div><div class="field-value">${pdfData.aviso.tipoLabel}</div></div><div class="field"><div class="field-label">Salário Base</div><div class="field-value">R$ ${pdfData.aviso.salarioBase}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Data Início</div><div class="field-value">${pdfData.aviso.dataInicio ? pdfData.aviso.dataInicio.split('-').reverse().join('/') : '-'}</div></div><div class="field"><div class="field-label">Data Término</div><div class="field-value">${pdfData.aviso.dataFim ? pdfData.aviso.dataFim.split('-').reverse().join('/') : '-'}</div></div><div class="field"><div class="field-label">Dias de Aviso</div><div class="field-value">${pdfData.aviso.diasAviso} dias</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Redução de Jornada</div><div class="field-value">${pdfData.aviso.reducaoLabel}</div></div><div class="field"><div class="field-label">Anos de Serviço</div><div class="field-value">${pdfData.aviso.anosServico}</div></div></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Discriminação das Verbas Rescisórias</div>
  <div class="section-body">
    <table>
      <thead><tr><th>Verba</th><th>Referência</th><th style="text-align:right">Valor (R$)</th></tr></thead>
      <tbody>
        <tr><td>Saldo de Salário</td><td>${pdfData.previsaoRescisao.diasTrabalhadosMes || '-'}/${pdfData.previsaoRescisao.diasReaisMes || 30} dias</td><td style="text-align:right">${pdfData.previsaoRescisao.saldoSalario || '0,00'}</td></tr>
        <tr><td>Férias Proporcionais + 1/3</td><td>${pdfData.previsaoRescisao.mesesFerias || '-'} meses</td><td style="text-align:right">${pdfData.previsaoRescisao.totalFerias || '0,00'}</td></tr>
        ${parseFloat(pdfData.previsaoRescisao.feriasVencidas || '0') > 0 ? '<tr style="background:#fff3f3"><td>Férias Vencidas (em dobro)</td><td>' + (pdfData.previsaoRescisao.periodosVencidos || '-') + ' períodos</td><td style="text-align:right">' + pdfData.previsaoRescisao.feriasVencidas + '</td></tr>' : ''}
        <tr><td>VR Proporcional</td><td>R$ ${pdfData.previsaoRescisao.vrDiario || '0'}/dia × ${pdfData.previsaoRescisao.diasTrabalhadosMes || '-'} dias</td><td style="text-align:right">${pdfData.previsaoRescisao.vrProporcional || '0,00'}</td></tr>
        <tr><td>13º Salário Proporcional</td><td>${pdfData.previsaoRescisao.meses13o || '-'}/12</td><td style="text-align:right">${pdfData.previsaoRescisao.decimoTerceiroProporcional || '0,00'}</td></tr>
        <tr><td>Aviso Prévio Indenizado</td><td>${pdfData.previsaoRescisao.diasExtrasAviso || '0'} dias extras</td><td style="text-align:right">${pdfData.previsaoRescisao.avisoPrevioIndenizado || '0,00'}</td></tr>
        <tr><td colspan="3" style="background:#f5f5f5;font-size:9px;font-weight:bold;text-transform:uppercase">FGTS (Informativo)</td></tr>
        <tr style="color:#888"><td>FGTS Estimado</td><td>-</td><td style="text-align:right">${pdfData.previsaoRescisao.fgtsEstimado || '0,00'}</td></tr>
        <tr style="color:#888"><td>Multa 40% FGTS</td><td>-</td><td style="text-align:right">${pdfData.previsaoRescisao.multaFGTS || '0,00'}</td></tr>
        <tr class="total-row"><td colspan="2"><strong>TOTAL RESCISÃO</strong></td><td style="text-align:right"><strong>${pdfData.previsaoRescisao.total || pdfData.valorEstimadoTotal || '0,00'}</strong></td></tr>
      </tbody>
    </table>
    ${pdfData.previsaoRescisao.dataLimitePagamento ? '<p style="font-size:9px;color:#c00;margin-top:4px;text-align:right">Prazo de pagamento: ' + pdfData.previsaoRescisao.dataLimitePagamento.split('-').reverse().join('/') + ' (Art. 477 §6º CLT)</p>' : ''}
  </div>
</div>
${pdfData.aviso.observacoes ? '<div class="section"><div class="section-title">Observações</div><div class="section-body">' + pdfData.aviso.observacoes + '</div></div>' : ''}
<div class="signatures">
  <div class="sig-line">${pdfData.empresa.nome}<br/><small>Empregador</small></div>
  <div class="sig-line">${pdfData.funcionario.nome}<br/><small>Empregado(a)</small></div>
</div>
<div class="footer">
  <p><strong>Documento gerado por:</strong> ${user?.name || user?.username || 'Usuário não identificado'} | <strong>Data/Hora:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} | <strong>Sistema:</strong> ERP - Gestão Integrada</p>
  <p>Este documento não substitui o TRCT homologado. Serve como previsão de verbas rescisórias.</p>
  <p style="font-size:7px;color:#aaa;margin-top:4px">Este documento contém dados pessoais protegidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD). É proibida a reprodução, distribuição ou compartilhamento sem autorização. O uso indevido está sujeito às sanções previstas na legislação vigente.</p>
</div>
</body></html>`);
                      w.document.close();
                      toast.success('TRCT gerado com sucesso!');
                    } catch (err) {
                      console.error(err);
                      toast.error('Erro ao gerar TRCT');
                    }
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Exportar TRCT (PDF)
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    window.print();
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir Detalhes
                </Button>
              </div>
            </div>
          </FullScreenDialog>
        )}

        {/* Create Dialog */}
        <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setForm({}); setCalculoPreview(null); setEditingItem(null); }} title={editingItem ? "Editar Aviso Prévio" : "Novo Aviso Prévio"} icon={<AlertTriangle className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-4xl mx-auto px-2">
            {/* Card principal do formulário */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Header do card */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b px-6 py-4">
                <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Dados do Aviso Prévio
                </h3>
                <p className="text-xs text-amber-700 mt-1">Preencha os dados abaixo conforme CLT Art. 487-491 e Lei 12.506/2011</p>
              </div>

              <div className="p-6 space-y-5">
                {/* Seção 1: Colaborador */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                    <Users className="h-4 w-4 text-amber-600" />
                    Colaborador <span className="text-red-500">*</span>
                  </label>
                  <Popover open={empPopoverOpen} onOpenChange={setEmpPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={empPopoverOpen}
                        className={cn(
                          "flex w-full items-center justify-between border-2 rounded-lg px-4 py-3 bg-white text-sm transition-all",
                          empPopoverOpen ? "border-amber-400 ring-2 ring-amber-100" : "border-gray-200 hover:border-amber-400",
                          !form.employeeId && "text-gray-400"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Search className="h-5 w-5 text-amber-500 shrink-0" />
                          {selectedEmp ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                                {(selectedEmp.nomeCompleto || '').charAt(0)}
                              </div>
                              <span className="font-semibold text-gray-900 truncate">{selectedEmp.nomeCompleto}</span>
                              <span className="text-xs text-gray-400 font-mono shrink-0">CPF: {formatCPF(selectedEmp.cpf)}</span>
                            </div>
                          ) : (
                            <span>Selecione o colaborador...</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {form.employeeId && (
                            <span
                              className="p-1 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer"
                              onClick={e => { e.stopPropagation(); e.preventDefault(); setForm({ ...form, employeeId: undefined }); setCalculoPreview(null); setEmpPopoverOpen(false); }}
                            >
                              <X className="h-4 w-4" />
                            </span>
                          )}
                          <ChevronsUpDown className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                      <Command>
                        <CommandInput placeholder="Digite nome, CPF ou função..." />
                        <CommandList className="max-h-72">
                          <CommandEmpty className="py-6 text-center text-sm text-gray-400">
                            <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            Nenhum colaborador encontrado
                          </CommandEmpty>
                          <CommandGroup>
                            {activeEmployees.map((e: any) => (
                              <CommandItem
                                key={e.id}
                                value={`${e.nomeCompleto || ''} ${e.cpf || ''} ${e.funcao || ''} ${e.setor || ''}`}
                                onSelect={() => {
                                  const avisoAtivo = (avisosList as any[]).find((a: any) => a.employeeId === e.id && a.status === 'em_andamento');
                                  if (avisoAtivo && !editingItem) {
                                    toast.error(`${e.nomeCompleto} já possui aviso prévio em andamento (término: ${formatDate(avisoAtivo.dataFim)}). Conclua ou cancele o aviso existente antes de criar um novo.`);
                                    return;
                                  }
                                  setForm({ ...form, employeeId: e.id });
                                  setCalculoPreview(null);
                                  setEmpPopoverOpen(false);
                                }}
                                className="flex items-center justify-between py-2.5 cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                                    {(e.nomeCompleto || '').charAt(0)}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-800 block text-sm">{e.nomeCompleto}</span>
                                    <span className="text-xs text-gray-500">{e.funcao || 'Sem função'} {e.setor ? `• ${e.setor}` : ''}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-gray-400 font-mono">{formatCPF(e.cpf)}</span>
                                  {(avisosList as any[]).some((a: any) => a.employeeId === e.id && a.status === 'em_andamento') && !editingItem && (
                                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 bg-orange-50">Aviso ativo</Badge>
                                  )}
                                  {form.employeeId === e.id && <Check className="h-4 w-4 text-amber-600" />}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Seção 2: Tipo e Data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      Tipo de Aviso Prévio <span className="text-red-500">*</span>
                    </label>
                    <Select value={form.tipo || ""} onValueChange={v => { setForm({ ...form, tipo: v }); setCalculoPreview(null); }}>
                      <SelectTrigger className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empregador_trabalhado">Empregador (Trabalhado)</SelectItem>
                        <SelectItem value="empregador_indenizado">Empregador (Indenizado)</SelectItem>
                        <SelectItem value="empregado_trabalhado">Empregado (Trabalhado)</SelectItem>
                        <SelectItem value="empregado_indenizado">Empregado (Indenizado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-amber-600" />
                      Data do Aviso <span className="text-red-500">*</span>
                    </label>
                    <Input type="date" className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors" value={form.dataDesligamento || ""} onChange={e => setForm({ ...form, dataDesligamento: e.target.value })} />
                  </div>
                </div>

                {/* Seção 3: Redução e Dias Trabalhados */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600" />
                      Redução de Jornada (Art. 488 CLT)
                    </label>
                    <Select value={form.reducaoJornada || "nenhuma"} onValueChange={v => setForm({ ...form, reducaoJornada: v })}>
                      <SelectTrigger className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">Nenhuma</SelectItem>
                        <SelectItem value="2h_dia">2 horas por dia</SelectItem>
                        <SelectItem value="7_dias_corridos">7 dias corridos no final</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Timer className="h-4 w-4 text-amber-600" />
                      Dias Trabalhados no Mês
                    </label>
                    <Input
                      type="number"
                      className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"
                      value={form.diasTrabalhadosOverride || ""}
                      onChange={e => setForm({ ...form, diasTrabalhadosOverride: e.target.value })}
                      placeholder="Automático (dia da data)"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Se vazio, calcula pelo dia da data de desligamento. Futuramente integrado com fechamento de ponto.</p>
                  </div>
                </div>

                {/* Indicador de cálculo automático */}
                {calculoLoading && (
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <Clock className="h-4 w-4 animate-spin" />
                    <span>Calculando previsão de rescisão...</span>
                  </div>
                )}

                {/* Seção 3.5: Datas Calculadas - Último Dia Trabalhado e Data de Pagamento */}
                {(() => {
                  // Calcular no frontend assim que tiver Data do Aviso + Tipo
                  if (!form.dataDesligamento || !form.tipo) return null;
                  const dataAviso = form.dataDesligamento; // Data do Aviso informada pelo usuário
                  
                  // Calcular anos de serviço para determinar dias de aviso
                  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);
                  const dataAdmissao = selectedEmp?.dataAdmissao;
                  let anosServico = 0;
                  if (dataAdmissao) {
                    const diff = new Date(dataAviso + 'T00:00:00').getTime() - new Date(dataAdmissao + 'T00:00:00').getTime();
                    anosServico = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
                  }
                  
                  // Dias de aviso: trabalhado = 30 fixo, indenizado = 30 + 3/ano (max 90)
                  const isTrabalhado = form.tipo?.includes('trabalhado');
                  const diasAviso = isTrabalhado ? 30 : Math.min(30 + (anosServico * 3), 90);
                  
                  // Data início do aviso = dia seguinte à data do aviso
                  const dtInicio = new Date(dataAviso + 'T00:00:00');
                  dtInicio.setDate(dtInicio.getDate() + 1);
                  
                  // Data fim do aviso = início + dias - 1
                  const dtFim = new Date(dtInicio);
                  dtFim.setDate(dtFim.getDate() + diasAviso - 1);
                  
                  // Redução: se 7 dias corridos, último dia trabalhado = 7 dias antes do fim
                  const reducao = form.reducaoJornada || 'nenhuma';
                  let dtUltimoDiaTrab = new Date(dtFim);
                  if (reducao === '7_dias_corridos') {
                    dtUltimoDiaTrab = new Date(dtFim);
                    dtUltimoDiaTrab.setDate(dtUltimoDiaTrab.getDate() - 7);
                  }
                  // Se 2h/dia, trabalha todos os dias mas sai 2h mais cedo - último dia = data fim
                  
                  // Data de pagamento = 10 dias corridos após término do aviso (Art. 477 §6º CLT)
                  const dtPagamento = new Date(dtFim);
                  dtPagamento.setDate(dtPagamento.getDate() + 10);
                  
                  const fmtDt = (dt: Date) => {
                    const d = dt.getDate().toString().padStart(2, '0');
                    const m = (dt.getMonth() + 1).toString().padStart(2, '0');
                    const y = dt.getFullYear();
                    return `${d}/${m}/${y}`;
                  };
                  
                  const fmtDtISO = (dt: Date) => dt.toISOString().split('T')[0];
                  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                  
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
                      <div className="text-center p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Calendar className="h-5 w-5 text-blue-600" />
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Último Dia Trabalhado</p>
                        </div>
                        <p className="text-2xl font-bold text-blue-800">{fmtDt(dtUltimoDiaTrab)}</p>
                        <p className="text-xs text-blue-500 mt-1">{diasSemana[dtUltimoDiaTrab.getDay()]}</p>
                        {reducao === '7_dias_corridos' && (
                          <p className="text-[10px] text-amber-600 mt-1">7 dias de folga no final do aviso</p>
                        )}
                        {reducao === '2h_dia' && (
                          <p className="text-[10px] text-amber-600 mt-1">Sai 2h mais cedo todos os dias</p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-white rounded-lg border border-green-100 shadow-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Término do Aviso</p>
                        </div>
                        <p className="text-2xl font-bold text-green-800">{fmtDt(dtFim)}</p>
                        <p className="text-xs text-green-500 mt-1">{diasSemana[dtFim.getDay()]} | {diasAviso} dias de aviso</p>
                      </div>
                      <div className="text-center p-4 bg-white rounded-lg border border-red-100 shadow-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <DollarSign className="h-5 w-5 text-red-600" />
                          <p className="text-xs font-bold text-red-600 uppercase tracking-wide">Data de Pagamento</p>
                        </div>
                        <p className="text-2xl font-bold text-red-700">{fmtDt(dtPagamento)}</p>
                        <p className="text-xs text-red-500 mt-1">{diasSemana[dtPagamento.getDay()]} | Art. 477 §6º CLT</p>
                        <p className="text-[10px] text-gray-400 mt-1">10 dias corridos após término</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Seção 4: Observações */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">Observações</label>
                  <Textarea
                    value={form.observacoes || ""}
                    onChange={e => setForm({ ...form, observacoes: e.target.value })}
                    rows={3}
                    className="border-2 border-gray-200 hover:border-amber-400 transition-colors resize-none"
                    placeholder="Observações adicionais sobre o aviso prévio..."
                  />
                </div>
              </div>
            </div>

            {/* Preview do cálculo */}
            {calculoPreview && (
              <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-green-100 px-6 py-3 border-b border-green-200">
                  <p className="font-bold text-green-800 flex items-center gap-2">
                    <DollarSign className="h-5 w-5" /> Previsão de Rescisão — {calculoPreview.funcionario?.nome || ''}
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Salário Base: {formatMoeda(calculoPreview.salarioBase)} | Admissão: {formatDate(calculoPreview.dataAdmissao)} | Término Aviso: {formatDate(calculoPreview.dataFim)}
                  </p>
                </div>
                <div className="p-6">
                  {/* Cards resumo */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Anos de Serviço</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.anosServico}</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Dias Aviso</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.diasAviso} dias</p>
                      {(calculoPreview.diasExtras || 0) > 0 && (
                        <p className="text-[9px] text-amber-600">+ {calculoPreview.diasExtras} dias indenizados</p>
                      )}
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Meses Férias</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.previsaoRescisao?.mesesFerias || 0}/12</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Meses 13º</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.previsaoRescisao?.meses13o || 0}/12</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-red-100">
                      <p className="text-[10px] text-red-600 font-medium mb-1">Limite Pgto</p>
                      <p className="text-lg font-bold text-red-700">{formatDate(calculoPreview.previsaoRescisao?.dataLimitePagamento)}</p>
                      <p className="text-[9px] text-red-500">Art. 477 §6º CLT</p>
                    </div>
                  </div>

                  {/* Tabela detalhada de verbas */}
                  {calculoPreview.previsaoRescisao && (
                    <div className="bg-white rounded-lg border border-green-100 p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Verbas Rescisórias</p>
                      <div className="space-y-0">
                        {/* Saldo de Salário */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">Saldo de Salário</span>
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.diasTrabalhadosMes}/{calculoPreview.previsaoRescisao.diasReaisMes || 30} dias do mês)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.saldoSalario)}</span>
                        </div>

                        {/* Férias Proporcionais + 1/3 */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">Férias Proporcionais + 1/3</span>
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.mesesFerias} meses)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.totalFerias)}</span>
                        </div>
                        <div className="flex justify-between py-1 pl-6 border-b border-gray-50">
                          <span className="text-xs text-gray-400">Férias: {formatMoeda(calculoPreview.previsaoRescisao.feriasProporcional)} + 1/3: {formatMoeda(calculoPreview.previsaoRescisao.tercoConstitucional)}</span>
                        </div>

                        {/* Férias Vencidas (se houver) */}
                        {parseFloat(calculoPreview.previsaoRescisao.feriasVencidas) > 0 && (
                          <div className="flex justify-between py-2 border-b border-gray-100 bg-red-50">
                            <div>
                              <span className="text-sm text-red-700 font-medium">Férias Vencidas</span>
                              <span className="text-[10px] text-red-400 ml-2">({calculoPreview.previsaoRescisao.periodosVencidos} período(s))</span>
                            </div>
                            <span className="font-semibold text-sm text-red-700">{formatMoeda(calculoPreview.previsaoRescisao.feriasVencidas)}</span>
                          </div>
                        )}

                        {/* VR Proporcional */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">VR Proporcional</span>
                            <span className="text-[10px] text-gray-400 ml-2">(R$ {calculoPreview.previsaoRescisao.vrDiario}/dia × {calculoPreview.previsaoRescisao.diasTrabalhadosMes} dias)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.vrProporcional)}</span>
                        </div>

                        {/* 13º Proporcional */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">13º Salário Proporcional</span>
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.meses13o}/12 meses)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.decimoTerceiroProporcional)}</span>
                        </div>

                        {/* Aviso Prévio Indenizado */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">Aviso Prévio Indenizado</span>
                            <span className="text-[10px] text-gray-400 ml-2">(Lei 12.506/2011: {calculoPreview.previsaoRescisao.diasExtrasAviso} dias extras)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.avisoPrevioIndenizado)}</span>
                        </div>

                        {/* FGTS */}
                        <div className="pt-3 mt-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">FGTS</p>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-gray-50 bg-gray-50 px-2 rounded">
                          <span className="text-xs text-gray-500">FGTS Estimado no período (8% × {calculoPreview.previsaoRescisao.mesesTotais || 0} meses)</span>
                          <span className="text-xs font-medium text-gray-500">{formatMoeda(calculoPreview.previsaoRescisao.fgtsEstimado)}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-700">Multa 40% FGTS</span>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.multaFGTS)}</span>
                        </div>
                      </div>

                      {/* Total Verbas */}
                      <div className="mt-4 pt-3 border-t-2 border-green-300 flex justify-between items-center">
                        <div>
                          <span className="text-lg font-bold text-green-800">TOTAL ESTIMADO DA RESCISÃO</span>
                          <p className="text-[10px] text-green-600">Saldo + Férias + VR + 13º + Aviso Prévio + Multa FGTS</p>
                        </div>
                        <span className="text-2xl font-bold text-green-700">{formatMoeda(calculoPreview.previsaoRescisao.total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Seção de Descontos */}
                  {calculoPreview.descontos && calculoPreview.descontos.length > 0 && (
                    <div className="bg-white rounded-lg border border-red-200 p-4 mt-4">
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">Descontos</p>
                      <div className="space-y-0">
                        {calculoPreview.descontos.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between py-2 border-b border-red-50">
                            <span className="text-sm text-red-700">{d.descricao}</span>
                            <span className="font-semibold text-sm text-red-700">- {formatMoeda(d.valor)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between py-2 mt-1 border-t border-red-200">
                          <span className="text-sm font-bold text-red-700">Total Descontos</span>
                          <span className="font-bold text-sm text-red-700">- {formatMoeda(calculoPreview.totalDescontos)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Total Líquido */}
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-5 mt-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-lg font-bold text-white">TOTAL LÍQUIDO RESCISÃO</span>
                        <p className="text-[10px] text-green-200">Verbas {calculoPreview.descontos?.length > 0 ? '- Descontos' : ''}</p>
                      </div>
                      <span className="text-3xl font-bold text-white">{formatMoeda(calculoPreview.totalLiquido || calculoPreview.previsaoRescisao.total)}</span>
                    </div>
                    {calculoPreview.previsaoRescisao?.dataLimitePagamento && (
                      <p className="text-[10px] text-green-200 mt-2 text-right">Prazo pagamento: {formatDate(calculoPreview.previsaoRescisao.dataLimitePagamento)} (Art. 477 §6º CLT)</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4">
              <Button variant="outline" className="h-11 px-6" onClick={() => { setShowDialog(false); setForm({}); setCalculoPreview(null); }}>Cancelar</Button>
              <Button className="h-11 px-8 bg-amber-600 hover:bg-amber-700 text-white font-semibold" onClick={handleSubmit} disabled={createAviso.isPending}>
                {createAviso.isPending ? "Salvando..." : "Criar Aviso Prévio"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
