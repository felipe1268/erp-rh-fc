---
name: ColFix DO-block silent rollback
description: The main [ColFix] migration block silently swallows failures for ALL its statements when any one fails, yet still marks the version as applied.
---

`server/_core/index.ts` has a large `[ColFix]` migration block that wraps ~60 `ALTER TABLE`
statements inside a single `DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END $$;`. Because
the exception handler catches everything at the OUTER block level, a failure in any one
statement (e.g. an `ALTER COLUMN ... TYPE` incompatible with existing data) rolls back the
entire transaction/batch silently — yet `colfix_version` still gets marked as applied at the
end (that write lives outside the failing block), so the migration looks successful even
though none of its ALTERs landed.

**Why:** discovered when a new `regime_custo` column addition silently no-opped on first
attempt — the log showed no error, `colfix_version` was bumped, but the column never appeared
in Neon.

**How to apply:** don't add new ALTERs into the giant shared DO block. Add a small, ISOLATED
try/catch block of your own (pattern: `[ColFix Rev.NNNN]`) right before the final `setCache`
call, using a direct `db.$client.query()` call for just your new statement(s). Bump
`COLFIX_VERSION` to force re-run. Always verify the column actually landed via a direct query
against `NEON_DATABASE_URL` (not just trusting the log line or `executeSql`, which may hit a
different DB — see `db-connection.md`).

**Update (Rev. 4605):** the final `setCache("colfix_version")` is now conditional on a
`colFixOk`-style flag for critical blocks — if a critical isolated block fails, the version is
NOT marked and the block retries on next boot. When adding a must-land migration (unique
index, dedup), set the flag pattern instead of relying on the unconditional version write.
