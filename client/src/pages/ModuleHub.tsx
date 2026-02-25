import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule, ModuleId } from "@/contexts/ModuleContext";
import { APP_VERSION } from "../../../shared/version";
import { trpc } from "@/lib/trpc";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Lock, Building2, LogOut, ChevronDown, LayoutGrid,
  Bell, Clock, Zap, Layers, ArrowUpRight,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLoginUrl } from "@/const";
import { useState, useMemo, useEffect } from "react";

/* ─── Module definitions ─── */
type Module = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  accentFrom: string;
  accentTo: string;
  accentGlow: string;
  path: string;
  active: boolean;
  features: string[];
};

const MODULES: Module[] = [
  {
    id: "rh-dp",
    title: "RH & DP",
    subtitle: "Recursos Humanos e Departamento Pessoal",
    description: "Colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios e documentação trabalhista.",
    icon: Users,
    accentFrom: "#3B82F6",
    accentTo: "#6366F1",
    accentGlow: "rgba(59,130,246,0.35)",
    path: "/painel",
    active: true,
    features: ["Colaboradores", "Folha de Pagamento", "Ponto Eletrônico", "Férias & Aviso Prévio", "Contratos PJ", "Vale Alimentação"],
  },
  {
    id: "sst",
    title: "SST",
    subtitle: "Segurança e Saúde do Trabalho",
    description: "EPIs, ASOs, CIPA, treinamentos de segurança e conformidade com normas regulamentadoras.",
    icon: Shield,
    accentFrom: "#10B981",
    accentTo: "#059669",
    accentGlow: "rgba(16,185,129,0.35)",
    path: "/painel",
    active: true,
    features: ["Controle de EPIs", "ASOs", "CIPA", "Base CAEPI", "Documentos SST"],
  },
  {
    id: "juridico",
    title: "Jurídico",
    subtitle: "Gestão Jurídica Trabalhista",
    description: "Processos trabalhistas, audiências, provisões e análise de risco jurídico.",
    icon: Gavel,
    accentFrom: "#1B2A4A",
    accentTo: "#D4A843",
    accentGlow: "rgba(212,168,67,0.30)",
    path: "/painel",
    active: true,
    features: ["Processos Trabalhistas", "Audiências", "Provisões", "Análise de Risco"],
  },
  {
    id: "planejamento", title: "Planejamento", subtitle: "Controle de Obras",
    description: "Cronogramas, alocação de recursos e indicadores de desempenho.",
    icon: CalendarRange, accentFrom: "#8B5CF6", accentTo: "#7C3AED", accentGlow: "", path: "", active: false, features: [],
  },
  {
    id: "financeiro", title: "Financeiro", subtitle: "Gestão Financeira",
    description: "Contas a pagar e receber, fluxo de caixa e relatórios.",
    icon: DollarSign, accentFrom: "#F59E0B", accentTo: "#D97706", accentGlow: "", path: "", active: false, features: [],
  },
  {
    id: "orcamento", title: "Orçamento", subtitle: "Orçamento de Obras",
    description: "Composição de custos, BDI e propostas comerciais.",
    icon: Calculator, accentFrom: "#06B6D4", accentTo: "#0891B2", accentGlow: "", path: "", active: false, features: [],
  },
  {
    id: "compras", title: "Compras", subtitle: "Suprimentos",
    description: "Cotações, pedidos e controle de fornecedores.",
    icon: ShoppingCart, accentFrom: "#F43F5E", accentTo: "#E11D48", accentGlow: "", path: "", active: false, features: [],
  },
];

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

/* ─── Animated mesh background (CSS only) ─── */
const meshStyle = `
@keyframes meshMove {
  0%, 100% { background-position: 0% 50%; }
  25% { background-position: 100% 0%; }
  50% { background-position: 100% 100%; }
  75% { background-position: 0% 100%; }
}
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulseGlow {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}
.mesh-bg {
  background: 
    radial-gradient(ellipse 80% 50% at 20% 40%, rgba(59,130,246,0.08) 0%, transparent 70%),
    radial-gradient(ellipse 60% 60% at 80% 20%, rgba(212,168,67,0.06) 0%, transparent 70%),
    radial-gradient(ellipse 70% 50% at 50% 80%, rgba(16,185,129,0.05) 0%, transparent 70%),
    linear-gradient(135deg, #FAFBFE 0%, #F0F4F8 30%, #FAFBFE 60%, #F8F6F0 100%);
  background-size: 200% 200%;
  animation: meshMove 20s ease-in-out infinite;
}
.animate-fade-up {
  animation: fadeSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
}
.glass-card {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 
    0 0 0 1px rgba(0,0,0,0.02),
    0 4px 24px -4px rgba(0,0,0,0.06),
    0 1px 2px rgba(0,0,0,0.03);
}
.glass-card:hover {
  background: rgba(255,255,255,0.85);
  box-shadow: 
    0 0 0 1px rgba(0,0,0,0.03),
    0 8px 40px -8px rgba(0,0,0,0.10),
    0 2px 4px rgba(0,0,0,0.04);
}
.module-card {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.module-card:hover {
  transform: translateY(-6px) scale(1.01);
}
.glow-dot {
  animation: pulseGlow 3s ease-in-out infinite;
}
.float-icon {
  animation: float 4s ease-in-out infinite;
}
`;

