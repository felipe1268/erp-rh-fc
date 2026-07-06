---
name: dbExecute / db.execute param-binding gotchas
description: Consolidated gotchas for raw-SQL param binding across dbExecute (financial.ts), db.execute, and drizzle node-postgres — silent corruption, not errors, in most cases.
---

## dbExecute (server/routers/financial.ts) binds by TEXT APPEARANCE ORDER, not by the `$N` number

`dbExecute(db, query, params)` does `query.split(/\$\d+/g)` and assigns `params[i-1]` to the i-th placeholder **in left-to-right text order** — the actual `$N` number is cosmetic and ignored.

- **Reordering trap:** SET clause appears before WHERE in text, so the params array must be ordered SET-values-first then WHERE-values-last — ordering by the `$N` numbers instead silently swaps values into the wrong columns (0 rows updated or wrong update, no error).
- **Skipped placeholder trap:** if several queries share one params array but one query omits `$2` (e.g. an `IS NULL` variant), dbExecute still binds by appearance and shifts every later value one slot left → wrong type into a column (e.g. `22007 invalid input syntax for type date`). Give that query its own array without the skipped element, renumbered.
- **Duplicate placeholder trap:** reusing the same `$N` twice in one query text creates two appearance slots but the array only supplies one value → every later placeholder shifts and an empty token lands in SQL (`col=)`) → **42601 syntax error**. Fix: give each appearance its own sequential `$N` and repeat the value in the array at both positions. Never reuse a `$N`.
- **Array param trap:** passing a JS array as one param does NOT bind a Postgres array — Drizzle expands it into comma-separated placeholders, so `ANY($N::int[])` becomes invalid SQL (42846 "cannot cast type record to integer"). Use the file's `inlineIds(idList)` helper with pre-validated integers instead.

**How to apply:** whenever adding/removing columns or params in a `dbExecute` query, renumber ALL placeholders sequentially in text order and reorder the params array to match that exact appearance order — never trust the `$N` digit alone.

## `db.execute(sql, [params])` ignores the params array entirely (drizzle node-postgres)

`db.execute()` takes **only one argument**; a second params array is silently ignored, so `$1/$2` placeholders reach Postgres unbound → `there is no parameter $1`. Confirmed in `financialKpiService.ts`. Fix: use the underlying pg pool directly (`db.$client.query(text, paramsArray)`, or the file's `q(db, text, params)` helper) for any raw `$N` query. Validating the same SQL directly via `pg`/`executeSql` will NOT reproduce this bug — it only appears on the app's `db.execute()` path, so reproduce via the actual app function, not raw SQL.

## `db.execute(sql\`UPDATE ...\`)` without `RETURNING` has unreliable `rowCount`

An UPDATE that changed 14 rows logged `rowCount 0` because no `RETURNING` clause was present. Add `RETURNING id` and count the result (`Array.isArray(r) ? r.length : (r?.rows?.length ?? r?.rowCount ?? 0)`) to get a trustworthy affected-row count. To verify real effect, query Neon directly (NEON_DATABASE_URL) — the `executeSql` tool hits the Replit Postgres, not Neon.
