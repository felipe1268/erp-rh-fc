---
name: Which database the app actually uses
description: The executeSql tool and the running app point at DIFFERENT databases — critical when debugging "missing data"
---

# App DB vs. executeSql DB

**Rule:** The running app connects to `NEON_DATABASE_URL` (`server/db.ts` reads only this via `env.ts`; it actively BLOCKS local URLs). The `executeSql` notebook tool / Replit "PostgreSQL database" connects to `DATABASE_URL` (host `helium`). These are TWO DIFFERENT databases with different data.

**Why:** During a Planejamento debug, `executeSql` showed project 35 as empty / only project 4 existed, contradicting the user's screenshots. The real data (project 35 REVTE-CIVIL, etc.) lived in the Neon DB, not the Replit one.

**How to apply:** To inspect or verify the data the user actually sees, query Neon — NOT `executeSql`. The `code_execution` sandbox does NOT expose `process.env`, so run a small node script from the workspace root (where `pg` resolves) using `process.env.NEON_DATABASE_URL`. Keep it READ-ONLY (R-001/R-007/R-010: never ALTER/DROP/DELETE). Never print the connection string.
