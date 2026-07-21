import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import {
  CalendarDays, BookOpen, Megaphone, Plus, Trash2, Pencil, Users, FileSignature,
  ClipboardCheck, Check, X as XIcon, ChevronRight, Sparkles, MapPin, UserCheck,
  ChevronDown, ChevronUp, Search, Wand2, Loader2, PenLine, Eraser, BarChart3,
  Filter, FileDown, FolderDown, CalendarRange, Building2,
} from "lucide-react";
// Rev. 1960 — Catálogo de áreas temáticas (sub-classificação dos temas DDS).
import { DDS_AREAS, DDS_AREA_VALUES } from "../../../../shared/ddsAreas";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
// Rev. 1746 — Pad de assinatura digital (canvas) usado no DDS.
// Funciona com touch (iPad/celular) e mouse. Salva como PNG dataURL.
function AssinaturaPad({
  open, onOpenChange, funcionarioNome, funcionarioId, sessaoId, companyId,
  temAssinaturaPrevia, salvarMut, removerMut, podeEditar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funcionarioNome: string;
  funcionarioId: number;
  sessaoId: number;
  companyId: number;
  temAssinaturaPrevia: boolean;
  salvarMut: any;
  removerMut: any;
  podeEditar: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [vazio, setVazio] = useState(true);
  const { confirm, ConfirmDialog } = useConfirm();

  // Rev. 1748 — busca a imagem da assinatura sob demanda (não vem mais no getSessao)
  const imgQ = trpc.dds.getAssinaturaImg.useQuery(
    { companyId, sessaoId, funcionarioId },
    { enabled: open && temAssinaturaPrevia, staleTime: 0 },
  );

  // Inicializa canvas: limpa e (se houver imagem prévia) renderiza ela
  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // hi-DPI: dimensiona o backing buffer pelo devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    const imgInicial = imgQ.data?.assinaturaImg;
    if (imgInicial) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, cssW, cssH);
        setVazio(false);
      };
      img.src = imgInicial;
    } else {
      setVazio(true);
    }
  }, [open, imgQ.data?.assinaturaImg]);

  const getPos = (ev: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    if (!podeEditar) return;
    ev.preventDefault();
    (ev.target as Element).setPointerCapture(ev.pointerId);
    drawingRef.current = true;
    lastRef.current = getPos(ev);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const p = getPos(ev);
    const last = lastRef.current!;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    setVazio(false);
  };
  const onPointerUp = () => { drawingRef.current = false; lastRef.current = null; };

  const limpar = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    setVazio(true);
  };

  const salvar = async () => {
    const c = canvasRef.current;
    if (!c || vazio) { toast.error("Desenhe a assinatura antes de salvar."); return; }
    const dataUrl = c.toDataURL("image/png");
    try {
      await salvarMut.mutateAsync({ companyId, sessaoId, funcionarioId, assinaturaImg: dataUrl });
      toast.success("Assinatura registrada.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar assinatura.");
    }
  };

  const remover = async () => {
    if (!(await confirm({
      title: "Remover assinatura?",
      description: `A assinatura digital de ${funcionarioNome} será apagada da sessão. Você pode coletar uma nova depois.`,
      tone: "destructive",
      confirmText: "Remover",
    }))) return;
    try {
      await removerMut.mutateAsync({ companyId, sessaoId, funcionarioId });
      toast.success("Assinatura removida.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao remover.");
    }
  };

  return (
    <>
    {ConfirmDialog}
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4" /> Assinatura — {funcionarioNome}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {podeEditar
              ? "Assine no quadro abaixo usando o dedo (iPad/celular) ou o mouse. A assinatura é salva como imagem na lista de presença."
              : "Sessão finalizada — visualização apenas. Reabra a sessão pra alterar."}
          </p>
          <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white touch-none select-none">
            <canvas
              ref={canvasRef}
              className="w-full h-56 cursor-crosshair touch-none rounded-lg"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <div className="text-[10px] text-slate-400 text-center">— assine acima da linha —</div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {podeEditar && (
            <Button variant="outline" size="sm" onClick={limpar}>
              <Eraser className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
          {temAssinaturaPrevia && podeEditar && (
            <Button variant="outline" size="sm" onClick={remover}
              disabled={removerMut.isPending}
              className="text-red-600 hover:bg-red-50 border-red-200">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover assinatura
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          {podeEditar && (
            <Button size="sm" onClick={salvar} disabled={salvarMut.isPending || vazio}>
              {salvarMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Salvar assinatura
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// Rev. 1740 — Renderer leve de markdown (## Header, **bold**, listas) pros roteiros
// detalhados. Não usa biblioteca pra evitar peso — formato é controlado pelo seed/IA.
function RoteiroMd({ md, className = "" }: { md: string; className?: string }) {
  const lines = md.split("\n");
  const blocks: React.ReactNode[] = [];
  let curList: string[] | null = null;
  let listType: "ul" | "ol" | null = null;

  const inline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="text-slate-900 font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>);
  };

  const flushList = () => {
    if (!curList) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={`${listType === "ol" ? "list-decimal" : "list-disc"} pl-5 space-y-1 mb-2`}>
        {curList.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>
    );
    curList = null; listType = null;
  };

  for (const raw of lines) {
    const ln = raw.trimEnd();
    const h = ln.match(/^##\s+(.+)$/);
    const bul = ln.match(/^[-•]\s+(.+)$/);
    const ord = ln.match(/^\d+\.\s+(.+)$/);
    if (h) {
      flushList();
      blocks.push(<h4 key={`h-${blocks.length}`} className="font-bold text-slate-800 text-sm mt-3 first:mt-0 mb-1 uppercase tracking-wide">{inline(h[1])}</h4>);
    } else if (bul) {
      if (listType !== "ul") { flushList(); listType = "ul"; curList = []; }
      curList!.push(bul[1]);
    } else if (ord) {
      if (listType !== "ol") { flushList(); listType = "ol"; curList = []; }
      curList!.push(ord[1]);
    } else if (ln.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={`p-${blocks.length}`} className="mb-2 leading-relaxed">{inline(ln)}</p>);
    }
  }
  flushList();

  return <div className={`text-sm text-slate-700 ${className}`}>{blocks}</div>;
}

// Rev. 1730 — máscara CPF no input do instrutor
function maskCpf(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Rev. 1730 — histórico de locais usados (até 8) por empresa
const LOCAIS_LS_KEY = (cid: number) => `dds:recentLocais:${cid}`;
function getRecentLocais(cid: number): string[] {
  try { return JSON.parse(localStorage.getItem(LOCAIS_LS_KEY(cid)) || "[]"); } catch { return []; }
}
function pushRecentLocal(cid: number, local: string) {
  if (!local || local.trim().length < 2) return;
  const cur = getRecentLocais(cid).filter(l => l.toLowerCase() !== local.toLowerCase());
  cur.unshift(local.trim());
  localStorage.setItem(LOCAIS_LS_KEY(cid), JSON.stringify(cur.slice(0, 8)));
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const COR_CLASSES: Record<string, { bg: string; text: string; border: string; chip: string }> = {
  branco:   { bg: "bg-slate-50",   text: "text-slate-800",   border: "border-slate-300",   chip: "bg-slate-200 text-slate-800" },
  laranja:  { bg: "bg-orange-50",  text: "text-orange-800",  border: "border-orange-300",  chip: "bg-orange-500 text-white" },
  lilas:    { bg: "bg-purple-50",  text: "text-purple-800",  border: "border-purple-300",  chip: "bg-purple-500 text-white" },
  verde:    { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-300", chip: "bg-emerald-500 text-white" },
  amarelo:  { bg: "bg-amber-50",   text: "text-amber-900",   border: "border-amber-300",   chip: "bg-amber-400 text-amber-950" },
  vermelho: { bg: "bg-red-50",     text: "text-red-800",     border: "border-red-300",     chip: "bg-red-500 text-white" },
  rosa:     { bg: "bg-pink-50",    text: "text-pink-800",    border: "border-pink-300",    chip: "bg-pink-500 text-white" },
  azul:     { bg: "bg-blue-50",    text: "text-blue-800",    border: "border-blue-300",    chip: "bg-blue-500 text-white" },
};
function corCfg(c?: string | null) {
  return COR_CLASSES[(c ?? "").toLowerCase()] ?? { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-300", chip: "bg-slate-300 text-slate-900" };
}

// ─── Helpers para agrupamento por semana ─────────────────────────────────────
const MESES_PT_BR = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function getWeekOfYear(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

// ─── Componente SessoesList — design moderno ─────────────────────────────────
function SessoesList({
  sessoes, companyId, selecionadasIds, setSelecionadasIds, toggleSelecionada,
  setSelectedSessaoId, setEditarCategoriaId, abrirNovaSessao,
  excluirSessaoMut, excluirSessoesMut, confirm,
  buscaSessoes, setBuscaSessoes, filtroObraSessoes, setFiltroObraSessoes,
  baixandoLote, setBaixandoLote, loteProgress, setLoteProgress,
}: {
  sessoes: any[]; companyId: number;
  selecionadasIds: Set<number>; setSelecionadasIds: (s: Set<number>) => void;
  toggleSelecionada: (id: number) => void;
  setSelectedSessaoId: (id: number) => void;
  setEditarCategoriaId: (id: number) => void;
  abrirNovaSessao: () => void;
  excluirSessaoMut: any; excluirSessoesMut: any; confirm: any;
  buscaSessoes: string; setBuscaSessoes: (s: string) => void;
  filtroObraSessoes: string; setFiltroObraSessoes: (s: string) => void;
  baixandoLote: boolean; setBaixandoLote: (b: boolean) => void;
  loteProgress: number; setLoteProgress: (n: number) => void;
}) {
  const obrasUnicas = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessoes) if (s.obraNome) m.set(s.obraNome, s.obraNome);
    return Array.from(m.values()).sort();
  }, [sessoes]);

  const sessoesFiltradas = useMemo(() => {
    let l = sessoes;
    if (buscaSessoes.trim()) {
      const q = buscaSessoes.toLowerCase();
      l = l.filter((s) => s.tituloTema?.toLowerCase().includes(q) || s.obraNome?.toLowerCase().includes(q) || s.instrutor?.toLowerCase().includes(q));
    }
    if (filtroObraSessoes) l = l.filter((s) => s.obraNome === filtroObraSessoes);
    return l;
  }, [sessoes, buscaSessoes, filtroObraSessoes]);

  const grupos = useMemo(() => {
    const m = new Map<string, { key: string; label: string; ano: number; mes: number; semana: number; itens: any[] }>();
    for (const s of sessoesFiltradas) {
      const ds = String(s.data || "").slice(0, 10);
      let key = "sem-data", label = "Sem data", ano = 0, mes = 0, semana = 0;
      if (ds.length === 10) {
        const d = new Date(ds + "T12:00:00");
        ano = d.getFullYear(); mes = d.getMonth(); semana = getWeekOfYear(ds);
        key = `${ano}-${String(mes).padStart(2,"0")}-s${String(semana).padStart(2,"0")}`;
        label = `Semana ${String(semana).padStart(2,"0")} · ${MESES_PT_BR[mes]} ${ano}`;
      }
      if (!m.has(key)) m.set(key, { key, label, ano, mes, semana, itens: [] });
      m.get(key)!.itens.push(s);
    }
    return Array.from(m.values()).sort((a, b) => b.ano - a.ano || b.mes - a.mes || b.semana - a.semana);
  }, [sessoesFiltradas]);

  // KPIs rápidos
  const kpis = useMemo(() => {
    const total = sessoesFiltradas.length;
    const finalizadas = sessoesFiltradas.filter((s) => s.status === "finalizada").length;
    const presentes = sessoesFiltradas.reduce((acc: number, s: any) => acc + (s.presentes || 0), 0);
    const assinados = sessoesFiltradas.reduce((acc: number, s: any) => acc + (s.assinados || 0), 0);
    return { total, finalizadas, presentes, assinados };
  }, [sessoesFiltradas]);

  async function baixarLote() {
    const ids = Array.from(selecionadasIds);
    if (!ids.length) return;
    setBaixandoLote(true);
    setLoteProgress(0);

    // Progresso simulado: sobe de 0 → 85% enquanto o servidor gera o ZIP
    // (~1.2s por sessão estimado). Fase não-determinística.
    let pct = 0;
    const total = ids.length;
    const stepMs = Math.max(200, Math.min(600, (total * 1200) / 85));
    const timer = setInterval(() => {
      pct = Math.min(pct + 1, 85);
      setLoteProgress(pct);
    }, stepMs);

    try {
      const resp = await fetch("/api/dds-ata-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ids }),
        credentials: "include",
      });
      clearInterval(timer);
      if (!resp.ok) {
        let errMsg = "Falha ao gerar os PDFs em lote";
        try { const j = await resp.json(); errMsg = j.error || errMsg; } catch {}
        toast.error(errMsg); return;
      }
      setLoteProgress(95);
      const blob = await resp.blob();
      setLoteProgress(100);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `DDS_${new Date().getFullYear()}_atas.zip`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
      toast.success("ZIP baixado com sucesso!");
    } catch (e: any) {
      clearInterval(timer);
      const msg = String(e?.message ?? "");
      if (msg === "Load failed" || msg === "Failed to fetch") {
        toast.error("Falha de rede. Verifique a conexão e tente novamente.");
      } else {
        toast.error(msg || "Erro ao baixar ZIP");
      }
    } finally {
      clearInterval(timer);
      setTimeout(() => { setBaixandoLote(false); setLoteProgress(0); }, 800);
    }
  }

  // Helpers de estilo por status
  const statusConfig = (status: string) => ({
    finalizada: { border: "border-l-emerald-500", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Finalizada" },
    cancelada:  { border: "border-l-rose-400",    dot: "bg-rose-400",    badge: "bg-rose-50 text-rose-700 ring-rose-200",     label: "Cancelada" },
    aberta:     { border: "border-l-amber-400",    dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 ring-amber-200",   label: "Aberta" },
  } as any)[status] ?? { border: "border-l-slate-300", dot: "bg-slate-400", badge: "bg-slate-50 text-slate-600 ring-slate-200", label: status };

  const catCfg = (cat: string | null) => ({
    NR:       { cls: "bg-blue-50 text-blue-700 ring-blue-200",     label: "NR" },
    CAMPANHA: { cls: "bg-amber-50 text-amber-700 ring-amber-200",   label: "Campanha" },
    VACINACAO:{ cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Vacinação" },
    LIVRE:    { cls: "bg-slate-100 text-slate-600 ring-slate-200",  label: "Livre" },
  } as any)[cat ?? ""] ?? null;

  const tudo = sessoesFiltradas.length > 0 && selecionadasIds.size === sessoesFiltradas.length;

  return (
    <div className="relative pb-20">

      {/* ══ TOOLBAR SUPERIOR ══ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-5">
        {/* Nova sessão */}
        <button
          type="button"
          onClick={() => abrirNovaSessao()}
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Nova sessão
        </button>

        {/* Busca + filtro obra */}
        <div className="flex gap-2 flex-1 flex-wrap sm:justify-end">
          <div className="relative flex-1 min-w-[190px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={buscaSessoes}
              onChange={(e) => setBuscaSessoes(e.target.value)}
              placeholder="Buscar tema, obra, instrutor…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 placeholder:text-slate-400"
            />
            {buscaSessoes && (
              <button type="button" onClick={() => setBuscaSessoes("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {obrasUnicas.length > 0 && (
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={filtroObraSessoes}
                onChange={(e) => setFiltroObraSessoes(e.target.value)}
                className="pl-8 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 appearance-none min-w-[150px]"
              >
                <option value="">Todas as obras</option>
                {obrasUnicas.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* ══ KPIs RÁPIDOS ══ */}
      {sessoesFiltradas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Sessões", value: kpis.total, color: "text-slate-800" },
            { label: "Finalizadas", value: `${kpis.finalizadas} / ${kpis.total}`, color: "text-emerald-700" },
            { label: "Presenças", value: kpis.presentes, color: "text-blue-700" },
            { label: "Assinaturas", value: kpis.assinados, color: "text-violet-700" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
              <div className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══ SELEÇÃO GLOBAL ══ */}
      {sessoesFiltradas.length > 0 && (
        <label className="inline-flex items-center gap-2 text-xs text-slate-500 mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300 accent-slate-800"
            checked={tudo}
            onChange={(e) => setSelecionadasIds(e.target.checked ? new Set(sessoesFiltradas.map((s: any) => s.id)) : new Set())}
          />
          {tudo ? "Desmarcar todas" : `Selecionar todas (${sessoesFiltradas.length})`}
        </label>
      )}

      {/* ══ VAZIO ══ */}
      {sessoesFiltradas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            {buscaSessoes || filtroObraSessoes
              ? <Search className="h-7 w-7 opacity-50" />
              : <CalendarRange className="h-7 w-7 opacity-50" />}
          </div>
          <p className="text-sm font-medium text-slate-500">
            {buscaSessoes || filtroObraSessoes ? "Nenhuma sessão encontrada" : "Nenhuma sessão registrada ainda"}
          </p>
          {!buscaSessoes && !filtroObraSessoes && (
            <button type="button" onClick={() => abrirNovaSessao()} className="mt-4 text-sm font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900">
              Criar primeira sessão
            </button>
          )}
        </div>
      )}

      {/* ══ GRUPOS POR SEMANA ══ */}
      <div className="space-y-8">
        {grupos.map((grupo) => (
          <div key={grupo.key}>
            {/* Cabeçalho da semana */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-[11px] font-bold px-3 py-1 rounded-full tracking-wide">
                  <CalendarRange className="h-3 w-3" />
                  {grupo.label}
                </span>
                <span className="text-xs text-slate-400 font-medium">{grupo.itens.length} sessão{grupo.itens.length > 1 ? "ões" : ""}</span>
              </div>
              <div className="flex-1 h-px bg-slate-150 bg-slate-200" />
            </div>

            {/* Timeline de cards */}
            <div className="relative pl-6">
              {/* Linha vertical da timeline */}
              <div className="absolute left-[9px] top-3 bottom-3 w-px bg-gradient-to-b from-slate-300 via-slate-200 to-transparent" />

              <div className="space-y-3">
                {grupo.itens.map((s: any, idx: number) => {
                  const sel = selecionadasIds.has(s.id);
                  const cat = (s.categoria ?? s.categoriaTema ?? null) as string | null;
                  const sc = statusConfig(s.status);
                  const cc = catCfg(cat);
                  const ds = String(s.data || "").slice(0, 10);
                  const dateObj = ds.length === 10 ? new Date(ds + "T12:00:00") : null;
                  const dia = dateObj ? String(dateObj.getDate()).padStart(2, "0") : "—";
                  const semPt = dateObj ? dateObj.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "") : "";
                  const pct = s.totalParticipantes > 0 ? Math.round((s.presentes / s.totalParticipantes) * 100) : 0;

                  return (
                    <div key={s.id} className="relative flex gap-3 group">
                      {/* Ponto da timeline */}
                      <div className={`absolute -left-6 mt-[18px] w-[19px] h-[19px] rounded-full border-2 border-white shadow flex items-center justify-center flex-shrink-0 z-10 transition-transform group-hover:scale-110 ${sc.dot} ${sel ? "scale-110 ring-2 ring-offset-1 ring-slate-400" : ""}`} />

                      {/* Card */}
                      <div
                        className={`flex-1 bg-white rounded-2xl border-l-4 border border-slate-100 shadow-sm transition-all duration-200 overflow-hidden
                          ${sc.border}
                          ${sel ? "ring-2 ring-slate-400 ring-offset-1 shadow-md" : "hover:shadow-md hover:border-slate-200"}
                        `}
                      >
                        {/* ── Cabeçalho do card ── */}
                        <div className="flex items-stretch">
                          {/* Bloco data */}
                          <div className="flex flex-col items-center justify-center px-4 py-3 border-r border-slate-100 bg-slate-50/60 min-w-[56px]">
                            <span className="text-2xl font-black text-slate-800 leading-none">{dia}</span>
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{semPt}</span>
                            {s.hora && <span className="text-[10px] text-slate-400 mt-1">{s.hora}</span>}
                          </div>

                          {/* Conteúdo principal */}
                          <div className="flex-1 px-4 py-3 min-w-0">
                            {/* Linha: status + categoria + PDF */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${sc.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} opacity-80`} />
                                {sc.label}
                              </span>
                              {cc && (
                                <button
                                  type="button"
                                  onClick={() => setEditarCategoriaId(s.id)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 transition hover:brightness-95 ${cc.cls}`}
                                  title="Editar categoria"
                                >
                                  {cc.label} <Pencil className="h-2.5 w-2.5 opacity-60" />
                                </button>
                              )}
                              {/* PDF — aparece sempre no cabeçalho */}
                              <button
                                type="button"
                                title="Baixar PDF / Ata"
                                className="ml-auto flex-shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 rounded-full px-2.5 py-0.5 transition"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (async () => {
                                    try {
                                      const resp = await fetch(`/api/dds-ata/${s.id}?companyId=${companyId}`);
                                      if (!resp.ok) throw new Error("Erro ao gerar PDF");
                                      const blob = await resp.blob();
                                      const u = URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = u; a.download = `DDS_Ata_${s.id}.pdf`;
                                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                      setTimeout(() => URL.revokeObjectURL(u), 1000);
                                    } catch { toast.error("Erro ao baixar PDF"); }
                                  })();
                                }}
                              >
                                <FileDown className="h-3 w-3" /> PDF
                              </button>
                            </div>

                            {/* Título do tema */}
                            <p
                              className="font-bold text-slate-900 text-sm sm:text-[15px] leading-snug cursor-pointer hover:text-blue-700 transition-colors line-clamp-2"
                              onClick={() => setSelectedSessaoId(s.id)}
                            >
                              {s.tituloTema}
                            </p>

                            {/* Obra + instrutor */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {s.obraNome && (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                                  <Building2 className="h-2.5 w-2.5" /> {s.obraNome}
                                </span>
                              )}
                              {s.instrutor && (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                                  <UserCheck className="h-2.5 w-2.5" /> {s.instrutor}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Checkbox (lado direito) */}
                          <div className="flex items-start px-3 pt-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 accent-slate-800 w-4 h-4"
                              checked={sel}
                              onChange={() => toggleSelecionada(s.id)}
                              aria-label={`Selecionar sessão ${s.id}`}
                            />
                          </div>
                        </div>

                        {/* ── Rodapé do card ── */}
                        <div className="flex items-center gap-3 px-4 pb-3 pt-2 border-t border-slate-100">
                          {/* Barra de presença */}
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden max-w-[80px]">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap">
                              <span className="font-bold text-emerald-700">{s.presentes}</span>/{s.totalParticipantes} presentes
                            </span>
                            {s.assinados > 0 && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-violet-600">
                                <FileSignature className="h-3 w-3" /> {s.assinados}
                              </span>
                            )}
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedSessaoId(s.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition"
                            >
                              <PenLine className="h-3 w-3" />
                              <span className="hidden sm:inline">Abrir</span>
                            </button>
                            <button
                              type="button"
                              disabled={excluirSessaoMut.isPending}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = await confirm({
                                  title: "Excluir sessão DDS?",
                                  description: `"${s.tituloTema}"${s.data ? ` — ${new Date(s.data + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}.\nPresença e assinaturas serão removidas.`,
                                  tone: "destructive", confirmText: "Excluir sessão",
                                });
                                if (!ok) return;
                                try { await excluirSessaoMut.mutateAsync({ companyId, id: s.id }); }
                                catch (_) {}
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg px-2.5 py-1.5 transition"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ══ BARRA FLUTUANTE DE SELEÇÃO ══ */}
      {selecionadasIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-2 bg-slate-900/95 backdrop-blur-xl text-white px-4 py-2.5 rounded-2xl shadow-2xl ring-1 ring-white/10">
            <span className="text-sm font-bold pr-2 border-r border-white/20">
              {selecionadasIds.size} selecionada{selecionadasIds.size > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => setSelecionadasIds(new Set())}
              className="text-xs text-slate-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-white/10"
            >
              Limpar
            </button>
            <button
              type="button"
              disabled={baixandoLote}
              onClick={baixarLote}
              className="relative inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-80 overflow-hidden min-w-[110px] justify-center"
            >
              {baixandoLote && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300"
                  style={{ width: `${loteProgress}%` }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {baixandoLote
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando… {loteProgress}%</>
                  : <><FolderDown className="h-3.5 w-3.5" /> Baixar ZIP</>}
              </span>
            </button>
            <button
              type="button"
              disabled={excluirSessoesMut.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Excluir ${selecionadasIds.size} sessão${selecionadasIds.size > 1 ? "ões" : ""}?`,
                  description: "Presença e assinaturas serão removidas. Sem volta.",
                  tone: "destructive", confirmText: "Excluir tudo",
                });
                if (!ok) return;
                excluirSessoesMut.mutate({ companyId, ids: Array.from(selecionadasIds) });
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-60"
            >
              {excluirSessoesMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Excluir</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DDSGuia() {
  // Rev. 1728: useCompany().selectedCompanyId é STRING — converter pra number antes de mandar pro tRPC
  const { selectedCompanyId, selectedCompany } = useCompany() as any;
  const companyId = parseInt(selectedCompanyId || "0") || 0;
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  // Rev. 1730 — usuário logado para auto-fill do instrutor
  const { user } = useAuth() as any;
  // Rev. 1773 — confirm bonito (sem confirm() nativo do navegador)
  const { confirm, ConfirmDialog } = useConfirm();

  const [tab, setTab] = useState<"calendario" | "biblioteca" | "sessoes">("calendario");
  // Rev. 1736 — Calendário por ano: padrão = ano atual mostrando só os meses pendentes (mês atual em diante).
  // Próximos anos abrem com TODOS os meses. Toggle "Ver todas" mostra os 12 meses do ano selecionado.
  const anoAtual = new Date().getFullYear();
  const mesAtualNum = new Date().getMonth() + 1;
  const [calendarioAno, setCalendarioAno] = useState<number>(anoAtual);
  const [verTodasCampanhas, setVerTodasCampanhas] = useState<boolean>(false);

  // ===== queries
  const calendarioQ = trpc.dds.calendarioAnual.useQuery({ companyId }, { enabled: !!companyId });
  const temasQ = trpc.dds.listTemas.useQuery({ companyId }, { enabled: !!companyId });
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [filtroMes, setFiltroMes] = useState<number | null>(null);
  const sessoesPorMesQ = trpc.dds.sessoesPorMes.useQuery(
    { companyId, ano: filtroAno },
    { enabled: !!companyId },
  );
  const sessoesMesStatus = useMemo(() => {
    const out: Record<number, "data" | "consolidated" | "none"> = {};
    for (let m = 1; m <= 12; m++) out[m] = "none";
    for (const r of sessoesPorMesQ.data ?? []) {
      if (r.total === 0) out[r.mes] = "none";
      else if (r.finalizadas === r.total) out[r.mes] = "consolidated";
      else out[r.mes] = "data";
    }
    return out;
  }, [sessoesPorMesQ.data]);
  const sessoesQ = trpc.dds.listSessoes.useQuery(
    { companyId, ano: filtroAno, mes: filtroMes ?? undefined },
    { enabled: !!companyId },
  );

  // ===== mutations gerais
  const seedMut = trpc.dds.seedTemasPadrao.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.inseridos} tema(s) adicionado(s) à biblioteca`);
      utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 1729 — campanhas oficiais de vacinação PNI/MS 2026 (Lei 15.377/2026)
  const seedVacMut = trpc.dds.seedVacinacaoPNI.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.inseridos} campanha(s) de vacinação carregada(s)`);
      utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 1740 — enriquecer roteiros detalhados nos temas padrão já cadastrados
  const enriquecerMut = trpc.dds.enriquecerTemasPadrao.useMutation({
    onSuccess: (r) => {
      if (r.atualizados === 0) toast.info("Todos os temas já tinham roteiro detalhado.");
      else toast.success(`${r.atualizados} tema(s) enriquecido(s) com roteiro detalhado.`);
      utils.dds.listTemas.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 1740 — gerar roteiro com IA (usado em Biblioteca, Nova Sessão modal e Detalhe da Sessão)
  const gerarIAMut = trpc.dds.gerarRoteiroComIA.useMutation();

  // Rev. 1953 — gerar LOTE de novos temas com IA (expande biblioteca além das NRs/campanhas padrão)
  // Rev. 1954.1 — progresso estimado 0-100% (chamada é única sem streaming; aproximamos pelo
  // tempo decorrido contra ETA = qtd * 1.5s, com curva log para chegar suavemente em 95% no fim
  // do ETA e travar até a resposta real — então salta pra 100%).
  const [gerarMaisOpen, setGerarMaisOpen] = useState(false);
  const [gerarMaisQtd, setGerarMaisQtd] = useState<number>(20);
  const [gerarMaisFoco, setGerarMaisFoco] = useState<string>("");
  const [gerarMaisProgress, setGerarMaisProgress] = useState<number>(0);
  const gerarMaisStartedAt = useRef<number>(0);
  const gerarMaisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopGerarMaisTimer = () => {
    if (gerarMaisTimerRef.current) { clearInterval(gerarMaisTimerRef.current); gerarMaisTimerRef.current = null; }
  };
  const gerarMaisMut = trpc.dds.gerarMaisTemasIA.useMutation({
    onMutate: () => {
      // inicia cronômetro + barra; ETA estimado = qtd * 1500ms (cap 95% até resposta real)
      gerarMaisStartedAt.current = Date.now();
      setGerarMaisProgress(2);
      stopGerarMaisTimer();
      const etaMs = Math.max(8000, gerarMaisQtd * 1500);
      gerarMaisTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - gerarMaisStartedAt.current;
        const ratio = Math.min(1, elapsed / etaMs);
        // curva sigmoide-ish (rápida no início, desacelera ao chegar perto de 95%)
        const pct = Math.min(95, Math.round(95 * (1 - Math.pow(1 - ratio, 1.6))));
        setGerarMaisProgress(pct);
      }, 200);
    },
    onSuccess: (r: any) => {
      stopGerarMaisTimer();
      setGerarMaisProgress(100);
      const partes = [`${r.inseridos} novo(s) tema(s) adicionado(s)`];
      if (r.ignorados > 0) partes.push(`${r.ignorados} ignorado(s) por duplicidade`);
      if (r.falhas > 0) partes.push(`${r.falhas} com falha`);
      toast.success(partes.join(" · "));
      // breve delay pra ver o 100% antes de fechar
      setTimeout(() => {
        setGerarMaisOpen(false);
        setGerarMaisFoco("");
        setGerarMaisProgress(0);
      }, 600);
      utils.dds.listTemas.invalidate();
      utils.dds.calendarioAnual.invalidate();
    },
    onError: (e) => {
      stopGerarMaisTimer();
      setGerarMaisProgress(0);
      toast.error(e.message);
    },
  });
  const atualizarSessaoMut = trpc.dds.atualizarSessao.useMutation({
    onSuccess: () => { utils.dds.getSessao?.invalidate?.(); utils.dds.listSessoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 1740 — estado de UI dos roteiros detalhados (expandir card + qual está gerando)
  const [expandedTemaId, setExpandedTemaId] = useState<number | null>(null);
  const [gerandoTemaId, setGerandoTemaId] = useState<number | null>(null);

  // Rev. 1747 — geração em massa com IA (todos os temas sem roteiro de uma vez)
  const [bulkIA, setBulkIA] = useState<{ ativo: boolean; idx: number; total: number; falhas: number; cancelar: boolean }>({
    ativo: false, idx: 0, total: 0, falhas: 0, cancelar: false,
  });
  // Rev. 1956 — sub-progresso animado entre itens (sem isso a barra parece travada 5-15s
  // entre cada tema que termina). bulkStartedAt para média móvel; bulkItemStartedAt resetado
  // a cada item; bulkTick força re-render a cada 250ms enquanto ativo.
  const bulkStartedAt = useRef<number>(0);
  const bulkItemStartedAt = useRef<number>(0);
  const [bulkTick, setBulkTick] = useState(0);
  useEffect(() => {
    if (!bulkIA.ativo) return;
    const t = setInterval(() => setBulkTick(x => (x + 1) % 1_000_000), 250);
    return () => clearInterval(t);
  }, [bulkIA.ativo]);
  const gerarTodosComIA = async (modo: "faltantes" | "todos") => {
    const lista = ((temasQ.data as any[]) ?? []);
    const alvos = lista.filter((t: any) =>
      modo === "todos" ? true : !((t.conteudoMd ?? "").trim().length >= 80)
    );
    if (alvos.length === 0) {
      toast.info(modo === "faltantes"
        ? "Todos os temas já têm roteiro detalhado."
        : "Não há temas na biblioteca.");
      return;
    }
    const aviso = modo === "todos"
      ? `Vai gerar/regerar com IA o roteiro de TODOS os ${alvos.length} temas (sobrescreve os existentes). Pode demorar ~${Math.ceil(alvos.length * 5 / 60)} min. Continuar?`
      : `Vai gerar com IA o roteiro de ${alvos.length} tema(s) sem conteúdo detalhado. Pode demorar ~${Math.ceil(alvos.length * 5 / 60)} min. Continuar?`;
    const okBulk = await confirm({
      title: modo === "todos" ? "Regerar TODOS os roteiros com IA?" : "Gerar roteiros faltantes com IA?",
      description: aviso.replace(/^.+?\? /, ""),
      tone: "info",
      confirmText: "Gerar com IA",
    });
    if (!okBulk) return;
    setBulkIA({ ativo: true, idx: 0, total: alvos.length, falhas: 0, cancelar: false });
    bulkStartedAt.current = Date.now();          // Rev. 1956
    bulkItemStartedAt.current = Date.now();      // Rev. 1956
    // Rev. 1956.1 — worker pool com CONCORRÊNCIA = 4 (reduz ~5min p/ ~1min15s em 60 temas).
    // Cada worker pega o próximo índice do cursor compartilhado; cancelamento checado em cada pull.
    let ok = 0; let fail = 0;
    let cursor = 0;
    let cancelado = false;
    const CONCURRENCY = 4;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(CONCURRENCY, alvos.length); w++) {
      workers.push((async () => {
        while (true) {
          if (cancelado) return;
          // checa cancel via setState callback (lê valor mais atual)
          let snapshotCancel = false;
          setBulkIA(prev => { snapshotCancel = prev.cancelar; return prev; });
          if (snapshotCancel) { cancelado = true; return; }
          const i = cursor++;
          if (i >= alvos.length) return;
          const t = alvos[i];
          bulkItemStartedAt.current = Date.now(); // reset do "item em foco" p/ ETA
          try {
            const r = await gerarIAMut.mutateAsync({
              companyId,
              titulo: t.titulo,
              descricao: t.descricao ?? undefined,
              normaReferencia: t.normaReferencia ?? undefined,
              categoria: t.categoria ?? undefined,
            });
            // Rev. 1960 — salva areaTema retornada pela IA SE o tema ainda não tinha (não sobrescreve manual)
            const patchBulk: any = { companyId, id: t.id, conteudoMd: r.conteudoMd };
            if (!t.areaTema && (r as any).areaTema) patchBulk.areaTema = (r as any).areaTema;
            await atualizarTemaMut.mutateAsync(patchBulk);
            ok++;
          } catch (e: any) {
            fail++;
            setBulkIA(prev => ({ ...prev, falhas: prev.falhas + 1 }));
            console.warn(`[BulkIA] Falhou no tema ${t.id} (${t.titulo}):`, e?.message);
          } finally {
            // idx = qtos COMPLETOS (ok+fail) para barra/ETA refletirem progresso real
            setBulkIA(prev => ({ ...prev, idx: Math.min(prev.total, ok + fail) }));
          }
        }
      })());
    }
    await Promise.all(workers);
    setBulkIA({ ativo: false, idx: 0, total: 0, falhas: 0, cancelar: false });
    utils.dds.listTemas.invalidate();
    if (fail === 0) toast.success(`${ok} roteiro(s) gerado(s) com IA.`);
    else toast.warning(`${ok} gerado(s), ${fail} falha(s). Tente novamente nos que falharam.`);
  };

  // ===== modal: tema
  const [showTema, setShowTema] = useState(false);
  const [editTema, setEditTema] = useState<any | null>(null);
  const [temaForm, setTemaForm] = useState<any>({
    titulo: "", descricao: "", conteudoMd: "", normaReferencia: "",
    categoria: "LIVRE", codigo: "", duracaoMin: 15,
    areaTema: null, // Rev. 1960
  });
  // Rev. 1864 — IA gera tema completo a partir de prompt curto
  const [iaPrompt, setIaPrompt] = useState("");
  const gerarTemaIAMut = trpc.dds.gerarTemaIA.useMutation();
  const handleGerarTemaIA = async () => {
    const p = iaPrompt.trim();
    if (p.length < 3) { toast.error("Descreva o tema em poucas palavras"); return; }
    try {
      const r = await gerarTemaIAMut.mutateAsync({ companyId, prompt: p });
      setTemaForm({
        categoria: r.categoria,
        codigo: r.codigo,
        titulo: r.titulo,
        descricao: r.descricao,
        normaReferencia: r.normaReferencia,
        duracaoMin: r.duracaoMin,
        conteudoMd: r.conteudoMd,
        areaTema: (r as any).areaTema ?? null, // Rev. 1960 — IA classifica área automaticamente
      });
      toast.success("Tema gerado pela IA — revise e clique em Criar");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar tema com IA");
    }
  };
  const abrirNovoTema = () => {
    setEditTema(null);
    setTemaForm({ titulo: "", descricao: "", conteudoMd: "", normaReferencia: "", categoria: "LIVRE", codigo: "", duracaoMin: 15, areaTema: null });
    setIaPrompt("");
    setShowTema(true);
  };
  const abrirEditTema = (t: any) => {
    setEditTema(t);
    setTemaForm({
      titulo: t.titulo ?? "", descricao: t.descricao ?? "", conteudoMd: t.conteudoMd ?? "",
      normaReferencia: t.normaReferencia ?? "", categoria: t.categoria ?? "LIVRE",
      codigo: t.codigo ?? "", duracaoMin: t.duracaoMin ?? 15,
      areaTema: t.areaTema ?? null, // Rev. 1960
    });
    setShowTema(true);
  };
  const salvarTemaMut = trpc.dds.criarTema.useMutation({
    onSuccess: () => { toast.success("Tema criado"); utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowTema(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarTemaMut = trpc.dds.atualizarTema.useMutation({
    onSuccess: () => { toast.success("Tema atualizado"); utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowTema(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirTemaMut = trpc.dds.excluirTema.useMutation({
    onSuccess: () => { toast.success("Tema excluído"); utils.dds.listTemas.invalidate(); utils.dds.calendarioAnual.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const handleSalvarTema = () => {
    if (!temaForm.titulo || temaForm.titulo.length < 3) { toast.error("Informe o título"); return; }
    if (editTema) {
      atualizarTemaMut.mutate({ companyId, id: editTema.id, ...temaForm });
    } else {
      salvarTemaMut.mutate({ companyId, ...temaForm });
    }
  };

  // ===== modal: nova sessão
  // Rev. 1731 fix: usa listActive (respeita allowedObras do usuário) + filtra status='Em_Andamento' no client
  const obrasQ = trpc.obras.listActive.useQuery({ companyId } as any, { enabled: !!companyId });
  const employeesQ = trpc.employees.list.useQuery({ companyId } as any, { enabled: !!companyId });
  const [showSessao, setShowSessao] = useState(false);
  const [sessaoForm, setSessaoForm] = useState<any>({
    obraId: "", obraIds: [] as number[], data: new Date().toISOString().slice(0, 10), hora: "07:30",
    temaId: "", tituloTema: "", conteudoMd: "",
    instrutor: "", instrutorCpf: "", instrutorCodigoInterno: "", local: "", observacoes: "",
    funcionarioIds: [] as number[],
    // Rev. 2021 — IDs dos funcionários TERCEIROS marcados como presentes no DDS.
    funcTerceiroIds: [] as number[],
  });
  // Rev. 1730 — abrir modal já preenchendo instrutor (usuário logado), data hoje, hora 07:30
  // Se nenhum tema vier, sugere o tema do mês atual (campanha ou vacinação) automaticamente.
  const abrirNovaSessao = (temaPre?: any, obraPre?: { id: number; ids?: number[] } | null) => {
    let temaEscolhido = temaPre;
    if (!temaEscolhido) {
      const mesAtual = new Date().getMonth() + 1;
      const sugerido = (temas as any[]).find((t: any) =>
        (t.categoria === "CAMPANHA" || t.categoria === "VACINACAO") && t.mesCampanha === mesAtual
      );
      if (sugerido) temaEscolhido = sugerido;
    }
    // Rev. 1959 — opcionalmente pre-seleciona obra (vinda da aba "Uso por Obra")
    const obraIdPre = obraPre?.id ? String(obraPre.id) : "";
    const obraIdsPre = obraPre?.ids && obraPre.ids.length > 0 ? obraPre.ids : (obraPre?.id ? [obraPre.id] : []);
    setSessaoForm({
      obraId: obraIdPre, obraIds: obraIdsPre as number[], data: new Date().toISOString().slice(0, 10), hora: "07:30",
      temaId: temaEscolhido?.id ? String(temaEscolhido.id) : "",
      tituloTema: temaEscolhido?.titulo ?? "",
      conteudoMd: temaEscolhido?.conteudoMd ?? temaEscolhido?.descricao ?? "",
      instrutor: user?.nome ?? user?.name ?? user?.loginName ?? user?.email ?? "",
      instrutorCpf: "",
      // Rev. 1873 — LGPD: substitui CPF por Código Interno. Auto-fill via lookup do nome do user na lista de employees.
      instrutorCodigoInterno: (() => {
        const nomeUser = user?.nome ?? user?.name ?? user?.loginName ?? user?.email ?? "";
        if (!nomeUser) return "";
        const emp = (employeesQ.data as any[] | undefined)?.find((e: any) =>
          String(e.nomeCompleto || "").trim().toLowerCase() === String(nomeUser).trim().toLowerCase()
        );
        return emp?.codigoInterno ? String(emp.codigoInterno) : "";
      })(),
      local: "",
      observacoes: "",
      funcionarioIds: [] as number[],
      funcTerceiroIds: [] as number[],
    });
    setShowSessao(true);
  };
  const criarSessaoMut = trpc.dds.criarSessao.useMutation({
    onSuccess: (s) => { toast.success("Sessão criada"); utils.dds.listSessoes.invalidate(); utils.dds.calendarioAnual.invalidate(); setShowSessao(false); setSelectedSessaoId(s.id); setTab("sessoes"); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 1733 — equipe ativa consolidada por NOME (alinhado com cadastro > aba Efetivo / getEfetivoPorObra).
  // Quando há obras duplicadas (mesmo nome, IDs diferentes), unifica o efetivo de TODAS as duplicatas.
  const obrasIdsSel: number[] = Array.isArray(sessaoForm.obraIds) ? sessaoForm.obraIds : [];
  const funcsObraQ = trpc.dds.funcionariosDaObra.useQuery(
    { companyId, obraIds: obrasIdsSel } as any,
    { enabled: !!companyId && obrasIdsSel.length > 0 && showSessao }
  );
  const [showRoteiro, setShowRoteiro] = useState(false);
  const [buscaFunc, setBuscaFunc] = useState("");
  // Rev. 1731 — sidebar de obras + transferência inline + alerta de acidente D-1
  const [buscaObra, setBuscaObra] = useState("");
  const [showTransferir, setShowTransferir] = useState(false);
  const [buscaTransferir, setBuscaTransferir] = useState("");
  const candidatosTransferQ = trpc.dds.colaboradoresParaTransferir.useQuery(
    { companyId, obraIds: obrasIdsSel } as any,
    { enabled: !!companyId && obrasIdsSel.length > 0 && showTransferir }
  );
  const transferirMut = trpc.dds.transferirParaObra.useMutation({
    onSuccess: (_d, vars) => {
      toast.success("Colaborador transferido para a obra");
      // Rev. 1733 — invalida pelo conjunto consolidado da obra alvo.
      utils.dds.funcionariosDaObra.invalidate();
      utils.dds.colaboradoresParaTransferir.invalidate();
      // Auto-marca como presente APENAS se a obra continua selecionada
      setSessaoForm((s: any) => {
        const ids: number[] = Array.isArray(s.obraIds) ? s.obraIds : [];
        if (!ids.includes(vars.obraId)) return s;
        if (s.funcionarioIds.includes(vars.employeeId)) return s;
        return { ...s, funcionarioIds: [...s.funcionarioIds, vars.employeeId] };
      });
    },
    onError: (e) => toast.error(e.message),
  });
  // Acidentes recentes (últimos 7 dias) — D-1 vira alerta vermelho obrigatório
  const acidentesQ = trpc.dds.acidentesRecentes.useQuery(
    { companyId, obraIds: obrasIdsSel.length > 0 ? obrasIdsSel : undefined, diasJanela: 7 } as any,
    { enabled: !!companyId && showSessao }
  );
  // Reseta busca/roteiro ao reabrir
  useEffect(() => { if (showSessao) { setShowRoteiro(false); setBuscaFunc(""); setBuscaObra(""); } }, [showSessao]);
  // Rev. 1873 — backfill do Código Interno quando employeesQ chega DEPOIS do modal abrir
  // (abrirNovaSessao roda 1x; se employeesQ ainda estava loading, codigoInterno fica vazio).
  useEffect(() => {
    if (!showSessao || !sessaoForm.instrutor || sessaoForm.instrutorCodigoInterno) return;
    const list = employeesQ.data as any[] | undefined;
    if (!list || list.length === 0) return;
    const emp = list.find((e: any) =>
      String(e.nomeCompleto || "").trim().toLowerCase() === String(sessaoForm.instrutor).trim().toLowerCase()
    );
    if (emp?.codigoInterno) {
      setSessaoForm((s: any) => ({ ...s, instrutorCodigoInterno: String(emp.codigoInterno) }));
    }
  }, [showSessao, sessaoForm.instrutor, sessaoForm.instrutorCodigoInterno, employeesQ.data]);
  useEffect(() => { if (showTransferir) setBuscaTransferir(""); }, [showTransferir]);

  const handleSalvarSessao = () => {
    if (!sessaoForm.tituloTema || sessaoForm.tituloTema.length < 3) { toast.error("Informe o título do tema"); return; }
    if (!sessaoForm.data) { toast.error("Informe a data"); return; }
    // Rev. 1730 — guarda local no histórico pra autocomplete futuro
    if (sessaoForm.local) pushRecentLocal(companyId, sessaoForm.local);
    criarSessaoMut.mutate({
      companyId,
      obraId: sessaoForm.obraId ? Number(sessaoForm.obraId) : undefined,
      data: sessaoForm.data,
      hora: sessaoForm.hora || undefined,
      temaId: sessaoForm.temaId ? Number(sessaoForm.temaId) : undefined,
      tituloTema: sessaoForm.tituloTema,
      conteudoMd: sessaoForm.conteudoMd || undefined,
      instrutor: sessaoForm.instrutor || undefined,
      instrutorCodigoInterno: sessaoForm.instrutorCodigoInterno || undefined,
      local: sessaoForm.local || undefined,
      observacoes: sessaoForm.observacoes || undefined,
      funcionarioIds: sessaoForm.funcionarioIds,
      // Rev. 2021 — envia terceiros marcados pra gravar em ddsParticipacoesTerceiros.
      funcTerceiroIds: sessaoForm.funcTerceiroIds ?? [],
    });
  };

  // ===== detalhe sessão
  const [selectedSessaoId, setSelectedSessaoId] = useState<number | null>(null);
  const sessaoDetalheQ = trpc.dds.getSessao.useQuery(
    { companyId, id: selectedSessaoId ?? 0 },
    { enabled: !!selectedSessaoId },
  );
  const finalizarSessaoMut = trpc.dds.atualizarSessao.useMutation({
    onSuccess: () => { toast.success("Sessão finalizada"); utils.dds.listSessoes.invalidate(); utils.dds.getSessao.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirSessaoMut = trpc.dds.excluirSessao.useMutation({
    onSuccess: () => { toast.success("Sessão excluída"); utils.dds.listSessoes.invalidate(); setSelectedSessaoId(null); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 1752 — exclusão em lote a partir da tabela.
  const excluirSessoesMut = trpc.dds.excluirSessoes.useMutation({
    onSuccess: (r) => { toast.success(`${r.excluidos} sessão(ões) excluída(s)`); utils.dds.listSessoes.invalidate(); setSelecionadasIds(new Set()); },
    onError: (e) => toast.error(e.message),
  });
  const [selecionadasIds, setSelecionadasIds] = useState<Set<number>>(new Set());
  // Filtros da lista de sessões
  const [buscaSessoes, setBuscaSessoes] = useState("");
  const [filtroObraSessoes, setFiltroObraSessoes] = useState("");
  const [baixandoLote, setBaixandoLote] = useState(false);
  const [loteProgress, setLoteProgress] = useState(0);

  // Rev. 1876 — Modal de edição de categoria por sessão (override granular).
  const [editarCategoriaId, setEditarCategoriaId] = useState<number | null>(null);
  const editarCategoriaMut = trpc.dds.atualizarSessao.useMutation({
    onSuccess: () => {
      toast.success("Categoria atualizada");
      utils.dds.listSessoes.invalidate();
      utils.dds.dashboardKpis.invalidate();
      setEditarCategoriaId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const sessaoEditarCategoria = useMemo(
    () => (sessoesQ.data || []).find((s: any) => s.id === editarCategoriaId) || null,
    [sessoesQ.data, editarCategoriaId],
  );
  const toggleSelecionada = (id: number) => {
    setSelecionadasIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const presencaMut = trpc.dds.marcarPresenca.useMutation({
    onSuccess: () => { utils.dds.getSessao.invalidate(); utils.dds.listSessoes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // ===== adicionar funcionário ao detalhe
  const [addFuncId, setAddFuncId] = useState<string>("");
  const idsJaNaSessao = useMemo(() => {
    const f = (sessaoDetalheQ.data as any)?.funcionarios ?? [];
    return new Set(f.map((x: any) => x.employeeId).filter(Boolean));
  }, [sessaoDetalheQ.data]);

  const camp = (calendarioQ.data as any)?.meses ?? [];
  const temas = (temasQ.data as any[]) ?? [];
  const sessoes = (sessoesQ.data as any[]) ?? [];

  // Rev. 1957 — uso de cada tema (count + última data) derivado das sessões existentes.
  // Sem backend: agrupa sessoes por temaId (ignora sessões "livres" sem temaId) e calcula
  // diasDesdeUltimoUso. Usado p/ badges na Biblioteca, ordenação e alerta no modal.
  const usoPorTema = useMemo(() => {
    const map = new Map<number, { count: number; ultimaData: string | null; diasAtras: number | null }>();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    for (const s of sessoes) {
      const tid = s.temaId ? Number(s.temaId) : null;
      if (!tid) continue;
      const prev = map.get(tid) ?? { count: 0, ultimaData: null, diasAtras: null };
      prev.count += 1;
      const d = s.data ?? null;
      if (d && (!prev.ultimaData || d > prev.ultimaData)) prev.ultimaData = d;
      map.set(tid, prev);
    }
    // calcula diasAtras a partir de ultimaData
    for (const [, v] of map) {
      if (v.ultimaData) {
        const dt = new Date(v.ultimaData + "T12:00:00");
        dt.setHours(0, 0, 0, 0);
        v.diasAtras = Math.max(0, Math.round((hoje.getTime() - dt.getTime()) / 86_400_000));
      }
    }
    return map;
  }, [sessoes]);

  // Rev. 1957 — filtros/ordenação da Biblioteca em relação ao uso
  const [bibEsconderUsados, setBibEsconderUsados] = useState(false);
  const [bibOrdenarPorUso, setBibOrdenarPorUso] = useState(true);  // não-usados primeiro

  // Rev. 1960 — Filtro por ÁREA TEMÁTICA (compartilhado entre Biblioteca e Uso por Obra).
  // null = mostra todas as áreas; valor = só temas daquela área (ou áreas múltiplas no Set).
  const [areaFiltro, setAreaFiltro] = useState<Set<string>>(new Set());
  const toggleAreaFiltro = (a: string) => {
    setAreaFiltro(prev => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  };
  const limparAreaFiltro = () => setAreaFiltro(new Set());
  // Contagem de temas por área (para mostrar nas chips)
  const temasPorArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of temas) {
      const a = t.areaTema || "GERAL";
      map.set(a, (map.get(a) ?? 0) + 1);
    }
    return map;
  }, [temas]);
  // Helper: passa pelo filtro de área? (Set vazio = passa tudo)
  const passaFiltroArea = (t: any) => {
    if (areaFiltro.size === 0) return true;
    return areaFiltro.has(t.areaTema || "GERAL");
  };

  // Rev. 1959 — Aba "Uso por Obra": seletor de obra (null = todas as obras com permissão).
  // `obrasQ` já vem filtrado por allowedObras no server (Rev. 1731), então respeita permissão do user.
  const [usoObraSelId, setUsoObraSelId] = useState<number | null>(null);
  // Map de uso por TEMA filtrado por OBRA escolhida (ou todas as obras permitidas).
  const usoPorTemaObra = useMemo(() => {
    const map = new Map<number, { count: number; ultimaData: string | null; diasAtras: number | null }>();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const obrasPermitIds = new Set<number>(((obrasQ.data as any[]) ?? []).map((o: any) => Number(o.id)));
    for (const s of sessoes) {
      const tid = s.temaId ? Number(s.temaId) : null;
      if (!tid) continue;
      const oid = s.obraId ? Number(s.obraId) : null;
      // Se obra escolhida: só conta essa. Se não: só conta sessões em obras permitidas (ou sessões sem obra/avulsas).
      if (usoObraSelId !== null) {
        if (oid !== usoObraSelId) continue;
      } else {
        if (oid !== null && !obrasPermitIds.has(oid)) continue;
      }
      const prev = map.get(tid) ?? { count: 0, ultimaData: null, diasAtras: null };
      prev.count += 1;
      const d = s.data ?? null;
      if (d && (!prev.ultimaData || d > prev.ultimaData)) prev.ultimaData = d;
      map.set(tid, prev);
    }
    for (const [, v] of map) {
      if (v.ultimaData) {
        const dt = new Date(v.ultimaData + "T12:00:00");
        dt.setHours(0, 0, 0, 0);
        v.diasAtras = Math.max(0, Math.round((hoje.getTime() - dt.getTime()) / 86_400_000));
      }
    }
    return map;
  }, [sessoes, usoObraSelId, obrasQ.data]);

  return (
    <DashboardLayout>
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {ConfirmDialog}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-emerald-600" />
            DDS — Diálogo Diário de Segurança
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Guia completo: calendário das campanhas governamentais, biblioteca de temas conforme NRs e
            registro de sessões com lista de presença e assinatura via FCsign.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Rev. 1863 — atalho pro novo Dashboard de DDS */}
          <Button
            variant="outline"
            onClick={() => navigate("/sst/dds-dashboard")}
            className="border-cyan-300 text-cyan-700 hover:bg-cyan-50"
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          {temas.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMut.mutate({ companyId })}
              disabled={seedMut.isPending}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {seedMut.isPending ? "Carregando..." : "Carregar biblioteca padrão (12 campanhas + 13 NRs)"}
            </Button>
          )}
          {/* Rev. 1729 — Lei 15.377/2026 (CLT art. 169-A): empresa deve divulgar campanhas de vacinação */}
          {!temas.some((t: any) => t.categoria === "VACINACAO") && (
            <Button
              variant="outline"
              onClick={() => seedVacMut.mutate({ companyId })}
              disabled={seedVacMut.isPending}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {seedVacMut.isPending ? "Carregando..." : "💉 Carregar campanhas de vacinação (PNI/MS — Lei 15.377/2026)"}
            </Button>
          )}
          {temas.length > 0 && (
            <Button
              variant="outline"
              onClick={() => enriquecerMut.mutate({ companyId, sobrescrever: false })}
              disabled={enriquecerMut.isPending || bulkIA.ativo}
              className="border-violet-300 text-violet-700 hover:bg-violet-50"
              title="Preenche o roteiro detalhado dos temas padrão (NRs, Campanhas, Vacinação) que ainda estão sem conteúdo — usa textos pré-prontos do banco (rápido, sem IA)"
            >
              <Wand2 className="h-4 w-4 mr-1" />
              {enriquecerMut.isPending ? "Enriquecendo..." : "✨ Enriquecer roteiros dos temas padrão"}
            </Button>
          )}
          {/* Rev. 1747 — Gerar TODOS os roteiros com IA (sem roteiro ou todos) */}
          {temas.length > 0 && !bulkIA.ativo && (
            <>
              <Button
                variant="outline"
                onClick={() => gerarTodosComIA("faltantes")}
                disabled={enriquecerMut.isPending}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                title="Gera com IA o roteiro detalhado de TODOS os temas que ainda não têm roteiro — contextualiza por título/norma/categoria"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                🤖 Gerar todos os roteiros com IA
              </Button>
              <Button
                variant="outline"
                onClick={() => gerarTodosComIA("todos")}
                disabled={enriquecerMut.isPending}
                className="border-blue-200 text-blue-600 hover:bg-blue-50"
                title="Regera com IA o roteiro de TODOS os temas (incluindo os que já têm conteúdo)"
              >
                <Wand2 className="h-4 w-4 mr-1" />
                Regerar tudo
              </Button>
              {/* Rev. 1953 — Gerar LOTE de NOVOS temas (expande biblioteca além das NRs/campanhas padrão).
                  User: "Coloca um botão para gerar mais assuntos quero uma biblioteca com mais 200 temas
                  pertinentes a construção civil". Diferente dos botões acima (que enriquecem roteiro dos
                  temas EXISTENTES), este CRIA temas novos via IA evitando duplicar títulos já cadastrados. */}
              <Button
                variant="outline"
                onClick={() => setGerarMaisOpen(true)}
                disabled={enriquecerMut.isPending || gerarMaisMut.isPending}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold"
                title="Gera com IA um lote de NOVOS temas para enriquecer a biblioteca. Não duplica títulos já cadastrados."
              >
                <Plus className="h-4 w-4 mr-1" />
                {gerarMaisMut.isPending ? "Gerando temas..." : "✨ Gerar mais temas com IA"}
              </Button>
            </>
          )}
          {/* Barra de progresso da geração em massa */}
          {bulkIA.ativo && (() => {
            // Rev. 1956 — sub-progresso animado entre itens (lê bulkTick implicitamente via re-render)
            void bulkTick; // garante dependência do tick (eslint/dead-code safe)
            const totalSafe = Math.max(1, bulkIA.total);
            const completos = Math.max(0, bulkIA.idx - 1); // o item "idx" está em andamento
            // ETA por item adaptativo: 5s default; após o 1º terminar, usa média real
            const elapsedTotal = Date.now() - bulkStartedAt.current;
            const etaPorItem = completos > 0 ? Math.max(2000, elapsedTotal / completos) : 5000;
            const elapsedItem = Date.now() - bulkItemStartedAt.current;
            const fracItem = Math.min(0.95, elapsedItem / etaPorItem); // trava em 95% do slot
            const pctFloat = bulkIA.idx > 0
              ? ((completos + fracItem) / totalSafe) * 100
              : 0;
            const pct = Math.min(99, Math.round(pctFloat));
            const restantesItens = Math.max(0, bulkIA.total - bulkIA.idx);
            // tempo restante baseado em ETA real + tempo que falta no item atual
            const msRestSlot = Math.max(0, etaPorItem - elapsedItem);
            const segRestantes = Math.round((restantesItens * etaPorItem + msRestSlot) / 1000);
            const min = Math.floor(segRestantes / 60);
            const seg = segRestantes % 60;
            const eta = restantesItens === 0 && msRestSlot < 500 ? "finalizando..." : (min > 0 ? `~${min}m ${seg}s restantes` : `~${seg}s restantes`);
            return (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 min-w-[340px]">
                <Loader2 className="h-5 w-5 animate-spin text-blue-700 shrink-0" />
                <div className="flex-1 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-blue-900">
                      Gerando com IA — {bulkIA.idx}/{bulkIA.total}
                      {bulkIA.falhas > 0 && <span className="text-red-700 ml-1">({bulkIA.falhas} falhas)</span>}
                    </span>
                    <span className="font-bold text-blue-900 tabular-nums text-sm">{pct}%</span>
                  </div>
                  <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-700 h-full transition-all duration-300"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-blue-700/80 mt-0.5">{eta}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setBulkIA(p => ({ ...p, cancelar: true }))}
                  className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs shrink-0">
                  Cancelar
                </Button>
              </div>
            );
          })()}
          <Button onClick={() => abrirNovaSessao()}>
            <Plus className="h-4 w-4 mr-1" /> Nova Sessão DDS
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="calendario"><CalendarDays className="h-4 w-4 mr-1" /> Calendário Anual</TabsTrigger>
          <TabsTrigger value="biblioteca"><BookOpen className="h-4 w-4 mr-1" /> Biblioteca de Temas</TabsTrigger>
          {/* Rev. 1959 — nova aba: tema já usado vs não usado por obra (respeita permissão do user) */}
          <TabsTrigger value="usoobra"><BookOpen className="h-4 w-4 mr-1" /> Uso por Obra</TabsTrigger>
          <TabsTrigger value="sessoes"><Users className="h-4 w-4 mr-1" /> Sessões ({sessoes.length})</TabsTrigger>
        </TabsList>

        {/* =================== CALENDÁRIO =================== */}
        <TabsContent value="calendario" className="mt-4">
          {/* Rev. 1736 — Toolbar: seletor de ano + toggle "ver todas" */}
          {temas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">Ano:</span>
              {[anoAtual, anoAtual + 1, anoAtual + 2].map((y) => (
                <button key={y} type="button"
                  onClick={() => { setCalendarioAno(y); setVerTodasCampanhas(false); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    calendarioAno === y
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                  }`}>
                  {y}{y === anoAtual ? " (atual)" : ""}
                </button>
              ))}
              <div className="flex-1" />
              {calendarioAno === anoAtual && (
                <button type="button"
                  onClick={() => setVerTodasCampanhas(v => !v)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    verTodasCampanhas
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
                  }`}>
                  {verTodasCampanhas
                    ? `✓ Mostrando os 12 meses de ${anoAtual}`
                    : `Ver todas as campanhas de ${anoAtual}`}
                </button>
              )}
              <span className="text-[11px] text-slate-500 italic ml-1">
                {calendarioAno === anoAtual && !verTodasCampanhas
                  ? `Exibindo só meses pendentes (${MESES_PT[mesAtualNum - 1]} → Dezembro)`
                  : calendarioAno > anoAtual
                    ? `Planejamento ${calendarioAno} — todos os meses`
                    : `Visão completa de ${calendarioAno}`}
              </span>
            </div>
          )}
          {temas.length === 0 ? (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center">
              <Megaphone className="h-10 w-10 text-amber-600 mx-auto mb-2" />
              <h3 className="font-semibold text-amber-900 mb-1">Biblioteca vazia</h3>
              <p className="text-sm text-amber-800 mb-3">
                Carregue o catálogo padrão com 12 campanhas oficiais do governo federal
                (Janeiro Branco, Abril Verde, Maio Amarelo, Setembro Amarelo, Outubro Rosa…)
                e as 13 NRs mais aplicadas em construção civil.
              </p>
              <Button onClick={() => seedMut.mutate({ companyId })} disabled={seedMut.isPending}>
                <Sparkles className="h-4 w-4 mr-1" />
                {seedMut.isPending ? "Carregando..." : "Carregar biblioteca padrão"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(camp as any[])
                .filter((m: any) => {
                  // Rev. 1736 — ano atual sem "ver todas": só meses pendentes (>= mês atual).
                  // Próximos anos: todos os meses. Toggle ativo no ano atual: todos os 12.
                  if (calendarioAno > anoAtual) return true;
                  if (verTodasCampanhas) return true;
                  return m.mes >= mesAtualNum;
                })
                .map((m: any) => {
                const c0 = m.campanhas?.[0];
                const cor = corCfg(c0?.corCampanha);
                const mesAtual = calendarioAno === anoAtual && m.mes === mesAtualNum;
                return (
                  <div key={m.mes}
                    className={`rounded-2xl border-2 ${cor.border} ${cor.bg} p-4 shadow-sm ${mesAtual ? "ring-2 ring-emerald-400 ring-offset-2" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`text-xs font-bold uppercase tracking-wider ${cor.text}`}>
                        {String(m.mes).padStart(2, "0")} • {MESES_PT[m.mes - 1]}
                      </div>
                      <span className="text-xs text-slate-500">
                        {calendarioAno === anoAtual
                          ? `${m.sessoesNoMes} sessão(ões) este ano`
                          : `Planejado para ${calendarioAno}`}
                      </span>
                    </div>
                    {m.campanhas?.length ? m.campanhas.map((c: any) => (
                      <div key={c.id} className="mb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cor.chip}`}>
                            {c.codigo}
                          </span>
                        </div>
                        <h3 className={`font-semibold leading-tight ${cor.text}`}>{c.titulo}</h3>
                        <p className="text-xs text-slate-700 mt-1">{c.descricao}</p>
                        {c.normaReferencia && (
                          <p className="text-[10px] text-slate-500 mt-1 italic">{c.normaReferencia}</p>
                        )}
                        <div className="mt-3 flex gap-1">
                          <Button size="sm" variant="default" className="text-xs h-7"
                            onClick={() => abrirNovaSessao(c)}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Iniciar sessão
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7"
                            onClick={() => abrirEditTema(c)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )) : (
                      <p className="text-xs text-slate-500 italic">
                        Sem campanha cadastrada para este mês.
                      </p>
                    )}

                    {/* Rev. 1729 — Sugestões de DDS de VACINAÇÃO (Lei 15.377/2026) */}
                    {m.vacinacao?.length > 0 && (
                      <div className="mt-3 pt-3 border-t-2 border-dashed border-emerald-300">
                        <div className="flex items-center gap-1 mb-2">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            Sugerido pelo ERP — Vacinação
                          </span>
                        </div>
                        {m.vacinacao.map((v: any) => (
                          <div key={v.id} className="mb-2 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2">
                            <h4 className="font-semibold text-sm leading-tight text-emerald-900">{v.titulo}</h4>
                            <p className="text-[11px] text-slate-700 mt-1 line-clamp-3">{v.descricao}</p>
                            {v.normaReferencia && (
                              <p className="text-[9px] text-slate-500 mt-1 italic">{v.normaReferencia}</p>
                            )}
                            <div className="mt-2 flex gap-1">
                              <Button size="sm" variant="default" className="text-[11px] h-6 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => abrirNovaSessao(v)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> DDS desta vacinação
                              </Button>
                              <Button size="sm" variant="ghost" className="text-[11px] h-6"
                                onClick={() => abrirEditTema(v)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* =================== BIBLIOTECA =================== */}
        <TabsContent value="biblioteca" className="mt-4">
          {/* Rev. 1957 — toolbar com filtros de uso (esconder já usados / ordenar por uso) */}
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm text-slate-600">{temas.length} tema(s) cadastrado(s).</p>
              {(() => {
                const total = temas.length;
                const usados = temas.filter((t: any) => (usoPorTema.get(t.id)?.count ?? 0) > 0).length;
                const novos = total - usados;
                return (
                  <span className="text-xs text-slate-500">
                    · <span className="text-emerald-700 font-semibold">{novos} novo(s)</span>
                    {" / "}
                    <span className="text-amber-700 font-semibold">{usados} já usado(s)</span>
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={bibEsconderUsados}
                  onChange={e => setBibEsconderUsados(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Esconder já usados
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={bibOrdenarPorUso}
                  onChange={e => setBibOrdenarPorUso(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Novos primeiro
              </label>
              <Button size="sm" onClick={abrirNovoTema}><Plus className="h-4 w-4 mr-1" /> Novo tema</Button>
            </div>
          </div>
          {/* Rev. 1960 — Filtro por ÁREA TEMÁTICA (chips toggle multi-seleção) */}
          {temas.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-3.5 w-3.5 text-slate-600" />
                <span className="text-xs font-semibold text-slate-700">Filtrar por área temática</span>
                {areaFiltro.size > 0 && (
                  <button type="button" onClick={limparAreaFiltro}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-1">
                    limpar ({areaFiltro.size})
                  </button>
                )}
                <span className="text-[11px] text-slate-400 ml-auto">
                  {areaFiltro.size === 0
                    ? `mostrando ${temas.length} tema(s)`
                    : `${temas.filter(passaFiltroArea).length} de ${temas.length} tema(s)`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DDS_AREA_VALUES.map(av => {
                  const info = DDS_AREAS[av];
                  const count = temasPorArea.get(av) ?? 0;
                  if (count === 0) return null;
                  const ativo = areaFiltro.has(av);
                  return (
                    <button
                      key={av}
                      type="button"
                      onClick={() => toggleAreaFiltro(av)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
                        ativo
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : info.chip + " hover:opacity-80"
                      }`}
                      title={info.hint}
                    >
                      {info.emoji} {info.label} <span className="opacity-70">·{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {["NR", "CAMPANHA", "VACINACAO", "LIVRE"].map(cat => {
            let lista = temas.filter((t: any) => t.categoria === cat && passaFiltroArea(t));
            // Rev. 1957 — esconder já usados
            if (bibEsconderUsados) {
              lista = lista.filter((t: any) => (usoPorTema.get(t.id)?.count ?? 0) === 0);
            }
            // Rev. 1957 — ordenar: novos primeiro → menos usados → uso mais antigo
            if (bibOrdenarPorUso) {
              lista = [...lista].sort((a: any, b: any) => {
                const ua = usoPorTema.get(a.id);
                const ub = usoPorTema.get(b.id);
                const ca = ua?.count ?? 0;
                const cb = ub?.count ?? 0;
                if (ca !== cb) return ca - cb; // menos usado primeiro
                // mesmo count: o que foi usado há mais tempo aparece primeiro
                const da = ua?.diasAtras ?? Number.POSITIVE_INFINITY;
                const db = ub?.diasAtras ?? Number.POSITIVE_INFINITY;
                return db - da; // diasAtras maior = primeiro
              });
            }
            if (lista.length === 0) return null;
            return (
              <div key={cat} className="mb-6">
                <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  {cat === "NR" ? "Normas Regulamentadoras (NRs)" :
                   cat === "CAMPANHA" ? "Campanhas Governamentais" :
                   cat === "VACINACAO" ? "💉 Campanhas de Vacinação (PNI/MS — Lei 15.377/2026)" : "Temas Livres"}
                  <span className="text-xs text-slate-400 font-normal">({lista.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {lista.map((t: any) => {
                    const cor = (cat === "CAMPANHA" || cat === "VACINACAO") ? corCfg(t.corCampanha) : { bg: "bg-white", text: "text-slate-800", border: "border-slate-200", chip: "bg-slate-200 text-slate-700" };
                    const expandido = expandedTemaId === t.id;
                    const temRoteiro = (t.conteudoMd ?? "").trim().length >= 80;
                    const gerandoEsta = gerandoTemaId === t.id;
                    return (
                      <div key={t.id} className={`rounded-xl border ${cor.border} ${cor.bg} p-3 shadow-sm flex flex-col`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cor.chip}`}>
                            {t.codigo ?? "—"}
                          </span>
                          <div className="flex gap-1">
                            <button onClick={() => abrirEditTema(t)} className="text-slate-400 hover:text-slate-700" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={async () => {
                              const ok = await confirm({
                                title: "Excluir tema da biblioteca?",
                                description: `O tema "${t.titulo}" será removido. As sessões já criadas com este tema continuam existindo.`,
                                tone: "destructive",
                                confirmText: "Excluir",
                              });
                              if (ok) excluirTemaMut.mutate({ companyId, id: t.id });
                            }}
                              className="text-slate-400 hover:text-red-600" title="Excluir">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <h4 className={`font-semibold text-sm leading-tight ${cor.text}`}>{t.titulo}</h4>
                        {t.descricao && <p className="text-xs text-slate-600 mt-1 line-clamp-3">{t.descricao}</p>}
                        {t.normaReferencia && <p className="text-[10px] text-slate-500 italic mt-1">{t.normaReferencia}</p>}
                        {/* Rev. 1960 — badge de ÁREA TEMÁTICA (auto-classificada pela IA) */}
                        {t.areaTema && DDS_AREAS[t.areaTema as keyof typeof DDS_AREAS] && (
                          <span
                            className={`mt-1.5 inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded text-[10px] font-bold border ${DDS_AREAS[t.areaTema as keyof typeof DDS_AREAS].chip}`}
                            title={DDS_AREAS[t.areaTema as keyof typeof DDS_AREAS].hint}
                          >
                            {DDS_AREAS[t.areaTema as keyof typeof DDS_AREAS].emoji} {DDS_AREAS[t.areaTema as keyof typeof DDS_AREAS].label}
                          </span>
                        )}
                        {/* Rev. 1957 — badge de uso (já usado N×, há Yd) ou "✨ Novo" */}
                        {(() => {
                          const uso = usoPorTema.get(t.id);
                          if (!uso || uso.count === 0) {
                            return (
                              <span className="mt-1.5 inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ✨ Tema novo
                              </span>
                            );
                          }
                          const recente = (uso.diasAtras ?? 999) < 30;
                          return (
                            <span
                              className={`mt-1.5 inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                recente
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : "bg-slate-100 text-slate-700 border-slate-300"
                              }`}
                              title={uso.ultimaData ? `Última sessão: ${new Date(uso.ultimaData + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
                            >
                              ✓ Usado {uso.count}× {uso.diasAtras !== null && (uso.diasAtras === 0 ? "· hoje" : `· há ${uso.diasAtras}d`)}
                            </span>
                          );
                        })()}

                        {/* Rev. 1740 — toggle de roteiro detalhado + ação de IA */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setExpandedTemaId(expandido ? null : t.id)}
                            className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md border transition ${
                              temRoteiro
                                ? "border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50"
                                : "border-slate-300 text-slate-500 bg-white hover:bg-slate-50"
                            }`}
                            title={temRoteiro ? "Ver roteiro detalhado" : "Sem roteiro — gere com IA"}
                          >
                            {expandido ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {temRoteiro ? "Ver roteiro" : "Sem roteiro"}
                          </button>
                          <button
                            type="button"
                            disabled={gerandoEsta}
                            onClick={async () => {
                              setGerandoTemaId(t.id);
                              try {
                                const r = await gerarIAMut.mutateAsync({
                                  companyId,
                                  titulo: t.titulo,
                                  descricao: t.descricao ?? undefined,
                                  normaReferencia: t.normaReferencia ?? undefined,
                                  categoria: t.categoria ?? undefined,
                                });
                                await atualizarTemaMut.mutateAsync({
                                  companyId, id: t.id,
                                  titulo: t.titulo,
                                  descricao: t.descricao ?? "",
                                  conteudoMd: r.conteudoMd,
                                  normaReferencia: t.normaReferencia ?? "",
                                  categoria: t.categoria ?? "LIVRE",
                                  codigo: t.codigo ?? "",
                                  duracaoMin: t.duracaoMin ?? 15,
                                  // Rev. 1960 — só preenche areaTema se ainda não tinha (não sobrescreve manual)
                                  ...((!t.areaTema && (r as any).areaTema) ? { areaTema: (r as any).areaTema } : {}),
                                } as any);
                                toast.success("Roteiro gerado com IA e salvo no tema.");
                                setExpandedTemaId(t.id);
                              } catch (e: any) {
                                toast.error(e?.message ?? "Falha ao gerar com IA");
                              } finally {
                                setGerandoTemaId(null);
                              }
                            }}
                            className="text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md border border-violet-300 text-violet-700 bg-white hover:bg-violet-50 disabled:opacity-50"
                            title={temRoteiro ? "Regenerar roteiro com IA (sobrescreve)" : "Gerar roteiro com IA"}
                          >
                            {gerandoEsta ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                            {gerandoEsta ? "Gerando..." : (temRoteiro ? "Regerar com IA" : "Gerar com IA")}
                          </button>
                        </div>
                        {expandido && (
                          <div className="mt-2 p-2 rounded-lg bg-white/80 border border-slate-200 max-h-64 overflow-auto">
                            {temRoteiro
                              ? <RoteiroMd md={t.conteudoMd} />
                              : <p className="text-xs text-slate-500 italic">Este tema ainda não tem roteiro detalhado. Clique em "Gerar com IA" pra criar um, ou em "✨ Enriquecer roteiros dos temas padrão" no topo da página pra puxar o roteiro padrão (NRs/Campanhas/Vacinação).</p>}
                          </div>
                        )}

                        <Button size="sm" className="mt-3 text-xs h-7" onClick={() => abrirNovaSessao(t)}>
                          <Plus className="h-3 w-3 mr-1" /> Iniciar sessão com este tema
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {temas.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              Nenhum tema cadastrado. Use "Carregar biblioteca padrão" no topo da página.
            </div>
          )}
        </TabsContent>

        {/* =================== USO POR OBRA (Rev. 1959) =================== */}
        <TabsContent value="usoobra" className="mt-4">
          {(() => {
            const obrasList = ((obrasQ.data as any[]) ?? [])
              .filter((o: any) => !o.status || o.status === "Em_Andamento")
              .sort((a: any, b: any) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"));
            const obraSel = usoObraSelId !== null ? obrasList.find((o: any) => Number(o.id) === usoObraSelId) : null;
            // Rev. 1960 — aplicar filtro de área temática também nesta aba
            const temasFiltro = temas.filter(passaFiltroArea);
            const usados = temasFiltro.filter((t: any) => (usoPorTemaObra.get(t.id)?.count ?? 0) > 0);
            const naoUsados = temasFiltro.filter((t: any) => (usoPorTemaObra.get(t.id)?.count ?? 0) === 0);
            // ordena usados por data de última (mais recente primeiro), não-usados por categoria+título
            const usadosOrd = [...usados].sort((a: any, b: any) => {
              const da = usoPorTemaObra.get(a.id)?.diasAtras ?? 99999;
              const db = usoPorTemaObra.get(b.id)?.diasAtras ?? 99999;
              return da - db;
            });
            const naoUsadosOrd = [...naoUsados].sort((a: any, b: any) =>
              String(a.categoria ?? "").localeCompare(String(b.categoria ?? "")) ||
              String(a.titulo ?? "").localeCompare(String(b.titulo ?? ""), "pt-BR")
            );

            const ColunaTema = ({ t, usado }: { t: any; usado: boolean }) => {
              const uso = usoPorTemaObra.get(t.id);
              const corCat =
                t.categoria === "NR" ? "bg-rose-50 border-rose-200 text-rose-800" :
                t.categoria === "CAMPANHA" ? "bg-blue-50 border-blue-200 text-blue-800" :
                t.categoria === "VACINACAO" ? "bg-violet-50 border-violet-200 text-violet-800" :
                "bg-slate-50 border-slate-200 text-slate-700";
              const obraDeAcao = obraSel
                ? { id: Number(obraSel.id), ids: obrasList.filter((o: any) => o.nome === obraSel.nome).map((o: any) => Number(o.id)) }
                : null;
              return (
                <div className={`rounded-lg border p-2.5 flex items-start justify-between gap-2 ${usado ? "bg-amber-50/40 border-amber-200" : "bg-emerald-50/30 border-emerald-200"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${corCat}`}>
                        {t.codigo ?? t.categoria ?? "—"}
                      </span>
                      <span className="font-semibold text-sm text-slate-800 leading-tight">{t.titulo}</span>
                    </div>
                    {usado && uso && (
                      <p className="text-[11px] text-amber-800 mt-1">
                        ✓ Usado {uso.count}× ·
                        {uso.ultimaData
                          ? ` última em ${new Date(uso.ultimaData + "T12:00:00").toLocaleDateString("pt-BR")}`
                          + (uso.diasAtras === 0 ? " (hoje)" : ` (há ${uso.diasAtras}d)`)
                          : ""}
                      </p>
                    )}
                    {!usado && (
                      <p className="text-[11px] text-emerald-700 mt-1">✨ Ainda não apresentado {obraSel ? "nesta obra" : "nas suas obras"}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[11px] h-7 px-2 flex-shrink-0"
                    onClick={() => abrirNovaSessao(t, obraDeAcao)}
                    title={obraSel ? `Iniciar sessão com este tema na obra ${obraSel.nome}` : "Iniciar sessão com este tema"}
                  >
                    <Plus className="h-3 w-3 mr-0.5" /> Sessão
                  </Button>
                </div>
              );
            };

            return (
              <div className="space-y-4">
                {/* Rev. 1960 — Filtro por ÁREA TEMÁTICA (mesmo controle da Biblioteca, compartilhado) */}
                {temas.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Filter className="h-3.5 w-3.5 text-slate-600" />
                      <span className="text-xs font-semibold text-slate-700">Filtrar por área temática</span>
                      {areaFiltro.size > 0 && (
                        <button type="button" onClick={limparAreaFiltro}
                          className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-1">
                          limpar ({areaFiltro.size})
                        </button>
                      )}
                      <span className="text-[11px] text-slate-400 ml-auto">
                        {areaFiltro.size === 0
                          ? `${temas.length} tema(s)`
                          : `${temasFiltro.length} de ${temas.length} tema(s)`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DDS_AREA_VALUES.map(av => {
                        const info = DDS_AREAS[av];
                        const count = temasPorArea.get(av) ?? 0;
                        if (count === 0) return null;
                        const ativo = areaFiltro.has(av);
                        return (
                          <button
                            key={av}
                            type="button"
                            onClick={() => toggleAreaFiltro(av)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
                              ativo
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : info.chip + " hover:opacity-80"
                            }`}
                            title={info.hint}
                          >
                            {info.emoji} {info.label} <span className="opacity-70">·{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Seletor de obra */}
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-slate-600" />
                    <span className="text-sm font-semibold text-slate-700">Escolha a obra para ver quais temas DDS já foram apresentados</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    Você vê apenas as obras às quais tem permissão de acesso ({obrasList.length} obra{obrasList.length === 1 ? "" : "s"} ativa{obrasList.length === 1 ? "" : "s"}).
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setUsoObraSelId(null)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                        usoObraSelId === null
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      🌐 Todas minhas obras
                    </button>
                    {obrasList.map((o: any) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setUsoObraSelId(Number(o.id))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                          usoObraSelId === Number(o.id)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        🏗️ {o.nome}
                      </button>
                    ))}
                    {obrasList.length === 0 && (
                      <span className="text-xs italic text-slate-400">Nenhuma obra ativa com permissão.</span>
                    )}
                  </div>
                </div>

                {/* Resumo + 2 colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* COLUNA: JÁ USADOS */}
                  <div className="bg-amber-50/30 border border-amber-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-amber-900 flex items-center gap-1">
                        ✓ Já usados {obraSel ? `nesta obra` : `nas minhas obras`}
                      </h3>
                      <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                        {usadosOrd.length}
                      </span>
                    </div>
                    {usadosOrd.length === 0 ? (
                      <p className="text-xs italic text-slate-500 py-4 text-center">
                        Nenhum tema apresentado ainda {obraSel ? "nesta obra" : "nas suas obras"}.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-[600px] overflow-auto pr-1">
                        {usadosOrd.map((t: any) => <ColunaTema key={t.id} t={t} usado={true} />)}
                      </div>
                    )}
                  </div>

                  {/* COLUNA: NÃO USADOS */}
                  <div className="bg-emerald-50/30 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-emerald-900 flex items-center gap-1">
                        ✨ Ainda não usados {obraSel ? `nesta obra` : `nas minhas obras`}
                      </h3>
                      <span className="text-xs font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">
                        {naoUsadosOrd.length}
                      </span>
                    </div>
                    {naoUsadosOrd.length === 0 ? (
                      <p className="text-xs italic text-slate-500 py-4 text-center">
                        Todos os {temas.length} temas da biblioteca já foram apresentados {obraSel ? "nesta obra" : "nas suas obras"}. 🎉
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-[600px] overflow-auto pr-1">
                        {naoUsadosOrd.map((t: any) => <ColunaTema key={t.id} t={t} usado={false} />)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </TabsContent>

        {/* =================== SESSÕES =================== */}
        <TabsContent value="sessoes" className="mt-4">
          {selectedSessaoId ? (
            sessaoDetalheQ.isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Abrindo sessão #{selectedSessaoId}…
              </div>
            ) : sessaoDetalheQ.isError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <p className="text-red-700 font-semibold mb-2">Não foi possível abrir esta sessão.</p>
                <p className="text-xs text-red-600 mb-4">{(sessaoDetalheQ.error as any)?.message ?? "Erro desconhecido"}</p>
                <Button size="sm" variant="outline" onClick={() => setSelectedSessaoId(null)}>← Voltar à lista</Button>
              </div>
            ) : sessaoDetalheQ.data ? (
              <SessaoDetalhe
                companyId={companyId}
                sessao={sessaoDetalheQ.data as any}
                employees={(employeesQ.data as any[]) ?? []}
                idsJaNaSessao={idsJaNaSessao}
                addFuncId={addFuncId}
                setAddFuncId={setAddFuncId}
                presencaMut={presencaMut}
                finalizarMut={finalizarSessaoMut}
                excluirMut={excluirSessaoMut}
                gerarIAMut={gerarIAMut}
                atualizarSessaoMut={atualizarSessaoMut}
                voltar={() => setSelectedSessaoId(null)}
                selectedCompany={selectedCompany}
                userName={(user as any)?.name || (user as any)?.email || ""}
              />
            ) : null
          ) : (
            <>
              <PeriodSelectorCard
                ano={filtroAno}
                mes={filtroMes}
                onAno={setFiltroAno}
                onMes={setFiltroMes}
                onAnoTodo={() => setFiltroMes(null)}
                monthStatus={sessoesMesStatus}
                showLegend
                className="mb-4"
              />
            <SessoesList
              sessoes={sessoes}
              companyId={companyId}
              selecionadasIds={selecionadasIds}
              setSelecionadasIds={setSelecionadasIds}
              toggleSelecionada={toggleSelecionada}
              setSelectedSessaoId={setSelectedSessaoId}
              setEditarCategoriaId={setEditarCategoriaId}
              abrirNovaSessao={abrirNovaSessao}
              excluirSessaoMut={excluirSessaoMut}
              excluirSessoesMut={excluirSessoesMut}
              confirm={confirm}
              buscaSessoes={buscaSessoes}
              setBuscaSessoes={setBuscaSessoes}
              filtroObraSessoes={filtroObraSessoes}
              setFiltroObraSessoes={setFiltroObraSessoes}
              baixandoLote={baixandoLote}
              setBaixandoLote={setBaixandoLote}
              loteProgress={loteProgress}
              setLoteProgress={setLoteProgress}
            />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== MODAL: GERAR MAIS TEMAS COM IA (Rev. 1953) ===== */}
      <Dialog open={gerarMaisOpen} onOpenChange={(v) => { if (!gerarMaisMut.isPending) setGerarMaisOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" /> Gerar mais temas com IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              A IA vai gerar uma lista de <strong>novos</strong> temas de DDS para construção civil,
              evitando duplicar os <strong>{(temasQ.data as any[] ?? []).length}</strong> temas já
              cadastrados. Os roteiros detalhados podem ser gerados depois com o botão
              "🤖 Gerar todos os roteiros com IA".
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Quantos temas gerar?
              </label>
              <div className="flex gap-1">
                {[10, 20, 25, 30].map(n => (
                  <button key={n} type="button"
                    onClick={() => setGerarMaisQtd(n)}
                    disabled={gerarMaisMut.isPending}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                      gerarMaisQtd === n
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 italic">
                Cada lote leva ~{Math.ceil(gerarMaisQtd * 1.5)}s. Pra chegar nos 200+ você roda o
                botão {Math.ceil(200 / gerarMaisQtd)}x (variando o foco ajuda na diversidade).
              </p>
            </div>
            {/* Rev. 1955 — Barra de progresso 0-100% (estimada pelo tempo decorrido vs ETA) */}
            {gerarMaisMut.isPending && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                    Gerando {gerarMaisQtd} temas com IA...
                  </span>
                  <span className="text-emerald-700 font-mono tabular-nums">{gerarMaisProgress}%</span>
                </div>
                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${gerarMaisProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  {gerarMaisProgress < 95
                    ? "Conectando ao modelo, gerando JSON e validando títulos contra duplicatas..."
                    : "Quase lá — salvando no banco..."}
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Foco opcional (deixe em branco para diversidade geral)
              </label>
              <input
                type="text"
                value={gerarMaisFoco}
                onChange={e => setGerarMaisFoco(e.target.value)}
                disabled={gerarMaisMut.isPending}
                placeholder="ex.: trabalho em altura, saúde mental, equipamentos elétricos..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGerarMaisOpen(false)} disabled={gerarMaisMut.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => gerarMaisMut.mutate({ companyId, quantidade: gerarMaisQtd, foco: gerarMaisFoco.trim() || undefined })}
              disabled={gerarMaisMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {gerarMaisMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando {gerarMaisQtd} temas...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> Gerar {gerarMaisQtd} temas</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL: EDITAR CATEGORIA (Rev. 1876 — override granular por sessão) ===== */}
      <Dialog open={!!editarCategoriaId} onOpenChange={(v) => { if (!v) setEditarCategoriaId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar categoria da sessão</DialogTitle>
          </DialogHeader>
          {sessaoEditarCategoria && (() => {
            const s = sessaoEditarCategoria as any;
            const efetiva = (s.categoria ?? s.categoriaTema ?? null) as string | null;
            const temOverride = s.categoria != null;
            const opcoes: Array<{ v: string; label: string; desc: string }> = [
              { v: "NR",        label: "Norma Regulamentadora", desc: "Treinamentos vinculados às NRs do MTE (NR-06, NR-10, NR-18, NR-35...)." },
              { v: "CAMPANHA",  label: "Campanha Governamental", desc: "Maio Amarelo, Outubro Rosa, Novembro Azul, Setembro Amarelo etc." },
              { v: "VACINACAO", label: "Vacinação",              desc: "Imunização (PNI/Ministério da Saúde) — gripe, COVID, hepatite B etc." },
              { v: "LIVRE",     label: "Livre",                  desc: "DDS interno sem vínculo com NR/campanha." },
            ];
            return (
              <div className="space-y-4 py-2">
                <div className="text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2 border border-slate-200">
                  <div className="font-medium text-slate-800 truncate">{s.tituloTema}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {s.data ? new Date(s.data + "T12:00:00").toLocaleDateString("pt-BR") : ""}
                    {s.obraNome ? ` · ${s.obraNome}` : ""}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Categoria</label>
                  <Select
                    value={efetiva ?? ""}
                    onValueChange={(v) => {
                      if (!editarCategoriaId) return;
                      editarCategoriaMut.mutate({ companyId, id: editarCategoriaId, categoria: v as any });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                    <SelectContent>
                      {opcoes.map((o) => (
                        <SelectItem key={o.v} value={o.v}>
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{o.label}</span>
                            <span className="text-[11px] text-slate-500">{o.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {s.temaId && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      Categoria padrão do tema vinculado: <strong>{s.categoriaTema ?? "—"}</strong>. Mudar aqui só afeta <strong>esta sessão</strong>.
                    </p>
                  )}
                  {!s.temaId && (
                    <p className="text-[11px] text-amber-700 mt-2">
                      Esta sessão não está vinculada a nenhum tema da biblioteca, então a categoria é definida diretamente aqui.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2">
            {sessaoEditarCategoria && (sessaoEditarCategoria as any).categoria != null && (
              <Button
                type="button"
                variant="outline"
                disabled={editarCategoriaMut.isPending}
                onClick={() => {
                  if (!editarCategoriaId) return;
                  editarCategoriaMut.mutate({ companyId, id: editarCategoriaId, categoria: null });
                }}
              >
                {editarCategoriaMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Eraser className="h-3.5 w-3.5 mr-1" />}
                Limpar (herdar do tema)
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setEditarCategoriaId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL: TEMA (Rev. 1868 — fullscreen + 2 colunas para lançamento fluido em tablets) ===== */}
      <Dialog open={showTema} onOpenChange={setShowTema}>
        <DialogContent className="!max-w-none !w-screen !h-[100dvh] !top-0 !left-0 !translate-x-0 !translate-y-0 !rounded-none !border-0 p-0 flex flex-col gap-0 overflow-hidden sm:!max-w-none">
          {/* Header sticky */}
          <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg text-indigo-900">
                <BookOpen className="h-5 w-5" />
                {editTema ? "Editar tema" : "Novo tema"}
              </DialogTitle>
              <p className="text-xs text-indigo-700/80 mt-0.5">
                {editTema
                  ? "Ajuste os campos abaixo e salve."
                  : "Descreva o tema em poucas palavras e a IA preenche tudo. Você ainda pode editar antes de criar."}
              </p>
            </DialogHeader>
          </div>

          {/* Área central scrollável — 2 colunas em ≥lg, 1 coluna em < lg */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 sm:px-6 py-4 max-w-[1600px] mx-auto w-full">

              {/* === COLUNA ESQUERDA: IA + metadados === */}
              <div className="space-y-4">
                {/* === Bloco IA (só no modo "novo tema") === */}
                {!editTema && (
                  <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-violet-900">
                      <Wand2 className="h-4 w-4" />
                      Gerar com IA
                      <span className="text-[10px] uppercase tracking-wider bg-violet-200 text-violet-800 px-2 py-0.5 rounded-full font-semibold">novo</span>
                    </div>
                    <p className="text-[11px] text-violet-700">
                      Ex.: "trabalho em altura na fachada com balancim", "sinalização de área de escavação",
                      "uso correto de óculos e máscara em esmerilhamento".
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={iaPrompt}
                        onChange={e => setIaPrompt(e.target.value)}
                        placeholder="Descreva o tema em uma frase..."
                        className="flex-1 bg-white border-violet-200 focus-visible:ring-violet-400"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !gerarTemaIAMut.isPending) {
                            e.preventDefault();
                            handleGerarTemaIA();
                          }
                        }}
                        disabled={gerarTemaIAMut.isPending}
                      />
                      <Button
                        onClick={handleGerarTemaIA}
                        disabled={gerarTemaIAMut.isPending || iaPrompt.trim().length < 3}
                        className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                      >
                        {gerarTemaIAMut.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-1" /> Gerar</>
                        )}
                      </Button>
                    </div>
                    {/* Sugestões rápidas */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[
                        "Trabalho em altura com cinturão",
                        "Operação de betoneira",
                        "Escavação manual e sinalização",
                        "Uso de protetor auricular",
                        "Içamento de cargas com guincho",
                        "Prevenção de quedas de mesmo nível",
                      ].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setIaPrompt(s)}
                          disabled={gerarTemaIAMut.isPending}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 transition disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Título (campo principal — destacado) */}
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Título *</label>
                  <Input
                    value={temaForm.titulo}
                    onChange={e => setTemaForm({ ...temaForm, titulo: e.target.value })}
                    placeholder="ex.: Trabalho em altura — uso de cinturão tipo paraquedista"
                    className="text-base font-medium border-slate-300 focus-visible:ring-indigo-400 mt-1"
                  />
                </div>

                {/* Linha compacta: categoria + código + duração */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="text-[11px] font-medium text-slate-600">Categoria</label>
                    <Select value={temaForm.categoria} onValueChange={v => setTemaForm({ ...temaForm, categoria: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LIVRE">📋 Livre</SelectItem>
                        <SelectItem value="NR">⚠️ NR</SelectItem>
                        <SelectItem value="CAMPANHA">🎗️ Campanha</SelectItem>
                        <SelectItem value="VACINACAO">💉 Vacinação (PNI/MS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Rev. 1960 — Área temática (auto-preenchida pela IA, editável) */}
                  <div className="col-span-12">
                    <label className="text-[11px] font-medium text-slate-600">Área temática <span className="text-slate-400">(IA classifica automaticamente)</span></label>
                    <Select
                      value={temaForm.areaTema ?? "__none__"}
                      onValueChange={v => setTemaForm({ ...temaForm, areaTema: v === "__none__" ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Não classificada" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Não classificada —</SelectItem>
                        {DDS_AREA_VALUES.map(av => (
                          <SelectItem key={av} value={av}>
                            {DDS_AREAS[av].emoji} {DDS_AREAS[av].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-7 sm:col-span-4">
                    <label className="text-[11px] font-medium text-slate-600">Código</label>
                    <Input
                      value={temaForm.codigo}
                      onChange={e => setTemaForm({ ...temaForm, codigo: e.target.value })}
                      placeholder="NR-35"
                      className="font-mono"
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <label className="text-[11px] font-medium text-slate-600">Duração (min)</label>
                    <Input
                      type="number"
                      min={5}
                      max={60}
                      value={temaForm.duracaoMin}
                      onChange={e => setTemaForm({ ...temaForm, duracaoMin: parseInt(e.target.value) || 15 })}
                      className="text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600">Descrição (resumo curto)</label>
                  <Textarea
                    rows={3}
                    value={temaForm.descricao}
                    onChange={e => setTemaForm({ ...temaForm, descricao: e.target.value })}
                    placeholder="Resumo de 1 a 2 linhas que aparece no card da biblioteca"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-600">Norma de referência</label>
                  <Input
                    value={temaForm.normaReferencia}
                    onChange={e => setTemaForm({ ...temaForm, normaReferencia: e.target.value })}
                    placeholder="ex.: NR-18 (Portaria MTP 3.733/2020)"
                  />
                </div>
              </div>

              {/* === COLUNA DIREITA: Conteúdo/Roteiro (área grande) === */}
              <div className="flex flex-col min-h-[40vh] lg:min-h-[60vh]">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Conteúdo / Roteiro completo (markdown)
                  </label>
                  {temaForm.conteudoMd && (
                    <span className="text-[10px] text-slate-500">
                      {temaForm.conteudoMd.length.toLocaleString("pt-BR")} caracteres
                    </span>
                  )}
                </div>
                <Textarea
                  value={temaForm.conteudoMd}
                  onChange={e => setTemaForm({ ...temaForm, conteudoMd: e.target.value })}
                  placeholder="Roteiro do DDS, riscos, recomendações, EPIs obrigatórios, normas..."
                  className="font-mono text-xs flex-1 min-h-[300px] lg:min-h-[500px] resize-none"
                />
              </div>
            </div>
          </div>

          {/* Footer sticky */}
          <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-slate-50 shrink-0 gap-2">
            <Button variant="outline" onClick={() => setShowTema(false)}>Cancelar</Button>
            <Button
              onClick={handleSalvarTema}
              disabled={salvarTemaMut.isPending || atualizarTemaMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Check className="h-4 w-4 mr-1" />
              {editTema ? "Salvar alterações" : "Criar tema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL: NOVA SESSÃO (Rev. 1731 — full-screen + sidebar de obras + alerta acidente D-1 + transferir colaborador) ===== */}
      <Dialog open={showSessao} onOpenChange={setShowSessao}>
        <DialogContent className="!max-w-none !w-screen !h-screen !top-0 !left-0 !translate-x-0 !translate-y-0 !rounded-none !border-0 p-0 flex flex-col gap-0 overflow-hidden sm:!max-w-none">
          {(() => {
            const temaSel = temas.find((t: any) => String(t.id) === String(sessaoForm.temaId));
            const corBanner = temaSel?.corCampanha ? corCfg(temaSel.corCampanha) : null;
            const hoje = new Date().toISOString().slice(0, 10);
            const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
            const recentLocais = getRecentLocais(companyId);
            const equipeObra = (funcsObraQ.data as any[]) ?? [];
            // Rev. 2021 — equipe agora vem com CLT + Terceiros misturados (campo `tipo`).
            const totalMarcados = sessaoForm.funcionarioIds.length + (sessaoForm.funcTerceiroIds?.length ?? 0);
            const todosSelecionados = equipeObra.length > 0 && equipeObra.every((e: any) =>
              e.tipo === "terceiro"
                ? (sessaoForm.funcTerceiroIds ?? []).includes(e.funcTerceiroId)
                : sessaoForm.funcionarioIds.includes(e.employeeId)
            );
            const equipeFiltrada = buscaFunc
              ? equipeObra.filter((e: any) =>
                  e.nome?.toLowerCase().includes(buscaFunc.toLowerCase()) ||
                  e.funcao?.toLowerCase().includes(buscaFunc.toLowerCase())
                )
              : equipeObra;
            // Rev. 1731 fix: só obras Em_Andamento (já vêm com permissão de allowedObras aplicada pelo listActive)
            // Rev. 1733 — Consolida obras por NOME canônico (mesma regra do getEfetivoPorObra/cadastro > Efetivo).
            // Quando há duplicatas (mesmo nome, IDs diferentes), unifica numa entrada só com obraIds=[...].
            const obrasList = ((obrasQ.data as any[]) ?? []).filter((o: any) => !o.status || o.status === "Em_Andamento");
            const consolidadasMap = new Map<string, { idCanonico: number; ids: number[]; nome: string; cidade: string | null; uf: string | null }>();
            for (const o of obrasList) {
              const key = (o.nome || "").trim().toUpperCase();
              if (!key) continue;
              const ent = consolidadasMap.get(key);
              if (ent) {
                if (!ent.ids.includes(o.id)) ent.ids.push(o.id);
              } else {
                consolidadasMap.set(key, { idCanonico: o.id, ids: [o.id], nome: o.nome, cidade: o.cidade ?? null, uf: o.uf ?? null });
              }
            }
            const obrasConsolidadas = Array.from(consolidadasMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
            const obrasFiltradas = buscaObra
              ? obrasConsolidadas.filter((o) => o.nome?.toLowerCase().includes(buscaObra.toLowerCase()))
              : obrasConsolidadas;
            const obraSelObj = obrasConsolidadas.find((o) => obrasIdsSel.length > 0 && o.ids.some((id) => obrasIdsSel.includes(id))) || null;
            const acidentesAll = (acidentesQ.data as any[]) ?? [];
            const acidentesObrigatorios = acidentesAll.filter((a: any) => a.obrigatorio);
            const fmtData = (iso: string) => {
              const [y, m, d] = (iso || "").split("-");
              return d ? `${d}/${m}/${y}` : iso;
            };
            const aplicarAcidenteComoTema = (a: any) => {
              const titulo = `Análise do acidente de ${fmtData(a.dataAcidente)} — ${a.tipoAcidente}`;
              const conteudo = [
                `📋 ANÁLISE DO ACIDENTE — DDS OBRIGATÓRIO (Lei art. 157 CLT, NR-1)`,
                ``,
                `📅 Data/hora: ${fmtData(a.dataAcidente)}${a.horaAcidente ? ` às ${a.horaAcidente}` : ""}`,
                a.empNome ? `👤 Colaborador envolvido: ${a.empNome}` : null,
                a.obraNome ? `🏗️ Obra: ${a.obraNome}` : null,
                `⚠️ Tipo: ${a.tipoAcidente}`,
                `🩹 Gravidade: ${a.gravidade}`,
                a.localAcidente ? `📍 Local: ${a.localAcidente}` : null,
                a.parteCorpoAtingida ? `🦴 Parte do corpo atingida: ${a.parteCorpoAtingida}` : null,
                a.agenteCausador ? `🔧 Agente causador: ${a.agenteCausador}` : null,
                a.diasAfastamento ? `⏱️ Dias de afastamento: ${a.diasAfastamento}` : null,
                ``,
                a.descricao ? `📝 DESCRIÇÃO DOS FATOS:\n${a.descricao}` : null,
                ``,
                a.acaoCorretiva ? `✅ AÇÃO CORRETIVA / LIÇÕES APRENDIDAS:\n${a.acaoCorretiva}` : null,
                ``,
                `🎯 PONTOS A REFORÇAR COM A EQUIPE:`,
                `- Causa raiz e fatores contribuintes`,
                `- Procedimento correto a ser seguido`,
                `- EPIs / medidas de proteção aplicáveis`,
                `- Como reportar quase-acidentes`,
              ].filter(Boolean).join("\n");
              setSessaoForm((s: any) => ({
                ...s,
                temaId: "",
                tituloTema: titulo,
                conteudoMd: conteudo,
              }));
              setShowRoteiro(true);
              toast.success("Tema preenchido com os dados do acidente");
            };
            return (
              <>
                {/* HEADER colorido (cor da campanha quando há tema selecionado) */}
                <div className={`px-6 pt-5 pb-4 rounded-t-lg ${corBanner ? `${corBanner.bg} border-b-4 ${corBanner.border}` : "bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200"}`}>
                  <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 text-lg ${corBanner ? corBanner.text : "text-emerald-900"}`}>
                      <ClipboardCheck className="h-5 w-5" />
                      Nova Sessão DDS
                      {temaSel?.codigo && (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${corBanner?.chip ?? "bg-emerald-500 text-white"}`}>
                          {temaSel.codigo}
                        </span>
                      )}
                    </DialogTitle>
                    {temaSel && (
                      <p className={`text-sm font-semibold ${corBanner?.text ?? "text-emerald-800"} mt-1`}>
                        {temaSel.titulo}
                      </p>
                    )}
                  </DialogHeader>
                </div>

                <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
                  {/* ====== SIDEBAR: OBRAS (eixo principal — DDS é por obra) ====== */}
                  <aside className="col-span-12 lg:col-span-3 border-r border-slate-200 bg-slate-50/60 overflow-y-auto p-3 space-y-2">
                    <div className="sticky top-0 bg-slate-50/95 backdrop-blur pb-2 -mt-3 -mx-3 px-3 pt-3 border-b border-slate-200 z-10">
                      <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1">
                        Obras ({obrasConsolidadas.length})
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                        <Input value={buscaObra} onChange={e => setBuscaObra(e.target.value)}
                          placeholder="Buscar obra..." className="h-8 pl-7 text-xs" />
                      </div>
                    </div>
                    {/* Card "Avulsa/Escritório" */}
                    <button type="button"
                      onClick={() => setSessaoForm({ ...sessaoForm, obraId: "", obraIds: [], funcionarioIds: [] })}
                      className={`w-full text-left rounded-lg border-2 px-3 py-2 transition ${obrasIdsSel.length === 0 ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700">Avulsa / Escritório</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Sem vínculo a obra</div>
                    </button>
                    {/* Lista de obras (consolidadas por nome) */}
                    {obrasFiltradas.map((o) => {
                      const sel = obrasIdsSel.length > 0 && o.ids.some((id) => obrasIdsSel.includes(id));
                      const acidObra = acidentesAll.filter((a: any) => o.ids.includes(a.obraId) && a.obrigatorio).length;
                      return (
                        <button key={o.idCanonico} type="button"
                          onClick={() => setSessaoForm({ ...sessaoForm, obraId: String(o.idCanonico), obraIds: o.ids, funcionarioIds: [] })}
                          className={`w-full text-left rounded-lg border-2 px-3 py-2 transition ${sel ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                          <div className="flex items-start gap-2">
                            <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${sel ? "bg-emerald-500" : "bg-slate-300"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 truncate">{o.nome}</div>
                              {o.cidade && <div className="text-[10px] text-slate-500 truncate">{o.cidade}{o.uf ? `/${o.uf}` : ""}</div>}
                              {o.ids.length > 1 && (
                                <div className="text-[9px] text-slate-400 italic">{o.ids.length} cadastros consolidados</div>
                              )}
                            </div>
                            {acidObra > 0 && (
                              <span title="Acidente recente — DDS obrigatório" className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold animate-pulse">
                                ⚠️ {acidObra}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {obrasFiltradas.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-4">
                        {buscaObra ? `Nenhuma obra para "${buscaObra}"` : "Nenhuma obra cadastrada"}
                      </p>
                    )}
                  </aside>

                  {/* ====== MAIN: FORMULÁRIO ====== */}
                  <main className="col-span-12 lg:col-span-9 overflow-y-auto p-5 space-y-4">
                    {/* OBRA SELECIONADA — barra-resumo */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                      <MapPin className="h-5 w-5 text-emerald-600" />
                      <div className="flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Obra alvo do DDS</div>
                        <div className="text-base font-bold text-slate-800">
                          {obraSelObj ? obraSelObj.nome : "Avulsa / Escritório"}
                        </div>
                      </div>
                      {obrasIdsSel.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                          {equipeObra.length} colaborador(es) na equipe
                        </span>
                      )}
                    </div>

                    {/* ⚠️ ALERTA ACIDENTE D-1 (Lei art. 157 CLT) — TOPO ABSOLUTO */}
                    {acidentesObrigatorios.length > 0 && (
                      <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-red-500 text-white flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-red-900">
                              DDS OBRIGATÓRIO HOJE — Acidente registrado ontem
                            </h3>
                            <p className="text-xs text-red-700 mb-2">
                              Lei art. 157 CLT / NR-1: o DDS do dia seguinte ao acidente deve abordar obrigatoriamente os fatos, causas e medidas preventivas.
                            </p>
                            <div className="space-y-2">
                              {acidentesObrigatorios.map((a: any) => (
                                <div key={a.id} className="rounded-lg bg-white border border-red-200 px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-red-900">
                                        {a.tipoAcidente} <span className="font-normal text-slate-600">— {a.gravidade}</span>
                                      </div>
                                      <div className="text-[11px] text-slate-700 mt-0.5">
                                        {a.empNome && <span className="font-medium">{a.empNome}</span>}
                                        {a.obraNome && <> · {a.obraNome}</>}
                                        {a.localAcidente && <> · {a.localAcidente}</>}
                                      </div>
                                      {a.descricao && (
                                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 italic">"{a.descricao}"</p>
                                      )}
                                    </div>
                                    <button type="button"
                                      onClick={() => aplicarAcidenteComoTema(a)}
                                      className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 whitespace-nowrap">
                                      Aplicar como tema
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Acidentes nos últimos 7 dias (não-obrigatórios) — dica suave */}
                    {acidentesAll.filter((a: any) => !a.obrigatorio).length > 0 && acidentesObrigatorios.length === 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                        <div className="font-semibold text-amber-900 mb-1">
                          ℹ️ {acidentesAll.length} acidente(s) nos últimos 7 dias{obrasIdsSel.length > 0 ? " (nesta obra/empresa)" : " na empresa"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {acidentesAll.slice(0, 3).map((a: any) => (
                            <button key={a.id} type="button"
                              onClick={() => aplicarAcidenteComoTema(a)}
                              className="px-2 py-0.5 rounded-full bg-white border border-amber-300 text-amber-800 text-[10px] hover:bg-amber-100">
                              {fmtData(a.dataAcidente)} · {a.tipoAcidente}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BLOCO 1 — QUANDO (Data + Hora) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-6">
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> Data *
                        </label>
                        <Input type="date" value={sessaoForm.data} onChange={e => setSessaoForm({ ...sessaoForm, data: e.target.value })} />
                        <div className="flex gap-1 mt-1">
                          <button type="button"
                            onClick={() => setSessaoForm({ ...sessaoForm, data: hoje })}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sessaoForm.data === hoje ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                            Hoje
                          </button>
                          <button type="button"
                            onClick={() => setSessaoForm({ ...sessaoForm, data: ontem })}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sessaoForm.data === ontem ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                            Ontem
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-6">
                        <label className="text-xs font-medium text-slate-600">Hora</label>
                        <Input type="time" value={sessaoForm.hora} onChange={e => setSessaoForm({ ...sessaoForm, hora: e.target.value })} />
                        <div className="flex gap-1 mt-1">
                          {["07:00", "07:30", "12:00", "13:00"].map(h => (
                            <button key={h} type="button"
                              onClick={() => setSessaoForm({ ...sessaoForm, hora: h })}
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${sessaoForm.hora === h ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                              {h}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* BLOCO 2 — TEMA (com sugestão automática + categorias) */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> Tema da biblioteca
                      <span className="text-[10px] text-emerald-600 font-normal italic ml-1">
                        (✨ sugerido automaticamente o tema do mês)
                      </span>
                    </label>
                    <Select value={sessaoForm.temaId || "_livre"} onValueChange={v => {
                      if (v === "_livre") { setSessaoForm({ ...sessaoForm, temaId: "", tituloTema: "", conteudoMd: "" }); return; }
                      const t = temas.find((x: any) => String(x.id) === v);
                      setSessaoForm({
                        ...sessaoForm, temaId: v,
                        tituloTema: t?.titulo ?? sessaoForm.tituloTema,
                        conteudoMd: t?.conteudoMd ?? t?.descricao ?? sessaoForm.conteudoMd,
                      });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione um tema (ou crie um livre)" /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value="_livre">📝 Tema livre (sem vínculo à biblioteca)</SelectItem>
                        {["VACINACAO", "CAMPANHA", "NR", "LIVRE"].flatMap(cat => {
                          // Rev. 1957 — ordena por uso (novos primeiro) e anota "✓ Nx" nos já usados
                          let lista = temas.filter((t: any) => t.categoria === cat);
                          lista = [...lista].sort((a: any, b: any) => {
                            const ca = usoPorTema.get(a.id)?.count ?? 0;
                            const cb = usoPorTema.get(b.id)?.count ?? 0;
                            return ca - cb;
                          });
                          if (lista.length === 0) return [];
                          const labelCat = cat === "VACINACAO" ? "💉 VACINAÇÃO" : cat === "CAMPANHA" ? "📢 CAMPANHAS" : cat === "NR" ? "⚠️ NRs" : "📋 LIVRES";
                          return [
                            <div key={`h-${cat}`} className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">
                              {labelCat}
                            </div>,
                            ...lista.map((t: any) => {
                              const uso = usoPorTema.get(t.id);
                              const marca = uso && uso.count > 0 ? ` · ✓${uso.count}x` : " · ✨ novo";
                              return (
                                <SelectItem key={t.id} value={String(t.id)}>
                                  {t.codigo ? `[${t.codigo}] ` : ""}{t.titulo}{marca}
                                </SelectItem>
                              );
                            }),
                          ];
                        })}
                      </SelectContent>
                    </Select>
                    {/* Rev. 1957 — alerta quando tema escolhido já foi usado (sugere novo) */}
                    {(() => {
                      const tid = sessaoForm.temaId ? Number(sessaoForm.temaId) : null;
                      if (!tid) return null;
                      const uso = usoPorTema.get(tid);
                      if (!uso || uso.count === 0) return null;
                      // sugere 1 tema NOVO da mesma categoria
                      const temaAtual = temas.find((t: any) => t.id === tid);
                      const sugestao = temas.find((t: any) =>
                        t.categoria === temaAtual?.categoria &&
                        t.id !== tid &&
                        (usoPorTema.get(t.id)?.count ?? 0) === 0
                      );
                      const dataFmt = uso.ultimaData ? new Date(uso.ultimaData + "T12:00:00").toLocaleDateString("pt-BR") : "—";
                      return (
                        <div className="mt-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs">
                          <div className="font-semibold text-amber-900 flex items-center gap-1">
                            ⚠️ Tema já apresentado {uso.count}×
                          </div>
                          <div className="text-amber-800 mt-0.5">
                            Última vez: <strong>{dataFmt}</strong>
                            {uso.diasAtras !== null && (uso.diasAtras === 0 ? " (hoje)" : ` (há ${uso.diasAtras} dia${uso.diasAtras === 1 ? "" : "s"})`)}.
                            Você pode repetir, mas variar amplia as orientações.
                          </div>
                          {sugestao && (
                            <button
                              type="button"
                              onClick={() => setSessaoForm({
                                ...sessaoForm,
                                temaId: String(sugestao.id),
                                tituloTema: sugestao.titulo,
                                conteudoMd: sugestao.conteudoMd ?? sugestao.descricao ?? "",
                              })}
                              className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700"
                            >
                              ✨ Trocar por "{sugestao.titulo.length > 50 ? sugestao.titulo.slice(0, 50) + "…" : sugestao.titulo}"
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* BLOCO 3 — TÍTULO + ROTEIRO COLAPSÁVEL */}
                  <div>
                    <label className="text-xs font-medium text-slate-600">Título do tema *</label>
                    <Input value={sessaoForm.tituloTema} onChange={e => setSessaoForm({ ...sessaoForm, tituloTema: e.target.value })}
                      placeholder="Ex.: Uso correto de EPI em altura" />
                  </div>
                  <div>
                    <button type="button"
                      onClick={() => setShowRoteiro(s => !s)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
                    >
                      {showRoteiro ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Conteúdo / roteiro {sessaoForm.conteudoMd ? `(${sessaoForm.conteudoMd.length} caracteres)` : "(opcional)"}
                    </button>
                    {showRoteiro && (
                      <>
                        {/* Rev. 1740 — botão Gerar com IA dentro da Nova Sessão */}
                        <div className="flex items-center gap-2 mt-1 mb-1 flex-wrap">
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={gerarIAMut.isPending || !sessaoForm.tituloTema?.trim()}
                            onClick={async () => {
                              try {
                                // funções da equipe pré-selecionada na obra (bloco 6)
                                const selSet = new Set<number>(sessaoForm.funcionarioIds ?? []);
                                const funcoes = (funcsObraQ.data ?? [])
                                  .filter((f: any) => selSet.has(f.employeeId))
                                  .map((f: any) => f.funcao)
                                  .filter(Boolean);
                                const obraNomeAtual = obrasConsolidadas
                                  .find((o: any) => String(o.idCanonico) === String(sessaoForm.obraId))?.nome;
                                const r = await gerarIAMut.mutateAsync({
                                  companyId,
                                  titulo: sessaoForm.tituloTema,
                                  obraNome: obraNomeAtual,
                                  funcoesPresentes: funcoes,
                                });
                                setSessaoForm((s: any) => ({ ...s, conteudoMd: r.conteudoMd }));
                                toast.success("Roteiro gerado com IA.");
                              } catch (e: any) {
                                toast.error(e?.message ?? "Falha ao gerar com IA");
                              }
                            }}
                            className="border-violet-300 text-violet-700 hover:bg-violet-50 h-7 text-xs"
                          >
                            {gerarIAMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                            {gerarIAMut.isPending ? "Gerando..." : (sessaoForm.conteudoMd ? "Regerar com IA" : "Gerar com IA")}
                          </Button>
                          {sessaoForm.conteudoMd && (
                            <span className="text-[10px] text-slate-500 italic">A geração considera obra e funções da equipe pré-selecionada.</span>
                          )}
                        </div>
                        <Textarea rows={6} value={sessaoForm.conteudoMd}
                          onChange={e => setSessaoForm({ ...sessaoForm, conteudoMd: e.target.value })}
                          className="mt-1 font-mono text-xs"
                          placeholder="Roteiro / pontos abordados na sessão (markdown: ## Cabeçalho, **negrito**, listas)..." />
                        {sessaoForm.conteudoMd && (
                          <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 max-h-72 overflow-auto">
                            <p className="text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Pré-visualização</p>
                            <RoteiroMd md={sessaoForm.conteudoMd} />
                          </div>
                        )}
                      </>
                    )}
                    {!showRoteiro && sessaoForm.conteudoMd && (
                      <div className="mt-1 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 max-h-32 overflow-hidden relative">
                        <RoteiroMd md={sessaoForm.conteudoMd} className="text-xs" />
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
                      </div>
                    )}
                  </div>

                  {/* BLOCO 4 — INSTRUTOR (auto-fill + máscara CPF) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <UserCheck className="h-3 w-3" /> Instrutor
                      </label>
                      {(() => {
                        const nomeUser = (user as any)?.nome ?? (user as any)?.name ?? (user as any)?.loginName ?? (user as any)?.email;
                        if (!nomeUser || sessaoForm.instrutor === nomeUser) return null;
                        return (
                          <button type="button"
                            onClick={() => {
                              // Rev. 1873 — LGPD: auto-fill Código Interno via lookup do nome do user na lista de employees.
                              const emp = (employeesQ.data as any[] | undefined)?.find((e: any) =>
                                String(e.nomeCompleto || "").trim().toLowerCase() === String(nomeUser).trim().toLowerCase()
                              );
                              setSessaoForm({
                                ...sessaoForm,
                                instrutor: nomeUser,
                                instrutorCodigoInterno: emp?.codigoInterno ? String(emp.codigoInterno) : "",
                              });
                            }}
                            className="text-[10px] text-emerald-700 font-semibold hover:underline">
                            ✓ Sou eu ({nomeUser})
                          </button>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <div className="md:col-span-7">
                        <Input value={sessaoForm.instrutor}
                          onChange={e => {
                            // Rev. 1873 — ao digitar/escolher nome, auto-fill Código Interno se houver match exato em employees.
                            // Se não há match, limpa o código (evita pares nome+código inconsistentes salvos no banco).
                            const novoNome = e.target.value;
                            const emp = (employeesQ.data as any[] | undefined)?.find((emp: any) =>
                              String(emp.nomeCompleto || "").trim().toLowerCase() === novoNome.trim().toLowerCase()
                            );
                            setSessaoForm({
                              ...sessaoForm,
                              instrutor: novoNome,
                              instrutorCodigoInterno: emp?.codigoInterno ? String(emp.codigoInterno) : "",
                            });
                          }}
                          placeholder="Nome do instrutor"
                          list="dds-instrutor-list" />
                        <datalist id="dds-instrutor-list">
                          {((employeesQ.data as any[] | undefined) ?? [])
                            .filter((e: any) => e.codigoInterno)
                            .slice(0, 200)
                            .map((e: any) => (
                              <option key={e.id} value={e.nomeCompleto}>{e.codigoInterno}</option>
                            ))}
                        </datalist>
                      </div>
                      <div className="md:col-span-5">
                        <Input value={sessaoForm.instrutorCodigoInterno}
                          onChange={e => setSessaoForm({ ...sessaoForm, instrutorCodigoInterno: e.target.value.trim().slice(0, 50) })}
                          placeholder="Código interno do funcionário" maxLength={50}
                          title="Preenchido automaticamente quando o nome do instrutor confere com um colaborador cadastrado (LGPD: substitui CPF)." />
                      </div>
                    </div>
                  </div>

                  {/* BLOCO 5 — LOCAL (com histórico) */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Local
                    </label>
                    <Input value={sessaoForm.local}
                      onChange={e => setSessaoForm({ ...sessaoForm, local: e.target.value })}
                      placeholder="ex.: Refeitório / Pátio / Sala de treinamento"
                      list="dds-locais-recentes" />
                    {recentLocais.length > 0 && (
                      <>
                        <datalist id="dds-locais-recentes">
                          {recentLocais.map(l => <option key={l} value={l} />)}
                        </datalist>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {recentLocais.slice(0, 5).map(l => (
                            <button key={l} type="button"
                              onClick={() => setSessaoForm({ ...sessaoForm, local: l })}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${sessaoForm.local === l ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300"}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                    {/* BLOCO 6 — EQUIPE DA OBRA (pré-seleção em massa + transferir colaborador) */}
                    {obrasIdsSel.length > 0 && (
                      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-4">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <label className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                            <Users className="h-4 w-4" /> Equipe da obra
                            {funcsObraQ.isLoading && <span className="text-[11px] font-normal text-slate-500 italic">(carregando...)</span>}
                            {!funcsObraQ.isLoading && (() => {
                              const qtdTerc = equipeObra.filter((e: any) => e.tipo === "terceiro").length;
                              return (
                                <span className="text-[11px] font-normal text-slate-600">
                                  ({totalMarcados} de {equipeObra.length} marcado(s) como presente
                                  {qtdTerc > 0 && <> · inclui <strong className="text-orange-700">{qtdTerc} terceiro(s)</strong></>})
                                </span>
                              );
                            })()}
                          </label>
                          <div className="flex items-center gap-2">
                            {equipeObra.length > 0 && (
                              <button type="button"
                                onClick={() => {
                                  if (todosSelecionados) {
                                    setSessaoForm({ ...sessaoForm, funcionarioIds: [], funcTerceiroIds: [] });
                                  } else {
                                    // Rev. 2021 — separa CLT (employeeId) de Terceiros (funcTerceiroId).
                                    const clts = equipeObra.filter((e: any) => e.tipo !== "terceiro").map((e: any) => e.employeeId).filter(Boolean);
                                    const tercs = equipeObra.filter((e: any) => e.tipo === "terceiro").map((e: any) => e.funcTerceiroId).filter(Boolean);
                                    setSessaoForm({ ...sessaoForm, funcionarioIds: clts, funcTerceiroIds: tercs });
                                  }
                                }}
                                className="text-[11px] font-semibold text-emerald-700 hover:underline">
                                {todosSelecionados ? "Desmarcar todos" : `✓ Selecionar todos (${equipeObra.length})`}
                              </button>
                            )}
                            <button type="button"
                              onClick={() => setShowTransferir(true)}
                              className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 flex items-center gap-1">
                              <Plus className="h-3 w-3" /> Transferir colaborador
                            </button>
                          </div>
                        </div>
                        {equipeObra.length === 0 && !funcsObraQ.isLoading && (
                          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-center">
                            <p className="text-xs text-amber-900 font-semibold mb-1">
                              ⚠️ Nenhum colaborador vinculado a esta obra
                            </p>
                            <p className="text-[11px] text-amber-700 mb-2">
                              Use "Transferir colaborador" para vincular colaboradores ativos da empresa e regularizar a equipe agora.
                            </p>
                          </div>
                        )}
                        {equipeObra.length > 0 && (
                          <>
                            <div className="relative mb-2">
                              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                              <Input value={buscaFunc} onChange={e => setBuscaFunc(e.target.value)}
                                placeholder="Buscar por nome ou função..." className="h-8 pl-7 text-xs" />
                            </div>
                            <div className="max-h-72 overflow-y-auto bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                              {equipeFiltrada.map((e: any) => {
                                // Rev. 2021 — chave única (CLT usa employeeId; Terceiro usa funcTerceiroId).
                                const isTerc = e.tipo === "terceiro";
                                const key = isTerc ? `t-${e.funcTerceiroId}` : `c-${e.employeeId}`;
                                const sel = isTerc
                                  ? (sessaoForm.funcTerceiroIds ?? []).includes(e.funcTerceiroId)
                                  : sessaoForm.funcionarioIds.includes(e.employeeId);
                                return (
                                  <label key={key}
                                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-emerald-50 ${sel ? "bg-emerald-50" : ""}`}>
                                    <input type="checkbox" checked={sel}
                                      onChange={() => {
                                        if (isTerc) {
                                          const ids = sessaoForm.funcTerceiroIds ?? [];
                                          setSessaoForm({
                                            ...sessaoForm,
                                            funcTerceiroIds: sel
                                              ? ids.filter((x: number) => x !== e.funcTerceiroId)
                                              : [...ids, e.funcTerceiroId],
                                          });
                                        } else {
                                          const ids = sessaoForm.funcionarioIds;
                                          setSessaoForm({
                                            ...sessaoForm,
                                            funcionarioIds: sel
                                              ? ids.filter((x: number) => x !== e.employeeId)
                                              : [...ids, e.employeeId],
                                          });
                                        }
                                      }}
                                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                                        {e.nome}
                                        {isTerc && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[9px] font-bold uppercase tracking-wide" title="Funcionário Terceiro vinculado a esta obra">
                                            Terceiro
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 truncate">
                                        {e.funcaoNaObra ?? e.funcao ?? "—"}
                                        {!isTerc && e.status && e.status !== "Ativo" && (
                                          <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800 font-semibold">{e.status}</span>
                                        )}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                              {equipeFiltrada.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-3">Nenhum resultado para "{buscaFunc}"</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* BLOCO 7 — OBSERVAÇÕES (compacto) */}
                    <div>
                      <label className="text-xs font-medium text-slate-600">Observações (opcional)</label>
                      <Textarea rows={2} value={sessaoForm.observacoes}
                        onChange={e => setSessaoForm({ ...sessaoForm, observacoes: e.target.value })}
                        placeholder="Notas adicionais sobre esta sessão..." />
                    </div>
                  </main>
                </div>
              </>
            );
          })()}
          <DialogFooter className="px-5 py-3 border-t border-slate-200 bg-white !mt-0 flex-shrink-0">
            <Button variant="outline" onClick={() => setShowSessao(false)}>Cancelar</Button>
            <Button onClick={handleSalvarSessao} disabled={criarSessaoMut.isPending}>
              {criarSessaoMut.isPending ? "Criando..." : "Criar sessão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== SUB-DIÁLOGO: TRANSFERIR COLABORADOR PARA A OBRA (Rev. 1731) ===== */}
      <Dialog open={showTransferir} onOpenChange={setShowTransferir}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" /> Transferir colaborador para a obra
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              Lista colaboradores ativos da empresa que ainda <strong>não estão vinculados</strong> a esta obra.
              Ao confirmar, o colaborador é vinculado e marcado como presente nesta sessão.
            </p>
          </DialogHeader>
          <div className="px-5 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={buscaTransferir} onChange={e => setBuscaTransferir(e.target.value)}
                placeholder="Buscar por nome, CPF ou função..." className="pl-8" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {candidatosTransferQ.isLoading && (
              <p className="text-xs text-slate-500 italic text-center py-6">Carregando colaboradores...</p>
            )}
            {!candidatosTransferQ.isLoading && (() => {
              const all = (candidatosTransferQ.data as any[]) ?? [];
              const filtrados = buscaTransferir
                ? all.filter((c: any) =>
                    c.nome?.toLowerCase().includes(buscaTransferir.toLowerCase()) ||
                    c.cpf?.includes(buscaTransferir) ||
                    c.funcao?.toLowerCase().includes(buscaTransferir.toLowerCase()))
                : all;
              if (filtrados.length === 0) {
                return (
                  <p className="text-xs text-slate-400 italic text-center py-6">
                    {buscaTransferir
                      ? `Nenhum colaborador para "${buscaTransferir}"`
                      : "Todos os colaboradores ativos já estão vinculados a esta obra."}
                  </p>
                );
              }
              return (
                <div className="divide-y divide-slate-100">
                  {filtrados.map((c: any) => {
                    // Rev. 2024 — itens podem ser CLT ou TERCEIRO. Mesma UI,
                    // chip laranja diferencia + mostra obra atual se houver.
                    const isTerc = c.tipo === "terceiro";
                    const itemKey = `${c.tipo ?? "clt"}-${c.id ?? c.funcTerceiroId}`;
                    return (
                      <div key={itemKey} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                            {c.nome}
                            {isTerc && (
                              <span
                                className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded"
                                title="Funcionário terceirizado — vinculado por obra"
                              >
                                Terceiro
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {c.funcao ?? "—"}
                            {c.cpf && <> · CPF {maskCpf(c.cpf)}</>}
                            {isTerc && c.obraAtualNome && (
                              <span className="ml-1 px-1 rounded bg-slate-100 text-slate-700">
                                hoje em: {c.obraAtualNome}
                              </span>
                            )}
                            {c.status && c.status !== "Ativo" && c.status !== "ativo" && (
                              <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800 font-semibold">{c.status}</span>
                            )}
                          </div>
                        </div>
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            // Rev. 1733 — transfere para o ID canônico (primeiro da lista consolidada)
                            // Rev. 2024 — payload muda conforme tipo (clt vs terceiro).
                            const target = obrasIdsSel[0];
                            if (!target) { toast.error("Selecione uma obra"); return; }
                            if (isTerc) {
                              transferirMut.mutate({ companyId, obraId: target, tipo: "terceiro", funcTerceiroId: c.funcTerceiroId });
                            } else {
                              transferirMut.mutate({ companyId, obraId: target, tipo: "clt", employeeId: c.id });
                            }
                          }}
                          disabled={transferirMut.isPending}>
                          {isTerc && c.obraAtualNome ? "Mover →" : "Transferir →"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <DialogFooter className="px-5 py-3 border-t">
            <Button variant="outline" onClick={() => setShowTransferir(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}

function SessaoDetalhe({
  companyId, sessao, employees, idsJaNaSessao, addFuncId, setAddFuncId,
  presencaMut, finalizarMut, excluirMut, gerarIAMut, atualizarSessaoMut, voltar,
  selectedCompany, userName,
}: any) {
  // Rev. 1740 — edição inline do roteiro detalhado da sessão
  const [editandoRoteiro, setEditandoRoteiro] = useState(false);
  const [roteiroBuf, setRoteiroBuf] = useState<string>(sessao.conteudoMd ?? "");
  // Rev. 1773 — confirm bonito (substitui confirm() nativo)
  const { confirm, ConfirmDialog } = useConfirm();
  useEffect(() => { setRoteiroBuf(sessao.conteudoMd ?? ""); }, [sessao.id, sessao.conteudoMd]);
  const sessaoEditavel = sessao.status !== "finalizada" && sessao.status !== "cancelada";
  const temRoteiroSessao = (sessao.conteudoMd ?? "").trim().length >= 80;
  const funcs = sessao.funcionarios ?? [];
  const presentes = funcs.filter((f: any) => f.presente === 1).length;
  const assinados = funcs.filter((f: any) => !!f.assinadoEm).length;

  // PDF export — abre rota Express dedicada (evita crash por payload gigante de assinaturas via tRPC)
  const [gerandoPdf, setGerandoPdf] = useState(false);

  async function gerarPdfDds() {
    setGerandoPdf(true);
    try {
      const resp = await fetch(`/api/dds-ata/${sessao.id}?companyId=${companyId}`);
      if (!resp.ok) throw new Error("Erro ao gerar PDF");
      const blob = await resp.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = `DDS_Ata_${sessao.id}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch {
      toast.error("Erro ao baixar PDF");
    } finally {
      setTimeout(() => setGerandoPdf(false), 800);
    }
  }

  // Rev. 1746 — Assinatura digital por funcionário (canvas)
  const utilsTrpc = trpc.useUtils();
  const [assinandoId, setAssinandoId] = useState<number | null>(null);
  const salvarAssinaturaMut = trpc.dds.registrarAssinatura.useMutation({
    onSuccess: () => utilsTrpc.dds.getSessao.invalidate({ companyId, id: sessao.id }),
  });
  const removerAssinaturaMut = trpc.dds.removerAssinatura.useMutation({
    onSuccess: () => utilsTrpc.dds.getSessao.invalidate({ companyId, id: sessao.id }),
  });
  const funcSelecionado = funcs.find((f: any) => f.id === assinandoId);

  const handleAdicionar = () => {
    if (!addFuncId) return;
    const e = employees.find((x: any) => String(x.id) === addFuncId);
    if (!e) return;
    presencaMut.mutate({
      companyId, sessaoId: sessao.id,
      adicionar: [{ employeeId: e.id, nome: e.nomeCompleto ?? e.nome, cpf: e.cpf, funcao: e.funcao, presente: 1 }],
    });
    setAddFuncId("");
  };

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={voltar}>← Voltar para a lista</Button>
        <span className="text-sm text-slate-500">/</span>
        <h2 className="text-lg font-bold text-slate-800">{sessao.tituloTema}</h2>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-slate-500">Data</div><div className="font-medium">{sessao.data ? new Date(sessao.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"} {sessao.hora}</div></div>
          <div><div className="text-xs text-slate-500">Obra</div><div className="font-medium">{sessao.obraNome ?? "Avulsa"}</div></div>
          <div><div className="text-xs text-slate-500">Instrutor</div><div className="font-medium">{sessao.instrutor ?? "—"}</div></div>
          <div><div className="text-xs text-slate-500">Status</div>
            <div className="font-medium">
              {sessao.status === "finalizada" ? <span className="text-emerald-700">Finalizada</span>
                : sessao.status === "cancelada" ? <span className="text-red-700">Cancelada</span>
                : <span className="text-amber-700">Aberta</span>}
            </div>
          </div>
        </div>
        {/* Rev. 1740 — Roteiro detalhado da sessão (visualizar/editar/gerar com IA) */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> Roteiro do DDS
              {!temRoteiroSessao && <span className="ml-2 text-[10px] font-normal italic text-slate-500">(sem roteiro detalhado)</span>}
            </h4>
            {sessaoEditavel && (
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  type="button" size="sm" variant="outline"
                  disabled={gerarIAMut?.isPending}
                  onClick={async () => {
                    try {
                      const funcoes = (sessao.funcionarios ?? [])
                        .filter((f: any) => !!f.funcao)
                        .map((f: any) => f.funcao);
                      const r = await gerarIAMut.mutateAsync({
                        companyId,
                        titulo: sessao.tituloTema,
                        obraNome: sessao.obraNome ?? undefined,
                        funcoesPresentes: funcoes,
                      });
                      await atualizarSessaoMut.mutateAsync({
                        companyId, id: sessao.id, conteudoMd: r.conteudoMd,
                      });
                      setRoteiroBuf(r.conteudoMd);
                      setEditandoRoteiro(false);
                      toast.success("Roteiro gerado pela IA e salvo na sessão.");
                    } catch (e: any) {
                      toast.error(e?.message ?? "Falha ao gerar com IA");
                    }
                  }}
                  className="border-violet-300 text-violet-700 hover:bg-violet-50 h-7 text-xs"
                >
                  {gerarIAMut?.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                  {gerarIAMut?.isPending ? "Gerando..." : (temRoteiroSessao ? "Regerar com IA" : "Gerar com IA")}
                </Button>
                {!editandoRoteiro ? (
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => setEditandoRoteiro(true)}
                    className="h-7 text-xs">
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm"
                      disabled={atualizarSessaoMut?.isPending}
                      onClick={async () => {
                        try {
                          await atualizarSessaoMut.mutateAsync({
                            companyId, id: sessao.id, conteudoMd: roteiroBuf,
                          });
                          setEditandoRoteiro(false);
                          toast.success("Roteiro salvo.");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Falha ao salvar");
                        }
                      }}
                      className="h-7 text-xs">
                      <Check className="h-3 w-3 mr-1" /> Salvar
                    </Button>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => { setRoteiroBuf(sessao.conteudoMd ?? ""); setEditandoRoteiro(false); }}
                      className="h-7 text-xs">
                      <XIcon className="h-3 w-3 mr-1" /> Cancelar
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          {editandoRoteiro ? (
            <>
              <Textarea rows={10} value={roteiroBuf} onChange={e => setRoteiroBuf(e.target.value)}
                className="font-mono text-xs"
                placeholder="Roteiro em markdown: ## Cabeçalho, **negrito**, listas..." />
              {roteiroBuf && (
                <div className="mt-2 p-3 bg-white rounded border border-slate-200 max-h-72 overflow-auto">
                  <p className="text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">Pré-visualização</p>
                  <RoteiroMd md={roteiroBuf} />
                </div>
              )}
            </>
          ) : sessao.conteudoMd ? (
            <div className="bg-white rounded p-3 border border-slate-200">
              <RoteiroMd md={sessao.conteudoMd} />
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Sem roteiro detalhado nesta sessão. {sessaoEditavel
                ? "Clique em \"Gerar com IA\" pra criar um roteiro contextualizado pra esta obra e funções da equipe."
                : "Sessão fechada — não pode mais ser editada."}
            </p>
          )}
        </div>
        {sessao.observacoes && (
          <p className="text-xs text-slate-500 italic mt-2">Obs.: {sessao.observacoes}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Users className="h-4 w-4" /> Lista de Presença
            <span className="text-xs text-slate-400 font-normal">
              {presentes}/{funcs.length} presentes • {assinados} assinaturas
            </span>
          </h3>
          {sessao.status === "aberta" && (
            <div className="flex gap-2 items-center">
              <Select value={addFuncId} onValueChange={setAddFuncId}>
                <SelectTrigger className="w-72 h-8 text-xs">
                  <SelectValue placeholder="Adicionar funcionário..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {employees.filter((e: any) => !idsJaNaSessao.has(e.id)).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto ?? e.nome}{e.funcao ? ` — ${e.funcao}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAdicionar} disabled={!addFuncId || presencaMut.isPending}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
          )}
        </div>

        {funcs.length === 0 && (((sessao as any).terceiros ?? []).length === 0) ? (
          <p className="text-sm text-slate-400 italic text-center py-8">Nenhum funcionário adicionado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left py-1">Nome</th>
                <th className="text-left py-1">CPF</th>
                <th className="text-left py-1">Função</th>
                <th className="text-center py-1">Presente</th>
                <th className="text-center py-1">Assinatura</th>
                {sessao.status === "aberta" && <th className="py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {funcs.map((f: any) => (
                <tr key={`clt-${f.id}`} className="border-t">
                  <td className="py-2 font-medium">{f.nome}</td>
                  <td className="py-2 text-slate-600">{f.cpf ?? "—"}</td>
                  <td className="py-2 text-slate-600">{f.funcao ?? "—"}</td>
                  <td className="py-2 text-center">
                    <button
                      disabled={sessao.status !== "aberta"}
                      onClick={() => presencaMut.mutate({
                        companyId, sessaoId: sessao.id,
                        atualizar: [{ id: f.id, presente: f.presente === 1 ? 0 : 1 }],
                      })}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${f.presente === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"} disabled:opacity-50`}
                    >
                      {f.presente === 1 ? <><Check className="h-3 w-3 inline mr-1" />Sim</> : <><XIcon className="h-3 w-3 inline mr-1" />Não</>}
                    </button>
                  </td>
                  <td className="py-2 text-center">
                    {f.temAssinatura ? (
                      <button
                        onClick={() => setAssinandoId(f.id)}
                        className="inline-flex items-center gap-2 px-2 py-1 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 transition"
                        title={sessao.status === "aberta" ? "Clique para visualizar / refazer" : "Clique para visualizar"}
                      >
                        <Check className="h-3.5 w-3.5 text-blue-700" />
                        <span className="text-[11px] font-medium text-blue-800">
                          Assinada {f.assinadoEm ? "· " + new Date(f.assinadoEm).toLocaleDateString("pt-BR") : ""}
                        </span>
                      </button>
                    ) : f.assinadoEm ? (
                      <span className="text-xs text-blue-700">
                        ✓ {new Date(f.assinadoEm).toLocaleDateString("pt-BR")}
                      </span>
                    ) : sessao.status === "aberta" ? (
                      <Button size="sm" variant="outline"
                        onClick={() => setAssinandoId(f.id)}
                        className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                        <PenLine className="h-3 w-3 mr-1" /> Assinar
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">pendente</span>
                    )}
                  </td>
                  {sessao.status === "aberta" && (
                    <td className="py-2 text-right">
                      <button onClick={() => presencaMut.mutate({ companyId, sessaoId: sessao.id, remover: [f.id] })}
                        className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {/* Rev. 2024 — Terceiros participantes (read-only nesta sessão).
                  Não têm presença/assinatura via essa tela porque seu fluxo é
                  separado (cada terceiro tem aba DDS no próprio cadastro pra
                  histórico individual). Aparecem aqui pra dar visibilidade
                  total da equipe que participou do DDS. */}
              {((sessao as any).terceiros ?? []).map((t: any) => (
                <tr key={`terc-${t.id}`} className="border-t bg-orange-50/30">
                  <td className="py-2 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{t.nome ?? <span className="italic text-slate-400">Terceiro removido</span>}</span>
                      <span
                        className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded"
                        title="Funcionário terceirizado — histórico individual em Terceiros › aba DDS"
                      >
                        Terceiro
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-slate-600">{t.cpf ?? "—"}</td>
                  <td className="py-2 text-slate-600">{t.funcao ?? "—"}</td>
                  <td className="py-2 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800" title="Terceiros entram só como presentes; presença individual é registrada no cadastro do terceiro.">
                      <Check className="h-3 w-3 inline mr-1" />Sim
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="text-[11px] text-slate-400 italic" title="Assinatura digital é só pra CLT nesta versão. Lista de presença física pode ser anexada no cadastro do terceiro.">
                      n/a (terceiro)
                    </span>
                  </td>
                  {sessao.status === "aberta" && <td className="py-2 text-right" />}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rev. 1746 — Assinatura digital por funcionário (canvas no próprio sistema) */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <FileSignature className="h-6 w-6 text-blue-700 shrink-0" />
        <div className="flex-1 min-w-[240px]">
          <h4 className="font-semibold text-blue-900 text-sm">Assinatura digital no próprio sistema</h4>
          <p className="text-xs text-blue-800">
            Cada funcionário assina diretamente na tela do iPad/celular (botão <strong>Assinar</strong> em cada linha
            da lista acima). A assinatura fica salva como imagem na sessão e aparece no PDF da ata.
            Integração com FCsign para envio por e-mail/SMS chega em breve.
          </p>
        </div>
        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
          {assinados}/{funcs.length} assinaram
        </span>
      </div>

      {funcSelecionado && (
        <AssinaturaPad
          open={!!assinandoId}
          onOpenChange={(v) => { if (!v) setAssinandoId(null); }}
          funcionarioNome={funcSelecionado.nome}
          funcionarioId={funcSelecionado.id}
          sessaoId={sessao.id}
          companyId={companyId}
          temAssinaturaPrevia={!!funcSelecionado.temAssinatura}
          salvarMut={salvarAssinaturaMut}
          removerMut={removerAssinaturaMut}
          podeEditar={sessao.status === "aberta"}
        />
      )}

      <div className="flex gap-2 justify-end flex-wrap">
        <Button
          variant="outline"
          className="border-blue-300 text-blue-700 hover:bg-blue-50"
          disabled={gerandoPdf}
          onClick={gerarPdfDds}
        >
          {gerandoPdf
            ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando PDF…</>
            : <><FileDown className="h-4 w-4 mr-1" /> Baixar PDF / Ata</>}
        </Button>
        {sessao.status === "aberta" && (
          <Button variant="default" onClick={() => finalizarMut.mutate({ companyId, id: sessao.id, status: "finalizada" })}>
            <Check className="h-4 w-4 mr-1" /> Finalizar sessão
          </Button>
        )}
        {sessao.status === "finalizada" && (
          <Button variant="outline" onClick={() => finalizarMut.mutate({ companyId, id: sessao.id, status: "aberta" })}>
            Reabrir
          </Button>
        )}
        <Button
          variant="outline"
          className="text-red-600 hover:bg-red-50"
          disabled={excluirMut.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: "Excluir esta sessão?",
              description: "Lista de presença, assinaturas digitais e o roteiro associado serão removidos definitivamente. Não há volta.",
              tone: "destructive",
              confirmText: "Excluir sessão",
            });
            if (!ok) return;
            try {
              await excluirMut.mutateAsync({ companyId, id: sessao.id });
              voltar?.();
            } catch (e: any) {
              // toast já é exibido pelo onError do mutation; aqui só logamos
              console.error("[DDS excluir] falhou:", e?.message ?? e);
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {excluirMut.isPending ? "Excluindo..." : "Excluir"}
        </Button>
      </div>
    </div>
  );
}