export default function ModuleHub() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const { setActiveModule } = useModule();
  const [mounted, setMounted] = useState(false);

  const greeting = useMemo(() => getGreeting(), []);
  const formattedDate = useMemo(() => getFormattedDate(), []);
  const firstName = user?.name?.split(" ")[0] || "Usuário";

  useEffect(() => { setMounted(true); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen mesh-bg">
        <style>{meshStyle}</style>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#D4A843] flex items-center justify-center animate-pulse">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <p className="text-gray-400 text-sm font-medium">Carregando plataforma...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  const activeModules = MODULES.filter(m => m.active);
  const futureModules = MODULES.filter(m => !m.active);

  return (
    <>
      <style>{meshStyle}</style>
      <div className="min-h-screen mesh-bg">

        {/* ═══════════ HEADER - Glassmorphism ═══════════ */}
        <header className="sticky top-0 z-50" style={{
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderBottom: "1px solid rgba(255,255,255,0.4)",
          boxShadow: "0 1px 12px rgba(0,0,0,0.04)",
        }}>
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
            {/* Left - Brand */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center shadow-lg shadow-[#1B2A4A]/20">
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#D4A843] border-2 border-white glow-dot" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-[#1B2A4A] tracking-tight leading-none">ERP - Gestão Integrada</h1>
                <span className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</span>
              </div>
            </div>

            {/* Right - Controls */}
            <div className="flex items-center gap-2.5">
              {/* Company Selector */}
              <div className="flex items-center gap-2">
                {selectedCompany?.logoUrl ? (
                  <img src={selectedCompany.logoUrl} alt="" className="h-6 w-6 object-contain rounded-lg" />
                ) : (
                  <Building2 className="h-4 w-4 text-gray-300" />
                )}
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className="w-40 sm:w-52 bg-white/50 border-white/60 h-9 text-sm text-gray-600 hover:bg-white/70 rounded-xl backdrop-blur-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <div className="flex items-center gap-2">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt="" className="h-5 w-5 object-contain rounded" />
                          ) : (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          )}
                          {c.nomeFantasia || c.razaoSocial}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notification */}
              <button className="h-9 w-9 rounded-xl bg-white/50 hover:bg-white/70 backdrop-blur-sm flex items-center justify-center transition-all relative border border-white/60">
                <Bell className="h-4 w-4 text-gray-400" />
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-[#D4A843] rounded-full border-2 border-white glow-dot" />
              </button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2.5 hover:bg-white/50 rounded-xl px-2.5 py-1.5 transition-all border border-transparent hover:border-white/60">
                    <Avatar className="h-8 w-8 ring-2 ring-white/60 shadow-sm">
                      <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-[#1B2A4A] to-[#D4A843] text-white">
                        {user?.name?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:block text-left">
                      <p className="text-xs font-semibold text-gray-700 leading-none">{user?.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {user?.role === 'admin_master' ? 'Admin Master' : user?.role === 'admin' ? 'Admin' : 'Usuário'}
                      </p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-gray-300 hidden sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/painel")} className="cursor-pointer">
                    <Users className="mr-2 h-4 w-4" /> Ir ao Painel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* ═══════════ MAIN CONTENT ═══════════ */}
        <main className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10">

          {/* ──── Hero Greeting ──── */}
          <div className={`mb-12 ${mounted ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.1s' }}>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#D4A843] glow-dot" />
                  <span className="text-xs font-semibold text-[#D4A843] uppercase tracking-[0.2em]">Plataforma Corporativa</span>
                </div>
                <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2">
                  <span className="text-[#1B2A4A]">{greeting}, </span>
                  <span style={{
                    background: "linear-gradient(135deg, #1B2A4A 0%, #D4A843 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>{firstName}</span>
                </h2>
                <p className="text-gray-400 text-sm flex items-center gap-2 font-medium">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedDate}
                </p>
              </div>
              {/* Quick stat pill */}
              <div className="glass-card rounded-2xl px-5 py-3 flex items-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-[#1B2A4A]">{activeModules.length}</p>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Ativos</p>
                </div>
                <div className="h-8 w-px bg-gray-200/60" />
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-[#D4A843]">{futureModules.length}</p>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Em breve</p>
                </div>
              </div>
            </div>
          </div>

          {/* ──── Active Module Cards ──── */}
          <div className={`mb-14 ${mounted ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.25s' }}>
            <div className="flex items-center gap-3 mb-7">
              <div className="h-8 w-1 rounded-full bg-gradient-to-b from-[#1B2A4A] to-[#D4A843]" />
              <h3 className="text-lg font-bold text-[#1B2A4A]">Módulos Disponíveis</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {activeModules.map((mod, idx) => (
                <button
                  key={mod.id}
                  onClick={() => { setActiveModule(mod.id as ModuleId); navigate(mod.path); }}
                  className="module-card group relative text-left rounded-3xl overflow-hidden glass-card"
                  style={{ animationDelay: `${0.3 + idx * 0.1}s` }}
                >
                  {/* Accent glow on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-3xl pointer-events-none"
                    style={{
                      background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${mod.accentGlow} 0%, transparent 70%)`,
                    }}
                  />

                  {/* Top accent bar */}
                  <div className="h-1.5 w-full" style={{
                    background: `linear-gradient(90deg, ${mod.accentFrom}, ${mod.accentTo})`,
                  }} />

                  <div className="relative p-6 pb-5">
                    {/* Icon + Title Row */}
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-4">
                        {/* Floating icon with glow */}
                        <div className="relative float-icon" style={{ animationDelay: `${idx * 0.5}s` }}>
                          <div
                            className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg"
                            style={{
                              background: `linear-gradient(135deg, ${mod.accentFrom}, ${mod.accentTo})`,
                              boxShadow: `0 8px 24px -4px ${mod.accentGlow}`,
                            }}
                          >
                            <mod.icon className="h-7 w-7 text-white" />
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xl font-extrabold text-[#1B2A4A] tracking-tight group-hover:text-[#1B2A4A] transition-colors">
                            {mod.title}
                          </h4>
                          <p className="text-xs text-gray-400 font-medium mt-0.5">{mod.subtitle}</p>
                        </div>
                      </div>
                      {/* Arrow */}
                      <div
                        className="h-10 w-10 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:translate-x-0 -translate-x-2"
                        style={{
                          background: `linear-gradient(135deg, ${mod.accentFrom}, ${mod.accentTo})`,
                          boxShadow: `0 4px 12px -2px ${mod.accentGlow}`,
                        }}
                      >
                        <ArrowUpRight className="h-5 w-5 text-white" />
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-500 leading-relaxed mb-5">{mod.description}</p>

                    {/* Feature chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {mod.features.slice(0, 4).map(f => (
                        <span
                          key={f}
                          className="text-[10px] font-semibold px-3 py-1.5 rounded-full transition-colors duration-300"
                          style={{
                            color: mod.accentFrom,
                            background: `${mod.accentFrom}10`,
                            border: `1px solid ${mod.accentFrom}18`,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                      {mod.features.length > 4 && (
                        <span className="text-[10px] font-semibold text-gray-300 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                          +{mod.features.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ──── Future Modules ──── */}
          <div className={`mb-8 ${mounted ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center gap-3 mb-7">
              <div className="h-8 w-1 rounded-full bg-gradient-to-b from-gray-300 to-gray-200" />
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Em Desenvolvimento</h3>
              <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {futureModules.map((mod, idx) => (
                <div
                  key={mod.id}
                  className="relative glass-card rounded-2xl p-5 text-center group cursor-default"
                  style={{ opacity: 0.7 }}
                >
                  <Lock className="absolute top-3 right-3 h-3 w-3 text-gray-200" />
                  <div
                    className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3 opacity-40"
                    style={{
                      background: `linear-gradient(135deg, ${mod.accentFrom}15, ${mod.accentTo}10)`,
                    }}
                  >
                    <mod.icon className="h-5 w-5" style={{ color: mod.accentFrom }} />
                  </div>
                  <h4 className="text-sm font-bold text-gray-400 mb-0.5">{mod.title}</h4>
                  <p className="text-[10px] text-gray-300 mb-3">{mod.subtitle}</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#D4A843]/60 bg-[#D4A843]/8 px-3 py-1 rounded-full uppercase tracking-wider">
                    <Zap className="h-2.5 w-2.5" />
                    Em breve
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ═══════════ FOOTER ═══════════ */}
        <footer className="py-6 mt-auto">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center shadow-sm">
                <Layers className="h-3 w-3 text-white" />
              </div>
              <p className="text-xs text-gray-400 font-medium">ERP - Gestão Integrada</p>
            </div>
            <p className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</p>
          </div>
        </footer>
      </div>
    </>
  );
}
