---
name: valorEstimadoTotal persistido fica defasado
description: A coluna persistida do total da rescisão congela na criação do aviso; 3 superfícies devem recalcular ao vivo.
---

A coluna `termination_notices.valorEstimadoTotal` é gravada só em
create/update(recalcular)/recalcularTodos do aviso prévio. Quando salário
ou férias do funcionário mudam DEPOIS, ela fica defasada.

**Regra:** qualquer superfície que mostra o "total estimado da rescisão"
deve RECALCULAR ao vivo (`calcularRescisaoCompleta` + `diasFeriasNoMesDaSaida`
+ batch de férias vencidas), nunca ler a coluna direto. São 3 superfícies:
- endpoint `list` (página Aviso Prévio) — já recalculava;
- `getById` (ficha "Cálculos da Rescisão" / "SUBTOTAL PROVENTOS") — recalcula
  a previsão, mas precisa devolver `valorEstimadoTotal: previsao.total` (não `...row`);
- `homeData` (card "Avisos Prévios em Andamento" da home) — deve montar um
  `recomputedTotalMap` com a MESMA lógica do `list`, fallback à coluna se falhar.

**Why:** divergência reportada (caso Mariana): card R$ 11.166,82 × subtotal
R$ 19.391,67. Card/getById liam a coluna congelada; subtotal recalculava.

**Ressalva:** o card da home usa a régua-base do `list` (sem ajustes de
FGTS real/novo emprego que só o `getById` aplica) — convergem no caso-base.
