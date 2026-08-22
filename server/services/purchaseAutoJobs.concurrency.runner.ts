// Runs the purchase-alert concurrency checks against a disposable PostgreSQL
// instance. The database listens only on a temporary Unix socket and is always
// stopped and deleted, so no development or production data is touched.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

function findPostgresBin(): string {
  const configured = process.env.POSTGRES_BIN;
  if (configured && fs.existsSync(path.join(configured, "postgres"))) return configured;

  const pathEntry = (process.env.PATH ?? "")
    .split(path.delimiter)
    .find((entry) => entry && fs.existsSync(path.join(entry, "postgres")));
  if (pathEntry) return pathEntry;

  const nixStore = "/nix/store";
  if (fs.existsSync(nixStore)) {
    const packageName = fs.readdirSync(nixStore)
      .filter((name) => /-postgresql-16(?:\.|$)/.test(name))
      .sort()
      .at(-1);
    if (packageName && fs.existsSync(path.join(nixStore, packageName, "bin", "postgres"))) {
      return path.join(nixStore, packageName, "bin");
    }
  }

  throw new Error("PostgreSQL 16 not found. Set POSTGRES_BIN to its binary directory.");
}

const postgresBin = findPostgresBin();
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "purchase-alerts-pg-"));
const dataDir = path.join(baseDir, "data");
const socketDir = path.join(baseDir, "sock");
const logPath = path.join(baseDir, "postgres.log");
fs.mkdirSync(socketDir);

execFileSync(path.join(postgresBin, "initdb"), [
  "-D", dataDir, "-A", "trust", "-U", "postgres", "--encoding=UTF8", "--locale=C",
], { stdio: "ignore" });

