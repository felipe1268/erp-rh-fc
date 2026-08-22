// Rev. 5009 — PDF da PRÉVIA do contrato de terceiros (antes da aprovação).
// Pedido do user: imprimir, baixar e enviar por WhatsApp a prévia gerada na
// Cotação. Mesmo padrão do comunicado-pdf (rota GET autenticada + tenancy
// check + Puppeteer com JS off e requests bloqueados) e mesmo merge do PDF
// assinado: contrato → folha de rosto "ANEXO I" → páginas da proposta.
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { userCompanies } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { dbRetrieve } from "../storage";
import { launchBrowser } from "../services/ordemServicoPdf";
import { buildFcDocument } from "../../client/src/lib/fcDocumentTemplate";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const _window = new JSDOM("").window;
const DOMPurify = createDOMPurify(_window as any);
// Mesma allowlist do comunicado-pdf: defesa em profundidade antes do Puppeteer
// (o corpo vem de template editável pelo admin na Central de Documentos).
// Rev. 5018 — Title Case p/ nomes nas assinaturas (mesma regra do client).
function _tituloNomeAssinatura(v: any): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || /^_+$/.test(s)) return s;
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.toLowerCase().split(/\s+/).map((w, i) =>
    i > 0 && minusculas.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(" ");
}

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

async function uploadsDataUri(url?: string | null): Promise<string> {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^data:image\//i.test(u)) return u;
  try {
    const m = u.match(/^\/uploads\/([^?]+)/);
    if (m) {
      const r = await dbRetrieve(decodeURIComponent(m[1]));
      if (r) return `data:${r.contentType || "image/png"};base64,${r.buffer.toString("base64")}`;
    }
    // Rev. 5022 — logo pode ser um asset PÚBLICO do app (ex.: "/logo-fc.jpg").
    // O Puppeteer roda com requests bloqueados, então embute do disco. Guard
    // anti-traversal: só nome de arquivo simples direto em client/public.
    const pm = u.match(/^\/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif|svg))(?:\?.*)?$/i);
    if (pm && !pm[1].includes("..")) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const abs = path.join(process.cwd(), "client", "public", pm[1]);
      const buf = await fs.readFile(abs);
      const ext = pm[1].split(".").pop()!.toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  } catch { /* sem logo */ }
  return "";
}

// Rev. 5009 (code review) — o endpoint abre Chromium a cada request: limita a
// 1 geração simultânea por usuário + intervalo mínimo de 5s entre gerações
// (in-memory; suficiente p/ single-instance).
const _inFlight = new Set<number>();
const _lastHit = new Map<number, number>();

