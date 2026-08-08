import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./smtpService";
import crypto from "crypto";

// ============================================================
// SEGURO DE VIDA — Alerta consolidado por e-mail (Rev. 4928)
// Envia 1 e-mail por empresa listando:
//  • Coberturas "pendente_cancelamento" (desligados ainda pagos na apólice)
//  • CLT ativos SEM cobertura de seguro de vida
// Dedup por checksum: só reenvia quando a lista muda.
// ============================================================

function getBrasiliaDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + (-3 * 60 - now.getTimezoneOffset()) * 60 * 1000);
}

function msUntilBrasiliaHour(targetHour: number): number {
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetUtcHour = (targetHour + 3) % 24;
  let diff = targetUtcHour * 60 - currentMinutes;
  if (diff <= 0) diff += 24 * 60;
  return (diff * 60 - now.getUTCSeconds()) * 1000;
}

interface LinhaPendente {
  cobId: number;
  nome: string;
  statusEmp: string | null;
  dataDeslig: string | null;
  apolice: string | null;
}
interface LinhaSemSeguro {
  employeeId: number;
  nome: string;
  admissao: string | null;
}

function fmtBR(d: string | null): string {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : s;
}

function esc(s: any): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function montarHtml(empresaNome: string, pendentes: LinhaPendente[], semSeguro: LinhaSemSeguro[]): string {
  const tabelaPend = pendentes.length === 0 ? "" : `
    <h3 style="margin:20px 0 8px;color:#c2410c;font-size:14px;">🟠 Desligados ainda na apólice — pedir exclusão ao corretor (${pendentes.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <tr style="background:#fff7ed;"><th style="text-align:left;padding:6px 8px;border:1px solid #fed7aa;">Nome</th><th style="text-align:left;padding:6px 8px;border:1px solid #fed7aa;">Desligamento</th><th style="text-align:left;padding:6px 8px;border:1px solid #fed7aa;">Apólice</th></tr>
      ${pendentes.map(p => `<tr><td style="padding:6px 8px;border:1px solid #fed7aa;">${esc(p.nome)}</td><td style="padding:6px 8px;border:1px solid #fed7aa;">${fmtBR(p.dataDeslig)}</td><td style="padding:6px 8px;border:1px solid #fed7aa;">${esc(p.apolice || "—")}</td></tr>`).join("")}
    </table>`;
  const tabelaSem = semSeguro.length === 0 ? "" : `
    <h3 style="margin:20px 0 8px;color:#b91c1c;font-size:14px;">🔴 CLT ativos SEM seguro de vida — pedir inclusão (${semSeguro.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <tr style="background:#fef2f2;"><th style="text-align:left;padding:6px 8px;border:1px solid #fecaca;">Nome</th><th style="text-align:left;padding:6px 8px;border:1px solid #fecaca;">Admissão</th></tr>
      ${semSeguro.map(p => `<tr><td style="padding:6px 8px;border:1px solid #fecaca;">${esc(p.nome)}</td><td style="padding:6px 8px;border:1px solid #fecaca;">${fmtBR(p.admissao)}</td></tr>`).join("")}
    </table>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table style="width:100%;background:#f1f5f9;padding:20px 0;"><tr><td align="center">
    <table style="width:640px;max-width:95%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="background:#0f172a;padding:18px 28px;">
        <p style="margin:0;color:#ffffff;font-size:16px;font-weight:bold;">🛡️ Seguro de Vida — Pendências</p>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${esc(empresaNome)}</p>
      </td></tr>
      <tr><td style="padding:20px 28px;">
        ${tabelaPend}
        ${tabelaSem}
        <p style="margin:24px 0 0;font-size:12px;color:#64748b;">Acesse <strong>RH/DP → Seguro de Vida</strong> para acompanhar. Filtro "Pend. Cancelamento" lista os desligados aguardando exclusão.</p>
      </td></tr>
      <tr><td style="background:#f7fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;color:#64748b;font-size:11px;">E-mail automático — não responda. ERP - Gestão Integrada</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function checksumDe(pendentes: LinhaPendente[], semSeguro: LinhaSemSeguro[]): string {
  const key = [
    ...pendentes.map(p => `P|${p.cobId}|${p.nome}|${p.dataDeslig || ""}|${p.apolice || ""}`),
    ...semSeguro.map(s => `S|${s.employeeId}|${s.nome}|${s.admissao || ""}`),
  ].sort().join(";");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export async function rodarAlertaSeguroVida(opts?: { force?: boolean }): Promise<{ empresas: number; emails: number }> {
  const db = await getDb();
  if (!db) return { empresas: 0, emails: 0 };

  const empresasRes: any = await db.execute(sql`
    SELECT c.id, COALESCE(NULLIF(c."nomeFantasia",''), c."razaoSocial") AS nome
    FROM companies c WHERE c."deletedAt" IS NULL AND c."isActive" = 1
  `);
  const empresas: any[] = empresasRes?.rows ?? [];

  let totalEmails = 0;
  let empresasComEnvio = 0;

  for (const emp of empresas) {
    try {
      const pendRes: any = await db.execute(sql`
        SELECT s.id AS cob_id, s.nome_completo, s.apolice_vg,
               e.status AS emp_status,
               COALESCE(e."dataDesligamentoEfetiva", e."dataDemissao")::text AS data_deslig
        FROM seguro_vida_coberturas s
        LEFT JOIN employees e ON e.id = s.employee_id
        WHERE s.company_id = ${emp.id} AND s.status = 'pendente_cancelamento'
        ORDER BY s.nome_completo
      `);
      const pendentes: LinhaPendente[] = (pendRes?.rows ?? []).map((r: any) => ({
        cobId: r.cob_id, nome: r.nome_completo, statusEmp: r.emp_status ?? null,
        dataDeslig: r.data_deslig ?? null, apolice: r.apolice_vg ?? null,
      }));

      const semRes: any = await db.execute(sql`
        SELECT e.id, e."nomeCompleto", e."dataAdmissao"::text AS admissao
        FROM employees e
        WHERE e."companyId" = ${emp.id}
          AND e."deletedAt" IS NULL
          AND e.status IN ('Ativo','Ferias','Afastado','Aviso','Licenca','Licença')
          AND COALESCE(e."tipoContrato",'CLT') NOT IN ('PJ','Socio')
          AND NOT EXISTS (
            SELECT 1 FROM seguro_vida_coberturas s
            WHERE s.employee_id = e.id AND s.company_id = ${emp.id} AND s.status IN ('ativo','pendente_inclusao')
          )
        ORDER BY e."nomeCompleto"
      `);
      const semSeguro: LinhaSemSeguro[] = (semRes?.rows ?? []).map((r: any) => ({
        employeeId: r.id, nome: r.nomeCompleto, admissao: r.admissao ?? null,
      }));

      if (pendentes.length === 0 && semSeguro.length === 0) continue;

      const checksum = checksumDe(pendentes, semSeguro);
      // Claim atômico ANTES do envio: só quem inseriu a linha envia (evita fan-out duplicado
      // por instâncias concorrentes; falha de SMTP após claim não gera reenvio infinito).
      if (!opts?.force) {
        const claim: any = await db.execute(sql`
          INSERT INTO seguro_vida_alertas_enviados (company_id, checksum)
          VALUES (${emp.id}, ${checksum}) ON CONFLICT DO NOTHING RETURNING id
        `);
        if ((claim?.rows ?? []).length === 0) continue;
      }

      const destRes: any = await db.execute(sql`
        SELECT email, nome FROM notification_recipients
        WHERE "companyId" = ${emp.id} AND ativo = 1
          AND "notificarSeguroVida" = 1
          AND email IS NOT NULL AND email <> ''
        LIMIT 20
      `);
      const destinatarios: any[] = destRes?.rows ?? [];
      if (destinatarios.length === 0) continue;

      const html = montarHtml(emp.nome || "Empresa", pendentes, semSeguro);
      const subject = `[Seguro de Vida] ${pendentes.length + semSeguro.length} pendência(s) — ${emp.nome || "Empresa"}`;

      let enviados = 0;
      for (const d of destinatarios) {
        try {
          const r = await sendEmail({ to: d.email, subject, html });
          if (r.success) enviados++;
          await new Promise(res => setTimeout(res, 400));
        } catch (e: any) {
          console.warn(`[SeguroVidaAlert] Falha envio para ${d.email}: ${e?.message || e}`);
        }
      }

      if (enviados > 0) {
        empresasComEnvio++;
        totalEmails += enviados;
      }
    } catch (e: any) {
      console.error(`[SeguroVidaAlert] Erro empresa ${emp.id}:`, e?.message || e);
    }
  }

  if (empresasComEnvio > 0) {
    console.log(`[SeguroVidaAlert] ${totalEmails} e-mail(s) enviados para ${empresasComEnvio} empresa(s).`);
  }
  return { empresas: empresasComEnvio, emails: totalEmails };
}

function scheduleDaily(targetHour: number) {
  const ms = msUntilBrasiliaHour(targetHour);
  setTimeout(async () => {
    try {
      await rodarAlertaSeguroVida();
    } catch (e: any) {
      console.error("[SeguroVidaAlert] Erro na verificação diária:", e?.message || e);
    }
    scheduleDaily(targetHour);
  }, ms);
}

export function startSeguroVidaAlertJobs() {
  scheduleDaily(8);
  console.log("[SeguroVidaAlert] Job de alerta de seguro de vida iniciado (08:00 Brasília).");
}
