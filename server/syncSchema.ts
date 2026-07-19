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
  isPk: boolean;
  isSerial: boolean;
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

      const ct: string = col.columnType ?? "";
      const isSerial = ct === "PgSerial" || ct === "PgBigSerial" || ct === "PgSmallSerial";
      const isPk = !!col.primary || !!col.primaryKey;

      const sqlType = drizzleTypeToSql(col);
      if (!sqlType && !isSerial) continue;

      result.push({
        tableName,
        columnName: col.name,
        sqlType: isSerial ? "SERIAL" : sqlType!,
        nullable: !col.notNull,
        defaultExpr: col.hasDefault && col.default !== undefined && col.default !== null
          ? String(col.default)
          : null,
        isPk: isPk || isSerial,
        isSerial,
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

function extractSchemaTables(): Set<string> {
  const tables = new Set<string>();
  for (const key of Object.keys(schema)) {
    const table = (schema as any)[key];
    if (!table || typeof table !== "object" || !table["_"]) continue;
    const name: string | undefined = table["_"].name;
    if (name) tables.add(name);
  }
  return tables;
}

async function fetchDbTables(db: any): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
  `);
  const set = new Set<string>();
  const list = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  for (const row of list) set.add(row.table_name);
  return set;
}

function resolveDefaultSql(col: ColInfo): string {
  if (!col.defaultExpr) return "";
  const d = col.defaultExpr;
  if (d === "now()" || d.includes("now()")) return " DEFAULT NOW()";
  if (d === "true") return " DEFAULT true";
  if (d === "false") return " DEFAULT false";
  if (/^-?\d+(\.\d+)?$/.test(d)) return ` DEFAULT ${d}`;
  if (d === "gen_random_uuid()") return " DEFAULT gen_random_uuid()";
  return ` DEFAULT '${d.replace(/'/g, "''")}'`;
}

function buildCreateTable(tableName: string, cols: ColInfo[]): string {
  const colDefs: string[] = [];
  const pkCols: string[] = [];

  for (const c of cols) {
    if (c.isSerial) {
      colDefs.push(`"${c.columnName}" SERIAL`);
      pkCols.push(`"${c.columnName}"`);
      continue;
    }
    const nullClause = c.nullable ? "" : " NOT NULL";
    const defClause = resolveDefaultSql(c);
    colDefs.push(`"${c.columnName}" ${c.sqlType}${nullClause}${defClause}`);
    if (c.isPk) pkCols.push(`"${c.columnName}"`);
  }

  if (pkCols.length > 0) {
    colDefs.push(`PRIMARY KEY (${pkCols.join(", ")})`);
  }

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(", ")})`;
}

// ── Ponto de entrada ──────────────────────────────────────────────────────────
export async function syncSchema(): Promise<void> {
  try {
    const db = await getDb();
    const schemaColumns = extractSchemaColumns();
    const schemaTables  = extractSchemaTables();
    const dbTables      = await fetchDbTables(db);

    const missingTables = [...schemaTables].filter(t => !dbTables.has(t));
    if (missingTables.length > 0) {
      console.log(`[SyncSchema] ${missingTables.length} tabela(s) faltando. Criando...`);
      for (const tbl of missingTables) {
        const tblCols = schemaColumns.filter(c => c.tableName === tbl);
        const stmt = buildCreateTable(tbl, tblCols);
        try {
          await db.execute(sql.raw(stmt));
          console.log(`  [SyncSchema] ✔ Tabela criada: ${tbl}`);
        } catch (err: any) {
          console.warn(`  [SyncSchema] ✗ Erro criando ${tbl}: ${err?.message ?? err}`);
        }
      }
    }

    const dbColumns = await fetchDbColumns(db);
    const missing = schemaColumns.filter(
      c => !c.isSerial && !dbColumns.has(`${c.tableName}.${c.columnName}`)
    );

    // ── Backfill Rev. 4406: descrição de financial_entries PJ ───────────────
    try {
      // Primeiro: conta quantas precisam de atualização
      const countRes = await db.execute(sql`
        SELECT COUNT(*) AS n
        FROM financial_entries fe
        WHERE fe.origem_modulo = 'pagamento_pj'
          AND fe.descricao NOT LIKE '%Contrato #%'
      `);
      const pending = parseInt((countRes.rows?.[0] as any)?.n ?? '0', 10);
      console.log(`[SyncSchema+ Rev.4406] ${pending} financial_entries PJ aguardando enriquecimento.`);
      if (pending > 0) {
        await db.execute(sql`
          UPDATE financial_entries fe
          SET descricao        = sub.rich,
              origem_descricao = sub.rich
          FROM (
            SELECT pp.id AS pid,
                   CONCAT(e."nomeCompleto", ' - Contrato #', pp."contractId",
                     ' - ', CASE WHEN pp.tipo = 'fechamento' THEN '2a Medicao' ELSE '1a Medicao' END,
                     ' - ', LPAD(SPLIT_PART(pp."mesReferencia", '-', 2), 2, '0'),
                     '/', SPLIT_PART(pp."mesReferencia", '-', 1)) AS rich
            FROM pj_payments pp
            JOIN employees e ON e.id = pp."employeeId"
          ) sub
          WHERE fe.origem_modulo = 'pagamento_pj'
            AND fe.origem_id     = sub.pid
            AND fe.descricao NOT LIKE '%Contrato #%'
        `);
        console.log(`[SyncSchema+ Rev.4406] Backfill concluído.`);
      }
    } catch (bfErr: any) {
      console.warn("[SyncSchema+ Rev.4406] Backfill descrição PJ:", bfErr?.message ?? bfErr);
    }

    if (missing.length === 0) {
      console.log("[SyncSchema] Todas as colunas OK — nenhuma diferença.");
      return;
    }

    console.log(`[SyncSchema] ${missing.length} coluna(s) faltando no banco. Adicionando...`);

    let adicionadas = 0;
    const erros: string[] = [];

    for (const col of missing) {
      const nullClause = col.nullable ? "" : " NOT NULL";
      const defClause = resolveDefaultSql(col);
      const stmt = `ALTER TABLE "${col.tableName}" ADD COLUMN IF NOT EXISTS "${col.columnName}" ${col.sqlType}${nullClause}${defClause}`;
      try {
        await db.execute(sql.raw(stmt));
        console.log(`  [SyncSchema] ✔ ${col.tableName}.${col.columnName} (${col.sqlType})`);
        adicionadas++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("does not exist") && msg.toLowerCase().includes("relation")) {
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
