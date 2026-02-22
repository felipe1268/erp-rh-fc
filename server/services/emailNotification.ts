/**
 * Serviço de Notificação por E-mail - Templates Humanizados
 * 
 * Gera textos humanizados para notificações de movimentação de funcionários.
 * Saudação baseada no horário: "Excelente dia!", "Excelente tarde!", "Excelente noite!"
 * 
 * Tipos de movimentação:
 * - Contratação: novo funcionário cadastrado com status "Ativo"
 * - Demissão: status alterado para "Desligado"
 * - Transferência: mudança de obra ou setor
 * - Afastamento: status alterado para "Afastado", "Licenca" ou "Recluso"
 */

import { notifyOwner } from "../_core/notification";
import { getDb } from "../db";
import { notificationRecipients, companies, auditLogs, notificationLogs } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";

// ============================================================
// SAUDAÇÃO BASEADA NO HORÁRIO (fuso horário Brasil -3)
// ============================================================
function getSaudacao(): string {
  const now = new Date();
  // Ajustar para horário de Brasília (UTC-3)
  const brasilHour = (now.getUTCHours() - 3 + 24) % 24;
  
  if (brasilHour >= 6 && brasilHour < 12) return "Excelente dia";
  if (brasilHour >= 12 && brasilHour < 18) return "Excelente tarde";
  return "Excelente noite";
}

