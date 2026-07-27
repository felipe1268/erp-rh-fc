// ============================================================================
// Rev. 4667 — ORDEM DE SERVIÇO (OS / NR-01) DIGITAL EM PDF (server-side)
// Gera a OS por colaborador juntando o que o sistema já tem:
//   - Dados do colaborador (nome, CPF, função, nascimento, admissão)
//   - Texto da OS cadastrado na FUNÇÃO (job_functions.ordemServico)
//   - EPIs realmente entregues ao colaborador, com C.A.
//   - Treinamentos registrados (mais recente por norma)
//   - Assinatura digital do colaborador (epi_assinaturas, tipo 'ordem_servico')
// Mesma infra da Ficha de EPI Digital (puppeteer, imagens como data URI,
// requests externos bloqueados). Entra no Dossiê ZIP em 001.4.
// ============================================================================
import { getDb } from "../db";
import { epis, epiDeliveries, epiAssinaturas, employees, companies, jobFunctions, trainings } from "../../drizzle/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { dbRetrieve } from "../storage";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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

// SSRF-safe: só resolve /uploads internos ou data: URIs (memória comprovante-fetch-ssrf)
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

const TERMO_CIENCIA = "Recebi a Ordem de Serviço de mesmo teor desta, que agora assino, referente às minhas funções, elaborada atendendo à legislação trabalhista em vigor (NR-01, item 1.7, letra \"b\", da Portaria 3.214/78), a qual cumprirei. Tomo ciência de que esta OS poderá sofrer alterações e revisões, e que o não cumprimento de qualquer item implica em punição de acordo com a legislação trabalhista e as normas da empresa.";

export interface OsData {
  funcionario: { id: number; nomeCompleto: string | null; cpf: string | null; funcao: string | null; dataNascimento: string | null; dataAdmissao: string | null };
  empresa: { razaoSocial: string | null; cnpj: string | null } | null;
  textoOs: string | null;
  descricaoFuncao: string | null;
  cbo: string | null;
  episEntregues: Array<{ nome: string | null; ca: string | null }>;
  treinamentos: Array<{ norma: string | null; nome: string | null; dataRealizacao: string | null }>;
  assinatura: { assinaturaUrl: string; assinadoEm: string | null; ipAddress: string | null; hashSha256: string | null } | null;
}

