CREATE TABLE "avaliacoes_fornecedor" (
	"id" serial PRIMARY KEY NOT NULL,
	"fornecedor_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"nota" integer NOT NULL,
	"comentario" text,
	"criado_por" integer,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"tipo" varchar(10) DEFAULT 'PJ' NOT NULL,
	"cnpj" varchar(18),
	"cpf" varchar(14),
	"razao_social" varchar(255) NOT NULL,
	"nome_fantasia" varchar(255),
	"situacao_receita" varchar(50),
	"endereco" varchar(255),
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"cidade" varchar(100),
	"estado" varchar(2),
	"cep" varchar(10),
	"telefone" varchar(20),
	"email" varchar(255),
	"contato_nome" varchar(255),
	"contato_celular" varchar(20),
	"contato_email" varchar(255),
	"observacoes" text,
	"ativo" boolean DEFAULT true,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planejamento_refis" ADD COLUMN "consolidado_por" varchar(200);--> statement-breakpoint
ALTER TABLE "planejamento_refis" ADD COLUMN "consolidado_em" timestamp;--> statement-breakpoint
ALTER TABLE "planejamento_refis" ADD COLUMN "cancelado_por" varchar(200);--> statement-breakpoint
ALTER TABLE "planejamento_refis" ADD COLUMN "cancelado_em" timestamp;