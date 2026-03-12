import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2,
  Loader2, Search, ArrowLeft, Building2, ChevronRight,
  TrendingDown, DollarSign, Target, BarChart3, SkipForward,
  FileCheck, CircleDot,
} from "lucide-react";
import { toast } from "sonner";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res((reader.result as string).split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}
function readAsArrayBuffer(file: File, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    reader.onload  = () => res(reader.result as ArrayBuffer);
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

type Step = "obra" | "custo" | "bdi" | "done";

type AnalyzeResult = {
  ok: boolean;
  abas: string[];
  abasIgnoradas: string[];
  rowCount: number;
  errors: string[];
  warnings: string[];
};

type ResultCusto = {
  id: number;
  totalCusto: number;
  totalVenda: number;
  totalMeta: number;
  itemCount: number;
};

type ResultBdi = {
  bdiPercentual: number;
  linhasCount: number;
  abasImportadas: string[];
  totalVenda: number;
};

/* ─── Análise da planilha de custo (EAP) ─────────────────────── */
async function analisarCusto(
  file: File,
  setProgress: (p: number) => void,
): Promise<AnalyzeResult> {
  setProgress(5);
  const buffer = await readAsArrayBuffer(file, p => setProgress(5 + p * 40));
  setProgress(50);
  const xlsxMod = await import("xlsx");
  const XLSX = xlsxMod.default ?? xlsxMod;
  setProgress(60);
  const wb = XLSX.read(buffer, { type: "array" });
  setProgress(70);

  const todasAbas = wb.SheetNames as string[];
  const errors: string[] = [];
  const warnings: string[] = [];
  let rowCount = 0;

  const isOrc  = (n: string) => { const l = n.toLowerCase(); return l.includes("orçamento") || l.includes("orcamento") || l === "orc"; };
  const isIns  = (n: string) => n.toLowerCase() === "insumos";
  const isCpu  = (n: string) => { const l = n.toLowerCase(); return l === "cpus" || l === "cpu" || l.includes("composiç") || l.includes("composic"); };

  const orcTab  = todasAbas.find(isOrc);
  const insTab  = todasAbas.find(isIns);
  const cpuTab  = todasAbas.find(isCpu);

  const abasReconhecidas: string[] = [];
  const abasIgnoradas: string[]    = [];

  for (const n of todasAbas) {
    if (isOrc(n) || isIns(n) || isCpu(n)) abasReconhecidas.push(n);
    else abasIgnoradas.push(n);
  }

  if (!orcTab) {
    errors.push('Aba "Orçamento" não encontrada — é obrigatória');
  } else {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[orcTab], {
      header: 1, defval: "",
    }) as string[][];
    setProgress(80);
    let headerRow = -1;
    for (let i = 0; i < Math.min(30, data.length); i++) {
      if (String(data[i][10] || "").trim() === "Item") { headerRow = i; break; }
    }
    if (headerRow === -1) {
      errors.push('Cabeçalho com coluna "Item" (col K) não encontrado — verifique se a planilha segue o padrão FC Engenharia');
    } else {
      for (let i = headerRow + 1; i < data.length; i++) {
        if (String(data[i][10] || "").trim() && String(data[i][15] || "").trim()) rowCount++;
      }
      if (rowCount === 0) errors.push("Nenhum item encontrado após o cabeçalho");
    }
  }

  if (!insTab) warnings.push('Aba "Insumos" não encontrada — Curva ABC será gerada a partir dos dados do orçamento');
  if (!cpuTab) warnings.push('Aba "CPUs" não encontrada — composições unitárias não serão importadas');

  setProgress(100);
  return { ok: errors.length === 0, abas: abasReconhecidas, abasIgnoradas, rowCount, errors, warnings };
}

