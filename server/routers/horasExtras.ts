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
  // Agrupa por (employeeId, data) pegando o maior horasTrabalhadas — evita dupla contagem de importações.
  // Também traz `atrasos` para descontar do HE bruto antes do pagamento (saldo líquido).
  const trRaws = ((await db.execute(sql`
    SELECT DISTINCT ON (tr."employeeId", tr.data)
           tr."employeeId", tr.data, tr."horasTrabalhadas", tr.atrasos,
           e."jornadaTrabalho", e."nomeCompleto", e."valorHora", e."salarioBase", e."horasMensais"
    FROM time_records tr
    JOIN employees e ON e.id = tr."employeeId"
    WHERE tr."companyId" = ${companyId}
      AND tr.data >= ${dataInicio}::date
      AND tr.data <= ${dataFim}::date
      AND (
        (tr."horasTrabalhadas" IS NOT NULL AND tr."horasTrabalhadas" != '' AND tr."horasTrabalhadas" != '0:00')
        OR (tr.atrasos IS NOT NULL AND tr.atrasos != '' AND tr.atrasos != '0:00')
      )
    ORDER BY tr."employeeId", tr.data, tr."horasTrabalhadas" DESC
  `)) as any).rows || [];

  // Maps brutos (antes do desconto de atrasos)
  const heUtilGross = new Map<number, number>();
  const heFimGross  = new Map<number, number>();
  const heGross     = new Map<number, number>();
  const atrasoMap   = new Map<number, number>();
  const empMeta     = new Map<number, { nome: string; valorHora: number; salario: number }>();

  for (const r of trRaws) {
    const empId    = Number(r.employeeId);
    const trabMins = parseTime(String(r.horasTrabalhadas || "0:00")) || 0;
    const atrasoMins = parseTime(String(r.atrasos || "0:00")) || 0;
    const dateStr = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data).slice(0, 10);
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();

    if (atrasoMins > 0) {
      atrasoMap.set(empId, (atrasoMap.get(empId) || 0) + atrasoMins);
    }

    if (trabMins > 0) {
      const expectedMins = getExpectedMins(r.jornadaTrabalho, dateStr, cargaHorariaDiaria);
      const heMins = Math.max(0, trabMins - expectedMins);
      if (heMins > 0) {
        // Apenas domingo (0) → HE 100%. Sábado (6) e dias úteis → HE 60%
        if (dow === 0) heFimGross.set(empId,  (heFimGross.get(empId)  || 0) + heMins);
        else            heUtilGross.set(empId, (heUtilGross.get(empId) || 0) + heMins);
        heGross.set(empId, (heGross.get(empId) || 0) + heMins);
      }
    }

    if (!empMeta.has(empId)) {
      const vhStr = r.valorHora || r.salarioBase || "0";
      empMeta.set(empId, {
        nome: r.nomeCompleto || "",
        valorHora: parseBRL(String(vhStr)) || 0,
        salario: 0,
      });
    }
  }

  // ====================================================================
  // NETTING: descontar atrasos do HE bruto, com rateio proporcional
  // entre HE útil (sáb + dias úteis) e HE fim de semana (domingo).
  // Lógica: o saldo a pagar é max(0, HE_total − Atrasos_total).
  // Se o atraso zerar todo o HE, ambos os mapas ficam em 0.
  // Se houver sobra de atraso (atraso > HE), a sobra é descontada como
  // atraso normal na folha (não nos interessa aqui — o HE só pode ser ≥ 0).
  // ====================================================================
  const heUtilMap = new Map<number, number>();
  const heFimMap  = new Map<number, number>();
  const heMap     = new Map<number, number>();
  const atrasoDescontadoMap = new Map<number, number>();

  const allEmpIds = new Set<number>([...heGross.keys(), ...atrasoMap.keys()]);
  for (const empId of allEmpIds) {
    const grossUtil = heUtilGross.get(empId) || 0;
    const grossFim  = heFimGross.get(empId)  || 0;
    const gross     = grossUtil + grossFim;
    const atraso    = atrasoMap.get(empId)   || 0;

    if (gross <= 0) {
      // sem HE: nada a pagar
      continue;
    }

    const desconto = Math.min(gross, atraso);
    const net = gross - desconto;
    atrasoDescontadoMap.set(empId, desconto);

    if (desconto === 0) {
      heUtilMap.set(empId, grossUtil);
      heFimMap.set(empId, grossFim);
      heMap.set(empId, gross);
    } else if (net === 0) {
      // tudo descontado
      heUtilMap.set(empId, 0);
      heFimMap.set(empId, 0);
      heMap.set(empId, 0);
    } else {
      // rateio proporcional
      const ratio = net / gross;
      const netUtil = Math.round(grossUtil * ratio);
      const netFim  = Math.max(0, net - netUtil);
      heUtilMap.set(empId, netUtil);
      heFimMap.set(empId, netFim);
      heMap.set(empId, netUtil + netFim);
    }
  }

  return { heUtilMap, heFimMap, heMap, empMeta, heUtilGross, heFimGross, heGross, atrasoMap, atrasoDescontadoMap };
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

  memorialCalculo: protectedProcedure
    .input(z.object({ hePeriodId: z.number(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const periodRows = ((await db.execute(sql`SELECT * FROM he_periods WHERE id = ${input.hePeriodId} LIMIT 1`)) as any).rows || [];
      if (!periodRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Período não encontrado" });
      const period = periodRows[0];

      const criteria = await getHECriteria(db, Number(period.companyId));

      const empRows = ((await db.execute(sql`
        SELECT "nomeCompleto", "valorHora", "salarioBase", "jornadaTrabalho"
        FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `)) as any).rows || [];
      if (!empRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
      const emp = empRows[0];
      const valorHora = parseBRL(String(emp.valorHora || emp.salarioBase || "0")) || 0;

      const trRows = ((await db.execute(sql`
        SELECT DISTINCT ON (data)
          data, "horasTrabalhadas", atrasos, entrada1, saida1, entrada2, saida2, fonte
        FROM time_records
        WHERE "employeeId" = ${input.employeeId}
          AND "companyId" = ${Number(period.companyId)}
          AND data >= ${period.dataInicio}::date
          AND data <= ${period.dataFim}::date
          AND (
            ("horasTrabalhadas" IS NOT NULL AND "horasTrabalhadas" != '' AND "horasTrabalhadas" != '0:00')
            OR (atrasos IS NOT NULL AND atrasos != '' AND atrasos != '0:00')
          )
        ORDER BY data, "horasTrabalhadas" DESC
      `)) as any).rows || [];

      const dias: any[] = [];
      const diasAtraso: any[] = [];
      let totalHEUtilGrossMins = 0;
      let totalHEFimGrossMins = 0;
      let totalAtrasoMins = 0;

      for (const r of trRows) {
        const trabMins = parseTime(String(r.horasTrabalhadas || "0:00")) || 0;
        const atrasoMins = parseTime(String(r.atrasos || "0:00")) || 0;
        const dateStr = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data).slice(0, 10);
        const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
        const expectedMins = getExpectedMins(emp.jornadaTrabalho, dateStr, criteria.cargaHorariaDiaria);
        const heMins = trabMins > 0 ? Math.max(0, trabMins - expectedMins) : 0;

        if (atrasoMins > 0) {
          totalAtrasoMins += atrasoMins;
          diasAtraso.push({
            data: dateStr,
            diaSemana: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][dow],
            trabalhado: r.horasTrabalhadas || "0:00",
            jornada: `${Math.floor(expectedMins / 60)}:${String(expectedMins % 60).padStart(2, "0")}`,
            atrasoMins,
            horarios: `${r.entrada1 || "--:--"}-${r.saida1 || "--:--"} ${r.entrada2 || "--:--"}-${r.saida2 || "--:--"}`,
            fonte: r.fonte || "",
          });
        }

        if (heMins <= 0) continue;

        const isDomingo = dow === 0;
        const percentual = isDomingo ? criteria.hePercentualDomingo : criteria.hePercentualDiurna;
        const fator = 1 + percentual / 100;
        const valorDia = parseFloat(((heMins / 60) * valorHora * fator).toFixed(2));

        if (isDomingo) totalHEFimGrossMins += heMins;
        else totalHEUtilGrossMins += heMins;

        dias.push({
          data: dateStr,
          diaSemana: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][dow],
          trabalhado: r.horasTrabalhadas,
          jornada: `${Math.floor(expectedMins / 60)}:${String(expectedMins % 60).padStart(2, "0")}`,
          heMins,
          percentual,
          fator,
          valorDia,
          horarios: `${r.entrada1 || "--:--"}-${r.saida1 || "--:--"} ${r.entrada2 || "--:--"}-${r.saida2 || "--:--"}`,
          fonte: r.fonte || "",
        });
      }

      const totalHEGrossMins = totalHEUtilGrossMins + totalHEFimGrossMins;
      // Netting: HE líquido = max(0, HE bruto - atrasos), com rateio proporcional
      const descontoMins = Math.min(totalHEGrossMins, totalAtrasoMins);
      const totalHENetMins = totalHEGrossMins - descontoMins;
      let totalHEUtilMins = totalHEUtilGrossMins;
      let totalHEFimMins = totalHEFimGrossMins;
      if (descontoMins > 0 && totalHEGrossMins > 0) {
        if (totalHENetMins === 0) {
          totalHEUtilMins = 0;
          totalHEFimMins = 0;
        } else {
          const ratio = totalHENetMins / totalHEGrossMins;
          totalHEUtilMins = Math.round(totalHEUtilGrossMins * ratio);
          totalHEFimMins = Math.max(0, totalHENetMins - totalHEUtilMins);
        }
      }
      const valorTotalUtil = parseFloat(((totalHEUtilMins / 60) * valorHora * (1 + criteria.hePercentualDiurna / 100)).toFixed(2));
      const valorTotalFim = parseFloat(((totalHEFimMins / 60) * valorHora * (1 + criteria.hePercentualDomingo / 100)).toFixed(2));

      return {
        nome: emp.nomeCompleto,
        valorHora,
        percentualUtil: criteria.hePercentualDiurna,
        percentualFim: criteria.hePercentualDomingo,
        cargaHorariaDiaria: criteria.cargaHorariaDiaria,
        periodo: `${period.dataInicio}`.slice(0, 10) + " a " + `${period.dataFim}`.slice(0, 10),
        dias,
        diasAtraso,
        totalHEUtilGrossMins,
        totalHEFimGrossMins,
        totalHEGrossMins,
        totalAtrasoMins,
        descontoAtrasoMins: descontoMins,
        totalHEUtilMins,
        totalHEFimMins,
        totalHEMins: totalHENetMins,
        valorTotalUtil,
        valorTotalFim,
        valorTotal: parseFloat((valorTotalUtil + valorTotalFim).toFixed(2)),
      };
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

      // --- GUARD: block recalculation if HE is consolidated ---
      const ppCheck = ((await db.execute(sql`
        SELECT "heConsolidadoEm" FROM payroll_periods
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (ppCheck.length > 0 && ppCheck[0].heConsolidadoEm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "HE consolidada — desconsolide primeiro para recalcular.",
        });
      }

      // --- CHECK: only 1 active period per mesReferencia ---
      const existing = ((await db.execute(sql`
        SELECT id, "dataInicio", "dataFim", status FROM he_periods
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND status NOT IN ('cancelado')
      `)) as any).rows || [];

      let existingPeriodId: number | null = null;
      if (existing.length > 0) {
        const approved = existing.find((r: any) => r.status === 'aprovado');
        if (approved) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Já existe um período aprovado para ${input.mesReferencia}. Não é possível recalcular.`,
          });
        }
        const calculado = existing.find((r: any) => r.status === 'calculado');
        if (calculado) {
          existingPeriodId = Number(calculado.id);
        }
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

        if (valorHETotal <= 0) continue;

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

      let hePeriodId: number;

      if (existingPeriodId) {
        await db.execute(sql`
          UPDATE he_periods SET
            "dataInicio" = ${input.dataInicio}::date,
            "dataFim" = ${input.dataFim}::date,
            "totalFuncionarios" = ${empResults.length},
            "totalHEMins" = ${totalHEMins},
            "totalValorHE" = ${parseFloat(totalValorHE.toFixed(2))},
            "criadoPor" = ${ctx.user.name || "Sistema"},
            "criadoEm" = NOW()
          WHERE id = ${existingPeriodId} AND "companyId" = ${input.companyId}
        `);
        await db.execute(sql`
          DELETE FROM he_period_employees
          WHERE "hePeriodId" = ${existingPeriodId} AND "companyId" = ${input.companyId}
        `);
        hePeriodId = existingPeriodId;
      } else {
        const periodResult = ((await db.execute(sql`
          INSERT INTO he_periods ("companyId", "mesReferencia", "dataInicio", "dataFim", status,
            "totalFuncionarios", "totalHEMins", "totalValorHE", "criadoPor")
          VALUES (${input.companyId}, ${input.mesReferencia}, ${input.dataInicio}::date, ${input.dataFim}::date,
            'calculado', ${empResults.length}, ${totalHEMins}, ${parseFloat(totalValorHE.toFixed(2))},
            ${ctx.user.name || "Sistema"})
          RETURNING id
        `)) as any).rows || [];
        hePeriodId = Number(periodResult[0]?.id);
        if (!hePeriodId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar registro de período HE." });
      }

      const destPadraoRows = ((await db.execute(sql`
        SELECT "heDestinoPadrao" FROM companies WHERE id = ${input.companyId}
      `)) as any).rows || [];
      const destinoPadrao = (destPadraoRows[0]?.heDestinoPadrao as string) || "pagamento";

      if (empResults.length > 0) {
        const empInsertRows = empResults.map(e => sql`(
          ${hePeriodId}, ${input.companyId}, ${e.empId}, ${e.nome},
          ${e.heUtil}, ${e.heFim}, ${e.heTotal},
          ${e.valorHEUtil}, ${e.valorHEFim}, ${e.valorHETotal},
          ${e.salarioBruto}, ${e.valorHora}, ${destinoPadrao}
        )`);
        await db.execute(sql`
          INSERT INTO he_period_employees
            ("hePeriodId", "companyId", "employeeId", nome,
             "heUtilMins", "heFimMins", "heTotalMins",
             "valorHEUtil", "valorHEFim", "valorHETotal",
             "salarioBruto", "valorHora", destinacao)
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

  deletarCancelado: protectedProcedure
    .input(z.object({ hePeriodId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas ADM Master pode excluir períodos de HE.' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      // Verifica se está cancelado antes de deletar
      const rows = ((await db.execute(sql`
        SELECT id, status FROM he_periods WHERE id = ${input.hePeriodId} AND "companyId" = ${input.companyId}
      `)) as any).rows || [];
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período não encontrado.' });
      if (rows[0].status !== 'cancelado') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas períodos com status "cancelado" podem ser excluídos.' });
      }
      // Deleta funcionários vinculados e depois o período
      await db.execute(sql`DELETE FROM he_period_employees WHERE "hePeriodId" = ${input.hePeriodId}`);
      await db.execute(sql`DELETE FROM he_periods WHERE id = ${input.hePeriodId} AND "companyId" = ${input.companyId}`);
      return { ok: true };
    }),

  // ============================================================
  // ESPELHO DE PONTO — Rev.645
  // ============================================================

  // List active employees for autocomplete
  listarFuncionariosParaPonto: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const ids = resolveCompanyIds(input);
      const rows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "codigoInterno", cpf
        FROM employees
        WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND (status IS NULL OR status = 'ativo')
        ORDER BY "nomeCompleto" ASC
      `)) as any).rows || [];
      return rows;
    }),

  // Get espelho de ponto for a custom date range (any period, not month-locked)
  getEspelhoPontoRange: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ids = resolveCompanyIds(input);

      // Get employee info
      const empRows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "codigoInterno", cpf, "salarioBase", "valorHora", "horasMensais",
               "heNormal50", "he100", "heFeriado", "heNoturna", status, "dataDesligamentoEfetiva"
        FROM employees
        WHERE id = ${input.employeeId}
          AND "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
      `)) as any).rows || [];
      const emp = empRows[0];
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

      // Check if employee has active aviso prévio
      const avisoRows = ((await db.execute(sql`
        SELECT id, tipo, "dataInicio", "dataFim", "diasAviso", status
        FROM termination_notices
        WHERE "employeeId" = ${input.employeeId}
          AND status = 'em_andamento'
          AND "deletedAt" IS NULL
        ORDER BY "dataInicio" DESC
        LIMIT 1
      `)) as any).rows || [];
      const avisoPrevio = avisoRows[0] || null;

      // Check vacation periods overlapping with the requested range
      const feriaRows = ((await db.execute(sql`
        SELECT "dataInicio", "dataFim", "periodo2Inicio", "periodo2Fim", "periodo3Inicio", "periodo3Fim", status
        FROM vacation_periods
        WHERE "employeeId" = ${input.employeeId}
          AND "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND status NOT IN ('cancelada', 'pendente')
          AND (
            ("dataInicio" IS NOT NULL AND "dataFim" IS NOT NULL AND "dataInicio" <= ${input.dataFim} AND "dataFim" >= ${input.dataInicio})
            OR ("periodo2Inicio" IS NOT NULL AND "periodo2Fim" IS NOT NULL AND "periodo2Inicio" <= ${input.dataFim} AND "periodo2Fim" >= ${input.dataInicio})
            OR ("periodo3Inicio" IS NOT NULL AND "periodo3Fim" IS NOT NULL AND "periodo3Inicio" <= ${input.dataFim} AND "periodo3Fim" >= ${input.dataInicio})
          )
      `)) as any).rows || [];

      // Build Set of vacation date strings (YYYY-MM-DD) within the requested range
      const feriasDates = new Set<string>();
      for (const vp of feriaRows) {
        const ranges = [
          [vp.dataInicio, vp.dataFim],
          [vp.periodo2Inicio, vp.periodo2Fim],
          [vp.periodo3Inicio, vp.periodo3Fim],
        ];
        for (const [ini, fim] of ranges) {
          if (!ini || !fim) continue;
          const start = new Date(String(ini) + "T12:00:00Z");
          const end   = new Date(String(fim) + "T12:00:00Z");
          const rangeStart = new Date(input.dataInicio + "T12:00:00Z");
          const rangeEnd   = new Date(input.dataFim   + "T12:00:00Z");
          for (let d = new Date(Math.max(start.getTime(), rangeStart.getTime())); d <= new Date(Math.min(end.getTime(), rangeEnd.getTime())); d.setUTCDate(d.getUTCDate() + 1)) {
            feriasDates.add(d.toISOString().slice(0, 10));
          }
        }
      }

      // Get time records with deduplication (best record per day)
      const records = ((await db.execute(sql`
        SELECT DISTINCT ON (tr.data)
          tr.id, tr.data, tr."entrada1", tr."saida1", tr."entrada2", tr."saida2",
          tr."entrada3", tr."saida3", tr."horasTrabalhadas", tr."horasExtras",
          tr."horasNoturnas", tr.faltas, tr.atrasos, tr.justificativa, tr.fonte,
          tr."ajusteManual", tr."ajustadoPor", tr."batidasBrutas", tr."obraId",
          o.nome as "obraNome"
        FROM time_records tr
        LEFT JOIN obras o ON tr."obraId" = o.id
        WHERE tr."companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND tr."employeeId" = ${input.employeeId}
          AND tr.data >= ${input.dataInicio}::date
          AND tr.data <= ${input.dataFim}::date
        ORDER BY tr.data ASC, tr."horasTrabalhadas" DESC NULLS LAST, tr."ajusteManual" DESC NULLS LAST
      `)) as any).rows || [];

      // Build record map keyed by date string
      // For weekend days (sab=6, dom=0): ALL worked hours = hora extra
      const parseHHMM = (s: string | null | undefined): number => {
        if (!s || s === "0:00" || s === "") return 0;
        const p = s.split(":").map(Number);
        return (p[0] || 0) * 60 + (p[1] || 0);
      };
      const minsToHHMM = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

      const recordMap: Record<string, any> = {};
      for (const r of records) {
        const dateStr = String(r.data).slice(0, 10);
        const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
        const isWeekend = dow === 0 || dow === 6;
        if (isWeekend) {
          const trabMins = parseHHMM(r.horasTrabalhadas);
          r.horasExtras = trabMins > 0 ? minsToHHMM(trabMins) : "0:00";
        }
        recordMap[dateStr] = r;
      }

      // Compute summary stats
      let diasTrabalhados = 0;
      let totalHEMins = 0;
      let totalFaltaMins = 0;
      let totalAtrasoMins = 0;

      for (const r of records) {
        if (r.horasTrabalhadas && r.horasTrabalhadas !== "0:00" && r.horasTrabalhadas !== "") diasTrabalhados++;
        totalHEMins += parseHHMM(r.horasExtras);
        totalFaltaMins += parseHHMM(r.faltas);
        totalAtrasoMins += parseHHMM(r.atrasos);
      }

      return {
        employee: emp,
        records: recordMap,
        summary: { diasTrabalhados, totalHEMins, totalFaltaMins, totalAtrasoMins, totalRegistros: records.length },
        feriasDates: Array.from(feriasDates),
        avisoPrevio: avisoPrevio ? {
          tipo: avisoPrevio.tipo,
          dataInicio: String(avisoPrevio.dataInicio).slice(0, 10),
          dataFim: String(avisoPrevio.dataFim).slice(0, 10),
          diasAviso: avisoPrevio.diasAviso,
        } : null,
      };
    }),

  // ============================================================
  // BANCO DE HORAS — Rev.644
  // ============================================================

  // Set destinacao for a single employee in a period
  setDestinacao: protectedProcedure
    .input(z.object({
      hePeriodEmployeeId: z.number(),
      destinacao: z.enum(["pagamento", "banco_horas"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE he_period_employees
        SET destinacao = ${input.destinacao}
        WHERE id = ${input.hePeriodEmployeeId}
      `);
      return { ok: true };
    }),

  // Set destinacao for all employees in a period (mass action)
  setDestinacaoMassa: protectedProcedure
    .input(z.object({
      hePeriodId: z.number(),
      destinacao: z.enum(["pagamento", "banco_horas"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE he_period_employees
        SET destinacao = ${input.destinacao}
        WHERE "hePeriodId" = ${input.hePeriodId}
      `);
      return { ok: true };
    }),

  // Approve period and process banco de horas (merged approval + destinacao)
  aprovarComDestinacao: protectedProcedure
    .input(z.object({ hePeriodId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const periodRows = ((await db.execute(sql`
        SELECT * FROM he_periods WHERE id = ${input.hePeriodId} AND "companyId" = ${input.companyId}
      `)) as any).rows || [];
      const period = periodRows[0];
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Período não encontrado" });
      if (period.status !== "calculado") throw new TRPCError({ code: "BAD_REQUEST", message: "Período já foi aprovado ou cancelado" });

      const empRows = ((await db.execute(sql`
        SELECT * FROM he_period_employees WHERE "hePeriodId" = ${input.hePeriodId}
      `)) as any).rows || [];

      let bancoCreditados = 0;
      let pagamentos = 0;
      const dataFimStr = String(period.dataFim).slice(0, 10);
      const dataInicioStr = String(period.dataInicio).slice(0, 10);

      for (const emp of empRows) {
        if (emp.destinacao === "banco_horas") {
          const mins = Number(emp.heTotalMins || 0);
          if (mins <= 0) continue;
          const minutosBase = mins;
          const minutosAcrescimo = 0;
          const totalComAcrescimo = minutosBase + minutosAcrescimo;
          await db.execute(sql`
            INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
            VALUES (${emp.employeeId}, ${input.companyId}, ${totalComAcrescimo}, NOW())
            ON CONFLICT ("employeeId", "companyId") DO UPDATE SET
              "saldoMinutos" = banco_horas_saldo."saldoMinutos" + EXCLUDED."saldoMinutos",
              "atualizadoEm" = NOW()
          `);
          const descricao = `Crédito HE ${dataInicioStr} → ${dataFimStr}`;
          await db.execute(sql`
            INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", "hePeriodId", tipo, minutos, "minutosBase", "minutosAcrescimo", descricao, data, "criadoPor")
            VALUES (${emp.employeeId}, ${input.companyId}, ${input.hePeriodId}, 'credito', ${totalComAcrescimo},
              ${minutosBase}, ${minutosAcrescimo},
              ${descricao}, ${dataFimStr}::date, ${ctx.user.name || "Sistema"})
          `);
          bancoCreditados++;
        } else {
          pagamentos++;
        }
      }

      await db.execute(sql`
        UPDATE he_periods
        SET status = 'aprovado', "aprovadoPor" = ${ctx.user.name || "Sistema"}, "aprovadoEm" = NOW()
        WHERE id = ${input.hePeriodId}
      `);

      return {
        ok: true,
        bancoCreditados,
        pagamentos,
        message: `Período aprovado: ${pagamentos} para pagamento · ${bancoCreditados} creditados no banco de horas`,
      };
    }),

  // Get banco de horas balances for all employees in a company
  getSaldoBanco: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = ((await db.execute(sql`
        SELECT bhs.*, e."nomeCompleto", e.funcao,
          (SELECT MAX(bhl."criadoEm") FROM banco_horas_lancamentos bhl
           WHERE bhl."employeeId" = bhs."employeeId" AND bhl."companyId" = bhs."companyId") as "ultimoLancamento"
        FROM banco_horas_saldo bhs
        JOIN employees e ON e.id = bhs."employeeId"
        WHERE bhs."companyId" = ${input.companyId} AND bhs."saldoMinutos" > 0
        ORDER BY bhs."saldoMinutos" DESC
      `)) as any).rows || [];
      return rows;
    }),

  // Get lancamentos history for a specific employee
  getLancamentos: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = ((await db.execute(sql`
        SELECT * FROM banco_horas_lancamentos
        WHERE "employeeId" = ${input.employeeId} AND "companyId" = ${input.companyId}
        ORDER BY data DESC, "criadoEm" DESC
        LIMIT 50
      `)) as any).rows || [];
      return rows;
    }),

  // Debit hours from banco de horas (compensatory day off)
  debitarBanco: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      minutos: z.number().positive(),
      descricao: z.string().min(3),
      data: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const saldoRows = ((await db.execute(sql`
        SELECT "saldoMinutos" FROM banco_horas_saldo
        WHERE "employeeId" = ${input.employeeId} AND "companyId" = ${input.companyId}
      `)) as any).rows || [];
      const saldo = Number(saldoRows[0]?.saldoMinutos || 0);
      if (saldo < input.minutos) {
        const h = Math.floor(saldo / 60);
        const m = String(saldo % 60).padStart(2, "0");
        throw new TRPCError({ code: "BAD_REQUEST", message: `Saldo insuficiente: ${h}h${m} disponível` });
      }

      await db.execute(sql`
        UPDATE banco_horas_saldo
        SET "saldoMinutos" = "saldoMinutos" - ${input.minutos}, "atualizadoEm" = NOW()
        WHERE "employeeId" = ${input.employeeId} AND "companyId" = ${input.companyId}
      `);
      await db.execute(sql`
        INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", tipo, minutos, descricao, data, "criadoPor")
        VALUES (${input.employeeId}, ${input.companyId}, 'debito', ${input.minutos},
          ${input.descricao}, ${input.data}::date, ${ctx.user.name || "Sistema"})
      `);
      return { ok: true };
    }),

  // Get expiry alerts (credits older than N months with saldo > 0)
  getAlertasExpiracao: protectedProcedure
    .input(z.object({ companyId: z.number(), mesesValidade: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const meses = input.mesesValidade ?? 12;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - meses);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const rows = ((await db.execute(sql`
        SELECT bhl."employeeId", e."nomeCompleto", bhs."saldoMinutos",
          MIN(bhl.data) as "creditoMaisAntigo"
        FROM banco_horas_lancamentos bhl
        JOIN employees e ON e.id = bhl."employeeId"
        JOIN banco_horas_saldo bhs ON bhs."employeeId" = bhl."employeeId" AND bhs."companyId" = bhl."companyId"
        WHERE bhl."companyId" = ${input.companyId}
          AND bhl.tipo = 'credito'
          AND bhl.data < ${cutoffStr}::date
          AND bhs."saldoMinutos" > 0
        GROUP BY bhl."employeeId", e."nomeCompleto", bhs."saldoMinutos"
        ORDER BY MIN(bhl.data) ASC
      `)) as any).rows || [];
      return rows;
    }),

  getHeDestinoPadrao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return "banco_horas";
      const rows = ((await db.execute(sql`
        SELECT "heDestinoPadrao" FROM companies WHERE id = ${input.companyId}
      `)) as any).rows || [];
      return (rows[0]?.heDestinoPadrao as string) || "banco_horas";
    }),

  setHeDestinoPadrao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      destino: z.enum(["pagamento", "banco_horas"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE companies SET "heDestinoPadrao" = ${input.destino} WHERE id = ${input.companyId}
      `);
      return { ok: true, destino: input.destino };
    }),
});
