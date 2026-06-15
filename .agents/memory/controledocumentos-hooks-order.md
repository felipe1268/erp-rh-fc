---
name: ControleDocumentos hooks order
description: Adding a hook to MapeamentoPanel (or sibling components) must go ABOVE the mid-component early returns.
---

`client/src/pages/ControleDocumentos.tsx` is a ~4600-line file where several components
(e.g. `MapeamentoPanel`) have mid-component early returns like `if (isLoading) return …`
BEFORE the main `return (…)`.

**Rule:** any new `useState`/`useEffect`/`useMemo`/`useCallback` MUST be declared ABOVE those
early returns. Placing a hook between an early `return` and the final `return` only runs it on
some renders → React throws "Rendered more hooks than during the previous render" and the whole
/controle-documentos screen crashes with a red error card.

**Why:** happened when the `awaitingReview`-reset `useEffect` was dropped next to the `batchLocked`
computation (which sits after `if (isLoading) return`). Compiles fine (esbuild/tsc clean) — only
crashes at runtime when isLoading flips false.

**How to apply:** grep for `return` in the target component before adding a hook; put hooks in the
top block with the other `useState`/`useQuery` declarations.
