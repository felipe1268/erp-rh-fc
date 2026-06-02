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

## Match the guard to the MODULE's entry point (do NOT over-tighten one feature)
A feature's access boundary must match its module's entry point, not exceed it. The
Planejamento module entry (`planejamento.getProjetoById`, `listarAtividades`,
`listarAvancos`) is a plain `protectedProcedure` with NO company gate at all — access is
governed by group + obra allocation, NOT `user_companies`. So `assertCompanyAccessIa` was
changed to ONLY validate the session (auth), dropping the `user_companies` enforcement
entirely (even step 2). Reason: a feature gated tighter than its own module's front door
recreates the "só para o master" bug — engineers linked to a company ≠ the project's
company hit FORBIDDEN even though they can already open the project screen.
**Rule:** if the module entry point has no company gate, the sub-features must not add one
either; tenant isolation then comes purely from `(projetoId + companyId)` filters in the
data queries. Conversely, individual read-by-id endpoints must still scope by `projetoId`
(not just `id + companyId`) — a sequential/guessable `id` alone lets you read another
project's row within the same company (IDOR). See `getAnaliseEfetivo`: input requires
`projetoId`, query filters `(id, projetoId, companyId)`.
