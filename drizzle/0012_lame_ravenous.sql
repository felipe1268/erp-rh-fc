ALTER TABLE "compras_cotacoes" ADD COLUMN "contrato_terceiro_id" integer;--> statement-breakpoint
ALTER TABLE "empresas_terceiras" ADD COLUMN "fornecedor_id" integer;--> statement-breakpoint
ALTER TABLE "terceiro_contratos" ADD COLUMN "numero_sequencia" integer;--> statement-breakpoint
ALTER TABLE "terceiro_contratos" ADD COLUMN "valor_orcamento" numeric(18, 2) DEFAULT '0';