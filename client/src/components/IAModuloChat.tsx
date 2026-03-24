import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, Send, Loader2, Sparkles, Bot, RotateCcw,
  HardHat, Calculator, ShoppingCart, Users, DollarSign, Shield, FileText,
  BarChart3, MessageSquare, ChevronDown, Maximize2, Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";

type Modulo = "planejamento" | "orcamento" | "compras" | "rh" | "financeiro" | "sst" | "medicao";

interface Msg { role: "user" | "assistant"; content: string }

const MODULE_CONFIG: Record<Modulo, {
  icon: any; label: string; cor: string; bg: string; border: string;
  placeholder: string;
  quickPrompts: { label: string; prompt: string }[];
}> = {
  planejamento: {
    icon: HardHat, label: "Eng. de Planejamento", cor: "text-blue-600", bg: "bg-blue-600", border: "border-blue-200",
    placeholder: "Pergunte sobre cronograma, avanço físico, produtividade...",
    quickPrompts: [
      { label: "Análise de Atraso", prompt: "O projeto está atrasado em relação ao cronograma. Quais ações corretivas posso tomar para recuperar o prazo?" },
      { label: "Curva S / EVM", prompt: "Explique como interpretar a Curva S e os indicadores EVM (SPI, CPI) para avaliar a saúde do meu projeto." },
      { label: "Caminho Crítico", prompt: "Como identificar e gerenciar o caminho crítico do meu cronograma para evitar atrasos?" },
      { label: "Produtividade", prompt: "Quais são os índices de produtividade de referência (TCPO) para os principais serviços de construção civil?" },
      { label: "Last Planner", prompt: "Como implementar o Last Planner System na minha obra para melhorar o PPC?" },
      { label: "Histograma MO", prompt: "Como montar um histograma de mão de obra otimizado para evitar picos e vales de equipe?" },
    ],
  },
  orcamento: {
    icon: Calculator, label: "Orçamentista PhD", cor: "text-purple-600", bg: "bg-purple-600", border: "border-purple-200",
    placeholder: "Pergunte sobre custos, BDI, composições, SINAPI...",
    quickPrompts: [
      { label: "Reduzir Custo", prompt: "Quais estratégias posso usar para reduzir o custo total do meu orçamento sem comprometer qualidade?" },
      { label: "Análise BDI", prompt: "Qual o BDI adequado para cada tipo de obra? Como calcular e justificar?" },
      { label: "Curva ABC", prompt: "Como usar a Curva ABC de insumos para priorizar negociações e reduzir custos?" },
      { label: "SINAPI vs Mercado", prompt: "Quando usar SINAPI como referência e quando buscar preços de mercado?" },
    ],
  },
  compras: {
    icon: ShoppingCart, label: "Gestor de Suprimentos", cor: "text-green-600", bg: "bg-green-600", border: "border-green-200",
    placeholder: "Pergunte sobre fornecedores, cotações, negociação...",
    quickPrompts: [
      { label: "Negociação", prompt: "Quais técnicas de negociação funcionam melhor com fornecedores de materiais de construção?" },
      { label: "Lead Times", prompt: "Quais são os lead times típicos dos principais materiais de construção civil?" },
      { label: "Mapa Cotações", prompt: "Como montar um mapa de cotações eficiente para equalizar propostas de fornecedores?" },
    ],
  },
  rh: {
    icon: Users, label: "Especialista RH/DP", cor: "text-orange-600", bg: "bg-orange-600", border: "border-orange-200",
    placeholder: "Pergunte sobre CLT, folha, rescisão, férias...",
    quickPrompts: [
      { label: "Cálculo Rescisão", prompt: "Explique passo a passo como calcular uma rescisão sem justa causa com todas as verbas." },
      { label: "Horas Extras", prompt: "Como calcular horas extras com DSR, adicional noturno e reflexos nos encargos?" },
      { label: "eSocial", prompt: "Quais são os principais eventos do eSocial para construção civil e seus prazos?" },
    ],
  },
  financeiro: {
    icon: DollarSign, label: "Controller Financeiro", cor: "text-emerald-600", bg: "bg-emerald-600", border: "border-emerald-200",
    placeholder: "Pergunte sobre fluxo de caixa, medições, DRE...",
    quickPrompts: [
      { label: "Fluxo de Caixa", prompt: "Como projetar o fluxo de caixa da obra considerando medições, retenções e prazo de pagamento?" },
      { label: "Viabilidade", prompt: "Quais indicadores usar na análise de viabilidade econômico-financeira de um empreendimento?" },
      { label: "DRE por Obra", prompt: "Como montar a DRE (Demonstrativo de Resultado) por centro de custo (obra)?" },
    ],
  },
  sst: {
    icon: Shield, label: "Eng. de Segurança", cor: "text-red-600", bg: "bg-red-600", border: "border-red-200",
    placeholder: "Pergunte sobre NRs, EPIs, treinamentos, CIPA...",
    quickPrompts: [
      { label: "NR-18", prompt: "Quais são os principais requisitos da NR-18 para canteiro de obras e como implementá-los?" },
      { label: "Trabalho em Altura", prompt: "Quais EPIs são obrigatórios para trabalho em altura (NR-35) e como gerenciar os treinamentos?" },
      { label: "CIPA", prompt: "Como dimensionar e implementar a CIPA na construção civil conforme NR-05?" },
    ],
  },
  medicao: {
    icon: FileText, label: "Especialista Medição", cor: "text-cyan-600", bg: "bg-cyan-600", border: "border-cyan-200",
    placeholder: "Pergunte sobre medições, retenções, contratos...",
    quickPrompts: [
      { label: "Critérios Medição", prompt: "Quais são os critérios de medição mais usados em contratos de construção civil?" },
      { label: "Retenções", prompt: "Como funciona a retenção contratual? Quando e como é liberada?" },
      { label: "Aditivos", prompt: "Quais são os limites legais para aditivos de contrato e como documentar?" },
    ],
  },
};

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

