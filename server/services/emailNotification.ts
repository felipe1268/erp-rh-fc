/**
 * Serviço de Notificação por E-mail - Templates Profissionais com Branding da Empresa
 * 
 * Gera textos formais e técnicos para notificações de movimentação de funcionários.
 * O assunto e corpo do e-mail incluem o nome da empresa (razão social / nome fantasia).
 * O e-mail de demissão é focado exclusivamente na baixa do seguro de vida.
 * 
 * Tipos de movimentação:
 * - Contratação: novo funcionário cadastrado com status "Ativo"
 * - Demissão: status alterado para "Desligado" (foco: baixa no seguro de vida)
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
  const brasilHour = (now.getUTCHours() - 3 + 24) % 24;
  
  if (brasilHour >= 6 && brasilHour < 12) return "Bom dia";
  if (brasilHour >= 12 && brasilHour < 18) return "Boa tarde";
  return "Boa noite";
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

function formatCPF(cpf?: string): string {
  if (!cpf) return "";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return cpf;
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
  cnpj?: string;
  dataAdmissao?: string;
  dataDesligamento?: string;
  motivoAfastamento?: string;
  obraAnterior?: string;
  obraNova?: string;
  setorAnterior?: string;
  setorNovo?: string;
}

// ============================================================
// BUSCAR DADOS DA EMPRESA
// ============================================================
async function getCompanyData(companyId: number): Promise<{ razaoSocial: string; nomeFantasia: string; cnpj: string; logoUrl: string; email: string; telefone: string; endereco: string; cidade: string; estado: string }> {
  try {
    const db = await getDb();
    if (!db) return { razaoSocial: "", nomeFantasia: "", cnpj: "", logoUrl: "", email: "", telefone: "", endereco: "", cidade: "", estado: "" };
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return { razaoSocial: "", nomeFantasia: "", cnpj: "", logoUrl: "", email: "", telefone: "", endereco: "", cidade: "", estado: "" };
    return {
      razaoSocial: company.razaoSocial || "",
      nomeFantasia: company.nomeFantasia || "",
      cnpj: company.cnpj || "",
      logoUrl: company.logoUrl || "",
      email: company.email || "",
      telefone: company.telefone || "",
      endereco: company.endereco || "",
      cidade: company.cidade || "",
      estado: company.estado || "",
    };
  } catch {
    return { razaoSocial: "", nomeFantasia: "", cnpj: "", logoUrl: "", email: "", telefone: "", endereco: "", cidade: "", estado: "" };
  }
}

function getCompanyDisplayName(companyData: { razaoSocial: string; nomeFantasia: string }): string {
  return companyData.razaoSocial || companyData.nomeFantasia || "Departamento Pessoal";
}

function getCompanyShortName(companyData: { razaoSocial: string; nomeFantasia: string }): string {
  return companyData.nomeFantasia || companyData.razaoSocial || "Empresa";
}

// ============================================================
// CABEÇALHO E RODAPÉ PADRÃO DA EMPRESA
// ============================================================
function gerarCabecalho(companyData: { razaoSocial: string; nomeFantasia: string; cnpj: string }): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════");
  if (companyData.razaoSocial) lines.push(`  ${companyData.razaoSocial.toUpperCase()}`);
  if (companyData.nomeFantasia && companyData.nomeFantasia !== companyData.razaoSocial) {
    lines.push(`  ${companyData.nomeFantasia}`);
  }
  if (companyData.cnpj) lines.push(`  CNPJ: ${companyData.cnpj}`);
  lines.push("═══════════════════════════════════════════════");
  return lines.join("\n");
}

function gerarRodape(companyData: { razaoSocial: string; nomeFantasia: string; email: string; telefone: string }): string {
  const lines: string[] = [];
  lines.push("───────────────────────────────────────────────");
  lines.push("Departamento Pessoal");
  lines.push(getCompanyDisplayName(companyData));
  if (companyData.email) lines.push(`E-mail: ${companyData.email}`);
  if (companyData.telefone) lines.push(`Tel: ${companyData.telefone}`);
  lines.push("───────────────────────────────────────────────");
  lines.push("Este é um comunicado automático gerado pelo sistema de gestão de pessoas.");
  lines.push("Em caso de dúvidas, entre em contato com o Departamento Pessoal.");
  return lines.join("\n");
}

// ============================================================
// TEMPLATES DE E-MAIL PROFISSIONAIS
// ============================================================

function gerarTextoContratacao(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} - Nova Contratação - ${dados.nome}`;
  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE CONTRATAÇÃO

${saudacao},

Pelo presente, comunicamos que foi registrada a admissão do colaborador abaixo identificado no quadro de funcionários da empresa ${getCompanyDisplayName(companyData)}.

DADOS DO COLABORADOR ADMITIDO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Nome: ${dados.nome}
${dados.cpf ? `  CPF: ${formatCPF(dados.cpf)}` : ""}
${dados.funcao ? `  Função: ${dados.funcao}` : ""}
${dados.setor ? `  Setor: ${dados.setor}` : ""}
${dados.obra ? `  Obra/Local de Trabalho: ${dados.obra}` : ""}
${dados.dataAdmissao ? `  Data de Admissão: ${dados.dataAdmissao}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROVIDÊNCIAS NECESSÁRIAS:

1. Inclusão no seguro de vida do grupo empresarial
2. Agendamento de ASO admissional
3. Programação de treinamentos obrigatórios (NRs aplicáveis)
4. Entrega e registro de EPIs necessários para a função
5. Cadastro no sistema de ponto eletrônico
6. Atualização do quadro de pessoal

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoDemissao(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} - URGENTE: Baixa Seguro de Vida - Desligamento ${dados.nome}`;
  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE DESLIGAMENTO - BAIXA NO SEGURO DE VIDA

${saudacao},

Pelo presente, comunicamos o desligamento do colaborador abaixo identificado do quadro de funcionários da empresa ${getCompanyDisplayName(companyData)}.

Solicitamos, com URGÊNCIA, que seja providenciada a BAIXA NO SEGURO DE VIDA do referido colaborador junto à seguradora contratada.

DADOS DO COLABORADOR DESLIGADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Nome: ${dados.nome}
${dados.cpf ? `  CPF: ${formatCPF(dados.cpf)}` : ""}
${dados.funcao ? `  Função: ${dados.funcao}` : ""}
${dados.setor ? `  Setor: ${dados.setor}` : ""}
${dados.obra ? `  Última Obra/Local: ${dados.obra}` : ""}
${dados.dataDesligamento ? `  Data do Desligamento: ${dados.dataDesligamento}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STATUS DO COLABORADOR: DESLIGADO

AÇÃO IMEDIATA REQUERIDA:
→ Providenciar a BAIXA NO SEGURO DE VIDA junto à seguradora
→ Prazo recomendado: até 48 horas após o desligamento

DEMAIS PROVIDÊNCIAS RESCISÓRIAS:
1. Realização de ASO demissional dentro do prazo legal
2. Recolhimento de todos os EPIs entregues ao colaborador
3. Verificação de pendências documentais e cálculos rescisórios
4. Conferência de FGTS e guias rescisórias
5. Baixa no sistema de ponto eletrônico
6. Atualização do quadro de pessoal

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoTransferencia(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} - Transferência de Colaborador - ${dados.nome}`;
  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE TRANSFERÊNCIA

${saudacao},

Pelo presente, comunicamos que o colaborador abaixo identificado teve sua lotação alterada conforme detalhamento a seguir.

DADOS DA TRANSFERÊNCIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Colaborador: ${dados.nome}
${dados.cpf ? `  CPF: ${formatCPF(dados.cpf)}` : ""}
${dados.funcao ? `  Função: ${dados.funcao}` : ""}
${dados.obraAnterior ? `  Obra Anterior: ${dados.obraAnterior}` : ""}
${dados.obraNova ? `  Nova Obra: ${dados.obraNova}` : ""}
${dados.setorAnterior ? `  Setor Anterior: ${dados.setorAnterior}` : ""}
${dados.setorNovo ? `  Novo Setor: ${dados.setorNovo}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROVIDÊNCIAS NECESSÁRIAS:
1. Atualização do cartão de ponto no novo local de trabalho
2. Verificação de treinamentos específicos para o novo posto
3. Adequação de EPIs conforme riscos do novo ambiente de trabalho
4. Comunicação à seguradora sobre alteração de local (se aplicável)
5. Atualização do quadro de pessoal por obra

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoAfastamento(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} - Afastamento de Colaborador - ${dados.nome}`;
  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE AFASTAMENTO

${saudacao},

Pelo presente, comunicamos que o colaborador abaixo identificado teve um afastamento registrado no sistema da empresa ${getCompanyDisplayName(companyData)}.

DADOS DO AFASTAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Colaborador: ${dados.nome}
${dados.cpf ? `  CPF: ${formatCPF(dados.cpf)}` : ""}
${dados.funcao ? `  Função: ${dados.funcao}` : ""}
${dados.setor ? `  Setor: ${dados.setor}` : ""}
${dados.obra ? `  Obra/Local: ${dados.obra}` : ""}
${dados.motivoAfastamento ? `  Motivo: ${dados.motivoAfastamento}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STATUS DO COLABORADOR: AFASTADO

PROVIDÊNCIAS NECESSÁRIAS:
1. Comunicação ao INSS (se afastamento superior a 15 dias)
2. Comunicação à seguradora sobre o afastamento
3. Atualização do controle de ponto e folha de pagamento
4. Acompanhamento do prazo de retorno
5. Agendamento de ASO de retorno ao trabalho (quando aplicável)
6. Atualização do quadro de pessoal

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

// ============================================================
// GERADOR PRINCIPAL DE TEXTO
// ============================================================
export function gerarTextoNotificacao(
  tipo: TipoMovimentacao,
  dados: DadosFuncionario,
  companyData?: any
): { titulo: string; corpo: string } {
  const cd = companyData || { razaoSocial: dados.empresa || "", nomeFantasia: "", cnpj: dados.cnpj || "", logoUrl: "", email: "", telefone: "" };
  switch (tipo) {
    case "contratacao": return gerarTextoContratacao(dados, cd);
    case "demissao": return gerarTextoDemissao(dados, cd);
    case "transferencia": return gerarTextoTransferencia(dados, cd);
    case "afastamento": return gerarTextoAfastamento(dados, cd);
    default: return { titulo: `${getCompanyShortName(cd).toUpperCase()} - Movimentação - ${dados.nome}`, corpo: `Movimentação registrada para ${dados.nome}` };
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

  // Buscar dados completos da empresa para branding
  const companyData = await getCompanyData(companyId);

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

  // Gerar texto com branding da empresa
  const { titulo, corpo } = gerarTextoNotificacao(tipo, dados, companyData);

  // Enviar notificação via sistema Manus (notifyOwner)
  let enviados = 0;
  let erros = 0;
  const destinatariosNotificados: string[] = [];
  let envioSuccess = false;
  let envioErro = "";

  try {
    const destinatariosTexto = filteredRecipients.map(r => `  • ${r.nome} <${r.email}>`).join("\n");
    const corpoComDestinatarios = `${corpo}\n\nDestinatários desta notificação:\n${destinatariosTexto}`;
    
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
        empresa: getCompanyDisplayName(companyData),
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
  if (!statusAnterior && statusNovo === "Ativo") return "contratacao";
  if (statusNovo === "Desligado" && statusAnterior !== "Desligado") return "demissao";
  if (["Afastado", "Licenca", "Recluso"].includes(statusNovo) && 
      !["Afastado", "Licenca", "Recluso"].includes(statusAnterior || "")) {
    return "afastamento";
  }
  return null;
}

export function getMotivoAfastamento(status: string): string {
  switch (status) {
    case "Afastado": return "Afastamento (doença/acidente)";
    case "Licenca": return "Licença";
    case "Recluso": return "Reclusão";
    default: return status;
  }
}
