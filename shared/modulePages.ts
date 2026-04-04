/**
 * Definição COMPLETA de todas as páginas por módulo.
 * Cada página aqui aparece na tela de configuração de permissões de usuários.
 * Atualizado para refletir 100% das telas reais do sistema.
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

  // ══════════════════════════════════════════════════════
  // RH / DP
  // ══════════════════════════════════════════════════════
  "rh-dp": {
    pages: [
      { id: "colaboradores",       label: "Colaboradores / Funcionários",        actions: ["view","create","edit","delete"] },
      { id: "ferias",              label: "Férias e Afastamentos",                actions: ["view","create","edit","delete"] },
      { id: "aviso_previo",        label: "Aviso Prévio",                         actions: ["view","create","edit","delete"] },
      { id: "ponto",               label: "Fechamento de Ponto",                  actions: ["view","create","edit","delete"] },
      { id: "folha",               label: "Folha de Pagamento",                   actions: ["view","create","edit","delete"] },
      { id: "gestao_competencias", label: "Gestão de Competências (Folha)",        actions: ["view","create","edit","delete"] },
      { id: "controle_documentos", label: "Controle de Documentos (Atestados/Advertências)", actions: ["view","create","edit","delete"] },
      { id: "vale_alimentacao",    label: "Vale Alimentação",                     actions: ["view","create","edit","delete"] },
      { id: "hora_extra",          label: "Hora Extra",                           actions: ["view","create","edit","delete"] },
      { id: "apontamentos",        label: "Apontamentos de Campo",                actions: ["view","create","edit","delete"] },
      { id: "crachas",             label: "Crachás",                              actions: ["view","create","edit","delete"] },
      { id: "contratos_pj",        label: "Contratos PJ e Medições PJ",           actions: ["view","create","edit","delete"] },
      { id: "dissidio",            label: "Dissídio e Feriados",                  actions: ["view","create","edit"] },
      { id: "comparativo",         label: "Comparativo de Convenções",            actions: ["view"] },
      { id: "relatorios",          label: "Relatórios RH (Raio-X, Ponto, Folha, Divergências)", actions: ["view"] },
      { id: "dashboards",          label: "Dashboards RH",                        actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "salarios",        label: "Salários, benefícios e remunerações" },
      { id: "dados_pessoais",  label: "Dados pessoais (CPF, RG, endereço, data nascimento)" },
      { id: "documentos_rh",   label: "Documentos pessoais e contratos" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // SST
  // ══════════════════════════════════════════════════════
  "sst": {
    pages: [
      { id: "epi",            label: "Controle de EPIs (Estoque, Checklists, Descontos, Transferências)", actions: ["view","create","edit","delete"] },
      { id: "cipa",           label: "CIPA",                                      actions: ["view","create","edit","delete"] },
      { id: "dashboards",     label: "Dashboards SST",                            actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "dados_saude", label: "Dados de saúde e ASO" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // JURÍDICO
  // ══════════════════════════════════════════════════════
  "juridico": {
    pages: [
      { id: "processos",    label: "Processos Trabalhistas",                      actions: ["view","create","edit","delete"] },
      { id: "convencoes",   label: "Convenções Coletivas",                        actions: ["view","create","edit","delete"] },
      { id: "dashboards",   label: "Dashboards Jurídico",                         actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_acordos",        label: "Valores de indenizações e acordos trabalhistas" },
      { id: "documentos_confidenciais", label: "Documentos confidenciais" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // AVALIAÇÃO DE DESEMPENHO
  // ══════════════════════════════════════════════════════
  "avaliacao": {
    pages: [
      { id: "avaliacoes",   label: "Avaliações de Desempenho",                    actions: ["view","create","edit","delete"] },
      { id: "habilidades",  label: "Habilidades e Competências",                  actions: ["view","create","edit","delete"] },
      { id: "dashboards",   label: "Dashboards de Competências e Habilidades",    actions: ["view"] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // TERCEIROS
  // ══════════════════════════════════════════════════════
  "terceiros": {
    pages: [
      { id: "painel",         label: "Painel de Terceiros",                       actions: ["view"] },
      { id: "empresas",       label: "Empresas Terceiras",                        actions: ["view","create","edit","delete"] },
      { id: "trabalhadores",  label: "Trabalhadores Terceiros",                   actions: ["view","create","edit","delete"] },
      { id: "obrigacoes",     label: "Obrigações Mensais (documentos exigidos)",  actions: ["view","create","edit","delete"] },
      { id: "conformidade",   label: "Painel de Conformidade",                    actions: ["view"] },
      { id: "alertas",        label: "Alertas e Cobranças",                       actions: ["view","create","edit","delete"] },
      { id: "contratos",      label: "Contratos de Serviço",                      actions: ["view","create","edit","delete"] },
      { id: "medicoes",       label: "Medições de Terceiros",                     actions: ["view","create","edit","delete"] },
      { id: "previsao_caixa", label: "Previsão de Caixa — Terceiros",             actions: ["view"] },
      { id: "documentos",     label: "Aprovação de Documentos / Validação IA",    actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_contratos", label: "Valores de contratos de serviço" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // PARCEIROS
  // ══════════════════════════════════════════════════════
  "parceiros": {
    pages: [
      { id: "cadastro",       label: "Parceiros Conveniados (cadastro)",          actions: ["view","create","edit","delete"] },
      { id: "lancamentos",    label: "Lançamentos de Parceiros",                  actions: ["view","create","edit","delete"] },
      { id: "aprovacoes",     label: "Aprovações RH",                             actions: ["view","create","edit","delete"] },
      { id: "pagamentos",     label: "Pagamentos a Parceiros",                    actions: ["view","create","edit","delete"] },
      { id: "guia_descontos", label: "Guia de Descontos",                         actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_comissoes", label: "Valores de comissões e descontos" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // ORÇAMENTO
  // ══════════════════════════════════════════════════════
  "orcamento": {
    pages: [
      { id: "lista",        label: "Lista de Orçamentos",                         actions: ["view","create","edit","delete"] },
      { id: "detalhe",      label: "EAP / Detalhe do Orçamento",                  actions: ["view","edit"] },
      { id: "importacao",   label: "Importação de Planilha",                      actions: ["view","create"] },
      { id: "biblioteca",   label: "Biblioteca de Composições",                   actions: ["view","create","edit","delete"] },
      { id: "insumos",      label: "Insumos",                                     actions: ["view","create","edit","delete"] },
      { id: "encargos",     label: "Encargos Sociais",                            actions: ["view","create","edit","delete"] },
      { id: "dashboard",    label: "Dashboard de Orçamento",                      actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_orcamento", label: "Valores de custo, meta e venda" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // PLANEJAMENTO
  // ══════════════════════════════════════════════════════
  "planejamento": {
    pages: [
      { id: "projetos",          label: "Projetos / Obras (lista)",               actions: ["view","create","edit","delete"] },
      { id: "visao_geral",       label: "Visão Geral",                            actions: ["view"] },
      { id: "cronograma",        label: "Cronograma",                             actions: ["view","create","edit","delete"] },
      { id: "gantt",             label: "Gantt",                                  actions: ["view"] },
      { id: "financeiro",        label: "Cronograma Financeiro",                  actions: ["view","create","edit","delete"] },
      { id: "curva_s",           label: "Curva S",                                actions: ["view"] },
      { id: "avanco_semanal",    label: "Avanço Semanal",                         actions: ["view","create","edit","delete"] },
      { id: "caminho_critico",   label: "Caminho Crítico",                        actions: ["view"] },
      { id: "previsao_medicao",  label: "Previsão de Medição",                    actions: ["view","create","edit","delete"] },
      { id: "prog_semanal",      label: "Programação Semanal",                    actions: ["view","create","edit","delete"] },
      { id: "diagrama_rede",     label: "Diagrama de Rede",                       actions: ["view"] },
      { id: "custo_rh",          label: "Custo RH",                               actions: ["view"] },
      { id: "revisoes",          label: "Revisões",                               actions: ["view","create","edit","delete"] },
      { id: "refis",             label: "REFIS",                                  actions: ["view","create","edit","delete"] },
      { id: "simulador",         label: "Simulador",                              actions: ["view"] },
      { id: "bim_3d",            label: "BIM 3D / 4D",                            actions: ["view","create","edit","delete"] },
      { id: "ia_gestora",        label: "IA Gestora de Planejamento",             actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_planejamento", label: "Valores financeiros do cronograma" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // CADASTRO
  // ══════════════════════════════════════════════════════
  "cadastro": {
    pages: [
      { id: "obras",        label: "Obras e Projetos",                            actions: ["view","create","edit","delete"] },
      { id: "clientes",     label: "Clientes",                                    actions: ["view","create","edit","delete"] },
      { id: "empresas",     label: "Empresas",                                    actions: ["view","create","edit","delete"] },
      { id: "colaboradores",label: "Colaboradores",                               actions: ["view","create","edit","delete"] },
      { id: "departamentos",label: "Setores / Departamentos",                     actions: ["view","create","edit","delete"] },
      { id: "cargos",       label: "Funções / Cargos",                            actions: ["view","create","edit","delete"] },
      { id: "convencoes",   label: "Convenções Coletivas",                        actions: ["view","create","edit","delete"] },
      { id: "habilidades",  label: "Habilidades",                                 actions: ["view","create","edit","delete"] },
      { id: "relogios",     label: "Relógios de Ponto",                           actions: ["view","create","edit","delete"] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // COMPRAS
  // ══════════════════════════════════════════════════════
  "compras": {
    pages: [
      { id: "solicitacoes", label: "Solicitações de Compra (SC)",                 actions: ["view","create","edit","delete"] },
      { id: "cotacoes",     label: "Cotações",                                    actions: ["view","create","edit","delete"] },
      { id: "ordens",       label: "Ordens de Compra (OC)",                       actions: ["view","create","edit","delete"] },
      { id: "recebimentos", label: "Recebimentos",                                actions: ["view","create","edit","delete"] },
      { id: "aprovacoes",   label: "Aprovações Pendentes",                        actions: ["view","edit"] },
      { id: "emergencial",  label: "Compras Emergenciais",                        actions: ["view","create","edit","delete"] },
      { id: "financeiro",   label: "Contas a Pagar (Compras)",                    actions: ["view"] },
      { id: "realocacao",   label: "Realocação de Verba",                         actions: ["view","edit"] },
      { id: "fornecedores", label: "Fornecedores",                                actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_compras", label: "Valores e preços de compras" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // ALMOXARIFADO
  // ══════════════════════════════════════════════════════
  "almoxarifado": {
    pages: [
      { id: "estoque",       label: "Visão Geral / Estoque",                      actions: ["view","create","edit","delete"] },
      { id: "movimentacoes", label: "Movimentações",                              actions: ["view","create","edit","delete"] },
      { id: "inventario",    label: "Inventário Semanal",                         actions: ["view","create","edit","delete"] },
      { id: "categorias",    label: "Categorias de Materiais",                    actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_estoque", label: "Valores de custo do estoque" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // FINANCEIRO
  // ══════════════════════════════════════════════════════
  "financeiro": {
    pages: [
      { id: "lancamentos",       label: "Lançamentos Financeiros",               actions: ["view","create","edit","delete"] },
      { id: "receitas",          label: "Receitas de Obras",                     actions: ["view","create","edit","delete"] },
      { id: "contas_pagar",      label: "Contas a Pagar",                        actions: ["view","create","edit","delete"] },
      { id: "contas_receber",    label: "Contas a Receber",                      actions: ["view","create","edit","delete"] },
      { id: "fluxo_caixa",       label: "Fluxo de Caixa",                        actions: ["view"] },
      { id: "dre",               label: "DRE (Demonstração de Resultado)",       actions: ["view"] },
      { id: "obrigacoes_fiscais",label: "Obrigações Fiscais",                    actions: ["view","create","edit","delete"] },
      { id: "plano_contas",      label: "Plano de Contas",                       actions: ["view","create","edit","delete"] },
      { id: "centros_custo",     label: "Centros de Custo",                      actions: ["view","create","edit","delete"] },
      { id: "conciliacao",       label: "Conciliação Bancária",                  actions: ["view","create","edit","delete"] },
      { id: "recorrentes",       label: "Recorrentes",                           actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "saldos",             label: "Saldos bancários e financeiros" },
      { id: "valores_financeiros",label: "Valores de receitas e despesas" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // OPERACIONAL
  // ══════════════════════════════════════════════════════
  "operacional": {
    pages: [
      { id: "painel",                label: "Dashboard Operacional",           actions: ["view"] },
      { id: "rdo",                   label: "RDO (Relatório Diário de Obra)",  actions: ["view","create","edit","delete"] },
      { id: "checklists",           label: "Checklists de Qualidade",         actions: ["view","create","edit","delete"] },
      { id: "concretagem",          label: "Concretagem",                     actions: ["view","create","edit","delete"] },
      { id: "nao_conformidades",    label: "Não Conformidades (NCs)",         actions: ["view","create","edit","delete"] },
      { id: "registro_fotografico", label: "Registro Fotográfico",            actions: ["view","create","edit","delete"] },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// MAPEAMENTO ROTA → PAGE_ID
// Liga cada path de rota ao ID de página em MODULE_PAGE_CONFIG.
// Usado por groupCanAccessRoute para checar permissão por página (nível "custom").
// Formato: { moduleId: { "/path/rota": "page_id" } }
// Rotas sem mapeamento (null/undefined) = acesso liberado se o módulo estiver configurado.
// ──────────────────────────────────────────────────────────────────────────────
export const ROUTE_TO_PAGEID: Record<string, Record<string, string>> = {
  "rh-dp": {
    "/colaboradores":                   "colaboradores",
    "/obras/efetivo":                   "colaboradores",
    "/relogios-ponto":                  "ponto",
    "/convencoes-coletivas":            "dissidio",
    "/fechamento-ponto":                "ponto",
    "/folha-pagamento":                 "folha",
    "/controle-documentos":             "controle_documentos",
    "/vale-alimentacao":                "vale_alimentacao",
    "/solicitacao-he":                  "hora_extra",
    "/apontamentos-campo":              "apontamentos",
    "/crachas":                         "crachas",
    "/aviso-previo":                    "aviso_previo",
    "/ferias":                          "ferias",
    "/modulo-pj":                       "contratos_pj",
    "/pj-medicoes":                     "contratos_pj",
    "/relatorios/raio-x":               "relatorios",
    "/relatorios/ponto":                "relatorios",
    "/relatorios/folha":                "relatorios",
    "/relatorios/divergencias":         "relatorios",
    "/relatorios/custo-obra":           "relatorios",
    "/dashboards":                      "dashboards",
    "/dashboards/funcionarios":         "dashboards",
    "/dashboards/cartao-ponto":         "dashboards",
    "/dashboards/folha-pagamento":      "dashboards",
    "/dashboards/horas-extras":         "dashboards",
    "/dashboards/aviso-previo":         "dashboards",
    "/dashboards/ferias":               "dashboards",
    "/dashboards/efetivo-obra":         "dashboards",
    "/dashboards/perfil-tempo-casa":    "dashboards",
    "/dashboards/controle-documentos":  "dashboards",
    "/dashboards/apontamentos":         "dashboards",
    "/feriados":                        "dissidio",
    "/dissidio":                        "dissidio",
    "/comparativo-convencoes":          "comparativo",
    "/dixi-ponto":                      "ponto",
  },
  "sst": {
    "/epis":             "epi",
    "/cipa":             "cipa",
    "/dashboards/epis":  "dashboards",
    "/controle-documentos": "epi",
  },
  "juridico": {
    "/processos-trabalhistas":  "processos",
    "/convencoes-coletivas":    "convencoes",
    "/dashboards/juridico":     "dashboards",
  },
  "avaliacao": {
    "/avaliacao-desempenho":      "avaliacoes",
    "/habilidades":               "habilidades",
    "/dashboards/habilidades":    "dashboards",
  },
  "terceiros": {
    "/terceiros/painel":       "painel",
    "/terceiros/empresas":     "empresas",
    "/terceiros/funcionarios": "trabalhadores",
    "/terceiros/obrigacoes":   "obrigacoes",
    "/terceiros/conformidade": "conformidade",
    "/terceiros/alertas":      "alertas",
    "/terceiros/aprovacao":    "documentos",
    "/terceiros/validacao-ia": "documentos",
  },
  "parceiros": {
    "/parceiros/cadastro":       "cadastro",
    "/parceiros/lancamentos":    "lancamentos",
    "/parceiros/aprovacoes":     "aprovacoes",
    "/parceiros/pagamentos":     "pagamentos",
    "/parceiros/guia-descontos": "guia_descontos",
  },
  "orcamento": {
    "/orcamento/painel":   "lista",
    "/orcamento/lista":    "lista",
    "/orcamento/importar": "importacao",
  },
  "planejamento": {
    "/planejamento": "projetos",
    "/planejamento?tab=visao-geral": "visao_geral",
    "/planejamento?tab=cronograma": "cronograma",
    "/planejamento?tab=gantt": "gantt",
    "/planejamento?tab=cronograma-financeiro": "financeiro",
    "/planejamento?tab=curva-s": "curva_s",
    "/planejamento?tab=avanco": "avanco_semanal",
    "/planejamento?tab=caminho-critico": "caminho_critico",
    "/planejamento?tab=prev-medicao": "previsao_medicao",
    "/planejamento?tab=prog-semanal": "prog_semanal",
    "/planejamento?tab=diagrama-rede": "diagrama_rede",
    "/planejamento?tab=custo-rh": "custo_rh",
    "/planejamento?tab=revisoes": "revisoes",
    "/planejamento?tab=refis": "refis",
    "/planejamento?tab=simulador": "simulador",
    "/planejamento?tab=bim-3d": "bim_3d",
  },
  "cadastro": {
    "/habilidades":            "habilidades",
    "/habilidades/importacao": "habilidades",
    "/obras":                  "obras",
    "/empresas":               "empresas",
    "/setores":                "departamentos",
    "/funcoes":                "cargos",
    "/relogios-ponto":         "relogios",
    "/convencoes-coletivas":   "convencoes",
  },
  "financeiro": {
    "/financeiro":                  "lancamentos",
    "/financeiro/lancamentos":      "lancamentos",
    "/financeiro/receitas":         "receitas",
    "/financeiro/contas-a-pagar":   "contas_pagar",
    "/financeiro/contas-a-receber": "contas_receber",
    "/financeiro/dre":              "dre",
    "/financeiro/fluxo-de-caixa":   "fluxo_caixa",
    "/financeiro/obrigacoes-fiscais":"obrigacoes_fiscais",
    "/financeiro/plano-de-contas":  "plano_contas",
    "/financeiro/centros-de-custo": "centros_custo",
    "/financeiro/conciliacao":      "conciliacao",
    "/financeiro/recorrentes":      "recorrentes",
  },
  "compras": {
    "/compras/painel":        "solicitacoes",
    "/compras/solicitacoes":  "solicitacoes",
    "/compras/cotacoes":      "cotacoes",
    "/compras/ordens":        "ordens",
    "/compras/aprovacoes":    "aprovacoes",
    "/compras/recebimentos":  "recebimentos",
    "/compras/emergencial":   "emergencial",

    "/compras/realocacao":    "realocacao",
    "/compras/fornecedores":  "fornecedores",
  },
  "almoxarifado": {
    "/almoxarifado":                  "estoque",
    "/almoxarifado/movimentacoes":    "movimentacoes",
    "/almoxarifado/inventario":       "inventario",
  },
  "operacional": {
    "/operacional/painel":                "painel",
    "/operacional/rdo":                   "rdo",
    "/operacional/checklists":            "checklists",
    "/operacional/concretagem":           "concretagem",
    "/operacional/nc":                    "nao_conformidades",
    "/operacional/fotos":                 "registro_fotografico",
  },
  "medicao": {},
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
