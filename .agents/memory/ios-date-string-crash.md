---
name: iOS Safari new Date() crash on mode:string timestamps
description: Why "The string did not match the expected pattern." appears on iPad and how to render DB timestamps iOS-safely
---

# iOS Safari rejects space-format timestamps from `mode:"string"` columns

**Symptom:** On iPad/Safari a screen shows the cryptic WebKit DOMException
`"The string did not match the expected pattern."` — often in a tRPC query/mutation
error card (e.g. IntegraSign `/integrasign/assinar/:token` `doc.error.message`).

**Why:** Drizzle `timestamp(..., { mode: "string" })` columns are WRITTEN via
`.toISOString()` (ISO with `T`/`Z`), but PostgreSQL `timestamp without time zone`
returns them on SELECT in **space format** `"2026-06-08 06:26:00"` (no `T`, no `Z`).
`new Date("2026-06-08 06:26:00")` is rejected by iOS/JSC (Safari) and throws that
exact DOMException — Chrome/Node parse it fine, so it only breaks on Apple devices.
The SAME message is also emitted by iOS for pure transport/runtime failures
(connection dropped/aborted), surfaced raw via `error.message`.

**How to apply:**
- NEVER do `new Date(serverDateString).toLocaleString/toLocaleDateString` in render.
  Use the existing iOS-safe helpers `formatDateTime`/`formatDate`/`formatTime` from
  `client/src/lib/dateUtils.ts` (they do `str.replace(" ","T")+"Z"` + `try/catch` → "—",
  fuso America/Sao_Paulo). `new Date()` with NO argument is safe.
- For error CARDS that render `error.message`, map cryptic iOS strings to a friendly,
  actionable message (helper pattern: `msgErroIA` in `AnaliseEfetivoIA.tsx`,
  `msgErroLink` in `IntegraSignAssinar.tsx`). Match-list: "did not match the expected
  pattern", "load failed", "failed to fetch", "networkerror", "network connection",
  "the operation couldn't be completed", "aborted", "timed out", "tempo limite", empty.
  Pass real server errors (e.g. "Link expirado") through intact.

**Server side:** comparing `new Date(tokenExpiraEm)` against `new Date()` in Node is OK
on Replit because Replit runs UTC and the space-format value is effectively UTC; the
"Link expirado" TRPCError is a legitimate response, not the iOS bug. Only revisit if a
host ever runs a non-UTC timezone.