/** Coleta os dados da OS de um funcionário. Guard de tenant é do CHAMADOR. */
export async function coletarDadosOs(companyId: number, employeeId: number): Promise<OsData | null> {
  const db = (await getDb())!;

  const [emp] = await db.select({
    id: employees.id, nomeCompleto: employees.nomeCompleto, cpf: employees.cpf,
    funcao: employees.funcao, dataNascimento: employees.dataNascimento, dataAdmissao: employees.dataAdmissao,
  }).from(employees).where(and(eq(employees.id, employeeId), isNull(employees.deletedAt)));
  if (!emp) return null;

  const [empresa] = await db.select({ razaoSocial: companies.razaoSocial, cnpj: companies.cnpj, logoUrl: companies.logoUrl })
    .from(companies).where(eq(companies.id, companyId));

  // Texto da OS cadastrado na função (match por nome, case-insensitive)
  let textoOs: string | null = null, descricaoFuncao: string | null = null, cbo: string | null = null;
  if ((emp.funcao || "").trim()) {
    const [fn] = await db.select({ ordemServico: jobFunctions.ordemServico, descricao: jobFunctions.descricao, cbo: jobFunctions.cbo })
      .from(jobFunctions)
      .where(and(
        eq(jobFunctions.companyId, companyId),
        isNull(jobFunctions.deletedAt),
        sql`LOWER(TRIM(${jobFunctions.nome})) = LOWER(TRIM(${emp.funcao}))`,
      )).limit(1);
    textoOs = fn?.ordemServico || null;
    descricaoFuncao = fn?.descricao || null;
    cbo = fn?.cbo || null;
  }

  // EPIs entregues (distintos, com CA)
  const entregas = await db.select({ nome: epis.nome, ca: epis.ca })
    .from(epiDeliveries)
    .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
    .where(and(
      eq(epiDeliveries.companyId, companyId),
      eq(epiDeliveries.employeeId, employeeId),
      isNull(epiDeliveries.deletedAt),
    ));
  const vistos = new Set<string>();
  const episEntregues = entregas.filter(e => {
    const k = `${(e.nome || "").toUpperCase()}|${e.ca || ""}`;
    if (!e.nome || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // Treinamentos — mais recente por norma
  const trAll = await db.select({ norma: trainings.norma, nome: trainings.nome, dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade })
    .from(trainings).where(and(eq(trainings.employeeId, employeeId), isNull(trainings.deletedAt)));
  const porNorma = new Map<string, typeof trAll[0]>();
  for (const t of trAll) {
    const k = String(t.norma || t.nome || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "SEM";
    const atual = porNorma.get(k);
    if (!atual || String(t.dataValidade || "") > String(atual.dataValidade || "")) porNorma.set(k, t);
  }
  const treinamentos = [...porNorma.values()].sort((a, b) => String(a.norma || "").localeCompare(String(b.norma || "")));

  // Assinatura digital da OS (mais recente)
  const [assin] = await db.select({
    assinaturaUrl: epiAssinaturas.assinaturaUrl, assinadoEm: epiAssinaturas.assinadoEm,
    ipAddress: epiAssinaturas.ipAddress, hashSha256: epiAssinaturas.hashSha256,
  }).from(epiAssinaturas)
    .where(and(
      eq(epiAssinaturas.companyId, companyId),
      eq(epiAssinaturas.employeeId, employeeId),
      eq(epiAssinaturas.tipo, "ordem_servico"),
    ))
    .orderBy(desc(epiAssinaturas.assinadoEm), desc(epiAssinaturas.id))
    .limit(1);

  return {
    funcionario: emp,
    empresa: empresa ? { razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj } : null,
    textoOs, descricaoFuncao, cbo,
    episEntregues,
    treinamentos,
    assinatura: assin || null,
    // logoUrl vai só pro HTML (não exposto no tipo público)
    ...( { _logoUrl: empresa?.logoUrl || "" } as any),
  };
}

async function montarHtmlOs(companyId: number, employeeId: number): Promise<string | null> {
  const d = await coletarDadosOs(companyId, employeeId);
  if (!d) return null;
  // Sem texto de OS na função E sem EPIs → não há o que emitir
  if (!(d.textoOs || "").trim() && d.episEntregues.length === 0) return null;

  const [logoUri, sigUri] = await Promise.all([
    imgDataUri((d as any)._logoUrl),
    imgDataUri(d.assinatura?.assinaturaUrl),
  ]);

  const epiRows = d.episEntregues.map(e =>
    `<tr><td>${esc(e.nome)}</td><td class="c">${esc(e.ca || "—")}</td></tr>`).join("");
  const trRows = d.treinamentos.map(t =>
    `<tr><td class="c">${esc(t.norma || "—")}</td><td>${esc(t.nome || "—")}</td><td class="c">${fmtDate(t.dataRealizacao) || "—"}</td></tr>`).join("");

  // Texto da OS: preserva quebras de linha do cadastro da função
  const osHtml = (d.textoOs || "").trim()
    ? esc(d.textoOs).replace(/\r?\n/g, "<br/>")
    : `<i>Função sem texto de Ordem de Serviço cadastrado. Cadastre em Recursos Humanos &rarr; Funções.</i>`;

  const assinaturaBloco = d.assinatura
    ? `<img src="${sigUri}" alt="assinatura" style="height:40px;max-width:200px;object-fit:contain;display:block;margin:0 auto"/>
       <div class="aut">Assinado digitalmente em ${esc(fmtDateTime(d.assinatura.assinadoEm))}${d.assinatura.ipAddress ? ` · IP ${esc(d.assinatura.ipAddress)}` : ""}${d.assinatura.hashSha256 ? `<br/>SHA-256 ${esc(String(d.assinatura.hashSha256).slice(0, 24))}…` : ""}</div>`
    : `<div style="border-top:1px solid #333;margin-top:34px;padding-top:3px">Assinatura do Colaborador</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .top { border: 1.5px solid #0A1E3C; }
  .titulo { background: #0A1E3C; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 8px; display: flex; align-items: center; min-height: 34px; }
  .titulo .logobox { width: 110px; flex: 0 0 110px; } .titulo .logobox img { background:#fff;border-radius:3px;padding:2px 5px;max-height:24px;max-width:100px;object-fit:contain;display:block; }
  .titulo .t { flex: 1; text-align: center; line-height: 1.3; } .titulo .t small { display:block;font-size:8px;font-weight:normal;opacity:.85 }
  .titulo .sp { width: 110px; flex: 0 0 110px; text-align:right; font-size:8px; font-weight:normal; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
  .grid div { padding: 4px 6px; border-bottom: 1px solid #ccd; font-size: 10px; } .grid b { color: #0A1E3C; }
  h3 { background:#0A1E3C;color:#fff;font-size:10px;padding:3px 8px;margin:10px 0 0;letter-spacing:.5px }
  .box { border:1px solid #99a;border-top:0;padding:7px 8px;font-size:9.5px;text-align:justify;line-height:1.5 }
  table { width:100%;border-collapse:collapse } th { background:#eef1f7;color:#0A1E3C;font-size:9px;padding:3px;border:1px solid #99a }
  td { border:1px solid #99a;padding:3px 5px;font-size:9.5px } td.c { text-align:center }
  .assin { display:flex;gap:24px;margin-top:16px } .assin > div { flex:1;text-align:center;font-size:9px }
  .aut { font-size:7px;color:#555;margin-top:2px;line-height:1.3 }
  .rodape { margin-top:10px;font-size:8.5px;color:#333;border:1px solid #99a;padding:6px 8px;background:#f8fafc;line-height:1.5 }
  .footer { margin-top:8px;display:flex;justify-content:space-between;font-size:8px;color:#777 }
</style></head><body>
<div class="top">
  <div class="titulo">
    <div class="logobox">${logoUri ? `<img src="${logoUri}" alt="logo"/>` : ""}</div>
    <span class="t">ORDEM DE SERVIÇO - OS<small>Conforme item 1.7, letra "b", NR-01 da Portaria 3.214/78</small></span>
    <div class="sp">REVISÃO: 00</div>
  </div>
  <div class="grid">
    <div><b>EMPRESA:</b> ${esc(d.empresa?.razaoSocial || "")}</div>
    <div><b>CNPJ:</b> ${esc(d.empresa?.cnpj || "")}</div>
    <div><b>NOME:</b> ${esc(d.funcionario.nomeCompleto)}</div>
    <div><b>CPF:</b> ${esc(fmtCpf(d.funcionario.cpf))}</div>
    <div><b>FUNÇÃO:</b> ${esc(d.funcionario.funcao || "—")}${d.cbo ? ` &nbsp; <b>CBO:</b> ${esc(d.cbo)}` : ""}</div>
    <div>${d.funcionario.dataNascimento ? `<b>DATA DE NASC.:</b> ${fmtDate(d.funcionario.dataNascimento)} &nbsp; ` : ""}${d.funcionario.dataAdmissao ? `<b>ADMISSÃO:</b> ${fmtDate(d.funcionario.dataAdmissao)}` : ""}</div>
  </div>
</div>

${d.descricaoFuncao ? `<h3>DESCRIÇÃO DA FUNÇÃO</h3><div class="box">${esc(d.descricaoFuncao).replace(/\r?\n/g, "<br/>")}</div>` : ""}

<h3>ORDEM DE SERVIÇO</h3>
<div class="box">${osHtml}</div>

${d.episEntregues.length > 0 ? `<h3>EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL (EPIs ENTREGUES)</h3>
<table><thead><tr><th>EPI</th><th style="width:90px">C.A.</th></tr></thead><tbody>${epiRows}</tbody></table>` : ""}

${d.treinamentos.length > 0 ? `<h3>TREINAMENTOS</h3>
<table><thead><tr><th style="width:70px">Norma</th><th>Treinamento</th><th style="width:80px">Realização</th></tr></thead><tbody>${trRows}</tbody></table>` : ""}

<h3>TERMO DE CIÊNCIA</h3>
<div class="box">${esc(TERMO_CIENCIA)}</div>

<div class="assin">
  <div>${assinaturaBloco}</div>
  <div><div style="border-top:1px solid #333;margin-top:34px;padding-top:3px">Responsável / Técnico de Segurança do Trabalho</div></div>
</div>

${d.assinatura ? `<div class="rodape"><b>AUTENTICAÇÃO DIGITAL:</b> A assinatura desta Ordem de Serviço foi coletada eletronicamente, com registro de data/hora, endereço IP e hash criptográfico SHA-256 da imagem da assinatura, garantindo integridade e autenticidade nos termos da MP 2.200-2/2001 (ICP-Brasil) e NR-01 do MTE.</div>` : ""}
<div class="footer"><span>ERP Gestão Integrada — Ordem de Serviço Digital (NR-01)</span><span>Emitido em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>
</body></html>`;
}

export async function launchBrowser() {
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function pdfFromHtml(browser: any, html: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on("request", (req: any) => { req.url().startsWith("data:") || req.url() === "about:blank" ? req.continue() : req.abort(); });
    await page.setContent(html, { waitUntil: "load" });
    const raw = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", right: "12mm", bottom: "12mm", left: "12mm" } });
    return Buffer.from(raw);
  } finally {
    await page.close().catch(() => {});
  }
}

/** PDF da OS de UM funcionário. null se não houver conteúdo. Tenant guard é do CHAMADOR. */
export async function gerarOrdemServicoPdf(companyId: number, employeeId: number): Promise<Buffer | null> {
  const html = await montarHtmlOs(companyId, employeeId);
  if (!html) return null;
  const browser = await launchBrowser();
  try {
    return await pdfFromHtml(browser, html);
  } finally {
    await browser.close();
  }
}

/** OS de vários funcionários com UM Chromium (dossiê ZIP em lote). */
export async function gerarOrdensServicoPdfLote(
  companyId: number,
  employeeIds: number[],
  onPdf: (employeeId: number, buf: Buffer) => void | Promise<void>,
): Promise<void> {
  if (employeeIds.length === 0) return;
  let browser: any = null;
  try {
    for (const id of employeeIds) {
      try {
        const html = await montarHtmlOs(companyId, id);
        if (!html) continue;
        if (!browser) browser = await launchBrowser();
        await onPdf(id, await pdfFromHtml(browser, html));
      } catch (e) {
        console.warn(`[OrdemServicoPdf] Falha ao gerar OS emp=${id}:`, e);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
