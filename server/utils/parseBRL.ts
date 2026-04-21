/**
 * Converte valor em formato brasileiro ("2.774,20") para número (2774.20).
 * Também aceita formato decimal americano ("2774.20") e números puros.
 *
 * Cuidado especial com strings que têm SOMENTE ponto e nenhuma vírgula:
 * - "1.230"      → 1230 (separador de milhar BR — 3 dígitos após o ponto)
 * - "1.234.567"  → 1234567 (vários pontos = milhar BR)
 * - "1230.50"    → 1230.50 (decimal — 1 ou 2 dígitos após o ponto)
 *
 * Esta heurística resolve o bug do formatMoedaInput, que produz "1.230"
 * quando o usuário digita "1230" sem informar centavos.
 */
export function parseBRL(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return valor;
  const str = valor.toString().trim();
  if (!str) return 0;

  // Se contém vírgula, é formato brasileiro (ex: "2.774,20")
  if (str.includes(',')) {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  // Sem vírgula: precisa diferenciar separador de milhar BR de decimal US
  if (str.includes('.')) {
    const parts = str.split('.');
    // Múltiplos pontos = sempre milhar BR (ex: "1.234.567")
    if (parts.length > 2) {
      const num = parseFloat(parts.join(''));
      return isNaN(num) ? 0 : num;
    }
    // Um ponto só: se o que vem depois tem exatamente 3 dígitos e a parte
    // antes não é vazia, tratamos como milhar BR (ex: "1.230" = 1230).
    // Caso contrário (1, 2 ou 4+ dígitos depois), é decimal US (ex: "1230.5", "1230.50").
    const [intPart, decPart] = parts;
    if (intPart && decPart && decPart.length === 3 && /^\d+$/.test(decPart) && /^\d+$/.test(intPart)) {
      const num = parseFloat(intPart + decPart);
      return isNaN(num) ? 0 : num;
    }
  }

  // Caso padrão: parseFloat normal (ex: "2774.20", "1230")
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}
