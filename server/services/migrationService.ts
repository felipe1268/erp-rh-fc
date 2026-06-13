/**
 * Serviço de Migração Completa do ERP
 *
 * Exporta: banco de dados completo (JSON) + bytes reais dos arquivos (uploaded_files)
 *          + código-fonte do projeto → 100% de independência de plataforma.
 * Importa: restaura todas as tabelas no banco de destino.
 *
 * IMPORTANTE: este app roda em PostgreSQL (Neon) via drizzle-orm/node-postgres.
 * Identificadores usam aspas duplas ("tabela") e o resultado de db.execute vem em
 * `result.rows`. (A versão anterior estava em sintaxe MySQL — crases e rows[0] —
 * por isso TODA query falhava e a exportação não lia nada → "Fetch is aborted".)
 *
 * Formato do pacote ZIP (rota de streaming /api/migration/export-completo.zip):
 *   /banco/<tabela>.json     - Cada tabela em um arquivo JSON separado (exceto blobs)
 *   /banco/_meta.json        - Metadados (versão, data, estatísticas)
 *   /banco-completo.json     - TODAS as tabelas (inclui uploaded_files) p/ importação
 *   /arquivos-manifesto.json - Mapeamento de documentos com URLs originais
 *   /codigo-fonte/**         - Código-fonte completo do projeto (sem node_modules)
 *   /README-MIGRACAO.md      - Instruções de migração
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { storagePut } from "../storage";
import archiver from "archiver";
import { Readable } from "stream";

// ============================================================
// TABELAS PESADAS (blobs base64) — não carregadas em memória;
// só entram no export via streaming paginado.
// ============================================================
const HEAVY_TABLES = new Set<string>(["uploaded_files"]);

// Campos que contêm URLs de arquivos (para o manifesto de documentos)
const FILE_URL_FIELDS: Record<string, string[]> = {
  accidents: ["documentoUrl"],
  asos: ["documentoUrl"],
  atestados: ["documentoUrl"],
  audits: ["documentoUrl"],
  chemicals: ["fispqUrl"],
  cipa_meetings: ["ataDocumentoUrl"],
  companies: ["logoUrl"],
  company_documents: ["documentoUrl"],
  convencao_coletiva: ["documentoUrl"],
  dds: ["documentoUrl", "fotosUrls"],
  dissidios: ["documentoUrl"],
  employee_documents: ["fileUrl"],
  employees: ["fotoUrl", "docRgUrl", "docCnhUrl", "docCtpsUrl", "docComprovanteResidenciaUrl",
    "docCertidaoNascimentoUrl", "docTituloEleitorUrl", "docReservistaUrl", "docOutrosUrl"],
  epi_deliveries: ["fichaUrl", "fotoEstadoUrl", "assinaturaUrl"],
  epi_assinaturas: ["fileUrl"],
  employee_contracts: ["modeloContratoUrl", "contratoAssinadoUrl"],
  pj_medicoes: ["notaFiscalUrl"],
  pj_payments: ["comprovanteUrl"],
  pagamentos_parceiros: ["comprovanteUrl"],
  payroll_uploads: ["fileUrl"],
  processo_documentos: ["documentoUrl"],
  training_documents: ["fileUrl"],
  trainings: ["certificadoUrl"],
  users: ["avatarUrl"],
  warnings: ["documentoUrl"],
  empresas_terceiras: ["pgrUrl", "pcmsoUrl", "contratoSocialUrl", "alvaraUrl", "seguroVidaUrl"],
  funcionarios_terceiros: ["fotoUrl", "asoUrl", "treinamentoNrUrl", "certificadosUrl",
    "asoDocUrl", "nr35DocUrl", "nr10DocUrl", "nr33DocUrl", "integracaoDocUrl"],
  obrigacoes_mensais_terceiros: ["fgtsUrl", "inssUrl", "folhaPagamentoUrl",
    "comprovantePagamentoUrl", "gpsUrl", "cndUrl"],
  parceiros_conveniados: ["contratoConvenioUrl", "contratoSocialUrl_parceiro"],
};

export interface ExportProgress {
  phase: "database" | "files" | "packaging" | "done" | "error";
  currentTable?: string;
  tablesProcessed: number;
  totalTables: number;
  filesProcessed: number;
  totalFiles: number;
  message: string;
}

export interface ExportResult {
  success: boolean;
  downloadUrl?: string;
  stats: {
    tablesExported: number;
    totalRecords: number;
    filesExported: number;
    totalSizeBytes: number;
    duration: number;
  };
  error?: string;
}

export interface ImportResult {
  success: boolean;
  stats: {
    tablesImported: number;
    totalRecords: number;
    filesImported: number;
    duration: number;
  };
  errors: string[];
}

// ============================================================
// HELPERS DE BANCO (PostgreSQL)
// ============================================================

function rowsOf(result: any): any[] {
  return (result && Array.isArray(result.rows)) ? result.rows : (Array.isArray(result) ? result : []);
}

/**
 * Descobre TODAS as tabelas do schema public dinamicamente.
 * Inclui automaticamente tabelas futuras e a tabela `uploaded_files`
 * (que guarda os bytes reais dos documentos em base64).
 */
