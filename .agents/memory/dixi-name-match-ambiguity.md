---
name: DIXI match por nome — ambiguidade ampla
description: Match primeiro+último nome pode creditar batidas ao funcionário errado quando outro nome contém os mesmos tokens.
---

Regra: no matchEmployee (fechamentoPonto.ts), casar "Primeiro + Último" só é seguro se NENHUM outro funcionário contiver todos os tokens do nome DIXI. Se >1 contém todos, retorna null → "Não Identificados" e o usuário vincula manualmente (dixi_name_mappings tem prioridade máxima e resolve dali em diante).

**Why:** "Alex Silva" casava por sufixo com ALEX ALESSANDRO MONTEIRO DA SILVA, mas o correto era ALEX DA SILVA DOMINGOS (também contém ALEX+SILVA). As batidas foram para o funcionário errado por semanas e o certo acumulou faltas — silêncio total, sem inconsistência.

**How to apply:** qualquer nova heurística de match por nome deve computar o conjunto "contém todos os tokens" e tratar >1 como ambíguo, nunca desempatar por posição/sufixo. Correção de dados exige REIMPORTAR o período (as batidas erradas ficam no time_records do outro funcionário). Vínculos seed podem ser inseridos direto em dixi_name_mappings (lookup usa normalizeGroupKey, preserva dígitos).
