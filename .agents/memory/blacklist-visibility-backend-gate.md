---
name: Blacklist (Lista_Negra) visibility is admin_master-only
description: employees.list must enforce blacklist visibility server-side, and cache keys must vary by role
---

Blacklist employees (`status='Lista_Negra'` / `listaNegra=1`) are visible ONLY to `admin_master`.

**Why:** The Colaboradores screen gates blacklist on the client (`isAdminMaster`), but `employees.list` is a generic endpoint — a non-master could call it directly with `status:"Lista_Negra"` (or no filter) and pull blacklist rows. Client-only gating is not an access-control boundary.

**How to apply:**
- In `employees.list`, short-circuit `return []` when `input.status==='Lista_Negra'` and caller isn't `admin_master`, AND filter out any `Lista_Negra`/`listaNegra` rows from the fetched data for non-masters (defense in depth for unfiltered queries).
- CRITICAL: the `memCache` cacheKey must include a role discriminator (e.g. `bl${isAdminMaster?1:0}`). Without it, a master's cached result (with blacklist) leaks to the next non-master hitting the same key. Same pattern as the existing `av${canSeeAviso}` Aviso flag.
- Printing the "Desligados" list pulls blacklist via a separate `employees.list` query with `status:"Lista_Negra"` gated on `isAdminMaster`; rows render `hidden print:table-row` so they appear only in `window.print()` output, not on screen.
