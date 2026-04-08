import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employees, timeRecords, systemCriteria, obras, heSolicitacoes, vrBenefits, advances, vacationPeriods } from "../../drizzle/schema";
import { eq, and, sql, between, inArray, isNull } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";
import { gerarCnab240 } from "./cnab240";

// ============================================================
// HELPERS
// ============================================================
function formatMoney(val: number): string {
  return val.toFixed(2);
}
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

// Calculates the expected NET work minutes for a given day based on the employee's
// Extract expected entry time in minutes from jornadaTrabalho JSON for a given date.
// Returns 7*60 (07:00) as fallback if jornada is absent or doesn't have entry for that day.
function getExpectedEntrada(jornadaTrabalho: string | null | undefined, dateStr: string): number {
  if (!jornadaTrabalho) return 7 * 60;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return 7 * 60;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const day = parsed[dayKey];
    if (!day?.entrada) return 7 * 60;
    const [h, m] = day.entrada.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  } catch { return 7 * 60; }
}

// jornadaTrabalho JSON. Returns cargaHorariaDiaria*60 as fallback if jornada is absent.
// horasTrabalhadas = sum of punch intervals (gaps like lunch are excluded), so
// expectedMins must also exclude the lunch break (intervalo).
function getExpectedMins(jornadaTrabalho: string | null | undefined, dateStr: string, cargaHorariaDiaria: number): number {
  if (!jornadaTrabalho) return cargaHorariaDiaria * 60;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return cargaHorariaDiaria * 60;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const day = parsed[dayKey];
    if (!day?.entrada || !day?.saida) return 0; // non-working day per jornada
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    let expectedMins = toMins(day.saida) - toMins(day.entrada);
    if (day.intervalo) {
      const [ih, im] = day.intervalo.split(":").map(Number);
      expectedMins -= (ih || 0) * 60 + (im || 0); // subtract lunch break
    }
    return Math.max(0, expectedMins);
  } catch { return cargaHorariaDiaria * 60; }
}

// Get business days in a month (Mon-Sat, excluding Sundays)
function getDiasUteisNoMes(year: number, month: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) count++; // Exclude Sundays only (construction workers work Saturdays)
  }
  return count;
}

