---
name: Drizzle sql`` array expansion — use IN, not ANY
description: Interpolating a JS array into a Drizzle sql`` template expands to comma-separated placeholders; ANY() breaks, IN() works.
---

When you interpolate a JS array into a Drizzle `sql`` ` template (e.g. `db.execute(sql`... ${arr} ...`)`), Drizzle expands the array into **comma-separated placeholders** — `$2, $3, $4`, NOT a single array param.

- `WHERE col = ANY(${arr}::text[])` → renders `ANY($2, $3::text[])` → **invalid SQL** (`ANY()` takes ONE array arg, not a list).
- `WHERE col IN (${arr})` → renders `IN ($2, $3)` → **valid** and is exactly what the expansion produces.

**Why:** this bit batch-deletion of NPS evaluation links (`excluirLinksAvaliacao`) — single-id paths never broke because no array. Spotted as `ANY($2, $3::text[])` in a failed-query error.

**How to apply:** for "id in list" filters built with Drizzle's `sql`` `, always use `IN (${arr})`. Guard empty arrays (zod `.min(1)`) so you never emit `IN ()`. If you truly need `= ANY(array::type[])`, you must pass the array as a single param via the pg client (`db.$client.query`), not the `sql`` ` array interpolation.

Related: `drizzle-execute-no-param-bind.md`, `dbexecute-positional-binding.md`.
