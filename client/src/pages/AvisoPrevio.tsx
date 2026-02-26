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
import { formatCPF, formatMoeda } from "@/lib/formatters";
import {
  AlertTriangle, Plus, Search, Clock, Calendar, DollarSign,
  Users, Trash2, Pencil, Eye, X, FileText, ArrowRight,
  CheckCircle2, XCircle, Timer, Ban, ChevronsUpDown, Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

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
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState<any>({});
  const [calculoPreview, setCalculoPreview] = useState<any>(null);

  // Queries
  const { data: avisosList = [], refetch } = trpc.avisoPrevio.avisoPrevio.list.useQuery(
    { companyId, ...(statusFilter !== "todos" ? { status: statusFilter } : {}) },
    { enabled: !!companyId }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // Mutations
  const createAviso = trpc.avisoPrevio.avisoPrevio.create.useMutation({
    onSuccess: (data: any) => {
      refetch();
      toast.success(`Aviso prévio criado! ${data.diasAviso} dias, término: ${formatDate(data.dataFim)}`);
      setShowDialog(false);
      setForm({});
      setCalculoPreview(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateAviso = trpc.avisoPrevio.avisoPrevio.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Aviso prévio atualizado!"); },
  });
  const deleteAviso = trpc.avisoPrevio.avisoPrevio.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Aviso prévio excluído!"); },
  });

  // tRPC utils for imperative queries
  const utils = trpc.useUtils();

  // Calcular preview
  const [calculoLoading, setCalculoLoading] = useState(false);
  const calcularPreview = async () => {
    if (!form.employeeId || !form.tipo) {
      toast.error("Selecione o funcionário e o tipo");
      return;
    }
    setCalculoLoading(true);
    try {
      const result = await (utils as any).avisoPrevio.avisoPrevio.calcular.fetch({
        employeeId: form.employeeId,
        tipo: form.tipo,
        dataDesligamento: form.dataDesligamento || undefined,
        vrDiarioOverride: form.vrDiarioOverride ? parseFloat(String(form.vrDiarioOverride).replace(/\./g, '').replace(',', '.')) : undefined,
        diasTrabalhadosOverride: form.diasTrabalhadosOverride ? Number(form.diasTrabalhadosOverride) : undefined,
      });
      setCalculoPreview(result);
      toast.success("Previsão calculada com sucesso!");
    } catch (e: any) {
      console.error("Erro ao calcular rescisão:", e);
      toast.error(e.message || "Erro ao calcular previsão de rescisão");
    } finally {
      setCalculoLoading(false);
    }
  };

  // Filtered list
  const filtered = useMemo(() => {
    return (avisosList as any[]).filter((a: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(a.employeeName || "").toLowerCase().includes(s) && !(a.employeeCpf || "").includes(s)) return false;
      }
      return true;
    });
  }, [avisosList, search]);

  // Stats
  const stats = useMemo(() => {
    const list = avisosList as any[];
    return {
      total: list.length,
      emAndamento: list.filter(a => a.status === "em_andamento").length,
      concluidos: list.filter(a => a.status === "concluido").length,
      cancelados: list.filter(a => a.status === "cancelado").length,
    };
  }, [avisosList]);

  // Employee search for form (Popover + Command)
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);

  const handleSubmit = () => {
    if (!form.employeeId || !form.tipo || !form.dataInicio) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createAviso.mutate({
      companyId,
      employeeId: form.employeeId,
      tipo: form.tipo,
      dataInicio: form.dataInicio,
      dataDesligamento: form.dataDesligamento || form.dataInicio,
      reducaoJornada: form.reducaoJornada || "nenhuma",
      observacoes: form.observacoes,
      vrDiario: form.vrDiarioOverride ? parseFloat(String(form.vrDiarioOverride).replace(/\./g, '').replace(',', '.')) : undefined,
      diasTrabalhados: form.diasTrabalhadosOverride ? Number(form.diasTrabalhadosOverride) : undefined,
    });
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
          <Button onClick={() => { setForm({}); setCalculoPreview(null); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo Aviso Prévio
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
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
                  <p className="text-2xl font-bold text-blue-600">{stats.emAndamento}</p>
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
                  <p className="text-2xl font-bold text-green-600">{stats.concluidos}</p>
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
                  <p className="text-2xl font-bold text-red-600">{stats.cancelados}</p>
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
                    <th className="p-3 text-left font-medium">Tipo</th>
                    <th className="p-3 text-left font-medium">Início</th>
                    <th className="p-3 text-left font-medium">Término</th>
                    <th className="p-3 text-center font-medium">Dias</th>
                    <th className="p-3 text-left font-medium">Redução</th>
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
                    const tp = TIPO_LABELS[a.tipo] || { label: a.tipo, color: "text-gray-700", bg: "bg-gray-100" };
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(a.employeeId)}>
                          {a.employeeName}
                        </td>
                        <td className="p-3">{formatCPF(a.employeeCpf)}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${tp.bg} ${tp.color}`}>{tp.label}</span>
                        </td>
                        <td className="p-3">{formatDate(a.dataInicio)}</td>
                        <td className="p-3">{formatDate(a.dataFim)}</td>
                        <td className="p-3 text-center font-semibold">{a.diasAviso}</td>
                        <td className="p-3 text-xs">{REDUCAO_LABELS[a.reducaoJornada] || "-"}</td>
                        <td className="p-3 text-right font-semibold">{formatMoeda(a.valorEstimadoTotal)}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedItem(a); setShowDetailDialog(true); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {a.status === "em_andamento" && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Concluir" onClick={() => handleConcluir(a.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Cancelar" onClick={() => handleCancelar(a.id)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
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
                  <p className="text-xs text-amber-500">{selectedItem.anosServico} anos de serviço</p>
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
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">Saldo de Salário ({prev.diasTrabalhadosMes} dias):</span><span className="font-semibold">{formatMoeda(prev.saldoSalario)}</span></div>
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
            </div>
          </FullScreenDialog>
        )}

        {/* Create Dialog */}
        <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setForm({}); setCalculoPreview(null); }} title="Novo Aviso Prévio" icon={<AlertTriangle className="h-5 w-5 text-white" />}>
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

                {/* Seção 2: Tipo e Datas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                      Data de Início <span className="text-red-500">*</span>
                    </label>
                    <Input type="date" className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-red-600" />
                      Data de Desligamento
                    </label>
                    <Input type="date" className="h-12 border-2 border-gray-200 hover:border-red-300 transition-colors" value={form.dataDesligamento || ""} onChange={e => setForm({ ...form, dataDesligamento: e.target.value })} />
                    <p className="text-[10px] text-gray-400 mt-1">Se vazio, usa a data de início</p>
                  </div>
                </div>

                {/* Seção 3: Redução, Dias Trabalhados, VR Override */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600" />
                      Redução de Jornada (Art. 488)
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
                      placeholder="Auto (dia do mês)"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Se vazio, usa o dia da data de desligamento</p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-amber-600" />
                      VR Diário (override)
                    </label>
                    <Input
                      className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"
                      value={form.vrDiarioOverride || ""}
                      onChange={e => setForm({ ...form, vrDiarioOverride: e.target.value })}
                      placeholder="Auto (config benefícios)"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Se vazio, usa a config de benefícios</p>
                  </div>
                </div>

                {/* Botão Calcular */}
                <div>
                  <Button
                    variant="outline"
                    className="w-full h-12 border-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 font-semibold"
                    onClick={calcularPreview}
                    disabled={!form.employeeId || !form.tipo || calculoLoading}
                  >
                    {calculoLoading ? (
                      <><Clock className="h-4 w-4 mr-2 animate-spin" /> Calculando...</>
                    ) : (
                      <><DollarSign className="h-4 w-4 mr-2" /> Calcular Previsão de Rescisão</>
                    )}
                  </Button>
                </div>

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
                    Salário Base: {formatMoeda(calculoPreview.salarioBase)} | Admissão: {formatDate(calculoPreview.dataAdmissao)} | Desligamento: {formatDate(calculoPreview.dataDesligamento)}
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
                      <p className="text-[10px] text-green-600 font-medium mb-1">Dias Aviso (Lei 12.506)</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.diasAviso}</p>
                      <p className="text-[9px] text-green-500">30 + {calculoPreview.previsaoRescisao?.diasExtrasAviso || 0} extras</p>
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
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.diasTrabalhadosMes} dias)</span>
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

                        {/* Separador FGTS */}
                        <div className="pt-3 mt-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">FGTS (Informativo — depositado na conta FGTS)</p>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-gray-50 bg-gray-50 px-2 rounded">
                          <span className="text-xs text-gray-500">FGTS Estimado (8% × {calculoPreview.previsaoRescisao.mesesFerias + calculoPreview.previsaoRescisao.meses13o} meses)</span>
                          <span className="text-xs font-medium text-gray-500">{formatMoeda(calculoPreview.previsaoRescisao.fgtsEstimado)}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-gray-50 bg-gray-50 px-2 rounded mt-1">
                          <span className="text-xs text-gray-500">Multa 40% FGTS</span>
                          <span className="text-xs font-medium text-gray-500">{formatMoeda(calculoPreview.previsaoRescisao.multaFGTS)}</span>
                        </div>
                      </div>

                      {/* Total */}
                      <div className="mt-4 pt-3 border-t-2 border-green-300 flex justify-between items-center">
                        <div>
                          <span className="text-lg font-bold text-green-800">TOTAL RESCISÃO</span>
                          <p className="text-[10px] text-green-600">Saldo + Férias + VR + 13º + Aviso Prévio</p>
                        </div>
                        <span className="text-2xl font-bold text-green-700">{formatMoeda(calculoPreview.previsaoRescisao.total)}</span>
                      </div>
                    </div>
                  )}
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
    </DashboardLayout>
  );
}
