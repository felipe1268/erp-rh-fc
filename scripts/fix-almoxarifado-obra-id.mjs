/**
 * Script de correção: vincula itens do almoxarifado a obras
 *
 * Contexto: OCs entregues antes da integração automática armazenavam movimentações
 * de entrada com `obra_id` preenchido, mas o item em `almoxarifado_itens` ficava
 * sem `obra_id`. Isso tornava o item invisível ao filtrar por obra.
 *
 * O script:
 * 1. Identifica itens com obra_id = NULL que possuam movimentações de entrada
 *    com obra_id preenchido.
 * 2. Atualiza o obra_id do item com base na movimentação de entrada mais antiga.
 *
 * Execução: node scripts/fix-almoxarifado-obra-id.mjs
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Levanta itens afetados para relatório
    const preview = await client.query(`
      SELECT
        ai.id,
        ai.company_id,
        ai.nome,
        (
          SELECT am.obra_id
          FROM almoxarifado_movimentacoes am
          WHERE am.item_id = ai.id
            AND am.tipo = 'entrada'
            AND am.obra_id IS NOT NULL
          ORDER BY am.criado_em ASC
          LIMIT 1
        ) AS novo_obra_id
      FROM almoxarifado_itens ai
      WHERE ai.obra_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM almoxarifado_movimentacoes am
          WHERE am.item_id = ai.id
            AND am.tipo = 'entrada'
            AND am.obra_id IS NOT NULL
        )
      ORDER BY ai.id
    `);

    if (preview.rows.length === 0) {
      console.log('✅ Nenhum item afetado encontrado. Banco já está correto.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`\n📋 Itens a corrigir: ${preview.rows.length}`);
    console.log('─'.repeat(60));
    for (const row of preview.rows) {
      console.log(`  ID ${row.id} | company ${row.company_id} | "${row.nome}" → obra_id ${row.novo_obra_id}`);
    }
    console.log('─'.repeat(60));

    // 2. Aplica a correção
    const result = await client.query(`
      UPDATE almoxarifado_itens ai
      SET obra_id = (
        SELECT am.obra_id
        FROM almoxarifado_movimentacoes am
        WHERE am.item_id = ai.id
          AND am.tipo = 'entrada'
          AND am.obra_id IS NOT NULL
        ORDER BY am.criado_em ASC
        LIMIT 1
      )
      WHERE ai.obra_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM almoxarifado_movimentacoes am
          WHERE am.item_id = ai.id
            AND am.tipo = 'entrada'
            AND am.obra_id IS NOT NULL
        )
    `);

    await client.query('COMMIT');
    console.log(`\n✅ Correção aplicada: ${result.rowCount} item(ns) atualizado(s) com sucesso.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro durante a correção:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