export function registerContratoPreviewPdfRoute(app: Express) {
  app.get("/api/contrato-preview-pdf", async (req: Request, res: Response) => {
    try {
      let user: { id: number; role: string; name?: string };
      try {
        const authUser = await sdk.authenticateRequest(req);
        user = {
          id: (authUser as Record<string, number>).id,
          role: (authUser as Record<string, string>).role,
          // Rev. 5022 — LGPD: nome do emissor vai no rodapé de cada página
          name: (authUser as any)?.name || (authUser as any)?.email || undefined,
        };
      } catch {
        res.status(401).send("Não autenticado");
        return;
      }

      // Throttle por usuário (Chromium é caro)
      if (_inFlight.has(user.id)) {
        res.status(429).send("Já existe uma geração de PDF em andamento — aguarde concluir");
        return;
      }
      const agora = Date.now();
      if (agora - (_lastHit.get(user.id) || 0) < 5000) {
        res.status(429).send("Aguarde alguns segundos antes de gerar outro PDF");
        return;
      }
      _inFlight.add(user.id);
      _lastHit.set(user.id, agora);
      res.on("close", () => _inFlight.delete(user.id));

      const cotacaoId = parseInt(String(req.query.cotacaoId), 10);
      const companyId = parseInt(String(req.query.companyId), 10);
      const modo = String(req.query.modo || "abrir"); // abrir (inline) | baixar (attachment)
      // Rev. 5013 — título editável do contrato (digitado na prévia)
      const tituloContrato = String(req.query.titulo || "").trim().slice(0, 200);
      if (isNaN(cotacaoId) || isNaN(companyId)) {
        res.status(400).send("Parâmetros inválidos");
        return;
      }

      const db = (await getDb())!;
      if (user.role !== "admin_master") {
        const link = await db.select({ id: userCompanies.id }).from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, companyId)));
        if (link.length === 0) {
          res.status(403).send("Sem permissão para acessar esta empresa");
          return;
        }
      }

      // Reusa EXATAMENTE a mesma fonte da prévia da tela (nada é criado).
      const { appRouter } = await import("../routers");
      const caller = appRouter.createCaller({ user: { id: user.id, role: user.role, companyId } } as any);
      let data: any;
      try {
        data = await caller.terceiroContratos.previewContratoFromCotacao({ cotacaoId, companyId, tituloContrato: tituloContrato || undefined });
      } catch (e: any) {
        res.status(422).send(String(e?.message || "Não foi possível montar a prévia do contrato"));
        return;
      }

      const meta = data?.docMeta || {};
      const emp = meta.empresa || {};
      const logoDataUri = (await uploadsDataUri(emp.logoUrl)) || "";
      const hoje = new Date().toLocaleDateString("pt-BR");

      const html = buildFcDocument({
        espacamentoAmplo: true,
        empresa: {
          razaoSocial: emp.razaoSocial || undefined,
          nomeFantasia: emp.nomeFantasia || undefined,
          cnpj: emp.cnpj || undefined,
          endereco: emp.endereco || undefined,
          cidade: emp.cidade || undefined,
          estado: emp.estado || undefined,
          logoUrl: logoDataUri || undefined,
        },
        titulo: "CONTRATO TERCEIROS",
        numero: data?.numeroContrato || "S/N",
        dataEmissao: hoje,
        assunto: { valor: tituloContrato || "Contrato de Prestação de Serviços" },
        corpoHtml: sanitizeServerHtml(String(data?.html || "")),
        assinaturas: {
          localData: meta.localData || undefined,
          // Rev. 5018 — mesma padronização de caixa dos nomes da prévia no client.
          partes: [
            { nome: _tituloNomeAssinatura(meta.contratadaNome) || "CONTRATADA", subtitulo: meta.contratadaCnpj ? `CNPJ: ${meta.contratadaCnpj} — CONTRATADA` : "CONTRATADA" },
            { nome: _tituloNomeAssinatura(meta.gestorProjetoNome) || "____________________", subtitulo: "Gestor do Projeto" },
            { nome: _tituloNomeAssinatura(meta.financeiroNome) || "____________________", subtitulo: "Responsável Financeiro" },
            { nome: _tituloNomeAssinatura((meta as any).contratanteRepresentante || emp.razaoSocial) || "____________________", subtitulo: "Sócio Administrador — CONTRATANTE" },
          ],
          testemunhas: true,
        },
        // Rev. 5022 — LGPD: registra o NOME do usuário que emitiu o documento.
        geradoPor: String(user.name || "Sistema"),
        pageTitle: `Prévia do Contrato ${data?.numeroContrato || ""}`,
        logoSrc: logoDataUri || undefined,
        forSign: true, // sem botão/script — vai pro Puppeteer com JS off
        // Rev. 5023 — o rodapé LGPD deste PDF é o footerTemplate nativo abaixo;
        // desliga o do CSS ou saem os dois sobrepostos (print do user 12/08).
        omitLgpdPageFooter: true,
      });

      const browser = await launchBrowser();
      let pdfBuf: Buffer;
      try {
        const page = await browser.newPage();
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on("request", (r) => {
          const u = r.url();
          if (u.startsWith("data:") || u === "about:blank") r.continue();
          else r.abort();
        });
        await page.setContent(html, { waitUntil: "networkidle0" });
        // Rev. 5022b — LGPD: rodapé por página via footerTemplate NATIVO (vive
        // na MARGEM do PDF, nunca sobrepõe o texto). O do CSS foi desligado no
        // buildFcDocument via omitLgpdPageFooter (addStyleTag não cobria @page).
        const lgpdTxt = `Documento emitido por ${user.name || "Sistema"} em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })} — ERP Gestão Integrada · Registro LGPD`;
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const raw = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "10mm", right: "10mm", bottom: "16mm", left: "10mm" },
          displayHeaderFooter: true,
          headerTemplate: "<div></div>",
          footerTemplate: `<div style="width:100%;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#9ca3af;">${esc(lgpdTxt)}</div>`,
        });
        pdfBuf = Buffer.from(raw);
        await page.close();
      } finally {
        await browser.close();
      }

      // Anexos — folha de rosto + páginas emendadas, na numeração oficial do
      // contrato (Anexo I proposta; II projetos por disciplina, cada disciplina
      // com folha separadora própria; III cronograma; IV+ outros). Rev. 5019.
      // Falha em anexo NÃO bloqueia o PDF do contrato.
      try {
        const { listarAnexosContrato } = await import("./terceiroContratos");
        const lista = listarAnexosContrato(data?.anexosContrato || null);
        const propostaUrl: string = String(data?.propostaUrl || "");
        const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
        const doc = await PDFDocument.load(pdfBuf);
        const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
        const fontR = await doc.embedFont(StandardFonts.Helvetica);
        const A4W = 595.28, A4H = 841.89;
        const navy = rgb(27 / 255, 42 / 255, 74 / 255);
        let mudou = false;

        const addCapa = (titulo: string, subtitulo?: string) => {
          const capa = doc.addPage([A4W, A4H]);
          const cy = A4H / 2;
          const sub1 = "DOCUMENTO COMPLEMENTAR — PARTE INTEGRANTE DO CONTRATO";
          capa.drawText(sub1, { x: (A4W - fontR.widthOfTextAtSize(sub1, 8)) / 2, y: cy + 52, size: 8, font: fontR, color: rgb(0.6, 0.64, 0.69) });
          capa.drawRectangle({ x: 40, y: cy - 4, width: A4W - 80, height: 40, color: navy });
          let size = 13;
          while (size > 8 && fontB.widthOfTextAtSize(titulo, size) > A4W - 100) size -= 1;
          capa.drawText(titulo, { x: (A4W - fontB.widthOfTextAtSize(titulo, size)) / 2, y: cy + 10, size, font: fontB, color: rgb(1, 1, 1) });
          if (subtitulo) {
            capa.drawText(subtitulo, { x: (A4W - fontR.widthOfTextAtSize(subtitulo, 10)) / 2, y: cy - 26, size: 10, font: fontR, color: rgb(0.35, 0.4, 0.47) });
          }
          mudou = true;
        };

        // Tenant guard (code review, defesa em profundidade): anexos do wizard
        // só podem apontar p/ chaves geradas pelo uploadAnexoContrato DESTA
        // cotação/empresa. A proposta (Anexo I) segue a URL vinda do servidor.
        const prefixoWizard = new RegExp(`^/uploads/cotacoes/${companyId}/${cotacaoId}/contrato-anexo-[A-Za-z0-9]+\\.pdf$`);

        // Carrega o arquivo ANTES de criar qualquer capa — assim, anexo sumido
        // ou inválido não deixa folha de rosto órfã no PDF (regressão apontada
        // pela revisão). Devolve uma função que emenda as páginas, ou null.
        const carregarArquivo = async (url: string, exigirPrefixo: boolean): Promise<null | (() => Promise<void>)> => {
          const u = String(url || "");
          if (exigirPrefixo && !prefixoWizard.test(u)) {
            console.error("[ContratoPreviewPdf] anexo fora do prefixo da cotação — ignorado:", u);
            return null;
          }
          const mm = u.match(/^\/uploads\/([^?]+)/);
          if (!mm) return null;
          const file = await dbRetrieve(decodeURIComponent(mm[1]));
          if (!file) return null;
          const bytes = file.buffer;
          const ct = (file.contentType || "").toLowerCase();
          const isPdf = ct.includes("pdf") || /\.pdf(\?|$)/i.test(u)
            || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
          const isPng = ct.includes("png") || /\.png(\?|$)/i.test(u);
          const isJpg = ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g(\?|$)/i.test(u);
          if (isPdf) {
            let anexo: any;
            try { anexo = await PDFDocument.load(bytes, { ignoreEncryption: true }); } catch { return null; }
            return async () => {
              const pages = await doc.copyPages(anexo, anexo.getPageIndices());
              for (const p of pages) doc.addPage(p);
              mudou = true;
            };
          }
          if (isPng || isJpg) {
            return async () => {
              const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
              const M = 28;
              const page2 = doc.addPage([A4W, A4H]);
              const scale = Math.min((A4W - 2 * M) / img.width, (A4H - 2 * M) / img.height, 1);
              page2.drawImage(img, {
                x: (A4W - img.width * scale) / 2,
                y: (A4H - img.height * scale) / 2,
                width: img.width * scale,
                height: img.height * scale,
              });
              mudou = true;
            };
          }
          return null;
        };

        for (const anexo of lista) {
          try {
            if (anexo.tipo === "proposta") {
              const emendar = await carregarArquivo(propostaUrl, false);
              if (!emendar) continue;
              addCapa(`ANEXO ${anexo.numero} — PROPOSTA COMERCIAL DA CONTRATADA`);
              await emendar();
            } else if (anexo.tipo === "projetos") {
              // pré-carrega tudo; disciplina sem arquivo válido fica fora, e a
              // capa geral só entra se sobrou pelo menos uma disciplina
              const discsOk: Array<{ nome: string; emendas: Array<() => Promise<void>> }> = [];
              for (const disc of anexo.disciplinas || []) {
                const emendas: Array<() => Promise<void>> = [];
                for (const a of disc.arquivos) {
                  const em = await carregarArquivo(a.url, true);
                  if (em) emendas.push(em);
                }
                if (emendas.length) discsOk.push({ nome: disc.disciplina, emendas });
              }
              if (!discsOk.length) continue;
              addCapa(`ANEXO ${anexo.numero} — PROJETOS`);
              for (const disc of discsOk) {
                addCapa(`ANEXO ${anexo.numero} — PROJETOS: ${disc.nome.toUpperCase()}`, `${disc.emendas.length} arquivo${disc.emendas.length > 1 ? "s" : ""}`);
                for (const em of disc.emendas) await em();
              }
            } else {
              const emendas: Array<() => Promise<void>> = [];
              for (const a of anexo.arquivos || []) {
                const em = await carregarArquivo(a.url, true);
                if (em) emendas.push(em);
              }
              if (!emendas.length) continue;
              addCapa(`ANEXO ${anexo.numero} — ${anexo.titulo.toUpperCase()}`);
              for (const em of emendas) await em();
            }
          } catch (e) {
            console.error(`[ContratoPreviewPdf] anexo ${anexo.numero} falhou (segue sem):`, e);
          }
        }
        if (mudou) pdfBuf = Buffer.from(await doc.save());
      } catch (e) {
        console.error("[ContratoPreviewPdf] anexos falharam (segue sem):", e);
      }

      const numSafe = String(data?.numeroContrato || `COT-${cotacaoId}`).replace(/\//g, "-").replace(/[^a-zA-Z0-9_-]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${modo === "baixar" ? "attachment" : "inline"}; filename="Previa_Contrato_${numSafe}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(pdfBuf.length));
      res.send(pdfBuf);
    } catch (err) {
      console.error("[ContratoPreviewPdf] Erro ao gerar PDF:", err);
      res.status(500).send("Erro interno ao gerar o PDF da prévia");
    }
  });
}
