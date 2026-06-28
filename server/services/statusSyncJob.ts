/**
 * Job de Sincronização Automática de Status de Funcionários
 * 
 * Atualiza automaticamente o campo `status` dos funcionários com base em:
 * 1. Férias em gozo (vacation_periods com status 'em_gozo' e data atual dentro do período)
 * 2. Afastamento por atestado (atestados com dataRetorno >= hoje)
 * 3. Licença maternidade/paternidade (licencaMaternidade = 1 e data atual dentro do período)
 * 
 * Status manuais permitidos: Ativo, Afastado, Recluso, Desligado, Lista_Negra
 * Status automáticos: Ferias, Licenca
 * Afastado pode ser manual OU automático (não é revertido automaticamente)
 * 
 * Roda a cada 1 hora e na inicialização do servidor (com delay de 30s).
 */
import { getDb } from "../db";
import { employees, vacationPeriods, atestados, notificationLogs, notificationRecipients } from "../../drizzle/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { logStatusChange } from "../lib/employeeStatusHelper";
import { sendEmail } from "./smtpService";
import { getCompanyBranding, renderBrandedEmail } from "./emailNotification";

let statusSyncInterval: NodeJS.Timeout | null = null;

// Status que são controlados EXCLUSIVAMENTE pelo sistema (revertidos para Ativo quando não há justificativa)
const AUTO_ONLY_STATUS = ['Ferias', 'Licenca'] as const;
// Afastado pode ser definido manualmente OU automaticamente
// Se definido manualmente, NÃO é revertido para Ativo pelo job
// Status que são definidos manualmente pelo usuário (não devem ser alterados pelo job)
const MANUAL_STATUS = ['Ativo', 'Afastado', 'Recluso', 'Desligado', 'Lista_Negra'] as const;

