import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

// Read .env manually
const envContent = fs.readFileSync('/home/ubuntu/erp-rh-fc/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const conn = await mysql.createConnection(envVars.DATABASE_URL);
const [rows] = await conn.query(`SELECT id, numeroProcesso, LEFT(reclamante, 25) as reclamante, valorCausa, LEFT(vara, 40) as vara, datajudId, datajudTotalMovimentos FROM processos_trabalhistas WHERE deletedAt IS NULL`);
console.log("=== PROCESSOS ===");
rows.forEach(r => {
  console.log(`ID: ${r.id} | Processo: ${r.numeroProcesso} | Reclamante: ${r.reclamante} | Valor: ${r.valorCausa || 'NULL'} | Vara: ${r.vara || 'NULL'} | DataJud ID: ${r.datajudId || 'NULL'} | Movs: ${r.datajudTotalMovimentos || 'NULL'}`);
});
await conn.end();
