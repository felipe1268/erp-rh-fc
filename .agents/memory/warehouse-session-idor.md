---
name: Warehouse inventory session access guards
description: Why getInventorySessionItems guards by deriving company/obra from the session row, and the IDOR pattern to watch for in warehouse read endpoints.
---

# Warehouse inventory session detail — guard by session row, not by input

`warehouse.getInventorySessionItems` takes ONLY `{ sessionId }` (kept that way for
backward compat with the weekly Inventário caller). It has NO companyId/obraId in its
input, so the access guard must **load the session row first and derive
company/obra from it**, then validate against `getCompaniesForUser` +
`getEffectiveAllowedObraIds` (central sessions have `obraId = null` → company-only check).

**Why:** Until Rev. 2686 this endpoint had no guard at all — any authenticated user
could enumerate `sessionId` and read another tenant's/obra's counted items (IDOR /
Broken Access Control). It was low-risk while only the company-scoped weekly page
reached it, but the new read-only "Histórico de Inventário" panel lets users browse
sessions, which exposed it.

**How to apply:** Any warehouse read endpoint that accepts a bare global id
(`sessionId`, `baiaId`, `leituraId`, etc.) and is reachable from a browse/history
screen MUST resolve the owning company+obra from the DB row and authorize before
returning data. Mirror the tenant+obra guard used in `baiaListar` /
`historicoInventarioSemanal`. Do NOT trust that "the caller only passes ids it owns".
