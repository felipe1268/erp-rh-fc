---
name: Billing module active/inactive toggle
description: How "commercializable" (isActive) differs from price overrides for SaaS catalog modules, and the grandfather rule for existing subscribers.
---

`billing_module_prices` carries TWO independent overrides per module: `monthly_price_cents` and `is_active`. They must be updated by SEPARATE mutations/SET clauses — a price-only update must never touch `is_active` and vice versa (each is a distinct admin action with a distinct upsert).

`server/billingCatalog.ts` → `getEffectiveCatalog()` is the single source of truth, returning both:
- `modules` — ALL modules (including inactive), for surfaces where existing subscribers manage what they already have (e.g. `getMySubscription`, `saasAdmin` breakdown).
- `sellableModules` — active-only subset, for surfaces that sell to NEW customers (public `getCatalog` / `/planos` / checkout).

**Grandfather rule**: deactivating a module never revokes it from subscribers who already have it. Any endpoint that lets a subscriber ADD a module (`createCheckoutSession`, `updateSubscription`) must diff against the subscriber's CURRENT module set first — block only the ones being newly added while inactive, not ones already contracted.

**Why:** the business wants to stop selling a module going forward without breaking existing customers' access or billing (no forced downgrade).

**How to apply:** any new billing surface that lists modules must decide which set (`modules` vs `sellableModules`) it needs, and any mutation that adds modules to an existing subscription must fetch current module ids before validating against `sellableModules`.
