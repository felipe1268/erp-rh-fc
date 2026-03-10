/**
 * Remove acentos e caracteres especiais de uma string para busca.
 * Normaliza para NFD e remove diacríticos, convertendo para minúsculo.
 * Ex: "José" → "jose", "AÇÃO" → "acao", "Não" → "nao"
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Verifica se o texto contém o termo de busca, ignorando acentos.
 */
export function matchSearch(text: string | null | undefined, searchTerm: string): boolean {
  if (!text) return false;
  return removeAccents(text).includes(removeAccents(searchTerm));
}
