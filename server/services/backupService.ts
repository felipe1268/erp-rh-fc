/**
 * Serviço de Backup Automatizado do Banco de Dados
 *
 * Rev. 1152 — Melhorias:
 * - Descoberta dinâmica de tabelas (pg_tables) — nunca mais perde tabela nova
 * - Cópia redundante no Neon (tabela backup_snapshots)
 * - Horário configurável via tabela backup_config
 * - uploaded_files incluída (metadata, sem base64 completo para não estourar memória)
 * - Retenção: 7 cópias no Neon, ilimitado no S3
 */

import { getDb } from "../db";
import { backups } from "../../drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import { storagePut } from "../storage";
import { sendEmail } from "./smtpService";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";

const TABELAS_EXCLUIR = new Set([
  "drizzle.__drizzle_migrations",
  "__drizzle_migrations",
  "pg_stat_statements",
]);

const MAX_SNAPSHOTS_NEON = 7;

interface BackupResult {
  success: boolean;
  backupId: number;
  tabelasExportadas: number;
  registrosExportados: number;
  tamanhoBytes: number;
  s3Url?: string;
  erro?: string;
  duracao: number;
  neonCopy: boolean;
}

async function descobrirTabelas(db: any): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const rows: any[] = (result as any).rows || [];
  return rows
    .map((r: any) => r.tablename)
    .filter((t: string) => !TABELAS_EXCLUIR.has(t));
}

