/**
 * Serviço de Backup Automatizado do Banco de Dados
 * 
 * Exporta todas as tabelas do banco em JSON, compacta em ZIP,
 * faz upload para S3 e notifica o admin por e-mail e plataforma.
 * 
 * Execução: diária às 03:00 (automático) ou sob demanda (manual).
 */

import { getDb } from "../db";
import { backups } from "../../drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import { storagePut } from "../storage";
import { sendEmail } from "./smtpService";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";
import { createGzip } from "zlib";
import { promisify } from "util";
import { pipeline } from "stream";
const pipelineAsync = promisify(pipeline);

// Lista de todas as tabelas do sistema (160 tabelas)
const ALL_TABLES = [
  "accidents", "action_plans", "advances", "alertas_terceiros", "asos", "atestados",
  "audit_logs", "audits", "avaliacao_avaliadores", "avaliacao_ciclos", "avaliacao_config",
  "avaliacao_perguntas", "avaliacao_questionarios", "avaliacao_respostas", "avaliacoes",
  "blacklist_reactivation_requests", "caepi_database", "chemicals", "cipa_elections",
  "cipa_meetings", "cipa_members", "clinicas", "companies", "company_bank_accounts",
  "company_documents", "convencao_coletiva", "custom_exams", "datajud_alerts",
  "datajud_auto_check_config", "dds", "deviations", "dissidio_funcionarios", "dissidios",
  "dixi_afd_importacoes", "dixi_afd_marcacoes", "dixi_devices", "dixi_name_mappings",
  "document_templates", "email_templates", "employee_aptidao", "employee_documents",
  "employee_history", "employee_site_history", "employees", "empresas_terceiras",
  "epi_ai_analises", "epi_alerta_capacidade", "epi_alerta_capacidade_log", "epi_assinaturas",
  "epi_checklist_items", "epi_checklists", "epi_cores_capacete", "epi_deliveries",
  "epi_discount_alerts", "epi_estoque_minimo", "epi_estoque_obra", "epi_kit_items",
  "epi_kits", "epi_transferencias", "epi_treinamentos_vinculados", "epi_vida_util",
  "epis", "equipment", "eval_audit_log", "eval_avaliacoes", "eval_avaliadores",
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

interface BackupResult {
  success: boolean;
  backupId: number;
  tabelasExportadas: number;
  registrosExportados: number;
  tamanhoBytes: number;
  s3Url?: string;
  erro?: string;
  duracao: number; // ms
}

/**
 * Executa backup completo do banco de dados.
 * 1. Cria registro no banco (status: em_andamento)
 * 2. Exporta cada tabela como JSON
 * 3. Compacta tudo em um único buffer (JSON Lines comprimido com gzip)
 * 4. Faz upload para S3
 * 5. Atualiza registro com status final
 * 6. Notifica admin
 */
export async function executarBackup(
  tipo: "automatico" | "manual" = "automatico",
  iniciadoPor: string = "Sistema"
): Promise<BackupResult> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  // 1. Criar registro de backup
  const [insertResult] = await db.insert(backups).values({
    tipo,
    status: "em_andamento",
    iniciadoPor,
  });
  const backupId = insertResult.insertId;

  try {
    // 2. Exportar todas as tabelas
    const exportData: Record<string, unknown[]> = {};
    let totalRegistros = 0;
    let tabelasExportadas = 0;

    for (const tableName of ALL_TABLES) {
      try {
        const rows = await db.execute(sql.raw(`SELECT * FROM \`${tableName}\``));
        const data = Array.isArray(rows) ? (rows[0] as unknown[]) || [] : [];
        if (data.length > 0) {
          exportData[tableName] = data;
          totalRegistros += data.length;
        }
        tabelasExportadas++;
      } catch (err: any) {
        // Tabela pode não existir ainda — ignorar
        console.warn(`[Backup] Tabela ${tableName} ignorada: ${err.message}`);
      }
    }

    // 3. Serializar e comprimir
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonContent = JSON.stringify({
      metadata: {
        versao: "1.0",
        dataBackup: now.toISOString(),
        tipo,
        iniciadoPor,
        tabelasExportadas,
        totalRegistros,
      },
      tabelas: exportData,
    });

    // Comprimir com gzip
    const { gzipSync } = await import("zlib");
    const compressed = gzipSync(Buffer.from(jsonContent, "utf-8"), { level: 9 });
    const tamanhoBytes = compressed.length;

    // 4. Upload para S3
    const s3Key = `backups/erp-fc-backup-${timestamp}.json.gz`;
    const { url: s3Url } = await storagePut(s3Key, compressed, "application/gzip");

    // 5. Atualizar registro
    await db.update(backups).set({
      status: "concluido",
      tabelasExportadas,
      registrosExportados: totalRegistros,
      tamanhoBytes,
      s3Key,
      s3Url,
      concluidoEm: new Date().toISOString().replace("T", " ").slice(0, 19),
    }).where(eq(backups.id, backupId));

    const duracao = Date.now() - startTime;

    // 6. Notificar admin
    await notificarBackup({
      success: true,
      tipo,
      tabelasExportadas,
      totalRegistros,
      tamanhoBytes,
      duracao,
      s3Url,
    });

    console.log(`[Backup] Concluído em ${(duracao / 1000).toFixed(1)}s — ${tabelasExportadas} tabelas, ${totalRegistros.toLocaleString("pt-BR")} registros, ${formatBytes(tamanhoBytes)}`);

    return {
      success: true,
      backupId,
      tabelasExportadas,
      registrosExportados: totalRegistros,
      tamanhoBytes,
      s3Url,
      duracao,
    };

  } catch (err: any) {
    const duracao = Date.now() - startTime;

    // Atualizar registro com erro
    await db.update(backups).set({
      status: "erro",
      erro: err.message?.slice(0, 500),
      concluidoEm: new Date().toISOString().replace("T", " ").slice(0, 19),
    }).where(eq(backups.id, backupId));

    // Notificar erro
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
    };
  }
}

