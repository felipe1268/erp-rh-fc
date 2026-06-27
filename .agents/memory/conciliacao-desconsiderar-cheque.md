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

## "Erro ao desconsiderar / Unexpected end of JSON input" = queda de transporte, NÃO erro de regra

Esse toast vem do cliente tRPC tentando `Response.json()` sobre um corpo HTTP VAZIO — a
requisição caiu no transporte (servidor reiniciando, conexão instável), não é erro de
negócio (erros de regra voltam JSON com mensagem legível). A alteração pode até ter sido
aplicada. As mutations `desconsiderarChequeDevolvido`/`reconsiderarChequeDevolvido` são
IDEMPOTENTES (UPDATE guardado por `desconsiderado_em IS NULL`/`IS NOT NULL`), então o
tratamento certo no `onError` é: detectar a queda de transporte
(json/failed to fetch/load failed/networkerror/aborted), RECARREGAR as superfícies de %
(o estado real do servidor) e mostrar aviso PT "Conexão instável" em vez do erro técnico em
inglês; erros de negócio seguem mostrando a mensagem real.
**Why:** o usuário lia um erro críptico em inglês mesmo quando a ação possivelmente funcionou.
