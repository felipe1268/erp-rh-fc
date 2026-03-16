ALTER TABLE "orcamentos" ADD COLUMN "meta_planilha_codigo" varchar(255);--> statement-breakpoint
ALTER TABLE "orcamentos" ADD COLUMN "meta_planilha_importado_em" timestamp;--> statement-breakpoint
ALTER TABLE "user_groups" ADD COLUMN "module_access" text;