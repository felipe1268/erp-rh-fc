import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { APP_VERSION } from "../../../shared/version";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, LogOut, PanelLeft, Users,
  Clock, Star, Lock, Building2, FileText,
  ChevronDown, ChevronRight,
  BarChart3, Settings, Grid2X2,
  Landmark, Wallet, FolderOpen, UtensilsCrossed, Layers, Briefcase,
  ClipboardList, ClipboardCheck, UserSearch, UserCheck, Gavel, Wifi, HardHat, Trash2,
  AlertTriangle, Palmtree, Shield, FileSignature, GitBranch,
  CalendarDays, TrendingUp, FileSpreadsheet, BookOpen,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule, ModuleId, MODULE_LABELS } from "@/contexts/ModuleContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { MODULE_DEFINITIONS, type ActiveModuleId } from "../../../shared/modules";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ========== MENU DEFINITIONS PER MODULE ==========
// Each module has its own exclusive sections. No duplicity.

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  soon?: boolean;
  adminMasterOnly?: boolean;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

// RH & DP - Recursos Humanos e Departamento Pessoal
const menuSectionsRHDP: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Painel RH", path: "/painel/rh" },
    ],
  },
  {
    title: "Cadastro",
    items: [
      { icon: Building2, label: "Empresas", path: "/empresas" },
      { icon: Users, label: "Colaboradores", path: "/colaboradores" },
      { icon: Landmark, label: "Obras", path: "/obras" },
      { icon: Layers, label: "Setores", path: "/setores" },
      { icon: Briefcase, label: "Funções", path: "/funcoes" },
      { icon: Wifi, label: "Relógios de Ponto", path: "/relogios-ponto" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { icon: ClipboardList, label: "Contas Bancárias", path: "/contas-bancarias" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { icon: Clock, label: "Fechamento de Ponto", path: "/fechamento-ponto" },
      { icon: Wallet, label: "Folha de Pagamento", path: "/folha-pagamento" },
      { icon: FolderOpen, label: "Controle de Documentos", path: "/controle-documentos" },
      { icon: UtensilsCrossed, label: "Vale Alimentação", path: "/vale-alimentacao" },
      { icon: Clock, label: "Solicitação de Hora Extra", path: "/solicitacao-he" },
    ],
  },
  {
    title: "Gestão de Pessoas",
    items: [
      { icon: AlertTriangle, label: "Aviso Prévio", path: "/aviso-previo" },
      { icon: Palmtree, label: "Férias", path: "/ferias" },
      { icon: FileSignature, label: "Contratos PJ", path: "/modulo-pj" },
      { icon: FileSpreadsheet, label: "PJ Medições", path: "/pj-medicoes" },
      { icon: Star, label: "Avaliação de Desempenho", path: "/avaliacao-desempenho" },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { icon: UserSearch, label: "Raio-X do Funcionário", path: "/relatorios/raio-x" },
    ],
  },
  {
    title: "Dashboards",
    items: [
      { icon: BarChart3, label: "Todos os Dashboards", path: "/dashboards" },
      { icon: Users, label: "Funcionários", path: "/dashboards/funcionarios" },
      { icon: Clock, label: "Cartão de Ponto", path: "/dashboards/cartao-ponto" },
      { icon: Wallet, label: "Folha de Pagamento", path: "/dashboards/folha-pagamento" },
      { icon: Clock, label: "Horas Extras", path: "/dashboards/horas-extras" },
      { icon: AlertTriangle, label: "Aviso Prévio", path: "/dashboards/aviso-previo" },
      { icon: Palmtree, label: "Férias", path: "/dashboards/ferias" },
    ],
  },
  {
    title: "Tabelas e Configurações",
    items: [
      { icon: CalendarDays, label: "Feriados", path: "/feriados" },
      { icon: TrendingUp, label: "Dissídio", path: "/dissidio" },
    ],
  },
];

// SST - Segurança e Saúde do Trabalho
const menuSectionsSST: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Painel SST", path: "/painel/sst" },
    ],
  },
  {
    title: "Segurança do Trabalho",
    items: [
      { icon: HardHat, label: "Controle de EPIs", path: "/epis" },
      { icon: Shield, label: "CIPA", path: "/cipa" },
    ],
  },
  {
    title: "Dashboards",
    items: [
      { icon: HardHat, label: "EPIs", path: "/dashboards/epis" },
    ],
  },
];

