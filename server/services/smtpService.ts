import nodemailer from "nodemailer";
import { ENV } from "../_core/env";

// ============================================================
// SMTP EMAIL SERVICE - Envio real de e-mails via Nodemailer
// ============================================================

let transporter: nodemailer.Transporter | null = null;
let cachedSmtpEmail: string | null = null;

/** Chamado após salvar nova config SMTP para forçar recriação do transporter */
export function invalidateSmtpTransporter() {
  if (transporter) {
    try { transporter.close(); } catch { /* ignora */ }
  }
  transporter = null;
  cachedSmtpEmail = null;
}

/** Lê config SMTP do banco (sobrescreve ENV). Fallback para ENV se não houver config no banco. */
async function loadSmtpConfig(): Promise<{ host: string; port: number; email: string; password: string }> {
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      const rows = await db.$client.query(`SELECT host, port, email, password FROM smtp_config ORDER BY id DESC LIMIT 1`);
      if (rows.rows.length > 0) {
        const r = rows.rows[0];
        if (r.host && r.email && r.password) {
          return { host: r.host as string, port: r.port as number, email: r.email as string, password: r.password as string };
        }
      }
    }
  } catch {
    // Silencia erros de DB (ex.: tabela ainda não criada na primeira inicialização)
  }
  // Fallback para variáveis de ambiente
  return { host: ENV.smtpHost, port: ENV.smtpPort, email: ENV.smtpEmail, password: ENV.smtpPassword };
}

async function getTransporter(): Promise<{ transport: nodemailer.Transporter; email: string }> {
  if (!transporter) {
    const config = await loadSmtpConfig();
    if (!config.host || !config.email || !config.password) {
      throw new Error("SMTP não configurado. Acesse Configurações → Config. SMTP para definir as credenciais.");
    }
    cachedSmtpEmail = config.email;
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.email, pass: config.password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 45000,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });
  }
  return { transport: transporter, email: cachedSmtpEmail! };
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string; cid?: string }[];
}

/**
 * Envia um e-mail via SMTP
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { transport, email } = await getTransporter();
    const info = await transport.sendMail({
      from: `"Gestão Integrada - RH" <${email}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType ?? "application/octet-stream",
        ...(a.cid ? { cid: a.cid } : {}),
      })),
    });
    console.log(`[SMTP] E-mail enviado para ${options.to} - MessageID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[SMTP] Erro ao enviar e-mail para ${options.to}:`, error?.message || error);
    return { success: false, error: error?.message || "Erro desconhecido" };
  }
}

/**
 * Envia e-mails para múltiplos destinatários
 */
export async function sendEmailToMultiple(
  recipients: { nome: string; email: string }[],
  subject: string,
  html: string,
  text?: string,
): Promise<{ enviados: number; erros: number; detalhes: { email: string; success: boolean; error?: string }[] }> {
  let enviados = 0;
  let erros = 0;
  const detalhes: { email: string; success: boolean; error?: string }[] = [];

  for (const recipient of recipients) {
    const result = await sendEmail({ to: recipient.email, subject, html, text });
    if (result.success) {
      enviados++;
    } else {
      erros++;
    }
    detalhes.push({ email: recipient.email, success: result.success, error: result.error });
    if (recipients.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { enviados, erros, detalhes };
}

/**
 * Verifica a conexão SMTP (usa config atual do banco ou ENV)
 */
export async function verificarConexaoSMTP(): Promise<{ success: boolean; error?: string }> {
  try {
    const { transport } = await getTransporter();
    await transport.verify();
    console.log("[SMTP] Conexão verificada com sucesso");
    return { success: true };
  } catch (error: any) {
    console.error("[SMTP] Erro na verificação:", error?.message || error);
    return { success: false, error: error?.message || "Erro desconhecido" };
  }
}
