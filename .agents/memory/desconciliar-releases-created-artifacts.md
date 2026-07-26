---
name: Desconciliar deve desfazer o que a conciliação CRIOU
description: Estorno de conciliação bancária precisa cancelar entries criados pela própria conciliação e liberar cheques baixados, senão gera duplicidades e cheques presos.
---

Regra: ao estornar uma conciliação (`desconciliarLinha`), distinguir dois tipos de lançamento:
- Entry que EXISTIA antes (título legítimo) → volta a `a_pagar`/`a_receber` (comportamento clássico).
- Entry CRIADO pela própria conciliação (marcador `origem_modulo='cheque_conciliacao'`) → deve virar `cancelado` com motivo, nunca `a_pagar`.
Além disso, TODO cheque em `financial_cheques` com `lancamento_id` apontando pros entries revertidos deve ser liberado (conciliado=0, lancamento_id=NULL; compensado→pendente; devolvido/sustado/cancelado mantêm o status).

**Why:** Antes da Rev. 4601, o estorno deixava o entry criado pela conciliação vivo como "a pagar"; a re-conciliação criava um gêmeo pago → 24 pares falsos no card de duplicidades do Fluxo de Caixa, e cheques ficavam presos (CONFLICT ao re-conciliar).

**How to apply:** Qualquer NOVO fluxo de conciliação que crie entries/baixe sub-razões deve marcar a origem (origem_modulo próprio) e o estorno correspondente deve cancelar/liberar esses artefatos. O detector `getPossiveisDuplicidades` expõe flags `orfaoA/orfaoB` (a_pagar + conc=0 + conciliado_em preenchido + gêmeo pago) pra guiar o usuário.
