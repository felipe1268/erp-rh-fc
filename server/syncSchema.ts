/**
 * syncSchema.ts — Sincronização automática de schema Drizzle → Neon
 *
 * Roda no startup do servidor. Compara as colunas definidas no schema Drizzle
 * com as colunas reais do banco Neon e executa ALTER TABLE ADD COLUMN IF NOT EXISTS
 * para qualquer coluna que falte. NUNCA apaga ou altera colunas existentes.
 */

import * as schema from "../drizzle/schema";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

type ColInfo = {
  tableName: string;
  columnName: string;
  sqlType: string;
  nullable: boolean;
  defaultExpr: string | null;
};

// ── Mapeamento de tipos Drizzle → DDL PostgreSQL ──────────────────────────────
function drizzleTypeToSql(col: any): string | null {
  const ct: string = col.columnType ?? "";

  if (ct === "PgSerial" || ct === "PgBigSerial" || ct === "PgSmallSerial") return null; // PK auto, pula
  if (ct === "PgInteger" || ct === "PgInt")  return "INTEGER";
  if (ct === "PgSmallInt")                   return "SMALLINT";
  if (ct === "PgBigInt")                     return "BIGINT";
  if (ct === "PgBoolean" || ct.toLowerCase().includes("bool"))  return "BOOLEAN";
  if (ct === "PgText")                       return "TEXT";
  if (ct === "PgReal")                       return "REAL";
  if (ct === "PgDoublePrecision")            return "DOUBLE PRECISION";
  if (ct === "PgDate")                       return "DATE";
  if (ct === "PgJson")                       return "JSON";
  if (ct === "PgJsonb")                      return "JSONB";
  if (ct === "PgUUID")                       return "UUID";

  if (ct === "PgVarchar") {
    const len = col.length ?? 255;
    return `VARCHAR(${len})`;
  }
  if (ct === "PgChar") {
    const len = col.length ?? 1;
    return `CHAR(${len})`;
  }
  if (ct === "PgNumeric" || ct === "PgDecimal") {
    const p = col.precision;
    const s = col.scale;
    if (p != null && s != null) return `NUMERIC(${p},${s})`;
    if (p != null) return `NUMERIC(${p})`;
    return "NUMERIC";
  }
  if (ct === "PgTimestamp") {
    return col.withTimezone ? "TIMESTAMP WITH TIME ZONE" : "TIMESTAMP WITHOUT TIME ZONE";
  }
  if (ct === "PgTime") {
    return col.withTimezone ? "TIME WITH TIME ZONE" : "TIME WITHOUT TIME ZONE";
  }
  // Tipo desconhecido — pula com segurança
  return null;
}

// ── Extrai colunas desejadas do schema Drizzle ────────────────────────────────
function extractSchemaColumns(): ColInfo[] {
  const result: ColInfo[] = [];

  for (const key of Object.keys(schema)) {
    const table = (schema as any)[key];
    if (!table || typeof table !== "object" || !table["_"]) continue;

    const meta = table["_"];
    const tableName: string | undefined = meta.name;
    const columns: Record<string, any> | undefined = meta.columns;

    if (!tableName || !columns) continue;

    for (const colKey of Object.keys(columns)) {
      const col = columns[colKey];
      if (!col || !col.name) continue;

      const sqlType = drizzleTypeToSql(col);
      if (!sqlType) continue; // serial / tipo desconhecido — pula

      result.push({
        tableName,
        columnName: col.name,
        sqlType,
        nullable: !col.notNull,
        defaultExpr: col.hasDefault && col.default !== undefined && col.default !== null
          ? String(col.default)
          : null,
      });
    }
  }

  return result;
}

// ── Busca colunas existentes no banco (todas de uma vez) ──────────────────────
async function fetchDbColumns(db: any): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const set = new Set<string>();
  const list = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  for (const row of list) {
    set.add(`${row.table_name}.${row.column_name}`);
  }
  return set;
}

// ── Ponto de entrada ──────────────────────────────────────────────────────────
export async function syncSchema(): Promise<void> {
  try {
    const db = await getDb();
    const schemaColumns = extractSchemaColumns();
    const dbColumns    = await fetchDbColumns(db);

    const missing = schemaColumns.filter(
      c => !dbColumns.has(`${c.tableName}.${c.columnName}`)
    );

    if (missing.length === 0) {
      console.log("[SyncSchema] Todas as colunas OK — nenhuma diferença.");
      return;
    }

    console.log(`[SyncSchema] ${missing.length} coluna(s) faltando no banco. Adicionando...`);

    let adicionadas = 0;
    const erros: string[] = [];

    for (const col of missing) {
      const nullClause = col.nullable ? "" : " NOT NULL";
      const stmt = `ALTER TABLE "${col.tableName}" ADD COLUMN IF NOT EXISTS "${col.columnName}" ${col.sqlType}${nullClause}`;
      try {
        await db.execute(sql.raw(stmt));
        console.log(`  [SyncSchema] ✔ ${col.tableName}.${col.columnName} (${col.sqlType})`);
        adicionadas++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        // Ignora se tabela não existe ainda (será criada em outro momento)
        if (msg.includes("does not exist") && msg.toLowerCase().includes("relation")) {
          // Tabela não existe — pula silenciosamente
        } else {
          erros.push(`${col.tableName}.${col.columnName}: ${msg}`);
          console.warn(`  [SyncSchema] ✗ ${col.tableName}.${col.columnName}: ${msg}`);
        }
      }
    }

    console.log(`[SyncSchema] Concluído: ${adicionadas} adicionada(s)${erros.length > 0 ? `, ${erros.length} erro(s)` : ""}.`);
  } catch (err: any) {
    console.error("[SyncSchema] Erro ao sincronizar schema:", err?.message ?? err);
  }
}
