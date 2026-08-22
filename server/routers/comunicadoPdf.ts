// Rev. 4542 — Download do Comunicado Interno em PDF (Puppeteer) para envio no WhatsApp.
// Mesmo padrão da ata de DDS (downloadDdsAta.ts): rota GET autenticada + tenancy check,
// HTML self-contained (logo em base64) e page.pdf A4.
import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { companies, userCompanies, comunicadosInternos, systemDocumentTemplates } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { renderTemplate } from "../../shared/documentTemplates";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Sanitização SERVER-SIDE do HTML do comunicado antes de renderizar no Puppeteer
// (mesma allowlist do RichTextEditor do cliente) — impede script/conteúdo ativo
// rodando em contexto privilegiado do servidor.
const _window = new JSDOM("").window;
const DOMPurify = createDOMPurify(_window as any);
function sanitizeServerHtml(s: string): string {
  return DOMPurify.sanitize(s, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "b", "i", "span", "div",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "h1", "h2", "h3", "h4", "h5", "h6", "hr",
      "a", "img", "table", "thead", "tbody", "tr", "td", "th",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "style", "class", "colspan", "rowspan"],
  });
}

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

function isHtmlContent(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
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
          : ext === "png" ? "image/png"
          : ext === "webp" ? "image/webp" : "image/jpeg";
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await resp.arrayBuffer());
    return `data:${contentType.split(";")[0].trim()};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function registerComunicadoPdfRoute(app: Express) {
  app.get("/api/comunicado-pdf/:id", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = {
          id: (authUser as Record<string, number>).id,
          role: (authUser as Record<string, string>).role,
        };
      } catch {
        res.status(401).send("Não autenticado");
        return;
      }

      const comunicadoId = parseInt(req.params.id, 10);
      const companyId = parseInt(req.query.companyId as string, 10);
      if (isNaN(comunicadoId) || isNaN(companyId)) {
        res.status(400).send("Parâmetros inválidos");
        return;
      }

      const db = (await getDb())!;

      if (user.role !== "admin_master") {
        const link = await db
          .select({ id: userCompanies.id })
          .from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, companyId)));
        if (link.length === 0) {
          res.status(403).send("Sem permissão para acessar esta empresa");
          return;
        }
      }

      const [c] = await db.select().from(comunicadosInternos)
        .where(and(
          eq(comunicadosInternos.id, comunicadoId),
          eq(comunicadosInternos.companyId, companyId),
          isNull(comunicadosInternos.deletedAt),
        ));
      if (!c) { res.status(404).send("Comunicado não encontrado"); return; }

      const [company] = await db.select({
        nomeFantasia: companies.nomeFantasia,
        razaoSocial: companies.razaoSocial,
        cnpj: companies.cnpj,
        logoUrl: companies.logoUrl,
        endereco: companies.endereco,
        cidade: companies.cidade,
        estado: companies.estado,
        grupoEmpresarial: (companies as any).grupoEmpresarial,
      }).from(companies).where(eq(companies.id, companyId));

      const nomeEmpresa = company?.nomeFantasia || company?.razaoSocial || "FC ENGENHARIA";
      const enderecoLinha = [company?.endereco, company?.cidade, company?.estado].filter(Boolean).join(" - ");
      const logoB64 = await toBase64(company?.logoUrl || null);

      // Rev. — Empregador documental JF: quando o comunicado tem colaboradores
      // marcados como JF entre os destinatários, o documento é DUPLICADO — uma via
      // com o cabeçalho/logo da FC e outra com o da Julio Ferraz (mesma regra da
      // Lista de Ciência em 2 listas).
      let temJf = false;
      try {
        let destinatariosIds: number[] | null = null;
        if ((c as any).destinatariosJson) {
          try {
            const parsed = JSON.parse((c as any).destinatariosJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              destinatariosIds = parsed.map((d: any) => Number(typeof d === "object" ? (d.id ?? d) : d)).filter((n: number) => !isNaN(n) && n > 0);
            }
          } catch { /* json inválido → todos */ }
        }
        const { sql: dsql } = await import("drizzle-orm");
        const jfCond = destinatariosIds && destinatariosIds.length > 0
          ? dsql`AND id IN (${dsql.join(destinatariosIds.map((i) => dsql`${i}`), dsql`, `)})`
          : dsql``;
        const r: any = await db.execute(dsql`
          SELECT 1 FROM employees
          WHERE "companyId" = ${companyId}
            AND empregador_documentos = 'JF'
            AND status NOT IN ('Desligado', 'Lista_Negra', 'Inativo')
            ${jfCond}
          LIMIT 1
        `);
        temJf = (r.rows || []).length > 0;
      } catch (e: any) {
        console.warn("[ComunicadoPdf] Falha ao detectar colaboradores JF:", e?.message || e);
      }
      let jfEmpresa: { nome: string; cnpj: string; enderecoLinha: string; logoB64: string | null } | null = null;
      if (temJf) {
        const { sql: dsql } = await import("drizzle-orm");
        const [jf] = await db.select().from(companies)
          .where(dsql`${companies.cnpj} LIKE '03.426.403%'`)
          .orderBy(dsql`(${companies.deletedAt} IS NULL) DESC, ${companies.id} ASC`)
          .limit(1);
        // Tenant guard (mesma regra de companies.empregadorJf): a JF só é exibida
        // se pertencer ao MESMO grupo empresarial da empresa do comunicado.
        if (jf && ((jf as any).grupoEmpresarial ?? null) !== ((company as any)?.grupoEmpresarial ?? null)) {
          temJf = false;
        } else
        jfEmpresa = {
          nome: (jf as any)?.razaoSocial || (jf as any)?.nomeFantasia || "JULIO FERRAZ PROJETOS E OBRAS LTDA",
          cnpj: (jf as any)?.cnpj || "03.426.403/0001-95",
          enderecoLinha: [(jf as any)?.endereco, (jf as any)?.cidade, (jf as any)?.estado].filter(Boolean).join(" - "),
          logoB64: await toBase64((jf as any)?.logoUrl || null),
        };
      }

      // Corpo — mesma regra da tela: template vigente (comunicado_interno) quando existir.
      const [tpl] = await db.select({ conteudoHtml: systemDocumentTemplates.conteudoHtml })
        .from(systemDocumentTemplates)
        .where(and(
          eq(systemDocumentTemplates.tipo, "comunicado_interno"),
          eq(systemDocumentTemplates.status, "vigente"),
          isNull(systemDocumentTemplates.deletedAt),
        )).limit(1);

      const buildCorpoHtml = (empNomeDoc: string, empCnpjDoc: string): string => {
        if (!c.conteudo) return "";
        const corpoMsg = isHtmlContent(c.conteudo)
          ? sanitizeServerHtml(c.conteudo)
          : `<p>${esc(c.conteudo).replace(/\n/g, "<br/>")}</p>`;
        if (tpl?.conteudoHtml) {
          return sanitizeServerHtml(renderTemplate(tpl.conteudoHtml, {
            empNome: "", corpoMsg, assunto: esc(c.titulo || ""),
            empresaRazaoSocial: esc(empNomeDoc), empresaCnpj: esc(empCnpjDoc),
            docNumero: esc(String(c.numero || "")), docData: esc(fmtDate(c.dataEmissao)),
          }));
        }
        return corpoMsg;
      };

      // Blocos de assinatura do emissor — mesma lógica da tela (1 bloco p/ Direção, 2 caso contrário)
      const cargoLower = (c.emissorCargo || "").toLowerCase();
      const setorLower = (c.setor || "").toLowerCase();
      const ehDirecao = setorLower === "diretoria" || setorLower.includes("diretor")
        || cargoLower.includes("diretor") || cargoLower.includes("sócio") || cargoLower.includes("socio");
      const blocoAssin = (nome: string, cargo: string) => `
        <div style="flex:1;text-align:center;">
          <div style="border-top:1px solid #94a3b8;margin:0 24px;padding-top:6px;">
            <div style="font-size:11px;font-weight:700;color:#1B2A4A;">${esc(nome)}</div>
            <div style="font-size:10px;color:#64748b;">${esc(cargo)}</div>
          </div>
        </div>`;
      const emissorNome = c.emissorNome || c.criadoPor || "";
      const buildAssinaturasHtml = (diretorNome: string) => ehDirecao
        ? `<div style="display:flex;margin-top:56px;">${blocoAssin(emissorNome, c.emissorCargo || "Diretoria")}</div>`
        : `<div style="display:flex;margin-top:56px;gap:16px;">
             ${blocoAssin(emissorNome, c.emissorCargo || "Responsável")}
             ${blocoAssin(diretorNome, "Direção")}
           </div>`;

      // Rev. — uma "via" (página) do comunicado por empregador documental.
      const empresasDoc: Array<{ nome: string; cnpj: string; enderecoLinha: string; logoB64: string | null; diretorNome: string }> = [
        { nome: nomeEmpresa, cnpj: company?.cnpj || "", enderecoLinha, logoB64, diretorNome: temJf ? "FELIPE COSTA ALVES" : "" },
      ];
      if (temJf && jfEmpresa) {
        empresasDoc.push({ ...jfEmpresa, diretorNome: "JULIO CESAR FERRAZ DE ARAUJO" });
      }

      const paginaHtml = (emp: typeof empresasDoc[0], isLast: boolean) => `
