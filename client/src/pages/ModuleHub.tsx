import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule, ModuleId } from "@/contexts/ModuleContext";
import { APP_VERSION } from "../../../shared/version";
import { trpc } from "@/lib/trpc";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Lock, Building2, LogOut, ChevronDown, LayoutGrid,
  Bell, Search, Clock, TrendingUp, AlertTriangle, CheckCircle2,
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
import { useState, useMemo } from "react";

const BG_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/GQvMMwSzLAaNgkun.png";

type Module = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  gradient: string;
  lightBg: string;
  iconColor: string;
  statLabel: string;
  statIcon: any;
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
    gradient: "from-blue-500 via-blue-600 to-indigo-700",
    lightBg: "bg-blue-50",
    iconColor: "text-blue-600",
    statLabel: "Colaboradores",
    statIcon: Users,
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
    gradient: "from-emerald-500 via-emerald-600 to-teal-700",
    lightBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    statLabel: "EPIs Cadastrados",
    statIcon: Shield,
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
    gradient: "from-[#1B2A4A] via-[#243658] to-[#2C3E6A]",
    lightBg: "bg-slate-50",
    iconColor: "text-[#1B2A4A]",
    statLabel: "Processos",
    statIcon: Gavel,
    path: "/painel",
    active: true,
    features: ["Processos Trabalhistas", "Audiências", "Provisões", "Análise de Risco"],
  },
  {
    id: "planejamento",
    title: "Planejamento",
    subtitle: "Controle de Obras",
    description: "Cronogramas, alocação de recursos e indicadores de desempenho.",
    icon: CalendarRange,
    gradient: "from-purple-500 to-purple-700",
    lightBg: "bg-purple-50",
    iconColor: "text-purple-600",
    statLabel: "",
    statIcon: CalendarRange,
    path: "",
    active: false,
    features: [],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    subtitle: "Gestão Financeira",
    description: "Contas a pagar e receber, fluxo de caixa e relatórios.",
    icon: DollarSign,
    gradient: "from-amber-500 to-amber-700",
    lightBg: "bg-amber-50",
    iconColor: "text-amber-600",
    statLabel: "",
    statIcon: DollarSign,
    path: "",
    active: false,
    features: [],
  },
  {
    id: "orcamento",
    title: "Orçamento",
    subtitle: "Orçamento de Obras",
    description: "Composição de custos, BDI e propostas comerciais.",
    icon: Calculator,
    gradient: "from-cyan-500 to-cyan-700",
    lightBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
    statLabel: "",
    statIcon: Calculator,
    path: "",
    active: false,
    features: [],
  },
  {
    id: "compras",
    title: "Compras",
    subtitle: "Suprimentos",
    description: "Cotações, pedidos e controle de fornecedores.",
    icon: ShoppingCart,
    gradient: "from-rose-500 to-rose-700",
    lightBg: "bg-rose-50",
    iconColor: "text-rose-600",
    statLabel: "",
    statIcon: ShoppingCart,
    path: "",
    active: false,
    features: [],
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ModuleHub() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const { setActiveModule } = useModule();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);

  const greeting = useMemo(() => getGreeting(), []);
  const formattedDate = useMemo(() => getFormattedDate(), []);
  const firstName = user?.name?.split(" ")[0] || "Usuário";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFBFC]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#1B2A4A] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Carregando...</p>
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
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* ============ HEADER ============ */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          {/* Left - Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center shadow-sm">
              <LayoutGrid className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#1B2A4A] tracking-tight leading-none">ERP - Gestão Integrada</h1>
              <span className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</span>
            </div>
          </div>

          {/* Right - Controls */}
          <div className="flex items-center gap-3">
            {/* Company Selector */}
            <div className="flex items-center gap-2">
              {selectedCompany?.logoUrl ? (
                <img src={selectedCompany.logoUrl} alt="" className="h-6 w-6 object-contain rounded" />
              ) : (
                <Building2 className="h-4 w-4 text-gray-300" />
              )}
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-40 sm:w-52 bg-gray-50/80 border-gray-200/80 h-9 text-sm text-gray-600 hover:bg-gray-100/80 rounded-lg">
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

            {/* Notification bell */}
            <button className="h-9 w-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors relative">
              <Bell className="h-4 w-4 text-gray-400" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-[#D4A843] rounded-full" />
            </button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 hover:bg-gray-50 rounded-lg px-2.5 py-1.5 transition-colors">
                  <Avatar className="h-8 w-8 ring-2 ring-gray-100">
                    <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] text-white">
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
                  <Users className="mr-2 h-4 w-4" />
                  <span>Ir ao Painel</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ============ MAIN CONTENT ============ */}
      <main className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10">

        {/* ---- Greeting Section ---- */}
        <div className="mb-10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1B2A4A] tracking-tight mb-1">
                {greeting}, <span className="text-[#D4A843]">{firstName}</span>
              </h2>
              <p className="text-gray-400 text-sm flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                {formattedDate}
              </p>
            </div>
          </div>
        </div>

        {/* ---- Quick Stats Row ---- */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Empresa Ativa", value: selectedCompany?.nomeFantasia || "—", icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Módulos Ativos", value: `${activeModules.length}`, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Em Desenvolvimento", value: `${futureModules.length}`, icon: TrendingUp, color: "text-[#D4A843]", bg: "bg-amber-50" },
            { label: "Alertas", value: "—", icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100/80 p-4 flex items-center gap-3.5 hover:shadow-sm transition-shadow">
              <div className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 leading-none mb-1">{stat.label}</p>
                <p className="text-sm font-bold text-[#1B2A4A] truncate">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ---- Section Title ---- */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-[#1B2A4A]">Módulos Disponíveis</h3>
          <span className="text-xs text-gray-300 font-medium">{activeModules.length} ativos</span>
        </div>

        {/* ---- Active Module Cards ---- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {activeModules.map(mod => {
            const isHovered = hoveredModule === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => { setActiveModule(mod.id as ModuleId); navigate(mod.path); }}
                onMouseEnter={() => setHoveredModule(mod.id)}
                onMouseLeave={() => setHoveredModule(null)}
                className="group relative text-left rounded-2xl overflow-hidden bg-white border border-gray-100/80 hover:shadow-xl hover:shadow-gray-200/60 transition-all duration-500 hover:-translate-y-1"
              >
                {/* Gradient Header */}
                <div className={`relative bg-gradient-to-br ${mod.gradient} px-6 pt-6 pb-16 overflow-hidden`}>
                  {/* Decorative elements */}
                  <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/[0.07]" />
                  <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/[0.05]" />
                  <div className="absolute top-1/2 right-1/4 w-40 h-40 rounded-full bg-white/[0.03]" />

                  {/* Icon */}
                  <div className="relative z-10 h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                    <mod.icon className="h-6 w-6 text-white" />
                  </div>

                  {/* Title */}
                  <h4 className="relative z-10 text-2xl font-bold text-white mb-1 tracking-tight">{mod.title}</h4>
                  <p className="relative z-10 text-white/50 text-xs font-medium">{mod.subtitle}</p>
                </div>

                {/* White Body */}
                <div className="relative px-6 pt-5 pb-5 -mt-8">
                  {/* White overlap card effect */}
                  <div className="bg-white rounded-xl border border-gray-100/60 shadow-sm p-4 mb-4">
                    <p className="text-sm text-gray-500 leading-relaxed">{mod.description}</p>
                  </div>

                  {/* Feature tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {mod.features.slice(0, 4).map(f => (
                      <span key={f} className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100/60">
                        {f}
                      </span>
                    ))}
                    {mod.features.length > 4 && (
                      <span className="text-[10px] font-medium text-gray-300 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100/60">
                        +{mod.features.length - 4}
                      </span>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1B2A4A] group-hover:text-blue-600 transition-colors">
                      Acessar módulo
                    </span>
                    <div className="h-8 w-8 rounded-full bg-gray-50 group-hover:bg-[#1B2A4A] flex items-center justify-center transition-all duration-300">
                      <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-white transition-colors duration-300" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ---- Future Modules ---- */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Em Desenvolvimento</h3>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {futureModules.map(mod => (
              <div
                key={mod.id}
                className="relative bg-white rounded-2xl border border-dashed border-gray-200 p-5 text-center hover:border-gray-300 transition-all group"
              >
                <Lock className="absolute top-3 right-3 h-3 w-3 text-gray-200" />
                <div className={`h-12 w-12 rounded-xl ${mod.lightBg} flex items-center justify-center ${mod.iconColor} mx-auto mb-3 opacity-60`}>
                  <mod.icon className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-bold text-gray-400 mb-0.5">{mod.title}</h4>
                <p className="text-[10px] text-gray-300 mb-3">{mod.subtitle}</p>
                <span className="inline-block text-[9px] font-bold text-[#D4A843]/70 bg-[#D4A843]/8 px-3 py-1 rounded-full uppercase tracking-wider">
                  Em breve
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-gray-100 py-5 bg-white mt-auto">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] flex items-center justify-center">
              <LayoutGrid className="h-2.5 w-2.5 text-white" />
            </div>
            <p className="text-xs text-gray-400 font-medium">ERP - Gestão Integrada</p>
          </div>
          <p className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</p>
        </div>
      </footer>
    </div>
  );
}
