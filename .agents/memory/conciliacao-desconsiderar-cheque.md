---
name: Desconsiderar cheque devolvido do %
description: Como tirar um par de cheque devolvido do cálculo do % de conciliação sem apagar, e por que a mutation precisa de guard de elegibilidade.
---

# Desconsiderar/Reconsiderar cheque devolvido da conciliação

Cheque devolvido = par compensação(débito) + devolução(crédito), saldo zero. Quando o
pagamento real saiu por PIX/TED conciliado em OUTRA conta, esse par fica `conciliado=0`
na conta original e trava o % abaixo de 100% (% = `conciliadas/total` sobre
`bank_statement_lines WHERE excluido_em IS NULL`).

Solução: flag dedicado `desconsiderado_em` (≠ `excluido_em` soft-delete) — tira o par do %
mas mantém a linha VISÍVEL. TODAS as superfícies de % devem filtrar `desconsiderado_em IS NULL`.

**Regra de ouro (guard de elegibilidade):** uma mutation que recebe `lineIds[]` e os tira do
cálculo do % NÃO pode confiar só no tenant guard de empresa. Sem validar que os ids formam
de fato um par de cheque devolvido, qualquer chamada direta de API removeria linhas
arbitrárias do %, adulterando o KPI (autorização por escopo de recurso, intra-tenant).

**Como aplicar:** antes do UPDATE, buscar as linhas e exigir exatamente 2 (1 débito + 1 crédito),
mesmo valor absoluto, e espelhar os predicados de `detectarParesEstorno`
(`pareceCompensacaoCheque` no débito, `pareceDevolucaoCheque` no crédito) — esses são os
mesmos predicados que fazem o par aparecer na UI, então não geram falso-negativo p/ par legítimo.
Bloquear se algum já `conciliado=1`.
