import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GraduationCap, X, Send, Loader2, Sparkles, TrendingDown,
  Target, BarChart3, AlertTriangle, FileText, ChevronDown,
  Bot, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ──────────────────────────────────────────────────
export interface OrcContexto {
  codigo:            string;
  descricao?:        string;
  cliente?:          string;
  local?:            string;
  revisao?:          string;
  status?:           string;
  bdiPercentual:     number;
  metaPercentual:    number;
  totalVenda:        number;
  totalCusto:        number;
  totalMeta:         number;
  totalMateriais:    number;
  totalMdo:          number;
  totalEquipamentos: number;
  itemCount:         number;
  topItens?: {
    eapCodigo: string; descricao: string; unidade?: string;
    quantidade: number; custoTotal: number; vendaTotal: number;
    custoTotalMat: number; custoTotalMdo: number; percentualCusto: number;
  }[];
  topInsumos?: {
    descricao: string; tipo?: string; unidade?: string;
    custoTotal: number; quantidadeTotal: number;
    precoUnitComEncargos: number; curvaAbc?: string;
    percentualTotal: number;
  }[];
}

interface Msg { role: "user" | "assistant"; content: string }

// ── Botões de insight rápido ───────────────────────────────
const QUICK_INSIGHTS = [
  { tipo: "resumo_executivo" as const,  label: "Resumo Executivo", icon: FileText,    color: "text-blue-600"  },
  { tipo: "reduzir_custo"   as const,   label: "Reduzir Custo",    icon: TrendingDown, color: "text-green-600" },
  { tipo: "maximizar_margem" as const,  label: "Maximizar Margem", icon: Target,       color: "text-purple-600"},
  { tipo: "analise_bdi"     as const,   label: "Análise BDI",      icon: BarChart3,    color: "text-amber-600" },
  { tipo: "curva_abc"       as const,   label: "Curva ABC",        icon: Sparkles,     color: "text-cyan-600"  },
  { tipo: "riscos"          as const,   label: "Riscos",           icon: AlertTriangle,color: "text-red-600"   },
] as const;

