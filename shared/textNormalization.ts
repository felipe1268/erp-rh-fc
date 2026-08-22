const PREPOSICOES = new Set([
  "de", "da", "do", "das", "dos",
  "e", "em", "na", "no", "nas", "nos",
  "a", "ao", "à", "às", "aos",
  "com", "por", "para", "sem", "sob", "sobre",
]);

const ACENTUACAO: Record<string, string> = {
  "sanitaria": "sanitária", "sanitario": "sanitário", "sanitarios": "sanitários", "sanitarias": "sanitárias",
  "hidraulica": "hidráulica", "hidraulico": "hidráulico", "hidraulicos": "hidráulicos", "hidraulicas": "hidráulicas",
  "eletrica": "elétrica", "eletrico": "elétrico", "eletricos": "elétricos", "eletricas": "elétricas",
  "ceramica": "cerâmica", "ceramico": "cerâmico", "ceramicos": "cerâmicos", "ceramicas": "cerâmicas",
  "metalica": "metálica", "metalico": "metálico", "metalicos": "metálicos", "metalicas": "metálicas",
  "mecanica": "mecânica", "mecanico": "mecânico", "mecanicos": "mecânicos", "mecanicas": "mecânicas",
  "termica": "térmica", "termico": "térmico", "termicos": "térmicos", "termicas": "térmicas",
  "acustica": "acústica", "acustico": "acústico", "acusticos": "acústicos", "acusticas": "acústicas",
  "basica": "básica", "basico": "básico", "basicos": "básicos", "basicas": "básicas",
  "liquido": "líquido", "liquida": "líquida", "liquidos": "líquidos", "liquidas": "líquidas",
  "solido": "sólido", "solida": "sólida", "solidos": "sólidos", "solidas": "sólidas",
  "plastico": "plástico", "plastica": "plástica", "plasticos": "plásticos", "plasticas": "plásticas",
  "organico": "orgânico", "organica": "orgânica", "organicos": "orgânicos", "organicas": "orgânicas",
  "quimico": "químico", "quimica": "química", "quimicos": "químicos", "quimicas": "químicas",
  "calcareo": "calcáreo", "calcarea": "calcárea", "calcareos": "calcáreos",
  "tubulacao": "tubulação", "tubulacoes": "tubulações",
  "fundacao": "fundação", "fundacoes": "fundações",
  "instalacao": "instalação", "instalacoes": "instalações",
  "construcao": "construção", "construcoes": "construções",
  "protecao": "proteção", "protecoes": "proteções",
  "fixacao": "fixação", "fixacoes": "fixações",
  "vedacao": "vedação", "vedacoes": "vedações",
  "impermeabilizacao": "impermeabilização",
  "concretagem": "concretagem",
  "argamassa": "argamassa",
  "alvenaria": "alvenaria",
  "ferragem": "ferragem", "ferragens": "ferragens",
  "parafuso": "parafuso", "parafusos": "parafusos",
  "valvula": "válvula", "valvulas": "válvulas",
  "lampada": "lâmpada", "lampadas": "lâmpadas",
  "granito": "granito",
  "marmore": "mármore",
  "concreto": "concreto",
  "cimento": "cimento",
  "tijolo": "tijolo", "tijolos": "tijolos",
  "vergalhao": "vergalhão", "vergalhoes": "vergalhões",
  "tubo": "tubo", "tubos": "tubos",
  "conexao": "conexão", "conexoes": "conexões",
  "reducao": "redução", "reducoes": "reduções",
  "juncao": "junção", "juncoes": "junções",
  "pavimentacao": "pavimentação",
  "sinalizacao": "sinalização",
  "escavacao": "escavação",
  "demolicao": "demolição",
  "armacao": "armação", "armacoes": "armações",
  "isolacao": "isolação",
  "drenagem": "drenagem",
  "esquadria": "esquadria", "esquadrias": "esquadrias",
  "telha": "telha", "telhas": "telhas",
  "madeira": "madeira", "madeiras": "madeiras",
  "compensado": "compensado",
  "laminado": "laminado", "laminados": "laminados",
  "porcelanato": "porcelanato", "porcelanatos": "porcelanatos",
  "rejunte": "rejunte",
  "argila": "argila",
  "brita": "brita",
  "pedregulho": "pedregulho",
  "agregado": "agregado", "agregados": "agregados",
  "aditivo": "aditivo", "aditivos": "aditivos",
  "selante": "selante", "selantes": "selantes",
  "manta": "manta", "mantas": "mantas",
  "geotextil": "geotêxtil",
  "poliester": "poliéster",
  "galvanizado": "galvanizado", "galvanizada": "galvanizada",
  "inoxidavel": "inoxidável",
  "aco": "aço", "acos": "aços",
  "estacao": "estação", "estacoes": "estações",
  "peca": "peça", "pecas": "peças",
  "numero": "número", "numeros": "números",
  "area": "área", "areas": "áreas",
  "diametro": "diâmetro", "diametros": "diâmetros",
  "modulo": "módulo", "modulos": "módulos",
  "nivel": "nível", "niveis": "níveis",
  "veiculo": "veículo", "veiculos": "veículos",
  "equipamento": "equipamento", "equipamentos": "equipamentos",
  "ferramenta": "ferramenta", "ferramentas": "ferramentas",
  "maquina": "máquina", "maquinas": "máquinas",
  "guincho": "guincho",
  "betoneira": "betoneira", "betoneiras": "betoneiras",
  "andaime": "andaime", "andaimes": "andaimes",
  "capacete": "capacete", "capacetes": "capacetes",
  "oculos": "óculos",
  "protetor": "protetor", "protetores": "protetores",
  "luva": "luva", "luvas": "luvas",
  "bota": "bota", "botas": "botas",
  "uniforme": "uniforme", "uniformes": "uniformes",
  "colete": "colete", "coletes": "coletes",
};

