import React, { useState, useMemo, useEffect, useRef } from "react";
import { parseAsUTC } from "@/lib/dateUtils";
import PanoramaFiscal from "./PanoramaFiscal";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Plus, Search, FileText, ExternalLink, Edit2, Trash2, Eye,
  Link, Link2Off, CheckCircle, Clock, AlertTriangle, RefreshCw,
  Building2, Calendar, Banknote, Receipt, X, DollarSign, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Upload, Loader2, Copy, Check as CheckIcon,
  Download, FileCode,
} from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatBRL(v: number | string | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function resolveNumeroNf(numeroNf: string | null | undefined, chaveAcesso: string | null | undefined): string {
  const nf = String(numeroNf ?? "");
  if (!nf.includes(".")) return nf;
  // numero_nf é float corrompido — tenta extrair do chave_acesso
  const chave = (chaveAcesso ?? "").replace(/\D/g, "");
  if (chave.length === 44) return String(parseInt(chave.substring(25, 34), 10));
  // chave_acesso também está corrompida (decimal ou científica) — número irrecuperável
  return "";
}

function parseBRL(s: string): number {
  const clean = s.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function maskBRL(v: string): string {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(s: string | null | undefined) {
  if (!s) return "—";
  const t = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("/") : t;
}

function isoToInput(s: string | null | undefined) {
  return s ? String(s).slice(0, 10) : "";
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:      { label: "Pendente",      color: "bg-amber-100 text-amber-800 border-amber-200" },
  recebida:      { label: "Recebida",      color: "bg-blue-100 text-blue-800 border-blue-200" },
  validada:      { label: "Validada",      color: "bg-violet-100 text-violet-800 border-violet-200" },
  conciliada:    { label: "Conciliada",    color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelada:     { label: "Cancelada",     color: "bg-red-100 text-red-700 border-red-200" },
  acatada:       { label: "✓ Acatada",     color: "bg-green-100 text-green-800 border-green-200" },
  recusada:      { label: "✗ Recusada",    color: "bg-red-100 text-red-800 border-red-200" },
  desconhecida:  { label: "? Desconhecida",color: "bg-slate-100 text-slate-700 border-slate-300" },
};

function fmtChave(chave: string | null | undefined): string {
  if (!chave) return "—";
  const clean = String(chave).replace(/\D/g, "");
  if (clean.length !== 44) return String(chave);
  return clean.match(/.{1,4}/g)?.join(" ") ?? String(chave);
}
function fmtCnpjDisplay(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const c = String(cnpj).replace(/\D/g, "");
  if (c.length !== 14) return cnpj;
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
}

type BatchItem = {
  id: string;
  fileName: string;
  parsed: any | null;
  error: string | null;
  status: "pending" | "reading" | "parsing" | "ok" | "saving" | "saved" | "error";
  selected: boolean;
};

type NF = {
  id: number;
  companyId?: number | null;
  numeroNf: string;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao: string;
  dataPrestacao?: string | null;
  dataCompetencia?: string | null;
  dataVencimento?: string | null;
  tomadorCnpj?: string | null;
  tomadorRazaoSocial?: string | null;
  tomadorInscricao?: string | null;
  tomadorEmail?: string | null;
  tomadorTelefone?: string | null;
  obraId?: number | null;
  obraNome?: string | null;
  bmReferencia?: string | null;
  descricaoServico?: string | null;
  cdCnae?: string | null;
  cdListaServico?: string | null;
  optanteSimples?: boolean | null;
  tributada?: boolean | null;
  valorBruto: string;
  deducoesTotal?: string | null;
  baseCalculoIss?: string | null;
  aliquotaIss?: string | null;
  issRetido?: string | null;
  retencaoInss?: string | null;
  retencaoIrrf?: string | null;
  retencaoPisCofins?: string | null;
  retencaoCsll?: string | null;
  retencaoPis?: string | null;
  retencaoCofins?: string | null;
  retencaoOutras?: string | null;
  valorLiquido: string;
  status: string;
  origem?: string | null;
  entryId?: number | null;
  stmtLineId?: number | null;
  arquivoUrl?: string | null;
  arquivoNome?: string | null;
  observacoes?: string | null;
};

const emptyForm = (): Omit<NF, "id" | "status" | "createdAt" | "updatedAt"> => ({
  numeroNf: "",
  serie: "",
  chaveAcesso: "",
  dataEmissao: new Date().toISOString().slice(0, 10),
  dataCompetencia: "",
  dataVencimento: "",
  tomadorCnpj: "",
  tomadorRazaoSocial: "",
  obraId: null,
  obraNome: "",
  bmReferencia: "",
  descricaoServico: "",
  valorBruto: "0",
  deducoesTotal: "0",
  baseCalculoIss: null,
  aliquotaIss: null,
  issRetido: "0",
  retencaoInss: "0",
  retencaoIrrf: "0",
  retencaoPisCofins: "0",
  valorLiquido: "0",
  entryId: null,
  stmtLineId: null,
  arquivoUrl: "",
  arquivoNome: "",
  observacoes: "",
});

function calcValorLiquido(form: any) {
  const bruto = parseBRL(String(form.valorBruto || 0));
  const iss = parseBRL(String(form.issRetido || 0));
  const inss = parseBRL(String(form.retencaoInss || 0));
  const irrf = parseBRL(String(form.retencaoIrrf || 0));
  const pis = parseBRL(String(form.retencaoPisCofins || 0));
  return Math.max(0, bruto - iss - inss - irrf - pis);
}

export default function FinanceiroNotasFiscais() {
  const { companyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const { user } = useAuth();

  const [ano, setAno] = useState(new Date().getFullYear());
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterSemVinculo, setFilterSemVinculo] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NF | null>(null);
  const [detalheNf, setDetalheNf] = useState<NF | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState<string>("recebida");
  const [conciliarMesOpen, setConciliarMesOpen] = useState(false);
  const [selectedRecIds, setSelectedRecIds] = useState<Set<number>>(new Set());
  const [bulkRecDeleteOpen, setBulkRecDeleteOpen] = useState(false);
  const [bulkRecStatusOpen, setBulkRecStatusOpen] = useState(false);
  const [bulkRecStatusTarget, setBulkRecStatusTarget] = useState<string>("recebida");
  const masterRecRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [tab, setTab] = useState<"dados" | "tributacao" | "vinculo">("dados");
  const [vincularEntryId, setVincularEntryId] = useState("");
  const [vincularStmtId, setVincularStmtId] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);

  const [nfseEspelhoId, setNfseEspelhoId] = useState<number | null>(null);

  const [confirmHistorico, setConfirmHistorico] = useState(false);
  const [confirmHistoricoNfse, setConfirmHistoricoNfse] = useState(false);
  const [nfeRecDetalhe, setNfeRecDetalhe] = useState<any>(null);
  const [danfeUrl, setDanfeUrl] = useState<string | null>(null);
  const [copiedChave, setCopiedChave] = useState(false);
  const [justRecusa, setJustRecusa] = useState("");
  const [showJustRecusa, setShowJustRecusa] = useState(false);

  // ── Progresso simulado da sync SEFAZ (0-100) ──────────────────────────────
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const syncIvRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dismiss do banner de portal offline ─────────────────────────────────────
  const [dismissPortalErro, setDismissPortalErro] = useState(
    () => localStorage.getItem("nfse_portal_erro_dismissed") === "1"
  );
  function fecharBannerPortal() {
    localStorage.setItem("nfse_portal_erro_dismissed", "1");
    setDismissPortalErro(true);
  }

  // ── Aba principal: emitidas | recebidas | panorama ───────────────────────────
  const [pageTab, setPageTab] = useState<"emitidas" | "recebidas" | "panorama">("emitidas");
  const [recAno, setRecAno] = useState(new Date().getFullYear());
  const [recMes, setRecMes] = useState<number | null>(new Date().getMonth() + 1);
  const [recSearch, setRecSearch] = useState("");
  const [recStatus, setRecStatus] = useState("todos");

  // ── Upload XML ──────────────────────────────────────────────────────────────
  const [xmlUploading, setXmlUploading] = useState(false);
  const [xmlUploadProgress, setXmlUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const nfseXmlInputRef = useRef<HTMLInputElement>(null);

  const nfeRecQuery = (trpc as any).sefaz.listNFeRecebidas.useQuery(
    { companyId: companyId ?? 0, ano: recAno, mes: recMes ?? undefined, search: recSearch || undefined, status: recStatus !== "todos" ? recStatus : undefined },
    { enabled: !!companyId && pageTab === "recebidas", staleTime: 30_000 }
  );
  const nfeRec: any[] = nfeRecQuery.data?.items ?? [];
  const nfeSemXml: number = nfeRecQuery.data?.semXml ?? 0;
  const backfillMut = (trpc as any).sefaz.recuperarXmlsBackfill.useMutation({
    onSuccess: (res: any) => {
      nfeRecQuery.refetch();
      if (res.recuperadas > 0 && res.restantes === 0) {
        toast({ title: `✅ ${res.recuperadas} XML${res.recuperadas !== 1 ? "s" : ""} recuperado${res.recuperadas !== 1 ? "s" : ""}! Todas as notas agora têm XML completo.` });
      } else if (res.recuperadas > 0) {
        toast({ title: `✅ ${res.recuperadas} XML${res.recuperadas !== 1 ? "s" : ""} recuperado${res.recuperadas !== 1 ? "s" : ""}`, description: `Ainda faltam ${res.restantes} — clique novamente para continuar.${res.aviso ? " " + res.aviso : ""}` });
      } else if (res.restantes === 0) {
        toast({ title: "✅ Todas as notas já têm XML completo!" });
      } else {
        const avisoExtra = res.aviso ? ` ${res.aviso}` : "";
        toast({ title: "ℹ️ Nenhum XML novo desta vez", description: `${res.restantes} nota${res.restantes !== 1 ? "s" : ""} antiga${res.restantes !== 1 ? "s" : ""} podem não ter XML disponível na SEFAZ.${avisoExtra}`, duration: 7000 } as any);
      }
    },
    onError: (e: any) => toast({ title: "Erro ao recuperar XMLs", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });
  const excluirRecLoteMut = (trpc as any).fiscalNotes.excluirLote.useMutation({
    onSuccess: (_: any, vars: any) => {
      const n = vars.ids.length;
      setSelectedRecIds(new Set());
      nfeRecQuery.refetch();
      toast({ title: `✅ ${n} NF-e${n !== 1 ? "s" : ""} excluída${n !== 1 ? "s" : ""} com sucesso.` });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e?.message, variant: "destructive" }),
  });

  // Query anual sem filtros para dots do calendário recebidas
  const nfeRecYearQuery = (trpc as any).sefaz.listNFeRecebidas.useQuery(
    { companyId: companyId ?? 0, ano: recAno },
    { enabled: !!companyId && pageTab === "recebidas", staleTime: 60_000 }
  );
  const recMesesStatus = useMemo((): Record<number, "consolidado" | "lancamento" | "vazio"> => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    for (const nf of (nfeRecYearQuery.data?.items ?? []) as any[]) {
      const d = String(nf.dataEmissao || nf.dataEntrada || "").slice(0, 10);
      const m = parseInt(d.split("-")[1] ?? "0", 10);
      if (!m) continue;
      if (nf.status === "cancelada") continue;
      if (map[m] === "vazio") {
        map[m] = nf.status === "conciliada" ? "consolidado" : "lancamento";
      } else if (map[m] === "consolidado" && nf.status !== "conciliada") {
        map[m] = "lancamento";
      }
    }
    return map;
  }, [nfeRecYearQuery.data]);

  // ── Config SEFAZ (last_sync_at / ultimo_nsu / last_sync_result) ──────────────
  const sefazCfgQuery = (trpc as any).sefaz.getConfig.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId && pageTab === "recebidas", staleTime: 60_000, refetchInterval: 60_000 }
  );
  const sefazCfg: any = sefazCfgQuery.data ?? null;

  // ── Espelho fiel NFS-e emitida ───────────────────────────────────────────────
  const nfseEspelhoQuery = (trpc as any).nfseEmitidas.getDetalhesNFse.useQuery(
    { id: nfseEspelhoId ?? 0, companyId: companyId ?? 0 },
    { enabled: !!nfseEspelhoId && !!companyId, staleTime: 60_000 }
  );

  // ── Municípios NFS-e emitidas (last_sync_at por município) ───────────────────
  const municipiosQuery = (trpc as any).nfseEmitidas.getMunicipios.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId && pageTab === "emitidas", staleTime: 60_000, refetchInterval: 60_000 }
  );
  const municipios: any[] = municipiosQuery.data ?? [];

  // SIAP GEO ibge_code para Guaratinguetá
  const GUARA_IBGE = 3518602;

  const [syncAllResult, setSyncAllResult] = useState<any>(null);
  const syncAllMunMut = (trpc as any).nfseEmitidas.syncAllMunicipios.useMutation({
    onSuccess: (data: any) => {
      setSyncAllResult(data);
      municipiosQuery.refetch();
      listQuery.refetch();
      yearQuery.refetch();
    },
  });

  const sincronizarNfMut = (trpc as any).fiscalNotes.sincronizarComExtrato.useMutation({
    onSuccess: (res: any) => {
      listQuery.refetch();
      nfeRecQuery.refetch();
      yearQuery.refetch();
      if (res.vinculados > 0) {
        toast({ title: `✅ ${res.vinculados} NF-e vinculada${res.vinculados !== 1 ? "s" : ""} ao extrato bancário!`, description: `${res.candidatosAnalised} correspondência${res.candidatosAnalised !== 1 ? "s" : ""} analisada${res.candidatosAnalised !== 1 ? "s" : ""}.` });
      } else {
        toast({ title: "ℹ️ Nenhuma NF-e nova vinculada", description: "Todas as NF-e já estão vinculadas ou não foram encontradas correspondências no extrato.", duration: 7000 } as any);
      }
    },
    onError: (e: any) => toast({ title: "Erro ao vincular NF-e", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const [syncHistoricoProgress, setSyncHistoricoProgress] = useState<{
    running: boolean; anoAtual: number; anoIdx: number; totalAnos: number;
    importadas: number; ignoradas: number;
  } | null>(null);
  const syncMunicipioMut = (trpc as any).nfseEmitidas.syncMunicipio.useMutation();
  const importNfseXmlMut = (trpc as any).nfseEmitidas.importNfseXmlManual.useMutation();
  const [xmlImportProgress, setXmlImportProgress] = useState<{ done: number; total: number } | null>(null);

  // ── Cronômetro regressivo SEFAZ: atualiza a cada segundo ─────────────────────
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  useEffect(() => {
    if (!sefazCfg) { setCountdownSec(null); return; }
    const calcSecs = () => {
      try {
        const intervaloHoras = Math.max(2, Number(sefazCfg.sync_intervalo_horas ?? 2));
        const result = JSON.parse(sefazCfg.last_sync_result || "{}");
        // Backoff progressivo: mesmo cálculo do backend
        const consecutiveRl = result?.rateLimitedAt ? Math.max(1, result?.rateLimitConsecutive ?? 1) : 0;
        const rlMultiplier = consecutiveRl >= 4 ? 4 : consecutiveRl >= 2 ? 2 : 1;
        // DEVE casar EXATAMENTE com o gate real do backend (executarSyncNFe:
        // cooldownMin = intervalo*60 + 3). Usar -2 fazia o cronômetro zerar ~5min
        // (×backoff) ANTES do gate abrir → o auto-disparo batia no gate, era rejeitado
        // e o guard de "1 disparo/janela" desperdiçava a tentativa ("zera mas não sincroniza").
        // +3s de folga absorve o arredondamento (floor) do countdown e jitter de relógio,
        // garantindo que o cliente só dispare DEPOIS do gate do servidor abrir (nunca ~1s antes).
        const gateMs = (intervaloHoras * 60 + 3) * 60 * 1000 * rlMultiplier + 3000;
        const baseTs = result?.rateLimitedAt
          ? parseAsUTC(result.rateLimitedAt).getTime()
          : sefazCfg.last_sync_at
            ? parseAsUTC(sefazCfg.last_sync_at).getTime()
            : null;
        if (!baseTs || isNaN(baseTs)) { setCountdownSec(null); return; }
        const nextSyncMs = baseTs + gateMs;
        setCountdownSec(Math.max(0, Math.floor((nextSyncMs - Date.now()) / 1000)));
      } catch { setCountdownSec(null); }
    };
    calcSecs();
    const iv = setInterval(calcSecs, 1000);
    return () => clearInterval(iv);
  }, [sefazCfg]);

  // ── Próximo disparo do cron SEFAZ (:00 e :30 de cada hora) ──────────────────
  const [cronSecsLeft, setCronSecsLeft] = useState<number>(0);
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const min = brt.getMinutes();
      const sec = brt.getSeconds();
      const secsInHour = min * 60 + sec;
      const next = secsInHour < 1800 ? 1800 - secsInHour : 3600 - secsInHour;
      setCronSecsLeft(next);
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Cronômetro regressivo NFS-e Municipal: município com sync mais recente ────
  const [munCountdownSec, setMunCountdownSec] = useState<number | null>(null);
  useEffect(() => {
    const enabled = municipios.filter((m: any) => m.enabled);
    if (!enabled.length) { setMunCountdownSec(null); return; }
    // Pega o last_sync_at mais recente entre os municípios habilitados
    const latestTs = enabled.reduce((best: number | null, m: any) => {
      if (!m.last_sync_at) return best;
      const t = parseAsUTC(m.last_sync_at).getTime();
      return best === null || t > best ? t : best;
    }, null as number | null);
    const calcSecs = () => {
      if (!latestTs) { setMunCountdownSec(null); return; }
      const nextMs = latestTs + 55 * 60 * 1000;
      setMunCountdownSec(Math.max(0, Math.floor((nextMs - Date.now()) / 1000)));
    };
    calcSecs();
    const iv = setInterval(calcSecs, 1000);
    return () => clearInterval(iv);
  }, [municipios]);

  const recTotais = useMemo(() => {
    const total = nfeRec.length;
    const valorTotal = nfeRec.reduce((s: number, r: any) => s + (r.valorLiquido || 0), 0);
    const pendentes = nfeRec.filter((r: any) => r.status === "pendente").length;
    const lancadas = nfeRec.filter((r: any) => r.entryId).length;
    return { total, valorTotal, pendentes, lancadas };
  }, [nfeRec]);

  const listQuery = trpc.fiscalNotes.list.useQuery(
    {
      companyId: companyId ?? 0,
      ano,
      mes: mesSel ?? undefined,
      search: search || undefined,
      status: filterStatus !== "todos" ? filterStatus : undefined,
      semVinculo: filterSemVinculo || undefined,
    },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  // Query separada (ano inteiro, sem mes) para calcular as bolinhas de status dos 12 meses.
  const yearQuery = trpc.fiscalNotes.list.useQuery(
    { companyId: companyId ?? 0, ano },
    { enabled: !!companyId, staleTime: 60_000 }
  );

  const nfs: NF[] = useMemo(() => (listQuery.data ?? []) as NF[], [listQuery.data]);

  // Bolinha por mês: verde=todas conciliadas, azul=tem NF em aberto, cinza=sem NFs.
  const mesesStatus = useMemo((): Record<number, "consolidado" | "lancamento" | "vazio"> => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    for (const nf of (yearQuery.data ?? []) as NF[]) {
      const d = String(nf.dataEmissao).slice(0, 10);
      const m = parseInt(d.split("-")[1] ?? "0", 10);
      if (!m) continue;
      if (nf.status === "cancelada") continue;
      if (map[m] === "vazio") {
        map[m] = nf.status === "conciliada" ? "consolidado" : "lancamento";
      } else if (map[m] === "consolidado" && nf.status !== "conciliada") {
        map[m] = "lancamento";
      }
    }
    return map;
  }, [yearQuery.data]);

  const criarMut = trpc.fiscalNotes.criar.useMutation({
    onSuccess: () => { toast({ title: "NF-e cadastrada!" }); setDialogOpen(false); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarMut = trpc.fiscalNotes.atualizar.useMutation({
    onSuccess: () => { toast({ title: "NF-e atualizada!" }); setDialogOpen(false); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const excluirMut = trpc.fiscalNotes.excluir.useMutation({
    onSuccess: () => { toast({ title: "NF-e cancelada." }); setDeleteTarget(null); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const excluirLoteMut = trpc.fiscalNotes.excluirLote.useMutation({
    onSuccess: (r) => {
      toast({ title: `${r.deleted} nota${r.deleted !== 1 ? "s" : ""} excluída${r.deleted !== 1 ? "s" : ""} permanentemente.` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      listQuery.refetch();
    },
    onError: (e) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });
  const bulkStatusMut = trpc.fiscalNotes.bulkUpdateStatus.useMutation({
    onSuccess: (r) => {
      const st = STATUS_MAP[bulkStatusTarget]?.label ?? bulkStatusTarget;
      toast({ title: `${r.updated} nota${r.updated !== 1 ? "s" : ""} marcada${r.updated !== 1 ? "s" : ""} como "${st}".` });
      setSelectedIds(new Set());
      setBulkStatusOpen(false);
      listQuery.refetch();
    },
    onError: (e) => toast({ title: "Erro ao atualizar status", description: e.message, variant: "destructive" }),
  });
  const bulkRecStatusMut = trpc.fiscalNotes.bulkUpdateStatus.useMutation({
    onSuccess: (r) => {
      const st = STATUS_MAP[bulkRecStatusTarget]?.label ?? bulkRecStatusTarget;
      toast({ title: `${r.updated} NF-e${r.updated !== 1 ? "s" : ""} marcada${r.updated !== 1 ? "s" : ""} como "${st}".` });
      setSelectedRecIds(new Set());
      setBulkRecStatusOpen(false);
      nfeRecQuery.refetch();
    },
    onError: (e) => toast({ title: "Erro ao atualizar status", description: e.message, variant: "destructive" }),
  });
  const conciliarMesMut = (trpc as any).fiscalNotes.conciliarMes.useMutation({
    onSuccess: (r: { updated: number }) => {
      const nomeMes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mesSel! - 1];
      toast({ title: `${r.updated} nota${r.updated !== 1 ? "s" : ""} de ${nomeMes}/${ano} marcada${r.updated !== 1 ? "s" : ""} como Conciliada.` });
      setConciliarMesOpen(false);
      listQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao conciliar mês", description: e.message, variant: "destructive" }),
  });

  const finishSyncProgress = (ok: boolean) => {
    if (syncIvRef.current) { clearInterval(syncIvRef.current); syncIvRef.current = null; }
    setSyncProgress(100);
    setTimeout(() => setSyncProgress(null), ok ? 900 : 600);
  };
  const sefazSyncMut = (trpc as any).sefaz.syncNow.useMutation({
    onSuccess: (r: any) => {
      finishSyncProgress(!r?.erro);
      nfeRecQuery.refetch();
      // Recarrega a config para que o cronômetro reinicie a partir do novo last_sync_at
      // (ou rateLimitedAt). Sem isso o countdown fica preso em 00:00 e o auto-disparo
      // não rearma para a próxima janela de cota.
      sefazCfgQuery.refetch();
      if (r?.erro) toast({ title: "SEFAZ: " + r.erro, variant: "destructive" });
      else if (r?.aviso) toast({ title: "⚠️ Limite de chamadas SEFAZ", description: r.aviso, variant: "default", duration: 8000 });
      else if (r?.parcial) toast({ title: `SEFAZ: ${r?.importadas ?? 0} NF-e importadas (sincronização parcial — cron continua automaticamente)`, duration: 7000 });
      else toast({ title: `SEFAZ: ${r?.importadas ?? 0} NF-e novas importadas, ${r?.ignoradas ?? 0} já existiam.` });
    },
    onError: (e: any) => {
      finishSyncProgress(false);
      sefazCfgQuery.refetch();
      toast({ title: "Erro na sync SEFAZ", description: e.message, variant: "destructive" });
    },
  });

  // ── Auto-disparo da sync quando a cota renova (cronômetro chega a 00:00) ─────
  // Antes o cronômetro era PURAMENTE visual: zerava e ficava esperando o cron do
  // backend (até ~30 min depois). Agora, assim que a cota renova com a página
  // aberta e o sync automático ligado, disparamos a sincronização na hora.
  // Guarda por janela de cota (baseTs = rateLimitedAt|last_sync_at) garante 1
  // disparo por renovação, imune a jitter de relógio. O gate atômico do backend
  // (por CNPJ) protege contra disparos simultâneos de múltiplas abas/usuários.
  const autoSyncFiredForTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!sefazCfg || !companyId) return;
    if (!Boolean(Number(sefazCfg.sync_enabled))) return; // só auto-dispara com sync automático ligado
    if (countdownSec === null || countdownSec > 0) return; // ainda há cooldown
    if (sefazSyncMut.isPending) return; // já sincronizando
    let baseTs: number | null = null;
    try {
      const result = JSON.parse(sefazCfg.last_sync_result || "{}");
      baseTs = result?.rateLimitedAt
        ? parseAsUTC(result.rateLimitedAt).getTime()
        : sefazCfg.last_sync_at ? parseAsUTC(sefazCfg.last_sync_at).getTime() : null;
    } catch {
      baseTs = sefazCfg.last_sync_at ? parseAsUTC(sefazCfg.last_sync_at).getTime() : null;
    }
    const windowKey = baseTs ?? 0;
    if (autoSyncFiredForTsRef.current === windowKey) return; // já disparou nesta janela
    autoSyncFiredForTsRef.current = windowKey;
    sefazSyncMut.mutate({ companyId });
  }, [countdownSec, sefazCfg, companyId]);
  const sefazEnableSyncMut = (trpc as any).sefaz.saveConfig.useMutation({
    onSuccess: () => {
      toast({ title: "✅ Sync automático ligado!", description: "O sistema sincronizará com a SEFAZ automaticamente a cada hora." });
      sefazCfgQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao ligar sync", description: e.message, variant: "destructive" }),
  });


  // Anima progresso enquanto a mutation está pendente
  useEffect(() => {
    if (sefazSyncMut.isPending) {
      setSyncProgress(0);
      let elapsed = 0;
      syncIvRef.current = setInterval(() => {
        elapsed += 250;
        // Curva exponencial: chega em ~85% em ~10s, nunca passa
        const p = 85 * (1 - Math.exp(-elapsed / 7000));
        setSyncProgress(Math.round(Math.min(p, 85)));
      }, 250);
    }
    return () => { if (syncIvRef.current) { clearInterval(syncIvRef.current); syncIvRef.current = null; } };
  }, [sefazSyncMut.isPending]);
  const importXmlMut = (trpc as any).sefaz.importXml.useMutation();
  const sefazResetNsuMut = (trpc as any).sefaz.resetNSU.useMutation({
    onSuccess: () => {
      toast({ title: "NSU zerado. Clique em 'Sincronizar SEFAZ' para iniciar o download do histórico.", duration: 8000 });
      sefazCfgQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao resetar NSU", description: e.message, variant: "destructive" }),
  });
  const nfeDetalhesQuery = (trpc as any).sefaz.getDetalhesNFe.useQuery(
    { id: nfeRecDetalhe?.id ?? 0, companyId: companyId ?? 0 },
    { enabled: !!nfeRecDetalhe && !!companyId }
  );
  const sefazSyncLogQuery = (trpc as any).sefaz.getSyncLog.useQuery(
    { companyId: companyId ?? 0, limit: 30 },
    { enabled: !!companyId && pageTab === "recebidas", refetchInterval: 120_000 }
  );
  const manifestarMut = (trpc as any).sefaz.manifestar.useMutation({
    onSuccess: (data: any, vars: any) => {
      const labels: Record<string, string> = { acatada: "acatada ✓", recusada: "recusada ✗", desconhecida: "marcada como desconhecida" };
      const proto = data?.nProt ? ` · Protocolo SEFAZ: ${data.nProt}` : (data?.local ? " (apenas local)" : " · aguardando confirmação SEFAZ");
      toast({ title: `NF-e ${labels[vars.status] ?? vars.status}`, description: proto });
      setNfeRecDetalhe((prev: any) => prev ? { ...prev, status: vars.status } : null);
      setShowJustRecusa(false);
      setJustRecusa("");
      nfeRecQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao manifestar", description: e.message, variant: "destructive" }),
  });
  const vincularEntryMut = trpc.fiscalNotes.vincularLancamento.useMutation({
    onSuccess: () => { toast({ title: "Lançamento vinculado!" }); setDetalheNf(null); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const vincularStmtMut = trpc.fiscalNotes.vincularExtrato.useMutation({
    onSuccess: () => { toast({ title: "Extrato vinculado!" }); setDetalheNf(null); listQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const parsePdfMut = trpc.fiscalNotes.parsePdf.useMutation({
    onError: (e) => {
      setIsParsing(false);
      toast({ title: "Erro ao ler PDF", description: e.message, variant: "destructive" });
    },
  });

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(
      f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (!files.length || !companyId) return;
    if (pdfInputRef.current) pdfInputRef.current.value = "";

    // Arquivo único → fluxo original (abre formulário para revisão)
    if (files.length === 1) {
      const file = files[0];
      setIsParsing(true);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const parsed = await parsePdfMut.mutateAsync({ companyId, pdfBase64: base64 });
        setEditingId(null);
        setForm({
          ...emptyForm(),
          numeroNf:           parsed.numeroNf ?? "",
          serie:              parsed.serie ?? "",
          chaveAcesso:        parsed.chaveAcesso ?? "",
          dataEmissao:        parsed.dataEmissao ?? new Date().toISOString().slice(0, 10),
          dataCompetencia:    parsed.dataCompetencia ?? "",
          dataVencimento:     parsed.dataVencimento ?? "",
          tomadorCnpj:        parsed.tomadorCnpj ?? "",
          tomadorRazaoSocial: parsed.tomadorRazaoSocial ?? "",
          descricaoServico:   parsed.descricaoServico ?? "",
          valorBruto:         formatBRL(parsed.valorBruto),
          deducoesTotal:      formatBRL(parsed.deducoesTotal),
          baseCalculoIss:     parsed.baseCalculoIss != null ? formatBRL(parsed.baseCalculoIss) : "",
          aliquotaIss:        parsed.aliquotaIss != null ? String(parsed.aliquotaIss) : "",
          issRetido:          formatBRL(parsed.issRetido),
          retencaoInss:       formatBRL(parsed.retencaoInss),
          retencaoIrrf:       formatBRL(parsed.retencaoIrrf),
          retencaoPisCofins:  formatBRL(parsed.retencaoPisCofins),
          valorLiquido:       formatBRL(parsed.valorLiquido),
          arquivoNome:        file.name,
        });
        setTab("dados");
        setDialogOpen(true);
        toast({ title: "PDF lido com sucesso!", description: "Confira os dados e salve a NF-e." });
      } catch (err: any) {
        toast({ title: "Erro ao ler PDF", description: err?.message, variant: "destructive" });
      } finally {
        setIsParsing(false);
      }
      return;
    }

    // Múltiplos arquivos → fluxo em lote
    const items: BatchItem[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      fileName: f.name,
      parsed: null,
      error: null,
      status: "pending" as const,
      selected: true,
    }));
    setBatchItems(items);
    setBatchOpen(true);
    setIsParsing(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Fase 1: lendo arquivo
      setBatchItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "reading" } : it));
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        // Fase 2: IA processando
        setBatchItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: "parsing" } : it));
        const parsed = await parsePdfMut.mutateAsync({ companyId, pdfBase64: base64 });
        setBatchItems(prev => prev.map((it, idx) =>
          idx === i ? { ...it, status: "ok", parsed } : it
        ));
      } catch (err: any) {
        setBatchItems(prev => prev.map((it, idx) =>
          idx === i ? { ...it, status: "error", error: err?.message ?? "Erro desconhecido", selected: false } : it
        ));
      }
    }
    setIsParsing(false);
  }

  async function handleSalvarLote() {
    if (!companyId) return;
    const selecionados = batchItems.filter(it => it.selected && it.status === "ok" && it.parsed);
    if (!selecionados.length) return;
    setBatchSaving(true);
    let ok = 0; let fail = 0;
    for (const item of selecionados) {
      const p = item.parsed;
      try {
        await criarMut.mutateAsync({
          companyId,
          numeroNf:           p.numeroNf ?? "s/n",
          serie:              p.serie || null,
          chaveAcesso:        p.chaveAcesso || null,
          dataEmissao:        p.dataEmissao ?? new Date().toISOString().slice(0, 10),
          dataCompetencia:    p.dataCompetencia || null,
          dataVencimento:     p.dataVencimento || null,
          tomadorCnpj:        p.tomadorCnpj || null,
          tomadorRazaoSocial: p.tomadorRazaoSocial || null,
          obraId:             null,
          obraNome:           null,
          bmReferencia:       null,
          descricaoServico:   p.descricaoServico || null,
          valorBruto:         p.valorBruto ?? 0,
          deducoesTotal:      p.deducoesTotal ?? 0,
          baseCalculoIss:     p.baseCalculoIss ?? null,
          aliquotaIss:        p.aliquotaIss ?? null,
          issRetido:          p.issRetido ?? 0,
          retencaoInss:       p.retencaoInss ?? 0,
          retencaoIrrf:       p.retencaoIrrf ?? 0,
          retencaoPisCofins:  p.retencaoPisCofins ?? 0,
          valorLiquido:       p.valorLiquido ?? 0,
          arquivoUrl:         null,
          arquivoNome:        item.fileName,
          observacoes:        null,
        });
        setBatchItems(prev => prev.map(it => it.id === item.id ? { ...it, status: "saved" } : it));
        ok++;
      } catch {
        fail++;
      }
    }
    setBatchSaving(false);
    listQuery.refetch();
    toast({
      title: `${ok} NF-e(s) cadastrada(s)${fail ? ` — ${fail} com erro` : ""}`,
      variant: fail && !ok ? "destructive" : "default",
    });
    if (ok > 0) setBatchOpen(false);
  }

  async function handleXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(
      f => f.name.toLowerCase().endsWith(".xml") || f.type === "text/xml" || f.type === "application/xml"
    );
    if (!files.length || !companyId) return;
    if (xmlInputRef.current) xmlInputRef.current.value = "";
    setXmlUploading(true);
    setXmlUploadProgress({ done: 0, total: files.length });
    let importadas = 0, ignoradas = 0, backendErros = 0, fileErros = 0;
    const allErros: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setXmlUploadProgress({ done: i, total: files.length });
        try {
          const content = await files[i].text();
          const r: any = await importXmlMut.mutateAsync({
            companyId,
            xmlFiles: [{ name: files[i].name, content }],
          });
          importadas    += r?.importadas ?? 0;
          ignoradas     += r?.ignoradas  ?? 0;
          backendErros  += r?.erros?.length ?? 0;
          if (r?.erros?.length) { allErros.push(...r.erros); console.error("[ImportXML] erros:", r.erros); }
        } catch (err: any) {
          fileErros++;
          allErros.push(String(err?.message || err).slice(0, 150));
        }
      }
      setXmlUploadProgress({ done: files.length, total: files.length });
      nfeRecQuery?.refetch?.();
      listQuery?.refetch?.();
      yearQuery?.refetch?.();
      const totalErros = backendErros + fileErros;
      const msg =
        `${importadas} NF-e importada${importadas !== 1 ? "s" : ""}` +
        `, ${ignoradas} já existia${ignoradas !== 1 ? "m" : ""}` +
        (totalErros > 0 ? `, ${totalErros} com erro` : "") + ".";
      toast({
        title: "Import XML: " + msg,
        description: allErros.length > 0 ? allErros[0].slice(0, 160) : undefined,
        variant: importadas > 0 ? "default" : totalErros > 0 ? "destructive" : "default",
      });
    } catch {
      toast({ title: "Erro ao ler os arquivos XML", variant: "destructive" });
    } finally {
      setXmlUploading(false);
      setXmlUploadProgress(null);
    }
  }

  async function iniciarSyncHistoricoNfse() {
    if (!companyId) return;
    setConfirmHistoricoNfse(false);
    const anoFim = new Date().getFullYear();
    const anos = Array.from({ length: anoFim - 2018 + 1 }, (_, i) => 2018 + i);
    let totalImportadas = 0, totalIgnoradas = 0, totalErros = 0;
    setSyncHistoricoProgress({ running: true, anoAtual: anos[0], anoIdx: 0, totalAnos: anos.length, importadas: 0, ignoradas: 0 });
    for (let i = 0; i < anos.length; i++) {
      const ano = anos[i];
      setSyncHistoricoProgress(p => p ? { ...p, anoAtual: ano, anoIdx: i } : null);
      try {
        const r: any = await syncMunicipioMut.mutateAsync({
          companyId,
          ibgeCode: GUARA_IBGE,
          dataInicial: `${ano}-01-01`,
          dataFinal: `${ano}-12-31`,
        });
        totalImportadas += r.importadas ?? 0;
        totalIgnoradas += r.ignoradas ?? 0;
      } catch {
        totalErros++;
      }
      setSyncHistoricoProgress(p => p ? { ...p, importadas: totalImportadas, ignoradas: totalIgnoradas } : null);
    }
    setSyncHistoricoProgress(null);
    municipiosQuery.refetch();
    listQuery.refetch();
    yearQuery.refetch();
    toast({
      title: `Histórico NFS-e concluído`,
      description: `${totalImportadas} importadas · ${totalIgnoradas} já existiam${totalErros ? ` · ${totalErros} erros` : ""}`,
      variant: totalImportadas > 0 ? "default" : "destructive",
    });
  }

  async function handleNfseXmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(
      f => f.name.toLowerCase().endsWith(".xml") || f.type === "text/xml" || f.type === "application/xml"
    );
    if (!files.length || !companyId) return;
    if (nfseXmlInputRef.current) nfseXmlInputRef.current.value = "";
    let totalImportadas = 0, totalIgnoradas = 0, allErros: string[] = [];
    try {
      for (const file of files) {
        const content = await file.text();
        // Detecta formato SIAP GEO Export (<nfse> com <nf> filhos)
        if (content.includes("<nfse") && content.includes("<nf>")) {
          const domParser = new DOMParser();
          const doc = domParser.parseFromString(content, "text/xml");
          const nfNodes = Array.from(doc.querySelectorAll("nfse > nf"));
          if (nfNodes.length > 0) {
            const serializer = new XMLSerializer();
            const BATCH = 10;
            setXmlImportProgress({ done: 0, total: nfNodes.length });
            for (let i = 0; i < nfNodes.length; i += BATCH) {
              const batch = nfNodes.slice(i, i + BATCH);
              const batchXml = `<?xml version="1.0" encoding="UTF-8"?>\n<nfse>\n${
                batch.map(n => serializer.serializeToString(n)).join("\n")
              }\n</nfse>`;
              const r: any = await importNfseXmlMut.mutateAsync({
                companyId, xmlContents: [{ name: file.name, content: batchXml }],
              });
              totalImportadas += r.importadas ?? 0;
              totalIgnoradas += r.ignoradas ?? 0;
              allErros.push(...(r.erros ?? []));
              setXmlImportProgress({ done: Math.min(i + BATCH, nfNodes.length), total: nfNodes.length });
            }
            setXmlImportProgress(null);
            continue;
          }
        }
        // Formato ABRASF individual (1 nota por XML)
        const r: any = await importNfseXmlMut.mutateAsync({
          companyId, xmlContents: [{ name: file.name, content }],
        });
        totalImportadas += r.importadas ?? 0;
        totalIgnoradas += r.ignoradas ?? 0;
        allErros.push(...(r.erros ?? []));
      }
      listQuery.refetch(); yearQuery.refetch();
      const msg = `${totalImportadas} NFS-e importada${totalImportadas !== 1 ? "s" : ""}, ${totalIgnoradas} já existia${totalIgnoradas !== 1 ? "m" : ""}.`;
      const erroTxt = allErros.length ? ` ${allErros.length} com erro.` : "";
      toast({ title: "Import XML NFS-e: " + msg + erroTxt, variant: totalImportadas > 0 ? "default" : "destructive" });
    } catch (err: any) {
      setXmlImportProgress(null);
      toast({ title: "Erro no import XML NFS-e", description: err?.message, variant: "destructive" });
    }
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setTab("dados");
    setDialogOpen(true);
  }

  function openEdit(nf: NF) {
    setEditingId(nf.id);
    setForm({
      ...nf,
      valorBruto: formatBRL(nf.valorBruto),
      deducoesTotal: formatBRL(nf.deducoesTotal),
      baseCalculoIss: nf.baseCalculoIss ? formatBRL(nf.baseCalculoIss) : "",
      issRetido: formatBRL(nf.issRetido),
      retencaoInss: formatBRL(nf.retencaoInss),
      retencaoIrrf: formatBRL(nf.retencaoIrrf),
      retencaoPisCofins: formatBRL(nf.retencaoPisCofins),
      valorLiquido: formatBRL(nf.valorLiquido),
    });
    setTab("dados");
    setDialogOpen(true);
  }

  function setF(key: string, val: any) { setForm((p: any) => ({ ...p, [key]: val })); }

  function handleMoneyBlur(key: string) {
    const v = parseBRL(String(form[key] || 0));
    setF(key, formatBRL(v));
    if (key !== "valorLiquido") {
      const liq = calcValorLiquido({ ...form, [key]: String(v) });
      setF("valorLiquido", formatBRL(liq));
    }
  }

  function handleSubmit() {
    if (!companyId) return;
    const payload = {
      companyId,
      numeroNf:           form.numeroNf,
      serie:              form.serie || null,
      chaveAcesso:        form.chaveAcesso || null,
      dataEmissao:        form.dataEmissao,
      dataCompetencia:    form.dataCompetencia || null,
      dataVencimento:     form.dataVencimento || null,
      tomadorCnpj:        form.tomadorCnpj || null,
      tomadorRazaoSocial: form.tomadorRazaoSocial || null,
      obraId:             form.obraId ?? null,
      obraNome:           form.obraNome || null,
      bmReferencia:       form.bmReferencia || null,
      descricaoServico:   form.descricaoServico || null,
      valorBruto:         parseBRL(String(form.valorBruto)),
      deducoesTotal:      parseBRL(String(form.deducoesTotal)),
      baseCalculoIss:     form.baseCalculoIss ? parseBRL(String(form.baseCalculoIss)) : null,
      aliquotaIss:        form.aliquotaIss ? parseFloat(String(form.aliquotaIss)) : null,
      issRetido:          parseBRL(String(form.issRetido)),
      retencaoInss:       parseBRL(String(form.retencaoInss)),
      retencaoIrrf:       parseBRL(String(form.retencaoIrrf)),
      retencaoPisCofins:  parseBRL(String(form.retencaoPisCofins)),
      valorLiquido:       parseBRL(String(form.valorLiquido)),
      arquivoUrl:         form.arquivoUrl || null,
      arquivoNome:        form.arquivoNome || null,
      observacoes:        form.observacoes || null,
    };
    if (editingId) {
      atualizarMut.mutate({ ...payload, id: editingId });
    } else {
      criarMut.mutate(payload);
    }
  }

  const isSaving = criarMut.isPending || atualizarMut.isPending;

  const totais = useMemo(() => {
    const pendente  = nfs.filter(n => n.status === "pendente");
    const recebida  = nfs.filter(n => n.status === "recebida");
    const validada  = nfs.filter(n => n.status === "validada");
    const conciliada = nfs.filter(n => n.status === "conciliada");
    const somarLiq = (arr: NF[]) => arr.reduce((s, n) => s + parseFloat(String(n.valorLiquido || 0)), 0);
    return {
      total: nfs.length,
      pendente: pendente.length,
      recebida: recebida.length,
      validada: validada.length,
      conciliada: conciliada.length,
      valorPendente:   somarLiq(pendente),
      valorRecebida:   somarLiq(recebida),
      valorValidada:   somarLiq(validada),
      valorConciliada: somarLiq(conciliada),
      valorTotal:      somarLiq(nfs),
    };
  }, [nfs]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">

        {/* Input PDF global — sempre no DOM para funcionar em qualquer aba */}
        <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handlePdfUpload} />
        <input ref={nfseXmlInputRef} type="file" accept=".xml,text/xml,application/xml" multiple className="hidden" onChange={handleNfseXmlUpload} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="h-6 w-6 text-indigo-600" />
              Notas Fiscais
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Controle de NF-e e NFS-e — emitidas e recebidas</p>
          </div>
          {pageTab === "emitidas" && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-9 border-violet-300 text-violet-700 hover:bg-violet-50"
                disabled={sincronizarNfMut.isPending}
                onClick={() => {
                  const m = mesSel ?? 0;
                  const dataInicio = m ? `${ano}-${String(m).padStart(2,"0")}-01` : `${ano}-01-01`;
                  const dataFim = m ? `${ano}-${String(m).padStart(2,"0")}-${new Date(ano, m, 0).getDate()}` : `${ano}-12-31`;
                  sincronizarNfMut.mutate({ companyId: companyId ?? 0, dataInicio, dataFim });
                }}
                title="Busca correspondências entre as NF-e emitidas e as linhas do extrato bancário do período selecionado"
              >
                <Link className={`h-3.5 w-3.5 ${sincronizarNfMut.isPending ? "animate-pulse" : ""}`} />
                {sincronizarNfMut.isPending ? "Vinculando..." : "Vincular com Extrato"}
              </Button>
            </div>
          )}
          {pageTab === "recebidas" && (
            <div className="flex gap-2 shrink-0 flex-wrap">
              <input
                ref={xmlInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                multiple
                className="hidden"
                onChange={handleXmlUpload}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={xmlUploading || importXmlMut.isPending}
                onClick={() => xmlInputRef.current?.click()}
                title="Importe NF-e pelo arquivo XML baixado do portal SEFAZ"
              >
                {xmlUploading || importXmlMut.isPending
                  ? <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {xmlUploadProgress && xmlUploadProgress.total > 1
                        ? `Importando... ${Math.round((xmlUploadProgress.done / xmlUploadProgress.total) * 100)}%`
                        : "Importando..."}
                    </>
                  : <><Upload className="h-3.5 w-3.5" /> Importar XML</>}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={sefazSyncMut.isPending || sefazResetNsuMut.isPending}
                onClick={() => sefazSyncMut.mutate({ companyId: companyId ?? 0 })}
                title="Busca as NF-e novas desde a última sincronização"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sefazSyncMut.isPending ? "animate-spin" : ""}`} />
                {sefazSyncMut.isPending ? "Sincronizando..." : "Sincronizar SEFAZ"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={sefazSyncMut.isPending || sefazResetNsuMut.isPending}
                onClick={() => setConfirmHistorico(true)}
                title="Zera o NSU e baixa todas as NF-e desde o início"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sefazResetNsuMut.isPending ? "animate-spin" : ""}`} />
                {sefazResetNsuMut.isPending ? "Baixando..." : "Histórico completo"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-9 border-violet-300 text-violet-700 hover:bg-violet-50"
                disabled={sincronizarNfMut.isPending}
                onClick={() => {
                  const m = recMes ?? 0;
                  const dataInicio = m ? `${recAno}-${String(m).padStart(2,"0")}-01` : `${recAno}-01-01`;
                  const dataFim = m ? `${recAno}-${String(m).padStart(2,"0")}-${new Date(recAno, m, 0).getDate()}` : `${recAno}-12-31`;
                  sincronizarNfMut.mutate({ companyId: companyId ?? 0, dataInicio, dataFim });
                }}
                title="Busca correspondências entre as NF-e recebidas e as linhas do extrato bancário do período selecionado"
              >
                <Link className={`h-3.5 w-3.5 ${sincronizarNfMut.isPending ? "animate-pulse" : ""}`} />
                {sincronizarNfMut.isPending ? "Vinculando..." : "Vincular com Extrato"}
              </Button>
            </div>
          )}
        </div>

        {/* Barra de progresso sync SEFAZ */}
        {syncProgress !== null && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 text-indigo-600 ${syncProgress < 100 ? "animate-spin" : ""}`} />
                <span className="text-sm font-semibold text-indigo-800">
                  {syncProgress < 100 ? "Consultando SEFAZ..." : "✅ Sincronização concluída!"}
                </span>
              </div>
              <span className="text-sm font-bold tabular-nums text-indigo-700">{syncProgress}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-indigo-200 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${syncProgress}%`,
                  background: syncProgress === 100
                    ? "linear-gradient(90deg,#10b981,#059669)"
                    : "linear-gradient(90deg,#6366f1,#4f46e5)",
                  transition: syncProgress === 100 ? "width 0.3s ease-out" : "width 0.25s linear",
                }}
              />
              {syncProgress < 100 && (
                <div
                  className="absolute inset-y-0 rounded-full opacity-40"
                  style={{
                    width: "30%",
                    left: `${Math.max(0, syncProgress - 15)}%`,
                    background: "linear-gradient(90deg,transparent,white,transparent)",
                    animation: "shimmer 1.2s ease-in-out infinite",
                  }}
                />
              )}
            </div>
            {syncProgress < 100 && (
              <p className="text-xs text-indigo-500 mt-1.5">
                Buscando NF-e recebidas pelo CNPJ da empresa junto ao SEFAZ…
              </p>
            )}
          </div>
        )}

        {/* Abas principais: Emitidas | Recebidas | Panorama */}
        <div className="flex gap-1 border-b border-slate-200 -mb-1">
          {([
            { key: "emitidas",  label: "📤 Emitidas" },
            { key: "recebidas", label: "📥 Recebidas" },
            { key: "panorama",  label: "📊 Panorama Fiscal" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPageTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pageTab === key
                  ? "border-indigo-600 text-indigo-700 bg-indigo-50/60"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>


        {/* ═══════════════════════════════════════════════════════════════════════
            ABA: NF-e RECEBIDAS (SEFAZ) — sub-aba Produtos
        ═══════════════════════════════════════════════════════════════════════ */}
        {pageTab === "recebidas" && (() => {
          const MESES_REC = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
          const fmtCountdown = (s: number) => {
            if (s <= 0) return null; // ready to sync
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return `${h}h ${String(m).padStart(2,"0")}min ${String(sec).padStart(2,"0")}s`;
            return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
          };
          const countdownLabel = fmtCountdown(countdownSec ?? 0);
          const nsuNum = Number(sefazCfg?.ultimo_nsu ?? 0);
          return (
            <div className="space-y-4">
              {/* Cronômetro de próxima sync + controles rápidos */}
              {sefazCfg && (() => {
                const syncOn = Boolean(Number(sefazCfg.sync_enabled));
                const intervaloH = Math.max(2, Number(sefazCfg.sync_intervalo_horas ?? 2));
                const _rlResult = (() => { try { return JSON.parse(sefazCfg.last_sync_result || "{}"); } catch { return {}; } })();
                const _consec = _rlResult?.rateLimitedAt ? Math.max(1, _rlResult?.rateLimitConsecutive ?? 1) : 0;
                const _rlMult = _consec >= 4 ? 4 : _consec >= 2 ? 2 : 1;
                const gateTotal = (intervaloH * 60 + 3) * 60 * _rlMult;
                return (
                  <div className={`rounded-xl border px-4 py-3 ${
                    !syncOn
                      ? "border-slate-200 bg-slate-50"
                      : countdownLabel
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50"
                  }`}>
                    {/* Linha principal: anel + texto + última sync */}
                    <div className="flex items-center gap-3">
                      {/* Anel de progresso com dígitos do countdown */}
                      {(() => {
                        const ringColor = countdownLabel
                          ? (syncOn ? "#f59e0b" : "#94a3b8")
                          : "#10b981";
                        const circ = 2 * Math.PI * 34; // r=34, viewBox 80
                        const progress = countdownLabel
                          ? 1 - (countdownSec ?? 0) / gateTotal
                          : 1;
                        const dashOffset = circ * (1 - progress);
                        const cs = countdownSec ?? 0;
                        const hh = Math.floor(cs / 3600);
                        const mm = Math.floor((cs % 3600) / 60);
                        const ss = cs % 60;
                        return (
                          <div className="relative shrink-0 w-24 h-24">
                            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                              <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="5" />
                              <circle cx="40" cy="40" r="34" fill="none"
                                stroke={ringColor} strokeWidth="5"
                                strokeDasharray={`${circ}`}
                                strokeDashoffset={String(dashOffset)}
                                strokeLinecap="round"
                                style={{ transition: "stroke-dashoffset 1s linear" }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                              {countdownLabel ? (
                                hh > 0 ? (
                                  <>
                                    <span className={`text-base font-black leading-none tabular-nums ${syncOn ? "text-amber-700" : "text-slate-600"}`}>
                                      {hh}h
                                    </span>
                                    <span className={`text-sm font-bold leading-none tabular-nums ${syncOn ? "text-amber-600" : "text-slate-500"}`}>
                                      {String(mm).padStart(2, "0")}m
                                    </span>
                                  </>
                                ) : (
                                  <span className={`text-sm font-black leading-none tabular-nums font-mono ${syncOn ? "text-amber-700" : "text-slate-600"}`}>
                                    {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                                  </span>
                                )
                              ) : syncOn ? (
                                <>
                                  <span className="text-[9px] font-semibold text-emerald-600 leading-none">próx.</span>
                                  <span className="text-sm font-black leading-none tabular-nums font-mono text-emerald-700">
                                    {String(Math.floor(cronSecsLeft / 60)).padStart(2,"0")}:{String(cronSecsLeft % 60).padStart(2,"0")}
                                  </span>
                                </>
                              ) : (
                                <RefreshCw className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      {/* Texto — sempre mostra quando a cota estará disponível */}
                      <div className="flex-1 min-w-0">
                        {countdownLabel ? (
                          <>
                            <p className={`text-sm font-semibold ${syncOn ? "text-amber-800" : "text-slate-600"}`}>
                              {syncOn ? "Próxima sync em" : "Cota SEFAZ disponível em"}
                            </p>
                            <p className={`text-2xl font-black tabular-nums font-mono leading-tight ${syncOn ? "text-amber-700" : "text-slate-700"}`}>
                              {countdownLabel}
                            </p>
                            <p className={`text-xs mt-0.5 ${syncOn ? "text-amber-600" : "text-slate-500"}`}>
                              {syncOn
                                ? _consec >= 2
                                  ? `⚠️ SEFAZ bloqueou ${_consec}× seguidas — backoff ${_rlMult}× (próxima tentativa em ~${intervaloH * _rlMult}h).`
                                  : `Limite SEFAZ: 1 chamada/${intervaloH}h por CNPJ.`
                                : `Sync automático desligado. Configure em Configurações → Financeiro.`}
                              {nsuNum > 0 && <> · NSU: <strong>{nsuNum.toLocaleString("pt-BR")}</strong></>}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className={`text-sm font-semibold ${syncOn ? "text-emerald-800" : "text-slate-600"}`}>
                              {syncOn
                                ? (sefazSyncMut.isPending ? "🔄 Sincronizando com a SEFAZ agora…" : "✅ Cota renovada — sincronizando automaticamente")
                                : "✅ Cota SEFAZ disponível — use Sincronizar Agora"}
                            </p>
                            <p className={`text-xs mt-0.5 ${syncOn ? "text-emerald-600" : "text-slate-500"}`}>
                              {syncOn
                                ? (sefazSyncMut.isPending
                                    ? <>Buscando NF-e novas… · limite SEFAZ: 1/{intervaloH}h.</>
                                    : <>O disparo é automático ao renovar a cota · limite SEFAZ: 1/{intervaloH}h.</>)
                                : `Sync automático desligado. Configure em Configurações → Financeiro.`}
                              {nsuNum > 0 && <> · NSU: <strong>{nsuNum.toLocaleString("pt-BR")}</strong></>}
                            </p>
                          </>
                        )}
                      </div>
                      {/* Última sync */}
                      {sefazCfg.last_sync_at && (
                        <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                          <div>Última sync</div>
                          <div className="font-medium text-slate-500">
                            {parseAsUTC(sefazCfg.last_sync_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* CTA: ligar sync automático direto aqui */}
                    {!syncOn && sefazCfg?.tem_certificado && (
                      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-3">
                        <button
                          onClick={() => sefazEnableSyncMut.mutate({
                            companyId: companyId!,
                            cnpj: sefazCfg.cnpj ?? "",
                            uf: sefazCfg.uf ?? "SP",
                            ambiente: sefazCfg.ambiente ?? "producao",
                            syncEnabled: true,
                            syncHora: Number(sefazCfg.sync_hora ?? 6),
                            syncIntervaloHoras: Math.max(2, Number(sefazCfg.sync_intervalo_horas ?? 2)),
                          })}
                          disabled={sefazEnableSyncMut.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                        >
                          {sefazEnableSyncMut.isPending
                            ? <><span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> Ativando…</>
                            : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Ligar sync automático</>
                          }
                        </button>
                        <span className="text-xs text-slate-400">Importa novas NF-e automaticamente a cada hora.</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Painel de auditoria de sync */}
              {(() => {
                const logs: any[] = sefazSyncLogQuery.data ?? [];
                if (!sefazCfg) return null;
                const statusBadge = (s: string) => {
                  if (s === "ok")         return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">✓ OK</span>;
                  if (s === "rate_limit") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">⏱ Rate Limit</span>;
                  if (s === "erro")       return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">✗ Erro</span>;
                  if (s === "rodando")    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 animate-pulse">⟳ Rodando</span>;
                  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{s}</span>;
                };
                return (
                  <details className="rounded-xl border border-slate-200 bg-white overflow-hidden group">
                    <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:bg-slate-50 transition-colors list-none">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">🕵️ Log de Sincronizações SEFAZ</span>
                        {logs.length > 0 && (
                          <span className="text-[11px] text-slate-400">— última: {logs[0]?.iniciado_brt ?? "—"} (Horário Brasília)</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 group-open:hidden">▼ ver detalhes</span>
                      <span className="text-xs text-slate-400 hidden group-open:inline">▲ fechar</span>
                    </summary>
                    <div className="overflow-x-auto border-t border-slate-100">
                      {logs.length === 0 ? (
                        <p className="text-xs text-slate-400 px-4 py-3">Nenhum registro de sync ainda — o log é gerado a partir desta revisão.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Data/Hora (BRT)</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-right font-medium">Importadas</th>
                              <th className="px-3 py-2 text-right font-medium">Ignoradas</th>
                              <th className="px-3 py-2 text-right font-medium">Páginas</th>
                              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">NSU Inicial</th>
                              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">NSU Final</th>
                              <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">Duração</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {logs.map((log: any) => (
                              <tr key={log.id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">
                                  {log.iniciado_brt ?? "—"}
                                </td>
                                <td className="px-3 py-1.5">{statusBadge(log.status)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {log.importadas > 0
                                    ? <span className="font-semibold text-emerald-700">{log.importadas}</span>
                                    : <span className="text-slate-400">0</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{log.ignoradas}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{log.paginas}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-400 text-[10px] hidden md:table-cell">
                                  {log.nsu_inicial ? Number(log.nsu_inicial).toLocaleString("pt-BR") : "—"}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-slate-400 text-[10px] hidden md:table-cell">
                                  {log.nsu_final ? Number(log.nsu_final).toLocaleString("pt-BR") : "—"}
                                </td>
                                <td className="px-3 py-1.5 text-right text-slate-400 hidden lg:table-cell">
                                  {log.duracao_seg != null ? `${log.duracao_seg}s` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </details>
                );
              })()}

              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Recebidas", val: recTotais.total, sub: formatBRL(recTotais.valorTotal), color: "indigo" },
                  { label: "Valor Total", val: formatBRL(recTotais.valorTotal), sub: `${recTotais.total} nota${recTotais.total !== 1 ? "s" : ""}`, color: "emerald", isVal: true },
                  { label: "Pendentes", val: recTotais.pendentes, sub: "sem lançamento", color: "amber" },
                  { label: "Com Lançamento", val: recTotais.lancadas, sub: "conciliadas", color: "blue" },
                ].map(k => (
                  <Card key={k.label} className="border-0 shadow-sm">
                    <CardContent className="p-3">
                      <div className={`text-xs font-medium text-${k.color}-600 mb-1`}>{k.label}</div>
                      <div className="text-xl font-bold text-slate-900">{k.val}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{k.sub}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Aviso: sem certificado → ação necessária | com cert mas sem notas → informativo */}
              {nfeRec.length === 0 && !nfeRecQuery.isLoading && !sefazCfg?.tem_certificado && (
                <Card className="border-0 shadow-sm ring-1 ring-amber-100 bg-amber-50/60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Certificado A1 não configurado</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Configure o certificado A1 em <strong>Configurações → Financeiro → Integração SEFAZ</strong> para buscar
                        automaticamente todas as NF-e recebidas pelo CNPJ da empresa.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {nfeRec.length === 0 && !nfeRecQuery.isLoading && sefazCfg?.tem_certificado && (
                <Card className="border-0 shadow-sm ring-1 ring-blue-100 bg-blue-50/40">
                  <CardContent className="p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-800">Nenhuma NF-e encontrada neste período</p>
                      <p className="text-xs text-blue-600 mt-1">
                        O certificado A1 está configurado e o SEFAZ sincroniza automaticamente toda hora.
                        Se a empresa emitiu NF-e para fornecedores ou recebeu de terceiros, elas aparecerão aqui após a próxima sincronização.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timeline ano/mês */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setRecAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"><ChevronLeft className="w-4 h-4" /></button>
                      <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{recAno}</span>
                      <button type="button" onClick={() => setRecAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"><ChevronRight className="w-4 h-4" /></button>
                      <Button type="button" variant={recMes == null ? "default" : "outline"} size="sm" className="h-8 text-xs ml-2" onClick={() => setRecMes(null)}>Ano todo</Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                    {MESES_REC.map((m, i) => {
                      const num = i + 1;
                      const status = recMesesStatus[num];
                      return (
                        <button key={m} type="button" onClick={() => setRecMes(num)}
                          className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                            ${recMes === num ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}>
                          <span>{m}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            status === "consolidado" ? "bg-green-500" :
                            status === "lancamento"  ? "bg-blue-500" :
                            "bg-gray-300"
                          }`} />
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Filtros */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input className="pl-8 h-9" placeholder="Buscar emitente, CNPJ, NF#, chave..." value={recSearch} onChange={e => setRecSearch(e.target.value)} />
                </div>
                <Select value={recStatus} onValueChange={setRecStatus}>
                  <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="conciliada">Conciliada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Barra de seleção múltipla */}
              {selectedRecIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-600 text-white rounded-xl mb-2 shadow">
                  <span className="text-sm font-medium">{selectedRecIds.size} NF-e{selectedRecIds.size !== 1 ? "s" : ""} selecionada{selectedRecIds.size !== 1 ? "s" : ""}</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setSelectedRecIds(new Set())}
                    className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
                  >Desmarcar todas</button>
                  <button
                    type="button"
                    onClick={() => setBulkRecStatusOpen(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 font-semibold transition-colors"
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                    Mudar Status
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkRecDeleteOpen(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-red-500 hover:bg-red-400 font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir {selectedRecIds.size}
                  </button>
                </div>
              )}

              {/* Tabela */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-3 py-2.5 w-8">
                          <input
                            type="checkbox"
                            ref={masterRecRef}
                            className="rounded cursor-pointer"
                            checked={nfeRec.length > 0 && selectedRecIds.size === nfeRec.length}
                            onChange={e => {
                              if (e.target.checked) setSelectedRecIds(new Set(nfeRec.map((n: any) => n.id)));
                              else setSelectedRecIds(new Set());
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left">NF#</th>
                        <th className="px-3 py-2.5 text-left">Emissão</th>
                        <th className="px-3 py-2.5 text-left">Emitente</th>
                        <th className="px-3 py-2.5 text-left">CNPJ Emitente</th>
                        <th className="px-3 py-2.5 text-right">Valor</th>
                        <th className="px-3 py-2.5 text-left">Status</th>
                        <th className="px-3 py-2.5 text-left">Chave de Acesso</th>
                        <th className="px-3 py-2.5 text-left">Importada em</th>
                        <th className="px-3 py-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfeRecQuery.isLoading && (
                        <tr><td colSpan={10} className="py-10 text-center text-slate-400">Carregando...</td></tr>
                      )}
                      {!nfeRecQuery.isLoading && nfeRec.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Receipt className="h-8 w-8 text-slate-300" />
                              <span className="text-slate-400 text-sm">Nenhuma NF-e recebida neste período.</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {nfeRec.map((nf: any) => {
                        const st = STATUS_MAP[nf.status] ?? { label: nf.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
                        const isRecSelected = selectedRecIds.has(nf.id);
                        return (
                          <tr
                            key={nf.id}
                            className={`border-b hover:bg-indigo-50/50 transition-colors cursor-pointer ${isRecSelected ? "bg-indigo-50" : ""}`}
                            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
                            role="button"
                            tabIndex={0}
                            onClick={() => { setNfeRecDetalhe(nf); setCopiedChave(false); }}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { setNfeRecDetalhe(nf); setCopiedChave(false); } }}
                            title="Clique para ver detalhes da NF-e"
                          >
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded cursor-pointer"
                                checked={isRecSelected}
                                onChange={e => {
                                  const next = new Set(selectedRecIds);
                                  if (e.target.checked) next.add(nf.id); else next.delete(nf.id);
                                  setSelectedRecIds(next);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-indigo-700">#{resolveNumeroNf(nf.numeroNf, nf.chaveAcesso) || "—"}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDateBR(nf.dataEmissao)}</td>
                            <td className="px-3 py-2.5 max-w-[220px]">
                              <div className="truncate text-slate-800 font-medium" title={nf.emitenteNome ?? ""}>{nf.emitenteNome || "—"}</div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 text-xs tabular-nums whitespace-nowrap">{nf.emitenteCnpj || "—"}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700 whitespace-nowrap">{formatBRL(nf.valorLiquido)}</td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                                {st.label}
                              </span>
                              {nf.entryId && <CheckCircle className="w-3 h-3 text-emerald-500 ml-1 inline" />}
                            </td>
                            <td className="px-3 py-2.5 text-slate-400 text-xs font-mono max-w-[180px]">
                              <span className="truncate block" title={nf.chaveAcesso ?? ""}>{nf.chaveAcesso ? nf.chaveAcesso.slice(0, 22) + "…" : "—"}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">{fmtDateBR(nf.createdAt)}</td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
                                style={{ touchAction: "manipulation" }}
                                title="Ver detalhes"
                                onClick={e => { e.stopPropagation(); setNfeRecDetalhe(nf); setCopiedChave(false); }}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {nfeRec.length > 0 && (
                  <div className="px-4 py-2.5 border-t text-xs text-slate-400 bg-slate-50/60 flex items-center justify-between gap-3 flex-wrap">
                    <span>{nfeRec.length} NF-e{nfeRec.length !== 1 ? "s" : ""} recebida{nfeRec.length !== 1 ? "s" : ""} via SEFAZ — atualizado automaticamente todo dia às 06:00.</span>
                    {nfeSemXml > 0 && (
                      <button
                        type="button"
                        disabled={backfillMut.isPending}
                        onClick={() => backfillMut.mutate({ companyId: companyId! })}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold transition-colors disabled:opacity-60 shrink-0"
                        title="Consulta a SEFAZ para recuperar o XML completo das notas importadas como resumo"
                      >
                        {backfillMut.isPending
                          ? <><RefreshCw className="w-3 h-3 animate-spin" />Recuperando…</>
                          : <><RefreshCw className="w-3 h-3" />{nfeSemXml} nota{nfeSemXml !== 1 ? "s" : ""} sem XML — Recuperar</>}
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════════
            ABA: NFS-e EMITIDAS (conteúdo original)
        ═══════════════════════════════════════════════════════════════════════ */}
        {pageTab === "emitidas" && <>

        {/* Banner NFS-e Emitidas — fonte e ações */}
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-slate-50 px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-indigo-900">NFS-e Emitidas pela FC</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong>2018–{new Date().getFullYear()}:</strong> busque o histórico completo via API da prefeitura (SIAP GEO) clicando em "Baixar histórico".
                {" "}<strong>Importar XML:</strong> aceita (1) exportação SIAP GEO ("em formato XML" — um arquivo com várias notas) ou (2) XML ABRASF individual do Portal Nacional. Todas as notas do arquivo são importadas de uma vez.
              </p>
            </div>
          </div>
          {/* Barra de progresso do histórico */}
          {syncHistoricoProgress?.running ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">
                  🔄 Buscando {syncHistoricoProgress.anoAtual}…
                  <span className="text-slate-400 ml-1">
                    (ano {syncHistoricoProgress.anoIdx + 1} de {syncHistoricoProgress.totalAnos})
                  </span>
                </span>
                <span className="text-emerald-700 font-semibold">
                  {syncHistoricoProgress.importadas} novas · {syncHistoricoProgress.ignoradas} já existiam
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((syncHistoricoProgress.anoIdx / syncHistoricoProgress.totalAnos) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 text-right">
                {Math.round((syncHistoricoProgress.anoIdx / syncHistoricoProgress.totalAnos) * 100)}% concluído
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                size="sm"
                onClick={() => nfseXmlInputRef.current?.click()}
                disabled={importNfseXmlMut.isPending}
                className="gap-1.5 h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
              >
                {(importNfseXmlMut.isPending || xmlImportProgress)
                  ? <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {xmlImportProgress
                        ? `${xmlImportProgress.done}/${xmlImportProgress.total} (${Math.round(xmlImportProgress.done / xmlImportProgress.total * 100)}%)`
                        : "Importando…"}
                    </>
                  : <><FileCode className="w-3 h-3" /> Importar XML</>}
              </Button>
              {/* Cronômetro: tempo até próxima consulta permitida na prefeitura */}
              {munCountdownSec !== null && munCountdownSec > 0 && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 font-mono">
                  <Clock className="w-3 h-3" />
                  {munCountdownSec >= 3600
                    ? `${Math.floor(munCountdownSec / 3600)}h ${String(Math.floor((munCountdownSec % 3600) / 60)).padStart(2, "0")}m`
                    : `${String(Math.floor(munCountdownSec / 60)).padStart(2, "0")}:${String(munCountdownSec % 60).padStart(2, "0")}`}
                  <span className="font-sans font-normal">p/ próxima consulta</span>
                </span>
              )}
              {munCountdownSec === 0 && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                  <CheckCircle className="w-3 h-3" /> Consulta disponível
                </span>
              )}
            </div>
          )}
        </div>

        {/* Resultado da sync (quando executada manualmente) */}
        {syncAllResult && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs flex flex-wrap gap-3 items-center">
            <span className="font-semibold text-emerald-800">Verificação concluída:</span>
            {syncAllResult.resultados?.map((r: any) => (
              <span key={r.ibge} className={r.erro ? "text-red-600" : r.aviso ? "text-amber-700" : "text-emerald-700"}>
                {r.nome}: {r.erro ? `❌ ${r.erro.slice(0, 60)}` : r.aviso ? `ℹ️ ${r.aviso.slice(0, 80)}` : `✓ ${r.importadas} novas`}
              </span>
            ))}
            <button className="ml-auto text-slate-400 hover:text-slate-600 text-[10px] underline" onClick={() => setSyncAllResult(null)}>fechar</button>
          </div>
        )}


        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Pendentes",   count: totais.pendente,   valor: totais.valorPendente,   color: "amber" },
            { label: "Recebidas",   count: totais.recebida,   valor: totais.valorRecebida,   color: "blue" },
            { label: "Validadas",   count: totais.validada,   valor: totais.valorValidada,   color: "violet" },
            { label: "Conciliadas", count: totais.conciliada, valor: totais.valorConciliada, color: "emerald" },
            { label: "Total NFs",   count: totais.total,      valor: totais.valorTotal,      color: "slate" },
          ].map(k => (
            <Card key={k.label} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className={`text-xs font-medium text-${k.color}-600 mb-1`}>{k.label}</div>
                <div className="text-xl font-bold text-slate-900">{k.count}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatBRL(k.valor)}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Timeline Ano / Mês */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
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
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMesSel(num)}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span>{m}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === "consolidado" ? "bg-green-500" :
                      status === "lancamento"  ? "bg-blue-500" :
                      "bg-gray-300"
                    }`} />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-8 h-9"
              placeholder="Buscar NF, tomador, obra..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="recebida">Recebida</SelectItem>
              <SelectItem value="validada">Validada</SelectItem>
              <SelectItem value="conciliada">Conciliada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filterSemVinculo ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1"
            onClick={() => setFilterSemVinculo(v => !v)}
          >
            <Link2Off className="h-3.5 w-3.5" />
            Sem Lançamento
          </Button>
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={() => listQuery.refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          {mesSel !== null && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400"
              onClick={() => setConciliarMesOpen(true)}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Conciliar Mês
            </Button>
          )}
        </div>

        {/* Tabela */}
        {/* Barra de seleção em lote */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-600 text-white rounded-xl shadow-lg flex-wrap">
            <CheckIcon className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium flex-1 min-w-[120px]">
              {selectedIds.size} nota{selectedIds.size !== 1 ? "s" : ""} selecionada{selectedIds.size !== 1 ? "s" : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-indigo-200 hover:text-white hover:bg-indigo-700 h-7 px-3"
              onClick={() => setSelectedIds(new Set())}
            >
              Limpar
            </Button>
            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white gap-1.5 h-7 px-3"
              onClick={() => setBulkRecStatusOpen(true)}
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Mudar Status
            </Button>
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white gap-1.5 h-7 px-3"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir {selectedIds.size}
            </Button>
          </div>
        )}

        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 cursor-pointer"
                      checked={nfs.length > 0 && selectedIds.size === nfs.length}
                      ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < nfs.length; }}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(nfs.map(n => n.id)) : new Set())}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">NF</th>
                  <th className="px-3 py-2.5 text-left">Emissão</th>
                  <th className="px-3 py-2.5 text-left">Tomador</th>
                  <th className="px-3 py-2.5 text-left">Obra / BM</th>
                  <th className="px-3 py-2.5 text-right">Valor Bruto</th>
                  <th className="px-3 py-2.5 text-right">Valor Líquido</th>
                  <th className="px-3 py-2.5 text-left">Vencimento</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5 text-left">Vínculos</th>
                  <th className="px-3 py-2.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading && (
                  <tr><td colSpan={11} className="py-10 text-center text-slate-400">Carregando...</td></tr>
                )}
                {!listQuery.isLoading && nfs.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-10 text-center">
                      <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
                        <Receipt className="h-9 w-9 text-slate-300" />
                        <p className="text-slate-500 text-sm font-medium">Nenhuma nota encontrada neste período</p>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          O sync automático com a prefeitura está com problema? Use o botão{" "}
                          <strong className="text-slate-600">Importar PDF</strong> para cadastrar notas a partir do DANFSe.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                          onClick={() => pdfInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" /> Importar PDF do DANFSe
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {nfs.map(nf => {
                  const st = STATUS_MAP[nf.status] ?? { label: nf.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
                  const isSelected = selectedIds.has(nf.id);
                  return (
                    <tr key={nf.id} className={`border-b hover:bg-slate-50 transition-colors group ${isSelected ? "bg-indigo-50/60" : ""}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 cursor-pointer"
                          checked={isSelected}
                          onChange={e => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(nf.id); else next.delete(nf.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-indigo-700">#{nf.numeroNf}</span>
                        {nf.serie && <span className="text-xs text-slate-400 ml-1">/{nf.serie}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{fmtDateBR(nf.dataEmissao)}</td>
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <div className="truncate text-slate-800 font-medium" title={nf.tomadorRazaoSocial ?? ""}>
                          {nf.tomadorRazaoSocial ?? "—"}
                        </div>
                        {nf.tomadorCnpj && <div className="text-xs text-slate-400">{nf.tomadorCnpj}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-700 text-xs">{nf.obraNome ?? "—"}</div>
                        {nf.bmReferencia && (
                          <div className="text-xs text-indigo-500 font-medium">{nf.bmReferencia}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatBRL(nf.valorBruto)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{formatBRL(nf.valorLiquido)}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{fmtDateBR(nf.dataVencimento)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          {nf.entryId
                            ? <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"><Link className="h-3 w-3" />Lan.{nf.entryId}</span>
                            : <span className="text-xs text-slate-300">— lançamento</span>
                          }
                          {nf.stmtLineId
                            ? <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded"><Link className="h-3 w-3" />Ext.{nf.stmtLineId}</span>
                            : null
                          }
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:text-indigo-800" title="Espelho fiel da NFS-e"
                            onClick={() => setNfseEspelhoId(nf.id)}>
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhe / Vincular"
                            onClick={() => { setDetalheNf(nf); setVincularEntryId(String(nf.entryId ?? "")); setVincularStmtId(String(nf.stmtLineId ?? "")); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar"
                            onClick={() => openEdit(nf)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {nf.arquivoUrl && (
                            <a href={nf.arquivoUrl} target="_blank" rel="noopener noreferrer">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver PDF">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {nf.status !== "cancelada" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" title="Cancelar"
                              onClick={() => setDeleteTarget(nf)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─── Dialog Cadastro/Edição (layout moderno) ─── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[92svh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">

            {/* ── Cabeçalho colorido ── */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-6 py-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 rounded-xl p-2">
                    <Receipt className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">
                      {editingId ? "Editar Nota Fiscal" : "Nova Nota Fiscal de Serviço"}
                    </h2>
                    <p className="text-indigo-200 text-xs mt-0.5">NFS-e · Serviços prestados pela FC Engenharia</p>
                  </div>
                </div>
                {form.numeroNf && (
                  <div className="bg-white/20 rounded-lg px-3 py-1 text-white text-sm font-mono font-bold">
                    NF #{form.numeroNf}
                  </div>
                )}
              </div>
            </div>

            {/* ── Corpo scrollável ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Seção 1 — Identificação */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Identificação</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Número NF <span className="text-red-500">*</span></Label>
                    <Input
                      value={form.numeroNf}
                      onChange={e => setF("numeroNf", e.target.value)}
                      placeholder="55"
                      className="h-10 text-base font-semibold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Série</Label>
                    <Input value={form.serie ?? ""} onChange={e => setF("serie", e.target.value)} placeholder="NE / 70000" className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Data Emissão <span className="text-red-500">*</span></Label>
                    <Input type="date" value={isoToInput(form.dataEmissao)} onChange={e => setF("dataEmissao", e.target.value)} className="h-10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Competência</Label>
                    <Input type="date" value={isoToInput(form.dataCompetencia)} onChange={e => setF("dataCompetencia", e.target.value)} className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Vencimento</Label>
                    <Input type="date" value={isoToInput(form.dataVencimento)} onChange={e => setF("dataVencimento", e.target.value)} className="h-10" />
                  </div>
                </div>
              </div>

              {/* Seção 2 — Tomador */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-blue-500 rounded-full" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tomador do Serviço</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">CNPJ</Label>
                    <Input value={form.tomadorCnpj ?? ""} onChange={e => setF("tomadorCnpj", e.target.value)} placeholder="00.000.000/0001-00" className="h-10 font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Razão Social</Label>
                    <Input value={form.tomadorRazaoSocial ?? ""} onChange={e => setF("tomadorRazaoSocial", e.target.value)} placeholder="Nome do cliente..." className="h-10" />
                  </div>
                </div>
              </div>

              {/* Seção 3 — Obra & Referência */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-amber-500 rounded-full" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Obra & Referência</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Obra</Label>
                    <Input value={form.obraNome ?? ""} onChange={e => setF("obraNome", e.target.value)} placeholder="Nome da obra..." className="h-10" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">BM (Boletim de Medição)</Label>
                    <Input value={form.bmReferencia ?? ""} onChange={e => setF("bmReferencia", e.target.value)} placeholder="BM 001, BM 002..." className="h-10" />
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Descrição do Serviço</Label>
                  <Textarea
                    value={form.descricaoServico ?? ""}
                    onChange={e => setF("descricaoServico", e.target.value)}
                    placeholder="Descreva o serviço prestado..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>

              {/* Seção 4 — Valores */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valores & Tributação</span>
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Valor Bruto do Serviço <span className="text-red-500">*</span></Label>
                      <Input
                        value={form.valorBruto}
                        onChange={e => setF("valorBruto", e.target.value)}
                        onBlur={() => handleMoneyBlur("valorBruto")}
                        placeholder="R$ 0,00"
                        className="h-10 text-base font-semibold bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Deduções (Material / BC ISSQN)</Label>
                      <Input
                        value={form.deducoesTotal}
                        onChange={e => setF("deducoesTotal", e.target.value)}
                        onBlur={() => handleMoneyBlur("deducoesTotal")}
                        placeholder="R$ 0,00"
                        className="h-10 bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      { key: "issRetido", label: "ISS (5%)" },
                      { key: "retencaoInss", label: "INSS" },
                      { key: "retencaoIrrf", label: "IRRF" },
                      { key: "retencaoPisCofins", label: "PIS/COFINS" },
                    ] as const).map(({ key, label }) => (
                      <div key={key}>
                        <Label className="text-xs font-medium text-slate-600 mb-1.5 block">{label}</Label>
                        <Input
                          value={(form as any)[key]}
                          onChange={e => setF(key, e.target.value)}
                          onBlur={() => handleMoneyBlur(key)}
                          placeholder="R$ 0,00"
                          className="h-9 text-xs bg-white"
                        />
                      </div>
                    ))}
                  </div>
                  {/* Valor Líquido destacado */}
                  <div className="bg-emerald-600 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-emerald-100 text-xs font-medium">Valor Líquido (entra no banco)</p>
                      <p className="text-emerald-200 text-xs mt-0.5">Bruto − ISS − INSS − IRRF − PIS/COFINS</p>
                    </div>
                    <div className="text-white text-2xl font-bold tabular-nums">{form.valorLiquido}</div>
                  </div>
                </div>
              </div>

              {/* Seção 5 — Avançado (colapsível) */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
                  <div className="w-1 h-4 bg-slate-400 rounded-full" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avançado</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90 ml-auto" />
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Chave de Acesso NFS-e</Label>
                    <Input value={form.chaveAcesso ?? ""} onChange={e => setF("chaveAcesso", e.target.value)} placeholder="35 dígitos..." className="font-mono text-xs h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">URL do PDF da NF-e</Label>
                      <Input value={form.arquivoUrl ?? ""} onChange={e => setF("arquivoUrl", e.target.value)} placeholder="https://..." className="h-9 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Nome do Arquivo</Label>
                      <Input value={form.arquivoNome ?? ""} onChange={e => setF("arquivoNome", e.target.value)} placeholder="NF_055.pdf" className="h-9 text-xs" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Observações</Label>
                    <Textarea value={form.observacoes ?? ""} onChange={e => setF("observacoes", e.target.value)} rows={2} className="resize-none text-sm" />
                  </div>
                </div>
              </details>

            </div>

            {/* ── Rodapé ── */}
            <div className="shrink-0 border-t bg-slate-50/80 px-5 py-3 flex items-center justify-between gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-10">
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving || !form.numeroNf || !form.dataEmissao}
                className="h-10 px-6 gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {editingId ? "Salvar Alterações" : "Emitir NF-e"}
              </Button>
            </div>

          </DialogContent>
        </Dialog>

        {/* ─── Dialog Detalhe / Vínculos ─── */}
        {detalheNf && (
          <Dialog open={!!detalheNf} onOpenChange={v => !v && setDetalheNf(null)}>
            <DialogContent className="w-[96vw] max-w-6xl p-0 overflow-hidden gap-0 flex flex-col h-[92svh]">
              {/* Header gradiente */}
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-start justify-between shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <FileText className="h-4 w-4 text-indigo-200 shrink-0" />
                    <span className="text-xs font-medium text-indigo-200 uppercase tracking-wide">NFS-e Emitida — Detalhes Completos</span>
                  </div>
                  <h2 className="text-white font-bold text-xl leading-tight">
                    NF #{detalheNf.numeroNf}
                    {detalheNf.serie ? <span className="text-indigo-200 font-normal text-base ml-2">Série {detalheNf.serie}</span> : null}
                  </h2>
                  {detalheNf.tomadorRazaoSocial && (
                    <p className="text-indigo-100 text-sm mt-0.5 truncate">{detalheNf.tomadorRazaoSocial}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {detalheNf.status === "cancelada" && (
                    <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Cancelada</span>
                  )}
                  <button onClick={() => setDetalheNf(null)} className="text-indigo-200 hover:text-white transition-colors p-1">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-4 divide-x border-b bg-white shrink-0">
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Emissão</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtDateBR(detalheNf.dataEmissao)}</p>
                  {detalheNf.dataPrestacao && detalheNf.dataPrestacao !== detalheNf.dataEmissao && (
                    <p className="text-[10px] text-slate-400 mt-0.5">Prest.: {fmtDateBR(detalheNf.dataPrestacao)}</p>
                  )}
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Valor Bruto</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{formatBRL(detalheNf.valorBruto)}</p>
                  {detalheNf.aliquotaIss && parseFloat(detalheNf.aliquotaIss) > 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5">ISS {parseFloat(detalheNf.aliquotaIss).toFixed(2)}%</p>
                  )}
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Valor Líquido</p>
                  <p className="text-base font-bold text-emerald-600 mt-0.5">{formatBRL(detalheNf.valorLiquido)}</p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Status</p>
                  <p className={`text-sm font-bold mt-0.5 ${detalheNf.status === "cancelada" ? "text-red-600" : "text-emerald-600"}`}>
                    {detalheNf.status === "cancelada" ? "Cancelada" : "Ativa"}
                  </p>
                  {detalheNf.origem && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{detalheNf.origem.replace(/_/g, " ")}</p>}
                </div>
              </div>

              {/* Body — 2 colunas */}
              <div className="overflow-y-auto flex-1 bg-slate-50">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">

                  {/* ── Coluna Esquerda ── */}
                  <div className="space-y-4">

                    {/* Seção: Identificação */}
                    <div className="bg-white rounded-xl border shadow-sm">
                      <div className="px-4 py-2.5 border-b flex items-center gap-2 bg-indigo-50/60 rounded-t-xl">
                        <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center shrink-0">
                          <FileText className="h-3 w-3 text-indigo-600" />
                        </div>
                        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Identificação</span>
                      </div>
                      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">NF #</p>
                          <p className="font-semibold text-slate-700">{detalheNf.numeroNf}{detalheNf.serie ? ` — Série ${detalheNf.serie}` : ""}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Data de Emissão</p>
                          <p className="text-slate-700">{fmtDateBR(detalheNf.dataEmissao)}</p>
                        </div>
                        {detalheNf.dataPrestacao && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Data de Prestação</p>
                            <p className="text-slate-700">{fmtDateBR(detalheNf.dataPrestacao)}</p>
                          </div>
                        )}
                        {detalheNf.optanteSimples !== null && detalheNf.optanteSimples !== undefined && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Optante Simples</p>
                            <p className="text-slate-700">{detalheNf.optanteSimples ? "Sim" : "Não"}</p>
                          </div>
                        )}
                        {detalheNf.tributada !== null && detalheNf.tributada !== undefined && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Tributada no Município</p>
                            <p className="text-slate-700">{detalheNf.tributada ? "Sim" : "Não"}</p>
                          </div>
                        )}
                        {detalheNf.chaveAcesso && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Código de Verificação</p>
                            <p className="font-mono text-xs text-slate-600 break-all">{detalheNf.chaveAcesso}</p>
                          </div>
                        )}
                        {detalheNf.bmReferencia && (
                          <div className="col-span-2 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                            <span>{detalheNf.obraNome && `${detalheNf.obraNome} — `}{detalheNf.bmReferencia}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Seção: Tomador */}
                    {(detalheNf.tomadorCnpj || detalheNf.tomadorRazaoSocial) && (
                      <div className="bg-white rounded-xl border shadow-sm">
                        <div className="px-4 py-2.5 border-b flex items-center gap-2 bg-amber-50/60 rounded-t-xl">
                          <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center shrink-0">
                            <Building2 className="h-3 w-3 text-amber-600" />
                          </div>
                          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Tomador do Serviço</span>
                        </div>
                        <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                          {detalheNf.tomadorRazaoSocial && (
                            <div className="col-span-2">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Razão Social</p>
                              <p className="font-semibold text-slate-700">{detalheNf.tomadorRazaoSocial}</p>
                            </div>
                          )}
                          {detalheNf.tomadorCnpj && (
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">CNPJ / CPF</p>
                              <p className="font-mono text-slate-700">{detalheNf.tomadorCnpj}</p>
                            </div>
                          )}
                          {detalheNf.tomadorInscricao && (
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Inscrição Municipal</p>
                              <p className="font-mono text-slate-700">{detalheNf.tomadorInscricao}</p>
                            </div>
                          )}
                          {detalheNf.tomadorEmail && (
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">E-mail</p>
                              <p className="text-slate-600 text-xs break-all">{detalheNf.tomadorEmail}</p>
                            </div>
                          )}
                          {detalheNf.tomadorTelefone && (
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Telefone</p>
                              <p className="text-slate-600 text-xs">{detalheNf.tomadorTelefone}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Seção: Vínculos */}
                    <div className="bg-white rounded-xl border shadow-sm">
                      <div className="px-4 py-2.5 border-b flex items-center gap-2 bg-slate-50 rounded-t-xl">
                        <div className="w-5 h-5 rounded bg-slate-200 flex items-center justify-center shrink-0">
                          <Link className="h-3 w-3 text-slate-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Vínculos</span>
                      </div>
                      <div className="px-4 py-3 space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                              <DollarSign className="h-3 w-3 text-blue-600" />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">Lançamento Financeiro</span>
                            {detalheNf.entryId && (
                              <span className="ml-auto text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">#{detalheNf.entryId}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Input type="number" value={vincularEntryId} onChange={e => setVincularEntryId(e.target.value)} placeholder="ID do lançamento..." className="flex-1 h-9 text-sm" />
                            <Button onClick={() => vincularEntryMut.mutate({ id: detalheNf.id, companyId: detalheNf.companyId ?? companyId!, entryId: vincularEntryId ? parseInt(vincularEntryId) : null })} disabled={vincularEntryMut.isPending} size="sm" variant={vincularEntryId ? "default" : "outline"} className={`gap-1.5 shrink-0 h-9 ${vincularEntryId ? "bg-blue-600 hover:bg-blue-700" : ""}`}>
                              {vincularEntryMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : vincularEntryId ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                              {vincularEntryId ? "Vincular" : "Desvincular"}
                            </Button>
                          </div>
                        </div>
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                              <FileText className="h-3 w-3 text-violet-600" />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">Linha do Extrato Bancário</span>
                            {detalheNf.stmtLineId && (
                              <span className="ml-auto text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">#{detalheNf.stmtLineId}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Input type="number" value={vincularStmtId} onChange={e => setVincularStmtId(e.target.value)} placeholder="ID da linha do extrato..." className="flex-1 h-9 text-sm" />
                            <Button onClick={() => vincularStmtMut.mutate({ id: detalheNf.id, companyId: detalheNf.companyId ?? companyId!, stmtLineId: vincularStmtId ? parseInt(vincularStmtId) : null })} disabled={vincularStmtMut.isPending} size="sm" variant={vincularStmtId ? "default" : "outline"} className={`gap-1.5 shrink-0 h-9 ${vincularStmtId ? "bg-violet-600 hover:bg-violet-700" : ""}`}>
                              {vincularStmtMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : vincularStmtId ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                              {vincularStmtId ? "Vincular" : "Desvincular"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Coluna Direita ── */}
                  <div className="space-y-4">

                    {/* Seção: Serviço */}
                    {(detalheNf.descricaoServico || detalheNf.cdCnae || detalheNf.cdListaServico) && (
                      <div className="bg-white rounded-xl border shadow-sm">
                        <div className="px-4 py-2.5 border-b flex items-center gap-2 bg-blue-50/60 rounded-t-xl">
                          <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center shrink-0">
                            <FileText className="h-3 w-3 text-blue-600" />
                          </div>
                          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Classificação do Serviço</span>
                        </div>
                        <div className="px-4 py-3 space-y-3 text-sm">
                          {(detalheNf.cdCnae || detalheNf.cdListaServico) && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                              {detalheNf.cdCnae && (
                                <div>
                                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">CNAE</p>
                                  <p className="font-mono text-slate-700">{detalheNf.cdCnae}</p>
                                </div>
                              )}
                              {detalheNf.cdListaServico && (
                                <div>
                                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Lista de Serviços (LC 116)</p>
                                  <p className="font-mono text-slate-700">{detalheNf.cdListaServico}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {detalheNf.descricaoServico && (
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Discriminação do Serviço</p>
                              <div className="text-slate-600 text-xs leading-relaxed whitespace-pre-line bg-slate-50 rounded-lg p-3 border max-h-52 overflow-y-auto">
                                {detalheNf.descricaoServico}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Seção: Impostos e Valores */}
                    <div className="bg-white rounded-xl border shadow-sm">
                      <div className="px-4 py-2.5 border-b flex items-center gap-2 bg-emerald-50/60 rounded-t-xl">
                        <div className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center shrink-0">
                          <DollarSign className="h-3 w-3 text-emerald-600" />
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Impostos e Valores</span>
                      </div>
                      <div className="px-4 py-3 text-sm">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                            <span className="flex flex-col">
                              <span className="text-slate-500">Valor dos Serviços</span>
                              <span className="text-[10px] text-slate-400 leading-tight">Valor bruto total constante na NFS-e</span>
                            </span>
                            <span className="font-semibold text-slate-700 shrink-0">{formatBRL(detalheNf.valorBruto)}</span>
                          </div>
                          {detalheNf.deducoesTotal && parseFloat(detalheNf.deducoesTotal) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Deduções</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Abatimentos da base de cálculo (ex.: material, subempreitada)</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.deducoesTotal)}</span>
                            </div>
                          )}
                          {detalheNf.baseCalculoIss && parseFloat(detalheNf.baseCalculoIss) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed text-slate-400 text-xs">
                              <span className="flex flex-col">
                                <span>Base de Cálculo ISS</span>
                                <span className="text-[10px] text-slate-300 leading-tight">Valor sobre o qual a alíquota ISS é aplicada</span>
                              </span>
                              <span className="shrink-0">{formatBRL(detalheNf.baseCalculoIss)}</span>
                            </div>
                          )}
                          {detalheNf.issRetido && parseFloat(detalheNf.issRetido) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">
                                  ISS Retido{detalheNf.aliquotaIss && parseFloat(detalheNf.aliquotaIss) > 0 ? <span className="text-[10px] text-slate-400 ml-1">({parseFloat(detalheNf.aliquotaIss).toFixed(2)}%)</span> : null}
                                </span>
                                <span className="text-[10px] text-slate-400 leading-tight">Imposto Sobre Serviços · tributo municipal · retido pelo tomador</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.issRetido)}</span>
                            </div>
                          )}
                          {detalheNf.retencaoInss && parseFloat(detalheNf.retencaoInss) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Retenção INSS</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Instituto Nacional do Seguro Social · contribuição previdenciária retida pelo tomador</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoInss)}</span>
                            </div>
                          )}
                          {detalheNf.retencaoIrrf && parseFloat(detalheNf.retencaoIrrf) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Retenção IR</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Imposto de Renda na Fonte (IRRF) · retido pelo tomador sobre o pagamento</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoIrrf)}</span>
                            </div>
                          )}
                          {detalheNf.retencaoCsll && parseFloat(detalheNf.retencaoCsll) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Retenção CSLL</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Contribuição Social sobre o Lucro Líquido · retida pelo tomador (1%)</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoCsll)}</span>
                            </div>
                          )}
                          {detalheNf.retencaoPis && parseFloat(detalheNf.retencaoPis) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Retenção PIS</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Programa de Integração Social · retido pelo tomador (0,65%)</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoPis)}</span>
                            </div>
                          )}
                          {detalheNf.retencaoCofins && parseFloat(detalheNf.retencaoCofins) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Retenção COFINS</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Contribuição p/ Financiamento da Seguridade Social · retida pelo tomador (3%)</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoCofins)}</span>
                            </div>
                          )}
                          {!detalheNf.retencaoPis && !detalheNf.retencaoCofins && detalheNf.retencaoPisCofins && parseFloat(detalheNf.retencaoPisCofins) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Retenção PIS/COFINS</span>
                                <span className="text-[10px] text-slate-400 leading-tight">PIS (0,65%) + COFINS (3%) informados de forma unificada · retidos pelo tomador</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoPisCofins)}</span>
                            </div>
                          )}
                          {detalheNf.retencaoOutras && parseFloat(detalheNf.retencaoOutras) > 0 && (
                            <div className="flex justify-between items-start py-1.5 border-b border-dashed">
                              <span className="flex flex-col">
                                <span className="text-slate-500">Outras Retenções</span>
                                <span className="text-[10px] text-slate-400 leading-tight">Demais retenções informadas na NFS-e</span>
                              </span>
                              <span className="text-red-500 shrink-0">− {formatBRL(detalheNf.retencaoOutras)}</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-2.5">
                            <span className="font-bold text-slate-800 text-base">Valor Líquido</span>
                            <span className="font-bold text-emerald-600 text-xl">{formatBRL(detalheNf.valorLiquido)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 bg-white border-t flex items-center justify-between gap-2 shrink-0">
                {detalheNf.arquivoUrl ? (
                  <a href={detalheNf.arquivoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600 hover:text-slate-800">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
                    </Button>
                  </a>
                ) : <span />}
                <Button size="sm" onClick={() => setDetalheNf(null)} className="bg-slate-800 hover:bg-slate-700 text-white px-6">
                  Fechar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ─── Dialog Espelho Fiel NFS-e Emitida ─── */}
        {nfseEspelhoId && (() => {
          const d = nfseEspelhoQuery.data?.detalhes;
          const row = nfseEspelhoQuery.data?.row;
          const isLoading = nfseEspelhoQuery.isLoading;

          const fmtVal = (v: number | undefined) =>
            v == null || isNaN(Number(v)) ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
          const fmtPct = (v: number | undefined) =>
            v == null || isNaN(Number(v)) || Number(v) === 0 ? "—" : (Number(v) * 100).toFixed(2).replace(".", ",") + " %";
          const fmtDt = (s: string | undefined) => {
            if (!s) return "—";
            const t = String(s).slice(0, 10);
            return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("/") : s;
          };

          const Row = ({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) => (
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none mb-0.5">{label}</span>
              <span className={`text-sm text-slate-800 break-words ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
            </div>
          );

          const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b pb-1">{title}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>
            </div>
          );

          return (
            <Dialog open onOpenChange={v => !v && setNfseEspelhoId(null)}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="pb-2 border-b">
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                    Espelho da NFS-e #{row?.numero_nf ?? nfseEspelhoId}
                    {row?.origem && (
                      <span className="text-xs font-normal text-slate-400 ml-1">— {row.origem}</span>
                    )}
                  </DialogTitle>
                </DialogHeader>

                {isLoading && (
                  <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <span className="text-sm">Carregando dados da nota…</span>
                  </div>
                )}

                {!isLoading && !d && (
                  <div className="py-8 text-center space-y-2">
                    <Receipt className="h-9 w-9 text-slate-200 mx-auto" />
                    <p className="text-slate-500 text-sm font-medium">XML não disponível para esta nota</p>
                    <p className="text-slate-400 text-xs">Esta nota foi importada via PDF ou sem XML completo. Os dados abaixo são os registrados no ERP.</p>
                    {row && (
                      <div className="mt-4 bg-slate-50 rounded-lg p-4 text-left grid grid-cols-2 gap-3 text-sm border max-w-sm mx-auto">
                        <Row label="Número" value={row.numero_nf} />
                        <Row label="Data Emissão" value={fmtDt(row.data_emissao)} />
                        <Row label="Tomador" value={row.tomador_razao_social} />
                        <Row label="CNPJ Tomador" value={row.tomador_cnpj} mono />
                        <Row label="Valor Bruto" value={fmtVal(parseFloat(row.valor_bruto))} />
                        <Row label="Valor Líquido" value={fmtVal(parseFloat(row.valor_liquido))} />
                        {row.descricao_servico && (
                          <div className="col-span-2 flex flex-col">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Discriminação</span>
                            <span className="text-xs text-slate-700 whitespace-pre-wrap break-words">{row.descricao_servico}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isLoading && d && (
                  <div className="space-y-5 py-2 text-sm">

                    {/* ── Identificação ── */}
                    <Section title="Identificação da NFS-e">
                      <Row label="Número"            value={d.numero} />
                      <Row label="Código Verificação" value={d.codigoVerificacao} mono />
                      <Row label="Data de Emissão"   value={d.dataEmissao ? d.dataEmissao.replace("T", " ").slice(0, 16) : "—"} />
                      <Row label="Competência"       value={fmtDt(d.competencia)} />
                      {d.rpsNumero && <Row label="RPS Número"  value={d.rpsNumero} />}
                      {d.serie     && <Row label="Série"       value={d.serie} />}
                      {d.situacao  && <Row label="Natureza Op." value={d.situacao} />}
                    </Section>

                    {/* ── Prestador ── */}
                    <Section title="Prestador de Serviço (Emitente)">
                      <Row label="Razão Social" value={d.prestadorNome} />
                      <Row label="CNPJ"         value={d.prestadorCnpj} mono />
                      <Row label="Insc. Municipal" value={d.prestadorInscricao} mono />
                      {d.prestadorEndereco && <Row label="Endereço"  value={d.prestadorEndereco} />}
                      {d.prestadorBairro   && <Row label="Bairro"    value={d.prestadorBairro} />}
                      {(d.prestadorMunicipio || d.prestadorUf) && (
                        <Row label="Município / UF" value={[d.prestadorMunicipio, d.prestadorUf].filter(Boolean).join(" / ")} />
                      )}
                      {d.prestadorCep      && <Row label="CEP"       value={d.prestadorCep} mono />}
                      {d.prestadorEmail    && <Row label="E-mail"    value={d.prestadorEmail} />}
                      {d.prestadorFone     && <Row label="Telefone"  value={d.prestadorFone} mono />}
                    </Section>

                    {/* ── Tomador ── */}
                    <Section title="Tomador de Serviço (Destinatário)">
                      <Row label="Razão Social" value={d.tomadorNome || row?.tomador_razao_social} />
                      <Row label="CNPJ / CPF"   value={d.tomadorCnpj || row?.tomador_cnpj} mono />
                      {d.tomadorInscricao  && <Row label="Insc. Municipal" value={d.tomadorInscricao} mono />}
                      {d.tomadorEndereco   && <Row label="Endereço"  value={d.tomadorEndereco} />}
                      {d.tomadorBairro     && <Row label="Bairro"    value={d.tomadorBairro} />}
                      {(d.tomadorMunicipio || d.tomadorUf) && (
                        <Row label="Município / UF" value={[d.tomadorMunicipio, d.tomadorUf].filter(Boolean).join(" / ")} />
                      )}
                      {d.tomadorCep        && <Row label="CEP"       value={d.tomadorCep} mono />}
                      {d.tomadorEmail      && <Row label="E-mail"    value={d.tomadorEmail} />}
                      {d.tomadorFone       && <Row label="Telefone"  value={d.tomadorFone} mono />}
                    </Section>

                    {/* ── Serviço ── */}
                    <Section title="Serviço">
                      {d.codigoItemLista   && <Row label="Item da Lista"       value={d.codigoItemLista} />}
                      {d.codigoTributacao  && <Row label="Cód. Tributação Mun." value={d.codigoTributacao} />}
                      {d.codigoMunicipio   && <Row label="Cód. Município"      value={d.codigoMunicipio} mono />}
                      {d.municipioIncidencia && <Row label="Munic. Incidência"  value={d.municipioIncidencia} />}
                    </Section>

                    {/* ── Discriminação ── */}
                    {(d.discriminacao || row?.descricao_servico) && (
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b pb-1">Discriminação dos Serviços</h3>
                        <div className="bg-slate-50 rounded-lg p-3 border text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-y-auto">
                          {d.discriminacao || row?.descricao_servico}
                        </div>
                      </div>
                    )}

                    {/* ── Valores ── */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b pb-1">Valores e Tributos</h3>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                        <Row label="Valor dos Serviços"   value={fmtVal(d.valorServicos)} />
                        {d.valorDeducoes > 0 && <Row label="Deduções"           value={fmtVal(d.valorDeducoes)} />}
                        <Row label="Base de Cálculo ISS"  value={fmtVal(d.baseCalculo)} />
                        <Row label="Alíquota ISS"         value={fmtPct(d.aliquota)} />
                        <Row label="Valor ISS"            value={fmtVal(d.valorIss)} />
                        <Row label="ISS Retido?"          value={d.issRetido === "1" ? "✔ Sim" : "✘ Não"} />
                        {d.valorIssRetido > 0  && <Row label="ISS Retido (val.)"   value={fmtVal(d.valorIssRetido)} />}
                        {d.valorInss > 0       && <Row label="INSS"                value={fmtVal(d.valorInss)} />}
                        {d.valorIr > 0         && <Row label="IRRF"                value={fmtVal(d.valorIr)} />}
                        {d.valorCsll > 0       && <Row label="CSLL"                value={fmtVal(d.valorCsll)} />}
                        {d.valorPis > 0        && <Row label="PIS"                 value={fmtVal(d.valorPis)} />}
                        {d.valorCofins > 0     && <Row label="COFINS"              value={fmtVal(d.valorCofins)} />}
                        {d.valorOutrasRetencoes > 0 && <Row label="Outras Ret."    value={fmtVal(d.valorOutrasRetencoes)} />}
                      </div>
                      <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex justify-between items-center">
                        <span className="text-sm font-semibold text-emerald-800">Valor Líquido da NFS-e</span>
                        <span className="text-xl font-bold text-emerald-700">{fmtVal(d.valorLiquido)}</span>
                      </div>
                    </div>

                    {/* ── Informações Complementares ── */}
                    {d.informacoesCompl && (
                      <div className="space-y-1.5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b pb-1">Informações Complementares</h3>
                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                          {d.informacoesCompl}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                <DialogFooter className="pt-2 border-t mt-2">
                  {row?.arquivo_url && (
                    <a href={row.arquivo_url} target="_blank" rel="noopener noreferrer" className="mr-auto">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF
                      </Button>
                    </a>
                  )}
                  <Button variant="outline" onClick={() => setNfseEspelhoId(null)}>Fechar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* ─── Dialog Importação em Lote (redesenhado Rev.3549) ─── */}
        {batchOpen && (() => {
          const total = batchItems.length;
          const done  = batchItems.filter(i => ["ok","saved","error"].includes(i.status)).length;
          const okCnt = batchItems.filter(i => i.status === "ok" || i.status === "saved").length;
          const errCnt = batchItems.filter(i => i.status === "error").length;
          const savedCnt = batchItems.filter(i => i.status === "saved").length;
          const selCnt = batchItems.filter(i => i.selected && i.status === "ok").length;
          const pct = total ? Math.round((done / total) * 100) : 0;

          const phaseLabel = (s: BatchItem["status"]) => {
            if (s === "pending")  return { step: 0, pct:   0, label: "Aguardando",    color: "text-slate-400" };
            if (s === "reading")  return { step: 1, pct:  25, label: "Lendo arquivo…", color: "text-indigo-500" };
            if (s === "parsing")  return { step: 2, pct:  50, label: "IA extraindo…", color: "text-violet-500" };
            if (s === "ok")       return { step: 3, pct:  75, label: "Extraído",      color: "text-emerald-600" };
            if (s === "saving")   return { step: 3, pct:  87, label: "Salvando…",     color: "text-indigo-500" };
            if (s === "saved")    return { step: 4, pct: 100, label: "Cadastrado!",   color: "text-emerald-700" };
            if (s === "error")    return { step: -1, pct:  0, label: "Erro",          color: "text-red-500" };
            return { step: 0, pct: 0, label: "", color: "" };
          };

          const StepDot = ({ active, done: d, err }: { active: boolean; done: boolean; err: boolean }) => (
            <span className={`inline-block w-2 h-2 rounded-full transition-all ${
              err   ? "bg-red-400" :
              d     ? "bg-emerald-500" :
              active ? "bg-indigo-500 animate-pulse" :
                       "bg-slate-200"
            }`} />
          );

          return (
            <Dialog open onOpenChange={v => { if (!isParsing && !batchSaving) setBatchOpen(v); }}>
              <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-2xl">
                <DialogDescription className="sr-only">Importação em lote de PDFs</DialogDescription>

                {/* ── Cabeçalho gradiente ── */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-6 pt-5 pb-4 text-white">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-medium text-indigo-200 uppercase tracking-widest mb-0.5">Importação em Lote</p>
                      <h2 className="text-xl font-bold">{total} PDF{total !== 1 ? "s" : ""} selecionados</h2>
                    </div>
                    {/* Percentual grande */}
                    <div className="text-right">
                      <div className="text-4xl font-black tabular-nums leading-none">{pct}%</div>
                      <div className="text-xs text-indigo-200 mt-0.5">concluído</div>
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div className="w-full bg-white/20 rounded-full h-1.5 mb-4">
                    <div
                      className="bg-white h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* KPI mini-cards */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Total",     value: total,    bg: "bg-white/10", val: "text-white" },
                      { label: "Extraídos", value: okCnt,    bg: "bg-emerald-500/30", val: "text-emerald-100" },
                      { label: "Erros",     value: errCnt,   bg: "bg-red-500/30", val: "text-red-100" },
                    ].map(k => (
                      <div key={k.label} className={`${k.bg} rounded-xl px-3 py-2 text-center`}>
                        <div className={`text-2xl font-bold ${k.val}`}>{k.value}</div>
                        <div className="text-xs text-white/70 mt-0.5">{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Lista de arquivos ── */}
                <div className="divide-y divide-slate-100 max-h-[46svh] overflow-y-auto overscroll-contain">
                  {batchItems.map(item => {
                    const { step, label, color } = phaseLabel(item.status);
                    const isOk = item.status === "ok";
                    const isSaved = item.status === "saved";
                    const isErr = item.status === "error";
                    const isActive = item.status === "reading" || item.status === "parsing" || item.status === "saving";

                    return (
                      <div key={item.id} className={`px-5 py-3.5 flex items-start gap-3 transition-colors ${
                        (isOk && item.selected) || isSaved ? "bg-emerald-50/50" : isErr ? "bg-red-50/40" : ""
                      }`}>
                        {/* Checkbox */}
                        <div className="pt-0.5 shrink-0">
                          {isOk ? (
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={e => setBatchItems(prev => prev.map(it =>
                                it.id === item.id ? { ...it, selected: e.target.checked } : it
                              ))}
                              className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                          ) : (
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              isSaved ? "border-emerald-500 bg-emerald-500" :
                              isErr ? "border-red-300 bg-red-50" :
                              "border-slate-200"
                            }`}>
                              {isSaved && <CheckCircle className="h-3 w-3 text-white" />}
                            </div>
                          )}
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          {/* Nome do arquivo */}
                          <p className="text-sm font-medium text-slate-800 truncate" title={item.fileName}>
                            {item.fileName.replace(/\.pdf$/i, "")}
                          </p>

                          {/* Dados extraídos (quando disponível) */}
                          {item.parsed && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {item.parsed.numeroNf && (
                                <span className="text-xs text-slate-500">NF <span className="font-semibold text-slate-700">{item.parsed.numeroNf}</span></span>
                              )}
                              {item.parsed.dataEmissao && (
                                <span className="text-xs text-slate-500">
                                  {new Date(item.parsed.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR")}
                                </span>
                              )}
                              {item.parsed.valorLiquido != null && (
                                <span className="text-xs font-semibold text-indigo-600">{formatBRL(item.parsed.valorLiquido)}</span>
                              )}
                              {item.parsed.tomadorRazaoSocial && (
                                <span className="text-xs text-slate-500 truncate max-w-[180px]" title={item.parsed.tomadorRazaoSocial}>
                                  {item.parsed.tomadorRazaoSocial}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Error message */}
                          {isErr && item.error && (
                            <p className="text-xs text-red-500 mt-0.5 line-clamp-2">{item.error}</p>
                          )}

                          {/* Indicador de fases + percentual por arquivo */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {/* Mini barra de progresso individual */}
                            <div className="w-16 bg-slate-100 rounded-full h-1 shrink-0">
                              <div
                                className={`h-1 rounded-full transition-all duration-500 ${
                                  isErr ? "bg-red-400" : step === 4 ? "bg-emerald-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${isErr ? 100 : pct}%` }}
                              />
                            </div>
                            {/* Percentual numérico */}
                            <span className={`text-xs font-semibold tabular-nums w-8 shrink-0 ${
                              isErr ? "text-red-500" : step === 4 ? "text-emerald-600" : "text-indigo-600"
                            }`}>
                              {isErr ? "Erro" : `${pct}%`}
                            </span>
                            {/* Bolinhas */}
                            <StepDot active={step === 1} done={step > 1 && !isErr} err={false} />
                            <div className={`h-px w-3 transition-colors ${step > 1 && !isErr ? "bg-emerald-400" : "bg-slate-200"}`} />
                            <StepDot active={step === 2} done={step > 2 && !isErr} err={false} />
                            <div className={`h-px w-3 transition-colors ${step > 2 && !isErr ? "bg-emerald-400" : "bg-slate-200"}`} />
                            <StepDot active={step === 3} done={step === 4} err={isErr} />
                            <div className={`h-px w-3 transition-colors ${step === 4 ? "bg-emerald-400" : "bg-slate-200"}`} />
                            <StepDot active={false} done={step === 4} err={false} />
                            <span className={`text-xs ml-0.5 ${color} ${isActive ? "animate-pulse" : ""}`}>{label}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Rodapé com select-all e botão ── */}
                <div className="px-5 py-4 border-t bg-slate-50 flex items-center justify-between gap-3">
                  {/* Select all */}
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-indigo-600"
                      checked={batchItems.filter(i => i.status === "ok").length > 0 &&
                               batchItems.filter(i => i.status === "ok").every(i => i.selected)}
                      onChange={e => setBatchItems(prev => prev.map(it =>
                        it.status === "ok" ? { ...it, selected: e.target.checked } : it
                      ))}
                      disabled={isParsing || batchSaving}
                    />
                    Selecionar todos
                  </label>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBatchOpen(false)}
                      disabled={isParsing || batchSaving}
                    >
                      Fechar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
                      onClick={handleSalvarLote}
                      disabled={isParsing || batchSaving || selCnt === 0}
                    >
                      {batchSaving
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando {savedCnt}/{selCnt + savedCnt}…</>
                        : <><CheckCircle className="h-3.5 w-3.5" /> Cadastrar {selCnt} NF-e{selCnt !== 1 ? "s" : ""}</>
                      }
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* AlertDialog — mudar status NF-e Recebidas em lote */}
        <AlertDialog open={bulkRecStatusOpen} onOpenChange={v => { if (!v) setBulkRecStatusOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mudar status de {selectedRecIds.size} NF-e{selectedRecIds.size !== 1 ? "s" : ""}</AlertDialogTitle>
              <AlertDialogDescription>
                Selecione o novo status a aplicar em todas as NF-es selecionadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-1 py-2 grid grid-cols-2 gap-2">
              {(["pendente","recebida","validada","conciliada","cancelada"] as const).map(s => {
                const info = STATUS_MAP[s];
                return (
                  <button
                    key={s}
                    onClick={() => setBulkRecStatusTarget(s)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                      bulkRecStatusTarget === s
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${info.color}`}>
                      {info.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBulkRecStatusOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => bulkRecStatusMut.mutate({ ids: Array.from(selectedRecIds), companyId: companyId!, status: bulkRecStatusTarget as any })}
                disabled={bulkRecStatusMut.isPending}
              >
                {bulkRecStatusMut.isPending ? "Atualizando..." : `Aplicar "${STATUS_MAP[bulkRecStatusTarget]?.label ?? bulkRecStatusTarget}"`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog — excluir NF-e Recebidas em lote */}
        <AlertDialog open={bulkRecDeleteOpen} onOpenChange={v => { if (!v) setBulkRecDeleteOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {selectedRecIds.size} NF-e{selectedRecIds.size !== 1 ? "s" : ""} permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação <strong>não pode ser desfeita</strong>. As NF-e selecionadas serão removidas do banco de dados.
                O SEFAZ poderá reimportá-las automaticamente no próximo sync, ou manualmente via "Sincronizar Agora".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBulkRecDeleteOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => { setBulkRecDeleteOpen(false); excluirRecLoteMut.mutate({ ids: Array.from(selectedRecIds), companyId: companyId! }); }}
                disabled={excluirRecLoteMut.isPending}
              >
                {excluirRecLoteMut.isPending ? "Excluindo..." : `Excluir ${selectedRecIds.size} NF-e${selectedRecIds.size !== 1 ? "s" : ""}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog — Conciliar mês inteiro */}
        <AlertDialog open={conciliarMesOpen} onOpenChange={v => { if (!v) setConciliarMesOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Conciliar {mesSel !== null ? ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mesSel - 1] : ""}/{ano}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Todas as NFS-e emitidas neste mês (exceto as canceladas) serão marcadas como <strong>Conciliada</strong>.
                O mês aparecerá com o ponto verde <span className="inline-block w-2 h-2 rounded-full bg-green-500 align-middle mx-0.5" /> no calendário.
                <br /><br />
                Esta ação pode ser desfeita manualmente nota a nota ou usando a seleção em lote.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={conciliarMesMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={conciliarMesMut.isPending}
                onClick={() => conciliarMesMut.mutate({ companyId: companyId!, ano, mes: mesSel! })}
              >
                {conciliarMesMut.isPending ? "Conciliando..." : "Confirmar Conciliação"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={bulkStatusOpen} onOpenChange={v => { if (!v) setBulkStatusOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mudar status de {selectedIds.size} nota{selectedIds.size !== 1 ? "s" : ""}</AlertDialogTitle>
              <AlertDialogDescription>
                Selecione o novo status a aplicar em todas as notas selecionadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-1 py-2 grid grid-cols-2 gap-2">
              {(["pendente","recebida","validada","conciliada","cancelada"] as const).map(s => {
                const info = STATUS_MAP[s];
                return (
                  <button
                    key={s}
                    onClick={() => setBulkStatusTarget(s)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                      bulkStatusTarget === s
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${info.color}`}>
                      {info.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBulkStatusOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => bulkStatusMut.mutate({ ids: Array.from(selectedIds), companyId: companyId!, status: bulkStatusTarget as any })}
                disabled={bulkStatusMut.isPending}
              >
                {bulkStatusMut.isPending ? "Atualizando..." : `Aplicar "${STATUS_MAP[bulkStatusTarget]?.label ?? bulkStatusTarget}"`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={bulkDeleteOpen} onOpenChange={v => { if (!v) setBulkDeleteOpen(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {selectedIds.size} nota{selectedIds.size !== 1 ? "s" : ""} permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação <strong>não pode ser desfeita</strong>. Os registros serão removidos do banco de dados.
                Caso queira reimportar, será necessário fazer o sync ou upload do XML novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => excluirLoteMut.mutate({ ids: Array.from(selectedIds), companyId: companyId! })}
                disabled={excluirLoteMut.isPending}
              >
                {excluirLoteMut.isPending ? "Excluindo..." : `Excluir ${selectedIds.size} nota${selectedIds.size !== 1 ? "s" : ""}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar NF-e #{deleteTarget?.numeroNf}?</AlertDialogTitle>
              <AlertDialogDescription>
                A nota será marcada como <strong>cancelada</strong>. Nenhum dado será excluído.
                Valor líquido: {formatBRL(deleteTarget?.valorLiquido)} — Tomador: {deleteTarget?.tomadorRazaoSocial ?? "—"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Não cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && excluirMut.mutate({ id: deleteTarget.id, companyId: companyId! })}
              >
                Confirmar Cancelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        </>}
        {/* fim aba emitidas */}

        {/* ─── AlertDialog Histórico Completo SEFAZ (fora de qualquer aba) ─── */}
        <AlertDialog open={confirmHistorico} onOpenChange={setConfirmHistorico}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Baixar histórico completo da SEFAZ?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso vai zerar o ponteiro NSU e baixar <strong>todas as NF-e recebidas desde o início</strong> cadastradas na SEFAZ para o CNPJ da empresa. Pode demorar alguns minutos dependendo do volume.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => sefazResetNsuMut.mutate({ companyId: companyId ?? 0 })}
              >
                Baixar tudo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog: Histórico NFS-e Emitidas 2018–2025 via SIAP GEO */}
        <AlertDialog open={confirmHistoricoNfse} onOpenChange={setConfirmHistoricoNfse}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Baixar histórico NFS-e 2018–{new Date().getFullYear()}?</AlertDialogTitle>
              <AlertDialogDescription>
                O sistema vai consultar a API da prefeitura de Guaratinguetá (SIAP GEO) e trazer{" "}
                <strong>todas as NFS-e emitidas pela FC de 2018 até hoje</strong>.
                Notas já importadas serão ignoradas automaticamente. Pode levar alguns minutos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => iniciarSyncHistoricoNfse()}
              >
                Baixar histórico completo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Dialog detalhe NF-e Recebida — espelho fiel da nota ── */}
        <Dialog open={!!nfeRecDetalhe} onOpenChange={v => { if (!v) { setNfeRecDetalhe(null); setShowJustRecusa(false); setJustRecusa(""); } }}>
          <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden rounded-2xl">
            {nfeRecDetalhe && (() => {
              const nf = nfeRecDetalhe;
              const st = STATUS_MAP[nf.status] ?? { label: nf.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
              const chaveRaw = String(nf.chaveAcesso || "");
              const chaveFormatada = fmtChave(chaveRaw);
              const chaveParaCopiar = String(nf.chaveAcesso || "").replace(/\D/g, "");
              const isMutating = manifestarMut.isPending;
              const canManifest = ["pendente", "recebida"].includes(nf.status);
              const det = nfeDetalhesQuery.data?.detalhes ?? null;
              const isLoadingDet = nfeDetalhesQuery.isLoading;
              const fmtV = (v: any) => {
                const n = parseFloat(String(v || "0"));
                return isNaN(n) || n === 0 ? "—" : formatBRL(n);
              };
              const fmtQ = (v: any) => {
                const n = parseFloat(String(v || "0"));
                return isNaN(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
              };
              const fmtPct = (v: any) => {
                const n = parseFloat(String(v || "0"));
                return isNaN(n) || n === 0 ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
              };
              const FRETE_MODAL: Record<string, string> = { "0": "Por conta do emitente", "1": "Por conta do destinatário", "2": "Por conta de terceiros", "9": "Sem frete" };
              const TPNF: Record<string, string> = { "0": "Entrada", "1": "Saída" };
              return (
                <>
                  {/* ── Cabeçalho estilo DANFE ── */}
                  <div className="bg-gradient-to-r from-indigo-700 to-indigo-500 px-5 py-4 text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold tracking-widest uppercase opacity-70 mb-0.5">Nota Fiscal Eletrônica</p>
                        <h2 className="text-xl font-bold leading-tight">
                          NF-e {nf.numeroNf ? `#${resolveNumeroNf(nf.numeroNf, nf.chaveAcesso)}` : "—"}
                          {det?.ide?.serie ? <span className="text-base font-normal opacity-80 ml-1">· Série {det.ide.serie}</span> : null}
                        </h2>
                        <p className="text-indigo-200 text-xs mt-0.5">
                          {det?.ide?.natOp || "Recebida via SEFAZ"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase tracking-wide opacity-70">Valor Total NF</p>
                        <p className="text-2xl font-bold tabular-nums">{formatBRL(nf.valorLiquido)}</p>
                        <div className="flex items-center gap-1.5 justify-end mt-1">
                          {det?.ide?.tpNF !== undefined && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/20">
                              {TPNF[String(det.ide.tpNF)] ?? "NF-e"}
                            </span>
                          )}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Corpo com scroll ── */}
                  <div className="p-5 space-y-4 max-h-[70svh] overflow-y-auto">

                    {/* Loading */}
                    {isLoadingDet && (
                      <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Carregando dados da nota…</span>
                      </div>
                    )}

                    {/* ── Dados da NF-e (igual portal fazenda.gov.br) ── */}
                    {det && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Dados da NF-e</p>
                        </div>
                        <div className="px-3 py-2.5 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Natureza da operação</p>
                              <p className="text-sm text-slate-800 mt-0.5 break-words">{det.ide?.natOp || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Tipo da operação</p>
                              <p className="text-sm text-slate-800 mt-0.5">
                                {det.ide?.tpNF !== undefined && det.ide.tpNF !== ""
                                  ? `${det.ide.tpNF} - ${TPNF[String(det.ide.tpNF)] ?? det.ide.tpNF}`
                                  : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Chave de acesso</p>
                              <p className="font-mono text-[11px] text-slate-600 break-all mt-0.5 leading-relaxed tracking-wider">{chaveFormatada}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Modelo</p>
                              <p className="text-sm text-slate-800 mt-0.5">{det.ide?.mod || "55"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Série</p>
                              <p className="text-sm text-slate-800 mt-0.5">{det.ide?.serie || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Número</p>
                              <p className="text-sm font-semibold text-slate-800 mt-0.5">{resolveNumeroNf(nf.numeroNf, nf.chaveAcesso) || det.ide?.nNF || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Data/Hora da emissão</p>
                              <p className="text-sm text-slate-800 tabular-nums mt-0.5">
                                {det.ide?.dhEmi ? (() => {
                                  try {
                                    return new Date(det.ide.dhEmi).toLocaleString("pt-BR", {
                                      timeZone: "America/Sao_Paulo",
                                      day: "2-digit", month: "2-digit", year: "numeric",
                                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                                    });
                                  } catch { return String(det.ide.dhEmi).slice(0, 19).replace("T", " "); }
                                })() : fmtDateBR(nf.dataEmissao)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Emitente + Destinatário ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Emitente</p>
                        </div>
                        <div className="px-3 py-2.5 space-y-0.5">
                          <p className="font-semibold text-slate-800 break-words leading-snug text-sm">{det?.emit?.xNome || nf.emitenteNome || "—"}</p>
                          {det?.emit?.xFant && det.emit.xFant !== det.emit.xNome && (
                            <p className="text-xs text-slate-500 italic">{det.emit.xFant}</p>
                          )}
                          <p className="text-xs text-slate-500 font-mono">{fmtCnpjDisplay(det?.emit?.cnpj || nf.emitenteCnpj)}</p>
                          {det?.emit?.ie && <p className="text-xs text-slate-400">IE: {det.emit.ie}</p>}
                          {det?.emit?.endereco && det.emit.endereco.trim() !== "," && (
                            <p className="text-xs text-slate-400 break-words">{det.emit.endereco}{det.emit.bairro ? ` — ${det.emit.bairro}` : ""}</p>
                          )}
                          {det?.emit?.municipio && (
                            <p className="text-xs text-slate-400">{det.emit.municipio}{det.emit.uf ? ` — ${det.emit.uf}` : ""}{det.emit.cep ? ` · CEP ${det.emit.cep}` : ""}</p>
                          )}
                          {det?.emit?.fone && <p className="text-xs text-slate-400">Fone: {det.emit.fone}</p>}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Destinatário</p>
                        </div>
                        <div className="px-3 py-2.5 space-y-0.5">
                          <p className="font-semibold text-slate-800 break-words leading-snug text-sm">{det?.dest?.xNome || "FC ENGENHARIA"}</p>
                          <p className="text-xs text-slate-500 font-mono">{fmtCnpjDisplay(det?.dest?.cnpj || "")}</p>
                          {det?.dest?.ie && <p className="text-xs text-slate-400">IE: {det.dest.ie}</p>}
                          {det?.dest?.endereco && det.dest.endereco.trim() !== "," && (
                            <p className="text-xs text-slate-400 break-words">{det.dest.endereco}{det.dest.bairro ? ` — ${det.dest.bairro}` : ""}</p>
                          )}
                          {det?.dest?.municipio && (
                            <p className="text-xs text-slate-400">{det.dest.municipio}{det.dest.uf ? ` — ${det.dest.uf}` : ""}{det.dest.cep ? ` · CEP ${det.dest.cep}` : ""}</p>
                          )}
                          {det?.dest?.email && <p className="text-xs text-slate-400 break-all">{det.dest.email}</p>}
                        </div>
                      </div>
                    </div>

                    {/* ── Datas adicionais ── */}
                    <div className="flex flex-wrap gap-2">
                      {det?.ide?.dhSaiEnt && String(det.ide.dhSaiEnt).length > 4 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex-1 min-w-[130px]">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">Saída / Entrada</p>
                          <p className="font-semibold text-slate-800 tabular-nums text-sm">{fmtDateBR(String(det.ide.dhSaiEnt).slice(0,10))}</p>
                        </div>
                      )}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex-1 min-w-[130px]">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">Importada em</p>
                        <p className="font-semibold text-slate-800 tabular-nums text-sm">{fmtDateBR(nf.createdAt)}</p>
                      </div>
                      {nf.nsuSefaz && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex-1 min-w-[130px]">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">NSU SEFAZ</p>
                          <p className="font-semibold text-slate-800 font-mono text-sm">{nf.nsuSefaz}</p>
                        </div>
                      )}
                    </div>

                    {/* ── Produtos / Itens ── */}
                    {det?.itens && det.itens.length > 0 && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center gap-2">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Produtos / Serviços</p>
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-1.5 rounded-full">{det.itens.length} {det.itens.length === 1 ? "item" : "itens"}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-3 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400 w-6">#</th>
                                <th className="px-2 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Código</th>
                                <th className="px-2 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400 min-w-[160px]">Descrição</th>
                                <th className="px-2 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">NCM</th>
                                <th className="px-2 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">CFOP</th>
                                <th className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">Qtd</th>
                                <th className="px-2 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Un</th>
                                <th className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">V.Unit</th>
                                <th className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">V.Prod</th>
                                <th className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">ICMS%</th>
                                <th className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">vICMS</th>
                                <th className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">vIPI</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {det.itens.map((item: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-1.5 text-slate-400 tabular-nums">{item.nItem || idx + 1}</td>
                                  <td className="px-2 py-1.5 text-slate-500 font-mono">{item.cProd || "—"}</td>
                                  <td className="px-2 py-1.5 text-slate-800 break-words max-w-[200px]">{item.xProd || "—"}</td>
                                  <td className="px-2 py-1.5 text-slate-500 font-mono">{item.ncm || "—"}</td>
                                  <td className="px-2 py-1.5 text-slate-500 font-mono">{item.cfop || "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-slate-700 tabular-nums">{fmtQ(item.qCom)}</td>
                                  <td className="px-2 py-1.5 text-slate-500">{item.uCom || "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-slate-700 tabular-nums">{fmtV(item.vUnCom)}</td>
                                  <td className="px-2 py-1.5 text-right font-semibold text-slate-800 tabular-nums">{fmtV(item.vProd)}</td>
                                  <td className="px-2 py-1.5 text-right text-slate-500 tabular-nums">{fmtPct(item.pICMS)}</td>
                                  <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums">{fmtV(item.vICMS)}</td>
                                  <td className="px-2 py-1.5 text-right text-slate-600 tabular-nums">{fmtV(item.vIPI)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Totais ── */}
                    {det?.total && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Totais da NF-e</p>
                        </div>
                        <div className="px-3 py-2.5">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                            {[
                              ["Valor Produtos", det.total.vProd],
                              ["Base Cálc. ICMS", det.total.vBC],
                              ["Valor ICMS", det.total.vICMS],
                              ["ICMS Desonerado", det.total.vICMSDeson],
                              ["Valor ST", det.total.vST],
                              ["Valor IPI", det.total.vIPI],
                              ["Valor PIS", det.total.vPIS],
                              ["Valor COFINS", det.total.vCOFINS],
                              ["Frete", det.total.vFrete],
                              ["Seguro", det.total.vSeg],
                              ["Desconto", det.total.vDesc],
                              ["Outras Despesas", det.total.vOutro],
                            ].filter(([_, v]) => parseFloat(String(v || "0")) !== 0).map(([label, val]) => (
                              <div key={String(label)} className="flex justify-between gap-1">
                                <span className="text-slate-400">{label}</span>
                                <span className="text-slate-700 tabular-nums font-medium">{fmtV(val)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-700">TOTAL DA NOTA</span>
                            <span className="text-lg font-bold text-indigo-700 tabular-nums">{fmtV(det.total.vNF)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Transporte ── */}
                    {det?.transp && (det.transp.transportadora || det.transp.volumes?.length > 0) && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Transporte</p>
                        </div>
                        <div className="px-3 py-2.5 space-y-1 text-xs">
                          {det.transp.modFrete !== undefined && (
                            <p className="text-slate-600"><span className="text-slate-400">Modalidade frete:</span> {FRETE_MODAL[String(det.transp.modFrete)] ?? det.transp.modFrete}</p>
                          )}
                          {det.transp.transportadora && (
                            <p className="text-slate-600"><span className="text-slate-400">Transportadora:</span> {det.transp.transportadora}</p>
                          )}
                          {det.transp.volumes?.map((vol: any, i: number) => (
                            <p key={i} className="text-slate-500">
                              Vol {i + 1}: {vol.qVol ? `${vol.qVol} vol.` : ""} {vol.esp ? `· ${vol.esp}` : ""} {vol.marca ? `· Marca: ${vol.marca}` : ""} {vol.pesoB ? `· Peso bruto: ${vol.pesoB}kg` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Cobrança / Duplicatas ── */}
                    {det?.duplicatas && det.duplicatas.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center gap-2">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Cobrança / Duplicatas</p>
                          <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 rounded-full">{det.duplicatas.length} parcela(s)</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-3 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Nº Dup.</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Vencimento</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-bold tracking-wider uppercase text-slate-400">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {det.duplicatas.map((dup: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="px-3 py-1.5 text-slate-700 font-mono">{dup.nDup || `0${i + 1}`}</td>
                                  <td className="px-3 py-1.5 text-slate-600 tabular-nums">{dup.dVenc ? fmtDateBR(String(dup.dVenc).slice(0,10)) : "—"}</td>
                                  <td className="px-3 py-1.5 text-right font-semibold text-slate-800 tabular-nums">{fmtV(dup.vDup)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {det.fatura && (
                          <div className="px-3 py-2 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
                            {det.fatura.nFat && <span>Fatura {det.fatura.nFat}</span>}
                            <span>V.Orig: {fmtV(det.fatura.vOrig)}</span>
                            {parseFloat(det.fatura.vDesc) > 0 && <span>Desc: {fmtV(det.fatura.vDesc)}</span>}
                            <span className="font-semibold text-slate-700">V.Líq: {fmtV(det.fatura.vLiq)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Informações Adicionais ── */}
                    {det?.infAdic && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Informações Adicionais</p>
                        </div>
                        <p className="px-3 py-2.5 text-xs text-slate-600 break-words leading-relaxed whitespace-pre-wrap">{String(det.infAdic)}</p>
                      </div>
                    )}

                    {/* ── Eventos e Serviços (igual portal fazenda.gov.br) ── */}
                    {det?.protocolo?.nProt && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Eventos e Serviços</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-3 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Evento</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Protocolo</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-bold tracking-wider uppercase text-slate-400">Data autorização</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="px-3 py-2 text-slate-700 font-medium">
                                  {det.protocolo.cStat === "100" || det.protocolo.cStat === ""
                                    ? "Autorização de Uso"
                                    : det.protocolo.xMotivo || "Autorização de Uso"}
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-600">{det.protocolo.nProt}</td>
                                <td className="px-3 py-2 text-slate-600 tabular-nums">
                                  {det.protocolo.dhRecbto ? (() => {
                                    try {
                                      return new Date(det.protocolo.dhRecbto).toLocaleString("pt-BR", {
                                        timeZone: "America/Sao_Paulo",
                                        day: "2-digit", month: "2-digit", year: "numeric",
                                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                                      });
                                    } catch { return String(det.protocolo.dhRecbto).slice(0, 19).replace("T", " "); }
                                  })() : "—"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {det.protocolo.digVal && (
                          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Digest Value</p>
                            <p className="font-mono text-xs text-slate-500 break-all select-all">{det.protocolo.digVal}</p>
                          </div>
                        )}
                        {det.protocolo.verAplic && (
                          <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400">
                            Versão aplicativo: {det.protocolo.verAplic}
                            {det.protocolo.tpAmb && ` · Ambiente: ${det.protocolo.tpAmb === "1" ? "Produção" : "Homologação"}`}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Nota sem XML completo ── */}
                    {!isLoadingDet && !det && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex gap-2 items-start">
                        <span className="text-amber-500 text-sm mt-0.5">ⓘ</span>
                        <p className="text-xs text-amber-700 leading-relaxed">
                          XML completo não disponível para esta nota — foi importada via resumo SEFAZ (resNFe). Novas sincronizações e importações de XML salvarão o conteúdo completo automaticamente.
                        </p>
                      </div>
                    )}

                    {/* ── Chave de Acesso ── */}
                    {(!det || !det.protocolo?.nProt) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                      <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Chave de Acesso (44 dígitos)</p>
                        {chaveRaw && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700 transition-colors"
                            title="Copiar chave"
                            onClick={() => {
                              navigator.clipboard.writeText(chaveParaCopiar).then(() => {
                                setCopiedChave(true);
                                setTimeout(() => setCopiedChave(false), 2000);
                              });
                            }}
                          >
                            {copiedChave ? <CheckIcon className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedChave ? "Copiado!" : "Copiar"}
                          </button>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="font-mono text-xs text-slate-600 break-all select-all leading-loose tracking-wider">{chaveFormatada}</p>
                      </div>
                    </div>
                    )}

                    {/* ── Manifestação ── */}
                    {canManifest && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
                          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Sua Manifestação</p>
                          <p className="text-[10px] text-slate-400">Enviado diretamente à SEFAZ</p>
                        </div>
                        <div className="px-3 py-3 flex flex-col gap-2">
                          {!showJustRecusa ? (
                            <>
                              <p className="text-xs text-slate-500 leading-relaxed">Essa NF-e pertence à sua empresa?</p>
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 border-green-300 bg-green-50 hover:bg-green-100 text-green-800 transition-colors disabled:opacity-50"
                                  onClick={() => manifestarMut.mutate({ id: nf.id, companyId: companyId!, status: "acatada" })}
                                >
                                  {isMutating ? <RefreshCw className="w-5 h-5 animate-spin text-green-600" /> : <CheckIcon className="w-5 h-5 text-green-600" />}
                                  <span className="text-xs font-semibold">Acatar</span>
                                  <span className="text-[10px] text-green-600 text-center leading-tight">É nossa, confirmar</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-800 transition-colors disabled:opacity-50"
                                  onClick={() => { setShowJustRecusa(true); setJustRecusa(""); }}
                                >
                                  <X className="w-5 h-5 text-red-600" />
                                  <span className="text-xs font-semibold">Recusar</span>
                                  <span className="text-[10px] text-red-600 text-center leading-tight">Não é nossa</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-50"
                                  onClick={() => manifestarMut.mutate({ id: nf.id, companyId: companyId!, status: "desconhecida" })}
                                >
                                  {isMutating ? <RefreshCw className="w-5 h-5 animate-spin text-slate-500" /> : <span className="text-lg font-bold text-slate-500">?</span>}
                                  <span className="text-xs font-semibold">Desconheço</span>
                                  <span className="text-[10px] text-slate-500 text-center leading-tight">Não reconheço</span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {/* ── Cabeçalho vermelho ── */}
                              <div className="flex items-center gap-2 pb-2 border-b border-red-100">
                                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                  <X className="w-4 h-4 text-red-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-red-700">Recusar esta NF-e</p>
                                  <p className="text-[11px] text-red-400">Operação Não Realizada — NT 2014.002 · Art. 3º § 2º</p>
                                </div>
                              </div>

                              {/* ── Passo a passo ── */}
                              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 space-y-2">
                                <p className="text-[10px] font-bold tracking-widest uppercase text-red-500 mb-1">Como funciona</p>
                                {[
                                  { n: "1", text: "Digite abaixo o motivo da recusa — obrigatório pela SEFAZ (mín. 15 caracteres)." },
                                  { n: "2", text: "Clique em 'Confirmar recusa e avisar SEFAZ'. O sistema assina o evento XML com o certificado A1 e envia ao WebService NFeRecepcaoEvento4." },
                                  { n: "3", text: "A SEFAZ retorna o protocolo de confirmação (cStat 135). Ele aparece no toast e fica registrado na nota." },
                                  { n: "4", text: "O emitente será notificado automaticamente pela SEFAZ sobre a recusa." },
                                ].map(({ n, text }) => (
                                  <div key={n} className="flex gap-2 items-start">
                                    <span className="mt-0.5 w-4 h-4 rounded-full bg-red-200 text-red-700 text-[10px] font-bold flex items-center justify-center shrink-0">{n}</span>
                                    <p className="text-[11px] text-red-700 leading-snug">{text}</p>
                                  </div>
                                ))}
                                <div className="mt-2 pt-2 border-t border-red-100 flex gap-1.5 items-start">
                                  <span className="text-amber-500 text-xs mt-0.5 shrink-0">⚠</span>
                                  <p className="text-[11px] text-amber-700 leading-snug">
                                    <strong>Pré-requisito:</strong> a empresa precisa ter o certificado A1 configurado em <em>Configurações → Financeiro → SEFAZ</em>. Sem ele, a recusa não será enviada à SEFAZ.
                                  </p>
                                </div>
                              </div>

                              {/* ── Textarea de justificativa ── */}
                              <div>
                                <label className="block text-xs font-semibold text-red-700 mb-1">
                                  Motivo da recusa <span className="font-normal text-slate-400">(obrigatório · 15–255 caracteres)</span>
                                </label>
                                <textarea
                                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 placeholder:text-slate-400"
                                  rows={3}
                                  maxLength={255}
                                  autoFocus
                                  placeholder="Ex: Nota fiscal não corresponde a nenhuma compra realizada por esta empresa."
                                  value={justRecusa}
                                  onChange={e => setJustRecusa(e.target.value)}
                                />
                                <div className="flex items-center justify-between mt-1">
                                  <span className={`text-[11px] tabular-nums ${justRecusa.trim().length < 15 ? "text-red-400" : "text-emerald-600 font-medium"}`}>
                                    {justRecusa.trim().length < 15
                                      ? `${justRecusa.trim().length}/255 — faltam ${15 - justRecusa.trim().length} caracteres`
                                      : `${justRecusa.trim().length}/255 ✓ pronto para enviar`}
                                  </span>
                                </div>
                              </div>

                              {/* ── Botões ── */}
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                                  onClick={() => { setShowJustRecusa(false); setJustRecusa(""); }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={isMutating || justRecusa.trim().length < 15}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                  onClick={() => {
                                    manifestarMut.mutate({ id: nf.id, companyId: companyId!, status: "recusada", justificativa: justRecusa.trim() });
                                    setShowJustRecusa(false);
                                    setJustRecusa("");
                                  }}
                                >
                                  {isMutating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                  Confirmar recusa e avisar SEFAZ
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {!canManifest && (
                      <div className={`rounded-xl border px-3 py-2.5 text-center text-sm font-medium ${st.color}`}>
                        Manifestação: {st.label}
                        {["acatada","recusada","desconhecida"].includes(nf.status) && (
                          <button
                            type="button"
                            className="ml-3 text-xs underline opacity-70 hover:opacity-100"
                            onClick={() => manifestarMut.mutate({ id: nf.id, companyId: companyId!, status: "pendente" as any })}
                          >
                            Desfazer
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Footer ── */}
                  <div className="px-5 py-3 border-t bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {/* Botão Ver DANFE */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => setDanfeUrl(`/api/fiscal-notes/${nf.id}/danfe?companyId=${companyId}`)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Ver DANFE
                      </Button>
                      {nf.chaveAcesso && String(nf.chaveAcesso).replace(/\D/g,"").length === 44 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                          onClick={() => {
                            const chave = String(nf.chaveAcesso).replace(/\D/g, "");
                            window.open(
                              `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConteudo=7PhJ%2BgAVw2g%3D&nfe=${chave}`,
                              "_blank"
                            );
                            navigator.clipboard?.writeText(chave).catch(() => {});
                            toast({
                              title: "Portal SEFAZ aberto",
                              description: "Chave pré-preenchida no portal. Resolva o CAPTCHA para ver a nota.",
                            });
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Consultar no SEFAZ
                        </Button>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setNfeRecDetalhe(null)}>Fechar</Button>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* ── Dialog DANFE (iframe) ── */}
        <Dialog open={!!danfeUrl} onOpenChange={v => { if (!v) setDanfeUrl(null); }}>
          <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-800 text-sm">DANFE — Documento Auxiliar da Nota Fiscal Eletrônica</span>
              </div>
              <div className="flex items-center gap-2">
                {danfeUrl && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.open(danfeUrl!, "_blank")}>
                    <ExternalLink className="w-3 h-3" />
                    Abrir em nova aba / Imprimir
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDanfeUrl(null)}>Fechar</Button>
              </div>
            </div>
            {danfeUrl && (
              <iframe
                src={danfeUrl}
                className="w-full border-0"
                style={{ height: "80svh" }}
                title="DANFE"
              />
            )}
          </DialogContent>
        </Dialog>


        {/* ═══════════════════════════════════════════════════════════════════════
            ABA: PANORAMA FISCAL
        ═══════════════════════════════════════════════════════════════════════ */}
        {pageTab === "panorama" && (
          <PanoramaFiscal
            companyId={companyId ?? 0}
            companyNome={selectedCompany?.nomeFantasia ?? selectedCompany?.razaoSocial ?? ""}
            companyLogoUrl={selectedCompany?.logoUrl ?? undefined}
          />
        )}

      </div>
    </DashboardLayout>
  );
}
