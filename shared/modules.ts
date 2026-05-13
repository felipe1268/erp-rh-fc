// Definição dos módulos do ERP e perfis de acesso

export const ERP_MODULES = {
  core_rh: { key: "core_rh", label: "Core RH", icon: "Users" },
  sst: { key: "sst", label: "SST", icon: "ShieldCheck" },
  ativos: { key: "ativos", label: "Gestão de Ativos", icon: "Wrench" },
  auditoria: { key: "auditoria", label: "Auditoria e Qualidade", icon: "ClipboardCheck" },
  cipa: { key: "cipa", label: "CIPA", icon: "Vote" },
  ponto_folha: { key: "ponto_folha", label: "Ponto e Folha", icon: "Clock" },
  avaliacao: { key: "avaliacao", label: "Avaliação de Desempenho", icon: "Star" },
  usuarios: { key: "usuarios", label: "Usuários e Permissões", icon: "Lock" },
  dashboards: { key: "dashboards", label: "Dashboards", icon: "BarChart3" },
  empresas: { key: "empresas", label: "Empresas", icon: "Building2" },
  auditoria_sistema: { key: "auditoria_sistema", label: "Auditoria do Sistema", icon: "FileText" },
} as const;

export type ModuleKey = keyof typeof ERP_MODULES;

export const MODULE_KEYS = Object.keys(ERP_MODULES) as ModuleKey[];

export const PROFILE_TYPES = {
  adm_master: { key: "adm_master", label: "ADM Master", description: "Acesso total ao sistema, cria outros ADMs, gerencia empresas" },
  adm: { key: "adm", label: "ADM", description: "Gerencia módulos, cadastra colaboradores, configura o sistema" },
  operacional: { key: "operacional", label: "Operacional", description: "Acesso restrito aos módulos do dia a dia" },
  avaliador: { key: "avaliador", label: "Avaliador", description: "Acesso exclusivo ao módulo de Avaliação de Desempenho" },
  consulta: { key: "consulta", label: "Consulta", description: "Visualização de dashboards e relatórios sem edição" },
} as const;

export type ProfileType = keyof typeof PROFILE_TYPES;

// Permissões padrão por perfil
export const DEFAULT_PERMISSIONS: Record<ProfileType, Record<ModuleKey, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>> = {
  adm_master: Object.fromEntries(MODULE_KEYS.map(k => [k, { canView: true, canCreate: true, canEdit: true, canDelete: true }])) as any,
  adm: Object.fromEntries(MODULE_KEYS.map(k => [k, { canView: true, canCreate: true, canEdit: true, canDelete: k !== "empresas" && k !== "auditoria_sistema" }])) as any,
  operacional: Object.fromEntries(MODULE_KEYS.map(k => [k, {
    canView: ["core_rh", "sst", "ativos", "ponto_folha", "dashboards"].includes(k),
    canCreate: ["core_rh", "sst", "ativos", "ponto_folha"].includes(k),
    canEdit: ["core_rh", "sst", "ativos", "ponto_folha"].includes(k),
    canDelete: false,
  }])) as any,
  avaliador: Object.fromEntries(MODULE_KEYS.map(k => [k, {
    canView: k === "avaliacao" || k === "dashboards",
    canCreate: k === "avaliacao",
    canEdit: k === "avaliacao",
    canDelete: false,
  }])) as any,
  consulta: Object.fromEntries(MODULE_KEYS.map(k => [k, {
    canView: k === "dashboards" || k === "core_rh",
    canCreate: false,
    canEdit: false,
    canDelete: false,
  }])) as any,
};

export const EMPLOYEE_STATUS = [
  { value: "Ativo", label: "Ativo", color: "#22c55e" },
  { value: "Ferias", label: "Férias", color: "#3b82f6" },
  { value: "Afastado", label: "Afastado", color: "#f59e0b" },
  { value: "Licenca", label: "Licença", color: "#8b5cf6" },
  { value: "Aviso", label: "Aviso Prévio", color: "#ca8a04" },
  { value: "Desligado", label: "Desligado", color: "#ef4444" },
  { value: "Recluso", label: "Recluso", color: "#6b7280" },
] as const;