async function getAllTableNames(db: any): Promise<string[]> {
  const result = await db.execute(sql.raw(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  ));
  return rowsOf(result).map((r: any) => r.tablename).filter(Boolean);
}

async function countTable(db: any, tableName: string): Promise<number> {
  try {
    const result = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM "${tableName}"`));
    return rowsOf(result)[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================
// EXPORTAÇÃO (carregamento em memória — exclui blobs pesados)
// ============================================================

/**
 * Exporta o banco em memória (tabelas estruturadas), EXCETO as tabelas pesadas
 * de blobs (uploaded_files), que são tratadas via streaming. Coleta também o
 * manifesto de URLs de arquivos. Usado por stats / exports legados / streaming.
 */
export async function exportDatabase(
  onProgress?: (p: ExportProgress) => void
): Promise<{
  tables: Record<string, any[]>;
  meta: any;
  fileUrls: Array<{ table: string; field: string; rowId: any; url: string }>;
  allTables: string[];
  heavyCounts: Record<string, number>;
}> {
  const db = await getDb();
  const allTables = await getAllTableNames(db);
  const tables: Record<string, any[]> = {};
  const heavyCounts: Record<string, number> = {};
  const fileUrls: Array<{ table: string; field: string; rowId: any; url: string }> = [];
  let totalRecords = 0;

  for (let i = 0; i < allTables.length; i++) {
    const tableName = allTables[i];
    onProgress?.({
      phase: "database",
      currentTable: tableName,
      tablesProcessed: i,
      totalTables: allTables.length,
      filesProcessed: 0,
      totalFiles: 0,
      message: `Exportando tabela: ${tableName}`,
    });

    // Tabelas pesadas: só conta (não carrega bytes em memória)
    if (HEAVY_TABLES.has(tableName)) {
      const n = await countTable(db, tableName);
      heavyCounts[tableName] = n;
      totalRecords += n;
      tables[tableName] = [];
      continue;
    }

    try {
      const result = await db.execute(sql.raw(`SELECT * FROM "${tableName}"`));
      const data = rowsOf(result);
      tables[tableName] = data;
      totalRecords += data.length;

      // Coletar URLs de arquivos para o manifesto
      const urlFields = FILE_URL_FIELDS[tableName];
      if (urlFields && data.length > 0) {
        for (const row of data) {
          for (const field of urlFields) {
            const snakeField = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
            const value = row[field] ?? row[snakeField];
            if (value && typeof value === "string" && value.startsWith("http")) {
              fileUrls.push({ table: tableName, field, rowId: row.id ?? row.ID, url: value });
            } else if (Array.isArray(value)) {
              for (const url of value) {
                if (typeof url === "string" && url.startsWith("http")) {
                  fileUrls.push({ table: tableName, field, rowId: row.id, url });
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Migration] Erro ao exportar ${tableName}: ${e.message}`);
      tables[tableName] = [];
    }
  }

  const tableStats = [
    ...Object.entries(tables)
      .filter(([name]) => !HEAVY_TABLES.has(name))
      .map(([name, rows]) => ({ table: name, records: rows.length })),
    ...Object.entries(heavyCounts).map(([name, n]) => ({ table: name, records: n })),
  ].filter((t) => t.records > 0).sort((a, b) => b.records - a.records);

  const meta = {
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    platform: "ERP FC Engenharia (PostgreSQL/Neon)",
    totalTables: allTables.length,
    totalRecords,
    totalFiles: fileUrls.length,
    tableStats,
  };

  return { tables, meta, fileUrls, allTables, heavyCounts };
}

