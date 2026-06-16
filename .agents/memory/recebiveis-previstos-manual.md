---
name: Recebíveis previstos — materialização manual
description: Por que revenue→entries deixou de ser automático e como evitar duplicar na transferência manual
---

# Recebíveis previstos (financial_revenue → financial_entries)

A materialização AUTOMÁTICA de `financial_revenue` em `financial_entries` (origem='revenue')
foi DESLIGADA: `runAllReceitasImport` (`financialIntegrationBridge`) não chama mais
`importFinancialRevenueToEntries`. Os importers que POPULAM `financial_revenue` seguem ativos.

**Why:** excluir uma receita prevista no Financeiro "não colava" — o próximo sync recriava o par
idempotente. O usuário quis entrada MANUAL/consciente via botão "Recebíveis Previstos" na tela de
Lançamentos, mas SEM perder o aviso (alerta INFO `receita_prevista` em `cfoPhase2`).

**How to apply:** se reativar a materialização automática, o bug do "exclui e volta" retorna —
prefira manter a entrada manual. Qualquer novo writer do par origem='revenue' deve respeitar a
mesma régua de dedup (status NOT IN cancelado/recebido_total, valor_medicao>0, sem par
origem='revenue' nem 'planejamento_medicao').

## Corrida na transferência manual

`financial_entries` NÃO tem índice único em `(company_id, origem_modulo, origem_id)`, então
`INSERT...SELECT...WHERE NOT EXISTS` sozinho NÃO é seguro sob concorrência (dois NOT EXISTS
passam juntos → duplica). A mutation serializa com
`pg_advisory_xact_lock(hashtext('fin_recebiveis_previstos'), companyId)` no início da transação.

**Why:** R-001/007/010 proíbem ALTER/DDL, então não dá pra criar o índice único; o advisory lock
por transação resolve a corrida sem tocar no schema.

**How to apply:** qualquer materialização idempotente-por-NOT-EXISTS nessa tabela precisa do mesmo
lock (ou de um índice único, que aqui é proibido).
