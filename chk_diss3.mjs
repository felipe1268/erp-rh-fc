import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: process.env.NEON_DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const TERM = ['Desligado','Lista_Negra','Inativo'];
// CLT não-desligados do 60002 SEM registro no dissídio 2
const q = await c.query(`
  SELECT e.id, e."nomeCompleto", e.status, e."salarioBase"
  FROM employees e
  WHERE e."companyId"=60002
    AND e."tipoContrato" != 'PJ'
    AND e.status <> ALL($1::text[])
    AND NOT EXISTS (SELECT 1 FROM dissidio_funcionarios df WHERE df."dissidioId"=2 AND df."employeeId"=e.id)
  ORDER BY e.status, e."nomeCompleto"
`,[TERM]);
console.log('CLT não-desligados do 60002 SEM registro no dissídio 2:', q.rows.length);
const byStatus={};
for(const x of q.rows){ byStatus[x.status]=(byStatus[x.status]||0)+1; }
console.log('por status:', JSON.stringify(byStatus));
console.log('--- lista ---');
for(const x of q.rows) console.log(`${x.id} | ${x.nomeCompleto} | ${x.status} | ${x.salarioBase}`);
await c.end();
