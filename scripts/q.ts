import { getDb } from "../server/db";
import { sql } from "drizzle-orm";
const db = await getDb();
const r = await db.execute(sql`SELECT id, nome, unidade, categoria, valor_unitario::text AS valor, foto_url IS NOT NULL AS has_foto, length(coalesce(foto_url,'')) AS foto_len, substring(coalesce(foto_url,''), 1, 80) AS foto_prefix, codigo_interno, observacoes, data_inicio_locacao, data_vencimento_locacao, valor_locacao_mensal::text AS vlm, dias_alerta_locacao, origem FROM almoxarifado_itens WHERE nome ILIKE '%Pino para Pistola%' OR nome ILIKE '%Areia Lavada%' OR nome ILIKE '%Fincapino Magazinado%' OR nome ILIKE '%Finca pino%' LIMIT 10`);
console.log(JSON.stringify(r.rows ?? r, null, 2));
process.exit(0);
