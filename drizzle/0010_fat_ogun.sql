CREATE TABLE "bank_daily_balance" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"conta_bancaria_id" integer NOT NULL,
	"data" date NOT NULL,
	"saldo" numeric(15, 2) NOT NULL,
	"fonte" text DEFAULT 'manual',
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"conta_bancaria_id" integer NOT NULL,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"tipo" text NOT NULL,
	"saldo_apos" numeric(15, 2),
	"conciliado" smallint DEFAULT 0,
	"entry_id" integer,
	"importadoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_flow_forecast" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"data" date NOT NULL,
	"tipo" text NOT NULL,
	"categoria" varchar(100),
	"descricao" text,
	"valor" numeric(15, 2) NOT NULL,
	"origem_tipo" varchar(50),
	"origem_id" integer,
	"obra_id" integer,
	"saldo_acumulado" numeric(15, 2),
	"geradoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_log" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"revenue_id" integer,
	"obra_id" integer,
	"cliente_nome" varchar(255),
	"valor_devido" numeric(15, 2),
	"dias_atraso" integer,
	"etapa" integer,
	"mensagem_enviada" text,
	"canais_enviados" varchar(100),
	"enviadoEm" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'enviado'
);
--> statement-breakpoint
CREATE TABLE "collection_rules" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255),
	"dias_atraso_1" integer DEFAULT 3,
	"mensagem_1" text,
	"dias_atraso_2" integer DEFAULT 10,
	"mensagem_2" text,
	"dias_atraso_3" integer DEFAULT 30,
	"mensagem_3" text,
	"dias_atraso_4" integer DEFAULT 60,
	"mensagem_4" text,
	"enviar_email" smallint DEFAULT 1,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_partners" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"cpf" varchar(14),
	"cargo" varchar(100),
	"percentual_sociedade" numeric(5, 2),
	"valor_pro_labore" numeric(10, 2),
	"dia_vencimento" integer DEFAULT 5,
	"conta_bancaria_destino_id" integer,
	"pix_chave" varchar(255),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dre_cache" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obra_id" integer,
	"periodo" varchar(7) NOT NULL,
	"tipoPeriodo" text NOT NULL,
	"dados" text NOT NULL,
	"calculadoEm" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo" text NOT NULL,
	"natureza" text NOT NULL,
	"nivel" integer DEFAULT 1 NOT NULL,
	"conta_pai_id" integer,
	"classificacao_dre" varchar(50),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"ordem" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_approvals" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'pendente',
	"aprovador_id" integer,
	"aprovador_nome" varchar(255),
	"motivo_recusa" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvidoEm" timestamp
);
--> statement-breakpoint
CREATE TABLE "financial_budget" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"conta_id" integer,
	"obra_id" integer,
	"valor_orcado" numeric(15, 2) NOT NULL,
	"observacoes" text,
	"criado_por_id" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_cost_centers" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo" text NOT NULL,
	"obra_id" integer,
	"responsavel_id" integer,
	"responsavel_nome" varchar(255),
	"orcamento_mensal" numeric(15, 2),
	"ativo" smallint DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_entries" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obra_id" integer,
	"obra_nome" varchar(255),
	"conta_id" integer,
	"conta_nome" varchar(255),
	"tipo" text NOT NULL,
	"natureza" text NOT NULL,
	"valor_previsto" numeric(15, 2) NOT NULL,
	"valor_realizado" numeric(15, 2),
	"data_competencia" date NOT NULL,
	"data_vencimento" date,
	"data_pagamento" date,
	"status" text DEFAULT 'previsto' NOT NULL,
	"conta_bancaria_id" integer,
	"origem_modulo" varchar(50),
	"origem_id" integer,
	"origem_descricao" text,
	"parcela_numero" integer,
	"parcela_total" integer,
	"parcela_grupo_id" varchar(36),
	"forma_pagamento" text,
	"comprovante_url" text,
	"codigo_barras" varchar(100),
	"cheque_numero" varchar(20),
	"cheque_banco" varchar(100),
	"cheque_agencia" varchar(20),
	"cheque_conta" varchar(30),
	"cheque_titular" varchar(255),
	"cheque_data_emissao" date,
	"cheque_data_bom_para" date,
	"cheque_status" text,
	"cheque_url" text,
	"conciliado" smallint DEFAULT 0,
	"data_conciliacao" date,
	"extrato_banco_descricao" text,
	"descricao" text,
	"observacoes" text,
	"motivo_cancelamento" text,
	"criado_por_id" integer,
	"criado_por_nome" varchar(255),
	"aprovado_por_id" integer,
	"aprovado_por_nome" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_opening_balances" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"conta_bancaria_id" integer,
	"conta_nome" varchar(255),
	"data_abertura" date NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"confirmed_by_user_id" integer,
	"confirmed_by_name" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_revenue" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obra_id" integer NOT NULL,
	"obra_nome" varchar(255),
	"cliente_nome" varchar(255),
	"cliente_cnpj" varchar(20),
	"valor_contrato" numeric(15, 2),
	"valor_aditivos" numeric(15, 2) DEFAULT '0',
	"valor_contrato_total" numeric(15, 2),
	"medicao_id" integer,
	"medicao_numero" integer,
	"percentual_medicao" numeric(5, 2),
	"valor_medicao" numeric(15, 2),
	"nf_numero" varchar(50),
	"nf_url" text,
	"nf_emitida_em" date,
	"data_vencimento" date,
	"data_recebimento" date,
	"valor_recebido" numeric(15, 2),
	"status" text DEFAULT 'a_faturar',
	"forma_pagamento" varchar(50),
	"comprovante_url" text,
	"retencao_iss" numeric(10, 2) DEFAULT '0',
	"retencao_inss" numeric(10, 2) DEFAULT '0',
	"retencao_ir" numeric(10, 2) DEFAULT '0',
	"retencao_total" numeric(10, 2) DEFAULT '0',
	"valor_liquido_receber" numeric(15, 2),
	"observacoes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_tax_config" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"regimeTributario" text NOT NULL,
	"anexo_simples" text,
	"aliquota_simples" numeric(5, 2),
	"aliquota_iss" numeric(5, 2) DEFAULT '3.00',
	"aliquota_pis" numeric(5, 2) DEFAULT '0.65',
	"aliquota_cofins" numeric(5, 2) DEFAULT '3.00',
	"aliquota_irpj" numeric(5, 2) DEFAULT '15.00',
	"aliquota_csll" numeric(5, 2) DEFAULT '9.00',
	"aliquota_inss_empresa" numeric(5, 2) DEFAULT '20.00',
	"aliquota_fgts" numeric(5, 2) DEFAULT '8.00',
	"aliquota_rat" numeric(5, 2) DEFAULT '3.00',
	"aliquota_sistema" numeric(5, 2) DEFAULT '5.80',
	"dia_pagamento_iss" integer DEFAULT 10,
	"dia_pagamento_pis" integer DEFAULT 25,
	"dia_pagamento_cofins" integer DEFAULT 25,
	"dia_pagamento_darf" integer DEFAULT 20,
	"dia_pagamento_gps" integer DEFAULT 20,
	"dia_pagamento_fgts" integer DEFAULT 7,
	"ativo" smallint DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_tax_obligations" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"tipo" text NOT NULL,
	"mes_competencia" varchar(7) NOT NULL,
	"base_calculo" numeric(15, 2),
	"aliquota" numeric(5, 2),
	"valor_principal" numeric(15, 2) NOT NULL,
	"valor_multa" numeric(10, 2) DEFAULT '0',
	"valor_juros" numeric(10, 2) DEFAULT '0',
	"valor_total" numeric(15, 2) NOT NULL,
	"data_vencimento" date NOT NULL,
	"data_pagamento" date,
	"codigo_receita" varchar(20),
	"codigo_barras" varchar(100),
	"guia_url" text,
	"status" text DEFAULT 'a_pagar',
	"gerada_automaticamente" smallint DEFAULT 1,
	"entry_id" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_medicoes" (
	"id" serial NOT NULL,
	"companyId" integer NOT NULL,
	"obra_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"data_referencia" date NOT NULL,
	"percentual_acumulado" numeric(5, 2),
	"percentual_periodo" numeric(5, 2),
	"valor_contrato" numeric(15, 2),
	"valor_medicao" numeric(15, 2),
	"valor_acumulado" numeric(15, 2),
	"status" text DEFAULT 'rascunho',
	"aprovado_por_id" integer,
	"aprovadoEm" timestamp,
	"revenue_id" integer,
	"observacoes" text,
	"itens" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_bdb_company_data" ON "bank_daily_balance" USING btree ("companyId","data");--> statement-breakpoint
