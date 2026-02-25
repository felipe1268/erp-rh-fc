import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule, ModuleId } from "@/contexts/ModuleContext";
import { APP_VERSION } from "../../../shared/version";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Lock, Sparkles, Building2, LogOut, ChevronDown, HardHat,
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

const BG_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/sAcAfLCNMSdhyqJT.jpg";
const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";

type Module = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  color: string;
  iconBg: string;
  glowColor: string;
  path: string;
  active: boolean;
  features: string[];
};

const MODULES: Module[] = [
  {
    id: "rh-dp",
    title: "RH & DP",
    subtitle: "Recursos Humanos e Departamento Pessoal",
    description: "Gestão completa de colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios e documentação trabalhista.",
    icon: Users,
    color: "text-blue-400",
    iconBg: "from-blue-500/20 to-blue-600/10",
    glowColor: "group-hover:shadow-blue-500/20",
    path: "/painel",
    active: true,
    features: ["Colaboradores", "Folha de Pagamento", "Ponto Eletrônico", "Férias & Aviso Prévio", "Contratos PJ", "Vale Alimentação"],
  },
  {
    id: "sst",
    title: "SST",
    subtitle: "Segurança e Saúde do Trabalho",
    description: "Controle de EPIs, ASOs, CIPA, treinamentos de segurança e conformidade com normas regulamentadoras.",
    icon: Shield,
    color: "text-emerald-400",
    iconBg: "from-emerald-500/20 to-emerald-600/10",
    glowColor: "group-hover:shadow-emerald-500/20",
    path: "/painel",
    active: true,
    features: ["Controle de EPIs", "ASOs", "CIPA", "Base CAEPI", "Documentos SST"],
  },
  {
    id: "juridico",
    title: "Jurídico",
    subtitle: "Gestão Jurídica Trabalhista",
    description: "Acompanhamento de processos trabalhistas, audiências, provisões e análise de risco jurídico.",
    icon: Gavel,
    color: "text-slate-300",
    iconBg: "from-slate-400/20 to-slate-500/10",
    glowColor: "group-hover:shadow-slate-400/20",
    path: "/painel",
    active: true,
    features: ["Processos Trabalhistas", "Audiências", "Provisões", "Análise de Risco"],
  },
  {
    id: "planejamento",
    title: "Planejamento",
    subtitle: "Planejamento e Controle de Obras",
    description: "Cronogramas, alocação de recursos, acompanhamento físico-financeiro e indicadores de desempenho de obras.",
    icon: CalendarRange,
    color: "text-purple-400",
    iconBg: "from-purple-500/20 to-purple-600/10",
    glowColor: "",
    path: "",
    active: false,
    features: ["Cronogramas", "Alocação de Recursos", "Acompanhamento Físico-Financeiro"],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    subtitle: "Gestão Financeira",
    description: "Contas a pagar e receber, fluxo de caixa, conciliação bancária e relatórios financeiros.",
    icon: DollarSign,
    color: "text-amber-400",
    iconBg: "from-amber-500/20 to-amber-600/10",
    glowColor: "",
    path: "",
    active: false,
    features: ["Contas a Pagar/Receber", "Fluxo de Caixa", "Conciliação Bancária"],
  },
  {
    id: "orcamento",
    title: "Orçamento",
    subtitle: "Orçamento de Obras",
    description: "Composição de custos, BDI, curva ABC, comparativo de preços e geração de propostas comerciais.",
    icon: Calculator,
    color: "text-cyan-400",
    iconBg: "from-cyan-500/20 to-cyan-600/10",
    glowColor: "",
    path: "",
    active: false,
    features: ["Composição de Custos", "BDI", "Curva ABC", "Propostas"],
  },
  {
    id: "compras",
    title: "Compras",
    subtitle: "Gestão de Compras e Suprimentos",
    description: "Cotações, pedidos de compra, controle de fornecedores, estoque de materiais e aprovações.",
    icon: ShoppingCart,
    color: "text-rose-400",
    iconBg: "from-rose-500/20 to-rose-600/10",
    glowColor: "",
    path: "",
    active: false,
    features: ["Cotações", "Pedidos de Compra", "Fornecedores", "Estoque"],
  },
];

