// Forçar timezone de Brasília (UTC-3) no Node.js
process.env.TZ = 'America/Sao_Paulo';

import "dotenv/config";
import compression from "compression";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDownloadSSTRoute } from "../routers/downloadSST";
import { registerDownloadOCRoute } from "../routers/downloadOC";
import { registerPortalDocumentosRoute } from "../routers/portalDocumentos";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { securityHeaders, apiRateLimit, authRateLimit } from "../security";
import { sdk } from "./sdk";
import { DOCUMENT_TEMPLATES_META, getSeedTemplate } from "../../shared/documentTemplates";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Gzip/Brotli compression — must be FIRST for all routes
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }));
  // Security headers (XSS, clickjacking, MIME sniffing, HSTS)
  app.use(securityHeaders());
  // Configure body parser with larger size limit for file uploads
  // Rev. 1765 — limites de upload removidos a pedido do usuário ('quero ilimitado').
  // Mantemos um teto técnico alto pra evitar OOM no container (2GB), mas na prática
  // libera qualquer arquivo de obra (DWG/RVT/IFC/PDF). Body parser do Express opera
  // sobre payload base64 dentro do JSON do tRPC.
  app.use(express.json({ limit: "2gb" }));
  app.use(express.urlencoded({ limit: "2gb", extended: true }));
  // Rate limiting para autenticação (mais restritivo: 20 req/min)
  app.use("/api/oauth", authRateLimit);
  // Rate limiting para API (200 req/min por IP+path)
  app.use("/api/trpc", apiRateLimit);
  // Diagnóstico: loga requests para processarPdfLote
  app.use("/api/trpc", (req: any, _res: any, next: any) => {
    if (req.url && req.url.includes("processarPdfLote")) {
      const bodySize = req.body ? JSON.stringify(req.body).length : 0;
      console.log(`[tRPC-diag] ${req.method} ${req.url} body=${bodySize}B`);
    }
    next();
  });
  // Endpoint de diagnóstico: POST com base64 de PDF — simula processarPdfLote sem autenticação
  app.post("/api/diag/pdf-parse", async (req: any, res: any) => {
    try {
      const { base64 } = req.body;
      const mod = await import("pdf-parse");
      const pdfParse = mod.default || mod;
      const buf = base64 ? Buffer.from(base64, "base64") : (() => {
        const fs = require("fs"), path = require("path");
        return fs.readFileSync(path.join(process.cwd(), "node_modules/pdf-parse/test/data/01-valid.pdf"));
      })();
      const parsed = await pdfParse(buf);
      res.json({ ok: true, chars: parsed.text.length, pages: parsed.numpages, preview: parsed.text.substring(0, 200) });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  app.get("/api/diag/pdf-parse", async (_req: any, res: any) => {
    try {
      const mod = await import("pdf-parse");
      const pdfParse = mod.default || mod;
      const fs = await import("fs");
      const path = await import("path");
      const samplePdf = path.join(process.cwd(), "node_modules/pdf-parse/test/data/01-valid.pdf");
      const buf = fs.readFileSync(samplePdf);
      const parsed = await pdfParse(buf);
      res.json({ ok: true, type: typeof pdfParse, chars: parsed.text.length, pages: parsed.numpages });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message, stack: e.stack?.substring(0, 500) });
    }
  });
  // Endpoint de captura de erros do client — para debug em iPad/mobile sem devtools
  app.post("/api/diag/client-error", apiRateLimit, express.json({ limit: "200kb" }), (req: any, res: any) => {
    try {
      const { kind, message, stack, url, ua, extra } = req.body || {};
      console.error(`[CLIENT ERROR] kind=${kind} url=${url} ua=${(ua || "").substring(0, 80)} msg=${message}`);
      if (stack) console.error(`[CLIENT ERROR stack]`, stack.substring(0, 1500));
      if (extra) console.error(`[CLIENT ERROR extra]`, JSON.stringify(extra).substring(0, 1000));
    } catch {}
    res.json({ ok: true });
  });
  // Endpoint de diagnóstico financeiro — consulta Neon DB diretamente
  app.get("/api/diag/financial-neon", async (_req: any, res: any) => {
    try {
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(500).json({ ok: false, error: "DB not available" });

      const companiesRes = await db.execute(sql`
        SELECT id, "razaoSocial", cnpj FROM companies
        WHERE "razaoSocial" ILIKE '%engenharia%' OR "razaoSocial" ILIKE '%FC%'
        ORDER BY id LIMIT 20
      `);
      const companies = (companiesRes as any)?.rows ?? companiesRes;

      const projRes = await db.execute(sql`
        SELECT pp.id, pp.company_id, pp.nome, pp.obra_id, pp.valor_contrato,
               COUNT(pr.id) as revisoes,
               (SELECT COUNT(*) FROM planejamento_atividades pa
                JOIN planejamento_revisoes pr2 ON pa.revisao_id = pr2.id
                WHERE pr2.projeto_id = pp.id) as atividades
        FROM planejamento_projetos pp
        LEFT JOIN planejamento_revisoes pr ON pr.projeto_id = pp.id
        GROUP BY pp.id, pp.company_id, pp.nome, pp.obra_id, pp.valor_contrato
        ORDER BY pp.id LIMIT 30
      `);
      const projetos = (projRes as any)?.rows ?? projRes;

      const obrasRes = await db.execute(sql`
        SELECT id, nome FROM obras
        WHERE "deletedAt" IS NULL ORDER BY id LIMIT 20
      `);
      const obras = (obrasRes as any)?.rows ?? obrasRes;

      const finRes = await db.execute(sql`
        SELECT company_id, COUNT(*) as entries, SUM(valor_previsto) as total_previsto
        FROM financial_entries
        GROUP BY company_id ORDER BY entries DESC LIMIT 10
      `);
      const financial = (finRes as any)?.rows ?? finRes;

      const finDetailRes = await db.execute(sql`
        SELECT origem_modulo, tipo, status, COUNT(*) as qtd,
               SUM(valor_previsto) as total_previsto,
               MIN(data_competencia) as mais_antiga,
               MAX(data_competencia) as mais_recente
        FROM financial_entries
        WHERE company_id = 60002
        GROUP BY origem_modulo, tipo, status
        ORDER BY qtd DESC
      `);
      const finDetail = (finDetailRes as any)?.rows ?? finDetailRes;

      const finCronRes = await db.execute(sql`
        SELECT data_competencia, COUNT(*) as qtd, SUM(valor_previsto) as total
        FROM financial_entries
        WHERE company_id = 60002 AND origem_modulo = 'cronograma_atividade'
        GROUP BY data_competencia ORDER BY data_competencia LIMIT 20
      `);
      const finCronograma = (finCronRes as any)?.rows ?? finCronRes;

      res.json({ ok: true, companies, projetos, obras, financial, finDetail, finCronograma });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message, stack: e.stack?.substring(0, 500) });
    }
  });

  // Endpoint para disparar importação do cronograma para empresa específica
  app.get("/api/diag/run-cronograma/:companyId", async (req: any, res: any) => {
    try {
      const companyId = Number(req.params.companyId);
      const { importAtividadesCronogramaToFinancial } = await import("../services/financialIntegrationBridge");
      const count = await importAtividadesCronogramaToFinancial(companyId);
      res.json({ ok: true, companyId, imported: count });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message, stack: e.stack?.substring(0, 800) });
    }
  });

  app.get("/api/diag/run-medicoes-previstas/:companyId", async (req: any, res: any) => {
    try {
      const companyId = Number(req.params.companyId);
      const { importAllMedicoesPrevistaToFinancial } = await import("../services/financialIntegrationBridge");
      const count = await importAllMedicoesPrevistaToFinancial(companyId);
      res.json({ ok: true, companyId, imported: count });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message, stack: e.stack?.substring(0, 800) });
    }
  });

  // Endpoint de diagnóstico: mostra o estado real das atividades de cronograma no Neon
  app.get("/api/diag/cronograma-atividades/:companyId", async (req: any, res: any) => {
    try {
      const companyId = Number(req.params.companyId);
      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(500).json({ ok: false, error: "DB not available" });

      // Revisões dos projetos da empresa
      const revisoes = await db.execute(sql`
        SELECT pr.id, pr.projeto_id, pr.numero, pr.status, pp.nome AS projeto_nome
        FROM planejamento_revisoes pr
        JOIN planejamento_projetos pp ON pp.id = pr.projeto_id
        WHERE pp.company_id = ${companyId}
        ORDER BY pr.projeto_id, pr.numero DESC
      `);

      // Amostra de atividades para cada revisão (sem filtros)
      const ativSample = await db.execute(sql`
        SELECT pa.revisao_id, pa.id,
               pa.is_grupo, pa.disabled, pa.data_inicio, pa.data_fim,
               pa.peso_financeiro, pa.quantidade_planejada, pa.nome
        FROM planejamento_atividades pa
        JOIN planejamento_revisoes pr ON pr.id = pa.revisao_id
        JOIN planejamento_projetos pp ON pp.id = pr.projeto_id
        WHERE pp.company_id = ${companyId}
        LIMIT 30
      `);

      // Contagem por filtro para cada revisão
      const counts = await db.execute(sql`
        SELECT pa.revisao_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE pa.is_grupo = false) AS nao_grupo,
               COUNT(*) FILTER (WHERE pa.is_grupo = false AND pa.disabled = false) AS nao_disabled,
               COUNT(*) FILTER (WHERE pa.is_grupo = false AND pa.disabled = false
                                      AND pa.data_inicio IS NOT NULL AND pa.data_fim IS NOT NULL) AS com_datas,
               COUNT(*) FILTER (WHERE pa.is_grupo = false AND pa.disabled = false
                                      AND pa.data_inicio IS NOT NULL AND pa.data_fim IS NOT NULL
                                      AND (
                                        (pa.peso_financeiro IS NOT NULL AND pa.peso_financeiro::numeric > 0)
                                        OR (pa.quantidade_planejada IS NOT NULL AND pa.quantidade_planejada::numeric > 0)
                                      )) AS passam_filtro
        FROM planejamento_atividades pa
        JOIN planejamento_revisoes pr ON pr.id = pa.revisao_id
        JOIN planejamento_projetos pp ON pp.id = pr.projeto_id
        WHERE pp.company_id = ${companyId}
        GROUP BY pa.revisao_id
        ORDER BY pa.revisao_id
      `);

      const revisaoRows = (revisoes as any)?.rows ?? revisoes;
      const sampleRows = (ativSample as any)?.rows ?? ativSample;
      const countRows = (counts as any)?.rows ?? counts;

      // Checa orcamentos vinculados aos projetos
      const orcRes = await db.execute(sql`
        SELECT pp.id AS projeto_id, pp.nome AS projeto_nome, pp.orcamento_id,
               o.id AS orc_id, o.descricao, o."totalVenda", o."totalCusto", o.valor_negociado, o.status
        FROM planejamento_projetos pp
        LEFT JOIN orcamentos o ON o.id = pp.orcamento_id
        WHERE pp.company_id = ${companyId}
        ORDER BY pp.id
      `);
      const orcamentosLinked = (orcRes as any)?.rows ?? orcRes;

      // Checa orcamentos pelo obra_id quando orcamento_id não está setado
      const orcByObraRes = await db.execute(sql`
        SELECT pp.id AS projeto_id, pp.obra_id, o.id AS orc_id, o.descricao,
               o."totalVenda", o."totalCusto", o.valor_negociado, o.status
        FROM planejamento_projetos pp
        JOIN orcamentos o ON o."obraId" = pp.obra_id
        WHERE pp.company_id = ${companyId}
          AND o.deleted_at IS NULL
        ORDER BY pp.id, o.id DESC
      `);
      const orcByObra = (orcByObraRes as any)?.rows ?? orcByObraRes;

      res.json({ ok: true, revisoes: revisaoRows, amostra: sampleRows, contagens: countRows, orcamentosLinked, orcByObra });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message, stack: e.stack?.substring(0, 800) });
    }
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Download de arquivos SST em ZIP
  registerDownloadSSTRoute(app);
  registerDownloadOCRoute(app);
  registerPortalDocumentosRoute(app);

  // Upload multipart para documentos SST grandes (PGR/PCMSO/LTCAT — até 150MB)
  const multer = (await import("multer")).default;
  const sstUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });
  app.post("/api/upload/sst-document", sstUpload.single("file"), async (req: any, res: any) => {
    try {
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch (authErr: any) {
        console.error("[SST Upload] Auth falhou:", authErr?.message, "| Cookie header presente:", !!req.headers?.cookie);
        return res.status(401).json({ error: "Não autenticado" });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
      const tipo = (req.body.tipo || "sst").toLowerCase();
      const companyId = req.body.companyId || "0";
      const ext = file.originalname.split(".").pop() || "pdf";
      const key = `documentos/sst/${tipo}/${companyId}-${Date.now()}.${ext}`;
      const ct = ext === "pdf" ? "application/pdf" : file.mimetype || "application/octet-stream";
      const { storagePut: sPut } = await import("../storage");
      const { url } = await sPut(key, file.buffer, ct);

      let extracted: any = null;
      const doExtract = req.body.extract === "true" || req.body.extract === "1";
      if (doExtract && (ct === "application/pdf" || ct.startsWith("image/"))) {
        try {
          const { invokeAnthropicVision } = await import("../_core/llm");
          const base64 = file.buffer.toString("base64");
          const tipoDoc = (req.body.tipo || "SST").toUpperCase();
          const prompt = `Analise este documento de SST (tipo: ${tipoDoc}) e extraia as seguintes informações. Retorne APENAS um JSON válido, sem markdown, sem texto adicional:
{
  "descricao": "título ou descrição do documento (ex: PGR 2026 - Sede)",
  "dataElaboracao": "data de elaboração no formato YYYY-MM-DD ou null",
  "dataValidade": "data de validade no formato YYYY-MM-DD ou null",
  "responsavelElaboracao": "nome do responsável técnico pela elaboração ou null",
  "registroProfissional": "registro profissional CREA/CRM/CRQ do responsável ou null",
  "empresaElaboradora": "nome da empresa que elaborou o documento ou null",
  "observacoes": "informações adicionais relevantes encontradas no documento ou null"
}
Regras:
- Se a data de validade não estiver explícita, tente inferir (PGR/PCMSO geralmente valem 1 ano, LTCAT não tem validade fixa)
- Se não encontrar uma informação, use null
- Datas DEVEM estar no formato YYYY-MM-DD
- Procure por ART, registro no CREA, CRM, nome do engenheiro/médico/profissional responsável
- A descrição deve ser curta e identificar o documento (ex: "PGR 2026 - Sede Rio de Janeiro")`;

          const raw = await invokeAnthropicVision({
            prompt,
            base64,
            mimeType: ct,
            maxTokens: 1024,
          });
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extracted = JSON.parse(jsonMatch[0]);
          }
        } catch (aiErr: any) {
          console.error("[SST AI Extract] Erro na extração IA:", aiErr?.message);
        }
      }

      res.json({ url, fileName: file.originalname, extracted });
    } catch (err: any) {
      console.error("[SST Upload] Erro:", err);
      res.status(500).json({ error: err?.message || "Erro ao fazer upload" });
    }
  });

  // Rev. 2013 — Upload de vídeos de Integração SST SEM LIMITE de tamanho.
  // Pedido do usuário: "Quero poder subir vídeo sem limite de tamanho".
  // Estratégia: multer diskStorage (não trava RAM) + move pro server/uploads em disco
  // (servido pelo middleware estático em /uploads). Pula persist em DB base64 — pra arquivos
  // grandes (vídeos) isso destruiria o Postgres. Se houver storage externa configurada,
  // faz upload streaming via fetch + fs.createReadStream.
  const fsMod = (await import("fs")).default;
  const pathMod = (await import("path")).default;
  const osMod = (await import("os")).default;
  const tmpDir = pathMod.join(osMod.tmpdir(), "sst-video-uploads");
  if (!fsMod.existsSync(tmpDir)) fsMod.mkdirSync(tmpDir, { recursive: true });
  const sstVideoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, tmpDir),
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
    }),
    // SEM `limits.fileSize` — qualquer tamanho aceito.
  });
  app.post("/api/upload/sst-integracao-video", sstVideoUpload.single("file"), async (req: any, res: any) => {
    try {
      try { await sdk.authenticateRequest(req); }
      catch (authErr: any) {
        console.error("[SST Video Upload] Auth falhou:", authErr?.message);
        if (req.file?.path) { try { fsMod.unlinkSync(req.file.path); } catch {} }
        return res.status(401).json({ error: "Não autenticado" });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
      // Sanitização: companyId DEVE ser numérico estrito pra evitar path traversal.
      const companyIdRaw = String(req.body.companyId ?? "0");
      const companyId = /^\d+$/.test(companyIdRaw) ? companyIdRaw : "0";
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "video.mp4";
      const key = `sst/integracao/videos/${companyId}-${Date.now()}-${safeName}`;
      const ct = file.mimetype || "video/mp4";
      const localUploadsDir = pathMod.resolve(pathMod.join(process.cwd(), "server", "uploads"));
      const finalPath = pathMod.resolve(pathMod.join(localUploadsDir, key));
      // Defesa em profundidade: garante que o caminho final está DENTRO de server/uploads.
      if (!finalPath.startsWith(localUploadsDir + pathMod.sep)) {
        try { fsMod.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: "Caminho inválido" });
      }
      fsMod.mkdirSync(pathMod.dirname(finalPath), { recursive: true });
      try {
        fsMod.renameSync(file.path, finalPath);
      } catch (renameErr: any) {
        // EXDEV (cross-device): cai pro copyFile + unlink
        if (renameErr?.code === "EXDEV") {
          fsMod.copyFileSync(file.path, finalPath);
          try { fsMod.unlinkSync(file.path); } catch {}
        } else { throw renameErr; }
      }
      const url = `/uploads/${key}`;
      // Responde IMEDIATAMENTE com URL local — não bloqueia cliente esperando storage externa.
      res.json({ url, key, fileName: file.originalname, sizeBytes: file.size, contentType: ct });

      // Replicação OPCIONAL pra storage externa em background (fire-and-forget).
      // Usa openAsBlob (Node 19+) — Blob é backed por stream do disco, sem carregar tudo em RAM.
      setImmediate(async () => {
        try {
          const { ENV } = await import("./env");
          if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return;
          const uploadUrl = new URL("v1/storage/upload", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
          uploadUrl.searchParams.set("path", key);
          const { openAsBlob } = await import("fs");
          const blob = typeof openAsBlob === "function"
            ? await openAsBlob(finalPath, { type: ct })
            : new Blob([fsMod.readFileSync(finalPath)], { type: ct });
          const fd = new FormData();
          fd.append("file", blob, safeName);
          const resp = await fetch(uploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
            body: fd,
          });
          if (resp.ok) {
            console.log(`[SST Video Upload BG] Replicado pra storage externa (${file.size} bytes) key=${key}`);
          } else {
            console.warn(`[SST Video Upload BG] Storage externa falhou (${resp.status}) key=${key} — fica só local`);
          }
        } catch (extErr: any) {
          console.warn(`[SST Video Upload BG] Storage externa erro key=${key}: ${extErr?.message}`);
        }
      });
    } catch (err: any) {
      console.error("[SST Video Upload] Erro:", err);
      if (req.file?.path) { try { fsMod.unlinkSync(req.file.path); } catch {} }
      res.status(500).json({ error: err?.message || "Erro ao fazer upload do vídeo" });
    }
  });

  app.get("/api/diario-obra/foto/:id", async (req: any, res: any) => {
    try {
      const db = await (await import("../db")).getDb();
      const { sql } = await import("drizzle-orm");
      const result = (await db.execute(sql`
        SELECT f.foto_data, f.mime_type
        FROM diario_obra_fotos f
        JOIN diario_obra_relatorios r ON f.relatorio_id = r.id
        WHERE f.id = ${Number(req.params.id)}
      `)) as any;
      const row = (result.rows ?? result)?.[0];
      if (!row || !row.foto_data) return res.status(404).send("Foto não encontrada");
      res.setHeader("Content-Type", row.mime_type || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buf = Buffer.isBuffer(row.foto_data) ? row.foto_data : Buffer.from(row.foto_data);
      res.send(buf);
    } catch (e: any) {
      res.status(500).send("Erro: " + e.message);
    }
  });

  // Rev. 2453 — Comprovante de devolução de equipamento (PDF público assinado).
  // Acesso via /api/comprovante-devolucao/:eventoId/:token.pdf. O token é gerado
  // na hora da devolução em lote e gravado em equipamento_locado_eventos.
  // Locadora abre direto do link compartilhado no WhatsApp, sem login.
  app.get("/api/comprovante-devolucao/:eventoId/:token.pdf", async (req: any, res: any) => {
    try {
      const eventoId = Number(req.params.eventoId);
      const token = String(req.params.token || "");
      if (!Number.isFinite(eventoId) || !token) return res.status(400).send("ID/token inválido");
      const { getDb } = await import("../db");
      const { equipamentoLocadoEventos } = await import("../../drizzle/schema");
      const { eq: drizzleEq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(500).send("DB indisponível");
      const [ev] = await db.select().from(equipamentoLocadoEventos)
        .where(drizzleEq(equipamentoLocadoEventos.id, eventoId));
      if (!ev || ev.tipo !== "DEVOLUCAO_FORNECEDOR") return res.status(404).send("Comprovante não encontrado");
      if (!ev.pdfComprovanteToken || ev.pdfComprovanteToken !== token) {
        return res.status(403).send("Token inválido");
      }
      const { fetchReturnReceiptData, generateReturnReceiptPdf } = await import("../services/equipmentReturnReceiptPdf");
      const data = await fetchReturnReceiptData(eventoId);
      const doc = generateReturnReceiptPdf(data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="comprovante-devolucao-${eventoId}.pdf"`);
      doc.pipe(res);
      doc.end();
    } catch (e: any) {
      console.error("[comprovante-devolucao]", e);
      res.status(500).send(`Erro: ${e?.message || "desconhecido"}`);
    }
  });

  // Rev. 2465 — Comprovante de RECEBIMENTO de equipamento locado (PDF
  // público assinado). Espelha a rota de devolução: token gerado em
  // `locadoCriar` quando assinaturas são capturadas. Locadora abre direto
  // pelo link compartilhado no WhatsApp, sem login.
  app.get("/api/comprovante-recebimento/:eventoId/:token.pdf", async (req: any, res: any) => {
    try {
      const eventoId = Number(req.params.eventoId);
      const token = String(req.params.token || "");
      if (!Number.isFinite(eventoId) || !token) return res.status(400).send("ID/token inválido");
      const { getDb } = await import("../db");
      const { equipamentoLocadoEventos } = await import("../../drizzle/schema");
      const { eq: drizzleEq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(500).send("DB indisponível");
      const [ev] = await db.select().from(equipamentoLocadoEventos)
        .where(drizzleEq(equipamentoLocadoEventos.id, eventoId));
      if (!ev || ev.tipo !== "RECEBIMENTO") return res.status(404).send("Comprovante não encontrado");
      if (!ev.pdfComprovanteToken || ev.pdfComprovanteToken !== token) {
        return res.status(403).send("Token inválido");
      }
      const { fetchReceiptData, generateReceiptPdf } = await import("../services/equipmentReceiptPdf");
      const data = await fetchReceiptData(eventoId);
      const doc = generateReceiptPdf(data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="comprovante-recebimento-${eventoId}.pdf"`);
      doc.pipe(res);
      doc.end();
    } catch (e: any) {
      console.error("[comprovante-recebimento]", e);
      res.status(500).send(`Erro: ${e?.message || "desconhecido"}`);
    }
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "server/uploads")));

  app.use("/uploads", async (req: any, res: any) => {
    try {
      const { dbRetrieve } = await import("../storage");
      const key = req.path.replace(/^\/+/, '');
      const result = await dbRetrieve(key);
      if (result) {
        const localPath = path.join(process.cwd(), "server/uploads", key);
        const dir = path.dirname(localPath);
        const fs = await import("fs");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(localPath, result.buffer);
        res.setHeader("Content-Type", result.contentType);
        res.send(result.buffer);
        return;
      }
    } catch (e: any) {
      console.warn(`[Storage] DB fallback error: ${e.message}`);
    }
    res.status(404).send(`
      <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa">
        <div style="text-align:center;max-width:400px">
          <div style="font-size:48px;color:#dc3545;margin-bottom:16px">⚠️</div>
          <h2 style="color:#333">Arquivo não encontrado</h2>
          <p style="color:#666">Este arquivo não está mais disponível no servidor. Por favor, faça o upload novamente.</p>
          <a href="/" style="display:inline-block;margin-top:16px;padding:8px 24px;background:#4F46E5;color:white;border-radius:6px;text-decoration:none">Voltar ao Sistema</a>
        </div>
      </body></html>
    `);
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        const isFailedQuery = error.message.startsWith('Failed query:');
        if (isFailedQuery) {
          const drizzleErr = error.cause as any;
          const pgErr = drizzleErr?.cause || drizzleErr;
          const realError = pgErr?.message || pgErr?.code || error.message.substring(0, 150);
          console.error(`[tRPC Error] ${path}: DB error: ${realError}`);
        } else {
          const msg = error.message.length > 200 ? error.message.substring(0, 200) + '...' : error.message;
          console.error(`[tRPC Error] ${path}:`, msg);
        }
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  // Em produção (Cloud Run / Autoscale) é obrigatório escutar EXATAMENTE
  // na PORT recebida do ambiente e bind em 0.0.0.0; senão o health check
  // falha e o deploy é rejeitado. O fallback de "achar porta livre" é só
  // pra dev quando a 3000 está ocupada.
  const port = process.env.NODE_ENV === "production"
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Keep-alive otimizado para reduzir latência de conexão
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    // Bootstrap admin user and default company from env vars (Railway / fresh DB)
    import("./initSetup").then(m => m.initSetup()).catch(e => console.error("[InitSetup] Falha ao iniciar:", e));
    // Sincronizar revisões do changelog com o banco de dados
    import("../syncRevisions").then(m => m.syncRevisions()).catch(e => console.error("[SyncRevisions] Falha ao iniciar:", e));
    // Sincronizar colunas do schema Drizzle → banco Neon (ADD COLUMN IF NOT EXISTS)
    import("../syncSchema").then(m => m.syncSchema()).then(async () => {
      try {
        const { getDb } = await import("../db");
        const db = (await getDb())!;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE curriculos ADD COLUMN IF NOT EXISTS historico_status_json TEXT`);
        console.log(`[SyncSchema+] Coluna historico_status_json garantida na tabela curriculos.`);

        // Rev. 2898 — soft-delete de envelopes IntegraSign ("excluir" sem destruir registro
        // legal/assinaturas; substitui o hard DELETE). ADD COLUMN IF NOT EXISTS (R-001/R-007/R-010 OK).
        try {
          await db.execute(sql`ALTER TABLE integrasign_envelopes ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2898: coluna excluido_em garantida em integrasign_envelopes (soft-delete).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA integrasign_envelopes.excluido_em:`, e?.message || e); }

        // Rev. 2767 — "% Previsto" LITERAL por semana (Texto10 capturado em cada
        // upload da aba Avanço). Coluna JSON; ADD COLUMN IF NOT EXISTS (R-001/R-007/R-010 OK).
        try {
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS previsto_literal_json TEXT`);
          console.log(`[SyncSchema+] Rev. 2767: coluna previsto_literal_json garantida em planejamento_projetos.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_projetos.previsto_literal_json:`, e?.message || e); }

        // Rev. 2743/2745 — coluna "tabelasTotal" (camelCase, igual ao schema Drizzle) em backups (progresso 0-100%).
        // A Rev. 2743 criou erroneamente "tabelas_total" (snake_case), que o Drizzle/select não enxerga; aqui
        // garantimos a coluna camelCase correta. A coluna snake antiga (se existir) fica órfã/inerte (não removida — R-001/R-007/R-010).
        try {
          await db.execute(sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS "tabelasTotal" INTEGER DEFAULT 0 NOT NULL`);
          console.log(`[SyncSchema+] Rev. 2745: coluna "tabelasTotal" garantida em backups (progresso %).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA backups."tabelasTotal":`, e?.message || e); }

        // Rev. 2004 — Tabela de participações em DDS (Diálogo Diário de Segurança)
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS dds_participacoes_terceiros (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              func_terceiro_id INTEGER NOT NULL,
              data_dds DATE NOT NULL,
              tema VARCHAR(255) NOT NULL,
              instrutor VARCHAR(255),
              obra_id INTEGER,
              obra_nome VARCHAR(255),
              lista_presenca_url VARCHAR(500),
              observacoes TEXT,
              created_at TIMESTAMP DEFAULT NOW() NOT NULL,
              created_by VARCHAR(255),
              deleted_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_func_terc ON dds_participacoes_terceiros(company_id, func_terceiro_id, data_dds DESC)`);
          // Rev. 2024 — sessao_id (opcional) para vincular participação à sessão coletiva.
          await db.execute(sql`ALTER TABLE dds_participacoes_terceiros ADD COLUMN IF NOT EXISTS sessao_id INTEGER`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_part_terc_sessao ON dds_participacoes_terceiros(sessao_id) WHERE sessao_id IS NOT NULL`);
          console.log(`[SyncSchema+] Tabela dds_participacoes_terceiros garantida.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA dds_participacoes_terceiros:`, e?.message || e); }

        // Rev. 2551 — Convenção Coletiva com IA: análises + itens de auditoria.
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS convencao_analises (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              ano_referencia INTEGER NOT NULL,
              documento_url TEXT,
              documento_nome VARCHAR(255),
              extracao_bruta_json TEXT,
              extracao_revisada_json TEXT,
              status TEXT NOT NULL DEFAULT 'processando',
              erro_mensagem TEXT,
              sindicato VARCHAR(255),
              numero_cct VARCHAR(100),
              percentual_reajuste VARCHAR(10),
              piso_salarial VARCHAR(20),
              dissidio_id INTEGER,
              criado_por VARCHAR(255),
              criado_por_user_id INTEGER,
              aplicado_por VARCHAR(255),
              aplicado_em TIMESTAMP,
              created_at TIMESTAMP DEFAULT NOW() NOT NULL,
              updated_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ca_company_ano ON convencao_analises(company_id, ano_referencia)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ca_status ON convencao_analises(company_id, status)`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS convencao_analise_itens (
              id SERIAL PRIMARY KEY,
              analise_id INTEGER NOT NULL,
              company_id INTEGER NOT NULL,
              employee_id INTEGER NOT NULL,
              campo VARCHAR(30) NOT NULL,
              valor_anterior VARCHAR(30),
              valor_novo VARCHAR(30),
              aplicado_em TIMESTAMP,
              created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cai_analise ON convencao_analise_itens(analise_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cai_employee ON convencao_analise_itens(employee_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cai_company ON convencao_analise_itens(company_id)`);
          console.log(`[SyncSchema+] Rev. 2551: tabelas convencao_analises + convencao_analise_itens garantidas (Convenção Coletiva com IA).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA convencao_analises/itens:`, e?.message || e); }

        // Rev. 2805 — Liga/desliga de IA por módulo/empresa (Configurações › Inteligência Artificial).
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ai_module_config (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              modulo VARCHAR(40) NOT NULL,
              enabled SMALLINT DEFAULT 1 NOT NULL,
              updated_by VARCHAR(255),
              updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
              created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_module_company ON ai_module_config(company_id, modulo)`);
          console.log(`[SyncSchema+] Rev. 2805: tabela ai_module_config garantida (liga/desliga IA por módulo).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA ai_module_config:`, e?.message || e); }

        // Rev. 2887 — itens EXTRAS (custom) por link de coleta de campo.
        try {
          await db.execute(sql`ALTER TABLE coleta_rh_sessoes ADD COLUMN IF NOT EXISTS itens_custom_json TEXT`);
          console.log(`[SyncSchema+] Rev. 2887: coluna itens_custom_json garantida em coleta_rh_sessoes.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA coleta_rh_sessoes.itens_custom_json:`, e?.message || e); }

        // Rev. 2893 — Medição com Levantamento em PDF (levantamento de campo sobre planta).
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS medicao_campo (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              contrato_id INTEGER NOT NULL,
              uuid VARCHAR(64),
              numero INTEGER NOT NULL,
              titulo VARCHAR(255),
              descricao TEXT,
              status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
              boletim_id INTEGER,
              criado_por_id INTEGER,
              criado_por_nome VARCHAR(255),
              criado_em TIMESTAMP DEFAULT NOW(),
              atualizado_em TIMESTAMP DEFAULT NOW(),
              deleted_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcamp_contrato ON medicao_campo(contrato_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcamp_company ON medicao_campo(company_id)`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS medicao_campo_pdfs (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              medicao_campo_id INTEGER NOT NULL,
              uuid VARCHAR(64),
              nome VARCHAR(255) NOT NULL,
              tipo VARCHAR(20) NOT NULL DEFAULT 'pavimento',
              arquivo_url TEXT NOT NULL,
              arquivo_key TEXT,
              arquivo_nome VARCHAR(500),
              num_paginas INTEGER DEFAULT 1,
              calibracao_json TEXT,
              ordem INTEGER DEFAULT 0,
              criado_em TIMESTAMP DEFAULT NOW(),
              atualizado_em TIMESTAMP DEFAULT NOW(),
              deleted_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcpdf_campo ON medicao_campo_pdfs(medicao_campo_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcpdf_company ON medicao_campo_pdfs(company_id)`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS medicao_campo_contornos (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              medicao_campo_id INTEGER NOT NULL,
              pdf_id INTEGER NOT NULL,
              uuid VARCHAR(64),
              pagina INTEGER DEFAULT 1,
              numero INTEGER,
              tipo VARCHAR(20) NOT NULL,
              rotulo VARCHAR(255),
              cor VARCHAR(20),
              geometria_json TEXT NOT NULL,
              espessura NUMERIC(12,4),
              metros_por_unidade NUMERIC(18,10),
              area NUMERIC(18,4),
              perimetro NUMERIC(18,4),
              volume NUMERIC(18,4),
              contagem INTEGER,
              quantidade NUMERIC(18,4),
              unidade VARCHAR(10),
              orcamento_item_id INTEGER,
              item_eap_codigo VARCHAR(50),
              item_descricao VARCHAR(500),
              observacoes TEXT,
              criado_em TIMESTAMP DEFAULT NOW(),
              atualizado_em TIMESTAMP DEFAULT NOW(),
              deleted_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mccont_campo ON medicao_campo_contornos(medicao_campo_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mccont_pdf ON medicao_campo_contornos(pdf_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mccont_company ON medicao_campo_contornos(company_id)`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS medicao_campo_fotos (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              medicao_campo_id INTEGER NOT NULL,
              pdf_id INTEGER,
              contorno_id INTEGER,
              uuid VARCHAR(64),
              arquivo_url TEXT NOT NULL,
              arquivo_key TEXT,
              legenda VARCHAR(500),
              pagina INTEGER,
              pin_x NUMERIC(10,6),
              pin_y NUMERIC(10,6),
              criado_em TIMESTAMP DEFAULT NOW(),
              deleted_at TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcfoto_campo ON medicao_campo_fotos(medicao_campo_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcfoto_company ON medicao_campo_fotos(company_id)`);
          console.log(`[SyncSchema+] Rev. 2893: tabelas medicao_campo/_pdfs/_contornos/_fotos garantidas (Levantamento em PDF).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA medicao_campo*:`, e?.message || e); }

        // Rev. 2874 — Ordem GLOBAL do menu lateral (definida pelo Admin Master, vale p/ todos).
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS menu_layout_global (
              id INTEGER PRIMARY KEY,
              layout_json TEXT NOT NULL,
              updated_by INTEGER,
              updated_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
          `);
          console.log(`[SyncSchema+] Rev. 2874: tabela menu_layout_global garantida (ordem global do menu definida pelo Admin).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA menu_layout_global:`, e?.message || e); }

        // Rev. 2429 — Aprovadores delegados de Auditoria do Almoxarifado por obra.
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS obra_responsaveis_estoque (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              obra_id INTEGER NOT NULL,
              user_id INTEGER NOT NULL,
              user_nome VARCHAR(255),
              tipo VARCHAR(20) NOT NULL DEFAULT 'delegado',
              criado_por_id INTEGER,
              criado_por_nome VARCHAR(255),
              created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resp_estoque_obra ON obra_responsaveis_estoque(obra_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resp_estoque_user ON obra_responsaveis_estoque(user_id)`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_resp_estoque_obra_user ON obra_responsaveis_estoque(obra_id, user_id)`);
          // Rev. 2429.1 — 1 só principal por obra (índice parcial). Fecha race
          // condition do UPSERT de principal — duas inserções concorrentes
          // falham na segunda em vez de criar 2 principais.
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_resp_estoque_principal ON obra_responsaveis_estoque(obra_id) WHERE tipo = 'principal'`);
          console.log(`[SyncSchema+] Tabela obra_responsaveis_estoque garantida.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA obra_responsaveis_estoque:`, e?.message || e); }

        // Rev. 2850 — Persistência da Análise Inteligente (IA) do DRE.
        // A análise (chamada cara ao modelo) fica SALVA por
        // company_id + periodo + tipo_periodo, junto com a NOTA 0-100. Disponível
        // até o usuário mandar "Refazer análise" (upsert na mutation analiseDRE).
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS dre_analises_ia (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              periodo VARCHAR(20) NOT NULL,
              tipo_periodo VARCHAR(20) NOT NULL DEFAULT 'mensal',
              nota INTEGER DEFAULT 0,
              payload JSONB NOT NULL,
              gerado_em TIMESTAMP DEFAULT NOW() NOT NULL,
              gerado_por_id INTEGER,
              gerado_por_nome VARCHAR(255)
            )
          `);
          // Índice ÚNICO p/ o ON CONFLICT do upsert (1 análise por chave).
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_dre_analise_chave ON dre_analises_ia(company_id, periodo, tipo_periodo)`);
          console.log(`[SyncSchema+] Rev. 2850: tabela dre_analises_ia garantida (análise IA do DRE salva + nota 0-100).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA dre_analises_ia:`, e?.message || e); }

        // Rev. 2851 — Whitelist de obras por credencial do Portal do Cliente.
        // NULL = todas as obras do cliente (compat). JSON array de IDs = só essas.
        try {
          await db.execute(sql`ALTER TABLE portal_credentials ADD COLUMN IF NOT EXISTS obras_liberadas TEXT`);
          console.log(`[SyncSchema+] Rev. 2851: coluna obras_liberadas garantida em portal_credentials (acesso por obra no Portal do Cliente).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA obras_liberadas:`, e?.message || e); }

        // Rev. 2854 — Tamanhos de EPI/uniforme no cadastro do colaborador.
        // Colunas camelCase (quoted) — espelham drizzle/schema.ts (employees).
        try {
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS "tamanhoCalcado" VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS "tamanhoCamisa" VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS "tamanhoCalca" VARCHAR(10)`);
          console.log(`[SyncSchema+] Rev. 2854: colunas tamanhoCalcado/tamanhoCamisa/tamanhoCalca garantidas em employees (mapeamento de EPI).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA tamanhos EPI:`, e?.message || e); }

        // Rev. 2884 — BACKSTOP DAS COLUNAS DE obras (Databook logos Rev. 2879 +
        // numero_contrato Rev. 2882). Essas colunas viviam SÓ no bloco [ColFix]
        // Bloco2, que é VERSION-GATED ("Versão ok, pulando migrations") e um único
        // DO/EXCEPTION atômico — então, em bancos cuja versão já estava "ok", os
        // ALTERs NUNCA rodavam e o drizzle `select()` de obras (que pede TODAS as
        // colunas do schema) quebrava → a lista de Obras voltava VAZIA. Aqui,
        // UNGATED e em statements separados (uma falha não derruba as demais),
        // garantimos que obras tenha sempre o shape do schema.
        {
          // Cada ALTER em seu PRÓPRIO try — uma falha NÃO impede as demais
          // (failure-isolation real, não só "sem rollback atômico").
          const obrasCols: Array<readonly [string, ReturnType<typeof sql>]> = [
            ["databook_logo_cliente",     sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS databook_logo_cliente SMALLINT NOT NULL DEFAULT 1`],
            ["databook_logo_gestora",     sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS databook_logo_gestora SMALLINT NOT NULL DEFAULT 1`],
            ["databook_logo_construtora", sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS databook_logo_construtora SMALLINT NOT NULL DEFAULT 0`],
            ["numero_contrato",           sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS numero_contrato VARCHAR(50)`],
          ];
          let okObras = 0;
          for (const [nome, stmt] of obrasCols) {
            try { await db.execute(stmt); okObras++; }
            catch (e: any) { console.error(`[SyncSchema+] FALHA coluna obras.${nome}:`, e?.message || e); }
          }
          console.log(`[SyncSchema+] Rev. 2884: ${okObras}/${obrasCols.length} colunas databook_logo_* (Rev. 2879) + numero_contrato (Rev. 2882) garantidas em obras (UNGATED — corrige lista de Obras vazia).`);
        }

        // Rev. 2560 — BACKSTOP DE BANCO: 1 só alocação ATIVA por funcionário.
        // Índice único parcial fecha de vez "mesmo funcionário em 2 obras ao
        // mesmo tempo": qualquer write futuro que tente ativar uma 2ª alocação
        // sem desativar a anterior FALHA (unique violation) em vez de duplicar.
        // Os dois caminhos legítimos (allocateEmployeeToObra em server/db.ts e
        // o vínculo CLT em server/routers/dds.ts) já desativam todas as ativas
        // dentro da MESMA transação antes de inserir/reativar — então nunca há
        // 2 linhas isActive=1 simultâneas e o índice nunca é violado por eles.
        // Pré-requisito: dados sem duplicata ativa (limpos na Rev. 2559).
        try {
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_obra_func_active_employee ON obra_funcionarios("employeeId") WHERE "isActive" = 1`);
          console.log(`[SyncSchema+] Rev. 2560: índice único parcial uniq_obra_func_active_employee garantido (≤1 alocação ativa por funcionário).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2560 uniq_obra_func_active_employee (provável duplicata ativa pré-existente — rodar limpeza):`, e?.message || e); }

        // Rev. 2003 — integracao_cliente_doc_url em funcionarios_terceiros (controle separado de integração no cliente)
        try {
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS integracao_cliente_doc_url VARCHAR(500)`);
          console.log(`[SyncSchema+] Coluna integracao_cliente_doc_url garantida em funcionarios_terceiros.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA funcionarios_terceiros integracao_cliente_doc_url:`, e?.message || e); }

        // Rev. 2008 — Endereço residencial em funcionarios_terceiros (saber de onde vem o terceiro)
        try {
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS cep VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS numero_endereco VARCHAR(20)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS complemento VARCHAR(100)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS bairro VARCHAR(100)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS cidade VARCHAR(100)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS uf VARCHAR(2)`);
          console.log(`[SyncSchema+] Colunas de endereço garantidas em funcionarios_terceiros.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA funcionarios_terceiros endereço:`, e?.message || e); }

        // Rev. 1998 — Número interno auto-gerado em funcionarios_terceiros
        try {
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS numero_interno VARCHAR(30)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_func_terc_numero_interno ON funcionarios_terceiros("companyId", numero_interno)`);
          console.log(`[SyncSchema+] Coluna numero_interno garantida em funcionarios_terceiros.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA funcionarios_terceiros numero_interno:`, e?.message || e); }

        // Rev. 2807 — "Cancelar divisão" de cotação: referência pai→filha.
        try {
          await db.execute(sql`ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS dividida_de_id INTEGER`);
          console.log(`[SyncSchema+] Rev. 2807: coluna dividida_de_id garantida em compras_cotacoes (cancelar divisão de cotação).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2807 dividida_de_id:`, e?.message || e); }

        // Rev. 2830 — Natureza do contrato de terceiro (MDO / material / MDO+material).
        try {
          await db.execute(sql`ALTER TABLE terceiro_contratos ADD COLUMN IF NOT EXISTS natureza_contrato VARCHAR(30) DEFAULT 'mao_de_obra'`);
          console.log(`[SyncSchema+] Rev. 2830: coluna natureza_contrato garantida em terceiro_contratos (MDO/material/ambos).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2830 natureza_contrato:`, e?.message || e); }

        // Rev. 2633 — Modo MANUAL do "% Previsto" no Planejamento.
        try {
          await db.execute(sql`ALTER TABLE oc_number_config ADD COLUMN IF NOT EXISTS previsto_fonte VARCHAR(10) DEFAULT 'motor'`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS previsto_manual_json TEXT`);
          console.log(`[SyncSchema+] Rev. 2633: previsto_fonte (oc_number_config) + previsto_manual_json (planejamento_projetos) garantidas (modo MANUAL do % Previsto).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2633 previsto manual:`, e?.message || e); }

        // Rev. 2017 — Documentos Trabalhistas (Ficha de EPI NR-06, OS de SST NR-01, Registro de Empregado CLT art. 41)
        try {
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS ficha_epi_url VARCHAR(500)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS ordem_servico_url VARCHAR(500)`);
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS registro_funcionario_url VARCHAR(500)`);
          console.log(`[SyncSchema+] Colunas Documentos Trabalhistas garantidas em funcionarios_terceiros.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA funcionarios_terceiros docs trabalhistas:`, e?.message || e); }

        // Rev. 2031 — Documentos avulsos por categoria (JSONB)
        try {
          await db.execute(sql`ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS documentos_extras JSONB`);
          console.log(`[SyncSchema+] Coluna documentos_extras garantida em funcionarios_terceiros.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA funcionarios_terceiros documentos_extras:`, e?.message || e); }

        // Rev. 2533 — Caminho B (planejamento): baseline_start/finish em
        // atividades + snapshot expandido do previsto semana-a-semana no projeto.
        try {
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS baseline_start DATE`);
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS baseline_finish DATE`);
          // Rev. 2617 — baseline COM HORA (text ISO) p/ motor minuto-a-minuto.
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS baseline_start_ts TEXT`);
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS baseline_finish_ts TEXT`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS previsto_semanas_json TEXT`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS previsto_semanas_gerado_em TIMESTAMP`);
          console.log(`[SyncSchema+] Caminho B (Rev. 2533/2617) — colunas baseline_start/finish(+_ts) + previsto_semanas_json garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Caminho B Rev. 2533:`, e?.message || e); }

        // Rev. 2607 — logo_url em clientes (cadastro de logo no próprio cliente,
        // replicado nas obras). ADITIVO; sem este guard a query `clientes.list`
        // (db.select() lê todas as colunas do schema) quebra quando a coluna não
        // existe no banco e a tela de Clientes aparece vazia.
        try {
          await db.execute(sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logo_url TEXT`);
          console.log(`[SyncSchema+] Rev. 2607: coluna logo_url garantida em clientes.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2607 clientes.logo_url:`, e?.message || e); }

        // Rev. 2611 — dados da Receita (BrasilAPI) puxados pelo CNPJ em gerenciadoras.
        // ADITIVO; sem estes guards a query `gerenciadoras.list` (db.select() lê todas
        // as colunas do schema) quebra quando as colunas não existem e a tela some.
        try {
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS razao_social TEXT`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS nome_fantasia TEXT`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS endereco TEXT`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS bairro VARCHAR(120)`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS municipio VARCHAR(120)`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS uf VARCHAR(2)`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS cep VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS situacao_cadastral VARCHAR(60)`);
          await db.execute(sql`ALTER TABLE gerenciadoras ADD COLUMN IF NOT EXISTS socios JSON`);
          console.log(`[SyncSchema+] Rev. 2611: colunas Receita (razao_social/endereco/socios…) garantidas em gerenciadoras.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2611 gerenciadoras (Receita):`, e?.message || e); }

        // Rev. 2396 — fornecedor_nome em financial_entries + backfill 1-shot
        // pra rows recorrentes JÁ materializadas (pega o nome do recurring pai).
        try {
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS fornecedor_nome VARCHAR(255)`);
          const bf = await db.execute(sql`
            UPDATE financial_entries fe
               SET fornecedor_nome = rec.fornecedor_nome
              FROM financial_recurring_entries rec
             WHERE fe.origem_modulo = 'recorrente'
               AND fe.origem_id = rec.id
               AND fe.fornecedor_nome IS NULL
               AND rec.fornecedor_nome IS NOT NULL
               AND TRIM(rec.fornecedor_nome) <> ''
          `);
          console.log(`[SyncSchema+] Coluna fornecedor_nome garantida em financial_entries (backfill: ${(bf as any)?.rowCount ?? "?"} linhas).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA financial_entries fornecedor_nome:`, e?.message || e); }

        // Rev. 2400 — Toggle global de auditoria do Almoxarifado (por empresa).
        // Default 1 preserva comportamento da Rev. 2388.
        try {
          await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS almoxarifado_exige_senha SMALLINT NOT NULL DEFAULT 1`);
          await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS almoxarifado_exige_justificativa SMALLINT NOT NULL DEFAULT 1`);
          // Rev. 2463 — Toggle independente "Exigir aprovação do gestor".
          await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS almoxarifado_exige_aprovacao SMALLINT NOT NULL DEFAULT 1`);
          console.log(`[SyncSchema+] Colunas almoxarifado_exige_senha/justificativa/aprovacao garantidas em companies.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA companies almoxarifado_exige_*:`, e?.message || e); }

        // Rev. 2404 — Vinculo de item de almoxarifado com Controle de Equipamentos.
        try {
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS equipamento_vinculado_tipo VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS equipamento_vinculado_id INTEGER`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS equipamento_vinculado_em TIMESTAMP`);
          console.log(`[SyncSchema+] Colunas equipamento_vinculado_* garantidas em almoxarifado_itens.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA almoxarifado_itens equipamento_vinculado_*:`, e?.message || e); }

        // Rev. 2405 — Backfill: equipamentos (próprios/locados) com obra indicada
        // ganham automaticamente um item no almoxarifado daquela obra (vínculo
        // bidirecional via equipamento_vinculado_tipo/_id). Idempotente: re-runs
        // não duplicam (WHERE NOT EXISTS). Pula silenciosamente em ambientes
        // sem as tabelas equipamentos_locados/proprios (dev sem db:push).
        // R-001/R-007/R-010 OK: só INSERT.
        try {
          const { backfillAlmoxFromEquipamentos } = await import("../lib/almoxEquipamentoSync");
          const r = await backfillAlmoxFromEquipamentos(db);
          if (r.locadosInseridos > 0 || r.propriosInseridos > 0) {
            console.log(`[SyncSchema+] Rev. 2405: backfill almox←equipamentos: ${r.locadosInseridos} locados + ${r.propriosInseridos} próprios inseridos.`);
          } else {
            console.log(`[SyncSchema+] Rev. 2405: backfill almox←equipamentos sem trabalho (já sincronizado).`);
          }
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2405 backfill almox←equipamentos:`, e?.message || e); }

        // Rev. 2411 — limpa vínculos órfãos no almoxarifado (locados excluídos
        // ou devolvidos cujo card continuava aparecendo na Visão Geral do
        // almox). Inverso do backfill da Rev. 2405; idempotente.
        try {
          const { purgeStaleAlmoxLinks } = await import("../lib/almoxEquipamentoSync");
          const r = await purgeStaleAlmoxLinks(db);
          if (r.locadosRemovidos > 0 || r.propriosRemovidos > 0) {
            console.log(`[SyncSchema+] Rev. 2411: purga almox órfãos: ${r.locadosRemovidos} locados + ${r.propriosRemovidos} próprios removidos.`);
          } else {
            console.log(`[SyncSchema+] Rev. 2411: purga almox órfãos — nada a remover.`);
          }
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev. 2411 purga almox órfãos:`, e?.message || e); }

        // Rev. 1592: bloco Escritório Central na avaliação anônima do Portal do Cliente.
        // Garantido aqui (e não só em ColFix) porque o version guard do ColFix pode
        // pular as migrations quando a versão já estiver aplicada.
        // Rev. 1637 — Data de Corte (Status Date PMBOK/EVM) por projeto.
        // Garantida fora do ColFix porque o version guard pode pular as migrations.
        try {
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_atual DATE`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_atualizada_em TIMESTAMP`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_atualizada_por VARCHAR(200)`);
          // Rev. 1643 — StatusDate ISO completo (com hora) para precisão MSP.
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_iso TEXT`);
          // Rev. 1647 — Dia da semana de cutoff (0=Dom..6=Sáb, default qui=4)
          // + flag de consolidação (one-way lock após acordo da equipe).
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS dia_corte_semana INTEGER DEFAULT 4`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS cutoff_consolidado BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS cutoff_consolidado_em TIMESTAMP`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS cutoff_consolidado_por VARCHAR(200)`);
          // Rev. 1824 — Calendário MSP (paridade dias úteis) movido pra fora do
          // ColFix (era L1266 dentro do bloco com version-guard que pulava em DBs
          // já versionados, deixando a coluna inexistente → fração linear de dias
          // CORRIDOS inflava o Previsto comparado ao MS Project).
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS calendario_json TEXT`);
          console.log(`[SyncSchema+] Colunas data_corte_* + calendario_json garantidas em planejamento_projetos.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_projetos data_corte:`, e?.message || e); }

        // Rev. 1662 — Datas reais por atividade (visão LOTUS).
        // FORA do ColFix com version guard porque, em DBs onde a versão já estava
        // aplicada, o guard pula o bloco e as colunas novas nunca são criadas —
        // quebra `listarAtividades` com "column data_inicio_real does not exist".
        try {
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS data_inicio_real DATE`);
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS data_fim_real DATE`);
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS responsavel_lotus VARCHAR(200)`);
          // Rev. 1670 Fase 1 — Snapshot %Previsto (Texto10) e %Realizado (Texto7)
          // por atividade, lidos diretos do XML MSP no import. Permite paridade
          // 100% Project × ERP sem replicar ProjDateDiff em JS.
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS previsto_msp_pct NUMERIC(8,4)`);
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS realizado_msp_pct NUMERIC(8,4)`);
          // Rev. 1829 — UID nativo do MS Project como chave única de identidade
          // de atividade. Substitui o fallback por nome (proibido por auditoria
          // contra regras MSP). Index composto (revisao_id, msp_uid) acelera o
          // lookup `uidToId` no salvarAtividades/importarAvancosDoArquivo.
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS msp_uid VARCHAR(20)`);
          // Rev. 1875 — Override granular de sáb/dom trabalhado por atividade
          // (JSON array de YYYY-MM-DD). Default null = respeita calendário MSP.
          await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS dias_trabalhados_extras TEXT`);
          // Rev. 1829 — UNIQUE partial index (achado de code review): UID é
          // chave única de identidade dentro da revisão. Partial WHERE
          // msp_uid IS NOT NULL preserva legados (NULL) sem violação. Se já
          // existir o índice não-unique de versão anterior, é dropado primeiro.
          try {
            await db.execute(sql`DROP INDEX IF EXISTS idx_planej_ativ_msp_uid`);
          } catch {}
          try {
            await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_planej_ativ_msp_uid ON planejamento_atividades(revisao_id, msp_uid) WHERE msp_uid IS NOT NULL`);
          } catch (eu: any) {
            // Duplicatas pré-existentes (nunca deve acontecer em produção pq UID
            // só foi populado via importer Rev. 1829). Loga e segue com índice não-unique.
            console.warn(`[SyncSchema+] Rev. 1829: UNIQUE INDEX msp_uid falhou (${eu?.message || eu}); criando índice não-unique como fallback.`);
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_planej_ativ_msp_uid ON planejamento_atividades(revisao_id, msp_uid)`);
          }
          console.log(`[SyncSchema+] Colunas data_*_real + responsavel_lotus + previsto/realizado_msp_pct + msp_uid garantidas em planejamento_atividades.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_atividades datas reais:`, e?.message || e); }

        // Rev. 1846 — Cleanup ONE-SHOT do legado MSP em responsavel_lotus.
        // Substitui a heurística runtime de Rev. 1818 (que comparava o valor com
        // o nome do engenheiro do projeto a CADA leitura). Problema: quando o
        // engenheiro do obras é uma empresa terceira (ex.: 'Rohr') e o
        // planejador digita justamente esse nome no popover Responsável Manual,
        // o filtro descartava silenciosamente, fazendo a Programação Semanal
        // mostrar 'FC' apesar do cronograma ter 'Rohr'. Solução: limpar UMA VEZ
        // por projeto os valores legado (== engenheiro), marcar projeto como
        // limpo via flag no DB, e nas próximas leituras NÃO filtrar nada que
        // case com o engenheiro — o input do usuário passa a ser sagrado.
        try {
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS resp_lotus_legacy_cleaned BOOLEAN DEFAULT FALSE`);
          // Idempotente: só atualiza projetos com flag FALSE; após o UPDATE,
          // o projeto fica com TRUE e fica imune a futuras execuções.
          // GUARDA ANTI-DESTRUIÇÃO (achado de code review architect):
          // só purga projetos com PADRÃO DE IMPORT EM MASSA — pelo menos 10
          // atividades com responsavel_lotus EXATAMENTE igual ao engenheiro
          // (norm). Isso protege overrides manuais esparsos (típico do popover:
          // 1-5 atividades) — caso do usuário com 'Rohr' (engenheiro = 'Rohr',
          // 2 atividades manuais). Imports MSP legados afetavam centenas de
          // linhas em bloco, então o threshold separa com folga.
          const r: any = await db.execute(sql`
            WITH alvos AS (
              SELECT p.id AS projeto_id,
                     REGEXP_REPLACE(BTRIM(LOWER(o.responsavel)), '\\s+', ' ', 'g') AS eng_norm
              FROM planejamento_projetos p
              JOIN obras o ON o.id = p.obra_id
              WHERE COALESCE(p.resp_lotus_legacy_cleaned, FALSE) = FALSE
                AND o.responsavel IS NOT NULL
                AND BTRIM(o.responsavel) <> ''
            ),
            contagem AS (
              SELECT alvos.projeto_id, alvos.eng_norm,
                     COUNT(*) FILTER (
                       WHERE a.responsavel_lotus IS NOT NULL
                         AND REGEXP_REPLACE(BTRIM(LOWER(a.responsavel_lotus)), '\\s+', ' ', 'g') = alvos.eng_norm
                     ) AS qtd_match
              FROM alvos
              LEFT JOIN planejamento_atividades a ON a.projeto_id = alvos.projeto_id
              GROUP BY alvos.projeto_id, alvos.eng_norm
            ),
            elegiveis AS (
              SELECT projeto_id, eng_norm FROM contagem WHERE qtd_match >= 10
            ),
            limpas AS (
              UPDATE planejamento_atividades a
                 SET responsavel_lotus = NULL
                FROM elegiveis
               WHERE a.projeto_id = elegiveis.projeto_id
                 AND a.responsavel_lotus IS NOT NULL
                 AND REGEXP_REPLACE(BTRIM(LOWER(a.responsavel_lotus)), '\\s+', ' ', 'g') = elegiveis.eng_norm
            )
            UPDATE planejamento_projetos p
               SET resp_lotus_legacy_cleaned = TRUE
              WHERE p.id IN (SELECT projeto_id FROM elegiveis)
          `);
          const rows = (r as any)?.rowCount ?? (r as any)?.rows?.length ?? 0;
          if (rows > 0) {
            console.log(`[SyncSchema+] Rev. 1846: cleanup legado responsavel_lotus aplicado em ${rows} projeto(s).`);
          }
        } catch (e: any) { console.error(`[SyncSchema+] FALHA cleanup responsavel_lotus legado:`, e?.message || e); }

        // Rev. 1743 — UNIQUE INDEX em compras_solicitacoes (company_id, numero_sc).
        // FORA do ColFix com version guard porque, em DBs onde a versão já estava aplicada,
        // o guard pula o bloco e duplicatas continuariam sendo criadas. Idempotente: cleanup
        // renumera duplicatas existentes ANTES de criar o índice.
        try {
          await db.execute(sql`
            DO $body$
            DECLARE
              dup RECORD;
              v_year TEXT;
              v_max INT;
              v_new TEXT;
            BEGIN
              FOR dup IN
                SELECT id, company_id, numero_sc
                FROM (
                  SELECT id, company_id, numero_sc,
                         ROW_NUMBER() OVER (PARTITION BY company_id, numero_sc ORDER BY id) AS rn
                  FROM compras_solicitacoes
                  WHERE numero_sc ~ '^SC-\\d{4}-\\d+$'
                ) t WHERE rn > 1
                ORDER BY id
              LOOP
                v_year := SUBSTRING(dup.numero_sc FROM 4 FOR 4);
                SELECT COALESCE(MAX(CAST(SUBSTRING(numero_sc FROM 9) AS INTEGER)), 0)
                  INTO v_max
                  FROM compras_solicitacoes
                  WHERE company_id = dup.company_id
                    AND numero_sc LIKE 'SC-' || v_year || '-%'
                    AND numero_sc ~ ('^SC-' || v_year || '-\\d+$');
                v_new := 'SC-' || v_year || '-' || LPAD((v_max + 1)::TEXT, 4, '0');
                UPDATE compras_solicitacoes SET numero_sc = v_new WHERE id = dup.id;
                RAISE NOTICE 'Rev1743: renumerado SC id=% company=% : % -> %', dup.id, dup.company_id, dup.numero_sc, v_new;
              END LOOP;
            END $body$;
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_solicitacoes_numero ON compras_solicitacoes (company_id, numero_sc)`);
          console.log(`[SyncSchema+] Rev. 1743: duplicatas em compras_solicitacoes renumeradas + UNIQUE INDEX (company_id, numero_sc) garantido.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.1743 unique compras_solicitacoes:`, e?.message || e); }

        // Rev. 1799 — R-014 · Counter table atômica para geração de numero_sc.
        // Substitui MAX(seq)+1 + advisory lock (que ainda permitia race conditions
        // raras quando MVCC retornava snapshot stale entre retries — visto em prod:
        // 3 tentativas computando MESMO numero_sc 'SC-2026-0010' para company 60002).
        // Solução: UPSERT atômico `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
        // — Postgres garante atomicidade no row-level lock, colisão impossível.
        // Inicialização idempotente: para cada (company_id, ano) com SCs existentes,
        // semeia o counter com MAX(seq) atual; se já existe, mantém o maior valor.
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS compras_sc_counters (
              company_id INTEGER NOT NULL,
              ano        INTEGER NOT NULL,
              ultimo_seq INTEGER NOT NULL DEFAULT 0,
              atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (company_id, ano)
            )
          `);
          // Semeia counters a partir do MAX existente em compras_solicitacoes.
          // Idempotente: ON CONFLICT só atualiza se o MAX for MAIOR que o counter atual
          // (evita "voltar" o counter caso já tenha avançado por SCs criadas).
          await db.execute(sql`
            INSERT INTO compras_sc_counters (company_id, ano, ultimo_seq)
            SELECT
              company_id,
              CAST(SUBSTRING(numero_sc FROM 4 FOR 4) AS INTEGER) AS ano,
              MAX(CAST(SUBSTRING(numero_sc FROM 9) AS INTEGER)) AS ultimo_seq
            FROM compras_solicitacoes
            WHERE numero_sc ~ '^SC-\d{4}-\d+$'
            GROUP BY company_id, CAST(SUBSTRING(numero_sc FROM 4 FOR 4) AS INTEGER)
            ON CONFLICT (company_id, ano)
            DO UPDATE SET ultimo_seq = GREATEST(compras_sc_counters.ultimo_seq, EXCLUDED.ultimo_seq),
                          atualizado_em = NOW()
          `);
          console.log(`[SyncSchema+] Rev. 1799: tabela compras_sc_counters criada e semeada com MAX(seq) atual.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.1799 compras_sc_counters:`, e?.message || e); }

        // Rev. 2290/2293 — Locação de Equipamento já na SC (toggle + período).
        // CRITICO: o Drizzle gera SELECT explícito com TODAS as colunas do schema
        // TS — se estas colunas faltarem em PROD, listarSolicitacoes / getSolicitacao
        // falham e o frontend mostra "Nenhuma solicitação encontrada" (Rev. 2293 fix).
        // Auto-migration aditiva e idempotente garante paridade schema TS ↔ DB
        // em DEV e PROD sem precisar de `pnpm db:push` manual.
        try {
          await db.execute(sql`ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS is_locacao BOOLEAN DEFAULT false`);
          await db.execute(sql`ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS locacao_duracao_dias INTEGER`);
          await db.execute(sql`ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS locacao_data_inicio_prevista VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS locacao_data_fim_prevista VARCHAR(10)`);
          console.log(`[SyncSchema+] Rev. 2290/2293: colunas locação (is_locacao + duração + datas) garantidas em compras_solicitacoes.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2290/2293 locação compras_solicitacoes:`, e?.message || e); }

        // Rev. 2302 — Locação de Equipamento em compras_ordens (espelho da Rev.
        // 2293 pra compras_solicitacoes). O INSERT de OC gerado pelo Drizzle
        // inclui TODAS as colunas do schema TS (drizzle/schema.ts L6125-6131):
        // is_locacao, locacao_data_inicio/fim, locacao_duracao_dias,
        // locacao_renovavel, locacao_oc_anterior_id, locacao_solicitacao_id.
        // Se faltarem em PROD/DEV, "Aprovar e Gerar OC" estoura no
        // "Aprovar e Gerar OC" com erro SQL gigante (column doesn't exist).
        // Auto-migration aditiva e idempotente.
        try {
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS is_locacao BOOLEAN DEFAULT false`);
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS locacao_data_inicio VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS locacao_data_fim VARCHAR(10)`);
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS locacao_duracao_dias INTEGER`);
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS locacao_renovavel BOOLEAN DEFAULT false`);
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS locacao_oc_anterior_id INTEGER`);
          await db.execute(sql`ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS locacao_solicitacao_id INTEGER`);
          console.log(`[SyncSchema+] Rev. 2302: colunas locação (7 cols) garantidas em compras_ordens.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2302 locação compras_ordens:`, e?.message || e); }

        // Rev. 2305 — Estorno auditável de movimentações do almoxarifado.
        // Soft-delete: marca a mov como estornada (preserva histórico),
        // devolve quantidade ao estoque. 4 colunas ADDED em
        // almoxarifado_movimentacoes — aditivo, idempotente.
        try {
          await db.execute(sql`ALTER TABLE almoxarifado_movimentacoes ADD COLUMN IF NOT EXISTS estornada_em TIMESTAMP`);
          await db.execute(sql`ALTER TABLE almoxarifado_movimentacoes ADD COLUMN IF NOT EXISTS estornada_por_id INTEGER`);
          await db.execute(sql`ALTER TABLE almoxarifado_movimentacoes ADD COLUMN IF NOT EXISTS estornada_por_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE almoxarifado_movimentacoes ADD COLUMN IF NOT EXISTS estorno_motivo TEXT`);
          console.log(`[SyncSchema+] Rev. 2305: colunas de estorno (4 cols) garantidas em almoxarifado_movimentacoes.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2305 estorno almoxarifado_movimentacoes:`, e?.message || e); }

        // Rev. 2294 — Aprovação automática (SC/OC). A existência da SC já é
        // a aprovação; o fluxo manual foi removido. Backfill aditivo (UPDATE
        // de status, não DROP/DELETE) normaliza o backlog antigo:
        // - SCs em "aguardando" viram "aprovada" (exceto canceladas/recusadas);
        // - OCs em "aguardando_aprovacao_extra" viram "aprovada"/"aprovado".
        try {
          const upSC: any = await db.execute(sql`
            UPDATE compras_solicitacoes
               SET aprovacao_status = 'aprovada',
                   aprovado_em = COALESCE(aprovado_em, NOW())
             WHERE aprovacao_status = 'aguardando'
               AND status NOT IN ('cancelado','recusado')
          `);
          const upOC: any = await db.execute(sql`
            UPDATE compras_ordens
               SET status = 'aprovada',
                   aprovacao_status = 'aprovado',
                   aprovado_em = COALESCE(aprovado_em, NOW())
             WHERE status = 'aguardando_aprovacao_extra'
          `);
          const nSC = (upSC?.rowCount ?? upSC?.rows?.length ?? 0);
          const nOC = (upOC?.rowCount ?? upOC?.rows?.length ?? 0);
          if (nSC > 0 || nOC > 0) {
            console.log(`[SyncSchema+] Rev. 2294: backfill aprovação automática — ${nSC} SC(s) e ${nOC} OC(s) normalizada(s) para "aprovada".`);
          } else {
            console.log(`[SyncSchema+] Rev. 2294: backfill aprovação automática — nada a fazer (já normalizado).`);
          }
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2294 backfill aprovação automática:`, e?.message || e); }

        try {
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS nota_escritorio INTEGER`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS nota_faturamento INTEGER`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_escritorio TEXT`);
          console.log(`[SyncSchema+] Colunas Escritório Central garantidas em cliente_avaliacoes.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA cliente_avaliacoes escritório:`, e?.message || e); }

        // Rastreio de quem cadastrou/atualizou itens do almoxarifado
        try {
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS criado_por_id INTEGER`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS criado_por_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS atualizado_por_id INTEGER`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS atualizado_por_nome VARCHAR(255)`);
          console.log(`[SyncSchema+] Colunas de rastreio (criado_por/atualizado_por) garantidas em almoxarifado_itens.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA almoxarifado_itens criado_por:`, e?.message || e); }

        // Rev. 1607 — Tipo de controle do item (estoque vs aplicação direta classificado por IA)
        try {
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS tipo_controle VARCHAR(20) DEFAULT 'estoque'`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS tipo_controle_classificado_ia BOOLEAN DEFAULT false`);
          await db.execute(sql`ALTER TABLE almoxarifado_itens ADD COLUMN IF NOT EXISTS tipo_controle_justificativa TEXT`);
          await db.execute(sql`UPDATE almoxarifado_itens SET tipo_controle = 'estoque' WHERE tipo_controle IS NULL`);
          console.log(`[SyncSchema+] Colunas tipo_controle (IA) garantidas em almoxarifado_itens.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA almoxarifado_itens tipo_controle:`, e?.message || e); }

        // Rev. 1806 — Anexo do AVISO ASSINADO pelo colaborador no termination_notices
        try {
          await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS aviso_assinado_url TEXT`);
          await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS aviso_assinado_enviado_em TIMESTAMP WITHOUT TIME ZONE`);
          console.log(`[SyncSchema+] Rev. 1806: colunas aviso_assinado_url/enviado_em garantidas em termination_notices.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.1806 aviso_assinado:`, e?.message || e); }

        // Data prevista de pagamento das medições PJ (forecast por contrato)
        try {
          await db.execute(sql`ALTER TABLE pj_payments ADD COLUMN IF NOT EXISTS data_prevista DATE`);
          console.log(`[SyncSchema+] Coluna data_prevista garantida na tabela pj_payments.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA pj_payments data_prevista:`, e?.message || e); }

        // Faturamento Direto editável na Configuração de Medição (Sinal = (Contrato − FD) × %)
        try {
          await db.execute(sql`ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS fd_valor NUMERIC(18,2)`);
          console.log(`[SyncSchema+] Coluna fd_valor garantida na tabela planejamento_medicao_config.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_medicao_config fd_valor:`, e?.message || e); }

        try {
          // Rev. 1345: garantir reter_sinal sempre — Rev. 1344 ColFix não rodava se versão já estava aplicada,
          // o que quebrava SELECT * em planejamento_medicao_config (column does not exist).
          await db.execute(sql`ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS reter_sinal BOOLEAN NOT NULL DEFAULT false`);
          console.log(`[SyncSchema+] Coluna reter_sinal garantida na tabela planejamento_medicao_config.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_medicao_config reter_sinal:`, e?.message || e); }

        try {
          // Rev. 1346: data prevista do primeiro faturamento (independente da data de início da obra).
          await db.execute(sql`ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS data_primeiro_faturamento DATE`);
          console.log(`[SyncSchema+] Coluna data_primeiro_faturamento garantida na tabela planejamento_medicao_config.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_medicao_config data_primeiro_faturamento:`, e?.message || e); }

        try {
          // Rev. 1347: prazo de recebimento em dias úteis após cada medição (cliente paga em N dias úteis).
          await db.execute(sql`ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS prazo_recebimento_dias_uteis INTEGER DEFAULT 15`);
          console.log(`[SyncSchema+] Coluna prazo_recebimento_dias_uteis garantida na tabela planejamento_medicao_config.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_medicao_config prazo_recebimento_dias_uteis:`, e?.message || e); }

        try {
          // Rev. 1348: base de cálculo do sinal — 'contrato' (default) ou 'mao_de_obra'.
          // Usado quando o cliente paga sinal apenas sobre a parcela de mão de obra do contrato.
          await db.execute(sql`ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS sinal_base VARCHAR(20) DEFAULT 'contrato'`);
          console.log(`[SyncSchema+] Coluna sinal_base garantida na tabela planejamento_medicao_config.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_medicao_config sinal_base:`, e?.message || e); }

        try {
          // Rev. 1357: regime de contratação CLT — 'experiencia' (45+45 dias, default) ou 'indeterminado'.
          // Necessário para SMO calcular custo blended (encargos rescisórios só após período de experiência).
          await db.execute(sql`ALTER TABLE smo_solicitacoes ADD COLUMN IF NOT EXISTS regime_contratacao VARCHAR(20) DEFAULT 'experiencia'`);
          console.log(`[SyncSchema+] Coluna regime_contratacao garantida na tabela smo_solicitacoes.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA smo_solicitacoes regime_contratacao:`, e?.message || e); }

        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_config (
          id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, obra_id INTEGER, obra_nome VARCHAR(255),
          titulo VARCHAR(255) NOT NULL, descricao TEXT, nota_minima INTEGER NOT NULL DEFAULT 70,
          validade_meses INTEGER NOT NULL DEFAULT 12, ativo BOOLEAN NOT NULL DEFAULT true,
          criado_por VARCHAR(255), criado_por_user_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL, deleted_at TIMESTAMP
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_modulos (
          id SERIAL PRIMARY KEY, config_id INTEGER NOT NULL, company_id INTEGER NOT NULL,
          titulo VARCHAR(255) NOT NULL, descricao TEXT, video_url TEXT, video_tipo VARCHAR(30) DEFAULT 'youtube',
          ordem INTEGER NOT NULL DEFAULT 1, obrigatorio BOOLEAN NOT NULL DEFAULT true,
          funcoes_json TEXT, duracao_minutos INTEGER,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL, deleted_at TIMESTAMP
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_perguntas (
          id SERIAL PRIMARY KEY, modulo_id INTEGER NOT NULL, company_id INTEGER NOT NULL,
          texto TEXT NOT NULL, tipo VARCHAR(30) NOT NULL DEFAULT 'multipla_escolha', ordem INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_alternativas (
          id SERIAL PRIMARY KEY, pergunta_id INTEGER NOT NULL,
          texto TEXT NOT NULL, correta BOOLEAN NOT NULL DEFAULT false, ordem INTEGER NOT NULL DEFAULT 1
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_registros (
          id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, employee_id INTEGER NOT NULL,
          employee_nome VARCHAR(255), employee_cpf VARCHAR(14), employee_funcao VARCHAR(255),
          config_id INTEGER, obra_id INTEGER, obra_nome VARCHAR(255),
          status VARCHAR(30) NOT NULL DEFAULT 'pendente', origem VARCHAR(30) NOT NULL DEFAULT 'manual',
          smo_id INTEGER, nota NUMERIC(5,2), tentativas INTEGER NOT NULL DEFAULT 0,
          data_realizacao TIMESTAMP, data_validade TIMESTAMP, certificado_url TEXT,
          envelope_id INTEGER, token VARCHAR(100), sessao_id INTEGER,
          responsavel VARCHAR(255), responsavel_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL, deleted_at TIMESTAMP
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_respostas (
          id SERIAL PRIMARY KEY, registro_id INTEGER NOT NULL, pergunta_id INTEGER NOT NULL,
          alternativa_id INTEGER, correta BOOLEAN NOT NULL DEFAULT false, tentativa INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS sst_integracao_sessoes (
          id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, obra_id INTEGER, obra_nome VARCHAR(255),
          titulo VARCHAR(255), data_sessao TIMESTAMP, responsavel VARCHAR(255), responsavel_id INTEGER,
          tipo VARCHAR(30) NOT NULL DEFAULT 'individual', status VARCHAR(30) NOT NULL DEFAULT 'agendada',
          observacoes TEXT, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sst_integ_reg_company ON sst_integracao_registros(company_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sst_integ_reg_employee ON sst_integracao_registros(employee_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sst_integ_reg_token ON sst_integracao_registros(token)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sst_integ_reg_status ON sst_integracao_registros(status)`);
        // Rev. 2052 — assinatura digital do TST no certificado (FCSign inline canvas).
        // 3 colunas: imagem base64, nome do assinante e timestamp da assinatura.
        await db.execute(sql`ALTER TABLE sst_integracao_registros ADD COLUMN IF NOT EXISTS assinatura_tst_base64 TEXT`);
        await db.execute(sql`ALTER TABLE sst_integracao_registros ADD COLUMN IF NOT EXISTS assinatura_tst_nome VARCHAR(255)`);
        await db.execute(sql`ALTER TABLE sst_integracao_registros ADD COLUMN IF NOT EXISTS assinatura_tst_assinada_em TIMESTAMP`);
        console.log(`[SyncSchema+] Tabelas SST Integração garantidas.`);

        // Rev. 2050 — Auto-migração das 12 perguntas-padrão das Regras de
        // Ouro (Rev. 2047) pra todo módulo que ainda esteja no seed antigo
        // da Rev. 2046 (perguntas sobre NRs, fora do escopo do vídeo
        // "INTEGRAÇÃO FC ENGENHARIA"). Antes dependia do admin clicar no
        // botão "Atualizar Regras de Ouro" na UI; agora roda sozinho no
        // startup. Detecta o seed antigo por: (a) ter exatamente 1 pergunta
        // com texto começando com "Quando devo usar capacete, óculos e
        // botina" (assinatura única da Rev. 2046). Idempotente (só roda em
        // módulos com o marcador antigo) e seguro (delete+insert atômico
        // em transação — nunca deixa módulo vazio se algo falhar).
        // Respostas históricas em sst_integracao_respostas NÃO são afetadas
        // (vivem em outra tabela, sem FK rígida pras perguntas).
        try {
          const { PERGUNTAS_REGRAS_OURO } = await import("../routers/integracaoSST");
          const canonTexts = PERGUNTAS_REGRAS_OURO.map((p) => p.texto);
          // Detecção dupla:
          //  (1) Seed antigo da Rev. 2046 (qualquer pergunta com âncora NR
          //      tipo "capacete, óculos e botina" / "cinto de segurança").
          //  (2) Duplicatas do seed novo Rev. 2047 (total > 12 OU pelo menos
          //      uma pergunta canônica aparecendo > 1x). Caso real observado:
          //      módulo do FC com 24 perguntas, todas pares duplicados de
          //      pid 13-24 → 25-36 — frutos de 2 cliques no "Carregar Regras
          //      de Ouro" antes do fluxo "Substituir" da Rev. 2047 existir.
          const oldAnchors = [
            "%capacete%óculos%botina%",
            "%cinto de seguran%",
            "%espaço confinado%",
            "%fio elétrico desencapado%",
          ];
          const modsStale: any = await db.execute(sql`
            WITH stats AS (
              SELECT
                m.id AS modulo_id,
                m.company_id,
                COUNT(p.id) AS total,
                SUM(CASE WHEN ${sql.join(oldAnchors.map((a) => sql`p.texto ILIKE ${a}`), sql` OR `)} THEN 1 ELSE 0 END) AS tem_antigo,
                COUNT(DISTINCT p.texto) AS texts_distinct,
                SUM(CASE WHEN p.texto IN (${sql.join(canonTexts.map((t) => sql`${t}`), sql`, `)}) THEN 1 ELSE 0 END) AS canonicos
              FROM sst_integracao_modulos m
              JOIN sst_integracao_perguntas p ON p.modulo_id = m.id
              WHERE m.deleted_at IS NULL
              GROUP BY m.id, m.company_id
            )
            SELECT modulo_id, company_id, total, tem_antigo, canonicos, texts_distinct
            FROM stats
            -- Critério ENDURECIDO (revisão de arquiteto): só dispara se
            -- (a) tem todas as 4 âncoras do seed antigo Rev. 2046 juntas,
            --     evitando false-positive de módulos customizados que só
            --     mencionem "cinto de segurança" por acaso; OU
            -- (b) tem QUASE TODAS as 12 canônicas (≥10) — i.e. claramente
            --     é um seed Rev. 2047 — E está com duplicatas; OU
            -- (c) tem TODAS as 12 canônicas e total ≠ 12 (duplicatas ou
            --     extras). Módulos customizados com 1-9 canônicas ficam
            --     intactos.
            WHERE tem_antigo >= 4
               OR (canonicos >= 10 AND total > texts_distinct)
               OR (canonicos = ${PERGUNTAS_REGRAS_OURO.length} AND total <> ${PERGUNTAS_REGRAS_OURO.length})
          `);
          const rows: any[] = Array.isArray(modsStale) ? modsStale : (modsStale?.rows ?? []);
          if (rows.length > 0) {
            console.log(`[SyncSchema+] Rev. 2050: ${rows.length} módulo(s) com perguntas SST stale (seed antigo OU duplicatas). Re-semeando com as 12 Regras de Ouro Rev. 2047...`);
            for (const r of rows) {
              console.log(`  · m=${r.modulo_id} c=${r.company_id} total=${r.total} distinct=${r.texts_distinct} canonicos=${r.canonicos} tem_antigo=${r.tem_antigo}`);
            }
            for (const r of rows) {
              const moduloId = Number(r.modulo_id);
              const companyId = Number(r.company_id);
              if (!moduloId || !companyId) continue;
              try {
                await db.transaction(async (tx: any) => {
                  const ids: any = await tx.execute(sql`SELECT id FROM sst_integracao_perguntas WHERE modulo_id = ${moduloId} AND company_id = ${companyId}`);
                  const idRows: any[] = Array.isArray(ids) ? ids : (ids?.rows ?? []);
                  const perguntaIds = idRows.map((x: any) => Number(x.id)).filter(Boolean);
                  if (perguntaIds.length > 0) {
                    await tx.execute(sql`DELETE FROM sst_integracao_alternativas WHERE pergunta_id IN (${sql.join(perguntaIds.map((i: number) => sql`${i}`), sql`, `)})`);
                    await tx.execute(sql`DELETE FROM sst_integracao_perguntas WHERE id IN (${sql.join(perguntaIds.map((i: number) => sql`${i}`), sql`, `)})`);
                  }
                  for (let i = 0; i < PERGUNTAS_REGRAS_OURO.length; i++) {
                    const p = PERGUNTAS_REGRAS_OURO[i];
                    const ins: any = await tx.execute(sql`INSERT INTO sst_integracao_perguntas (modulo_id, company_id, texto, ordem) VALUES (${moduloId}, ${companyId}, ${p.texto}, ${i + 1}) RETURNING id`);
                    const insRows: any[] = Array.isArray(ins) ? ins : (ins?.rows ?? []);
                    const perguntaId = Number(insRows[0]?.id);
                    if (!perguntaId) throw new Error("INSERT pergunta sem RETURNING id");
                    for (let j = 0; j < p.alternativas.length; j++) {
                      const a = p.alternativas[j];
                      await tx.execute(sql`INSERT INTO sst_integracao_alternativas (pergunta_id, texto, correta, ordem) VALUES (${perguntaId}, ${a.texto}, ${a.correta}, ${j + 1})`);
                    }
                  }
                });
                console.log(`[SyncSchema+] Rev. 2050: módulo ${moduloId} (company ${companyId}) migrado pras 12 Regras de Ouro.`);
              } catch (eMod: any) {
                console.error(`[SyncSchema+] Rev. 2050: FALHA módulo ${moduloId}:`, eMod?.message || eMod);
              }
            }
          }
        } catch (e: any) {
          console.error(`[SyncSchema+] Rev. 2050: FALHA auto-migração Regras de Ouro:`, e?.message || e);
        }

        // Rev. 1726 — DDS (Diálogo Diário de Segurança).
        // Idempotente — garante 3 tabelas no startup mesmo sem rodar drizzle migrate.
        await db.execute(sql`CREATE TABLE IF NOT EXISTS dds_temas (
          id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL,
          codigo VARCHAR(30), titulo VARCHAR(255) NOT NULL,
          descricao TEXT, conteudo_md TEXT, norma_referencia VARCHAR(120),
          categoria VARCHAR(30) NOT NULL DEFAULT 'LIVRE',
          mes_campanha INTEGER, cor_campanha VARCHAR(30),
          duracao_min INTEGER DEFAULT 15, ativo INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
          deleted_at TIMESTAMP
        )`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_temas_company ON dds_temas(company_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_temas_categoria ON dds_temas(categoria)`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS dds_sessoes (
          id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL,
          obra_id INTEGER, obra_nome VARCHAR(255),
          data DATE NOT NULL, hora VARCHAR(8),
          tema_id INTEGER, titulo_tema VARCHAR(255) NOT NULL,
          conteudo_md TEXT, instrutor VARCHAR(255), instrutor_cpf VARCHAR(14),
          local VARCHAR(255), observacoes TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'aberta',
          envelope_id INTEGER, created_by INTEGER,
          finalizada_em TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
          deleted_at TIMESTAMP
        )`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_sessoes_company ON dds_sessoes(company_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_sessoes_obra ON dds_sessoes(obra_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_sessoes_data ON dds_sessoes(data)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_sessoes_status ON dds_sessoes(status)`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS dds_sessao_funcionarios (
          id SERIAL PRIMARY KEY, sessao_id INTEGER NOT NULL,
          employee_id INTEGER, nome VARCHAR(255) NOT NULL,
          cpf VARCHAR(14), funcao VARCHAR(120),
          presente INTEGER NOT NULL DEFAULT 1,
          assinatura_tipo VARCHAR(20), assinado_em TIMESTAMP,
          observacao TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_sf_sessao ON dds_sessao_funcionarios(sessao_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_sf_emp ON dds_sessao_funcionarios(employee_id)`);
        // Rev. 1873 — LGPD: substitui CPF do instrutor pelo Código Interno do funcionário no modal Nova Sessão DDS.
        try {
          await db.execute(sql`ALTER TABLE dds_sessoes ADD COLUMN IF NOT EXISTS instrutor_codigo_interno VARCHAR(50)`);
          // Rev. 1876 — Categoria override por sessão (null = herda do tema).
          await db.execute(sql`ALTER TABLE dds_sessoes ADD COLUMN IF NOT EXISTS categoria VARCHAR(30)`);
          // Rev. 1960 — Sub-classificação por área temática em dds_temas (auto-preenchida pela IA).
          await db.execute(sql`ALTER TABLE dds_temas ADD COLUMN IF NOT EXISTS area_tema VARCHAR(40)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dds_temas_area_tema ON dds_temas(area_tema)`);
          console.log(`[SyncSchema+] Rev. 1873/1960: coluna instrutor_codigo_interno + area_tema garantidas em dds_sessoes/dds_temas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.1873/1960 colunas DDS:`, e?.message || e); }
        // Rev. 1874 — CLT Art. 62: inciso (I/II/III) + observação/justificativa em employees.
        try {
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_inciso VARCHAR(5)`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_observacao TEXT`);
          // Rev. 1878 — Termo formal de Isenção Art. 62 (PDF/imagem assinada pelo colaborador).
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_termo_url TEXT`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_termo_nome_arquivo TEXT`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_termo_assinado_em TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 1874/1878: colunas cargo_confianca_inciso/observacao/termo_* garantidas em employees.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.1874/1878 cargo_confianca_*:`, e?.message || e); }

        // Rev. 2755 — RECONTRATAÇÃO: tabela de staging + vínculo do funcionário novo com o registro anterior.
        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS recontratacao_solicitacoes (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            cpf VARCHAR(14) NOT NULL,
            nome_completo VARCHAR(255) NOT NULL,
            funcao VARCHAR(255),
            vinculo_anterior_employee_id INTEGER,
            vinculo_anterior_company_id INTEGER,
            vinculo_anterior_codigo VARCHAR(30),
            vinculo_anterior_funcao VARCHAR(255),
            vinculo_anterior_desligamento VARCHAR(30),
            mesma_empresa SMALLINT NOT NULL DEFAULT 1,
            mesma_funcao SMALLINT NOT NULL DEFAULT 0,
            dias_fora INTEGER,
            experiencia_permitida SMALLINT NOT NULL DEFAULT 1,
            alerta_juridico TEXT,
            carencia_dias INTEGER,
            dentro_carencia SMALLINT NOT NULL DEFAULT 0,
            ficha_json TEXT NOT NULL,
            blocos_copiados TEXT,
            status TEXT NOT NULL DEFAULT 'pendente',
            prazo_limite TIMESTAMP,
            solicitado_por VARCHAR(255) NOT NULL,
            solicitado_por_id INTEGER NOT NULL,
            observacao_solicitante TEXT,
            resolvido_por VARCHAR(255),
            resolvido_por_id INTEGER,
            resolvido_data TIMESTAMP,
            parecer TEXT,
            employee_criado_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS recon_company ON recontratacao_solicitacoes (company_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS recon_status ON recontratacao_solicitacoes (company_id, status)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS recon_cpf ON recontratacao_solicitacoes (cpf)`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS recontratado_de_employee_id INTEGER`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS recontratado_de_company_id INTEGER`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS recontratado_data TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2755: tabela recontratacao_solicitacoes + colunas recontratado_de_* garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2755 recontratacao:`, e?.message || e); }

        // Rev. 2858 — COLETA DE CAMPO (RH): link externo por obra (token+QR, sem
        // login) + fila de revisão. Tabelas 100% aditivas; nenhuma coluna nova em
        // employees (todas já existem). RH aprova antes de gravar na ficha.
        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS coleta_rh_sessoes (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            obra_id INTEGER NOT NULL,
            token VARCHAR(64) NOT NULL,
            titulo VARCHAR(255),
            ativo SMALLINT NOT NULL DEFAULT 1,
            criado_por VARCHAR(255),
            criado_por_id INTEGER,
            expira_em TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
          )`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS coleta_rh_sessoes_token_uq ON coleta_rh_sessoes (token)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS coleta_rh_sessoes_company ON coleta_rh_sessoes (company_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS coleta_rh_sessoes_obra ON coleta_rh_sessoes (company_id, obra_id)`);
          await db.execute(sql`CREATE TABLE IF NOT EXISTS coleta_rh_respostas (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            sessao_id INTEGER NOT NULL,
            obra_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pendente',
            dados_json TEXT NOT NULL,
            foto_url TEXT,
            enviado_por VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            revisado_por VARCHAR(255),
            revisado_por_id INTEGER,
            revisado_em TIMESTAMP,
            motivo_rejeicao TEXT
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS coleta_rh_resp_sessao ON coleta_rh_respostas (sessao_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS coleta_rh_resp_status ON coleta_rh_respostas (company_id, status)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS coleta_rh_resp_emp ON coleta_rh_respostas (employee_id)`);
          console.log(`[SyncSchema+] Rev. 2858: tabelas coleta_rh_sessoes + coleta_rh_respostas garantidas (Coleta de Campo RH).`);
          // Rev. 2865 — seleção de grupos a coletar por link (NULL = todos).
          await db.execute(sql`ALTER TABLE coleta_rh_sessoes ADD COLUMN IF NOT EXISTS campos_json TEXT`);
          console.log(`[SyncSchema+] Rev. 2865: coluna campos_json garantida em coleta_rh_sessoes (escolha de grupos a coletar).`);
          // Rev. 2868 — soft-delete de link (excluir sem DELETE físico; R-001/R-007/R-010).
          await db.execute(sql`ALTER TABLE coleta_rh_sessoes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2868: coluna deleted_at garantida em coleta_rh_sessoes (excluir link = soft-delete).`);

          await db.execute(sql`ALTER TABLE coleta_rh_respostas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2872: coluna deleted_at garantida em coleta_rh_respostas (excluir resposta = soft-delete).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2858 coleta_rh:`, e?.message || e); }
        console.log(`[SyncSchema+] Tabelas DDS (dds_temas/dds_sessoes/dds_sessao_funcionarios) garantidas.`);

        // Tabelas do Portal do Cliente (comentários cliente↔FC e avaliações NPS)
        // Garantidas idempotentemente em todo startup pois o ColFix pode ser pulado
        // quando "Versão ok" — sem isso a tela de Comentários quebra com FK violation.
        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS cliente_comentarios (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            cliente_id INTEGER NOT NULL,
            obra_id INTEGER,
            autor_tipo VARCHAR(20) NOT NULL,
            autor_nome VARCHAR(255),
            mensagem TEXT NOT NULL,
            lido_em TIMESTAMP WITHOUT TIME ZONE,
            criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cc_company ON cliente_comentarios (company_id)`);

          // Rev. 1880 — Controle de Ferramentas de Terceiros (portaria de obra)
          // Tabelas garantidas idempotentemente no startup. Sem isso, a tela quebra
          // em ambientes onde o `drizzle migrate` não rodou (deploys diretos).
          await db.execute(sql`CREATE TABLE IF NOT EXISTS ferramentas_terceiros_registros (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            obra_id INTEGER,
            obra_nome VARCHAR(255),
            tipo VARCHAR(10) NOT NULL,
            data_hora TIMESTAMP NOT NULL DEFAULT NOW(),
            empresa_terceira VARCHAR(255) NOT NULL,
            cnpj VARCHAR(20),
            responsavel_nome VARCHAR(255) NOT NULL,
            responsavel_cpf VARCHAR(14),
            responsavel_telefone VARCHAR(20),
            quem_entregou VARCHAR(255),
            quem_recebeu VARCHAR(255),
            lancado_por_user_id INTEGER,
            lancado_por_nome VARCHAR(255),
            registro_pai_id INTEGER,
            foto_documento_url TEXT,
            observacoes TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'em_obra',
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMP
          )`);
          await db.execute(sql`CREATE TABLE IF NOT EXISTS ferramentas_terceiros_itens (
            id SERIAL PRIMARY KEY,
            registro_id INTEGER NOT NULL,
            company_id INTEGER NOT NULL,
            descricao VARCHAR(255) NOT NULL,
            marca VARCHAR(100),
            modelo VARCHAR(100),
            numero_serie VARCHAR(100),
            quantidade INTEGER NOT NULL DEFAULT 1,
            foto_url TEXT NOT NULL,
            condicao VARCHAR(20) NOT NULL DEFAULT 'boa',
            observacao TEXT,
            item_entrada_id INTEGER,
            status_item VARCHAR(20) NOT NULL DEFAULT 'na_obra',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ft_reg_company ON ferramentas_terceiros_registros (company_id) WHERE deleted_at IS NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ft_reg_obra ON ferramentas_terceiros_registros (obra_id) WHERE deleted_at IS NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ft_reg_pai ON ferramentas_terceiros_registros (registro_pai_id) WHERE deleted_at IS NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ft_item_reg ON ferramentas_terceiros_itens (registro_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ft_item_status ON ferramentas_terceiros_itens (status_item)`);
          // Rev. 1884 — múltiplas fotos por item. `foto_url` continua sendo a capa
          // (primeira foto) para retrocompat com queries antigas e fluxo de saída;
          // `fotos_urls` carrega TODAS (capa inclusa) para exibição em galeria.
          await db.execute(sql`ALTER TABLE ferramentas_terceiros_itens ADD COLUMN IF NOT EXISTS fotos_urls TEXT[]`);
          // Rev. 1885 — vínculos com cadastros (empresas_terceiras + funcionarios_terceiros)
          // e snapshot do código interno do usuário lançador, para auditoria/relatório.
          // Todas idempotentes — zero risco de quebrar produção (R-001/R-007/R-010).
          await db.execute(sql`ALTER TABLE ferramentas_terceiros_registros ADD COLUMN IF NOT EXISTS empresa_terceira_id INTEGER`);
          await db.execute(sql`ALTER TABLE ferramentas_terceiros_registros ADD COLUMN IF NOT EXISTS funcionario_terceiro_id INTEGER`);
          await db.execute(sql`ALTER TABLE ferramentas_terceiros_registros ADD COLUMN IF NOT EXISTS lancado_por_codigo_interno VARCHAR(20)`);
          console.log(`[SyncSchema+] Rev. 1880/1884/1885: tabelas ferramentas_terceiros_registros/itens garantidas (+ fotos_urls + vínculos cadastro).`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cc_cliente ON cliente_comentarios (cliente_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cc_obra ON cliente_comentarios (obra_id)`);
          await db.execute(sql`CREATE TABLE IF NOT EXISTS cliente_avaliacoes (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            obra_id INTEGER,
            obra_nome VARCHAR(255),
            nota_equipe INTEGER,
            nota_obra INTEGER,
            nota_atendimento INTEGER,
            nota_prazo INTEGER,
            nota_qualidade INTEGER,
            nota_geral INTEGER,
            comentario_positivo TEXT,
            comentario_melhoria TEXT,
            recomendaria SMALLINT,
            criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
          )`);
          // Rev. 1551 — sincroniza schema legado: bancos antigos têm
          // comentario_negativo (varchar) em vez de comentario_melhoria.
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_melhoria TEXT`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS recomendaria SMALLINT`);
          await db.execute(sql`UPDATE cliente_avaliacoes SET comentario_melhoria = comentario_negativo WHERE comentario_melhoria IS NULL AND comentario_negativo IS NOT NULL`).catch(() => {});
          await db.execute(sql`ALTER TABLE cliente_avaliacoes DROP COLUMN IF EXISTS comentario_negativo`).catch(() => {});
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ca_company ON cliente_avaliacoes (company_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS ca_obra ON cliente_avaliacoes (obra_id)`);
          // Rev. 1551 — Marcação anônima por mês: garante que cada
          // credencial (usuário do portal) só envie uma avaliação por
          // mês. NÃO referencia avaliação alguma — preserva o
          // anonimato do conteúdo (LGPD).
          // Anonimato máximo: NÃO guardamos timestamp (`marcado_em`)
          // pra evitar correlação temporal com cliente_avaliacoes.criado_em.
          // Só (cred_id, ano_mes) — nada mais.
          await db.execute(sql`CREATE TABLE IF NOT EXISTS cliente_avaliacao_marcacoes (
            cred_id INTEGER NOT NULL,
            ano_mes VARCHAR(7) NOT NULL,
            PRIMARY KEY (cred_id, ano_mes)
          )`);
          await db.execute(sql`ALTER TABLE cliente_avaliacao_marcacoes DROP COLUMN IF EXISTS marcado_em`).catch(() => {});
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cam_anomes ON cliente_avaliacao_marcacoes (ano_mes)`);
          // Rev. 1569 — novas perguntas (Empresa / Gestor), comentários por bloco,
          // período da avaliação (YYYY-MM ou YYYY) e cancelamento pelo Admin Master.
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS nota_empresa INTEGER`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS nota_gestor INTEGER`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_equipe TEXT`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_empresa TEXT`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_gestor TEXT`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS gestor_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS ano_periodo VARCHAR(7)`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMP WITHOUT TIME ZONE`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS cancelada_por VARCHAR(255)`);
          // Rev. 1592 — bloco Escritório Central
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS nota_escritorio INTEGER`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS nota_faturamento INTEGER`);
          await db.execute(sql`ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_escritorio TEXT`);
          await db.execute(sql`CREATE TABLE IF NOT EXISTS portal_cliente_config (
            company_id INTEGER PRIMARY KEY,
            periodicidade VARCHAR(8) NOT NULL DEFAULT 'mensal',
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
          )`);
          // Rev. 1595 — Editor do Questionário (perguntas extras + respostas)
          await db.execute(sql`CREATE TABLE IF NOT EXISTS cliente_perguntas_extras (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            ordem INTEGER NOT NULL DEFAULT 0,
            secao_titulo VARCHAR(80) NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            label VARCHAR(240) NOT NULL,
            ajuda TEXT,
            placeholder VARCHAR(240),
            obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
            ativa BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cpe_company_ordem ON cliente_perguntas_extras (company_id, ordem)`);
          // Rev. 1595 — Sem FK física p/ companies.id (a tabela companies não declara PK
          // no schema). Tenant isolation é garantida em todas as queries via filtro por companyId.
          await db.execute(sql`CREATE TABLE IF NOT EXISTS cliente_respostas_extras (
            id SERIAL PRIMARY KEY,
            avaliacao_id INTEGER NOT NULL REFERENCES cliente_avaliacoes(id) ON DELETE CASCADE,
            pergunta_id INTEGER NOT NULL REFERENCES cliente_perguntas_extras(id) ON DELETE CASCADE,
            valor_numero INTEGER,
            valor_texto TEXT
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cre_aval ON cliente_respostas_extras (avaliacao_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS cre_pergunta ON cliente_respostas_extras (pergunta_id)`);
          // Rev. 1597 — Override de RÓTULO das 8 perguntas CORE por empresa.
          // chave/tipo/secao continuam fixos no código (preservar NPS); só o
          // texto exibido pode ser personalizado pelo Admin Master.
          await db.execute(sql`CREATE TABLE IF NOT EXISTS cliente_perguntas_core_overrides (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            chave VARCHAR(60) NOT NULL,
            label VARCHAR(240) NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
          )`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS cpco_company_chave ON cliente_perguntas_core_overrides (company_id, chave)`);
          console.log(`[SyncSchema+] Tabelas Portal Cliente (comentarios + avaliacoes + config + perguntas/respostas extras + core overrides) garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA cliente_comentarios/avaliacoes:`, e?.message || e); }

        try {
          const colRows = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'timecard_daily' AND table_schema = 'public' ORDER BY column_name`);
          const colNames: string[] = ((colRows as any).rows ?? colRows ?? []).map((r: any) => r.column_name);
          const hasDualCompany = colNames.includes('companyid') && colNames.includes('companyId');
          const hasDualEmployee = colNames.includes('employeeid') && colNames.includes('employeeId');
          const hasDualMes = colNames.includes('mescompetencia') && colNames.includes('mesCompetencia');
          const hasDualStatus = colNames.includes('statusdia') && colNames.includes('statusDia');
          if (hasDualCompany || hasDualEmployee || hasDualMes || hasDualStatus) {
            console.log(`[TimecardFix] Dual columns detected! companyid/companyId:${hasDualCompany} employeeid/employeeId:${hasDualEmployee} mescompetencia/mesCompetencia:${hasDualMes} statusdia/statusDia:${hasDualStatus}`);
            const updates: string[] = [];
            if (hasDualCompany) updates.push(`"companyId" = COALESCE("companyId", companyid)`);
            if (hasDualEmployee) updates.push(`"employeeId" = COALESCE("employeeId", employeeid)`);
            if (hasDualMes) updates.push(`"mesCompetencia" = COALESCE("mesCompetencia", mescompetencia)`);
            if (hasDualStatus) updates.push(`"statusDia" = COALESCE("statusDia", statusdia)`);
            const snakeDuals = [
              ['horastrabalhadas', 'horasTrabalhadas'], ['horasextras', 'horasExtras'], ['horasnoturnas', 'horasNoturnas'],
              ['isfalta', 'isFalta'], ['isatraso', 'isAtraso'], ['issaidaantecipada', 'isSaidaAntecipada'],
              ['minutosatraso', 'minutosAtraso'], ['minutossaidaantecipada', 'minutosSaidaAntecipada'],
              ['tipodia', 'tipoDia'], ['timerecordid', 'timeRecordId'], ['obraid', 'obraId'],
              ['origemregistro', 'origemRegistro'], ['origem_registro', 'origemRegistro'],
              ['numbatidas', 'numBatidas'], ['num_batidas', 'numBatidas'],
              ['isinconsistente', 'isInconsistente'], ['is_inconsistente', 'isInconsistente'],
              ['inconsistenciatipo', 'inconsistenciaTipo'], ['inconsistencia_tipo', 'inconsistenciaTipo'],
              ['obrasecundariaid', 'obraSecundariaId'], ['obra_secundaria_id', 'obraSecundariaId'],
              ['rateiopercentual', 'rateioPercentual'], ['rateio_percentual', 'rateioPercentual'],
            ];
            for (const [lc, cc] of snakeDuals) {
              if (colNames.includes(lc) && colNames.includes(cc)) {
                updates.push(`"${cc}" = COALESCE("${cc}", "${lc}")`);
              }
            }
            if (updates.length > 0) {
              const updateSql = `UPDATE timecard_daily SET ${updates.join(', ')} WHERE "companyId" IS NULL AND companyid IS NOT NULL`;
              await db.execute(sql.raw(updateSql));
              console.log(`[TimecardFix] Migrated data from lowercase to camelCase columns (${updates.length} columns)`);
            }
          } else {
            console.log(`[TimecardFix] No dual columns detected in timecard_daily — OK`);
          }
        } catch (e: any) { console.log(`[TimecardFix] Skipped:`, e?.message || e); }

        try {
          const r: any = await db.execute(sql`
            UPDATE pj_contracts pc
            SET "status" = 'encerrado',
                "observacoes" = COALESCE(pc."observacoes" || E'\n', '') || '[Encerrado automaticamente — funcionário desligado (backfill)]',
                "updatedAt" = NOW()
            FROM employees e
            WHERE pc."employeeId" = e.id
              AND pc."status" IN ('ativo', 'pendente_assinatura', 'suspenso')
              AND pc."deletedAt" IS NULL
              AND (e."status" IN ('Desligado', 'Lista_Negra', 'Inativo') OR e."deletedAt" IS NOT NULL)
            RETURNING pc.id
          `);
          const rows = r?.rows ?? r ?? [];
          const n = Array.isArray(rows) ? rows.length : 0;
          if (n > 0) console.log(`[PJBackfill] Encerrados ${n} contrato(s) PJ de funcionários já desligados.`);
          else console.log(`[PJBackfill] Nenhum contrato PJ pendente de encerramento — OK`);
        } catch (e: any) { console.log(`[PJBackfill] Skipped:`, e?.message || e); }

        try {
          const r: any = await db.execute(sql`
            UPDATE employees e
            SET "tipoContrato" = 'PJ',
                "updatedAt" = NOW()
            WHERE EXISTS (
              SELECT 1 FROM pj_contracts pc
              WHERE pc."employeeId" = e.id
                AND pc."status" IN ('ativo', 'pendente_assinatura', 'suspenso')
                AND pc."deletedAt" IS NULL
            )
              AND COALESCE(e."tipoContrato",'') <> 'PJ'
              AND e."deletedAt" IS NULL
            RETURNING e.id, e."nomeCompleto", e."tipoContrato"
          `);
          const rows = r?.rows ?? r ?? [];
          const n = Array.isArray(rows) ? rows.length : 0;
          if (n > 0) {
            console.log(`[PJTipoFix] Corrigidos ${n} funcionário(s) com contrato PJ ativo mas tipoContrato divergente:`);
            for (const row of rows) {
              console.log(`  - id=${row.id} nome="${row.nomeCompleto}" → tipoContrato='PJ'`);
            }
          } else {
            console.log(`[PJTipoFix] Todos os funcionários com contratos PJ ativos já têm tipoContrato='PJ' — OK`);
          }
        } catch (e: any) { console.log(`[PJTipoFix] Skipped:`, e?.message || e); }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS pj_conformidade (
              id SERIAL PRIMARY KEY,
              "companyId" INTEGER NOT NULL,
              "employeeId" INTEGER NOT NULL,
              "tipo" VARCHAR(40) NOT NULL,
              "competencia" VARCHAR(7),
              "status" VARCHAR(20) NOT NULL DEFAULT 'pendente',
              "dataVencimento" DATE,
              "dataEnvio" DATE,
              "valor" NUMERIC(14,2),
              "documentoUrl" TEXT,
              "observacoes" TEXT,
              "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
              "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
              "deletedAt" TIMESTAMP
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pj_conformidade_employee ON pj_conformidade ("employeeId") WHERE "deletedAt" IS NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pj_conformidade_company ON pj_conformidade ("companyId") WHERE "deletedAt" IS NULL`);
          // Rev. 1327: anexos (nome original do arquivo) + flag de notificação por e-mail
          await db.execute(sql`ALTER TABLE pj_conformidade ADD COLUMN IF NOT EXISTS "arquivoNome" VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE notification_recipients ADD COLUMN IF NOT EXISTS "notificarConformidadePJ" SMALLINT NOT NULL DEFAULT 1`);

          // Rev. 1386 — Reservas Preventivas + Travamento Progressivo
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS compras_reservas_saldo (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              obra_id INTEGER,
              cotacao_id INTEGER,
              ordem_id INTEGER,
              responsavel_original_id INTEGER,
              responsavel_original_nome VARCHAR(255),
              valor_di08_reservado NUMERIC(14,2) NOT NULL DEFAULT 0,
              valor_economia_reservada NUMERIC(14,2) NOT NULL DEFAULT 0,
              prazo_limite TIMESTAMP WITHOUT TIME ZONE NOT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'ativa',
              motivo TEXT,
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
              atualizado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crs_company ON compras_reservas_saldo (company_id);`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crs_obra ON compras_reservas_saldo (obra_id);`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crs_cotacao ON compras_reservas_saldo (cotacao_id);`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crs_status ON compras_reservas_saldo (status);`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crs_responsavel ON compras_reservas_saldo (responsavel_original_id);`);

          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS compras_reservas_log (
              id SERIAL PRIMARY KEY,
              reserva_id INTEGER NOT NULL,
              acao VARCHAR(30) NOT NULL,
              executado_por_id INTEGER,
              executado_por_nome VARCHAR(255),
              prazo_adicional_dias INTEGER,
              motivo TEXT,
              valor_impactado NUMERIC(14,2),
              detalhes TEXT,
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crl_reserva ON compras_reservas_log (reserva_id);`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS crl_acao ON compras_reservas_log (acao);`);
          // Rev. 1633 — Alertas push financeiros (FASE 2 CFO Suite)
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS financial_alerts (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              tipo VARCHAR(40) NOT NULL,
              severidade VARCHAR(20) NOT NULL DEFAULT 'info',
              titulo VARCHAR(200) NOT NULL,
              mensagem TEXT,
              dados JSONB,
              lida SMALLINT NOT NULL DEFAULT 0,
              lida_em TIMESTAMP WITHOUT TIME ZONE,
              lida_por VARCHAR(64),
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS fa_company_lida ON financial_alerts (company_id, lida, criado_em DESC);`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS pj_conformidade_alertas (
              id SERIAL PRIMARY KEY,
              "companyId" INTEGER NOT NULL,
              "competencia" VARCHAR(7) NOT NULL,
              "checksum" VARCHAR(64) NOT NULL,
              "enviadoEm" TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pj_conformidade_alertas ON pj_conformidade_alertas ("companyId","competencia","checksum")`);
          // Dedupe defensivo: marca como deletadas duplicatas históricas antes de criar índices únicos
          // (mantém apenas a linha mais recente por chave lógica). Para tabela nova é no-op.
          const dedupMensal: any = await db.execute(sql`
            UPDATE pj_conformidade SET "deletedAt" = NOW()
            WHERE id IN (
              SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY "employeeId","tipo","competencia"
                  ORDER BY "createdAt" DESC, id DESC
                ) AS rn
                FROM pj_conformidade
                WHERE "deletedAt" IS NULL AND "competencia" IS NOT NULL
              ) t WHERE t.rn > 1
            )
            RETURNING id
          `);
          const dedupVigente: any = await db.execute(sql`
            UPDATE pj_conformidade SET "deletedAt" = NOW()
            WHERE id IN (
              SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY "employeeId","tipo"
                  ORDER BY "createdAt" DESC, id DESC
                ) AS rn
                FROM pj_conformidade
                WHERE "deletedAt" IS NULL AND "competencia" IS NULL
              ) t WHERE t.rn > 1
            )
            RETURNING id
          `);
          const nDedup = (dedupMensal?.rows?.length ?? 0) + (dedupVigente?.rows?.length ?? 0);
          if (nDedup > 0) console.log(`[PJConformidade] Dedupe: ${nDedup} linhas duplicadas marcadas como deletadas.`);
          // Garante idempotência do upsert: 1 linha por (employee, tipo, competencia) para mensais e 1 por (employee, tipo) para vigentes
          try {
            await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pj_conformidade_mensal ON pj_conformidade ("employeeId","tipo","competencia") WHERE "deletedAt" IS NULL AND "competencia" IS NOT NULL`);
            await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pj_conformidade_vigente ON pj_conformidade ("employeeId","tipo") WHERE "deletedAt" IS NULL AND "competencia" IS NULL`);
          } catch (idxErr: any) {
            console.error(`[PJConformidade] FALHA ao criar índices únicos (verifique duplicatas residuais):`, idxErr?.message || idxErr);
          }
          console.log(`[PJConformidade] Tabela pj_conformidade garantida.`);
        } catch (e: any) { console.log(`[PJConformidade] Skipped:`, e?.message || e); }

        // Rev. 2079 — Assinaturas de Comunicados Internos (lista de assinatura digital).
        // Garantida idempotentemente no startup para evitar quebra em deploys diretos.
        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicado_assinaturas (
            id SERIAL PRIMARY KEY,
            comunicado_id INTEGER NOT NULL,
            company_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            assinatura_base64 TEXT NOT NULL,
            assinado_em TIMESTAMP NOT NULL DEFAULT NOW(),
            ip VARCHAR(64),
            registrado_por VARCHAR(255),
            registrado_por_user_id INTEGER
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_com_assin_comunicado ON comunicado_assinaturas (comunicado_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_com_assin_company ON comunicado_assinaturas (company_id)`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_com_assin_comunicado_emp ON comunicado_assinaturas (comunicado_id, employee_id)`);
          console.log(`[SyncSchema+] Rev. 2079: tabela comunicado_assinaturas garantida.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2079 comunicado_assinaturas:`, e?.message || e); }

        // Rev. 2082 — link Categoria (financial_accounts) → Centro de Custo (financial_cost_centers).
        // Coluna opcional; permite que ao cadastrar a categoria inline no modal "Novo Lançamento" o
        // usuário já associe a um centro de custo existente.
        try {
          await db.execute(sql`ALTER TABLE financial_accounts ADD COLUMN IF NOT EXISTS centro_custo_id INTEGER`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_fa_centro_custo ON financial_accounts (centro_custo_id)`);
          // Unique parcial — bloqueia duplicatas case-insensitive por empresa (apenas categorias ativas).
          // Tolerante a dados legados duplicados: cai pro WARNING se já existir conflito (não quebra startup).
          try {
            await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_fa_company_lower_nome_ativo ON financial_accounts (company_id, LOWER(nome)) WHERE ativo = 1`);
          } catch (e: any) {
            console.warn(`[SyncSchema+] Rev. 2082 unique idx falhou (provavelmente duplicatas legadas):`, e?.message || e);
          }
          console.log(`[SyncSchema+] Rev. 2082: coluna centro_custo_id garantida em financial_accounts.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2082 financial_accounts.centro_custo_id:`, e?.message || e); }

        // Rev. 2125+2126 — Numeração sequencial automática do Contrato de Experiência.
        // Counter atômico por (company_id, ano, tipo) — espelha padrão de
        // compras_sc_counters (Rev. 1799). Counter começa em 0 → primeira
        // alocação no ano vira 001/AAAA (Rev. 2126: corrigido após user
        // reclamar que "não zerou o número do contrato"; eu havia interpretado
        // mal o pedido original e seedado com 33).
        try {
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS numero_contrato_experiencia INTEGER`);
          await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS numero_contrato_experiencia_ano INTEGER`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS contract_counters (
              company_id INTEGER NOT NULL,
              ano INTEGER NOT NULL,
              tipo VARCHAR(50) NOT NULL,
              ultimo_seq INTEGER NOT NULL DEFAULT 0,
              atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_counters_company_ano_tipo ON contract_counters (company_id, ano, tipo)`);
          // Rev. 2126 — ONE-SHOT IDEMPOTENTE: desfaz o seed errado da Rev. 2125.
          // Reseta counter de qualquer linha que esteja exatamente em 33 ou 34
          // (== seed bruto OU seed+1 da única alocação ruim). Se a empresa já
          // avançou legitimamente além disso (ex.: seq>=35), NÃO mexe — preserva
          // a numeração já emitida. Idempotente: roda a cada boot sem efeito
          // colateral (após reset, seq=0; condição não bate mais).
          await db.execute(sql`
            UPDATE contract_counters
            SET ultimo_seq = 0, atualizado_em = NOW()
            WHERE tipo = 'contrato_experiencia' AND ultimo_seq IN (33, 34)
          `);
          // Limpa apenas as alocações que vieram do seed-34 (não toca em
          // qualquer numero >= 35, que seria emissão legítima posterior).
          await db.execute(sql`
            UPDATE employees
            SET numero_contrato_experiencia = NULL,
                numero_contrato_experiencia_ano = NULL
            WHERE numero_contrato_experiencia = 34
          `);
          console.log(`[SyncSchema+] Rev. 2125+2126: contract_counters + employees.numero_contrato_experiencia(+_ano) garantidos (counter zerado, próxima alocação = 001).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2125/2126 contract_counters:`, e?.message || e); }

        // Rev. 2127 — Backfill de email em signature_signers pendentes.
        // Sessões criadas antes da Rev. 2127 não tinham email (FCSignSendDialog
        // só mandava role/nome/cpf) → alerta global `pendingForCurrentUser`
        // não conseguia casar com user logado → assinante não recebia aviso.
        // Aqui resolve retroativamente:
        //  - role='empregado' → employees.email via signatureSessions.employeeId
        //  - demais roles → users.email por match LOWER(name)
        // Idempotente: só atualiza linhas onde email IS NULL E signedAt IS NULL.
        try {
          const r1 = await db.execute(sql`
            UPDATE signature_signers ss
            SET email = LOWER(TRIM(e.email))
            FROM signature_sessions sess
            JOIN employees e ON e.id = sess.employee_id
            WHERE ss.session_id = sess.id
              AND ss.role = 'empregado'
              AND ss.email IS NULL
              AND ss.signed_at IS NULL
              AND e.email IS NOT NULL
              AND TRIM(e.email) <> ''
          `);
          // Nota: tabela `users` usa colunas camelCase quoted (`"deletedAt"`,
          // não `deleted_at`) — convenção Drizzle. Mesma armadilha que
          // pegou companies na Rev. 2125.
          const r2 = await db.execute(sql`
            UPDATE signature_signers ss
            SET email = LOWER(TRIM(u.email))
            FROM users u
            WHERE ss.role <> 'empregado'
              AND ss.email IS NULL
              AND ss.signed_at IS NULL
              AND LOWER(u.name) = LOWER(ss.nome)
              AND u."deletedAt" IS NULL
              AND u.email IS NOT NULL
              AND TRIM(u.email) <> ''
          `);
          console.log(`[SyncSchema+] Rev. 2127: backfill email em signature_signers pendentes — empregado=${(r1 as any)?.rowCount ?? '?'} / outros=${(r2 as any)?.rowCount ?? '?'}.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2127 backfill signers.email:`, e?.message || e); }

        // Rev. 2134 — Backfill de employee_contracts pra sessões FCSign de
        // contrato_experiencia já existentes (criadas antes da Rev. 2134).
        // Insere uma linha em employee_contracts pra cada sessão NÃO-cancelada
        // de tipo='contrato_experiencia' cujo employee NÃO tenha contrato
        // experiencia ativo. Se a sessão já está completa, anexa também
        // finalDocumentUrl como contratoAssinadoUrl. Idempotente.
        try {
          // Nota: employee_contracts e employees usam colunas camelCase quoted
          // (convenção Drizzle sem explicit name), enquanto signature_sessions
          // usa snake_case explicit. Mesma armadilha que pegou users em 2127.
          const rBf = await db.execute(sql`
            INSERT INTO employee_contracts (
              "companyId", "employeeId", tipo, status, "dataInicio",
              funcao, "salarioBase", "valorHora", "jornadaTrabalho",
              "conteudoGerado", "contratoAssinadoUrl", "criadoPor", "criadoPorUserId"
            )
            SELECT
              sess.company_id,
              sess.employee_id,
              'experiencia',
              'vigente',
              COALESCE(emp."dataAdmissao", CURRENT_DATE),
              COALESCE(emp.funcao, emp.cargo),
              emp."salarioBase",
              emp."valorHora",
              emp."jornadaTrabalho",
              sess.document_html,
              sess.final_document_url,
              'FCSign',
              sess.created_by_user_id
            FROM signature_sessions sess
            JOIN employees emp ON emp.id = sess.employee_id
            WHERE sess.tipo = 'contrato_experiencia'
              AND sess.status <> 'cancelado'
              AND NOT EXISTS (
                SELECT 1 FROM employee_contracts ec
                WHERE ec."employeeId" = sess.employee_id
                  AND ec.tipo = 'experiencia'
                  AND ec.status NOT IN ('encerrado', 'rescindido')
              )
          `);
          console.log(`[SyncSchema+] Rev. 2134: backfill employee_contracts p/ sessões FCSign contrato_experiencia — inseridos=${(rBf as any)?.rowCount ?? '?'}.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2134 backfill employee_contracts:`, e?.message || e); }

        // Rev. 2141 — Templates institucionais FC com versionamento completo.
        // Tabelas system_document_templates + system_document_template_versions
        // garantidas no startup. Não toca em document_templates legado (usado
        // pelo controleDocumentos.ts) — isolamento total dos templates
        // institucionais (Contrato Experiência, Termo Responsabilidade,
        // Comunicado, Advertência, Aviso Prévio, Termo Rescisão, Carta MDO).
        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS system_document_templates (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(60) NOT NULL,
            titulo VARCHAR(200) NOT NULL,
            descricao TEXT,
            conteudo_html TEXT NOT NULL,
            versao_atual INTEGER NOT NULL DEFAULT 1,
            ativo SMALLINT NOT NULL DEFAULT 1,
            atualizado_por_id INTEGER,
            atualizado_por_nome VARCHAR(255),
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            codigo VARCHAR(40),
            status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
            elaborado_por_id INTEGER,
            elaborado_por_nome VARCHAR(255),
            aprovado_por_id INTEGER,
            aprovado_por_nome VARCHAR(255),
            aprovado_em TIMESTAMP,
            data_vigencia VARCHAR(20),
            proxima_revisao VARCHAR(20)
          )`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_doc_tpl_tipo ON system_document_templates (tipo)`);
          await db.execute(sql`CREATE TABLE IF NOT EXISTS system_document_template_versions (
            id SERIAL PRIMARY KEY,
            template_id INTEGER NOT NULL,
            versao INTEGER NOT NULL,
            conteudo_html TEXT NOT NULL,
            comentario TEXT,
            criado_por_id INTEGER,
            criado_por_nome VARCHAR(255),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_doc_tpl_ver_tpl_versao ON system_document_template_versions (template_id, versao)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sys_doc_tpl_ver_tpl ON system_document_template_versions (template_id)`);
          // Rev. 2747 — Controle ISO documental: colunas aditivas garantidas em
          // tabelas system_document_templates PRÉ-EXISTENTES (criadas na Rev. 2141
          // sem estas colunas). ADD COLUMN IF NOT EXISTS — zero destrutivo (R-001/R-007/R-010).
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS codigo VARCHAR(40)`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'rascunho'`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS elaborado_por_id INTEGER`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS elaborado_por_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS aprovado_por_id INTEGER`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS aprovado_por_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS data_vigencia VARCHAR(20)`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS proxima_revisao VARCHAR(20)`);
          await db.execute(sql`ALTER TABLE system_document_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2141: tabelas system_document_templates + versions garantidas.`);
          console.log(`[SyncSchema+] Rev. 2747: colunas ISO documentais garantidas em system_document_templates.`);
          console.log(`[SyncSchema+] Rev. 2754: coluna deleted_at (soft-delete) garantida em system_document_templates.`);
          // Rev. 2747 — Auto-seed dos 7 documentos institucionais quando a tabela
          // está vazia, garantindo que NENHUM tipo fique "Não criado" sem ação
          // manual (acceptance Task #59). Idempotente: só roda com count=0
          // (instalação nova / Neon recém-provisionado). Em bancos já populados
          // ou com lacunas pontuais, a aba oferece "Inicializar padrões".
          try {
            const cntRes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM system_document_templates`);
            const cntRow = ((cntRes as any)?.rows ?? cntRes)?.[0] ?? {};
            const n = Number(cntRow.n ?? 0);
            if (n === 0) {
              const hoje = new Date().toISOString().slice(0, 10);
              for (const meta of DOCUMENT_TEMPLATES_META) {
                const seed = getSeedTemplate(meta.tipo);
                const insRes = await db.execute(sql`
                  INSERT INTO system_document_templates
                    (tipo, titulo, descricao, conteudo_html, versao_atual, ativo,
                     atualizado_por_nome, codigo, status, elaborado_por_nome,
                     aprovado_por_nome, aprovado_em, data_vigencia)
                  VALUES
                    (${meta.tipo}, ${meta.titulo}, ${meta.descricao}, ${seed.conteudoHtml}, 1, 1,
                     'Sistema', ${seed.codigo}, 'vigente', 'Sistema',
                     'Sistema', NOW(), ${hoje})
                  ON CONFLICT (tipo) DO NOTHING
                  RETURNING id`);
                const insRow = ((insRes as any)?.rows ?? insRes)?.[0] ?? {};
                const newId = Number(insRow.id ?? 0);
                if (newId) {
                  await db.execute(sql`
                    INSERT INTO system_document_template_versions
                      (template_id, versao, conteudo_html, comentario, criado_por_nome)
                    VALUES (${newId}, 1, ${seed.conteudoHtml}, 'Seed institucional automático (Rev. 2747)', 'Sistema')
                    ON CONFLICT (template_id, versao) DO NOTHING`);
                }
              }
              console.log(`[SyncSchema+] Rev. 2747: auto-seed de ${DOCUMENT_TEMPLATES_META.length} documentos institucionais (tabela estava vazia → todos como Rev. 1 VIGENTE).`);
            }
          } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2747 auto-seed system_document_templates:`, e?.message || e); }
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2141 system_document_templates:`, e?.message || e); }

        // Rev. 2179 — Split de HE por origem (aprovada / sem_solicitacao).
        // Coluna aditiva em he_period_employees; default mantém comportamento
        // antigo (linhas antigas viram "Sem solicitação" no UI).
        try {
          await db.execute(sql`ALTER TABLE he_period_employees ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'sem_solicitacao'`);
          console.log(`[SyncSchema+] Rev. 2179: coluna origem garantida em he_period_employees.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2179 he_period_employees.origem:`, e?.message || e); }

        // Rev. 2180 — Garantir colunas que payrollEngine.ts já escreve mas que
        // estavam ausentes em DBs antigos (ex.: dev limpo): valeResultJson,
        // pagamentoResultJson, afericaoResultJson, aplicarDsr*, *ConsolidadoEm/Por.
        // Sem elas, `UPDATE payroll_periods SET "valeResultJson" = ...` em
        // gerarVale (linha 2515) falhava por "column does not exist", o try/catch
        // externo jogava TRPCError, payroll_advances ficavam gravados mas
        // valeGeradoEm/totalVale nunca eram setados — Lilian via "Calcular Vale"
        // gerar resultado uma vez, recarregar e o vale "sumia".
        try {
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeResultJson" text`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "pagamentoResultJson" text`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "afericaoResultJson" text`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "aplicarDsrFalta" smallint NOT NULL DEFAULT 1`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "aplicarDsrAtraso" smallint NOT NULL DEFAULT 1`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeConsolidadoEm" timestamp`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeConsolidadoPor" varchar(255)`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "heConsolidadoEm" timestamp`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "heConsolidadoPor" varchar(255)`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "afericaoConsolidadoEm" timestamp`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "afericaoConsolidadoPor" varchar(255)`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "pagamentoConsolidadoEm" timestamp`);
          await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "pagamentoConsolidadoPor" varchar(255)`);
          console.log(`[SyncSchema+] Rev. 2180: colunas faltantes em payroll_periods garantidas (valeResultJson, *ResultJson, aplicarDsr*, *ConsolidadoEm/Por).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2180 payroll_periods columns:`, e?.message || e); }

        // Rev. 2192 — Nome+timestamp do responsável no momento da coleta da
        // assinatura do EPI. Bloco isolado (não dentro do DO $$ EXCEPTION
        // do Bloco2, que falha silenciosamente em DBs antigos). Sem essas
        // colunas, salvarAssinatura quebra com "column does not exist"
        // quando tipoAssinante=responsavel.
        try {
          await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_url TEXT`);
          await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_em TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2192: colunas assinatura_responsavel_{url,nome,em} garantidas em epi_deliveries.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2192 epi_deliveries.assinatura_responsavel_*:`, e?.message || e); }

        // Rev. 2195: Encargos Sociais sobre Folha — tabela nova pra upload
        // de guias DCTFWeb (DARF INSS/IRRF/Terceiros) e FGTS Digital que
        // a contabilidade terceirizada envia mensalmente. Bloco isolado
        // padrão Rev. 2180 (DO $$ EXCEPTION WHEN OTHERS falha silente em
        // DBs antigos).
        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS encargos_sociais_documentos (
            id SERIAL NOT NULL,
            company_id INTEGER NOT NULL,
            competencia VARCHAR(7) NOT NULL,
            tipo VARCHAR(30) NOT NULL,
            numero_documento VARCHAR(60),
            data_vencimento VARCHAR(10),
            valor_total VARCHAR(20) NOT NULL DEFAULT '0',
            pdf_url TEXT NOT NULL,
            pdf_file_name VARCHAR(255),
            itens_json TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'importado',
            uploaded_por VARCHAR(255),
            uploaded_em TIMESTAMP DEFAULT NOW(),
            validado_por VARCHAR(255),
            validado_em TIMESTAMP,
            enviado_financeiro_por VARCHAR(255),
            enviado_financeiro_em TIMESTAMP,
            observacoes TEXT,
            deleted_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id)
          )`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS encargos_sociais_company_comp ON encargos_sociais_documentos (company_id, competencia)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS encargos_sociais_tipo ON encargos_sociais_documentos (tipo)`);
          console.log(`[SyncSchema+] Rev. 2195: tabela encargos_sociais_documentos garantida.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2195 encargos_sociais_documentos:`, e?.message || e); }

        // Rev. 2308 — Importação em lote de contratos de locação via PDF da locadora.
        // 4 colunas aditivas em equipamentos_locados pra suportar agrupamento por
        // contrato do fornecedor + rastreio do PDF original. R-001/R-007/R-010: OK
        // (apenas ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).
        // Pula se a tabela ainda não existe (dev local sem `pnpm db:push`).
        // Rev. 2319 — CREATE TABLE IF NOT EXISTS para equipamentos_locados +
        // equipamento_locado_eventos (a Rev. 2308 esqueceu de criar as tabelas
        // pelo SyncSchema+, dependendo de `pnpm db:push` — que nunca rodou em
        // alguns ambientes, quebrando a importação PDF no INSERT). R-001/R-007/
        // R-010: OK (apenas CREATE TABLE/INDEX IF NOT EXISTS + ADD COLUMN IF
        // NOT EXISTS — nenhum DROP/ALTER destrutivo).
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS equipamentos_locados (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              obra_id INTEGER,
              fornecedor_id INTEGER,
              fornecedor_nome VARCHAR(255),
              ordem_compra_id INTEGER,
              contrato_locacao_id INTEGER,
              codigo_patrimonio_fornecedor VARCHAR(100),
              codigo_interno_erp VARCHAR(50),
              descricao VARCHAR(255) NOT NULL,
              categoria VARCHAR(100),
              numero_serie VARCHAR(100),
              data_inicio VARCHAR(10) NOT NULL,
              data_fim_prevista VARCHAR(10) NOT NULL,
              data_fim_real VARCHAR(10),
              valor_diario NUMERIC(14,2),
              valor_mensal NUMERIC(14,2),
              status VARCHAR(30) NOT NULL DEFAULT 'em_uso',
              fotos_recebimento_json JSONB,
              fotos_devolucao_json JSONB,
              funcionario_responsavel_id INTEGER,
              funcionario_responsavel_nome VARCHAR(255),
              observacoes TEXT,
              oc_anterior_id INTEGER,
              ultimo_check_in_data VARCHAR(10),
              ultimo_check_in_user_id INTEGER,
              numero_contrato_fornecedor VARCHAR(50),
              atendente_responsavel VARCHAR(255),
              arquivo_origem_url TEXT,
              valor_subtotal_contrato NUMERIC(14,2),
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_loc_company_status ON equipamentos_locados (company_id, status)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_loc_obra ON equipamentos_locados (obra_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_loc_fornecedor ON equipamentos_locados (fornecedor_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_loc_data_fim ON equipamentos_locados (data_fim_prevista)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_loc_oc ON equipamentos_locados (ordem_compra_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_loc_num_contrato ON equipamentos_locados (company_id, numero_contrato_fornecedor)`);

          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS equipamento_locado_eventos (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              equipamento_locado_id INTEGER NOT NULL,
              tipo VARCHAR(40) NOT NULL,
              data_evento TIMESTAMP NOT NULL DEFAULT NOW(),
              funcionario_id INTEGER,
              funcionario_nome VARCHAR(255),
              obra_id INTEGER,
              obra_nome VARCHAR(255),
              fotos_json JSONB,
              observacao TEXT,
              usuario_id INTEGER,
              usuario_nome VARCHAR(255),
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_evt_equip ON equipamento_locado_eventos (equipamento_locado_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_evt_tipo_data ON equipamento_locado_eventos (tipo, data_evento)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_evt_company ON equipamento_locado_eventos (company_id)`);
          // Rev. 2453 — colunas de assinatura + token do PDF de comprovante.
          await db.execute(sql`ALTER TABLE equipamento_locado_eventos ADD COLUMN IF NOT EXISTS assinatura_entregador_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE equipamento_locado_eventos ADD COLUMN IF NOT EXISTS assinatura_entregador_url TEXT`);
          await db.execute(sql`ALTER TABLE equipamento_locado_eventos ADD COLUMN IF NOT EXISTS assinatura_recebedor_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE equipamento_locado_eventos ADD COLUMN IF NOT EXISTS assinatura_recebedor_url TEXT`);
          await db.execute(sql`ALTER TABLE equipamento_locado_eventos ADD COLUMN IF NOT EXISTS pdf_comprovante_token VARCHAR(64)`);

          // ADDs idempotentes (caso a tabela já existisse de uma versão antiga sem essas colunas).
          await db.execute(sql`ALTER TABLE equipamentos_locados ADD COLUMN IF NOT EXISTS numero_contrato_fornecedor VARCHAR(50)`);
          await db.execute(sql`ALTER TABLE equipamentos_locados ADD COLUMN IF NOT EXISTS atendente_responsavel VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE equipamentos_locados ADD COLUMN IF NOT EXISTS arquivo_origem_url TEXT`);
          await db.execute(sql`ALTER TABLE equipamentos_locados ADD COLUMN IF NOT EXISTS valor_subtotal_contrato NUMERIC(14,2)`);
          // Rev. 2340 — foto_url para imagem buscada por IA (Google Custom Search).
          // Idempotente; fallback visual quando o recebimento não teve fotos.
          await db.execute(sql`ALTER TABLE equipamentos_locados ADD COLUMN IF NOT EXISTS foto_url TEXT`);
          console.log(`[SyncSchema+] Rev. 2319+2340: tabelas equipamentos_locados + equipamento_locado_eventos garantidas (+ índices + colunas import-lote + foto_url IA).`);

          // Rev. 2355 — Biblioteca CURADA de fotos por descrição canônica.
          // Substitui a "busca por IA" (revs 2340-2350) que tinha baixa
          // acurácia por limitação dos provedores gratuitos. R-001/R-007/
          // R-010: OK — apenas CREATE TABLE/INDEX IF NOT EXISTS.
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS equipamentos_fotos_canonicas (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              descricao_normalizada VARCHAR(255) NOT NULL,
              descricao_original VARCHAR(255) NOT NULL,
              foto_url TEXT NOT NULL,
              criado_por INTEGER,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_fotos_canon_company ON equipamentos_fotos_canonicas (company_id)`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_fotos_canon_company_desc ON equipamentos_fotos_canonicas (company_id, descricao_normalizada)`);
          console.log(`[SyncSchema+] Rev. 2355: tabela equipamentos_fotos_canonicas garantida (biblioteca curada).`);

          // Rev. 2373 — Inventário Visual de Baias (insumos a granel: areia,
          // pedra, lajota). 2 tabelas novas + índices. R-001/R-007/R-010 OK:
          // só CREATE TABLE/INDEX IF NOT EXISTS, zero ALTER/DROP/DELETE.
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS almoxarifado_baias (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              obra_id INTEGER NOT NULL,
              item_id INTEGER,
              nome VARCHAR(200) NOT NULL,
              material VARCHAR(100) NOT NULL,
              unidade VARCHAR(20) NOT NULL DEFAULT 'm³',
              capacidade_estimada NUMERIC(14,3),
              foto_url TEXT,
              observacoes TEXT,
              ativo BOOLEAN DEFAULT TRUE,
              criado_por_id INTEGER,
              criado_por_nome VARCHAR(255),
              criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
              atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_almox_baias_company_obra ON almoxarifado_baias (company_id, obra_id)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_almox_baias_ativo ON almoxarifado_baias (company_id, ativo)`);

          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS almoxarifado_baia_leituras (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              baia_id INTEGER NOT NULL,
              percentual INTEGER NOT NULL,
              foto_url TEXT,
              observacoes TEXT,
              lida_por_id INTEGER,
              lida_por_nome VARCHAR(255),
              lida_em TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_almox_baia_leit_baia ON almoxarifado_baia_leituras (baia_id, lida_em DESC)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_almox_baia_leit_company ON almoxarifado_baia_leituras (company_id, lida_em DESC)`);
          // Rev. 2417 — coluna volume_estimado garantida (volume digitado em m³).
          await db.execute(sql`ALTER TABLE almoxarifado_baia_leituras ADD COLUMN IF NOT EXISTS volume_estimado NUMERIC(14,3)`);
          // Rev. 2422 — coluna movimentacao_id garantida (vínculo p/ "Desfazer aferição").
          await db.execute(sql`ALTER TABLE almoxarifado_baia_leituras ADD COLUMN IF NOT EXISTS movimentacao_id INTEGER`);
          console.log(`[SyncSchema+] Rev. 2373/2417/2422: tabelas almoxarifado_baias + almoxarifado_baia_leituras garantidas (inventário visual + volume_estimado + movimentacao_id).`);

          // Rev. 2510 — CREATE TABLE IF NOT EXISTS para equipamentos_proprios
          // (a tabela foi adicionada ao drizzle/schema.ts mas nunca tinha
          // bootstrap no SyncSchema+ — quebrava cadastro em qualquer ambiente
          // sem `pnpm db:push`, com erro "relation equipamentos_proprios does
          // not exist" mascarado como "Failed query: select id from ...").
          // R-001/R-007/R-010: OK (apenas CREATE TABLE/INDEX IF NOT EXISTS).
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS equipamentos_proprios (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              codigo_patrimonio VARCHAR(50) NOT NULL,
              descricao VARCHAR(255) NOT NULL,
              categoria VARCHAR(100),
              numero_serie VARCHAR(100),
              marca VARCHAR(100),
              modelo VARCHAR(100),
              data_aquisicao VARCHAR(10),
              valor_aquisicao NUMERIC(14,2),
              vida_util_meses INTEGER,
              custo_manut_medio_mes NUMERIC(14,2) DEFAULT 0,
              custo_seguro_medio_mes NUMERIC(14,2) DEFAULT 0,
              localizacao_atual_tipo VARCHAR(20) DEFAULT 'almoxarifado',
              localizacao_atual_obra_id INTEGER,
              status VARCHAR(20) NOT NULL DEFAULT 'disponivel',
              fotos_json JSONB,
              observacoes TEXT,
              ativo BOOLEAN DEFAULT TRUE,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_equip_proprio_company_patrimonio ON equipamentos_proprios (company_id, codigo_patrimonio)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_proprio_company_status ON equipamentos_proprios (company_id, status)`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_equip_proprio_categoria ON equipamentos_proprios (categoria)`);
          // Rev. 2514 — rastreabilidade (quem cadastrou). ADD COLUMN IF NOT
          // EXISTS é a única operação ALTER permitida pelo padrão do projeto
          // (R-001/R-007/R-010 proíbem DROP/DELETE, não ADD não-destrutivo).
          await db.execute(sql`ALTER TABLE equipamentos_proprios ADD COLUMN IF NOT EXISTS criado_por_user_id INTEGER`);
          await db.execute(sql`ALTER TABLE equipamentos_proprios ADD COLUMN IF NOT EXISTS criado_por_nome VARCHAR(255)`);
          console.log(`[SyncSchema+] Rev. 2510/2514: tabela equipamentos_proprios garantida (+ uniq patrimônio + índices + criado_por).`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2319/2340/2355/2373/2510 equipamentos_locados+proprios+baias (CREATE):`, e?.message || e); }

        // ── Rev. 2260 — Backfill `previsto_msp_pct` em obras antigas ──────
        // Decisão user (23/05/2026): a regra "PREVISTO = % PREVISTO do MSP /
        // REALIZADO = PercentComplete da raiz" precisa valer p/ todas as
        // obras existentes — sem re-importar XML uma a uma. Este bloco
        // re-popula `previsto_msp_pct` (NULL em imports antigos que só tinham
        // Texto6) calculando a MESMA fórmula que o MSP usa para Texto6 —
        // `Int(du(início→min(fim,statusDate)) / du(início→fim) * 100)` —
        // via `pctRaizMSP()` em `shared/diasUteis.ts`.
        //
        // Idempotente (só toca NULL, COALESCE preserva snapshots existentes
        // vindos do XML). Sentinel `backfill_msp_pct_v2260` garante 1 execução.
        // Re-imports futuros sobrescrevem com a fonte original via salvarAtividades.
        // %REALIZADO não é tocado: depende de Texto7 ou AD/(AD+RD) não persistidos.
        try {
          const { getCache, setCache } = await import("../services/startupCache");
          const SENTINEL = "backfill_msp_pct_v2260";
          if (await getCache(SENTINEL)) {
            console.log("[Backfill MSP %Previsto] Rev. 2260 já aplicado — pulando.");
          } else {
            const { pctRaizMSP } = await import("../../shared/diasUteis");
            const projs: any = await db.execute(sql`
              SELECT id, calendario_json
              FROM planejamento_projetos
              WHERE calendario_json IS NOT NULL
            `);
            const projRows: any[] = projs?.rows ?? [];
            let projsOk = 0, projsSkip = 0, ativsUpd = 0;
            for (const p of projRows) {
              let cal: any = null;
              try { cal = JSON.parse(p.calendario_json); } catch { projsSkip++; continue; }
              const statusDate: string | null = cal?.statusDateSnapshot ?? null;
              if (!statusDate) { projsSkip++; continue; }
              const ativs: any = await db.execute(sql`
                SELECT id, data_inicio, data_fim
                FROM planejamento_atividades
                WHERE projeto_id = ${p.id}
                  AND data_inicio IS NOT NULL
                  AND data_fim IS NOT NULL
                  AND COALESCE(is_grupo, false) = false
                  AND previsto_msp_pct IS NULL
              `);
              const ativRows: any[] = ativs?.rows ?? [];
              if (ativRows.length === 0) continue;
              const ids: number[] = [];
              const vals: string[] = [];
              for (const a of ativRows) {
                const ini = String(a.data_inicio).slice(0, 10);
                const fim = String(a.data_fim).slice(0, 10);
                let pct = 0;
                try { pct = pctRaizMSP(statusDate.slice(0, 10), ini, fim, cal); } catch { pct = 0; }
                if (!Number.isFinite(pct)) continue;
                // MSP Texto6 = Int(...) — equivalente a Math.floor p/ positivos
                const prevInt = Math.max(0, Math.min(100, Math.floor(pct)));
                ids.push(Number(a.id));
                vals.push(`WHEN ${Number(a.id)} THEN ${prevInt}`);
              }
              if (ids.length === 0) continue;
              const CHUNK = 500;
              for (let i = 0; i < ids.length; i += CHUNK) {
                const cIds = ids.slice(i, i + CHUNK);
                const cVals = vals.slice(i, i + CHUNK);
                // COALESCE preserva snapshot existente entre SELECT e UPDATE.
                await db.execute(sql.raw(`
                  UPDATE planejamento_atividades
                  SET previsto_msp_pct = COALESCE(previsto_msp_pct, (CASE id ${cVals.join(' ')} END)::numeric)
                  WHERE id IN (${cIds.join(',')})
                `));
              }
              ativsUpd += ids.length;
              projsOk++;
            }
            await setCache(SENTINEL, new Date().toISOString());
            console.log(`[Backfill MSP %Previsto] Rev. 2260: ${projsOk} obras processadas (${projsSkip} sem statusDate/cal), ${ativsUpd} atividades populadas.`);
          }
        } catch (e: any) { console.error(`[Backfill MSP %Previsto] FALHA Rev.2260:`, e?.message || e); }

        // ── Rev. 2655 — Baixa/pagamento detalhado (juros/descontos/outros + cheque tipo) ──
        try {
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS juros NUMERIC(15,2)`);
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS descontos NUMERIC(15,2)`);
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS outros NUMERIC(15,2)`);
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS cheque_tipo TEXT`);
          await db.execute(sql`ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS juros NUMERIC(15,2)`);
          await db.execute(sql`ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS descontos NUMERIC(15,2)`);
          await db.execute(sql`ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS outros NUMERIC(15,2)`);
          console.log(`[SyncSchema+] Rev. 2655: colunas juros/descontos/outros (financial_entries + financial_revenue) + cheque_tipo (financial_entries) garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2655 baixa detalhada:`, e?.message || e); }

        // ── Rev. 2657 — Anexo de documento por título no Contas a Pagar (boleto/NF/foto) ──
        try {
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS anexo_url TEXT`);
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS anexo_nome VARCHAR(255)`);
          console.log(`[SyncSchema+] Rev. 2657: colunas anexo_url/anexo_nome (financial_entries) garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2657 anexo título:`, e?.message || e); }

        // ── Rev. 2661 — Edição de títulos vinculados + registro de quem editou ──
        try {
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS editado_por_id INTEGER`);
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS editado_por_nome VARCHAR(255)`);
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS editado_em TIMESTAMP`);
          console.log(`[SyncSchema+] Rev. 2661: colunas editado_por_id/editado_por_nome/editado_em (financial_entries) garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2661 editor título:`, e?.message || e); }

        // ── Rev. 2693 — Transferência entre contas: liga as 2 pernas (saída+entrada) ──
        try {
          await db.execute(sql`ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS transferencia_grupo_id VARCHAR(36)`);
          console.log(`[SyncSchema+] Rev. 2693: coluna transferencia_grupo_id (financial_entries) garantida.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2693 transferencia_grupo_id:`, e?.message || e); }

        // ── Rev. 2694 — Empréstimo de ferramentas/equipamentos: colunas de rastreio (Rev. 2256) que nunca ganharam self-heal ──
        try {
          await db.execute(sql`ALTER TABLE warehouse_loans ADD COLUMN IF NOT EXISTS foto_devolucao_url TEXT`);
          await db.execute(sql`ALTER TABLE warehouse_loans ADD COLUMN IF NOT EXISTS equipamento_proprio_id INTEGER`);
          await db.execute(sql`ALTER TABLE warehouse_loans ADD COLUMN IF NOT EXISTS equipamento_locado_id INTEGER`);
          console.log(`[SyncSchema+] Rev. 2694: colunas foto_devolucao_url/equipamento_proprio_id/equipamento_locado_id (warehouse_loans) garantidas.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA Rev.2694 warehouse_loans rastreio:`, e?.message || e); }

      } catch (e: any) { console.error(`[SyncSchema+] ERROR:`, e?.message || e); }
    }).catch(e => console.error("[SyncSchema] Falha ao iniciar:", e));
    // Garantir colunas críticas adicionadas recentemente que o SyncSchema possa ter ignorado
    // ColFix version guard: pula todos os blocos se já foram aplicados nesta versão
    const COLFIX_VERSION = "v1775c-2026-05-14-gd-isolated-block";
    const colFixSkipPromise = import("../services/startupCache")
      .then(({ getCache }) => getCache("colfix_version"))
      .then(v => v === COLFIX_VERSION)
      .catch(() => false);
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) { console.log("[ColFix] Versão ok, pulando migrations."); return; }
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          -- Rev. 1434 — employee_integrations: garantir colunas novas (cliente_id, cliente_nome, data_vencimento, evidencia, registrado_por)
          ALTER TABLE IF EXISTS employee_integrations
            ADD COLUMN IF NOT EXISTS cliente_id      integer,
            ADD COLUMN IF NOT EXISTS cliente_nome    varchar(255),
            ADD COLUMN IF NOT EXISTS data_vencimento varchar(10),
            ADD COLUMN IF NOT EXISTS evidencia       text,
            ADD COLUMN IF NOT EXISTS registrado_por  integer;
        
          -- Rev. 1640 — Atender pelo Estoque (Almoxarifado) como fornecedor virtual no Mapa de Cotação
          ALTER TABLE IF EXISTS compras_cotacao_fornecedores
            ADD COLUMN IF NOT EXISTS is_estoque             boolean DEFAULT false,
            ADD COLUMN IF NOT EXISTS almoxarifado_origem_id integer;
        `);
        await db.execute(sql`
          DO $$ BEGIN
            BEGIN
              ALTER TABLE employee_integrations ALTER COLUMN tipo SET DEFAULT 'externa';
              ALTER TABLE employee_integrations ALTER COLUMN tipo TYPE varchar(20);
            EXCEPTION WHEN others THEN NULL; END;
            BEGIN
              ALTER TABLE employee_integrations ALTER COLUMN data_realizacao TYPE varchar(10) USING to_char(data_realizacao::date, 'YYYY-MM-DD');
            EXCEPTION WHEN others THEN NULL; END;
            -- Rev. 1386 — Reservas Preventivas (criadas no ColFix síncrono para garantir disponibilidade antes de servir requests)
            CREATE TABLE IF NOT EXISTS compras_reservas_saldo (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              obra_id INTEGER,
              cotacao_id INTEGER,
              ordem_id INTEGER,
              responsavel_original_id INTEGER,
              responsavel_original_nome VARCHAR(255),
              valor_di08_reservado NUMERIC(14,2) NOT NULL DEFAULT 0,
              valor_economia_reservada NUMERIC(14,2) NOT NULL DEFAULT 0,
              prazo_limite TIMESTAMP WITHOUT TIME ZONE NOT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'ativa',
              motivo TEXT,
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
              atualizado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS crs_company ON compras_reservas_saldo (company_id);
            CREATE INDEX IF NOT EXISTS crs_obra ON compras_reservas_saldo (obra_id);
            CREATE INDEX IF NOT EXISTS crs_cotacao ON compras_reservas_saldo (cotacao_id);
            CREATE INDEX IF NOT EXISTS crs_status ON compras_reservas_saldo (status);
            CREATE INDEX IF NOT EXISTS crs_responsavel ON compras_reservas_saldo (responsavel_original_id);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_crs_cotacao_ativa ON compras_reservas_saldo (cotacao_id) WHERE status = 'ativa';

            -- Rev. 1743 — UNIQUE constraint em (company_id, numero_sc) para impedir SCs duplicadas (race + colisão pós-exclusão).
            -- Cleanup idempotente ANTES de criar índice: renumera duplicatas existentes para próximos suffixes livres do mesmo ano.
            DO $body$
            DECLARE
              dup RECORD;
              v_year TEXT;
              v_max INT;
              v_new TEXT;
            BEGIN
              FOR dup IN
                SELECT id, company_id, numero_sc
                FROM (
                  SELECT id, company_id, numero_sc,
                         ROW_NUMBER() OVER (PARTITION BY company_id, numero_sc ORDER BY id) AS rn
                  FROM compras_solicitacoes
                  WHERE numero_sc ~ '^SC-\d{4}-\d+$'
                ) t WHERE rn > 1
                ORDER BY id
              LOOP
                v_year := SUBSTRING(dup.numero_sc FROM 4 FOR 4);
                SELECT COALESCE(MAX(CAST(SUBSTRING(numero_sc FROM 9) AS INTEGER)), 0)
                  INTO v_max
                  FROM compras_solicitacoes
                  WHERE company_id = dup.company_id
                    AND numero_sc LIKE 'SC-' || v_year || '-%'
                    AND numero_sc ~ ('^SC-' || v_year || '-\d+$');
                v_new := 'SC-' || v_year || '-' || LPAD((v_max + 1)::TEXT, 4, '0');
                UPDATE compras_solicitacoes SET numero_sc = v_new WHERE id = dup.id;
                RAISE NOTICE 'Rev1743: renumerado SC id=% company=% : % -> %', dup.id, dup.company_id, dup.numero_sc, v_new;
              END LOOP;
            END $body$;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_solicitacoes_numero ON compras_solicitacoes (company_id, numero_sc);

            CREATE TABLE IF NOT EXISTS compras_reservas_log (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL DEFAULT 0,
              reserva_id INTEGER NOT NULL,
              acao VARCHAR(30) NOT NULL,
              executado_por_id INTEGER,
              executado_por_nome VARCHAR(255),
              prazo_adicional_dias INTEGER,
              motivo TEXT,
              valor_impactado NUMERIC(14,2),
              detalhes TEXT,
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
            ALTER TABLE compras_reservas_log ADD COLUMN IF NOT EXISTS company_id INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS crl_company ON compras_reservas_log (company_id);
            CREATE INDEX IF NOT EXISTS crl_reserva ON compras_reservas_log (reserva_id);
            CREATE INDEX IF NOT EXISTS crl_acao ON compras_reservas_log (acao);

            -- Rev. 1387 — Advertências para Funcionários Terceiros
            CREATE TABLE IF NOT EXISTS warnings_terceiros (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              empresa_terceira_id INTEGER NOT NULL,
              funcionario_terceiro_id INTEGER,
              funcionario_nome_manual VARCHAR(255),
              funcionario_cpf_manual VARCHAR(20),
              funcionario_funcao_manual VARCHAR(120),
              tipo_advertencia TEXT NOT NULL,
              data_ocorrencia DATE NOT NULL,
              motivo TEXT NOT NULL,
              descricao TEXT,
              testemunhas TEXT,
              documento_url TEXT,
              sequencia INTEGER DEFAULT 1,
              aplicado_por VARCHAR(255),
              dias_suspensao INTEGER,
              obra_id INTEGER,
              obra_nome VARCHAR(255),
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
              created_by VARCHAR(255),
              deleted_at TIMESTAMP,
              deleted_by VARCHAR(255)
            );
            CREATE INDEX IF NOT EXISTS wt_company ON warnings_terceiros (company_id);
            CREATE INDEX IF NOT EXISTS wt_empresa ON warnings_terceiros (empresa_terceira_id);
            CREATE INDEX IF NOT EXISTS wt_func ON warnings_terceiros (funcionario_terceiro_id);
            CREATE INDEX IF NOT EXISTS wt_data ON warnings_terceiros (data_ocorrencia);
            ALTER TABLE warnings_terceiros ALTER COLUMN funcionario_terceiro_id DROP NOT NULL;
            ALTER TABLE warnings_terceiros ADD COLUMN IF NOT EXISTS funcionario_nome_manual VARCHAR(255);
            ALTER TABLE warnings_terceiros ADD COLUMN IF NOT EXISTS funcionario_cpf_manual VARCHAR(20);
            ALTER TABLE warnings_terceiros ADD COLUMN IF NOT EXISTS funcionario_funcao_manual VARCHAR(120);

            ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS diferencas TEXT;
            ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS consolidado BOOLEAN DEFAULT FALSE;
            -- Rev. 1534 — Janela de Recovery Schedule (AACE 23R-02). Quantas
            -- semanas o engenheiro escolheu pra diluir o débito acumulado.
            ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS recovery_window_semanas INTEGER DEFAULT 4;
            ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS module_access TEXT;
            -- Rev. 1510 — Escritório Central: acesso automático a todas as obras em andamento
            ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS acesso_todas_obras SMALLINT NOT NULL DEFAULT 0;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_marco BOOLEAN DEFAULT FALSE;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_indireta BOOLEAN DEFAULT FALSE;
            -- Rev. 1641 — Atividade externa (terceiro fora do escopo)
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_externa BOOLEAN DEFAULT FALSE;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS externa_responsavel VARCHAR(200);
            -- Rev. 1662 — Datas reais por atividade (visão LOTUS / Programação Semanal modelo gerenciadora)
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS data_inicio_real DATE;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS data_fim_real DATE;
            -- Rev. 1642 — Calendário de trabalho do MS Project (paridade 100%)
            ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS calendario_json TEXT;
            ALTER TABLE module_config ADD COLUMN IF NOT EXISTS disabled_pages TEXT;
            ALTER TABLE portal_credentials ADD COLUMN IF NOT EXISTS abas_liberadas TEXT;
            ALTER TABLE epis ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "previsaoRescisaoComplementar" TEXT;

            -- Rev. 1424 — Portal do Cliente (Fase 1)
            ALTER TABLE portal_credentials ADD COLUMN IF NOT EXISTS cliente_id INTEGER;
            CREATE INDEX IF NOT EXISTS pc_tipo_cliente ON portal_credentials (tipo, cliente_id);

            CREATE TABLE IF NOT EXISTS portal_password_resets (
              id SERIAL PRIMARY KEY,
              cred_id INTEGER NOT NULL,
              token VARCHAR(80) NOT NULL,
              expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
              usado_em TIMESTAMP WITHOUT TIME ZONE,
              created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS ppr_token ON portal_password_resets (token);
            CREATE INDEX IF NOT EXISTS ppr_cred ON portal_password_resets (cred_id);

            CREATE TABLE IF NOT EXISTS cliente_comentarios (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              cliente_id INTEGER NOT NULL,
              obra_id INTEGER,
              autor_tipo VARCHAR(20) NOT NULL,
              autor_nome VARCHAR(255),
              mensagem TEXT NOT NULL,
              lido_em TIMESTAMP WITHOUT TIME ZONE,
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS cc_company ON cliente_comentarios (company_id);
            CREATE INDEX IF NOT EXISTS cc_cliente ON cliente_comentarios (cliente_id);
            CREATE INDEX IF NOT EXISTS cc_obra ON cliente_comentarios (obra_id);

            CREATE TABLE IF NOT EXISTS cliente_avaliacoes (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              obra_id INTEGER,
              obra_nome VARCHAR(255),
              nota_equipe INTEGER,
              nota_obra INTEGER,
              nota_atendimento INTEGER,
              nota_prazo INTEGER,
              nota_qualidade INTEGER,
              nota_geral INTEGER,
              comentario_positivo TEXT,
              comentario_melhoria TEXT,
              recomendaria SMALLINT,
              criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
            ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS comentario_melhoria TEXT;
            ALTER TABLE cliente_avaliacoes ADD COLUMN IF NOT EXISTS recomendaria SMALLINT;
            CREATE INDEX IF NOT EXISTS ca_company ON cliente_avaliacoes (company_id);
            CREATE INDEX IF NOT EXISTS ca_obra ON cliente_avaliacoes (obra_id);
            CREATE INDEX IF NOT EXISTS ca_data ON cliente_avaliacoes (criado_em);
            CREATE TABLE IF NOT EXISTS cliente_avaliacao_marcacoes (
              cred_id INTEGER NOT NULL,
              ano_mes VARCHAR(7) NOT NULL,
              PRIMARY KEY (cred_id, ano_mes)
            );
            ALTER TABLE cliente_avaliacao_marcacoes DROP COLUMN IF EXISTS marcado_em;
            CREATE INDEX IF NOT EXISTS cam_anomes ON cliente_avaliacao_marcacoes (ano_mes);
            CREATE TABLE IF NOT EXISTS notification_views (
              user_id INTEGER NOT NULL,
              notification_key VARCHAR(100) NOT NULL,
              last_viewed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
              PRIMARY KEY (user_id, notification_key)
            );
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsReal" VARCHAR(20);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsEditadoManualmente" SMALLINT DEFAULT 0;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsEditadoEm" TIMESTAMP WITHOUT TIME ZONE;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsEditadoPor" VARCHAR(255);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "descontosAcerto" VARCHAR(20);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "descontosAcertoDesc" TEXT;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "acrescimosAcerto" VARCHAR(20);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "acrescimosAcertoDesc" TEXT;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "novoEmpregoAtivo" SMALLINT DEFAULT 0;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "novoEmpregoComunicadoEm" DATE;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "novoEmpregoCartaUrl" TEXT;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "descontarAvisoNaoCumprido" SMALLINT DEFAULT 0;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "canceladoPorNome" VARCHAR(255);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "canceladoPorId" INTEGER;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "dataCancelamento" TIMESTAMP WITHOUT TIME ZONE;
            -- Rev. 1639 — Baixa da rescisão complementar (uso interno) ─────────────
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS baixa_complementar_valor VARCHAR(20);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS baixa_complementar_data DATE;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS baixa_complementar_por VARCHAR(255);
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS baixa_complementar_obs TEXT;
            ALTER TABLE pj_contracts ADD COLUMN IF NOT EXISTS "revisao" VARCHAR(10) DEFAULT '01';
            ALTER TABLE pj_contracts ADD COLUMN IF NOT EXISTS "revisaoMotivo" TEXT;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS obra_id INTEGER;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS agente_causador VARCHAR(255);
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS houve_cat SMALLINT DEFAULT 0;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS motivo_sem_cat TEXT;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS status_acao_corretiva VARCHAR(50) DEFAULT 'Pendente';
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS prazo_acao_corretiva DATE;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS responsavel_acao VARCHAR(255);
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS atestado_id INTEGER;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS anexos_urls TEXT;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE;
            ALTER TABLE accidents ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS ajuste_inss VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS valor_liquido VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS bonus_valor VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS bonus_desc TEXT;
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS pensao_desconto VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS outros_descontos VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS outros_descontos_desc TEXT;
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS recibo_url TEXT;
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS recibo_nome VARCHAR(255);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS media_he VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS media_dsr_he VARCHAR(20);
            ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS arredondamento_provento VARCHAR(20);
            ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS modalidade_fd VARCHAR(20) DEFAULT 'normal';
            ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS fd_valor NUMERIC(14,2);
            ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS fd_pagador VARCHAR(20);
            ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS fd_bdi_item_id INTEGER;
            ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS criado_por_id INTEGER;
            ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
            ALTER TABLE smo_solicitacoes ADD COLUMN IF NOT EXISTS regime_contratacao VARCHAR(20) DEFAULT 'experiencia';
            ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS criado_por_id INTEGER;
            ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
            ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS aprovador_nome VARCHAR(255);
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS criado_por_id INTEGER;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS aprovador_nome VARCHAR(255);
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP WITHOUT TIME ZONE;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS numero_nf VARCHAR(100);
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS parcelas_json JSONB;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS anexos JSONB;
            ALTER TABLE financial_approvals ADD COLUMN IF NOT EXISTS aprovador_nome VARCHAR(255);
            ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS aprovador_nome VARCHAR(255);
            ALTER TABLE compras_cotacao_fornecedores ADD COLUMN IF NOT EXISTS modulo_medicao VARCHAR(30);
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS rejeitado_por VARCHAR(255);
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS rejeitado_em TIMESTAMP;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS data_inicio DATE;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS data_fim DATE;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS retencao_iss NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS retencao_inss NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS retencao_irrf NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS outras_retencoes NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS descontos NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS observacoes_retencao TEXT;
            ALTER TABLE terceiro_contratos ADD COLUMN IF NOT EXISTS perc_iss NUMERIC(6,3) DEFAULT 0;
            ALTER TABLE terceiro_contratos ADD COLUMN IF NOT EXISTS perc_inss NUMERIC(6,3) DEFAULT 0;
            ALTER TABLE terceiro_contratos ADD COLUMN IF NOT EXISTS perc_irrf NUMERIC(6,3) DEFAULT 0;
            ALTER TABLE terceiro_contratos ADD COLUMN IF NOT EXISTS perc_outras_retencoes NUMERIC(6,3) DEFAULT 0;
            -- Rev. 1393 — Fornecedor: tipos (Prestação de Serviço / Fornecedor)
            ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS is_prestador_servico BOOLEAN DEFAULT false;
            ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS is_fornecedor BOOLEAN DEFAULT true;
            ALTER TABLE ponto_consolidacao ADD COLUMN IF NOT EXISTS data_inicio_ciclo DATE;
            ALTER TABLE ponto_consolidacao ADD COLUMN IF NOT EXISTS data_fim_ciclo DATE;
            ALTER TABLE time_records ADD COLUMN IF NOT EXISTS "tipoDia" VARCHAR(20) DEFAULT 'normal';
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS morte_natural TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS morte_acidental TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS invalidez_acidente TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS invalidez_doenca TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS premio_vg TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS premio_apc TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS seguradora TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS cancelado_por TEXT;
            ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS data_vencimento_apolice TEXT;
            ALTER TABLE seguro_vida_importacoes ADD COLUMN IF NOT EXISTS pdf_dados TEXT;
            ALTER TABLE compras_ordens_itens ADD COLUMN IF NOT EXISTS cotacao_item_id INTEGER;
            ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS reter_sinal BOOLEAN DEFAULT FALSE;
            -- Atestados: horas_afastamento agora suporta minutos (1.75 = 1h45min)
            ALTER TABLE atestados ALTER COLUMN horas_afastamento TYPE NUMERIC(5,2) USING horas_afastamento::numeric;
          EXCEPTION WHEN OTHERS THEN NULL;
          END $$
        `);
        console.log("[ColFix] Bloco principal de ALTER TABLE OK");

        // Índice + backfill do ciclo da folha em ponto_consolidacao (Task #29 / #38)
        // O ciclo correto vai do (diaCorte+1) do mês anterior até o (diaCorte) do mês.
        // diaCorte é lido por empresa em `system_criteria.ponto_dia_corte` (default 15, máx 28).
        // ATENÇÃO: a Rev. 1221 backfilou erroneamente como mês calendário (01→último dia),
        // bloqueando o "escuro" (dias após o corte). Uma tentativa anterior (#38 v1)
        // ficou off-by-one (inicio = diaCorte+2 do mês anterior). Aqui recomputamos
        // sempre que o range gravado divergir do esperado, corrigindo NULL, mês inteiro
        // antigo e o off-by-one.
        try {
          await db.execute(sql`
            CREATE INDEX IF NOT EXISTS "ponto_consolidacao_ciclo"
              ON "ponto_consolidacao" ("companyId", "data_inicio_ciclo", "data_fim_ciclo")
          `);
          const r = await db.execute(sql`
            UPDATE "ponto_consolidacao" pc
               SET "data_inicio_ciclo" = calc.expected_inicio,
                   "data_fim_ciclo"    = calc.expected_fim
              FROM (
                SELECT pc2.id,
                       (to_date(pc2."mesReferencia" || '-01','YYYY-MM-DD')
                          - interval '1 month'
                          + (COALESCE(dc.dia_corte, 15) || ' day')::interval
                       )::date AS expected_inicio,
                       (to_date(pc2."mesReferencia" || '-01','YYYY-MM-DD')
                          + ((COALESCE(dc.dia_corte, 15) - 1) || ' day')::interval
                       )::date AS expected_fim
                  FROM "ponto_consolidacao" pc2
                  LEFT JOIN LATERAL (
                    SELECT LEAST(28, GREATEST(1,
                             NULLIF(regexp_replace(sc.valor,'[^0-9]','','g'),'')::int
                           )) AS dia_corte
                      FROM system_criteria sc
                     WHERE sc."companyId" = pc2."companyId"
                       AND sc.chave = 'ponto_dia_corte'
                     LIMIT 1
                  ) dc ON true
              ) calc
             WHERE pc.id = calc.id
               AND (
                     pc."data_inicio_ciclo" IS DISTINCT FROM calc.expected_inicio
                  OR pc."data_fim_ciclo"    IS DISTINCT FROM calc.expected_fim
               )
          `);
          const n = (r as any).rowCount ?? 0;
          if (n > 0) console.log(`[ColFix] ponto_consolidacao: ${n} ciclos recalculados (corte por empresa)`);
        } catch (e: any) {
          console.error("[ColFix] Falha ao recalcular ciclos de ponto_consolidacao:", e?.message || e);
        }

        // ─── Auto-resolver inconsistências batida_impar órfãs (Rev. 1230) ────
        // Quando um registro de ponto é corrigido (vinculação manual,
        // edição de batidas, etc.), o time_record passa a ter número par
        // de batidas, mas a inconsistência antiga continua "pendente".
        // Aqui reconciliamos: se o registro atual tem nº par de batidas
        // (contado pelos campos entrada1..saida3), marcamos a
        // inconsistência como "ajustado" automaticamente.
        try {
          const r2 = await db.execute(sql`
            WITH curr AS (
              SELECT ti.id AS inc_id,
                (CASE WHEN COALESCE(tr.entrada1,'')<>'' THEN 1 ELSE 0 END
               + CASE WHEN COALESCE(tr.saida1,'')<>'' THEN 1 ELSE 0 END
               + CASE WHEN COALESCE(tr.entrada2,'')<>'' THEN 1 ELSE 0 END
               + CASE WHEN COALESCE(tr.saida2,'')<>'' THEN 1 ELSE 0 END
               + CASE WHEN COALESCE(tr.entrada3,'')<>'' THEN 1 ELSE 0 END
               + CASE WHEN COALESCE(tr.saida3,'')<>'' THEN 1 ELSE 0 END) AS n
              FROM time_inconsistencies ti
              LEFT JOIN time_records tr
                ON tr."employeeId"=ti."employeeId"
               AND tr.data::date = ti.data::date
              WHERE ti."tipoInconsistencia"='batida_impar'
                AND ti.status='pendente'
            )
            UPDATE time_inconsistencies
            SET status='ajustado',
                "resolvidoPor"='Sistema (auto-reconcile)',
                "resolvidoEm"=NOW(),
                justificativa=COALESCE(NULLIF(justificativa,''),'') || ' [Auto-resolvido: registro corrigido posteriormente, batidas agora são pares.]',
                "updatedAt"=NOW()
            WHERE id IN (SELECT inc_id FROM curr WHERE n > 0 AND n % 2 = 0)
          `);
          const n2 = (r2 as any).rowCount ?? 0;
          if (n2 > 0) console.log(`[ColFix] inconsistências batida_impar auto-resolvidas: ${n2}`);
        } catch (e: any) {
          console.warn("[ColFix] Falha auto-reconcile batida_impar (não-fatal):", e?.message || e);
        }

        // ─── Backfill: nomes de criadores em documentos de compras ──────────
        // Preenche `criado_por_nome` em SCs/Cotações/OCs antigas onde só
        // há `criado_por_id`, usando users.name. Idempotente.
        try {
          const scFix = await db.execute(sql`
            UPDATE compras_solicitacoes s
            SET criado_por_nome = u.name
            FROM users u
            WHERE s.criado_por_id = u.id
              AND (s.criado_por_nome IS NULL OR s.criado_por_nome = '')
              AND u.name IS NOT NULL AND u.name <> ''
          `);
          const cotFix = await db.execute(sql`
            UPDATE compras_cotacoes c
            SET criado_por_nome = u.name
            FROM users u
            WHERE c.criado_por_id = u.id
              AND (c.criado_por_nome IS NULL OR c.criado_por_nome = '')
              AND u.name IS NOT NULL AND u.name <> ''
          `);
          const ocFix = await db.execute(sql`
            UPDATE compras_ordens o
            SET criado_por_nome = u.name
            FROM users u
            WHERE o.criado_por_id = u.id
              AND (o.criado_por_nome IS NULL OR o.criado_por_nome = '')
              AND u.name IS NOT NULL AND u.name <> ''
          `);
          const scN = (scFix as any).rowCount ?? 0;
          const cotN = (cotFix as any).rowCount ?? 0;
          const ocN = (ocFix as any).rowCount ?? 0;
          if (scN + cotN + ocN > 0) {
            console.log(`[ColFix] Backfill nomes compras: SC=${scN}, Cot=${cotN}, OC=${ocN}`);
          } else {
            console.log("[ColFix] Backfill nomes compras OK (nada a corrigir)");
          }
        } catch (err) {
          console.warn("[ColFix] Backfill nomes compras falhou (não-fatal):", (err as Error).message);
        }
        await db.execute(sql`CREATE TABLE IF NOT EXISTS pj_documentos (
          id SERIAL NOT NULL,
          company_id INTEGER NOT NULL,
          employee_id INTEGER NOT NULL,
          contract_id INTEGER,
          nome VARCHAR(255) NOT NULL,
          tipo VARCHAR(100) DEFAULT 'outro',
          url TEXT NOT NULL,
          storage_key TEXT,
          criado_por VARCHAR(255),
          criado_por_user_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          deleted_at TIMESTAMP
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS bim_models (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL DEFAULT 0,
          projeto_id INTEGER NOT NULL,
          nome VARCHAR(255) NOT NULL,
          disciplina VARCHAR(100) NOT NULL DEFAULT 'Estrutural',
          arquivo_path TEXT NOT NULL,
          tamanho_bytes INTEGER DEFAULT 0,
          num_elementos INTEGER DEFAULT 0,
          num_pavimentos INTEGER DEFAULT 0,
          pavimentos JSONB DEFAULT '[]',
          criado_em TIMESTAMP DEFAULT NOW(),
          criado_por INTEGER DEFAULT 0
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS bim_links (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL DEFAULT 0,
          projeto_id INTEGER NOT NULL,
          atividade_id INTEGER NOT NULL,
          model_id INTEGER NOT NULL,
          express_ids JSONB DEFAULT '[]',
          storey_name VARCHAR(255),
          descricao TEXT,
          criado_em TIMESTAMP DEFAULT NOW()
        )`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS pj_contract_revisoes (
            id SERIAL NOT NULL,
            "contractId" INTEGER NOT NULL,
            "companyId" INTEGER NOT NULL,
            "employeeId" INTEGER NOT NULL,
            "revisaoNum" VARCHAR(10) NOT NULL,
            motivo TEXT,
            snapshot TEXT,
            "criadoPor" VARCHAR(255),
            "criadoPorUserId" INTEGER,
            "criadoEm" TIMESTAMP DEFAULT now() NOT NULL
          )
        `);
        // Rev. 1339: pj_contract_aditivos — aditivos de contrato PJ
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS pj_contract_aditivos (
            id SERIAL PRIMARY KEY,
            "companyId" INTEGER NOT NULL,
            "contractId" INTEGER NOT NULL,
            "employeeId" INTEGER NOT NULL,
            "numeroAditivo" INTEGER NOT NULL DEFAULT 1,
            "clausulasAlteradas" TEXT NOT NULL,
            "dataAditivo" DATE NOT NULL,
            observacoes TEXT,
            "criadoPor" VARCHAR(255),
            "criadoPorUserId" INTEGER,
            "criadoEm" TIMESTAMP DEFAULT now() NOT NULL
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS pjca_contract ON pj_contract_aditivos("contractId")`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS pjca_company ON pj_contract_aditivos("companyId")`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS recycle_bin (
            id SERIAL PRIMARY KEY,
            entity_type VARCHAR(80) NOT NULL,
            entity_id INTEGER NOT NULL,
            company_id INTEGER,
            obra_id INTEGER,
            parent_entity VARCHAR(80),
            parent_id INTEGER,
            label TEXT NOT NULL,
            snapshot JSON NOT NULL,
            deleted_by VARCHAR(255),
            deleted_by_user_id INTEGER,
            deleted_at TIMESTAMP DEFAULT NOW(),
            restored_at TIMESTAMP
          )
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recycle_company ON recycle_bin(company_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recycle_entity ON recycle_bin(entity_type, entity_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recycle_deleted_at ON recycle_bin(deleted_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_recycle_restored ON recycle_bin(restored_at)`);
        // Seguro de Vida
        await db.execute(sql`CREATE TABLE IF NOT EXISTS seguro_vida_coberturas (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL,
          employee_id INTEGER,
          nome_completo VARCHAR(300) NOT NULL,
          item_segurador VARCHAR(20),
          apolice_vg VARCHAR(30),
          apolice_apc VARCHAR(30),
          status VARCHAR(30) NOT NULL DEFAULT 'ativo',
          data_adesao DATE,
          data_cancelamento DATE,
          motivo_cancelamento TEXT,
          observacoes TEXT,
          criado_em TIMESTAMP DEFAULT NOW(),
          atualizado_em TIMESTAMP DEFAULT NOW(),
          criado_por VARCHAR(255),
          cancelado_por VARCHAR(255)
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS seguro_vida_importacoes (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL,
          competencia VARCHAR(7) NOT NULL,
          data_importacao TIMESTAMP DEFAULT NOW(),
          total_segurados INTEGER DEFAULT 0,
          total_ativos INTEGER DEFAULT 0,
          total_ok INTEGER DEFAULT 0,
          total_sem_seguro INTEGER DEFAULT 0,
          total_pagar_indevido INTEGER DEFAULT 0,
          total_novos INTEGER DEFAULT 0,
          json_resultado JSON,
          relatorio_nomes TEXT,
          importado_por VARCHAR(255),
          criado_em TIMESTAMP DEFAULT NOW()
        )`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_seguro_vida_company ON seguro_vida_coberturas(company_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_seguro_vida_employee ON seguro_vida_coberturas(employee_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_svimport_company ON seguro_vida_importacoes(company_id)`);
        // Rev. 1308: coluna para armazenar PDF original (base64) — permite download posterior
        await db.execute(sql`ALTER TABLE seguro_vida_importacoes ADD COLUMN IF NOT EXISTS pdf_dados TEXT`);
        // Tabela de pagamentos indevidos persistentes (pessoas no PDF mas não mais na empresa)
        await db.execute(sql`CREATE TABLE IF NOT EXISTS seguro_vida_indevidos (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL,
          competencia VARCHAR(7) NOT NULL,
          nome_pdf TEXT NOT NULL,
          item_segurador TEXT,
          nome_rh TEXT,
          situacao TEXT,
          data_demissao TEXT,
          possivel_pj BOOLEAN DEFAULT FALSE,
          resolvido BOOLEAN DEFAULT FALSE,
          resolvido_por TEXT,
          resolvido_em TIMESTAMPTZ,
          observacao TEXT,
          importado_em TIMESTAMPTZ DEFAULT NOW()
        )`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_svindevido_unique ON seguro_vida_indevidos(company_id, competencia, nome_pdf)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_svindevido_company ON seguro_vida_indevidos(company_id)`);
        // Rev. 1311: novas colunas seguro de vida
        await db.execute(sql`ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS cancelado_por TEXT`);
        await db.execute(sql`ALTER TABLE seguro_vida_coberturas ADD COLUMN IF NOT EXISTS data_vencimento_apolice TEXT`);
        console.log("[ColFix] CREATE TABLEs OK");
        const hoje = new Date().toISOString().split('T')[0];
        const vencResult = await db.execute(sql`
          UPDATE vacation_periods SET vencida = 1, status = 'vencida'
          WHERE status = 'pendente' AND "periodoConcessivoFim" IS NOT NULL AND "periodoConcessivoFim" < ${hoje}
            AND "deletedAt" IS NULL
        `);
        const vencCount = (vencResult as any).rowCount || 0;
        if (vencCount > 0) console.log(`[ColFix] vacation_periods: ${vencCount} período(s) expirado(s)`);
        await db.execute(sql`UPDATE compras_cotacoes SET status = 'concluida' WHERE contrato_terceiro_id IS NOT NULL AND status = 'aprovada'`);
        // Rev. 1276: etapa "Coordenação" removida do fluxo de SMO (Solicitação de Mão de Obra).
        // Qualquer SMO que estava em "aprovada_coord" volta para "enviada" para entrar no
        // novo fluxo (RH → Diretoria) sem ficar travada esperando um botão que não existe mais.
        try {
          const smoCoordResult = await db.execute(sql`
            UPDATE smo_solicitacoes
               SET status = 'enviada',
                   aprovado_por_coord = NULL,
                   aprovado_por_coord_em = NULL,
                   atualizado_em = NOW()
             WHERE status = 'aprovada_coord'
          `);
          const smoN = (smoCoordResult as any).rowCount || 0;
          if (smoN > 0) console.log(`[ColFix] SMO: ${smoN} solicitação(ões) em 'aprovada_coord' migradas para 'enviada' (etapa Coord. removida)`);
        } catch (err: any) {
          console.warn("[ColFix] SMO migração aprovada_coord falhou (não-fatal):", err?.message || err);
        }
        console.log("[ColFix] Startup migrations OK");
      } catch (e: any) { console.warn("[ColFix] Aviso:", e?.message ?? e); }
    });
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          DO $$ BEGIN
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeConsolidadoEm" VARCHAR(32); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeConsolidadoPor" VARCHAR(200); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "afericaoResultJson" TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeResultJson" TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "pagamentoResultJson" TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "heConsolidadoEm" VARCHAR(32); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "heConsolidadoPor" VARCHAR(200); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "afericaoConsolidadoEm" VARCHAR(32); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "afericaoConsolidadoPor" VARCHAR(200); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "pagamentoConsolidadoEm" VARCHAR(32); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "pagamentoConsolidadoPor" VARCHAR(200); EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS "descontosManuaisJson" JSONB; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS "descontosManuaisHistorico" JSONB; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "aplicarDsrFalta" SMALLINT NOT NULL DEFAULT 1; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "aplicarDsrAtraso" SMALLINT NOT NULL DEFAULT 1; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE ponto_descontos_resumo ADD COLUMN IF NOT EXISTS "totalDsrFalta" INTEGER DEFAULT 0; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE ponto_descontos_resumo ADD COLUMN IF NOT EXISTS "totalDsrAtraso" INTEGER DEFAULT 0; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE ponto_descontos_resumo ADD COLUMN IF NOT EXISTS "valorTotalDsrFalta" VARCHAR(20) DEFAULT '0'; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE ponto_descontos_resumo ADD COLUMN IF NOT EXISTS "valorTotalDsrAtraso" VARCHAR(20) DEFAULT '0'; EXCEPTION WHEN OTHERS THEN NULL; END;
          END $$
        `);
        console.log("[ColFix] payroll cols OK");
        await db.execute(sql`CREATE TABLE IF NOT EXISTS he_periods (
          id SERIAL PRIMARY KEY, "companyId" INTEGER NOT NULL, "mesReferencia" VARCHAR(7) NOT NULL,
          "dataInicio" DATE NOT NULL, "dataFim" DATE NOT NULL, status TEXT NOT NULL DEFAULT 'calculado',
          "totalFuncionarios" INTEGER DEFAULT 0, "totalHEMins" INTEGER DEFAULT 0, "totalValorHE" NUMERIC(12,2) DEFAULT 0,
          "criadoPor" TEXT, "criadoEm" TIMESTAMP DEFAULT NOW(), "aprovadoPor" TEXT, "aprovadoEm" TIMESTAMP,
          "pagoPor" TEXT, "pagoEm" TIMESTAMP, observacoes TEXT
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS he_period_employees (
          id SERIAL PRIMARY KEY, "hePeriodId" INTEGER NOT NULL, "companyId" INTEGER NOT NULL,
          "employeeId" INTEGER NOT NULL, nome TEXT, "heUtilMins" INTEGER DEFAULT 0, "heFimMins" INTEGER DEFAULT 0,
          "heTotalMins" INTEGER DEFAULT 0, "valorHEUtil" NUMERIC(10,2) DEFAULT 0, "valorHEFim" NUMERIC(10,2) DEFAULT 0,
          "valorHETotal" NUMERIC(10,2) DEFAULT 0, "salarioBruto" NUMERIC(10,2) DEFAULT 0, "valorHora" NUMERIC(10,4) DEFAULT 0
        )`);
        await db.execute(sql`ALTER TABLE he_period_employees ADD COLUMN IF NOT EXISTS "destinacao" TEXT NOT NULL DEFAULT 'pagamento'`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS banco_horas_saldo (
          id SERIAL PRIMARY KEY, "employeeId" INTEGER NOT NULL, "companyId" INTEGER NOT NULL,
          "saldoMinutos" INTEGER NOT NULL DEFAULT 0, "atualizadoEm" TIMESTAMP DEFAULT NOW(),
          UNIQUE("employeeId", "companyId")
        )`);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS banco_horas_lancamentos (
          id SERIAL PRIMARY KEY, "employeeId" INTEGER NOT NULL, "companyId" INTEGER NOT NULL,
          "hePeriodId" INTEGER, tipo TEXT NOT NULL, minutos INTEGER NOT NULL, descricao TEXT,
          data DATE NOT NULL DEFAULT CURRENT_DATE, "criadoEm" TIMESTAMP DEFAULT NOW(), "criadoPor" TEXT
        )`);
        console.log("[ColFix] HE + banco horas tables OK");
      } catch (e: any) { console.warn("[ColFix] HE/banco horas:", e?.message ?? e); }
    });

    // Rev.650: Limpeza automática de batidas duplicadas (mesmo employeeId+obraId+data)
    // Mantém o registro com mais horas trabalhadas (ou com ajusteManual=1)
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        const result = await db.execute(sql`
          WITH ranked AS (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY "employeeId", "obraId", data, "companyId"
                ORDER BY
                  COALESCE("ajusteManual", 0) DESC,
                  CASE
                    WHEN "horasTrabalhadas" IS NULL OR "horasTrabalhadas" = '0:00' THEN 0
                    ELSE (
                      CAST(split_part("horasTrabalhadas", ':', 1) AS INT) * 60 +
                      CAST(split_part("horasTrabalhadas", ':', 2) AS INT)
                    )
                  END DESC,
                  id ASC
              ) AS rn
            FROM time_records
          )
          DELETE FROM time_records
          WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        `);
        const deleted = (result as any).rowCount ?? 0;
        if (deleted > 0) {
          console.log(`[ColFix] Batidas duplicadas removidas: ${deleted} registro(s) excluído(s) (mantido o com mais horas)`);
        } else {
          console.log("[ColFix] Batidas duplicadas: nenhuma encontrada");
        }
      } catch (e: any) { console.warn("[ColFix] Dedup batidas:", e?.message ?? e); }
    });

    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          DO $$ BEGIN
            ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS biometria_facial_url TEXT;
            ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS biometria_capturada_em TIMESTAMP;
            ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS modo_identificacao VARCHAR(20) DEFAULT 'manual';
            ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_url TEXT;
            ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_nome VARCHAR(255);
            ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_em TIMESTAMP;
            ALTER TABLE warnings ADD COLUMN IF NOT EXISTS assinatura_funcionario_url TEXT;
            ALTER TABLE warnings ADD COLUMN IF NOT EXISTS assinatura_aplicador_url TEXT;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS insalubridade_grau VARCHAR(20) DEFAULT 'none';
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS periculosidade SMALLINT DEFAULT 0;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS adicional_noturno_ativo SMALLINT DEFAULT 0;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS condicoes_vigencia_inicio DATE;
            ALTER TABLE obra_funcionarios ADD COLUMN IF NOT EXISTS insalubridade_override VARCHAR(20) DEFAULT 'herda';
            ALTER TABLE obra_funcionarios ADD COLUMN IF NOT EXISTS periculosidade_override VARCHAR(10) DEFAULT 'herda';
            ALTER TABLE obra_funcionarios ADD COLUMN IF NOT EXISTS adicional_escolhido VARCHAR(20) DEFAULT 'auto';
            ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_unit_mat NUMERIC(18,4);
            ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_unit_mdo NUMERIC(18,4);
            ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_total_mat NUMERIC(18,2);
            ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_total_mdo NUMERIC(18,2);
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS alerta_divergencia TEXT;
            ALTER TABLE terceiro_medicao_itens ADD COLUMN IF NOT EXISTS percentual_fisico_real NUMERIC(8,4);
            ALTER TABLE terceiro_medicao_itens ADD COLUMN IF NOT EXISTS editado_manualmente BOOLEAN DEFAULT false;
            ALTER TABLE terceiro_contratos ADD COLUMN IF NOT EXISTS perc_retencao_tecnica NUMERIC(6,3) DEFAULT 0;
            ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS retencao_tecnica NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS sinal_valor NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS valor_parcela_fixa NUMERIC(18,2) DEFAULT 0;
            ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS revisao_numero INTEGER DEFAULT 0;
            ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS revisado_por_nome VARCHAR(255);
            ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS revisado_em TIMESTAMP;
            ALTER TABLE compras_solicitacoes_itens ADD COLUMN IF NOT EXISTS incluir_ajudante BOOLEAN DEFAULT true;
            ALTER TABLE compras_solicitacoes_itens ADD COLUMN IF NOT EXISTS meta_mdo_profissional NUMERIC(18,4) DEFAULT 0;
            ALTER TABLE compras_solicitacoes_itens ADD COLUMN IF NOT EXISTS meta_mdo_ajudante NUMERIC(18,4) DEFAULT 0;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca SMALLINT NOT NULL DEFAULT 0;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_desde DATE;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS cargo_confianca_gratificacao VARCHAR(20);
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS responsavel_id INTEGER;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS tipo_contrato VARCHAR(30) NOT NULL DEFAULT 'global';
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS percentual_gerenciamento_material NUMERIC(5,2) DEFAULT 0;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS percentual_adm NUMERIC(5,2) DEFAULT 0;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS databook_logo_cliente SMALLINT NOT NULL DEFAULT 1;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS databook_logo_gestora SMALLINT NOT NULL DEFAULT 1;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS databook_logo_construtora SMALLINT NOT NULL DEFAULT 0;
            ALTER TABLE obras ADD COLUMN IF NOT EXISTS numero_contrato VARCHAR(50);
            ALTER TABLE oc_number_config ADD COLUMN IF NOT EXISTS alerta_reservas_ativo SMALLINT DEFAULT 1;
            ALTER TABLE dds_sessao_funcionarios ADD COLUMN IF NOT EXISTS assinatura_img TEXT;
          EXCEPTION WHEN OTHERS THEN NULL;
          END $$
        `);
        console.log("[ColFix] EPI/warnings/obras/orcamento/terceiros/cargoConfianca cols OK");
      } catch (e: any) { console.warn("[ColFix] Bloco2:", e?.message ?? e); }
    });

    // Bloco2b — Gestão de Documentos (Rev. 1774/1775/1775c): ISOLADO em statements
    // separados (sem DO/EXCEPTION) E SEM version guard (sempre roda). Todos os
    // statements são idempotentes (IF NOT EXISTS / UPDATE…WHERE NULL), então o
    // custo é desprezível e garantimos que a coluna apareça mesmo se o
    // startup_cache do Neon estiver com versão "presa".
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        const statements: { label: string; sql: any }[] = [
          { label: "gd_disciplinas.tipo_acervo", sql: sql`ALTER TABLE gd_disciplinas ADD COLUMN IF NOT EXISTS tipo_acervo VARCHAR(20) DEFAULT 'projeto'` },
          { label: "gd_disciplinas.categoria_chave", sql: sql`ALTER TABLE gd_disciplinas ADD COLUMN IF NOT EXISTS categoria_chave VARCHAR(50)` },
          { label: "gd_disciplinas.ordem", sql: sql`ALTER TABLE gd_disciplinas ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0` },
          { label: "gd_categorias_admin_padrao(table)", sql: sql`CREATE TABLE IF NOT EXISTS gd_categorias_admin_padrao (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NOT NULL,
              chave VARCHAR(50) NOT NULL,
              nome VARCHAR(150) NOT NULL,
              sigla VARCHAR(10) NOT NULL,
              cor VARCHAR(7) DEFAULT '#64748B',
              ordem INTEGER DEFAULT 0,
              ativo BOOLEAN DEFAULT TRUE,
              criado_em TIMESTAMP DEFAULT NOW()
            )` },
          { label: "idx_gd_cat_adm_company", sql: sql`CREATE INDEX IF NOT EXISTS idx_gd_cat_adm_company ON gd_categorias_admin_padrao (company_id)` },
          { label: "uniq_gd_cat_adm_company_chave", sql: sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_gd_cat_adm_company_chave ON gd_categorias_admin_padrao (company_id, chave)` },
          { label: "uniq_gd_disc_ficheiro_cat_chave", sql: sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_gd_disc_ficheiro_cat_chave ON gd_disciplinas (ficheiro_id, categoria_chave) WHERE categoria_chave IS NOT NULL AND deleted_at IS NULL` },
          { label: "backfill tipo_acervo NULL→projeto", sql: sql`UPDATE gd_disciplinas SET tipo_acervo='projeto' WHERE tipo_acervo IS NULL OR tipo_acervo=''` },
        ];
        for (const s of statements) {
          try {
            await db.execute(s.sql);
          } catch (e: any) {
            console.error(`[ColFix-GD] FAIL ${s.label}:`, e?.message ?? e);
          }
        }
        console.log("[ColFix-GD] Migrations Gestão de Documentos OK");
      } catch (e: any) { console.warn("[ColFix-GD]:", e?.message ?? e); }
    });
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await Promise.all([
          db.execute(sql`CREATE TABLE IF NOT EXISTS smo_solicitacoes (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, obra_id INTEGER NOT NULL,
            solicitante_id INTEGER NOT NULL, solicitante_nome VARCHAR(255) NOT NULL,
            funcao_solicitada VARCHAR(150) NOT NULL, quantidade INTEGER NOT NULL DEFAULT 1,
            data_inicio_necessidade DATE NOT NULL, duracao_meses INTEGER NOT NULL DEFAULT 1,
            prioridade VARCHAR(20) NOT NULL DEFAULT 'normal', qualificacoes TEXT, observacao TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'rascunho',
            custo_mensal_estimado NUMERIC(18,2) DEFAULT 0, custo_total_estimado NUMERIC(18,2) DEFAULT 0,
            detalhe_custos TEXT, sugestao_realocacao TEXT, motivo_rejeicao TEXT,
            aprovado_por_coord VARCHAR(255), aprovado_por_coord_em TIMESTAMP,
            aprovado_por_rh VARCHAR(255), aprovado_por_rh_em TIMESTAMP,
            aprovado_por_diretoria VARCHAR(255), aprovado_por_diretoria_em TIMESTAMP,
            rejeitado_por VARCHAR(255), rejeitado_em TIMESTAMP,
            prazo_minimo_alerta BOOLEAN DEFAULT false, sla_vencido_em TIMESTAMP,
            criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW(),
            candidato_indicado_nome VARCHAR(255), candidato_indicado_telefone VARCHAR(50),
            curriculo_arquivo_nome VARCHAR(255), curriculo_arquivo_key VARCHAR(500),
            lote_id VARCHAR(50), deleted_at TIMESTAMP
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS smo_atividades_eap (
            id SERIAL PRIMARY KEY, solicitacao_id INTEGER NOT NULL,
            atividade_id INTEGER NOT NULL, eap_codigo VARCHAR(50), nome_atividade VARCHAR(500)
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS smo_onboarding_checklist (
            id SERIAL PRIMARY KEY, solicitacao_id INTEGER NOT NULL,
            employee_id INTEGER, item VARCHAR(255) NOT NULL,
            concluido BOOLEAN DEFAULT false, concluido_por VARCHAR(255),
            concluido_em TIMESTAMP, criado_em TIMESTAMP DEFAULT NOW()
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS disciplina_correcoes (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL,
            eap_descricao TEXT NOT NULL, disciplina_original VARCHAR(200) NOT NULL,
            disciplina_corrigida VARCHAR(200) NOT NULL, user_id INTEGER,
            user_name VARCHAR(200), criado_em TIMESTAMP DEFAULT NOW()
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS medicao_contratos (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, projeto_id INTEGER NOT NULL,
            criterio VARCHAR(30) NOT NULL DEFAULT 'avanco_fisico', valor_total_contrato NUMERIC(15,2) DEFAULT 0,
            percentual_sinal NUMERIC(5,2) DEFAULT 0, valor_sinal_recebido NUMERIC(15,2) DEFAULT 0,
            percentual_retencao NUMERIC(5,2), valor_minimo_fd NUMERIC(15,2),
            status VARCHAR(20) NOT NULL DEFAULT 'ativo', observacoes TEXT,
            criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW(), deleted_at TIMESTAMP
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS medicao_boletins (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, contrato_id INTEGER NOT NULL,
            numero INTEGER NOT NULL, periodo_referencia VARCHAR(7) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'rascunho', data_envio DATE, data_aprovacao DATE,
            valor_bruto NUMERIC(15,2) DEFAULT 0, desconto_sinal NUMERIC(15,2) DEFAULT 0,
            desconto_retencao NUMERIC(15,2) DEFAULT 0, glosa NUMERIC(15,2) DEFAULT 0,
            deducao_fd NUMERIC(15,2) DEFAULT 0, valor_liquido NUMERIC(15,2) DEFAULT 0,
            observacoes TEXT, financial_entry_id INTEGER,
            criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW()
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS medicao_boletim_itens (
            id SERIAL PRIMARY KEY, boletim_id INTEGER NOT NULL, atividade_id INTEGER,
            eap_codigo VARCHAR(50), descricao VARCHAR(500) NOT NULL,
            valor_contratual NUMERIC(15,2) DEFAULT 0, percentual_acumulado_anterior NUMERIC(8,4) DEFAULT 0,
            percentual_periodo NUMERIC(8,4) DEFAULT 0, percentual_acumulado_atual NUMERIC(8,4) DEFAULT 0,
            valor_periodo NUMERIC(15,2) DEFAULT 0, tipo_avanco VARCHAR(30) NOT NULL DEFAULT 'fisico',
            is_fd BOOLEAN DEFAULT FALSE, criado_em TIMESTAMP DEFAULT NOW()
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS medicao_fd_registros (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL, contrato_id INTEGER NOT NULL,
            descricao VARCHAR(500) NOT NULL, valor NUMERIC(15,2) NOT NULL, data_registro DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pendente', boletim_desconto_id INTEGER,
            compra_id INTEGER, origem VARCHAR(20) NOT NULL DEFAULT 'manual', observacoes TEXT,
            criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW()
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS ia_modulo_conversas (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL DEFAULT 0, user_id INTEGER NOT NULL DEFAULT 0,
            user_name VARCHAR(200) DEFAULT '', modulo VARCHAR(50) NOT NULL, pergunta TEXT NOT NULL,
            resposta TEXT NOT NULL, projeto_id INTEGER, criado_em TIMESTAMP DEFAULT NOW()
          )`),
          db.execute(sql`CREATE TABLE IF NOT EXISTS user_activity_log (
            id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL DEFAULT 0, user_id INTEGER NOT NULL DEFAULT 0,
            user_name VARCHAR(200) DEFAULT '', tipo VARCHAR(50) NOT NULL DEFAULT 'page_visit',
            pagina VARCHAR(500) NOT NULL DEFAULT '', acao VARCHAR(500), modulo VARCHAR(100),
            detalhes TEXT, duracao_segundos INTEGER DEFAULT 0, criado_em TIMESTAMP DEFAULT NOW()
          )`),
        ]);
        await Promise.all([
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ual_company_criado ON user_activity_log(company_id, criado_em)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ual_user_company ON user_activity_log(user_id, company_id, criado_em DESC)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ual_company_tipo ON user_activity_log(company_id, tipo, criado_em)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_smo_company ON smo_solicitacoes(company_id)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_smo_obra ON smo_solicitacoes(obra_id)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_smo_status ON smo_solicitacoes(status)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_smo_eap_sol ON smo_atividades_eap(solicitacao_id)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_smo_onb_sol ON smo_onboarding_checklist(solicitacao_id)`),
          db.execute(sql`CREATE INDEX IF NOT EXISTS idx_disc_corr_company ON disciplina_correcoes(company_id)`),
        ]);
        console.log("[ColFix] SMO + Medição + IA + telemetria tables OK");
      } catch (e: any) { console.warn("[ColFix] Tables bloco3:", e?.message ?? e); }
    });
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        const nullCount = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM orcamento_itens
          WHERE (meta_unit_mat IS NULL OR meta_unit_mdo IS NULL OR meta_total_mat IS NULL OR meta_total_mdo IS NULL)
        `);
        const cnt = parseInt((nullCount as any).rows?.[0]?.cnt ?? '0', 10);
        if (cnt > 0) {
          await db.execute(sql`
            UPDATE orcamento_itens oi SET
              meta_unit_mat = ROUND(COALESCE("custoUnitMat"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 4),
              meta_unit_mdo = ROUND(COALESCE("custoUnitMdo"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 4),
              meta_total_mat = ROUND(COALESCE("custoTotalMat"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 2),
              meta_total_mdo = ROUND(COALESCE("custoTotalMdo"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 2)
            FROM orcamentos o WHERE o.id = oi."orcamentoId"
              AND (oi.meta_unit_mat IS NULL OR oi.meta_unit_mdo IS NULL OR oi.meta_total_mat IS NULL OR oi.meta_total_mdo IS NULL)
          `);
          console.log(`[ColFix] orcamento_itens meta MAT/MDO: ${cnt} itens atualizados`);
        }
        const compostoResult = await db.execute(sql`
          WITH candidates AS (
            SELECT p.id FROM orcamento_itens p
            WHERE p.tipo != 'Composto' AND (p."composicaoTipo" IS NULL OR p."composicaoTipo" != 'COM')
              AND (p."servicoCodigo" IS NULL OR p."servicoCodigo" = '')
              AND p.unidade IS NOT NULL AND p.unidade != ''
              AND p.quantidade IS NOT NULL AND CAST(p.quantidade AS numeric) > 0
              AND EXISTS (
                SELECT 1 FROM orcamento_itens c WHERE c."orcamentoId" = p."orcamentoId"
                AND c."eapCodigo" LIKE p."eapCodigo" || '.%'
                AND LENGTH(c."eapCodigo") - LENGTH(REPLACE(c."eapCodigo", '.', ''))
                  = LENGTH(p."eapCodigo") - LENGTH(REPLACE(p."eapCodigo", '.', '')) + 1
                AND c.unidade IS NOT NULL AND c.unidade != ''
                AND c.quantidade IS NOT NULL AND CAST(c.quantidade AS numeric) > 0
              )
              AND NOT EXISTS (
                SELECT 1 FROM orcamento_itens c2 WHERE c2."orcamentoId" = p."orcamentoId"
                AND c2."eapCodigo" LIKE p."eapCodigo" || '.%'
                AND c2."servicoCodigo" IS NOT NULL AND c2."servicoCodigo" != '' AND c2."servicoCodigo" != 'composto'
              )
          )
          UPDATE orcamento_itens SET tipo = 'Composto', "composicaoTipo" = 'COM', "servicoCodigo" = 'composto'
          WHERE id IN (SELECT id FROM candidates)
        `);
        const cCnt = (compostoResult as any).rowCount ?? 0;
        if (cCnt > 0) console.log(`[ColFix] compostos auto-detectados: ${cCnt} itens`);
        const fixedTipo = await db.execute(sql`
          UPDATE compras_cotacoes c SET tipo = 'servico' FROM compras_solicitacoes s
          WHERE c.solicitacao_id = s.id AND s.tipo IN ('servico', 'pacote') AND c.tipo = 'material'
        `);
        const fixCount = (fixedTipo as any).rowCount ?? 0;
        if (fixCount > 0) console.log(`[ColFix] cotações tipo corrigido: ${fixCount}`);
        const syncCot = await db.execute(sql`
          UPDATE compras_cotacoes c SET tipo = s.tipo FROM compras_solicitacoes s
          WHERE c.solicitacao_id = s.id AND s.tipo IS NOT NULL AND c.tipo != s.tipo
        `);
        const syncCount = (syncCot as any).rowCount ?? 0;
        if (syncCount > 0) console.log(`[ColFix] Sync tipo cotação→SC: ${syncCount}`);
        console.log("[ColFix] Data fixes OK");
      } catch (e: any) { console.warn("[ColFix] Data fixes:", e?.message ?? e); }
    });
    // ─── Bloco financeiro: retenção contratual + status granular + tabelas de previsão ───
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          DO $$ BEGIN
            ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS retencao_contratual DECIMAL(15,2) DEFAULT 0;
            ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS valor_aprovado      DECIMAL(15,2);
            ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS data_aprovacao      DATE;
            ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS medicao_enviada_em  DATE;
            ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS glosa               DECIMAL(15,2) DEFAULT 0;
            ALTER TABLE financial_revenue ADD COLUMN IF NOT EXISTS conta_bancaria_id   INTEGER;
          EXCEPTION WHEN OTHERS THEN NULL;
          END $$
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS receita_baseline (
            id               SERIAL PRIMARY KEY,
            company_id       INTEGER NOT NULL,
            obra_id          INTEGER NOT NULL,
            obra_nome        VARCHAR(255),
            mes              DATE NOT NULL,
            valor            DECIMAL(15,2) NOT NULL DEFAULT 0,
            criado_em        TIMESTAMP DEFAULT NOW(),
            atualizado_em    TIMESTAMP DEFAULT NOW(),
            UNIQUE (company_id, obra_id, mes)
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS receita_previsto (
            id               SERIAL PRIMARY KEY,
            company_id       INTEGER NOT NULL,
            obra_id          INTEGER NOT NULL,
            obra_nome        VARCHAR(255),
            mes              DATE NOT NULL,
            valor            DECIMAL(15,2) NOT NULL DEFAULT 0,
            revisao          INTEGER DEFAULT 1,
            observacoes      TEXT,
            criado_em        TIMESTAMP DEFAULT NOW(),
            atualizado_em    TIMESTAMP DEFAULT NOW(),
            UNIQUE (company_id, obra_id, mes)
          )
        `);
        console.log("[ColFix] Financial: retencao_contratual + status granular + receita_baseline/previsto OK");
      } catch (e: any) { console.warn("[ColFix] Financial bloco:", e?.message ?? e); }
    });
    // ─── Backfill: sincronizar baixas históricas do Financeiro → planejamento_medicoes ───
    import("../db").then(async ({ getDb }) => {
      if (await colFixSkipPromise) return;
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        // Diagnóstico: contar registros recebidos em financial_revenue
        const diagRes = await db.execute(sql`
          SELECT COUNT(*) AS total_fr,
                 COUNT(CASE WHEN status IN ('recebido_total','recebido_parcial') THEN 1 END) AS recebidos,
                 COUNT(CASE WHEN status IN ('recebido_total','recebido_parcial') AND COALESCE(valor_recebido::numeric, 0) > 0 THEN 1 END) AS recebidos_com_valor
          FROM financial_revenue
        `);
        const diagRow = (diagRes as any)?.rows?.[0] ?? {};
        console.log(`[FinancialSync] Diagnóstico FR: total=${diagRow.total_fr}, recebidos=${diagRow.recebidos}, com_valor=${diagRow.recebidos_com_valor}`);
        // Diagnóstico adicional: verificar correspondência obra_id e obra_nome com planejamento_projetos
        const diagMatch = await db.execute(sql`
          SELECT
            COUNT(CASE WHEN pp.id IS NOT NULL THEN 1 END) AS com_projeto_id,
            COUNT(CASE WHEN ppn.id IS NOT NULL THEN 1 END) AS com_projeto_nome,
            COUNT(CASE WHEN pm.id IS NOT NULL THEN 1 END) AS ja_em_medicoes
          FROM financial_revenue fr
          LEFT JOIN planejamento_projetos pp ON pp.obra_id = fr.obra_id AND fr.obra_id IS NOT NULL
          LEFT JOIN planejamento_projetos ppn ON (
            LOWER(TRIM(COALESCE(
              (SELECT o.nome FROM obras o WHERE o.id = ppn.obra_id LIMIT 1),
              ppn.nome, ''
            ))) = LOWER(TRIM(fr.obra_nome))
            AND (ppn.obra_id IS NULL OR ppn.obra_id != fr.obra_id)
          ) AND fr.obra_nome IS NOT NULL
          LEFT JOIN planejamento_medicoes pm ON pm.projeto_id = COALESCE(pp.id, ppn.id)
            AND pm.competencia = TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM')
            AND COALESCE(pm.valor_medido::numeric, 0) > 0
            AND pm.status = 'confirmado'
          WHERE fr.status IN ('recebido_total', 'recebido_parcial')
            AND COALESCE(fr.valor_recebido::numeric, 0) > 0
        `);
        const dm = (diagMatch as any)?.rows?.[0] ?? {};
        console.log(`[FinancialSync] Match: por_obra_id=${dm.com_projeto_id}, por_nome=${dm.com_projeto_nome}, já_em_medicoes=${dm.ja_em_medicoes}`);
        // Insere registros confirmados em planejamento_medicoes para cada combinação
        // (projeto_id, competencia) que existe em financial_revenue (status recebido)
        // mas ainda não tem registro confirmado em planejamento_medicoes.
        // Agrupa múltiplos pagamentos do mesmo projeto/mês somando os valores.
        // Tentativa 1: match por obra_id direto (quando IDs coincidem)
        const res1 = await db.execute(sql`
          INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
          SELECT sub.projeto_id, sub.competencia, 0, sub.valor_medido, 'confirmado', NOW()
          FROM (
            SELECT pp.id AS projeto_id,
                   TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM') AS competencia,
                   SUM(fr.valor_recebido::numeric) AS valor_medido
            FROM financial_revenue fr
            JOIN planejamento_projetos pp ON pp.obra_id = fr.obra_id
            WHERE fr.status IN ('recebido_total', 'recebido_parcial')
              AND COALESCE(fr.valor_recebido::numeric, 0) > 0
              AND fr.obra_id IS NOT NULL AND pp.obra_id IS NOT NULL
              AND COALESCE(fr.data_recebimento, fr.data_vencimento) IS NOT NULL
            GROUP BY pp.id,
                     TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM')
          ) sub
          WHERE NOT EXISTS (
            SELECT 1 FROM planejamento_medicoes pm
            WHERE pm.projeto_id = sub.projeto_id AND pm.competencia = sub.competencia
              AND COALESCE(pm.valor_medido::numeric, 0) > 0 AND pm.status = 'confirmado'
          )
        `);
        const n1 = (res1 as any)?.rowCount ?? 0;

        // Tentativa 2: match por nome da obra (obra_nome do FR vs nome da obra/projeto)
        const res2 = await db.execute(sql`
          INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
          SELECT sub.projeto_id, sub.competencia, 0, sub.valor_medido, 'confirmado', NOW()
          FROM (
            SELECT pp.id AS projeto_id,
                   TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM') AS competencia,
                   SUM(fr.valor_recebido::numeric) AS valor_medido
            FROM financial_revenue fr
            JOIN planejamento_projetos pp ON (
              LOWER(TRIM(COALESCE(
                (SELECT o.nome FROM obras o WHERE o.id = pp.obra_id LIMIT 1),
                pp.nome, ''
              ))) = LOWER(TRIM(fr.obra_nome))
              AND (pp.obra_id IS NULL OR pp.obra_id != fr.obra_id)
            )
            WHERE fr.status IN ('recebido_total', 'recebido_parcial')
              AND COALESCE(fr.valor_recebido::numeric, 0) > 0
              AND fr.obra_nome IS NOT NULL AND fr.obra_nome != ''
              AND COALESCE(fr.data_recebimento, fr.data_vencimento) IS NOT NULL
            GROUP BY pp.id,
                     TO_CHAR(COALESCE(fr.data_recebimento::date, fr.data_vencimento::date), 'YYYY-MM')
          ) sub
          WHERE NOT EXISTS (
            SELECT 1 FROM planejamento_medicoes pm
            WHERE pm.projeto_id = sub.projeto_id AND pm.competencia = sub.competencia
              AND COALESCE(pm.valor_medido::numeric, 0) > 0 AND pm.status = 'confirmado'
          )
        `);
        const n2 = (res2 as any)?.rowCount ?? 0;
        const inserted = n1 + n2;
        if (inserted > 0)
          console.log(`[FinancialSync] Backfill: ${inserted} competência(s) sincronizada(s) (${n1} por obra_id, ${n2} por nome)`);
        else
          console.log("[FinancialSync] Backfill: nenhum registro novo para sincronizar");
        // Diagnóstico final: listar todos os planejamento_medicoes confirmados
        const diagDetail = await db.execute(sql`
          SELECT pm.projeto_id, pm.competencia, pm.valor_medido::numeric AS valor, pm.status,
                 pp.nome AS projeto_nome, pp.company_id
          FROM planejamento_medicoes pm
          JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
          WHERE pm.status = 'confirmado' AND COALESCE(pm.valor_medido::numeric, 0) > 0
          ORDER BY pp.company_id, pm.projeto_id, pm.competencia
        `);
        const detRows = (diagDetail as any)?.rows ?? [];
        if (detRows.length > 0) {
          console.log(`[FinancialSync] Medicoes confirmadas (${detRows.length} total):`);
          for (const r of detRows) {
            console.log(`  company=${r.company_id} proj=${r.projeto_id}(${r.projeto_nome}) comp=${r.competencia} val=${r.valor}`);
          }
        } else {
          console.log("[FinancialSync] Nenhuma medição confirmada em planejamento_medicoes!");
        }
      } catch (e: any) { console.warn("[FinancialSync] Backfill falhou (não-fatal):", e?.message ?? e); }
      // Marcar ColFix como aplicado nesta versão — próximos restarts pulam todos os blocos
      import("../services/startupCache").then(({ setCache }) =>
        setCache("colfix_version", COLFIX_VERSION)
      ).catch(() => {});
    });
    // [REMOVIDO Rev.844] Limpeza empresas de teste (Rev.738) — já completada
    // [REMOVIDO Rev.844] Purga de orfanatos/fantasmas — já completada, limpar via deleteObra cascata
    // Jobs escalonados: delay de 15s entre cada um para evitar pico de conexões no startup.
    // Ordem: jobs leves/urgentes primeiro, jobs pesados por último.
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // t=0s — AutoCheck (leve, só agenda cron)
    import("../routers/datajudAutoCheck").then(m => m.startAutoCheckJob()).catch(e => console.error("[AutoCheck] Falha ao iniciar:", e));

    // t=15s — RescisaoCheck
    delay(15_000).then(() =>
      import("../routers/rescisaoNotification").then(m => m.startRescisaoCheckJob()).catch(e => console.error("[RescisaoCheck] Falha ao iniciar:", e))
    );

    // t=20s — FeriasAutoConclude (conclui férias cujo gozo terminou)
    delay(20_000).then(() =>
      import("../routers/avisoPrevioFerias").then(m => m.startFeriasAutoConcludeJob()).catch(e => console.error("[FeriasAutoConclude] Falha ao iniciar:", e))
    );

    // t=30s — Backup (só agenda cron para 03h)
    delay(30_000).then(() =>
      import("../services/backupService").then(m => m.startBackupJob()).catch(e => console.error("[Backup] Falha ao iniciar job:", e))
    );

    // t=45s — StatusSync
    delay(45_000).then(() =>
      import("../services/statusSyncJob").then(m => m.startStatusSyncJob()).catch(e => console.error("[StatusSync] Falha ao iniciar job:", e))
    );

    // t=60s — InventoryJob
    delay(60_000).then(() =>
      import("../services/warehouseInventoryJob").then(m => m.startInventoryJob()).catch(e => console.error("[InventoryJob] Erro:", e))
    );

    // t=75s — PurchaseJobs
    delay(75_000).then(() =>
      import("../services/purchaseAutoJobs").then(m => m.startPurchaseJobs()).catch(e => console.error("[PurchaseJobs] Erro:", e))
    );

    // t=90s — OperacionalJobs
    delay(90_000).then(() =>
      import("../services/operacionalJobs").then(m => m.startOperacionalJobs()).catch(e => console.error("[OperacionalJobs] Erro:", e))
    );

    // t=105s — FleetKmJob
    delay(105_000).then(() =>
      import("../services/fleetKmJob").then(m => m.startFleetKmJob()).catch(e => console.error("[FleetKmJob] Erro:", e))
    );

    // t=120s — FinancialJob (mais pesado — já tinha delay de 90s internamente, agora começa em 120s)
    delay(120_000).then(() =>
      import("../services/financialAutoImportJob").then(m => m.startFinancialAutoImportJob()).catch(e => console.error("[FinancialJob] Erro:", e))
    );

    // t=135s — PJConformidadeJobs (Rev. 1327)
    delay(135_000).then(() =>
      import("../services/pjConformidadeJobs").then(m => m.startPJConformidadeJobs()).catch(e => console.error("[PJConformidadeJobs] Erro:", e))
    );

    // t=150s — SyncMonitor (saúde do backup + sincronização do código com o GitHub)
    delay(150_000).then(() =>
      import("../services/syncMonitorJob").then(m => m.startSyncMonitorJob()).catch(e => console.error("[SyncMonitor] Erro:", e))
    );
  });
}

startServer().catch(console.error);
