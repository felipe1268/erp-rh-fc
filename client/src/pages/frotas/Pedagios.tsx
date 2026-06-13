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
import { Progress } from "@/components/ui/progress";
import {
  Milestone, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2, Sparkles, FileUp, Eye, X, Check, DollarSign, AlertTriangle, Car,
  FileSpreadsheet, Upload, CheckCheck, AlertCircle, Lock,
  Lightbulb, MapPin, FileText, Wand2,
} from "lucide-react";
import { nomeDiaSemana, feriadoNacional, dataBR } from "@shared/feriados";
import { useState, useRef, useCallback, useEffect } from "react";
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
  const pdfFileRef = useRef<HTMLInputElement>(null);

  const [clearMonthDialogOpen, setClearMonthDialogOpen] = useState(false);
  const [clearMonthPassword, setClearMonthPassword] = useState("");
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [clearAllPassword, setClearAllPassword] = useState("");

  const [excelDialogOpen, setExcelDialogOpen] = useState(false);
  const [excelFiles, setExcelFiles] = useState<File[]>([]);
  const [excelParsed, setExcelParsed] = useState<any>(null);
  const [excelSelectedItems, setExcelSelectedItems] = useState<Set<number>>(new Set());
  const [excelSaving, setExcelSaving] = useState(false);
  const [excelProgress, setExcelProgress] = useState(0);
  const [excelStage, setExcelStage] = useState<"idle" | "reading" | "parsing" | "matching" | "done" | "saving">("idle");
  const [excelFileProgress, setExcelFileProgress] = useState("");
  const excelFileRef = useRef<HTMLInputElement>(null);

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
  const parseExcelMut = trpc.frotas.parseTollExcel.useMutation();
  const clearMonthMut = trpc.frotas.clearTollMonth.useMutation({
    onSuccess: (data) => { tolls.refetch(); setClearMonthDialogOpen(false); setClearMonthPassword(""); toast.success(`${data.deleted} lançamento(s) excluído(s)`); },
    onError: (err) => toast.error(err.message),
  });
  const clearAllMut = trpc.frotas.clearAllTollRecords.useMutation({
    onSuccess: (data) => { tolls.refetch(); setClearAllDialogOpen(false); setClearAllPassword(""); toast.success(`${data.deleted} lançamento(s) excluído(s) de todos os meses`); },
    onError: (err) => toast.error(err.message),
  });

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
    if (file.size > 15 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 15MB)."); return; }
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

  const handleExcelFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext || "")) {
        toast.error(`Formato inválido: ${file.name}. Use .xlsx, .xls ou .csv`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} muito grande (máx 20MB).`); continue; }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;
    setExcelFiles(validFiles);
    setExcelParsed(null);
    setExcelSelectedItems(new Set());
    setExcelProgress(0);
    setExcelStage("idle");
    setExcelFileProgress("");
    setExcelDialogOpen(true);
    e.target.value = "";
  }, []);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error(`Erro ao ler ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  const processExcel = useCallback(async () => {
    if (excelFiles.length === 0) return;
    setExcelStage("reading");
    setExcelProgress(0);

    try {
      const allItems: any[] = [];
      const totalFiles = excelFiles.length;

      for (let f = 0; f < totalFiles; f++) {
        const file = excelFiles[f];
        setExcelFileProgress(`Arquivo ${f + 1} de ${totalFiles}: ${file.name}`);
        setExcelStage("reading");
        setExcelProgress(Math.round((f / totalFiles) * 80));

        const b64 = await readFileAsBase64(file);

        setExcelStage("matching");
        setExcelProgress(Math.round(((f + 0.5) / totalFiles) * 80));

        const result = await parseExcelMut.mutateAsync({
          companyId: cId,
          base64: b64,
        });

        if (result.items?.length) {
          for (const item of result.items) {
            allItems.push({ ...item, _arquivo: file.name });
          }
        }
      }

      const totalValor = allItems.reduce((s: number, it: any) => s + it.valor, 0);
      const matched = allItems.filter((it: any) => it.matched).length;
      const unmatched = allItems.filter((it: any) => !it.matched).length;
      const placasNaoEncontradas = [...new Set(allItems.filter((it: any) => !it.matched).map((it: any) => it.vehiclePlaca))];

      const merged = {
        items: allItems,
        summary: { total: allItems.length, matched, unmatched, totalValor, placasNaoEncontradas },
      };

      setExcelParsed(merged);
      const validIndices = new Set<number>();
      allItems.forEach((it: any, i: number) => { if (it.matched) validIndices.add(i); });
      setExcelSelectedItems(validIndices);

      setExcelStage("done");
      setExcelProgress(100);
      setExcelFileProgress(`${totalFiles} arquivo(s) processado(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar planilha(s)");
      setExcelStage("idle");
      setExcelProgress(0);
      setExcelFileProgress("");
    }
  }, [excelFiles, cId]);

  const saveExcelItems = useCallback(async () => {
    if (!excelParsed?.items) return;
    setExcelSaving(true);
    setExcelStage("saving");
    setExcelProgress(0);

    const items = excelParsed.items.filter((_: any, i: number) => excelSelectedItems.has(i)).filter((it: any) => it.vehicleId);
    if (items.length === 0) {
      toast.error("Nenhum item com veículo válido selecionado.");
      setExcelSaving(false);
      setExcelStage("done");
      setExcelProgress(100);
      return;
    }

    try {
      const batchSize = 500;
      let totalInserted = 0;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const result = await importBatchMut.mutateAsync({
          companyId: cId,
          items: batch.map((it: any) => ({
            vehicleId: it.vehicleId,
            data: it.data,
            categoria: it.categoria || "pedagio",
            descricao: it.descricao || "",
            pracaPedagio: it.pracaPedagio || "",
            rodovia: "",
            valor: it.valor,
            tagId: "",
            eixos: undefined,
            observacoes: it.fatura ? `Fatura: ${it.fatura}` : "",
          })),
          criadoPor: user?.name || "Excel Import",
        });
        totalInserted += result.inserted;
        setExcelProgress(Math.round(((i + batch.length) / items.length) * 100));
      }
      toast.success(`${totalInserted} lançamento(s) importado(s) com sucesso!`);
      tolls.refetch();
      setExcelDialogOpen(false);
      setExcelParsed(null);
      setExcelFiles([]);
      setExcelStage("idle");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
    setExcelSaving(false);
  }, [excelParsed, excelSelectedItems, cId, user]);

  const excelToggleAll = useCallback(() => {
    if (!excelParsed?.items) return;
    if (excelSelectedItems.size === excelParsed.items.length) {
      setExcelSelectedItems(new Set());
    } else {
      setExcelSelectedItems(new Set(excelParsed.items.map((_: any, i: number) => i)));
    }
  }, [excelParsed, excelSelectedItems]);

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

  const mesesComDados = (() => {
    const map: Record<number, number> = {};
    allRecords.forEach((r: any) => {
      if (r.data) {
        const d = new Date(r.data);
        const y = d.getFullYear();
        if (y === anoAtual) {
          const mi = d.getMonth() + 1;
          map[mi] = (map[mi] || 0) + 1;
        }
      }
    });
    return map;
  })();

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Milestone className="h-5 w-5 text-indigo-600" /> Pedágios e Sem Parar
          </h1>
          <div className="flex gap-2">
            <input type="file" accept=".xlsx,.xls,.csv" multiple ref={excelFileRef} className="hidden" onChange={handleExcelFileSelect} />
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setClearMonthDialogOpen(true); setClearMonthPassword(""); }} disabled={list.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> Limpar Mês
            </Button>
            <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50" onClick={() => { setClearAllDialogOpen(true); setClearAllPassword(""); }}>
              <Lock className="h-4 w-4 mr-1" /> Limpar Tudo
            </Button>
            <Button variant="outline" size="sm" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              onClick={() => excelFileRef.current?.click()}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Importar Excel
            </Button>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ref={iaFileRef} className="hidden" onChange={handleIaFileSelect} />
            <Button variant="outline" size="sm" className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
              onClick={() => iaFileRef.current?.click()}>
              <Sparkles className="h-4 w-4 mr-1" /> Importar (IA)
            </Button>
            <input type="file" accept="application/pdf" ref={pdfFileRef} className="hidden" onChange={handleIaFileSelect} />
            <Button variant="outline" size="sm" className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              onClick={() => pdfFileRef.current?.click()}>
              <FileText className="h-4 w-4 mr-1" /> Importar PDF
            </Button>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnoAtual(a => a - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-bold min-w-[50px] text-center">{anoAtual}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnoAtual(a => a + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Com dados</span>
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
                      ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300"
                      : hasData
                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-900/60"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                  {hasData && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{count > 99 ? "99+" : count}</span>
                  )}
                </button>
              );
            })}
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

        {list.length > 0 && (
          <div className="bg-card border rounded-xl overflow-x-auto">
            <div className="p-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Consolidação por Veículo — {MESES_ABREV[mesAtual - 1]}/{anoAtual}
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left p-2.5 font-medium">Veículo</th>
                  <th className="text-center p-2.5 font-medium">Pedágios</th>
                  <th className="text-center p-2.5 font-medium">Sem Parar</th>
                  <th className="text-center p-2.5 font-medium">Outros</th>
                  <th className="text-center p-2.5 font-medium">Total Lanç.</th>
                  <th className="text-right p-2.5 font-medium">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const byVehicle: Record<string, { placa: string; pedagio: number; sem_parar: number; outros: number; total: number; valor: number }> = {};
                  list.forEach((r: any) => {
                    const key = r.vehicle_id || "sem";
                    if (!byVehicle[key]) byVehicle[key] = { placa: r.placa || r.modelo || "Sem veículo", pedagio: 0, sem_parar: 0, outros: 0, total: 0, valor: 0 };
                    byVehicle[key].total++;
                    byVehicle[key].valor += parseFloat(r.valor || "0");
                    if (r.categoria === "pedagio") byVehicle[key].pedagio++;
                    else if (r.categoria === "sem_parar") byVehicle[key].sem_parar++;
                    else byVehicle[key].outros++;
                  });
                  const sorted = Object.values(byVehicle).sort((a, b) => b.valor - a.valor);
                  return sorted.map((v, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20">
                      <td className="p-2.5 font-semibold">{v.placa}</td>
                      <td className="p-2.5 text-center">{v.pedagio}</td>
                      <td className="p-2.5 text-center">{v.sem_parar}</td>
                      <td className="p-2.5 text-center">{v.outros || "—"}</td>
                      <td className="p-2.5 text-center font-medium">{v.total}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-700">{fmt(v.valor)}</td>
                    </tr>
                  ));
                })()}
                <tr className="bg-muted/30 font-bold">
                  <td className="p-2.5">TOTAL</td>
                  <td className="p-2.5 text-center">{totalPedagios}</td>
                  <td className="p-2.5 text-center">{totalSemParar}</td>
                  <td className="p-2.5 text-center">{list.filter((r: any) => r.categoria !== "pedagio" && r.categoria !== "sem_parar").length || "—"}</td>
                  <td className="p-2.5 text-center">{list.length}</td>
                  <td className="p-2.5 text-right text-emerald-700">{fmt(totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

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
                  <td className="p-3 align-top">
                    {(() => {
                      const feriado = feriadoNacional(r.data);
                      return (
                        <>
                          <div>{dataBR(r.data)}</div>
                          <div className="text-xs text-muted-foreground capitalize">{nomeDiaSemana(r.data)}</div>
                          {feriado && (
                            <div className="text-[11px] font-medium text-red-600">Feriado · {feriado}</div>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-medium">{r.placa || r.modelo}</div>
                    {r.placa && (r.marca || r.modelo) && (
                      <div className="text-xs text-muted-foreground">{[r.marca, r.modelo].filter(Boolean).join(" ")}</div>
                    )}
                  </td>
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
          <DialogContent className={`p-0 overflow-hidden flex flex-col ${iaParsed ? "max-w-3xl max-h-[90vh]" : "max-w-lg"}`}>
            {/* HEADER gradient violet→fuchsia (regra de ouro Rev. 2094) */}
            <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 p-2.5 rounded-xl ring-4 ring-white/20 shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold tracking-tight">Importar Pedágio/Sem Parar com IA</h2>
                  <p className="text-xs text-white/80 mt-0.5">
                    {!iaParsed
                      ? "Envie comprovante (PDF/imagem) e a IA extrai os lançamentos automaticamente."
                      : `${iaParsed.items?.length || 0} lançamento(s) detectado(s) — revise antes de importar.`}
                  </p>
                </div>
              </div>
            </div>

            {/* BODY */}
            <div className={`${iaParsed ? "flex-1 overflow-y-auto" : ""} px-6 py-5 space-y-4`}>
              {/* CARD do arquivo enviado */}
              {iaFile && (
                <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2.5 rounded-lg shadow-sm ring-1 ring-violet-200 shrink-0">
                      <FileText className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-violet-900 truncate">{iaFile.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] font-semibold">
                          {(iaFile.size / 1024).toFixed(0)} KB
                        </Badge>
                        <span className="text-[10.5px] text-violet-600/70">
                          {iaFile.type?.includes("pdf") ? "Documento PDF" : "Imagem"}
                        </span>
                      </div>
                    </div>
                    {!iaParsed && !parseMut.isPending && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-violet-600 hover:bg-violet-100 shrink-0"
                        onClick={() => { setIaFile(null); setIaPreview(null); if (iaFileRef.current) iaFileRef.current.value = ""; }}
                        title="Remover arquivo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {iaPreview && (
                    <div className="mt-3 rounded-lg overflow-hidden border border-violet-200 bg-white">
                      <img src={iaPreview} alt="Preview" className="max-h-[200px] w-full object-contain bg-slate-50" />
                    </div>
                  )}
                </div>
              )}

              {/* Estado pré-análise: dica didática + botão CTA grande */}
              {!iaParsed && (
                <>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-[11.5px] text-amber-900 leading-relaxed">
                      <span className="font-semibold">Como funciona:</span> a IA lê o comprovante, identifica
                      placa, data, valor, praça e rodovia, e <span className="font-semibold">tenta vincular
                      ao veículo cadastrado</span>. Você revisa item-a-item antes de importar.
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 h-11 text-sm font-semibold shadow-md"
                    onClick={processIA}
                    disabled={parseMut.isPending || !iaFile}
                  >
                    {parseMut.isPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando documento...</>
                      : <><Wand2 className="h-4 w-4 mr-2" /> Analisar com IA</>}
                  </Button>
                </>
              )}

              {/* Estado pós-análise: KPI bar + lista de itens */}
              {iaParsed && (
                <>
                  {/* KPI bar de detecção */}
                  {(() => {
                    const total = iaParsed.items?.length || 0;
                    const semVeic = (iaParsed.items || []).filter((it: any) => !it.vehicleId).length;
                    const totalValor = (iaParsed.items || []).reduce((s: number, it: any) => s + (it.valor || 0), 0);
                    const confColor =
                      iaParsed.confidence === "alta" ? "from-emerald-500 to-green-600" :
                      iaParsed.confidence === "media" ? "from-amber-500 to-orange-600" :
                      "from-rose-500 to-red-600";
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-violet-700/80 font-semibold">Detectados</div>
                          <div className="text-xl font-bold text-violet-900 mt-0.5">{total}</div>
                          <div className="text-[10.5px] text-violet-600/80">lançamento(s)</div>
                        </div>
                        <div className={`rounded-lg border p-3 ${semVeic === 0 ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"}`}>
                          <div className={`text-[10px] uppercase tracking-wider font-semibold ${semVeic === 0 ? "text-emerald-700/80" : "text-rose-700/80"}`}>Sem veículo</div>
                          <div className={`text-xl font-bold mt-0.5 ${semVeic === 0 ? "text-emerald-900" : "text-rose-900"}`}>{semVeic}</div>
                          <div className={`text-[10.5px] ${semVeic === 0 ? "text-emerald-600/80" : "text-rose-600/80"}`}>
                            {semVeic === 0 ? "todos vinculados ✓" : "cadastre antes"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">Total geral</div>
                          <div className="text-xl font-bold text-slate-900 mt-0.5">{fmt(totalValor)}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r ${confColor}`}></span>
                            <span className="text-[10.5px] text-slate-600">Confiança: <span className="font-semibold capitalize">{iaParsed.confidence}</span></span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Toolbar de seleção rápida */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="text-[11.5px] text-slate-600">
                      Clique nos itens pra (des)selecionar
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-violet-700 hover:bg-violet-50"
                        onClick={() => setIaSelectedItems(new Set((iaParsed.items || []).map((_: any, i: number) => i)))}
                      >
                        <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todos
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-slate-600 hover:bg-slate-100"
                        onClick={() => setIaSelectedItems(new Set())}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Limpar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {iaParsed.items?.map((item: any, idx: number) => {
                      const isSelected = iaSelectedItems.has(idx);
                      const veh = (vehicles.data || []).find((v: any) => v.id === item.vehicleId);
                      const catInfo = CATEGORIAS[item.categoria] || { label: item.categoria || "Pedágio", color: "bg-gray-100 text-gray-700" };
                      return (
                        <div key={idx}
                          className={`rounded-xl border-2 p-3 cursor-pointer transition-all ${
                            isSelected
                              ? "border-violet-300 bg-gradient-to-br from-violet-50/80 to-purple-50/40 shadow-sm"
                              : "border-slate-200 bg-slate-50/50 opacity-60 hover:opacity-90"
                          }`}
                          onClick={() => {
                            const next = new Set(iaSelectedItems);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            setIaSelectedItems(next);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox checked={isSelected} className="mt-1 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${catInfo.color} text-[10px] font-semibold`}>
                                  {catInfo.label}
                                </Badge>
                                <span className="text-[11px] text-slate-500">{item.data}</span>
                                <span className="ml-auto font-bold text-sm text-slate-900 tabular-nums">{fmt(item.valor)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-sm">
                                <Car className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-800 truncate">
                                  {veh ? `${veh.placa} — ${veh.marca} ${veh.modelo}` : item.vehiclePlaca || "Veículo não identificado"}
                                </span>
                                {!item.vehicleId && (
                                  <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] font-semibold shrink-0">
                                    Sem veículo
                                  </Badge>
                                )}
                              </div>
                              {(item.pracaPedagio || item.rodovia) && (
                                <div className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                                  <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                  <span className="truncate">
                                    {[item.pracaPedagio, item.rodovia].filter(Boolean).join(" · ")}
                                  </span>
                                </div>
                              )}
                              {item.descricao && (
                                <div className="text-[11px] text-slate-500 italic truncate">{item.descricao}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* FOOTER pill (regra de ouro Rev. 2094) */}
            {iaParsed && (
              <div className="shrink-0 border-t bg-gradient-to-r from-slate-50 to-violet-50/40 px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[12px] text-slate-700">
                  <div className="bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-md text-[11px] tabular-nums">
                    {iaSelectedItems.size}/{iaParsed.items?.length || 0}
                  </div>
                  <span>selecionado(s) ·</span>
                  <span className="font-semibold text-slate-900">
                    {fmt(iaParsed.items?.filter((_: any, i: number) => iaSelectedItems.has(i)).reduce((s: number, it: any) => s + (it.valor || 0), 0))}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setIaDialogOpen(false); setIaParsed(null); setIaFile(null); setIaSelectedItems(new Set()); }}
                    className="h-9"
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-md font-semibold"
                    onClick={saveIAItems}
                    disabled={iaSaving || iaSelectedItems.size === 0}
                  >
                    {iaSaving
                      ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...</>
                      : <><Check className="h-4 w-4 mr-1.5" /> Importar {iaSelectedItems.size} Selecionado(s)</>}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={excelDialogOpen} onOpenChange={(o) => { if (!parseExcelMut.isPending && !excelSaving) setExcelDialogOpen(o); }}>
          <DialogContent resizable={false} className={`flex flex-col p-0 gap-0 ${excelParsed ? "!w-[96vw] !max-w-[96vw] !h-[90vh] !max-h-[90vh]" : "!w-[480px] !max-w-[90vw]"}`}>
            <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Importar Pedágios — Excel Sem Parar
              </DialogTitle>
            </DialogHeader>

            <div className={`${excelParsed ? "flex-1 overflow-hidden" : ""} px-5 py-4`}>
              {excelFiles.length > 0 && !excelParsed && excelStage === "idle" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold">{excelFiles.length} arquivo(s) selecionado(s)</span>
                    <Badge variant="outline" className="text-xs ml-auto">{(excelFiles.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {excelFiles.map((f, i) => (
                      <Badge key={i} className="bg-emerald-100 text-emerald-700 text-[10px]">{f.name}</Badge>
                    ))}
                  </div>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-10" onClick={processExcel} disabled={parseExcelMut.isPending}>
                    {parseExcelMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Processar {excelFiles.length > 1 ? `${excelFiles.length} Planilhas` : "Planilha"}</>}
                  </Button>
                </div>
              )}

              {(excelStage !== "idle" && excelStage !== "done" && excelStage !== "saving") && (
                <div className="space-y-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                    <div>
                      <span className="font-medium">
                        {excelStage === "reading" && "Lendo arquivo..."}
                        {excelStage === "parsing" && "Interpretando planilha..."}
                        {excelStage === "matching" && "Vinculando placas aos veículos..."}
                      </span>
                      {excelFileProgress && <div className="text-xs text-muted-foreground mt-0.5">{excelFileProgress}</div>}
                    </div>
                  </div>
                  <Progress value={excelProgress} className="h-2" />
                  <div className="text-right text-xs text-muted-foreground">{excelProgress}%</div>
                </div>
              )}

              {excelParsed && (
                <div className="flex flex-col h-full gap-3">
                  <div className="grid grid-cols-4 gap-2 shrink-0">
                    <Card className="border-emerald-200 bg-emerald-50/50">
                      <CardContent className="p-2 text-center">
                        <div className="text-xl font-bold text-emerald-700">{excelParsed.summary?.total || 0}</div>
                        <div className="text-[10px] text-emerald-600 uppercase font-semibold">Total Registros</div>
                      </CardContent>
                    </Card>
                    <Card className="border-blue-200 bg-blue-50/50">
                      <CardContent className="p-2 text-center">
                        <div className="text-xl font-bold text-blue-700">{fmt(excelParsed.summary?.totalValor || 0)}</div>
                        <div className="text-[10px] text-blue-600 uppercase font-semibold">Valor Total</div>
                      </CardContent>
                    </Card>
                    <Card className="border-green-200 bg-green-50/50">
                      <CardContent className="p-2 text-center">
                        <div className="text-xl font-bold text-green-700">{excelParsed.summary?.matched || 0}</div>
                        <div className="text-[10px] text-green-600 uppercase font-semibold">Veículos OK</div>
                      </CardContent>
                    </Card>
                    <Card className={`${(excelParsed.summary?.unmatched || 0) > 0 ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-gray-50/50"}`}>
                      <CardContent className="p-2 text-center">
                        <div className={`text-xl font-bold ${(excelParsed.summary?.unmatched || 0) > 0 ? "text-amber-700" : "text-gray-500"}`}>{excelParsed.summary?.unmatched || 0}</div>
                        <div className="text-[10px] text-amber-600 uppercase font-semibold">Sem Veículo</div>
                      </CardContent>
                    </Card>
                  </div>

                  {(excelParsed.summary?.placasNaoEncontradas?.length > 0) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-sm shrink-0">
                      <div className="flex items-center gap-2 text-amber-700 font-medium">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Placas não cadastradas:</span>
                        <div className="flex gap-1 flex-wrap">
                          {excelParsed.summary.placasNaoEncontradas.map((p: string) => (
                            <Badge key={p} variant="outline" className="text-amber-700 border-amber-300 text-[10px]">{p}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={excelToggleAll} className="text-xs">
                      <CheckCheck className="h-3.5 w-3.5 mr-1" />
                      {excelSelectedItems.size === excelParsed.items?.length ? "Desmarcar Todos" : "Marcar Todos"}
                    </Button>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {excelSelectedItems.size} de {excelParsed.items?.length || 0} selecionado(s)
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                        <tr className="border-b">
                          <th className="p-2 w-8"></th>
                          <th className="p-2 text-left font-medium">Data</th>
                          <th className="p-2 text-left font-medium">Hora</th>
                          <th className="p-2 text-left font-medium">Categoria</th>
                          <th className="p-2 text-left font-medium">Placa</th>
                          <th className="p-2 text-left font-medium">Veículo</th>
                          <th className="p-2 text-left font-medium">Praça / Descrição</th>
                          <th className="p-2 text-right font-medium">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelParsed.items?.map((item: any, idx: number) => {
                          const isSelected = excelSelectedItems.has(idx);
                          const catInfo = CATEGORIAS[item.categoria] || { label: item.categoria, color: "bg-gray-100 text-gray-700" };
                          return (
                            <tr key={idx}
                              className={`border-b cursor-pointer transition-colors ${
                                isSelected
                                  ? item.matched ? "bg-emerald-50/70 hover:bg-emerald-50" : "bg-amber-50/70 hover:bg-amber-50"
                                  : "bg-muted/10 opacity-50 hover:opacity-70"
                              }`}
                              onClick={() => {
                                const next = new Set(excelSelectedItems);
                                if (next.has(idx)) next.delete(idx); else next.add(idx);
                                setExcelSelectedItems(next);
                              }}
                            >
                              <td className="p-2 text-center"><Checkbox checked={isSelected} /></td>
                              <td className="p-2 whitespace-nowrap">{new Date(item.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                              <td className="p-2 text-muted-foreground">{item.horario || "—"}</td>
                              <td className="p-2"><Badge className={`text-[10px] ${catInfo.color}`}>{catInfo.label}</Badge></td>
                              <td className="p-2 font-medium">{item.vehiclePlaca}</td>
                              <td className="p-2">
                                {item.matched ? (
                                  <span className="text-emerald-600">{item.vehicleInfo}</span>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-700 text-[10px]">Não cadastrada</Badge>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground truncate max-w-[200px]">{item.pracaPedagio || item.descricao || "—"}</td>
                              <td className="p-2 text-right font-semibold whitespace-nowrap">{fmt(item.valor)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {excelStage === "saving" && (
                    <div className="space-y-2 shrink-0 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Salvando lançamentos...
                        </div>
                        <span className="text-sm font-bold text-emerald-700">{excelProgress}%</span>
                      </div>
                      <Progress value={excelProgress} className="h-3" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {excelParsed && (
              <div className="flex gap-2 justify-between items-center px-5 py-3 border-t shrink-0 bg-muted/30">
                <div className="text-sm font-medium">
                  {excelSelectedItems.size} selecionado(s) ·
                  Total: <span className="text-emerald-700">{fmt(excelParsed.items?.filter((_: any, i: number) => excelSelectedItems.has(i)).reduce((s: number, it: any) => s + (it.valor || 0), 0))}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setExcelDialogOpen(false); setExcelParsed(null); setExcelFiles([]); setExcelStage("idle"); }}>Cancelar</Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 h-10 px-6" onClick={saveExcelItems} disabled={excelSaving || excelSelectedItems.size === 0}>
                    {excelSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><Check className="h-4 w-4 mr-1" /> Importar Selecionados</>}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={clearMonthDialogOpen} onOpenChange={setClearMonthDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Limpar Lançamentos do Mês
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">
                Tem certeza que deseja excluir <strong>todos os {list.length} lançamento(s)</strong> de pedágio de <strong>{MESES_ABREV[mesAtual - 1]}/{anoAtual}</strong>?
              </p>
              <p className="text-xs text-red-500 font-medium">Esta ação não pode ser desfeita. Digite sua senha para confirmar.</p>
              <div>
                <Label className="text-xs">Senha</Label>
                <Input type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore placeholder="Digite sua senha..." value={clearMonthPassword} onChange={e => setClearMonthPassword(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearMonthDialogOpen(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => clearMonthMut.mutate({ companyId: cId, mes: mesAtual, ano: anoAtual, password: clearMonthPassword })} disabled={clearMonthMut.isPending || !clearMonthPassword}>
                {clearMonthMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Excluir {list.length} Registro(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Lock className="h-5 w-5" /> Limpar TODOS os Registros de Pedágio
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">
                Esta ação irá excluir <strong>todos</strong> os lançamentos de pedágio de <strong>todos os meses</strong> desta empresa.
              </p>
              <p className="text-xs text-red-500 font-medium">Esta ação não pode ser desfeita. Digite sua senha para confirmar.</p>
              <div>
                <Label className="text-xs">Senha</Label>
                <Input type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore placeholder="Digite sua senha..." value={clearAllPassword} onChange={e => setClearAllPassword(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearAllDialogOpen(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => clearAllMut.mutate({ companyId: cId, password: clearAllPassword })} disabled={clearAllMut.isPending || !clearAllPassword}>
                {clearAllMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Excluir Tudo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
