---
name: Scorecard getCustosRH — month-end date construction
description: Using '-31' suffix to build end-of-month dates breaks months with <31 days (June/Apr/Sep/Nov/Feb).
---

## Rule
Never use `(mesVar || '-31')::date` to get the last day of a month.
Use `((mesVar || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date` instead.

**Why:** PostgreSQL rejects '2026-06-31', '2026-04-31', '2026-02-31' etc. with
"date/time field value out of range", which causes the tRPC call to fail and the UI
to show "Sem dados de folha para esta obra no período selecionado." even with real employees.

**How to apply:** Any time building an end-of-period date from a 'YYYY-MM' string,
use the +1month-1day pattern. This is already the pattern used in bridge_emps.
