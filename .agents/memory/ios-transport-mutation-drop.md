---
name: iOS transport drops mutations → silent no-op
description: Why "The string did not match the expected pattern" on a button click can mean the request never reached the server, and how to make such mutations resilient.
---

# iOS WebKit drops the request → cryptic toast + no effect

The DOMException message **"The string did not match the expected pattern"** (also "Load failed", "the operation was aborted") is WebKit on iPad/iOS Safari aborting/dropping the HTTP request itself at the transport layer. It is NOT a bug in our pipeline (server/superjson/render are clean). It can appear on a plain mutation even when the handler has no `new Date()` — distinct from the date-parse crash (see `ios-date-string-crash.md`).

**Why it bites:** the global tRPC `QueryClient` sets `mutations: { retry: false }`. So the FIRST dropped attempt fails and **nothing happens** — confirmed by zero effect in the DB while the user sees a red toast. A query would self-heal on refetch; a one-shot mutation does not.

**How to apply** (when a destructive/idempotent mutation must work on iOS):
1. Make the backend mutation **idempotent** so a retry is safe (e.g. soft-delete `UPDATE ... WHERE deletado_em IS NULL`; on 0 rows, if the row still exists for the company return `{success:true}` instead of NOT_FOUND).
2. On the `useMutation`, add a **transport-aware `retry`** (helper matching `did not match the expected pattern` / `load failed` / `failed to fetch` / `aborted` / `timed out` / empty message; `n < 2`).
3. Map the cryptic message to a friendly PT message in `onError` (codebase precedent: `msgErroIA` in AnaliseEfetivoIA.tsx, IntegraSignAssinar.tsx).
4. Use **`onSettled`** to always invalidate/refetch the list, so the UI reflects the true server state even after a transient client error.

**Caveat — the "retry never duplicates" claim is only as strong as the dedup key.** A transport retry can duplicate if the FIRST attempt actually succeeded server-side but the response was dropped. It is only safe where the backend has a real idempotency guard (atomic single-use claim, per-period unique row, or a client idempotency key). For public NPS links this holds **only for tokens that carry `linkId`** (all links from `gerarLinkAvaliacao`) or a `credId`; truly legacy tokens with neither still keep the old "can register twice" exposure. When you scope a retry, scope your safety claim to the flows that actually have the dedup key — don't write a blanket "nunca duplica".
