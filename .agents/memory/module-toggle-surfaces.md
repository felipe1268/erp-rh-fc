---
name: Module toggle — sync across 4 surfaces
description: Adding a module to Configurações "Módulos do Sistema" toggles requires keeping 4 places in sync, plus a silent-drop gotcha.
---

Adding a new toggle for a module under Configurações → "Módulos do Sistema" touches FOUR coordinated surfaces. Miss one and the toggle/card silently misbehaves:

1. **Backend list** — add the key to the `ALL_MODULES` array in `moduleConfig.list` (`server/routers.ts`). Endpoint defaults `enabled:true` for keys with no `module_config` row (backward compatible — existing tenants keep the module visible). `moduleConfig.toggle` persists by free-form `moduleKey`, no schema change needed.
2. **Settings card** — add a `MODULE_INFO[key]` entry in `client/src/pages/Configuracoes.tsx` (label/icon/desc). **Silent-drop gotcha:** the card renderer does `if (!info) return null`, so a missing entry makes the toggle vanish with no error — this is the usual root cause of "novos módulos não aparecem aqui".
3. **Home tiles** — `ModuleHub.tsx`: `hubToConfigKey` mapping + the `modEnabled` check. Grouped-user **access** also gated here (`canAccessModule(permId)`); keep it textually aligned with DashboardLayout.
4. **Sidebar/home entry** — `DashboardLayout.tsx` `moduleDefs` gating.

**Hierarchical parent→child gating:** for a sub-module (e.g. `medicao-terceiros` under `terceiros`), require BOTH `isModEnabled("terceiros") && isModEnabled("medicao-terceiros")` for visibility in BOTH ModuleHub and DashboardLayout. Turning off the parent hides the child; turning off only the child hides just the child.

**Permission vs toggle are separate axes.** A toggle key (free-form, lives in `module_config`) is NOT necessarily a permission key (must be in `MODULE_DEFINITIONS`/`shared/modules.ts` for `canAccessModule` to ever return true). A sub-module can reuse the parent's permission (`canAccessModule("terceiros")`) while having its own independent toggle. If you OR in `canAccessModule("medicao-terceiros")` it's a no-op today (not a registered permission) but keeps surfaces consistent — mirror the exact same access expression in ModuleHub AND DashboardLayout or grouped-user access diverges between home tiles and sidebar.

**Why:** Rev. 3120 added the Medição Terceiros toggle; architect flagged that ModuleHub gated access by `terceiros` alone while DashboardLayout used the OR — functionally identical but a parity trap for future real permissions.
