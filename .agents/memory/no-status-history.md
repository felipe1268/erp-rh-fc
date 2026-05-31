---
name: No employee status history
description: The ERP stores only the CURRENT status of each employee — there is no status-change history table.
---

The `employees.status` column holds only the **current** status. There is no
reliable audit/history of past status values (`employeeHistory` exists but does
NOT track status transitions dependably).

**Why:** matters for any point-in-time / "snapshot of year X" dashboard. You
cannot reconstruct who was Afastado/Recluso/Férias on a past date from status.

**How to apply:** for historical snapshots, derive "active at date D" from
`dataAdmissao`/`dataDemissao` (employed iff admissao<=D and (demissao IS NULL or
demissao>D)). "Em férias na data D" is reconstructable via `vacationPeriods`
(dataInicio<=D<=dataFim). Other sub-statuses are NOT recoverable — fold them into
"Ativo" and disclose the limitation. Keep the CURRENT year on the real-status
ruler to avoid regressing the default view (Dashboard de Funcionários,
`getDashFuncionarios` ano-aware, Rev. 2626).
