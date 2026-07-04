---
name: Almoxarifado transfer endpoints used wrong access guard
description: createTransferencia* endpoints used the generic obra guard instead of the almox-specific one, blocking common users
---

`createTransferenciaOrigemDestino` and `createTransferenciaLote` in `server/routers/warehouse.ts` used `userCanAccessObra` (checks only `allowed_obra_ids` / "acesso a todas as obras" group) instead of `userCanAccessObraAlmox` (same, PLUS grants access via `obra_funcionarios` operational allocation — see Rev. 2542). They were the only two almoxarifado mutations in the file using the stricter guard; every other almox mutation already used the almox-specific one.

**Why:** a symptom reported as "only admin can do X, common users can't" inside a module that otherwise works fine for common users is a strong signal of ONE mutation using a different/stricter authz guard than its siblings — not necessarily a training/UX issue, even if it looks that way at first glance.

**How to apply:** when investigating "works for admin only" reports in the almoxarifado module, grep all `userCanAccessObra(` calls in the affected router file and diff which ones use the plain vs `*Almox` variant. Any lone outlier is the likely culprit.
