---
name: Transfer endpoints — multi-resource IDOR + atomic stock debit
description: Stock-transfer mutations must tenant-check EVERY resource id (not just one) and debit atomically to avoid negative balance under concurrency.
---

Stock-movement mutations that move quantity between locations (e.g. EPI `transferir`:
central↔obra / obra→obra / obra→central) have two recurring traps:

1. **Multi-resource IDOR.** Validating only ONE id (the EPI/company) is not enough —
   `origemObraId`/`destinoObraId` must ALSO be checked to belong to the same tenant
   (the EPI's company). Otherwise a direct API call can pollute another company's
   stock by passing a foreign obra id. Validate ALL resource ids the request touches.

**Why:** the `transferir` rewrite initially guarded only the EPI's company; architect
review flagged that obra ids were unchecked → cross-tenant stock pollution via API.

2. **Atomic debit.** A `SELECT qty` then `UPDATE qty = qty - X` has a window where two
   concurrent transfers both pass the check and drive the balance negative. Debit in a
   SINGLE statement: `UPDATE ... SET qty = qty - X WHERE id=? AND qty >= X` and check
   affected rows (`.returning(...)` length); only fetch current qty for the error msg.

**How to apply:** any new write that decrements a shared counter (stock, saldo, credits)
inside a transfer/move flow — guard every id against the tenant, and gate the decrement
with a `>= amount` predicate in the same UPDATE.
