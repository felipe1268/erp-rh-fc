import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Car, Plus, Search, Pencil, Trash2, DollarSign, FileDown, Image, Camera, Loader2, Sparkles, AlertTriangle, CheckCircle2, ListChecks, X, FileText, User, StickyNote } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/ui/money-input";

const TIPOS = ["Carro", "SUV", "Caminhonete", "Caminhão", "Utilitário", "Van", "Moto", "Ônibus", "Máquina", "Outros"];
const STATUS = ["Ativo", "Em Manutenção", "Inativo", "Vendido"];
const CATEGORIAS = ["Carro dos Sócios", "Operação", "Locação"];
const SEM_CATEGORIA = "Sem categoria";

const STATUS_STYLES: Record<string, { label: string; card: string; cardActive: string; badge: string; border: string; dot: string }> = {
  Ativo: {
    label: "Ativos",
    card: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 hover:border-green-400",
    cardActive: "ring-2 ring-green-500 border-green-400",
    badge: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-200",
    border: "border-l-green-500",
    dot: "bg-green-500",
  },
  "Em Manutenção": {
    label: "Em Manutenção",
    card: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 hover:border-amber-400",
    cardActive: "ring-2 ring-amber-500 border-amber-400",
    badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200",
    border: "border-l-amber-500",
    dot: "bg-amber-500",
  },
  Vendido: {
    label: "Vendidos",
    card: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 hover:border-red-400",
    cardActive: "ring-2 ring-red-500 border-red-400",
    badge: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-200",
    border: "border-l-red-500",
    dot: "bg-red-500",
  },
  Inativo: {
    label: "Inativos",
    card: "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-400",
    cardActive: "ring-2 ring-slate-400 border-slate-400",
    badge: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
    border: "border-l-slate-400",
    dot: "bg-slate-400",
  },
};

function statusStyle(s: string) {
  return STATUS_STYLES[s] || STATUS_STYLES.Inativo;
}

