import { getDb } from './server/db.ts';
import { obras } from './drizzle/schema.ts';

async function main() {
  const db = (await getDb());
  const all = await db.select().from(obras).limit(5);
  console.log('Total obras:', all.length);
  if (all.length > 0) {
    console.log('Keys:', Object.keys(all[0]));
    console.log('companyId:', all[0].companyId);
    all.forEach(o => console.log(`ID: ${o.id}, Nome: ${o.nome}, companyId: ${o.companyId}, status: ${o.status}`));
  }
  process.exit(0);
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });
