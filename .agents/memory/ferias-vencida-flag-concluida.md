---
name: Férias — flag vencida em período concluído
description: A flag vacation_periods.vencida deve ser ignorada quando status é concluida/cancelada; geradores históricos gravavam concluida+vencida=1.
---
Regra: em qualquer leitor (UI ou server), o período só conta como pendência se `status IN ('pendente','vencida')` — a flag `vencida=1` sozinha NÃO basta quando o status é `concluida`/`cancelada`.

**Why:** o gerador de períodos históricos ("antigoPreSistema") criava linhas `status='concluida'` mas com `vencida=1`; a Lista de Férias priorizava qualquer linha com a flag e mostrava o período de 2011 como linha principal do colaborador. Limpeza feita 08/08/2026 (205 linhas) + quitação histórica de 80 períodos vencidos (exceto Ana Beatriz, emp 7, gargalo real mantido).

**How to apply:** todo writer que marca concluida/cancelada deve zerar `vencida`; todo leitor que classifica pendência deve checar o status antes da flag. Geração de períodos (Rev. 4916): período com concessivo já vencido nasce `concluida` com gozo presumido, nunca pendência antiga.