// Jurídico - Gestão Jurídica Trabalhista
const menuSectionsJuridico: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Painel Jurídico", path: "/painel/juridico" },
    ],
  },
  {
    title: "Jurídico",
    items: [
      { icon: Gavel, label: "Processos Trabalhistas", path: "/processos-trabalhistas" },
    ],
  },
  {
    title: "Dashboards",
    items: [
      { icon: Gavel, label: "Jurídico", path: "/dashboards/juridico" },
    ],
  },
];

// Shared admin sections (appended to every module)
const adminSections: MenuSection[] = [
  {
    title: "Administração",
    items: [
      { icon: Lock, label: "Usuários e Permissões", path: "/usuarios" },
      { icon: FileText, label: "Auditoria do Sistema", path: "/auditoria" },
      { icon: Settings, label: "Configurações", path: "/configuracoes" },
      { icon: GitBranch, label: "Revisões do Sistema", path: "/revisoes", adminMasterOnly: true },
      { icon: Trash2, label: "Lixeira", path: "/lixeira" },
    ],
  },
  {
    title: "Ajuda",
    items: [
      { icon: BookOpen, label: "Biblioteca de Conhecimento", path: "/ajuda" },
    ],
  },
];

const menuSectionsAvaliacao: MenuSection[] = [
  {
    title: "Avaliação",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/avaliacao-desempenho" },
      { icon: ClipboardCheck, label: "Avaliar Funcionário", path: "/avaliacao-desempenho?tab=avaliar" },
      { icon: ClipboardList, label: "Avaliações Realizadas", path: "/avaliacao-desempenho?tab=avaliacoes" },
      { icon: UserCheck, label: "Raio-X do Funcionário", path: "/avaliacao-desempenho?tab=raio-x" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { icon: Users, label: "Avaliadores", path: "/avaliacao-desempenho?tab=avaliadores" },
      { icon: Layers, label: "Critérios", path: "/avaliacao-desempenho?tab=criterios" },
    ],
  },
  {
    title: "Pesquisas",
    items: [
      { icon: FileText, label: "Pesquisas Customizadas", path: "/avaliacao-desempenho?tab=pesquisas" },
      { icon: TrendingUp, label: "Clima Organizacional", path: "/avaliacao-desempenho?tab=clima" },
    ],
  },
  {
    title: "Administração",
    items: [
      { icon: Shield, label: "Auditoria", path: "/avaliacao-desempenho?tab=auditoria" },
      { icon: BookOpen, label: "Biblioteca de Conhecimento", path: "/ajuda" },
    ],
  },
];

const MODULE_SECTIONS: Record<ModuleId, MenuSection[]> = {
  "rh-dp": menuSectionsRHDP,
  "sst": menuSectionsSST,
  "juridico": menuSectionsJuridico,
  "avaliacao": menuSectionsAvaliacao,
  "all": [...menuSectionsRHDP], // fallback: show RH & DP
};

// Icon map for custom menu config
const ICON_MAP: Record<string, any> = {
  "Painel": LayoutDashboard,
  "Empresas": Building2,
  "Colaboradores": Users,
  "Obras": Landmark,
  "Setores": Layers,
  "Funções": Briefcase,
  "Relógios de Ponto": Wifi,
  "Contas Bancárias": ClipboardList,
  "Fechamento de Ponto": Clock,
  "Folha de Pagamento": Wallet,
  "Controle de Documentos": FolderOpen,
  "Vale Alimentação": UtensilsCrossed,
  "Controle de EPIs": HardHat,
  "Processos Trabalhistas": Gavel,
  "Raio-X do Funcionário": UserSearch,
  "Todos os Dashboards": BarChart3,
  "Funcionários": Users,
  "Cartão de Ponto": Clock,
  "Horas Extras": Clock,
  "EPIs": HardHat,
  "Jurídico": Gavel,
  "Usuários e Permissões": Lock,
  "Auditoria do Sistema": FileText,
  "Configurações": Settings,
  "Lixeira": Trash2,
  "Avaliação de Desempenho": Star,
  "Aviso Prévio": AlertTriangle,
  "Férias": Palmtree,
  "CIPA": Shield,
  "Contratos PJ": FileSignature,
  "Solicitação de Hora Extra": Clock,
  "Revisões do Sistema": GitBranch,
  "Biblioteca de Conhecimento": BookOpen,
  "Feriados": CalendarDays,
  "Dissídio": TrendingUp,
  "PJ Medições": FileSpreadsheet,
};

