import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Car, Plus, Search, Pencil, Trash2, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const TIPOS = ["Caminhonete", "Caminhão", "Carro", "Van", "Moto", "Ônibus", "Máquina", "Outros"];
const STATUS = ["Ativo", "Em Manutenção", "Inativo", "Vendido"];

function fmt(v: any) {
  const n = parseFloat(v || "0");
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Veiculos() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const vehicles = trpc.frotas.listVehicles.useQuery(
    { companyId: cId, tipo: filterTipo !== "all" ? filterTipo : undefined, status: filterStatus !== "all" ? filterStatus : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createVehicle.useMutation({
    onSuccess: () => { vehicles.refetch(); setDialogOpen(false); toast.success("Veículo cadastrado"); },
  });
  const updateMut = trpc.frotas.updateVehicle.useMutation({
    onSuccess: () => { vehicles.refetch(); setDialogOpen(false); toast.success("Veículo atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteVehicle.useMutation({
    onSuccess: () => { vehicles.refetch(); toast.success("Veículo inativado"); },
  });

  const fipeTipo = form.tipoVeiculo === "Caminhão" ? "caminhoes" : form.tipoVeiculo === "Moto" ? "motos" : "carros";
  const fipeMarcas = trpc.frotas.fipeMarcas.useQuery({ tipo: fipeTipo }, { enabled: dialogOpen });
  const fipeModelos = trpc.frotas.fipeModelos.useQuery(
    { tipo: fipeTipo, marcaCodigo: form.fipeCodigoMarca || "" },
    { enabled: !!form.fipeCodigoMarca && dialogOpen },
  );
  const fipeAnos = trpc.frotas.fipeAnos.useQuery(
    { tipo: fipeTipo, marcaCodigo: form.fipeCodigoMarca || "", modeloCodigo: form.fipeCodigoModelo || "" },
    { enabled: !!form.fipeCodigoModelo && dialogOpen },
  );
  const fipeValor = trpc.frotas.fipeValor.useQuery(
    { tipo: fipeTipo, marcaCodigo: form.fipeCodigoMarca || "", modeloCodigo: form.fipeCodigoModelo || "", anoCodigo: form.fipeCodigoAno || "" },
    { enabled: !!form.fipeCodigoAno && dialogOpen },
  );

  function openNew() {
    setEditing(null);
    setForm({ tipoVeiculo: "Carro", statusVeiculo: "Ativo" });
    setDialogOpen(true);
  }

  function openEdit(v: any) {
    setEditing(v);
    setForm({
      tipoVeiculo: v.tipoVeiculo, placa: v.placa, modelo: v.modelo, marca: v.marca,
      anoFabricacao: v.anoFabricacao, anoModelo: v.ano_modelo, renavam: v.renavam, chassi: v.chassi,
      cor: v.cor, kmAtual: v.km_atual, responsavel: v.responsavel,
      statusVeiculo: v.statusVeiculo, dataAquisicao: v.data_aquisicao,
      valorCompra: v.valor_compra, valorFipe: v.valor_fipe,
      fipeCodigoMarca: v.fipe_codigo_marca, fipeCodigoModelo: v.fipe_codigo_modelo,
      fipeCodigoAno: v.fipe_codigo_ano, depreciacaoAnos: v.depreciacao_anos || 5,
      crlvVencimento: v.crlv_vencimento, seguroVencimento: v.seguro_vencimento,
      observacoes: v.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.modelo || !form.tipoVeiculo) {
      toast.error("Preencha modelo e tipo");
      return;
    }
    const fipeVal = fipeValor.data?.Valor
      ? fipeValor.data.Valor.replace(/[R$\s.]/g, "").replace(",", ".")
      : form.valorFipe;
    const payload = { ...form, companyId: cId, valorFipe: fipeVal || form.valorFipe };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const list = (vehicles.data || []).filter((v: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (v.placa || "").toLowerCase().includes(s) ||
      (v.modelo || "").toLowerCase().includes(s) ||
      (v.marca || "").toLowerCase().includes(s) ||
      (v.responsavel || "").toLowerCase().includes(s)
    );
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="h-6 w-6 text-cyan-600" /> Veículos
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Veículo</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por placa, modelo, marca..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {vehicles.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-cyan-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum veículo encontrado</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Placa</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Marca / Modelo</th>
                  <th className="text-left p-3">Ano</th>
                  <th className="text-left p-3">KM</th>
                  <th className="text-left p-3">Valor Compra</th>
                  <th className="text-left p-3">Valor FIPE</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Responsável</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v: any) => (
                  <tr key={v.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono font-semibold">{v.placa || "—"}</td>
                    <td className="p-3">{v.tipoVeiculo}</td>
                    <td className="p-3">{[v.marca, v.modelo].filter(Boolean).join(" ")}</td>
                    <td className="p-3">{v.anoFabricacao || "—"}</td>
                    <td className="p-3">{v.km_atual ? parseFloat(v.km_atual).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-3">{v.valor_compra ? fmt(v.valor_compra) : "—"}</td>
                    <td className="p-3 text-green-600 font-medium">{v.valor_fipe ? fmt(v.valor_fipe) : "—"}</td>
                    <td className="p-3">
                      <Badge variant={v.statusVeiculo === "Ativo" ? "default" : "secondary"}>{v.statusVeiculo}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{v.responsavel || v.motorista_nome || "—"}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Inativar este veículo?")) deleteMut.mutate({ id: v.id, companyId: cId }); }}>
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
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Veículo" : "Novo Veículo"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipoVeiculo || ""} onValueChange={v => setForm({ ...form, tipoVeiculo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Placa</Label><Input value={form.placa || ""} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} maxLength={10} /></div>
              <div><Label>Modelo *</Label><Input value={form.modelo || ""} onChange={e => setForm({ ...form, modelo: e.target.value })} /></div>
              <div><Label>Marca</Label><Input value={form.marca || ""} onChange={e => setForm({ ...form, marca: e.target.value })} /></div>
              <div><Label>Ano Fabricação</Label><Input value={form.anoFabricacao || ""} onChange={e => setForm({ ...form, anoFabricacao: e.target.value })} maxLength={4} /></div>
              <div><Label>Ano Modelo</Label><Input value={form.anoModelo || ""} onChange={e => setForm({ ...form, anoModelo: e.target.value })} maxLength={4} /></div>
              <div><Label>Cor</Label><Input value={form.cor || ""} onChange={e => setForm({ ...form, cor: e.target.value })} /></div>
              <div><Label>KM Atual</Label><Input type="number" value={form.kmAtual || ""} onChange={e => setForm({ ...form, kmAtual: e.target.value })} /></div>
              <div><Label>RENAVAM</Label><Input value={form.renavam || ""} onChange={e => setForm({ ...form, renavam: e.target.value })} /></div>
              <div><Label>Chassi</Label><Input value={form.chassi || ""} onChange={e => setForm({ ...form, chassi: e.target.value })} /></div>
              <div><Label>Responsável</Label><Input value={form.responsavel || ""} onChange={e => setForm({ ...form, responsavel: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.statusVeiculo || "Ativo"} onValueChange={v => setForm({ ...form, statusVeiculo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data Aquisição</Label><Input type="date" value={form.dataAquisicao || ""} onChange={e => setForm({ ...form, dataAquisicao: e.target.value })} /></div>
              <div><Label>Valor de Compra (R$)</Label><Input type="number" step="0.01" value={form.valorCompra || ""} onChange={e => setForm({ ...form, valorCompra: e.target.value })} /></div>
              <div><Label>Depreciação (anos)</Label><Input type="number" value={form.depreciacaoAnos || 5} onChange={e => setForm({ ...form, depreciacaoAnos: parseInt(e.target.value) || 5 })} /></div>
              <div><Label>Vencimento CRLV</Label><Input type="date" value={form.crlvVencimento || ""} onChange={e => setForm({ ...form, crlvVencimento: e.target.value })} /></div>
              <div><Label>Vencimento Seguro</Label><Input type="date" value={form.seguroVencimento || ""} onChange={e => setForm({ ...form, seguroVencimento: e.target.value })} /></div>
            </div>

            <Card className="mt-4">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" /> Consulta FIPE</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Marca FIPE</Label>
                    <Select value={form.fipeCodigoMarca || ""} onValueChange={v => setForm({ ...form, fipeCodigoMarca: v, fipeCodigoModelo: "", fipeCodigoAno: "" })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(fipeMarcas.data || []).map((m: any) => <SelectItem key={m.codigo} value={String(m.codigo)}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modelo FIPE</Label>
                    <Select value={form.fipeCodigoModelo || ""} onValueChange={v => setForm({ ...form, fipeCodigoModelo: v, fipeCodigoAno: "" })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(fipeModelos.data?.modelos || []).map((m: any) => <SelectItem key={m.codigo} value={String(m.codigo)}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ano FIPE</Label>
                    <Select value={form.fipeCodigoAno || ""} onValueChange={v => setForm({ ...form, fipeCodigoAno: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(fipeAnos.data || []).map((a: any) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {fipeValor.data && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm"><strong>Valor FIPE:</strong> <span className="text-green-700 text-lg font-bold">{fipeValor.data.Valor}</span></p>
                    <p className="text-xs text-muted-foreground">Ref: {fipeValor.data.MesReferencia} | Código: {fipeValor.data.CodigoFipe}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>

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
