import nodemailer from "nodemailer";
import { ENV } from "../_core/env";

// ============================================================
// SMTP EMAIL SERVICE - Envio real de e-mails via Nodemailer
// ============================================================

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!ENV.smtpHost || !ENV.smtpEmail || !ENV.smtpPassword) {
      throw new Error("SMTP não configurado. Defina SMTP_HOST, SMTP_EMAIL e SMTP_PASSWORD.");
    }
    transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpPort === 465, // true for 465 (SSL), false for 587 (TLS)
      auth: {
        user: ENV.smtpEmail,
        pass: ENV.smtpPassword,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
      },
    });
  }
  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envia um e-mail via SMTP
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: `"FC Engenharia - RH" <${ENV.smtpEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
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
    const result = await sendEmail({
      to: recipient.email,
      subject,
      html,
      text,
    });
    if (result.success) {
      enviados++;
    } else {
      erros++;
    }
    detalhes.push({ email: recipient.email, success: result.success, error: result.error });
    // Small delay between emails to avoid rate limiting
    if (recipients.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { enviados, erros, detalhes };
}

/**
 * Verifica a conexão SMTP
 */
export async function verificarConexaoSMTP(): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = getTransporter();
    await transport.verify();
    console.log("[SMTP] Conexão verificada com sucesso");
    return { success: true };
  } catch (error: any) {
    console.error("[SMTP] Erro na verificação:", error?.message || error);
    return { success: false, error: error?.message || "Erro desconhecido" };
  }
}
