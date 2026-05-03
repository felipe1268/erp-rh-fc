import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, Send, Mic, MicOff, Volume2, VolumeX,
  MessageSquare, ChevronLeft, ChevronRight, Loader2,
  Sparkles,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────
interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
interface Session {
  id: number;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Utilidades ──────────────────────────────────────────────
function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 86400) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 86400) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="font-bold text-violet-200 mt-2">{line.slice(4)}</p>;
        if (line.startsWith("## "))  return <p key={i} className="font-bold text-violet-100 mt-2 text-base">{line.slice(3)}</p>;
        if (line.startsWith("# "))   return <p key={i} className="font-bold text-white mt-2 text-lg">{line.slice(2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return <p key={i} className="flex gap-2"><span className="text-violet-400 mt-0.5">•</span><span>{line.slice(2)}</span></p>;
        if (/^\d+\./.test(line))
          return <p key={i} className="flex gap-2"><span className="text-violet-400 font-medium">{line.match(/^\d+/)?.[0]}.</span><span>{line.replace(/^\d+\.\s*/, "")}</span></p>;
        if (line.startsWith("**") && line.endsWith("**"))
          return <p key={i} className="font-semibold text-violet-100">{line.slice(2, -2)}</p>;
        if (line === "") return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

// ─── Componente de bolha ─────────────────────────────────────
function MessageBubble({ msg, onSpeak }: { msg: Message; onSpeak: (text: string) => void }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4 animate-in slide-in-from-bottom-2 duration-300`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-lg shadow-violet-900/50 mt-1">
          <span className="text-sm">🔮</span>
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
        isUser
          ? "bg-slate-700 text-slate-100 rounded-tr-sm"
          : "bg-gradient-to-br from-violet-900/80 to-purple-900/60 text-violet-50 border border-violet-700/40 rounded-tl-sm"
      }`}>
        {isUser
          ? <p className="whitespace-pre-wrap">{msg.content}</p>
          : <MarkdownText text={msg.content} />
        }
        <div className={`flex items-center gap-2 mt-2 ${isUser ? "justify-end" : "justify-between"}`}>
          <span className="text-[10px] opacity-40">{formatDate(msg.createdAt)}</span>
          {!isUser && (
            <button
              onClick={() => onSpeak(msg.content)}
              className="text-violet-400 hover:text-violet-200 transition-colors opacity-60 hover:opacity-100"
              title="Ouvir resposta"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Orbe animado ────────────────────────────────────────────
function OrbAnimated({ state }: { state: "idle" | "listening" | "thinking" | "speaking" }) {
  const colors = {
    idle:      "from-violet-700 via-purple-800 to-indigo-900",
    listening: "from-pink-600 via-violet-600 to-purple-700",
    thinking:  "from-indigo-600 via-violet-700 to-purple-900",
    speaking:  "from-violet-500 via-fuchsia-600 to-purple-700",
  };
  const pulseClass = state !== "idle" ? "animate-pulse" : "";
  const ringClass  = state === "speaking" ? "ring-4 ring-fuchsia-500/50" : state === "listening" ? "ring-4 ring-pink-500/50" : state === "thinking" ? "ring-4 ring-indigo-500/40" : "";

  return (
    <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br ${colors[state]} ${pulseClass} ${ringClass} shadow-2xl shadow-violet-900/60 flex items-center justify-center transition-all duration-500`}>
      <span className="text-3xl">{state === "listening" ? "👂" : state === "thinking" ? "⏳" : state === "speaking" ? "🔊" : "🔮"}</span>
      {state !== "idle" && (
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-transparent animate-spin" style={{ animationDuration: "3s" }} />
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────
export default function Oraculo() {
  const { user } = useAuth();
  const { selectedCompanyId: selectedCompanyIdStr, companies, getCompanyIdsForQuery } = useCompany();
  const selectedCompanyId = parseInt(selectedCompanyIdStr) || undefined;
  const companyIdsAll = getCompanyIdsForQuery();
  const [, setLocation] = useLocation();

  const [sessions, setSessions]       = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [orbState, setOrbState]       = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Redirecionar se não for admin_master
  useEffect(() => {
    if (user && user.role !== "admin_master") setLocation("/");
  }, [user]);

  // tRPC
  const utils = trpc.useUtils();
  const listSessions  = trpc.oraculo.listSessions.useQuery({}, { enabled: !!user });
  const createSession = trpc.oraculo.createSession.useMutation();
  const deleteSession = trpc.oraculo.deleteSession.useMutation();
  const getSession    = trpc.oraculo.getSession.useQuery(
    { sessionId: activeSession! },
    { enabled: activeSession !== null }
  );
  const sendMessage = trpc.oraculo.sendMessage.useMutation();
  const tts         = trpc.oraculo.tts.useMutation();

  // Sincronizar sessões
  useEffect(() => {
    if (listSessions.data) setSessions(listSessions.data as Session[]);
  }, [listSessions.data]);

  // Sincronizar mensagens
  useEffect(() => {
    if (getSession.data) setMessages((getSession.data.messages ?? []) as Message[]);
  }, [getSession.data]);

  // Scroll automático
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── TTS (Google Neural2) ───────────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setOrbState("speaking");
      const result = await tts.mutateAsync({ text: text.slice(0, 4800) });
      if (result.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
        audioRef.current = audio;
        audio.onended = () => setOrbState("idle");
        audio.onerror = () => { setOrbState("idle"); speakFallback(text); };
        await audio.play();
      } else {
        speakFallback(text);
      }
    } catch {
      speakFallback(text);
    }
  }, [voiceEnabled, tts]);

  const speakFallback = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) { setOrbState("idle"); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 500));
    utter.lang = "pt-BR";
    utter.rate = 1.0;
    utter.pitch = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith("pt-BR") && v.name.toLowerCase().includes("female"))
      ?? voices.find(v => v.lang.startsWith("pt"));
    if (ptVoice) utter.voice = ptVoice;
    utter.onend = () => setOrbState("idle");
    utter.onerror = () => setOrbState("idle");
    window.speechSynthesis.speak(utter);
  }, [voiceEnabled]);

  // ─── STT (Web Speech API) ───────────────────────────────────
  const toggleListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Seu navegador não suporta reconhecimento de voz."); return; }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setOrbState("idle");
      return;
    }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => { setIsListening(true); setOrbState("listening"); };
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? prev + " " + transcript : transcript);
    };
    rec.onerror = () => { setIsListening(false); setOrbState("idle"); };
    rec.onend   = () => { setIsListening(false); setOrbState("idle"); };
    rec.start();
  }, [isListening]);

  // ─── Nova sessão ─────────────────────────────────────────────
  const handleNewSession = async () => {
    try {
      const session = await createSession.mutateAsync({ companyId: selectedCompanyId });
      setActiveSession(session.id);
      setMessages([]);
      await listSessions.refetch();
    } catch {
      toast.error("Erro ao criar sessão");
    }
  };

  // ─── Deletar sessão ──────────────────────────────────────────
  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession.mutateAsync({ sessionId: id });
      if (activeSession === id) { setActiveSession(null); setMessages([]); }
      await listSessions.refetch();
    } catch {
      toast.error("Erro ao deletar sessão");
    }
  };

  // ─── Enviar mensagem ─────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sendMessage.isPending) return;

    let sessionId = activeSession;

    // Criar sessão automaticamente se não houver
    if (!sessionId) {
      try {
        const s = await createSession.mutateAsync({ companyId: selectedCompanyId });
        sessionId = s.id;
        setActiveSession(s.id);
      } catch {
        toast.error("Erro ao iniciar sessão");
        return;
      }
    }

    // Otimistic UI
    const optimistic: Message = {
      id: Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    setOrbState("thinking");

    try {
      const result = await sendMessage.mutateAsync({
        sessionId,
        message: text,
        companyId: selectedCompanyId,
        companyIds: companyIdsAll.length > 0 ? companyIdsAll : undefined,
      });

      const aiMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: result.response,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setOrbState("idle");
      await listSessions.refetch();

      if (voiceEnabled) speak(result.response);
    } catch (e: any) {
      setOrbState("idle");
      toast.error("Erro ao enviar mensagem: " + (e?.message ?? ""));
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const companyIds = companyIdsAll.length > 0 ? companyIdsAll : (selectedCompanyId ? [selectedCompanyId] : []);

  // ─── Sugestões rápidas ───────────────────────────────────────
  const suggestions = [
    "Como está o headcount atual das 3 empresas?",
    "Existe alguma anomalia nos dados que devo atentar?",
    "Qual o custo total da folha este mês?",
    "Quantas obras estão em andamento agora?",
    "Resuma os processos jurídicos em aberto.",
  ];

  return (
    <DashboardLayout noPadding>
      <div className="flex h-[calc(100vh-3.5rem)] bg-[#0e0a1a] text-white overflow-hidden">

        {/* ── Sidebar de sessões ──────────────────────────────── */}
        <div className={`${sidebarOpen ? "w-72" : "w-0"} shrink-0 transition-all duration-300 overflow-hidden border-r border-violet-900/30 bg-[#130d24] flex flex-col`}>
          <div className="p-4 border-b border-violet-900/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔮</span>
                <span className="font-bold text-violet-200 tracking-wide text-sm">ORÁCULO</span>
                <span className="text-[10px] bg-violet-600/30 text-violet-300 px-1.5 py-0.5 rounded-full border border-violet-700/50">IA</span>
              </div>
            </div>
            <Button
              onClick={handleNewSession}
              disabled={createSession.isPending}
              className="w-full bg-violet-700 hover:bg-violet-600 text-white border-0 h-9 text-sm gap-2"
            >
              <Plus className="w-4 h-4" />
              Nova conversa
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
            {sessions.length === 0 && !listSessions.isLoading && (
              <p className="text-xs text-violet-500/60 text-center py-8 px-4">Nenhuma conversa ainda.<br/>Clique em "Nova conversa" para começar.</p>
            )}
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => { setActiveSession(s.id); setMessages([]); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all group flex items-start gap-2 ${
                  activeSession === s.id
                    ? "bg-violet-700/40 border border-violet-600/50 text-violet-100"
                    : "hover:bg-violet-900/30 text-violet-300/70 border border-transparent"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="text-[10px] text-violet-500/60 mt-0.5">{formatDate(s.updatedAt)} · {s.messageCount} msgs</p>
                </div>
                <button
                  onClick={e => handleDeleteSession(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-violet-500 hover:text-red-400 transition-all p-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>

          {/* Controles de voz */}
          <div className="p-3 border-t border-violet-900/30">
            <button
              onClick={() => setVoiceEnabled(v => !v)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors ${
                voiceEnabled ? "bg-violet-800/30 text-violet-300" : "text-violet-500/50 hover:text-violet-400"
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {voiceEnabled ? "Voz ativada" : "Voz desativada"}
            </button>
          </div>
        </div>

        {/* ── Área principal ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-violet-900/30 bg-[#0e0a1a]/80 shrink-0">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="text-violet-400 hover:text-violet-200 transition-colors"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2">
              <OrbAnimated state={orbState} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-100 truncate">
                {activeSession ? (sessions.find(s => s.id === activeSession)?.title ?? "Conversa") : "ORÁCULO"}
              </p>
              <p className="text-[10px] text-violet-500">
                {orbState === "listening" ? "Ouvindo..." : orbState === "thinking" ? "Analisando dados..." : orbState === "speaking" ? "Respondendo..." : "Pronto para analisar"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {companyIds.map((id: number) => (
                <span key={id} className="text-[10px] bg-violet-900/50 text-violet-400 px-2 py-0.5 rounded-full border border-violet-800/50">
                  {id === 60002 ? "FC ENG" : id === 60004 ? "HOTEL" : id === 90001 ? "LOCNOW" : `#${id}`}
                </span>
              ))}
            </div>
          </div>

          {/* Área de mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-8 pb-8">
                <div className="text-center space-y-3">
                  <OrbAnimated state="idle" />
                  <div className="mt-4">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-300 via-purple-200 to-fuchsia-300 bg-clip-text text-transparent">
                      Olá, sou o ORÁCULO
                    </h2>
                    <p className="text-violet-400/70 text-sm mt-1">Sua analista de IA para todos os módulos da FC Engenharia</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      className="text-left p-3 rounded-xl bg-violet-900/20 border border-violet-800/30 text-violet-300/80 text-xs hover:bg-violet-900/40 hover:border-violet-700/50 hover:text-violet-200 transition-all group"
                    >
                      <Sparkles className="w-3 h-3 mb-1.5 text-violet-500 group-hover:text-violet-400" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onSpeak={speak} />
            ))}

            {sendMessage.isPending && (
              <div className="flex gap-3 mb-4 animate-in slide-in-from-bottom-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-lg mt-1">
                  <span className="text-sm">🔮</span>
                </div>
                <div className="bg-gradient-to-br from-violet-900/80 to-purple-900/60 border border-violet-700/40 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                    <span className="text-xs text-violet-400 ml-2">Analisando...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Barra de input */}
          <div className="shrink-0 p-4 border-t border-violet-900/30 bg-[#0e0a1a]/80">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end">
                {/* Mic button */}
                <button
                  onClick={toggleListening}
                  disabled={sendMessage.isPending}
                  className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isListening
                      ? "bg-pink-600 hover:bg-pink-500 shadow-pink-900/50 animate-pulse"
                      : "bg-violet-800/60 hover:bg-violet-700/80 border border-violet-700/40 shadow-violet-900/40"
                  }`}
                  title={isListening ? "Parar gravação" : "Falar com ORÁCULO"}
                >
                  {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-violet-300" />}
                </button>

                {/* Textarea */}
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Pergunte qualquer coisa sobre a FC Engenharia... (Enter para enviar)"
                    rows={1}
                    className="min-h-[44px] max-h-32 resize-none bg-violet-950/40 border-violet-800/50 text-violet-100 placeholder:text-violet-600/50 focus:border-violet-600 focus:ring-1 focus:ring-violet-600/30 rounded-xl text-sm pr-4"
                    style={{ lineHeight: "1.5" }}
                    disabled={sendMessage.isPending}
                  />
                </div>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sendMessage.isPending}
                  className="shrink-0 w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-lg shadow-violet-900/50"
                  title="Enviar"
                >
                  {sendMessage.isPending
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4 text-white" />
                  }
                </button>
              </div>
              <p className="text-[10px] text-violet-700 text-center mt-2">
                ORÁCULO analisa dados reais do sistema · Exclusivo Admin Master
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
