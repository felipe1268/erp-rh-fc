---
name: Public route ↔ auth-redirect whitelist drift
description: Adding a public route to the router is not enough; the global UNAUTHORIZED interceptor has its own publicPaths whitelist that must be updated too.
---

# Public routes need TWO registrations, not one

A public (no-login) route in `client/src/App.tsx` `<Switch>` (no `RouteGuard`) is
NOT actually safe from being kicked to `/login`.

`client/src/main.tsx` has a GLOBAL `queryClient` error subscriber
(`redirectToLoginIfUnauthorized` + `isAuthErrorOnLoginPage`) that, on ANY tRPC
error whose message === `UNAUTHED_ERR_MSG`, does `window.location.href = "/login"`
— UNLESS `window.location.pathname` matches the `publicPaths` prefix whitelist.
The whitelist is duplicated in BOTH functions.

**Why:** public pages still render components that may fire authenticated queries
returning UNAUTHORIZED (e.g. the NPS short-link `/a/<codigo>` renders
`PortalDashboardCliente`). If the route prefix isn't whitelisted, the visitor is
redirected to `/login` even though the route itself is public.

**How to apply:** whenever you add a new public/login-less route to App.tsx,
ALSO add its path prefix to BOTH copies of `publicPaths` in `client/src/main.tsx`.
Known instances that drifted and had to be backfilled: `/a/` (NPS short-link) and
`/assinar/` (FCSign signing). Watch prefix collisions: `startsWith("/assinar/")`
does NOT match `/integrasign/assinar/` (different leading prefix), so both can
coexist. Consider centralizing the prefix list into a shared const to stop the
drift.
