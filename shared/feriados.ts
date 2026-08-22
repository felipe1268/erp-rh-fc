/**
 * Feriados nacionais brasileiros + dia da semana.
 *
 * Usado para enriquecer telas com datas (ex.: Pedágios) mostrando o dia da
 * semana e se a data caiu em feriado nacional. Cálculo 100% local (sem API):
 * feriados fixos + móveis derivados da Páscoa (Computus / algoritmo de Gauss).
 *
 * Observação: cobre apenas feriados NACIONAIS. Feriados estaduais/municipais
 * (ex.: aniversário da cidade) não são considerados.
 */

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type YMD = { y: number; m: number; d: number };

/** Extrai ano/mês/dia de uma data ISO/"YYYY-MM-DD ..."/Date, sem sofrer com fuso. */
function ymd(raw: string | Date | null | undefined): YMD | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return { y: raw.getFullYear(), m: raw.getMonth() + 1, d: raw.getDate() };
  }
  const mt = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return null;
  return { y: Number(mt[1]), m: Number(mt[2]), d: Number(mt[3]) };
}

/** Formata a data em dd/mm/aaaa pt-BR usando a MESMA base UTC (sem drift de fuso). */
export function dataBR(raw: string | Date | null | undefined): string {
  const p = ymd(raw);
  if (!p) return "";
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

/** Nome completo do dia da semana em pt-BR (ex.: "Segunda-feira"). */
export function nomeDiaSemana(raw: string | Date | null | undefined): string {
  const p = ymd(raw);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return DIAS_SEMANA[dt.getUTCDay()];
}

/** Nome curto do dia da semana em pt-BR (ex.: "Seg"). */
export function nomeDiaSemanaCurto(raw: string | Date | null | undefined): string {
  const p = ymd(raw);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return DIAS_SEMANA_CURTO[dt.getUTCDay()];
}

/** true se for sábado ou domingo. */
export function ehFimDeSemana(raw: string | Date | null | undefined): boolean {
  const p = ymd(raw);
  if (!p) return false;
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return wd === 0 || wd === 6;
}

/** Domingo de Páscoa do ano (algoritmo de Gauss / Computus gregoriano). */
function domingoPascoa(year: number): YMD {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mth = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mth + 114) / 31);
  const day = ((h + l - 7 * mth + 114) % 31) + 1;
  return { y: year, m: month, d: day };
}

function somaDias(base: YMD, n: number): YMD {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const FERIADOS_FIXOS: Record<string, string> = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Consciência Negra",
  "12-25": "Natal",
};

/**
 * Retorna o nome do feriado NACIONAL se a data for feriado, senão `null`.
 * Inclui fixos + móveis (Carnaval, Sexta-feira Santa, Corpus Christi).
 */
export function feriadoNacional(raw: string | Date | null | undefined): string | null {
  const p = ymd(raw);
  if (!p) return null;

  const chave = `${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  if (FERIADOS_FIXOS[chave]) return FERIADOS_FIXOS[chave];

  const pascoa = domingoPascoa(p.y);
  const moveis: Array<[YMD, string]> = [
    [somaDias(pascoa, -47), "Carnaval"],
    [somaDias(pascoa, -2), "Sexta-feira Santa"],
    [somaDias(pascoa, 60), "Corpus Christi"],
  ];
  for (const [data, nome] of moveis) {
    if (data.m === p.m && data.d === p.d) return nome;
  }
  return null;
}

/**
 * Rescisão (art. 477 §6º CLT): se o prazo cair em sábado, domingo ou feriado
 * nacional, o pagamento deve ser ANTECIPADO para o dia útil anterior.
 */
export function anteciparParaDiaUtil(iso: string): string {
  let p = ymd(iso);
  if (!p) return iso;
  for (let i = 0; i < 10; i++) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
    const dow = dt.getUTCDay();
    const isoStr = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    if (dow !== 0 && dow !== 6 && !feriadoNacional(isoStr)) return isoStr;
    dt.setUTCDate(dt.getUTCDate() - 1);
    p = { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  return iso;
}

/**
 * Data-limite de pagamento da rescisão: término + 10 dias corridos, MAS o
 * término "para efeito de pagamento" ignora os dias EXTRAS do aviso (Lei
 * 12.506: +3d/ano são INDENIZADOS — o contrato trabalhado encerra nos 30 dias).
 * Regra do usuário: cap = início do aviso + 29 dias (dia 1 = próprio início).
 * Resultado sempre antecipado para dia útil.
 */
export function dataLimitePagamentoRescisao(dataInicioAviso: string | null | undefined, dataFimAviso: string | null | undefined): string | null {
  const fim = ymd(dataFimAviso);
  if (!fim) return null;
  let base = new Date(Date.UTC(fim.y, fim.m - 1, fim.d));
  const ini = ymd(dataInicioAviso);
  if (ini) {
    const cap = new Date(Date.UTC(ini.y, ini.m - 1, ini.d));
    cap.setUTCDate(cap.getUTCDate() + 29);
    if (cap.getTime() < base.getTime()) base = cap;
  }
  base.setUTCDate(base.getUTCDate() + 10);
  const isoStr = base.toISOString().split("T")[0];
  return anteciparParaDiaUtil(isoStr);
}
