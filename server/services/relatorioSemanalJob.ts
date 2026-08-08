// ============================================================
// Relatório Semanal de Pessoal — enviado toda QUINTA às 18h (Brasília)
// PDF por empresa com: entradas da semana, saídas da semana,
// desligamentos em andamento (quem tem que sair) e quadro de
// ativos separado por CLT / PJ / Sócio.
// Destinatários: notification_recipients com notificarRelatorioSemanal=1.
// ============================================================
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./smtpService";

const ATIVOS = `('Ativo','Ferias','Férias','Afastado','Aviso','Licenca','Licença')`;

function resolveLogoSource(logoUrl: string | null | undefined): string | Buffer | null {
  if (logoUrl) {
    if (logoUrl.startsWith("data:image")) {
      const m = logoUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (m?.[1]) return Buffer.from(m[1], "base64");
    } else if (logoUrl.startsWith("/uploads/")) {
      const localPath = path.join(process.cwd(), "server", logoUrl);
      if (fs.existsSync(localPath)) return localPath;
    }
  }
  const fallbacks = [
    path.join(process.cwd(), "client", "public", "logo-fc.jpg"),
    path.join(process.cwd(), "public", "logo-fc.jpg"),
  ];
  for (const p of fallbacks) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

function fmtBR(d: string | null | undefined): string {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [a, m, dd] = s.split("-");
  return a && m && dd ? `${dd}/${m}/${a}` : s;
}

interface EmpRow { nome: string; funcao: string | null; obra: string | null; data: string | null; tipo?: string | null; }

async function coletarDadosEmpresa(db: any, companyId: number) {
  const emp = (r: any): EmpRow => ({ nome: r.nome, funcao: r.funcao, obra: r.obra, data: r.data, tipo: r.tipo });
  const q = async (query: any) => (((await db.execute(query)) as any).rows || []).map(emp);

  const obraJoin = sql`LEFT JOIN LATERAL (
      SELECT o.nome FROM obra_funcionarios of2 JOIN obras o ON o.id = of2."obraId"
      WHERE of2."employeeId" = e.id AND of2."isActive" = 1 ORDER BY of2.id DESC LIMIT 1
    ) ob ON true`;

  const entradas = await q(sql`
    SELECT e."nomeCompleto" AS nome, COALESCE(e.funcao, e.cargo) AS funcao, ob.nome AS obra,
           e."dataAdmissao"::text AS data, COALESCE(e."tipoContrato",'CLT') AS tipo
    FROM employees e ${obraJoin}
    WHERE e."companyId" = ${companyId} AND e."deletedAt" IS NULL
      AND e."dataAdmissao" IS NOT NULL
      AND e."dataAdmissao"::date > CURRENT_DATE - 7 AND e."dataAdmissao"::date <= CURRENT_DATE
    ORDER BY e."dataAdmissao" DESC, e."nomeCompleto"`);

  const saidas = await q(sql`
    SELECT e."nomeCompleto" AS nome, COALESCE(e.funcao, e.cargo) AS funcao, ob.nome AS obra,
           COALESCE(e."dataDesligamentoEfetiva", e."dataDemissao")::text AS data,
           COALESCE(e."tipoContrato",'CLT') AS tipo
    FROM employees e ${obraJoin}
    WHERE e."companyId" = ${companyId} AND e."deletedAt" IS NULL
      AND e.status IN ('Desligado','Lista_Negra','Inativo')
      AND COALESCE(e."dataDesligamentoEfetiva", e."dataDemissao") IS NOT NULL
      AND COALESCE(e."dataDesligamentoEfetiva", e."dataDemissao")::date > CURRENT_DATE - 7
      AND COALESCE(e."dataDesligamentoEfetiva", e."dataDemissao")::date <= CURRENT_DATE
    ORDER BY 4 DESC, e."nomeCompleto"`);

  // "Quem tem que sair": aviso prévio em andamento (módulo) UNIÃO status 'Aviso'
  const pendentesSaida = ((((await db.execute(sql`
    SELECT e."nomeCompleto" AS nome, COALESCE(e.funcao, e.cargo) AS funcao,
           tn."dataFim"::text AS data_prevista, tn.tipo AS tipo_aviso
    FROM termination_notices tn JOIN employees e ON e.id = tn."employeeId"
    WHERE tn."companyId" = ${companyId} AND tn."deletedAt" IS NULL AND tn.status = 'em_andamento'
    UNION
    SELECT e."nomeCompleto", COALESCE(e.funcao, e.cargo), NULL, 'status Aviso'
    FROM employees e
    WHERE e."companyId" = ${companyId} AND e."deletedAt" IS NULL AND e.status = 'Aviso'
      AND NOT EXISTS (SELECT 1 FROM termination_notices t2 WHERE t2."employeeId" = e.id
                      AND t2."deletedAt" IS NULL AND t2.status = 'em_andamento')
    ORDER BY 3 NULLS LAST, 1`)) as any).rows) || []) as any[];

  const ativos = await q(sql`
    SELECT e."nomeCompleto" AS nome, COALESCE(e.funcao, e.cargo) AS funcao, ob.nome AS obra,
           e."dataAdmissao"::text AS data, COALESCE(e."tipoContrato",'CLT') AS tipo
    FROM employees e ${obraJoin}
    WHERE e."companyId" = ${companyId} AND e."deletedAt" IS NULL
      AND e.status IN ${sql.raw(ATIVOS)}
    ORDER BY e."nomeCompleto"`);

  return { entradas, saidas, pendentesSaida, ativos };
}

function gerarPdfEmpresa(company: any, dados: Awaited<ReturnType<typeof coletarDadosEmpresa>>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 46, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const mL = 40, pageW = doc.page.width, mR = 40;
    const dark = "#0F172A", mid = "#64748B", accent = "#EA580C", border = "#E2E8F0";
    const hoje = new Date(Date.now() - 3 * 3600 * 1000); // Brasília
    const hojeStr = hoje.toISOString().slice(0, 10);

    // Cabeçalho
    let y = 36;
    const logoSrc = resolveLogoSource(company.logoUrl);
    const headerX = logoSrc ? mL + 66 : mL;
    if (logoSrc) { try { doc.image(logoSrc, mL, y, { fit: [54, 54] }); } catch {} }
    doc.font("Helvetica-Bold").fontSize(14).fillColor(dark)
      .text((company.nomeFantasia || company.razaoSocial || "").toUpperCase(), headerX, y, { width: pageW - mR - headerX });
    doc.font("Helvetica").fontSize(8.5).fillColor(mid)
      .text(company.cnpj ? `CNPJ ${company.cnpj}` : "", headerX, doc.y + 2);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(accent)
      .text("RELATÓRIO SEMANAL DE PESSOAL", headerX, doc.y + 6);
    doc.font("Helvetica").fontSize(8.5).fillColor(mid)
      .text(`Semana de ${fmtBR(new Date(hoje.getTime() - 6 * 86400000).toISOString().slice(0, 10))} a ${fmtBR(hojeStr)} · gerado automaticamente`, headerX, doc.y + 2);
    y = Math.max(doc.y, y + 58) + 10;
    doc.moveTo(mL, y).lineTo(pageW - mR, y).lineWidth(0.8).strokeColor(border).stroke();
    y += 12;
    doc.y = y;

    const section = (titulo: string, cor: string) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(cor).text(titulo, mL, doc.y);
      doc.moveTo(mL, doc.y + 2).lineTo(pageW - mR, doc.y + 2).lineWidth(0.5).strokeColor(border).stroke();
      doc.moveDown(0.4);
    };
    const linha = (cols: string[], widths: number[], bold = false, cor = dark) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y0 = doc.y;
      let x = mL;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(cor);
      cols.forEach((c, i) => { doc.text(c || "—", x, y0, { width: widths[i] - 6, lineBreak: false, ellipsis: true }); x += widths[i]; });
      doc.y = y0 + 13;
    };
    const vazio = (msg: string) => { doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(mid).text(msg, mL, doc.y); doc.moveDown(0.3); };
    const wPad = pageW - mL - mR;

    // 1. Entradas
    section(`1. QUEM ENTROU NA SEMANA (${dados.entradas.length})`, "#15803D");
    if (!dados.entradas.length) vazio("Nenhuma contratação nos últimos 7 dias.");
    else {
      linha(["Nome", "Função", "Obra", "Admissão", "Vínculo"], [wPad * 0.34, wPad * 0.24, wPad * 0.22, wPad * 0.11, wPad * 0.09], true, mid);
      dados.entradas.forEach(r => linha([r.nome, r.funcao || "", r.obra || "", fmtBR(r.data), r.tipo || "CLT"], [wPad * 0.34, wPad * 0.24, wPad * 0.22, wPad * 0.11, wPad * 0.09]));
    }

    // 2. Saídas
    section(`2. QUEM SAIU NA SEMANA (${dados.saidas.length})`, "#B91C1C");
    if (!dados.saidas.length) vazio("Nenhum desligamento nos últimos 7 dias.");
    else {
      linha(["Nome", "Função", "Obra", "Desligamento", "Vínculo"], [wPad * 0.34, wPad * 0.24, wPad * 0.22, wPad * 0.11, wPad * 0.09], true, mid);
      dados.saidas.forEach(r => linha([r.nome, r.funcao || "", r.obra || "", fmtBR(r.data), r.tipo || "CLT"], [wPad * 0.34, wPad * 0.24, wPad * 0.22, wPad * 0.11, wPad * 0.09]));
    }

    // 3. Quem tem que sair
    section(`3. DESLIGAMENTOS EM ANDAMENTO — QUEM TEM QUE SAIR (${dados.pendentesSaida.length})`, "#B45309");
    if (!dados.pendentesSaida.length) vazio("Nenhum aviso prévio em andamento.");
    else {
      linha(["Nome", "Função", "Tipo de aviso", "Saída prevista"], [wPad * 0.38, wPad * 0.26, wPad * 0.2, wPad * 0.16], true, mid);
      dados.pendentesSaida.forEach((r: any) => linha([r.nome, r.funcao || "", String(r.tipo_aviso || "").replace(/_/g, " "), fmtBR(r.data_prevista)], [wPad * 0.38, wPad * 0.26, wPad * 0.2, wPad * 0.16]));
    }

    // 4. Quadro de ativos por vínculo
    const grupos: [string, string, (t: string) => boolean][] = [
      ["CLT", "#1D4ED8", t => t !== "PJ" && t !== "Socio"],
      ["PJ", "#7C3AED", t => t === "PJ"],
      ["SÓCIOS", "#0F766E", t => t === "Socio"],
    ];
    for (const [label, cor, pred] of grupos) {
      const lista = dados.ativos.filter(r => pred(r.tipo || "CLT"));
      section(`QUADRO ATUAL — ${label} (${lista.length})`, cor);
      if (!lista.length) { vazio("Nenhum colaborador neste grupo."); continue; }
      linha(["Nome", "Função", "Obra", "Admissão"], [wPad * 0.36, wPad * 0.26, wPad * 0.24, wPad * 0.14], true, mid);
      lista.forEach(r => linha([r.nome, r.funcao || "", r.obra || "", fmtBR(r.data)], [wPad * 0.36, wPad * 0.26, wPad * 0.24, wPad * 0.14]));
    }

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(7.5).fillColor(mid)
      .text("Documento gerado automaticamente pelo ERP Gestão Integrada. Confira as movimentações e comunique o RH em caso de divergência.", mL, doc.y, { width: wPad });

    doc.end();
  });
}

