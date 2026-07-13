---
name: Date object String().slice bug
description: pg driver returns Date objects; String(date).slice(0,10) produces "Fri May 15" not "2026-05-15", causing silent DB failures
---

## Rule

Never use `String(value).slice(0, 10)` alone to convert a DB date to an ISO string when the value may be a JavaScript `Date` object.

**Why:** The pg driver returns DATE/TIMESTAMPTZ columns as native `Date` objects. `String(new Date('2026-05-15T00:00:00.000Z'))` produces `"Thu May 15 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"`. `.slice(0, 10)` yields `"Thu May 15"` — not a valid ISO date. Any subsequent Postgres `::date` cast (`${dataFimStr}::date`) throws a type error, which may be silently swallowed by a `catch()` wrapper.

**How to apply:**

Always use this helper pattern wherever a DB-sourced date needs to become an ISO string:

```typescript
const toDateStr = (v: any) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
```

This handles both `Date` objects (from pg driver) and plain ISO strings (from some query paths).

**Real impact found:** `aprovarComDestinacao` in `horasExtras.ts` used `String(period.dataFim).slice(0,10)`. The INSERT into `banco_horas_lancamentos` failed silently every time — banco de horas was ALWAYS empty after approval. The bug was masked because `banco_horas_saldo` (updated one line earlier, not in a transaction) did receive partial credits, confusing diagnostics.

**Backfill pattern:** When an INSERT fails after a saldo UPSERT (no transaction), detect orphaned approvals at startup:
1. Find `he_periods` with `status='aprovado'` but no rows in `banco_horas_lancamentos` for that `hePeriodId`.
2. Re-insert lancamentos with idempotence guard (`SELECT 1 WHERE EXISTS` before INSERT).
3. Update saldo via `ON CONFLICT DO UPDATE` to accumulate correctly.
