---
name: Batch-sync per-op tenant guard (contract-level BOLA)
description: Idempotent batch sync endpoints must validate the parent's CONTRATO, not just companyId, on every id/uuid-targeted op.
---

# Batch-sync per-op tenant guard

In batch "sync queue" style endpoints (e.g. `medicao.sincronizarLote` in
`server/routers/medicao.ts`), each op references a row by `id` or client-stable
`uuid`. Filtering the lookup by `companyId` alone is NOT enough: a user with
access to company X but contrato A could pass an `id`/`uuid` of a row under
contrato B (same company) and update/delete it.

**Rule:** for every id/uuid-targeted op (upsert-existing, delete, calibrar),
resolve the target row first, then validate its parent (`medicaoCampoId`)
belongs to BOTH the input company AND the input `contratoId` via a helper like
`campoValido(parentId)` before mutating. Scope uuid dedup lookups to the
validated parent id too, so a uuid can't collide across contratos.

**Why:** the batch endpoint is broadly reachable and trusts client-supplied
ids/uuids; company-only scoping leaves a contract-level BOLA within the same
tenant.

**How to apply:** non-found / non-owned delete = no-op but still report `"ok"`
(idempotent). Non-owned upsert/calibrar = explicit error op result, never a
silent cross-contrato write.

**Client side:** the server caps the lote (`.max(500)`). The client
(`client/src/lib/levantamentoSync.ts` `processQueue`) must chunk each
company|contrato group into slices below that cap (CHUNK=400) or a large offline
backlog throws on the first sync.
