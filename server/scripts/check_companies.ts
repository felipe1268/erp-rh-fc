import pg from 'pg';
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`SELECT id, name, "cnpj", "createdAt" FROM companies ORDER BY id`);
  console.log('Empresas no banco:');
  for (const row of r.rows) {
    console.log(`  ID=${row.id} name="${row.name}" cnpj=${row.cnpj} created=${row.createdAt}`);
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
