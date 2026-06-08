/**
 * Formatação de EXIBIÇÃO do número da OC/OS (Ordem de Compra / Ordem de Serviço).
 *
 * O número é GRAVADO no banco no formato canônico `OC-AAAA-NNN` / `OS-AAAA-NNN`
 * (prefixo-ano-sequencial) — a geração (`OC-${year}-${seq}`), a busca e a
 * ordenação dependem disso, então JAMAIS mudamos o valor persistido. Esta função
 * só inverte a ORDEM na TELA para `OC-NNN-AAAA` / `OS-NNN-AAAA` (número primeiro,
 * ano depois), preservando o prefixo e o sequencial com zero-padding original.
 *
 * Robusto a formatos legados: se não casar o padrão canônico, devolve o valor
 * intacto (inclui rótulos como "RASCUNHO-..." que não devem ser invertidos).
 */
export function formatNumeroOcDisplay(numero?: string | null): string {
  if (!numero) return "";
  const m = /^(OC|OS)-(\d{4})-(\d+)$/.exec(numero.trim());
  if (!m) return numero;
  const [, prefixo, ano, seq] = m;
  return `${prefixo}-${seq}-${ano}`;
}
