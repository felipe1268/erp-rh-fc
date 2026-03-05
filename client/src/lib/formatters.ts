/**
 * Funções de formatação de documentos brasileiros.
 * REGRA PERMANENTE: Todos os números de documentos devem ser exibidos formatados.
 * REGRA PERMANENTE: Todos os números inteiros (contadores, totais) devem usar separador de milhar pt-BR.
 */

/** Formata número inteiro com separador de milhar brasileiro (ex: 1.242) */
export function fmtNum(val: unknown): string {
  if (val === null || val === undefined) return "0";
  const n = typeof val === 'number' ? val : Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('pt-BR');
}

/** CPF: 000.000.000-00 */
export function formatCPF(val: unknown): string {
  if (!val) return "-";
  const digits = String(val).replace(/\D/g, "");
  if (digits.length !== 11) return String(val);
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/** RG: 0.000.000 ou 00.000.000-0 (varia por estado, formata com pontos) */
export function formatRG(val: unknown): string {
  if (!val) return "-";
  const s = String(val).trim();
  // Se já tem formatação, retorna como está
  if (/[.\-\/]/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 7) return digits.replace(/(\d{1})(\d{3})(\d{3})/, "$1.$2.$3");
  if (digits.length === 8) return digits.replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3");
  if (digits.length === 9) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, "$1.$2.$3-$4");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return s;
}

/** CNPJ: 00.000.000/0000-00 */
export function formatCNPJ(val: unknown): string {
  if (!val) return "-";
  const digits = String(val).replace(/\D/g, "");
  if (digits.length !== 14) return String(val);
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** CEP: 00000-000 */
export function formatCEP(val: unknown): string {
  if (!val) return "-";
  const digits = String(val).replace(/\D/g, "");
  if (digits.length !== 8) return String(val);
  return digits.replace(/(\d{5})(\d{3})/, "$1-$2");
}

/** PIS/PASEP: 000.00000.00-0 */
export function formatPIS(val: unknown): string {
  if (!val) return "-";
  const digits = String(val).replace(/\D/g, "");
  if (digits.length !== 11) return String(val);
  return digits.replace(/(\d{3})(\d{5})(\d{2})(\d{1})/, "$1.$2.$3-$4");
}

/** Telefone: (00) 0000-0000 ou (00) 00000-0000 */
export function formatTelefone(val: unknown): string {
  if (!val) return "-";
  const s = String(val).trim();
  // Se já tem formatação, retorna como está
  if (/\(/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  return s;
}

/** CTPS: 000.00000.00-0 (mesmo formato do PIS) ou apenas formatação simples */
export function formatCTPS(val: unknown): string {
  if (!val) return "-";
  return String(val);
}

/** Título de Eleitor: 0000 0000 0000 */
export function formatTituloEleitor(val: unknown): string {
  if (!val) return "-";
  const digits = String(val).replace(/\D/g, "");
  if (digits.length === 12) return digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
  return String(val);
}

/** Certificado de Reservista: 000000000000 (12 dígitos, sem formatação padrão) */
export function formatReservista(val: unknown): string {
  if (!val) return "-";
  return String(val);
}

/** CNH: 00000000000 (11 dígitos) */
export function formatCNH(val: unknown): string {
  if (!val) return "-";
  return String(val);
}

/**
 * Converte string monetária para número, detectando automaticamente
 * formato brasileiro (1.234,56) vs americano/banco (1234.56 ou 4000.00)
 * 
 * Regras de detecção:
 * - Se termina com vírgula + 1-2 dígitos → formato BR (ex: "4.000,00" → 4000)
 * - Se termina com ponto + 1-2 dígitos e NÃO tem vírgula → formato US/banco (ex: "4000.00" → 4000)
 * - Caso contrário → tenta parseFloat direto
 */
function parseMoneyString(s: string): number {
  const str = s.trim().replace(/^R\$\s*/, "");
  // Se tem vírgula seguida de 1-2 dígitos no final → formato BR (1.234,56)
  if (/,\d{1,2}$/.test(str)) {
    return parseFloat(str.replace(/\./g, "").replace(",", "."));
  }
  // Se tem ponto seguido de 1-2 dígitos no final e NÃO tem vírgula → formato US/banco (4000.00)
  if (/\.\d{1,2}$/.test(str) && !str.includes(",")) {
    return parseFloat(str);
  }
  // Número inteiro sem separadores
  return parseFloat(str.replace(/[^\d.-]/g, ""));
}

/**
 * Formata qualquer valor monetário como R$ 0.000,00
 * Detecta automaticamente formato BR (1.234,56) e US/banco (1234.56)
 */
export function formatMoeda(val: unknown): string {
  if (!val && val !== 0) return "-";
  const num = typeof val === "number" ? val : parseMoneyString(String(val));
  if (isNaN(num)) return String(val);
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formata valor monetário para exibição sem prefixo R$ (ex: 2.500,00)
 * Detecta automaticamente formato BR (1.234,56) e US/banco (1234.56)
 */
export function formatMoedaSemPrefixo(val: unknown): string {
  if (!val && val !== 0) return "";
  const num = typeof val === "number" ? val : parseMoneyString(String(val));
  if (isNaN(num)) return String(val);
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Máscara de input para valores monetários brasileiros.
 * Aceita digitação livre mas formata ao sair do campo.
 * Retorna o valor formatado como string (ex: "2.500,00")
 */
export function formatMoedaInput(rawValue: string): string {
  // Remove tudo exceto dígitos e vírgula
  let cleaned = rawValue.replace(/[^\d,]/g, "");
  
  // Garante apenas uma vírgula
  const parts = cleaned.split(",");
  if (parts.length > 2) {
    cleaned = parts[0] + "," + parts.slice(1).join("");
  }
  
  // Separa parte inteira e decimal
  const [intPart, decPart] = cleaned.split(",");
  
  // Formata parte inteira com pontos de milhar
  const intFormatted = intPart ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  
  // Retorna com vírgula se houver parte decimal
  if (decPart !== undefined) {
    return `${intFormatted},${decPart.slice(0, 2)}`;
  }
  return intFormatted;
}

/**
 * Converte valor formatado brasileiro (2.500,00) para número float
 */
export function parseMoedaBR(val: string): number {
  if (!val) return 0;
  const num = parseFloat(val.replace(/\./g, "").replace(",", "."));
  return isNaN(num) ? 0 : num;
}
