// Forçar timezone UTC no Node.js para garantir que timestamps do banco sejam retornados em UTC
process.env.TZ = 'UTC';

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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Download de arquivos SST em ZIP
  registerDownloadSSTRoute(app);
  registerDownloadOCRoute(app);
  // Arquivos de upload locais (fotos de funcionários, etc.)
  app.use("/uploads", express.static(path.join(process.cwd(), "server/uploads")));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
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
        await db.execute(sql`ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS diferencas TEXT`);
        console.log("[ColFix] planejamento_revisoes.diferencas OK");
        await db.execute(sql`ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS module_access TEXT`);
        console.log("[ColFix] user_groups.module_access OK");
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
        console.log("[ColFix] pj_documentos OK");
        await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_marco BOOLEAN DEFAULT FALSE`);
        console.log("[ColFix] planejamento_atividades.is_marco OK");
        await db.execute(sql`ALTER TABLE module_config ADD COLUMN IF NOT EXISTS disabled_pages TEXT`);
        console.log("[ColFix] module_config.disabled_pages OK");
        await db.execute(sql`ALTER TABLE planejamento_revisoes ADD COLUMN IF NOT EXISTS consolidado BOOLEAN DEFAULT FALSE`);
        console.log("[ColFix] planejamento_revisoes.consolidado OK");
        await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE`);
        console.log("[ColFix] planejamento_atividades.disabled OK");
        await db.execute(sql`ALTER TABLE planejamento_atividades ADD COLUMN IF NOT EXISTS is_indireta BOOLEAN DEFAULT FALSE`);
        console.log("[ColFix] planejamento_atividades.is_indireta OK");
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
        console.log("[ColFix] bim_models OK");
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
        console.log("[ColFix] bim_links OK");
        await db.execute(sql`ALTER TABLE epis ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT`);
        console.log("[ColFix] epis.fotoUrl OK");
        // Rev.612: novos campos Aviso Prévio
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsReal" VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsEditadoManualmente" SMALLINT DEFAULT 0`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsEditadoEm" TIMESTAMP WITHOUT TIME ZONE`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "fgtsEditadoPor" VARCHAR(255)`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "descontosAcerto" VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "descontosAcertoDesc" TEXT`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "acrescimosAcerto" VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "acrescimosAcertoDesc" TEXT`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "novoEmpregoAtivo" SMALLINT DEFAULT 0`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "novoEmpregoComunicadoEm" DATE`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "novoEmpregoCartaUrl" TEXT`);
        console.log("[ColFix] termination_notices Rev.612 OK");
        // Rev.664: Módulo PJ — revisões ISO
        await db.execute(sql`ALTER TABLE pj_contracts ADD COLUMN IF NOT EXISTS "revisao" VARCHAR(10) DEFAULT '01'`);
        await db.execute(sql`ALTER TABLE pj_contracts ADD COLUMN IF NOT EXISTS "revisaoMotivo" TEXT`);
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
        console.log("[ColFix] pj_contracts revisao + pj_contract_revisoes Rev.664 OK");
        // Rev.707: vacation_periods — colunas de ajuste/líquido + acréscimos/descontos/recibo
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS ajuste_inss VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS valor_liquido VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS bonus_valor VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS bonus_desc TEXT`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS pensao_desconto VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS outros_descontos VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS outros_descontos_desc TEXT`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS recibo_url TEXT`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS recibo_nome VARCHAR(255)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS media_he VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS media_dsr_he VARCHAR(20)`);
        console.log("[ColFix] vacation_periods Rev.707 OK");
        // Rev.734: arredondamento_provento — ajuste de arredondamento de proventos (incide no INSS)
        await db.execute(sql`ALTER TABLE vacation_periods ADD COLUMN IF NOT EXISTS arredondamento_provento VARCHAR(20)`);
        // Sincronizar flag vencida e status para períodos concessivos expirados
        const hoje = new Date().toISOString().split('T')[0];
        const vencResult = await db.execute(sql`
          UPDATE vacation_periods SET vencida = 1, status = 'vencida'
          WHERE status = 'pendente' AND "periodoConcessivoFim" IS NOT NULL AND "periodoConcessivoFim" < ${hoje}
            AND "deletedAt" IS NULL
        `);
        const vencCount = (vencResult as any).rowCount || 0;
        if (vencCount > 0) console.log(`[ColFix] vacation_periods: ${vencCount} período(s) expirado(s) marcado(s) como vencida`);
        // Recuperar fotos já enviadas cujo fotoUrl não foi salvo no banco
        try {
          const fs = await import("fs");
          const path = await import("path");
          const fotosDir = path.join(process.cwd(), "server", "uploads", "epi-fotos");
          if (fs.existsSync(fotosDir)) {
            const files = fs.readdirSync(fotosDir);
            // Agrupar por EPI id, pegar a mais recente (maior timestamp)
            const byId: Record<number, { ts: number; file: string }> = {};
            for (const f of files) {
              const m = f.match(/^(\d+)_(\d+)\.\w+$/);
              if (!m) continue;
              const epiId = parseInt(m[1]);
              const ts = parseInt(m[2]);
              if (!byId[epiId] || ts > byId[epiId].ts) byId[epiId] = { ts, file: f };
            }
            const ids = Object.keys(byId);
            console.log(`[ColFix] epis.fotoUrl: ${ids.length} arquivo(s) em disco para recuperar.`);
            let recovered = 0;
            for (const [epiId, { file }] of Object.entries(byId)) {
              const url = `/uploads/epi-fotos/${file}`;
              const result = await db.execute(sql`UPDATE epis SET "fotoUrl" = ${url} WHERE id = ${Number(epiId)} AND ("fotoUrl" IS NULL OR "fotoUrl" = '')`);
              if ((result as any).rowCount > 0) recovered++;
            }
            console.log(`[ColFix] epis.fotoUrl: ${recovered}/${ids.length} fotos recuperadas do disco.`);
          }
        } catch (re: any) { console.warn("[ColFix] Recuperação de fotos:", re?.message); }
      } catch (e: any) { console.warn("[ColFix] Aviso:", e?.message ?? e); }
    });
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        const { normalizarTexto } = await import("../../shared/textNormalization");
        const tables = ["compras_solicitacoes_itens", "compras_cotacoes_itens", "compras_ordens_itens"];
        let total = 0;
        for (const tbl of tables) {
          const rows = await db.execute(sql.raw(`SELECT id, descricao FROM ${tbl} WHERE descricao IS NOT NULL`));
          for (const row of (rows as any).rows || rows) {
            const norm = normalizarTexto(row.descricao);
            if (norm !== row.descricao) {
              await db.execute(sql.raw(`UPDATE ${tbl} SET descricao = '${norm.replace(/'/g, "''")}' WHERE id = ${row.id}`));
              total++;
            }
          }
        }
        console.log(`[ColFix] Normalização descrições compras: ${total} registro(s) corrigido(s)`);
      } catch (e: any) { console.warn("[ColFix] Normalização descrições:", e?.message ?? e); }
    });
    // Rev.641: criar tabelas do módulo Hora Extra (he_periods + he_period_employees)
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS he_periods (
            id SERIAL PRIMARY KEY,
            "companyId" INTEGER NOT NULL,
            "mesReferencia" VARCHAR(7) NOT NULL,
            "dataInicio" DATE NOT NULL,
            "dataFim" DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'calculado',
            "totalFuncionarios" INTEGER DEFAULT 0,
            "totalHEMins" INTEGER DEFAULT 0,
            "totalValorHE" NUMERIC(12,2) DEFAULT 0,
            "criadoPor" TEXT,
            "criadoEm" TIMESTAMP DEFAULT NOW(),
            "aprovadoPor" TEXT,
            "aprovadoEm" TIMESTAMP,
            "pagoPor" TEXT,
            "pagoEm" TIMESTAMP,
            observacoes TEXT
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS he_period_employees (
            id SERIAL PRIMARY KEY,
            "hePeriodId" INTEGER NOT NULL,
            "companyId" INTEGER NOT NULL,
            "employeeId" INTEGER NOT NULL,
            nome TEXT,
            "heUtilMins" INTEGER DEFAULT 0,
            "heFimMins" INTEGER DEFAULT 0,
            "heTotalMins" INTEGER DEFAULT 0,
            "valorHEUtil" NUMERIC(10,2) DEFAULT 0,
            "valorHEFim" NUMERIC(10,2) DEFAULT 0,
            "valorHETotal" NUMERIC(10,2) DEFAULT 0,
            "salarioBruto" NUMERIC(10,2) DEFAULT 0,
            "valorHora" NUMERIC(10,4) DEFAULT 0
          )
        `);
        console.log("[ColFix] he_periods + he_period_employees Rev.641 OK");
      } catch (e: any) { console.warn("[ColFix] he_periods:", e?.message ?? e); }
    });
    // Rev.642: colunas valeConsolidadoEm + valeConsolidadoPor em payroll_periods
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeConsolidadoEm" VARCHAR(32)`);
        await db.execute(sql`ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS "valeConsolidadoPor" VARCHAR(200)`);
        console.log("[ColFix] payroll_periods valeConsolidado cols Rev.642 OK");
      } catch (e: any) { console.warn("[ColFix] payroll_periods valeConsolidado:", e?.message ?? e); }
    });
    // Rev.644: Banco de Horas — novas tabelas + coluna destinacao em he_period_employees
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE he_period_employees ADD COLUMN IF NOT EXISTS "destinacao" TEXT NOT NULL DEFAULT 'pagamento'`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS banco_horas_saldo (
            id SERIAL PRIMARY KEY,
            "employeeId" INTEGER NOT NULL,
            "companyId" INTEGER NOT NULL,
            "saldoMinutos" INTEGER NOT NULL DEFAULT 0,
            "atualizadoEm" TIMESTAMP DEFAULT NOW(),
            UNIQUE("employeeId", "companyId")
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS banco_horas_lancamentos (
            id SERIAL PRIMARY KEY,
            "employeeId" INTEGER NOT NULL,
            "companyId" INTEGER NOT NULL,
            "hePeriodId" INTEGER,
            tipo TEXT NOT NULL,
            minutos INTEGER NOT NULL,
            descricao TEXT,
            data DATE NOT NULL DEFAULT CURRENT_DATE,
            "criadoEm" TIMESTAMP DEFAULT NOW(),
            "criadoPor" TEXT
          )
        `);
        console.log("[ColFix] banco_horas_saldo + banco_horas_lancamentos + he_period_employees.destinacao Rev.644 OK");
      } catch (e: any) { console.warn("[ColFix] banco_horas Rev.644:", e?.message ?? e); }
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

    // Rev.590: criar tabelas do módulo Medição de Contratos (se não existirem)
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS medicao_contratos (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            projeto_id INTEGER NOT NULL,
            criterio VARCHAR(30) NOT NULL DEFAULT 'avanco_fisico',
            valor_total_contrato NUMERIC(15,2) DEFAULT 0,
            percentual_sinal NUMERIC(5,2) DEFAULT 0,
            valor_sinal_recebido NUMERIC(15,2) DEFAULT 0,
            percentual_retencao NUMERIC(5,2),
            valor_minimo_fd NUMERIC(15,2),
            status VARCHAR(20) NOT NULL DEFAULT 'ativo',
            observacoes TEXT,
            criado_em TIMESTAMP DEFAULT NOW(),
            atualizado_em TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS medicao_boletins (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            contrato_id INTEGER NOT NULL,
            numero INTEGER NOT NULL,
            periodo_referencia VARCHAR(7) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
            data_envio DATE,
            data_aprovacao DATE,
            valor_bruto NUMERIC(15,2) DEFAULT 0,
            desconto_sinal NUMERIC(15,2) DEFAULT 0,
            desconto_retencao NUMERIC(15,2) DEFAULT 0,
            glosa NUMERIC(15,2) DEFAULT 0,
            deducao_fd NUMERIC(15,2) DEFAULT 0,
            valor_liquido NUMERIC(15,2) DEFAULT 0,
            observacoes TEXT,
            financial_entry_id INTEGER,
            criado_em TIMESTAMP DEFAULT NOW(),
            atualizado_em TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS medicao_boletim_itens (
            id SERIAL PRIMARY KEY,
            boletim_id INTEGER NOT NULL,
            atividade_id INTEGER,
            eap_codigo VARCHAR(50),
            descricao VARCHAR(500) NOT NULL,
            valor_contratual NUMERIC(15,2) DEFAULT 0,
            percentual_acumulado_anterior NUMERIC(8,4) DEFAULT 0,
            percentual_periodo NUMERIC(8,4) DEFAULT 0,
            percentual_acumulado_atual NUMERIC(8,4) DEFAULT 0,
            valor_periodo NUMERIC(15,2) DEFAULT 0,
            tipo_avanco VARCHAR(30) NOT NULL DEFAULT 'fisico',
            is_fd BOOLEAN DEFAULT FALSE,
            criado_em TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS medicao_fd_registros (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL,
            contrato_id INTEGER NOT NULL,
            descricao VARCHAR(500) NOT NULL,
            valor NUMERIC(15,2) NOT NULL,
            data_registro DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pendente',
            boletim_desconto_id INTEGER,
            compra_id INTEGER,
            origem VARCHAR(20) NOT NULL DEFAULT 'manual',
            observacoes TEXT,
            criado_em TIMESTAMP DEFAULT NOW(),
            atualizado_em TIMESTAMP DEFAULT NOW()
          )
        `);
        console.log("[MedicaoMigration] Tabelas do módulo Medição OK");
        await db.execute(sql`ALTER TABLE planejamento_medicao_config ADD COLUMN IF NOT EXISTS sinal_valor NUMERIC(18,2) DEFAULT 0`);
        console.log("[ColFix] planejamento_medicao_config.sinal_valor OK");
        await db.execute(sql`CREATE TABLE IF NOT EXISTS ia_modulo_conversas (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL DEFAULT 0,
          user_id INTEGER NOT NULL DEFAULT 0,
          user_name VARCHAR(200) DEFAULT '',
          modulo VARCHAR(50) NOT NULL,
          pergunta TEXT NOT NULL,
          resposta TEXT NOT NULL,
          projeto_id INTEGER,
          criado_em TIMESTAMP DEFAULT NOW()
        )`);
        console.log("[ColFix] ia_modulo_conversas OK");
        await db.execute(sql`CREATE TABLE IF NOT EXISTS user_activity_log (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL DEFAULT 0,
          user_id INTEGER NOT NULL DEFAULT 0,
          user_name VARCHAR(200) DEFAULT '',
          tipo VARCHAR(50) NOT NULL DEFAULT 'page_visit',
          pagina VARCHAR(500) NOT NULL DEFAULT '',
          acao VARCHAR(500),
          modulo VARCHAR(100),
          detalhes TEXT,
          duracao_segundos INTEGER DEFAULT 0,
          criado_em TIMESTAMP DEFAULT NOW()
        )`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ual_company_criado ON user_activity_log(company_id, criado_em)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ual_user_company ON user_activity_log(user_id, company_id, criado_em DESC)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ual_company_tipo ON user_activity_log(company_id, tipo, criado_em)`);
        console.log("[Telemetria] user_activity_log OK");
      } catch (e: any) { console.warn("[MedicaoMigration] Aviso:", e?.message ?? e); }
    });
    // Rev.547: migração aviso prévio — adiciona dataBaixa e move concluidos auto-marcados → aguardando_pagamento
    // Rev.586: corrigido para usar NEON_DATABASE_URL (banco correto da FC Engenharia)
    (async () => {
      try {
        const { Pool } = await import("pg");
        const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
        await pool.query(`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "dataBaixa" date`);
        const r = await pool.query(`UPDATE termination_notices SET status='aguardando_pagamento', "updatedAt"=NOW() WHERE status='concluido' AND "dataBaixa" IS NULL AND "deletedAt" IS NULL`);
        await pool.end();
        if (r.rowCount && r.rowCount > 0)
          console.log(`[AvisoPrevioMigration] ${r.rowCount} aviso(s) movido(s) de 'concluido' → 'aguardando_pagamento'`);
        else
          console.log("[AvisoPrevioMigration] Nenhum aviso a migrar (coluna dataBaixa OK)");
      } catch (e: any) { console.warn("[AvisoPrevioMigration] Aviso:", e?.message ?? e); }
    })();
    // Rev.716 — BUG-001 retroativo: recalcular termination_notices em_andamento com férias vencidas reais
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        const { calcularRescisaoCompleta, parseBRL } = await import("../utils/rescisaoCalc");

        // Buscar todos os avisos em andamento ou aguardando pagamento
        const avisos = ((await db.execute(sql`
          SELECT tn.id, tn."employeeId", tn."tipo", tn."dataInicio", tn."dataFim",
                 tn."salarioBase", e."dataAdmissao"
          FROM termination_notices tn
          JOIN employees e ON e.id = tn."employeeId"
          WHERE tn.status IN ('em_andamento', 'aguardando_pagamento')
            AND tn."deletedAt" IS NULL
        `)) as any).rows || [];

        let atualizados = 0;
        for (const aviso of avisos) {
          try {
            const dataAdmissao = aviso.dataAdmissao || new Date().toISOString().split('T')[0];
            const salarioBase = parseBRL(aviso.salarioBase);
            const dataDesligFinal = aviso.dataInicio;
            const dataFim = aviso.dataFim;
            if (!dataFim) continue;

            const dtFimAviso = new Date(dataFim + 'T00:00:00');
            const dtDataSaida = new Date(dtFimAviso);
            dtDataSaida.setDate(dtDataSaida.getDate() + 1);
            const diasTrabalhadosMes = dtDataSaida.getDate();

            // Contagem REAL de férias vencidas do banco
            const vpRows = ((await db.execute(sql`
              SELECT COUNT(*)::int AS total FROM vacation_periods
              WHERE "employeeId" = ${aviso.employeeId}
                AND status NOT IN ('concluida', 'cancelada', 'em_gozo')
                AND "periodoConcessivoFim" IS NOT NULL
                AND "periodoConcessivoFim" < ${dataFim}
                AND "deletedAt" IS NULL
            `)) as any).rows || [];
            const periodosVencidosReal = Number(vpRows[0]?.total ?? 0);

            const previsao = calcularRescisaoCompleta({
              salarioBase,
              dataAdmissao,
              dataDesligamento: dataDesligFinal,
              dataFimAviso: dataFim,
              tipo: aviso.tipo,
              vrDiario: 0,
              diasTrabalhadosMes,
              periodosVencidosOverride: periodosVencidosReal,
            });

            await db.execute(sql`
              UPDATE termination_notices
              SET "valorEstimadoTotal" = ${previsao.total},
                  "previsaoRescisao" = ${JSON.stringify(previsao)}
              WHERE id = ${aviso.id}
            `);
            atualizados++;
          } catch { /* ignora falha individual */ }
        }
        console.log(`[ColFix] BUG-001 retroativo: ${atualizados}/${avisos.length} rescisão(ões) recalculada(s) com férias reais`);
      } catch (e: any) { console.warn("[ColFix] BUG-001 retroativo:", e?.message ?? e); }
    });
    // Rev.737 — BUG-002 retroativo: recalcular vacation_periods com bonus_valor > 0 (acréscimos na base)
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");

        const rows = ((await db.execute(sql`
          SELECT vp.id, vp."diasGozo", vp.bonus_valor, vp.media_he, vp.media_dsr_he, vp."valorAbono",
                 e."salarioBase"
          FROM vacation_periods vp
          JOIN employees e ON e.id = vp."employeeId"
          WHERE vp.bonus_valor IS NOT NULL
            AND vp.bonus_valor NOT IN ('0', '0.00', '0,00', '')
            AND vp."deletedAt" IS NULL
        `)) as any).rows || [];

        const parseBRL = (v: string) => {
          if (!v) return 0;
          const s = v.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
          return parseFloat(s) || 0;
        };

        let atualizados = 0;
        for (const r of rows) {
          try {
            const salario = parseBRL(r.salarioBase || "0");
            if (salario <= 0) continue;
            const mHE    = parseFloat(r.media_he     || "0") || 0;
            const mDSR   = parseFloat(r.media_dsr_he || "0") || 0;
            const bonus  = parseFloat(r.bonus_valor  || "0") || 0;
            const dias   = Number(r.diasGozo) || 30;
            const abono  = parseFloat(r.valorAbono   || "0") || 0;
            if (bonus <= 0) continue;

            const base    = salario + mHE + mDSR + bonus;
            const vFerias = (base / 30) * dias;
            const vTerco  = vFerias / 3;
            const vTotal  = vFerias + vTerco + abono;

            await db.execute(sql`
              UPDATE vacation_periods
              SET "valorFerias"               = ${vFerias.toFixed(2)},
                  "valorTercoConstitucional"  = ${vTerco.toFixed(2)},
                  "valorTotal"                = ${vTotal.toFixed(2)}
              WHERE id = ${r.id}
            `);
            atualizados++;
          } catch { /* ignora falha individual */ }
        }
        console.log(`[ColFix] BUG-002 retroativo: ${atualizados}/${rows.length} férias recalculada(s) com acréscimos na base`);
      } catch (e: any) { console.warn("[ColFix] BUG-002 retroativo:", e?.message ?? e); }
    });
    // Rev.721: ColFix — colunas de biometria facial em epi_deliveries (Neon DB)
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS biometria_facial_url TEXT`);
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS biometria_capturada_em TIMESTAMP`);
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS modo_identificacao VARCHAR(20) DEFAULT 'manual'`);
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS assinatura_responsavel_url TEXT`);
        console.log("[ColFix] epi_deliveries biometria + assinatura_responsavel Rev.722 OK");
      } catch (e: any) { console.warn("[ColFix] epi_deliveries biometria:", e?.message ?? e); }
    });
    // Rev.726: ColFix — colunas de assinatura digital em warnings (advertências)
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE warnings ADD COLUMN IF NOT EXISTS assinatura_funcionario_url TEXT`);
        await db.execute(sql`ALTER TABLE warnings ADD COLUMN IF NOT EXISTS assinatura_aplicador_url TEXT`);
        console.log("[ColFix] warnings assinatura_funcionario_url + assinatura_aplicador_url Rev.726 OK");
      } catch (e: any) { console.warn("[ColFix] warnings assinaturas:", e?.message ?? e); }
      // ColFix Rev.730 — Adicionais de trabalho (insalubridade, periculosidade, noturno) em obras e alocações
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS insalubridade_grau VARCHAR(20) DEFAULT 'none'`);
        await db.execute(sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS periculosidade SMALLINT DEFAULT 0`);
        await db.execute(sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS adicional_noturno_ativo SMALLINT DEFAULT 0`);
        await db.execute(sql`ALTER TABLE obras ADD COLUMN IF NOT EXISTS condicoes_vigencia_inicio DATE`);
        await db.execute(sql`ALTER TABLE obra_funcionarios ADD COLUMN IF NOT EXISTS insalubridade_override VARCHAR(20) DEFAULT 'herda'`);
        await db.execute(sql`ALTER TABLE obra_funcionarios ADD COLUMN IF NOT EXISTS periculosidade_override VARCHAR(10) DEFAULT 'herda'`);
        await db.execute(sql`ALTER TABLE obra_funcionarios ADD COLUMN IF NOT EXISTS adicional_escolhido VARCHAR(20) DEFAULT 'auto'`);
        console.log("[ColFix] obras + obra_funcionarios adicionais Rev.730 OK");
      } catch (e: any) { console.warn("[ColFix] adicionais Rev.730:", e?.message ?? e); }
    });
    // Rev.738: ColFix — soft-delete empresas de teste e manter apenas FC, Hotel Consagrado, LOCNOW
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        const keepIds = [60002, 60004, 90001];
        const res = await db.execute(sql`
          UPDATE companies SET "deletedAt" = NOW()
          WHERE "deletedAt" IS NULL AND id NOT IN (60002, 60004, 90001)
        `);
        const count = (res as any).rowCount ?? (res as any).length ?? 0;
        if (count > 0) {
          console.log(`[ColFix] ${count} empresa(s) de teste removida(s) — mantidas: ${keepIds.join(', ')}`);
        } else {
          console.log("[ColFix] Limpeza de empresas: OK (nenhuma empresa extra)");
        }
      } catch (e: any) { console.warn("[ColFix] Limpeza empresas:", e?.message ?? e); }

      try {
        const db2 = await getDb();
        if (!db2) return;
        const { sql: sql2 } = await import("drizzle-orm");
        const orphanProjs = await db2.execute(sql2`
          SELECT pp.id FROM planejamento_projetos pp
          LEFT JOIN orcamentos o ON o.id = pp.orcamento_id AND o."deleted_at" IS NULL
          WHERE pp.orcamento_id IS NOT NULL AND o.id IS NULL
        `);
        const orphanIds = (orphanProjs as any).rows?.map((r: any) => r.id) ?? [];
        if (orphanIds.length > 0) {
          for (const pid of orphanIds) {
            await db2.execute(sql2`DELETE FROM planejamento_refis WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM planejamento_avancos WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM planejamento_medicoes WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM planejamento_atividades WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM planejamento_revisoes WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM ia_cronograma_chat WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM ia_cronograma_alertas WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM ia_cronograma_cenarios WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM ia_cronograma_monitoramento WHERE projeto_id = ${pid}`);
            await db2.execute(sql2`DELETE FROM planejamento_projetos WHERE id = ${pid}`);
          }
          console.log(`[ColFix] ${orphanIds.length} planejamento(s) órfão(s) removido(s) (orçamento deletado)`);
        }

        const ghostOrcs = await db2.execute(sql2`
          SELECT o.id FROM orcamentos o WHERE o."deleted_at" IS NOT NULL
        `);
        const ghostIds = (ghostOrcs as any).rows?.map((r: any) => r.id) ?? [];
        if (ghostIds.length > 0) {
          const childTables = [
            "orcamento_revisoes", "orcamento_itens", "orcamento_insumos",
            "orcamento_bdi", "orcamento_secs",
            "bdi_indiretos", "bdi_fd", "bdi_adm_central",
            "bdi_despesas_financeiras", "bdi_tributos", "bdi_taxa_comercializacao"
          ];
          let allOk = true;
          const errors: string[] = [];
          for (const oid of ghostIds) {
            for (const tbl of childTables) {
              try {
                await db2.execute(sql2.raw(`DELETE FROM ${tbl} WHERE "orcamentoId" = ${Number(oid)}`));
              } catch (tblErr: any) {
                allOk = false;
                errors.push(`${tbl}(${oid}): ${tblErr?.message ?? tblErr}`);
              }
            }
          }
          await db2.execute(sql2`DELETE FROM orcamentos WHERE "deleted_at" IS NOT NULL`);
          if (errors.length > 0) {
            console.warn(`[ColFix] ${ghostIds.length} fantasma(s) purgado(s) com ${errors.length} aviso(s): ${errors.slice(0, 3).join("; ")}`);
          } else {
            console.log(`[ColFix] ${ghostIds.length} orçamento(s) fantasma(s) purgado(s) definitivamente`);
          }
        } else {
          console.log("[ColFix] Orçamentos/planejamentos fantasmas: nenhum encontrado");
        }
        // GOLDEN RULE #11: Limpar dados órfãos de obras excluídas (cascata retroativa)
        const deletedObras2 = await db2.execute(sql2`SELECT id FROM obras WHERE "deletedAt" IS NOT NULL`);
        const delObraIds = ((deletedObras2 as any).rows ?? deletedObras2 ?? []).map((r: any) => r.id);
        if (delObraIds.length > 0) {
          let totalCleaned = 0;
          for (const oid of delObraIds) {
            // Planejamento cascade (same order as deleteObra)
            const pRows = await db2.execute(sql2`SELECT id FROM planejamento_projetos WHERE obra_id = ${oid}`);
            const pIds = ((pRows as any).rows ?? pRows ?? []).map((r: any) => r.id);
            for (const pid of pIds) {
              try { await db2.execute(sql2`DELETE FROM planejamento_refis WHERE projeto_id = ${pid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM planejamento_avancos WHERE projeto_id = ${pid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM planejamento_medicoes WHERE projeto_id = ${pid}`); } catch (_) {}
              const a1 = await db2.execute(sql2`DELETE FROM planejamento_atividades WHERE projeto_id = ${pid}`);
              totalCleaned += (a1 as any).rowCount ?? 0;
              try { await db2.execute(sql2`DELETE FROM planejamento_revisoes WHERE projeto_id = ${pid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM ia_cronograma_chat WHERE projeto_id = ${pid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM ia_cronograma_alertas WHERE projeto_id = ${pid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM ia_cronograma_cenarios WHERE projeto_id = ${pid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM ia_cronograma_monitoramento WHERE projeto_id = ${pid}`); } catch (_) {}
            }
            if (pIds.length > 0) {
              const d1 = await db2.execute(sql2`DELETE FROM planejamento_projetos WHERE obra_id = ${oid}`);
              totalCleaned += (d1 as any).rowCount ?? 0;
            }
            // Orçamentos cascade
            const oRows = await db2.execute(sql2`SELECT id FROM orcamentos WHERE "obraId" = ${oid}`);
            const oIds = ((oRows as any).rows ?? oRows ?? []).map((r: any) => r.id);
            for (const ocid of oIds) {
              try { await db2.execute(sql2`DELETE FROM orcamento_itens WHERE "orcamentoId" = ${ocid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM orcamento_insumos WHERE "orcamentoId" = ${ocid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM orcamento_bdi WHERE "orcamentoId" = ${ocid}`); } catch (_) {}
              try { await db2.execute(sql2`DELETE FROM orcamento_revisoes WHERE "orcamentoId" = ${ocid}`); } catch (_) {}
            }
            if (oIds.length > 0) {
              try { await db2.execute(sql2`DELETE FROM orcamentos WHERE "obraId" = ${oid}`); } catch (_) {}
            }
            // Direct child tables (camelCase obraId)
            const ccTables = [
              'obra_funcionarios','obra_horas_rateio','manual_obra_assignments','obra_sns',
              'time_records','time_inconsistencies','unmatched_dixi_records','timecard_daily',
              'employee_site_history','epi_deliveries','epi_estoque_obra','epi_estoque_minimo',
              'convencao_coletiva','dixi_afd_importacoes','dixi_afd_marcacoes','dixi_devices',
              'eval_avaliacoes','eval_avaliadores','eval_surveys',
              'field_notes','financial_events','funcionarios_terceiros',
              'he_solicitacoes','meal_benefit_configs',
            ];
            for (const t of ccTables) {
              try {
                const dr = await db2.execute(sql2.raw(`DELETE FROM ${t} WHERE "obraId" = ${oid}`));
                totalCleaned += (dr as any).rowCount ?? 0;
              } catch (_) {}
            }
            // Direct child tables (snake_case obra_id)
            const scTables = [
              'purchase_requests','purchase_orders','purchase_receipts',
              'purchase_accounts_payable','purchase_approval_rules','purchase_spending_limits',
              'budget_reallocations','buyer_commissions','emergency_metrics',
              'terceiro_contratos','terceiro_medicoes',
            ];
            for (const t of scTables) {
              try {
                const dr = await db2.execute(sql2.raw(`DELETE FROM ${t} WHERE obra_id = ${oid}`));
                totalCleaned += (dr as any).rowCount ?? 0;
              } catch (_) {}
            }
          }
          if (totalCleaned > 0) {
            console.log(`[ColFix] Obras deletadas: ${delObraIds.length} obras, ${totalCleaned} registros órfãos removidos`);
          } else {
            console.log(`[ColFix] Obras deletadas: ${delObraIds.length} obras, nenhum dado órfão`);
          }
        } else {
          console.log("[ColFix] Obras deletadas: nenhuma na lixeira");
        }
      } catch (e: any) { console.warn("[ColFix] Limpeza fantasmas + obras deletadas:", e?.message ?? e); }
    });
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
  });
}

startServer().catch(console.error);
