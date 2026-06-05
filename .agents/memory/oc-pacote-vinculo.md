---
name: OC por pacote — vínculo da solicitação
description: Regra de geração de OC a partir de cotação por pacote — como tratar respostas zeradas sem perder o vínculo nem quebrar o total.
---

Em **cotação por PACOTE**, o fornecedor consolida os valores em poucas linhas e deixa as demais
respostas ZERADAS (qtd 0 E preço 0). Essas linhas são gravadas de propósito por `isPacoteChildZero`
em `salvarRespostasLote` (server/routers/compras.ts) — isso mantém o MAPA de cotação agrupado/correto.
NÃO mexer no `salvarRespostasLote`/`isPacoteChildZero`: alterá-lo muda o mapa.

Na geração da OC (`criarOrdemDeCotacao`), uma resposta zerada deve ser tratada como "não cotada":
manter a **quantidade da solicitação** (`it.quantidade` → restaura o vínculo) mas com **preço/total 0**.

**Why:** se a linha zerada herdar o preço da solicitação (`it.precoUnitario`), a soma das linhas
diverge do `oc.total` — que é calculado de `cot.total` (`subtotalItens = cot.total - frete`), NÃO da
soma dos itens. As parcelas financeiras usam `oc.total`, então injetar preço fantasma quebra a
contabilidade. Usar preço 0 preserva a paridade.

**How to apply:** gatear SEMPRE em pacote (`ordemTipo === "pacote" || cot.tipo === "pacote"`) — para
material/serviço uma resposta 0/0 deve seguir o comportamento legado (sem fallback), senão muda a
semântica fora do escopo. Itens SEM resposta mantêm o fallback antigo (`it.quantidade`/`it.precoUnitario`).

OCs já geradas antes do fix continuam zeradas (R-001/R-007/R-010: sem UPDATE/DELETE em produção) →
o usuário precisa REGERAR a OC pela aplicação.
