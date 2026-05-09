import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Building2, LogOut, CalendarRange, FileText, Star, ShieldCheck,
  Layers, Clock, Zap,
} from "lucide-react";
import { APP_VERSION } from "../../../../shared/version";

type Modulo = {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  accentFrom: string;
  accentTo: string;
  accentGlow: string;
};

const MODULOS: Modulo[] = [
  {
    id: "planejamento",
    title: "Planejamento",
    subtitle: "Cronograma e Avanço",
    icon: CalendarRange,
    accentFrom: "#3B82F6",
    accentTo: "#1D4ED8",
    accentGlow: "rgba(59,130,246,0.35)",
  },
  {
    id: "rh-documentos",
    title: "RH & Docs",
    subtitle: "Controle de Documentos",
    icon: ShieldCheck,
    accentFrom: "#10B981",
    accentTo: "#059669",
    accentGlow: "rgba(16,185,129,0.35)",
  },
  {
    id: "proj-doc",
    title: "Proj./Doc.",
    subtitle: "Documentos Técnicos",
    icon: FileText,
    accentFrom: "#A855F7",
    accentTo: "#7E22CE",
    accentGlow: "rgba(168,85,247,0.35)",
  },
  {
    id: "avaliacao",
    title: "Avaliação",
    subtitle: "Avaliação anônima mensal",
    icon: Star,
    accentFrom: "#F59E0B",
    accentTo: "#D97706",
    accentGlow: "rgba(245,158,11,0.35)",
  },
];

const ROBOT_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/XtVAYezVwPtXCXyB.png";

