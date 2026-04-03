import pg from 'pg';
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  
  const emps = await pool.query(`SELECT COUNT(*) as cnt FROM employees WHERE "companyId" = 60002 AND "deletedAt" IS NULL`);
  console.log('Total employees (60002):', emps.rows[0].cnt);
  
  const ativos = await pool.query(`SELECT COUNT(*) as cnt FROM employees WHERE "companyId" = 60002 AND "deletedAt" IS NULL AND status = 'Ativo'`);
  console.log('Active employees:', ativos.rows[0].cnt);
  
  const folha = await pool.query(`SELECT COUNT(*) as cnt FROM monthly_payroll_summary WHERE "companyId" = 60002`);
  console.log('Payroll summaries:', folha.rows[0].cnt);
  
  const epi = await pool.query(`SELECT COUNT(*) as cnt FROM epi_deliveries WHERE "companyId" = 60002 AND "deletedAt" IS NULL`);
  console.log('EPI deliveries:', epi.rows[0].cnt);
  
  const warns = await pool.query(`SELECT COUNT(*) as cnt FROM warnings WHERE "companyId" = 60002`);
  console.log('Warnings:', warns.rows[0].cnt);
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