export async function syncEmployeeStatus(): Promise<{
  updated: number;
  toFerias: number;
  toAfastado: number;
  toLicenca: number;
  toAtivo: number;
  details: Array<{ id: number; nome: string; from: string; to: string; reason: string }>;
}> {
  const db = await getDb();
  if (!db) return { updated: 0, toFerias: 0, toAfastado: 0, toLicenca: 0, toAtivo: 0, details: [] };

  const today = new Date().toISOString().split('T')[0];
  const result = {
    updated: 0,
    toFerias: 0,
    toAfastado: 0,
    toLicenca: 0,
    toAtivo: 0,
    details: [] as Array<{ id: number; nome: string; from: string; to: string; reason: string }>,
  };

  try {
    // 1. Buscar todos os funcionários não-deletados e não-desligados
    const allEmps = await db.select({
      id: employees.id,
      nomeCompleto: employees.nomeCompleto,
      status: employees.status,
      companyId: employees.companyId,
      licencaMaternidade: employees.licencaMaternidade,
      licencaDataInicio: employees.licencaDataInicio,
      licencaDataFim: employees.licencaDataFim,
    }).from(employees)
      .where(and(
        isNull(employees.deletedAt),
        sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
      ));

    if (allEmps.length === 0) return result;

    const empIds = allEmps.map(e => e.id);

    // 2. Buscar férias em gozo (status = 'em_gozo' OU agendada com data atual dentro do período)
    const feriasAtivas = await db.select({
      employeeId: vacationPeriods.employeeId,
      dataInicio: vacationPeriods.dataInicio,
      dataFim: vacationPeriods.dataFim,
      status: vacationPeriods.status,
    }).from(vacationPeriods)
      .where(and(
        inArray(vacationPeriods.employeeId, empIds),
        isNull(vacationPeriods.deletedAt),
        sql`(
          ${vacationPeriods.status} = 'em_gozo'
          OR (
            ${vacationPeriods.status} = 'agendada'
            AND ${vacationPeriods.dataInicio} IS NOT NULL
            AND ${vacationPeriods.dataFim} IS NOT NULL
            AND ${vacationPeriods.dataInicio} <= ${today}
            AND ${vacationPeriods.dataFim} >= ${today}
          )
        )`,
      ));

    const empIdsEmFerias = new Set(feriasAtivas.map(f => f.employeeId));

    const atestadosAtivos = await db.select({
      employeeId: atestados.employeeId,
      dataRetorno: atestados.dataRetorno,
      tipo: atestados.tipo,
      diasAfastamento: atestados.diasAfastamento,
      afastamentoINSS: atestados.afastamentoINSS,
    }).from(atestados)
      .where(and(
        inArray(atestados.employeeId, empIds),
        isNull(atestados.deletedAt),
        sql`${atestados.dataRetorno} > ${today}`,
        sql`${atestados.diasAfastamento} > 0`,
      ));

    const empIdsAfastados = new Set(atestadosAtivos.map(a => a.employeeId));

    const atestadosProximosRetorno = await db.select({
      id: atestados.id,
      employeeId: atestados.employeeId,
      dataRetorno: atestados.dataRetorno,
      diasAfastamento: atestados.diasAfastamento,
      companyId: atestados.companyId,
    }).from(atestados)
      .where(and(
        inArray(atestados.employeeId, empIds),
        isNull(atestados.deletedAt),
        sql`${atestados.diasAfastamento} > 0`,
        sql`${atestados.dataRetorno} IS NOT NULL`,
        sql`${atestados.dataRetorno} >= ${today}`,
        sql`${atestados.dataRetorno} <= (CURRENT_DATE + INTERVAL '3 days')`,
      ));

    const atestadosExpirados = await db.select({
      id: atestados.id,
      employeeId: atestados.employeeId,
      statusAlterado: atestados.statusAlterado,
      statusAnterior: atestados.statusAnterior,
      companyId: atestados.companyId,
    }).from(atestados)
      .where(and(
        inArray(atestados.employeeId, empIds),
        isNull(atestados.deletedAt),
        sql`${atestados.statusAlterado} = 1`,
        sql`${atestados.diasAfastamento} > 0`,
        sql`${atestados.dataRetorno} IS NOT NULL`,
        sql`${atestados.dataRetorno} <= ${today}`,
      ));

    const empIdsAtestadoExpirado = new Map<number, { statusAnterior: string | null; atestadoId: number; companyId: number }>();
    for (const at of atestadosExpirados) {
      if (!empIdsAfastados.has(at.employeeId)) {
        empIdsAtestadoExpirado.set(at.employeeId, {
          statusAnterior: at.statusAnterior,
          atestadoId: at.id,
          companyId: at.companyId,
        });
      }
      await db.update(atestados).set({ statusAlterado: 0 }).where(eq(atestados.id, at.id));
    }

    // 4. Verificar licenças ativas (licencaMaternidade = 1 e data atual dentro do período)
    const empIdsEmLicenca = new Set<number>();
    for (const emp of allEmps) {
      if (
        emp.licencaMaternidade === 1 &&
        emp.licencaDataInicio &&
        emp.licencaDataFim &&
        emp.licencaDataInicio <= today &&
        emp.licencaDataFim >= today
      ) {
        empIdsEmLicenca.add(emp.id);
      }
    }

    for (const emp of allEmps) {
      let newStatus: string | null = null;
      let reason = '';

      if (empIdsEmLicenca.has(emp.id)) {
        newStatus = 'Licenca';
        reason = `Licença ativa (${emp.licencaDataInicio} a ${emp.licencaDataFim})`;
      } else if (empIdsEmFerias.has(emp.id)) {
        newStatus = 'Ferias';
        const ferias = feriasAtivas.find(f => f.employeeId === emp.id);
        reason = `Férias em gozo (${ferias?.dataInicio} a ${ferias?.dataFim})`;
      } else if (empIdsAfastados.has(emp.id)) {
        newStatus = 'Afastado';
        const atestado = atestadosAtivos.find(a => a.employeeId === emp.id);
        reason = `Atestado ativo (retorno: ${atestado?.dataRetorno})`;
      } else if (emp.status === 'Afastado' && empIdsAtestadoExpirado.has(emp.id)) {
        const info = empIdsAtestadoExpirado.get(emp.id)!;
        newStatus = info.statusAnterior || 'Ativo';
        reason = `Atestado expirado — retorno automático para ${newStatus}`;
      } else if (AUTO_ONLY_STATUS.includes(emp.status as any)) {
        newStatus = 'Ativo';
        reason = 'Sem férias/licença ativa - retornando para Ativo';
      }

      if (newStatus && newStatus !== emp.status) {
        await db.update(employees)
          .set({ status: newStatus as any })
          .where(eq(employees.id, emp.id));

        try {
          await logStatusChange({
            db, companyId: emp.companyId, employeeId: emp.id,
            nomeCompleto: emp.nomeCompleto, statusAnterior: emp.status || 'Desconhecido',
            statusNovo: newStatus, alteradoPor: 'Sistema (Sync Automático)',
            motivo: reason || 'Sincronização automática de status',
            origemModulo: 'statusSyncJob',
          });
        } catch (e) { console.error('[statusSyncJob] Erro ao registrar log:', e); }

        result.updated++;
        result.details.push({
          id: emp.id,
          nome: emp.nomeCompleto,
          from: emp.status,
          to: newStatus,
          reason,
        });

        if (newStatus === 'Ferias') result.toFerias++;
        else if (newStatus === 'Afastado') result.toAfastado++;
        else if (newStatus === 'Licenca') result.toLicenca++;
        else if (newStatus === 'Ativo') result.toAtivo++;
      }
    }

    if (atestadosProximosRetorno.length > 0) {
      for (const at of atestadosProximosRetorno) {
        const emp = allEmps.find(e => e.id === at.employeeId);
        if (!emp) continue;

        const alreadySent = await db.select({ id: notificationLogs.id }).from(notificationLogs).where(and(
          eq(notificationLogs.companyId, at.companyId),
          eq(notificationLogs.employeeId, at.employeeId),
          eq(notificationLogs.tipoMovimentacao, "retorno_afastamento"),
          sql`${notificationLogs.enviadoEm} >= (CURRENT_DATE - INTERVAL '3 days')`,
        ));
        if (alreadySent.length > 0) continue;

        const recipients = await db.select({
          id: notificationRecipients.id,
          nome: notificationRecipients.nome,
          email: notificationRecipients.email,
        }).from(notificationRecipients).where(and(
          eq(notificationRecipients.companyId, at.companyId),
          eq(notificationRecipients.ativo, 1),
          eq(notificationRecipients.notificarAfastamento, 1),
        ));

        const diasRestantes = Math.ceil((new Date(at.dataRetorno! + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
        const dataRetornoBR = String(at.dataRetorno || "").split("-").reverse().join("/");
        const titulo = diasRestantes <= 0
          ? `RETORNO HOJE — ${emp.nomeCompleto} retorna do afastamento`
          : `RETORNO EM ${diasRestantes} DIA(S) — ${emp.nomeCompleto} retorna em ${dataRetornoBR}`;
        const corpoTxt = `Bom dia,

Comunicamos que o colaborador abaixo identificado tem retorno previsto do afastamento.

▸ DADOS DO RETORNO
┌──────────────────────────────────────────────┐
│  Colaborador: ${emp.nomeCompleto}
│  Data prevista de retorno: ${dataRetornoBR}
│  Dias restantes: ${diasRestantes}
└──────────────────────────────────────────────┘

O sistema mudará o status automaticamente para "Ativo" na data de retorno.

Providências necessárias:
  • Agendamento de ASO de retorno (quando aplicável)
  • Comunicação à seguradora sobre o retorno
  • Reativação do controle de ponto

Atenciosamente,

Comunicado automático — Sistema de Gestão de Pessoas`;
        const companyBranding = await getCompanyBranding(at.companyId);
        const corpoHtml = renderBrandedEmail(titulo, corpoTxt, companyBranding);
        for (const r of recipients) {
          let statusEnvio: "enviado" | "erro" = "erro";
          let erroMsg: string | null = "SMTP não configurado";
          try {
            const res = await sendEmail({ to: r.email, subject: titulo, html: corpoHtml, text: corpoTxt });
            if (res.success) { statusEnvio = "enviado"; erroMsg = null; }
            else { erroMsg = res.error || "Falha SMTP"; }
          } catch (e: any) {
            erroMsg = e?.message || "Erro desconhecido no envio";
            console.error("[StatusSync] Erro ao enviar e-mail de retorno:", e);
          }
          try {
            await db.insert(notificationLogs).values({
              companyId: at.companyId,
              employeeId: at.employeeId,
              employeeName: emp.nomeCompleto,
              tipoMovimentacao: "retorno_afastamento",
              statusAnterior: "Afastado",
              statusNovo: "Ativo",
              recipientId: r.id,
              recipientName: r.nome,
              recipientEmail: r.email,
              titulo,
              corpo: corpoTxt,
              statusEnvio,
              erroMensagem: erroMsg,
              disparadoPor: "Sistema (StatusSync)",
            });
          } catch (e) {
            console.error("[StatusSync] Erro ao registrar notification_log:", e);
          }
          // Delay entre envios para evitar rate-limit do SMTP
          if (recipients.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        if (recipients.length > 0) {
          console.log(`[StatusSync] Alerta retorno: ${emp.nomeCompleto} retorna em ${diasRestantes} dia(s) — ${recipients.length} alerta(s) gerado(s)`);
        }
      }
    }

    if (result.updated > 0) {
      console.log(`[StatusSync] ${result.updated} funcionário(s) atualizado(s): ${result.toFerias} → Férias, ${result.toAfastado} → Afastado, ${result.toLicenca} → Licença, ${result.toAtivo} → Ativo`);
      result.details.forEach(d => console.log(`  [StatusSync] ${d.nome}: ${d.from} → ${d.to} (${d.reason})`));
    } else {
      console.log("[StatusSync] Nenhuma atualização necessária.");
    }

    // 6. Atualizar férias concluídas: vacation_periods em_gozo cujo dataFim < hoje → concluida
    const feriasExpiradas = await db.update(vacationPeriods)
      .set({ status: 'concluida' as any })
      .where(and(
        eq(vacationPeriods.status, 'em_gozo'),
        isNull(vacationPeriods.deletedAt),
        sql`${vacationPeriods.dataFim} < ${today}`,
      ));

    return result;
  } catch (e) {
    console.error("[StatusSync] Erro ao sincronizar status:", e);
    return result;
  }
}

async function syncWithRetry(attempt = 0): Promise<void> {
  try {
    await syncEmployeeStatus();
    await processarNotificacoesPendentes();
    await verificarEnvioAutomaticoContabilidade().catch(e =>
      console.error("[ContabilAutoSend] Erro no job:", e?.message || e)
    );
  } catch (e: any) {
    if (attempt < 2) {
      // Retry silencioso após 60s (máximo 2 tentativas)
      setTimeout(() => syncWithRetry(attempt + 1), 60000);
    }
  }
}

/**
 * Reprocessa notification_logs com status "pendente" há mais de 5 minutos.
 * Tenta reenviar via SMTP; se falhar, marca como "erro" para parar de aparecer
 * eternamente como pendente no painel.
 */
export async function processarNotificacoesPendentes(): Promise<{ tentados: number; enviados: number; erros: number }> {
  const result = { tentados: 0, enviados: 0, erros: 0 };
  try {
    const db = await getDb();
    if (!db) return result;
    const pendentes = await db.execute(sql`
      SELECT id, "companyId", "recipientEmail", titulo, corpo
      FROM notification_logs
      WHERE "statusEnvio" = 'pendente'
        AND "enviadoEm" < NOW() - INTERVAL '5 minutes'
      ORDER BY "enviadoEm" ASC
      LIMIT 50
    `);
    const rows: any[] = (pendentes as any).rows || (pendentes as any) || [];
    const brandingCache = new Map<number, any>();
    for (const row of rows) {
      result.tentados++;
      // Rev. 1459: aplica template branded ao reprocessar
      let branding = brandingCache.get(row.companyId);
      if (!branding) { branding = await getCompanyBranding(row.companyId); brandingCache.set(row.companyId, branding); }
      const corpoHtml = renderBrandedEmail(String(row.titulo || ""), String(row.corpo || ""), branding);
      let statusEnvio: "enviado" | "erro" = "erro";
      let erroMsg: string | null = "Falha desconhecida";
      try {
        const res = await sendEmail({ to: row.recipientEmail, subject: row.titulo, html: corpoHtml, text: String(row.corpo || "") });
        if (res.success) { statusEnvio = "enviado"; erroMsg = null; result.enviados++; }
        else { erroMsg = res.error || "Falha SMTP"; result.erros++; }
      } catch (e: any) {
        erroMsg = e?.message || "Erro desconhecido no envio";
        result.erros++;
      }
      try {
        await db.execute(sql`
          UPDATE notification_logs
          SET "statusEnvio" = ${statusEnvio}, "erroMensagem" = ${erroMsg}
          WHERE id = ${row.id}
        `);
      } catch (e) {
        console.error("[StatusSync/Pendentes] Erro ao atualizar log:", e);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (result.tentados > 0) {
      console.log(`[StatusSync/Pendentes] Reprocessadas ${result.tentados}: ${result.enviados} enviadas, ${result.erros} erros.`);
    }
  } catch (e) {
    console.error("[StatusSync/Pendentes] Erro:", e);
  }
  return result;
}

export function startStatusSyncJob() {
  if (statusSyncInterval) clearInterval(statusSyncInterval);
  // Verificar a cada 1 hora
  statusSyncInterval = setInterval(() => syncWithRetry(), 60 * 60 * 1000);
  console.log("[StatusSync] Job de sincronização de status iniciado (verifica a cada 1h)");
  // Executar na primeira vez com delay de 2 min (aguarda ColFix e conexões estabilizarem)
  setTimeout(() => syncWithRetry(), 2 * 60 * 1000);
}

// ── Envio Automático de Contabilidade ───────────────────────────────────────
// Roda diariamente (chamado pelo syncWithRetry) — verifica se hoje é dia de prazo
// (Fiscal ou Contábil) para empresas com auto_envio=true e mês anterior pendente.
const MESES_LABEL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                     "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export async function verificarEnvioAutomaticoContabilidade(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesHoje = hoje.getMonth() + 1;
    const anoHoje = hoje.getFullYear();
    const mesAnt  = mesHoje === 1 ? 12 : mesHoje - 1;
    const anoAnt  = mesHoje === 1 ? anoHoje - 1 : anoHoje;

    // Buscar todas as empresas com auto_envio ativo
    const cfgRows = await db.$client.query(
      `SELECT company_id, dia_fiscal, dia_contabil, emails_json, ativo, auto_envio
       FROM contabilidade_alertas_config
       WHERE ativo = true AND auto_envio = true`
    );
    if (!cfgRows.rows.length) return;

    for (const cfg of cfgRows.rows) {
      const companyId  = cfg.company_id as number;
      const diaFiscal  = Number(cfg.dia_fiscal ?? 5);
      const diaContabil = Number(cfg.dia_contabil ?? 8);

      // Só procede se hoje é um dos dias de prazo
      const eDiaFiscal   = diaHoje === diaFiscal;
      const eDiaContabil = diaHoje === diaContabil;
      if (!eDiaFiscal && !eDiaContabil) continue;

      // Verifica se o mês anterior ainda está pendente
      const envQ = await db.$client.query(
        `SELECT status FROM contabilidade_envios WHERE company_id=$1 AND mes=$2 AND ano=$3`,
        [companyId, mesAnt, anoAnt]
      );
      const statusMesAnt = envQ.rows[0]?.status ?? "pendente";
      if (statusMesAnt !== "pendente") continue;

      // Verifica se já enviamos hoje para esta empresa (evitar duplo envio)
      const jaEnvQ = await db.$client.query(
        `SELECT id FROM contabilidade_email_auto_log
         WHERE company_id=$1 AND mes=$2 AND ano=$3 AND data_envio::date = CURRENT_DATE`,
        [companyId, mesAnt, anoAnt]
      ).catch(() => ({ rows: [] })); // tabela pode não existir ainda
      if (jaEnvQ.rows.length > 0) {
        console.log(`[ContabilAutoSend] Empresa ${companyId}: e-mail já enviado hoje para ${mesAnt}/${anoAnt}. Pulando.`);
        continue;
      }

      // Buscar nome da empresa
      const empQ = await db.$client.query(
        `SELECT "nomeFantasia","razaoSocial" FROM companies WHERE id=$1`, [companyId]
      );
      const empresa = empQ.rows[0]?.nomeFantasia || empQ.rows[0]?.razaoSocial || `Empresa ${companyId}`;

      // Buscar destinatários
      let emails: {nome:string; email:string}[] = [];
      try { emails = JSON.parse(cfg.emails_json ?? "[]"); } catch { emails = []; }
      const emailsValidos = emails.filter((e: any) => e?.email?.includes("@"));
      if (!emailsValidos.length) {
        console.log(`[ContabilAutoSend] Empresa ${companyId}: sem destinatários configurados. Pulando.`);
        continue;
      }

      // Gerar XLSX
      const { buildExtratoBancarioBuffer } = await import("../routers/downloadContabilidadeXlsx");
      let xlsxBuf: Buffer | null = null;
      try {
        xlsxBuf = await buildExtratoBancarioBuffer(db, companyId, mesAnt, anoAnt, empresa);
      } catch (e: any) {
        console.error(`[ContabilAutoSend] Empresa ${companyId}: erro ao gerar XLSX:`, e?.message);
      }

      const mesLabel = MESES_LABEL[mesAnt - 1];
      const tipoPrazo = eDiaFiscal && eDiaContabil
        ? "Fiscal e Contábil"
        : eDiaFiscal ? "Fiscal" : "Contábil";

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:0}
.wrap{max-width:600px;margin:32px auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.header{background:#1e3a5f;color:#fff;padding:24px 28px}
.body{padding:24px 28px}.footer{background:#f9fafb;padding:12px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style></head><body>
<div class="wrap">
  <div class="header">
    <h1 style="margin:0;font-size:18px">📊 Envio Automático — Documentos Contábeis</h1>
    <p style="margin:4px 0 0;font-size:13px;opacity:.85">${empresa} — ${mesLabel} / ${anoAnt}</p>
  </div>
  <div class="body">
    <p>Prezados,</p>
    <p>Segue em anexo o <strong>Extrato Bancário (${mesLabel}/${anoAnt})</strong> enviado automaticamente no prazo <strong>${tipoPrazo} (dia ${eDiaFiscal ? diaFiscal : diaContabil})</strong>.</p>
    <p style="font-size:12px;color:#6b7280;margin-top:24px"><em>— ERP FC Engenharia (envio automático)</em></p>
  </div>
  <div class="footer">Este e-mail foi gerado automaticamente pelo ERP FC Engenharia. Para cancelar o envio automático, acesse Configurações → Notificações Contabilidade.</div>
</div></body></html>`;

      // Enviar para todos os destinatários
      let enviados = 0;
      for (const dest of emailsValidos) {
        const r = await sendEmail({
          to: dest.email,
          subject: `[AUTOMÁTICO] Documentos Contábeis — ${empresa} — ${mesLabel}/${anoAnt}`,
          html,
          attachments: xlsxBuf ? [{
            filename: `Extrato_Bancario_${mesLabel}_${anoAnt}.xlsx`,
            content: xlsxBuf,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }] : undefined,
        });
        if (r.success) enviados++;
      }

      // Registrar no log (tabela criada sob demanda)
      try {
        await db.$client.query(`
          CREATE TABLE IF NOT EXISTS contabilidade_email_auto_log (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL,
            mes SMALLINT NOT NULL, ano SMALLINT NOT NULL,
            data_envio TIMESTAMP NOT NULL DEFAULT now(),
            enviados INTEGER NOT NULL DEFAULT 0,
            tipo_prazo TEXT
          )
        `);
        await db.$client.query(
          `INSERT INTO contabilidade_email_auto_log (company_id,mes,ano,enviados,tipo_prazo) VALUES ($1,$2,$3,$4,$5)`,
          [companyId, mesAnt, anoAnt, enviados, tipoPrazo]
        );
      } catch (e: any) {
        console.error(`[ContabilAutoSend] Erro ao registrar log:`, e?.message);
      }

      console.log(`[ContabilAutoSend] Empresa ${companyId} (${empresa}): ${enviados}/${emailsValidos.length} e-mails enviados — ${mesLabel}/${anoAnt} (prazo ${tipoPrazo}).`);
    }
  } catch (e: any) {
    console.error("[ContabilAutoSend] Erro geral:", e?.message || e);
  }
}