export default function IAModuloChat({
  modulo,
  contexto,
  projetoId,
}: {
  modulo: Modulo;
  contexto?: string;
  projetoId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { companyId } = useCompany();

  const MIN_W = 320;
  const MIN_H = 300;
  const [panelW, setPanelW] = useState(400);
  const [panelH, setPanelH] = useState<number | null>(null);
  const dragRef = useRef<{ type: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onPointerDown = useCallback((type: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startW: panelW,
      startH: panelH ?? window.innerHeight,
    };
  }, [panelW, panelH]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    if (d.type === "left" || d.type === "corner") {
      const newW = Math.max(MIN_W, Math.min(window.innerWidth * 0.9, d.startW + (d.startX - e.clientX)));
      setPanelW(newW);
    }
    if (d.type === "top" || d.type === "corner") {
      const newH = Math.max(MIN_H, Math.min(window.innerHeight * 0.95, d.startH + (d.startY - e.clientY)));
      setPanelH(newH);
    }
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const chatMutation = trpc.iaModulos.chat.useMutation();
  const config = MODULE_CONFIG[modulo];
  const Icon = config.icon;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const addMsg = (role: "user" | "assistant", content: string) =>
    setMsgs(prev => [...prev, { role, content }]);

  const enviar = async (pergunta?: string) => {
    const texto = (pergunta ?? input).trim();
    if (!texto || loading) return;
    setInput("");
    setShowQuick(false);
    addMsg("user", texto);
    setLoading(true);
    try {
      const allMsgs = [...msgs, { role: "user" as const, content: texto }];
      const result = await chatMutation.mutateAsync({
        modulo,
        messages: allMsgs,
        contexto,
        projetoId,
        companyId,
      });
      addMsg("assistant", result.resposta);
    } catch (e: any) {
      toast.error("Erro ao consultar IA: " + (e?.message ?? "Erro desconhecido"));
      addMsg("assistant", "Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => {
    setMsgs([]);
    setShowQuick(true);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-50 ${config.bg} text-white rounded-full p-3.5 shadow-lg hover:shadow-xl transition-all hover:scale-105 group`}
        title={`Consultar ${config.label}`}
      >
        <Sparkles className="h-5 w-5" />
        <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
      </button>
    );
  }

  const isFullH = panelH === null;
  const panelStyle: React.CSSProperties = {
    width: panelW,
    ...(isFullH ? { top: 0, bottom: 0 } : { bottom: 0, height: panelH }),
  };

  return (
    <div
      className="fixed right-0 z-50 bg-white shadow-2xl border-l border-slate-200 flex flex-col"
      style={panelStyle}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-blue-400/30 active:bg-blue-400/50 z-10"
        onPointerDown={onPointerDown("left")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: "none" }}
      />

      {!isFullH && (
        <div
          className="absolute left-0 right-0 top-0 h-[5px] cursor-row-resize hover:bg-blue-400/30 active:bg-blue-400/50 z-10"
          onPointerDown={onPointerDown("top")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ touchAction: "none" }}
        />
      )}

      <div
        className="absolute left-0 top-0 w-[10px] h-[10px] cursor-nwse-resize hover:bg-blue-400/40 active:bg-blue-500/50 z-20"
        onPointerDown={onPointerDown("corner")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: "none" }}
      />

      <div className={`${config.bg} text-white px-4 py-3 flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <div>
            <p className="text-sm font-bold">{config.label}</p>
            <p className="text-[10px] opacity-80">IA Especialista — {modulo.charAt(0).toUpperCase() + modulo.slice(1)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={limpar} className="p-1.5 hover:bg-white/20 rounded" title="Limpar conversa">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (isFullH) setPanelH(500);
              else setPanelH(null);
            }}
            className="p-1.5 hover:bg-white/20 rounded"
            title={isFullH ? "Reduzir painel" : "Expandir tela cheia"}
          >
            {isFullH ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {msgs.length === 0 && showQuick && (
          <div className="space-y-3 pt-2">
            <div className="text-center py-4">
              <div className={`inline-flex p-3 rounded-full ${config.bg}/10 mb-2`}>
                <Bot className={`h-8 w-8 ${config.cor}`} />
              </div>
              <p className="text-sm font-semibold text-slate-700">{config.label}</p>
              <p className="text-xs text-slate-500 mt-1">Consultor virtual especializado</p>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold px-1">Insights Rápidos</p>
            <div className="grid gap-1.5">
              {config.quickPrompts.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => enviar(qp.prompt)}
                  className={`text-left text-xs px-3 py-2 rounded-lg border ${config.border} hover:bg-slate-50 transition-colors`}
                >
                  <span className={`font-semibold ${config.cor}`}>{qp.label}</span>
                  <p className="text-slate-500 text-[10px] mt-0.5 line-clamp-1">{qp.prompt}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 ${
              m.role === "user"
                ? "bg-slate-100 text-slate-800"
                : `bg-white border ${config.border} shadow-sm`
            }`}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-1 mb-1">
                  <Bot className={`h-3 w-3 ${config.cor}`} />
                  <span className={`text-[9px] font-bold ${config.cor} uppercase`}>{config.label}</span>
                </div>
              )}
              {m.role === "user" ? (
                <p className="text-xs">{m.content}</p>
              ) : (
                <MdMsg content={m.content} />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className={`rounded-lg px-3 py-2 border ${config.border} shadow-sm bg-white`}>
              <div className="flex items-center gap-2">
                <Loader2 className={`h-3 w-3 ${config.cor} animate-spin`} />
                <span className="text-xs text-slate-500">Analisando...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <form onSubmit={e => { e.preventDefault(); enviar(); }} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={config.placeholder}
            className="text-xs h-9"
            disabled={loading}
          />
          <Button type="submit" size="sm" disabled={loading || !input.trim()} className={`${config.bg} hover:opacity-90 h-9 px-3`}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </form>
        <p className="text-[9px] text-slate-400 mt-1.5 text-center">
          Todas as consultas são registradas para auditoria
        </p>
      </div>
    </div>
  );
}
