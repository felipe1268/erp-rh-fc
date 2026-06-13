const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL });
  await c.connect();
  const soc = await c.query(`SELECT id, "companyId", "nomeCompleto", cpf, cargo, "tipoContrato", status FROM employees WHERE "tipoContrato"='Socio' ORDER BY "companyId","nomeCompleto"`);
  console.log("=== tipoContrato=Socio count:", soc.rowCount, "==="); console.table(soc.rows);
  const fel = await c.query(`SELECT id, "companyId", "nomeCompleto", cpf, cargo, "tipoContrato", status FROM employees WHERE "nomeCompleto" ILIKE $1 ORDER BY "companyId"`, ["%felipe%alves%"]);
  console.log("=== Felipe Alves ==="); console.table(fel.rows);
  const co = await c.query("SELECT id, name FROM companies ORDER BY id");
  console.log("=== companies ==="); console.table(co.rows);
  await c.end();
})().catch(e => console.error("ERR", e.message));
