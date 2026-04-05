import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertTriangle,
  DollarSign, Car, Calendar, FileCheck, Ban, ExternalLink
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d.split("-").reverse().join("/");
}

export default function Licenciamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<"pago" | "pendente">("pago");
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split("T")[0]);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const lic = trpc.frotas.listLicensing.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createLicensing.useMutation({
    onSuccess: () => { lic.refetch(); setDialogOpen(false); toast.success("Licenciamento registrado"); },
  });
  const updateMut = trpc.frotas.updateLicensing.useMutation({
    onSuccess: () => { lic.refetch(); setDialogOpen(false); toast.success("Licenciamento atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteLicensing.useMutation({
    onSuccess: () => { lic.refetch(); toast.success("Licenciamento excluído"); },
  });
  const batchMut = trpc.frotas.batchUpdateLicensingStatus.useMutation({
    onSuccess: (data) => {
      lic.refetch();
      setBatchDialogOpen(false);
      setSelectedIds([]);
      toast.success(`${data.updated} registro(s) atualizado(s)`);
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredData = useMemo(() => {
    const data = lic.data || [];
    if (filterStatus === "all") return data;
    return data.filter((r: any) => r.status === filterStatus);
  }, [lic.data, filterStatus]);

  const stats = useMemo(() => {
    const data = lic.data || [];
    const total = data.reduce((s: number, r: any) => s + parseFloat(r.valor || 0), 0);
    const pendente = data.filter((r: any) => r.status === "pendente");
    const totalPendente = pendente.reduce((s: number, r: any) => s + parseFloat(r.valor || 0), 0);
    const pago = data.filter((r: any) => r.status === "pago");
    const totalPago = pago.reduce((s: number, r: any) => s + parseFloat(r.valor || 0), 0);
    const comCRLV = data.filter((r: any) => r.crlv_digital_url);
    return { total, totalPendente, totalPago, qtdPendente: pendente.length, qtdPago: pago.length, qtdCRLV: comCRLV.length, qtd: data.length };
  }, [lic.data]);

  function openNew() {
    setEditing(null);
    setForm({ anoExercicio: new Date().getFullYear(), status: "pendente" });
    setDialogOpen(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      vehicleId: r.vehicle_id, anoExercicio: r.ano_exercicio, valor: r.valor,
      dataVencimento: r.data_vencimento, dataPagamento: r.data_pagamento,
      status: r.status, crlvDigitalUrl: r.crlv_digital_url, observacoes: r.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.anoExercicio) {
      toast.error("Preencha veículo e ano de exercício");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredData.length) setSelectedIds([]);
    else setSelectedIds(filteredData.map((r: any) => r.id));
  }

  function openBatchDialog(action: "pago" | "pendente") {
    setBatchAction(action);
    setBatchDate(new Date().toISOString().split("T")[0]);
    setBatchDialogOpen(true);
  }

  function executeBatch() {
    batchMut.mutate({
      companyId: cId,
      ids: selectedIds,
      status: batchAction,
      dataPagamento: batchAction === "pago" ? batchDate : undefined,
    });
  }

  const statusConfig: Record<string, { color: string; bg: string; icon: any }> = {
    pendente: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
    pago: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-full">
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] rounded-xl p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <div className="bg-white/20 rounded-lg p-2">
                  <FileText className="h-6 w-6" />
                </div>
                Licenciamento — Gestão Completa
              </h1>
              <p className="text-blue-100 mt-1 text-sm">Licenciamento anual e CRLV dos veículos</p>
            </div>
            <Button onClick={openNew} className="bg-white text-[#1e3a5f] hover:bg-blue-50 font-semibold shadow-lg">
              <Plus className="h-4 w-4 mr-2" /> Novo Licenciamento
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Geral</p>
                  <p className="text-xl font-bold mt-1">{fmt(stats.total)}</p>
                </div>
                <div className="bg-blue-50 rounded-full p-2.5"><DollarSign className="h-5 w-5 text-blue-600" /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{stats.qtd} veículo(s)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pendentes</p>
                  <p className="text-xl font-bold mt-1 text-amber-600">{fmt(stats.totalPendente)}</p>
                </div>
                <div className="bg-amber-50 rounded-full p-2.5"><AlertTriangle className="h-5 w-5 text-amber-500" /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{stats.qtdPendente} pendente(s)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pagos</p>
                  <p className="text-xl font-bold mt-1 text-emerald-600">{fmt(stats.totalPago)}</p>
                </div>
                <div className="bg-emerald-50 rounded-full p-2.5"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{stats.qtdPago} pago(s)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">CRLV Emitido</p>
                  <p className="text-xl font-bold mt-1 text-indigo-600">{stats.qtdCRLV}</p>
                </div>
                <div className="bg-indigo-50 rounded-full p-2.5"><FileCheck className="h-5 w-5 text-indigo-500" /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">de {stats.qtd} total</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={filterVehicle} onValueChange={v => { setFilterVehicle(v); setSelectedIds([]); }}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Veículos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setSelectedIds([]); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
            </SelectContent>
          </Select>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 ml-auto bg-blue-50 rounded-lg px-4 py-2 border border-blue-200">
              <span className="text-sm font-medium text-blue-700">{selectedIds.length} selecionado(s)</span>
              <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => openBatchDialog("pago")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Dar Baixa
              </Button>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 h-8" onClick={() => openBatchDialog("pendente")}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar Baixa
              </Button>
            </div>
          )}
        </div>

        {lic.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin h-8 w-8 border-3 border-[#1e3a5f] border-t-transparent rounded-full" />
          </div>
        ) : filteredData.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum licenciamento encontrado</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Clique em "Novo Licenciamento" para cadastrar</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b">
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={selectedIds.length === filteredData.length && filteredData.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left p-3 font-semibold text-slate-600">Veículo</th>
                    <th className="text-center p-3 font-semibold text-slate-600">Ano Ref.</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Valor</th>
                    <th className="text-center p-3 font-semibold text-slate-600">Vencimento</th>
                    <th className="text-center p-3 font-semibold text-slate-600">Pagamento</th>
                    <th className="text-center p-3 font-semibold text-slate-600">CRLV</th>
                    <th className="text-center p-3 font-semibold text-slate-600">Status</th>
                    <th className="text-right p-3 font-semibold text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((r: any) => {
                    const sc = statusConfig[r.status] || statusConfig.pendente;
                    const StatusIcon = sc.icon;
                    const isSelected = selectedIds.includes(r.id);
                    const isOverdue = r.status === "pendente" && r.data_vencimento && new Date(r.data_vencimento) < new Date();
                    return (
                      <tr
                        key={r.id}
                        className={`border-b hover:bg-blue-50/50 transition-colors cursor-pointer ${isSelected ? "bg-blue-50" : ""} ${isOverdue ? "bg-red-50/30" : ""}`}
                        onClick={() => toggleSelect(r.id)}
                      >
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(r.id)} />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="bg-slate-100 rounded-md p-1.5"><Car className="h-4 w-4 text-slate-500" /></div>
                            <div>
                              <p className="font-mono font-semibold text-sm">{r.placa || "—"}</p>
                              <p className="text-xs text-muted-foreground">{r.modelo} {r.marca}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="font-bold">{r.ano_exercicio}</Badge>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800">{fmt(r.valor)}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className={isOverdue ? "text-red-600 font-semibold" : ""}>{fmtDate(r.data_vencimento)}</span>
                            {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                          </div>
                        </td>
                        <td className="p-3 text-center">{fmtDate(r.data_pagamento)}</td>
                        <td className="p-3 text-center">
                          {r.crlv_digital_url ? (
                            <a href={r.crlv_digital_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                               className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-xs">
                              <FileCheck className="h-3.5 w-3.5" /> Emitido <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pendente</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${sc.bg} ${sc.color}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {r.status === "pago" ? "Pago" : "Pendente"}
                          </div>
                        </td>
                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: r.id, companyId: cId }); }}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#1e3a5f]" />
                {editing ? "Editar Licenciamento" : "Novo Licenciamento"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(vehicles.data || []).map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Ano Exercício *</Label><Input type="number" value={form.anoExercicio || ""} onChange={e => setForm({ ...form, anoExercicio: parseInt(e.target.value) })} /></div>
              <div><Label>Valor (R$)</Label><MoneyInput value={form.valor} onChange={v => setForm({ ...form, valor: v })} /></div>
              <div><Label>Vencimento</Label><Input type="date" value={form.dataVencimento || ""} onChange={e => setForm({ ...form, dataVencimento: e.target.value })} /></div>
              <div><Label>Data Pagamento</Label><Input type="date" value={form.dataPagamento || ""} onChange={e => setForm({ ...form, dataPagamento: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || "pendente"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>URL CRLV Digital</Label>
                <Input value={form.crlvDigitalUrl || ""} onChange={e => setForm({ ...form, crlvDigitalUrl: e.target.value })} placeholder="URL do CRLV digital" />
              </div>
              <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending} className="bg-[#1e3a5f] hover:bg-[#2c5282]">
                {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {batchAction === "pago" ? (
                  <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Dar Baixa em {selectedIds.length} Licenciamento(s)</>
                ) : (
                  <><XCircle className="h-5 w-5 text-amber-600" /> Cancelar Baixa de {selectedIds.length} Licenciamento(s)</>
                )}
              </DialogTitle>
            </DialogHeader>
            {batchAction === "pago" && (
              <div>
                <Label>Data do Pagamento</Label>
                <Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {batchAction === "pago"
                ? "Os registros selecionados serão marcados como PAGOS."
                : "Os registros selecionados voltarão para PENDENTE e a data de pagamento será removida."}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={executeBatch}
                disabled={batchMut.isPending}
                className={batchAction === "pago" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}
              >
                {batchMut.isPending ? "Processando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
