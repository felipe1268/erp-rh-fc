-- Refactor: lock only payroll cycle range (e.g. 16/02-15/03 for março), not the full calendar month.
-- Adds explicit cycle date columns to ponto_consolidacao and backfills previously consolidated rows
-- using the company's `ponto_dia_corte` system criterion (default 15).

ALTER TABLE "ponto_consolidacao" ADD COLUMN IF NOT EXISTS "data_inicio_ciclo" date;--> statement-breakpoint
ALTER TABLE "ponto_consolidacao" ADD COLUMN IF NOT EXISTS "data_fim_ciclo" date;--> statement-breakpoint

UPDATE "ponto_consolidacao" pc
SET "data_inicio_ciclo" = (
      (to_date(pc."mesReferencia" || '-01', 'YYYY-MM-DD') - INTERVAL '1 month'
       + ((dc.dia_corte) || ' days')::interval)::date
    ),
    "data_fim_ciclo" = (
      (to_date(pc."mesReferencia" || '-01', 'YYYY-MM-DD')
       + ((dc.dia_corte - 1) || ' days')::interval)::date
    )
FROM (
  SELECT c.id AS company_id,
         COALESCE(
           NULLIF(
             (SELECT GREATEST(1, LEAST(28, COALESCE(NULLIF(regexp_replace(sc.valor, '[^0-9]', '', 'g'), '')::int, 15)))
              FROM system_criteria sc
              WHERE sc."companyId" = c.id AND sc.chave = 'ponto_dia_corte'
              LIMIT 1),
             0
           ),
           15
         ) AS dia_corte
  FROM (SELECT DISTINCT "companyId" AS id FROM "ponto_consolidacao") c
) dc
WHERE pc."companyId" = dc.company_id
  AND (pc."data_inicio_ciclo" IS NULL OR pc."data_fim_ciclo" IS NULL);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ponto_consolidacao_ciclo"
  ON "ponto_consolidacao" ("companyId", "data_inicio_ciclo", "data_fim_ciclo");
