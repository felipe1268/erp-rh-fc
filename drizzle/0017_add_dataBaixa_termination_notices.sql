ALTER TABLE "orcamentos" ALTER COLUMN "valor_negociado" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "module_config" ADD COLUMN "disabled_pages" text;--> statement-breakpoint
ALTER TABLE "planejamento_atividades" ADD COLUMN "is_marco" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "planejamento_atividades" ADD COLUMN "disabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "termination_notices" ADD COLUMN "dataBaixa" date;