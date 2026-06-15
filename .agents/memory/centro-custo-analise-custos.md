---
name: Centro de Custo na Análise de Custos
description: Dois conceitos "centro de custo" no ERP; como a Análise de Custos resolve o centro de um lançamento.
---

No ERP existem DOIS conceitos chamados "centro de custo":
- a OBRA do lançamento (`financial_entries.obra_nome`) — o que a Análise de Custos usava ANTES; e
- o CADASTRO real de Centros de Custo (`financial_cost_centers`: RH, Diretoria, Despesas Gerais de Obras, Financeiro…), lido via `financial.getCostCenters`. Cada CATEGORIA do plano de contas pode apontar pra um centro via `financial_accounts.centro_custo_id`.

A Análise de Custos (dashboard `FinanceiroAnaliseCustos.tsx` + detalhe `...Detalhe.tsx`) classifica pelo CADASTRO, não por obra. A resolução do centro de um lançamento vive em `shared/centroCusto.ts` (`centroCustoNomeDe`), em prioridade:
1. CC EXPLÍCITO no lançamento (`centro_custo_id`/`centro_custo_nome` — colunas aditivas);
2. DERIVADO da categoria (via `financial_accounts.centroCustoId`);
3. "Sem centro de custo".

**Why / cuidado de edição:** string vazia em `centroCustoNome` (e `centroCustoId` null) é tratada como AUSENTE pelo helper → cai no derivado. Logo gravar "" não apaga permanentemente um centro derivado. Mas no diálogo de edição, se o centro atual não casa com a lista (centro inativo/legado), NÃO deixe cair em CLEAR e gravar "" — use o padrão "-1 = manter atual" (espelha o da categoria) pra não sobrescrever um override explícito sem o usuário pedir.

**How to apply:** a leitura do nome só resolve contra `ccNomeById` da PRÓPRIA empresa (getCostCenters tenant-safe), então um `centroCustoId` de outra empresa não vaza nome — só não resolve e cai no derivado. Por isso não há IDOR de leitura; validação extra de pertencimento do id no backend é opcional.
