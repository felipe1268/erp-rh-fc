import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  const r = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'composicao_insumos'
    ORDER BY ordinal_position
  `);
  console.log('composicao_insumos columns:', (r as any).rows?.map((r:any) => r.column_name) ?? r);

  const r2 = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'orcamento_itens' AND column_name LIKE '%equip%'
  `);
  console.log('orcamento_itens equip cols:', (r2 as any).rows?.map((r:any) => r.column_name) ?? r2);

  const r3 = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'compras_solicitacoes' AND column_name LIKE '%equip%'
  `);
  console.log('compras_solicitacoes equip cols:', (r3 as any).rows?.map((r:any) => r.column_name) ?? r3);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
