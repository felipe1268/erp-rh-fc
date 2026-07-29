---
name: OC entregue fora de atualizarStatusOrdem precisa de self-heal financeiro
description: Caminhos que marcam OC entregue (Almoxarifado etc.) devem chamar garantirEntryDaOC ou a OC some do Contas a Pagar
---

Regra: SÓ `atualizarStatusOrdem` (compras.ts) tinha a integração financeira inline; qualquer outro caminho que marca `compras_ordens.status` = entregue/parcial (ex.: recebimento inteligente do Almoxarifado `registerSmartEntry` em warehouse.ts) deixava a OC SEM título no Contas a Pagar — 523 OCs órfãs acumuladas desde abril/2026.

**Why:** o import automático de OCs (`importComprasOrdensToFinancial`) foi desligado na Rev. 1622; desde então a criação do título é 100% event-driven, e os eventos fora do fluxo padrão foram esquecidos.

**How to apply:** todo novo caminho que aprova/entrega OC deve chamar `garantirEntryDaOC(ocId)` (purchaseFinancialBridge.ts) — idempotente, respeita exclusões (FD ≠ normal, cartão, total 0, medição fica fora por já ter entries) e repara link `financial_entry_id` solto. Backfill de julho feito (obs `[backfill Rev.4722 — título ausente]`); abril–junho (478 OCs, ~65 com possível lançamento manual duplicado) pendente de decisão do usuário. Lembrete de casing: `empresas_terceiras`/`obras` usam "companyId" camel; `financial_accounts`/`compras_ordens`/`financial_entries` são snake.
