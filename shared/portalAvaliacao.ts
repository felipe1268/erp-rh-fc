/**
 * Helpers compartilhados para a Avaliação Anônima do Portal do Cliente.
 *
 * Rev. 1591 — quando o usuário envia a avaliação do período corrente
 * (mês ou ano, fuso Brasília), o módulo é desativado em todos os pontos
 * de entrada (Hub, Dashboard, menu lateral do Planejamento). O rótulo do
 * próximo período disponível é gerado aqui para manter consistência.
 */

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type PeriodicidadeAvaliacao = "mensal" | "anual";

/**
 * Recebe o período corrente (já avaliado) e devolve um rótulo amigável
 * com o próximo período disponível.
 *  - mensal:  anoMes = "YYYY-MM"  →  "junho/2026"
 *  - anual:   anoMes = "YYYY"     →  "2027"
 */
export function proximaJanelaAvaliacao(
  anoMes: string,
  periodicidade: PeriodicidadeAvaliacao,
): string {
  if (!anoMes) return "";
  if (periodicidade === "anual") {
    const ano = Number(anoMes.slice(0, 4));
    if (!Number.isFinite(ano)) return "";
    return String(ano + 1);
  }
  const [yStr, mStr] = anoMes.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
  const proxMesIdx = m === 12 ? 0 : m;
  const proxAno = m === 12 ? y + 1 : y;
  return `${MESES_PT[proxMesIdx]}/${proxAno}`;
}
