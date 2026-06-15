// Rev. 3135 — Resolução do CENTRO DE CUSTO (registro real) de um lançamento financeiro.
//
// O ERP tem DOIS conceitos que se chamavam "centro de custo" na Análise de Custos:
//  - OBRA (o que a tela exibia antes — `obra_nome`); e
//  - o CADASTRO real de Centros de Custo (`financial_cost_centers`: RH, Diretoria,
//    Despesas Gerais de Obras, Financeiro…), ao qual cada CATEGORIA do Plano de
//    Contas pode estar vinculada via `financial_accounts.centro_custo_id` (Rev. 2082).
//
// A partir da Rev. 3135 a Análise de Custos classifica pelos Centros de Custo
// CADASTRADOS, não mais por obra. O centro de um lançamento é resolvido por:
//   1) CENTRO EXPLÍCITO no lançamento (override manual — `centro_custo_id`/`_nome`);
//   2) DERIVADO da categoria (financial_accounts.centroCustoId) — pega os já lançados
//      sem reclassificar à mão;
//   3) "Sem centro de custo".

export const SEM_CENTRO_CUSTO = "Sem centro de custo";

export interface CentroCustoMaps {
  /** id do centro de custo (financial_cost_centers.id) → nome */
  ccNomeById: Map<number, string>;
  /** id da categoria (financial_accounts.id) → centroCustoId (ou null) */
  catCcIdById: Map<number, number | null>;
  /** nome da categoria (lower) → centroCustoId (ou null) */
  catCcIdByNome: Map<string, number | null>;
}

export function buildCentroCustoMaps(costCenters: any[], accounts: any[]): CentroCustoMaps {
  const ccNomeById = new Map<number, string>();
  for (const c of Array.isArray(costCenters) ? costCenters : []) {
    if (c?.id != null) {
      const nome = String(c?.nome ?? "").trim();
      if (nome) ccNomeById.set(Number(c.id), nome);
    }
  }
  const catCcIdById = new Map<number, number | null>();
  const catCcIdByNome = new Map<string, number | null>();
  for (const a of Array.isArray(accounts) ? accounts : []) {
    const cc = a?.centroCustoId != null ? Number(a.centroCustoId) : null;
    if (a?.id != null) catCcIdById.set(Number(a.id), cc);
    const nome = String(a?.nome ?? "").trim().toLowerCase();
    if (nome && !catCcIdByNome.has(nome)) catCcIdByNome.set(nome, cc);
  }
  return { ccNomeById, catCcIdById, catCcIdByNome };
}

/** Nome do centro de custo de um lançamento, na ordem de prioridade descrita acima. */
export function centroCustoNomeDe(r: any, m: CentroCustoMaps): string {
  // 1) Explícito (override manual no próprio lançamento)
  const explicitId = r?.centroCustoId != null ? Number(r.centroCustoId) : null;
  if (explicitId != null) {
    const n = m.ccNomeById.get(explicitId);
    if (n) return n;
  }
  const explicitNome = String(r?.centroCustoNome ?? "").trim();
  if (explicitNome) return explicitNome;

  // 2) Derivado da categoria (Plano de Contas → centro de custo)
  let ccId: number | null | undefined = undefined;
  if (r?.contaId != null) ccId = m.catCcIdById.get(Number(r.contaId));
  if (ccId == null && r?.contaNome) {
    ccId = m.catCcIdByNome.get(String(r.contaNome).trim().toLowerCase());
  }
  if (ccId != null) {
    const n = m.ccNomeById.get(Number(ccId));
    if (n) return n;
  }

  // 3) Sem classificação
  return SEM_CENTRO_CUSTO;
}
