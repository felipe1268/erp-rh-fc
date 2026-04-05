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
import { Wrench, Plus, Pencil, Trash2, AlertTriangle, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  realizada: { label: "Realizada", variant: "default" },
  agendada: { label: "Agendada", variant: "outline" },
  em_andamento: { label: "Em Andamento", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

export default function Manutencoes() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [search, setSearch] = useState("");

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const manut = trpc.frotas.listMaintenances.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createMaintenance.useMutation({
    onSuccess: () => { manut.refetch(); setDialogOpen(false); toast.success("Manutenção registrada"); },
  });
  const updateMut = trpc.frotas.updateMaintenance.useMutation({
    onSuccess: () => { manut.refetch(); setDialogOpen(false); toast.success("Manutenção atualizada"); },
  });
  const deleteMut = trpc.frotas.deleteMaintenance.useMutation({
    onSuccess: () => { manut.refetch(); toast.success("Manutenção excluída"); },
  });

  function openNew() {
    setEditing(null);
    setForm({ tipo: "corretiva", status: "realizada", dataManutencao: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  }

  function openEdit(m: any) {
    setEditing(m);
    setForm({
      vehicleId: m.vehicle_id, tipo: m.tipo, descricao: m.descricao, custo: m.custo,
      kmNaManutencao: m.km_na_manutencao, fornecedor: m.fornecedor,
      dataManutencao: m.data_manutencao, dataProxima: m.data_proxima,
      kmProxima: m.km_proxima, status: m.status, observacoes: m.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.descricao || !form.dataManutencao) {
      toast.error("Preencha veículo, descrição e data");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  const list = (manut.data || []).filter((m: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (m.descricao || "").toLowerCase().includes(s) ||
      (m.placa || "").toLowerCase().includes(s) ||
      (m.fornecedor || "").toLowerCase().includes(s)
    );
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-orange-600" /> Manutenções
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Manutenção</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os veículos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} - {v.marca}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {manut.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-orange-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma manutenção registrada</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Custo</th>
                  <th className="text-left p-3">KM</th>
                  <th className="text-left p-3">Fornecedor</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Próxima</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m: any) => {
                  const atrasada = m.status === "agendada" && m.data_proxima && m.data_proxima < today;
                  return (
                    <tr key={m.id} className={`border-t hover:bg-muted/30 ${atrasada ? "bg-red-50" : ""}`}>
                      <td className="p-3">{m.data_manutencao ? m.data_manutencao.split('-').reverse().join('/') : "—"}</td>
                      <td className="p-3 font-mono">{m.placa || "—"} <span className="text-muted-foreground">{m.modelo}</span></td>
                      <td className="p-3"><Badge variant={m.tipo === "preventiva" ? "outline" : "secondary"}>{m.tipo}</Badge></td>
                      <td className="p-3 max-w-[200px] truncate">{m.descricao}</td>
                      <td className="p-3">{fmt(m.custo)}</td>
                      <td className="p-3">{m.km_na_manutencao ? parseFloat(m.km_na_manutencao).toLocaleString("pt-BR") : "—"}</td>
                      <td className="p-3">{m.fornecedor || "—"}</td>
                      <td className="p-3">
                        <Badge variant={STATUS_MAP[m.status]?.variant || "secondary"}>
                          {atrasada && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {STATUS_MAP[m.status]?.label || m.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">{m.data_proxima ? m.data_proxima.split('-').reverse().join('/') : "—"}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: m.id, companyId: cId }); }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto p-0">
            <div className="sticky top-0 z-10 bg-background border-b px-6 py-4 flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">{editing ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>

            <div className="px-6 py-4 max-w-5xl mx-auto w-full space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dados da Manutenção</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Veículo *</Label>
                    <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(vehicles.data || []).map((v: any) => (
                          <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} - {v.marca}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <Select value={form.tipo || "corretiva"} onValueChange={v => setForm({ ...form, tipo: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preventiva">Preventiva</SelectItem>
                        <SelectItem value="corretiva">Corretiva</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Data *</Label>
                    <Input className="h-9" type="date" value={form.dataManutencao || ""} onChange={e => setForm({ ...form, dataManutencao: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Custo (R$)</Label>
                    <Input className="h-9" type="number" step="0.01" value={form.custo || ""} onChange={e => setForm({ ...form, custo: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="col-span-full">
                  <Label className="text-xs text-muted-foreground">Descrição *</Label>
                  <Input className="h-9" value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })} />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Detalhes</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">KM na Manutenção</Label>
                    <Input className="h-9" type="number" value={form.kmNaManutencao || ""} onChange={e => setForm({ ...form, kmNaManutencao: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fornecedor</Label>
                    <Input className="h-9" value={form.fornecedor || ""} onChange={e => setForm({ ...form, fornecedor: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={form.status || "realizada"} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realizada">Realizada</SelectItem>
                        <SelectItem value="agendada">Agendada</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Próxima Manutenção</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Próxima Manutenção</Label>
                    <Input className="h-9" type="date" value={form.dataProxima || ""} onChange={e => setForm({ ...form, dataProxima: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">KM Próxima</Label>
                    <Input className="h-9" type="number" value={form.kmProxima || ""} onChange={e => setForm({ ...form, kmProxima: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-xs text-muted-foreground">Observações</Label>
                <Textarea className="mt-1" rows={3} value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