// ============================================================
// README DE MIGRAÇÃO
// ============================================================
const MIGRATION_README = `# Guia de Migração — ERP FC Engenharia

Este pacote contém **100% dos dados, arquivos e código** do ERP para você rodar
em qualquer plataforma (Railway, Render, Fly.io, VPS própria, etc.) com total
independência. O banco é **PostgreSQL**.

## Conteúdo do Pacote ZIP

\`\`\`
/banco/<tabela>.json      - Dados de cada tabela em JSON separado (para conferência)
/banco/_meta.json         - Metadados da exportação (data, estatísticas)
/banco-completo.json      - TODAS as tabelas em um único arquivo (use na importação)
                            Inclui a tabela "uploaded_files" com os BYTES dos
                            documentos (base64) — restaurar o banco restaura os arquivos.
/arquivos-manifesto.json  - Lista de documentos com URLs originais (referência)
/codigo-fonte/            - Código-fonte completo do projeto (sem node_modules)
/README-MIGRACAO.md       - Este arquivo
\`\`\`

## Passo a Passo (PostgreSQL)

### 1. Criar um banco PostgreSQL
Crie um Postgres em qualquer provedor (Railway, Neon, Supabase, RDS...) e copie a
connection string (\`DATABASE_URL\` ou \`NEON_DATABASE_URL\`).

### 2. Subir o código
\`\`\`bash
# a partir da pasta codigo-fonte/
pnpm install
\`\`\`

### 3. Configurar variáveis de ambiente
Crie um \`.env\` na raiz (veja a lista completa no replit.md):
\`\`\`env
NEON_DATABASE_URL=postgres://user:pass@host:5432/dbname
JWT_SECRET=<48 hex aleatórios>
NODE_ENV=production
\`\`\`

### 4. Criar as tabelas
\`\`\`bash
pnpm db:push
\`\`\`

### 5. Importar os dados
Use a própria tela **Migração de Dados → Importar** do ERP rodando no destino, e
selecione o arquivo \`banco-completo.json\`. Como ele já inclui a tabela
\`uploaded_files\`, os documentos voltam junto — não é preciso baixar arquivo por arquivo.

### 6. Subir o app
\`\`\`bash
pnpm build && node dist/index.js
\`\`\`

## Observações
- Os bytes dos arquivos vivem na tabela \`uploaded_files\` (base64). Restaurar o
  banco completo restaura os documentos automaticamente.
- O \`arquivos-manifesto.json\` é apenas referência das URLs originais.
`;

// ============================================================
// STREAMING DO ZIP COMPLETO (rota Express, download direto)
// ============================================================

