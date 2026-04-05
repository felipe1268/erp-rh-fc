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
import { Car, Plus, Search, Pencil, Trash2, DollarSign, FileDown, Image, Camera, Loader2, Sparkles } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const TIPOS = ["Carro", "SUV", "Caminhonete", "Caminhão", "Utilitário", "Van", "Moto", "Ônibus", "Máquina", "Outros"];
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
  const uploadPhotoMut = trpc.frotas.uploadVehiclePhoto.useMutation({
    onSuccess: (data) => {
      vehicles.refetch();
      toast.success("Foto atualizada");
      if (dialogOpen && editing) {
        setForm((f: any) => ({ ...f, fotoUrl: data.fotoUrl }));
      }
    },
    onError: (err) => toast.error("Erro ao enviar foto: " + err.message),
  });
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dialogPhotoRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<number | null>(null);

  function handlePhotoClick(vehicleId: number) {
    setPhotoTargetId(vehicleId);
    photoInputRef.current?.click();
  }

  function handleDialogPhotoClick() {
    if (editing) {
      setPhotoTargetId(editing.id);
      dialogPhotoRef.current?.click();
    }
  }

  function processPhotoFile(file: File, targetId: number) {
    if (!file.type.startsWith('image/')) {
      toast.error("Selecione uma imagem (JPG, PNG, etc.)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as ArrayBuffer;
      const base64 = btoa(new Uint8Array(result).reduce((d, b) => d + String.fromCharCode(b), ''));
      uploadPhotoMut.mutate({ vehicleId: targetId, companyId: cId, base64, contentType: file.type });
    };
    reader.readAsArrayBuffer(file);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !photoTargetId) return;
    processPhotoFile(file, photoTargetId);
    e.target.value = "";
  }

  const autoFipeMut = trpc.frotas.autoFillFipe.useMutation({
    onSuccess: (data) => {
      vehicles.refetch();
      const msgs: string[] = [];
      if (data.updated > 0) msgs.push(`${data.updated} veículo(s) atualizado(s)`);
      if (data.skipped > 0) msgs.push(`${data.skipped} não encontrado(s)`);
      if (data.errors > 0) msgs.push(`${data.errors} erro(s)`);
      toast.success(`FIPE preenchido! ${msgs.join(" · ")}`);
      for (const r of data.results) {
        if (r.status === "updated") {
          toast.info(`✅ ${r.marca} ${r.modelo}: ${r.detail}`, { duration: 8000 });
        } else if (r.status === "skipped") {
          toast.warning(`⚠ ${r.marca} ${r.modelo}: ${r.detail}`, { duration: 8000 });
        }
      }
    },
    onError: (e) => toast.error(e.message),
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
      observacoes: v.observacoes, fotoUrl: v.foto_url,
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
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="h-6 w-6 text-cyan-600" /> Veículos
          </h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => autoFipeMut.mutate({ companyId: cId })}
              disabled={autoFipeMut.isPending}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              {autoFipeMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {autoFipeMut.isPending ? "Consultando FIPE..." : "Preencher FIPE Automático"}
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Veículo</Button>
          </div>
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

        {!vehicles.isLoading && list.length > 0 && (() => {
          const totalFipe = list.reduce((s: number, v: any) => s + parseFloat(v.valor_fipe || "0"), 0);
          const comFipe = list.filter((v: any) => parseFloat(v.valor_fipe || "0") > 0).length;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-cyan-50 dark:bg-cyan-950 border-cyan-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-cyan-700">{list.length}</p>
                  <p className="text-xs text-cyan-600">Veículos na Frota</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950 border-green-200">
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-green-700">{fmt(totalFipe)}</p>
                  <p className="text-xs text-green-600">Valor do Inventário</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{comFipe}</p>
                  <p className="text-xs text-blue-600">Com Valor FIPE</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{list.filter((v: any) => v.statusVeiculo === "Ativo").length}</p>
                  <p className="text-xs text-amber-600">Ativos</p>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {vehicles.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-cyan-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum veículo encontrado</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((v: any) => (
              <Card key={v.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="flex">
                  <div
                    className="w-32 h-32 flex-shrink-0 bg-muted flex items-center justify-center overflow-hidden relative group cursor-pointer"
                    onClick={() => handlePhotoClick(v.id)}
                    title="Clique para alterar a foto"
                  >
                    {v.foto_url ? (
                      <img src={v.foto_url} alt={v.modelo} className="w-full h-full object-cover" />
                    ) : (
                      <Car className="h-10 w-10 text-muted-foreground/40" />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                    {uploadPhotoMut.isPending && photoTargetId === v.id && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-3 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{v.modelo}</p>
                        <p className="text-xs text-muted-foreground">{v.marca} | {v.anoFabricacao}/{v.anoModelo || "—"} | {v.cor || "—"}</p>
                      </div>
                      <Badge variant={v.statusVeiculo === "Ativo" ? "default" : "secondary"} className="text-[10px] shrink-0">{v.statusVeiculo}</Badge>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-sm font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{v.placa || "S/P"}</span>
                      <span className="text-xs text-muted-foreground">{v.tipoVeiculo}</span>
                      {v.valor_fipe && parseFloat(v.valor_fipe) > 0 && (
                        <span className="text-xs font-semibold text-green-600">{fmt(v.valor_fipe)}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {v.responsavel || v.motorista_nome || "Sem responsável"}
                    </div>
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {v.crlv_url && (
                        <a href={v.crlv_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100">
                          <FileDown className="h-3 w-3" /> CRLV
                        </a>
                      )}
                      {v.seguro_url && (
                        <a href={v.seguro_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-100">
                          <FileDown className="h-3 w-3" /> Seguro
                        </a>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(v)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { if (confirm("Inativar este veículo?")) deleteMut.mutate({ id: v.id, companyId: cId }); }}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <input type="file" accept="image/*" ref={photoInputRef} className="hidden" onChange={handlePhotoChange} />
        <input type="file" accept="image/*" ref={dialogPhotoRef} className="hidden" onChange={handlePhotoChange} />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto p-0" resizable={false} showCloseButton={false}>
            <div className="sticky top-0 z-10 bg-background border-b px-6 py-4 flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">{editing ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>

            <div className="px-8 py-4 w-full space-y-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div
                  className="w-full md:w-72 h-52 flex-shrink-0 bg-muted rounded-xl flex items-center justify-center overflow-hidden relative group cursor-pointer border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 transition-colors"
                  onClick={handleDialogPhotoClick}
                  title="Clique para alterar a foto"
                >
                  {form.fotoUrl ? (
                    <img src={form.fotoUrl} alt="Foto do veículo" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Camera className="h-8 w-8" />
                      <span className="text-xs">Clique para adicionar foto</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                    <div className="flex flex-col items-center gap-1 text-white">
                      <Camera className="h-6 w-6" />
                      <span className="text-xs font-medium">Alterar Foto</span>
                    </div>
                  </div>
                  {uploadPhotoMut.isPending && editing && photoTargetId === editing.id && (
                    <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                      <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identificação</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-x-4 gap-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Tipo *</Label>
                      <Select value={form.tipoVeiculo || ""} onValueChange={v => setForm({ ...form, tipoVeiculo: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Placa</Label>
                      <Input className="h-9 font-mono" value={form.placa || ""} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} maxLength={10} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Modelo *</Label>
                      <Input className="h-9" value={form.modelo || ""} onChange={e => setForm({ ...form, modelo: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Marca</Label>
                      <Input className="h-9" value={form.marca || ""} onChange={e => setForm({ ...form, marca: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Ano Fab.</Label>
                      <Input className="h-9" value={form.anoFabricacao || ""} onChange={e => setForm({ ...form, anoFabricacao: e.target.value })} maxLength={4} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Ano Modelo</Label>
                      <Input className="h-9" value={form.anoModelo || ""} onChange={e => setForm({ ...form, anoModelo: e.target.value })} maxLength={4} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Cor</Label>
                      <Input className="h-9" value={form.cor || ""} onChange={e => setForm({ ...form, cor: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={form.statusVeiculo || "Ativo"} onValueChange={v => setForm({ ...form, statusVeiculo: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Documentação</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">RENAVAM</Label>
                    <Input className="h-9 font-mono" value={form.renavam || ""} onChange={e => setForm({ ...form, renavam: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Chassi</Label>
                    <Input className="h-9 font-mono text-xs" value={form.chassi || ""} onChange={e => setForm({ ...form, chassi: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">KM Atual</Label>
                    <Input className="h-9" type="number" value={form.kmAtual || ""} onChange={e => setForm({ ...form, kmAtual: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Responsável</Label>
                    <Input className="h-9" value={form.responsavel || ""} onChange={e => setForm({ ...form, responsavel: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Vencimento CRLV</Label>
                    <Input className="h-9" type="date" value={form.crlvVencimento || ""} onChange={e => setForm({ ...form, crlvVencimento: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Vencimento Seguro</Label>
                    <Input className="h-9" type="date" value={form.seguroVencimento || ""} onChange={e => setForm({ ...form, seguroVencimento: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financeiro</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Data Aquisição</Label>
                    <Input className="h-9" type="date" value={form.dataAquisicao || ""} onChange={e => setForm({ ...form, dataAquisicao: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor de Compra (R$)</Label>
                    <Input className="h-9" type="number" step="0.01" value={form.valorCompra || ""} onChange={e => setForm({ ...form, valorCompra: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Depreciação (anos)</Label>
                    <Input className="h-9" type="number" value={form.depreciacaoAnos || 5} onChange={e => setForm({ ...form, depreciacaoAnos: parseInt(e.target.value) || 5 })} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  <DollarSign className="h-4 w-4 text-green-600 inline mr-1" />
                  Consulta FIPE
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Marca FIPE</Label>
                    <Select value={form.fipeCodigoMarca || ""} onValueChange={v => setForm({ ...form, fipeCodigoMarca: v, fipeCodigoModelo: "", fipeCodigoAno: "" })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(fipeMarcas.data || []).map((m: any) => <SelectItem key={m.codigo} value={String(m.codigo)}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Modelo FIPE</Label>
                    <Select value={form.fipeCodigoModelo || ""} onValueChange={v => setForm({ ...form, fipeCodigoModelo: v, fipeCodigoAno: "" })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(fipeModelos.data?.modelos || []).map((m: any) => <SelectItem key={m.codigo} value={String(m.codigo)}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ano FIPE</Label>
                    <Select value={form.fipeCodigoAno || ""} onValueChange={v => setForm({ ...form, fipeCodigoAno: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(fipeAnos.data || []).map((a: any) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {fipeValor.data && (
                    <div className="flex items-end">
                      <div className="p-2 bg-green-50 rounded-lg border border-green-200 w-full">
                        <p className="text-xs text-muted-foreground">Valor FIPE</p>
                        <p className="text-green-700 font-bold">{fipeValor.data.Valor}</p>
                        <p className="text-[10px] text-muted-foreground">Ref: {fipeValor.data.MesReferencia}</p>
                      </div>
                    </div>
                  )}
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
