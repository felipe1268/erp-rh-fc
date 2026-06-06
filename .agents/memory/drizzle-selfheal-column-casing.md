---
name: Drizzle camelCase vs self-heal snake_case column mismatch
description: Tables created by raw-SQL self-heal use snake_case columns; the drizzle schema must name them explicitly or EVERY query to that table fails.
---

This drizzle instance has NO global `casing: 'snake_case'` config (`drizzle(_pool)` in server/db.ts, no options). So a field written `companyId: integer()` (no explicit name) maps to a literal column `"companyId"` (camelCase).

But self-heal tables created via raw `CREATE TABLE` in server/_core/index.ts use snake_case (`company_id`). If the drizzle schema for such a table omits the explicit column name, drizzle generates `"companyId"` and EVERY query throws `column "companyId" does not exist`.

**Symptom seen:** reads failed silently (caller fell back to permissive defaults → looked "all enabled"); writes surfaced as a TRPCError toast. Table stayed empty because nothing ever persisted.

**Why:** the codebase mixes nameless `companyId: integer()` tables (DB columns ARE camelCase, created by drizzle migrations) with explicit `integer("company_id")` tables (DB columns are snake_case). A raw-SQL self-heal table is in the snake_case camp but is easy to define with the camelCase (nameless) style by mistake.

**How to apply:** when adding a drizzle schema entry for a table whose DDL lives in a raw self-heal CREATE TABLE, match the casing exactly — give every snake_case column an explicit name (`integer("company_id")`, etc.). To verify before trusting it, run the real drizzle path against Neon (a `tsx` script importing getDb + the table), not just a raw `pg` insert — raw SQL with the literal column name hides the ORM mapping bug.
