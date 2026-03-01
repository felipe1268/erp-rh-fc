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

// ============================================================
// MAPA DE MÓDULOS E FUNCIONALIDADES GRANULARES
// Usado para controle de acesso por usuário na sidebar e rotas
// ============================================================

export type ActiveModuleId = "rh-dp" | "sst" | "juridico" | "terceiros" | "parceiros";

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
      { key: "colaboradores", label: "Colaboradores", route: "/colaboradores", icon: "Users" },
      { key: "fechamento-ponto", label: "Fechamento de Ponto", route: "/fechamento-ponto", icon: "Clock" },
      { key: "folha-pagamento", label: "Folha de Pagamento", route: "/folha-pagamento", icon: "FileText" },
      { key: "controle-documentos", label: "Controle de Documentos", route: "/controle-documentos", icon: "FileCheck" },
      { key: "vale-alimentacao", label: "Vale Alimentação", route: "/vale-alimentacao", icon: "UtensilsCrossed" },
      { key: "ferias", label: "Férias", route: "/ferias", icon: "Palmtree" },
      { key: "aviso-previo", label: "Aviso Prévio", route: "/aviso-previo", icon: "Bell" },
      { key: "dissidio", label: "Dissídio", route: "/dissidio", icon: "TrendingUp" },
      { key: "modulo-pj", label: "Módulo PJ", route: "/modulo-pj", icon: "Briefcase" },
      { key: "solicitacao-he", label: "Solicitação de HE", route: "/solicitacao-he", icon: "ClipboardList" },
      { key: "dixi-ponto", label: "Dixi Ponto", route: "/dixi-ponto", icon: "Wifi" },
      { key: "contas-bancarias", label: "Contas Bancárias", route: "/contas-bancarias", icon: "Landmark" },
      { key: "feriados", label: "Feriados", route: "/feriados", icon: "Calendar" },
      { key: "relogios-ponto", label: "Relógios de Ponto", route: "/relogios-ponto", icon: "Wifi" },
      { key: "crachas-rh", label: "Crachás", route: "/terceiros/crachas", icon: "CreditCard" },
    ],
  },
  {
    id: "sst",
    label: "SST",
    description: "Saúde e Segurança do Trabalho",
    color: "green",
    icon: "Shield",
    features: [
      { key: "epis", label: "EPIs", route: "/epis", icon: "HardHat" },
      { key: "cipa", label: "CIPA", route: "/cipa", icon: "ShieldCheck" },
      { key: "controle-documentos-sst", label: "ASOs / Documentos", route: "/controle-documentos", icon: "HeartPulse" },
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
      { key: "parceiros-guia-descontos", label: "Guia de Descontos", route: "/parceiros/guia-descontos", icon: "FileText" },
      { key: "parceiros-pagamentos", label: "Pagamentos", route: "/parceiros/pagamentos", icon: "Wallet" },
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
