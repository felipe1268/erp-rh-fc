import { useMemo, useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Plus, Pencil, Trash2, Loader2, CheckCircle, RotateCcw, Banknote,
  ChevronLeft, ChevronRight, Search, FileSpreadsheet, X, Upload,
  AlertCircle, FileText, Building2, Tag,
} from "lucide-react";

// ── Formatters ───────────────────────────────────────────────────────────────
function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function maskBRL(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMaskBRL(masked: string): number {
  const digits = String(masked).replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}
function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = new Date(String(v).length > 10 ? v : v + "T00:00:00");
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}
function diasAte(v: any): number | null {
  if (!v) return null;
  try {
    const d = new Date(String(v).length > 10 ? v : v + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    const hoje = new Date();
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    return Math.round((a - b) / 86400000);
  } catch { return null; }
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

// ── Constants ────────────────────────────────────────────────────────────────
const ANO_ATUAL = new Date().getFullYear();
const MESES_ABREV = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STATUS_OPTS = [
  { value: "disponivel",  label: "Disponível",  color: "bg-green-100 text-green-700"  },
  { value: "alocado",     label: "Alocado",     color: "bg-blue-100 text-blue-700"    },
  { value: "compensado",  label: "Compensado",  color: "bg-teal-100 text-teal-700"    },
  { value: "devolvido",   label: "Devolvido",   color: "bg-orange-100 text-orange-700"},
];

function statusBadge(s: string) {
  const opt = STATUS_OPTS.find(o => o.value === s);
  return opt
    ? <Badge className={`${opt.color} hover:${opt.color} border-0`}>{opt.label}</Badge>
    : <Badge variant="outline">{s}</Badge>;
}

function VencCell({ c }: { c: any }) {
  if (!c.data_bom_para) return <span className="text-xs text-muted-foreground">—</span>;
  if (c.status === "compensado") return <span className="text-xs text-teal-700 font-medium">Compensado ✓</span>;
  const dias = diasAte(c.data_bom_para);
  const fmt = fmtData(c.data_bom_para);
  if (dias == null) return <span className="text-xs text-muted-foreground">{fmt}</span>;
  if (dias > 3) return <span className="text-xs rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700 font-medium">{fmt} · {dias}d</span>;
  if (dias > 0) return <span className="text-xs rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-700 font-medium">{fmt} · {dias}d</span>;
  if (dias === 0) return <span className="text-xs rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-amber-800 font-semibold">Hoje</span>;
  return <span className="text-xs rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-red-700 font-medium">{fmt} · vencido</span>;
}

// ── Form padrão ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  numeroCheque: "", emitenteNome: "", banco: "", agencia: "", conta: "",
  valorMask: "", dataEmissao: "", dataBomPara: "", observacao: "",
  clienteId: null as number | null, clienteNome: "",
};

// ── Tipo de fila de importação ────────────────────────────────────────────────
type ImportItem = {
  file: File;
  base64: string;
  step: "aguardando" | "analisando" | "preview" | "importando" | "done" | "erro";
  preview: any | null;
  resultado: any | null;
  erro: string | null;
};

// ── ClienteSelect inline ──────────────────────────────────────────────────────
function ClienteSelect({
  clientes, value, onChange, placeholder = "Nenhum cliente vinculado",
}: {
  clientes: any[];
  value: number | null;
  onChange: (id: number | null, nome: string | null) => void;
  placeholder?: string;
}) {
  return (
    <Select
      value={value != null ? String(value) : "__none__"}
      onValueChange={v => {
        if (v === "__none__") { onChange(null, null); return; }
        const c = clientes.find((c: any) => String(c.id) === v);
        onChange(Number(v), c?.nome ?? null);
      }}
    >
      <SelectTrigger className="mt-1 h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{placeholder}</SelectItem>
        {clientes.map((c: any) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.nome}{c.nome_fantasia && c.nome_fantasia !== c.nome ? ` (${c.nome_fantasia})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function FinanceiroChequesRecebidosContent() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const utils = (trpc as any).useUtils?.() ?? (trpc as any).useContext?.();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Limpar todos (admin_master) ──
  const [limparOpen, setLimparOpen] = useState(false);

  // ── Filtros ──
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [fStatus, setFStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [fClienteId, setFClienteId] = useState<number | null>(null);

  // ── Seleção em lote ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [atribuirClienteId, setAtribuirClienteId] = useState<number | null>(null);
  const [atribuirClienteNome, setAtribuirClienteNome] = useState<string | null>(null);

  // ── Dialogs ──
  const [formOpen, setFormOpen] = useState(false);
  const [formEdit, setFormEdit] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [excluirId, setExcluirId] = useState<number | null>(null);
  const [alocDrilldown, setAlocDrilldown] = useState<any | null>(null);

  // ── Import multi-arquivo ──
  const [importOpen, setImportOpen] = useState(false);
  const [importQueue, setImportQueue] = useState<ImportItem[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importRunning, setImportRunning] = useState(false);
  const [importClienteId, setImportClienteId] = useState<number | null>(null);
  const [importClienteNome, setImportClienteNome] = useState<string | null>(null);
  const importTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Queries ──
  const listQuery = (trpc as any).chequesRecebidos.listar.useQuery(
    { companyId, status: fStatus !== "todos" ? fStatus : undefined, busca: busca || undefined, mes: mesSel, ano, clienteId: fClienteId ?? undefined },
    { enabled: !!companyId }
  );
  const totaisQuery = (trpc as any).chequesRecebidos.totais.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const clientesQuery = (trpc as any).chequesRecebidos.listarClientes.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const resumoPorMesQuery = (trpc as any).chequesRecebidos.resumoPorMes.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const cheques: any[] = listQuery.data?.cheques ?? [];
  const totais: any = totaisQuery.data ?? {};
  const clientes: any[] = clientesQuery.data?.clientes ?? [];

  const mesesStatus = useMemo(() => {
    const m: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let i = 1; i <= 12; i++) m[i] = "vazio";
    for (const r of (resumoPorMesQuery.data ?? []) as any[]) {
      if (!r.mes) continue;
      m[r.mes] = r.qtd > 0 && r.compensados >= r.qtd ? "consolidado" : r.qtd > 0 ? "lancamento" : "vazio";
    }
    return m;
  }, [resumoPorMesQuery.data]);

  function invalidate() {
    utils?.chequesRecebidos?.listar?.invalidate?.();
    utils?.chequesRecebidos?.totais?.invalidate?.();
  }

  // ── Totais cards ──
  const totalDisp  = Number(totais?.disponivel?.total  ?? 0);
  const qtdDisp    = Number(totais?.disponivel?.qtd    ?? 0);
  const totalAloc  = Number(totais?.alocado?.total     ?? 0);
  const qtdAloc    = Number(totais?.alocado?.qtd       ?? 0);
  const totalComp  = Number(totais?.compensado?.total  ?? 0);
  const qtdComp    = Number(totais?.compensado?.qtd    ?? 0);
  const totalDev   = Number(totais?.devolvido?.total   ?? 0);
  const qtdDev     = Number(totais?.devolvido?.qtd     ?? 0);

  // ── Mutations ──
  const criarMut = (trpc as any).chequesRecebidos.criar.useMutation({
    onSuccess: () => { toast({ title: "Cheque cadastrado!" }); setFormOpen(false); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarMut = (trpc as any).chequesRecebidos.atualizar.useMutation({
    onSuccess: () => { toast({ title: "Cheque atualizado!" }); setFormOpen(false); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const excluirMut = (trpc as any).chequesRecebidos.excluir.useMutation({
    onSuccess: () => { toast({ title: "Cheque excluído." }); setExcluirId(null); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarStatusMut = (trpc as any).chequesRecebidos.atualizar.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado." }); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atribuirClienteMut = (trpc as any).chequesRecebidos.atribuirCliente.useMutation({
    onSuccess: (r: any) => {
      toast({ title: `Cliente atribuído a ${r.atualizados} cheque(s).` });
      setAtribuirOpen(false);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const previewMut = (trpc as any).chequesRecebidos.importarPreview.useMutation();
  const confirmarMut = (trpc as any).chequesRecebidos.importarConfirmar.useMutation();
  const limparTodosMut = (trpc as any).chequesRecebidos.limparTodos.useMutation({
    onSuccess: (r: any) => {
      toast({ title: `${r.excluidos} registro(s) excluído(s).` });
      setLimparOpen(false);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 4103 — Limpar totalizadores inválidos (cheques com numero="TOTAL" etc. importados antes do fix)
  const [limparTotOpen, setLimparTotOpen] = useState(false);
  const limparTotMut = (trpc as any).chequesRecebidos.limparTotalizadores.useMutation({
    onSuccess: (r: any) => {
      if (r.removidos === 0) {
        toast({ title: "Nenhum registro inválido encontrado.", description: "Tudo certo — não há totalizadores na base." });
      } else {
        toast({ title: `${r.removidos} registro(s) inválido(s) removido(s).`, description: r.registros.map((x: any) => `Nº ${x.numero_cheque} · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(x.valor))}`).join(" · ") });
      }
      setLimparTotOpen(false);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Erro ao limpar", description: e.message, variant: "destructive" }),
  });

  // ── Form helpers ──
  function abrirNovo() { setFormEdit(null); setForm(EMPTY_FORM); setFormOpen(true); }
  function abrirEditar(c: any) {
    setFormEdit(c);
    setForm({
      numeroCheque: c.numero_cheque ?? "",
      emitenteNome: c.emitente_nome ?? "",
      banco:        c.banco ?? "",
      agencia:      c.agencia ?? "",
      conta:        c.conta ?? "",
      valorMask:    c.valor ? maskBRL(String(Math.round(Number(c.valor) * 100))) : "",
      dataEmissao:  c.data_emissao ? String(c.data_emissao).slice(0, 10) : "",
      dataBomPara:  c.data_bom_para ? String(c.data_bom_para).slice(0, 10) : "",
      observacao:   c.observacao ?? "",
      clienteId:    c.cliente_id ? Number(c.cliente_id) : null,
      clienteNome:  c.cliente_nome ?? "",
    });
    setFormOpen(true);
  }
  function handleSalvar() {
    const valor = parseMaskBRL(form.valorMask);
    if (!form.numeroCheque.trim()) { toast({ title: "Informe o número do cheque", variant: "destructive" }); return; }
    if (!valor) { toast({ title: "Informe o valor", variant: "destructive" }); return; }
    const payload: any = {
      companyId,
      numeroCheque: form.numeroCheque.trim(),
      emitenteNome: form.emitenteNome.trim() || undefined,
      banco:        form.banco.trim() || undefined,
      agencia:      form.agencia.trim() || undefined,
      conta:        form.conta.trim() || undefined,
      valor,
      dataEmissao:  form.dataEmissao || undefined,
      dataBomPara:  form.dataBomPara || undefined,
      observacao:   form.observacao.trim() || undefined,
      clienteId:    form.clienteId ?? null,
      clienteNome:  form.clienteNome.trim() || null,
    };
    formEdit ? atualizarMut.mutate({ ...payload, id: formEdit.id }) : criarMut.mutate(payload);
  }

  // ── Seleção em lote ──────────────────────────────────────────────────────
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === cheques.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(cheques.map((c: any) => c.id)));
  }

  // ── Import multi-arquivo ──────────────────────────────────────────────────

  function abrirImport() {
    setImportQueue([]);
    setImportProgress(0);
    setImportRunning(false);
    setImportClienteId(null);
    setImportClienteNome(null);
    setImportOpen(true);
  }

  function fecharImport() {
    if (importRunning) return;
    setImportOpen(false);
    setImportQueue([]);
    setImportProgress(0);
  }

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    const items: ImportItem[] = await Promise.all(files.map(async (file) => {
      const base64 = await fileToBase64(file);
      return { file, base64, step: "aguardando" as const, preview: null, resultado: null, erro: null };
    }));
    setImportQueue(prev => [...prev, ...items]);
  }

  function removeFile(idx: number) {
    setImportQueue(prev => prev.filter((_, i) => i !== idx));
  }

  function startSimulatedProgress(from: number, to: number, durationMs = 2500) {
    if (importTimerRef.current) clearInterval(importTimerRef.current);
    const steps = 40;
    const interval = durationMs / steps;
    const delta = (to - from) / steps;
    let current = from;
    importTimerRef.current = setInterval(() => {
      current = Math.min(current + delta, to - 0.5);
      setImportProgress(Math.round(current));
    }, interval);
  }

  function stopSimulatedProgress() {
    if (importTimerRef.current) { clearInterval(importTimerRef.current); importTimerRef.current = null; }
  }

  // Fase 1: só análise (dry-run) — mostra contagens sem gravar nada
  async function executarPreview() {
    if (!importQueue.length || importRunning) return;
    setImportRunning(true);
    setImportProgress(0);

    const pending = importQueue.filter(it => it.step === "aguardando");
    const total   = pending.length;

    for (let i = 0; i < importQueue.length; i++) {
      const item = importQueue[i];
      if (item.step !== "aguardando") continue;

      const baseFrom = Math.round((i / total) * 100);
      const baseTo   = Math.round(((i + 1) / total) * 100);

      setImportQueue(prev => prev.map((it, idx) => idx === i ? { ...it, step: "analisando" } : it));
      startSimulatedProgress(baseFrom, baseTo, 2000);

      try {
        const preview = await previewMut.mutateAsync({ companyId, base64: item.base64 });
        stopSimulatedProgress();
        setImportProgress(baseTo);
        setImportQueue(prev => prev.map((it, idx) => idx === i ? { ...it, step: "preview", preview } : it));
      } catch (err: any) {
        stopSimulatedProgress();
        setImportQueue(prev => prev.map((it, idx) => idx === i ? { ...it, step: "erro", erro: err.message } : it));
        setImportProgress(baseTo);
      }
    }

    setImportProgress(100);
    setTimeout(() => { setImportProgress(0); }, 1200);
    setImportRunning(false);
  }

  // Fase 2: confirmação explícita — grava os registros após o usuário revisar os totais
  async function executarConfirmar() {
    if (!importQueue.length || importRunning) return;
    setImportRunning(true);
    setImportProgress(0);

    const previewed = importQueue.filter(it => it.step === "preview");
    const total     = previewed.length;

    for (let i = 0; i < importQueue.length; i++) {
      const item = importQueue[i];
      if (item.step !== "preview") continue;

      const baseFrom = Math.round((i / total) * 100);
      const baseTo   = Math.round(((i + 1) / total) * 100);

      setImportQueue(prev => prev.map((it, idx) => idx === i ? { ...it, step: "importando" } : it));
      startSimulatedProgress(baseFrom, baseTo, 1500);

      try {
        const resultado = await confirmarMut.mutateAsync({
          companyId,
          base64: item.base64,
          clienteId: importClienteId,
          clienteNome: importClienteNome,
        });
        stopSimulatedProgress();
        setImportProgress(baseTo);
        setImportQueue(prev => prev.map((it, idx) => idx === i ? { ...it, step: "done", resultado } : it));
      } catch (err: any) {
        stopSimulatedProgress();
        setImportQueue(prev => prev.map((it, idx) => idx === i ? { ...it, step: "erro", erro: err.message } : it));
        setImportProgress(baseTo);
      }
    }

    setImportProgress(100);
    setTimeout(() => { setImportProgress(0); }, 1200);
    setImportRunning(false);
    invalidate();
  }

  useEffect(() => () => { if (importTimerRef.current) clearInterval(importTimerRef.current); }, []);

  const queueTotals = useMemo(() => {
    let novos = 0, ignorados = 0, erros = 0;
    for (const it of importQueue) {
      if (it.resultado) { novos += it.resultado.inseridos ?? 0; ignorados += it.resultado.ignorados ?? 0; }
      if (it.step === "erro") erros++;
    }
    return { novos, ignorados, erros };
  }, [importQueue]);

  const allDone       = importQueue.length > 0 && importQueue.every(it => it.step === "done" || it.step === "erro");
  const hasPending    = importQueue.some(it => it.step === "aguardando");
  const allPreviewed  = importQueue.length > 0 && !hasPending && importQueue.some(it => it.step === "preview") &&
                        importQueue.every(it => it.step === "preview" || it.step === "done" || it.step === "erro");
  const previewNovos  = importQueue.reduce((s, it) => s + (it.preview?.novos ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-5">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Banknote className="h-6 w-6 text-green-600" /> Controle de Cheques Recebidos
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cheques de terceiros recebidos — disponíveis para alocação em pagamentos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => setAtribuirOpen(true)}
                className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50">
                <Tag className="h-4 w-4" /> Atribuir cliente ({selectedIds.size})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={abrirNovo}
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
              <Plus className="h-4 w-4" /> Lançar cheque
            </Button>
            <Button size="sm" onClick={abrirImport}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Upload className="h-4 w-4" /> Importar .xlsx
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLimparTotOpen(true)}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              title="Remove cheques com número 'TOTAL', 'SUBTOTAL' etc. importados erroneamente">
              <Trash2 className="h-4 w-4" /> Limpar inválidos
            </Button>
            {isMaster && (
              <Button size="sm" variant="outline" onClick={() => setLimparOpen(true)}
                className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Limpar tudo
              </Button>
            )}
          </div>
        </div>

        {/* ── Cards de totais ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button type="button" onClick={() => setFStatus(fStatus === "disponivel" ? "todos" : "disponivel")}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-300 ${fStatus === "disponivel" ? "ring-2 ring-green-500 border-green-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-green-700">Disponíveis</span>
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-800">{qtdDisp}</div>
            <div className="text-sm text-green-600 font-medium">{formatBRL(totalDisp)}</div>
          </button>

          <button type="button" onClick={() => setFStatus(fStatus === "alocado" ? "todos" : "alocado")}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300 ${fStatus === "alocado" ? "ring-2 ring-blue-500 border-blue-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blue-700">Alocados</span>
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-800">{qtdAloc}</div>
            <div className="text-sm text-blue-600 font-medium">{formatBRL(totalAloc)}</div>
          </button>

          <button type="button" onClick={() => setFStatus(fStatus === "compensado" ? "todos" : "compensado")}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-teal-300 ${fStatus === "compensado" ? "ring-2 ring-teal-500 border-teal-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-teal-700">Compensados</span>
              <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
            </div>
            <div className="text-2xl font-bold text-teal-800">{qtdComp}</div>
            <div className="text-sm text-teal-600 font-medium">{formatBRL(totalComp)}</div>
          </button>

          <button type="button" onClick={() => setFStatus(fStatus === "devolvido" ? "todos" : "devolvido")}
            className={`text-left rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-orange-300 ${fStatus === "devolvido" ? "ring-2 ring-orange-500 border-orange-300" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-orange-700">Devolvidos</span>
              <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
            </div>
            <div className="text-2xl font-bold text-orange-800">{qtdDev}</div>
            <div className="text-sm text-orange-600 font-medium">{formatBRL(totalDev)}</div>
          </button>
        </div>

        {/* ── Filtros ── */}
        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            {/* Linha 1 — busca + status + cliente */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar nº, emitente, banco…" className="pl-8 h-9 text-sm" />
              </div>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Filtro por cliente */}
              <Select
                value={fClienteId != null ? String(fClienteId) : "__todos__"}
                onValueChange={v => setFClienteId(v === "__todos__" ? null : Number(v))}
              >
                <SelectTrigger className="w-52 h-9 text-sm gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Todos os clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todos os clientes</SelectItem>
                  {clientes.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fClienteId != null && (
                <Button size="sm" variant="ghost" className="h-9 px-2 text-xs text-muted-foreground" onClick={() => setFClienteId(null)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Limpar cliente
                </Button>
              )}
            </div>

            {/* Linha 2 — navegação ano + pills de mês com bolinhas (padrão Emitidos) */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-base font-bold min-w-[3.5rem] text-center">{ano}</span>
                  <button type="button" onClick={() => setAno(a => a + 1)} disabled={ano >= ANO_ATUAL + 1} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setMesSel(null)}
                    className={`ml-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${mesSel == null ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    Todos
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MESES_ABREV.slice(1).map((m, i) => {
                  const num = i + 1;
                  const st = mesesStatus[num];
                  const isSel = mesSel === num;
                  return (
                    <button key={num} type="button" onClick={() => setMesSel(num)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                        ${isSel ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <span>{m}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${st === "consolidado" ? "bg-green-500" : st === "lancamento" ? "bg-blue-500" : "bg-gray-300"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Tabela ── */}
        <Card>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
              </div>
            ) : cheques.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum cheque recebido encontrado.</p>
                <p className="text-xs mt-1 opacity-70">Use "Lançar cheque" ou "Importar .xlsx" para adicionar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox" className="rounded"
                          checked={selectedIds.size === cheques.length && cheques.length > 0}
                          onChange={toggleSelectAll} />
                      </th>
                      <th className="text-left px-4 py-3 font-medium">Nº Cheque</th>
                      <th className="text-left px-4 py-3 font-medium">Emitente</th>
                      <th className="text-left px-4 py-3 font-medium">Cliente</th>
                      <th className="text-right px-4 py-3 font-medium">Valor</th>
                      <th className="text-left px-4 py-3 font-medium">Emissão</th>
                      <th className="text-left px-4 py-3 font-medium">Bom para</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">Alocado em</th>
                      <th className="px-4 py-3 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cheques.map((c: any) => (
                      <tr key={c.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${selectedIds.has(c.id) ? "bg-purple-50/60" : ""}`}>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" className="rounded"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelect(c.id)} />
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-indigo-800 text-sm">{c.numero_cheque}</td>
                        <td className="px-4 py-2.5 max-w-[160px]">
                          <span className="truncate block font-medium" title={c.emitente_nome}>{c.emitente_nome || "—"}</span>
                          {c.banco && <span className="text-[11px] text-muted-foreground block">{c.banco}{c.agencia ? ` · Ag ${c.agencia}` : ""}</span>}
                        </td>
                        {/* Coluna Cliente */}
                        <td className="px-4 py-2.5 max-w-[160px]">
                          {c.cliente_nome ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-purple-400 shrink-0" />
                              <span className="truncate text-xs font-medium text-purple-800" title={c.cliente_nome}>{c.cliente_nome}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatBRL(Number(c.valor))}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtData(c.data_emissao)}</td>
                        <td className="px-4 py-2.5"><VencCell c={c} /></td>
                        <td className="px-4 py-2.5">{statusBadge(c.status)}</td>
                        <td className="px-4 py-2.5">
                          {c.status === "alocado" && c.fornecedor_alocado_nome ? (
                            <button
                              className="text-xs font-medium text-blue-700 underline decoration-dotted hover:text-blue-900 max-w-[130px] truncate block"
                              title={`Fornecedor: ${c.fornecedor_alocado_nome}`}
                              onClick={() => setAlocDrilldown(c)}
                            >{c.fornecedor_alocado_nome}</button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {(c.status === "disponivel" || c.status === "alocado") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-teal-600 hover:bg-teal-50"
                                title="Marcar como Compensado"
                                onClick={() => atualizarStatusMut.mutate({ id: c.id, companyId, status: "compensado" })}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(c.status === "disponivel" || c.status === "alocado") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500 hover:bg-orange-50"
                                title="Marcar como Devolvido"
                                onClick={() => atualizarStatusMut.mutate({ id: c.id, companyId, status: "devolvido" })}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(c.status === "compensado" || c.status === "devolvido") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:bg-muted"
                                title="Voltar para Disponível"
                                onClick={() => atualizarStatusMut.mutate({ id: c.id, companyId, status: "disponivel" })}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:bg-muted"
                              title="Editar" onClick={() => abrirEditar(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50 hover:text-red-600"
                              title="Excluir" onClick={() => setExcluirId(c.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between gap-2">
                  <span>
                    {cheques.length} cheque(s) · Total: <span className="font-semibold text-foreground">
                      {formatBRL(cheques.reduce((s: number, c: any) => s + Number(c.valor ?? 0), 0))}
                    </span>
                  </span>
                  {selectedIds.size > 0 && (
                    <span className="text-purple-600 font-medium">{selectedIds.size} selecionado(s)</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ════════════════════════════════════════════════════════
          Dialog: Atribuir cliente em lote
      ════════════════════════════════════════════════════════ */}
      <Dialog open={atribuirOpen} onOpenChange={o => { if (!o) setAtribuirOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-purple-600" />
              Atribuir cliente
            </DialogTitle>
            <DialogDescription>
              Selecione o cliente para vincular aos <strong>{selectedIds.size}</strong> cheque(s) selecionado(s).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">Cliente</Label>
            <ClienteSelect
              clientes={clientes}
              value={atribuirClienteId}
              onChange={(id, nome) => { setAtribuirClienteId(id); setAtribuirClienteNome(nome); }}
              placeholder="Selecione o cliente…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtribuirOpen(false)}>Cancelar</Button>
            <Button
              disabled={atribuirClienteMut.isPending}
              onClick={() => atribuirClienteMut.mutate({
                companyId,
                ids: Array.from(selectedIds),
                clienteId: atribuirClienteId,
                clienteNome: atribuirClienteNome,
              })}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {atribuirClienteMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Atribuir cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
          Dialog: Importar múltiplas planilhas .xlsx
      ════════════════════════════════════════════════════════ */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) fecharImport(); }}>
        <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Cabeçalho */}
          <DialogHeader className="shrink-0 bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-4 text-white">
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              Importar planilhas de cheques
            </DialogTitle>
            <DialogDescription className="text-white/70 text-xs mt-1">
              Selecione uma ou mais planilhas .xlsx. Cheques já existentes (mesmo nº + valor) serão ignorados.
            </DialogDescription>
          </DialogHeader>

          {/* Corpo */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4">

            {/* Vincular cliente (opcional) */}
            <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="text-sm font-medium text-purple-800">Vincular a cliente (opcional)</span>
              </div>
              <ClienteSelect
                clientes={clientes}
                value={importClienteId}
                onChange={(id, nome) => { setImportClienteId(id); setImportClienteNome(nome); }}
                placeholder="Nenhum cliente — definir depois"
              />
              {importClienteId != null && (
                <p className="text-xs text-purple-600 mt-1.5">
                  Todos os cheques novos desta importação serão vinculados a <strong>{importClienteNome}</strong>.
                </p>
              )}
            </div>

            {/* Zona de drop / seleção */}
            {!importRunning && (
              <div
                onClick={() => !importRunning && fileRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                <Upload className="h-8 w-8 mx-auto text-indigo-400 mb-2" />
                <p className="text-sm font-medium text-indigo-700">Clique para selecionar arquivos</p>
                <p className="text-xs text-muted-foreground mt-0.5">Vários arquivos .xlsx ao mesmo tempo</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  className="hidden"
                  onChange={onFilesSelected}
                />
              </div>
            )}

            {/* Lista de arquivos */}
            {importQueue.length > 0 && (
              <div className="space-y-2">
                {importQueue.map((item, idx) => (
                  <div key={idx} className={`rounded-xl border p-3 transition-colors ${
                    item.step === "done"       ? "border-green-200 bg-green-50/50" :
                    item.step === "erro"       ? "border-red-200 bg-red-50/50" :
                    item.step === "analisando" || item.step === "importando" ? "border-indigo-200 bg-indigo-50/50" :
                    "border-gray-200 bg-card"
                  }`}>
                    <div className="flex items-center gap-2">
                      {item.step === "done" && <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />}
                      {item.step === "erro" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                      {(item.step === "analisando" || item.step === "importando") && <Loader2 className="h-4 w-4 shrink-0 text-indigo-600 animate-spin" />}
                      {(item.step === "aguardando" || item.step === "preview") && <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />}

                      <span className="text-sm font-medium flex-1 truncate" title={item.file.name}>{item.file.name}</span>

                      {item.step === "aguardando"  && <Badge variant="outline" className="text-[10px]">Aguardando</Badge>}
                      {item.step === "analisando"  && <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">Analisando…</Badge>}
                      {item.step === "preview" && item.preview && (
                        <Badge className="bg-amber-100 text-amber-700 text-[10px]">{item.preview.novos ?? item.preview.total} novos</Badge>
                      )}
                      {item.step === "importando"  && <Badge className="bg-blue-100 text-blue-700 text-[10px]">Importando…</Badge>}
                      {item.step === "done" && item.resultado && (
                        <Badge className="bg-green-100 text-green-700 text-[10px]">
                          {item.resultado.inseridos} inseridos · {item.resultado.ignorados} ignorados
                        </Badge>
                      )}
                      {item.step === "erro" && <Badge className="bg-red-100 text-red-700 text-[10px]">Erro</Badge>}

                      {!importRunning && item.step !== "done" && (
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeFile(idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {item.step === "erro" && item.erro && (
                      <p className="text-xs text-red-600 mt-1.5 ml-6 break-words">{item.erro}</p>
                    )}

                    {item.step === "preview" && item.preview && (
                      <div className="mt-2 ml-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span><strong className="text-foreground">{item.preview.total}</strong> identificados</span>
                        {item.preview.novos != null && <span className="text-green-700 font-medium">{item.preview.novos} novos</span>}
                        {item.preview.duplicados > 0 && <span className="text-amber-700">{item.preview.duplicados} duplicados</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Resumo final */}
            {allDone && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex flex-wrap items-center gap-4">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">Importação concluída!</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    {queueTotals.novos} inseridos · {queueTotals.ignorados} ignorados (dedup)
                    {queueTotals.erros > 0 && ` · ${queueTotals.erros} arquivo(s) com erro`}
                    {importClienteNome && ` · vinculados a ${importClienteNome}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Barra de progresso (Regra de Ouro) */}
          {(importRunning || importProgress > 0) && (
            <div className="px-6 pb-2 pt-1 shrink-0 border-t">
              <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-right tabular-nums">{importProgress}%</p>
            </div>
          )}

          {/* Rodapé */}
          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
            <Button variant="outline" onClick={fecharImport} disabled={importRunning}>
              {allDone ? "Fechar" : "Cancelar"}
            </Button>

            {/* Fase 1: Analisar arquivos (dry-run, sem gravar) */}
            {!allDone && hasPending && (
              <Button
                onClick={executarPreview}
                disabled={importRunning}
                className="relative overflow-hidden bg-indigo-600 hover:bg-indigo-700 text-white min-w-[160px]"
              >
                {importRunning && (
                  <span className="absolute inset-y-0 left-0 bg-white/15 transition-all duration-300 pointer-events-none"
                    style={{ width: `${importProgress}%` }} />
                )}
                <span className="relative flex items-center gap-2">
                  {importRunning
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando… {importProgress}%</>
                    : <><FileSpreadsheet className="h-4 w-4" /> Analisar {importQueue.filter(i => i.step === "aguardando").length} arquivo(s)</>
                  }
                </span>
              </Button>
            )}

            {/* Fase 2: Confirmar importação (grava — só aparece após o usuário revisar os totais) */}
            {!allDone && allPreviewed && (
              <Button
                onClick={executarConfirmar}
                disabled={importRunning}
                className="relative overflow-hidden bg-green-600 hover:bg-green-700 text-white min-w-[200px]"
              >
                {importRunning && (
                  <span className="absolute inset-y-0 left-0 bg-white/15 transition-all duration-300 pointer-events-none"
                    style={{ width: `${importProgress}%` }} />
                )}
                <span className="relative flex items-center gap-2">
                  {importRunning
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando… {importProgress}%</>
                    : <><Upload className="h-4 w-4" /> Confirmar importação ({previewNovos} novos)</>
                  }
                </span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
          Dialog: Cadastro manual de cheque
      ════════════════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setFormEdit(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] p-0 gap-0 overflow-hidden max-h-[92dvh] flex flex-col">

          {/* ── Cabeçalho colorido ── */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 bg-gradient-to-r from-green-50 to-emerald-50 border-b">
            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
              <Banknote className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold leading-tight">
                {formEdit ? "Editar cheque recebido" : "Lançar cheque recebido"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Nº e valor são obrigatórios · demais campos são opcionais</p>
            </div>
          </div>

          {/* ── Corpo com scroll ── */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

            {/* Bloco 1 — Identificação */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Identificação</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Nº do Cheque <span className="text-red-500">*</span></Label>
                  <Input value={form.numeroCheque} onChange={e => setForm(f => ({ ...f, numeroCheque: e.target.value }))} placeholder="000123" className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Valor <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                    <Input className="pl-9 h-10 tabular-nums" inputMode="decimal" placeholder="0,00"
                      value={form.valorMask}
                      onChange={e => setForm(f => ({ ...f, valorMask: maskBRL(e.target.value) }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 2 — Origem */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Origem</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-purple-500" /> Cliente
                    <span className="font-normal text-muted-foreground text-xs">(quem pagou com este cheque)</span>
                  </Label>
                  <ClienteSelect
                    clientes={clientes}
                    value={form.clienteId}
                    onChange={(id, nome) => setForm(f => ({ ...f, clienteId: id, clienteNome: nome ?? "" }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Emitente
                    <span className="font-normal text-muted-foreground text-xs ml-1">(quem assinou o cheque)</span>
                  </Label>
                  <Input className="h-10" value={form.emitenteNome} onChange={e => setForm(f => ({ ...f, emitenteNome: e.target.value }))} placeholder="Nome do emitente" />
                </div>
              </div>
            </div>

            {/* Bloco 3 — Dados bancários */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Dados bancários</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Banco</Label>
                  <Input className="h-10" value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex.: Bradesco, Itaú, Caixa..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Agência</Label>
                    <Input className="h-10" value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Conta</Label>
                    <Input className="h-10" value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 4 — Datas */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">Datas</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Emissão</Label>
                  <Input type="date" className="h-10" value={form.dataEmissao} onChange={e => setForm(f => ({ ...f, dataEmissao: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Bom para</Label>
                  <Input type="date" className="h-10" value={form.dataBomPara} onChange={e => setForm(f => ({ ...f, dataBomPara: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Bloco 5 — Observação */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Observação</Label>
              <Textarea className="resize-none text-sm" rows={2} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Como foi recebido, quem trouxe, etc." />
            </div>

          </div>

          {/* ── Rodapé fixo ── */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50/80">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="min-w-[90px]">Cancelar</Button>
            <Button onClick={handleSalvar} disabled={criarMut.isPending || atualizarMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white min-w-[130px]">
              {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {formEdit ? "Salvar alterações" : "Cadastrar cheque"}
            </Button>
          </div>

        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
          AlertDialog: Confirmar exclusão
      ════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!excluirId} onOpenChange={(o) => { if (!o) setExcluirId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este cheque?</AlertDialogTitle>
            <AlertDialogDescription>
              O cheque será removido do controle. Esta ação não afeta lançamentos financeiros vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => excluirId && excluirMut.mutate({ id: excluirId, companyId })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
          AlertDialog: Limpar totalizadores inválidos (Rev. 4103)
      ════════════════════════════════════════════════════════ */}
      <AlertDialog open={limparTotOpen} onOpenChange={o => { if (!o) setLimparTotOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-700">Remover registros inválidos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove (soft-delete) todos os cheques cujo número seja um totalizador de planilha —
              <strong> TOTAL, SUBTOTAL, SOMA, GERAL</strong> etc. — importados erroneamente antes do fix.
              Os cheques reais <strong>não são afetados</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limparTotMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={limparTotMut.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => limparTotMut.mutate({ companyId })}
            >
              {limparTotMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Removendo…</>
                : "Sim, remover inválidos"
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
          AlertDialog: Limpar todos (admin_master)
      ════════════════════════════════════════════════════════ */}
      <AlertDialog open={limparOpen} onOpenChange={o => { if (!o) setLimparOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Limpar todos os registros?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá <strong>excluir permanentemente</strong> todos os cheques recebidos desta empresa.
              Os dados não poderão ser recuperados. Use apenas para reimportar uma planilha do zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limparTodosMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={limparTodosMut.isPending}
              className="bg-red-600 hover:bg-red-700"
              onClick={() => limparTodosMut.mutate({ companyId })}
            >
              {limparTodosMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Excluindo…</>
                : "Sim, excluir tudo"
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
          Dialog: Drilldown do cheque alocado
      ════════════════════════════════════════════════════════ */}
      <Dialog open={!!alocDrilldown} onOpenChange={(o) => { if (!o) setAlocDrilldown(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cheque alocado</DialogTitle>
          </DialogHeader>
          {alocDrilldown && (
            <div className="space-y-3 py-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nº Cheque</span>
                <span className="font-mono font-semibold">{alocDrilldown.numero_cheque}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-semibold">{formatBRL(Number(alocDrilldown.valor))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium text-purple-700">{alocDrilldown.cliente_nome || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Emitente</span>
                <span>{alocDrilldown.emitente_nome || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fornecedor alocado</span>
                <span className="font-medium text-blue-700">{alocDrilldown.fornecedor_alocado_nome || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bom para</span>
                <span>{fmtData(alocDrilldown.data_bom_para)}</span>
              </div>
              {alocDrilldown.compensado_em && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Compensado em</span>
                  <span className="font-medium text-teal-700">{fmtData(alocDrilldown.compensado_em)}</span>
                </div>
              )}
              {alocDrilldown.entry_data && (
                <>
                  <div className="border-t border-border pt-2 mt-1" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data do pagamento</span>
                    <span className="font-medium">{fmtData(alocDrilldown.entry_data)}</span>
                  </div>
                  {alocDrilldown.entry_valor != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor do pagamento</span>
                      <span className="font-semibold">{formatBRL(Number(alocDrilldown.entry_valor))}</span>
                    </div>
                  )}
                  {alocDrilldown.entry_referencia && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Referência</span>
                      <span className="font-mono text-xs break-all">{alocDrilldown.entry_referencia}</span>
                    </div>
                  )}
                  {alocDrilldown.entry_descricao && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground shrink-0">Descrição</span>
                      <span className="text-right break-words">{alocDrilldown.entry_descricao}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlocDrilldown(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

export default function FinanceiroChequesRecebidos() {
  return <DashboardLayout><FinanceiroChequesRecebidosContent /></DashboardLayout>;
}
