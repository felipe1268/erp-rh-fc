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
// CABEÇALHO E RODAPÉ PADRÃO DA EMPRESA (limpo e organizado)
// ============================================================
function gerarCabecalho(companyData: { razaoSocial: string; nomeFantasia: string; cnpj: string }): string {
  const lines: string[] = [];
  lines.push("────────────────────────────────────────────────");
  if (companyData.nomeFantasia) {
    lines.push(`  ${companyData.nomeFantasia.toUpperCase()}`);
  }
  if (companyData.razaoSocial && companyData.razaoSocial !== companyData.nomeFantasia) {
    lines.push(`  ${companyData.razaoSocial}`);
  }
  if (companyData.cnpj) lines.push(`  CNPJ: ${companyData.cnpj}`);
  lines.push("────────────────────────────────────────────────");
  return lines.join("\n");
}

function gerarRodape(companyData: { razaoSocial: string; nomeFantasia: string; email: string; telefone: string }): string {
  const lines: string[] = [];
  lines.push("────────────────────────────────────────────────");
  lines.push("Atenciosamente,");
  lines.push("");
  lines.push("Departamento Pessoal");
  lines.push(getCompanyDisplayName(companyData));
  if (companyData.email) lines.push(`E-mail: ${companyData.email}`);
  if (companyData.telefone) lines.push(`Tel: ${companyData.telefone}`);
  lines.push("────────────────────────────────────────────────");
  lines.push("");
  lines.push("Comunicado automático — Sistema de Gestão de Pessoas");
  lines.push("Em caso de dúvidas, entre em contato com o Departamento Pessoal.");
  return lines.join("\n");
}

// ============================================================
// BLOCO DE DADOS DO FUNCIONÁRIO (formatado para destaque)
// ============================================================
function gerarBlocoDados(label: string, dados: { campo: string; valor: string }[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`▸ ${label}`);
  lines.push("┌──────────────────────────────────────────────┐");
  for (const d of dados) {
    if (d.valor) {
      lines.push(`│  ${d.campo}: ${d.valor}`);
    }
  }
  lines.push("└──────────────────────────────────────────────┘");
  lines.push("");
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

  const titulo = `${empresaNome.toUpperCase()} — Nova Contratação — ${dados.nome}`;

  const blocoDados = gerarBlocoDados("DADOS DO COLABORADOR ADMITIDO", [
    { campo: "Nome completo", valor: dados.nome },
    { campo: "CPF", valor: formatCPF(dados.cpf) },
    { campo: "Função", valor: dados.funcao || "" },
    { campo: "Setor", valor: dados.setor || "" },
    { campo: "Obra / Local", valor: dados.obra || "" },
    { campo: "Data de Admissão", valor: dados.dataAdmissao || "" },
  ]);

  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE CONTRATAÇÃO

${saudacao},

Comunicamos a admissão do colaborador abaixo identificado no quadro de funcionários da empresa ${getCompanyDisplayName(companyData)}.
${blocoDados}
Providências necessárias:
  • Inclusão no seguro de vida do grupo empresarial
  • Agendamento de ASO admissional
  • Programação de treinamentos obrigatórios (NRs aplicáveis)
  • Entrega e registro de EPIs
  • Cadastro no sistema de ponto eletrônico

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoDemissao(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} — URGENTE: Baixa Seguro de Vida — ${dados.nome}`;

  const blocoDados = gerarBlocoDados("DADOS DO COLABORADOR DESLIGADO", [
    { campo: "Nome completo", valor: dados.nome },
    { campo: "CPF", valor: formatCPF(dados.cpf) },
    { campo: "Função", valor: dados.funcao || "" },
    { campo: "Setor", valor: dados.setor || "" },
    { campo: "Última Obra / Local", valor: dados.obra || "" },
    { campo: "Data do Desligamento", valor: dados.dataDesligamento || "" },
  ]);

  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE DESLIGAMENTO — BAIXA NO SEGURO DE VIDA

${saudacao},

Comunicamos o desligamento do colaborador abaixo identificado do quadro de funcionários da empresa ${getCompanyDisplayName(companyData)}.

Solicitamos, com URGÊNCIA, a providência da BAIXA NO SEGURO DE VIDA junto à seguradora contratada.
${blocoDados}
  ⚠  STATUS: DESLIGADO

  ➤  AÇÃO REQUERIDA: Baixa no Seguro de Vida
  ➤  PRAZO: Até 48 horas após o desligamento

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoTransferencia(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} — Transferência — ${dados.nome}`;

  const blocoDados = gerarBlocoDados("DADOS DA TRANSFERÊNCIA", [
    { campo: "Colaborador", valor: dados.nome },
    { campo: "CPF", valor: formatCPF(dados.cpf) },
    { campo: "Função", valor: dados.funcao || "" },
    { campo: "Obra Anterior", valor: dados.obraAnterior || "" },
    { campo: "Nova Obra", valor: dados.obraNova || "" },
    { campo: "Setor Anterior", valor: dados.setorAnterior || "" },
    { campo: "Novo Setor", valor: dados.setorNovo || "" },
  ]);

  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE TRANSFERÊNCIA

${saudacao},

Comunicamos que o colaborador abaixo identificado teve sua lotação alterada na empresa ${getCompanyDisplayName(companyData)}.
${blocoDados}
Providências necessárias:
  • Atualização do cartão de ponto no novo local
  • Verificação de treinamentos específicos para o novo posto
  • Adequação de EPIs conforme riscos do novo ambiente
  • Comunicação à seguradora (se aplicável)

Registro efetuado em ${data}, às ${hora}.

${gerarRodape(companyData)}`;

  return { titulo, corpo: corpo.replace(/\n{3,}/g, "\n\n") };
}

function gerarTextoAfastamento(dados: DadosFuncionario, companyData: any): { titulo: string; corpo: string } {
  const saudacao = getSaudacao();
  const data = getDataFormatada();
  const hora = getHoraFormatada();
  const empresaNome = getCompanyShortName(companyData);

  const titulo = `${empresaNome.toUpperCase()} — Afastamento — ${dados.nome}`;

  const blocoDados = gerarBlocoDados("DADOS DO AFASTAMENTO", [
    { campo: "Colaborador", valor: dados.nome },
    { campo: "CPF", valor: formatCPF(dados.cpf) },
    { campo: "Função", valor: dados.funcao || "" },
    { campo: "Setor", valor: dados.setor || "" },
    { campo: "Obra / Local", valor: dados.obra || "" },
    { campo: "Motivo", valor: dados.motivoAfastamento || "" },
  ]);

  const corpo = `${gerarCabecalho(companyData)}

COMUNICADO DE AFASTAMENTO

${saudacao},

Comunicamos que o colaborador abaixo identificado teve um afastamento registrado na empresa ${getCompanyDisplayName(companyData)}.
${blocoDados}
  ⚠  STATUS: AFASTADO

Providências necessárias:
  • Comunicação ao INSS (se afastamento superior a 15 dias)
  • Comunicação à seguradora sobre o afastamento
  • Atualização do controle de ponto e folha de pagamento
  • Acompanhamento do prazo de retorno
  • Agendamento de ASO de retorno (quando aplicável)

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
    default: return { titulo: `${getCompanyShortName(cd).toUpperCase()} — Movimentação — ${dados.nome}`, corpo: `Movimentação registrada para ${dados.nome}` };
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
      eq(notificationRecipients.ativo, 1),
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
