---
name: Optimistic-hide must match persisted rows
description: A mutation that hides list rows on success must hide only the rows the backend actually persisted (returned ids), never the input set.
---

# Optimistic row-hiding must reflect what the backend persisted

When a mutation's `onSuccess` hides/removes list rows optimistically, it must hide
ONLY the rows the backend confirmed it wrote — returned as an explicit id array —
NEVER the full set of rows the client *sent*.

**Why:** a set-based / partial-success backend can silently skip some of the
submitted items (e.g. a row no longer eligible, a stale React Query suggestion
pointing at a resource another row already consumed, a greedy-collision). If the
client hides every submitted row regardless, the skipped row vanishes from the UI
but reappears on reload (when the list is recomputed from the DB) — the classic
"I did it and it came back after refresh" bug. The success toast saying "N of M"
is not enough; the row must stay visible.

**How to apply:** have the backend RETURN the ids it actually persisted
(in conciliarSugestoes: `RETURNING l.id` in the update CTE + a final `ok` CTE
joining both updated sides → `conciliadosLineIds`). Frontend hides only those ids;
keep a fallback (field absent ⇒ old behavior) for transition. For the rows that
did NOT persist: keep them visible, show a destructive toast, and re-run the
analysis (`refetchSug`) so they re-pair with an eligible target for the retry.
Keep the response shape stable across ALL return paths (incl. early returns) so
the contract never has the array missing.
