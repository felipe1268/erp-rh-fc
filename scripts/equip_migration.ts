import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  const r1 = await db.execute(sql`
    UPDATE composicao_insumos
    SET alocacao_equip = custo_unit_total
    WHERE (COALESCE(alocacao_mat::numeric, 0) = 0)
      AND (COALESCE(alocacao_mdo::numeric, 0) = 0)
      AND (COALESCE(custo_unit_total::numeric, 0) > 0)
      AND (COALESCE(alocacao_equip::numeric, 0) = 0)
  `);
  console.log('[T002a] Updated composicao_insumos alocacao_equip:', (r1 as any).rowCount ?? 0, 'rows');

  const r2 = await db.execute(sql`
    WITH comp_ratios AS (
      SELECT ci.composicao_codigo,
             ci.company_id,
             SUM(COALESCE(ci.alocacao_equip::numeric, 0)) AS sum_equip,
             SUM(COALESCE(ci.custo_unit_total::numeric, 0)) AS sum_total
      FROM composicao_insumos ci
      GROUP BY ci.composicao_codigo, ci.company_id
      HAVING SUM(COALESCE(ci.alocacao_equip::numeric, 0)) > 0
    )
    UPDATE orcamento_itens oi
    SET custo_unit_equip = CASE
          WHEN COALESCE(cr.sum_total, 0) > 0 THEN
            ROUND(COALESCE(oi."custoTotal"::numeric, 0) / NULLIF(oi.quantidade::numeric, 0) * cr.sum_equip / cr.sum_total, 4)
          ELSE 0 END,
        meta_unit_equip = CASE
          WHEN COALESCE(cr.sum_total, 0) > 0 THEN
            ROUND(oi."metaUnitTotal"::numeric * cr.sum_equip / cr.sum_total, 4)
          ELSE 0 END,
        custo_total_equip = CASE
          WHEN COALESCE(cr.sum_total, 0) > 0 THEN
            ROUND(COALESCE(oi."custoTotal"::numeric, 0) * cr.sum_equip / cr.sum_total, 2)
          ELSE 0 END,
        meta_total_equip = CASE
          WHEN COALESCE(cr.sum_total, 0) > 0 THEN
            ROUND(oi."metaUnitTotal"::numeric * COALESCE(oi.quantidade::numeric, 0) * cr.sum_equip / cr.sum_total, 2)
          ELSE 0 END
    FROM comp_ratios cr
    WHERE oi."servicoCodigo" = cr.composicao_codigo
      AND oi."companyId" = cr.company_id
      AND oi."servicoCodigo" IS NOT NULL
  `);
  console.log('[T002b] Updated orcamento_itens equip costs:', (r2 as any).rowCount ?? 0, 'rows');
  
  console.log('[T002] Migration complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
