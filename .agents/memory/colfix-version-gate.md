---
name: ColFix self-heal block is version-gated
description: Adding an ALTER/backfill to the [ColFix] block in server/_core/index.ts requires bumping COLFIX_VERSION or it silently skips.
---

The `[ColFix]` self-heal block in `server/_core/index.ts` (distinct from `[SyncSchema+]`) is guarded by a constant `COLFIX_VERSION`. On boot it reads cached `colfix_version` (startupCache) and, if it equals `COLFIX_VERSION`, it logs `"[ColFix] Versão ok, pulando migrations."` and RETURNS EARLY — skipping every ALTER/UPDATE in that block.

**Why:** the block is an expensive one-shot migration run; the version cache avoids re-running it every boot.

**How to apply:** when you add a new `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / backfill `UPDATE` to the `[ColFix]` block, you MUST also bump the `COLFIX_VERSION` string (e.g. `v3273-2026-06-18-...`). Otherwise the new DDL never runs and the column stays missing in Neon even though the code looks correct — and downstream `db.select()` of that column throws (e.g. `ferias.list` 500). The matching `[SyncSchema+]` block runs differently (not version-gated the same way), so verify which block you edited. Always confirm the column actually landed by querying NEON_DATABASE_URL directly (the executeSql tool hits the Replit Postgres, not the app DB).
