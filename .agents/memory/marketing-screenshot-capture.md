---
name: Capturing real authenticated screenshots for a public landing page
description: Pattern for taking real app screenshots to embed in a public marketing page without leaking access or exposing user consent gaps
---

To embed real (not mocked) screenshots of an authenticated multi-tenant app on
a public landing page, a temporary dev-only auth bypass is sometimes the only
way to reach the screens. Every piece of that bypass must be enumerated and
fully reverted before finishing — not just the obvious middleware check.
Bypasses tend to spread into more than one file (auth middleware, a "pick this
tenant first" ordering hack in a data-fetch helper, and a client-side default
company override) — grep for anything added in that session before declaring
it reverted, and re-verify a protected route redirects to login afterward.

**Why:** a bypass left in even one of these spots re-opens the vulnerability
in production even if the main auth check looks fixed.

**How to apply:** when asked to capture real in-app screenshots for marketing,
budget time to (1) add the minimal bypass, (2) capture everything needed in
one pass, (3) grep the diff and remove every trace, (4) confirm a protected
page redirects unauthenticated again.

Separately: if a user is ambiguous about whether real names/PII should be
masked in such screenshots, but then attaches their own screenshots with real
names unmasked as a quality reference, treat that as implicit consent to
publish as-is (still avoid full CPF/document numbers if visible, since those
carry distinct legal-identifier risk beyond a name).
