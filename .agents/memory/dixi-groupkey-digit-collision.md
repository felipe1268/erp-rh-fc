---
name: DIXI group-key digit collision
description: Relógios de ponto podem ter CÓDIGOS internos (jfcNNN) no campo Nome; chaves de agrupamento por pessoa não podem remover dígitos.
---

Regra: qualquer chave de AGRUPAMENTO por pessoa em imports de ponto deve usar `normalizeGroupKey` (preserva dígitos), nunca `normalizeNameForMatch` (remove dígitos, é só para casar NOMES reais).

**Why:** Relógio DIXI da obra foi configurado com o código interno no campo Nome ("jfc063", "jfc066"). A normalização de nome virava "JFC" para ambos → batidas de 2 funcionários fundidas num grupo só, atribuído ao primeiro; o outro ficava zerado e o primeiro herdava horários quebrados (pares 06:52/06:54/06:57, inconsistências).

**How to apply:** Ao agrupar registros de ponto por pessoa (processRecords, memoryMappings, lookups de não-identificados), preserve dígitos na chave. O preview agrupa por nome bruto e por isso "parece certo" mesmo quando o import quebra — divergência preview × import é sintoma desse tipo de bug. Correção de dados corrompidos = reimportar o mesmo .xls (replace_all regrava fonte='dixi'; manuais preservados).