/**
 * Lista backups do banco de dados (mais recentes primeiro).
 */
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
}) {
  const { success, tipo, tabelasExportadas, totalRegistros, tamanhoBytes, duracao, s3Url, erro } = params;

  if (success) {
    const titulo = `Backup ${tipo === "automatico" ? "Automático" : "Manual"} Concluído`;
    const conteudo = [
      `Backup ${tipo} do banco de dados concluído com sucesso.`,
      ``,
      `Tabelas exportadas: ${tabelasExportadas}`,
      `Registros exportados: ${totalRegistros?.toLocaleString("pt-BR")}`,
      `Tamanho comprimido: ${formatBytes(tamanhoBytes || 0)}`,
      `Duração: ${(duracao / 1000).toFixed(1)}s`,
      s3Url ? `\nLink: ${s3Url}` : "",
    ].join("\n");

    // Notificação na plataforma
    try { await notifyOwner({ title: titulo, content: conteudo }); } catch {}

    // E-mail
    try {
      if (ENV.smtpHost && ENV.smtpEmail) {
        await sendEmail({
          to: ENV.smtpEmail,
          subject: `[ERP FC] ${titulo}`,
          html: gerarHtmlBackup(true, { tabelasExportadas, totalRegistros, tamanhoBytes, duracao, s3Url }),
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
          <h2 style="margin: 0;">✅ Backup Concluído</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Tabelas</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${data.tabelasExportadas}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Registros</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${data.totalRegistros?.toLocaleString("pt-BR")}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Tamanho</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${formatBytes(data.tamanhoBytes || 0)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-weight: bold;">Duração</td><td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${(data.duracao / 1000).toFixed(1)}s</td></tr>
          </table>
          ${data.s3Url ? `<p style="margin-top: 16px;"><a href="${data.s3Url}" style="color: #2563eb;">Baixar backup</a></p>` : ""}
          <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">ERP - Gestão Integrada | FC Engenharia Civil</p>
        </div>
      </div>
    `;
  } else {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">❌ Backup Falhou</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p><strong>Erro:</strong> ${data.erro}</p>
          <p><strong>Duração:</strong> ${(data.duracao / 1000).toFixed(1)}s</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">ERP - Gestão Integrada | FC Engenharia Civil</p>
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
// JOB AGENDADO (backup diário às 03:00 Brasília)
// ============================================================

let backupInterval: ReturnType<typeof setInterval> | null = null;

export function startBackupJob() {
  if (backupInterval) return;

  // Calcular próximo horário de 03:00 Brasília
  function getNextBackupTime(): number {
    const now = new Date();
    // Converter para Brasília (UTC-3)
    const brasiliaOffset = -3 * 60; // minutos
    const localOffset = now.getTimezoneOffset(); // minutos
    const diff = brasiliaOffset - (-localOffset);
    
    const brasilia = new Date(now.getTime() + diff * 60 * 1000);
    const next = new Date(brasilia);
    next.setHours(3, 0, 0, 0);
    
    if (next <= brasilia) {
      next.setDate(next.getDate() + 1);
    }
    
    // Converter de volta para UTC
    return next.getTime() - diff * 60 * 1000;
  }

  function scheduleNext() {
    const nextTime = getNextBackupTime();
    const delay = nextTime - Date.now();
    const nextDate = new Date(nextTime);
    
    console.log(`[Backup] Próximo backup agendado para ${nextDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`);
    
    setTimeout(async () => {
      try {
        console.log("[Backup] Iniciando backup automático diário...");
        await executarBackup("automatico", "Sistema (Job Diário)");
      } catch (e: any) {
        console.error("[Backup] Erro no job:", e.message);
      }
      // Agendar próximo
      scheduleNext();
    }, delay);
  }

  scheduleNext();
  console.log("[Backup] Job de backup diário iniciado (03:00 Brasília)");
}
