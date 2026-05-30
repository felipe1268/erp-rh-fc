---
name: iOS Safari "string did not match the expected pattern" on Postgres timestamps
description: Recurring WebKit crash when rendering raw Postgres timestamps; always use formatDateTime helper.
---

# iOS Safari date-parse crash on Postgres timestamps

**Symptom:** On iPad/iOS Safari 17+, a red error banner/toast "The string did not
match the expected pattern" appears (it's a `RangeError` bubbling through the global
React error boundary). Often the UI otherwise looks fine and the trigger is just
opening a screen that renders a DB timestamp.

**Root cause:** A Postgres `TIMESTAMP` column reaches the client via Drizzle/superjson
as a raw string `"YYYY-MM-DD HH:MM:SS(.fff)"` — a SPACE separator, no `T`. Passing it
straight to `new Date(str).toLocale*()` makes WebKit throw (Chrome/Firefox tolerate it,
so it passes desktop testing and only breaks on the user's iPad).

**Fix / How to apply:** Never call `new Date(<pg timestamp string>).toLocale*()` in client
code. Use the existing helper `formatDateTime` (also `formatDate`/`formatTime`) from
`client/src/lib/dateUtils.ts` — it normalizes space→`T`, guards Invalid Date (returns
"—"), and formats in America/Sao_Paulo. ISO strings (`.toISOString()`) are safe but
still better routed through the helper for uniformity.

**Why it keeps recurring:** Every new feature that surfaces a `criado_em`/`atualizado_em`
style column reintroduces it. When adding any new timestamp display, reach for the helper
by default. This has been fixed many times across the project (search changelog for the
phrase).
