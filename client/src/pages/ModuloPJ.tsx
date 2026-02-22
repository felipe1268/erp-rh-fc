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
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, formatMoeda } from "@/lib/formatters";
import {
  Briefcase, Plus, Search, DollarSign, AlertTriangle, FileText,
  Trash2, Eye, X, Clock, CheckCircle2, RefreshCw, Calendar,
  Users, TrendingUp, FileSignature, Ban,
} from "lucide-react";
import { useState, useMemo } from "react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatCNPJ(v: string | null | undefined) {
  if (!v) return "-";
  const n = v.replace(/\D/g, "");
  if (n.length !== 14) return v;
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

const STATUS_CONTRATO: Record<string, { label: string; color: string; bg: string }> = {
  pendente_assinatura: { label: "Pendente Assinatura", color: "text-amber-700", bg: "bg-amber-100" },
  ativo: { label: "Ativo", color: "text-green-700", bg: "bg-green-100" },
  suspenso: { label: "Suspenso", color: "text-orange-700", bg: "bg-orange-100" },
  encerrado: { label: "Encerrado", color: "text-gray-700", bg: "bg-gray-100" },
  cancelado: { label: "Cancelado", color: "text-red-700", bg: "bg-red-100" },
};

const STATUS_PAGAMENTO: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-100" },
  pago: { label: "Pago", color: "text-green-700", bg: "bg-green-100" },
  cancelado: { label: "Cancelado", color: "text-red-700", bg: "bg-red-100" },
};

