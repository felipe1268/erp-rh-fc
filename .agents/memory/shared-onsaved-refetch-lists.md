---
name: Shared onSaved callbacks must refetch ALL dependent lists
description: A save dialog's onSaved/onSuccess callback shared across screens must invalidate every list/query that the write can affect, not just the obvious ones.
---

A shared save callback (e.g. `ManualEntryDialog`'s `onSaved` → `handleManualSaved`
in `FechamentoPonto.tsx`) must refetch **every** query whose data the underlying
write can change — not only the screen where the dialog was opened.

**Why:** In Fechamento de Ponto the manual-entry dialog's backend (`manualEntry`)
also auto-resolves the day's `time_inconsistencies` (status → `ajustado`), but the
callback only refetched stats/summary/conflitos, NOT `inconsistencies`. So the
backend correctly marked the row resolved, yet the list (default filter
"Pendentes") never reloaded and the row stayed visible — making "Corrigir" look
broken and forcing the user to also "Justificar".

**How to apply:** When a backend mutation has *side effects beyond the primary
record* (cascades, status flips on related tables), trace which client queries
read those tables and add them to the onSaved/onSettled refetch (or invalidate the
relevant query keys). Treat the mutation's full write set as the refetch set.

**Related hardening lesson:** an auto-resolve UPDATE scoped only by
`employeeId + data` should also carry a tenant filter
(`companyFilter(table.companyId, input)`) and constrain to the current state
(`status='pendente'`) so it can't touch other tenants' rows or rewrite already
resolved/justified rows.
