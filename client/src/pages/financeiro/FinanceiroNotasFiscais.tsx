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
              Notas Fiscais de Serviço (NFS-e)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">NFs emitidas pela FC Engenharia — controle e cruzamento com extrato</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={handlePdfUpload}
            />
            <Button
              variant="outline"
              onClick={() => pdfInputRef.current?.click()}
              disabled={isParsing}
              className="gap-2"
            >
              {isParsing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo PDF...</>
                : <><Upload className="h-4 w-4" /> Importar PDF</>
              }
            </Button>
            <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Plus className="h-4 w-4" /> Nova NF-e
            </Button>
          </div>
        </div>

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

        {/* ─── Dialog Cadastro/Edição ─── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-600" />
                {editingId ? `Editar NF-e #${form.numeroNf}` : "Nova Nota Fiscal de Serviço"}
              </DialogTitle>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex border-b gap-4 px-1 shrink-0">
              {(["dados", "tributacao", "vinculo"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {t === "dados" ? "Dados Gerais" : t === "tributacao" ? "Tributação" : "Vínculo / Arquivo"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">

              {/* Tab: Dados Gerais */}
              {tab === "dados" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Label className="text-xs mb-1 block">Número NF *</Label>
                      <Input value={form.numeroNf} onChange={e => setF("numeroNf", e.target.value)} placeholder="55" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Série</Label>
                      <Input value={form.serie ?? ""} onChange={e => setF("serie", e.target.value)} placeholder="NE / 70000" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Data Emissão *</Label>
                      <Input type="date" value={isoToInput(form.dataEmissao)} onChange={e => setF("dataEmissao", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Competência</Label>
                      <Input type="date" value={isoToInput(form.dataCompetencia)} onChange={e => setF("dataCompetencia", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Vencimento</Label>
                      <Input type="date" value={isoToInput(form.dataVencimento)} onChange={e => setF("dataVencimento", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">CNPJ do Tomador</Label>
                      <Input value={form.tomadorCnpj ?? ""} onChange={e => setF("tomadorCnpj", e.target.value)} placeholder="00.000.000/0001-00" />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs mb-1 block">Razão Social do Tomador</Label>
                      <Input value={form.tomadorRazaoSocial ?? ""} onChange={e => setF("tomadorRazaoSocial", e.target.value)} placeholder="Nome do cliente..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Obra</Label>
                      <Input value={form.obraNome ?? ""} onChange={e => setF("obraNome", e.target.value)} placeholder="Nome da obra..." />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">BM (Boletim de Medição)</Label>
                      <Input value={form.bmReferencia ?? ""} onChange={e => setF("bmReferencia", e.target.value)} placeholder="BM 001, BM 002..." />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Descrição do Serviço</Label>
                    <Textarea value={form.descricaoServico ?? ""} onChange={e => setF("descricaoServico", e.target.value)}
                      placeholder="Descreva o serviço prestado..." rows={3} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Chave de Acesso NFS-e</Label>
                    <Input value={form.chaveAcesso ?? ""} onChange={e => setF("chaveAcesso", e.target.value)} placeholder="35 dígitos..." className="font-mono text-xs" />
                  </div>
                </>
              )}

              {/* Tab: Tributação */}
              {tab === "tributacao" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Valor Bruto do Serviço *</Label>
                      <Input
                        value={form.valorBruto}
                        onChange={e => setF("valorBruto", e.target.value)}
                        onBlur={() => handleMoneyBlur("valorBruto")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Deduções (Material / BC ISSQN)</Label>
                      <Input
                        value={form.deducoesTotal}
                        onChange={e => setF("deducoesTotal", e.target.value)}
                        onBlur={() => handleMoneyBlur("deducoesTotal")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">ISS Retido (5%)</Label>
                      <Input
                        value={form.issRetido}
                        onChange={e => setF("issRetido", e.target.value)}
                        onBlur={() => handleMoneyBlur("issRetido")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">INSS Retido</Label>
                      <Input
                        value={form.retencaoInss}
                        onChange={e => setF("retencaoInss", e.target.value)}
                        onBlur={() => handleMoneyBlur("retencaoInss")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">IRRF Retido</Label>
                      <Input
                        value={form.retencaoIrrf}
                        onChange={e => setF("retencaoIrrf", e.target.value)}
                        onBlur={() => handleMoneyBlur("retencaoIrrf")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">PIS/COFINS Retidos</Label>
                      <Input
                        value={form.retencaoPisCofins}
                        onChange={e => setF("retencaoPisCofins", e.target.value)}
                        onBlur={() => handleMoneyBlur("retencaoPisCofins")}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      <Label className="text-xs font-medium text-emerald-700 block mb-0.5">Valor Líquido (entra no banco)</Label>
                      <div className="text-xl font-bold text-emerald-700">{form.valorLiquido}</div>
                      <p className="text-xs text-emerald-500 mt-0.5">Bruto − ISS − INSS − IRRF − PIS/COFINS</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Observações</Label>
                    <Textarea value={form.observacoes ?? ""} onChange={e => setF("observacoes", e.target.value)} rows={2} />
                  </div>
                </>
              )}

              {/* Tab: Vínculo / Arquivo */}
              {tab === "vinculo" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs mb-1 block">URL do PDF da NF-e</Label>
                    <Input value={form.arquivoUrl ?? ""} onChange={e => setF("arquivoUrl", e.target.value)} placeholder="https://..." />
                    <p className="text-xs text-slate-400 mt-1">Cole a URL pública do PDF ou do upload.</p>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Nome do Arquivo</Label>
                    <Input value={form.arquivoNome ?? ""} onChange={e => setF("arquivoNome", e.target.value)} placeholder="NF_055_NOVA_PLANTA.pdf" />
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-sm text-blue-700">
                    <strong>Dica:</strong> Após salvar a NF, use o botão <Eye className="inline h-3.5 w-3.5 mx-0.5" /> na lista para vincular a um lançamento financeiro ou linha do extrato bancário.
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={isSaving || !form.numeroNf || !form.dataEmissao} className="gap-2">
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {editingId ? "Salvar Alterações" : "Cadastrar NF-e"}
              </Button>
            </DialogFooter>
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
            if (s === "pending")  return { step: 0, label: "Aguardando", color: "text-slate-400" };
            if (s === "reading")  return { step: 1, label: "Lendo arquivo…", color: "text-indigo-500" };
            if (s === "parsing")  return { step: 2, label: "IA extraindo…", color: "text-violet-500" };
            if (s === "ok")       return { step: 3, label: "Extraído", color: "text-emerald-600" };
            if (s === "saving")   return { step: 3, label: "Salvando…", color: "text-indigo-500" };
            if (s === "saved")    return { step: 4, label: "Cadastrado!", color: "text-emerald-700" };
            if (s === "error")    return { step: -1, label: "Erro", color: "text-red-500" };
            return { step: 0, label: "", color: "" };
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

                          {/* Indicador de fases */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <StepDot active={step === 1} done={step > 1 && !isErr} err={false} />
                            <div className={`h-px flex-1 max-w-[16px] transition-colors ${step > 1 && !isErr ? "bg-emerald-400" : "bg-slate-200"}`} />
                            <StepDot active={step === 2} done={step > 2 && !isErr} err={false} />
                            <div className={`h-px flex-1 max-w-[16px] transition-colors ${step > 2 && !isErr ? "bg-emerald-400" : "bg-slate-200"}`} />
                            <StepDot active={step === 3} done={step === 4} err={isErr} />
                            <div className={`h-px flex-1 max-w-[16px] transition-colors ${step === 4 ? "bg-emerald-400" : "bg-slate-200"}`} />
                            <StepDot active={false} done={step === 4} err={false} />
                            <span className={`text-xs ml-1 ${color} ${isActive ? "animate-pulse" : ""}`}>{label}</span>
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

      </div>
    </DashboardLayout>
  );
}
