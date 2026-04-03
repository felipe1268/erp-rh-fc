import pg from 'pg';
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  
  // Check for employee literally named "Não identificado"
  const r1 = await pool.query(`SELECT id, "nomeCompleto", funcao, status FROM employees WHERE "companyId" = 60002 AND "nomeCompleto" ILIKE '%não identificado%' AND "deletedAt" IS NULL`);
  console.log('Employees named "Não identificado":', r1.rows);
  
  // Check for Capa de Chuva PVC Amarela deliveries
  const r2 = await pool.query(`
    SELECT ed.id, ed."employeeId", e."nomeCompleto", e.funcao, ep.nome as epi_nome, ed."dataEntrega", ed.motivo_troca
    FROM epi_deliveries ed
    LEFT JOIN employees e ON ed."employeeId" = e.id
    LEFT JOIN epis ep ON ed."epiId" = ep.id
    WHERE ed."companyId" = 60002 AND ed."deletedAt" IS NULL
      AND ep.nome ILIKE '%capa de chuva%amarela%'
    ORDER BY ed."dataEntrega" DESC
    LIMIT 5
  `);
  console.log('\nEntregas Capa de Chuva PVC Amarela:');
  for (const row of r2.rows) {
    console.log(`  ID=${row.id} empId=${row.employeeId} nome="${row.nomeCompleto}" funcao="${row.funcao}" data=${row.dataEntrega} motivo=${row.motivo_troca}`);
  }
  
  // Check for null employeeId deliveries
  const r3 = await pool.query(`SELECT id, "employeeId", "epiId", "dataEntrega" FROM epi_deliveries WHERE "companyId" = 60002 AND "deletedAt" IS NULL AND "employeeId" IS NULL LIMIT 5`);
  console.log('\nEntregas sem employeeId:', r3.rows);
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
