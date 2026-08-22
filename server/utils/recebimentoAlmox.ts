export type ModoAlocacaoRecebimento = "existente" | "novo";

const STOP_WORDS = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "PARA", "COM", "SEM", "EM",
  "NO", "NA", "E", "UN", "UND", "UNIDADE", "PC", "PCS", "PECA",
  "PECAS", "KG", "UNID",
]);

export function normalizarNomeMaterial(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function tokensMaterial(value: unknown): string[] {
  return String(value ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function normalizarUnidadeMaterial(value: unknown): string {
  const unidade = normalizarNomeMaterial(value);
  if (["UN", "UND", "UNID", "UNIDADE", "PC", "PCA", "PECA"].includes(unidade)) return "UN";
  if (["KG", "KILO", "QUILO"].includes(unidade)) return "KG";
  if (["M", "MT", "METRO"].includes(unidade)) return "M";
  if (["M2", "MT2", "METROQUADRADO"].includes(unidade)) return "M2";
  if (["M3", "MT3", "METROCUBICO"].includes(unidade)) return "M3";
  return unidade;
}

/**
 * Comparação conservadora para impedir cadastros duplicados no recebimento.
 * Aceita nomes canonicamente iguais e pequenas variações de palavras, mas só
 * quando a unidade também é compatível.
 */
export function materiaisEquivalentes(
  nomeA: unknown,
  unidadeA: unknown,
  nomeB: unknown,
  unidadeB: unknown,
): boolean {
  if (normalizarUnidadeMaterial(unidadeA) !== normalizarUnidadeMaterial(unidadeB)) return false;

  const canonA = normalizarNomeMaterial(nomeA);
  const canonB = normalizarNomeMaterial(nomeB);
  if (!canonA || !canonB) return false;
  if (canonA === canonB) return true;

  const tokensA = tokensMaterial(nomeA);
  const tokensB = tokensMaterial(nomeB);
  if (tokensA.length < 2 || tokensB.length < 2) return false;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersecao = [...setA].filter((token) => setB.has(token));
  const coberturaA = intersecao.length / setA.size;
  const coberturaB = intersecao.length / setB.size;
  return coberturaA >= 0.8 && coberturaB >= 0.8;
}

export function erroEscolhaDestino(item: {
  recebido: boolean;
  modoAlocacao?: ModoAlocacaoRecebimento;
  itemId?: number;
  itemNome?: string;
  unidade?: string;
  categoria?: string;
}): string | null {
  if (!item.recebido) return null;
  if (!item.modoAlocacao) return `Defina onde receber "${item.itemNome || "o material"}".`;
  if (item.modoAlocacao === "existente" && !item.itemId) {
    return `Escolha o item de estoque que receberá "${item.itemNome || "o material"}".`;
  }
  if (item.modoAlocacao === "novo" && item.itemId) {
    return `A primeira entrada de "${item.itemNome || "o material"}" não pode apontar para um item existente.`;
  }
  if (item.modoAlocacao === "novo" && (!item.itemNome?.trim() || !item.unidade?.trim() || !item.categoria?.trim())) {
    return `Preencha nome, unidade e categoria do novo material.`;
  }
  return null;
}

export function mesmoDestinoEstoque(
  itemObraId: number | null | undefined,
  recebimentoObraId: number | null | undefined,
): boolean {
  const itemDestino = itemObraId == null ? null : Number(itemObraId);
  const recebimentoDestino = recebimentoObraId == null ? null : Number(recebimentoObraId);
  return itemDestino === recebimentoDestino;
}