import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./smtpService";

// ============================================================
// ENCARGOS IMOBILIÁRIOS — Alerta antecipado por e-mail (Rev. 5145)
// Job diário (09:00 Brasília) que varre imovel_pagamentos com
// vencimento nos próximos 30 dias e data_pagamento IS NULL.
// Dedup: coluna notificado_em — cada encargo só notifica 1x
// (ou quando notificado_em < CURRENT_DATE - 6 dias, para
// capturar novos encargos adicionados depois da última rodada).
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

interface Encargo {
  id: number;
  imovelId: number;
  imovelEndereco: string | null;
  tipo: string;
  descricao: string | null;
  valor: string | null;
  dataVencimento: string;
  diasRestantes: number;
}

function tipoLabel(tipo: string): string {
  const map: Record<string, string> = {
    iptu: "IPTU",
    laudemio: "Laudêmio",
    itbi: "ITBI",
    condominio: "Condomínio",
    outro: "Outro",
  };
  return map[tipo] ?? tipo.toUpperCase();
}

function fmtBR(d: string | null): string {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : s;
}

function fmtMoeda(v: string | null): string {
  if (!v) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function esc(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urgenciaCor(dias: number): string {
  if (dias <= 7) return "#b91c1c"; // vermelho
  if (dias <= 15) return "#b45309"; // âmbar
  return "#1d4ed8"; // azul
}

function urgenciaLabel(dias: number): string {
  if (dias <= 7) return "🔴";
  if (dias <= 15) return "🟡";
  return "🔵";
}

function montarHtml(empresaNome: string, encargos: Encargo[]): string {
  const linhas = encargos
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .map(e => {
      const cor = urgenciaCor(e.diasRestantes);
      const icone = urgenciaLabel(e.diasRestantes);
      const descricao = e.descricao ? esc(e.descricao) : "";
      const imovel = e.imovelEndereco ? esc(e.imovelEndereco) : `Imóvel #${e.imovelId}`;
      const diasText = e.diasRestantes === 0 ? "hoje" : `${e.diasRestantes} dia(s)`;
      return `
        <tr>
          <td style="padding:8px 10px;border:1px solid #e2e8f0;">${icone} ${esc(tipoLabel(e.tipo))}${descricao ? ` — ${descricao}` : ""}</td>
          <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:12px;color:#475569;">${imovel}</td>
          <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;">${fmtMoeda(e.valor)}</td>
          <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;">${fmtBR(e.dataVencimento)}</td>
          <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;color:${cor};font-weight:600;">${diasText}</td>
        </tr>`;
    })
    .join("");

  const hoje = getBrasiliaDate();
  const dataHoje = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table style="width:100%;background:#f1f5f9;padding:20px 0;"><tr><td align="center">
    <table style="width:680px;max-width:95%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="background:#0f172a;padding:18px 28px;">
        <p style="margin:0;color:#ffffff;font-size:16px;font-weight:bold;">🏛️ Encargos Imobiliários — Vencimentos nos próximos 30 dias</p>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${esc(empresaNome)} · ${dataHoje}</p>
      </td></tr>
      <tr><td style="padding:20px 28px;">
        <p style="margin:0 0 16px;font-size:13px;color:#374151;">Os encargos abaixo estão pendentes de pagamento e vencem em até <strong>30 dias</strong>:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#eff6ff;">
            <th style="text-align:left;padding:8px 10px;border:1px solid #e2e8f0;">Tipo / Descrição</th>
            <th style="text-align:left;padding:8px 10px;border:1px solid #e2e8f0;">Imóvel</th>
            <th style="text-align:right;padding:8px 10px;border:1px solid #e2e8f0;">Valor</th>
            <th style="text-align:center;padding:8px 10px;border:1px solid #e2e8f0;">Vencimento</th>
            <th style="text-align:center;padding:8px 10px;border:1px solid #e2e8f0;">Prazo</th>
          </tr>
          ${linhas}
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#64748b;">
          🔴 = vence em até 7 dias &nbsp;|&nbsp; 🟡 = até 15 dias &nbsp;|&nbsp; 🔵 = até 30 dias<br>
          Acesse <strong>Patrimônio → Encargos</strong> para registrar o pagamento.
        </p>
      </td></tr>
      <tr><td style="background:#f7fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;color:#64748b;font-size:11px;">E-mail automático — não responda. ERP - Gestão Integrada</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function rodarAlertaEncargos(opts?: { force?: boolean }): Promise<{ empresas: number; emails: number }> {
  const db = await getDb();
  if (!db) return { empresas: 0, emails: 0 };

  // Busca todos os encargos pendentes vencendo em até 30 dias, ainda não notificados
  // (ou notificados há mais de 6 dias, para re-alertar em encargos persistentes)
  const encargosRes: any = await db.execute(sql`
    SELECT
      ip.id,
      ip.imovel_id,
      ip.company_id,
      ip.tipo,
      ip.descricao,
      ip.valor::text,
      ip.data_vencimento::text AS data_vencimento,
      (ip.data_vencimento - CURRENT_DATE)::integer AS dias_restantes,
      COALESCE(
        NULLIF(CONCAT_WS(', ', NULLIF(im.logradouro,''), NULLIF(im.numero,'')), ''),
        NULLIF(im.nome, '')
      ) AS imovel_endereco
    FROM imovel_pagamentos ip
    LEFT JOIN imoveis im ON im.id = ip.imovel_id
    WHERE ip.deleted_at IS NULL
      AND ip.data_pagamento IS NULL
      AND ip.data_vencimento >= CURRENT_DATE
      AND ip.data_vencimento <= CURRENT_DATE + INTERVAL '30 days'
      AND (
        ip.notificado_em IS NULL
        OR (${opts?.force ? sql`true` : sql`ip.notificado_em < CURRENT_DATE - INTERVAL '6 days'`})
      )
    ORDER BY ip.company_id, ip.data_vencimento
  `);

  const encargosRows: any[] = encargosRes?.rows ?? [];
  if (encargosRows.length === 0) return { empresas: 0, emails: 0 };

  // Agrupar por empresa
  const porEmpresa = new Map<number, Encargo[]>();
  for (const r of encargosRows) {
    const compId = Number(r.company_id);
    if (!porEmpresa.has(compId)) porEmpresa.set(compId, []);
    porEmpresa.get(compId)!.push({
      id: Number(r.id),
      imovelId: Number(r.imovel_id),
      imovelEndereco: r.imovel_endereco ?? null,
      tipo: r.tipo ?? "outro",
      descricao: r.descricao ?? null,
      valor: r.valor ?? null,
      dataVencimento: String(r.data_vencimento).slice(0, 10),
      diasRestantes: Number(r.dias_restantes ?? 0),
    });
  }

  let totalEmails = 0;
  let empresasComEnvio = 0;

  for (const [companyId, encargos] of porEmpresa.entries()) {
    try {
      // Buscar nome da empresa
      const empRes: any = await db.execute(sql`
        SELECT COALESCE(NULLIF("nomeFantasia",''), "razaoSocial") AS nome
        FROM companies WHERE id = ${companyId} AND "deletedAt" IS NULL
      `);
      const empresaNome: string = empRes?.rows?.[0]?.nome ?? "Empresa";

      // Buscar admin_master da empresa
      const destRes: any = await db.execute(sql`
        SELECT u.email, u.name AS nome
        FROM users u
        INNER JOIN user_companies uc ON uc."userId" = u.id AND uc."companyId" = ${companyId}
        WHERE u.role = 'admin_master'
          AND u.email IS NOT NULL AND u.email <> ''
          AND u."deletedAt" IS NULL
        LIMIT 10
      `);
      const destinatarios: { email: string; nome: string }[] = destRes?.rows ?? [];
      if (destinatarios.length === 0) continue;

      const html = montarHtml(empresaNome, encargos);
      const qtd = encargos.length;
      const subject = `[Patrimônio] ${qtd} encargo(s) vencem em até 30 dias — ${empresaNome}`;

      let enviados = 0;
      for (const d of destinatarios) {
        try {
          const r = await sendEmail({ to: d.email, subject, html });
          if (r.success) enviados++;
          await new Promise(res => setTimeout(res, 400));
        } catch (e: any) {
          console.warn(`[EncargosAlerta] Falha envio para ${d.email}: ${e?.message || e}`);
        }
      }

      if (enviados > 0) {
        empresasComEnvio++;
        totalEmails += enviados;

        // Marcar encargos como notificados.
        // Usa $client.query + $1::int[] porque db.execute(sql`ANY(${array}::int[])`)
        // expande o array em ($1,$2,...) — tupla, não array PG — e o cast falha.
        const ids = encargos.map(e => e.id);
        await db.$client.query(
          `UPDATE imovel_pagamentos SET notificado_em = CURRENT_DATE WHERE id = ANY($1::int[])`,
          [ids]
        );
      }
    } catch (e: any) {
      console.error(`[EncargosAlerta] Erro empresa ${companyId}:`, e?.message || e);
    }
  }

  if (totalEmails > 0) {
    console.log(`[EncargosAlerta] ${totalEmails} e-mail(s) enviados para ${empresasComEnvio} empresa(s).`);
  }
  return { empresas: empresasComEnvio, emails: totalEmails };
}

function scheduleDaily(targetHour: number): void {
  const ms = msUntilBrasiliaHour(targetHour);
  setTimeout(async () => {
    try {
      await rodarAlertaEncargos();
    } catch (e: any) {
      console.error("[EncargosAlerta] Erro na verificação diária:", e?.message || e);
    }
    scheduleDaily(targetHour);
  }, ms);
}

export function startEncargosAlertaJob(): void {
  scheduleDaily(9); // 09:00 Brasília
  console.log("[EncargosAlerta] Job de alerta de encargos iniciado (09:00 Brasília).");
}
