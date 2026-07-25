import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { stripForTTS } from "@shared/ttsTextClean";
import { memo, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Plus, Trash2, Send, Mic, MicOff, Volume2, VolumeX,
  MessageSquare, ChevronLeft, Loader2, ArrowLeft, Zap, ZapOff,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────
interface Msg { id: number; role: "user" | "assistant"; content: string; createdAt: string; }
interface Session { id: number; title: string; messageCount: number; createdAt: string; updatedAt: string; }

function fmt(iso: string) {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 86400) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diff < 7 * 86400) return d.toLocaleDateString("pt-BR", { weekday: "short" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

function MD({ text }: { text: string }) {
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
type OrbState = "idle" | "listening" | "thinking" | "speaking";

const Orb = memo(function Orb({ state, onClick }: { state: OrbState; onClick: () => void }) {
  const grad = {
    idle:      "from-violet-800 via-purple-900 to-indigo-950",
    listening: "from-pink-500 via-violet-500 to-purple-700",
    thinking:  "from-indigo-500 via-violet-600 to-purple-800",
    speaking:  "from-violet-400 via-fuchsia-500 to-purple-700",
  }[state];
  const shadow = {
    idle:      "shadow-violet-900/60",
    listening: "shadow-pink-500/50",
    thinking:  "shadow-indigo-500/50",
    speaking:  "shadow-fuchsia-500/50",
  }[state];
  const icon = { idle: "🔮", listening: "👂", thinking: "⏳", speaking: "🔊" }[state];
  // Usa CSS transition suave em vez de animate-ping/animate-pulse (mais leve em mobile)
  const scale = state !== "idle" ? "scale-105" : "scale-100";
  return (
    <button
      onClick={onClick}
      className={`relative w-36 h-36 rounded-full bg-gradient-to-br ${grad} shadow-2xl ${shadow} flex items-center justify-center transition-all duration-500 hover:scale-105 active:scale-95 ${scale}`}
      style={{ willChange: "transform" }}
    >
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
      <span className="text-5xl relative z-10 drop-shadow-lg">{icon}</span>
      {/* Anel de glow simples — CSS box-shadow não causa repaint */}
      {state === "listening" && (
        <div className="absolute inset-0 rounded-full ring-4 ring-pink-400/50 transition-all duration-300" />
      )}
      {state === "speaking" && (
        <div className="absolute inset-0 rounded-full ring-4 ring-fuchsia-400/50 transition-all duration-300" />
      )}
      {state === "thinking" && (
        <div className="absolute inset-0 rounded-full ring-4 ring-indigo-400/40 transition-all duration-300" />
      )}
    </button>
  );
});

const Bubble = memo(function Bubble({ msg, onSpeak }: { msg: Msg; onSpeak: (t: string) => void }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} mb-3`}>
      {!isUser && <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center mt-1"><span className="text-xs">🔮</span></div>}
      <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${isUser ? "bg-slate-700/80 text-slate-100 rounded-tr-sm" : "bg-violet-900/60 text-violet-50 border border-violet-700/40 rounded-tl-sm"}`}>
        {isUser ? <p className="whitespace-pre-wrap">{msg.content}</p> : <MD text={msg.content} />}
        <div className={`flex items-center gap-1.5 mt-1.5 ${isUser ? "justify-end" : "justify-between"}`}>
          <span className="text-[9px] opacity-30">{fmt(msg.createdAt)}</span>
          {!isUser && <button onClick={() => onSpeak(msg.content)} className="text-violet-500 hover:text-violet-300 transition-colors"><Volume2 className="w-3 h-3" /></button>}
        </div>
      </div>
    </div>
  );
});

