import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  const alterStatements = [
    `ALTER TABLE composicao_insumos ADD COLUMN IF NOT EXISTS alocacao_equip VARCHAR(30) DEFAULT '0'`,
    `ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS custo_unit_equip VARCHAR(30) DEFAULT '0'`,
    `ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_unit_equip VARCHAR(30) DEFAULT '0'`,
    `ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS custo_total_equip VARCHAR(30) DEFAULT '0'`,
    `ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS meta_total_equip VARCHAR(30) DEFAULT '0'`,
    `ALTER TABLE compras_solicitacoes ADD COLUMN IF NOT EXISTS incluir_equipamentos BOOLEAN DEFAULT false`,
  ];

  for (const stmt of alterStatements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log('OK:', stmt.substring(0, 80));
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log('EXISTS:', stmt.substring(0, 80));
      } else {
        console.error('FAIL:', stmt.substring(0, 80), e.message);
      }
    }
  }

  console.log('All ALTER TABLE statements done.');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
