---
name: Contas a Pagar — Faturamento Direto nunca entra em consolidação
description: por que títulos de Faturamento Direto (FD) devem ficar de fora de qualquer agrupamento por ciclo de fechamento de fornecedor
---

Qualquer agrupamento/consolidação de títulos de Contas a Pagar por fornecedor (ciclo de
fechamento, cheque único, etc.) deve excluir compras cuja OC de origem tem
`compras_ordens.modalidade_fd` IN (`fd_cliente`, `fd_terceiro`, `fd_fc`).

**Why:** em Faturamento Direto, quem paga o fornecedor é o CLIENTE (ou o terceiro), não o caixa da
FC. Misturar esses títulos num grupo/cheque consolidado da empresa juntaria dinheiro que não é (e
não deve ser) desembolso da FC com o fluxo de caixa real dela — exigência explícita e crítica do
usuário.

**How to apply:** todo novo ponto de agrupamento por fornecedor em Contas a Pagar/Conciliação deve
carregar `modalidadeFd` (via join com `compras_ordens` na origem `compras`/`compra_oc`) e checar
com um helper tipo `_isFdModalidade()` ANTES de juntar o título num grupo — o título continua
aparecendo individualmente, só não entra no cheque/linha consolidada. Ver também
`contas-pagar-ciclo-window-basis.md` para a lógica de bucketização por janela.
