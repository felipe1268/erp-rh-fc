---
name: Master-only field must gate at backend
description: A field meant only for Admin Master must be removed from the API payload by role server-side, not just hidden in the UI.
---

When a column is "internal / only Admin Master can see it", hiding it in the React component is NOT enough — the data still ships in the tRPC payload to every authorized caller.

**Rule:** strip the field from the returned rows when `ctx.user.role !== "admin_master"`.

**Why:** `portalExterno.dashboardAvaliacoesCliente` does `db.select().from(clienteAvaliacoes)` (all columns) and returns `avaliacoes: rows.slice(0,100)`. Any new column flows automatically to every role. A front-only `isMaster` gate leaves the value readable in the network payload.

**How to apply:** in the dashboard query, branch on role — admin_master gets full rows; others get rows with the sensitive key destructured out. Remember to add `ctx` to the handler destructure (`async ({ input, ctx })`) since these dashboard queries often omit it.
