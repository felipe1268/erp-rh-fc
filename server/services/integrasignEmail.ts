import { sendEmail } from "./smtpService";

const BRAND_COLOR = "#1a365d";
const ACCENT_COLOR = "#2563eb";

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
  <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">✒️ IntegraSign</h1>
    <p style="color:#cbd5e1;margin:4px 0 0;font-size:13px">Assinatura Eletrônica de Contratos</p>
  </td></tr>
  <tr><td style="padding:32px">
    <h2 style="color:${BRAND_COLOR};margin:0 0 16px;font-size:18px">${title}</h2>
    ${bodyHtml}
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="color:#94a3b8;font-size:11px;margin:0">
      IntegraSign — Assinatura eletrônica em conformidade com MP 2.200-2/2001 e Lei 14.063/2020<br/>
      Mensagem automática — não responda este e-mail
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function btnHtml(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${ACCENT_COLOR};border-radius:6px;padding:14px 32px">
    <a href="${url}" style="color:#fff;text-decoration:none;font-weight:bold;font-size:15px">${label}</a>
  </td></tr></table>`;
}

function getBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.BASE_URL || "https://app.fcengenharia.com.br";
}

export async function enviarConviteAssinatura(params: {
  email: string;
  nome: string;
  papel: string;
  titulo: string;
  token: string;
  remetente?: string;
}) {
  const url = `${getBaseUrl()}/integrasign/assinar/${params.token}`;
  const papelDesc: Record<string, string> = {
    fornecedor: "Contratada/Fornecedor",
    gestor_projeto: "Gestor do Projeto",
    financeiro: "Financeiro",
    diretor: "Diretor",
    testemunha: "Testemunha",
  };

  const body = `
    <p style="color:#374151;line-height:1.6">Olá <strong>${params.nome}</strong>,</p>
    <p style="color:#374151;line-height:1.6">
      Você foi designado(a) como <strong>${papelDesc[params.papel] || params.papel}</strong>
      para assinar o seguinte documento:
    </p>
    <div style="background:#f0f9ff;border-left:4px solid ${ACCENT_COLOR};padding:16px;margin:16px 0;border-radius:0 6px 6px 0">
      <p style="margin:0;font-weight:bold;color:${BRAND_COLOR}">${params.titulo}</p>
    </div>
    <p style="color:#374151;line-height:1.6">Clique no botão abaixo para visualizar e assinar:</p>
    ${btnHtml("Assinar Documento", url)}
    <p style="color:#6b7280;font-size:13px">
      ⏰ Este link expira em <strong>7 dias</strong>.<br/>
      Se o link não funcionar, copie e cole o endereço no navegador:<br/>
      <span style="color:${ACCENT_COLOR};word-break:break-all">${url}</span>
    </p>
    ${params.remetente ? `<p style="color:#6b7280;font-size:13px">Enviado por: ${params.remetente}</p>` : ""}
  `;

  return sendEmail({
    to: params.email,
    subject: `✒️ Documento para assinar: ${params.titulo}`,
    html: baseTemplate("Documento Pendente de Assinatura", body),
    text: `Olá ${params.nome}, você tem um documento para assinar: ${params.titulo}. Acesse: ${url}`,
  });
}

export async function enviarLembrete(params: {
  email: string;
  nome: string;
  titulo: string;
  token: string;
}) {
  const url = `${getBaseUrl()}/integrasign/assinar/${params.token}`;

  const body = `
    <p style="color:#374151;line-height:1.6">Olá <strong>${params.nome}</strong>,</p>
    <p style="color:#374151;line-height:1.6">
      Este é um lembrete de que o documento abaixo ainda aguarda sua assinatura:
    </p>
    <div style="background:#fefce8;border-left:4px solid #eab308;padding:16px;margin:16px 0;border-radius:0 6px 6px 0">
      <p style="margin:0;font-weight:bold;color:${BRAND_COLOR}">${params.titulo}</p>
    </div>
    ${btnHtml("Assinar Agora", url)}
    <p style="color:#6b7280;font-size:13px">⏰ O link expira em 7 dias a partir do reenvio.</p>
  `;

  return sendEmail({
    to: params.email,
    subject: `🔔 Lembrete: Documento pendente — ${params.titulo}`,
    html: baseTemplate("Lembrete de Assinatura", body),
    text: `Olá ${params.nome}, lembrete: assine o documento "${params.titulo}". Acesse: ${url}`,
  });
}

export async function enviarNotificacaoProximoSignatario(params: {
  email: string;
  nome: string;
  papel: string;
  titulo: string;
  token: string;
  signatarioAnterior: string;
}) {
  const url = `${getBaseUrl()}/integrasign/assinar/${params.token}`;
  const papelDesc: Record<string, string> = {
    fornecedor: "Contratada/Fornecedor",
    gestor_projeto: "Gestor do Projeto",
    financeiro: "Financeiro",
    diretor: "Diretor",
    testemunha: "Testemunha",
  };

  const body = `
    <p style="color:#374151;line-height:1.6">Olá <strong>${params.nome}</strong>,</p>
    <p style="color:#374151;line-height:1.6">
      <strong>${params.signatarioAnterior}</strong> acabou de assinar o documento.
      Agora é a sua vez como <strong>${papelDesc[params.papel] || params.papel}</strong>.
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:16px 0;border-radius:0 6px 6px 0">
      <p style="margin:0;font-weight:bold;color:${BRAND_COLOR}">${params.titulo}</p>
    </div>
    ${btnHtml("Assinar Documento", url)}
    <p style="color:#6b7280;font-size:13px">⏰ Este link expira em <strong>7 dias</strong>.</p>
  `;

  return sendEmail({
    to: params.email,
    subject: `✒️ Sua vez de assinar: ${params.titulo}`,
    html: baseTemplate("Sua Vez de Assinar", body),
    text: `Olá ${params.nome}, é sua vez de assinar o documento "${params.titulo}". ${params.signatarioAnterior} já assinou. Acesse: ${url}`,
  });
}

export async function enviarNotificacaoConclusao(params: {
  emails: Array<{ email: string; nome: string }>;
  titulo: string;
}) {
  const body = `
    <p style="color:#374151;line-height:1.6">O documento abaixo teve todas as assinaturas concluídas:</p>
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:16px 0;border-radius:0 6px 6px 0">
      <p style="margin:0;font-weight:bold;color:${BRAND_COLOR}">✅ ${params.titulo}</p>
      <p style="margin:4px 0 0;color:#16a34a;font-size:13px">Todas as assinaturas foram realizadas com sucesso</p>
    </div>
    <p style="color:#374151;line-height:1.6">O contrato está ativo e o processo de medições pode ser iniciado.</p>
  `;

  const html = baseTemplate("Documento Totalmente Assinado", body);

  for (const recipient of params.emails) {
    await sendEmail({
      to: recipient.email,
      subject: `✅ Assinaturas concluídas: ${params.titulo}`,
      html,
      text: `O documento "${params.titulo}" teve todas as assinaturas concluídas. O contrato está ativo.`,
    });
    await new Promise(r => setTimeout(r, 300));
  }
}

export async function enviarNotificacaoRecusa(params: {
  emailRemetente: string;
  nomeRemetente: string;
  titulo: string;
  recusadoPor: string;
  motivo: string;
}) {
  const body = `
    <p style="color:#374151;line-height:1.6">Olá <strong>${params.nomeRemetente}</strong>,</p>
    <p style="color:#374151;line-height:1.6">
      O documento abaixo foi <strong style="color:#dc2626">recusado</strong>:
    </p>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:0 6px 6px 0">
      <p style="margin:0;font-weight:bold;color:${BRAND_COLOR}">${params.titulo}</p>
      <p style="margin:8px 0 0;color:#dc2626;font-size:13px">Recusado por: ${params.recusadoPor}</p>
      <p style="margin:4px 0 0;color:#374151;font-size:13px">Motivo: ${params.motivo}</p>
    </div>
    <p style="color:#374151;line-height:1.6">
      Você pode criar uma nova versão do envelope pelo painel IntegraSign para corrigir e reenviar.
    </p>
  `;

  return sendEmail({
    to: params.emailRemetente,
    subject: `❌ Documento recusado: ${params.titulo}`,
    html: baseTemplate("Documento Recusado", body),
    text: `O documento "${params.titulo}" foi recusado por ${params.recusadoPor}. Motivo: ${params.motivo}`,
  });
}
