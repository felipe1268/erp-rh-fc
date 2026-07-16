---
name: ORDER BY alias-in-expression throws in Postgres
description: Why `ORDER BY (aliasA+aliasB)` fails with "column does not exist" and how dashboard endpoints amplify it
---

## Rule
In PostgreSQL, an output-column alias is only recognized in `ORDER BY` when used
**alone** (`ORDER BY despesas`). Inside an **expression** (`ORDER BY (despesas+receitas)`),
the identifier resolves against the **input** columns of FROM/JOIN, not the SELECT
aliases. If no input column has that name → `column "despesas" does not exist` at runtime.

**Fix:** wrap the aggregation in a subquery and put the composite `ORDER BY` in the
outer query, where the aliases are real columns:
```sql
SELECT nome, qtd, despesas, receitas
  FROM ( SELECT ... SUM(...) AS despesas, SUM(...) AS receitas ... GROUP BY 1 ) t
 ORDER BY (despesas + receitas) DESC LIMIT 15
```

**Why:** this is a SQL-standard scoping rule, not a quirk — bare alias is a special
ORDER BY allowance; expressions are evaluated in the input scope.

**How to apply:** grep `ORDER BY \([a-z_]+ ?\+ ?[a-z_]+\)` style ordering over
aggregate aliases. Validate raw SQL directly against Neon (`node ./script.cjs`) — the
error only surfaces at execution, so `tsc` won't catch it.

## Also applies to UNION ALL ORDER BY
`CASE status WHEN 'em_uso' THEN 0 … END` at the end of a `UNION ALL` is the same
failure mode: `status` is an output alias, but inside the CASE expression it resolves
against the input scope → "column status does not exist". Scorecard locações query
(scorecard.ts) was silently returning `[]` because `safe()` caught this error.
Fix: wrap the entire UNION in `SELECT * FROM (…) _loc` and apply ORDER BY outside.

## Amplifier — sequential queries without try/catch empty the WHOLE dashboard
`getConciliacaoDashExtra` (server/routers/financial.ts) runs ~6 sub-queries with
sequential `await` and NO per-query try/catch. A throw in any ONE of them (e.g. the
obras ORDER BY above) aborts the entire endpoint → the tRPC query errors → frontend
`extra` is undefined → EVERY card (categorias, fornecedores, obras) falls back to its
empty state, even the queries that ran fine. Symptom looks like "wrong data / no data"
but is really one broken query. When a multi-card dashboard goes ALL-empty at once,
suspect a single thrown sub-query, not missing data. Consider `Promise.allSettled` /
per-query try/catch returning `[]` to localize future failures.
