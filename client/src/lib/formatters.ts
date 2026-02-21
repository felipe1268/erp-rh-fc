/**
 * Funções de formatação de documentos brasileiros.
 * REGRA PERMANENTE: Todos os números de documentos devem ser exibidos formatados.
 */

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
 * Formata qualquer valor monetário como R$ 0.000,00
 */
export function formatMoeda(val: unknown): string {
  if (!val) return "-";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  if (isNaN(num)) return String(val);
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
