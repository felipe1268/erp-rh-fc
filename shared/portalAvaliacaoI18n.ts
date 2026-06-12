// Rev. 2985 — i18n da AVALIAÇÃO PÚBLICA (NPS) do Portal do Cliente.
// O admin escolhe o idioma ao gerar o link (embutido no JWT + gravado no
// short-link); a página pública renderiza neste idioma e oferece um seletor
// para o cliente trocar. Idiomas: pt-BR (padrão), Inglês, Mandarim.
//
// IMPORTANTE: as chaves de `critPessoa`/`critEquipe`/`critEscritorio` DEVEM ser
// idênticas (mesmas keys/ordem) às constantes CRIT_* de PortalDashboardCliente,
// pois são usadas para coletar as notas no envio.

export type AvaliacaoLang = "pt" | "en" | "zh";

export const AVALIACAO_LANGS: { value: AvaliacaoLang; label: string; flag: string }[] = [
  { value: "pt", label: "Português", flag: "🇧🇷" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "zh", label: "中文", flag: "🇨🇳" },
];

export function normalizeAvaliacaoLang(v: any): AvaliacaoLang {
  return v === "en" || v === "zh" ? v : "pt";
}

type Crit = { key: string; label: string };

export interface AvaliacaoStrings {
  headerTitle: string;
  headerSubtitle: string;
  langLabel: string;
  anonTitle: string;
  anonSubtitle: string;
  obraAvaliada: string;
  sobreQualObra: string;
  selecioneObra: string;
  linkSemObra: string;
  notaGeral: string;
  notaGeralSub: string;
  avalie0a10: string;
  opcional: string;
  preenchidoAuto: string;
  blocoGestor: string;
  gestorResponsavel: string;
  phGestor: string;
  comoGestorEvolui: string;
  phComentarioGestor: string;
  blocoEncarregado: string;
  nomeEncarregado: string;
  phEncarregado: string;
  blocoEquipe: string;
  comentarioEquipe: string;
  phComentarioEquipe: string;
  blocoEmpresa: string;
  comentarioEmpresa: string;
  phComentarioEmpresa: string;
  blocoEscritorio: string;
  comentarioEscritorio: string;
  phComentarioEscritorio: string;
  blocoObra: string;
  recomendaria: string;
  recSim: string;
  recTalvez: string;
  recNao: string;
  pontosFortes: string;
  phPontosFortes: string;
  pontosFracos: string;
  phPontosFracos: string;
  enviar: string;
  enviando: string;
  obrigadoTitulo: string;
  obrigadoTexto: string;
  toastEnviado: string;
  // Validações (toasts)
  valGestor: string;
  valEncarregado: string;
  valEquipe: string;
  valEmpresa: string;
  valEscritorio: string;
  valObra: string;
  valRecomenda: string;
  valNotaGeral: string;
  valObraSel: string;
  valLinkSemObra: string;
  // Rótulos das 4 perguntas core renderizadas via lbl()
  core: { notaEmpresa: string; notaObra: string; notaPrazo: string; notaQualidade: string };
  // Critérios detalhados (keys idênticas às CRIT_* do componente)
  critPessoa: Crit[];
  critEquipe: Crit[];
  critEscritorio: Crit[];
}

