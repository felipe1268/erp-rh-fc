---
name: Stripe restricted key breaks stripe-replit-sync
description: rk_test_/rk_live_ restricted API keys lack account-read scope that stripe-replit-sync needs internally; use a standard secret key instead.
---

`stripe-replit-sync`'s `StripeSync.getAccountId()` calls `stripe.accounts.retrieve()` on
almost every operation (webhook processing, upserts, `findOrCreateManagedWebhook`, product/price
sync — 30+ call sites). This requires the "Basic Business Contact Information Read"
(`accounts_kyc_basic_read`) permission.

A **restricted key** (`rk_test_.../rk_live_...`) created via Stripe Dashboard → Developers → API keys →
"Create restricted key" does NOT have this permission unless explicitly granted, and by default most
restricted keys people generate for a narrow purpose (e.g. only Products/Prices/Subscriptions) omit it.
Symptom: `StripePermissionError: Permission denied ... Enabling "Basic Business Contact Information Read"
would allow this request to continue`, thrown from deep inside the library, breaking almost every
feature (not just the one place you were testing).

**Why:** `STRIPE_SECRET_KEY` secret was set by the user with a restricted key, silently breaking the
entire stripe-replit-sync integration in a way that only surfaces when you actually exercise a code
path (migrations ran fine — pure SQL — but any Stripe-API-touching call hung/errored).

**How to apply:** When integrating `stripe-replit-sync` (or similar libs that need account context),
require a **standard secret key** (`sk_test_.../sk_live_...`), OR if the user insists on a restricted
key, tell them to explicitly add "Basic Business Contact Information Read" permission to it in the
Stripe Dashboard before testing.
