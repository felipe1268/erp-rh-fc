import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employees, systemCriteria } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";

// ============================================================
// HELPERS (mirrored from payrollEngine — kept private here)
// ============================================================
function parseTime(str: string | null | undefined): number | null {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0]), m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${mins < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

function getExpectedMins(jornadaTrabalho: string | null | undefined, dateStr: string, cargaHorariaDiaria: number): number {
  if (!jornadaTrabalho) return cargaHorariaDiaria * 60;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return cargaHorariaDiaria * 60;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const day = parsed[dayKey];
    if (!day?.entrada || !day?.saida) return 0;
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    let expectedMins = toMins(day.saida) - toMins(day.entrada);
    if (day.intervalo) {
      const [ih, im] = day.intervalo.split(":").map(Number);
      expectedMins -= (ih || 0) * 60 + (im || 0);
    }
    return Math.max(0, expectedMins);
  } catch { return cargaHorariaDiaria * 60; }
}

async function getHECriteria(db: any, companyId: number) {
  const rows = await db.select().from(systemCriteria).where(eq(systemCriteria.companyId, companyId));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.chave] = r.valor;
  return {
    cargaHorariaDiaria: parseInt(map["jornada_horas_diarias"] || "8"),
    hePercentualDiurna: parseFloat(map["he_dias_uteis"] || "60"),
    hePercentualDomingo: parseFloat(map["he_domingos_feriados"] || "100"),
  };
}

async function computeHEForPeriod(
  db: any,
  companyId: number,
  dataInicio: string,
  dataFim: string,
  cargaHorariaDiaria: number
) {
  const trRaws = ((await db.execute(sql`
    SELECT tr."employeeId", tr.data, tr."horasTrabalhadas", e."jornadaTrabalho",
           e."nomeCompleto", e."valorHora", e."salarioBase", e."horasMensais"
    FROM time_records tr
    JOIN employees e ON e.id = tr."employeeId"
    WHERE tr."companyId" = ${companyId}
      AND tr.data >= ${dataInicio}::date
      AND tr.data <= ${dataFim}::date
      AND tr."horasTrabalhadas" IS NOT NULL
      AND tr."horasTrabalhadas" != ''
      AND tr."horasTrabalhadas" != '0:00'
  `)) as any).rows || [];

  const heUtilMap = new Map<number, number>();
  const heFimMap  = new Map<number, number>();
  const heMap     = new Map<number, number>();
  const empMeta   = new Map<number, { nome: string; valorHora: number; salario: number }>();

  for (const r of trRaws) {
    const empId    = Number(r.employeeId);
    const trabMins = parseTime(String(r.horasTrabalhadas)) || 0;
    if (trabMins <= 0) continue;
    const dateStr = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data).slice(0, 10);
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    if (dow === 0) continue; // Sundays: skip

    const expectedMins = getExpectedMins(r.jornadaTrabalho, dateStr, cargaHorariaDiaria);
    const heMins = Math.max(0, trabMins - expectedMins);
    if (heMins <= 0) continue;

    if (dow === 6) {
      heFimMap.set(empId, (heFimMap.get(empId) || 0) + heMins);
    } else {
      heUtilMap.set(empId, (heUtilMap.get(empId) || 0) + heMins);
    }
    heMap.set(empId, (heMap.get(empId) || 0) + heMins);

    if (!empMeta.has(empId)) {
      const vhStr = r.valorHora || r.salarioBase || "0";
      empMeta.set(empId, {
        nome: r.nomeCompleto || "",
        valorHora: parseBRL(String(vhStr)) || 0,
        salario: 0,
      });
    }
  }

  return { heUtilMap, heFimMap, heMap, empMeta };
}

