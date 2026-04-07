import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { coletarKmDiarioJob } from "../routers/frotas";

let jobInterval: any = null;

export function startFleetKmJob() {
  const INTERVAL_MS = 30 * 60 * 1000;

  async function runCollection() {
    try {
      const db = await getDb();
      const companiesRes = (await db.execute(sql`
        SELECT DISTINCT "companyId" as company_id FROM vehicles WHERE "companyId" IS NOT NULL
      `) as any).rows || [];

      if (!companiesRes.length) return;

      const today = new Date().toISOString().slice(0, 10);

      for (const row of companiesRes) {
        const result = await coletarKmDiarioJob(row.company_id, today);
        if (result.coletados > 0) {
          console.log(`[FleetKmJob] Empresa ${row.company_id}: ${result.coletados} veículos com km registrado (${today})`);
        }
      }
    } catch (e: any) {
      console.error("[FleetKmJob] Erro na coleta:", e.message);
    }
  }

  runCollection();

  jobInterval = setInterval(runCollection, INTERVAL_MS);
  console.log("[FleetKmJob] Coleta automática de km diário iniciada (a cada 30 min)");
}
