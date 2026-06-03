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
import { Fuel, Plus, Pencil, Trash2, Upload, Search, FileText, CheckCircle2, AlertTriangle, XCircle, ChevronLeft, ChevronRight, Calendar, Send, Undo2, DollarSign, Loader2, Lock, Users, GitMerge, Check, Paperclip, Eye, X, Image as ImageIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(v: number, decimals = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const COMBUSTIVEIS = ["Gasolina", "Etanol", "Diesel", "Diesel S10", "GNV", "Flex"];

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function Combustivel() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const now = new Date();
  const [anoAtual, setAnoAtual] = useState(now.getFullYear());
  const [mesAtual, setMesAtual] = useState(now.getMonth() + 1);
  const [filterDay, setFilterDay] = useState("all");
  const [filterFuel, setFilterFuel] = useState("all");
  const [filterDriver, setFilterDriver] = useState("all");
  const [search, setSearch] = useState("");
  const [viewTab, setViewTab] = useState<"tabela" | "analise">("tabela");
  const [importResult, setImportResult] = useState<any>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [pdfProgressLabel, setPdfProgressLabel] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [driverOverrides, setDriverOverrides] = useState<Record<string, string>>({});
  const [confirmDlg, setConfirmDlg] = useState<{ msg: string; onOk: () => void } | null>(null);
  const [rejectedMatches, setRejectedMatches] = useState<Set<string>>(new Set());
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewTab, setReviewTab] = useState<"matched" | "unmatched">("matched");
  const [consolidateDialogOpen, setConsolidateDialogOpen] = useState(false);
  const [consolidateObs, setConsolidateObs] = useState("");
  const [clearMonthDialogOpen, setClearMonthDialogOpen] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [clearAllPassword, setClearAllPassword] = useState("");
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [canonicalName, setCanonicalName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const anexoRef = useRef<HTMLInputElement>(null);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [previewAnexo, setPreviewAnexo] = useState<string | null>(null);

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
  const uploadAnexoMut = trpc.frotas.uploadFuelAttachment.useMutation({
    onSuccess: () => { fuel.refetch(); setUploadingAnexo(false); toast.success("Anexo adicionado"); },
    onError: (err) => { setUploadingAnexo(false); toast.error(err.message); },
  });
  const removeAnexoMut = trpc.frotas.removeFuelAttachment.useMutation({
    onSuccess: () => { fuel.refetch(); toast.success("Anexo removido"); },
  });
  const importCsvMut = trpc.frotas.importFuelCsv.useMutation({
    onSuccess: (data) => { fuel.refetch(); toast.success(`${data.inserted} registros importados`); },
    onError: (err) => toast.error(err.message),
  });
  const importPdfMut = trpc.frotas.importFuelPdf.useMutation({
    onSuccess: (data) => {
      fuel.refetch();
      setImportResult(data);
      setImportDialogOpen(true);
    },
    onError: (err) => toast.error("Erro ao importar PDF: " + err.message),
  });
  const previewPdfMut = trpc.frotas.previewFuelPdf.useMutation({
    onSuccess: (data) => {
      setPreviewData(data);
      setDriverOverrides({});
      setRejectedMatches(new Set());
      setReviewSearch("");
      setReviewTab("matched");
      setReviewDialogOpen(true);
    },
    onError: (err) => toast.error("Erro ao analisar PDF: " + err.message),
  });
  const confirmImportMut = trpc.frotas.confirmFuelImport.useMutation({
    onSuccess: (data) => {
      fuel.refetch();
      setReviewDialogOpen(false);
      setPreviewData(null);
      toast.success(`${data.inserted} registros importados com sucesso!`);
    },
    onError: (err) => toast.error("Erro ao confirmar importação: " + err.message),
  });

  const fuelSummary = trpc.frotas.getFuelMonthSummary.useQuery(
    { companyId: cId, mes: mesAtual, ano: anoAtual },
    { enabled: cId > 0 },
  );
  const consolidatedMonths = trpc.frotas.getConsolidatedMonthsYear.useQuery(
    { companyId: cId, ano: anoAtual },
    { enabled: cId > 0 },
  );
  const fuelConsolidatedSet = new Set(consolidatedMonths.data?.combustivel || []);
  const consolidateMut = trpc.frotas.consolidateFuelMonth.useMutation({
    onSuccess: (r) => {
      toast.success(`Consolidado! Lançamento financeiro #${r.financialEntryId} criado — ${fmt(r.totalValor)} (${r.qtdAbastecimentos} abast.)`);
      fuelSummary.refetch();
      consolidatedMonths.refetch();
      fuel.refetch();
      setConsolidateDialogOpen(false);
      setConsolidateObs("");
    },
    onError: (e) => toast.error(e.message),
  });
  const revertFuelMut = trpc.frotas.revertFuelConsolidation.useMutation({
    onSuccess: () => {
      toast.success("Consolidação revertida — lançamento financeiro cancelado.");
      fuelSummary.refetch();
      consolidatedMonths.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const clearMonthMut = trpc.frotas.clearFuelMonth.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.deleted} registro(s) do mês excluído(s)`);
      fuel.refetch();
      fuelSummary.refetch();
      setClearMonthDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const driverNames = trpc.frotas.listDriverNames.useQuery(
    { companyId: cId },
    { enabled: cId > 0 && driverDialogOpen }
  );
  const mergeDriversMut = trpc.frotas.mergeDriverNames.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.aliasesCreated} alias(es) criado(s), ${r.recordsUpdated} registro(s) atualizado(s)`);
      driverNames.refetch();
      fuel.refetch();
      setSelectedDrivers([]);
      setCanonicalName("");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteAliasMut = trpc.frotas.deleteDriverAlias.useMutation({
    onSuccess: () => { toast.success("Alias removido"); driverNames.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const clearAllMut = trpc.frotas.clearAllFuelRecords.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.deleted} registro(s) de combustível excluído(s) de todo o sistema`);
      fuel.refetch();
      fuelSummary.refetch();
      setClearAllDialogOpen(false);
      setClearAllPassword("");
    },
    onError: (e) => { toast.error(e.message); },
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

  function handleAnexoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploadingAnexo(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(',')[1];
      uploadAnexoMut.mutate({ companyId: cId, fuelRecordId: editing.id, fileName: file.name, fileData: b64, contentType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importCsvMut.mutate({ companyId: cId, csvContent: ev.target?.result as string, criadoPor: user?.name || "" } as any);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Selecione um arquivo PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10MB)");
      return;
    }

    setPdfProgress(0);
    setPdfProgressLabel("Lendo arquivo...");

    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        const pct = Math.round((ev.loaded / ev.total) * 30);
        setPdfProgress(pct);
      }
    };
    reader.onload = (ev) => {
      setPdfProgress(30);
      setPdfProgressLabel("Preparando envio...");

      const result = ev.target?.result as ArrayBuffer;
      const base64 = btoa(
        new Uint8Array(result).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      setPdfProgress(40);
      setPdfProgressLabel("Enviando ao servidor...");

      let progressInterval: ReturnType<typeof setInterval>;
      let current = 40;
      progressInterval = setInterval(() => {
        current = Math.min(current + 2, 85);
        setPdfProgress(current);
        if (current >= 60 && current < 85) {
          setPdfProgressLabel("Processando PDF...");
        }
      }, 300);

      previewPdfMut.mutate(
        { companyId: cId, pdfBase64: base64 },
        {
          onSuccess: () => {
            clearInterval(progressInterval);
            setPdfProgress(95);
            setPdfProgressLabel("Análise concluída!");
            setTimeout(() => {
              setPdfProgress(100);
              setPdfProgressLabel("Pronto para revisão!");
              setTimeout(() => { setPdfProgress(null); setPdfProgressLabel(""); }, 800);
            }, 400);
          },
          onError: () => {
            clearInterval(progressInterval);
            setPdfProgress(null);
            setPdfProgressLabel("");
          },
        }
      );
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  const allRecords = fuel.data || [];

  function handleConfirmImport() {
    if (!previewData) return;
    const nonDupRecords = previewData.records.filter((r: any) => !r.isDuplicate);
    const driverMappings: { pdfName: string; canonicalName: string }[] = [];
    const finalRecords = nonDupRecords.map((r: any) => {
      let motorista = r.driverPdf || null;
      const pdfKey = r.driverPdf;

      if (pdfKey && driverOverrides[pdfKey]) {
        motorista = driverOverrides[pdfKey];
        driverMappings.push({ pdfName: pdfKey, canonicalName: driverOverrides[pdfKey] });
      } else if (pdfKey && r.driverMatched && !rejectedMatches.has(pdfKey)) {
        motorista = r.driverMatched;
      } else if (pdfKey && r.driverMatched && rejectedMatches.has(pdfKey)) {
        motorista = r.driverPdf;
      }

      return {
        vehicleId: r.vehicleId,
        date: r.date,
        litros: r.litros,
        valorTotal: r.valorTotal,
        precoLitro: r.precoLitro,
        tipoCombustivel: r.tipoCombustivel,
        motorista,
        numDoc: r.numDoc || null,
        desconto: r.desconto || null,
      };
    });

    const uniqueMappings = Object.values(
      driverMappings.reduce((acc: Record<string, any>, m) => { acc[m.pdfName.toUpperCase()] = m; return acc; }, {})
    );

    confirmImportMut.mutate({
      companyId: cId,
      records: finalRecords,
      driverMappings: uniqueMappings,
      criadoPor: user?.name || "",
    });
  }

  const mesRef = `${anoAtual}-${String(mesAtual).padStart(2, "0")}`;
  const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const mesesComDados = (() => {
    const map: Record<number, number> = {};
    allRecords.forEach((r: any) => {
      if (r.data) {
        const [y, m] = r.data.split('-');
        if (parseInt(y) === anoAtual) {
          const mi = parseInt(m);
          map[mi] = (map[mi] || 0) + 1;
        }
      }
    });
    return map;
  })();

  const availableDaysForMonth = (() => {
    const days = new Set<string>();
    const ym = mesRef;
    allRecords.forEach((r: any) => {
      if (r.data && r.data.startsWith(ym)) days.add(r.data.split('-')[2]);
    });
    return [...days].sort();
  })();

  const availableDrivers = (() => {
    const drivers = new Set<string>();
    allRecords.forEach((r: any) => { if (r.motorista) drivers.add(r.motorista); });
    return [...drivers].sort();
  })();

  const list = allRecords.filter((r: any) => {
    if (r.data) {
      if (!r.data.startsWith(mesRef)) return false;
      if (filterDay !== "all") {
        const d = r.data.split('-')[2];
        if (d !== filterDay) return false;
      }
    }
    if (filterFuel !== "all" && r.tipo_combustivel !== filterFuel) return false;
    if (filterDriver !== "all" && r.motorista !== filterDriver) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(
        (r.placa || "").toLowerCase().includes(s) ||
        (r.posto || "").toLowerCase().includes(s) ||
        (r.motorista || "").toLowerCase().includes(s)
      )) return false;
    }
    return true;
  });

  const resumo = (() => {
    const totalLitros = list.reduce((s: number, r: any) => s + parseFloat(r.litros || "0"), 0);
    const totalValor = list.reduce((s: number, r: any) => s + parseFloat(r.valor_total || "0"), 0);
    const totalDesc = list.reduce((s: number, r: any) => s + parseFloat(r.desconto || "0"), 0);
    const veiculosSet = new Set(list.map((r: any) => r.vehicle_id));
    const motoristasSet = new Set(list.filter((r: any) => r.motorista).map((r: any) => r.motorista));
    return { totalLitros, totalValor, totalDesc, veiculos: veiculosSet.size, motoristas: motoristasSet.size, registros: list.length };
  })();

  const byVehicle = (() => {
    const map: Record<string, { id: string; placa: string; litros: number; valor: number; count: number }> = {};
    list.forEach((r: any) => {
      const key = r.vehicle_id;
      if (!map[key]) map[key] = { id: String(key), placa: r.placa || r.modelo || "—", litros: 0, valor: 0, count: 0 };
      map[key].litros += parseFloat(r.litros || "0");
      map[key].valor += parseFloat(r.valor_total || "0");
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  })();

  const byDriver = (() => {
    const map: Record<string, { litros: number; valor: number; count: number }> = {};
    list.forEach((r: any) => {
      const key = r.motorista || "Não informado";
      if (!map[key]) map[key] = { litros: 0, valor: 0, count: 0 };
      map[key].litros += parseFloat(r.litros || "0");
      map[key].valor += parseFloat(r.valor_total || "0");
      map[key].count++;
    });
    return Object.entries(map).sort((a, b) => b[1].valor - a[1].valor);
  })();

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Fuel className="h-5 w-5 text-amber-600" /> Combustível
          </h1>
          <div className="flex gap-2">
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleCsv} />
            <input type="file" accept=".pdf" ref={pdfRef} className="hidden" onChange={handlePdf} />
            <Button variant="outline" size="sm" onClick={() => { setDriverDialogOpen(true); setSelectedDrivers([]); setCanonicalName(""); }}>
              <Users className="h-4 w-4 mr-1" /> Motoristas
            </Button>
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setClearMonthDialogOpen(true)} disabled={list.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" /> Limpar Mês
            </Button>
            <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50" onClick={() => { setClearAllDialogOpen(true); setClearAllPassword(""); }}>
              <Lock className="h-4 w-4 mr-1" /> Limpar Tudo
            </Button>
            <Button variant="outline" size="sm" onClick={() => pdfRef.current?.click()} disabled={importPdfMut.isPending || pdfProgress !== null}>
              <FileText className="h-4 w-4 mr-1" />
              {pdfProgress !== null ? "Processando..." : "Importar PDF"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importCsvMut.isPending}>
              <Upload className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
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
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Com dados</span>
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
              const isConsolidated = fuelConsolidatedSet.has(mes);
              return (
                <button
                  key={m}
                  onClick={() => { setMesAtual(mes); setFilterDay("all"); }}
                  className={`relative rounded-lg py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? isConsolidated
                        ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                        : "bg-amber-600 text-white shadow-md ring-2 ring-amber-300"
                      : isConsolidated
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
                        : hasData
                          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                  {isConsolidated && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center">✓</span>
                  )}
                  {hasData && !isConsolidated && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{count > 99 ? "99+" : count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {(() => {
          const fs = fuelSummary.data;
          const isConsolidated = fs?.consolidated;
          if (!fs || (fs.qtd === 0 && !isConsolidated)) return null;
          return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{fs.qtd}</p>
                  <p className="text-xs text-amber-600">Abastecimentos</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950 border-green-200">
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-green-700">{fmt(fs.totalValor)}</p>
                  <p className="text-xs text-green-600">Custo Total</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                <CardContent className="p-3 text-center">
                  <p className="text-lg font-bold text-blue-700">{fs.totalLitros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}L</p>
                  <p className="text-xs text-blue-600">Litros</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{fs.veiculos}</p>
                  <p className="text-xs text-purple-600">Veículos</p>
                </CardContent>
              </Card>
              <Card className={`${isConsolidated ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300" : "bg-slate-50 dark:bg-slate-950 border-slate-200"}`}>
                <CardContent className="p-3 text-center">
                  {isConsolidated ? (
                    <>
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <p className="text-sm font-bold text-emerald-700">Consolidado</p>
                      </div>
                      <p className="text-[10px] text-emerald-600 mt-0.5">#{fs.financialEntryId} · {fs.financialStatus}</p>
                      <Button
                        variant="ghost" size="sm"
                        className="mt-1 h-6 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                        onClick={() => {
                          setConfirmDlg({ msg: "Reverter consolidação e cancelar lançamento financeiro?", onOk: () => revertFuelMut.mutate({ companyId: cId, financialEntryId: fs.financialEntryId! }) });
                        }}
                        disabled={revertFuelMut.isPending}
                      >
                        <Undo2 className="h-3 w-3 mr-1" /> Reverter
                      </Button>
                    </>
                  ) : fs.totalValor > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-slate-600">Pendente</p>
                      <Button
                        size="sm"
                        className="mt-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setConsolidateDialogOpen(true)}
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
          );
        })()}

        {pdfProgress !== null && (
          <div className="bg-card border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{pdfProgressLabel}</span>
              <span className="font-bold text-primary">{pdfProgress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${pdfProgress}%`,
                  background: pdfProgress === 100
                    ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                    : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar placa, posto, motorista..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={filterDay} onValueChange={setFilterDay}>
              <SelectTrigger className="w-[110px] h-9 text-xs"><SelectValue placeholder="Dia" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os dias</SelectItem>
                {availableDaysForMonth.map(d => <SelectItem key={d} value={d}>Dia {d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterVehicle} onValueChange={setFilterVehicle}>
              <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Veículo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os veículos</SelectItem>
                {(vehicles.data || []).map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFuel} onValueChange={setFilterFuel}>
              <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {COMBUSTIVEIS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDriver} onValueChange={setFilterDriver}>
              <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Motorista" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motoristas</SelectItem>
                {availableDrivers.map(d => <SelectItem key={d} value={d}>{d.length > 30 ? d.slice(0, 30) + "…" : d}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterDay !== "all" || filterVehicle !== "all" || filterFuel !== "all" || filterDriver !== "all" || search) && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-red-600 hover:text-red-700 px-2" onClick={() => { setFilterDay("all"); setFilterVehicle("all"); setFilterFuel("all"); setFilterDriver("all"); setSearch(""); }}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </div>

        {list.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all" onClick={() => setViewTab("tabela")}>
              <p className="text-xl font-bold text-amber-700">{fmtNum(resumo.registros, 0)}</p>
              <p className="text-[10px] text-amber-600 uppercase font-medium">Abastecimentos</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-green-400 transition-all" onClick={() => setViewTab("tabela")}>
              <p className="text-base font-bold text-green-700">{fmt(resumo.totalValor)}</p>
              <p className="text-[10px] text-green-600 uppercase font-medium">Valor Total</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all" onClick={() => setViewTab("tabela")}>
              <p className="text-base font-bold text-blue-700">{fmtNum(resumo.totalLitros)}L</p>
              <p className="text-[10px] text-blue-600 uppercase font-medium">Litros</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all" onClick={() => setViewTab("tabela")}>
              <p className="text-base font-bold text-indigo-700">{resumo.totalLitros > 0 ? fmt(resumo.totalValor / resumo.totalLitros) : "—"}</p>
              <p className="text-[10px] text-indigo-600 uppercase font-medium">Preço Médio/L</p>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all" onClick={() => setViewTab("analise")}>
              <p className="text-xl font-bold text-cyan-700">{resumo.veiculos}</p>
              <p className="text-[10px] text-cyan-600 uppercase font-medium">Veículos</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 rounded-xl p-3 text-center cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all" onClick={() => setViewTab("analise")}>
              <p className="text-xl font-bold text-purple-700">{resumo.motoristas}</p>
              <p className="text-[10px] text-purple-600 uppercase font-medium">Motoristas</p>
            </div>
          </div>
        )}

        {list.length > 0 && (
          <div className="flex gap-1 border-b">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewTab === "tabela" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => setViewTab("tabela")}>Registros</button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewTab === "analise" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => setViewTab("analise")}>Análise</button>
          </div>
        )}

        {viewTab === "analise" && list.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-amber-600" /> Consumo por Veículo
                </h3>
                <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                  {byVehicle.map((v, i) => {
                    const maxVal = byVehicle[0]?.valor || 1;
                    const isActive = filterVehicle === v.id;
                    return (
                      <div key={i} className={`group cursor-pointer rounded-lg px-1 py-0.5 -mx-1 transition-all ${isActive ? "bg-amber-100 dark:bg-amber-900/30 ring-1 ring-amber-400" : "hover:bg-muted/50"}`} onClick={() => setFilterVehicle(isActive ? "all" : v.id)}>
                        <div className="flex items-center gap-2 text-sm py-1">
                          <span className="font-mono text-xs font-bold w-20 flex-shrink-0 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{v.placa}</span>
                          <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden relative">
                            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-md transition-all" style={{ width: `${(v.valor / maxVal) * 100}%` }} />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">{fmtNum(v.litros)}L</span>
                          </div>
                          <span className="text-xs font-bold w-24 text-right">{fmt(v.valor)}</span>
                          <Badge variant="outline" className="text-[10px] w-10 justify-center">{v.count}x</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-purple-600" /> Consumo por Motorista
                </h3>
                <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                  {byDriver.map(([name, d], i) => {
                    const maxVal = byDriver[0]?.[1]?.valor || 1;
                    const isActive = filterDriver === name;
                    return (
                      <div key={i} className={`cursor-pointer rounded-lg px-1 py-0.5 -mx-1 transition-all ${isActive ? "bg-purple-100 dark:bg-purple-900/30 ring-1 ring-purple-400" : "hover:bg-muted/50"}`} onClick={() => setFilterDriver(isActive ? "all" : name)}>
                        <div className="flex items-center gap-2 text-sm py-1">
                          <span className="text-xs w-28 flex-shrink-0 truncate" title={name}>{name}</span>
                          <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden relative">
                            <div className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-md transition-all" style={{ width: `${(d.valor / maxVal) * 100}%` }} />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">{fmtNum(d.litros)}L</span>
                          </div>
                          <span className="text-xs font-bold w-24 text-right">{fmt(d.valor)}</span>
                          <Badge variant="outline" className="text-[10px] w-10 justify-center">{d.count}x</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {viewTab === "tabela" && (fuel.isLoading ? (
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
                  <th className="text-left p-3">Motorista</th>
                  <th className="text-left p-3">Posto</th>
                  <th className="text-center p-3 w-10"></th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap">{r.data ? r.data.split('-').reverse().join('/') : "—"}</td>
                    <td className="p-3 font-mono">{r.placa || "—"}</td>
                    <td className="p-3"><Badge variant="outline">{r.tipo_combustivel}</Badge></td>
                    <td className="p-3 text-right">{fmtNum(parseFloat(r.litros || 0), 2)}</td>
                    <td className="p-3 text-right">{r.preco_litro ? `R$ ${fmtNum(parseFloat(r.preco_litro), 3)}` : "—"}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.valor_total)}</td>
                    <td className="p-3 text-right">{r.km_atual ? parseFloat(r.km_atual).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-3 text-xs max-w-[150px] truncate">{r.motorista || "—"}</td>
                    <td className="p-3 text-xs">{r.posto || "—"}</td>
                    <td className="p-3 text-center">{(r.anexos?.length > 0) ? <button onClick={() => { const img = r.anexos.find((a: any) => a.contentType?.startsWith('image/')); if (img) setPreviewAnexo(img.url); else if (r.anexos[0]?.url) window.open(r.anexos[0].url, '_blank'); }} className="hover:scale-110 transition-transform" title={`${r.anexos.length} anexo(s) — clique para visualizar`}><Paperclip className="h-4 w-4 text-blue-500 inline" /></button> : ""}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setConfirmDlg({ msg: "Excluir este abastecimento?", onOk: () => deleteMut.mutate({ id: r.id, companyId: cId }) }); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            resizable={false}
            className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none m-0 rounded-none flex flex-col p-4 sm:p-6"
          >
            <DialogHeader className="flex-shrink-0 border-b pb-3"><DialogTitle className="text-xl font-bold">{editing ? "Editar Abastecimento" : "Novo Abastecimento"}</DialogTitle></DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <div><Label>Valor por Litro (R$)</Label><MoneyInput value={form.precoLitro} onChange={v => setForm({ ...form, precoLitro: v })} decimals={3} placeholder="0,000" /></div>
              <div><Label>Valor Total (R$)</Label><MoneyInput value={form.valorTotal} onChange={v => setForm({ ...form, valorTotal: v })} /></div>
              <div><Label>KM Atual</Label><Input type="number" value={form.kmAtual || ""} onChange={e => setForm({ ...form, kmAtual: e.target.value })} /></div>
              <div><Label>Posto</Label><Input value={form.posto || ""} onChange={e => setForm({ ...form, posto: e.target.value })} /></div>
              <div><Label>Motorista</Label><Input value={form.motorista || ""} onChange={e => setForm({ ...form, motorista: e.target.value })} /></div>
              <div className="md:col-span-2 lg:col-span-3"><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>

              {editing && (
                <div className="md:col-span-2 lg:col-span-3 border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="flex items-center gap-2"><Paperclip className="w-4 h-4" /> Anexos / Cupons Fiscais</Label>
                    <div>
                      <input ref={anexoRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleAnexoUpload} />
                      <Button type="button" variant="outline" size="sm" onClick={() => anexoRef.current?.click()} disabled={uploadingAnexo}>
                        {uploadingAnexo ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enviando...</> : <><Upload className="w-4 h-4 mr-1" /> Anexar Arquivo</>}
                      </Button>
                    </div>
                  </div>
                  {(() => {
                    const record = (fuel.data || []).find((r: any) => r.id === editing.id);
                    const anexos = record?.anexos || [];
                    if (anexos.length === 0) return <p className="text-sm text-gray-500">Nenhum anexo</p>;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {anexos.map((a: any, i: number) => (
                          <div key={i} className="border rounded-md p-2 bg-white flex flex-col gap-2">
                            {a.contentType?.startsWith('image/') ? (
                              <img src={a.url} alt={a.nome} className="w-full h-32 object-contain rounded cursor-pointer hover:opacity-80" onClick={() => setPreviewAnexo(a.url)} />
                            ) : (
                              <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded">
                                <FileText className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600 truncate flex-1" title={a.nome}>{a.nome}</span>
                              <div className="flex gap-1">
                                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => window.open(a.url, '_blank')} title="Abrir">
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => { setConfirmDlg({ msg: "Remover este anexo?", onOk: () => removeAnexoMut.mutate({ companyId: cId, fuelRecordId: editing.id, key: a.key }) }); }} title="Remover">
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            </div>
            <div className="flex-shrink-0 border-t pt-3 pb-2 flex justify-end gap-2 bg-white sticky bottom-0">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent
            resizable={false}
            className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none m-0 rounded-none flex flex-col p-6"
          >
            <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between border-b pb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Resultado da Importação PDF
              </DialogTitle>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Fechar</Button>
            </DialogHeader>
            {importResult && (
              <div className="flex-1 overflow-y-auto space-y-6 py-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-xl border border-green-200">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700">{importResult.inserted}</p>
                      <p className="text-xs text-green-600">Importados</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200">
                    <AlertTriangle className="h-8 w-8 text-amber-600" />
                    <div>
                      <p className="text-2xl font-bold text-amber-700">{importResult.duplicates}</p>
                      <p className="text-xs text-amber-600">Duplicados (ignorados)</p>
                    </div>
                  </div>
                  {importResult.noVehicle > 0 && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-xl border border-red-200">
                      <XCircle className="h-8 w-8 text-red-600" />
                      <div>
                        <p className="text-2xl font-bold text-red-700">{importResult.noVehicle}</p>
                        <p className="text-xs text-red-600">Sem veículo</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-200">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-700">{importResult.totalParsed}</p>
                      <p className="text-xs text-blue-600">Total no PDF</p>
                    </div>
                  </div>
                </div>

                {importResult.totalParsed === 0 && importResult.inserted === 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <p className="font-medium mb-1">Nenhum registro encontrado no PDF</p>
                    <p className="text-xs">Verifique se o PDF é do sistema do posto de combustível (Posto Gestor) e contém as placas cadastradas no sistema.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {importResult.matchedDrivers?.length > 0 && (
                    <div className="border rounded-xl overflow-hidden">
                      <div className="bg-green-50 dark:bg-green-950 px-4 py-2.5 border-b border-green-200">
                        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Motoristas vinculados a funcionários ({importResult.matchedDrivers.length})
                        </p>
                      </div>
                      <div className="divide-y max-h-[40vh] overflow-y-auto">
                        {importResult.matchedDrivers.map((m: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            <span>{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {importResult.unmatchedDrivers?.length > 0 && (
                    <div className="border rounded-xl overflow-hidden">
                      <div className="bg-amber-50 dark:bg-amber-950 px-4 py-2.5 border-b border-amber-200">
                        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Motoristas não encontrados no cadastro ({importResult.unmatchedDrivers.length})
                        </p>
                      </div>
                      <div className="divide-y max-h-[40vh] overflow-y-auto">
                        {importResult.unmatchedDrivers.map((d: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            <span>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent
            resizable={false}
            className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none m-0 rounded-none flex flex-col p-0"
          >
            <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between border-b px-6 py-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Revisão da Importação — Validar Motoristas
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={confirmImportMut.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {confirmImportMut.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                  ) : (
                    <><Check className="h-4 w-4 mr-2" />Confirmar Importação ({previewData?.records?.filter((r: any) => !r.isDuplicate).length || 0} registros)</>
                  )}
                </Button>
              </div>
            </DialogHeader>
            {previewData && (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-xl border border-green-200">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700">{previewData.records.filter((r: any) => !r.isDuplicate).length}</p>
                      <p className="text-xs text-green-600">Novos registros</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200">
                    <AlertTriangle className="h-8 w-8 text-amber-600" />
                    <div>
                      <p className="text-2xl font-bold text-amber-700">{previewData.duplicates}</p>
                      <p className="text-xs text-amber-600">Duplicados (ignorados)</p>
                    </div>
                  </div>
                  {previewData.noVehicle > 0 && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-xl border border-red-200">
                      <XCircle className="h-8 w-8 text-red-600" />
                      <div>
                        <p className="text-2xl font-bold text-red-700">{previewData.noVehicle}</p>
                        <p className="text-xs text-red-600">Sem veículo</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-200">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-700">{previewData.totalParsed}</p>
                      <p className="text-xs text-blue-600">Total no PDF</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-b pb-3">
                  <Button
                    variant={reviewTab === "matched" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReviewTab("matched")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Matches Automáticos ({previewData.matchedDrivers?.length || 0})
                  </Button>
                  <Button
                    variant={reviewTab === "unmatched" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReviewTab("unmatched")}
                    className={reviewTab !== "unmatched" && previewData.unmatchedDrivers?.length > 0 ? "border-amber-400 text-amber-700" : ""}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    Não Encontrados ({previewData.unmatchedDrivers?.length || 0})
                  </Button>
                  <div className="ml-auto flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-8 w-60"
                      placeholder="Buscar motorista..."
                      value={reviewSearch}
                      onChange={e => setReviewSearch(e.target.value)}
                    />
                  </div>
                </div>

                {reviewTab === "matched" && (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="bg-green-50 dark:bg-green-950 px-4 py-2.5 border-b border-green-200">
                      <p className="text-sm font-semibold text-green-800">
                        Valide os matches — clique em "Rejeitar" para manter o nome original do PDF, ou selecione outro funcionário
                      </p>
                    </div>
                    <div className="divide-y max-h-[55vh] overflow-y-auto">
                      {(previewData.matchedDrivers || [])
                        .filter((m: any) => {
                          if (!reviewSearch) return true;
                          const s = reviewSearch.toLowerCase();
                          return m.pdfName.toLowerCase().includes(s) || m.employeeName.toLowerCase().includes(s);
                        })
                        .map((m: any, i: number) => {
                          const isRejected = rejectedMatches.has(m.pdfName);
                          const hasOverride = !!driverOverrides[m.pdfName];
                          return (
                            <div key={i} className={`flex items-center gap-3 px-4 py-3 ${isRejected ? "bg-red-50/50" : hasOverride ? "bg-blue-50/50" : "hover:bg-muted/30"}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-muted-foreground truncate max-w-[200px]">{m.pdfName}</span>
                                  <span className="text-muted-foreground">→</span>
                                  {hasOverride ? (
                                    <span className="font-semibold text-blue-700">{driverOverrides[m.pdfName]}</span>
                                  ) : isRejected ? (
                                    <span className="font-semibold text-red-600 line-through">{m.employeeName}</span>
                                  ) : (
                                    <span className="font-semibold text-green-700">{m.employeeName}</span>
                                  )}
                                  <Badge variant="outline" className="text-[10px] ml-1">
                                    {m.source === 'alias' ? 'Alias' : 'Fuzzy'}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Select
                                  value={driverOverrides[m.pdfName] || "__none__"}
                                  onValueChange={(v) => {
                                    if (v === "__none__") {
                                      const next = { ...driverOverrides };
                                      delete next[m.pdfName];
                                      setDriverOverrides(next);
                                    } else {
                                      setDriverOverrides({ ...driverOverrides, [m.pdfName]: v });
                                      const next = new Set(rejectedMatches);
                                      next.delete(m.pdfName);
                                      setRejectedMatches(next);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-52 text-xs">
                                    <SelectValue placeholder="Alterar para..." />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    <SelectItem value="__none__">— Manter match original —</SelectItem>
                                    {(previewData.employees || []).map((emp: any) => (
                                      <SelectItem key={emp.id} value={emp.nomeCompleto}>{emp.nomeCompleto}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {!hasOverride && (
                                  <Button
                                    variant={isRejected ? "default" : "outline"}
                                    size="sm"
                                    className={`h-8 text-xs ${isRejected ? "bg-red-600 hover:bg-red-700" : "border-red-300 text-red-600 hover:bg-red-50"}`}
                                    onClick={() => {
                                      const next = new Set(rejectedMatches);
                                      if (isRejected) next.delete(m.pdfName);
                                      else next.add(m.pdfName);
                                      setRejectedMatches(next);
                                    }}
                                  >
                                    {isRejected ? "Restaurar" : "Rejeitar"}
                                  </Button>
                                )}
                                {!isRejected && !hasOverride && (
                                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      {(previewData.matchedDrivers || []).length === 0 && (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          Nenhum match automático encontrado
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {reviewTab === "unmatched" && (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="bg-amber-50 dark:bg-amber-950 px-4 py-2.5 border-b border-amber-200">
                      <p className="text-sm font-semibold text-amber-800">
                        Motoristas do PDF que não foram encontrados — selecione um funcionário para vincular (ou deixe em branco para manter o nome original)
                      </p>
                    </div>
                    <div className="divide-y max-h-[55vh] overflow-y-auto">
                      {(previewData.unmatchedDrivers || [])
                        .filter((d: string) => !reviewSearch || d.toLowerCase().includes(reviewSearch.toLowerCase()))
                        .map((d: string, i: number) => {
                          const hasOverride = !!driverOverrides[d];
                          return (
                            <div key={i} className={`flex items-center gap-3 px-4 py-3 ${hasOverride ? "bg-green-50/50" : "hover:bg-muted/30"}`}>
                              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{d}</span>
                                {hasOverride && (
                                  <span className="text-sm text-green-700 ml-2">→ {driverOverrides[d]}</span>
                                )}
                              </div>
                              <Select
                                value={driverOverrides[d] || "__none__"}
                                onValueChange={(v) => {
                                  if (v === "__none__") {
                                    const next = { ...driverOverrides };
                                    delete next[d];
                                    setDriverOverrides(next);
                                  } else {
                                    setDriverOverrides({ ...driverOverrides, [d]: v });
                                  }
                                }}
                              >
                                <SelectTrigger className={`h-8 w-64 text-xs ${hasOverride ? "border-green-400" : ""}`}>
                                  <SelectValue placeholder="Vincular a funcionário..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                  <SelectItem value="__none__">— Manter nome do PDF —</SelectItem>
                                  {(previewData.employees || []).map((emp: any) => (
                                    <SelectItem key={emp.id} value={emp.nomeCompleto}>{emp.nomeCompleto}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {hasOverride && (
                                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      {(previewData.unmatchedDrivers || []).length === 0 && (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          Todos os motoristas foram encontrados no cadastro
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground space-y-1">
                  <p><strong>Resumo da validação:</strong></p>
                  <p>• {(previewData.matchedDrivers || []).length - rejectedMatches.size} match(es) aprovado(s)</p>
                  {rejectedMatches.size > 0 && <p>• {rejectedMatches.size} match(es) rejeitado(s) — nome do PDF será mantido</p>}
                  {Object.keys(driverOverrides).length > 0 && <p>• {Object.keys(driverOverrides).length} vinculação(ões) manual(is) — serão salvas como alias para futuras importações</p>}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={consolidateDialogOpen} onOpenChange={setConsolidateDialogOpen}>
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
                  <p><strong>Valor:</strong> {fmt(fuelSummary.data?.totalValor || 0)}</p>
                  <p><strong>Litros:</strong> {(fuelSummary.data?.totalLitros || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}L</p>
                  <p><strong>Abastecimentos:</strong> {fuelSummary.data?.qtd || 0} ({fuelSummary.data?.veiculos || 0} veículos)</p>
                  <p><strong>Competência:</strong> {MESES_ABREV[mesAtual - 1]}/{anoAtual}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Observações (opcional)</Label>
                <Textarea className="mt-1" rows={3} value={consolidateObs} onChange={e => setConsolidateObs(e.target.value)} placeholder="Observações adicionais..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConsolidateDialogOpen(false)}>Cancelar</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => consolidateMut.mutate({ companyId: cId, mes: mesAtual, ano: anoAtual, observacoes: consolidateObs || undefined })}
                disabled={consolidateMut.isPending}
              >
                {consolidateMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                {consolidateMut.isPending ? "Processando..." : "Confirmar Consolidação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={clearMonthDialogOpen} onOpenChange={setClearMonthDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Limpar Registros do Mês
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm">
                Tem certeza que deseja excluir <strong>todos os {list.length} registro(s)</strong> de combustível do mês <strong>{String(mesAtual).padStart(2, "0")}/{anoAtual}</strong>?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Esta ação não pode ser desfeita.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearMonthDialogOpen(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => clearMonthMut.mutate({ companyId: cId, mes: mesAtual, ano: anoAtual })}
                disabled={clearMonthMut.isPending}
              >
                {clearMonthMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                {clearMonthMut.isPending ? "Excluindo..." : "Excluir Registros do Mês"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={clearAllDialogOpen} onOpenChange={(o) => { setClearAllDialogOpen(o); if (!o) setClearAllPassword(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Lock className="h-5 w-5" /> Limpar TODOS os Registros de Combustível
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                <strong>ATENÇÃO:</strong> Esta ação irá excluir TODOS os registros de combustível de todos os meses do sistema. Esta ação não pode ser desfeita.
              </div>
              <div>
                <Label className="text-sm font-medium">Digite sua senha para confirmar</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore
                  className="mt-1"
                  placeholder="Sua senha de acesso"
                  value={clearAllPassword}
                  onChange={e => setClearAllPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && clearAllPassword.length > 0 && !clearAllMut.isPending) {
                      clearAllMut.mutate({ companyId: cId, password: clearAllPassword });
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setClearAllDialogOpen(false); setClearAllPassword(""); }}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => clearAllMut.mutate({ companyId: cId, password: clearAllPassword })}
                disabled={clearAllMut.isPending || clearAllPassword.length === 0}
              >
                {clearAllMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                {clearAllMut.isPending ? "Excluindo..." : "Excluir TUDO"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
          <DialogContent
            resizable={false}
            className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none m-0 rounded-none flex flex-col p-6"
          >
            <DialogHeader className="flex-shrink-0 border-b pb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Users className="h-5 w-5" /> Gestão de Motoristas — Mesclar Nomes
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione os nomes duplicados e defina o nome correto. O sistema lembrará e aplicará automaticamente nas próximas importações.
              </p>

              {driverNames.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="space-y-1 flex-1 overflow-y-auto border rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Motoristas encontrados ({driverNames.data?.drivers?.length || 0})</p>
                    {driverNames.data?.drivers?.map((d: any) => {
                      const isSelected = selectedDrivers.includes(d.motorista);
                      return (
                        <div
                          key={d.motorista}
                          className={`flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-muted/50"}`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedDrivers(prev => prev.filter(x => x !== d.motorista));
                            } else {
                              setSelectedDrivers(prev => [...prev, d.motorista]);
                              if (!canonicalName) setCanonicalName(d.motorista);
                            }
                          }}
                        >
                          <Checkbox checked={isSelected} />
                          <div className="flex-1">
                            <span className="text-sm font-medium">{d.motorista}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">{d.qtd}x</Badge>
                        </div>
                      );
                    })}
                    {(!driverNames.data?.drivers || driverNames.data.drivers.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum motorista encontrado</p>
                    )}
                  </div>

                  {selectedDrivers.length >= 2 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <GitMerge className="h-4 w-4" /> Nome correto (canônico)
                      </Label>
                      <Input
                        value={canonicalName}
                        onChange={e => setCanonicalName(e.target.value)}
                        placeholder="Digite o nome correto do motorista"
                      />
                      <p className="text-xs text-muted-foreground">
                        Os {selectedDrivers.length} nomes selecionados serão mesclados para: <strong>{canonicalName || "..."}</strong>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {selectedDrivers.map(s => (
                          <Badge key={s} variant="outline" className="text-xs cursor-pointer" onClick={() => setCanonicalName(s)}>
                            {s === canonicalName ? <Check className="h-3 w-3 mr-1 text-green-600" /> : null}
                            {s}
                          </Badge>
                        ))}
                      </div>
                      <Button
                        className="w-full"
                        disabled={!canonicalName || mergeDriversMut.isPending}
                        onClick={() => mergeDriversMut.mutate({
                          companyId: cId,
                          canonicalName: canonicalName.trim(),
                          aliasNames: selectedDrivers.filter(s => s.trim().toUpperCase() !== canonicalName.trim().toUpperCase()),
                          updateExisting: true,
                        })}
                      >
                        {mergeDriversMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitMerge className="h-4 w-4 mr-1" />}
                        {mergeDriversMut.isPending ? "Mesclando..." : "Mesclar Nomes Selecionados"}
                      </Button>
                    </div>
                  )}

                  {selectedDrivers.length === 1 && (
                    <p className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> Selecione pelo menos 2 nomes para mesclar.
                    </p>
                  )}

                  {driverNames.data?.aliases && driverNames.data.aliases.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Mapeamentos salvos ({driverNames.data.aliases.length})</p>
                      <div className="space-y-1 overflow-y-auto">
                        {driverNames.data.aliases.map((a: any) => (
                          <div key={a.id} className="flex items-center gap-2 text-sm bg-muted/30 rounded-md px-2 py-1">
                            <span className="text-muted-foreground line-through">{a.alias_name}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium text-green-700">{a.canonical_name}</span>
                            <Button
                              variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0 text-red-400 hover:text-red-600"
                              onClick={() => deleteAliasMut.mutate({ companyId: cId, id: a.id })}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDriverDialogOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {previewAnexo && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center" onClick={() => setPreviewAnexo(null)}>
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 z-10" onClick={() => setPreviewAnexo(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={previewAnexo} alt="Cupom Fiscal" className="max-w-[95vw] max-h-[95vh] object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <Dialog open={!!confirmDlg} onOpenChange={v => { if (!v) setConfirmDlg(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 whitespace-pre-line">{confirmDlg?.msg}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDlg(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => { confirmDlg?.onOk(); setConfirmDlg(null); }}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
