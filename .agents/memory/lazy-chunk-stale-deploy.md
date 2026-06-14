---
name: Lazy chunk load fails after deploy (iOS Safari)
description: Why React.lazy imports must be wrapped to retry+reload, not just caught by the ErrorBoundary
---

# "Importing a module script failed" / stale lazy chunk after deploy

Every publish/deploy changes ALL Vite chunk hashes. A browser tab that was already
open before the deploy still holds the OLD `index.html` chunk references in memory.
When the user navigates to a `React.lazy` route, the import targets a hash that no
longer exists on the server → iOS Safari throws **"Importing a module script failed"**
(Chrome: "Failed to fetch dynamically imported module" / "Loading chunk"). This is NOT
a code bug and reproduces only against the PUBLISHED app, never in dev.

**Why catching it in the ErrorBoundary is not enough:** by the time the boundary sees
it, the user already gets the error screen for that render. The robust fix is to recover
*before* it bubbles.

**The rule:** wrap `React.lazy` (helper `lazyWithRetry` in `client/src/App.tsx`) so a
chunk-load error: (1) retries the same import once after ~600ms (covers flaky iPad
network); (2) if still failing, calls `window.location.reload()` ONCE (guarded by
`sessionStorage __erp_chunk_reload`, 10s window — the SAME key shared with the handlers
in `main.tsx` unhandledrejection and `ErrorBoundary.tsx`) and returns a *pending* promise
so Suspense keeps showing the PageLoader instead of flashing an error; (3) only on
exhaustion lets the error reach the ErrorBoundary.

**Why:** server config is already correct (`server/_core/vite.ts`: `index.html`
`no-cache, no-store`; `/assets` 1y immutable), so a reload fetches a fresh index.html
with the new hashes and self-heals. The pending-promise trick avoids an infinite render
loop.

**How to apply:** any NEW lazy route must use `lazyWithRetry`, not bare `lazy`. The fix
only takes effect in production AFTER re-publishing — the currently-deployed bundle stays
broken until the next deploy; tell the user to re-publish.
