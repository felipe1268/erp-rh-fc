---
name: Conciliar cheque do Controle de Cheques — reserva atômica
description: Ao conciliar uma linha do extrato contra um cheque de financial_cheques (criando despesa), reservar o CHEQUE primeiro com checagem de rows-affected.
---

# Conciliar cheque do Controle de Cheques (Opção A)

Os diálogos de conciliação manual ("Conciliar PIX no extrato" e "Trocar lançamento vinculado")
podem conciliar uma linha do extrato contra um cheque de `financial_cheques` que NÃO tem
lançamento de despesa: a mutation cria a despesa (status pago), concilia a linha e baixa o cheque.

**Regra:** dentro da `db.transaction`, reserve o CHEQUE PRIMEIRO com
`UPDATE financial_cheques ... WHERE lancamento_id IS NULL RETURNING id` e cheque `rows().length===0 → CONFLICT`.
Só depois reserve a linha (`WHERE conciliado=0 RETURNING id`, mesmo guard).

**Why:** dois requests com o MESMO `chequeId` mas linhas DIFERENTES passam ambos no pré-check
(linhas distintas), cada um cria sua despesa, e sem checar rows-affected na baixa do cheque o
segundo commita uma despesa+linha conciliadas SEM baixar o cheque (estado inconsistente). Achado
pelo architect na Rev. 3752. Um UPDATE sem RETURNING/rows-check não detecta a corrida.

**How to apply:** qualquer write que "consome" um recurso single-use (cheque, título, reserva)
dentro de transação com múltiplos recursos deve usar `RETURNING id` + checar rows e abortar (rollback)
quando 0 — não confiar no `WHERE` idempotente sozinho. Reservar o recurso mais disputado primeiro.
