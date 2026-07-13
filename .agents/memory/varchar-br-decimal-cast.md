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

Sempre usar `REPLACE(col, ',', '.')::numeric` ao fazer cast de colunas VARCHAR para numeric:

```sql
-- Errado
COALESCE(pp."salarioBrutoMes"::numeric, 0)

-- Correto
COALESCE(REPLACE(pp."salarioBrutoMes", ',', '.')::numeric, 0)
```

Compatível com ambos os formatos:
- `"680,75"` → `"680.75"` → `680.75` ✓
- `"2723.76"` → `"2723.76"` → `2723.76` ✓
- `NULL` → COALESCE → `0` ✓

## Tabelas afetadas (confirmado)

- `payroll_payments`: `salarioBrutoMes`, `horasExtrasValor`, `adicionaisValor`, `descontoInss`, `descontoFgts`, `totalProventos`, `totalDescontos`, `salarioLiquido`
- `vr_benefits`: `valorTotal`, `valorVa`
- `vacation_periods`: `valorTotal`
- `employees`: `salarioBase`, `seguroVida`

**Why:** Os dados foram importados de planilhas Excel com locale BR (vírgula decimal) e a coluna de banco é VARCHAR, não NUMERIC — então o PostgreSQL aceita qualquer string mas rejeita na hora do cast.

**How to apply:** Toda nova query que faz `col::numeric` em qualquer das tabelas acima deve usar o REPLACE. Em caso de dúvida, testar direto no Neon antes de confiar no "silêncio" da UI.
