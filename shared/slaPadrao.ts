/**
 * Rev. 4604 — SLA (Acordo de Nível de Serviço) do Contrato de Prestação de Serviços.
 *
 * O SLA reforça a caracterização B2B do contrato: mede RESULTADO (nunca
 * presença/horário/frequência) e tem consequência COMERCIAL (glosa na medição /
 * refazimento), nunca disciplinar. Indicadores são editáveis por contrato
 * (personalização = negociação real entre empresas).
 */

export interface SlaItem {
  indicador: string;
  meta: string;
  apuracao: string;
  consequencia: string;
}

export const SLA_ITENS_PADRAO: SlaItem[] = [
  {
    indicador: "Cumprimento dos prazos das entregas acordadas no cronograma",
    meta: "≥ 90% no mês",
    apuracao: "Por medição mensal",
    consequencia: "Glosa proporcional na medição do período",
  },
  {
    indicador: "Qualidade técnica (entregas aceitas sem necessidade de correção)",
    meta: "≥ 95%",
    apuracao: "Por medição mensal",
    consequencia: "Refazimento às expensas da CONTRATADA",
  },
  {
    indicador: "Retrabalho (serviços refeitos por desconformidade técnica)",
    meta: "≤ 5% do valor medido",
    apuracao: "Por medição mensal",
    consequencia: "Não remunerado; glosa em caso de reincidência",
  },
  {
    indicador: "Prazo de resposta a solicitações técnicas formais",
    meta: "Até 2 dias úteis",
    apuracao: "Por registro formal (e-mail/sistema)",
    consequencia: "Apontamento na medição seguinte",
  },
];

/** Parse tolerante do JSON salvo no contrato; retorna null se vazio/inválido. */
export function parseSlaItens(json: string | null | undefined): SlaItem[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const itens = arr
      .filter((x: any) => x && typeof x === "object" && String(x.indicador || "").trim())
      .map((x: any) => ({
        indicador: String(x.indicador || "").trim(),
        meta: String(x.meta || "").trim(),
        apuracao: String(x.apuracao || "").trim(),
        consequencia: String(x.consequencia || "").trim(),
      }));
    return itens.length > 0 ? itens : null;
  } catch {
    return null;
  }
}

/** Versão texto puro (documento .txt / gerarTexto do servidor). */
export function formatSlaTexto(itens: SlaItem[]): string {
  return itens
    .map(
      (it, i) =>
        `${i + 1}. Indicador: ${it.indicador}\n   Meta: ${it.meta} | Apuração: ${it.apuracao} | Consequência: ${it.consequencia}`
    )
    .join("\n\n");
}
