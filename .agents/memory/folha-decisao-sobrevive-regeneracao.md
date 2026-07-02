---
name: Decisão de folha sobrevive à regeneração do snapshot
description: Por que decisões humanas (pagar/não-pagar) na Folha precisam de tabela própria em vez de campo no snapshot regenerado.
---

`payroll_payments` (e o `pagamentoResultJson` guardado em `payroll_periods`) é regenerado por
inteiro toda vez que o RH roda "Simular Pagamento" — não é um registro incremental. Qualquer decisão
humana embutida diretamente nessas linhas (ex.: marcar um funcionário como "excluído desta rodada")
seria perdida na próxima simulação.

O padrão já usado para o alerta de Vale (`payroll_advances.status`/`bloqueado`) e replicado para o
alerta de aviso prévio encerrando no mês (`payroll_folha_decisoes`) é: a decisão vive numa tabela
PRÓPRIA, chaveada por `companyId + employeeId + mesReferencia`, e o motor de simulação
(`simularPagamento`) LÊ essa tabela a cada rodada para decidir se inclui/exclui o funcionário e se ele
entra nos totais. Assim a decisão do RH sobrevive a qualquer nº de resimulações do mês.

**Como aplicar:** ao adicionar um novo tipo de decisão humana na Folha (pagar/não-pagar, aprovar
valor, etc.), sempre criar/usar uma tabela dedicada de decisões e consultá-la no motor a cada
simulação — nunca gravar a decisão só dentro do JSON/snapshot que é sobrescrito.
