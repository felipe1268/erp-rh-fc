import pg from 'pg';
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' ORDER BY ordinal_position`);
  console.log('Columns:', r.rows.map(r => r.column_name));
  const r2 = await pool.query(`SELECT * FROM companies ORDER BY id`);
  for (const row of r2.rows) {
    console.log(`  ID=${row.id} nome="${row.nome}" razaoSocial="${row.razao_social || row.razaoSocial}" cnpj=${row.cnpj}`);
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
