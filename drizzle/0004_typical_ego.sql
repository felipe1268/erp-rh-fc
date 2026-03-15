CREATE TABLE "warehouse_inventory_session_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"item_nome" varchar(255),
	"quantidade_sistema" numeric(14, 3) NOT NULL,
	"quantidade_fisica" numeric(14, 3),
	"diferenca" numeric(14, 3),
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"observacoes" text,
	"conferido_em" timestamp
);
--> statement-breakpoint
CREATE TABLE "warehouse_inventory_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"semana_ref" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"total_itens" integer DEFAULT 0 NOT NULL,
	"itens_conferidos" integer DEFAULT 0 NOT NULL,
	"itens_divergentes" integer DEFAULT 0 NOT NULL,
	"almoxarife_id" integer,
	"almoxarife_nome" varchar(255),
	"iniciado_em" timestamp,
	"concluido_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"obra_id" integer,
	"item_id" integer NOT NULL,
	"item_nome" varchar(255) NOT NULL,
	"quantidade" numeric(10, 3) DEFAULT '1' NOT NULL,
	"funcionario_id" integer,
	"funcionario_codigo" varchar(20),
	"funcionario_nome" varchar(255) NOT NULL,
	"data_emprestimo" varchar(10) NOT NULL,
	"hora_emprestimo" varchar(5),
	"data_devolucao" varchar(10),
	"hora_devolucao" varchar(5),
	"status" varchar(20) DEFAULT 'emprestado' NOT NULL,
	"observacoes" text,
	"almoxarife_id" integer,
	"almoxarife_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obras" ADD COLUMN "responsavelId" integer;--> statement-breakpoint
ALTER TABLE "planejamento_revisoes" ADD COLUMN "consolidado" boolean DEFAULT false;