// Map each module to its initial/home route
const MODULE_HOME_ROUTES: Record<ModuleId, string> = {
  "rh-dp": "/painel/rh",
  "sst": "/painel/sst",
  "juridico": "/painel/juridico",
  "avaliacao": "/avaliacao-desempenho",
  "all": "/painel",
};

// Module color/icon config for the selector
const MODULE_THEME: Record<ModuleId, { icon: any; color: string; bg: string }> = {
  "rh-dp": { icon: Users, color: "text-blue-400", bg: "bg-blue-500/20" },
  "sst": { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  "juridico": { icon: Gavel, color: "text-slate-300", bg: "bg-slate-400/20" },
  "avaliacao": { icon: Star, color: "text-amber-400", bg: "bg-amber-500/20" },
  "all": { icon: LayoutDashboard, color: "text-[#D4A843]", bg: "bg-[#D4A843]/20" },
};

// Variáveis em nível de módulo para persistir estado entre remounts
let _sidebarScrollTop = 0;
let _expandedSections: Record<string, boolean> | null = null;

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    // Redirect to our custom login page, not OAuth
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1B2A4A]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#D4A843] border-t-transparent rounded-full animate-spin" />
          <p className="text-blue-200/70 text-sm">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { selectedCompany } = useCompany();
  const { activeModule, setActiveModule } = useModule();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  // Preservar posição do scroll do menu lateral ao navegar
  const restoreScroll = () => {
    const scrollVal = _sidebarScrollTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (sidebarScrollRef.current) {
          sidebarScrollRef.current.scrollTop = scrollVal;
        }
      });
    });
  };

  useEffect(() => { restoreScroll(); }, []);
  useEffect(() => { restoreScroll(); }, [location]);

  const isAdminUser = user?.role === 'admin' || user?.role === 'admin_master';
  const isMasterUser = user?.role === 'admin_master';
  const { isAdminMaster: permIsAdminMaster, canAccessFeature, canAccessModule, accessibleModules } = usePermissions();

  // Paths restritos por nível de acesso
  const adminOnlyPaths = ['/usuarios', '/auditoria', '/configuracoes', '/lixeira'];

  // Mapear rotas para feature keys por módulo (para filtrar por permissão)
  const routeToFeatureKey = useMemo(() => {
    const map = new Map<string, { moduleId: ActiveModuleId; featureKey: string }>();
    for (const mod of MODULE_DEFINITIONS) {
      for (const feat of mod.features) {
        map.set(feat.route, { moduleId: mod.id, featureKey: feat.key });
      }
    }
    return map;
  }, []);

  // Build the effective sections based on active module + permissions
  const effectiveSections = useMemo(() => {
    const moduleSections = MODULE_SECTIONS[activeModule] || MODULE_SECTIONS["rh-dp"];
    // Combine module sections + admin sections
    let sections: MenuSection[] = [...moduleSections, ...adminSections];

    // Filter admin-only paths for non-admin users
    if (!isAdminUser) {
      sections = sections.map(s => ({
        ...s,
        items: s.items.filter(item => !adminOnlyPaths.includes(item.path)),
      }));
    }
    // Filter admin master only items
    if (!isMasterUser) {
      sections = sections.map(s => ({
        ...s,
        items: s.items.filter(item => !item.adminMasterOnly),
      }));
    }
    // Filtrar por permissões granulares (se não for admin_master)
    if (!permIsAdminMaster) {
      sections = sections.map(s => ({
        ...s,
        items: s.items.filter(item => {
          // Admin paths são controlados pelo role, não pelas permissões granulares
          if (adminOnlyPaths.includes(item.path) || item.path === '/revisoes') return true;
          // Painel sempre visível
          if (item.path === '/painel' || item.path.startsWith('/painel/')) return true;
          // Shared features (empresas, obras, setores, funcoes) - visíveis se tem acesso ao módulo
          const sharedPaths = ['/empresas', '/obras', '/setores', '/funcoes'];
          if (sharedPaths.includes(item.path)) return accessibleModules.length > 0;
          // Dashboard paths - visíveis se tem acesso ao módulo
          if (item.path.startsWith('/dashboards')) return true;
          // Verificar permissão granular pela rota
          const featureInfo = routeToFeatureKey.get(item.path);
          if (featureInfo) {
            return canAccessFeature(featureInfo.moduleId, featureInfo.featureKey);
          }
          // Default: mostrar
          return true;
        }),
      }));
    }
    return sections.filter(s => s.items.length > 0);
  }, [activeModule, isAdminUser, isMasterUser, permIsAdminMaster, canAccessFeature, accessibleModules]);

  const allEffectiveItems = effectiveSections.flatMap(s => s.items);
  const allModuleItems = Object.values(MODULE_SECTIONS).flatMap(sections => sections.flatMap(s => s.items));
  const activeMenuItem = allEffectiveItems.find(item => item.path === location)
    || allModuleItems.find(item => item.path === location);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    _expandedSections ?? Object.fromEntries(effectiveSections.map(s => [s.title, true]))
  );

  // Reset expanded sections when module changes
  useEffect(() => {
    const newExpanded = Object.fromEntries(effectiveSections.map(s => [s.title, true]));
    setExpandedSections(newExpanded);
    _expandedSections = newExpanded;
  }, [activeModule]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      _expandedSections = next;
      return next;
    });
  };
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => { setIsResizing(false); };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const currentTheme = MODULE_THEME[activeModule];
  const ModIcon = currentTheme.icon;

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/70" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setLocation("/")}
                    className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                    title="Voltar ao Hub de Módulos"
                  >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#D4A843] to-[#B8922F] flex items-center justify-center shrink-0">
                      <span className="text-[#1B2A4A] font-black text-[10px]">FC</span>
                    </div>
                    <span className="font-bold tracking-tight truncate text-[#D4A843] text-sm">
                      FC Gestão Integrada
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setLocation("/")}
                  className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#D4A843] to-[#B8922F] flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                  title="Voltar ao Hub de Módulos"
                >
                  <span className="text-[#1B2A4A] font-black text-[10px]">FC</span>
                </button>
              )}
            </div>
          </SidebarHeader>

          {/* Module Selector */}
          {!isCollapsed && (
            <div className="px-3 pb-2">
              <Select value={activeModule} onValueChange={(v) => { const mod = v as ModuleId; setActiveModule(mod); setLocation(MODULE_HOME_ROUTES[mod] || "/painel"); }}>
                <SelectTrigger className="w-full h-10 bg-sidebar-accent/50 border-sidebar-border text-sm font-semibold">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-md ${currentTheme.bg} flex items-center justify-center`}>
                      <ModIcon className={`h-3.5 w-3.5 ${currentTheme.color}`} />
                    </div>
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {(permIsAdminMaster || canAccessModule("rh-dp")) && (
                    <SelectItem value="rh-dp">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded bg-blue-500/20 flex items-center justify-center">
                          <Users className="h-3 w-3 text-blue-400" />
                        </div>
                        RH & DP
                      </div>
                    </SelectItem>
                  )}
                  {(permIsAdminMaster || canAccessModule("sst")) && (
                    <SelectItem value="sst">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded bg-emerald-500/20 flex items-center justify-center">
                          <Shield className="h-3 w-3 text-emerald-400" />
                        </div>
                        SST
                      </div>
                    </SelectItem>
                  )}
                  {(permIsAdminMaster || canAccessModule("juridico")) && (
                    <SelectItem value="juridico">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded bg-slate-400/20 flex items-center justify-center">
                          <Gavel className="h-3 w-3 text-slate-300" />
                        </div>
                        Jurídico
                      </div>
                    </SelectItem>
                  )}
                  <SelectItem value="avaliacao">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded bg-amber-500/20 flex items-center justify-center">
                        <Star className="h-3 w-3 text-amber-400" />
                      </div>
                      Avaliação
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isCollapsed && (
            <div className="px-2 pb-2 flex justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`h-8 w-8 rounded-lg ${currentTheme.bg} flex items-center justify-center hover:opacity-80 transition-opacity`}
                    title={MODULE_LABELS[activeModule]}
                  >
                    <ModIcon className={`h-4 w-4 ${currentTheme.color}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  {(permIsAdminMaster || canAccessModule("rh-dp")) && (
                    <DropdownMenuItem onClick={() => { setActiveModule("rh-dp"); setLocation("/painel/rh"); }} className="cursor-pointer">
                      <Users className="mr-2 h-4 w-4 text-blue-400" /> RH & DP
                    </DropdownMenuItem>
                  )}
                  {(permIsAdminMaster || canAccessModule("sst")) && (
                    <DropdownMenuItem onClick={() => { setActiveModule("sst"); setLocation("/painel/sst"); }} className="cursor-pointer">
                      <Shield className="mr-2 h-4 w-4 text-emerald-400" /> SST
                    </DropdownMenuItem>
                  )}
                  {(permIsAdminMaster || canAccessModule("juridico")) && (
                    <DropdownMenuItem onClick={() => { setActiveModule("juridico"); setLocation("/painel/juridico"); }} className="cursor-pointer">
                      <Gavel className="mr-2 h-4 w-4 text-slate-300" /> Jurídico
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => { setActiveModule("avaliacao"); setLocation("/avaliacao-desempenho"); }} className="cursor-pointer">
                    <Star className="mr-2 h-4 w-4 text-amber-400" /> Avaliação
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <SidebarContent
            ref={sidebarScrollRef}
            className="gap-0"
            onScroll={(e) => { _sidebarScrollTop = (e.target as HTMLDivElement).scrollTop; }}
          >
            {effectiveSections.map(section => (
              <div key={section.title} className="mb-1">
                {!isCollapsed ? (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
                  >
                    {section.title}
                    {expandedSections[section.title] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                ) : null}
                {(isCollapsed || expandedSections[section.title]) ? (
                  <SidebarMenu className="px-2 py-0.5">
                    {section.items.map((item: any) => {
                      const isActive = location === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => {
                              if (item.soon) {
                                toast("Em breve", { description: `O módulo ${item.label} está em desenvolvimento.` });
                                return;
                              }
                              setLocation(item.path);
                            }}
                            tooltip={item.label}
                            className={`h-9 transition-all font-normal ${item.soon ? "opacity-50" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-[#D4A843]" : ""}`}
                            />
                            <span>{item.label}</span>
                            {item.soon && !isCollapsed ? (
                              <span className="ml-auto text-[10px] bg-sidebar-accent px-1.5 py-0.5 rounded text-sidebar-foreground/50">Em breve</span>
                            ) : null}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                ) : null}
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-[#D4A843] text-[#1B2A4A]">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/50 truncate mt-1.5">
                      {user?.role === 'admin_master' ? 'Admin Master' : user?.role === 'admin' ? 'Admin' : 'Usuário'}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
          <div className="px-3 pb-2 text-center group-data-[collapsible=icon]:hidden">
            <span className="text-[10px] text-sidebar-foreground/40 font-mono">{APP_VERSION}</span>
          </div>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <CompanyHeader isMobile={isMobile} activeLabel={activeMenuItem?.label ?? "Menu"} />
        <main className="flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}

function CompanyHeader({ isMobile, activeLabel }: { isMobile: boolean; activeLabel: string }) {
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const logoUrl = selectedCompany?.logoUrl;

  return (
    <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
      <div className="flex items-center gap-2">
        {isMobile ? <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" /> : null}
        <span className="tracking-tight text-foreground font-medium text-sm">
          {activeLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-7 w-7 object-contain rounded" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
        <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
          <SelectTrigger className="w-40 sm:w-52 md:w-64 bg-card border-border h-9 text-sm">
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
    </div>
  );
}