/** Gera os pedaços JSON de uma tabela pesada (uploaded_files) paginando o DB. */
async function* heavyTableJsonChunks(db: any, tableName: string): AsyncGenerator<string> {
  yield "[";
  let offset = 0;
  const pageSize = 20; // blobs base64 podem ser grandes — página pequena
  let first = true;
  // ctid: coluna de sistema do Postgres presente em toda tabela — ordenação estável
  for (;;) {
    const result = await db.execute(sql.raw(
      `SELECT * FROM "${tableName}" ORDER BY ctid LIMIT ${pageSize} OFFSET ${offset}`
    ));
    const rows = rowsOf(result);
    if (rows.length === 0) break;
    for (const row of rows) {
      yield (first ? "" : ",") + JSON.stringify(row);
      first = false;
    }
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  yield "]";
}

/**
 * Gera o `banco-completo.json` em streaming: tabelas em memória + tabelas pesadas
 * paginadas (sem carregar blobs inteiros na RAM).
 */
async function* fullDbJsonChunks(
  db: any,
  tables: Record<string, any[]>,
  allTables: string[],
  meta: any
): AsyncGenerator<string> {
  yield `{"_meta":${JSON.stringify(meta)}`;
  // Tabelas estruturadas (em memória)
  for (const [name, data] of Object.entries(tables)) {
    if (HEAVY_TABLES.has(name)) continue;
    yield `,${JSON.stringify(name)}:${JSON.stringify(data)}`;
  }
  // Tabelas pesadas (streaming paginado)
  for (const name of allTables) {
    if (!HEAVY_TABLES.has(name)) continue;
    yield `,${JSON.stringify(name)}:`;
    for await (const chunk of heavyTableJsonChunks(db, name)) yield chunk;
  }
  yield "}";
}

/**
 * Monta o ZIP completo e envia DIRETO para a resposta HTTP (streaming).
 * Evita buffer em memória + upload intermediário (causa do "Fetch is aborted").
 */
export async function streamFullExportZip(res: any): Promise<void> {
  const db = await getDb();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("warning", (err: any) => {
    if (err?.code !== "ENOENT") console.warn(`[Migration] archive warning: ${err?.message || err}`);
  });
  archive.on("error", (err: any) => {
    console.error(`[Migration] archive error: ${err?.message || err}`);
    try { res.destroy(err); } catch { /* noop */ }
  });

  archive.pipe(res);

  // 1. Banco estruturado em memória + manifesto
  const { tables, meta, fileUrls, allTables } = await exportDatabase();

  // 2. _meta.json
  archive.append(JSON.stringify(meta, null, 2), { name: "banco/_meta.json" });

  // 3. Cada tabela estruturada em JSON separado (não inclui blobs pesados)
  for (const [tableName, data] of Object.entries(tables)) {
    if (HEAVY_TABLES.has(tableName)) continue;
    if (data.length > 0) {
      archive.append(JSON.stringify(data, null, 2), { name: `banco/${tableName}.json` });
    }
  }

  // 4. banco-completo.json (streaming: inclui uploaded_files com os bytes)
  archive.append(Readable.from(fullDbJsonChunks(db, tables, allTables, meta)), {
    name: "banco-completo.json",
  });

  // 5. Manifesto de arquivos
  const fileManifest = {
    _meta: {
      totalFiles: fileUrls.length,
      exportedAt: meta.exportedAt,
      instrucoes:
        "Referência das URLs originais. Os BYTES reais dos arquivos já estão em " +
        "banco-completo.json (tabela uploaded_files, base64). Restaurar o banco restaura os arquivos.",
    },
    files: fileUrls.map((f, idx) => ({
      id: idx + 1,
      table: f.table,
      field: f.field,
      rowId: f.rowId,
      originalUrl: f.url,
      localPath: `arquivos/${f.table}/${f.rowId}_${f.field}${getExtFromUrl(f.url)}`,
    })),
  };
  archive.append(JSON.stringify(fileManifest, null, 2), { name: "arquivos-manifesto.json" });

  // 6. README
  archive.append(MIGRATION_README, { name: "README-MIGRACAO.md" });

  // 7. Código-fonte completo (sem node_modules e afins)
  archive.glob(
    "**/*",
    {
      cwd: process.cwd(),
      dot: true,
      ignore: [
        "node_modules/**",
        "**/node_modules/**",
        ".git/**",
        "dist/**",
        "build/**",
        ".cache/**",
        ".local/**",
        ".upm/**",
        ".config/**",
        ".pnpm-store/**",
        "server/uploads/**",
        "tmp/**",
        "**/*.log",
      ],
    },
    { prefix: "codigo-fonte" }
  );

  await archive.finalize();
}

// ============================================================
// EXPORTAÇÃO EM ZIP (legado — buffer em memória, sem blobs/código)
// ============================================================

/**
 * Gera o pacote ZIP em memória e faz upload para o storage (retorna URL).
 * Mantido para compatibilidade; o caminho recomendado é o streaming
 * (/api/migration/export-completo.zip), que inclui arquivos e código-fonte.
 */
export async function generateExportZip(
  onProgress?: (p: ExportProgress) => void
): Promise<ExportResult> {
  const startTime = Date.now();

  try {
    const { tables, meta, fileUrls } = await exportDatabase(onProgress);

    onProgress?.({
      phase: "packaging",
      tablesProcessed: meta.totalTables,
      totalTables: meta.totalTables,
      filesProcessed: 0,
      totalFiles: fileUrls.length,
      message: "Gerando arquivo ZIP...",
    });

    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    const streamPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });

    archive.append(JSON.stringify(meta, null, 2), { name: "banco/_meta.json" });
    for (const [tableName, data] of Object.entries(tables)) {
      if (HEAVY_TABLES.has(tableName)) continue;
      if (data.length > 0) {
        archive.append(JSON.stringify(data, null, 2), { name: `banco/${tableName}.json` });
      }
    }
    const fullDbExport: Record<string, any> = { _meta: meta };
    for (const [name, data] of Object.entries(tables)) {
      if (HEAVY_TABLES.has(name)) continue;
      fullDbExport[name] = data;
    }
    archive.append(JSON.stringify(fullDbExport), { name: "banco-completo.json" });

    const fileManifest = {
      _meta: {
        totalFiles: fileUrls.length,
        exportedAt: meta.exportedAt,
        instrucoes: "Use as URLs originais para baixar cada arquivo.",
      },
      files: fileUrls.map((f, idx) => ({
        id: idx + 1,
        table: f.table,
        field: f.field,
        rowId: f.rowId,
        originalUrl: f.url,
        localPath: `arquivos/${f.table}/${f.rowId}_${f.field}${getExtFromUrl(f.url)}`,
      })),
    };
    archive.append(JSON.stringify(fileManifest, null, 2), { name: "arquivos-manifesto.json" });
    archive.append(MIGRATION_README, { name: "README-MIGRACAO.md" });

    await archive.finalize();
    const zipBuffer = await streamPromise;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const zipKey = `migration-exports/erp-export-completo-${timestamp}.zip`;
    const { url: zipUrl } = await storagePut(zipKey, zipBuffer, "application/zip");

    const duration = Date.now() - startTime;
    onProgress?.({
      phase: "done",
      tablesProcessed: meta.totalTables,
      totalTables: meta.totalTables,
      filesProcessed: fileUrls.length,
      totalFiles: fileUrls.length,
      message: "Exportação concluída!",
    });

    return {
      success: true,
      downloadUrl: zipUrl,
      stats: {
        tablesExported: Object.values(tables).filter((d) => d.length > 0).length,
        totalRecords: meta.totalRecords,
        filesExported: fileUrls.length,
        totalSizeBytes: zipBuffer.length,
        duration,
      },
    };
  } catch (e: any) {
    const duration = Date.now() - startTime;
    console.error(`[Migration] Erro na exportação ZIP: ${e.message}`, e.stack);
    onProgress?.({
      phase: "error",
      tablesProcessed: 0,
      totalTables: 0,
      filesProcessed: 0,
      totalFiles: 0,
      message: `Erro: ${e.message}`,
    });
    return {
      success: false,
      stats: { tablesExported: 0, totalRecords: 0, filesExported: 0, totalSizeBytes: 0, duration },
      error: e.message,
    };
  }
}

