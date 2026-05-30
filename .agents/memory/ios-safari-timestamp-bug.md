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

**Gotcha — the crash site is often a SIBLING feature, not the tab you're testing.**
A page can host several sub-features ("simuladores", histórico panels, revisão selectors)
that each render timestamps. When a WebKit date crash "persists" after you cleaned the
obvious component, grep the WHOLE page file for `new Date(<var>).toLocale*` — the raw call
is usually in a different sub-panel (e.g. a Compras "Cenários" simulator) that happens to
be visible at the same time. Also: superjson round-trips real `Date` objects via ISO (Safari-safe), so the
crash is only from columns that arrive as raw STRINGS — narrow your search to those.
