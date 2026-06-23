import { useState, useMemo, useEffect, useRef } from "react";
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
  Building2, Calendar, Banknote, Receipt, X, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Upload, Loader2,
} from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatBRL(v: number | string | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
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
  pendente:   { label: "Pendente",   color: "bg-amber-100 text-amber-800 border-amber-200" },
  recebida:   { label: "Recebida",   color: "bg-blue-100 text-blue-800 border-blue-200" },
  conciliada: { label: "Conciliada", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelada:  { label: "Cancelada",  color: "bg-red-100 text-red-700 border-red-200" },
};

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
  numeroNf: string;
  serie?: string | null;
  chaveAcesso?: string | null;
  dataEmissao: string;
  dataCompetencia?: string | null;
  dataVencimento?: string | null;
  tomadorCnpj?: string | null;
  tomadorRazaoSocial?: string | null;
  obraId?: number | null;
  obraNome?: string | null;
  bmReferencia?: string | null;
  descricaoServico?: string | null;
  valorBruto: string;
  deducoesTotal?: string | null;
  baseCalculoIss?: string | null;
  aliquotaIss?: string | null;
  issRetido?: string | null;
  retencaoInss?: string | null;
  retencaoIrrf?: string | null;
  retencaoPisCofins?: string | null;
  valorLiquido: string;
  status: string;
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
  const { companyId } = useCompany();
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
  const [form, setForm] = useState<any>(emptyForm());
  const [tab, setTab] = useState<"dados" | "tributacao" | "vinculo">("dados");
  const [vincularEntryId, setVincularEntryId] = useState("");
  const [vincularStmtId, setVincularStmtId] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);

  const [confirmHistorico, setConfirmHistorico] = useState(false);

  // ── Aba principal: emitidas | recebidas ──────────────────────────────────────
  const [pageTab, setPageTab] = useState<"emitidas" | "recebidas">("emitidas");
  const [recAno, setRecAno] = useState(new Date().getFullYear());
  const [recMes, setRecMes] = useState<number | null>(new Date().getMonth() + 1);
  const [recSearch, setRecSearch] = useState("");
  const [recStatus, setRecStatus] = useState("todos");

  // ── Upload XML ──────────────────────────────────────────────────────────────
  const [xmlUploading, setXmlUploading] = useState(false);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const nfeRecQuery = (trpc as any).sefaz.listNFeRecebidas.useQuery(
    { companyId: companyId ?? 0, ano: recAno, mes: recMes ?? undefined, search: recSearch || undefined, status: recStatus !== "todos" ? recStatus : undefined },
    { enabled: !!companyId && pageTab === "recebidas", staleTime: 30_000 }
  );
  const nfeRec: any[] = nfeRecQuery.data ?? [];

  // Query anual sem filtros para dots do calendário recebidas
  const nfeRecYearQuery = (trpc as any).sefaz.listNFeRecebidas.useQuery(
    { companyId: companyId ?? 0, ano: recAno },
    { enabled: !!companyId && pageTab === "recebidas", staleTime: 60_000 }
  );
  const recMesesStatus = useMemo((): Record<number, "consolidado" | "lancamento" | "vazio"> => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    for (const nf of (nfeRecYearQuery.data ?? []) as any[]) {
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

  // ── Municípios NFS-e emitidas (last_sync_at por município) ───────────────────
  const municipiosQuery = (trpc as any).nfseEmitidas.getMunicipios.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId && pageTab === "emitidas", staleTime: 60_000, refetchInterval: 60_000 }
  );
  const municipios: any[] = municipiosQuery.data ?? [];

  // ── Cronômetro regressivo SEFAZ: atualiza a cada segundo ─────────────────────
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  useEffect(() => {
    if (!sefazCfg) { setCountdownSec(null); return; }
    const calcSecs = () => {
      try {
        const result = JSON.parse(sefazCfg.last_sync_result || "{}");
        const baseTs = result?.rateLimitedAt
          ? new Date(result.rateLimitedAt).getTime()
          : sefazCfg.last_sync_at
            ? new Date(sefazCfg.last_sync_at).getTime()
            : null;
        if (!baseTs) { setCountdownSec(null); return; }
        const nextSyncMs = baseTs + 58 * 60 * 1000;
        setCountdownSec(Math.max(0, Math.floor((nextSyncMs - Date.now()) / 1000)));
      } catch { setCountdownSec(null); }
    };
    calcSecs();
    const iv = setInterval(calcSecs, 1000);
    return () => clearInterval(iv);
  }, [sefazCfg]);

  // ── Cronômetro regressivo NFS-e Municipal: município com sync mais recente ────
  const [munCountdownSec, setMunCountdownSec] = useState<number | null>(null);
  useEffect(() => {
    const enabled = municipios.filter((m: any) => m.enabled);
    if (!enabled.length) { setMunCountdownSec(null); return; }
    // Pega o last_sync_at mais recente entre os municípios habilitados
    const latestTs = enabled.reduce((best: number | null, m: any) => {
      if (!m.last_sync_at) return best;
      const t = new Date(m.last_sync_at).getTime();
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
  const sefazSyncMut = (trpc as any).sefaz.syncNow.useMutation({
    onSuccess: (r: any) => {
      nfeRecQuery.refetch();
      if (r?.erro) toast({ title: "SEFAZ: " + r.erro, variant: "destructive" });
      else if (r?.aviso) toast({ title: "⚠️ " + (r.aviso || "Rate limit SEFAZ"), variant: "default" });
      else toast({ title: `SEFAZ: ${r?.importadas ?? 0} NF-e novas importadas, ${r?.ignoradas ?? 0} já existiam.` });
    },
    onError: (e: any) => toast({ title: "Erro na sync SEFAZ", description: e.message, variant: "destructive" }),
  });
  const importXmlMut = (trpc as any).sefaz.importXml.useMutation({
    onSuccess: (r: any) => {
      nfeRecQuery.refetch();
      const msg = `${r.importadas} NF-e importada${r.importadas !== 1 ? "s" : ""}, ${r.ignoradas} já existia${r.ignoradas !== 1 ? "m" : ""}.`;
      const erroTxt = r.erros?.length ? ` ${r.erros.length} com erro.` : "";
      toast({ title: "Import XML: " + msg + erroTxt, variant: r.importadas > 0 ? "default" : "destructive" });
      setXmlUploading(false);
    },
    onError: (e: any) => { toast({ title: "Erro no import XML", description: e.message, variant: "destructive" }); setXmlUploading(false); },
  });
  const sefazResetNsuMut = (trpc as any).sefaz.resetNSU.useMutation({
    onSuccess: () => {
      toast({ title: "NSU zerado. Sincronizando histórico completo..." });
      sefazSyncMut.mutate({ companyId: companyId ?? 0 });
    },
    onError: (e: any) => toast({ title: "Erro ao resetar NSU", description: e.message, variant: "destructive" }),
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
    try {
      const xmlFiles = await Promise.all(
        files.map(async f => ({
          name: f.name,
          content: await f.text(),
        }))
      );
      importXmlMut.mutate({ companyId, xmlFiles });
    } catch {
      setXmlUploading(false);
      toast({ title: "Erro ao ler os arquivos XML", variant: "destructive" });
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
    const pendente = nfs.filter(n => n.status === "pendente");
    const recebida = nfs.filter(n => n.status === "recebida");
    const conciliada = nfs.filter(n => n.status === "conciliada");
    const somarLiq = (arr: NF[]) => arr.reduce((s, n) => s + parseFloat(String(n.valorLiquido || 0)), 0);
    return {
      total: nfs.length,
      pendente: pendente.length,
      recebida: recebida.length,
      conciliada: conciliada.length,
      valorPendente: somarLiq(pendente),
      valorRecebida: somarLiq(recebida),
      valorConciliada: somarLiq(conciliada),
      valorTotal: somarLiq(nfs),
    };
  }, [nfs]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">

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
              <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={handlePdfUpload} />
              <Button variant="outline" onClick={() => pdfInputRef.current?.click()} disabled={isParsing} className="gap-2">
                {isParsing ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo PDF...</> : <><Upload className="h-4 w-4" /> Importar PDF</>}
              </Button>
              <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                <Plus className="h-4 w-4" /> Nova NFS-e
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
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando...</>
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
            </div>
          )}
        </div>

        {/* Sub-abas: Emitidas | Recebidas */}
        <div className="flex gap-1 border-b border-slate-200 -mb-1">
          {(["emitidas", "recebidas"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setPageTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pageTab === t
                  ? "border-indigo-600 text-indigo-700 bg-indigo-50/60"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t === "emitidas" ? "📤 NFS-e Emitidas" : "📥 NF-e Recebidas (SEFAZ)"}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            ABA: NF-e RECEBIDAS (SEFAZ)
        ═══════════════════════════════════════════════════════════════════════ */}
        {pageTab === "recebidas" && (() => {
          const MESES_REC = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
          const fmtCountdown = (s: number) => {
            if (s <= 0) return null; // ready to sync
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return `${h}h ${String(m).padStart(2,"0")}min`;
            return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
          };
          const countdownLabel = fmtCountdown(countdownSec ?? 0);
          const nsuNum = Number(sefazCfg?.ultimo_nsu ?? 0);
          return (
            <div className="space-y-4">
              {/* Cronômetro de próxima sync */}
              {sefazCfg && (
                <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                  countdownLabel
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}>
                  {/* Anel de progresso animado */}
                  <div className="relative shrink-0 w-10 h-10">
                    <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15" fill="none"
                        stroke={countdownLabel ? "#f59e0b" : "#10b981"}
                        strokeWidth="3"
                        strokeDasharray="94.2"
                        strokeDashoffset={countdownLabel
                          ? String(94.2 * (1 - (countdownSec ?? 0) / (58 * 60)))
                          : "0"}
                        strokeLinecap="round"
                        style={{ transition: "stroke-dashoffset 1s linear" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      {countdownLabel
                        ? <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                        : <RefreshCw className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                      }
                    </div>
                  </div>
                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    {countdownLabel ? (
                      <>
                        <p className="text-sm font-semibold text-amber-800">
                          Próxima sync automática em{" "}
                          <span className="font-mono text-amber-700 tabular-nums">{countdownLabel}</span>
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          SEFAZ permite 1 chamada/hora — o sistema aguarda e sincroniza sozinho.
                          {nsuNum > 0 && <> · NSU atual: <strong>{nsuNum.toLocaleString("pt-BR")}</strong></>}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-emerald-800">
                          ✅ Pronto — sincronizando agora em background
                        </p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          A cota SEFAZ foi renovada. O cron horário já está buscando novas NF-e.
                          {nsuNum > 0 && <> · NSU atual: <strong>{nsuNum.toLocaleString("pt-BR")}</strong></>}
                        </p>
                      </>
                    )}
                  </div>
                  {/* Última sync */}
                  {sefazCfg.last_sync_at && (
                    <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                      <div>Última sync</div>
                      <div className="font-medium text-slate-500">
                        {new Date(sefazCfg.last_sync_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                      </div>
                    </div>
                  )}
                </div>
              )}

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

              {/* Aviso se sem certificado */}
              {nfeRec.length === 0 && !nfeRecQuery.isLoading && (
                <Card className="border-0 shadow-sm ring-1 ring-amber-100 bg-amber-50/60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Nenhuma NF-e recebida encontrada</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Configure o certificado A1 em <strong>Configurações → Financeiro → Integração SEFAZ</strong> e clique em
                        "Sincronizar Agora" para buscar automaticamente todas as NF-e recebidas pelo CNPJ da empresa.
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

              {/* Tabela */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-3 py-2.5 text-left">NF#</th>
                        <th className="px-3 py-2.5 text-left">Emissão</th>
                        <th className="px-3 py-2.5 text-left">Emitente</th>
                        <th className="px-3 py-2.5 text-left">CNPJ Emitente</th>
                        <th className="px-3 py-2.5 text-right">Valor</th>
                        <th className="px-3 py-2.5 text-left">Status</th>
                        <th className="px-3 py-2.5 text-left">Chave de Acesso</th>
                        <th className="px-3 py-2.5 text-left">Importada em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfeRecQuery.isLoading && (
                        <tr><td colSpan={8} className="py-10 text-center text-slate-400">Carregando...</td></tr>
                      )}
                      {!nfeRecQuery.isLoading && nfeRec.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Receipt className="h-8 w-8 text-slate-300" />
                              <span className="text-slate-400 text-sm">Nenhuma NF-e recebida neste período.</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {nfeRec.map((nf: any) => {
                        const st = STATUS_MAP[nf.status] ?? { label: nf.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
                        return (
                          <tr key={nf.id} className="border-b hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-indigo-700">#{nf.numeroNf || "—"}</span>
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {nfeRec.length > 0 && (
                  <div className="px-4 py-2 border-t text-xs text-slate-400 bg-slate-50/60">
                    {nfeRec.length} NF-e{nfeRec.length !== 1 ? "s" : ""} recebida{nfeRec.length !== 1 ? "s" : ""} via SEFAZ — atualizado automaticamente todo dia às 06:00.
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

        {/* Cronômetro NFS-e Municipal */}
        {(() => {
          const enabledMuns = municipios.filter((m: any) => m.enabled);
          if (!enabledMuns.length) return null;
          const fmtC = (s: number) => {
            if (s <= 0) return null;
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return `${h}h ${String(m).padStart(2,"0")}min`;
            return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
          };
          const label = fmtC(munCountdownSec ?? 0);
          const latestSync = enabledMuns
            .map((m: any) => m.last_sync_at)
            .filter(Boolean)
            .sort()
            .at(-1);
          return (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${label ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="relative shrink-0 w-10 h-10">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none"
                    stroke={label ? "#f59e0b" : "#10b981"} strokeWidth="3"
                    strokeDasharray="94.2"
                    strokeDashoffset={label ? String(94.2 * (1 - (munCountdownSec ?? 0) / (55 * 60))) : "0"}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className={`w-3.5 h-3.5 ${label ? "text-amber-500" : "text-emerald-500 animate-spin"}`} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {label ? (
                  <>
                    <p className="text-sm font-semibold text-amber-800">
                      Próxima sync automática em{" "}
                      <span className="font-mono text-amber-700 tabular-nums">{label}</span>
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Prefeituras sincronizadas: {enabledMuns.map((m: any) => m.nome_municipio).join(", ")} — o sistema busca novas NFS-e automaticamente toda hora.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-emerald-800">✅ Pronto — sincronizando em background</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {enabledMuns.map((m: any) => m.nome_municipio).join(", ")} — buscando novas NFS-e agora.
                    </p>
                  </>
                )}
              </div>
              {latestSync && (
                <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                  <div>Última sync</div>
                  <div className="font-medium text-slate-500">
                    {new Date(latestSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Pendentes", count: totais.pendente, valor: totais.valorPendente, color: "amber" },
            { label: "Recebidas", count: totais.recebida, valor: totais.valorRecebida, color: "blue" },
            { label: "Conciliadas", count: totais.conciliada, valor: totais.valorConciliada, color: "emerald" },
            { label: "Total NFs", count: totais.total, valor: totais.valorTotal, color: "slate" },
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
        </div>

        {/* Tabela */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
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
                  <tr><td colSpan={10} className="py-10 text-center text-slate-400">Carregando...</td></tr>
                )}
                {!listQuery.isLoading && nfs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 text-slate-300" />
                        <span className="text-slate-400 text-sm">Nenhuma nota fiscal encontrada.</span>
                      </div>
                    </td>
                  </tr>
                )}
                {nfs.map(nf => {
                  const st = STATUS_MAP[nf.status] ?? { label: nf.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
                  return (
                    <tr key={nf.id} className="border-b hover:bg-slate-50 transition-colors group">
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
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-indigo-600" />
                  NF-e #{detalheNf.numeroNf} — Detalhes e Vínculos
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Resumo */}
                <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-2 border">
                  <div><span className="text-slate-500 text-xs">Tomador</span><div className="font-medium truncate">{detalheNf.tomadorRazaoSocial ?? "—"}</div></div>
                  <div><span className="text-slate-500 text-xs">Emissão</span><div>{fmtDateBR(detalheNf.dataEmissao)}</div></div>
                  <div><span className="text-slate-500 text-xs">Valor Bruto</span><div className="font-medium">{formatBRL(detalheNf.valorBruto)}</div></div>
                  <div><span className="text-slate-500 text-xs">Valor Líquido</span><div className="font-bold text-emerald-700">{formatBRL(detalheNf.valorLiquido)}</div></div>
                  {detalheNf.bmReferencia && <div className="col-span-2"><span className="text-slate-500 text-xs">Referência</span><div>{detalheNf.obraNome} — {detalheNf.bmReferencia}</div></div>}
                </div>

                {/* Vínculo com Lançamento */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Lançamento Financeiro (ID)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={vincularEntryId}
                      onChange={e => setVincularEntryId(e.target.value)}
                      placeholder="ID do lançamento..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => vincularEntryMut.mutate({ id: detalheNf.id, companyId: detalheNf.companyId ?? companyId!, entryId: vincularEntryId ? parseInt(vincularEntryId) : null })}
                      disabled={vincularEntryMut.isPending}
                      variant={vincularEntryId ? "default" : "outline"}
                      className="gap-1 shrink-0"
                    >
                      {vincularEntryId ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                      {vincularEntryId ? "Vincular" : "Desvincular"}
                    </Button>
                  </div>
                  {detalheNf.entryId && (
                    <p className="text-xs text-blue-600">Atualmente vinculado ao Lançamento #{detalheNf.entryId}</p>
                  )}
                </div>

                {/* Vínculo com Extrato */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Linha do Extrato Bancário (ID)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={vincularStmtId}
                      onChange={e => setVincularStmtId(e.target.value)}
                      placeholder="ID da linha do extrato..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => vincularStmtMut.mutate({ id: detalheNf.id, companyId: detalheNf.companyId ?? companyId!, stmtLineId: vincularStmtId ? parseInt(vincularStmtId) : null })}
                      disabled={vincularStmtMut.isPending}
                      variant={vincularStmtId ? "default" : "outline"}
                      className="gap-1 shrink-0"
                    >
                      {vincularStmtId ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                      {vincularStmtId ? "Vincular" : "Desvincular"}
                    </Button>
                  </div>
                  {detalheNf.stmtLineId && (
                    <p className="text-xs text-violet-600">Atualmente vinculada ao Extrato #{detalheNf.stmtLineId}</p>
                  )}
                </div>

                {detalheNf.arquivoUrl && (
                  <a href={detalheNf.arquivoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2 w-full">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir PDF da NF-e
                    </Button>
                  </a>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetalheNf(null)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

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

        {/* ─── AlertDialog Cancelar NF ─── */}
        {/* ─── AlertDialog Histórico Completo SEFAZ ─── */}
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

      </div>
    </DashboardLayout>
  );
}
