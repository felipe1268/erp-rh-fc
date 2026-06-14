---
name: Registering a new sidebar ModuleId
description: Checklist of all the exhaustive places a new ModuleId must be added so navigation works and TS compiles
---

# Adding a new dedicated module (its own sidebar/command bar)

To give a route its own sidebar (instead of inheriting another module's full menu),
create a new `ModuleId`. It must be registered in EVERY exhaustive `Record<ModuleId, ...>`
or TS breaks / the module renders wrong:

- `client/src/contexts/ModuleContext.tsx`: (1) `ModuleId` union type; (2) `ROUTE_MODULE_MAP`
  (point the route at the new id — exact-match wins over longest-prefix, so a sub-route of
  another module can split off); (3) `MODULE_LABELS`; (4) the long `||` localStorage
  validation in the `useState` initializer (else a saved value falls back to "rh-dp").
- `client/src/components/DashboardLayout.tsx`: (1) a new `menuSections*` array; (2)
  `MODULE_SECTIONS`; (3) `MODULE_HOME_ROUTES`; (4) `MODULE_THEME`; (5) an entry in
  `ALL_MODULE_DEFS` (the module selector dropdown) with a `canSee` gate.

**Why:** `MODULE_SECTIONS`/`MODULE_HOME_ROUTES`/`MODULE_THEME` are exhaustive
`Record<ModuleId,...>` — miss one and `tsc` errors; miss the localStorage validation and
the saved module silently resets.

**How to apply (permissions):** a dedicated module can REUSE an existing permission
instead of inventing a new one. Keep the route's feature in `shared/modules.ts`
(`routeToFeatureKey` resolves the per-route ACL from `MODULE_DEFINITIONS`) and make the
`canSee`/home-card gate call `canAccessModule("<existing>")`. The home card uses the same
trick via an optional `permId` (id of card ≠ id of permission module). Removing a menu
item from a module's `menuSections*` does NOT change its ACL — the feature stays in modules.ts.
