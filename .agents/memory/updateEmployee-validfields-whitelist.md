---
name: updateEmployee validFields whitelist
description: updateEmployee silently drops any field not in its validFields Set
---

`updateEmployee` (server/db.ts) sanitizes input against a hardcoded `validFields` Set. Any column not listed is dropped; if nothing survives, `if (Object.keys(sanitized).length === 0) return;` exits early returning success WITHOUT writing.

**Why:** adding a new `employees` column + self-heal + a procedure that calls `updateEmployee({newCol})` looks complete but persists nothing — the field is filtered out before the UPDATE. Audit/history still write, masking the no-op.

**How to apply:** whenever you add a writable `employees` column, also add its key to `validFields`. If it's a 0/1 smallint, add it to `booleanFields`; if int, `intFields`. Verify the actual DB row changed, not just the success return.