// ─── Componente principal ─────────────────────────────────────
export default function Oraculo() {
  const { user } = useAuth();
  const { selectedCompanyId: selStr, getCompanyIdsForQuery } = useCompany();
  const [, setLocation] = useLocation();

  // estado da UI
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [sessionId, setSessionId]       = useState<number | null>(null);
  const [messages, setMessages]         = useState<Msg[]>([]);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [orbState, setOrbState]         = useState<OrbState>("idle");
  const [activeMode, setActiveMode]     = useState(true);
  const [voiceOn, setVoiceOn]           = useState(true);
  const [listening, setListening]       = useState(false);
  const [input, setInput]               = useState("");
  const [status, setStatus]             = useState("Toque no orbe para começar");
  const [sending, setSending]           = useState(false);

  // refs para não criar circular deps em useCallback
  const sessionIdRef   = useRef<number | null>(null);
  const activeModeRef  = useRef(true);
  const voiceOnRef     = useRef(true);
  const orbStateRef    = useRef<OrbState>("idle");
  const sendingRef     = useRef(false);
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const audioSrcRef    = useRef<AudioBufferSourceNode | null>(null);
  const recRef         = useRef<any>(null);
  const chatEndRef     = useRef<HTMLDivElement>(null);

  // sincronizar refs
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { orbStateRef.current = orbState; }, [orbState]);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

  // scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // redirect
  useEffect(() => { if (user && user.role !== "admin_master") setLocation("/"); }, [user, setLocation]);

  // tRPC
  const selectedCompanyId = parseInt(selStr) || undefined;
  const companyIds = (() => { try { return getCompanyIdsForQuery(); } catch { return []; } })();

  const listQ   = trpc.oraculo.listSessions.useQuery({}, { enabled: !!user });
  const createM = trpc.oraculo.createSession.useMutation();
  const deleteM = trpc.oraculo.deleteSession.useMutation();
  // Usar sessionId ?? -1 como fallback (enabled: false garante que -1 nunca é enviado)
  const sessionQ = trpc.oraculo.getSession.useQuery(
    { sessionId: sessionId ?? -1 },
    { enabled: sessionId !== null && sessionId > 0 }
  );
  const sendM = trpc.oraculo.sendMessage.useMutation();
  const ttsM  = trpc.oraculo.tts.useMutation();

  useEffect(() => { if (listQ.data) setSessions(listQ.data as Session[]); }, [listQ.data]);
  useEffect(() => { if (sessionQ.data) setMessages((sessionQ.data.messages ?? []) as Msg[]); }, [sessionQ.data]);

  // ─── Desbloquear áudio iOS (chamar em gesto do usuário) ──
  function unlockAudio() {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      // Toca buffer vazio para liberar permissão no iOS
      const buf = audioCtxRef.current.createBuffer(1, 1, 22050);
      const src = audioCtxRef.current.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtxRef.current.destination);
      src.start(0);
    } catch {}
  }

  // ─── TTS ─────────────────────────────────────────────────
  function stopAudio() {
    try { audioSrcRef.current?.stop(); } catch {}
    audioSrcRef.current = null;
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  function speakFallback(text: string, onDone?: () => void) {
    try {
      if (!window.speechSynthesis) { setOrbState("idle"); setStatus("Pronto"); onDone?.(); return; }
      // Mesma limpeza usada no servidor: sem isso o navegador lê "asterisco"
      // e descreve emojis quando o Google TTS não está disponível.
      const cleaned = stripForTTS(text);
      if (!cleaned) { setOrbState("idle"); setStatus("Pronto"); onDone?.(); return; }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(cleaned.slice(0, 400));
      utter.lang = "pt-BR"; utter.rate = 1.05;
      // carregar vozes (async no Chrome, sync no Safari)
      const trySpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const v = voices.find(v => v.lang.startsWith("pt-BR")) ?? voices.find(v => v.lang.startsWith("pt"));
        if (v) utter.voice = v;
        utter.onend  = () => { setOrbState("idle"); setStatus("Pronto"); onDone?.(); };
        utter.onerror = () => { setOrbState("idle"); setStatus("Pronto"); onDone?.(); };
        window.speechSynthesis.speak(utter);
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        trySpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = trySpeak;
      }
    } catch { setOrbState("idle"); setStatus("Pronto"); onDone?.(); }
  }

  async function speak(text: string, onDone?: () => void) {
    if (!voiceOnRef.current) { onDone?.(); return; }
    setOrbState("speaking"); setStatus("Respondendo...");
    try {
      const res = await ttsM.mutateAsync({ text: text.slice(0, 1800) });
      if (res.audio) {
        const dataUrl = `data:audio/mp3;base64,${res.audio}`;

        // Tentar AudioContext (melhor para iOS após unlock)
        if (audioCtxRef.current) {
          const ctx = audioCtxRef.current;
          try {
            if (ctx.state === "suspended") await ctx.resume();
            // fetch com data: URL — assíncrono, não bloqueia a UI
            const fetchRes = await fetch(dataUrl);
            const arrayBuffer = await fetchRes.arrayBuffer();
            ctx.decodeAudioData(arrayBuffer, (decoded) => {
              try { audioSrcRef.current?.stop(); } catch {}
              const src = ctx.createBufferSource();
              src.buffer = decoded;
              src.connect(ctx.destination);
              audioSrcRef.current = src;
              src.onended = () => { setOrbState("idle"); setStatus("Pronto"); onDone?.(); };
              src.start(0);
            }, () => speakFallback(text, onDone));
            return; // saiu com sucesso
          } catch { /* cai no fallback abaixo */ }
        }

        // Fallback: HTMLAudio (desktop / sem AudioContext)
        try {
          const audio = new Audio(dataUrl);
          audioRef.current = audio;
          audio.onended = () => { setOrbState("idle"); setStatus("Pronto"); onDone?.(); };
          audio.onerror = () => speakFallback(text, onDone);
          await audio.play();
        } catch { speakFallback(text, onDone); }
      } else {
        speakFallback(text, onDone);
      }
    } catch {
      speakFallback(text, onDone);
    }
  }

  // ─── STT ─────────────────────────────────────────────────
  function startListening() {
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { setStatus("Voz não suportada — use o teclado"); return; }
      if (recRef.current) { try { recRef.current.stop(); } catch {} }
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "pt-BR";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => { setListening(true); setOrbState("listening"); setStatus("Ouvindo... fale agora"); };
      rec.onresult = (e: any) => {
        try {
          const t = e.results[0][0].transcript.trim();
          if (t && activeModeRef.current) {
            setListening(false);
            setOrbState("thinking");
            setStatus("Analisando...");
            setInput(t);
            // pequeno delay para garantir que o estado commitou
            setTimeout(() => doSend(t), 80);
          } else if (t) {
            setInput(t);
          }
        } catch {}
      };
      rec.onerror = () => { setListening(false); setOrbState("idle"); setStatus("Não entendi. Toque para tentar novamente."); };
      rec.onend = () => { setListening(false); if (orbStateRef.current === "listening") { setOrbState("idle"); setStatus("Pronto"); } };
      rec.start();
    } catch { setStatus("Erro ao iniciar microfone"); }
  }

  function stopListening() {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
    setOrbState("idle");
    setStatus("Pronto");
  }

  // ─── Garantir sessão ──────────────────────────────────────
  async function ensureSession(): Promise<number | null> {
    if (sessionIdRef.current && sessionIdRef.current > 0) return sessionIdRef.current;
    try {
      const s = await createM.mutateAsync({ companyId: selectedCompanyId });
      setSessionId(s.id);
      listQ.refetch().catch(() => {});
      return s.id;
    } catch (e: any) {
      const msg = e?.message ?? e?.data?.message ?? "Falha na conexão";
      toast.error("Erro ao criar sessão: " + msg);
      return null;
    }
  }

  // ─── Enviar mensagem ──────────────────────────────────────
  async function doSend(text: string) {
    const trimmed = (text || input).trim();
    if (!trimmed || sendingRef.current) return;
    setSending(true);
    sendingRef.current = true;

    const sid = await ensureSession();
    if (!sid) { setSending(false); sendingRef.current = false; return; }

    const optimistic: Msg = { id: Date.now(), role: "user", content: trimmed, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    setOrbState("thinking");
    setStatus("Analisando dados...");

    try {
      const res = await sendM.mutateAsync({
        sessionId: sid,
        message: trimmed,
        companyId: selectedCompanyId,
        companyIds: companyIds.length > 0 ? companyIds : undefined,
      });
      const aiMsg: Msg = { id: Date.now() + 1, role: "assistant", content: res.response, createdAt: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      listQ.refetch().catch(() => {});

      await speak(res.response, () => {
        setSending(false);
        sendingRef.current = false;
        if (activeModeRef.current) {
          setTimeout(() => startListening(), 700);
        } else {
          setStatus("Pronto");
        }
      });
    } catch (e: any) {
      setOrbState("idle");
      setStatus("Erro — tente novamente");
      toast.error(e?.message ?? "Falha ao enviar");
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setSending(false);
      sendingRef.current = false;
    }
  }

  // ─── Clique no orbe ──────────────────────────────────────
  function handleOrb() {
    unlockAudio(); // desbloqueia áudio no iOS (gesto do usuário)
    if (orbState === "listening") { stopListening(); return; }
    if (orbState === "thinking" || orbState === "speaking") {
      stopAudio();
      setSending(false); sendingRef.current = false;
      setOrbState("idle"); setStatus("Parado");
      return;
    }
    startListening();
  }

  // ─── Sessões ──────────────────────────────────────────────
  async function handleNewSession() {
    try {
      const s = await createM.mutateAsync({ companyId: selectedCompanyId });
      setSessionId(s.id); setMessages([]);
      listQ.refetch().catch(() => {});
    } catch { toast.error("Erro ao criar sessão"); }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteM.mutateAsync({ sessionId: id });
      if (sessionId === id) { setSessionId(null); setMessages([]); }
      listQ.refetch().catch(() => {});
    } catch { toast.error("Erro ao deletar"); }
  }

  function toggleActive() {
    const next = !activeMode;
    setActiveMode(next);
    activeModeRef.current = next;
    if (!next) { stopListening(); setStatus("Modo manual"); }
    else { setStatus("Modo ativo — toque no orbe para começar"); }
  }

  // ─── Loading enquanto auth não carrega ────────────────────
  if (!user) {
    return (
      <DashboardLayout noPadding>
        <div className="flex items-center justify-center h-[calc(100svh-3.5rem)] bg-[#0a0614]">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const statusColor = orbState === "listening" ? "text-pink-400" : orbState === "thinking" ? "text-indigo-400" : orbState === "speaking" ? "text-fuchsia-400" : "text-violet-500";
  const companyDisplay = companyIds.map((id: number) => id === 60002 ? "FC" : id === 60004 ? "HOTEL" : id === 90001 ? "LOC" : `#${id}`);

  return (
    <DashboardLayout noPadding>
    <div className="flex h-[calc(100svh-3.5rem)] bg-[#0a0614] text-white overflow-hidden">

      {/* ═══ SIDEBAR ══════════════════════════════════════ */}
      <div className={`${sidebarOpen ? "w-60" : "w-0"} shrink-0 transition-all duration-300 overflow-hidden border-r border-violet-900/30 bg-[#0f0820] flex flex-col`}>
        <div className="p-3 border-b border-violet-900/30">
          <button onClick={handleNewSession} disabled={createM.isPending}
            className="w-full flex items-center gap-2 justify-center bg-violet-700 hover:bg-violet-600 text-white rounded-lg h-9 text-sm transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {sessions.length === 0 && <p className="text-xs text-violet-500/50 text-center py-6">Nenhuma conversa ainda.</p>}
          {sessions.map(s => (
            <button key={s.id} onClick={() => { setSessionId(s.id); setMessages([]); }}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-1.5 group transition-all ${sessionId === s.id ? "bg-violet-700/40 border border-violet-600/50 text-violet-100" : "hover:bg-violet-900/30 text-violet-400/70 border border-transparent"}`}>
              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-violet-500" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-[9px] text-violet-600/60 mt-0.5">{fmt(s.updatedAt)} · {s.messageCount} msgs</p>
              </div>
              <button onClick={e => handleDelete(s.id, e)} className="opacity-0 group-hover:opacity-100 text-violet-600 hover:text-red-400 transition-all">
                <Trash2 className="w-3 h-3" />
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ ÁREA PRINCIPAL ════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-violet-900/30 shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="text-violet-500 hover:text-violet-300 transition-colors">
            <ChevronLeft className={`w-4 h-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
          <span className="text-sm font-bold text-violet-300 tracking-wide flex-1">
            🔮 ORÁCULO <span className="text-[9px] bg-violet-700/40 border border-violet-700/50 text-violet-400 px-1.5 py-0.5 rounded-full ml-1">IA</span>
          </span>
          <div className="flex items-center gap-1">
            {companyDisplay.map((name: string, i: number) => (
              <span key={i} className="text-[9px] bg-violet-900/60 text-violet-500 px-1.5 py-0.5 rounded-full border border-violet-800/40">{name}</span>
            ))}
          </div>
          <button onClick={toggleActive} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all border ${activeMode ? "bg-violet-700/40 border-violet-600/50 text-violet-200" : "bg-transparent border-violet-800/30 text-violet-600 hover:text-violet-400"}`}>
            {activeMode ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
            <span className="hidden sm:inline">{activeMode ? "Ativo" : "Manual"}</span>
          </button>
          <button onClick={() => setVoiceOn(v => !v)} className="text-violet-600 hover:text-violet-300 transition-colors">
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={() => setLocation("/")}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-800/40 bg-violet-900/30 text-violet-400 hover:text-violet-200 hover:bg-violet-800/40 text-[10px] font-semibold transition-all">
            <ArrowLeft className="w-3 h-3" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
        </div>

        {/* Conteúdo */}
        {messages.length === 0 ? (
          /* ─ Tela inicial com orbe grande ─ */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 pb-8 px-4">
            <Orb state={orbState} onClick={handleOrb} />
            <div className="text-center">
              <p className={`text-sm font-medium transition-colors ${statusColor}`}>{status}</p>
              {activeMode && orbState === "idle" && <p className="text-[10px] text-violet-700 mt-1">Modo ativo · toque no orbe e fale</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full mt-2">
              {["Como está o headcount das 3 empresas?", "Existe alguma anomalia nos dados?", "Qual o custo da folha este mês?", "Quantas obras em andamento?"].map((s, i) => (
                <button key={i} onClick={() => { unlockAudio(); doSend(s); }} className="text-left p-2.5 rounded-xl bg-violet-900/20 border border-violet-800/25 text-violet-400/80 text-xs hover:bg-violet-800/30 hover:text-violet-200 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ─ Chat com orbe compacto ─ */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-violet-900/20 shrink-0">
              <button onClick={handleOrb} className={`relative w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center transition-all hover:scale-105 ${
                orbState === "listening" ? "from-pink-500 to-violet-600 animate-pulse ring-2 ring-pink-400/50" :
                orbState === "thinking"  ? "from-indigo-500 to-violet-700 animate-pulse ring-2 ring-indigo-400/50" :
                orbState === "speaking"  ? "from-violet-400 to-fuchsia-600 animate-pulse ring-2 ring-fuchsia-400/50" :
                "from-violet-800 to-purple-900 ring-1 ring-violet-700/40"
              }`}>
                <span className="text-lg">{orbState === "listening" ? "👂" : orbState === "thinking" ? "⏳" : orbState === "speaking" ? "🔊" : "🔮"}</span>
              </button>
              <p className={`text-xs font-medium ${statusColor}`}>{status}</p>
              <button onClick={handleNewSession} disabled={createM.isPending}
                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-900/40 border border-violet-800/40 text-violet-400 hover:text-violet-200 text-[10px] transition-colors disabled:opacity-40">
                <Plus className="w-3 h-3" /> Nova
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.map(m => <Bubble key={m.id} msg={m} onSpeak={t => speak(t)} />)}
              {sending && (
                <div className="flex gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center mt-0.5 shrink-0"><span className="text-xs">🔮</span></div>
                  <div className="bg-violet-900/50 border border-violet-700/40 rounded-2xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-4">
                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* Input de texto */}
        <div className="shrink-0 px-3 py-3 border-t border-violet-900/30 bg-[#0a0614]/90">
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            <button onClick={() => { unlockAudio(); listening ? stopListening() : startListening(); }} disabled={sending}
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${listening ? "bg-pink-600 shadow-lg shadow-pink-900/50 animate-pulse" : "bg-violet-800/50 border border-violet-700/40 hover:bg-violet-700/60"} disabled:opacity-30`}>
              {listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-violet-300" />}
            </button>
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); unlockAudio(); doSend(input); } }}
              placeholder="Digite ou fale... (Enter para enviar)"
              rows={1}
              className="flex-1 min-h-[40px] max-h-28 resize-none bg-violet-950/40 border-violet-800/50 text-violet-100 placeholder:text-violet-700 focus:border-violet-600 rounded-xl text-sm"
              disabled={sending}
            />
            <button onClick={() => { unlockAudio(); doSend(input); }} disabled={!input.trim() || sending}
              className="shrink-0 w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 flex items-center justify-center transition-all shadow-lg shadow-violet-900/50">
              {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
