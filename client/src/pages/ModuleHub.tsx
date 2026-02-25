import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { APP_VERSION } from "../../../shared/version";
import {
  Users, Shield, Gavel, CalendarRange, DollarSign, ShoppingCart, Calculator,
  ArrowRight, Lock, Sparkles, Building2, LogOut, ChevronDown,
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

type Module = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  color: string;
  bgGradient: string;
  borderColor: string;
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
    color: "text-blue-600",
    bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
    borderColor: "border-blue-500/30 hover:border-blue-500/60",
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
    color: "text-emerald-600",
    bgGradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
    borderColor: "border-emerald-500/30 hover:border-emerald-500/60",
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
    color: "text-slate-600",
    bgGradient: "from-slate-500/10 via-slate-500/5 to-transparent",
    borderColor: "border-slate-500/30 hover:border-slate-500/60",
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
    color: "text-purple-600",
    bgGradient: "from-purple-500/10 via-purple-500/5 to-transparent",
    borderColor: "border-purple-500/20",
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
    color: "text-amber-600",
    bgGradient: "from-amber-500/10 via-amber-500/5 to-transparent",
    borderColor: "border-amber-500/20",
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
    color: "text-cyan-600",
    bgGradient: "from-cyan-500/10 via-cyan-500/5 to-transparent",
    borderColor: "border-cyan-500/20",
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
    color: "text-rose-600",
    bgGradient: "from-rose-500/10 via-rose-500/5 to-transparent",
    borderColor: "border-rose-500/20",
    path: "",
    active: false,
    features: ["Cotações", "Pedidos de Compra", "Fornecedores", "Estoque"],
  },
];

export default function ModuleHub() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F1729]">
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
    <div className="min-h-screen bg-[#0F1729] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0F1729]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#D4A843] to-[#B8922F] flex items-center justify-center">
                <span className="text-[#0F1729] font-black text-sm">FC</span>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-[#D4A843]">FC Gestão Integrada</h1>
                <p className="text-[10px] text-blue-300/50 font-mono">{APP_VERSION}</p>
              </div>
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
                <SelectTrigger className="w-40 sm:w-52 bg-white/5 border-white/10 h-9 text-sm text-white hover:bg-white/10">
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
                <button className="flex items-center gap-2 hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors">
                  <Avatar className="h-8 w-8 border border-white/20">
                    <AvatarFallback className="text-xs font-medium bg-[#D4A843] text-[#0F1729]">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-medium text-white/90 leading-none">{user?.name}</p>
                    <p className="text-[10px] text-blue-300/50 mt-0.5">
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
        <div className="absolute inset-0 bg-gradient-to-b from-[#D4A843]/5 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#D4A843]/5 rounded-full blur-[120px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Bem-vindo ao <span className="text-[#D4A843]">FC Gestão Integrada</span>
          </h2>
          <p className="mt-3 text-blue-200/60 text-sm sm:text-base max-w-2xl mx-auto">
            Plataforma unificada de gestão empresarial. Selecione um módulo para começar.
          </p>
        </div>
      </section>

      {/* Active Modules */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <h3 className="text-xs font-semibold text-blue-300/50 uppercase tracking-wider mb-4">Módulos Ativos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeModules.map(mod => (
            <button
              key={mod.id}
              onClick={() => navigate(mod.path)}
              className={`group relative overflow-hidden rounded-xl border ${mod.borderColor} bg-white/[0.03] p-6 text-left transition-all duration-300 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${mod.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center ${mod.color} group-hover:scale-110 transition-transform duration-300`}>
                    <mod.icon className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <h4 className="text-lg font-bold text-white mb-1">{mod.title}</h4>
                <p className="text-xs text-blue-300/50 mb-3">{mod.subtitle}</p>
                <p className="text-sm text-blue-200/40 leading-relaxed mb-4">{mod.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {mod.features.map(f => (
                    <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-blue-200/50 border border-white/5">
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
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xs font-semibold text-blue-300/50 uppercase tracking-wider">Em Desenvolvimento</h3>
          <Sparkles className="h-3.5 w-3.5 text-[#D4A843]/60" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {futureModules.map(mod => (
            <div
              key={mod.id}
              className="relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-5 opacity-60"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center ${mod.color}`}>
                  <mod.icon className="h-5 w-5" />
                </div>
                <Lock className="h-4 w-4 text-white/15" />
              </div>
              <h4 className="text-sm font-bold text-white/70 mb-1">{mod.title}</h4>
              <p className="text-[10px] text-blue-300/30 mb-2">{mod.subtitle}</p>
              <p className="text-xs text-blue-200/25 leading-relaxed">{mod.description}</p>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4A843]/10 text-[#D4A843]/60 border border-[#D4A843]/10">
                  Em breve
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-blue-300/30">
            FC Gestão Integrada · FC Engenharia Projetos e Obras
          </p>
          <p className="text-[10px] text-blue-300/20 font-mono">{APP_VERSION}</p>
        </div>
      </footer>
    </div>
  );
}
