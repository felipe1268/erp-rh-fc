import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Plus, Search, Pencil, Trash2, HardHat, Package, AlertTriangle,
  ShieldCheck, Calendar, ArrowRight, ChevronLeft, User, ClipboardList
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

type ViewMode = "catalogo" | "entregas" | "novo_epi" | "nova_entrega";

export default function Epis() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;

  const [viewMode, setViewMode] = useState<ViewMode>("catalogo");
  const [search, setSearch] = useState("");
  const [editingEpi, setEditingEpi] = useState<any>(null);
  const [selectedEpis, setSelectedEpis] = useState<Set<number>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);

  // Queries
  const episQ = trpc.epis.list.useQuery({ companyId }, { enabled: !!companyId });
  const deliveriesQ = trpc.epis.listDeliveries.useQuery({ companyId }, { enabled: !!companyId });
  const statsQ = trpc.epis.stats.useQuery({ companyId }, { enabled: !!companyId });
  const employeesQ = trpc.employees.list.useQuery({ companyId, status: "Ativo" }, { enabled: !!companyId });

  const episList = episQ.data ?? [];
  const deliveriesList = deliveriesQ.data ?? [];
  const stats = statsQ.data;
  const employeesList = useMemo(() => (employeesQ.data ?? []).sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)), [employeesQ.data]);

  // Form state - EPI
  const [epiForm, setEpiForm] = useState({
    nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "", quantidadeEstoque: 0,
  });

  // Form state - Entrega
  const [entregaForm, setEntregaForm] = useState({
    epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0],
    motivo: "", observacoes: "",
  });

  // Mutations
  const createEpiMut = trpc.epis.create.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); setViewMode("catalogo"); toast.success("EPI cadastrado!"); resetEpiForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateEpiMut = trpc.epis.update.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); setEditingEpi(null); toast.success("EPI atualizado!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteEpiMut = trpc.epis.delete.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); toast.success("EPI removido!"); },
    onError: (err) => toast.error(err.message),
  });
  const createDeliveryMut = trpc.epis.createDelivery.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch(); setViewMode("entregas"); toast.success("Entrega registrada!"); resetEntregaForm(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteDeliveryMut = trpc.epis.deleteDelivery.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch(); toast.success("Entrega removida!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteBatchMut = trpc.epis.deleteBatch.useMutation({
    onSuccess: (data: any) => { episQ.refetch(); statsQ.refetch(); setSelectedEpis(new Set()); setShowBatchDeleteDialog(false); toast.success(`${data.deleted} EPI(s) removido(s)!`); },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleSelectEpi = (id: number) => {
    setSelectedEpis(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAllEpis = () => {
    if (selectedEpis.size === filteredEpis.length) {
      setSelectedEpis(new Set());
    } else {
      setSelectedEpis(new Set(filteredEpis.map((e: any) => e.id)));
    }
  };

  function resetEpiForm() {
    setEpiForm({ nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "", quantidadeEstoque: 0 });
  }
  function resetEntregaForm() {
    setEntregaForm({ epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0], motivo: "", observacoes: "" });
  }

  const hoje = new Date().toISOString().split("T")[0];

  // Filtered lists
  const filteredEpis = useMemo(() => {
    if (!search) return episList;
    const s = search.toLowerCase();
    return episList.filter((e: any) =>
      e.nome?.toLowerCase().includes(s) ||
      (e.ca || "").toLowerCase().includes(s) ||
      (e.fabricante || "").toLowerCase().includes(s)
    );
  }, [episList, search]);

  const filteredDeliveries = useMemo(() => {
    if (!search) return deliveriesList;
    const s = search.toLowerCase();
    return deliveriesList.filter((d: any) =>
      (d.nomeEpi || "").toLowerCase().includes(s) ||
      (d.nomeFunc || "").toLowerCase().includes(s)
    );
  }, [deliveriesList, search]);

  // ============================================================
  // FORM: NOVO EPI
  // ============================================================
  if (viewMode === "novo_epi") {
    return (
      <DashboardLayout>
      <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("catalogo")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Cadastrar Novo EPI</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              <div>
                <Label>Nome do EPI *</Label>
                <Input value={epiForm.nome} onChange={e => setEpiForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Capacete de Segurança, Luva de Proteção..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Número do CA</Label>
                  <Input value={epiForm.ca} onChange={e => setEpiForm(f => ({ ...f, ca: e.target.value }))}
                    placeholder="Ex: 12345" />
                </div>
                <div>
                  <Label>Validade do CA</Label>
                  <Input type="date" value={epiForm.validadeCa} onChange={e => setEpiForm(f => ({ ...f, validadeCa: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fabricante</Label>
                  <Input value={epiForm.fabricante} onChange={e => setEpiForm(f => ({ ...f, fabricante: e.target.value }))}
                    placeholder="Nome do fabricante" />
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <Input value={epiForm.fornecedor} onChange={e => setEpiForm(f => ({ ...f, fornecedor: e.target.value }))}
                    placeholder="Nome do fornecedor" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantidade em Estoque</Label>
                  <Input type="number" min={0} value={epiForm.quantidadeEstoque}
                    onChange={e => setEpiForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("catalogo"); resetEpiForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!epiForm.nome.trim()) return toast.error("Nome do EPI é obrigatório");
                  createEpiMut.mutate({ companyId, ...epiForm, validadeCa: epiForm.validadeCa || undefined, ca: epiForm.ca || undefined, fabricante: epiForm.fabricante || undefined, fornecedor: epiForm.fornecedor || undefined });
                }} disabled={createEpiMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {createEpiMut.isPending ? "Salvando..." : "Cadastrar EPI"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // FORM: NOVA ENTREGA
  // ============================================================
  if (viewMode === "nova_entrega") {
    return (
      <DashboardLayout>
      <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("entregas")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Registrar Entrega de EPI</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              <div>
                <Label>EPI *</Label>
                <Select value={entregaForm.epiId || undefined} onValueChange={v => setEntregaForm(f => ({ ...f, epiId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o EPI..." /></SelectTrigger>
                  <SelectContent>
                    {episList.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nome} {e.ca ? `(CA: ${e.ca})` : ""} — Estoque: {e.quantidadeEstoque ?? 0}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Funcionário *</Label>
                <Select value={entregaForm.employeeId || undefined} onValueChange={v => setEntregaForm(f => ({ ...f, employeeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o funcionário..." /></SelectTrigger>
                  <SelectContent>
                    {employeesList.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nomeCompleto} {e.funcao ? `— ${e.funcao}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantidade *</Label>
                  <Input type="number" min={1} value={entregaForm.quantidade}
                    onChange={e => setEntregaForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label>Data da Entrega *</Label>
                  <Input type="date" value={entregaForm.dataEntrega}
                    onChange={e => setEntregaForm(f => ({ ...f, dataEntrega: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Input value={entregaForm.motivo} onChange={e => setEntregaForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ex: Substituição, Novo funcionário, Desgaste..." />
              </div>
              <div>
                <Label>Observações</Label>
                <textarea value={entregaForm.observacoes} onChange={e => setEntregaForm(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[60px]" placeholder="Observações adicionais..." />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("entregas"); resetEntregaForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!entregaForm.epiId) return toast.error("Selecione o EPI");
                  if (!entregaForm.employeeId) return toast.error("Selecione o funcionário");
                  if (!entregaForm.dataEntrega) return toast.error("Informe a data de entrega");
                  createDeliveryMut.mutate({
                    companyId,
                    epiId: parseInt(entregaForm.epiId),
                    employeeId: parseInt(entregaForm.employeeId),
                    quantidade: entregaForm.quantidade,
                    dataEntrega: entregaForm.dataEntrega,
                    motivo: entregaForm.motivo || undefined,
                    observacoes: entregaForm.observacoes || undefined,
                  });
                }} disabled={createDeliveryMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {createDeliveryMut.isPending ? "Salvando..." : "Registrar Entrega"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // MAIN VIEW
  // ============================================================
  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Controle de EPIs</h1>
            <p className="text-muted-foreground text-sm">
              Gerenciamento de Equipamentos de Proteção Individual
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PrintActions title="Controle de EPIs" />
            {viewMode === "catalogo" ? (
              <Button onClick={() => setViewMode("novo_epi")} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Novo EPI
              </Button>
            ) : (
              <Button onClick={() => setViewMode("nova_entrega")} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Entrega
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground">Itens Cadastrados</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats?.totalItens ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">Estoque Total</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{stats?.estoqueTotal ?? 0}</p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${(stats?.estoqueBaixo ?? 0) > 0 ? "border-l-red-500" : "border-l-yellow-500"}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={`h-4 w-4 ${(stats?.estoqueBaixo ?? 0) > 0 ? "text-red-600" : "text-yellow-600"}`} />
                <span className="text-xs text-muted-foreground">Estoque Baixo (≤5)</span>
              </div>
              <p className={`text-2xl font-bold ${(stats?.estoqueBaixo ?? 0) > 0 ? "text-red-600" : "text-yellow-600"}`}>{stats?.estoqueBaixo ?? 0}</p>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${(stats?.caVencido ?? 0) > 0 ? "border-l-red-500" : "border-l-slate-400"}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className={`h-4 w-4 ${(stats?.caVencido ?? 0) > 0 ? "text-red-600" : "text-slate-500"}`} />
                <span className="text-xs text-muted-foreground">CA Vencido</span>
              </div>
              <p className={`text-2xl font-bold ${(stats?.caVencido ?? 0) > 0 ? "text-red-600" : "text-slate-500"}`}>{stats?.caVencido ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="h-4 w-4 text-indigo-600" />
                <span className="text-xs text-muted-foreground">Total Entregas</span>
              </div>
              <p className="text-2xl font-bold text-indigo-600">{stats?.totalEntregas ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-teal-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ArrowRight className="h-4 w-4 text-teal-600" />
                <span className="text-xs text-muted-foreground">Entregas (30d)</span>
              </div>
              <p className="text-2xl font-bold text-teal-600">{stats?.entregasMes ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => { setViewMode("catalogo"); setSearch(""); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${viewMode === "catalogo" ? "bg-[#1B2A4A] text-white" : "text-muted-foreground hover:bg-accent"}`}
          >
            <Package className="h-4 w-4 inline mr-2" />
            Catálogo de EPIs
          </button>
          <button
            onClick={() => { setViewMode("entregas"); setSearch(""); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${viewMode === "entregas" ? "bg-[#1B2A4A] text-white" : "text-muted-foreground hover:bg-accent"}`}
          >
            <ClipboardList className="h-4 w-4 inline mr-2" />
            Entregas
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={viewMode === "catalogo" ? "Buscar por nome, CA ou fabricante..." : "Buscar por EPI ou funcionário..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/* CATÁLOGO */}
        {/* ============================================================ */}
        {viewMode === "catalogo" && (
          filteredEpis.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhum EPI cadastrado</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Cadastre os EPIs utilizados pela empresa.
                </p>
                <Button onClick={() => setViewMode("novo_epi")} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Novo EPI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  {selectedEpis.size > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border-b border-red-200">
                      <span className="text-sm font-medium text-red-800">{selectedEpis.size} selecionado(s)</span>
                      <Button size="sm" variant="destructive" onClick={() => setShowBatchDeleteDialog(true)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir Selecionados
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedEpis(new Set())} className="text-xs">
                        Limpar seleção
                      </Button>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-center w-10">
                          <input type="checkbox" checked={filteredEpis.length > 0 && selectedEpis.size === filteredEpis.length} onChange={toggleSelectAllEpis} className="rounded" />
                        </th>
                        <th className="p-3 text-left font-medium">Nome do EPI</th>
                        <th className="p-3 text-left font-medium">CA</th>
                        <th className="p-3 text-left font-medium">Validade CA</th>
                        <th className="p-3 text-left font-medium">Fabricante</th>
                        <th className="p-3 text-center font-medium">Estoque</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEpis.map((epi: any) => {
                        const caVencido = epi.validadeCa && epi.validadeCa < hoje;
                        const estoqueBaixo = (epi.quantidadeEstoque ?? 0) <= 5;
                        return (
                          <tr key={epi.id} className={`border-b last:border-0 hover:bg-muted/30 ${selectedEpis.has(epi.id) ? "bg-red-50" : ""}`}>
                            <td className="p-3 text-center">
                              <input type="checkbox" checked={selectedEpis.has(epi.id)} onChange={() => toggleSelectEpi(epi.id)} className="rounded" />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <HardHat className="h-4 w-4 text-amber-600" />
                                <span className="font-medium">{epi.nome}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono">{epi.ca || "—"}</td>
                            <td className="p-3">
                              {epi.validadeCa ? (
                                <span className={caVencido ? "text-red-600 font-semibold" : ""}>
                                  {new Date(epi.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                                  {caVencido && <Badge variant="destructive" className="ml-2 text-[10px]">Vencido</Badge>}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-3">{epi.fabricante || "—"}</td>
                            <td className="p-3 text-center">
                              <span className={`font-bold ${estoqueBaixo ? "text-red-600" : "text-green-600"}`}>
                                {epi.quantidadeEstoque ?? 0}
                              </span>
                              {estoqueBaixo && <Badge variant="outline" className="ml-1 text-[10px] text-red-600 border-red-300">Baixo</Badge>}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {editingEpi?.id === epi.id ? (
                                  <EditEpiInline
                                    epi={editingEpi}
                                    onSave={(data: any) => {
                                      updateEpiMut.mutate({ id: epi.id, ...data });
                                    }}
                                    onCancel={() => setEditingEpi(null)}
                                    isPending={updateEpiMut.isPending}
                                  />
                                ) : (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingEpi({ ...epi })}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                                      if (confirm(`Remover EPI "${epi.nome}"?`)) deleteEpiMut.mutate({ id: epi.id });
                                    }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {filteredEpis.length} EPI{filteredEpis.length !== 1 ? "s" : ""} encontrado{filteredEpis.length !== 1 ? "s" : ""}
                </div>

                {/* Batch Delete Dialog */}
                {showBatchDeleteDialog && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBatchDeleteDialog(false)}>
                    <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-bold text-red-700 mb-2">Confirmar Exclusão em Lote</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Tem certeza que deseja excluir <strong>{selectedEpis.size}</strong> EPI(s)? Esta ação não pode ser desfeita.
                      </p>
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowBatchDeleteDialog(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => deleteBatchMut.mutate({ ids: Array.from(selectedEpis) })} disabled={deleteBatchMut.isPending}>
                          {deleteBatchMut.isPending ? "Excluindo..." : `Excluir ${selectedEpis.size} EPI(s)`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )}

        {/* ============================================================ */}
        {/* ENTREGAS */}
        {/* ============================================================ */}
        {viewMode === "entregas" && (
          filteredDeliveries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhuma entrega registrada</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Registre as entregas de EPIs aos funcionários.
                </p>
                <Button onClick={() => setViewMode("nova_entrega")} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Nova Entrega
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left font-medium">Data</th>
                        <th className="p-3 text-left font-medium">Funcionário</th>
                        <th className="p-3 text-left font-medium">EPI</th>
                        <th className="p-3 text-center font-medium">Qtd</th>
                        <th className="p-3 text-left font-medium">Motivo</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliveries.map((d: any) => (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 text-xs">
                            {d.dataEntrega ? new Date(d.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-blue-600" />
                              <div>
                                <span className="font-medium text-xs">{d.nomeFunc || "—"}</span>
                                {d.funcaoFunc && <span className="text-[10px] text-muted-foreground ml-1">({d.funcaoFunc})</span>}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <HardHat className="h-3.5 w-3.5 text-amber-600" />
                              <span className="text-xs">{d.nomeEpi || "—"}</span>
                              {d.caEpi && <Badge variant="outline" className="text-[10px]">CA: {d.caEpi}</Badge>}
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold">{d.quantidade}</td>
                          <td className="p-3 text-xs text-muted-foreground">{d.motivo || "—"}</td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                              if (confirm("Remover esta entrega? O estoque será devolvido.")) {
                                deleteDeliveryMut.mutate({ id: d.id, epiId: d.epiId, quantidade: d.quantidade });
                              }
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {filteredDeliveries.length} entrega{filteredDeliveries.length !== 1 ? "s" : ""} encontrada{filteredDeliveries.length !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// Inline Edit Component
// ============================================================
function EditEpiInline({ epi, onSave, onCancel, isPending }: { epi: any; onSave: (data: any) => void; onCancel: () => void; isPending: boolean }) {
  const [form, setForm] = useState({
    nome: epi.nome || "",
    ca: epi.ca || "",
    validadeCa: epi.validadeCa || "",
    fabricante: epi.fabricante || "",
    fornecedor: epi.fornecedor || "",
    quantidadeEstoque: epi.quantidadeEstoque ?? 0,
  });

  return (
    <div className="flex items-center gap-2">
      <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="h-7 text-xs w-32" placeholder="Nome" />
      <Input value={form.ca} onChange={e => setForm(f => ({ ...f, ca: e.target.value }))} className="h-7 text-xs w-20" placeholder="CA" />
      <Input type="number" value={form.quantidadeEstoque} onChange={e => setForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} className="h-7 text-xs w-16" />
      <Button size="sm" className="h-7 text-xs" onClick={() => onSave(form)} disabled={isPending}>
        {isPending ? "..." : "Salvar"}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>✕</Button>
    </div>
  );
}
