---
name: AI output sanitization for decision UIs
description: When an LLM interprets deterministic facts for a decision screen, filter its output against the fact set before returning.
---

# AI output must be sanitized "facts-only" before feeding a decision UI

When an endpoint sends SQL-computed facts to an LLM and the LLM's parsed JSON
is rendered in a UI that drives a business decision (e.g. sell/keep a vehicle),
do NOT return the raw parsed object. Reconstruct it with:
- a whitelist filter (e.g. only keep rows whose `placa` exists in the
  deterministic result set — discard hallucinated identifiers),
- enum normalization for classification fields,
- numeric clamp/round for scores,
- type coercion + length caps on strings/arrays.

**Why:** the client merges AI rows by key (placa); an invented key yields
`undefined` metrics rendered as `0`/"—", silently inducing a wrong decision.
A code review FAILed Rev. 2707 for exactly this before the guard was added.

**How to apply:** any new endpoint where the LLM "only interprets facts" — the
server is the enforcement point, not the prompt. Build the valid-key set from
the SQL output and filter the LLM response against it.

# frotas.ts per-company endpoints need an explicit tenancy guard

`getMaintenanceDashboard` and other older fleet dashboard endpoints are
`protectedProcedure` with only `WHERE company_id = ${companyId}` and NO check
that `input.companyId` belongs to the caller (IDOR). New per-company endpoints
in `server/routers/frotas.ts` must add the inline sibling-pattern guard:
`if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) throw FORBIDDEN`
(matches `getFuelDashboard`). The file uses this inline compare consistently —
follow local convention there rather than the global `assertCompanyAccess`.
