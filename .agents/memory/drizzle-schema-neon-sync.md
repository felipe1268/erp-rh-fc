---
name: Adding a column to Drizzle schema requires an explicit Neon self-heal guard
description: Why adding a column to drizzle/schema.ts can silently break a list query in this ERP, and where to add the guard.
---

# Adding a column to a Drizzle table → must also guarantee it in Neon

Adding a column to a table in `drizzle/schema.ts` is NOT enough for this app. The
generic `[SyncSchema]` startup step does NOT cover every table (e.g. it does not
cover `clientes`). When it skips a table, the new column never gets created in
the Neon DB.

**Why this breaks things:** most routers list rows with `db.select().from(table)`
(no explicit column list). Drizzle compiles that to `SELECT <every column in the
schema> FROM table`. If the schema declares a column that does not exist in Neon,
the query throws at runtime and the frontend renders an EMPTY list (e.g. "0
clientes") — it looks like data was deleted, but the data is intact; only the
query is broken.

**How to apply:** whenever you add a column to a table in `drizzle/schema.ts`,
ALSO add an explicit additive guard in the `[SyncSchema+]` block in
`server/_core/index.ts`:
`ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>` (wrapped in try/catch
with a `[SyncSchema+] Rev. NNNN ...` log line). This is additive only — never
ALTER/DROP/DELETE (R-001/R-007/R-010). The guard runs on every startup, so it
self-heals dev AND production (production has its own Neon DB).

**Inspecting REAL app data:** the app reads `NEON_DATABASE_URL`. The `executeSql`
tool hits a different (Replit) Postgres. To query the real Neon DB, run a node
script via bash: `new Pool({ connectionString: process.env.NEON_DATABASE_URL,
ssl: { rejectUnauthorized: false } })`. (The code_execution sandbox does NOT
expose `process.env`, so use bash + node for this.)