/* ─── Análise da planilha BDI ─────────────────────────────────── */
async function analisarBdi(
  file: File,
  setProgress: (p: number) => void,
): Promise<AnalyzeResult> {
  setProgress(5);
  const buffer = await readAsArrayBuffer(file, p => setProgress(5 + p * 40));
  setProgress(50);
  const xlsxMod2 = await import("xlsx");
  const XLSX = xlsxMod2.default ?? xlsxMod2;
  setProgress(60);
  const wb = XLSX.read(buffer, { type: "array" });
  setProgress(70);

  const abas = wb.SheetNames;
  const errors: string[] = [];
  const warnings: string[] = [];
  let rowCount = 0;
  let foundB02 = false;

  const bdiAbas = abas.filter((n: string) => {
    const l = n.toLowerCase();
    return !["orçamento", "orcamento", "orc", "abc insumos", "pln_imp"].includes(l);
  });

  if (bdiAbas.length === 0) {
    errors.push("Nenhuma aba de BDI encontrada na planilha");
  } else {
    for (const aba of bdiAbas) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: "" }) as string[][];
      rowCount += data.length;
      for (const row of data) {
        const c1 = String(row[1] || "").trim().toUpperCase();
        const c2 = String(row[2] || "").trim().toUpperCase();
        if (c1 === "B-02" || c2 === "B-02") { foundB02 = true; break; }
      }
      if (foundB02) break;
    }
    if (!foundB02)
      warnings.push("Linha B-02 (%BDI total) não encontrada — BDI% será calculado pelo sistema");
  }

  setProgress(100);
  return { ok: errors.length === 0, abas: bdiAbas, abasIgnoradas: [], rowCount, errors, warnings };
}

/* ─── Barra de progresso ──────────────────────────────────────── */
function ProgressBar({ value, label, color = "bg-blue-500" }: {
  value: number; label?: string; color?: string;
}) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <p className="text-xs text-right text-muted-foreground font-mono">{Math.round(value)}%</p>
    </div>
  );
}

