const PREPOSICOES = new Set([
  "de", "da", "do", "das", "dos",
  "e", "em", "na", "no", "nas", "nos",
  "a", "ao", "à", "às", "aos",
  "com", "por", "para", "sem", "sob", "sobre",
]);

export function normalizarTexto(texto: string): string {
  if (!texto || typeof texto !== "string") return texto;
  const trimmed = texto.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/\s+/)
    .map((palavra, idx) => {
      if (!palavra) return palavra;
      const lower = palavra.toLowerCase();
      if (idx > 0 && PREPOSICOES.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
