---
name: Card "Cheques devolvidos" — fonte pendente vs conciliada
description: Por que cheques devolvidos somem ao conciliar as 2 linhas, e como mostrá-los como "resolvido".
---

# Card "Cheques devolvidos no banco" — par de estorno por estado da linha

O card de cheques devolvidos na Conciliação Bancária é montado detectando o PAR
"compensação (débito) + devolução (crédito)" via `detectarParesEstorno`. Por padrão
essa detecção rodava SÓ sobre as linhas PENDENTES (`pendRes`, `COALESCE(conciliado,0)=0`).

**Consequência (bug que motivou a Rev. 3763):** assim que o usuário concilia AS DUAS
linhas do cheque no extrato, elas saem do conjunto pendente e o par deixa de ser
detectado → o cheque devolvido SOME por completo do card, perdendo o histórico de que
o cheque foi devolvido (caso real: Doc 939, R$ 4.227,50).

**Regra:** para manter o histórico, rode `detectarParesEstorno` TAMBÉM sobre as linhas
conciliadas (`concRes`, `=1`) e emita entradas marcadas como RESOLVIDO
(`resolucao.tipo="conciliado"`, `jaConciliado=true`, `grupoId` em namespace próprio
`devc-N` para não colidir com `dev-N` dos pendentes). Os dois conjuntos são DISJUNTOS
(pendente vs conciliado), então o mesmo par nunca aparece duas vezes.

**Não afeta o %:** linhas conciliadas já contam como conciliadas; esse card é
informativo e não subtrai nada do cálculo `pctConc`. No front, `jaConciliado` deve
suprimir os controles de "desconsiderar/reconsiderar do %" (não fazem sentido) e
mostrar só o badge "Conciliado no extrato"; `isDevolvidoResolvido` precisa tratá-lo
como resolvido para o botão "Ocultar resolvidos" e a contagem "N pendentes · M resolvidos".

**Why:** o design "nada some sem confirmação" vale também para o que o sistema
resolve automaticamente — conciliar não deve apagar o rastro de uma devolução.
