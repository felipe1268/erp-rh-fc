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
import {
  Wrench, Plus, Pencil, Trash2, AlertTriangle, Search,
  ChevronLeft, ChevronRight, Send, Undo2, DollarSign,
  CheckCircle2, Loader2, ScanLine, FileUp, Eye, X, Check,
  Sparkles, Upload, Lock, Paperclip, Download, File,
  ShoppingCart, Link2, ExternalLink,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
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

  type MaintItem = { categoria: string; nome: string; quantidade: number; valorUnitario: number; valorTotal: number };
  const [maintItems, setMaintItems] = useState<MaintItem[]>([]);
  const [editingMaintId, setEditingMaintId] = useState<number | null>(null);
  const [viewMaint, setViewMaint] = useState<any>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const manut = trpc.frotas.listMaintenances.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const monthSummary = trpc.frotas.getMaintenanceMonthSummary.useQuery(
    { companyId: cId, mes: mesAtual, ano: anoAtual },
    { enabled: cId > 0 },
  );
  const consolidatedMonths = trpc.frotas.getConsolidatedMonthsYear.useQuery(
    { companyId: cId, ano: anoAtual },
    { enabled: cId > 0 },
  );
  const maintConsolidatedSet = new Set(consolidatedMonths.data?.manutencao || []);
  const viewItems = trpc.frotas.listMaintenanceItems.useQuery(
    { companyId: cId, maintenanceId: viewMaint?.id },
    { enabled: cId > 0 && !!viewMaint?.id },
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
      toast.success(`Consolidado! Lançamento financeiro #${r.financialEntryId} criado — ${fmt(r.custoTotal)} (${r.qtdManutencoes} OS)`);
      monthSummary.refetch();
      consolidatedMonths.refetch();
      manut.refetch();
      setApproveDialogOpen(false);
      setApproveObs("");
    },
    onError: (e) => toast.error(e.message),
  });
  const revertMut = trpc.frotas.revertMaintenanceApproval.useMutation({
    onSuccess: () => {
      toast.success("Consolidação revertida — lançamento financeiro cancelado.");
      monthSummary.refetch();
      consolidatedMonths.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const createPurchaseMut = trpc.frotas.createPurchaseFromMaintenance.useMutation({
    onSuccess: (r) => {
      toast.success(`Solicitação de Compra ${r.numeroSc} criada com ${r.qtdItens} item(ns)! Encaminhe ao setor de Compras.`);
      manut.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const parseMut = trpc.frotas.parseMaintenanceOS.useMutation();

  const maintItemsQuery = trpc.frotas.listMaintenanceItems.useQuery(
    { companyId: cId, maintenanceId: editingMaintId || 0 },
    { enabled: cId > 0 && !!editingMaintId },
  );
  const saveItemsMut = trpc.frotas.saveMaintenanceItems.useMutation({
    onSuccess: () => { manut.refetch(); toast.success("Itens salvos"); },
    onError: (e) => toast.error(e.message),
  });
  const uploadAttachMut = trpc.frotas.uploadMaintenanceAttachment.useMutation({
    onSuccess: () => { manut.refetch(); toast.success("Anexo enviado"); },
    onError: (e) => toast.error(e.message),
  });
  const removeAttachMut = trpc.frotas.removeMaintenanceAttachment.useMutation({
    onSuccess: () => { manut.refetch(); toast.success("Anexo removido"); },
    onError: (e) => toast.error(e.message),
  });

  const handleAttachUpload = useCallback(async (maintenanceId: number, files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: arquivo muito grande (máx 10MB)`); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1];
        uploadAttachMut.mutate({ companyId: cId, maintenanceId, fileName: file.name, fileData: b64, contentType: file.type });
      };
      reader.readAsDataURL(file);
    }
  }, [cId, uploadAttachMut]);

  useEffect(() => {
    if (maintItemsQuery.data && maintItemsQuery.data.length > 0) {
      setMaintItems(maintItemsQuery.data.map((i: any) => ({
        categoria: i.categoria,
        nome: i.nome,
        quantidade: parseFloat(i.quantidade || "1"),
        valorUnitario: parseFloat(i.valor_unitario || "0"),
        valorTotal: parseFloat(i.valor_total || "0"),
      })));
    }
  }, [maintItemsQuery.data]);

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
    setEditingMaintId(null);
    setMaintItems([]);
    setForm({ tipo: "corretiva", status: "realizada", dataManutencao: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  }

  function openEdit(m: any) {
    setEditing(m);
    setEditingMaintId(m.id);
    setMaintItems([]);
    setForm({
      vehicleId: m.vehicle_id, tipo: m.tipo, descricao: m.descricao, custo: m.custo,
      kmNaManutencao: m.km_na_manutencao, fornecedor: m.fornecedor,
      dataManutencao: m.data_manutencao, dataProxima: m.data_proxima,
      kmProxima: m.km_proxima, status: m.status, observacoes: m.observacoes,
    });
    setDialogOpen(true);
  }

  function addMaintItem() {
    setMaintItems(prev => [...prev, { categoria: "peca", nome: "", quantidade: 1, valorUnitario: 0, valorTotal: 0 }]);
  }

  function updateMaintItem(idx: number, field: string, val: any) {
    setMaintItems(prev => {
      const items = [...prev];
      const item = { ...items[idx], [field]: val };
      if (field === "quantidade" || field === "valorUnitario") {
        item.valorTotal = Number((item.quantidade * item.valorUnitario).toFixed(2));
      }
      items[idx] = item;
      const totalPecas = items.filter(i => i.categoria === "peca").reduce((s, i) => s + i.valorTotal, 0);
      const totalServico = items.filter(i => i.categoria === "servico").reduce((s, i) => s + i.valorTotal, 0);
      setForm((f: any) => ({ ...f, custo: (totalPecas + totalServico).toFixed(2) }));
      return items;
    });
  }

  function removeMaintItem(idx: number) {
    setMaintItems(prev => {
      const items = prev.filter((_, i) => i !== idx);
      const totalPecas = items.filter(i => i.categoria === "peca").reduce((s, i) => s + i.valorTotal, 0);
      const totalServico = items.filter(i => i.categoria === "servico").reduce((s, i) => s + i.valorTotal, 0);
      setForm((f: any) => ({ ...f, custo: (totalPecas + totalServico).toFixed(2) }));
      return items;
    });
  }

  function save() {
    if (!form.vehicleId || !form.descricao || !form.dataManutencao) {
      toast.error("Preencha veículo, descrição e data");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) {
      updateMut.mutate({ id: editing.id, ...payload }, {
        onSuccess: () => {
          if (maintItems.length > 0) {
            saveItemsMut.mutate({ companyId: cId, maintenanceId: editing.id, items: maintItems });
          }
        },
      });
    } else {
      createMut.mutate(payload, {
        onSuccess: (created: any) => {
          if (maintItems.length > 0 && created?.id) {
            saveItemsMut.mutate({ companyId: cId, maintenanceId: created.id, items: maintItems });
          }
        },
      });
    }
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f] dark:text-white">Manutenções</h1>
              <p className="text-xs text-muted-foreground">Gestão de ordens de serviço e manutenção da frota</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950 rounded-lg" onClick={() => { setOsDialogOpen(true); setOsFile(null); setOsPreview(null); setOsParsed(null); setOsSelectedItems({}); }}>
              <ScanLine className="h-4 w-4 mr-1" /> Importar OS (IA)
            </Button>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white shadow-md rounded-lg" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Manutenção</Button>
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
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Consolidado</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-muted inline-block border" /> Sem dados</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-1">
            {MESES_ABREV.map((m, i) => {
              const mes = i + 1;
              const isSelected = mesAtual === mes;
              const hasData = !!mesesComDados[mes];
              const count = mesesComDados[mes] || 0;
              const isConsolidated = maintConsolidatedSet.has(mes);
              return (
                <button
                  key={m}
                  onClick={() => setMesAtual(mes)}
                  className={`relative rounded-lg py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? isConsolidated
                        ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                        : "bg-orange-600 text-white shadow-md ring-2 ring-orange-300"
                      : isConsolidated
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
                        : hasData
                          ? "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-900/60"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                  {isConsolidated && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center">✓</span>
                  )}
                  {hasData && !isConsolidated && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{count > 99 ? "99+" : count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {summary && (summary.qtd > 0 || isApproved) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 border-orange-200 dark:border-orange-800 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-12 h-12 bg-orange-500/10 rounded-bl-3xl" />
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-extrabold text-orange-600 dark:text-orange-400">{summary.qtd}</p>
                <p className="text-xs font-semibold text-orange-500/80 mt-0.5 uppercase tracking-wide">Manutenções</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950 dark:to-green-950 border-emerald-200 dark:border-emerald-800 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/10 rounded-bl-3xl" />
              <CardContent className="p-4 text-center">
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{fmt(summary.total)}</p>
                <p className="text-xs font-semibold text-emerald-500/80 mt-0.5 uppercase tracking-wide">Custo Total</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-12 h-12 bg-blue-500/10 rounded-bl-3xl" />
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">{summary.preventivas}</p>
                <p className="text-xs font-semibold text-blue-500/80 mt-0.5 uppercase tracking-wide">Preventivas</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border-amber-200 dark:border-amber-800 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-12 h-12 bg-amber-500/10 rounded-bl-3xl" />
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{summary.corretivas}</p>
                <p className="text-xs font-semibold text-amber-500/80 mt-0.5 uppercase tracking-wide">Corretivas</p>
              </CardContent>
            </Card>
            <Card className={`shadow-sm overflow-hidden relative ${isApproved ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-300 dark:border-emerald-800" : "bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950 border-slate-200 dark:border-slate-700"}`}>
              <div className={`absolute top-0 right-0 w-12 h-12 rounded-bl-3xl ${isApproved ? "bg-emerald-500/10" : "bg-slate-500/10"}`} />
              <CardContent className="p-4 text-center">
                {isApproved ? (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm font-bold text-emerald-700">Consolidado</p>
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-0.5">#{summary.financialEntryId} · {summary.financialStatus}</p>
                    <Button
                      variant="ghost" size="sm"
                      className="mt-1 h-6 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                      onClick={() => {
                        if (confirm("Reverter consolidação e cancelar lançamento financeiro?")) {
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
                      <Lock className="h-3 w-3 mr-1" /> Consolidar
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
          <Card className="border-dashed"><CardContent className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-950 mx-auto mb-3 flex items-center justify-center">
              <Wrench className="h-7 w-7 text-orange-400" />
            </div>
            <p className="font-medium text-slate-600 dark:text-slate-300">Nenhuma manutenção encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">Nenhum registro para este mês com os filtros aplicados</p>
          </CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-card">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282]">
                <tr>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Data</th>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Veículo</th>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Tipo</th>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Descrição</th>
                  <th className="text-right p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Custo</th>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">KM</th>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Fornecedor</th>
                  <th className="text-center p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Status</th>
                  <th className="text-left p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Próxima</th>
                  <th className="text-right p-3 font-semibold text-xs text-white/90 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {list.map((m: any, idx: number) => {
                  const atrasada = m.status === "agendada" && m.data_proxima && m.data_proxima < today;
                  const custo = parseFloat(m.custo || "0");
                  const maxCusto = Math.max(...list.map((x: any) => parseFloat(x.custo || "0")), 1);
                  return (
                    <tr key={m.id} className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors cursor-pointer ${atrasada ? "bg-red-50/60 dark:bg-red-950/20" : idx % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/20"}`} onClick={() => setViewMaint(m)}>
                      <td className="p-3 whitespace-nowrap font-medium">{m.data_manutencao ? m.data_manutencao.split('-').reverse().join('/') : "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-[#1e3a5f] dark:text-blue-300">{m.placa || "—"}</span>
                          <span className="text-muted-foreground text-[11px]">{m.modelo} {m.marca ? `· ${m.marca}` : ""}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={`text-[10px] font-semibold ${m.tipo === "preventiva" ? "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300" : "bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300"}`}>
                          {m.tipo === "preventiva" ? "Preventiva" : "Corretiva"}
                        </Badge>
                      </td>
                      <td className="p-3 max-w-[220px]">
                        <span className="truncate block font-medium text-sm" title={m.descricao}>
                          {m.descricao}
                          {(m.anexos as any[])?.length > 0 && <Paperclip className="inline h-3 w-3 ml-1.5 text-blue-500" />}
                        </span>
                        {parseInt(m.items_count) > 0 && (
                          <span className="text-[10px] text-muted-foreground mt-0.5 block">
                            {m.items_count} itens <span className="text-blue-500">Peças {fmt(m.total_pecas)}</span> <span className="text-orange-500">Serviço {fmt(m.total_servico)}</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(custo)}</span>
                          <div className="w-16 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                            <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${(custo / maxCusto) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-xs tabular-nums">{m.km_na_manutencao ? parseFloat(m.km_na_manutencao).toLocaleString("pt-BR") : "—"}</td>
                      <td className="p-3 text-xs max-w-[180px] truncate text-muted-foreground" title={m.fornecedor}>{m.fornecedor || "—"}</td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] font-semibold ${
                          m.status === "realizada" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300" :
                          m.status === "em_andamento" ? "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300" :
                          m.status === "agendada" ? "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300" :
                          "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300"
                        }`}>
                          {atrasada && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {STATUS_MAP[m.status]?.label || m.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">{m.data_proxima ? m.data_proxima.split('-').reverse().join('/') : "—"}</td>
                      <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {m.sc_numero ? (
                          <span className="inline-flex items-center gap-0.5 mr-1">
                            <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 bg-violet-50 dark:bg-violet-950 dark:text-violet-300">
                              <Link2 className="h-3 w-3 mr-0.5" />{m.sc_numero}
                            </Badge>
                            {m.oc_numero && (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300">
                                <ShoppingCart className="h-3 w-3 mr-0.5" />{m.oc_numero}
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950"
                            title="Solicitar Compra"
                            onClick={() => {
                              if (confirm(`Criar Solicitação de Compra para esta manutenção?\n${m.placa} — ${m.descricao || m.modelo}`)) {
                                createPurchaseMut.mutate({ companyId: cId, maintenanceId: m.id });
                              }
                            }}
                            disabled={createPurchaseMut.isPending}
                          >
                            <ShoppingCart className="h-3.5 w-3.5 text-violet-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5 text-slate-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-950" onClick={() => { if (confirm("Excluir esta manutenção?")) deleteMut.mutate({ id: m.id, companyId: cId }); }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {list.length > 0 && (
                <tfoot className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-t-2 border-emerald-200 dark:border-emerald-800">
                  <tr>
                    <td className="p-3 font-bold text-[#1e3a5f] dark:text-blue-300" colSpan={4}>Total do Mês ({list.length} registros)</td>
                    <td className="p-3 font-bold text-lg text-emerald-700 dark:text-emerald-400 text-right">{fmt(list.reduce((s: number, m: any) => s + parseFloat(m.custo || "0"), 0))}</td>
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
                <Lock className="h-5 w-5 text-emerald-600" />
                Consolidar Mês e Enviar ao Financeiro
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
                {approveMut.isPending ? "Processando..." : "Confirmar Consolidação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto p-0" resizable={false} showCloseButton={false}>
            <div className="sticky top-0 z-10 bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] border-b px-6 py-4 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <Wrench className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">{editing ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle>
                  <p className="text-xs text-blue-200/80">{editing ? `OS #${editing.id}` : "Registrar nova ordem de serviço"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg" onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><Check className="h-4 w-4 mr-1" /> Salvar</>}
                </Button>
              </div>
            </div>

            <div className="px-6 py-6 max-w-5xl mx-auto w-full space-y-6 bg-gradient-to-b from-slate-50/50 to-transparent dark:from-slate-900/30">
              <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-5 rounded-full bg-[#1e3a5f]" />
                  <h3 className="text-sm font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Dados da Manutenção</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4">
                  <div className="col-span-2 md:col-span-1">
                    <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Veículo *</Label>
                    <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                      <SelectTrigger className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(vehicles.data || []).map((v: any) => (
                          <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} - {v.marca}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Tipo</Label>
                    <Select value={form.tipo || "corretiva"} onValueChange={v => setForm({ ...form, tipo: v })}>
                      <SelectTrigger className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preventiva">Preventiva</SelectItem>
                        <SelectItem value="corretiva">Corretiva</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Data *</Label>
                    <Input className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" type="date" value={form.dataManutencao || ""} onChange={e => setForm({ ...form, dataManutencao: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Custo (R$)</Label>
                    <MoneyInput className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 font-semibold text-emerald-700 dark:text-emerald-400" value={form.custo} onChange={v => setForm({ ...form, custo: v })} />
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Descrição *</Label>
                  <Input className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Troca tubo S, anel pressão, montagem/desmontagem e ajuste" />
                </div>
              </div>

              <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-5 rounded-full bg-orange-500" />
                    <h3 className="text-sm font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Peças e Serviços</h3>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950" onClick={addMaintItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Item
                  </Button>
                </div>
                {maintItems.length > 0 ? (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-semibold text-xs text-slate-500 dark:text-slate-400 w-28">Categoria</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-xs text-slate-500 dark:text-slate-400">Descrição do Item</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-xs text-slate-500 dark:text-slate-400 w-20">Qtd</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-xs text-slate-500 dark:text-slate-400 w-28">Valor Unit.</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-xs text-slate-500 dark:text-slate-400 w-28">Valor Total</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {maintItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                            <td className="px-2 py-2">
                              <Select value={item.categoria} onValueChange={v => updateMaintItem(idx, "categoria", v)}>
                                <SelectTrigger className="h-9 text-xs border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="peca">Peça</SelectItem>
                                  <SelectItem value="servico">Serviço</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-2">
                              <Input className="h-9 text-sm border-slate-200 dark:border-slate-700" placeholder="Ex: Retentor comando" value={item.nome} onChange={e => updateMaintItem(idx, "nome", e.target.value)} />
                            </td>
                            <td className="px-2 py-2">
                              <Input className="h-9 text-sm text-center border-slate-200 dark:border-slate-700" type="number" min="0.01" step="0.01" value={item.quantidade || ""} onChange={e => updateMaintItem(idx, "quantidade", parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-2 py-2">
                              <MoneyInput className="h-9 text-sm text-right border-slate-200 dark:border-slate-700" value={item.valorUnitario} onChange={v => updateMaintItem(idx, "valorUnitario", parseFloat(v) || 0)} />
                            </td>
                            <td className="px-2 py-2 text-right font-bold text-sm text-emerald-700 dark:text-emerald-400">
                              {fmt(item.valorTotal)}
                            </td>
                            <td className="px-1 py-2">
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg" onClick={() => removeMaintItem(idx)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-t-2 border-emerald-200 dark:border-emerald-800">
                        <tr>
                          <td colSpan={4} className="px-3 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full bg-blue-400" /> Peças: {fmt(maintItems.filter(i => i.categoria === "peca").reduce((s, i) => s + i.valorTotal, 0))}</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Serviço: {fmt(maintItems.filter(i => i.categoria === "servico").reduce((s, i) => s + i.valorTotal, 0))}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-base text-emerald-700 dark:text-emerald-400">
                            {fmt(maintItems.reduce((s, i) => s + i.valorTotal, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950 mx-auto mb-3 flex items-center justify-center">
                      <Wrench className="h-6 w-6 text-orange-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhum item adicionado</p>
                    <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar Item" para registrar peças e serviços utilizados</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-5 rounded-full bg-blue-500" />
                    <h3 className="text-sm font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Detalhes</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">KM na Manutenção</Label>
                      <Input className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" type="number" value={form.kmNaManutencao || ""} onChange={e => setForm({ ...form, kmNaManutencao: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Fornecedor</Label>
                      <Input className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" value={form.fornecedor || ""} onChange={e => setForm({ ...form, fornecedor: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Status</Label>
                      <Select value={form.status || "realizada"} onValueChange={v => setForm({ ...form, status: v })}>
                        <SelectTrigger className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"><SelectValue /></SelectTrigger>
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

                <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-5 rounded-full bg-amber-500" />
                    <h3 className="text-sm font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Próxima Manutenção</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Data Próxima</Label>
                      <Input className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" type="date" value={form.dataProxima || ""} onChange={e => setForm({ ...form, dataProxima: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">KM Próxima</Label>
                      <Input className="h-10 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" type="number" value={form.kmProxima || ""} onChange={e => setForm({ ...form, kmProxima: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-5 rounded-full bg-slate-400" />
                  <h3 className="text-sm font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Observações</h3>
                </div>
                <Textarea className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50" rows={3} value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Notas adicionais sobre a manutenção..." />
              </div>

              {editingMaintId && (
                <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-5 rounded-full bg-violet-500" />
                    <h3 className="text-sm font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide flex items-center gap-2">
                      <Paperclip className="h-4 w-4" /> Anexos
                    </h3>
                  </div>
                  {(() => {
                    const currentMaint = manut.data?.find((m: any) => m.id === editingMaintId);
                    const anexos = (currentMaint?.anexos || []) as any[];
                    return (
                      <div className="space-y-2">
                        {anexos.length > 0 && (
                          <div className="space-y-1.5">
                            {anexos.map((a: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/20 dark:to-slate-900/30 rounded-lg px-4 py-2.5 text-sm border border-blue-100 dark:border-blue-900/30">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                                  <File className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className="truncate flex-1 font-medium" title={a.nome}>{a.nome}</span>
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {a.tamanho ? (a.tamanho / 1024 < 1024 ? `${(a.tamanho / 1024).toFixed(0)} KB` : `${(a.tamanho / 1024 / 1024).toFixed(1)} MB`) : ''}
                                </span>
                                <a href={a.url} target="_blank" rel="noopener noreferrer" title="Baixar">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30"><Download className="h-3.5 w-3.5 text-blue-600" /></Button>
                                </a>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                  onClick={() => { if (confirm("Remover este anexo?")) removeAttachMut.mutate({ companyId: cId, maintenanceId: editingMaintId, key: a.key }); }}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="flex items-center gap-3 cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl px-5 py-4 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:border-blue-400 dark:hover:border-blue-600 transition-all group">
                          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                            <Upload className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {uploadAttachMut.isPending ? "Enviando..." : "Clique para anexar arquivo"}
                            </span>
                            <p className="text-xs text-muted-foreground">PDF, imagem, doc (máx. 10MB)</p>
                          </div>
                          <input type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xls,.xlsx"
                            onChange={e => { if (e.target.files?.length) handleAttachUpload(editingMaintId, e.target.files); e.target.value = ""; }}
                            disabled={uploadAttachMut.isPending} />
                        </label>
                      </div>
                    );
                  })()}
                </div>
              )}
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

        <Dialog open={!!viewMaint} onOpenChange={(open) => { if (!open) setViewMaint(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            {viewMaint && (() => {
              const m = viewMaint;
              const items = (viewItems.data || []) as any[];
              const pecas = items.filter((i: any) => i.categoria === "peca");
              const servicos = items.filter((i: any) => i.categoria === "servico");
              const totalPecas = pecas.reduce((s: number, i: any) => s + parseFloat(i.valor_total || i.valorTotal || "0"), 0);
              const totalServico = servicos.reduce((s: number, i: any) => s + parseFloat(i.valor_total || i.valorTotal || "0"), 0);
              const anexos = (m.anexos || []) as any[];
              const atrasada = m.status === "agendada" && m.data_proxima && m.data_proxima < new Date().toISOString().split("T")[0];
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-orange-500" />
                      <span>Detalhes da Manutenção</span>
                      <Badge className={`ml-2 text-[10px] font-semibold ${m.tipo === "preventiva" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                        {m.tipo === "preventiva" ? "Preventiva" : "Corretiva"}
                      </Badge>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Veículo</p>
                        <p className="font-mono font-bold text-[#1e3a5f] dark:text-blue-300">{m.placa || "—"}</p>
                        <p className="text-xs text-muted-foreground">{m.modelo} {m.marca ? `· ${m.marca}` : ""}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
                        <Badge className={`mt-1 text-xs font-semibold ${
                          m.status === "realizada" ? "bg-emerald-100 text-emerald-700" :
                          m.status === "em_andamento" ? "bg-amber-100 text-amber-700" :
                          m.status === "agendada" ? "bg-blue-100 text-blue-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {atrasada && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {STATUS_MAP[m.status]?.label || m.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Data</p>
                        <p className="font-medium text-sm">{m.data_manutencao ? m.data_manutencao.split("-").reverse().join("/") : "—"}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">KM</p>
                        <p className="font-medium text-sm">{m.km_na_manutencao ? parseFloat(m.km_na_manutencao).toLocaleString("pt-BR") : "—"}</p>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Custo Total</p>
                        <p className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(m.custo)}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Descrição</p>
                      <p className="text-sm">{m.descricao || "—"}</p>
                    </div>

                    {m.fornecedor && (
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Fornecedor</p>
                        <p className="text-sm font-medium">{m.fornecedor}</p>
                      </div>
                    )}

                    {m.observacoes && (
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Observações</p>
                        <p className="text-sm">{m.observacoes}</p>
                      </div>
                    )}

                    {(m.data_proxima || m.km_proxima) && (
                      <div className="grid grid-cols-2 gap-3">
                        {m.data_proxima && (
                          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Próxima Manutenção</p>
                            <p className="font-medium text-sm">{m.data_proxima.split("-").reverse().join("/")}</p>
                          </div>
                        )}
                        {m.km_proxima && (
                          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">KM Próxima</p>
                            <p className="font-medium text-sm">{parseFloat(m.km_proxima).toLocaleString("pt-BR")}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {(m.sc_numero || m.oc_numero) && (
                      <div className="flex items-center gap-2">
                        {m.sc_numero && (
                          <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 bg-violet-50">
                            <Link2 className="h-3 w-3 mr-1" />SC {m.sc_numero}
                          </Badge>
                        )}
                        {m.oc_numero && (
                          <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50">
                            <ShoppingCart className="h-3 w-3 mr-1" />OC {m.oc_numero}
                          </Badge>
                        )}
                      </div>
                    )}

                    {items.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[#1e3a5f] dark:text-blue-300 mb-2">Itens ({items.length})</p>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800">
                              <tr>
                                <th className="p-2 text-left font-medium">Tipo</th>
                                <th className="p-2 text-left font-medium">Descrição</th>
                                <th className="p-2 text-right font-medium">Qtd</th>
                                <th className="p-2 text-right font-medium">Unit.</th>
                                <th className="p-2 text-right font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item: any, idx: number) => (
                                <tr key={idx} className={idx % 2 === 0 ? "" : "bg-slate-50 dark:bg-slate-900/30"}>
                                  <td className="p-2">
                                    <Badge className={`text-[10px] ${item.categoria === "peca" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                                      {item.categoria === "peca" ? "Peça" : "Serviço"}
                                    </Badge>
                                  </td>
                                  <td className="p-2 font-medium">{item.nome}</td>
                                  <td className="p-2 text-right tabular-nums">{item.quantidade}</td>
                                  <td className="p-2 text-right tabular-nums">{fmt(item.valor_unitario || item.valorUnitario)}</td>
                                  <td className="p-2 text-right tabular-nums font-medium">{fmt(item.valor_total || item.valorTotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100 dark:bg-slate-800 font-semibold">
                              <tr>
                                <td colSpan={4} className="p-2 text-right">Peças: {fmt(totalPecas)} · Serviço: {fmt(totalServico)}</td>
                                <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">{fmt(totalPecas + totalServico)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {anexos.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[#1e3a5f] dark:text-blue-300 mb-2">
                          <Paperclip className="inline h-3.5 w-3.5 mr-1" />Anexos ({anexos.length})
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {anexos.map((a: any, idx: number) => (
                            <a key={idx} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 border rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                              <File className="h-4 w-4 text-blue-500 shrink-0" />
                              <span className="text-xs truncate">{a.nome || a.name || `Anexo ${idx + 1}`}</span>
                              <Download className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="gap-2 pt-2">
                    <Button variant="outline" onClick={() => setViewMaint(null)}>
                      Fechar
                    </Button>
                    <Button onClick={() => { setViewMaint(null); openEdit(m); }}>
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
