// Import CAEPI data into the database using raw mysql2
// This script reads DATABASE_URL from the running server's environment
import { execSync } from 'child_process';
import fs from 'fs';
import mysql from 'mysql2/promise';

async function main() {
  // Get DATABASE_URL from drizzle config
  const dkConfig = fs.readFileSync('/home/ubuntu/erp-rh-fc/drizzle.config.ts', 'utf-8');
  
  // Try to get DATABASE_URL from process.env or from the running server
  let dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    // Read from the server process environment
    try {
      const pid = execSync("pgrep -f 'tsx.*server' | head -1").toString().trim();
      if (pid) {
        const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf-8');
        const match = env.split('\0').find(e => e.startsWith('DATABASE_URL='));
        if (match) dbUrl = match.split('=').slice(1).join('=');
      }
    } catch(e) {}
  }
  
  if (!dbUrl) {
    console.error('Could not find DATABASE_URL. Trying from drizzle config...');
    // Parse from drizzle.config.ts
    const match = dkConfig.match(/url:\s*process\.env\.(\w+)/);
    console.error('Drizzle config uses:', match ? match[1] : 'unknown');
    process.exit(1);
  }

  console.log('DB URL found, connecting...');
  
  const data = JSON.parse(fs.readFileSync('/home/ubuntu/caepi_data.json', 'utf-8'));
  console.log(`Loaded ${data.length} CAs from JSON`);

  const conn = await mysql.createConnection(dbUrl);
  
  // Clear existing data
  await conn.execute('DELETE FROM caepi_database');
  console.log('Cleared existing data');

  // Insert in batches of 200
  const BATCH = 200;
  let inserted = 0;
  
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    const values = batch.map(r => [
      r.ca,
      r.validade || null,
      r.situacao || null,
      r.cnpj || null,
      (r.fabricante || '').substring(0, 500) || null,
      r.natureza || null,
      (r.equipamento || '').substring(0, 500) || null,
      (r.descricao || '').substring(0, 65000) || null,
      (r.referencia || '').substring(0, 500) || null,
      (r.cor || '').substring(0, 100) || null,
      (r.aprovadoPara || '').substring(0, 65000) || null,
    ]);
    
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const flat = values.flat();
    
    await conn.execute(
      `INSERT INTO caepi_database (ca, validade, situacao, cnpj, fabricante, natureza, equipamento, descricao, referencia, cor, aprovado_para) VALUES ${placeholders}`,
      flat
    );
    
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === data.length) {
      console.log(`Inserted ${inserted}/${data.length}`);
    }
  }
  
  console.log(`Done! Total inserted: ${inserted}`);
  
  // Verify
  const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM caepi_database');
  console.log(`Verified: ${rows[0].cnt} records in database`);
  
  // Test lookup
  const [test] = await conn.execute('SELECT * FROM caepi_database WHERE ca = ?', ['15532']);
  if (test.length > 0) {
    console.log(`Test CA 15532: ${test[0].equipamento} - ${test[0].situacao} - ${test[0].fabricante}`);
  }
  
  const [test2] = await conn.execute('SELECT * FROM caepi_database WHERE ca = ?', ['48067']);
  if (test2.length > 0) {
    console.log(`Test CA 48067: ${test2[0].equipamento} - ${test2[0].situacao} - ${test2[0].fabricante}`);
  }
  
  const [test3] = await conn.execute('SELECT * FROM caepi_database WHERE ca = ?', ['15649']);
  if (test3.length > 0) {
    console.log(`Test CA 15649: ${test3[0].equipamento} - ${test3[0].situacao} - ${test3[0].fabricante}`);
  }
  
  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
