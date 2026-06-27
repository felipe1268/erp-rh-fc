---
name: DRE drill-down single-source predicate
description: How the DRE line drill-down stays in parity with the DRE totals (financialKpiService)
---

# DRE drill-down ↔ total parity

A linha do DRE e o seu detalhamento clicável (drill-down) compartilham UMA função
de predicado SQL: `dreLinhaPredicate(linha: DRELinhaKey)` em
`server/services/financialKpiService.ts`. `calcularDRE` usa-a nos 7 `FILTER(...)`
e `calcularDRELinhaDetalhe` reusa o MESMO predicado + a MESMA CTE base
(filtros-mãe: company_id, status≠cancelado, tipo≠transferencia, data_competencia,
range `YYYY-MM`).

**Why:** se o detalhe usar um predicado/filtro próprio (inline), ele descasa do
total da linha e o usuário vê um diálogo cuja soma não fecha com o DRE — quebra
de confiança no relatório. Forçar fonte única garante paridade por construção.

**How to apply:** ao mexer em qualquer regra de classificação de linha do DRE
(receita bruta vs financeira, custos de obra, despesas fixas/variáveis, impostos,
etc.), edite SÓ `dreLinhaPredicate` — nunca duplique a regra. A linha `impostos`
tem 2 fontes que DEVEM ser espelhadas nos dois lados: lançamentos
`origem='guia_tributaria'` (no predicado) + obrigações apuradas em
`financial_tax_obligations` (somadas à parte). Predicados são interpolados como
string crua, então o argumento `linha` deve continuar vindo de enum/switch
fechado (`z.enum`), nunca de texto livre do cliente.
