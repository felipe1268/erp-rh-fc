---
name: VARCHAR BR decimal cast
description: Numeric columns stored as VARCHAR may contain Brazilian comma-decimal format; direct ::numeric cast fails silently via Promise.all rejection.
---

# Regra: REPLACE(',','.')::numeric para colunas VARCHAR numéricas

## O problema

Tabelas como `payroll_payments`, `vr_benefits`, `vacation_periods`, `employees` armazenam valores numéricos como **VARCHAR**. Alguns registros usam vírgula como separador decimal (formato BR: `"680,75"`).

O cast direto `col::numeric` falha com:
```
ERROR: invalid input syntax for type numeric: "680,75"
```

Quando isso ocorre dentro de um `Promise.all`, a Promise inteira rejeita → o endpoint tRPC lança exceção → `query.data` fica `undefined` → a UI mostra "Sem dados" **silenciosamente** (sem nenhuma mensagem de erro visível ao usuário).

## A regra

Colunas VARCHAR que deveriam ser numéricas podem conter:
- Valores com vírgula BR: `"680,75"` → falha em `::numeric`
- Valores com ponto de milhar BR: `"2.774,20"` — REPLACE(',','.') sozinho vira `"2.774.20"` (dois pontos) → ainda falha!
- Valores não-numéricos: `"sim"` → falha em `::numeric` mesmo com REPLACE

**REGRA DEFINITIVA para salários BR com ponto de milhar:**
```sql
REPLACE(REPLACE(COALESCE(e."salarioBase",'0'),'.',''),',','.')::numeric
```
1. Remove TODOS os pontos (separador de milhar): `"2.774,20"` → `"2774,20"`
2. Troca vírgula por ponto (decimal): `"2774,20"` → `"2774.20"` ✓

O padrão com `CASE WHEN` é mais seguro para colunas com valores mistos texto:

```sql
-- Errado (falha com "680,75" ou "sim")
COALESCE(pp."salarioBrutoMes"::numeric, 0)

-- Errado para "2.774,20" — produz "2.774.20" (dois pontos) → crash
REPLACE(col, ',', '.')::numeric

-- CORRETO para salários BR (ponto milhar + vírgula decimal)
REPLACE(REPLACE(COALESCE(col,'0'),'.',''),',','.')::numeric

-- CORRETO — seguro contra vírgula BR E valores texto livres
COALESCE(
  CASE WHEN pp."salarioBrutoMes" ~ '^-?[0-9]'
    THEN REPLACE(REPLACE(pp."salarioBrutoMes",'.',''),',','.')::numeric
    ELSE NULL END,
  0
)
```

Compatível com todos os formatos BR:
- `"2.774,20"` → remove pontos → `"2774,20"` → troca vírgula → `2774.20` ✓
- `"680,75"` → remove pontos → `"680,75"` → troca vírgula → `680.75` ✓
- `"2774.20"` → remove pontos → `"277420"` → sem vírgula → `277420` ⚠ (improvável em dados BR)
- `NULL` → COALESCE → `0` ✓

## Tabelas afetadas (confirmado)

- `payroll_payments`: `salarioBrutoMes`, `horasExtrasValor`, `adicionaisValor`, `descontoInss`, `descontoFgts`, `totalProventos`, `totalDescontos`, `salarioLiquido`
- `vr_benefits`: `valorTotal`, `valorVa`
- `vacation_periods`: `valorTotal`
- `employees`: `salarioBase`, `seguroVida`

**Why:** Os dados foram importados de planilhas Excel com locale BR (vírgula decimal) e a coluna de banco é VARCHAR, não NUMERIC — então o PostgreSQL aceita qualquer string mas rejeita na hora do cast.

**How to apply:** Toda nova query que faz `col::numeric` em qualquer das tabelas acima deve usar o REPLACE. Em caso de dúvida, testar direto no Neon antes de confiar no "silêncio" da UI.
