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
  BarChart3, Settings,
  Landmark, Wallet, FolderOpen, UtensilsCrossed, Layers, Briefcase,
  ClipboardList, UserSearch, Gavel, Wifi, HardHat, Trash2,
  AlertTriangle, Palmtree, Shield, FileSignature, GitBranch,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const menuSections = [
  {
    title: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Painel", path: "/" },
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
      { icon: HardHat, label: "Controle de EPIs", path: "/epis" },
      { icon: Wifi, label: "Dixi Ponto", path: "/dixi-ponto" },
    ],
  },
  {
    title: "Gestão de Pessoas",
    items: [
      { icon: AlertTriangle, label: "Aviso Prévio", path: "/aviso-previo" },
      { icon: Palmtree, label: "Férias", path: "/ferias" },
      { icon: Shield, label: "CIPA", path: "/cipa" },
      { icon: FileSignature, label: "Contratos PJ", path: "/modulo-pj" },
    ],
  },
  {
    title: "Jurídico",
    items: [
      { icon: Gavel, label: "Processos Trabalhistas", path: "/processos-trabalhistas" },
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
      { icon: HardHat, label: "EPIs", path: "/dashboards/epis" },
      { icon: Gavel, label: "Jurídico", path: "/dashboards/juridico" },
    ],
  },
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
    title: "Em Breve",
    items: [
      { icon: Star, label: "Avaliação de Desempenho", path: "/avaliacao", soon: true },
    ],
  },
];

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
  "Dixi Ponto": Wifi,
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
};

const allMenuItems = menuSections.flatMap(s => s.items);

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
    window.location.href = "/login";
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
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  // Preservar posição do scroll do menu lateral ao navegar
  // Usar variável de módulo para persistir entre remounts do componente
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

  // Restaurar scroll na montagem inicial do componente
  useEffect(() => {
    restoreScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restaurar scroll quando a rota muda
  useEffect(() => {
    restoreScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Carregar configuração personalizada do menu
  const menuConfigQuery = trpc.menuConfig.get.useQuery(undefined, { staleTime: 60000 });
  const isAdminUser = user?.role === 'admin' || user?.role === 'admin_master';
  const isMasterUser = user?.role === 'admin_master';
  
  // Paths restritos por nível de acesso
  const adminOnlyPaths = ['/usuarios', '/auditoria', '/configuracoes', '/lixeira'];
  const masterOnlyPaths = ['/usuarios'];
  
  const effectiveSections = useMemo(() => {
    let sections = menuSections;
    if (menuConfigQuery.data) {
      // Mapear configuração salva de volta para o formato com ícones
      const savedData = menuConfigQuery.data as any[];
      const allSavedPaths = new Set(savedData.flatMap((s: any) => s.items.map((i: any) => i.path)));
      
      sections = savedData.map((section: any) => ({
        title: section.title,
        items: section.items
          .filter((item: any) => item.visible !== false)
          .map((item: any) => {
            const original = allMenuItems.find(m => m.path === item.path);
            return {
              icon: ICON_MAP[item.label] || original?.icon || LayoutDashboard,
              label: item.label,
              path: item.path,
              soon: (original as any)?.soon || false,
            };
          }),
      }));
      
      // Merge new items from menuSections that don't exist in saved config
      for (const defSection of menuSections) {
        const existingSection = sections.find(s => s.title === defSection.title);
        for (const defItem of defSection.items) {
          if (!allSavedPaths.has(defItem.path)) {
            const newItem = {
              icon: defItem.icon,
              label: defItem.label,
              path: defItem.path,
              soon: (defItem as any)?.soon || false,
            };
            if (existingSection) {
              existingSection.items.push(newItem);
            } else {
              sections.push({ title: defSection.title, items: [newItem] });
            }
            allSavedPaths.add(defItem.path);
          }
        }
      }
      // Add entirely new sections
      for (const defSection of menuSections) {
        if (!sections.find(s => s.title === defSection.title)) {
          sections.push({
            title: defSection.title,
            items: defSection.items.map(i => ({
              icon: i.icon,
              label: i.label,
              path: i.path,
              soon: (i as any)?.soon || false,
            })),
          });
        }
      }
    }
    // Filtrar itens baseado no role do usuário
    if (!isAdminUser) {
      sections = sections.map(s => ({
        ...s,
        items: s.items.filter((item: any) => !adminOnlyPaths.includes(item.path)),
      }));
    }
    // Filtrar itens exclusivos do Admin Master
    if (!isMasterUser) {
      sections = sections.map(s => ({
        ...s,
        items: s.items.filter((item: any) => !item.adminMasterOnly),
      }));
    }
    return sections.filter((s: any) => s.items.length > 0);
  }, [menuConfigQuery.data, isAdminUser, isMasterUser]);

  const allEffectiveItems = effectiveSections.flatMap(s => s.items);
  const activeMenuItem = allEffectiveItems.find(item => item.path === location) || allMenuItems.find(item => item.path === location);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    _expandedSections ?? Object.fromEntries(menuSections.map(s => [s.title, true]))
  );
  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      _expandedSections = next;
      return next;
    });
  };
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
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
                  {selectedCompany?.logoUrl ? (
                    <img src={selectedCompany.logoUrl} alt={selectedCompany.nomeFantasia || selectedCompany.razaoSocial} className="h-8 object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-sidebar-foreground/70 shrink-0" />
                  )}
                  <span className="font-bold tracking-tight truncate text-[#D4A843] text-sm uppercase">
                    {selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "ERP RH & DP"}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

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
