// ─── Rev. 3147 — Fonte ÚNICA das "projeções" do Financeiro ────────────────────
// Antes a lista de origens de PROJEÇÃO (forecast de Planejamento/Folha/PCP, SEM
// fato gerador real) vivia duplicada em FinanceiroContasAPagar.tsx (L82) e
// FinanceiroFluxoCaixa.tsx (L27), e o servidor só conhecia 'cronograma_atividade'
// solto. Centralizado aqui p/ client e server compartilharem a MESMA definição.
//
// FINANCEIRO_SOMENTE_REAL = TRAVA global do módulo Financeiro: quando `true`, os
// endpoints de leitura escondem TODAS as projeções (mostram só caixa REAL) e as
// telas escondem o seletor Efetivo/Projeção/Todos. Pedido do usuário (Rev. 3147):
// "tratar o Financeiro só com os lançamentos atuais, deixar as projeções p/ outra
// hora". Reversível: basta voltar p/ `false` aqui (ÚNICO ponto de flip).

export const PROJECAO_ORIGENS = [
  "cronograma_atividade",
  "planejamento_compra",
  "folha_projetada",
  "encargos_projetado",
  "beneficio_vr_projetado",
  "beneficio_va_projetado",
  "decimo_terceiro_projetado",
  "pj_projetado",
  "ferias_projetada",
  "rescisao_projetada",
] as const;

export const PROJECAO_ORIGENS_SET: Set<string> = new Set<string>(PROJECAO_ORIGENS);

export function isProjecaoOrigem(origem?: string | null): boolean {
  return PROJECAO_ORIGENS_SET.has(origem ?? "");
}

// Fragmento SQL: "a origem NÃO é projeção" (= é caixa real). Identificadores fixos
// e seguros (sem input do usuário) → literais inline, sem placeholder (compatível
// com o `dbExecute` que liga $N por ORDEM DE APARIÇÃO).
export function sqlNotProjecao(col: string = "origem_modulo"): string {
  const lista = PROJECAO_ORIGENS.map((o) => `'${o}'`).join(",");
  return `COALESCE(${col},'') NOT IN (${lista})`;
}

// TRAVA global — ver comentário no topo. Flip p/ `false` reabilita projeções.
export const FINANCEIRO_SOMENTE_REAL = true;
