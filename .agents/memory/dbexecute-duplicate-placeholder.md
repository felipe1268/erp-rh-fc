---
name: dbExecute duplicate placeholder → 42601
description: Repeating the same $N placeholder twice in a dbExecute query causes a PostgreSQL syntax error.
---

## Rule

Never repeat the same `$N` placeholder twice in a query string passed to `dbExecute`.

## Why

`dbExecute` (financial.ts) splits the query string by regex `/\$\d+/g` and rebuilds it using Drizzle `sql` templates, assigning `params[i-1]` for each split point. If `$6` appears twice, the split produces 8 parts for only 6 params → `params[6] = undefined` → Drizzle emits an empty token in that position → Postgres receives `col=)` → **42601 syntax error at or near ")"**.

Confirmed instance: `AND ($6::numeric IS NULL OR saldo_apos=$6)` in the bank statement dedup query broke ALL PDF extrato imports.

## How to apply

- If you need the same value in two positions, use distinct placeholder numbers (`$6` and `$7`) and pass the value **twice** in the params array.
- Example fix: `($6::numeric IS NULL OR saldo_apos=$7)` with `params = [..., salParam, salParam]`.
- This applies to any query going through `dbExecute`; raw `db.$client.query` does not have this issue.
