/**
 * Validação de CNPJ usando o algoritmo oficial de dígitos verificadores
 */
export function validateCNPJ(cnpj: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = cnpj.replace(/\D/g, "");

  // Deve ter 14 dígitos
  if (cleaned.length !== 14) return false;

  // Rejeita CNPJs com todos os dígitos iguais
  if (/^(\d)\1{13}$/.test(cleaned)) return false;

  // Cálculo do primeiro dígito verificador
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * weights1[i];
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;

  if (parseInt(cleaned[12]) !== digit1) return false;

  // Cálculo do segundo dígito verificador
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleaned[i]) * weights2[i];
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;

  if (parseInt(cleaned[13]) !== digit2) return false;

  return true;
}

/**
 * Formata CNPJ para exibição: XX.XXX.XXX/XXXX-XX
 */
export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

/**
 * Remove formatação do CNPJ
 */
export function cleanCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}
