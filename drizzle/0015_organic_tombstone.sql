CREATE TABLE "cargo_categorias_custo" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"cargo" varchar(150) NOT NULL,
	"categoria" varchar(30) NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_risco_debitos" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"obra_id" integer,
	"orcamento_id" integer,
	"cotacao_id" integer,
	"valor" numeric(14, 2) NOT NULL,
	"observacao" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folha_mo_transferencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"mes_referencia" varchar(7) NOT NULL,
	"executado_em" timestamp DEFAULT now() NOT NULL,
	"executado_por" varchar(255),
	"total_direto" numeric(14, 2) DEFAULT '0',
	"total_indireto" numeric(14, 2) DEFAULT '0',
	"total_central" numeric(14, 2) DEFAULT '0',
	"detalhes" json
);
--> statement-breakpoint
CREATE TABLE "planejamento_custos_mo" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_id" integer NOT NULL,
	"atividade_id" integer,
	"mes_referencia" varchar(7) NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"custo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"descricao" text,
	"transferencia_id" integer,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_contrato_revisoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contrato_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"versao" integer NOT NULL,
	"texto" text NOT NULL,
	"observacao" varchar(200),
	"criado_por" varchar(200),
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceiro_contrato_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(200) DEFAULT 'Contrato Padrão' NOT NULL,
	"texto" text NOT NULL,
	"ativo" boolean DEFAULT true,
	"versao" integer DEFAULT 1,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN "fornecedor_nome" varchar(255);--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN "data_vencimento" varchar(10);--> statement-breakpoint
ALTER TABLE "compras_ordens" ADD COLUMN "financial_entry_id" integer;--> statement-breakpoint
ALTER TABLE "job_functions" ADD COLUMN "categoria_mo" varchar(30);--> statement-breakpoint
ALTER TABLE "terceiro_contratos" ADD COLUMN "template_id" integer;--> statement-breakpoint
ALTER TABLE "terceiro_contratos" ADD COLUMN "texto_contrato" text;--> statement-breakpoint
ALTER TABLE "terceiro_contratos" ADD COLUMN "versao_texto" integer DEFAULT 0;