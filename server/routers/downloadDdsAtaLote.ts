import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { PassThrough } from "stream";
import archiver from "archiver";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import {
  companies,
  userCompanies,
  ddsSessoes,
  ddsSessaoFuncionarios,
  ddsParticipacoesTerceiros,
  funcionariosTerceiros,
  employees,
} from "../../drizzle/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return "";
  const s = val instanceof Date ? val.toISOString() : String(val);
  const d = s.slice(0, 10);
  if (d.length < 10) return s;
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function getWeekOfYear(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - startOfYear.getTime();
  return Math.ceil(((diff / 86400000) + startOfYear.getDay() + 1) / 7);
}

function safeFileName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function toBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    if (url.startsWith("/uploads/") || url.startsWith("/api/upload")) {
      const localPath = path.join(process.cwd(), "server", url.split("?")[0]);
      if (fs.existsSync(localPath)) {
        const buf = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase().replace(".", "");
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
          : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = Buffer.from(await resp.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch { return null; }
}

async function buildSessionHtml(
  s: any, funcs: any[], terceiros: any[], company: any, logoB64: string | null
): Promise<string> {
  const nomeEmpresa = company?.nomeFantasia || company?.razaoSocial || "FC Engenharia";
  const cnpj = company?.cnpj || "";
  const dataEmissao = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  const [, ...imgResults] = await Promise.all([
    Promise.resolve(null),
    ...funcs.map((f) => toBase64(f.fotoUrl)),
    ...terceiros.map((t) => toBase64(t.fotoUrl)),
  ]);
  const funcFotos = imgResults.slice(0, funcs.length);
  const tercFotos = imgResults.slice(funcs.length);

  interface P {
    nome: string; cpf: string|null; funcao: string|null; presente: boolean|null;
    assinadoEm: string|null; assinaturaImg: string|null; fotoB64: string|null; terceiro: boolean;
  }
  const participants: P[] = [
    ...funcs.map((f, i) => ({
      nome: f.nome ?? "", cpf: f.cpf, funcao: f.funcao,
      presente: f.presente as boolean|null, assinadoEm: f.assinadoEm,
      assinaturaImg: f.assinaturaImg, fotoB64: funcFotos[i] ?? null, terceiro: false,
    })),
    ...terceiros.map((t, i) => ({
      nome: t.nome ?? "", cpf: t.cpf, funcao: t.funcao,
      presente: true, assinadoEm: null, assinaturaImg: null,
      fotoB64: tercFotos[i] ?? null, terceiro: true,
    })),
  ];

  const totalPresentes = participants.filter((p) => p.presente).length;
  const totalAssinados = participants.filter((p) => !!p.assinaturaImg).length;

  const fotoCell = (p: P) => {
    if (p.fotoB64) {
      return `<img src="${p.fotoB64}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid ${p.terceiro?"#f59e0b":"#3b82f6"};display:block;">`;
    }
    const bg = p.terceiro ? "#f59e0b" : "#1e3a5f";
    return `<div style="width:44px;height:44px;border-radius:50%;background:${bg};color:#fff;font-weight:800;font-size:14px;line-height:44px;text-align:center;">${esc(initials(p.nome) || "?")}</div>`;
  };

  const assCell = (p: P) => {
    if (p.assinaturaImg) {
      return `<div style="text-align:center;"><img src="${p.assinaturaImg}" style="max-height:38px;max-width:110px;object-fit:contain;display:block;margin:0 auto;"><div style="font-size:9px;color:#64748b;margin-top:2px;">${esc(fmtDate(p.assinadoEm))}</div></div>`;
    }
    if (p.terceiro) return `<span style="color:#94a3b8;font-size:10px;">—</span>`;
    return `<span style="color:#cbd5e1;font-size:10px;font-style:italic;">Não assinou</span>`;
  };

  const rows = participants.map((p, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    const presStyle = p.presente ? "background:#dcfce7;color:#166534;" : "background:#fee2e2;color:#991b1b;";
    return `<tr style="background:${bg};page-break-inside:avoid;">
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;width:56px;vertical-align:middle;">${fotoCell(p)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:middle;">
  <div style="font-weight:700;color:#0f172a;font-size:11.5px;">${esc(p.nome)}${p.terceiro?`<span style="background:#fef3c7;color:#92400e;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700;margin-left:4px;">Terc.</span>`:""}</div>
</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px;color:#475569;white-space:nowrap;vertical-align:middle;">${esc(p.cpf)||"—"}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px;color:#475569;vertical-align:middle;">${esc(p.funcao)||"—"}</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle;">
  <span style="${presStyle}font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:700;display:inline-block;">${p.presente?"Sim":"Não"}</span>
</td>
<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle;min-width:130px;">${assCell(p)}</td>
</tr>`;
  }).join("");

  const roteiroHtml = (s.conteudoMd ?? "").trim().length >= 10
    ? `<div style="margin:16px 0;padding:14px 18px;background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 8px 8px 0;">
        <div style="font-size:10px;font-weight:800;color:#0369a1;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Roteiro / Conteúdo</div>
        <div style="font-size:11px;color:#1e293b;white-space:pre-wrap;line-height:1.65;">${esc(s.conteudoMd)}</div>
       </div>` : "";

  const logoHtml = logoB64
    ? `<img src="${logoB64}" alt="logo" style="max-height:52px;max-width:150px;object-fit:contain;display:block;">`
    : `<div style="font-size:17px;font-weight:900;color:#fff;">${esc(nomeEmpresa)}</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>DDS #${s.id}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4 portrait;margin:10mm 12mm 12mm 12mm;}
@media print{.no-print{display:none!important;}img{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div style="max-width:800px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f2744 100%);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div style="flex-shrink:0;">${logoHtml}</div>
    <div style="flex:1;text-align:center;">
      <div style="color:#fff;font-size:17px;font-weight:900;letter-spacing:.04em;">ATA DE DDS</div>
      <div style="color:#93c5fd;font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-top:3px;">Diálogo Diário de Segurança</div>
    </div>
    <div style="text-align:right;flex-shrink:0;color:#cbd5e1;font-size:9.5px;line-height:1.7;">
      ${cnpj?`<div>CNPJ: ${esc(cnpj)}</div>`:""}
      <div>Emitido em ${esc(dataEmissao)}</div>
      <div style="color:#7dd3fc;font-weight:600;">Sessão #${s.id}</div>
    </div>
  </div>
  <div style="background:#f8fafc;border-bottom:3px solid #e2e8f0;padding:14px 24px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;">
      <div><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Tema</div>
        <div style="font-size:13px;font-weight:800;color:#0f172a;margin-top:2px;">${esc(s.tituloTema)||"—"}</div></div>
      <div><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Data / Hora</div>
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:2px;">${esc(fmtDate(s.data))}${s.hora?" · "+esc(s.hora):""}</div></div>
      ${s.obraNome?`<div><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;">Obra</div><div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.obraNome)}</div></div>`:""}
      ${s.instrutor?`<div><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;">Instrutor</div><div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.instrutor)}</div></div>`:""}
      ${s.local?`<div><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;">Local</div><div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.local)}</div></div>`:""}
      ${s.categoria?`<div><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;">Categoria</div><div style="font-size:12px;color:#334155;margin-top:2px;">${esc(s.categoria)}</div></div>`:""}
    </div>
    ${s.observacoes?`<div style="margin-top:10px;padding:8px 12px;background:#fefce8;border-radius:6px;border-left:3px solid #eab308;font-size:10.5px;color:#78350f;"><strong>Obs:</strong> ${esc(s.observacoes)}</div>`:""}
  </div>
  ${roteiroHtml?`<div style="padding:0 24px;">${roteiroHtml}</div>`:""}
  <div style="padding:16px 24px 24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;">
      <div style="font-size:11px;font-weight:800;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em;border-left:4px solid #1e3a5f;padding-left:10px;">Lista de Presença</div>
      <div style="display:flex;gap:8px;">
        <span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;">${participants.length} colaboradores</span>
        <span style="background:#f0fdf4;color:#15803d;font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;">${totalPresentes} presentes</span>
        <span style="background:#faf5ff;color:#7e22ce;font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;">${totalAssinados} assinaturas</span>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#1e3a5f;">
        <th style="padding:8px 10px;color:#e2e8f0;font-size:9.5px;text-transform:uppercase;text-align:center;width:56px;">Foto</th>
        <th style="padding:8px 10px;color:#e2e8f0;font-size:9.5px;text-transform:uppercase;text-align:left;">Nome</th>
        <th style="padding:8px 10px;color:#e2e8f0;font-size:9.5px;text-transform:uppercase;text-align:left;">CPF</th>
        <th style="padding:8px 10px;color:#e2e8f0;font-size:9.5px;text-transform:uppercase;text-align:left;">Função</th>
        <th style="padding:8px 10px;color:#e2e8f0;font-size:9.5px;text-transform:uppercase;text-align:center;width:60px;">Presente</th>
        <th style="padding:8px 10px;color:#e2e8f0;font-size:9.5px;text-transform:uppercase;text-align:center;min-width:130px;">Assinatura</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="background:#f8fafc;border-top:2px solid #e2e8f0;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:10px;color:#64748b;font-weight:600;">${esc(nomeEmpresa)}</div>
    <div style="font-size:9.5px;color:#94a3b8;">DDS #${s.id} · ${esc(dataEmissao)}</div>
  </div>
</div>
</body></html>`;
}

export function registerDdsAtaLoteRoute(app: Express) {
  app.post("/api/dds-ata-lote", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = { id: (authUser as any).id, role: (authUser as any).role };
      } catch { res.status(401).json({ error: "Não autenticado" }); return; }

      const { companyId, ids } = req.body as { companyId: number; ids: number[] };
      if (!companyId || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "companyId e ids[] são obrigatórios" }); return;
      }
      if (ids.length > 100) { res.status(400).json({ error: "Máximo 100 sessões por lote" }); return; }

      const db = (await getDb())!;

      if (user.role !== "admin_master") {
        const link = await db.select({ id: userCompanies.id }).from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, companyId)));
        if (link.length === 0) { res.status(403).json({ error: "Sem permissão" }); return; }
      }

      const [company] = await db.select({
        nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj, logoUrl: companies.logoUrl,
      }).from(companies).where(eq(companies.id, companyId));

      const logoB64 = await toBase64(company?.logoUrl);

      const sessoesList = await db.select({
        id: ddsSessoes.id, obraNome: ddsSessoes.obraNome, data: ddsSessoes.data,
        hora: ddsSessoes.hora, tituloTema: ddsSessoes.tituloTema,
        conteudoMd: ddsSessoes.conteudoMd, instrutor: ddsSessoes.instrutor,
        local: ddsSessoes.local, observacoes: ddsSessoes.observacoes,
        status: ddsSessoes.status, categoria: ddsSessoes.categoria,
      }).from(ddsSessoes)
        .where(and(eq(ddsSessoes.companyId, companyId), inArray(ddsSessoes.id, ids)));

      // ── Montar ZIP completamente em memória antes de enviar ──────────────────
      // Isso evita que um erro no meio da geração drope a conexão silenciosamente
      // (o que no iOS Safari aparece como "Load failed").
      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on("data", (chunk: Buffer) => chunks.push(chunk));
      const zipDone = new Promise<void>((resolve, reject) => {
        pass.on("end", resolve);
        pass.on("error", reject);
      });

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => { throw err; });
      archive.pipe(pass);

      // Lança 1 browser puppeteer para todo o lote (mais eficiente)
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        executablePath: puppeteer.default.executablePath(),
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });

      try {
        // Gerar PDF para cada sessão e organizar em pastas
        for (const s of sessoesList) {
          const funcs = await db.select({
            id: ddsSessaoFuncionarios.id, nome: ddsSessaoFuncionarios.nome,
            cpf: ddsSessaoFuncionarios.cpf, funcao: ddsSessaoFuncionarios.funcao,
            presente: ddsSessaoFuncionarios.presente, assinadoEm: ddsSessaoFuncionarios.assinadoEm,
            assinaturaImg: ddsSessaoFuncionarios.assinaturaImg, fotoUrl: employees.fotoUrl,
          }).from(ddsSessaoFuncionarios)
            .leftJoin(employees, eq(employees.id, ddsSessaoFuncionarios.employeeId))
            .where(eq(ddsSessaoFuncionarios.sessaoId, s.id))
            .orderBy(ddsSessaoFuncionarios.nome);

          let terceiros: any[] = [];
          try {
            terceiros = await db.select({
              id: ddsParticipacoesTerceiros.id, nome: funcionariosTerceiros.nome,
              cpf: funcionariosTerceiros.cpf, funcao: funcionariosTerceiros.funcao,
              fotoUrl: funcionariosTerceiros.fotoUrl,
            }).from(ddsParticipacoesTerceiros)
              .leftJoin(funcionariosTerceiros, eq(funcionariosTerceiros.id, ddsParticipacoesTerceiros.funcTerceiroId))
              .where(and(
                eq(ddsParticipacoesTerceiros.companyId, companyId),
                eq(ddsParticipacoesTerceiros.sessaoId, s.id),
                isNull(ddsParticipacoesTerceiros.deletedAt),
              )).orderBy(funcionariosTerceiros.nome);
          } catch { /* opcional */ }

          const html = await buildSessionHtml(s, funcs, terceiros, company, logoB64);

          // Converter HTML em PDF via puppeteer
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "networkidle0" });
          const raw = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", right: "12mm", bottom: "12mm", left: "12mm" },
          });
          await page.close();
          const pdfBuf = Buffer.from(raw);

          // Pasta: ANO/MM - Mês/Semana NN/
          const dateStr = String(s.data || "").slice(0, 10);
          let year = "0000", month = "00", monthName = "Mês", week = 0, dayStr = "00-00-0000";
          if (dateStr.length === 10) {
            const [y, m, d] = dateStr.split("-");
            year = y; month = m;
            monthName = MESES_PT[parseInt(m, 10) - 1] || m;
            week = getWeekOfYear(dateStr);
            dayStr = `${d}-${m}-${y}`;
          }

          const weekStr = week > 0 ? `Semana ${String(week).padStart(2, "0")}` : "Sem Data";
          const temaClean = safeFileName(s.tituloTema || `Sessão ${s.id}`);
          const fileName = `${dayStr} - ${temaClean}.pdf`;
          const folderPath = `${year}/${month} - ${monthName}/${weekStr}/${fileName}`;
          archive.append(pdfBuf, { name: folderPath });
        }
      } finally {
        await browser.close();
      }

      await archive.finalize();
      await zipDone;

      const zipBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="DDS_${new Date().getFullYear()}.zip"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err) {
      console.error("[DdsAtaLote] Erro:", err);
      if (!res.headersSent) res.status(500).json({ error: String((err as any)?.message ?? "Erro interno ao gerar ZIP") });
    }
  });
}
