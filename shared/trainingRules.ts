/**
 * Regras de validade dos treinamentos por Norma Regulamentadora
 * 
 * Fonte: Normas Regulamentadoras do MTE (gov.br/trabalho-e-emprego)
 * Última atualização: Março/2026
 * 
 * validadeMeses: prazo de reciclagem em meses (null = não especificado pela norma)
 * cargaHorariaInicial: carga horária mínima do treinamento inicial
 * cargaHorariaReciclagem: carga horária mínima da reciclagem
 */

export interface TrainingRule {
  /** Código da norma (ex: "NR-35") */
  norma: string;
  /** Nome completo do treinamento */
  nome: string;
  /** Descrição curta da norma */
  descricao: string;
  /** Prazo de validade em meses (null = não especificado) */
  validadeMeses: number | null;
  /** Carga horária inicial sugerida */
  cargaHorariaInicial: string;
  /** Carga horária de reciclagem */
  cargaHorariaReciclagem: string;
  /** Categoria para agrupamento */
  categoria: "seguranca" | "saude" | "construcao" | "eletrica" | "geral" | "emergencia" | "industria" | "rural";
}

export const TRAINING_RULES: TrainingRule[] = [
  // ===== SEGURANÇA =====
  {
    norma: "NR-35",
    nome: "Trabalho em Altura",
    descricao: "Requisitos mínimos para segurança no trabalho em altura",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-33",
    nome: "Espaço Confinado - Trabalhador",
    descricao: "Segurança e saúde nos trabalhos em espaços confinados",
    validadeMeses: 12,
    cargaHorariaInicial: "16h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-33",
    nome: "Espaço Confinado - Vigia",
    descricao: "Vigia para trabalhos em espaços confinados",
    validadeMeses: 12,
    cargaHorariaInicial: "16h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-33",
    nome: "Espaço Confinado - Supervisor",
    descricao: "Supervisor de entrada em espaços confinados",
    validadeMeses: 12,
    cargaHorariaInicial: "40h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-12",
    nome: "Máquinas e Equipamentos",
    descricao: "Segurança no trabalho em máquinas e equipamentos",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-12",
    nome: "Máquinas Injetoras",
    descricao: "Capacitação para operação segura de máquinas injetoras (Anexo IX)",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-12",
    nome: "Motosserra",
    descricao: "Treinamento para utilização segura de motosserra e similares",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-11",
    nome: "Operador de Empilhadeira",
    descricao: "Operação segura de empilhadeiras e equipamentos de transporte",
    validadeMeses: 36,
    cargaHorariaInicial: "12h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-11",
    nome: "Operador de Ponte Rolante",
    descricao: "Operação segura de pontes rolantes e guindastes",
    validadeMeses: 36,
    cargaHorariaInicial: "16h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-11",
    nome: "Operador de Guindaste / Munck",
    descricao: "Operação segura de guindastes, muncks e equipamentos de içamento",
    validadeMeses: 24,
    cargaHorariaInicial: "16h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-11",
    nome: "Movimentação de Cargas (Rigger/Sinaleiro)",
    descricao: "Movimentação, amarração e sinalização de cargas",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-20",
    nome: "Inflamáveis e Combustíveis - Classe I",
    descricao: "Segurança com inflamáveis - Instalação Classe I",
    validadeMeses: 36,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-20",
    nome: "Inflamáveis e Combustíveis - Classe II",
    descricao: "Segurança com inflamáveis - Instalação Classe II",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-20",
    nome: "Inflamáveis e Combustíveis - Classe III",
    descricao: "Segurança com inflamáveis - Instalação Classe III",
    validadeMeses: 12,
    cargaHorariaInicial: "16h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-13",
    nome: "Caldeiras e Vasos de Pressão",
    descricao: "Operação segura de caldeiras, vasos de pressão e tubulações",
    validadeMeses: 24,
    cargaHorariaInicial: "40h",
    cargaHorariaReciclagem: "8h",
    categoria: "seguranca",
  },
  {
    norma: "NR-19",
    nome: "Explosivos",
    descricao: "Segurança e saúde no manuseio de explosivos",
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "seguranca",
  },
  {
    norma: "NR-16",
    nome: "Atividades e Operações Perigosas",
    descricao: "Conscientização sobre periculosidade e medidas de proteção",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "seguranca",
  },
  {
    norma: "NR-15",
    nome: "Atividades e Operações Insalubres",
    descricao: "Conscientização sobre insalubridade e medidas de proteção",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "seguranca",
  },
  {
    norma: "NR-26",
    nome: "Sinalização de Segurança",
    descricao: "Sinalização de segurança e classificação de produtos químicos (GHS/SGA)",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "seguranca",
  },

  // ===== ELÉTRICA =====
  {
    norma: "NR-10",
    nome: "Segurança em Eletricidade - Básico",
    descricao: "Segurança em instalações e serviços em eletricidade",
    validadeMeses: 24,
    cargaHorariaInicial: "40h",
    cargaHorariaReciclagem: "8h",
    categoria: "eletrica",
  },
  {
    norma: "NR-10",
    nome: "Segurança em Eletricidade - SEP",
    descricao: "Sistema Elétrico de Potência (complementar ao básico)",
    validadeMeses: 24,
    cargaHorariaInicial: "40h",
    cargaHorariaReciclagem: "8h",
    categoria: "eletrica",
  },

  // ===== CONSTRUÇÃO CIVIL =====
  {
    norma: "NR-18",
    nome: "Segurança na Construção Civil - Admissional",
    descricao: "Treinamento admissional na indústria da construção",
    validadeMeses: 24,
    cargaHorariaInicial: "6h",
    cargaHorariaReciclagem: "6h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Segurança na Construção Civil - Periódico",
    descricao: "Treinamento periódico na indústria da construção",
    validadeMeses: 24,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Plataforma Elevatória (PTA)",
    descricao: "Operação de plataformas de trabalho aéreo",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "8h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Montagem/Desmontagem de Andaimes",
    descricao: "Montagem e desmontagem de andaimes na construção",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Operador de Betoneira",
    descricao: "Operação segura de betoneira na construção civil",
    validadeMeses: 24,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Carpinteiro / Armador de Ferragem",
    descricao: "Segurança para carpinteiros e armadores na construção",
    validadeMeses: 24,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Demolição",
    descricao: "Segurança em atividades de demolição",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Escavações e Fundações",
    descricao: "Segurança em escavações, fundações e desmonte de rochas",
    validadeMeses: 24,
    cargaHorariaInicial: "6h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
  },

  // ===== INDÚSTRIA NAVAL / ESPECÍFICA =====
  {
    norma: "NR-34",
    nome: "Condições de Trabalho na Indústria Naval - Admissional",
    descricao: "Treinamento admissional na indústria da construção e reparação naval",
    validadeMeses: 24,
    cargaHorariaInicial: "6h",
    cargaHorariaReciclagem: "4h",
    categoria: "industria",
  },
  {
    norma: "NR-34",
    nome: "Trabalho a Quente (Soldagem/Corte)",
    descricao: "Segurança em trabalhos a quente na indústria naval",
    validadeMeses: 24,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "4h",
    categoria: "industria",
  },
  {
    norma: "NR-36",
    nome: "Segurança em Frigoríficos / Abate",
    descricao: "Segurança e saúde no trabalho em empresas de abate e processamento de carnes",
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "industria",
  },
  {
    norma: "NR-22",
    nome: "Segurança na Mineração",
    descricao: "Segurança e saúde ocupacional na mineração",
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "industria",
  },
  {
    norma: "NR-14",
    nome: "Fornos",
    descricao: "Segurança no trabalho com fornos industriais",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "industria",
  },

  // ===== RURAL =====
  {
    norma: "NR-31",
    nome: "Segurança no Trabalho Rural",
    descricao: "Segurança e saúde no trabalho na agricultura, pecuária, silvicultura e exploração florestal",
    validadeMeses: 24,
    cargaHorariaInicial: "20h",
    cargaHorariaReciclagem: "8h",
    categoria: "rural",
  },
  {
    norma: "NR-31",
    nome: "CIPATR - Comissão Interna Rural",
    descricao: "Formação de membros da CIPATR no meio rural",
    validadeMeses: 24,
    cargaHorariaInicial: "20h",
    cargaHorariaReciclagem: "8h",
    categoria: "rural",
  },
  {
    norma: "NR-31",
    nome: "Aplicação de Agrotóxicos",
    descricao: "Manuseio e aplicação segura de agrotóxicos e afins",
    validadeMeses: 12,
    cargaHorariaInicial: "20h",
    cargaHorariaReciclagem: "8h",
    categoria: "rural",
  },

  // ===== SAÚDE =====
  {
    norma: "NR-05",
    nome: "CIPA - Comissão Interna de Prevenção de Acidentes",
    descricao: "Formação de membros da CIPA",
    validadeMeses: 24,
    cargaHorariaInicial: "20h",
    cargaHorariaReciclagem: "8h",
    categoria: "saude",
  },
  {
    norma: "NR-07",
    nome: "Primeiros Socorros",
    descricao: "Noções de primeiros socorros (PCMSO)",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "saude",
  },
  {
    norma: "NR-32",
    nome: "Segurança em Serviços de Saúde",
    descricao: "Segurança e saúde no trabalho em estabelecimentos de saúde",
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "saude",
  },
  {
    norma: "NR-32",
    nome: "Radiações Ionizantes em Serviços de Saúde",
    descricao: "Proteção radiológica em serviços de saúde",
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "saude",
  },

  // ===== EMERGÊNCIA =====
  {
    norma: "NR-23",
    nome: "Brigada de Incêndio",
    descricao: "Prevenção e combate a incêndios",
    validadeMeses: 12,
    cargaHorariaInicial: "16h",
    cargaHorariaReciclagem: "8h",
    categoria: "emergencia",
  },
  {
    norma: "NR-23",
    nome: "Uso de Extintores",
    descricao: "Treinamento prático no uso de extintores de incêndio",
    validadeMeses: 12,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "emergencia",
  },
  {
    norma: "NR-23",
    nome: "Plano de Emergência e Evacuação",
    descricao: "Treinamento de evacuação e procedimentos de emergência",
    validadeMeses: 12,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "emergencia",
  },

  // ===== GERAL =====
  {
    norma: "NR-01",
    nome: "Ordem de Serviço",
    descricao: "Treinamento sobre ordens de serviço e disposições gerais de segurança",
    validadeMeses: 12,
    cargaHorariaInicial: "2h",
    cargaHorariaReciclagem: "1h",
    categoria: "geral",
  },
  {
    norma: "NR-18",
    nome: "Integração de Segurança",
    descricao: "Treinamento de integração e segurança do trabalho na construção civil",
    validadeMeses: 24,
    cargaHorariaInicial: "6h",
    cargaHorariaReciclagem: "4h",
    categoria: "geral",
  },
  {
    norma: "NR-06",
    nome: "Uso de EPI",
    descricao: "Treinamento sobre uso correto de EPIs",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "geral",
  },
  {
    norma: "NR-01",
    nome: "Direção Defensiva / Segurança Veicular",
    descricao: "Direção defensiva e segurança no trânsito",
    validadeMeses: 24,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "geral",
  },
  {
    norma: "NR-09",
    nome: "PGR - Programa de Gerenciamento de Riscos",
    descricao: "Treinamento sobre riscos ocupacionais",
    validadeMeses: 24,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "4h",
    categoria: "geral",
  },
  {
    norma: "NR-17",
    nome: "Ergonomia",
    descricao: "Treinamento de ergonomia no trabalho",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "geral",
  },
  {
    norma: "NR-24",
    nome: "Condições Sanitárias e de Conforto",
    descricao: "Condições sanitárias e de conforto nos locais de trabalho",
    validadeMeses: null,
    cargaHorariaInicial: "2h",
    cargaHorariaReciclagem: "2h",
    categoria: "geral",
  },
  {
    norma: "NR-25",
    nome: "Resíduos Industriais",
    descricao: "Manuseio e descarte seguro de resíduos industriais",
    validadeMeses: null,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "geral",
  },
  {
    norma: "",
    nome: "Meio Ambiente e Sustentabilidade",
    descricao: "Conscientização ambiental e sustentabilidade",
    validadeMeses: 12,
    cargaHorariaInicial: "4h",
    cargaHorariaReciclagem: "2h",
    categoria: "geral",
  },
  {
    norma: "",
    nome: "SIPAT",
    descricao: "Semana Interna de Prevenção de Acidentes do Trabalho",
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "8h",
    categoria: "geral",
  },
  {
    norma: "",
    nome: "DDS - Diálogo Diário de Segurança",
    descricao: "Diálogo diário de segurança do trabalho",
    validadeMeses: null,
    cargaHorariaInicial: "15min",
    cargaHorariaReciclagem: "15min",
    categoria: "geral",
  },
];

