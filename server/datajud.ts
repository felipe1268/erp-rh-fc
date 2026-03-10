/**
 * DataJud API Client - Integração com a API Pública do CNJ
 * https://datajud-wiki.cnj.jus.br/api-publica/
 */

const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";
const DATAJUD_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

// ============================================================
// TYPES
// ============================================================

export interface DatajudMovimento {
  codigo: number;
  nome: string;
  dataHora: string;
  complementosTabelados?: Array<{
    codigo: number;
    valor: number;
    nome: string;
    descricao: string;
  }>;
  orgaoJulgador?: {
    codigo: string;
    nome: string;
  };
}

export interface DatajudProcesso {
  id: string;
  numeroProcesso: string;
  classe: { codigo: number; nome: string };
  sistema: { codigo: number; nome: string };
  formato: { codigo: number; nome: string };
  tribunal: string;
  grau: string;
  dataAjuizamento: string;
  dataHoraUltimaAtualizacao: string;
  nivelSigilo: number;
  assuntos: Array<{ codigo: number; nome: string }>;
  orgaoJulgador: {
    codigo: number;
    nome: string;
    codigoMunicipioIBGE?: number;
  };
  movimentos: DatajudMovimento[];
}

export interface DatajudSearchResult {
  took: number;
  timed_out: boolean;
  hits: {
    total: { value: number; relation: string };
    hits: Array<{
      _index: string;
      _id: string;
      _score: number;
      _source: DatajudProcesso;
    }>;
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Extrai o número do TRT a partir do número do processo CNJ
 * Formato: NNNNNNN-DD.AAAA.J.TT.OOOO
 * J=5 = Justiça do Trabalho, TT = região do TRT
 */
export function extractTRTFromProcessNumber(numeroProcesso: string): number | null {
  // Remove formatação
  const clean = numeroProcesso.replace(/[.\-]/g, "");
  // Formato: NNNNNNNDDAAAAJTTOOOO (20 dígitos)
  if (clean.length < 18) return null;
  
  // Tenta extrair do formato padrão CNJ
  const match = numeroProcesso.match(/\d{7}-?\d{2}\.?\d{4}\.?(\d)\.?(\d{2})\.?\d{4}/);
  if (match) {
    const justica = parseInt(match[1]);
    const regiao = parseInt(match[2]);
    if (justica === 5) return regiao; // Justiça do Trabalho
  }
  
  // Fallback: tenta extrair da posição fixa no número limpo
  if (clean.length >= 18) {
    const justica = parseInt(clean[13]);
    const regiao = parseInt(clean.substring(14, 16));
    if (justica === 5 && regiao >= 1 && regiao <= 24) return regiao;
  }
  
  return null;
}

/**
 * Determina o endpoint do DataJud baseado no número do processo
 */
export function getDatajudEndpoint(numeroProcesso: string): string | null {
  const trt = extractTRTFromProcessNumber(numeroProcesso);
  if (trt) return `api_publica_trt${trt}/_search`;
  
  // Tenta outros tribunais baseado no J
  const clean = numeroProcesso.replace(/[.\-]/g, "");
  if (clean.length >= 14) {
    const justica = parseInt(clean[13]);
    const regiao = parseInt(clean.substring(14, 16));
    switch (justica) {
      case 4: return `api_publica_trf${regiao}/_search`; // Justiça Federal
      case 8: return `api_publica_tj${getEstadoSigla(regiao)}/_search`; // Justiça Estadual
    }
  }
  
  return null;
}

function getEstadoSigla(codigo: number): string {
  const map: Record<number, string> = {
    1: "ac", 2: "al", 3: "ap", 4: "am", 5: "ba", 6: "ce", 7: "df",
    8: "es", 9: "go", 10: "ma", 11: "mt", 12: "ms", 13: "mg",
    14: "pa", 15: "pb", 16: "pr", 17: "pe", 18: "pi", 19: "rj",
    20: "rn", 21: "rs", 22: "ro", 23: "rr", 24: "sc", 25: "se",
    26: "sp", 27: "to",
  };
  return map[codigo] || "sp";
}

/**
 * Remove formatação do número do processo
 */
export function cleanProcessNumber(numero: string): string {
  return numero.replace(/[.\-\s]/g, "");
}

/**
 * Formata dataAjuizamento do DataJud (pode vir como "20231213173542" ou ISO)
 */
export function parseDatajudDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Formato compacto: 20231213173542
  if (/^\d{14}$/.test(dateStr)) {
    const y = dateStr.substring(0, 4);
    const m = dateStr.substring(4, 6);
    const d = dateStr.substring(6, 8);
    return `${y}-${m}-${d}`;
  }
  
  // Formato ISO
  if (dateStr.includes("T") || dateStr.includes("-")) {
    return dateStr.substring(0, 10);
  }
  
  return null;
}

// ============================================================
// API CALLS
// ============================================================

/**
 * Busca processo por número no DataJud
 */
export async function buscarPorNumero(
  numeroProcesso: string
): Promise<DatajudProcesso | null> {
  const endpoint = getDatajudEndpoint(numeroProcesso);
  if (!endpoint) return null;

  const cleanNum = cleanProcessNumber(numeroProcesso);
  
  try {
    const response = await fetch(`${DATAJUD_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `APIKey ${DATAJUD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          match: {
            numeroProcesso: cleanNum,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(`DataJud API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: DatajudSearchResult = await response.json();
    
    if (data.hits.hits.length === 0) return null;
    
    // Retorna o hit com maior score (mais relevante)
    const hit = data.hits.hits[0];
    return {
      ...hit._source,
      id: hit._id,
    };
  } catch (error) {
    console.error("DataJud API error:", error);
    return null;
  }
}

/**
 * Busca processos por nome do reclamante em um TRT específico
 * Nota: A API não tem campo "partes", então buscamos por classe trabalhista
 * e filtramos localmente. Isso é uma limitação da API pública.
 * 
 * Alternativa: buscar por órgão julgador da região e filtrar por período
 */
export async function buscarPorNomeNoTRT(
  nome: string,
  trtRegiao: number,
  size: number = 100
): Promise<DatajudProcesso[]> {
  // A API pública do DataJud não permite busca por nome de parte
  // (dados de partes são protegidos por sigilo)
  // Retornamos vazio - a busca por nome será feita apenas nos processos já cadastrados
  return [];
}

// ============================================================
// PARSING & ANALYSIS
// ============================================================

/**
 * Infere a situação do processo a partir das movimentações
 */
export function inferirSituacao(movimentos: DatajudMovimento[]): {
  status: string;
  fase: string;
  ultimaMovimentacao: DatajudMovimento | null;
} {
  if (!movimentos || movimentos.length === 0) {
    return { status: "em_andamento", fase: "conhecimento", ultimaMovimentacao: null };
  }

  // Ordena por data (mais recente primeiro)
  const sorted = [...movimentos].sort(
    (a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()
  );
  
  const ultima = sorted[0];
  const codigos = new Set(sorted.slice(0, 20).map(m => m.codigo));
  const nomes = sorted.slice(0, 20).map(m => m.nome.toLowerCase());

  // Verifica encerramento/arquivamento
  if (nomes.some(n => n.includes("arquivamento") || n.includes("baixa") || n.includes("trânsito em julgado"))) {
    return { status: "arquivado", fase: "encerrado", ultimaMovimentacao: ultima };
  }
  
  if (nomes.some(n => n.includes("encerrado") || n.includes("extinção") || n.includes("extinto"))) {
    return { status: "encerrado", fase: "encerrado", ultimaMovimentacao: ultima };
  }

  // Verifica acordo/conciliação
  if (nomes.some(n => n.includes("acordo") || n.includes("conciliação") || n.includes("homologação de acordo"))) {
    return { status: "acordo", fase: "encerrado", ultimaMovimentacao: ultima };
  }

  // Verifica sentença
  if (nomes.some(n => n.includes("procedência") || n.includes("improcedência") || n.includes("sentença"))) {
    // Verifica se tem recurso depois
    if (nomes.some(n => n.includes("recurso") || n.includes("agravo"))) {
      return { status: "recurso", fase: "recursal", ultimaMovimentacao: ultima };
    }
    return { status: "sentenca", fase: "decisoria", ultimaMovimentacao: ultima };
  }

  // Verifica recurso
  if (nomes.some(n => n.includes("recurso") || n.includes("agravo") || n.includes("embargos"))) {
    return { status: "recurso", fase: "recursal", ultimaMovimentacao: ultima };
  }

  // Verifica execução
  if (nomes.some(n => n.includes("execução") || n.includes("cumprimento de sentença") || n.includes("penhora"))) {
    return { status: "execucao", fase: "execucao", ultimaMovimentacao: ultima };
  }

  // Verifica perícia
  if (nomes.some(n => n.includes("perícia") || n.includes("perito"))) {
    return { status: "aguardando_pericia", fase: "instrucao", ultimaMovimentacao: ultima };
  }

  // Verifica audiência
  if (nomes.some(n => n.includes("audiência") || n.includes("designa"))) {
    return { status: "aguardando_audiencia", fase: "instrucao", ultimaMovimentacao: ultima };
  }

  return { status: "em_andamento", fase: "conhecimento", ultimaMovimentacao: ultima };
}

/**
 * Calcula o risco baseado no valor da causa e assuntos
 */
export function calcularRisco(
  valorCausa: string | null | undefined,
  assuntos: Array<{ codigo: number; nome: string }> | null | undefined,
  movimentos: DatajudMovimento[] | null | undefined
): "baixo" | "medio" | "alto" | "critico" {
  let score = 0;
  
  // Fator 1: Valor da causa
  if (valorCausa) {
    const valor = parseFloat(valorCausa.replace(/[^\d.,]/g, "").replace(",", "."));
    if (valor > 500000) score += 4;
    else if (valor > 200000) score += 3;
    else if (valor > 50000) score += 2;
    else if (valor > 10000) score += 1;
  }

  // Fator 2: Assuntos de alto risco
  const assuntosAltoRisco = [
    "dano moral", "danos morais", "assédio", "acidente", "doença ocupacional",
    "insalubridade", "periculosidade", "rescisão indireta",
  ];
  if (assuntos) {
    for (const a of assuntos) {
      const nome = a.nome.toLowerCase();
      if (assuntosAltoRisco.some(r => nome.includes(r))) {
        score += 2;
      }
    }
  }

  // Fator 3: Movimentações recentes indicam processo ativo
  if (movimentos && movimentos.length > 0) {
    const sorted = [...movimentos].sort(
      (a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()
    );
    const ultimaNomes = sorted.slice(0, 5).map(m => m.nome.toLowerCase());
    
    // Sentença desfavorável
    if (ultimaNomes.some(n => n.includes("procedência") && !n.includes("improcedência"))) {
      score += 2;
    }
    // Execução
    if (ultimaNomes.some(n => n.includes("execução") || n.includes("penhora"))) {
      score += 3;
    }
  }

  // Classificação
  if (score >= 6) return "critico";
  if (score >= 4) return "alto";
  if (score >= 2) return "medio";
  return "baixo";
}

/**
 * Detecta novas movimentações comparando com as já conhecidas
 */
export function detectarNovasMovimentacoes(
  movimentosAntigos: DatajudMovimento[] | null | undefined,
  movimentosNovos: DatajudMovimento[]
): DatajudMovimento[] {
  if (!movimentosAntigos || movimentosAntigos.length === 0) {
    return movimentosNovos;
  }

  const antigosSet = new Set(
    movimentosAntigos.map(m => `${m.codigo}_${m.dataHora}`)
  );

  return movimentosNovos.filter(
    m => !antigosSet.has(`${m.codigo}_${m.dataHora}`)
  );
}

/**
 * Extrai as últimas N movimentações ordenadas por data
 */
export function getUltimasMovimentacoes(
  movimentos: DatajudMovimento[],
  limit: number = 50
): DatajudMovimento[] {
  return [...movimentos]
    .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
    .slice(0, limit);
}

/**
 * Formata número do processo para exibição
 */
export function formatProcessNumber(numero: string): string {
  const clean = numero.replace(/[.\-\s]/g, "");
  if (clean.length !== 20) return numero;
  return `${clean.substring(0,7)}-${clean.substring(7,9)}.${clean.substring(9,13)}.${clean.substring(13,14)}.${clean.substring(14,16)}.${clean.substring(16,20)}`;
}
