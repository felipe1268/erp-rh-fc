import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";
import {
  ShieldCheck, ShieldAlert, Shield, AlertTriangle, CheckCircle2,
  Clock, Search, Upload, FileText, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, RefreshCw, Printer, Ban, X, Loader2,
  ArrowRightLeft, Info, FilePlus2, Trash2, FileUp, Download,
} from "lucide-react";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ─── helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string; Icon: any }> = {
  ativo:                  { label: "Ativo",               color: "bg-green-100 text-green-800",   Icon: CheckCircle2 },
  pendente_inclusao:      { label: "Pendente Inclusão",   color: "bg-blue-100 text-blue-800",     Icon: Clock },
  pendente_cancelamento:  { label: "Pend. Cancelamento",  color: "bg-orange-100 text-orange-800", Icon: AlertTriangle },
  cancelado:              { label: "Cancelado",            color: "bg-slate-100 text-slate-600",   Icon: Ban },
  sem_cobertura:          { label: "Sem Cobertura",        color: "bg-red-100 text-red-800",       Icon: ShieldAlert },
};

const RESULT_STATUS: Record<string, { label: string; color: string; bg: string; Icon: any; desc: string }> = {
  ok:              { label: "OK",               color: "text-green-700",  bg: "bg-green-50 border-green-200",  Icon: CheckCircle2, desc: "Ativo no HR e na lista do corretor" },
  sem_seguro:      { label: "Sem Seguro",       color: "text-red-700",    bg: "bg-red-50 border-red-200",      Icon: ShieldAlert,  desc: "Ativo no HR mas ausente na lista do corretor" },
  pagar_indevido:  { label: "Pagar Indevido",   color: "text-orange-700", bg: "bg-orange-50 border-orange-200",Icon: AlertTriangle,desc: "Na lista do corretor mas não encontrado como ativo no HR" },
  novo:            { label: "Recém-admitido",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    Icon: Clock,        desc: "Admitido há menos de 45 dias — pode estar em carência de inclusão" },
  na_lista_sem_cadastro: { label: "Sem cadastro HR", color: "text-slate-600", bg: "bg-slate-50 border-slate-200", Icon: Info, desc: "Aparece na lista do corretor mas sem funcionário cadastrado" },
  // Rev. 4989 — statuses do PDF de MOVIMENTAÇÃO (Movimento de Faturas = delta do mês)
  incluir_mov:       { label: "Incluir (movimentação)",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   Icon: CheckCircle2, desc: "Inclusão no arquivo de movimentação — será criada a cobertura ao confirmar" },
  cancelar_mov:      { label: "Cancelar (movimentação)",  color: "text-red-700",    bg: "bg-red-50 border-red-200",     Icon: Ban,          desc: "Cancelamento no arquivo de movimentação — a cobertura será cancelada ao confirmar" },
  mov_sem_cobertura: { label: "Cancelamento s/ cobertura",color: "text-orange-700", bg: "bg-orange-50 border-orange-200",Icon: AlertTriangle,desc: "Cancelamento no arquivo, mas não há cobertura ativa no ERP" },
  mov_sem_cadastro:  { label: "Sem cadastro no ERP",      color: "text-slate-600",  bg: "bg-slate-50 border-slate-200", Icon: Info,         desc: "Movimentação sem funcionário correspondente no cadastro" },
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [ano, mes, dia] = d.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-slate-100 text-slate-700", Icon: Shield };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.color}`}>
      <s.Icon className="h-3 w-3" />{s.label}
    </span>
  );
}

