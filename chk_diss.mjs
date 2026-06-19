import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: process.env.NEON_DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const nomes = ['ERIC GUSTAVO','FERNANDO RODRIGO','FRANCISCO DAS CHAGAS','GERALDO CANDIDO','HENRIQUE LOPES','KELLEN LARISSA','MARCOS ROBERTO CORREA','MARIANA CASTILHO','REGIS MORAES','RODRIGO NOGUEIRA','WILLIANS GABRIEL RENOLDI'];
const r = await c.query(`
  SELECT id, "nomeCompleto", status, "tipoContrato", "salarioBase", "companyId"
  FROM employees
  WHERE ${nomes.map((_,i)=>`UPPER("nomeCompleto") LIKE UPPER($${i+1})`).join(' OR ')}
  ORDER BY "nomeCompleto"
`, nomes.map(n=>`%${n}%`));
console.log('total linhas:', r.rows.length);
for (const x of r.rows) console.log(`${x.id} | ${x.nomeCompleto} | status=${x.status} | contrato=${x.tipoContrato} | sal=${x.salarioBase} | comp=${x.companyId}`);
const dist = {};
for (const x of r.rows) dist[x.status]=(dist[x.status]||0)+1;
console.log('\ndistribuição status:', JSON.stringify(dist));
await c.end();
