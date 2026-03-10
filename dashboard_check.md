# Dashboard Check Results - 2026-03-09

## KPI Cards:
- Ativos: 149 (was 144 - now correctly includes Ferias, Afastado, Recluso etc)
- Desligados: 49 (was showing 54 - now correctly merges Lista_Negra into Desligado count)
- Advertências: 0
- Atestados: 0

## Status dos Funcionários Ativos (chart):
- Recluso: 2 (1.3%)
- Ativo: 144 (96.6%)
- Ferias: 3 (2.0%)
- NO Desligado in the chart - CORRECT!

## Distribuição por Gênero:
- F: 10 (6.7%)
- M: 138 (92.6%)
- Não informado: shown
- Total ~149 (matches Ativos count) - CORRECT! No desligados included

## Tipo de Contrato:
- CLT: 140 (94.0%)
- PJ: 9 (6.0%)
- Total ~149 - CORRECT! No desligados included

## Destaques:
- All showing active employees only - CORRECT!

## FIXES VERIFIED:
1. Desligados excluded from all analysis charts ✓
2. Lista_Negra merged into Desligado count ✓
3. Status chart shows only active statuses ✓
4. Gender/Contract charts only count active employees ✓
