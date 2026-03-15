CREATE TABLE "compras_condicoes_pagamento" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"descricao" varchar(150) NOT NULL,
	"ativo" boolean DEFAULT true,
	"ordem" integer DEFAULT 0,
	"criado_em" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compras_cotacao_fornecedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"cotacao_id" integer NOT NULL,
	"fornecedor_id" integer NOT NULL,
	"prazo_entrega_dias" integer,
	"condicao_pagamento" varchar(100),
	"observacoes" text,
	"total_orcado" numeric(14, 2) DEFAULT '0',
	"selecionado" boolean DEFAULT false,
	"arquivo_url" varchar(500),
	"arquivo_nome" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_cotacao_respostas" (
	"id" serial PRIMARY KEY NOT NULL,
	"cotacao_id" integer NOT NULL,
	"fornecedor_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantidade" numeric(14, 4) DEFAULT '0',
	"preco_unitario" numeric(14, 4) DEFAULT '0',
	"desconto_pct" numeric(5, 2) DEFAULT '0',
	"total" numeric(14, 2) DEFAULT '0',
	"observacoes" text
);
--> statement-breakpoint
ALTER TABLE "compras_solicitacoes_itens" ADD COLUMN "orcamento_item_id" integer;--> statement-breakpoint
ALTER TABLE "compras_solicitacoes_itens" ADD COLUMN "eap_codigo" varchar(50);--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD COLUMN "meta_unit_mat" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD COLUMN "meta_unit_mdo" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD COLUMN "meta_total_mat" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD COLUMN "meta_total_mdo" numeric(18, 2);