import { Pool } from "pg";
import { upperCaseEmpresa } from "../shared/normalizeNomeEmpresa";

const url = process.env.NEON_DATABASE_URL;
if (!url || /localhost|127\.0\.0\.1|helium/i.test(url)) {
  console.error("NEON_DATABASE_URL ausente ou aponta para banco local. Abortando.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

type Chg = { id: number; rs: string | null; nf: string | null };

async function backfill(table: string) {
  const { rows } = await pool.query(`SELECT id, razao_social, nome_fantasia FROM ${table}`);
  const changes: Chg[] = [];
  for (const r of rows) {
    const novaRazao = r.razao_social != null ? upperCaseEmpresa(r.razao_social) : null;
    const novoFant = r.nome_fantasia != null ? upperCaseEmpresa(r.nome_fantasia) : null;
    if (novaRazao !== r.razao_social || novoFant !== r.nome_fantasia) {
      changes.push({ id: r.id, rs: novaRazao, nf: novoFant });
    }
  }
  const CHUNK = 300;
  for (let i = 0; i < changes.length; i += CHUNK) {
    const slice = changes.slice(i, i + CHUNK);
    const vals: string[] = [];
    const params: any[] = [];
    slice.forEach((c, j) => {
      const b = j * 3;
      vals.push(`($${b + 1}::int, $${b + 2}::text, $${b + 3}::text)`);
      params.push(c.id, c.rs, c.nf);
    });
    await pool.query(
      `UPDATE ${table} AS t SET razao_social = v.rs, nome_fantasia = v.nf
       FROM (VALUES ${vals.join(",")}) AS v(id, rs, nf)
       WHERE t.id = v.id`,
      params
    );
  }
  console.log(`[${table}] total=${rows.length} atualizados=${changes.length}`);
}

(async () => {
  try {
    await backfill("fornecedores");
    await backfill("empresas_terceiras");
    console.log("Backfill concluído.");
  } catch (e) {
    console.error("Erro no backfill:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