/* ─── Resultado de análise ────────────────────────────────────── */
function AnalyzePanel({ result }: { result: AnalyzeResult }) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 text-xs ${result.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
      <div className="flex items-center gap-2 font-semibold">
        {result.ok
          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
          : <AlertCircle  className="h-4 w-4 text-red-600"   />}
        <span className={result.ok ? "text-green-700" : "text-red-700"}>
          {result.ok ? "Planilha validada com sucesso" : "Erros encontrados na planilha"}
        </span>
        {result.ok && result.rowCount > 0 && (
          <span className="ml-auto text-green-600 font-mono">{result.rowCount} itens encontrados</span>
        )}
      </div>
      {result.errors.map((e, i) => (
        <div key={i} className="flex gap-2 text-red-700">
          <span className="shrink-0">✗</span> <span>{e}</span>
        </div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={i} className="flex gap-2 text-amber-700">
          <span className="shrink-0">⚠</span> <span>{w}</span>
        </div>
      ))}
      {result.ok && result.abas.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-green-600 font-medium uppercase tracking-wide self-center mr-1">Importando:</span>
            {result.abas.map(a => (
              <span key={a} className="px-2 py-0.5 rounded bg-green-200 text-green-800 font-medium">{a}</span>
            ))}
          </div>
          {result.abasIgnoradas.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wide self-center mr-1">Ignoradas:</span>
              {result.abasIgnoradas.map(a => (
                <span key={a} className="px-2 py-0.5 rounded bg-slate-100 text-slate-400 line-through">{a}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Dropzone ────────────────────────────────────────────────── */
function Dropzone({ onFile, file, onRemove, accept = ".xlsx,.xlsm,.xls" }: {
  onFile: (f: File) => void; file: File | null; onRemove: () => void; accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  if (file) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors"
    >
      <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm font-medium text-muted-foreground">Arraste o arquivo ou clique para selecionar</p>
      <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: xlsx, xlsm, xls</p>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

/* ─── Stepper header ──────────────────────────────────────────── */
function Stepper({ current }: { current: Step }) {
  const steps: { key: Step; label: string; desc: string }[] = [
    { key: "obra",  label: "1", desc: "Selecionar Obra"   },
    { key: "custo", label: "2", desc: "Planilha de Custo" },
    { key: "bdi",   label: "3", desc: "Planilha BDI"      },
    { key: "done",  label: "4", desc: "Resultado"         },
  ];
  const idx = steps.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => {
        const done    = i < idx;
        const active  = i === idx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                ${done   ? "bg-green-500 border-green-500 text-white"  : ""}
                ${active ? "bg-primary  border-primary  text-white"    : ""}
                ${!done && !active ? "bg-muted border-border text-muted-foreground" : ""}
              `}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : s.label}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap font-medium
                ${active ? "text-primary" : done ? "text-green-600" : "text-muted-foreground"}`}>
                {s.desc}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < idx ? "bg-green-400" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function OrcamentoImportar() {
  const [, navigate]  = useLocation();
  const { user }      = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;

  const [step, setStep] = useState<Step>("obra");

  /* Obra */
  const [search, setSearch]             = useState("");
  const [selectedObra, setSelectedObra] = useState<any>(null);

  /* Custo */
  const [fileCusto, setFileCusto]             = useState<File | null>(null);
  const [analyzingCusto, setAnalyzingCusto]   = useState(false);
  const [analyzeProgCusto, setAnalyzeProgCusto] = useState(0);
  const [analyzeResCusto, setAnalyzeResCusto] = useState<AnalyzeResult | null>(null);
  const [metaPerc, setMetaPerc]               = useState(20);
  const [importingCusto, setImportingCusto]   = useState(false);
  const [importProgCusto, setImportProgCusto] = useState(0);
  const [resultCusto, setResultCusto]         = useState<ResultCusto | null>(null);

  /* BDI */
  const [fileBdi, setFileBdi]               = useState<File | null>(null);
  const [analyzingBdi, setAnalyzingBdi]     = useState(false);
  const [analyzeProgBdi, setAnalyzeProgBdi] = useState(0);
  const [analyzeResBdi, setAnalyzeResBdi]   = useState<AnalyzeResult | null>(null);
  const [importingBdi, setImportingBdi]     = useState(false);
  const [importProgBdi, setImportProgBdi]   = useState(0);
  const [resultBdi, setResultBdi]           = useState<ResultBdi | null>(null);

  const obrasQ = trpc.obras.list.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId },
  );

  const importarMut   = trpc.orcamento.importar.useMutation();
  const importarBdiMut = trpc.orcamento.importarBdi.useMutation();

  const obras = (obrasQ.data ?? []).filter((o: any) =>
    !search || o.nome.toLowerCase().includes(search.toLowerCase()) ||
    (o.numOrcamento || "").toLowerCase().includes(search.toLowerCase())
  );

  /* ── selecionar arquivo custo → analisa automaticamente ── */
  const onFileCusto = useCallback(async (f: File) => {
    setFileCusto(f);
    setAnalyzeResCusto(null);
    setAnalyzingCusto(true);
    setAnalyzeProgCusto(0);
    try {
      const res = await analisarCusto(f, setAnalyzeProgCusto);
      setAnalyzeResCusto(res);
    } catch (err: any) {
      setAnalyzeResCusto({ ok: false, abas: [], rowCount: 0, errors: [err.message || "Erro ao ler o arquivo"], warnings: [] });
    } finally {
      setAnalyzingCusto(false);
    }
  }, []);

  /* ── selecionar arquivo BDI → analisa automaticamente ── */
  const onFileBdi = useCallback(async (f: File) => {
    setFileBdi(f);
    setAnalyzeResBdi(null);
    setAnalyzingBdi(true);
    setAnalyzeProgBdi(0);
    try {
      const res = await analisarBdi(f, setAnalyzeProgBdi);
      setAnalyzeResBdi(res);
    } catch (err: any) {
      setAnalyzeResBdi({ ok: false, abas: [], rowCount: 0, errors: [err.message || "Erro ao ler o arquivo"], warnings: [] });
    } finally {
      setAnalyzingBdi(false);
    }
  }, []);

  /* ── importar planilha de custo ── */
  const handleImportarCusto = async () => {
    if (!fileCusto || !companyId) return;
    setImportingCusto(true);
    setImportProgCusto(0);

    const interval = setInterval(() => {
      setImportProgCusto(p => p >= 88 ? p : p + (Math.random() * 4 + 1));
    }, 600);

    try {
      const base64 = await fileToBase64(fileCusto);
      const res = await importarMut.mutateAsync({
        companyId,
        obraId:          selectedObra?.id ?? undefined,
        fileBase64:      base64,
        fileName:        fileCusto.name,
        metaPercentual:  metaPerc / 100,
        userName:        (user as any)?.username || (user as any)?.name || "sistema",
      });
      clearInterval(interval);
      setImportProgCusto(100);
      setResultCusto({
        id:         res.id,
        totalCusto: parseFloat(res.totalCusto as any ?? "0"),
        totalVenda: parseFloat(res.totalVenda as any ?? "0"),
        totalMeta:  parseFloat(res.totalMeta  as any ?? "0"),
        itemCount:  res.itemCount,
      });
      toast.success(`Planilha de custo importada — ${res.itemCount} itens`);
      setTimeout(() => setStep("bdi"), 800);
    } catch (err: any) {
      clearInterval(interval);
      setImportProgCusto(0);
      toast.error(err.message || "Erro ao importar planilha de custo");
    } finally {
      setImportingCusto(false);
    }
  };

  /* ── importar BDI ── */
  const handleImportarBdi = async () => {
    if (!fileBdi || !companyId || !resultCusto) return;
    setImportingBdi(true);
    setImportProgBdi(0);

    const interval = setInterval(() => {
      setImportProgBdi(p => p >= 88 ? p : p + (Math.random() * 4 + 1));
    }, 600);

    try {
      const base64 = await fileToBase64(fileBdi);
      const res = await importarBdiMut.mutateAsync({
        companyId,
        orcamentoId: resultCusto.id,
        fileBase64:  base64,
        fileName:    fileBdi.name,
      });
      clearInterval(interval);
      setImportProgBdi(100);
      const bdiPct = res.bdiPercentual || 0;
      const totalVenda = resultCusto.totalCusto * (1 + bdiPct);
      setResultBdi({
        bdiPercentual:   bdiPct,
        linhasCount:     res.linhasCount,
        abasImportadas:  res.abasImportadas ?? [],
        totalVenda,
      });
      toast.success(`BDI importado — ${(bdiPct * 100).toFixed(2)}% · ${res.linhasCount} linhas`);
      setTimeout(() => setStep("done"), 800);
    } catch (err: any) {
      clearInterval(interval);
      setImportProgBdi(0);
      toast.error(err.message || "Erro ao importar BDI");
    } finally {
      setImportingBdi(false);
    }
  };

  /* ── pular BDI ── */
  const handlePularBdi = () => setStep("done");

  /* ── remover arquivo ── */
  const removeCusto = () => { setFileCusto(null); setAnalyzeResCusto(null); setAnalyzeProgCusto(0); };
  const removeBdi   = () => { setFileBdi(null);   setAnalyzeResBdi(null);   setAnalyzeProgBdi(0);   };

  /* ═════════════════════════════════════════════════════════════ */
  return (
    <DashboardLayout>
      <div className="p-4 max-w-2xl mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/orcamento/lista")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold">Novo Orçamento</h1>
            <p className="text-xs text-muted-foreground">Importe a planilha de custo e o BDI</p>
          </div>
        </div>

        <Stepper current={step} />

        {/* ════════ STEP 1 — SELECIONAR OBRA ════════ */}
        {step === "obra" && (
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <h2 className="font-semibold text-base mb-1">Vincular a uma Obra</h2>
                <p className="text-xs text-muted-foreground">Selecione a obra correspondente a este orçamento (opcional)</p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar obra..." className="pl-9" value={search}
                  onChange={e => setSearch(e.target.value)} />
              </div>

              <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg border">
                {obrasQ.isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : obras.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma obra encontrada</div>
                ) : obras.map((o: any) => (
                  <button key={o.id} onClick={() => setSelectedObra(o)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors
                      ${selectedObra?.id === o.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
                  >
                    <Building2 className={`h-4 w-4 shrink-0 ${selectedObra?.id === o.id ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{o.nome}</p>
                      {o.numOrcamento && <p className="text-xs text-muted-foreground">{o.numOrcamento}</p>}
                    </div>
                    {selectedObra?.id === o.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>

              {selectedObra && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium truncate">{selectedObra.nome}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 text-muted-foreground"
                  onClick={() => { setSelectedObra(null); setStep("custo"); }}>
                  Continuar sem vincular
                </Button>
                <Button className="flex-1" disabled={!selectedObra}
                  onClick={() => setStep("custo")}>
                  Próximo <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ════════ STEP 2 — PLANILHA DE CUSTO ════════ */}
        {step === "custo" && (
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-amber-600" />
                  Planilha Orçamentária — Custo
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Importe a planilha com a estrutura EAP, itens e custos de material e mão de obra
                </p>
              </div>

              {/* Obra selecionada */}
              {selectedObra && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{selectedObra.nome}</span>
                  <button onClick={() => setStep("obra")} className="ml-auto text-xs text-primary hover:underline">Trocar</button>
                </div>
              )}

              {/* Dropzone */}
              <div>
                <p className="text-sm font-medium mb-2">Arquivo Excel — Orçamento de Custo</p>
                <Dropzone file={fileCusto} onFile={onFileCusto} onRemove={removeCusto} />
              </div>

              {/* Progresso da análise */}
              {analyzingCusto && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Analisando planilha...
                  </p>
                  <ProgressBar value={analyzeProgCusto} color="bg-blue-500"
                    label={analyzeProgCusto < 50 ? "Lendo arquivo..." : analyzeProgCusto < 80 ? "Processando estrutura..." : "Validando colunas..."} />
                </div>
              )}

              {/* Resultado da análise */}
              {analyzeResCusto && !analyzingCusto && (
                <AnalyzePanel result={analyzeResCusto} />
              )}

              {/* Meta % (só mostra se análise OK) */}
              {analyzeResCusto?.ok && !analyzingCusto && (
                <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Percentual de Meta</p>
                      <p className="text-xs text-muted-foreground">Meta = Custo × (1 − {metaPerc}%)</p>
                    </div>
                    <span className="text-2xl font-bold text-purple-600">{metaPerc}%</span>
                  </div>
                  <Slider min={5} max={40} step={1} value={[metaPerc]}
                    onValueChange={([v]) => setMetaPerc(v)} />
                  <p className="text-xs text-muted-foreground">Padrão recomendado: 20%</p>
                </div>
              )}

              {/* Barra de progresso de importação */}
              {importingCusto && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                    Importando planilha de custo...
                  </p>
                  <ProgressBar value={importProgCusto} color="bg-amber-500"
                    label={importProgCusto < 25 ? "Enviando arquivo..." : importProgCusto < 60 ? "Processando EAP..." : importProgCusto < 85 ? "Calculando totais..." : "Finalizando..."} />
                </div>
              )}

              {importProgCusto === 100 && !importingCusto && (
                <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                  <CheckCircle2 className="h-5 w-5" /> Planilha de custo importada com sucesso!
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => setStep("obra")}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700"
                  disabled={!analyzeResCusto?.ok || analyzingCusto || importingCusto || importProgCusto === 100}
                  onClick={handleImportarCusto}
                >
                  {importingCusto
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
                    : <><FileCheck className="h-4 w-4 mr-2" /> Importar Planilha de Custo</>}
                </Button>
              </div>

              {/* Estrutura esperada */}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">Estrutura esperada da planilha</summary>
                <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-1">
                  <p>• Aba <strong>Orçamento</strong> com linha de cabeçalho contendo "Item" na coluna K</p>
                  <p>• Coluna K: código EAP · Coluna P: descrição · Coluna Q: unidade · Coluna R: quantidade</p>
                  <p>• Coluna S: Pu. Material · Coluna U: Pu. MO · Coluna AE: Pt. Material · Coluna AF: Pt. MO · Coluna AG: Total</p>
                  <p>• Aba <strong>Insumos</strong> (opcional) para gerar curva ABC</p>
                </div>
              </details>
            </CardContent>
          </Card>
        )}

        {/* ════════ STEP 3 — PLANILHA BDI ════════ */}
        {step === "bdi" && resultCusto && (
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  Planilha BDI
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Com o BDI o sistema calcula automaticamente o <strong>Preço de Venda</strong> de cada item
                </p>
              </div>

              {/* Resumo do custo importado */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-600 font-medium">Custo Total</p>
                  <p className="text-base font-bold text-amber-700">{formatBRL(resultCusto.totalCusto)}</p>
                  <p className="text-xs text-muted-foreground">{resultCusto.itemCount} itens importados</p>
                </div>
                <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
                  <p className="text-xs text-purple-600 font-medium">Meta ({metaPerc}%)</p>
                  <p className="text-base font-bold text-purple-700">{formatBRL(resultCusto.totalMeta)}</p>
                  <p className="text-xs text-muted-foreground">Custo × (1 − {metaPerc}%)</p>
                </div>
              </div>

              {/* Dropzone BDI */}
              <div>
                <p className="text-sm font-medium mb-2">Arquivo Excel — Planilha BDI</p>
                <Dropzone file={fileBdi} onFile={onFileBdi} onRemove={removeBdi} />
              </div>

              {/* Progresso da análise BDI */}
              {analyzingBdi && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Analisando planilha BDI...
                  </p>
                  <ProgressBar value={analyzeProgBdi} color="bg-blue-500"
                    label={analyzeProgBdi < 50 ? "Lendo arquivo..." : "Validando abas de BDI..."} />
                </div>
              )}

              {analyzeResBdi && !analyzingBdi && (
                <AnalyzePanel result={analyzeResBdi} />
              )}

              {/* Barra de progresso de importação BDI */}
              {importingBdi && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                    Importando BDI e calculando preços de venda...
                  </p>
                  <ProgressBar value={importProgBdi} color="bg-green-500"
                    label={importProgBdi < 30 ? "Enviando arquivo..." : importProgBdi < 65 ? "Processando abas BDI..." : importProgBdi < 85 ? "Recalculando preços de venda..." : "Atualizando totais..."} />
                </div>
              )}

              {importProgBdi === 100 && !importingBdi && (
                <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                  <CheckCircle2 className="h-5 w-5" /> BDI importado e preços de venda calculados!
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="text-muted-foreground"
                  onClick={handlePularBdi} disabled={importingBdi}>
                  <SkipForward className="h-4 w-4 mr-1" /> Pular BDI
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={!analyzeResBdi?.ok || analyzingBdi || importingBdi || importProgBdi === 100}
                  onClick={handleImportarBdi}
                >
                  {importingBdi
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando BDI...</>
                    : <><FileCheck className="h-4 w-4 mr-2" /> Importar BDI e Calcular Venda</>}
                </Button>
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">Estrutura esperada do BDI</summary>
                <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-1">
                  <p>• Cada aba da planilha é importada e mantida com o nome original</p>
                  <p>• Linha <strong>B-02</strong> contém o %BDI total utilizado para calcular o Preço de Venda</p>
                  <p>• Abas esperadas: BDI, Indiretos, F.D., Adm Central, Despesas Financeiras, Tributos Fiscais…</p>
                </div>
              </details>
            </CardContent>
          </Card>
        )}

        {/* ════════ STEP 4 — RESULTADO / RESUMO ════════ */}
        {step === "done" && resultCusto && (
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-lg font-bold">Orçamento Importado com Sucesso!</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedObra ? `Vinculado à obra: ${selectedObra.nome}` : "Sem vínculo com obra"}
                </p>
              </div>

              {/* Cards de resultado */}
              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-center gap-4">
                  <TrendingDown className="h-8 w-8 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Custo Direto</p>
                    <p className="text-2xl font-bold text-amber-700">{formatBRL(resultCusto.totalCusto)}</p>
                    <p className="text-xs text-muted-foreground">{resultCusto.itemCount} itens na EAP</p>
                  </div>
                </div>

                {resultBdi ? (
                  <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 flex items-center gap-4">
                    <DollarSign className="h-8 w-8 text-green-600 shrink-0" />
                    <div>
                      <p className="text-xs text-green-600 font-medium uppercase tracking-wide">
                        Preço de Venda — BDI {(resultBdi.bdiPercentual * 100).toFixed(2)}%
                      </p>
                      <p className="text-2xl font-bold text-green-700">{formatBRL(resultBdi.totalVenda)}</p>
                      <p className="text-xs text-muted-foreground">
                        BDI importado: {resultBdi.linhasCount} linhas · {resultBdi.abasImportadas.length} abas
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-muted-foreground/30 p-4 text-center text-sm text-muted-foreground">
                    Planilha BDI não importada — Preço de Venda não calculado
                  </div>
                )}

                <div className="rounded-xl border-2 border-purple-300 bg-purple-50 p-4 flex items-center gap-4">
                  <Target className="h-8 w-8 text-purple-600 shrink-0" />
                  <div>
                    <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">Meta ({metaPerc}% de redução)</p>
                    <p className="text-2xl font-bold text-purple-700">{formatBRL(resultCusto.totalMeta)}</p>
                    <p className="text-xs text-muted-foreground">Custo × (1 − {metaPerc}%)</p>
                  </div>
                </div>
              </div>

              {/* Abas BDI importadas */}
              {resultBdi && resultBdi.abasImportadas.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Abas BDI importadas:</p>
                  <div className="flex flex-wrap gap-1">
                    {resultBdi.abasImportadas.map(a => (
                      <span key={a} className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium border border-green-200">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => navigate("/orcamento/lista")}>
                  <BarChart3 className="h-4 w-4 mr-2" /> Ver Todos
                </Button>
                <Button className="flex-1" onClick={() => navigate(`/orcamento/${resultCusto.id}`)}>
                  <CircleDot className="h-4 w-4 mr-2" /> Abrir Orçamento
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
