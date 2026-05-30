---
name: tRPC tenancy / companyId
description: How to scope tRPC procedures to the user's company safely
---

# Tenancy via ctx.user.companyId

In this ERP, `protectedProcedure` only AUTHENTICATES — it does not authorize a
company scope. Procedures must derive the tenant from the session, not the input.

**Rule:** Always scope queries/mutations with
`const companyId = (ctx.user as any).companyId;` and use that in every `where`.
Do NOT trust an `input.companyId` for authorization — a client can forge it and
read/write another company's data (IDOR / broken access control).

**Why:** A code review flagged the new `iaCronograma.analisarEfetivo` procedure
because it filtered `planejamentoProjetos.companyId = input.companyId`. That let
any authenticated user pass another company's `projetoId` + `companyId` and
extract their workforce/schedule. Fixed by deriving companyId from `ctx.user`.

**How to apply:** When adding any new tRPC procedure that touches
company-scoped tables, copy the existing pattern in `server/routers/*` (e.g.
the chat/analisarLOB procedures in `iaCronograma.ts` all use
`(ctx.user as any).companyId`). If the input still carries `companyId` for
legacy/client convenience, mark it `.optional()` and ignore it for the query.
