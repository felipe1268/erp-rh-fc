// ============================================================================
// Rev. 4669 — DOCUMENTOS DO COLABORADOR: PDF (server-side, puppeteer)
// Renderiza o SNAPSHOT (rh_documentos.conteudo_html) num papel timbrado navy
// + bloco de assinatura digital. Mesma infra da OS Digital (browser reusado,
// requests externos bloqueados, JS desabilitado — o HTML vem do editor de
// templates do admin, defesa em profundidade).
// ============================================================================
import { getDb } from "../db";
import { rhDocumentos, employees, companies } from "../../drizzle/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { dbRetrieve } from "../storage";
import { launchBrowser } from "./ordemServicoPdf";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const s = String(v);
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? `${m[3]}/${m[2]}/${m[1]}` : s.slice(0, 10);
  const hm = s.match(/[T ](\d{2}):(\d{2})/);
  return hm ? `${d} ${hm[1]}:${hm[2]}` : d;
}

async function imgDataUri(url?: string | null): Promise<string> {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^data:image\//i.test(u)) return u;
  try {
    const m = u.match(/^\/uploads\/([^?]+)/);
    if (m) {
      const r = await dbRetrieve(decodeURIComponent(m[1]));
      if (r) return `data:${r.contentType || "image/png"};base64,${r.buffer.toString("base64")}`;
    }
  } catch { /* sem imagem */ }
  return "";
}

export type RhDocRow = typeof rhDocumentos.$inferSelect;

/** Rev. 4672 — inline de <img src="/uploads/..."> do corpo (foto da ficha):
 *  o Chromium roda com requests bloqueados (só data:), então toda imagem
 *  interna precisa virar data-URI antes do render. Só resolve /uploads. */
async function inlineUploadsImgs(html: string): Promise<string> {
  const srcs = new Set<string>();
  for (const m of String(html || "").matchAll(/<img[^>]+src="(\/uploads\/[^"]+)"/g)) srcs.add(m[1]);
  if (srcs.size === 0) return html;
  let out = html;
  for (const src of srcs) {
    const uri = await imgDataUri(src);
    out = out.split(`src="${src}"`).join(`src="${uri}"`); // uri vazio = img some
  }
  return out;
}

