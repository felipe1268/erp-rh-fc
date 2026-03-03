import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employees, timeRecords, systemCriteria, obras, heSolicitacoes, vrBenefits, advances } from "../../drizzle/schema";
import { eq, and, sql, between, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";

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
  };
}

export const payrollEngineRouter = router({
  // ============================================================
  // 1. ABRIR / LISTAR COMPETÊNCIAS
  // ============================================================
  listPeriods: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ano = input.ano || new Date().getFullYear();
      const [rows] = await db.execute(sql`
        SELECT * FROM payroll_periods 
        WHERE companyId = ${input.companyId} AND mesReferencia LIKE ${ano + '%'}
        ORDER BY mesReferencia DESC
      `) as any[];
      return rows || [];
    }),

  getPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [rows] = await db.execute(sql`
        SELECT * FROM payroll_periods 
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
        LIMIT 1
      `) as any[];
      const period = rows[0];
      if (!period) return null;
      return period;
    }),

  openPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
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
      const [existing] = await db.execute(sql`
        SELECT id FROM payroll_periods 
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `) as any[];
      if (existing[0]) {
        return { id: existing[0].id, message: "Competência já existe" };
      }

      // Count active employees
      const [empCount] = await db.execute(sql`
        SELECT COUNT(*) as total FROM employees 
        WHERE companyId = ${input.companyId} 
        AND tipoContrato = 'CLT'
        AND status IN ('Ativo', 'Ferias')
        AND deletedAt IS NULL
      `) as any[];
      const totalFunc = empCount[0]?.total || 0;

      const [result] = await db.execute(sql`
        INSERT INTO payroll_periods (companyId, mesReferencia, pontoInicio, pontoFim, escuroInicio, escuroFim, status, totalFuncionarios)
        VALUES (${input.companyId}, ${input.mesReferencia}, ${pontoInicio}, ${pontoFim}, ${escuroInicio}, ${escuroFim}, 'aberta', ${totalFunc})
      `) as any[];
      return { id: result.insertId, message: "Competência aberta com sucesso" };
    }),

  // ============================================================
  // 2. PROCESSAR PONTO IMPORTADO + GERAR TIMECARD DAILY
  // ============================================================
  processarPonto: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Validate period exists and is in correct status
      const [periods] = await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} LIMIT 1`
      ) as any[];
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
      }).from(employees).where(
        and(
          eq(employees.companyId, input.companyId),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
        )
      );

      // Get time_records for the ponto period (may include multiple clocks/obras)
      const records = await db.select().from(timeRecords).where(
        and(
          eq(timeRecords.companyId, input.companyId),
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
        DELETE FROM timecard_daily WHERE companyId = ${input.companyId} AND mesCompetencia = ${input.mesReferencia}
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
            horasExtras = rec.horasExtras || "0:00";
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
                const totalHEMins = (parseTime(rec.horasExtras) || 0) + (parseTime(recs[1].horasExtras) || 0);
                horasExtras = minutesToHHMM(totalHEMins);
              }
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
              const jornadaEntrada = 7 * 60;
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
              const jornadaSaida = (7 + criteria.cargaHorariaDiaria + 1) * 60;
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
              horasTrabalhadas, horasExtras, horasNoturnas,
              isFalta, isAtraso, isSaidaAntecipada, minutosAtraso, minutosSaidaAntecipada,
              tipoDia, timeRecordId, obraId,
              origem_registro, num_batidas, is_inconsistente, inconsistencia_tipo,
              obra_secundaria_id, rateio_percentual)
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
              INSERT INTO timecard_daily (companyId, employeeId, data, mesCompetencia, statusDia,
                horasTrabalhadas, horasExtras, horasNoturnas,
                isFalta, isAtraso, isSaidaAntecipada, minutosAtraso, minutosSaidaAntecipada,
                tipoDia, origem_registro, num_batidas, is_inconsistente)
              VALUES (${input.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'escuro',
                ${minutesToHHMM(criteria.cargaHorariaDiaria * 60)}, '0:00', '0:00',
                0, 0, 0, 0, 0,
                ${tipoDia}, 'escuro', 0, 0)
            `);
            totalInserted++;
          }
        }
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
          pontoImportadoEm = NOW(),
          pontoImportadoPor = ${ctx.user.name || "Sistema"}
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
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
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [rows] = await db.execute(sql`
        SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, o.nome as obraNome
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId = ${input.companyId} 
        AND td.mesCompetencia = ${input.mesReferencia}
        AND td.is_inconsistente = 1
        ORDER BY td.data, e.nomeCompleto
      `) as any[];
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
        // Update the timecard_daily with corrected times
        await db.execute(sql`
          UPDATE timecard_daily SET 
            entrada1 = COALESCE(${input.novaEntrada1 || null}, entrada1),
            saida1 = COALESCE(${input.novaSaida1 || null}, saida1),
            entrada2 = COALESCE(${input.novaEntrada2 || null}, entrada2),
            saida2 = COALESCE(${input.novaSaida2 || null}, saida2),
            is_inconsistente = 0,
            inconsistencia_resolvida = 1,
            inconsistencia_resolucao = 'ajustar_horario',
            inconsistencia_obs = ${input.observacao || "Horário ajustado manualmente"},
            inconsistencia_resolvida_por = ${ctx.user.name || "Sistema"},
            inconsistencia_resolvida_em = NOW(),
            origem_registro = 'manual'
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "atestado") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            is_inconsistente = 0,
            inconsistencia_resolvida = 1,
            inconsistencia_resolucao = 'atestado',
            inconsistencia_obs = ${input.observacao || "Justificado por atestado médico"},
            inconsistencia_resolvida_por = ${ctx.user.name || "Sistema"},
            inconsistencia_resolvida_em = NOW(),
            isFalta = 0
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "advertencia") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            is_inconsistente = 0,
            inconsistencia_resolvida = 1,
            inconsistencia_resolucao = 'advertencia',
            inconsistencia_obs = ${input.observacao || "Advertência emitida"},
            inconsistencia_resolvida_por = ${ctx.user.name || "Sistema"},
            inconsistencia_resolvida_em = NOW()
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "justificar" || input.resolucaoTipo === "abonar") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            is_inconsistente = 0,
            inconsistencia_resolvida = 1,
            inconsistencia_resolucao = ${input.resolucaoTipo},
            inconsistencia_obs = ${input.observacao || "Justificado pelo gestor"},
            inconsistencia_resolvida_por = ${ctx.user.name || "Sistema"},
            inconsistencia_resolvida_em = NOW(),
            isFalta = 0
          WHERE id = ${input.timecardDailyId}
        `);
      }

      return { success: true, message: `Inconsistência resolvida: ${input.resolucaoTipo}` };
    }),

  // ============================================================
  // 2.3 RESUMO DE INCONSISTÊNCIAS (para o wizard)
  // ============================================================
  resumoInconsistencias: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [rows] = await db.execute(sql`
        SELECT 
          SUM(CASE WHEN is_inconsistente = 1 THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN inconsistencia_resolvida = 1 THEN 1 ELSE 0 END) as resolvidas,
          SUM(CASE WHEN inconsistencia_tipo = 'batida_impar' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as batidasImpares,
          SUM(CASE WHEN inconsistencia_tipo = 'sobreposicao_horario' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as sobreposicoes,
          SUM(CASE WHEN inconsistencia_tipo = 'entrada_faltando' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as entradasFaltando,
          SUM(CASE WHEN inconsistencia_tipo = 'saida_faltando' AND is_inconsistente = 1 THEN 1 ELSE 0 END) as saidasFaltando
        FROM timecard_daily 
        WHERE companyId = ${input.companyId} AND mesCompetencia = ${input.mesReferencia}
      `) as any[];
      return rows[0] || { pendentes: 0, resolvidas: 0, batidasImpares: 0, sobreposicoes: 0, entradasFaltando: 0, saidasFaltando: 0 };
    }),

  // ============================================================
  // 3. AFERIÇÃO - Cruzar ponto com período "no escuro" do mês anterior
  // ============================================================
  realizarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const prevMes = getPrevMesRef(input.mesReferencia);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevParsed = parseMesRef(prevMes);
      const diaCorte = criteria.diaCorte;
      const prevLastDay = new Date(prevParsed.year, prevParsed.month, 0).getDate();

      // Get "escuro" records from previous month
      const [escuroRecords] = await db.execute(sql`
        SELECT * FROM timecard_daily 
        WHERE companyId = ${input.companyId} 
        AND mesCompetencia = ${prevMes}
        AND statusDia = 'escuro'
        ORDER BY employeeId, data
      `) as any[];
      if (!escuroRecords || (escuroRecords as any[]).length === 0) {
        // Even with no escuro records, advance the period status
        await db.execute(sql`
          UPDATE payroll_periods SET status = 'aferida', afericaoRealizada = 1, afericaoEm = NOW(), afericaoPor = ${ctx.user.name || "Sistema"}
          WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
        `);
        return { totalAferidos: 0, divergencias: 0, message: "Nenhum registro 'no escuro' encontrado no mês anterior. Competência avançada." };
      }

      // Get actual time_records for the escuro period (these come from current month's ponto import)
      const escuroInicio = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`;

      const actualRecords = await db.select().from(timeRecords).where(
        and(
          eq(timeRecords.companyId, input.companyId),
          sql`${timeRecords.data} >= ${escuroInicio}`,
          sql`${timeRecords.data} <= ${escuroFim}`,
        )
      );

      const actualMap = new Map<string, any>();
      for (const r of actualRecords) {
        actualMap.set(`${r.employeeId}-${r.data}`, r);
      }

      let totalAferidos = 0;
      let divergencias = 0;
      const divergenciasList: any[] = [];

      for (const escuro of escuroRecords) {
        const key = `${escuro.employeeId}-${escuro.data}`;
        const actual = actualMap.get(key);
        let resultado = "ok";
        let obs = "";

        if (actual) {
          // Check if there was a falta
          if (!actual.entrada1 && !actual.saida1 && !actual.entrada2 && !actual.saida2) {
            resultado = "falta";
            obs = "Falta identificada na aferição";
            divergencias++;

            // Create adjustment for next month's payment
            const valorHoraEmp = await getEmployeeValorHora(db, escuro.employeeId);
            const valorFalta = valorHoraEmp * criteria.cargaHorariaDiaria;
            
            // Get VR/VT values for discount
            let vrDesconto = "0", vtDesconto = "0";
            if (criteria.descontoVrFalta) {
              const vrVal = await getEmployeeVrDiario(db, escuro.employeeId, input.companyId);
              vrDesconto = formatMoney(vrVal);
            }
            if (criteria.descontoVtFalta) {
              const vtVal = await getEmployeeVtDiario(db, escuro.employeeId);
              vtDesconto = formatMoney(vtVal);
            }
            const totalDesc = valorFalta + parseBRL(vrDesconto) + parseBRL(vtDesconto);

            await db.execute(sql`
              INSERT INTO payroll_adjustments (companyId, employeeId, mesOrigem, mesDesconto, data, tipo, descricao,
                valorDesconto, valorVrDesconto, valorVtDesconto, valorTotal, timecardDailyId, status)
              VALUES (${input.companyId}, ${escuro.employeeId}, ${prevMes}, ${input.mesReferencia}, ${escuro.data}, 
                'falta', ${`Falta dia ${escuro.data} - Aferição do período no escuro de ${prevMes}`},
                ${formatMoney(valorFalta)}, ${vrDesconto}, ${vtDesconto}, ${formatMoney(totalDesc)}, ${escuro.id}, 'pendente')
            `);

            divergenciasList.push({
              employeeId: escuro.employeeId,
              data: escuro.data,
              tipo: "falta",
              valorDesconto: totalDesc,
            });
          } else {
            // Check for tardiness
            const entrada = parseTime(actual.entrada1);
            if (entrada !== null) {
              const jornadaEntrada = 7 * 60;
              const atraso = entrada - jornadaEntrada;
              if (atraso > criteria.pontoToleranciaAtraso) {
                resultado = "atraso";
                obs = `Atraso de ${minutesToHHMM(atraso)} identificado na aferição`;
                divergencias++;

                const valorHoraEmp = await getEmployeeValorHora(db, escuro.employeeId);
                const valorMinuto = valorHoraEmp / 60;
                const valorAtraso = valorMinuto * atraso;
                const totalDesc = valorAtraso;

                await db.execute(sql`
                  INSERT INTO payroll_adjustments (companyId, employeeId, mesOrigem, mesDesconto, data, tipo, descricao,
                    valorDesconto, valorVrDesconto, valorVtDesconto, valorTotal, timecardDailyId, status)
                  VALUES (${input.companyId}, ${escuro.employeeId}, ${prevMes}, ${input.mesReferencia}, ${escuro.data},
                    'atraso', ${`Atraso ${minutesToHHMM(atraso)} dia ${escuro.data} - Aferição do período no escuro de ${prevMes}`},
                    ${formatMoney(valorAtraso)}, '0', '0', ${formatMoney(totalDesc)}, ${escuro.id}, 'pendente')
                `);

                divergenciasList.push({
                  employeeId: escuro.employeeId,
                  data: escuro.data,
                  tipo: "atraso",
                  minutos: atraso,
                  valorDesconto: totalDesc,
                });
              } else {
                resultado = "ok";
              }
            } else {
              resultado = "ok";
            }
          }
        }
        // If no actual record found but was escuro, keep as "ok" (presume worked)

        // Update the timecard_daily record
        await db.execute(sql`
          UPDATE timecard_daily SET 
            statusDia = 'aferido',
            statusAnterior = 'escuro',
            afericaoResultado = ${resultado},
            afericaoObs = ${obs || null},
            afericaoEm = NOW(),
            isFalta = ${resultado === "falta" ? 1 : 0},
            isAtraso = ${resultado === "atraso" ? 1 : 0}
          WHERE id = ${escuro.id}
        `);
        totalAferidos++;
      }

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          afericaoRealizada = 1,
          afericaoEm = NOW(),
          afericaoPor = ${ctx.user.name || "Sistema"},
          totalDivergenciasAferidas = ${divergencias}
        WHERE companyId = ${input.companyId} AND mesReferencia = ${prevMes}
      `);

      // Update current period status to aferida
      await db.execute(sql`
        UPDATE payroll_periods SET status = 'aferida'
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);

      // Create alert if divergences found
      if (divergencias > 0) {
        await db.execute(sql`
          INSERT INTO payroll_alerts (companyId, mesReferencia, tipo, titulo, descricao, prioridade)
          VALUES (${input.companyId}, ${input.mesReferencia}, 'divergencias_aferidas',
            ${`${divergencias} divergência(s) encontrada(s) na aferição de ${prevMes}`},
            ${`Foram identificadas ${divergencias} ocorrências no período "no escuro" de ${prevMes} que gerarão descontos na folha de ${input.mesReferencia}.`},
            ${divergencias > 5 ? "alta" : "media"})
        `);
      }

      return { totalAferidos, divergencias, divergenciasList, message: `Aferição concluída: ${totalAferidos} dias aferidos, ${divergencias} divergências` };
    }),

  // ============================================================
  // 4. GERAR VALE / ADIANTAMENTO
  // ============================================================
  gerarVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);

      // Get active CLT employees
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        horasMensais: employees.horasMensais,
        dataAdmissao: employees.dataAdmissao,
      }).from(employees).where(
        and(
          eq(employees.companyId, input.companyId),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
          sql`${employees.valorHora} IS NOT NULL AND ${employees.valorHora} != ''`,
        )
      );

      // Count faltas per employee in the ponto period
      const [faltasRows] = await db.execute(sql`
        SELECT employeeId, SUM(isFalta) as totalFaltas
        FROM timecard_daily 
        WHERE companyId = ${input.companyId} 
        AND mesCompetencia = ${input.mesReferencia}
        AND statusDia = 'registrado'
        GROUP BY employeeId
      `) as any[];
      const faltasMap = new Map<number, number>();
      for (const r of (faltasRows || [])) {
        faltasMap.set(r.employeeId, r.totalFaltas || 0);
      }

      // Get overtime (HE) values from time_records for the ponto period
      const [heRows] = await db.execute(sql`
        SELECT employeeId, 
          SUM(CASE WHEN horasExtras IS NOT NULL AND horasExtras != '' AND horasExtras != '0:00' 
            THEN CAST(SUBSTRING_INDEX(horasExtras, ':', 1) AS UNSIGNED) * 60 + CAST(SUBSTRING_INDEX(horasExtras, ':', -1) AS UNSIGNED) 
            ELSE 0 END) as totalMinutosHE
        FROM timecard_daily 
        WHERE companyId = ${input.companyId} 
        AND mesCompetencia = ${input.mesReferencia}
        AND statusDia = 'registrado'
        GROUP BY employeeId
      `) as any[];
      const heMap = new Map<number, number>();
      for (const r of (heRows || [])) {
        heMap.set(r.employeeId, r.totalMinutosHE || 0);
      }

      // Clear existing advances for this month
      await db.execute(sql`
        DELETE FROM payroll_advances WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);

      const results: any[] = [];
      let totalVale = 0;
      let bloqueados = 0;

      for (const emp of empList) {
        const valorHora = parseBRL(emp.valorHora);
        const salarioBruto = valorHora * criteria.cargaHorariaDiaria * diasUteis;
        const percentual = criteria.percentualAdiantamento;
        const valorAdiantamento = salarioBruto * (percentual / 100);
        const faltas = faltasMap.get(emp.id) || 0;
        const minutosHE = heMap.get(emp.id) || 0;
        const valorHE = (minutosHE / 60) * valorHora * (1 + criteria.hePercentualDiurna / 100);
        const valorTotalVale = valorAdiantamento + valorHE;

        // Check if employee was admitted after day 10
        let bloqueado = 0;
        let motivoBloqueio = "";
        if (faltas > criteria.maxFaltasVale) {
          bloqueado = 1;
          motivoBloqueio = `Mais de ${criteria.maxFaltasVale} faltas no período (${faltas} faltas)`;
          bloqueados++;
        }
        // Check admission date - if after day 10, no vale
        if (emp.dataAdmissao) {
          const admDay = new Date(emp.dataAdmissao + "T12:00:00Z").getUTCDate();
          const admMonth = new Date(emp.dataAdmissao + "T12:00:00Z").getUTCMonth() + 1;
          const admYear = new Date(emp.dataAdmissao + "T12:00:00Z").getUTCFullYear();
          if (admYear === year && admMonth === month && admDay > 10) {
            bloqueado = 1;
            motivoBloqueio = `Admitido após dia 10 do mês (${emp.dataAdmissao})`;
            bloqueados++;
          }
        }

        await db.execute(sql`
          INSERT INTO payroll_advances (companyId, employeeId, mesReferencia, salarioBrutoMes, percentualAdiantamento,
            valorAdiantamento, valorHorasExtras, horasExtrasQtd, valorTotalVale, bloqueado, motivoBloqueio,
            faltasNoPeriodo, valorHora, cargaHorariaDiaria, diasUteisNoMes, status)
          VALUES (${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatMoney(salarioBruto)}, ${percentual},
            ${formatMoney(valorAdiantamento)}, ${formatMoney(valorHE)}, ${minutesToHHMM(minutosHE)}, ${formatMoney(valorTotalVale)},
            ${bloqueado}, ${motivoBloqueio || null},
            ${faltas}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis}, 'calculado')
        `);

        // Create financial event
        const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;
        if (!bloqueado) {
          await db.execute(sql`
            INSERT INTO financial_events (companyId, tipo, categoria, mesCompetencia, dataPrevista, valor, status, employeeId, employeeName, descricao, origemTipo, criadoPor)
            VALUES (${input.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista}, ${formatMoney(valorTotalVale)}, 'consolidado', ${emp.id}, ${emp.nomeCompleto}, ${`Vale ${input.mesReferencia} - ${emp.nomeCompleto}`}, 'payroll_advance', ${ctx.user.name || "Sistema"})
          `);
          totalVale += valorTotalVale;
        }

        results.push({
          employeeId: emp.id,
          nome: emp.nomeCompleto,
          valorHora,
          salarioBruto,
          valorAdiantamento,
          valorHE,
          valorTotalVale,
          bloqueado: !!bloqueado,
          motivoBloqueio,
          faltas,
          minutosHE,
        });
      }

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'vale_gerado',
          valeGeradoEm = NOW(),
          valeGeradoPor = ${ctx.user.name || "Sistema"},
          totalVale = ${formatMoney(totalVale)}
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);

      return {
        totalFuncionarios: empList.length,
        totalBloqueados: bloqueados,
        totalVale,
        diasUteis,
        percentual: criteria.percentualAdiantamento,
        funcionarios: results,
        message: `Vale gerado: ${empList.length} funcionários, ${bloqueados} bloqueados, total R$ ${formatMoney(totalVale)}`,
      };
    }),

  // ============================================================
  // 5. LISTAR VALES DO MÊS
  // ============================================================
  listarVales: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [rows] = await db.execute(sql`
        SELECT pa.*, e.nomeCompleto, e.funcao, e.codigoInterno
        FROM payroll_advances pa
        LEFT JOIN employees e ON pa.employeeId = e.id
        WHERE pa.companyId = ${input.companyId} AND pa.mesReferencia = ${input.mesReferencia}
        ORDER BY e.nomeCompleto
      `) as any[];
      return rows || [];
    }),

  // ============================================================
  // 6. SIMULAR PAGAMENTO
  // ============================================================
  simularPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);
      const nextMes = getNextMesRef(input.mesReferencia);
      const nextParsed = parseMesRef(nextMes);

      // Get employees
      const empList = await db.select({
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
        obraAtualId: employees.obraAtualId,
      }).from(employees).where(
        and(
          eq(employees.companyId, input.companyId),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
          sql`${employees.valorHora} IS NOT NULL AND ${employees.valorHora} != ''`,
        )
      );

      // Get advances for this month
      const [advRows] = await db.execute(sql`
        SELECT * FROM payroll_advances 
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `) as any[];
      const advMap = new Map<number, any>();
      for (const a of (advRows || [])) {
        advMap.set(a.employeeId, a);
      }

      // Get adjustments (from escuro aferição) for this month
      const [adjRows] = await db.execute(sql`
        SELECT * FROM payroll_adjustments 
        WHERE companyId = ${input.companyId} AND mesDesconto = ${input.mesReferencia} AND status = 'pendente'
      `) as any[];
      const adjMap = new Map<number, any[]>();
      for (const a of (adjRows || [])) {
        if (!adjMap.has(a.employeeId)) adjMap.set(a.employeeId, []);
        adjMap.get(a.employeeId)!.push(a);
      }

      // Get faltas from timecard_daily for the ponto period (registrado only)
      const [faltasRows2] = await db.execute(sql`
        SELECT employeeId, 
          SUM(isFalta) as totalFaltas,
          SUM(isAtraso) as totalAtrasos,
          SUM(minutosAtraso) as totalMinutosAtraso
        FROM timecard_daily 
        WHERE companyId = ${input.companyId} 
        AND mesCompetencia = ${input.mesReferencia}
        AND statusDia = 'registrado'
        GROUP BY employeeId
      `) as any[];
      const faltasMap = new Map<number, any>();
      for (const r of (faltasRows2 || [])) {
        faltasMap.set(r.employeeId, r);
      }

      // Get HE values
      const [heRows2] = await db.execute(sql`
        SELECT employeeId, 
          SUM(CASE WHEN horasExtras IS NOT NULL AND horasExtras != '' AND horasExtras != '0:00' 
            THEN CAST(SUBSTRING_INDEX(horasExtras, ':', 1) AS UNSIGNED) * 60 + CAST(SUBSTRING_INDEX(horasExtras, ':', -1) AS UNSIGNED) 
            ELSE 0 END) as totalMinutosHE
        FROM timecard_daily 
        WHERE companyId = ${input.companyId} 
        AND mesCompetencia = ${input.mesReferencia}
        GROUP BY employeeId
      `) as any[];
      const heMap = new Map<number, number>();
      for (const r of (heRows2 || [])) {
        heMap.set(r.employeeId, r.totalMinutosHE || 0);
      }

      // Clear existing payments for this month
      await db.execute(sql`
        DELETE FROM payroll_payments WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);

      const results: any[] = [];
      let grandTotalLiquido = 0;
      let grandTotalBruto = 0;
      let grandTotalDescontos = 0;

      // Calculate 5th business day of next month
      const dataPagamentoPrevista = getNthBusinessDay(nextParsed.year, nextParsed.month, criteria.diaPagamento);

      for (const emp of empList) {
        const valorHora = parseBRL(emp.valorHora);
        const salarioBruto = valorHora * criteria.cargaHorariaDiaria * diasUteis;
        const minutosHE = heMap.get(emp.id) || 0;
        const valorHE = (minutosHE / 60) * valorHora * (1 + criteria.hePercentualDiurna / 100);
        const totalProventos = salarioBruto + valorHE;

        // Descontos
        const adv = advMap.get(emp.id);
        const descontoAdiantamento = adv ? parseBRL(adv.valorTotalVale) : 0;

        const faltaData = faltasMap.get(emp.id);
        const faltasQtd = faltaData?.totalFaltas || 0;
        const atrasosMinutos = faltaData?.totalMinutosAtraso || 0;
        const descontoFaltas = faltasQtd * valorHora * criteria.cargaHorariaDiaria;
        const descontoAtrasos = (atrasosMinutos / 60) * valorHora;

        // VR/VT discount per falta
        const vrDiario = await getEmployeeVrDiario(db, emp.id, input.companyId);
        const vtDiario = parseBRL(emp.vtValorDiario);
        const descontoVrFaltas = criteria.descontoVrFalta ? faltasQtd * vrDiario : 0;
        const descontoVtFaltas = criteria.descontoVtFalta ? faltasQtd * vtDiario : 0;

        // Pensão
        let descontoPensao = 0;
        if (emp.pensaoAlimenticia) {
          if (emp.pensaoTipo === "percentual") {
            descontoPensao = salarioBruto * (parseBRL(emp.pensaoPercentual) / 100);
          } else {
            descontoPensao = parseBRL(emp.pensaoValor);
          }
        }

        // Acerto do escuro (adjustments from previous month's aferição)
        const adjustments = adjMap.get(emp.id) || [];
        const acertoEscuroValor = adjustments.reduce((acc: number, a: any) => acc + parseBRL(a.valorTotal), 0);
        const acertoEscuroDetalhes = adjustments.map((a: any) => ({
          data: a.data,
          tipo: a.tipo,
          valor: a.valorTotal,
          descricao: a.descricao,
        }));

        // ===== CAMPOS RATEÁVEIS POR OBRA =====
        // VA (Vale Alimentação) - do cadastro do funcionário
        const vaValor = (emp.vaRecebe === '1' || emp.vaRecebe === 'Sim') ? parseBRL(emp.vaValor) : 0;
        // VT (Vale Transporte) - valor total mensal (diário * dias úteis)
        const vtValorMensal = vtDiario * diasUteis;
        // VR (Vale Refeição) - valor total mensal (diário * dias úteis)
        const vrValorMensal = vrDiario * diasUteis;
        // Seguro de Vida
        const seguroVidaValor = parseBRL(emp.seguroVida);
        // FGTS (8% padrão ou percentual do funcionário)
        const fgtsPerc = parseBRL(emp.fgtsPercentual) || 8;
        const fgtsValor = salarioBruto * (fgtsPerc / 100);
        // INSS (percentual do funcionário ou tabela progressiva simplificada)
        const inssPerc = parseBRL(emp.inssPercentual) || 0;
        const inssValor = inssPerc > 0 ? salarioBruto * (inssPerc / 100) : 0;

        // Rateio por obra: buscar dias trabalhados por obra no mês
        const [obraDiasRows] = await db.execute(sql`
          SELECT obraId, COUNT(*) as dias, o.nome as obraNome
          FROM timecard_daily td
          LEFT JOIN obras o ON td.obraId = o.id
          WHERE td.employeeId = ${emp.id} AND td.companyId = ${input.companyId}
          AND td.mesCompetencia = ${input.mesReferencia} AND td.statusDia = 'registrado'
          AND td.obraId IS NOT NULL
          GROUP BY td.obraId, o.nome
        `) as any[];
        const totalDiasObra = (obraDiasRows || []).reduce((s: number, r: any) => s + Number(r.dias), 0) || diasUteis;
        const rateioPorObra = (obraDiasRows || []).map((r: any) => {
          const proporcao = Number(r.dias) / totalDiasObra;
          return {
            obraId: r.obraId,
            obraNome: r.obraNome || 'Sem obra',
            dias: Number(r.dias),
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

        const totalDescontos = descontoAdiantamento + descontoFaltas + descontoAtrasos + descontoVrFaltas + descontoVtFaltas + descontoPensao + acertoEscuroValor + inssValor;
        const salarioLiquido = totalProventos - totalDescontos;

        await db.execute(sql`
          INSERT INTO payroll_payments (companyId, employeeId, mesReferencia, valorHora, cargaHorariaDiaria, diasUteisNoMes,
            salarioBrutoMes, horasExtrasValor, totalProventos,
            descontoAdiantamento, descontoFaltas, descontoFaltasQtd, descontoAtrasos, descontoAtrasosMinutos,
            descontoVrFaltas, descontoVtFaltas, descontoPensao, descontoInss, descontoFgts, descontoOutros,
            totalDescontos, acertoEscuroValor, acertoEscuroDetalhes, salarioLiquido,
            vaValor, vtValor, vrValor, seguroVidaValor, fgtsValor, inssValor, rateioPorObra,
            status, dataPagamentoPrevista)
          VALUES (${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis},
            ${formatMoney(salarioBruto)}, ${formatMoney(valorHE)}, ${formatMoney(totalProventos)},
            ${formatMoney(descontoAdiantamento)}, ${formatMoney(descontoFaltas)}, ${faltasQtd}, ${formatMoney(descontoAtrasos)}, ${atrasosMinutos},
            ${formatMoney(descontoVrFaltas)}, ${formatMoney(descontoVtFaltas)}, ${formatMoney(descontoPensao)}, ${formatMoney(inssValor)}, ${formatMoney(fgtsValor)}, '0',
            ${formatMoney(totalDescontos)}, ${formatMoney(acertoEscuroValor)}, ${JSON.stringify(acertoEscuroDetalhes)}, ${formatMoney(salarioLiquido)},
            ${formatMoney(vaValor)}, ${formatMoney(vtValorMensal)}, ${formatMoney(vrValorMensal)}, ${formatMoney(seguroVidaValor)}, ${formatMoney(fgtsValor)}, ${formatMoney(inssValor)}, ${JSON.stringify(rateioPorObra)},
            'simulado', ${dataPagamentoPrevista})
        `);

        grandTotalLiquido += salarioLiquido;
        grandTotalBruto += salarioBruto;
        grandTotalDescontos += totalDescontos;

        results.push({
          employeeId: emp.id,
          nome: emp.nomeCompleto,
          funcao: emp.funcao,
          codigoInterno: emp.codigoInterno,
          salarioBruto,
          valorHE,
          totalProventos,
          descontoAdiantamento,
          descontoFaltas,
          faltasQtd,
          descontoAtrasos,
          descontoVrFaltas,
          descontoVtFaltas,
          descontoPensao,
          descontoInss: inssValor,
          descontoFgts: fgtsValor,
          acertoEscuroValor,
          totalDescontos,
          salarioLiquido,
          dataPagamentoPrevista,
          vaValor,
          vtValor: vtValorMensal,
          vrValor: vrValorMensal,
          seguroVidaValor,
          rateioPorObra,
        });
      }

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'pagamento_simulado',
          pagamentoSimuladoEm = NOW(),
          pagamentoSimuladoPor = ${ctx.user.name || "Sistema"},
          totalSalarioBruto = ${formatMoney(grandTotalBruto)},
          totalDescontos = ${formatMoney(grandTotalDescontos)},
          totalLiquido = ${formatMoney(grandTotalLiquido)}
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);

      return {
        totalFuncionarios: empList.length,
        totalBruto: grandTotalBruto,
        totalDescontos: grandTotalDescontos,
        totalLiquido: grandTotalLiquido,
        dataPagamentoPrevista,
        diasUteis,
        funcionarios: results,
        message: `Simulação concluída: ${empList.length} funcionários, líquido total R$ ${formatMoney(grandTotalLiquido)}`,
      };
    }),

  // ============================================================
  // 7. LISTAR PAGAMENTOS
  // ============================================================
  listarPagamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [rows] = await db.execute(sql`
        SELECT pp.*, e.nomeCompleto, e.funcao, e.codigoInterno
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        WHERE pp.companyId = ${input.companyId} AND pp.mesReferencia = ${input.mesReferencia}
        ORDER BY e.nomeCompleto
      `) as any[];
      return rows || [];
    }),

  // ============================================================
  // 8. CONSOLIDAR PAGAMENTO
  // ============================================================
  consolidarPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Update all payments to consolidated
      await db.execute(sql`
        UPDATE payroll_payments SET 
          status = 'consolidado',
          consolidadoPor = ${ctx.user.name || "Sistema"},
          consolidadoEm = NOW()
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} AND status = 'simulado'
      `);

      // Mark adjustments as applied
      await db.execute(sql`
        UPDATE payroll_adjustments SET status = 'aplicado'
        WHERE companyId = ${input.companyId} AND mesDesconto = ${input.mesReferencia} AND status = 'pendente'
      `);

      // Create financial events for payments
      const [payments] = await db.execute(sql`
        SELECT pp.*, e.nomeCompleto FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        WHERE pp.companyId = ${input.companyId} AND pp.mesReferencia = ${input.mesReferencia}
      `) as any[];

      for (const p of (payments || [])) {
        await db.execute(sql`
          INSERT INTO financial_events (companyId, tipo, categoria, mesCompetencia, dataPrevista, valor, status, employeeId, employeeName, descricao, origemTipo, origemId, criadoPor)
          VALUES (${input.companyId}, 'saida_pagamento', 'folha_pagamento', ${input.mesReferencia}, ${p.dataPagamentoPrevista}, ${p.salarioLiquido}, 'consolidado', ${p.employeeId}, ${p.nomeCompleto}, ${`Pagamento ${input.mesReferencia} - ${p.nomeCompleto}`}, 'payroll_payment', ${p.id}, ${ctx.user.name || "Sistema"})
        `);
      }

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'consolidada',
          consolidadoEm = NOW(),
          consolidadoPor = ${ctx.user.name || "Sistema"}
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);

      return { message: "Pagamento consolidado com sucesso" };
    }),

  // ============================================================
  // 9. TRAVAR COMPETÊNCIA
  // ============================================================
  travarCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'travada',
          travadoEm = NOW(),
          travadoPor = ${ctx.user.name || "Sistema"}
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `);
      return { message: "Competência travada com sucesso" };
    }),

  // ============================================================
  // 10. TIMECARD DAILY - Listar registros diários
  // ============================================================
  listarTimecardDaily: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      let baseQuery;
      if (input.employeeId) {
        baseQuery = sql`
          SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno
          FROM timecard_daily td
          LEFT JOIN employees e ON td.employeeId = e.id
          WHERE td.companyId = ${input.companyId} AND td.mesCompetencia = ${input.mesReferencia}
          AND td.employeeId = ${input.employeeId}
          ORDER BY td.data, e.nomeCompleto
        `;
      } else {
        baseQuery = sql`
          SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno
          FROM timecard_daily td
          LEFT JOIN employees e ON td.employeeId = e.id
          WHERE td.companyId = ${input.companyId} AND td.mesCompetencia = ${input.mesReferencia}
          ORDER BY td.data, e.nomeCompleto
        `;
      }
      const [rows] = await db.execute(baseQuery) as any[];
      return rows || [];
    }),

  // ============================================================
  // 11. RELATÓRIO DE DIVERGÊNCIAS
  // ============================================================
  relatorioDivergencias: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [rows] = await db.execute(sql`
        SELECT pa.*, e.nomeCompleto, e.funcao, e.codigoInterno
        FROM payroll_adjustments pa
        LEFT JOIN employees e ON pa.employeeId = e.id
        WHERE pa.companyId = ${input.companyId} AND pa.mesDesconto = ${input.mesReferencia}
        ORDER BY pa.data, e.nomeCompleto
      `) as any[];
      return rows || [];
    }),

  // ============================================================
  // 12. ALERTAS
  // ============================================================
  listarAlertas: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      let query;
      if (input.mesReferencia) {
        query = sql`SELECT * FROM payroll_alerts WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} ORDER BY createdAt DESC`;
      } else {
        query = sql`SELECT * FROM payroll_alerts WHERE companyId = ${input.companyId} AND resolvido = 0 ORDER BY createdAt DESC LIMIT 50`;
      }
      const [rows] = await db.execute(query) as any[];
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
    .input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const lim = input.limit || 100;
      let query;
      if (input.mesReferencia) {
        query = sql`SELECT * FROM financial_events WHERE companyId = ${input.companyId} AND mesCompetencia = ${input.mesReferencia} ORDER BY dataPrevista, tipo LIMIT ${lim}`;
      } else {
        query = sql`SELECT * FROM financial_events WHERE companyId = ${input.companyId} ORDER BY dataPrevista DESC LIMIT ${lim}`;
      }
      const [rows] = await db.execute(query) as any[];
      return rows || [];
    }),

  previsaoFinanceira: protectedProcedure
    .input(z.object({ companyId: z.number(), mesesAFrente: z.number().default(6) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);

      // Get active employees for projection
      const [empRows] = await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CAST(REPLACE(REPLACE(valorHora, '.', ''), ',', '.') AS DECIMAL(10,2))) as somaValorHora
        FROM employees 
        WHERE companyId = ${input.companyId} AND tipoContrato = 'CLT' AND status IN ('Ativo', 'Ferias') AND deletedAt IS NULL
        AND valorHora IS NOT NULL AND valorHora != ''
      `) as any[];
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
        const [actual] = await db.execute(sql`
          SELECT * FROM payroll_periods WHERE companyId = ${input.companyId} AND mesReferencia = ${mesRef} LIMIT 1
        `) as any[];
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
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      
      // Get timecard_daily grouped by obra
      const [obraRows] = await db.execute(sql`
        SELECT td.obraId, o.nome as obraNome,
          COUNT(DISTINCT td.employeeId) as totalFuncionarios,
          SUM(CASE WHEN td.isFalta = 1 THEN 1 ELSE 0 END) as totalFaltas,
          COUNT(*) as totalDias
        FROM timecard_daily td
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.companyId = ${input.companyId} AND td.mesCompetencia = ${input.mesReferencia}
        GROUP BY td.obraId, o.nome
        ORDER BY totalFuncionarios DESC
      `) as any[];

      // Get payment totals by obra (via employee allocation)
      const [payRows] = await db.execute(sql`
        SELECT e.obraAtualId as obraId, o.nome as obraNome,
          SUM(CAST(pp.salarioBrutoMes AS DECIMAL(15,2))) as totalBruto,
          SUM(CAST(pp.salarioLiquido AS DECIMAL(15,2))) as totalLiquido,
          SUM(CAST(pp.horasExtrasValor AS DECIMAL(15,2))) as totalHE,
          COUNT(*) as totalFuncionarios
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        LEFT JOIN obras o ON e.obraAtualId = o.id
        WHERE pp.companyId = ${input.companyId} AND pp.mesReferencia = ${input.mesReferencia}
        GROUP BY e.obraAtualId, o.nome
        ORDER BY totalBruto DESC
      `) as any[];

      return {
        porObra: payRows || [],
        timecardPorObra: obraRows || [],
      };
    }),

  // ============================================================
  // 15. CRITÉRIOS CONFIGURÁVEIS
  // ============================================================
  getCriterios: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      return await getPayrollCriteria(db, input.companyId);
    }),

  salvarCriterio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      chave: z.string(),
      valor: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const [existing] = await db.execute(sql`
        SELECT id FROM system_criteria WHERE companyId = ${input.companyId} AND chave = ${input.chave} LIMIT 1
      `) as any[];
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
          abonadoPor = ${ctx.user.name || "Sistema"},
          abonadoEm = NOW(),
          motivoAbono = ${input.motivo}
        WHERE id = ${input.adjustmentId}
      `);
      return { success: true };
    }),

  // ============================================================
  // 17. RESUMO DA COMPETÊNCIA
  // ============================================================
  resumoCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Period info
      const [periodRows] = await db.execute(sql`
        SELECT * FROM payroll_periods WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} LIMIT 1
      `) as any[];
      const period = periodRows[0] || null;

      // Timecard stats
      const [tcStatsRows] = await db.execute(sql`
        SELECT 
          COUNT(*) as totalRegistros,
          SUM(CASE WHEN statusDia = 'registrado' THEN 1 ELSE 0 END) as registrados,
          SUM(CASE WHEN statusDia = 'escuro' THEN 1 ELSE 0 END) as noEscuro,
          SUM(CASE WHEN statusDia = 'aferido' THEN 1 ELSE 0 END) as aferidos,
          SUM(isFalta) as totalFaltas,
          SUM(isAtraso) as totalAtrasos,
          COUNT(DISTINCT employeeId) as totalFuncionarios
        FROM timecard_daily 
        WHERE companyId = ${input.companyId} AND mesCompetencia = ${input.mesReferencia}
      `) as any[];

      // Advances stats
      const [advStatsRows] = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN bloqueado = 1 THEN 1 ELSE 0 END) as bloqueados,
          SUM(CAST(valorTotalVale AS DECIMAL(15,2))) as totalVale
        FROM payroll_advances 
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `) as any[];

      // Payment stats
      const [payStatsRows] = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CAST(salarioBrutoMes AS DECIMAL(15,2))) as totalBruto,
          SUM(CAST(totalDescontos AS DECIMAL(15,2))) as totalDescontos,
          SUM(CAST(salarioLiquido AS DECIMAL(15,2))) as totalLiquido
        FROM payroll_payments 
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `) as any[];

      // Adjustments stats
      const [adjStatsRows] = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN status = 'aplicado' THEN 1 ELSE 0 END) as aplicados,
          SUM(CASE WHEN status = 'abonado' THEN 1 ELSE 0 END) as abonados,
          SUM(CAST(valorTotal AS DECIMAL(15,2))) as totalValor
        FROM payroll_adjustments 
        WHERE companyId = ${input.companyId} AND mesDesconto = ${input.mesReferencia}
      `) as any[];

      // Alerts
      const [alertStatsRows] = await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CASE WHEN lido = 0 THEN 1 ELSE 0 END) as naoLidos
        FROM payroll_alerts 
        WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `) as any[];

      // Financial events
      const [finStatsRows] = await db.execute(sql`
        SELECT COUNT(*) as total, COALESCE(SUM(CAST(valor AS DECIMAL(15,2))), 0) as totalValor
        FROM financial_events 
        WHERE companyId = ${input.companyId} AND mesCompetencia = ${input.mesReferencia}
      `) as any[];

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
    .input(z.object({ companyId: z.number(), mesReferencia: z.string(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Get company info
      const [companyRows] = await db.execute(sql`
        SELECT razaoSocial, nomeFantasia, cnpj, logoUrl FROM companies WHERE id = ${input.companyId} LIMIT 1
      `) as any[];
      const company = companyRows[0] || {};

      // Get period info
      const [periodRows] = await db.execute(sql`
        SELECT * FROM payroll_periods WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia} LIMIT 1
      `) as any[];
      const period = periodRows[0] || null;

      // Build employee filter
      const empFilter = input.employeeId ? sql` AND pp.employeeId = ${input.employeeId}` : sql``;

      // Get payments with employee details
      const [payRows] = await db.execute(sql`
        SELECT pp.*, e.nomeCompleto, e.funcao, e.codigoInterno, e.cpf, e.dataAdmissao, e.valorHora,
          e.pis, e.ctps, e.obraAtual
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        WHERE pp.companyId = ${input.companyId} AND pp.mesReferencia = ${input.mesReferencia} ${empFilter}
        ORDER BY e.nomeCompleto
      `) as any[];

      // Get advances
      const [advRows] = await db.execute(sql`
        SELECT * FROM payroll_advances WHERE companyId = ${input.companyId} AND mesReferencia = ${input.mesReferencia}
      `) as any[];
      const advMap = new Map<number, any>();
      for (const a of (advRows || [])) advMap.set(a.employeeId, a);

      // Get obra names
      const [obraRows] = await db.execute(sql`SELECT id, nome FROM obras WHERE companyId = ${input.companyId}`) as any[];
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
            ...(parseBRL(p.descontoVtFaltas) > 0 ? [{ descricao: "VT (dias de falta)", referencia: `${p.descontoFaltasQtd} dias`, valor: parseBRL(p.descontoVtFaltas) }] : []),
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
          nome: company.nomeFantasia || company.razaoSocial || "FC Engenharia",
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
    .input(z.object({
      companyId: z.number(),
      timecardDailyId: z.number(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      // Get the inconsistent record with employee details
      const [rows] = await db.execute(sql`
        SELECT td.*, e.nomeCompleto, e.funcao, e.codigoInterno, e.dataAdmissao, e.status as empStatus,
          o.nome as obraNome
        FROM timecard_daily td
        LEFT JOIN employees e ON td.employeeId = e.id
        LEFT JOIN obras o ON td.obraId = o.id
        WHERE td.id = ${input.timecardDailyId}
        LIMIT 1
      `) as any[];
      const record = rows[0];
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
      // Get recent history for this employee (last 30 days)
      const [histRows] = await db.execute(sql`
        SELECT data, statusDia, isFalta, isAtraso, is_inconsistente, inconsistencia_tipo,
          entrada1, saida1, entrada2, saida2, horasTrabalhadas
        FROM timecard_daily
        WHERE employeeId = ${record.employeeId} AND companyId = ${input.companyId}
          AND mesCompetencia = ${input.mesReferencia}
        ORDER BY data DESC LIMIT 30
      `) as any[];
      // Get golden rules for context
      const [rulesRows] = await db.execute(sql`
        SELECT titulo, descricao, categoria FROM golden_rules
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL
        AND categoria IN ('rh', 'operacional', 'geral')
        ORDER BY prioridade LIMIT 10
      `) as any[];
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
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      etapa: z.enum(["ponto", "escuro", "vale", "pagamento", "consolidacao"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companyId, mesReferencia, etapa } = input;

      // Check period exists and is not travada
      const [periods] = await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia} LIMIT 1`
      ) as any[];
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

      // Delete data from related tables
      for (const table of config.tables) {
        if (table === "payroll_adjustments") {
          await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia}`);
        } else if (table === "payroll_uploads") {
          await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia}`);
        } else {
          await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia}`);
        }
      }

      // Also clear downstream data (cascade)
      const etapaOrder = ["ponto", "escuro", "vale", "pagamento", "consolidacao"];
      const etapaIdx = etapaOrder.indexOf(etapa);
      for (let i = etapaIdx + 1; i < etapaOrder.length; i++) {
        const downstream = etapaMap[etapaOrder[i]];
        for (const table of downstream.tables) {
          await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia}`);
        }
      }

      // Update period status and clear timestamp fields
      const clearSets = config.clearFields.map(f => `${f} = NULL`).join(", ");
      // Also clear downstream fields
      const allClearFields = new Set(config.clearFields);
      for (let i = etapaIdx + 1; i < etapaOrder.length; i++) {
        for (const f of etapaMap[etapaOrder[i]].clearFields) allClearFields.add(f);
      }
      const allClearSets = Array.from(allClearFields).map(f => `${f} = NULL`).join(", ");

      await db.execute(
        sql`UPDATE payroll_periods SET status = ${config.newStatus}, ${sql.raw(allClearSets)} WHERE id = ${periodId}`
      );

      return { success: true, newStatus: config.newStatus, etapaLimpa: etapa };
    }),

  resetarCompetencia: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companyId, mesReferencia } = input;

      // Check period exists and is not travada
      const [periods] = await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia} LIMIT 1`
      ) as any[];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada" });
      if (periods[0].status === "travada") throw new TRPCError({ code: "FORBIDDEN", message: "Competência travada. Não é possível limpar." });

      const periodId = periods[0].id;

      // Delete ALL data for this competência
      const tables = [
        "timecard_daily", "time_records", "time_inconsistencies",
        "payroll_uploads", "payroll_adjustments", "payroll_advances",
        "payroll_payments", "payroll_alerts",
      ];
      for (const table of tables) {
        await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE companyId = ${companyId} AND mesReferencia = ${mesReferencia}`);
      }

      // Reset period to "aberta" and clear all timestamps
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'aberta',
          pontoImportadoEm = NULL, pontoImportadoPor = NULL,
          afericaoRealizada = 0, afericaoEm = NULL, afericaoPor = NULL,
          valeGeradoEm = NULL, valeGeradoPor = NULL,
          pagamentoSimuladoEm = NULL, pagamentoSimuladoPor = NULL,
          consolidadoEm = NULL, consolidadoPor = NULL,
          totalDivergenciasAferidas = 0, retificadoEm = NULL
        WHERE id = ${periodId}
      `);

      return { success: true, newStatus: "aberta" };
    }),
});
// ============================================================
// HELPER FUNCTIONS
// ============================================================
async function getEmployeeValorHora(db: any, employeeId: number): Promise<number> {
  const [rows] = await db.execute(sql`SELECT valorHora FROM employees WHERE id = ${employeeId} LIMIT 1`) as any[];
  return parseBRL(rows[0]?.valorHora);
}

async function getEmployeeVrDiario(db: any, employeeId: number, companyId: number): Promise<number> {
  // Try to get from vr_benefits for current month
  const [rows] = await db.execute(sql`
    SELECT valorDiario FROM vr_benefits 
    WHERE employeeId = ${employeeId} AND companyId = ${companyId}
    ORDER BY mesReferencia DESC LIMIT 1
  `) as any[];
  if (rows[0]?.valorDiario) return parseBRL(rows[0].valorDiario);
  return 0;
}

async function getEmployeeVtDiario(db: any, employeeId: number): Promise<number> {
  const [rows] = await db.execute(sql`SELECT vtValorDiario FROM employees WHERE id = ${employeeId} LIMIT 1`) as any[];
  return parseBRL(rows[0]?.vtValorDiario);
}
