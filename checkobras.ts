import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";

async function main() {
  const sqlClient = neon(process.env.NEON_DATABASE_URL!);
  const db = drizzle(sqlClient);
  const rows = await db.execute(sql`SELECT DISTINCT status, COUNT(*) as qtd FROM obras WHERE "companyId" = 60002 AND "deletedAt" IS NULL GROUP BY status ORDER BY qtd DESC`);
  console.log(JSON.stringify((rows as any).rows ?? rows, null, 2));
}
main().catch(console.error);
