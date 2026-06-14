---
name: tsc incremental can return stale-clean
description: Why `tsc --noEmit` may miss a real error in a just-edited file in this repo
---

In this repo `tsc --noEmit` (the `check` script) is INCREMENTAL — `tsconfig.json` sets
`incremental: true` + `tsBuildInfoFile: ./node_modules/typescript/tsbuildinfo`.

**Symptom:** after editing a `client/src/**` file, `tsc --noEmit` (or `npx tsc -p tsconfig.json`)
can report the file CLEAN even when it has a genuine error (e.g. a duplicate
`const` declaration in the same component scope — TS2451). The stale tsbuildinfo
lets TS skip re-checking the file.

**Why it matters:** a "tsc passed" can be a false negative right after an edit. A code
reviewer reading the source (architect) WILL catch errors that the cached tsc missed.

**How to verify a just-edited file:**
- Force a fresh check: `rm -f ./node_modules/typescript/tsbuildinfo && npx tsc --noEmit | rg <File>`
- Or do a parse-only syntax check with esbuild:
  `npx esbuild <file>.tsx --bundle --loader:.tsx=tsx --jsx=automatic --format=esm --outfile=/dev/null --external:react --external:@* ...`
  (catches duplicate-declaration / syntax errors fast without resolving all deps).

Note: `client/src/**` IS in the tsconfig `include`, so client files DO get type-checked —
the gap is staleness, not scope.

**Server routers (`server/**`) can be a blind spot too:** a fresh `tsc --noEmit` did NOT flag a
`Cannot find name`/missing-import in `server/routers/*.ts` (a schema symbol used without being
added to the `from "../../drizzle/schema"` import block). Do NOT trust tsc to catch a missing
import in a server router — after adding any new schema symbol, grep the import block to confirm
it's listed, and boot the app (a ReferenceError there is often swallowed by a local `try/catch`,
so the symptom is a silently-null derived field, not a crash).
