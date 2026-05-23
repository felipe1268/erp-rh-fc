-- ============================================================================
-- Rev. 2256 — Módulo Controle de Equipamentos (Fase 1 Sprint 1: schema base)
-- ============================================================================
-- Resolve perda recorrente de R$ 10-20k/mês com locações descontroladas.
-- 100% aditiva (ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS).
-- Nenhum DROP, RENAME ou ALTER destrutivo — R-001/R-007/R-010 respeitadas.
--
-- Conteúdo:
--   A) 6 tabelas novas: equipamentos_proprios, equipamentos_locados,
--      equipamento_locado_eventos, solicitacoes_equipamento,
--      fatura_locacao_conferencia, parametros_capex.
--   B) Extensões aditivas em compras_ordens e warehouse_loans.
--   C) Índices de performance (CREATE INDEX IF NOT EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1) EQUIPAMENTOS PRÓPRIOS (ativo fixo da construtora)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "equipamentos_proprios" (
  "id"                          serial PRIMARY KEY,
  "company_id"                  integer NOT NULL,
  "codigo_patrimonio"           varchar(50) NOT NULL,
  "descricao"                   varchar(255) NOT NULL,
  "categoria"                   varchar(100),
  "numero_serie"                varchar(100),
  "marca"                       varchar(100),
  "modelo"                      varchar(100),
  "data_aquisicao"              varchar(10),
  "valor_aquisicao"             numeric(14,2),
  "vida_util_meses"             integer,
  "custo_manut_medio_mes"       numeric(14,2) DEFAULT '0',
  "custo_seguro_medio_mes"      numeric(14,2) DEFAULT '0',
  "localizacao_atual_tipo"      varchar(20) DEFAULT 'almoxarifado',
  "localizacao_atual_obra_id"   integer,
  "status"                      varchar(20) NOT NULL DEFAULT 'disponivel',
  "fotos_json"                  jsonb,
  "observacoes"                 text,
  "ativo"                       boolean DEFAULT true,
  "created_at"                  timestamp DEFAULT now() NOT NULL,
  "updated_at"                  timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_equip_proprio_company_patrimonio"
  ON "equipamentos_proprios" ("company_id", "codigo_patrimonio");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_proprio_company_status"
  ON "equipamentos_proprios" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_proprio_categoria"
  ON "equipamentos_proprios" ("categoria");
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- A2) EQUIPAMENTOS LOCADOS (unidade física de terceiro)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "equipamentos_locados" (
  "id"                              serial PRIMARY KEY,
  "company_id"                      integer NOT NULL,
  "obra_id"                         integer,
  "fornecedor_id"                   integer,
  "fornecedor_nome"                 varchar(255),
  "ordem_compra_id"                 integer,
  "contrato_locacao_id"             integer,
  "codigo_patrimonio_fornecedor"    varchar(100),
  "codigo_interno_erp"              varchar(50),
  "descricao"                       varchar(255) NOT NULL,
  "categoria"                       varchar(100),
  "numero_serie"                    varchar(100),
  "data_inicio"                     varchar(10) NOT NULL,
  "data_fim_prevista"               varchar(10) NOT NULL,
  "data_fim_real"                   varchar(10),
  "valor_diario"                    numeric(14,2),
  "valor_mensal"                    numeric(14,2),
  "status"                          varchar(30) NOT NULL DEFAULT 'em_uso',
  "fotos_recebimento_json"          jsonb,
  "fotos_devolucao_json"            jsonb,
  "funcionario_responsavel_id"      integer,
  "funcionario_responsavel_nome"    varchar(255),
  "observacoes"                     text,
  "oc_anterior_id"                  integer,
  "ultimo_check_in_data"            varchar(10),
  "ultimo_check_in_user_id"         integer,
  "created_at"                      timestamp DEFAULT now() NOT NULL,
  "updated_at"                      timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_equip_loc_company_status"
  ON "equipamentos_locados" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_loc_obra"
  ON "equipamentos_locados" ("obra_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_loc_fornecedor"
  ON "equipamentos_locados" ("fornecedor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_loc_data_fim"
  ON "equipamentos_locados" ("data_fim_prevista");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_loc_oc"
  ON "equipamentos_locados" ("ordem_compra_id");
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- A3) EVENTOS DO EQUIPAMENTO LOCADO (timeline de auditoria)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "equipamento_locado_eventos" (
  "id"                       serial PRIMARY KEY,
  "company_id"               integer NOT NULL,
  "equipamento_locado_id"    integer NOT NULL,
  "tipo"                     varchar(40) NOT NULL,
  "data_evento"              timestamp DEFAULT now() NOT NULL,
  "funcionario_id"           integer,
  "funcionario_nome"         varchar(255),
  "obra_id"                  integer,
  "obra_nome"                varchar(255),
  "fotos_json"               jsonb,
  "observacao"               text,
  "usuario_id"               integer,
  "usuario_nome"             varchar(255),
  "created_at"               timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_equip_evt_equip"
  ON "equipamento_locado_eventos" ("equipamento_locado_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_evt_tipo_data"
  ON "equipamento_locado_eventos" ("tipo", "data_evento");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_equip_evt_company"
  ON "equipamento_locado_eventos" ("company_id");
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- A4) SOLICITAÇÕES DE EQUIPAMENTO (porta de entrada com análise CAPEX)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "solicitacoes_equipamento" (
  "id"                                  serial PRIMARY KEY,
  "company_id"                          integer NOT NULL,
  "numero"                              varchar(20) NOT NULL,
  "obra_id"                             integer,
  "obra_nome"                           varchar(255),
  "solicitante_id"                      integer,
  "solicitante_nome"                    varchar(255),
  "descricao_equipamento"               varchar(255) NOT NULL,
  "categoria"                           varchar(100),
  "quantidade"                          integer NOT NULL DEFAULT 1,
  "data_inicio_uso"                     varchar(10) NOT NULL,
  "data_fim_uso"                        varchar(10) NOT NULL,
  "duracao_meses"                       numeric(6,2),
  "analise_capex_json"                  jsonb,
  "recomendacao_erp"                    varchar(20),
  "decisao_final"                       varchar(20),
  "decisao_justificativa"               text,
  "decisao_override"                    boolean DEFAULT false,
  "decisao_override_aprovador_id"       integer,
  "decisao_override_aprovador_nome"     varchar(255),
  "decisao_override_aprovado_em"        timestamp,
  "vinculo_equip_proprios_json"         jsonb,
  "ordem_compra_id"                     integer,
  "status"                              varchar(30) NOT NULL DEFAULT 'pendente',
  "created_at"                          timestamp DEFAULT now() NOT NULL,
  "updated_at"                          timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_se_company_numero"
  ON "solicitacoes_equipamento" ("company_id", "numero");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_company_status"
  ON "solicitacoes_equipamento" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_se_obra"
  ON "solicitacoes_equipamento" ("obra_id");
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- A5) CONFERÊNCIA DE FATURA DE LOCAÇÃO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "fatura_locacao_conferencia" (
  "id"                       serial PRIMARY KEY,
  "company_id"               integer NOT NULL,
  "fornecedor_id"            integer,
  "fornecedor_nome"          varchar(255),
  "mes_referencia"           varchar(7) NOT NULL,
  "numero_fatura"            varchar(100),
  "valor_faturado"           numeric(14,2),
  "valor_calculado_erp"      numeric(14,2),
  "arquivo_fatura_url"       text,
  "arquivo_fatura_tipo"      varchar(10),
  "ocr_extracted_json"       jsonb,
  "divergencias_json"        jsonb,
  "status"                   varchar(30) NOT NULL DEFAULT 'pendente',
  "observacoes"              text,
  "conferido_por_id"         integer,
  "conferido_por_nome"       varchar(255),
  "conferido_em"             timestamp,
  "created_at"               timestamp DEFAULT now() NOT NULL,
  "updated_at"               timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_fatura_company_fornecedor_mes"
  ON "fatura_locacao_conferencia" ("company_id", "fornecedor_id", "mes_referencia");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fatura_status"
  ON "fatura_locacao_conferencia" ("company_id", "status");
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- A6) PARÂMETROS CAPEX (editáveis pelo financeiro)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "parametros_capex" (
  "id"                    serial PRIMARY KEY,
  "company_id"            integer NOT NULL,
  "chave"                 varchar(80) NOT NULL,
  "valor_numerico"        numeric(14,4),
  "valor_texto"           varchar(255),
  "descricao"             text,
  "categoria"             varchar(60),
  "editavel"              boolean DEFAULT true,
  "atualizado_por_id"     integer,
  "atualizado_por_nome"   varchar(255),
  "created_at"            timestamp DEFAULT now() NOT NULL,
  "updated_at"            timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_param_capex_company_chave"
  ON "parametros_capex" ("company_id", "chave");
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- B1) EXTENSÃO compras_ordens — campos de locação (todos nullable, default-safe)
-- ----------------------------------------------------------------------------
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "is_locacao"              boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "locacao_data_inicio"     varchar(10);
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "locacao_data_fim"        varchar(10);
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "locacao_duracao_dias"    integer;
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "locacao_renovavel"       boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "locacao_oc_anterior_id"  integer;
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN IF NOT EXISTS "locacao_solicitacao_id"  integer;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- B2) EXTENSÃO warehouse_loans — rastreio de equipamento (vínculo + foto devol.)
-- ----------------------------------------------------------------------------
ALTER TABLE "warehouse_loans" ADD COLUMN IF NOT EXISTS "foto_devolucao_url"     text;
--> statement-breakpoint
ALTER TABLE "warehouse_loans" ADD COLUMN IF NOT EXISTS "equipamento_proprio_id" integer;
--> statement-breakpoint
ALTER TABLE "warehouse_loans" ADD COLUMN IF NOT EXISTS "equipamento_locado_id"  integer;
--> statement-breakpoint

-- ============================================================================
-- FIM Rev. 2256
-- ============================================================================
