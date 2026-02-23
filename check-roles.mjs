import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const conn = await mysql.createConnection(url);
  
  // Check users table structure
  const [cols] = await conn.execute('SHOW COLUMNS FROM users');
  console.log('=== USERS TABLE COLUMNS ===');
  for (const col of cols) {
    console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
  }
  
  // Check user roles
  const [users] = await conn.execute('SELECT id, name, email, role, openId FROM users ORDER BY id');
  console.log('\n=== USERS AND ROLES ===');
  for (const u of users) {
    console.log(`  ID=${u.id} | Name=${u.name} | Email=${u.email} | Role="${u.role}" | OpenID=${u.openId}`);
  }
  
  // Check the role enum definition
  const [roleCol] = await conn.execute("SHOW COLUMNS FROM users LIKE 'role'");
  console.log('\n=== ROLE COLUMN DEFINITION ===');
  console.log(`  Type: ${roleCol[0]?.Type}`);
  console.log(`  Default: ${roleCol[0]?.Default}`);
  
  await conn.end();
}

main().catch(console.error);
