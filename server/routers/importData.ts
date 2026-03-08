import { getDb } from "../db";
import { sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { z } from "zod";

// Schema de validação para importação
const importTableSchema = z.object({
    tableName: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.any())),
});

const importDataSchema = z.object({
    tables: z.array(importTableSchema),
    mode: z.enum(["insert", "upsert", "replace"]).default("insert"),
});

export type ImportData = z.infer<typeof importDataSchema>;
export type ImportTableData = z.infer<typeof importTableSchema>;

// Mapa de tabelas do schema para acesso dinâmico
const schemaTableMap: Record<string, any> = {};
for (const [key, value] of Object.entries(schema)) {
    if (value && typeof value === "object" && "name" in value) {
          // Tabelas Drizzle têm a propriedade 'name' com o nome da tabela SQL
      schemaTableMap[(value as any).name] = value;
    }
}

/**
 * Lista todas as tabelas disponíveis no schema
 */
export async function getAvailableTables() {
    const db = await getDb();
    if (!db) return [];

  try {
        const result = await db.execute(sql`SHOW TABLES`);
        return (result as any)[0]?.map((row: any) => Object.values(row)[0]) || [];
  } catch (error) {
        console.error("[Import] Erro ao listar tabelas:", error);
        return Object.keys(schemaTableMap);
  }
}

/**
 * Obtém a estrutura de uma tabela (colunas e tipos)
 */
export async function getTableStructure(tableName: string) {
    const db = await getDb();
    if (!db) return null;

  try {
        const result = await db.execute(sql.raw(`DESCRIBE \`${tableName}\``));
        return (result as any)[0]?.map((row: any) => ({
                name: row.Field,
                type: row.Type,
                nullable: row.Null === "YES",
                key: row.Key,
          default: row.Default,
                extra: row.Extra,
        })) || [];
  } catch (error) {
        console.error(`[Import] Erro ao descrever tabela ${tableName}:`, error);
        return null;
  }
}

/**
 * Importa dados para uma tabela específica
 */
export async function importTableData(
    tableData: ImportTableData,
    mode: string = "insert"
  ): Promise<{ success: boolean; table: string; rowsImported: number; errors: string[] }> {
    const db = await getDb();
    if (!db) {
          return { success: false, table: tableData.tableName, rowsImported: 0, errors: ["Banco de dados não disponível"] };
    }

  const errors: string[] = [];
    let rowsImported = 0;

  try {
        const { tableName, columns, rows } = tableData;

      if (!rows.length) {
              return { success: true, table: tableName, rowsImported: 0, errors: [] };
      }

      // Escape column names
      const escapedColumns = columns.map(c => `\`${c}\``).join(", ");

      // Inserir em lotes de 100 linhas
      const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);

          const valueSets = batch.map(row => {
                    const values = row.map(val => {
                                if (val === null || val === undefined || val === "") return "NULL";
                                if (typeof val === "number") return String(val);
                                if (typeof val === "boolean") return val ? "1" : "0";
                                // Escape string values
                                                     const escaped = String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                                return `'${escaped}'`;
                    });
                    return `(${values.join(", ")})`;
          });

          let query: string;
                if (mode === "replace") {
                          query = `REPLACE INTO \`${tableName}\` (${escapedColumns}) VALUES ${valueSets.join(", ")}`;
                } else if (mode === "upsert") {
                          const updateCols = columns
                            .filter(c => c !== "id")
                            .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
                            .join(", ");
                          query = `INSERT INTO \`${tableName}\` (${escapedColumns}) VALUES ${valueSets.join(", ")} ON DUPLICATE KEY UPDATE ${updateCols}`;
                } else {
                          query = `INSERT IGNORE INTO \`${tableName}\` (${escapedColumns}) VALUES ${valueSets.join(", ")}`;
                }

          try {
                    await db.execute(sql.raw(query));
                    rowsImported += batch.length;
          } catch (batchError: any) {
                    errors.push(`Lote ${i / batchSize + 1}: ${batchError.message}`);
          }
        }

      return { success: errors.length === 0, table: tableName, rowsImported, errors };
  } catch (error: any) {
        return { success: false, table: tableData.tableName, rowsImported, errors: [error.message] };
  }
}

/**
 * Importa dados completos (múltiplas tabelas)
 */
export async function importAllData(data: ImportData) {
    const results = [];

  for (const tableData of data.tables) {
        const result = await importTableData(tableData, data.mode);
        results.push(result);
  }

  return {
        success: results.every(r => r.success),
        totalTablesProcessed: results.length,
        totalRowsImported: results.reduce((sum, r) => sum + r.rowsImported, 0),
        results,
  };
}

/**
 * Converte CSV para formato de importação
 */
export function parseCSVToImportFormat(csvContent: string, tableName: string): ImportTableData {
    const lines = csvContent.split("\n").filter(l => l.trim());
    if (lines.length < 2) {
          return { tableName, columns: [], rows: [] };
    }

  // Primeira linha = cabeçalhos
  const columns = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  // Demais linhas = dados
  const rows = lines.slice(1).map(line => {
        // Parse CSV simples (suporta aspas)
                                      const values: any[] = [];
        let current = "";
        let inQuotes = false;

                                      for (let i = 0; i < line.length; i++) {
                                              const char = line[i];
                                              if (char === '"') {
                                                        inQuotes = !inQuotes;
                                              } else if (char === "," && !inQuotes) {
                                                        values.push(current.trim());
                                                        current = "";
                                              } else {
                                                        current += char;
                                              }
                                      }
        values.push(current.trim());

                                      return values.map(v => {
                                              if (v === "" || v === "NULL" || v === "null") return null;
                                              return v;
                                      });
  });

  return { tableName, columns, rows };
}

export { importDataSchema, importTableSchema };
