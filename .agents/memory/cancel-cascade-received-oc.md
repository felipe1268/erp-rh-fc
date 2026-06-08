---
name: Cancelamento cascata — OC recebida preserva obrigação
description: Por que o cancelamento em cascata de contrato/OC NÃO cancela OCs já recebidas nem seus financeiros pendentes.
---

# Cancelamento em cascata (admin master) — preservar material recebido

Ao cancelar (soft) um contrato/OC em cascata, **NÃO** cancelar OCs com status
`entregue` ou `entregue_parcial` (nem `cancelada`), e **NÃO** cancelar os
`financialEntries` dessas OCs — mesmo que estejam não pagos.

**Why:** material já recebido gera obrigação de pagamento; cancelar o contrato
não desfaz essa dívida. Cancelar a OC recebida + seu financeiro pendente
"sumiria" com um passivo real. Regra confirmada em code review.

**How to apply:** no loop de OCs do cascade use
`STATUS_OC_PRESERVAR = ['cancelada','entregue','entregue_parcial']` e faça
`continue` (pula a OC E seus financeiros). Só cancela financeiros
(`NOT IN ('pago','recebido','cancelado')`) das OCs efetivamente canceladas.
Medições cancelam `NOT IN ('paga','cancelada')`. Tudo dentro de
`db.transaction` (atomicidade). Callers passam `db` real de `getDb()` (não tx),
então `db.transaction` no helper não aninha.