export function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function corrigirAcentos(palavra: string): string {
  const semAcento = stripAccents(palavra.toLowerCase());
  const correto = ACENTUACAO[semAcento];
  if (!correto) return palavra;

  const isAllUpper = palavra === palavra.toUpperCase() && palavra.length > 1;
  const isFirstUpper = /^[A-ZÀ-ÖÙ-Ý]/.test(palavra) && !isAllUpper;

  if (isAllUpper) return correto.toUpperCase();
  if (isFirstUpper) return correto.charAt(0).toUpperCase() + correto.slice(1);
  return correto;
}

function capitalizarPalavra(core: string, isFirst: boolean): string {
  const acentuada = corrigirAcentos(core);
  const base = acentuada !== core ? acentuada.toLowerCase() : core.toLowerCase();

  if (!isFirst && PREPOSICOES.has(base)) return base;

  return base.charAt(0).toUpperCase() + (acentuada !== core ? acentuada : core).slice(1).toLowerCase();
}

function processarToken(token: string, idx: number): string {
  const match = token.match(/^([^a-zA-ZÀ-ÿ]*)(.*?)([^a-zA-ZÀ-ÿ]*)$/);
  if (!match) return token;

  const [, prefix, core, suffix] = match;
  if (!core) return token;

  if (core.includes("/")) {
    const parts = core.split("/");
    return prefix + parts.map((p, i) => p ? capitalizarPalavra(p, idx === 0 && i === 0) : p).join("/") + suffix;
  }

  return prefix + capitalizarPalavra(core, idx === 0) + suffix;
}

// Rev. 5099 — títulos de cotação sempre em MAIÚSCULO (independente de como o usuário digite),
// aproveitando a correção de acentos do normalizarTexto (ex.: "aco" → "AÇO").
export function tituloMaiusculo(texto: string): string {
  const norm = normalizarTexto(texto);
  return typeof norm === "string" ? norm.toUpperCase() : norm;
}

export function normalizarTexto(texto: string): string {
  if (!texto || typeof texto !== "string") return texto;
  const trimmed = texto.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/\s+/)
    .map((token, idx) => processarToken(token, idx))
    .join(" ");
}