function fmt(v: any) {
  const n = parseFloat(v || "0");
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Veiculos() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterStatus, setFilterStatus] = useState("Ativo");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const vehicles = trpc.frotas.listVehicles.useQuery(
    { companyId: cId, tipo: filterTipo !== "all" ? filterTipo : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createVehicle.useMutation({
    onSuccess: () => { vehicles.refetch(); setDialogOpen(false); toast.success("Veículo cadastrado"); },
    onError: (e) => toast.error("Não foi possível salvar: " + e.message),
  });
  const updateMut = trpc.frotas.updateVehicle.useMutation({
    onSuccess: () => { vehicles.refetch(); setDialogOpen(false); toast.success("Veículo atualizado"); },
    onError: (e) => toast.error("Não foi possível salvar: " + e.message),
  });
  const bulkStatusMut = trpc.frotas.updateVehicle.useMutation();
  const deleteMut = trpc.frotas.deleteVehicle.useMutation({
    onSuccess: () => { vehicles.refetch(); toast.success("Veículo inativado"); },
  });
  const pendingReg = trpc.frotas.getVehiclesPendingRegistration.useQuery(
    { companyId: cId },
    { enabled: cId > 0 },
  );
  const pendingIds = new Set((pendingReg.data || []).map((p: any) => p.id));
  const pendingMap = new Map((pendingReg.data || []).map((p: any) => [p.id, p.camposFaltantes]));

  const consolidateRegMut = trpc.frotas.consolidateVehicleRegistration.useMutation({
    onSuccess: () => { vehicles.refetch(); pendingReg.refetch(); toast.success("Cadastro consolidado com sucesso!"); },
    onError: (e) => toast.error(e.message),
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

  const docInputRef = useRef<HTMLInputElement>(null);
  const uploadDocMut = trpc.frotas.uploadVehicleDocument.useMutation({
    onSuccess: (data) => {
      vehicles.refetch();
      setForm((f: any) => ({ ...f, documentos: data.documentos }));
      toast.success("Documento anexado");
    },
    onError: (err) => toast.error("Erro ao anexar documento: " + err.message),
  });
  const removeDocMut = trpc.frotas.removeVehicleDocument.useMutation({
    onSuccess: (data) => {
      vehicles.refetch();
      setForm((f: any) => ({ ...f, documentos: data.documentos }));
      toast.success("Documento removido");
    },
    onError: (err) => toast.error("Erro ao remover documento: " + err.message),
  });

  function handleDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as ArrayBuffer;
      const base64 = btoa(new Uint8Array(result).reduce((d, b) => d + String.fromCharCode(b), ''));
      uploadDocMut.mutate({ companyId: cId, vehicleId: editing.id, fileName: file.name, fileData: base64 });
    };
    reader.readAsArrayBuffer(file);
  }

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
      motoristaPadrao: v.motorista_padrao, motoristaPadraoInicio: v.motorista_padrao_inicio,
      statusVeiculo: v.statusVeiculo, dataAquisicao: v.data_aquisicao,
      valorCompra: v.valor_compra, valorFipe: v.valor_fipe, valorVenda: v.valor_venda,
      fipeCodigoMarca: v.fipe_codigo_marca, fipeCodigoModelo: v.fipe_codigo_modelo,
      fipeCodigoAno: v.fipe_codigo_ano, depreciacaoAnos: v.depreciacao_anos || 5,
      crlvVencimento: v.crlv_vencimento, seguroVencimento: v.seguro_vencimento,
      categoriaUso: v.categoria_uso,
      observacoes: v.observacoes, fotoUrl: v.foto_url, documentos: v.documentos || [],
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.modelo || !form.tipoVeiculo) {
      toast.error("Preencha modelo e tipo");
      return;
    }
    if ((form.statusVeiculo || "") === "Vendido" && !(parseFloat(form.valorVenda || "0") > 0)) {
      toast.error("Veículo marcado como Vendido: informe o valor da venda.");
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

  const scoped = (vehicles.data || []).filter((v: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (v.placa || "").toLowerCase().includes(s) ||
      (v.modelo || "").toLowerCase().includes(s) ||
      (v.marca || "").toLowerCase().includes(s) ||
      (v.responsavel || "").toLowerCase().includes(s)
    );
  });
  const byStatus = filterStatus === "all"
    ? scoped
    : scoped.filter((v: any) => (v.statusVeiculo || "") === filterStatus);
  const list = filterCategoria === "all"
    ? byStatus
    : byStatus.filter((v: any) => filterCategoria === "__none__"
      ? !(v.categoria_uso || "").trim()
      : (v.categoria_uso || "") === filterCategoria);
  const statusCounts: Record<string, number> = STATUS.reduce((acc, s) => {
    acc[s] = scoped.filter((v: any) => (v.statusVeiculo || "") === s).length;
    return acc;
  }, {} as Record<string, number>);

  function toggleSelectMode() {
    setSelectMode((m) => {
      const next = !m;
      if (!next) { setSelectedIds(new Set()); setBulkStatus(""); }
      return next;
    });
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = list.length > 0 && list.every((v: any) => selectedIds.has(v.id));
  const visibleSelectedCount = list.filter((v: any) => selectedIds.has(v.id)).length;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.map((v: any) => v.id)));
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus) { toast.error("Selecione o status a aplicar"); return; }
    const ids = list.filter((v: any) => selectedIds.has(v.id)).map((v: any) => v.id);
    if (ids.length === 0) { toast.error("Selecione ao menos um veículo"); return; }
    setBulkSaving(true);
    let ok = 0;
    const erros: string[] = [];
    for (const id of ids) {
      try {
        await bulkStatusMut.mutateAsync({ id, companyId: cId, statusVeiculo: bulkStatus });
        ok++;
      } catch (e: any) {
        erros.push(e?.message || "erro");
      }
    }
    setBulkSaving(false);
    await vehicles.refetch();
    if (ok > 0) toast.success(`${ok} veículo(s) atualizado(s) para "${bulkStatus}"`);
    if (erros.length > 0) toast.error(`${erros.length} falha(s): ${erros[0]}`);
    setSelectedIds(new Set());
    setBulkStatus("");
    setSelectMode(false);
  }

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="h-6 w-6 text-cyan-600" /> Veículos
          </h1>
          <div className="flex gap-2">
            <Button
              variant={selectMode ? "default" : "outline"}
              onClick={toggleSelectMode}
              className={selectMode ? "" : "border-slate-300"}
            >
              {selectMode ? <X className="h-4 w-4 mr-1" /> : <ListChecks className="h-4 w-4 mr-1" />}
              {selectMode ? "Sair da seleção" : "Selecionar"}
            </Button>
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
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              <SelectItem value="__none__">{SEM_CATEGORIA}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectMode && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 dark:bg-cyan-950 dark:border-cyan-800 px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
              Selecionar todos
            </label>
            <span className="text-sm text-cyan-700 dark:text-cyan-300 font-semibold">{visibleSelectedCount} selecionado(s)</span>
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">Alterar status para:</span>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-[180px] bg-background"><SelectValue placeholder="Escolher status..." /></SelectTrigger>
              <SelectContent>
                {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={applyBulkStatus} disabled={bulkSaving || visibleSelectedCount === 0 || !bulkStatus}>
              {bulkSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {bulkSaving ? "Aplicando..." : "Aplicar"}
            </Button>
          </div>
        )}

        {!vehicles.isLoading && (
          <>
            {/* Cards de status — clicáveis para filtrar (visual e intuitivo) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`rounded-xl border p-3 text-left transition-all ${filterStatus === "all" ? "ring-2 ring-cyan-500 border-cyan-400 bg-cyan-50 dark:bg-cyan-950/40" : "bg-card hover:border-cyan-300"}`}
              >
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-cyan-600" />
                  <span className="text-xs font-medium text-muted-foreground">Todos</span>
                </div>
                <p className="text-2xl font-bold mt-1">{scoped.length}</p>
              </button>
              {STATUS.map((s) => {
                const st = statusStyle(s);
                const active = filterStatus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilterStatus(s)}
                    className={`rounded-xl border p-3 text-left transition-all ${st.card} ${active ? st.cardActive : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
                      <span className="text-xs font-medium text-muted-foreground truncate">{st.label}</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{statusCounts[s] || 0}</p>
                  </button>
                );
              })}
            </div>

            {/* Linha secundária — inventário / FIPE / cadastro incompleto */}
            {scoped.length > 0 && (() => {
              const totalFipe = scoped.reduce((s: number, v: any) => (v.statusVeiculo || "") === "Vendido" ? s : s + parseFloat(v.valor_fipe || "0"), 0);
              const comFipe = scoped.filter((v: any) => parseFloat(v.valor_fipe || "0") > 0).length;
              const incompletos = (pendingReg.data || []).length;
              return (
                <div className={`grid grid-cols-2 ${incompletos > 0 ? "md:grid-cols-3" : "md:grid-cols-2"} gap-3`}>
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
                  {incompletos > 0 && (
                    <Card className="bg-red-50 dark:bg-red-950 border-red-200">
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-red-700">{incompletos}</p>
                        <p className="text-xs text-red-600">Cadastro Incompleto</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {vehicles.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-cyan-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum veículo encontrado</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((v: any) => (
              <Card
                key={v.id}
                className={`overflow-hidden transition-shadow border-l-4 ${statusStyle(v.statusVeiculo).border} ${selectMode ? "cursor-pointer hover:shadow-md" : "hover:shadow-md"} ${selectMode && selectedIds.has(v.id) ? "ring-2 ring-cyan-500 border-cyan-400" : ""}`}
                onClick={selectMode ? () => toggleSelected(v.id) : undefined}
              >
                <div className="flex">
                  {selectMode && (
                    <div className="flex items-center justify-center pl-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelected(v.id)} />
                    </div>
                  )}
                  <div
                    className={`w-32 h-32 flex-shrink-0 bg-muted flex items-center justify-center overflow-hidden relative group ${selectMode ? "" : "cursor-pointer"}`}
                    onClick={selectMode ? undefined : () => handlePhotoClick(v.id)}
                    title={selectMode ? undefined : "Clique para alterar a foto"}
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
                      <span className={`text-[10px] font-medium shrink-0 rounded-full border px-2 py-0.5 ${statusStyle(v.statusVeiculo).badge}`}>{v.statusVeiculo}</span>
                    </div>
                    {pendingIds.has(v.id) && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        <span className="text-[10px] text-amber-600 font-medium">Cadastro incompleto — {(pendingMap.get(v.id) || []).join(", ")}</span>
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center flex-wrap gap-2">
                      <span className="font-mono text-sm font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{v.placa || "S/P"}</span>
                      <span className="text-xs text-muted-foreground">{v.tipoVeiculo}</span>
                      {(v.categoria_uso || "").trim() && (
                        <span className="text-[10px] font-medium rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5">{v.categoria_uso}</span>
                      )}
                      {v.valor_fipe && parseFloat(v.valor_fipe) > 0 && (
                        <span className="text-xs font-semibold text-green-600">{fmt(v.valor_fipe)}</span>
                      )}
                    </div>
                    {v.statusVeiculo === "Vendido" && v.valor_venda && parseFloat(v.valor_venda) > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-2.5 py-1">
                        <DollarSign className="h-4 w-4 text-red-600 shrink-0" />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-red-600">Vendido por</span>
                        <span className="text-sm font-bold text-red-700 dark:text-red-400">{fmt(v.valor_venda)}</span>
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {v.responsavel || v.motorista_nome || "Sem responsável"}
                    </div>
                    {(v.motorista_padrao || v.motorista_nome) && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 truncate">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{v.motorista_padrao || v.motorista_nome}</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1 flex-wrap" onClick={selectMode ? (e) => e.stopPropagation() : undefined}>
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
                      {Array.isArray(v.documentos) && v.documentos.filter((doc: any) => doc && typeof doc === "object" && doc.url).map((doc: any) => (
                        <a key={doc.key || doc.url} href={doc.url} target="_blank" rel="noreferrer" title={doc.nome} className="inline-flex items-center gap-1 max-w-[140px] text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100">
                          <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{doc.nome || "Documento"}</span>
                        </a>
                      ))}
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
          <DialogContent className="top-0 left-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-none m-0 rounded-none overflow-y-auto p-0 bg-white" resizable={false} showCloseButton={false}>
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 md:px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold leading-tight truncate">{editing ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
                  <p className="text-xs text-muted-foreground truncate">{editing ? "Atualize os dados do veículo" : "Preencha os dados para cadastrar"}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setDialogOpen(false)}><X className="h-4 w-4 mr-1" />Cancelar</Button>
                <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Salvando...</> : <><CheckCircle2 className="h-4 w-4 mr-1" />Salvar</>}
                </Button>
              </div>
            </div>

            <div className="px-4 md:px-8 py-6 w-full max-w-[1080px] mx-auto space-y-5">
              {/* Aviso de cadastro incompleto no TOPO — facilita o preenchimento */}
              {editing && pendingIds.has(editing.id) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-800">Cadastro incompleto</span>
                    <p className="text-sm text-amber-700">Campos faltantes: <strong>{(pendingMap.get(editing.id) || []).join(", ")}</strong></p>
                    <p className="text-xs text-amber-600 mt-0.5">Preencha os campos abaixo e salve para poder consolidar o cadastro.</p>
                  </div>
                </div>
              )}

              {/* Identificação */}
              <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Car className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Identificação</h3>
                    <p className="text-xs text-muted-foreground">Dados principais do veículo</p>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-6">
                  <div
                    className="w-full md:w-60 h-48 flex-shrink-0 bg-muted rounded-xl flex items-center justify-center overflow-hidden relative group cursor-pointer border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 transition-colors"
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

                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Tipo <span className="text-red-500">*</span></Label>
                      <Select value={form.tipoVeiculo || ""} onValueChange={v => setForm({ ...form, tipoVeiculo: v })}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Modelo <span className="text-red-500">*</span></Label>
                      <Input className="h-10" placeholder="Ex.: JCB 3CX" value={form.modelo || ""} onChange={e => setForm({ ...form, modelo: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Marca</Label>
                      <Input className="h-10" placeholder="Ex.: JCB" value={form.marca || ""} onChange={e => setForm({ ...form, marca: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Placa</Label>
                      <Input className="h-10 font-mono" placeholder="Sem placa? deixe vazio" value={form.placa || ""} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} maxLength={10} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Ano Fab.</Label>
                      <Input className="h-10" placeholder="2024" value={form.anoFabricacao || ""} onChange={e => setForm({ ...form, anoFabricacao: e.target.value })} maxLength={4} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Ano Modelo</Label>
                      <Input className="h-10" placeholder="2024" value={form.anoModelo || ""} onChange={e => setForm({ ...form, anoModelo: e.target.value })} maxLength={4} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Cor</Label>
                      <Input className="h-10" placeholder="Ex.: Amarela" value={form.cor || ""} onChange={e => setForm({ ...form, cor: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Categoria</Label>
                      <Select value={form.categoriaUso || "__none__"} onValueChange={v => setForm({ ...form, categoriaUso: v === "__none__" ? null : v })}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{SEM_CATEGORIA}</SelectItem>
                          {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Status</Label>
                      <Select value={form.statusVeiculo || "Ativo"} onValueChange={v => setForm({ ...form, statusVeiculo: v })}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {(form.statusVeiculo || "") === "Vendido" && (
                      <div className="sm:col-span-2">
                        <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">
                          Valor da Venda (R$) <span className="text-red-500">*</span>
                        </Label>
                        <MoneyInput className="h-10" value={form.valorVenda} onChange={v => setForm({ ...form, valorVenda: v })} />
                        <p className="text-[11px] text-muted-foreground mt-1">Obrigatório para veículos vendidos. O veículo sai do "Valor do Inventário".</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Documentação */}
              <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0"><FileText className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Documentação</h3>
                    <p className="text-xs text-muted-foreground">RENAVAM, chassi, quilometragem e vencimentos</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">RENAVAM</Label>
                    <Input className="h-10 font-mono" placeholder="Não se aplica? deixe vazio" value={form.renavam || ""} onChange={e => setForm({ ...form, renavam: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Chassi</Label>
                    <Input className="h-10 font-mono text-xs" placeholder="Opcional" value={form.chassi || ""} onChange={e => setForm({ ...form, chassi: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">KM Atual</Label>
                    <Input className="h-10" type="number" placeholder="0" value={form.kmAtual || ""} onChange={e => setForm({ ...form, kmAtual: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Responsável</Label>
                    <Input className="h-10" value={form.responsavel || ""} onChange={e => setForm({ ...form, responsavel: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Vencimento CRLV</Label>
                    <Input className="h-10" type="date" value={form.crlvVencimento || ""} onChange={e => setForm({ ...form, crlvVencimento: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Vencimento Seguro</Label>
                    <Input className="h-10" type="date" value={form.seguroVencimento || ""} onChange={e => setForm({ ...form, seguroVencimento: e.target.value })} />
                  </div>
                </div>

                {/* Anexos / Documentos do veículo */}
                <div className="mt-5 pt-5 border-t">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div>
                      <Label className="text-xs font-semibold text-foreground/80 block">Documentos anexados</Label>
                      <p className="text-[11px] text-muted-foreground">CRLV, comprovante de compra, laudo etc. (PDF, imagem, Word, Excel — máx. 10MB)</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={!editing || uploadDocMut.isPending}
                      onClick={() => docInputRef.current?.click()}
                    >
                      {uploadDocMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5 rotate-180" />}
                      Anexar
                    </Button>
                  </div>
                  <input
                    type="file"
                    ref={docInputRef}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.txt,.csv"
                    onChange={handleDocChange}
                  />
                  {!editing ? (
                    <p className="text-xs text-muted-foreground italic">Salve o veículo primeiro para poder anexar documentos.</p>
                  ) : (form.documentos && form.documentos.length > 0) ? (
                    <ul className="space-y-2">
                      {form.documentos.map((doc: any) => (
                        <li key={doc.key} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-700 hover:underline truncate flex-1 min-w-0"
                            title={doc.nome}
                          >
                            {doc.nome}
                          </a>
                          <span className="text-[10px] text-muted-foreground shrink-0">{(doc.tamanho / 1024 / 1024).toFixed(2)} MB</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={removeDocMut.isPending}
                            onClick={() => { if (confirm(`Remover o documento "${doc.nome}"?`)) removeDocMut.mutate({ companyId: cId, vehicleId: editing.id, key: doc.key }); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Nenhum documento anexado ainda.</p>
                  )}
                </div>
              </div>

              {/* Motorista / Condutor */}
              <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0"><User className="h-5 w-5 text-amber-600" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Motorista / Condutor</h3>
                    <p className="text-xs text-muted-foreground">Mesmo que não seja funcionário cadastrado — autopreenche o Diário de Obra</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-4 mt-3">
                  <div className="md:col-span-2">
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Nome do motorista</Label>
                    <Input className="h-10" placeholder="Ex.: João da Silva (terceiro / não funcionário)" value={form.motoristaPadrao || ""} onChange={e => setForm({ ...form, motoristaPadrao: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Motorista desde</Label>
                    <Input className="h-10" type="date" value={form.motoristaPadraoInicio || ""} onChange={e => setForm({ ...form, motoristaPadraoInicio: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Financeiro */}
              <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Financeiro</h3>
                    <p className="text-xs text-muted-foreground">Aquisição e depreciação</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Data Aquisição</Label>
                    <Input className="h-10" type="date" value={form.dataAquisicao || ""} onChange={e => setForm({ ...form, dataAquisicao: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Valor de Compra (R$)</Label>
                    <MoneyInput className="h-10" value={form.valorCompra} onChange={v => setForm({ ...form, valorCompra: v })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Depreciação (anos)</Label>
                    <Input className="h-10" type="number" value={form.depreciacaoAnos || 5} onChange={e => setForm({ ...form, depreciacaoAnos: parseInt(e.target.value) || 5 })} />
                  </div>
                </div>
              </div>

              {/* Consulta FIPE */}
              <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5 text-green-600" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Consulta FIPE</h3>
                    <p className="text-xs text-muted-foreground">Opcional — busca o valor de mercado</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4">
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Marca FIPE</Label>
                    <Select value={form.fipeCodigoMarca || ""} onValueChange={v => setForm({ ...form, fipeCodigoMarca: v, fipeCodigoModelo: "", fipeCodigoAno: "" })}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(fipeMarcas.data || []).map((m: any) => <SelectItem key={m.codigo} value={String(m.codigo)}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Modelo FIPE</Label>
                    <Select value={form.fipeCodigoModelo || ""} onValueChange={v => setForm({ ...form, fipeCodigoModelo: v, fipeCodigoAno: "" })}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {(fipeModelos.data?.modelos || []).map((m: any) => <SelectItem key={m.codigo} value={String(m.codigo)}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-foreground/80 mb-1.5 block">Ano FIPE</Label>
                    <Select value={form.fipeCodigoAno || ""} onValueChange={v => setForm({ ...form, fipeCodigoAno: v })}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(fipeAnos.data || []).map((a: any) => <SelectItem key={a.codigo} value={a.codigo}>{a.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {fipeValor.data && (
                    <div className="flex items-end">
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200 w-full">
                        <p className="text-xs text-muted-foreground">Valor FIPE</p>
                        <p className="text-green-700 font-bold">{fipeValor.data.Valor}</p>
                        <p className="text-[10px] text-muted-foreground">Ref: {fipeValor.data.MesReferencia}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Observações */}
              <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0"><StickyNote className="h-5 w-5 text-slate-500" /></div>
                  <h3 className="text-sm font-semibold text-foreground">Observações</h3>
                </div>
                <Textarea rows={3} placeholder="Anotações sobre o veículo (opcional)" value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
              </div>

              {/* Validação / Consolidação de cadastro (somente edição) */}
              {editing && (
                <div className="rounded-2xl border bg-card shadow-sm p-5 md:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-cyan-600" /></div>
                    <h3 className="text-sm font-semibold text-foreground">Validação de Cadastro</h3>
                  </div>
                  {pendingIds.has(editing.id) ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <span className="font-semibold text-amber-800">Cadastro incompleto</span>
                      </div>
                      <p className="text-sm text-amber-700 mb-2">
                        Campos faltantes: <strong>{(pendingMap.get(editing.id) || []).join(", ")}</strong>
                      </p>
                      <p className="text-xs text-amber-600">Preencha os campos acima e salve para poder consolidar o cadastro.</p>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <span className="font-semibold text-green-800">
                            {editing.cadastro_consolidado ? "Cadastro consolidado" : "Cadastro completo — pronto para consolidar"}
                          </span>
                          {editing.cadastro_consolidado_em && (
                            <p className="text-xs text-green-600">Consolidado em {new Date(editing.cadastro_consolidado_em).toLocaleDateString("pt-BR")} por {editing.cadastro_consolidado_por || "Sistema"}</p>
                          )}
                        </div>
                      </div>
                      {!editing.cadastro_consolidado && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => consolidateRegMut.mutate({ companyId: cId, vehicleId: editing.id })}
                          disabled={consolidateRegMut.isPending}
                        >
                          {consolidateRegMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                          Consolidar Cadastro
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
