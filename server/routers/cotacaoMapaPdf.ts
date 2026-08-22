// Rev. 5081 — PDF real do Mapa de Cotação (Puppeteer) para envio via WhatsApp.
// O print do navegador no iPad muda a formatação; aqui o MESMO HTML da aba de
// impressão é renderizado server-side em A4 paisagem, preservando o layout.
// Mesmo padrão de segurança do comunicadoPdf.ts: rota autenticada + tenancy check,
// DOMPurify server-side, JS desligado e todos os requests externos bloqueados.
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { userCompanies, comprasCotacoes, comprasSolicitacoes } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { randomUUID } from "crypto";

// Rev. 5092 — cache curto de PDFs gerados p/ download com nome de arquivo na URL
const pdfCache = new Map<string, { buf: Buffer; nome: string; userId: number; exp: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pdfCache) if (v.exp < now) pdfCache.delete(k);
}, 60_000).unref();

const _window = new JSDOM("").window;
const DOMPurify = createDOMPurify(_window as any);

function sanitizeMapaHtml(s: string): string {
  // HTML gerado pelo nosso próprio cliente (tabela + <style>). Sanitiza mesmo assim:
  // permite estrutura de documento e style, remove qualquer conteúdo ativo.
  return DOMPurify.sanitize(s, {
    WHOLE_DOCUMENT: true,
    ALLOWED_TAGS: [
      "html", "head", "body", "title", "meta", "style",
      "div", "span", "p", "br", "hr", "b", "i", "u", "strong", "em", "small", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col",
      "ul", "ol", "li", "img",
    ],
    ALLOWED_ATTR: ["style", "class", "colspan", "rowspan", "charset", "lang", "src", "alt", "width", "height"],
    ALLOW_DATA_ATTR: false,
  });
}

export function registerCotacaoMapaPdfRoute(app: Express) {
  app.post("/api/cotacao-mapa-pdf", async (req: Request, res: Response) => {
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

      const cotacaoId = parseInt(String(req.body?.cotacaoId ?? ""), 10);
      const htmlRaw = String(req.body?.html ?? "");
      if (isNaN(cotacaoId) || !htmlRaw || htmlRaw.length > 3_000_000) {
        res.status(400).send("Parâmetros inválidos");
        return;
      }

      const db = (await getDb())!;
      const [cot] = await db.select({ companyId: comprasCotacoes.companyId, numeroCotacao: comprasCotacoes.numeroCotacao, solicitacaoId: comprasCotacoes.solicitacaoId })
        .from(comprasCotacoes).where(eq(comprasCotacoes.id, cotacaoId));
      if (!cot) { res.status(404).send("Cotação não encontrada"); return; }

      if (user.role !== "admin_master" && user.role !== "admin") {
        const link = await db.select({ id: userCompanies.id }).from(userCompanies)
          .where(and(eq(userCompanies.userId, user.id), eq(userCompanies.companyId, cot.companyId)));
        if (link.length === 0) {
          res.status(403).send("Sem permissão para acessar esta empresa");
          return;
        }
      }

      const html = sanitizeMapaHtml(htmlRaw);

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
          landscape: true,
          printBackground: true,
          // Rev. 5083 — escala reduzida: no tamanho natural o texto ficava grande
          // demais e as descrições quebravam em 2 linhas (feedback do user).
          scale: 0.72,
          margin: { top: "8mm", right: "8mm", bottom: "10mm", left: "8mm" },
        });
        pdfBuf = Buffer.from(raw);
        await page.close();
      } finally {
        await browser.close();
      }

      // Rev. 5091 — nome do arquivo com o número da SOLICITAÇÃO (pedido do user) + cotação
      let scNum = "";
      if (cot.solicitacaoId) {
        const [sc] = await db.select({ numeroSc: comprasSolicitacoes.numeroSc })
          .from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
        scNum = String(sc?.numeroSc ?? "").replace(/[^a-zA-Z0-9-]/g, "-");
      }
      const numSafe = String(cot.numeroCotacao || `COT-${cotacaoId}`).replace(/[^a-zA-Z0-9-]/g, "-");
      const nomeArq = scNum ? `Mapa_${scNum}_${numSafe}.pdf` : `Mapa_${numSafe}.pdf`;
      // Rev. 5092 — modo URL: o Safari/iPad ignora o nome de File em blob: URLs (mostra o
      // UUID do blob no visualizador/compartilhar). Guardamos o PDF por 5 min e devolvemos
      // uma URL GET que TERMINA no nome do arquivo — aí o nome sai certo em todo lugar.
      if (String(req.body?.retorno ?? "") === "url") {
        const token = randomUUID();
        pdfCache.set(token, { buf: pdfBuf, nome: nomeArq, userId: user.id, exp: Date.now() + 5 * 60_000 });
        res.json({ url: `/api/cotacao-mapa-pdf/arquivo/${token}/${encodeURIComponent(nomeArq)}` });
        return;
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nomeArq}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(pdfBuf.length));
      res.send(pdfBuf);
    } catch (err) {
      console.error("[CotacaoMapaPdf] Erro ao gerar PDF:", err);
      res.status(500).send("Erro interno ao gerar o PDF");
    }
  });

  // Rev. 5092 — download nomeado: URL termina no nome do arquivo (Safari usa esse nome).
  // Token aleatório de uso curto (5 min), amarrado ao usuário autenticado que gerou.
  app.get("/api/cotacao-mapa-pdf/arquivo/:token/:nome", async (req: Request, res: Response) => {
    try {
      let userId: number;
      try {
        const authUser = await sdk.authenticateRequest(req);
        userId = (authUser as Record<string, number>).id;
      } catch {
        res.status(401).send("Não autenticado");
        return;
      }
      const entry = pdfCache.get(String(req.params.token || ""));
      if (!entry || entry.exp < Date.now() || entry.userId !== userId) {
        res.status(404).send("PDF expirado — gere novamente.");
        return;
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${entry.nome}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", String(entry.buf.length));
      res.send(entry.buf);
    } catch (err) {
      console.error("[CotacaoMapaPdf] Erro no download:", err);
      res.status(500).send("Erro interno");
    }
  });
}