async function montarHtmlDoc(doc: RhDocRow): Promise<string> {
  const db = (await getDb())!;
  const [empresa] = await db.select({ razaoSocial: companies.razaoSocial, cnpj: companies.cnpj, logoUrl: companies.logoUrl })
    .from(companies).where(eq(companies.id, doc.companyId));
  const [emp] = await db.select({ nomeCompleto: employees.nomeCompleto })
    .from(employees).where(eq(employees.id, doc.employeeId));

  const [logoUri, sigUri] = await Promise.all([
    imgDataUri(empresa?.logoUrl),
    imgDataUri(doc.assinaturaUrl),
  ]);

  const assinado = doc.status === "assinado" && sigUri;
  const assinaturaBloco = assinado
    ? `<img src="${sigUri}" alt="assinatura" style="height:44px;max-width:220px;object-fit:contain;display:block;margin:0 auto"/>
       <div style="border-top:1px solid #333;margin-top:2px;padding-top:3px">${esc(emp?.nomeCompleto || "")}</div>
       <div class="aut">Assinado digitalmente em ${esc(fmtDateTime(doc.assinadoEm))}${doc.assinaturaIp ? ` · IP ${esc(doc.assinaturaIp)}` : ""}${doc.assinaturaHash ? `<br/>SHA-256 ${esc(String(doc.assinaturaHash).slice(0, 24))}…` : ""}</div>`
    : `<div style="border-top:1px solid #333;margin-top:44px;padding-top:3px">${esc(emp?.nomeCompleto || "Assinatura do Colaborador")}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; }
  .cab { background:#0A1E3C;color:#fff;display:flex;align-items:center;padding:8px 12px;border-radius:4px }
  .cab .logobox { width:120px;flex:0 0 120px } .cab img { background:#fff;border-radius:3px;padding:2px 6px;max-height:28px;max-width:110px;object-fit:contain;display:block }
  .cab .t { flex:1;text-align:center;font-weight:bold;font-size:13pt;line-height:1.3 } .cab .t small { display:block;font-size:8pt;font-weight:normal;opacity:.85 }
  .cab .cod { width:120px;flex:0 0 120px;text-align:right;font-size:8pt }
  .corpo { margin-top:14px }
  .assin { margin-top:34px;display:flex;gap:28px } .assin > div { flex:1;text-align:center;font-size:9pt }
  .aut { font-size:7pt;color:#555;margin-top:2px;line-height:1.3 }
  .rodape { margin-top:14px;font-size:8pt;color:#333;border:1px solid #99a;padding:6px 8px;background:#f8fafc;line-height:1.5 }
  .footer { margin-top:8px;display:flex;justify-content:space-between;font-size:7.5pt;color:#777 }
</style></head><body>
<div class="cab">
  <div class="logobox">${logoUri ? `<img src="${logoUri}" alt="logo"/>` : ""}</div>
  <div class="t">${esc(doc.titulo).toUpperCase()}<small>${esc(empresa?.razaoSocial || "")} — CNPJ ${esc(empresa?.cnpj || "")}</small></div>
  <div class="cod">${doc.codigo ? `${esc(doc.codigo)}${doc.versaoTemplate ? ` · Rev. ${doc.versaoTemplate}` : ""}` : ""}</div>
</div>
<div class="corpo">${await inlineUploadsImgs(doc.conteudoHtml)}</div>
<div class="assin">
  <div>${assinaturaBloco}</div>
  <div><div style="border-top:1px solid #333;margin-top:44px;padding-top:3px">${esc(empresa?.razaoSocial || "Empregadora")}</div></div>
</div>
${assinado ? `<div class="rodape"><b>AUTENTICAÇÃO DIGITAL:</b> A assinatura deste documento foi coletada eletronicamente, com registro de data/hora, endereço IP e hash criptográfico SHA-256 da imagem da assinatura, garantindo integridade e autenticidade nos termos da MP 2.200-2/2001 (ICP-Brasil).</div>` : ""}
<div class="footer"><span>ERP Gestão Integrada — Documentos do Colaborador</span><span>Emitido em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>
</body></html>`;
}

async function pdfFromHtmlNoJs(browser: any, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false); // HTML vem do editor de templates
    await page.setRequestInterception(true);
    page.on("request", (req: any) => { req.url().startsWith("data:") || req.url() === "about:blank" ? req.continue() : req.abort(); });
    await page.setContent(html, { waitUntil: "load" });
    const raw = await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "14mm", bottom: "12mm", left: "14mm" } });
    return Buffer.from(raw);
  } finally {
    await page.close().catch(() => {});
  }
}

/** PDF de UM documento do colaborador. Tenant guard é do CHAMADOR. */
export async function gerarRhDocumentoPdf(doc: RhDocRow): Promise<Buffer> {
  const html = await montarHtmlDoc(doc);
  const browser = await launchBrowser();
  try {
    return await pdfFromHtmlNoJs(browser, html);
  } finally {
    await browser.close();
  }
}

/** PDFs de todos os docs ASSINADOS dos funcionários (dossiê ZIP, 1 Chromium). */
export async function gerarRhDocumentosPdfLote(
  companyId: number,
  employeeIds: number[],
  onPdf: (employeeId: number, tipo: string, titulo: string, buf: Buffer) => void | Promise<void>,
): Promise<void> {
  if (employeeIds.length === 0) return;
  const db = (await getDb())!;
  const docs = await db.select().from(rhDocumentos).where(and(
    eq(rhDocumentos.companyId, companyId),
    inArray(rhDocumentos.employeeId, employeeIds),
    eq(rhDocumentos.status, "assinado"),
    isNull(rhDocumentos.deletedAt),
  ));
  if (docs.length === 0) return;
  let browser: any = null;
  try {
    for (const doc of docs) {
      try {
        if (!browser) browser = await launchBrowser();
        await onPdf(doc.employeeId, doc.tipo, doc.titulo, await pdfFromHtmlNoJs(browser, await montarHtmlDoc(doc)));
      } catch (e) {
        console.warn(`[RhDocumentoPdf] Falha doc=${doc.id}:`, e);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
