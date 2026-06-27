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
ONE object. As of mid-2026 ALL known 2-arg call sites were swept (financial.ts ×9 total +
heSolicitacoes.ts ×4); `rg "createAuditLog\(db"` should match only the definition in db.ts.
If a new 2-arg call appears, it's the same bug — drop the leading `db` arg.
