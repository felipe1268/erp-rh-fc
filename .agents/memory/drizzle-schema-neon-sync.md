---
name: Adding a column to Drizzle schema requires an explicit Neon self-heal guard
description: Why adding a column to drizzle/schema.ts can silently break a list query in this ERP, and where to add the guard.
---

# Adding a column to a Drizzle table → must also guarantee it in Neon

**Tabelas NOVAS idem:** o SyncSchema automático NÃO cria tabela nova. Toda tabela
adicionada a `drizzle/schema.ts` precisa de um bloco `[SyncSchema+] Rev. N` manual
em `server/_core/index.ts` (~linha 960+) com `CREATE TABLE IF NOT EXISTS` + índices,
em try/catch isolado. Confirmado nas Rev. 4669 (rh_documentos) e 4672
(employee_dependentes, avaliacao_pdis, avaliacao_feedbacks). Verifique a criação
via pg direto no Neon — o log [SyncSchema+] é capado (~49 linhas).

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

**Column NAME casing — camelCase, not snake_case:** in this codebase a `pgTable`
declared WITHOUT an explicit name string per column (e.g. `integer()`, `varchar()`)
makes Drizzle use the JS key VERBATIM as the column name. So such tables (e.g.
`backups`: `iniciadoPor`, `tabelasExportadas`, `tamanhoBytes`, `s3Key`,
`concluidoEm`) live in Neon as **camelCase, case-sensitive** identifiers. Two traps
follow: (1) raw SQL (`db.execute(sql\`...\`)`) and the self-heal `ADD COLUMN`
MUST quote the camelCase name (`"tabelasTotal"`); writing snake_case
(`tabelas_total`, `iniciado_por`) hits a non-existent column and the INSERT/UPDATE
throws `column ... does not exist`. (2) a self-heal that adds the new column in
snake_case while the schema declares camelCase makes `db.select()` (which selects
the camelCase name) break too. Match the schema's exact casing, quoted. NOTE:
other tables created via raw `CREATE TABLE` (e.g. `backup_snapshots`) ARE
snake_case and self-consistent — check how each table was actually created before
assuming a convention.

**The reverse trap (timestamp default columns):** a table created via raw
`CREATE TABLE` with snake_case `created_at`/`updated_at`, but whose Drizzle schema
declares `createdAt: timestamp({ mode: 'string' })` (NO name arg), makes Drizzle
emit `"createdAt"` in `db.select()` → `column "createdAt" does not exist`, breaking
EVERY proc on that table (list/get/save). Fix = give the schema column an explicit
snake name: `timestamp("created_at", ...)`. Watch the auto-default columns
(`createdAt`/`updatedAt`) specifically — they're the ones people leave unnamed.
Also: `[SyncSchema]` auto-introspection does NOT add missing columns to a
PRE-EXISTING table here (it logged "todas as colunas OK" while 9 ISO columns were
absent) — always add explicit `[SyncSchema+]` ALTER guards AND extend the
`CREATE TABLE IF NOT EXISTS` DDL for fresh DBs; verify by introspecting Neon after
a restart, never trust the "all OK" log.

**The version-gated atomic block trap (NEVER put new column self-heals there):**
there is a SECOND, OLDER self-heal block (`[ColFix] Bloco2`) that is (a)
VERSION-GATED — when the DB version already matches it logs "Versão ok, pulando
migrations" and the WHOLE block is skipped — and (b) a single atomic
`DO $$ ... EXCEPTION WHEN OTHERS THEN NULL; END $$` (one failing statement rolls
back ALL the ALTERs in it, silently). Net effect: a new `ALTER` added there NEVER
runs on databases already at the current version, so the column is missing in Neon
and `db.select()` on that table throws → the list renders empty. This is exactly
how the `obras` list went blank (cols `databook_logo_*`, `numero_contrato` lived
only in Bloco2). ALWAYS put column guards in the UNGATED `[SyncSchema+]` block
instead, and each `ALTER` in its OWN try/catch so one failure can't block the rest.

**Inspecting REAL app data:** the app reads `NEON_DATABASE_URL`. The `executeSql`
tool hits a different (Replit) Postgres. To query the real Neon DB, run a node
script via bash: `new Pool({ connectionString: process.env.NEON_DATABASE_URL,
ssl: { rejectUnauthorized: false } })`. (The code_execution sandbox does NOT
expose `process.env`, so use bash + node for this.)

## Variant: explicit `db.select({ k: table.colThatIsNotInSchema })`

Same failure class, different trigger. If you write `db.select({ descricao: comprasOrdens.descricao })`
but `descricao` is NOT a declared column on that `pgTable` (the real free-text field is
`observacoes`), Drizzle resolves `comprasOrdens.descricao` to `undefined` → builds invalid SQL
→ the query THROWS at runtime. esbuild does NOT catch this (no type-check in the build path),
so it ships and only blows up when the endpoint runs. The tRPC query then errors, `useQuery.data`
stays `undefined`, and a panel whose render is gated on `data` truthiness shows NOTHING.

**How to apply:** before adding a field to an explicit `db.select({...})`, confirm the column
actually exists on that table in `drizzle/schema.ts` (grep the pgTable block). For OC free text
use `comprasOrdens.observacoes` — `comprasOrdens` has NO `descricao` column.
