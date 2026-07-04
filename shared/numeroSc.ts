/**
 * Formatação de EXIBIÇÃO do número da SC (Solicitação de Compra).
 *
 * O número é GRAVADO no banco no formato canônico `SC-AAAA-NNNN` (ano-sequencial)
 * — geração atômica (counter table) + índice único + regex de seed dependem disso,
 * então JAMAIS mudamos o valor persistido. Esta função só inverte a ORDEM na TELA
 * para `SC-NNNN-AAAA` (número da solicitação primeiro, ano depois), preservando o
 * sequencial com zero-padding original.
 */
export function formatNumeroScDisplay(numero?: string | null): string {
  if (!numero) return "";
  const m = /^SC-(\d{4})-(\d+)$/.exec(numero.trim());
  if (!m) return numero;
  const [, ano, seq] = m;
  return `SC-${seq}-${ano}`;
}

/**
 * Rev. 4016 — Item 19 (docx): variante CURTA para listagens compactas,
 * omitindo o ano (`SC-NNNN`). Uso restrito a telas de lista onde o ano
 * já não agrega (a maioria das SCs visíveis é do ano corrente); telas
 * que precisam desambiguar entre anos continuam usando formatNumeroScDisplay.
 */
export function formatNumeroScShort(numero?: string | null): string {
  if (!numero) return "";
  const m = /^SC-(\d{4})-(\d+)$/.exec(numero.trim());
  if (!m) return numero;
  const [, , seq] = m;
  return `SC-${seq}`;
}