export default function ModuloPJ() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [tab, setTab] = useState("contratos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showContratoDialog, setShowContratoDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showPagamentoDialog, setShowPagamentoDialog] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [pagForm, setPagForm] = useState<any>({});
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Mês referência para pagamentos
  const now = new Date();
  const [mesRef, setMesRef] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Queries
  const { data: contratos = [], refetch: refetchContratos } = trpc.pj.contratos.list.useQuery(
    { companyId, ...(statusFilter !== "todos" ? { status: statusFilter } : {}) },
    { enabled: !!companyId }
  );
  const { data: alertas } = trpc.pj.contratos.alertas.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: pagamentos = [], refetch: refetchPagamentos } = trpc.pj.pagamentos.list.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: !!companyId && tab === "pagamentos" }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const pjEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.tipoContrato === "PJ" && e.status === "Ativo" && !e.deletedAt), [empList]);

  // Mutations
  const createContrato = trpc.pj.contratos.create.useMutation({
    onSuccess: (data: any) => { refetchContratos(); toast.success(`Contrato ${data.numeroContrato} criado!`); setShowContratoDialog(false); setForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateContrato = trpc.pj.contratos.update.useMutation({
    onSuccess: () => { refetchContratos(); toast.success("Contrato atualizado!"); },
  });
  const deleteContrato = trpc.pj.contratos.delete.useMutation({
    onSuccess: () => { refetchContratos(); toast.success("Contrato excluído!"); },
  });
  const gerarMensal = trpc.pj.pagamentos.gerarMensal.useMutation({
    onSuccess: (data: any) => { refetchPagamentos(); toast.success(`${data.contratosProcessados} contrato(s) processado(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });
  const createPagamento = trpc.pj.pagamentos.create.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Lançamento criado!"); setShowPagamentoDialog(false); setPagForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updatePagamento = trpc.pj.pagamentos.update.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Pagamento atualizado!"); },
  });
  const deletePagamento = trpc.pj.pagamentos.delete.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Lançamento excluído!"); },
  });

  // Employee search
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = pjEmployees.find((e: any) => e.id === form.employeeId);
  const filteredEmps = pjEmployees.filter((e: any) => {
    if (!empSearch) return true;
    const s = empSearch.toLowerCase();
    return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, ""));
  });

  // Filtered contratos
  const filtered = useMemo(() => {
    return (contratos as any[]).filter((c: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(c.employeeName || "").toLowerCase().includes(s) && !(c.cnpjPrestador || "").includes(s) && !(c.numeroContrato || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [contratos, search]);

  // Stats
  const stats = useMemo(() => {
    const list = contratos as any[];
    const totalValor = list.filter(c => c.status === "ativo").reduce((s, c) => s + parseFloat(c.valorMensal || "0"), 0);
    return {
      total: list.length,
      ativos: list.filter(c => c.status === "ativo").length,
      pendentes: list.filter(c => c.status === "pendente_assinatura").length,
      encerrados: list.filter(c => c.status === "encerrado").length,
      totalMensal: totalValor,
    };
  }, [contratos]);

  const handleSubmitContrato = () => {
    if (!form.employeeId || !form.dataInicio || !form.dataFim || !form.valorMensal) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    createContrato.mutate({
      companyId,
      employeeId: form.employeeId,
      cnpjPrestador: form.cnpjPrestador,
      razaoSocialPrestador: form.razaoSocialPrestador,
      objetoContrato: form.objetoContrato,
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      renovacaoAutomatica: form.renovacaoAutomatica || 0,
      valorMensal: form.valorMensal,
      percentualAdiantamento: form.percentualAdiantamento || 40,
      percentualFechamento: form.percentualFechamento || 60,
      diaAdiantamento: form.diaAdiantamento || 15,
      diaFechamento: form.diaFechamento || 5,
      observacoes: form.observacoes,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-purple-600" />
              Módulo PJ — Contratos e Pagamentos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de contratos PJ — Folha 40/60, bonificações e alertas de vencimento
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total Contratos</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-green-500" onClick={() => setStatusFilter("ativo")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Ativos</p>
              <p className="text-2xl font-bold text-green-600">{stats.ativos}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-amber-500" onClick={() => setStatusFilter("pendente_assinatura")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pendentes}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-gray-500" onClick={() => setStatusFilter("encerrado")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Encerrados</p>
              <p className="text-2xl font-bold text-gray-600">{stats.encerrados}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Custo Mensal PJ</p>
              <p className="text-2xl font-bold text-purple-600">{formatMoeda(stats.totalMensal)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {alertas && ((alertas.vencendo?.length || 0) > 0 || (alertas.vencidos?.length || 0) > 0 || (alertas.pjsSemContrato?.length || 0) > 0) && (
          <div className="space-y-2">
            {(alertas.vencidos?.length || 0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {alertas.vencidos.length} Contrato(s) Vencido(s) — Ação necessária
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.vencidos.map((v: any) => (
                    <p key={v.id} className="text-xs text-red-700">
                      <span className="font-medium">{v.employeeName}</span> — Venceu em {formatDate(v.dataFim)}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(alertas.vencendo?.length || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> {alertas.vencendo.length} Contrato(s) Vencendo nos Próximos 30 Dias
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.vencendo.map((v: any) => (
                    <p key={v.id} className="text-xs text-amber-700">
                      <span className="font-medium">{v.employeeName}</span> — Vence em {formatDate(v.dataFim)} — {formatMoeda(v.valorMensal)}/mês
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(alertas.pjsSemContrato?.length || 0) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> {alertas.pjsSemContrato.length} PJ(s) Sem Contrato Ativo
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.pjsSemContrato.map((v: any) => (
                    <p key={v.id} className="text-xs text-blue-700">
                      <span className="font-medium">{v.nome}</span> — {v.cargo}
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
            <TabsTrigger value="contratos"><FileSignature className="h-4 w-4 mr-1" /> Contratos</TabsTrigger>
            <TabsTrigger value="pagamentos"><DollarSign className="h-4 w-4 mr-1" /> Folha PJ</TabsTrigger>
          </TabsList>

          {/* Contratos */}
          <TabsContent value="contratos">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, CNPJ ou nº contrato..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente_assinatura">Pendente Assinatura</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => { setForm({}); setShowContratoDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Novo Contrato
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Nº Contrato</th>
                        <th className="p-3 text-left font-medium">Prestador</th>
                        <th className="p-3 text-left font-medium">CNPJ</th>
                        <th className="p-3 text-left font-medium">Vigência</th>
                        <th className="p-3 text-right font-medium">Valor Mensal</th>
                        <th className="p-3 text-center font-medium">Adiant./Fech.</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">Nenhum contrato encontrado</td></tr>
                      ) : filtered.map((c: any) => {
                        const st = STATUS_CONTRATO[c.status] || STATUS_CONTRATO.ativo;
                        return (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-mono text-xs font-semibold">{c.numeroContrato}</td>
                            <td className="p-3">
                              <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(c.employeeId)}>{c.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{c.razaoSocialPrestador || c.employeeCargo}</div>
                            </td>
                            <td className="p-3 text-xs font-mono">{formatCNPJ(c.cnpjPrestador)}</td>
                            <td className="p-3 text-xs">{formatDate(c.dataInicio)} — {formatDate(c.dataFim)}</td>
                            <td className="p-3 text-right font-bold">{formatMoeda(c.valorMensal)}</td>
                            <td className="p-3 text-center text-xs">
                              <span className="text-amber-600">{c.percentualAdiantamento || 40}%</span>
                              <span className="mx-1">/</span>
                              <span className="text-green-600">{c.percentualFechamento || 60}%</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedContrato(c); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {c.status === "pendente_assinatura" && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => { updateContrato.mutate({ id: c.id, status: "ativo" }); }}>
                                    Ativar
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir contrato?")) deleteContrato.mutate({ id: c.id }); }}>
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

          {/* Folha PJ (Pagamentos) */}
          <TabsContent value="pagamentos">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Mês Referência:</label>
                <Input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)} className="w-48" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => gerarMensal.mutate({ companyId, mesReferencia: mesRef })} disabled={gerarMensal.isPending}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${gerarMensal.isPending ? "animate-spin" : ""}`} /> Gerar Lançamentos
                </Button>
                <Button onClick={() => { setPagForm({ mesReferencia: mesRef }); setShowPagamentoDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Lançamento Manual
                </Button>
              </div>
            </div>

            {/* Resumo do mês */}
            {(pagamentos as any[]).length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-amber-600 uppercase font-semibold">Adiantamentos</p>
                    <p className="text-xl font-bold text-amber-700">
                      {formatMoeda((pagamentos as any[]).filter(p => p.tipo === "adiantamento").reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-green-600 uppercase font-semibold">Fechamentos</p>
                    <p className="text-xl font-bold text-green-700">
                      {formatMoeda((pagamentos as any[]).filter(p => p.tipo === "fechamento").reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-purple-600 uppercase font-semibold">Total Mês</p>
                    <p className="text-xl font-bold text-purple-700">
                      {formatMoeda((pagamentos as any[]).reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Prestador</th>
                        <th className="p-3 text-left font-medium">Tipo</th>
                        <th className="p-3 text-left font-medium">Descrição</th>
                        <th className="p-3 text-right font-medium">Valor</th>
                        <th className="p-3 text-left font-medium">Data Pagamento</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pagamentos as any[]).length === 0 ? (
                        <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">
                          Nenhum lançamento para {mesRef}. Clique em "Gerar Lançamentos" para criar automaticamente.
                        </td></tr>
                      ) : (pagamentos as any[]).map((p: any) => {
                        const st = STATUS_PAGAMENTO[p.status] || STATUS_PAGAMENTO.pendente;
                        return (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-medium">{p.employeeName}</td>
                            <td className="p-3">
                              <Badge variant={p.tipo === "adiantamento" ? "secondary" : p.tipo === "bonificacao" ? "default" : "outline"}>
                                {p.tipo === "adiantamento" ? "Adiantamento" : p.tipo === "bonificacao" ? "Bonificação" : "Fechamento"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs">{p.descricao || "-"}</td>
                            <td className="p-3 text-right font-bold">{formatMoeda(p.valor)}</td>
                            <td className="p-3 text-xs">{formatDate(p.dataPagamento)}</td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                {p.status === "pendente" && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => updatePagamento.mutate({ id: p.id, status: "pago", dataPagamento: new Date().toISOString().split("T")[0] })}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pagar
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir?")) deletePagamento.mutate({ id: p.id }); }}>
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
        </Tabs>

        {/* Detail Dialog */}
        {selectedContrato && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedContrato(null); }} title={`Contrato ${selectedContrato.numeroContrato}`} icon={<FileSignature className="h-5 w-5 text-white" />}>
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Prestador</p>
                  <p className="font-semibold text-lg">{selectedContrato.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{selectedContrato.razaoSocialPrestador}</p>
                  <p className="text-sm text-muted-foreground">{formatCNPJ(selectedContrato.cnpjPrestador)}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Status</p>
                  <p className="font-semibold text-lg">{STATUS_CONTRATO[selectedContrato.status]?.label}</p>
                  <p className="text-sm text-muted-foreground">Vigência: {formatDate(selectedContrato.dataInicio)} — {formatDate(selectedContrato.dataFim)}</p>
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-xs text-purple-600 uppercase font-semibold mb-2">Valores e Pagamento</p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-purple-700">{formatMoeda(selectedContrato.valorMensal)}</p>
                    <p className="text-xs text-muted-foreground">Valor Mensal</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">
                      {formatMoeda(parseFloat(selectedContrato.valorMensal || "0") * (selectedContrato.percentualAdiantamento || 40) / 100)}
                    </p>
                    <p className="text-xs text-muted-foreground">Adiantamento ({selectedContrato.percentualAdiantamento || 40}%) — Dia {selectedContrato.diaAdiantamento || 15}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-600">
                      {formatMoeda(parseFloat(selectedContrato.valorMensal || "0") * (selectedContrato.percentualFechamento || 60) / 100)}
                    </p>
                    <p className="text-xs text-muted-foreground">Fechamento ({selectedContrato.percentualFechamento || 60}%) — Dia {selectedContrato.diaFechamento || 5}</p>
                  </div>
                </div>
              </div>
              {selectedContrato.objetoContrato && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 uppercase font-semibold">Objeto do Contrato</p>
                  <p className="text-sm mt-1">{selectedContrato.objetoContrato}</p>
                </div>
              )}
              {selectedContrato.observacoes && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 uppercase font-semibold">Observações</p>
                  <p className="text-sm mt-1">{selectedContrato.observacoes}</p>
                </div>
              )}
            </div>
          </FullScreenDialog>
        )}

        {/* Create Contrato Dialog */}
        <FullScreenDialog open={showContratoDialog} onClose={() => { setShowContratoDialog(false); setForm({}); }} title="Novo Contrato PJ" icon={<FileSignature className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Prestador (Funcionário PJ) *</label>
                <div className="relative">
                  <div className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30" onClick={() => setEmpDropdownOpen(!empDropdownOpen)}>
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Digite nome ou CPF..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione um funcionário PJ..."}
                      </span>
                    )}
                    {form.employeeId && (
                      <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setForm({ ...form, employeeId: undefined }); setEmpSearch(""); }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {empDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                        {filteredEmps.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            {pjEmployees.length === 0 ? "Nenhum funcionário PJ cadastrado" : "Nenhum resultado"}
                          </div>
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

              <div>
                <label className="text-sm font-medium">CNPJ do Prestador</label>
                <Input value={form.cnpjPrestador || ""} onChange={e => setForm({ ...form, cnpjPrestador: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label className="text-sm font-medium">Razão Social do Prestador</label>
                <Input value={form.razaoSocialPrestador || ""} onChange={e => setForm({ ...form, razaoSocialPrestador: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Início *</label>
                <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Fim *</label>
                <Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Valor Mensal (R$) *</label>
                <Input type="number" step="0.01" value={form.valorMensal || ""} onChange={e => setForm({ ...form, valorMensal: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm font-medium">Renovação Automática</label>
                <Select value={String(form.renovacaoAutomatica || 0)} onValueChange={v => setForm({ ...form, renovacaoAutomatica: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Não</SelectItem>
                    <SelectItem value="1">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 bg-purple-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-purple-800 mb-3">Regra de Pagamento (Folha PJ)</p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium">% Adiantamento</label>
                    <Input type="number" value={form.percentualAdiantamento || 40} onChange={e => setForm({ ...form, percentualAdiantamento: parseInt(e.target.value) || 40 })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Dia Adiantamento</label>
                    <Input type="number" value={form.diaAdiantamento || 15} onChange={e => setForm({ ...form, diaAdiantamento: parseInt(e.target.value) || 15 })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">% Fechamento</label>
                    <Input type="number" value={form.percentualFechamento || 60} onChange={e => setForm({ ...form, percentualFechamento: parseInt(e.target.value) || 60 })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Dia Fechamento</label>
                    <Input type="number" value={form.diaFechamento || 5} onChange={e => setForm({ ...form, diaFechamento: parseInt(e.target.value) || 5 })} />
                  </div>
                </div>
                {form.valorMensal && (
                  <div className="mt-3 text-xs text-purple-700 flex gap-4">
                    <span>Adiantamento: <strong>{formatMoeda(parseFloat(form.valorMensal) * (form.percentualAdiantamento || 40) / 100)}</strong></span>
                    <span>Fechamento: <strong>{formatMoeda(parseFloat(form.valorMensal) * (form.percentualFechamento || 60) / 100)}</strong></span>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="text-sm font-medium">Objeto do Contrato</label>
                <Textarea value={form.objetoContrato || ""} onChange={e => setForm({ ...form, objetoContrato: e.target.value })} rows={2} placeholder="Descreva o objeto do contrato..." />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowContratoDialog(false); setForm({}); }}>Cancelar</Button>
              <Button onClick={handleSubmitContrato} disabled={createContrato.isPending}>
                {createContrato.isPending ? "Salvando..." : "Criar Contrato"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Create Pagamento Dialog */}
        <FullScreenDialog open={showPagamentoDialog} onClose={() => { setShowPagamentoDialog(false); setPagForm({}); }} title="Lançamento Manual PJ" icon={<DollarSign className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Contrato *</label>
                <Select value={String(pagForm.contractId || "")} onValueChange={v => {
                  const c = (contratos as any[]).find(c => c.id === parseInt(v));
                  setPagForm({ ...pagForm, contractId: parseInt(v), employeeId: c?.employeeId });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um contrato" /></SelectTrigger>
                  <SelectContent>
                    {(contratos as any[]).filter(c => c.status === "ativo").map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.numeroContrato} — {c.employeeName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Mês Referência *</label>
                <Input type="month" value={pagForm.mesReferencia || mesRef} onChange={e => setPagForm({ ...pagForm, mesReferencia: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo *</label>
                <Select value={pagForm.tipo || ""} onValueChange={v => setPagForm({ ...pagForm, tipo: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="fechamento">Fechamento</SelectItem>
                    <SelectItem value="bonificacao">Bonificação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Valor (R$) *</label>
                <Input type="number" step="0.01" value={pagForm.valor || ""} onChange={e => setPagForm({ ...pagForm, valor: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Descrição</label>
                <Input value={pagForm.descricao || ""} onChange={e => setPagForm({ ...pagForm, descricao: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowPagamentoDialog(false); setPagForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!pagForm.contractId || !pagForm.tipo || !pagForm.valor) { toast.error("Preencha os campos obrigatórios"); return; }
                createPagamento.mutate({ companyId, ...pagForm });
              }} disabled={createPagamento.isPending}>
                {createPagamento.isPending ? "Salvando..." : "Criar Lançamento"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
