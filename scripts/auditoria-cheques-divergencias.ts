// Auditoria one-off (Rev. 4995): varre TODAS as empresas, encontra cheques não-compensados
// que o extrato mostra como compensados e corrige os de MATCH FORTE (nº+valor único).
// Reusa exatamente o matcher/classificador do módulo (montarMatcherExtrato/classificarExtrato).
import { Client } from "pg";
import { getDb } from "../server/db";
import { montarMatcherExtrato, classificarExtrato } from "../server/routers/cheques";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("sem db");
  const pgc = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await pgc.connect();

  const comps = await pgc.query(
    `SELECT DISTINCT company_id FROM financial_cheques WHERE excluido_em IS NULL ORDER BY 1`);
  let totalFix = 0; const ambiguos: any[] = [];
  for (const { company_id: cid } of comps.rows) {
    const res = await pgc.query(
      `SELECT id, numero_cheque AS "numeroCheque", valor, status, ano_ref, mes_ref,
              fornecedor_nome AS forn, data_compensacao AS "dataCompensacao", COALESCE(conciliado,0) AS conciliado
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL
          AND status IN ('pendente','devolvido','sustado','indefinido')`, [cid]);
    if (!res.rows.length) continue;
    const matcher = await montarMatcherExtrato(db, Number(cid));
    for (const c of res.rows) {
      const cls: any = classificarExtrato(c.status, matcher(c));
      if (!cls.extratoDivergente) continue;
      if (cls.extratoForte) {
        const dt = cls.extratoData || new Date().toISOString().slice(0, 10);
        const upd = await pgc.query(
          `UPDATE financial_cheques
              SET status='compensado', conciliado=1,
                  data_compensacao=COALESCE(data_compensacao,$2::date),
                  data_conciliacao=COALESCE(data_conciliacao,$2::date),
                  updated_at=NOW()
            WHERE id=$1 AND company_id=$3 AND excluido_em IS NULL
              AND status IN ('pendente','devolvido','sustado','indefinido')
            RETURNING id`, [c.id, dt, cid]);
        if (upd.rows.length) {
          totalFix++;
          console.log(`FIX  emp ${cid} · cheque ${c.numeroCheque} · R$ ${c.valor} · ${c.status} → compensado (${dt})`);
        }
      } else {
        ambiguos.push({ cid, n: c.numeroCheque, v: c.valor, st: c.status, mes: `${c.mes_ref}/${c.ano_ref}`, forn: c.forn });
      }
    }
  }
  console.log(`\nTOTAL corrigidos: ${totalFix}`);
  console.log(`AMBÍGUOS (não mexidos): ${ambiguos.length}`);
  for (const a of ambiguos) console.log(`  AMB emp ${a.cid} · cheque ${a.n} · R$ ${a.v} · ${a.st} · ${a.mes} · ${a.forn ?? ""}`);
  await pgc.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
