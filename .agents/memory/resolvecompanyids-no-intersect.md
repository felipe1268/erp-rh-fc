---
name: resolveCompanyIds trusts client input
description: Why financeiro (and similar) per-company endpoints must call an explicit access guard even when using resolveCompanyIds
---

`resolveCompanyIds(input)` / `companyFilter` (server/companyHelper.ts) simply return
`input.companyIds ?? [input.companyId]`. They do NOT intersect with the caller's
authorized companies — they blindly trust whatever the client sends.

**Why:** filtering SQL by `company_id IN (resolveCompanyIds(input))` looks safe but is
an IDOR: an authenticated user can pass any other company's id and read/write it.

**How to apply:** every per-company procedure must independently assert access before
querying. In `server/routers/financial.ts` use `_assertFinanceiroCompanyAccess(ctx.user, cid)`
(admin/admin_master free; users with links enforced; users with no links allowed).
For list endpoints that accept `companyIds`, loop and assert EVERY id, not just
`input.companyId`. Note: some legacy financeiro list endpoints (e.g. getContasAPagar)
still lack this guard — same latent IDOR; fix opportunistically when touched.
