import pg from "pg";
import crypto from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "./drizzle/schema";
import { buildBoletimMedicaoHtml } from "./server/boletimMedicaoHtml";
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const db = drizzle(pool, { schema });
  const { html } = await buildBoletimMedicaoHtml(db as any, 15, 60002);
  const hash = crypto.createHash("sha256").update(html).digest("hex");
  await (db as any).update(schema.integrasignEnvelopes).set({ textoContrato: html, hashDocumento: hash }).where(eq(schema.integrasignEnvelopes.id, 18));
  console.log("len:", html.length, "| plantas:", html.includes("PLANTAS, MEDIÇÕES"), "| svgs:", (html.match(/<svg/g) || []).length, "| shapes:", (html.match(/<polygon|<polyline/g) || []).length, "| fotos:", (html.match(/\?w=512/g) || []).length, "| liquido:", html.includes("3.619,98"));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
