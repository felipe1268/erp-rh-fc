/**
 * Formatação de EXIBIÇÃO do número da Cotação.
 *
 * O número é GRAVADO no banco no formato canônico `COT-AAAA-NNNN` (ano-sequencial)
 * — a geração (`COT-${year}-${seq}`) e a busca/ordenação dependem disso, então
 * JAMAIS mudamos o valor persistido. Esta função só inverte a ORDEM na TELA para
 * `COT-NNNN-AAAA` (número da cotação primeiro, ano depois), preservando o
 * sequencial com zero-padding original.
 */
export function formatNumeroCotacaoDisplay(numero?: string | null): string {
  if (!numero) return "";
  const m = /^COT-(\d{4})-(\d+)$/.exec(numero.trim());
  if (!m) return numero;
  const [, ano, seq] = m;
  return `COT-${seq}-${ano}`;
}