// Get the Nth business day of a month
function getNthBusinessDay(year: number, month: number, n: number): string {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) { // Mon-Fri for payment
      count++;
      if (count === n) {
        return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
}

// Get all dates in a range
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().substring(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

// Parse month reference to year and month
function calcularINSS(salarioMensal: number): number {
  const faixas = [
    { teto: 1412.00, aliquota: 0.075 },
    { teto: 2666.68, aliquota: 0.09 },
    { teto: 4000.03, aliquota: 0.12 },
    { teto: 7786.02, aliquota: 0.14 },
  ];
  let inss = 0;
  let anterior = 0;
  for (const f of faixas) {
    if (salarioMensal <= anterior) break;
    const base = Math.min(salarioMensal, f.teto) - anterior;
    inss += base * f.aliquota;
    anterior = f.teto;
  }
  return inss;
}

function calcularIRRF(baseIR: number, salarioBrutoMensal: number): number {
  const faixas = [
    { limite: 2428.80, aliquota: 0, deducao: 0 },
    { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
  ];
  let irrfBruto = 0;
  for (const f of faixas) {
    if (baseIR <= f.limite) {
      irrfBruto = Math.max(0, baseIR * f.aliquota - f.deducao);
      break;
    }
  }
  if (irrfBruto <= 0) return 0;
  let redutor = 0;
  if (salarioBrutoMensal <= 5000) {
    redutor = irrfBruto;
  } else if (salarioBrutoMensal <= 7350) {
    redutor = Math.max(0, 978.62 - (0.133145 * salarioBrutoMensal));
  }
  return Math.max(0, irrfBruto - redutor);
}

function parseMesRef(mesRef: string): { year: number; month: number } {
  const [y, m] = mesRef.split("-").map(Number);
  return { year: y, month: m };
}

// Get previous month reference
function getPrevMesRef(mesRef: string): string {
  const { year, month } = parseMesRef(mesRef);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

// Get next month reference
function getNextMesRef(mesRef: string): string {
  const { year, month } = parseMesRef(mesRef);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Get payroll criteria from systemCriteria table
// Maps the actual DB keys (system_criteria.chave) to the engine's internal names
async function getPayrollCriteria(db: any, companyId: number) {
  const rows = await db.select().from(systemCriteria).where(eq(systemCriteria.companyId, companyId));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.chave] = r.valor;
  return {
    // Ponto
    diaCorte: parseInt(map["ponto_dia_corte"] || "15"),
    pontoToleranciaAtraso: parseInt(map["ponto_tolerancia_atraso"] || "10"),
    pontoToleranciaSaida: parseInt(map["ponto_tolerancia_saida"] || "10"),
    pontoBatidaImparTolerancia: parseInt(map["ponto_batida_impar_tolerancia"] || "30"),
    pontoFaltaAposAtraso: parseInt(map["ponto_falta_apos_atraso"] || "120"),
    pontoHoraNoturnaReduzida: map["ponto_hora_noturna_reduzida"] || "52:30",
    // Folha
    percentualAdiantamento: parseInt(map["folha_percentual_adiantamento"] || "40"),
    diaAdiantamento: parseInt(map["folha_dia_vale"] || "20"),
    diaPagamento: parseInt(map["folha_dia_pagamento"] || "5"),
    descontoVrFalta: map["folha_desconto_vr_faltas"] !== "0",
    descontoVtFalta: map["folha_desconto_vt_faltas"] !== "0",
    bloquearConsolidacaoInconsistencias: map["folha_bloquear_consolidacao_inconsistencias"] === "1",
    // Jornada
    cargaHorariaDiaria: parseInt(map["jornada_horas_diarias"] || "8"),
    jornadaHorasSemanais: parseInt(map["jornada_horas_semanais"] || "44"),
    jornadaIntervaloAlmoco: parseInt(map["jornada_intervalo_almoco"] || "60"),
    jornadaSabadoTipo: map["jornada_sabado_tipo"] || "compensado",
    jornadaDescansoSemanal: parseInt(map["jornada_descanso_semanal"] || "1"),
    // Horas Extras
    hePercentualDiurna: parseFloat(map["he_dias_uteis"] || "60"),
    hePercentualNoturna: parseFloat(map["he_adicional_noturno"] || "20"),
    hePercentualDomingo: parseFloat(map["he_domingos_feriados"] || "100"),
    heInterjornada: parseFloat(map["he_interjornada"] || "50"),
    heLimiteMensal: parseInt(map["he_limite_mensal"] || "44"),
    heBancoHoras: map["he_banco_horas"] === "1",
    heNoturnoInicio: map["he_noturno_inicio"] || "22:00",
    heNoturnoFim: map["he_noturno_fim"] || "05:00",
    // Benefícios
    vtPercentualDesconto: parseFloat(map["ben_vt_percentual_desconto"] || "6"),
    diasUteisPadraoMes: parseInt(map["ben_dias_uteis_mes"] || "22"),
    vrValorDiario: parseFloat(map["ben_vr_valor_diario"] || "0"),
    // Advertências
    advValidadeMeses: parseInt(map["adv_validade_meses"] || "6"),
    advQtdParaSuspensao: parseInt(map["adv_qtd_para_suspensao"] || "3"),
    advDiasSuspensao: parseInt(map["adv_dias_suspensao"] || "3"),
    // Controle
    maxFaltasVale: parseInt(map["adiantamento_max_faltas"] || "5"),
    fecharNoEscuro: map["fechar_no_escuro"] !== "nao",
    // Conferência com Contabilidade: obrigatoria | recomendada | opcional
    conferenciaContabilidade: (map["folha_conferencia_contabilidade"] || "recomendada") as "obrigatoria" | "recomendada" | "opcional",
  };
}

// ============================================================
// Computes HE maps directly from time_records — no processarPonto needed.
// Returns heUtilMap (dias úteis), heFimMap (sáb/compensado/feriado), heMap (total).
// ============================================================
async function computeHEFromTimeRecords(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  mesReferencia: string,
  cargaHorariaDiaria: number
): Promise<{ heUtilMap: Map<number, number>; heFimMap: Map<number, number>; heMap: Map<number, number> }> {
  // time_records does NOT have tipoDia — derive day type from date's weekday
  const trRaws = ((await db.execute(sql`
    SELECT tr."employeeId", tr.data, tr."horasTrabalhadas", e."jornadaTrabalho"
    FROM time_records tr
    JOIN employees e ON e.id = tr."employeeId"
    WHERE tr."companyId" = ${companyId}
      AND tr."mesReferencia" = ${mesReferencia}
      AND tr."horasTrabalhadas" IS NOT NULL
      AND tr."horasTrabalhadas" != ''
      AND tr."horasTrabalhadas" != '0:00'
  `)) as any).rows || [];

  const heUtilMap = new Map<number, number>();
  const heFimMap = new Map<number, number>();
  const heMap = new Map<number, number>();

  for (const r of trRaws) {
    const empId = Number(r.employeeId);
    const trabMins = parseTime(String(r.horasTrabalhadas)) || 0;
    if (trabMins <= 0) continue;
    const dateStr = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data).slice(0, 10);
    // dow: 0=Sun, 1=Mon … 5=Fri, 6=Sat
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    // Sundays: not expected to work — skip
    if (dow === 0) continue;
    const expectedMins = getExpectedMins(r.jornadaTrabalho, dateStr, cargaHorariaDiaria);
    const heMins = Math.max(0, trabMins - expectedMins);
    if (heMins <= 0) continue;
    // Saturdays use the "fim de semana" (100%) rate; weekdays use the "util" (50%) rate
    if (dow === 6) {
      heFimMap.set(empId, (heFimMap.get(empId) || 0) + heMins);
    } else {
      heUtilMap.set(empId, (heUtilMap.get(empId) || 0) + heMins);
    }
    heMap.set(empId, (heMap.get(empId) || 0) + heMins);
  }

  return { heUtilMap, heFimMap, heMap };
}

export const payrollEngineRouter = router({
  // ============================================================
  // 1. ABRIR / LISTAR COMPETÊNCIAS
  // ============================================================
  listPeriods: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ano = input.ano || new Date().getFullYear();
      const rows = ((await db.execute(sql`
        SELECT * FROM payroll_periods 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" LIKE ${ano + '%'}
        ORDER BY "mesReferencia" DESC
      `)) as any).rows || [];
      return rows || [];
    }),

  getPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT * FROM payroll_periods 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      const period = rows[0];
      if (!period) return null;
      return period;
    }),

  openPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const diaCorte = criteria.diaCorte;
      const pontoInicio = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
      const pontoFim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();
      const escuroInicio = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      // Check if already exists
      const existing = ((await db.execute(sql`
        SELECT id FROM payroll_periods 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      if (existing[0]) {
        return { id: existing[0].id, message: "Competência já existe" };
      }

      // Count active employees
      const empCount = ((await db.execute(sql`
        SELECT COUNT(*) as total FROM employees 
        WHERE "companyId" = ${input.companyId} 
        AND "tipoContrato" = 'CLT'
        AND status IN ('Ativo', 'Ferias')
        AND "deletedAt" IS NULL
      `)) as any).rows || [];
      const totalFunc = empCount[0]?.total || 0;

      const result = ((await db.execute(sql`
        INSERT INTO payroll_periods ("companyId", "mesReferencia", "pontoInicio", "pontoFim", "escuroInicio", "escuroFim", status, "totalFuncionarios")
        VALUES (${input.companyId}, ${input.mesReferencia}, ${pontoInicio}, ${pontoFim}, ${escuroInicio}, ${escuroFim}, 'aberta', ${totalFunc})
        RETURNING id
      `)) as any).rows || [];
      return { id: result[0].id, message: "Competência aberta com sucesso" };
    }),

  // ============================================================
  // 2. PROCESSAR PONTO IMPORTADO + GERAR TIMECARD DAILY
  // ============================================================
  processarPonto: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Validate period exists and is in correct status
      const periods = ((await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1`
      )) as any).rows || [];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada. Abra a competência primeiro." });
      if (periods[0].status !== "aberta" && periods[0].status !== "ponto_importado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Competência está no status '${periods[0].status}'. Para reprocessar o ponto, limpe a etapa primeiro.` });
      }

      try {
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const diaCorte = criteria.diaCorte;
      const pontoInicio = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
      const pontoFim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();

      // Get all active CLT employees
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
        )
      );

      // Get time_records for the ponto period (may include multiple clocks/obras)
      const records = await db.select().from(timeRecords).where(
        and(
          companyFilter(timeRecords.companyId, input),
          sql`${timeRecords.data} >= ${pontoInicio}`,
          sql`${timeRecords.data} <= ${pontoFim}`,
        )
      );

      // Build a map: employeeId-date -> record[] (multiple records = multiple clocks)
      const recordMap = new Map<string, any[]>();
      for (const r of records) {
        const key = `${r.employeeId}-${r.data}`;
        if (!recordMap.has(key)) recordMap.set(key, []);
        recordMap.get(key)!.push(r);
      }

      // Clear existing timecard_daily for this competencia
      await db.execute(sql`
        DELETE FROM timecard_daily WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `);

      let totalInserted = 0;
      let totalFaltas = 0;
      let totalAtrasos = 0;
      let totalInconsistencias = 0;

      // Helper: count punches in a record
      const countPunches = (rec: any): number => {
        let count = 0;
        if (rec.entrada1) count++;
        if (rec.saida1) count++;
        if (rec.entrada2) count++;
        if (rec.saida2) count++;
        if (rec.entrada3) count++;
        if (rec.saida3) count++;
        return count;
      };

      // Helper: detect inconsistency type
      const detectInconsistency = (rec: any, numBatidas: number): { isInconsistente: number; tipo: string | null } => {
        if (numBatidas > 0 && numBatidas % 2 !== 0) {
          return { isInconsistente: 1, tipo: "batida_impar" };
        }
        if (!rec.entrada1 && rec.saida1) {
          return { isInconsistente: 1, tipo: "entrada_faltando" };
        }
        if (rec.entrada1 && !rec.saida1 && numBatidas === 1) {
          return { isInconsistente: 1, tipo: "saida_faltando" };
        }
        return { isInconsistente: 0, tipo: null };
      };

      // Collect time_records HE updates to apply after all employees are processed
      // (updates time_records.horasExtras so the detail view shows computed HE correctly)
      const timeRecordHEUpdates: { id: number; he: string }[] = [];

      // Process each employee
      for (const emp of empList) {
        // PART 1: Days from ponto period - status: registrado
        const pontoDates = getDateRange(pontoInicio, pontoFim);
        for (const dateStr of pontoDates) {
          const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
          if (dow === 0) continue; // Skip Sundays
          const key = `${emp.id}-${dateStr}`;
          const recs = recordMap.get(key) || [];
          let tipoDia: string = "util";
          if (dow === 6) tipoDia = criteria.jornadaSabadoTipo === "compensado" ? "compensado" : "sabado";

          let isFalta = 0, isAtraso = 0, isSaidaAntecipada = 0;
          let minutosAtraso = 0, minutosSaidaAntecipada = 0;
          let horasTrabalhadas = "0:00", horasExtras = "0:00", horasNoturnas = "0:00";
          let origemRegistro = "dixi";
          let numBatidas = 0;
          let isInconsistente = 0;
          let inconsistenciaTipo: string | null = null;
          let obraId: number | null = null;
          let obraSecundariaId: number | null = null;
          let rateioPercentual: number | null = null;
          let timeRecordId: number | null = null;

          if (recs.length > 0) {
            const rec = recs[0];
            timeRecordId = rec.id;
            obraId = rec.obraId || null;
            horasTrabalhadas = rec.horasTrabalhadas || "0:00";
            horasNoturnas = rec.horasNoturnas || "0:00";
            numBatidas = countPunches(rec);

            // Multi-obra detection
            if (recs.length > 1) {
              obraSecundariaId = recs[1].obraId || null;
              if (rec.entrada1 && recs[1].entrada1 && rec.entrada1 === recs[1].entrada1) {
                isInconsistente = 1;
                inconsistenciaTipo = "sobreposicao_horario";
                totalInconsistencias++;
              } else {
                const totalMinsPrimary = parseTime(rec.horasTrabalhadas) || 0;
                const totalMinsSecondary = parseTime(recs[1].horasTrabalhadas) || 0;
                const totalMins = totalMinsPrimary + totalMinsSecondary;
                rateioPercentual = totalMins > 0 ? Math.round((totalMinsPrimary / totalMins) * 100) : 50;
                origemRegistro = "rateado";
                horasTrabalhadas = minutesToHHMM(totalMins);
                // HE will be recalculated below in the general HE block using combined horasTrabalhadas
              }
            }

            // Recalculate HE from actual worked minutes vs expected jornada
            // (rec.horasExtras from time_records is unreliable — always 0 for manual entries
            //  and often 0 for biometric imports that don't compute it at import time)
            if (!isInconsistente || inconsistenciaTipo !== "sobreposicao_horario") {
              const expectedMins = getExpectedMins(emp.jornadaTrabalho, dateStr, criteria.cargaHorariaDiaria);
              const actualMins = parseTime(horasTrabalhadas) || 0;
              const heMins = Math.max(0, actualMins - expectedMins);
              horasExtras = heMins > 0 ? minutesToHHMM(heMins) : "0:00";
            }

            // Queue update of time_records.horasExtras so detail view reflects computed HE
            if (timeRecordId !== null) {
              timeRecordHEUpdates.push({ id: timeRecordId, he: horasExtras });
            }

            // Inconsistency detection
            if (!isInconsistente) {
              const incon = detectInconsistency(rec, numBatidas);
              isInconsistente = incon.isInconsistente;
              inconsistenciaTipo = incon.tipo;
              if (isInconsistente) totalInconsistencias++;
            }

            // Check for absence
            if (numBatidas === 0) {
              if (tipoDia === "util") { isFalta = 1; totalFaltas++; }
            }
            // Check for tardiness
            const entrada = parseTime(rec.entrada1);
            if (entrada !== null && tipoDia === "util") {
              const jornadaEntrada = getExpectedEntrada(emp.jornadaTrabalho, dateStr);
              const atraso = entrada - jornadaEntrada;
              if (atraso > criteria.pontoFaltaAposAtraso) {
                isFalta = 1; totalFaltas++;
              } else if (atraso > criteria.pontoToleranciaAtraso) {
                isAtraso = 1; minutosAtraso = atraso; totalAtrasos++;
              }
            }
            // Check for early departure
            const saida = parseTime(rec.saida2 || rec.saida1);
            if (saida !== null && tipoDia === "util") {
              const jornadaSaida = (getExpectedEntrada(emp.jornadaTrabalho, dateStr) / 60 + criteria.cargaHorariaDiaria + 1) * 60;
              const saidaAntecipada = jornadaSaida - saida;
              if (saidaAntecipada > criteria.pontoToleranciaSaida) {
                isSaidaAntecipada = 1; minutosSaidaAntecipada = saidaAntecipada;
              }
            }
          } else {
            if (tipoDia === "util") { isFalta = 1; totalFaltas++; }
          }

          await db.execute(sql`
            INSERT INTO timecard_daily (companyId, employeeId, data, mesCompetencia, statusDia, 
              entrada1, saida1, entrada2, saida2, entrada3, saida3,
              "horasTrabalhadas", "horasExtras", "horasNoturnas",
              "isFalta", "isAtraso", "isSaidaAntecipada", "minutosAtraso", "minutosSaidaAntecipada",
              "tipoDia", "timeRecordId", "obraId",
              "origemRegistro", "numBatidas", "isInconsistente", "inconsistenciaTipo",
              "obraSecundariaId", "rateioPercentual")
            VALUES (${input.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'registrado',
              ${recs[0]?.entrada1 || null}, ${recs[0]?.saida1 || null}, ${recs[0]?.entrada2 || null}, ${recs[0]?.saida2 || null}, ${recs[0]?.entrada3 || null}, ${recs[0]?.saida3 || null},
              ${horasTrabalhadas}, ${horasExtras}, ${horasNoturnas},
              ${isFalta}, ${isAtraso}, ${isSaidaAntecipada}, ${minutosAtraso}, ${minutosSaidaAntecipada},
              ${tipoDia}, ${timeRecordId}, ${obraId},
              ${origemRegistro}, ${numBatidas}, ${isInconsistente}, ${inconsistenciaTipo},
              ${obraSecundariaId}, ${rateioPercentual})
          `);
          totalInserted++;
        }

        // PART 2: Days "no escuro" (after diaCorte to end of month) - status: escuro
        if (criteria.fecharNoEscuro) {
          for (let d = diaCorte + 1; d <= lastDay; d++) {
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
            if (dow === 0) continue;
            let tipoDia = "util";
            if (dow === 6) tipoDia = criteria.jornadaSabadoTipo === "compensado" ? "compensado" : "sabado";
            await db.execute(sql`
              INSERT INTO timecard_daily ("companyId", "employeeId", data, "mesCompetencia", "statusDia",
                "horasTrabalhadas", "horasExtras", "horasNoturnas",
                "isFalta", "isAtraso", "isSaidaAntecipada", "minutosAtraso", "minutosSaidaAntecipada",
                "tipoDia", "origemRegistro", "numBatidas", "isInconsistente")
              VALUES (${input.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'escuro',
                ${minutesToHHMM(criteria.cargaHorariaDiaria * 60)}, '0:00', '0:00',
                0, 0, 0, 0, 0,
                ${tipoDia}, 'escuro', 0, 0)
            `);
            totalInserted++;
          }
        }
      }

      // Batch-update time_records.horasExtras with computed values
      // so the employee detail view shows HE correctly (it reads from time_records)
      for (const upd of timeRecordHEUpdates) {
        await db.execute(sql`UPDATE time_records SET "horasExtras" = ${upd.he} WHERE id = ${upd.id}`);
      }

      // Create alerts for inconsistencies
      if (totalInconsistencias > 0) {
        await db.execute(sql`
          INSERT INTO payroll_alerts (companyId, mesReferencia, tipo, titulo, descricao, prioridade)
          VALUES (${input.companyId}, ${input.mesReferencia}, 'inconsistencias_ponto',
            ${`${totalInconsistencias} inconsistência(s) detectada(s) no ponto`},
            ${`Foram encontradas ${totalInconsistencias} inconsistências que precisam ser resolvidas antes de avançar.`},
            ${totalInconsistencias > 10 ? "alta" : "media"})
        `);
      }

      // Update period status
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'ponto_importado',
          "pontoImportadoEm" = NOW(),
          "pontoImportadoPor" = ${ctx.user.name || "Sistema"}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return {
        totalFuncionarios: empList.length,
        totalRegistros: totalInserted,
        totalFaltas,
        totalAtrasos,
        totalInconsistencias,
        message: `Ponto processado: ${empList.length} funcionários, ${totalInserted} registros, ${totalInconsistencias} inconsistências`,
      };
      } catch (err: any) {
        console.error("[processarPonto] Error:", err);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao processar ponto: ${err.message || "Erro desconhecido"}` });
      }
    }),

  // ============================================================
  // 2.1 LISTAR INCONSISTÊNCIAS DO PONTO
  // ============================================================
  listarInconsistencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, o.nome as obraNome
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) 
        AND td.mesCompetencia = ${input.mesReferencia}
        AND td.is_inconsistente = 1
        ORDER BY td.data, e.nomeCompleto
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 2.2 RESOLVER INCONSISTÊNCIA (Ajustar Horário / Atestado / Advertência / Justificar)
  // ============================================================
  resolverInconsistencia: protectedProcedure
    .input(z.object({
      timecardDailyId: z.number(),
      resolucaoTipo: z.enum(["ajustar_horario", "atestado", "advertencia", "justificar", "abonar"]),
      novaEntrada1: z.string().optional(),
      novaSaida1: z.string().optional(),
      novaEntrada2: z.string().optional(),
      novaSaida2: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      if (input.resolucaoTipo === "ajustar_horario") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            entrada1 = COALESCE(${input.novaEntrada1 || null}, entrada1),
            saida1 = COALESCE(${input.novaSaida1 || null}, saida1),
            entrada2 = COALESCE(${input.novaEntrada2 || null}, entrada2),
            saida2 = COALESCE(${input.novaSaida2 || null}, saida2),
            "isInconsistente" = 0,
            "resolucaoTipo" = 'ajustar_horario',
            "resolucaoObs" = ${input.observacao || "Horário ajustado manualmente"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW(),
            "origemRegistro" = 'manual'
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "atestado") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            "isInconsistente" = 0,
            "resolucaoTipo" = 'atestado',
            "resolucaoObs" = ${input.observacao || "Justificado por atestado médico"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW(),
            "isFalta" = 0
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "advertencia") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            "isInconsistente" = 0,
            "resolucaoTipo" = 'advertencia',
            "resolucaoObs" = ${input.observacao || "Advertência emitida"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW()
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "justificar" || input.resolucaoTipo === "abonar") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            "isInconsistente" = 0,
            "resolucaoTipo" = ${input.resolucaoTipo},
            "resolucaoObs" = ${input.observacao || "Justificado pelo gestor"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW(),
            "isFalta" = 0
          WHERE id = ${input.timecardDailyId}
        `);
      }

      return { success: true, message: `Inconsistência resolvida: ${input.resolucaoTipo}` };
    }),

  // ============================================================
  // 2.3 RESUMO DE INCONSISTÊNCIAS (para o wizard)
  // ============================================================
  resumoInconsistencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT 
          SUM(CASE WHEN is_inconsistente = 1 THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN inconsistencia_resolvida = 1 THEN 1 ELSE 0 END) as resolvidas,
          SUM(CASE WHEN inconsistencia_tipo = 'batida_impar' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as batidasImpares,
          SUM(CASE WHEN inconsistencia_tipo = 'sobreposicao_horario' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as sobreposicoes,
          SUM(CASE WHEN inconsistencia_tipo = 'entrada_faltando' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as entradasFaltando,
          SUM(CASE WHEN inconsistencia_tipo = 'saida_faltando' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as saidasFaltando
        FROM timecard_daily 
        WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      return rows[0] || { pendentes: 0, resolvidas: 0, batidasImpares: 0, sobreposicoes: 0, entradasFaltando: 0, saidasFaltando: 0 };
    }),

  // ============================================================
  // 3. AFERIÇÃO - Cruzar ponto com período "no escuro" do mês anterior
  // ============================================================
  realizarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // --- GUARD: block re-aferição if consolidated ---
      const ppGuard = ((await db.execute(sql`
        SELECT "afericaoConsolidadoEm" FROM payroll_periods
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (ppGuard.length > 0 && ppGuard[0].afericaoConsolidadoEm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Aferição consolidada — desconsolide primeiro para reaferir.",
        });
      }

      const criteria = await getPayrollCriteria(db, input.companyId);
      const prevMes = getPrevMesRef(input.mesReferencia);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevParsed = parseMesRef(prevMes);
      const diaCorte = criteria.diaCorte;
      const prevLastDay = new Date(prevParsed.year, prevParsed.month, 0).getDate();
      const afericaoCompanyIds = resolveCompanyIds(input);
      const afericaoCidsSql = sql.join(afericaoCompanyIds.map(id => sql`${id}`), sql`,`);

      // Limpar ajustes de aferição anteriores para permitir re-aferição
      await db.execute(sql`
        DELETE FROM payroll_adjustments 
        WHERE "companyId" IN (${afericaoCidsSql}) 
        AND "mesOrigem" = ${prevMes}
        AND "mesDesconto" = ${input.mesReferencia}
        AND tipo IN ('falta', 'atraso', 'sem_registro')
      `);

      // Resetar status dos registros escuro que foram aferidos anteriormente
      await db.execute(sql`
        UPDATE timecard_daily SET 
          "statusDia" = 'escuro',
          "statusAnterior" = NULL,
          "afericaoResultado" = NULL,
          "afericaoObs" = NULL,
          "afericaoEm" = NULL
        WHERE "companyId" IN (${afericaoCidsSql}) 
        AND "mesCompetencia" = ${prevMes}
        AND ("statusAnterior" = 'escuro' OR "statusDia" IN ('escuro', 'pendente_decisao'))
      `);

      // Buscar registros escuro (inclui os que acabaram de ser resetados) — excluir PJ/Sócio
      const escuroRecords = ((await db.execute(sql`
        SELECT td.* FROM timecard_daily td
        JOIN employees e ON e.id = td."employeeId"
        WHERE td."companyId" IN (${afericaoCidsSql}) 
        AND td."mesCompetencia" = ${prevMes}
        AND td."statusDia" = 'escuro'
        AND COALESCE(e."tipoContrato",'CLT') NOT IN ('PJ','Socio')
        ORDER BY td."employeeId", td.data
      `)) as any).rows || [];
      if (!escuroRecords || (escuroRecords as any[]).length === 0) {
        for (const cid of afericaoCompanyIds) {
          await db.execute(sql`
            UPDATE payroll_periods SET status = 'aferida', "afericaoRealizada" = 1, "afericaoEm" = NOW(), "afericaoPor" = ${ctx.user.name || "Sistema"}
            WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
          `);
        }
        return { totalAferidos: 0, divergencias: 0, message: "Nenhum registro 'no escuro' encontrado no mês anterior. Competência avançada." };
      }

      // Get actual time_records for the escuro period
      const escuroInicio = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`;

      const actualRecords = await db.select().from(timeRecords).where(
        and(
          companyFilter(timeRecords.companyId, input),
          sql`${timeRecords.data} >= ${escuroInicio}`,
          sql`${timeRecords.data} <= ${escuroFim}`,
        )
      );

      const actualMap = new Map<string, any>();
      for (const r of actualRecords) {
        actualMap.set(`${r.employeeId}-${r.data}`, r);
      }

      // Build a map employeeId → jornadaTrabalho for correct HE recalculation per employee
      const escuroEmployeeIds = [...new Set((escuroRecords as any[]).map((e: any) => Number(e.employeeId)))];
      const escuroEmpRows = escuroEmployeeIds.length > 0
        ? ((await db.execute(sql`SELECT id, "jornadaTrabalho" FROM employees WHERE id IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})`)) as any).rows || []
        : [];
      const empJornadaMap = new Map<number, string | null>();
      for (const row of escuroEmpRows) {
        empJornadaMap.set(row.id, row.jornadaTrabalho ?? null);
      }

      // ===== BATCH-LOAD employee data upfront to avoid N+1 queries =====
      const empDataRows = escuroEmployeeIds.length > 0
        ? ((await db.execute(sql`SELECT id, "valorHora", "vtValorDiario", "nomeCompleto", funcao, status FROM employees WHERE id IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})`)) as any).rows || []
        : [];
      const empValorHoraMap = new Map<number, number>();
      const empVtDiarioMap = new Map<number, number>();
      const empNomeMap = new Map<number, string>();
      const empFuncaoMap = new Map<number, string>();
      const empStatusMap = new Map<number, string>();
      for (const row of empDataRows) {
        empValorHoraMap.set(row.id, parseBRL(row.valorHora));
        empVtDiarioMap.set(row.id, parseBRL(row.vtValorDiario));
        empNomeMap.set(row.id, row.nomeCompleto || `ID ${row.id}`);
        empFuncaoMap.set(row.id, row.funcao || '');
        empStatusMap.set(row.id, row.status || 'Ativo');
      }

      // ===== BATCH-LOAD vacation periods that overlap the escuro date range =====
      const feriasDateSet = new Set<string>();
      if (escuroEmployeeIds.length > 0) {
        const feriasRows = ((await db.execute(sql`
          SELECT "employeeId", "dataInicio", "dataFim", "periodo2Inicio", "periodo2Fim",
                 "periodo3Inicio", "periodo3Fim"
          FROM vacation_periods 
          WHERE "employeeId" IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})
          AND status NOT IN ('cancelada', 'pendente')
          AND "dataInicio" IS NOT NULL AND "dataFim" IS NOT NULL
          AND "dataFim" >= ${escuroInicio} AND "dataInicio" <= ${escuroFim}
        `)) as any).rows || [];
        for (const vp of feriasRows) {
          const periods = [
            { ini: vp.dataInicio, fim: vp.dataFim },
            { ini: vp.periodo2Inicio, fim: vp.periodo2Fim },
            { ini: vp.periodo3Inicio, fim: vp.periodo3Fim },
          ];
          for (const p of periods) {
            if (!p.ini || !p.fim) continue;
            const start = new Date(p.ini);
            const end = new Date(p.fim);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split('T')[0];
              feriasDateSet.add(`${vp.employeeId}-${dateStr}`);
            }
          }
        }
      }

      const STATUS_JUSTIFICADO = new Set(['Ferias', 'Afastado', 'Desligado', 'Recluso', 'Lista_Negra']);
      const justificadosList: any[] = [];
      const empVrDiarioMap = new Map<number, number>();
      if (criteria.descontoVrFalta && escuroEmployeeIds.length > 0) {
        const vrRows = ((await db.execute(sql`
          SELECT DISTINCT ON ("employeeId") "employeeId", "valorDiario" FROM vr_benefits 
          WHERE "employeeId" IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})
          AND "companyId" IN (${afericaoCidsSql})
          ORDER BY "employeeId", "mesReferencia" DESC
        `)) as any).rows || [];
        for (const row of vrRows) empVrDiarioMap.set(row.employeeId, parseBRL(row.valorDiario));
      }

      let totalAferidos = 0;
      let divergencias = 0;
      let totalOk = 0;
      const divergenciasList: any[] = [];
      const validadosList: any[] = [];

      const adjustmentInserts: string[] = [];
      const timecardAferidoUpdates: { id: number; resultado: string; obs: string | null; actual: any; horasExtras: string; numBatidas: number }[] = [];
      const timecardSemRegistroIds: number[] = [];
      const timecardSemRegistroObs: string[] = [];

      for (const escuro of escuroRecords) {
        const key = `${escuro.employeeId}-${escuro.data}`;
        const actual = actualMap.get(key);
        let resultado = "ok";
        let obs = "";
        const empNome = empNomeMap.get(escuro.employeeId) || `ID ${escuro.employeeId}`;
        const empFuncao = empFuncaoMap.get(escuro.employeeId) || '';
        const empStatus = empStatusMap.get(escuro.employeeId) || 'Ativo';
        const isFerias = feriasDateSet.has(key);
        const isStatusJustificado = STATUS_JUSTIFICADO.has(empStatus);

        if (isFerias || isStatusJustificado) {
          const motivo = isFerias ? 'Férias' : empStatus === 'Afastado' ? 'Afastado' : empStatus === 'Desligado' ? 'Desligado' : empStatus === 'Recluso' ? 'Recluso' : empStatus === 'Lista_Negra' ? 'Lista Negra' : empStatus;
          resultado = "justificado";
          obs = `Ausência justificada: ${motivo}`;
          totalOk++;
          justificadosList.push({
            employeeId: escuro.employeeId,
            employeeName: empNome,
            funcao: empFuncao,
            data: escuro.data,
            motivo,
            empStatus,
          });
          timecardAferidoUpdates.push({ id: escuro.id, resultado: "justificado", obs, actual: actual || { entrada1: null, saida1: null, entrada2: null, saida2: null, entrada3: null, saida3: null, horasTrabalhadas: '0:00', horasNoturnas: '0:00', isFalta: false, isAtraso: false, isSaidaAntecipada: false, minutosAtraso: 0, minutosSaidaAntecipada: 0 }, horasExtras: '0:00', numBatidas: 0 });
          totalAferidos++;
          continue;
        }

        const tipoDiaEscuro = (escuro.tipoDia || 'util').toLowerCase();
        const isDiaUtil = tipoDiaEscuro === 'util';
        const isFimDeSemanaOuFeriado = ['sabado', 'domingo', 'compensado', 'feriado'].includes(tipoDiaEscuro);

        if (!actual && isFimDeSemanaOuFeriado) {
          resultado = "ok";
          obs = `Sem registro em ${tipoDiaEscuro === 'feriado' ? 'feriado' : tipoDiaEscuro === 'domingo' ? 'domingo' : 'sábado'} — esperado (não é dia útil)`;
          totalOk++;
          validadosList.push({
            employeeId: escuro.employeeId,
            employeeName: empNome,
            data: escuro.data,
            escuroEntrada1: escuro.entrada1 || '-',
            escuroSaida1: escuro.saida1 || '-',
            realEntrada1: '-',
            realSaida1: '-',
            horasTrabalhadas: '0:00',
          });
          timecardAferidoUpdates.push({ id: escuro.id, resultado: "ok", obs, actual: { entrada1: null, saida1: null, entrada2: null, saida2: null, entrada3: null, saida3: null, horasTrabalhadas: '0:00', horasNoturnas: '0:00', isFalta: false, isAtraso: false, isSaidaAntecipada: false, minutosAtraso: 0, minutosSaidaAntecipada: 0 }, horasExtras: '0:00', numBatidas: 0 });
          totalAferidos++;
          continue;
        }

        if (actual) {
          if (!actual.entrada1 && !actual.saida1 && !actual.entrada2 && !actual.saida2) {
            if (isFimDeSemanaOuFeriado) {
              resultado = "ok";
              obs = `Sem batida em ${tipoDiaEscuro === 'feriado' ? 'feriado' : tipoDiaEscuro === 'domingo' ? 'domingo' : 'sábado'} — esperado`;
              totalOk++;
              validadosList.push({
                employeeId: escuro.employeeId,
                employeeName: empNome,
                data: escuro.data,
                escuroEntrada1: escuro.entrada1 || '-',
                escuroSaida1: escuro.saida1 || '-',
                realEntrada1: '-',
                realSaida1: '-',
                horasTrabalhadas: '0:00',
              });
              timecardAferidoUpdates.push({ id: escuro.id, resultado: "ok", obs, actual, horasExtras: '0:00', numBatidas: 0 });
              totalAferidos++;
              continue;
            }
            resultado = "falta";
            obs = "Falta identificada na aferição";
            divergencias++;

            const valorHoraEmp = empValorHoraMap.get(escuro.employeeId) || 0;
            const valorFalta = valorHoraEmp * criteria.cargaHorariaDiaria;
            let vrDesconto = "0", vtDesconto = "0";
            if (criteria.descontoVrFalta) {
              vrDesconto = formatMoney(empVrDiarioMap.get(escuro.employeeId) || 0);
            }
            if (criteria.descontoVtFalta) {
              vtDesconto = formatMoney(empVtDiarioMap.get(escuro.employeeId) || 0);
            }
            const totalDesc = valorFalta + parseBRL(vrDesconto) + parseBRL(vtDesconto);

            const esc = (s: string) => s.replace(/'/g, "''");
            adjustmentInserts.push(
              `(${input.companyId}, ${escuro.employeeId}, '${esc(prevMes)}', '${esc(input.mesReferencia)}', '${esc(escuro.data)}', 'falta', '${esc(`Falta dia ${escuro.data} - Aferição do período no escuro de ${prevMes}`)}', '${formatMoney(valorFalta)}', '${vrDesconto}', '${vtDesconto}', '${formatMoney(totalDesc)}', ${escuro.id}, 'pendente')`
            );

            divergenciasList.push({
              employeeId: escuro.employeeId,
              employeeName: empNome,
              funcao: empFuncao,
              empStatus,
              data: escuro.data,
              tipo: "falta",
              valorDesconto: totalDesc,
              escuroEntrada1: escuro.entrada1,
              escuroSaida1: escuro.saida1,
            });
          } else if (isFimDeSemanaOuFeriado) {
            resultado = "ok";
            obs = `Batida em ${tipoDiaEscuro === 'feriado' ? 'feriado' : tipoDiaEscuro === 'domingo' ? 'domingo' : 'sábado'} — horas computadas como hora extra`;
            totalOk++;
            validadosList.push({
              employeeId: escuro.employeeId,
              employeeName: empNome,
              data: escuro.data,
              escuroEntrada1: escuro.entrada1 || '-',
              escuroSaida1: escuro.saida1 || '-',
              realEntrada1: actual.entrada1 || '-',
              realSaida1: actual.saida1 || '-',
              horasTrabalhadas: actual.horasTrabalhadas || '0:00',
              heIndicator: true,
            });
          } else {
            const entrada = parseTime(actual.entrada1);
            if (entrada !== null) {
              const empJornada = empJornadaMap.get(escuro.employeeId) ?? null;
              const jornadaEntrada = getExpectedEntrada(empJornada, escuro.data);
              const atraso = entrada - jornadaEntrada;
              if (atraso > criteria.pontoToleranciaAtraso) {
                resultado = "atraso";
                obs = `Atraso de ${minutesToHHMM(atraso)} identificado na aferição`;
                divergencias++;

                const valorHoraEmp = empValorHoraMap.get(escuro.employeeId) || 0;
                const valorMinuto = valorHoraEmp / 60;
                const valorAtraso = valorMinuto * atraso;

                const esc = (s: string) => s.replace(/'/g, "''");
                adjustmentInserts.push(
                  `(${input.companyId}, ${escuro.employeeId}, '${esc(prevMes)}', '${esc(input.mesReferencia)}', '${esc(escuro.data)}', 'atraso', '${esc(`Atraso ${minutesToHHMM(atraso)} dia ${escuro.data} - Aferição do período no escuro de ${prevMes}`)}', '${formatMoney(valorAtraso)}', '0', '0', '${formatMoney(valorAtraso)}', ${escuro.id}, 'pendente')`
                );

                divergenciasList.push({
                  employeeId: escuro.employeeId,
                  employeeName: empNome,
                  funcao: empFuncao,
                  empStatus,
                  data: escuro.data,
                  tipo: "atraso",
                  minutos: atraso,
                  valorDesconto: valorAtraso,
                  realEntrada: actual.entrada1,
                });
              } else {
                resultado = "ok";
                totalOk++;
                validadosList.push({
                  employeeId: escuro.employeeId,
                  employeeName: empNome,
                  data: escuro.data,
                  escuroEntrada1: escuro.entrada1 || '-',
                  escuroSaida1: escuro.saida1 || '-',
                  realEntrada1: actual.entrada1 || '-',
                  realSaida1: actual.saida1 || '-',
                  horasTrabalhadas: actual.horasTrabalhadas || '0:00',
                });
              }
            } else {
              resultado = "ok";
              totalOk++;
              validadosList.push({
                employeeId: escuro.employeeId,
                employeeName: empNome,
                data: escuro.data,
                escuroEntrada1: escuro.entrada1 || '-',
                escuroSaida1: escuro.saida1 || '-',
                realEntrada1: actual.entrada1 || '-',
                realSaida1: actual.saida1 || '-',
                horasTrabalhadas: actual.horasTrabalhadas || '0:00',
              });
            }
          }
        } else {
          resultado = "falta";
          obs = `Falta identificada na aferição — sem registro no DIXI para ${escuro.data}`;
          divergencias++;

          const valorHoraEmpSR = empValorHoraMap.get(escuro.employeeId) || 0;
          const valorFaltaSR = valorHoraEmpSR * criteria.cargaHorariaDiaria;
          let vrDescontoSR = "0", vtDescontoSR = "0";
          if (criteria.descontoVrFalta) {
            vrDescontoSR = formatMoney(empVrDiarioMap.get(escuro.employeeId) || 0);
          }
          if (criteria.descontoVtFalta) {
            vtDescontoSR = formatMoney(empVtDiarioMap.get(escuro.employeeId) || 0);
          }
          const totalDescSR = valorFaltaSR + parseBRL(vrDescontoSR) + parseBRL(vtDescontoSR);

          const esc = (s: string) => s.replace(/'/g, "''");
          adjustmentInserts.push(
            `(${input.companyId}, ${escuro.employeeId}, '${esc(prevMes)}', '${esc(input.mesReferencia)}', '${esc(escuro.data)}', 'falta', '${esc(`Falta dia ${escuro.data} — Sem registro no DIXI. Aferição do período no escuro de ${prevMes}`)}', '${formatMoney(valorFaltaSR)}', '${vrDescontoSR}', '${vtDescontoSR}', '${formatMoney(totalDescSR)}', ${escuro.id}, 'pendente')`
          );

          divergenciasList.push({
            employeeId: escuro.employeeId,
            employeeName: empNome,
            funcao: empFuncao,
            empStatus,
            data: escuro.data,
            tipo: "falta",
            valorDesconto: totalDescSR,
            escuroEntrada1: escuro.entrada1 || '-',
            escuroSaida1: escuro.saida1 || '-',
          });
        }

        if (actual) {
          const empJornada = empJornadaMap.get(escuro.employeeId) ?? null;
          const expectedMinsAf = getExpectedMins(empJornada, escuro.data, criteria.cargaHorariaDiaria);
          const actualMinsAf = (() => {
            const str = actual.horasTrabalhadas;
            if (!str) return 0;
            const parts = str.split(":");
            return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          })();
          const heAfMins = Math.max(0, actualMinsAf - expectedMinsAf);
          const horasExtrasAf = heAfMins > 0 ? minutesToHHMM(heAfMins) : "0:00";
          const numBatidasVal = [actual.entrada1, actual.saida1, actual.entrada2, actual.saida2, actual.entrada3, actual.saida3].filter(Boolean).length;
          timecardAferidoUpdates.push({ id: escuro.id, resultado, obs: obs || null, actual, horasExtras: horasExtrasAf, numBatidas: numBatidasVal });
        } else {
          timecardSemRegistroIds.push(escuro.id);
          timecardSemRegistroObs.push(obs);
        }
        totalAferidos++;
      }

      // ===== BATCH INSERT adjustments (single query) =====
      if (adjustmentInserts.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < adjustmentInserts.length; i += batchSize) {
          const batch = adjustmentInserts.slice(i, i + batchSize);
          await db.execute(sql.raw(
            `INSERT INTO payroll_adjustments ("companyId", "employeeId", "mesOrigem", "mesDesconto", data, tipo, descricao, "valorDesconto", "valorVrDesconto", "valorVtDesconto", "valorTotal", "timecardDailyId", status) VALUES ${batch.join(',')}`
          ));
        }
      }

      // Enrich divergenciasList with adjustmentId for frontend actions
      if (divergenciasList.length > 0) {
        const adjRows = ((await db.execute(sql`
          SELECT id, "employeeId", data, tipo FROM payroll_adjustments
          WHERE "companyId" = ${input.companyId}
          AND "mesOrigem" = ${prevMes} AND "mesDesconto" = ${input.mesReferencia}
          AND tipo IN ('falta','atraso','sem_registro')
        `)) as any).rows || [];
        const adjMap = new Map<string, number>();
        for (const a of adjRows) adjMap.set(`${a.employeeId}-${a.data}-${a.tipo}`, a.id);
        for (const d of divergenciasList) {
          d.adjustmentId = adjMap.get(`${d.employeeId}-${d.data}-${d.tipo}`) || null;
        }
      }

      // ===== BATCH UPDATE timecard_daily for aferido records (parallel chunks of 10) =====
      if (timecardAferidoUpdates.length > 0) {
        const chunkSize = 10;
        for (let i = 0; i < timecardAferidoUpdates.length; i += chunkSize) {
          const chunk = timecardAferidoUpdates.slice(i, i + chunkSize);
          await Promise.all(chunk.map(u => db.execute(sql`
            UPDATE timecard_daily SET 
              "statusDia" = 'aferido', "statusAnterior" = 'escuro',
              "afericaoResultado" = ${u.resultado}, "afericaoObs" = ${u.obs},
              "afericaoEm" = NOW(),
              entrada1 = ${u.actual.entrada1 ?? null}, saida1 = ${u.actual.saida1 ?? null},
              entrada2 = ${u.actual.entrada2 ?? null}, saida2 = ${u.actual.saida2 ?? null},
              entrada3 = ${u.actual.entrada3 ?? null}, saida3 = ${u.actual.saida3 ?? null},
              "horasTrabalhadas" = ${u.actual.horasTrabalhadas || '0:00'},
              "horasExtras" = ${u.horasExtras},
              "horasNoturnas" = ${u.actual.horasNoturnas || '0:00'},
              "timeRecordId" = ${u.actual.id ?? null}, "obraId" = ${u.actual.obraId ?? null},
              "origemRegistro" = 'aferido', "numBatidas" = ${u.numBatidas},
              "isFalta" = ${u.resultado === "falta" ? 1 : 0},
              "isAtraso" = ${u.resultado === "atraso" ? 1 : 0}
            WHERE id = ${u.id}
          `)));
        }
      }

      if (timecardSemRegistroIds.length > 0) {
        await db.execute(sql.raw(`
          UPDATE timecard_daily SET 
            "statusDia" = 'pendente',
            "statusAnterior" = 'escuro',
            "afericaoResultado" = 'falta',
            "afericaoObs" = 'Falta identificada na aferição — sem registro no DIXI.',
            "afericaoEm" = NOW(),
            "isFalta" = 1,
            "isAtraso" = 0
          WHERE id IN (${timecardSemRegistroIds.join(',')})
        `));
      }

      const totalJustificados = justificadosList.length;
      const afericaoResultPayload = {
        totalAferidos, divergencias, totalOk, faltas: divergenciasList.filter((d: any) => d.tipo === 'falta').length,
        atrasos: divergenciasList.filter((d: any) => d.tipo === 'atraso').length,
        semRegistro: 0,
        totalJustificados,
        divergenciasList, validadosList, justificadosList,
      };
      const resultJson = JSON.stringify(afericaoResultPayload);

      // Update period for all companies
      for (const cid of afericaoCompanyIds) {
        await db.execute(sql`
          UPDATE payroll_periods SET 
            "afericaoRealizada" = 1,
            "afericaoEm" = NOW(),
            "afericaoPor" = ${ctx.user.name || "Sistema"},
            "totalDivergenciasAferidas" = ${divergencias},
            "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${prevMes}
        `);
        await db.execute(sql`
          UPDATE payroll_periods SET status = 'aferida', "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
      }

      // Create alert if divergences found
      if (divergencias > 0) {
        await db.execute(sql`
          INSERT INTO payroll_alerts ("companyId", "mesReferencia", tipo, titulo, descricao, prioridade)
          VALUES (${input.companyId}, ${input.mesReferencia}, 'divergencias_aferidas',
            ${`${divergencias} divergência(s) encontrada(s) na aferição de ${prevMes}`},
            ${`Foram identificadas ${divergencias} ocorrências no período "no escuro" de ${prevMes} que gerarão descontos na folha de ${input.mesReferencia}.`},
            ${divergencias > 5 ? "alta" : "media"})
        `);
      }

      return { 
        ...afericaoResultPayload,
        message: `Aferição concluída: ${totalAferidos} dias aferidos, ${totalOk} OK, ${divergencias} divergências, ${totalJustificados} justificados`
      };
    }),

  // ============================================================
  // 3a-2. ATUALIZAR RESULTADO DA AFERIÇÃO (salvar progresso)
  // ============================================================
  atualizarAfericaoResult: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      afericaoResult: z.any(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const cids = resolveCompanyIds(input);
      const resultJson = JSON.stringify(input.afericaoResult);
      for (const cid of cids) {
        await db.execute(sql`
          UPDATE payroll_periods SET "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
        const prevMes = getPrevMesRef(input.mesReferencia);
        await db.execute(sql`
          UPDATE payroll_periods SET "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${prevMes}
        `);
      }
      return { message: "Progresso da aferição salvo com sucesso" };
    }),

  // ============================================================
  // 3b. LISTAR ALERTAS DA AFERIÇÃO (pendente_decisao)
  // ============================================================
  listarAlertasAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pa.*, e."nomeCompleto", e."funcao", e."codigoInterno"
        FROM payroll_adjustments pa
        LEFT JOIN employees e ON pa."employeeId" = e.id
        WHERE pa."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) 
        AND pa."mesDesconto" = ${input.mesReferencia}
        AND pa.status = 'pendente_decisao'
        ORDER BY e."nomeCompleto", pa.data
      `)) as any).rows || [];
      return rows || [];
    }),

  detalharDiasAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const prevMes = getPrevMesRef(input.mesReferencia);
      const prevParsed = parseMesRef(prevMes);
      const diaCorte = criteria.diaCorte;
      const prevLastDay = new Date(prevParsed.year, prevParsed.month, 0).getDate();
      const escuroInicio = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`;

      const tcRows = ((await db.execute(sql`
        SELECT td."data", td."statusDia", td."tipoDia", td."entrada1", td."saida1", td."entrada2", td."saida2",
               td."horasTrabalhadas", td."horasExtras", td."isFalta", td."isAtraso", td."minutosAtraso",
               td."numBatidas", td."afericaoResultado", td."afericaoObs", td."obraId",
               o.nome AS "obraNome"
        FROM timecard_daily td
        LEFT JOIN obras o ON o.id = td."obraId"
        WHERE td."companyId" = ${input.companyId} AND td."employeeId" = ${input.employeeId}
          AND td."data" >= ${escuroInicio} AND td."data" <= ${escuroFim}
        ORDER BY td."data"
      `)) as any).rows || [];

      const ferRows = ((await db.execute(sql`
        SELECT data, nome, tipo FROM feriados
        WHERE ("companyId" = ${input.companyId} OR "companyId" IS NULL)
          AND ativo = 1
          AND data >= ${escuroInicio} AND data <= ${escuroFim}
      `)) as any).rows || [];
      const feriadoMap = new Map<string, string>();
      for (const f of ferRows as any[]) {
        const fk = f.data instanceof Date ? f.data.toISOString().split('T')[0] : String(f.data);
        feriadoMap.set(fk, f.nome);
      }

      const tcMap = new Map<string, any>();
      for (const r of tcRows as any[]) {
        const dk = r.data instanceof Date ? r.data.toISOString().split('T')[0] : String(r.data);
        tcMap.set(dk, r);
      }

      const dias: any[] = [];
      const start = new Date(`${escuroInicio}T12:00:00`);
      const end = new Date(`${escuroFim}T12:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dow = d.getDay();
        const isSab = dow === 6;
        const isDom = dow === 0;
        const nomeFeriado = feriadoMap.get(dateStr) || null;
        const tc = tcMap.get(dateStr) || null;

        const tcTipoDia = tc?.tipoDia?.toLowerCase() || null;
        let classificacao = 'dia_util';
        if (tcTipoDia && ['sabado', 'domingo', 'compensado', 'feriado'].includes(tcTipoDia)) {
          classificacao = tcTipoDia === 'compensado' ? 'sabado' : tcTipoDia;
        } else {
          if (isDom) classificacao = 'domingo';
          else if (isSab) classificacao = 'sabado';
        }
        if (nomeFeriado) classificacao = 'feriado';

        dias.push({
          data: dateStr,
          diaSemana: dow,
          classificacao,
          nomeFeriado,
          temRegistro: !!tc && (tc.numBatidas > 0 || !!tc.entrada1),
          statusDia: tc?.statusDia || null,
          tipoDia: tc?.tipoDia || null,
          entrada1: tc?.entrada1 || null,
          saida1: tc?.saida1 || null,
          entrada2: tc?.entrada2 || null,
          saida2: tc?.saida2 || null,
          horasTrabalhadas: tc?.horasTrabalhadas || null,
          numBatidas: tc?.numBatidas || 0,
          isFalta: tc?.isFalta || 0,
          afericaoResultado: tc?.afericaoResultado || null,
          afericaoObs: tc?.afericaoObs || null,
          obraNome: tc?.obraNome || null,
        });
      }

      const empRow = ((await db.execute(sql`
        SELECT "nomeCompleto", "funcao", "codigoInterno", "jornadaTrabalho", "salarioBase", "valorHora"
        FROM employees WHERE id = ${input.employeeId} AND "companyId" = ${input.companyId}
      `)) as any).rows?.[0] || {};

      const salarioBase = parseFloat(empRow.salarioBase) || 0;
      const valorHora = parseFloat(empRow.valorHora) || 0;
      const jornadaObj = (() => {
        try {
          const j = empRow.jornadaTrabalho;
          if (!j) return null;
          return typeof j === 'string' ? JSON.parse(j) : j;
        } catch { return null; }
      })();
      const horasDiarias = (() => {
        if (!jornadaObj) return 8;
        const seg = jornadaObj.seg || jornadaObj.segunda;
        if (seg?.entrada && seg?.saida) {
          const [eh, em] = seg.entrada.split(':').map(Number);
          const [sh, sm] = seg.saida.split(':').map(Number);
          const [ih, im] = (seg.intervalo || '01:00').split(':').map(Number);
          return (sh * 60 + sm - eh * 60 - em - ih * 60 - im) / 60;
        }
        return 8;
      })();
      const descontoDiario = valorHora > 0 ? valorHora * horasDiarias : salarioBase / 30;

      return {
        employee: { id: input.employeeId, nome: empRow.nomeCompleto, funcao: empRow.funcao, codigo: empRow.codigoInterno, jornada: empRow.jornadaTrabalho, salarioBase },
        descontoDiario: Math.round(descontoDiario * 100) / 100,
        periodoInicio: escuroInicio,
        periodoFim: escuroFim,
        dias,
      };
    }),

  // ============================================================
  // 3c. DECIDIR ALERTA DA AFERIÇÃO (erro relógio vs falta real)
  // ============================================================
  decidirAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      decisoes: z.array(z.object({
        adjustmentId: z.number(),
        decisao: z.enum(["erro_relogio", "falta_real"]),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      
      let errosRelogio = 0;
      let faltasReais = 0;
      
      for (const dec of input.decisoes) {
        if (dec.decisao === "erro_relogio") {
          const sufixo = ` [DECISÃO: Erro do relógio - mantido como trabalhado por ${ctx.user.name || "Usuário"}]`;
          await db.execute(sql`
            UPDATE payroll_adjustments SET 
              status = 'cancelado',
              descricao = COALESCE(descricao, '') || ${sufixo}::text
            WHERE id = ${dec.adjustmentId} AND "companyId" = ${input.companyId}
          `);
          const adjRow = ((await db.execute(sql`
            SELECT "timecardDailyId" FROM payroll_adjustments WHERE id = ${dec.adjustmentId}
          `)) as any).rows || [];
          const tcId = (adjRow as any[])?.[0]?.timecardDailyId;
          if (tcId) {
            await db.execute(sql`
              UPDATE timecard_daily SET 
                "statusDia" = 'aferido',
                "afericaoResultado" = 'ok',
                "afericaoObs" = CONCAT(COALESCE("afericaoObs", ''), ' [Erro do relógio - mantido como trabalhado]'),
                "isFalta" = 0, "isAtraso" = 0
              WHERE id = ${tcId}
            `);
          }
          errosRelogio++;
        } else {
          const sufixo2 = ` [DECISÃO: Falta real confirmada por ${ctx.user.name || "Usuário"}]`;
          await db.execute(sql`
            UPDATE payroll_adjustments SET 
              status = 'pendente',
              tipo = 'falta',
              descricao = COALESCE(descricao, '') || ${sufixo2}::text
            WHERE id = ${dec.adjustmentId} AND "companyId" = ${input.companyId}
          `);
          const adjRow2 = ((await db.execute(sql`
            SELECT "timecardDailyId" FROM payroll_adjustments WHERE id = ${dec.adjustmentId}
          `)) as any).rows || [];
          const tcId2 = (adjRow2 as any[])?.[0]?.timecardDailyId;
          if (tcId2) {
            await db.execute(sql`
              UPDATE timecard_daily SET 
                "statusDia" = 'aferido',
                "afericaoResultado" = 'falta',
                "afericaoObs" = CONCAT(COALESCE("afericaoObs", ''), ' [Falta real confirmada]'),
                "isFalta" = 1
              WHERE id = ${tcId2}
            `);
          }
          faltasReais++;
        }
      }
      
      return {
        errosRelogio,
        faltasReais,
        message: `Decisão registrada: ${errosRelogio} erro(s) de relógio, ${faltasReais} falta(s) real(is)`,
      };
    }),

  // ============================================================
  // 4. GERAR VALE / ADIANTAMENTO
  // ============================================================
  gerarVale: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);

      // Get active CLT employees — exclui Ferias, Afastado e demais inativos
      const empListAtivos = await db.select({
        id: employees.id,
        companyId: employees.companyId,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        horasMensais: employees.horasMensais,
        dataAdmissao: employees.dataAdmissao,
        tipoRemuneracao: employees.tipoRemuneracao,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          eq(employees.status, "Ativo"),
          sql`${employees.deletedAt} IS NULL`,
          sql`(${employees.valorHora} IS NOT NULL AND ${employees.valorHora} != '') OR ${employees.tipoRemuneracao} = 'mensalista'`,
        )
      );

      // ── Desligados com aviso prévio: incluir funcionários que estavam trabalhando no mês ──
      // Funcionários desligados que tinham aviso prévio cujo último dia (dataFim) cai dentro do mês
      // devem receber vale proporcional aos dias efetivamente trabalhados no mês.
      const primeiroDiaMesAviso = `${year}-${String(month).padStart(2, '0')}-01`;
      const ultimoDiaMesAviso = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
      const companyIdsSqlForAviso = sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`);
      const avisoDesligadosRows = ((await db.execute(sql`
        SELECT e.id, e."companyId", e."nomeCompleto", e."valorHora", e."salarioBase", 
               e."horasMensais", e."dataAdmissao", e."tipoRemuneracao",
               tn."dataFim" as "avisoUltimoDia"
        FROM employees e
        INNER JOIN termination_notices tn ON tn."employeeId" = e.id AND tn."deletedAt" IS NULL
          AND tn.status NOT IN ('cancelado')
        WHERE e."companyId" IN (${companyIdsSqlForAviso})
          AND e."tipoContrato" = 'CLT'
          AND e.status = 'Desligado'
          AND e."deletedAt" IS NULL
          AND ((e."valorHora" IS NOT NULL AND e."valorHora" != '') OR e."tipoRemuneracao" = 'mensalista')
          AND tn."dataFim" >= ${primeiroDiaMesAviso}::date
          AND tn."dataInicio" <= ${ultimoDiaMesAviso}::date
      `)) as any).rows || [];

      // Map: employeeId → último dia trabalhado no mês (para cálculo proporcional)
      const avisoUltimoDiaMap = new Map<number, number>();
      const ativosIds = new Set(empListAtivos.map(e => e.id));
      const desligadosNoMes: typeof empListAtivos = [];

      for (const row of avisoDesligadosRows as any[]) {
        const empId = Number(row.id);
        if (ativosIds.has(empId)) continue;
        const ultimoDiaAviso = new Date(row.avisoUltimoDia);
        const diaNoMes = ultimoDiaAviso.getUTCDate();
        const mesAviso = ultimoDiaAviso.getUTCMonth() + 1;
        const anoAviso = ultimoDiaAviso.getUTCFullYear();
        const diasNoMesAtual = new Date(year, month, 0).getDate();
        const diasEfetivos = (anoAviso === year && mesAviso === month)
          ? diaNoMes
          : (ultimoDiaAviso >= new Date(`${ultimoDiaMesAviso}T12:00:00Z`) ? diasNoMesAtual : 0);
        if (diasEfetivos > 0) {
          avisoUltimoDiaMap.set(empId, diasEfetivos);
          desligadosNoMes.push({
            id: empId,
            companyId: Number(row.companyId),
            nomeCompleto: row.nomeCompleto,
            valorHora: row.valorHora,
            salarioBase: row.salarioBase,
            horasMensais: row.horasMensais,
            dataAdmissao: row.dataAdmissao,
            tipoRemuneracao: row.tipoRemuneracao || 'horista',
          });
        }
      }

      const empList = [...empListAtivos, ...desligadosNoMes];

      const excluidos = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          eq(employees.status, "Ativo"),
          sql`${employees.deletedAt} IS NULL`,
          sql`(${employees.valorHora} IS NULL OR ${employees.valorHora} = '')`,
          sql`(${employees.tipoRemuneracao} IS NULL OR ${employees.tipoRemuneracao} != 'mensalista')`,
        )
      );

      // Count faltas ONLY from day 1 to 15 of current month (not the full ponto period)
      const primeiroDiaMes = `${year}-${String(month).padStart(2, '0')}-01`;
      const dia15Mes = `${year}-${String(month).padStart(2, '0')}-15`;
      const companyIdsSql = sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`);
      const faltasRows = ((await db.execute(sql`
        SELECT "employeeId", SUM("isFalta") as "totalFaltas"
        FROM timecard_daily 
        WHERE "companyId" IN (${companyIdsSql}) 
        AND "mesCompetencia" = ${input.mesReferencia}
        AND data BETWEEN ${primeiroDiaMes}::date AND ${dia15Mes}::date
        AND "statusDia" = 'registrado'
        GROUP BY "employeeId"
      `)) as any).rows || [];
      const faltasMap = new Map<number, number>();
      for (const r of (faltasRows || [])) {
        faltasMap.set(Number(r.employeeId), Number(r.totalFaltas) || 0);
      }

      // ── Férias no mês: salário proporcional ───────────────────────────────
      // Fórmula: salário = valorHora × (horasMensais × diasTrabalhados / 30)
      //          diasTrabalhados = diasNoMes − diasDeFerias (calendário)
      // Buscar períodos de férias que se sobrepõem com o mês inteiro de referência
      const ultimoDiaMes = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
      const feriasRows = ((await db.execute(sql`
        SELECT "employeeId", "dataInicio", "dataFim"
        FROM vacation_periods
        WHERE "companyId" IN (${companyIdsSql})
          AND "deletedAt" IS NULL
          AND status IN ('em_gozo', 'concluida')
          AND "dataInicio" <= ${ultimoDiaMes}::date
          AND ("dataFim" >= ${primeiroDiaMes}::date OR "dataFim" IS NULL)
      `)) as any).rows || [];

      // Helper: conta dias de calendário entre duas datas inclusive
      function diasCalendarioEntre(start: Date, end: Date): number {
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffMs = end.getTime() - start.getTime();
        return Math.round(diffMs / msPerDay) + 1;
      }

      // Helper: conta dias úteis (não-domingo) entre duas datas inclusive
      function diasUteisEntre(start: Date, end: Date): number {
        let count = 0;
        const d = new Date(start);
        d.setHours(12, 0, 0, 0);
        const endClone = new Date(end);
        endClone.setHours(12, 0, 0, 0);
        while (d <= endClone) {
          if (d.getDay() !== 0) count++;
          d.setDate(d.getDate() + 1);
        }
        return count;
      }

      const dia1 = new Date(`${primeiroDiaMes}T12:00:00Z`);
      const dia15 = new Date(`${dia15Mes}T12:00:00Z`);
      const diaFim = new Date(`${ultimoDiaMes}T12:00:00Z`);

      // feriasMesMap: employeeId → dias de calendário de férias no mês (para salário proporcional)
      // feriasQuinzenaMap: employeeId → dias úteis de férias na quinzena 1-15 (para regra de bloqueio)
      const feriasMesMap = new Map<number, number>();
      const feriasQuinzenaMap = new Map<number, number>();

      for (const row of feriasRows as any[]) {
        const empId = Number(row.employeeId);
        const vacStart = new Date(`${row.dataInicio}T12:00:00Z`);
        const vacEnd = row.dataFim ? new Date(`${row.dataFim}T12:00:00Z`) : diaFim;

        // Overlap com mês inteiro → dias de calendário (para salário proporcional)
        const mesStart = vacStart < dia1 ? dia1 : vacStart;
        const mesEnd = vacEnd > diaFim ? diaFim : vacEnd;
        if (mesStart <= mesEnd) {
          feriasMesMap.set(empId, (feriasMesMap.get(empId) || 0) + diasCalendarioEntre(mesStart, mesEnd));
        }

        // Overlap com quinzena 1-15 → dias úteis (para regra de bloqueio)
        const q15Start = vacStart < dia1 ? dia1 : vacStart;
        const q15End = vacEnd > dia15 ? dia15 : vacEnd;
        if (q15Start <= q15End) {
          feriasQuinzenaMap.set(empId, (feriasQuinzenaMap.get(empId) || 0) + diasUteisEntre(q15Start, q15End));
        }
      }

      // HE is now a SEPARATE MODULE (he_periods / horasExtras router).
      // Vale = pure advance only — no HE included here.

      // Preserve manually-rejected employees across recalc
      const rejeitadosRows = ((await db.execute(sql`
        SELECT "employeeId" FROM payroll_advances
        WHERE "companyId" IN (${companyIdsSql}) AND "mesReferencia" = ${input.mesReferencia} AND status = 'rejeitado'
      `)) as any).rows || [];
      const rejeitadosSet = new Set<number>((rejeitadosRows as any[]).map((r: any) => Number(r.employeeId)));

      // Preserve manually-approved alerts across recalc (decidirVale sets status='calculado' + motivoBloqueio LIKE '%[APROVADO%')
      const aprovadosAlertaRows = ((await db.execute(sql`
        SELECT "employeeId" FROM payroll_advances
        WHERE "companyId" IN (${companyIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
          AND status = 'calculado' AND "motivoBloqueio" LIKE '%[APROVADO%'
      `)) as any).rows || [];
      const aprovadosAlertaSet = new Set<number>((aprovadosAlertaRows as any[]).map((r: any) => Number(r.employeeId)));

      // Clear existing advances for this month (all companies)
      const allCompanyIds = resolveCompanyIds(input);
      for (const cid of allCompanyIds) {
        await db.execute(sql`
          DELETE FROM payroll_advances WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
      }

      const results: any[] = [];
      let totalVale = 0;
      let bloqueados = 0;
      const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;

      // Pre-calculate all employees in memory (no DB calls in loop)
      const advanceInsertRows: any[] = [];
      const eventInsertRows: any[] = [];

      // Dias úteis na primeira quinzena (1–15) — exclui domingos (construção civil trabalha sábado)
      let diasUteisFirstHalf = 0;
      for (let d = 1; d <= 15; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (dow !== 0) diasUteisFirstHalf++;
      }

      // Dias reais do mês (28, 29, 30 ou 31) para cálculo proporcional do horista
      const diasNoMes = new Date(year, month, 0).getDate();

      for (const emp of empList) {
        const valorHora = parseBRL(emp.valorHora);
        const horasMensaisBase = emp.horasMensais ? Number(emp.horasMensais) : 220;
        const percentual = criteria.percentualAdiantamento;
        const faltas = faltasMap.get(emp.id) || 0;
        const minutosHE = 0;
        const valorHE = 0;
        const isMensalista = (emp.tipoRemuneracao === 'mensalista');

        // ── Salário proporcional: férias + aviso prévio (desligados) ──────
        const diasFeriasNoMes = feriasMesMap.get(emp.id) || 0;
        const avisoUltimoDia = avisoUltimoDiaMap.get(emp.id);
        const diasAusentesAviso = avisoUltimoDia ? Math.max(0, diasNoMes - avisoUltimoDia) : 0;
        const diasTrabalhados = Math.max(0, diasNoMes - diasFeriasNoMes - diasAusentesAviso);

        let salarioBruto: number;
        let salarioMensalCompleto: number;

        if (isMensalista) {
          const salBase = parseBRL(emp.salarioBase);
          salarioMensalCompleto = salBase;
          if (diasFeriasNoMes > 0 || diasAusentesAviso > 0) {
            salarioBruto = salBase * (diasTrabalhados / diasNoMes);
          } else {
            salarioBruto = salBase;
          }
        } else {
          salarioBruto = valorHora * (horasMensaisBase * diasTrabalhados / 30);
          salarioMensalCompleto = valorHora * (horasMensaisBase * diasNoMes / 30);
        }

        const valorAdiantamento = salarioBruto * (percentual / 100);

        // ── IRRF sobre adiantamento (proporcional ao percentual) ──────
        // Para desligados/férias, usar salário real do mês (proporcional), não o cheio
        const salarioBaseIR = (diasAusentesAviso > 0 || diasFeriasNoMes > 0) ? salarioBruto : salarioMensalCompleto;
        const inssEmpregado = calcularINSS(salarioBaseIR);
        const baseIR = salarioBaseIR - inssEmpregado;
        const irrfMensal = calcularIRRF(baseIR, salarioBaseIR);
        const irAdiantamento = irrfMensal > 0 ? Math.round(irrfMensal * (percentual / 100) * 100) / 100 : 0;
        const valorTotalVale = valorAdiantamento;
        const valorLiquidoVale = valorTotalVale - irAdiantamento;

        // Para regra de bloqueio: férias úteis na quinzena 1-15
        const diasFeriasQuinzena = feriasQuinzenaMap.get(emp.id) || 0;
        const diasTrabalhadosNaQuinzena = Math.max(0, diasUteisFirstHalf - faltas - diasFeriasQuinzena);

        // ── Regras de bloqueio ────────────────────────────────────────────
        const motivosBloqueio: string[] = [];
        const isDesligadoAviso = avisoUltimoDiaMap.has(emp.id);

        // 0) Desligado em aviso prévio — alerta informativo (vale proporcional)
        if (isDesligadoAviso) {
          motivosBloqueio.push(`Desligado em aviso prévio — vale proporcional (${diasTrabalhados}/${diasNoMes} dias trabalhados no mês)`);
        }

        // 1) Menos de 10 dias trabalhados por faltas + férias na quinzena
        if (diasTrabalhadosNaQuinzena < 10) {
          const detalhes = [
            faltas > 0 ? `${faltas} falta(s)` : null,
            diasFeriasQuinzena > 0 ? `${diasFeriasQuinzena} dia(s) de férias` : null,
            isDesligadoAviso ? `aviso prévio até dia ${avisoUltimoDia}` : null,
          ].filter(Boolean).join(", ");
          motivosBloqueio.push(`Menos de 10 dias trabalhados na quinzena (${diasTrabalhadosNaQuinzena} dias${detalhes ? ` — ${detalhes}` : ""})`);
        }

        // 2) Admitido no mês de referência (menos de 10 dias disponíveis)
        if (emp.dataAdmissao) {
          const admDate = new Date(emp.dataAdmissao + "T12:00:00Z");
          const admYear = admDate.getUTCFullYear();
          const admMonth = admDate.getUTCMonth() + 1;
          if (admYear === year && admMonth === month) {
            motivosBloqueio.push(`Admitido no mês de referência (${emp.dataAdmissao}) — menos de 10 dias trabalhados`);
          }
        }

        const bloqueado = motivosBloqueio.length > 0;
        // Se o RH já aprovou manualmente este alerta em uma decisão anterior, ignorar o bloqueio
        const foiAprovadoManualmente = aprovadosAlertaSet.has(emp.id);
        const motivoBloqueio = foiAprovadoManualmente
          ? motivosBloqueio.join(" | ") + " [APROVADO MANUALMENTE]"
          : motivosBloqueio.join(" | ");

        const isRejeitadoPrev = rejeitadosSet.has(emp.id);
        if (bloqueado && !foiAprovadoManualmente && !isRejeitadoPrev) {
          bloqueados++;
          const alertaTipo = motivosBloqueio.length > 1 ? "multiplo"
            : isDesligadoAviso ? "aviso_previo_proporcional"
            : diasFeriasNoMes > 0 ? "ferias_proporcional"
            : faltas > 0 ? "faltas_excessivas"
            : "admissao_recente";
          advanceInsertRows.push(sql`(${emp.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatMoney(salarioBruto)}, ${percentual},
            ${formatMoney(valorAdiantamento)}, ${formatMoney(valorHE)}, ${minutesToHHMM(minutosHE)}, ${formatMoney(valorTotalVale)},
            ${formatMoney(irAdiantamento)}, ${formatMoney(valorLiquidoVale)},
            ${1}, ${motivoBloqueio},
            ${faltas}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis}, ${'alerta'})`);
          results.push({
            employeeId: emp.id, nome: emp.nomeCompleto, valorHora, salarioBruto,
            valorAdiantamento, valorHE, valorTotalVale,
            irRetido: irAdiantamento, valorLiquido: valorLiquidoVale,
            isMensalista,
            temAlerta: true, alertaTipo, alertaMotivo: motivoBloqueio,
            bloqueado: true, faltas, minutosHE, status: 'alerta',
          });
          continue;
        }

        // Aprovado automaticamente, aprovado manualmente ou previously rejeitado
        const savedMotivo = foiAprovadoManualmente ? motivoBloqueio : null;
        advanceInsertRows.push(sql`(${emp.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatMoney(salarioBruto)}, ${percentual},
          ${formatMoney(valorAdiantamento)}, ${formatMoney(valorHE)}, ${minutesToHHMM(minutosHE)}, ${formatMoney(valorTotalVale)},
          ${formatMoney(irAdiantamento)}, ${formatMoney(valorLiquidoVale)},
          ${0}, ${savedMotivo},
          ${faltas}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis}, ${'calculado'})`);

        if (!isRejeitadoPrev) {
          eventInsertRows.push(sql`(${emp.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista},
            ${formatMoney(valorLiquidoVale)}, 'consolidado', ${emp.id}, ${emp.nomeCompleto},
            ${`Vale ${input.mesReferencia} - ${emp.nomeCompleto}`}, 'payroll_advance', ${ctx.user.name || "Sistema"})`);
          totalVale += valorLiquidoVale;
        }

        const temAlertaFerias = !foiAprovadoManualmente && !isRejeitadoPrev && diasFeriasNoMes > 0;
        const temAlertaAviso = !foiAprovadoManualmente && !isRejeitadoPrev && isDesligadoAviso;
        const temAlertaInfo = temAlertaFerias || temAlertaAviso;
        const alertaMotivoList: string[] = [];
        if (temAlertaAviso) alertaMotivoList.push(`Desligado em aviso prévio — vale proporcional (${diasTrabalhados}/${diasNoMes} dias trabalhados)`);
        if (temAlertaFerias) alertaMotivoList.push(`Férias no mês: ${diasFeriasNoMes} dia(s) — salário proporcional (${diasTrabalhados}/${diasNoMes} dias trabalhados)`);
        const alertaTipoFinal = temAlertaAviso ? "aviso_previo_proporcional" : temAlertaFerias ? "ferias_proporcional" : "";
        results.push({
          employeeId: emp.id, nome: emp.nomeCompleto, valorHora, salarioBruto,
          valorAdiantamento, valorHE, valorTotalVale,
          irRetido: irAdiantamento, valorLiquido: valorLiquidoVale,
          isMensalista,
          temAlerta: temAlertaInfo, alertaTipo: alertaTipoFinal,
          alertaMotivo: alertaMotivoList.join(" | "),
          bloqueado: false, faltas, minutosHE, status: isRejeitadoPrev ? 'rejeitado' : 'calculado',
        });
      }

      // Batch INSERT all advances in one query
      if (advanceInsertRows.length > 0) {
        await db.execute(sql`
          INSERT INTO payroll_advances ("companyId", "employeeId", "mesReferencia", "salarioBrutoMes", "percentualAdiantamento",
            "valorAdiantamento", "valorHorasExtras", "horasExtrasQtd", "valorTotalVale",
            "irRetidoAdiantamento", "valorLiquidoVale",
            "bloqueado", "motivoBloqueio",
            "faltasNoPeriodo", "valorHora", "cargaHorariaDiaria", "diasUteisNoMes", status)
          VALUES ${sql.join(advanceInsertRows, sql`,`)}
        `);
      }

      // Re-apply 'rejeitado' status to previously-rejected employees
      for (const empId of rejeitadosSet) {
        await db.execute(sql`
          UPDATE payroll_advances SET status = 'rejeitado'
          WHERE "mesReferencia" = ${input.mesReferencia}
            AND "employeeId" = ${empId}
        `);
      }

      // Batch INSERT all financial events in one query
      if (eventInsertRows.length > 0) {
        // Also delete existing financial events for this vale (avoid duplicates on recalc)
        for (const cid of allCompanyIds) {
          await db.execute(sql`DELETE FROM financial_events WHERE "companyId" = ${cid} AND "mesCompetencia" = ${input.mesReferencia} AND "origemTipo" = 'payroll_advance'`);
        }
        await db.execute(sql`
          INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "criadoPor")
          VALUES ${sql.join(eventInsertRows, sql`,`)}
        `);
      }

      const valeResultPayload = {
        totalFuncionarios: empList.length,
        totalAlertas: bloqueados,
        totalVale,
        diasUteis,
        percentual: criteria.percentualAdiantamento,
        funcionarios: results,
        excluidos: excluidos.map(e => ({ id: e.id, nome: e.nomeCompleto })),
        message: bloqueados > 0 
          ? `Vale calculado: ${empList.length} funcionários, ${bloqueados} com alerta (decisão pendente), total R$ ${formatMoney(totalVale)}`
          : `Vale calculado: ${empList.length} funcionários, total R$ ${formatMoney(totalVale)}`,
      };
      const valeJson = JSON.stringify(valeResultPayload);

      // Update period for all companies
      for (const cid of allCompanyIds) {
        const companyVale = advanceInsertRows.length > 0 ? totalVale : 0;
        await db.execute(sql`
          UPDATE payroll_periods SET 
            status = 'vale_gerado',
            "valeGeradoEm" = NOW(),
            "valeGeradoPor" = ${ctx.user.name || "Sistema"},
            "totalVale" = ${formatMoney(companyVale)},
            "valeResultJson" = ${valeJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
      }

      return valeResultPayload;
      } catch (err: any) {
        console.error('[gerarVale] Erro:', err?.message || err, err?.stack);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao calcular vale: ${err?.message || 'erro desconhecido'}` });
      }
    }),

  // ============================================================
  // 5. LISTAR VALES DO MÊS
  // ============================================================
  listarVales: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pa.*, e."nomeCompleto", e.funcao, e."codigoInterno"
        FROM payroll_advances pa
        LEFT JOIN employees e ON pa."employeeId" = e.id
        WHERE pa."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pa."mesReferencia" = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 5b. DECIDIR VALE (usuário aprova ou rejeita para funcionários com alerta)
  // ============================================================
  decidirVale: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      decisoes: z.array(z.object({
        employeeId: z.number(),
        pagar: z.boolean(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { year, month } = parseMesRef(input.mesReferencia);
      const criteria = await getPayrollCriteria(db, input.companyId);
      const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;
      
      let aprovados = 0;
      let rejeitados = 0;
      
      for (const decisao of input.decisoes) {
        if (decisao.pagar) {
          // Aprovar: mudar status para 'calculado', bloqueado = 0
          const aprovadoPorNome = ctx.user.name || "Usuário";
          await db.execute(sql`
            UPDATE payroll_advances SET status = 'calculado', bloqueado = 0,
              "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ${` [APROVADO por ${aprovadoPorNome}]`}
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `);
          // Create financial event for approved
          const advRows = ((await db.execute(sql`
            SELECT "valorTotalVale", "valorLiquidoVale" FROM payroll_advances 
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `)) as any).rows || [];
          const adv = (advRows as any[])?.[0];
          if (adv) {
            const valorFinanceiro = adv.valorLiquidoVale ?? adv.valorTotalVale;
            const empRows = ((await db.execute(sql`SELECT "nomeCompleto" FROM employees WHERE id = ${decisao.employeeId}`)) as any).rows || [];
            const empName = (empRows as any[])?.[0]?.nomeCompleto || 'Funcionário';
            await db.execute(sql`
              INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "criadoPor")
              VALUES (${input.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista}, ${valorFinanceiro}, 'consolidado', ${decisao.employeeId}, ${empName}, ${`Vale ${input.mesReferencia} - ${empName} (aprovado manualmente)`}, 'payroll_advance', ${ctx.user.name || "Sistema"})
            `);
          }
          aprovados++;
        } else {
          // Rejeitar: mudar status para 'rejeitado', manter bloqueado = 1
          const rejeitadoPorNome = ctx.user.name || "Usuário";
          await db.execute(sql`
            UPDATE payroll_advances SET status = 'rejeitado',
              "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ${` [REJEITADO por ${rejeitadoPorNome}]`}
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `);
          rejeitados++;
        }
      }
      
      return {
        aprovados,
        rejeitados,
        message: `Decisão registrada: ${aprovados} aprovados, ${rejeitados} rejeitados`,
      };
    }),

  reverterVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string(), employeeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const revertidoPorNome = ctx.user.name || "Usuário";
      await db.execute(sql`
        UPDATE payroll_advances SET status = 'calculado', bloqueado = 0,
          "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ${` [REVERTIDO por ${revertidoPorNome}]`}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `);
      // Re-add financial event for this employee
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;
      const advRows = ((await db.execute(sql`
        SELECT "valorTotalVale", "valorLiquidoVale" FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `)) as any).rows || [];
      const adv = (advRows as any[])?.[0];
      if (adv) {
        const valorFinanceiro = adv.valorLiquidoVale ?? adv.valorTotalVale;
        const empRows = ((await db.execute(sql`SELECT "nomeCompleto" FROM employees WHERE id = ${input.employeeId}`)) as any).rows || [];
        const empName = (empRows as any[])?.[0]?.nomeCompleto || 'Funcionário';
        await db.execute(sql`
          INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "criadoPor")
          VALUES (${input.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista}, ${valorFinanceiro}, 'consolidado', ${input.employeeId}, ${empName}, ${`Vale ${input.mesReferencia} - ${empName} (revertido)`}, 'payroll_advance', ${ctx.user.name || "Sistema"})
        `);
      }
      return { message: "Vale revertido com sucesso" };
    }),

  editarValorVale: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      employeeId: z.number(),
      novoValor: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Master podem editar valores de vale." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const valorNum = parseFloat(input.novoValor.replace(/[^\d.,]/g, "").replace(",", "."));
      if (isNaN(valorNum) || valorNum < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valor inválido." });
      }
      const valorFormatado = valorNum.toFixed(2);

      const oldRows = ((await db.execute(sql`
        SELECT "valorTotalVale", "valorAdiantamento", "irRetidoAdiantamento", "valorLiquidoVale",
               "salarioBrutoMes", "percentualAdiantamento"
        FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `)) as any).rows || [];
      if (oldRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro de vale não encontrado." });
      }
      const row = oldRows[0];
      const valorAnterior = row.valorTotalVale;
      const editadoPor = ctx.user.name || "Master";
      const obs = `[EDITADO por ${editadoPor}: R$ ${valorAnterior} → R$ ${valorFormatado}${input.motivo ? ` | Motivo: ${input.motivo}` : ""}]`;

      const salarioBruto = parseFloat(row.salarioBrutoMes) || 0;
      const percentual = parseFloat(row.percentualAdiantamento) || 40;
      const inss = calcularINSS(salarioBruto);
      const baseIR = salarioBruto - inss;
      const irrfMensal = calcularIRRF(baseIR, salarioBruto);
      const irProporcional = irrfMensal > 0 ? Math.round(irrfMensal * (percentual / 100) * 100) / 100 : 0;
      const novoIR = Math.min(irProporcional, valorNum);
      const novoLiquido = Math.max(valorNum - novoIR, 0);

      await db.execute(sql`
        UPDATE payroll_advances
        SET "valorTotalVale" = ${valorFormatado},
            "valorAdiantamento" = ${valorFormatado},
            "irRetidoAdiantamento" = ${novoIR.toFixed(2)},
            "valorLiquidoVale" = ${novoLiquido.toFixed(2)},
            "observacoes" = COALESCE("observacoes", '') || ${' ' + obs},
            "updatedAt" = NOW()
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
      `);

      await db.execute(sql`
        UPDATE financial_events
        SET valor = ${novoLiquido.toFixed(2)},
            descricao = descricao || ${` (valor editado: ${valorAnterior} → ${valorFormatado}, líquido: ${novoLiquido.toFixed(2)})`}
        WHERE "companyId" = ${input.companyId}
          AND "mesCompetencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
          AND "origemTipo" = 'payroll_advance'
          AND tipo = 'saida_vale'
      `);

      return { success: true, valorAnterior, novoValor: valorFormatado, novoLiquido: novoLiquido.toFixed(2), message: `Vale editado: R$ ${valorAnterior} → R$ ${valorFormatado} (líquido: R$ ${novoLiquido.toFixed(2)})` };
    }),

  // ============================================================
  // 6. SIMULAR PAGAMENTO
  // ============================================================
  simularPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // --- GUARD: block re-simulation if pagamento is consolidated ---
      const ppPagGuard = ((await db.execute(sql`
        SELECT "pagamentoConsolidadoEm" FROM payroll_periods
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (ppPagGuard.length > 0 && ppPagGuard[0].pagamentoConsolidadoEm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Pagamento consolidado — desconsolide primeiro para resimular.",
        });
      }

      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);
      const nextMes = getNextMesRef(input.mesReferencia);
      const nextParsed = parseMesRef(nextMes);

      const allCltAtivos = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        horasMensais: employees.horasMensais,
        funcao: employees.funcao,
        codigoInterno: employees.codigoInterno,
        pensaoAlimenticia: employees.pensaoAlimenticia,
        pensaoValor: employees.pensaoValor,
        pensaoTipo: employees.pensaoTipo,
        pensaoPercentual: employees.pensaoPercentual,
        vtValorDiario: employees.vtValorDiario,
        seguroVida: employees.seguroVida,
        fgtsPercentual: employees.fgtsPercentual,
        inssPercentual: employees.inssPercentual,
        vaRecebe: employees.vaRecebe,
        vaValor: employees.vaValor,
        banco: employees.banco,
        bancoNome: employees.bancoNome,
        agencia: employees.agencia,
        conta: employees.conta,
        tipoConta: employees.tipoConta,
        tipoChavePix: employees.tipoChavePix,
        chavePix: employees.chavePix,
        bancoPix: employees.bancoPix,
        cpf: employees.cpf,
        status: employees.status,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
        )
      );

      const divergencias: { employeeId: number; nome: string; funcao: string | null; motivo: string }[] = [];
      const empList = allCltAtivos.filter(emp => {
        if (!emp.valorHora || emp.valorHora === '') {
          divergencias.push({
            employeeId: emp.id,
            nome: emp.nomeCompleto,
            funcao: emp.funcao,
            motivo: `Valor hora não preenchido${!emp.salarioBase ? ' e salário base também vazio' : ' (salário base: R$ ' + emp.salarioBase + ')'}`,
          });
          return false;
        }
        return true;
      });

      // Get advances for this month
      const advRows = ((await db.execute(sql`
        SELECT * FROM payroll_advances 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const advMap = new Map<number, any>();
      for (const a of (advRows || [])) {
        advMap.set(a.employeeId, a);
      }

      // Get adjustments (from escuro aferição) for this month
      const adjRows = ((await db.execute(sql`
        SELECT * FROM payroll_adjustments 
        WHERE "companyId" = ${input.companyId} AND "mesDesconto" = ${input.mesReferencia} AND status = 'pendente'
      `)) as any).rows || [];
      const adjMap = new Map<number, any[]>();
      for (const a of (adjRows || [])) {
        if (!adjMap.has(a.employeeId)) adjMap.set(a.employeeId, []);
        adjMap.get(a.employeeId)!.push(a);
      }

      // Get faltas from timecard_daily for the ponto period (registrado only)
      const faltasRows2 = ((await db.execute(sql`
        SELECT "employeeId", 
          SUM("isFalta") as "totalFaltas",
          SUM("isAtraso") as "totalAtrasos",
          SUM("minutosAtraso") as "totalMinutosAtraso"
        FROM timecard_daily 
        WHERE "companyId" = ${input.companyId} 
        AND "mesCompetencia" = ${input.mesReferencia}
        AND "statusDia" = 'registrado'
        GROUP BY "employeeId"
      `)) as any).rows || [];
      const faltasMap = new Map<number, any>();
      for (const r of (faltasRows2 || [])) {
        faltasMap.set(Number(r.employeeId), r);
      }

      // HE is now a SEPARATE MODULE (he_periods) — simularPagamento = salário base only
      // HE is tracked and paid via the dedicated HE module in Folha → Hora Extra

      // Clear existing payments for this month
      await db.execute(sql`
        DELETE FROM payroll_payments WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      const results: any[] = [];
      let grandTotalLiquido = 0;
      let grandTotalBruto = 0;
      let grandTotalDescontos = 0;

      // Calculate 5th business day of next month
      const dataPagamentoPrevista = getNthBusinessDay(nextParsed.year, nextParsed.month, criteria.diaPagamento);

      const empIds = empList.map(e => e.id);
      const empIdsSql = sql.join(empIds.map(id => sql`${id}`), sql`,`);
      const allCompanyIds = resolveCompanyIds(input);

      // PRE-FETCH: VR diário for all employees in one query
      const vrBatchRows = ((await db.execute(sql`
        SELECT DISTINCT ON ("employeeId") "employeeId", "valorDiario"
        FROM vr_benefits
        WHERE "companyId" = ${input.companyId} AND "employeeId" IN (${empIdsSql})
        ORDER BY "employeeId", "mesReferencia" DESC
      `)) as any).rows || [];
      const vrDiarioMap = new Map<number, number>();
      for (const r of vrBatchRows) vrDiarioMap.set(Number(r.employeeId), parseBRL(r.valorDiario));

      // PRE-FETCH: VA (vr_benefits valorTotal) for this competência
      const vaBatchRows = ((await db.execute(sql`
        SELECT "employeeId", "valorTotal" FROM vr_benefits
        WHERE "companyId" = ${input.companyId} AND "employeeId" IN (${empIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const vaMap = new Map<number, number>();
      for (const r of vaBatchRows) vaMap.set(Number(r.employeeId), parseBRL(r.valorTotal));

      // PRE-FETCH: Obra dias for all employees in one query
      const obraBatchRows = ((await db.execute(sql`
        SELECT td."employeeId", td."obraId", COUNT(*) as dias, o.nome as "obraNome"
        FROM timecard_daily td
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td."employeeId" IN (${empIdsSql})
          AND td."companyId" IN (${sql.join(allCompanyIds.map(id => sql`${id}`), sql`,`)})
          AND td."mesCompetencia" = ${input.mesReferencia}
          AND td."statusDia" = 'registrado'
          AND td."obraId" IS NOT NULL
        GROUP BY td."employeeId", td."obraId", o.nome
      `)) as any).rows || [];
      const obraMap = new Map<number, any[]>();
      for (const r of obraBatchRows) {
        if (!obraMap.has(Number(r.employeeId))) obraMap.set(Number(r.employeeId), []);
        obraMap.get(Number(r.employeeId))!.push(r);
      }

      // PRE-FETCH: Convênios for all employees in one query
      const convenioBatchRows = ((await db.execute(sql`
        SELECT lp."employeeId" as employee_id, COALESCE(SUM(CAST(lp.valor AS DECIMAL(15,2))), 0) as "totalConvenio"
        FROM lancamentos_parceiros lp
        WHERE lp."employeeId" IN (${empIdsSql}) AND lp."companyId" = ${input.companyId}
          AND lp.competencia_desconto = ${input.mesReferencia}
          AND lp.status IN ('pendente', 'aprovado')
        GROUP BY lp."employeeId"
      `)) as any).rows || [];
      const convenioMap = new Map<number, number>();
      for (const r of convenioBatchRows) convenioMap.set(Number(r.employee_id), parseFloat(r.totalConvenio || '0'));

      const paymentInsertRows: any[] = [];

      // Dias reais do mês para cálculo proporcional do horista (220h = ref 30 dias)
      const diasNoMesSim = new Date(year, month, 0).getDate();

      for (const emp of empList) {
        const valorHora = parseBRL(emp.valorHora);
        // CLT horista: 220h = referência de 30 dias. Proporcional ao número real de dias do mês.
        const horasMensaisBaseEmp = emp.horasMensais ? Number(emp.horasMensais) : 220;
        const horasMensaisEmp = horasMensaisBaseEmp * diasNoMesSim / 30;
        const salarioBruto = valorHora * horasMensaisEmp;
        // HE = 0 — Hora Extra é módulo separado (he_periods)
        const valorHE = 0;
        const totalProventos = salarioBruto;

        const adv = advMap.get(emp.id);
        const descontoAdiantamento = adv ? parseBRL(adv.valorTotalVale) : 0;

        const faltaData = faltasMap.get(emp.id);
        const faltasQtd = faltaData?.totalFaltas || 0;
        const atrasosMinutos = faltaData?.totalMinutosAtraso || 0;
        const descontoFaltas = faltasQtd * valorHora * criteria.cargaHorariaDiaria;
        const descontoAtrasos = (atrasosMinutos / 60) * valorHora;

        const vrDiario = vrDiarioMap.get(emp.id) || 0;
        const descontoVrFaltas = criteria.descontoVrFalta ? faltasQtd * vrDiario : 0;

        const vaLancamento = vaMap.get(emp.id) || 0;
        const vaDescontoPct = 0.05;
        const vaDescontoBase = vaLancamento * vaDescontoPct;
        const vaDescontoFaltas = faltasQtd > 0 ? (vaLancamento / diasUteis) * faltasQtd * vaDescontoPct : 0;
        const descontoVaTotal = vaDescontoBase - vaDescontoFaltas;

        const vtDiario = parseBRL(emp.vtValorDiario);
        const vtValorMensal = vtDiario * diasUteis;
        const descontoVtFaltas = criteria.descontoVtFalta ? faltasQtd * vtDiario : 0;

        let descontoPensao = 0;
        if (emp.pensaoAlimenticia) {
          descontoPensao = emp.pensaoTipo === "percentual"
            ? salarioBruto * (parseBRL(emp.pensaoPercentual) / 100)
            : parseBRL(emp.pensaoValor);
        }

        const adjustments = adjMap.get(emp.id) || [];
        const acertoEscuroValor = adjustments.reduce((acc: number, a: any) => acc + parseBRL(a.valorTotal), 0);
        const acertoEscuroDetalhes = adjustments.map((a: any) => ({ data: a.data, tipo: a.tipo, valor: a.valorTotal, descricao: a.descricao }));

        const vaValor = vaLancamento;
        const vrValorMensal = vrDiario * diasUteis;
        const seguroVidaValor = parseBRL(emp.seguroVida);
        const fgtsPerc = parseBRL(emp.fgtsPercentual) || 8;
        const fgtsValor = salarioBruto * (fgtsPerc / 100);
        const inssPerc = parseBRL(emp.inssPercentual) || 0;
        const inssValor = inssPerc > 0 ? salarioBruto * (inssPerc / 100) : 0;

        const obraDiasRows = obraMap.get(emp.id) || [];
        const totalDiasObra = obraDiasRows.reduce((s: number, r: any) => s + Number(r.dias), 0) || diasUteis;
        const rateioPorObra = obraDiasRows.map((r: any) => {
          const proporcao = Number(r.dias) / totalDiasObra;
          return {
            obraId: r.obraId, obraNome: r.obraNome || 'Sem obra', dias: Number(r.dias),
            proporcao: Math.round(proporcao * 10000) / 10000,
            salario: Math.round(salarioBruto * proporcao * 100) / 100,
            va: Math.round(vaValor * proporcao * 100) / 100,
            vt: Math.round(vtValorMensal * proporcao * 100) / 100,
            vr: Math.round(vrValorMensal * proporcao * 100) / 100,
            seguro: Math.round(seguroVidaValor * proporcao * 100) / 100,
            fgts: Math.round(fgtsValor * proporcao * 100) / 100,
            inss: Math.round(inssValor * proporcao * 100) / 100,
          };
        });

        const descontoConvenio = convenioMap.get(emp.id) || 0;
        const totalDescontos = descontoAdiantamento + descontoFaltas + descontoAtrasos + descontoVrFaltas + descontoVaTotal + descontoVtFaltas + descontoPensao + acertoEscuroValor + inssValor + descontoConvenio;
        const salarioLiquido = totalProventos - totalDescontos;

        paymentInsertRows.push(sql`(${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis},
          ${formatMoney(salarioBruto)}, ${formatMoney(valorHE)}, ${formatMoney(totalProventos)},
          ${formatMoney(descontoAdiantamento)}, ${formatMoney(descontoFaltas)}, ${faltasQtd}, ${formatMoney(descontoAtrasos)}, ${atrasosMinutos},
          ${formatMoney(descontoVrFaltas)}, ${formatMoney(descontoVtFaltas)}, ${formatMoney(descontoPensao)}, ${formatMoney(inssValor)}, ${formatMoney(fgtsValor)}, ${formatMoney(descontoConvenio)},
          ${formatMoney(totalDescontos)}, ${formatMoney(acertoEscuroValor)}, ${JSON.stringify(acertoEscuroDetalhes)}, ${formatMoney(salarioLiquido)},
          'simulado', ${dataPagamentoPrevista})`);

        grandTotalLiquido += salarioLiquido;
        grandTotalBruto += salarioBruto;
        grandTotalDescontos += totalDescontos;

        results.push({
          employeeId: emp.id, nome: emp.nomeCompleto, funcao: emp.funcao, codigoInterno: emp.codigoInterno,
          salarioBruto, valorHE, totalProventos, descontoAdiantamento, descontoFaltas, faltasQtd,
          descontoAtrasos, descontoVrFaltas, descontoVtFaltas, descontoVaTotal, descontoPensao,
          descontoInss: inssValor, descontoFgts: fgtsValor, acertoEscuroValor, descontoConvenio,
          totalDescontos, salarioLiquido, dataPagamentoPrevista, vaValor,
          vtValor: vtValorMensal, vtDiario, vrValor: vrValorMensal, seguroVidaValor, rateioPorObra,
          banco: emp.banco || null, bancoNome: emp.bancoNome || null,
          agencia: emp.agencia || null, conta: emp.conta || null,
          tipoConta: emp.tipoConta || null, tipoChavePix: emp.tipoChavePix || null,
          chavePix: emp.chavePix || null, bancoPix: emp.bancoPix || null, cpf: emp.cpf || null,
        });
      }

      // Batch INSERT all payments in one query
      if (paymentInsertRows.length > 0) {
        await db.execute(sql`
          INSERT INTO payroll_payments ("companyId", "employeeId", "mesReferencia", "valorHora", "cargaHorariaDiaria", "diasUteisNoMes",
            "salarioBrutoMes", "horasExtrasValor", "totalProventos",
            "descontoAdiantamento", "descontoFaltas", "descontoFaltasQtd", "descontoAtrasos", "descontoAtrasosMinutos",
            "descontoVrFaltas", "descontoVtFaltas", "descontoPensao", "descontoInss", "descontoFgts", "descontoOutros",
            "totalDescontos", "acertoEscuroValor", "acertoEscuroDetalhes", "salarioLiquido",
            status, "dataPagamentoPrevista")
          VALUES ${sql.join(paymentInsertRows, sql`,`)}
        `);
      }

      const pagamentoResultPayload = {
        totalFuncionarios: empList.length,
        totalCltAtivos: allCltAtivos.length,
        totalBruto: grandTotalBruto,
        totalDescontos: grandTotalDescontos,
        totalLiquido: grandTotalLiquido,
        dataPagamentoPrevista,
        diasUteis,
        funcionarios: results,
        divergencias,
        message: divergencias.length > 0
          ? `Simulação concluída: ${empList.length} de ${allCltAtivos.length} CLTs ativos processados. ATENÇÃO: ${divergencias.length} funcionário(s) excluído(s) da folha — verifique as divergências.`
          : `Simulação concluída: ${empList.length} funcionários, líquido total R$ ${formatMoney(grandTotalLiquido)}`,
      };
      const pagJson = JSON.stringify(pagamentoResultPayload);

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'pagamento_simulado',
          "pagamentoSimuladoEm" = NOW(),
          "pagamentoSimuladoPor" = ${ctx.user.name || "Sistema"},
          "totalSalarioBruto" = ${formatMoney(grandTotalBruto)},
          "totalDescontos" = ${formatMoney(grandTotalDescontos)},
          "totalLiquido" = ${formatMoney(grandTotalLiquido)},
          "pagamentoResultJson" = ${pagJson}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      return pagamentoResultPayload;
    }),

  // ============================================================
  // 7. LISTAR PAGAMENTOS
  // ============================================================
  listarPagamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pp.*, e."nomeCompleto", e.funcao, e."codigoInterno",
          e.banco, e."bancoNome", e.agencia, e.conta, e."tipoConta",
          e."tipoChavePix", e."chavePix", e."bancoPix", e.cpf
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp."mesReferencia" = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];
      return rows || [];
    }),

  validarDivergenciasFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const allCltAtivos = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "valorHora", "salarioBase", status, banco, agencia, conta, cpf
        FROM employees
        WHERE "companyId" = ${input.companyId}
          AND "tipoContrato" = 'CLT'
          AND status IN ('Ativo', 'Ferias')
          AND "deletedAt" IS NULL
      `)) as any).rows || [];

      const pagamentos = ((await db.execute(sql`
        SELECT "employeeId" FROM payroll_payments
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      const pagEmployeeIds = new Set(pagamentos.map((p: any) => p.employeeId));

      const divergencias: { employeeId: number; nome: string; funcao: string | null; motivo: string }[] = [];

      for (const emp of allCltAtivos) {
        if (!pagEmployeeIds.has(emp.id)) {
          const motivos: string[] = [];
          if (!emp.valorHora || emp.valorHora === '') motivos.push('Valor hora não preenchido');
          if (!emp.salarioBase) motivos.push('Salário base vazio');
          if (!emp.cpf) motivos.push('CPF não preenchido');
          if (!emp.banco && !emp.conta) motivos.push('Dados bancários não preenchidos');
          divergencias.push({
            employeeId: emp.id,
            nome: emp.nomeCompleto,
            funcao: emp.funcao,
            motivo: motivos.length > 0 ? motivos.join('; ') : 'Não foi incluído na última simulação (motivo desconhecido)',
          });
        }
      }

      const empNaFolhaMasInativo: { employeeId: number; nome: string; funcao: string | null; motivo: string }[] = [];
      const allCltIds = new Set(allCltAtivos.map((e: any) => e.id));
      const indevidoIds = pagamentos.filter((p: any) => !allCltIds.has(p.employeeId)).map((p: any) => p.employeeId);
      if (indevidoIds.length > 0) {
        const indevidoRows = ((await db.execute(sql`
          SELECT id, "nomeCompleto", funcao, status, "tipoContrato"
          FROM employees
          WHERE id IN (${sql.join(indevidoIds.map((id: number) => sql`${id}`), sql`,`)})
        `)) as any).rows || [];
        for (const empRow of indevidoRows) {
          empNaFolhaMasInativo.push({
            employeeId: empRow.id,
            nome: empRow.nomeCompleto,
            funcao: empRow.funcao,
            motivo: `Na folha mas status atual: ${empRow.status} / contrato: ${empRow.tipoContrato}`,
          });
        }
      }

      return {
        totalCltAtivos: allCltAtivos.length,
        totalNaFolha: pagamentos.length,
        temDivergencia: divergencias.length > 0 || empNaFolhaMasInativo.length > 0,
        excluidos: divergencias,
        indevidos: empNaFolhaMasInativo,
      };
    }),

  auditarFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);

      const allCltAtivos = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, status, "dataAdmissao", "dataDemissao",
          "valorHora", "salarioBase", "horasMensais", banco, agencia, conta, cpf,
          "pensaoAlimenticia", "vtValorDiario", "seguroVida", "vaRecebe", "vaValor",
          "fgtsPercentual", "inssPercentual"
        FROM employees
        WHERE "companyId" = ${input.companyId}
          AND "tipoContrato" = 'CLT'
          AND status IN ('Ativo', 'Ferias')
          AND "deletedAt" IS NULL
        ORDER BY "nomeCompleto"
      `)) as any).rows || [];

      const vales = ((await db.execute(sql`
        SELECT "employeeId", "valorTotalVale", "valorAdiantamento", "percentualAdiantamento",
          "salarioBrutoMes", bloqueado, "motivoBloqueio", "faltasNoPeriodo",
          "horasExtrasQtd", "valorHorasExtras"
        FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const valeMap = new Map(vales.map((v: any) => [v.employeeId, v]));

      const pagamentos = ((await db.execute(sql`
        SELECT "employeeId", "salarioBrutoMes", "horasExtrasValor", "totalProventos",
          "descontoAdiantamento", "descontoFaltas", "descontoFaltasQtd",
          "descontoAtrasos", "descontoAtrasosMinutos", "descontoVrFaltas", "descontoVtFaltas",
          "descontoPensao", "descontoInss", "descontoIrrf", "descontoFgts",
          "descontoEpi", "descontoOutros", "descontoOutrosDetalhes",
          "totalDescontos", "salarioLiquido", "acertoEscuroValor", "acertoEscuroDetalhes", "adicionaisValor", "adicionaisDetalhes"
        FROM payroll_payments
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const pagMap = new Map(pagamentos.map((p: any) => [p.employeeId, p]));

      // ========== SEÇÕES ESTRUTURADAS ==========

      // 1. VALE: quem não recebeu
      const semVale: { nome: string; funcao: string | null; motivo: string; status: string }[] = [];
      const valeBloqueado: { nome: string; funcao: string | null; valor: string; motivo: string }[] = [];
      for (const emp of allCltAtivos) {
        const vale = valeMap.get(emp.id);
        if (!vale) {
          let motivo = '';
          if (emp.status === 'Ferias') motivo = 'Em férias — pagamento de férias já contempla a remuneração';
          else if (!emp.valorHora || emp.valorHora === '') motivo = 'Valor hora não cadastrado';
          else if (emp.dataAdmissao && new Date(emp.dataAdmissao) > new Date(year, month - 1, 15)) motivo = `Admitido em ${new Date(emp.dataAdmissao).toLocaleDateString('pt-BR')} (após dia 15)`;
          else motivo = 'Motivo não identificado — verificar cadastro';
          semVale.push({ nome: emp.nomeCompleto, funcao: emp.funcao, motivo, status: emp.status });
        } else if (vale.bloqueado === 1) {
          valeBloqueado.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valor: vale.valorTotalVale, motivo: vale.motivoBloqueio || 'Sem motivo registrado' });
        }
      }

      // 2. PAGAMENTO: quem não recebeu
      const semPagamento: { nome: string; funcao: string | null; motivo: string }[] = [];
      if (pagamentos.length > 0) {
        for (const emp of allCltAtivos) {
          if (!pagMap.has(emp.id)) {
            let motivo = 'Motivo não identificado';
            if (!emp.valorHora || emp.valorHora === '') motivo = 'Valor hora não cadastrado' + (!emp.salarioBase ? ' e salário base também vazio' : '');
            semPagamento.push({ nome: emp.nomeCompleto, funcao: emp.funcao, motivo });
          }
        }
      }

      // 3. VARIAÇÃO SALARIAL POR FUNÇÃO (structured)
      const variacaoSalarial: {
        funcao: string; qtd: number; variacao: number; explicacao: string;
        funcionarios: { nome: string; valorHora: string; bruto: number; he: number; liquido: number }[];
      }[] = [];
      const funcaoGroups = new Map<string, { nome: string; bruto: number; liquido: number; he: number; valorHora: string }[]>();
      for (const emp of allCltAtivos) {
        const pag = pagMap.get(emp.id);
        if (!pag || !emp.funcao) continue;
        const key = emp.funcao.toUpperCase().trim();
        if (!funcaoGroups.has(key)) funcaoGroups.set(key, []);
        funcaoGroups.get(key)!.push({
          nome: emp.nomeCompleto,
          bruto: parseFloat(pag.salarioBrutoMes) || 0,
          liquido: parseFloat(pag.salarioLiquido) || 0,
          he: parseFloat(pag.horasExtrasValor) || 0,
          valorHora: emp.valorHora || '0',
        });
      }
      for (const [funcao, emps] of funcaoGroups) {
        if (emps.length < 2) continue;
        const brutos = emps.map(e => e.bruto);
        const minB = Math.min(...brutos);
        const maxB = Math.max(...brutos);
        const diff = minB > 0 ? ((maxB - minB) / minB * 100) : 0;
        if (diff > 5) {
          const todosIguaisVH = new Set(emps.map(e => e.valorHora)).size === 1;
          const temHE = emps.some(e => e.he > 0);
          let explicacao = '';
          if (temHE && todosIguaisVH) explicacao = `Mesmo valor hora (R$ ${emps[0].valorHora}) — diferença causada por horas extras.`;
          else if (!todosIguaisVH) explicacao = 'Valores hora diferentes entre funcionários — verificar se está correto para a mesma função.';
          else explicacao = 'Verificar se houve bônus, adicional ou ajuste individual.';
          variacaoSalarial.push({
            funcao, qtd: emps.length, variacao: diff, explicacao,
            funcionarios: emps.sort((a, b) => a.bruto - b.bruto).map(e => ({
              nome: e.nome, valorHora: e.valorHora, bruto: e.bruto, he: e.he, liquido: e.liquido,
            })),
          });
        }
      }
      variacaoSalarial.sort((a, b) => b.variacao - a.variacao);

      // 4. FALTAS
      const comFaltas: { nome: string; funcao: string | null; faltas: number; valor: number; bruto: number }[] = [];
      // 5. ATRASOS
      const comAtrasos: { nome: string; funcao: string | null; minutos: number; valor: number }[] = [];
      // 6. DESCONTOS EXCESSIVOS (>50%)
      const descontosExcessivos: { nome: string; funcao: string | null; bruto: number; totalDesc: number; liquido: number; percentual: number; composicao: Record<string, number> }[] = [];
      // 7. HORAS EXTRAS (summary table)
      const comHorasExtras: { nome: string; funcao: string | null; valorHE: number; bruto: number; totalProventos: number }[] = [];
      // 8. DADOS BANCÁRIOS INCOMPLETOS
      const dadosBancariosIncompletos: { nome: string; funcao: string | null; problemas: string[] }[] = [];
      // 9. AJUSTES MANUAIS
      const ajustesManuais: { nome: string; funcao: string | null; valor: number; detalhes: string }[] = [];
      // 10. PENSÃO
      const comPensao: { nome: string; funcao: string | null; valor: number }[] = [];

      for (const emp of allCltAtivos) {
        const pag = pagMap.get(emp.id);
        if (!pag) continue;
        const bruto = parseFloat(pag.salarioBrutoMes) || 0;
        const liquido = parseFloat(pag.salarioLiquido) || 0;
        const totalDesc = parseFloat(pag.totalDescontos) || 0;
        const faltas = pag.descontoFaltasQtd || 0;
        const faltasVal = parseFloat(pag.descontoFaltas) || 0;
        const atrasosMin = pag.descontoAtrasosMinutos || 0;
        const atrasosVal = parseFloat(pag.descontoAtrasos) || 0;
        const pensao = parseFloat(pag.descontoPensao) || 0;
        const he = parseFloat(pag.horasExtrasValor) || 0;
        const acertoEscuro = parseFloat(pag.acertoEscuroValor) || 0;

        if (faltas > 0) comFaltas.push({ nome: emp.nomeCompleto, funcao: emp.funcao, faltas, valor: faltasVal, bruto });
        if (atrasosMin > 0) comAtrasos.push({ nome: emp.nomeCompleto, funcao: emp.funcao, minutos: atrasosMin, valor: atrasosVal });
        if (bruto > 0 && totalDesc / bruto > 0.5) {
          descontosExcessivos.push({
            nome: emp.nomeCompleto, funcao: emp.funcao, bruto, totalDesc, liquido, percentual: totalDesc / bruto * 100,
            composicao: {
              'Adiantamento': parseFloat(pag.descontoAdiantamento || '0'),
              'Faltas': faltasVal, 'Atrasos': atrasosVal,
              'INSS': parseFloat(pag.descontoInss || '0'), 'FGTS': parseFloat(pag.descontoFgts || '0'),
              'Pensão': pensao, 'EPI': parseFloat(pag.descontoEpi || '0'),
              'Outros': parseFloat(pag.descontoOutros || '0'),
            },
          });
        }
        if (he > 0) comHorasExtras.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valorHE: he, bruto, totalProventos: parseFloat(pag.totalProventos) || 0 });
        if (pensao > 0) comPensao.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valor: pensao });
        if (acertoEscuro !== 0) ajustesManuais.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valor: acertoEscuro, detalhes: pag.acertoEscuroDetalhes ? JSON.stringify(pag.acertoEscuroDetalhes) : '' });

        const problemas: string[] = [];
        if (!emp.banco && !emp.conta) problemas.push('Banco e conta');
        else { if (!emp.banco) problemas.push('Banco'); if (!emp.conta) problemas.push('Conta'); }
        if (!emp.agencia) problemas.push('Agência');
        if (!emp.cpf) problemas.push('CPF');
        if (problemas.length > 0) dadosBancariosIncompletos.push({ nome: emp.nomeCompleto, funcao: emp.funcao, problemas });
      }

      comFaltas.sort((a, b) => b.faltas - a.faltas);
      comAtrasos.sort((a, b) => b.minutos - a.minutos);
      comHorasExtras.sort((a, b) => b.valorHE - a.valorHE);
      descontosExcessivos.sort((a, b) => b.percentual - a.percentual);

      const totalErros = semPagamento.length + descontosExcessivos.length + variacaoSalarial.filter(v => v.variacao > 20).length;
      const totalWarnings = semVale.length + comFaltas.length + variacaoSalarial.filter(v => v.variacao <= 20).length + dadosBancariosIncompletos.length;

      return {
        mesReferencia: input.mesReferencia,
        totalCltAtivos: allCltAtivos.length,
        totalNaFolha: pagamentos.length,
        totalNoVale: vales.length,
        diasUteisNoMes: diasUteis,
        totalErros,
        totalWarnings,
        secoes: {
          semPagamento,
          semVale,
          valeBloqueado,
          variacaoSalarial,
          comFaltas,
          comAtrasos,
          descontosExcessivos,
          comHorasExtras,
          comPensao,
          ajustesManuais,
          dadosBancariosIncompletos,
        },
      };
    }),

  // ============================================================
  // 8. CONSOLIDAR PAGAMENTO
  // ============================================================
  consolidarPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), ignorarConferencia: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Verificar critério de conferência com contabilidade
      const criteria = await getPayrollCriteria(db, input.companyId);
      if (criteria.conferenciaContabilidade !== 'opcional' && !input.ignorarConferencia) {
        // Verificar se já fez upload de PDF da contabilidade para este mês
        const uploads = ((await db.execute(sql`
          SELECT COUNT(*) as total FROM payroll_uploads
          WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        `)) as any).rows || [];
        const totalUploads = uploads?.[0]?.total || 0;
        if (totalUploads === 0) {
          if (criteria.conferenciaContabilidade === 'obrigatoria') {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Conferência com contabilidade é OBRIGATÓRIA. Faça o upload do PDF da contabilidade e confira os valores antes de consolidar." });
          }
          // Se recomendada, retornar aviso para o frontend decidir
          return { alertaConferencia: true, message: "Conferência com contabilidade recomendada. Nenhum PDF da contabilidade foi enviado para este mês. Deseja consolidar mesmo assim?" };
        }
      }

      // Update all payments to consolidated
      await db.execute(sql`
        UPDATE payroll_payments SET 
          status = 'consolidado',
          "consolidadoPor" = ${ctx.user.name || "Sistema"},
          "consolidadoEm" = NOW()
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status = 'simulado'
      `);

      // Mark adjustments as applied
      await db.execute(sql`
        UPDATE payroll_adjustments SET status = 'aplicado'
        WHERE "companyId" = ${input.companyId} AND "mesDesconto" = ${input.mesReferencia} AND status = 'pendente'
      `);

      // Create financial events for payments
      const payments = ((await db.execute(sql`
        SELECT pp.*, e."nomeCompleto" FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp."mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      for (const p of (payments || [])) {
        await db.execute(sql`
          INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "origemId", "criadoPor")
          VALUES (${input.companyId}, 'saida_pagamento', 'folha_pagamento', ${input.mesReferencia}, ${p.dataPagamentoPrevista}, ${p.salarioLiquido}, 'consolidado', ${p.employeeId}, ${p.nomeCompleto}, ${`Pagamento ${input.mesReferencia} - ${p.nomeCompleto}`}, 'payroll_payment', ${p.id}, ${ctx.user.name || "Sistema"})
        `);
      }

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'consolidada',
          "consolidadoEm" = NOW(),
          "consolidadoPor" = ${ctx.user.name || "Sistema"}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      return { message: "Pagamento consolidado com sucesso" };
    }),

  // ============================================================
  // 9. TRAVAR COMPETÊNCIA
  // ============================================================
  travarCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'travada',
          "travadoEm" = NOW(),
          "travadoPor" = ${ctx.user.name || "Sistema"}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { message: "Competência travada com sucesso" };
    }),

  // ============================================================
  // 10. TIMECARD DAILY - Listar registros diários
  // ============================================================
  listarTimecardDaily: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      let baseQuery;
      if (input.employeeId) {
        baseQuery = sql`
          SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, o.nome as obraNome
          FROM timecard_daily td
          LEFT JOIN employees e ON td.employeeId = e.id
          LEFT JOIN obras o ON td.obraId = o.id
          WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td.mesCompetencia = ${input.mesReferencia}
          AND td.employeeId = ${input.employeeId}
          ORDER BY td.data, e.nomeCompleto
        `;
      } else {
        baseQuery = sql`
          SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, o.nome as obraNome
          FROM timecard_daily td
          LEFT JOIN employees e ON td.employeeId = e.id
          LEFT JOIN obras o ON td.obraId = o.id
          WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td.mesCompetencia = ${input.mesReferencia}
          ORDER BY td.data, e.nomeCompleto
        `;
      }
      const rows = ((await db.execute(baseQuery)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 11. RELATÓRIO DE DIVERGÊNCIAS
  // ============================================================
  relatorioDivergencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pa.*, e.nomeCompleto, e.funcao, e.codigoInterno
        FROM payroll_adjustments pa
        LEFT JOIN employees e ON pa.employeeId = e.id
        WHERE pa.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pa.mesDesconto = ${input.mesReferencia}
        ORDER BY pa.data, e.nomeCompleto
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 12. ALERTAS
  // ============================================================
  listarAlertas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      let query;
      if (input.mesReferencia) {
        query = sql`SELECT * FROM payroll_alerts WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} ORDER BY "createdAt" DESC`;
      } else {
        query = sql`SELECT * FROM payroll_alerts WHERE "companyId" = ${input.companyId} AND resolvido = 0 ORDER BY "createdAt" DESC LIMIT 50`;
      }
      const rows = ((await db.execute(query)) as any).rows || [];
      return rows || [];
    }),

  marcarAlertaLido: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_alerts SET lido = 1, lidoEm = NOW(), lidoPor = ${ctx.user.name || "Sistema"}
        WHERE id = ${input.alertId}
      `);
      return { success: true };
    }),

  resolverAlerta: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_alerts SET resolvido = 1, resolvidoEm = NOW(), resolvidoPor = ${ctx.user.name || "Sistema"}
        WHERE id = ${input.alertId}
      `);
      return { success: true };
    }),

  // ============================================================
  // 13. EVENTOS FINANCEIROS
  // ============================================================
  listarEventosFinanceiros: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const lim = input.limit || 100;
      let query;
      if (input.mesReferencia) {
        query = sql`SELECT * FROM financial_events WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia} ORDER BY "dataPrevista", tipo LIMIT ${lim}`;
      } else {
        query = sql`SELECT * FROM financial_events WHERE "companyId" = ${input.companyId} ORDER BY "dataPrevista" DESC LIMIT ${lim}`;
      }
      const rows = ((await db.execute(query)) as any).rows || [];
      return rows || [];
    }),

  previsaoFinanceira: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesesAFrente: z.number().default(6) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);

      // Get active employees for projection
      const empRows = ((await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CAST(REPLACE(REPLACE("valorHora", '.', ''), ',', '.') AS DECIMAL(10,2))) as "somaValorHora"
        FROM employees 
        WHERE "companyId" = ${input.companyId} AND "tipoContrato" = 'CLT' AND status IN ('Ativo', 'Ferias') AND "deletedAt" IS NULL
        AND "valorHora" IS NOT NULL AND "valorHora" != ''
      `)) as any).rows || [];
      const totalEmps = empRows[0]?.total || 0;
      const somaValorHora = empRows[0]?.somaValorHora || 0;

      const now = new Date();
      const projections: any[] = [];
      for (let i = 0; i < input.mesesAFrente; i++) {
        const projMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const y = projMonth.getFullYear();
        const m = projMonth.getMonth() + 1;
        const mesRef = `${y}-${String(m).padStart(2, "0")}`;
        const diasUteis = getDiasUteisNoMes(y, m);
        const salarioEstimado = somaValorHora * criteria.cargaHorariaDiaria * diasUteis;
        const valeEstimado = salarioEstimado * (criteria.percentualAdiantamento / 100);
        const pagamentoEstimado = salarioEstimado - valeEstimado;

        // Check if there's actual data
        const actual = ((await db.execute(sql`
          SELECT * FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${mesRef} LIMIT 1
        `)) as any).rows || [];
        const period = actual[0];

        projections.push({
          mesReferencia: mesRef,
          diasUteis,
          totalFuncionarios: totalEmps,
          salarioEstimado,
          valeEstimado,
          pagamentoEstimado,
          totalEstimado: salarioEstimado,
          status: period?.status || "projecao",
          valorReal: period ? parseBRL(period.totalLiquido) : null,
        });
      }

      return { projections, totalFuncionarios: totalEmps };
    }),

  // ============================================================
  // 14. DASHBOARD CUSTO POR OBRA
  // ============================================================
  custoPorObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      
      // Get timecard_daily grouped by obra
      const obraRows = ((await db.execute(sql`
        SELECT td.obraId, o.nome as obraNome,
          COUNT(DISTINCT td.employeeId) as totalFuncionarios,
          SUM(CASE WHEN td.isFalta = 1 THEN 1 ELSE 0 END) as totalFaltas,
          COUNT(*) as totalDias
        FROM timecard_daily td
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td.mesCompetencia = ${input.mesReferencia}
        GROUP BY td.obraId, o.nome
        ORDER BY totalFuncionarios DESC
      `)) as any).rows || [];

      // Get payment totals by obra (via employee allocation)
      const payRows = ((await db.execute(sql`
        SELECT of2.obraId as obraId, o.nome as obraNome,
          SUM(CAST(pp.salarioBrutoMes AS DECIMAL(15,2))) as totalBruto,
          SUM(CAST(pp.salarioLiquido AS DECIMAL(15,2))) as totalLiquido,
          SUM(CAST(pp.horasExtrasValor AS DECIMAL(15,2))) as totalHE,
          COUNT(*) as totalFuncionarios
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
        LEFT JOIN obras o ON of2.obraId = o.id
        WHERE pp.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp.mesReferencia = ${input.mesReferencia}
        GROUP BY of2.obraId, o.nome
        ORDER BY totalBruto DESC
      `)) as any).rows || [];

      // Get employee-level detail per obra for expandable breakdown
      const detailRows = ((await db.execute(sql`
        SELECT of2.obraId as obraId, pp.employeeId, e.nomeCompleto,
          e.funcao, e.cargo,
          CAST(pp.salarioBrutoMes AS DECIMAL(15,2)) as salarioBruto,
          CAST(pp.salarioLiquido AS DECIMAL(15,2)) as salarioLiquido,
          CAST(pp.horasExtrasValor AS DECIMAL(15,2)) as horasExtrasValor,
          CAST(pp.totalDescontos AS DECIMAL(15,2)) as totalDescontos,
          CAST(pp.descontoAdiantamento AS DECIMAL(15,2)) as descontoAdiantamento,
          CAST(pp.descontoFaltas AS DECIMAL(15,2)) as descontoFaltas,
          CAST(pp.descontoAtrasos AS DECIMAL(15,2)) as descontoAtrasos,
          CAST(pp.descontoVrFaltas AS DECIMAL(15,2)) as descontoVrFaltas,
          CAST(pp.descontoVtFaltas AS DECIMAL(15,2)) as descontoVtFaltas,
          CAST(pp.descontoPensao AS DECIMAL(15,2)) as descontoPensao,
          CAST(pp.descontoInss AS DECIMAL(15,2)) as descontoInss,
          CAST(pp.descontoIrrf AS DECIMAL(15,2)) as descontoIrrf,
          CAST(pp.descontoFgts AS DECIMAL(15,2)) as descontoFgts,
          CAST(pp.descontoEpi AS DECIMAL(15,2)) as descontoEpi,
          CAST(pp.descontoOutros AS DECIMAL(15,2)) as descontoOutros,
          (pp.diasUteisNoMes - COALESCE(pp.descontoFaltasQtd, 0)) as diasTrabalhados,
          COALESCE(pp.descontoFaltasQtd, 0) as faltas
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
        WHERE pp.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp.mesReferencia = ${input.mesReferencia}
        ORDER BY of2.obraId, e.nomeCompleto
      `)) as any).rows || [];

      return {
        porObra: payRows || [],
        timecardPorObra: obraRows || [],
        detalhePorFuncionario: detailRows || [],
      };
    }),

  // ============================================================
  // 15. CRITÉRIOS CONFIGURÁVEIS
  // ============================================================
  getCriterios: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      return await getPayrollCriteria(db, input.companyId);
    }),

  salvarCriterio: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), chave: z.string(),
      valor: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const existing = ((await db.execute(sql`
        SELECT id FROM system_criteria WHERE "companyId" = ${input.companyId} AND chave = ${input.chave} LIMIT 1
      `)) as any).rows || [];
      if (existing[0]) {
        await db.execute(sql`
          UPDATE system_criteria SET valor = ${input.valor} WHERE id = ${existing[0].id}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO system_criteria (companyId, chave, valor, descricao, categoria, tipo) 
          VALUES (${input.companyId}, ${input.chave}, ${input.valor}, ${input.chave}, 'folha', 'numero')
        `);
      }
      return { success: true };
    }),

  // ============================================================
  // 16. ABONAR AJUSTE (DIVERGÊNCIA)
  // ============================================================
  abonarAjuste: protectedProcedure
    .input(z.object({ adjustmentId: z.number(), motivo: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_adjustments SET 
          status = 'abonado',
          "abonadoPor" = ${ctx.user.name || "Sistema"},
          "abonadoEm" = NOW(),
          "motivoAbono" = ${input.motivo}
        WHERE id = ${input.adjustmentId}
      `);
      return { success: true };
    }),

  // ============================================================
  // 17. RESUMO DA COMPETÊNCIA
  // ============================================================
  resumoCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Period info
      const periodRows = ((await db.execute(sql`
        SELECT * FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1
      `)) as any).rows || [];
      const period = periodRows[0] || null;

      // Timecard stats
      const tcStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as "totalRegistros",
          SUM(CASE WHEN "statusDia" = 'registrado' THEN 1 ELSE 0 END) as registrados,
          SUM(CASE WHEN "statusDia" = 'escuro' THEN 1 ELSE 0 END) as "noEscuro",
          SUM(CASE WHEN "statusDia" = 'aferido' THEN 1 ELSE 0 END) as aferidos,
          SUM("isFalta") as "totalFaltas",
          SUM("isAtraso") as "totalAtrasos",
          COUNT(DISTINCT "employeeId") as "totalFuncionarios"
        FROM timecard_daily 
        WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Advances stats
      const advStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN bloqueado = 1 THEN 1 ELSE 0 END) as bloqueados,
          SUM(CAST("valorTotalVale" AS DECIMAL(15,2))) as "totalVale"
        FROM payroll_advances 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Payment stats
      const payStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CAST("salarioBrutoMes" AS DECIMAL(15,2))) as "totalBruto",
          SUM(CAST("totalDescontos" AS DECIMAL(15,2))) as "totalDescontos",
          SUM(CAST("salarioLiquido" AS DECIMAL(15,2))) as "totalLiquido"
        FROM payroll_payments 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Adjustments stats
      const adjStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN status = 'aplicado' THEN 1 ELSE 0 END) as aplicados,
          SUM(CASE WHEN status = 'abonado' THEN 1 ELSE 0 END) as abonados,
          SUM(CAST("valorTotal" AS DECIMAL(15,2))) as "totalValor"
        FROM payroll_adjustments 
        WHERE "companyId" = ${input.companyId} AND "mesDesconto" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Alerts
      const alertStatsRows = ((await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CASE WHEN lido = 0 THEN 1 ELSE 0 END) as "naoLidos"
        FROM payroll_alerts 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Financial events
      const finStatsRows = ((await db.execute(sql`
        SELECT COUNT(*) as total, COALESCE(SUM(CAST(valor AS DECIMAL(15,2))), 0) as "totalValor"
        FROM financial_events 
        WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      return {
        period,
        timecard: tcStatsRows[0] || {},
        advances: { totalVales: (advStatsRows[0] as any)?.total || 0, ...(advStatsRows[0] || {}) },
        payments: { totalPagamentos: (payStatsRows[0] as any)?.total || 0, ...(payStatsRows[0] || {}) },
        adjustments: { totalAjustes: (adjStatsRows[0] as any)?.total || 0, ...(adjStatsRows[0] || {}) },
        alerts: alertStatsRows[0] || {},
        financeiro: finStatsRows[0] || { total: 0 },
      };
    }),

  // ============================================================
  // 18. GERAR CONTRACHEQUE (HTML para impressão)
  // ============================================================
  gerarContracheque: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Get company info
      const companyRows = ((await db.execute(sql`
        SELECT "razaoSocial", "nomeFantasia", cnpj, "logoUrl" FROM companies WHERE id = ${input.companyId} LIMIT 1
      `)) as any).rows || [];
      const company = companyRows[0] || {};

      // Get period info
      const periodRows = ((await db.execute(sql`
        SELECT * FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1
      `)) as any).rows || [];
      const period = periodRows[0] || null;

      // Build employee filter
      const empFilter = input.employeeId ? sql` AND pp."employeeId" = ${input.employeeId}` : sql``;

      // Get payments with employee details
      const payRows = ((await db.execute(sql`
        SELECT pp.*, e."nomeCompleto", e.funcao, e."codigoInterno", e.cpf, e."dataAdmissao", e."valorHora",
          e.pis, e.ctps, e."obraAtual"
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp."mesReferencia" = ${input.mesReferencia} ${empFilter}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];

      // Get advances
      const advRows = ((await db.execute(sql`
        SELECT * FROM payroll_advances WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const advMap = new Map<number, any>();
      for (const a of (advRows || [])) advMap.set(a.employeeId, a);

      // Get obra names
      const obraRows = ((await db.execute(sql`SELECT id, nome FROM obras WHERE "companyId" = ${input.companyId}`)) as any).rows || [];
      const obraMap = new Map<number, string>();
      for (const o of (obraRows || [])) obraMap.set(o.id, o.nome);

      const contracheques = (payRows || []).map((p: any) => {
        const adv = advMap.get(p.employeeId);
        return {
          funcionario: {
            nome: p.nomeCompleto,
            funcao: p.funcao,
            codigo: p.codigoInterno,
            cpf: p.cpf,
            dataAdmissao: p.dataAdmissao,
            valorHora: p.valorHora,
            pis: p.pis,
            ctps: p.ctps,
            obra: obraMap.get(Number(p.obraAtual)) || "Não alocado",
          },
          proventos: [
            { descricao: "Salário Base", referencia: `${p.diasUteisNoMes} dias × ${p.cargaHorariaDiaria}h`, valor: parseBRL(p.salarioBrutoMes) },
            ...(parseBRL(p.horasExtrasValor) > 0 ? [{ descricao: "Horas Extras", referencia: "", valor: parseBRL(p.horasExtrasValor) }] : []),
          ],
          descontos: [
            ...(parseBRL(p.descontoAdiantamento) > 0 ? [{ descricao: "Adiantamento (Vale)", referencia: adv ? `${adv.percentualAdiantamento}%` : "40%", valor: parseBRL(p.descontoAdiantamento) }] : []),
            ...(parseBRL(p.descontoFaltas) > 0 ? [{ descricao: `Faltas (${p.descontoFaltasQtd} dias)`, referencia: "", valor: parseBRL(p.descontoFaltas) }] : []),
            ...(parseBRL(p.descontoAtrasos) > 0 ? [{ descricao: `Atrasos (${p.descontoAtrasosMinutos}min)`, referencia: "", valor: parseBRL(p.descontoAtrasos) }] : []),
            ...(parseBRL(p.descontoVrFaltas) > 0 ? [{ descricao: "VR (dias de falta)", referencia: `${p.descontoFaltasQtd} dias`, valor: parseBRL(p.descontoVrFaltas) }] : []),
            ...(parseBRL(p.descontoVtFaltas) > 0 ? [{ descricao: "VA 5% (dias de falta)", referencia: `${p.descontoFaltasQtd} dias`, valor: parseBRL(p.descontoVtFaltas) }] : []),
            ...(parseBRL(p.descontoPensao) > 0 ? [{ descricao: "Pensão Alimentícia", referencia: "", valor: parseBRL(p.descontoPensao) }] : []),
            ...(parseBRL(p.acertoEscuroValor) > 0 ? [{ descricao: "Acerto Período Escuro", referencia: `Ref. mês anterior`, valor: parseBRL(p.acertoEscuroValor) }] : []),
          ],
          totalProventos: parseBRL(p.totalProventos),
          totalDescontos: parseBRL(p.totalDescontos),
          salarioLiquido: parseBRL(p.salarioLiquido),
          dataPagamento: p.dataPagamentoPrevista,
          status: p.status,
          mesReferencia: input.mesReferencia,
          acertoEscuroDetalhes: p.acertoEscuroDetalhes ? JSON.parse(p.acertoEscuroDetalhes) : [],
        };
      });

      return {
        empresa: {
          nome: company.nomeFantasia || company.razaoSocial || "Empresa",
          cnpj: company.cnpj || "",
          logoUrl: company.logoUrl || "",
        },
        mesReferencia: input.mesReferencia,
        periodo: period,
        contracheques,      };
    }),
  // ============================================================
  // 20. ASSISTENTE IA DE INCONSISTÊNCIAS
  // ============================================================
  analisarInconsistenciaIA: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), timecardDailyId: z.number(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      // Get the inconsistent record with employee details
      const rows = ((await db.execute(sql`
        SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, e.dataAdmissao, e.status as empStatus,
          o.nome as obraNome
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.id = ${input.timecardDailyId}
        LIMIT 1
      `)) as any).rows || [];
      const record = rows[0];
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
      // Get recent history for this employee (last 30 days)
      const histRows = ((await db.execute(sql`
        SELECT data, statusDia, isFalta, isAtraso, is_inconsistente, inconsistencia_tipo,
          entrada1, saida1, entrada2, saida2, horasTrabalhadas
        FROM timecard_daily
        WHERE "employeeId" = ${record.employeeId} AND "companyId" = ${input.companyId}
          AND "mesCompetencia" = ${input.mesReferencia}
        ORDER BY data DESC LIMIT 30
      `)) as any).rows || [];
      // Get golden rules for context
      const rulesRows = ((await db.execute(sql`
        SELECT titulo, descricao, categoria FROM golden_rules
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL
        AND categoria IN ('rh', 'operacional', 'geral')
        ORDER BY prioridade LIMIT 10
      `)) as any).rows || [];
      // Get criteria
      const criteria = await getPayrollCriteria(db, input.companyId);
      // Build context for LLM
      const historicoStr = (histRows || []).map((h: any) =>
        `${h.data}: ${h.statusDia} | E1:${h.entrada1||'-'} S1:${h.saida1||'-'} E2:${h.entrada2||'-'} S2:${h.saida2||'-'} | Horas:${h.horasTrabalhadas} | Falta:${h.isFalta} Atraso:${h.isAtraso} Incon:${h.is_inconsistente}(${h.inconsistencia_tipo||'-'})`
      ).join('\n');
      const regrasStr = (rulesRows || []).map((r: any) => `[${r.categoria}] ${r.titulo}: ${r.descricao}`).join('\n');
      const prompt = `Você é um assistente de RH especialista em ponto eletrônico e legislação trabalhista brasileira (CLT).

ANALISE esta inconsistência de ponto e sugira a melhor resolução:

## Funcionário
- Nome: ${record.nomeCompleto}
- Função: ${record.funcao}
- Código: ${record.codigoInterno}
- Admissão: ${record.dataAdmissao}
- Obra: ${record.obraNome || 'N/A'}

## Registro com Inconsistência
- Data: ${record.data}
- Tipo: ${record.inconsistencia_tipo}
- Entrada 1: ${record.entrada1 || 'AUSENTE'}
- Saída 1: ${record.saida1 || 'AUSENTE'}
- Entrada 2: ${record.entrada2 || 'AUSENTE'}
- Saída 2: ${record.saida2 || 'AUSENTE'}
- Batidas: ${record.num_batidas}
- Horas: ${record.horasTrabalhadas}
- Tipo dia: ${record.tipoDia}

## Critérios do Sistema
- Jornada diária: ${criteria.cargaHorariaDiaria}h
- Tolerância atraso: ${criteria.pontoToleranciaAtraso} min
- Falta após atraso: ${criteria.pontoFaltaAposAtraso} min

## Histórico Recente (últimos 30 dias)
${historicoStr || 'Sem histórico'}

## Regras de Ouro da Empresa
${regrasStr || 'Nenhuma regra cadastrada'}

Responda EXATAMENTE no formato JSON abaixo:`;
      const { invokeLLM } = await import('../_core/llm');
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um assistente de RH brasileiro especialista em ponto eletrônico, CLT e resolução de inconsistências. Responda sempre em JSON válido e em português." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ia_inconsistencia",
            strict: true,
            schema: {
              type: "object",
              properties: {
                resolucaoSugerida: {
                  type: "string",
                  description: "Tipo de resolução sugerida: ajustar_horario, atestado, advertencia, justificar ou abonar",
                },
                confianca: {
                  type: "string",
                  description: "Nível de confiança: alta, media ou baixa",
                },
                explicacao: {
                  type: "string",
                  description: "Explicação didática de por que essa resolução é a mais adequada, citando legislação quando aplicável",
                },
                horariosCorrigidos: {
                  type: "object",
                  properties: {
                    entrada1: { type: "string", description: "Horário de entrada 1 sugerido (HH:MM) ou vazio" },
                    saida1: { type: "string", description: "Horário de saída 1 sugerido (HH:MM) ou vazio" },
                    entrada2: { type: "string", description: "Horário de entrada 2 sugerido (HH:MM) ou vazio" },
                    saida2: { type: "string", description: "Horário de saída 2 sugerido (HH:MM) ou vazio" },
                  },
                  required: ["entrada1", "saida1", "entrada2", "saida2"],
                  additionalProperties: false,
                },
                observacaoSugerida: {
                  type: "string",
                  description: "Texto sugerido para o campo de observação da resolução",
                },
                alertas: {
                  type: "string",
                  description: "Alertas ou riscos trabalhistas que o RH deve considerar",
                },
              },
              required: ["resolucaoSugerida", "confianca", "explicacao", "horariosCorrigidos", "observacaoSugerida", "alertas"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content as string;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou resposta" });
      try {
        return JSON.parse(content);
      } catch {
        return {
          resolucaoSugerida: "justificar",
          confianca: "baixa",
          explicacao: content,
          horariosCorrigidos: { entrada1: "", saida1: "", entrada2: "", saida2: "" },
          observacaoSugerida: "Análise IA indisponível",
          alertas: "Não foi possível analisar automaticamente. Resolva manualmente.",
        };
      }
    }),

  // ============================================================
  // LIMPAR ETAPA / LIMPAR COMPETÊNCIA
  // ============================================================
  resetarEtapa: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      etapa: z.enum(["ponto", "escuro", "vale", "pagamento", "consolidacao"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companyId, mesReferencia, etapa } = input;

      // Check period exists and is not travada
      const periods = ((await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia} LIMIT 1`
      )) as any).rows || [];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada" });
      if (periods[0].status === "travada") throw new TRPCError({ code: "FORBIDDEN", message: "Competência travada. Não é possível limpar." });

      const periodId = periods[0].id;

      // Map etapa to tables and new status
      const etapaMap: Record<string, { tables: string[]; newStatus: string; clearFields: string[] }> = {
        ponto: {
          tables: ["timecard_daily", "time_records", "time_inconsistencies", "payroll_uploads"],
          newStatus: "aberta",
          clearFields: ["pontoImportadoEm", "pontoImportadoPor", "afericaoRealizada", "afericaoEm", "afericaoPor"],
        },
        escuro: {
          tables: ["payroll_adjustments"],
          newStatus: "ponto_importado",
          clearFields: ["afericaoRealizada", "afericaoEm", "afericaoPor"],
        },
        vale: {
          tables: ["payroll_advances"],
          newStatus: "aferida",
          clearFields: ["valeGeradoEm", "valeGeradoPor"],
        },
        pagamento: {
          tables: ["payroll_payments"],
          newStatus: "vale_gerado",
          clearFields: ["pagamentoSimuladoEm", "pagamentoSimuladoPor"],
        },
        consolidacao: {
          tables: [],
          newStatus: "pagamento_simulado",
          clearFields: ["consolidadoEm", "consolidadoPor"],
        },
      };

      const config = etapaMap[etapa];
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inválida" });

      // Delete data from related tables (each table has different column names)
      const deleteFromTable = async (table: string) => {
        if (table === "timecard_daily") {
          await db.execute(sql`DELETE FROM timecard_daily WHERE "companyId" = ${companyId} AND "mesCompetencia" = ${mesReferencia}`);
        } else if (table === "payroll_adjustments") {
          await db.execute(sql`DELETE FROM payroll_adjustments WHERE "companyId" = ${companyId} AND ("mesOrigem" = ${mesReferencia} OR "mesDesconto" = ${mesReferencia})`);
        } else if (table === "payroll_uploads") {
          await db.execute(sql`DELETE FROM payroll_uploads WHERE "companyId" = ${companyId} AND month = ${mesReferencia}`);
        } else if (table === "time_records") {
          await db.execute(sql`DELETE FROM time_records WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
        } else {
          await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
        }
      };

      for (const table of config.tables) {
        await deleteFromTable(table);
      }

      // Also clear downstream data (cascade)
      const etapaOrder = ["ponto", "escuro", "vale", "pagamento", "consolidacao"];
      const etapaIdx = etapaOrder.indexOf(etapa);
      for (let i = etapaIdx + 1; i < etapaOrder.length; i++) {
        const downstream = etapaMap[etapaOrder[i]];
        for (const table of downstream.tables) {
          await deleteFromTable(table);
        }
      }

      // Update period status and clear timestamp fields
      const clearSets = config.clearFields.map(f => `"${f}" = NULL`).join(", ");
      // Also clear downstream fields
      const allClearFields = new Set(config.clearFields);
      for (let i = etapaIdx + 1; i < etapaOrder.length; i++) {
        for (const f of etapaMap[etapaOrder[i]].clearFields) allClearFields.add(f);
      }
      const allClearSets = Array.from(allClearFields).map(f => `"${f}" = NULL`).join(", ");

      await db.execute(
        sql`UPDATE payroll_periods SET status = ${config.newStatus}, ${sql.raw(allClearSets)} WHERE id = ${periodId}`
      );

      return { success: true, newStatus: config.newStatus, etapaLimpa: etapa };
    }),

  resetarCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companyId, mesReferencia } = input;

      // Check period exists and is not travada
      const periods = ((await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia} LIMIT 1`
      )) as any).rows || [];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada" });
      if (periods[0].status === "travada") throw new TRPCError({ code: "FORBIDDEN", message: "Competência travada. Não é possível limpar." });

      const periodId = periods[0].id;

      // Delete ALL data for this competência (each table has different column names)
      await db.execute(sql`DELETE FROM timecard_daily WHERE "companyId" = ${companyId} AND "mesCompetencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM time_records WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM time_inconsistencies WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_uploads WHERE "companyId" = ${companyId} AND month = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_adjustments WHERE "companyId" = ${companyId} AND ("mesOrigem" = ${mesReferencia} OR "mesDesconto" = ${mesReferencia})`);
      await db.execute(sql`DELETE FROM payroll_advances WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_payments WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_alerts WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM financial_events WHERE "companyId" = ${companyId} AND "mesCompetencia" = ${mesReferencia} AND "origemTipo" IN ('payroll_advance', 'payroll_payment')`);
      await db.execute(sql`DELETE FROM folha_lancamentos WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);

      // Reset period to "aberta" and clear all timestamps
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'aberta',
          "pontoImportadoEm" = NULL, "pontoImportadoPor" = NULL,
          "afericaoRealizada" = 0, "afericaoEm" = NULL, "afericaoPor" = NULL,
          "valeGeradoEm" = NULL, "valeGeradoPor" = NULL,
          "pagamentoSimuladoEm" = NULL, "pagamentoSimuladoPor" = NULL,
          "consolidadoEm" = NULL, "consolidadoPor" = NULL,
          "totalDivergenciasAferidas" = 0, "retificadoEm" = NULL
        WHERE id = ${periodId}
      `);

      return { success: true, newStatus: "aberta" };
    }),

  // ============================================================
  // RESUMO DO PONTO POR FUNCIONÁRIO (para Etapa 2 do wizard)
  // ============================================================
  resumoPontoPorFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT 
          td.employeeId,
          e.nomeCompleto as employeeName,
          e.cpf as employeeCpf,
          e.funcao as employeeFuncao,
          e.funcao as employeeRole,
          e.codigoInterno,
          e.codigoInterno as employeeCode,
          COUNT(DISTINCT td.data) as totalDias,
          SUM(CASE WHEN td.isFalta = 1 AND td.tipoDia = 'util' THEN 1 ELSE 0 END) as totalFaltas,
          SUM(CASE WHEN td.isAtraso = 1 THEN 1 ELSE 0 END) as totalAtrasos,
          SUM(td.minutosAtraso) as totalMinutosAtraso,
          SUM(CASE WHEN td.isSaidaAntecipada = 1 THEN 1 ELSE 0 END) as saidasAntecipadas,
          SUM(CASE WHEN td.is_inconsistente = 1 AND td.inconsistencia_resolvida = 0 THEN 1 ELSE 0 END) as inconsistenciasPendentes,
          SUM(CASE WHEN td.is_inconsistente = 1 THEN 1 ELSE 0 END) as totalInconsistencias,
          SUM(CASE WHEN td.statusDia = 'escuro' THEN 1 ELSE 0 END) as diasEscuro,
          SUM(CASE WHEN td.statusDia = 'registrado' THEN 1 ELSE 0 END) as diasRegistrados,
          SEC_TO_TIME(SUM(TIME_TO_SEC(CONCAT(td.horasTrabalhadas, ':00')))) as horasTrabalhadas,
          SEC_TO_TIME(SUM(TIME_TO_SEC(CONCAT(td.horasExtras, ':00')))) as horasExtras,
          STRING_AGG(DISTINCT td."obraId"::text, ',') as obraIds,
          STRING_AGG(DISTINCT o.nome, ',') as obraNomes
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td.mesCompetencia = ${input.mesReferencia}
        GROUP BY td.employeeId, e.nomeCompleto, e.cpf, e.funcao, e.codigoInterno, e.funcao, e.codigoInterno
        ORDER BY e.nomeCompleto
      `)) as any).rows || [];
      
      // Parse the GROUP_CONCAT fields
      return (rows || []).map((r: any) => ({
        ...r,
        obraIds: r.obraIds ? r.obraIds.split(',').map(Number).filter((n: number) => !isNaN(n)) : [],
        obraNomes: r.obraNomes ? r.obraNomes.split(',').filter(Boolean) : [],
        multiplasObras: r.obraIds ? new Set(r.obraIds.split(',')).size > 1 : false,
      }));
    }),

  // ============================================================
  // ESPELHO DE PONTO POR FUNCIONÁRIO (para Etapa 2 do wizard)
  // ============================================================
  espelhoPontoFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, e.cpf, e.salarioBase,
               o.nome as obraNome
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) 
          AND td.mesCompetencia = ${input.mesReferencia}
          AND td.employeeId = ${input.employeeId}
        ORDER BY td.data ASC
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // CONFLITOS DE OBRA (funcionário em 2+ obras no mesmo dia)
  // ============================================================
  conflitosObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT 
          td.employeeId,
          e.nomeCompleto as employeeName,
          td.data,
          STRING_AGG(DISTINCT td."obraId"::text, ',') as obraIds,
          STRING_AGG(DISTINCT o.nome, ',') as obraNomes,
          STRING_AGG(CONCAT(COALESCE(td."entrada1",''), '|', COALESCE(td."saida1",''), '|', COALESCE(o.nome,'')), ',') as detalhes
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td.mesCompetencia = ${input.mesReferencia}
          AND td.obraId IS NOT NULL
        GROUP BY td.employeeId, e.nomeCompleto, td.data
        HAVING COUNT(DISTINCT td.obraId) > 1
        ORDER BY td.data, e.nomeCompleto
      `)) as any).rows || [];
      return (rows || []).map((r: any) => ({
        ...r,
        obraIds: r.obraIds ? r.obraIds.split(',').map(Number) : [],
        obraNomes: r.obraNomes ? r.obraNomes.split(',') : [],
      }));
    }),

  // ============================================================
  // DIVERGÊNCIA: ATIVOS SEM FOLHA PROCESSADA
  // Cruza funcionários ativos com folha processada no mês
  // Retorna lista de quem ficou de fora do processamento
  // ============================================================
  divergenciaAtivosSemFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ids = resolveCompanyIds(input);

      // 1. Buscar todos os funcionários ativos (não desligados/lista_negra) que são CLT
      const ativosRows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "tipoContrato", "companyId", status, "codigoInterno"
        FROM employees
        WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND status NOT IN ('Desligado', 'Lista_Negra')
          AND "deletedAt" IS NULL
        ORDER BY "nomeCompleto"
      `)) as any).rows || [];

      // 2. Buscar employeeIds que têm pagamento processado neste mês
      const pagosRows = ((await db.execute(sql`
        SELECT DISTINCT "employeeId"
        FROM payroll_payments
        WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const pagosSet = new Set((pagosRows || []).map((r: any) => r.employeeId));

      // 3. Buscar employeeIds que têm lançamento na folha importada (folha_itens) neste mês
      const folhaRows = ((await db.execute(sql`
        SELECT DISTINCT fi.employeeId
        FROM folha_itens fi
        INNER JOIN folha_lancamentos fl ON fi.folhaLancamentoId = fl.id
        WHERE fl.companyId IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND fl.mesReferencia = ${input.mesReferencia}
          AND fi.employeeId IS NOT NULL
      `)) as any).rows || [];
      const folhaSet = new Set((folhaRows || []).map((r: any) => r.employeeId));

      // 4. Unir os dois conjuntos (quem tem folha processada = payroll_payments OU folha_itens)
      const processadosSet = new Set([...Array.from(pagosSet), ...Array.from(folhaSet)]);

      // 5. Separar ativos CLT e PJ
      const ativosCLT = (ativosRows || []).filter((e: any) => e.tipoContrato === 'CLT');
      const ativosPJ = (ativosRows || []).filter((e: any) => e.tipoContrato === 'PJ');
      const ativosOutros = (ativosRows || []).filter((e: any) => !['CLT', 'PJ'].includes(e.tipoContrato || ''));

      // 6. Identificar CLTs sem folha
      const cltSemFolha = ativosCLT.filter((e: any) => !processadosSet.has(e.id));

      // 7. Identificar PJs sem folha (informativo)
      const pjSemFolha = ativosPJ.filter((e: any) => !processadosSet.has(e.id));

      return {
        totalAtivos: ativosRows.length,
        totalAtivosCLT: ativosCLT.length,
        totalAtivosPJ: ativosPJ.length,
        totalAtivosOutros: ativosOutros.length,
        totalProcessados: processadosSet.size,
        totalCltComFolha: ativosCLT.filter((e: any) => processadosSet.has(e.id)).length,
        totalCltSemFolha: cltSemFolha.length,
        totalPjSemFolha: pjSemFolha.length,
        cltSemFolha: cltSemFolha.map((e: any) => ({
          id: e.id,
          nome: e.nomeCompleto,
          funcao: e.funcao || '—',
          status: e.status,
          codigo: e.codigoInterno || '—',
        })),
        pjSemFolha: pjSemFolha.map((e: any) => ({
          id: e.id,
          nome: e.nomeCompleto,
          funcao: e.funcao || '—',
          status: e.status,
          codigo: e.codigoInterno || '—',
        })),
        temDivergencia: cltSemFolha.length > 0 || pjSemFolha.length > 0,
      };
    }),

  // ============================================================
  // CONSOLIDAR / DESCONSOLIDAR VALE INTERNO (cálculo payroll_advances)
  // Sem verificações de PDF contábil — é o fluxo interno de adiantamento.
  // ============================================================
  consolidarVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";

      // Atualiza payroll_periods
      await db.execute(sql`
        UPDATE payroll_periods
        SET status = 'vale_consolidado',
            "valeConsolidadoEm" = ${agora},
            "valeConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      // Se existir folhaLancamento tipo 'vale', consolida também
      await db.execute(sql`
        UPDATE folha_lancamentos
        SET status = 'consolidado',
            "consolidadoPor" = ${quem},
            "consolidadoEm" = ${agora}
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "tipoLancamento" = 'vale'
          AND status != 'consolidado'
      `);

      return { success: true };
    }),

  desconsolidarVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Reverte payroll_periods para vale_gerado
      await db.execute(sql`
        UPDATE payroll_periods
        SET status = 'vale_gerado',
            "valeConsolidadoEm" = NULL,
            "valeConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
          AND status = 'vale_consolidado'
      `);

      // Reverte folhaLancamento se existir
      await db.execute(sql`
        UPDATE folha_lancamentos
        SET status = 'importado',
            "consolidadoPor" = NULL,
            "consolidadoEm" = NULL
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "tipoLancamento" = 'vale'
          AND status = 'consolidado'
      `);

      return { success: true };
    }),

  consolidarHE: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";
      await db.execute(sql`
        UPDATE payroll_periods
        SET "heConsolidadoEm" = ${agora},
            "heConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  desconsolidarHE: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(sql`
        UPDATE payroll_periods
        SET "heConsolidadoEm" = NULL,
            "heConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  consolidarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";
      await db.execute(sql`
        UPDATE payroll_periods
        SET "afericaoConsolidadoEm" = ${agora},
            "afericaoConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  desconsolidarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(sql`
        UPDATE payroll_periods
        SET "afericaoConsolidadoEm" = NULL,
            "afericaoConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  consolidarPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";
      await db.execute(sql`
        UPDATE payroll_periods
        SET "pagamentoConsolidadoEm" = ${agora},
            "pagamentoConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  desconsolidarPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(sql`
        UPDATE payroll_periods
        SET "pagamentoConsolidadoEm" = NULL,
            "pagamentoConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  gerarRemessaCnab: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      codigoBanco: z.string(),
      contaBancariaId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const companyRows = ((await db.execute(sql`
        SELECT cnpj, "razaoSocial" FROM companies WHERE id = ${input.companyId} LIMIT 1
      `)) as any).rows || [];
      if (!companyRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
      const company = companyRows[0];

      let bankAccountFilter = sql`"companyId" = ${input.companyId} AND "codigoBanco" = ${input.codigoBanco} AND ativo = 1 AND "deletedAt" IS NULL`;
      if (input.contaBancariaId) {
        bankAccountFilter = sql`id = ${input.contaBancariaId} AND "companyId" = ${input.companyId}`;
      }
      const bankRows = ((await db.execute(sql`
        SELECT * FROM company_bank_accounts WHERE ${bankAccountFilter} LIMIT 1
      `)) as any).rows || [];
      if (!bankRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: `Conta bancária da empresa não encontrada para o banco ${input.codigoBanco}. Configure uma conta bancária nas configurações.` });
      const bankAccount = bankRows[0];

      const payRows = ((await db.execute(sql`
        SELECT pp."salarioLiquido", pp."dataPagamentoPrevista",
          e."nomeCompleto", e.cpf, e.banco, e.agencia, e.conta, e."tipoConta",
          e."tipoChavePix", e."chavePix"
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" = ${input.companyId} AND pp."mesReferencia" = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];

      const funcBancoCodigo = input.codigoBanco;
      const bankCodeMap: Record<string, string> = {
        'caixa': '104', 'santander': '033', 'bradesco': '237',
        'itau': '341', 'itaú': '341', 'banco do brasil': '001',
        'c6': '336', 'nubank': '260', 'inter': '077',
      };
      function matchBankCode(bancoName: string): string {
        const lower = (bancoName || '').toLowerCase();
        for (const [key, code] of Object.entries(bankCodeMap)) {
          if (lower.includes(key)) return code;
        }
        return '000';
      }

      const funcionariosFiltrados = payRows.filter((r: any) => {
        const empBankCode = matchBankCode(r.banco || '');
        return empBankCode === funcBancoCodigo;
      });

      if (funcionariosFiltrados.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Nenhum funcionário encontrado para o banco ${input.codigoBanco}` });
      }

      const cnabFuncionarios = funcionariosFiltrados.map((r: any) => ({
        nome: r.nomeCompleto || '',
        cpf: r.cpf || '',
        banco: r.banco || '',
        codigoBanco: matchBankCode(r.banco || ''),
        agencia: r.agencia || '',
        conta: r.conta || '',
        tipoConta: r.tipoConta || 'corrente',
        valorLiquido: parseFloat(r.salarioLiquido || '0'),
        dataPagamento: r.dataPagamentoPrevista || '',
        tipoChavePix: r.tipoChavePix || '',
        chavePix: r.chavePix || '',
      }));

      const cnabEmpresa = {
        cnpj: company.cnpj || '',
        razaoSocial: company.razaoSocial || '',
        codigoBanco: bankAccount.codigoBanco || input.codigoBanco,
        agencia: bankAccount.agencia || '',
        conta: bankAccount.conta || '',
        tipoConta: bankAccount.tipoConta || 'corrente',
        convenio: bankAccount.convenio || '',
      };

      const arquivo = gerarCnab240(cnabEmpresa, cnabFuncionarios);
      const totalValor = cnabFuncionarios.reduce((s: number, f: any) => s + f.valorLiquido, 0);
      const bancoNome = funcBancoCodigo === '104' ? 'Caixa' : funcBancoCodigo === '033' ? 'Santander' : `Banco ${funcBancoCodigo}`;

      return {
        arquivo,
        nomeArquivo: `REMESSA_${bancoNome.toUpperCase()}_${input.mesReferencia.replace('-', '')}.rem`,
        totalFuncionarios: cnabFuncionarios.length,
        totalValor,
        banco: bancoNome,
      };
    }),

  listarContasBancariasEmpresa: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT * FROM company_bank_accounts 
        WHERE "companyId" = ${input.companyId} AND ativo = 1 AND "deletedAt" IS NULL
        ORDER BY banco
      `)) as any).rows || [];
      return rows || [];
    }),
});
// ============================================================
// HELPER FUNCTIONS
// ============================================================
async function getEmployeeValorHora(db: any, employeeId: number): Promise<number> {
  const rows = ((await db.execute(sql`SELECT "valorHora" FROM employees WHERE id = ${employeeId} LIMIT 1`)) as any).rows || [];
  return parseBRL(rows[0]?.valorHora);
}

async function getEmployeeVrDiario(db: any, employeeId: number, companyId: number): Promise<number> {
  const rows = ((await db.execute(sql`
    SELECT "valorDiario" FROM vr_benefits 
    WHERE "employeeId" = ${employeeId} AND "companyId" = ${companyId}
    ORDER BY "mesReferencia" DESC LIMIT 1
  `)) as any).rows || [];
  if (rows[0]?.valorDiario) return parseBRL(rows[0].valorDiario);
  return 0;
}

async function getEmployeeVtDiario(db: any, employeeId: number): Promise<number> {
  const rows = ((await db.execute(sql`SELECT "vtValorDiario" FROM employees WHERE id = ${employeeId} LIMIT 1`)) as any).rows || [];
  return parseBRL(rows[0]?.vtValorDiario);
}
