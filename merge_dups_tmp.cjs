const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    const groups = await client.query(`
      SELECT
        company_id,
        lower(regexp_replace(trim(nome), '\\s+', ' ', 'g')) AS nome_norm,
        array_agg(id ORDER BY id ASC) AS ids
      FROM almoxarifado_itens
      GROUP BY company_id, nome_norm
      HAVING COUNT(*) > 1
    `);
    console.log('Grupos a processar:', groups.rows.length);

    const fkTables = [
      { table: 'almoxarifado_baias', col: 'item_id' },
      { table: 'almoxarifado_movimentacoes', col: 'item_id' },
      { table: 'almoxarifado_recebimento_itens', col: 'item_id' },
      { table: 'almoxarifado_saidas_insumo', col: 'item_id' },
      { table: 'almoxarifado_transferencias', col: 'item_id_origem' },
      { table: 'almoxarifado_transferencias', col: 'item_id_destino' },
      { table: 'warehouse_inventory_session_items', col: 'item_id' },
      { table: 'warehouse_loans', col: 'item_id' },
    ];

    let totalDeleted = 0;
    for (const g of groups.rows) {
      const ids = g.ids.map(Number);
      const canonical = ids[0];
      const duplicates = ids.slice(1);
      if (duplicates.length === 0) continue;

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(quantidade_atual),0) AS s FROM almoxarifado_itens WHERE id = ANY($1::int[])`,
        [ids]
      );
      const soma = sumRes.rows[0].s;

      await client.query(
        `UPDATE almoxarifado_itens SET quantidade_atual = $1, atualizado_em = now() WHERE id = $2`,
        [soma, canonical]
      );

      for (const fk of fkTables) {
        await client.query(
          `UPDATE ${fk.table} SET ${fk.col} = $1 WHERE ${fk.col} = ANY($2::int[])`,
          [canonical, duplicates]
        );
      }

      const del = await client.query(
        `DELETE FROM almoxarifado_itens WHERE id = ANY($1::int[])`,
        [duplicates]
      );
      totalDeleted += del.rowCount;
    }

    console.log('Total de linhas apagadas:', totalDeleted);

    const remaining = await client.query(`SELECT company_id, COUNT(*) FROM almoxarifado_itens GROUP BY company_id ORDER BY company_id`);
    console.log('Itens restantes por empresa:', remaining.rows);

    await client.query('COMMIT');
    console.log('COMMIT ok');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERRO — ROLLBACK executado:', e);
    process.exit(1);
  }

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
