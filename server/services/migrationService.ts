/**
 * Serviço de Migração Completa do ERP
 * 
 * Exporta: banco de dados completo (JSON) + todos os arquivos/documentos (S3)
 * Importa: restaura banco + faz upload dos arquivos
 * 
 * Formato do pacote ZIP:
 *   /banco/              - Cada tabela em um arquivo JSON separado
 *   /banco/_meta.json    - Metadados (versão, data, estatísticas)
 *   /arquivos-manifesto.json - Mapeamento de todos os arquivos/documentos
 *   /README-MIGRACAO.md  - Instruções para migrar para Railway
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { storagePut } from "../storage";
import archiver from "archiver";
import { Readable } from "stream";

// ============================================================
// LISTA DE TABELAS
// ============================================================
const ALL_TABLES = [
  "accidents", "action_plans", "advances", "alertas_terceiros", "asos", "atestados",
  "audit_logs", "audits", "avaliacao_avaliadores", "avaliacao_ciclos", "avaliacao_config",
  "avaliacao_perguntas", "avaliacao_questionarios", "avaliacao_respostas", "avaliacoes",
  "backups", "blacklist_reactivation_requests", "caepi_database", "chemicals", "cipa_elections",
  "cipa_meetings", "cipa_members", "clinicas", "companies", "company_bank_accounts",
  "company_documents", "contract_templates", "convencao_coletiva", "custom_exams", "datajud_alerts",
  "datajud_auto_check_config", "dds", "deviations", "dissidio_funcionarios", "dissidios",
  "dixi_afd_importacoes", "dixi_afd_marcacoes", "dixi_devices", "dixi_name_mappings",
  "document_templates", "email_templates", "employee_aptidao", "employee_contracts",
  "employee_documents", "employee_history", "employee_site_history", "employees",
  "empresas_terceiras", "epi_ai_analises", "epi_alerta_capacidade", "epi_alerta_capacidade_log",
  "epi_assinaturas", "epi_checklist_items", "epi_checklists", "epi_cores_capacete",
  "epi_deliveries", "epi_discount_alerts", "epi_estoque_minimo", "epi_estoque_obra",
  "epi_kit_items", "epi_kits", "epi_transferencias", "epi_treinamentos_vinculados",
  "epi_vida_util", "epis", "equipment", "eval_audit_log", "eval_avaliacoes", "eval_avaliadores",
  "eval_climate_answers", "eval_climate_external_tokens", "eval_climate_questions",
  "eval_climate_responses", "eval_climate_surveys", "eval_criteria", "eval_criteria_revisions",
  "eval_external_participants", "eval_pillars", "eval_scores", "eval_survey_answers",
  "eval_survey_evaluators", "eval_survey_questions", "eval_survey_responses", "eval_surveys",
  "extinguishers", "extra_payments", "feriados", "field_notes", "financial_events",
  "folha_itens", "folha_lancamentos", "fornecedores_epi", "funcionarios_terceiros",
  "golden_rules", "he_solicitacao_funcionarios", "he_solicitacoes", "hydrants",
  "insurance_alert_config", "insurance_alert_recipients", "insurance_alerts_log",
  "job_functions", "lancamentos_parceiros", "manual_obra_assignments", "meal_benefit_configs",
  "medicos", "menu_config", "menu_labels", "module_config", "monthly_payroll_summary",
  "notification_logs", "notification_recipients", "obra_funcionarios", "obra_horas_rateio",
  "obra_ponto_inconsistencies", "obra_sns", "obras", "obrigacoes_mensais_terceiros",
  "pagamentos_parceiros", "parceiros_conveniados", "payroll", "payroll_adjustments",
  "payroll_advances", "payroll_alerts", "payroll_payments", "payroll_periods",
  "payroll_uploads", "permissions", "pj_contracts", "pj_medicoes", "pj_payments",
  "ponto_consolidacao", "ponto_descontos", "ponto_descontos_resumo", "portal_credentials",
  "processo_analises", "processo_aprendizado", "processo_documentos", "processos_andamentos",
  "processos_trabalhistas", "risks", "sectors", "system_criteria", "system_revisions",
  "termination_notices", "time_inconsistencies", "time_records", "timecard_daily",
  "training_documents", "trainings", "unmatched_dixi_records", "user_companies",
  "user_group_members", "user_group_permissions", "user_groups", "user_permissions",
  "user_profiles", "users", "vacation_periods", "vehicles", "vr_benefits",
  "warning_templates", "warnings",
];

// Campos que contêm URLs de arquivos no S3
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
// EXPORTAÇÃO COMPLETA
// ============================================================

/**
 * Exporta todo o banco de dados em formato JSON organizado.
 * Retorna um objeto com todas as tabelas e seus dados.
 */
