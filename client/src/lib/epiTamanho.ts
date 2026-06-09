// Correspondência número↔letra das CALÇAS — espelha a conversão letra→número da Rev. 2915
// (server/_core/index.ts). Como aquela conversão é destrutiva (a letra original não fica
// salva), aqui DERIVAMOS a letra a partir do número (e vice-versa) para exibir os DOIS
// formatos juntos na tela, ex.: "38 (M)". Colisão XGG/EXG→50: ao reverter usamos XGG.
const CALCA_LETRA_PARA_NUM: Record<string, string> = {
  PP: "34",
  P: "36",
  M: "38",
  G: "42",
  GG: "46",
  XG: "48",
  XGG: "50",
  EXG: "50",
  XXGG: "52",
  XXXGG: "54",
};

const CALCA_NUM_PARA_LETRA: Record<string, string> = {
  "34": "PP",
  "36": "P",
  "38": "M",
  "42": "G",
  "46": "GG",
  "48": "XG",
  "50": "XGG",
  "52": "XXGG",
  "54": "XXXGG",
};

/** É uma calça de uniforme? (categoria 'Uniforme' + nome contém "calça"/"calca"). */
export function isCalcaUniforme(nome?: string | null, categoria?: string | null): boolean {
  if (categoria !== "Uniforme") return false;
  const n = (nome || "").toLowerCase();
  return n.includes("calç") || n.includes("calca");
}

/** Devolve o "outro" formato de um tamanho de calça (letra↔número) ou null se não houver. */
export function calcaFormatoEquivalente(tamanho?: string | null): string | null {
  if (!tamanho) return null;
  const t = String(tamanho).trim();
  if (CALCA_NUM_PARA_LETRA[t]) return CALCA_NUM_PARA_LETRA[t];
  const up = t.toUpperCase();
  if (CALCA_LETRA_PARA_NUM[up]) return CALCA_LETRA_PARA_NUM[up];
  return null;
}

/** Rótulo de tamanho de calça mostrando os dois formatos (ex.: "38 (M)"); senão o cru. */
export function labelTamanhoCalca(tamanho?: string | null): string {
  const t = tamanho ? String(tamanho).trim() : "";
  if (!t) return "—";
  const eq = calcaFormatoEquivalente(t);
  return eq ? `${t} (${eq})` : t;
}

/** Rótulo de tamanho de um EPI: aplica a dupla exibição SÓ em calças; senão devolve o cru. */
export function labelTamanhoEpi(epi: { nome?: string | null; categoria?: string | null; tamanho?: string | null }): string {
  const t = epi.tamanho ? String(epi.tamanho).trim() : "";
  if (!t) return "—";
  if (isCalcaUniforme(epi.nome, epi.categoria)) return labelTamanhoCalca(t);
  return t;
}
