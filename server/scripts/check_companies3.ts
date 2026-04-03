import pg from 'pg';
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`SELECT id, "razaoSocial", "nomeFantasia", "grupoEmpresarial", "isActive" FROM companies WHERE "deletedAt" IS NULL AND id < 100000 ORDER BY id`);
  for (const row of r.rows) {
    console.log(`ID=${row.id} razao="${row.razaoSocial}" fantasia="${row.nomeFantasia}" grupo="${row.grupoEmpresarial}" active=${row.isActive}`);
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