export async function exportDatabase(
  onProgress?: (p: ExportProgress) => void
): Promise<{ tables: Record<string, any[]>; meta: any; fileUrls: Array<{ table: string; field: string; rowId: any; url: string }> }> {
  const db = getDb();
  const tables: Record<string, any[]> = {};
  const fileUrls: Array<{ table: string; field: string; rowId: any; url: string }> = [];
  let totalRecords = 0;

  for (let i = 0; i < ALL_TABLES.length; i++) {
    const tableName = ALL_TABLES[i];
    onProgress?.({
      phase: "database",
      currentTable: tableName,
      tablesProcessed: i,
      totalTables: ALL_TABLES.length,
      filesProcessed: 0,
      totalFiles: 0,
      message: `Exportando tabela: ${tableName}`,
    });

    try {
      const rows = await db.execute(sql.raw(`SELECT * FROM \`${tableName}\``));
      // mysql2 retorna [rows, fields] - pegar primeiro elemento
      const data = (rows[0] as unknown[]) || [];
      tables[tableName] = Array.isArray(data) ? data : [];
      totalRecords += tables[tableName].length;

      // Coletar URLs de arquivos
      const urlFields = FILE_URL_FIELDS[tableName];
      if (urlFields && tables[tableName].length > 0) {
        for (const row of tables[tableName]) {
          for (const field of urlFields) {
            const camelField = field;
            const snakeField = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
            const value = row[camelField] || row[snakeField];
            if (value && typeof value === "string" && value.startsWith("http")) {
              fileUrls.push({
                table: tableName,
                field: camelField,
                rowId: row.id || row.ID,
                url: value,
              });
            }
            // Para campos JSON (como fotosUrls)
            if (value && typeof value === "object" && Array.isArray(value)) {
              for (const url of value) {
                if (typeof url === "string" && url.startsWith("http")) {
                  fileUrls.push({ table: tableName, field: camelField, rowId: row.id, url });
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

  const meta = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    platform: "Manus ERP - FC Engenharia",
    totalTables: Object.keys(tables).length,
    totalRecords,
    totalFiles: fileUrls.length,
    tableStats: Object.entries(tables).map(([name, rows]) => ({
      table: name,
      records: rows.length,
    })).filter(t => t.records > 0),
  };

  return { tables, meta, fileUrls };
}

// ============================================================
// README DE MIGRAÇÃO
// ============================================================
const MIGRATION_README = `# Guia de Migração - ERP FC Engenharia

## Conteúdo do Pacote ZIP

\`\`\`
/banco/                    - Dados de cada tabela em JSON separado
/banco/_meta.json          - Metadados da exportação (data, estatísticas)
/arquivos-manifesto.json   - Lista de todos os documentos/arquivos com URLs
/README-MIGRACAO.md        - Este arquivo
\`\`\`

## Passo a Passo para Migrar para Railway

### 1. Criar Banco de Dados MySQL
- Acesse [railway.app](https://railway.app) e crie um novo projeto
- Adicione um serviço MySQL
- Copie a connection string (DATABASE_URL)

### 2. Clonar o Repositório
\`\`\`bash
git clone https://github.com/felipe1268/erp-rh-fc.git
cd erp-rh-fc
pnpm install
\`\`\`

### 3. Configurar Variáveis de Ambiente
Crie um arquivo \`.env\` na raiz:
\`\`\`env
DATABASE_URL=mysql://user:pass@host:port/dbname
JWT_SECRET=seu-segredo-jwt-aqui
\`\`\`

### 4. Criar as Tabelas
\`\`\`bash
pnpm db:push
\`\`\`

### 5. Importar os Dados
Use o script de importação incluído ou importe manualmente:
\`\`\`bash
node scripts/import-data.mjs ./banco/
\`\`\`

### 6. Baixar os Arquivos/Documentos
Use o manifesto de arquivos para baixar todos os documentos:
\`\`\`bash
node scripts/download-files.mjs ./arquivos-manifesto.json ./uploads/
\`\`\`

### 7. Deploy no Railway
\`\`\`bash
railway link
railway up
\`\`\`

## Estrutura dos Dados

Cada arquivo JSON na pasta \`/banco/\` contém um array de registros da tabela correspondente.
O arquivo \`_meta.json\` contém estatísticas e a data da exportação.

## Arquivos/Documentos

O \`arquivos-manifesto.json\` lista todos os documentos anexados (ASOs, certificados, fotos, etc.)
com suas URLs originais. Use o script de download para baixá-los em lote.
`;

// ============================================================
// EXPORTAÇÃO EM ZIP
// ============================================================

/**
 * Gera o pacote ZIP completo de exportação.
 * Contém: /banco/*.json + /arquivos-manifesto.json + /README-MIGRACAO.md
 */
export async function generateExportZip(
  onProgress?: (p: ExportProgress) => void
): Promise<ExportResult> {
  const startTime = Date.now();

  try {
    // 1. Exportar banco de dados
    const { tables, meta, fileUrls } = await exportDatabase(onProgress);

    onProgress?.({
      phase: "packaging",
      tablesProcessed: ALL_TABLES.length,
      totalTables: ALL_TABLES.length,
      filesProcessed: 0,
      totalFiles: fileUrls.length,
      message: "Gerando arquivo ZIP...",
    });

    // 2. Criar ZIP em memória
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    // Coletar chunks do stream
    const streamPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });

    // 3. Adicionar _meta.json
    archive.append(JSON.stringify(meta, null, 2), { name: "banco/_meta.json" });

    // 4. Adicionar cada tabela com dados como arquivo JSON separado
    for (const [tableName, data] of Object.entries(tables)) {
      if (data.length > 0) {
        archive.append(JSON.stringify(data, null, 2), { name: `banco/${tableName}.json` });
      }
    }

    // 5. Adicionar banco completo (um JSON com tudo para importação fácil)
    const fullDbExport = { _meta: meta, ...tables };
    archive.append(JSON.stringify(fullDbExport), { name: "banco-completo.json" });

    // 6. Adicionar manifesto de arquivos
    const fileManifest = {
      _meta: {
        totalFiles: fileUrls.length,
        exportedAt: meta.exportedAt,
        instrucoes: "Use as URLs originais para baixar cada arquivo. O campo 'localPath' sugere onde salvar localmente.",
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

    // 7. Adicionar README de migração
    archive.append(MIGRATION_README, { name: "README-MIGRACAO.md" });

    // 8. Finalizar ZIP
    await archive.finalize();
    const zipBuffer = await streamPromise;

    // 9. Upload do ZIP para S3
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const zipKey = `migration-exports/erp-export-completo-${timestamp}.zip`;
    const { url: zipUrl } = await storagePut(zipKey, zipBuffer, "application/zip");

    const duration = Date.now() - startTime;

    onProgress?.({
      phase: "done",
      tablesProcessed: ALL_TABLES.length,
      totalTables: ALL_TABLES.length,
      filesProcessed: fileUrls.length,
      totalFiles: fileUrls.length,
      message: "Exportação concluída!",
    });

    return {
      success: true,
      downloadUrl: zipUrl,
      stats: {
        tablesExported: Object.keys(tables).filter(t => tables[t].length > 0).length,
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
      totalTables: ALL_TABLES.length,
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
 * Gera exportação JSON simples (sem ZIP) - mantido para compatibilidade
 */
export async function generateExportPackage(
  onProgress?: (p: ExportProgress) => void
): Promise<ExportResult> {
  const startTime = Date.now();

  try {
    const { tables, meta, fileUrls } = await exportDatabase(onProgress);

    onProgress?.({
      phase: "packaging",
      tablesProcessed: ALL_TABLES.length,
      totalTables: ALL_TABLES.length,
      filesProcessed: 0,
      totalFiles: fileUrls.length,
      message: "Empacotando dados...",
    });

    const dbPackage = JSON.stringify({ _meta: meta, ...tables });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dbKey = `migration-exports/erp-export-${timestamp}-db.json`;
    const { url: dbUrl } = await storagePut(dbKey, dbPackage, "application/json");

    const duration = Date.now() - startTime;

    onProgress?.({
      phase: "done",
      tablesProcessed: ALL_TABLES.length,
      totalTables: ALL_TABLES.length,
      filesProcessed: fileUrls.length,
      totalFiles: fileUrls.length,
      message: "Exportação concluída!",
    });

    return {
      success: true,
      downloadUrl: dbUrl,
      stats: {
        tablesExported: Object.keys(tables).filter(t => tables[t].length > 0).length,
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
// IMPORTAÇÃO COMPLETA
// ============================================================

/**
 * Importa dados de um pacote de exportação.
 * Recebe o JSON do banco e restaura todas as tabelas.
 */
export async function importDatabase(
  data: Record<string, any>,
  mode: "replace" | "merge" = "replace",
  onProgress?: (p: ExportProgress) => void
): Promise<ImportResult> {
  const db = getDb();
  const startTime = Date.now();
  const errors: string[] = [];
  let tablesImported = 0;
  let totalRecords = 0;

  // Extrair meta e tabelas
  const meta = data._meta;
  const tableNames = Object.keys(data).filter(k => k !== "_meta");

  for (let i = 0; i < tableNames.length; i++) {
    const tableName = tableNames[i];
    const rows = data[tableName];

    if (!Array.isArray(rows) || rows.length === 0) continue;

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
        await db.execute(sql.raw(`DELETE FROM \`${tableName}\``));
      }

      // Inserir em lotes
      const batchSize = 100;
      for (let j = 0; j < rows.length; j += batchSize) {
        const batch = rows.slice(j, j + batchSize);
        const columns = Object.keys(batch[0]);
        const escapedCols = columns.map(c => `\`${c}\``).join(", ");

        for (const row of batch) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "number") return String(val);
            if (typeof val === "boolean") return val ? "1" : "0";
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(", ");

          try {
            if (mode === "merge") {
              const updateCols = columns
                .filter(c => c !== "id")
                .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
                .join(", ");
              await db.execute(sql.raw(
                `INSERT INTO \`${tableName}\` (${escapedCols}) VALUES (${values}) ON DUPLICATE KEY UPDATE ${updateCols}`
              ));
            } else {
              await db.execute(sql.raw(
                `INSERT INTO \`${tableName}\` (${escapedCols}) VALUES (${values})`
              ));
            }
            totalRecords++;
          } catch (rowErr: any) {
            if (!rowErr.message.includes("Duplicate entry")) {
              errors.push(`${tableName} row ${row.id || j}: ${rowErr.message}`);
            }
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
    stats: {
      tablesImported,
      totalRecords,
      filesImported: 0,
      duration,
    },
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
