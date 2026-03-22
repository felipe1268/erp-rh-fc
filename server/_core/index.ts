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
        console.log("[ColFix] vacation_periods Rev.707 OK");
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
      } catch (e: any) { console.warn("[MedicaoMigration] Aviso:", e?.message ?? e); }
    });
    // Rev.547: migração aviso prévio — adiciona dataBaixa e move concluidos auto-marcados → aguardando_pagamento
    // Rev.586: corrigido para usar NEON_DATABASE_URL (banco correto da FC Engenharia)
    (async () => {
      try {
        const { Pool } = await import("pg");
        const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL });
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
    // Rev.721: ColFix — colunas de biometria facial em epi_deliveries (Neon DB)
    import("../db").then(async ({ getDb }) => {
      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS biometria_facial_url TEXT`);
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS biometria_capturada_em TIMESTAMP`);
        await db.execute(sql`ALTER TABLE epi_deliveries ADD COLUMN IF NOT EXISTS modo_identificacao VARCHAR(20) DEFAULT 'manual'`);
        console.log("[ColFix] epi_deliveries biometria Rev.721 OK");
      } catch (e: any) { console.warn("[ColFix] epi_deliveries biometria:", e?.message ?? e); }
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
