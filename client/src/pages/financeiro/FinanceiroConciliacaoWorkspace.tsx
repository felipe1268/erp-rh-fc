import { useMemo, useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle, AlertCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, Upload,
  FileText, Sparkles, ArrowRight, ChevronLeft, ChevronRight, Landmark, Check, RotateCcw,
  Loader2, Eye, Paperclip, ExternalLink, Printer, Wallet, ListChecks, ClipboardCheck, Trash2, CalendarX,
} from "lucide-react";
import { formatConta, formatAgencia } from "@/lib/formatters";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function bancoCor(banco?: string): { bg: string; text: string } {
  const b = (banco ?? "").toLowerCase();
  if (b.includes("caixa")) return { bg: "bg-blue-100", text: "text-blue-700" };
  if (b.includes("santander")) return { bg: "bg-red-100", text: "text-red-700" };
  if (b.includes("ita")) return { bg: "bg-orange-100", text: "text-orange-700" };
  if (b.includes("bradesco")) return { bg: "bg-pink-100", text: "text-pink-700" };
  if (b.includes("brasil")) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}

const STEPS = [
  { n: 1, label: "Preparar", icon: Wallet, hint: "Conta, período e extrato" },
  { n: 2, label: "Conciliar", icon: ListChecks, hint: "Casar extrato × lançamentos" },
  { n: 3, label: "Relatório", icon: ClipboardCheck, hint: "Conferir e imprimir" },
];

