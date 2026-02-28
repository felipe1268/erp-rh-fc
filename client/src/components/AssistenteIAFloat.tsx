import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot, X, Send, Loader2, Sparkles, User, BookOpen,
  Minimize2, Maximize2, RotateCcw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "@/components/LazyStreamdown";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SUGESTOES = [
  "Como calculo uma rescisão?",
  "Qual a fórmula de horas extras?",
  "Como faço o upload do cartão de ponto?",
  "O que é aviso prévio proporcional?",
  "Como funciona o módulo de férias?",
  "Explique o cálculo do FGTS + multa 40%",
];

export default function AssistenteIAFloat() {
  const [aberto, setAberto] = useState(false);
  const [maximizado, setMaximizado] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.assistenteIA.chat.useMutation();

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  // Focus input when opened
  useEffect(() => {
    if (aberto && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [aberto]);

  const enviarMensagem = async (texto: string) => {
    if (!texto.trim() || chatMutation.isPending) return;

    const novaMensagem: ChatMessage = { role: "user", content: texto.trim() };
    const novasMessages = [...messages, novaMensagem];
    setMessages(novasMessages);
    setInput("");

    try {
      const result = await chatMutation.mutateAsync({
        messages: novasMessages.slice(-10), // últimas 10 mensagens para contexto
      });
      setMessages(prev => [...prev, { role: "assistant", content: result.content }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente em alguns instantes." },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem(input);
    }
  };

  const limparConversa = () => {
    setMessages([]);
    setInput("");
  };

  // Tamanho do chat
  const chatSize = maximizado
    ? "fixed inset-4 z-[9999]"
    : "fixed bottom-20 right-4 w-[min(400px,calc(100vw-2rem))] h-[min(560px,calc(100vh-6rem))] z-[9999]";

  return (
    <>
      {/* Botão flutuante */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          className="fixed bottom-5 right-5 z-[9999] h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          title="Assistente IA — Tire suas dúvidas"
        >
          <Bot className="h-6 w-6 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-white animate-pulse" />
        </button>
      )}

      {/* Chat Window */}
      {aberto && (
        <div className={`${chatSize} flex flex-col bg-background border border-border rounded-xl shadow-2xl overflow-hidden`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Assistente</h3>
                <p className="text-[10px] text-white/70">IA especialista em RH & DP</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={limparConversa}
                  className="h-7 w-7 rounded-md hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                  title="Limpar conversa"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setMaximizado(!maximizado)}
                className="h-7 w-7 rounded-md hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                title={maximizado ? "Minimizar" : "Maximizar"}
              >
                {maximizado ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setAberto(false)}
                className="h-7 w-7 rounded-md hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                title="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-blue-500" />
                </div>
                <h4 className="text-base font-semibold text-foreground mb-1">
                  Olá! Sou o Assistente
                </h4>
                <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                  Posso ajudar com dúvidas sobre o sistema, cálculos trabalhistas, legislação e processos de RH & DP.
                </p>
                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Sugestões</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {SUGESTOES.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => enviarMensagem(s)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-accent hover:border-primary/30 text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <BookOpen className="h-3 w-3" />
                  <span>Consulte também a <strong>Biblioteca de Conhecimento</strong> em /ajuda</span>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-card border border-border text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-bold prose-h3:text-sm prose-p:text-foreground/80 prose-p:text-sm prose-strong:text-foreground prose-table:text-xs prose-th:bg-muted prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:border prose-th:border-border prose-td:px-2 prose-td:py-1 prose-td:border prose-td:border-border prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-500/5 prose-blockquote:rounded-r prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:text-sm prose-blockquote:not-italic prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs prose-li:text-sm prose-li:text-foreground/80">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Loading indicator */}
            {chatMutation.isPending && (
              <div className="flex gap-2.5 justify-start">
                <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-blue-600" />
                </div>
                <div className="bg-card border border-border rounded-xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Pensando...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-border p-3 shrink-0 bg-card/50">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua dúvida..."
                className="resize-none min-h-[40px] max-h-[100px] text-sm bg-background border-border"
                rows={1}
              />
              <Button
                size="icon"
                onClick={() => enviarMensagem(input)}
                disabled={!input.trim() || chatMutation.isPending}
                className="h-10 w-10 shrink-0 bg-blue-600 hover:bg-blue-700"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
              Assistente IA • Respostas podem conter imprecisões
            </p>
          </div>
        </div>
      )}
    </>
  );
}
