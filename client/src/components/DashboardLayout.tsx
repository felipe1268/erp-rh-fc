import { useAuth } from "@/_core/hooks/useAuth";
import IAModuloChat from "@/components/IAModuloChat";
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
  Landmark, Wallet, FolderOpen, UtensilsCrossed, Layers, Briefcase, Megaphone,
  ClipboardList, ClipboardCheck, UserSearch, UserCheck, Gavel, Wifi, HardHat, Trash2,
  AlertTriangle, Palmtree, Shield, FileSignature, GitBranch,
  CalendarDays, TrendingUp, FileSpreadsheet, BookOpen, ShieldCheck,
  Store, Receipt, CheckCircle, CreditCard, Handshake, Bell as BellIcon, Globe,
  FileSearch, Brain, Scale, ClipboardPlus, ShieldAlert,
  FileBarChart, DollarSign, Construction, ArrowLeftRight, Ban, Settings2,
  Warehouse, Wrench, Calculator, Target, Package, ShoppingCart, Truck, ArrowRightLeft, Gauge,
  Home, Tag, GripVertical, Network, ScanFace, PackageCheck, PenLine, ChevronLeft,
  Camera, Blocks, CheckSquare, FileCheck2, Milestone, Fuel,
  UserMinus, Search, X, GraduationCap, Sparkles, HeartPulse, Award,
  RefreshCw, HandCoins, Scissors,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { ReservasAlertModal } from './compras/ReservasAlertModal';
import FeriasGozoPrompt from './FeriasGozoPrompt';
import { FCSignPendingAlertGlobal } from './FCSignPendingAlertGlobal';
import { AuditoriaAlmoxPendingAlert } from './AuditoriaAlmoxPendingAlert';
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { ActivityTracker } from "./ActivityTracker";
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
  children?: MenuItem[];
  badge?: number;
  badgePulse?: boolean;
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
      { icon: Users, label: "Colaboradores", path: "/colaboradores" },
      { icon: ClipboardList, label: "Coleta de Campo", path: "/coleta-campo" },
      { icon: RefreshCw, label: "Recontratações Pendentes", path: "/recontratacoes-pendentes" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { icon: HardHat, label: "Efetivo por Obra", path: "/obras/efetivo" },
      { icon: Clock, label: "Fechamento de Ponto", path: "/fechamento-ponto" },
      { icon: FileText, label: "Espelho de Ponto", path: "/espelho-ponto" },
      { icon: Wallet, label: "Folha de Pagamento", path: "/folha-pagamento" },
      { icon: Calculator, label: "Encargos Sociais", path: "/encargos-sociais" },
      { icon: FolderOpen, label: "Controle de Documentos", path: "/controle-documentos" },
      { icon: UtensilsCrossed, label: "Vale Alimentação", path: "/vale-alimentacao" },
      { icon: Clock, label: "Solicitação de Hora Extra", path: "/solicitacao-he" },
      { icon: HardHat, label: "Solicitação de Mão de Obra", path: "/solicitacao-mdo" },
      { icon: ArrowLeftRight, label: "Banco de Horas", path: "/banco-horas" },
      { icon: ClipboardList, label: "Apontamentos de Campo", path: "/apontamentos-campo" },
      { icon: CreditCard, label: "Crachás", path: "/crachas" },
      { icon: ClipboardPlus, label: "Lançar Atestados", path: "/controle-documentos?tab=atestados" },
      { icon: ShieldAlert, label: "Advertências", path: "/controle-documentos?tab=advertencias" },
    ],
  },
  {
    title: "Gestão de Pessoas",
    items: [
      { icon: UserMinus, label: "Demissão", path: "/demissao", children: [
        { icon: AlertTriangle, label: "Aviso Prévio", path: "/aviso-previo" },
        { icon: FileText, label: "Pedido de Demissão", path: "/pedido-demissao" },
      ]},
      { icon: Palmtree, label: "Férias", path: "/ferias" },
      { icon: ShieldCheck, label: "Seguro de Vida", path: "/seguro-vida" },
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
      { icon: Building2, label: "Efetivo por Obra", path: "/dashboards/efetivo-obra" },
      { icon: UserSearch, label: "Perfil por Tempo de Casa", path: "/dashboards/perfil-tempo-casa" },
      { icon: ShieldCheck, label: "Controle de Documentos", path: "/dashboards/controle-documentos" },
      { icon: ClipboardList, label: "Apontamentos de Campo", path: "/dashboards/apontamentos" },
      { icon: Wrench, label: "Habilidades", path: "/dashboards/habilidades" },
      { icon: Award, label: "Avaliação Inteligente", path: "/dashboards/avaliacao-funcionarios" },
    ],
  },
  {
    title: "Comunicação e Recrutamento",
    items: [
      { icon: Megaphone, label: "Comunicados Internos", path: "/comunicados-internos" },
      { icon: Briefcase, label: "Currículos", path: "/curriculos" },
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
      { icon: FileSearch, label: "Convenção Coletiva (IA)", path: "/convencao-ia" },
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
      { icon: PackageCheck, label: "Entrega de EPI", path: "/epis?tab=entregas" },
      { icon: Warehouse, label: "Estoque por Obra", path: "/epis?tab=estoque_obra" },
      { icon: ClipboardList, label: "Checklists EPI", path: "/epis?tab=checklist" },
      { icon: Ban, label: "Descontos EPI", path: "/epis?tab=descontos" },
      { icon: ArrowLeftRight, label: "Transferências EPI", path: "/epis?tab=transferencias" },
      { icon: Settings2, label: "Config EPI", path: "/epis?tab=config" },
      { icon: Shield, label: "CIPA", path: "/cipa" },
    ],
  },
  {
    title: "Incidentes & Acidentes",
    items: [
      { icon: AlertTriangle, label: "Registro de Acidentes", path: "/sst/acidentes" },
    ],
  },
  {
    title: "Programas Legais",
    items: [
      { icon: FileText, label: "PGR", path: "/programas-sst?tab=PGR" },
      { icon: FileText, label: "PCMSO", path: "/programas-sst?tab=PCMSO" },
      { icon: FileText, label: "LTCAT", path: "/programas-sst?tab=LTCAT" },
      { icon: ClipboardCheck, label: "DDS — Diálogo Diário", path: "/sst/dds" },
    ],
  },
  {
    title: "Integração",
    items: [
      { icon: GraduationCap, label: "Integração SST", path: "/sst/integracao" },
    ],
  },
  {
    title: "Dashboards",
    items: [
      { icon: HardHat, label: "EPIs", path: "/dashboards/epis" },
      { icon: HeartPulse, label: "Atestados & Acidentes", path: "/sst/dashboard-atestados-acidentes" },
      { icon: ClipboardCheck, label: "DDS — Diálogo Diário", path: "/sst/dds-dashboard" },
    ],
  },
];

// Jurídico (unificado — Trabalhista, Tributário, Civil)
const menuSectionsJuridico: MenuSection[] = [
  {
    title: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Painel Jurídico", path: "/painel/juridico" },
      { icon: BarChart3, label: "Dashboard Geral", path: "/dashboards/juridico-geral" },
    ],
  },
  {
    title: "Trabalhista",
    items: [
      { icon: LayoutDashboard, label: "Painel Trabalhista", path: "/painel/juridico-trabalhista" },
      { icon: Gavel, label: "Processos Trabalhistas", path: "/processos-trabalhistas" },
      { icon: Gavel, label: "Dashboard Trabalhista", path: "/dashboards/juridico" },
    ],
  },
  {
    title: "Tributário",
    items: [
      { icon: LayoutDashboard, label: "Painel Tributário", path: "/painel/tributario" },
      { icon: Scale, label: "Processos Tributários", path: "/processos-tributarios" },
      { icon: Scale, label: "Dashboard Tributário", path: "/dashboards/tributario" },
    ],
  },
  {
    title: "Civil",
    items: [
      { icon: LayoutDashboard, label: "Painel Civil", path: "/painel/civil" },
      { icon: FileText, label: "Processos Cíveis", path: "/processos-civis" },
      { icon: FileText, label: "Dashboard Civil", path: "/dashboards/civil" },
    ],
  },
];

