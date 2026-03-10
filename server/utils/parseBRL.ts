/** 
 * Converte valor em formato brasileiro ("2.774,20") para número (2774.20)
 * Também funciona com valores já em formato decimal ("2774.20") e números puros
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
  
  // Caso contrário, tenta parseFloat normal (ex: "2774.20")
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}
