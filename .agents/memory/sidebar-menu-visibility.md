---
name: Sidebar menu item visibility for non-master users
description: Adding a new sidebar menu item requires registering it in TWO permission places, or non-master users won't see it.
---

# Adding a new sidebar/menu item (ERP FC)

Adding an item to a `menuSections*` array in `client/src/components/DashboardLayout.tsx` is NOT enough. For non-admin-master users the menu is filtered, so the new route also needs permission registration:

1. **Individual mode (user without group):** the route must pass the `individualCheck` filter in `DashboardLayout.tsx`. Either add it to the `sharedPaths` whitelist (visible if the user has ANY accessible module — like `/empresas`, `/clientes`) OR register it as a feature so `routeToFeatureKey` resolves it.
2. **Group mode (user in a group):** `groupCanAccessRoute()` in `client/src/contexts/PermissionsContext.tsx` resolves the route via `SHARED_FEATURES` or `MODULE_DEFINITIONS.features` in `shared/modules.ts`. If the route isn't a feature of any module, it returns false and the item is hidden.

**Why:** the simplest, lowest-risk pattern is to mirror an existing sibling item (e.g. `/clientes`): add the route as a feature of the same module in `shared/modules.ts` AND add it to the `sharedPaths` array. Admin-master bypasses all filters, so testing only as master hides this bug.

**How to apply:** when asked to "add X to the menu", register the route in (a) the menu section array, (b) the App.tsx route, (c) `shared/modules.ts` module features, and (d) the `sharedPaths` whitelist. Editing `shared/modules.ts` forces a full Vite reload (HMR "Failed to reload" on importers like ModuleHub/PermissionsContext) — that is expected, not an error.
