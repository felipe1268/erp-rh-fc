---
name: Dissídio pulou funcionários não-Ativos
description: Aplicação do Dissídio 2026 (60002) deixou gente de fora sem registro; backfill manual feito em ago/2026
---
A aplicação do Dissídio Coletivo 2026 (dissidioId=2, empresa 60002, 18/06/2026) deixou vários funcionários **sem nenhuma linha** em `dissidio_funcionarios` (nem "excluido") — provavelmente o filtro da época pegava só status "Ativo"; Afastado/Recluso/Ferias e admitidos depois ficaram fora.

**Backfill (03/08/2026, aprovado pelo user):** 5 serventes a R$ 2.189,00 → 2.301,73 + valorHora 10,46 + linha em dissidio_funcionarios (ids 420083 Luis Claudio, 9 Daniel, 420123 Willians, 420137 Carlos Alberto, 420145 Regis).

**Ainda sem registro (user não confirmou se já foram ajustados manualmente):** Marcio de Toledo 420065, Anderson dos Anjos 420056, Jerryaliton 420077, Silvio 420140, Irael 420102, Emerson 420108.

**Gotchas:** `dissidio_funcionarios.aplicadoEm` é timestamp (usar now(), não string); valores monetários em formato BR ("2.301,73") em employees e na tabela do dissídio; retroativo dos backfillados NÃO foi lançado (mesesRetroativos=0).

**How to apply:** ao auditar dissídio, comparar elegíveis (status NOT IN desligados, tipoContrato<>PJ) × linhas do dissídio — ausência total de linha = pulado silenciosamente.
