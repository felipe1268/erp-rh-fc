import { sql } from "drizzle-orm";
import {
  BANCO_HORAS_DATA_INICIO,
  bancoHorasEstaVigente,
  bancoHorasMesTemDiasVigentes,
} from "./bancoHorasData";

export {
  BANCO_HORAS_DATA_INICIO,
  bancoHorasEstaVigente,
  bancoHorasMesTemDiasVigentes,
} from "./bancoHorasData";

/**
 * Marco único de vigência do Banco de Horas.
 *
 * O histórico anterior permanece armazenado para auditoria, porém não integra
 * saldos, extratos, alertas ou cálculos ativos. Use sempre data ISO (YYYY-MM-DD)
 * para evitar deslocamentos de timezone.
 */
/**
 * Repara o cache banco_horas_saldo sem apagar o livro razão.
 * A soma canônica é crédito positivo e qualquer modalidade de débito negativa.
 * Pode ser executada repetidamente: o resultado é sempre o mesmo.
 */
export async function recalcularSaldosBancoHorasVigentes(db: any, companyId?: number): Promise<void> {
  const filtroLancamentos = companyId
    ? sql` AND bhl."companyId" = ${companyId}`
    : sql``;
  const filtroSaldo = companyId
    ? sql` AND bhs."companyId" = ${companyId}`
    : sql``;

  await db.transaction(async (tx: any) => {
    // Lock transacional: dois boots/requests nunca recalculam o mesmo cache em paralelo.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(478011)`);

    // Zera entradas existentes sem movimentos vigentes e atualiza as que possuem saldo.
    await tx.execute(sql`
      WITH calculado AS (
        SELECT
          bhl."employeeId" AS employee_id,
          bhl."companyId" AS company_id,
          SUM(CASE WHEN bhl.tipo = 'credito' THEN ABS(bhl.minutos) ELSE -ABS(bhl.minutos) END)::int AS saldo
        FROM banco_horas_lancamentos bhl
        WHERE bhl.data >= ${BANCO_HORAS_DATA_INICIO}::date
          ${filtroLancamentos}
        GROUP BY bhl."employeeId", bhl."companyId"
      )
      UPDATE banco_horas_saldo bhs
      SET
        "saldoMinutos" = COALESCE((
          SELECT c.saldo
          FROM calculado c
          WHERE c.employee_id = bhs."employeeId" AND c.company_id = bhs."companyId"
        ), 0),
        "atualizadoEm" = NOW()
      WHERE TRUE ${filtroSaldo}
    `);

    // Cria cache apenas para saldos efetivamente diferentes de zero que ainda não têm linha.
    await tx.execute(sql`
      WITH calculado AS (
        SELECT
          bhl."employeeId" AS employee_id,
          bhl."companyId" AS company_id,
          SUM(CASE WHEN bhl.tipo = 'credito' THEN ABS(bhl.minutos) ELSE -ABS(bhl.minutos) END)::int AS saldo
        FROM banco_horas_lancamentos bhl
        WHERE bhl.data >= ${BANCO_HORAS_DATA_INICIO}::date
          ${filtroLancamentos}
        GROUP BY bhl."employeeId", bhl."companyId"
      )
      INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
      SELECT c.employee_id, c.company_id, c.saldo, NOW()
      FROM calculado c
      WHERE c.saldo <> 0
      ON CONFLICT ("employeeId", "companyId") DO UPDATE SET
        "saldoMinutos" = EXCLUDED."saldoMinutos",
        "atualizadoEm" = NOW()
    `);
  });
}