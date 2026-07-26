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
    INSERT INTO backups (tipo, status, "iniciadoPor")
    VALUES (${tipo}, 'em_andamento', ${iniciadoPor})
    RETURNING id
  `);
  const backupId = (insertResult as any).rows?.[0]?.id;

  try {
    const allTables = await descobrirTabelas(db);
    console.log(`[Backup] ${allTables.length} tabelas descobertas no banco`);

    // Grava o total de tabelas logo no início para o painel calcular o progresso (0-100%).
    await db.execute(sql`
      UPDATE backups SET "tabelasTotal" = ${allTables.length}, "tabelasExportadas" = 0
      WHERE id = ${backupId}
    `);

    // Rev. 4618 — STREAMING: nunca acumula o banco inteiro na memória.
    // O backup antigo montava exportData{} com TODAS as 500+ tabelas de uma vez
    // e estourava o heap de 1GB (OOM derrubava o servidor em produção).
    // Agora cada tabela é lida em lotes (keyset por ctid) e escrita direto num
    // stream gzip em /tmp; só o arquivo COMPRIMIDO volta pra memória no final.
    const { createGzip } = await import("zlib");
    const fs = await import("fs");
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const tmpPath = `/tmp/erp-fc-backup-${timestamp}-${backupId}.json.gz`;

    const gzip = createGzip({ level: 9 });
    const fileStream = fs.createWriteStream(tmpPath);
    // Captura erro de I/O/compressão imediatamente (não só no end) —
    // sem isso, falha de disco no meio vira unhandled error/hang.
    let streamErro: Error | null = null;
    gzip.on("error", (e) => { streamErro = e; });
    fileStream.on("error", (e) => { streamErro = e; });
    gzip.pipe(fileStream);
    const write = (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        if (streamErro) return reject(streamErro);
        const ok = gzip.write(chunk, (err) => (err ? reject(err) : undefined));
        if (ok) resolve();
        else gzip.once("drain", () => (streamErro ? reject(streamErro) : resolve()));
      });

    let totalRegistros = 0;
    let tabelasExportadas = 0;
    const CTID_RE = /^\(\d+,\d+\)$/;

    // Lote adaptativo: tabelas com linhas gigantes (ex.: eventos com fotos base64,
    // ~190KB/linha) não podem vir 2.000 de uma vez — o driver parseia o lote
    // inteiro em memória. Alvo ~8MB por lote, entre 25 e 2.000 linhas.
    const TARGET_CHUNK_BYTES = 8 * 1024 * 1024;
    const avgRowBytes = new Map<string, number>();
    try {
      const sizes = await db.execute(sql`
        SELECT c.relname AS t, pg_table_size(c.oid) AS bytes, c.reltuples::bigint AS rows
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
      `);
      for (const r of ((sizes as any).rows || [])) {
        const rows = Number(r.rows);
        // reltuples <= 0 = tabela nunca analisada → sem estimativa confiável.
        if (rows > 0) avgRowBytes.set(String(r.t), Number(r.bytes) / rows);
      }
    } catch (e: any) {
      console.warn(`[Backup] Falha ao medir tabelas (usando lote padrão): ${e.message}`);
    }
    const chunkFor = (t: string) => {
      const avg = avgRowBytes.get(t) || 512;
      return Math.max(25, Math.min(2000, Math.floor(TARGET_CHUNK_BYTES / Math.max(avg, 256))));
    };

    await write(`{"tabelas":{`);
    let firstTable = true;

    try {
      for (const tableName of allTables) {
        if (tableName === "backup_snapshots") {
          tabelasExportadas++;
          continue;
        }

        try {
          let rowsDaTabela = 0;
          let lastCtid: string | null = null;
          let tabelaAberta = false;

          const baseSelect = tableName === "uploaded_files"
            ? `SELECT id, file_key, content_type, pg_column_size(data_base64) as tamanho_base64, ctid AS __ctid FROM uploaded_files`
            : `SELECT *, ctid AS __ctid FROM "${tableName}"`;

          // Keyset por ctid: estável, sem OFFSET quadrático, sem ORDER BY de coluna de negócio.
          const CHUNK = chunkFor(tableName);
          const t0Tabela = Date.now();
          for (;;) {
            const whereCtid = lastCtid ? ` WHERE ctid > '${lastCtid}'::tid` : "";
            const result = await db.execute(sql.raw(
              `${baseSelect}${whereCtid} ORDER BY ctid LIMIT ${CHUNK}`
            ));
            const data: any[] = (result as any).rows || [];
            if (data.length === 0) break;

            const rawCtid = String(data[data.length - 1].__ctid ?? "");
            if (!CTID_RE.test(rawCtid)) throw new Error(`ctid inesperado em ${tableName}: ${rawCtid}`);
            lastCtid = rawCtid;

            const parts: string[] = [];
            for (const row of data) {
              delete row.__ctid;
              parts.push(JSON.stringify(row));
            }

            if (!tabelaAberta) {
              await write(`${firstTable ? "" : ","}${JSON.stringify(tableName)}:[`);
              tabelaAberta = true;
              firstTable = false;
            } else {
              await write(",");
            }
            await write(parts.join(","));
            rowsDaTabela += data.length;
            if (data.length < CHUNK) break;
          }

          if (tabelaAberta) await write("]");
          totalRegistros += rowsDaTabela;
          tabelasExportadas++;
          const durTabela = Date.now() - t0Tabela;
          if (durTabela > 15_000) {
            console.log(`[Backup] Tabela lenta: ${tableName} — ${rowsDaTabela} linhas em ${(durTabela / 1000).toFixed(1)}s (lote ${CHUNK})`);
          }
        } catch (err: any) {
          console.warn(`[Backup] Tabela ${tableName} ignorada: ${err.message}`);
        }

        // Progresso incremental: a cada 10 tabelas, atualiza o contador para o painel mostrar o %.
        if (tabelasExportadas % 10 === 0) {
          try {
            await db.execute(sql`
              UPDATE backups SET "tabelasExportadas" = ${tabelasExportadas} WHERE id = ${backupId}
            `);
          } catch { /* progresso é best-effort; não interrompe o backup */ }
        }
      }

      const metadata = {
        versao: "2.0",
        dataBackup: now.toISOString(),
        tipo,
        iniciadoPor,
        tabelasExportadas,
        totalRegistros,
        tabelasTotal: allTables.length,
      };
      await write(`},"metadata":${JSON.stringify(metadata)}}`);

      await new Promise<void>((resolve, reject) => {
        if (streamErro) return reject(streamErro);
        fileStream.on("finish", () => (streamErro ? reject(streamErro) : resolve()));
        fileStream.on("error", reject);
        gzip.on("error", reject);
        gzip.end();
      });
    } catch (err) {
      try { gzip.destroy(); fileStream.destroy(); fs.unlinkSync(tmpPath); } catch { /* cleanup best-effort */ }
      throw err;
    }

    // Checkpoint final do contador ao sair do loop (cobre a defasagem se o último passo não foi múltiplo de 10).
    try {
      await db.execute(sql`
        UPDATE backups SET "tabelasExportadas" = ${tabelasExportadas} WHERE id = ${backupId}
      `);
    } catch { /* best-effort */ }

    const compressed = fs.readFileSync(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
    const tamanhoBytes = compressed.length;

    const s3Key = `backups/erp-fc-backup-${timestamp}.json.gz`;
    const { url: s3Url } = await storagePut(s3Key, compressed, "application/gzip");

    const neonCopy = await salvarSnapshotNeon(db, backupId, compressed);

    await db.execute(sql`
      UPDATE backups SET
        status = 'concluido',
        "tabelasExportadas" = ${tabelasExportadas},
        "registrosExportados" = ${totalRegistros},
        "tamanhoBytes" = ${tamanhoBytes},
        "s3Key" = ${s3Key},
        "s3Url" = ${s3Url},
        "concluidoEm" = NOW()
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
        "concluidoEm" = NOW()
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

const BACKUP_STALE_HORAS = 36;

export interface BackupHealth {
  ok: boolean;
  alerta: boolean;
  motivo: "ok" | "sem_db" | "sem_backup" | "stale" | "ultimo_falhou";
  stale: boolean;
  ultimoFalhou: boolean;
  idadeHoras: number | null;
  staleLimiteHoras: number;
  ultimo: any | null;
  ultimoConcluido: any | null;
  config: { horario: string; ativo: boolean };
}

/** Saúde do backup de dados: idade do último backup concluído, falhas e configuração. */
export async function getBackupHealth(): Promise<BackupHealth> {
  const config = await obterConfigBackup();
  const db = await getDb();
  if (!db) {
    return {
      ok: false, alerta: true, motivo: "sem_db", stale: true, ultimoFalhou: false,
      idadeHoras: null, staleLimiteHoras: BACKUP_STALE_HORAS, ultimo: null, ultimoConcluido: null, config,
    };
  }

  const lista: any[] = await listarBackups(10);
  const ultimo = lista[0] || null;
  const ultimoConcluido = lista.find((b) => b.status === "concluido") || null;

  let idadeHoras: number | null = null;
  if (ultimoConcluido?.concluidoEm) {
    idadeHoras = Math.floor((Date.now() - new Date(ultimoConcluido.concluidoEm).getTime()) / 3_600_000);
  }

  const stale = idadeHoras === null || idadeHoras > BACKUP_STALE_HORAS;
  const ultimoFalhou = !!(ultimo && ultimo.status === "erro");

  let motivo: BackupHealth["motivo"] = "ok";
  if (!ultimoConcluido) motivo = "sem_backup";
  else if (ultimoFalhou) motivo = "ultimo_falhou";
  else if (stale) motivo = "stale";

  const alerta = motivo !== "ok";
  return {
    ok: !alerta, alerta, motivo, stale, ultimoFalhou, idadeHoras,
    staleLimiteHoras: BACKUP_STALE_HORAS, ultimo, ultimoConcluido, config,
  };
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
