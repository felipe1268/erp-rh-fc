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

## Auditing a router for missing company guards — regex pitfalls
When sweeping a router for per-company endpoints that need the access guard, do NOT key the
audit on the literal `companyId: z.number()` schema line. That misses real cases:
endpoints that take the tenant key as a PLURAL array (`companyIds: z.array(z.number())` —
needs a per-element loop guard, not a single call), and endpoints whose schema declares it
differently or only reference it in the body.
**Rule:** flag any procedure that *references* the tenant key (schema OR body, singular
`companyId` OR plural `companyIds`) and lacks a guard helper. For array inputs, guard EACH
id: `for (const cid of ids) await _assertCompanyAccess(ctx.user, cid)`.
**Why:** a regex-narrow first pass on the compras router silently left several write
endpoints (item create, stock movement, supplier rating) and all the multi-company
dashboards unguarded; a broadened re-audit caught them.

## Company guard ≠ resource-IDOR fix
The company-level guard only stops passing ANOTHER company's id. It does NOT fix
RESOURCE-level IDOR: a mutation that takes `companyId` but acts on a resource purely by its
own id (e.g. update-by-`cotacaoId`, update-by-`itemId`) still lets you pass your OWN
`companyId` + someone else's resource id. Fix pattern: scope the write/read by
`(resourceId + companyId)` together (or derive the company FROM the resource row and check
that), never just the id.

## Auditing must ALSO cover id-only endpoints (not just companyId-referencing)
Two audit dimensions are mandatory; require 0 in BOTH before declaring coverage complete:
(A) procedures that reference the tenant key (`companyId`/`companyIds`) without a guard;
(B) procedures that take NO `companyId` but act by `id` on a tenant-scoped table — invisible
to A yet full IDOR holes.
Derived-guard pattern for (B): fetch the owning row (add `companyId` to the select if
missing) → `if (row) await _assertCompanyAccess(ctx.user, row.companyId)` before any
write/sensitive read; for child rows derive companyId from the PARENT via the input's parent
id. Handlers with only `{ input }` must add `ctx` (esbuild won't catch a missing `ctx` —
only a typecheck or runtime does, so verify programmatically that every `ctx`-using handler
destructures it).
**Why / pitfall:** a HARD-CODED list of "tenant tables" in the audit script silently misses
tables whose name you forgot (the audit reports B=0 while a real hole remains). Derive the
tenant-table set DYNAMICALLY from the schema (every table with a `company_id` column), not a
manual list.
**Resource-binding (deeper IDOR):** a guard derived from a PARENT id does not bind the CHILD
— e.g. guarding by `solicitacaoId` then mutating by `itemId` still lets a valid parent +
foreign child through. Assert the child belongs to the parent (`item.solicitacaoId ===
input.solicitacaoId`) before mutating.

## ctx.user has NO `companyIds` field — guards reading it silently block everyone
`ctx.user` is the `users` table row (`InferSelectModel<typeof users>` from `sdk.ln`/
`authenticateRequest`). It does NOT carry a `companyIds` array. Any guard shaped like
`const ids = ctx.user?.companyIds ?? []; if (!ids.includes(companyId) && role!=="admin_master") throw`
is therefore ALWAYS `ids = []` → throws `FORBIDDEN` for EVERY non-`admin_master` user on
EVERY endpoint (silent total lockout of a whole module — e.g. the SST "Integração"
module blocked the entire SST group with "Acesso negado a esta empresa").
**Why:** the per-request company is passed as `input.companyId` (the UI's selected
company); a user's company membership lives in `user_companies`, fetched via
`getUserCompanyLinks(userId)` — never on the session user object.
**How to apply:** never read `ctx.user.companyIds`. Use the canonical async guard
(`getUserCompanyLinks` + admin allow + no-links allow). When you make a sync guard async,
audit EVERY call site for `await` (a forgotten `await` = silent auth bypass).
