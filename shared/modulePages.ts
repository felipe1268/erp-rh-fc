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
      { id: "painel_rh",           label: "Painel RH (visão consolidada)",        actions: ["view"] },
      { id: "colaboradores",       label: "Colaboradores / Funcionários",        actions: ["view","create","edit","delete"] },
      { id: "coleta_campo",        label: "Coleta de Campo (RH)",                 actions: ["view","create","edit","delete"] },
      { id: "efetivo_obra",        label: "Efetivo por Obra",                     actions: ["view"] },
      { id: "ferias",              label: "Férias e Afastamentos",                actions: ["view","create","edit","delete"] },
      { id: "aviso_previo",        label: "Aviso Prévio",                         actions: ["view","create","edit","delete"] },
      { id: "seguro_vida",         label: "Seguro de Vida",                        actions: ["view","create","edit","delete"] },
      { id: "pedido_demissao",    label: "Pedido de Demissão",                   actions: ["view","create","edit","delete"] },
      { id: "ponto",               label: "Fechamento de Ponto",                  actions: ["view","create","edit","delete"] },
      { id: "dixi_ponto",          label: "Dixi Ponto (Importação/Mapeamento)",   actions: ["view","create","edit","delete"] },
      { id: "relogios_ponto",      label: "Relógios de Ponto",                    actions: ["view","create","edit","delete"] },
      { id: "folha",               label: "Folha de Pagamento",                   actions: ["view","create","edit","delete"] },
      { id: "gestao_competencias", label: "Gestão de Competências (Folha)",        actions: ["view","create","edit","delete"] },
      { id: "contas_bancarias",    label: "Contas Bancárias",                     actions: ["view","create","edit","delete"] },
      { id: "controle_documentos", label: "Controle de Documentos (Atestados/Advertências)", actions: ["view","create","edit","delete"] },
      { id: "vale_alimentacao",    label: "Vale Alimentação",                     actions: ["view","create","edit","delete"] },
      { id: "hora_extra",          label: "Hora Extra",                           actions: ["view","create","edit","delete"] },
      { id: "apontamentos",        label: "Apontamentos de Campo",                actions: ["view","create","edit","delete"] },
      { id: "crachas",             label: "Crachás",                              actions: ["view","create","edit","delete"] },
      { id: "solicitacao_mdo",     label: "Solicitação de Mão de Obra",            actions: ["view","create","edit","delete"] },
      { id: "banco_horas",         label: "Banco de Horas",                        actions: ["view","create","edit","delete"] },
      { id: "espelho_ponto",       label: "Espelho de Ponto",                      actions: ["view","edit"] },
      { id: "contratos_pj",        label: "Contratos PJ e Medições PJ",           actions: ["view","create","edit","delete"] },
      { id: "dissidio",            label: "Dissídio e Feriados",                  actions: ["view","create","edit"] },
      { id: "convencoes_coletivas", label: "Convenções Coletivas",                actions: ["view","create","edit","delete"] },
      { id: "comparativo",         label: "Comparativo de Convenções",            actions: ["view"] },
      { id: "convencao_ia",        label: "Convenção Coletiva (IA) — reajuste em massa", actions: ["view","create","edit","delete"] },
      { id: "relatorios_raiox",        label: "Relatório: Raio-X do Funcionário",     actions: ["view"] },
      { id: "relatorios_ponto",        label: "Relatório: Ponto / Cartão de Ponto",   actions: ["view"] },
      { id: "relatorios_folha",        label: "Relatório: Folha de Pagamento",        actions: ["view"] },
      { id: "relatorios_divergencias", label: "Relatório: Divergências",              actions: ["view"] },
      { id: "relatorios_custo_obra",   label: "Relatório: Custo por Obra",            actions: ["view"] },
      { id: "relatorios_habilidades",  label: "Relatório: Habilidades por Obra",      actions: ["view"] },
      { id: "comunicados",         label: "Comunicados Internos",                 actions: ["view","create","edit","delete"] },
      { id: "curriculos",          label: "Currículos (Banco de talentos)",       actions: ["view","create","edit","delete"] },
      // ─── Dashboards RH (Centro de Comando) ───
      { id: "dashboards",                        label: "Dashboards RH (acesso ao Centro de Comando)",   actions: ["view"] },
      { id: "dashboard_visao_panoramica",        label: "Dashboard: Visão Panorâmica (CEO/Diretoria)",   actions: ["view"] },
      { id: "dashboard_funcionarios",            label: "Dashboard: Funcionários (Quadro de Pessoal)",   actions: ["view"] },
      { id: "dashboard_cartao_ponto",            label: "Dashboard: Cartão de Ponto (Frequência)",       actions: ["view"] },
      { id: "dashboard_folha_pagamento",         label: "Dashboard: Folha de Pagamento (Custos)",        actions: ["view"] },
      { id: "dashboard_epis",                    label: "Dashboard: EPIs (Estoque & Entregas)",          actions: ["view"] },
      { id: "dashboard_juridico",                label: "Dashboard: Jurídico (Risco & Provisão)",        actions: ["view"] },
      { id: "dashboard_aviso_previo",            label: "Dashboard: Aviso Prévio (Rescisões)",           actions: ["view"] },
      { id: "dashboard_ferias",                  label: "Dashboard: Férias (Planejamento & Custos)",     actions: ["view"] },
      { id: "dashboard_efetivo_obra",            label: "Dashboard: Efetivo por Obra (Alocação)",        actions: ["view"] },
      { id: "dashboard_controle_documentos",     label: "Dashboard: Controle de Documentos (Compliance)",actions: ["view"] },
      { id: "dashboard_competencias",            label: "Dashboard: Competências (Anual & Rateio)",      actions: ["view"] },
      { id: "dashboard_parceiros",               label: "Dashboard: Parceiros (Convênios & Descontos)",  actions: ["view"] },
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
      { id: "painel_sst",     label: "Painel SST (visão consolidada)",            actions: ["view"] },
      { id: "epi",            label: "Controle de EPIs (Estoque, Entregas, Checklists, Descontos, Transferências, Config)", actions: ["view","create","edit","delete"] },
      { id: "cipa",           label: "CIPA (Mandatos, Membros, Reuniões, Eleições)", actions: ["view","create","edit","delete"] },
      { id: "aso_documentos", label: "ASOs / Documentos de Saúde",                actions: ["view","create","edit","delete"] },
      { id: "acidentes",      label: "Registro de Acidentes / Incidentes",        actions: ["view","create","edit","delete"] },
      { id: "dds",            label: "DDS — Diálogo Diário de Segurança",         actions: ["view","create","edit","delete"] },
      { id: "pgr",            label: "PGR — Programa de Gerenciamento de Riscos", actions: ["view","create","edit","delete"] },
      { id: "pcmso",          label: "PCMSO — Programa de Controle Médico",       actions: ["view","create","edit","delete"] },
      { id: "ltcat",          label: "LTCAT — Laudo Técnico das Cond. Ambientais", actions: ["view","create","edit","delete"] },
      { id: "integracao_sst", label: "Integração SST (Treinamentos de admissão)", actions: ["view","create","edit","delete"] },
      { id: "dashboards",     label: "Dashboards SST (EPIs, Atestados & Acidentes)", actions: ["view"] },
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
      { id: "painel_juridico",      label: "Painel Jurídico (visão geral)",          actions: ["view"] },
      { id: "painel_trabalhista",   label: "Painel Trabalhista",                     actions: ["view"] },
      { id: "painel_tributario",    label: "Painel Tributário",                      actions: ["view"] },
      { id: "painel_civil",         label: "Painel Civil",                           actions: ["view"] },
      { id: "processos",            label: "Processos Trabalhistas",                 actions: ["view","create","edit","delete"] },
      { id: "processos_tributarios",label: "Processos Tributários",                  actions: ["view","create","edit","delete"] },
      { id: "processos_civis",      label: "Processos Cíveis",                       actions: ["view","create","edit","delete"] },
      { id: "convencoes",           label: "Convenções Coletivas",                   actions: ["view","create","edit","delete"] },
      { id: "dashboards",           label: "Dashboards Jurídico (Trab/Trib/Civil)",  actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_acordos",        label: "Valores de indenizações e acordos trabalhistas" },
      { id: "documentos_confidenciais", label: "Documentos confidenciais" },
    ],
  },
  "juridico-trabalhista": {
    pages: [
      { id: "processos",    label: "Processos Trabalhistas",                      actions: ["view","create","edit","delete"] },
      { id: "convencoes",   label: "Convenções Coletivas",                        actions: ["view","create","edit","delete"] },
      { id: "dashboards",   label: "Dashboards Trabalhista",                      actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_acordos",        label: "Valores de indenizações e acordos trabalhistas" },
      { id: "documentos_confidenciais", label: "Documentos confidenciais" },
    ],
  },
  "juridico-tributario": {
    pages: [
      { id: "processos_tributarios", label: "Processos Tributários",              actions: ["view","create","edit","delete"] },
      { id: "dashboards",            label: "Dashboards Tributário",              actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_tributarios",     label: "Valores de causas e autos de infração" },
    ],
  },
  "juridico-civil": {
    pages: [
      { id: "processos_civis",  label: "Processos Cíveis",                       actions: ["view","create","edit","delete"] },
      { id: "dashboards",       label: "Dashboards Civil",                        actions: ["view"] },
    ],
    sensitiveFlags: [
      { id: "valores_civis",          label: "Valores de causas e condenações cíveis" },
    ],
  },

  // ══════════════════════════════════════════════════════
  // AVALIAÇÃO DE DESEMPENHO
  // ══════════════════════════════════════════════════════
  "avaliacao": {
    pages: [
      { id: "avaliacoes",        label: "Avaliações de Desempenho (Dashboard)",       actions: ["view","create","edit","delete"] },
      { id: "avaliar",           label: "Avaliar Funcionário (formulário)",            actions: ["view","create","edit"] },
      { id: "avaliacoes_realizadas", label: "Avaliações Realizadas (histórico)",       actions: ["view","edit","delete"] },
      { id: "raio_x_avaliacao",  label: "Raio-X do Funcionário (Avaliação)",          actions: ["view"] },
      { id: "avaliadores",       label: "Avaliadores (cadastro/permissões)",          actions: ["view","create","edit","delete"] },
      { id: "criterios",         label: "Critérios de Avaliação",                     actions: ["view","create","edit","delete"] },
      { id: "pesquisas",         label: "Pesquisas Customizadas",                     actions: ["view","create","edit","delete"] },
      { id: "clima",             label: "Clima Organizacional",                       actions: ["view","create","edit","delete"] },
      { id: "habilidades",       label: "Habilidades e Competências",                 actions: ["view","create","edit","delete"] },
      { id: "dashboards",        label: "Dashboards de Competências e Habilidades",   actions: ["view"] },
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
      { id: "contratos_pj",   label: "Contratos PJ e Medições PJ",                actions: ["view","create","edit","delete"] },
      { id: "pj_conformidade", label: "Conformidade PJ (DAS/NF/CND/Seguro/CNPJ)", actions: ["view","create","edit","delete"] },
      { id: "pj_dashboard_conformidade", label: "Dashboard Conformidade PJ (visão consolidada)", actions: ["view"] },
      { id: "template_contrato", label: "Template de Contrato (modelos)",            actions: ["view","create","edit","delete"] },
      { id: "integrasign",    label: "IntegraSign (assinatura eletrônica)",          actions: ["view","create","edit","delete"] },
      { id: "portal_terceiros", label: "Portal Externo de Terceiros",                actions: ["view"] },
      { id: "advertencias",   label: "Advertências de Terceiros",                    actions: ["view","create","edit","delete"] },
      { id: "crachas_terceiros", label: "Crachás de Terceiros",                      actions: ["view","create","edit","delete"] },
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
      { id: "painel",         label: "Painel Parceiros (visão consolidada)",      actions: ["view"] },
      { id: "cadastro",       label: "Parceiros Conveniados (cadastro)",          actions: ["view","create","edit","delete"] },
      { id: "lancamentos",    label: "Lançamentos de Parceiros",                  actions: ["view","create","edit","delete"] },
      { id: "aprovacoes",     label: "Aprovações RH",                             actions: ["view","create","edit","delete"] },
      { id: "pagamentos",     label: "Pagamentos a Parceiros",                    actions: ["view","create","edit","delete"] },
      { id: "portal",         label: "Portal Externo de Parceiros",               actions: ["view"] },
      { id: "guia_descontos", label: "Guia de Descontos",                         actions: ["view"] },
      { id: "dashboards",     label: "Dashboards de Parceiros",                   actions: ["view"] },
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
      { id: "painel",       label: "Painel Orçamento (visão consolidada)",        actions: ["view"] },
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
      // Rev. 2503 — Aba "Efetivo" (dentro do projeto, /planejamento/:id?tab=efetivo).
      // Antes não existia aqui, e como `TAB_TO_PAGEID["efetivo"] = "efetivo"`
      // (PlanejamentoDetalhe.tsx L275), `canViewPage("planejamento","efetivo")`
      // sempre retornava false pra grupos não-admin (Engenheiro de Campo etc),
      // escondendo a aba silenciosamente.
      { id: "efetivo",           label: "Efetivo da Obra (alocação no projeto)", actions: ["view","create","edit","delete"] },
      { id: "revisoes",          label: "Revisões",                               actions: ["view","create","edit","delete"] },
      { id: "refis",             label: "REFIS",                                  actions: ["view","create","edit","delete"] },
      { id: "simulador",         label: "Simulador",                              actions: ["view"] },
      { id: "bim_3d",            label: "BIM 3D / 4D",                            actions: ["view","create","edit","delete"] },
      { id: "ia_gestora",        label: "IA Gestora de Planejamento",             actions: ["view"] },
      // Rev. 1593 — aba "Avaliação Cliente" dentro da obra (NPS filtrado por obraId)
      { id: "avaliacao_cliente", label: "Avaliação do Cliente (NPS desta obra)",  actions: ["view"] },
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
      { id: "obras",         label: "Obras e Projetos",                            actions: ["view","create","edit","delete"] },
      { id: "clientes",      label: "Clientes",                                    actions: ["view","create","edit","delete"] },
      { id: "empresas",      label: "Empresas",                                    actions: ["view","create","edit","delete"] },
      { id: "colaboradores", label: "Colaboradores",                               actions: ["view","create","edit","delete"] },
      { id: "departamentos", label: "Setores / Departamentos",                     actions: ["view","create","edit","delete"] },
      { id: "cargos",        label: "Funções / Cargos",                            actions: ["view","create","edit","delete"] },
      { id: "convencoes",    label: "Convenções Coletivas",                        actions: ["view","create","edit","delete"] },
      { id: "habilidades",   label: "Habilidades",                                 actions: ["view","create","edit","delete"] },
      { id: "relogios",      label: "Relógios de Ponto",                           actions: ["view","create","edit","delete"] },
      { id: "contas_bancarias", label: "Contas Bancárias",                         actions: ["view","create","edit","delete"] },
      { id: "fornecedores",  label: "Fornecedores / Empresas Terceiras",           actions: ["view","create","edit","delete"] },
      { id: "usuarios",      label: "Usuários e Permissões",                       actions: ["view","create","edit","delete"] },
      { id: "configuracoes", label: "Configurações do Sistema",                    actions: ["view","edit"] },
      { id: "auditoria",     label: "Auditoria do Sistema",                        actions: ["view"] },
      { id: "lixeira",       label: "Lixeira (registros excluídos)",               actions: ["view","edit","delete"] },
      { id: "revisoes",      label: "Revisões / Changelog",                        actions: ["view"] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // COMPRAS
  // ══════════════════════════════════════════════════════
  "compras": {
    pages: [
      { id: "painel",         label: "Painel de Controle (visão consolidada)",     actions: ["view"] },
      { id: "dashboard_obra", label: "Dashboard por Obra",                         actions: ["view"] },
      { id: "painel_fd",      label: "Painel FD (Fundo de Despesas)",              actions: ["view"] },
      { id: "solicitacoes",   label: "Solicitações de Compra (SC)",                actions: ["view","create","edit","delete"] },
      { id: "cotacoes",       label: "Cotações",                                   actions: ["view","create","edit","delete"] },
      { id: "ordens",         label: "Ordens de Compra (OC / OS)",                 actions: ["view","create","edit","delete"] },
      { id: "recebimentos",   label: "Recebimentos",                               actions: ["view","create","edit","delete"] },
      { id: "aprovacoes",     label: "Aprovações Pendentes",                       actions: ["view","edit"] },
      { id: "emergencial",    label: "Compras Emergenciais",                       actions: ["view","create","edit","delete"] },
      { id: "financeiro",     label: "Contas a Pagar (Compras)",                   actions: ["view"] },
      { id: "realocacao",     label: "Realocação de Verba",                        actions: ["view","edit"] },
      { id: "comissoes",      label: "Comissões de Compradores",                   actions: ["view","create","edit","delete"] },
      { id: "databook",       label: "Databook de Obra",                           actions: ["view"] },
      { id: "fornecedores",   label: "Fornecedores",                               actions: ["view","create","edit","delete"] },
      { id: "configuracoes",  label: "Configurações de Compras",                   actions: ["view","edit"] },
      { id: "integracoes",    label: "Integrações (Mas Controle ERP, etc)",        actions: ["view","edit"] },
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
      { id: "lancamentos",       label: "Lançamentos Financeiros (Dashboard)",   actions: ["view","create","edit","delete"] },
      { id: "receitas",          label: "Receitas de Obras",                     actions: ["view","create","edit","delete"] },
      { id: "contas_pagar",      label: "Contas a Pagar",                        actions: ["view","create","edit","delete"] },
      { id: "contas_receber",    label: "Previsão de Faturamento",               actions: ["view","create","edit","delete"] },
      { id: "cronograma",        label: "Cronograma Financeiro",                 actions: ["view","create","edit","delete"] },
      { id: "fluxo_caixa",       label: "Fluxo de Caixa",                        actions: ["view"] },
      { id: "dre",               label: "DRE (Demonstração de Resultado)",       actions: ["view"] },
      { id: "obrigacoes_fiscais",label: "Obrigações Fiscais",                    actions: ["view","create","edit","delete"] },
      { id: "plano_contas",      label: "Plano de Contas",                       actions: ["view","create","edit","delete"] },
      { id: "centros_custo",     label: "Centros de Custo",                      actions: ["view","create","edit","delete"] },
      { id: "conciliacao",       label: "Conciliação Bancária",                  actions: ["view","create","edit","delete"] },
      { id: "recorrentes",       label: "Recorrentes",                           actions: ["view","create","edit","delete"] },
      { id: "configuracoes",     label: "Configurações Financeiras",             actions: ["view","edit"] },
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
      { id: "diario_obra",           label: "Diário de Obra (lista de obras)", actions: ["view","create","edit","delete"] },
      { id: "rdo",                   label: "RDO (Relatório Diário de Obra)",  actions: ["view","create","edit","delete"] },
      { id: "checklists",            label: "Checklists de Qualidade",         actions: ["view","create","edit","delete"] },
      { id: "liberacao_servicos",    label: "Liberação de Serviços",           actions: ["view","create","edit","delete"] },
      { id: "concretagem",           label: "Concretagem",                     actions: ["view","create","edit","delete"] },
      { id: "nao_conformidades",     label: "Não Conformidades (NCs)",         actions: ["view","create","edit","delete"] },
      { id: "registro_fotografico",  label: "Registro Fotográfico",            actions: ["view","create","edit","delete"] },
    ],
  },
  "gestao-documentos": {
    pages: [
      { id: "painel",         label: "Painel Geral",                                actions: ["view"] },
      { id: "documentos",     label: "Documentos Técnicos (revisões/disciplinas)",  actions: ["view","create","edit","delete"] },
      { id: "arts",           label: "ARTs / RRTs",                                 actions: ["view","create","edit","delete"] },
      { id: "configuracoes",  label: "Configurações (disciplinas/pastas)",          actions: ["view","edit"] },
    ],
  },
  "frotas": {
    pages: [
      { id: "painel",                  label: "Dashboard Frotas",                actions: ["view"] },
      { id: "analitico",               label: "Analítico (KPIs e indicadores)",  actions: ["view"] },
      { id: "manutencoes_dashboard",   label: "Dashboard de Manutenções",        actions: ["view"] },
      { id: "veiculos",                label: "Veículos",                        actions: ["view","create","edit","delete"] },
      { id: "raio_x_veiculo",          label: "Raio-X do Veículo",               actions: ["view"] },
      { id: "manutencoes",             label: "Manutenções",                     actions: ["view","create","edit","delete"] },
      { id: "checklist_veicular",      label: "Checklist Veicular",              actions: ["view","create","edit","delete"] },
      { id: "combustivel",             label: "Combustível (abastecimentos)",    actions: ["view","create","edit","delete"] },
      { id: "precos_combustivel",      label: "Preços de Combustível",           actions: ["view","create","edit","delete"] },
      { id: "pedagios",                label: "Pedágios",                        actions: ["view","create","edit","delete"] },
      { id: "multas",                  label: "Multas",                          actions: ["view","create","edit","delete"] },
      { id: "ipva",                    label: "IPVA",                            actions: ["view","create","edit","delete"] },
      { id: "licenciamento",           label: "Licenciamento",                   actions: ["view","create","edit","delete"] },
      { id: "seguros",                 label: "Seguros",                         actions: ["view","create","edit","delete"] },
      { id: "rastreamento",            label: "Rastreamento (mapa/trajetos)",    actions: ["view"] },
      { id: "controle_km",             label: "Controle de Quilometragem",       actions: ["view","create","edit","delete"] },
    ],
  },
  "medicao": {
    pages: [
      { id: "contratos",  label: "Contratos de Medição (BMs/Faturamento)", actions: ["view","create","edit","delete"] },
    ],
    sensitiveFlags: [
      { id: "valores_medicao", label: "Valores de medição e faturamento" },
    ],
  },
  "comunicados-internos": {
    pages: [
      { id: "comunicados",  label: "Comunicados Internos",  actions: ["view","create","edit","delete"] },
    ],
  },
  "curriculos": {
    pages: [
      { id: "curriculos",  label: "Banco de Currículos",  actions: ["view","create","edit","delete"] },
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
    "/painel/rh":                       "painel_rh",
    "/colaboradores":                   "colaboradores",
    "/coleta-campo":                    "coleta_campo",
    "/obras/efetivo":                   "efetivo_obra",
    "/controle-documentos?tab=atestados":     "controle_documentos",
    "/controle-documentos?tab=advertencias":  "controle_documentos",
    "/relatorios/habilidades-obra":     "relatorios_habilidades",
    "/dashboards/habilidades":          "dashboards",
    "/comunicados-internos":            "comunicados",
    "/curriculos":                      "curriculos",
    "/relogios-ponto":                  "relogios_ponto",
    "/convencoes-coletivas":            "convencoes_coletivas",
    "/contas-bancarias":                "contas_bancarias",
    "/fechamento-ponto":                "ponto",
    "/dixi-ponto":                      "dixi_ponto",
    "/folha-pagamento":                 "folha",
    "/gestao-competencias":             "gestao_competencias",
    "/controle-documentos":             "controle_documentos",
    "/vale-alimentacao":                "vale_alimentacao",
    "/solicitacao-he":                  "hora_extra",
    "/apontamentos-campo":              "apontamentos",
    "/crachas":                         "crachas",
    "/aviso-previo":                    "aviso_previo",
    "/seguro-vida":                     "seguro_vida",
    "/pedido-demissao":                 "pedido_demissao",
    "/ferias":                          "ferias",
    "/solicitacao-mdo":                 "solicitacao_mdo",
    "/banco-horas":                     "banco_horas",
    "/espelho-ponto":                   "espelho_ponto",
    "/feriados":                        "dissidio",
    "/dissidio":                        "dissidio",
    "/comparativo-convencoes":          "comparativo",
    "/convencao-ia":                    "convencao_ia",
    "/relatorios/raio-x":               "relatorios_raiox",
    "/relatorios/ponto":                "relatorios_ponto",
    "/relatorios/folha":                "relatorios_folha",
    "/relatorios/divergencias":         "relatorios_divergencias",
    "/relatorios/custo-obra":           "relatorios_custo_obra",
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
  },
  "sst": {
    "/painel/sst":                 "painel_sst",
    "/epis":                       "epi",
    "/epis?tab=entregas":          "epi",
    "/epis?tab=estoque_obra":      "epi",
    "/epis?tab=checklist":         "epi",
    "/epis?tab=descontos":         "epi",
    "/epis?tab=transferencias":    "epi",
    "/epis?tab=config":            "epi",
    "/cipa":                       "cipa",
    "/controle-documentos":        "aso_documentos",
    "/sst/acidentes":              "acidentes",
    "/sst/dds":                    "dds",
    "/sst/dds-dashboard":          "dds",
    "/programas-sst?tab=PGR":      "pgr",
    "/programas-sst?tab=PCMSO":    "pcmso",
    "/programas-sst?tab=LTCAT":    "ltcat",
    "/sst/integracao":             "integracao_sst",
    "/dashboards/epis":            "dashboards",
    "/sst/dashboard-atestados-acidentes": "dashboards",
  },
  "juridico": {
    "/painel/juridico":              "painel_juridico",
    "/painel/juridico-trabalhista":  "painel_trabalhista",
    "/painel/tributario":            "painel_tributario",
    "/painel/civil":                 "painel_civil",
    "/processos-trabalhistas":       "processos",
    "/processos-tributarios":        "processos_tributarios",
    "/processos-civis":              "processos_civis",
    "/convencoes-coletivas":         "convencoes",
    "/dashboards/juridico-geral":    "dashboards",
    "/dashboards/juridico":          "dashboards",
    "/dashboards/tributario":        "dashboards",
    "/dashboards/civil":             "dashboards",
  },
  "juridico-trabalhista": {
    "/painel/juridico-trabalhista":  "painel",
    "/processos-trabalhistas":       "processos",
    "/convencoes-coletivas":         "convencoes",
    "/dashboards/juridico":          "dashboards",
  },
  "juridico-tributario": {
    "/painel/tributario":         "painel",
    "/processos-tributarios":     "processos",
    "/dashboards/tributario":     "dashboards",
  },
  "juridico-civil": {
    "/painel/civil":              "painel",
    "/processos-civis":           "processos",
    "/dashboards/civil":          "dashboards",
  },
  "avaliacao": {
    "/avaliacao-desempenho":                    "avaliacoes",
    "/avaliacao-desempenho?tab=avaliar":        "avaliar",
    "/avaliacao-desempenho?tab=avaliacoes":     "avaliacoes_realizadas",
    "/avaliacao-desempenho?tab=raio-x":         "raio_x_avaliacao",
    "/avaliacao-desempenho?tab=avaliadores":    "avaliadores",
    "/avaliacao-desempenho?tab=criterios":      "criterios",
    "/avaliacao-desempenho?tab=pesquisas":      "pesquisas",
    "/avaliacao-desempenho?tab=clima":          "clima",
    "/habilidades":                             "habilidades",
    "/dashboards/habilidades":                  "dashboards",
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
    "/terceiros/contratos":    "contratos",
    "/terceiros/contratos/template": "template_contrato",
    "/terceiros/medicoes":     "medicoes",
    "/terceiros/previsao-caixa": "previsao_caixa",
    "/terceiros/portal":       "portal_terceiros",
    "/terceiros/advertencias": "advertencias",
    "/terceiros/crachas":      "crachas_terceiros",
    "/integrasign":            "integrasign",
    "/modulo-pj":              "contratos_pj",
    "/pj-medicoes":            "contratos_pj",
    "/terceiros/pj/conformidade": "pj_conformidade",
    "/terceiros/pj/dashboard-conformidade": "pj_dashboard_conformidade",
  },
  "parceiros": {
    "/parceiros/painel":         "painel",
    "/parceiros/cadastro":       "cadastro",
    "/parceiros/lancamentos":    "lancamentos",
    "/parceiros/aprovacoes":     "aprovacoes",
    "/parceiros/pagamentos":     "pagamentos",
    "/parceiros/portal":         "portal",
    "/parceiros/guia-descontos": "guia_descontos",
    "/dashboards/parceiros":     "dashboards",
  },
  "orcamento": {
    "/orcamento/painel":      "painel",
    "/orcamento/dash":        "dashboard",
    "/orcamento/lista":       "lista",
    "/orcamento/importar":    "importacao",
    "/orcamento/composicoes": "biblioteca",
    "/orcamento/insumos":     "insumos",
    "/orcamento/encargos":    "encargos",
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
    "/planejamento?tab=efetivo": "efetivo",
    "/planejamento?tab=revisoes": "revisoes",
    "/planejamento?tab=refis": "refis",
    "/planejamento?tab=simulador": "simulador",
    "/planejamento?tab=bim-3d": "bim_3d",
    "/planejamento?tab=avaliacao-cliente": "avaliacao_cliente",
  },
  "cadastro": {
    "/habilidades":            "habilidades",
    "/habilidades/importacao": "habilidades",
    "/obras":                  "obras",
    "/obras/efetivo":          "obras",
    "/clientes":               "clientes",
    "/empresas":               "empresas",
    "/colaboradores":          "colaboradores",
    "/setores":                "departamentos",
    "/funcoes":                "cargos",
    "/relogios-ponto":         "relogios",
    "/convencoes-coletivas":   "convencoes",
    "/contas-bancarias":       "contas_bancarias",
    "/compras/fornecedores":   "fornecedores",
    "/usuarios":               "usuarios",
    "/configuracoes":          "configuracoes",
    "/auditoria":              "auditoria",
    "/lixeira":                "lixeira",
    "/revisoes":               "revisoes",
  },
  "financeiro": {
    "/financeiro":                  "lancamentos",
    "/financeiro/lancamentos":      "lancamentos",
    "/financeiro/receitas":         "receitas",
    "/financeiro/contas-a-pagar":   "contas_pagar",
    "/financeiro/contas-a-receber": "contas_receber",
    "/financeiro/cronograma":       "cronograma",
    "/financeiro/dre":              "dre",
    "/financeiro/fluxo-de-caixa":   "fluxo_caixa",
    "/financeiro/obrigacoes-fiscais":"obrigacoes_fiscais",
    "/financeiro/plano-de-contas":  "plano_contas",
    // Rev. 2087 — Categorias herda o pageId do Plano de Contas
    // (são irmãs em "Cadastros" — quem tem acesso a uma, vê a outra
    // automaticamente, sem precisar re-salvar grupo).
    "/financeiro/categorias":       "plano_contas",
    "/financeiro/centros-de-custo": "centros_custo",
    "/financeiro/conciliacao":      "conciliacao",
    "/financeiro/recorrentes":      "recorrentes",
    "/financeiro/configuracoes":    "configuracoes",
  },
  "compras": {
    "/compras/painel":         "painel",
    "/compras/dashboard-obra": "dashboard_obra",
    "/compras/painel-fd":      "painel_fd",
    "/compras/solicitacoes":   "solicitacoes",
    "/compras/cotacoes":       "cotacoes",
    "/compras/ordens":         "ordens",
    "/compras/aprovacoes":     "aprovacoes",
    "/compras/recebimentos":   "recebimentos",
    "/compras/emergencial":    "emergencial",
    "/compras/realocacao":     "realocacao",
    "/compras/comissoes":      "comissoes",
    "/compras/databook":       "databook",
    "/compras/fornecedores":   "fornecedores",
    "/compras/configuracoes":  "configuracoes",
    "/integracoes/mas-controle": "integracoes",
  },
  "almoxarifado": {
    "/almoxarifado":                  "estoque",
    "/almoxarifado/movimentacoes":    "movimentacoes",
    "/almoxarifado/inventario":       "inventario",
    "/almoxarifado/ferramentas-terceiros": "ferramentas_terceiros",
    "/almoxarifado/categorias":       "categorias",
    // Equipamentos (Rev. 2258, sem SE — movida pra compras em 2259)
    "/equipamentos":                  "equipamentos_hub",
    "/equipamentos/proprios":         "equipamentos_proprios",
    "/equipamentos/locados":          "equipamentos_locados",
  },
  "operacional": {
    "/operacional/painel":                "painel",
    "/operacional/diario-obra":           "diario_obra",
    "/operacional/rdo":                   "rdo",
    "/operacional/checklists":            "checklists",
    "/operacional/liberacao-servicos":    "liberacao_servicos",
    "/operacional/concretagem":           "concretagem",
    "/operacional/nc":                    "nao_conformidades",
    "/operacional/fotos":                 "registro_fotografico",
  },
  "gestao-documentos": {
    "/gestao-documentos":                       "painel",
    "/gestao-documentos?tab=painel":            "painel",
    "/gestao-documentos?tab=documentos":        "documentos",
    "/gestao-documentos?tab=arts":              "arts",
    "/gestao-documentos?tab=configuracoes":     "configuracoes",
  },
  "frotas": {
    "/frotas/painel":                "painel",
    "/frotas/analitico":             "analitico",
    "/frotas/manutencoes-dashboard": "manutencoes_dashboard",
    "/frotas/combustivel-dashboard": "combustivel",
    "/frotas/pedagios-dashboard":    "pedagios",
    "/frotas/veiculos":              "veiculos",
    "/frotas/raio-x":                "raio_x_veiculo",
    "/frotas/manutencoes":           "manutencoes",
    "/frotas/checklist":             "checklist_veicular",
    "/frotas/combustivel":           "combustivel",
    "/frotas/precos-combustivel":    "precos_combustivel",
    "/frotas/pedagios":              "pedagios",
    "/frotas/multas":                "multas",
    "/frotas/ipva":                  "ipva",
    "/frotas/licenciamento":         "licenciamento",
    "/frotas/seguros":               "seguros",
    "/frotas/rastreamento":          "rastreamento",
    "/frotas/controle-km":           "controle_km",
  },
  "medicao": {
    "/medicao":  "contratos",
  },
  "comunicados-internos": {
    "/comunicados-internos":  "comunicados",
  },
  "curriculos": {
    "/curriculos":  "curriculos",
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
  extras?: Record<string, boolean>; // Permissões especiais do módulo (ex: canEditEpiCentral)
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
    let pages = obj.pages ?? defaultPagesForLevel(moduleId, (obj.level as "admin" | "viewer") ?? "admin");
    // Shim retrocompatível: usuários que tinham a página agregada "relatorios"
    // (rh-dp) ganham automaticamente as 5 páginas separadas que a substituíram.
    if (moduleId === "rh-dp" && pages && (pages as any).relatorios) {
      const old = (pages as any).relatorios as PagePerms;
      const expand = ["relatorios_raiox","relatorios_ponto","relatorios_folha","relatorios_divergencias","relatorios_custo_obra"];
      pages = { ...pages };
      for (const id of expand) {
        if (!(id in pages)) {
          (pages as any)[id] = { view: !!old.view, create: false, edit: false, delete: false };
        }
      }
    }
    // Shims Rev. 1761 — páginas remapeadas pra novos pageIds não devem trancar
    // usuários custom que tinham a página antiga liberada. Copia view/create/edit/delete
    // do pageId legado pro novo, somente quando o novo ainda não existe na perm.
    const REMAPS: Record<string, Array<[string, string]>> = {
      "compras":          [["solicitacoes", "painel"]],
      "orcamento":        [["lista", "painel"]],
      "frotas":           [["painel", "analitico"]],
      "gestao-documentos":[["documentos", "painel"]],
    };
    const remaps = REMAPS[moduleId];
    if (remaps && pages) {
      pages = { ...pages };
      for (const [oldId, newId] of remaps) {
        if (!(newId in pages) && (oldId in pages)) {
          (pages as any)[newId] = { ...(pages as any)[oldId] };
        }
      }
    }
    return {
      level:           obj.level ?? "admin",
      pages,
      sensitiveHidden: obj.sensitiveHidden ?? [],
      extras:          (obj.extras && typeof obj.extras === "object") ? (obj.extras as Record<string, boolean>) : {},
    };
  }
  return null;
}
