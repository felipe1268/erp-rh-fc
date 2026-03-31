import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

async function main() {
  const compRes = await pool.query(`
    SELECT ci.composicao_codigo, ci.insumo_codigo, ci.insumo_descricao, ci.unidade, 
           ci.quantidade as coeficiente, ci.preco_unitario,
           ci.alocacao_mat, ci.alocacao_mdo, ci.custo_unit_total
    FROM composicao_insumos ci
    WHERE ci.composicao_codigo = '01.10.39'
    ORDER BY ci.insumo_codigo
    LIMIT 10
  `);
  console.log("=== Composicao 01.10.39 Insumos ===");
  for (const r of compRes.rows) {
    const pu = parseFloat(r.preco_unitario || '0');
    const mat = parseFloat(r.alocacao_mat || '0');
    const mdo = parseFloat(r.alocacao_mdo || '0');
    const alocTotal = mat + mdo;
    const ratioMat = alocTotal > 0 ? mat / alocTotal : 1;
    const puMat = Math.round(pu * ratioMat * 100) / 100;
    const puMdo = Math.round((pu - puMat) * 100) / 100;
    console.log(`${r.insumo_codigo} | ${(r.insumo_descricao || '').substring(0, 40)} | PU=${pu} | coef=${r.coeficiente} | MAT=${mat} | MDO=${mdo} | ratioMat=${ratioMat.toFixed(4)} | puMat=${puMat} | puMdo=${puMdo}`);
  }

  const orcRes = await pool.query(`
    SELECT id, codigo, descricao, quantidade, 
           "custoUnitTotal", "custoUnitMat", "custoUnitMdo",
           "metaUnitTotal", "metaUnitMat", "metaUnitMdo",
           "custoUnitEquip", "metaUnitEquip"
    FROM orcamento_itens
    WHERE id = 40252
  `);
  console.log("\n=== Orcamento Item 40252 ===");
  for (const r of orcRes.rows) {
    console.log(JSON.stringify(r));
  }

  const orcRes2 = await pool.query(`
    SELECT id, "metaPercentual"
    FROM orcamentos
    WHERE id = (SELECT "orcamentoId" FROM orcamento_itens WHERE id = 40252 LIMIT 1)
  `);
  console.log("\n=== Orcamento meta percentual ===");
  for (const r of orcRes2.rows) {
    console.log(JSON.stringify(r));
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
