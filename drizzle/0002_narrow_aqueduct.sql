CREATE TABLE "almoxarifado_categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"nome" varchar(150) NOT NULL,
	"ordem" integer DEFAULT 0,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "almoxarifado_itens" ADD COLUMN "foto_url" text;--> statement-breakpoint
CREATE INDEX "alm_cat_company" ON "almoxarifado_categorias" USING btree ("company_id");