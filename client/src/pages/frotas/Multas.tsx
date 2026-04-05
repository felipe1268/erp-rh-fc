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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const GRAVIDADES = ["leve", "media", "grave", "gravissima"];
const STATUS_MULTA = ["pendente", "paga", "recorrida", "cancelada"];

export default function Multas() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [search, setSearch] = useState("");

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const fines = trpc.frotas.listFines.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createFine.useMutation({
    onSuccess: () => { fines.refetch(); setDialogOpen(false); toast.success("Multa registrada"); },
  });
  const updateMut = trpc.frotas.updateFine.useMutation({
    onSuccess: () => { fines.refetch(); setDialogOpen(false); toast.success("Multa atualizada"); },
  });
  const deleteMut = trpc.frotas.deleteFine.useMutation({
    onSuccess: () => { fines.refetch(); toast.success("Multa excluída"); },
  });

  function openNew() {
    setEditing(null);
    setForm({ dataInfracao: new Date().toISOString().slice(0, 10), gravidade: "media", status: "pendente" });
    setDialogOpen(true);
  }

  function openEdit(f: any) {
    setEditing(f);
    setForm({
      vehicleId: f.vehicle_id, dataInfracao: f.data_infracao, autoInfracao: f.auto_infracao,
      descricao: f.descricao, gravidade: f.gravidade, pontos: f.pontos, valorOriginal: f.valor_original,
      valorComDesconto: f.valor_com_desconto, dataVencimento: f.data_vencimento,
      status: f.status, motorista: f.motorista,
      local: f.local, observacoes: f.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.descricao) {
      toast.error("Preencha veículo e descrição");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  const list = (fines.data || []).filter((f: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (f.descricao || "").toLowerCase().includes(s) ||
      (f.placa || "").toLowerCase().includes(s) ||
      (f.auto_infracao || "").toLowerCase().includes(s) ||
      (f.motorista || "").toLowerCase().includes(s)
    );
  });

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-600" /> Multas de Trânsito
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Multa</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
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

        {fines.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-red-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma multa registrada</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Auto Infração</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Gravidade</th>
                  <th className="text-right p-3">Pontos</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-left p-3">Vencimento</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Motorista</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f: any) => (
                  <tr key={f.id} className={`border-t hover:bg-muted/30 ${f.status === "pendente" ? "bg-red-50/50" : ""}`}>
                    <td className="p-3">{f.data_infracao ? f.data_infracao.split('-').reverse().join('/') : "—"}</td>
                    <td className="p-3 font-mono">{f.placa || "—"}</td>
                    <td className="p-3">{f.auto_infracao || "—"}</td>
                    <td className="p-3 max-w-[200px] truncate">{f.descricao}</td>
                    <td className="p-3">
                      <Badge variant={f.gravidade === "Gravíssima" ? "destructive" : f.gravidade === "Grave" ? "destructive" : "outline"}>
                        {f.gravidade}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">{f.pontos || "—"}</td>
                    <td className="p-3 text-right font-medium">{fmt(f.valor_original)}</td>
                    <td className="p-3">{f.data_vencimento ? f.data_vencimento.split('-').reverse().join('/') : "—"}</td>
                    <td className="p-3">
                      <Badge variant={f.status === "paga" ? "default" : f.status === "pendente" ? "destructive" : "secondary"}>
                        {f.status}
                      </Badge>
                    </td>
                    <td className="p-3">{f.motorista || "—"}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: f.id, companyId: cId }); }}>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Multa" : "Nova Multa"}</DialogTitle></DialogHeader>
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
              <div><Label>Data da Infração</Label><Input type="date" value={form.dataInfracao || ""} onChange={e => setForm({ ...form, dataInfracao: e.target.value })} /></div>
              <div><Label>Auto de Infração</Label><Input value={form.autoInfracao || ""} onChange={e => setForm({ ...form, autoInfracao: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Descrição *</Label><Input value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
              <div>
                <Label>Gravidade</Label>
                <Select value={form.gravidade || "Média"} onValueChange={v => setForm({ ...form, gravidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GRAVIDADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Pontos</Label><Input type="number" value={form.pontos || ""} onChange={e => setForm({ ...form, pontos: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Valor (R$)</Label><MoneyInput value={form.valorOriginal} onChange={v => setForm({ ...form, valorOriginal: v })} /></div>
              <div><Label>Valor com Desconto</Label><MoneyInput value={form.valorComDesconto} onChange={v => setForm({ ...form, valorComDesconto: v })} /></div>
              <div><Label>Vencimento</Label><Input type="date" value={form.dataVencimento || ""} onChange={e => setForm({ ...form, dataVencimento: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || "pendente"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_MULTA.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Motorista</Label><Input value={form.motorista || ""} onChange={e => setForm({ ...form, motorista: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Local da Infração</Label><Input value={form.local || ""} onChange={e => setForm({ ...form, local: e.target.value })} /></div>
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
