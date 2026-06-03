---
name: FCSign create caller-company tenancy
description: signatures.create lacked caller-company authorization; only checked employee belongs to company
---

`signatures.create` (server/routers/signatures.ts) historically only validated
`employee.companyId === input.companyId` — it did NOT verify the LOGGED-IN caller
was authorized for that company. Any authenticated user could create FCSign
sessions (and generate signing links) for contracts of OTHER tenants if they knew
a valid employeeId+companyId.

**Why:** found in code review when reusing `create` for PJ contracts. The gap was
pre-existing and shared by every FCSign flow (empregado/empregador, termo, etc.),
not specific to PJ.

**How to apply:** the file's own pattern (e.g. `listByTipo`) is to call
`getCompaniesForUser(ctx.user.id, ctx.user.role)`, map to numeric ids, and reject
with FORBIDDEN if `input.companyId` is not in the allowed set. Use that — NOT a
strict `ctx.user.companyId` compare (breaks multi-company users; see
company-access-guard.md). Also: dedup for `contrato_pj`/`termo_responsabilidade`
is relaxed by design (1 employee → many docs); when relaxing employeeId+tipo dedup,
add a contract-scoped guard keyed on `observacoes` instead.

Still-open (out of scope): `pj.contratos.getById` is a bare protectedProcedure
with no company scope — readable cross-tenant if the contract id is known.
