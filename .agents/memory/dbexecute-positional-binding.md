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
