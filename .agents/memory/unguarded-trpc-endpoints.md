---
name: Unguarded tRPC endpoints (frontend gating ≠ backend authorization)
description: A route being hidden behind a frontend guard does not mean the tRPC procedure behind it checks role/tenant; some critical mutations had zero server-side role checks.
---

`listUsers` and `createLocalUser` in `server/routers.ts` had NO role check at all until this was
found while implementing a new restricted admin role: any authenticated user (even plain `role:
"user"`) could call `createLocalUser` directly and create an `admin_master` account for themselves
(full privilege escalation), and `listUsers` returned every user of every company to any caller.

**Why:** the frontend route was gated (`MasterOnlyGuard`/similar), which created a false sense of
security — but tRPC procedures are reachable directly regardless of which UI route exposes them.
A frontend guard only controls what's *shown*, never what's *callable*.

**How to apply:** whenever adding, touching, or reviewing a `protectedProcedure` mutation/query that
returns or mutates cross-user or cross-company data (user management, company/role assignment,
anything with an id-based target), verify explicitly that the procedure itself checks
`ctx.user.role` and/or tenant scope (e.g. via `getCompaniesForUser`/`assertCompanyAccess`) — do not
assume the frontend route guard is sufficient. Treat "who can see the button" and "who can call the
endpoint" as two separate questions that both need answering.
