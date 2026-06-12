---
name: Saldo inicial da conta bancária
description: Onde vive o saldo de abertura de uma conta bancária e como o Fluxo de Caixa o usa
---

O "Saldo Inicial" (saldo de abertura) de uma conta bancária NÃO mora em
`company_bank_accounts`. Ele vive na tabela já existente `financial_opening_balances`
(1 linha por conta: companyId, contaBancariaId, contaNome, dataAbertura, valor,
confirmedBy*), a mesma tabela que os KPIs financeiros já consomem.

**Why:** evitar coluna/tabela nova e self-heal, e manter single-source-of-truth — os
KPIs financeiros já liam essa tabela. `listarContasBancarias` (folhaPagamento.ts) faz o
merge JS por `contaBancariaId` e devolve `saldoInicial`/`saldoInicialData` em cada conta.

**How to apply:** qualquer leitura/escrita de saldo de abertura de conta deve ir por
`financial_opening_balances` (upsert SEM delete, R-001/R-007/R-010), não por coluna na
conta. O Fluxo de Caixa (FinanceiroFluxoCaixa.tsx) usa a SOMA dos saldos iniciais como
ponto de partida do "Saldo Acumulado" (era `acc=0`); a página é anual (sem carry
cross-ano) e a Conciliação item-a-item não tem running balance.

**Tenant guard:** as mutações de conta bancária (criar/atualizar/excluir) operavam por
`id` puro = IDOR pré-existente. Use `getCompaniesForUser(ctx.user.id, ctx.user.role)`
p/ validar acesso à empresa do registro ANTES de qualquer write (admin* = global).
