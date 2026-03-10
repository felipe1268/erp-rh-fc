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

export type ActiveModuleId = "rh-dp" | "sst" | "juridico" | "terceiros" | "parceiros" | "orcamento";

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
      { key: "ferias", label: "Férias", route: "/ferias", icon: "Palmtree" },
      { key: "modulo-pj", label: "Módulo PJ", route: "/modulo-pj", icon: "Briefcase" },
      { key: "pj-medicoes", label: "PJ Medições", route: "/pj-medicoes", icon: "FileSpreadsheet" },
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
      // === Dashboards SST ===
      { key: "dashboard-epis", label: "Dashboard EPIs", route: "/dashboards/epis", icon: "HardHat" },
    ],
  },
  {
    id: "juridico",
    label: "Jurídico",
    description: "Departamento Jurídico",
    color: "amber",
    icon: "Scale",
    features: [
      { key: "processos-trabalhistas", label: "Processos Trabalhistas", route: "/processos-trabalhistas", icon: "Gavel" },
      { key: "dashboard-juridico", label: "Dashboard Jurídico", route: "/dashboards/juridico", icon: "Gavel" },
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
