---
name: stripe-replit-sync runMigrations advisory lock hang
description: a killed/timed-out runMigrations() call can leave an idle Neon session holding the pg-node-migrations advisory lock forever, hanging every future call silently.
---

`runMigrations()` from `stripe-replit-sync` uses `pg-node-migrations`, which serializes via a
Postgres advisory lock (two `pg_advisory_lock` entries, one per objid). If the Node process
running it is killed (e.g. shell `timeout`, Ctrl-C, workflow restart mid-migration) before the
`pg.Client` cleanly calls `client.end()`, the underlying Neon session can remain `idle` while still
holding the advisory lock — Neon doesn't always drop it immediately on TCP close.

**Why:** every subsequent `runMigrations()` call blocks forever (no error, no timeout — the
`connectionTimeoutMillis` only covers the initial `connect()`, not the lock wait) with zero log
output beyond `"Running migrations"`. Looks exactly like a hang in application code.

**How to apply:** if `runMigrations()`/webhook init hangs with no error, query
`SELECT * FROM pg_locks WHERE locktype='advisory'` joined to `pg_stat_activity` on the Neon
connection directly; if you find an `idle` session holding the lock, `pg_terminate_backend(pid)` it,
then retry. Always let async migration calls run to completion (or explicit `.catch`+`client.end()`)
rather than hard-killing the process mid-run.
