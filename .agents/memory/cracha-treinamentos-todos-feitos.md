---
name: Crachá — pills de treinamentos = TODOS os feitos
description: Regra de ouro do usuário sobre quais treinamentos aparecem no crachá
---

Regra: as pills de treinamentos no crachá listam TODOS os treinamentos que o
funcionário FEZ — inclusive vencidos e sem data de validade. Nunca filtrar
por `dataValidade >= hoje` nessa lista.

**Why:** regra de ouro do usuário (26/07/2026) — o crachá é o histórico de
formação, não um status de aptidão. Filtrar por vigência sumiu com
treinamentos realizados e o usuário reclamou.

**How to apply:** em badgeStatus, separar dois conceitos: pills = todos os
registros (dedup por rótulo canônico NR-XX); selos NR-35/NR-10 e a pendência
"Nenhum treinamento vigente" = SÓ vigentes (aptidão atual).
