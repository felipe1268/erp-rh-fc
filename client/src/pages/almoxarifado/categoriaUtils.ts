export const CATEGORIA_KEYWORDS: Record<string, string[]> = {
  "Cimento e Argamassa": ["cimento", "argamassa", "rejunte", "grout", "nata", "cp-ii", "cp-iii", "cp-iv", "cp-v", "cpii", "cpiii", "cpiv", "cpv", "votoran", "votorantim"],
  "Areia e Brita": ["areia", "brita", "cascalho", "pedrisco", "pedra britada", "rachão", "rachao", "saibro", "agregado"],
  "Aço e Ferragens": ["aço", "aco", "vergalhão", "vergalhao", "ferro", "barra de ferro", "tela soldada", "arame", "prego", "parafuso", "arruela", "porca", "chumbador", "treliça", "trelica", "estrib", "ca-50", "ca-60", "ca50", "ca60"],
  "Madeira": ["madeira", "tabua", "tábua", "caibro", "sarrafo", "ripa", "viga de madeira", "compensado", "mdf", "osb", "pontalete", "barrote", "eucalipto"],
  "Tubos e Conexões": ["tubo", "conexão", "conexao", "joelho", "tê ", "te ", "luva", "curva", "cap ", "flange", "niple", "registro", "válvula", "valvula", "sifão", "sifao", "cotovelo", "redução", "reducao", "pvc", "cpvc", "pead", "ppr"],
  "Elétrica": ["fio", "cabo", "eletroduto", "disjuntor", "tomada", "interruptor", "luminária", "luminaria", "lampada", "lâmpada", "conduíte", "conduite", "quadro elétrico", "quadro eletrico", "dr ", "dijuntor", "led", "refletor", "spot", "canaleta", "perfilado"],
  "Hidráulica": ["caixa d'água", "caixa dagua", "caixa d água", "reservatório", "reservatorio", "bomba", "pressurizador", "aquecedor", "boiler", "hidrômetro", "hidrometro", "cavalete"],
  "Tintas e Acabamento": ["tinta", "verniz", "massa corrida", "selador", "primer", "textura", "grafiato", "lixa", "espátula", "espatula", "rolo", "pincel", "trincha", "solvente", "thinner", "aguarrás", "aguarras", "stain", "impermeabilizante", "manta"],
  "Cerâmica e Revestimento": ["cerâmica", "ceramica", "porcelanato", "azulejo", "piso", "pastilha", "pedra", "mármore", "marmore", "granito", "ardósia", "ardosia", "revestimento"],
  "Ferramentas": ["serra", "furadeira", "marreta", "martelo", "chave", "alicate", "trena", "nível", "nivel", "colher de pedreiro", "desempenadeira", "ponteira", "talhadeira", "pá ", "pa ", "enxada", "picareta", "serrote", "broca", "disco de corte", "lâmina", "lamina", "esquadro", "prumo"],
  "Equipamentos": ["betoneira", "andaime", "escora", "vibrador", "placa vibratória", "placa vibratoria", "compactador", "guincho", "grua", "munck", "container", "gerador", "elevador", "cremalheira"],
  "Escoramento": ["escora metálica", "escora metalica", "escoramento", "forcado", "forçado"],
  "EPI": ["epi", "capacete", "luva de segurança", "luva de seguranca", "óculos", "oculos", "protetor auricular", "bota", "cinto de segurança", "cinto de seguranca", "máscara", "mascara", "colete", "trava-queda", "trava queda", "talabarte", "cone", "fita zebrada"],
  "Impermeabilização": ["impermeabilizante", "manta asfáltica", "manta asfaltica", "veda", "silicone", "poliuretano", "denverdrill", "denvertec", "vedacit"],
  "Concreto": ["concreto", "concreto usinado", "graute"],
  "Outros": [],
};

export function inferirCategoria(nome: string, categoriasDisponiveis: string[]): string {
  if (!nome || nome.length < 3) return "";
  const lower = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let melhorMatch = "";
  let melhorPeso = 0;

  for (const [cat, keywords] of Object.entries(CATEGORIA_KEYWORDS)) {
    if (!categoriasDisponiveis.includes(cat)) continue;
    for (const kw of keywords) {
      const kwNorm = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes(kwNorm) && kwNorm.length > melhorPeso) {
        melhorMatch = cat;
        melhorPeso = kwNorm.length;
      }
    }
  }
  return melhorMatch;
}