export type EmployeeStatus = typeof EMPLOYEE_STATUS[number]["value"];

// Status que podem ser definidos manualmente pelo usuário (dropdown limitado)
// Férias e Licença são calculados automaticamente pelo sistema
// Afastado pode ser definido manualmente OU automaticamente
export const EMPLOYEE_STATUS_MANUAL = [
  { value: "Ativo", label: "Ativo", color: "#22c55e" },
  { value: "Afastado", label: "Afastado", color: "#f59e0b" },
  { value: "Recluso", label: "Recluso", color: "#6b7280" },
  { value: "Desligado", label: "Desligado", color: "#ef4444" },
] as const;

// ============================================================
// MAPA DE MÓDULOS E FUNCIONALIDADES GRANULARES
// Usado para controle de acesso por usuário na sidebar e rotas
// REGRA: Toda funcionalidade listada na sidebar DEVE ter entrada aqui
// ============================================================

export type ActiveModuleId =
  | "rh-dp"
  | "sst"
  | "juridico"
  | "juridico-trabalhista"
  | "juridico-tributario"
  | "juridico-civil"
  | "avaliacao"
  | "terceiros"
  | "parceiros"
  | "planejamento"
  | "cadastro"
  | "financeiro"
  | "compras"
  | "orcamento"
  | "medicao"
  | "almoxarifado"
  | "gestao-documentos"
  | "operacional"
  | "frotas"
  | "comunicados-internos"
  | "curriculos";

export interface ModuleFeature {
  key: string;
  label: string;
  route: string;
  icon?: string;
}

