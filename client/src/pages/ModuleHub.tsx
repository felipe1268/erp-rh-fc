import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule, ModuleId } from "@/contexts/ModuleContext";
import { useModuleConfig } from "@/contexts/ModuleConfigContext";
import { APP_VERSION } from "../../../shared/version";
import { trpc } from "@/lib/trpc";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Lock, Building2, LogOut, ChevronDown, LayoutGrid,
  Bell, Clock, Zap, Layers, ArrowUpRight, ClipboardCheck,
  Handshake, TrendingUp, Home, Ruler, BookOpen, FileSignature,
  HardHat, Warehouse, Wrench, FolderOpen, BarChart3,
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
import { usePermissions } from "@/contexts/PermissionsContext";
import { MODULE_DEFINITIONS } from "../../../shared/modules";

/* ─── Robot image URL ─── */
const ROBOT_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/XtVAYezVwPtXCXyB.png";

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
  iconBg: string;
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
    iconBg: "rgba(59,130,246,0.12)",
    path: "/painel/rh",
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
    iconBg: "rgba(16,185,129,0.12)",
    path: "/painel/sst",
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
    iconBg: "rgba(27,42,74,0.12)",
    path: "/painel/juridico",
    active: true,
    features: ["Processos Trabalhistas", "Audiências", "Provisões", "Análise de Risco"],
  },
  {
    id: "avaliacao",
    title: "Avaliação",
    subtitle: "Avaliação de Desempenho",
    description: "Questionários personalizáveis, ciclos de avaliação, ranking de desempenho e análise de competências.",
    icon: ClipboardCheck,
    accentFrom: "#F59E0B",
    accentTo: "#D97706",
    accentGlow: "rgba(245,158,11,0.35)",
    iconBg: "rgba(245,158,11,0.12)",
    path: "/avaliacao-desempenho",
    active: true,
    features: ["Questionários", "Ciclos de Avaliação", "Ranking", "Relatórios", "Competências"],
  },
  {
    id: "terceiros",
    title: "Terceiros",
    subtitle: "Gestão de Empresas Terceirizadas",
    description: "Cadastro, documentação, obrigações mensais, aptidão e conformidade de empresas terceirizadas.",
    icon: HardHat,
    accentFrom: "#EA580C",
    accentTo: "#C2410C",
    accentGlow: "rgba(234,88,12,0.35)",
    iconBg: "rgba(234,88,12,0.12)",
    path: "/terceiros/painel",
    active: true,
    features: ["Empresas Terceiras", "Funcionários", "Obrigações Mensais", "Conformidade", "Crachás"],
  },
  {
    id: "parceiros",
    title: "Parceiros",
    subtitle: "Portal de Convênios",
    description: "Farmácia, posto, restaurante e outros convênios com lançamentos, aprovações e guia de descontos.",
    icon: Handshake,
    accentFrom: "#7C3AED",
    accentTo: "#6D28D9",
    accentGlow: "rgba(124,58,237,0.35)",
    iconBg: "rgba(124,58,237,0.12)",
    path: "/parceiros/painel",
    active: true,
    features: ["Parceiros Conveniados", "Lançamentos", "Aprovações RH", "Guia de Descontos", "Pagamentos"],
  },
  {
    id: "planejamento", title: "Planejamento", subtitle: "Controle de Obras",
    description: "Cronogramas, alocação de recursos e indicadores de desempenho.",
    icon: CalendarRange, accentFrom: "#8B5CF6", accentTo: "#7C3AED", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "financeiro", title: "Financeiro", subtitle: "Gestão Financeira",
    description: "Contas a pagar e receber, fluxo de caixa e relatórios.",
    icon: DollarSign, accentFrom: "#F59E0B", accentTo: "#D97706", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "orcamento", title: "Orçamento", subtitle: "Orçamento de Obras",
    description: "Composição de custos, BDI e propostas comerciais.",
    icon: Calculator, accentFrom: "#06B6D4", accentTo: "#0891B2", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "compras", title: "Compras", subtitle: "Suprimentos",
    description: "Cotações, pedidos e controle de fornecedores.",
    icon: ShoppingCart, accentFrom: "#F43F5E", accentTo: "#E11D48", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "crm", title: "CRM", subtitle: "Gestão de Relacionamento",
    description: "Gestão de leads, clientes, oportunidades e funil de vendas.",
    icon: Handshake, accentFrom: "#6366F1", accentTo: "#4F46E5", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "comercial", title: "Comercial", subtitle: "Gestão Comercial",
    description: "Propostas, contratos comerciais, metas e comissões.",
    icon: TrendingUp, accentFrom: "#14B8A6", accentTo: "#0D9488", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "pos-obras", title: "Pós-Obras", subtitle: "Pós-Entrega",
    description: "Acompanhamento pós-entrega, garantias e satisfação do cliente.",
    icon: Home, accentFrom: "#EC4899", accentTo: "#DB2777", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "medicao-obras", title: "Medição de Obras", subtitle: "Medições Físicas e Financeiras",
    description: "Controle de medições por etapa, faturamento e acompanhamento de cronograma.",
    icon: Ruler, accentFrom: "#8B5CF6", accentTo: "#6D28D9", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "diario-obras", title: "Diário de Obras", subtitle: "Registro Diário",
    description: "Registro diário de atividades, clima, equipe e ocorrências por obra.",
    icon: BookOpen, accentFrom: "#0EA5E9", accentTo: "#0284C7", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "gestao-contratos", title: "Gestão de Contratos", subtitle: "Contratos e Aditivos",
    description: "Controle de contratos com clientes, subempreiteiros e fornecedores.",
    icon: FileSignature, accentFrom: "#1B2A4A", accentTo: "#374A6E", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },

  {
    id: "almoxarifado", title: "Almoxarifado", subtitle: "Estoque de Obra",
    description: "Controle de materiais por obra, requisições e transferências entre obras.",
    icon: Warehouse, accentFrom: "#78716C", accentTo: "#57534E", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "assistencia-tecnica", title: "Assistência Técnica", subtitle: "Chamados Técnicos",
    description: "Chamados técnicos de clientes, vícios construtivos e controle de garantias.",
    icon: Wrench, accentFrom: "#DC2626", accentTo: "#B91C1C", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "documentacao-obra", title: "Documentação de Obra", subtitle: "GED - Gestão de Documentos",
    description: "Projetos, ARTs, licenças, alvarás e documentos organizados por obra.",
    icon: FolderOpen, accentFrom: "#A855F7", accentTo: "#9333EA", accentGlow: "", iconBg: "", path: "", active: false, features: [],
  },
  {
    id: "indicadores-bi", title: "Indicadores / BI", subtitle: "Business Intelligence",
    description: "Dashboard executivo consolidando dados de todas as obras (custo previsto vs realizado).",
    icon: BarChart3, accentFrom: "#D4A843", accentTo: "#B8922E", accentGlow: "", iconBg: "", path: "", active: false, features: [],
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

/* ─── Styles ─── */
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
@keyframes pulseGlow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes floatRobot {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-12px); }
}
@keyframes waveFlow {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.hub-mesh-bg {
  background: 
    radial-gradient(ellipse 90% 60% at 15% 50%, rgba(59,130,246,0.06) 0%, transparent 70%),
    radial-gradient(ellipse 50% 50% at 85% 30%, rgba(212,168,67,0.05) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% 90%, rgba(16,185,129,0.04) 0%, transparent 70%),
    linear-gradient(160deg, #FAFBFE 0%, #F4F6FA 25%, #FAFBFE 50%, #F9F7F2 75%, #FAFBFE 100%);
  background-size: 200% 200%;
  animation: meshDrift 25s ease-in-out infinite;
}
.hub-animate-up {
  animation: fadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
}
.hub-animate-right {
  animation: fadeSlideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
}
.hub-glass {
  background: rgba(255,255,255,0.70);
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid rgba(255,255,255,0.55);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.02), 0 4px 24px -4px rgba(0,0,0,0.06);
}
.hub-glass:hover {
  background: rgba(255,255,255,0.88);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.03), 0 12px 48px -8px rgba(0,0,0,0.12);
}
.hub-module-card {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}
.hub-module-card:hover {
  transform: translateY(-4px) scale(1.015);
}
.hub-glow-dot {
  animation: pulseGlow 3s ease-in-out infinite;
}
.hub-robot-float {
  animation: floatRobot 5s ease-in-out infinite;
}
.hub-wave-line {
  background: linear-gradient(90deg, transparent, rgba(212,168,67,0.15), rgba(59,130,246,0.10), transparent);
  background-size: 200% 100%;
  animation: waveFlow 8s linear infinite;
}
`;

export default function ModuleHub() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const { setActiveModule } = useModule();
  const { isModuleEnabled } = useModuleConfig();
  const { hasGroup, groupCanAccessRoute, isAdminMaster } = usePermissions();
  const [mounted, setMounted] = useState(false);

  const greeting = useMemo(() => getGreeting(), []);
  const formattedDate = useMemo(() => getFormattedDate(), []);
  const firstName = user?.name?.split(" ")[0] || "Usuário";

  useEffect(() => { setMounted(true); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen hub-mesh-bg">
        <style>{hubStyles}</style>
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#D4A843] flex items-center justify-center animate-pulse shadow-lg">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <p className="text-gray-400 text-sm font-medium">Carregando plataforma...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  // Mapeia module id do hub para module_key do banco
  const hubToConfigKey: Record<string, string> = {
    "rh-dp": "rh", "sst": "sst", "juridico": "juridico",
    "avaliacao": "avaliacao", "terceiros": "terceiros", "parceiros": "parceiros",
  };
  // Filtrar módulos: habilitados no config E acessíveis pelo grupo do usuário
  const activeModules = MODULES.filter(m => {
    if (!m.active) return false;
    if (!isModuleEnabled(hubToConfigKey[m.id] ?? m.id)) return false;
    // Se o usuário pertence a um grupo (e não é admin_master), filtrar por permissões do grupo
    if (hasGroup && !isAdminMaster) {
      // Verificar se o grupo tem acesso a pelo menos uma rota deste módulo
      const modDef = MODULE_DEFINITIONS.find(md => md.id === m.id);
      if (modDef) {
        const hasAnyRoute = modDef.features.some(f => groupCanAccessRoute(f.route));
        if (!hasAnyRoute) return false;
      }
    }
    return true;
  });
  const disabledModules = MODULES.filter(m => m.active && !isModuleEnabled(hubToConfigKey[m.id] ?? m.id));
  const futureModules = [...MODULES.filter(m => !m.active), ...disabledModules.map(m => ({ ...m, active: false }))];

  return (
    <>
      <style>{hubStyles}</style>
      <div className="min-h-screen hub-mesh-bg relative overflow-hidden">

        {/* ═══════════ DECORATIVE WAVE LINES ═══════════ */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="hub-wave-line absolute top-[35%] left-0 right-0 h-[1px]" />
          <div className="hub-wave-line absolute top-[55%] left-0 right-0 h-[1px]" style={{ animationDelay: '-3s' }} />
          <div className="hub-wave-line absolute top-[75%] left-0 right-0 h-[1px]" style={{ animationDelay: '-6s' }} />
        </div>

        {/* ═══════════ HEADER ═══════════ */}
        <header className="sticky top-0 z-50" style={{
          background: "rgba(255,255,255,0.60)",
          backdropFilter: "blur(28px) saturate(1.8)",
          WebkitBackdropFilter: "blur(28px) saturate(1.8)",
          borderBottom: "1px solid rgba(255,255,255,0.4)",
          boxShadow: "0 1px 12px rgba(0,0,0,0.03)",
        }}>
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center shadow-lg shadow-[#1B2A4A]/20">
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#D4A843] border-2 border-white hub-glow-dot" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-[#1B2A4A] tracking-tight leading-none">ERP - Gestão Integrada</h1>
                <span className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
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

              <button className="h-9 w-9 rounded-xl bg-white/50 hover:bg-white/70 backdrop-blur-sm flex items-center justify-center transition-all relative border border-white/60">
                <Bell className="h-4 w-4 text-gray-400" />
              </button>

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

        {/* ═══════════ HERO SECTION - Robot + Title + Modules ═══════════ */}
        <main className="relative max-w-[1440px] mx-auto px-6 lg:px-10">

          {/* ──── HERO ROW: Robot Left | Content Right ──── */}
          <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-0 pt-6 lg:pt-4">

            {/* LEFT: Robot Image - HIDDEN on mobile, visible on lg+ */}
            <div
              className={`relative flex-shrink-0 hidden lg:block lg:w-[400px] ${mounted ? 'hub-animate-right' : 'opacity-0'}`}
              style={{ animationDelay: '0.1s' }}
            >
              <div className="hub-robot-float">
                <img
                  src={ROBOT_IMG}
                  alt="Assistente IA FC Engenharia"
                  className="w-full h-auto object-contain drop-shadow-2xl"
                  style={{
                    filter: "drop-shadow(0 20px 40px rgba(27,42,74,0.15))",
                    maxHeight: "520px",
                  }}
                />
              </div>
              {/* Glow under robot */}
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[30px] rounded-full blur-2xl"
                style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.15), transparent)" }}
              />
            </div>

            {/* RIGHT: Title + Module Cards */}
            <div className="flex-1 lg:pl-4 w-full">

              {/* ERP Watermark */}
              <div className="relative">
                <span
                  className="absolute -top-6 right-0 text-[120px] sm:text-[160px] lg:text-[200px] font-black leading-none pointer-events-none select-none"
                  style={{ color: "rgba(27,42,74,0.04)" }}
                >
                  ERP
                </span>
              </div>

              {/* Greeting */}
              <div className={`mb-4 relative z-10 ${mounted ? 'hub-animate-up' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#D4A843] hub-glow-dot" />
                  <span className="text-[10px] font-bold text-[#D4A843] uppercase tracking-[0.25em]">Plataforma Corporativa</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                  <span className="text-[#1B2A4A]">Gestão</span>
                  <br />
                  <span style={{
                    background: "linear-gradient(135deg, #1B2A4A 0%, #D4A843 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>Integrada</span>
                </h2>
                <div className="flex items-center gap-3 mt-3">
                  <p className="text-gray-400 text-sm flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    {greeting}, <span className="text-[#1B2A4A] font-semibold">{firstName}</span>
                  </p>
                  <span className="text-gray-200">|</span>
                  <p className="text-gray-300 text-xs">{formattedDate}</p>
                </div>
              </div>

              {/* Module Cards - Stacked */}
              <div className="flex flex-col gap-3 mt-6 relative z-10">
                {activeModules.map((mod, idx) => (
                  <button
                    key={mod.id}
                    onClick={() => { setActiveModule(mod.id as ModuleId); navigate(mod.path); }}
                    className={`hub-module-card group relative text-left rounded-2xl overflow-hidden hub-glass w-full ${mounted ? 'hub-animate-up' : 'opacity-0'}`}
                    style={{ animationDelay: `${0.3 + idx * 0.12}s` }}
                  >
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse 60% 80% at 0% 50%, ${mod.accentGlow} 0%, transparent 70%)`,
                      }}
                    />

                    {/* Left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{
                      background: `linear-gradient(180deg, ${mod.accentFrom}, ${mod.accentTo})`,
                    }} />

                    <div className="relative flex items-center gap-4 px-5 py-4 pl-6">
                      {/* Icon */}
                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                        style={{
                          background: `linear-gradient(135deg, ${mod.accentFrom}, ${mod.accentTo})`,
                          boxShadow: `0 6px 20px -4px ${mod.accentGlow}`,
                        }}
                      >
                        <mod.icon className="h-6 w-6 text-white" />
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-[#1B2A4A] tracking-tight">{mod.title}</h4>
                          <span className="text-[10px] text-gray-300 font-medium hidden sm:inline">{mod.subtitle}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{mod.description}</p>
                      </div>

                      {/* Arrow */}
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 opacity-40 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1"
                        style={{
                          background: `linear-gradient(135deg, ${mod.accentFrom}15, ${mod.accentTo}10)`,
                        }}
                      >
                        <ArrowRight className="h-4 w-4" style={{ color: mod.accentFrom }} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ──── FUTURE MODULES ──── */}
          <div className={`mt-10 mb-10 ${mounted ? 'hub-animate-up' : 'opacity-0'}`} style={{ animationDelay: '0.7s' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-6 w-1 rounded-full bg-gradient-to-b from-gray-300 to-gray-200" />
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Em Desenvolvimento</h3>
              <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {futureModules.map((mod) => (
                <div
                  key={mod.id}
                  className="relative hub-glass rounded-2xl p-4 text-center cursor-default"
                  style={{ opacity: 0.65 }}
                >
                  <Lock className="absolute top-2.5 right-2.5 h-3 w-3 text-gray-200" />
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mx-auto mb-2 opacity-40"
                    style={{
                      background: `linear-gradient(135deg, ${mod.accentFrom}15, ${mod.accentTo}10)`,
                    }}
                  >
                    <mod.icon className="h-5 w-5" style={{ color: mod.accentFrom }} />
                  </div>
                  <h4 className="text-xs font-bold text-gray-400 mb-0.5">{mod.title}</h4>
                  <p className="text-[9px] text-gray-300 mb-2">{mod.subtitle}</p>
                  <span className="inline-flex items-center gap-1 text-[8px] font-bold text-[#D4A843]/60 bg-[#D4A843]/8 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    <Zap className="h-2 w-2" />
                    Em breve
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ═══════════ FOOTER ═══════════ */}
        <footer className="py-5 relative z-10">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-2">
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
