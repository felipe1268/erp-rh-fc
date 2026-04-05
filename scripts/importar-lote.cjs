const { Pool } = require('../node_modules/pg');
const { execSync } = require('child_process');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const COMPANY_ID = 60002;
const BATCH_SIZE = 10;

async function main() {
  const obrasQuery = await pool.query(
    `SELECT o.id, o.external_id, o.nome, o.total_relatorios,
     (SELECT COUNT(*) FROM diario_obra_relatorios r WHERE r.obra_id = o.id) as imported
     FROM diario_obra_obras o WHERE o.company_id = $1 AND o.external_id IS NOT NULL
     ORDER BY o.total_relatorios ASC`,
    [COMPANY_ID]
  );

  const pending = obrasQuery.rows.filter(o => Number(o.imported) < Number(o.total_relatorios));
  console.log(`Total obras pendentes: ${pending.length}`);
  console.log(`Total rels pendentes: ${pending.reduce((a, o) => a + Number(o.total_relatorios) - Number(o.imported), 0)}`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    console.log(`\n--- Lote ${Math.floor(i/BATCH_SIZE)+1}: obras ${batch.map(o => o.id).join(',')} ---`);
    for (const obra of batch) {
      try {
        const out = execSync(
          `node scripts/importar-diario-obra.cjs --skip-media --obra=${obra.id} --concurrency=3`,
          { cwd: '/home/runner/workspace', timeout: 300000, encoding: 'utf-8' }
        );
        const lastLine = out.trim().split('\n').filter(l => l.includes('imp') || l.includes('FINALIZADA')).pop();
        console.log(`  [${obra.id}] ${obra.nome}: ${lastLine || 'OK'}`);
      } catch (e) {
        console.log(`  [${obra.id}] ${obra.nome}: ERRO - ${e.message?.substring(0, 100)}`);
      }
    }
  }

  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM diario_obra_relatorios WHERE company_id = $1) as rels,
      (SELECT COUNT(*) FROM diario_obra_fotos f JOIN diario_obra_relatorios r ON r.id = f.relatorio_id WHERE r.company_id = $1) as fotos
  `, [COMPANY_ID]);
  console.log(`\n=== TOTAL NO BANCO: ${counts.rows[0].rels} rels, ${counts.rows[0].fotos} fotos ===`);

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e.message); pool.end(); process.exit(1); });