export const AVALIACAO_I18N: Record<AvaliacaoLang, AvaliacaoStrings> = {
  pt: {
    headerTitle: "Pesquisa de Satisfação",
    headerSubtitle: "Sua opinião — 100% anônima",
    langLabel: "Idioma",
    anonTitle: "Avaliação 100% anônima",
    anonSubtitle: "Não armazenamos sua identidade, nem CNPJ, nem IP. Sinta-se à vontade para ser sincero — suas respostas ajudam a equipe FC a evoluir.",
    obraAvaliada: "Obra avaliada",
    sobreQualObra: "Sobre qual obra?",
    selecioneObra: "Selecione a obra…",
    linkSemObra: "Este link não está vinculado a uma obra. Solicite um novo link de avaliação ao FC para continuar.",
    notaGeral: "Nota geral",
    notaGeralSub: "Calculada automaticamente a partir das suas respostas (0 = péssimo · 10 = excelente)",
    avalie0a10: "Avalie de 0 a 10 cada item (todos obrigatórios):",
    opcional: "(opcional)",
    preenchidoAuto: "preenchido automaticamente",
    blocoGestor: "Gestor / Responsável FC pela obra",
    gestorResponsavel: "Gestor responsável",
    phGestor: "Ex.: Eng. João da Silva",
    comoGestorEvolui: "Como o gestor pode evoluir?",
    phComentarioGestor: "Clareza, proatividade, presença em obra, decisões técnicas...",
    blocoEncarregado: "Encarregado FC na obra",
    nomeEncarregado: "Nome do encarregado",
    phEncarregado: "Ex.: Sr. José Carlos",
    blocoEquipe: "Equipe direta FC na obra",
    comentarioEquipe: "Comentário sobre a equipe",
    phComentarioEquipe: "Postura, técnica, segurança, organização, pontualidade...",
    blocoEmpresa: "FC Engenharia (Empresa)",
    comentarioEmpresa: "Comentário sobre a Empresa",
    phComentarioEmpresa: "Imagem da empresa, postura institucional, processos administrativos...",
    blocoEscritorio: "Escritório Central / Backoffice",
    comentarioEscritorio: "Comentário sobre o Escritório Central",
    phComentarioEscritorio: "Suporte administrativo, contratos, faturamento, agilidade nas respostas...",
    blocoObra: "Obra / Execução",
    recomendaria: "Você recomendaria a FC para outras empresas?",
    recSim: "Sim, com certeza",
    recTalvez: "Talvez",
    recNao: "Não",
    pontosFortes: "Pontos fortes — o que mais te impressionou positivamente?",
    phPontosFortes: "O que está funcionando bem na obra, equipe, gestão ou no escritório central...",
    pontosFracos: "Pontos fracos — o que precisa melhorar?",
    phPontosFracos: "Sugestões, oportunidades de melhoria, gargalos identificados...",
    enviar: "Enviar avaliação anônima",
    enviando: "Enviando...",
    obrigadoTitulo: "Obrigado pela avaliação!",
    obrigadoTexto: "Suas respostas foram registradas de forma totalmente anônima e ajudarão a FC Engenharia a melhorar continuamente.",
    toastEnviado: "Obrigado! Sua avaliação foi enviada.",
    valGestor: 'Avalie todos os itens do bloco "Gestor / Responsável FC pela obra" (0 a 10).',
    valEncarregado: 'Avalie todos os itens do bloco "Encarregado FC na obra" (0 a 10).',
    valEquipe: 'Avalie todos os itens do bloco "Equipe direta FC na obra" (0 a 10).',
    valEmpresa: 'Avalie a "FC Engenharia (Empresa)" (0 a 10).',
    valEscritorio: 'Avalie todos os itens do bloco "Escritório Central / Backoffice" (0 a 10).',
    valObra: 'Avalie todos os itens do bloco "Obra / Execução" (0 a 10).',
    valRecomenda: 'Responda "Você recomendaria a FC para outras empresas?".',
    valNotaGeral: "Responda pelo menos alguns itens para calcular a nota geral",
    valObraSel: "Selecione a obra avaliada antes de enviar.",
    valLinkSemObra: "Este link não está vinculado a uma obra. Solicite um novo link de avaliação ao FC.",
    core: {
      notaEmpresa: "Empresa FC (reputação, transparência, comunicação institucional)",
      notaObra: "Andamento da obra",
      notaPrazo: "Cumprimento de prazos",
      notaQualidade: "Qualidade do serviço entregue",
    },
    critPessoa: [
      { key: "postura", label: "Postura e reforço positivo" },
      { key: "documentos", label: "Entrega de documentos periódicos" },
      { key: "prontoAtendimento", label: "Pronto atendimento" },
      { key: "disponibilidade", label: "Disponibilidade" },
      { key: "conhecimentoTecnico", label: "Conhecimento técnico" },
      { key: "educacao", label: "Educação e cordialidade" },
    ],
    critEquipe: [
      { key: "tecnica", label: "Qualidade técnica do serviço" },
      { key: "organizacao", label: "Organização e limpeza" },
      { key: "seguranca", label: "Segurança (EPI / procedimentos)" },
      { key: "pontualidade", label: "Pontualidade e assiduidade" },
      { key: "educacao", label: "Educação e postura" },
      { key: "comunicacao", label: "Comunicação e atendimento" },
    ],
    critEscritorio: [
      { key: "atendimento", label: "Atendimento administrativo" },
      { key: "documentacao", label: "Documentação e contratos" },
      { key: "faturamento", label: "Faturamento e financeiro" },
      { key: "agilidade", label: "Agilidade nas respostas" },
      { key: "comunicacao", label: "Comunicação e transparência" },
    ],
  },
  en: {
    headerTitle: "Satisfaction Survey",
    headerSubtitle: "Your feedback — 100% anonymous",
    langLabel: "Language",
    anonTitle: "100% anonymous survey",
    anonSubtitle: "We do not store your identity, company ID, or IP address. Feel free to be honest — your answers help the FC team improve.",
    obraAvaliada: "Project being evaluated",
    sobreQualObra: "Which project?",
    selecioneObra: "Select the project…",
    linkSemObra: "This link is not linked to a project. Please request a new survey link from FC to continue.",
    notaGeral: "Overall score",
    notaGeralSub: "Calculated automatically from your answers (0 = very poor · 10 = excellent)",
    avalie0a10: "Rate each item from 0 to 10 (all required):",
    opcional: "(optional)",
    preenchidoAuto: "filled automatically",
    blocoGestor: "FC Manager / Project lead",
    gestorResponsavel: "Responsible manager",
    phGestor: "e.g., Eng. John Smith",
    comoGestorEvolui: "How can the manager improve?",
    phComentarioGestor: "Clarity, proactivity, presence on site, technical decisions...",
    blocoEncarregado: "FC Site foreman",
    nomeEncarregado: "Foreman's name",
    phEncarregado: "e.g., Mr. Joseph",
    blocoEquipe: "FC field team on site",
    comentarioEquipe: "Comment about the team",
    phComentarioEquipe: "Conduct, technique, safety, organization, punctuality...",
    blocoEmpresa: "FC Engenharia (Company)",
    comentarioEmpresa: "Comment about the company",
    phComentarioEmpresa: "Company image, institutional conduct, administrative processes...",
    blocoEscritorio: "Head office / Back office",
    comentarioEscritorio: "Comment about the head office",
    phComentarioEscritorio: "Administrative support, contracts, billing, responsiveness...",
    blocoObra: "Project / Execution",
    recomendaria: "Would you recommend FC to other companies?",
    recSim: "Yes, definitely",
    recTalvez: "Maybe",
    recNao: "No",
    pontosFortes: "Strengths — what impressed you the most?",
    phPontosFortes: "What is working well on the project, team, management, or head office...",
    pontosFracos: "Weaknesses — what needs to improve?",
    phPontosFracos: "Suggestions, opportunities for improvement, bottlenecks identified...",
    enviar: "Submit anonymous survey",
    enviando: "Submitting...",
    obrigadoTitulo: "Thank you for your feedback!",
    obrigadoTexto: "Your answers were recorded completely anonymously and will help FC Engenharia improve continuously.",
    toastEnviado: "Thank you! Your survey has been submitted.",
    valGestor: 'Please rate all items in the "FC Manager / Project lead" section (0 to 10).',
    valEncarregado: 'Please rate all items in the "FC Site foreman" section (0 to 10).',
    valEquipe: 'Please rate all items in the "FC field team on site" section (0 to 10).',
    valEmpresa: 'Please rate "FC Engenharia (Company)" (0 to 10).',
    valEscritorio: 'Please rate all items in the "Head office / Back office" section (0 to 10).',
    valObra: 'Please rate all items in the "Project / Execution" section (0 to 10).',
    valRecomenda: 'Please answer "Would you recommend FC to other companies?".',
    valNotaGeral: "Answer at least a few items so the overall score can be calculated.",
    valObraSel: "Select the project being evaluated before submitting.",
    valLinkSemObra: "This link is not linked to a project. Please request a new survey link from FC.",
    core: {
      notaEmpresa: "FC Company (reputation, transparency, institutional communication)",
      notaObra: "Project progress",
      notaPrazo: "Meeting deadlines",
      notaQualidade: "Quality of the delivered service",
    },
    critPessoa: [
      { key: "postura", label: "Attitude and positive reinforcement" },
      { key: "documentos", label: "Delivery of periodic documents" },
      { key: "prontoAtendimento", label: "Promptness" },
      { key: "disponibilidade", label: "Availability" },
      { key: "conhecimentoTecnico", label: "Technical knowledge" },
      { key: "educacao", label: "Courtesy and politeness" },
    ],
    critEquipe: [
      { key: "tecnica", label: "Technical quality of the work" },
      { key: "organizacao", label: "Organization and cleanliness" },
      { key: "seguranca", label: "Safety (PPE / procedures)" },
      { key: "pontualidade", label: "Punctuality and attendance" },
      { key: "educacao", label: "Politeness and conduct" },
      { key: "comunicacao", label: "Communication and service" },
    ],
    critEscritorio: [
      { key: "atendimento", label: "Administrative support" },
      { key: "documentacao", label: "Documentation and contracts" },
      { key: "faturamento", label: "Billing and finance" },
      { key: "agilidade", label: "Responsiveness" },
      { key: "comunicacao", label: "Communication and transparency" },
    ],
  },
  zh: {
    headerTitle: "满意度调查",
    headerSubtitle: "您的意见——完全匿名",
    langLabel: "语言",
    anonTitle: "完全匿名的评价",
    anonSubtitle: "我们不会保存您的身份、公司税号或 IP 地址。请放心如实填写——您的回答有助于 FC 团队不断改进。",
    obraAvaliada: "所评价的工程",
    sobreQualObra: "评价哪个工程？",
    selecioneObra: "请选择工程…",
    linkSemObra: "此链接未关联任何工程。请向 FC 索取新的评价链接以继续。",
    notaGeral: "总评分",
    notaGeralSub: "根据您的回答自动计算（0 = 非常差 · 10 = 非常好）",
    avalie0a10: "请为每一项打分，0 到 10（全部必填）：",
    opcional: "（选填）",
    preenchidoAuto: "自动填写",
    blocoGestor: "FC 工程经理/负责人",
    gestorResponsavel: "负责经理",
    phGestor: "例如：张工程师",
    comoGestorEvolui: "经理可以在哪些方面提升？",
    phComentarioGestor: "清晰度、主动性、现场到场情况、技术决策……",
    blocoEncarregado: "FC 现场工长",
    nomeEncarregado: "工长姓名",
    phEncarregado: "例如：李先生",
    blocoEquipe: "FC 现场施工团队",
    comentarioEquipe: "对团队的评价",
    phComentarioEquipe: "举止、技术、安全、组织、守时……",
    blocoEmpresa: "FC Engenharia（公司）",
    comentarioEmpresa: "对公司的评价",
    phComentarioEmpresa: "公司形象、企业行为、行政流程……",
    blocoEscritorio: "总部/后勤办公室",
    comentarioEscritorio: "对总部的评价",
    phComentarioEscritorio: "行政支持、合同、开票、响应速度……",
    blocoObra: "工程/施工",
    recomendaria: "您会向其他公司推荐 FC 吗？",
    recSim: "会，非常推荐",
    recTalvez: "也许",
    recNao: "不会",
    pontosFortes: "优点——最让您印象深刻的是什么？",
    phPontosFortes: "工程、团队、管理或总部有哪些做得好的地方……",
    pontosFracos: "不足——哪些方面需要改进？",
    phPontosFracos: "建议、可改进之处、发现的瓶颈……",
    enviar: "提交匿名评价",
    enviando: "提交中…",
    obrigadoTitulo: "感谢您的评价！",
    obrigadoTexto: "您的回答已完全匿名记录，将帮助 FC Engenharia 持续改进。",
    toastEnviado: "谢谢！您的评价已提交。",
    valGestor: '请为"FC 工程经理/负责人"部分的所有项目打分（0 到 10）。',
    valEncarregado: '请为"FC 现场工长"部分的所有项目打分（0 到 10）。',
    valEquipe: '请为"FC 现场施工团队"部分的所有项目打分（0 到 10）。',
    valEmpresa: '请为"FC Engenharia（公司）"打分（0 到 10）。',
    valEscritorio: '请为"总部/后勤办公室"部分的所有项目打分（0 到 10）。',
    valObra: '请为"工程/施工"部分的所有项目打分（0 到 10）。',
    valRecomenda: '请回答"您会向其他公司推荐 FC 吗？"。',
    valNotaGeral: "请至少回答部分项目，以便计算总评分。",
    valObraSel: "提交前请选择所评价的工程。",
    valLinkSemObra: "此链接未关联任何工程。请向 FC 索取新的评价链接。",
    core: {
      notaEmpresa: "FC 公司（声誉、透明度、企业沟通）",
      notaObra: "工程进度",
      notaPrazo: "按期完成情况",
      notaQualidade: "所交付服务的质量",
    },
    critPessoa: [
      { key: "postura", label: "态度与正面激励" },
      { key: "documentos", label: "定期文件的提交" },
      { key: "prontoAtendimento", label: "及时响应" },
      { key: "disponibilidade", label: "可用性" },
      { key: "conhecimentoTecnico", label: "专业技术知识" },
      { key: "educacao", label: "礼貌与谦和" },
    ],
    critEquipe: [
      { key: "tecnica", label: "服务的技术质量" },
      { key: "organizacao", label: "组织与整洁" },
      { key: "seguranca", label: "安全（个人防护装备/操作规程）" },
      { key: "pontualidade", label: "守时与出勤" },
      { key: "educacao", label: "礼貌与举止" },
      { key: "comunicacao", label: "沟通与服务" },
    ],
    critEscritorio: [
      { key: "atendimento", label: "行政支持" },
      { key: "documentacao", label: "文件与合同" },
      { key: "faturamento", label: "开票与财务" },
      { key: "agilidade", label: "响应速度" },
      { key: "comunicacao", label: "沟通与透明度" },
    ],
  },
};
