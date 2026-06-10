---
name: SyncSchema+ self-heal log is capped / verify on Neon
description: Why a missing [SyncSchema+] Rev. N log line doesn't mean the self-heal failed, and how to verify.
---
The schema self-heal in `server/_core/index.ts` is essentially ONE long sequential
`import("../db").then(async ...)` block (roughly lines 700–3000) that runs dozens of
`db.execute(...)` statements one after another, each `console.log`-ing a
`[SyncSchema+] Rev. N ...` line on success.

**Pitfall:** the captured workflow log file (`/tmp/logs/Start_application_*.log`) only
holds ~45–49 lines — a snapshot window, NOT the complete run. So if you add a new
self-heal block near the END and don't see its `[SyncSchema+] Rev. N` line in the log,
that does NOT mean it failed or was skipped. The earlier blocks just fill the window.

**How to verify a new table/column actually landed:** connect to the REAL app DB
(Neon) directly and inspect `information_schema`. `executeSql` / the database skill hit
the Replit Postgres (`DATABASE_URL`), NOT Neon, so they won't show app tables. Use a
throwaway node script with `pg`, run from the workspace root (so `pg` resolves):

```
node -e '...' // import pg; new pg.Client({connectionString: process.env.NEON_DATABASE_URL, ssl:{rejectUnauthorized:false}})
SELECT column_name FROM information_schema.columns WHERE table_name=...
```

**Why:** confirmed during Combo de Demissões work — the `combo_demissao_simulacoes`
self-heal log never appeared in the captured log, but querying Neon showed all 13
columns present. Don't chase a "missing" log line; query Neon.
