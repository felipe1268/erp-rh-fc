---
name: obras table column casing + obra→orçamento link
description: Non-obvious schema quirks that broke Painel FD twice — obras uses camelCase columns and has no orcamento link column.
---

# `obras` / `orcamentos` schema quirks (cost us 2 revisions on Painel FD)

Column naming is INCONSISTENT across tables in this Neon DB. `obras` was
introspected and its columns are **camelCase**: `companyId`, `isActive` (NOT
`company_id` / `is_active`). Many other tables (e.g. `compras_ordens`, `bdi_fd`,
`orcamentos.deleted_at`) are snake_case. So raw `db.execute(sql\`... company_id
...\`)` against `obras` THROWS at runtime (`column "company_id" does not exist`).

`obras` also has **no orçamento column at all** — no `orcamento_id`. The
obra→orçamento link lives in the `orcamentos` table via `orcamentos.obraId` +
`orcamentos.companyId` (+ `deletedAt IS NULL`). To get an obra's budget, query
`orcamentos` (take first active, `orderBy(asc(id)).limit(1)`), do NOT read it
off `obras`.

**Why this matters:** `getSaldoFd` (Painel FD) had a raw SELECT against `obras`
using both phantom columns → it threw on every obra → the whole panel rendered
empty. esbuild does not catch it (no type-check on the build path).

**How to apply:** prefer Drizzle table objects (introspected names are correct)
over hand-written raw SQL for `obras`. If you must write raw SQL for `obras`,
quote camelCase columns: `"companyId"`, `"isActive"`. Never assume snake_case.
