---
name: Cheque↔extrato match — write path needs uniqueness
description: A reconciliation path that WRITES conciliado=1 must be stricter than the display-only molde.
---

# Match cheque ↔ extrato: caminho que GRAVA exige unicidade

A Conciliação Bancária (`financial.ts`, `matchChequeLinha`, Rev. 3229) só EXIBE: aceita
match forte nº+valor com first-match (sem unicidade), valor absoluto e universo company-wide.

A Dupla Checagem do Controle de Cheques (`cheques.ts`, `montarMatcherExtrato`, Rev. 3234)
GRAVA `conciliado=1` — então NÃO pode herdar a permissividade do molde.

**Regra:** quando o match alimenta uma escrita (não só UI), exigir UNICIDADE em TODOS os
índices (forte nº+valor E fraco valor+data): se a chave bate em 2+ linhas do extrato, é
AMBÍGUO → tratar como "não encontrado"/"a conferir", JAMAIS marcar.

**Why:** extrato real tem reapresentação/estorno/histórico → mesmo nº+valor em datas/anos
diferentes; first-match marcaria o cheque errado. Unicidade resolve falso-positivo E colisão
histórica de uma vez. A trava `pareceCheque` (descrição menciona cheque/compensação) já
mitiga casar com PIX/tarifa de sinal oposto, evitando precisar inferir convenção de sinal.

**How to apply:** ao espelhar um matcher de exibição num fluxo que escreve, troque
`Map<string,linha>` (first-wins) por `Map<string,linha[]>` e confirme só com `arr.length===1`.
