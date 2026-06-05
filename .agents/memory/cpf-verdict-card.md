---
name: "Always-conclusive" verdict UI must handle query error state
description: A verdict/result card bound to a react-query result needs an explicit error branch, or it silently shows nothing when the query fails.
---

When a UI must give an "always conclusive" verdict derived from a react-query
result (e.g. the CPF check card in Novo Colaborador), do NOT gate the verdict
solely on `data !== undefined`. On query error, `isFetching`/`isLoading` fall
back to false and `data` stays `undefined` — so the spinner disappears and NO
card renders, leaving the screen silent.

**Rule:** add an explicit `erro` branch (`!isFetching && data === undefined &&
!!error`) with its own final card (+ a "Tentar novamente" → `refetch()` action),
and put it at the TOP of the mutually-exclusive verdict priority chain.

**Why:** a prior rev (the spinner-deadlock fix) tied the verdict to whether the
query resolved with data; that still leaves a gap on failure. The user
explicitly wanted a card that is ALWAYS conclusive.

**How to apply:** any verdict/diagnosis card sourced from a single query — derive
a discriminated state `"erro" | ...success states... | null` where `null` means
only "still loading / preconditions unmet", and `"erro"` is a rendered state, not
a fall-through to nothing.
