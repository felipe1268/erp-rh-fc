---
name: Company-access tenancy guard (canonical pattern)
description: How new endpoints must validate a user's access to a given companyId — never the legacy strict compare.
---

# Canonical company-access guard

New tRPC procedures that take an `input.companyId` (or otherwise operate per-company)
MUST validate access with the `assertCompanyAccess`-style helper, NOT the legacy
strict compare `String(ctx.user.companyId ?? "") !== String(input.companyId)`.

The canonical helper (see `assertCompanyAccess` in `server/routers/ferramentasTerceiros.ts`
and `terceiros`; mirrored as `assertCompanyAccessIa` in `server/routers/iaCronograma.ts`):
1. `admin` / `admin_master` → allow (global roles).
2. user WITH links in `user_companies` (via `getUserCompanyLinks`) → enforce real membership.
3. user WITHOUT links → ALLOW (access is controlled by group/module permissions).

**Why:** access control is GROUP/MODULE based (the "Grupos de Acesso" / Usuários e
Permissões feature). A user's `ctx.user.companyId` ("empresa-casa") is often empty or
different from the company they're viewing — Admin Master switches company in the UI,
and multi-company users belong via `user_companies`, not a single home company. The
legacy strict compare blocked legitimate non-admin users with "Sem permissão para esta
empresa" even though their group granted module access. Rule of thumb stated by the
owner: "só restringe quando o master restringir" (only restrict when master restricts).

**How to apply:** when adding any new per-company endpoint, call the helper right after
reading `input.companyId`; for query scoping use the VALIDATED `input.companyId` (not
`ctx.user.companyId`) so multi-company reads don't come back empty. For non-admin_master,
keep the anti-IDOR `company_id` filter in the query AFTER the access check.
