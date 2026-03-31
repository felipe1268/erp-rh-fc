import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const res1 = await pool.query(`
    SELECT si.id, si.descricao, si.insumo_codigo, si.composicao_codigo, si.coeficiente, 
           si.preco_meta, si.quantidade, si.orcamento_item_id, si.unidade,
           s.numero_sc as numero, s.tipo
    FROM compras_solicitacoes_itens si
    JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
    WHERE si.composicao_codigo IS NOT NULL AND si.composicao_codigo <> ''
    ORDER BY s.numero_sc, si.id
    LIMIT 20
  `);
  console.log("=== SC Items with composicao_codigo ===");
  for (const r of res1.rows) {
    console.log(JSON.stringify(r));
  }

  const orcItemIds = [...new Set(res1.rows.map((r: any) => r.orcamento_item_id).filter(Boolean))];
  if (orcItemIds.length > 0) {
    const placeholders = orcItemIds.map((_, i) => `$${i + 1}`).join(',');
    const res2 = await pool.query(`
      SELECT id, codigo, descricao, quantidade, 
             "custoUnitTotal", "custoUnitMat", "custoUnitMdo",
             "metaUnitTotal", "metaUnitMat", "metaUnitMdo",
             "custoUnitEquip", "metaUnitEquip"
      FROM orcamento_itens
      WHERE id IN (${placeholders})
    `, orcItemIds);
    console.log("\n=== Orcamento Items (compositions) ===");
    for (const r of res2.rows) {
      console.log(JSON.stringify(r));
    }
  }

  const scItemIds = res1.rows.map((r: any) => r.id);
  if (scItemIds.length > 0) {
    const placeholders = scItemIds.map((_, i) => `$${i + 1}`).join(',');
    const cotRes = await pool.query(`
      SELECT ci.id, ci.descricao, ci.solicitacao_item_id, ci.quantidade, ci.unidade,
             c.numero as cotacao_numero, c.tipo as cotacao_tipo
      FROM compras_cotacoes_itens ci
      JOIN compras_cotacoes c ON c.id = ci.cotacao_id
      WHERE ci.solicitacao_item_id IN (${placeholders})
      ORDER BY c.numero, ci.id
      LIMIT 20
    `, scItemIds);
    console.log("\n=== Cotacao Items linked to composition SC items ===");
    for (const r of cotRes.rows) {
      console.log(JSON.stringify(r));
    }
  }

  console.log("\n=== Composicao Insumos for relevant compositions ===");
  const compCodigos = [...new Set(res1.rows.map((r: any) => r.composicao_codigo).filter(Boolean))];
  if (compCodigos.length > 0) {
    const placeholders = compCodigos.map((_, i) => `$${i + 1}`).join(',');
    const compRes = await pool.query(`
      SELECT ci.composicao_codigo, ci.insumo_codigo, ci.descricao, ci.unidade, 
             ci.coeficiente, ci.preco_unitario, ci.custo,
             ci.alocacao_mat, ci.alocacao_mdo
      FROM composicao_insumos ci
      WHERE ci.composicao_codigo IN (${placeholders})
      ORDER BY ci.composicao_codigo, ci.insumo_codigo
    `, compCodigos);
    console.log("Composition insumos:");
    for (const r of compRes.rows) {
      console.log(JSON.stringify(r));
    }
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
