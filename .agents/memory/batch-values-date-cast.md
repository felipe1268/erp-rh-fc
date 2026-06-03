---
name: Batch VALUES date<text silent-zero bug
description: Counting queries that build a (VALUES (...)) tuple set and compare its column to a DATE column throw "operator does not exist: date < text" and a surrounding try/catch silently zeroes ALL counts.
---

# Batch `(VALUES (...))` vs DATE column = silent-zero trap

When a count/aggregate is built as a batch with `(VALUES (id1,'2026-06-13'), ...) AS p(emp_id, data_fim)` and then joined/compared against a real DATE column (e.g. `vp."periodoAquisitivoFim" < p.data_fim`), Postgres infers `p.data_fim` as **TEXT** and raises `operator does not exist: date < text`. The whole query fails.

**Why it's dangerous:** these batch counters are usually wrapped in a `try/catch` that, on error, leaves the result Map empty → every key reads as 0. So the bug is **silent**: no crash, just wrong (under)counts everywhere the batch is used, while a sibling endpoint that binds the same date as a typed parameter (`< ${dataFim}` → `$N`) works fine. Real incident: home card / "Aviso Prévio" list showed 0 férias vencidas while the rescisão ficha (getById, typed param) showed 1 → values diverged.

**How to apply:** in any batch `(VALUES ...)` tuple that feeds a date comparison, cast the column explicitly: `p.data_fim::date` (do it on every comparison — `<` and `>`). Parameterized single queries (`${x}`) don't need it because the driver carries the type. The Map key (`emp_id|data_fim`) keeps matching because the cast is only in the WHERE/ON, not the SELECT/GROUP BY.
