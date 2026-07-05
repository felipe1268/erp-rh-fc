/**
 * Rev. 4053 — Conteúdo DETALHADO de cada módulo pra página dedicada
 * `/planos/modulos/:id` (substitui o antigo dialog pequeno `ModuleDetailDialog`
 * da Rev. 4050). Cada seção/funcionalidade abaixo é baseada nas features REAIS
 * de `shared/modules.ts` (MODULE_DEFINITIONS) — só reescritas em linguagem de
 * venda, sem inventar funcionalidade que não existe no produto.
 */

export type ModuleDetailSection = {
  title: string;
  items: string[];
};

export type ModuleDetailContent = {
  id: string;
  tagline: string;
  longDescription: string[];
  sections: ModuleDetailSection[];
  aiHighlights: string[];
  integrations: string[];
};

export const MODULE_DETAILS: Record<string, ModuleDetailContent> = {
  "rh-dp": {
    id: "rh-dp",
    tagline: "Todo o ciclo de vida do colaborador, do cadastro à rescisão, em um só lugar.",
    longDescription: [
      "O módulo de RH & DP cobre tudo que um departamento pessoal de construtora precisa no dia a dia: cadastro completo de colaboradores, ponto eletrônico, folha de pagamento, férias, benefícios e toda a documentação trabalhista — sem depender de planilhas soltas ou sistemas separados que não conversam entre si.",
      "Pensado pra quem lida com centenas de colaboradores em várias obras ao mesmo tempo, com relógios de ponto, convenções coletivas e regras trabalhistas que mudam o tempo todo.",
    ],
    sections: [
      {
        title: "Cadastro e gestão de pessoas",
        items: [
          "Cadastro completo de colaboradores (documentos, dados bancários, dependentes, habilidades)",
          "Coleta de dados em campo direto pelo celular, sem retrabalho de digitação",
          "Efetivo por obra em tempo real — quem está alocado onde",
          "Controle de relógios de ponto e convenções coletivas por categoria",
          "Recontratações pendentes com alerta automático de período de carência",
        ],
      },
      {
        title: "Ponto, folha e financeiro",
        items: [
          "Fechamento de ponto e folha de pagamento mês a mês",
          "Espelho de ponto e banco de horas com saldo sempre atualizado",
          "Vale alimentação, solicitação de horas extras e apontamentos de campo",
          "Crachás de acesso e contas bancárias dos colaboradores",
        ],
      },
      {
        title: "Documentos e conformidade",
        items: [
          "Controle de documentos com vencimento (ASOs, certificados, exames)",
          "Lançamento de atestados e advertências com histórico completo",
          "Aviso prévio, pedido de demissão e férias com cálculo automático",
          "Seguro de vida e solicitação de mão de obra por obra",
        ],
      },
      {
        title: "Relatórios e dashboards",
        items: [
          "Raio-X do Funcionário — visão 360° de cada colaborador em um clique",
          "Relatórios de ponto, folha, divergências e custo por obra",
          "Dashboards de funcionários, folha, horas extras, férias e efetivo",
          "Dashboard de perfil de tempo de casa e habilidades por obra",
        ],
      },
      {
        title: "Comunicação e recrutamento",
        items: [
          "Comunicados internos oficiais com numeração automática",
          "Banco de currículos organizado por função",
        ],
      },
    ],
    aiHighlights: [
      "IA sugere férias e alerta vencimentos de documentos automaticamente",
      "IA compara convenções coletivas e aponta divergências (Comparativo de Convenções)",
      "Integração direta com ponto eletrônico, folha e banco de horas",
    ],
    integrations: ["SST (ASOs e EPIs)", "Jurídico (rescisões)", "Financeiro (folha e vale)", "Avaliação de Desempenho"],
  },

  sst: {
    id: "sst",
    tagline: "Segurança do trabalho sem planilha: EPIs, ASOs, CIPA e programas legais num painel só.",
    longDescription: [
      "Centraliza tudo que envolve saúde e segurança do trabalho na obra: entrega e controle de EPIs, exames ocupacionais (ASOs), eleições e atas de CIPA, registro de acidentes e os programas legais obrigatórios (PGR, PCMSO, LTCAT).",
      "Feito pra técnicos de segurança que hoje perdem tempo caçando prazo de vencimento em planilha — aqui o sistema avisa antes de vencer.",
    ],
    sections: [
      {
        title: "EPIs",
        items: [
          "Entrega de EPI com assinatura digital e ficha de controle",
          "Estoque de EPI por obra e checklists de verificação",
          "Descontos e transferências de EPI entre colaboradores/obras",
          "Configurações de política de entrega por função",
        ],
      },
      {
        title: "Saúde ocupacional e CIPA",
        items: [
          "ASOs e documentos de saúde com alerta de vencimento",
          "CIPA — eleições, atas e acompanhamento de mandato",
          "Registro de acidentes de trabalho com linha do tempo",
          "DDS (Diálogo Diário de Segurança) registrado por obra",
        ],
      },
      {
        title: "Programas legais e integração",
        items: [
          "PGR, PCMSO e LTCAT centralizados com histórico de revisões",
          "Integração (treinamento admissional) de novos colaboradores",
        ],
      },
      {
        title: "Dashboards",
        items: [
          "Dashboard de EPIs, atestados e acidentes",
          "Dashboard de DDS com indicador de participação por obra",
        ],
      },
    ],
    aiHighlights: [
      "IA analisa risco de vencimento de ASO e treinamentos antes que aconteça",
      "Central única de documentos de segurança, sem pasta física",
    ],
    integrations: ["Almoxarifado (estoque de EPIs)", "RH & DP (colaboradores)", "Gestão de Documentos (ARTs/RRTs)"],
  },

  juridico: {
    id: "juridico",
    tagline: "Trabalhista, tributário e cível sob controle, com risco calculado por IA.",
    longDescription: [
      "Um painel jurídico completo dividido em três frentes — Trabalhista, Tributário e Cível — com processos, audiências, provisões financeiras e análise de risco automática por inteligência artificial.",
      "Feito pra quem hoje controla dezenas de processos em planilha e perde prazo de audiência ou não sabe quanto está provisionado.",
    ],
    sections: [
      {
        title: "Trabalhista",
        items: [
          "Processos trabalhistas com linha do tempo de audiências e decisões",
          "Provisão de risco calculada automaticamente por processo",
          "Dashboard trabalhista com visão consolidada de exposição",
        ],
      },
      {
        title: "Tributário",
        items: [
          "Processos tributários (ICMS, ISS, autos de infração, defesas fiscais)",
          "Dashboard tributário com prazos e valores em discussão",
        ],
      },
      {
        title: "Cível",
        items: [
          "Processos cíveis (cobranças, indenizações, contratos, ações ordinárias)",
          "Dashboard cível consolidado",
        ],
      },
    ],
    aiHighlights: [
      "IA classifica o risco de cada processo automaticamente (provável, possível, remoto)",
      "Linha do tempo visual de cada processo, sem precisar abrir 10 arquivos",
    ],
    integrations: ["RH & DP (rescisões)", "SST (acidentes que viram processo)", "Financeiro (provisões)"],
  },

  avaliacao: {
    id: "avaliacao",
    tagline: "Avaliação de desempenho de ponta a ponta, com ranking e clima organizacional.",
    longDescription: [
      "Módulo completo de gestão de desempenho: ciclos de avaliação configuráveis, formulários personalizados, ranking automático de competências e até pesquisa de clima organizacional — tudo pensado pra gestores que nunca usaram um sistema desse tipo.",
    ],
    sections: [
      {
        title: "Avaliação e ciclos",
        items: [
          "Avaliação de funcionário com formulário 100% personalizável",
          "Avaliações realizadas com histórico completo por colaborador",
          "Cadastro de avaliadores e critérios por função",
        ],
      },
      {
        title: "Análise e resultados",
        items: [
          "Raio-X do Funcionário com o histórico de todas as avaliações",
          "Ranking automático de competências por equipe/obra",
          "Pesquisas customizadas além da avaliação padrão",
          "Clima organizacional com resultado consolidado",
        ],
      },
    ],
    aiHighlights: [
      "Ciclos e formulários 100% personalizáveis pra sua realidade",
      "Interface simples pra qualquer gestor aplicar, sem treinamento",
    ],
    integrations: ["RH & DP (Raio-X do Funcionário)", "Dashboards gerais"],
  },

  terceiros: {
    id: "terceiros",
    tagline: "Controle total de terceirizadas: documentação, obrigações e conformidade em dia.",
    longDescription: [
      "Cadastro, documentação, obrigações mensais e conformidade das empresas terceirizadas — com portal externo pra elas mesmas enviarem documentos e você só aprovar.",
    ],
    sections: [
      {
        title: "Cadastro e portal externo",
        items: [
          "Empresas terceiras e funcionários terceiros centralizados",
          "Portal externo pra terceirizada enviar documentos direto",
          "Aprovação de documentos e crachás de acesso",
          "Validação de documentos por IA antes de aprovar",
        ],
      },
      {
        title: "Obrigações e conformidade",
        items: [
          "Obrigações mensais com painel de conformidade por empresa",
          "Alertas e cobranças automáticas de vencimento",
          "Advertências e histórico de ocorrências",
        ],
      },
      {
        title: "Contratos e financeiro",
        items: [
          "Contratos de serviço com template padronizado",
          "Medições e previsão de caixa de terceiros",
          "Assinatura digital de contratos (IntegraSign)",
          "Contratos PJ com medições e conformidade dedicada",
        ],
      },
    ],
    aiHighlights: [
      "IA cruza obrigações e prazos de terceirizadas automaticamente",
      "Alertas automáticos de vencimento de documentos",
    ],
    integrations: ["Almoxarifado", "Gestão de Documentos", "Financeiro (medições PJ)"],
  },

  parceiros: {
    id: "parceiros",
    tagline: "Portal de convênios (farmácia, posto, restaurante) com aprovação em 2 cliques.",
    longDescription: [
      "Um portal onde parceiros conveniados (farmácia, posto de combustível, restaurante etc.) lançam consumo dos colaboradores, e o RH aprova direto pelo celular — descontando automaticamente na folha.",
    ],
    sections: [
      {
        title: "Cadastro e lançamentos",
        items: [
          "Cadastro de parceiros conveniados por categoria",
          "Lançamentos de consumo direto pelo portal do parceiro",
          "Guia de descontos consultável por qualquer colaborador",
        ],
      },
      {
        title: "Aprovação e pagamento",
        items: [
          "Aprovações do RH em poucos cliques, do celular",
          "Pagamentos consolidados aos parceiros",
          "Dashboard de parceiros com volume por categoria",
        ],
      },
    ],
    aiHighlights: [
      "Aprovações de convênio em poucos cliques",
      "Integração direta com a Folha — desconto automático",
    ],
    integrations: ["RH & DP / Folha de Pagamento"],
  },

  planejamento: {
    id: "planejamento",
    tagline: "Curva S, avanço físico e cronograma sempre atualizados — sem planilha de Excel.",
    longDescription: [
      "Cada obra vinculada ao seu orçamento com Curva S automática, avanço físico semanal, revisões de cronograma (REFIS) e comparação clara entre % previsto e % realizado.",
    ],
    sections: [
      {
        title: "Projetos e cronograma",
        items: [
          "Lista de projetos vinculados a cada obra e orçamento",
          "Detalhe do projeto com cronograma completo",
          "Revisões de cronograma (REFIS) com histórico de versões",
        ],
      },
      {
        title: "Avanço e Curva S",
        items: [
          "Avanço físico semanal lançado direto do celular na obra",
          "Curva S com % previsto x % realizado sempre atualizada",
          "Comparação financeira x físico num só gráfico",
        ],
      },
    ],
    aiHighlights: [
      "IA cruza avanço físico x financeiro automaticamente na Curva S",
      "Visual claro de % previsto x realizado, sem cálculo manual",
    ],
    integrations: ["Medição", "Orçamento"],
  },

  orcamento: {
    id: "orcamento",
    tagline: "Orçamento de obras com 3 versões, curva ABC e importação direta de planilha.",
    longDescription: [
      "Importe seu orçamento de Excel sem retrabalho e tenha 3 versões (Venda, Custo, Meta) organizadas por composições, insumos e encargos sociais, com curva ABC pra saber onde está o maior risco de estouro.",
    ],
    sections: [
      {
        title: "Importação e estrutura",
        items: [
          "Importação de planilha de orçamento sem retrabalho manual",
          "3 versões: Venda, Custo e Meta, comparadas lado a lado",
          "Composições e insumos organizados por categoria",
          "Encargos sociais aplicados automaticamente",
        ],
      },
      {
        title: "Análise",
        items: [
          "Curva ABC de insumos — foco no que realmente pesa no orçamento",
          "Dashboard de orçamento com desvios e alertas",
        ],
      },
    ],
    aiHighlights: [
      "IA identifica insumos fora da curva ABC automaticamente",
      "Importação de planilha sem retrabalho de digitação",
    ],
    integrations: ["Compras", "Planejamento"],
  },

  compras: {
    id: "compras",
    tagline: "Do pedido à ordem de compra: solicitações, cotações e aprovações num fluxo só.",
    longDescription: [
      "Solicitações de compra com aprovação em cadeia, cotações comparativas de vários fornecedores e emissão de ordem de compra — tudo rastreável, do pedido até o recebimento na obra.",
    ],
    sections: [
      {
        title: "Solicitação e cotação",
        items: [
          "Solicitações de compra (SC) com aprovação em cadeia",
          "Cotações comparativas entre fornecedores",
          "Compra emergencial com fluxo simplificado",
          "Cadastro de fornecedores centralizado",
        ],
      },
      {
        title: "Ordem de compra e recebimento",
        items: [
          "Ordens de compra geradas direto da cotação vencedora",
          "Recebimentos com conferência de itens entregues",
          "Realocação de material entre obras",
        ],
      },
      {
        title: "Gestão e análise",
        items: [
          "Comissões de compradores calculadas automaticamente",
          "Painel FD (fundo de despesas) e databook por obra",
          "Dashboard de compras por obra",
        ],
      },
    ],
    aiHighlights: [
      "IA compara cotações e aponta a melhor opção automaticamente",
      "Aprovação em poucos toques, direto do celular",
    ],
    integrations: ["Orçamento", "Financeiro", "Almoxarifado"],
  },

  financeiro: {
    id: "financeiro",
    tagline: "Contas a pagar/receber, conciliação bancária, DRE e fluxo de caixa em tempo real.",
    longDescription: [
      "O centro financeiro da obra: contas a pagar e a receber, conciliação bancária automática com IA, DRE por centro de custo e fluxo de caixa sempre atualizado — sem depender de planilha paralela pro fechamento do mês.",
    ],
    sections: [
      {
        title: "Contas a pagar e receber",
        items: [
          "Contas a pagar com aprovação e anexos de nota fiscal",
          "Previsão de faturamento e contas a receber por título",
          "Análise de custos por obra e centro de custo",
        ],
      },
      {
        title: "Conciliação e controle bancário",
        items: [
          "Conciliação bancária automática com leitura de extrato por IA",
          "Controle de cheques e cartão de crédito corporativo",
          "Contas bancárias e cronograma financeiro da obra",
        ],
      },
      {
        title: "Relatórios gerenciais",
        items: [
          "DRE por obra/centro de custo, sempre atualizado",
          "Fluxo de caixa projetado x realizado",
          "Plano de contas, categorias e obrigações fiscais",
          "Notas fiscais (NF-e) integradas automaticamente",
        ],
      },
    ],
    aiHighlights: [
      "IA concilia extrato bancário automaticamente",
      "DRE e fluxo de caixa sempre atualizados, sem fechamento manual",
    ],
    integrations: ["Compras", "RH & DP (Folha)", "Medição", "Terceiros (PJ)"],
  },

  medicao: {
    id: "medicao",
    tagline: "Boletim de medição pronto em minutos, com % de avanço calculado automaticamente.",
    longDescription: [
      "Medição de contratos (clientes e terceiros) com cálculo automático de % de avanço físico e faturamento, gerando o boletim de medição pronto pra assinatura — sem calcular nada na mão.",
    ],
    sections: [
      {
        title: "Contratos e medição",
        items: [
          "Contratos de medição vinculados ao cronograma da obra",
          "% de avanço físico calculado automaticamente por item",
          "Boletim de medição pronto pra assinatura em minutos",
        ],
      },
    ],
    aiHighlights: [
      "IA calcula o % de avanço automaticamente a partir do cronograma",
      "Integração direta com Planejamento — sem digitar 2 vezes",
    ],
    integrations: ["Planejamento", "Financeiro"],
  },

  almoxarifado: {
    id: "almoxarifado",
    tagline: "Estoque, ferramentas e equipamentos com inventário visual e alertas de reposição.",
    longDescription: [
      "Controle centralizado de materiais, ferramentas e equipamentos: empréstimos diários, inventário semanal e visual por baias, movimentações de entrada/saída e até equipamentos próprios e locados.",
    ],
    sections: [
      {
        title: "Estoque e movimentações",
        items: [
          "Movimentações de entrada e saída de material",
          "Inventário semanal e inventário visual por baias",
          "Histórico de inventário pra auditoria",
          "Categorias de materiais organizadas por tipo",
        ],
      },
      {
        title: "Ferramentas e equipamentos",
        items: [
          "Empréstimo de ferramentas com controle de devolução",
          "Ferramentas de terceiros rastreadas separadamente",
          "Equipamentos próprios e locados com visão geral única",
        ],
      },
    ],
    aiHighlights: [
      "IA estima consumo e alerta reposição antes de faltar material",
      "Inventário visual, fácil de conferir na obra",
    ],
    integrations: ["Compras", "Terceiros", "SST (estoque de EPIs)"],
  },

  "gestao-documentos": {
    id: "gestao-documentos",
    tagline: "Central única de documentos técnicos, revisões e ARTs/RRTs, sem pasta de rede.",
    longDescription: [
      "Toda a documentação técnica da obra organizada por disciplina, com controle de revisões, aprovações e as ARTs/RRTs sempre localizáveis — chega de procurar arquivo em pasta compartilhada.",
    ],
    sections: [
      {
        title: "Documentos e revisões",
        items: [
          "Documentos técnicos organizados por disciplina/obra",
          "Controle de revisões com histórico de versões",
          "Aprovações registradas com responsável e data",
        ],
      },
      {
        title: "ARTs / RRTs",
        items: [
          "ARTs e RRTs centralizadas com vencimento monitorado",
          "Configurações de fluxo de aprovação por tipo de documento",
        ],
      },
    ],
    aiHighlights: [
      "IA organiza revisões e aprovações pendentes automaticamente",
      "Central única pra ART, RRT e documentos ISO",
    ],
    integrations: ["SST", "Jurídico"],
  },

  frotas: {
    id: "frotas",
    tagline: "Manutenção, combustível, multas e rastreamento de toda a frota num painel só.",
    longDescription: [
      "Controle completo dos veículos da empresa: manutenções preventivas e corretivas, abastecimento, multas, IPVA, seguros e rastreamento em tempo real — com Raio-X de cada veículo.",
    ],
    sections: [
      {
        title: "Veículos e manutenção",
        items: [
          "Cadastro de veículos com Raio-X individual",
          "Manutenções preventivas e corretivas com histórico",
          "Checklist veicular e controle de quilometragem",
        ],
      },
      {
        title: "Custos e documentação",
        items: [
          "Combustível, pedágios e preços de combustível monitorados",
          "Multas, IPVA, licenciamento e seguros em um só lugar",
        ],
      },
      {
        title: "Rastreamento e dashboards",
        items: [
          "Rastreamento em tempo real (integração via Infleet)",
          "Dashboards de manutenção, combustível e pedágios",
          "Analítico consolidado de toda a frota",
        ],
      },
    ],
    aiHighlights: [
      "IA aponta manutenção preventiva antes do problema acontecer",
      "Multas, seguro e IPVA num só lugar, sem esquecer vencimento",
    ],
    integrations: ["Financeiro (custos de frota)"],
  },
};
