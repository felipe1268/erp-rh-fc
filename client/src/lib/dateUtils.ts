/**
 * Utilitários de data/hora padronizados para o sistema.
 * TODAS as datas/horas devem ser exibidas no fuso de Brasília (America/Sao_Paulo).
 *
 * IMPORTANTE: O banco de dados (TiDB) armazena timestamps em UTC.
 * O Drizzle com mode:'string' retorna strings como "2026-02-24 06:43:01" SEM indicador de timezone.
 * Precisamos garantir que essas strings sejam interpretadas como UTC antes de converter para Brasília.
 */

const TIMEZONE = "America/Sao_Paulo";

/**
 * Converte uma string de data do banco para um Date object interpretado como UTC.
 * Strings sem indicador de timezone (Z, +, -) são tratadas como UTC.
 */
function parseAsUTC(value: string | Date): Date {
  if (value instanceof Date) return value;
  
  const str = value.trim();
  
  // Se já tem indicador de timezone (Z, +XX:XX, -XX:XX), parse normalmente
  if (/[Zz]$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str);
  }
  
  // Se é uma data sem hora (YYYY-MM-DD), não precisa de conversão UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(str + "T12:00:00Z"); // Meio-dia UTC para evitar problemas de dia
  }
  
  // String sem timezone (ex: "2026-02-24 06:43:01") → tratar como UTC
  // Substituir espaço por T e adicionar Z
  const isoStr = str.replace(" ", "T") + "Z";
  return new Date(isoStr);
}

/**
 * Formata data+hora para exibição no fuso de Brasília.
 * Ex: "24/02/2026, 03:43:01"
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseAsUTC(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", { timeZone: TIMEZONE });
  } catch {
    return "—";
  }
}

/**
 * Formata apenas a data para exibição no fuso de Brasília.
 * Ex: "24/02/2026"
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    const d = parseAsUTC(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { timeZone: TIMEZONE });
  } catch {
    return "—";
  }
}

/**
 * Formata apenas a hora para exibição no fuso de Brasília.
 * Ex: "03:43"
 */
export function formatTime(value: string | Date | null | undefined, showSeconds = false): string {
  if (!value) return "—";
  try {
    const d = parseAsUTC(value);
    if (isNaN(d.getTime())) return "—";
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    };
    if (showSeconds) opts.second = "2-digit";
    return d.toLocaleTimeString("pt-BR", opts);
  } catch {
    return "—";
  }
}

/**
 * Retorna a data/hora atual formatada no fuso de Brasília.
 * Ex: "24/02/2026, 03:43:01"
 */
export function nowBrasilia(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: TIMEZONE });
}

/**
 * Retorna apenas a data atual formatada no fuso de Brasília.
 * Ex: "24/02/2026"
 */
export function todayBrasilia(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: TIMEZONE });
}

/**
 * Retorna a data atual por extenso no fuso de Brasília.
 * Ex: "24 de fevereiro de 2026"
 */
export function todayBrasiliaLong(): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
