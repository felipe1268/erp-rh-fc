import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: process.env.NEON_DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();

// 1) dissídios da empresa 60002
const d = await c.query(`SELECT id, "companyId", "percentualReajuste", status, retroativo, "dataRetroativoInicio", "dataAplicacao", "createdAt" FROM dissidios WHERE "companyId" IN (60002,60005) ORDER BY id DESC`);
console.log('=== DISSÍDIOS ===');
for (const x of d.rows) console.log(JSON.stringify(x));

// 2) registros aplicados por dissídio
console.log('\n=== dissidio_funcionarios (resumo por dissídio/status) ===');
const f = await c.query(`SELECT "dissidioId", status, COUNT(*) n FROM dissidio_funcionarios GROUP BY "dissidioId", status ORDER BY "dissidioId" DESC`);
for (const x of f.rows) console.log(JSON.stringify(x));

// 3) Os 11 nomes — têm registro em dissidio_funcionarios?
const ids = [420147,420067,420084,15,1200007,1200008,14,420100,13,1200011,420109,420145,420141,126];
const g = await c.query(`SELECT "employeeId","dissidioId",status,"salarioAnterior","salarioNovo","percentualAplicado" FROM dissidio_funcionarios WHERE "employeeId" = ANY($1::int[]) ORDER BY "employeeId"`, [ids]);
console.log('\n=== registros dos 11 nomes em dissidio_funcionarios ===');
console.log('linhas:', g.rows.length);
for (const x of g.rows) console.log(JSON.stringify(x));
await c.end();
