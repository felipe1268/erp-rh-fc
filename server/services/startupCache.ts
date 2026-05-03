import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ============================================================
// STARTUP CACHE — key-value simples no banco Neon
// Evita re-executar operações caras a cada restart do servidor
// (ColFix ALTER TABLE, retroação financeira, etc.)
// ============================================================

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS startup_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    tableReady = true;
  } catch {}
}

export async function getCache(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTable();
    const res = await db.execute(sql`SELECT value FROM startup_cache WHERE key = ${key}`);
    const rows = (res as any)?.rows ?? [];
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTable();
    await db.execute(sql`
      INSERT INTO startup_cache (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `);
  } catch {}
}

export async function isRecentCache(key: string, maxAgeMs: number): Promise<boolean> {
  const val = await getCache(key);
  if (!val) return false;
  try {
    const elapsed = Date.now() - new Date(val).getTime();
    return elapsed < maxAgeMs;
  } catch {
    return false;
  }
}
