import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, Send, Mic, MicOff, Volume2, VolumeX,
  MessageSquare, ChevronLeft, Loader2, ArrowLeft, Zap, ZapOff,
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

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 86400) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diff < 7 * 86400) return d.toLocaleDateString("pt-BR", { weekday: "short" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="font-bold text-violet-200 mt-2">{line.slice(4)}</p>;
        if (line.startsWith("## "))  return <p key={i} className="font-bold text-violet-100 mt-2">{line.slice(3)}</p>;
        if (line.startsWith("# "))   return <p key={i} className="font-bold text-white mt-2 text-base">{line.slice(2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return <p key={i} className="flex gap-2"><span className="text-violet-400">•</span><span>{line.slice(2)}</span></p>;
        if (/^\d+\./.test(line))
          return <p key={i} className="flex gap-2"><span className="text-violet-400 font-medium">{line.match(/^\d+/)?.[0]}.</span><span>{line.replace(/^\d+\.\s*/, "")}</span></p>;
        if (line === "") return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

// ─── Orbe central ────────────────────────────────────────────
function Orb({
  state, activeMode, onClick,
}: {
  state: "idle" | "listening" | "thinking" | "speaking";
  activeMode: boolean;
  onClick: () => void;
}) {
  const gradients: Record<string, string> = {
    idle:      "from-violet-800 via-purple-900 to-indigo-950",
    listening: "from-pink-500 via-violet-500 to-purple-700",
    thinking:  "from-indigo-500 via-violet-600 to-purple-800",
    speaking:  "from-violet-400 via-fuchsia-500 to-purple-700",
  };
  const rings: Record<string, string> = {
    idle:      "ring-violet-800/40",
    listening: "ring-pink-400/60",
    thinking:  "ring-indigo-400/60",
    speaking:  "ring-fuchsia-400/60",
  };
  const emoji: Record<string, string> = {
    idle: "🔮", listening: "👂", thinking: "⏳", speaking: "🔊",
  };
  const isPulsing = state !== "idle" || activeMode;

  return (
    <button
      onClick={onClick}
      className={`relative w-36 h-36 rounded-full bg-gradient-to-br ${gradients[state]}
        ring-4 ${rings[state]} shadow-2xl shadow-violet-900/70
        flex items-center justify-center transition-all duration-500
        hover:scale-105 active:scale-95 cursor-pointer select-none
        ${isPulsing ? "animate-pulse" : ""}
      `}
      title={state === "listening" ? "Clique para parar" : "Clique para falar"}
    >
      {/* Inner glow */}
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
      <span className="text-5xl relative z-10 drop-shadow-lg">{emoji[state]}</span>

      {/* Ripple rings when listening */}
      {state === "listening" && (
        <>
          <div className="absolute inset-0 rounded-full border-2 border-pink-400/40 animate-ping" style={{ animationDuration: "1.2s" }} />
          <div className="absolute -inset-4 rounded-full border border-pink-400/20 animate-ping" style={{ animationDuration: "1.8s" }} />
        </>
      )}
      {state === "speaking" && (
        <div className="absolute -inset-2 rounded-full border-2 border-fuchsia-400/30 animate-ping" style={{ animationDuration: "1.5s" }} />
      )}
    </button>
  );
}

// ─── Bubble de mensagem ───────────────────────────────────────
function MessageBubble({ msg, onSpeak }: { msg: Message; onSpeak: (t: string) => void }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} mb-3`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center mt-1">
          <span className="text-xs">🔮</span>
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
        isUser
          ? "bg-slate-700/80 text-slate-100 rounded-tr-sm"
          : "bg-violet-900/60 text-violet-50 border border-violet-700/40 rounded-tl-sm"
      }`}>
        {isUser ? <p className="whitespace-pre-wrap">{msg.content}</p> : <MarkdownText text={msg.content} />}
        <div className={`flex items-center gap-1.5 mt-1.5 ${isUser ? "justify-end" : "justify-between"}`}>
          <span className="text-[9px] opacity-30">{formatDate(msg.createdAt)}</span>
          {!isUser && (
            <button onClick={() => onSpeak(msg.content)} className="text-violet-500 hover:text-violet-300 transition-colors" title="Ouvir">
              <Volume2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────
export default function Oraculo() {
  const { user } = useAuth();
  const { selectedCompanyId: selectedCompanyIdStr, getCompanyIdsForQuery } = useCompany();
  const selectedCompanyId = parseInt(selectedCompanyIdStr) || undefined;
  const companyIdsAll = getCompanyIdsForQuery();
  const [, setLocation] = useLocation();

  // Sessões e mensagens
  const [sessions, setSessions]           = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [sidebarOpen, setSidebarOpen]     = useState(false); // fechado por padrão no modo ativo

  // Estado do assistente
  const [orbState, setOrbState]     = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [activeMode, setActiveMode] = useState(true); // modo ativo por padrão
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [input, setInput]           = useState("");
  const [statusText, setStatusText] = useState("Toque no orbe para começar");

  const chatEndRef      = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const recognitionRef  = useRef<any>(null);
  const activeModeRef   = useRef(activeMode);
  const sessionIdRef    = useRef<number | null>(null);
  const isSendingRef    = useRef(false);

  // Sincronizar refs
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { sessionIdRef.current = activeSession; }, [activeSession]);

  // Redirecionar se não for admin_master
  useEffect(() => {
    if (user && user.role !== "admin_master") setLocation("/");
  }, [user, setLocation]);

  // tRPC
  const listSessions  = trpc.oraculo.listSessions.useQuery({}, { enabled: !!user });
  const createSession = trpc.oraculo.createSession.useMutation();
  const deleteSession = trpc.oraculo.deleteSession.useMutation();
  const getSession    = trpc.oraculo.getSession.useQuery(
    { sessionId: activeSession! },
    { enabled: activeSession !== null }
  );
  const sendMessageMut = trpc.oraculo.sendMessage.useMutation();
  const tts            = trpc.oraculo.tts.useMutation();

  useEffect(() => { if (listSessions.data) setSessions(listSessions.data as Session[]); }, [listSessions.data]);
  useEffect(() => { if (getSession.data) setMessages((getSession.data.messages ?? []) as Message[]); }, [getSession.data]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ─── TTS e fallback ───────────────────────────────────────
  const speakFallback = useCallback((text: string, onDone?: () => void) => {
    if (!window.speechSynthesis) { setOrbState("idle"); setStatusText("Pronto"); onDone?.(); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 500));
    utter.lang = "pt-BR"; utter.rate = 1.05; utter.pitch = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith("pt-BR") && v.name.toLowerCase().includes("female"))
      ?? voices.find(v => v.lang.startsWith("pt"));
    if (ptVoice) utter.voice = ptVoice;
    utter.onend = () => { setOrbState("idle"); setStatusText("Pronto"); onDone?.(); };
    utter.onerror = () => { setOrbState("idle"); setStatusText("Pronto"); onDone?.(); };
    window.speechSynthesis.speak(utter);
  }, []);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    if (!voiceEnabled) { onDone?.(); return; }
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setOrbState("speaking");
      setStatusText("Respondendo...");
      const result = await tts.mutateAsync({ text: text.slice(0, 4800) });
      if (result.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
        audioRef.current = audio;
        audio.onended = () => { setOrbState("idle"); setStatusText("Pronto"); onDone?.(); };
        audio.onerror = () => { speakFallback(text, onDone); };
        await audio.play();
      } else {
        speakFallback(text, onDone);
      }
    } catch {
      speakFallback(text, onDone);
    }
  }, [voiceEnabled, tts, speakFallback]);

  // ─── STT ─────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatusText("Voz não suportada — use o teclado"); return; }

    recognitionRef.current?.stop();
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      setIsListening(true);
      setOrbState("listening");
      setStatusText("Ouvindo... fale agora");
    };

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.trim();
      if (transcript) {
        setInput(transcript);
        // No modo ativo envia automaticamente
        if (activeModeRef.current) {
          setIsListening(false);
          setOrbState("thinking");
          setStatusText("Analisando...");
          // Timeout mínimo para garantir que setInput se propagou
          setTimeout(() => sendText(transcript), 50);
        }
      }
    };

    rec.onerror = () => {
      setIsListening(false);
      setOrbState("idle");
      setStatusText("Não entendi. Toque para falar novamente.");
    };

    rec.onend = () => {
      setIsListening(false);
      if (orbState === "listening") {
        setOrbState("idle");
        setStatusText("Pronto");
      }
    };

    rec.start();
  }, [orbState]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setOrbState("idle");
    setStatusText("Pronto");
  }, []);

  // ─── Criar / obter sessão ─────────────────────────────────
  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const session = await createSession.mutateAsync({ companyId: selectedCompanyId });
      setActiveSession(session.id);
      await listSessions.refetch();
      return session.id;
    } catch {
      toast.error("Erro ao iniciar sessão");
      return null;
    }
  }, [selectedCompanyId, createSession, listSessions]);

  // ─── Enviar texto (shared entre voz e teclado) ────────────
  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || isSendingRef.current) return;
    isSendingRef.current = true;

    const sessionId = await ensureSession();
    if (!sessionId) { isSendingRef.current = false; return; }

    const optimistic: Message = { id: Date.now(), role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    setOrbState("thinking");
    setStatusText("Analisando dados...");

    try {
      const result = await sendMessageMut.mutateAsync({
        sessionId,
        message: text,
        companyId: selectedCompanyId,
        companyIds: companyIdsAll.length > 0 ? companyIdsAll : undefined,
      });

      const aiMsg: Message = { id: Date.now() + 1, role: "assistant", content: result.response, createdAt: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      await listSessions.refetch();

      // Falar resposta e depois voltar a ouvir no modo ativo
      await speak(result.response, () => {
        isSendingRef.current = false;
        if (activeModeRef.current) {
          setTimeout(() => startListening(), 800);
        } else {
          setStatusText("Pronto");
        }
      });
    } catch (e: any) {
      setOrbState("idle");
      setStatusText("Erro — tente novamente");
      toast.error("Erro: " + (e?.message ?? "falha ao enviar"));
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      isSendingRef.current = false;
    }
  }, [ensureSession, selectedCompanyId, companyIdsAll, sendMessageMut, speak, startListening]);

  // ─── Clique no orbe ──────────────────────────────────────
  const handleOrbClick = useCallback(() => {
    if (orbState === "listening") {
      stopListening();
    } else if (orbState === "thinking" || orbState === "speaking") {
      // Para áudio se estiver falando
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      window.speechSynthesis?.cancel();
      setOrbState("idle");
      setStatusText("Parado");
      isSendingRef.current = false;
    } else {
      startListening();
    }
  }, [orbState, startListening, stopListening]);

  // ─── Auto-iniciar no modo ativo ───────────────────────────
  useEffect(() => {
    if (!user || user.role !== "admin_master") return;
    if (activeMode) {
      setStatusText("Iniciando...");
      const timer = setTimeout(() => {
        startListening();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [user]); // só na montagem

  // ─── Gerenciamento de sessões ─────────────────────────────
  const handleNewSession = async () => {
    try {
      const session = await createSession.mutateAsync({ companyId: selectedCompanyId });
      setActiveSession(session.id);
      setMessages([]);
      await listSessions.refetch();
    } catch { toast.error("Erro ao criar sessão"); }
  };

  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession.mutateAsync({ sessionId: id });
      if (activeSession === id) { setActiveSession(null); setMessages([]); }
      await listSessions.refetch();
    } catch { toast.error("Erro ao deletar sessão"); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input); }
  };

  const toggleActiveMode = () => {
    const next = !activeMode;
    setActiveMode(next);
    if (!next) {
      stopListening();
      setStatusText("Modo manual — pressione o orbe ou envie pelo teclado");
    } else {
      setStatusText("Modo ativo ligado — ouvindo em breve...");
      setTimeout(() => startListening(), 800);
    }
  };

  // Loading
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0614]">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  const companyIds = companyIdsAll.length > 0 ? companyIdsAll : (selectedCompanyId ? [selectedCompanyId] : []);

  return (
    <div className="flex h-screen bg-[#0a0614] text-white overflow-hidden">

      {/* ══ SIDEBAR ══════════════════════════════════════════ */}
      <div className={`${sidebarOpen ? "w-60" : "w-0"} shrink-0 transition-all duration-300 overflow-hidden border-r border-violet-900/30 bg-[#0f0820] flex flex-col`}>
        <div className="p-3 border-b border-violet-900/30">
          <button onClick={handleNewSession} disabled={createSession.isPending}
            className="w-full flex items-center gap-2 justify-center bg-violet-700 hover:bg-violet-600 text-white rounded-lg h-9 text-sm transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {sessions.length === 0 && (
            <p className="text-xs text-violet-500/50 text-center py-6 px-3">Nenhuma conversa ainda.</p>
          )}
          {sessions.map(s => (
            <button key={s.id} onClick={() => { setActiveSession(s.id); setMessages([]); }}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-1.5 group transition-all ${
                activeSession === s.id ? "bg-violet-700/40 border border-violet-600/50 text-violet-100" : "hover:bg-violet-900/30 text-violet-400/70 border border-transparent"
              }`}>
              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-violet-500" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-[9px] text-violet-600/60 mt-0.5">{formatDate(s.updatedAt)} · {s.messageCount} msgs</p>
              </div>
              <button onClick={e => handleDeleteSession(s.id, e)} className="opacity-0 group-hover:opacity-100 text-violet-600 hover:text-red-400 transition-all">
                <Trash2 className="w-3 h-3" />
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* ══ ÁREA PRINCIPAL ═══════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Header compacto */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-violet-900/30 shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="text-violet-500 hover:text-violet-300 transition-colors">
            <ChevronLeft className={`w-4 h-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
          <span className="text-sm font-bold text-violet-300 tracking-wide flex-1">🔮 ORÁCULO <span className="text-[9px] bg-violet-700/40 border border-violet-700/50 text-violet-400 px-1.5 py-0.5 rounded-full ml-1">IA</span></span>

          {/* Empresas */}
          <div className="flex items-center gap-1">
            {companyIds.map((id: number) => (
              <span key={id} className="text-[9px] bg-violet-900/60 text-violet-500 px-1.5 py-0.5 rounded-full border border-violet-800/40">
                {id === 60002 ? "FC" : id === 60004 ? "HOTEL" : id === 90001 ? "LOC" : `#${id}`}
              </span>
            ))}
          </div>

          {/* Toggle modo ativo */}
          <button onClick={toggleActiveMode} title={activeMode ? "Desligar modo ativo" : "Ligar modo ativo"}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all border ${
              activeMode ? "bg-violet-700/40 border-violet-600/50 text-violet-200" : "bg-transparent border-violet-800/30 text-violet-600 hover:text-violet-400"
            }`}>
            {activeMode ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
            <span className="hidden sm:inline">{activeMode ? "Ativo" : "Manual"}</span>
          </button>

          {/* Voz */}
          <button onClick={() => setVoiceEnabled(v => !v)} title={voiceEnabled ? "Silenciar" : "Ativar voz"}
            className="text-violet-600 hover:text-violet-300 transition-colors">
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Voltar */}
          <button onClick={() => setLocation("/")} title="Voltar" className="text-violet-700 hover:text-violet-400 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* ── ORBE + STATUS (centro quando sem mensagens) ─── */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 pb-8 px-4">
            {/* Orbe grande */}
            <Orb state={orbState} activeMode={activeMode} onClick={handleOrbClick} />

            {/* Status */}
            <div className="text-center">
              <p className={`text-sm font-medium transition-colors ${
                orbState === "listening" ? "text-pink-400" :
                orbState === "thinking" ? "text-indigo-400" :
                orbState === "speaking" ? "text-fuchsia-400" : "text-violet-400"
              }`}>{statusText}</p>
              {activeMode && orbState === "idle" && (
                <p className="text-[10px] text-violet-700 mt-1">Modo ativo · ela ouve automaticamente</p>
              )}
            </div>

            {/* Sugestões rápidas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full mt-2">
              {["Como está o headcount das 3 empresas?", "Anomalias nos dados?", "Custo da folha este mês?", "Obras em andamento?"].map((s, i) => (
                <button key={i} onClick={() => sendText(s)}
                  className="text-left p-2.5 rounded-xl bg-violet-900/20 border border-violet-800/25 text-violet-400/80 text-xs hover:bg-violet-800/30 hover:text-violet-200 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── CHAT COM ORBE FLUTUANTE ─── */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Orbe compacto + status */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-violet-900/20 shrink-0">
              <button onClick={handleOrbClick}
                className={`relative w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center transition-all hover:scale-105 ${
                  orbState === "listening" ? "from-pink-500 to-violet-600 animate-pulse ring-2 ring-pink-400/50" :
                  orbState === "thinking" ? "from-indigo-500 to-violet-700 animate-pulse ring-2 ring-indigo-400/50" :
                  orbState === "speaking" ? "from-violet-400 to-fuchsia-600 animate-pulse ring-2 ring-fuchsia-400/50" :
                  "from-violet-800 to-purple-900 ring-1 ring-violet-700/40"
                }`}>
                <span className="text-lg">{orbState === "listening" ? "👂" : orbState === "thinking" ? "⏳" : orbState === "speaking" ? "🔊" : "🔮"}</span>
              </button>
              <p className={`text-xs font-medium ${
                orbState === "listening" ? "text-pink-400" :
                orbState === "thinking" ? "text-indigo-400" :
                orbState === "speaking" ? "text-fuchsia-400" : "text-violet-500"
              }`}>{statusText}</p>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onSpeak={(t) => speak(t)} />
              ))}
              {sendMessageMut.isPending && (
                <div className="flex gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center mt-0.5">
                    <span className="text-xs">🔮</span>
                  </div>
                  <div className="bg-violet-900/50 border border-violet-700/40 rounded-2xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* ── INPUT DE TEXTO ─── */}
        <div className="shrink-0 px-3 py-3 border-t border-violet-900/30 bg-[#0a0614]/90">
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            {/* Mic */}
            <button onClick={isListening ? stopListening : startListening} disabled={sendMessageMut.isPending}
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isListening ? "bg-pink-600 shadow-lg shadow-pink-900/50 animate-pulse" : "bg-violet-800/50 border border-violet-700/40 hover:bg-violet-700/60"
              } disabled:opacity-30`}
              title={isListening ? "Parar" : "Falar"}>
              {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-violet-300" />}
            </button>

            {/* Textarea */}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite ou fale... (Enter para enviar)"
              rows={1}
              className="flex-1 min-h-[40px] max-h-28 resize-none bg-violet-950/40 border-violet-800/50 text-violet-100 placeholder:text-violet-700 focus:border-violet-600 rounded-xl text-sm"
              disabled={sendMessageMut.isPending}
            />

            {/* Send */}
            <button onClick={() => sendText(input)} disabled={!input.trim() || sendMessageMut.isPending}
              className="shrink-0 w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 flex items-center justify-center transition-all shadow-lg shadow-violet-900/50">
              {sendMessageMut.isPending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
