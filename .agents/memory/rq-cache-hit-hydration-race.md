---
name: React Query cache-hit hydration race
description: Two concurrent useEffects (one hydrates from query data, one resets by a different dep) can silently null state when the query is a cache hit — consolidate into one identity-keyed effect.
---

# React Query cache-hit hydration race (FolhaPagamento Vale/Pagamento resumo)

A UI showed state-derived widgets (resumo do Vale / resumo do Pagamento + botão "Ver Resultado") disappearing **non-deterministically per session** — looked like a permission bug but was NOT (the render had no role gate).

**Root cause (the durable lesson):** Two concurrent `useEffect`s fighting over the same client state:
- Effect A hydrated local state from `query.data` with a guard like `if (!valeResult) setValeResult(...)`.
- Effect B (different dependency, e.g. `[mesAno]`) reset that same state to null.

When React Query already had the target query **in cache** (instant data swap), both effects ran in the **same render**, in declaration order: A ran first, saw the *previous* period's result (truthy) and skipped due to its `!valeResult` guard, but still stamped a "loaded" sentinel; then B nulled everything. Since `query.data` never changed again, A never re-ran → state stayed null "forever" for that session. With a fresh network fetch the timing differed, so the bug appeared random / per-user.

**Why:** stale-guard hydration (`!x`) + a separate reset effect + a cache hit = order-dependent, single-render race. The guard meant to "don't clobber edits" instead permanently blocked re-hydration.

**How to apply / fix pattern:**
- Collapse the dual effects into ONE effect keyed by the **identity of the data** (e.g. `pid = data?.id ?? "none"`), dep `[query.data]`.
- Early-return when identity is unchanged (preserves local edits across a post-mutation refetch of the *same* entity).
- When identity changes, hydrate **unconditionally from the snapshot** (drop the `!x` guard) and clear fields whose source column is empty; the "no entity" sentinel clears all.
- If you ever need to reflect *remote* changes within the same identity without an id change, use an explicit force-rehydrate flag/nonce — don't rely on a stale-guard.
- Mutations that update local state before refetch keep working because the same-identity early-return won't clobber them.

General rule: any time you have one effect hydrating from a query and another resetting the same state on a different dep, assume a cache-hit race and unify them under a single identity key.
