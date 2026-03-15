import { getDb } from "../db";

// ============================================================
// AUTO-IMPORTAÇÃO FINANCEIRA
// Importa dados das folhas CLT, pagamentos PJ, parceiros
// e cria lançamentos financeiros correspondentes
// ============================================================

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function mesCompetencia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function entryExists(db: any, companyId: number, origemModulo: string, origemId: number): Promise<boolean> {
  const res = await db.execute(
    `SELECT id FROM financial_entries WHERE company_id=$1 AND origem_modulo=$2 AND origem_id=$3 LIMIT 1`,
    [companyId, origemModulo, origemId]
  );
  const rows = (res as any)?.rows ?? (res as any) ?? [];
  return rows.length > 0;
}

// ──────────────────── FOLHA CLT ────────────────────
export async function importPayrollToFinancial(companyId: number, mesRef?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const targetMes = mesRef ?? mesCompetencia(new Date());
  const [ano, mes] = targetMes.split("-");

  const payrollRes = await db.execute(
    `SELECT p.id, p.employee_id, e.nome_completo, p.salario_bruto, p.inss_employee, p.irrf, p.fgts,
            p.salario_liquido, p.mes_referencia, p.data_pagamento, p.status, p.obra_id
     FROM payroll p
     LEFT JOIN employees e ON e.id = p.employee_id
     WHERE p.company_id = $1 AND p.mes_referencia = $2`,
    [companyId, targetMes]
  );
  const payrolls = (payrollRes as any)?.rows ?? (payrollRes as any) ?? [];

  let imported = 0;
  for (const p of payrolls) {
    if (await entryExists(db, companyId, "folha_clt", p.id)) continue;

    const dataComp = `${ano}-${mes}-01`;
    const dataVenc = p.data_pagamento ?? `${ano}-${mes}-05`;

    await db.execute(
      `INSERT INTO financial_entries
       (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
        valor_previsto, valor_realizado, data_competencia, data_vencimento, data_pagamento,
        status, origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at)
       VALUES ($1,$2,$3,NULL,'Salários e Horas Extras (CLT)','despesa','fixo',
               $4,$5,$6,$7,$8,$9,'folha_clt',$10,$11,$12,NOW(),NOW())`,
      [
        companyId,
        p.obra_id ?? null,
        null,
        parseFloat(p.salario_bruto ?? 0),
        p.status === "pago" ? parseFloat(p.salario_liquido ?? 0) : null,
        dataComp,
        dataVenc,
        p.data_pagamento ?? null,
        p.status === "pago" ? "pago" : "a_pagar",
        p.id,
        `Folha CLT ${targetMes} - ${p.nome_completo}`,
        `Salário ${targetMes}: ${p.nome_completo}`,
      ]
    );

    // Encargos FGTS
    if (parseFloat(p.fgts ?? 0) > 0) {
      await db.execute(
        `INSERT INTO financial_entries
         (company_id, obra_id, conta_nome, tipo, natureza, valor_previsto, data_competencia, data_vencimento,
          status, origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at)
         VALUES ($1,$2,'Encargos Sociais (FGTS/INSS)','despesa','fixo',$3,$4,$5,$6,'folha_clt_fgts',$7,$8,$9,NOW(),NOW())`,
        [
          companyId,
          p.obra_id ?? null,
          parseFloat(p.fgts),
          dataComp,
          `${ano}-${mes}-07`,
          p.status === "pago" ? "pago" : "a_pagar",
          p.id,
          `FGTS ${targetMes} - ${p.nome_completo}`,
          `FGTS ${targetMes}: ${p.nome_completo}`,
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

  const pjRes = await db.execute(
    `SELECT pp.id, pp.valor, pp.data_pagamento, pp.descricao, pp.status, pp.obra_id,
            o.nome AS obra_nome
     FROM pj_payments pp
     LEFT JOIN obras o ON o.id = pp.obra_id
     WHERE pp.company_id = $1
       AND TO_CHAR(pp.data_pagamento, 'YYYY-MM') = $2`,
    [companyId, targetMes]
  );
  const pjs = (pjRes as any)?.rows ?? (pjRes as any) ?? [];

  let imported = 0;
  for (const pj of pjs) {
    if (await entryExists(db, companyId, "pagamento_pj", pj.id)) continue;

    await db.execute(
      `INSERT INTO financial_entries
       (company_id, obra_id, obra_nome, conta_nome, tipo, natureza, valor_previsto, valor_realizado,
        data_competencia, data_vencimento, data_pagamento, status, origem_modulo, origem_id,
        origem_descricao, descricao, created_at, updated_at)
       VALUES ($1,$2,$3,'Serviços PJ / Terceirizados','despesa','variavel',$4,$5,$6,$7,$8,$9,
               'pagamento_pj',$10,$11,$12,NOW(),NOW())`,
      [
        companyId,
        pj.obra_id ?? null,
        pj.obra_nome ?? null,
        parseFloat(pj.valor ?? 0),
        pj.status === "pago" ? parseFloat(pj.valor ?? 0) : null,
        `${ano}-${mes}-01`,
        pj.data_pagamento ?? null,
        pj.data_pagamento ?? null,
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

  const lancRes = await db.execute(
    `SELECT lp.id, lp.valor, lp.data_lancamento, lp.descricao, lp.tipo, lp.status, lp.obra_id,
            o.nome AS obra_nome
     FROM lancamentos_parceiros lp
     LEFT JOIN obras o ON o.id = lp.obra_id
     WHERE lp.company_id = $1
       AND TO_CHAR(lp.data_lancamento, 'YYYY-MM') = $2`,
    [companyId, targetMes]
  );
  const lancs = (lancRes as any)?.rows ?? (lancRes as any) ?? [];

  let imported = 0;
  for (const l of lancs) {
    if (await entryExists(db, companyId, "parceiro_lancamento", l.id)) continue;

    await db.execute(
      `INSERT INTO financial_entries
       (company_id, obra_id, obra_nome, conta_nome, tipo, natureza, valor_previsto, valor_realizado,
        data_competencia, data_vencimento, data_pagamento, status, origem_modulo, origem_id,
        origem_descricao, descricao, created_at, updated_at)
       VALUES ($1,$2,$3,'Subempreiteiros','despesa','variavel',$4,$5,$6,$7,$8,$9,
               'parceiro_lancamento',$10,$11,$12,NOW(),NOW())`,
      [
        companyId,
        l.obra_id ?? null,
        l.obra_nome ?? null,
        parseFloat(l.valor ?? 0),
        l.status === "pago" ? parseFloat(l.valor ?? 0) : null,
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
