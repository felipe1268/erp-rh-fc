---
name: SC por insumo — snapshot na seleção
description: Lookup no salvar contra query filtrada pela busca perde itens selecionados sob buscas anteriores
---
Na criação de SC "Por Insumo" (Compras), a lista `getInsumosConsolidados` é filtrada pela BUSCA atual. Qualquer lógica que, no salvar, faça lookup do insumo selecionado dentro de `insumosConsolidadosQ.data` falha para itens escolhidos sob buscas anteriores — o fallback silencioso gravava `descricao = código` e `unidade = 'un'`.

**Regra:** capture snapshot dos dados do insumo (descricao/unidade/precoMedio/nº composições) no momento da SELEÇÃO (`insumoMeta` em Solicitacoes.tsx) e use `data ?? snapshot` no salvar; se nenhum nome disponível, bloquear o save com toast (nunca persistir código como nome).

**Como aplicar:** qualquer novo caminho que sete `insumoQtds` deve chamar `snapInsumoMeta(ins)`; padrão geral: nunca fazer lookup pós-fato em query paginada/filtrada por texto para enriquecer dados de itens já escolhidos.
