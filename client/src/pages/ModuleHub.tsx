import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule, ModuleId } from "@/contexts/ModuleContext";
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
  borderColor: string;
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
    description: "Gestão completa de colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios e documentação trabalhista.",
    icon: Users,
    color: "text-blue-600",
    borderColor: "border-l-blue-500",
    iconBg: "bg-blue-50",
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
    borderColor: "border-l-emerald-500",
    iconBg: "bg-emerald-50",
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
    color: "text-[#1B2A4A]",
    borderColor: "border-l-[#1B2A4A]",
    iconBg: "bg-slate-50",
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
    color: "text-purple-500",
    borderColor: "border-l-purple-400",
    iconBg: "bg-purple-50",
    path: "",
    active: false,
    features: [],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    subtitle: "Gestão Financeira",
    description: "Contas a pagar e receber, fluxo de caixa, conciliação bancária e relatórios financeiros.",
    icon: DollarSign,
    color: "text-amber-500",
    borderColor: "border-l-amber-400",
    iconBg: "bg-amber-50",
    path: "",
    active: false,
    features: [],
  },
  {
    id: "orcamento",
    title: "Orçamento",
    subtitle: "Orçamento de Obras",
    description: "Composição de custos, BDI, curva ABC, comparativo de preços e geração de propostas comerciais.",
    icon: Calculator,
    color: "text-cyan-500",
    borderColor: "border-l-cyan-400",
    iconBg: "bg-cyan-50",
    path: "",
    active: false,
    features: [],
  },
  {
    id: "compras",
    title: "Compras",
    subtitle: "Gestão de Compras e Suprimentos",
    description: "Cotações, pedidos de compra, controle de fornecedores, estoque de materiais e aprovações.",
    icon: ShoppingCart,
    color: "text-rose-500",
    borderColor: "border-l-rose-400",
    iconBg: "bg-rose-50",
    path: "",
    active: false,
    features: [],
  },
];

export default function ModuleHub() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const { setActiveModule } = useModule();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
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
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Header - clean white */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-[#1B2A4A]">ERP - Gestão Integrada</h1>
            <span className="text-[10px] text-gray-300 font-mono">{APP_VERSION}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Company Selector */}
            <div className="flex items-center gap-2">
              {selectedCompany?.logoUrl ? (
                <img src={selectedCompany.logoUrl} alt="" className="h-6 w-6 object-contain rounded" />
              ) : (
                <Building2 className="h-4 w-4 text-gray-400" />
              )}
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-40 sm:w-52 bg-gray-50 border-gray-200 h-9 text-sm text-gray-700 hover:bg-gray-100">
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
                <button className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors">
                  <Avatar className="h-8 w-8 border border-gray-200">
                    <AvatarFallback className="text-xs font-medium bg-[#1B2A4A] text-white">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-medium text-gray-700 leading-none">{user?.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {user?.role === 'admin_master' ? 'Admin Master' : user?.role === 'admin' ? 'Admin' : 'Usuário'}
                    </p>
                  </div>
                  <ChevronDown className="h-3 w-3 text-gray-400 hidden sm:block" />
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

      {/* Main content - asymmetric layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">

          {/* LEFT SIDE - Title area */}
          <div className="lg:w-[40%] lg:sticky lg:top-28">
            {/* Giant ERP watermark */}
            <div className="relative">
              <div className="absolute -left-4 -top-8 text-[140px] font-black text-gray-100 leading-none tracking-tighter select-none pointer-events-none">
                ERP
              </div>
              <div className="relative">
                <h2 className="text-5xl sm:text-6xl font-black text-[#1B2A4A] leading-[1.05] tracking-tight">
                  Gestão
                  <br />
                  Integrada
                </h2>
                <div className="w-16 h-1 bg-[#D4A843] rounded-full mt-4 mb-6" />
                <p className="text-gray-400 text-base leading-relaxed max-w-sm">
                  Potencialize sua gestão com soluções integradas e inteligentes. Selecione um módulo para começar.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE - Module cards stacked */}
          <div className="lg:w-[60%] w-full space-y-4">
            {/* Active modules */}
            {activeModules.map(mod => (
              <button
                key={mod.id}
                onClick={() => { setActiveModule(mod.id as ModuleId); navigate(mod.path); }}
                className={`group w-full relative overflow-hidden rounded-2xl border border-gray-100 border-l-4 ${mod.borderColor} bg-white p-6 sm:p-7 text-left transition-all duration-300 hover:shadow-lg hover:shadow-gray-200/50 hover:-translate-y-0.5`}
              >
                <div className="flex items-start gap-5">
                  {/* Icon */}
                  <div className={`flex-shrink-0 h-14 w-14 rounded-2xl ${mod.iconBg} flex items-center justify-center ${mod.color} group-hover:scale-105 transition-transform duration-300`}>
                    <mod.icon className="h-7 w-7" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h4 className="text-xl font-bold text-[#1B2A4A]">{mod.title}</h4>
                        <p className="text-xs text-gray-400">{mod.subtitle}</p>
                      </div>
                      <div className="flex-shrink-0 ml-4 h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-[#1B2A4A] transition-colors duration-300">
                        <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-white transition-colors duration-300" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed mt-2 mb-4">{mod.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mod.features.map(f => (
                        <span key={f} className="text-[10px] px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-100">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {/* Future modules section */}
            <div className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-200" />
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  Em Desenvolvimento
                  <Sparkles className="h-3.5 w-3.5 text-[#D4A843]" />
                </h3>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {futureModules.map(mod => (
                  <div
                    key={mod.id}
                    className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 text-center opacity-60"
                  >
                    <div className={`h-10 w-10 rounded-xl ${mod.iconBg} flex items-center justify-center ${mod.color} mx-auto mb-2`}>
                      <mod.icon className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-semibold text-gray-500">{mod.title}</h4>
                    <p className="text-[10px] text-gray-300 mt-0.5">Em breve</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-5 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-gray-300">
            ERP - Gestão Integrada
          </p>
          <p className="text-[10px] text-gray-200 font-mono">{APP_VERSION}</p>
        </div>
      </footer>
    </div>
  );
}