// ── Renderizador de markdown compacto ─────────────────────
function MdMsg({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert text-xs leading-relaxed
      [&_table]:w-full [&_table]:text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1
      [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border
      [&_th]:bg-muted [&_th]:font-semibold [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:mb-0.5
      [&_strong]:font-semibold [&_p]:mb-2 [&_h2]:text-sm [&_h3]:text-xs [&_h3]:font-semibold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ── Widget principal ───────────────────────────────────────
export default function OrcamentistaWidget({ contexto }: { contexto: OrcContexto }) {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  const analisarMutation     = trpc.orcamentista.analisar.useMutation();
  const insightMutation      = trpc.orcamentista.insightRapido.useMutation();

  // Scroll ao fundo após novas msgs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  // Foco no input ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const addMsg = (role: "user" | "assistant", content: string) =>
    setMsgs(prev => [...prev, { role, content }]);

  const enviar = async (pergunta?: string) => {
    const texto = (pergunta ?? input).trim();
    if (!texto || loading) return;
    setInput("");
    addMsg("user", texto);
    setLoading(true);
    try {
      const res = await analisarMutation.mutateAsync({
        messages: [...msgs, { role: "user", content: texto }],
        contexto,
      });
      addMsg("assistant", res.resposta);
    } catch (e: any) {
      toast.error("Erro ao consultar ORCAMENTISTA PHD");
      addMsg("assistant", "Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const insightRapido = async (tipo: typeof QUICK_INSIGHTS[number]["tipo"]) => {
    if (loading) return;
    const label = QUICK_INSIGHTS.find(q => q.tipo === tipo)?.label ?? tipo;
    addMsg("user", `🔍 ${label}`);
    setLoading(true);
    try {
      const res = await insightMutation.mutateAsync({ tipo, contexto });
      addMsg("assistant", res.resposta);
    } catch (e: any) {
      toast.error("Erro ao gerar insight");
      addMsg("assistant", "Não foi possível gerar o insight agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => setMsgs([]);

  const margem = contexto.totalVenda > 0
    ? ((contexto.totalVenda - contexto.totalCusto) / contexto.totalVenda * 100).toFixed(1)
    : "—";

  const fmt = (v: number) => v.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  });

  return (
    <>
      {/* ── Botão flutuante ───────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3
          rounded-2xl shadow-2xl border transition-all duration-300 group
          ${open
            ? "bg-slate-900 border-slate-700 text-white"
            : "bg-gradient-to-br from-blue-600 to-violet-600 border-blue-500/30 text-white hover:scale-105 hover:shadow-blue-500/30"
          }`}
        title="ORCAMENTISTA PHD — Assistente de IA"
      >
        <GraduationCap className="h-5 w-5" />
        <span className="text-sm font-semibold tracking-wide hidden sm:inline">
          {open ? "Fechar PHD" : "ORCAMENTISTA PHD"}
        </span>
        {!open && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-400 animate-pulse" />
        )}
      </button>

      {/* ── Painel lateral ────────────────────────────────── */}
      <div className={`fixed right-0 top-0 h-full z-40 flex flex-col bg-background border-l border-border
        shadow-2xl transition-all duration-300 ease-in-out
        ${open ? "w-full sm:w-[480px] translate-x-0" : "w-0 translate-x-full overflow-hidden"}`}>

        {open && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-600 to-violet-600 text-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-wide">ORCAMENTISTA PHD</div>
                  <div className="text-xs text-blue-100 truncate max-w-[200px]">
                    {contexto.codigo}{contexto.revisao ? ` · ${contexto.revisao}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {msgs.length > 0 && (
                  <button onClick={limpar} className="p-1.5 rounded hover:bg-white/20 transition-colors" title="Limpar conversa">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-white/20 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* KPIs rápidos */}
            <div className="px-3 py-2 border-b bg-muted/30 grid grid-cols-3 gap-2 shrink-0">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Venda</div>
                <div className="text-xs font-bold text-green-600 truncate">{fmt(contexto.totalVenda)}</div>
              </div>
              <div className="text-center border-x border-border">
                <div className="text-xs text-muted-foreground">Custo</div>
                <div className="text-xs font-bold text-amber-600 truncate">{fmt(contexto.totalCusto)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Margem</div>
                <div className="text-xs font-bold text-blue-600">{margem}%</div>
              </div>
            </div>

            {/* Quick insights */}
            {msgs.length === 0 && (
              <div className="px-3 pt-3 pb-2 border-b shrink-0">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Análise rápida:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_INSIGHTS.map(qi => (
                    <button
                      key={qi.tipo}
                      disabled={loading}
                      onClick={() => insightRapido(qi.tipo)}
                      className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-border
                        bg-card hover:bg-muted/60 hover:border-blue-300 transition-all text-left
                        disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <qi.icon className={`h-3.5 w-3.5 shrink-0 ${qi.color}`} />
                      <span className="font-medium">{qi.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat area */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
              {msgs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <Bot className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Selecione uma análise acima ou faça sua pergunta abaixo.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Ex: "Quais os 5 itens de maior risco neste orçamento?"
                  </p>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                      <GraduationCap className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs
                    ${m.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-muted border border-border rounded-tl-sm"
                    }`}>
                    {m.role === "user"
                      ? <p className="text-xs">{m.content}</p>
                      : <MdMsg content={m.content} />
                    }
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mr-2 mt-0.5">
                    <GraduationCap className="h-3 w-3 text-white" />
                  </div>
                  <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0ms]" />
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:150ms]" />
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Atalhos contextuais quando já tem conversa */}
            {msgs.length > 0 && (
              <div className="px-3 py-2 border-t flex gap-1.5 flex-wrap shrink-0">
                {QUICK_INSIGHTS.slice(0, 3).map(qi => (
                  <button
                    key={qi.tipo}
                    disabled={loading}
                    onClick={() => insightRapido(qi.tipo)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-border
                      bg-card hover:bg-muted transition-all disabled:opacity-50"
                  >
                    <qi.icon className={`h-3 w-3 ${qi.color}`} />
                    {qi.label}
                  </button>
                ))}
                <button
                  disabled={loading}
                  onClick={limpar}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-dashed
                    border-muted-foreground/30 text-muted-foreground hover:bg-muted transition-all"
                >
                  <RotateCcw className="h-3 w-3" />
                  Nova conversa
                </button>
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-3 border-t bg-background shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Pergunte sobre este orçamento..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  disabled={loading}
                  className="text-xs h-9 bg-muted/40"
                />
                <Button
                  size="sm"
                  onClick={() => enviar()}
                  disabled={!input.trim() || loading}
                  className="h-9 w-9 p-0 shrink-0 bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
                >
                  {loading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/50 mt-1.5 text-center">
                IA com acesso completo aos dados do orçamento
              </p>
            </div>
          </>
        )}
      </div>

      {/* Overlay escuro em mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
