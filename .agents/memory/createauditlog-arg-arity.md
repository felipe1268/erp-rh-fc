---
name: createAuditLog single-arg signature
description: createAuditLog takes ONE arg; passing db as first arg silently drops the audit
---

`createAuditLog(data)` in `server/db.ts` accepts a SINGLE argument and obtains its own `db`
via `getDb()` internally. Several call sites in `server/routers/financial.ts` (and
`heSolicitacoes.ts`) historically called `createAuditLog(db, {...})` with TWO args.

**Effect:** the `db` object is bound to `data`, the real payload is ignored, and the INSERT
fails — but the failure is swallowed by createAuditLog's internal try/catch, so the feature
still "works" while the audit log is NEVER written. This is invisible unless you check the
audit table.

**Why it matters:** when a feature seems fine but its audit trail is empty, suspect the
2-arg form. It does NOT cause empty HTTP bodies / "Unexpected end of JSON input" — that is a
transport drop, a separate failure mode.

**How to apply:** always call `createAuditLog({ action, userId, companyId, details })` with
ONE object. There are still ~7 latent 2-arg call sites in financial.ts (and 4 in
heSolicitacoes.ts) as of mid-2026 — fix opportunistically when touching them.
