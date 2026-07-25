---
name: Renovação de locação — vencimento da parcela
description: A parcela do Contas a Pagar de uma renovação de locação deve vencer no FIM do novo ciclo, nunca no início.
---

Regra: ao gerar a parcela financeira de uma renovação de locação, o vencimento é a `novaDataFim` (fim do novo ciclo), nunca o início do ciclo (dia seguinte ao fim anterior).

**Why:** se a locação estava atrasada, o início do novo ciclo fica no PASSADO — a parcela nasce vencida meses atrás e some da tela do Contas a Pagar (filtrada por mês corrente). O usuário reporta "não foi pro financeiro", mas a entry existe com status `previsto` e data errada.

**How to apply:** qualquer novo caminho que chame `purchaseFinancialBridge.criarParcelasFinanceiras` para locação deve passar `dataBase` = fim do ciclo. Ao diagnosticar "sumiu do Contas a Pagar", verifique primeiro a `data_vencimento` da entry no Neon antes de assumir que não foi criada.
