---
name: Array params in SQL — use IN, not ANY with JS arrays
description: JS arrays passed as parameters cause SQL errors in both Drizzle sql`` and dbExecute raw SQL; always inline integer IDs or use IN().
---

## Rule

Never pass a JS array as a single SQL parameter expecting `ANY($N::type[])` to work — it breaks in **both** contexts:

1. **Drizzle `sql`` ` template**: interpolating `${arr}` expands to comma-separated placeholders `$2, $3, $4`. So `ANY(${arr}::text[])` becomes `ANY($2, $3::text[])` — **invalid SQL** (`ANY()` takes ONE array arg).

2. **`dbExecute(db, sqlStr, params)`**: passing a JS array as one element of the params array (e.g. `[[1,2,3], companyId]`) causes PostgreSQL to receive a "record" type — **pg error 42846 (`cannot cast type record to integer[]`)** or **22P02 (`malformed array literal`)**.

## Fix

For "id in list" filters, **inline the integer IDs directly** in the SQL string — safe because they're numbers:

```typescript
// ✅ CORRECT — integers inlined, no injection risk
const entRes = await dbExecute(db,
  `SELECT ... WHERE id IN (${ids.map(Number).join(",")}) AND company_id=$1`,
  [companyId]);

// ❌ WRONG — JS array as param fails at runtime
const entRes = await dbExecute(db,
  `SELECT ... WHERE id = ANY($1::int[]) AND company_id=$2`,
  [ids, companyId]);  // pg error 42846
```

For Drizzle `sql`` ` template, use `IN (${arr})` (Drizzle expands correctly for IN):

```typescript
db.execute(sql`SELECT ... WHERE id IN (${arr})`)  // ✅
db.execute(sql`SELECT ... WHERE id = ANY(${arr}::int[])`)  // ❌
```

Always guard empty arrays with zod `.min(1)` so you never emit `IN ()`.

**Why:** `analisarLoteSugestoesComIA` batch mutation hit this — single-entry paths never broke because there was no array. Error only appears at runtime (pg executes the query), not at TS compile time.

**How to apply:** any new query that filters by a list of IDs from user input must inline numeric IDs or split into individual queries. Reserve `$client.query` with native PG array format (`'{1,2,3}'`) only if you can't inline safely.

Related: `drizzle-execute-no-param-bind.md`, `dbexecute-positional-binding.md`.
