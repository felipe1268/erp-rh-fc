CREATE TABLE "medicao_boletim_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"boletim_id" integer NOT NULL,
	"atividade_id" integer,
	"eap_codigo" varchar(50),
	"descricao" varchar(500) NOT NULL,
	"valor_contratual" numeric(15, 2) DEFAULT '0',
	"percentual_acumulado_anterior" numeric(8, 4) DEFAULT '0',
	"percentual_periodo" numeric(8, 4) DEFAULT '0',
	"percentual_acumulado_atual" numeric(8, 4) DEFAULT '0',
	"valor_periodo" numeric(15, 2) DEFAULT '0',
	"tipo_avanco" varchar(30) DEFAULT 'fisico' NOT NULL,
	"is_fd" boolean DEFAULT false,
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "medicao_boletins" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"contrato_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"periodo_referencia" varchar(7) NOT NULL,
	"status" varchar(20) DEFAULT 'rascunho' NOT NULL,
	"data_envio" date,
	"data_aprovacao" date,
	"valor_bruto" numeric(15, 2) DEFAULT '0',
	"desconto_sinal" numeric(15, 2) DEFAULT '0',
	"desconto_retencao" numeric(15, 2) DEFAULT '0',
	"glosa" numeric(15, 2) DEFAULT '0',
	"deducao_fd" numeric(15, 2) DEFAULT '0',
	"valor_liquido" numeric(15, 2) DEFAULT '0',
	"observacoes" text,
	"financial_entry_id" integer,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "medicao_contratos" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"projeto_id" integer NOT NULL,
	"criterio" varchar(30) DEFAULT 'avanco_fisico' NOT NULL,
	"valor_total_contrato" numeric(15, 2) DEFAULT '0',
	"percentual_sinal" numeric(5, 2) DEFAULT '0',
	"valor_sinal_recebido" numeric(15, 2) DEFAULT '0',
	"percentual_retencao" numeric(5, 2),
	"valor_minimo_fd" numeric(15, 2),
	"status" varchar(20) DEFAULT 'ativo' NOT NULL,
	"observacoes" text,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "medicao_fd_registros" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"contrato_id" integer NOT NULL,
	"descricao" varchar(500) NOT NULL,
	"valor" numeric(15, 2) NOT NULL,
	"data_registro" date NOT NULL,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"boletim_desconto_id" integer,
	"compra_id" integer,
	"origem" varchar(20) DEFAULT 'manual' NOT NULL,
	"observacoes" text,
	"criado_em" timestamp DEFAULT now(),
	"atualizado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_mbi_boletim" ON "medicao_boletim_itens" USING btree ("boletim_id");--> statement-breakpoint
CREATE INDEX "idx_mb_contrato" ON "medicao_boletins" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX "idx_mb_company" ON "medicao_boletins" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_mc_projeto" ON "medicao_contratos" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "idx_mc_company" ON "medicao_contratos" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_mfd_contrato" ON "medicao_fd_registros" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX "idx_mfd_company" ON "medicao_fd_registros" USING btree ("company_id");