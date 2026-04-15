import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { coletarKmDiarioJob } from "../routers/frotas";

let jobInterval: any = null;

async function ensureKmTable() {
  try {
    const db = await getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fleet_daily_km (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        vehicle_id INTEGER,
        infleet_vehicle_id VARCHAR(100),
        placa VARCHAR(20) NOT NULL,
        nome_veiculo VARCHAR(255),
        data DATE NOT NULL,
        km_total NUMERIC(12,1) DEFAULT 0,
        viagens INTEGER DEFAULT 0,
        num_viagens INTEGER DEFAULT 0,
        tempo_rodando_min INTEGER DEFAULT 0,
        vel_media NUMERIC(6,1) DEFAULT 0,
        vel_maxima NUMERIC(6,1) DEFAULT 0,
        motoristas TEXT,
        motorista TEXT,
        odometro_fim NUMERIC(12,1),
        km_odometro_fim NUMERIC(12,1),
        alerta_gps TEXT,
        primeira_ligacao TIMESTAMP,
        ultima_desligacao TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(company_id, placa, data)
      )
    `);
  } catch (e: any) {
    console.error("[FleetKmJob] Erro ao criar tabela fleet_daily_km:", e.message);
  }
}

export function startFleetKmJob() {
  const INTERVAL_MS = 30 * 60 * 1000;

  async function runCollection() {
    try {
      await ensureKmTable();
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
