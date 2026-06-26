---
name: Conta bancária não propaga da baixa pro entry
description: Por que um título recebido/baixado com conta informada aparece em "Sem conta definida" na Conciliação
---

# Baixa grava conta só no histórico; rollup precisa propagar pro entry

`registrarBaixa` grava `conta_bancaria_id` APENAS na linha de `financial_entry_baixas`
(o histórico da baixa). O entry em `financial_entries` NÃO recebe a conta automaticamente.

O rollup `_aplicarRollupBaixas` (server/routers/financial.ts) recalcula
`valor_realizado`/`status`/`data_pagamento` do entry — e DEVE também setar
`conta_bancaria_id = COALESCE(<conta da última baixa ativa>, conta_bancaria_id)`
(última = `ORDER BY data DESC, id DESC LIMIT 1` entre baixas com `estornada_em IS NULL`
e `conta_bancaria_id IS NOT NULL`). COALESCE = nunca sobrescrever com NULL (baixa sem
conta preserva o vínculo existente).

**Why:** sem isso o entry fica `conta_bancaria_id=NULL` mesmo após receber com conta,
e cai no balde "Sem conta bancária definida" da Conciliação Bancária. Todo writer que
mexe em baixas (registrarBaixa, estornarBaixaItem, futuros) passa pelo rollup, então o
fix centralizado no rollup cobre todos. Estorno total (sem baixa ativa) mantém a conta
anterior — comportamento intencional.

**How to apply:** ao tocar qualquer fluxo de baixa/recebimento parcial, garanta que a
propagação da conta continue no rollup. Para corrigir dados legados, backfill com a
mesma lógica (`DISTINCT ON (entry_id) ... ORDER BY entry_id, data DESC, id DESC`).