/**
 * Busca a regra de treinamento pelo nome (match parcial)
 */
export function findTrainingRule(nome: string): TrainingRule | undefined {
  if (!nome) return undefined;
  const lower = nome.toLowerCase().trim();
  
  // Match exato pelo nome
  const exact = TRAINING_RULES.find(r => r.nome.toLowerCase() === lower);
  if (exact) return exact;
  
  // Match parcial
  return TRAINING_RULES.find(r => 
    lower.includes(r.nome.toLowerCase()) || r.nome.toLowerCase().includes(lower)
  );
}

/**
 * Busca regras por norma (ex: "NR-35")
 */
export function findRulesByNorma(norma: string): TrainingRule[] {
  if (!norma) return [];
  const normalized = norma.toUpperCase().replace(/\s+/g, "").replace("NR", "NR-").replace("NR--", "NR-");
  return TRAINING_RULES.filter(r => r.norma === normalized);
}

/**
 * Calcula a data de validade com base na data de realização e meses de validade
 */
export function calcularDataValidade(dataRealizacao: string, validadeMeses: number): string {
  const date = new Date(dataRealizacao + "T00:00:00");
  date.setMonth(date.getMonth() + validadeMeses);
  return date.toISOString().split("T")[0];
}

/**
 * Descrição curta de cada NR — usada para listas/labels onde o usuário
 * só vê o código (ex: "NR-12") e quer entender do que se trata.
 * Fonte: NRs do MTE (gov.br/trabalho-e-emprego).
 */
