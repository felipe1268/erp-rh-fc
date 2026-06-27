import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { resolveContaId } from "./financialIntegrationBridge";

// ============================================================
// AUTO-IMPORTAÇÃO FINANCEIRA
// Importa dados das folhas CLT, pagamentos PJ, parceiros
// e cria lançamentos financeiros correspondentes
// ============================================================

// ─── helper: executa queries parametrizadas corretamente no Drizzle ORM ───
// db.execute(string, array) ignora o array — é preciso usar sql template
async function dbExecute(db: any, query: string, params: unknown[]): Promise<{ rows: any[] }> {
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const paramVal = params[i - 1];
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${paramVal}${sql.raw(tail)}` : sql`${built}${paramVal}`;
  }
  const res = await db.execute(built);
  const rows: any[] = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  return { rows };
}

function mesCompetencia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function entryExists(db: any, companyId: number, origemModulo: string, origemId: number): Promise<boolean> {
  const { rows } = await dbExecute(db,
    `SELECT id FROM financial_entries WHERE company_id=$1 AND origem_modulo=$2 AND origem_id=$3 LIMIT 1`,
    [companyId, origemModulo, origemId]
  );
  return rows.length > 0;
}

// ──────────────────── FOLHA CLT ────────────────────
export async function importPayrollToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const targetMes = mesRef ?? mesCompetencia(new Date());
  const [ano, mes] = targetMes.split("-");

  const { rows: payrolls } = await dbExecute(db,
    `SELECT p.id, p."employeeId", e."nomeCompleto" AS nome_completo,
            p."salarioBruto", p.inss, p.irrf, p.fgts,
            p."salarioLiquido", p."mesReferencia", p."dataPagamento", p.status
     FROM payroll p
     LEFT JOIN employees e ON e.id = p."employeeId"
     WHERE p."companyId" = $1 AND p."mesReferencia" = $2`,
    [companyId, targetMes]
  );

  let imported = 0;
  for (const p of payrolls) {
    if (await entryExists(db, companyId, "folha_clt", p.id)) continue;

    const dataComp = `${ano}-${mes}-01`;
    const dataVenc = p.dataPagamento ?? `${ano}-${mes}-05`;
    const salBruto = parseFloat(p.salarioBruto ?? "0");
    const salLiq = parseFloat(p.salarioLiquido ?? "0");
    const fgts = parseFloat(p.fgts ?? "0");

    await dbExecute(db,
      `INSERT INTO financial_entries
       (company_id, conta_id, conta_nome, tipo, natureza,
        valor_previsto, valor_realizado, data_competencia, data_vencimento, data_pagamento,
        status, origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at)
       VALUES ($1,506,'Salários e Horas Extras (CLT)','despesa','fixo',
               $2,$3,$4,$5,$6,$7,'folha_clt',$8,$9,$10,NOW(),NOW())`,
      [
        companyId,
        salBruto,
        p.status === "pago" ? salLiq : null,
        dataComp,
        dataVenc,
        p.dataPagamento ?? null,
        p.status === "pago" ? "pago" : "a_pagar",
        p.id,
        `Folha CLT ${targetMes} - ${p.nome_completo ?? ""}`,
        `Salário ${targetMes}: ${p.nome_completo ?? ""}`,
      ]
    );

    // Encargos FGTS
    if (fgts > 0) {
      await dbExecute(db,
        `INSERT INTO financial_entries
         (company_id, conta_nome, tipo, natureza, valor_previsto, data_competencia, data_vencimento,
          status, origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at)
         VALUES ($1,'Encargos Sociais (FGTS/INSS)','despesa','fixo',$2,$3,$4,$5,'folha_clt_fgts',$6,$7,$8,NOW(),NOW())`,
        [
          companyId,
          fgts,
          dataComp,
          `${ano}-${mes}-07`,
          p.status === "pago" ? "pago" : "a_pagar",
          p.id,
          `FGTS ${targetMes} - ${p.nome_completo ?? ""}`,
          `FGTS ${targetMes}: ${p.nome_completo ?? ""}`,
        ]
      );
    }
    imported++;
  }

  return imported;
}

// ──────────────────── PAGAMENTOS PJ ────────────────────
export async function importPJToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const targetMes = mesRef ?? mesCompetencia(new Date());
  const [ano, mes] = targetMes.split("-");

  const { rows: pjs } = await dbExecute(db,
    `SELECT pp.id, pp.valor, pp."dataPagamento", pp.descricao, pp.status, pp."mesReferencia"
     FROM pj_payments pp
     WHERE pp."companyId" = $1
       AND pp."mesReferencia" = $2`,
    [companyId, targetMes]
  );

  let imported = 0;
  for (const pj of pjs) {
    if (await entryExists(db, companyId, "pagamento_pj", pj.id)) continue;

    const valor = parseFloat(pj.valor ?? "0");
    if (valor <= 0) continue;

    await dbExecute(db,
      `INSERT INTO financial_entries
       (company_id, conta_id, conta_nome, tipo, natureza, valor_previsto, valor_realizado,
        data_competencia, data_vencimento, data_pagamento, status, origem_modulo, origem_id,
        origem_descricao, descricao, created_at, updated_at)
       VALUES ($1,391,'Serviços PJ / Terceirizados','despesa','variavel',$2,$3,$4,$5,$6,$7,
               'pagamento_pj',$8,$9,$10,NOW(),NOW())`,
      [
        companyId,
        valor,
        pj.status === "pago" ? valor : null,
        `${ano}-${mes}-01`,
        pj.dataPagamento ?? null,
        pj.dataPagamento ?? null,
        pj.status === "pago" ? "pago" : "a_pagar",
        pj.id,
        `PJ ${targetMes} - ${pj.descricao ?? "Serviço PJ"}`,
        pj.descricao ?? `Pagamento PJ ${targetMes}`,
      ]
    );
    imported++;
  }
  return imported;
}

// ──────────────────── PARCEIROS / LANÇAMENTOS ────────────────────
export async function importParceiroLancamentosToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const targetMes = mesRef ?? mesCompetencia(new Date());
  const [ano, mes] = targetMes.split("-");

  const { rows: lancs } = await dbExecute(db,
    `SELECT lp.id, lp.valor, lp.data_compra AS data_lancamento, lp.descricao_itens AS descricao,
            lp.status
     FROM lancamentos_parceiros lp
     WHERE lp."companyId" = $1
       AND TO_CHAR(lp.data_compra, 'YYYY-MM') = $2`,
    [companyId, targetMes]
  );

  let imported = 0;
  for (const l of lancs) {
    if (await entryExists(db, companyId, "parceiro_lancamento", l.id)) continue;

    const valor = parseFloat(l.valor ?? "0");
    if (valor <= 0) continue;

    await dbExecute(db,
      `INSERT INTO financial_entries
       (company_id, conta_nome, tipo, natureza, valor_previsto, valor_realizado,
        data_competencia, data_vencimento, data_pagamento, status, origem_modulo, origem_id,
        origem_descricao, descricao, created_at, updated_at)
       VALUES ($1,23,'MÃO DE OBRA TERCEIRIZADA / SUBEMPREITEIRO','despesa','variavel',$2,$3,$4,$5,$6,$7,
               'parceiro_lancamento',$8,$9,$10,NOW(),NOW())`,
      [
        companyId,
        valor,
        l.status === "pago" ? valor : null,
        `${ano}-${mes}-01`,
        l.data_lancamento ?? null,
        l.status === "pago" ? l.data_lancamento : null,
        l.status === "pago" ? "pago" : "a_pagar",
        l.id,
        `Parceiro ${targetMes} - ${l.descricao ?? "Lançamento"}`,
        l.descricao ?? `Lançamento Parceiro ${targetMes}`,
      ]
    );
    imported++;
  }
  return imported;
}

// ──────────────────── EXECUTAR TUDO ────────────────────
export async function runAllAutoImports(companyId: number, mesRef?: string): Promise<{ folha: number; pj: number; parceiros: number }> {
  const [folha, pj, parceiros] = await Promise.all([
    importPayrollToFinancial(companyId, mesRef).catch(() => 0),
    importPJToFinancial(companyId, mesRef).catch(() => 0),
    importParceiroLancamentosToFinancial(companyId, mesRef).catch(() => 0),
  ]);
  console.log(`[FinancialAutoImport] company=${companyId} mes=${mesRef}: folha=${folha} pj=${pj} parceiros=${parceiros}`);
  return { folha, pj, parceiros };
}