function getDataFormatada(): string {
  const now = new Date();
  return now.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function getHoraFormatada(): string {
  const now = new Date();
  return now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// ============================================================
// TIPOS
// ============================================================
export type TipoMovimentacao = "contratacao" | "demissao" | "transferencia" | "afastamento";

export interface DadosFuncionario {
  nome: string;
  cpf?: string;
  funcao?: string;
  setor?: string;
  obra?: string;
  empresa?: string;
  dataAdmissao?: string;
  dataDesligamento?: string;
  motivoAfastamento?: string;
  obraAnterior?: string;
  obraNova?: string;
  setorAnterior?: string;
  setorNovo?: string;
}

// ============================================================
// TEMPLATES DE E-MAIL HUMANIZADOS
// ============================================================

function gerarTextoContratacao(dados: DadosFuncionario): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();

  const titulo = `🎉 Nova Contratação - ${dados.nome}`;
  const corpo = `${saudacao}!

Gostaríamos de comunicar que um novo colaborador acaba de ser registrado em nosso sistema.

📋 DADOS DA CONTRATAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Colaborador: ${dados.nome}
${dados.cpf ? `• CPF: ${dados.cpf}` : ""}
${dados.funcao ? `• Função: ${dados.funcao}` : ""}
${dados.setor ? `• Setor: ${dados.setor}` : ""}
${dados.obra ? `• Obra/Local: ${dados.obra}` : ""}
${dados.empresa ? `• Empresa: ${dados.empresa}` : ""}
${dados.dataAdmissao ? `• Data de Admissão: ${dados.dataAdmissao}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solicitamos que os setores envolvidos tomem as providências necessárias para a integração deste novo membro da equipe, incluindo:
• Providenciar ASO admissional
• Agendar treinamentos obrigatórios (NRs aplicáveis)
• Entregar EPIs necessários para a função
• Incluir no seguro de vida da empresa

📅 Registro realizado em ${data}, às ${hora}.

Atenciosamente,
Sistema ERP RH - Gestão de Pessoas`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoDemissao(dados: DadosFuncionario): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();

  const titulo = `⚠️ Desligamento - ${dados.nome}`;
  const corpo = `${saudacao}!

Informamos que o colaborador abaixo teve seu desligamento registrado no sistema.

📋 DADOS DO DESLIGAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Colaborador: ${dados.nome}
${dados.cpf ? `• CPF: ${dados.cpf}` : ""}
${dados.funcao ? `• Função: ${dados.funcao}` : ""}
${dados.setor ? `• Setor: ${dados.setor}` : ""}
${dados.obra ? `• Última Obra/Local: ${dados.obra}` : ""}
${dados.empresa ? `• Empresa: ${dados.empresa}` : ""}
${dados.dataDesligamento ? `• Data do Desligamento: ${dados.dataDesligamento}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solicitamos atenção aos seguintes procedimentos:
• Realizar ASO demissional dentro do prazo legal
• Recolher todos os EPIs entregues ao colaborador
• Providenciar baixa no seguro de vida
• Verificar pendências de documentação e rescisão
• Conferir cálculos rescisórios e FGTS

📅 Registro realizado em ${data}, às ${hora}.

Atenciosamente,
Sistema ERP RH - Gestão de Pessoas`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoTransferencia(dados: DadosFuncionario): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();

  const titulo = `🔄 Transferência - ${dados.nome}`;
  const corpo = `${saudacao}!

Comunicamos que o colaborador abaixo teve uma transferência registrada no sistema.

📋 DADOS DA TRANSFERÊNCIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Colaborador: ${dados.nome}
${dados.cpf ? `• CPF: ${dados.cpf}` : ""}
${dados.funcao ? `• Função: ${dados.funcao}` : ""}
${dados.empresa ? `• Empresa: ${dados.empresa}` : ""}
${dados.obraAnterior ? `• Obra Anterior: ${dados.obraAnterior}` : ""}
${dados.obraNova ? `• Nova Obra: ${dados.obraNova}` : ""}
${dados.setorAnterior ? `• Setor Anterior: ${dados.setorAnterior}` : ""}
${dados.setorNovo ? `• Novo Setor: ${dados.setorNovo}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solicitamos que os responsáveis pela nova lotação providenciem:
• Atualização do cartão de ponto no novo local
• Verificação de treinamentos específicos para o novo posto
• Adequação de EPIs conforme riscos do novo ambiente

📅 Registro realizado em ${data}, às ${hora}.

Atenciosamente,
Sistema ERP RH - Gestão de Pessoas`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoAfastamento(dados: DadosFuncionario): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();

  const titulo = `🏥 Afastamento - ${dados.nome}`;
  const corpo = `${saudacao}!

Informamos que o colaborador abaixo teve um afastamento registrado no sistema.

📋 DADOS DO AFASTAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Colaborador: ${dados.nome}
${dados.cpf ? `• CPF: ${dados.cpf}` : ""}
${dados.funcao ? `• Função: ${dados.funcao}` : ""}
${dados.setor ? `• Setor: ${dados.setor}` : ""}
${dados.obra ? `• Obra/Local: ${dados.obra}` : ""}
${dados.empresa ? `• Empresa: ${dados.empresa}` : ""}
${dados.motivoAfastamento ? `• Motivo: ${dados.motivoAfastamento}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solicitamos atenção aos seguintes pontos:
• Verificar necessidade de comunicação ao INSS (se afastamento > 15 dias)
• Atualizar controle de ponto e folha de pagamento
• Comunicar a seguradora sobre o afastamento
• Acompanhar prazo de retorno e agendar ASO de retorno

📅 Registro realizado em ${data}, às ${hora}.

Atenciosamente,
Sistema ERP RH - Gestão de Pessoas`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

// ============================================================
// GERADOR PRINCIPAL DE TEXTO
// ============================================================
export function gerarTextoNotificacao(
  tipo: TipoMovimentacao,
  dados: DadosFuncionario
): { titulo: string; corpo: string } {
  switch (tipo) {
    case "contratacao": return gerarTextoContratacao(dados);
    case "demissao": return gerarTextoDemissao(dados);
    case "transferencia": return gerarTextoTransferencia(dados);
    case "afastamento": return gerarTextoAfastamento(dados);
    default: return { titulo: `Movimentação - ${dados.nome}`, corpo: `Movimentação registrada para ${dados.nome}` };
  }
}

// ============================================================
// FUNÇÃO DE DISPARO DE NOTIFICAÇÕES
// ============================================================
export async function dispararNotificacao(
  companyId: number,
  tipo: TipoMovimentacao,
  dados: DadosFuncionario & { employeeId?: number; statusAnterior?: string; statusNovo?: string },
  userId?: number,
  userName?: string,
): Promise<{ enviados: number; erros: number; destinatarios: string[] }> {
  const db = await getDb();
  if (!db) return { enviados: 0, erros: 0, destinatarios: [] };

  // Buscar destinatários ativos para este tipo de notificação
  const recipients = await db
    .select()
    .from(notificationRecipients)
    .where(and(
      eq(notificationRecipients.companyId, companyId),
      eq(notificationRecipients.ativo, true),
    ));

  // Filtrar por tipo de notificação
  const filteredRecipients = recipients.filter((r) => {
    switch (tipo) {
      case "contratacao": return r.notificarContratacao;
      case "demissao": return r.notificarDemissao;
      case "transferencia": return r.notificarTransferencia;
      case "afastamento": return r.notificarAfastamento;
      default: return false;
    }
  });

  if (filteredRecipients.length === 0) {
    return { enviados: 0, erros: 0, destinatarios: [] };
  }

  // Gerar texto humanizado
  const { titulo, corpo } = gerarTextoNotificacao(tipo, dados);

  // Enviar notificação via sistema Manus (notifyOwner)
  let enviados = 0;
  let erros = 0;
  const destinatariosNotificados: string[] = [];
  let envioSuccess = false;
  let envioErro = "";

  try {
    const destinatariosTexto = filteredRecipients.map(r => `${r.nome} <${r.email}>`).join(", ");
    const corpoComDestinatarios = `${corpo}\n\n📧 Destinatários desta notificação:\n${destinatariosTexto}`;
    
    const success = await notifyOwner({ title: titulo, content: corpoComDestinatarios });
    if (success) {
      enviados = filteredRecipients.length;
      envioSuccess = true;
      destinatariosNotificados.push(...filteredRecipients.map(r => r.email));
    } else {
      erros = filteredRecipients.length;
      envioErro = "Serviço de notificação indisponível";
    }
  } catch (error: any) {
    console.error("[EmailNotification] Erro ao enviar notificação:", error);
    erros = filteredRecipients.length;
    envioErro = error?.message || "Erro desconhecido";
  }

  // Registrar cada destinatário no notification_logs
  for (const recipient of filteredRecipients) {
    const trackingId = crypto.randomUUID();
    try {
      await db.insert(notificationLogs).values({
        companyId,
        employeeId: dados.employeeId || null,
        employeeName: dados.nome,
        employeeCpf: dados.cpf || null,
        employeeFuncao: dados.funcao || null,
        tipoMovimentacao: tipo,
        statusAnterior: dados.statusAnterior || null,
        statusNovo: dados.statusNovo || null,
        recipientId: recipient.id,
        recipientName: recipient.nome,
        recipientEmail: recipient.email,
        titulo,
        corpo,
        statusEnvio: envioSuccess ? "enviado" : "erro",
        erroMensagem: envioSuccess ? null : envioErro,
        trackingId,
        disparadoPor: userName || "Sistema",
        disparadoPorId: userId || null,
      });
    } catch (e) {
      console.error("[EmailNotification] Erro ao registrar notification_log:", e);
    }
  }

  // Registrar no audit log
  try {
    await db.insert(auditLogs).values({
      userId: userId || null,
      userName: userName || "Sistema",
      action: "NOTIFICATION",
      module: "notificacoes",
      entityType: tipo,
      details: JSON.stringify({
        tipo,
        funcionario: dados.nome,
        destinatarios: filteredRecipients.map(r => ({ nome: r.nome, email: r.email })),
        enviados,
        erros,
        titulo,
      }),
    });
  } catch (e) {
    console.error("[EmailNotification] Erro ao registrar audit log:", e);
  }

  return { enviados, erros, destinatarios: destinatariosNotificados };
}

// ============================================================
// CONSULTAR LOG DE NOTIFICAÇÕES
// ============================================================
export async function getNotificationLogs(companyId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationLogs)
    .where(eq(notificationLogs.companyId, companyId))
    .orderBy(desc(notificationLogs.enviadoEm))
    .limit(limit);
}

export async function getNotificationLogStats(companyId: number) {
  const db = await getDb();
  if (!db) return { total: 0, enviados: 0, erros: 0, lidos: 0 };
  const rows = await db.select({
    total: sql<number>`count(*)`,
    enviados: sql<number>`SUM(CASE WHEN statusEnvio = 'enviado' THEN 1 ELSE 0 END)`,
    erros: sql<number>`SUM(CASE WHEN statusEnvio = 'erro' THEN 1 ELSE 0 END)`,
    lidos: sql<number>`SUM(CASE WHEN lido = true THEN 1 ELSE 0 END)`,
  }).from(notificationLogs).where(eq(notificationLogs.companyId, companyId));
  return rows[0] || { total: 0, enviados: 0, erros: 0, lidos: 0 };
}

// ============================================================
// MAPEAR STATUS PARA TIPO DE MOVIMENTAÇÃO
// ============================================================
export function mapStatusToTipoMovimentacao(
  statusAnterior: string | null,
  statusNovo: string
): TipoMovimentacao | null {
  // Contratação: novo funcionário com status Ativo
  if (!statusAnterior && statusNovo === "Ativo") return "contratacao";
  
  // Demissão: qualquer status → Desligado
  if (statusNovo === "Desligado" && statusAnterior !== "Desligado") return "demissao";
  
  // Afastamento: qualquer status → Afastado, Licença ou Recluso
  if (["Afastado", "Licenca", "Recluso"].includes(statusNovo) && 
      !["Afastado", "Licenca", "Recluso"].includes(statusAnterior || "")) {
    return "afastamento";
  }
  
  return null;
}

// Motivo legível para afastamento
export function getMotivoAfastamento(status: string): string {
  switch (status) {
    case "Afastado": return "Afastamento (doença/acidente)";
    case "Licenca": return "Licença";
    case "Recluso": return "Reclusão";
    default: return status;
  }
}
