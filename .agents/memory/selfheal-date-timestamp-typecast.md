---
name: Self-heal UPDATE date/timestamp typecast
description: Why a [SyncSchema+] cure UPDATE can silently no-op when writing to date/timestamp columns
---

When a `[SyncSchema+]` self-heal UPDATE (or any raw `db.execute(sql\`...\`)`) writes
into a **date** or **timestamp** column, you MUST give a value of the matching type —
NOT `to_char(...)` (which yields `text`).

- date column → `(now() AT TIME ZONE 'UTC')::date` (or `CURRENT_DATE`)
- timestamp column → `now()`

**Why:** Postgres throws `column "X" is of type date but expression is of type text`.
In `server/_core/index.ts` every self-heal block is wrapped in try/catch, so the error
is swallowed and only logged as `FALHA Rev.N`. The captured `[SyncSchema+]` log file is
**capped** (one long sequential block), so the FALHA line is often NOT visible. Net effect:
the cure appears to "do nothing" with no obvious error. (Bitten on Rev. 3272 obra_sns dedup:
wrote `to_char(...)` into `dataLiberacao` (date) + `updatedAt` (timestamp) → cure never ran.)

Note: `date({mode:'string'})` / `timestamp({mode:'string'})` in drizzle only change how JS
READS the column (as a string); the underlying Postgres column type is still date/timestamp,
so writes still need the correct type.

**How to apply:** When a cure UPDATE "has no effect" on the live DB, run the EXACT same SQL
directly against Neon (pg client, NOT the executeSql tool which hits Replit PG) to surface
the real error instead of trusting the capped log. UPDATE-only cures are allowed under
R-001/007/010; ALTER/DROP/DELETE are not. `CREATE [UNIQUE] INDEX IF NOT EXISTS` is allowed
(additive) and is the project's standard atomic guard against duplicate-row recurrence
(create it AFTER the dedup UPDATE so the data is already unique).
