// ============================================================================
// Rev. 4649 — FICHA DE EPI DIGITAL EM PDF (server-side, puppeteer)
// Gera o mesmo documento da FichaEpiDialog (CONTROLE DE E.P.I.'s / Termo de
// Compromisso, NR-06/CLT) como PDF, p/ entrar automaticamente no Dossiê ZIP
// que vai pro cliente. A ficha antiga (upload em Documentos) é MANTIDA — as
// duas convivem até o usuário dispensar a antiga.
// Imagens (logo, foto 3x4, assinaturas) são embutidas como data URI — o
// Chromium headless não resolve /uploads nem depende de rede externa.
// ============================================================================
import { getDb } from "../db";
import { epis, epiDeliveries, epiAssinaturas, employees, companies, systemCriteria } from "../../drizzle/schema";
import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";
import { dbRetrieve } from "../storage";

const TERMO_PADRAO = "Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário, conforme Art. 462, §1º da CLT e NR-6 do MTE.";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// fmtDate/fmtDateTime devolvem saída JÁ ESCAPADA (o fallback repassa o valor
// do banco, que pode ser texto arbitrário) — seguras p/ interpolar no HTML.
function fmtDate(v?: string | null): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s);
}
function fmtDateTime(v?: string | null): string {
  if (!v) return "";
  const s = String(v);
  const d = fmtDate(s);
  const hm = s.match(/[T ](\d{2}):(\d{2})/);
  return hm ? `${d} ${hm[1]}:${hm[2]}` : d;
}
function fmtCpf(v?: string | null): string {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v || "");
}

// Busca imagem e devolve data URI — nunca lança.
// SEGURANÇA (SSRF): só resolve chaves internas /uploads via dbRetrieve e
// data: URIs de imagem já gravadas; NUNCA faz fetch de URL http arbitrária
// vinda de coluna gravável (memória: comprovante-fetch-ssrf).
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
  } catch { /* imagem indisponível → ficha sai sem ela */ }
  return "";
}

