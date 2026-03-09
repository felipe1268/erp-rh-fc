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
  categoria: "seguranca" | "saude" | "construcao" | "eletrica" | "geral" | "emergencia";
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
    validadeMeses: null,
    cargaHorariaInicial: "Variável",
    cargaHorariaReciclagem: "Variável",
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
    validadeMeses: null,
    cargaHorariaInicial: "40h",
    cargaHorariaReciclagem: "Variável",
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
    validadeMeses: 12,
    cargaHorariaInicial: "6h",
    cargaHorariaReciclagem: "6h",
    categoria: "construcao",
  },
  {
    norma: "NR-18",
    nome: "Segurança na Construção Civil - Periódico",
    descricao: "Treinamento periódico na indústria da construção",
    validadeMeses: 12,
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
    validadeMeses: 12,
    cargaHorariaInicial: "8h",
    cargaHorariaReciclagem: "4h",
    categoria: "construcao",
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

  // ===== GERAL =====
  {
    norma: "NR-01",
    nome: "Integração de Segurança",
    descricao: "Treinamento de integração e segurança do trabalho",
    validadeMeses: 12,
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
    cargaHorariaInicial: "Variável",
    cargaHorariaReciclagem: "Variável",
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
 * Categorias para agrupamento no select
 */
export const TRAINING_CATEGORIES: Record<string, string> = {
  seguranca: "Segurança do Trabalho",
  eletrica: "Elétrica",
  construcao: "Construção Civil",
  saude: "Saúde Ocupacional",
  emergencia: "Emergência e Incêndio",
  geral: "Geral",
};
