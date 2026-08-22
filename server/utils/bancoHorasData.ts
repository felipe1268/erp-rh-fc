/**
 * Regras puras de vigência do Banco de Horas.
 * Mantidas sem dependências de banco para serem reutilizadas e validadas isoladamente.
 */
export const BANCO_HORAS_DATA_INICIO = "2026-05-15";

export function bancoHorasEstaVigente(data: string | Date | null | undefined): boolean {
  if (!data) return false;
  const iso = data instanceof Date ? data.toISOString().slice(0, 10) : String(data).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= BANCO_HORAS_DATA_INICIO;
}

/** Informa se uma competência mensal contém ao menos um dia posterior ao marco. */
export function bancoHorasMesTemDiasVigentes(mesReferencia: string | null | undefined): boolean {
  if (!mesReferencia || !/^\d{4}-\d{2}$/.test(mesReferencia)) return false;
  return `${mesReferencia}-31` >= BANCO_HORAS_DATA_INICIO;
}