<div style="padding:8px 8px 0;${isLast ? "" : "page-break-after:always;"}">
  <div style="text-align:center;margin-bottom:14px;">
    ${emp.logoB64 ? `<img src="${emp.logoB64}" style="height:60px;max-width:190px;width:auto;object-fit:contain;object-position:left;margin-bottom:6px;"/>` : ""}
    <div style="font-size:16px;font-weight:800;color:#1B2A4A;letter-spacing:.02em;">${esc(emp.nome)}</div>
    ${emp.cnpj ? `<div style="font-size:9.5px;color:#6b7280;">CNPJ: ${esc(emp.cnpj)}</div>` : ""}
    ${emp.enderecoLinha ? `<div style="font-size:9.5px;color:#9ca3af;">${esc(emp.enderecoLinha)}</div>` : ""}
  </div>

  <div style="background:#1B2A4A;color:#fff;text-align:center;padding:9px 12px;border-radius:3px;">
    <span style="font-size:13px;font-weight:800;letter-spacing:.08em;">COMUNICADO INTERNO</span>
  </div>

  <div style="display:flex;justify-content:space-between;margin:10px 2px 0;font-size:10.5px;color:#4b5563;">
    <span style="font-weight:700;color:#1B2A4A;">Nº ${esc(c.numero)}</span>
    <span>Data de Emissão: ${esc(fmtDate(c.dataEmissao))}</span>
  </div>

  <div style="border:1px solid #d1d5db;border-radius:4px;padding:12px 14px;margin-top:12px;">
    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">Assunto:</div>
    <div style="font-size:13.5px;font-weight:800;color:#1B2A4A;margin-top:2px;">${esc(c.titulo)}</div>
  </div>

  <div class="conteudo" style="border:1px solid #e5e7eb;border-radius:4px;padding:16px 18px;margin-top:14px;font-size:11.5px;line-height:1.65;min-height:180px;">
    ${buildCorpoHtml(emp.nome, emp.cnpj)}
  </div>

  ${buildAssinaturasHtml(emp.diretorNome)}

  <div style="margin-top:36px;border-top:1px dashed #cbd5e1;padding-top:10px;">
    <div style="font-size:9.5px;color:#64748b;font-style:italic;text-align:center;">
      Declaro que recebi, li e estou ciente do conteúdo do comunicado acima identificado.
    </div>
  </div>