const start = spawnSync(path.join(postgresBin, "pg_ctl"), [
  "-D", dataDir,
  "-l", logPath,
  "-o", `-F -c listen_addresses='' -k ${socketDir} -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
  "-w", "start",
], { encoding: "utf8" });
if (start.status !== 0) {
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  throw new Error(`Could not start disposable PostgreSQL:\n${start.stderr}\n${log}`);
}

function stopPostgres(): void {
  spawnSync(path.join(postgresBin, "pg_ctl"), [
    "-D", dataDir, "-m", "immediate", "-w", "stop",
  ], { stdio: "ignore" });
  fs.rmSync(baseDir, { recursive: true, force: true });
}

process.env.NEON_DATABASE_URL =
  `postgresql://postgres@/postgres?host=${encodeURIComponent(socketDir)}`;
process.env.DATABASE_URL = "";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function verify(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  if (!ok) console.error(`FAILED: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<number> {
  const { getTableColumns, getTableName } = await import("drizzle-orm");
  const schema = await import("../../drizzle/schema");
  const { getDb, resetDbPool } = await import("../db");
  const {
    persistPurchaseAlmoxAlerts,
    persistQuotationLogsAndSendEmails,
  } = await import("./purchaseAutoJobs");

  const db = await getDb();
  if (!db) throw new Error("getDb() did not connect to disposable PostgreSQL.");

  const createTableSql = (table: any): string => {
    const tableName = getTableName(table);
    const columns = Object.values(getTableColumns(table) as Record<string, any>)
      .map((column: any) => {
        const primaryKey = column.name === "id" ? " PRIMARY KEY" : "";
        return `"${column.name}" ${column.getSQLType()}${primaryKey}`;
      });
    return `CREATE TABLE "${tableName}" (${columns.join(", ")})`;
  };

  await (db as any).execute(createTableSql(schema.almoxarifadoNotificacoes));
  await (db as any).execute(createTableSql(schema.notificationLogs));

  const almoxColumns = getTableColumns(schema.almoxarifadoNotificacoes) as any;
  const logColumns = getTableColumns(schema.notificationLogs) as any;
  await (db as any).execute(`
    CREATE UNIQUE INDEX uq_almoxarifado_notificacoes_auto_dedup
      ON "${getTableName(schema.almoxarifadoNotificacoes)}"
      ("${almoxColumns.companyId.name}", "${almoxColumns.dedupKey.name}")
      WHERE "${almoxColumns.dedupKey.name}" IS NOT NULL
  `);
  await (db as any).execute(`
    CREATE UNIQUE INDEX uq_notification_logs_auto_dedup
      ON "${getTableName(schema.notificationLogs)}"
      ("${logColumns.companyId.name}", "${logColumns.dedupKey.name}")
      WHERE "${logColumns.dedupKey.name}" IS NOT NULL
  `);

  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    max: 4,
  });
  const companyId = 2_000_000_000;
  const runId = randomUUID();

  try {
    const alertTypes = [
      "entrega_proxima",
      "pj_contrato_vencendo",
      "pj_saldo_90",
      "pj_docs_pendentes",
    ] as const;
    const almoxRows = alertTypes.map((type) => ({
      companyId,
      tipo: type,
      destinoModulo: type === "entrega_proxima" ? "almoxarifado" : "terceiros",
      titulo: `Concurrent ${type} ${runId}`,
      mensagem: `Isolated row ${runId}`,
      dedupKey: `test:purchase-auto:${runId}:${type}`,
    }));

    const almoxWrites = await Promise.all([
      persistPurchaseAlmoxAlerts(almoxRows),
      persistPurchaseAlmoxAlerts(almoxRows),
    ]);
    verify(
      "only one writer inserts the four warehouse/PJ alerts",
      almoxWrites[0].length + almoxWrites[1].length === alertTypes.length,
      JSON.stringify(almoxWrites.map((rows) => rows.length)),
    );

    const almoxCounts = await pool.query<{ tipo: string; total: number }>(`
      SELECT "${almoxColumns.tipo.name}" AS tipo, count(*)::int AS total
        FROM "${getTableName(schema.almoxarifadoNotificacoes)}"
       WHERE "${almoxColumns.dedupKey.name}" = ANY($1::text[])
       GROUP BY "${almoxColumns.tipo.name}"
    `, [almoxRows.map((row) => row.dedupKey)]);
    const countByType = new Map(almoxCounts.rows.map((row) => [row.tipo, row.total]));
    for (const type of alertTypes) {
      verify(`${type} persists exactly once`, countByType.get(type) === 1);
    }

    const quotationKey = `test:purchase-auto:${runId}:cotacao_vencendo`;
    const quotationRows = [{
      companyId,
      employeeName: "Test Buyer",
      tipoMovimentacao: "cotacao_vencendo",
      recipientName: "Test Buyer",
      recipientEmail: "compras@sistema.local",
      titulo: `Quotation ${runId} expires soon`,
      corpo: `Isolated body ${runId}`,
      statusEnvio: "enviado",
      trackingId: randomUUID(),
      disparadoPor: "Test",
      dedupKey: quotationKey,
    }];
    const emailQueue = [{
      titulo: quotationRows[0].titulo,
      corpo: quotationRows[0].corpo,
      dedupKey: quotationKey,
    }];
    const sentEmails: unknown[] = [];
    const fakeEmailSender = async (options: unknown) => {
      sentEmails.push(options);
      return { success: true, messageId: "test-message" };
    };

    const quotationWrites = await Promise.all([
      persistQuotationLogsAndSendEmails(quotationRows, emailQueue, fakeEmailSender),
      persistQuotationLogsAndSendEmails(quotationRows, emailQueue, fakeEmailSender),
    ]);
    verify(
      "only one writer inserts the quotation alert",
      quotationWrites[0].length + quotationWrites[1].length === 1,
      JSON.stringify(quotationWrites.map((rows) => rows.length)),
    );

    const quotationCount = await pool.query<{ total: number }>(`
      SELECT count(*)::int AS total
        FROM "${getTableName(schema.notificationLogs)}"
       WHERE "${logColumns.dedupKey.name}" = $1
    `, [quotationKey]);
    verify("quotation alert persists exactly once", quotationCount.rows[0]?.total === 1);
    verify("only the winning quotation writer sends e-mail", sentEmails.length === 1);
  } finally {
    await pool.query(`
      TRUNCATE TABLE
        "${getTableName(schema.almoxarifadoNotificacoes)}",
        "${getTableName(schema.notificationLogs)}"
      RESTART IDENTITY
    `).catch(() => undefined);
    await pool.end();
    resetDbPool();
  }

  const failures = results.filter((result) => !result.ok);
  console.log(JSON.stringify({
    total: results.length,
    failures: failures.length,
    results,
  }));
  return failures.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    stopPostgres();
    process.exit(code);
  })
  .catch((error) => {
    console.error("ERROR in purchase alert concurrency runner:", error);
    stopPostgres();
    process.exit(1);
  });