---
name: Financeiro baixa parcial (financial_entry_baixas)
description: Como funciona a baixa parcial de Contas a Pagar/Receber e a regra de consistência entre os estornos legados e o histórico de baixas.
---

# Baixa parcial — financial_entry_baixas

`valor_realizado` do entry é um ROLLUP = SUM(baixas ativas), recalculado por `_aplicarRollupBaixas`
a cada baixa/estorno (decide status + data_pagamento). O histórico vive em `financial_entry_baixas`
(1 linha/baixa, estorno soft via `estornada_em`).

## Regra de ouro: estornos legados DEVEM soft-estornar as baixas
**Why:** os estornos LEGADOS (`estornarPagamento`/`estornarReceber`, usados quando o título já está
totalmente pago/recebido) zeram o entry direto. Se NÃO soft-estornarem as baixas ativas, ficam linhas
de histórico órfãs (ativas) que o rollup re-soma na PRÓXIMA `registrarBaixa` → valor inflado/duplo.
**How to apply:** qualquer caminho que reabra/zere um `financial_entries` com tipo despesa/receita
deve chamar `_estornarBaixasAtivasDoEntry(tx, entryId, companyId, ...)` antes de zerar. No-op p/
títulos antigos sem histórico.

## Concorrência: advisory lock por lançamento
`registrarBaixa`, `estornarBaixaItem` e os dois estornos legados rodam dentro de `db.transaction`
com `_lockEntryBaixas(tx, companyId, entryId)` = `pg_advisory_xact_lock(hashtext('feb:<cid>:<eid>'))`.
**Why:** sem o lock, dois cliques/sessões no MESMO título duplicam o BACKFILL ("Baixa anterior
(migração do histórico)") e/ou somam estado defasado no rollup. O lock é de TRANSAÇÃO — só vale
dentro do mesmo `db.transaction`; passe SEMPRE o `tx` para `dbExecute`/`_aplicarRollupBaixas`.

## Backfill suave
Títulos parciais antigos baixados pela rota legada `darBaixaReceber` têm `valor_realizado>0` mas
NENHUMA linha no histórico. Como o rollup recalcula por SUM, a 1ª baixa nova zeraria o valor; por isso
`registrarBaixa` semeia 1 linha base "Baixa anterior (migração do histórico)" quando detecta
`valor_realizado>0` sem baixa ativa (dentro do lock).
