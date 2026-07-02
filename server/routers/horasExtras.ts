import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { employees, systemCriteria } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";
import { getFeriadosObservadosForPeriod, indexFeriadosObservados, isFeriadoObservado } from "./feriados";

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

type Origem = "aprovada" | "sem_solicitacao";
type OrigemBucket = { aprovada: number; sem_solicitacao: number };
const newBucket = (): OrigemBucket => ({ aprovada: 0, sem_solicitacao: 0 });

async function computeHEForPeriod(
  db: any,
  companyId: number,
  dataInicio: string,
  dataFim: string,
  cargaHorariaDiaria: number
) {
  // Rev. 3352 — feriados city/observância-aware: só conta como feriado (jornada
  // esperada=0 → HE 100%) quando OBSERVADO e aplicável à CIDADE/UF da obra onde a
  // pessoa bateu ponto naquele dia. Facultativo não-observado = dia normal.
  const feriadosOcorr = await getFeriadosObservadosForPeriod(db, [companyId], dataInicio, dataFim);
  const feriadosIdx = indexFeriadosObservados(feriadosOcorr);

  // Rev. 2179 — pré-carrega o conjunto de (employeeId, data) coberto por
  // solicitações de HE aprovadas no intervalo, para classificar cada dia
  // de HE como "aprovada" ou "sem_solicitacao".
  const apprRows = ((await db.execute(sql`
    SELECT sf."employeeId", s."dataSolicitacao"
    FROM he_solicitacoes s
    JOIN he_solicitacao_funcionarios sf ON sf."solicitacaoId" = s.id
    WHERE s."companyId" = ${companyId}
      AND s.status = 'aprovada'
      AND s."dataSolicitacao" >= ${dataInicio}::date
      AND s."dataSolicitacao" <= ${dataFim}::date
  `)) as any).rows || [];
  const approvedSet = new Set<string>();
  for (const r of apprRows) {
    const d = r.dataSolicitacao instanceof Date
      ? r.dataSolicitacao.toISOString().slice(0, 10)
      : String(r.dataSolicitacao).slice(0, 10);
    approvedSet.add(`${Number(r.employeeId)}|${d}`);
  }

  // Agrupa por (employeeId, data) pegando o maior horasTrabalhadas — evita dupla contagem de importações.
  // Também traz `atrasos` para descontar do HE bruto antes do pagamento (saldo líquido).
  // Rev. 3352 — traz a obra do registro (cidade/estado) p/ resolver feriado por CIDADE.
  // O DISTINCT ON escolhe 1 registro por (emp,dia) → a cidade do feriado é a da obra
  // desse registro (maior horasTrabalhadas).
  const trRaws = ((await db.execute(sql`
    SELECT DISTINCT ON (tr."employeeId", tr.data)
           tr."employeeId", tr.data, tr."horasTrabalhadas", tr.atrasos, tr."obraId",
           o.cidade AS "obraCidade", o.estado AS "obraEstado",
           e."jornadaTrabalho", e."nomeCompleto", e."valorHora", e."salarioBase", e."horasMensais"
    FROM time_records tr
    JOIN employees e ON e.id = tr."employeeId"
    LEFT JOIN obras o ON o.id = tr."obraId"
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

  // Rev. 2179 — gross por origem (aprovada / sem_solicitacao), por empId
  const heUtilGrossByOrig = new Map<number, OrigemBucket>();
  const heFimGrossByOrig  = new Map<number, OrigemBucket>();

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
      // Rev. 3352 — feriado tratado como domingo (jornada esperada=0 → HE 100%)
      // SÓ se for OBSERVADO na cidade/UF da obra desse registro. Facultativo
      // não-observado = dia normal.
      const isFeriado = isFeriadoObservado(feriadosIdx, dateStr, r.obraCidade, r.obraEstado);
      const expectedMins = isFeriado ? 0 : getExpectedMins(r.jornadaTrabalho, dateStr, cargaHorariaDiaria);
      const heMins = Math.max(0, trabMins - expectedMins);
      if (heMins > 0) {
        const origem: Origem = approvedSet.has(`${empId}|${dateStr}`) ? "aprovada" : "sem_solicitacao";
        // Domingo (0) ou feriado → HE 100%. Sábado (6) e dias úteis → HE 60%
        if (dow === 0 || isFeriado) {
          heFimGross.set(empId,  (heFimGross.get(empId)  || 0) + heMins);
          if (!heFimGrossByOrig.has(empId)) heFimGrossByOrig.set(empId, newBucket());
          heFimGrossByOrig.get(empId)![origem] += heMins;
        } else {
          heUtilGross.set(empId, (heUtilGross.get(empId) || 0) + heMins);
          if (!heUtilGrossByOrig.has(empId)) heUtilGrossByOrig.set(empId, newBucket());
          heUtilGrossByOrig.get(empId)![origem] += heMins;
        }
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

  // Rev. 2179 — net por origem (após desconto de atrasos, rateado proporcional ao gross)
  const heUtilByOrig = new Map<number, OrigemBucket>();
  const heFimByOrig  = new Map<number, OrigemBucket>();

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

    let netUtil: number;
    let netFim: number;
    if (desconto === 0) {
      netUtil = grossUtil;
      netFim  = grossFim;
    } else if (net === 0) {
      netUtil = 0;
      netFim  = 0;
    } else {
      const ratio = net / gross;
      netUtil = Math.round(grossUtil * ratio);
      netFim  = Math.max(0, net - netUtil);
    }
    heUtilMap.set(empId, netUtil);
    heFimMap.set(empId, netFim);
    heMap.set(empId, netUtil + netFim);

    // Rev. 2179 — rateia o net entre origens proporcionalmente ao gross de cada origem
    const utilGB = heUtilGrossByOrig.get(empId) || newBucket();
    const fimGB  = heFimGrossByOrig.get(empId)  || newBucket();

    const splitProporcional = (totalNet: number, bucket: OrigemBucket): OrigemBucket => {
      const totalGross = bucket.aprovada + bucket.sem_solicitacao;
      if (totalNet <= 0 || totalGross <= 0) return newBucket();
      if (bucket.sem_solicitacao === 0) return { aprovada: totalNet, sem_solicitacao: 0 };
      if (bucket.aprovada === 0) return { aprovada: 0, sem_solicitacao: totalNet };
      const aprov = Math.round((bucket.aprovada / totalGross) * totalNet);
      const sem   = Math.max(0, totalNet - aprov);
      return { aprovada: aprov, sem_solicitacao: sem };
    };

    heUtilByOrig.set(empId, splitProporcional(netUtil, utilGB));
    heFimByOrig.set(empId,  splitProporcional(netFim,  fimGB));
  }

  return {
    heUtilMap, heFimMap, heMap, empMeta,
    heUtilGross, heFimGross, heGross, atrasoMap, atrasoDescontadoMap,
    heUtilByOrig, heFimByOrig, // Rev. 2179
  };
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
          SELECT hpe.*, e."nomeCompleto", e.funcao, e."codigoInterno", e."fotoUrl"
          FROM he_period_employees hpe
          LEFT JOIN employees e ON e.id = hpe."employeeId"
          WHERE hpe."hePeriodId" = ${input.hePeriodId}
          ORDER BY e."nomeCompleto",
                   -- Rev. 2179 — "aprovada" antes de "sem_solicitacao" no agrupamento
                   CASE WHEN hpe.origem = 'aprovada' THEN 0 ELSE 1 END
        `),
      ]);
      const period = ((periodRows as any).rows || [])[0] || null;
      const employees = (empRows as any).rows || [];

      // Rev. 2183 / 2185 — obras trabalhadas por funcionário no período (filtro UI).
      //
      // Rev. 2185 (BUG FIX): a Rev. 2183 lia obras SÓ de `time_records`, o que
      // gerava falso-positivo: se um funcionário com HE aprovada na Obra A
      // batia ponto em outra Obra B no mesmo período, o filtro "Obra B"
      // mostrava a linha "Aprovada" dele (que na verdade era da Obra A).
      //
      // Fix: dividir `obrasPorEmp` POR ORIGEM, espelhando a classificação de
      // `computeHEForPeriod`:
      //   - origem='aprovada'      → obraId vem da própria solicitação HE
      //                              aprovada (fonte de verdade); JOIN em
      //                              he_solicitacoes + he_solicitacao_funcionarios.
      //   - origem='sem_solicitacao' → obraId vem de time_records, EXCLUINDO
      //                                dias cobertos por solicitação aprovada
      //                                (esses dias já viraram origem 'aprovada').
      //
      // Retorna: { employeeId, origem, obraId, obraNome }. O client filtra
      // por (employeeId + origem), garantindo que cada linha split (Rev. 2179)
      // só apareça sob o filtro de obra correto.
      let obrasPorEmp: Array<{ employeeId: number; origem: "aprovada" | "sem_solicitacao"; obraId: number | null; obraNome: string | null }> = [];
      if (period && employees.length > 0) {
        const empIds = employees.map((e: any) => Number(e.employeeId)).filter(Boolean);
        if (empIds.length > 0) {
          try {
            // (1) Obras das solicitações HE APROVADAS no range do período.
            //     Rev. 2187 — `obraId IS NOT NULL` para não vazar "Sem Obra"
            //     no Select de filtro (LEFT JOIN podia trazer obras deletadas).
            const aprovadasRows = ((await db.execute(sql`
              SELECT DISTINCT sf."employeeId", s."obraId", o.nome AS "obraNome"
              FROM he_solicitacoes s
              JOIN he_solicitacao_funcionarios sf ON sf."solicitacaoId" = s.id
              JOIN obras o ON o.id = s."obraId"
              WHERE s."companyId" = ${period.companyId}
                AND s.status = 'aprovada'
                AND sf."employeeId" IN (${sql.join(empIds.map((id: number) => sql`${id}`), sql`,`)})
                AND s."dataSolicitacao" >= ${period.dataInicio}::date
                AND s."dataSolicitacao" <= ${period.dataFim}::date
            `)) as any).rows || [];

            // (2) Obras de time_records FORA de dias cobertos por solicitação
            //     aprovada (espelha o que vira origem 'sem_solicitacao').
            //     Rev. 2187 — INNER JOIN obras + `tr."obraId" IS NOT NULL`:
            //     pontos sem obra (Infleet sem tag, etc.) não devem virar
            //     uma opção "Sem Obra" no filtro — esses funcionários
            //     continuam aparecendo em "Todas as obras".
            //     Rev. 2188 — filtro adicional: SÓ obras onde o ponto
            //     gerou HE de fato (`horasExtras > '0:00'`). Antes,
            //     qualquer ponto da obra no período virava opção no
            //     dropdown, mesmo quando a obra não contribuiu com HE.
            const semSolRows = ((await db.execute(sql`
              SELECT DISTINCT tr."employeeId", tr."obraId", o.nome AS "obraNome"
              FROM time_records tr
              JOIN obras o ON o.id = tr."obraId"
              WHERE tr."companyId" = ${period.companyId}
                AND tr."obraId" IS NOT NULL
                AND tr."horasExtras" IS NOT NULL
                AND tr."horasExtras" NOT IN ('', '0', '0:00', '00:00', '0:0')
                AND tr."employeeId" IN (${sql.join(empIds.map((id: number) => sql`${id}`), sql`,`)})
                AND tr.data >= ${period.dataInicio}::date
                AND tr.data <= ${period.dataFim}::date
                AND NOT EXISTS (
                  SELECT 1
                  FROM he_solicitacoes s2
                  JOIN he_solicitacao_funcionarios sf2 ON sf2."solicitacaoId" = s2.id
                  WHERE s2."companyId" = ${period.companyId}
                    AND s2.status = 'aprovada'
                    AND sf2."employeeId" = tr."employeeId"
                    AND s2."dataSolicitacao" = tr.data
                )
            `)) as any).rows || [];

            obrasPorEmp = [
              ...aprovadasRows.map((r: any) => ({
                employeeId: Number(r.employeeId),
                origem: "aprovada" as const,
                obraId: r.obraId != null ? Number(r.obraId) : null,
                obraNome: r.obraNome || null,
              })),
              ...semSolRows.map((r: any) => ({
                employeeId: Number(r.employeeId),
                origem: "sem_solicitacao" as const,
                obraId: r.obraId != null ? Number(r.obraId) : null,
                obraNome: r.obraNome || null,
              })),
            ];
          } catch (err: any) {
            console.error("[heModulo.getDetalhe] falha ao buscar obrasPorEmp:", err?.message || err);
          }
        }
      }

      return { period, employees, obrasPorEmp };
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

      // Rev. 3352 — traz obra (cidade/estado) do registro p/ resolver feriado por cidade.
      const trRows = ((await db.execute(sql`
        SELECT DISTINCT ON (tr.data)
          tr.data, tr."horasTrabalhadas", tr.atrasos, tr.entrada1, tr.saida1, tr.entrada2, tr.saida2, tr.fonte,
          tr."obraId", o.cidade AS "obraCidade", o.estado AS "obraEstado", o.nome AS "obraNome"
        FROM time_records tr
        LEFT JOIN obras o ON o.id = tr."obraId"
        WHERE tr."employeeId" = ${input.employeeId}
          AND tr."companyId" = ${Number(period.companyId)}
          AND tr.data >= ${period.dataInicio}::date
          AND tr.data <= ${period.dataFim}::date
          AND (
            (tr."horasTrabalhadas" IS NOT NULL AND tr."horasTrabalhadas" != '' AND tr."horasTrabalhadas" != '0:00')
            OR (tr.atrasos IS NOT NULL AND tr.atrasos != '' AND tr.atrasos != '0:00')
          )
        ORDER BY tr.data, tr."horasTrabalhadas" DESC
      `)) as any).rows || [];

      // Rev. 3352 — feriados city/observância-aware (vê T002). `period.dataInicio/dataFim`
      // pode vir como Date (driver pg) ou string — `.toISOString().slice(0,10)` evita
      // garbage tipo "Mon May 01 2026...".
      const toIsoDate = (v: any): string =>
        v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
      const dataIniStr = toIsoDate(period.dataInicio);
      const dataFimStr = toIsoDate(period.dataFim);
      const feriadosOcorr = await getFeriadosObservadosForPeriod(
        db,
        [Number(period.companyId)],
        dataIniStr,
        dataFimStr,
      );
      const feriadosIdx = indexFeriadosObservados(feriadosOcorr);

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
        // Rev. 3352 — feriado força jornada=0 (HE 100%) SÓ se observado na cidade/UF
        // da obra desse registro. Facultativo não-observado = dia normal.
        const isFeriado = isFeriadoObservado(feriadosIdx, dateStr, r.obraCidade, r.obraEstado);
        const expectedMins = isFeriado ? 0 : getExpectedMins(emp.jornadaTrabalho, dateStr, criteria.cargaHorariaDiaria);
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

        // Rev. 2216 — feriado entra no bucket "fim de semana" (HE 100%).
        const isDomingoOuFeriado = dow === 0 || isFeriado;
        const percentual = isDomingoOuFeriado ? criteria.hePercentualDomingo : criteria.hePercentualDiurna;
        const fator = 1 + percentual / 100;
        const valorDia = parseFloat(((heMins / 60) * valorHora * fator).toFixed(2));

        if (isDomingoOuFeriado) totalHEFimGrossMins += heMins;
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
          feriado: isFeriado,
          obra: r.obraNome || null,
          cidade: r.obraCidade || null,
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
      const { heUtilMap, heFimMap, heMap, empMeta, heUtilByOrig, heFimByOrig } = await computeHEForPeriod(
        db, input.companyId, input.dataInicio, input.dataFim, criteria.cargaHorariaDiaria
      );

      // Get salary info for all employees with HE
      const empIds = Array.from(heMap.keys());
      if (empIds.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma hora extra encontrada no período informado." });
      }

      const empRows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", "valorHora", "salarioBase", "horasMensais", funcao, "banco_horas_excecao"
        FROM employees
        WHERE id IN (${sql.join(empIds.map(id => sql`${id}`), sql`,`)})
      `)) as any).rows || [];
      const empDataMap = new Map<number, any>();
      for (const e of empRows) empDataMap.set(Number(e.id), e);

      // Rev. 2179 — gera até 2 linhas por funcionário (uma por origem: aprovada / sem_solicitacao).
      // Cada bucket vira uma row independente em he_period_employees com sua própria
      // destinacao (Pagar/Banco) e seu próprio valor. Mantemos `funcionariosUnicos`
      // para `he_periods.totalFuncionarios` (count distinto de empregados).
      const empResults: any[] = [];
      const funcionariosUnicos = new Set<number>();
      let totalHEMins = 0;
      let totalValorHE = 0;
      const origens: Origem[] = ["aprovada", "sem_solicitacao"];

      for (const empId of empIds) {
        const emp = empDataMap.get(empId);
        if (!emp) continue;
        const valorHora = parseBRL(String(emp.valorHora || emp.salarioBase || "0")) || 0;
        const utilBucket = heUtilByOrig.get(empId) || { aprovada: 0, sem_solicitacao: 0 };
        const fimBucket  = heFimByOrig.get(empId)  || { aprovada: 0, sem_solicitacao: 0 };

        for (const origem of origens) {
          const heUtil = utilBucket[origem] || 0;
          const heFim  = fimBucket[origem]  || 0;
          const heTotal = heUtil + heFim;
          if (heTotal <= 0) continue;

          const valorHEUtil = (heUtil / 60) * valorHora * (1 + criteria.hePercentualDiurna / 100);
          const valorHEFim  = (heFim  / 60) * valorHora * (1 + criteria.hePercentualDomingo / 100);
          const valorHETotal = valorHEUtil + valorHEFim;
          if (valorHETotal <= 0) continue;

          funcionariosUnicos.add(empId);
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
            origem,
            bancoHorasExcecao: Number(emp.banco_horas_excecao || 0) === 1,
          });
        }
      }

      let hePeriodId: number;

      const totalFuncs = funcionariosUnicos.size;
      if (existingPeriodId) {
        await db.execute(sql`
          UPDATE he_periods SET
            "dataInicio" = ${input.dataInicio}::date,
            "dataFim" = ${input.dataFim}::date,
            "totalFuncionarios" = ${totalFuncs},
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
            'calculado', ${totalFuncs}, ${totalHEMins}, ${parseFloat(totalValorHE.toFixed(2))},
            ${ctx.user.name || "Sistema"})
          RETURNING id
        `)) as any).rows || [];
        hePeriodId = Number(periodResult[0]?.id);
        if (!hePeriodId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar registro de período HE." });
      }

      const destPadraoRows = ((await db.execute(sql`
        SELECT "heDestinoPadrao" FROM companies WHERE id = ${input.companyId}
      `)) as any).rows || [];
      const destinoPadraoEmpresa = (destPadraoRows[0]?.heDestinoPadrao as string) || "pagamento";

      if (empResults.length > 0) {
        // Rev. 3977 — resolução por funcionário: mestre=pagamento → sempre pagamento;
        // mestre=banco_horas → banco de horas, EXCETO funcionário com exceção bidirecional marcada.
        const empInsertRows = empResults.map(e => {
          const destinoResolvido = destinoPadraoEmpresa === "banco_horas" && e.bancoHorasExcecao
            ? "pagamento"
            : destinoPadraoEmpresa;
          return sql`(
          ${hePeriodId}, ${input.companyId}, ${e.empId}, ${e.nome},
          ${e.heUtil}, ${e.heFim}, ${e.heTotal},
          ${e.valorHEUtil}, ${e.valorHEFim}, ${e.valorHETotal},
          ${e.salarioBruto}, ${e.valorHora}, ${destinoResolvido}, ${e.origem}
        )`;
        });
        await db.execute(sql`
          INSERT INTO he_period_employees
            ("hePeriodId", "companyId", "employeeId", nome,
             "heUtilMins", "heFimMins", "heTotalMins",
             "valorHEUtil", "valorHEFim", "valorHETotal",
             "salarioBruto", "valorHora", destinacao, origem)
          VALUES ${sql.join(empInsertRows, sql`,`)}
        `);
      }

      return {
        hePeriodId,
        totalFuncionarios: totalFuncs,
        totalHEMins,
        totalValorHE: parseFloat(totalValorHE.toFixed(2)),
        periodo: { dataInicio: input.dataInicio, dataFim: input.dataFim },
        message: `HE calculada: ${totalFuncs} funcionários com hora extra, total R$ ${totalValorHE.toFixed(2)}`,
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
      // Rev. 1877 — projeta cargo_confianca + inciso/desde/observacao p/ o frontend exibir
      // banner "Isento Art. 62 CLT" e zerar faltas/HE/atrasos no Espelho de Ponto.
      // Rev. 1981 — BUGFIX: cargo_confianca/cargo_confianca_desde são snake_case no DB
      // (definidos na schema como `cargoConfianca: smallint("cargo_confianca")`). O SQL
      // referenciava "cargoConfianca"/"cargoConfiancaDesde" em aspas duplas, que em Postgres
      // são case-sensitive → "column does not exist" → query inteira falhava → tela em branco
      // (pré Rev. 1980) ou card vermelho "Erro ao carregar" (pós Rev. 1980 — como o user reportou).
      const empRows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "codigoInterno", cpf, "salarioBase", "valorHora", "horasMensais",
               "heNormal50", "he100", "heFeriado", "heNoturna", status, "dataDesligamentoEfetiva",
               "cargo_confianca" AS "cargoConfianca",
               "cargo_confianca_desde" AS "cargoConfiancaDesde",
               "cargo_confianca_inciso" AS "cargoConfiancaInciso",
               "cargo_confianca_observacao" AS "cargoConfiancaObservacao"
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

      // ── Atestados projetados no Espelho de Ponto ──────────────────────────
      // Rev. 3222 — O Espelho de Ponto lê `time_records`, mas atestados lançados
      // pela Central de Documentos gravam em `atestados` (+ abono em
      // `ponto_descontos`/`timecard_daily`), NUNCA em `time_records`. Resultado:
      // o dia do atestado aparecia como "Falta" (vermelho) no espelho. Aqui
      // projetamos os atestados do período direto da tabela `atestados`:
      //  - tipo "dia"   → cobre `diasAfastamento` dias a partir de `dataEmissao`
      //                   (dia inteiro abonado → marca "Atestado").
      //  - tipo "horas" → cobre só o dia de `dataEmissao` (ausência parcial →
      //                   o frontend só marca "Atestado" se NÃO houve batida no dia,
      //                   preservando o trabalho parcial quando existir).
      // Colunas snake_case no DB: `afastamento_tipo`. As demais são camelCase.
      const atestRows = ((await db.execute(sql`
        SELECT "dataEmissao", "diasAfastamento", "afastamento_tipo" AS "afastamentoTipo"
        FROM atestados
        WHERE "employeeId" = ${input.employeeId}
          AND "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND "deletedAt" IS NULL
          AND "dataEmissao" <= ${input.dataFim}::date
      `)) as any).rows || [];
      const atestadoDatesSet = new Set<string>();       // tipo "dia"   — dia inteiro
      const atestadoHorasDatesSet = new Set<string>();  // tipo "horas" — parcial
      for (const a of atestRows) {
        if (!a.dataEmissao) continue;
        const ini = String(a.dataEmissao).slice(0, 10);
        const tipo = String(a.afastamentoTipo || "dia");
        if (tipo === "horas") {
          if (ini >= input.dataInicio && ini <= input.dataFim) atestadoHorasDatesSet.add(ini);
        } else {
          const ndias = Math.max(1, Number(a.diasAfastamento) || 1);
          const start = new Date(ini + "T12:00:00Z");
          for (let i = 0; i < ndias; i++) {
            const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
            const ds = d.toISOString().slice(0, 10);
            if (ds >= input.dataInicio && ds <= input.dataFim) atestadoDatesSet.add(ds);
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
          tr."tipoDia",
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
        atestadoDates: Array.from(atestadoDatesSet),
        atestadoHorasDates: Array.from(atestadoHorasDatesSet),
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
          // Rev. 3977 — multiplicador de 1,5x no crédito do banco de horas (excedente pago como acréscimo).
          const minutosAcrescimo = Math.round(minutosBase * 0.5);
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

  // Rev. 2575 — Dar baixa em LOTE: zera o saldo total de cada funcionário
  // selecionado (ex.: HE já paga na folha). Só UPDATE/INSERT — R-001/R-007/R-010.
  debitarBancoLote: protectedProcedure
    .input(z.object({
      employeeIds: z.array(z.number()).min(1),
      companyId: z.number(),
      descricao: z.string().min(3),
      data: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      let processados = 0;
      let totalMinutos = 0;
      const ignorados: number[] = [];
      const falhas: { employeeId: number; motivo: string }[] = [];
      const criadoPor = ctx.user.name || "Sistema";

      for (const employeeId of input.employeeIds) {
        try {
          // Item atômico: zera o saldo (UPDATE ... = 0 com guard "saldoMinutos > 0",
          // captura o saldo anterior via CTE — sem race read-then-subtract) e grava
          // o lançamento no MESMO bloco transacional. Saldo ≤ 0 → 0 linhas → ignorado.
          const baixado = await db.transaction(async (tx: any) => {
            const upd = ((await tx.execute(sql`
              WITH prev AS (
                SELECT "saldoMinutos" AS anterior FROM banco_horas_saldo
                WHERE "employeeId" = ${employeeId} AND "companyId" = ${input.companyId}
              )
              UPDATE banco_horas_saldo
              SET "saldoMinutos" = 0, "atualizadoEm" = NOW()
              WHERE "employeeId" = ${employeeId} AND "companyId" = ${input.companyId}
                AND "saldoMinutos" > 0
              RETURNING (SELECT anterior FROM prev) AS "saldoAnterior"
            `)) as any).rows || [];
            if (upd.length === 0) return 0;
            const saldo = Number(upd[0]?.saldoAnterior || 0);
            await tx.execute(sql`
              INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", tipo, minutos, descricao, data, "criadoPor")
              VALUES (${employeeId}, ${input.companyId}, 'debito', ${saldo},
                ${input.descricao}, ${input.data}::date, ${criadoPor})
            `);
            return saldo;
          });

          if (baixado <= 0) { ignorados.push(employeeId); continue; }
          processados++;
          totalMinutos += baixado;
        } catch (e: any) {
          falhas.push({ employeeId, motivo: e?.message ? String(e.message).slice(0, 200) : "erro" });
        }
      }

      return { ok: true, processados, totalMinutos, ignorados, falhas };
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

  // Rev. 3977 — Alerta MENSAL: funcionários com saldo NEGATIVO no banco de horas (débito de
  // atraso/falta acumulado). Apenas alerta — NÃO gera pagamento/desconto automático.
  getAlertasSaldoNegativo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = ((await db.execute(sql`
        SELECT bhs."employeeId", e."nomeCompleto", bhs."saldoMinutos", bhs."atualizadoEm"
        FROM banco_horas_saldo bhs
        JOIN employees e ON e.id = bhs."employeeId"
        WHERE bhs."companyId" = ${input.companyId}
          AND bhs."saldoMinutos" < 0
        ORDER BY bhs."saldoMinutos" ASC
      `)) as any).rows || [];
      return rows;
    }),

  // Rev. 3977 — Alerta TRIMESTRAL: funcionários com saldo POSITIVO elevado (acumulado há pelo
  // menos 1 trimestre) — apenas alerta informativo p/ RH avaliar compensação, SEM auto-payout.
  getAlertasSaldoPositivoTrimestral: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
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
        ORDER BY bhs."saldoMinutos" DESC
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
      // Rev. 3977 — sincroniza com o parâmetro he_banco_horas (Configurações do Sistema),
      // fonte única percebida pelo usuário nos dois pontos de edição.
      const heBancoHorasValor = input.destino === "banco_horas" ? "1" : "0";
      const { systemCriteria } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const existing = await db.select().from(systemCriteria)
        .where(and(eq(systemCriteria.companyId, input.companyId), eq(systemCriteria.chave, "he_banco_horas")))
        .limit(1);
      if (existing.length > 0) {
        await db.update(systemCriteria)
          .set({ valor: heBancoHorasValor })
          .where(eq(systemCriteria.id, existing[0].id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          categoria: "horas_extras",
          chave: "he_banco_horas",
          valor: heBancoHorasValor,
          descricao: "Empresa utiliza banco de horas (0=Não, 1=Sim)",
          valorPadraoClt: "0",
          unidade: "bool",
        } as any);
      }
      return { ok: true, destino: input.destino };
    }),
});
