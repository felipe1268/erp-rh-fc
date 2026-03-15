CREATE TABLE "almoxarifado_unidades" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"sigla" varchar(20) NOT NULL,
	"descricao" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "obra_id" integer;--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "origem" varchar(20) DEFAULT 'proprio';--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "fornecedor_locacao" varchar(255);--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "data_inicio_locacao" varchar(10);--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "data_vencimento_locacao" varchar(10);--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "valor_locacao_mensal" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "observacoes_locacao" text;--> statement-breakpoint
ALTER TABLE "warehouse_inventory_sessions" ADD COLUMN "obra_id" integer;