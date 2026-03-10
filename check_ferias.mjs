import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Status distribution
const [rows1] = await conn.execute(`
  SELECT status, COUNT(*) as total, 
    MIN(periodoConcessivoFim) as oldest_concessivo, 
    MAX(periodoConcessivoFim) as newest_concessivo 
  FROM vacation_periods 
  WHERE deletedAt IS NULL 
  GROUP BY status 
  ORDER BY total DESC
`);
console.log('=== Status Distribution ===');
console.table(rows1);

// Count férias with periodoConcessivoFim before 2024-01-01 that are NOT concluida
const [rows2] = await conn.execute(`
  SELECT status, COUNT(*) as total 
  FROM vacation_periods 
  WHERE deletedAt IS NULL 
    AND periodoConcessivoFim < '2024-01-01'
    AND status != 'concluida'
    AND status != 'cancelada'
  GROUP BY status
`);
console.log('\n=== Férias antes de 2024 (não concluídas) ===');
console.table(rows2);

// Total to liquidate
const [rows3] = await conn.execute(`
  SELECT COUNT(*) as total_to_liquidate
  FROM vacation_periods 
  WHERE deletedAt IS NULL 
    AND periodoConcessivoFim < '2024-01-01'
    AND status != 'concluida'
    AND status != 'cancelada'
`);
console.log('\n=== Total a liquidar ===');
console.log(rows3[0].total_to_liquidate);

// Sample of what will be liquidated
const [rows4] = await conn.execute(`
  SELECT vp.id, vp.employeeId, vp.status, vp.periodoAquisitivoInicio, vp.periodoAquisitivoFim, vp.periodoConcessivoFim, vp.vencida
  FROM vacation_periods vp
  WHERE vp.deletedAt IS NULL 
    AND vp.periodoConcessivoFim < '2024-01-01'
    AND vp.status != 'concluida'
    AND vp.status != 'cancelada'
  LIMIT 10
`);
console.log('\n=== Amostra (10 primeiros) ===');
console.table(rows4);

await conn.end();
