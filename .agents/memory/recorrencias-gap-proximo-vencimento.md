---
name: Recorrências — gap permanente após exclusão
description: materializeRecorrentes nunca regenera meses passados; exclusão em massa cria buraco irreversível
---

`materializeRecorrentes` (financial.ts) começa o loop em `proximo_vencimento` e só anda pra FRENTE. Se parcelas materializadas de meses passados forem excluídas (Zerar mês / exclusão em massa), o motor NUNCA as regenera — o gap fica permanente enquanto o dedup por YYYY-MM só protege o que existe.

**Why:** jul–dez/2026 da FC ficaram sem as 40 recorrências antigas (só as 2 criadas depois tinham parcela); as de 2027 existiam e o próximo vencimento estava em set/2027.
**How to apply:** para regenerar, replicar o INSERT ... WHERE NOT EXISTS por mês direto no Neon (não mexer no proximo_vencimento, senão duplica o futuro). Se o usuário pedir proteção, o caminho é impedir/alertar exclusão de parcela de recorrência ou botão "regerar mês".
