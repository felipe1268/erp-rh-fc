export type ParcelaFinanceiraInfo = {
  numero: number;
  total: number;
};

function parcelaValida(numero: number, total: number): boolean {
  return Number.isInteger(numero) && Number.isInteger(total) && total > 1 && numero >= 1 && numero <= total;
}

export function parseParcelaFinanceiraTexto(...textos: unknown[]): ParcelaFinanceiraInfo | null {
  for (const texto of textos) {
    if (typeof texto !== "string" || !texto.trim()) continue;
    const match = texto.match(/\bparcela\s*(\d+)\s*\/\s*(\d+)\b/i);
    if (!match) continue;
    const numero = Number(match[1]);
    const total = Number(match[2]);
    if (parcelaValida(numero, total)) return { numero, total };
  }
  return null;
}

export function resolveParcelaFinanceira(entry: {
  parcelaNumero?: unknown;
  parcelaTotal?: unknown;
  descricao?: unknown;
  origemDescricao?: unknown;
}): ParcelaFinanceiraInfo | null {
  const numero = Number(entry.parcelaNumero);
  const total = Number(entry.parcelaTotal);
  if (parcelaValida(numero, total)) return { numero, total };
  return parseParcelaFinanceiraTexto(entry.descricao, entry.origemDescricao);
}