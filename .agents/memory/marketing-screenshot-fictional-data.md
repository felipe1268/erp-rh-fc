---
name: Marketing screenshots must use fictional data
description: How to capture authenticated in-app screenshots for public marketing pages without leaking real employee/client PII
---

Any screenshot of an authenticated screen used on a PUBLIC marketing page (e.g. `/planos/modulos/:id`) must show 100% fictional data — no real employee names, CPF, salary, birthdate, address, or real client/company names.

**Why:** the app's real tenants (e.g. FC Engenharia) have real employee PII visible on internal screens (Raio-X do Funcionário, dashboards, etc.); publishing those as marketing screenshots leaks PII. The user explicitly flagged this after seeing real names in an earlier round of screenshots.

**How to apply:**
1. Seed a throwaway fictional company + obra + admin user + employees directly in the DB (a `.local/*.mjs` script using `pg` against `NEON_DATABASE_URL`/`DATABASE_URL`).
2. Temporarily gate an auth bypass behind `NODE_ENV === "development" && process.env.SOME_FLAG === "true"` so you can log in as the fictional admin without a real session (touches `server/_core/sdk.ts` authenticateRequest + a `db.ts` helper + the workflow env var).
3. Capture screenshots with the `screenshot` tool (`app_preview`, `save_to`) navigating the real routes.
4. Convert saved `.jpg` outputs to `.png` with ImageMagick (`convert`/`magick`) if the target assets are `.png`.
5. Revert EVERYTHING before finishing: remove the bypass code from `sdk.ts`/`db.ts`, remove the temp env var from the workflow command, restore any storage-key/localStorage changes, and DELETE the fictional company/obra/user/employees rows from the DB. Verify via `git diff` that the touched infra files are byte-identical to HEAD.
