---
name: Employee terminal-status set (Lista_Negra is terminal)
description: The canonical "desligado" status set is THREE values, not two — Lista_Negra is terminal and easily forgotten.
---

The terminal/desligado employee-status set is `('Desligado', 'Lista_Negra', 'Inativo')`. Canonical source: `EMPLOYEE_STATUS_DESLIGADOS` in `shared/modules.ts`.

**Rule:** Any code classifying an employee as ativo-vs-desligado (CPF verification, recontratação, duplicate checks, blacklist alerts) MUST use all three values via `EMPLOYEE_STATUS_DESLIGADOS` (`.includes` / Drizzle `inArray` / `notInArray`), never a hand-written `=== "Desligado" || === "Inativo"`.

**Why:** Real data has `Lista_Negra` rows and zero `Inativo` (`Inativo` is not even in the canonical `EMPLOYEE_STATUS` list). Two-value checks misclassify `Lista_Negra` as ATIVO → false "CPF já cadastrado ativo" blocks and the rows disappear from the recontratação/vínculos/blacklist path.

**How to apply:** The query that LOADS candidates usually already fetches all statuses — the bug lives in the post-fetch classification, not the WHERE clause. Audit classification branches, not just queries.