const hubStyles = `
@keyframes meshDrift {
  0%, 100% { background-position: 0% 50%; }
  25% { background-position: 100% 0%; }
  50% { background-position: 100% 100%; }
  75% { background-position: 0% 100%; }
}
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeSlideRight {
  from { opacity: 0; transform: translateX(-28px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes pulseGlow { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
@keyframes floatRobot { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
@keyframes waveFlow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
.hub-mesh-bg {
  background:
    radial-gradient(ellipse 90% 60% at 15% 50%, rgba(59,130,246,0.06) 0%, transparent 70%),
    radial-gradient(ellipse 50% 50% at 85% 30%, rgba(212,168,67,0.05) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% 90%, rgba(16,185,129,0.04) 0%, transparent 70%),
    linear-gradient(160deg, #FAFBFE 0%, #F4F6FA 25%, #FAFBFE 50%, #F9F7F2 75%, #FAFBFE 100%);
  background-size: 200% 200%;
  animation: meshDrift 25s ease-in-out infinite;
}
.hub-animate-up { animation: fadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
.hub-animate-right { animation: fadeSlideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
.hub-glow-dot { animation: pulseGlow 3s ease-in-out infinite; }
.hub-robot-float { animation: floatRobot 5s ease-in-out infinite; }
.hub-wave-line {
  background: linear-gradient(90deg, transparent, rgba(212,168,67,0.15), rgba(59,130,246,0.10), transparent);
  background-size: 200% 100%;
  animation: waveFlow 8s linear infinite;
}
`;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function getFormattedDate(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default function PortalHubCliente() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";
  const nomeEmpresa = localStorage.getItem("portal_nome") || "Cliente";
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo]);

  const tokenCheck = trpc.portalExterno.auth.verificarToken.useQuery({ token }, { enabled: !!token });
  useEffect(() => {
    if (tokenCheck.data && !tokenCheck.data.valid) {
      localStorage.clear();
      toast.error("Sessão expirada");
      navigate("/portal/cliente/login");
    }
  }, [tokenCheck.data]);

  const { data: minhasObras = [] } = trpc.portalExterno.cliente.minhasObras.useQuery(
    { token }, { enabled: !!token && tipo === "cliente" }
  );

  const greeting = useMemo(() => getGreeting(), []);
  const formattedDate = useMemo(() => getFormattedDate(), []);
  const firstName = (nomeEmpresa || "Cliente").split(" ").slice(0, 2).join(" ");

  const handleClick = (modulo: Modulo) => {
    if (modulo.id === "avaliacao") { navigate("/portal/cliente/dashboard?tab=avaliacao"); return; }
    if (minhasObras.length === 1) {
      const obraId = (minhasObras[0] as any).id;
      if (modulo.id === "planejamento") navigate(`/portal/cliente/obra/${obraId}`);
      else if (modulo.id === "rh-documentos") navigate(`/portal/cliente/rh/${obraId}`);
      else if (modulo.id === "proj-doc") navigate(`/portal/cliente/projdoc/${obraId}`);
      return;
    }
    navigate(`/portal/cliente/modulo/${modulo.id}`);
  };

  const logout = () => {
    localStorage.clear();
    navigate("/portal/cliente/login");
  };

  return (
    <>
      <style>{hubStyles}</style>
      <div className="min-h-screen hub-mesh-bg relative overflow-hidden">
        {/* Wave decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="hub-wave-line absolute top-[35%] left-0 right-0 h-[1px]" />
          <div className="hub-wave-line absolute top-[55%] left-0 right-0 h-[1px]" style={{ animationDelay: '-3s' }} />
          <div className="hub-wave-line absolute top-[75%] left-0 right-0 h-[1px]" style={{ animationDelay: '-6s' }} />
        </div>

        {/* HEADER */}
        <header className="sticky top-0 z-50" style={{
          background: "rgba(255,255,255,0.60)",
          backdropFilter: "blur(28px) saturate(1.8)",
          WebkitBackdropFilter: "blur(28px) saturate(1.8)",
          borderBottom: "1px solid rgba(255,255,255,0.4)",
          boxShadow: "0 1px 12px rgba(0,0,0,0.03)",
        }}>
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center shadow-lg shadow-[#1B2A4A]/20">
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#D4A843] border-2 border-white hub-glow-dot" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-[#1B2A4A] tracking-tight leading-none truncate">Portal do Cliente</h1>
                <span className="text-[10px] text-gray-400 font-mono">{APP_VERSION}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 bg-white/50 border border-white/60 rounded-xl px-3 py-1.5 backdrop-blur-sm max-w-xs">
                <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-700 truncate">{nomeEmpresa}</span>
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded-xl bg-white/50 hover:bg-rose-50 border border-white/60 transition"
              >
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </div>
          </div>
        </header>

        {/* HERO */}
        <main className="relative max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16">
          <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-0 pt-3 lg:pt-2">

            {/* Robot */}
            <div
              className={`relative flex-shrink-0 hidden lg:block lg:w-[400px] ${mounted ? 'hub-animate-right' : 'opacity-0'}`}
              style={{ animationDelay: '0.1s' }}
            >
              <div className="hub-robot-float">
                <img
                  src={ROBOT_IMG}
                  alt="FC Engenharia"
                  className="w-full h-auto object-contain drop-shadow-2xl"
                  style={{ filter: "drop-shadow(0 20px 40px rgba(27,42,74,0.15))", maxHeight: "420px" }}
                />
              </div>
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[30px] rounded-full blur-2xl"
                style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.15), transparent)" }}
              />
            </div>

            {/* Title + Tiles */}
            <div className="flex-1 lg:pl-4 w-full">
              <div className="relative">
                <span
                  className="absolute -top-6 right-0 text-[120px] sm:text-[160px] lg:text-[200px] font-black leading-none pointer-events-none select-none"
                  style={{ color: "rgba(27,42,74,0.04)" }}
                >
                  FC
                </span>
              </div>

              <div className={`mb-2 relative z-10 ${mounted ? 'hub-animate-up' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#D4A843] hub-glow-dot" />
                  <span className="text-[10px] font-bold text-[#D4A843] uppercase tracking-[0.25em]">Plataforma do Cliente</span>
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight">
                  <span className="text-[#1B2A4A]">Portal</span>
                  <br />
                  <span style={{
                    background: "linear-gradient(135deg, #1B2A4A 0%, #D4A843 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>FC Engenharia</span>
                </h2>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <p className="text-gray-400 text-sm flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    {greeting}, <span className="text-[#1B2A4A] font-semibold truncate max-w-[260px]">{firstName}</span>
                  </p>
                  <span className="text-gray-200 hidden sm:inline">|</span>
                  <p className="text-gray-300 text-xs hidden sm:block">{formattedDate}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {minhasObras.length} obra{minhasObras.length !== 1 ? "s" : ""} vinculada{minhasObras.length !== 1 ? "s" : ""} ao seu acesso.
                </p>
              </div>

              {/* Tiles */}
              <div className="flex flex-wrap gap-3 mt-3 relative z-10">
                {MODULOS.map((mod, idx) => {
                  const Icon = mod.icon;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => handleClick(mod)}
                      className={`group relative flex flex-col items-center justify-center text-center rounded-2xl p-3 cursor-pointer ${mounted ? 'hub-animate-up' : 'opacity-0'} transition-all duration-200 hover:scale-[1.04] select-none`}
                      style={{
                        animationDelay: `${0.3 + idx * 0.07}s`,
                        width: '115px',
                        minHeight: '96px',
                        background: `linear-gradient(145deg, ${mod.accentFrom}16, ${mod.accentTo}0a)`,
                        border: `1.5px solid ${mod.accentFrom}38`,
                        boxShadow: `0 4px 20px -6px ${mod.accentGlow || mod.accentFrom + "28"}`,
                      }}
                    >
                      <div
                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at 50% 60%, ${mod.accentFrom}20 0%, transparent 70%)` }}
                      />
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center mb-2 transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5"
                        style={{
                          background: `linear-gradient(135deg, ${mod.accentFrom}, ${mod.accentTo})`,
                          boxShadow: `0 4px 12px -3px ${mod.accentGlow || mod.accentFrom + "55"}`,
                        }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-[12px] font-extrabold leading-tight text-[#1B2A4A] tracking-tight w-full truncate">{mod.title}</p>
                      <p className="text-[9.5px] text-gray-400 leading-tight mt-0.5 w-full truncate">{mod.subtitle}</p>
                    </div>
                  );
                })}
              </div>

              {minhasObras.length === 0 && (
                <div className="mt-6 p-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 text-center max-w-md">
                  <p className="text-sm text-amber-800 font-medium">
                    Nenhuma obra vinculada ao seu cadastro ainda. Entre em contato com a FC Engenharia.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Em breve */}
          <div className={`mt-10 mb-6 ${mounted ? 'hub-animate-up' : 'opacity-0'}`} style={{ animationDelay: '0.7s' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-1 rounded-full bg-gradient-to-b from-gray-300 to-gray-200" />
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Em Desenvolvimento</h3>
              <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
              {[
                { title: "Galeria de Fotos", subtitle: "Fotos da obra", color: "#EC4899" },
                { title: "Boletins de Medição", subtitle: "Medição contratual", color: "#14B8A6" },
                { title: "Solicitações", subtitle: "Atendimento direto", color: "#0891B2" },
              ].map((m) => (
                <div
                  key={m.title}
                  className="relative rounded-2xl p-4 text-center cursor-default border border-white/60"
                  style={{
                    background: "rgba(255,255,255,0.65)",
                    backdropFilter: "blur(20px) saturate(1.5)",
                    opacity: 0.7,
                  }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mx-auto mb-2 opacity-50"
                    style={{ background: `linear-gradient(135deg, ${m.color}25, ${m.color}10)` }}
                  >
                    <Zap className="h-4 w-4" style={{ color: m.color }} />
                  </div>
                  <h4 className="text-xs font-bold text-gray-500">{m.title}</h4>
                  <p className="text-[9px] text-gray-400 mb-2">{m.subtitle}</p>
                  <span className="inline-flex items-center gap-1 text-[8px] font-bold text-[#D4A843]/70 bg-[#D4A843]/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    <Zap className="h-2 w-2" /> Em breve
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-5 relative z-10">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center shadow-sm">
                <Layers className="h-3 w-3 text-white" />
              </div>
              <p className="text-xs text-gray-400 font-medium">Portal do Cliente — FC Engenharia</p>
            </div>
            <p className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</p>
          </div>
        </footer>
      </div>
    </>
  );
}
