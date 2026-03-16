/**
 * Definição das páginas e flags de dados sensíveis por módulo.
 * Usado pela tela de permissões de usuários e pelo PermissionsContext.
 */

export type PageAction = "view" | "create" | "edit" | "delete";

export interface PageDef {
  id: string;
  label: string;
  actions: PageAction[];
}

export interface SensitiveFlag {
  id: string;
  label: string;
}

export interface ModulePageConfig {
  pages: PageDef[];
  sensitiveFlags?: SensitiveFlag[];
}

export const MODULE_PAGE_CONFIG: Record<string, ModulePageConfig> = {
  "rh-dp": {
    pages: [
      { id: "funcionarios",  label: "Funcionários",            actions: ["view","create","edit","delete"] },
      { id: "admissao",      label: "Admissão",                actions: ["view","create","edit","delete"] },
      { id: "ferias",        label: "Férias / Afastamentos",   actions: ["view","create","edit","delete"] },
      { id: "ponto",         label: "Controle de Ponto",       actions: ["view","create","edit","delete"] },
      { id: "folha",         label: "Folha de Pagamento",      actions: ["view","create","edit","delete"] },
      { id: "rescisoes",     label: "Rescisões",               actions: ["view","create","edit","delete"] },
      { id: "relatorios",    label: "Relatórios RH",           actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "salarios",      label: "Salários e remunerações" },
      { id: "dados_pessoais",label: "Dados pessoais (CPF, RG, endereço)" },
    ],
  },
  "sst": {
    pages: [
      { id: "aso",           label: "ASO / Exames Médicos",    actions: ["view","create","edit","delete"] },
      { id: "treinamentos",  label: "Treinamentos SST",        actions: ["view","create","edit","delete"] },
      { id: "epi",           label: "EPIs / EPCs",             actions: ["view","create","edit","delete"] },
      { id: "acidentes",     label: "Acidentes / Incidentes",  actions: ["view","create","edit","delete"] },
      { id: "relatorios",    label: "Relatórios SST",          actions: ["view"] },
    ],
  },
  "juridico": {
    pages: [
      { id: "contratos",     label: "Contratos Jurídicos",     actions: ["view","create","edit","delete"] },
      { id: "processos",     label: "Processos Judiciais",     actions: ["view","create","edit","delete"] },
      { id: "documentos",    label: "Documentos",              actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_contratos",        label: "Valores de contratos" },
      { id: "documentos_confidenciais", label: "Documentos confidenciais" },
    ],
  },
  "avaliacao": {
    pages: [
      { id: "avaliacoes",    label: "Avaliações",              actions: ["view","create","edit","delete"] },
      { id: "ciclos",        label: "Ciclos / Períodos",       actions: ["view","create","edit","delete"] },
      { id: "relatorios",    label: "Relatórios de Desempenho",actions: ["view"] },
    ],
  },
  "terceiros": {
    pages: [
      { id: "empresas",      label: "Empresas Terceiras",      actions: ["view","create","edit","delete"] },
      { id: "trabalhadores", label: "Trabalhadores Terceiros", actions: ["view","create","edit","delete"] },
      { id: "contratos",     label: "Contratos de Serviço",    actions: ["view","create","edit","delete"] },
      { id: "medicoes",      label: "Medições",                actions: ["view","create","edit","delete"] },
      { id: "documentos",    label: "Documentos",              actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_contratos", label: "Valores de contratos de serviço" },
    ],
  },
  "parceiros": {
    pages: [
      { id: "parceiros",     label: "Parceiros",               actions: ["view","create","edit","delete"] },
      { id: "comissoes",     label: "Comissões",               actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_comissoes", label: "Valores de comissões" },
    ],
  },
  "orcamento": {
    pages: [
      { id: "lista",         label: "Lista de Orçamentos",     actions: ["view","create","edit","delete"] },
      { id: "detalhe",       label: "Detalhe / EAP",           actions: ["view","edit"] },
      { id: "importacao",    label: "Importação de Planilha",  actions: ["view","create"] },
    ],
    sensitiveFlags: [
      { id: "valores_orcamento", label: "Valores de custo / meta / venda" },
    ],
  },
  "planejamento": {
    pages: [
      { id: "projetos",      label: "Projetos / Obras",        actions: ["view","create","edit","delete"] },
      { id: "cronograma",    label: "Cronograma",              actions: ["view","create","edit","delete"] },
      { id: "atividades",    label: "Atividades",              actions: ["view","create","edit","delete"] },
    ],
  },
  "cadastro": {
    pages: [
      { id: "obras",         label: "Obras",                   actions: ["view","create","edit","delete"] },
      { id: "colaboradores", label: "Colaboradores",           actions: ["view","create","edit","delete"] },
      { id: "departamentos", label: "Departamentos / Setores", actions: ["view","create","edit","delete"] },
      { id: "cargos",        label: "Cargos",                  actions: ["view","create","edit","delete"] },
    ],
  },
  "compras": {
    pages: [
      { id: "solicitacoes",  label: "Solicitações de Compra",  actions: ["view","create","edit","delete"] },
      { id: "cotacoes",      label: "Cotações",                actions: ["view","create","edit","delete"] },
      { id: "ordens",        label: "Ordens de Compra (OC)",   actions: ["view","create","edit","delete"] },
      { id: "fornecedores",  label: "Fornecedores",            actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_compras", label: "Valores e preços de compras" },
    ],
  },
  "almoxarifado": {
    pages: [
      { id: "estoque",       label: "Estoque / Inventário",    actions: ["view","create","edit","delete"] },
      { id: "movimentos",    label: "Movimentações",           actions: ["view","create","edit","delete"] },
      { id: "requisicoes",   label: "Requisições",             actions: ["view","create","edit","delete"] },
    ],
  },
  "financeiro": {
    pages: [
      { id: "fluxo",         label: "Fluxo de Caixa",         actions: ["view","create","edit","delete"] },
      { id: "contas",        label: "Contas / Bancos",         actions: ["view","create","edit","delete"] },
      { id: "lancamentos",   label: "Lançamentos",             actions: ["view","create","edit","delete"] },
      { id: "relatorios",    label: "Relatórios Financeiros",  actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "saldos",             label: "Saldos bancários e financeiros" },
      { id: "valores_financeiros",label: "Valores de receitas e despesas" },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Tipos de permissão usados no JSON modulesAccess
// ──────────────────────────────────────────────────────────────────────────────

export interface PagePerms {
  view:   boolean;
  create: boolean;
  edit:   boolean;
  delete: boolean;
}

export type ModuleLevel = "admin" | "viewer" | "custom";

export interface ModulePerm {
  level: ModuleLevel;
  pages: Record<string, PagePerms>;
  sensitiveHidden: string[];   // IDs de SensitiveFlag que devem ser ocultados
}

export type ModulesAccessMap = Record<string, ModulePerm | "admin" | "viewer" | null>;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de leitura/normalização
// ──────────────────────────────────────────────────────────────────────────────

/** Constrói as permissões padrão de todas as páginas para um dado nível. */
export function defaultPagesForLevel(moduleId: string, level: "admin" | "viewer"): Record<string, PagePerms> {
  const config = MODULE_PAGE_CONFIG[moduleId];
  const pages: Record<string, PagePerms> = {};
  if (!config) return pages;
  const isAdmin = level === "admin";
  for (const p of config.pages) {
    pages[p.id] = {
      view:   true,
      create: isAdmin && p.actions.includes("create"),
      edit:   isAdmin && p.actions.includes("edit"),
      delete: isAdmin && p.actions.includes("delete"),
    };
  }
  return pages;
}

/** Normaliza uma entrada do JSON (pode ser string legada ou objeto novo). */
export function normalizeModulePerm(moduleId: string, raw: unknown): ModulePerm | null {
  if (raw === null || raw === undefined) return null;
  if (raw === "admin" || raw === "viewer") {
    return {
      level: raw as ModuleLevel,
      pages: defaultPagesForLevel(moduleId, raw as "admin" | "viewer"),
      sensitiveHidden: [],
    };
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Partial<ModulePerm>;
    return {
      level:           obj.level ?? "admin",
      pages:           obj.pages ?? defaultPagesForLevel(moduleId, (obj.level as "admin" | "viewer") ?? "admin"),
      sensitiveHidden: obj.sensitiveHidden ?? [],
    };
  }
  return null;
}
