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
import { Fuel, Plus, Pencil, Trash2, Upload, Search } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const COMBUSTIVEIS = ["Gasolina", "Etanol", "Diesel", "Diesel S10", "GNV", "Flex"];

export default function Combustivel() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const fuel = trpc.frotas.listFuelRecords.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createFuelRecord.useMutation({
    onSuccess: () => { fuel.refetch(); setDialogOpen(false); toast.success("Abastecimento registrado"); },
  });
  const updateMut = trpc.frotas.updateFuelRecord.useMutation({
    onSuccess: () => { fuel.refetch(); setDialogOpen(false); toast.success("Registro atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteFuelRecord.useMutation({
    onSuccess: () => { fuel.refetch(); toast.success("Registro excluído"); },
  });
  const importMut = trpc.frotas.importFuelCsv.useMutation({
    onSuccess: (data) => { fuel.refetch(); toast.success(`${data.imported} registros importados`); },
    onError: (err) => toast.error(err.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ data: new Date().toISOString().slice(0, 10), tipoCombustivel: "Diesel" });
    setDialogOpen(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      vehicleId: r.vehicle_id, data: r.data, tipoCombustivel: r.tipo_combustivel,
      litros: r.litros, precoLitro: r.preco_litro, valorTotal: r.valor_total,
      kmAtual: r.km_atual, posto: r.posto, motorista: r.motorista, observacoes: r.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.data || !form.litros) {
      toast.error("Preencha veículo, data e litros");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importMut.mutate({ companyId: cId, csvContent: ev.target?.result as string, criadoPor: user?.name || "" });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const list = (fuel.data || []).filter((r: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (r.placa || "").toLowerCase().includes(s) ||
      (r.posto || "").toLowerCase().includes(s) ||
      (r.motorista || "").toLowerCase().includes(s)
    );
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fuel className="h-6 w-6 text-amber-600" /> Combustível
          </h1>
          <div className="flex gap-2">
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleCsv} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importMut.isPending}>
              <Upload className="h-4 w-4 mr-1" /> {importMut.isPending ? "Importando..." : "Importar CSV"}
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Abastecimento</Button>
          </div>
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

        <div className="text-xs text-muted-foreground">
          CSV: vehicleId, data (YYYY-MM-DD), tipo_combustivel, litros, valor_litro, valor_total, km_atual, posto, motorista
        </div>

        {fuel.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-amber-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum abastecimento registrado</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Combustível</th>
                  <th className="text-right p-3">Litros</th>
                  <th className="text-right p-3">R$/L</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-right p-3">KM</th>
                  <th className="text-left p-3">Posto</th>
                  <th className="text-left p-3">Motorista</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{r.data}</td>
                    <td className="p-3 font-mono">{r.placa || "—"}</td>
                    <td className="p-3"><Badge variant="outline">{r.tipo_combustivel}</Badge></td>
                    <td className="p-3 text-right">{parseFloat(r.litros || 0).toFixed(2)}</td>
                    <td className="p-3 text-right">{r.preco_litro ? `R$ ${parseFloat(r.preco_litro).toFixed(3)}` : "—"}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.valor_total)}</td>
                    <td className="p-3 text-right">{r.km_atual ? parseFloat(r.km_atual).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-3">{r.posto || "—"}</td>
                    <td className="p-3">{r.motorista || "—"}</td>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Abastecimento" : "Novo Abastecimento"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(vehicles.data || []).map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} - {v.marca}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data *</Label><Input type="date" value={form.data || ""} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
              <div>
                <Label>Tipo Combustível</Label>
                <Select value={form.tipoCombustivel || "Diesel"} onValueChange={v => setForm({ ...form, tipoCombustivel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMBUSTIVEIS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Litros *</Label><Input type="number" step="0.01" value={form.litros || ""} onChange={e => setForm({ ...form, litros: e.target.value })} /></div>
              <div><Label>Valor por Litro (R$)</Label><Input type="number" step="0.001" value={form.precoLitro || ""} onChange={e => setForm({ ...form, precoLitro: e.target.value })} /></div>
              <div><Label>Valor Total (R$)</Label><Input type="number" step="0.01" value={form.valorTotal || ""} onChange={e => setForm({ ...form, valorTotal: e.target.value })} /></div>
              <div><Label>KM Atual</Label><Input type="number" value={form.kmAtual || ""} onChange={e => setForm({ ...form, kmAtual: e.target.value })} /></div>
              <div><Label>Posto</Label><Input value={form.posto || ""} onChange={e => setForm({ ...form, posto: e.target.value })} /></div>
              <div><Label>Motorista</Label><Input value={form.motorista || ""} onChange={e => setForm({ ...form, motorista: e.target.value })} /></div>
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
