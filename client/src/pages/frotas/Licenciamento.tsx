import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Licenciamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");

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
      toast.error("Preencha veículo e ano de referência");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" /> Licenciamento
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Licenciamento</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {lic.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : (lic.data || []).length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum licenciamento registrado</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Ano Ref.</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-left p-3">Vencimento</th>
                  <th className="text-left p-3">Pagamento</th>
                  <th className="text-left p-3">CRLV Emitido</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(lic.data || []).map((r: any) => (
                  <tr key={r.id} className={`border-t hover:bg-muted/30 ${r.status === "pendente" ? "bg-indigo-50/50" : ""}`}>
                    <td className="p-3 font-mono">{r.placa || "—"} <span className="text-muted-foreground">{r.modelo}</span></td>
                    <td className="p-3 font-semibold">{r.ano_exercicio}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.valor)}</td>
                    <td className="p-3">{r.data_vencimento || "—"}</td>
                    <td className="p-3">{r.data_pagamento || "—"}</td>
                    <td className="p-3">{r.crlv_digital_url ? <Badge>Sim</Badge> : <Badge variant="outline">Não</Badge>}</td>
                    <td className="p-3">
                      <Badge variant={r.status === "pago" ? "default" : r.status === "pendente" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: r.id, companyId: cId }); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Licenciamento" : "Novo Licenciamento"}</DialogTitle></DialogHeader>
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
              <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.valor || ""} onChange={e => setForm({ ...form, valor: e.target.value })} /></div>
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
              <div>
                <Label>URL CRLV Digital</Label>
                <Input value={form.crlvDigitalUrl || ""} onChange={e => setForm({ ...form, crlvDigitalUrl: e.target.value })} placeholder="URL do CRLV digital" />
              </div>
              <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
