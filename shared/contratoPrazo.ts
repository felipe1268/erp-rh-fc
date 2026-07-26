/**
 * shared/contratoPrazo.ts
 *
 * Rev. 2737 — Deriva o PRAZO (validade) de um contrato PJ a partir da
 * VIGÊNCIA preenchida (dataInicio → dataFim), em vez do literal "1 (um) ano"
 * que estava hardcoded na Cláusula Quarta do modelo.
 *
 * Contagem de meses INCLUSIVA (do mês de início ao mês de fim, inclusive) —
 * mesma semântica do motor de previsões mensais (`gerarPrevisoesDoContrato`
 * em `server/routers/pjContracts.ts`), onde a vigência cobre N meses de
 * referência. Ex.: 01/06/2026 → 30/11/2026 = 6 meses.
 *
 * Usado tanto no client (visualização/impressão e HTML de assinatura FCSign)
 * quanto no server (`gerarTexto`), garantindo paridade do texto gerado.
 */

function numeroPorExtenso(n: number): string {
  const unidades = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 10) return unidades[n];
  if (n < 20) return especiais[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? dezenas[d] : `${dezenas[d]} e ${unidades[u]}`;
  }
  if (n === 100) return "cem";
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? centenas[c] : `${centenas[c]} e ${numeroPorExtenso(r)}`;
  }
  return String(n);
}

/**
 * Número de meses (inclusivo) entre dataInicio e dataFim (strings ISO
 * "YYYY-MM-DD" ou maiores). Retorna 0 quando faltam datas ou o range é
 * inválido (fim antes do início).
 */
export function mesesDeVigencia(dataInicio?: string | null, dataFim?: string | null): number {
  if (!dataInicio || !dataFim) return 0;
  const ini = String(dataInicio).slice(0, 10).split("-").map(Number);
  const fim = String(dataFim).slice(0, 10).split("-").map(Number);
  if (ini.length < 3 || fim.length < 3) return 0;
  const [aIni, mIni, dIni] = ini;
  const [aFim, mFim, dFim] = fim;
  if (![aIni, mIni, dIni, aFim, mFim, dFim].every((v) => Number.isFinite(v))) return 0;
  // Guarda no nível de DIA: fim antes do início (mesmo no mesmo mês) → inválido.
  const ordIni = aIni * 10000 + mIni * 100 + dIni;
  const ordFim = aFim * 10000 + mFim * 100 + dFim;
  if (ordFim < ordIni) return 0;
  const total = (aFim * 12 + (mFim - 1)) - (aIni * 12 + (mIni - 1)) + 1;
  return total > 0 ? total : 0;
}

/**
 * Valor monetário por extenso em reais (ex.: 6000 → "seis mil reais").
 * Rev. 4602 — usado na cláusula de VALOR TOTAL do contrato de prestação de
 * serviços (valor mensal × meses de vigência). Cobre até centenas de milhões.
 */
export function valorPorExtensoBR(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return "";
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);
  const partes: string[] = [];
  const milhoes = Math.floor(inteiro / 1_000_000);
  const milhares = Math.floor((inteiro % 1_000_000) / 1000);
  const resto = inteiro % 1000;
  if (milhoes > 0) partes.push(`${numeroPorExtenso(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  if (milhares > 0) partes.push(milhares === 1 ? "mil" : `${numeroPorExtenso(milhares)} mil`);
  if (resto > 0) partes.push(numeroPorExtenso(resto));
  let texto = partes.length ? partes.join(" e ") : "zero";
  texto += inteiro === 1 ? " real" : " reais";
  if (centavos > 0) texto += ` e ${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return texto;
}

/**
 * Texto do prazo de validade do contrato a partir da vigência preenchida.
 * Ex.: 6 meses → "6 (seis) meses"; 12 meses → "1 (um) ano"; 24 → "2 (dois) anos".
 * Fallback "prazo determinado" quando não há vigência válida.
 */
export function calcularPrazoVigencia(dataInicio?: string | null, dataFim?: string | null): string {
  const totalMeses = mesesDeVigencia(dataInicio, dataFim);
  if (totalMeses <= 0) return "prazo determinado";
  if (totalMeses >= 12 && totalMeses % 12 === 0) {
    const anos = totalMeses / 12;
    return `${anos} (${numeroPorExtenso(anos)}) ${anos === 1 ? "ano" : "anos"}`;
  }
  return `${totalMeses} (${numeroPorExtenso(totalMeses)}) ${totalMeses === 1 ? "mês" : "meses"}`;
}