// ============================================================
// ROUTER
// ============================================================
export const horasExtrasRouter = router({

  // List HE periods for a company + mes
  listarPeriods: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT * FROM he_periods
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        ORDER BY "criadoEm" DESC
      `)) as any).rows || [];
      return rows;
    }),

  // Get detail (employees) for a specific HE period
  getDetalhe: protectedProcedure
    .input(z.object({ hePeriodId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [periodRows, empRows] = await Promise.all([
        db.execute(sql`SELECT * FROM he_periods WHERE id = ${input.hePeriodId} LIMIT 1`),
        db.execute(sql`
          SELECT hpe.*, e."nomeCompleto", e.funcao, e."codigoInterno"
          FROM he_period_employees hpe
          LEFT JOIN employees e ON e.id = hpe."employeeId"
          WHERE hpe."hePeriodId" = ${input.hePeriodId}
          ORDER BY e."nomeCompleto"
        `),
      ]);
      const period = ((periodRows as any).rows || [])[0] || null;
      const employees = (empRows as any).rows || [];
      return { period, employees };
    }),

  // Calculate HE for a period — with overlap detection
  calcularHE: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      dataInicio: z.string(), // YYYY-MM-DD
      dataFim: z.string(),    // YYYY-MM-DD
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // --- OVERLAP CHECK ---
      const overlap = ((await db.execute(sql`
        SELECT id, "dataInicio", "dataFim", status FROM he_periods
        WHERE "companyId" = ${input.companyId}
          AND status != 'cancelado'
          AND "dataInicio" <= ${input.dataFim}::date
          AND "dataFim"   >= ${input.dataInicio}::date
        LIMIT 1
      `)) as any).rows || [];
      if (overlap.length > 0) {
        const ov = overlap[0];
        const di = String(ov.dataInicio).slice(0, 10);
        const df = String(ov.dataFim).slice(0, 10);
        throw new TRPCError({
          code: "CONFLICT",
          message: `Sobreposição detectada com período já registrado: ${di} → ${df} (status: ${ov.status}). Cancele o período existente antes de recalcular.`,
        });
      }

      const criteria = await getHECriteria(db, input.companyId);
      const { heUtilMap, heFimMap, heMap, empMeta } = await computeHEForPeriod(
        db, input.companyId, input.dataInicio, input.dataFim, criteria.cargaHorariaDiaria
      );

      // Get salary info for all employees with HE
      const empIds = Array.from(heMap.keys());
      if (empIds.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma hora extra encontrada no período informado." });
      }

      const empRows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", "valorHora", "salarioBase", "horasMensais", funcao
        FROM employees
        WHERE id IN (${sql.join(empIds.map(id => sql`${id}`), sql`,`)})
      `)) as any).rows || [];
      const empDataMap = new Map<number, any>();
      for (const e of empRows) empDataMap.set(Number(e.id), e);

      // Calculate values
      const empResults: any[] = [];
      let totalHEMins = 0;
      let totalValorHE = 0;

      for (const empId of empIds) {
        const emp = empDataMap.get(empId);
        if (!emp) continue;
        const valorHora = parseBRL(String(emp.valorHora || emp.salarioBase || "0")) || 0;
        const heUtil = heUtilMap.get(empId) || 0;
        const heFim  = heFimMap.get(empId)  || 0;
        const heTotal = heMap.get(empId) || 0;
        const valorHEUtil = (heUtil / 60) * valorHora * (1 + criteria.hePercentualDiurna / 100);
        const valorHEFim  = (heFim  / 60) * valorHora * (1 + criteria.hePercentualDomingo / 100);
        const valorHETotal = valorHEUtil + valorHEFim;

        totalHEMins  += heTotal;
        totalValorHE += valorHETotal;

        empResults.push({
          empId,
          nome: emp.nomeCompleto,
          heUtil, heFim, heTotal,
          valorHEUtil: parseFloat(valorHEUtil.toFixed(2)),
          valorHEFim:  parseFloat(valorHEFim.toFixed(2)),
          valorHETotal: parseFloat(valorHETotal.toFixed(2)),
          salarioBruto: parseFloat(String(emp.salarioBase || "0")),
          valorHora,
        });
      }

      // Create he_period record
      const periodResult = ((await db.execute(sql`
        INSERT INTO he_periods ("companyId", "mesReferencia", "dataInicio", "dataFim", status,
          "totalFuncionarios", "totalHEMins", "totalValorHE", "criadoPor")
        VALUES (${input.companyId}, ${input.mesReferencia}, ${input.dataInicio}::date, ${input.dataFim}::date,
          'calculado', ${empResults.length}, ${totalHEMins}, ${parseFloat(totalValorHE.toFixed(2))},
          ${ctx.user.name || "Sistema"})
        RETURNING id
      `)) as any).rows || [];
      const hePeriodId = Number(periodResult[0]?.id);
      if (!hePeriodId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar registro de período HE." });

      // Insert employees
      if (empResults.length > 0) {
        const empInsertRows = empResults.map(e => sql`(
          ${hePeriodId}, ${input.companyId}, ${e.empId}, ${e.nome},
          ${e.heUtil}, ${e.heFim}, ${e.heTotal},
          ${e.valorHEUtil}, ${e.valorHEFim}, ${e.valorHETotal},
          ${e.salarioBruto}, ${e.valorHora}
        )`);
        await db.execute(sql`
          INSERT INTO he_period_employees
            ("hePeriodId", "companyId", "employeeId", nome,
             "heUtilMins", "heFimMins", "heTotalMins",
             "valorHEUtil", "valorHEFim", "valorHETotal",
             "salarioBruto", "valorHora")
          VALUES ${sql.join(empInsertRows, sql`,`)}
        `);
      }

      return {
        hePeriodId,
        totalFuncionarios: empResults.length,
        totalHEMins,
        totalValorHE: parseFloat(totalValorHE.toFixed(2)),
        periodo: { dataInicio: input.dataInicio, dataFim: input.dataFim },
        message: `HE calculada: ${empResults.length} funcionários com hora extra, total R$ ${totalValorHE.toFixed(2)}`,
      };
    }),

  // Aprovar HE period
  aprovar: protectedProcedure
    .input(z.object({ hePeriodId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE he_periods
        SET status = 'aprovado', "aprovadoPor" = ${ctx.user.name || "Sistema"}, "aprovadoEm" = NOW()
        WHERE id = ${input.hePeriodId} AND "companyId" = ${input.companyId}
      `);
      return { ok: true };
    }),

  // Marcar como pago
  marcarPago: protectedProcedure
    .input(z.object({ hePeriodId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE he_periods
        SET status = 'pago', "pagoPor" = ${ctx.user.name || "Sistema"}, "pagoEm" = NOW()
        WHERE id = ${input.hePeriodId} AND "companyId" = ${input.companyId}
          AND status = 'aprovado'
      `);
      return { ok: true };
    }),

  // Cancelar HE period (allows recalculation)
  cancelar: protectedProcedure
    .input(z.object({ hePeriodId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE he_periods
        SET status = 'cancelado'
        WHERE id = ${input.hePeriodId} AND "companyId" = ${input.companyId}
          AND status != 'pago'
      `);
      return { ok: true };
    }),
});