CREATE INDEX "idx_bsl_company" ON "bank_statement_lines" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_bsl_conta" ON "bank_statement_lines" USING btree ("conta_bancaria_id");--> statement-breakpoint
CREATE INDEX "idx_bsl_data" ON "bank_statement_lines" USING btree ("data");--> statement-breakpoint
CREATE INDEX "idx_cff_company_data" ON "cash_flow_forecast" USING btree ("companyId","data");--> statement-breakpoint
CREATE INDEX "idx_cl_company" ON "collection_log" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_cr_company" ON "collection_rules" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_cp_company" ON "company_partners" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_dc_company_periodo" ON "dre_cache" USING btree ("companyId","periodo");--> statement-breakpoint
CREATE INDEX "idx_fa_company" ON "financial_accounts" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fap_company" ON "financial_approvals" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fb_company_ano" ON "financial_budget" USING btree ("companyId","ano");--> statement-breakpoint
CREATE INDEX "idx_fcc_company" ON "financial_cost_centers" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fe_company" ON "financial_entries" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fe_obra" ON "financial_entries" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "idx_fe_competencia" ON "financial_entries" USING btree ("data_competencia");--> statement-breakpoint
CREATE INDEX "idx_fe_vencimento" ON "financial_entries" USING btree ("data_vencimento");--> statement-breakpoint
CREATE INDEX "idx_fe_status" ON "financial_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_fob_company" ON "financial_opening_balances" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fr_company" ON "financial_revenue" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fr_obra" ON "financial_revenue" USING btree ("obra_id");--> statement-breakpoint
CREATE INDEX "idx_fr_status" ON "financial_revenue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ftc_company" ON "financial_tax_config" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fto_company" ON "financial_tax_obligations" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_fto_competencia" ON "financial_tax_obligations" USING btree ("mes_competencia");--> statement-breakpoint
CREATE INDEX "idx_fto_vencimento" ON "financial_tax_obligations" USING btree ("data_vencimento");--> statement-breakpoint
CREATE INDEX "idx_om_company" ON "obra_medicoes" USING btree ("companyId");--> statement-breakpoint
CREATE INDEX "idx_om_obra" ON "obra_medicoes" USING btree ("obra_id");