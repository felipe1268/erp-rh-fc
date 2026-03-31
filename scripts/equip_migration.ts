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
      AND COALESCE(oi.custo_unit_equip::numeric, 0) = 0
  `);
  console.log('[T002b] Updated orcamento_itens equip costs:', (r2 as any).rowCount ?? 0, 'rows');
  
  console.log('[T002] Migration complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
