---
name: changelog.ts pre-existing tsc errors
description: Why `tsc -p tsconfig.json` reports ~200 errors in shared/changelog.ts that are not yours.
---

# shared/changelog.ts produces pre-existing tsc errors

`shared/changelog.ts` is a giant JSDoc prose block followed by an exported array. Running `tsc -p tsconfig.json` reports ~200 errors from literal `*/` sequences inside the prose. These are PRE-EXISTING (present at HEAD) — Vite/esbuild compiles the file fine and the app runs.

**Why:** the project builds with esbuild/Vite, not `tsc`, so these comment-parsing errors were never gating anything.

**How to apply:** never treat a full-project `tsc` failure in changelog.ts as caused by your edit. Verify your own changes with a targeted `tsc --noEmit | grep <your-file>` instead.
