import mysql from 'mysql2/promise';
import crypto from 'crypto';
import fs from 'fs';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Create skills table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS skills (
      id int AUTO_INCREMENT NOT NULL,
      companyId int NOT NULL,
      nome varchar(255) NOT NULL,
      categoria varchar(100),
      descricao text,
      deleted_at timestamp,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);
  console.log('skills table created');
  
  // Create employee_skills table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS employee_skills (
      id int AUTO_INCREMENT NOT NULL,
      employeeId int NOT NULL,
      skillId int NOT NULL,
      companyId int NOT NULL,
      nivel enum('Basico','Intermediario','Avancado') NOT NULL DEFAULT 'Basico',
      tempoExperiencia varchar(100),
      observacao text,
      deleted_at timestamp,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);
  console.log('employee_skills table created');
  
  // Create indexes
  try { await conn.query('CREATE INDEX es_employee ON employee_skills (employeeId)'); } catch(e) { console.log('Index es_employee:', e.message); }
  try { await conn.query('CREATE INDEX es_skill ON employee_skills (skillId)'); } catch(e) { console.log('Index es_skill:', e.message); }
  try { await conn.query('CREATE INDEX es_company ON employee_skills (companyId)'); } catch(e) { console.log('Index es_company:', e.message); }
  try { await conn.query('CREATE INDEX sk_company ON skills (companyId)'); } catch(e) { console.log('Index sk_company:', e.message); }
  try { await conn.query('CREATE INDEX sk_categoria ON skills (categoria)'); } catch(e) { console.log('Index sk_categoria:', e.message); }
  console.log('Indexes done');
  
  // Register the migration in __drizzle_migrations
  const sqlContent = fs.readFileSync('drizzle/0031_zippy_scrambler.sql', 'utf8');
  const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
  await conn.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [hash, Date.now()]);
  console.log('Migration 0031 registered with hash:', hash);
  
  // Verify
  const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM __drizzle_migrations');
  console.log('Total migrations now:', rows[0].cnt);
  
  const [tables] = await conn.query("SHOW TABLES LIKE 'skills'");
  console.log('skills table exists:', tables.length > 0);
  const [tables2] = await conn.query("SHOW TABLES LIKE 'employee_skills'");
  console.log('employee_skills table exists:', tables2.length > 0);
  
  await conn.end();
}

main().catch(e => console.error(e));
