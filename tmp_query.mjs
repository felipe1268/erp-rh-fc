import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT tn.id, tn.employeeId, tn.dataFim, tn.tipo, tn.status, e.nomeCompleto 
  FROM termination_notices tn 
  LEFT JOIN employees e ON tn.employeeId = e.id 
  WHERE tn.status = 'em_andamento' 
  ORDER BY tn.dataFim ASC 
  LIMIT 5
`);
console.log(JSON.stringify(rows, null, 2));

// Also check: which record has NULL employee name?
const [nullRows] = await conn.execute(`
  SELECT tn.id, tn.employeeId, tn.dataFim, tn.tipo, tn.status, e.nomeCompleto, e.id as eId
  FROM termination_notices tn 
  LEFT JOIN employees e ON tn.employeeId = e.id 
  WHERE tn.status = 'em_andamento' AND (e.nomeCompleto IS NULL OR e.nomeCompleto = '')
`);
console.log("\n--- Records with NULL/empty employee name ---");
console.log(JSON.stringify(nullRows, null, 2));

await conn.end();
