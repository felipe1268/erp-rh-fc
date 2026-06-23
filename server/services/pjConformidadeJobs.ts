import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./smtpService";
import crypto from "crypto";

function rows(result: any): any[] {
  return (result as any).rows ?? result ?? [];
}

function getBrasiliaDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + (-3 * 60 - now.getTimezoneOffset()) * 60 * 1000);
}

function brasiliaTodayISO(): string {
  return getBrasiliaDate().toISOString().slice(0, 10);
}

function brasiliaCompetencia(): string {
  const d = getBrasiliaDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function msUntilBrasiliaHour(targetHour: number): number {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcS = now.getUTCSeconds();
  const currentMinutes = utcH * 60 + utcM;
  const targetUtcHour = (targetHour + 3) % 24;
  const targetMinutes = targetUtcHour * 60;
  let diff = targetMinutes - currentMinutes;
  if (diff <= 0) diff += 24 * 60;
  return (diff * 60 - utcS) * 1000;
}

const TIPO_LABEL: Record<string, string> = {
  das: "DAS-MEI",
  nf: "NF do mês",
  cnd: "CND CNPJ",
  seguro_vida: "Seguro de Vida",
  status_cnpj: "Status do CNPJ",
};

interface ItemAlerta {
  employeeId: number;
  nomeCompleto: string;
  cpf: string | null;
  tipo: string;
  motivo: "vencido" | "vence_em_breve" | "pendente_mes";
  dataVencimento: string | null;
  diasParaVencer: number | null;
}

async function coletarPendencias(db: any, companyId: number, mesRef: string, hoje: string): Promise<ItemAlerta[]> {
  const empsRes: any = await db.execute(sql`
    SELECT DISTINCT e.id, e."nomeCompleto", e."cpf"
    FROM employees e
    INNER JOIN pj_contracts pc ON pc."employeeId" = e.id
      AND pc."deletedAt" IS NULL
      AND pc."companyId" = ${companyId}
      AND pc."status" IN ('ativo','pendente_assinatura','suspenso')
    WHERE e."companyId" = ${companyId}
      AND e."deletedAt" IS NULL
      AND e."status" NOT IN ('Desligado','Lista_Negra','Inativo')
  `);
  const emps: any[] = empsRes?.rows ?? [];
  if (emps.length === 0) return [];
  const empIds = emps.map((e) => e.id);

  // Usa $client.query + $2::int[] porque db.execute(sql`ANY(${array}::int[])`)
  // expande o array em ($1,$2,...) — tupla, não array PG — e o cast não funciona.
  const itensRes: any = await db.$client.query(
    `SELECT * FROM pj_conformidade
     WHERE "deletedAt" IS NULL
       AND "companyId" = $1
       AND "employeeId" = ANY($2::int[])
       AND (
         ("tipo" IN ('das','nf') AND "competencia" = $3)
         OR "tipo" IN ('cnd','seguro_vida','status_cnpj')
       )`,
    [companyId, empIds, mesRef]
  );
  const itens: any[] = itensRes?.rows ?? [];

  const alertas: ItemAlerta[] = [];
  const todayDate = new Date(hoje + "T00:00:00Z");

  for (const emp of emps) {
    const itensEmp = itens.filter((i) => i.employeeId === emp.id);

    for (const tipo of ["das", "nf"] as const) {
      const it = itensEmp.find((x) => x.tipo === tipo && x.competencia === mesRef);
      if (!it || (it.status !== "ok" && it.status !== "na")) {
        alertas.push({
          employeeId: emp.id,
          nomeCompleto: emp.nomeCompleto,
          cpf: emp.cpf,
          tipo,
          motivo: "pendente_mes",
          dataVencimento: null,
          diasParaVencer: null,
        });
      }
    }

    for (const tipo of ["cnd", "seguro_vida", "status_cnpj"] as const) {
      const it = itensEmp.filter((x) => x.tipo === tipo).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
      if (!it) {
        alertas.push({
          employeeId: emp.id,
          nomeCompleto: emp.nomeCompleto,
          cpf: emp.cpf,
          tipo,
          motivo: "pendente_mes",
          dataVencimento: null,
          diasParaVencer: null,
        });
        continue;
      }
      if (it.status === "na") continue;
      if (!it.dataVencimento) {
        if (it.status !== "ok") {
          alertas.push({
            employeeId: emp.id,
            nomeCompleto: emp.nomeCompleto,
            cpf: emp.cpf,
            tipo,
            motivo: "pendente_mes",
            dataVencimento: null,
            diasParaVencer: null,
          });
        }
        continue;
      }
      const dv = new Date(String(it.dataVencimento).slice(0, 10) + "T00:00:00Z");
      const dias = Math.round((dv.getTime() - todayDate.getTime()) / 86400000);
      if (dias < 0) {
        alertas.push({
          employeeId: emp.id,
          nomeCompleto: emp.nomeCompleto,
          cpf: emp.cpf,
          tipo,
          motivo: "vencido",
          dataVencimento: String(it.dataVencimento).slice(0, 10),
          diasParaVencer: dias,
        });
      } else if (dias <= 30) {
        alertas.push({
          employeeId: emp.id,
          nomeCompleto: emp.nomeCompleto,
          cpf: emp.cpf,
          tipo,
          motivo: "vence_em_breve",
          dataVencimento: String(it.dataVencimento).slice(0, 10),
          diasParaVencer: dias,
        });
      }
    }
  }

  return alertas;
}

function montarHtml(empresaNome: string, mesRef: string, alertas: ItemAlerta[]): string {
  const vencidos = alertas.filter((a) => a.motivo === "vencido");
  const proximos = alertas.filter((a) => a.motivo === "vence_em_breve");
  const pendentes = alertas.filter((a) => a.motivo === "pendente_mes");

  function tabela(titulo: string, cor: string, lista: ItemAlerta[]) {
    if (lista.length === 0) return "";
    const linhas = lista
      .map((a) => {
        const venc = a.dataVencimento ? new Date(a.dataVencimento + "T00:00:00").toLocaleDateString("pt-BR") : "—";
        const dias = a.diasParaVencer === null
          ? (a.motivo === "pendente_mes" ? "Pendente do mês" : "—")
          : a.diasParaVencer < 0 ? `${Math.abs(a.diasParaVencer)} dia(s) atrás` : `em ${a.diasParaVencer} dia(s)`;
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${a.nomeCompleto}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:12px;">${a.cpf || "-"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${TIPO_LABEL[a.tipo] || a.tipo}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${venc}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:${cor};">${dias}</td>
        </tr>`;
      })
      .join("");
    return `
      <h3 style="color:${cor};margin:24px 0 8px;font-size:15px;">${titulo} (${lista.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;color:#475569;text-align:left;">
            <th style="padding:8px 12px;">PJ</th>
            <th style="padding:8px 12px;">CPF</th>
            <th style="padding:8px 12px;">Item</th>
            <th style="padding:8px 12px;">Vencimento</th>
            <th style="padding:8px 12px;">Quando</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>`;
  }

  const totalEmp = new Set(alertas.map((a) => a.employeeId)).size;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr><td align="center">
      <table width="700" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a365d;padding:18px 28px;text-align:center;color:#fff;">
          <h1 style="margin:0;font-size:18px;letter-spacing:.5px;">${(empresaNome || "Empresa").toUpperCase()}</h1>
          <p style="margin:4px 0 0;color:#a0c4ff;font-size:12px;">Conformidade PJ — Alerta diário</p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 12px;">Bom dia,</p>
          <p style="margin:0 0 16px;">Foram encontradas <strong>${alertas.length} pendência(s)</strong> de conformidade em <strong>${totalEmp} prestador(es) PJ</strong> no mês de <strong>${mesRef}</strong>.</p>
          ${tabela("⚠ Itens VENCIDOS — ação imediata", "#dc2626", vencidos)}
          ${tabela("⏰ Vencem nos próximos 30 dias", "#d97706", proximos)}
          ${tabela("📋 Pendências do mês corrente", "#2563eb", pendentes)}
          <p style="margin:24px 0 0;font-size:12px;color:#64748b;">Acesse <strong>Terceiros → PJ → Conformidade PJ</strong> para regularizar.</p>
        </td></tr>
        <tr><td style="background:#f7fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:11px;">E-mail automático — não responda. ERP - Gestão Integrada</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function checksumDe(alertas: ItemAlerta[]): string {
  const key = alertas
    .map((a) => `${a.employeeId}|${a.tipo}|${a.motivo}|${a.dataVencimento || ""}`)
    .sort()
    .join(";");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export async function rodarVerificacaoConformidadePJ(opts?: { force?: boolean }): Promise<{ empresas: number; emails: number; alertas: number }> {
  const db = await getDb();
  if (!db) return { empresas: 0, emails: 0, alertas: 0 };

  const hoje = brasiliaTodayISO();
  const mesRef = brasiliaCompetencia();

  const empresasRes: any = await db.execute(sql`
    SELECT DISTINCT c.id, COALESCE(c."razaoSocial", c."nomeFantasia") AS nome
    FROM companies c
    WHERE c."deletedAt" IS NULL
  `);
  const empresas: any[] = empresasRes?.rows ?? [];

  let totalEmails = 0;
  let totalAlertas = 0;
  let empresasComEnvio = 0;

  for (const emp of empresas) {
    try {
      const alertas = await coletarPendencias(db, emp.id, mesRef, hoje);
      if (alertas.length === 0) continue;

      const checksum = checksumDe(alertas);
      if (!opts?.force) {
        const dup: any = await db.execute(sql`
          SELECT 1 FROM pj_conformidade_alertas
          WHERE "companyId" = ${emp.id} AND "competencia" = ${mesRef} AND "checksum" = ${checksum}
          LIMIT 1
        `);
        if ((dup?.rows ?? []).length > 0) continue;
      }

      const destRes: any = await db.execute(sql`
        SELECT email, nome FROM notification_recipients
        WHERE "companyId" = ${emp.id}
          AND ativo = 1
          AND "notificarConformidadePJ" = 1
          AND email IS NOT NULL AND email <> ''
      `);
      const destinatarios: any[] = destRes?.rows ?? [];
      if (destinatarios.length === 0) continue;

      const html = montarHtml(emp.nome || "Empresa", mesRef, alertas);
      const subject = `[Conformidade PJ] ${alertas.length} pendência(s) — ${emp.nome || "Empresa"}`;

      let enviados = 0;
      for (const d of destinatarios) {
        try {
          const r = await sendEmail({ to: d.email, subject, html });
          if (r.success) enviados++;
          await new Promise((res) => setTimeout(res, 400));
        } catch (e: any) {
          console.warn(`[PJConformidadeJobs] Falha envio para ${d.email}: ${e?.message || e}`);
        }
      }

      if (enviados > 0) {
        empresasComEnvio++;
        totalEmails += enviados;
        totalAlertas += alertas.length;
        try {
          await db.execute(sql`
            INSERT INTO pj_conformidade_alertas ("companyId","competencia","checksum")
            VALUES (${emp.id}, ${mesRef}, ${checksum})
            ON CONFLICT DO NOTHING
          `);
        } catch (e: any) {
          console.warn(`[PJConformidadeJobs] Falha ao registrar checksum:`, e?.message);
        }
      }
    } catch (e: any) {
      console.error(`[PJConformidadeJobs] Erro empresa ${emp.id}:`, e?.message || e);
    }
  }

  if (empresasComEnvio > 0) {
    console.log(`[PJConformidadeJobs] ${totalEmails} e-mail(s) enviados para ${empresasComEnvio} empresa(s) — ${totalAlertas} alerta(s).`);
  }
  return { empresas: empresasComEnvio, emails: totalEmails, alertas: totalAlertas };
}

function scheduleDaily(targetHour: number) {
  const ms = msUntilBrasiliaHour(targetHour);
  const horas = (ms / 3600000).toFixed(1);
  console.log(`[PJConformidadeJobs] Verificação diária agendada para ${String(targetHour).padStart(2,"0")}:00 Brasília (em ${horas}h)`);
  setTimeout(async () => {
    try {
      await rodarVerificacaoConformidadePJ();
    } catch (e: any) {
      console.error("[PJConformidadeJobs] Erro na verificação diária:", e?.message || e);
    }
    scheduleDaily(targetHour);
  }, ms);
}

export function startPJConformidadeJobs() {
  scheduleDaily(8);
  console.log("[PJConformidadeJobs] Job de conformidade PJ iniciado (08:00 Brasília).");
}
