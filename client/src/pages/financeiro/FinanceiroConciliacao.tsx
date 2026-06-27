import { useMemo, useState, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Upload, FileText, Sparkles, ArrowRight, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Landmark, Check, RotateCcw, Loader2, Eye, Paperclip, ExternalLink, Link2, X, Trash2, CalendarX, FileSpreadsheet, FileDown, Plus, Maximize2, Minimize2, Search, Users, Building2, Pencil, Wallet, CircleCheck, CircleDot, Zap, EyeOff } from "lucide-react";
import { formatConta, formatAgencia } from "@/lib/formatters";
import { NaturezaOverrideDialog, NaturezaBadge, type LancNaturezaLinha } from "./_NaturezaOverride";
import { SearchableSelect } from "@/components/SearchableSelect";
import { MapaMovimentacaoInternaDialog } from "./_MapaMovimentacaoInterna";
import { ConferirChequesExtratoDialog } from "./_ConferirChequesExtrato";
import { parseChequeNumero, parseDocNumero } from "@shared/chequeMotivos";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
// Rev. 3344 — contadores inteiros com separador de milhar pt-BR (2.434, 2.967…).
function formatInt(v: any) {
  return new Intl.NumberFormat("pt-BR").format(Number(v) || 0);
}
// Rev. 3198 — máscara BRL pt-BR p/ o input de valor do "Lançar no ERP".
function isTransportError(e: any): boolean {
  const m = String(e?.message ?? "").toLowerCase();
  return (
    m.includes("did not match the expected pattern") ||
    m.includes("load failed") ||
    m.includes("failed to fetch") ||
    m.includes("network request failed") ||
    m === "" ||
    m.includes("the operation was aborted") ||
    m.includes("fetch is aborted")
  );
}
function transportErrMsg(e: any): string {
  if (isTransportError(e)) return "Falha de rede (iPad/Safari). Toque novamente para tentar.";
  return e?.message ?? "Erro desconhecido";
}

function maskBRLInput(raw: string) {
  const d = String(raw).replace(/\D/g, "");
  return (Number(d || "0") / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRLInput(masked: string) {
  const d = String(masked).replace(/\D/g, "");
  return Number(d || "0") / 100;
}

function fmtData(v: any) {
  if (!v) return "—";
  try {
    let s: string | null = null;
    if (typeof v === "string") {
      // normaliza "YYYY-MM-DD HH:MM:SS" (espaço) → "YYYY-MM-DD THH:MM:SS" p/ iOS Safari
      s = v.length > 10 ? v.replace(" ", "T") : v + "T00:00:00";
    }
    const d = s ? new Date(s) : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}

/** Mapeia erros crípticos do iOS Safari para mensagens amigáveis. */
function _msgErroConc(msg?: string): string {
  if (!msg) return "Falha ao consultar o relatório. Tente novamente.";
  const l = msg.toLowerCase();
  if (
    l.includes("did not match the expected pattern") ||
    l.includes("load failed") ||
    l.includes("failed to fetch") ||
    l.includes("networkerror") ||
    l.includes("network connection") ||
    l.includes("the operation couldn't be completed") ||
    l.includes("aborted") ||
    l.includes("timed out") ||
    l.includes("tempo limite")
  ) return 'Falha de conexão. Verifique sua internet e toque em "Tentar novamente".';
  return msg;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function bancoCor(banco?: string): { bg: string; text: string } {
  const b = (banco ?? "").toLowerCase();
  if (b.includes("caixa")) return { bg: "bg-blue-100", text: "text-blue-700" };
  if (b.includes("santander")) return { bg: "bg-red-100", text: "text-red-700" };
  if (b.includes("ita")) return { bg: "bg-orange-100", text: "text-orange-700" };
  if (b.includes("bradesco")) return { bg: "bg-pink-100", text: "text-pink-700" };
  if (b.includes("brasil")) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}

// Rev. 3413 — Combobox filtrável reutilizado nos campos do "Lançar no ERP"
const FORMAS_PAG_OPTS = [
  { id: "pix", label: "Pix" }, { id: "boleto", label: "Boleto" },
  { id: "transferencia", label: "Transferência" }, { id: "cheque", label: "Cheque" },
  { id: "debito_automatico", label: "Débito automático" }, { id: "cartao", label: "Cartão" },
  { id: "dinheiro", label: "Dinheiro" }, { id: "deposito", label: "Depósito" },
];
function LancCombo({ value, onChangeText, onSelect, options, placeholder = "Buscar…", noneLabel, onClear }: {
  value: string; onChangeText?: (s: string) => void;
  onSelect: (opt: { id: string | number; label: string; isPJ?: boolean } | null) => void;
  options: { id: string | number; label: string; isPJ?: boolean }[];
  placeholder?: string; noneLabel?: string; onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = value.trim()
    ? options.filter(o => norm(o.label).includes(norm(value.trim())))
    : options;
  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => { onChangeText?.(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 300)}
        placeholder={placeholder}
        className="w-full h-9 pl-3 pr-7 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      {value && onClear && (
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          onMouseDown={e => { e.preventDefault(); onClear(); }}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {open && (
        <div className="absolute z-[200] top-full mt-1 left-0 right-0 bg-white rounded-md border border-gray-200 shadow-xl max-h-56 overflow-y-auto">
          {noneLabel && (
            <button type="button" className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
              onMouseDown={e => { e.preventDefault(); onSelect(null); setOpen(false); }}
              onTouchEnd={e => { e.preventDefault(); onSelect(null); setOpen(false); }}>
              {noneLabel}
            </button>
          )}
          {filtered.map(o => (
            <button key={o.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center gap-2"
              onMouseDown={e => { e.preventDefault(); onSelect(o); setOpen(false); }}
              onTouchEnd={e => { e.preventDefault(); onSelect(o); setOpen(false); }}>
              <span className="flex-1 text-left">{o.label}</span>
              {o.isPJ && (
                <span className="shrink-0 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded leading-none">
                  PJ
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && !noneLabel && (
            <div className="px-3 py-2 text-sm text-gray-400">Nenhum resultado</div>
          )}
        </div>
      )}
    </div>
  );
}

const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function FinanceiroConciliacao() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  // ── Planilha Contador (contabilidade) ──────────────────────────────────────
  const [downloadingContabil, setDownloadingContabil] = useState(false);
  const downloadContabilidade = async (mes: number, year: number) => {
    if (!companyId || mes < 1 || mes > 12) {
      toast({ title: "Selecione um mês específico", description: "O download da planilha requer um mês selecionado (não 'Ano todo').", variant: "destructive" });
      return;
    }
    setDownloadingContabil(true);
    try {
      const resp = await fetch(
        `/api/download/contabilidade-xlsx?companyId=${companyId}&mes=${mes}&ano=${year}`,
        { credentials: "include" }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao gerar planilha" }));
        toast({ title: "Erro ao gerar planilha", description: err.error || "Tente novamente.", variant: "destructive" });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contabilidade_${MESES_FULL[mes - 1]}_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      toast({ title: "Planilha gerada!", description: `Contabilidade_${MESES_FULL[mes - 1]}_${year}.xlsx baixado.` });
    } catch {
      toast({ title: "Erro ao gerar planilha", description: "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } finally {
      setDownloadingContabil(false);
    }
  };
  // Rev. 3165 — Período pelo MESMO PADRÃO das demais telas do Financeiro: navegação por
  // ANO + meses (Jan–Dez). `mesSel=null` = "Ano todo". dataInicio/dataFim derivam daí.
  const _now = new Date();
  const hojeStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const [ano, setAno] = useState(_now.getFullYear());
  const [mesSel, setMesSel] = useState<number | null>(_now.getMonth() + 1);
  // Rev. 3328 — SELETOR Mês/Período/Dia. Mantém o modo "mes" (ano + grade Jan–Dez,
  // 100% compatível); adiciona "dia" (uma data → conciliação diária) e "periodo"
  // (faixa arbitrária). dataInicio/dataFim derivam do modo ativo; o backend
  // (getConciliacaoReport / getConciliacaoReportGeral) já aceita range arbitrário.
  const [modoData, setModoData] = useState<"mes" | "dia" | "periodo">("mes");
  const [diaSel, setDiaSel] = useState<string>(hojeStr);
  const [periIni, setPeriIni] = useState<string>(`${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-01`);
  const [periFim, setPeriFim] = useState<string>(hojeStr);
  const { dataInicio, dataFim } = useMemo(() => {
    if (modoData === "dia") { const d = diaSel || hojeStr; return { dataInicio: d, dataFim: d }; }
    if (modoData === "periodo") {
      const i = periIni || hojeStr; const f = periFim || hojeStr;
      return i <= f ? { dataInicio: i, dataFim: f } : { dataInicio: f, dataFim: i };
    }
    if (mesSel == null) return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    const mm = String(mesSel).padStart(2, "0");
    const ultimoDia = new Date(ano, mesSel, 0).getDate();
    return { dataInicio: `${ano}-${mm}-01`, dataFim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }, [modoData, diaSel, periIni, periFim, ano, mesSel]);
  // Rev. 3328 — período "definido o suficiente" p/ rodar o panorama geral:
  // mês selecionado OU "Ano todo" (modo mês — mesSel==null já vira o range ano inteiro,
  // Rev. 3337) OU uma data/faixa válida (dia/período).
  const periodoDefinido = modoData === "mes" ? true : modoData === "dia" ? !!diaSel : (!!periIni && !!periFim);
  // Rev. 3176 — A tolerância de conciliação passa a refletir os DIAS EXATOS do mês
  // selecionado (FEV/2026 = 28, JAN = 31, etc.), em vez de um teto fixo de 30. Em
  // "Ano todo" usa 31 (teto razoável; backend limita a 60). É o padrão e re-sincroniza
  // ao trocar de mês/ano.
  const diasDoMes = useMemo(() => {
    if (modoData === "mes") {
      if (mesSel == null) return 31;
      return new Date(ano, mesSel, 0).getDate();
    }
    // Rev. 3328 — dia/período: tolerância-padrão = nº de dias da faixa (mín. 1, teto 60).
    const di = new Date(dataInicio + "T00:00:00");
    const df = new Date(dataFim + "T00:00:00");
    const span = Math.round((df.getTime() - di.getTime()) / 86400000) + 1;
    return Math.max(1, Math.min(span, 60));
  }, [modoData, ano, mesSel, dataInicio, dataFim]);
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [conciliadoFilter, setConciliadoFilter] = useState("all");
  const [reportStale, setReportStale] = useState(false);
  // Rev. 3219 — busca única que filtra AMBAS as listas (extrato sem lançamento + ERP sem extrato).
  const [buscaConc, setBuscaConc] = useState("");
  const [buscaJaConc, setBuscaJaConc] = useState("");
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  // Rev. 3239 — pode ser um id numérico (lançamento individual) OU um id de GRUPO ("grp:…").
  const [selectedEntry, setSelectedEntry] = useState<number | string | null>(null);
  // Rev. 3458 — objetos completos para conciliação manual (clique no extrato + clique no ERP).
  const [manualExtSel, setManualExtSel] = useState<any | null>(null);
  const [manualLanSel, setManualLanSel] = useState<any | null>(null);
  // Rev. 3459 — flag para abrir o dialog de detalhe JÁ em modo edição (atalho do botão lápis).
  const [pendingEditMode, setPendingEditMode] = useState(false);
  // Rev. 3504/3505 — filtros Entrada/Saída por seção.
  const [filterExtTipo, setFilterExtTipo] = useState<"all" | "entrada" | "saida">("all");
  const [filterLanTipo, setFilterLanTipo] = useState<"all" | "entrada" | "saida">("all");
  const [filterConcTipo, setFilterConcTipo] = useState<"all" | "entrada" | "saida">("all");
  // Rev. 3762 — "Ocultar resolvidos" no card de Cheques devolvidos: esconde da TELA os
  // cheques já quitados (reapresentado / PIX-TED / por substituição) ou desconsiderados do %,
  // mostrando só os pendentes. NÃO apaga nada nem muda contadores/cálculo do %.
  const [ocultarDevolResolvidos, setOcultarDevolResolvidos] = useState(true);
  // Rev. 3511 — linha do extrato selecionada p/ exibir sheet de detalhe (duplo-clique/toque).
  const [stmtDetailRow, setStmtDetailRow] = useState<any | null>(null);
  // Rev. 3500 — IDs de linhas do extrato que já foram lançadas/conciliadas nesta sessão.
  // Remoção IMEDIATA da lista "No extrato, sem lançamento" antes do próximo refetch.
  const [dismissedStmtIds, setDismissedStmtIds] = useState<Set<number>>(new Set());
  // Rev. 3462 — display do combobox de fornecedor no form de edição (análogo a lancFornDisplay).
  const [detEditFornDisplay, setDetEditFornDisplay] = useState("");
  // Rev. 3239 — grupos expandidos (mostra os lançamentos-membro inline).
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  // Rev. 3205 — expandir uma das listas de pendência em tela cheia p/ analisar melhor.
  const [expandedList, setExpandedList] = useState<"extrato" | "erp" | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFormato, setImportFormato] = useState<"ofx" | "csv" | "pdf">("ofx");
  const [importConta, setImportConta] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  // Rev. 3354 — vários extratos de uma vez: cada arquivo é lido e gravado em sequência;
  // o mês/ano de cada lançamento sai SOZINHO da data de cada linha (sem campo de mês).
  const [importFiles, setImportFiles] = useState<{ nome: string; conteudo: string; formato: "ofx" | "csv" | "pdf" }[]>([]);
  const [csvSeparador, setCsvSeparador] = useState(";");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  // Rev. 3411 — IDs de linhas já conciliadas nesta sessão (filtradas localmente sem re-análise)
  const [conciliadosIds, setConciliadosIds] = useState<Set<number>>(new Set());
  const [toleranciaDias, setToleranciaDias] = useState(0);
  // Rev. 3187 — ao escolher a conta, já dispara as sugestões automáticas (tela única).
  useEffect(() => { if (contaBancariaId) { setMostrarSugestoes(true); setSelSug(new Set()); } }, [contaBancariaId]);
  // Rev. 3478 — ao trocar conta ou período, o relatório vai recarregar do zero (nova query key).
  // Limpa o badge de desatualizado para não aparecer na conta/período nova.
  useEffect(() => { setReportStale(false); }, [contaBancariaId, dataInicio, dataFim]);
  // Opções do dropdown: presets curtos + os dias exatos do mês (dedup, ordenado).
  const tolOptions = useMemo(() => {
    const set = new Set<number>([0, 1, 2, 3, 5, 7, 10, 15, diasDoMes]);
    return Array.from(set).sort((a, b) => a - b);
  }, [diasDoMes]);
  const [selSug, setSelSug] = useState<Set<number>>(new Set());
  // Rev. 3447 — IDs de sugestões descartadas pelo usuário (local; limpa no Reanalisar)
  const [sugDescartadas, setSugDescartadas] = useState<Set<number>>(new Set());
  // Rev. 3177 — clicar no lançamento das sugestões abre um detalhe CONSULTIVO (read-only).
  const [detalheEntryId, setDetalheEntryId] = useState<number | null>(null);
  // Rev. 3264 — clicar TAMBÉM no item do extrato abre o detalhe + bloco de conferência (extrato × ERP) p/ validar a conciliação.
  const [detalheExtrato, setDetalheExtrato] = useState<null | {
    data: string | null; descricao: string | null; valor: number;
    chequeNumero?: any; chequeFornecedor?: string | null;
    entryValor?: number; deltaDias?: number; confianca?: string; identificadoVia?: string | null;
  }>(null);
  const abrirDetalheSug = (s: any) => {
    setAiAnalise(null); setAiCheckeds(new Set());
    setDetalheExtrato({
      data: s.extratoData ?? null,
      descricao: s.extratoDescricao ?? null,
      valor: Number(s.extratoValor) || 0,
      chequeNumero: s.chequeNumero,
      chequeFornecedor: s.chequeFornecedor ?? null,
      entryValor: Number(s.entryValor) || 0,
      deltaDias: s.deltaDias,
      confianca: s.confianca,
      identificadoVia: s.identificadoVia ?? null,
    });
    setDetalheEntryId(s.entryId);
  };
  // Rev. 3394 — estado de edição inline do lançamento na conciliação.
  const [detEditMode, setDetEditMode] = useState(false);
  const [detEditForm, setDetEditForm] = useState<{
    contaId: number | null; contaNome: string;
    obraId: number | null; obraNome: string;
    contaBancariaId: number | null;
    formaPagamento: string; fornecedorNome: string;
    descricao: string; observacoes: string;
    tipo: string;
  } | null>(null);
  // Rev. 3401 — análise IA da conciliação (on-demand, gatilho manual)
  type AiSugestao = { campo: string; valorAtual: string; sugestao: string; motivo: string; contaIdSugerido: number | null; contaNomeSugerida: string | null };
  type AiAnaliseState = null | "loading" | "error" | { ok: boolean; resumo: string; sugestoes: AiSugestao[] };
  const [aiAnalise, setAiAnalise] = useState<AiAnaliseState>(null);
  const [aiCheckeds, setAiCheckeds] = useState<Set<number>>(new Set());
  // Rev. 3402 — AI inline nas linhas de sugestão (sem precisar abrir o dialog)
  const [rowAiOpenId, setRowAiOpenId] = useState<number | null>(null);
  const [rowAiAnalise, setRowAiAnalise] = useState<AiAnaliseState>(null);
  const [rowAiCheckeds, setRowAiCheckeds] = useState<Set<number>>(new Set());
  // Rev. 3403 — Análise em LOTE + relatório de classificação
  type BatchResult = { statementLineId: number; entryId: number; ok: boolean; resumo: string; sugestoes: AiSugestao[] };
  const [batchAiResults, setBatchAiResults] = useState<Record<number, BatchResult>>({});
  const [batchAiLoading, setBatchAiLoading] = useState(false);
  const [batchAiProgress, setBatchAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [showBatchReport, setShowBatchReport] = useState(false);
  const [batchApplyChecked, setBatchApplyChecked] = useState<Set<string>>(new Set());
  const [batchApplying, setBatchApplying] = useState(false);
  const [batchApplyProgress, setBatchApplyProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchShowOnlyProblems, setBatchShowOnlyProblems] = useState(true);
  // Rev. 3454 — cache persistente: controla se o resultado atual veio do banco (não re-analisa ao montar)
  const [batchAiFromCache, setBatchAiFromCache] = useState(false);
  const [batchAiCachedAt, setBatchAiCachedAt] = useState<string | null>(null);
  // Rev. 3404 — AI inline no dialog "Confirmar conciliação?"
  type ConfirmAiState = "idle" | "loading" | "error" | { resultados: BatchResult[] };
  const [confirmAiState, setConfirmAiState] = useState<ConfirmAiState>("idle");
  const [confirmAiChecked, setConfirmAiChecked] = useState<Set<string>>(new Set());
  const fecharDetalhe = () => { setDetalheEntryId(null); setDetalheExtrato(null); setDetEditMode(false); setDetEditForm(null); setAiAnalise(null); setAiCheckeds(new Set()); setPendingEditMode(false); setDetEditFornDisplay(""); };
  // Rev. 3266 — diálogo de CONFERÊNCIA da identificação por IA (texto roxo clicável).
  // Guarda a linha do extrato (com os campos demo* já vindos do getConciliacaoReport) p/
  // montar o comparativo lado a lado + abrir o PDF do demonstrativo + confirmar/marcar errado.
  const [demoConf, setDemoConf] = useState<any | null>(null);
  // Rev. 3179 — "Limpar extrato" (confirmação) + alerta de extrato de outro mês.
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  // Rev. 3534 — "Limpar TODAS as contas do mês" (bulk).
  const [showLimparMesDlg, setShowLimparMesDlg] = useState(false);
  // Rev. 3386 — exclusão individual de linha do extrato
  const [confirmExcluirLinha, setConfirmExcluirLinha] = useState<{ id: number; descricao: string; valor: number; conciliado: boolean } | null>(null);
  // Rev. 3410 — troca manual de lançamento vinculado na sugestão
  const [overrideSug, setOverrideSug] = useState<Record<number, { entryId: number; fornecedorNome: string; descricao: string; valor: number; data: string | null; obraNome?: string }>>({});
  const [trocandoLine, setTrocandoLine] = useState<{ statementLineId: number; extratoDescricao: string; extratoValor?: number } | null>(null);
  const [buscaTroca, setBuscaTroca] = useState("");
  const [confirmConciliar, setConfirmConciliar] = useState(false);
  const [mismatch, setMismatch] = useState<{ detectado: string; selecionado: string; fora: number; total: number; anoNum: number; mesNum: number } | null>(null);
  // Rev. 3363 — propostas de RENDIMENTO de aplicação/resgate automático (CDB ContaMax)
  // detectadas no(s) extrato(s) importado(s). Sempre exibidas pra CONFIRMAÇÃO (opção A:
  // bruto + IOF + IR separados). Nunca lança sozinho.
  type RendProposta = { contaBancariaId: number; competenciaMes: number; competenciaAno: number; bruto: number; iof: number; ir: number; fileName: string };
  const [rendimentoPropostas, setRendimentoPropostas] = useState<RendProposta[]>([]);
  const [showRendimento, setShowRendimento] = useState(false);
  // Rev. 3319 — PANORAMA: contas expandidas (listas unificadas por conta) + blocos
  // "já conciliados" abertos por conta + confirmação da conciliação 1-a-1 feita no painel.
  const [geralContasExp, setGeralContasExp] = useState<Set<number>>(new Set());
  const [geralExpInit, setGeralExpInit] = useState(false);
  const [geralConcExp, setGeralConcExp] = useState<Set<number>>(new Set());
  const [confirmGeralConciliar, setConfirmGeralConciliar] = useState<{ ext: any; lan: any } | null>(null);

  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // ── Rev. 3198 — "Lançar no ERP" direto do item do extrato sem lançamento ─────────
  // Carrega obras/categorias/centros de custo/fornecedores p/ o usuário completar o
  // lançamento (data, conta e valor já vêm pré-preenchidos do extrato). Após criar,
  // auto-concilia com a linha do extrato (mesma mutation da conciliação manual).
  const { data: lancObras, refetch: refetchLancObras } = (trpc as any).obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const { data: lancAccounts, refetch: refetchLancAccounts } = (trpc as any).financial.getAccounts.useQuery({ companyId, ativo: true, escopo: "categoria" }, { enabled: !!companyId });
  const { data: lancCostCenters, refetch: refetchLancCostCenters } = (trpc as any).financial.getCostCenters.useQuery({ companyId }, { enabled: !!companyId });
  // Rev. 3457 — includeAllGroup: true → retorna fornecedores de TODAS as empresas
  // do grupo (não só a empresa corrente), corrigindo o bug onde a lista ficava vazia
  // quando os fornecedores estavam cadastrados em outra empresa do grupo FC.
  // ativo: undefined → inclui fornecedores com ativo=NULL (cadastros antigos) além dos ativo=true.
  const { data: lancFornecedores } = (trpc as any).compras.listarFornecedores.useQuery({ companyId, includeAllGroup: true }, { enabled: !!companyId });
  const { data: lancPjContratos } = (trpc as any).pj.contratos.list.useQuery({ companyId }, { enabled: !!companyId });
  // Rev. 3455 — movido p/ antes de obrasParaLanc (era linha 366) p/ resolver clienteId na filtragem
  const { data: lancClientes, refetch: refetchLancClientes } = (trpc as any).clientes.list.useQuery({ companyId }, { enabled: !!companyId });
  const clienteOpts: { id: number; nome: string }[] = useMemo(() => {
    const seen = new Set<string>(); const out: { id: number; nome: string }[] = [];
    for (const c of (Array.isArray(lancClientes) ? lancClientes : [])) {
      const nome = String(c?.nomeFantasia ?? c?.razaoSocial ?? "").trim();
      if (!nome || seen.has(nome.toLowerCase())) continue; seen.add(nome.toLowerCase()); out.push({ id: Number(c.id), nome });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lancClientes]);
  // Rev. 3455 — vínculos obra↔cliente via junction table (obra_clientes, Rev. 3451)
  const { data: obraClientesVinculos } = (trpc as any).obras.listClienteVinculos.useQuery({ companyId }, { enabled: !!companyId });
  const obrasOpts: { id: number; nome: string; cliente: string }[] = useMemo(() => {
    const seen = new Set<string>(); const out: { id: number; nome: string; cliente: string }[] = [];
    for (const o of (Array.isArray(lancObras) ? lancObras : [])) {
      const nome = String(o?.nome ?? "").trim(); if (!nome || seen.has(nome)) continue; seen.add(nome); out.push({ id: Number(o.id), nome, cliente: String(o.cliente ?? "").trim() });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lancObras]);
  // Rev. 3417 — declarado AQUI (antes dos useMemos que dependem dele) para evitar TDZ
  const [lancForm, setLancForm] = useState({ data: "", valor: "", descricao: "", obraId: "", contaNome: "", contaId: "", centroCustoId: "", fornecedorNome: "", clienteId: "", clienteNome: "", formaPagamento: "", tipo: "despesa" });
  // Rev. 3413 — texto digitado no combo de obra (declarado AQUI, antes de obrasParaLanc, p/ evitar TDZ)
  const [lancObraDisplay, setLancObraDisplay] = useState("");
  // Rev. 3455 — obras filtradas pelo cliente selecionado (texto legado + junction table obra_clientes)
  const obrasParaLanc = useMemo(() => {
    const cn = (lancForm?.clienteNome ?? "").trim().toLowerCase();
    if (!cn) return obrasOpts;
    // Rev. 3740 — quando o usuário ESTÁ DIGITANDO uma busca de obra, procura em TODAS as
    // obras (não só as do cliente). O filtro por cliente vale como SUGESTÃO inicial (campo
    // vazio); ao buscar, nenhuma obra existente pode ficar escondida (ex.: obra vinculada a
    // outro cliente, ou cliente recém-criado ainda sem vínculo).
    if ((lancObraDisplay ?? "").trim()) return obrasOpts;
    const normalize = (s: string) => s.toLowerCase().replace(/[.\s]+$/, "").trim();
    const cnNorm = normalize(cn);
    const textMatch = obrasOpts.filter(o => {
      const oc = normalize(o.cliente);
      return oc === cnNorm || oc.includes(cnNorm) || cnNorm.includes(oc);
    });
    const vinculos = Array.isArray(obraClientesVinculos) ? obraClientesVinculos : [];
    const resolvedId = lancForm.clienteId
      ? Number(lancForm.clienteId)
      : clienteOpts.find(c => normalize(c.nome) === cnNorm || normalize(c.nome).includes(cnNorm) || cnNorm.includes(normalize(c.nome)))?.id ?? null;
    const junctionIds = resolvedId
      ? new Set(vinculos.filter((v: any) => Number(v.clienteId) === resolvedId).map((v: any) => Number(v.obraId)))
      : new Set<number>();
    const junctionMatch = obrasOpts.filter(o => junctionIds.has(o.id));
    const allIds = new Set([...textMatch.map(o => o.id), ...junctionMatch.map(o => o.id)]);
    const merged = obrasOpts.filter(o => allIds.has(o.id));
    return merged.length > 0 ? merged : obrasOpts;
  }, [obrasOpts, lancForm?.clienteNome, lancForm?.clienteId, obraClientesVinculos, clienteOpts, lancObraDisplay]);
  const catOpts: { id: number; nome: string; tipo: string; natureza: string | null; centroCustoId: number | null }[] = useMemo(() => {
    const out: { id: number; nome: string; tipo: string; natureza: string | null; centroCustoId: number | null }[] = [];
    for (const a of (Array.isArray(lancAccounts) ? lancAccounts : [])) {
      const nome = String(a?.nome ?? "").trim(); if (!nome) continue;
      out.push({ id: Number(a.id), nome, tipo: String(a?.tipo ?? ""), natureza: a.natureza ?? null, centroCustoId: a.centroCustoId ?? null });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lancAccounts]);
  const ccOpts: { id: number; nome: string }[] = useMemo(() => {
    const out: { id: number; nome: string }[] = [];
    for (const c of (Array.isArray(lancCostCenters) ? lancCostCenters : [])) {
      const nome = String(c?.nome ?? "").trim(); if (!nome) continue;
      out.push({ id: Number(c.id), nome: c.codigo ? `${c.codigo} · ${nome}` : nome });
    }
    return out;
  }, [lancCostCenters]);
  const lancFornOpts: { id: number; label: string; isPJ?: boolean }[] = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: number; label: string; isPJ?: boolean }[] = [];
    // Rev. 3463 — prioridade: nomeFantasia (nome comercial) → razaoSocial (fallback).
    for (const f of (Array.isArray(lancFornecedores) ? lancFornecedores : [])) {
      const nome = String(f?.nomeFantasia ?? f?.razaoSocial ?? "").trim();
      if (!nome || seen.has(nome.toLowerCase())) continue;
      seen.add(nome.toLowerCase());
      out.push({ id: out.length, label: nome });
    }
    // Prestadores PJ ativos (com badge de aviso na lista)
    for (const c of (Array.isArray(lancPjContratos) ? lancPjContratos : [])) {
      if (c.status === "encerrado") continue;
      const nome = String(c.razaoSocialPrestador ?? c.employeeName ?? "").trim();
      if (!nome || seen.has(nome.toLowerCase())) continue;
      seen.add(nome.toLowerCase());
      out.push({ id: out.length, label: nome, isPJ: true });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [lancFornecedores, lancPjContratos]);
  const [lancStatement, setLancStatement] = useState<any | null>(null);
  const [lancBusy, setLancBusy] = useState(false);
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";
  // Rev. 3414 — excluir lançamento "sem extrato" diretamente na conciliação (só admin_master)
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<{ id: number; nome: string; valor: number; status: string } | null>(null);
  const [deleteEntryMotivo, setDeleteEntryMotivo] = useState("");
  const deleteEntryMut = (trpc as any).financial.deleteEntry.useMutation();
  // Rev. 3416 — Vincular cheque devolvido a PIX/TED substituto
  const [vincularPixDlg, setVincularPixDlg] = useState<{ cheque: any; pixPreSel: any | null } | null>(null);
  const [vincularPixSel, setVincularPixSel] = useState<any | null>(null);
  const [vincularPixBusca, setVincularPixBusca] = useState("");
  const [vincularPixSoProximos, setVincularPixSoProximos] = useState(false);
  const [vincularPixOutrosMeses, setVincularPixOutrosMeses] = useState(false);
  const vincularChequePix = (trpc as any).financial.vincularChequePix.useMutation();
  const { data: vincularPixOutrosMesesData, isFetching: vincularPixOutrosMesesFetching } =
    (trpc as any).financial.searchPixTedOutrosMeses.useQuery(
      {
        companyId: Number(companyId),
        contaBancariaId: parseInt(contaBancariaId) || 0,
        dataRef: vincularPixDlg?.cheque?.dataCredito?.slice(0, 10) ?? "2000-01-01",
        valorRef: vincularPixDlg?.cheque?.valor != null ? Math.abs(Number(vincularPixDlg.cheque.valor)) : undefined,
        mesesAntes: 1,
        mesesDepois: 6,
        busca: vincularPixBusca || undefined,
      },
      { enabled: !!vincularPixOutrosMeses && !!vincularPixDlg && !!companyId && !!contaBancariaId }
    );
  // Rev. 3747 — Vínculo de cheque devolvido ↔ PIX/TED: parcial (1→N), TODAS as contas.
  // valor da parcela (editável; default = saldo); mutations registrar/estornar; busca global.
  const [vincularPixValor, setVincularPixValor] = useState<string>("");
  const registrarVinculoMut = (trpc as any).financial.registrarVinculoChequeDevolvido.useMutation();
  const estornarVinculoMut = (trpc as any).financial.estornarVinculoChequeDevolvido.useMutation();
  const { data: pixGlobalData, isFetching: pixGlobalFetching } =
    (trpc as any).financial.searchPixTedGlobal.useQuery(
      {
        companyId: Number(companyId),
        dataRef: String(vincularPixDlg?.cheque?.dataDebito ?? vincularPixDlg?.cheque?.dataCredito ?? "2000-01-01").slice(0, 10),
        valorRef: vincularPixDlg?.cheque?.valor != null
          ? Math.abs(Number(vincularPixDlg.cheque.valor))
          : (vincularPixDlg?.cheque?.valorCents ? Number(vincularPixDlg.cheque.valorCents) / 100 : undefined),
        mesesAntes: 3,
        mesesDepois: 12,
        busca: vincularPixBusca || undefined,
      },
      { enabled: !!vincularPixDlg && !!companyId }
    );
  // Rev. 3419 — Conciliar PIX rápido a partir do card do cheque devolvido
  const [conciliarPixDlg, setConciliarPixDlg] = useState<{ cheque: any; pixLineId: number; pixLine: any | null } | null>(null);
  const [conciliarPixEntry, setConciliarPixEntry] = useState<any | null>(null);
  const [buscaConciliarPix, setBuscaConciliarPix] = useState("");
  // Rev. 3413 — estados para comboboxes e dialog de nova obra
  const [lancCCDisplay, setLancCCDisplay] = useState("");
  // Rev. 3415 — fornecedor só pode vir do cadastro; display ≠ valor confirmado
  const [lancFornDisplay, setLancFornDisplay] = useState("");
  const [lancNewObraOpen, setLancNewObraOpen] = useState(false);
  const [lancNewObraNome, setLancNewObraNome] = useState("");
  const criarObraMut = (trpc as any).obras.create.useMutation();
  // Rev. 3450 — dialog inline "Novo cliente"
  const [lancNewClienteOpen, setLancNewClienteOpen] = useState(false);
  const [lancNewClienteNome, setLancNewClienteNome] = useState("");
  const criarClienteMut = (trpc as any).clientes.criar.useMutation();
  // Rev. 3446 — dialogs inline "Nova categoria" e "Novo centro de custo"
  const [lancNewCatOpen, setLancNewCatOpen] = useState(false);
  const [lancNewCatNome, setLancNewCatNome] = useState("");
  const [lancNewCatTipo, setLancNewCatTipo] = useState<"despesa" | "receita">("despesa");
  const criarCategoriaMut = (trpc as any).financial.createAccount.useMutation();
  const [lancNewCCOpen, setLancNewCCOpen] = useState(false);
  const [lancNewCCNome, setLancNewCCNome] = useState("");
  const criarCCMut = (trpc as any).financial.createCostCenter.useMutation();
  // Rev. 3198 — guarda o lançamento JÁ criado p/ a linha atual: se a conciliação
  // automática falhar, um novo clique tenta SÓ conciliar (não recria → sem duplicidade).
  const lancCreatedRef = useRef<{ stmtId: any; entryId: number } | null>(null);
  const utils = trpc.useUtils();
  // Rev. 3735 — alerta de duplicidade no Caixa Interno: quando o usuário cria um "Novo
  // lançamento" e já existe outro com mesma conta/valor/data, guarda os candidatos aqui
  // p/ confirmar antes de gravar (não bloqueia — só avisa).
  const [dupCaixaDialog, setDupCaixaDialog] = useState<{ conciliar: boolean; matches: any[] } | null>(null);
  const criarLancMut = (trpc as any).financial.createEntry.useMutation();
  const criarReceberMut = (trpc as any).financial.criarTituloReceber.useMutation();
  const darBaixaReceberMut = (trpc as any).financial.darBaixaReceber.useMutation();

  function abrirLancar(s: any) {
    const abs = Math.abs(Number(s.valor) || 0);
    const isEntrada = Number(s.valor) >= 0;
    lancCreatedRef.current = null;
    setLancStatement(s);
    // Rev. 3229 — se a linha do extrato foi identificada como compensação de um cheque do
    // Controle de Cheques, pré-preenche fornecedor/obra/forma e enriquece a descrição p/
    // o cadastro correto da despesa (cruzamento total extrato ↔ controle de cheques).
    const temCheque = !!s.chequeFornecedor || s.chequeNumero != null;
    const obraDoCheque = s.chequeObraId != null ? obrasOpts.find(o => o.id === Number(s.chequeObraId)) : undefined;
    const descBase = String(s.descricao ?? "").trim();
    const descCheque = temCheque
      ? [`Cheque nº ${s.chequeNumero ?? ""}`.trim(), s.chequeFornecedor ? `— ${s.chequeFornecedor}` : "", s.chequeNf ? `(NF ${s.chequeNf})` : ""].filter(Boolean).join(" ")
      : "";
    // Rev. 3230 — fatura de cartão: o ERP só considera o VALOR TOTAL (pagamento único).
    // Sem obra/fornecedor (o detalhe por obra/centro vive no módulo Cartão de Crédito).
    const temFatura = !temCheque && !!s.faturaId;
    const descFatura = temFatura
      ? `Pagamento fatura cartão ${s.faturaCartao ?? ""}${s.faturaMesRef ? ` (${String(s.faturaMesRef).padStart(2, "0")}/${s.faturaAnoRef ?? ""})` : ""}`.trim()
      : "";
    // Rev. 3238 — segunda verificação: identificado nos Demonstrativos de pagamento (PIX/boleto
    // lidos por IA). Pré-preenche beneficiário, forma (pix/boleto/ted) e enriquece a descrição.
    const temDemo = !temCheque && !temFatura && (!!s.demoBeneficiario || !!s.demoTipo);
    const demoLabel = s.demoTipo === "boleto" ? "Boleto" : s.demoTipo === "ted" ? "TED" : "PIX";
    const demoForma = s.demoTipo === "boleto" ? "boleto" : s.demoTipo === "ted" ? "transferencia" : "pix";
    const descDemo = temDemo
      ? [demoLabel, s.demoBeneficiario ? `— ${s.demoBeneficiario}` : "", s.demoDocumento ? `(${s.demoDocumento})` : ""].filter(Boolean).join(" ").trim()
      : "";
    // Rev. 3324 — ENTRADA: pré-preenche o cliente pagador (vínculo de cadastro ou beneficiário lido por IA).
    const clientePrefill = isEntrada ? (s.vinculoTipo === "cliente" && s.vinculoNome ? String(s.vinculoNome) : (s.demoBeneficiario ? String(s.demoBeneficiario) : "")) : "";
    const obraNomePrefill = obraDoCheque ? obraDoCheque.nome : "";
    // Rev. 3415 — sugestão de fornecedor vai só no display (pré-filtra o dropdown);
    // lancForm.fornecedorNome começa vazio — usuário deve confirmar clicando no item.
    const fornSugestao = isEntrada ? "" : (s.chequeFornecedor ?? (temDemo && s.demoBeneficiario ? s.demoBeneficiario : ((s.vinculoTipo === "fornecedor" && s.vinculoNome && (s.vinculoVia === "cnpj" || s.vinculoConfianca === "media")) ? String(s.vinculoNome) : "")));
    setLancObraDisplay(obraNomePrefill);
    setLancCCDisplay("");
    setLancFornDisplay(fornSugestao);
    setLancForm({
      data: String(s.data ?? "").slice(0, 10),
      valor: maskBRLInput(String(Math.round(abs * 100))),
      descricao: temCheque ? (descCheque || descBase) : (temFatura ? (descFatura || descBase) : (temDemo ? (descDemo || descBase) : descBase)),
      obraId: obraDoCheque ? String(obraDoCheque.id) : "",
      contaNome: "",
      centroCustoId: "",
      fornecedorNome: "",
      clienteId: "",
      clienteNome: clientePrefill,
      formaPagamento: temCheque ? "cheque" : (temFatura ? "cartao" : (temDemo ? demoForma : (() => {
        // Detecção por palavras-chave no texto do extrato (fallback quando não há cheque/fatura/demo IA)
        const d = descBase.toUpperCase();
        if (/\bPIX\b/.test(d))    return "pix";
        if (/\bTED\b/.test(d))    return "transferencia";
        if (/\bBOLETO\b/.test(d)) return "boleto";
        return "";
      })())),
      tipo: isEntrada ? "receita" : "despesa",
      contaId: "",
    });
  }

  // Rev. 3395 — Modo standalone: abre o form "Lançar no ERP" sem vínculo com extrato.
  // Permite criar um lançamento manualmente (débito ou crédito) com seleção de conta.
  function abrirLancStandalone() {
    lancCreatedRef.current = null;
    const today = new Date().toISOString().slice(0, 10);
    setLancStatement({ id: null, valor: undefined, data: today, contaBancariaId: Number(contaBancariaId) || null });
    setLancObraDisplay("");
    setLancCCDisplay("");
    setLancFornDisplay("");
    setLancForm({ data: today, valor: "", descricao: "", obraId: "", contaNome: "", contaId: "", centroCustoId: "", fornecedorNome: "", clienteId: "", clienteNome: "", formaPagamento: "", tipo: "despesa" });
  }

  // Rev. 3324 — Lança a partir da linha do extrato. ENTRADA → Contas a Receber
  // (criarTituloReceber; se conciliar, dá baixa "recebido" + concilia). SAÍDA →
  // Contas a Pagar (createEntry despesa; "só lançar" deixa a_pagar / "e conciliar"
  // grava pago + concilia). REGRA DE OURO: nada concilia sem o clique EXPLÍCITO em
  // "Lançar e conciliar"; "Só lançar" jamais toca a conciliação.
  async function submitLancar(conciliar: boolean, skipDupCheck = false) {
    if (!lancStatement) return;
    const valor = parseBRLInput(lancForm.valor);
    if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    if (!lancForm.data) { toast({ title: "Informe a data do lançamento", variant: "destructive" }); return; }
    const isStandalone = lancStatement?.id == null;
    // Rev. 3735 — ALERTA DE DUPLICIDADE (só no "Novo lançamento" do Caixa Interno): antes de
    // criar, checa se já existe lançamento com mesma conta + valor + data. Se houver, abre o
    // aviso e interrompe; o usuário confirma ("Criar mesmo assim") ou cancela. Falha na
    // checagem NÃO trava o lançamento (segue o fluxo normal).
    if (isStandalone && contaSelecionadaCaixaInterno && !skipDupCheck) {
      const contaDup = Number(lancStatement.contaBancariaId) || parseInt(contaBancariaId) || 0;
      if (contaDup) {
        try {
          const dup: any = await utils.financial.checkDuplicataCaixaInterno.fetch({
            companyId, contaBancariaId: contaDup, valor, dataCompetencia: lancForm.data,
          });
          if (dup?.matches?.length) { setDupCaixaDialog({ conciliar, matches: dup.matches }); return; }
        } catch { /* checagem falhou: não bloqueia o lançamento */ }
      }
    }
    const entrada = isStandalone ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0;
    const cat = catOpts.find(c => c.nome.trim().toLowerCase() === lancForm.contaNome.trim().toLowerCase());
    const natureza = cat?.natureza === "fixo" || cat?.natureza === "variavel" ? cat.natureza : "variavel";
    const obra = obrasOpts.find(o => String(o.id) === lancForm.obraId);
    const cc = ccOpts.find(c => String(c.id) === lancForm.centroCustoId);
    // conta bancária da PRÓPRIA linha do extrato (no panorama não há conta selecionada).
    const contaDaLinha = Number(lancStatement.contaBancariaId) || parseInt(contaBancariaId) || undefined;
    const descricao = lancForm.descricao.trim();
    // Se já criamos o lançamento desta linha numa tentativa anterior (e só a
    // conciliação falhou), reaproveita o id — NÃO recria (evita duplicidade).
    const jaCriado = lancCreatedRef.current?.stmtId === lancStatement.id ? lancCreatedRef.current.entryId : undefined;

    // ── ENTRADA → CONTAS A RECEBER ─────────────────────────────────────────────
    if (entrada) {
      if (!descricao) { toast({ title: "Informe a descrição do recebível", variant: "destructive" }); return; }
      const cliente = clienteOpts.find(c => c.nome.trim().toLowerCase() === lancForm.clienteNome.trim().toLowerCase());
      try {
        setLancBusy(true);
        let entryId = jaCriado;
        if (!entryId) {
          const res: any = await criarReceberMut.mutateAsync({
            companyId,
            clienteId: cliente?.id, clienteNome: lancForm.clienteNome.trim() || undefined,
            contaId: cat?.id, contaNome: lancForm.contaNome.trim() || undefined,
            obraId: obra?.id ?? null, obraNome: obra?.nome,
            descricao, valorPrevisto: valor,
            dataCompetencia: lancForm.data, dataVencimento: lancForm.data,
            natureza,
          });
          entryId = res?.ids?.[0];
          if (entryId) lancCreatedRef.current = { stmtId: lancStatement.id, entryId };
        }
        if (conciliar && entryId) {
          // baixa (recebido) + concilia com a linha do extrato — ação EXPLÍCITA do usuário.
          // No RETRY (título já criado e baixado numa tentativa anterior em que só a
          // conciliação falhou), o backend rejeita 2ª baixa com "já recebido integralmente";
          // tolera-se essa mensagem e segue direto p/ conciliar (idempotência do retry).
          try {
            await darBaixaReceberMut.mutateAsync({
              id: entryId, companyId, valorRecebido: valor,
              dataRecebimento: lancForm.data, contaBancariaId: contaDaLinha,
              formaPagamento: lancForm.formaPagamento || undefined,
            });
          } catch (baixaErr: any) {
            if (!/j[áa]\s+recebid/i.test(String(baixaErr?.message ?? ""))) throw baixaErr;
          }
          if (!isStandalone) {
            await lancConciliarMut.mutateAsync({ companyId, statementLineId: lancStatement.id, entryId });
          }
          lancCreatedRef.current = null;
          setReportStale(true);
          if (!isStandalone && lancStatement?.id) setDismissedStmtIds(prev => new Set([...prev, Number(lancStatement.id)]));
        } else {
          toast({ title: "Recebível lançado no Contas a Receber!" });
          setReportStale(true);
          if (!isStandalone && lancStatement?.id) setDismissedStmtIds(prev => new Set([...prev, Number(lancStatement.id)]));
        }
        setLancStatement(null);
        // Rev. 3741 — atualiza a lista do Caixa Interno na hora (A confirmar/Confirmadas),
        // sem precisar recarregar a página. refetchCaixa é no-op quando a query está desabilitada.
        refetchCaixa();
      } catch (e: any) {
        if (lancCreatedRef.current?.stmtId === lancStatement.id) {
          toast({ title: "Recebível criado, mas a baixa/conciliação falhou", description: `${transportErrMsg(e)} — clique novamente para tentar conciliar (não recria o título) ou concilie manualmente.`, variant: "destructive" });
        } else {
          toast({ title: "Erro ao lançar no Contas a Receber", description: transportErrMsg(e), variant: "destructive" });
        }
      } finally {
        setLancBusy(false);
      }
      return;
    }

    // ── SAÍDA → CONTAS A PAGAR ─────────────────────────────────────────────────
    try {
      setLancBusy(true);
      let entryId = jaCriado;
      if (!entryId) {
        const novo: any = await criarLancMut.mutateAsync({
          companyId, tipo: "despesa", natureza,
          valorPrevisto: valor,
          ...(conciliar ? { valorRealizado: valor, dataPagamento: lancForm.data, status: "pago" } : { status: "a_pagar" }),
          dataCompetencia: lancForm.data, dataVencimento: lancForm.data,
          contaBancariaId: contaDaLinha,
          obraId: obra?.id, obraNome: obra?.nome,
          contaId: cat?.id, contaNome: lancForm.contaNome.trim() || undefined,
          centroCustoId: cc?.id, centroCustoNome: cc?.nome,
          // Rev. 3739 — salva o fornecedor mesmo SEM confirmar no dropdown: se o usuário só
          // digitou um nome (não existe no cadastro / não clicou no item), usa o texto digitado
          // (lancFornDisplay). fornecedor_nome é coluna de TEXTO (sem FK), então texto livre é válido.
          fornecedorNome: (lancForm.fornecedorNome.trim() || lancFornDisplay.trim()) || undefined,
          descricao: descricao || undefined,
          formaPagamento: lancForm.formaPagamento || undefined,
        });
        entryId = novo?.id;
        if (entryId) lancCreatedRef.current = { stmtId: lancStatement.id, entryId };
      }
      if (conciliar && entryId && !isStandalone) {
        // Auto-concilia o lançamento com a linha do extrato (onSuccess refaz os fetches).
        // Mutation DEDICADA (sem onError próprio) p/ o erro cair no catch abaixo sem toast duplo.
        await lancConciliarMut.mutateAsync({ companyId, statementLineId: lancStatement.id, entryId });
        lancCreatedRef.current = null;
        setReportStale(true);
        if (lancStatement?.id) setDismissedStmtIds(prev => new Set([...prev, Number(lancStatement.id)]));
      } else {
        toast({ title: "Conta a pagar lançada!" });
        setReportStale(true);
        if (!isStandalone && lancStatement?.id) setDismissedStmtIds(prev => new Set([...prev, Number(lancStatement.id)]));
      }
      setLancStatement(null);
      // Rev. 3741 — atualiza a lista do Caixa Interno na hora (A confirmar/Confirmadas),
      // sem precisar recarregar a página. refetchCaixa é no-op quando a query está desabilitada.
      refetchCaixa();
    } catch (e: any) {
      // Lançamento já criado + conciliação falhou: preserva o id; novo clique só concilia.
      if (lancCreatedRef.current?.stmtId === lancStatement.id) {
        toast({ title: "Lançamento criado, mas a conciliação falhou", description: `${transportErrMsg(e)} — clique novamente para tentar conciliar (não recria o lançamento) ou concilie manualmente.`, variant: "destructive" });
      } else {
        toast({ title: "Erro ao lançar no Contas a Pagar", description: transportErrMsg(e), variant: "destructive" });
      }
    } finally {
      setLancBusy(false);
    }
  }

  const { data: statements, isLoading: stLoading, refetch: refetchSt } = (trpc as any).financial.getBankStatements.useQuery(
    {
      companyId,
      contaBancariaId: parseInt(contaBancariaId) || 0,
      dataInicio,
      dataFim,
      conciliado: conciliadoFilter !== "all" ? conciliadoFilter === "conciliado" : undefined,
    },
    { enabled: !!companyId && !!contaBancariaId }
  );
  // Rev. 3411 — lista abre imediatamente; busca filtra em tempo real quando digitada
  const { data: entriesTroca, isFetching: entriesTrocaFetching } = (trpc as any).financial.getEntries.useQuery(
    { companyId, busca: buscaTroca.trim().length >= 1 ? buscaTroca.trim() : undefined, excluirCronograma: true, limit: 50 },
    { enabled: !!trocandoLine }
  );
  // Rev. 3419 — Conciliar PIX rápido: busca lançamentos ERP para o dialog do cheque devolvido
  const { data: entriesConciliarPix, isFetching: entriesConciliarPixFetching } = (trpc as any).financial.getEntries.useQuery(
    { companyId, busca: buscaConciliarPix.trim().length >= 1 ? buscaConciliarPix.trim() : (conciliarPixDlg?.cheque?.fornecedor ?? undefined), excluirCronograma: true, limit: 50 },
    { enabled: !!conciliarPixDlg }
  );
  // Rev. 3752 — CHEQUES do Controle de Cheques como candidatos nos 2 diálogos (alguns
  // cheques existem SÓ lá, sem lançamento de despesa → antes não apareciam na busca).
  const { data: chequesTroca } = (trpc as any).financial.getChequesParaConciliacao.useQuery(
    { companyId, busca: buscaTroca.trim().length >= 1 ? buscaTroca.trim() : undefined, valorRef: trocandoLine?.extratoValor || undefined, limit: 30 },
    { enabled: !!trocandoLine }
  );
  const { data: chequesConciliarPix } = (trpc as any).financial.getChequesParaConciliacao.useQuery(
    { companyId, busca: buscaConciliarPix.trim().length >= 1 ? buscaConciliarPix.trim() : (conciliarPixDlg?.cheque?.fornecedor ?? undefined), valorRef: (conciliarPixDlg ? (Math.abs(Number(conciliarPixDlg.cheque.valor) || (conciliarPixDlg.cheque.valorCents ? conciliarPixDlg.cheque.valorCents / 100 : 0)) || undefined) : undefined), limit: 30 },
    { enabled: !!conciliarPixDlg }
  );

  // Rev. 3365 — Status POR MÊS p/ pintar as bolinhas da timeline. Agora roda SEM exigir
  // conta selecionada: na visão "lista de contas" agrega o extrato de TODAS as contas da
  // empresa no ano; quando uma conta é escolhida, restringe a ela. Antes (Rev. 3165) usava
  // getBankStatements do ano com `enabled: !!contaBancariaId` → sem conta, todos os meses
  // ficavam cinza mesmo havendo extrato (ex.: extrato cadastrado em Dez sem conta aberta).
  const { data: statementsAno, refetch: refetchStAno } = (trpc as any).financial.getBankStatementsMonthlyStatus.useQuery(
    { companyId, ano, contaBancariaId: parseInt(contaBancariaId) || undefined },
    { enabled: !!companyId }
  );
  // Rev. 3170 — Status de conciliação POR CONTA no período selecionado, p/ pintar cada
  // card de conta (verde = extrato subido e 100% conciliado; azul = tem pendência;
  // cinza = sem extrato no período). Independe da conta selecionada.
  const { data: accStatus, refetch: refetchAccStatus } = (trpc as any).financial.getBankAccountsConciliacaoStatus.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: !!companyId }
  );
  const accStatusMap: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (const a of (accStatus ?? [])) map[Number(a.contaBancariaId)] = a.status;
    return map;
  }, [accStatus]);
  // Rev. 3420 — qtd de linhas já conciliadas por conta (para o badge verde no card "A conciliar")
  const accConciliadasMap: Record<number, { conciliadas: number; total: number }> = useMemo(() => {
    const map: Record<number, { conciliadas: number; total: number }> = {};
    for (const a of (accStatus ?? [])) map[Number(a.contaBancariaId)] = { conciliadas: Number(a.conciliadas) || 0, total: Number(a.total) || 0 };
    return map;
  }, [accStatus]);

  // Rev. 3365 — agora consome a agregação por mês vinda do backend
  // (getBankStatementsMonthlyStatus): cada linha já traz { mes, total, conciliadas, status }.
  const mesesStatus: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    for (const r of (statementsAno ?? [])) {
      const m = Number(r?.mes);
      if (!m || m < 1 || m > 12) continue;
      map[m] = r.status === "consolidado" ? "consolidado" : r.status === "lancamento" ? "lancamento" : "vazio";
    }
    return map;
  }, [statementsAno]);
  // Rev. 3421 — % de conciliação por mês (todas as contas agregadas), para o pill do mês
  const mesesPct: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of (statementsAno ?? [])) {
      const m = Number(r?.mes);
      if (!m || m < 1 || m > 12) continue;
      const total = Number(r.total) || 0;
      const conciliadas = Number(r.conciliadas) || 0;
      map[m] = total > 0 ? Math.round(conciliadas / total * 100) : 0;
    }
    return map;
  }, [statementsAno]);

  const conciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport(); setConfirmGeralConciliar(null); setSelectedStatement(null); setSelectedEntry(null); setManualExtSel(null); setManualLanSel(null); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  // Rev. 3239 — conciliação de um GRUPO unificado (VR / combustível / manutenção) contra UMA
  // linha do extrato (N lançamentos : 1 linha). Mesma UX do par 1:1, mas envia os itensIds.
  const conciliarGrupoMut = (trpc as any).financial.conciliarGrupoLancamentos.useMutation({
    onSuccess: (res: any) => { toast({ title: `Grupo conciliado! ${formatInt(res.conciliados)} lançamento(s) baixado(s).` }); refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport(); setConfirmGeralConciliar(null); setSelectedStatement(null); setSelectedEntry(null); setManualExtSel(null); setManualLanSel(null); },
    onError: (e: any) => toast({ title: "Erro ao conciliar grupo", description: e.message, variant: "destructive" }),
  });
  // Rev. 3399 — Conciliação de lançamento SEM conta bancária via sugestão automática.
  const [confirmSemConta, setConfirmSemConta] = useState<{ entry: any; sug: any } | null>(null);
  const conciliarSemContaMut = (trpc as any).financial.conciliarSemContaComExtrato.useMutation({
    onSuccess: () => {
      toast({ title: "Lançamento vinculado e conciliado!", description: `Conta bancária preenchida automaticamente.` });
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport();
      setConfirmSemConta(null);
    },
    onError: (e: any) => toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }),
  });
  // Rev. 3419 — Conciliar PIX rápido: mutation dedicada que fecha o dialog ao concluir
  const conciliarPixMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => {
      toast({ title: "PIX conciliado!", description: "Linha do extrato vinculada ao lançamento ERP." });
      setConciliarPixDlg(null); setConciliarPixEntry(null); setBuscaConciliarPix("");
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport();
    },
    onError: (e: any) => toast({ title: "Erro ao conciliar PIX", description: e.message, variant: "destructive" }),
  });
  // Rev. 3752 — Opção A: conciliar uma linha do extrato contra um CHEQUE do Controle de
  // Cheques sem lançamento → CRIA a despesa (paga), concilia a linha e BAIXA o cheque.
  // Serve aos 2 diálogos ("Conciliar PIX no extrato" e "Trocar lançamento vinculado").
  const conciliarChequeMut = (trpc as any).financial.conciliarChequeComLinha.useMutation({
    onSuccess: () => {
      toast({ title: "Cheque conciliado!", description: "Despesa criada (paga), linha do extrato vinculada e cheque baixado no Controle de Cheques." });
      setConciliarPixDlg(null); setConciliarPixEntry(null); setBuscaConciliarPix("");
      setTrocandoLine(null); setBuscaTroca("");
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport();
    },
    onError: (e: any) => toast({ title: "Erro ao conciliar cheque", description: e.message, variant: "destructive" }),
  });
  // Rev. 3752 — nº do cheque/Doc de um LANÇAMENTO p/ exibir nos candidatos (assim o
  // usuário enxerga QUAL cheque é cada candidato e não concilia o errado quando o valor
  // repete). As colunas cheque_numero/comprovante_documento costumam vir vazias → cai no
  // parse da descrição ("Cheque nº 903" / "Doc 000903").
  const entryChequeIdent = (e: any): string | null => {
    const direto = (e?.chequeNumero && String(e.chequeNumero).trim()) || (e?.comprovanteDocumento && String(e.comprovanteDocumento).trim()) || "";
    if (direto) return direto.replace(/^0+/, "") || direto;
    return parseChequeNumero(e?.descricao) || parseDocNumero(e?.descricao);
  };
  // Rev. 3752 — linha de um CHEQUE candidato (vindo do Controle de Cheques) nos diálogos.
  const renderChequeCandidato = (chq: any, valRef: number, selected: boolean, onPick: () => void) => {
    const valor = Math.abs(Number(chq.valor) || 0);
    const exato = valRef > 0 && Math.abs(valor - valRef) < 0.015;
    const diffPct = valRef > 0 && !exato ? Math.round(Math.abs(valor - valRef) / valRef * 100) : null;
    return (
      <button key={`chq-${chq.chequeId}`} type="button" onClick={onPick} disabled={conciliarChequeMut.isPending}
        className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 disabled:opacity-60 ${selected ? "bg-amber-50 ring-1 ring-inset ring-amber-300" : "hover:bg-amber-50/60"}`}
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-amber-800 break-words flex items-center gap-1.5 flex-wrap">
            🪙 Cheque nº {chq.numeroCheque || "—"}
            <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wide">Controle de Cheques</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-gray-700 break-words">{chq.fornecedorNome || "—"}</span>
            <span className="text-gray-300">·</span>
            <span className="tabular-nums font-medium text-gray-700">{formatBRL(valor)}</span>
            {chq.dataVencimento && <><span className="text-gray-300">·</span><span>venc. {fmtData(chq.dataVencimento)}</span></>}
            {chq.obraNome && <><span className="text-gray-300">·</span><span className="break-words">{chq.obraNome}</span></>}
          </div>
        </div>
        <div className="shrink-0 mt-0.5">
          {exato
            ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">= valor exato</span>
            : diffPct !== null
              ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${diffPct <= 5 ? "bg-blue-100 text-blue-700" : diffPct <= 20 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>Δ {diffPct}%</span>
              : null}
        </div>
      </button>
    );
  };
  // Rev. 3198 — conciliação do fluxo "Lançar": SEM onError próprio (o erro é tratado
  // no catch do submitLancar, preservando o id criado p/ não duplicar no retry).
  const lancConciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Lançado e conciliado!" }); refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport(); setSelectedStatement(null); setSelectedEntry(null); },
  });
  // Rev. 3742 — DESCONSIDERAR / RECONSIDERAR cheque devolvido do cálculo do %. NÃO apaga o
  // cheque: tira o par do percentual (cheque já pago por PIX/TED conciliado em OUTRA conta),
  // deixando o % chegar a 100%. Reversível. Repinta todas as superfícies de % (cards/meses).
  const repintarConciliacao = () => {
    refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport();
    (utils as any).financial?.getConciliacaoResumoMensal?.invalidate?.();
  };
  // Rev. 3753 — estas mutations são IDEMPOTENTES (UPDATE guardado por desconsiderado_em).
  // Quando a requisição cai por TRANSPORTE (servidor reiniciando/conexão instável), o fetch
  // estoura "Unexpected end of JSON input" (corpo vazio) mesmo que a alteração TENHA sido
  // aplicada. Nesse caso recarregamos os dados e mostramos um aviso claro em PT em vez do
  // erro técnico em inglês.
  const ehErroTransporte = (e: any) => {
    const m = String(e?.message ?? "").toLowerCase();
    return m.includes("json") || m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror") || m.includes("aborted");
  };
  const onErroConciliacao = (acao: string, e: any) => {
    if (ehErroTransporte(e)) {
      repintarConciliacao();
      toast({ title: "Conexão instável", description: `Não foi possível confirmar a resposta do servidor. Recarregamos os dados — confira se o cheque foi ${acao}. Se não, tente novamente.`, variant: "destructive" });
    } else {
      toast({ title: acao === "desconsiderado" ? "Erro ao desconsiderar" : "Erro ao reconsiderar", description: e?.message ?? String(e), variant: "destructive" });
    }
  };
  const desconsiderarChequeMut = (trpc as any).financial.desconsiderarChequeDevolvido.useMutation({
    onSuccess: (res: any) => {
      toast({ title: "Cheque desconsiderado da conciliação", description: `${formatInt(res?.afetados ?? 0)} linha(s) fora do cálculo do %.` });
      repintarConciliacao();
    },
    onError: (e: any) => onErroConciliacao("desconsiderado", e),
  });
  const reconsiderarChequeMut = (trpc as any).financial.reconsiderarChequeDevolvido.useMutation({
    onSuccess: (res: any) => {
      toast({ title: "Cheque reconsiderado", description: `${formatInt(res?.afetados ?? 0)} linha(s) de volta ao cálculo do %.` });
      repintarConciliacao();
    },
    onError: (e: any) => onErroConciliacao("reconsiderado", e),
  });

  // Rev. 3175 — Importação em 2 fases com PROGRESSO REAL (0–100%): analisa (parse →
  // devolve linhas) e grava em LOTES; o % = linhas processadas / total.
  const analyzeMut = (trpc as any).financial.analyzeBankStatement.useMutation();
  const insertBatchMut = (trpc as any).financial.insertBankStatementBatch.useMutation();
  const lancarRendimentoMut = (trpc as any).financial.lancarRendimentoAplicacao.useMutation();
  const [importRunning, setImportRunning] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importLabel, setImportLabel] = useState("");

  // Rev. 3169 — Consolidar / desconsolidar o mês de uma vez (fecha/reabre todas as
  // linhas do extrato da conta+período). Repinta o extrato do mês e as bolinhas do ano.
  const consolidarMut = (trpc as any).financial.consolidarMes.useMutation({
    onSuccess: (res: any) => { toast({ title: `Mês consolidado! ${formatInt(res.afetados)} lançamento(s) marcado(s).` }); refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(false); refetchReport(); },
    onError: (e: any) => toast({ title: "Erro ao consolidar", description: e.message, variant: "destructive" }),
  });
  const desconsolidarMut = (trpc as any).financial.desconsolidarMes.useMutation({
    onSuccess: (res: any) => { toast({ title: `Mês reaberto! ${formatInt(res.afetados)} lançamento(s) desmarcado(s).` }); refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(false); refetchReport(); },
    onError: (e: any) => toast({ title: "Erro ao desconsolidar", description: e.message, variant: "destructive" }),
  });
  // Rev. 3179 — Limpar extrato importado errado (conta+período). Soft-delete no backend.
  const limparMut = (trpc as any).financial.limparExtrato.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.afetados > 0 ? `Extrato limpo! ${formatInt(res.afetados)} linha(s) removida(s).` : "Nada para limpar neste período." });
      setConfirmLimpar(false);
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(false); refetchReport();
    },
    onError: (e: any) => toast({ title: "Erro ao limpar extrato", description: e.message, variant: "destructive" }),
  });
  // Rev. 3534 — Limpar extratos de TODAS as contas do mês (bulk — validação do sistema).
  const limparExtratoMesMut = (trpc as any).financial.limparExtratoMes.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.afetados > 0 ? `Extratos limpos! ${formatInt(res.afetados)} linha(s) removida(s) de todas as contas.` : "Nenhuma linha encontrada neste período." });
      setShowLimparMesDlg(false);
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(false); refetchReport();
    },
    onError: (e: any) => { toast({ title: "Erro ao limpar extratos", description: e.message, variant: "destructive" }); setShowLimparMesDlg(false); },
  });
  // Rev. 3386 — exclusão individual (soft-delete) de uma linha do extrato.
  const excluirLinhaMut = (trpc as any).financial.excluirLinhaExtrato.useMutation({
    onSuccess: () => {
      toast({ title: "Linha removida do extrato", description: "Se estava conciliada, o lançamento do ERP voltou a pendente." });
      setConfirmExcluirLinha(null);
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(false); refetchReport();
    },
    onError: (e: any) => {
      toast({ title: "Erro ao remover linha", description: e.message, variant: "destructive" });
      setConfirmExcluirLinha(null);
    },
  });
  // Rev. 3396 — Desfaz a conciliação de uma linha SEM excluí-la do extrato.
  // A linha volta para "No extrato, sem lançamento" e o lançamento do ERP
  // retorna para pendente (a_pagar / a_receber).
  const [confirmDesconciliar, setConfirmDesconciliar] = useState<{ id: number; descricao: string; valor: number } | null>(null);
  // Rev. 3501 — IDs de linhas conciliadas que foram desconciliadas nesta sessão.
  // Remove o item de repConc IMEDIATAMENTE, antes do próximo "Atualizar".
  const [dismissedConcIds, setDismissedConcIds] = useState<Set<number>>(new Set());
  const desconciliarMut = (trpc as any).financial.desconciliarLinha.useMutation({
    onSuccess: (_data: any, variables: any) => {
      toast({ title: "Conciliação desfeita", description: "A linha voltou para o extrato pendente e o lançamento do ERP está como pendente." });
      if (variables?.linhaId) setDismissedConcIds(prev => new Set([...prev, Number(variables.linhaId)]));
      setConfirmDesconciliar(null);
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(false); refetchReport();
    },
    onError: (e: any) => {
      toast({ title: "Erro ao desfazer conciliação", description: e.message, variant: "destructive" });
      setConfirmDesconciliar(null);
    },
  });
  // Rev. 3520 — Seleção múltipla em "Já conciliados" para desfazer em lote.
  const [selectedConcIds, setSelectedConcIds] = useState<Set<number>>(new Set());
  const [confirmBulkDesconciliar, setConfirmBulkDesconciliar] = useState(false);
  const [bulkDesconciliarPending, setBulkDesconciliarPending] = useState(false);
  // Mutation silenciosa (sem toast individual) usada no bulk.
  const desconciliarSilentMut = (trpc as any).financial.desconciliarLinha.useMutation({
    onSuccess: (_d: any, variables: any) => {
      if (variables?.linhaId) setDismissedConcIds(prev => new Set([...prev, Number(variables.linhaId)]));
    },
  });
  async function executarBulkDesconciliar() {
    setBulkDesconciliarPending(true);
    const ids = Array.from(selectedConcIds);
    let ok = 0;
    for (const id of ids) {
      try { await desconciliarSilentMut.mutateAsync({ companyId, linhaId: id }); ok++; } catch {}
    }
    setBulkDesconciliarPending(false);
    setSelectedConcIds(new Set());
    setConfirmBulkDesconciliar(false);
    setReportStale(false);
    refetchSt(); refetchStAno(); refetchAccStatus(); refetchReport();
    toast({ title: `${ok} de ${ids.length} conciliação(ões) desfeita(s)`, description: "As linhas voltaram para o extrato pendente." });
  }
  // Rev. 3392 — Confirmar movimentação interna: cria lançamento tipo "transferencia"/
  // natureza "interno" + concilia a linha do extrato em 1 clique.
  const naturezaInternaMut = (trpc as any).financial.confirmarMovimentacaoInterna.useMutation({
    onSuccess: (_: any, variables: any) => {
      toast({ title: "Lançado como movimentação interna", description: "Linha conciliada. O lançamento ficará catalogado como transferência interna do grupo." });
      if (variables?.lineId) setDismissedStmtIds((prev: Set<number>) => { const n = new Set(prev); n.add(Number(variables.lineId)); return n; });
      setLancStatement(null);
      refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport();
    },
    onError: (e: any) => toast({ title: "Não foi possível lançar como interna", description: e?.message ?? "Tente novamente.", variant: "destructive" }),
  });

  const { data: sugData, isFetching: sugLoading, refetch: refetchSug } = (trpc as any).financial.sugerirConciliacao.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, toleranciaDias },
    { enabled: !!companyId && !!contaBancariaId && mostrarSugestoes }
  );
  // Rev. 3411 — filtra localmente as linhas já conciliadas (sem re-análise automática)
  // Rev. 3447 — também exclui linhas descartadas manualmente pelo usuário
  const sugestoes: any[] = (sugData?.sugestoes ?? []).filter((s: any) => !conciliadosIds.has(s.statementLineId) && !sugDescartadas.has(s.statementLineId));
  const semMatch: any[] = sugData?.semMatch ?? [];
  // Rev. 3201 — fonte ÚNICA dos pares selecionados (contador + render do diálogo + payload),
  // p/ o número exibido nunca divergir do que será efetivamente enviado.
  const sugSelecionadas: any[] = sugestoes.filter(s => selSug.has(s.statementLineId));

  // Rev. 3190 — barra de progresso 0→100% durante a análise ("Analisando..."). O
  // sugerirConciliacao é uma query única (sem progresso real do servidor), então
  // animamos: sobe gradual (mais devagar perto do fim) enquanto cruza e completa
  // em 100% ao terminar, dando ao usuário a sensação de evolução.
  const [sugProgress, setSugProgress] = useState(0);
  useEffect(() => {
    if (sugLoading) {
      setSugProgress(8);
      const id = setInterval(() => {
        setSugProgress(p => {
          if (p >= 92) return p;
          const step = p < 50 ? 7 : p < 75 ? 3 : 1;
          return Math.min(92, p + step);
        });
      }, 200);
      return () => clearInterval(id);
    }
    setSugProgress(p => (p > 0 ? 100 : 0));
    const t = setTimeout(() => setSugProgress(0), 700);
    return () => clearTimeout(t);
  }, [sugLoading]);

  // Rev. 3398 — CAIXA INTERNO: query e mutations para contas sem extrato bancário.
  const contaSelecionadaCaixaInterno = !!(bankAccounts ?? []).find((b: any) => String(b.id) === contaBancariaId && Number(b.caixaInterno) === 1);
  const { data: caixaData, isFetching: caixaLoading, isError: caixaIsError, error: caixaError, refetch: refetchCaixa } = (trpc as any).financial.getEntradasCaixaInterno.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim },
    { enabled: !!companyId && !!contaBancariaId && contaSelecionadaCaixaInterno, retry: false }
  );
  const confirmarEntradaMut = (trpc as any).financial.confirmarEntradaCaixa.useMutation({
    onSuccess: () => { toast({ title: "Entrada confirmada!" }); refetchCaixa(); },
    onError: (e: any) => { toast({ title: "Erro", description: e.message, variant: "destructive" }); },
  });
  const desconciliarEntradaMut = (trpc as any).financial.desconciliarEntradaCaixa.useMutation({
    onSuccess: () => { toast({ title: "Confirmação desfeita." }); refetchCaixa(); },
    onError: (e: any) => { toast({ title: "Erro", description: e.message, variant: "destructive" }); },
  });

  // Rev. 3187 — Relatório consolidado da conta/período (3 blocos), agora EMBUTIDO na tela
  // única (o Painel separado foi aposentado). Conciliados, extrato-sem-lançamento e
  // lançamento-sem-extrato vêm de uma fonte só (getConciliacaoReport), READ-ONLY.
  const { data: report, isFetching: reportLoading, isError: reportIsError, error: reportError, refetch: refetchReport } = (trpc as any).financial.getConciliacaoReport.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim },
    // Rev. 3445 — habilitado também p/ Caixa Interno: não tem extrato, mas precisa do bloco
    // "Sem conta bancária definida" (lancamentosSemConta) p/ o usuário vincular lançamentos.
    // Rev. 3478 — staleTime Infinity: não refaz automaticamente; usuário controla via "Atualizar".
    { enabled: !!companyId && !!contaBancariaId, retry: false, staleTime: Infinity, refetchOnWindowFocus: false }
  );
  // Rev. 3500/3501 — quando o report é recarregado (usuário clicou "Atualizar"), limpa os IDs
  // descartados otimisticamente — o backend já reflete o estado real.
  useEffect(() => { setDismissedStmtIds(new Set()); setDismissedConcIds(new Set()); }, [report]);
  // Rev. 3319 — PANORAMA GERAL DO MÊS: quando há um MÊS selecionado mas NENHUMA conta,
  // roda o mesmo motor de conciliação para TODAS as contas com extrato no período e
  // devolve totais agregados + por conta. READ-ONLY (nada concilia sem entrar na conta).
  const geralAtivo = !!companyId && periodoDefinido && !contaBancariaId;
  const { data: reportGeral, isFetching: geralLoading, isError: geralIsError, error: geralError, refetch: refetchGeral } = (trpc as any).financial.getConciliacaoReportGeral.useQuery(
    { companyId, dataInicio, dataFim },
    // Rev. 3478 — staleTime Infinity: idem.
    { enabled: geralAtivo, retry: false, staleTime: Infinity, refetchOnWindowFocus: false }
  );
  // Rev. 3704 — painel de saúde: status de conciliação dos 12 meses do ano (bolinha/% por mês).
  const { data: resumoSaude } = (trpc as any).financial.getConciliacaoResumoMensal.useQuery(
    { companyId, ano },
    { enabled: companyId > 0, staleTime: 5 * 60_000, refetchOnWindowFocus: false }
  );
  // Rev. 3441 — varredura OC/OS/Locação por mês (panorama)
  const { data: ocsMesData, isFetching: ocsMesLoading } = (trpc as any).financial.getOcsPorMes.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: geralAtivo, retry: false }
  );
  // Rev. 3478 — atualiza o relatório manualmente (remove o badge de "desatualizado").
  function atualizarRelatorio() {
    setReportStale(false);
    refetchReport();
    if (geralAtivo) refetchGeral();
    if (mostrarSugestoes) refetchSug();
  }

  const geralTotais: any = reportGeral?.totais ?? null;
  const geralContas: any[] = reportGeral?.contas ?? [];
  const geralSemConta: any[] = reportGeral?.lancamentosSemConta ?? [];
  // Rev. 3319 — listas unificadas do panorama (cada linha já vem tagueada com a conta de
  // origem pelo backend). O extrato filtra os pares de estorno (mesma regra do por-conta).
  const geralExtAll: any[] = (reportGeral?.extratoSemLancamento ?? []).filter((r: any) => !r.reversal && !r.reversalResolveGrupo);
  const geralLanAll: any[] = reportGeral?.lancamentosSemExtrato ?? [];
  // Rev. 3327 — DRILL-IN DOS CARDS DO PANORAMA: cada card de cima vira clicável e abre um
  // diálogo com TODAS as linhas que compõem aquele número. Os dados já vêm no report (por
  // conta); aqui apenas achatamos para a empresa toda. READ-ONLY (nada concilia/baixa).
  // Rev. 3349 — "interno" abre a movimentação interna (transf. entre contas/aplicação/intra-FC).
  const [panoramaDrill, setPanoramaDrill] = useState<null | "entradas" | "saidas" | "saldo" | "interno" | "conciliados" | "extratoSemLanc" | "lancSemExtrato" | "pct">(null);
  // Rev. 3441 — meses expandidos no painel OC/OS/Locação
  const [ocsMesExp, setOcsMesExp] = useState<Set<string>>(new Set());
  // Rev. 3351 — exceção por lançamento (caixa real × movimentação interna).
  const [ovRow, setOvRow] = useState<LancNaturezaLinha | null>(null);
  // Rev. 3368 — mapa "Movimentação interna do grupo" (montante por contraparte).
  const [showMapaInterno, setShowMapaInterno] = useState(false);
  // Rev. 3372 — painel "Conferir cheques com o extrato" (pré-confirmação em lote).
  const [showConferirCheques, setShowConferirCheques] = useState(false);
  const drill = useMemo(() => {
    const contas: any[] = reportGeral?.contas ?? [];
    const conc: any[] = [];
    const ext: any[] = [];
    const lan: any[] = [];
    for (const c of contas) {
      for (const x of (c.conciliados ?? [])) conc.push(x);
      for (const x of (c.extratoSemLancamento ?? []).filter((r: any) => !r.reversal && !r.reversalResolveGrupo)) ext.push(x);
      for (const x of (c.lancamentosSemExtrato ?? [])) lan.push(x);
    }
    // Movimentação do extrato = conciliado + pendente (mesma base do backend p/ entradas/saídas).
    const extratoTodo = [...conc, ...ext];
    // Rev. 3349 — entradas/saídas são CAIXA REAL (externo, !interno); "interno" abre só a
    // movimentação interna (transf. entre contas/aplicação/intra-FC). Tag `interno` vem do backend.
    const extratoExt = extratoTodo.filter((x: any) => !x.interno);
    const entradas = extratoExt.filter((x: any) => (Number(x.valor) || 0) > 0);
    const saidas = extratoExt.filter((x: any) => (Number(x.valor) || 0) < 0);
    const interno = extratoTodo.filter((x: any) => x.interno);
    const ordPorData = (a: any, b: any) => String(a.data ?? "").localeCompare(String(b.data ?? ""));
    return {
      conciliados: [...conc].sort(ordPorData),
      extratoSemLanc: [...ext].sort(ordPorData),
      lancSemExtrato: [...lan].sort(ordPorData),
      entradas: [...entradas].sort(ordPorData),
      saidas: [...saidas].sort(ordPorData),
      interno: [...interno].sort(ordPorData),
    };
  }, [reportGeral]);
  // Ao carregar o panorama, abre por padrão as contas com pendências (extrato OU ERP).
  useEffect(() => {
    if (!reportGeral || geralExpInit) return;
    const abrir = new Set<number>();
    for (const c of geralContas) {
      const t = c.totais ?? {};
      if ((t.extratoSemLancamento ?? 0) > 0 || (t.lancamentosSemExtrato ?? 0) > 0) abrir.add(Number(c.contaBancariaId));
    }
    setGeralContasExp(abrir);
    setGeralExpInit(true);
  }, [reportGeral, geralExpInit, geralContas]);
  // Reseta a inicialização quando sai do modo panorama, p/ recalcular ao voltar.
  useEffect(() => { if (!geralAtivo) { setGeralExpInit(false); setGeralContasExp(new Set()); } }, [geralAtivo]);
  // Rev. 3319 — limpa a seleção (extrato/lançamento) e o diálogo ao trocar de modo
  // (panorama ↔ conta específica), pra não carregar seleção residual de um modo no outro.
  useEffect(() => { setSelectedStatement(null); setSelectedEntry(null); setConfirmGeralConciliar(null); setManualExtSel(null); setManualLanSel(null); }, [contaBancariaId]);
  // Rev. 3266 — grava o veredicto da conferência da identificação por IA (confirmado/errado/
  // desfazer). NÃO concilia/baixa nada — só registra. Após salvar, refaz o report p/ a tela
  // refletir o ✓/✗ na linha e fecha o diálogo.
  const confirmarDemoMut = (trpc as any).financial.confirmarDemonstrativo.useMutation({
    onSuccess: (_d: any, vars: any) => {
      toast({ title: vars?.veredicto === "errado" ? "Marcado como errado" : vars?.veredicto === "pendente" ? "Conferência desfeita" : "Identificação confirmada" });
      setReportStale(true);
      setDemoConf(null);
    },
    onError: (e: any) => toast({ title: "Não consegui salvar a conferência", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });
  const salvarDemoVeredicto = (veredicto: "confirmado" | "errado" | "pendente") => {
    if (!demoConf) return;
    confirmarDemoMut.mutate({
      companyId,
      contaBancariaId: parseInt(contaBancariaId) || 0,
      extratoLinhaId: Number(demoConf.id),
      veredicto,
      demonstrativoId: demoConf.demoDemonstrativoId != null ? Number(demoConf.demoDemonstrativoId) : undefined,
      tipo: demoConf.demoTipo ?? undefined,
      beneficiario: demoConf.demoBeneficiario ?? undefined,
      documento: demoConf.demoDocumento ?? undefined,
      txid: demoConf.demoTxid ?? undefined,
      valor: demoConf.demoValor != null ? Number(demoConf.demoValor) : undefined,
      dataPagamento: demoConf.demoData ?? undefined,
    });
  };

  const repConc: any[] = (report?.conciliados ?? []).filter((r: any) => !dismissedConcIds.has(Number(r.id)));
  // Rev. 3235 — as linhas que formam um par de ESTORNO (débito do cheque + crédito de
  // devolução do MESMO cheque) NÃO entram na lista normal "no extrato, sem lançamento":
  // o par tem saldo zero (tentativa de pagamento frustrada) e é tratado num bloco próprio
  // ("Cheques devolvidos"). A linha de quitação real (reapresentação/PIX) também sai da
  // lista crua porque é exibida amarrada ao par.
  const repExtRaw: any[] = (report?.extratoSemLancamento ?? []).filter((r: any) => !dismissedStmtIds.has(Number(r.id)));
  const repExt: any[] = repExtRaw.filter((r) => !r.reversal && !r.reversalResolveGrupo);
  const repDevol: any[] = report?.chequesDevolvidos ?? [];
  const repLan: any[] = report?.lancamentosSemExtrato ?? [];
  // Rev. 3747 — cobertura/sugestões de vínculo p/ TODOS os cheques devolvidos (em lote).
  // Casa por VALOR EXATO em TODAS as contas; só sugere (nada vincula sem confirmação).
  const vincItens = repDevol
    .map((d: any) => ({
      debitoLineId: Number(d.debitoId),
      creditoLineId: d.creditoId != null ? Number(d.creditoId) : undefined,
      valor: Math.abs(Number(d.valor) || (Number(d.valorCents) || 0) / 100),
      dataRef: String(d.dataDebito ?? d.dataCredito ?? "").slice(0, 10) || undefined,
      // Rev. 3750 — identidade estável do cheque (doc/nº) p/ cobertura resiliente à rotação de id de linha.
      doc: d.doc != null ? String(d.doc) : undefined,
      chequeNumero: d.chequeNumero != null ? String(d.chequeNumero) : undefined,
    }))
    .filter((x: any) => Number.isFinite(x.debitoLineId) && x.debitoLineId > 0);
  const { data: vincLoteData } = (trpc as any).financial.getChequeDevolvidoVinculacao.useQuery(
    { companyId: Number(companyId), itens: vincItens },
    // Rev. 3769 — placeholderData: mantém o mapa anterior enquanto o report refaz (após
    // registrar/estornar, refreshAposVinculo refaz o report → repDevol/vincItens mudam de
    // conteúdo → o lote refetcha). Sem isso, vincMap zera transitoriamente e a LINHA do
    // cheque some o selo "Parcial/Vinculado" + o cabeçalho do diálogo lê "Vinculado R$ 0,00".
    { enabled: !!companyId && vincItens.length > 0, placeholderData: (prev: any) => prev }
  );
  const vincMap: Record<string, any> = vincLoteData?.mapa ?? {};
  // Rev. 3769 — COBERTURA DEDICADA do cheque aberto no diálogo "Vincular cheque devolvido".
  // O lote (vincMap) é chaveado por TODOS os cheques do período e zera quando o report refaz
  // (e fica vazio no 1º load até resolver). Isso fazia o cabeçalho mostrar "Vinculado R$ 0,00"
  // mesmo havendo vínculo ativo, enquanto o REGISTRAR (cobertura fresca por linha) achava o
  // vínculo e barrava com "Esta linha já vinculada a este cheque" — a contradição reportada.
  // Esta query é chaveada SÓ pelo cheque aberto (chave estável), usa o MESMO casamento por
  // identidade (doc/nº + valor) e por isso é AUTORITATIVA p/ o cabeçalho. READ-ONLY.
  const vincDlgItens = vincularPixDlg?.cheque ? [{
    debitoLineId: Number(vincularPixDlg.cheque.debitoId),
    creditoLineId: vincularPixDlg.cheque.creditoId != null ? Number(vincularPixDlg.cheque.creditoId) : undefined,
    valor: Math.abs(Number(vincularPixDlg.cheque.valor) || (Number(vincularPixDlg.cheque.valorCents) || 0) / 100),
    dataRef: String(vincularPixDlg.cheque.dataDebito ?? vincularPixDlg.cheque.dataCredito ?? "").slice(0, 10) || undefined,
    doc: vincularPixDlg.cheque.doc != null ? String(vincularPixDlg.cheque.doc) : undefined,
    chequeNumero: vincularPixDlg.cheque.chequeNumero != null ? String(vincularPixDlg.cheque.chequeNumero) : undefined,
  }].filter((x: any) => Number.isFinite(x.debitoLineId) && x.debitoLineId > 0) : [];
  // NB: SEM placeholderData aqui de propósito. Ao TROCAR de cheque no diálogo a chave muda;
  // com placeholderData o cabeçalho herdaria os números do cheque ANTERIOR até a nova resposta
  // chegar (stale cross-cheque). Sem ele, `vincDlgData` zera na troca → `vincDlgInfo` vira null
  // → o cabeçalho cai p/ `vincMap[debId]` (já do cheque CERTO, mantido vivo pelo placeholderData
  // do lote) até a dedicada resolver. Refetch da MESMA chave (invalidação pós-vínculo) preserva
  // `data` por padrão no RQ v5, então não pisca 0 no fluxo normal.
  const { data: vincDlgData } = (trpc as any).financial.getChequeDevolvidoVinculacao.useQuery(
    { companyId: Number(companyId), itens: vincDlgItens },
    { enabled: !!companyId && !!vincularPixDlg && vincDlgItens.length > 0 }
  );
  const vincDlgInfo: any = vincDlgData?.mapa ? (Object.values(vincDlgData.mapa)[0] ?? null) : null;
  // Rev. 3762 — "resolvido" = cheque já tratado: quitação real (reapresentado / PIX-TED),
  // quitação por substituição (vínculos cobrem o valor) ou desconsiderado do %. Espelha
  // exatamente os selos exibidos na linha. Read-only — não muda contador nem cálculo.
  const isDevolvidoResolvido = (d: any) => {
    const tipoRes = d?.resolucao?.tipo ?? "pendente";
    if (tipoRes === "reapresentado" || tipoRes === "pix" || tipoRes === "conciliado") return true;
    if (d?.jaConciliado) return true;
    if (d?.desconsiderado) return true;
    const vinfo = vincMap[String(d?.debitoId)] ?? null;
    const totalCents = Math.round(Math.abs(Number(d?.valor) || (Number(d?.valorCents) || 0) / 100) * 100);
    const acumCents = vinfo ? Math.round(Number(vinfo.acumulado || 0) * 100) : 0;
    const saldoCents = Math.max(0, totalCents - acumCents);
    return !!vinfo?.quitado || (!!vinfo && saldoCents <= 1 && acumCents > 0);
  };
  const repDevolResolvidosN = repDevol.filter(isDevolvidoResolvido).length;
  const repDevolView: any[] = ocultarDevolResolvidos ? repDevol.filter((d) => !isDevolvidoResolvido(d)) : repDevol;
  // Invalida todas as superfícies de % + a cobertura de vínculo após registrar/estornar.
  const refreshAposVinculo = () => {
    (utils as any).financial?.getChequeDevolvidoVinculacao?.invalidate?.();
    refetchSt(); refetchStAno(); refetchAccStatus(); setReportStale(true); refetchReport();
    (utils as any).financial?.getConciliacaoResumoMensal?.invalidate?.();
  };
  // Rev. 3219 — filtro de busca (texto livre) aplicado às DUAS listas de pendência.
  // Casa por descrição, fornecedor, obra, doc, data e valor (BRL formatado + número cru),
  // normalizando acentos e caixa. String vazia = sem filtro (mantém tudo).
  const normBusca = (v: any) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const termoBusca = normBusca(buscaConc).trim();
  const matchBusca = (r: any) => {
    if (!termoBusca) return true;
    const alvo = normBusca([
      r.descricao, r.fornecedorNome, r.obraNome, r.documento, r.doc, r.formaPagamento,
      r.chequeNumero, r.chequeFornecedor, r.chequeObraNome, r.chequeNf,
      r.faturaCartao, r.faturaMesRef != null ? `${String(r.faturaMesRef).padStart(2, "0")}/${r.faturaAnoRef ?? ""}` : "",
      r.demoBeneficiario, r.demoDocumento, r.demoTipo,
      fmtData(r.data),
      formatBRL(Math.abs(Number(r.valor) || 0)),
      String(Math.abs(Number(r.valor) || 0)),
    ].filter(Boolean).join(" "));
    return alvo.includes(termoBusca);
  };
  const repExtView: any[] = (() => {
    let arr = termoBusca ? repExt.filter(matchBusca) : repExt;
    if (filterExtTipo === "entrada") arr = arr.filter((r: any) => Number(r.valor) >= 0);
    if (filterExtTipo === "saida")   arr = arr.filter((r: any) => Number(r.valor) < 0);
    return arr;
  })();
  const repLanView: any[] = (() => {
    let arr = termoBusca ? repLan.filter(matchBusca) : repLan;
    if (filterLanTipo === "entrada") arr = arr.filter((r: any) => r.tipo === "receita");
    if (filterLanTipo === "saida")   arr = arr.filter((r: any) => r.tipo === "despesa");
    return arr;
  })();
  const termoJaConc = normBusca(buscaJaConc).trim();
  const repConcView: any[] = (() => {
    let arr = termoJaConc ? repConc.filter((r: any) => {
      const alvo = normBusca([
        r.descricao, r.entryFornecedor, r.entryDescricao,
        fmtData(r.data), formatBRL(Math.abs(Number(r.valor) || 0)),
        String(Math.abs(Number(r.valor) || 0)),
      ].filter(Boolean).join(" "));
      return alvo.includes(termoJaConc);
    }) : repConc;
    if (filterConcTipo === "entrada") arr = arr.filter((r: any) => Number(r.valor) >= 0);
    if (filterConcTipo === "saida")   arr = arr.filter((r: any) => Number(r.valor) < 0);
    return arr;
  })();
  // Rev. 3188 — lançamentos SEM conta bancária definida vêm num bloco próprio e NÃO entram
  // no número da conta (antes apareciam/contavam em todas as contas, inflando "ERP sem extrato").
  const repSemConta: any[] = report?.lancamentosSemConta ?? [];
  const absSum = (arr: any[]) => arr.reduce((a, r) => a + Math.abs(Number(r.valor) || 0), 0);
  const vConc = absSum(repConc), vExt = absSum(repExt), vLan = absSum(repLan), vSemConta = absSum(repSemConta);
  const totLinhas = repConc.length + repExt.length;
  const pctConc = totLinhas > 0 ? Math.round((repConc.length / totLinhas) * 100) : 0;

  // Rev. 3187 — Anexar comprovante (PIX/boleto/recibo) a um lançamento "sem extrato",
  // direto da tela. Faz upload (uploadComprovante valida tipo/tamanho) e grava a URL no
  // lançamento (anexarComprovanteEntry) — rastreabilidade do PIX/boleto (extrato anônimo).
  const comprovInputRef = useRef<HTMLInputElement>(null);
  const [comprovEntryId, setComprovEntryId] = useState<number | null>(null);
  const [comprovBusy, setComprovBusy] = useState<number | null>(null);
  const uploadComprovanteMut = (trpc as any).financial.uploadComprovante.useMutation();
  const anexarComprovMut = (trpc as any).financial.anexarComprovanteEntry.useMutation();
  // Rev. 3193 — leitura do comprovante por IA (beneficiário / CNPJ-CPF / ID-transação) p/
  // usar como FONTE DE IDENTIFICAÇÃO no match. O usuário SEMPRE confere: nada concilia sozinho.
  const lerComprovanteMut = (trpc as any).financial.lerComprovante.useMutation();
  function pedirComprovante(entryId: number) { setComprovEntryId(entryId); setTimeout(() => comprovInputRef.current?.click(), 0); }
  async function onComprovanteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const entryId = comprovEntryId;
    setComprovEntryId(null);
    if (!file || !entryId) return;
    setComprovBusy(entryId);
    try {
      const b64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(((r.result as string) || "").replace(/^data:[^,]*,/, ""));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const ct = file.type || "application/octet-stream";
      const up: any = await uploadComprovanteMut.mutateAsync({ fileName: file.name, fileBase64: b64, contentType: ct });
      // Leitura automática por IA ao subir (best-effort: se falhar, anexa sem identificação).
      let extraido: any = undefined;
      let viaMsg = "";
      try {
        const r: any = await lerComprovanteMut.mutateAsync({ companyId, fileBase64: b64, contentType: ct });
        const d = r?.dados;
        if (d && (d.beneficiario || d.documento || d.txid || d.valor || d.data)) {
          extraido = { beneficiario: d.beneficiario ?? null, documento: d.documento ?? null, txid: d.txid ?? null, valor: d.valor ?? null, data: d.data ?? null };
          if (d.beneficiario) viaMsg = ` Beneficiário lido: ${d.beneficiario}.`;
        }
      } catch { /* segue sem identificação por IA */ }
      await anexarComprovMut.mutateAsync({ companyId, entryId, comprovanteUrl: up.url, extraido });
      toast({ title: "Comprovante anexado!", description: `Lançamento agora tem comprovante para rastreabilidade.${viaMsg}` });
      setReportStale(true);
    } catch (err: any) {
      toast({ title: "Erro ao anexar comprovante", description: err?.message || "Falha no upload.", variant: "destructive" });
    } finally {
      setComprovBusy(null);
    }
  }

  // Rev. 3193 — RELER COMPROVANTES: relê por IA todos os comprovantes JÁ anexados que ainda
  // não foram lidos (comprovante_extraido_em NULL). Processa em lotes no servidor (free-tier
  // do Gemini) e repete até `restantes`=0; guard de estagnação evita loop infinito num doc
  // ilegível. NÃO concilia nada — só preenche a identificação p/ melhorar as sugestões.
  const relerComprovMut = (trpc as any).financial.relerComprovantesPendentes.useMutation();
  const [relerBusy, setRelerBusy] = useState(false);
  const [relerInfo, setRelerInfo] = useState<{ feitos: number; restantes: number } | null>(null);
  async function relerComprovantes() {
    if (relerBusy) return;
    setRelerBusy(true);
    setRelerInfo(null);
    let feitos = 0;
    try {
      for (let iter = 0; iter < 200; iter++) {
        const r: any = await relerComprovMut.mutateAsync({ companyId, limite: 6 });
        feitos += Number(r?.processados ?? 0);
        const restantes = Number(r?.restantes ?? 0);
        setRelerInfo({ feitos, restantes });
        if (restantes <= 0) break;
        // Guard de estagnação: se um lote não avançou (0 processados) e ainda "restam",
        // os pendentes são ilegíveis e já foram marcados — encerra p/ não rodar à toa.
        if (Number(r?.processados ?? 0) === 0) break;
      }
      toast({ title: "Comprovantes relidos por IA", description: `${formatInt(feitos)} comprovante(s) identificado(s). As sugestões já consideram beneficiário/CNPJ/ID.` });
      setReportStale(true);
    } catch (err: any) {
      toast({ title: "Erro ao reler comprovantes", description: err?.message || "Falha na leitura por IA.", variant: "destructive" });
    } finally {
      setRelerBusy(false);
    }
  }

  // Rev. 3216 — Demonstrativos consolidados de pagamento: 1 PDF com TODOS os PIX +
  // 1 PDF com TODOS os boletos pagos do mês. Servem de CONSULTA pra identificar quem
  // recebeu (o extrato só mostra "PIX valor X"). Por conta+ano+mês. NÃO concilia nada.
  const demoInputRef = useRef<HTMLInputElement>(null);
  const [demoKind, setDemoKind] = useState<"pix" | "boleto" | null>(null);
  // Rev. 3236 — progresso REAL (0→100%) do fluxo "anexar vários + ler com IA". Quando
  // ativo, o slot do tipo mostra a barra + rótulo detalhado ("Enviando 2 de 5", "Lendo
  // com IA 3 de 7"). Substitui a antiga barra ASSINTÓTICA/falsa (single-shot da tRPC).
  const [demoProg, setDemoProg] = useState<{ kind: "pix" | "boleto"; pct: number; label: string } | null>(null);
  const demoQuery = (trpc as any).financial.getConciliacaoDemonstrativos.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, ano, mes: mesSel ?? 0 },
    { enabled: !!companyId && !!contaBancariaId && modoData === "mes" && mesSel != null }
  );
  const salvarDemoMut = (trpc as any).financial.salvarConciliacaoDemonstrativo.useMutation();
  const removerDemoMut = (trpc as any).financial.removerConciliacaoDemonstrativo.useMutation();
  // Rev. 3236 — leitura por IA agora é POR ARQUIVO (loop no cliente = progresso real),
  // depois salva a lista combinada. lerDemonstrativoArquivoIA não grava; salvarDemonstrativoExtraido persiste.
  const lerDemoArquivoMut = (trpc as any).financial.lerDemonstrativoArquivoIA.useMutation();
  const salvarDemoExtraidoMut = (trpc as any).financial.salvarDemonstrativoExtraido.useMutation();
  // Rev. 3228 — a leitura da IA aparece INLINE (lista combinada PIX+boletos). `demoFiltro`
  // controla qual tipo a tabela mostra; `buscaLeitura` é a busca livre da lista inline.
  const [demoFiltro, setDemoFiltro] = useState<"todos" | "pix" | "boleto">("todos");
  const [buscaLeitura, setBuscaLeitura] = useState("");
  const [leituraMinimizada, setLeituraMinimizada] = useState(false);
  // Rev. 3240 — visão "tela cheia" da leitura da IA (PIX/boletos). `leituraFull` abre o
  // diálogo full-screen; `abrirLeituraFull(kind)` pré-filtra e abre (as "duas telas").
  const [leituraFull, setLeituraFull] = useState(false);
  const abrirLeituraFull = (k: "todos" | "pix" | "boleto") => { setDemoFiltro(k); setLeituraFull(true); };
  // Expandir o painel de "Sugestões Automáticas de Conciliação" em tela cheia (analisar melhor).
  const [sugFull, setSugFull] = useState(false);
  // Rev. 3241 — quando expandido: fechar com Esc + travar o scroll de fundo (modal-like).
  useEffect(() => {
    if (!sugFull) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSugFull(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [sugFull]);
  // Rev. 3240 — computação ÚNICA da leitura combinada (PIX + boletos): alimenta a lista
  // inline E o diálogo de tela cheia, evitando deriva entre as duas. Reage a filtro+busca.
  const leituraIA = useMemo(() => {
    const pixArr: any[] = Array.isArray(demoQuery.data?.pixExtraido) ? demoQuery.data.pixExtraido : [];
    const boletoArr: any[] = Array.isArray(demoQuery.data?.boletoExtraido) ? demoQuery.data.boletoExtraido : [];
    const temDados = Array.isArray(demoQuery.data?.pixExtraido) || Array.isArray(demoQuery.data?.boletoExtraido);
    const todos = [
      ...pixArr.map((it) => ({ ...it, _tipo: "pix" as const })),
      ...boletoArr.map((it) => ({ ...it, _tipo: "boleto" as const })),
    ];
    const porFiltro = demoFiltro === "todos" ? todos : todos.filter((it) => it._tipo === demoFiltro);
    const termo = normBusca(buscaLeitura).trim();
    const lista = !termo ? porFiltro : porFiltro.filter((it) => normBusca([it?.beneficiario, it?.documento, it?.txid, fmtData(it?.data), formatBRL(Number(it?.valor) || 0), String(it?.valor ?? ""), it._tipo === "pix" ? "pix" : "boleto"].join(" ")).includes(termo));
    const pixVis = lista.filter((it) => it._tipo === "pix");
    const bolVis = lista.filter((it) => it._tipo === "boleto");
    const somaPix = pixVis.reduce((s, it) => s + (Number(it?.valor) || 0), 0);
    const somaBol = bolVis.reduce((s, it) => s + (Number(it?.valor) || 0), 0);
    const total = somaPix + somaBol;
    const chips = [
      { key: "todos" as const, label: `Todos (${formatInt(todos.length)})` },
      { key: "pix" as const, label: `PIX (${formatInt(pixArr.length)})` },
      { key: "boleto" as const, label: `Boletos (${formatInt(boletoArr.length)})` },
    ];
    return { pixArr, boletoArr, temDados, todos, porFiltro, lista, pixVis, bolVis, somaPix, somaBol, total, termo, chips };
  }, [demoQuery.data, demoFiltro, buscaLeitura]);
  const _fileToB64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(((r.result as string) || "").replace(/^data:[^,]*,/, ""));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const _sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  // Lê TODOS os PDFs do tipo com IA, um a um (progresso real), e salva a lista combinada.
  // `count` permite informar o total já sabido (evita corrida com o refetch logo após o upload).
  async function lerDemoIA(kind: "pix" | "boleto", opts?: { baseStart?: number; count?: number }) {
    if (mesSel == null || !contaBancariaId) return;
    const arrAtual = kind === "pix" ? (demoQuery.data?.pixArquivos || []) : (demoQuery.data?.boletoArquivos || []);
    const n = opts?.count ?? arrAtual.length;
    if (n === 0) { toast({ title: "Anexe ao menos um PDF", description: "Não há demonstrativo para ler.", variant: "destructive" }); return; }
    const base = opts?.baseStart ?? 2;
    const span = Math.max(1, 100 - base);
    const itens: any[] = [];
    let falhas = 0;
    setDemoProg({ kind, pct: base, label: `Lendo com IA — 0 de ${formatInt(n)}…` });
    for (let i = 0; i < n; i++) {
      setDemoProg({ kind, pct: base + Math.round((i / n) * span * 0.9), label: `Lendo com IA — arquivo ${formatInt(i + 1)} de ${formatInt(n)}…` });
      try {
        const r: any = await lerDemoArquivoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, indice: i });
        if (Array.isArray(r?.itens)) itens.push(...r.itens);
      } catch { falhas++; }
      if (i < n - 1) await _sleep(300); // pacing p/ o free-tier do Gemini (429/503 transiente)
    }
    setDemoProg({ kind, pct: base + Math.round(span * 0.95), label: "Salvando leitura…" });
    try {
      await salvarDemoExtraidoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, itens });
    } catch (err: any) {
      setDemoProg(null);
      toast({ title: "Erro ao salvar leitura", description: err?.message || "Falha ao gravar a extração.", variant: "destructive" });
      return;
    }
    setDemoProg({ kind, pct: 100, label: `Concluído · ${formatInt(itens.length)} pagamento(s)` });
    await demoQuery.refetch();
    setBuscaLeitura("");
    setDemoFiltro(kind);
    setTimeout(() => setDemoProg(null), 700);
    if (falhas > 0) toast({ title: `${formatInt(falhas)} arquivo(s) não puderam ser lidos`, description: "Use 'Reler com IA' para tentar novamente.", variant: "destructive" });
  }
  function pedirDemo(kind: "pix" | "boleto") { setDemoKind(kind); setTimeout(() => demoInputRef.current?.click(), 0); }
  // Rev. 3236 — aceita VÁRIOS PDFs de uma vez: faz upload de cada (progresso 1→44%),
  // grava a lista (append) e em seguida lê TODOS com IA (46→100%).
  async function onDemoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const kind = demoKind;
    setDemoKind(null);
    if (!files.length || !kind || mesSel == null || !contaBancariaId) return;
    const pdfs = files.filter(f => (f.type || "").toLowerCase() === "application/pdf");
    const pulados = files.length - pdfs.length;
    if (pdfs.length === 0) { toast({ title: "Use arquivos PDF", description: "Os demonstrativos devem ser PDFs.", variant: "destructive" }); return; }
    const existentes = (kind === "pix" ? demoQuery.data?.pixArquivos?.length : demoQuery.data?.boletoArquivos?.length) || 0;
    const total = pdfs.length;
    setDemoProg({ kind, pct: 1, label: `Enviando — 0 de ${formatInt(total)}…` });
    try {
      const novos: { url: string; nome: string }[] = [];
      for (let i = 0; i < total; i++) {
        setDemoProg({ kind, pct: 1 + Math.round((i / total) * 40), label: `Enviando — arquivo ${formatInt(i + 1)} de ${formatInt(total)}…` });
        const b64 = await _fileToB64(pdfs[i]);
        const up: any = await uploadComprovanteMut.mutateAsync({ fileName: pdfs[i].name, fileBase64: b64, contentType: "application/pdf" });
        novos.push({ url: up.url, nome: pdfs[i].name });
      }
      setDemoProg({ kind, pct: 44, label: "Salvando anexos…" });
      await salvarDemoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, arquivos: novos });
      if (pulados > 0) toast({ title: `${formatInt(pulados)} arquivo(s) ignorado(s)`, description: "Apenas PDFs são aceitos." });
      // Lê TODOS (existentes + novos) com IA, com progresso real 46→100%.
      await lerDemoIA(kind, { baseStart: 46, count: existentes + novos.length });
    } catch (err: any) {
      setDemoProg(null);
      toast({ title: "Erro ao anexar demonstrativo", description: err?.message || "Falha no upload.", variant: "destructive" });
    }
  }
  async function removerDemo(kind: "pix" | "boleto", indice?: number) {
    if (mesSel == null || !contaBancariaId) return;
    setDemoProg({ kind, pct: 50, label: "Removendo…" });
    try {
      await removerDemoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, indice });
      toast({ title: indice != null ? "Arquivo removido" : "Demonstrativo removido", description: "Use 'Ler com IA' para atualizar a lista." });
      await demoQuery.refetch();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message || "Falha ao remover.", variant: "destructive" });
    } finally {
      setDemoProg(null);
    }
  }

  // Rev. 3188 — renderiza uma linha de lançamento (usada na lista "No ERP, sem extrato" da
  // conta E na lista "Sem conta definida"). Mesma interação: selecionar p/ casar, ver detalhe
  // e anexar/abrir comprovante.
  const renderEntryRow = (e: any) => {
    const forma = String(e.formaPagamento || "").toLowerCase();
    const isPix = forma.includes("pix");
    const isBoleto = forma.includes("boleto");
    const isReceita = e.tipo === "receita";
    // Rev. 3239 — linha SINTÉTICA de grupo (VR/combustível/manutenção unificados).
    if (e.agrupado) {
      const expandido = gruposExpandidos.has(String(e.id));
      const grpLabel = e.grupoTipo === "vr" ? "Vale Refeição" : e.grupoTipo === "va" ? "Vale Alimentação" : e.grupoTipo === "combustivel" ? "Combustível" : e.grupoTipo === "parceiro" ? "Parceiro" : e.grupoTipo === "pj" ? "Pagamento PJ" : e.grupoTipo === "fechamento_forn" ? "Fechamento" : "Manutenção";
      const grpColor = e.grupoTipo === "vr" ? "bg-amber-100 text-amber-700" : e.grupoTipo === "va" ? "bg-lime-100 text-lime-700" : e.grupoTipo === "combustivel" ? "bg-sky-100 text-sky-700" : e.grupoTipo === "parceiro" ? "bg-fuchsia-100 text-fuchsia-700" : e.grupoTipo === "pj" ? "bg-indigo-100 text-indigo-700" : e.grupoTipo === "fechamento_forn" ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700";
      const itens: any[] = Array.isArray(e.itens) ? e.itens : [];
      return (
        <div key={e.id} className={`border-b last:border-b-0 ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
          <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
            <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-rose-50 text-rose-500">
              <ArrowUpCircle className="w-5 h-5" />
            </span>
            <button onClick={() => { const sel = selectedEntry === e.id ? null : e.id; setSelectedEntry(sel); setManualLanSel(sel === null ? null : e); }} onDoubleClick={(ev) => { ev.preventDefault(); setDetalheEntryId(e.id); }} title="Duplo clique para ver detalhes completos" className="flex-1 min-w-0 text-left">
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                {fmtData(e.data)}
                <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${grpColor}`}>{grpLabel}</span>
                <span className="px-1.5 py-px rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">{formatInt(e.qtd)} itens</span>
              </p>
              <p className="text-sm font-medium text-gray-700 truncate">{e.descricao || "—"}</p>
              <p className="text-[11px] text-gray-400 truncate">Total unificado · clique para casar com o extrato</p>
            </button>
            <p className="text-sm font-bold shrink-0 text-rose-500">{formatBRL(Math.abs(Number(e.valor)))}</p>
            <button type="button" onClick={() => setGruposExpandidos((prev) => { const n = new Set(prev); if (n.has(String(e.id))) n.delete(String(e.id)); else n.add(String(e.id)); return n; })} title={expandido ? "Recolher itens" : "Ver os itens do grupo"} className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50">
              {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          {expandido && (
            <div className="bg-gray-50 px-4 py-2 max-h-72 overflow-auto border-t">
              {itens.map((it: any) => (
                <div key={it.id} className="flex items-center gap-2 py-1 text-xs text-gray-600">
                  <span className="text-gray-400 shrink-0 w-16">{fmtData(it.data)}</span>
                  <span className="flex-1 min-w-0 truncate">{it.fornecedorNome || it.descricao || "—"}</span>
                  <span className="font-medium text-rose-500 shrink-0">{formatBRL(Math.abs(Number(it.valor)))}</span>
                </div>
              ))}
            </div>
          )}
          {e.grupoTipo === "fechamento_forn" && Array.isArray(e.parcelas) && e.parcelas.length > 0 && (
            <div className="bg-orange-50/60 px-4 py-2 border-t border-orange-100">
              <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide mb-1.5">
                Parcelas de Pagamento
                {e.cicloFormaPagamento && <span className="ml-1.5 normal-case font-normal text-orange-500">· {e.cicloFormaPagamento === "cheque" ? "Cheque" : e.cicloFormaPagamento === "pix" ? "PIX" : e.cicloFormaPagamento === "boleto" ? "Boleto" : "Transferência"}</span>}
              </p>
              {e.parcelas.map((p: any) => (
                <div key={p.num} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="shrink-0 w-10 font-medium text-orange-600">{p.num}/{p.total}</span>
                  <span className="flex-1 text-gray-500">venc. {fmtData(p.vencimento)}</span>
                  <span className="font-medium text-rose-500">{formatBRL(Math.abs(Number(p.valor)))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        key={e.id}
        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
      >
        <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isReceita ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
          {isReceita ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
        </span>
        <button onClick={() => { const sel = selectedEntry === e.id ? null : e.id; setSelectedEntry(sel); setManualLanSel(sel === null ? null : e); }} onDoubleClick={(ev) => { ev.preventDefault(); setDetalheEntryId(e.id); }} title="Duplo clique para ver detalhes completos" className="flex-1 min-w-0 text-left">
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5 flex-wrap">
            {fmtData(e.data)}
            {(isPix || isBoleto) && <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${isPix ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>{isPix ? "PIX" : "Boleto"}</span>}
            {e.contaNome && <span className="px-1.5 py-px rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100" title={`Conta no ERP: ${e.contaNome}`}>🏦 {e.contaNome}</span>}
            {e.ocNumero && (
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); window.location.href = `/compras/ordens?destaque=${e.origemId}`; }}
                className="px-1.5 py-px rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                title={`Abrir Ordem de Compra ${e.ocNumero}`}
              >
                🛒 {e.ocNumero}
              </button>
            )}
          </p>
          <p className="text-sm font-medium text-gray-700 break-words">{e.fornecedorNome || e.descricao || "—"}</p>
          {e.obraNome && <p className="text-xs text-gray-400 break-words">{e.obraNome}</p>}
        </button>
        <p className={`text-sm font-bold shrink-0 ${isReceita ? "text-emerald-600" : "text-rose-500"}`}>{formatBRL(Math.abs(Number(e.valor)))}</p>
        <button type="button" onClick={() => setDetalheEntryId(e.id)} title="Ver detalhes" className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Eye className="w-4 h-4" /></button>
        <button type="button" onClick={() => { setDetalheEntryId(e.id); setPendingEditMode(true); }} title="Editar lançamento (nome, categoria, fornecedor…)" className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50"><Pencil className="w-4 h-4" /></button>
        {e.comprovanteUrl ? (
          <a href={e.comprovanteUrl} target="_blank" rel="noreferrer" title="Comprovante anexado — abrir" className="shrink-0 p-1.5 rounded-md text-green-600 hover:bg-green-50"><Paperclip className="w-4 h-4" /></a>
        ) : (
          <button type="button" onClick={() => pedirComprovante(e.id)} disabled={comprovBusy === e.id} title="Anexar comprovante (PIX/boleto/recibo)" className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50">
            {comprovBusy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
        )}
        {isAdminMaster && e.status !== "pago" && e.status !== "recebido" && (
          <button
            type="button"
            title="Excluir lançamento (Admin Master)"
            className="shrink-0 p-1.5 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50"
            onClick={() => { setDeleteEntryMotivo(""); setDeleteEntryTarget({ id: Number(e.id), nome: e.fornecedorNome || e.descricao || `#${e.id}`, valor: Math.abs(Number(e.valor)), status: e.status ?? "" }); }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  // Rev. 3205 — renderiza uma linha do extrato (lista "No extrato, sem lançamento").
  // Extraída p/ reuso entre a lista inline e o modo tela cheia.
  const renderExtratoRow = (s: any) => {
    const isEntrada = Number(s.valor) >= 0;
    return (
    <div
      key={s.id}
      className={`flex items-stretch ${selectedStatement === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
    >
      <button
        onClick={() => { const sel = selectedStatement === s.id ? null : s.id; setSelectedStatement(sel); setManualExtSel(sel === null ? null : s); }}
        onDoubleClick={(e) => { e.preventDefault(); setStmtDetailRow(s); }}
        title="Duplo clique para ver detalhes completos"
        className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isEntrada ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
          {isEntrada ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5 flex-wrap">
            {fmtData(s.data)}
            {s.interno
              ? <span className="px-1.5 py-px rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700">Mov. interna</span>
              : <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${isEntrada ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>{isEntrada ? "Entrada" : "Saída"}</span>
            }
          </p>
          <p className="text-sm font-medium text-gray-700 truncate">{s.descricao || "—"}</p>
          {s.chequeFornecedor && (
            <p className="text-[11px] text-emerald-700 truncate" title={`Cheque nº ${s.chequeNumero ?? "—"} — ${s.chequeFornecedor}${s.chequeObraNome ? ` · ${s.chequeObraNome}` : ""}${s.chequeNf ? ` · NF ${s.chequeNf}` : ""}`}>
              🪙 Cheque nº {s.chequeNumero ?? "—"} · {s.chequeFornecedor}{s.chequeObraNome ? ` · ${s.chequeObraNome}` : ""}
            </p>
          )}
          {s.faturaId && !s.chequeFornecedor && (
            <p className="text-[11px] text-indigo-700 truncate" title={`Fatura do cartão ${s.faturaCartao ?? "—"}${s.faturaVencimento ? ` · venc. ${fmtData(s.faturaVencimento)}` : ""}${s.faturaTotal != null ? ` · total ${formatBRL(Math.abs(Number(s.faturaTotal)))}` : ""}`}>
              💳 Fatura {s.faturaCartao ?? "cartão"}{s.faturaMesRef ? ` · ${String(s.faturaMesRef).padStart(2, "0")}/${s.faturaAnoRef ?? ""}` : ""}{s.faturaVencimento ? ` · venc. ${fmtData(s.faturaVencimento)}` : ""}
            </p>
          )}
          {!s.chequeFornecedor && !s.faturaId && (s.demoBeneficiario || s.demoTipo) && (
            // Rev. 3266 — clicável: abre a CONFERÊNCIA da identificação por IA (dados lidos ×
            // extrato + PDF). role="button" (não <button>) p/ não aninhar dentro do botão da linha.
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDemoConf(s); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setDemoConf(s); } }}
              title={`Clique p/ CONFERIR a identificação por IA: ${s.demoTipo === "boleto" ? "Boleto" : s.demoTipo === "ted" ? "TED" : "PIX"}${s.demoBeneficiario ? ` — ${s.demoBeneficiario}` : ""}${s.demoDocumento ? ` · ${s.demoDocumento}` : ""}${s.demoMatch === "valor" ? " · correspondência provável (só valor)" : ""}${s.demoVeredicto === "confirmado" ? " · CONFERIDO" : s.demoVeredicto === "errado" ? " · MARCADO COMO ERRADO" : ""}`}
              className={`block text-[11px] truncate cursor-pointer hover:underline ${s.demoVeredicto === "errado" ? "text-rose-600 line-through" : s.demoVeredicto === "confirmado" ? "text-emerald-700" : "text-violet-700"}`}
            >
              {s.demoTipo === "boleto" ? "🧾" : "💸"} {s.demoTipo === "boleto" ? "Boleto" : s.demoTipo === "ted" ? "TED" : "PIX"}{s.demoBeneficiario ? ` · ${s.demoBeneficiario}` : ""}{s.demoMatch === "valor" ? " · provável" : ""}{s.demoVeredicto === "confirmado" ? " ✓ conferido" : s.demoVeredicto === "errado" ? " ✗ errado" : ""} <span className="opacity-60">(demonstrativo)</span>
            </span>
          )}
          {s.vinculoTipo && (
            <p className={`text-[11px] truncate ${s.vinculoVia === "cnpj" ? "text-emerald-700" : s.vinculoConfianca === "media" ? "text-amber-700" : "text-gray-500"}`} title={`${s.vinculoTipo === "cliente" ? "Cliente" : "Fornecedor"} cadastrado: ${s.vinculoNome}${s.vinculoVia === "cnpj" ? " · CNPJ confere com o cadastro" : s.vinculoConfianca === "media" ? " · sugestão por nome (boa) — confira antes de lançar" : " · palpite por nome (baixa confiança) — escolha o correto ao lançar"}`}>
              {s.vinculoTipo === "cliente" ? "👤" : "🏢"} {s.vinculoTipo === "cliente" ? "Cliente" : "Fornecedor"}: {s.vinculoNome}{s.vinculoVia === "nome" ? (s.vinculoConfianca === "media" ? " · sugestão" : " · palpite") : ""} <span className="opacity-60">(cadastro)</span>
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${isEntrada ? "text-emerald-600" : "text-rose-500"}`}>{formatBRL(Math.abs(Number(s.valor)))}</p>
          {s.saldoApos != null && (
            <p className={`text-[10px] mt-0.5 ${Number(s.saldoApos) < 0 ? "text-red-500" : "text-emerald-600"}`} title="Saldo bancário após este lançamento">saldo {formatBRL(Number(s.saldoApos))}</p>
          )}
        </div>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirLancar(s); }}
        title="Lançar este item no ERP"
        className="shrink-0 px-3 flex flex-col items-center justify-center gap-0.5 border-l border-gray-100 text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="text-[10px] font-medium leading-none">Lançar</span>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmExcluirLinha({ id: s.id, descricao: s.descricao || "—", valor: Number(s.valor), conciliado: false }); }}
        title="Remover esta linha do extrato (importada incorretamente)"
        className="shrink-0 px-2.5 flex flex-col items-center justify-center gap-0.5 border-l border-gray-100 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        <span className="text-[10px] font-medium leading-none">Apagar</span>
      </button>
    </div>
    );
  };

  // Detalhe consultivo do lançamento (mesmo endpoint usado em Contas a Pagar).
  const detailQuery = (trpc as any).financial.getEntryDetalhe.useQuery(
    { id: detalheEntryId ?? 0, companyId },
    { enabled: !!detalheEntryId && !!companyId }
  );
  const detEntry: any = detailQuery.data?.entry;
  const detOrigem: any = detailQuery.data?.origemDetalhes;
  const detOrdem: any = detailQuery.data?.ordem;
  const detItens: any[] = detailQuery.data?.itens ?? [];
  const updateEntryClassif = (trpc as any).financial.updateEntryClassificacao.useMutation({
    onSuccess: () => {
      detailQuery.refetch();
      setDetEditMode(false);
      setDetEditForm(null);
      setAiAnalise(null);
      toast({ title: "Lançamento atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });
  // Rev. 3401 — análise IA on-demand: compara extrato × ERP e sugere correções de classificação.
  const analisarConciliacaoMut = (trpc as any).financial.analisarConciliacaoComIA.useMutation({
    onMutate: () => { setAiAnalise("loading"); setAiCheckeds(new Set()); },
    onSuccess: (data: any) => {
      setAiAnalise(data);
      setAiCheckeds(new Set((data.sugestoes ?? []).map((_: any, i: number) => i)));
    },
    onError: (e: any) => { setAiAnalise("error"); toast({ title: "Erro na análise IA", description: e.message, variant: "destructive" }); },
  });
  const dispararAnaliseIA = () => {
    if (!detEntry || !detalheExtrato) return;
    analisarConciliacaoMut.mutate({
      companyId,
      entryId: detEntry.id,
      extratoDescricao: detalheExtrato.descricao ?? "",
      extratoData: detalheExtrato.data ?? undefined,
      extratoValor: detalheExtrato.valor ?? undefined,
    });
  };
  const aplicarCorrecoesSugeridas = () => {
    if (!detEntry || typeof aiAnalise !== "object" || aiAnalise === null || aiAnalise === "error") return;
    const sels = (aiAnalise as any).sugestoes.filter((_: any, i: number) => aiCheckeds.has(i));
    if (!sels.length) { toast({ title: "Nenhuma sugestão selecionada." }); return; }
    const patch: any = { id: detEntry.id, companyId };
    for (const s of sels) {
      if (s.campo === "fornecedorNome") patch.fornecedorNome = s.sugestao;
      else if (s.campo === "contaId" && s.contaIdSugerido) { patch.contaId = s.contaIdSugerido; patch.contaNome = s.contaNomeSugerida || s.sugestao; }
      else if (s.campo === "descricao") patch.descricao = s.sugestao;
    }
    updateEntryClassif.mutate(patch);
  };
  // Rev. 3402 — mutation IA para as linhas inline da lista de sugestões
  const rowAiMut = (trpc as any).financial.analisarConciliacaoComIA.useMutation({
    onMutate: () => { setRowAiAnalise("loading"); setRowAiCheckeds(new Set()); },
    onSuccess: (data: any) => {
      setRowAiAnalise(data);
      setRowAiCheckeds(new Set((data.sugestoes ?? []).map((_: any, i: number) => i)));
    },
    onError: (e: any) => { setRowAiAnalise("error"); toast({ title: "Erro na análise IA", description: e.message, variant: "destructive" }); },
  });
  const dispararRowAI = (s: any) => {
    setRowAiOpenId(s.statementLineId);
    setRowAiAnalise("loading");
    setRowAiCheckeds(new Set());
    rowAiMut.mutate({
      companyId,
      entryId: s.entryId,
      extratoDescricao: s.extratoDescricao ?? "",
      extratoData: s.extratoData ?? undefined,
      extratoValor: s.extratoValor ?? undefined,
    });
  };
  const aplicarRowCorrecoes = (s: any) => {
    if (typeof rowAiAnalise !== "object" || rowAiAnalise === null) return;
    const sels = (rowAiAnalise as any).sugestoes.filter((_: any, i: number) => rowAiCheckeds.has(i));
    if (!sels.length) { toast({ title: "Nenhuma sugestão selecionada." }); return; }
    const patch: any = { id: s.entryId, companyId };
    for (const sg of sels) {
      if (sg.campo === "fornecedorNome") patch.fornecedorNome = sg.sugestao;
      else if (sg.campo === "contaId" && sg.contaIdSugerido) { patch.contaId = sg.contaIdSugerido; patch.contaNome = sg.contaNomeSugerida || sg.sugestao; }
      else if (sg.campo === "descricao") patch.descricao = sg.sugestao;
    }
    updateEntryClassif.mutate(patch, {
      onSuccess: () => { setRowAiOpenId(null); setRowAiAnalise(null); setRowAiCheckeds(new Set()); },
    });
  };
  // Rev. 3403 — LOTE: mutation + funções de análise em batch + aplicar relatório
  const analisarLoteMut = (trpc as any).financial.analisarLoteSugestoesComIA.useMutation();
  // Rev. 3454 — cache persistente: carrega resultado salvo ao abrir a conta/período
  const aiCacheQ = (trpc as any).financial.getAiConciliacaoCache.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim },
    { enabled: !!companyId && !!contaBancariaId, staleTime: Infinity, refetchOnWindowFocus: false }
  );
  const saveAiCacheMut = (trpc as any).financial.saveAiConciliacaoCache.useMutation();
  // Hidrata o estado local com o resultado salvo no banco (uma única vez, ao carregar)
  useEffect(() => {
    if (!aiCacheQ.data?.resultados || batchAiLoading) return;
    const resultados = aiCacheQ.data.resultados as Record<number, any>;
    if (Object.keys(resultados).length === 0) return;
    setBatchAiResults(resultados);
    setBatchAiFromCache(true);
    setBatchAiCachedAt(aiCacheQ.data.analisadoEm ?? null);
  }, [aiCacheQ.data]);
  // Limpa o estado do cache ao trocar de conta ou período
  useEffect(() => {
    setBatchAiResults({});
    setBatchAiFromCache(false);
    setBatchAiCachedAt(null);
  }, [contaBancariaId, dataInicio, dataFim]);
  const analisarTodas = async (forcar = false) => {
    if (!sugestoes.length || batchAiLoading) return;
    setBatchAiLoading(true);
    setBatchAiResults({});
    setBatchAiFromCache(false);
    setBatchAiCachedAt(null);
    setBatchAiProgress({ done: 0, total: sugestoes.length });
    const CHUNK = 30;
    const novoResults: Record<number, any> = {};
    try {
      for (let i = 0; i < sugestoes.length; i += CHUNK) {
        const chunk = sugestoes.slice(i, i + CHUNK);
        const res = await analisarLoteMut.mutateAsync({
          companyId,
          itens: chunk.map((s: any) => ({
            statementLineId: s.statementLineId,
            entryId: s.entryId,
            extratoDescricao: s.extratoDescricao ?? "",
            extratoData: s.extratoData ?? undefined,
            extratoValor: s.extratoValor ?? undefined,
          })),
        });
        for (const r of (res.resultados ?? [])) {
          novoResults[r.statementLineId] = r;
        }
        setBatchAiProgress({ done: Math.min(i + CHUNK, sugestoes.length), total: sugestoes.length });
      }
    } catch (e: any) {
      toast({ title: "Erro na análise em lote", description: e.message, variant: "destructive" });
      setBatchAiLoading(false);
      setBatchAiProgress(null);
      return;
    }
    setBatchAiResults(novoResults);
    setBatchAiLoading(false);
    // Persiste no banco para evitar re-análise no próximo acesso
    saveAiCacheMut.mutate({
      companyId,
      contaBancariaId: parseInt(contaBancariaId) || 0,
      dataInicio,
      dataFim,
      resultados: novoResults as any,
    });
    const preChecked = new Set<string>();
    for (const [slid, r] of Object.entries(novoResults)) {
      (r as any).sugestoes.forEach((_: any, idx: number) => preChecked.add(`${slid}-${idx}`));
    }
    setBatchApplyChecked(preChecked);
    setShowBatchReport(true);
  };
  const aplicarBatchCorrecoes = async () => {
    const byEntry: Record<number, { patch: any; entryId: number }> = {};
    for (const key of batchApplyChecked) {
      const [slidStr, idxStr] = key.split("-");
      const slid = Number(slidStr);
      const idx = Number(idxStr);
      const r = batchAiResults[slid];
      if (!r || !r.sugestoes[idx]) continue;
      const sg = r.sugestoes[idx];
      if (!byEntry[r.entryId]) byEntry[r.entryId] = { patch: { id: r.entryId, companyId }, entryId: r.entryId };
      const p = byEntry[r.entryId].patch;
      if (sg.campo === "fornecedorNome") p.fornecedorNome = sg.sugestao;
      else if (sg.campo === "contaId" && sg.contaIdSugerido) { p.contaId = sg.contaIdSugerido; p.contaNome = sg.contaNomeSugerida || sg.sugestao; }
      else if (sg.campo === "descricao") p.descricao = sg.sugestao;
    }
    const entradas = Object.values(byEntry);
    if (!entradas.length) { toast({ title: "Nenhuma correção selecionada." }); return; }
    setBatchApplying(true);
    setBatchApplyProgress({ done: 0, total: entradas.length });
    let done = 0;
    for (const { patch } of entradas) {
      try { await updateEntryClassif.mutateAsync(patch); } catch { /* continua */ }
      done++;
      setBatchApplyProgress({ done, total: entradas.length });
    }
    setBatchApplying(false);
    setBatchApplyProgress(null);
    setShowBatchReport(false);
    setBatchAiResults({});
    setBatchApplyChecked(new Set());
    toast({ title: `${done} lançamento(s) corrigido(s) com sucesso.` });
  };
  // Rev. 3404 — Aplicar correções inline no dialog "Confirmar conciliação?"
  const aplicarConfirmCorrecoes = async () => {
    if (typeof confirmAiState !== "object") return;
    const byEntry: Record<number, any> = {};
    for (const key of confirmAiChecked) {
      const [slidStr, idxStr] = key.split("-");
      const r = (confirmAiState as any).resultados.find((x: any) => x.statementLineId === Number(slidStr));
      if (!r) continue;
      const sg = r.sugestoes[Number(idxStr)];
      if (!sg) continue;
      if (!byEntry[r.entryId]) byEntry[r.entryId] = { patch: { id: r.entryId, companyId }, entryId: r.entryId };
      const p = byEntry[r.entryId].patch;
      if (sg.campo === "fornecedorNome") p.fornecedorNome = sg.sugestao;
      else if (sg.campo === "contaId" && sg.contaIdSugerido) { p.contaId = sg.contaIdSugerido; p.contaNome = sg.contaNomeSugerida || sg.sugestao; }
      else if (sg.campo === "descricao") p.descricao = sg.sugestao;
    }
    const entradas = Object.values(byEntry);
    if (!entradas.length) return;
    for (const { patch } of entradas) {
      try { await updateEntryClassif.mutateAsync(patch); } catch { /* continua */ }
    }
    toast({ title: `${entradas.length} lançamento(s) corrigido(s).` });
    // Limpa as sugestões aplicadas do estado de confirmação
    const applied = new Set(confirmAiChecked);
    const updated = (confirmAiState as any).resultados.map((r: any) => ({
      ...r,
      sugestoes: r.sugestoes.filter((_: any, i: number) => !applied.has(`${r.statementLineId}-${i}`)),
    }));
    setConfirmAiState({ resultados: updated });
    setConfirmAiChecked(new Set());
  };
  // Rev. 3459 — quando o botão lápis é clicado antes do detalhe carregar,
  // aguarda o detEntry ficar disponível e entra em modo de edição automaticamente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (pendingEditMode && detEntry) { iniciarEdicaoEntry(); setPendingEditMode(false); } }, [detEntry, pendingEditMode]);
  const iniciarEdicaoEntry = () => {
    if (!detEntry) return;
    // Rev. 3467+ — auto-match: se obraId é null mas obraNome vem preenchido (planilha),
    // tenta encontrar a obra na lista pelo nome (case-insensitive, trim) e pré-seleciona.
    let resolvedObraId = detEntry.obraId ?? null;
    let resolvedObraNome = detEntry.obraNome ?? "";
    if (resolvedObraId == null && resolvedObraNome) {
      const norm = (s: string) => s.trim().toLowerCase();
      const match = obrasOpts.find(o => norm(o.nome) === norm(resolvedObraNome));
      if (match) { resolvedObraId = match.id; resolvedObraNome = match.nome; }
    }
    setDetEditForm({
      contaId: detEntry.contaId ?? null,
      contaNome: detEntry.contaNome ?? "",
      obraId: resolvedObraId,
      obraNome: resolvedObraNome,
      contaBancariaId: detEntry.contaBancariaId ?? null,
      formaPagamento: detEntry.formaPagamento ?? "",
      fornecedorNome: detEntry.fornecedorNome ?? "",
      descricao: detEntry.descricao ?? "",
      observacoes: detEntry.observacoes ?? "",
      tipo: detEntry.tipo ?? "despesa",
    });
    setDetEditFornDisplay(detEntry.fornecedorNome ?? "");
    setDetEditMode(true);
  };
  const salvarEdicaoEntry = () => {
    if (!detEntry || !detEditForm) return;
    updateEntryClassif.mutate({
      id: detEntry.id,
      companyId,
      contaId: detEditForm.contaId,
      contaNome: detEditForm.contaNome || null,
      obraId: detEditForm.obraId,
      obraNome: detEditForm.obraNome || null,
      contaBancariaId: detEditForm.contaBancariaId,
      formaPagamento: detEditForm.formaPagamento || null,
      // Rev. 3739 — idem ao "Novo lançamento": preserva o fornecedor digitado mesmo sem
      // confirmar no dropdown (fallback p/ detEditFornDisplay); só limpa se ambos vazios.
      fornecedorNome: (detEditForm.fornecedorNome.trim() || detEditFornDisplay.trim()) || null,
      descricao: detEditForm.descricao || null,
      observacoes: detEditForm.observacoes || null,
      tipo: (detEditForm.tipo as any) || undefined,
    });
  };
  const field = (label: string, value: any, k?: string) =>
    (value === null || value === undefined || value === "" || value === "—") ? null : (
      <div key={k ?? label} className="min-w-0">
        <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-gray-800 break-words">{value}</div>
      </div>
    );

  const conciliarSugMut = (trpc as any).financial.conciliarSugestoes.useMutation({
    onSuccess: (res: any, variables: any) => {
      // Rev. 3751 — esconder APENAS as linhas que o backend confirmou ter conciliado
      // (res.conciliadosLineIds), NUNCA todas as selecionadas. Antes, qualquer par pulado
      // pelo backend (lançamento já conciliado/indisponível, ex.: sugestão defasada em cache)
      // sumia da tela mesmo sem gravar e "voltava ao recarregar". Agora os pares que falharam
      // ficam visíveis, o usuário é avisado e a lista é REANALISADA (re-pareia com lançamento
      // elegível) para que a próxima tentativa efetivamente concilie.
      const selecionadas = (variables?.pares ?? []).map((p: any) => Number(p.statementLineId));
      const persistidas = new Set<number>(
        Array.isArray(res?.conciliadosLineIds)
          ? res.conciliadosLineIds.map((x: any) => Number(x))
          : selecionadas, // fallback compat. (backend antigo): mantém comportamento prévio
      );
      const naoPersistidas = selecionadas.filter((id: number) => !persistidas.has(id));
      setConciliadosIds(prev => new Set([...prev, ...persistidas]));
      setSelSug(new Set());
      setConfirmConciliar(false);
      setOverrideSug(prev => { const n = { ...prev }; persistidas.forEach(id => delete n[id]); return n; });
      if (naoPersistidas.length > 0) {
        toast({
          title: `${formatInt(res.conciliados)} de ${formatInt(res.total)} conciliados`,
          description: `${formatInt(naoPersistidas.length)} não puderam ser conciliadas (o lançamento já estava conciliado ou indisponível). Atualizei a lista — confira e tente novamente.`,
          variant: "destructive",
        });
        refetchSug(); // re-analisa para re-parear as que falharam com um lançamento elegível
      } else {
        toast({ title: `${formatInt(res.conciliados)} de ${formatInt(res.total)} conciliados e baixados!` });
      }
      refetchSt();
      refetchStAno();
      refetchAccStatus();
      setReportStale(false);
      refetchReport();
    },
    onError: (e: any) => { setConfirmConciliar(false); toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }); },
  });

  const toggleSug = (id: number) => setSelSug(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const selecionarAlta = () => setSelSug(new Set(sugestoes.filter(s => s.confianca === "alta").map(s => s.statementLineId)));
  const selecionarTodas = () => setSelSug(new Set(sugestoes.map(s => s.statementLineId)));
  // Rev. 3201 — A conciliação automática é APENAS SUGESTIVA: nada é gravado sem o
  // usuário CONFIRMAR explicitamente cada valor. "Conciliar selecionadas" agora ABRE
  // um diálogo de revisão (extrato → lançamento + valores) e só aplica após o
  // "Confirmar conciliação". Frontend-only (o backend já era query-only p/ sugerir).
  const conciliarSelecionadas = () => {
    if (selSug.size === 0) { toast({ title: "Selecione ao menos uma sugestão", variant: "destructive" }); return; }
    // Rev. 3407 — IA NÃO dispara automaticamente (economiza tokens). Usuário clica no botão "Verificar com IA".
    setConfirmAiState("idle");
    setConfirmAiChecked(new Set());
    setConfirmConciliar(true);
  };
  // Rev. 3407 — disparo manual da análise IA no dialog de confirmação
  const dispararConfirmAI = () => {
    const itensSel = sugestoes.filter((s: any) => selSug.has(s.statementLineId));
    if (!itensSel.length) return;
    setConfirmAiState("loading");
    setConfirmAiChecked(new Set());
    analisarLoteMut.mutateAsync({
      companyId,
      itens: itensSel.map((s: any) => ({
        statementLineId: s.statementLineId,
        entryId: s.entryId,
        extratoDescricao: s.extratoDescricao ?? "",
        extratoData: s.extratoData ?? undefined,
        extratoValor: s.extratoValor ?? undefined,
      })),
    }).then((res: any) => {
      const resultados = res.resultados ?? [];
      setConfirmAiState({ resultados });
      const preChecked = new Set<string>();
      for (const r of resultados) r.sugestoes.forEach((_: any, i: number) => preChecked.add(`${r.statementLineId}-${i}`));
      setConfirmAiChecked(preChecked);
    }).catch(() => setConfirmAiState("error"));
  };
  const confirmarConciliacao = () => {
    if (conciliarSugMut.isPending) return; // blindagem contra clique duplo
    const pares = sugSelecionadas.map(s => ({ statementLineId: s.statementLineId, entryId: overrideSug[s.statementLineId]?.entryId ?? s.entryId }));
    if (pares.length === 0) { setConfirmConciliar(false); return; }
    conciliarSugMut.mutate({ companyId, pares });
  };

  // Lê UM arquivo → {nome, conteudo, formato}. PDF vai como base64 (sem o prefixo
  // data:), OFX/CSV como texto ISO-8859-1.
  function lerArquivoExtrato(file: File): Promise<{ nome: string; conteudo: string; formato: "ofx" | "csv" | "pdf" }> {
    return new Promise((resolve, reject) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
      if (ext === "pdf") {
        reader.onload = (ev) => resolve({ nome: file.name, conteudo: ((ev.target?.result as string) ?? "").replace(/^data:[^,]*,/, ""), formato: "pdf" });
        reader.readAsDataURL(file);
      } else {
        const formato: "ofx" | "csv" = (ext === "ofx" || ext === "qfx") ? "ofx" : "csv";
        reader.onload = (ev) => resolve({ nome: file.name, conteudo: (ev.target?.result as string) ?? "", formato });
        reader.readAsText(file, "ISO-8859-1");
      }
    });
  }

  // Rev. 3354 — aceita VÁRIOS arquivos de uma vez. Imagens são ignoradas (com aviso);
  // cada extrato válido entra na fila e é lido + gravado em sequência no handleImport.
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (all.length === 0) return;
    const imgExts = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"];
    const imagens = all.filter(f => imgExts.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
    const validos = all.filter(f => !imgExts.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
    if (imagens.length > 0) {
      toast({
        title: imagens.length === all.length ? "Imagem não é lida automaticamente" : `${imagens.length} imagem(ns) ignorada(s)`,
        description: "Extratos em foto/imagem ainda não são interpretados. Envie o PDF gerado pelo internet banking, ou um arquivo OFX/CSV.",
        variant: "destructive",
      });
    }
    if (validos.length === 0) return;
    // Tolerante a falha por arquivo: lê todos, mantém os que deram certo e avisa os que
    // falharam (um arquivo corrompido não derruba a fila inteira).
    const resultados = await Promise.allSettled(validos.map(lerArquivoExtrato));
    const lidos = resultados.filter((r): r is PromiseFulfilledResult<{ nome: string; conteudo: string; formato: "ofx" | "csv" | "pdf" }> => r.status === "fulfilled").map(r => r.value);
    const falhas = resultados.length - lidos.length;
    if (falhas > 0) {
      toast({ title: `${falhas} arquivo(s) não puderam ser lidos`, description: "Os demais foram carregados normalmente.", variant: "destructive" });
    }
    if (lidos.length === 0) return;
    // Mantém os estados single-file em sincronia (UI do dropzone, separador CSV e o
    // botão "Importar" que checa importContent) com o 1º arquivo da fila.
    setImportFiles(lidos);
    setImportFileName(lidos.length === 1 ? lidos[0].nome : `${lidos.length} arquivos selecionados`);
    setImportFormato(lidos[0].formato);
    setImportContent(lidos[0].conteudo);
  }

  async function handleImport(skipMonthCheck = false) {
    if (importFiles.length === 0 && !importContent) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    if (!importConta) { toast({ title: "Selecione a conta bancária", variant: "destructive" }); return; }
    const contaId = parseInt(importConta);
    // Rev. 3354 — fila de arquivos (1 ou vários). Cada extrato é analisado e gravado em
    // sequência; o mês/ano de cada lançamento sai da própria DATA da linha.
    const files = importFiles.length > 0
      ? importFiles
      : [{ nome: importFileName, conteudo: importContent, formato: importFormato }];
    const multi = files.length > 1;
    setImportRunning(true);
    setImportPct(2);
    setImportLabel(multi ? `Lendo ${files.length} extratos...` : "Lendo e analisando o extrato...");
    let grandInserted = 0, grandSkipped = 0, arquivosComDados = 0;
    const propostasRend: RendProposta[] = [];
    try {
      for (let fi = 0; fi < files.length; fi++) {
        const f = files[fi];
        const prefix = multi ? `Arquivo ${fi + 1}/${files.length} — ` : "";
        const baseProgress = (fi / files.length) * 100;
        const span = 100 / files.length;

        // FASE 1 — analisar (parse no servidor; nada é gravado ainda)
        setImportLabel(`${prefix}Lendo e analisando...`);
        const analysis: any = await analyzeMut.mutateAsync({
          companyId,
          contaBancariaId: contaId,
          formato: f.formato,
          conteudo: f.conteudo,
          csvSeparador: f.formato === "csv" ? csvSeparador : undefined,
        });
        const linhas: any[] = analysis?.lines ?? [];
        const total = linhas.length;
        const importadoEm: string = analysis?.importadoEm;
        if (total === 0) {
          // Multi-arquivo: avisa e segue pros demais; single: aborta como antes.
          toast({ title: multi ? `Sem transações em ${f.nome}` : "Nenhuma transação encontrada no arquivo", variant: "destructive" });
          if (multi) continue;
          return;
        }
        arquivosComDados++;
        setImportLabel(`${prefix}${formatInt(total)} transações. Gravando...`);

        // Rev. 3363 — rendimento de aplicação/resgate automático (CDB ContaMax) detectado?
        // Guarda a PROPOSTA p/ confirmação após a gravação (nunca lança sozinho).
        const rend = analysis?.rendimentoAplicacao;
        if (rend && (Number(rend.bruto) > 0 || Number(rend.iof) > 0 || Number(rend.ir) > 0)) {
          // Competência: usa o cabeçalho do extrato; se ausente (0), deriva do mês dominante das linhas.
          let cMes = Number(rend.competenciaMes) || 0;
          let cAno = Number(rend.competenciaAno) || 0;
          if (!cMes || !cAno) {
            const counts = new Map<string, number>();
            for (const l of linhas) { const k = String(l?.data ?? "").slice(0, 7); if (k.length === 7) counts.set(k, (counts.get(k) ?? 0) + 1); }
            let dom = ""; let domN = 0;
            for (const [k, n] of counts) { if (n > domN) { dom = k; domN = n; } }
            if (dom) { const [ay, am] = dom.split("-"); cAno = parseInt(ay, 10); cMes = parseInt(am, 10); }
          }
          if (cMes && cAno) {
            propostasRend.push({
              contaBancariaId: contaId, competenciaMes: cMes, competenciaAno: cAno,
              bruto: Number(rend.bruto) || 0, iof: Number(rend.iof) || 0, ir: Number(rend.ir) || 0,
              fileName: f.nome,
            });
          }
        }

        // Rev. 3179 — ALERTA/BLOQUEIO de mês divergente: SÓ no modo single-file. Importar
        // VÁRIOS extratos é, por natureza, multi-mês — cada linha cai no seu próprio mês.
        if (!multi && !skipMonthCheck && modoData === "mes" && mesSel != null) {
          const selKey = `${ano}-${String(mesSel).padStart(2, "0")}`;
          const counts = new Map<string, number>();
          for (const l of linhas) { const k = String(l?.data ?? "").slice(0, 7); if (k.length === 7) counts.set(k, (counts.get(k) ?? 0) + 1); }
          let dom = ""; let domN = 0;
          for (const [k, n] of counts) { if (n > domN) { dom = k; domN = n; } }
          if (dom && dom !== selKey) {
            const fora = linhas.filter(l => String(l?.data ?? "").slice(0, 7) !== selKey).length;
            const [ay, am] = dom.split("-");
            setMismatch({ detectado: dom, selecionado: selKey, fora, total, anoNum: parseInt(ay, 10), mesNum: parseInt(am, 10) });
            return; // não grava — usuário decide no alerta (trocar p/ o mês certo ou cancelar)
          }
        }

        // FASE 2 — gravar em lotes (progresso real = processadas/total deste arquivo)
        const CHUNK = 40;
        let processed = 0;
        for (let i = 0; i < total; i += CHUNK) {
          const slice = linhas.slice(i, i + CHUNK);
          const isLast = i + CHUNK >= total;
          const r: any = await insertBatchMut.mutateAsync({
            companyId,
            contaBancariaId: contaId,
            formato: f.formato,
            importadoEm,
            linhas: slice,
            finalize: isLast,
            totalInseridos: grandInserted,
            totalDuplicados: grandSkipped,
          });
          grandInserted += r?.inserted ?? 0;
          grandSkipped += r?.skipped ?? 0;
          processed += slice.length;
          setImportPct(Math.min(99, Math.round(baseProgress + (processed / total) * span)));
          setImportLabel(`${prefix}Gravando ${formatInt(Math.min(processed, total))} de ${formatInt(total)} transações...`);
        }
      }

      if (arquivosComDados === 0) return; // nada gravado; os toasts já avisaram

      setImportPct(100);
      setImportLabel("Concluído!");
      toast({
        title: `Importação concluída! ${formatInt(grandInserted)} inseridos, ${formatInt(grandSkipped)} duplicados ignorados`,
        description: multi ? `${arquivosComDados} extratos processados. Atualizando a conciliação…` : "Atualizando a conciliação…",
      });
      setShowImport(false);
      setImportContent("");
      setImportFileName("");
      setImportFiles([]);
      // Rev. 3187 — após importar, a conta importada vira a conta ATIVA na própria tela e o
      // relatório/sugestões recarregam ali mesmo (Painel separado aposentado).
      if (contaId) setContaBancariaId(String(contaId));
      setMostrarSugestoes(true);
      refetchSt();
      refetchStAno();
      refetchAccStatus();
      setReportStale(false);
      refetchReport();
      refetchSug();
      // Rev. 3363 — havendo rendimento(s) de aplicação automática detectado(s), abre o
      // card de confirmação (nunca lança sozinho).
      if (propostasRend.length > 0) {
        setRendimentoPropostas(propostasRend);
        setShowRendimento(true);
      }
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e?.message || "Falha ao importar o extrato.", variant: "destructive" });
    } finally {
      setImportRunning(false);
      setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
    }
  }

  // Rev. 3363 — confirma o lançamento dos rendimentos de aplicação automática propostos.
  async function confirmarRendimentos() {
    let lancados = 0, jaExistiam = 0;
    try {
      for (const p of rendimentoPropostas) {
        const r: any = await lancarRendimentoMut.mutateAsync({
          companyId,
          contaBancariaId: p.contaBancariaId,
          competenciaMes: p.competenciaMes,
          competenciaAno: p.competenciaAno,
          bruto: p.bruto, iof: p.iof, ir: p.ir,
        });
        if (r?.alreadyExists) jaExistiam++; else lancados++;
      }
      toast({
        title: lancados > 0 ? `Rendimento lançado! ${lancados} competência(s)` : "Rendimento já estava lançado",
        description: jaExistiam > 0 ? `${jaExistiam} competência(s) já existiam e foram ignoradas.` : "Receita financeira + IOF + IR registrados.",
      });
      setShowRendimento(false);
      setRendimentoPropostas([]);
      setReportStale(true);
      refetchSt();
    } catch (e: any) {
      toast({ title: "Erro ao lançar rendimento", description: e?.message || "Falha ao registrar o rendimento.", variant: "destructive" });
    }
  }

  // Rev. 3328 — rótulo do período sensível ao modo (mês / dia / faixa). Usado nos
  // títulos de PDF/print, na barra de progresso e nos cabeçalhos do panorama.
  const periodoLabel = modoData === "dia"
    ? fmtData(diaSel)
    : modoData === "periodo"
      ? `${fmtData(dataInicio)} – ${fmtData(dataFim)}`
      : mesSel != null ? `${MESES[mesSel - 1]}/${ano}` : `Ano ${ano}`;
  const contaSel = (bankAccounts ?? []).find((b: any) => String(b.id) === contaBancariaId);
  const contaLabel = contaSel ? `${contaSel.banco}${contaSel.descricao ? ` · ${contaSel.descricao}` : ""} (Ag. ${formatAgencia(contaSel.agencia)}/${formatConta(contaSel.conta)})` : "—";
  // Rev. 3324 — rótulo da conta da PRÓPRIA linha (no panorama não há conta selecionada;
  // resolve pelo contaBancariaId da linha contra os grupos do panorama).
  const lancContaLabel = useMemo(() => {
    if (!lancStatement) return contaLabel;
    const id = Number(lancStatement.contaBancariaId);
    const c = geralContas.find((x: any) => Number(x.contaBancariaId) === id);
    return c?.contaLabel || (contaSel ? contaLabel : "—");
  }, [lancStatement, geralContas, contaLabel, contaSel]);

  // Rev. 3187 — Relatório PDF (3 blocos) embutido na tela única (absorve o antigo Painel).
  function gerarRelatorioPDF() {
    if (!report) { toast({ title: "Relatório ainda carregando", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const rowsConc = repConc.length
      ? repConc.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(c.entryFornecedor || c.entryDescricao || ("Lançamento #" + (c.entryId ?? "")))}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhuma linha conciliada no período.</td></tr>`;
    const rowsExt = repExt.length
      ? repExt.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}${c.chequeFornecedor ? `<br><span style="color:#047857;font-size:10px">🪙 Cheque nº ${esc(c.chequeNumero ?? "—")} · ${esc(c.chequeFornecedor)}${c.chequeObraNome ? ` · ${esc(c.chequeObraNome)}` : ""}${c.chequeNf ? ` · NF ${esc(c.chequeNf)}` : ""}</span>` : (c.faturaId ? `<br><span style="color:#4338ca;font-size:10px">💳 Fatura ${esc(c.faturaCartao ?? "cartão")}${c.faturaMesRef ? ` · ${esc(String(c.faturaMesRef).padStart(2, "0"))}/${esc(c.faturaAnoRef ?? "")}` : ""}${c.faturaVencimento ? ` · venc. ${esc(fmtData(c.faturaVencimento))}` : ""}</span>` : ((c.demoBeneficiario || c.demoTipo) ? `<br><span style="color:#6d28d9;font-size:10px">${c.demoTipo === "boleto" ? "🧾 Boleto" : c.demoTipo === "ted" ? "💸 TED" : "💸 PIX"}${c.demoBeneficiario ? ` · ${esc(c.demoBeneficiario)}` : ""}${c.demoDocumento ? ` · ${esc(c.demoDocumento)}` : ""}${c.demoMatch === "valor" ? " · provável" : ""} (demonstrativo)</span>` : ""))}</td><td>${esc(Number(c.valor) >= 0 ? "Entrada" : "Saída")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Sem pendências — todo o extrato está conciliado.</td></tr>`;
    const rowsLan = repLan.length
      ? repLan.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhum lançamento sem extrato no período.</td></tr>`;
    // Rev. 3188 — bloco "sem conta definida" no PDF (não somado ao "ERP sem extrato").
    const rowsSemConta = repSemConta.length
      ? repSemConta.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : "";
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
  @media print{body{padding:10px}}
</style></head><body>
  <img class="logo" src="${window.location.origin}/logo-fc.jpg?v=3260" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">RELATÓRIO DE CONCILIAÇÃO BANCÁRIA</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <div class="cards">
    <div class="card"><div class="lbl">Conciliado</div><div class="val blue">${formatInt(repConc.length)} <span style="font-size:11px">(${pctConc}%)</span></div><div class="lbl">${esc(formatBRL(vConc))}</div></div>
    <div class="card"><div class="lbl">Extrato sem lançamento</div><div class="val red">${formatInt(repExt.length)}</div><div class="lbl">${esc(formatBRL(vExt))}</div></div>
    <div class="card"><div class="lbl">Lançamentos sem extrato</div><div class="val">${formatInt(repLan.length)}</div><div class="lbl">${esc(formatBRL(vLan))}</div></div>
    <div class="card"><div class="lbl">Total do extrato</div><div class="val">${formatInt(totLinhas)}</div><div class="lbl">linhas no período</div></div>
  </div>
  <h2>1. Extrato conciliado (${formatInt(repConc.length)})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Lançamento casado</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsConc}</tbody>
  <tfoot><tr><td colspan="3">Total conciliado</td><td class="r">${esc(formatBRL(vConc))}</td></tr></tfoot></table>
  <h2>2. Extrato SEM lançamento — o que falta (${formatInt(repExt.length)})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Tipo</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsExt}</tbody>
  <tfoot><tr><td colspan="3">Total pendente</td><td class="r">${esc(formatBRL(vExt))}</td></tr></tfoot></table>
  <h2>3. Lançamentos do sistema sem extrato (${formatInt(repLan.length)})</h2>
  <table><thead><tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsLan}</tbody>
  <tfoot><tr><td colspan="3">Total sem extrato</td><td class="r">${esc(formatBRL(vLan))}</td></tr></tfoot></table>
  ${repSemConta.length ? `<h2>4. Lançamentos sem conta bancária definida (${formatInt(repSemConta.length)})</h2>
  <p style="font-size:10px;color:#6b7280;margin:0 0 6px">Não somados ao bloco "ERP sem extrato" — sem conta de origem informada no ERP, aparecem em todas as contas.</p>
  <table><thead><tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsSemConta}</tbody>
  <tfoot><tr><td colspan="3">Total sem conta</td><td class="r">${esc(formatBRL(vSemConta))}</td></tr></tfoot></table>` : ""}
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 350);
  }

  // Rev. 3196 — Exportar SEPARADAMENTE cada lista de pendências (Excel + PDF):
  // "No extrato, sem lançamento" (repExt) e "No ERP, sem extrato" (repLan).
  const slugPeriodo = () => String(periodoLabel || "").replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");

  async function exportarListaExcel(qual: "extrato" | "erp") {
    const lista = qual === "extrato" ? repExt : repLan;
    if (lista.length === 0) { toast({ title: "Nada para exportar nesta lista", variant: "destructive" }); return; }
    try {
      const XLSX = await import("xlsx");
      const titulo = qual === "extrato" ? "No extrato, sem lançamento" : "No ERP, sem extrato";
      const aoa: any[][] = qual === "extrato"
        ? [["Data", "Descrição (extrato)", "Tipo", "Valor (R$)"]]
        : [["Data", "Lançamento", "Obra", "Valor (R$)"]];
      let tot = 0;
      lista.forEach((c: any) => {
        const v = Math.abs(Number(c.valor) || 0); tot += v;
        if (qual === "extrato") aoa.push([fmtData(c.data), c.descricao || "—", Number(c.valor) >= 0 ? "Entrada" : "Saída", v]);
        else aoa.push([fmtData(c.data), c.fornecedorNome || c.descricao || ("Lançamento #" + c.id), c.obraNome || "—", v]);
      });
      aoa.push(["", "", "Total", tot]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 20 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
      const fname = qual === "extrato" ? "extrato-sem-lancamento" : "erp-sem-extrato";
      XLSX.writeFile(wb, `${fname}-${slugPeriodo()}.xlsx`);
    } catch (e: any) {
      toast({ title: "Falha ao gerar Excel", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  function exportarListaPDF(qual: "extrato" | "erp") {
    if (!report) { toast({ title: "Relatório ainda carregando", variant: "destructive" }); return; }
    const lista = qual === "extrato" ? repExt : repLan;
    if (lista.length === 0) { toast({ title: "Nada para exportar nesta lista", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const isExt = qual === "extrato";
    const titulo = isExt ? "EXTRATO SEM LANÇAMENTO NO ERP" : "LANÇAMENTOS DO ERP SEM EXTRATO";
    const total = isExt ? vExt : vLan;
    const head = isExt
      ? `<tr><th>Data</th><th>Descrição (extrato)</th><th>Tipo</th><th class="r">Valor</th></tr>`
      : `<tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr>`;
    const body = lista.map((c: any) => isExt
      ? `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(Number(c.valor) >= 0 ? "Entrada" : "Saída")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`
      : `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} ${esc(periodoLabel)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;padding:24px;font-size:12px}
  .logo{display:block;height:54px;margin:0 auto 10px}
  h1.brand{text-align:center;font-size:16px;margin:0;color:#1B2A4A;letter-spacing:.5px}
  .band{background:#1B2A4A;color:#fff;text-align:center;padding:10px;margin:14px 0;border-radius:6px;letter-spacing:3px;font-weight:bold;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:14px;flex-wrap:wrap;gap:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.r,th.r{text-align:right;white-space:nowrap}
  tfoot td{font-weight:bold;background:#f9fafb}
  @media print{body{padding:10px}}
</style></head><body>
  <img class="logo" src="${window.location.origin}/logo-fc.jpg?v=3260" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">${esc(titulo)}</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <table><thead>${head}</thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td colspan="3">Total (${formatInt(lista.length)})</td><td class="r">${esc(formatBRL(total))}</td></tr></tfoot></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 350);
  }

  // Rev. 3252 — Relatório em PDF/impressão da lista "Cheques devolvidos no banco"
  // (par compensação+devolução, saldo zero). READ-ONLY: só apresenta o que a tela
  // já mostra (motivo Bacen, datas, resolução/pendência) num documento imprimível.
  function gerarRelatorioDevolvidosPDF() {
    if (repDevol.length === 0) { toast({ title: "Nenhum cheque devolvido no período", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const totalDevol = repDevol.reduce((acc: number, d: any) => acc + Math.abs(Number(d.valor) || (d.valorCents ? d.valorCents / 100 : 0)), 0);
    const nPend = repDevol.filter((d: any) => (d.resolucao?.tipo ?? "pendente") === "pendente").length;
    const nQuit = repDevol.length - nPend;
    const rows = repDevol.map((d: any) => {
      const res = d.resolucao ?? { tipo: "pendente" };
      const cheque = d.chequeNumero ? `nº ${d.chequeNumero}` : (d.doc ? `Doc ${d.doc}` : "—");
      const ident = [d.fornecedor, d.obraNome, d.nf ? `NF ${d.nf}` : ""].filter(Boolean).join(" · ");
      const motivo = d.motivoCodigo != null
        ? `Motivo ${esc(d.motivoCodigo)}${d.motivoTexto ? ` · ${esc(d.motivoTexto)}` : ""}`
        : `<span style="color:#6b7280">Motivo não informado</span>`;
      const situacao = res.tipo === "reapresentado"
        ? `<span style="color:#047857">Quitado: cheque reapresentado em ${esc(fmtData(res.data))}</span>`
        : res.tipo === "pix"
          ? `<span style="color:#1d4ed8">Quitado por outro meio (PIX/TED) em ${esc(fmtData(res.data))}${res.descricao ? ` — ${esc(res.descricao)}` : ""}</span>`
          : `<span style="color:#b45309">Sem quitação identificada — analisar (reapresentar, cobrar ou substituir)</span>`;
      return `<tr>
        <td>Cheque ${esc(cheque)}${ident ? `<br><span style="color:#6b7280;font-size:10px">${esc(ident)}</span>` : ""}</td>
        <td class="r" style="color:#b91c1c;white-space:nowrap">${esc(formatBRL(Math.abs(Number(d.valor) || (d.valorCents ? d.valorCents / 100 : 0))))}</td>
        <td>${motivo}</td>
        <td style="white-space:nowrap">Comp. ${esc(fmtData(d.dataDebito))}<br>Devol. ${esc(fmtData(d.dataCredito))}</td>
        <td>${situacao}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cheques devolvidos ${esc(periodoLabel)}</title>
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
  .red{color:#b91c1c}.amber{color:#b45309}.green{color:#15803d}
  .note{font-size:10px;color:#6b7280;margin:0 0 10px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.r,th.r{text-align:right;white-space:nowrap}
  tfoot td{font-weight:bold;background:#f9fafb}
  @media print{body{padding:10px}}
</style></head><body>
  <img class="logo" src="${window.location.origin}/logo-fc.jpg?v=3260" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">CHEQUES DEVOLVIDOS NO BANCO</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <div class="cards">
    <div class="card"><div class="lbl">Cheques devolvidos</div><div class="val red">${formatInt(repDevol.length)}</div><div class="lbl">${esc(formatBRL(totalDevol))}</div></div>
    <div class="card"><div class="lbl">Pendentes</div><div class="val amber">${formatInt(nPend)}</div><div class="lbl">sem quitação identificada</div></div>
    <div class="card"><div class="lbl">Quitados</div><div class="val green">${formatInt(nQuit)}</div><div class="lbl">reapresentado ou outro meio</div></div>
  </div>
  <p class="note">Pares de compensação + devolução do mesmo cheque (saldo zero), exibidos no painel "Cheques devolvidos no banco". Documento informativo — nenhuma baixa é feita automaticamente.</p>
  <table><thead><tr><th>Cheque / Identificação</th><th class="r">Valor</th><th>Motivo (alínea Bacen)</th><th>Datas</th><th>Situação</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td>Total (${formatInt(repDevol.length)})</td><td class="r">${esc(formatBRL(totalDevol))}</td><td colspan="3"></td></tr></tfoot></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 350);
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-600" />Conciliação Bancária
            </h1>
            <p className="text-sm text-gray-500 mt-1">Relacione os lançamentos do sistema com o extrato bancário</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Rev. 3398 — Modo Caixa Interno: sem extrato, sem consolidação */}
            {contaSelecionadaCaixaInterno ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                  <Wallet className="w-3.5 h-3.5" /> Modo Caixa Interno
                </span>
                <Button size="sm" className="h-9 bg-violet-600 hover:bg-violet-700" onClick={abrirLancStandalone}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Novo lançamento
                </Button>
              </>
            ) : (
              <>
                {contaBancariaId && modoData === "mes" && mesSel != null && mesesStatus[mesSel] !== "vazio" && (
                  mesesStatus[mesSel] === "consolidado" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      disabled={desconsolidarMut.isPending}
                      onClick={() => desconsolidarMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      {desconsolidarMut.isPending ? "Reabrindo..." : `Desconsolidar ${MESES[mesSel - 1]}`}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 border-green-600 text-green-700 hover:bg-green-50"
                      disabled={consolidarMut.isPending}
                      onClick={() => consolidarMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      {consolidarMut.isPending ? "Consolidando..." : `Consolidar ${MESES[mesSel - 1]}`}
                    </Button>
                  )
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-teal-600 text-teal-700 hover:bg-teal-50"
                  onClick={() => setShowConferirCheques(true)}
                  title="Cheques compensados que conferem com o extrato e ainda não foram conciliados — revise e confirme em lote"
                  style={{ display: "none" }}
                >
                  <Link2 className="w-3.5 h-3.5 mr-1.5" />Conferir cheques
                </Button>
                <Button size="sm" className="h-9" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />Importar Extrato
                </Button>
                {contaBancariaId && (statements ?? []).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-red-500 text-red-600 hover:bg-red-50"
                    disabled={limparMut.isPending}
                    onClick={() => setConfirmLimpar(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    {limparMut.isPending ? "Limpando..." : "Limpar extrato"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>


        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Rev. 3165 — Período pelo MESMO PADRÃO do Lançamentos/Contas a Pagar:
                  navegação por ANO + faixa de meses (Jan–Dez) com bolinhas de status.
                  Clicar num mês filtra aquele mês; "Ano todo" abre o ano. */}
              <div>
                {/* Rev. 3328 — seletor de MODO de período: Mês (padrão) / Período (faixa) / Dia (conciliação diária). */}
                <div className="flex items-center gap-1.5 mb-3 p-1 bg-gray-100 rounded-lg w-fit">
                  {(([["mes", "Mês"], ["periodo", "Período"], ["dia", "Dia"]]) as [typeof modoData, string][]).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setModoData(val)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${modoData === val ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                {modoData === "mes" ? (
                <>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                    <button type="button" onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <Button
                      type="button"
                      variant={mesSel == null ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs ml-2"
                      onClick={() => setMesSel(null)}
                    >
                      Ano todo
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {MESES.map((m, i) => {
                    const num = i + 1;
                    const status = mesesStatus[num];
                    const isSelected = mesSel === num;
                    const pct = mesesPct[num]; // Rev. 3421 — % total do mês (todas as contas)
                    const hasPct = pct != null && status !== "vazio";
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMesSel(num)}
                        className={`relative flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs font-medium transition-all
                          ${isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        <span>{m}</span>
                        {hasPct && (
                          <span className={`text-[9px] font-semibold tabular-nums leading-none ${
                            status === "consolidado" ? (isSelected ? "text-green-700" : "text-green-600") :
                            status === "lancamento" ? (isSelected ? "text-blue-600" : "text-blue-500") :
                            "text-gray-400"
                          }`}>{pct}%</span>
                        )}
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          status === "consolidado" ? "bg-green-500" :
                          status === "lancamento" ? "bg-blue-500" :
                          "bg-gray-300"
                        }`} />
                      </button>
                    );
                  })}
                </div>
                </>
                ) : modoData === "dia" ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-medium text-gray-500">Dia</label>
                    <input
                      type="date"
                      value={diaSel}
                      onChange={(e) => setDiaSel(e.target.value)}
                      className="h-9 rounded-md border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <Button type="button" size="sm" variant="outline" className="h-9 text-xs" onClick={() => setDiaSel(hojeStr)}>Hoje</Button>
                    <span className="text-xs text-gray-400">Conciliação diária — mostra só o movimento desse dia.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-medium text-gray-500">De</label>
                    <input
                      type="date"
                      value={periIni}
                      onChange={(e) => setPeriIni(e.target.value)}
                      className="h-9 rounded-md border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <label className="text-xs font-medium text-gray-500">até</label>
                    <input
                      type="date"
                      value={periFim}
                      onChange={(e) => setPeriFim(e.target.value)}
                      className="h-9 rounded-md border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">Faixa de datas arbitrária.</span>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">Conta Bancária</p>
                  {periodoDefinido && (
                    <button
                      type="button"
                      onClick={() => setShowLimparMesDlg(true)}
                      disabled={limparExtratoMesMut.isPending}
                      className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      title="Remove todos os extratos importados de todas as contas neste período. Os lançamentos do ERP ficam intactos."
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar todos extratos do período
                    </button>
                  )}
                </div>
                {(bankAccounts ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">Nenhuma conta bancária cadastrada.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(bankAccounts ?? []).map((b: any) => {
                      const isSel = contaBancariaId === String(b.id);
                      const cor = bancoCor(b.banco);
                      const desc = b.descricao ?? b.tipo ?? "";
                      // Rev. 3170 — status de conciliação da conta no período: verde =
                      // extrato subido e 100% conciliado; azul = tem extrato com pendência;
                      // cinza = sem extrato. A cor do card segue esse status.
                      const accSt = accStatusMap[Number(b.id)] ?? "vazio";
                      const isConsol = accSt === "consolidado";
                      const isLanc = accSt === "lancamento";
                      // Rev. 3405+ — contas sem extrato (vazio) ficam visualmente apagadas
                      // Rev. 3423 — Caixa Interno com confirmações NÃO é "sem extrato"
                      const isCaixaInterno = Number(b.caixaInterno) === 1;
                      // Rev. 3420 — qtd de conciliações feitas (p/ destaque no card "A conciliar")
                      const { conciliadas: nConcil = 0, total: nTotal = 0 } = accConciliadasMap[Number(b.id)] ?? {};
                      const isSemExtrato = !isConsol && !isLanc && !(isCaixaInterno && nTotal > 0);
                      const temConciliacoes = (isLanc || isCaixaInterno) && nConcil > 0;
                      const pctConcil = nTotal > 0 ? Math.round(nConcil / nTotal * 100) : 0;
                      const cardCls = isSel
                        ? (isConsol
                            ? "border-green-500 bg-green-50 ring-1 ring-green-200 shadow-sm"
                            : temConciliacoes
                              ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-200 shadow-sm"
                              : "border-blue-500 bg-blue-50 ring-1 ring-blue-200 shadow-sm")
                        : (isConsol
                            ? "border-green-300 bg-green-50/60 hover:border-green-400"
                            : isLanc
                              ? temConciliacoes
                                ? "border-emerald-300 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/50"
                                : "border-blue-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                              : "border-dashed border-gray-200 bg-gray-50/40 hover:border-gray-300 hover:bg-gray-50/70 opacity-60 hover:opacity-80");
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={isSel}
                          aria-label={`Conta ${b.banco} agência ${b.agencia} conta ${b.conta} — ${isConsol ? "conciliada" : isLanc ? "com pendências" : "sem extrato"}${isSel ? " (selecionada — clique para desmarcar)" : ""}`}
                          onClick={() => setContaBancariaId(isSel ? "" : String(b.id))}
                          className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${cardCls}`}
                        >
                          <div className={`relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isSemExtrato && !isSel ? "bg-gray-100" : cor.bg}`}>
                            <Landmark className={`h-[18px] w-[18px] ${isSemExtrato && !isSel ? "text-gray-400" : cor.text}`} />
                            {isSel && (
                              <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-white ${isConsol ? "bg-green-500" : "bg-blue-500"}`}>
                                <Check className="h-2.5 w-2.5 text-white" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold truncate ${isSemExtrato && !isSel ? "text-gray-400" : "text-gray-800"}`}>
                              {b.banco}{desc ? ` · ${desc}` : ""}
                            </p>
                            <p className={`text-xs font-mono tracking-wide truncate ${isSemExtrato && !isSel ? "text-gray-400" : "text-gray-500"}`}>
                              Ag. {formatAgencia(b.agencia)} / {formatConta(b.conta)}
                            </p>
                            {/* Rev. 3421 — % de conciliação sempre visível abaixo do agência/conta */}
                            {!isSemExtrato && nTotal > 0 && (
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden max-w-[80px]">
                                  <div
                                    className={`h-full rounded-full transition-all ${isConsol ? "bg-green-500" : pctConcil > 0 ? "bg-emerald-500" : "bg-blue-400"}`}
                                    style={{ width: `${pctConcil}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${isConsol ? "text-green-700" : pctConcil > 0 ? "text-emerald-700" : "text-blue-500"}`}>
                                  {pctConcil}%
                                </span>
                              </div>
                            )}
                            {/* Rev. 3420 — badge de status com destaque verde quando tem conciliações feitas */}
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                isConsol ? "bg-green-100 text-green-700"
                                : temConciliacoes ? "bg-emerald-100 text-emerald-700"
                                : isLanc ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-500"
                              }`}>
                                {isConsol ? <><CheckCircle className="h-2.5 w-2.5" />{isCaixaInterno ? "Confirmado" : "Conciliado"}</>
                                  : temConciliacoes ? <><CheckCircle className="h-2.5 w-2.5" />{nConcil}/{nTotal} {isCaixaInterno ? "confirmados" : "conciliados"}</>
                                  : isLanc ? <><AlertCircle className="h-2.5 w-2.5" />A conciliar</>
                                  : isCaixaInterno ? "Sem confirmações"
                                  : "Sem extrato"}
                              </span>
                              {temConciliacoes && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 tabular-nums">
                                  {pctConcil}%
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-end">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <Select value={conciliadoFilter} onValueChange={setConciliadoFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="conciliado">Conciliados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!contaBancariaId && !periodoDefinido ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <RefreshCw className="w-14 h-14 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">{modoData === "dia" ? "Escolha uma data para ver o panorama do dia, ou uma conta para conciliar." : modoData === "periodo" ? "Defina o período (de…até) para ver o panorama, ou uma conta para conciliar." : "Selecione um mês para ver o panorama geral, ou uma conta para conciliar."}</p>
              <p className="text-xs text-gray-400 mt-2">Ou importe um extrato bancário (OFX/CSV) para começar</p>
            </CardContent>
          </Card>
        ) : !contaBancariaId ? (
          /* Rev. 3319 — PANORAMA GERAL DO MÊS (mês selecionado, sem conta): visão unificada
             de TODAS as contas com extrato no período. Totais agregados + por conta, com
             drill-in (abrir a conta) p/ conciliar. READ-ONLY — nada concilia aqui. */
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-base font-bold text-gray-800">{modoData === "mes" ? (mesSel == null ? "Panorama geral do ano" : "Panorama geral do mês") : modoData === "dia" ? "Panorama geral do dia" : "Panorama geral do período"}</p>
                      <p className="text-xs text-gray-500">Todas as contas com extrato em {periodoLabel}. Clique numa conta para conciliar.</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetchGeral()} disabled={geralLoading} className="h-8 text-xs">
                    {geralLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                    Atualizar
                  </Button>
                </div>

                {geralLoading ? (
                  <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Calculando o panorama de todas as contas…
                  </div>
                ) : geralIsError ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                    <p className="text-sm text-red-700 font-medium">Não consegui montar o panorama.</p>
                    <p className="text-xs text-gray-500 mt-1">{_msgErroConc(geralError?.message)}</p>
                    <Button size="sm" variant="outline" onClick={() => refetchGeral()} className="mt-3 border-red-300 text-red-700 hover:bg-red-100">Tentar de novo</Button>
                  </div>
                ) : geralContas.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    Nenhuma conta com extrato importado em {periodoLabel}. Importe um extrato (OFX/CSV) ou escolha outro período.
                  </div>
                ) : (
                  <>
                    {/* Rev. 3322 — MOVIMENTAÇÃO DO MÊS (entradas × saídas), somando todas as
                        contas com extrato. Crédito = entrada; débito = saída. Independe do
                        status de conciliação — é o quanto entrou e saiu no banco. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                      <button type="button" onClick={() => setPanoramaDrill("entradas")} title="Ver as entradas (créditos) do CAIXA REAL — sem movimentação interna" className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex items-center gap-3 text-left hover:bg-emerald-100/70 hover:border-emerald-300 transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-emerald-700 font-medium">Entradas (caixa real)</p>
                          <p className="text-xl font-bold text-emerald-700 truncate">{formatBRL(geralTotais?.valorEntradasExternas ?? 0)}</p>
                          <p className="text-[11px] text-emerald-600/80">{formatInt((geralTotais?.qtdEntradas ?? 0) - (geralTotais?.qtdEntradasInternas ?? 0))} crédito(s) externo(s)</p>
                        </div>
                        <Eye className="w-4 h-4 text-emerald-400 shrink-0 ml-auto" />
                      </button>
                      <button type="button" onClick={() => setPanoramaDrill("saidas")} title="Ver as saídas (débitos) do CAIXA REAL — sem movimentação interna" className="rounded-xl border border-red-200 bg-red-50/70 p-3 flex items-center gap-3 text-left hover:bg-red-100/70 hover:border-red-300 transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <ArrowUpCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-red-700 font-medium">Saídas (caixa real)</p>
                          <p className="text-xl font-bold text-red-600 truncate">{formatBRL(geralTotais?.valorSaidasExternas ?? 0)}</p>
                          <p className="text-[11px] text-red-600/80">{formatInt((geralTotais?.qtdSaidas ?? 0) - (geralTotais?.qtdSaidasInternas ?? 0))} débito(s) externo(s)</p>
                        </div>
                        <Eye className="w-4 h-4 text-red-400 shrink-0 ml-auto" />
                      </button>
                      <button type="button" onClick={() => setPanoramaDrill("saldo")} title="Ver o resumo do saldo (caixa real) por conta" className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center gap-3 text-left hover:bg-slate-100/70 hover:border-slate-300 transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <Landmark className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-slate-600 font-medium">Saldo do mês (caixa real)</p>
                          {(() => { const saldo = (geralTotais?.valorEntradasExternas ?? 0) - (geralTotais?.valorSaidasExternas ?? 0); return (
                            <p className={`text-xl font-bold truncate ${saldo >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatBRL(saldo)}</p>
                          ); })()}
                          <p className="text-[11px] text-slate-500">{formatInt(geralTotais?.contas ?? 0)} conta(s) com extrato</p>
                        </div>
                        <Eye className="w-4 h-4 text-slate-400 shrink-0 ml-auto" />
                      </button>
                      <button type="button" onClick={() => setPanoramaDrill("interno")} title="Ver a movimentação interna (transf. entre contas, aplicação/resgate, intra-FC)" className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 flex items-center gap-3 text-left hover:bg-indigo-100/70 hover:border-indigo-300 transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                          <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-indigo-700 font-medium">Movimentação interna</p>
                          <p className="text-xl font-bold text-indigo-700 truncate">{formatBRL((geralTotais?.valorEntradasInternas ?? 0) + (geralTotais?.valorSaidasInternas ?? 0))}</p>
                          <p className="text-[11px] text-indigo-600/80">{formatInt((geralTotais?.qtdEntradasInternas ?? 0) + (geralTotais?.qtdSaidasInternas ?? 0))} lançamento(s)</p>
                        </div>
                        <Eye className="w-4 h-4 text-indigo-400 shrink-0 ml-auto" />
                      </button>
                    </div>
                    {/* Rev. 3368 — atalho p/ o mapa da movimentação interna por contraparte. */}
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setShowMapaInterno(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100/60 transition-colors"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Ver mapa da movimentação interna por contraparte (Locnow, sócios, aplicação…)
                      </button>
                    </div>
                    {/* KPIs agregados da empresa no mês */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <button type="button" onClick={() => setPanoramaDrill("conciliados")} title="Ver as linhas já conciliadas do mês" className="rounded-xl border border-green-200 bg-green-50/60 p-3 text-left hover:bg-green-100/70 hover:border-green-300 transition-colors relative">
                        <Eye className="w-3.5 h-3.5 text-green-400 absolute top-2 right-2" />
                        <p className="text-[11px] text-green-700 font-medium">Conciliados</p>
                        <p className="text-lg font-bold text-green-700">{formatInt(geralTotais?.conciliados ?? 0)}</p>
                        <p className="text-[11px] text-green-600/80">{formatBRL(geralTotais?.valorConciliado ?? 0)}</p>
                      </button>
                      <button type="button" onClick={() => setPanoramaDrill("extratoSemLanc")} title="Ver as linhas do extrato ainda sem lançamento no ERP" className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-left hover:bg-rose-100/70 hover:border-rose-300 transition-colors relative">
                        <Eye className="w-3.5 h-3.5 text-rose-400 absolute top-2 right-2" />
                        <p className="text-[11px] text-rose-700 font-medium">No extrato, sem lançamento</p>
                        <p className="text-lg font-bold text-rose-700">{formatInt(geralTotais?.extratoSemLancamento ?? 0)}</p>
                        <p className="text-[11px] text-rose-600/80">{formatBRL(geralTotais?.valorExtratoSemLancamento ?? 0)}</p>
                      </button>
                      <button type="button" onClick={() => setPanoramaDrill("lancSemExtrato")} title="Ver os lançamentos do ERP ainda sem linha no extrato" className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-left hover:bg-amber-100/70 hover:border-amber-300 transition-colors relative">
                        <Eye className="w-3.5 h-3.5 text-amber-400 absolute top-2 right-2" />
                        <p className="text-[11px] text-amber-700 font-medium">No ERP, sem extrato</p>
                        <p className="text-lg font-bold text-amber-700">{formatInt(geralTotais?.lancamentosSemExtrato ?? 0)}</p>
                        <p className="text-[11px] text-amber-600/80">{formatBRL(geralTotais?.valorLancamentosSemExtrato ?? 0)}</p>
                      </button>
                      <button type="button" onClick={() => setPanoramaDrill("pct")} title="Ver o detalhamento do % conciliado por conta" className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-left hover:bg-blue-100/70 hover:border-blue-300 transition-colors relative">
                        <Eye className="w-3.5 h-3.5 text-blue-400 absolute top-2 right-2" />
                        <p className="text-[11px] text-blue-700 font-medium">% conciliado</p>
                        <p className="text-lg font-bold text-blue-700">{geralTotais?.pctConciliado ?? 0}%</p>
                        <p className="text-[11px] text-blue-600/80">{formatInt(geralTotais?.contas ?? 0)} conta(s) com extrato</p>
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-4">Como é calculado: <strong>Entradas/Saídas (caixa real)</strong> = créditos/débitos do extrato do mês que NÃO são movimentação interna (transferência entre contas da própria FC, varredura de aplicação/resgate, PIX/TED intra-FC), somando todas as contas (independe da conciliação). A <strong>Movimentação interna</strong> reúne esses lançamentos num card à parte — só conferência, não entram no caixa real. Os 4 cards de conciliação contam as linhas (em módulo) por situação. Cada conta abaixo mostra o giro total dela (externo + interno).</p>

                    {/* Rev. 3441 — OC / OS / Locação por mês */}
                    {ocsMesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4 px-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando OCs / OS…
                      </div>
                    ) : (ocsMesData?.meses ?? []).length > 0 ? (
                      <div className="mb-5">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-gray-600">
                            OC / OS / Locação por mês
                            <span className="ml-1.5 text-gray-400 font-normal">
                              {formatInt(ocsMesData?.qtdGeral ?? 0)} ordens · {formatBRL(ocsMesData?.totalGeral ?? 0)}
                            </span>
                          </p>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2"
                              onClick={() => setOcsMesExp(new Set((ocsMesData?.meses ?? []).map((m: any) => m.mes)))}>
                              Expandir todas
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2"
                              onClick={() => setOcsMesExp(new Set())}>
                              Recolher
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(ocsMesData?.meses ?? []).map((m: any) => {
                            const exp = ocsMesExp.has(m.mes);
                            const [anoM, mmM] = (m.mes as string).split("-");
                            const mesLabel = (() => { try { return new Date(Number(anoM), Number(mmM) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); } catch { return m.mes; } })();
                            return (
                              <div key={m.mes} className="rounded-xl border border-orange-200 bg-orange-50/40">
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-orange-50/80 transition-colors rounded-xl"
                                  onClick={() => setOcsMesExp(prev => { const n = new Set(prev); if (n.has(m.mes)) n.delete(m.mes); else n.add(m.mes); return n; })}
                                >
                                  {exp ? <ChevronUp className="w-4 h-4 text-orange-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-orange-400 shrink-0" />}
                                  <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-orange-900 capitalize">{mesLabel}</p>
                                    <p className="text-[11px] text-orange-700/70 flex flex-wrap gap-x-3">
                                      {m.qtdOc > 0 && <span>📦 {m.qtdOc} OC · {formatBRL(m.totalOc)}</span>}
                                      {m.qtdOs > 0 && <span>🔧 {m.qtdOs} OS · {formatBRL(m.totalOs)}</span>}
                                      {m.qtdLocacao > 0 && <span>🚛 {m.qtdLocacao} Loc. · {formatBRL(m.totalLocacao)}</span>}
                                    </p>
                                  </div>
                                  <p className="text-sm font-bold text-orange-800 shrink-0">{formatBRL(m.total)}</p>
                                </button>
                                {exp && (
                                  <div className="px-3 pb-3 space-y-1">
                                    {(m.itens as any[]).map((it) => {
                                      const tipoLabel = it.isLocacao ? "Loc." : it.tipo === "servico" ? "OS" : it.tipo === "pacote" ? "Pacote" : "OC";
                                      const tipoCls   = it.isLocacao ? "bg-blue-100 text-blue-700" : (it.tipo === "servico" || it.tipo === "pacote") ? "bg-purple-100 text-purple-700" : "bg-orange-100 text-orange-700";
                                      const stCls     = it.status === "entregue" || it.status === "entregue_parcial" ? "bg-green-100 text-green-700" : it.status === "emitida" || it.status === "aprovada" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600";
                                      return (
                                        <div key={it.id} className="flex items-center gap-2 rounded-lg border border-orange-100 bg-white px-3 py-2">
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${tipoCls}`}>{tipoLabel}</span>
                                          <p className="text-xs font-semibold text-gray-800 shrink-0">{it.numeroOc}</p>
                                          <p className="text-[11px] text-gray-500 truncate flex-1" title={it.fornecedorNome ?? ""}>{it.fornecedorNome || "—"}</p>
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${stCls}`}>{it.status}</span>
                                          <p className="text-xs font-bold text-gray-800 shrink-0">{formatBRL(Number(it.total))}</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Listas unificadas, agrupadas por conta (cada linha pertence à sua conta).
                        Conciliar manualmente AQUI no panorama: 1 linha do extrato + 1 lançamento,
                        sempre da MESMA conta, com confirmação. READ-ONLY até confirmar. */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-semibold text-gray-600">Conciliação por conta ({formatInt(geralContas.length)})</p>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setGeralContasExp(new Set(geralContas.map((c: any) => Number(c.contaBancariaId))))}>Expandir todas</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setGeralContasExp(new Set())}>Recolher todas</Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {geralContas.map((c: any) => {
                        const cor = bancoCor(c.contaBanco);
                        const t = c.totais ?? {};
                        const st = accStatusMap[Number(c.contaBancariaId)] ?? "vazio";
                        const isConsol = st === "consolidado";
                        const contaId = Number(c.contaBancariaId);
                        const exp = geralContasExp.has(contaId);
                        const concAberto = geralConcExp.has(contaId);
                        const cExt: any[] = (c.extratoSemLancamento ?? []).filter((r: any) => !r.reversal && !r.reversalResolveGrupo);
                        const cLan: any[] = c.lancamentosSemExtrato ?? [];
                        const cConc: any[] = c.conciliados ?? [];
                        const cDevol: any[] = c.chequesDevolvidos ?? [];
                        return (
                          <div key={c.contaBancariaId} className={`rounded-xl border ${isConsol ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white"}`}>
                            <div className="flex items-center gap-3 p-3">
                              <button type="button" onClick={() => setGeralContasExp((prev) => { const n = new Set(prev); if (n.has(contaId)) n.delete(contaId); else n.add(contaId); return n; })} className="shrink-0 p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50" title={exp ? "Recolher" : "Expandir"}>
                                {exp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${cor.bg}`}>
                                <Landmark className={`h-[18px] w-[18px] ${cor.text}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800 truncate">{c.contaLabel}</p>
                                <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>{formatInt(c.linhas)} linha(s) no extrato</span>
                                  <span className="text-emerald-600 font-semibold" title="Total de entradas (créditos) no extrato">▼ entradas {formatBRL(t.valorEntradas ?? 0)}</span>
                                  <span className="text-red-600 font-semibold" title="Total de saídas (débitos) no extrato">▲ saídas {formatBRL(t.valorSaidas ?? 0)}</span>
                                  {(() => { const saldo = (t.valorEntradas ?? 0) - (t.valorSaidas ?? 0); return <span className={`font-semibold ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`} title="Saldo do período (entradas − saídas)">{saldo >= 0 ? "=" : "="} saldo {formatBRL(saldo)}</span>; })()}
                                </p>
                              </div>
                              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700" title="Conciliados">{formatInt(t.conciliados ?? 0)} concil.</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700" title="No extrato, sem lançamento">{formatInt(t.extratoSemLancamento ?? 0)} extrato</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700" title="No ERP, sem extrato">{formatInt(t.lancamentosSemExtrato ?? 0)} ERP</span>
                              </div>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${isConsol ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                                {isConsol ? <><CheckCircle className="h-2.5 w-2.5" />Conciliado</> : <><AlertCircle className="h-2.5 w-2.5" />A conciliar</>}
                              </span>
                              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 shrink-0" onClick={() => setContaBancariaId(String(c.contaBancariaId))} title="Abrir a conta no modo conciliação completo">
                                Abrir conta <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                              </Button>
                            </div>

                            {exp && (
                              <div className="border-t border-gray-100 p-3 space-y-3">
                                <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                  <strong>Conciliar:</strong> escolha <strong>uma linha do extrato</strong> (esquerda) e o <strong>lançamento do ERP</strong> correspondente (direita) — sempre da MESMA conta. A barra azul no rodapé mostra os dois lados e o botão de confirmar.
                                </p>
                                <div className="grid md:grid-cols-2 gap-3">
                                  <div className="rounded-lg border border-rose-100 overflow-hidden">
                                    <div className="px-3 py-2 bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />No extrato, sem lançamento ({formatInt(cExt.length)})</div>
                                    <div className="divide-y max-h-80 overflow-auto">
                                      {cExt.length ? cExt.map((s: any) => renderExtratoRow(s)) : <div className="px-4 py-6 text-center text-xs text-gray-400">Nada pendente no extrato.</div>}
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-amber-100 overflow-hidden">
                                    <div className="px-3 py-2 bg-amber-50 text-amber-700 text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />No ERP, sem extrato ({formatInt(cLan.length)})</div>
                                    <div className="divide-y max-h-80 overflow-auto">
                                      {cLan.length ? cLan.map((e: any) => renderEntryRow(e)) : <div className="px-4 py-6 text-center text-xs text-gray-400">Nada pendente no ERP.</div>}
                                    </div>
                                  </div>
                                </div>

                                {cDevol.length > 0 && (
                                  <div className="rounded-lg border border-orange-100 overflow-hidden">
                                    <div className="px-3 py-2 bg-orange-50 text-orange-700 text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Cheques devolvidos ({formatInt(cDevol.length)})</div>
                                    <div className="divide-y max-h-48 overflow-auto bg-white">
                                      {cDevol.map((d: any, i: number) => {
                                        const res = d.resolucao ?? { tipo: "pendente" };
                                        const ident = [d.fornecedor, d.obraNome, d.nf ? `NF ${d.nf}` : ""].filter(Boolean).join(" · ");
                                        return (
                                          <div key={d.grupoId ?? d.id ?? i} className="px-3 py-2 text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="flex-1 min-w-0 truncate font-medium text-gray-800">
                                                Cheque {d.chequeNumero ? `nº ${d.chequeNumero}` : (d.doc ? `Doc ${d.doc}` : "—")}
                                                {d.motivoCodigo != null && (
                                                  <span className={`ml-1.5 px-1 py-px rounded-full text-[10px] font-medium ${d.motivoSustado ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} title={d.motivoTexto ?? ""}>
                                                    Mot. {d.motivoCodigo}{d.motivoTexto ? ` · ${d.motivoTexto}` : ""}
                                                  </span>
                                                )}
                                              </span>
                                              <span className="font-semibold shrink-0 text-rose-500">{formatBRL(Math.abs(Number(d.valor) || (d.valorCents ? d.valorCents / 100 : 0)))}</span>
                                            </div>
                                            {ident && <p className="text-[11px] text-gray-500 truncate">{ident}</p>}
                                            <p className="text-[10px] text-gray-400 truncate">
                                              Comp. {fmtData(d.dataDebito)} → devol. {fmtData(d.dataCredito)}
                                              {res.tipo === "reapresentado" ? " · ✓ reapresentado" : res.tipo === "pix" ? " · ✓ quitado (PIX/TED)" : " · ⚠ sem quitação"}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="rounded-lg border border-green-100 overflow-hidden">
                                  <button type="button" onClick={() => setGeralConcExp((prev) => { const n = new Set(prev); if (n.has(contaId)) n.delete(contaId); else n.add(contaId); return n; })} className="w-full px-3 py-2 bg-green-50 text-green-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-green-100">
                                    <CheckCircle className="w-3.5 h-3.5" />Já conciliados ({formatInt(cConc.length)}){concAberto ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                                  </button>
                                  {concAberto && (
                                    <div className="divide-y max-h-64 overflow-auto bg-white">
                                      {cConc.length ? cConc.map((cc: any, i: number) => (
                                        <div key={cc.id ?? i} className="flex items-center gap-2 px-3 py-2 text-xs">
                                          <span className="text-gray-400 shrink-0 w-16">{fmtData(cc.data)}</span>
                                          <span className="flex-1 min-w-0 truncate text-gray-700">{cc.entryFornecedor || cc.entryDescricao || cc.descricao || (cc.entryId ? `Lançamento #${cc.entryId}` : "—")}</span>
                                          <span className="font-semibold shrink-0 text-green-600">{formatBRL(Math.abs(Number(cc.valor) || 0))}</span>
                                        </div>
                                      )) : <div className="px-4 py-6 text-center text-xs text-gray-400">Nenhum conciliado ainda.</div>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* ── Totalizador de todas as contas ── */}
                      {geralContas.length > 1 && (() => {
                        const totEnt   = geralContas.reduce((s: number, c: any) => s + ((c.totais?.valorEntradas) ?? 0), 0);
                        const totSai   = geralContas.reduce((s: number, c: any) => s + ((c.totais?.valorSaidas)   ?? 0), 0);
                        const totSaldo = totEnt - totSai;
                        return (
                          <div className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <p className="text-xs font-bold text-gray-700 shrink-0">Total — {formatInt(geralContas.length)} contas</p>
                            <span className="text-emerald-700 text-xs font-semibold">▼ entradas {formatBRL(totEnt)}</span>
                            <span className="text-red-700 text-xs font-semibold">▲ saídas {formatBRL(totSai)}</span>
                            <span className={`text-xs font-bold ${totSaldo >= 0 ? "text-blue-700" : "text-orange-700"}`}>= saldo {formatBRL(totSaldo)}</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Lançamentos sem conta definida (company-wide, contado uma vez) */}
                    {geralSemConta.length > 0 && (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-gray-400" />
                          Lançamentos sem conta bancária definida ({formatInt(geralSemConta.length)})
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Não pertencem a nenhuma conta — clique numa linha para ver de onde veio o lançamento e definir a conta bancária.</p>
                        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-100 bg-white divide-y">
                          {geralSemConta.slice(0, 50).map((e: any) => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setDetalheEntryId(Number(e.id))}
                              title="Ver detalhes e a origem deste lançamento"
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-blue-50/60 focus-visible:bg-blue-50 transition-colors"
                            >
                              <span className="text-gray-400 shrink-0 w-16">{fmtData(e.data)}</span>
                              <span className="flex-1 min-w-0 truncate text-gray-700">{e.fornecedorNome || e.descricao || "—"}</span>
                              {e.ocNumero
                                ? <button type="button" onClick={(ev) => { ev.stopPropagation(); window.location.href = `/compras/ordens?destaque=${e.origemId}`; }} className="hidden sm:inline-flex shrink-0 items-center px-1.5 py-px rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors" title={`Abrir OC ${e.ocNumero}`}>🛒 {e.ocNumero}</button>
                                : e.origemModulo && <span className="hidden sm:inline-block shrink-0 px-1.5 py-px rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 truncate max-w-[120px]">{e.origemModulo}</span>
                              }
                              <span className={`font-semibold shrink-0 ${e.tipo === "receita" ? "text-emerald-600" : "text-rose-500"}`}>{formatBRL(Math.abs(Number(e.valor) || 0))}</span>
                              <Eye className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Rev. 3319 — Barra de conciliação do PANORAMA: 1 linha do extrato + 1 lançamento,
                sempre da MESMA conta. Abre o diálogo de confirmação (regra de ouro: nada
                concilia sem confirmação explícita). Resolve os dois lados nas listas unificadas. */}
            {(selectedStatement || selectedEntry) && (() => {
              const ext = geralExtAll.find((s: any) => s.id === selectedStatement);
              const lan = geralLanAll.find((e: any) => e.id === selectedEntry) || geralSemConta.find((e: any) => e.id === selectedEntry);
              if (!ext && !lan) return null;
              const contasDiferem = !!(ext && lan && lan.contaBancariaId != null && Number(ext.contaBancariaId) !== Number(lan.contaBancariaId));
              const delta = (ext && lan) ? Math.abs(Math.abs(Number(ext.valor) || 0) - Math.abs(Number(lan.valor) || 0)) : null;
              const podeConciliar = !!ext && !!lan && !contasDiferem && !conciliarMut.isPending && !conciliarGrupoMut.isPending;
              return (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 py-3">
                  <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[11px] text-gray-400">Extrato</p>
                      {ext ? (
                        <p className="text-sm font-medium text-gray-700 truncate">{fmtData(ext.data)} · {ext.descricao || "—"} · <span className="font-bold">{formatBRL(Math.abs(Number(ext.valor) || 0))}</span> <span className="text-[11px] text-gray-400">({ext.contaLabel})</span></p>
                      ) : <p className="text-sm text-gray-400">Selecione uma linha do extrato</p>}
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[11px] text-gray-400">Lançamento (ERP)</p>
                      {lan ? (
                        <p className="text-sm font-medium text-gray-700 truncate">{fmtData(lan.data)} · {lan.fornecedorNome || lan.descricao || "—"} · <span className="font-bold">{formatBRL(Math.abs(Number(lan.valor) || 0))}</span>{lan.contaLabel ? <span className="text-[11px] text-gray-400"> ({lan.contaLabel})</span> : null}</p>
                      ) : <p className="text-sm text-gray-400">Selecione um lançamento</p>}
                    </div>
                    {delta != null && (
                      <div className="shrink-0 text-center">
                        <p className="text-[11px] text-gray-400">Δ</p>
                        <p className={`text-sm font-bold ${delta === 0 ? "text-green-600" : "text-amber-600"}`}>{formatBRL(delta)}</p>
                      </div>
                    )}
                    {contasDiferem && (
                      <span className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 shrink-0">Contas diferentes — não dá pra conciliar.</span>
                    )}
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white shrink-0" disabled={!podeConciliar} onClick={() => { if (ext && lan) setConfirmGeralConciliar({ ext, lan }); }}>
                      <CheckCircle className="w-4 h-4 mr-1.5" />Conciliar
                    </Button>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setSelectedStatement(null); setSelectedEntry(null); }}><X className="w-4 h-4" /></Button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : contaSelecionadaCaixaInterno ? (
          /* ══════════════════════════════════════════════════════════════
             Rev. 3398 — MODO CAIXA INTERNO
             Conta sem extrato bancário (dinheiro, cheques de terceiros,
             pagamentos informais). Nenhum OFX/CSV para importar.
             O usuário registra entradas/saídas normalmente via
             "Novo lançamento" e confirma cada uma manualmente.
             ══════════════════════════════════════════════════════════════ */
          <div className="space-y-4">
            {/* Banner explicativo */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <Wallet className="h-6 w-6 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-violet-800 mb-1">Conta Caixa Interno — sem extrato bancário</p>
                <p className="text-sm text-violet-700 leading-relaxed">
                  Esta conta controla movimentações que <strong>não passam pelo banco</strong>: dinheiro, cheques de clientes, pagamentos informais etc.
                  Registre os lançamentos normalmente pelo botão <strong>"Novo lançamento"</strong> e clique em <strong>"Confirmar"</strong> em cada um que você já verificou fisicamente.
                </p>
              </div>
              <Button size="sm" className="shrink-0 h-9 bg-violet-600 hover:bg-violet-700" onClick={abrirLancStandalone}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />Novo lançamento
              </Button>
            </div>

            {/* KPIs do período */}
            {!caixaLoading && !caixaIsError && caixaData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1"><ArrowDownCircle className="w-3.5 h-3.5" /> Entradas</p>
                  <p className="text-xl font-bold text-emerald-700">{formatBRL(caixaData.totalEntradas ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                  <p className="text-[11px] text-red-700 font-medium flex items-center gap-1"><ArrowUpCircle className="w-3.5 h-3.5" /> Saídas</p>
                  <p className="text-xl font-bold text-red-600">{formatBRL(caixaData.totalSaidas ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1"><CircleDot className="w-3.5 h-3.5" /> A confirmar</p>
                  <p className="text-xl font-bold text-amber-700">{(caixaData.aConfirmar ?? []).length}</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50/60 p-4">
                  <p className="text-[11px] text-green-700 font-medium flex items-center gap-1"><CircleCheck className="w-3.5 h-3.5" /> Confirmadas</p>
                  <p className="text-xl font-bold text-green-700">{(caixaData.confirmadas ?? []).length}</p>
                </div>
              </div>
            )}

            {/* Loading / Error */}
            {caixaLoading && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Carregando lançamentos do caixa...
                </CardContent>
              </Card>
            )}
            {caixaIsError && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
                  <p className="text-sm text-red-700 font-medium">Não foi possível carregar os lançamentos.</p>
                  <p className="text-xs text-gray-500 mt-1">{(caixaError as any)?.message || "Tente novamente."}</p>
                  <Button size="sm" variant="outline" onClick={() => refetchCaixa()} className="mt-3 border-red-300 text-red-700 hover:bg-red-100">Tentar de novo</Button>
                </CardContent>
              </Card>
            )}

            {/* ── A CONFIRMAR ── */}
            {!caixaLoading && caixaData && (
              <>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-100 bg-amber-50/60 rounded-t-xl">
                      <CircleDot className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">A confirmar</span>
                      <span className="ml-auto text-xs text-amber-600 bg-amber-100 rounded-full px-2 py-0.5 font-medium">{(caixaData.aConfirmar ?? []).length} lançamento(s)</span>
                    </div>
                    {(caixaData.aConfirmar ?? []).length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">
                        <CircleCheck className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                        Tudo confirmado! Nenhum lançamento pendente no período.
                      </div>
                    ) : (
                      <div className="divide-y divide-amber-50">
                        {(caixaData.aConfirmar ?? []).map((e: any) => {
                          const isReceita = e.tipo === "receita";
                          const valor = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto) || 0);
                          const nome = e.fornecedorNome || e.clienteNome || e.descricao || `Lançamento #${e.id}`;
                          return (
                            <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/40 transition-colors">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isReceita ? "bg-emerald-100" : "bg-red-100"}`}>
                                {isReceita ? <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> : <ArrowUpCircle className="h-4 w-4 text-red-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{nome}</p>
                                <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                                  <span>{e.dataCompetencia ? String(e.dataCompetencia).slice(0,10).split("-").reverse().join("/") : "—"}</span>
                                  {e.obraNome && <span className="text-gray-500">· {e.obraNome}</span>}
                                  <span className={`font-medium ${e.status === "pago" || e.status === "recebido" ? "text-emerald-600" : "text-amber-600"}`}>· {e.status}</span>
                                </p>
                              </div>
                              <span className={`text-sm font-bold ${isReceita ? "text-emerald-700" : "text-red-600"}`}>
                                {isReceita ? "+" : "-"}{formatBRL(valor)}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-emerald-400 text-emerald-700 hover:bg-emerald-50 shrink-0"
                                disabled={confirmarEntradaMut.isPending}
                                onClick={() => confirmarEntradaMut.mutate({ companyId, entryId: e.id })}
                              >
                                <Check className="w-3.5 h-3.5 mr-1" />Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-red-500 hover:bg-red-50 shrink-0"
                                title="Excluir lançamento"
                                disabled={deleteEntryMut.isPending}
                                onClick={() => { setDeleteEntryMotivo(""); setDeleteEntryTarget({ id: e.id, nome, valor, status: e.status }); }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── CONFIRMADAS ── */}
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-green-100 bg-green-50/60 rounded-t-xl">
                      <CircleCheck className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-800">Confirmadas</span>
                      <span className="ml-auto text-xs text-green-600 bg-green-100 rounded-full px-2 py-0.5 font-medium">{(caixaData.confirmadas ?? []).length} lançamento(s)</span>
                    </div>
                    {(caixaData.confirmadas ?? []).length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">Nenhum lançamento confirmado neste período.</div>
                    ) : (
                      <div className="divide-y divide-green-50">
                        {(caixaData.confirmadas ?? []).map((e: any) => {
                          const isReceita = e.tipo === "receita";
                          const valor = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto) || 0);
                          const nome = e.fornecedorNome || e.clienteNome || e.descricao || `Lançamento #${e.id}`;
                          return (
                            <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-green-50/40 transition-colors">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isReceita ? "bg-emerald-100" : "bg-red-100"}`}>
                                {isReceita ? <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> : <ArrowUpCircle className="h-4 w-4 text-red-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{nome}</p>
                                <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                                  <span>{e.dataCompetencia ? String(e.dataCompetencia).slice(0,10).split("-").reverse().join("/") : "—"}</span>
                                  {e.obraNome && <span className="text-gray-500">· {e.obraNome}</span>}
                                  <CircleCheck className="w-3 h-3 text-green-500" /><span className="text-green-600 font-medium">confirmado</span>
                                </p>
                              </div>
                              <span className={`text-sm font-bold ${isReceita ? "text-emerald-700" : "text-red-600"}`}>
                                {isReceita ? "+" : "-"}{formatBRL(valor)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-amber-600 hover:bg-amber-50 shrink-0"
                                title="Desfazer confirmação"
                                disabled={desconciliarEntradaMut.isPending}
                                onClick={() => desconciliarEntradaMut.mutate({ companyId, entryId: e.id })}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-red-500 hover:bg-red-50 shrink-0"
                                title="Excluir lançamento"
                                disabled={deleteEntryMut.isPending}
                                onClick={() => { setDeleteEntryMotivo(""); setDeleteEntryTarget({ id: e.id, nome, valor, status: e.status }); }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Rev. 3445 — Sem conta bancária definida: aparece no Caixa Interno também.
                Ao confirmar, vincula o lançamento a esta conta e marca conciliado=1. */}
            {repSemConta.length > 0 && (
              <Card className="border-0 shadow-sm ring-1 ring-amber-100 bg-amber-50/20">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-100">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-sm font-semibold text-gray-700">
                      Sem conta bancária definida ({repSemConta.length}) · {formatBRL(vSemConta)}
                    </span>
                    <span className="text-[11px] text-gray-400 ml-1">— confirmar vincula à conta atual</span>
                  </div>
                  <div className="divide-y divide-amber-50 max-h-72 overflow-y-auto">
                    {repSemConta.map((e: any) => {
                      const isReceita = e.tipo === "receita";
                      const valor = Math.abs(Number(e.valor) || 0);
                      const nome = e.fornecedorNome || e.descricao || `Lançamento #${e.id}`;
                      return (
                        <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/40 transition-colors">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isReceita ? "bg-emerald-100" : "bg-red-100"}`}>
                            {isReceita ? <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> : <ArrowUpCircle className="h-4 w-4 text-red-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate" title={nome}>{nome}</p>
                            <p className="text-xs text-gray-400">
                              {e.data ? String(e.data).slice(0,10).split("-").reverse().join("/") : "—"}
                              {e.obraNome && <span className="text-gray-500"> · {e.obraNome}</span>}
                            </p>
                          </div>
                          <span className={`text-sm font-bold shrink-0 ${isReceita ? "text-emerald-700" : "text-red-600"}`}>
                            {isReceita ? "+" : "-"}{formatBRL(valor)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50 text-xs gap-1"
                            disabled={confirmarEntradaMut.isPending}
                            onClick={() => confirmarEntradaMut.mutate({
                              companyId,
                              entryId: e.id,
                              contaBancariaId: parseInt(contaBancariaId),
                            })}
                          >
                            <CircleCheck className="w-3.5 h-3.5" />Confirmar
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <>
            {/* Rev. 3216 — Demonstrativos consolidados (1 PDF de TODOS os PIX + 1 de TODOS os
                boletos) por conta+mês. Consulta de apoio: o extrato só mostra "PIX valor X". */}
            <Card className="border-0 shadow-sm ring-1 ring-indigo-100 bg-indigo-50/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-3">
                  <FileText className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Demonstrativos de pagamento (apoio à identificação)</p>
                    <p className="text-xs text-gray-500">Anexe <strong>um ou vários PDFs</strong> com os <strong>PIX</strong> e os <strong>boletos pagos</strong> do mês (pode subir todos de uma vez). Servem só de consulta pra identificar quem recebeu — o extrato mostra apenas "PIX valor X".</p>
                  </div>
                </div>
                {modoData !== "mes" || mesSel == null ? (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Selecione um mês (modo "Mês", acima) para anexar os demonstrativos — eles são por mês.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { kind: "pix" as const, label: "Comprovantes de PIX", arquivos: (demoQuery.data?.pixArquivos || []) as { url: string; nome: string | null }[], extraido: demoQuery.data?.pixExtraido, lidoEm: demoQuery.data?.pixLidoEm },
                      { kind: "boleto" as const, label: "Comprovantes de Boletos", arquivos: (demoQuery.data?.boletoArquivos || []) as { url: string; nome: string | null }[], extraido: demoQuery.data?.boletoExtraido, lidoEm: demoQuery.data?.boletoLidoEm },
                    ]).map((slot) => (
                      <div key={slot.kind} className="rounded-lg border border-indigo-200 bg-white p-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">{slot.label} <span className="text-gray-400">· {MESES[mesSel - 1]}/{ano}</span></p>
                        {demoProg?.kind === slot.kind ? (
                          /* Rev. 3236 — barra de progresso REAL (0→100%) com rótulo detalhado */
                          <div className="py-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-violet-700"><Loader2 className="w-3.5 h-3.5 animate-spin" />{demoProg.label}</span>
                              <span className="text-xs font-semibold tabular-nums text-violet-700">{demoProg.pct}%</span>
                            </div>
                            <Progress value={demoProg.pct} className="h-2" />
                          </div>
                        ) : (
                          <>
                            {slot.arquivos.length > 0 && (
                              <div className="space-y-1.5 mb-2.5">
                                {slot.arquivos.map((f, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="text-xs text-gray-700 truncate flex-1 min-w-[60px]" title={f.nome || "documento.pdf"}>{f.nome || "documento.pdf"}</span>
                                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline">Abrir</a>
                                    <button type="button" onClick={() => removerDemo(slot.kind, idx)} className="text-xs font-medium text-red-500 hover:text-red-700">Remover</button>
                                  </div>
                                ))}
                                <p className="text-[11px] text-gray-400">{formatInt(slot.arquivos.length)} arquivo(s) anexado(s)</p>
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button size="sm" variant="outline" onClick={() => pedirDemo(slot.kind)} disabled={demoProg !== null} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 h-8">
                                <Upload className="w-3.5 h-3.5 mr-1.5" />{slot.arquivos.length > 0 ? "Anexar mais PDFs" : "Anexar PDF(s)"}
                              </Button>
                              {slot.arquivos.length > 0 && (
                                <Button size="sm" onClick={() => lerDemoIA(slot.kind)} disabled={demoProg !== null} className="bg-violet-600 hover:bg-violet-700 text-white h-8">
                                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />{Array.isArray(slot.extraido) ? "Reler com IA" : "Ler com IA"}
                                </Button>
                              )}
                            </div>
                            {Array.isArray(slot.extraido) && (
                              <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-[11px] text-gray-400">Lido por IA{slot.lidoEm ? ` em ${fmtData(slot.lidoEm)}` : ""} · {formatInt(slot.extraido.length)} pagamento(s) · {formatBRL(slot.extraido.reduce((s: number, it: any) => s + (Number(it?.valor) || 0), 0))}</p>
                                <button type="button" onClick={() => abrirLeituraFull(slot.kind)} className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 hover:underline">
                                  <Maximize2 className="w-3 h-3" />Ver em tela cheia
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <input ref={demoInputRef} type="file" accept="application/pdf,.pdf" multiple onChange={onDemoFile} className="hidden" />
              </CardContent>
            </Card>

            {/* Rev. 3228 — Lista INLINE "Tudo que a IA leu" (metodologia do extrato): lista
                combinada PIX + boletos logo abaixo dos anexos, com cards de total geral/PIX/
                boletos (reagem ao filtro+busca), chips de tipo e busca livre. Sem modal. */}
            {modoData === "mes" && mesSel != null && leituraIA.temDados && (() => {
              const { porFiltro, lista, pixVis, bolVis, somaPix, somaBol, total, termo, chips, todos } = leituraIA;
              return (
                <Card className="border-0 shadow-sm ring-1 ring-violet-100">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setLeituraMinimizada(v => !v)}
                        className="flex items-start gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                      >
                        <Sparkles className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                            Tudo que a IA leu nos demonstrativos
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${leituraMinimizada ? "-rotate-90" : ""}`} />
                          </p>
                          {leituraMinimizada
                            ? <p className="text-xs text-gray-400">{lista.length} pagamentos · {formatBRL(total)}</p>
                            : <p className="text-xs text-gray-500">Lista de TODOS os pagamentos identificados nos PDFs anexados — só consulta, não concilia nada automaticamente.</p>
                          }
                        </div>
                      </button>
                      <Button size="sm" variant="outline" onClick={() => abrirLeituraFull(demoFiltro)} className="border-violet-200 text-violet-700 hover:bg-violet-50 h-8 shrink-0">
                        <Maximize2 className="w-3.5 h-3.5 mr-1.5" />Tela cheia
                      </Button>
                    </div>
                    {!leituraMinimizada && <>
                    {/* Cards de total (metodologia do extrato) — reagem ao filtro + busca */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0"><Landmark className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-violet-700/80 font-medium">Total geral · {formatInt(lista.length)}</p>
                          <p className="text-lg font-bold text-violet-700 truncate">{formatBRL(total)}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-emerald-700/80 font-medium">PIX · {formatInt(pixVis.length)}</p>
                          <p className="text-lg font-bold text-emerald-700 truncate">{formatBRL(somaPix)}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-blue-700/80 font-medium">Boletos · {formatInt(bolVis.length)}</p>
                          <p className="text-lg font-bold text-blue-700 truncate">{formatBRL(somaBol)}</p>
                        </div>
                      </div>
                    </div>
                    {/* Chips de tipo + busca livre */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {chips.map((c) => (
                        <button key={c.key} type="button" onClick={() => setDemoFiltro(c.key)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${demoFiltro === c.key ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                          {c.label}
                        </button>
                      ))}
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <Input value={buscaLeitura} onChange={(e) => setBuscaLeitura(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, valor, data…" className="pl-8 h-9" />
                        {buscaLeitura && <button type="button" onClick={() => setBuscaLeitura("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    {/* Lista (igual ao extrato/erp) */}
                    <div className="overflow-auto max-h-[460px] border border-gray-100 rounded-lg">
                      {lista.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-10">{todos.length === 0 ? "A IA não encontrou pagamentos nos PDFs." : "Nenhum pagamento corresponde ao filtro/busca."}</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 z-10">
                            <tr>
                              <th className="text-left font-medium px-2 py-2">Tipo</th>
                              <th className="text-left font-medium px-2 py-2">Beneficiário</th>
                              <th className="text-left font-medium px-2 py-2">CPF/CNPJ</th>
                              <th className="text-left font-medium px-2 py-2">Data</th>
                              <th className="text-left font-medium px-2 py-2">ID transação</th>
                              <th className="text-right font-medium px-2 py-2">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lista.map((it, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-2 py-2">
                                  <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${it._tipo === "pix" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{it._tipo === "pix" ? "PIX" : "Boleto"}</span>
                                </td>
                                <td className="px-2 py-2 text-gray-800">{it?.beneficiario || <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-gray-600 tabular-nums">{it?.documento || <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-gray-600 tabular-nums whitespace-nowrap">{it?.data ? fmtData(it.data) : <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-gray-500 text-xs max-w-[160px] truncate" title={it?.txid || ""}>{it?.txid || <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{it?.valor != null ? formatBRL(Number(it.valor)) : <span className="text-gray-400">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">Mostrando {formatInt(lista.length)} de {formatInt(porFiltro.length)}{termo ? ` (filtro "${buscaLeitura.trim()}")` : ""} · A leitura por IA é uma ajuda para identificar quem recebeu — confira sempre no PDF original. Não concilia nada automaticamente.</p>
                    </>}
                  </CardContent>
                </Card>
              );
            })()}
            {/* Rev. 3187 — Estado de ERRO do relatório: sem isso a tela parecia "vazia/zerada"
                quando getConciliacaoReport falhava (falso "tudo conciliado"). */}
            {reportIsError && (
              <Card className="border-0 shadow-sm ring-1 ring-red-200 bg-red-50/60">
                <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Não foi possível carregar a conciliação</p>
                      <p className="text-xs text-red-700 mt-0.5">{_msgErroConc(reportError?.message)}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetchReport()} className="border-red-300 text-red-700 hover:bg-red-100">
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Tentar novamente
                  </Button>
                </CardContent>
              </Card>
            )}
            {/* Rev. 3478 — Banner de dados desatualizados: aparece após qualquer ação de
                conciliação/lançamento; some ao clicar "Atualizar" ou ao carregar o relatório. */}
            {reportStale && !reportLoading && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <span className="flex items-center gap-1.5 text-sm text-amber-800">
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  Relatório desatualizado — ações realizadas ainda não estão refletidas nos totais.
                </span>
                <Button size="sm" variant="outline" onClick={atualizarRelatorio} className="h-7 shrink-0 text-xs border-amber-400 text-amber-900 hover:bg-amber-100">
                  Atualizar
                </Button>
              </div>
            )}
            {reportLoading && (
              <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando relatório…
              </div>
            )}
            {/* Rev. 3187 — Progresso da conciliação + KPIs (fonte única getConciliacaoReport). */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-end justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Progresso da conciliação · {periodoLabel}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {pctConc}<span className="text-base font-semibold text-gray-400">%</span>
                      {" "}<span className="text-sm font-medium text-gray-500">conciliado</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <span className="font-semibold text-blue-700">{formatInt(repConc.length)}</span> de {formatInt(totLinhas)} linha(s) do extrato
                  </div>
                </div>
                {/* Barra de progresso larga com marcadores 0–25–50–75–100 */}
                <div className="space-y-1">
                  <div className="relative h-6 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${pctConc >= 100 ? "bg-gradient-to-r from-green-400 to-green-500" : "bg-gradient-to-r from-blue-500 to-blue-600"}`}
                      style={{ width: `${pctConc}%` }}
                    />
                    {/* rótulo flutuante dentro da barra */}
                    {pctConc > 8 && (
                      <span className="absolute left-3 top-0 h-full flex items-center text-xs font-bold text-white drop-shadow-sm">
                        {pctConc}%
                      </span>
                    )}
                    {pctConc <= 8 && (
                      <span className="absolute left-2 top-0 h-full flex items-center text-xs font-semibold text-gray-400">
                        {pctConc}%
                      </span>
                    )}
                  </div>
                  {/* marcadores 0 / 25 / 50 / 75 / 100 */}
                  <div className="flex justify-between text-[10px] text-gray-400 px-0.5 select-none">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span className={pctConc >= 100 ? "text-green-600 font-semibold" : ""}>100%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-blue-700"><CheckCircle className="w-3.5 h-3.5" />Conciliado</div>
                    <p className="text-lg font-bold text-blue-700 mt-0.5">{formatInt(repConc.length)}</p>
                    <p className="text-[11px] text-gray-500">{formatBRL(vConc)}</p>
                  </div>
                  <div className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="w-3.5 h-3.5" />Extrato sem lançamento</div>
                    <p className="text-lg font-bold text-red-600 mt-0.5">{formatInt(repExt.length)}</p>
                    <p className="text-[11px] text-gray-500">{formatBRL(vExt)}</p>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-amber-700"><FileText className="w-3.5 h-3.5" />ERP sem extrato</div>
                    <p className="text-lg font-bold text-amber-700 mt-0.5">{formatInt(repLan.length)}</p>
                    <p className="text-[11px] text-gray-500">{formatBRL(vLan)}</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-violet-700"><Sparkles className="w-3.5 h-3.5" />Sugestões prontas</div>
                    <p className="text-lg font-bold text-violet-700 mt-0.5">{sugLoading ? "…" : formatInt(sugestoes.length)}</p>
                    <p className="text-[11px] text-gray-500">{formatInt(semMatch.length)} sem par</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {sugFull && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSugFull(false)} aria-hidden />}
            <Card role={sugFull ? "dialog" : undefined} aria-modal={sugFull ? true : undefined} aria-label={sugFull ? "Sugestões automáticas de conciliação (tela cheia)" : undefined} className={`border-0 shadow-sm ${sugFull ? "fixed inset-3 z-50 flex flex-col overflow-auto bg-white shadow-2xl rounded-lg" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Sugestões Automáticas de Conciliação
                  </CardTitle>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-500">Tolerância (dias)</Label>
                      {/* Rev. 3189 — native <select>: o dropdown é ancorado pelo browser logo
                          abaixo do campo (o Radix Select caía em modo item-aligned e abria no
                          meio da tela). */}
                      <select
                        value={String(toleranciaDias)}
                        onChange={e => setToleranciaDias(parseInt(e.target.value, 10))}
                        className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {tolOptions.map(d => (
                          <option key={d} value={String(d)}>
                            {d === diasDoMes && modoData === "mes" && mesSel != null ? `${d} (mês)` : d}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant={mostrarSugestoes ? "outline" : "default"}
                        onClick={() => { setMostrarSugestoes(true); setSelSug(new Set()); setConciliadosIds(new Set()); setSugDescartadas(new Set()); if (mostrarSugestoes) refetchSug(); }}
                        disabled={sugLoading}
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        {sugLoading ? "Analisando..." : mostrarSugestoes ? "Reanalisar" : "Sugerir conciliação"}
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-600 text-blue-700 hover:bg-blue-50"
                      onClick={gerarRelatorioPDF}
                      disabled={!report}
                    >
                      <FileText className="w-4 h-4 mr-1" />Relatório PDF
                    </Button>
                    <Button
                      size="sm"
                      variant={sugFull ? "default" : "outline"}
                      onClick={() => setSugFull(v => !v)}
                      disabled={!mostrarSugestoes || sugLoading}
                      title={sugFull ? "Recolher o painel" : "Expandir em tela cheia para analisar melhor"}
                    >
                      {sugFull ? <Minimize2 className="w-4 h-4 mr-1" /> : <Maximize2 className="w-4 h-4 mr-1" />}
                      {sugFull ? "Recolher" : "Expandir"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {mostrarSugestoes && (
                <CardContent className={`pt-0 ${sugFull ? "flex-1 min-h-0 flex flex-col" : ""}`}>
                  {sugLoading ? (
                    <div className="py-6 space-y-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-600 flex items-center gap-2 min-w-0">
                          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-500" />
                          <span className="truncate">Cruzando extrato × lançamentos por valor, direção e data…</span>
                        </span>
                        <span className="font-semibold tabular-nums text-amber-600 shrink-0">{sugProgress}%</span>
                      </div>
                      <Progress value={sugProgress} className="h-2" />
                    </div>
                  ) : sugestoes.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Nenhuma sugestão automática para a conta/período selecionados.
                      {sugData ? ` (${formatInt(sugData.totalLinhas ?? 0)} linha(s) de extrato analisada(s))` : ""}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <Button size="sm" variant="outline" onClick={selecionarAlta}>Selecionar alta confiança</Button>
                        <Button size="sm" variant="outline" onClick={selecionarTodas}>Selecionar todas</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelSug(new Set())}>Limpar</Button>
                        <Button size="sm" variant="outline" onClick={relerComprovantes} disabled={relerBusy} title="Lê por IA os comprovantes anexados (beneficiário/CNPJ/ID) p/ identificar melhor as sugestões">
                          {relerBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                          {relerBusy ? `Lendo${relerInfo ? ` (${formatInt(relerInfo.feitos)}, faltam ${formatInt(relerInfo.restantes)})` : "..."}` : "Reler comprovantes (IA)"}
                        </Button>
                        {/* Rev. 3454 — botão IA com cache persistente */}
                        {Object.keys(batchAiResults).length > 0 && !batchAiLoading ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowBatchReport(true)}
                              className="border-violet-400 text-violet-700 hover:bg-violet-50"
                              title={batchAiFromCache && batchAiCachedAt ? `Análise salva em ${new Date(batchAiCachedAt).toLocaleString("pt-BR")}` : "Relatório da análise IA"}
                            >
                              <Sparkles className="w-4 h-4 mr-1" />
                              {`Relatório IA (${Object.values(batchAiResults).filter((r: any) => r.sugestoes.length > 0).length} divergências)`}
                              {batchAiFromCache && <span className="ml-1 text-[10px] bg-violet-100 text-violet-600 px-1 rounded">cache</span>}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => analisarTodas(true)}
                              disabled={!sugestoes.length}
                              title="Descarta o cache e re-executa a análise com IA"
                              className="text-slate-500 hover:text-violet-700 px-2"
                            >
                              Reanalisar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={batchAiLoading ? undefined : analisarTodas}
                            disabled={batchAiLoading || !sugestoes.length}
                            title="Analisa TODAS as sugestões de uma só vez e gera relatório de divergências de classificação"
                          >
                            {batchAiLoading
                              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />{`Analisando (${batchAiProgress?.done ?? 0}/${batchAiProgress?.total ?? 0})…`}</>
                              : <><Sparkles className="w-4 h-4 mr-1" />Analisar todas com IA</>}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="ml-auto"
                          onClick={conciliarSelecionadas}
                          disabled={conciliarSugMut.isPending || selSug.size === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {conciliarSugMut.isPending ? "Conciliando..." : `Conciliar selecionadas (${selSug.size})`}
                        </Button>
                      </div>
                      <div className={`border rounded-md overflow-y-auto ${sugFull ? "max-h-[calc(100vh-220px)]" : "max-h-[480px]"}`}>
                        {/* Cabeçalho fixo: deixa explícito qual coluna é o EXTRATO (banco) e qual é o LANÇAMENTO no ERP. */}
                        <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-2 bg-gray-100 border-b text-xs font-semibold uppercase tracking-wide text-gray-700">
                          <span className="w-4 shrink-0" aria-hidden />
                          <div className="flex-1 min-w-0">Extrato <span className="font-normal normal-case text-gray-400">(banco)</span></div>
                          <span className="w-4 shrink-0" aria-hidden />
                          <div className="flex-1 min-w-0 text-blue-700">Lançamento no ERP</div>
                          <span className="w-16 shrink-0 text-right text-gray-400 font-normal normal-case">Confiança</span>
                        </div>
                        <div className="divide-y">
                        {sugestoes.map(s => (
                          <Fragment key={s.statementLineId}>
                            <label className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                              <Checkbox checked={selSug.has(s.statementLineId)} onCheckedChange={() => toggleSug(s.statementLineId)} />
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirDetalheSug(s); }}
                                title="Ver detalhes e conferir a conciliação"
                                className="flex-1 min-w-0 text-left rounded-md -m-1 p-1 hover:bg-gray-100 transition-colors group/ext"
                              >
                                <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                  Extrato <Eye className="w-3 h-3 text-gray-400 opacity-0 group-hover/ext:opacity-100 transition-opacity" />
                                </div>
                                <div className="text-sm font-medium truncate group-hover/ext:underline">{s.extratoDescricao || "—"}</div>
                                <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                                {s.chequeFornecedor && (
                                  <div className="text-[11px] text-emerald-700 truncate" title={`Cheque nº ${s.chequeNumero} — ${s.chequeFornecedor}`}>
                                    🪙 Cheque nº {s.chequeNumero} · {s.chequeFornecedor}
                                  </div>
                                )}
                              </button>
                              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                              {/* Rev. 3410 — lançamento com suporte a troca manual */}
                              <div className="flex-1 min-w-0">
                                {(() => {
                                  const ov = overrideSug[s.statementLineId];
                                  return (
                                    <>
                                      <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                        Lançamento
                                        {ov && <span className="ml-1 px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700">MANUAL</span>}
                                      </div>
                                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!ov) abrirDetalheSug(s); }} className="text-left w-full group/lan">
                                        {(() => {
                                          const title = ov ? (ov.fornecedorNome || ov.descricao || "—") : (s.entryFornecedor || s.entryDescricao || "—");
                                          const subDesc = ov
                                            ? (ov.fornecedorNome && ov.descricao ? ov.descricao : null)
                                            : (s.entryFornecedor && s.entryDescricao ? s.entryDescricao : null);
                                          return (
                                            <>
                                              <div className={`text-sm font-medium truncate group-hover/lan:underline ${ov ? "text-amber-700" : "text-blue-700"}`}>{title}</div>
                                              {subDesc && <div className="text-[11px] text-gray-400 truncate">{subDesc}</div>}
                                            </>
                                          );
                                        })()}
                                        <div className="text-xs text-gray-500 truncate">
                                          {ov
                                            ? `${fmtData(ov.data)} · ${formatBRL(Math.abs(ov.valor))}${ov.obraNome ? ` · ${ov.obraNome}` : ""}`
                                            : `${fmtData(s.entryData)} · ${formatBRL(Math.abs(s.entryValor))}${s.entryObra ? ` · ${s.entryObra}` : ""}`}
                                        </div>
                                      </button>
                                      <div className="flex items-center gap-1 mt-1">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTrocandoLine({ statementLineId: s.statementLineId, extratoDescricao: s.extratoDescricao || "", extratoValor: Math.abs(Number(s.extratoValor ?? 0)) }); setBuscaTroca(""); }}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
                                          title="Trocar lançamento vinculado"
                                        >
                                          <ArrowLeftRight className="w-2.5 h-2.5" /> trocar
                                        </button>
                                        {/* Rev. 3464 — editar o cadastro do lançamento ERP diretamente da sugestão */}
                                        <button
                                          type="button"
                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); const eid = ov?.entryId ?? s.entryId; if (eid) { setDetalheEntryId(Number(eid)); setPendingEditMode(true); } }}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-colors"
                                          title="Editar dados do lançamento (categoria, fornecedor, obra…)"
                                        >
                                          <Pencil className="w-2.5 h-2.5" /> editar
                                        </button>
                                        {ov && (
                                          <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOverrideSug(prev => { const n = { ...prev }; delete n[s.statementLineId]; return n; }); }}
                                            className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium text-red-400 hover:text-red-600 transition-colors"
                                            title="Desfazer troca"
                                          >
                                            <X className="w-2.5 h-2.5" /> desfazer
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {/* Rev. 3405 — score numérico de confiança */}
                                <span className={`inline-flex items-center justify-center min-w-[2.8rem] px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                                  (s.scoreConfianca ?? (s.confianca === "alta" ? 85 : 60)) >= 80
                                    ? "bg-blue-100 text-blue-700"
                                    : (s.scoreConfianca ?? 60) >= 60
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-gray-100 text-gray-500"
                                }`} title={`Confiança: ${s.scoreConfianca ?? (s.confianca === "alta" ? 85 : 60)}%`}>
                                  {s.scoreConfianca ?? (s.confianca === "alta" ? 85 : 60)}%
                                </span>
                                {/* Rev. 3405 — badge "Padrão ERP" quando há histórico */}
                                {s.padraoErp && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] font-medium bg-emerald-100 text-emerald-700" title={`Padrão identificado ${s.padraoErp.freq}× em conciliações anteriores → ${s.padraoErp.fornecedorNome}${s.padraoErp.contaNome ? " · " + s.padraoErp.contaNome : ""}`}>
                                    <CheckCircle className="w-2.5 h-2.5 shrink-0" />
                                    ERP ×{s.padraoErp.freq}
                                  </span>
                                )}
                                {s.identificadoVia && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-medium bg-violet-100 text-violet-700" title={s.entryComprovanteBeneficiario ? `Comprovante: ${s.entryComprovanteBeneficiario}` : `Identificado pelo comprovante (${s.identificadoVia})`}>
                                    <Sparkles className="w-2.5 h-2.5" /> {s.identificadoVia}
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-400">{s.deltaDias === 0 ? "mesmo dia" : `±${s.deltaDias}d`}</span>
                                {/* Rev. 3402 — botão IA inline */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    if (rowAiOpenId === s.statementLineId) { setRowAiOpenId(null); setRowAiAnalise(null); setRowAiCheckeds(new Set()); }
                                    else { dispararRowAI(s); }
                                  }}
                                  title="Verificar classificação com IA"
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors border ${
                                    rowAiOpenId === s.statementLineId
                                      ? "bg-violet-200 border-violet-300 text-violet-900"
                                      : "bg-white border-violet-200 text-violet-600 hover:bg-violet-50"
                                  }`}
                                >
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {rowAiOpenId === s.statementLineId && rowAiAnalise === "loading" ? "…" : "IA"}
                                </button>
                                {/* Rev. 3447 — descartar sugestão: linha volta p/ "No extrato, sem lançamento" */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    setSugDescartadas(prev => new Set([...prev, s.statementLineId]));
                                    setSelSug(prev => { const n = new Set(prev); n.delete(s.statementLineId); return n; });
                                    toast({ title: "Sugestão descartada", description: "A linha aparece agora em \"No extrato, sem lançamento\"." });
                                  }}
                                  title="Descartar esta sugestão — a linha volta para 'No extrato, sem lançamento'"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors border bg-white border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <X className="w-2.5 h-2.5" /> ignorar
                                </button>
                              </div>
                            </label>

                            {/* Painel IA inline expandido abaixo da linha */}
                            {rowAiOpenId === s.statementLineId && rowAiAnalise !== null && (
                              <div className="border-b bg-violet-50/70 px-4 py-3 space-y-2.5">
                                {rowAiAnalise === "loading" && (
                                  <div className="flex items-center gap-2 text-sm text-violet-600">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    Analisando classificação do lançamento…
                                  </div>
                                )}
                                {rowAiAnalise === "error" && (
                                  <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> Falha na análise.</span>
                                    <button type="button" onClick={() => dispararRowAI(s)} className="text-xs text-violet-600 underline hover:text-violet-800">Tentar novamente</button>
                                  </div>
                                )}
                                {typeof rowAiAnalise === "object" && rowAiAnalise !== null && (
                                  <>
                                    <div className={`flex items-start gap-2 text-xs font-medium rounded-lg px-3 py-2 ${
                                      (rowAiAnalise as any).sugestoes.length === 0
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : "bg-amber-50 text-amber-800 border border-amber-200"
                                    }`}>
                                      {(rowAiAnalise as any).sugestoes.length === 0
                                        ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                                      <span>{(rowAiAnalise as any).resumo || ((rowAiAnalise as any).sugestoes.length === 0 ? "Classificação está correta." : "Foram encontradas divergências.")}</span>
                                    </div>

                                    {(rowAiAnalise as any).sugestoes.length > 0 && (
                                      <>
                                        <div className="space-y-1.5">
                                          {(rowAiAnalise as any).sugestoes.map((sg: any, i: number) => (
                                            <div
                                              key={i}
                                              onClick={() => setRowAiCheckeds(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                                              className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer select-none transition-colors text-xs ${
                                                rowAiCheckeds.has(i) ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
                                              }`}
                                            >
                                              <div className={`mt-0.5 w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                                                rowAiCheckeds.has(i) ? "bg-amber-500 border-amber-500" : "border-gray-300"
                                              }`}>
                                                {rowAiCheckeds.has(i) && <CheckCircle className="w-2 h-2 text-white" />}
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <div className="font-bold text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
                                                  {sg.campo === "fornecedorNome" ? "Nome / Fornecedor" : sg.campo === "contaId" ? "Categoria" : "Descrição"}
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="line-through text-gray-400">{sg.valorAtual || "—"}</span>
                                                  <span className="text-gray-400">→</span>
                                                  <span className="font-semibold text-gray-900">{sg.sugestao}</span>
                                                </div>
                                                <div className="text-gray-500 mt-0.5">{sg.motivo}</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                          <button type="button" onClick={() => { setRowAiOpenId(null); setRowAiAnalise(null); setRowAiCheckeds(new Set()); }} className="text-[11px] text-gray-400 hover:text-gray-600">
                                            Descartar
                                          </button>
                                          <Button size="sm"
                                            onClick={() => aplicarRowCorrecoes(s)}
                                            disabled={rowAiCheckeds.size === 0 || updateEntryClassif.isPending}
                                            className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-[11px] h-7"
                                          >
                                            {updateEntryClassif.isPending
                                              ? <Loader2 className="w-3 h-3 animate-spin" />
                                              : <CheckCircle className="w-3 h-3" />}
                                            Aplicar {rowAiCheckeds.size} correção{rowAiCheckeds.size !== 1 ? "ões" : ""}
                                          </Button>
                                        </div>
                                      </>
                                    )}

                                    {(rowAiAnalise as any).sugestoes.length === 0 && (
                                      <button type="button" onClick={() => setRowAiOpenId(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
                                        Fechar
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </Fragment>
                        ))}
                        </div>
                      </div>
                      {semMatch.length > 0 && (
                        <p className="text-xs text-gray-400">
                          {formatInt(semMatch.length)} linha(s) de extrato sem lançamento correspondente (concilie manualmente abaixo).
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Rev. 3327 — DRILL-IN dos cards do Panorama: abre TODAS as linhas que compõem
                cada card (entradas/saídas/saldo/conciliados/extrato-sem-lançamento/ERP-sem-extrato/
                % conciliado). READ-ONLY — só leitura; nada concilia/baixa aqui. */}
            <Dialog open={!!panoramaDrill} onOpenChange={(o) => !o && setPanoramaDrill(null)}>
              <DialogContent resizable={false} className="max-w-2xl w-[calc(100vw-1rem)] sm:w-auto max-h-[88vh] flex flex-col p-0 gap-0">
                {(() => {
                  const cfg: Record<string, { titulo: string; icone: any; cor: string; itens: any[]; tipo: "extrato" | "entry"; valor: number; qtdLabel: string }> = {
                    entradas: { titulo: "Entradas do mês (créditos · caixa real)", icone: ArrowDownCircle, cor: "text-emerald-600", itens: drill.entradas, tipo: "extrato", valor: geralTotais?.valorEntradasExternas ?? 0, qtdLabel: "crédito(s)" },
                    saidas: { titulo: "Saídas do mês (débitos · caixa real)", icone: ArrowUpCircle, cor: "text-red-600", itens: drill.saidas, tipo: "extrato", valor: geralTotais?.valorSaidasExternas ?? 0, qtdLabel: "débito(s)" },
                    saldo: { titulo: "Saldo do mês — caixa real (externo)", icone: Landmark, cor: "text-slate-600", itens: [], tipo: "extrato", valor: (geralTotais?.valorEntradasExternas ?? 0) - (geralTotais?.valorSaidasExternas ?? 0), qtdLabel: "" },
                    interno: { titulo: "Movimentação interna — transf. entre contas, aplicação/resgate, intra-FC", icone: ArrowLeftRight, cor: "text-indigo-600", itens: drill.interno, tipo: "extrato", valor: (geralTotais?.valorEntradasInternas ?? 0) + (geralTotais?.valorSaidasInternas ?? 0), qtdLabel: "lançamento(s)" },
                    conciliados: { titulo: "Linhas conciliadas do mês", icone: CheckCircle, cor: "text-green-600", itens: drill.conciliados, tipo: "extrato", valor: geralTotais?.valorConciliado ?? 0, qtdLabel: "linha(s)" },
                    extratoSemLanc: { titulo: "No extrato, sem lançamento no ERP", icone: AlertCircle, cor: "text-rose-600", itens: drill.extratoSemLanc, tipo: "extrato", valor: geralTotais?.valorExtratoSemLancamento ?? 0, qtdLabel: "linha(s)" },
                    lancSemExtrato: { titulo: "No ERP, sem linha no extrato", icone: FileText, cor: "text-amber-600", itens: drill.lancSemExtrato, tipo: "entry", valor: geralTotais?.valorLancamentosSemExtrato ?? 0, qtdLabel: "lançamento(s)" },
                    pct: { titulo: "% conciliado — por conta", icone: CheckCircle, cor: "text-blue-600", itens: [], tipo: "extrato", valor: geralTotais?.pctConciliado ?? 0, qtdLabel: "" },
                  };
                  const c = panoramaDrill ? cfg[panoramaDrill] : null;
                  if (!c) return null;
                  const Icone = c.icone;
                  const isLista = panoramaDrill !== "saldo" && panoramaDrill !== "pct";
                  return (
                    <>
                      <DialogHeader className="px-5 pt-5 pb-4 pr-14 border-b border-gray-100 shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-base">
                          <Icone className={`w-5 h-5 shrink-0 ${c.cor}`} />
                          {c.titulo}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                          {periodoLabel} · {panoramaDrill === "pct"
                            ? `${formatInt(geralTotais?.conciliados ?? 0)} de ${formatInt((geralTotais?.conciliados ?? 0) + (geralTotais?.extratoSemLancamento ?? 0))} linha(s) do extrato`
                            : panoramaDrill === "saldo"
                              ? `${formatInt(geralTotais?.contas ?? 0)} conta(s) com extrato`
                              : `${formatInt(c.itens.length)} ${c.qtdLabel}`}
                          {isLista && <> · <span className={`font-semibold ${c.cor}`}>{formatBRL(c.valor)}</span></>}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
                        {/* SALDO — resumo entradas × saídas por conta */}
                        {panoramaDrill === "saldo" ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                                <p className="text-[11px] text-emerald-700 font-medium">Entradas (caixa real)</p>
                                <p className="text-base font-bold text-emerald-700">{formatBRL(geralTotais?.valorEntradasExternas ?? 0)}</p>
                              </div>
                              <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
                                <p className="text-[11px] text-red-700 font-medium">Saídas (caixa real)</p>
                                <p className="text-base font-bold text-red-600">{formatBRL(geralTotais?.valorSaidasExternas ?? 0)}</p>
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400 -mt-1 mb-2">As barras por conta abaixo mostram o giro TOTAL de cada conta (externo + interno); os cards de cima são só o caixa real.</p>
                            <div className="rounded-lg border border-gray-100 divide-y">
                              {geralContas.map((cc: any) => {
                                const t = cc.totais ?? {};
                                const saldo = (t.valorEntradas ?? 0) - (t.valorSaidas ?? 0);
                                return (
                                  <div key={cc.contaBancariaId} className="flex items-center gap-2 px-3 py-2 text-xs">
                                    <span className="flex-1 min-w-0 truncate text-gray-700 font-medium">{cc.contaLabel}</span>
                                    <span className="text-emerald-600 shrink-0">▼ {formatBRL(t.valorEntradas ?? 0)}</span>
                                    <span className="text-red-500 shrink-0">▲ {formatBRL(t.valorSaidas ?? 0)}</span>
                                    <span className={`font-bold shrink-0 w-28 text-right ${saldo >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatBRL(saldo)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : panoramaDrill === "pct" ? (
                          /* % CONCILIADO — por conta */
                          <div className="rounded-lg border border-gray-100 divide-y">
                            {geralContas.map((cc: any) => {
                              const t = cc.totais ?? {};
                              const base = (t.conciliados ?? 0) + (t.extratoSemLancamento ?? 0);
                              const pct = base > 0 ? Math.round(((t.conciliados ?? 0) / base) * 100) : 0;
                              return (
                                <div key={cc.contaBancariaId} className="px-3 py-2.5 text-xs">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="flex-1 min-w-0 truncate text-gray-700 font-medium">{cc.contaLabel}</span>
                                    <span className="shrink-0 text-gray-400">{formatInt(t.conciliados ?? 0)}/{formatInt(base)} linha(s)</span>
                                    <span className={`font-bold shrink-0 w-12 text-right ${pct >= 100 ? "text-green-600" : pct > 0 ? "text-blue-600" : "text-gray-400"}`}>{pct}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div className={`h-full ${pct >= 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : c.itens.length === 0 ? (
                          <div className="py-12 text-center text-sm text-gray-400">Nenhuma linha nesta situação em {periodoLabel}.</div>
                        ) : (
                          /* LISTAS de linhas (entradas/saídas/conciliados/extrato/ERP) */
                          <div className="rounded-lg border border-gray-100 divide-y">
                            {c.itens.map((it: any, i: number) => {
                              const v = Number(it.valor) || 0;
                              const isEntrada = v >= 0;
                              const primario = it.fornecedorNome || it.descricao || it.entryFornecedor || it.entryDescricao || (it.entryId ? `Lançamento #${it.entryId}` : "—");
                              const podeDetalhar = c.tipo === "entry" && it.id != null && !it.agrupado && !String(it.id).includes("#");
                              // Rev. 3351 — linha de extrato (id numérico) pode ser reclassificada (efetivo × interno).
                              const podeClassificar = c.tipo === "extrato" && it.id != null && !String(it.id).includes("#") && Number.isFinite(Number(it.id));
                              return (
                                <div key={it.id ?? i} className="flex items-center gap-2 px-3 py-2 text-xs">
                                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isEntrada ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                                    {isEntrada ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                                  </span>
                                  <span className="text-gray-400 shrink-0 w-16">{fmtData(it.data)}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate text-gray-700">{primario}</p>
                                    {it.contaLabel && <p className="truncate text-[10px] text-gray-400">{it.contaLabel}</p>}
                                  </div>
                                  <NaturezaBadge natureza={it.overrideNatureza} />
                                  <span className={`font-semibold shrink-0 ${isEntrada ? "text-emerald-600" : "text-rose-500"}`}>{formatBRL(Math.abs(v))}</span>
                                  {podeClassificar && (
                                    <button type="button" onClick={() => setOvRow({ id: Number(it.id), descricao: it.descricao || primario, valor: v, interno: !!it.interno, overrideNatureza: it.overrideNatureza ?? null })} title="Marcar como caixa real (efetivo) ou movimentação interna" className="shrink-0 p-1 rounded-md text-gray-300 hover:text-indigo-600 hover:bg-indigo-50">
                                      <ArrowLeftRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {podeDetalhar && (
                                    <button type="button" onClick={() => { setPanoramaDrill(null); setDetalheEntryId(Number(it.id)); }} title="Ver detalhes e origem do lançamento" className="shrink-0 p-1 rounded-md text-gray-300 hover:text-blue-600 hover:bg-blue-50">
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-gray-100 px-5 py-3 shrink-0 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-gray-400">Somente leitura — para conciliar, abra a conta no panorama.</p>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPanoramaDrill(null)}>Fechar</Button>
                      </div>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>

            {/* Rev. 3351 — exceção por lançamento (caixa real × movimentação interna). */}
            <NaturezaOverrideDialog
              open={!!ovRow} onOpenChange={(o) => { if (!o) setOvRow(null); }}
              companyId={companyId} line={ovRow}
              onDone={() => { setOvRow(null); setReportStale(true); }}
            />

            {/* Rev. 3368 — mapa da movimentação interna por contraparte (só conferência). */}
            <MapaMovimentacaoInternaDialog
              open={showMapaInterno}
              onOpenChange={setShowMapaInterno}
              companyId={companyId}
              dataInicio={dataInicio}
              dataFim={dataFim}
              periodoLabel={`${fmtData(dataInicio)} – ${fmtData(dataFim)}`}
            />

            {/* Rev. 3372 — pré-confirmação "Conferir cheques com o extrato". Cheque é
                indexado por ano/mês (mes_ref): no modo "Mês" filtra o mês; em "Ano todo",
                "Período" e "Dia" usa o ANO inteiro (não há range arbitrário por cheque). */}
            <ConferirChequesExtratoDialog
              open={showConferirCheques}
              onOpenChange={setShowConferirCheques}
              companyId={companyId}
              ano={ano}
              mes={modoData === "mes" ? mesSel : null}
              periodoLabel={modoData === "mes" ? (mesSel != null ? `${MESES[mesSel - 1]}/${ano}` : `Ano ${ano}`) : `Ano ${ano}`}
              onDone={() => { setReportStale(true); }}
            />

            {/* Rev. 3177 — Detalhe CONSULTIVO (read-only) do lançamento, aberto ao clicar na sugestão. */}
            {/* Rev. 3399 — Dialog full-screen moderno: header colorido + seções em cards */}
            <Dialog open={!!detalheEntryId} onOpenChange={(o) => !o && fecharDetalhe()}>
              <DialogContent className="max-w-[100vw] w-screen h-[100dvh] rounded-none flex flex-col p-0 gap-0">
                {/* ── HEADER colorido ── */}
                <div className={`shrink-0 px-5 pt-5 pb-4 ${detEntry?.tipo === "receita" ? "bg-emerald-700" : "bg-[#1B2A4A]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50 mb-0.5">
                        {detEntry ? `Lançamento #${detEntry.id}` : "Lançamento"}
                        {detEditMode && <span className="ml-2 text-amber-300">— editando</span>}
                      </p>
                      <h2 className="text-xl font-bold text-white leading-tight break-words">
                        {detailQuery.isLoading ? "Carregando…" : (detEntry?.fornecedorNome || detEntry?.descricao || detEntry?.contaNome || "Lançamento")}
                      </h2>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        {detEntry && (
                          <>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${detEntry.tipo === "receita" ? "bg-emerald-600 text-emerald-100" : "bg-red-600/70 text-red-100"}`}>
                              {detEntry.tipo === "receita" ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                              {detEntry.tipo === "receita" ? "Receita" : "Despesa"}
                            </span>
                            {detEntry.natureza && <span className="text-xs text-white/60">· {detEntry.natureza}</span>}
                            {detEntry.obraNome && <span className="text-xs text-white/60 truncate max-w-[160px]">· {detEntry.obraNome}</span>}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {detEntry && (
                        <>
                          <div className="text-2xl font-bold tabular-nums text-white">
                            {formatBRL(Number(detEntry.valorRealizado ?? detEntry.valorPrevisto ?? 0))}
                          </div>
                          <span className={`inline-block mt-1 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full ${
                            detEntry.status === "pago" || detEntry.status === "recebido" ? "bg-emerald-500/80 text-white"
                            : detEntry.status === "cancelado" ? "bg-red-500/80 text-white"
                            : "bg-white/20 text-white"
                          }`}>
                            {detEntry.status ?? "—"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* close button */}
                  <button
                    onClick={fecharDetalhe}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* ── BODY scrollável ── */}
                <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
                  <div className="max-w-2xl mx-auto w-full px-4 py-5 space-y-4">

                    {/* Conferência da conciliação (quando aberto via sugestão) */}
                    {detalheExtrato && (() => {
                      const vExtrato = Math.abs(Number(detalheExtrato.valor) || 0);
                      const vEntry = Math.abs(Number(detEntry?.valorRealizado ?? detEntry?.valorPrevisto ?? detalheExtrato.entryValor ?? 0));
                      const dv = Math.abs(vExtrato - vEntry);
                      const igual = dv < 0.005;
                      return (
                        <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
                          <div className="bg-blue-600 px-4 py-2.5 flex items-center gap-2">
                            <Link2 className="w-3.5 h-3.5 text-blue-100" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Conferência da conciliação</span>
                          </div>
                          <div className="p-4 grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-gray-50 border p-3 min-w-0">
                              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Extrato (banco)</div>
                              <div className="text-sm font-semibold text-gray-900 break-words leading-snug">{detalheExtrato.descricao || "—"}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{fmtData(detalheExtrato.data)}</div>
                              <div className="text-base font-bold tabular-nums text-gray-800 mt-1.5">{formatBRL(vExtrato)}</div>
                              {detalheExtrato.chequeFornecedor && (
                                <div className="text-[11px] text-emerald-700 mt-1 truncate">🪙 Cheque nº {detalheExtrato.chequeNumero} · {detalheExtrato.chequeFornecedor}</div>
                              )}
                            </div>
                            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 min-w-0">
                              <div className="text-[10px] uppercase tracking-wide text-blue-400 font-semibold mb-1.5">Lançamento (ERP)</div>
                              <div className="text-sm font-semibold text-blue-800 break-words leading-snug">{detEntry ? (detEntry.fornecedorNome || detEntry.descricao || detEntry.contaNome || "Lançamento") : "—"}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{detEntry ? fmtData(detEntry.dataPagamento ?? detEntry.dataVencimento ?? detEntry.dataCompetencia) : ""}</div>
                              <div className="text-base font-bold tabular-nums text-blue-700 mt-1.5">{formatBRL(vEntry)}</div>
                            </div>
                          </div>
                          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${igual ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {igual ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                              {igual ? "Valores idênticos" : `Δ ${formatBRL(dv)}`}
                            </span>
                            {detalheExtrato.deltaDias != null && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                                {detalheExtrato.deltaDias === 0 ? "Mesmo dia" : `±${detalheExtrato.deltaDias} dia(s)`}
                              </span>
                            )}
                            {detalheExtrato.confianca && (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${detalheExtrato.confianca === "alta" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                                Confiança {detalheExtrato.confianca === "alta" ? "alta" : "média"}
                              </span>
                            )}
                            {detalheExtrato.identificadoVia && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">
                                <Sparkles className="w-3 h-3" /> {detalheExtrato.identificadoVia}
                              </span>
                            )}
                          </div>

                          {/* ── Rev. 3401 — Análise IA da classificação (on-demand) ── */}
                          <div className="border-t border-gray-100">
                            {/* Botão inicial */}
                            {aiAnalise === null && (
                              <button
                                type="button"
                                onClick={dispararAnaliseIA}
                                disabled={!detEntry || analisarConciliacaoMut.isPending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <Sparkles className="w-4 h-4" />
                                Verificar classificação com IA
                              </button>
                            )}
                            {/* Loading */}
                            {aiAnalise === "loading" && (
                              <div className="flex items-center gap-2 px-4 py-3 text-sm text-violet-600">
                                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                Analisando classificação do lançamento…
                              </div>
                            )}
                            {/* Erro */}
                            {aiAnalise === "error" && (
                              <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                                <span className="text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> Falha na análise.</span>
                                <button type="button" onClick={dispararAnaliseIA} className="text-xs text-violet-600 underline hover:text-violet-800">Tentar novamente</button>
                              </div>
                            )}
                            {/* Resultado */}
                            {typeof aiAnalise === "object" && aiAnalise !== null && (
                              <div className="p-4 space-y-3">
                                {/* Resumo */}
                                <div className={`flex items-start gap-2 text-sm font-medium rounded-lg px-3 py-2 ${
                                  (aiAnalise as any).sugestoes.length === 0
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-amber-50 text-amber-800"
                                }`}>
                                  {(aiAnalise as any).sugestoes.length === 0
                                    ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                  <span>{(aiAnalise as any).resumo || ((aiAnalise as any).sugestoes.length === 0 ? "Classificação está correta." : "Foram encontradas divergências.")}</span>
                                </div>

                                {/* Lista de sugestões */}
                                {(aiAnalise as any).sugestoes.length > 0 && (
                                  <>
                                    <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Clique para marcar/desmarcar as correções a aplicar:</p>
                                    <div className="space-y-2">
                                      {(aiAnalise as any).sugestoes.map((s: any, i: number) => (
                                        <div
                                          key={i}
                                          onClick={() => setAiCheckeds(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                                          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer select-none transition-colors ${aiCheckeds.has(i) ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
                                        >
                                          <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${aiCheckeds.has(i) ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                                            {aiCheckeds.has(i) && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                              {s.campo === "fornecedorNome" ? "Nome / Fornecedor" : s.campo === "contaId" ? "Categoria" : "Descrição"}
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                              <span className="line-through text-gray-400">{s.valorAtual || "—"}</span>
                                              <span className="text-gray-400">→</span>
                                              <span className="font-semibold text-gray-900">{s.sugestao}</span>
                                            </div>
                                            <div className="text-[11px] text-gray-500 mt-0.5">{s.motivo}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 pt-1">
                                      <button type="button" onClick={() => setAiAnalise(null)} className="text-xs text-gray-400 hover:text-gray-600">
                                        Descartar análise
                                      </button>
                                      <Button
                                        size="sm"
                                        onClick={aplicarCorrecoesSugeridas}
                                        disabled={aiCheckeds.size === 0 || updateEntryClassif.isPending}
                                        className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-xs"
                                      >
                                        {updateEntryClassif.isPending
                                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          : <CheckCircle className="w-3.5 h-3.5" />}
                                        Aplicar {aiCheckeds.size} correção{aiCheckeds.size !== 1 ? "ões" : ""}
                                      </Button>
                                    </div>
                                  </>
                                )}

                                {(aiAnalise as any).sugestoes.length === 0 && (
                                  <button type="button" onClick={() => setAiAnalise(null)} className="text-xs text-gray-400 hover:text-gray-600">
                                    Fechar análise
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Loading / error */}
                    {detailQuery.isLoading && (
                      <div className="py-16 text-center text-gray-400 text-sm flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                        Carregando lançamento…
                      </div>
                    )}
                    {detailQuery.error && (
                      <div className="py-16 text-center text-red-500 text-sm">
                        Erro ao carregar: {(detailQuery.error as any)?.message ?? "tente novamente"}.
                      </div>
                    )}

                    {detEntry && (
                      <>
                      {/* ── MODO EDIÇÃO ── */}
                      {detEditMode && detEditForm ? (
                        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                          <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center gap-2 text-amber-700 text-xs font-medium">
                            <Pencil className="w-3.5 h-3.5 shrink-0" />
                            Edite os campos de classificação. Valores e datas não são alterados aqui.
                          </div>
                          <div className="p-4 space-y-5">
                            {/* Tipo */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</Label>
                              <div className="flex rounded-lg border overflow-hidden h-10">
                                <button type="button" onClick={() => setDetEditForm(f => f ? { ...f, tipo: "despesa" } : f)}
                                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors ${detEditForm?.tipo === "despesa" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-red-50"}`}>
                                  <ArrowDownCircle className="w-3.5 h-3.5" />Débito (Despesa)
                                </button>
                                <button type="button" onClick={() => setDetEditForm(f => f ? { ...f, tipo: "receita" } : f)}
                                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors border-l ${detEditForm?.tipo === "receita" ? "bg-emerald-500 text-white" : "bg-white text-gray-500 hover:bg-emerald-50"}`}>
                                  <ArrowUpCircle className="w-3.5 h-3.5" />Crédito (Receita)
                                </button>
                              </div>
                            </div>
                            {/* Conta categoria */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta (Categoria)</Label>
                              <SearchableSelect
                                value={detEditForm.contaId != null ? String(detEditForm.contaId) : "__none__"}
                                onValueChange={(v) => { if (v === "__none__") { setDetEditForm(f => f ? { ...f, contaId: null, contaNome: "" } : f); } else { const opt = catOpts.find(o => String(o.id) === v); setDetEditForm(f => f ? { ...f, contaId: Number(v), contaNome: opt?.nome ?? "" } : f); } }}
                                placeholder="Selecione a conta…"
                                searchPlaceholder="Digitar para filtrar…"
                                options={[
                                  { value: "__none__", label: "— Sem categoria —" },
                                  ...catOpts.filter(o => !detEditForm?.tipo || o.tipo === detEditForm.tipo).map(o => ({ value: String(o.id), label: o.nome })),
                                ]}
                              />
                            </div>
                            {/* Conta bancária */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta Bancária</Label>
                              <Select value={detEditForm.contaBancariaId != null ? String(detEditForm.contaBancariaId) : "__none__"}
                                onValueChange={(v) => setDetEditForm(f => f ? { ...f, contaBancariaId: v === "__none__" ? null : Number(v) } : f)}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a conta bancária…" /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__none__">— Sem conta bancária —</SelectItem>
                                  {(Array.isArray(bankAccounts) ? bankAccounts : []).map((b: any) => {
                                    const label = b.apelido ? `${b.apelido} (${b.banco})` : `${b.banco} ${formatAgencia(b.agencia)}/${b.conta}`.trim();
                                    return <SelectItem key={b.id} value={String(b.id)}>{label}</SelectItem>;
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Obra */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Obra</Label>
                              <Select value={detEditForm.obraId != null ? String(detEditForm.obraId) : "__none__"}
                                onValueChange={(v) => { if (v === "__none__") { setDetEditForm(f => f ? { ...f, obraId: null, obraNome: "" } : f); } else { const opt = obrasOpts.find(o => String(o.id) === v); setDetEditForm(f => f ? { ...f, obraId: Number(v), obraNome: opt?.nome ?? "" } : f); } }}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a obra…" /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__none__">— Sem obra —</SelectItem>
                                  {obrasOpts.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {/* Rev. 3468 — texto livre da planilha: sempre visível no modo edição */}
                              {detEditForm.obraNome && (
                                <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                  📋 Da planilha: <span className="font-medium text-gray-500">{detEditForm.obraNome}</span>
                                </p>
                              )}
                            </div>
                            {/* Forma de pagamento */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Forma de Pagamento</Label>
                              <Select value={detEditForm.formaPagamento || "__none__"} onValueChange={(v) => setDetEditForm(f => f ? { ...f, formaPagamento: v === "__none__" ? "" : v } : f)}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Não informado —</SelectItem>
                                  <SelectItem value="pix">PIX</SelectItem>
                                  <SelectItem value="boleto">Boleto</SelectItem>
                                  <SelectItem value="transferencia">Transferência (TED/DOC)</SelectItem>
                                  <SelectItem value="cheque">Cheque</SelectItem>
                                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                                  <SelectItem value="debito_em_conta">Débito em Conta</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Fornecedor */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                                Fornecedor / Beneficiário
                                {detEditFornDisplay && !detEditForm.fornecedorNome && (
                                  <span className="text-[10px] text-amber-600 font-normal">selecione da lista ↓</span>
                                )}
                                {detEditForm.fornecedorNome && (
                                  <span className="text-[10px] text-emerald-600 font-normal">✓ confirmado</span>
                                )}
                              </Label>
                              <LancCombo
                                value={detEditFornDisplay}
                                onChangeText={(s) => { setDetEditFornDisplay(s); setDetEditForm(f => f ? { ...f, fornecedorNome: "" } : f); }}
                                onSelect={(opt) => {
                                  if (!opt) { setDetEditFornDisplay(""); setDetEditForm(f => f ? { ...f, fornecedorNome: "" } : f); return; }
                                  setDetEditFornDisplay(opt.label);
                                  setDetEditForm(f => f ? { ...f, fornecedorNome: opt.label } : f);
                                }}
                                options={lancFornOpts}
                                placeholder="Buscar fornecedor do cadastro…"
                                noneLabel="— (sem fornecedor) —"
                                onClear={() => { setDetEditFornDisplay(""); setDetEditForm(f => f ? { ...f, fornecedorNome: "" } : f); }}
                              />
                            </div>
                            {/* Descrição */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</Label>
                              <Input value={detEditForm.descricao} onChange={(e) => setDetEditForm(f => f ? { ...f, descricao: e.target.value } : f)} placeholder="Descrição do lançamento" />
                            </div>
                            {/* Observações */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Observações</Label>
                              <Textarea value={detEditForm.observacoes} onChange={(e) => setDetEditForm(f => f ? { ...f, observacoes: e.target.value } : f)} placeholder="Observações adicionais" rows={3} />
                            </div>
                          </div>
                        </div>
                      ) : (
                      <>
                        {/* ── Card: Dados financeiros ── */}
                        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                          <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Dados financeiros</div>
                          <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            {field("Valor Previsto", detEntry.valorPrevisto != null ? formatBRL(Number(detEntry.valorPrevisto)) : null)}
                            {field("Valor Realizado", detEntry.valorRealizado != null ? formatBRL(Number(detEntry.valorRealizado)) : null)}
                            {field("Data Competência", fmtData(detEntry.dataCompetencia))}
                            {field("Data Vencimento", fmtData(detEntry.dataVencimento))}
                            {field("Data Pagamento", fmtData(detEntry.dataPagamento))}
                            {field("Forma de Pagamento", detEntry.formaPagamento)}
                            {field("Parcela", detEntry.parcelaTotal ? `${detEntry.parcelaNumero ?? 1}/${detEntry.parcelaTotal}` : null)}
                            {/* Rev. 3465 — conciliado exibe banco/agência/conta quando disponível */}
                            {(() => {
                              const isConcil = Number(detEntry.conciliado) === 1;
                              const contaBanc = isConcil && detEntry.contaBancariaId
                                ? (bankAccounts ?? []).find((b: any) => b.id === detEntry.contaBancariaId)
                                : null;
                              return (
                                <div className="min-w-0">
                                  <div className="text-[11px] text-gray-400 uppercase tracking-wide">Conciliado</div>
                                  <div className={`break-words ${isConcil ? "text-emerald-700 font-medium" : "text-gray-800"}`}>
                                    {isConcil ? (() => {
                                      const ts = detEntry.conciliadoEm
                                        ? (() => { try { const d = new Date(String(detEntry.conciliadoEm).replace(" ","T")); return isNaN(d.getTime()) ? null : d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo" }); } catch { return null; } })()
                                        : (detEntry.dataConciliacao ? fmtData(detEntry.dataConciliacao) : null);
                                      return ts ? `Sim · ${ts}` : "Sim";
                                    })() : "Não"}
                                  </div>
                                  {isConcil && detEntry.conciliadoPorNome && (
                                    <div className="text-[11px] text-emerald-600 mt-0.5 break-words">por {detEntry.conciliadoPorNome}</div>
                                  )}
                                  {contaBanc && (
                                    <div className="text-[11px] text-gray-500 mt-0.5 break-words">
                                      🏦 {contaBanc.apelido ? `${contaBanc.apelido} · ` : ""}{contaBanc.banco}
                                      {(contaBanc.agencia || contaBanc.conta)
                                        ? ` · Ag. ${formatAgencia(contaBanc.agencia ?? "")}/${formatConta(contaBanc.conta ?? "")}`
                                        : ""}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {Number(detEntry.diasAtraso) > 0 && field("Dias em Atraso", `${detEntry.diasAtraso} dia(s)`)}
                          </div>
                        </div>

                        {/* ── Card: Classificação ── */}
                        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                          <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Classificação</div>
                          <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            {field("Conta (Categoria)", detEntry.contaNome)}
                            {field("Obra", detEntry.obraNome)}
                            {field("Origem", detEntry.origemModulo)}
                            {field("Criado por", detEntry.criadoPorNome)}
                          </div>
                        </div>

                        {/* ── Card: Cheque (se aplicável) ── */}
                        {(detEntry.chequeNumero || detEntry.codigoBarras) && (
                          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Cheque / Código de Barras</div>
                            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                              {field("Cheque nº", detEntry.chequeNumero ? `${detEntry.chequeNumero}${detEntry.chequeBanco ? ` · ${detEntry.chequeBanco}` : ""}` : null)}
                              {field("Cheque bom para", fmtData(detEntry.chequeDataBomPara))}
                              {field("Código de Barras", detEntry.codigoBarras)}
                            </div>
                          </div>
                        )}

                        {/* ── Card: Textos ── */}
                        {(detEntry.descricao || detEntry.origemDescricao || detEntry.observacoes || detEntry.extratoBancoDescricao || detEntry.motivoCancelamento) && (
                          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Descrições e observações</div>
                            <div className="p-4 space-y-3 text-sm">
                              {detEntry.descricao && field("Descrição", detEntry.descricao)}
                              {detEntry.origemDescricao && field("Origem (detalhe)", detEntry.origemDescricao)}
                              {detEntry.observacoes && field("Observações", detEntry.observacoes)}
                              {detEntry.extratoBancoDescricao && field("Descrição no Extrato", detEntry.extratoBancoDescricao)}
                              {detEntry.status === "cancelado" && detEntry.motivoCancelamento && field("Motivo do Cancelamento", detEntry.motivoCancelamento)}
                            </div>
                          </div>
                        )}

                        {/* ── Card: Anexos ── */}
                        {(detEntry.comprovanteUrl || detEntry.anexoUrl) && (
                          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Anexos</div>
                            <div className="p-4 flex flex-wrap gap-2">
                              {detEntry.comprovanteUrl && (
                                <a href={detEntry.comprovanteUrl} target="_blank" rel="noreferrer"
                                   className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                                  <Paperclip className="w-3.5 h-3.5" /> Comprovante <ExternalLink className="w-3 h-3 opacity-60" />
                                </a>
                              )}
                              {detEntry.anexoUrl && (
                                <a href={detEntry.anexoUrl} target="_blank" rel="noreferrer"
                                   className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                                  <Paperclip className="w-3.5 h-3.5" /> {detEntry.anexoNome || "Anexo"} <ExternalLink className="w-3 h-3 opacity-60" />
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Card: Ordem de Compra ── */}
                        {detOrdem && (
                          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-violet-500" /> Ordem de Compra {detOrdem.numeroOc ?? ""}
                              {detEntry?.origemId && (
                                <button
                                  type="button"
                                  onClick={() => { window.location.href = `/compras/ordens?destaque=${detEntry.origemId}`; }}
                                  className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-full transition-colors"
                                  title="Abrir a Ordem de Compra no módulo Compras"
                                >
                                  <ExternalLink className="w-3 h-3" /> Abrir OC
                                </button>
                              )}
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                              {field("Fornecedor (OC)", detOrdem.fornecedorNome)}
                              {field("Nota Fiscal", detOrdem.numeroNf)}
                              {field("Total da OC", detOrdem.total != null ? formatBRL(Number(detOrdem.total)) : null)}
                              {field("Condição", detOrdem.condicaoPagamento)}
                              {field("Status OC", detOrdem.status)}
                              {detItens.length > 0 && field("Itens", `${formatInt(detItens.length)} item(ns)`)}
                            </div>
                          </div>
                        )}

                        {/* ── Card: Origem genérica ── */}
                        {detOrigem && (
                          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="bg-gray-100/80 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">{detOrigem.titulo}</div>
                            <div className="p-4">
                              {detOrigem.subtitulo && <p className="text-xs text-gray-500 mb-3">{detOrigem.subtitulo}</p>}
                              {Array.isArray(detOrigem.campos) && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                  {detOrigem.campos.map((c: any, i: number) => field(c.label ?? `Campo ${i + 1}`, c.kind === "date" ? fmtData(c.value) : (c.value ?? "—"), `campo-${i}`))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                      )}
                      </>
                    )}
                  </div>
                </div>

                {/* ── FOOTER fixo ── */}
                <div className="shrink-0 border-t bg-white px-5 py-3 flex items-center justify-end gap-3">
                  {detEditMode ? (
                    <>
                      <Button variant="outline" onClick={() => { setDetEditMode(false); setDetEditForm(null); }} disabled={updateEntryClassif.isPending}>
                        Cancelar
                      </Button>
                      <Button onClick={salvarEdicaoEntry} disabled={updateEntryClassif.isPending} className="bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-white gap-1.5">
                        {updateEntryClassif.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando…</> : <><CheckCircle className="w-4 h-4" />Salvar alterações</>}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={fecharDetalhe}>Fechar</Button>
                      {detEntry && (
                        <Button variant="outline" onClick={iniciarEdicaoEntry} className="gap-1.5 border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#1B2A4A]/5">
                          <Pencil className="w-4 h-4" /> Editar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Rev. 3266 — CONFERÊNCIA da identificação por IA (texto roxo clicável). Mostra os
                dados LIDOS pela IA no demonstrativo × a linha do extrato lado a lado, Δ do valor,
                link p/ o(s) PDF(s) do demonstrativo e botões Confirmar / Marcar errado / Desfazer.
                100% read-only quanto à conciliação — só registra o veredicto da leitura. */}
            <Dialog open={!!demoConf} onOpenChange={(o) => { if (!o) setDemoConf(null); }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                {demoConf && (() => {
                  const tipoLbl = demoConf.demoTipo === "boleto" ? "Boleto" : demoConf.demoTipo === "ted" ? "TED" : "PIX";
                  const vExtrato = Math.abs(Number(demoConf.valor) || 0);
                  const vDemo = demoConf.demoValor != null ? Math.abs(Number(demoConf.demoValor)) : null;
                  const delta = vDemo != null ? Math.abs(vExtrato - vDemo) : null;
                  const igual = delta != null && delta < 0.005;
                  const viaLbl = demoConf.demoMatch === "txid" ? "Identificador (txid / e2e / nosso número) na descrição + valor"
                    : demoConf.demoMatch === "data" ? "Valor + data exatos (único no período)"
                    : "Valor único no período (correspondência provável)";
                  const arquivos: { url: string; nome: string | null }[] = Array.isArray(demoConf.demoArquivos) ? demoConf.demoArquivos : [];
                  const ver = demoConf.demoVeredicto as string | null;
                  return (
                  <>
                    <div className="bg-[#1B2A4A] text-white px-5 py-4 rounded-t-lg" style={{ printColorAdjust: "exact" }}>
                      <DialogHeader>
                        <DialogTitle className="text-white text-base flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-300" /> Conferência da identificação (IA)
                        </DialogTitle>
                      </DialogHeader>
                      <p className="text-[12px] text-blue-100 mt-1">
                        Esta linha do extrato foi <strong>identificada automaticamente</strong> lendo os demonstrativos de pagamento. Confira os dados abaixo e <strong>confirme</strong> ou <strong>marque como errado</strong>. Isso <strong>não concilia nem baixa</strong> nada — só registra a conferência.
                      </p>
                    </div>
                    <div className="p-5 space-y-4">
                      {ver && (
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${ver === "errado" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                          {ver === "errado" ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          <span>{ver === "errado" ? "Esta identificação foi marcada como ERRADA" : "Esta identificação foi CONFERIDA"}{demoConf.demoVeredictoPor ? ` por ${demoConf.demoVeredictoPor}` : ""}{demoConf.demoVeredictoEm ? ` · ${fmtData(String(demoConf.demoVeredictoEm).slice(0, 10))}` : ""}.</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Lado do EXTRATO (banco) */}
                        <div className="rounded-lg border border-gray-200 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1"><Landmark className="w-3.5 h-3.5" /> Linha do extrato (banco)</div>
                          <div className="space-y-1.5 text-sm">
                            <div><span className="text-gray-400 text-[11px] uppercase block">Data</span>{fmtData(demoConf.data)}</div>
                            <div><span className="text-gray-400 text-[11px] uppercase block">Descrição</span><span className="break-words">{demoConf.descricao || "—"}</span></div>
                            <div><span className="text-gray-400 text-[11px] uppercase block">Valor</span><span className="font-bold text-rose-600">{formatBRL(vExtrato)}</span></div>
                          </div>
                        </div>
                        {/* Lado da IA (demonstrativo) */}
                        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 mb-2 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Lido pela IA no demonstrativo</div>
                          <div className="space-y-1.5 text-sm">
                            <div><span className="text-gray-400 text-[11px] uppercase block">Tipo</span>{tipoLbl}</div>
                            <div><span className="text-gray-400 text-[11px] uppercase block">Beneficiário</span><span className="break-words">{demoConf.demoBeneficiario || "—"}</span></div>
                            {demoConf.demoDocumento && <div><span className="text-gray-400 text-[11px] uppercase block">Documento</span><span className="break-words">{demoConf.demoDocumento}</span></div>}
                            {demoConf.demoTxid && <div><span className="text-gray-400 text-[11px] uppercase block">Txid / Identificador</span><span className="break-words text-[12px]">{demoConf.demoTxid}</span></div>}
                            <div><span className="text-gray-400 text-[11px] uppercase block">Valor lido</span><span className="font-bold text-violet-700">{vDemo != null ? formatBRL(vDemo) : "—"}</span></div>
                            {demoConf.demoData && <div><span className="text-gray-400 text-[11px] uppercase block">Data do pagamento</span>{fmtData(demoConf.demoData)}</div>}
                          </div>
                        </div>
                      </div>
                      {/* Δ valor + como casou */}
                      <div className="flex flex-wrap items-center gap-2">
                        {delta != null && (
                          <span className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${igual ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {igual ? "✓ Valores idênticos" : `Δ valor: ${formatBRL(delta)}`}
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-gray-100 text-gray-600" title={viaLbl}>Como casou: {viaLbl}</span>
                        {(demoConf.demoMes != null && demoConf.demoAno != null) && (
                          <span className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-blue-50 text-blue-700">Demonstrativo {String(demoConf.demoMes).padStart(2, "0")}/{demoConf.demoAno}</span>
                        )}
                      </div>
                      {/* PDFs do demonstrativo */}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Demonstrativo (PDF de origem)</div>
                        {arquivos.length === 0 ? (
                          <p className="text-[12px] text-gray-400">Nenhum arquivo anexado ao demonstrativo deste mês.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {arquivos.map((a, i) => (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                                 className="inline-flex items-center gap-2 text-[13px] text-blue-600 hover:underline">
                                <FileText className="w-4 h-4 shrink-0" />
                                <span className="truncate">{a.nome || `Demonstrativo ${tipoLbl} ${i + 1}`}</span>
                                <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter className="px-5 pb-5 gap-2 flex-wrap">
                      {ver && (
                        <Button variant="outline" disabled={confirmarDemoMut.isPending} onClick={() => salvarDemoVeredicto("pendente")}>
                          <RotateCcw className="w-4 h-4 mr-1.5" /> Desfazer
                        </Button>
                      )}
                      <Button variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50" disabled={confirmarDemoMut.isPending} onClick={() => salvarDemoVeredicto("errado")}>
                        <X className="w-4 h-4 mr-1.5" /> Marcar como errado
                      </Button>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={confirmarDemoMut.isPending} onClick={() => salvarDemoVeredicto("confirmado")}>
                        {confirmarDemoMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />} Confirmar identificação
                      </Button>
                    </DialogFooter>
                  </>
                  );
                })()}
              </DialogContent>
            </Dialog>

            {/* Rev. 3187 — Conciliação manual lado a lado (fonte: getConciliacaoReport). */}
            {/* Rev. 3197 — faixa de ajuda explicando o passo a passo da conciliação manual 1:1. */}
            {(repExt.length > 0 || repLan.length > 0) && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-800">
                <Link2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <p className="leading-relaxed">
                  <strong>Conciliar manualmente:</strong> clique em <strong>um item de cada lado</strong> — uma linha do extrato (esquerda) e o lançamento do ERP correspondente (direita). Aparece uma barra azul no rodapé com os dois lados; confira a diferença (Δ) e toque em <strong>"Conciliar"</strong>. É sempre <strong>1 para 1</strong>.
                </p>
              </div>
            )}
            {(repExt.length > 0 || repLan.length > 0) && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  value={buscaConc}
                  onChange={(e) => setBuscaConc(e.target.value)}
                  placeholder="Buscar nas duas listas (descrição, fornecedor, obra, valor…)"
                  className="pl-9 pr-9 h-9"
                />
                {buscaConc && (
                  <button
                    type="button"
                    onClick={() => setBuscaConc("")}
                    title="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            {/* Rev. 3235 — CHEQUES DEVOLVIDOS (tentativa de pagamento frustrada). O par
                débito (compensação) + crédito (devolução) do MESMO cheque tem saldo ZERO:
                não é saída nem entrada real. O ERP pareia, traduz o motivo (alínea Bacen)
                e mostra a quitação real encontrada (reapresentação ou PIX/TED) — ou avisa
                que segue PENDENTE p/ o usuário decidir. READ-ONLY: nada é baixado. */}
            {repDevol.length > 0 && (
              <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-amber-400">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      <RotateCcw className="w-4 h-4 text-amber-500" />
                      Cheques devolvidos no banco ({formatInt(repDevol.length)})
                      {repDevolResolvidosN > 0 && (
                        <span className="font-normal text-[11px] text-gray-400">
                          {formatInt(repDevol.length - repDevolResolvidosN)} pendente{repDevol.length - repDevolResolvidosN === 1 ? "" : "s"} · {formatInt(repDevolResolvidosN)} resolvido{repDevolResolvidosN === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className="font-normal text-[11px] text-gray-400">tentativa de pagamento frustrada — saldo zero</span>
                    </CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      {repDevolResolvidosN > 0 && (
                        <Button
                          size="sm"
                          variant={ocultarDevolResolvidos ? "default" : "outline"}
                          className="h-7"
                          onClick={() => setOcultarDevolResolvidos((v) => !v)}
                          title="Esconde da tela os cheques já quitados ou desconsiderados. Não apaga nada nem muda o cálculo do %."
                        >
                          {ocultarDevolResolvidos ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                          {ocultarDevolResolvidos ? "Mostrar todos" : "Ocultar resolvidos"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7" onClick={gerarRelatorioDevolvidosPDF}>
                        <FileDown className="w-3.5 h-3.5 mr-1" />PDF / Imprimir
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                    {ocultarDevolResolvidos && repDevolView.length === 0 && (
                      <div className="px-4 py-6 text-center text-[12px] text-gray-500">
                        Todos os cheques devolvidos já foram tratados.{" "}
                        <button type="button" className="text-amber-700 hover:text-amber-900 underline" onClick={() => setOcultarDevolResolvidos(false)}>
                          Mostrar todos
                        </button>
                      </div>
                    )}
                    {repDevolView.map((d: any) => {
                      const res = d.resolucao ?? { tipo: "pendente" };
                      const vinfo = vincMap[String(d.debitoId)] ?? null;
                      const vinTotalCents = Math.round(Math.abs(Number(d.valor) || (Number(d.valorCents) || 0) / 100) * 100);
                      const vinAcumCents = vinfo ? Math.round(Number(vinfo.acumulado || 0) * 100) : 0;
                      const vinSaldoCents = Math.max(0, vinTotalCents - vinAcumCents);
                      const vinQuitado = !!vinfo?.quitado || (!!vinfo && vinSaldoCents <= 1 && vinAcumCents > 0);
                      const vinSugN = vinfo?.sugestoes?.length ?? 0;
                      const vinN = vinfo?.vinculos?.length ?? 0;
                      return (
                        <div key={d.grupoId} className={`px-4 py-3 ${d.desconsiderado ? "opacity-60 bg-gray-50/60" : ""}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 flex items-center flex-wrap gap-x-2 gap-y-1">
                                <span>Cheque {d.chequeNumero ? `nº ${d.chequeNumero}` : (d.doc ? `Doc ${d.doc}` : "—")}</span>
                                <span className="text-rose-500 font-bold">{formatBRL(Math.abs(Number(d.valor) || d.valorCents / 100))}</span>
                                {d.motivoCodigo != null ? (
                                  <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${d.motivoSustado ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} title={d.motivoTexto ?? ""}>
                                    Motivo {d.motivoCodigo}{d.motivoTexto ? ` · ${d.motivoTexto}` : ""}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-px rounded-full text-[10px] font-medium bg-gray-100 text-gray-600" title="O extrato não trouxe o código da devolução (alínea Bacen) deste cheque. Verifique o motivo direto no extrato/banco.">
                                    Motivo não informado
                                  </span>
                                )}
                              </p>
                              {(d.fornecedor || d.obraNome || d.nf) && (
                                <p className="text-[11px] text-gray-500 truncate">
                                  {[d.fornecedor, d.obraNome, d.nf ? `NF ${d.nf}` : ""].filter(Boolean).join(" · ")}
                                </p>
                              )}
                              <p className="text-[11px] text-gray-400">
                                Compensou {fmtData(d.dataDebito)} → devolvido {fmtData(d.dataCredito)}
                                {d.motivoGrupo ? ` · ${d.motivoGrupo}` : ""}
                                {d.motivoReapresentavel === false ? " · não reapresentável" : ""}
                              </p>
                              {/* Resolução: quitação real encontrada ou pendência */}
                              {res.tipo === "conciliado" ? (
                                <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Já tratado: compensação e devolução deste cheque já foram conciliadas no extrato.
                                </p>
                              ) : res.tipo === "reapresentado" ? (
                                <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" /> Quitado: cheque reapresentado e compensado em {fmtData(res.data)}.
                                </p>
                              ) : res.tipo === "pix" ? (
                                <div className="mt-1">
                                  <p className="text-[11px] text-blue-700 flex items-center gap-1">
                                    <CheckCircle className="w-3.5 h-3.5" /> Quitado por outro meio (PIX/TED) em {fmtData(res.data)}{res.descricao ? ` — ${String(res.descricao).slice(0, 60)}` : ""}.
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap mt-1">
                                    {d.chequeNumero && (
                                      <button
                                        type="button"
                                        className="text-[11px] text-blue-600 hover:text-blue-800 underline"
                                        onClick={() => {
                                          const pixLine = repExtRaw.find((l: any) => l.id === res.lineId);
                                          setVincularPixSel(pixLine ?? null);
                                          setVincularPixDlg({ cheque: d, pixPreSel: pixLine ?? null });
                                        }}
                                      >
                                        ✓ Confirmar e registrar no Controle de Cheques
                                      </button>
                                    )}
                                    {res.lineId && (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                        onClick={() => {
                                          const pixLine = repExtRaw.find((l: any) => l.id === res.lineId);
                                          setConciliarPixDlg({ cheque: d, pixLineId: res.lineId, pixLine: pixLine ?? null });
                                          setBuscaConciliarPix(d.fornecedor ?? "");
                                          setConciliarPixEntry(null);
                                        }}
                                      >
                                        ⚡ Conciliar PIX no extrato
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : vinQuitado ? (
                                /* Rev. 3786 — vínculo registrado cobre 100%: mostrar como quitado */
                                <div className="mt-1 flex items-center gap-2">
                                  <p className="text-[11px] flex items-center gap-1 min-w-0 flex-1">
                                    <span className="text-emerald-700 flex items-center gap-1 min-w-0"><CheckCircle className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Quitado por substituição (PIX/TED registrado no controle de cheques).</span></span>
                                  </p>
                                  <button
                                    type="button"
                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                                    onClick={() => { setVincularPixSel(null); setVincularPixValor(""); setVincularPixBusca(""); setVincularPixDlg({ cheque: d, pixPreSel: null }); }}
                                  >
                                    <Zap className="w-3 h-3" /> Gerenciar vínculos
                                  </button>
                                </div>
                              ) : (
                                /* Rev. 3424/3747 — botão SEMPRE visível; dica de sugestão exata */
                                <div className="mt-1 flex items-center gap-2">
                                  <p className="text-[11px] flex items-center gap-1 min-w-0 flex-1">
                                    {vinSugN > 0 ? (
                                      <span className="text-blue-700 flex items-center gap-1 min-w-0"><Sparkles className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{vinSugN} PIX/TED de valor exato no extrato — confira e vincule.</span></span>
                                    ) : (
                                      <span className="text-amber-700 flex items-center gap-1 min-w-0"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Sem quitação identificada no período — analisar (reapresentar, cobrar ou substituir).</span></span>
                                    )}
                                  </p>
                                  <button
                                    type="button"
                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                    onClick={() => { setVincularPixSel(null); setVincularPixValor(""); setVincularPixBusca(""); setVincularPixDlg({ cheque: d, pixPreSel: null }); }}
                                  >
                                    <Zap className="w-3 h-3" /> Vincular PIX/TED
                                  </button>
                                </div>
                              )}
                              {/* Rev. 3747 — Cobertura por vínculo (parcial / quitado por substituição) + histórico/estorno */}
                              {vinN > 0 && (
                                <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-1.5">
                                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                    {vinQuitado ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full font-semibold bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" /> Quitado por substituição</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full font-semibold bg-amber-100 text-amber-700"><ArrowLeftRight className="w-3 h-3" /> Parcial</span>
                                    )}
                                    <span className="text-gray-600">Vinculado <strong className="text-gray-800">{formatBRL(vinAcumCents / 100)}</strong> de {formatBRL(vinTotalCents / 100)}{!vinQuitado && vinSaldoCents > 0 ? <> · saldo <strong className="text-rose-600">{formatBRL(vinSaldoCents / 100)}</strong></> : null}</span>
                                    <button type="button" className="ml-auto text-[11px] text-indigo-700 hover:text-indigo-900 underline" onClick={() => { setVincularPixSel(null); setVincularPixValor(""); setVincularPixBusca(""); setVincularPixDlg({ cheque: d, pixPreSel: null }); }}>Gerenciar vínculos</button>
                                  </div>
                                  <div className="mt-1 space-y-0.5">
                                    {(vinfo.vinculos ?? []).map((v: any) => (
                                      <div key={v.id} className="flex items-center gap-2 text-[11px] text-gray-600">
                                        <span className="text-gray-400">{v.tipo === "ajuste" ? "Ajuste" : "PIX/TED"}</span>
                                        <span className="font-medium text-gray-700">{formatBRL(Math.abs(Number(v.valor)))}</span>
                                        {v.data ? <span className="text-gray-400">{fmtData(v.data)}</span> : null}
                                        {v.pixContaApelido ? <span className="text-gray-400 truncate max-w-[140px]" title={v.pixContaApelido}>{v.pixContaApelido}</span> : null}
                                        <button type="button" disabled={estornarVinculoMut.isPending} className="ml-auto text-rose-600 hover:text-rose-800 underline disabled:opacity-50" onClick={async () => { try { await estornarVinculoMut.mutateAsync({ companyId: Number(companyId), vinculoId: Number(v.id) }); toast({ title: "Vínculo estornado" }); refreshAposVinculo(); } catch (e: any) { toast({ title: "Erro ao estornar", description: String(e?.message ?? e), variant: "destructive" }); } }}>estornar</button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Rev. 3742 — Desconsiderar/Reconsiderar do cálculo do % (NÃO apaga o cheque) */}
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {d.jaConciliado ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700" title="As duas linhas (compensação e devolução) deste cheque já foram conciliadas no extrato. Mostrado aqui apenas para histórico — não entra no cálculo do percentual.">
                                    <CheckCircle className="w-3 h-3" /> Conciliado no extrato
                                  </span>
                                ) : d.desconsiderado ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-gray-200 text-gray-600" title="Este par foi tirado do cálculo do percentual de conciliação. O cheque continua registrado.">
                                      <EyeOff className="w-3 h-3" /> Desconsiderado do %
                                    </span>
                                    <button
                                      type="button"
                                      disabled={desconsiderarChequeMut.isPending || reconsiderarChequeMut.isPending}
                                      className="text-[11px] text-gray-600 hover:text-gray-800 underline disabled:opacity-50"
                                      onClick={() => {
                                        const lineIds = [d.debitoId, d.creditoId].filter((x: any) => x != null);
                                        if (lineIds.length) reconsiderarChequeMut.mutate({ companyId, lineIds });
                                      }}
                                    >
                                      Reconsiderar no %
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={desconsiderarChequeMut.isPending || reconsiderarChequeMut.isPending}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50"
                                    title="Tira este par do CÁLCULO do percentual de conciliação SEM apagar o cheque. Use quando o pagamento real (PIX/TED) já foi conciliado em OUTRA conta — assim o % pode chegar a 100%."
                                    onClick={() => {
                                      const lineIds = [d.debitoId, d.creditoId].filter((x: any) => x != null);
                                      if (lineIds.length) desconsiderarChequeMut.mutate({ companyId, lineIds });
                                    }}
                                  >
                                    <EyeOff className="w-3 h-3" /> Desconsiderar da conciliação
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2 border-t bg-amber-50/40 text-[11px] text-amber-800">
                    Estes pares (compensação + devolução) foram retirados da lista "No extrato, sem lançamento" por terem saldo zero. Nenhuma baixa é feita automaticamente — confira e decida.
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Esquerda: no extrato, sem lançamento */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 space-y-1.5">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    No extrato, sem lançamento ({termoBusca || filterExtTipo !== "all" ? `${formatInt(repExtView.length)}/${formatInt(repExt.length)}` : formatInt(repExt.length)})
                  </CardTitle>
                  {repExt.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      {/* Rev. 3504/3506 — filtro Entrada / Saída */}
                      <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs">
                        <button type="button" onClick={() => setFilterExtTipo("all")} className={`px-2.5 py-1 transition-colors ${filterExtTipo === "all" ? "bg-gray-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Todos</button>
                        <button type="button" onClick={() => setFilterExtTipo(filterExtTipo === "entrada" ? "all" : "entrada")} className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${filterExtTipo === "entrada" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Entrada</button>
                        <button type="button" onClick={() => setFilterExtTipo(filterExtTipo === "saida" ? "all" : "saida")} className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${filterExtTipo === "saida" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Saída</button>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaExcel("extrato")} title="Exportar para Excel"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaPDF("extrato")} title="Exportar para PDF"><FileDown className="w-3.5 h-3.5 mr-1" />PDF</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => setExpandedList("extrato")} title="Expandir em tela cheia"><Maximize2 className="w-3.5 h-3.5 mr-1" />Expandir</Button>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {reportLoading ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Carregando…</div>
                  ) : repExt.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      {/* Rev. 3200 — a mensagem deriva do RELATÓRIO (fonte única), NÃO do
                          `statements` (query à parte). Antes, com o relatório zerado mas o
                          `statements` com qualquer linha em cache/filtrada, a tela mostrava
                          "Todo o extrato está conciliado 🎉" sem NADA ter sido conciliado
                          (repConc=0). Só dizemos "conciliado" quando HÁ conciliados de fato. */}
                      {repConc.length === 0 ? (
                        <>
                          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p>Nenhum extrato importado neste período.</p>
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
                            Importar Extrato
                          </Button>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                          <p>Todo o extrato está conciliado. 🎉</p>
                        </>
                      )}
                    </div>
                  ) : repExtView.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Nenhum item do extrato corresponde à busca.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {repExtView.map(renderExtratoRow)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Direita: no ERP, sem extrato + comprovantes */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 space-y-1.5">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    No ERP, sem extrato ({termoBusca || filterLanTipo !== "all" ? `${formatInt(repLanView.length)}/${formatInt(repLan.length)}` : formatInt(repLan.length)})
                  </CardTitle>
                  {repLan.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs">
                        <button type="button" onClick={() => setFilterLanTipo("all")} className={`px-2.5 py-1 transition-colors ${filterLanTipo === "all" ? "bg-gray-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Todos</button>
                        <button type="button" onClick={() => setFilterLanTipo(filterLanTipo === "entrada" ? "all" : "entrada")} className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${filterLanTipo === "entrada" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Entrada</button>
                        <button type="button" onClick={() => setFilterLanTipo(filterLanTipo === "saida" ? "all" : "saida")} className={`px-2.5 py-1 border-l border-gray-200 transition-colors ${filterLanTipo === "saida" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Saída</button>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaExcel("erp")} title="Exportar para Excel"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaPDF("erp")} title="Exportar para PDF"><FileDown className="w-3.5 h-3.5 mr-1" />PDF</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => setExpandedList("erp")} title="Expandir em tela cheia"><Maximize2 className="w-3.5 h-3.5 mr-1" />Expandir</Button>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {reportLoading ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Carregando…</div>
                  ) : repLan.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Nenhum lançamento sem extrato no período.</div>
                  ) : repLanView.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Nenhum lançamento do ERP corresponde à busca.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {repLanView.map((e: any) => renderEntryRow(e))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Rev. 3458 — Barra de conciliação manual: aparece quando o usuário selecionou
                uma linha do extrato (painel esquerdo) E um lançamento do ERP (painel direito).
                Chama o mesmo dialog "Confirmar conciliação?" do fluxo automático. */}
            {manualExtSel && manualLanSel && (() => {
              const delta = Math.abs(Math.abs(Number(manualExtSel.valor) || 0) - Math.abs(Number(manualLanSel.valor) || 0));
              const isDiff = delta > 0.009;
              return (
                <div className="rounded-xl border-2 border-blue-400 bg-blue-50 shadow-md px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    {/* Extrato selecionado */}
                    <div className="min-w-0 bg-white rounded-lg px-3 py-2 border border-rose-200">
                      <p className="text-[10px] text-rose-600 font-semibold uppercase tracking-wide mb-0.5">Extrato selecionado</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{manualExtSel.descricao || "—"}</p>
                      <p className="text-xs text-gray-500 tabular-nums">{fmtData(manualExtSel.data)} · <span className="font-semibold text-rose-600">{formatBRL(Math.abs(Number(manualExtSel.valor) || 0))}</span></p>
                    </div>
                    {/* Seta central */}
                    <div className="hidden sm:flex flex-col items-center gap-1 px-1 shrink-0">
                      <ArrowRight className="w-5 h-5 text-blue-500" />
                      {isDiff && (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 rounded px-1.5 py-px whitespace-nowrap">Δ {formatBRL(delta)}</span>
                      )}
                    </div>
                    {/* ERP selecionado */}
                    <div className="min-w-0 bg-white rounded-lg px-3 py-2 border border-amber-200">
                      <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide mb-0.5">Lançamento ERP selecionado</p>
                      <p className="text-sm font-medium text-blue-700 truncate">{manualLanSel.fornecedorNome || manualLanSel.descricao || "—"}</p>
                      <p className="text-xs text-gray-500 tabular-nums">{fmtData(manualLanSel.data)} · <span className="font-semibold text-amber-600">{formatBRL(Math.abs(Number(manualLanSel.valor) || 0))}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs text-gray-500 border-gray-300"
                      onClick={() => { setSelectedStatement(null); setSelectedEntry(null); setManualExtSel(null); setManualLanSel(null); }}
                    >
                      Limpar seleção
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none"
                      onClick={() => setConfirmGeralConciliar({ ext: manualExtSel, lan: manualLanSel })}
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1.5" />
                      Conciliar par
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* Rev. 3188 — Lançamentos SEM conta bancária definida (conta_bancaria_id NULL).
                Bloco à parte, fora do número da conta: o ERP não sabe de qual banco saíram,
                então são candidatos a casar com o extrato de QUALQUER conta. Colapsável. */}
            {repSemConta.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        Sem conta bancária definida ({formatInt(repSemConta.length)}) · {formatBRL(vSemConta)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t">
                      <p className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50/60">
                        Estes lançamentos não têm conta bancária informada no ERP — por isso aparecem em todas as contas e <strong>não entram no número "ERP sem extrato"</strong> acima. Você pode casá-los com o extrato desta conta normalmente.
                      </p>
                      {/* Rev. 3399 — contador de sugestões encontradas */}
                      {repSemConta.some((e: any) => e.sugLineId) && (
                        <div className="mx-4 mt-2 mb-1 flex items-center gap-1.5 text-[11px] text-blue-700">
                          <Sparkles className="w-3 h-3 text-blue-500" />
                          <span>{repSemConta.filter((e: any) => e.sugLineId).length} sugestão(ões) de conciliação encontrada(s) · clique em "Conciliar" para vincular</span>
                        </div>
                      )}
                      <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
                        {repSemConta.map((e: any) => (
                          <div key={e.id}>
                            {renderEntryRow(e)}
                            {e.sugLineId && (
                              <div className="mx-4 mb-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0 text-xs text-blue-800">
                                  <p className="font-semibold mb-0.5">Sugestão:</p>
                                  <p className="break-all leading-snug text-blue-700">{e.sugDesc || "—"}</p>
                                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-blue-600">
                                    <span>{e.sugData ? String(e.sugData).slice(0,10).split("-").reverse().join("/") : "—"}</span>
                                    <span>·</span>
                                    <span className="font-medium text-blue-800">{formatBRL(Math.abs(Number(e.sugValor)))}</span>
                                    <span>·</span>
                                    <span>{e.sugContaDesc || e.sugBanco || "—"}</span>
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 h-7 border-blue-400 text-blue-700 hover:bg-blue-100 text-xs gap-1 mt-0.5"
                                  onClick={() => setConfirmSemConta({ entry: e, sug: e })}
                                >
                                  <Link2 className="w-3 h-3" />Conciliar
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}

            {/* Conciliação manual do par selecionado */}
            {(selectedStatement || selectedEntry) && (() => {
              const ext = repExt.find((s: any) => s.id === selectedStatement);
              // Rev. 3188 — o lançamento selecionado pode estar na lista da conta OU na lista
              // "sem conta definida" (ambas casáveis contra o extrato desta conta).
              const lan = repLan.find((e: any) => e.id === selectedEntry) || repSemConta.find((e: any) => e.id === selectedEntry);
              const delta = ext && lan ? Math.abs(Math.abs(Number(ext.valor)) - Math.abs(Number(lan.valor))) : null;
              return (
                <Card className="border-0 shadow-sm ring-1 ring-blue-200">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Extrato</p>
                      <p className="text-sm font-medium truncate">{ext ? `${fmtData(ext.data)} · ${ext.descricao || "—"}` : "Selecione uma linha do extrato"}</p>
                      {ext && <p className="text-xs text-gray-500">{formatBRL(Math.abs(Number(ext.valor)))}</p>}
                    </div>
                    <Link2 className="w-5 h-5 text-blue-400 shrink-0 self-center" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Lançamento{lan?.agrupado ? ` · grupo (${formatInt(lan.qtd)} itens)` : ""}</p>
                      <p className="text-sm font-medium truncate">{lan ? (lan.fornecedorNome || lan.descricao || "—") : "Selecione um lançamento"}</p>
                      {lan && <p className="text-xs text-gray-500">{formatBRL(Math.abs(Number(lan.valor)))}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {delta != null && delta > 0.005 && <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-700">Δ {formatBRL(delta)}</span>}
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedStatement(null); setSelectedEntry(null); }}><X className="w-4 h-4" /></Button>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!ext || !lan || conciliarMut.isPending || conciliarGrupoMut.isPending}
                        onClick={() => {
                          if (!ext || !lan) return;
                          // Rev. 3239 — grupo unificado → conciliação N:1 (envia os itensIds).
                          if (lan.agrupado) conciliarGrupoMut.mutate({ companyId, statementLineId: ext.id, entryIds: lan.itensIds });
                          else conciliarMut.mutate({ companyId, statementLineId: ext.id, entryId: lan.id });
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />{(conciliarMut.isPending || conciliarGrupoMut.isPending) ? "Conciliando..." : "Conciliar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Já conciliados (colapsável) */}
            {repConc.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" />Já conciliados ({filterConcTipo !== "all" ? `${formatInt(repConcView.length)}/` : ""}{formatInt(repConc.length)}) · {formatBRL(vConc)}</span>
                      <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                        {/* Barra de ação em lote */}
                        {selectedConcIds.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setConfirmBulkDesconciliar(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 border border-amber-300 text-xs font-semibold hover:bg-amber-200 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />Desfazer {selectedConcIds.size} selecionado(s)
                          </button>
                        )}
                        {/* Selecionar todos (visíveis) */}
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors">
                          <Checkbox
                            checked={repConcView.length > 0 && repConcView.every((c: any) => selectedConcIds.has(Number(c.id)))}
                            onCheckedChange={(v) => {
                              if (v) setSelectedConcIds(prev => new Set([...prev, ...repConcView.map((c: any) => Number(c.id))]));
                              else setSelectedConcIds(prev => { const next = new Set(prev); repConcView.forEach((c: any) => next.delete(Number(c.id))); return next; });
                            }}
                          />
                          <span className="text-xs text-gray-500 select-none">Todos</span>
                        </div>
                        <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs">
                          <button type="button" onClick={() => setFilterConcTipo("all")} className={`px-2 py-1 transition-colors ${filterConcTipo === "all" ? "bg-gray-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Todos</button>
                          <button type="button" onClick={() => setFilterConcTipo(filterConcTipo === "entrada" ? "all" : "entrada")} className={`px-2 py-1 border-l border-gray-200 transition-colors ${filterConcTipo === "entrada" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Entrada</button>
                          <button type="button" onClick={() => setFilterConcTipo(filterConcTipo === "saida" ? "all" : "saida")} className={`px-2 py-1 border-l border-gray-200 transition-colors ${filterConcTipo === "saida" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Saída</button>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" />
                      </div>
                    </summary>
                    <div className="px-3 py-2 border-t bg-gray-50">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Buscar por descrição, fornecedor, data, valor…"
                          value={buscaJaConc}
                          onChange={(e) => setBuscaJaConc(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        {buscaJaConc && (
                          <button type="button" onClick={() => setBuscaJaConc("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto border-t">
                      {repConcView.length === 0 && termoJaConc && (
                        <p className="px-4 py-6 text-center text-xs text-gray-400">Nenhum resultado para "{buscaJaConc}"</p>
                      )}
                      {repConcView.map((c: any) => {
                        const isSelected = selectedConcIds.has(Number(c.id));
                        return (
                          <div key={c.id} className={`px-4 py-3 flex items-center gap-3 transition-colors ${isSelected ? "bg-amber-50" : ""}`}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {
                                setSelectedConcIds(prev => {
                                  const next = new Set(prev);
                                  next.has(Number(c.id)) ? next.delete(Number(c.id)) : next.add(Number(c.id));
                                  return next;
                                });
                              }}
                              className="shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-500">{fmtData(c.data)}</p>
                              <p className="text-sm text-gray-700 break-words">{c.descricao || "—"}</p>
                              <p className="text-xs text-gray-400 break-words">↔ {c.entryFornecedor || c.entryDescricao || `Lançamento #${c.entryId ?? ""}`}</p>
                              {c.substituiChequeDevolvido && (
                                <p className="text-[11px] text-emerald-700 break-words mt-0.5">
                                  🔗 Substitui <strong>cheque devolvido</strong>
                                  {c.substituiChequeDevolvido.doc ? <> Doc {c.substituiChequeDevolvido.doc}</> : c.substituiChequeDevolvido.chequeNumero ? <> nº {c.substituiChequeDevolvido.chequeNumero}</> : null}
                                  {" · "}{formatBRL(Number(c.substituiChequeDevolvido.valor || 0))}
                                  {c.substituiChequeDevolvido.criadoPorNome ? <> · vínculo por {c.substituiChequeDevolvido.criadoPorNome}</> : null}
                                </p>
                              )}
                            </div>
                            <p className={`text-sm font-bold shrink-0 ${Number(c.valor) >= 0 ? "text-green-600" : "text-red-500"}`}>{formatBRL(Math.abs(Number(c.valor)))}</p>
                            {c.entryId && (
                              <button
                                type="button"
                                onClick={() => setDetalheEntryId(Number(c.entryId))}
                                title="Ver detalhes do lançamento conciliado"
                                className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDesconciliar({ id: c.id, descricao: c.descricao || "—", valor: Number(c.valor) })}
                              title="Desfazer conciliação — a linha volta ao extrato pendente e o lançamento do ERP fica como pendente"
                              className="shrink-0 p-1.5 rounded-md text-gray-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <input ref={comprovInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx" onChange={onComprovanteFile} className="hidden" />

        <Dialog open={showImport} onOpenChange={(o) => { setShowImport(o); if (!o) { setImportContent(""); setImportFileName(""); setImportFiles([]); } }}>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-4 pr-14 border-b border-gray-100 space-y-0 shrink-0">
              <DialogTitle className="flex items-start gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Upload className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex flex-col justify-center">
                  <span className="block text-base font-semibold leading-tight">Importar Extrato Bancário</span>
                  <span className="block text-xs font-normal text-gray-500 leading-snug mt-1">
                    Anexe o extrato (OFX, QFX, CSV, PDF, imagem...)
                  </span>
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Conta Bancária</Label>
                {(() => {
                  const conta = (bankAccounts ?? []).find((b: any) => String(b.id) === importConta);
                  const periodo = periodoLabel;
                  if (!conta) return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">Selecione a conta bancária na tela antes de importar.</div>
                  );
                  const cor = bancoCor(conta.banco);
                  return (
                    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${cor.bg} ${cor.text}`}><Landmark className="w-4 h-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{conta.banco}{conta.descricao ? ` · ${conta.descricao}` : ""}</span>
                        <span className="block truncate text-[11px] text-gray-500">Ag. {formatAgencia(conta.agencia)}/{formatConta(conta.conta)} · {periodo}</span>
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Arquivo *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                    importContent
                      ? "border-green-300 bg-green-50/60 hover:bg-green-50"
                      : "border-gray-200 bg-gray-50/60 hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${importContent ? "bg-green-100 text-green-600" : "bg-white text-gray-400 border border-gray-200"}`}>
                    {importContent ? <Check className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium text-gray-700">
                    {importFileName || "Clique para selecionar um ou vários arquivos"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-400">
                    {importFiles.length > 1
                      ? `${importFiles.length} arquivos na fila · cada um vai pro seu mês/ano`
                      : importContent
                        ? `${(importFileName.split(".").pop() || "arquivo").toUpperCase()} · ${(importContent.length / 1024).toFixed(1)} KB carregado`
                        : "Vários de uma vez (OFX, QFX, CSV, PDF...)"}
                  </span>
                </button>
              </div>

              {importFormato === "csv" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Separador CSV</Label>
                  <Select value={csvSeparador} onValueChange={setCsvSeparador}>
                    <SelectTrigger className="w-full h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=";">Ponto e vírgula (;)</SelectItem>
                      <SelectItem value=",">Vírgula (,)</SelectItem>
                      <SelectItem value="\t">Tab</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-gray-400">
                    O CSV deve ter colunas: Data, Descrição, Valor (e opcionalmente Saldo)
                  </p>
                </div>
              )}

              {importFormato === "pdf" && (
                <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-px text-blue-500" />
                  PDF de extrato bancário detectado — as transações serão extraídas automaticamente (Caixa, Banco do Brasil e Santander por leitura direta; demais bancos por IA). Selecione a conta correta acima.
                </p>
              )}

              {importRunning && (
                <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-blue-800 truncate">
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                      <span className="truncate">{importLabel || "Processando..."}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">{importPct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${importPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 sm:gap-2 shrink-0">
              <Button variant="outline" onClick={() => setShowImport(false)} disabled={importRunning}>Cancelar</Button>
              <Button onClick={() => handleImport()} disabled={importRunning || (importFiles.length === 0 && !importContent) || !importConta}>
                {importRunning ? `Importando... ${importPct}%` : "Importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3363 — Proposta de RENDIMENTO de aplicação/resgate automático (CDB ContaMax) */}
        <AlertDialog open={showRendimento} onOpenChange={(o: boolean) => { if (!o && !lancarRendimentoMut.isPending) { setShowRendimento(false); setRendimentoPropostas([]); } }}>
          <AlertDialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
            <AlertDialogHeader className="space-y-0 text-left bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-white/15 p-2 shrink-0"><Sparkles className="w-5 h-5 text-white" /></div>
                <div>
                  <AlertDialogTitle className="text-white text-lg font-semibold leading-tight">Rendimento de aplicação automática detectado</AlertDialogTitle>
                  <AlertDialogDescription className="text-white/80 text-xs mt-1 leading-relaxed">
                    O extrato traz o rendimento apurado da aplicação automática (CDB ContaMax). Confira e confirme para registrar como <b>receita financeira</b> — com IOF e IR lançados separadamente.
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>
            <div className="px-6 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {rendimentoPropostas.map((p, idx) => {
                const liquido = Math.round((p.bruto - p.iof - p.ir) * 100) / 100;
                return (
                  <div key={idx} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-800">{String(p.competenciaMes).padStart(2, "0")}/{p.competenciaAno}</span>
                      <span className="text-[11px] text-gray-500 truncate max-w-[55%]" title={p.fileName}>{p.fileName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 text-sm">
                      <span className="text-gray-600">Rendimento bruto</span>
                      <span className="text-right font-medium text-emerald-700">{formatBRL(p.bruto)}</span>
                      <span className="text-gray-600">IOF</span>
                      <span className="text-right text-red-600">− {formatBRL(p.iof)}</span>
                      <span className="text-gray-600">IR</span>
                      <span className="text-right text-red-600">− {formatBRL(p.ir)}</span>
                      <span className="text-gray-800 font-semibold border-t pt-1 mt-1">Líquido</span>
                      <span className="text-right font-semibold text-gray-900 border-t pt-1 mt-1">{formatBRL(liquido)}</span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Serão criados lançamentos efetivos: 1 receita (bruto) + 1 despesa de IOF + 1 despesa de IR por competência. Confirmar de novo a mesma competência não duplica.
              </p>
            </div>
            <AlertDialogFooter className="border-t bg-gray-50 px-6 py-4">
              <AlertDialogCancel disabled={lancarRendimentoMut.isPending}>Agora não</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e: any) => { e.preventDefault(); confirmarRendimentos(); }}
                disabled={lancarRendimentoMut.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {lancarRendimentoMut.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Lançando...</> : "Lançar rendimento"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3179 — Confirmação de "Limpar extrato" (soft-delete por conta + período) */}
        {/* Rev. 3386 — Confirmação de exclusão de linha individual do extrato */}
        <AlertDialog open={!!confirmExcluirLinha} onOpenChange={(o: boolean) => { if (!o && !excluirLinhaMut.isPending) setConfirmExcluirLinha(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />Remover linha do extrato?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs">
                    <p className="font-medium text-gray-700 truncate">{confirmExcluirLinha?.descricao}</p>
                    <p className={`font-bold mt-0.5 ${(confirmExcluirLinha?.valor ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatBRL(Math.abs(confirmExcluirLinha?.valor ?? 0))}</p>
                  </div>
                  {confirmExcluirLinha?.conciliado ? (
                    <p>Esta linha <strong>está conciliada</strong>. Ao removê-la, o lançamento do ERP vinculado volta a ficar <strong>pendente</strong> (nada é apagado do ERP).</p>
                  ) : (
                    <p>A linha será removida do extrato. Se quiser reimportá-la futuramente, basta importar o extrato novamente.</p>
                  )}
                  <p className="text-[11px] text-gray-400">Esta ação é reversível reimportando o arquivo de extrato.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluirLinhaMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={excluirLinhaMut.isPending}
                onClick={(e: any) => {
                  e.preventDefault();
                  if (confirmExcluirLinha) excluirLinhaMut.mutate({ companyId, linhaId: confirmExcluirLinha.id });
                }}
              >
                {excluirLinhaMut.isPending ? "Removendo..." : "Sim, remover linha"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3396 — Desfazer conciliação (sem excluir a linha do extrato) */}
        {/* Rev. 3520 — AlertDialog: desfazer conciliação em lote */}
        <AlertDialog open={confirmBulkDesconciliar} onOpenChange={(o: boolean) => { if (!o && !bulkDesconciliarPending) setConfirmBulkDesconciliar(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />Desfazer {selectedConcIds.size} conciliação(ões)?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>As <strong>{selectedConcIds.size} linha(s) selecionada(s)</strong> voltarão para <strong>"No extrato, sem lançamento"</strong> e os lançamentos do ERP voltarão para <strong>pendente</strong>.</p>
                  <p className="text-[11px] text-gray-400">As linhas <em>não</em> são excluídas — você poderá conciliá-las novamente.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDesconciliarPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                disabled={bulkDesconciliarPending}
                onClick={(e: any) => { e.preventDefault(); executarBulkDesconciliar(); }}
              >
                {bulkDesconciliarPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Desfazendo...</> : `Sim, desfazer ${selectedConcIds.size}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmDesconciliar} onOpenChange={(o: boolean) => { if (!o && !desconciliarMut.isPending) setConfirmDesconciliar(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />Desfazer conciliação?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs">
                    <p className="font-medium text-gray-700 truncate">{confirmDesconciliar?.descricao}</p>
                    <p className={`font-bold mt-0.5 ${(confirmDesconciliar?.valor ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatBRL(Math.abs(confirmDesconciliar?.valor ?? 0))}</p>
                  </div>
                  <p>A linha voltará para <strong>"No extrato, sem lançamento"</strong> e o lançamento do ERP voltará para <strong>pendente</strong> (a pagar / a receber).</p>
                  <p className="text-[11px] text-gray-400">A linha <em>não</em> é excluída — você poderá conciliá-la com outro lançamento.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={desconciliarMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                disabled={desconciliarMut.isPending}
                onClick={(e: any) => {
                  e.preventDefault();
                  if (confirmDesconciliar) desconciliarMut.mutate({ companyId, linhaId: confirmDesconciliar.id });
                }}
              >
                {desconciliarMut.isPending ? "Desfazendo..." : "Sim, desfazer conciliação"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3399 — AlertDialog: conciliação de lançamento sem conta bancária */}
        <AlertDialog open={!!confirmSemConta} onOpenChange={(o: boolean) => { if (!o && !conciliarSemContaMut.isPending) setConfirmSemConta(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-600" />Confirmar conciliação
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p className="text-gray-600">O ERP encontrou uma correspondência no extrato. Confirme o par para conciliar e vincular a conta automaticamente.</p>
                  {confirmSemConta && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-200 text-[13px]">
                      <div className="flex items-start gap-2 px-3 py-2">
                        <ArrowUpCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{confirmSemConta.entry.fornecedorNome || confirmSemConta.entry.descricao || `Lançamento #${confirmSemConta.entry.id}`}</p>
                          <p className="text-gray-500 text-xs">{confirmSemConta.entry.data ? String(confirmSemConta.entry.data).slice(0,10).split("-").reverse().join("/") : "—"} · {confirmSemConta.entry.obraNome || "sem obra"} · <strong>{formatBRL(Math.abs(Number(confirmSemConta.entry.valor)))}</strong></p>
                          <p className="text-amber-600 text-[11px] font-medium mt-0.5">Sem conta bancária → será preenchido automaticamente</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 px-3 py-2 bg-blue-50/60">
                        <FileText className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{confirmSemConta.sug.sugDesc || "—"}</p>
                          <p className="text-gray-500 text-xs">{confirmSemConta.sug.sugData ? String(confirmSemConta.sug.sugData).slice(0,10).split("-").reverse().join("/") : "—"} · <strong>{formatBRL(Math.abs(Number(confirmSemConta.sug.sugValor)))}</strong></p>
                          <p className="text-blue-600 text-[11px] font-medium mt-0.5">Conta: {confirmSemConta.sug.sugContaDesc || confirmSemConta.sug.sugBanco || "—"}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={conciliarSemContaMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700"
                disabled={conciliarSemContaMut.isPending}
                onClick={() => {
                  if (confirmSemConta)
                    conciliarSemContaMut.mutate({ companyId, entryId: confirmSemConta.entry.id, statementLineId: confirmSemConta.sug.sugLineId });
                }}
              >
                {conciliarSemContaMut.isPending ? "Conciliando..." : "Confirmar conciliação"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmLimpar} onOpenChange={(o: boolean) => { if (!o) setConfirmLimpar(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" />Limpar extrato importado?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso remove as <strong>{formatInt((statements ?? []).length)}</strong> linha(s) de extrato da conta selecionada no período de <strong>{periodoLabel}</strong>.
                Os lançamentos do ERP que estavam conciliados com essas linhas voltam a ficar <strong>pendentes</strong> (nada é apagado do ERP).
                Use quando importou o extrato errado e quer reimportar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={limparMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={limparMut.isPending}
                onClick={(e: any) => { e.preventDefault(); limparMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim }); }}
              >
                {limparMut.isPending ? "Limpando..." : "Sim, limpar extrato"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3534 — Limpar TODOS os extratos do período (todas as contas). */}
        <AlertDialog open={showLimparMesDlg} onOpenChange={(o: boolean) => { if (!o && !limparExtratoMesMut.isPending) setShowLimparMesDlg(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Limpar extratos de todas as contas?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>
                    Isso remove <strong>todas as linhas de extrato</strong> de <strong>todas as contas bancárias</strong> no período de <strong>{periodoLabel}</strong>.
                  </p>
                  <p>
                    Os lançamentos do ERP que estavam conciliados voltam a ficar <strong>pendentes</strong> — nada é excluído do ERP.
                  </p>
                  <p className="text-amber-700 bg-amber-50 rounded px-3 py-2 text-[12px]">
                    ⚠ Use apenas para reimportar extratos durante a validação do sistema. Esta ação afeta <strong>todas as contas</strong> do período de uma vez.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={limparExtratoMesMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={limparExtratoMesMut.isPending}
                onClick={(e: any) => { e.preventDefault(); limparExtratoMesMut.mutate({ companyId, dataInicio, dataFim }); }}
              >
                {limparExtratoMesMut.isPending ? "Limpando..." : "Sim, limpar todos os extratos"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3201 — Confirmação OBRIGATÓRIA da conciliação: a sugestão automática é
            apenas sugestiva; o usuário revisa cada par (extrato → lançamento + valores)
            e só então confirma. Nada é gravado sem este passo. */}
        <AlertDialog open={confirmConciliar} onOpenChange={(o: boolean) => { if (!o && !conciliarSugMut.isPending) { setConfirmConciliar(false); setConfirmAiState("idle"); setConfirmAiChecked(new Set()); } }}>
          <AlertDialogContent className="p-0 gap-0 overflow-hidden" style={{ maxWidth: "min(42rem, calc(100vw - 1.5rem))" }}>
            <AlertDialogHeader className="space-y-0 text-left bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <AlertDialogTitle className="text-white text-lg font-semibold leading-tight">Confirmar conciliação?</AlertDialogTitle>
                  <AlertDialogDescription className="text-white/70 text-xs mt-1 leading-relaxed break-words">
                    As sugestões são apenas automáticas — a baixa dos lançamentos só é aplicada após a sua confirmação.
                  </AlertDialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                  <Link2 className="w-3.5 h-3.5" />{formatInt(sugSelecionadas.length)} par{sugSelecionadas.length === 1 ? "" : "es"} selecionado{sugSelecionadas.length === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/30 tabular-nums">
                  Total {formatBRL(sugSelecionadas.reduce((acc, s) => acc + Math.abs(s.extratoValor || 0), 0))}
                </span>
              </div>
            </AlertDialogHeader>
            <div className="px-6 py-4">
              <div className="border rounded-lg max-h-[45vh] overflow-y-auto divide-y text-sm bg-white">
                {sugSelecionadas.map(s => (
                  <div key={s.statementLineId} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50/80 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Extrato</div>
                      <div className="break-words text-gray-800">{s.extratoDescricao || "—"}</div>
                      <div className="text-xs text-gray-500 tabular-nums">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                    </div>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 shrink-0">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium flex items-center gap-1">
                        Lançamento
                        {overrideSug[s.statementLineId] && <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700">MANUAL</span>}
                      </div>
                      {(() => { const ov = overrideSug[s.statementLineId]; return (<>
                        <div className={`break-words font-medium ${ov ? "text-amber-700" : "text-blue-700"}`}>{ov ? (ov.fornecedorNome || ov.descricao || "—") : (s.entryFornecedor || s.entryDescricao || "—")}</div>
                        <div className="text-xs text-gray-500 tabular-nums">{ov ? `${fmtData(ov.data)} · ${formatBRL(Math.abs(ov.valor))}` : `${fmtData(s.entryData)} · ${formatBRL(Math.abs(s.entryValor))}`}</div>
                      </>); })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Rev. 3407 — Seção de análise IA inline: disparo MANUAL (não automático) */}
            {confirmAiState === "idle" && (
              <div className="px-6 py-2.5 border-t bg-gray-50 flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-400">Quer verificar as classificações antes de confirmar?</span>
                <Button size="sm" variant="outline" onClick={dispararConfirmAI}
                  className="h-7 text-xs border-violet-200 text-violet-700 hover:bg-violet-50 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />Verificar com IA
                </Button>
              </div>
            )}
            {confirmAiState === "loading" && (
              <div className="px-6 py-2.5 bg-violet-50 border-t flex items-center gap-2 text-xs text-violet-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                Verificando classificações com IA…
              </div>
            )}
            {confirmAiState === "error" && (
              <div className="px-6 py-2 bg-red-50 border-t text-xs text-red-600 flex items-center justify-between gap-2">
                <span><span className="font-medium">IA indisponível</span> — verifique manualmente.</span>
                <button className="text-[11px] underline underline-offset-2 text-red-500 shrink-0" onClick={dispararConfirmAI}>Tentar novamente</button>
              </div>
            )}
            {typeof confirmAiState === "object" && (() => {
              const resultados = (confirmAiState as any).resultados as BatchResult[];
              const withProbs = resultados.filter(r => r.sugestoes.length > 0);
              const okCount = resultados.filter(r => r.sugestoes.length === 0).length;
              const checkedCount = confirmAiChecked.size;
              const CAMPO_LABEL: Record<string, string> = { fornecedorNome: "Nome", contaId: "Categoria", descricao: "Descrição" };
              const toggleAllConf = () => {
                if (confirmAiChecked.size > 0) { setConfirmAiChecked(new Set()); return; }
                const all = new Set<string>();
                for (const r of withProbs) r.sugestoes.forEach((_: any, i: number) => all.add(`${r.statementLineId}-${i}`));
                setConfirmAiChecked(all);
              };
              if (withProbs.length === 0) {
                return (
                  <div className="px-6 py-2.5 bg-emerald-50 border-t text-xs text-emerald-700 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>IA verificou {resultados.length} classificação(ões) — <strong>tudo OK</strong></span>
                    {okCount > 0 && <span className="text-emerald-600 ml-auto">{okCount} pares</span>}
                  </div>
                );
              }
              return (
                <div className="border-t">
                  <div className="px-6 py-2 bg-amber-50 flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <strong>{withProbs.length}</strong> classificação(ões) a revisar
                      {okCount > 0 && <span className="text-amber-600 font-normal">· {okCount} OK</span>}
                    </span>
                    <button className="text-[11px] text-amber-700 underline underline-offset-2 shrink-0" onClick={toggleAllConf}>
                      {checkedCount > 0 ? "Desmarcar todas" : "Marcar todas"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y bg-amber-50/30">
                    {withProbs.map((r: BatchResult) => {
                      const sug = sugSelecionadas.find((s: any) => s.statementLineId === r.statementLineId);
                      return (
                        <div key={r.statementLineId} className="px-6 py-2.5">
                          <p className="text-[11px] text-gray-500 mb-1.5 break-words">{sug?.extratoDescricao ?? "—"} <span className="text-gray-400">→ {sug?.entryFornecedor || sug?.entryDescricao || "—"}</span></p>
                          {r.sugestoes.map((sg: AiSugestao, idx: number) => {
                            const key = `${r.statementLineId}-${idx}`;
                            const ck = confirmAiChecked.has(key);
                            return (
                              <label key={key} className="flex items-start gap-2 mt-1 cursor-pointer group">
                                <input type="checkbox" checked={ck} onChange={e => {
                                  const next = new Set(confirmAiChecked);
                                  e.target.checked ? next.add(key) : next.delete(key);
                                  setConfirmAiChecked(next);
                                }} className="mt-0.5 accent-violet-600 shrink-0" />
                                <span className="text-[11px] leading-snug">
                                  <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mr-1">{CAMPO_LABEL[sg.campo] ?? sg.campo}</span>
                                  <span className="line-through text-gray-400">{sg.valorAtual || "—"}</span>
                                  <span className="text-gray-400 mx-1">→</span>
                                  <span className="font-semibold text-violet-800">{sg.campo === "contaId" ? (sg.contaNomeSugerida || sg.sugestao) : sg.sugestao}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  {checkedCount > 0 && (
                    <div className="px-6 py-2 border-t bg-amber-50 flex justify-end">
                      <Button size="sm" onClick={aplicarConfirmCorrecoes}
                        className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-amber-500">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        Aplicar {checkedCount} correção(ões) antes de confirmar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
            <AlertDialogFooter className="border-t bg-gray-50 px-6 py-4">
              <AlertDialogCancel disabled={conciliarSugMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={conciliarSugMut.isPending || sugSelecionadas.length === 0}
                onClick={(e: any) => { e.preventDefault(); confirmarConciliacao(); }}
              >
                {conciliarSugMut.isPending ? "Conciliando..." : `Confirmar conciliação (${formatInt(sugSelecionadas.length)})`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3319 — Confirmação da conciliação 1-a-1 feita NO PANORAMA (regra de ouro:
            nada concilia/baixa sem confirmação explícita). Grava o vínculo na conta correta. */}
        <AlertDialog open={!!confirmGeralConciliar} onOpenChange={(o: boolean) => { if (!o && !conciliarMut.isPending && !conciliarGrupoMut.isPending) setConfirmGeralConciliar(null); }}>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar conciliação?</AlertDialogTitle>
              <AlertDialogDescription>
                A baixa do lançamento só é aplicada após a sua confirmação. O vínculo é gravado na conta de origem da linha do extrato.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmGeralConciliar && (() => {
              const { ext, lan } = confirmGeralConciliar;
              const delta = Math.abs(Math.abs(Number(ext?.valor) || 0) - Math.abs(Number(lan?.valor) || 0));
              return (
                <div className="border rounded-lg divide-y text-sm bg-white overflow-hidden">
                  <div className="px-3 py-2.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Extrato · {ext?.contaLabel}</div>
                    <div className="text-gray-800 break-words">{ext?.descricao || "—"}</div>
                    <div className="text-xs text-gray-500 tabular-nums mt-0.5">{fmtData(ext?.data)} · {formatBRL(Math.abs(Number(ext?.valor) || 0))}</div>
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Lançamento (ERP){lan?.contaLabel ? ` · ${lan.contaLabel}` : ""}</div>
                    <div className="text-blue-700 font-medium break-words">{lan?.fornecedorNome || lan?.descricao || "—"}</div>
                    <div className="text-xs text-gray-500 tabular-nums mt-0.5">{fmtData(lan?.data)} · {formatBRL(Math.abs(Number(lan?.valor) || 0))}</div>
                  </div>
                  <div className="px-3 py-2 flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-500">Diferença (Δ)</span>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${delta === 0 ? "text-green-600" : "text-amber-600"}`}>{formatBRL(delta)}</span>
                  </div>
                </div>
              );
            })()}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={conciliarMut.isPending || conciliarGrupoMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700"
                disabled={conciliarMut.isPending || conciliarGrupoMut.isPending}
                onClick={(e: any) => {
                  e.preventDefault();
                  const par = confirmGeralConciliar;
                  if (!par?.ext || !par?.lan) return;
                  if (par.lan.agrupado) conciliarGrupoMut.mutate({ companyId, statementLineId: par.ext.id, entryIds: par.lan.itensIds });
                  else conciliarMut.mutate({ companyId, statementLineId: par.ext.id, entryId: par.lan.id });
                }}
              >
                {(conciliarMut.isPending || conciliarGrupoMut.isPending) ? "Conciliando..." : "Confirmar conciliação"}
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
                    {mismatch.fora > 0 ? <> ({formatInt(mismatch.fora)} de {formatInt(mismatch.total)} transações fora do mês selecionado)</> : null}.
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
                  if (mismatch) { setAno(mismatch.anoNum); setMesSel(mismatch.mesNum); }
                  setMismatch(null);
                  setTimeout(() => handleImport(true), 0);
                }}
              >
                {mismatch ? `Trocar para ${MESES[mismatch.mesNum - 1]}/${mismatch.anoNum} e importar` : "Importar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3198 — Lançar no ERP direto do item do extrato (data/conta/valor pré-preenchidos) */}
        <Dialog open={lancStatement != null} onOpenChange={(o: boolean) => { if (!o && !lancBusy) setLancStatement(null); }}>
          <DialogContent resizable={false} className="max-w-none w-screen h-[100dvh] max-h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 border-0 shadow-none p-0 gap-0 flex flex-col rounded-none overflow-hidden [&_[data-slot=dialog-close]]:text-white/80 [&_[data-slot=dialog-close]]:hover:text-white [&_[data-slot=dialog-maximize]]:hidden">
            <DialogHeader className="shrink-0 space-y-0 text-left bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5">
              <div className="flex items-start gap-3 pr-12">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 shrink-0">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-white text-lg font-semibold leading-tight">{lancStatement && (lancStatement.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0) ? "Lançar no Contas a Receber" : "Lançar no Contas a Pagar"}</DialogTitle>
                  <DialogDescription className="text-white/70 text-xs mt-1 leading-relaxed">
                    {lancStatement && (lancStatement.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0)
                      ? <>Indique <span className="font-medium text-white/90">quem pagou (cliente)</span> e gere o título em <span className="font-medium text-white/90">Contas a Receber</span>{lancStatement?.id != null ? <> Concilie com esta linha do extrato agora ou só lance e concilie depois.</> : <>.</>}</>
                      : <>Indique o <span className="font-medium text-white/90">fornecedor</span> e gere a conta em <span className="font-medium text-white/90">Contas a Pagar</span>{lancStatement?.id != null ? <>. Concilie com esta linha do extrato agora ou só lance e concilie depois.</> : <>.</>}</>}
                  </DialogDescription>
                </div>
              </div>
              {lancStatement && (
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                    <Landmark className="w-3.5 h-3.5" />{lancContaLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20 tabular-nums">
                    {fmtData(lancStatement.data)}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ring-1 ${Number(lancStatement.valor) >= 0 ? "bg-emerald-400/20 text-emerald-100 ring-emerald-300/30" : "bg-red-400/20 text-red-100 ring-red-300/30"}`}>
                    {Number(lancStatement.valor) >= 0 ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                    {formatBRL(Math.abs(Number(lancStatement.valor) || 0))}
                  </span>
                </div>
              )}
            </DialogHeader>
            {lancStatement && (
              <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-6 py-4 sm:px-8">
                {/* Rev. 3324 — Dados do extrato bem formatados (valor/data/conta/descrição). */}
                <div className={`rounded-xl border p-4 ${Number(lancStatement.valor) >= 0 ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70"}`}>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    <FileText className="w-3.5 h-3.5" />Dados do extrato
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-2xl sm:text-3xl font-bold tabular-nums ${Number(lancStatement.valor) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {Number(lancStatement.valor) >= 0 ? "+ " : "− "}{formatBRL(Math.abs(Number(lancStatement.valor) || 0))}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        {Number(lancStatement.valor) >= 0 ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDownCircle className="w-3.5 h-3.5 text-red-500" />}
                        {Number(lancStatement.valor) >= 0 ? "Entrada (crédito)" : "Saída (débito)"} · {fmtData(lancStatement.data)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 max-w-full">
                      <Landmark className="w-3.5 h-3.5 text-gray-500 shrink-0" /><span className="truncate">{lancContaLabel}</span>
                    </span>
                  </div>
                  {lancStatement.descricao && (
                    <p className="mt-3 text-sm text-gray-700 break-words border-t border-black/5 pt-2 leading-relaxed">{lancStatement.descricao}</p>
                  )}
                </div>
                {/* Rev. 3390/3391 — Aviso + ação quando o extrato detecta movimentação interna */}
                {lancStatement.interno && lancStatement.overrideNatureza !== "efetivo" && !lancStatement.chequeFornecedor && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    <div className="flex gap-2.5">
                      <span className="text-lg leading-none mt-px shrink-0">⚠️</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold mb-0.5">Possível movimentação interna</p>
                        <p className="text-xs text-amber-800 leading-relaxed">O CNPJ ou nome desta empresa está cadastrado como movimentação interna. Transferências entre contas do grupo não geram lançamento — confirme antes de prosseguir.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-amber-200">
                      <button
                        type="button"
                        disabled={naturezaInternaMut.isPending || lancBusy}
                        onClick={() => {
                          if (!lancStatement?.id) return;
                          naturezaInternaMut.mutate({
                            companyId,
                            lineId: Number(lancStatement.id),
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {naturezaInternaMut.isPending
                          ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />Salvando…</>
                          : <>✓ Confirmar: é movimentação interna</>}
                      </button>
                      <p className="text-[10px] text-amber-700 self-center leading-tight">Registra como interna e fecha esta tela. Não gera lançamento.</p>
                    </div>
                  </div>
                )}
                {lancStatement.chequeFornecedor && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800">
                    🪙 Identificado no <strong>Controle de Cheques</strong>: cheque nº <strong>{lancStatement.chequeNumero ?? "—"}</strong> — <strong>{lancStatement.chequeFornecedor}</strong>
                    {lancStatement.chequeObraNome ? <> · obra <strong>{lancStatement.chequeObraNome}</strong></> : null}
                    {lancStatement.chequeNf ? <> · NF {lancStatement.chequeNf}</> : null}
                    {lancStatement.chequeVencimento ? <> · venc. {fmtData(lancStatement.chequeVencimento)}</> : null}
                    . Fornecedor, obra e forma de pagamento já foram pré-preenchidos — confira a categoria e o centro de custo.
                  </div>
                )}
                {lancStatement.faturaId && !lancStatement.chequeFornecedor && (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800">
                    💳 Identificado no <strong>Controle de Cartão de Crédito</strong>: fatura do cartão <strong>{lancStatement.faturaCartao ?? "—"}</strong>
                    {lancStatement.faturaMesRef ? <> · ref. <strong>{String(lancStatement.faturaMesRef).padStart(2, "0")}/{lancStatement.faturaAnoRef ?? ""}</strong></> : null}
                    {lancStatement.faturaVencimento ? <> · venc. {fmtData(lancStatement.faturaVencimento)}</> : null}
                    {lancStatement.faturaTotal != null ? <> · total <strong>{formatBRL(Math.abs(Number(lancStatement.faturaTotal)))}</strong></> : null}
                    . Aqui a fatura entra como <strong>um único pagamento</strong> (forma = cartão); o detalhe dos gastos por obra/centro de custo fica no módulo <strong>Cartão de Crédito</strong>.
                  </div>
                )}
                {!lancStatement.chequeFornecedor && !lancStatement.faturaId && (lancStatement.demoBeneficiario || lancStatement.demoTipo) && (
                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-800">
                    {lancStatement.demoTipo === "boleto" ? "🧾" : "💸"} Identificado nos <strong>Demonstrativos de pagamento</strong> (leitura por IA): {lancStatement.demoTipo === "boleto" ? <strong>Boleto</strong> : lancStatement.demoTipo === "ted" ? <strong>TED</strong> : <strong>PIX</strong>}
                    {lancStatement.demoBeneficiario ? <> — <strong>{lancStatement.demoBeneficiario}</strong></> : null}
                    {lancStatement.demoDocumento ? <> · CNPJ/CPF {lancStatement.demoDocumento}</> : null}
                    {lancStatement.demoMatch === "valor" ? <> · <strong>correspondência provável</strong> (só pelo valor — confira no comprovante)</> : null}
                    . Beneficiário e forma de pagamento já foram pré-preenchidos — confira obra, categoria e centro de custo.
                  </div>
                )}
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-1">{(lancStatement?.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0) ? "Recebível · valores & data" : "Pagamento · valores & data"}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{(lancStatement?.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0) ? "Data de competência / vencimento" : "Data"}</Label>
                    <Input type="date" value={lancForm.data} onChange={(e) => setLancForm(f => ({ ...f, data: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      inputMode="numeric"
                      className="tabular-nums"
                      value={lancForm.valor}
                      onChange={(e) => setLancForm(f => ({ ...f, valor: maskBRLInput(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    {lancStatement?.id == null ? (
                      <div className="flex rounded-md border overflow-hidden h-9">
                        <button
                          type="button"
                          onClick={() => setLancForm(f => ({ ...f, tipo: "despesa" }))}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors ${lancForm.tipo === "despesa" ? "bg-red-500 text-white" : "bg-white text-gray-500 hover:bg-red-50"}`}
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" />Débito
                        </button>
                        <button
                          type="button"
                          onClick={() => setLancForm(f => ({ ...f, tipo: "receita" }))}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors border-l ${lancForm.tipo === "receita" ? "bg-emerald-500 text-white" : "bg-white text-gray-500 hover:bg-emerald-50"}`}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />Crédito
                        </button>
                      </div>
                    ) : (
                      <div className={`h-9 px-3 flex items-center rounded-md border text-sm font-medium ${Number(lancStatement.valor) >= 0 ? "text-green-700 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"}`}>
                        {Number(lancStatement.valor) >= 0 ? "Receita → Contas a Receber" : "Despesa → Contas a Pagar"}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Forma de pagamento</Label>
                    <LancCombo
                      value={FORMAS_PAG_OPTS.find(f => f.id === lancForm.formaPagamento)?.label ?? ""}
                      onChangeText={() => {}}
                      onSelect={(opt) => setLancForm(f => ({ ...f, formaPagamento: opt ? String(opt.id) : "" }))}
                      options={FORMAS_PAG_OPTS}
                      placeholder="— (nenhuma) —"
                      noneLabel="— (nenhuma) —"
                      onClear={() => setLancForm(f => ({ ...f, formaPagamento: "" }))}
                    />
                  </div>
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-1">Classificação</div>
                {(lancStatement?.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0) ? (
                  <div>
                    <Label className="text-xs flex items-center gap-1.5 justify-between w-full">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-emerald-600" />Cliente que pagou</span>
                      <button type="button" onClick={() => { setLancNewClienteNome(""); setLancNewClienteOpen(true); }} className="text-blue-600 hover:text-blue-800 font-medium text-[11px] flex items-center gap-0.5 transition-colors">
                        <Plus className="w-3 h-3" />Novo cliente
                      </button>
                    </Label>
                    <LancCombo
                      value={lancForm.clienteNome}
                      onChangeText={(s) => setLancForm(f => ({ ...f, clienteNome: s, clienteId: "", obraId: "", }))}
                      onSelect={(opt) => {
                        if (!opt) { setLancForm(f => ({ ...f, clienteNome: "", clienteId: "", obraId: "" })); setLancObraDisplay(""); return; }
                        setLancForm(f => ({ ...f, clienteNome: opt.label, clienteId: String(opt.id), obraId: "" }));
                        setLancObraDisplay("");
                      }}
                      options={clienteOpts.map(c => ({ id: c.id, label: c.nome }))}
                      placeholder="Digite ou selecione o cliente"
                      noneLabel="— (sem cliente) —"
                      onClear={() => { setLancForm(f => ({ ...f, clienteNome: "", clienteId: "", obraId: "" })); setLancObraDisplay(""); }}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Selecione do cadastro de clientes para o título entrar com o pagador correto no Contas a Receber.</p>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-red-600" />Fornecedor
                      {lancFornDisplay && !lancForm.fornecedorNome && (
                        <span className="text-[10px] text-amber-600 font-normal ml-1">selecione da lista para confirmar ↓</span>
                      )}
                      {lancForm.fornecedorNome && (
                        <span className="text-[10px] text-emerald-600 font-normal ml-1">✓ confirmado</span>
                      )}
                    </Label>
                    <LancCombo
                      value={lancFornDisplay}
                      onChangeText={(s) => { setLancFornDisplay(s); setLancForm(f => ({ ...f, fornecedorNome: "" })); }}
                      onSelect={(opt) => {
                        if (!opt) { setLancFornDisplay(""); setLancForm(f => ({ ...f, fornecedorNome: "" })); return; }
                        setLancFornDisplay(opt.label);
                        setLancForm(f => ({ ...f, fornecedorNome: opt.label }));
                      }}
                      options={lancFornOpts}
                      placeholder="Buscar fornecedor do cadastro…"
                      noneLabel="— (sem fornecedor) —"
                      onClear={() => { setLancFornDisplay(""); setLancForm(f => ({ ...f, fornecedorNome: "" })); }}
                    />
                    {lancStatement.vinculoTipo === "fornecedor" && lancStatement.vinculoNome && (
                      <p className="text-[11px] text-gray-500 mt-1 flex items-start gap-1">
                        <span className="shrink-0">🏢</span>
                        <span>
                          {lancStatement.vinculoVia === "cnpj"
                            ? <>Cadastro <strong>{lancStatement.vinculoNome}</strong> (CNPJ confere) — busque e selecione na lista acima para confirmar.</>
                            : <>Sugestão: <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => { setLancFornDisplay(String(lancStatement.vinculoNome)); setLancForm(f => ({ ...f, fornecedorNome: "" })); }}>{lancStatement.vinculoNome}</button> — {lancStatement.vinculoConfianca === "media" ? "boa correspondência por nome" : "palpite (baixa confiança)"}. Clique no nome acima para pré-filtrar, depois selecione da lista.</>}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <Label className="text-xs">Obra{lancForm.clienteNome ? <span className="text-[10px] text-blue-600 font-normal ml-1">sugerido por cliente · digite p/ buscar todas</span> : ""}</Label>
                    <button type="button" className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                      onClick={() => { setLancNewObraNome(""); setLancNewObraOpen(true); }}>
                      <Plus className="w-3 h-3" />Nova obra
                    </button>
                  </div>
                  <LancCombo
                    value={lancObraDisplay}
                    onChangeText={(s) => { setLancObraDisplay(s); if (!s) setLancForm(f => ({ ...f, obraId: "" })); }}
                    onSelect={(opt) => { if (!opt) { setLancForm(f => ({ ...f, obraId: "" })); setLancObraDisplay(""); return; } setLancForm(f => ({ ...f, obraId: String(opt.id) })); setLancObraDisplay(opt.label); }}
                    options={obrasParaLanc.map(o => ({ id: o.id, label: o.nome }))}
                    placeholder="— Sem obra —"
                    noneLabel="— Sem obra —"
                    onClear={() => { setLancForm(f => ({ ...f, obraId: "" })); setLancObraDisplay(""); }}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <Label className="text-xs">Categoria (Conta do Plano de Contas)</Label>
                    <button type="button" className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                      onClick={() => { setLancNewCatNome(""); setLancNewCatTipo(lancStatement?.id == null ? (lancForm.tipo as "despesa"|"receita") : (Number(lancStatement.valor) < 0 ? "despesa" : "receita")); setLancNewCatOpen(true); }}>
                      <Plus className="w-3 h-3" />Nova categoria
                    </button>
                  </div>
                  <LancCombo
                    value={lancForm.contaNome}
                    onChangeText={(s) => setLancForm(f => ({ ...f, contaNome: s, contaId: "" }))}
                    onSelect={(opt) => {
                      if (!opt) { setLancForm(f => ({ ...f, contaId: "", contaNome: "" })); return; }
                      const catOpt = catOpts.find(c => c.id === Number(opt.id));
                      setLancForm(f => ({ ...f, contaId: String(opt.id), contaNome: opt.label, centroCustoId: catOpt?.centroCustoId != null && !f.centroCustoId ? String(catOpt.centroCustoId) : f.centroCustoId }));
                      if (catOpt?.centroCustoId != null) { const cc = ccOpts.find(c => c.id === catOpt.centroCustoId); if (cc) setLancCCDisplay(cc.nome); }
                    }}
                    options={catOpts.filter(c => { const isEntrada = lancStatement?.id == null ? lancForm.tipo === "receita" : Number(lancStatement?.valor ?? 0) >= 0; return c.tipo === (isEntrada ? "receita" : "despesa"); }).map(c => ({ id: c.id, label: c.nome }))}
                    placeholder="Pesquisar categoria…"
                    noneLabel="— Sem categoria —"
                    onClear={() => setLancForm(f => ({ ...f, contaId: "", contaNome: "" }))}
                  />
                </div>
                {(lancStatement?.id == null ? lancForm.tipo === "despesa" : Number(lancStatement.valor) < 0) && (
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <Label className="text-xs">Centro de custo</Label>
                      <button type="button" className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                        onClick={() => { setLancNewCCNome(""); setLancNewCCOpen(true); }}>
                        <Plus className="w-3 h-3" />Novo centro de custo
                      </button>
                    </div>
                    <LancCombo
                      value={lancCCDisplay}
                      onChangeText={(s) => { setLancCCDisplay(s); if (!s) setLancForm(f => ({ ...f, centroCustoId: "" })); }}
                      onSelect={(opt) => { if (!opt) { setLancForm(f => ({ ...f, centroCustoId: "" })); setLancCCDisplay(""); return; } setLancForm(f => ({ ...f, centroCustoId: String(opt.id) })); setLancCCDisplay(opt.label); }}
                      options={ccOpts.map(c => ({ id: c.id, label: c.nome }))}
                      placeholder="— Sem centro de custo —"
                      noneLabel="— Sem centro de custo —"
                      onClear={() => { setLancForm(f => ({ ...f, centroCustoId: "" })); setLancCCDisplay(""); }}
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Descrição{(lancStatement?.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0) ? " *" : ""}</Label>
                  <Textarea rows={2} value={lancForm.descricao} onChange={(e) => setLancForm(f => ({ ...f, descricao: e.target.value }))} placeholder={(lancStatement?.id == null ? lancForm.tipo === "receita" : Number(lancStatement.valor) >= 0) ? "Ex.: Medição 03 — Obra X" : "Descrição do pagamento"} />
                </div>
              </div>
            )}
            <DialogFooter className="shrink-0 border-t bg-gray-50 px-6 py-4 flex-col-reverse gap-2 sm:flex-row sm:gap-2">
              {/* Botão manual de movimentação interna — sempre disponível quando há linha de extrato */}
              {lancStatement?.id != null && (
                <Button
                  variant="ghost"
                  type="button"
                  className="w-full sm:w-auto sm:mr-auto text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                  disabled={naturezaInternaMut.isPending || lancBusy}
                  onClick={() => naturezaInternaMut.mutate({ companyId, lineId: Number(lancStatement.id) })}
                  title="Registrar esta linha como transferência interna entre contas do grupo (não gera lançamento no Contas a Pagar/Receber)"
                >
                  {naturezaInternaMut.isPending
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando…</>
                    : <><ArrowLeftRight className="w-4 h-4 mr-1.5" />É movimentação interna</>}
                </Button>
              )}
              <Button variant="outline" className="w-full sm:w-auto" disabled={lancBusy} onClick={() => setLancStatement(null)}>Cancelar</Button>
              <Button variant="outline" className="w-full sm:w-auto" disabled={lancBusy} onClick={() => submitLancar(false)}>
                {lancBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}{lancStatement?.id == null ? "Criar lançamento" : "Só lançar"}
              </Button>
              {lancStatement?.id != null && (
                <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700" disabled={lancBusy} onClick={() => submitLancar(true)}>
                  {lancBusy ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Processando...</> : <><Check className="w-4 h-4 mr-1.5" />Lançar e conciliar</>}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3414 — Dialog confirmar exclusão de lançamento (só admin_master) */}
        <Dialog open={deleteEntryTarget != null} onOpenChange={(o) => { if (!o) setDeleteEntryTarget(null); }}>
          <DialogContent className="max-w-sm w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-red-700">
                <Trash2 className="w-4 h-4" />Excluir lançamento do ERP
              </DialogTitle>
              <DialogDescription className="text-xs">
                Esta ação é permanente. O lançamento será removido do Contas a Pagar/Receber.
              </DialogDescription>
            </DialogHeader>
            {deleteEntryTarget && (
              <div className="space-y-3 py-1">
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-800 truncate">{deleteEntryTarget.nome}</p>
                  <p className="text-xs text-gray-500">{formatBRL(deleteEntryTarget.valor)}</p>
                </div>
                <div>
                  <Label className="text-xs">Motivo da exclusão <span className="text-red-500">*</span></Label>
                  <Textarea
                    rows={2}
                    value={deleteEntryMotivo}
                    onChange={e => setDeleteEntryMotivo(e.target.value)}
                    placeholder="Descreva o motivo (mín. 5 caracteres)"
                    autoFocus
                  />
                  {deleteEntryMotivo.length > 0 && deleteEntryMotivo.length < 5 && (
                    <p className="text-[11px] text-red-500 mt-0.5">Mínimo 5 caracteres.</p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteEntryTarget(null)} disabled={deleteEntryMut.isPending}>Cancelar</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteEntryMotivo.trim().length < 5 || deleteEntryMut.isPending || !deleteEntryTarget}
                onClick={async () => {
                  if (!deleteEntryTarget || !companyId) return;
                  try {
                    await deleteEntryMut.mutateAsync({ id: deleteEntryTarget.id, companyId: Number(companyId), motivo: deleteEntryMotivo.trim() });
                    setDeleteEntryTarget(null);
                    toast({ title: "Lançamento excluído", description: deleteEntryTarget.nome });
                    setReportStale(true);
                    // Rev. 3735 — atualiza também a lista do Caixa Interno (botão de excluir das linhas).
                    if (contaSelecionadaCaixaInterno) refetchCaixa();
                  } catch (err: any) {
                    toast({ title: "Erro ao excluir", description: String(err?.message ?? err), variant: "destructive" });
                  }
                }}
              >
                {deleteEntryMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3735 — ALERTA DE DUPLICIDADE (Caixa Interno): avisa antes de criar um lançamento
            que já existe (mesma conta/valor/data). O usuário decide: cancelar ou criar mesmo assim. */}
        <AlertDialog open={dupCaixaDialog != null} onOpenChange={(o: boolean) => { if (!o && !lancBusy) setDupCaixaDialog(null); }}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-5 h-5" />Possível lançamento duplicado
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>
                    Já existe {(dupCaixaDialog?.matches?.length ?? 0) > 1 ? "lançamentos" : "um lançamento"} nesta
                    conta com o <strong>mesmo valor</strong> e a <strong>mesma data</strong>. Confira antes de criar
                    outro:
                  </p>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/60 divide-y divide-amber-100 max-h-56 overflow-auto">
                    {(dupCaixaDialog?.matches ?? []).map((m: any) => {
                      const v = Math.abs(Number(m.valorRealizado ?? m.valorPrevisto) || 0);
                      const nm = m.fornecedorNome || m.clienteNome || m.descricao || `Lançamento #${m.id}`;
                      return (
                        <div key={m.id} className="px-3 py-2 text-sm">
                          <p className="font-medium text-gray-800 break-words">{nm}</p>
                          <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                            <span>{m.dataCompetencia ? String(m.dataCompetencia).slice(0,10).split("-").reverse().join("/") : "—"}</span>
                            <span className="font-medium text-gray-700">{formatBRL(v)}</span>
                            <span>· {m.status}</span>
                            {Number(m.conciliado) === 1 && <span className="text-green-600">· confirmado</span>}
                            {m.origemModulo && <span className="text-gray-400">· {m.origemModulo}</span>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={lancBusy}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={lancBusy}
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  const d = dupCaixaDialog;
                  setDupCaixaDialog(null);
                  if (d) submitLancar(d.conciliar, true);
                }}
              >
                Criar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3429/3747 — Portal full-screen nativo. Vínculo PARCIAL (1 cheque ↔ N pagamentos),
            busca em TODAS as contas, histórico + estorno por vínculo, "Quitar saldo" (ajuste).
            REGRA DE OURO: vincular NUNCA cria/altera linha no extrato — só marca o cheque. */}
        {vincularPixDlg != null && createPortal((() => {
          // Rev. 3750 — o cheque guardado no estado do diálogo é uma REF CONGELADA no momento
          // da abertura; após um re-fetch do report a linha de débito pode trocar de id. Resolve
          // o cheque VIVO em repDevol (por identidade doc/nº + valor) p/ que debId seja sempre
          // uma chave viva de vincMap — senão o cabeçalho lê "Vinculado R$ 0,00" indevidamente.
          const chqFrozen = vincularPixDlg.cheque;
          const fCents = chqFrozen.valorCents != null ? Number(chqFrozen.valorCents) : Math.round(Math.abs(Number(chqFrozen.valor ?? 0)) * 100);
          const fDoc = chqFrozen.doc != null ? String(chqFrozen.doc) : null;
          const fChq = chqFrozen.chequeNumero != null ? String(chqFrozen.chequeNumero) : null;
          const chqLive = repDevol.find((r: any) => {
            const rCents = r.valorCents != null ? Number(r.valorCents) : Math.round(Math.abs(Number(r.valor ?? 0)) * 100);
            if (rCents !== fCents) return false;
            if (fDoc != null && r.doc != null) return String(r.doc) === fDoc;
            if (fChq != null && r.chequeNumero != null) return String(r.chequeNumero) === fChq;
            return Number(r.debitoId) === Number(chqFrozen.debitoId);
          });
          const chq = chqLive ?? chqFrozen;
          let debId = Number(chq.debitoId);
          const credId = chq.creditoId != null ? Number(chq.creditoId) : undefined;
          const valCents = chq.valorCents != null ? Number(chq.valorCents) : Math.round(Math.abs(Number(chq.valor ?? 0)) * 100);
          // Rev. 3767 — FALLBACK POR IDENTIDADE. Re-imports do extrato giram o id da linha do
          // cheque (ex.: 1418→12868); se o debId resolvido não for chave de vincMap, o cabeçalho
          // lia "Vinculado R$ 0,00" mesmo havendo vínculo gravado. Quando a entrada direta não
          // cobre, varre o mapa por identidade do cheque (mesmo valor + doc OU nº) e adota a chave
          // viva — assim o cabeçalho mostra o valor real e o registrar/estornar usam o id certo.
          // Rev. 3769 — fonte AUTORITATIVA = cobertura dedicada do cheque aberto (vincDlgInfo),
          // chaveada só por este cheque e imune ao vincMap zerar durante refetch do report.
          // Só cai p/ vincMap quando a dedicada ainda não resolveu (null).
          let info: any = vincDlgInfo ?? vincMap[String(debId)];
          if (!info || (!(Number(info.acumulado) > 0) && !((info.vinculos ?? []).length))) {
            const normId = (v: any) => (v == null ? null : (String(v).replace(/^0+/, "") || String(v)));
            const wantDoc = chq.doc != null ? normId(chq.doc) : null;
            const wantChq = chq.chequeNumero != null ? normId(chq.chequeNumero) : null;
            for (const [k, m] of Object.entries(vincMap)) {
              const vs = (m as any).vinculos ?? [];
              const hit = vs.some((v: any) =>
                Number(v._idCents) === valCents &&
                ((wantDoc && v._idDoc && normId(v._idDoc) === wantDoc) ||
                  (wantChq && v._idChq && normId(v._idChq) === wantChq)));
              if (hit) { info = m; debId = Number(k); break; }
            }
          }
          info = info ?? { vinculos: [], acumulado: 0, saldo: valCents / 100, quitado: false, sugestoes: [] };
          const vinculos: any[] = info.vinculos ?? [];
          const acumCents = Math.round(Number(info.acumulado || 0) * 100);
          const saldoCents = Math.max(0, valCents - acumCents);
          const quitado = !!info.quitado || (saldoCents <= 1 && acumCents > 0);
          const sugestoes: any[] = info.sugestoes ?? [];
          const pctCob = valCents > 0 ? Math.min(100, Math.round((acumCents / valCents) * 100)) : 0;
          const candidatas: any[] = (pixGlobalData?.linhas ?? []).filter((l: any) => Number(l.id) !== debId && (credId == null || Number(l.id) !== credId));
          const parcelaCents = Math.round((parseFloat(String(vincularPixValor).replace(",", ".")) || 0) * 100);
          const closeDialog = () => { setVincularPixDlg(null); setVincularPixSel(null); setVincularPixBusca(""); setVincularPixValor(""); setVincularPixSoProximos(false); setVincularPixOutrosMeses(false); };
          const selecionar = (l: any) => {
            setVincularPixSel(l);
            const lineCents = Math.round(Math.abs(Number(l.valor ?? 0)) * 100);
            const sugCents = Math.max(1, Math.min(saldoCents > 0 ? saldoCents : valCents, lineCents));
            setVincularPixValor((sugCents / 100).toFixed(2));
          };
          const registrar = async (tipo: "pix" | "ajuste") => {
            if (!companyId) return;
            if (!(parcelaCents > 0)) { toast({ title: "Informe um valor válido para o vínculo.", variant: "destructive" }); return; }
            if (tipo === "pix" && !vincularPixSel) { toast({ title: "Selecione o PIX/TED no extrato.", variant: "destructive" }); return; }
            try {
              const res = await registrarVinculoMut.mutateAsync({
                companyId: Number(companyId),
                debitoLineId: debId,
                creditoLineId: credId,
                chequeNumero: chq.chequeNumero ? String(chq.chequeNumero) : undefined,
                tipo,
                pixLineId: tipo === "pix" ? Number(vincularPixSel.id) : undefined,
                valor: parcelaCents / 100,
                data: tipo === "pix" && vincularPixSel?.data ? String(vincularPixSel.data).slice(0, 10) : undefined,
                descricao: tipo === "pix" ? (vincularPixSel?.descricao ?? undefined) : "Quitação de saldo (ajuste manual)",
              });
              toast({
                title: res.quitado ? "Cheque quitado por substituição" : "Vínculo registrado",
                description: res.quitado
                  ? "O par (compensação + devolução) saiu do cálculo do % automaticamente."
                  : `Vinculado ${formatBRL(parcelaCents / 100)} · saldo restante ${formatBRL(Number(res.saldo))}.`,
              });
              refreshAposVinculo();
              setVincularPixSel(null); setVincularPixValor("");
              if (res.quitado) closeDialog();
            } catch (err: any) {
              const msg = String(err?.message ?? err);
              const [titulo, ...resto] = msg.split(". Verifique");
              toast({
                title: "Erro ao vincular",
                description: resto.length
                  ? <span>{titulo}.<br /><span className="font-medium">Verifique{resto.join(". Verifique")}</span></span>
                  : msg,
                variant: "destructive",
              });
            }
          };
          const estornar = async (v: any) => {
            if (!companyId) return;
            try {
              await estornarVinculoMut.mutateAsync({ companyId: Number(companyId), vinculoId: Number(v.id) });
              toast({ title: "Vínculo estornado", description: "O cheque volta ao % se deixar de estar coberto." });
              refreshAposVinculo();
            } catch (err: any) {
              toast({ title: "Erro ao estornar", description: String(err?.message ?? err), variant: "destructive" });
            }
          };
          const busy = registrarVinculoMut.isPending || estornarVinculoMut.isPending;
          return (
            <>
              {/* Backdrop */}
              <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.55)" }} onClick={closeDialog} />
              {/* Painel full-screen */}
              <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
                {/* ── HEADER ── */}
                <div style={{ flexShrink: 0, background: "linear-gradient(135deg,#1e1b4b,#3730a3,#4338ca)", color: "#fff", padding: "20px 20px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10 }}>
                        <ArrowLeftRight style={{ width: 20, height: 20 }} />
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Vincular cheque devolvido a PIX/TED</p>
                        <p style={{ fontSize: 11, color: "#a5b4fc", margin: "2px 0 0", maxWidth: 520 }}>Vincule um ou vários pagamentos (todas as contas). Nenhuma linha do extrato é criada ou alterada — só marcamos o cheque e o tiramos do %.</p>
                      </div>
                    </div>
                    <button type="button" onClick={closeDialog} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" }}>
                      <X style={{ width: 20, height: 20 }} />
                    </button>
                  </div>
                  {/* Card cheque + progresso de cobertura */}
                  <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 16, padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>Cheque {chq.chequeNumero ? `nº ${chq.chequeNumero}` : (chq.doc ? `Doc ${chq.doc}` : "—")}</p>
                        {chq.fornecedor && <p style={{ fontSize: 11, color: "#c7d2fe", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chq.fornecedor}</p>}
                        <p style={{ fontSize: 11, color: "#818cf8", margin: "2px 0 0" }}>Devolvido em {fmtData(chq.dataCredito)}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 20, margin: 0, fontVariantNumeric: "tabular-nums" }}>{formatBRL(valCents / 100)}</p>
                        <p style={{ fontSize: 10, color: "#818cf8", margin: "2px 0 0" }}>valor do cheque</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctCob}%`, background: quitado ? "#34d399" : "#fbbf24", transition: "width .2s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ color: "#c7d2fe" }}>Vinculado <strong style={{ color: "#fff" }}>{formatBRL(acumCents / 100)}</strong></span>
                        {quitado
                          ? <span style={{ color: "#6ee7b7", fontWeight: 700 }}>✓ Quitado por substituição</span>
                          : <span style={{ color: "#fde68a" }}>Saldo <strong style={{ color: "#fff" }}>{formatBRL(saldoCents / 100)}</strong></span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── CORPO ── */}
                <div style={{ flex: 1, overflowY: "auto", background: "#f9fafb", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Vínculos já registrados */}
                  {vinculos.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#4338ca", textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 6px" }}>Vínculos registrados ({vinculos.length})</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {vinculos.map((v: any) => (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e0e7ff", borderRadius: 10, padding: "8px 12px" }}>
                            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: v.tipo === "ajuste" ? "#fef3c7" : "#e0e7ff", color: v.tipo === "ajuste" ? "#92400e" : "#3730a3" }}>{v.tipo === "ajuste" ? "AJUSTE" : "PIX/TED"}</span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ margin: 0, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.pixDescricao ?? v.descricao ?? "Ajuste de saldo"}</p>
                              <p style={{ margin: "1px 0 0", fontSize: 11, color: "#6b7280" }}>{[v.data ? fmtData(v.data) : null, v.pixContaApelido].filter(Boolean).join(" · ") || "—"}</p>
                            </div>
                            <p style={{ flexShrink: 0, margin: 0, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#111827" }}>{formatBRL(Math.abs(Number(v.valor)))}</p>
                            <button type="button" disabled={busy} onClick={() => estornar(v)} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#e11d48", fontSize: 12, fontWeight: 600, textDecoration: "underline", opacity: busy ? 0.5 : 1 }}>Estornar</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!quitado && (
                    <>
                      {/* Sugestões automáticas (valor EXATO, todas as contas) */}
                      {sugestoes.length > 0 && (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                            <Sparkles style={{ width: 13, height: 13 }} /> Sugestões de valor exato ({sugestoes.length})
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {sugestoes.map((l: any) => {
                              const isSel = vincularPixSel?.id === l.id;
                              return (
                                <button key={`sug-${l.id}`} type="button" onClick={() => selecionar(l)} style={{ width: "100%", textAlign: "left", border: isSel ? "2px solid #2563eb" : "2px solid #bfdbfe", borderRadius: 10, padding: "10px 12px", background: isSel ? "#eff6ff" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isSel ? "#2563eb" : "#93c5fd"}`, background: isSel ? "#2563eb" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{isSel && <Check style={{ width: 11, height: 11, color: "#fff" }} />}</div>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</p>
                                    <p style={{ margin: "1px 0 0", fontSize: 11, color: "#6b7280" }}>{[fmtData(l.data), l.contaApelido].filter(Boolean).join(" · ")}{l.conciliado ? " · já conciliado" : ""}{l.jaVinculado ? " · já vinculado a outro cheque" : ""}</p>
                                  </div>
                                  <p style={{ flexShrink: 0, margin: 0, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#047857" }}>{formatBRL(Math.abs(Number(l.valor)))}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Busca manual em todas as contas */}
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 6px" }}>Buscar pagamento (todas as contas)</p>
                        <div style={{ position: "relative", marginBottom: 8 }}>
                          <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#9ca3af", pointerEvents: "none" }} />
                          <input
                            type="text"
                            placeholder="Buscar por descrição ou valor (ex: 4.344,60)…"
                            value={vincularPixBusca}
                            onChange={e => setVincularPixBusca(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, paddingLeft: 36, paddingRight: vincularPixBusca ? 34 : 12, paddingTop: 9, paddingBottom: 9, color: "#111827", fontSize: 13, outline: "none" }}
                          />
                          {vincularPixBusca && (
                            <button type="button" onClick={() => setVincularPixBusca("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}>
                              <X style={{ width: 15, height: 15 }} />
                            </button>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {pixGlobalFetching ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 0", color: "#6b7280", fontSize: 13 }}>
                              <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> Buscando pagamentos…
                            </div>
                          ) : candidatas.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13 }}>Nenhum PIX/TED encontrado para os filtros atuais.</div>
                          ) : candidatas.map((l: any) => {
                            const isSel = vincularPixSel?.id === l.id;
                            const lineCents = Math.round(Math.abs(Number(l.valor)) * 100);
                            const isExact = lineCents === valCents;
                            return (
                              <button key={`cand-${l.id}`} type="button" onClick={() => selecionar(l)} style={{ width: "100%", textAlign: "left", border: isSel ? "2px solid #4f46e5" : isExact ? "2px solid #6ee7b7" : "2px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", background: isSel ? "#eef2ff" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isSel ? "#4f46e5" : "#d1d5db"}`, background: isSel ? "#4f46e5" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{isSel && <Check style={{ width: 11, height: 11, color: "#fff" }} />}</div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</p>
                                  <p style={{ margin: "1px 0 0", fontSize: 11, color: "#6b7280" }}>{[fmtData(l.data), l.contaApelido].filter(Boolean).join(" · ")}{l.conciliado ? " · já conciliado" : ""}{l.jaVinculado ? " · já vinculado a outro cheque" : ""}</p>
                                </div>
                                <div style={{ flexShrink: 0, textAlign: "right" }}>
                                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isExact ? "#047857" : "#111827" }}>{formatBRL(Math.abs(Number(l.valor)))}</p>
                                  {isExact && <span style={{ fontSize: 10, fontWeight: 600, color: "#047857" }}>= exato</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {quitado && vinculos.length > 0 && (
                    <div style={{ textAlign: "center", padding: "8px 0", color: "#059669", fontSize: 13, fontWeight: 600 }}>
                      Cheque coberto pelos vínculos acima. Estorne algum vínculo para liberar saldo.
                    </div>
                  )}
                </div>

                {/* ── FOOTER ── */}
                <div style={{ flexShrink: 0, borderTop: "1px solid #e5e7eb", background: "#fff", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {!quitado && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: "0 0 180px" }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 }}>Valor deste vínculo (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={vincularPixValor}
                          onChange={e => setVincularPixValor(e.target.value)}
                          placeholder={(saldoCents / 100).toFixed(2)}
                          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 12px", fontSize: 14, fontVariantNumeric: "tabular-nums", outline: "none" }}
                        />
                      </div>
                      <button type="button" onClick={() => setVincularPixValor((saldoCents / 100).toFixed(2))} style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Usar saldo ({formatBRL(saldoCents / 100)})</button>
                      <div style={{ flex: 1, minWidth: 8 }} />
                      <Button
                        variant="outline"
                        style={{ height: 38 }}
                        disabled={busy || !(parcelaCents > 0)}
                        title="Lança um AJUSTE manual (arredondamento/divergência). Não cria nem altera linha no extrato."
                        onClick={() => registrar("ajuste")}
                      >
                        Quitar saldo (ajuste)
                      </Button>
                      <Button
                        style={{ height: 38, background: "#4f46e5", color: "#fff", fontWeight: 600 }}
                        disabled={busy || !vincularPixSel || !(parcelaCents > 0)}
                        onClick={() => registrar("pix")}
                      >
                        {registrarVinculoMut.isPending ? <><Loader2 style={{ width: 16, height: 16, marginRight: 4 }} className="animate-spin" />Salvando…</> : <>✓ Vincular pagamento</>}
                      </Button>
                    </div>
                  )}
                  <Button variant="ghost" style={{ alignSelf: "flex-end" }} onClick={closeDialog} disabled={busy}>Fechar</Button>
                </div>
              </div>
            </>
          );
        })(), document.body)}

        {/* Rev. 3413 — Dialog inline "Cadastrar nova obra" acionado pelo botão "+ Nova obra" */}
        <Dialog open={lancNewObraOpen} onOpenChange={(o) => { if (!o) setLancNewObraOpen(false); }}>
          <DialogContent className="max-w-sm w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Plus className="w-4 h-4 text-blue-600" />Cadastrar nova obra
              </DialogTitle>
              <DialogDescription className="text-xs">A obra será criada e automaticamente selecionada no formulário.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div>
                <Label className="text-xs">Nome da obra *</Label>
                <Input
                  value={lancNewObraNome}
                  onChange={e => setLancNewObraNome(e.target.value)}
                  placeholder="Ex.: Residencial Flores — Bloco A"
                  autoFocus
                />
              </div>
              {lancForm.clienteNome && (
                <div className="text-[11px] text-blue-600 flex items-center gap-1">
                  <Users className="w-3 h-3" />Cliente: <strong>{lancForm.clienteNome}</strong> será vinculado à obra.
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setLancNewObraOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!lancNewObraNome.trim() || criarObraMut.isPending}
                onClick={async () => {
                  if (!lancNewObraNome.trim() || !companyId) return;
                  try {
                    const nova = await criarObraMut.mutateAsync({ companyId: Number(companyId), nome: lancNewObraNome.trim(), cliente: lancForm.clienteNome || undefined, status: "Em_Andamento" });
                    await refetchLancObras();
                    const novaId = String(nova?.id ?? nova);
                    setLancForm(f => ({ ...f, obraId: novaId }));
                    setLancObraDisplay(lancNewObraNome.trim());
                    setLancNewObraOpen(false);
                    toast({ title: "Obra criada", description: lancNewObraNome.trim() });
                  } catch (err: any) {
                    toast({ title: "Erro ao criar obra", description: String(err?.message ?? err), variant: "destructive" });
                  }
                }}
              >
                {criarObraMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}Criar obra
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3450 — Dialog inline "Novo cliente" */}
        <Dialog open={lancNewClienteOpen} onOpenChange={(o) => { if (!o) setLancNewClienteOpen(false); }}>
          <DialogContent className="max-w-sm w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Plus className="w-4 h-4 text-emerald-600" />Cadastrar novo cliente
              </DialogTitle>
              <DialogDescription className="text-xs">O cliente será criado e automaticamente selecionado no formulário.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div>
                <Label className="text-xs">Nome / Razão Social *</Label>
                <Input
                  value={lancNewClienteNome}
                  onChange={e => setLancNewClienteNome(e.target.value)}
                  placeholder="Ex.: Bauminas Química Ltda."
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && lancNewClienteNome.trim()) e.currentTarget.blur(); }}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setLancNewClienteOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!lancNewClienteNome.trim() || criarClienteMut.isPending}
                onClick={async () => {
                  if (!lancNewClienteNome.trim() || !companyId) return;
                  try {
                    const novo = await criarClienteMut.mutateAsync({ companyId: Number(companyId), razaoSocial: lancNewClienteNome.trim() });
                    await refetchLancClientes();
                    const novoId = String(novo?.id ?? novo);
                    setLancForm(f => ({ ...f, clienteNome: lancNewClienteNome.trim(), clienteId: novoId, obraId: "" }));
                    setLancObraDisplay("");
                    setLancNewClienteOpen(false);
                    toast({ title: "Cliente criado", description: lancNewClienteNome.trim() });
                  } catch (err: any) {
                    toast({ title: "Erro ao criar cliente", description: String(err?.message ?? err), variant: "destructive" });
                  }
                }}
              >
                {criarClienteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}Criar cliente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3446 — Dialog inline "Nova categoria" */}
        <Dialog open={lancNewCatOpen} onOpenChange={(o) => { if (!o) setLancNewCatOpen(false); }}>
          <DialogContent className="max-w-sm w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Plus className="w-4 h-4 text-blue-600" />Nova categoria
              </DialogTitle>
              <DialogDescription className="text-xs">A categoria será criada e automaticamente selecionada no formulário.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={lancNewCatNome}
                  onChange={e => setLancNewCatNome(e.target.value)}
                  placeholder="Ex.: Manutenção Predial"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={lancNewCatTipo}
                  onChange={e => setLancNewCatTipo(e.target.value as "despesa" | "receita")}
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setLancNewCatOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!lancNewCatNome.trim() || criarCategoriaMut.isPending}
                onClick={async () => {
                  if (!lancNewCatNome.trim() || !companyId) return;
                  try {
                    const nova = await criarCategoriaMut.mutateAsync({
                      companyId: Number(companyId),
                      nome: lancNewCatNome.trim(),
                      tipo: lancNewCatTipo,
                      natureza: lancNewCatTipo === "despesa" ? "debito" : "credito",
                      escopo: "categoria",
                    });
                    await refetchLancAccounts();
                    setLancForm(f => ({ ...f, contaId: String(nova?.id ?? nova), contaNome: lancNewCatNome.trim() }));
                    setLancNewCatOpen(false);
                    toast({ title: "Categoria criada", description: lancNewCatNome.trim() });
                  } catch (err: any) {
                    toast({ title: "Erro ao criar categoria", description: String(err?.message ?? err), variant: "destructive" });
                  }
                }}
              >
                {criarCategoriaMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}Criar categoria
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3446 — Dialog inline "Novo centro de custo" */}
        <Dialog open={lancNewCCOpen} onOpenChange={(o) => { if (!o) setLancNewCCOpen(false); }}>
          <DialogContent className="max-w-sm w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Plus className="w-4 h-4 text-blue-600" />Novo centro de custo
              </DialogTitle>
              <DialogDescription className="text-xs">O centro de custo será criado e automaticamente selecionado no formulário.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={lancNewCCNome}
                  onChange={e => setLancNewCCNome(e.target.value)}
                  placeholder="Ex.: Administrativo — Sede"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setLancNewCCOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!lancNewCCNome.trim() || criarCCMut.isPending}
                onClick={async () => {
                  if (!lancNewCCNome.trim() || !companyId) return;
                  try {
                    const novo = await criarCCMut.mutateAsync({
                      companyId: Number(companyId),
                      nome: lancNewCCNome.trim(),
                      tipo: "Operacional",
                    });
                    await refetchLancCostCenters();
                    setLancForm(f => ({ ...f, centroCustoId: String(novo?.id ?? novo) }));
                    setLancCCDisplay(lancNewCCNome.trim());
                    setLancNewCCOpen(false);
                    toast({ title: "Centro de custo criado", description: lancNewCCNome.trim() });
                  } catch (err: any) {
                    toast({ title: "Erro ao criar centro de custo", description: String(err?.message ?? err), variant: "destructive" });
                  }
                }}
              >
                {criarCCMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}Criar centro de custo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3205 — modo tela cheia: expande a lista escolhida p/ analisar melhor.
            Reutiliza exatamente as mesmas linhas (seleção/lançar/conciliar continuam funcionando). */}
        <Dialog open={!!expandedList} onOpenChange={(o: boolean) => { if (!o) setExpandedList(null); }}>
          <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-4 py-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                {expandedList === "extrato" ? (
                  <><AlertCircle className="w-4 h-4 text-red-500" />No extrato, sem lançamento ({termoBusca || filterExtTipo !== "all" ? `${formatInt(repExtView.length)}/${formatInt(repExt.length)}` : formatInt(repExt.length)})</>
                ) : (
                  <><FileText className="w-4 h-4 text-amber-600" />No ERP, sem extrato ({termoBusca || filterLanTipo !== "all" ? `${formatInt(repLanView.length)}/${formatInt(repLan.length)}` : formatInt(repLan.length)})</>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  value={buscaConc}
                  onChange={(e) => setBuscaConc(e.target.value)}
                  placeholder="Buscar (descrição, fornecedor, obra, valor…)"
                  className="pl-9 pr-9 h-8"
                />
                {buscaConc && (
                  <button type="button" onClick={() => setBuscaConc("")} title="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {expandedList === "extrato" && (
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs shrink-0">
                  <button type="button" onClick={() => setFilterExtTipo("all")} className={`px-2 py-1 transition-colors ${filterExtTipo === "all" ? "bg-gray-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Todos</button>
                  <button type="button" onClick={() => setFilterExtTipo(filterExtTipo === "entrada" ? "all" : "entrada")} className={`px-2 py-1 border-l border-gray-200 transition-colors ${filterExtTipo === "entrada" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Entrada</button>
                  <button type="button" onClick={() => setFilterExtTipo(filterExtTipo === "saida" ? "all" : "saida")} className={`px-2 py-1 border-l border-gray-200 transition-colors ${filterExtTipo === "saida" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Saída</button>
                </div>
              )}
              {expandedList === "erp" && (
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs shrink-0">
                  <button type="button" onClick={() => setFilterLanTipo("all")} className={`px-2 py-1 transition-colors ${filterLanTipo === "all" ? "bg-gray-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Todos</button>
                  <button type="button" onClick={() => setFilterLanTipo(filterLanTipo === "entrada" ? "all" : "entrada")} className={`px-2 py-1 border-l border-gray-200 transition-colors ${filterLanTipo === "entrada" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Entrada</button>
                  <button type="button" onClick={() => setFilterLanTipo(filterLanTipo === "saida" ? "all" : "saida")} className={`px-2 py-1 border-l border-gray-200 transition-colors ${filterLanTipo === "saida" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Saída</button>
                </div>
              )}
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => expandedList && exportarListaExcel(expandedList)} title="Exportar para Excel">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => expandedList && exportarListaPDF(expandedList)} title="Exportar para PDF">
                <FileDown className="w-3.5 h-3.5 mr-1" />PDF
              </Button>
              <Button size="sm" onClick={() => { setExpandedList(null); setTimeout(abrirLancStandalone, 150); }} className="h-7 px-3 text-xs bg-[#1B2A4A] hover:bg-[#2c3f63] gap-1.5 ml-1">
                <Plus className="w-3.5 h-3.5" />Novo lançamento
              </Button>
            </div>
            {/* Rev. 3221 — Resumo do que está em tela: total de entradas, saídas e o saldo
                (entradas − saídas). Reage à busca (soma só o que está filtrado). Extrato:
                entrada = valor ≥ 0; ERP: entrada = tipo "receita". */}
            {(() => {
              const lista: any[] = expandedList === "extrato" ? repExtView : repLanView;
              const ehEntrada = (r: any) => expandedList === "extrato" ? Number(r.valor) >= 0 : r.tipo === "receita";
              let entrada = 0, saida = 0, ce = 0, cs = 0;
              for (const r of lista) {
                const v = Math.abs(Number(r.valor) || 0);
                if (ehEntrada(r)) { entrada += v; ce++; } else { saida += v; cs++; }
              }
              const saldo = entrada - saida;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3 border-b bg-gray-50/60 shrink-0">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700/80 font-medium">Entradas · {ce}</p>
                      <p className="text-lg font-bold text-emerald-700 truncate">{formatBRL(entrada)}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><ArrowUpCircle className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-rose-700/80 font-medium">Saídas · {cs}</p>
                      <p className="text-lg font-bold text-rose-600 truncate">{formatBRL(saida)}</p>
                    </div>
                  </div>
                  <div className={`rounded-xl border p-3 flex items-center gap-3 ${saldo >= 0 ? "border-blue-100 bg-blue-50/70" : "border-amber-100 bg-amber-50/70"}`}>
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${saldo >= 0 ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}><Landmark className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <p className={`text-[11px] uppercase tracking-wide font-medium ${saldo >= 0 ? "text-blue-700/80" : "text-amber-700/80"}`}>Saldo do mês</p>
                      <p className={`text-lg font-bold truncate ${saldo >= 0 ? "text-blue-700" : "text-amber-600"}`}>{formatBRL(saldo)}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {expandedList === "extrato"
                ? (repExtView.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">{termoBusca ? "Nenhum item corresponde à busca." : "Nada a exibir."}</div> : repExtView.map(renderExtratoRow))
                : (repLanView.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">{termoBusca ? "Nenhum item corresponde à busca." : "Nada a exibir."}</div> : repLanView.map((e: any) => renderEntryRow(e)))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Rev. 3240 — "Tudo que a IA leu" em TELA CHEIA: visão ampla (sem truncar valores)
            com cards de total (geral/PIX/boletos), chips de tipo e busca livre. Reusa o
            mesmo `leituraIA` da lista inline (fonte única). Só consulta — não concilia. */}
        <Dialog open={leituraFull} onOpenChange={(o: boolean) => { if (!o) setLeituraFull(false); }}>
          <DialogContent resizable={false} className="max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 py-4 border-b shrink-0 bg-gradient-to-r from-violet-50 to-white">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-5 h-5 text-violet-600" />
                Tudo que a IA leu nos demonstrativos
                {modoData === "mes" && mesSel != null && <span className="text-sm font-medium text-gray-400">· {MESES[mesSel - 1]}/{ano}</span>}
              </DialogTitle>
            </DialogHeader>
            {/* Cards de total — grandes, fáceis de analisar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 py-4 border-b bg-gray-50/60 shrink-0">
              <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4 flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0"><Landmark className="w-6 h-6" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-violet-700/80 font-medium">Total geral · {formatInt(leituraIA.lista.length)}</p>
                  <p className="text-2xl font-bold text-violet-700 truncate">{formatBRL(leituraIA.total)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-6 h-6" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-700/80 font-medium">PIX · {formatInt(leituraIA.pixVis.length)}</p>
                  <p className="text-2xl font-bold text-emerald-700 truncate">{formatBRL(leituraIA.somaPix)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><FileText className="w-6 h-6" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-blue-700/80 font-medium">Boletos · {formatInt(leituraIA.bolVis.length)}</p>
                  <p className="text-2xl font-bold text-blue-700 truncate">{formatBRL(leituraIA.somaBol)}</p>
                </div>
              </div>
            </div>
            {/* Chips de tipo + busca */}
            <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b shrink-0">
              {leituraIA.chips.map((c) => (
                <button key={c.key} type="button" onClick={() => setDemoFiltro(c.key)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${demoFiltro === c.key ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {c.label}
                </button>
              ))}
              <div className="relative flex-1 min-w-[220px] max-w-lg">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input value={buscaLeitura} onChange={(e) => setBuscaLeitura(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, valor, data…" className="pl-9 pr-9 h-9" />
                {buscaLeitura && <button type="button" onClick={() => setBuscaLeitura("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
              </div>
            </div>
            {/* Tabela ampla — full width, sem truncar valores */}
            <div className="flex-1 overflow-auto">
              {leituraIA.lista.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-16">{leituraIA.todos.length === 0 ? "A IA não encontrou pagamentos nos PDFs." : "Nenhum pagamento corresponde ao filtro/busca."}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 z-10 shadow-sm">
                    <tr>
                      <th className="text-left font-medium px-4 py-3">Tipo</th>
                      <th className="text-left font-medium px-4 py-3">Beneficiário</th>
                      <th className="text-left font-medium px-4 py-3">CPF/CNPJ</th>
                      <th className="text-left font-medium px-4 py-3">Data</th>
                      <th className="text-left font-medium px-4 py-3">ID transação</th>
                      <th className="text-right font-medium px-4 py-3">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leituraIA.lista.map((it, i) => (
                      <tr key={`${it?._tipo || "x"}|${it?.txid || it?.documento || ""}|${it?.data || ""}|${it?.valor ?? ""}|${i}`} className="border-t border-gray-100 hover:bg-violet-50/40">
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${it._tipo === "pix" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{it._tipo === "pix" ? "PIX" : "Boleto"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-800 font-medium">{it?.beneficiario || <span className="text-gray-400 font-normal">—</span>}</td>
                        <td className="px-4 py-2.5 text-gray-600 tabular-nums whitespace-nowrap">{it?.documento || <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-2.5 text-gray-600 tabular-nums whitespace-nowrap">{it?.data ? fmtData(it.data) : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[260px] truncate" title={it?.txid || ""}>{it?.txid || <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{it?.valor != null ? formatBRL(Number(it.valor)) : <span className="text-gray-400 font-normal">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t shrink-0 bg-gray-50/60">
              <p className="text-[11px] text-gray-400">Mostrando {formatInt(leituraIA.lista.length)} de {formatInt(leituraIA.porFiltro.length)}{leituraIA.termo ? ` (filtro "${buscaLeitura.trim()}")` : ""} · A leitura por IA é uma ajuda para identificar quem recebeu — confira sempre no PDF original. Não concilia nada automaticamente.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rev. 3403 — Dialog: Relatório de Classificação em Lote */}
      {showBatchReport && (() => {
        const allResults = Object.values(batchAiResults);
        const withProblems = allResults.filter((r: any) => r.sugestoes.length > 0);
        const okItems = allResults.filter((r: any) => r.sugestoes.length === 0);
        const displayed = batchShowOnlyProblems ? withProblems : allResults;
        const totalChecked = batchApplyChecked.size;
        const CAMPO_LABEL: Record<string, string> = { fornecedorNome: "Nome/Beneficiário", contaId: "Categoria", descricao: "Descrição" };
        const toggleCheckAll = () => {
          if (batchApplyChecked.size > 0) { setBatchApplyChecked(new Set()); return; }
          const all = new Set<string>();
          for (const r of withProblems) r.sugestoes.forEach((_: any, i: number) => all.add(`${r.statementLineId}-${i}`));
          setBatchApplyChecked(all);
        };
        return (
          <Dialog open onOpenChange={v => { if (!v && !batchApplying) setShowBatchReport(false); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-600" />
                      Relatório de Classificação IA
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">{allResults.length} sugestões analisadas</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                      {withProblems.length} com divergências
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      {okItems.length} classificados OK
                    </span>
                  </div>
                </div>
                {/* Controles da lista */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${batchShowOnlyProblems ? "bg-amber-50 border-amber-300 text-amber-800 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    onClick={() => setBatchShowOnlyProblems(true)}
                  >Apenas divergências ({withProblems.length})</button>
                  <button
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${!batchShowOnlyProblems ? "bg-gray-100 border-gray-300 text-gray-800 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    onClick={() => setBatchShowOnlyProblems(false)}
                  >Todos ({allResults.length})</button>
                  {withProblems.length > 0 && (
                    <button className="text-xs text-violet-700 underline underline-offset-2 ml-2" onClick={toggleCheckAll}>
                      {batchApplyChecked.size > 0 ? "Desmarcar todas" : "Marcar todas correções"}
                    </button>
                  )}
                </div>
              </div>

              {/* Body scrollável */}
              <div className="flex-1 overflow-y-auto divide-y">
                {displayed.length === 0 && (
                  <p className="text-sm text-gray-500 py-10 text-center">Nenhum item {batchShowOnlyProblems ? "com divergências" : ""} encontrado.</p>
                )}
                {displayed.map((r: any) => {
                  const sug = r as BatchResult;
                  const hasProblem = sug.sugestoes.length > 0;
                  return (
                    <div key={sug.statementLineId} className={`px-5 py-3.5 ${hasProblem ? "" : "opacity-60"}`}>
                      {/* Linha principal: extrato → ERP */}
                      <div className="flex items-start gap-2 mb-2">
                        <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${hasProblem ? "bg-amber-400" : "bg-emerald-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">Extrato:</span>
                            <span className="text-xs font-medium text-gray-800 truncate max-w-[280px]" title={sugestoes.find((s: any) => s.statementLineId === sug.statementLineId)?.extratoDescricao ?? ""}>{sugestoes.find((s: any) => s.statementLineId === sug.statementLineId)?.extratoDescricao ?? "—"}</span>
                            <span className="text-gray-300">→</span>
                            <span className="text-xs text-gray-500">ERP:</span>
                            <span className="text-xs font-medium text-gray-800 truncate max-w-[200px]">{sugestoes.find((s: any) => s.statementLineId === sug.statementLineId)?.entryFornecedor ?? "—"}</span>
                          </div>
                          <p className={`text-[11px] mt-0.5 ${hasProblem ? "text-amber-700" : "text-emerald-700"}`}>{sug.resumo}</p>
                        </div>
                      </div>
                      {/* Sugestões com checkbox */}
                      {sug.sugestoes.map((sg: AiSugestao, idx: number) => {
                        const key = `${sug.statementLineId}-${idx}`;
                        const checked = batchApplyChecked.has(key);
                        return (
                          <label key={key} className="flex items-start gap-2.5 ml-4 mt-1.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const next = new Set(batchApplyChecked);
                                e.target.checked ? next.add(key) : next.delete(key);
                                setBatchApplyChecked(next);
                              }}
                              className="mt-0.5 accent-violet-600 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{CAMPO_LABEL[sg.campo] ?? sg.campo}</span>
                                <span className="text-[11px] line-through text-gray-400 max-w-[160px] truncate" title={sg.valorAtual}>{sg.valorAtual || "—"}</span>
                                <span className="text-gray-300 text-[10px]">→</span>
                                <span className="text-[11px] font-semibold text-violet-800 max-w-[200px] truncate" title={sg.campo === "contaId" ? (sg.contaNomeSugerida || sg.sugestao) : sg.sugestao}>
                                  {sg.campo === "contaId" ? (sg.contaNomeSugerida || sg.sugestao) : sg.sugestao}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-500 mt-0.5">{sg.motivo}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t shrink-0 bg-gray-50/60 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {batchApplying
                    ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{`Aplicando… (${batchApplyProgress?.done ?? 0}/${batchApplyProgress?.total ?? 0})`}</span>
                    : totalChecked > 0
                    ? `${totalChecked} correção(ões) selecionada(s)`
                    : "Selecione as correções para aplicar"}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowBatchReport(false)} disabled={batchApplying}>Fechar</Button>
                  <Button
                    size="sm"
                    onClick={aplicarBatchCorrecoes}
                    disabled={batchApplying || totalChecked === 0}
                    className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                  >
                    {batchApplying
                      ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Aplicando…</>
                      : <><CheckCircle className="w-4 h-4 mr-1" />{`Aplicar ${totalChecked} correção(ões)`}</>}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Rev. 3419 — Dialog "Conciliar PIX rápido" a partir do card do cheque devolvido */}
      <Dialog open={!!conciliarPixDlg} onOpenChange={(o) => { if (!o) { setConciliarPixDlg(null); setConciliarPixEntry(null); setBuscaConciliarPix(""); } }}>
        <DialogContent style={{ maxWidth: "min(44rem, calc(100vw - 1rem))" }} className="p-0 gap-0 overflow-hidden">
          {/* Cabeçalho */}
          <div className="bg-emerald-700 px-5 pt-4 pb-4">
            <div className="flex items-center gap-2 text-white">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm leading-tight">Conciliar PIX no extrato</div>
                {conciliarPixDlg && (
                  <div className="text-[11px] text-emerald-100 mt-0.5 break-words">
                    Cheque {conciliarPixDlg.cheque.chequeNumero ? `nº ${conciliarPixDlg.cheque.chequeNumero}` : ""} · {conciliarPixDlg.cheque.fornecedor ?? "—"} · {formatBRL(Math.abs(Number(conciliarPixDlg.cheque.valor) || (conciliarPixDlg.cheque.valorCents ? conciliarPixDlg.cheque.valorCents / 100 : 0)))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Linha do extrato PIX (já identificada) */}
          {conciliarPixDlg && (
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Linha PIX no extrato (lado esquerdo)
              </div>
              {conciliarPixDlg.pixLine ? (
                <div className="text-sm">
                  <div className="font-medium text-gray-800 break-all leading-snug">{conciliarPixDlg.pixLine.descricao ?? "—"}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                    <span className="tabular-nums font-semibold text-gray-700">{formatBRL(Math.abs(Number(conciliarPixDlg.pixLine.valor)))}</span>
                    <span className="text-gray-300">·</span>
                    <span>{fmtData(conciliarPixDlg.pixLine.data)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-700">Linha do extrato não encontrada no período atual. Verifique se o PIX está no mês selecionado.</div>
              )}
            </div>
          )}
          {/* Seleção do lançamento ERP */}
          <div className="px-4 pt-3 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> Selecione o lançamento ERP correspondente (lado direito)
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                value={buscaConciliarPix}
                onChange={(e) => { setBuscaConciliarPix(e.target.value); setConciliarPixEntry(null); }}
                placeholder="Buscar por fornecedor, descrição ou conta…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>
          {conciliarPixEntry && (
            <div className="mx-4 mt-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-blue-800 break-words">{conciliarPixEntry.fornecedorNome || conciliarPixEntry.descricao || "—"}</div>
                <div className="text-[11px] text-blue-600">{formatBRL(Math.abs(Number(conciliarPixEntry.valorRealizado ?? conciliarPixEntry.valorPrevisto ?? 0)))} · {fmtData(conciliarPixEntry.dataCompetencia ?? conciliarPixEntry.dataVencimento)}</div>
              </div>
              <button type="button" className="ml-auto shrink-0 text-blue-400 hover:text-blue-600" onClick={() => setConciliarPixEntry(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="max-h-[38vh] overflow-y-auto border-t mt-2">
            {entriesConciliarPixFetching && <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Buscando…</div>}
            {!entriesConciliarPixFetching && (entriesConciliarPix?.data ?? []).length === 0 && (chequesConciliarPix?.data ?? []).length === 0 && (
              <div className="px-4 py-4 text-sm text-gray-400 text-center">Nenhum lançamento ou cheque encontrado. Tente outro termo de busca.</div>
            )}
            {/* Rev. 3752 — CHEQUES do Controle de Cheques (sem lançamento) como candidatos */}
            {(() => {
              const chqs = chequesConciliarPix?.data ?? [];
              if (chqs.length === 0) return null;
              const valRefPix = conciliarPixDlg ? Math.abs(Number(conciliarPixDlg.cheque.valor) || (conciliarPixDlg.cheque.valorCents ? conciliarPixDlg.cheque.valorCents / 100 : 0)) : 0;
              return (
                <div>
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Cheques do Controle de Cheques (sem lançamento)
                  </div>
                  <div className="divide-y">
                    {chqs.map((chq: any) => renderChequeCandidato(
                      chq, valRefPix,
                      conciliarPixEntry?._cheque === true && conciliarPixEntry?.chequeId === chq.chequeId,
                      () => setConciliarPixEntry((prev: any) => (prev?._cheque && prev?.chequeId === chq.chequeId) ? null : { _cheque: true, chequeId: chq.chequeId, id: `chq-${chq.chequeId}`, numeroCheque: chq.numeroCheque, fornecedorNome: `Cheque nº ${chq.numeroCheque || "—"} — ${chq.fornecedorNome || "Fornecedor"}`, valorRealizado: Math.abs(Number(chq.valor) || 0), dataVencimento: chq.dataVencimento }),
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="divide-y">
              {(entriesConciliarPix?.data ?? []).map((e: any) => {
                const nome = e.fornecedorNome || e.frotaFornecedor || e.pjFornecedor || e.descricao || "—";
                const valor = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto ?? 0));
                const data = e.dataCompetencia ?? e.dataVencimento ?? null;
                const isSelected = conciliarPixEntry?.id === e.id;
                const valRef = conciliarPixDlg ? Math.abs(Number(conciliarPixDlg.cheque.valor) || (conciliarPixDlg.cheque.valorCents ? conciliarPixDlg.cheque.valorCents / 100 : 0)) : 0;
                const exato = valRef > 0 && Math.abs(valor - valRef) < 0.015;
                const diffPct = valRef > 0 && !exato ? Math.round(Math.abs(valor - valRef) / valRef * 100) : null;
                return (
                  <button key={e.id} type="button"
                    className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : "hover:bg-gray-50"}`}
                    onClick={() => setConciliarPixEntry(isSelected ? null : e)}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? "border-blue-600 bg-blue-600" : "border-gray-300"}`}>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-blue-700 break-words flex items-center gap-1.5">{nome}{entryChequeIdent(e) && <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700 shrink-0">🪙 nº {entryChequeIdent(e)}</span>}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="tabular-nums font-medium text-gray-700">{formatBRL(valor)}</span>
                        {data && <><span className="text-gray-300">·</span><span>{fmtData(data)}</span></>}
                        {e.obraNome && <><span className="text-gray-300">·</span><span>{e.obraNome}</span></>}
                        {e.contaNome && <><span className="text-gray-300">·</span><span className="text-gray-400 italic">{e.contaNome}</span></>}
                      </div>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      {exato
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">= valor exato</span>
                        : diffPct !== null
                          ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${diffPct <= 5 ? "bg-blue-100 text-blue-700" : diffPct <= 20 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>Δ {diffPct}%</span>
                          : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="px-4 py-3 border-t bg-gray-50 flex justify-between items-center gap-3">
            <span className="text-[11px] text-gray-400">Selecione o lançamento ERP para vincular ao PIX do extrato</span>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => { setConciliarPixDlg(null); setConciliarPixEntry(null); setBuscaConciliarPix(""); }}>Cancelar</Button>
              <Button size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!conciliarPixEntry || !conciliarPixDlg?.pixLine || conciliarPixMut.isPending || conciliarChequeMut.isPending}
                onClick={() => {
                  if (!conciliarPixEntry || !conciliarPixDlg?.pixLineId || !companyId) return;
                  if (conciliarPixEntry._cheque) {
                    conciliarChequeMut.mutate({ companyId, statementLineId: conciliarPixDlg.pixLineId, chequeId: conciliarPixEntry.chequeId });
                  } else {
                    conciliarPixMut.mutate({ companyId, statementLineId: conciliarPixDlg.pixLineId, entryId: conciliarPixEntry.id });
                  }
                }}
              >
                {(conciliarPixMut.isPending || conciliarChequeMut.isPending) ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Conciliando…</> : <>⚡ Conciliar agora</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rev. 3418 — Dialog de troca manual: sugestões por valor próximo + layout melhorado */}
      <Dialog open={!!trocandoLine} onOpenChange={(o) => { if (!o) { setTrocandoLine(null); setBuscaTroca(""); } }}>
        <DialogContent style={{ maxWidth: "min(42rem, calc(100vw - 1rem))" }} className="p-0 gap-0 overflow-hidden">
          {/* Cabeçalho */}
          <div className="bg-[#1B2A4A] px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 text-white">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm leading-tight">Trocar lançamento vinculado</div>
                {trocandoLine && (
                  <div className="text-[11px] text-blue-200 truncate mt-0.5 max-w-[26rem]">
                    Extrato: {trocandoLine.extratoDescricao}
                    {trocandoLine.extratoValor ? <span className="ml-2 font-semibold text-white/90">{formatBRL(trocandoLine.extratoValor)}</span> : null}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Busca */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                value={buscaTroca}
                onChange={(e) => setBuscaTroca(e.target.value)}
                placeholder="Buscar por descrição, fornecedor ou conta…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {/* Lista */}
          <div className="max-h-[52vh] overflow-y-auto">
            {entriesTrocaFetching && (
              <div className="flex items-center gap-2 px-5 py-5 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
              </div>
            )}
            {/* Rev. 3752 — CHEQUES do Controle de Cheques (sem lançamento): clicar CRIA a despesa, concilia a linha e baixa o cheque */}
            {!entriesTrocaFetching && (() => {
              const chqs = chequesTroca?.data ?? [];
              if (chqs.length === 0) return null;
              const valRefChq = trocandoLine?.extratoValor ?? 0;
              return (
                <div>
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Cheques do Controle de Cheques · clicar cria a despesa e baixa o cheque
                  </div>
                  <div className="divide-y">
                    {chqs.map((chq: any) => renderChequeCandidato(chq, valRefChq, false, () => {
                      if (!trocandoLine || !companyId) return;
                      conciliarChequeMut.mutate({ companyId, statementLineId: trocandoLine.statementLineId, chequeId: chq.chequeId });
                    }))}
                  </div>
                </div>
              );
            })()}
            {!entriesTrocaFetching && buscaTroca.trim().length >= 1 && (entriesTroca?.data ?? []).length === 0 && (chequesTroca?.data ?? []).length === 0 && (
              <div className="px-5 py-5 text-sm text-gray-400 text-center">Nenhum lançamento encontrado.</div>
            )}
            {!entriesTrocaFetching && (() => {
              const allEntries: any[] = entriesTroca?.data ?? [];
              const valRef = trocandoLine?.extratoValor ?? 0;
              const busca = buscaTroca.trim();

              // Com busca: mostra resultados simples
              if (busca.length >= 1) {
                return (
                  <div className="divide-y">
                    {allEntries.map((e: any) => {
                      const nome = e.fornecedorNome || e.frotaFornecedor || e.pjFornecedor || e.descricao || "—";
                      const valor = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto ?? 0));
                      const data = e.dataCompetencia ?? e.dataVencimento ?? null;
                      const diffPct = valRef > 0 ? Math.round(Math.abs(valor - valRef) / valRef * 100) : null;
                      const exato = valRef > 0 && Math.abs(valor - valRef) < 0.015;
                      return (
                        <button key={e.id} type="button"
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors group flex items-start gap-3"
                          onClick={() => {
                            if (!trocandoLine) return;
                            setOverrideSug(prev => ({ ...prev, [trocandoLine.statementLineId]: { entryId: e.id, fornecedorNome: nome, descricao: e.descricao || "", valor: Number(e.valorRealizado ?? e.valorPrevisto ?? 0), data, obraNome: e.obraNome || undefined } }));
                            setTrocandoLine(null); setBuscaTroca("");
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-blue-700 group-hover:underline truncate flex items-center gap-1.5"><span className="truncate">{nome}</span>{entryChequeIdent(e) && <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700 shrink-0">🪙 nº {entryChequeIdent(e)}</span>}</div>
                            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="tabular-nums font-medium text-gray-700">{formatBRL(valor)}</span>
                              {data && <><span className="text-gray-300">·</span><span>{fmtData(data)}</span></>}
                              {e.obraNome && <><span className="text-gray-300">·</span><span>{e.obraNome}</span></>}
                              {e.contaNome && <><span className="text-gray-300">·</span><span className="text-gray-400 italic">{e.contaNome}</span></>}
                            </div>
                          </div>
                          <div className="shrink-0 mt-0.5">
                            {exato
                              ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">= valor exato</span>
                              : diffPct !== null
                                ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${diffPct <= 5 ? "bg-blue-100 text-blue-700" : diffPct <= 20 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>Δ {diffPct}%</span>
                                : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              }

              // Sem busca: dois grupos — valor próximo (≤20% diff) + demais
              const comValor = valRef > 0 ? [...allEntries].sort((a, b) => {
                const va = Math.abs(Number(a.valorRealizado ?? a.valorPrevisto ?? 0));
                const vb = Math.abs(Number(b.valorRealizado ?? b.valorPrevisto ?? 0));
                return Math.abs(va - valRef) - Math.abs(vb - valRef);
              }) : allEntries;

              const proximos = valRef > 0 ? comValor.filter(e => {
                const v = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto ?? 0));
                return Math.abs(v - valRef) / valRef <= 0.20;
              }) : [];
              const demais = valRef > 0 ? comValor.filter(e => {
                const v = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto ?? 0));
                return Math.abs(v - valRef) / valRef > 0.20;
              }) : comValor;

              const renderEntry = (e: any, destaque: boolean) => {
                const nome = e.fornecedorNome || e.frotaFornecedor || e.pjFornecedor || e.descricao || "—";
                const valor = Math.abs(Number(e.valorRealizado ?? e.valorPrevisto ?? 0));
                const data = e.dataCompetencia ?? e.dataVencimento ?? null;
                const exato = valRef > 0 && Math.abs(valor - valRef) < 0.015;
                const diffPct = valRef > 0 && !exato ? Math.round(Math.abs(valor - valRef) / valRef * 100) : null;
                return (
                  <button key={e.id} type="button"
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors group flex items-start gap-3 ${destaque ? "bg-blue-50/40" : ""}`}
                    onClick={() => {
                      if (!trocandoLine) return;
                      setOverrideSug(prev => ({ ...prev, [trocandoLine.statementLineId]: { entryId: e.id, fornecedorNome: nome, descricao: e.descricao || "", valor: Number(e.valorRealizado ?? e.valorPrevisto ?? 0), data, obraNome: e.obraNome || undefined } }));
                      setTrocandoLine(null); setBuscaTroca("");
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-blue-700 group-hover:underline truncate flex items-center gap-1.5"><span className="truncate">{nome}</span>{entryChequeIdent(e) && <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700 shrink-0">🪙 nº {entryChequeIdent(e)}</span>}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="tabular-nums font-medium text-gray-700">{formatBRL(valor)}</span>
                        {data && <><span className="text-gray-300">·</span><span>{fmtData(data)}</span></>}
                        {e.obraNome && <><span className="text-gray-300">·</span><span>{e.obraNome}</span></>}
                        {e.contaNome && <><span className="text-gray-300">·</span><span className="text-gray-400 italic">{e.contaNome}</span></>}
                      </div>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      {exato
                        ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">= valor exato</span>
                        : diffPct !== null
                          ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${diffPct <= 5 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>Δ {diffPct}%</span>
                          : null}
                    </div>
                  </button>
                );
              };

              return (
                <>
                  {proximos.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Valor próximo ao extrato ({formatBRL(valRef)})
                      </div>
                      <div className="divide-y">{proximos.map(e => renderEntry(e, true))}</div>
                    </>
                  )}
                  {demais.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                        {proximos.length > 0 ? "Outros lançamentos" : "Lançamentos recentes"}
                      </div>
                      <div className="divide-y">{demais.map(e => renderEntry(e, false))}</div>
                    </>
                  )}
                  {allEntries.length === 0 && (chequesTroca?.data ?? []).length === 0 && (
                    <div className="px-5 py-5 text-sm text-gray-400 text-center">Digite para buscar lançamentos.</div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="px-4 py-3 border-t bg-gray-50 flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Selecione um lançamento para substituir o vínculo</span>
            <Button size="sm" variant="outline" onClick={() => { setTrocandoLine(null); setBuscaTroca(""); }}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    {/* Rev. 3513 — Sheet de detalhe do extrato — padrão visual igual ao dialog do ERP */}
    <Sheet open={!!stmtDetailRow} onOpenChange={(o) => { if (!o) setStmtDetailRow(null); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-y-auto">
        {stmtDetailRow && (() => {
          const s = stmtDetailRow;
          const isEnt = Number(s.valor) >= 0;
          return (
            <>
              {/* Cabeçalho azul-escuro — mesmo padrão do dialog do ERP */}
              <div className="bg-[#1B2A4A] px-6 pt-8 pb-5 relative">
                <SheetHeader className="mb-1">
                  <SheetTitle className="text-xs font-semibold text-blue-300 uppercase tracking-widest">
                    LINHA DO EXTRATO #{s.id}
                  </SheetTitle>
                </SheetHeader>
                <p className="text-white text-xl font-bold break-words leading-snug mt-1 pr-24">
                  {s.descricao || "—"}
                </p>
                <p className="absolute top-8 right-6 text-right">
                  <span className="text-white text-2xl font-bold block">{formatBRL(Math.abs(Number(s.valor)))}</span>
                  {s.saldoApos != null && (
                    <span className={`text-xs font-medium block mt-0.5 ${Number(s.saldoApos) < 0 ? "text-red-300" : "text-emerald-300"}`}>
                      saldo {formatBRL(Number(s.saldoApos))}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {s.interno
                    ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500 text-white flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Mov. interna</span>
                    : isEnt
                      ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500 text-white flex items-center gap-1"><ArrowDownCircle className="w-3 h-3" /> Entrada</span>
                      : <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500 text-white flex items-center gap-1"><ArrowUpCircle className="w-3 h-3" /> Saída</span>
                  }
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white">extrato</span>
                </div>
              </div>

              {/* Seções */}
              <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">

                {/* DADOS DO EXTRATO */}
                <div className="rounded-lg border border-gray-200">
                  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Dados do Extrato</p>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Data</p>
                      <p className="text-sm text-gray-800 mt-0.5">{fmtData(s.data)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Valor</p>
                      <p className={`text-sm font-semibold mt-0.5 ${isEnt ? "text-emerald-600" : "text-rose-600"}`}>{formatBRL(Math.abs(Number(s.valor)))}</p>
                    </div>
                    {s.saldoApos != null && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Saldo após</p>
                        <p className={`text-sm font-semibold mt-0.5 ${Number(s.saldoApos) < 0 ? "text-red-500" : "text-emerald-600"}`}>{formatBRL(Number(s.saldoApos))}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Descrição completa</p>
                      <p className="text-sm text-gray-800 mt-0.5 break-words leading-relaxed">{s.descricao || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* CHEQUE */}
                {s.chequeFornecedor && (
                  <div className="rounded-lg border border-amber-200">
                    <div className="px-4 py-2 border-b border-amber-100 bg-amber-50 rounded-t-lg">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">🪙 Cheque</p>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Número</p>
                        <p className="text-sm text-gray-800 mt-0.5">{s.chequeNumero ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Fornecedor</p>
                        <p className="text-sm text-gray-800 mt-0.5 break-words">{s.chequeFornecedor}</p>
                      </div>
                      {s.chequeObraNome && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Obra</p>
                          <p className="text-sm text-gray-800 mt-0.5">{s.chequeObraNome}</p>
                        </div>
                      )}
                      {s.chequeNf && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">NF</p>
                          <p className="text-sm text-gray-800 mt-0.5">{s.chequeNf}</p>
                        </div>
                      )}
                      {s.chequeVencimento && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Vencimento</p>
                          <p className="text-sm text-gray-800 mt-0.5">{fmtData(s.chequeVencimento)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* FATURA CARTÃO */}
                {s.faturaId && !s.chequeFornecedor && (
                  <div className="rounded-lg border border-violet-200">
                    <div className="px-4 py-2 border-b border-violet-100 bg-violet-50 rounded-t-lg">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">💳 Fatura de Cartão</p>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cartão</p>
                        <p className="text-sm text-gray-800 mt-0.5">{s.faturaCartao ?? "—"}</p>
                      </div>
                      {s.faturaMesRef && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Referência</p>
                          <p className="text-sm text-gray-800 mt-0.5">{String(s.faturaMesRef).padStart(2,"0")}/{s.faturaAnoRef ?? ""}</p>
                        </div>
                      )}
                      {s.faturaVencimento && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Vencimento</p>
                          <p className="text-sm text-gray-800 mt-0.5">{fmtData(s.faturaVencimento)}</p>
                        </div>
                      )}
                      {s.faturaTotal != null && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Total da fatura</p>
                          <p className="text-sm text-gray-800 mt-0.5">{formatBRL(Math.abs(Number(s.faturaTotal)))}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* IDENTIFICAÇÃO POR IA */}
                {(s.demoBeneficiario || s.demoTipo) && (
                  <div className={`rounded-lg border ${s.demoVeredicto === "confirmado" ? "border-emerald-200" : s.demoVeredicto === "errado" ? "border-rose-200" : "border-violet-200"}`}>
                    <div className={`px-4 py-2 border-b rounded-t-lg ${s.demoVeredicto === "confirmado" ? "bg-emerald-50 border-emerald-100" : s.demoVeredicto === "errado" ? "bg-rose-50 border-rose-100" : "bg-violet-50 border-violet-100"}`}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">
                        {s.demoTipo === "boleto" ? "🧾 Boleto" : "💸 " + (s.demoTipo === "ted" ? "TED" : "PIX")} · Identificado por IA
                        {s.demoVeredicto === "confirmado" && <span className="ml-2 text-emerald-700">✓ Conferido</span>}
                        {s.demoVeredicto === "errado" && <span className="ml-2 text-rose-700">✗ Errado</span>}
                      </p>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3">
                      {s.demoBeneficiario && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Beneficiário</p>
                          <p className="text-sm text-gray-800 mt-0.5 break-words">{s.demoBeneficiario}</p>
                        </div>
                      )}
                      {s.demoDocumento && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Documento</p>
                          <p className="text-sm text-gray-800 mt-0.5">{s.demoDocumento}</p>
                        </div>
                      )}
                      {s.demoMatch === "valor" && (
                        <div className="col-span-2">
                          <p className="text-xs text-amber-600">⚠ Correspondência só por valor — confirme antes de lançar</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VÍNCULO CADASTRADO */}
                {s.vinculoTipo && (
                  <div className={`rounded-lg border ${s.vinculoVia === "cnpj" ? "border-emerald-200" : s.vinculoConfianca === "media" ? "border-amber-200" : "border-gray-200"}`}>
                    <div className={`px-4 py-2 border-b rounded-t-lg ${s.vinculoVia === "cnpj" ? "bg-emerald-50 border-emerald-100" : s.vinculoConfianca === "media" ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"}`}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                        {s.vinculoTipo === "cliente" ? "👤 Cliente Cadastrado" : "🏢 Fornecedor Cadastrado"}
                        {s.vinculoVia === "cnpj" && <span className="ml-2 text-emerald-700">· CNPJ confere</span>}
                        {s.vinculoVia === "nome" && s.vinculoConfianca === "media" && <span className="ml-2 text-amber-700">· sugestão por nome</span>}
                        {s.vinculoVia === "nome" && s.vinculoConfianca !== "media" && <span className="ml-2 text-gray-500">· palpite</span>}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-gray-800 break-words">{s.vinculoNome}</p>
                    </div>
                  </div>
                )}

              </div>

              {/* Rodapé */}
              <div className="px-5 py-4 border-t bg-white flex flex-col gap-2 shrink-0">
                <Button
                  className="w-full bg-[#1B2A4A] hover:bg-[#243660] text-white"
                  onClick={() => { setStmtDetailRow(null); abrirLancar(s); }}
                >
                  <Plus className="w-4 h-4 mr-2" /> Lançar no ERP
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { setStmtDetailRow(null); setConfirmExcluirLinha({ id: s.id, descricao: s.descricao || "—", valor: Number(s.valor), conciliado: false }); }}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Apagar linha do extrato
                </Button>
              </div>
            </>
          );
        })()}
      </SheetContent>
    </Sheet>

    </DashboardLayout>
  );
}
