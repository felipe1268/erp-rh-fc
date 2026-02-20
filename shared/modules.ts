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
