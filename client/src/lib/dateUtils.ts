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
export function parseAsUTC(value: string | Date): Date {
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
 * Férias — Calcula a DATA LIMITE para INICIAR o gozo das férias, dado o fim do
 * período concessivo (CLT art. 134). Equivale a 30 dias antes do próximo período
 * aquisitivo: se o gozo é de 30 dias corridos, iniciar na data limite faz com que
 * o último dia caia exatamente no fim do concessivo.
 *
 * Fórmula: limite = periodoConcessivoFim - 29 dias
 * (porque o dia de início também conta como 1 dia de gozo)
 *
 * Ex.: aquisitivo 01/03/2025–28/02/2026, concessivo termina em 28/02/2027.
 *      Próximo aquisitivo começa em 01/03/2027. Limite p/ iniciar gozo = 30/01/2027
 *      (= 28/02/2027 − 29 dias = 01/03/2027 − 30 dias).
 *
 * Retorna string YYYY-MM-DD (mesmo formato do input).
 */
export function dataLimiteInicioGozoFerias(periodoConcessivoFim: string | null | undefined): string | null {
  if (!periodoConcessivoFim) return null;
  const m = String(periodoConcessivoFim).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() - 29);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
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