export const NR_DESCRICAO_CURTA: Record<string, string> = {
  "NR-01": "Disposições Gerais e Gerenciamento de Riscos",
  "NR-02": "Inspeção Prévia",
  "NR-03": "Embargo e Interdição",
  "NR-04": "SESMT",
  "NR-05": "CIPA",
  "NR-06": "Equipamento de Proteção Individual (EPI)",
  "NR-07": "PCMSO — Saúde Ocupacional",
  "NR-08": "Edificações",
  "NR-09": "PGR — Avaliação de Riscos Ocupacionais",
  "NR-10": "Segurança em Instalações Elétricas",
  "NR-11": "Transporte, Movimentação e Armazenagem",
  "NR-12": "Segurança em Máquinas e Equipamentos",
  "NR-13": "Caldeiras, Vasos de Pressão e Tubulações",
  "NR-14": "Fornos",
  "NR-15": "Atividades e Operações Insalubres",
  "NR-16": "Atividades e Operações Perigosas",
  "NR-17": "Ergonomia",
  "NR-18": "Segurança na Construção Civil",
  "NR-19": "Explosivos",
  "NR-20": "Inflamáveis e Combustíveis",
  "NR-21": "Trabalho a Céu Aberto",
  "NR-22": "Segurança na Mineração",
  "NR-23": "Proteção Contra Incêndios",
  "NR-24": "Condições Sanitárias e de Conforto",
  "NR-25": "Resíduos Industriais",
  "NR-26": "Sinalização de Segurança",
  "NR-27": "Registro Profissional do TST",
  "NR-28": "Fiscalização e Penalidades",
  "NR-29": "Trabalho Portuário",
  "NR-30": "Trabalho Aquaviário",
  "NR-31": "Segurança no Trabalho Rural",
  "NR-32": "Segurança em Serviços de Saúde",
  "NR-33": "Espaços Confinados",
  "NR-34": "Indústria Naval",
  "NR-35": "Trabalho em Altura",
  "NR-36": "Frigoríficos / Abate",
  "NR-37": "Plataformas de Petróleo",
  "NR-38": "Limpeza Urbana",
};

/**
 * Normaliza variações ("NR12", "nr-12", "NR 12") para o formato "NR-12"
 * e devolve a descrição curta. Retorna string vazia se não encontrar.
 */
export function getNrDescricao(norma?: string | null): string {
  if (!norma) return "";
  const m = String(norma).toUpperCase().match(/NR\s*-?\s*0?(\d{1,2})/);
  if (!m) return "";
  const codigo = `NR-${m[1].padStart(2, "0")}`;
  return NR_DESCRICAO_CURTA[codigo] || "";
}

/**
 * Categorias para agrupamento no select
 */
export const TRAINING_CATEGORIES: Record<string, string> = {
  seguranca: "Segurança do Trabalho",
  eletrica: "Elétrica",
  construcao: "Construção Civil",
  industria: "Indústria / Mineração / Naval",
  rural: "Trabalho Rural",
  saude: "Saúde Ocupacional",
  emergencia: "Emergência e Incêndio",
  geral: "Geral",
};
