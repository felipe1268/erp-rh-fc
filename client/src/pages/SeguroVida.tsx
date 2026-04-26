import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";
import {
  ShieldCheck, ShieldAlert, Shield, AlertTriangle, CheckCircle2,
  Clock, Search, Upload, FileText, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, RefreshCw, Printer, Ban, X, Loader2,
  ArrowRightLeft, Info, FilePlus2, Trash2, FileUp,
} from "lucide-react";
import { useState, useMemo, useRef, useCallback } from "react";
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

// ─── Painel de detalhe de um mês (usado no layout dois painéis) ───────────────
function ResultadoMesDetalhe({ res }: { res: any }) {
  const [filtro, setFiltro] = useState("divergencias");

  if (res.erro) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-800 mb-1">{res.filename ?? res.competencia}</p>
          <p className="text-sm text-red-600">{res.erro}</p>
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
        {/* Estatísticas */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Na lista", val: res.totalSeguradosCorretora, cls: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
            { label: "Funcionários CLT", val: res.totalAtivosHR, cls: "text-blue-700", bg: "bg-blue-50 border-blue-100" },
            { label: "✅ OK", val: res.totalOk, cls: "text-green-700", bg: "bg-green-50 border-green-100" },
            { label: "🔴 Sem seguro", val: res.totalSemSeguro, cls: "text-red-700", bg: "bg-red-50 border-red-100" },
            { label: "🟡 Indevido", val: res.totalPagarIndevido, cls: "text-orange-700", bg: "bg-orange-50 border-orange-100" },
          ].map((c, i) => (
            <div key={i} className={cn("text-center p-3 rounded-xl border", c.bg)}>
              <p className={cn("text-2xl font-bold", c.cls)}>{c.val ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 py-2.5 border-b shrink-0 flex gap-1.5 flex-wrap bg-slate-50">
        {[
          { key: "divergencias", label: "Só divergências" },
          { key: "todos", label: "Todos" },
          { key: "sem_seguro", label: "Sem seguro" },
          { key: "pagar_indevido", label: "Indevido" },
          { key: "ok", label: "OK" },
          { key: "novo", label: "Recém-admitido" },
        ].map(op => (
          <button key={op.key} onClick={() => setFiltro(op.key)}
            className={cn("text-[11px] px-3 py-1 rounded-full border font-medium transition-colors",
              filtro === op.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 hover:bg-slate-100")}>
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
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-24">Similaridade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhasFiltradas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Nenhum resultado para este filtro.</td></tr>
            ) : linhasFiltradas.map((r: any, i: number) => {
              const st = RESULT_STATUS[r.status] ?? RESULT_STATUS.ok;
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
                  <td className="px-4 py-2.5 text-slate-600">{r.nome}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">{r.item || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">
                    {r.similaridade != null ? `${Math.round(r.similaridade * 100)}%` : "—"}
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

  const processarLote = trpc.seguroVida.processarPdfLote.useMutation({
    onSuccess: (data) => {
      setResultados(data.resultados);
      onSuccess();
      const ok = data.resultados.filter((r: any) => !r.erro && r.totalSemSeguro === 0).length;
      const erros = data.resultados.filter((r: any) => r.erro).length;
      toast.success(`${data.resultados.length} mês(es) processado(s). ${ok} sem divergências.${erros ? ` ${erros} erro(s) ao ler PDF.` : ""}`);
    },
    onError: e => toast.error(e.message),
  });

  const importarTexto = trpc.seguroVida.importarRelatorio.useMutation({
    onSuccess: (data) => {
      setResultados([data]);
      onSuccess();
      toast.success(`Cruzamento concluído: ${data.totalOk} OK, ${data.totalSemSeguro} sem seguro`);
    },
    onError: e => toast.error(e.message),
  });

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
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border rounded-xl">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Apólice VG</label>
                  <Input value={apoliceVG} onChange={e => setApoliceVG(e.target.value)} placeholder="117.398-5" className="font-mono" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Apólice APC</label>
                  <Input value={apoliceAPC} onChange={e => setApoliceAPC(e.target.value)} placeholder="121.268-3" className="font-mono" />
                </div>
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
                    companyId, companyIds, apoliceVG, apoliceAPC,
                    arquivos: arquivos.map(a => ({ competencia: a.competencia, filename: a.file.name, fileBase64: a.fileBase64 })),
                  })}>
                  {processarLote.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando {arquivos.length} arquivo(s)...</>
                    : <><ArrowRightLeft className="h-4 w-4 mr-2" />Processar {arquivos.length} arquivo(s)</>}
                </Button>
              ) : (
                <Button
                  disabled={!nomes.trim() || importarTexto.isPending}
                  onClick={() => importarTexto.mutate({ companyId, companyIds, competencia: competenciaTexto, nomesBrutos: nomes, apoliceVG, apoliceAPC })}>
                  {importarTexto.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cruzando...</>
                    : <><ArrowRightLeft className="h-4 w-4 mr-2" />Cruzar com Funcionários</>}
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" onClick={() => { onClose(); reset(); }}>
              <X className="h-4 w-4 mr-2" />Fechar
            </Button>
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

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SeguroVida() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_master";

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showImport, setShowImport] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [tabAtiva, setTabAtiva] = useState<"cobertura" | "historico">("cobertura");
  const [detailImport, setDetailImport] = useState<any>(null);
  const now = new Date();
  const [anoTimeline, setAnoTimeline] = useState(now.getFullYear());
  const [mesFiltro, setMesFiltro] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const resumoQ = trpc.seguroVida.getResumo.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const funcionariosQ = trpc.seguroVida.listarFuncionariosComStatus.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const importacoesQ = trpc.seguroVida.listarImportacoes.useQuery(
    { companyId, companyIds },
    { enabled: (companyId > 0 || companyIds.length > 0) && tabAtiva === "historico" }
  );

  const cancelar = trpc.seguroVida.cancelarCobertura.useMutation({
    onSuccess: () => { toast.success("Cobertura cancelada"); utils.seguroVida.listarFuncionariosComStatus.invalidate(); utils.seguroVida.getResumo.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const deletarImportacao = trpc.seguroVida.deletarImportacao.useMutation({
    onSuccess: () => { toast.success("Importação removida"); utils.seguroVida.listarImportacoes.invalidate(); utils.seguroVida.getResumo.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const resumo = resumoQ.data;
  const funcionarios = funcionariosQ.data ?? [];

  // Mapeia cada funcionário para um status de seguro unificado
  const funcionariosNorm = useMemo(() => funcionarios.map((f: any) => ({
    ...f,
    statusSeguro: f.seguro_status ?? "sem_cobertura",
  })), [funcionarios]);

  const filtradas = useMemo(() => {
    let lista = funcionariosNorm;
    if (filtroStatus !== "todos") lista = lista.filter((f: any) => f.statusSeguro === filtroStatus);
    if (busca.trim()) {
      const b = removeAccents(busca.toLowerCase());
      lista = lista.filter((f: any) =>
        removeAccents((f.nomeCompleto ?? "").toLowerCase()).includes(b) ||
        (f.cargo ?? "").toLowerCase().includes(b) ||
        (f.item_segurador ?? "").includes(b)
      );
    }
    return lista;
  }, [funcionariosNorm, filtroStatus, busca]);

  const invalidate = () => {
    utils.seguroVida.listarFuncionariosComStatus.invalidate();
    utils.seguroVida.getResumo.invalidate();
    utils.seguroVida.listarImportacoes.invalidate();
  };

  // ── Impressão ──
  const handlePrint = () => {
    const linhas = filtradas.map((f: any) => {
      const s = STATUS_LABELS[f.statusSeguro]?.label ?? f.statusSeguro;
      return `<tr><td>${f.nomeCompleto ?? "—"}</td><td>${f.cargo ?? "—"}</td><td>${s}</td><td>${f.item_segurador ?? "—"}</td><td>${fmtDate(f.data_adesao)}</td><td>${f.apolice_vg ?? "—"}</td></tr>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Seguro de Vida</title><style>body{font-family:Arial,sans-serif;font-size:11px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:4px 6px;}th{background:#eee;font-weight:bold;}h2{margin-bottom:4px;}</style></head><body>
      <h2>Seguro de Vida — Relação de Segurados</h2>
      <p>Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")} | Total: ${filtradas.length} registros</p>
      <table><thead><tr><th>Nome</th><th>Cargo</th><th>Status</th><th>Item</th><th>Adesão</th><th>Apólice VG</th></tr></thead><tbody>${linhas}</tbody></table>
      </body></html>`);
    w.document.close();
    w.print();
  };

  // ── Cards ──
  const cards = [
    { label: "Segurados Ativos",       val: resumo?.totalSeguradosAtivos ?? 0,      icon: ShieldCheck,  color: "text-green-700",  bg: "bg-green-50 border-green-200" },
    { label: "Pend. Inclusão",         val: resumo?.totalPendenteInclusao ?? 0,     icon: Clock,        color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
    { label: "Pend. Cancelamento",     val: resumo?.totalPendenteCancelamento ?? 0, icon: AlertTriangle,color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
    { label: "CLT sem Cobertura ⚠️",  val: resumo?.totalSemSeguro ?? 0,            icon: ShieldAlert,  color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  ];

  return (
    <DashboardLayout title="Seguro de Vida">
      <div className="space-y-5">

        {/* Aviso importante */}
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <strong>Trabalhar sem Seguro de Vida é estritamente proibido.</strong> Todo funcionário CLT deve ter cobertura ativa desde o primeiro dia de trabalho.
            Pela convenção coletiva, é obrigação da FC Engenharia manter o seguro vigente para todos os colaboradores.
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className={cn("p-4 rounded-lg border flex flex-col gap-1", c.bg)}>
              <div className="flex items-center gap-2">
                <c.icon className={cn("h-5 w-5", c.color)} />
                <span className="text-xs font-semibold text-slate-500">{c.label}</span>
              </div>
              <p className={cn("text-3xl font-bold", c.color)}>{c.val}</p>
            </div>
          ))}
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
          {(["cobertura", "historico"] as const).map(t => (
            <button key={t} onClick={() => setTabAtiva(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tabAtiva === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t === "cobertura" ? `Coberturas Ativas` : "Histórico de Importações"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowSeed(true)}>
                <Upload className="h-4 w-4 mr-1.5" />Carga Inicial
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" />Imprimir
            </Button>
            <Button size="sm" onClick={() => setShowImport(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />Importar Relatório do Corretor
            </Button>
          </div>
        </div>

        {tabAtiva === "cobertura" && (
          <>
            {/* Filtros */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-64" placeholder="Buscar por nome, cargo ou item..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos ({funcionariosNorm.length})</SelectItem>
                  <SelectItem value="sem_cobertura">🔴 Sem Cobertura ({funcionariosNorm.filter((f:any)=>f.statusSeguro==="sem_cobertura").length})</SelectItem>
                  <SelectItem value="ativo">✅ Segurado Ativo ({funcionariosNorm.filter((f:any)=>f.statusSeguro==="ativo").length})</SelectItem>
                  <SelectItem value="pendente_inclusao">🔵 Pendente Inclusão ({funcionariosNorm.filter((f:any)=>f.statusSeguro==="pendente_inclusao").length})</SelectItem>
                  <SelectItem value="pendente_cancelamento">🟡 Pend. Cancelamento ({funcionariosNorm.filter((f:any)=>f.statusSeguro==="pendente_cancelamento").length})</SelectItem>
                  <SelectItem value="cancelado">⚫ Cancelado ({funcionariosNorm.filter((f:any)=>f.statusSeguro==="cancelado").length})</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{filtradas.length} de {funcionariosNorm.length} funcionários</span>
            </div>

            {/* Tabela de TODOS os funcionários com status de seguro */}
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Nome</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Cargo</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Tipo</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Status Seguro</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Item</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Apólice VG</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Data Adesão</th>
                    <th className="px-3 py-2.5 text-xs"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {funcionariosQ.isLoading ? (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">Carregando...</td></tr>
                  ) : filtradas.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                      {funcionariosNorm.length === 0
                        ? "Nenhum funcionário CLT ativo encontrado. Cadastre funcionários no módulo de Colaboradores."
                        : "Nenhum resultado para os filtros aplicados."}
                    </td></tr>
                  ) : filtradas.map((f: any) => (
                    <tr key={f.id} className={cn("hover:bg-slate-50/80 transition-colors",
                      f.statusSeguro === "sem_cobertura" ? "bg-red-50/40" :
                      f.statusSeguro === "pendente_cancelamento" ? "bg-orange-50/40" :
                      f.statusSeguro === "pendente_inclusao" ? "bg-blue-50/40" : "")}>
                      <td className="px-3 py-2.5 font-medium">{f.nomeCompleto}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{f.cargo || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{f.tipoContrato ?? "CLT"}</span>
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={f.statusSeguro} /></td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{f.item_segurador || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{f.apolice_vg || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(f.data_adesao)}</td>
                      <td className="px-3 py-2.5">
                        {isAdmin && f.cobertura_id && f.seguro_status !== "cancelado" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { if (confirm(`Cancelar cobertura de ${f.nomeCompleto}?`)) cancelar.mutate({ companyId, coberturaId: f.cobertura_id }); }}>
                            <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

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
              return (
                <div className="space-y-3">
                  {filtradas.map((imp: any) => (
                    <div key={imp.id} className="border rounded-lg p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between flex-wrap gap-2"
                        onClick={() => setDetailImport(detailImport?.id === imp.id ? null : imp)}
                        style={{ cursor: "pointer" }}>
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-indigo-500" />
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
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (confirm(`Remover importação da competência ${imp.competencia}? Esta ação não pode ser desfeita.`)) {
                                deletarImportacao.mutate({ companyId, importacaoId: imp.id });
                              }
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors ml-1"
                            title="Limpar importação">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {detailImport?.id === imp.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </div>
                      </div>

                      {detailImport?.id === imp.id && imp.json_resultado && (
                        <div className="mt-4 border rounded overflow-auto max-h-[300px]">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Nome HR</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Nome Corretor</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(typeof imp.json_resultado === "string" ? JSON.parse(imp.json_resultado) : imp.json_resultado)
                                .filter((r: any) => r.status !== "ok")
                                .map((r: any, i: number) => {
                                  const st = RESULT_STATUS[r.status] ?? RESULT_STATUS.ok;
                                  return (
                                    <tr key={i} className={cn(r.status === "sem_seguro" ? "bg-red-50" : r.status === "pagar_indevido" ? "bg-orange-50" : "")}>
                                      <td className="px-3 py-1.5"><span className={cn("font-semibold", st.color)}>{st.label}</span></td>
                                      <td className="px-3 py-1.5">{r.nomeHR ?? "—"}</td>
                                      <td className="px-3 py-1.5 text-slate-500">{r.nome}</td>
                                      <td className="px-3 py-1.5 font-mono text-slate-400">{r.item || "—"}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
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
    </DashboardLayout>
  );
}