export default function FinanceiroConciliacaoWorkspace() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const _now = new Date();

  // ---- Estado da sessão (persistido em localStorage p/ retomar exatamente onde parou) ----
  const [step, setStep] = useState<number>(1);
  const [ano, setAno] = useState(_now.getFullYear());
  const [mesSel, setMesSel] = useState<number | null>(_now.getMonth() + 1);
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [toleranciaDias, setToleranciaDias] = useState<number>(0);
  const [conciliadoFilter, setConciliadoFilter] = useState("all");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [selSug, setSelSug] = useState<Set<number>>(new Set());

  const restored = useRef(false);
  const LS_KEY = `conc_ws_v1_${companyId || "x"}`;
  useEffect(() => {
    if (restored.current || !companyId) return;
    try {
      const raw = localStorage.getItem(`conc_ws_v1_${companyId}`);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.step) setStep(Number(s.step));
        if (s.contaBancariaId) setContaBancariaId(String(s.contaBancariaId));
        if (typeof s.ano === "number") setAno(s.ano);
        if (s.mesSel === null || typeof s.mesSel === "number") setMesSel(s.mesSel);
        if (typeof s.toleranciaDias === "number") setToleranciaDias(Math.min(s.toleranciaDias, 7));
        if (s.conciliadoFilter) setConciliadoFilter(s.conciliadoFilter);
        if (Array.isArray(s.selSug)) setSelSug(new Set(s.selSug));
        if (s.mostrarSugestoes) setMostrarSugestoes(true);
      }
    } catch { /* ignore */ }
    restored.current = true;
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !restored.current) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        step, contaBancariaId, ano, mesSel, toleranciaDias, conciliadoFilter,
        selSug: Array.from(selSug), mostrarSugestoes,
      }));
    } catch { /* ignore */ }
  }, [LS_KEY, companyId, step, contaBancariaId, ano, mesSel, toleranciaDias, conciliadoFilter, selSug, mostrarSugestoes]);

  const { dataInicio, dataFim } = useMemo(() => {
    if (mesSel == null) return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    const mm = String(mesSel).padStart(2, "0");
    const ultimoDia = new Date(ano, mesSel, 0).getDate();
    return { dataInicio: `${ano}-${mm}-01`, dataFim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }, [ano, mesSel]);

  const diasDoMes = useMemo(() => (mesSel == null ? 31 : new Date(ano, mesSel, 0).getDate()), [ano, mesSel]);
  const tolOptions = useMemo(() => {
    const set = new Set<number>([0, 1, 2, 3, 5, 7, 10, 15, diasDoMes]);
    return Array.from(set).sort((a, b) => a - b);
  }, [diasDoMes]);

  // Trocar de mês re-sincroniza a tolerância com os dias exatos (sem sobrescrever o restore).
  const selectMes = (num: number) => { setMesSel(num); setToleranciaDias(new Date(ano, num, 0).getDate()); };

  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const [detalheEntryId, setDetalheEntryId] = useState<number | null>(null);

  // ---- Import ----
  const [showImport, setShowImport] = useState(false);
  const [importFormato, setImportFormato] = useState<"ofx" | "csv" | "pdf">("ofx");
  const [importConta, setImportConta] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [csvSeparador, setCsvSeparador] = useState(";");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Rev. 4086 — conta detectada do cabeçalho OFX (para banner de aviso no diálogo)
  const [ofxDetectedConta, setOfxDetectedConta] = useState<{ contaId: number; banco: string; apelido: string | null; conta: string } | null>(null);
  const [importRunning, setImportRunning] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importLabel, setImportLabel] = useState("");
  // Rev. 4085 — diálogo de revisão de duplicados
  const [showReviewDup, setShowReviewDup] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<{ linhas: any[]; importadoEm: string; contaId: number } | null>(null);
  const [pendingDupIndices, setPendingDupIndices] = useState<number[]>([]);
  const [reviewDupSel, setReviewDupSel] = useState<Set<string>>(new Set());
  const [reviewDupRunning, setReviewDupRunning] = useState(false);
  // Rev. 3179 — "Limpar extrato" (confirmação) + alerta de extrato de outro mês.
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [limparConciliadosCount, setLimparConciliadosCount] = useState(0);
  const [confirmLimparForcado, setConfirmLimparForcado] = useState(false);
  const [mismatch, setMismatch] = useState<{ selecionado: string; fora: number; total: number; anoNum: number; mesNum: number } | null>(null);

  // ---- Queries ----
  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery({ companyId }, { enabled: !!companyId });
  const contaSel = useMemo(() => (bankAccounts ?? []).find((b: any) => String(b.id) === contaBancariaId), [bankAccounts, contaBancariaId]);

  const { data: statements, isLoading: stLoading, refetch: refetchSt } = (trpc as any).financial.getBankStatements.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, conciliado: conciliadoFilter !== "all" ? conciliadoFilter === "conciliado" : undefined },
    { enabled: !!companyId && !!contaBancariaId }
  );
  const { data: statementsAno, refetch: refetchStAno } = (trpc as any).financial.getBankStatements.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` },
    { enabled: !!companyId && !!contaBancariaId }
  );
  const { data: accStatus, refetch: refetchAccStatus } = (trpc as any).financial.getBankAccountsConciliacaoStatus.useQuery(
    { companyId, dataInicio, dataFim }, { enabled: !!companyId }
  );
  const accStatusMap: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (const a of (accStatus ?? [])) map[Number(a.contaBancariaId)] = a.status;
    return map;
  }, [accStatus]);

  const mesesStatus: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    const byMonth: Record<number, { total: number; pend: number }> = {};
    for (const s of (statementsAno ?? [])) {
      if (!s?.data) continue;
      const raw = String(s.data);
      const d = new Date(raw.length > 10 ? raw : raw + "T00:00:00");
      if (isNaN(d.getTime())) continue;
      const m = d.getMonth() + 1;
      const b = byMonth[m] ?? { total: 0, pend: 0 };
      b.total++; if (!s.conciliado) b.pend++; byMonth[m] = b;
    }
    for (let m = 1; m <= 12; m++) {
      const b = byMonth[m];
      map[m] = !b || b.total === 0 ? "vazio" : b.pend === 0 ? "consolidado" : "lancamento";
    }
    return map;
  }, [statementsAno]);

  const { data: entriesData } = (trpc as any).financial.getEntries.useQuery(
    { companyId, dataInicio, dataFim, limit: 300 }, { enabled: !!companyId && step === 2 }
  );
  const entries: any[] = entriesData?.data ?? [];

  const { data: sugData, isFetching: sugLoading, refetch: refetchSug } = (trpc as any).financial.sugerirConciliacao.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, toleranciaDias },
    { enabled: !!companyId && !!contaBancariaId && mostrarSugestoes && step === 2 }
  );
  const sugestoes: any[] = sugData?.sugestoes ?? [];
  const semMatch: any[] = sugData?.semMatch ?? [];

  const { data: report, isFetching: reportLoading, refetch: refetchReport } = (trpc as any).financial.getConciliacaoReport.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim },
    { enabled: !!companyId && !!contaBancariaId && step === 3 }
  );

  // Detalhe consultivo do lançamento
  const detailQuery = (trpc as any).financial.getEntryDetalhe.useQuery(
    { id: detalheEntryId ?? 0, companyId }, { enabled: !!detalheEntryId && !!companyId }
  );
  const detEntry: any = detailQuery.data?.entry;
  const detOrigem: any = detailQuery.data?.origemDetalhes;
  const detOrdem: any = detailQuery.data?.ordem;
  const detItens: any[] = detailQuery.data?.itens ?? [];
  const field = (label: string, value: any, k?: string) =>
    (value === null || value === undefined || value === "" || value === "—") ? null : (
      <div key={k ?? label} className="min-w-0">
        <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-gray-800 break-words">{value}</div>
      </div>
    );

  // ---- Mutations ----
  const refetchAll = () => { refetchSt(); refetchStAno(); refetchAccStatus(); };
  const conciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); refetchAll(); setSelectedStatement(null); setSelectedEntry(null); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const conciliarSugMut = (trpc as any).financial.conciliarSugestoes.useMutation({
    onSuccess: (res: any) => { toast({ title: `${res.conciliados} de ${res.total} conciliados e baixados!` }); setSelSug(new Set()); refetchAll(); refetchSug(); },
    onError: (e: any) => toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }),
  });
  const consolidarMut = (trpc as any).financial.consolidarMes.useMutation({
    onSuccess: (res: any) => { toast({ title: `Mês consolidado! ${res.afetados} lançamento(s) marcado(s).` }); refetchAll(); },
    onError: (e: any) => toast({ title: "Erro ao consolidar", description: e.message, variant: "destructive" }),
  });
  const desconsolidarMut = (trpc as any).financial.desconsolidarMes.useMutation({
    onSuccess: (res: any) => { toast({ title: `Mês reaberto! ${res.afetados} lançamento(s) desmarcado(s).` }); refetchAll(); },
    onError: (e: any) => toast({ title: "Erro ao desconsolidar", description: e.message, variant: "destructive" }),
  });
  // Rev. 3179 — Limpar extrato importado errado (conta+período). Soft-delete no backend.
  // Rev. 3875 — REGRA DE OURO: se houver conciliados, server retorna ok=false+count;
  // dialog exibe aviso e exige checkbox antes de force=true.
  const limparMut = (trpc as any).financial.limparExtrato.useMutation({
    onSuccess: (res: any) => {
      if (!res.ok) {
        setLimparConciliadosCount(res.conciliadosCount ?? 0);
        setConfirmLimparForcado(false);
        return;
      }
      toast({ title: res.afetados > 0 ? `Extrato limpo! ${res.afetados} linha(s) removida(s).` : "Nada para limpar neste período." });
      setConfirmLimpar(false); setLimparConciliadosCount(0); setConfirmLimparForcado(false); refetchAll();
    },
    onError: (e: any) => toast({ title: "Erro ao limpar extrato", description: e.message, variant: "destructive" }),
  });
  const analyzeMut = (trpc as any).financial.analyzeBankStatement.useMutation();
  const insertBatchMut = (trpc as any).financial.insertBankStatementBatch.useMutation();
  const checkDupMut = (trpc as any).financial.checkStatementDuplicates.useMutation();

  const toggleSug = (id: number) => setSelSug(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selecionarAlta = () => setSelSug(new Set(sugestoes.filter(s => s.confianca === "alta").map(s => s.statementLineId)));
  const selecionarTodas = () => setSelSug(new Set(sugestoes.map(s => s.statementLineId)));
  const conciliarSelecionadas = () => {
    const pares = sugestoes.filter(s => selSug.has(s.statementLineId)).map(s => ({ statementLineId: s.statementLineId, entryId: s.entryId }));
    if (pares.length === 0) { toast({ title: "Selecione ao menos uma sugestão", variant: "destructive" }); return; }
    conciliarSugMut.mutate({ companyId, pares });
  };

  // Rev. 4086 — helpers de detecção de conta OFX (idênticos ao FinanceiroConciliacao)
  function extractOfxAccountInfo(text: string): { bankId: string; acctId: string } | null {
    const getTag = (tag: string) => { const m = text.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i")); return m ? m[1].trim() : ""; };
    const acctId = getTag("ACCTID");
    if (!acctId) return null;
    return { bankId: getTag("BANKID"), acctId };
  }
  function matchOfxToConta(bankId: string, acctId: string, accounts: any[]): any | null {
    const norm = (s: string) => (s || "").replace(/\D/g, "").replace(/^0+/, "") || s;
    const aN = norm(acctId), bN = norm(bankId);
    return accounts.find(a => {
      const da = norm(String(a.conta || "")), db = norm(String(a.codigoBanco || ""));
      return da === aN && (!bankId || !db || db === bN);
    }) ?? null;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImagem = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"].includes(ext);
    if (isImagem) {
      e.target.value = "";
      toast({ title: "Imagem não é lida automaticamente", description: "Envie o PDF do internet banking, ou um arquivo OFX/CSV.", variant: "destructive" });
      return;
    }
    setImportFileName(file.name);
    setOfxDetectedConta(null);
    const reader = new FileReader();
    if (ext === "pdf") {
      setImportFormato("pdf");
      reader.onload = (ev) => { const res = (ev.target?.result as string) ?? ""; setImportContent(res.replace(/^data:[^,]*,/, "")); };
      reader.readAsDataURL(file);
    } else {
      if (ext === "ofx" || ext === "qfx") setImportFormato("ofx"); else setImportFormato("csv");
      reader.onload = (ev) => {
        const text = ev.target?.result as string ?? "";
        setImportContent(text);
        // Rev. 4086 — detectar conta do cabeçalho OFX e sugerir troca se divergir
        if (ext === "ofx" || ext === "qfx") {
          const info = extractOfxAccountInfo(text);
          if (info) {
            const matched = matchOfxToConta(info.bankId, info.acctId, (bankAccounts ?? []) as any[]);
            if (matched) setOfxDetectedConta({ contaId: Number(matched.id), banco: String(matched.banco), apelido: matched.apelido ?? null, conta: String(matched.conta) });
          }
        }
      };
      reader.readAsText(file, "ISO-8859-1");
    }
  }

  // Rev. 4085 — handleImport com FASE 1.5 (verificar duplicados antes de gravar).
  async function handleImport(skipMonthCheck = false) {
    if (!importContent) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    if (!importConta) { toast({ title: "Selecione a conta bancária", variant: "destructive" }); return; }
    const contaId = parseInt(importConta);
    setImportRunning(true); setImportPct(2); setImportLabel("Lendo e analisando o extrato...");
    try {
      const analysis: any = await analyzeMut.mutateAsync({ companyId, contaBancariaId: contaId, formato: importFormato, conteudo: importContent, csvSeparador: importFormato === "csv" ? csvSeparador : undefined });
      const linhas: any[] = analysis?.lines ?? [];
      const total = linhas.length;
      const importadoEm: string = analysis?.importadoEm;
      if (total === 0) { toast({ title: "Nenhuma transação encontrada no arquivo", variant: "destructive" }); setImportRunning(false); return; }
      // Mês divergente
      if (!skipMonthCheck && mesSel != null) {
        const selKey = `${ano}-${String(mesSel).padStart(2, "0")}`;
        const counts = new Map<string, number>();
        for (const l of linhas) { const k = String(l?.data ?? "").slice(0, 7); if (k.length === 7) counts.set(k, (counts.get(k) ?? 0) + 1); }
        let dom = ""; let domN = 0;
        for (const [k, n] of counts) { if (n > domN) { dom = k; domN = n; } }
        if (dom && dom !== selKey) {
          const fora = linhas.filter(l => String(l?.data ?? "").slice(0, 7) !== selKey).length;
          const [ay, am] = dom.split("-");
          setMismatch({ selecionado: selKey, fora, total, anoNum: parseInt(ay, 10), mesNum: parseInt(am, 10) });
          setImportRunning(false); return;
        }
      }
      // FASE 1.5 — verificar duplicados
      setImportPct(10); setImportLabel("Verificando duplicados...");
      const dupResult: any = await checkDupMut.mutateAsync({ companyId, contaBancariaId: contaId, linhas });
      const dupIndices: number[] = dupResult?.duplicateIndices ?? [];
      setImportRunning(false); setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
      if (dupIndices.length > 0) {
        setShowImport(false);
        setPendingImportData({ linhas, importadoEm, contaId });
        setPendingDupIndices(dupIndices);
        setReviewDupSel(new Set());
        setShowReviewDup(true);
        return;
      }
      await proceedWithInsert({ linhas, importadoEm, contaId }, dupIndices, new Set());
    } catch (e: any) {
      setImportRunning(false); setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
      toast({ title: "Erro na importação", description: e?.message || "Falha ao importar o extrato.", variant: "destructive" });
    }
  }

  async function proceedWithInsert(
    data: { linhas: any[]; importadoEm: string; contaId: number },
    dupIndices: number[],
    selectedDupKeys: Set<string>,
  ) {
    setImportRunning(true); setImportPct(10);
    const dupSet = new Set(dupIndices);
    const normalLinhas = data.linhas.filter((_, idx) => !dupSet.has(idx));
    const forceLinhas = dupIndices.filter(idx => selectedDupKeys.has(String(idx))).map(idx => data.linhas[idx]);
    const skippedCount = dupIndices.length - forceLinhas.length;
    const totalToInsert = normalLinhas.length + forceLinhas.length;
    let inserted = 0, processed = 0;
    const CHUNK = 40;
    try {
      for (let i = 0; i < normalLinhas.length; i += CHUNK) {
        const slice = normalLinhas.slice(i, i + CHUNK);
        const isLast = forceLinhas.length === 0 && i + CHUNK >= normalLinhas.length;
        const r: any = await insertBatchMut.mutateAsync({ companyId, contaBancariaId: data.contaId, formato: importFormato, importadoEm: data.importadoEm, linhas: slice, finalize: isLast, totalInseridos: inserted, totalDuplicados: skippedCount });
        inserted += r?.inserted ?? 0; processed += slice.length;
        setImportPct(10 + Math.round((processed / Math.max(totalToInsert, 1)) * 80));
        setImportLabel(`Gravando ${Math.min(processed, totalToInsert)} de ${totalToInsert} transações...`);
      }
      for (let i = 0; i < forceLinhas.length; i += CHUNK) {
        const slice = forceLinhas.slice(i, i + CHUNK);
        const isLast = i + CHUNK >= forceLinhas.length;
        const r: any = await insertBatchMut.mutateAsync({ companyId, contaBancariaId: data.contaId, formato: importFormato, importadoEm: data.importadoEm, linhas: slice, forceInsert: true, finalize: isLast, totalInseridos: inserted, totalDuplicados: skippedCount });
        inserted += r?.inserted ?? 0; processed += slice.length;
        setImportPct(10 + Math.round((processed / Math.max(totalToInsert, 1)) * 80));
      }
      setImportPct(100); setImportLabel("Concluído!");
      const nS = skippedCount;
      toast({ title: `Importação concluída! ${inserted} inserido${inserted !== 1 ? "s" : ""}${nS > 0 ? `, ${nS} duplicado${nS !== 1 ? "s" : ""} ignorado${nS !== 1 ? "s" : ""}` : ""}` });
      setShowImport(false); setShowReviewDup(false); setImportContent(""); setImportFileName("");
      if (!contaBancariaId) setContaBancariaId(String(data.contaId));
      refetchAll();
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e?.message || "Falha ao importar o extrato.", variant: "destructive" });
    } finally {
      setImportRunning(false); setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
    }
  }

  // ---- Agregados ----
  const allStatements: any[] = statements ?? [];
  const pendentes = allStatements.filter((s: any) => !s.conciliado);
  const conciliadosLista = allStatements.filter((s: any) => s.conciliado);
  const totalLinhas = allStatements.length;
  const pctConc = totalLinhas > 0 ? Math.round((conciliadosLista.length / totalLinhas) * 100) : 0;
  const totalEntradas = pendentes.filter((s: any) => s.tipo === "credito").reduce((a: number, s: any) => a + Number(s.valor), 0);
  const totalSaidas = pendentes.filter((s: any) => s.tipo === "debito").reduce((a: number, s: any) => a + Math.abs(Number(s.valor)), 0);

  const periodoLabel = mesSel == null ? `Ano ${ano}` : `${MESES_LONG[mesSel - 1]}/${ano}`;
  const contaLabel = contaSel ? `${contaSel.banco}${contaSel.descricao ? " · " + contaSel.descricao : ""} — Ag. ${formatAgencia(contaSel.agencia)}/${formatConta(contaSel.conta)}` : "Nenhuma conta selecionada";

  // ---- Relatório PDF / impressão ----
  function gerarRelatorioPDF() {
    if (!report) { toast({ title: "Relatório ainda carregando", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const conc: any[] = report.conciliados ?? [];
    const pend: any[] = report.extratoSemLancamento ?? [];
    const lanc: any[] = report.lancamentosSemExtrato ?? [];
    const sum = (arr: any[], f: (x: any) => any) => arr.reduce((a, x) => a + Math.abs(Number(f(x)) || 0), 0);
    const tConc = sum(conc, (c) => c.valor);
    const tPend = sum(pend, (c) => c.valor);
    const tLanc = sum(lanc, (c) => c.valor);
    const totalExtrato = conc.length + pend.length;
    const pct = totalExtrato > 0 ? Math.round((conc.length / totalExtrato) * 100) : 0;

    const rowsConc = conc.length
      ? conc.map((c) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(c.entryFornecedor || c.entryDescricao || ("Lançamento #" + (c.entryId ?? "")))}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhuma linha conciliada no período.</td></tr>`;
    const rowsPend = pend.length
      ? pend.map((c) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(c.tipo === "credito" ? "Entrada" : "Saída")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Sem pendências — todo o extrato está conciliado. 🎉</td></tr>`;
    const rowsLanc = lanc.length
      ? lanc.map((c) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhum lançamento sem extrato no período.</td></tr>`;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Conciliação ${esc(periodoLabel)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;padding:24px;font-size:12px}
  .logo{display:block;height:54px;margin:0 auto 10px}
  h1.brand{text-align:center;font-size:16px;margin:0;color:#1B2A4A;letter-spacing:.5px}
  .band{background:#1B2A4A;color:#fff;text-align:center;padding:10px;margin:14px 0;border-radius:6px;letter-spacing:3px;font-weight:bold;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:14px;flex-wrap:wrap;gap:6px}
  .cards{display:flex;gap:10px;margin:10px 0 18px;flex-wrap:wrap}
  .card{flex:1;min-width:130px;border:1px solid #e5e7eb;border-radius:8px;padding:10px}
  .card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}
  .card .val{font-size:16px;font-weight:bold;margin-top:2px}
  .green{color:#15803d}.red{color:#b91c1c}.blue{color:#1d4ed8}
  h2{font-size:13px;margin:18px 0 6px;border-left:3px solid #1B2A4A;padding-left:8px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.r,th.r{text-align:right;white-space:nowrap}
  td.empty{text-align:center;color:#9ca3af;padding:14px}
  tfoot td{font-weight:bold;background:#f9fafb}
  .foot{margin-top:18px;text-align:center;font-size:10px;color:#9ca3af}
  @media print{body{padding:10px}}
</style></head><body>
  <img class="logo" src="${window.location.origin}/logo-fc-branco-amarelo.png?v=3178" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">RELATÓRIO DE CONCILIAÇÃO BANCÁRIA</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <div class="cards">
    <div class="card"><div class="lbl">Conciliado</div><div class="val blue">${conc.length} <span style="font-size:11px">(${pct}%)</span></div><div class="lbl">${esc(formatBRL(tConc))}</div></div>
    <div class="card"><div class="lbl">Extrato sem lançamento</div><div class="val red">${pend.length}</div><div class="lbl">${esc(formatBRL(tPend))}</div></div>
    <div class="card"><div class="lbl">Lançamentos sem extrato</div><div class="val">${lanc.length}</div><div class="lbl">${esc(formatBRL(tLanc))}</div></div>
    <div class="card"><div class="lbl">Total do extrato</div><div class="val">${totalExtrato}</div><div class="lbl">linhas no período</div></div>
  </div>

  <h2>1. Extrato conciliado (${conc.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Lançamento casado</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsConc}</tbody>
  <tfoot><tr><td colspan="3">Total conciliado</td><td class="r">${esc(formatBRL(tConc))}</td></tr></tfoot></table>

  <h2>2. Extrato SEM lançamento — o que falta (${pend.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Tipo</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsPend}</tbody>
  <tfoot><tr><td colspan="3">Total pendente</td><td class="r">${esc(formatBRL(tPend))}</td></tr></tfoot></table>

  <h2>3. Lançamentos do sistema sem extrato (${lanc.length})</h2>
  <table><thead><tr><th>Data</th><th>Lançamento / Fornecedor</th><th>Obra</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsLanc}</tbody>
  <tfoot><tr><td colspan="3">Total</td><td class="r">${esc(formatBRL(tLanc))}</td></tr></tfoot></table>

  <div class="foot">Documento gerado automaticamente pelo ERP Gestão Integrada — Conciliação Bancária.</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600); }
    else { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); }
  }

  const podeAvancar = !!contaBancariaId;
  const goStep = (n: number) => { if (n === 1 || podeAvancar) setStep(n); else toast({ title: "Selecione uma conta bancária primeiro", variant: "destructive" }); };

  // ============================ RENDER ============================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="shrink-0 text-gray-600" onClick={() => setLocation("/financeiro/conciliacao")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Sair
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 leading-tight">
              <RefreshCw className="w-5 h-5 text-blue-600 shrink-0" /> Workspace de Conciliação
            </h1>
            <p className="text-xs text-gray-500 truncate">{contaLabel} · {periodoLabel}</p>
          </div>
          <Button size="sm" className="h-9 shrink-0" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> Importar Extrato
          </Button>
        </div>

        {/* Stepper */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => goStep(s.n)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all min-w-0 flex-1
                      ${active ? "border-blue-500 bg-blue-50 shadow-sm"
                        : done ? "border-green-300 bg-green-50/60 hover:bg-green-50"
                        : "border-gray-200 bg-white hover:border-gray-300"}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold
                      ${active ? "bg-blue-600 text-white" : done ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0 hidden sm:block">
                      <span className={`block text-sm font-semibold truncate ${active ? "text-blue-700" : done ? "text-green-700" : "text-gray-600"}`}>{s.n}. {s.label}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{s.hint}</span>
                    </span>
                    <span className={`sm:hidden text-sm font-semibold ${active ? "text-blue-700" : "text-gray-600"}`}>{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 hidden sm:block" />}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ====================== STEP 1 — PREPARAR ====================== */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                  <button type="button" onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"><ChevronRight className="w-4 h-4" /></button>
                  <Button type="button" variant={mesSel == null ? "default" : "outline"} size="sm" className="h-8 text-xs ml-2" onClick={() => setMesSel(null)}>Ano todo</Button>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MESES.map((m, i) => {
                  const num = i + 1; const status = mesesStatus[num]; const isSelected = mesSel === num;
                  return (
                    <button key={m} type="button" onClick={() => selectMes(num)}
                      className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                        ${isSelected ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <span>{m}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${status === "consolidado" ? "bg-green-500" : status === "lancamento" ? "bg-blue-500" : "bg-gray-300"}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Conta bancária</p>
              {(bankAccounts ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Nenhuma conta bancária cadastrada.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {(bankAccounts ?? []).map((b: any) => {
                    const isSel = contaBancariaId === String(b.id);
                    const cor = bancoCor(b.banco);
                    const accSt = accStatusMap[Number(b.id)] ?? "vazio";
                    const isConsol = accSt === "consolidado"; const isLanc = accSt === "lancamento";
                    const cardCls = isSel
                      ? (isConsol ? "border-green-500 bg-green-50 ring-1 ring-green-200 shadow-sm" : "border-blue-500 bg-blue-50 ring-1 ring-blue-200 shadow-sm")
                      : (isConsol ? "border-green-300 bg-green-50/60 hover:border-green-400" : isLanc ? "border-blue-200 bg-white hover:border-blue-300 hover:bg-blue-50/40" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50");
                    return (
                      <button key={b.id} type="button" aria-pressed={isSel} onClick={() => setContaBancariaId(isSel ? "" : String(b.id))}
                        className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${cardCls}`}>
                        <div className={`relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${cor.bg}`}>
                          <Landmark className={`h-[18px] w-[18px] ${cor.text}`} />
                          {isSel && <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-white ${isConsol ? "bg-green-500" : "bg-blue-500"}`}><Check className="h-2.5 w-2.5 text-white" /></span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">{b.banco}{b.descricao ? ` · ${b.descricao}` : ""}</p>
                          <p className="text-xs text-gray-500 font-mono tracking-wide truncate">Ag. {formatAgencia(b.agencia)} / {formatConta(b.conta)}</p>
                          <span className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${isConsol ? "bg-green-100 text-green-700" : isLanc ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                            {isConsol ? <><CheckCircle className="h-2.5 w-2.5" />Conciliado</> : isLanc ? <><AlertCircle className="h-2.5 w-2.5" />A conciliar</> : "Sem extrato"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button size="lg" disabled={!podeAvancar} onClick={() => setStep(2)}>
                Avançar para conciliação <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ====================== STEP 2 — CONCILIAR ====================== */}
        {step === 2 && (!contaBancariaId ? (
          <EmptyConta onIr={() => setStep(1)} />
        ) : (
          <div className="space-y-6">
            {/* Resumo + progresso */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniCard icon={<ArrowUpCircle className="w-4 h-4 text-green-600" />} label="Entradas pendentes" value={formatBRL(totalEntradas)} valueCls="text-green-600" />
              <MiniCard icon={<ArrowDownCircle className="w-4 h-4 text-red-500" />} label="Saídas pendentes" value={formatBRL(totalSaidas)} valueCls="text-red-500" />
              <MiniCard icon={<CheckCircle className="w-4 h-4 text-blue-600" />} label="Itens conciliados" value={String(conciliadosLista.length)} valueCls="text-blue-600" />
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">Progresso</span>
                  <span className="text-sm font-bold text-gray-800">{pctConc}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${pctConc}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {mesSel != null && mesesStatus[mesSel] === "consolidado" ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs w-full" disabled={desconsolidarMut.isPending}
                      onClick={() => desconsolidarMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}>
                      <RotateCcw className="w-3 h-3 mr-1" />{desconsolidarMut.isPending ? "Reabrindo..." : "Reabrir mês"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs w-full border-green-600 text-green-700 hover:bg-green-50" disabled={consolidarMut.isPending}
                      onClick={() => consolidarMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}>
                      <CheckCircle className="w-3 h-3 mr-1" />{consolidarMut.isPending ? "..." : "Consolidar mês"}
                    </Button>
                  )}
                </div>
                {contaBancariaId && totalLinhas > 0 && (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs w-full border-red-500 text-red-600 hover:bg-red-50" disabled={limparMut.isPending}
                      onClick={() => setConfirmLimpar(true)}>
                      <Trash2 className="w-3 h-3 mr-1" />{limparMut.isPending ? "Limpando..." : "Limpar extrato"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Sugestões automáticas */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between flex-wrap gap-2 p-4 border-b border-gray-100">
                <h2 className="text-base font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" /> Sugestões Automáticas</h2>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500">Tolerância (dias)</Label>
                  {/* Rev. 3189 — native <select> (ancorado pelo browser abaixo do campo;
                      Radix Select abria no meio da tela em modo item-aligned). */}
                  <select
                    value={String(toleranciaDias)}
                    onChange={e => setToleranciaDias(parseInt(e.target.value, 10))}
                    className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {tolOptions.map(d => <option key={d} value={String(d)}>{d === diasDoMes && mesSel != null ? `${d} (mês)` : d}</option>)}
                  </select>
                  <Button size="sm" variant={mostrarSugestoes ? "outline" : "default"} onClick={() => { setMostrarSugestoes(true); setSelSug(new Set()); if (mostrarSugestoes) refetchSug(); }} disabled={sugLoading}>
                    <Sparkles className="w-4 h-4 mr-1" />{sugLoading ? "Analisando..." : mostrarSugestoes ? "Reanalisar" : "Sugerir conciliação"}
                  </Button>
                </div>
              </div>
              {mostrarSugestoes && (
                <div className="p-4">
                  {sugLoading ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Cruzando extrato × lançamentos por valor, direção e data…</p>
                  ) : sugestoes.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Nenhuma sugestão automática para a conta/período.{sugData ? ` (${sugData.totalLinhas ?? 0} linha(s) analisada(s))` : ""}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <Button size="sm" variant="outline" onClick={selecionarAlta}>Selecionar alta confiança</Button>
                        <Button size="sm" variant="outline" onClick={selecionarTodas}>Selecionar todas</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelSug(new Set())}>Limpar</Button>
                        <Button size="sm" className="ml-auto" onClick={conciliarSelecionadas} disabled={conciliarSugMut.isPending || selSug.size === 0}>
                          <CheckCircle className="w-4 h-4 mr-1" />{conciliarSugMut.isPending ? "Conciliando..." : `Conciliar selecionadas (${selSug.size})`}
                        </Button>
                      </div>
                      <div className="border rounded-md divide-y max-h-[460px] overflow-y-auto">
                        {sugestoes.map(s => (
                          <label key={s.statementLineId} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selSug.has(s.statementLineId)} onCheckedChange={() => toggleSug(s.statementLineId)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Extrato</div>
                              <div className="text-sm font-medium truncate">{s.extratoDescricao || "—"}</div>
                              <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDetalheEntryId(s.entryId); }} title="Ver detalhes do lançamento"
                              className="flex-1 min-w-0 text-left rounded-md -m-1 p-1 hover:bg-blue-50 transition-colors group/lan">
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">Lançamento <Eye className="w-3 h-3 text-blue-400 opacity-0 group-hover/lan:opacity-100 transition-opacity" /></div>
                              <div className="text-sm font-medium truncate text-blue-700 group-hover/lan:underline">{s.entryFornecedor || s.entryDescricao || "—"}</div>
                              <div className="text-xs text-gray-500 truncate">{fmtData(s.entryData)} · {formatBRL(Math.abs(s.entryValor))}{s.entryObra ? ` · ${s.entryObra}` : ""}</div>
                            </button>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <Badge variant={s.confianca === "alta" ? "default" : "secondary"}>{s.confianca === "alta" ? "Alta" : "Média"}</Badge>
                              <span className="text-[10px] text-gray-400">{s.deltaDias === 0 ? "mesmo dia" : `±${s.deltaDias}d`}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                      {semMatch.length > 0 && <p className="text-xs text-gray-400">{semMatch.length} linha(s) de extrato sem lançamento correspondente (concilie manualmente abaixo).</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Conciliação manual */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Extrato bancário ({pendentes.length} pendentes)</h3>
                  <Select value={conciliadoFilter} onValueChange={setConciliadoFilter}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="conciliado">Conciliados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {stLoading ? <div className="p-6 text-center text-gray-500">Carregando...</div>
                  : pendentes.length === 0 ? (
                    <div className="p-6 text-center text-gray-400">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>Nenhum item pendente.</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>Importar Extrato</Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                      {pendentes.map((s: any) => (
                        <button key={s.id} onClick={() => setSelectedStatement(selectedStatement === s.id ? null : s.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedStatement === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-500">{s.data ? new Date(String(s.data).length > 10 ? s.data : s.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[200px]">{s.descricao}</p>
                            {s.nfNumero && (
                              <p className="text-[10px] text-indigo-600 font-mono mt-0.5">NF# {s.nfNumero}</p>
                            )}
                          </div>
                          <p className={`text-sm font-bold shrink-0 ${Number(s.valor) >= 0 ? "text-green-600" : "text-red-500"}`}>{formatBRL(Number(s.valor))}</p>
                        </button>
                      ))}
                    </div>
                  )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100"><h3 className="text-sm font-semibold">Lançamentos do sistema</h3></div>
                {!selectedStatement ? (
                  <div className="p-6 text-center text-gray-400 text-sm">Selecione um item do extrato à esquerda para relacionar.</div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                    {entries.filter((e: any) => !e.conciliado && e.status !== "cancelado").map((e: any) => (
                      <button key={e.id} onClick={() => setSelectedEntry(selectedEntry === e.id ? null : e.id)}
                        className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500">{e.dataCompetencia ? new Date(String(e.dataCompetencia).length > 10 ? e.dataCompetencia : e.dataCompetencia + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                          <p className="text-sm text-gray-700 truncate max-w-[200px]">{e.fornecedorNome ?? e.descricao ?? e.contaNome ?? "—"}</p>
                          <p className="text-xs text-gray-400 truncate">{e.obraNome ?? ""}</p>
                        </div>
                        <p className={`text-sm font-bold shrink-0 ${e.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>{e.tipo === "receita" ? "+" : "-"}{formatBRL(Number(e.valorRealizado ?? e.valorPrevisto))}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedStatement && selectedEntry && (
              <div className="flex justify-center">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8" disabled={conciliarMut.isPending}
                  onClick={() => conciliarMut.mutate({ companyId, statementLineId: selectedStatement, entryId: selectedEntry })}>
                  <CheckCircle className="w-4 h-4 mr-2" />{conciliarMut.isPending ? "Conciliando..." : "Conciliar selecionados"}
                </Button>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
              <Button onClick={() => setStep(3)}>Ver relatório <ArrowRight className="w-4 h-4 ml-2" /></Button>
            </div>
          </div>
        ))}

        {/* ====================== STEP 3 — RELATÓRIO ====================== */}
        {step === 3 && (!contaBancariaId ? (
          <EmptyConta onIr={() => setStep(1)} />
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-blue-600" /> Relatório de Conciliação</h2>
                <p className="text-xs text-gray-500 mt-0.5">{contaLabel} · {periodoLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => refetchReport()} disabled={reportLoading}><RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${reportLoading ? "animate-spin" : ""}`} />Atualizar</Button>
                <Button size="sm" onClick={gerarRelatorioPDF} disabled={reportLoading || !report}><Printer className="w-3.5 h-3.5 mr-1.5" />Gerar PDF / Imprimir</Button>
              </div>
            </div>

            {reportLoading ? (
              <div className="py-16 text-center text-gray-500 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Montando relatório…</div>
            ) : !report ? (
              <div className="py-16 text-center text-gray-400">Sem dados para o período.</div>
            ) : (
              <ReportBody report={report} />
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar à conciliação</Button>
            </div>
          </div>
        ))}
      </main>

      {/* Detalhe consultivo do lançamento */}
      <Dialog open={!!detalheEntryId} onOpenChange={(o) => !o && setDetalheEntryId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600 shrink-0" />{detEntry ? `Lançamento #${detEntry.id}` : "Lançamento"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {detailQuery.isLoading ? (
              <div className="py-12 text-center text-gray-500 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando lançamento…</div>
            ) : detailQuery.error ? (
              <div className="py-12 text-center text-red-600 text-sm">Erro ao carregar o lançamento: {(detailQuery.error as any)?.message ?? "tente novamente"}.</div>
            ) : detEntry ? (
              <div className="space-y-4 text-sm">
                <div className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900 break-words">{detEntry.fornecedorNome || detEntry.descricao || detEntry.contaNome || "Lançamento"}</div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {detEntry.tipo === "despesa" ? <ArrowDownCircle className="w-3.5 h-3.5 text-red-500" /> : <ArrowUpCircle className="w-3.5 h-3.5 text-green-600" />}
                      <span className="capitalize">{detEntry.tipo ?? "—"}</span>{detEntry.natureza ? <span className="text-gray-400">· {detEntry.natureza}</span> : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-bold ${detEntry.tipo === "despesa" ? "text-red-600" : "text-green-700"}`}>{formatBRL(Number(detEntry.valorRealizado ?? detEntry.valorPrevisto ?? 0))}</div>
                    <Badge variant={detEntry.status === "pago" || detEntry.status === "recebido" ? "default" : detEntry.status === "cancelado" ? "destructive" : "secondary"} className="mt-1 capitalize">{detEntry.status ?? "—"}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {field("Valor Previsto", detEntry.valorPrevisto != null ? formatBRL(Number(detEntry.valorPrevisto)) : null)}
                  {field("Valor Realizado", detEntry.valorRealizado != null ? formatBRL(Number(detEntry.valorRealizado)) : null)}
                  {field("Data Competência", fmtData(detEntry.dataCompetencia))}
                  {field("Data Vencimento", fmtData(detEntry.dataVencimento))}
                  {field("Data Pagamento", fmtData(detEntry.dataPagamento))}
                  {field("Forma de Pagamento", detEntry.formaPagamento)}
                  {field("Conta", detEntry.contaNome)}
                  {field("Obra", detEntry.obraNome)}
                  {field("Parcela", detEntry.parcelaTotal ? `${detEntry.parcelaNumero ?? 1}/${detEntry.parcelaTotal}` : null)}
                  {field("Cheque nº", detEntry.chequeNumero ? `${detEntry.chequeNumero}${detEntry.chequeBanco ? ` · ${detEntry.chequeBanco}` : ""}` : null)}
                  {field("Conciliado", Number(detEntry.conciliado) === 1 ? `Sim${detEntry.dataConciliacao ? ` (${fmtData(detEntry.dataConciliacao)})` : ""}` : "Não")}
                  {field("Origem", detEntry.origemModulo)}
                  {field("Criado por", detEntry.criadoPorNome)}
                </div>
                {(detEntry.descricao || detEntry.origemDescricao || detEntry.observacoes) && (
                  <div className="space-y-2 border-t pt-3">
                    {field("Descrição", detEntry.descricao)}
                    {field("Origem (detalhe)", detEntry.origemDescricao)}
                    {field("Observações", detEntry.observacoes)}
                  </div>
                )}
                {(detEntry.comprovanteUrl || detEntry.anexoUrl) && (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {detEntry.comprovanteUrl && <a href={detEntry.comprovanteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"><Paperclip className="w-3.5 h-3.5" /> Comprovante <ExternalLink className="w-3 h-3" /></a>}
                    {detEntry.anexoUrl && <a href={detEntry.anexoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"><Paperclip className="w-3.5 h-3.5" /> {detEntry.anexoNome || "Anexo"} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                )}
                {detOrdem && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="font-medium text-gray-700 flex items-center gap-1.5"><FileText className="w-4 h-4 text-violet-600" /> Ordem de Compra {detOrdem.numeroOc ?? ""}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {field("Fornecedor (OC)", detOrdem.fornecedorNome)}
                      {field("Nota Fiscal", detOrdem.numeroNf)}
                      {field("Total da OC", detOrdem.total != null ? formatBRL(Number(detOrdem.total)) : null)}
                      {field("Itens", detItens.length ? `${detItens.length} item(ns)` : null)}
                    </div>
                  </div>
                )}
                {detOrigem && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="font-medium text-gray-700">{detOrigem.titulo}</div>
                    {detOrigem.subtitulo && <div className="text-xs text-gray-500">{detOrigem.subtitulo}</div>}
                    {Array.isArray(detOrigem.campos) && <div className="grid grid-cols-2 gap-x-4 gap-y-3">{detOrigem.campos.map((c: any, i: number) => field(c.label ?? `Campo ${i + 1}`, c.kind === "date" ? fmtData(c.value) : (c.value ?? "—"), `campo-${i}`))}</div>}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0"><Button variant="outline" onClick={() => setDetalheEntryId(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Importar extrato */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 pr-14 border-b border-gray-100 space-y-0 shrink-0">
            <DialogTitle className="flex items-start gap-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Upload className="w-5 h-5" /></span>
              <span className="min-w-0 flex flex-col justify-center">
                <span className="block text-base font-semibold leading-tight">Importar Extrato Bancário</span>
                <span className="block text-xs font-normal text-gray-500 leading-snug mt-1">Anexe o extrato (OFX, QFX, CSV, PDF...)</span>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Conta Bancária</Label>
              {contaSel ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${bancoCor(contaSel.banco).bg} ${bancoCor(contaSel.banco).text}`}><Landmark className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">{contaSel.banco}{contaSel.descricao ? ` · ${contaSel.descricao}` : ""}</span>
                    <span className="block truncate text-[11px] text-gray-500">Ag. {formatAgencia(contaSel.agencia)}/{formatConta(contaSel.conta)} · {periodoLabel}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">Etapa 1</span>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">Selecione a conta na etapa 1 antes de importar.</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Arquivo *</Label>
              <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className={`w-full rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${importContent ? "border-green-300 bg-green-50/60 hover:bg-green-50" : "border-gray-200 bg-gray-50/60 hover:border-blue-300 hover:bg-blue-50/40"}`}>
                <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${importContent ? "bg-green-100 text-green-600" : "bg-white text-gray-400 border border-gray-200"}`}>{importContent ? <Check className="w-5 h-5" /> : <FileText className="w-5 h-5" />}</span>
                <span className="mt-2 block truncate text-sm font-medium text-gray-700">{importFileName || "Clique para selecionar um arquivo"}</span>
                <span className="mt-0.5 block text-[11px] text-gray-400">{importContent ? `${(importFileName.split(".").pop() || "arquivo").toUpperCase()} · ${(importContent.length / 1024).toFixed(1)} KB carregado` : "Qualquer formato (OFX, QFX, CSV, PDF...)"}</span>
              </button>
            </div>
            {importFormato === "csv" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Separador CSV</Label>
                <Select value={csvSeparador} onValueChange={setCsvSeparador}>
                  <SelectTrigger className="w-full h-11"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value=";">Ponto e vírgula (;)</SelectItem><SelectItem value=",">Vírgula (,)</SelectItem><SelectItem value="\t">Tab</SelectItem></SelectContent>
                </Select>
                <p className="text-[11px] text-gray-400">O CSV deve ter colunas: Data, Descrição, Valor (e opcionalmente Saldo)</p>
              </div>
            )}
            {/* Rev. 4086 — Banner: conta detectada do OFX diferente da selecionada */}
            {ofxDetectedConta && ofxDetectedConta.contaId !== parseInt(importConta) && !importRunning && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-blue-100 flex items-center justify-center mt-0.5">
                    <Landmark className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-800">Conta detectada no arquivo OFX</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {ofxDetectedConta.apelido || ofxDetectedConta.banco} · ···{String(ofxDetectedConta.conta).slice(-4)}
                    </p>
                  </div>
                  <button
                    className="shrink-0 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                    onClick={() => { setImportConta(String(ofxDetectedConta.contaId)); setOfxDetectedConta(null); }}
                  >
                    Usar esta conta
                  </button>
                </div>
              </div>
            )}
            {importRunning && (
              <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-blue-800 truncate"><Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /><span className="truncate">{importLabel || "Processando..."}</span></span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">{importPct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${importPct}%` }} /></div>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 sm:gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowImport(false)} disabled={importRunning}>Cancelar</Button>
            <Button onClick={() => handleImport()} disabled={importRunning || !importContent || !importConta}>{importRunning ? `Importando... ${importPct}%` : "Importar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 3179 — Confirmação de "Limpar extrato" (soft-delete por conta + período) */}
      {/* Rev. 3875 — REGRA DE OURO: bloqueia se houver linhas conciliadas sem checkbox. */}
      <AlertDialog open={confirmLimpar} onOpenChange={(o: boolean) => { if (!o) { setConfirmLimpar(false); setLimparConciliadosCount(0); setConfirmLimparForcado(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" />Limpar extrato importado?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  Isso remove as <strong>{totalLinhas}</strong> linha(s) de extrato da conta selecionada em <strong>{periodoLabel}</strong>.
                  Os lançamentos do ERP que estavam conciliados voltam a ficar <strong>pendentes</strong> (nada é apagado do ERP).
                  Use quando importou o extrato errado e quer reimportar.
                </p>
                {limparConciliadosCount > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2.5 space-y-2">
                    <p className="text-red-700 font-semibold text-[13px]">⚠ REGRA DE OURO — BLOQUEIO ATIVO</p>
                    <p className="text-red-700 text-[12px]">
                      Existem <strong>{limparConciliadosCount}</strong> linha(s) JÁ CONCILIADAS neste período.
                      Limpar destruirá essas conciliações permanentemente.
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-red-600" checked={confirmLimparForcado} onChange={e => setConfirmLimparForcado(e.target.checked)} />
                      <span className="text-red-700 text-[12px] font-medium">
                        Entendo que vou perder <strong>{limparConciliadosCount}</strong> conciliação(ões) e desejo prosseguir.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limparMut.isPending} onClick={() => { setLimparConciliadosCount(0); setConfirmLimparForcado(false); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
              disabled={limparMut.isPending || (limparConciliadosCount > 0 && !confirmLimparForcado)}
              onClick={(e: any) => { e.preventDefault(); limparMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim, force: limparConciliadosCount > 0 ? true : undefined }); }}
            >
              {limparMut.isPending ? "Limpando..." : limparConciliadosCount > 0 ? "Sim, perder conciliações e limpar" : "Sim, limpar extrato"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rev. 3179 — Alerta de extrato de OUTRO mês ≠ mês selecionado (bloqueia gravação) */}
      <AlertDialog open={mismatch != null} onOpenChange={(o: boolean) => { if (!o) setMismatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><CalendarX className="w-5 h-5 text-amber-600" />Extrato de outro mês?</AlertDialogTitle>
            <AlertDialogDescription>
              {mismatch && (
                <>
                  Você selecionou <strong>{MESES[(mismatch.selecionado.length === 7 ? parseInt(mismatch.selecionado.slice(5, 7), 10) : 1) - 1]}/{mismatch.selecionado.slice(0, 4)}</strong>, mas o extrato parece ser de <strong>{MESES[mismatch.mesNum - 1]}/{mismatch.anoNum}</strong>
                  {mismatch.fora > 0 ? <> ({mismatch.fora} de {mismatch.total} transações fora do mês selecionado)</> : null}.
                  A importação foi <strong>bloqueada</strong> para evitar misturar meses. O que deseja fazer?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              disabled={importRunning}
              onClick={(e: any) => {
                e.preventDefault();
                if (mismatch) { setAno(mismatch.anoNum); selectMes(mismatch.mesNum); }
                setMismatch(null);
                setTimeout(() => handleImport(true), 0);
              }}
            >
              {mismatch ? `Trocar para ${MESES[mismatch.mesNum - 1]}/${mismatch.anoNum} e importar` : "Importar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniCard({ icon, label, value, valueCls }: { icon: React.ReactNode; label: string; value: string; valueCls?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <p className={`text-xl font-bold ${valueCls ?? "text-gray-800"}`}>{value}</p>
    </div>
  );
}

function EmptyConta({ onIr }: { onIr: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
      <RefreshCw className="w-14 h-14 mx-auto mb-4 text-gray-300" />
      <p className="text-gray-500 font-medium">Selecione uma conta bancária para continuar.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onIr}>Ir para "Preparar"</Button>
    </div>
  );
}

function ReportBody({ report }: { report: any }) {
  const conc: any[] = report.conciliados ?? [];
  const pend: any[] = report.extratoSemLancamento ?? [];
  const lanc: any[] = report.lancamentosSemExtrato ?? [];
  const sum = (arr: any[], f: (x: any) => any) => arr.reduce((a, x) => a + Math.abs(Number(f(x)) || 0), 0);
  const tConc = sum(conc, (c) => c.valor), tPend = sum(pend, (c) => c.valor), tLanc = sum(lanc, (c) => c.valor);
  const totalExtrato = conc.length + pend.length;
  const pct = totalExtrato > 0 ? Math.round((conc.length / totalExtrato) * 100) : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniCard icon={<CheckCircle className="w-4 h-4 text-blue-600" />} label={`Conciliado (${pct}%)`} value={`${conc.length} · ${formatBRL(tConc)}`} valueCls="text-blue-600" />
        <MiniCard icon={<AlertCircle className="w-4 h-4 text-red-500" />} label="Extrato sem lançamento" value={`${pend.length} · ${formatBRL(tPend)}`} valueCls="text-red-500" />
        <MiniCard icon={<FileText className="w-4 h-4 text-gray-500" />} label="Lançamentos sem extrato" value={`${lanc.length} · ${formatBRL(tLanc)}`} />
        <MiniCard icon={<RefreshCw className="w-4 h-4 text-gray-500" />} label="Total do extrato" value={`${totalExtrato} linhas`} />
      </div>

      <ReportSection title={`1. Extrato conciliado (${conc.length})`} headerCls="text-blue-700">
        {conc.length === 0 ? <Empty msg="Nenhuma linha conciliada no período." /> : conc.map((c, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
            <span className="text-xs text-gray-400 w-20 shrink-0">{fmtData(c.data)}</span>
            <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{c.descricao || "—"}</span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            <span className="text-sm text-blue-700 truncate flex-1 min-w-0">{c.entryFornecedor || c.entryDescricao || `#${c.entryId}`}</span>
            <span className="text-sm font-semibold text-gray-700 shrink-0">{formatBRL(Math.abs(Number(c.valor) || 0))}</span>
          </div>
        ))}
      </ReportSection>

      <ReportSection title={`2. Extrato SEM lançamento — o que falta (${pend.length})`} headerCls="text-red-600">
        {pend.length === 0 ? <Empty msg="Sem pendências — todo o extrato está conciliado." /> : pend.map((c, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
            <span className="text-xs text-gray-400 w-20 shrink-0">{fmtData(c.data)}</span>
            <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{c.descricao || "—"}</span>
            <Badge variant="secondary" className="shrink-0">{c.tipo === "credito" ? "Entrada" : "Saída"}</Badge>
            <span className={`text-sm font-semibold shrink-0 ${Number(c.valor) >= 0 ? "text-green-600" : "text-red-500"}`}>{formatBRL(Math.abs(Number(c.valor) || 0))}</span>
          </div>
        ))}
      </ReportSection>

      <ReportSection title={`3. Lançamentos do sistema sem extrato (${lanc.length})`} headerCls="text-gray-700">
        {lanc.length === 0 ? <Empty msg="Nenhum lançamento sem extrato no período." /> : lanc.map((c, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
            <span className="text-xs text-gray-400 w-20 shrink-0">{fmtData(c.data)}</span>
            <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{c.fornecedorNome || c.descricao || `#${c.id}`}</span>
            <span className="text-xs text-gray-400 truncate max-w-[140px] shrink-0">{c.obraNome || ""}</span>
            <span className="text-sm font-semibold text-gray-700 shrink-0">{formatBRL(Math.abs(Number(c.valor) || 0))}</span>
          </div>
        ))}
      </ReportSection>

      {/* Rev. 4085b — Diálogo de revisão de duplicados redesenhado */}
      <Dialog open={showReviewDup} onOpenChange={(o) => { if (!o && !reviewDupRunning) setShowReviewDup(false); }}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">
          {/* ── Header escuro ─────────────────────────────────────────────── */}
          <div className="bg-[#1B2A4A] px-6 py-4 shrink-0">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-white text-base font-semibold leading-snug m-0 p-0">
                  Transações já importadas detectadas
                </DialogTitle>
                <p className="text-blue-200/80 text-xs mt-1 leading-relaxed">
                  As linhas abaixo já existem nesta conta. Por padrão <strong className="text-blue-100">não serão reimportadas</strong> — marque as que quiser incluir mesmo assim.
                </p>
              </div>
              <span className="shrink-0 bg-amber-400/20 text-amber-300 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-400/25 tabular-nums">
                {pendingDupIndices.length} duplicata{pendingDupIndices.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {reviewDupRunning ? (
            /* ── Progresso ──────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-4">
              <div className="w-full max-w-sm space-y-3">
                <div className="flex items-center justify-between text-sm font-medium text-[#1B2A4A]">
                  <span className="truncate pr-2">{importLabel || "Importando..."}</span>
                  <span className="tabular-nums shrink-0 text-base font-bold">{importPct}%</span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#1B2A4A] transition-all duration-300" style={{ width: `${importPct}%` }} />
                </div>
                <p className="text-xs text-gray-400 text-center">Aguarde, gravando no banco de dados…</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Resumo / barra de totais ────────────────────────────── */}
              {(() => {
                const allLines = pendingImportData?.linhas ?? [];
                const novasIndices = allLines.map((_, i) => i).filter(i => !pendingDupIndices.includes(i));
                const nNovas = novasIndices.length;
                const totalConfirm = nNovas + reviewDupSel.size;
                return (
                  <div className="shrink-0 px-5 py-2.5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between gap-4">
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-emerald-700">{nNovas}</span> nova{nNovas !== 1 ? "s" : ""}
                      {reviewDupSel.size > 0 && <><span className="text-gray-400 mx-1.5">+</span><span className="font-semibold text-amber-700">{reviewDupSel.size}</span> duplicada{reviewDupSel.size !== 1 ? "s" : ""} marcada{reviewDupSel.size !== 1 ? "s" : ""}</>}
                      {" "}→ <span className="font-bold text-[#1B2A4A]">{totalConfirm} transaç{totalConfirm !== 1 ? "ões" : "ão"}</span> serão importadas
                    </p>
                  </div>
                );
              })()}

              {/* ── Corpo com duas seções ────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-200">

                {/* Seção 1: Novas (serão importadas automaticamente) */}
                {(() => {
                  const allLines = pendingImportData?.linhas ?? [];
                  const novasIndices = allLines.map((_, i) => i).filter(i => !pendingDupIndices.includes(i));
                  if (novasIndices.length === 0) return null;
                  return (
                    <div>
                      <div className="px-5 py-2.5 bg-emerald-50/70 border-b border-emerald-100 flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="text-xs font-semibold text-emerald-800">
                          {novasIndices.length} nova{novasIndices.length !== 1 ? "s" : ""} — serão importadas automaticamente
                        </span>
                      </div>
                      {novasIndices.map((idx, rowIdx) => {
                        const l = allLines[idx];
                        const valor = Number(l?.valor || 0);
                        const isCredito = valor >= 0;
                        return (
                          <div key={idx} className={`flex items-center gap-4 px-5 py-2.5 border-b border-gray-100 ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="shrink-0 text-xs font-medium text-gray-400 w-[78px] tabular-nums">{fmtData(l?.data)}</span>
                            <span className="flex-1 text-sm text-gray-800 truncate min-w-0" title={l?.descricao}>{l?.descricao || "—"}</span>
                            <span className={`shrink-0 text-sm font-semibold tabular-nums min-w-[90px] text-right ${isCredito ? "text-emerald-700" : "text-red-600"}`}>
                              {isCredito ? "+" : "−"} {formatBRL(Math.abs(valor))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Seção 2: Duplicatas (marque as que quiser reimportar) */}
                {pendingDupIndices.length > 0 && (
                  <div>
                    <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-amber-800">
                          {pendingDupIndices.length} duplicata{pendingDupIndices.length !== 1 ? "s" : ""} — já existem nesta conta
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button className="text-xs text-amber-700 hover:text-amber-900 hover:underline font-medium"
                          onClick={() => setReviewDupSel(new Set(pendingDupIndices.map(i => String(i))))}>
                          Selecionar todas
                        </button>
                        <span className="text-amber-300 text-xs">|</span>
                        <button className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                          onClick={() => setReviewDupSel(new Set())}>
                          Nenhuma
                        </button>
                      </div>
                    </div>
                    {pendingDupIndices.map((idx, rowIdx) => {
                      const l = (pendingImportData?.linhas ?? [])[idx];
                      const key = String(idx);
                      const checked = reviewDupSel.has(key);
                      const valor = Number(l?.valor || 0);
                      const isCredito = valor >= 0;
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-4 px-5 py-2.5 cursor-pointer select-none border-b border-gray-100 transition-colors ${checked ? "bg-amber-50/60" : rowIdx % 2 === 0 ? "bg-white hover:bg-gray-50/70" : "bg-gray-50/40 hover:bg-gray-100/60"}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={v => {
                              setReviewDupSel(prev => { const next = new Set(prev); if (v) next.add(key); else next.delete(key); return next; });
                            }}
                            className={checked ? "border-amber-500 data-[state=checked]:bg-amber-500" : ""}
                          />
                          <span className="shrink-0 text-xs font-medium text-gray-400 w-[78px] tabular-nums">{fmtData(l?.data)}</span>
                          <span className="flex-1 text-sm text-gray-700 truncate min-w-0" title={l?.descricao}>{l?.descricao || "—"}</span>
                          <div className="shrink-0 text-right min-w-[90px]">
                            <span className={`text-sm font-semibold tabular-nums ${isCredito ? "text-emerald-700" : "text-red-600"}`}>
                              {isCredito ? "+" : "−"} {formatBRL(Math.abs(valor))}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          {!reviewDupRunning && (
            <div className="shrink-0 px-6 py-4 border-t bg-white flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowReviewDup(false)}>Cancelar</Button>
              <Button
                className="bg-[#1B2A4A] hover:bg-[#243660] text-white min-w-[180px]"
                onClick={async () => {
                  if (!pendingImportData) return;
                  setReviewDupRunning(true);
                  try { await proceedWithInsert(pendingImportData, pendingDupIndices, reviewDupSel); }
                  finally { setReviewDupRunning(false); }
                }}
              >
                {(() => {
                  const nNovas = (pendingImportData?.linhas.length ?? 0) - pendingDupIndices.length;
                  const total = nNovas + reviewDupSel.size;
                  return `Confirmar (${total} transaç${total !== 1 ? "ões" : "ão"})`;
                })()}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportSection({ title, headerCls, children }: { title: string; headerCls?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100"><h3 className={`text-sm font-semibold ${headerCls ?? "text-gray-700"}`}>{title}</h3></div>
      <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">{children}</div>
    </div>
  );
}
function Empty({ msg }: { msg: string }) { return <div className="px-4 py-8 text-center text-sm text-gray-400">{msg}</div>; }
