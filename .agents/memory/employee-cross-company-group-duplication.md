---
name: Cross-company-group employee duplication
description: How real employees end up duplicated between sibling companies in the same grupoEmpresarial, and the guard that prevents it.
---

Companies with the same `grupoEmpresarial` and `compartilhaRecursos=1` can already allocate one shared employee across obras owned by either company — no separate cadastro is needed. If someone registers the same person again as a brand-new `employees` row in the sibling company anyway, the two rows are fully independent and their `status` silently drifts apart over time (e.g. one side shows "Ativo", the other "Ferias"/"Desligado"), surfacing as visible duplicates in "Efetivo por Obra".

**Why:** `checkDuplicateCpf` only checked for a duplicate CPF within the SAME company, so it never caught this case; the group-sharing feature and the duplicate-CPF guard were never reconciled.

**How to apply:** Before creating a new employee, also check `checkDuplicateCpfCrossCompanyGroup` (server/db.ts) — it blocks creation when the CPF already exists in another company sharing the same `grupoEmpresarial` with `compartilhaRecursos=1`, and should direct the user to allocate the existing employee to the new obra instead of re-registering. If you find more duplicate pairs like this in the wild, the fix is a soft-delete of the newer/incorrect copy (not the canonical company's row) plus deactivating its `obra_funcionarios` allocations — never a hard delete.
