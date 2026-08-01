---
name: Terceiros — título garantido no Financeiro
description: Medição de terceiro aprovada deve SEMPRE virar título no Contas a Pagar, bypassando o toggle auto_import.
---
Regra: aprovar medição de terceiro (direta ou nível Sócio) chama `garantirTituloDaMedicao` — importador direcionado idempotente (entryExists por origem_modulo='terceiro_medicao'+origem_id) que BYPASSA o toggle `auto_import_enabled` (default OFF).

**Why:** com o toggle desligado, `triggerFinancialSyncAwaited` retorna sem fazer nada — a aprovação "dava certo" e o título nunca nascia, silenciosamente.

**How to apply:** qualquer novo caminho que aprove/reative medição deve chamar o helper e propagar `financeiroOk` pro client (toast + badge "SEM título" + botão Reenviar). Concorrência protegida por `pg_advisory_xact_lock(478001, medicaoId)` em transação (não usar lock/unlock manual — pool pode trocar de sessão). `periodo` deve ser validado como YYYY-MM com fallback em dataReferencia, senão o import filtra um mês inexistente e devolve falso negativo.

Esteira/acompanhamento: query `esteiraTerceiros` alimenta o stepper Compras→Contrato→Assinatura→Medição→Financeiro na tela de Medições; "assinado" continua sendo envelope FcSign concluído (nunca o status bruto do contrato).
