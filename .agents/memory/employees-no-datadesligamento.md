---
name: employees has no dataDesligamento column
description: The termination date on employees is dataDemissao / dataDesligamentoEfetiva; "dataDesligamento" belongs to a different table and resolves to undefined.
---

The `employees` table has NO `dataDesligamento` column. Its termination-related
columns are `dataDemissao` and `dataDesligamentoEfetiva`. The name
`dataDesligamento` belongs to `processos_trabalhistas`, a different table.

**Why this bites:** referencing `employees.dataDesligamento` does NOT raise a TS
error in Drizzle column expressions — it resolves to `undefined`. Two failure
modes:
- In `orderBy(desc(employees.dataDesligamento))` the undefined column makes
  Drizzle emit `ORDER BY  desc` → Postgres throws `syntax error at or near
  "desc"` and the whole query fails (a real, hard crash).
- In runtime row access (`row.dataDesligamento` from a `db.select().from(employees)`
  full-row result) it is always `undefined`, so any `row.dataDesligamento ||
  row.dataDemissao` fallback SILENTLY ignores `dataDesligamentoEfetiva` — no
  crash, just wrong/weaker "tempo fora"/carência/legal-alert semantics.

**How to apply:** for an employee's real termination date use
`dataDesligamentoEfetiva || dataDemissao` (effective date first). When selecting
for downstream code that expects a `dataDesligamento` field, alias it:
`dataDesligamento: employees.dataDesligamentoEfetiva`. Never write
`employees.dataDesligamento`.
