---
name: Folha — relatórios secundários sem filtro CLT
description: Onde vazamentos de PJ/não-CLT tendem a aparecer na Folha de Pagamento, mesmo quando o motor principal já filtra corretamente.
---

`simularPagamento` (payrollEngine.ts) já filtra `tipoContrato='CLT'` estritamente ao montar
`empList` — confirmado via Neon que nenhum PJ/Sócio gera `payroll_payments`.

Quando o usuário reporta "PJ aparecendo na Folha", o motor principal raramente é a causa. O padrão
de vazamento observado é em **relatórios/telas secundárias** que leem dados já persistidos (ex.:
`folhaItens`, importado de PDF) e cruzam com `employees` para exibir nome/função — sem repetir o
filtro de `tipoContrato`. Exemplo concreto: `custosPorObra` (folhaPagamento.ts), relatório de
distribuição de custo por obra, montava o mapa de funcionários a partir de `folhaItens` sem checar
`tipoContrato`.

**Como aplicar:** ao investigar um vazamento de PJ/Sócio/estagiário em qualquer tela da Folha,
primeiro confirme se o motor principal (`simularPagamento`) está correto — se estiver, procure por
telas que reconstroem a lista de funcionários a partir de dados JÁ GRAVADOS (itens de folha
importada, snapshots, relatórios de rateio) em vez de reconsultar `employees` com o filtro CLT.
