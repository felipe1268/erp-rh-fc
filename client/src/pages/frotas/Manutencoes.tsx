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
import {
  Wrench, Plus, Pencil, Trash2, AlertTriangle, Search,
  ChevronLeft, ChevronRight, Send, Undo2, DollarSign,
  CheckCircle2, Loader2, ScanLine, FileUp, Eye, X, Check,
  Sparkles, Upload,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
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

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function Manutencoes() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const now = new Date();
  const [anoAtual, setAnoAtual] = useState(now.getFullYear());
  const [mesAtual, setMesAtual] = useState(now.getMonth() + 1);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveObs, setApproveObs] = useState("");
  const [osDialogOpen, setOsDialogOpen] = useState(false);
  const [osFile, setOsFile] = useState<File | null>(null);
  const [osPreview, setOsPreview] = useState<string | null>(null);
  const [osParsed, setOsParsed] = useState<any>(null);
  const [osSelectedItems, setOsSelectedItems] = useState<Record<number, boolean>>({});
  const [osSaving, setOsSaving] = useState(false);
  const osFileRef = useRef<HTMLInputElement>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const manut = trpc.frotas.listMaintenances.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const monthSummary = trpc.frotas.getMaintenanceMonthSummary.useQuery(
    { companyId: cId, mes: mesAtual, ano: anoAtual },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createMaintenance.useMutation({
    onSuccess: () => { manut.refetch(); monthSummary.refetch(); setDialogOpen(false); toast.success("Manutenção registrada"); },
  });
  const updateMut = trpc.frotas.updateMaintenance.useMutation({
    onSuccess: () => { manut.refetch(); monthSummary.refetch(); setDialogOpen(false); toast.success("Manutenção atualizada"); },
  });
  const deleteMut = trpc.frotas.deleteMaintenance.useMutation({
    onSuccess: () => { manut.refetch(); monthSummary.refetch(); toast.success("Manutenção excluída"); },
  });
  const approveMut = trpc.frotas.approveMaintenanceMonth.useMutation({
    onSuccess: (r) => {
      toast.success(`Aprovado! Lançamento financeiro #${r.financialEntryId} criado — ${fmt(r.custoTotal)} (${r.qtdManutencoes} OS)`);
      monthSummary.refetch();
      manut.refetch();
      setApproveDialogOpen(false);
      setApproveObs("");
    },
    onError: (e) => toast.error(e.message),
  });
  const revertMut = trpc.frotas.revertMaintenanceApproval.useMutation({
    onSuccess: () => {
      toast.success("Aprovação revertida — lançamento financeiro cancelado.");
      monthSummary.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const parseMut = trpc.frotas.parseMaintenanceOS.useMutation();

  const handleOsFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Envie JPG, PNG, WebP ou PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 10MB).");
      return;
    }

    setOsFile(file);
    setOsParsed(null);
    setOsSelectedItems({});

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setOsPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setOsPreview(null);
    }
  }, []);

  async function processOS() {
    if (!osFile) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      try {
        const result = await parseMut.mutateAsync({
          companyId: cId,
          base64,
          mimeType: osFile.type,
        });
        setOsParsed(result);
        if (result.items?.length > 0) {
          const sel: Record<number, boolean> = {};
          result.items.forEach((_: any, i: number) => { sel[i] = true; });
          setOsSelectedItems(sel);
        }
      } catch (err: any) {
        toast.error(err.message || "Erro ao processar OS");
      }
    };
    reader.readAsDataURL(osFile);
  }

  async function saveOSItems() {
    if (!osParsed?.items?.length) return;
    setOsSaving(true);
    let saved = 0;
    let failed = 0;
    const selected = Object.entries(osSelectedItems).filter(([, v]) => v).map(([k]) => parseInt(k));
    for (const i of selected) {
      const item = osParsed.items[i];
      if (!item.vehicleId) {
        toast.error(`Item ${i + 1}: veículo não identificado — pulando.`);
        failed++;
        continue;
      }
      try {
        await createMut.mutateAsync({
          companyId: cId,
          vehicleId: item.vehicleId,
          tipo: item.tipo || "corretiva",
          descricao: item.descricao || "Manutenção importada via OS",
          custo: String(item.custo || 0),
          kmNaManutencao: item.kmNaManutencao ? String(item.kmNaManutencao) : undefined,
          fornecedor: item.fornecedor || undefined,
          dataManutencao: item.dataManutencao || new Date().toISOString().slice(0, 10),
          status: "realizada",
          observacoes: item.observacoes || undefined,
          criadoPor: user?.name,
        });
        saved++;
      } catch (err: any) {
        failed++;
        toast.error(`Item ${i + 1} falhou: ${err.message || "Erro"}`);
      }
    }
    if (saved > 0) {
      toast.success(`${saved} manutenção(ões) importada(s)${failed > 0 ? ` (${failed} falha(s))` : ""}`);
      manut.refetch();
      monthSummary.refetch();
      if (failed === 0) {
        setOsDialogOpen(false);
        setOsFile(null);
        setOsPreview(null);
        setOsParsed(null);
        setOsSelectedItems({});
      }
    } else if (failed > 0) {
      toast.error(`Nenhum item importado (${failed} falha(s)).`);
    }
    setOsSaving(false);
  }

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

  const allRecords = manut.data || [];
  const mesRef = `${anoAtual}-${String(mesAtual).padStart(2, "0")}`;

  const mesesComDados = (() => {
    const map: Record<number, number> = {};
    allRecords.forEach((r: any) => {
      if (r.data_manutencao) {
        const [y, m] = r.data_manutencao.split('-');
        if (parseInt(y) === anoAtual) {
          const mi = parseInt(m);
          map[mi] = (map[mi] || 0) + 1;
        }
      }
    });
    return map;
  })();

  const list = allRecords.filter((r: any) => {
    if (r.data_manutencao && !r.data_manutencao.startsWith(mesRef)) return false;
    if (filterTipo !== "all" && r.tipo !== filterTipo) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(
        (r.descricao || "").toLowerCase().includes(s) ||
        (r.placa || "").toLowerCase().includes(s) ||
        (r.modelo || "").toLowerCase().includes(s) ||
        (r.fornecedor || "").toLowerCase().includes(s)
      )) return false;
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const summary = monthSummary.data;
  const isApproved = summary?.approved;

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-600" /> Manutenções
          </h1>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950" onClick={() => { setOsDialogOpen(true); setOsFile(null); setOsPreview(null); setOsParsed(null); setOsSelectedItems({}); }}>
              <ScanLine className="h-4 w-4 mr-1" /> Importar OS (IA)
            </Button>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Manutenção</Button>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnoAtual(anoAtual - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-bold min-w-[50px] text-center">{anoAtual}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnoAtual(anoAtual + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Com dados</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-muted inline-block border" /> Sem dados</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-1">
            {MESES_ABREV.map((m, i) => {
              const mes = i + 1;
              const isSelected = mesAtual === mes;
              const hasData = !!mesesComDados[mes];
              const count = mesesComDados[mes] || 0;
              return (
                <button
                  key={m}
                  onClick={() => setMesAtual(mes)}
                  className={`relative rounded-lg py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-orange-600 text-white shadow-md ring-2 ring-orange-300"
                      : hasData
                        ? "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-900/60"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                  {hasData && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{count > 99 ? "99+" : count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {summary && (summary.qtd > 0 || isApproved) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-orange-700">{summary.qtd}</p>
                <p className="text-xs text-orange-600">Manutenções</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950 border-green-200">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-green-700">{fmt(summary.total)}</p>
                <p className="text-xs text-green-600">Custo Total</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{summary.preventivas}</p>
                <p className="text-xs text-blue-600">Preventivas</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{summary.corretivas}</p>
                <p className="text-xs text-amber-600">Corretivas</p>
              </CardContent>
            </Card>
            <Card className={`${isApproved ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300" : "bg-slate-50 dark:bg-slate-950 border-slate-200"}`}>
              <CardContent className="p-3 text-center">
                {isApproved ? (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm font-bold text-emerald-700">Aprovado</p>
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-0.5">#{summary.financialEntryId} · {summary.financialStatus}</p>
                    <Button
                      variant="ghost" size="sm"
                      className="mt-1 h-6 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                      onClick={() => {
                        if (confirm("Reverter aprovação e cancelar lançamento financeiro?")) {
                          revertMut.mutate({ companyId: cId, financialEntryId: summary.financialEntryId! });
                        }
                      }}
                      disabled={revertMut.isPending}
                    >
                      <Undo2 className="h-3 w-3 mr-1" /> Reverter
                    </Button>
                  </>
                ) : summary.total > 0 ? (
                  <>
                    <p className="text-sm font-semibold text-slate-600">Pendente</p>
                    <Button
                      size="sm"
                      className="mt-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setApproveDialogOpen(true)}
                    >
                      <Send className="h-3 w-3 mr-1" /> Aprovar e Enviar
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem custo</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar descrição, placa, fornecedor..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={filterVehicle} onValueChange={setFilterVehicle}>
              <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Veículo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os veículos</SelectItem>
                {(vehicles.data || []).map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="preventiva">Preventiva</SelectItem>
                <SelectItem value="corretiva">Corretiva</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="realizada">Realizada</SelectItem>
                <SelectItem value="agendada">Agendada</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {manut.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-orange-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma manutenção encontrada neste mês</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Veículo</th>
                  <th className="text-left p-3 font-medium">Tipo</th>
                  <th className="text-left p-3 font-medium">Descrição</th>
                  <th className="text-left p-3 font-medium">Custo</th>
                  <th className="text-left p-3 font-medium">KM</th>
                  <th className="text-left p-3 font-medium">Fornecedor</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Próxima</th>
                  <th className="text-right p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m: any) => {
                  const atrasada = m.status === "agendada" && m.data_proxima && m.data_proxima < today;
                  return (
                    <tr key={m.id} className={`border-t hover:bg-muted/30 ${atrasada ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <td className="p-3 whitespace-nowrap">{m.data_manutencao ? m.data_manutencao.split('-').reverse().join('/') : "—"}</td>
                      <td className="p-3">
                        <span className="font-mono text-xs">{m.placa || "—"}</span>{" "}
                        <span className="text-muted-foreground text-xs">{m.modelo}</span>
                      </td>
                      <td className="p-3"><Badge variant={m.tipo === "preventiva" ? "outline" : "secondary"} className="text-[10px]">{m.tipo}</Badge></td>
                      <td className="p-3 max-w-[220px] truncate" title={m.descricao}>{m.descricao}</td>
                      <td className="p-3 font-medium">{fmt(m.custo)}</td>
                      <td className="p-3 text-xs">{m.km_na_manutencao ? parseFloat(m.km_na_manutencao).toLocaleString("pt-BR") : "—"}</td>
                      <td className="p-3 text-xs max-w-[180px] truncate" title={m.fornecedor}>{m.fornecedor || "—"}</td>
                      <td className="p-3">
                        <Badge variant={STATUS_MAP[m.status]?.variant || "secondary"} className="text-[10px]">
                          {atrasada && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {STATUS_MAP[m.status]?.label || m.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">{m.data_proxima ? m.data_proxima.split('-').reverse().join('/') : "—"}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Excluir esta manutenção?")) deleteMut.mutate({ id: m.id, companyId: cId }); }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {list.length > 0 && (
                <tfoot className="bg-muted/30 border-t-2">
                  <tr>
                    <td className="p-3 font-bold" colSpan={4}>Total do Mês ({list.length} registros)</td>
                    <td className="p-3 font-bold text-green-700">{fmt(list.reduce((s: number, m: any) => s + parseFloat(m.custo || "0"), 0))}</td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-600" />
                Aprovar e Enviar ao Financeiro
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  Será criado um lançamento de despesa no módulo Financeiro:
                </p>
                <div className="mt-2 space-y-1 text-sm text-emerald-700 dark:text-emerald-300">
                  <p><strong>Valor:</strong> {fmt(summary?.total || 0)}</p>
                  <p><strong>Manutenções:</strong> {summary?.qtd || 0} ({summary?.preventivas || 0} preventivas, {summary?.corretivas || 0} corretivas)</p>
                  <p><strong>Competência:</strong> {MESES_ABREV[mesAtual - 1]}/{anoAtual}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Observações (opcional)</Label>
                <Textarea className="mt-1" rows={3} value={approveObs} onChange={e => setApproveObs(e.target.value)} placeholder="Observações adicionais..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancelar</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => approveMut.mutate({ companyId: cId, mes: mesAtual, ano: anoAtual, observacoes: approveObs || undefined })}
                disabled={approveMut.isPending}
              >
                {approveMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                {approveMut.isPending ? "Processando..." : "Confirmar Aprovação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto p-0" resizable={false} showCloseButton={false}>
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
        <Dialog open={osDialogOpen} onOpenChange={setOsDialogOpen}>
          <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto p-0" resizable={false} showCloseButton={false}>
            <div className="sticky top-0 z-10 bg-background border-b px-6 py-4 flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-violet-600" />
                Importar OS com IA
              </DialogTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOsDialogOpen(false)}>Fechar</Button>
                {osParsed?.items?.length > 0 && (
                  <Button
                    className="bg-violet-600 hover:bg-violet-700"
                    onClick={saveOSItems}
                    disabled={osSaving || Object.values(osSelectedItems).filter(Boolean).length === 0}
                  >
                    {osSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                    {osSaving ? "Salvando..." : `Criar ${Object.values(osSelectedItems).filter(Boolean).length} Manutenção(ões)`}
                  </Button>
                )}
              </div>
            </div>

            <div className="px-6 py-4 max-w-6xl mx-auto w-full">
              {!osFile && (
                <div className="border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-2xl p-12 text-center">
                  <ScanLine className="h-16 w-16 mx-auto text-violet-400 mb-4" />
                  <h3 className="text-lg font-bold mb-2">Envie a foto ou PDF da Ordem de Serviço</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    A IA vai ler o documento, extrair automaticamente os dados (veículo, serviços, custos, fornecedor) e criar os lançamentos de manutenção.
                  </p>
                  <input
                    ref={osFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleOsFileChange}
                  />
                  <Button size="lg" className="bg-violet-600 hover:bg-violet-700" onClick={() => osFileRef.current?.click()}>
                    <Upload className="h-5 w-5 mr-2" /> Escolher Arquivo
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">JPG, PNG, WebP ou PDF — máx. 10MB</p>
                </div>
              )}

              {osFile && !osParsed && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 rounded-xl p-4">
                    <FileUp className="h-8 w-8 text-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{osFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(osFile.size / 1024).toFixed(0)} KB — {osFile.type}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setOsFile(null); setOsPreview(null); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {osPreview && (
                    <div className="border rounded-xl overflow-hidden bg-muted/30 max-h-[400px] flex items-center justify-center">
                      <img src={osPreview} alt="Preview da OS" className="max-h-[400px] object-contain" />
                    </div>
                  )}

                  <Button
                    size="lg"
                    className="w-full bg-violet-600 hover:bg-violet-700"
                    onClick={processOS}
                    disabled={parseMut.isPending}
                  >
                    {parseMut.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Analisando com IA... aguarde
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5 mr-2" />
                        Analisar com IA
                      </>
                    )}
                  </Button>
                </div>
              )}

              {osParsed && (
                <div className="space-y-4">
                  {osParsed.error && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded-xl p-4">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Erro: {osParsed.error}
                      </p>
                    </div>
                  )}

                  {osParsed.rawText && (
                    <div className="bg-muted/40 border rounded-xl p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Resumo Lido pela IA</p>
                      <p className="text-sm">{osParsed.rawText}</p>
                      {osParsed.confidence && (
                        <Badge variant={osParsed.confidence === "alta" ? "default" : osParsed.confidence === "media" ? "secondary" : "destructive"} className="mt-2 text-[10px]">
                          Confiança: {osParsed.confidence}
                        </Badge>
                      )}
                    </div>
                  )}

                  {osParsed.items?.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {osParsed.items.length} item(ns) encontrado(s) — selecione para importar
                      </h3>

                      {osParsed.items.map((item: any, idx: number) => {
                        const veh = (vehicles.data || []).find((v: any) => v.id === item.vehicleId);
                        return (
                          <div key={idx} className={`border rounded-xl p-4 transition-all ${osSelectedItems[idx] ? "border-violet-400 bg-violet-50/50 dark:bg-violet-950/30" : "border-muted opacity-60"}`}>
                            <div className="flex items-start gap-3">
                              <button
                                className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${osSelectedItems[idx] ? "bg-violet-600 border-violet-600 text-white" : "border-muted-foreground/30"}`}
                                onClick={() => setOsSelectedItems(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              >
                                {osSelectedItems[idx] && <Check className="h-3 w-3" />}
                              </button>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {veh ? `${veh.placa || veh.modelo} — ${veh.marca}` : item.vehiclePlaca || "Veículo não identificado"}
                                  </Badge>
                                  <Badge variant={item.tipo === "preventiva" ? "outline" : "secondary"} className="text-[10px]">{item.tipo}</Badge>
                                  {!item.vehicleId && <Badge variant="destructive" className="text-[10px]">Veículo não encontrado</Badge>}
                                </div>
                                <p className="text-sm font-medium">{item.descricao}</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  <div><span className="text-muted-foreground">Valor:</span> <strong className="text-emerald-700">{fmt(item.custo)}</strong></div>
                                  <div><span className="text-muted-foreground">Data:</span> {item.dataManutencao ? item.dataManutencao.split("-").reverse().join("/") : "—"}</div>
                                  <div><span className="text-muted-foreground">KM:</span> {item.kmNaManutencao ? parseFloat(item.kmNaManutencao).toLocaleString("pt-BR") : "—"}</div>
                                  <div><span className="text-muted-foreground">Fornecedor:</span> {item.fornecedor || "—"}</div>
                                </div>
                                {item.observacoes && <p className="text-xs text-muted-foreground">{item.observacoes}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setOsFile(null); setOsPreview(null); setOsParsed(null); setOsSelectedItems({}); }}>
                      <Upload className="h-4 w-4 mr-1" /> Enviar Outra OS
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
