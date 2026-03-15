CREATE TABLE "almoxarifado_desconto_folha" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"employee_nome" varchar(255) NOT NULL,
	"loan_id" integer,
	"item_nome" varchar(255) NOT NULL,
	"quantidade" numeric(10, 3) DEFAULT '1',
	"valor_desconto" numeric(14, 2) NOT NULL,
	"descricao" text,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"aprovado_por" varchar(255),
	"aprovado_em" timestamp,
	"motivo_reprovacao" text,
	"mes_desconto" varchar(7),
	"criado_por" varchar(255),
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "almoxarifado_saidas_insumo" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"item_nome" varchar(255) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(10, 3) DEFAULT '1' NOT NULL,
	"funcionario_id" integer,
	"funcionario_nome" varchar(255) NOT NULL,
	"funcionario_codigo" varchar(20),
	"obra_id" integer,
	"obra_nome" varchar(255),
	"motivo" text,
	"observacoes" text,
	"almoxarife_id" integer,
	"almoxarife_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "almoxarifado_transferencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"item_id_origem" integer NOT NULL,
	"item_id_destino" integer,
	"item_nome" varchar(255) NOT NULL,
	"unidade" varchar(30),
	"quantidade" numeric(14, 3) DEFAULT '1' NOT NULL,
	"origem_tipo" varchar(20) DEFAULT 'central' NOT NULL,
	"origem_obra_id" integer,
	"origem_obra_nome" varchar(255),
	"destino_tipo" varchar(20) DEFAULT 'central' NOT NULL,
	"destino_obra_id" integer,
	"destino_obra_nome" varchar(255),
	"motivo" text,
	"almoxarife_id" integer,
	"almoxarife_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "epis" ADD COLUMN "fotoUrl" text;--> statement-breakpoint
ALTER TABLE "he_solicitacoes" ADD COLUMN "planejamento_atividade_id" integer;