/**
 * Gera exportação JSON simples (sem ZIP) — mantido para compatibilidade.
 */
export async function generateExportPackage(
  onProgress?: (p: ExportProgress) => void
): Promise<ExportResult> {
  const startTime = Date.now();

  try {
    const { tables, meta, fileUrls } = await exportDatabase(onProgress);

    onProgress?.({
      phase: "packaging",
      tablesProcessed: meta.totalTables,
      totalTables: meta.totalTables,
      filesProcessed: 0,
      totalFiles: fileUrls.length,
      message: "Empacotando dados...",
    });

    const fullDbExport: Record<string, any> = { _meta: meta };
    for (const [name, data] of Object.entries(tables)) {
      if (HEAVY_TABLES.has(name)) continue;
      fullDbExport[name] = data;
    }
    const dbPackage = JSON.stringify(fullDbExport);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dbKey = `migration-exports/erp-export-${timestamp}-db.json`;
    const { url: dbUrl } = await storagePut(dbKey, dbPackage, "application/json");

    const duration = Date.now() - startTime;
    onProgress?.({
      phase: "done",
      tablesProcessed: meta.totalTables,
      totalTables: meta.totalTables,
      filesProcessed: fileUrls.length,
      totalFiles: fileUrls.length,
      message: "Exportação concluída!",
    });

    return {
      success: true,
      downloadUrl: dbUrl,
      stats: {
        tablesExported: Object.values(tables).filter((d) => d.length > 0).length,
        totalRecords: meta.totalRecords,
        filesExported: fileUrls.length,
        totalSizeBytes: Buffer.byteLength(dbPackage, "utf-8"),
        duration,
      },
    };
  } catch (e: any) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      stats: { tablesExported: 0, totalRecords: 0, filesExported: 0, totalSizeBytes: 0, duration },
      error: e.message,
    };
  }
}