export default function ModuleHub() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const { setActiveModule } = useModule();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A1628]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#D4A843] border-t-transparent rounded-full animate-spin" />
          <p className="text-blue-200/70 text-sm">Carregando...</p>
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
    <div className="min-h-screen text-white relative">
      {/* Full-screen cinematic background */}
      <div className="fixed inset-0 -z-10">
        <img
          src={BG_URL}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A1628]/90 via-[#0F1D36]/85 to-[#0A1628]/95" />
      </div>

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0A1628]/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_URL}
              alt="FC Engenharia"
              className="h-10 object-contain"
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold tracking-tight text-[#D4A843]">FC Gestão Integrada</h1>
              <p className="text-[10px] text-blue-300/40 font-mono">{APP_VERSION}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Company Selector */}
            <div className="flex items-center gap-2">
              {selectedCompany?.logoUrl ? (
                <img src={selectedCompany.logoUrl} alt="" className="h-7 w-7 object-contain rounded" />
              ) : (
                <Building2 className="h-4 w-4 text-blue-300/50" />
              )}
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-40 sm:w-52 bg-white/[0.05] border-white/[0.08] h-9 text-sm text-white hover:bg-white/[0.08]">
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

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-white/[0.05] rounded-lg px-2 py-1.5 transition-colors">
                  <Avatar className="h-8 w-8 border border-white/20">
                    <AvatarFallback className="text-xs font-medium bg-gradient-to-br from-[#D4A843] to-[#B8922F] text-[#0F1729]">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-medium text-white/90 leading-none">{user?.name}</p>
                    <p className="text-[10px] text-blue-300/40 mt-0.5">
                      {user?.role === 'admin_master' ? 'Admin Master' : user?.role === 'admin' ? 'Admin' : 'Usuário'}
                    </p>
                  </div>
                  <ChevronDown className="h-3 w-3 text-white/40 hidden sm:block" />
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

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[#D4A843]/[0.03] rounded-full blur-[150px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10 text-center">
          <div className="inline-flex items-center gap-2 bg-[#D4A843]/10 backdrop-blur-sm border border-[#D4A843]/20 rounded-full px-4 py-1.5 mb-6">
            <HardHat className="h-3.5 w-3.5 text-[#D4A843]" />
            <span className="text-[#D4A843] text-xs font-semibold tracking-wide">PLATAFORMA ERP CORPORATIVA</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight">
            Bem-vindo ao{" "}
            <span className="bg-gradient-to-r from-[#D4A843] via-[#E8C76A] to-[#D4A843] bg-clip-text text-transparent">
              FC Gestão Integrada
            </span>
          </h2>
          <p className="mt-4 text-blue-200/50 text-sm sm:text-base max-w-2xl mx-auto">
            Plataforma unificada de gestão empresarial para engenharia civil.
            Selecione um módulo para começar.
          </p>
        </div>
      </section>

      {/* Active Modules */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <h3 className="text-xs font-semibold text-blue-300/40 uppercase tracking-wider mb-5 flex items-center gap-2">
          <div className="h-px flex-1 max-w-[40px] bg-blue-300/20" />
          Módulos Ativos
          <div className="h-px flex-1 max-w-[40px] bg-blue-300/20" />
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeModules.map(mod => (
            <button
              key={mod.id}
              onClick={() => { setActiveModule(mod.id as ModuleId); navigate(mod.path); }}
              className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-7 text-left transition-all duration-500 hover:bg-white/[0.07] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-2xl ${mod.glowColor}`}
            >
              {/* Subtle glow effect */}
              <div className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${mod.iconBg} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-5">
                  <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${mod.iconBg} flex items-center justify-center ${mod.color} group-hover:scale-110 transition-transform duration-500 border border-white/[0.06]`}>
                    <mod.icon className="h-7 w-7" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-white/10 group-hover:text-[#D4A843] group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <h4 className="text-xl font-bold text-white mb-1">{mod.title}</h4>
                <p className="text-xs text-blue-300/40 mb-3">{mod.subtitle}</p>
                <p className="text-sm text-blue-200/40 leading-relaxed mb-5">{mod.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {mod.features.map(f => (
                    <span key={f} className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] text-blue-200/40 border border-white/[0.04] group-hover:bg-white/[0.06] group-hover:text-blue-200/60 transition-colors">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Future Modules */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-px flex-1 max-w-[40px] bg-blue-300/10" />
          <h3 className="text-xs font-semibold text-blue-300/30 uppercase tracking-wider flex items-center gap-2">
            Em Desenvolvimento
            <Sparkles className="h-3.5 w-3.5 text-[#D4A843]/40" />
          </h3>
          <div className="h-px flex-1 max-w-[40px] bg-blue-300/10" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {futureModules.map(mod => (
            <div
              key={mod.id}
              className="relative overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm p-5 opacity-50"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${mod.iconBg} flex items-center justify-center ${mod.color}`}>
                  <mod.icon className="h-5 w-5" />
                </div>
                <Lock className="h-4 w-4 text-white/10" />
              </div>
              <h4 className="text-sm font-bold text-white/60 mb-1">{mod.title}</h4>
              <p className="text-[10px] text-blue-300/25 mb-2">{mod.subtitle}</p>
              <p className="text-xs text-blue-200/20 leading-relaxed">{mod.description}</p>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#D4A843]/[0.08] text-[#D4A843]/50 border border-[#D4A843]/[0.08]">
                  Em breve
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-blue-300/25">
            FC Gestão Integrada · FC Engenharia Projetos e Obras
          </p>
          <p className="text-[10px] text-blue-300/15 font-mono">{APP_VERSION}</p>
        </div>
      </footer>
    </div>
  );
}