export interface ModuleDefinition {
  id: ActiveModuleId;
  label: string;
  description: string;
  color: string;
  icon: string;
  features: ModuleFeature[];
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "rh-dp",
    label: "RH & DP",
    description: "Recursos Humanos e Departamento Pessoal",
    color: "blue",
    icon: "Users",
    features: [
      // === Cadastro ===
      { key: "colaboradores", label: "Colaboradores", route: "/colaboradores", icon: "Users" },
      { key: "efetivo-obra", label: "Efetivo por Obra", route: "/obras/efetivo", icon: "HardHat" },
      { key: "relogios-ponto", label: "Relógios de Ponto", route: "/relogios-ponto", icon: "Wifi" },
      { key: "convencoes-coletivas", label: "Convenções Coletivas", route: "/convencoes-coletivas", icon: "Scale" },
      // === Financeiro ===
      { key: "contas-bancarias", label: "Contas Bancárias", route: "/contas-bancarias", icon: "Landmark" },
      // === Operacional ===
      { key: "fechamento-ponto", label: "Fechamento de Ponto", route: "/fechamento-ponto", icon: "Clock" },
      { key: "folha-pagamento", label: "Folha de Pagamento", route: "/folha-pagamento", icon: "FileText" },
      { key: "controle-documentos", label: "Controle de Documentos", route: "/controle-documentos", icon: "FileCheck" },
      { key: "vale-alimentacao", label: "Vale Alimentação", route: "/vale-alimentacao", icon: "UtensilsCrossed" },
      { key: "solicitacao-he", label: "Solicitação de HE", route: "/solicitacao-he", icon: "ClipboardList" },
      { key: "apontamentos-campo", label: "Apontamentos de Campo", route: "/apontamentos-campo", icon: "ClipboardList" },
      { key: "crachas-rh", label: "Crachás", route: "/crachas", icon: "CreditCard" },
      { key: "lancar-atestados", label: "Lançar Atestados", route: "/controle-documentos?tab=atestados", icon: "ClipboardPlus" },
      { key: "advertencias", label: "Advertências", route: "/controle-documentos?tab=advertencias", icon: "ShieldAlert" },
      // === Gestão de Pessoas ===
      { key: "aviso-previo", label: "Aviso Prévio", route: "/aviso-previo", icon: "Bell" },
      { key: "pedido-demissao", label: "Pedido de Demissão", route: "/pedido-demissao", icon: "FileText" },
      { key: "ferias", label: "Férias", route: "/ferias", icon: "Palmtree" },
      { key: "solicitacao-mdo", label: "Solicitação de Mão de Obra", route: "/solicitacao-mdo", icon: "HardHat" },
      { key: "banco-horas", label: "Banco de Horas", route: "/banco-horas", icon: "ArrowLeftRight" },
      { key: "espelho-ponto", label: "Espelho de Ponto", route: "/espelho-ponto", icon: "FileText" },
      // === Relatórios ===
      { key: "raio-x", label: "Raio-X do Funcionário", route: "/relatorios/raio-x", icon: "UserSearch" },
      { key: "relatorio-ponto", label: "Relatório de Ponto", route: "/relatorios/ponto", icon: "Clock" },
      { key: "relatorio-folha", label: "Relatório de Folha", route: "/relatorios/folha", icon: "Wallet" },
      { key: "relatorio-divergencias", label: "Relatório de Divergências", route: "/relatorios/divergencias", icon: "AlertTriangle" },
      { key: "custo-obra", label: "Custo por Obra", route: "/relatorios/custo-obra", icon: "Construction" },
      // === Dashboards ===
      { key: "dashboards-rh", label: "Todos os Dashboards", route: "/dashboards", icon: "BarChart3" },
      { key: "dashboard-funcionarios", label: "Dashboard Funcionários", route: "/dashboards/funcionarios", icon: "Users" },
      { key: "dashboard-cartao-ponto", label: "Dashboard Cartão de Ponto", route: "/dashboards/cartao-ponto", icon: "Clock" },
      { key: "dashboard-folha", label: "Dashboard Folha de Pagamento", route: "/dashboards/folha-pagamento", icon: "Wallet" },
      { key: "dashboard-horas-extras", label: "Dashboard Horas Extras", route: "/dashboards/horas-extras", icon: "Clock" },
      { key: "dashboard-aviso-previo", label: "Dashboard Aviso Prévio", route: "/dashboards/aviso-previo", icon: "AlertTriangle" },
      { key: "dashboard-ferias", label: "Dashboard Férias", route: "/dashboards/ferias", icon: "Palmtree" },
      { key: "dashboard-efetivo-obra", label: "Dashboard Efetivo por Obra", route: "/dashboards/efetivo-obra", icon: "Building2" },
      { key: "dashboard-perfil-tempo", label: "Dashboard Perfil Tempo de Casa", route: "/dashboards/perfil-tempo-casa", icon: "UserSearch" },
      { key: "dashboard-controle-docs", label: "Dashboard Controle de Documentos", route: "/dashboards/controle-documentos", icon: "ShieldCheck" },
      { key: "dashboard-apontamentos", label: "Dashboard Apontamentos", route: "/dashboards/apontamentos", icon: "ClipboardList" },
      // === Tabelas e Configurações ===
      { key: "feriados", label: "Feriados", route: "/feriados", icon: "Calendar" },
      { key: "dissidio", label: "Dissídio", route: "/dissidio", icon: "TrendingUp" },
      // === Inteligência Artificial ===
      { key: "comparativo-convencoes", label: "Comparativo Convenções (IA)", route: "/comparativo-convencoes", icon: "Scale" },
      // === Dixi Ponto (legado) ===
      { key: "dixi-ponto", label: "Dixi Ponto", route: "/dixi-ponto", icon: "Wifi" },
      // === Comunicação Interna e Recrutamento ===
      { key: "comunicados-internos", label: "Comunicados Internos", route: "/comunicados-internos", icon: "Megaphone" },
      { key: "curriculos", label: "Currículos", route: "/curriculos", icon: "Briefcase" },
    ],
  },
  {
    id: "sst",
    label: "SST",
    description: "Saúde e Segurança do Trabalho",
    color: "green",
    icon: "Shield",
    features: [
      // === Segurança do Trabalho ===
      { key: "epis", label: "EPIs", route: "/epis", icon: "HardHat" },
      { key: "epis-checklist", label: "Checklists EPI", route: "/epis?tab=checklist", icon: "ClipboardList" },
      { key: "epis-descontos", label: "Descontos EPI", route: "/epis?tab=descontos", icon: "Ban" },
      { key: "epis-transferencias", label: "Transferências EPI", route: "/epis?tab=transferencias", icon: "ArrowLeftRight" },
      { key: "epis-config", label: "Config EPI", route: "/epis?tab=config", icon: "Settings2" },
      { key: "cipa", label: "CIPA", route: "/cipa", icon: "ShieldCheck" },
      { key: "controle-documentos-sst", label: "ASOs / Documentos", route: "/controle-documentos", icon: "HeartPulse" },
      { key: "registro-acidentes", label: "Registro de Acidentes", route: "/sst/acidentes", icon: "AlertTriangle" },
      { key: "dds", label: "DDS — Diálogo Diário", route: "/sst/dds", icon: "ClipboardCheck" },
      // === Dashboards SST ===
      { key: "dashboard-epis", label: "Dashboard EPIs", route: "/dashboards/epis", icon: "HardHat" },
      { key: "dashboard-atestados-acidentes", label: "Atestados & Acidentes", route: "/sst/dashboard-atestados-acidentes", icon: "HeartPulse" },
    ],
  },
  {
    id: "juridico",
    label: "Jurídico",
    description: "Gestão Jurídica — Trabalhista, Tributário e Civil",
    color: "amber",
    icon: "Gavel",
    features: [
      { key: "processos-trabalhistas", label: "Processos Trabalhistas", route: "/processos-trabalhistas", icon: "Gavel" },
      { key: "dashboard-juridico", label: "Dashboard Trabalhista", route: "/dashboards/juridico", icon: "Gavel" },
      { key: "processos-tributarios", label: "Processos Tributários", route: "/processos-tributarios", icon: "Receipt" },
      { key: "dashboard-tributario", label: "Dashboard Tributário", route: "/dashboards/tributario", icon: "Receipt" },
      { key: "processos-civis", label: "Processos Cíveis", route: "/processos-civis", icon: "FileText" },
      { key: "dashboard-civil", label: "Dashboard Civil", route: "/dashboards/civil", icon: "FileText" },
    ],
  },
  {
    id: "juridico-trabalhista",
    label: "Trabalhista",
    description: "Processos Trabalhistas — Reclamatórias, audiências, provisões e análise de risco",
    color: "amber",
    icon: "Gavel",
    features: [
      { key: "processos-trabalhistas", label: "Processos Trabalhistas", route: "/processos-trabalhistas", icon: "Gavel" },
      { key: "dashboard-juridico", label: "Dashboard Trabalhista", route: "/dashboards/juridico", icon: "Gavel" },
    ],
  },
  {
    id: "juridico-tributario",
    label: "Tributário",
    description: "Processos Tributários — ICMS, ISS, autos de infração e defesas fiscais",
    color: "teal",
    icon: "Receipt",
    features: [
      { key: "processos-tributarios", label: "Processos Tributários", route: "/processos-tributarios", icon: "Receipt" },
      { key: "dashboard-tributario", label: "Dashboard Tributário", route: "/dashboards/tributario", icon: "Receipt" },
    ],
  },
  {
    id: "juridico-civil",
    label: "Civil",
    description: "Processos Cíveis — Cobranças, indenizações, contratos e ações ordinárias",
    color: "indigo",
    icon: "FileText",
    features: [
      { key: "processos-civis", label: "Processos Cíveis", route: "/processos-civis", icon: "FileText" },
      { key: "dashboard-civil", label: "Dashboard Civil", route: "/dashboards/civil", icon: "FileText" },
    ],
  },
  {
    id: "terceiros",
    label: "Terceiros",
    description: "Gestão de Empresas Terceirizadas e Subcontratadas",
    color: "orange",
    icon: "HardHat",
    features: [
      { key: "terceiros-painel", label: "Painel Terceiros", route: "/terceiros/painel", icon: "LayoutDashboard" },
      { key: "terceiros-empresas", label: "Empresas Terceiras", route: "/terceiros/empresas", icon: "Building2" },
      { key: "terceiros-funcionarios", label: "Funcionários Terceiros", route: "/terceiros/funcionarios", icon: "Users" },
      { key: "terceiros-obrigacoes", label: "Obrigações Mensais", route: "/terceiros/obrigacoes", icon: "ClipboardCheck" },
      { key: "terceiros-conformidade", label: "Painel de Conformidade", route: "/terceiros/conformidade", icon: "ShieldCheck" },
      { key: "terceiros-alertas", label: "Alertas e Cobranças", route: "/terceiros/alertas", icon: "Bell" },
      { key: "terceiros-aprovacao", label: "Aprovação Portal", route: "/terceiros/aprovacao", icon: "UserCheck" },
      { key: "terceiros-portal", label: "Portal Externo", route: "/terceiros/portal", icon: "ExternalLink" },
      { key: "terceiros-crachas", label: "Crachás", route: "/terceiros/crachas", icon: "CreditCard" },
      { key: "terceiros-validacao-ia", label: "Validação IA de Docs", route: "/terceiros/validacao-ia", icon: "FileSearch" },
      // === PJ ===
      { key: "modulo-pj", label: "Contratos PJ", route: "/modulo-pj", icon: "Briefcase" },
      { key: "pj-medicoes", label: "Medições PJ", route: "/pj-medicoes", icon: "FileSpreadsheet" },
      { key: "pj-conformidade", label: "Conformidade PJ", route: "/terceiros/pj/conformidade", icon: "ShieldCheck" },
      { key: "pj-dashboard-conformidade", label: "Dashboard Conformidade PJ", route: "/terceiros/pj/dashboard-conformidade", icon: "BarChart3" },
    ],
  },
  {
    id: "parceiros",
    label: "Parceiros",
    description: "Portal de Parceiros Conveniados (Farmácia, Posto, etc.)",
    color: "purple",
    icon: "Handshake",
    features: [
      { key: "parceiros-painel", label: "Painel Parceiros", route: "/parceiros/painel", icon: "LayoutDashboard" },
      { key: "parceiros-cadastro", label: "Parceiros Conveniados", route: "/parceiros/cadastro", icon: "Store" },
      { key: "parceiros-lancamentos", label: "Lançamentos", route: "/parceiros/lancamentos", icon: "Receipt" },
      { key: "parceiros-aprovacoes", label: "Aprovações RH", route: "/parceiros/aprovacoes", icon: "CheckCircle" },
      { key: "parceiros-portal", label: "Portal Externo", route: "/parceiros/portal", icon: "Globe" },
      { key: "parceiros-guia-descontos", label: "Guia de Descontos", route: "/parceiros/guia-descontos", icon: "FileText" },
      { key: "parceiros-pagamentos", label: "Pagamentos", route: "/parceiros/pagamentos", icon: "Wallet" },
    ],
  },
  {
    id: "orcamento",
    label: "Orçamento",
    description: "Importação de planilhas Excel, 3 versões de orçamento (Venda, Custo, Meta), curva ABC de insumos.",
    color: "cyan",
    icon: "Calculator",
    features: [
      { key: "orcamento-painel",   label: "Painel Orçamento",  route: "/orcamento/painel",   icon: "LayoutDashboard" },
      { key: "orcamento-lista",    label: "Orçamentos",        route: "/orcamento/lista",    icon: "FolderOpen" },
      { key: "orcamento-importar", label: "Importar Planilha", route: "/orcamento/importar", icon: "Upload" },
    ],
  },
  {
    id: "medicao",
    label: "Medição",
    description: "Boletins de medição de contratos, fundo de despesas e faturamento por avanço físico.",
    color: "teal",
    icon: "FileBarChart",
    features: [
      { key: "medicao-contratos", label: "Contratos de Medição", route: "/medicao", icon: "FileBarChart" },
    ],
  },
  {
    id: "almoxarifado",
    label: "Almoxarifado",
    description: "Controle de materiais, ferramentas e equipamentos. Empréstimos diários, inventário semanal, movimentações entrada/saída.",
    color: "orange",
    icon: "Package",
    features: [
      { key: "almoxarifado-painel",        label: "Painel",             route: "/almoxarifado",               icon: "LayoutDashboard" },
      { key: "almoxarifado-movimentacoes", label: "Movimentações",      route: "/almoxarifado/movimentacoes", icon: "ArrowLeftRight" },
      { key: "almoxarifado-inventario",    label: "Inventário Semanal", route: "/almoxarifado/inventario",    icon: "ClipboardList" },
    ],
  },
  {
    id: "avaliacao",
    label: "Avaliação",
    description: "Avaliação de Desempenho — questionários, ciclos, ranking e competências.",
    color: "purple",
    icon: "ClipboardCheck",
    features: [
      { key: "avaliacao-desempenho", label: "Avaliação de Desempenho", route: "/avaliacao-desempenho", icon: "ClipboardCheck" },
    ],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    description: "Projetos vinculados a orçamentos, Curva S, avanço físico semanal, revisões de cronograma e REFIS.",
    color: "green",
    icon: "CalendarRange",
    features: [
      { key: "planejamento-lista",   label: "Projetos",          route: "/planejamento",     icon: "CalendarRange" },
      { key: "planejamento-detalhe", label: "Detalhe do Projeto", route: "/planejamento/:id", icon: "FileBarChart" },
    ],
  },
  {
    id: "cadastro",
    label: "Cadastro",
    description: "Empresas, obras, setores, funções, habilidades e dados mestre do sistema.",
    color: "slate",
    icon: "BookOpen",
    features: [
      { key: "cadastro-habilidades",        label: "Habilidades",             route: "/habilidades",             icon: "Star" },
      { key: "cadastro-habilidades-import", label: "Importação de Habilidades", route: "/habilidades/importacao", icon: "Upload" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    description: "Contas a pagar e receber, fluxo de caixa, DRE e relatórios financeiros.",
    color: "emerald",
    icon: "DollarSign",
    features: [
      { key: "financeiro-painel",            label: "Painel",               route: "/financeiro",                        icon: "LayoutDashboard" },
      { key: "financeiro-lancamentos",       label: "Lançamentos",          route: "/financeiro/lancamentos",            icon: "Receipt" },
      { key: "financeiro-contas-pagar",      label: "Contas a Pagar",       route: "/financeiro/contas-a-pagar",         icon: "ArrowDownCircle" },
      { key: "financeiro-contas-receber",    label: "Contas a Receber",     route: "/financeiro/contas-a-receber",       icon: "ArrowUpCircle" },
      { key: "financeiro-dre",               label: "DRE",                  route: "/financeiro/dre",                    icon: "BarChart3" },
      { key: "financeiro-fluxo",             label: "Fluxo de Caixa",       route: "/financeiro/fluxo-de-caixa",         icon: "TrendingUp" },
      { key: "financeiro-plano-contas",      label: "Plano de Contas",      route: "/financeiro/plano-de-contas",        icon: "ListTree" },
      { key: "financeiro-centros-custo",     label: "Centros de Custo",     route: "/financeiro/centros-de-custo",       icon: "Layers" },
      { key: "financeiro-obrigacoes-fiscais",label: "Obrigações Fiscais",   route: "/financeiro/obrigacoes-fiscais",     icon: "FileText" },
      { key: "financeiro-conciliacao",       label: "Conciliação Bancária", route: "/financeiro/conciliacao",            icon: "GitMerge" },
    ],
  },
  {
    id: "gestao-documentos",
    label: "Proj./Doc. Técnicos",
    description: "Controle de documentos técnicos de obra, revisões, disciplinas e ARTs/RRTs.",
    color: "indigo",
    icon: "FolderOpen",
    features: [
      { key: "gd-dash",           label: "Dashboard",         route: "/gestao-documentos",             icon: "BarChart3" },
      { key: "gd-painel",         label: "Painel",            route: "/gestao-documentos?tab=painel",  icon: "LayoutDashboard" },
      { key: "gd-documentos",     label: "Documentos",        route: "/gestao-documentos?tab=documentos", icon: "FileText" },
      { key: "gd-arts",           label: "ARTs / RRTs",       route: "/gestao-documentos?tab=arts",    icon: "Shield" },
      { key: "gd-configuracoes",  label: "Configurações",     route: "/gestao-documentos?tab=configuracoes", icon: "Settings" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    description: "Solicitações, cotações, ordens de compra, aprovações e recebimentos.",
    color: "rose",
    icon: "ShoppingCart",
    features: [
      { key: "compras-painel",         label: "Painel",              route: "/compras/painel",         icon: "LayoutDashboard" },
      { key: "compras-fornecedores",   label: "Empresas Terceiras",  route: "/compras/fornecedores",   icon: "Truck" },
      { key: "compras-solicitacoes",   label: "Solicitações (SC)",   route: "/compras/solicitacoes",   icon: "ClipboardList" },
      { key: "compras-cotacoes",       label: "Cotações",            route: "/compras/cotacoes",       icon: "FileSearch" },
      { key: "compras-ordens",         label: "Ordens de Compra",    route: "/compras/ordens",         icon: "ShoppingBag" },
      { key: "compras-aprovacoes",     label: "Aprovações",          route: "/compras/aprovacoes",     icon: "CheckCircle" },
      { key: "compras-recebimentos",   label: "Recebimentos",        route: "/compras/recebimentos",   icon: "PackageCheck" },
      { key: "compras-emergencial",    label: "Emergencial",         route: "/compras/emergencial",    icon: "Zap" },

      { key: "compras-realocacao",     label: "Realocação",          route: "/compras/realocacao",     icon: "ArrowLeftRight" },
      { key: "compras-comissoes",      label: "Comissões",           route: "/compras/comissoes",      icon: "Percent" },
      { key: "compras-configuracoes",  label: "Configurações",       route: "/compras/configuracoes",  icon: "Settings2" },
    ],
  },
  {
    id: "operacional",
    label: "Operacional",
    description: "Gestão Operacional de Obras",
    color: "amber",
    icon: "HardHat",
    features: [
      { key: "operacional-painel",        label: "Painel",                  route: "/operacional/painel",        icon: "LayoutDashboard" },
      { key: "operacional-rdo",           label: "RDO",                     route: "/operacional/rdo",           icon: "ClipboardList" },
      { key: "operacional-checklists",    label: "Checklists de Qualidade", route: "/operacional/checklists",    icon: "CheckSquare" },
      { key: "operacional-concretagem",   label: "Controle de Concretagem", route: "/operacional/concretagem",   icon: "Blocks" },
      { key: "operacional-nc",            label: "Não Conformidades",       route: "/operacional/nc",            icon: "AlertTriangle" },
      { key: "operacional-fotos",         label: "Registro Fotográfico",    route: "/operacional/fotos",         icon: "Camera" },
    ],
  },
  {
    id: "frotas",
    label: "Frotas",
    description: "Controle de Frotas e Veículos",
    color: "cyan",
    icon: "Truck",
    features: [
      { key: "frotas-painel",         label: "Dashboard",          route: "/frotas/painel",         icon: "LayoutDashboard" },
      { key: "frotas-veiculos",       label: "Veículos",           route: "/frotas/veiculos",       icon: "Truck" },
      { key: "frotas-manutencoes",    label: "Manutenções",        route: "/frotas/manutencoes",    icon: "Wrench" },
      { key: "frotas-combustivel",    label: "Combustível",        route: "/frotas/combustivel",    icon: "Fuel" },
      { key: "frotas-multas",         label: "Multas",             route: "/frotas/multas",         icon: "AlertTriangle" },
      { key: "frotas-ipva",           label: "IPVA",               route: "/frotas/ipva",           icon: "Receipt" },
      { key: "frotas-licenciamento",  label: "Licenciamento",      route: "/frotas/licenciamento",  icon: "FileText" },
      { key: "frotas-seguros",        label: "Seguros",            route: "/frotas/seguros",        icon: "Shield" },
      { key: "frotas-rastreamento",   label: "Rastreamento",       route: "/frotas/rastreamento",   icon: "MapPin" },
      { key: "frotas-analitico",     label: "Analítico",          route: "/frotas/analitico",      icon: "BarChart3" },
    ],
  },
  {
    id: "comunicados-internos",
    label: "Comunicados Internos",
    description: "Avisos oficiais da empresa com numeração automática anual",
    color: "blue",
    icon: "Megaphone",
    features: [
      { key: "comunicados-internos", label: "Comunicados Internos", route: "/comunicados-internos", icon: "Megaphone" },
    ],
  },
  {
    id: "curriculos",
    label: "Currículos",
    description: "Banco de currículos recebidos organizado por função",
    color: "amber",
    icon: "Briefcase",
    features: [
      { key: "curriculos", label: "Currículos", route: "/curriculos", icon: "Briefcase" },
    ],
  },
];

// Itens compartilhados (aparecem em todos os módulos)
export const SHARED_FEATURES: ModuleFeature[] = [
  { key: "empresas", label: "Empresas", route: "/empresas", icon: "Building2" },
  { key: "obras", label: "Obras", route: "/obras", icon: "Landmark" },
  { key: "setores", label: "Setores", route: "/setores", icon: "Layers" },
  { key: "funcoes", label: "Funções", route: "/funcoes", icon: "Grid3X3" },
];

// Itens de administração (só admin/admin_master)
export const ADMIN_FEATURES: ModuleFeature[] = [
  { key: "usuarios", label: "Usuários", route: "/usuarios", icon: "UserCog" },
  { key: "configuracoes", label: "Configurações", route: "/configuracoes", icon: "Settings" },
  { key: "auditoria", label: "Auditoria", route: "/auditoria", icon: "Eye" },
  { key: "lixeira", label: "Lixeira", route: "/lixeira", icon: "Trash2" },
  { key: "revisoes", label: "Revisões", route: "/revisoes", icon: "History" },
];

// Helper: obter definição de um módulo
export function getModuleDefinition(moduleId: ActiveModuleId): ModuleDefinition | undefined {
  return MODULE_DEFINITIONS.find(m => m.id === moduleId);
}

// Helper: obter todas as feature keys de um módulo
export function getModuleFeatureKeys(moduleId: ActiveModuleId): string[] {
  const mod = getModuleDefinition(moduleId);
  return mod ? mod.features.map(f => f.key) : [];
}

// Helper: obter todos os módulos e features como lista plana
export function getAllModuleFeatures(): { moduleId: ActiveModuleId; featureKey: string; label: string }[] {
  const result: { moduleId: ActiveModuleId; featureKey: string; label: string }[] = [];
  for (const mod of MODULE_DEFINITIONS) {
    for (const feat of mod.features) {
      result.push({ moduleId: mod.id, featureKey: feat.key, label: `${mod.label} > ${feat.label}` });
    }
  }
  return result;
}
