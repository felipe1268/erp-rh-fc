---
name: Financeiro "só real" lock
description: How the global hide-projections lock works across the Financeiro module
---

`FINANCEIRO_SOMENTE_REAL` (em `shared/financeiroProjecao.ts`) é a TRAVA global que esconde TODAS as projeções (forecast: cronograma/PCP/folha projetada/encargos/13º/férias/rescisão/PJ/VR/VA) das telas do Financeiro, mostrando só caixa real. Flip único p/ reabrir.

**Regra:** ao esconder projeção "no módulo inteiro", NÃO basta filtrar a lista de despesas. As fontes de projeção entram por caminhos diferentes:
- Despesas: `getEntries*` + `getContasAPagarByYear` (origem_modulo) → use `sqlNotProjecao()` no servidor.
- Receitas no Fluxo de Caixa: vêm de `financial.getContasReceberMatrix` (matriz de Contas a Receber), que SEMPRE devolve previsto+medido; o split efetivo/projeção é feito NO CLIENTE (`FinanceiroFluxoCaixa.tsx`) por `status` da célula (previsto/previsao_faturamento = projeção). Então p/ esconder projeção de receita: forçar `natureza="efetivo"` + esconder o seletor — não há filtro server-side nesse endpoint.
- CONCILIAÇÃO: TODA query que lê `financial_entries` na conciliação (pendências "ERP sem extrato", "sem conta", e `sugerirConciliacao`) precisa de `AND ${sqlNotProjecao("e.origem_modulo")}` — senão projeção (cronograma etc.) vaza como falso "ERP sem extrato". É literal SQL sem placeholder, então NÃO desloca o binding posicional do `dbExecute`. RESSALVA: o bloco "conciliados" (LEFT JOIN entry_id) NÃO foi filtrado de propósito (projeção já conciliada = dado real casado; raro).

**Why:** o objetivo "Financeiro só real" exige cobrir despesa E receita; um code review pegou que só a despesa havia sido tratada e a receita projetada continuava vazando pelo matrix.

**How to apply:** qualquer nova tela/endpoint do Financeiro que mostre agregados deve consultar a fonte única `shared/financeiroProjecao.ts` (server: `sqlNotProjecao`; client: `isProjecaoOrigem` + respeitar a flag). Dashboard executivo / DRE / CFO não foram tocados nesta trava (já excluíam cronograma parcialmente) — revisar se o usuário apontar projeção sobrando lá.