async function garantirTabelaSnapshots(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_snapshots (
      id SERIAL PRIMARY KEY,
      backup_id INTEGER,
      dados_comprimidos BYTEA NOT NULL,
      tamanho_bytes INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function garantirTabelaConfig(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_config (
      id SERIAL PRIMARY KEY,
      horario VARCHAR(5) NOT NULL DEFAULT '00:00',
      ativo BOOLEAN NOT NULL DEFAULT true,
      atualizado_em TIMESTAMP DEFAULT NOW(),
      atualizado_por VARCHAR(255)
    )
  `);
  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM backup_config`);
  const cnt = parseInt((existing as any).rows?.[0]?.cnt || "0");
  if (cnt === 0) {
    await db.execute(sql`INSERT INTO backup_config (horario, ativo) VALUES ('00:00', true)`);
  }
}

export async function obterConfigBackup(): Promise<{ horario: string; ativo: boolean }> {
  const db = await getDb();
  if (!db) return { horario: "00:00", ativo: true };
  try {
    await garantirTabelaConfig(db);
    const result = await db.execute(sql`SELECT horario, ativo FROM backup_config ORDER BY id LIMIT 1`);
    const row = (result as any).rows?.[0];
    return { horario: row?.horario || "00:00", ativo: row?.ativo !== false };
  } catch {
    return { horario: "00:00", ativo: true };
  }
}

export async function salvarConfigBackup(horario: string, ativo: boolean, atualizadoPor: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await garantirTabelaConfig(db);
  const existing = await db.execute(sql`SELECT id FROM backup_config ORDER BY id LIMIT 1`);
  const row = (existing as any).rows?.[0];
  if (row) {
    await db.execute(sql`
      UPDATE backup_config
      SET horario = ${horario}, ativo = ${ativo}, atualizado_em = NOW(), atualizado_por = ${atualizadoPor}
      WHERE id = ${row.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO backup_config (horario, ativo, atualizado_por) VALUES (${horario}, ${ativo}, ${atualizadoPor})
    `);
  }
  reagendarBackupJob();
}

async function salvarSnapshotNeon(db: any, backupId: number, compressed: Buffer) {
  try {
    await garantirTabelaSnapshots(db);
    await db.execute(sql`
      INSERT INTO backup_snapshots (backup_id, dados_comprimidos, tamanho_bytes)
      VALUES (${backupId}, ${compressed}, ${compressed.length})
    `);
    const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM backup_snapshots`);
    const total = parseInt((countResult as any).rows?.[0]?.cnt || "0");
    if (total > MAX_SNAPSHOTS_NEON) {
      const excesso = total - MAX_SNAPSHOTS_NEON;
      await db.execute(sql`
        DELETE FROM backup_snapshots
        WHERE id IN (
          SELECT id FROM backup_snapshots ORDER BY criado_em ASC LIMIT ${excesso}
        )
      `);
      console.log(`[Backup] Limpeza Neon: ${excesso} snapshot(s) antigo(s) removido(s), mantidos ${MAX_SNAPSHOTS_NEON}`);
    }
    return true;
  } catch (e: any) {
    console.error(`[Backup] Falha ao salvar snapshot no Neon: ${e.message}`);
    return false;
  }
}

export async function executarBackup(
  tipo: "automatico" | "manual" = "automatico",
  iniciadoPor: string = "Sistema"
): Promise<BackupResult> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const insertResult = await db.execute(sql`
    INSERT INTO backups (tipo, status, iniciado_por)
    VALUES (${tipo}, 'em_andamento', ${iniciadoPor})
    RETURNING id
  `);
  const backupId = (insertResult as any).rows?.[0]?.id;

  try {
    const allTables = await descobrirTabelas(db);
    console.log(`[Backup] ${allTables.length} tabelas descobertas no banco`);

    const exportData: Record<string, unknown[]> = {};
    let totalRegistros = 0;
    let tabelasExportadas = 0;

    for (const tableName of allTables) {
      if (tableName === "backup_snapshots") {
        tabelasExportadas++;
        continue;
      }

      try {
        if (tableName === "uploaded_files") {
          const rows = await db.execute(sql.raw(
            `SELECT id, file_key, content_type, LENGTH(data_base64) as tamanho_base64 FROM uploaded_files`
          ));
          const data = (rows as any).rows || [];
          if (data.length > 0) {
            exportData[tableName] = data;
            totalRegistros += data.length;
          }
        } else {
          const rows = await db.execute(sql.raw(`SELECT * FROM "${tableName}"`));
          const data = (rows as any).rows || [];
          if (data.length > 0) {
            exportData[tableName] = data;
            totalRegistros += data.length;
          }
        }
        tabelasExportadas++;
      } catch (err: any) {
        console.warn(`[Backup] Tabela ${tableName} ignorada: ${err.message}`);
      }
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonContent = JSON.stringify({
      metadata: {
        versao: "2.0",
        dataBackup: now.toISOString(),
        tipo,
        iniciadoPor,
        tabelasExportadas,
        totalRegistros,
        tabelasTotal: allTables.length,
      },
      tabelas: exportData,
    });

    const { gzipSync } = await import("zlib");
    const compressed = gzipSync(Buffer.from(jsonContent, "utf-8"), { level: 9 });
    const tamanhoBytes = compressed.length;

    const s3Key = `backups/erp-fc-backup-${timestamp}.json.gz`;
    const { url: s3Url } = await storagePut(s3Key, compressed, "application/gzip");

    const neonCopy = await salvarSnapshotNeon(db, backupId, compressed);

    await db.execute(sql`
      UPDATE backups SET
        status = 'concluido',
        tabelas_exportadas = ${tabelasExportadas},
        registros_exportados = ${totalRegistros},
        tamanho_bytes = ${tamanhoBytes},
        s3_key = ${s3Key},
        s3_url = ${s3Url},
        concluido_em = NOW()
      WHERE id = ${backupId}
    `);

    const duracao = Date.now() - startTime;

    await notificarBackup({
      success: true,
      tipo,
      tabelasExportadas,
      totalRegistros,
      tamanhoBytes,
      duracao,
      s3Url,
      neonCopy,
    });

    console.log(`[Backup] Concluído em ${(duracao / 1000).toFixed(1)}s — ${tabelasExportadas} tabelas, ${totalRegistros.toLocaleString("pt-BR")} registros, ${formatBytes(tamanhoBytes)}${neonCopy ? " + cópia Neon" : ""}`);

    return {
      success: true,
      backupId,
      tabelasExportadas,
      registrosExportados: totalRegistros,
      tamanhoBytes,
      s3Url,
      duracao,
      neonCopy,
    };

  } catch (err: any) {
    const duracao = Date.now() - startTime;

    await db.execute(sql`
      UPDATE backups SET
        status = 'erro',
        erro = ${(err.message || "").slice(0, 500)},
        concluido_em = NOW()
      WHERE id = ${backupId}
    `);

    await notificarBackup({
      success: false,
      tipo,
      erro: err.message,
      duracao,
    });

    console.error(`[Backup] Erro após ${(duracao / 1000).toFixed(1)}s:`, err.message);

    return {
      success: false,
      backupId,
      tabelasExportadas: 0,
      registrosExportados: 0,
      tamanhoBytes: 0,
      erro: err.message,
      duracao,
      neonCopy: false,
    };
  }
}

export async function listarBackups(limit: number = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(backups).orderBy(desc(backups.iniciadoEm)).limit(limit);
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================

async function notificarBackup(params: {
  success: boolean;
  tipo: string;
  tabelasExportadas?: number;
  totalRegistros?: number;
  tamanhoBytes?: number;
  duracao: number;
  s3Url?: string;
  erro?: string;
  neonCopy?: boolean;
}) {
  const { success, tipo, tabelasExportadas, totalRegistros, tamanhoBytes, duracao, s3Url, erro, neonCopy } = params;

  if (success) {
    const titulo = `Backup ${tipo === "automatico" ? "Automático" : "Manual"} Concluído`;
    const conteudo = [
      `Backup ${tipo} do banco de dados concluído com sucesso.`,
      ``,
      `Tabelas exportadas: ${tabelasExportadas}`,
      `Registros exportados: ${totalRegistros?.toLocaleString("pt-BR")}`,
      `Tamanho comprimido: ${formatBytes(tamanhoBytes || 0)}`,
      `Duração: ${(duracao / 1000).toFixed(1)}s`,
      `Cópia Neon: ${neonCopy ? "Sim" : "Não"}`,
      s3Url ? `\nLink: ${s3Url}` : "",
    ].join("\n");

    try { await notifyOwner({ title: titulo, content: conteudo }); } catch {}

    try {
      if (ENV.smtpHost && ENV.smtpEmail) {
        await sendEmail({
          to: ENV.smtpEmail,
          subject: `[ERP FC] ${titulo}`,
          html: gerarHtmlBackup(true, { tabelasExportadas, totalRegistros, tamanhoBytes, duracao, s3Url, neonCopy }),
        });
      }
    } catch (e: any) {
      console.warn("[Backup] Falha ao enviar e-mail:", e.message);
    }

  } else {
    const titulo = `ERRO no Backup ${tipo === "automatico" ? "Automático" : "Manual"}`;
    const conteudo = `Backup ${tipo} falhou após ${(duracao / 1000).toFixed(1)}s.\n\nErro: ${erro}`;

    try { await notifyOwner({ title: titulo, content: conteudo }); } catch {}

    try {
      if (ENV.smtpHost && ENV.smtpEmail) {
        await sendEmail({
          to: ENV.smtpEmail,
          subject: `[ERP FC] ${titulo}`,
          html: gerarHtmlBackup(false, { erro, duracao }),
        });
      }
    } catch (e: any) {
      console.warn("[Backup] Falha ao enviar e-mail de erro:", e.message);
    }
  }
}

function gerarHtmlBackup(success: boolean, data: any): string {
  if (success) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Backup Concluído</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Tabelas</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${data.tabelasExportadas}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Registros</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${data.totalRegistros?.toLocaleString("pt-BR")}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Tamanho</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${formatBytes(data.tamanhoBytes || 0)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Duração</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${(data.duracao / 1000).toFixed(1)}s</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Cópia Neon</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${data.neonCopy ? "Sim" : "Não"}</td></tr>
          </table>
          ${data.s3Url ? `<p style="margin-top: 16px;"><a href="${data.s3Url}" style="color: #2563eb;">Baixar backup</a></p>` : ""}
          <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">ERP - Gestão Integrada</p>
        </div>
      </div>
    `;
  } else {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Backup Falhou</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p><strong>Erro:</strong> ${data.erro}</p>
          <p><strong>Duração:</strong> ${(data.duracao / 1000).toFixed(1)}s</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">ERP - Gestão Integrada</p>
        </div>
      </div>
    `;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ============================================================
// JOB AGENDADO — horário configurável via backup_config
// ============================================================

let backupTimeout: ReturnType<typeof setTimeout> | null = null;

function getNextBackupTimeForHour(hora: number, minuto: number): number {
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const localOffset = now.getTimezoneOffset();
  const diff = brasiliaOffset - (-localOffset);

  const brasilia = new Date(now.getTime() + diff * 60 * 1000);
  const next = new Date(brasilia);
  next.setHours(hora, minuto, 0, 0);

  if (next <= brasilia) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - diff * 60 * 1000;
}

async function scheduleNext() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
    backupTimeout = null;
  }

  const config = await obterConfigBackup();
  if (!config.ativo) {
    console.log("[Backup] Backup automático desativado na configuração");
    return;
  }

  const [h, m] = config.horario.split(":").map(Number);
  const hora = isNaN(h) ? 0 : h;
  const minuto = isNaN(m) ? 0 : m;

  const nextTime = getNextBackupTimeForHour(hora, minuto);
  const delay = nextTime - Date.now();
  const nextDate = new Date(nextTime);

  console.log(`[Backup] Próximo backup agendado para ${nextDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`);

  backupTimeout = setTimeout(async () => {
    try {
      console.log("[Backup] Iniciando backup automático diário...");
      await executarBackup("automatico", "Sistema (Job Diário)");
    } catch (e: any) {
      console.error("[Backup] Erro no job:", e.message);
    }
    scheduleNext();
  }, delay);
}

export function reagendarBackupJob() {
  scheduleNext().catch(e => console.error("[Backup] Erro ao reagendar:", e.message));
}

export function startBackupJob() {
  scheduleNext().catch(e => console.error("[Backup] Erro ao iniciar job:", e.message));
  console.log("[Backup] Job de backup diário iniciado");
}