// ─── helpers de valor monetário (formato BR "10.000,00") ─────────────────────
function parseBrMoney(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}
function fmtBrMoney(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCapital(s: string | null | undefined): string {
  const n = parseBrMoney(s);
  if (n === 0) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPremio(s: string | null | undefined): string {
  const n = parseBrMoney(s);
  if (n === 0) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}
function fmtCustoMensal(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

// ─── Painel de detalhe de um mês (usado no layout dois painéis) ───────────────
function ResultadoMesDetalhe({ res }: { res: any }) {
  const [filtro, setFiltro] = useState("divergencias");

  if (res.erro) {
    const [erroMsg, ...trechoPartes] = (res.erro as string).split("\n\nPrimeiras linhas extraídas:\n");
    const trecho = trechoPartes.join("").split("\n\nVerifique")[0];
    const dica = res.erro.includes("Verifique") ? res.erro.split("Verifique").pop() : null;
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <div className="flex flex-col items-center mb-4">
            <AlertTriangle className="h-10 w-10 text-red-400 mb-2" />
            <p className="font-semibold text-red-800 text-center">{res.filename ?? res.competencia}</p>
            <p className="text-sm text-red-600 text-center mt-1">{erroMsg}</p>
          </div>
          {trecho && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1.5">Conteúdo extraído do PDF:</p>
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-40">{trecho}</pre>
            </div>
          )}
          {dica && (
            <p className="mt-3 text-xs text-slate-500 text-center">Verifique{dica}</p>
          )}
        </div>
      </div>
    );
  }

  const [ano, mesNum] = (res.competencia ?? "").split("-");
  const mesLabel = MESES[Number(mesNum) - 1] ?? mesNum;

  const linhasFiltradas = (res.resultado ?? []).filter((r: any) =>
    filtro === "todos" ? true : filtro === "divergencias" ? r.status !== "ok" : r.status === filtro
  );

  const countOf = (key: string) => key === "divergencias"
    ? (res.resultado ?? []).filter((r: any) => r.status !== "ok").length
    : key === "todos"
    ? (res.resultado ?? []).length
    : (res.resultado ?? []).filter((r: any) => r.status === key).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabeçalho do detalhe */}
      <div className="px-6 pt-4 pb-3 border-b shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-indigo-600" />
          <p className="font-bold text-slate-800">{mesLabel} {ano}</p>
          {res.autoDetectado
            ? <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-semibold">📅 detectado do PDF</span>
            : <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">seleção manual</span>
          }
          {res.filename && <p className="text-[11px] text-slate-400 truncate max-w-xs">{res.filename}</p>}
        </div>
        {res.tipoArquivo === "movimentacao" && (
          <div className="mb-3 text-[11px] px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium">
            🔄 Arquivo de <strong>movimentação do mês</strong> (Movimento de Faturas) — só quem está listado é analisado; os demais funcionários ficam intocados (nada de falso "sem seguro").
          </div>
        )}
        {/* Estatísticas — clicáveis como filtros */}
        <div className="grid grid-cols-5 gap-3">
          {(res.tipoArquivo === "movimentacao" ? [
            { label: "Movimentos",        val: res.totalSeguradosCorretora, filtroKey: "todos",         cls: "text-slate-700", bg: "bg-slate-50 border-slate-200",   ring: "ring-slate-400" },
            { label: "🔵 Inclusões",      val: res.totalInclusoes,          filtroKey: "incluir_mov",   cls: "text-blue-700",  bg: "bg-blue-50 border-blue-100",     ring: "ring-blue-500" },
            { label: "🔴 Cancelamentos",  val: res.totalCancelamentos,      filtroKey: "cancelar_mov",  cls: "text-red-700",   bg: "bg-red-50 border-red-100",       ring: "ring-red-500" },
            { label: "✅ Já cobertos",    val: res.totalOk,                 filtroKey: "ok",            cls: "text-green-700", bg: "bg-green-50 border-green-100",   ring: "ring-green-500" },
            { label: "❓ Sem cadastro",   val: res.totalNaoEncontrados,     filtroKey: "mov_sem_cadastro",cls: "text-slate-600",bg: "bg-slate-50 border-slate-200",  ring: "ring-slate-400" },
          ] : [
            { label: "Na lista",          val: res.totalSeguradosCorretora, filtroKey: "todos",         cls: "text-slate-700", bg: "bg-slate-50 border-slate-200",   ring: "ring-slate-400" },
            { label: "Funcionários CLT",  val: res.totalAtivosHR,           filtroKey: null,            cls: "text-blue-700",  bg: "bg-blue-50 border-blue-100",     ring: "" },
            { label: "✅ OK",             val: res.totalOk,                 filtroKey: "ok",            cls: "text-green-700", bg: "bg-green-50 border-green-100",   ring: "ring-green-500" },
            { label: "🔴 Sem seguro",     val: res.totalSemSeguro,          filtroKey: "sem_seguro",    cls: "text-red-700",   bg: "bg-red-50 border-red-100",       ring: "ring-red-500" },
            { label: "🟡 Indevido",       val: res.totalPagarIndevido,      filtroKey: "pagar_indevido",cls: "text-orange-700",bg: "bg-orange-50 border-orange-100", ring: "ring-orange-400" },
          ]).map((c, i) => (
            <div
              key={i}
              onClick={() => c.filtroKey && setFiltro(c.filtroKey)}
              className={cn(
                "text-center p-3 rounded-xl border transition-all",
                c.bg,
                c.filtroKey ? "cursor-pointer hover:shadow-md hover:scale-[1.03]" : "cursor-default",
                c.filtroKey && filtro === c.filtroKey ? `ring-2 ${c.ring} shadow-sm` : "",
              )}>
              <p className={cn("text-2xl font-bold", c.cls)}>{c.val ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 py-2.5 border-b shrink-0 flex gap-1.5 flex-wrap bg-slate-50">
        {(res.tipoArquivo === "movimentacao" ? [
          { key: "todos",             label: "Todos",              activeClass: "bg-slate-500 text-white border-slate-500" },
          { key: "incluir_mov",       label: "Inclusões",          activeClass: "bg-blue-600 text-white border-blue-600" },
          { key: "cancelar_mov",      label: "Cancelamentos",      activeClass: "bg-red-600 text-white border-red-600" },
          { key: "ok",                label: "Já cobertos",        activeClass: "bg-green-600 text-white border-green-600" },
          { key: "mov_sem_cobertura", label: "Canc. s/ cobertura", activeClass: "bg-orange-500 text-white border-orange-500" },
          { key: "mov_sem_cadastro",  label: "Sem cadastro",       activeClass: "bg-slate-700 text-white border-slate-700" },
        ] : [
          { key: "divergencias",   label: "Só divergências", activeClass: "bg-slate-700 text-white border-slate-700" },
          { key: "todos",          label: "Todos",            activeClass: "bg-slate-500 text-white border-slate-500" },
          { key: "sem_seguro",     label: "Sem seguro",       activeClass: "bg-red-600 text-white border-red-600" },
          { key: "pagar_indevido", label: "Indevido",         activeClass: "bg-orange-500 text-white border-orange-500" },
          { key: "ok",             label: "OK",               activeClass: "bg-green-600 text-white border-green-600" },
          { key: "novo",           label: "Recém-admitido",   activeClass: "bg-blue-600 text-white border-blue-600" },
        ]).map(op => (
          <button key={op.key} onClick={() => setFiltro(op.key)}
            className={cn("text-[11px] px-3 py-1 rounded-full border font-medium transition-colors",
              filtro === op.key ? op.activeClass : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100")}>
            {op.label} ({countOf(op.key)})
          </button>
        ))}
      </div>

      {/* Tabela — ocupa todo o espaço restante */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-36">Status</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Nome no Sistema (HR)</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Nome na Lista (Corretor)</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-28">Item</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-20 text-center">%</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Importâncias Extraídas do PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhasFiltradas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Nenhum resultado para este filtro.</td></tr>
            ) : linhasFiltradas.map((r: any, i: number) => {
              const st = RESULT_STATUS[r.status] ?? RESULT_STATUS.ok;
              const vals: string[] = r.valores ?? [];
              const hasInvDoenca = vals.length >= 7;
              const covOff = hasInvDoenca ? 1 : 0;
              const vLabels = vals.length > 0 ? [
                { label: "MN",  val: vals[0] },
                { label: "MA",  val: vals[1] },
                { label: "IA",  val: vals[2] },
                ...(hasInvDoenca ? [{ label: "ID", val: vals[3] }] : []),
                { label: "VG",  val: vals[3 + covOff] },
                { label: "APC", val: vals[4 + covOff] },
              ].filter(v => v.val) : [];
              return (
                <tr key={i} className={cn("hover:bg-slate-50 transition-colors",
                  r.status === "sem_seguro" ? "bg-red-50/50" :
                  r.status === "pagar_indevido" ? "bg-orange-50/50" :
                  r.status === "novo" ? "bg-blue-50/50" : "")}>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex items-center gap-1.5 font-semibold text-xs", st.color)}>
                      <st.Icon className="h-3.5 w-3.5" />{st.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.nomeHR ?? <span className="text-slate-300 italic">—</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.nome
                      ? <span className={r.nome !== r.nomeHR && r.nomeHR ? "text-indigo-700 font-medium" : ""}>{r.nome}</span>
                      : <span className="text-slate-300 italic">—</span>}
                    {r.possivelPJ && r.status === "pagar_indevido" && (
                      <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 mt-0.5 inline-flex items-center gap-1">
                        ⚠️ Possível {r.possivelPJ.tipo}: <strong>{r.possivelPJ.nome}</strong>
                      </div>
                    )}
                    {r.possivelDesligado && r.status === "pagar_indevido" && (
                      <div className="text-[10px] text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 mt-0.5 inline-flex items-center gap-1 flex-wrap">
                        🔴 {r.possivelDesligado.status ?? "Desligado"}: <strong>{r.possivelDesligado.nome}</strong>
                        {r.possivelDesligado.dataDemissao
                          ? <span className="text-red-500"> — saiu em {fmtDate(r.possivelDesligado.dataDemissao)}</span>
                          : <span className="text-red-400 italic"> — sem data de saída registrada</span>}
                      </div>
                    )}
                    {r.status === "pagar_indevido" && !r.possivelDesligado && !r.possivelPJ && (
                      <div className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 inline-flex items-center gap-1">
                        ❓ Não encontrado no cadastro do ERP
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">{r.item || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs text-center">
                    {r.similaridade != null ? `${Math.round(r.similaridade * 100)}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {vLabels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {vLabels.map((v, vi) => (
                          <span key={vi} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 font-mono whitespace-nowrap">
                            <span className="font-bold text-emerald-500">{v.label}</span> {v.val}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-300 italic">
                        {r.status === "ok" ? "sem valores no PDF" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── helpers de competência ────────────────────────────────────────────────────
function getDefaultComp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function detectCompFromFilename(name: string): string {
  const d = getDefaultComp();
  const m1 = name.match(/(\d{4})[-_]?(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}`;
  const m2 = name.match(/(\d{2})[-_]?(\d{4})/);
  if (m2) return `${m2[2]}-${m2[1].padStart(2, "0")}`;
  return d;
}

// ─── MODAL: Importar Relatório do Corretor (PDF em lote + texto) ───────────────
function ImportModal({ open, onClose, companyId, companyIds, onSuccess }: {
  open: boolean; onClose: () => void;
  companyId: number; companyIds: number[];
  onSuccess: () => void;
}) {
  const [modo, setModo] = useState<"pdf" | "texto">("pdf");
  const [apoliceVG, setApoliceVG] = useState("117.398-5");
  const [apoliceAPC, setApoliceAPC] = useState("121.268-3");
  const [incluirPJ, setIncluirPJ] = useState(true);

  // PDF state
  const [arquivos, setArquivos] = useState<Array<{ file: File; competencia: string; fileBase64: string }>>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Texto state
  const [competenciaTexto, setCompetenciaTexto] = useState(getDefaultComp);
  const [nomes, setNomes] = useState("");

  // Results
  const [resultados, setResultados] = useState<any[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const processarLote = trpc.seguroVida.processarPdfLote.useMutation({
    onSuccess: (data) => {
      setResultados(data.resultados);
      const ok = data.resultados.filter((r: any) => !r.erro && r.totalSemSeguro === 0).length;
      const erros = data.resultados.filter((r: any) => r.erro).length;
      toast.success(`${data.resultados.length} mês(es) processado(s). ${ok} sem divergências.${erros ? ` ${erros} erro(s) ao ler PDF.` : ""}`);
    },
    onError: e => toast.error(e.message),
  });

  const importarTexto = trpc.seguroVida.importarRelatorio.useMutation({
    onSuccess: (data) => {
      setResultados([data]);
      toast.success(`Cruzamento concluído: ${data.totalOk} OK, ${data.totalSemSeguro} sem seguro`);
    },
    onError: e => toast.error(e.message),
  });

  const confirmarMutation = trpc.seguroVida.confirmarCruzamento.useMutation({
    onSuccess: (data) => {
      setConfirmed(true);
      onSuccess();
      toast.success(`Importação confirmada! ${data.criadas} cobertura(s) criada(s)${(data as any).canceladas > 0 ? `, ${(data as any).canceladas} cancelada(s)` : ""}${(data as any).reativadas > 0 ? `, ${(data as any).reativadas} reativada(s)` : ""}${data.mantidas > 0 ? `, ${data.mantidas} já ativas.` : "."}`);
    },
    onError: e => toast.error(e.message),
  });

  const handleConfirmar = () => {
    if (!resultados) return;
    const resultadoTotal: any[] = [];
    for (const r of resultados) {
      if (!r.erro && r.resultado) resultadoTotal.push(...r.resultado);
    }
    confirmarMutation.mutate({ companyId, companyIds, apoliceVG, apoliceAPC, resultado: resultadoTotal });
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`${file.name} não é um arquivo PDF`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1];
        setArquivos(prev => [...prev, {
          file,
          competencia: detectCompFromFilename(file.name),
          fileBase64: b64,
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const updateComp = (idx: number, val: string) =>
    setArquivos(prev => prev.map((a, i) => i === idx ? { ...a, competencia: val } : a));

  const removeArq = (idx: number) =>
    setArquivos(prev => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setArquivos([]);
    setNomes("");
    setResultados(null);
    setActiveIdx(0);
    setModo("pdf");
    setConfirmed(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); reset(); } }}>
      <DialogContent
        resizable={false}
        className="flex flex-col p-0 gap-0 top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none rounded-none border-0"
      >

        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-gradient-to-r from-indigo-50 to-slate-50">
          <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-indigo-900">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            Cruzamento com Relatório do Corretor
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Envie os PDFs do corretor mês a mês. O sistema compara automaticamente com os funcionários CLT ativos.
          </p>
        </DialogHeader>

        <div className={cn("flex-1 min-h-0", !resultados ? "overflow-auto px-8 py-6 space-y-5" : "flex overflow-hidden")}>
          {!resultados ? (
            <div className="max-w-3xl mx-auto w-full space-y-5">
              {/* Modo tabs */}
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                {([["pdf", FileUp, "Upload de PDF"], ["texto", FileText, "Colar texto"]] as const).map(([key, Icon, label]) => (
                  <button key={key} onClick={() => setModo(key)}
                    className={cn("flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-md transition-all",
                      modo === key ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700")}>
                    <Icon className="h-4 w-4" />{label}
                  </button>
                ))}
              </div>

              {/* Apólices (sempre visíveis) */}
              <div className="p-4 bg-slate-50 border rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Apólice VG</label>
                    <Input value={apoliceVG} onChange={e => setApoliceVG(e.target.value)} placeholder="117.398-5" className="font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Apólice APC</label>
                    <Input value={apoliceAPC} onChange={e => setApoliceAPC(e.target.value)} placeholder="121.268-3" className="font-mono" />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={incluirPJ}
                    onChange={e => setIncluirPJ(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700">
                    <span className="font-semibold">Incluir PJ / Sócios no cruzamento</span>
                    <span className="text-slate-400 text-xs ml-1">(obrigatório apenas para CLT — PJ/Sócio é opcional)</span>
                  </span>
                </label>
              </div>

              {/* ── Modo PDF ── */}
              {modo === "pdf" && (
                <div className="space-y-4">
                  {/* Zona de drop */}
                  <div
                    className={cn("border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer select-none",
                      dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50")}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}>
                    <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden"
                      onChange={e => handleFiles(e.target.files)} />
                    <FileUp className={cn("h-10 w-10 mx-auto mb-3", dragOver ? "text-indigo-500" : "text-slate-300")} />
                    <p className="font-semibold text-slate-600 text-sm">Arraste os PDFs aqui ou clique para selecionar</p>
                    <p className="text-xs text-slate-400 mt-1">Selecione quantos meses quiser de uma vez — cada arquivo = uma competência</p>
                  </div>

                  {/* Lista de arquivos */}
                  {arquivos.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                        <Info className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-indigo-700">
                          O sistema detecta automaticamente o mês de cada PDF pelo conteúdo. Os seletores abaixo são usados apenas como fallback caso a data não seja encontrada.
                        </p>
                      </div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {arquivos.length} arquivo(s) selecionado(s)
                      </p>
                      {arquivos.map((arq, idx) => {
                        const [ano, mesIdx] = arq.competencia.split("-");
                        const mesLabel = MESES[Number(mesIdx) - 1] ?? mesIdx;
                        return (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-white border rounded-xl shadow-sm">
                            <FileText className="h-8 w-8 text-indigo-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{arq.file.name}</p>
                              <p className="text-[11px] text-slate-400">{(arq.file.size / 1024).toFixed(0)} KB</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full font-medium">
                                📅 {mesLabel} {ano}
                              </span>
                              <button onClick={() => removeArq(idx)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <button onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed rounded-xl text-xs text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <FilePlus2 className="h-4 w-4" />Adicionar mais arquivos
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Modo texto ── */}
              {modo === "texto" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                      Lista de Segurados — cole o conteúdo copiado do PDF
                    </label>
                    <Textarea value={nomes} onChange={e => setNomes(e.target.value)}
                      placeholder={"00000000784       ACACIO LESCURA DE CAMARGO\n00000000971       ADRIANO PAZ FERREIRA\n..."}
                      className="font-mono text-xs min-h-[200px] bg-slate-50" />
                    <p className="text-[11px] text-slate-400 mt-1">
                      O sistema detecta automaticamente a competência e extrai o número de item e o nome de cada linha.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Layout dois painéis: lista de meses + detalhe ── */
            <>
              {/* Painel esquerdo: lista de meses */}
              <div className="w-[220px] shrink-0 border-r flex flex-col bg-slate-50">
                <div className="px-3 py-3 border-b bg-white flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{resultados.length} mês(es)</p>
                  <button onClick={reset}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-medium">
                    <RefreshCw className="h-3 w-3" />Nova
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-2 space-y-1.5">
                  {resultados.map((res, i) => {
                    const [ano, mesNum] = (res.competencia ?? "").split("-");
                    const mesLabel = MESES[Number(mesNum) - 1] ?? mesNum;
                    const temDiverg = !res.erro && (res.totalSemSeguro > 0 || res.totalPagarIndevido > 0);
                    const isActive = i === activeIdx;
                    return (
                      <button key={i} onClick={() => setActiveIdx(i)}
                        className={cn("w-full text-left p-3 rounded-xl border transition-all",
                          isActive
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                            : temDiverg
                            ? "bg-red-50 border-red-200 hover:border-red-300"
                            : res.erro
                            ? "bg-orange-50 border-orange-200 hover:border-orange-300"
                            : "bg-green-50 border-green-200 hover:border-green-300")}>
                        <p className={cn("font-bold text-sm", isActive ? "text-white" : "text-slate-800")}>
                          {mesLabel} {ano}
                        </p>
                        {res.filename && (
                          <p className={cn("text-[10px] mt-0.5 truncate max-w-[160px]", isActive ? "text-white/60" : "text-slate-400")}>
                            {res.filename}
                          </p>
                        )}
                        {res.seguradoraDetectada && (
                          <p className={cn("text-[10px] font-medium", isActive ? "text-indigo-200" : "text-indigo-600")}>
                            {res.seguradoraDetectada}
                          </p>
                        )}
                        {res.erro ? (
                          <p className={cn("text-[11px] mt-0.5", isActive ? "text-white/70" : "text-orange-600")}>Erro ao ler PDF</p>
                        ) : (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <span className={cn("text-[11px] font-medium", isActive ? "text-white/80" : "text-slate-500")}>
                              {res.totalSeguradosCorretora} na lista
                            </span>
                            {res.totalOk > 0 && (
                              <span className={cn("text-[11px] font-semibold", isActive ? "text-green-200" : "text-green-600")}>✓ {res.totalOk}</span>
                            )}
                            {res.totalSemSeguro > 0 && (
                              <span className={cn("text-[11px] font-semibold", isActive ? "text-red-200" : "text-red-600")}>⚠ {res.totalSemSeguro}</span>
                            )}
                            {res.totalPagarIndevido > 0 && (
                              <span className={cn("text-[11px] font-semibold", isActive ? "text-yellow-200" : "text-orange-600")}>{res.totalPagarIndevido} inv.</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Painel direito: detalhe do mês selecionado */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <ResultadoMesDetalhe res={resultados[activeIdx] ?? resultados[0]} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t bg-slate-50 shrink-0">
          {!resultados ? (
            <>
              <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancelar</Button>
              {modo === "pdf" ? (
                <Button
                  disabled={arquivos.length === 0 || processarLote.isPending}
                  onClick={() => processarLote.mutate({
                    companyId, companyIds, apoliceVG, apoliceAPC, incluirPJ,
                    arquivos: arquivos.map(a => ({ competencia: a.competencia, filename: a.file.name, fileBase64: a.fileBase64 })),
                  })}>
                  {processarLote.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando {arquivos.length} arquivo(s)...</>
                    : <><ArrowRightLeft className="h-4 w-4 mr-2" />Processar {arquivos.length} arquivo(s)</>}
                </Button>
              ) : (
                <Button
                  disabled={!nomes.trim() || importarTexto.isPending}
                  onClick={() => importarTexto.mutate({ companyId, companyIds, competencia: competenciaTexto, nomesBrutos: nomes, apoliceVG, apoliceAPC, incluirPJ })}>
                  {importarTexto.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cruzando...</>
                    : <><ArrowRightLeft className="h-4 w-4 mr-2" />Cruzar com Funcionários</>}
                </Button>
              )}
            </>
          ) : confirmed ? (
            <div className="flex items-center gap-3 flex-1">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <span className="text-sm text-green-700 font-semibold">Importação confirmada — coberturas atualizadas na tabela principal.</span>
              <Button variant="outline" onClick={() => { onClose(); reset(); }} className="ml-auto">Fechar</Button>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => { onClose(); reset(); }}>
                <X className="h-4 w-4 mr-2" />Fechar sem confirmar
              </Button>
              <Button
                onClick={handleConfirmar}
                disabled={confirmarMutation.isPending || !resultados?.some((r: any) => !r.erro && r.resultado?.some((x: any) => x.status === "ok" || x.status === "novo" || x.status === "incluir_mov" || x.status === "cancelar_mov"))}
                className="bg-green-600 hover:bg-green-700 text-white">
                {confirmarMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirmando...</>
                  : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar Importação</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MODAL: Seed inicial com a lista do corretor ───────────────────────────────
function SeedModal({ open, onClose, companyId, companyIds, onSuccess }: {
  open: boolean; onClose: () => void;
  companyId: number; companyIds: number[];
  onSuccess: () => void;
}) {
  const [nomes, setNomes] = useState("");
  const [apoliceVG, setApoliceVG] = useState("117.398-5");
  const [apoliceAPC, setApoliceAPC] = useState("121.268-3");
  const [dataAdesao, setDataAdesao] = useState(() => new Date().toISOString().split("T")[0]);

  const seed = trpc.seguroVida.seedFromRelatorio.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.inseridos} de ${d.total} segurados importados como coberturas ativas!`);
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col p-0 gap-0 w-[620px] max-w-[95vw] max-h-[90vh]">
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-gradient-to-r from-amber-50 to-slate-50">
          <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-amber-900">
            <Upload className="h-5 w-5 text-amber-600" />
            Carga Inicial — Lista do Corretor
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Use <strong>apenas uma vez</strong> para popular o sistema com os segurados já ativos. Cole a lista do corretor abaixo.
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border rounded-xl">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Data de Adesão</label>
              <Input type="date" value={dataAdesao} onChange={e => setDataAdesao(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Apólice VG</label>
              <Input value={apoliceVG} onChange={e => setApoliceVG(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Apólice APC</label>
              <Input value={apoliceAPC} onChange={e => setApoliceAPC(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              Lista de Segurados (cole o conteúdo do PDF)
            </label>
            <Textarea value={nomes} onChange={e => setNomes(e.target.value)}
              className="font-mono text-xs min-h-[200px] bg-slate-50"
              placeholder={"00000000784       ACACIO LESCURA DE CAMARGO\n00000000971       ADRIANO PAZ FERREIRA\n..."} />
          </div>
        </div>
        <DialogFooter className="px-6 py-3 border-t bg-slate-50 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => seed.mutate({ companyId, companyIds, nomesBrutos: nomes, apoliceVG, apoliceAPC, dataAdesao })}
            disabled={seed.isPending || !nomes.trim()}
            className="bg-amber-600 hover:bg-amber-700">
            {seed.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
              : <><Upload className="h-4 w-4 mr-2" />Importar como Ativos</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detalhe lazy de uma importação histórica ─────────────────────────────────
function ImportacaoDetalheExpand({ importacaoId, companyId }: { importacaoId: number; companyId: number }) {
  const q = trpc.seguroVida.getImportacao.useQuery(
    { companyId, importacaoId },
    { enabled: true, staleTime: 5 * 60 * 1000 }
  );

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando resultado...</span>
      </div>
    );
  }
  if (!q.data) {
    return <p className="py-6 text-center text-sm text-slate-400">Resultado não disponível.</p>;
  }

  const imp: any = q.data;
  const jsonRes = imp.json_resultado
    ? (typeof imp.json_resultado === "string" ? JSON.parse(imp.json_resultado) : imp.json_resultado)
    : [];

  const res = {
    competencia:              imp.competencia,
    totalSeguradosCorretora:  imp.total_segurados,
    totalAtivosHR:            imp.total_ativos,
    totalOk:                  imp.total_ok,
    totalSemSeguro:           imp.total_sem_seguro,
    totalPagarIndevido:       imp.total_pagar_indevido,
    totalNovos:               imp.total_novos,
    resultado:                jsonRes,
    filename:                 `Importado em ${fmtDate(imp.data_importacao?.split?.("T")?.[0])} por ${imp.importado_por || "—"}`,
    autoDetectado:            false,
  };

  return <ResultadoMesDetalhe res={res} />;
}

// ─── Botão de download de PDF ─────────────────────────────────────────────────
function DownloadPdfBtn({ importacaoId, companyId, competencia }: { importacaoId: number; companyId: number; competencia: string }) {
  const [enabled, setEnabled] = useState(false);
  const q = trpc.seguroVida.baixarPdf.useQuery(
    { companyId, importacaoId },
    { enabled, staleTime: Infinity, retry: false }
  );

  useEffect(() => {
    if (!q.data) return;
    const byteChars = atob(q.data.pdfBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `seguro-vida-${competencia}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setEnabled(false);
  }, [q.data]);

  return (
    <button
      onClick={e => { e.stopPropagation(); setEnabled(true); }}
      disabled={q.isLoading}
      className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-indigo-50 text-slate-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
      title="Baixar PDF original">
      {q.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SeguroVida() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_master";

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [showImport, setShowImport] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [tabAtiva, setTabAtiva] = useState<"cobertura" | "inconsistencias" | "historico">("cobertura");
  const [detailImport, setDetailImport] = useState<any>(null);
  const now = new Date();
  const [anoTimeline, setAnoTimeline] = useState(now.getFullYear());
  const [mesFiltro, setMesFiltro] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Rev. 1406 → seletor de competência padrão do sistema (ano + pills de mês + "Ano todo")
  const [anoComp, setAnoComp] = useState<number>(now.getFullYear());
  const [mesComp, setMesComp] = useState<number | null>(now.getMonth() + 1); // null = Ano todo
  const isAnoTodo = mesComp === null;
  const competencia = isAnoTodo
    ? getDefaultComp()
    : `${anoComp}-${String(mesComp).padStart(2, "0")}`;
  const setCompetencia = (v: string) => {
    const [a, m] = v.split("-");
    setAnoComp(Number(a)); setMesComp(Number(m));
  };
  // "Ano todo" mostra a carteira ao vivo + resumo anual das importações
  const isMesCorrente = isAnoTodo || competencia === getDefaultComp();
  const isHistorico   = !isMesCorrente;

  const utils = trpc.useUtils();

  const resumoLiveQ = trpc.seguroVida.getResumo.useQuery(
    { companyId, companyIds },
    { enabled: (companyId > 0 || companyIds.length > 0) && isMesCorrente }
  );

  const funcionariosLiveQ = trpc.seguroVida.listarFuncionariosComStatus.useQuery(
    { companyId, companyIds },
    { enabled: (companyId > 0 || companyIds.length > 0) && isMesCorrente }
  );

  const snapshotQ = trpc.seguroVida.snapshotPorCompetencia.useQuery(
    { companyId, companyIds, competencia },
    { enabled: (companyId > 0 || companyIds.length > 0) && isHistorico }
  );

  // Aliases unificados — abaixo o resto da página continua usando "resumoQ" e "funcionariosQ"
  const resumoQ = isHistorico
    ? { data: snapshotQ.data?.resumo, isLoading: snapshotQ.isLoading } as any
    : resumoLiveQ;
  const funcionariosQ = isHistorico
    ? { data: snapshotQ.data?.funcionarios ?? [], isLoading: snapshotQ.isLoading } as any
    : funcionariosLiveQ;

  const importacoesQ = trpc.seguroVida.listarImportacoes.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // Bolinhas coloridas do seletor: verde = relatório do corretor importado (consolidado),
  // azul = mês corrente com dados ao vivo (sem importação ainda), cinza = sem lançamento.
  const monthStatus = useMemo(() => {
    const comps = new Set((importacoesQ.data ?? []).map((i: any) => String(i.competencia ?? "")));
    const compCorrente = getDefaultComp();
    const st: Record<number, "data" | "consolidated" | "none"> = {};
    for (let m = 1; m <= 12; m++) {
      const comp = `${anoComp}-${String(m).padStart(2, "0")}`;
      st[m] = comps.has(comp) ? "consolidated" : comp === compCorrente ? "data" : "none";
    }
    return st;
  }, [importacoesQ.data, anoComp]);

  const inconsistenciasQ = trpc.seguroVida.listarInconsistencias.useQuery(
    { companyId, companyIds },
    { enabled: (companyId > 0 || companyIds.length > 0) && tabAtiva === "inconsistencias" }
  );

  const [selectedCoverageIds, setSelectedCoverageIds] = useState<Set<number>>(new Set());

  // ── Dialog de confirmação customizado (substitui confirm() nativo) ──
  const [confirmDlg, setConfirmDlg] = useState<{
    open: boolean; title: string; body: string; names?: string[]; onOk: () => void;
  }>({ open: false, title: "", body: "", onOk: () => {} });

  const showConfirm = (title: string, body: string, onOk: () => void, names?: string[]) => {
    setConfirmDlg({ open: true, title, body, names, onOk });
  };

  const cancelar = trpc.seguroVida.cancelarCobertura.useMutation({
    onSuccess: () => { toast.success("Cobertura cancelada"); utils.seguroVida.listarFuncionariosComStatus.invalidate(); utils.seguroVida.getResumo.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const confirmarStatus = trpc.seguroVida.confirmarStatusCobertura.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.novoStatus === "ativo" ? "Cobertura ativada com sucesso!" : "Cobertura cancelada com sucesso!");
      utils.seguroVida.listarFuncionariosComStatus.invalidate();
      utils.seguroVida.getResumo.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const cancelarMultiplas = trpc.seguroVida.cancelarMultiplasCoberturas.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.canceladas} cobertura${d.canceladas === 1 ? "" : "s"} cancelada${d.canceladas === 1 ? "" : "s"} com sucesso.`);
      setSelectedCoverageIds(new Set());
      utils.seguroVida.listarFuncionariosComStatus.invalidate();
      utils.seguroVida.getResumo.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const deletarImportacao = trpc.seguroVida.deletarImportacao.useMutation({
    onSuccess: () => { toast.success("Importação removida"); utils.seguroVida.listarImportacoes.invalidate(); utils.seguroVida.getResumo.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const deletarImportacoes = trpc.seguroVida.deletarImportacoes.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.removidos} importaç${d.removidos === 1 ? "ão removida" : "ões removidas"} com sucesso`);
      setSelectedIds(new Set());
      utils.seguroVida.listarImportacoes.invalidate();
      utils.seguroVida.getResumo.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const resolverIndevido = trpc.seguroVida.resolverIndevido.useMutation({
    onSuccess: () => {
      toast.success("Registro marcado como resolvido");
      utils.seguroVida.listarInconsistencias.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const resumo = resumoQ.data;
  const funcionarios = funcionariosQ.data ?? [];

  // Mapeia cada funcionário para um status de seguro unificado
  const funcionariosNorm = useMemo(() => funcionarios.map((f: any) => ({
    ...f,
    statusSeguro: f.seguro_status ?? "sem_cobertura",
  })), [funcionarios]);

  // Lista já filtrada pelo tipo de contrato — base para os chips de status (contagens coerentes)
  const listaPorTipo = useMemo(() => {
    if (filtroTipo === "PJ")    return funcionariosNorm.filter((f: any) => (f.tipoContrato ?? "") === "PJ");
    if (filtroTipo === "Socio") return funcionariosNorm.filter((f: any) => (f.tipoContrato ?? "") === "Socio");
    if (filtroTipo === "CLT")   return funcionariosNorm.filter((f: any) => !["PJ", "Socio"].includes(f.tipoContrato ?? ""));
    return funcionariosNorm;
  }, [funcionariosNorm, filtroTipo]);

  const filtradas = useMemo(() => {
    let lista = listaPorTipo;
    if (filtroStatus !== "todos") lista = lista.filter((f: any) => f.statusSeguro === filtroStatus);
    if (busca.trim()) {
      const b = removeAccents(busca.toLowerCase());
      lista = lista.filter((f: any) =>
        removeAccents((f.nomeCompleto ?? "").toLowerCase()).includes(b) ||
        removeAccents((f.funcao ?? f.cargo ?? "").toLowerCase()).includes(b) ||
        (f.item_segurador ?? "").includes(b)
      );
    }
    return lista;
  }, [listaPorTipo, filtroStatus, busca]);

  const totais = useMemo(() => {
    const soma = (key: string) => filtradas.reduce((acc: number, f: any) => acc + parseBrMoney(f[key]), 0);
    const vg  = soma("premio_vg");
    const apc = soma("premio_apc");
    return {
      morte_natural:     soma("morte_natural"),
      morte_acidental:   soma("morte_acidental"),
      invalidez_acidente:soma("invalidez_acidente"),
      invalidez_doenca:  soma("invalidez_doenca"),
      premio_vg:         vg,
      premio_apc:        apc,
      custo_mensal:      vg + apc,
      comValores:        filtradas.filter((f: any) => f.morte_natural || f.premio_vg).length,
    };
  }, [filtradas]);

  // Alertas de vencimento de apólice (próximos 60 dias)
  const alertasVencimento = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje); limite.setDate(limite.getDate() + 60);
    return funcionariosNorm.filter((f: any) => {
      if (!f.data_vencimento_apolice) return false;
      const dt = new Date(f.data_vencimento_apolice);
      return dt >= hoje && dt <= limite;
    }).sort((a: any, b: any) => new Date(a.data_vencimento_apolice).getTime() - new Date(b.data_vencimento_apolice).getTime());
  }, [funcionariosNorm]);

  const invalidate = () => {
    utils.seguroVida.listarFuncionariosComStatus.invalidate();
    utils.seguroVida.getResumo.invalidate();
    utils.seguroVida.listarImportacoes.invalidate();
  };

  // ── Impressão ──
  const handlePrint = () => {
    const linhas = filtradas.map((f: any) => {
      const s = STATUS_LABELS[f.statusSeguro]?.label ?? f.statusSeguro;
      const custo = parseBrMoney(f.premio_vg) + parseBrMoney(f.premio_apc);
      return `<tr>
        <td>${f.nomeCompleto ?? "—"}</td>
        <td>${f.funcao ?? f.cargo ?? "—"}</td>
        <td>${s}</td>
        <td>${f.seguradora ?? "—"}</td>
        <td style="text-align:right">${f.morte_natural ?? "—"}</td>
        <td style="text-align:right">${f.morte_acidental ?? "—"}</td>
        <td style="text-align:right">${f.invalidez_acidente ?? "—"}</td>
        <td style="text-align:right">${f.invalidez_doenca ?? "—"}</td>
        <td style="text-align:right">${f.premio_vg ?? "—"}</td>
        <td style="text-align:right">${f.premio_apc ?? "—"}</td>
        <td style="text-align:right;font-weight:600">${custo > 0 ? fmtBrMoney(custo) : "—"}</td>
      </tr>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Seguro de Vida</title><style>
      body{font-family:Arial,sans-serif;font-size:10px;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #ccc;padding:3px 5px;}
      th{background:#eee;font-weight:bold;text-align:left;}
      .group{background:#dde6f0;font-weight:bold;text-align:center;}
      .custo-col{background:#d1fae5;font-weight:bold;}
      h2{margin-bottom:4px;}
    </style></head><body>
      <h2>Seguro de Vida — Relação de Segurados</h2>
      <p>Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")} | Total: ${filtradas.length} registros</p>
      <table>
        <thead>
          <tr>
            <th rowspan="2">Nome</th><th rowspan="2">Cargo</th><th rowspan="2">Status</th><th rowspan="2">Seguradora</th>
            <th colspan="4" class="group">Importâncias Seguradas (R$)</th>
            <th colspan="2" class="group">Prêmios Mensais (R$)</th>
            <th rowspan="2" class="custo-col" style="text-align:center">Custo/Mês (R$)</th>
          </tr>
          <tr>
            <th>Morte Natural</th><th>Morte Acidental</th><th>Inv. Acidente</th><th>Inv. Doença</th>
            <th>V.G.</th><th>A.P.C.</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  };

  // ── CSV Export ──
  const exportarCSV = () => {
    const header = ["Nome","Cargo","Tipo","Status","Item Apólice","Morte Natural","Morte Acidental","Inv. Acidente","Inv. Doença","Prêmio VG","Prêmio APC","Custo Mensal"];
    const linhas = filtradas.map((f: any) => {
      const custo = parseBrMoney(f.premio_vg) + parseBrMoney(f.premio_apc);
      return [
        `"${(f.nomeCompleto ?? "").replace(/"/g, '""')}"`,
        `"${(f.funcao ?? f.cargo ?? "").replace(/"/g, '""')}"`,
        f.tipoContrato ?? "CLT",
        f.seguro_status ?? "sem_cobertura",
        f.item_segurador ?? "",
        f.morte_natural ?? "",
        f.morte_acidental ?? "",
        f.invalidez_acidente ?? "",
        f.invalidez_doenca ?? "",
        f.premio_vg ?? "",
        f.premio_apc ?? "",
        custo > 0 ? fmtBrMoney(custo) : "",
      ].join(",");
    });
    const csv = [header.join(","), ...linhas].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `seguro-vida-coberturas-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filtradas.length} registros exportados`);
  };

  // ── Cards ──
  const custoBR = resumo?.totalPremioMensal
    ? `R$ ${(resumo.totalPremioMensal as number).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
  const cards = [
    { label: "Segurados Ativos",       val: resumo?.totalSeguradosAtivos ?? 0,      icon: ShieldCheck,  color: "text-green-700",  bg: "bg-green-50 border-green-200",   filtro: "ativo",                 tipo: "todos" },
    { label: "Pend. Inclusão",         val: resumo?.totalPendenteInclusao ?? 0,     icon: Clock,        color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",     filtro: "pendente_inclusao",     tipo: "todos" },
    { label: "Pend. Cancelamento",     val: resumo?.totalPendenteCancelamento ?? 0, icon: AlertTriangle,color: "text-orange-700", bg: "bg-orange-50 border-orange-200", filtro: "pendente_cancelamento", tipo: "todos" },
    { label: "CLT sem Cobertura ⚠️",  val: resumo?.totalSemSeguro ?? 0,            icon: ShieldAlert,  color: "text-red-700",    bg: "bg-red-50 border-red-200",       filtro: "sem_cobertura",         tipo: "CLT" },
  ];
  const aplicarFiltroCard = (filtro: string, tipo: string) => {
    setTabAtiva("cobertura");
    setFiltroStatus(prev => (prev === filtro ? "todos" : filtro));
    setFiltroTipo(tipo);
    setBusca("");
  };

  return (
    <DashboardLayout title="Seguro de Vida">
      <div className="space-y-5">

        {/* Seletor de competência padrão do sistema: ano + pills de mês + "Ano todo" */}
        <PeriodSelectorCard
          ano={anoComp}
          mes={mesComp}
          onAno={setAnoComp}
          onMes={setMesComp}
          onAnoTodo={() => setMesComp(null)}
          monthStatus={monthStatus}
          showLegend
          actions={
            isAnoTodo
              ? <span className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">Ano todo — carteira atual + resumo das importações</span>
              : isMesCorrente
              ? <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Mês corrente — dados ao vivo</span>
              : <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-semibold">Histórico (somente leitura)</span>
          }
        />
        {isHistorico && snapshotQ.isFetched && !snapshotQ.data?.temDados && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
            ⚠️ Sem importação registrada para esta competência. Os cards e a tabela ficam vazios até importar o relatório do corretor para {competencia.split("-").reverse().join("/")}.
          </div>
        )}
        {isHistorico && snapshotQ.data?.temDados && (
          <div className="px-3 py-2 bg-slate-50 border rounded-lg text-xs text-slate-600">
            Snapshot reconstruído a partir do relatório importado em {fmtDate((snapshotQ.data?.resumo?.ultimaImportacao?.data_importacao as string | undefined)?.split?.("T")?.[0] ?? null)}.
          </div>
        )}
        {/* Resumo anual (Ano todo): meses com relatório do corretor importado */}
        {isAnoTodo && (
          <div className="px-3 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-lg">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Importações do corretor em {anoComp}:</p>
            {(() => {
              const doAno = (importacoesQ.data ?? []).filter((i: any) => String(i.competencia ?? "").startsWith(String(anoComp)));
              if (importacoesQ.isLoading) return <p className="text-xs text-slate-500">Carregando…</p>;
              if (doAno.length === 0) return <p className="text-xs text-slate-500">Nenhum relatório importado em {anoComp}.</p>;
              const porComp = new Map<string, any>();
              for (const i of doAno) if (!porComp.has(i.competencia)) porComp.set(i.competencia, i);
              return (
                <div className="flex flex-wrap gap-2">
                  {[...porComp.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([comp, i]: [string, any]) => (
                    <button key={comp} type="button" onClick={() => setCompetencia(comp)}
                      title="Toque para abrir esta competência"
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 transition-colors">
                      <span className="font-bold text-indigo-700">{comp.split("-").reverse().join("/")}</span>
                      <span className="text-slate-600"> — {i.total_segurados} segurados</span>
                      {Number(i.total_sem_seguro) > 0 && <span className="text-red-600 font-semibold"> · {i.total_sem_seguro} sem seguro</span>}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Aviso importante */}
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <strong>Trabalhar sem Seguro de Vida é estritamente proibido.</strong> Todo funcionário CLT deve ter cobertura ativa desde o primeiro dia de trabalho.
            Pela convenção coletiva, é obrigação da FC Engenharia manter o seguro vigente para todos os colaboradores.
          </div>
        </div>

        {/* Alertas de vencimento de apólice */}
        {alertasVencimento.length > 0 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {alertasVencimento.length === 1
                  ? "1 apólice vencendo em até 60 dias"
                  : `${alertasVencimento.length} apólices vencendo em até 60 dias`}
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {alertasVencimento.map((f: any, i: number) => (
                  <span key={i} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                    {f.nomeCompleto} — {fmtDate(f.data_vencimento_apolice)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {cards.map((c) => (
            <button key={c.label} type="button" onClick={() => aplicarFiltroCard(c.filtro, c.tipo)}
              title={`Clique para filtrar a lista por "${c.label}"`}
              className={cn("p-4 rounded-lg border flex flex-col gap-1 text-left cursor-pointer transition-all hover:shadow-md active:scale-[0.98]",
                c.bg,
                filtroStatus === c.filtro && "ring-2 ring-offset-1 ring-indigo-400 shadow-md")}>
              <div className="flex items-center gap-2">
                <c.icon className={cn("h-5 w-5", c.color)} />
                <span className="text-xs font-semibold text-slate-500">{c.label}</span>
              </div>
              <p className={cn("text-3xl font-bold", c.color)}>{c.val}</p>
              <p className="text-[10px] text-slate-400">Toque para filtrar</p>
            </button>
          ))}
          {/* Card especial: Custo Mensal Total */}
          <div className="p-4 rounded-lg border bg-emerald-50 border-emerald-200 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-emerald-700" />
              <span className="text-xs font-semibold text-slate-500">Custo Mensal Total</span>
            </div>
            <p className="text-xl font-bold text-emerald-800 tabular-nums">{custoBR}</p>
            <p className="text-[10px] text-emerald-600">VG + APC (ativos + pend. inclusão)</p>
          </div>
        </div>

        {/* Informação da última importação */}
        {resumo?.ultimaImportacao && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 border rounded-lg text-sm text-slate-700">
            <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
            <span>
              Última validação: <strong>{resumo.ultimaImportacao.competencia}</strong> em {fmtDate(resumo.ultimaImportacao.data_importacao?.split("T")[0])} —
              {resumo.ultimaImportacao.total_segurados} segurados na lista do corretor,
              {resumo.ultimaImportacao.total_sem_seguro > 0
                ? <span className="text-red-700 font-bold"> {resumo.ultimaImportacao.total_sem_seguro} sem seguro!</span>
                : " ✅ sem divergências"
              }
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b flex gap-0">
          <button onClick={() => setTabAtiva("cobertura")}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tabAtiva === "cobertura" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            Coberturas Ativas
          </button>
          <button onClick={() => setTabAtiva("inconsistencias")}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              tabAtiva === "inconsistencias" ? "border-orange-600 text-orange-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Inconsistências
            {inconsistenciasQ.data?.totalInconsistencias ? (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 leading-none">
                {inconsistenciasQ.data.totalInconsistencias}
              </span>
            ) : null}
          </button>
          <button onClick={() => setTabAtiva("historico")}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tabAtiva === "historico" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            Histórico de Importações
          </button>
          <div className="ml-auto flex items-center gap-2 pb-1">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowSeed(true)}>
                <Upload className="h-4 w-4 mr-1.5" />Carga Inicial
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" />Imprimir
            </Button>
            <Button size="sm" variant="outline" onClick={exportarCSV} title="Exportar tabela filtrada como CSV">
              <Download className="h-4 w-4 mr-1.5" />Exportar CSV
            </Button>
            <Button size="sm" onClick={() => setShowImport(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />Importar Relatório do Corretor
            </Button>
          </div>
        </div>

        {tabAtiva === "cobertura" && (
          <>
            {/* Filtros — linha 1: busca + tipo de contrato */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-64" placeholder="Buscar por nome, cargo ou item..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              {/* Filtro por tipo de contrato */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {([
                  { key: "todos", label: "Todos" },
                  { key: "CLT",   label: "CLT" },
                  { key: "PJ",    label: "PJ" },
                  { key: "Socio", label: "Sócio" },
                ] as const).map(op => (
                  <button key={op.key} onClick={() => setFiltroTipo(op.key)}
                    className={cn("text-xs px-3 py-1 rounded-md font-semibold transition-colors",
                      filtroTipo === op.key
                        ? op.key === "PJ" ? "bg-yellow-500 text-white shadow-sm"
                          : op.key === "Socio" ? "bg-purple-600 text-white shadow-sm"
                          : op.key === "CLT" ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-slate-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")}>
                    {op.label}
                    {op.key !== "todos" && (
                      <span className="ml-1 opacity-70">
                        ({op.key === "PJ"
                          ? funcionariosNorm.filter((f: any) => (f.tipoContrato ?? "") === "PJ").length
                          : op.key === "Socio"
                          ? funcionariosNorm.filter((f: any) => (f.tipoContrato ?? "") === "Socio").length
                          : funcionariosNorm.filter((f: any) => !["PJ", "Socio"].includes(f.tipoContrato ?? "")).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-auto">{filtradas.length} de {funcionariosNorm.length} funcionários</span>
            </div>
            {/* Filtros — linha 2: status de cobertura */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: "todos",                label: "Todos",               activeClass: "bg-slate-600 text-white border-slate-600" },
                { key: "ativo",                label: "✅ Segurado Ativo",    activeClass: "bg-green-600 text-white border-green-600" },
                { key: "sem_cobertura",        label: "🔴 Sem Cobertura",     activeClass: "bg-red-600 text-white border-red-600" },
                { key: "pendente_inclusao",    label: "🔵 Pend. Inclusão",    activeClass: "bg-blue-600 text-white border-blue-600" },
                { key: "pendente_cancelamento",label: "🟡 Pend. Cancelamento",activeClass: "bg-orange-500 text-white border-orange-500" },
                { key: "cancelado",            label: "⚫ Cancelado",          activeClass: "bg-slate-800 text-white border-slate-800" },
              ] as const).map(op => {
                const count = op.key === "todos"
                  ? listaPorTipo.length
                  : listaPorTipo.filter((f: any) => f.statusSeguro === op.key).length;
                if (op.key !== "todos" && count === 0) return null;
                return (
                  <button key={op.key} onClick={() => setFiltroStatus(op.key)}
                    className={cn("text-[11px] px-3 py-1 rounded-full border font-medium transition-colors",
                      filtroStatus === op.key ? op.activeClass : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                    {op.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Barra de ação em lote */}
            {isAdmin && selectedCoverageIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-sm font-semibold text-red-700">
                  {selectedCoverageIds.size} cobertura{selectedCoverageIds.size > 1 ? "s" : ""} selecionada{selectedCoverageIds.size > 1 ? "s" : ""}
                </span>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs ml-2"
                  disabled={cancelarMultiplas.isPending}
                  onClick={() => {
                    showConfirm(
                      `Cancelar ${selectedCoverageIds.size} cobertura${selectedCoverageIds.size > 1 ? "s" : ""}`,
                      "Esta ação não pode ser desfeita.",
                      () => cancelarMultiplas.mutate({ companyId, coberturaIds: [...selectedCoverageIds] }),
                      filtradas.filter((f: any) => selectedCoverageIds.has(f.cobertura_id)).map((f: any) => f.nomeCompleto)
                    );
                  }}>
                  {cancelarMultiplas.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Cancelando...</>
                    : <><Ban className="h-3.5 w-3.5 mr-1" />Cancelar selecionados</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 ml-auto"
                  onClick={() => setSelectedCoverageIds(new Set())}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpar seleção
                </Button>
              </div>
            )}

            {/* Tabela de TODOS os funcionários com status de seguro */}
            {(() => {
              const cancelaveis = filtradas.filter((f: any) => isAdmin && f.cobertura_id && f.seguro_status !== "cancelado");
              const todosSelecionados = cancelaveis.length > 0 && cancelaveis.every((f: any) => selectedCoverageIds.has(f.cobertura_id));
              const algumSelecionado = cancelaveis.some((f: any) => selectedCoverageIds.has(f.cobertura_id));
              const toggleAll = () => {
                if (todosSelecionados) {
                  setSelectedCoverageIds(prev => {
                    const next = new Set(prev);
                    cancelaveis.forEach((f: any) => next.delete(f.cobertura_id));
                    return next;
                  });
                } else {
                  setSelectedCoverageIds(prev => {
                    const next = new Set(prev);
                    cancelaveis.forEach((f: any) => next.add(f.cobertura_id));
                    return next;
                  });
                }
              };
              return (
            <div className="border rounded-xl overflow-auto shadow-sm">
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="sticky top-0 z-10">
                  {/* Linha 1 — grupos */}
                  <tr className="border-b">
                    <th colSpan={isAdmin ? 5 : 4} className="px-3 py-2 text-left font-bold text-slate-600 bg-slate-100 border-r text-[11px] uppercase tracking-wide">
                      Funcionário
                    </th>
                    <th colSpan={4} className="px-3 py-2 text-center font-bold text-blue-700 bg-blue-50 border-r text-[11px] uppercase tracking-wide">
                      Importâncias Seguradas
                    </th>
                    <th colSpan={3} className="px-3 py-2 text-center font-bold text-emerald-700 bg-emerald-50 border-r text-[11px] uppercase tracking-wide">
                      Prêmios Mensais
                    </th>
                    <th className="bg-slate-50"></th>
                  </tr>
                  {/* Linha 2 — colunas individuais */}
                  <tr className="border-b bg-slate-50">
                    {isAdmin && (
                      <th className="px-3 py-2 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={todosSelecionados}
                          ref={el => { if (el) el.indeterminate = algumSelecionado && !todosSelecionados; }}
                          onChange={toggleAll}
                          className="h-3.5 w-3.5 rounded border-slate-300 cursor-pointer accent-red-600"
                        />
                      </th>
                    )}
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-r">Nome</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">Cargo</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">Tipo</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap border-r">Status</th>
                    <th className="px-3 py-2 text-right font-semibold text-blue-600 whitespace-nowrap">Morte Natural</th>
                    <th className="px-3 py-2 text-right font-semibold text-blue-600 whitespace-nowrap">Morte Acidental</th>
                    <th className="px-3 py-2 text-right font-semibold text-blue-600 whitespace-nowrap">Inv. Acidente</th>
                    <th className="px-3 py-2 text-right font-semibold text-blue-600 whitespace-nowrap border-r">Inv. Doença</th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-600 whitespace-nowrap">V.G.</th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-600 whitespace-nowrap">A.P.C.</th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-800 whitespace-nowrap border-r bg-emerald-50/60">Custo/Mês</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-400 whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {funcionariosQ.isLoading ? (
                    <tr><td colSpan={isAdmin ? 13 : 12} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
                  ) : filtradas.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 13 : 12} className="text-center py-12 text-muted-foreground">
                      {funcionariosNorm.length === 0
                        ? "Nenhum funcionário CLT ativo encontrado. Cadastre funcionários no módulo de Colaboradores."
                        : "Nenhum resultado para os filtros aplicados."}
                    </td></tr>
                  ) : filtradas.map((f: any) => {
                    const temValores = !!(f.morte_natural || f.morte_acidental || f.invalidez_acidente);
                    const cancelavel = isAdmin && f.cobertura_id && f.seguro_status !== "cancelado";
                    const selecionado = selectedCoverageIds.has(f.cobertura_id);
                    return (
                      <tr key={f.id} className={cn("hover:bg-slate-50/60 transition-colors",
                        selecionado ? "bg-red-50/60 outline outline-1 outline-red-200" :
                        f.statusSeguro === "ativo" ? "bg-green-50/50" :
                        f.statusSeguro === "sem_cobertura" ? "bg-red-50/30" :
                        f.statusSeguro === "pendente_cancelamento" ? "bg-orange-50/30" :
                        f.statusSeguro === "pendente_inclusao" ? "bg-blue-50/30" : "")}>
                        {/* Checkbox */}
                        {isAdmin && (
                          <td className="px-3 py-2.5 w-8 text-center">
                            {cancelavel && (
                              <input
                                type="checkbox"
                                checked={selecionado}
                                onChange={() => setSelectedCoverageIds(prev => {
                                  const next = new Set(prev);
                                  selecionado ? next.delete(f.cobertura_id) : next.add(f.cobertura_id);
                                  return next;
                                })}
                                className="h-3.5 w-3.5 rounded border-slate-300 cursor-pointer accent-red-600"
                              />
                            )}
                          </td>
                        )}
                        {/* Funcionário */}
                        <td className="px-3 py-2.5 font-medium text-slate-800 border-r w-[260px] min-w-[220px] max-w-[280px]">
                          <div className="flex items-center gap-2.5">
                            {f.fotoUrl ? (
                              <img src={`${f.fotoUrl}?w=128`} loading="lazy" alt="" className="h-8 w-8 rounded-full object-cover shrink-0 border border-slate-200" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                                {String(f.nomeCompleto || "?").trim().split(/\s+/).map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="leading-snug break-words">{f.nomeCompleto}</div>
                              {f.obra_nome && (
                                <div className="text-[10px] text-slate-400 font-normal truncate" title={f.obra_nome}>📍 {f.obra_nome}</div>
                              )}
                            </div>
                          </div>
                          {f.emp_status && !["Ativo", "Ferias"].includes(f.emp_status) && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block",
                              f.emp_status === "Afastado" ? "bg-orange-100 text-orange-700" :
                              f.emp_status === "Aviso"    ? "bg-yellow-100 text-yellow-800" :
                              "bg-slate-100 text-slate-600"
                            )}>{f.emp_status}</span>
                          )}
                          {f.seguradora && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{f.seguradora}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 w-[180px] min-w-[140px] max-w-[200px] leading-snug break-words">{f.funcao || f.cargo || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("px-1.5 py-0.5 rounded font-mono",
                            f.tipoContrato === "Socio" ? "bg-purple-100 text-purple-700" :
                            f.tipoContrato === "PJ" ? "bg-yellow-100 text-yellow-800" :
                            "bg-slate-100 text-slate-600")}>{f.tipoContrato === "Socio" ? "Sócio" : (f.tipoContrato ?? "CLT")}</span>
                        </td>
                        <td className="px-3 py-2.5 border-r">
                          <StatusBadge status={f.statusSeguro} />
                          {f.statusSeguro === "sem_cobertura" && (
                            <div className="text-[10px] text-red-600 mt-0.5 whitespace-nowrap">
                              {f.ultima_cobertura_fim
                                ? `desde ${fmtDate(f.ultima_cobertura_fim)}`
                                : f.dataAdmissao
                                  ? `nunca teve (adm. ${fmtDate(f.dataAdmissao)})`
                                  : "nunca teve seguro"}
                            </div>
                          )}
                          {f.item_segurador && (
                            <div className="font-mono text-[10px] text-slate-400 mt-0.5">#{f.item_segurador}</div>
                          )}
                        </td>
                        {/* Importâncias Seguradas */}
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", temValores ? "text-slate-700" : "text-slate-300")}>
                          {fmtCapital(f.morte_natural)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", temValores ? "text-slate-700" : "text-slate-300")}>
                          {fmtCapital(f.morte_acidental)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", temValores ? "text-slate-700" : "text-slate-300")}>
                          {fmtCapital(f.invalidez_acidente)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums border-r", f.invalidez_doenca ? "text-slate-700" : "text-slate-300")}>
                          {fmtCapital(f.invalidez_doenca)}
                        </td>
                        {/* Prêmios */}
                        <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium", f.premio_vg ? "text-emerald-700" : "text-slate-300")}>
                          {fmtPremio(f.premio_vg)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium", f.premio_apc ? "text-emerald-700" : "text-slate-300")}>
                          {fmtPremio(f.premio_apc)}
                        </td>
                        {/* Custo Mensal = VG + APC */}
                        {(() => {
                          const custo = parseBrMoney(f.premio_vg) + parseBrMoney(f.premio_apc);
                          return (
                            <td className={cn("px-3 py-2.5 text-right tabular-nums font-bold border-r", custo > 0 ? "text-emerald-800 bg-emerald-50/40" : "text-slate-200")}>
                              {fmtCustoMensal(custo)}
                            </td>
                          );
                        })()}
                        {/* Ações */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 flex-nowrap">
                            {f.statusSeguro === "pendente_inclusao" && isAdmin && f.cobertura_id && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                                onClick={() => showConfirm("Confirmar inclusão", `Confirmar inclusão de ${f.nomeCompleto} como Ativo?`, () => confirmarStatus.mutate({ companyId, coberturaId: f.cobertura_id, novoStatus: "ativo" }))}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Incluir
                              </Button>
                            )}
                            {f.statusSeguro === "pendente_cancelamento" && isAdmin && f.cobertura_id && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 whitespace-nowrap"
                                onClick={() => showConfirm("Confirmar cancelamento", `Cancelar cobertura de ${f.nomeCompleto}?`, () => confirmarStatus.mutate({ companyId, coberturaId: f.cobertura_id, novoStatus: "cancelado" }))}>
                                <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                              </Button>
                            )}
                            {cancelavel && f.statusSeguro === "ativo" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => showConfirm("Cancelar cobertura", `Cancelar cobertura de ${f.nomeCompleto}?`, () => cancelar.mutate({ companyId, coberturaId: f.cobertura_id }))}>
                                <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totais.comValores > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-100 to-slate-50">
                      {isAdmin && <td className="px-3 py-2.5" />}
                      <td colSpan={4} className="px-3 py-2.5 border-r">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          TOTAL ({totais.comValores} com valores)
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-700 text-xs">
                        {fmtBrMoney(totais.morte_natural)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-700 text-xs">
                        {fmtBrMoney(totais.morte_acidental)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-700 text-xs">
                        {fmtBrMoney(totais.invalidez_acidente)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-600 text-xs border-r">
                        {fmtBrMoney(totais.invalidez_doenca)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700 text-xs">
                        {fmtBrMoney(totais.premio_vg)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700 text-xs">
                        {fmtBrMoney(totais.premio_apc)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-emerald-900 text-xs border-r bg-emerald-100/60">
                        {fmtBrMoney(totais.custo_mensal)}
                      </td>
                      <td className="px-3 py-2.5" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
              );
            })()}
          </>
        )}

        {tabAtiva === "inconsistencias" && (() => {
          const inc = inconsistenciasQ.data;
          const loading = inconsistenciasQ.isLoading;
          const demitidosCobertura: any[] = inc?.demitidosCobertura ?? [];
          const demitidosPDF: any[] = inc?.demitidosPDF ?? [];
          const semSeguro: any[] = inc?.semSeguro ?? [];
          const pjs: any[] = inc?.pjsComCobertura ?? [];
          const naoId: any[] = inc?.naoIdentificados ?? [];
          const pagarIndevidos: any[] = inc?.pagarIndevidos ?? [];

          if (loading) return (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />Carregando inconsistências...
            </div>
          );

          if (!inc) return null;

          const SectionCard = ({ title, count, colorClass, bgClass, borderClass, subtitle, children }: {
            title: string; count: number; colorClass: string; bgClass: string; borderClass: string; subtitle?: string; children: any;
          }) => (
            <div className={cn("rounded-xl border overflow-hidden", borderClass)}>
              <div className={cn("flex items-center gap-3 px-5 py-3", bgClass)}>
                <div>
                  <span className={cn("font-semibold text-sm", colorClass)}>{title}</span>
                  {subtitle && <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>}
                </div>
                <span className={cn("ml-auto text-xl font-bold", colorClass)}>{count}</span>
              </div>
              {count > 0 ? children : (
                <div className="px-5 py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                  Nenhuma ocorrência encontrada
                </div>
              )}
            </div>
          );

          const totalDemitidos = demitidosCobertura.length + demitidosPDF.length;

          return (
            <div className="space-y-5 pt-1">

              {inc.totalInconsistencias === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <CheckCircle2 className="h-14 w-14 text-green-400" />
                  <p className="text-lg font-semibold text-green-700">Nenhuma inconsistência detectada!</p>
                  <p className="text-sm">Todos os segurados estão devidamente vinculados a funcionários ativos.</p>
                </div>
              )}

              {/* Seção 1 — Demitidos/Inativos ainda na apólice */}
              <SectionCard
                title="🔴 Demitidos/Inativos ainda na apólice"
                count={totalDemitidos}
                colorClass="text-red-700" bgClass="bg-red-50" borderClass="border-red-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50/60 border-b border-red-100">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-red-800">Nome</th>
                        <th className="px-4 py-2 text-left font-semibold text-red-800">Situação</th>
                        <th className="px-4 py-2 text-left font-semibold text-red-800">Data Demissão</th>
                        <th className="px-4 py-2 text-left font-semibold text-red-800">Item Apólice</th>
                        <th className="px-4 py-2 text-left font-semibold text-red-800">Origem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {demitidosCobertura.map((d: any, i: number) => (
                        <tr key={`cob-${i}`} className="hover:bg-red-50/40">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{d.nome_rh ?? d.nome_completo}</p>
                            <p className="text-[10px] text-slate-400">{d.funcao ?? d.cargo ?? ""}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{d.emp_status ?? "—"}</span>
                          </td>
                          <td className="px-4 py-2.5 text-red-700 font-semibold text-sm">
                            {d.dataDemissao ? fmtDate(d.dataDemissao?.split?.("T")?.[0]) : <span className="text-slate-400 font-normal italic">sem data</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{d.item_segurador || "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Cadastro</span>
                          </td>
                        </tr>
                      ))}
                      {demitidosPDF.map((d: any, i: number) => {
                        const pd = d.possivelDesligado;
                        const [ano, mes] = (d.competencia ?? "").split("-");
                        return (
                          <tr key={`pdf-${i}`} className="hover:bg-red-50/40 bg-red-50/20">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-800">{pd?.nome ?? d.nome}</p>
                              <p className="text-[10px] text-slate-400">PDF do corretor: <span className="font-semibold">{d.nome}</span></p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{pd?.status ?? "Desligado"}</span>
                            </td>
                            <td className="px-4 py-2.5 text-red-700 font-semibold text-sm">
                              {pd?.dataDemissao ? fmtDate(pd.dataDemissao) : <span className="text-slate-400 font-normal italic">sem data</span>}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{d.item || "—"}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{MESES[Number(mes) - 1]} {ano}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Seção 2 — Sem Seguro (ativos sem cobertura na última importação) */}
              <SectionCard
                title="🛡️ Sem Seguro — ativos não cobertos"
                count={semSeguro.length}
                subtitle={inc.semSeguroCompetencia ? `Competência: ${(() => { const [a,m] = (inc.semSeguroCompetencia ?? "").split("-"); return `${MESES[Number(m)-1]} ${a}`; })()}` : undefined}
                colorClass="text-red-800" bgClass="bg-red-100" borderClass="border-red-300">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50 border-b border-red-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-red-900">Nome (RH)</th>
                        <th className="px-4 py-2 text-left font-semibold text-red-900">Data Admissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {semSeguro.map((s: any, i: number) => (
                        <tr key={i} className="hover:bg-red-50/60">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{s.nomeHR}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-sm">
                            {s.dataAdmissao ? fmtDate(s.dataAdmissao?.split?.("T")?.[0]) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Seção 3 — PJs / Sócios na apólice */}
              <SectionCard
                title="🟡 PJs / Sócios na apólice"
                count={pjs.length}
                colorClass="text-amber-700" bgClass="bg-amber-50" borderClass="border-amber-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50/60 border-b border-amber-100">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-amber-800">Nome (RH)</th>
                        <th className="px-4 py-2 text-left font-semibold text-amber-800">Cargo/Função</th>
                        <th className="px-4 py-2 text-left font-semibold text-amber-800">Tipo Contrato</th>
                        <th className="px-4 py-2 text-left font-semibold text-amber-800">Item Apólice</th>
                        <th className="px-4 py-2 text-left font-semibold text-amber-800">Status Cobertura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {pjs.map((p: any, i: number) => (
                        <tr key={i} className="hover:bg-amber-50/40">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{p.nome_rh ?? p.nome_completo}</td>
                          <td className="px-4 py-2.5 text-slate-600 text-xs">{p.funcao ?? p.cargo ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-bold">{p.tipoContrato}</span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.item_segurador || "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{p.cobertura_status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Seção 4 — Não identificados (sem match algum no HR) */}
              <SectionCard
                title="❓ Não identificados nas últimas importações"
                count={naoId.length}
                subtitle="Nomes no PDF sem correspondência no ERP (últimas 6 competências)"
                colorClass="text-slate-700" bgClass="bg-slate-100" borderClass="border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Competência</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Nome no PDF (Corretor)</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Item</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Data Importação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {naoId.map((n: any, i: number) => {
                        const [ano, mes] = (n.competencia ?? "").split("-");
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5">
                              <span className="text-xs font-semibold text-slate-700">{MESES[Number(mes) - 1]} {ano}</span>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{n.nome}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{n.item || "—"}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-400">{fmtDate(n.dataImportacao?.split?.("T")?.[0])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Seção 5 — Pagamentos Indevidos Registrados (tabela dedicada, persistente) */}
              <SectionCard
                title="💸 Pagamentos Indevidos Registrados"
                count={pagarIndevidos.length}
                subtitle="Pessoas no PDF da corretora que não são mais funcionários ativos — histórico persistente de todas as importações"
                colorClass="text-orange-700" bgClass="bg-orange-50" borderClass="border-orange-300">
                {pagarIndevidos.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-orange-50/80 border-b border-orange-100">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Competência</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Nome no PDF (Corretor)</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Nome no RH</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Situação</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Demissão</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Item</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-800">Importado em</th>
                          <th className="px-4 py-2 text-center font-semibold text-orange-800">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-50">
                        {pagarIndevidos.map((r: any) => {
                          const [ano, mes] = (r.competencia ?? "").split("-");
                          const situacaoCls =
                            r.situacao === "Desligado" ? "bg-red-100 text-red-700" :
                            r.situacao === "Recluso" || r.situacao === "Blacklist" ? "bg-purple-100 text-purple-700" :
                            r.possivel_pj ? "bg-yellow-100 text-yellow-800" :
                            "bg-slate-100 text-slate-600";
                          return (
                            <tr key={r.id} className="hover:bg-orange-50/60">
                              <td className="px-4 py-2.5">
                                <span className="text-xs font-bold text-orange-700 whitespace-nowrap">
                                  {MESES[Number(mes) - 1]} {ano}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <p className="font-semibold text-slate-800">{r.nome_pdf}</p>
                              </td>
                              <td className="px-4 py-2.5 text-slate-600 text-xs">
                                {r.nome_rh || <span className="italic text-slate-400">não encontrado</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${situacaoCls}`}>
                                  {r.situacao || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-sm font-medium text-red-700">
                                {r.data_demissao ? fmtDate(r.data_demissao) : <span className="text-slate-400 font-normal italic text-xs">sem data</span>}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.item_segurador || "—"}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                                {r.importado_em ? fmtDate(String(r.importado_em).split("T")[0]) : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  onClick={() => {
                                    if (confirm(`Marcar "${r.nome_pdf}" como resolvido?`)) {
                                      resolverIndevido.mutate({ companyId, id: r.id });
                                    }
                                  }}
                                  disabled={resolverIndevido.isPending}
                                  className="text-xs px-2.5 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                                >
                                  ✓ Resolver
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

            </div>
          );
        })()}

        {tabAtiva === "historico" && (
          <div className="space-y-4">
            {/* ── Timeline calendário ── */}
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAnoTimeline(a => a - 1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-bold text-base min-w-[52px] text-center">{anoTimeline}</span>
                  <button
                    onClick={() => setAnoTimeline(a => a + 1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-400" /> Sem divergências</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-400" /> Com divergências</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /> Sem dados</div>
                  {mesFiltro !== null && (
                    <button onClick={() => setMesFiltro(null)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2">
                      Ver todos
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MESES_CURTOS.map((nome, i) => {
                  const mes = i + 1;
                  const mesRef = `${anoTimeline}-${String(mes).padStart(2, "0")}`;
                  const impsDoMes = (importacoesQ.data ?? []).filter((imp: any) => imp.competencia === mesRef);
                  const status = impsDoMes.length === 0
                    ? "vazio"
                    : impsDoMes.some((imp: any) => imp.total_sem_seguro > 0 || imp.total_pagar_indevido > 0)
                    ? "divergencia"
                    : "ok";
                  const isSelected = mesFiltro === mes;
                  return (
                    <button key={mes}
                      onClick={() => setMesFiltro(prev => prev === mes ? null : mes)}
                      className={cn(
                        "rounded-lg p-2 text-center text-xs font-medium transition-all border-2",
                        isSelected
                          ? "border-[#1B2A4A] ring-2 ring-[#1B2A4A]/30 shadow-md bg-slate-100"
                          : status === "ok"
                          ? "bg-green-100 border-green-300 text-green-800 hover:bg-green-200"
                          : status === "divergencia"
                          ? "bg-red-100 border-red-300 text-red-800 hover:bg-red-200"
                          : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
                      )}>
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Lista de importações ── */}
            {importacoesQ.isLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Carregando histórico...</div>
            ) : (() => {
              const todas = importacoesQ.data ?? [];
              const filtradas = mesFiltro !== null
                ? todas.filter((imp: any) => imp.competencia === `${anoTimeline}-${String(mesFiltro).padStart(2, "0")}`)
                : todas;
              if (todas.length === 0) {
                return (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    Nenhuma importação realizada ainda. Use o botão "Importar Relatório do Corretor" para iniciar.
                  </div>
                );
              }
              if (filtradas.length === 0) {
                const mesLabel = MESES[(mesFiltro ?? 1) - 1];
                return (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    Nenhuma importação para {mesLabel} {anoTimeline}.
                    <button onClick={() => setMesFiltro(null)} className="ml-2 text-indigo-600 hover:underline text-sm">Ver todas</button>
                  </div>
                );
              }
              const todosIds = filtradas.map((imp: any) => imp.id);
              const todosSelecionados = todosIds.length > 0 && todosIds.every((id: number) => selectedIds.has(id));
              const algunsSelecionados = todosIds.some((id: number) => selectedIds.has(id));
              const qtdSelecionados = todosIds.filter((id: number) => selectedIds.has(id)).length;

              const toggleSelecionar = (id: number) => {
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                });
              };
              const toggleTodos = () => {
                if (todosSelecionados) {
                  setSelectedIds(prev => { const next = new Set(prev); todosIds.forEach((id: number) => next.delete(id)); return next; });
                } else {
                  setSelectedIds(prev => { const next = new Set(prev); todosIds.forEach((id: number) => next.add(id)); return next; });
                }
              };

              return (
                <div className="space-y-2">
                  {/* Barra de ação em lote */}
                  <div className={cn(
                    "flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all duration-200",
                    qtdSelecionados > 0
                      ? "bg-red-50 border-red-200 shadow-sm"
                      : "bg-slate-50 border-slate-200"
                  )}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={todosSelecionados}
                        ref={el => { if (el) el.indeterminate = algunsSelecionados && !todosSelecionados; }}
                        onChange={toggleTodos}
                        className="h-4 w-4 rounded border-slate-300 cursor-pointer accent-red-600"
                        title="Selecionar todos"
                      />
                      <span className="text-xs font-medium text-slate-600">
                        {qtdSelecionados > 0
                          ? `${qtdSelecionados} selecionado${qtdSelecionados > 1 ? "s" : ""} de ${filtradas.length}`
                          : `${filtradas.length} importaç${filtradas.length === 1 ? "ão" : "ões"}`}
                      </span>
                    </div>
                    {qtdSelecionados > 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs gap-1.5"
                        disabled={deletarImportacoes.isPending}
                        onClick={() => {
                          const idsParaDeletar = [...selectedIds].filter(id => todosIds.includes(id));
                          showConfirm(
                            `Remover ${idsParaDeletar.length} importaç${idsParaDeletar.length === 1 ? "ão" : "ões"}`,
                            "Esta ação não pode ser desfeita.",
                            () => deletarImportacoes.mutate({ companyId, importacaoIds: idsParaDeletar })
                          );
                        }}>
                        {deletarImportacoes.isPending
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Removendo...</>
                          : <><Trash2 className="h-3.5 w-3.5" />Excluir {qtdSelecionados} selecionado{qtdSelecionados > 1 ? "s" : ""}</>}
                      </Button>
                    )}
                  </div>

                  {filtradas.map((imp: any) => (
                    <div key={imp.id} className={cn(
                      "border rounded-xl transition-colors",
                      selectedIds.has(imp.id) ? "border-red-300 bg-red-50/40" : "hover:bg-slate-50/80"
                    )}>
                      <div className="flex items-center justify-between flex-wrap gap-2 p-4"
                        onClick={() => setDetailImport(detailImport?.id === imp.id ? null : imp)}
                        style={{ cursor: "pointer" }}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(imp.id)}
                            onChange={e => { e.stopPropagation(); toggleSelecionar(imp.id); }}
                            onClick={e => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-300 cursor-pointer accent-red-600 shrink-0"
                          />
                          <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
                          <div>
                            <p className="font-semibold text-sm">Competência {imp.competencia}</p>
                            <p className="text-xs text-muted-foreground">
                              Importado em {fmtDate(imp.data_importacao?.split("T")[0])} por {imp.importado_por || "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 bg-slate-100 rounded font-mono">{imp.total_segurados} na lista</span>
                          <span className={cn("px-2 py-0.5 rounded font-semibold", imp.total_sem_seguro > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                            {imp.total_sem_seguro > 0 ? `${imp.total_sem_seguro} sem seguro` : "✅ Sem divergências"}
                          </span>
                          {imp.total_pagar_indevido > 0 && (
                            <span className="px-2 py-0.5 rounded font-semibold bg-orange-100 text-orange-700">{imp.total_pagar_indevido} indevido</span>
                          )}
                          {imp.tem_pdf && (
                            <DownloadPdfBtn importacaoId={imp.id} companyId={companyId} competencia={imp.competencia} />
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              showConfirm(
                                "Remover importação",
                                `Remover competência ${imp.competencia}? Esta ação não pode ser desfeita.`,
                                () => deletarImportacao.mutate({ companyId, importacaoId: imp.id })
                              );
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors ml-1"
                            title="Limpar importação">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {detailImport?.id === imp.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </div>
                      </div>

                      {detailImport?.id === imp.id && (
                        <div className="border-t border-slate-100 bg-white rounded-b-xl overflow-hidden">
                          <ImportacaoDetalheExpand importacaoId={imp.id} companyId={companyId} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modais */}
      <ImportModal open={showImport} onClose={() => setShowImport(false)} companyId={companyId} companyIds={companyIds} onSuccess={invalidate} />
      {isAdmin && <SeedModal open={showSeed} onClose={() => setShowSeed(false)} companyId={companyId} companyIds={companyIds} onSuccess={invalidate} />}

      {/* Dialog de confirmação customizado */}
      <Dialog open={confirmDlg.open} onOpenChange={open => { if (!open) setConfirmDlg(p => ({ ...p, open: false })); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              {confirmDlg.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-3">
            <p className="text-sm text-slate-600">{confirmDlg.body}</p>
            {confirmDlg.names && confirmDlg.names.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 leading-relaxed">
                {confirmDlg.names.map((n, i) => (
                  <div key={i} className="py-0.5 border-b last:border-0 border-slate-100">{n}</div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDlg(p => ({ ...p, open: false }))}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { confirmDlg.onOk(); setConfirmDlg(p => ({ ...p, open: false })); }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
