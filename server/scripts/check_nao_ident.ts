import pg from 'pg';
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`
    SELECT ed.id, ed."employeeId", ed."epiId", ed."dataEntrega", ed."motivo_troca",
           e."nomeCompleto" as emp_nome, e."deletedAt" as emp_deleted,
           ep.nome as epi_nome
    FROM epi_deliveries ed
    LEFT JOIN employees e ON ed."employeeId" = e.id
    LEFT JOIN epis ep ON ed."epiId" = ep.id
    WHERE ed."companyId" = 60002 AND ed."deletedAt" IS NULL
      AND (e.id IS NULL OR e."deletedAt" IS NOT NULL)
    ORDER BY ed."dataEntrega" DESC
    LIMIT 10
  `);
  console.log('Entregas sem funcionário válido:');
  for (const row of r.rows) {
    console.log(`  ID=${row.id} empId=${row.employeeId} EPI="${row.epi_nome}" data=${row.dataEntrega} empNome=${row.emp_nome || 'NULL'} empDeleted=${row.emp_deleted || 'NULL'}`);
  }
  console.log(`Total: ${r.rows.length}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
