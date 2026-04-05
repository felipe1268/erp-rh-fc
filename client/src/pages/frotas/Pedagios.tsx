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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Milestone, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2, Sparkles, FileUp, Eye, X, Check, DollarSign, AlertTriangle, Car,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CATEGORIAS: Record<string, { label: string; color: string }> = {
  pedagio: { label: "Pedágio", color: "bg-blue-100 text-blue-700" },
  sem_parar: { label: "Sem Parar", color: "bg-violet-100 text-violet-700" },
  estacionamento: { label: "Estacionamento", color: "bg-amber-100 text-amber-700" },
  recarga_tag: { label: "Recarga Tag", color: "bg-emerald-100 text-emerald-700" },
};

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function Pedagios() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [search, setSearch] = useState("");
  const now = new Date();
  const [anoAtual, setAnoAtual] = useState(now.getFullYear());
  const [mesAtual, setMesAtual] = useState(now.getMonth() + 1);

  const [iaDialogOpen, setIaDialogOpen] = useState(false);
  const [iaFile, setIaFile] = useState<File | null>(null);
  const [iaPreview, setIaPreview] = useState<string | null>(null);
  const [iaParsed, setIaParsed] = useState<any>(null);
  const [iaSelectedItems, setIaSelectedItems] = useState<Set<number>>(new Set());
  const [iaSaving, setIaSaving] = useState(false);
  const iaFileRef = useRef<HTMLInputElement>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const tolls = trpc.frotas.listTollRecords.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createTollRecord.useMutation({
    onSuccess: () => { tolls.refetch(); setDialogOpen(false); toast.success("Lançamento registrado"); },
  });
  const updateMut = trpc.frotas.updateTollRecord.useMutation({
    onSuccess: () => { tolls.refetch(); setDialogOpen(false); toast.success("Lançamento atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteTollRecord.useMutation({
    onSuccess: () => { tolls.refetch(); toast.success("Lançamento excluído"); },
  });
  const parseMut = trpc.frotas.parseTollPdf.useMutation();
  const importBatchMut = trpc.frotas.importTollBatch.useMutation();

  function openNew() {
    setEditing(null);
    setForm({ data: new Date().toISOString().slice(0, 10), categoria: "pedagio", status: "pago" });
    setDialogOpen(true);
  }
  function openEdit(r: any) {
    setEditing(r);
    setForm({
      vehicleId: String(r.vehicle_id), data: r.data?.slice(0, 10),
      categoria: r.categoria, descricao: r.descricao || "",
      pracaPedagio: r.praca_pedagio || "", rodovia: r.rodovia || "",
      valor: r.valor, tagId: r.tag_id || "", eixos: r.eixos || "",
      status: r.status, observacoes: r.observacoes || "",
    });
    setDialogOpen(true);
  }
  function save() {
    if (!form.vehicleId || !form.data || !form.valor) return toast.error("Preencha veículo, data e valor");
    if (editing) {
      updateMut.mutate({ id: editing.id, companyId: cId, vehicleId: parseInt(form.vehicleId), ...form, eixos: form.eixos ? parseInt(form.eixos) : undefined });
    } else {
      createMut.mutate({ companyId: cId, vehicleId: parseInt(form.vehicleId), ...form, eixos: form.eixos ? parseInt(form.eixos) : undefined, criadoPor: user?.name || "Sistema" });
    }
  }

  const handleIaFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) { toast.error("Formato inválido. Use JPG, PNG, WebP ou PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)."); return; }
    setIaFile(file);
    setIaParsed(null);
    setIaSelectedItems(new Set());
    if (file.type.startsWith("image/")) {
      setIaPreview(URL.createObjectURL(file));
    } else {
      setIaPreview(null);
    }
    setIaDialogOpen(true);
    e.target.value = "";
  }, []);

  const processIA = useCallback(async () => {
    if (!iaFile) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = (reader.result as string).split(",")[1];
      try {
        const result = await parseMut.mutateAsync({
          companyId: cId, base64: b64,
          mimeType: iaFile.type as any,
        });
        setIaParsed(result);
        if (result.items?.length) {
          setIaSelectedItems(new Set(result.items.map((_: any, i: number) => i)));
        }
      } catch (err: any) {
        toast.error(err.message || "Erro ao processar documento");
      }
    };
    reader.readAsDataURL(iaFile);
  }, [iaFile, cId]);

  const saveIAItems = useCallback(async () => {
    if (!iaParsed?.items) return;
    setIaSaving(true);
    const items = iaParsed.items.filter((_: any, i: number) => iaSelectedItems.has(i)).filter((it: any) => it.vehicleId);
    if (items.length === 0) { toast.error("Nenhum item com veículo válido selecionado."); setIaSaving(false); return; }
    try {
      const result = await importBatchMut.mutateAsync({
        companyId: cId,
        items: items.map((it: any) => ({
          vehicleId: it.vehicleId,
          data: it.data,
          categoria: it.categoria || "pedagio",
          descricao: it.descricao || "",
          pracaPedagio: it.pracaPedagio || "",
          rodovia: it.rodovia || "",
          valor: it.valor,
          tagId: it.tagId || "",
          eixos: it.eixos || undefined,
          observacoes: it.observacoes || "",
        })),
        criadoPor: user?.name || "IA Import",
      });
      toast.success(`${result.inserted} lançamento(s) importado(s) com sucesso!`);
      tolls.refetch();
      setIaDialogOpen(false);
      setIaParsed(null);
      setIaFile(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
    setIaSaving(false);
  }, [iaParsed, iaSelectedItems, cId, user]);

  const allRecords = (tolls.data || []) as any[];
  const list = allRecords.filter((r: any) => {
    const d = new Date(r.data);
    if (d.getFullYear() !== anoAtual || d.getMonth() + 1 !== mesAtual) return false;
    if (filterCategoria !== "all" && r.categoria !== filterCategoria) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(r.placa?.toLowerCase().includes(s) || r.praca_pedagio?.toLowerCase().includes(s) ||
        r.rodovia?.toLowerCase().includes(s) || r.descricao?.toLowerCase().includes(s) ||
        r.tag_id?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const totalValor = list.reduce((s: number, r: any) => s + parseFloat(r.valor || "0"), 0);
  const totalPedagios = list.filter((r: any) => r.categoria === "pedagio").length;
  const totalSemParar = list.filter((r: any) => r.categoria === "sem_parar").length;
  const veiculosUnicos = new Set(list.map((r: any) => r.vehicle_id)).size;

  const monthHasData = (m: number) => {
    return allRecords.some((r: any) => {
      const d = new Date(r.data);
      return d.getFullYear() === anoAtual && d.getMonth() + 1 === m;
    });
  };

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Milestone className="h-5 w-5 text-indigo-600" /> Pedágios e Sem Parar
          </h1>
          <div className="flex gap-2">
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ref={iaFileRef} className="hidden" onChange={handleIaFileSelect} />
            <Button variant="outline" size="sm" className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
              onClick={() => iaFileRef.current?.click()}>
              <Sparkles className="h-4 w-4 mr-1" /> Importar (IA)
            </Button>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnoAtual(a => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="font-semibold text-sm min-w-[50px] text-center">{anoAtual}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnoAtual(a => a + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {MESES_ABREV.map((m, i) => {
              const mes = i + 1;
              const isActive = mesAtual === mes;
              const hasData = monthHasData(mes);
              return (
                <button key={m} onClick={() => setMesAtual(mes)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    isActive ? "bg-indigo-600 text-white" : hasData ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>{m}</button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Com dados</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted" /> Sem dados</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-indigo-700">{list.length}</div>
              <div className="text-[10px] text-indigo-600 uppercase font-semibold">Lançamentos</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{fmt(totalValor)}</div>
              <div className="text-[10px] text-blue-600 uppercase font-semibold">Valor Total</div>
            </CardContent>
          </Card>
          <Card className="border-violet-200 bg-violet-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-violet-700">{totalPedagios} / {totalSemParar}</div>
              <div className="text-[10px] text-violet-600 uppercase font-semibold">Pedágios / Sem Parar</div>
            </CardContent>
          </Card>
          <Card className="border-cyan-200 bg-cyan-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-cyan-700">{veiculosUnicos}</div>
              <div className="text-[10px] text-cyan-600 uppercase font-semibold">Veículos</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar placa, praça, rodovia..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>{[<SelectItem key="all" value="all">Todos os veíc...</SelectItem>,
              ...(vehicles.data || []).map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>)
            ]}</SelectContent>
          </Select>
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categ...</SelectItem>
              {Object.entries(CATEGORIAS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Veículo</th>
                <th className="text-left p-3 font-medium">Categoria</th>
                <th className="text-left p-3 font-medium">Praça / Rodovia</th>
                <th className="text-right p-3 font-medium">Valor</th>
                <th className="text-left p-3 font-medium">Tag</th>
                <th className="text-center p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lançamento neste mês</td></tr>
              ) : list.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3">{new Date(r.data).toLocaleDateString("pt-BR")}</td>
                  <td className="p-3 font-medium">{r.placa || r.modelo}</td>
                  <td className="p-3">
                    <Badge className={CATEGORIAS[r.categoria]?.color || "bg-gray-100 text-gray-700"}>
                      {CATEGORIAS[r.categoria]?.label || r.categoria}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div>{r.praca_pedagio || "—"}</div>
                    {r.rodovia && <div className="text-xs text-muted-foreground">{r.rodovia}</div>}
                  </td>
                  <td className="p-3 text-right font-semibold">{fmt(r.valor)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.tag_id || "—"}</td>
                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { if (confirm("Excluir este lançamento?")) deleteMut.mutate({ id: r.id, companyId: cId }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Lançamento" : "Novo Lançamento de Pedágio"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Veículo *</Label>
                <Select value={form.vehicleId || ""} onValueChange={v => setForm({ ...form, vehicleId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(vehicles.data || []).map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.placa} — {v.marca} {v.modelo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={form.data || ""} onChange={e => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={form.categoria || "pedagio"} onValueChange={v => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIAS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor (R$) *</Label>
                <MoneyInput value={form.valor} onChange={v => setForm({ ...form, valor: v })} />
              </div>
              <div>
                <Label className="text-xs">Eixos</Label>
                <Input type="number" value={form.eixos || ""} onChange={e => setForm({ ...form, eixos: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Praça de Pedágio</Label>
                <Input value={form.pracaPedagio || ""} onChange={e => setForm({ ...form, pracaPedagio: e.target.value })} placeholder="Ex: Praça Nova Odessa" />
              </div>
              <div>
                <Label className="text-xs">Rodovia</Label>
                <Input value={form.rodovia || ""} onChange={e => setForm({ ...form, rodovia: e.target.value })} placeholder="Ex: SP-330" />
              </div>
              <div>
                <Label className="text-xs">Tag ID</Label>
                <Input value={form.tagId || ""} onChange={e => setForm({ ...form, tagId: e.target.value })} placeholder="Nº do Sem Parar" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Descrição</Label>
                <Input value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editing ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={iaDialogOpen} onOpenChange={(o) => { if (!parseMut.isPending && !iaSaving) setIaDialogOpen(o); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" /> Importar Pedágio/Sem Parar com IA
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {iaFile && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileUp className="h-4 w-4 text-violet-500" />
                    <span className="font-medium">{iaFile.name}</span>
                    <Badge variant="outline" className="text-xs">{(iaFile.size / 1024).toFixed(0)} KB</Badge>
                  </div>
                  {iaPreview && (
                    <img src={iaPreview} alt="Preview" className="mt-2 max-h-[200px] rounded-md border object-contain" />
                  )}
                </div>
              )}

              {!iaParsed && (
                <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={processIA} disabled={parseMut.isPending}>
                  {parseMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analisando documento...</> : <><Eye className="h-4 w-4 mr-1" /> Analisar com IA</>}
                </Button>
              )}

              {iaParsed && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-sm">
                      {iaParsed.items?.length || 0} lançamento(s) encontrado(s)
                    </span>
                    <Badge variant="outline" className={
                      iaParsed.confidence === "alta" ? "border-green-300 text-green-700" :
                      iaParsed.confidence === "media" ? "border-amber-300 text-amber-700" :
                      "border-red-300 text-red-700"
                    }>Confiança: {iaParsed.confidence}</Badge>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {iaParsed.items?.map((item: any, idx: number) => {
                      const isSelected = iaSelectedItems.has(idx);
                      const veh = (vehicles.data || []).find((v: any) => v.id === item.vehicleId);
                      return (
                        <div key={idx}
                          className={`rounded-lg border p-3 cursor-pointer transition-colors ${isSelected ? "border-violet-300 bg-violet-50/50" : "border-muted bg-muted/20 opacity-60"}`}
                          onClick={() => {
                            const next = new Set(iaSelectedItems);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            setIaSelectedItems(next);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox checked={isSelected} className="mt-0.5" />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={CATEGORIAS[item.categoria]?.color || "bg-gray-100 text-gray-700"}>
                                  {CATEGORIAS[item.categoria]?.label || item.categoria || "Pedágio"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{item.data}</span>
                                <span className="font-semibold">{fmt(item.valor)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">{veh ? `${veh.placa} — ${veh.marca} ${veh.modelo}` : item.vehiclePlaca || "Veículo não identificado"}</span>
                                {!item.vehicleId && <Badge className="ml-2 bg-red-100 text-red-700 text-[10px]">Sem veículo</Badge>}
                              </div>
                              {item.pracaPedagio && <div className="text-xs text-muted-foreground">Praça: {item.pracaPedagio}</div>}
                              {item.rodovia && <div className="text-xs text-muted-foreground">Rodovia: {item.rodovia}</div>}
                              {item.descricao && <div className="text-xs">{item.descricao}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 justify-between items-center pt-2 border-t">
                    <div className="text-sm text-muted-foreground">
                      {iaSelectedItems.size} de {iaParsed.items?.length || 0} selecionado(s) ·
                      Total: {fmt(iaParsed.items?.filter((_: any, i: number) => iaSelectedItems.has(i)).reduce((s: number, it: any) => s + (it.valor || 0), 0))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setIaDialogOpen(false); setIaParsed(null); setIaFile(null); }}>Cancelar</Button>
                      <Button className="bg-violet-600 hover:bg-violet-700" onClick={saveIAItems} disabled={iaSaving || iaSelectedItems.size === 0}>
                        {iaSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><Check className="h-4 w-4 mr-1" /> Importar Selecionados</>}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
