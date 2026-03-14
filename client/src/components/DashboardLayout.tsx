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
  CalendarDays, TrendingUp, FileSpreadsheet, BookOpen, ShieldCheck,
  Store, Receipt, CheckCircle, CreditCard, Handshake, Bell as BellIcon, Globe,
  FileSearch, Brain, Scale, ClipboardPlus, ShieldAlert,
  FileBarChart, DollarSign, Construction, ArrowLeftRight, Ban, Settings2,
  Warehouse, Wrench, Calculator, Target, Package,
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
import { useModuleConfig } from "@/contexts/ModuleConfigContext";
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
    title: "Operacional",
    items: [
      { icon: Clock, label: "Fechamento de Ponto", path: "/fechamento-ponto" },
      { icon: Wallet, label: "Folha de Pagamento", path: "/folha-pagamento" },
      { icon: FolderOpen, label: "Controle de Documentos", path: "/controle-documentos" },
      { icon: UtensilsCrossed, label: "Vale Alimentação", path: "/vale-alimentacao" },
      { icon: Clock, label: "Solicitação de Hora Extra", path: "/solicitacao-he" },
      { icon: ClipboardList, label: "Apontamentos de Campo", path: "/apontamentos-campo" },
      { icon: CreditCard, label: "Crachás", path: "/crachas" },
      { icon: ClipboardPlus, label: "Lançar Atestados", path: "/controle-documentos?tab=atestados" },
      { icon: ShieldAlert, label: "Advertências", path: "/controle-documentos?tab=advertencias" },
    ],
  },
  {
    title: "Gestão de Pessoas",
    items: [
      { icon: AlertTriangle, label: "Aviso Prévio", path: "/aviso-previo" },
      { icon: Palmtree, label: "Férias", path: "/ferias" },
      { icon: FileSignature, label: "Contratos PJ", path: "/modulo-pj" },
      { icon: FileSpreadsheet, label: "PJ Medições", path: "/pj-medicoes" },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { icon: UserSearch, label: "Raio-X do Funcionário", path: "/relatorios/raio-x" },
      { icon: Clock, label: "Relatório de Ponto", path: "/relatorios/ponto" },
      { icon: Wallet, label: "Relatório de Folha", path: "/relatorios/folha" },
      { icon: AlertTriangle, label: "Relatório de Divergências", path: "/relatorios/divergencias" },
      { icon: Construction, label: "Custo por Obra", path: "/relatorios/custo-obra" },
      { icon: Wrench, label: "Habilidades por Obra", path: "/relatorios/habilidades-obra" },
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
      { icon: Building2, label: "Efetivo por Obra", path: "/dashboards/efetivo-obra" },
      { icon: UserSearch, label: "Perfil por Tempo de Casa", path: "/dashboards/perfil-tempo-casa" },
      { icon: ShieldCheck, label: "Controle de Documentos", path: "/dashboards/controle-documentos" },
      { icon: ClipboardList, label: "Apontamentos de Campo", path: "/dashboards/apontamentos" },
      { icon: Wrench, label: "Habilidades", path: "/dashboards/habilidades" },
    ],
  },
  {
    title: "Tabelas e Configurações",
    items: [
      { icon: CalendarDays, label: "Feriados", path: "/feriados" },
      { icon: TrendingUp, label: "Dissídio", path: "/dissidio" },
    ],
  },
  {
    title: "Inteligência Artificial",
    items: [
      { icon: Scale, label: "Comparativo Convenções", path: "/comparativo-convencoes" },
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
      { icon: Warehouse, label: "Estoque por Obra", path: "/epis?tab=estoque_obra" },
      { icon: ClipboardList, label: "Checklists EPI", path: "/epis?tab=checklist" },
      { icon: Ban, label: "Descontos EPI", path: "/epis?tab=descontos" },
      { icon: ArrowLeftRight, label: "Transferências EPI", path: "/epis?tab=transferencias" },
      { icon: Settings2, label: "Config EPI", path: "/epis?tab=config" },
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
];

const menuSectionsTerceiros: MenuSection[] = [
  {
    title: "Terceiros",
    items: [
      { icon: LayoutDashboard, label: "Painel Terceiros", path: "/terceiros/painel" },
      { icon: Building2, label: "Empresas Terceiras", path: "/terceiros/empresas" },
      { icon: Users, label: "Funcionários Terceiros", path: "/terceiros/funcionarios" },
    ],
  },
  {
    title: "Conformidade",
    items: [
      { icon: ClipboardCheck, label: "Obrigações Mensais", path: "/terceiros/obrigacoes" },
      { icon: ShieldCheck, label: "Painel de Conformidade", path: "/terceiros/conformidade" },
      { icon: BellIcon, label: "Alertas e Cobranças", path: "/terceiros/alertas" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { icon: Globe, label: "Portal Externo", path: "/terceiros/portal" },
    ],
  },
  {
    title: "Inteligência Artificial",
    items: [
      { icon: FileSearch, label: "Validação IA de Docs", path: "/terceiros/validacao-ia" },
    ],
  },
];

const menuSectionsParceiros: MenuSection[] = [
  {
    title: "Parceiros",
    items: [
      { icon: LayoutDashboard, label: "Painel Parceiros", path: "/parceiros/painel" },
      { icon: Store, label: "Parceiros Conveniados", path: "/parceiros/cadastro" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { icon: Receipt, label: "Lançamentos", path: "/parceiros/lancamentos" },
      { icon: CheckCircle, label: "Aprovações RH", path: "/parceiros/aprovacoes" },
      { icon: Globe, label: "Portal Externo", path: "/parceiros/portal" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { icon: FileText, label: "Guia de Descontos", path: "/parceiros/guia-descontos" },
      { icon: Wallet, label: "Pagamentos", path: "/parceiros/pagamentos" },
    ],
  },
];

const menuSectionsOrcamento: MenuSection[] = [
  {
    title: "Orçamento",
    items: [
      { icon: LayoutDashboard, label: "Painel Orçamento", path: "/orcamento/painel"      },
      { icon: TrendingUp,      label: "Dashboard",         path: "/orcamento/dash"        },
      { icon: FolderOpen,      label: "Orçamentos",       path: "/orcamento/lista"       },
      { icon: Wrench,          label: "Composições",      path: "/orcamento/composicoes" },
      { icon: Package,         label: "Insumos",          path: "/orcamento/insumos"     },
      { icon: Calculator,      label: "Encargos Sociais", path: "/orcamento/encargos"    },
    ],
  },
];

const menuSectionsPlanejamento: MenuSection[] = [
  {
    title: "Planejamento",
    items: [
      { icon: Target,      label: "Projetos",        path: "/planejamento"     },
    ],
  },
];

const menuSectionsCadastro: MenuSection[] = [
  {
    title: "Cadastro",
    items: [
      { icon: Building2,     label: "Empresas",            path: "/empresas"             },
      { icon: Users,         label: "Colaboradores",       path: "/colaboradores"        },
      { icon: Landmark,      label: "Obras",               path: "/obras"                },
      { icon: HardHat,       label: "Efetivo por Obra",    path: "/obras/efetivo"        },
      { icon: Layers,        label: "Setores",             path: "/setores"              },
      { icon: Briefcase,     label: "Funções",             path: "/funcoes"              },
      { icon: Wifi,          label: "Relógios de Ponto",   path: "/relogios-ponto"       },
      { icon: Scale,         label: "Convenções Coletivas",path: "/convencoes-coletivas" },
      { icon: Wrench,        label: "Habilidades",         path: "/habilidades"          },
      { icon: ClipboardList, label: "Contas Bancárias",    path: "/contas-bancarias"     },
    ],
  },
];

const MODULE_SECTIONS: Record<ModuleId, MenuSection[]> = {
  "rh-dp": menuSectionsRHDP,
  "sst": menuSectionsSST,
  "juridico": menuSectionsJuridico,
  "avaliacao": menuSectionsAvaliacao,
  "terceiros":     menuSectionsTerceiros,
  "parceiros":     menuSectionsParceiros,
  "orcamento":     menuSectionsOrcamento,
  "planejamento":  menuSectionsPlanejamento,
  "cadastro":      menuSectionsCadastro,
  "all": [...menuSectionsRHDP], // fallback: show RH & DP
};

// Icon map for custom menu config
const ICON_MAP: Record<string, any> = {
  "Painel": LayoutDashboard,
  "Empresas": Building2,
  "Colaboradores": Users,
  "Obras": Landmark,
  "Efetivo por Obra": HardHat,
  "Setores": Layers,
  "Funções": Briefcase,
  "Relógios de Ponto": Wifi,
  "Contas Bancárias": ClipboardList,
  "Fechamento de Ponto": Clock,
  "Folha de Pagamento": Wallet,
  "Gestão de Competências": CalendarDays,
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
  "Convenções Coletivas": Scale,
  "Relatório de Ponto": Clock,
  "Relatório de Folha": Wallet,
  "Relatório de Divergências": AlertTriangle,
  "Custo por Obra": Construction,
};

// Map each module to its initial/home route
const MODULE_HOME_ROUTES: Record<ModuleId, string> = {
  "rh-dp": "/painel/rh",
  "sst": "/painel/sst",
  "juridico": "/painel/juridico",
  "avaliacao": "/avaliacao-desempenho",
  "terceiros":     "/terceiros/painel",
  "parceiros":     "/parceiros/painel",
  "orcamento":     "/orcamento/painel",
  "planejamento":  "/planejamento",
  "cadastro":      "/empresas",
  "all": "/painel",
};

// Module color/icon config for the selector
const MODULE_THEME: Record<ModuleId, { icon: any; color: string; bg: string }> = {
  "rh-dp": { icon: Users, color: "text-blue-400", bg: "bg-blue-500/20" },
  "sst": { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  "juridico": { icon: Gavel, color: "text-slate-300", bg: "bg-slate-400/20" },
  "avaliacao": { icon: Star, color: "text-amber-400", bg: "bg-amber-500/20" },
  "terceiros":     { icon: HardHat,    color: "text-orange-400", bg: "bg-orange-500/20"  },
  "parceiros":     { icon: Handshake,  color: "text-purple-400", bg: "bg-purple-500/20"  },
  "orcamento":     { icon: Calculator, color: "text-cyan-400",   bg: "bg-cyan-500/20"    },
  "planejamento":  { icon: Target,     color: "text-green-400",  bg: "bg-green-500/20"   },
  "cadastro":      { icon: BookOpen,   color: "text-indigo-400", bg: "bg-indigo-500/20"  },
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
  const { isModuleEnabled } = useModuleConfig();
  const hubToConfigKey: Record<string, string> = {
    "rh-dp": "rh", "sst": "sst", "juridico": "juridico",
    "avaliacao": "avaliacao", "terceiros": "terceiros", "parceiros": "parceiros",
    "orcamento": "orcamento", "planejamento": "planejamento", "cadastro": "cadastro",
  };
  const isModEnabled = (modId: string) => isModuleEnabled(hubToConfigKey[modId] ?? modId);

  // Ordem igual à tela inicial (fc-module-order no localStorage)
  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("fc-module-order") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "fc-module-order") {
        try { setModuleOrder(JSON.parse(e.newValue || "[]")); } catch {}
      }
    };
    const onCustom = (e: Event) => {
      setModuleOrder((e as CustomEvent).detail ?? []);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("fc-module-order-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("fc-module-order-changed", onCustom);
    };
  }, []);
  const isCollapsed = state === "collapsed";

  // Drag-and-drop de itens do menu lateral
  const MENU_ORDER_KEY = `fc-menu-items-${activeModule}`;
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(`fc-menu-items-${activeModule}`) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { setItemOrder(JSON.parse(localStorage.getItem(`fc-menu-items-${activeModule}`) || "{}")); } catch { setItemOrder({}); }
  }, [activeModule]);
  const draggingItem = useRef<{ sectionTitle: string; path: string } | null>(null);
  const dragOverItem = useRef<{ sectionTitle: string; path: string } | null>(null);
  const [dragActiveItem, setDragActiveItem] = useState<string | null>(null);
  const [dragTargetItem, setDragTargetItem] = useState<string | null>(null);

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
  const { isAdminMaster: permIsAdminMaster, canAccessFeature, canAccessModule, accessibleModules, hasGroup, groupCanAccessRoute } = usePermissions();

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
    // Rotas extras: tab-based routes que compartilham a mesma rota base
    // (as rotas com query params ?tab= são mapeadas para a feature principal)
    map.set('/controle-documentos?tab=atestados', { moduleId: 'rh-dp', featureKey: 'lancar-atestados' });
    map.set('/controle-documentos?tab=advertencias', { moduleId: 'rh-dp', featureKey: 'advertencias' });
    map.set('/epis?tab=checklist', { moduleId: 'sst', featureKey: 'epis-checklist' });
    map.set('/epis?tab=descontos', { moduleId: 'sst', featureKey: 'epis-descontos' });
    map.set('/epis?tab=transferencias', { moduleId: 'sst', featureKey: 'epis-transferencias' });
    map.set('/epis?tab=config', { moduleId: 'sst', featureKey: 'epis-config' });
    // Painéis de módulo (não precisam de permissão granular, seguem o módulo)
    map.set('/painel/rh', { moduleId: 'rh-dp', featureKey: 'colaboradores' });
    map.set('/painel/sst', { moduleId: 'sst', featureKey: 'epis' });
    map.set('/painel/juridico', { moduleId: 'juridico', featureKey: 'processos-trabalhistas' });
    return map;
  }, []);

  // Fetch saved menu config from database
  const menuConfigQuery = trpc.menuConfig.get.useQuery();
  const savedMenuConfig = menuConfigQuery.data as Array<{ title: string; items: Array<{ label: string; path: string; visible: boolean; originalLabel?: string }> }> | null;

  // Build the effective sections based on active module + permissions + saved config
  // Paths that were removed from the codebase and should be stripped from any saved menu config
  const DEPRECATED_PATHS = new Set([
    '/gestao-competencias',
  ]);
  const effectiveSections = useMemo(() => {
    const moduleSections = MODULE_SECTIONS[activeModule] || MODULE_SECTIONS["rh-dp"];
    // Combine module sections + admin sections
    let sections: MenuSection[] = [...moduleSections, ...adminSections];

    // Apply saved menu config if available (only for rh-dp module which is the main one)
    if (savedMenuConfig && activeModule === 'rh-dp') {
      // Build a map of all available items by path for icon lookup
      const allItemsByPath = new Map<string, MenuItem>();
      for (const sec of sections) {
        for (const item of sec.items) {
          allItemsByPath.set(item.path, item);
        }
      }

      // Reconstruct sections from saved config
      const customSections: MenuSection[] = [];
      for (const savedSection of savedMenuConfig) {
        const items: MenuItem[] = [];
        for (const savedItem of savedSection.items) {
          if (!savedItem.visible) continue; // Hide invisible items
          const original = allItemsByPath.get(savedItem.path);
          // Skip deprecated paths that were removed from the codebase
          if (DEPRECATED_PATHS.has(savedItem.path)) continue;
          if (original) {
            items.push({
              ...original,
              label: savedItem.label || original.label, // Use custom label if set
            });
          } else {
            // Item exists in saved config but not in code (e.g. new path)
            // Try to find icon from ICON_MAP
            const iconFromMap = ICON_MAP[savedItem.label] || ICON_MAP[savedItem.originalLabel || ''] || Grid2X2;
            items.push({
              icon: iconFromMap,
              label: savedItem.label,
              path: savedItem.path,
            });
          }
        }
        if (items.length > 0) {
          customSections.push({ title: savedSection.title, items });
        }
      }

      // Add any sections/items from code that are NOT in saved config (new items added after save)
      const savedPaths = new Set(savedMenuConfig.flatMap(s => s.items.map(i => i.path)));
      for (const sec of sections) {
        const missingItems = sec.items.filter(item => !savedPaths.has(item.path));
        if (missingItems.length > 0) {
          const existingSection = customSections.find(s => s.title === sec.title);
          if (existingSection) {
            existingSection.items.push(...missingItems);
          } else {
            customSections.push({ title: sec.title, items: missingItems });
          }
        }
      }

      sections = customSections;
    }

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
    // ========== FILTRO DE PERMISSÕES ==========
    // Se o usuário pertence a um grupo: usar APENAS permissões do grupo (groupCanAccessRoute)
    // Se NÃO pertence a grupo: usar permissões individuais (canAccessFeature)
    // Admin master: sem filtro
    if (!permIsAdminMaster) {
      if (hasGroup) {
        // GRUPO: filtrar exclusivamente pelas rotas configuradas no grupo
        sections = sections.map(s => ({
          ...s,
          items: s.items.filter(item => {
            // Admin paths são controlados pelo role, não pelo grupo
            if (adminOnlyPaths.includes(item.path) || item.path === '/revisoes') return true;
            // Ajuda/Biblioteca sempre visível
            if (item.path === '/ajuda') return true;
            // Grupos de Usuários sempre visível para quem tem grupo (pode ver seu próprio grupo)
            if (item.path === '/grupos-usuarios') return true;
            // Verificar se o grupo permite acesso a esta rota
            return groupCanAccessRoute(item.path);
          }),
        }));
      } else {
        // SEM GRUPO: filtrar por permissões individuais granulares
        sections = sections.map(s => ({
          ...s,
          items: s.items.filter(item => {
            // Admin paths são controlados pelo role, não pelas permissões granulares
            if (adminOnlyPaths.includes(item.path) || item.path === '/revisoes') return true;
            // Painel sempre visível
            if (item.path === '/painel' || item.path.startsWith('/painel/')) return true;
            // Ajuda/Biblioteca sempre visível
            if (item.path === '/ajuda') return true;
            // Shared features (empresas, obras, setores, funcoes) - visíveis se tem acesso ao módulo
            const sharedPaths = ['/empresas', '/obras', '/obras/efetivo', '/setores', '/funcoes'];
            if (sharedPaths.includes(item.path)) return accessibleModules.length > 0;
            // "Todos os Dashboards" - visível se tem acesso a pelo menos um módulo
            if (item.path === '/dashboards') return accessibleModules.length > 0;
            // Verificar permissão granular pela rota (inclui dashboards individuais)
            const itemBasePath = item.path.split('?')[0];
            const featureInfo = routeToFeatureKey.get(itemBasePath);
            if (featureInfo) {
              return canAccessFeature(featureInfo.moduleId, featureInfo.featureKey);
            }
            // Para rotas com query params (ex: /controle-documentos?tab=advertencias),
            // verificar se a rota base tem permissão (o controle fino é feito pelo grupo)
            if (item.path.includes('?')) {
              const baseFeatureInfo = routeToFeatureKey.get(itemBasePath);
              if (baseFeatureInfo) {
                return canAccessFeature(baseFeatureInfo.moduleId, baseFeatureInfo.featureKey);
              }
            }
            // Default: NEGAR acesso (segurança por padrão)
            return false;
          }),
        }));
      }
    }
    return sections.filter(s => s.items.length > 0);
  }, [activeModule, isAdminUser, isMasterUser, permIsAdminMaster, canAccessFeature, accessibleModules, hasGroup, groupCanAccessRoute, savedMenuConfig]);

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

  // Lista de módulos disponíveis, filtrada e ordenada igual à tela inicial
  const ALL_MODULE_DEFS = [
    { id: "rh-dp",       label: "RH & DP",       icon: Users,       color: "text-blue-400",    bg: "bg-blue-500/20",    path: "/painel/rh",          canSee: () => (permIsAdminMaster || canAccessModule("rh-dp")) && isModEnabled("rh-dp") },
    { id: "sst",         label: "SST",            icon: Shield,      color: "text-emerald-400", bg: "bg-emerald-500/20", path: "/painel/sst",          canSee: () => (permIsAdminMaster || canAccessModule("sst")) && isModEnabled("sst") },
    { id: "juridico",    label: "Jurídico",       icon: Gavel,       color: "text-slate-300",   bg: "bg-slate-400/20",   path: "/painel/juridico",    canSee: () => (permIsAdminMaster || canAccessModule("juridico")) && isModEnabled("juridico") },
    { id: "avaliacao",   label: "Avaliação",      icon: Star,        color: "text-amber-400",   bg: "bg-amber-500/20",   path: "/avaliacao-desempenho", canSee: () => isModEnabled("avaliacao") },
    { id: "terceiros",   label: "Terceiros",      icon: HardHat,     color: "text-orange-400",  bg: "bg-orange-500/20",  path: "/terceiros/painel",   canSee: () => isModEnabled("terceiros") },
    { id: "parceiros",   label: "Parceiros",      icon: Handshake,   color: "text-purple-400",  bg: "bg-purple-500/20",  path: "/parceiros/painel",   canSee: () => isModEnabled("parceiros") },
    { id: "orcamento",   label: "Orçamento",      icon: Calculator,  color: "text-cyan-400",    bg: "bg-cyan-500/20",    path: "/orcamento/painel",   canSee: () => isModEnabled("orcamento") },
    { id: "planejamento",label: "Planejamento",   icon: Target,      color: "text-green-400",   bg: "bg-green-500/20",   path: "/planejamento",       canSee: () => isModEnabled("planejamento") },
    { id: "cadastro",    label: "Cadastro",       icon: BookOpen,    color: "text-indigo-400",  bg: "bg-indigo-500/20",  path: "/empresas",           canSee: () => isModEnabled("cadastro") },
  ];
  const visibleModuleDefs = ALL_MODULE_DEFS.filter(m => m.canSee());
  const sortedModuleDefs = moduleOrder.length === 0 ? visibleModuleDefs :
    [...visibleModuleDefs].sort((a, b) => {
      const ai = moduleOrder.indexOf(a.id);
      const bi = moduleOrder.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

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
                      <span className="text-[#1B2A4A] font-black text-[10px]">GI</span>
                    </div>
                    <span className="font-bold tracking-tight truncate text-[#D4A843] text-sm">
                      Gestão Integrada
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setLocation("/")}
                  className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#D4A843] to-[#B8922F] flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                  title="Voltar ao Hub de Módulos"
                >
                  <span className="text-[#1B2A4A] font-black text-[10px]">GI</span>
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
                  {sortedModuleDefs.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex items-center gap-2">
                        <div className={`h-5 w-5 rounded ${m.bg} flex items-center justify-center`}>
                          <m.icon className={`h-3 w-3 ${m.color}`} />
                        </div>
                        {m.label}
                      </div>
                    </SelectItem>
                  ))}
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
                  {sortedModuleDefs.map(m => (
                    <DropdownMenuItem key={m.id} onClick={() => { setActiveModule(m.id as ModuleId); setLocation(m.path); }} className="cursor-pointer">
                      <m.icon className={`mr-2 h-4 w-4 ${m.color}`} /> {m.label}
                    </DropdownMenuItem>
                  ))}
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
                      const isActive = item.path.includes('?')
                        ? location === item.path.split('?')[0]
                        : location === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => {
                              if (item.soon) {
                                toast("Em breve", { description: `O módulo ${item.label} está em desenvolvimento.` });
                                return;
                              }
                              if (item.path.includes('?')) {
                                // wouter doesn't support query params - store params in sessionStorage and navigate with setLocation
                                const [basePath, queryString] = item.path.split('?');
                                sessionStorage.setItem('_navParams', queryString);
                                if (location === basePath) {
                                  // Already on the same page - dispatch event to force re-read
                                  window.dispatchEvent(new Event('navParamsUpdated'));
                                } else {
                                  // Navigate to the page, then dispatch event after a short delay to ensure component is mounted
                                  setLocation(basePath);
                                  setTimeout(() => {
                                    window.dispatchEvent(new Event('navParamsUpdated'));
                                  }, 100);
                                }
                              } else {
                                setLocation(item.path);
                              }
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
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany, isConstrutoras, construtorasIds } = useCompany();
  const hasConstrutoras = construtorasIds.length >= 2;
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
            {hasConstrutoras && (
              <SelectItem value="construtoras">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-amber-500/20 flex items-center justify-center">
                    <Building2 className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <span className="font-semibold">CONSTRUTORAS</span>
                </div>
              </SelectItem>
            )}
            {companies?.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <div className="flex items-center gap-2">
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" className="h-5 w-5 object-contain rounded" />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  )}
                  {c.nomeFantasia || c.razaoSocial}
                  {(c as any).compartilhaRecursos ? <span className="text-[9px] text-amber-600 ml-1">●</span> : null}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