export async function enviarRelatorioSemanal(opts?: { force?: boolean; dryRunDir?: string }): Promise<{ enviados: number; empresas: number; motivo?: string }> {
  const db = await getDb();
  if (!db) return { enviados: 0, empresas: 0, motivo: "sem banco" };

  // Dedup semanal (claim atômico ANTES do envio — evita duplicidade entre instâncias)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS relatorio_semanal_envios (
    id SERIAL PRIMARY KEY, semana_ref VARCHAR(10) NOT NULL UNIQUE, criado_em TIMESTAMP NOT NULL DEFAULT NOW())`);
  const agoraBr = new Date(Date.now() - 3 * 3600 * 1000);
  const semanaRef = agoraBr.toISOString().slice(0, 10);
  // Chave de claim = SEMANA ISO (não a data) — evita reenvio na mesma semana
  // mesmo que uma recuperação manual rode em outro dia.
  const isoWeek = (() => {
    const d = new Date(Date.UTC(agoraBr.getUTCFullYear(), agoraBr.getUTCMonth(), agoraBr.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((d.getTime() - yStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
  })();
  if (!opts?.force && !opts?.dryRunDir) {
    const claim: any = await db.execute(sql`
      INSERT INTO relatorio_semanal_envios (semana_ref) VALUES (${isoWeek}) ON CONFLICT DO NOTHING RETURNING id`);
    if (((claim?.rows) || []).length === 0) return { enviados: 0, empresas: 0, motivo: "já enviado nesta semana" };
  }

  // Destinatários flagados COM a empresa de origem (escopo de tenancy)
  const destRes: any = await db.execute(sql`
    SELECT nr.email, nr.nome, nr."companyId" FROM notification_recipients nr
    WHERE nr.ativo = 1 AND nr."notificarRelatorioSemanal" = 1 AND nr.email IS NOT NULL AND nr.email <> ''
    ORDER BY nr.id LIMIT 60`);
  const destinatarios: any[] = destRes?.rows || [];
  if (!destinatarios.length) {
    if (!opts?.force && !opts?.dryRunDir) await db.execute(sql`DELETE FROM relatorio_semanal_envios WHERE semana_ref = ${isoWeek}`);
    return { enviados: 0, empresas: 0, motivo: "nenhum destinatário com Relatório Semanal ativo" };
  }

  // Empresas com funcionários. Tenancy: cada e-mail só recebe o PDF das empresas
  // onde ele está EXPLICITAMENTE cadastrado como destinatário com a flag de
  // Relatório Semanal — opt-in por empresa, nunca dados de outros tenants.
  const empRes: any = await db.execute(sql`
    SELECT c.id, c."razaoSocial", c."nomeFantasia", c.cnpj, c."logoUrl"
    FROM companies c WHERE c.id <> 999 /* EMPRESA TESTE */ AND c."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM employees e WHERE e."companyId" = c.id AND e."deletedAt" IS NULL)
    ORDER BY c.id`);
  const empresas: any[] = empRes?.rows || [];
  const empById = new Map<number, any>(empresas.map((c: any) => [c.id, c]));

  // Gera cada PDF UMA vez (lazy, só para empresas realmente necessárias)
  const pdfCache = new Map<number, { att: { filename: string; content: Buffer; contentType: string }; resumo: string } | null>();
  const gerarParaEmpresa = async (cid: number) => {
    if (pdfCache.has(cid)) return pdfCache.get(cid)!;
    const c = empById.get(cid);
    let out: { att: any; resumo: string } | null = null;
    try {
      const dados = await coletarDadosEmpresa(db, c.id);
      const buf = await gerarPdfEmpresa(c, dados);
      const nomeArq = (c.nomeFantasia || c.razaoSocial || `empresa_${c.id}`).replace(/[^\w\d]+/g, "_").slice(0, 40);
      out = {
        att: { filename: `Relatorio_Semanal_${nomeArq}_${semanaRef}.pdf`, content: buf, contentType: "application/pdf" },
        resumo: `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${c.nomeFantasia || c.razaoSocial}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:#15803d"><b>${dados.entradas.length}</b></td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:#b91c1c"><b>${dados.saidas.length}</b></td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:#b45309"><b>${dados.pendentesSaida.length}</b></td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center"><b>${dados.ativos.length}</b></td></tr>`,
      };
    } catch (e: any) {
      console.error(`[RelatorioSemanal] Erro empresa ${cid}:`, e?.message || e);
    }
    pdfCache.set(cid, out);
    return out;
  };

  if (opts?.dryRunDir) {
    fs.mkdirSync(opts.dryRunDir, { recursive: true });
    let n = 0;
    for (const c of empresas) { const g = await gerarParaEmpresa(c.id); if (g) { fs.writeFileSync(path.join(opts.dryRunDir, g.att.filename), g.att.content); n++; } }
    return { enviados: 0, empresas: n, motivo: `dry-run: PDFs em ${opts.dryRunDir}` };
  }

  // Um e-mail por destinatário: união das empresas onde ele tem a flag ativa
  const porEmailEscopo = new Map<string, { nome: string; email: string; companyIds: number[] }>();
  for (const d of destinatarios) {
    const cid = Number(d.companyId);
    if (!empById.has(cid)) continue;
    const key = String(d.email).toLowerCase();
    const ex = porEmailEscopo.get(key);
    if (ex) { if (!ex.companyIds.includes(cid)) ex.companyIds.push(cid); }
    else porEmailEscopo.set(key, { nome: d.nome, email: d.email, companyIds: [cid] });
  }

  let enviados = 0;
  const empresasEnviadas = new Set<number>();
  for (const d of porEmailEscopo.values()) {
    const attachments: any[] = [];
    const resumoLinhas: string[] = [];
    for (const cid of d.companyIds) {
      const g = await gerarParaEmpresa(cid);
      if (g) { attachments.push(g.att); resumoLinhas.push(g.resumo); empresasEnviadas.add(cid); }
    }
    if (!attachments.length) continue;
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
      <div style="background:#0F172A;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:17px">📋 Relatório Semanal de Pessoal</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:.8">Semana encerrada em ${fmtBR(semanaRef)} — um PDF por empresa em anexo</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:18px 22px;border-radius:0 0 8px 8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#f8fafc"><th style="padding:6px 10px;text-align:left">Empresa</th><th style="padding:6px 10px">Entraram</th><th style="padding:6px 10px">Saíram</th><th style="padding:6px 10px">Têm que sair</th><th style="padding:6px 10px">Ativos</th></tr>
          ${resumoLinhas.join("")}
        </table>
        <p style="font-size:11px;color:#94a3b8;margin-top:16px">E-mail automático — toda quinta-feira às 18h. Para deixar de receber, peça ao RH para desmarcar "Relatório Semanal" em Configurações → Notificações E-mail.</p>
      </div></div>`;
    try {
      const r = await sendEmail({
        to: d.email,
        subject: `[Relatório Semanal] Pessoal — semana de ${fmtBR(semanaRef)}`,
        html,
        attachments,
      });
      if (r.success) enviados++;
      else console.warn(`[RelatorioSemanal] Falha envio para ${d.email}: ${(r as any).error || "?"}`);
      await new Promise(res => setTimeout(res, 500));
    } catch (e: any) {
      console.warn(`[RelatorioSemanal] Erro envio para ${d.email}: ${e?.message || e}`);
    }
  }
  console.log(`[RelatorioSemanal] ${enviados} e-mail(s) enviados cobrindo ${empresasEnviadas.size} empresa(s).`);
  return { enviados, empresas: empresasEnviadas.size };
}

// Quinta-feira = 4 (0=domingo). 18:00 Brasília = 21:00 UTC.
function msUntilBrasiliaThursday18(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(21, 0, 0, 0);
  let addDays = (4 - now.getUTCDay() + 7) % 7;
  if (addDays === 0 && target.getTime() <= now.getTime()) addDays = 7;
  target.setUTCDate(target.getUTCDate() + addDays);
  return target.getTime() - now.getTime();
}

function scheduleWeekly() {
  const ms = msUntilBrasiliaThursday18();
  setTimeout(async () => {
    try { await enviarRelatorioSemanal(); }
    catch (e: any) { console.error("[RelatorioSemanal] Erro no envio semanal:", e?.message || e); }
    scheduleWeekly();
  }, ms);
}

export function startRelatorioSemanalJob() {
  scheduleWeekly();
  console.log("[RelatorioSemanal] Job semanal iniciado (quinta 18:00 Brasília).");
}
