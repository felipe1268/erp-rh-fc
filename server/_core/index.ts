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
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { securityHeaders, apiRateLimit, authRateLimit } from "../security";

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
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Keep-alive otimizado para reduzir latência de conexão
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Bootstrap admin user and default company from env vars (Railway / fresh DB)
    import("./initSetup").then(m => m.initSetup()).catch(e => console.error("[InitSetup] Falha ao iniciar:", e));
    // Sincronizar revisões do changelog com o banco de dados
    import("../syncRevisions").then(m => m.syncRevisions()).catch(e => console.error("[SyncRevisions] Falha ao iniciar:", e));
    // Sincronizar colunas do schema Drizzle → banco Neon (ADD COLUMN IF NOT EXISTS)
    import("../syncSchema").then(m => m.syncSchema()).catch(e => console.error("[SyncSchema] Falha ao iniciar:", e));
    // Garantir colunas críticas adicionadas recentemente que o SyncSchema possa ter ignorado
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          DO $$ BEGIN
            ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS diferencas TEXT;
            ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS consolidado BOOLEAN DEFAULT FALSE;
            ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS module_access TEXT;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_marco BOOLEAN DEFAULT FALSE;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE;
            ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_indireta BOOLEAN DEFAULT FALSE;
            ALTER TABLE module_config ADD COLUMN IF NOT EXISTS disabled_pages TEXT;
            ALTER TABLE epis ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;
            ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "previsaoRescisaoComplementar" TEXT;
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
            ALTER TABLE pj_contracts ADD COLUMN IF NOT EXISTS "revisao" VARCHAR(10) DEFAULT '01';
            ALTER TABLE pj_contracts ADD COLUMN IF NOT EXISTS "revisaoMotivo" TEXT;
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
            ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS criado_por_id INTEGER;
            ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
            ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS aprovador_nome VARCHAR(255);
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS criado_por_id INTEGER;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
            ALTER TABLE compras_ordens ADD COLUMN IF NOT EXISTS aprovador_nome VARCHAR(255);
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
    // [REMOVIDO Rev.844] Limpeza empresas de teste (Rev.738) — já completada
    // [REMOVIDO Rev.844] Purga de orfanatos/fantasmas — já completada, limpar via deleteObra cascata
    // Iniciar job de verificação automática do DataJud
    import("../routers/datajudAutoCheck").then(m => m.startAutoCheckJob()).catch(e => console.error("[AutoCheck] Falha ao iniciar:", e));
    // Iniciar job de verificação de prazos de rescisão (Art. 477 §6º CLT)
    import("../routers/rescisaoNotification").then(m => m.startRescisaoCheckJob()).catch(e => console.error("[RescisaoCheck] Falha ao iniciar:", e));
    // Iniciar job de backup diário automático (03:00 Brasília)
    import("../services/backupService").then(m => m.startBackupJob()).catch(e => console.error("[Backup] Falha ao iniciar job:", e));
    // Iniciar job de sincronização automática de status de funcionários (a cada 1h)
    import("../services/statusSyncJob").then(m => m.startStatusSyncJob()).catch(e => console.error("[StatusSync] Falha ao iniciar job:", e));
    // Job de inventário semanal do almoxarifado
    import("../services/warehouseInventoryJob").then(m => m.startInventoryJob()).catch(e => console.error("[InventoryJob] Erro:", e));
    // Job de auto-importação financeira (a cada 1h)
    import("../services/financialAutoImportJob").then(m => m.startFinancialAutoImportJob()).catch(e => console.error("[FinancialJob] Erro:", e));
    // Jobs de compras: vencimentos de OC, expiração de cotações, alertas de contratos
    import("../services/purchaseAutoJobs").then(m => m.startPurchaseJobs()).catch(e => console.error("[PurchaseJobs] Erro:", e));
    // Jobs do módulo operacional: auto-criar RDO, alertas 18h/20h, clima automático
    import("../services/operacionalJobs").then(m => m.startOperacionalJobs()).catch(e => console.error("[OperacionalJobs] Erro:", e));
    // Job de coleta automática de km diário da frota (a cada 30 min)
    import("../services/fleetKmJob").then(m => m.startFleetKmJob()).catch(e => console.error("[FleetKmJob] Erro:", e));
  });
}

startServer().catch(console.error);
