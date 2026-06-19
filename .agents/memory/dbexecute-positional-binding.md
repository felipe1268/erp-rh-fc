---
name: dbExecute binds params by appearance order, NOT by $N number
description: financial.ts dbExecute helper gotcha that silently corrupts UPDATEs when placeholder numbers don't match array order
---

The `dbExecute(db, query, params)` helper in `server/routers/financial.ts` does
`query.split(/\$\d+/g)` and assigns `params[i-1]` to the i-th placeholder **in
left-to-right text order**. The actual number in `$N` is IGNORED (it is cosmetic).

**Why this bites:** a natural-looking pattern is to keep WHERE clause params at
fixed low numbers (`WHERE id=$7 AND company_id=$8`) and append new SET columns at
higher numbers (`juros=$9, ...`). That compiles and looks correct, but because the
SET clause appears before the WHERE in the text, the params array MUST be ordered
SET-values-first then WHERE-values-last. If you order the array by the `$N` numbers
instead, juros/descontos receive id/companyId and the WHERE gets garbage → 0 rows
updated or silent wrong update. No error is thrown.

**How to apply:** when adding columns to any `dbExecute` UPDATE/INSERT, renumber
ALL placeholders sequentially in text order ($1,$2,...) and order the params array
to match that exact appearance order. Same rule for repeated values in CTEs (use
distinct sequential $N, list the value again in the array at its position).

**SKIPPING a $N + reusing a shared array is the same trap (a SELECT variant).**
When several queries share one params array (e.g. `p=[company,conta,dataIni,dataFim]`)
but one query filters `conta_bancaria_id IS NULL` and so OMITS `$2`, leaving
placeholders `$1,$3,$4`, dbExecute still binds by appearance: `$1`←company, then the
NEXT placeholder (a DATE comparison) ←conta. Symptom: `22007 invalid input syntax
for type date: "<contaId>"` and the whole report 500s. Fix: give that query its OWN
array WITHOUT the skipped element and renumber to $1,$2,$3. Don't reuse the shared
array whenever a query drops a placeholder.

**REUSING the same $N twice in one query is the same trap (UPDATE/CASE variant).**
Writing the same value as `$1` in two spots (e.g. `SET cartao_id=$1, observacao = CASE
WHEN $1::int IS NULL ...`) creates TWO appearance slots but you only pass it once in the
array → every later placeholder shifts down by one and the LAST one (often `company_id`)
ends up empty (`company_id= AND`) → invalid SQL / "Failed query". Fix: give each
appearance its OWN sequential placeholder and REPEAT the value in the array at its
position (`...cartao_id=$1, CASE WHEN $2::int..., WHERE id=$3 AND company_id=$4` with
`[cartaoId, cartaoId, id, companyId]`). Never reuse a `$N`.

**Arrays as params = SILENT EXPANSION (PG error 42846 "cannot cast type record to integer").**
Because `dbExecute` interpolates each param via Drizzle `sql\`...${val}\``, passing a
JS ARRAY does NOT bind a single Postgres array — Drizzle expands it into
comma-separated placeholders `$a, $b, $c`. So `id = ANY($N::int[])` with an array
param becomes `ANY($a, $b, $c::int[])` = `ANY(ROW(...))` → 42846. Do NOT use
`ANY($N::int[])` with this helper. Use the file's `inlineIds(idList)` helper:
`id IN (${inlineIds(idList)})` (safe only because idList is pre-filtered with
`Number.isInteger(n) && n > 0`). Bit bulkBaixa/bulkEstornar/bulkUpdateStatus.