</div>`;

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1f2937; background: #fff; }
  .conteudo p { margin: 8px 0; }
  .conteudo ul, .conteudo ol { margin: 8px 0 8px 20px; }
  .conteudo h1, .conteudo h2, .conteudo h3 { color: #1B2A4A; margin: 12px 0 6px; }
  .conteudo strong { color: #111827; }
</style>
</head>
<body>
${empresasDoc.map((emp, i) => paginaHtml(emp, i === empresasDoc.length - 1)).join("\n")}
</body>
</html>`;

      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      let pdfBuf: Buffer;
      try {
        const page = await browser.newPage();
        // Defesa em profundidade: sem JS e sem requests externos (só data: URLs embutidas)
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on("request", (r) => {
          const u = r.url();
          if (u.startsWith("data:") || u === "about:blank") r.continue();
          else r.abort();
        });
        await page.setContent(html, { waitUntil: "networkidle0" });
        const raw = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "12mm", right: "14mm", bottom: "14mm", left: "14mm" },
        });
        pdfBuf = Buffer.from(raw);
        await page.close();
      } finally {
        await browser.close();
      }

      const fnSafe = (c.titulo || `Comunicado_${comunicadoId}`)
        .replace(/[^a-zA-Z0-9À-úÀ-ÿ ]/g, "-").replace(/\s+/g, "_").slice(0, 60);
      const numSafe = String(c.numero || "").replace(/\//g, "-");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="CI_${numSafe}_${fnSafe}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(pdfBuf.length));
      res.send(pdfBuf);
    } catch (err) {
      console.error("[ComunicadoPdf] Erro ao gerar PDF:", err);
      res.status(500).send("Erro interno ao gerar o PDF");
    }
  });
}
