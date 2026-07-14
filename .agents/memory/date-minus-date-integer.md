---
name: date minus date is integer not interval
description: No PostgreSQL, (date - date) retorna INTEGER, não interval. EXTRACT(days FROM integer) não existe e o safe() engole o erro silenciosamente.
---

## Regra

No PostgreSQL, subtrair duas datas retorna um **INTEGER** (número de dias), não um `interval`.

```sql
-- ERRADO: EXTRACT espera interval, não integer
EXTRACT(days FROM (data_fim::date - data_inicio::date))

-- CORRETO: a subtração já é o número de dias
(data_fim::date - data_inicio::date)
```

**Why:** `EXTRACT(days FROM X)` só funciona com `interval`. Com `integer` o Postgres joga `pg_catalog.extract(unknown, integer) does not exist`. Se o código estiver dentro de um bloco `safe()`, o erro é capturado silenciosamente e retorna `[]`, sem nenhum log de aviso visível no servidor.

**How to apply:** Sempre que calcular número de dias entre duas datas para usar em aritmética (ex.: `valor_mensal * dias / 30`), use `(date1 - date2)` diretamente — o resultado já é `integer`. Nunca envolva em `EXTRACT(days FROM ...)`.

Para diagnóstico de `safe()` retornando `[]`: rodar a query diretamente no Neon via Node/pg é o caminho mais rápido — logs de runtime do servidor podem não capturar o `console.warn` do safe() dependendo do nível de log.
