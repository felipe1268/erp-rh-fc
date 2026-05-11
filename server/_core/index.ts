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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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

        // Rev. 1592: bloco Escritório Central na avaliação anônima do Portal do Cliente.
        // Garantido aqui (e não só em ColFix) porque o version guard do ColFix pode
        // pular as migrations quando a versão já estiver aplicada.
        // Rev. 1637 — Data de Corte (Status Date PMBOK/EVM) por projeto.
        // Garantida fora do ColFix porque o version guard pode pular as migrations.
        try {
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_atual DATE`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_atualizada_em TIMESTAMP`);
          await db.execute(sql`ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS data_corte_atualizada_por VARCHAR(200)`);
          console.log(`[SyncSchema+] Colunas data_corte_* garantidas em planejamento_projetos.`);
        } catch (e: any) { console.error(`[SyncSchema+] FALHA planejamento_projetos data_corte:`, e?.message || e); }

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
        console.log(`[SyncSchema+] Tabelas SST Integração garantidas.`);

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

      } catch (e: any) { console.error(`[SyncSchema+] ERROR:`, e?.message || e); }
    }).catch(e => console.error("[SyncSchema] Falha ao iniciar:", e));
    // Garantir colunas críticas adicionadas recentemente que o SyncSchema possa ter ignorado
    // ColFix version guard: pula todos os blocos se já foram aplicados nesta versão
    const COLFIX_VERSION = "v1642-2026-05-11-msproject-calendario";
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
          EXCEPTION WHEN OTHERS THEN NULL;
          END $$
        `);
        console.log("[ColFix] EPI/warnings/obras/orcamento/terceiros/cargoConfianca cols OK");
      } catch (e: any) { console.warn("[ColFix] Bloco2:", e?.message ?? e); }
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
  });
}

startServer().catch(console.error);
