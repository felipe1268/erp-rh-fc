---
name: SVG LOB chart window clamping
description: Gráficos SVG indexados por linha (Linha de Balanço por pavimento) — clampar índice fora da janela colapsa várias séries numa só linha.
---

# Regra
Em gráficos SVG onde o eixo Y é um índice discreto (pavimento, faixa, categoria),
quando há mais itens do que o cap visível, NÃO clampe índices fora da janela para
a borda — isso colapsa múltiplas séries na MESMA coordenada Y e distorce a
geometria (diagonais erradas, cruzamentos falsos). Em vez disso: OMITA as séries
inteiramente fora da janela e mantenha o cap alto o bastante para o caso real.

**Why:** Code review (Rev. 2593, LinhaBalancoPavimentoChart em AnaliseEfetivoIA.tsx)
pegou PAV_CAP=24 + clamp colapsando pavimentos >24 na linha do topo. Corrigido:
PAV_CAP=60 (cobre torres reais sem distorção) + filtrar atividades cujo
min(pavInicio,pavFim) > nPav (totalmente acima da janela).

**How to apply:** Ao desenhar séries diagonais/posicionais num SVG com cap de
linhas, filtre as que não tocam a janela [1..nPav] antes de renderizar; só clampe
as que têm sobreposição parcial.
