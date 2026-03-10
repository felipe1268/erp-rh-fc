/**
 * Utilitário de formatação de moeda brasileira (R$)
 * Formata automaticamente conforme o usuário digita: 1.234,56
 */

/**
 * Formata um valor numérico (centavos) para o formato brasileiro
 * Ex: 1055000 → "10.550,00"
 */
export function formatCurrency(cents: number): string {
  if (cents === 0) return "";
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const reaisStr = reais.toLocaleString("pt-BR");
  const centavosStr = centavos.toString().padStart(2, "0");
  return `${reaisStr},${centavosStr}`;
}

/**
 * Converte string formatada "1.234,56" para número float 1234.56
 */
export function parseCurrencyToFloat(formatted: string): number {
  if (!formatted) return 0;
  // Remove tudo exceto dígitos
  const digits = formatted.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

/**
 * Converte número float 1234.56 para string formatada "1.234,56"
 */
export function floatToCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return "";
  const cents = Math.round(num * 100);
  return formatCurrency(cents);
}

/**
 * Handler para input de moeda - recebe o valor digitado e retorna formatado
 * Funciona como máscara: o usuário digita apenas números e a formatação é automática
 */
export function handleCurrencyInput(rawValue: string): string {
  // Remove tudo exceto dígitos
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  if (cents === 0) return "";
  return formatCurrency(cents);
}
