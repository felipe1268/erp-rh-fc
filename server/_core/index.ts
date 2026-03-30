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
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "canceladoPorNome" VARCHAR(255)`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "canceladoPorId" INTEGER`);
        await db.execute(sql`ALTER TABLE termination_notices ADD COLUMN IF NOT EXISTS "dataCancelamento" TIMESTAMP WITHOUT TIME ZONE`);
        console.log("[ColFix] termination_notices Rev.901 OK");
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
        // [REMOVIDO Rev.844] Recuperação de fotos EPI — já completada, não precisa rodar a cada boot
        await db.execute(sql`ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS modalidade_fd VARCHAR(20) DEFAULT 'normal'`);
        await db.execute(sql`ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS fd_valor NUMERIC(14,2)`);
        await db.execute(sql`ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS fd_pagador VARCHAR(20)`);
        await db.execute(sql`ALTER TABLE compras_cotacoes ADD COLUMN IF NOT EXISTS fd_bdi_item_id INTEGER`);
        console.log("[ColFix] compras_cotacoes FD columns Rev.895 OK");
        await db.execute(sql`ALTER TABLE compras_cotacao_fornecedores ADD COLUMN IF NOT EXISTS modulo_medicao VARCHAR(30)`);
        console.log("[ColFix] compras_cotacao_fornecedores modulo_medicao Rev.897 OK");
        await db.execute(sql`UPDATE compras_cotacoes SET status = 'concluida' WHERE contrato_terceiro_id IS NOT NULL AND status = 'aprovada'`);
        console.log("[ColFix] cotacoes com contrato terceiro → concluida Rev.899 OK");
        await db.execute(sql`ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS rejeitado_por VARCHAR(255)`);
        await db.execute(sql`ALTER TABLE terceiro_medicoes ADD COLUMN IF NOT EXISTS rejeitado_em TIMESTAMP`);
        console.log("[ColFix] terceiro_medicoes rejeitadoPor/rejeitadoEm Rev.904 OK");
      } catch (e: any) { console.warn("[ColFix] Aviso:", e?.message ?? e); }
    });
    // [REMOVIDO Rev.844] Normalização de textos compras — agora feita no momento de salvar/editar
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
    // [REMOVIDO Rev.844] Migração aviso prévio (Rev.547/586) — já completada
    // [REMOVIDO Rev.844] BUG-001 retroativo (Rev.716) — já processou todas as rescisões
    // [REMOVIDO Rev.844] BUG-002 retroativo (Rev.737) — já recalculou todas as férias
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

      try {
        const db = await getDb();
        if (!db) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_unit_mat NUMERIC(18,4)`);
        await db.execute(sql`ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_unit_mdo NUMERIC(18,4)`);
        await db.execute(sql`ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_total_mat NUMERIC(18,2)`);
        await db.execute(sql`ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_total_mdo NUMERIC(18,2)`);
        const nullCount = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM orcamento_itens
          WHERE (meta_unit_mat IS NULL OR meta_unit_mdo IS NULL OR meta_total_mat IS NULL OR meta_total_mdo IS NULL)
        `);
        const cnt = parseInt((nullCount as any).rows?.[0]?.cnt ?? '0', 10);
        if (cnt > 0) {
          await db.execute(sql`
            UPDATE orcamento_itens oi
            SET
              meta_unit_mat = ROUND(COALESCE("custoUnitMat"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 4),
              meta_unit_mdo = ROUND(COALESCE("custoUnitMdo"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 4),
              meta_total_mat = ROUND(COALESCE("custoTotalMat"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 2),
              meta_total_mdo = ROUND(COALESCE("custoTotalMdo"::numeric, 0) * (1 - COALESCE(o."metaPercentual"::numeric, 0.20)), 2)
            FROM orcamentos o
            WHERE o.id = oi."orcamentoId"
              AND (oi.meta_unit_mat IS NULL OR oi.meta_unit_mdo IS NULL OR oi.meta_total_mat IS NULL OR oi.meta_total_mdo IS NULL)
          `);
          console.log(`[ColFix] orcamento_itens meta MAT/MDO: ${cnt} itens atualizados Rev.888`);
        } else {
          console.log("[ColFix] orcamento_itens meta MAT/MDO já OK Rev.888");
        }
      } catch (e: any) { console.warn("[ColFix] meta MAT/MDO Rev.888:", e?.message ?? e); }

      try {
        const db2 = await getDb();
        if (!db2) return;
        const { sql: sql2 } = await import("drizzle-orm");
        const fixedTipo = await db2.execute(sql2`
          UPDATE compras_cotacoes c
          SET tipo = 'servico'
          FROM compras_solicitacoes s
          WHERE c.solicitacao_id = s.id
            AND s.tipo IN ('servico', 'pacote')
            AND c.tipo = 'material'
        `);
        const fixCount = (fixedTipo as any).rowCount ?? 0;
        if (fixCount > 0) {
          console.log(`[ColFix] cotações tipo corrigido: ${fixCount} cotações material→servico Rev.888`);
        } else {
          console.log("[ColFix] cotações tipo já OK Rev.888");
        }
      } catch (e: any) { console.warn("[ColFix] cotações tipo Rev.888:", e?.message ?? e); }

      try {
        const db3 = await getDb();
        if (!db3) return;
        const { sql: sql3 } = await import("drizzle-orm");
        const colCheck = await db3.execute(sql3`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'compras_solicitacoes_itens' AND column_name = 'incluir_ajudante'
        `);
        if (((colCheck as any).rows ?? []).length === 0) {
          await db3.execute(sql3`
            ALTER TABLE compras_solicitacoes_itens
            ADD COLUMN IF NOT EXISTS incluir_ajudante BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS meta_mdo_profissional NUMERIC(18,4) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS meta_mdo_ajudante NUMERIC(18,4) DEFAULT 0
          `);
          console.log("[ColFix] compras_solicitacoes_itens incluir_ajudante + meta_mdo_prof/ajud Rev.889");
        } else {
          console.log("[ColFix] compras_solicitacoes_itens incluir_ajudante já OK Rev.889");
        }
      } catch (e: any) { console.warn("[ColFix] incluir_ajudante Rev.889:", e?.message ?? e); }

      try {
        const db4 = await getDb();
        if (!db4) return;
        const { sql: sql4 } = await import("drizzle-orm");
        const mdoPat = "%(m.o%|%mão de obra%|%mdo%|%pedreiro%|%servente%|%ajudante%|%auxiliar%|%encanador%|%eletricista%|%pintor%|%carpinteiro%|%armador%|%soldador%|%serralheiro%|%gesseiro%|%azulejista%|%marmorista%|%vidraceiro%|%impermeabilizador%|%operador%)";
        const fixSC = await db4.execute(sql4`
          UPDATE compras_solicitacoes sc SET tipo = 'servico'
          WHERE sc.tipo = 'material'
          AND (
            LOWER(sc.titulo) SIMILAR TO ${mdoPat}
            OR EXISTS (
              SELECT 1 FROM compras_solicitacoes_itens i
              WHERE i.solicitacao_id = sc.id
              AND (i.composicao_codigo IS NOT NULL OR LOWER(i.descricao) SIMILAR TO ${mdoPat})
            )
          )
        `);
        const scFixed = (fixSC as any).rowCount ?? 0;
        if (scFixed > 0) {
          const fixCot = await db4.execute(sql4`
            UPDATE compras_cotacoes c SET tipo = 'servico'
            FROM compras_solicitacoes s
            WHERE c.solicitacao_id = s.id AND s.tipo = 'servico' AND c.tipo = 'material'
          `);
          const cotFixed = (fixCot as any).rowCount ?? 0;
          console.log(`[ColFix] Auto-tipo: ${scFixed} SC(s) + ${cotFixed} cotação(ões) corrigidas para 'servico' Rev.889`);
        } else {
          console.log("[ColFix] Auto-tipo SC/cotação OK Rev.889");
        }
      } catch (e: any) { console.warn("[ColFix] auto-tipo Rev.889:", e?.message ?? e); }
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
  });
}

startServer().catch(console.error);