// Shared admin sections (appended to every module)
export const adminSections: MenuSection[] = [
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

// Rev. 2834 — Menu de Terceiros reorganizado em torno de EMPRESA → CONTRATOS.
// De 7 seções/18 itens para 3 seções claras (nada apagado — só reagrupado/renomeado).
// Dois grupos de fornecedor SEPARADOS: "Empresas de Serviço" (material + MDO, tabela
// empresas_terceiras) × "Prestadores PJ" (mão de obra, indivíduos em employees/pj_contracts).
const menuSectionsTerceiros: MenuSection[] = [
  {
    title: "Empresas & Contratos",
    items: [
      { icon: Building2, label: "Empresas de Serviço", path: "/terceiros/empresas" },
      { icon: FileSignature, label: "Contratos de Serviço", path: "/terceiros/contratos" },
      { icon: Briefcase, label: "Prestadores PJ", path: "/modulo-pj" },
      { icon: LayoutDashboard, label: "Painel Terceiros", path: "/terceiros/painel" },
    ],
  },
  {
    title: "Conformidade & Pessoas",
    items: [
      { icon: Users, label: "Funcionários Terceiros", path: "/terceiros/funcionarios" },
      { icon: ClipboardCheck, label: "Obrigações Mensais", path: "/terceiros/obrigacoes" },
      { icon: ShieldCheck, label: "Painel de Conformidade", path: "/terceiros/conformidade" },
      { icon: ShieldCheck, label: "Conformidade PJ", path: "/terceiros/pj/conformidade" },
      { icon: BarChart3, label: "Dashboard Conformidade PJ", path: "/terceiros/pj/dashboard-conformidade" },
      { icon: BellIcon, label: "Alertas e Cobranças", path: "/terceiros/alertas" },
      { icon: ShieldAlert, label: "Advertências", path: "/terceiros/advertencias" },
    ],
  },
  {
    title: "Ferramentas",
    items: [
      { icon: PenLine, label: "IntegraSign", path: "/integrasign" },
      { icon: TrendingUp, label: "Previsão de Caixa", path: "/terceiros/previsao-caixa" },
      { icon: Globe, label: "Portal Externo", path: "/terceiros/portal" },
      { icon: FileSearch, label: "Validação IA de Docs", path: "/terceiros/validacao-ia" },
    ],
  },
];

const menuSectionsParceiros: MenuSection[] = [
  {
    title: "Parceiros",
    items: [
      { icon: LayoutDashboard, label: "Painel Parceiros", path: "/parceiros/painel" },
      { icon: BarChart3, label: "Dashboard Parceiros", path: "/dashboards/parceiros" },
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

const menuSectionsCompras: MenuSection[] = [
  {
    title: "Painel",
    items: [
      { icon: LayoutDashboard, label: "Painel de Controle",   path: "/compras/painel"           },
      { icon: BarChart3,       label: "Dashboard por Obra",   path: "/compras/dashboard-obra"   },
      { icon: Receipt,         label: "Painel FD",            path: "/compras/painel-fd"        },
    ],
  },
  {
    title: "Fluxo de Compras",
    items: [
      { icon: ClipboardList,   label: "Solicitações (SC)",    path: "/compras/solicitacoes"     },
      { icon: FileText,        label: "Cotações",             path: "/compras/cotacoes"         },
      { icon: ShoppingCart,    label: "Ordens (OC / OS)",path: "/compras/ordens"           },
      { icon: Package,         label: "Recebimentos",         path: "/compras/recebimentos"     },
    ],
  },
  {
    title: "Prioridade",
    items: [
      { icon: AlertTriangle,   label: "Compras Emergenciais", path: "/compras/emergencial"      },
    ],
  },
  {
    title: "Financeiro",
    items: [

      { icon: ArrowLeftRight,  label: "Realocação de Verba",  path: "/compras/realocacao"       },
      { icon: Calculator,      label: "Comissões",            path: "/compras/comissoes"        },
    ],
  },
  {
    title: "Documentação",
    items: [
      { icon: BookOpen,        label: "Databook de Obra",     path: "/compras/databook"         },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { icon: Users,           label: "Fornecedores",         path: "/compras/fornecedores"     },
    ],
  },
  {
    title: "Sistema",
    items: [
      { icon: Settings,        label: "Configurações",        path: "/compras/configuracoes"    },
      { icon: ArrowRightLeft,  label: "Mas Controle ERP",     path: "/integracoes/mas-controle" },
    ],
  },
];

const menuSectionsAlmoxarifado: MenuSection[] = [
  {
    title: "Almoxarifado",
    items: [
      { icon: Warehouse,      label: "Visão Geral",       path: "/almoxarifado" },
      { icon: ArrowLeftRight, label: "Movimentações",     path: "/almoxarifado/movimentacoes" },
      { icon: ClipboardList,  label: "Inventário Semanal",path: "/almoxarifado/inventario" },
      // Rev. 2373 — inventário visual de baias (areia, pedra, lajota — granel).
      { icon: Package,        label: "Inventário Visual (Baias)", path: "/almoxarifado/inventario-visual" },
      // Rev. 2686 — histórico read-only (semanal + baias) p/ análise.
      { icon: BarChart3,      label: "Histórico de Inventário", path: "/almoxarifado/historico-inventario" },
      // Rev. 1880 hot-patch — módulo "Ferramentas de Terceiros" (portaria
      // de obra) já existe em shared/modules.ts L361 e em App.tsx L507,
      // mas faltava entrada na sidebar (lista hardcoded). Sem isso, usuário
      // só acessa via URL direta. Wrench icon mantém consistência com o
      // módulo principal e com o atalho "🔧 Ferramentas" abaixo.
      { icon: Wrench,         label: "Ferramentas de Terceiros", path: "/almoxarifado/ferramentas-terceiros" },
    ],
  },
  {
    title: "Ações Rápidas",
    items: [
      { icon: Package,       label: "📥 Nova Entrada",    path: "/almoxarifado?modal=entrada" },
      { icon: Wrench,        label: "🔧 Ferramentas",     path: "/almoxarifado?modal=ferramentas" },
      { icon: ShoppingCart,  label: "🛒 Insumo",          path: "/almoxarifado?modal=insumo" },
      { icon: ArrowRightLeft, label: "↔ Transferir",     path: "/almoxarifado?modal=transferir" },
      { icon: ClipboardCheck, label: "📋 Fechar Dia",    path: "/almoxarifado?modal=fechardia" },
      { icon: Tag,           label: "📦 Cadastros",       path: "/almoxarifado?modal=cadastros" },
    ],
  },
  {
    title: "Configurações",
    items: [
      { icon: Tag, label: "Categorias", path: "/almoxarifado/categorias" },
    ],
  },
  // Rev. 2258 — Módulo Controle de Equipamentos (rastreio unitário de
  // próprios + locados, análise CAPEX, solicitações). Plugado em
  // Almoxarifado p/ herdar permissão sem novo módulo.
  {
    title: "Controle de Equipamentos",
    items: [
      { icon: Package,   label: "Visão Geral",       path: "/equipamentos" },
      { icon: HardHat,   label: "Próprios",          path: "/equipamentos/proprios" },
      { icon: Truck,     label: "Equipamentos Locados", path: "/equipamentos/locados" },
    ],
  },
  // Rev. 2324 — Dashboard consolidada (estoque + movimentações + equipamentos
  // próprios/locados + ferramentas de terceiros) em abas separadas pra análise.
  // Rev. 2327 — cada aba exposta como item próprio da sidebar (?tab=...);
  // todos abrem a mesma página que reage à querystring.
  {
    title: "Análise",
    items: [
      { icon: BarChart3,      label: "Dashboard Almox & Equip.", path: "/dashboards/almoxarifado-equipamentos?tab=visao" },
      { icon: Package,        label: "↳ Estoque",                 path: "/dashboards/almoxarifado-equipamentos?tab=estoque" },
      { icon: ArrowLeftRight, label: "↳ Movimentações",           path: "/dashboards/almoxarifado-equipamentos?tab=movs" },
      { icon: Wrench,         label: "↳ Ferramentas Terceiros",   path: "/dashboards/almoxarifado-equipamentos?tab=ferramentas" },
      { icon: HardHat,        label: "↳ Equip. Próprios",         path: "/dashboards/almoxarifado-equipamentos?tab=proprios" },
      { icon: Truck,          label: "↳ Equip. Locados",          path: "/dashboards/almoxarifado-equipamentos?tab=locados" },
    ],
  },
];

const menuSectionsFinanceiro: MenuSection[] = [
  {
    title: "Painel",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/financeiro" },
    ],
  },
  {
    title: "Movimentações",
    items: [
      { icon: DollarSign,    label: "Lançamentos",       path: "/financeiro/lancamentos" },
      { icon: TrendingUp,    label: "Previsão de Faturamento",   path: "/financeiro/contas-a-receber" },
      { icon: HandCoins,     label: "Contas a Receber",   path: "/financeiro/contas-a-receber-titulos" },
      { icon: CheckCircle,   label: "Contas a Pagar",     path: "/financeiro/contas-a-pagar" },
    ],
  },
  {
    title: "Análise",
    items: [
      { icon: Scissors,      label: "Análise de Custos", path: "/financeiro/analise-custos" },
      { icon: TrendingUp,    label: "Cronograma Financeiro", path: "/financeiro/cronograma" },
      { icon: BarChart3,     label: "DRE",               path: "/financeiro/dre" },
      { icon: FileSpreadsheet, label: "Fluxo de Caixa",  path: "/financeiro/fluxo-de-caixa" },
      { icon: AlertTriangle, label: "Obrigações Fiscais", path: "/financeiro/obrigacoes-fiscais" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { icon: BookOpen,      label: "Plano de Contas",   path: "/financeiro/plano-de-contas" },
      { icon: Tag,           label: "Categorias",        path: "/financeiro/categorias" },
      { icon: Layers,        label: "Centros de Custo",  path: "/financeiro/centros-de-custo" },
      { icon: ArrowLeftRight, label: "Conciliação Bancária", path: "/financeiro/conciliacao" },
      { icon: Settings2,     label: "Configurações",     path: "/financeiro/configuracoes" },
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

const menuSectionsMedicao: MenuSection[] = [
  {
    title: "Medição de Contratos",
    items: [
      { icon: FileBarChart, label: "Contratos",       path: "/medicao"          },
    ],
  },
];

const menuSectionsMedicaoTerceiros: MenuSection[] = [
  {
    title: "Medição de Terceiros",
    items: [
      { icon: Receipt,         label: "Medições (a pagar)", path: "/terceiros/medicoes" },
      { icon: FileSpreadsheet, label: "Medições PJ", path: "/pj-medicoes" },
    ],
  },
];

const menuSectionsGestaoDocumentos: MenuSection[] = [
  {
    title: "Proj./Doc. Técnicos",
    items: [
      { icon: LayoutDashboard, label: "Painel",          path: "/gestao-documentos?tab=painel" },
      { icon: FolderOpen,      label: "Documentos",      path: "/gestao-documentos?tab=documentos" },
    ],
  },
];

const menuSectionsOperacional: MenuSection[] = [
  {
    title: "Painel",
    items: [
      { icon: LayoutDashboard, label: "Painel Operacional", path: "/operacional/painel" },
    ],
  },
  {
    title: "Diário de Obra",
    items: [
      { icon: Building2,       label: "Obras",                path: "/operacional/diario-obra" },
      { icon: ClipboardList,   label: "RDO",                  path: "/operacional/rdo" },
      { icon: Camera,          label: "Registro Fotográfico",  path: "/operacional/fotos" },
    ],
  },
  {
    title: "Controle de Qualidade de Concreto",
    items: [
      { icon: Blocks,          label: "Concretagem",          path: "/operacional/concretagem" },
      { icon: AlertTriangle,   label: "Não Conformidades",    path: "/operacional/nc" },
    ],
  },
  {
    title: "Checklist",
    items: [
      { icon: CheckSquare,     label: "Checklists de Qualidade", path: "/operacional/checklists" },
      { icon: ClipboardCheck,   label: "Liberação de Serviços", path: "/operacional/liberacao-servicos" },
    ],
  },
];

const menuSectionsFrotas: MenuSection[] = [
  {
    title: "Painel",
    items: [
      { icon: LayoutDashboard, label: "Dashboard Frotas", path: "/frotas/painel" },
      { icon: BarChart3, label: "Analítico", path: "/frotas/analitico" },
    ],
  },
  {
    // Rev. 1888 — Dashboards específicos saíram da seção "Painel" e ganharam
    // aba própria (mesmo padrão de RH-DP/SST). Painel = visão geral macro;
    // Dashboards = drill-down por área (manutenção/combustível/pedágios).
    title: "Dashboards",
    items: [
      { icon: Wrench,  label: "Dash Manutenção",  path: "/frotas/manutencoes-dashboard" },
      { icon: Fuel,    label: "Dash Combustível", path: "/frotas/combustivel-dashboard" },
      { icon: Receipt, label: "Dash Pedágios",    path: "/frotas/pedagios-dashboard" },
    ],
  },
  {
    title: "Cadastro",
    items: [
      { icon: Truck, label: "Veículos", path: "/frotas/veiculos" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { icon: Wrench, label: "Manutenções", path: "/frotas/manutencoes" },
      { icon: Construction, label: "Combustível", path: "/frotas/combustivel" },
      { icon: DollarSign, label: "Preços Combustível", path: "/frotas/precos-combustivel" },
      { icon: Milestone, label: "Pedágios", path: "/frotas/pedagios" },
    ],
  },
  {
    title: "Obrigações Legais",
    items: [
      { icon: AlertTriangle, label: "Multas", path: "/frotas/multas" },
      { icon: Receipt, label: "IPVA", path: "/frotas/ipva" },
      { icon: FileText, label: "Licenciamento", path: "/frotas/licenciamento" },
      { icon: Shield, label: "Seguros", path: "/frotas/seguros" },
    ],
  },
  {
    title: "Inspeções",
    items: [
      { icon: UserSearch, label: "Raio-X do Veículo", path: "/frotas/raio-x" },
      { icon: ClipboardCheck, label: "Checklist Veicular", path: "/frotas/checklist" },
    ],
  },
  {
    title: "Rastreamento",
    items: [
      { icon: Target, label: "Mapa e Trajetos", path: "/frotas/rastreamento" },
      { icon: Gauge, label: "Controle de Km", path: "/frotas/controle-km" },
    ],
  },
];

const menuSectionsAdmin: MenuSection[] = [
  {
    title: "Administração",
    items: [
      { icon: BarChart3, label: "Telemetria & Analytics", path: "/admin/telemetria" },
    ],
  },
];

const menuSectionsCadastro: MenuSection[] = [
  {
    title: "Cadastro",
    items: [
      { icon: Building2,     label: "Empresas",            path: "/empresas"             },
      { icon: Users,         label: "Colaboradores",       path: "/colaboradores"        },
      { icon: UserCheck,     label: "Clientes",            path: "/clientes"             },
      { icon: Network,       label: "Gerenciadoras",       path: "/gerenciadoras"        },
      { icon: Truck,         label: "Fornecedores",        path: "/compras/fornecedores" },
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
  {
    title: "Sistema",
    items: [
      { icon: Lock,          label: "Usuários e Permissões", path: "/usuarios"           },
      { icon: Settings,      label: "Configurações",         path: "/configuracoes"      },
      { icon: FileText,      label: "Auditoria do Sistema",  path: "/auditoria"          },
      { icon: Trash2,        label: "Lixeira",               path: "/lixeira"            },
      { icon: GitBranch,     label: "Revisões",              path: "/revisoes"           },
    ],
  },
];

// Comunicados Internos — módulo simples, uma página
const menuSectionsComunicados: MenuSection[] = [
  {
    title: "Comunicados Internos",
    items: [
      { icon: Megaphone, label: "Comunicados Internos", path: "/comunicados-internos" },
    ],
  },
];

// Currículos — módulo simples, uma página
const menuSectionsCurriculos: MenuSection[] = [
  {
    title: "Currículos",
    items: [
      { icon: Briefcase, label: "Banco de Currículos", path: "/curriculos" },
    ],
  },
];

// Oráculo — admin_master only
const menuSectionsOraculo: MenuSection[] = [
  {
    title: "Oráculo",
    items: [
      { icon: Sparkles, label: "Assistente IA", path: "/oraculo", adminMasterOnly: true },
    ],
  },
];

// Portal do Cliente — administração
const menuSectionsPortalCliente: MenuSection[] = [
  {
    title: "Administração",
    items: [
      { icon: ShieldCheck, label: "Acessos do Portal", path: "/clientes/portal" },
      { icon: Star, label: "Pesquisa de Satisfação (NPS)", path: "/clientes/portal?tab=avaliacoes" },
      { icon: Users, label: "Cadastro de Clientes", path: "/clientes" },
    ],
  },
];

export const MODULE_SECTIONS: Record<ModuleId, MenuSection[]> = {
  "rh-dp": menuSectionsRHDP,
  "sst": menuSectionsSST,
  "juridico": menuSectionsJuridico,
  "juridico-trabalhista": menuSectionsJuridico,
  "juridico-tributario": menuSectionsJuridico,
  "juridico-civil": menuSectionsJuridico,
  "avaliacao": menuSectionsAvaliacao,
  "terceiros":     menuSectionsTerceiros,
  "parceiros":     menuSectionsParceiros,
  "orcamento":     menuSectionsOrcamento,
  "planejamento":  menuSectionsPlanejamento,
  "medicao":       menuSectionsMedicao,
  "medicao-terceiros": menuSectionsMedicaoTerceiros,
  "cadastro":      menuSectionsCadastro,
  "compras":       menuSectionsCompras,
  "almoxarifado":  menuSectionsAlmoxarifado,
  "financeiro":    menuSectionsFinanceiro,
  "gestao-documentos": menuSectionsGestaoDocumentos,
  "operacional": menuSectionsOperacional,
  "frotas": menuSectionsFrotas,
  "comunicados-internos": menuSectionsComunicados,
  "curriculos":           menuSectionsCurriculos,
  "oraculo":              menuSectionsOraculo,
  "portal-cliente":       menuSectionsPortalCliente,
  "admin": menuSectionsAdmin,
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
  "Demissão": UserMinus,
  "Pedido de Demissão": FileText,
  "Férias": Palmtree,
  "Seguro de Vida": ShieldCheck,
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
  "juridico-trabalhista": "/painel/juridico-trabalhista",
  "juridico-tributario": "/painel/tributario",
  "juridico-civil": "/painel/civil",
  "avaliacao": "/avaliacao-desempenho",
  "terceiros":      "/terceiros/painel",
  "parceiros":      "/parceiros/painel",
  "orcamento":      "/orcamento/painel",
  "planejamento":   "/planejamento",
  "medicao":        "/medicao",
  "medicao-terceiros": "/terceiros/medicoes",
  "cadastro":       "/empresas",
  "compras":        "/compras/painel",
  "almoxarifado":   "/almoxarifado",
  "financeiro":     "/financeiro",
  "gestao-documentos": "/gestao-documentos",
  "operacional": "/operacional/painel",
  "frotas":         "/frotas/painel",
  "comunicados-internos": "/comunicados-internos",
  "curriculos":           "/curriculos",
  "oraculo":              "/oraculo",
  "portal-cliente":       "/clientes/portal",
  "admin": "/admin/telemetria",
  "all": "/painel",
};

// Module color/icon config for the selector
const MODULE_THEME: Record<ModuleId, { icon: any; color: string; bg: string }> = {
  "rh-dp": { icon: Users, color: "text-blue-400", bg: "bg-blue-500/20" },
  "sst": { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  "juridico": { icon: Gavel, color: "text-amber-400", bg: "bg-amber-500/20" },
  "juridico-trabalhista": { icon: Gavel, color: "text-amber-400", bg: "bg-amber-500/20" },
  "juridico-tributario": { icon: Gavel, color: "text-amber-400", bg: "bg-amber-500/20" },
  "juridico-civil": { icon: Gavel, color: "text-amber-400", bg: "bg-amber-500/20" },
  "avaliacao": { icon: Star, color: "text-amber-400", bg: "bg-amber-500/20" },
  "terceiros":     { icon: HardHat,    color: "text-orange-400", bg: "bg-orange-500/20"  },
  "parceiros":     { icon: Handshake,  color: "text-purple-400", bg: "bg-purple-500/20"  },
  "orcamento":     { icon: Calculator, color: "text-cyan-400",   bg: "bg-cyan-500/20"    },
  "planejamento":  { icon: Target,        color: "text-green-400",   bg: "bg-green-500/20"   },
  "medicao":       { icon: FileBarChart,  color: "text-teal-400",    bg: "bg-teal-500/20"    },
  "medicao-terceiros": { icon: Receipt,   color: "text-orange-400",  bg: "bg-orange-500/20"  },
  "cadastro":      { icon: BookOpen,      color: "text-indigo-400",  bg: "bg-indigo-500/20"  },
  "compras":       { icon: ShoppingCart,  color: "text-rose-400",    bg: "bg-rose-500/20"    },
  "almoxarifado":  { icon: Warehouse,     color: "text-emerald-400", bg: "bg-emerald-500/20" },
  "financeiro":    { icon: DollarSign,    color: "text-green-400",   bg: "bg-green-500/20"   },
  "gestao-documentos": { icon: FolderOpen, color: "text-indigo-400", bg: "bg-indigo-500/20" },
  "operacional": { icon: HardHat, color: "text-amber-400", bg: "bg-amber-500/20" },
  "frotas":      { icon: Truck,     color: "text-cyan-400",    bg: "bg-cyan-500/20" },
  "comunicados-internos": { icon: Megaphone, color: "text-blue-400",   bg: "bg-blue-500/20"   },
  "curriculos":           { icon: Briefcase, color: "text-amber-400",  bg: "bg-amber-500/20"  },
  "oraculo":              { icon: Sparkles,  color: "text-violet-400", bg: "bg-violet-500/20" },
  "portal-cliente":       { icon: ShieldCheck, color: "text-indigo-400", bg: "bg-indigo-500/20" },
  "admin": { icon: BarChart3, color: "text-red-400", bg: "bg-red-500/20" },
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
  noPadding,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
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

  // Rev. 1813 — Usuário pediu para MANTER a barra lateral em todas as telas.
  // Reduzido de 1280 para 1024: em qualquer notebook/iPad landscape (≥1024px)
  // a barra começa ABERTA. Em telas menores (tablet portrait, smartphone
  // landscape) começa COLLAPSED em modo "ícone" — mas continua VISÍVEL
  // (`collapsible="icon"` no <Sidebar/> abaixo + Rev. 1813 useMobile reduzido
  // pra 480, evita que a barra vire Sheet overlay em tablets). SSR-safe.
  const TABLET_BREAKPOINT = 1024;
  const sidebarDefaultOpen =
    typeof window === "undefined" ? true : window.innerWidth >= TABLET_BREAKPOINT;

  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} noPadding={noPadding}>
        {children}
      </DashboardLayoutContent>
      <ReservasAlertModalGlobal />
      <FeriasGozoPromptGlobal />
      <FCSignPendingAlertGlobal />
      <AuditoriaAlmoxPendingAlert />
    </SidebarProvider>
  );
}

// Rev. 2098 — Modal global de início de gozo de férias (RH/DP). Aparece em
// QUALQUER tela do módulo RH, não só em /ferias.
function FeriasGozoPromptGlobal() {
  const { activeModule } = useModule();
  if (activeModule !== "rh-dp") return null;
  return <FeriasGozoPrompt />;
}

// Rev. 1386 — Modal global de aviso de Reservas Preventivas pendentes (perfis Compras).
function ReservasAlertModalGlobal() {
  return <ReservasAlertModal />;
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  noPadding?: boolean;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  noPadding,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { selectedCompany, selectedCompanyId, getCompanyIdsForQuery } = useCompany();
  const [avisoBannerOpen, setAvisoBannerOpen] = useState(true);
  const cId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const badgeCompanyIds = getCompanyIdsForQuery();
  const avisoAtivosQuery = trpc.avisoPrevio.avisoPrevio.list.useQuery(
    { companyId: cId, status: 'em_andamento' },
    { enabled: cId > 0, staleTime: 60_000 }
  );
  const comprasBadgeQ = trpc.compras.getComprasBadgeCounts.useQuery(
    { companyIds: badgeCompanyIds },
    { enabled: badgeCompanyIds.length > 0, refetchInterval: 30_000, staleTime: 15_000 }
  );
  // Rev. 1271 — Bolinha vermelha para HE/MO solicitações novas (por usuário)
  const requestsBadgeQ = trpc.notifications.pendingRequestCounts.useQuery(
    { companyId: cId, companyIds: badgeCompanyIds },
    { enabled: cId > 0 || badgeCompanyIds.length > 0, refetchInterval: 60_000, staleTime: 30_000 }
  );
  // Rev. 2058 — Badge vermelho piscante no menu "Integração SST" do módulo SST,
  // padrão Apontamentos de Campo (Rev. 1277). Conta colaboradores sem
  // integração válida pra dar visibilidade direta ao TST.
  const sstBadgeQ = trpc.integracaoSST.getBadgeCounts.useQuery(
    { companyIds: badgeCompanyIds },
    { enabled: badgeCompanyIds.length > 0, refetchInterval: 60_000, staleTime: 30_000 }
  );
  // Rev. 2450 — Banner global Rev. 2426 REMOVIDO. Substituído pelo
  // componente <AuditoriaAlmoxPendingAlert /> montado no SidebarProvider
  // (linhas ~948), que usa `auditoriaAlmoxarifado.minhasPendencias` com
  // autorização via `obra_responsaveis_estoque` + admin/admin_master e
  // navega pra `/almoxarifado/auditoria`.
  const { activeModule, setActiveModule } = useModule();
  const { isModuleEnabled, isPageEnabled } = useModuleConfig();
  const hubToConfigKey: Record<string, string> = {
    "rh-dp": "rh", "sst": "sst",
    "juridico": "juridico", "juridico-trabalhista": "juridico", "juridico-tributario": "juridico", "juridico-civil": "juridico",
    "avaliacao": "avaliacao", "terceiros": "terceiros", "parceiros": "parceiros",
    "orcamento": "orcamento", "planejamento": "planejamento", "cadastro": "cadastro",
    "compras": "compras",
    "almoxarifado": "compras",
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

  // ── Ordem GLOBAL do menu (Rev. 2874) — definida pelo Admin Master, vale p/
  //    TODOS os usuários. Guarda só a ORDEM (por path/título). Leitura liberada;
  //    gravação só p/ admin_master (gate no backend + no drag abaixo).
  const menuLayoutQuery = trpc.menuLayout.getGlobal.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const globalLayout = menuLayoutQuery.data as {
    sectionOrders?: Record<string, string[]>;
    itemOrders?: Record<string, Record<string, string[]>>;
  } | null | undefined;
  const saveMenuLayout = trpc.menuLayout.saveGlobal.useMutation();
  const isMasterUser = user?.role === 'admin_master';

  // ── Drag-and-drop de SEÇÕES inteiras ──────────────────────────────────────
  const SECTION_ORDER_KEY = `fc-section-order-${activeModule}`;
  const PINNED_LAST = "Ajuda"; // sempre fica por último
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`fc-section-order-${activeModule}`) || "[]"); } catch { return []; }
  });
  useEffect(() => {
    const fromGlobal = globalLayout?.sectionOrders?.[activeModule];
    if (fromGlobal && fromGlobal.length) { setSectionOrder(fromGlobal); return; }
    // Sem ordem global p/ este módulo: só o admin herda a cópia local (working copy);
    // usuários comuns voltam à ordem-padrão do código (sem ler localStorage).
    if (!isMasterUser) { setSectionOrder([]); return; }
    try { setSectionOrder(JSON.parse(localStorage.getItem(`fc-section-order-${activeModule}`) || "[]")); } catch { setSectionOrder([]); }
  }, [activeModule, globalLayout, isMasterUser]);
  const draggingSection = useRef<string | null>(null);
  const dragOverSection = useRef<string | null>(null);
  const [dragActiveSection, setDragActiveSection] = useState<string | null>(null);
  const [dragTargetSection, setDragTargetSection] = useState<string | null>(null);
  const sectionDidDrag = useRef(false);

  function handleSectionDragStart(title: string) {
    if (!isMasterUser) return; // só o Admin Master reordena (ordem global)
    if (title === PINNED_LAST) return;
    draggingSection.current = title;
    sectionDidDrag.current = false;
    setDragActiveSection(title);
  }
  function handleSectionDragOver(e: React.DragEvent, title: string) {
    e.preventDefault();
    sectionDidDrag.current = true;
    if (!draggingSection.current || title === PINNED_LAST || draggingSection.current === title) return;
    dragOverSection.current = title;
    setDragTargetSection(title);
  }
  function handleSectionDrop(orderedDisplaySections: MenuSection[]) {
    if (!draggingSection.current || !dragOverSection.current) { handleSectionDragEnd(); return; }
    const movable = orderedDisplaySections.filter(s => s.title !== PINNED_LAST);
    const titles = movable.map(s => s.title);
    const fromIdx = titles.indexOf(draggingSection.current);
    const toIdx   = titles.indexOf(dragOverSection.current);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) { handleSectionDragEnd(); return; }
    const newOrder = [...titles];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggingSection.current);
    setSectionOrder(newOrder);
    localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(newOrder));
    persistGlobalLayout(newOrder, undefined);
    handleSectionDragEnd();
  }
  function handleSectionDragEnd() {
    draggingSection.current = null;
    dragOverSection.current = null;
    setDragActiveSection(null);
    setDragTargetSection(null);
    setTimeout(() => { sectionDidDrag.current = false; }, 0);
  }

  // ── Drag-and-drop de itens do menu lateral ─────────────────────────────────
  const MENU_ORDER_KEY = `fc-menu-items-${activeModule}`;
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(`fc-menu-items-${activeModule}`) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    const fromGlobal = globalLayout?.itemOrders?.[activeModule];
    if (fromGlobal && Object.keys(fromGlobal).length) { setItemOrder(fromGlobal); return; }
    if (!isMasterUser) { setItemOrder({}); return; }
    try { setItemOrder(JSON.parse(localStorage.getItem(`fc-menu-items-${activeModule}`) || "{}")); } catch { setItemOrder({}); }
  }, [activeModule, globalLayout, isMasterUser]);
  const draggingItem = useRef<{ sectionTitle: string; path: string } | null>(null);
  const dragOverItem = useRef<{ sectionTitle: string; path: string } | null>(null);
  const [dragActiveItem, setDragActiveItem] = useState<string | null>(null);
  const [dragTargetItem, setDragTargetItem] = useState<string | null>(null);

  function getSidebarOrderedItems(section: MenuSection): MenuItem[] {
    const enabledItems = section.items.filter(item => {
      if (item.children && item.children.length > 0) {
        return item.children.some(c => isPageEnabled(c.path));
      }
      return isPageEnabled(item.path);
    }).map(item => {
      if (item.children) {
        return { ...item, children: item.children.filter(c => isPageEnabled(c.path)) };
      }
      return item;
    });
    const order = itemOrder[section.title];
    if (!order || order.length === 0) return enabledItems;
    return [...enabledItems].sort((a, b) => {
      const ai = order.indexOf(a.path);
      const bi = order.indexOf(b.path);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  const itemDidDrag = useRef(false);

  function handleSidebarDragStart(sectionTitle: string, path: string) {
    if (!isMasterUser) return; // só o Admin Master reordena (ordem global)
    draggingItem.current = { sectionTitle, path };
    itemDidDrag.current = false;
    setDragActiveItem(path);
  }

  function handleSidebarDragOver(e: React.DragEvent, sectionTitle: string, path: string) {
    e.preventDefault();
    itemDidDrag.current = true;
    if (draggingItem.current?.sectionTitle !== sectionTitle) return;
    dragOverItem.current = { sectionTitle, path };
    setDragTargetItem(path);
  }

  function handleSidebarDrop(sectionTitle: string) {
    if (!draggingItem.current || !dragOverItem.current) { handleSidebarDragEnd(); return; }
    if (draggingItem.current.sectionTitle !== sectionTitle) { handleSidebarDragEnd(); return; }

    const section = effectiveSections.find(s => s.title === sectionTitle);
    if (!section) { handleSidebarDragEnd(); return; }

    const ordered = getSidebarOrderedItems(section);
    const currentOrder = ordered.map(i => i.path);
    const fromIdx = currentOrder.indexOf(draggingItem.current.path);
    const toIdx = currentOrder.indexOf(dragOverItem.current.path);

    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) { handleSidebarDragEnd(); return; }

    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggingItem.current.path);

    const newItemOrder = { ...itemOrder, [sectionTitle]: newOrder };
    setItemOrder(newItemOrder);
    localStorage.setItem(`fc-menu-items-${activeModule}`, JSON.stringify(newItemOrder));
    persistGlobalLayout(undefined, newItemOrder);
    handleSidebarDragEnd();
  }

  function handleSidebarDragEnd() {
    draggingItem.current = null;
    dragOverItem.current = null;
    setDragActiveItem(null);
    setDragTargetItem(null);
    setTimeout(() => { itemDidDrag.current = false; }, 0);
  }

  // Grava a NOVA ordem (seções e/ou itens do módulo ativo) como ordem GLOBAL,
  // válida p/ todos. Só o Admin Master persiste (backend também valida).
  function persistGlobalLayout(nextSectionOrder?: string[], nextItemOrder?: Record<string, string[]>) {
    if (!isMasterUser) return;
    const base = (globalLayout && typeof globalLayout === "object") ? globalLayout : {};
    const sectionOrders: Record<string, string[]> = { ...(base.sectionOrders || {}) };
    const itemOrders: Record<string, Record<string, string[]>> = { ...(base.itemOrders || {}) };
    if (nextSectionOrder) sectionOrders[activeModule] = nextSectionOrder;
    if (nextItemOrder) itemOrders[activeModule] = nextItemOrder;
    saveMenuLayout.mutate(
      { config: { sectionOrders, itemOrders } },
      { onSuccess: () => { menuLayoutQuery.refetch(); } },
    );
  }
  const [expandedMenuItems, setExpandedMenuItems] = useState<Record<string, boolean>>({});
  const toggleMenuItem = (path: string) => setExpandedMenuItems(prev => ({ ...prev, [path]: !prev[path] }));
  const [menuSearch, setMenuSearch] = useState("");
  const menuSearchRef = useRef<HTMLInputElement>(null);

  const [sidebarActiveParam, setSidebarActiveParam] = useState<string>(() => {
    const s = window.location.search;
    return s.startsWith('?') ? s.slice(1) : '';
  });

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
  useEffect(() => {
    const s = window.location.search;
    setSidebarActiveParam(s.startsWith('?') ? s.slice(1) : '');
  }, [location]);
  useEffect(() => {
    const handler = () => {
      const raw = sessionStorage.getItem('_navParams');
      if (raw) setSidebarActiveParam(raw);
    };
    window.addEventListener('navParamsUpdated', handler);
    return () => window.removeEventListener('navParamsUpdated', handler);
  }, []);

  const isAdminUser = user?.role === 'admin' || user?.role === 'admin_master';
  const { isAdminMaster: permIsAdminMaster, canAccessFeature, canAccessModule, accessibleModules, hasGroup, groupCanAccessRoute, canViewPage } = usePermissions();

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
    map.set('/sst/integracao', { moduleId: 'sst', featureKey: 'epis' });
    map.set('/painel/juridico', { moduleId: 'juridico', featureKey: 'processos-trabalhistas' });
    map.set('/painel/tributario', { moduleId: 'juridico', featureKey: 'processos-tributarios' });
    map.set('/painel/civil', { moduleId: 'juridico', featureKey: 'processos-civis' });
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

    // Apply saved menu config if available (para TODOS os módulos — assim o usuário
    // pode ocultar/renomear/reordenar itens em qualquer módulo via Painel de Controle).
    if (savedMenuConfig) {
      // Build a map of all available items by path for icon lookup.
      // Indexa RECURSIVAMENTE (inclui `children`) — assim folhas aninhadas como
      // /aviso-previo e /pedido-demissao (filhos de "Demissão") também são
      // reconhecidas como pertencentes ao módulo ativo.
      // Apenas paths do módulo ativo (+ adminSections) são "permitidos" — paths
      // salvos que pertencem a OUTROS módulos são ignorados aqui para evitar
      // contaminação cruzada entre módulos.
      const allItemsByPath = new Map<string, MenuItem>();
      const indexLeavesAndParents = (items: MenuItem[]) => {
        for (const item of items) {
          if (item.children && item.children.length > 0) {
            // Pai não-navegável: descer nos filhos.
            indexLeavesAndParents(item.children);
          } else {
            allItemsByPath.set(item.path, item);
          }
        }
      };
      for (const sec of sections) indexLeavesAndParents(sec.items);
      const allowedPaths = new Set(allItemsByPath.keys());

      // Reconstruct sections from saved config — apenas itens cujo path pertence
      // ao módulo ativo (allowedPaths). Aplica label customizado e respeita visible.
      const customSections: MenuSection[] = [];
      for (const savedSection of savedMenuConfig) {
        const items: MenuItem[] = [];
        for (const savedItem of savedSection.items) {
          if (!savedItem.visible) continue;
          if (DEPRECATED_PATHS.has(savedItem.path)) continue;
          if (!allowedPaths.has(savedItem.path)) continue; // path de outro módulo — ignora
          const original = allItemsByPath.get(savedItem.path)!;
          items.push({
            ...original,
            label: savedItem.label || original.label,
          });
        }
        if (items.length > 0) {
          customSections.push({ title: savedSection.title, items });
        }
      }

      // Add any leaves from code that are NOT in saved config (new items added after save).
      // Considera apenas paths do módulo ativo já presentes em `savedMenuConfig`.
      // Walk recursivo: para itens com `children`, emite apenas as folhas faltantes
      // (não o pai não-navegável, ex: "Demissão"/`/demissao`).
      const savedPathsThisModule = new Set(
        savedMenuConfig.flatMap(s => s.items.map(i => i.path)).filter(p => allowedPaths.has(p))
      );
      const collectMissingLeaves = (items: MenuItem[]): MenuItem[] => {
        const out: MenuItem[] = [];
        for (const item of items) {
          if (item.children && item.children.length > 0) {
            out.push(...collectMissingLeaves(item.children));
          } else if (!savedPathsThisModule.has(item.path)) {
            out.push(item);
          }
        }
        return out;
      };
      for (const sec of sections) {
        const missingItems = collectMissingLeaves(sec.items);
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

    // Filter admin-only paths: only master user can see/access these
    if (!isMasterUser) {
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
      const filterWithChildren = (items: MenuItem[], checkFn: (item: MenuItem) => boolean): MenuItem[] => {
        return items.map(item => {
          if (item.children && item.children.length > 0) {
            const filteredChildren = item.children.filter(checkFn);
            if (filteredChildren.length === 0) return null;
            return { ...item, children: filteredChildren };
          }
          return checkFn(item) ? item : null;
        }).filter(Boolean) as MenuItem[];
      };
      if (hasGroup) {
        const groupCheck = (item: MenuItem) => {
          if (adminOnlyPaths.includes(item.path) || item.path === '/revisoes') return true;
          if (item.path === '/ajuda') return true;
          return groupCanAccessRoute(item.path);
        };
        sections = sections.map(s => ({ ...s, items: filterWithChildren(s.items, groupCheck) }));
      } else {
        const individualCheck = (item: MenuItem) => {
          if (adminOnlyPaths.includes(item.path) || item.path === '/revisoes') return true;
          if (item.path === '/painel' || item.path.startsWith('/painel/')) return true;
          if (item.path === '/ajuda') return true;
          const sharedPaths = ['/empresas', '/obras', '/obras/efetivo', '/setores', '/funcoes', '/clientes', '/gerenciadoras'];
          if (sharedPaths.includes(item.path)) return accessibleModules.length > 0;
          if (item.path === '/dashboards') return accessibleModules.length > 0;
          const itemBasePath = item.path.split('?')[0];
          const featureInfo = routeToFeatureKey.get(itemBasePath);
          if (featureInfo) return canAccessFeature(featureInfo.moduleId, featureInfo.featureKey);
          if (item.path.includes('?')) {
            const baseFeatureInfo = routeToFeatureKey.get(itemBasePath);
            if (baseFeatureInfo) return canAccessFeature(baseFeatureInfo.moduleId, baseFeatureInfo.featureKey);
          }
          return false;
        };
        sections = sections.map(s => ({ ...s, items: filterWithChildren(s.items, individualCheck) }));
      }
    }
    // Inject dynamic tab sections when inside a Planejamento project page
    if (activeModule === "planejamento") {
      const planMatch = location.match(/^\/planejamento\/(\d+)$/);
      if (planMatch) {
        const planId = planMatch[1];
        const TAB_PAGE_MAP: Record<string, string> = {
          "visao-geral": "visao_geral",
          "cronograma": "cronograma",
          "gantt": "gantt",
          "cronograma-financeiro": "financeiro",
          "curva-s": "curva_s",
          "avanco": "avanco_semanal",
          "caminho-critico": "caminho_critico",
          "compras": "",
          "prev-medicao": "previsao_medicao",
          "prog-semanal": "prog_semanal",
          "diagrama-rede": "diagrama_rede",
          "custo-rh": "custo_rh",
          "revisoes": "revisoes",
          "refis": "refis",
          "efetivo": "efetivo",
          "bim-3d": "bim_3d",
        };
        const canSeeTab = (tabId: string) => {
          if (permIsAdminMaster) return true;
          const pageId = TAB_PAGE_MAP[tabId];
          if (!pageId) return true;
          return canViewPage("planejamento", pageId);
        };
        const allPlanTabs: (MenuItem & { tabId: string })[] = [
          { icon: BarChart3,     label: "Visão Geral",       path: `/planejamento/${planId}?tab=visao-geral`, tabId: "visao-geral" },
          { icon: CalendarDays,  label: "Cronograma",        path: `/planejamento/${planId}?tab=cronograma`, tabId: "cronograma" },
          { icon: ClipboardCheck,label: "Gantt",             path: `/planejamento/${planId}?tab=gantt`, tabId: "gantt" },
          { icon: DollarSign,    label: "Crono. Financeiro", path: `/planejamento/${planId}?tab=cronograma-financeiro`, tabId: "cronograma-financeiro" },
          { icon: TrendingUp,    label: "Curva S",           path: `/planejamento/${planId}?tab=curva-s`, tabId: "curva-s" },
          { icon: BarChart3,     label: "Avanço Semanal",    path: `/planejamento/${planId}?tab=avanco`, tabId: "avanco" },
          { icon: AlertTriangle, label: "Caminho Crítico",   path: `/planejamento/${planId}?tab=caminho-critico`, tabId: "caminho-critico" },
          { icon: ShoppingCart,  label: "Cronograma de Compras", path: `/planejamento/${planId}?tab=compras`, tabId: "compras" },
          { icon: ClipboardList, label: "Prev. Medição",     path: `/planejamento/${planId}?tab=prev-medicao`, tabId: "prev-medicao" },
          { icon: CalendarDays,  label: "Prog. Semanal",     path: `/planejamento/${planId}?tab=prog-semanal`, tabId: "prog-semanal" },
          { icon: Network,       label: "Diagrama de Rede",  path: `/planejamento/${planId}?tab=diagrama-rede`, tabId: "diagrama-rede" },
          { icon: Users,         label: "Custo RH",          path: `/planejamento/${planId}?tab=custo-rh`, tabId: "custo-rh" },
          { icon: HardHat,       label: "Efetivo",           path: `/planejamento/${planId}?tab=efetivo`, tabId: "efetivo" },
          { icon: Sparkles,      label: "Efetivo × IA",      path: `/planejamento/${planId}?tab=efetivo-ia`, tabId: "efetivo-ia" },
          { icon: GitBranch,     label: "Revisões",          path: `/planejamento/${planId}?tab=revisoes`, tabId: "revisoes" },
          { icon: FileText,      label: "REFIS",             path: `/planejamento/${planId}?tab=refis`, tabId: "refis" },
          { icon: Brain,         label: "BIM 3D",            path: `/planejamento/${planId}?tab=bim-3d`, tabId: "bim-3d" },
        ];
        const planTabItems: MenuItem[] = allPlanTabs.filter(t => canSeeTab(t.tabId));
        sections = [...sections, { title: "Abas do Projeto", items: planTabItems }];
      }
    }

    // Rev. 1271 — Badges de solicitações HE/MO no módulo RH/DP
    if (activeModule === "rh-dp" && requestsBadgeQ.data) {
      const rb = requestsBadgeQ.data;
      sections = sections.map(s => ({
        ...s,
        items: s.items.map(item => {
          if (item.path === "/solicitacao-he" && rb.heNovas > 0) {
            return { ...item, badge: rb.heNovas, badgePulse: true };
          }
          if (item.path === "/solicitacao-mdo" && rb.mdoNovas > 0) {
            return { ...item, badge: rb.mdoNovas, badgePulse: true };
          }
          // Rev. 1277 — Bolinha vermelha para Apontamentos de Campo pendentes.
          // Só some quando o apontamento é resolvido/arquivado pelo RH.
          if (item.path === "/apontamentos-campo" && (rb as any).apontamentosNovas > 0) {
            return { ...item, badge: (rb as any).apontamentosNovas, badgePulse: true };
          }
          return item;
        }),
      }));
    }

    // Rev. 2058 — Badge vermelho piscante em "Integração SST" do módulo SST.
    if (activeModule === "sst" && sstBadgeQ.data) {
      const sb = sstBadgeQ.data;
      sections = sections.map(s => ({
        ...s,
        items: s.items.map(item => {
          if (item.path === "/sst/integracao" && sb.pendentesAuto > 0) {
            return { ...item, badge: sb.pendentesAuto, badgePulse: true };
          }
          return item;
        }),
      }));
    }

    if (activeModule === "compras" && comprasBadgeQ.data) {
      const bd = comprasBadgeQ.data;
      sections = sections.map(s => ({
        ...s,
        items: s.items.map(item => {
          if (item.path === "/compras/aprovacoes" && bd.aprovacoesPendentes > 0) {
            return { ...item, badge: bd.aprovacoesPendentes, badgePulse: bd.emergenciais > 0 };
          }
          if (item.path === "/compras/emergencial" && bd.emergenciais > 0) {
            return { ...item, badge: bd.emergenciais, badgePulse: true };
          }
          return item;
        }),
      }));
    }

    return sections.filter(s => s.items.length > 0);
  }, [activeModule, location, isAdminUser, isMasterUser, permIsAdminMaster, canAccessFeature, accessibleModules, hasGroup, groupCanAccessRoute, canViewPage, savedMenuConfig, comprasBadgeQ.data, requestsBadgeQ.data, sstBadgeQ.data]);

  const orderedSections = useMemo(() => {
    const pinned   = effectiveSections.filter(s => s.title === PINNED_LAST);
    const movable  = effectiveSections.filter(s => s.title !== PINNED_LAST);
    if (sectionOrder.length === 0) return [...movable, ...pinned];
    const sorted = [...movable].sort((a, b) => {
      const ai = sectionOrder.indexOf(a.title);
      const bi = sectionOrder.indexOf(b.title);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return [...sorted, ...pinned];
  }, [effectiveSections, sectionOrder]);

  const filteredSections = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return orderedSections;
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nq = normalize(q);
    return orderedSections.map(section => {
      const matchItems = (items: MenuItem[]): MenuItem[] =>
        items.reduce<MenuItem[]>((acc, item) => {
          const labelMatch = normalize(item.label).includes(nq);
          const childMatches = item.children ? matchItems(item.children) : [];
          if (labelMatch) {
            acc.push(item);
          } else if (childMatches.length > 0) {
            acc.push({ ...item, children: childMatches });
          }
          return acc;
        }, []);
      return { ...section, items: matchItems(section.items) };
    }).filter(s => s.items.length > 0);
  }, [orderedSections, menuSearch]);

  const flattenItems = (items: MenuItem[]): MenuItem[] => items.flatMap(i => i.children ? [i, ...i.children] : [i]);
  const allEffectiveItems = effectiveSections.flatMap(s => flattenItems(s.items));
  const allModuleItems = Object.values(MODULE_SECTIONS).flatMap(sections => sections.flatMap(s => flattenItems(s.items)));
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
    setMenuSearch("");
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
    { id: "rh-dp",        label: "RH & DP",      icon: Users,       color: "text-blue-400",    bg: "bg-blue-500/20",    path: "/painel/rh",            canSee: () => (permIsAdminMaster || canAccessModule("rh-dp"))        && isModEnabled("rh-dp") },
    { id: "sst",          label: "SST",           icon: Shield,      color: "text-emerald-400", bg: "bg-emerald-500/20", path: "/painel/sst",            canSee: () => (permIsAdminMaster || canAccessModule("sst"))          && isModEnabled("sst") },
    { id: "juridico", label: "Jurídico", icon: Gavel, color: "text-amber-400", bg: "bg-amber-500/20", path: "/painel/juridico", canSee: () => (permIsAdminMaster || canAccessModule("juridico") || canAccessModule("juridico-trabalhista") || canAccessModule("juridico-tributario") || canAccessModule("juridico-civil")) && (isModEnabled("juridico") || isModEnabled("juridico-trabalhista") || isModEnabled("juridico-tributario") || isModEnabled("juridico-civil")) },
    { id: "avaliacao",    label: "Avaliação",     icon: Star,        color: "text-amber-400",   bg: "bg-amber-500/20",   path: "/avaliacao-desempenho",  canSee: () => (permIsAdminMaster || canAccessModule("avaliacao"))    && isModEnabled("avaliacao") },
    { id: "terceiros",    label: "Terceiros",     icon: HardHat,     color: "text-orange-400",  bg: "bg-orange-500/20",  path: "/terceiros/painel",      canSee: () => (permIsAdminMaster || canAccessModule("terceiros"))    && isModEnabled("terceiros") },
    { id: "parceiros",    label: "Parceiros",     icon: Handshake,   color: "text-purple-400",  bg: "bg-purple-500/20",  path: "/parceiros/painel",      canSee: () => (permIsAdminMaster || canAccessModule("parceiros"))    && isModEnabled("parceiros") },
    { id: "orcamento",    label: "Orçamento",     icon: Calculator,  color: "text-cyan-400",    bg: "bg-cyan-500/20",    path: "/orcamento/painel",      canSee: () => (permIsAdminMaster || canAccessModule("orcamento"))    && isModEnabled("orcamento") },
    { id: "planejamento", label: "Planejamento",  icon: Target,      color: "text-green-400",   bg: "bg-green-500/20",   path: "/planejamento",          canSee: () => (permIsAdminMaster || canAccessModule("planejamento")) && isModEnabled("planejamento") },
    { id: "cadastro",     label: "Cadastro",      icon: BookOpen,    color: "text-indigo-400",  bg: "bg-indigo-500/20",  path: "/empresas",              canSee: () => (permIsAdminMaster || canAccessModule("cadastro"))     && isModEnabled("cadastro") },
    { id: "compras",      label: "Compras",       icon: ShoppingCart,color: "text-rose-400",    bg: "bg-rose-500/20",    path: "/compras/solicitacoes",  canSee: () => (permIsAdminMaster || canAccessModule("compras"))      && isModEnabled("compras") },
    { id: "almoxarifado", label: "Almoxarifado",  icon: Warehouse,   color: "text-emerald-400", bg: "bg-emerald-500/20", path: "/almoxarifado",          canSee: () => (permIsAdminMaster || canAccessModule("almoxarifado")) && isModEnabled("almoxarifado") },
    { id: "financeiro",   label: "Financeiro",    icon: DollarSign,  color: "text-yellow-400",  bg: "bg-yellow-500/20",  path: "/financeiro",            canSee: () => (permIsAdminMaster || canAccessModule("financeiro"))   && isModEnabled("financeiro") },
    { id: "medicao",      label: "Medição",       icon: Construction,color: "text-orange-400",  bg: "bg-orange-500/20",  path: "/medicao",               canSee: () => (permIsAdminMaster || canAccessModule("medicao"))      && isModEnabled("medicao") },
    { id: "medicao-terceiros", label: "Medição Terceiros", icon: Receipt, color: "text-orange-400", bg: "bg-orange-500/20", path: "/terceiros/medicoes", canSee: () => (permIsAdminMaster || canAccessModule("terceiros") || canAccessModule("medicao-terceiros")) && isModEnabled("terceiros") && isModEnabled("medicao-terceiros") },
    { id: "gestao-documentos", label: "Proj./Doc. Técnicos", icon: FolderOpen, color: "text-sky-400", bg: "bg-sky-500/20", path: "/gestao-documentos", canSee: () => (permIsAdminMaster || canAccessModule("gestao-documentos")) && isModEnabled("gestao-documentos") },
    { id: "operacional", label: "Operacional", icon: HardHat, color: "text-amber-400", bg: "bg-amber-500/20", path: "/operacional/painel", canSee: () => (permIsAdminMaster || canAccessModule("operacional")) && isModEnabled("operacional") },
    { id: "frotas", label: "Frotas", icon: Truck, color: "text-cyan-400", bg: "bg-cyan-500/20", path: "/frotas/painel", canSee: () => (permIsAdminMaster || canAccessModule("frotas")) && isModEnabled("frotas") },
    { id: "comunicados-internos", label: "Comunicados Internos", icon: Megaphone, color: "text-blue-400",   bg: "bg-blue-500/20",   path: "/comunicados-internos", canSee: () => (permIsAdminMaster || canAccessModule("comunicados-internos")) && isModEnabled("comunicados-internos") },
    { id: "curriculos",           label: "Currículos",           icon: Briefcase, color: "text-amber-400",  bg: "bg-amber-500/20",  path: "/curriculos",           canSee: () => (permIsAdminMaster || canAccessModule("curriculos"))           && isModEnabled("curriculos") },
    { id: "oraculo",              label: "Oráculo",              icon: Sparkles,  color: "text-violet-400", bg: "bg-violet-500/20", path: "/oraculo",              canSee: () => permIsAdminMaster },
    { id: "portal-cliente",       label: "Portal do Cliente",    icon: ShieldCheck, color: "text-indigo-400", bg: "bg-indigo-500/20", path: "/clientes/portal",     canSee: () => (permIsAdminMaster || canAccessModule("portal-cliente")) && isModEnabled("portal-cliente") },
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortedModuleDefs.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-flex h-5 w-5 rounded ${m.bg} items-center justify-center shrink-0`}>
                          <m.icon className={`h-3 w-3 ${m.color}`} />
                        </span>
                        {m.label}
                      </span>
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

          {!isCollapsed && (
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/40 pointer-events-none" />
                <input
                  ref={menuSearchRef}
                  type="text"
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  placeholder="Buscar no menu..."
                  className="w-full h-8 pl-8 pr-7 text-xs rounded-md bg-sidebar-accent/50 border border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-[#D4A843]/50 focus:border-[#D4A843]/50 transition-colors"
                />
                {menuSearch && (
                  <button
                    onClick={() => { setMenuSearch(""); menuSearchRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <SidebarContent
            ref={sidebarScrollRef}
            className="gap-0"
            onScroll={(e) => { _sidebarScrollTop = (e.target as HTMLDivElement).scrollTop; }}
          >
            {filteredSections.map(section => {
              const isPinned = section.title === PINNED_LAST;
              const isSectionDragging = dragActiveSection === section.title;
              const isSectionTarget  = dragTargetSection  === section.title && !isSectionDragging;
              return (
              <div
                key={section.title}
                className={`mb-1 transition-all ${isSectionDragging ? "opacity-40" : ""} ${isSectionTarget ? "ring-1 ring-[#D4A843]/60 rounded-lg bg-sidebar-accent/20" : ""}`}
                draggable={!isCollapsed && !isPinned && isMasterUser}
                onDragStart={() => handleSectionDragStart(section.title)}
                onDragOver={(e) => handleSectionDragOver(e, section.title)}
                onDrop={() => handleSectionDrop(filteredSections)}
                onDragEnd={handleSectionDragEnd}
              >
                {!isCollapsed ? (
                  <div className="flex items-center w-full group/sec">
                    {!isPinned && isMasterUser && (
                      <span
                        className="pl-2 pr-1 py-2 cursor-grab opacity-0 group-hover/sec:opacity-60 hover:!opacity-100 transition-opacity text-sidebar-foreground/40"
                        title="Arrastar para reorganizar (ordem vale para todos)"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <button
                      onClick={() => toggleSection(section.title)}
                      className={`flex items-center justify-between flex-1 ${!isPinned ? "pl-1" : "pl-4"} pr-4 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors`}
                    >
                      <span className="flex items-center gap-1">
                        {section.title}
                        {isPinned && <span className="text-[8px] opacity-40 normal-case tracking-normal">(fixo)</span>}
                      </span>
                      {expandedSections[section.title] ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ) : null}
                {(isCollapsed || expandedSections[section.title] || menuSearch.trim()) ? (
                  <SidebarMenu className="px-2 py-0.5">
                    {getSidebarOrderedItems(section).map((item: any) => {
                      const hasChildren = item.children && item.children.length > 0;
                      const childActive = hasChildren && item.children.some((c: MenuItem) => location === c.path);
                      const isParentExpanded = expandedMenuItems[item.path] || childActive || !!menuSearch.trim();
                      const isActive = item.path.includes('?')
                        ? location === item.path.split('?')[0] && item.path.split('?')[1] === sidebarActiveParam
                        : !hasChildren && location === item.path;
                      const isDragging = dragActiveItem === item.path;
                      const isDropTarget = dragTargetItem === item.path;

                      const handleItemClick = (menuItem: MenuItem) => {
                        if (menuItem.soon) {
                          toast("Em breve", { description: `O módulo ${menuItem.label} está em desenvolvimento.` });
                          return;
                        }
                        if (menuItem.path.includes('?')) {
                          const [basePath, queryString] = menuItem.path.split('?');
                          sessionStorage.setItem('_navParams', queryString);
                          setSidebarActiveParam(queryString);
                          if (location === basePath) {
                            window.dispatchEvent(new Event('navParamsUpdated'));
                          } else {
                            setLocation(basePath);
                            setTimeout(() => { window.dispatchEvent(new Event('navParamsUpdated')); }, 100);
                          }
                        } else {
                          setLocation(menuItem.path);
                        }
                      };

                      if (hasChildren) {
                        return (
                          <div
                            key={item.path}
                            draggable={!isCollapsed && isMasterUser}
                            onDragStart={() => handleSidebarDragStart(section.title, item.path)}
                            onDragOver={(e: React.DragEvent) => handleSidebarDragOver(e, section.title, item.path)}
                            onDrop={() => handleSidebarDrop(section.title)}
                            onDragEnd={handleSidebarDragEnd}
                            onClickCapture={(e: React.MouseEvent) => { if (itemDidDrag.current) { e.stopPropagation(); e.preventDefault(); } }}
                            style={{ cursor: (isCollapsed || !isMasterUser) ? undefined : "grab", opacity: isDragging ? 0.4 : 1 }}
                            className={`transition-all ${isDropTarget && !isDragging ? "ring-1 ring-[#D4A843]/60 rounded-lg bg-sidebar-accent/30" : ""}`}
                          >
                            <SidebarMenuItem>
                              <SidebarMenuButton
                                isActive={childActive}
                                onClick={() => toggleMenuItem(item.path)}
                                tooltip={item.label}
                                className="h-9 transition-all font-normal"
                              >
                                <item.icon className={`h-4 w-4 ${childActive ? "text-[#D4A843]" : ""}`} />
                                <span>{item.label}</span>
                                {!isCollapsed && (
                                  isParentExpanded
                                    ? <ChevronDown className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/50" />
                                    : <ChevronRight className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/50" />
                                )}
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            {isParentExpanded && !isCollapsed && item.children.map((child: MenuItem) => {
                              const childIsActive = location === child.path;
                              return (
                                <SidebarMenuItem key={child.path} className="pl-4">
                                  <SidebarMenuButton
                                    isActive={childIsActive}
                                    onClick={() => handleItemClick(child)}
                                    tooltip={child.label}
                                    className="h-8 transition-all font-normal text-[13px]"
                                  >
                                    <child.icon className={`h-3.5 w-3.5 ${childIsActive ? "text-[#D4A843]" : ""}`} />
                                    <span>{child.label}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })}
                          </div>
                        );
                      }

                      return (
                        <SidebarMenuItem
                          key={item.path}
                          draggable={!isCollapsed && isMasterUser}
                          onDragStart={() => handleSidebarDragStart(section.title, item.path)}
                          onDragOver={(e: React.DragEvent) => handleSidebarDragOver(e, section.title, item.path)}
                          onDrop={() => handleSidebarDrop(section.title)}
                          onDragEnd={handleSidebarDragEnd}
                          onClickCapture={(e: React.MouseEvent) => { if (itemDidDrag.current) { e.stopPropagation(); e.preventDefault(); } }}
                          style={{ cursor: (isCollapsed || !isMasterUser) ? undefined : "grab", opacity: isDragging ? 0.4 : 1 }}
                          className={`transition-all ${isDropTarget && !isDragging ? "ring-1 ring-[#D4A843]/60 rounded-lg bg-sidebar-accent/30" : ""}`}
                        >
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => handleItemClick(item)}
                            tooltip={item.label}
                            className={`h-9 transition-all font-normal ${item.soon ? "opacity-50" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-[#D4A843]" : ""} ${item.badge && item.badge > 0 && item.badgePulse ? "text-red-500 animate-pulse" : ""}`}
                            />
                            <span>{item.label}</span>
                            {item.badge && item.badge > 0 && !isCollapsed ? (
                              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center ${item.badgePulse ? "bg-red-500 text-white animate-pulse" : "bg-orange-100 text-orange-700"}`}>
                                {item.badge}
                              </span>
                            ) : null}
                            {item.badge && item.badge > 0 && isCollapsed ? (
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                            ) : null}
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
              );
            })}
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
              <DropdownMenuContent align="end" className="w-56">
                {isMasterUser && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/configuracoes/menu")}
                    className="cursor-pointer"
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    <span>Personalizar Menu</span>
                  </DropdownMenuItem>
                )}
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
        {/* Rev. 2450 — Banner legado removido; ver <AuditoriaAlmoxPendingAlert /> global. */}
        <main className={`flex-1 ${noPadding ? "p-0 overflow-hidden" : "p-2 sm:p-3 md:p-4"}`}>{children}</main>
      </SidebarInset>
      <IAModuloAutoDetect location={location} />
      <ActivityTracker />
    </>
  );
}

function CompanyHeader({ isMobile, activeLabel }: { isMobile: boolean; activeLabel: string }) {
  const { selectedCompanyId, setSelectedCompanyId, companies, selectedCompany } = useCompany();
  const { activeModule } = useModule();
  const [, setLocation] = useLocation();
  const logoUrl = selectedCompany?.logoUrl;

  return (
    <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
      <div className="flex items-center gap-2">
        {isMobile ? <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" /> : null}
        {/* Rev. 1813 — Botão Voltar (histórico do navegador) presente em
            TODAS as telas, conforme pedido do usuário. Usa window.history.back()
            para respeitar a navegação real do usuário (não cai sempre na home
            do módulo). Desabilitado quando não há histórico (1ª página). */}
        <button
          onClick={() => window.history.length > 1 ? window.history.back() : setLocation(MODULE_HOME_ROUTES[activeModule] || "/")}
          title="Voltar"
          aria-label="Voltar"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="text-xs font-medium hidden sm:inline">Voltar</span>
        </button>
        <button
          onClick={() => setLocation(MODULE_HOME_ROUTES[activeModule] || "/")}
          title="Tela Inicial"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <Home className="h-3.5 w-3.5" />
          <span className="text-xs font-medium hidden sm:inline">Início</span>
        </button>
        <span className="text-muted-foreground/40 text-sm hidden sm:inline">/</span>
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


type IAModulo = "planejamento" | "orcamento" | "compras" | "rh" | "financeiro" | "sst" | "medicao";

const ROUTE_TO_MODULO: [RegExp, IAModulo][] = [
  [/^\/planejamento/, "planejamento"],
  [/^\/orcamento/, "orcamento"],
  [/^\/(compras|almoxarifado)/, "compras"],
  [/^\/(painel\/rh|funcionarios|colaboradores|folha-pagamento|folha|ferias|seguro-vida|ponto|fechamento-ponto|espelho-ponto|rescisao|admissao|banco-horas|aviso-previo|pedido-demissao|hora-extra|solicitacao-he|solicitacao-mdo|gestao-competencias|controle-documentos|vale-alimentacao|dissidio|feriados|modulo-pj|contrato-pj|apontamentos-campo|comunicados-internos|curriculos)/, "rh"],
  [/^\/financeiro/, "financeiro"],
  [/^\/(painel\/sst|sst|epis?|aso|cipa|treinamento|integracao)/, "sst"],
  [/^\/medicao/, "medicao"],
];

function IAModuloAutoDetect({ location }: { location: string }) {
  const detected = useMemo(() => {
    for (const [re, mod] of ROUTE_TO_MODULO) {
      if (re.test(location)) return mod;
    }
    return null;
  }, [location]);

  const projetoId = useMemo(() => {
    if (detected === "planejamento") {
      const m = location.match(/\/planejamento\/(\d+)/);
      return m ? parseInt(m[1]) : undefined;
    }
    return undefined;
  }, [location, detected]);

  if (!detected) return null;
  return <IAModuloChat modulo={detected} projetoId={projetoId} />;
}
