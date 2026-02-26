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
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, formatMoeda } from "@/lib/formatters";
import {
  AlertTriangle, Plus, Search, Clock, Calendar, DollarSign,
  Users, Trash2, Pencil, Eye, X, FileText, ArrowRight,
  CheckCircle2, XCircle, Timer, Ban,
} from "lucide-react";
import { useState, useMemo } from "react";

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

  // Calcular preview
  const calcularPreview = async () => {
    if (!form.employeeId || !form.tipo) {
      toast.error("Selecione o funcionário e o tipo");
      return;
    }
    try {
      const result = await (trpc as any).avisoPrevio.avisoPrevio.calcular.query({
        employeeId: form.employeeId,
        tipo: form.tipo,
      });
      setCalculoPreview(result);
    } catch (e: any) {
      toast.error(e.message || "Erro ao calcular");
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

  // Employee search for form
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);
  const filteredEmps = activeEmployees.filter((e: any) => {
    if (!empSearch) return true;
    const s = empSearch.toLowerCase();
    return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, ""));
  });

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
      reducaoJornada: form.reducaoJornada || "nenhuma",
      observacoes: form.observacoes,
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
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between"><span>Saldo de Salário:</span><span className="font-medium">{formatMoeda(prev.saldoSalario)}</span></div>
                      <div className="flex justify-between"><span>13º Proporcional:</span><span className="font-medium">{formatMoeda(prev.decimoTerceiroProporcional)}</span></div>
                      <div className="flex justify-between"><span>Férias Proporcionais:</span><span className="font-medium">{formatMoeda(prev.feriasProporcional)}</span></div>
                      <div className="flex justify-between"><span>1/3 Constitucional:</span><span className="font-medium">{formatMoeda(prev.tercoConstitucional)}</span></div>
                      <div className="flex justify-between"><span>FGTS Estimado:</span><span className="font-medium">{formatMoeda(prev.fgtsEstimado)}</span></div>
                      <div className="flex justify-between"><span>Multa 40% FGTS:</span><span className="font-medium">{formatMoeda(prev.multaFGTS)}</span></div>
                      <div className="flex justify-between"><span>Aviso Indenizado:</span><span className="font-medium">{formatMoeda(prev.avisoPrevioIndenizado)}</span></div>
                    </div>
                    <div className="border-t mt-3 pt-3 flex justify-between text-lg font-bold text-green-700">
                      <span>TOTAL ESTIMADO:</span>
                      <span>{formatMoeda(prev.total)}</span>
                    </div>
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
          <div className="w-full max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              {/* Employee Select */}
              <div className="col-span-2">
                <label className="text-sm font-medium">Colaborador *</label>
                <div className="relative">
                  <div
                    className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
                  >
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input
                        autoFocus
                        className="flex-1 bg-transparent outline-none text-sm"
                        placeholder="Digite nome ou CPF..."
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione o colaborador..."}
                      </span>
                    )}
                    {form.employeeId && (
                      <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setForm({ ...form, employeeId: undefined }); setEmpSearch(""); setCalculoPreview(null); }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {empDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                        {filteredEmps.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">Nenhum resultado</div>
                        ) : filteredEmps.slice(0, 20).map((e: any) => (
                          <div
                            key={e.id}
                            className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm flex justify-between"
                            onClick={() => { setForm({ ...form, employeeId: e.id }); setEmpDropdownOpen(false); setEmpSearch(""); setCalculoPreview(null); }}
                          >
                            <span className="font-medium">{e.nomeCompleto}</span>
                            <span className="text-muted-foreground">{formatCPF(e.cpf)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Tipo de Aviso Prévio *</label>
                <Select value={form.tipo || ""} onValueChange={v => { setForm({ ...form, tipo: v }); setCalculoPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empregador_trabalhado">Empregador (Trabalhado)</SelectItem>
                    <SelectItem value="empregador_indenizado">Empregador (Indenizado)</SelectItem>
                    <SelectItem value="empregado_trabalhado">Empregado (Trabalhado)</SelectItem>
                    <SelectItem value="empregado_indenizado">Empregado (Indenizado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Data de Início *</label>
                <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
              </div>

              <div>
                <label className="text-sm font-medium">Redução de Jornada (Art. 488 CLT)</label>
                <Select value={form.reducaoJornada || "nenhuma"} onValueChange={v => setForm({ ...form, reducaoJornada: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Nenhuma</SelectItem>
                    <SelectItem value="2h_dia">2 horas por dia</SelectItem>
                    <SelectItem value="7_dias_corridos">7 dias corridos no final</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">&nbsp;</label>
                <Button variant="outline" className="w-full" onClick={calcularPreview} disabled={!form.employeeId || !form.tipo}>
                  <DollarSign className="h-4 w-4 mr-2" /> Calcular Previsão
                </Button>
              </div>

              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} placeholder="Observações adicionais..." />
              </div>
            </div>

            {/* Preview do cálculo */}
            {calculoPreview && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Previsão Calculada
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                  <div className="text-center">
                    <p className="text-xs text-green-600">Anos de Serviço</p>
                    <p className="text-xl font-bold">{calculoPreview.anosServico}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-green-600">Dias de Aviso</p>
                    <p className="text-xl font-bold">{calculoPreview.diasAviso}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-green-600">Data Fim Estimada</p>
                    <p className="text-xl font-bold">{formatDate(calculoPreview.dataFimEstimada)}</p>
                  </div>
                </div>
                {calculoPreview.previsaoRescisao && (
                  <div className="grid grid-cols-2 gap-2 text-sm border-t border-green-200 pt-3">
                    <div className="flex justify-between"><span>Saldo Salário:</span><span className="font-medium">{formatMoeda(calculoPreview.previsaoRescisao.saldoSalario)}</span></div>
                    <div className="flex justify-between"><span>13º Proporcional:</span><span className="font-medium">{formatMoeda(calculoPreview.previsaoRescisao.decimoTerceiroProporcional)}</span></div>
                    <div className="flex justify-between"><span>Férias Proporcionais:</span><span className="font-medium">{formatMoeda(calculoPreview.previsaoRescisao.feriasProporcional)}</span></div>
                    <div className="flex justify-between"><span>1/3 Constitucional:</span><span className="font-medium">{formatMoeda(calculoPreview.previsaoRescisao.tercoConstitucional)}</span></div>
                    <div className="flex justify-between"><span>FGTS Estimado:</span><span className="font-medium">{formatMoeda(calculoPreview.previsaoRescisao.fgtsEstimado)}</span></div>
                    <div className="flex justify-between"><span>Multa 40% FGTS:</span><span className="font-medium">{formatMoeda(calculoPreview.previsaoRescisao.multaFGTS)}</span></div>
                    <div className="col-span-2 border-t pt-2 flex justify-between text-lg font-bold text-green-700">
                      <span>TOTAL ESTIMADO:</span>
                      <span>{formatMoeda(calculoPreview.previsaoRescisao.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowDialog(false); setForm({}); setCalculoPreview(null); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createAviso.isPending}>
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