// Monta o HTML da ficha de um funcionário; null se sem entregas.
async function montarHtmlFicha(companyId: number, employeeId: number): Promise<string | null> {
  const db = (await getDb())!;

  const entregas = await db.select({
    id: epiDeliveries.id,
    quantidade: epiDeliveries.quantidade,
    dataEntrega: epiDeliveries.dataEntrega,
    dataDevolucao: epiDeliveries.dataDevolucao,
    assinaturaUrl: epiDeliveries.assinaturaUrl,
    createdAt: epiDeliveries.createdAt,
    nomeEpi: epis.nome,
    caEpi: epis.ca,
    tamanhoEpi: epis.tamanho,
  })
    .from(epiDeliveries)
    .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
    .where(and(
      eq(epiDeliveries.companyId, companyId),
      eq(epiDeliveries.employeeId, employeeId),
      isNull(epiDeliveries.deletedAt),
    ))
    .orderBy(desc(epiDeliveries.dataEntrega), desc(epiDeliveries.id));

  if (entregas.length === 0) return null;

  const [emp] = await db.select({
    nomeCompleto: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
    fotoUrl: employees.fotoUrl, codigoInterno: employees.codigoInterno,
    matricula: employees.matricula, dataAdmissao: employees.dataAdmissao,
  }).from(employees).where(eq(employees.id, employeeId));
  if (!emp) return null;

  // Rev. 4650 — fallback de foto: cadastro irmão (mesmo CPF) pode ter a foto
  const cpfDigits = (emp.cpf || "").replace(/\D/g, "");
  if (!(emp.fotoUrl || "").trim() && cpfDigits.length === 11) {
    const fb = await db.execute(sql`
      SELECT e2."fotoUrl" FROM employees e2
      WHERE e2.id <> ${employeeId}
        AND e2."fotoUrl" IS NOT NULL AND e2."fotoUrl" <> ''
        AND e2."deletedAt" IS NULL
        AND regexp_replace(COALESCE(e2.cpf,''), '[^0-9]', '', 'g') = ${cpfDigits}
      ORDER BY e2.id DESC LIMIT 1
    `);
    const fbRow = ((fb as any)?.rows ?? fb ?? [])[0];
    if (fbRow?.fotoUrl) (emp as any).fotoUrl = fbRow.fotoUrl;
  }

  const [empresa] = await db.select({
    razaoSocial: companies.razaoSocial, cnpj: companies.cnpj, logoUrl: companies.logoUrl,
  }).from(companies).where(eq(companies.id, companyId));

  const [termoRow] = await db.select({ valor: systemCriteria.valor }).from(systemCriteria)
    .where(and(eq(systemCriteria.companyId, companyId), eq(systemCriteria.chave, "epi_ficha_texto")));
  const termo = termoRow?.valor || TERMO_PADRAO;

  // Autenticação (epi_assinaturas) por entrega
  const assinMap = new Map<number, any>();
  const dIds = entregas.map(e => e.id);
  if (dIds.length > 0) {
    const assins = await db.select({
      deliveryId: epiAssinaturas.deliveryId, assinadoEm: epiAssinaturas.assinadoEm,
      ipAddress: epiAssinaturas.ipAddress, hashSha256: epiAssinaturas.hashSha256,
    }).from(epiAssinaturas)
      .where(and(inArray(epiAssinaturas.deliveryId, dIds), eq(epiAssinaturas.employeeId, employeeId)));
    for (const a of assins) if (a.deliveryId != null && !assinMap.has(a.deliveryId)) assinMap.set(a.deliveryId, a);
  }

  // Imagens embutidas
  const [logoUri, fotoUri, ...sigUris] = await Promise.all([
    imgDataUri(empresa?.logoUrl),
    imgDataUri(emp.fotoUrl),
    ...entregas.map(e => imgDataUri(e.assinaturaUrl)),
  ]);

  const assinadas = entregas.filter(e => !!e.assinaturaUrl).length;
  const rows = entregas.map((e, i) => {
    const aut = assinMap.get(e.id);
    return `<tr>
      <td class="c">${esc(e.quantidade)}</td>
      <td>${esc(e.nomeEpi || "—")}${e.tamanhoEpi ? ` <span class="mut">(${esc(e.tamanhoEpi)})</span>` : ""}</td>
      <td class="c">${esc(e.caEpi || "—")}</td>
      <td class="c">${fmtDate(e.dataEntrega) || "—"}</td>
      <td class="c">${fmtDate(e.dataDevolucao)}</td>
      <td class="c sig">${sigUris[i]
        ? `<img src="${sigUris[i]}" alt="assinatura" /><div class="aut">${aut ? `${esc(fmtDateTime(aut.assinadoEm))}${aut.ipAddress ? ` · IP ${esc(aut.ipAddress)}` : ""}${aut.hashSha256 ? `<br/>SHA-256 ${esc(String(aut.hashSha256).slice(0, 16))}…` : ""}` : esc(fmtDateTime(e.createdAt))}</div>`
        : (e.assinaturaUrl ? `<span class="selo">&#10003; ASSINADO DIGITALMENTE</span><div class="aut">${aut ? `${esc(fmtDateTime(aut.assinadoEm))}${aut.ipAddress ? ` · IP ${esc(aut.ipAddress)}` : ""}${aut.hashSha256 ? `<br/>SHA-256 ${esc(String(aut.hashSha256).slice(0, 16))}…` : ""}` : esc(fmtDateTime(e.createdAt))}</div>` : `<span class="pend">SEM ASSINATURA</span>`)}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .top { border: 1.5px solid #0A1E3C; }
  .titulo { background: #0A1E3C; color: #fff; font-size: 14px; font-weight: bold; padding: 4px 8px; letter-spacing: 1px; display: flex; align-items: center; min-height: 32px; }
  .titulo .logobox { width: 110px; flex: 0 0 110px; display: flex; align-items: center; }
  .titulo .logobox img { background: #fff; border-radius: 3px; padding: 2px 5px; max-height: 24px; max-width: 100px; width: auto; height: auto; object-fit: contain; display: block; }
  .titulo span.t { flex: 1; text-align: center; }
  .titulo .sp { width: 110px; flex: 0 0 110px; }
  .cab { display: flex; align-items: stretch; }
  .cab .grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; }
  .grid div { padding: 4px 6px; border-bottom: 1px solid #ccd; font-size: 10px; }
  .grid b { color: #0A1E3C; }
  .foto { width: 88px; border-left: 1px solid #0A1E3C; display: flex; align-items: center; justify-content: center; padding: 4px; }
  .foto img { width: 78px; height: 96px; object-fit: cover; border: 1px solid #99a; border-radius: 3px; }
  .sub { text-align: center; font-weight: bold; font-size: 11px; padding: 3px; border-bottom: 1px solid #0A1E3C; border-top: 1px solid #0A1E3C; background: #f4f6fa; }
  .termo { padding: 7px 8px; font-size: 9.5px; text-align: justify; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #0A1E3C; color: #fff; font-size: 9px; padding: 4px 3px; border: 1px solid #0A1E3C; }
  td { border: 1px solid #99a; padding: 3px 4px; font-size: 9.5px; vertical-align: middle; }
  td.c { text-align: center; } .mut { color: #666; }
  td.sig img { height: 26px; max-width: 110px; object-fit: contain; display: block; margin: 0 auto; }
  .aut { font-size: 6.5px; color: #555; margin-top: 1px; line-height: 1.25; }
  .pend { color: #b91c1c; font-weight: bold; font-size: 8px; }
  .selo { color: #15803d; border: 1px solid #16a34a; border-radius: 3px; padding: 1px 4px; font-weight: bold; font-size: 7.5px; white-space: nowrap; }
  .rodape { margin-top: 10px; font-size: 8.5px; color: #333; border: 1px solid #99a; padding: 6px 8px; background: #f8fafc; line-height: 1.5; }
  .footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #777; }
</style></head><body>
<div class="top">
  <div class="titulo">
    <div class="logobox">${logoUri ? `<img src="${logoUri}" alt="logo" />` : ""}</div>
    <span class="t">CONTROLE DE E.P.I.'S</span>
    <div class="sp"></div>
  </div>
  <div class="cab">
    <div class="grid">
      <div><b>EMPRESA:</b> ${esc(empresa?.razaoSocial || "")}</div>
      <div><b>CNPJ:</b> ${esc(empresa?.cnpj || "")}</div>
      <div><b>NOME:</b> ${esc(emp.nomeCompleto)}</div>
      <div><b>CPF:</b> ${esc(fmtCpf(emp.cpf))}</div>
      <div><b>FUNÇÃO:</b> ${esc(emp.funcao || "—")}</div>
      <div><b>Nº INTERNO:</b> ${esc(emp.codigoInterno || emp.matricula || "—")}${emp.dataAdmissao ? ` &nbsp; <b>ADMISSÃO:</b> ${fmtDate(emp.dataAdmissao)}` : ""}</div>
    </div>
    ${fotoUri ? `<div class="foto"><img src="${fotoUri}" alt="foto" /></div>` : ""}
  </div>
  <div class="sub">TERMO DE COMPROMISSO</div>
  <div class="termo">${esc(termo)}</div>
</div>
<table>
  <thead><tr><th style="width:34px">Quant.</th><th>Descrição</th><th style="width:56px">C.A.</th><th style="width:64px">Data Entrega</th><th style="width:64px">Data Devolução</th><th style="width:130px">Assinatura do Funcionário</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="rodape"><b>AUTENTICAÇÃO DIGITAL:</b> As assinaturas desta ficha foram coletadas eletronicamente no ato de cada entrega, com registro de data/hora, endereço IP e hash criptográfico SHA-256 da imagem da assinatura, garantindo integridade e autenticidade do documento nos termos da MP 2.200-2/2001 (ICP-Brasil), art. 158 e 166 da CLT e NR-06 do MTE. Total: ${entregas.length} entrega(s), ${assinadas} assinada(s).</div>
<div class="footer"><span>ERP Gestão Integrada — Ficha de EPI Digital</span><span>Emitido em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>
</body></html>`;

  return html;
}

async function launchBrowser() {
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

async function pdfFromHtml(browser: any, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    // Segurança: tudo é data URI/inline — bloqueia qualquer request externo
    await page.setRequestInterception(true);
    page.on("request", (req: any) => { req.url().startsWith("data:") || req.url() === "about:blank" ? req.continue() : req.abort(); });
    await page.setContent(html, { waitUntil: "load" });
    const raw = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(raw);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Gera o PDF da Ficha de EPI digital de UM funcionário.
 * Retorna null se não houver entregas. Guard de tenant é do CHAMADOR.
 */
export async function gerarFichaEpiPdf(companyId: number, employeeId: number): Promise<Buffer | null> {
  const html = await montarHtmlFicha(companyId, employeeId);
  if (!html) return null;
  const browser = await launchBrowser();
  try {
    return await pdfFromHtml(browser, html);
  } finally {
    await browser.close();
  }
}

/**
 * Gera as fichas de VÁRIOS funcionários reutilizando UM único Chromium
 * (dossiê ZIP em lote — 1 browser p/ N fichas, senão o servidor sofre).
 * Falha individual não derruba o lote. Chama onPdf a cada ficha pronta
 * (streaming — nada fica acumulado em RAM).
 */
export async function gerarFichasEpiPdfLote(
  companyId: number,
  employeeIds: number[],
  onPdf: (employeeId: number, buf: Buffer) => void | Promise<void>,
): Promise<void> {
  if (employeeIds.length === 0) return;
  let browser: any = null;
  try {
    for (const id of employeeIds) {
      try {
        const html = await montarHtmlFicha(companyId, id);
        if (!html) continue;
        if (!browser) browser = await launchBrowser(); // lazy: só abre se houver ficha
        await onPdf(id, await pdfFromHtml(browser, html));
      } catch (e) {
        console.warn(`[FichaEpiPdf] Falha ao gerar ficha emp=${id}:`, e);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