// ============================================================
// IMPORTAÇÃO COMPLETA (PostgreSQL)
// ============================================================

/**
 * Importa dados de um pacote de exportação para o banco PostgreSQL de destino.
 * Usa INSERT parametrizado (pg) para coerção correta de tipos e segurança.
 */
export async function importDatabase(
  data: Record<string, any>,
  mode: "replace" | "merge" = "replace",
  onProgress?: (p: ExportProgress) => void
): Promise<ImportResult> {
  const db = await getDb();
  const client = (db as any).$client; // Pool do node-postgres
  const startTime = Date.now();
  const errors: string[] = [];
  let tablesImported = 0;
  let totalRecords = 0;

  // BLINDAGEM CONTRA INJEÇÃO DE IDENTIFICADOR (Rev. 3012): nomes de tabela/coluna
  // vêm de um JSON que pode ser malicioso. Parâmetros do pg protegem VALORES, não
  // IDENTIFICADORES. Então só aceitamos tabelas/colunas que EXISTAM de fato no
  // schema (whitelist via information_schema) + validação de formato.
  const schema = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const allowed = new Map<string, Set<string>>();
  for (const r of schema.rows) {
    if (!allowed.has(r.table_name)) allowed.set(r.table_name, new Set());
    allowed.get(r.table_name)!.add(r.column_name);
  }
  const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

  const tableNames = Object.keys(data).filter((k) => k !== "_meta");

  for (let i = 0; i < tableNames.length; i++) {
    const tableName = tableNames[i];
    const rows = data[tableName];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    // Tabela precisa existir e ter nome válido
    if (!SAFE_IDENT.test(tableName) || !allowed.has(tableName)) {
      errors.push(`Tabela ignorada (desconhecida/ inválida): ${tableName}`);
      continue;
    }
    const allowedCols = allowed.get(tableName)!;

    onProgress?.({
      phase: "database",
      currentTable: tableName,
      tablesProcessed: i,
      totalTables: tableNames.length,
      filesProcessed: 0,
      totalFiles: 0,
      message: `Importando tabela: ${tableName} (${rows.length} registros)`,
    });

    try {
      if (mode === "replace") {
        await client.query(`DELETE FROM "${tableName}"`);
      }

      for (const row of rows) {
        // Só colunas que EXISTEM na tabela e têm nome válido (anti-injeção)
        const columns = Object.keys(row).filter(
          (c) => SAFE_IDENT.test(c) && allowedCols.has(c)
        );
        if (columns.length === 0) continue;
        const colList = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
        const values = columns.map((col) => {
          const val = row[col];
          // node-postgres precisa de string para colunas json/array/objeto
          if (val !== null && typeof val === "object") return JSON.stringify(val);
          return val;
        });

        let queryText: string;
        if (mode === "merge") {
          const updateCols = columns
            .filter((c) => c !== "id")
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(", ");
          queryText = updateCols
            ? `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateCols}`
            : `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
        } else {
          queryText = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
        }

        try {
          await client.query(queryText, values);
          totalRecords++;
        } catch (rowErr: any) {
          const msg = String(rowErr?.message || rowErr);
          if (!/duplicate key|já existe|already exists/i.test(msg)) {
            errors.push(`${tableName} row ${row.id ?? "?"}: ${msg}`);
          }
        }
      }

      tablesImported++;
    } catch (e: any) {
      errors.push(`Tabela ${tableName}: ${e.message}`);
    }
  }

  const duration = Date.now() - startTime;
  onProgress?.({
    phase: "done",
    tablesProcessed: tableNames.length,
    totalTables: tableNames.length,
    filesProcessed: 0,
    totalFiles: 0,
    message: "Importação concluída!",
  });

  return {
    success: errors.length === 0,
    stats: { tablesImported, totalRecords, filesImported: 0, duration },
    errors,
  };
}

// ============================================================
// HELPERS
// ============================================================

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop();
    if (ext && ext.length <= 5) return `.${ext}`;
    return "";
  } catch {
    return "";
  }
}
