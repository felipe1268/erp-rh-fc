import { getDb } from "../server/db";
import { sql } from "drizzle-orm";
async function main() {
  const db = await getDb();
  if (!db) { process.exit(1); }
  
  const r = await db.execute(sql`
    UPDATE composicao_insumos
    SET alocacao_equip = alocacao_mat,
        alocacao_mat = '0'
    WHERE insumo_codigo LIKE '80.%'
      AND COALESCE(alocacao_mat::numeric, 0) > 0
      AND COALESCE(alocacao_mdo::numeric, 0) = 0
  `);
  console.log('[Reclassify] Moved alocacao_mat→alocacao_equip for 80.xx items:', (r as any).rowCount ?? 0, 'rows');
  
  const r2 = await db.execute(sql`
    WITH equip_sums AS (
      SELECT ci.composicao_codigo,
             ci.company_id,
             SUM(COALESCE(ci.alocacao_equip::numeric, 0) * COALESCE(ci.quantidade::numeric, 0)) AS total_equip
      FROM composicao_insumos ci
      WHERE COALESCE(ci.alocacao_equip::numeric, 0) > 0
      GROUP BY ci.composicao_codigo, ci.company_id
    )
    UPDATE orcamento_itens oi
    SET custo_unit_equip = ROUND(es.total_equip, 4),
        meta_unit_equip = ROUND(es.total_equip * (1 - COALESCE(
          (SELECT o."metaPercentual"::numeric FROM orcamentos o WHERE o.id = oi."orcamentoId" LIMIT 1), 0
        )), 4),
        custo_total_equip = ROUND(es.total_equip * COALESCE(oi.quantidade::numeric, 0), 2),
        meta_total_equip = ROUND(es.total_equip * COALESCE(oi.quantidade::numeric, 0) * (1 - COALESCE(
          (SELECT o."metaPercentual"::numeric FROM orcamentos o WHERE o.id = oi."orcamentoId" LIMIT 1), 0
        )), 2)
    FROM equip_sums es
    WHERE oi."servicoCodigo" = es.composicao_codigo
      AND oi."companyId" = es.company_id
  `);
  console.log('[Reclassify] Updated orcamento_itens equip costs:', (r2 as any).rowCount ?? 0, 'rows');
  
  const verify = await db.execute(sql`
    SELECT COUNT(*) as total FROM composicao_insumos
    WHERE insumo_codigo LIKE '80.%' AND COALESCE(alocacao_equip::numeric, 0) > 0
  `);
  console.log('[Verify] 80.xx items with alocacao_equip > 0:', (verify as any).rows);
  
  console.log('Done.');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
