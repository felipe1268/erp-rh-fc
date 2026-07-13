---
name: orcamentos/employees camelCase columns
description: Which scorecard-related tables use camelCase DB columns and how employees link to obras
---

## Rule

`orcamentos`, `orcamento_itens`, and `obra_funcionarios` store their columns in camelCase directly in the database — Drizzle does NOT map them to snake_case automatically.

`employees` has **no** `obra_id` or `company_id` column (those fields do not exist). The link between an employee and an obra lives exclusively in `obra_funcionarios`.

**Why:** The schema was created with camelCase naming and never standardized. Drizzle ORM generates snake_case WHERE clauses by default, so any Drizzle query against these tables that filters by company/obra silently returns zero rows (the error is swallowed by the `safe()` wrappers in scorecard.ts).

**How to apply:**

- Always use **raw SQL with double-quoted column names** when querying `orcamentos` or `orcamento_itens`:
  - `"companyId"`, `"obraId"`, `"totalVenda"`, `"totalCusto"`, `"valorNegociado"`, `"tempoObraMeses"`
  - `orcamento_itens."companyId"`

- `employees` columns are also camelCase: `"nomeCompleto"`, `"dataAdmissao"`, `"createdAt"`, `"companyId"` (no `obra_id` at all).

- To find employees belonging to an obra, use a subquery on `obra_funcionarios`:
  ```sql
  AND e.id IN (
    SELECT "employeeId" FROM obra_funcionarios
    WHERE "obraId" = ${obraId} AND "companyId" = ${companyId}
  )
  ```

- `obra_funcionarios` camelCase columns: `"obraId"`, `"employeeId"`, `"companyId"`, `"isActive"`.

- Tables that ARE snake_case (safe with Drizzle or raw snake): `compras_ordens`, `planejamento_projetos`, `employee_site_history`, `dds_sessoes`, `epi_deliveries`, `warnings`, `trainings`.
