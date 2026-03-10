import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import {
  pontoDescontos, pontoDescontosResumo, employees, timeRecords,
  heSolicitacoes, heSolicitacaoFuncionarios, atestados, systemCriteria,
  warnings,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull, between } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ============================================================
// MOTOR DE CÁLCULO CLT — DESCONTOS AUTOMÁTICOS
// Fundamentação Legal:
// - Art. 58 §1º CLT: Tolerância de 10 min diários (5 entrada + 5 saída)
// - Art. 462 CLT: Descontos legais no salário
// - Lei 605/49 Art. 6º: Perda do DSR por falta/atraso injustificado
// - Art. 130 CLT: Reflexo de faltas nas férias
// - Art. 59 CLT: Horas extras com autorização prévia
// ============================================================

// Helpers
function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${mins < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

function parseMoney(val: string | null | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[^\d.,\-]/g, "").replace(",", ".")) || 0;
}

function formatMoney(val: number): string {
  return val.toFixed(2);
}

// Determinar se um dia é domingo (0) ou sábado (6)
function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay(); // 0=domingo, 6=sábado
}

// Obter todos os dias de uma semana (seg-dom) dado um dia
function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=dom, 1=seg...6=sab
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    days.push(day.toISOString().substring(0, 10));
  }
  return days;
}

// Obter o domingo da semana
function getSundayOfWeek(dateStr: string): string {
  const days = getWeekDays(dateStr);
  return days[6]; // domingo é o último dia da semana seg-dom
}

interface CriteriaMap {
  pontoToleranciaAtraso: number;
  pontoToleranciaSaida: number;
  pontoFaltaAposAtraso: number;
  jornadaHorasDiarias: number;
  jornadaHorasSemanais: number;
  jornadaIntervaloAlmoco: number;
  jornadaSabadoTipo: string;
}

const DEFAULT_CRITERIA: CriteriaMap = {
  pontoToleranciaAtraso: 10,
  pontoToleranciaSaida: 10,
  pontoFaltaAposAtraso: 120,
  jornadaHorasDiarias: 8,
  jornadaHorasSemanais: 44,
  jornadaIntervaloAlmoco: 60,
  jornadaSabadoTipo: "compensado",
};

async function getCriteriaMap(db: any, companyId: number): Promise<CriteriaMap> {
  try {
    const rows = await db.select().from(systemCriteria)
      .where(eq(systemCriteria.companyId, companyId));
    if (rows.length === 0) return { ...DEFAULT_CRITERIA };
    const map: Record<string, string> = {};
    for (const r of rows) map[r.chave] = r.valor;
    return {
      pontoToleranciaAtraso: parseFloat(map["ponto_tolerancia_atraso"] || "10"),
      pontoToleranciaSaida: parseFloat(map["ponto_tolerancia_saida"] || "10"),
      pontoFaltaAposAtraso: parseFloat(map["ponto_falta_apos_atraso"] || "120"),
      jornadaHorasDiarias: parseFloat(map["jornada_horas_diarias"] || "8"),
      jornadaHorasSemanais: parseFloat(map["jornada_horas_semanais"] || "44"),
      jornadaIntervaloAlmoco: parseFloat(map["jornada_intervalo_almoco"] || "60"),
      jornadaSabadoTipo: map["jornada_sabado_tipo"] || "compensado",
    };
  } catch {
    return { ...DEFAULT_CRITERIA };
  }
}

// ============================================================
// CÁLCULO CLT: Desconto proporcional por atraso
// Fórmula: (salário / horas_mes / 60) * minutos_atraso
// Art. 58 §1º CLT: Não serão descontadas variações até 10 min diários
// ============================================================
function calcDescontoAtraso(salarioBase: number, horasMes: number, minutosAtraso: number): number {
  if (minutosAtraso <= 0 || salarioBase <= 0 || horasMes <= 0) return 0;
  const valorMinuto = salarioBase / horasMes / 60;
  return valorMinuto * minutosAtraso;
}

// ============================================================
// CÁLCULO CLT: Desconto por falta injustificada
// Fórmula: salário / dias_uteis_mes (ou salário / 30 para mensalista)
// ============================================================
function calcDescontoFalta(salarioBase: number, diasMes: number = 30): number {
  if (salarioBase <= 0 || diasMes <= 0) return 0;
  return salarioBase / diasMes;
}

// ============================================================
// CÁLCULO CLT: Perda do DSR (Descanso Semanal Remunerado)
// Lei 605/49 Art. 6º: Perde DSR quem tiver falta injustificada
// ou atraso além da tolerância na semana
// Fórmula: salário / dias_uteis_mes (valor de 1 dia)
// ============================================================
function calcDsrPerdido(salarioBase: number, diasMes: number = 30): number {
  if (salarioBase <= 0 || diasMes <= 0) return 0;
  return salarioBase / diasMes;
}

// ============================================================
// Art. 130 CLT: Reflexo de faltas nas férias
// Até 5 faltas: 30 dias | 6-14 faltas: 24 dias | 15-23 faltas: 18 dias
// 24-32 faltas: 12 dias | Mais de 32: perde o direito
// ============================================================
function calcDiasFerias(faltasNoPeriodoAquisitivo: number): number {
  if (faltasNoPeriodoAquisitivo <= 5) return 30;
  if (faltasNoPeriodoAquisitivo <= 14) return 24;
  if (faltasNoPeriodoAquisitivo <= 23) return 18;
  if (faltasNoPeriodoAquisitivo <= 32) return 12;
  return 0;
}


export const pontoDescontosRouter = router({

  // ===================== CALCULAR DESCONTOS DO MÊS =====================
  // Analisa time_records + atestados + HE autorizadas e gera descontos
  calcularMes: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().regex(/^\d{4}-\d{2}$/, "Formato: YYYY-MM"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const criteria = await getCriteriaMap(db, input.companyId);
    const toleranciaTotal = criteria.pontoToleranciaAtraso; // 10 min diários (Art. 58 §1º)

    // 1. Buscar todos os funcionários ativos da empresa
    const emps = await db.select().from(employees)
      .where(and(
        companyFilter(employees.companyId, input),
        eq(employees.status, "Ativo"),
        isNull(employees.deletedAt),
      ));

    if (emps.length === 0) {
      return { message: "Nenhum funcionário ativo encontrado", totalDescontos: 0, totalFuncionarios: 0 };
    }

    const empIds = emps.map(e => e.id);
    const mesStart = `${input.mesReferencia}-01`;
    const mesEnd = `${input.mesReferencia}-31`;

    // 2. Buscar registros de ponto do mês
    const records = await db.select().from(timeRecords)
      .where(and(
        companyFilter(timeRecords.companyId, input),
        sql`${timeRecords.data} >= ${mesStart}`,
        sql`${timeRecords.data} <= ${mesEnd}`,
        inArray(timeRecords.employeeId, empIds),
      ));

    // 3. Buscar atestados do mês (para justificar faltas)
    const atests = await db.select().from(atestados)
      .where(and(
        companyFilter(atestados.companyId, input),
        isNull(atestados.deletedAt),
        sql`${atestados.dataEmissao} >= ${mesStart}`,
        sql`${atestados.dataEmissao} <= ${mesEnd}`,
      ));

    // 4. Buscar HE autorizadas do mês
    const heAutorizadas = await db.select({
      dataSolicitacao: heSolicitacoes.dataSolicitacao,
      employeeId: heSolicitacaoFuncionarios.employeeId,
      horaInicio: heSolicitacoes.horaInicio,
      horaFim: heSolicitacoes.horaFim,
    }).from(heSolicitacoes)
      .innerJoin(heSolicitacaoFuncionarios, eq(heSolicitacaoFuncionarios.solicitacaoId, heSolicitacoes.id))
      .where(and(
        companyFilter(heSolicitacoes.companyId, input),
        eq(heSolicitacoes.status, "aprovada"),
        sql`${heSolicitacoes.dataSolicitacao} >= ${mesStart}`,
        sql`${heSolicitacoes.dataSolicitacao} <= ${mesEnd}`,
      ));

    // Indexar HE autorizadas: key = "employeeId-data"
    const heMap = new Map<string, boolean>();
    for (const he of heAutorizadas) {
      heMap.set(`${he.employeeId}-${he.dataSolicitacao}`, true);
    }

    // Indexar atestados por employeeId-data
    const atestadoMap = new Map<string, boolean>();
    for (const at of atests) {
      if (at.employeeId && at.dataEmissao) {
        // Cobrir dias de afastamento
        const dias = at.diasAfastamento || 1;
        const startDate = new Date(at.dataEmissao + "T12:00:00Z");
        for (let d = 0; d < dias; d++) {
          const dt = new Date(startDate);
          dt.setUTCDate(startDate.getUTCDate() + d);
          const key = `${at.employeeId}-${dt.toISOString().substring(0, 10)}`;
          atestadoMap.set(key, true);
        }
      }
    }

    // 5. Limpar descontos anteriores do mês (recalcular)
    await db.delete(pontoDescontos).where(and(
      companyFilter(pontoDescontos.companyId, input),
      eq(pontoDescontos.mesReferencia, input.mesReferencia),
    ));
    await db.delete(pontoDescontosResumo).where(and(
      companyFilter(pontoDescontosResumo.companyId, input),
      eq(pontoDescontosResumo.mesReferencia, input.mesReferencia),
    ));

    // 6. Processar cada funcionário
    const descontosToInsert: any[] = [];
    const resumos: any[] = [];
    let totalDescontosGeral = 0;

    for (const emp of emps) {
      const empRecords = records.filter(r => r.employeeId === emp.id);
      const salarioBase = parseMoney(emp.salarioBase as any);
      const horasMes = parseFloat((emp as any).horasMensais || "220") || 220;
      const valorHora = salarioBase > 0 && horasMes > 0 ? salarioBase / horasMes : 0;

      // Jornada do funcionário (padrão ou individual)
      const jornadaEntrada = parseTime((emp as any).horarioEntrada || "07:00") || 420;
      const jornadaSaida = parseTime((emp as any).horarioSaida || "17:00") || 1020;

      let totalAtrasos = 0, totalMinutosAtraso = 0;
      let totalFaltasInjust = 0;
      let totalSaidasAntecipadas = 0, totalMinutosSaidaAnt = 0;
      let totalHeNaoAutorizadas = 0, totalMinutosHeNaoAut = 0;
      let totalDescontosEmp = 0;
      let totalDescontoDsr = 0;
      const semanasComAtrasoOuFalta = new Set<string>();

      for (const rec of empRecords) {
        const data = rec.data as string;
        if (!data) continue;
        const dow = getDayOfWeek(data);
        const isWeekend = dow === 0 || dow === 6;
        const hasAtestado = atestadoMap.has(`${emp.id}-${data}`);

        // Pular fins de semana e dias com atestado
        if (isWeekend) continue;
        if (hasAtestado) continue;

        const entrada1 = parseTime(rec.entrada1 as string);
        const saida1 = parseTime(rec.saida1 as string);
        const entrada2 = parseTime(rec.entrada2 as string);
        const saida2 = parseTime(rec.saida2 as string);

        // --- FALTA INJUSTIFICADA ---
        // Se não tem nenhuma batida no dia
        if (entrada1 === null && saida1 === null && entrada2 === null && saida2 === null) {
          const valorFalta = calcDescontoFalta(salarioBase);
          totalFaltasInjust++;
          totalDescontosEmp += valorFalta;
          semanasComAtrasoOuFalta.add(getSundayOfWeek(data));

          descontosToInsert.push({
            companyId: input.companyId,
            employeeId: emp.id,
            mesReferencia: input.mesReferencia,
            data,
            tipo: "falta_injustificada",
            minutosAtraso: 0,
            minutosHe: 0,
            valorDesconto: formatMoney(valorFalta),
            valorDsr: "0",
            valorTotal: formatMoney(valorFalta),
            baseCalculo: JSON.stringify({
              salarioBase, horasMes, valorHora,
              formula: "salário / 30",
              artigo: "Art. 462 CLT",
            }),
            status: "calculado",
            fundamentacaoLegal: "Art. 462 CLT - Desconto por falta injustificada",
          });
          continue;
        }

        // --- ATRASO NA ENTRADA ---
        if (entrada1 !== null) {
          const atrasoMinutos = entrada1 - jornadaEntrada;
          if (atrasoMinutos > toleranciaTotal) {
            // Desconto proporcional (Art. 58 §1º: tolerância de 10 min)
            const minutosDesconto = atrasoMinutos; // desconta tudo, pois ultrapassou tolerância
            const valorAtraso = calcDescontoAtraso(salarioBase, horasMes, minutosDesconto);
            totalAtrasos++;
            totalMinutosAtraso += minutosDesconto;
            totalDescontosEmp += valorAtraso;
            semanasComAtrasoOuFalta.add(getSundayOfWeek(data));

            // Se atraso > limite, considerar como falta
            if (atrasoMinutos >= criteria.pontoFaltaAposAtraso) {
              const valorFalta = calcDescontoFalta(salarioBase);
              descontosToInsert.push({
                companyId: input.companyId,
                employeeId: emp.id,
                mesReferencia: input.mesReferencia,
                data,
                tipo: "falta_injustificada",
                minutosAtraso: atrasoMinutos,
                minutosHe: 0,
                valorDesconto: formatMoney(valorFalta),
                valorDsr: "0",
                valorTotal: formatMoney(valorFalta),
                baseCalculo: JSON.stringify({
                  salarioBase, horasMes, valorHora, minutosAtraso: atrasoMinutos,
                  formula: `Atraso de ${atrasoMinutos}min > ${criteria.pontoFaltaAposAtraso}min = falta`,
                  artigo: "Art. 58 §1º + Art. 462 CLT",
                }),
                status: "calculado",
                fundamentacaoLegal: `Art. 58 §1º CLT - Atraso de ${atrasoMinutos}min convertido em falta (>${criteria.pontoFaltaAposAtraso}min)`,
              });
              totalFaltasInjust++;
            } else {
              descontosToInsert.push({
                companyId: input.companyId,
                employeeId: emp.id,
                mesReferencia: input.mesReferencia,
                data,
                tipo: "atraso",
                minutosAtraso: minutosDesconto,
                minutosHe: 0,
                valorDesconto: formatMoney(valorAtraso),
                valorDsr: "0",
                valorTotal: formatMoney(valorAtraso),
                baseCalculo: JSON.stringify({
                  salarioBase, horasMes, valorHora, minutosAtraso: minutosDesconto,
                  formula: `(${salarioBase} / ${horasMes} / 60) × ${minutosDesconto} = ${valorAtraso.toFixed(2)}`,
                  artigo: "Art. 58 §1º CLT",
                  tolerancia: `${toleranciaTotal}min (ultrapassou)`,
                }),
                status: "calculado",
                fundamentacaoLegal: `Art. 58 §1º CLT - Atraso de ${minutosDesconto}min (tolerância: ${toleranciaTotal}min)`,
              });
            }
          }
        }

        // --- SAÍDA ANTECIPADA ---
        const ultimaSaida = saida2 !== null ? saida2 : saida1;
        if (ultimaSaida !== null) {
          const saidaAntecipada = jornadaSaida - ultimaSaida;
          if (saidaAntecipada > toleranciaTotal) {
            const valorSaida = calcDescontoAtraso(salarioBase, horasMes, saidaAntecipada);
            totalSaidasAntecipadas++;
            totalMinutosSaidaAnt += saidaAntecipada;
            totalDescontosEmp += valorSaida;
            semanasComAtrasoOuFalta.add(getSundayOfWeek(data));

            descontosToInsert.push({
              companyId: input.companyId,
              employeeId: emp.id,
              mesReferencia: input.mesReferencia,
              data,
              tipo: "saida_antecipada",
              minutosAtraso: saidaAntecipada,
              minutosHe: 0,
              valorDesconto: formatMoney(valorSaida),
              valorDsr: "0",
              valorTotal: formatMoney(valorSaida),
              baseCalculo: JSON.stringify({
                salarioBase, horasMes, valorHora, minutosSaida: saidaAntecipada,
                formula: `(${salarioBase} / ${horasMes} / 60) × ${saidaAntecipada}`,
                artigo: "Art. 58 §1º CLT",
              }),
              status: "calculado",
              fundamentacaoLegal: `Art. 58 §1º CLT - Saída antecipada de ${saidaAntecipada}min`,
            });
          }

          // --- HE NÃO AUTORIZADA ---
          // Se saiu depois do horário e não tem HE autorizada
          if (ultimaSaida > jornadaSaida + 10) { // 10 min de tolerância para HE
            const minutosHe = ultimaSaida - jornadaSaida;
            const heAutorizada = heMap.has(`${emp.id}-${data}`);
            if (!heAutorizada && minutosHe > 10) {
              totalHeNaoAutorizadas++;
              totalMinutosHeNaoAut += minutosHe;

              descontosToInsert.push({
                companyId: input.companyId,
                employeeId: emp.id,
                mesReferencia: input.mesReferencia,
                data,
                tipo: "he_nao_autorizada",
                minutosAtraso: 0,
                minutosHe: minutosHe,
                valorDesconto: "0",
                valorDsr: "0",
                valorTotal: "0",
                baseCalculo: JSON.stringify({
                  minutosHe,
                  horarioSaida: minutesToHHMM(ultimaSaida),
                  horarioPrevisto: minutesToHHMM(jornadaSaida),
                  formula: "HE sem solicitação aprovada - pendente de decisão RH",
                  artigo: "Art. 59 CLT",
                }),
                status: "calculado",
                fundamentacaoLegal: `Art. 59 CLT - ${minutosHe}min de HE sem autorização prévia`,
              });
            }
          }
        }
      }

      // --- DSR PERDIDO ---
      // Para cada semana com atraso ou falta, o funcionário perde o DSR
    const valorDsrDia = calcDsrPerdido(salarioBase);
    const dsrPerdidos = semanasComAtrasoOuFalta.size;
    const semanasArray = Array.from(semanasComAtrasoOuFalta);
    for (const domingo of semanasArray) {
        totalDescontoDsr += valorDsrDia;
        totalDescontosEmp += valorDsrDia;

        descontosToInsert.push({
          companyId: input.companyId,
          employeeId: emp.id,
          mesReferencia: input.mesReferencia,
          data: domingo,
          tipo: "falta_dsr",
          minutosAtraso: 0,
          minutosHe: 0,
          valorDesconto: "0",
          valorDsr: formatMoney(valorDsrDia),
          valorTotal: formatMoney(valorDsrDia),
          baseCalculo: JSON.stringify({
            salarioBase, valorDsrDia,
            formula: `salário / 30 = ${valorDsrDia.toFixed(2)}`,
            artigo: "Lei 605/49 Art. 6º",
            motivo: "Atraso/falta injustificada na semana",
          }),
          status: "calculado",
          fundamentacaoLegal: "Lei 605/49 Art. 6º - Perda do DSR por falta/atraso na semana",
        });
      }

      totalDescontosGeral += totalDescontosEmp;

      // Criar resumo mensal
      resumos.push({
        companyId: input.companyId,
        employeeId: emp.id,
        mesReferencia: input.mesReferencia,
        totalAtrasos,
        totalMinutosAtraso,
        totalFaltasInjustificadas: totalFaltasInjust,
        totalSaidasAntecipadas,
        totalMinutosSaidaAntecipada: totalMinutosSaidaAnt,
        totalDsrPerdidos: dsrPerdidos,
        totalFeriadosPerdidos: 0,
        totalHeNaoAutorizadas,
        totalMinutosHeNaoAutorizada: totalMinutosHeNaoAut,
        valorTotalAtrasos: formatMoney(totalMinutosAtraso > 0 ? calcDescontoAtraso(salarioBase, horasMes, totalMinutosAtraso) : 0),
        valorTotalFaltas: formatMoney(totalFaltasInjust * calcDescontoFalta(salarioBase)),
        valorTotalDsr: formatMoney(totalDescontoDsr),
        valorTotalFeriados: "0",
        valorTotalSaidasAntecipadas: formatMoney(totalMinutosSaidaAnt > 0 ? calcDescontoAtraso(salarioBase, horasMes, totalMinutosSaidaAnt) : 0),
        valorTotalHeNaoAutorizada: "0",
        valorTotalDescontos: formatMoney(totalDescontosEmp),
        faltasAcumuladasPeriodoAquisitivo: totalFaltasInjust,
        diasFeriasResultante: calcDiasFerias(totalFaltasInjust),
        status: "calculado",
      });
    }

    // 7. Inserir descontos em lote
    if (descontosToInsert.length > 0) {
      // Inserir em batches de 100
      for (let i = 0; i < descontosToInsert.length; i += 100) {
        const batch = descontosToInsert.slice(i, i + 100);
        await db.insert(pontoDescontos).values(batch);
      }
    }

    // 8. Inserir resumos
    if (resumos.length > 0) {
      for (let i = 0; i < resumos.length; i += 100) {
        const batch = resumos.slice(i, i + 100);
        await db.insert(pontoDescontosResumo).values(batch);
      }
    }

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "CALCULATE",
      module: "ponto_descontos",
      entityType: "ponto_desconto",
      details: `Descontos CLT calculados para ${input.mesReferencia}: ${descontosToInsert.length} eventos, ${resumos.length} funcionários, total R$ ${totalDescontosGeral.toFixed(2)}`,
    });

    return {
      success: true,
      totalDescontos: descontosToInsert.length,
      totalFuncionarios: resumos.length,
      valorTotal: formatMoney(totalDescontosGeral),
      message: `Cálculo concluído: ${descontosToInsert.length} descontos gerados para ${resumos.length} funcionários`,
    };
  }),

  // ===================== LISTAR DESCONTOS DO MÊS =====================
  listByMonth: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    tipo: z.string().optional(),
    status: z.string().optional(),
    employeeId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const conditions = [
      companyFilter(pontoDescontos.companyId, input),
      eq(pontoDescontos.mesReferencia, input.mesReferencia),
    ];
    if (input.tipo) conditions.push(eq(pontoDescontos.tipo, input.tipo as any));
    if (input.status) conditions.push(eq(pontoDescontos.status, input.status as any));
    if (input.employeeId) conditions.push(eq(pontoDescontos.employeeId, input.employeeId));

    const rows = await db.select({
      id: pontoDescontos.id,
      employeeId: pontoDescontos.employeeId,
      data: pontoDescontos.data,
      tipo: pontoDescontos.tipo,
      minutosAtraso: pontoDescontos.minutosAtraso,
      minutosHe: pontoDescontos.minutosHe,
      valorDesconto: pontoDescontos.valorDesconto,
      valorDsr: pontoDescontos.valorDsr,
      valorTotal: pontoDescontos.valorTotal,
      baseCalculo: pontoDescontos.baseCalculo,
      status: pontoDescontos.status,
      abonadoPor: pontoDescontos.abonadoPor,
      motivoAbono: pontoDescontos.motivoAbono,
      fundamentacaoLegal: pontoDescontos.fundamentacaoLegal,
      employeeName: employees.nomeCompleto,
      employeeCpf: employees.cpf,
      employeeFuncao: employees.funcao,
    }).from(pontoDescontos)
      .leftJoin(employees, eq(pontoDescontos.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(pontoDescontos.data));

    return rows;
  }),

  // ===================== RESUMO MENSAL POR FUNCIONÁRIO =====================
  listResumo: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select({
      id: pontoDescontosResumo.id,
      employeeId: pontoDescontosResumo.employeeId,
      mesReferencia: pontoDescontosResumo.mesReferencia,
      totalAtrasos: pontoDescontosResumo.totalAtrasos,
      totalMinutosAtraso: pontoDescontosResumo.totalMinutosAtraso,
      totalFaltasInjustificadas: pontoDescontosResumo.totalFaltasInjustificadas,
      totalSaidasAntecipadas: pontoDescontosResumo.totalSaidasAntecipadas,
      totalMinutosSaidaAntecipada: pontoDescontosResumo.totalMinutosSaidaAntecipada,
      totalDsrPerdidos: pontoDescontosResumo.totalDsrPerdidos,
      totalHeNaoAutorizadas: pontoDescontosResumo.totalHeNaoAutorizadas,
      valorTotalAtrasos: pontoDescontosResumo.valorTotalAtrasos,
      valorTotalFaltas: pontoDescontosResumo.valorTotalFaltas,
      valorTotalDsr: pontoDescontosResumo.valorTotalDsr,
      valorTotalSaidasAntecipadas: pontoDescontosResumo.valorTotalSaidasAntecipadas,
      valorTotalDescontos: pontoDescontosResumo.valorTotalDescontos,
      diasFeriasResultante: pontoDescontosResumo.diasFeriasResultante,
      status: pontoDescontosResumo.status,
      employeeName: employees.nomeCompleto,
      employeeCpf: employees.cpf,
      employeeFuncao: employees.funcao,
      salarioBase: employees.salarioBase,
    }).from(pontoDescontosResumo)
      .leftJoin(employees, eq(pontoDescontosResumo.employeeId, employees.id))
      .where(and(
        companyFilter(pontoDescontosResumo.companyId, input),
        eq(pontoDescontosResumo.mesReferencia, input.mesReferencia),
      ))
      .orderBy(employees.nomeCompleto);

    return rows;
  }),

  // ===================== TOTAIS GERAIS DO MÊS =====================
  totaisMes: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;

    const [result] = await db.select({
      totalEventos: sql<number>`COUNT(*)`,
      totalAtrasos: sql<number>`SUM(CASE WHEN ${pontoDescontos.tipo} = 'atraso' THEN 1 ELSE 0 END)`,
      totalFaltas: sql<number>`SUM(CASE WHEN ${pontoDescontos.tipo} = 'falta_injustificada' THEN 1 ELSE 0 END)`,
      totalSaidas: sql<number>`SUM(CASE WHEN ${pontoDescontos.tipo} = 'saida_antecipada' THEN 1 ELSE 0 END)`,
      totalDsr: sql<number>`SUM(CASE WHEN ${pontoDescontos.tipo} = 'falta_dsr' THEN 1 ELSE 0 END)`,
      totalHeNaoAut: sql<number>`SUM(CASE WHEN ${pontoDescontos.tipo} = 'he_nao_autorizada' THEN 1 ELSE 0 END)`,
      valorTotal: sql<string>`COALESCE(SUM(CAST(${pontoDescontos.valorTotal} AS DECIMAL(10,2))), 0)`,
      funcionariosAfetados: sql<number>`COUNT(DISTINCT ${pontoDescontos.employeeId})`,
    }).from(pontoDescontos)
      .where(and(
        companyFilter(pontoDescontos.companyId, input),
        eq(pontoDescontos.mesReferencia, input.mesReferencia),
      ));

    return {
      totalEventos: Number(result?.totalEventos || 0),
      totalAtrasos: Number(result?.totalAtrasos || 0),
      totalFaltas: Number(result?.totalFaltas || 0),
      totalSaidas: Number(result?.totalSaidas || 0),
      totalDsr: Number(result?.totalDsr || 0),
      totalHeNaoAut: Number(result?.totalHeNaoAut || 0),
      valorTotal: result?.valorTotal || "0.00",
      funcionariosAfetados: Number(result?.funcionariosAfetados || 0),
    };
  }),

  // ===================== ABONAR DESCONTO =====================
  abonar: protectedProcedure.input(z.object({
    id: z.number(),
    motivoAbono: z.string().min(5, "Informe o motivo do abono"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [desc] = await db.select().from(pontoDescontos).where(eq(pontoDescontos.id, input.id));
    if (!desc) throw new TRPCError({ code: "NOT_FOUND", message: "Desconto não encontrado" });
    if (desc.status === "fechado") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Desconto já fechado, não pode ser abonado" });
    }

    await db.update(pontoDescontos).set({
      status: "abonado",
      abonadoPor: ctx.user.name || "Sistema",
      abonadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
      motivoAbono: input.motivoAbono,
      valorTotal: "0", // Zerar valor ao abonar
    }).where(eq(pontoDescontos.id, input.id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: desc.companyId,
      action: "ABONO",
      module: "ponto_descontos",
      entityType: "ponto_desconto",
      entityId: input.id,
      details: `Desconto #${input.id} abonado: ${input.motivoAbono}`,
    });

    return { success: true };
  }),

  // ===================== REVISAR DESCONTO =====================
  revisar: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    await db.update(pontoDescontos).set({
      status: "revisado",
    }).where(eq(pontoDescontos.id, input.id));

    return { success: true };
  }),

  // ===================== FECHAR MÊS (bloquear alterações) =====================
  fecharMes: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode fechar o mês de descontos" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    // Fechar todos os descontos do mês
    await db.update(pontoDescontos).set({
      status: "fechado",
    }).where(and(
      companyFilter(pontoDescontos.companyId, input),
      eq(pontoDescontos.mesReferencia, input.mesReferencia),
      sql`status != 'abonado'`, // Manter abonados como estão
    ));

    // Fechar resumos
    await db.update(pontoDescontosResumo).set({
      status: "fechado",
      revisadoPor: ctx.user.name || "Sistema",
      revisadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
    }).where(and(
      companyFilter(pontoDescontosResumo.companyId, input),
      eq(pontoDescontosResumo.mesReferencia, input.mesReferencia),
    ));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "CLOSE",
      module: "ponto_descontos",
      details: `Descontos do mês ${input.mesReferencia} fechados`,
    });

    return { success: true };
  }),

  // ============================================================
  // SUGESTÃO DE ADVERTÊNCIAS BASEADA NO PONTO
  // Verifica critérios e sugere advertências automáticas
  // ============================================================
  sugestaoAdvertencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), // YYYY-MM
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // Buscar critérios
      const criterios = await db.select().from(systemCriteria)
        .where(companyFilter(systemCriteria.companyId, input));
      const criterioMap = Object.fromEntries(criterios.map(c => [c.chave, c.valor]));

      const limiteAtrasos = parseInt(criterioMap['ponto_adv_atrasos_mes'] || '3');
      const limiteFaltas = parseInt(criterioMap['ponto_adv_faltas_mes'] || '2');
      const alertaHE = criterioMap['ponto_adv_he_nao_autorizada'] === '1';

      // Buscar descontos do mês
      const descontos = await db.select().from(pontoDescontos)
        .where(and(
          companyFilter(pontoDescontos.companyId, input),
          eq(pontoDescontos.mesReferencia, input.mesReferencia),
        ));

      // Agrupar por funcionário
      const empStats = new Map<number, { atrasos: number; faltas: number; heNaoAutorizada: number; nomeCompleto: string }>(); 
      for (const d of descontos) {
        const existing = empStats.get(d.employeeId) || { atrasos: 0, faltas: 0, heNaoAutorizada: 0, nomeCompleto: '' };
        if (d.tipo === 'atraso') existing.atrasos++;
        if (d.tipo === 'falta_injustificada') existing.faltas++;
        if (d.tipo === 'he_nao_autorizada') existing.heNaoAutorizada++;
        empStats.set(d.employeeId, existing);
      }

      // Buscar nomes
      const empIds = Array.from(empStats.keys());
      if (empIds.length > 0) {
        const emps = await db.select().from(employees).where(inArray(employees.id, empIds));
        for (const e of emps) {
          const stats = empStats.get(e.id);
          if (stats) stats.nomeCompleto = e.nomeCompleto;
        }
      }

      // Buscar advertências já existentes no mês
      const advExistentes = await db.select().from(warnings)
        .where(and(
          companyFilter(warnings.companyId, input),
          sql`${warnings.dataOcorrencia} LIKE ${input.mesReferencia + '%'}`,
        ));
      const advSet = new Set(advExistentes.map(a => `${a.employeeId}-${a.motivo}`));

      const sugestoes: Array<{
        employeeId: number;
        nomeCompleto: string;
        motivo: string;
        descricao: string;
        quantidade: number;
        limite: number;
        jaAdvertido: boolean;
      }> = [];

      for (const [empId, stats] of Array.from(empStats.entries())) {
        if (stats.atrasos >= limiteAtrasos) {
          sugestoes.push({
            employeeId: empId,
            nomeCompleto: stats.nomeCompleto,
            motivo: 'atraso_reiterado',
            descricao: `${stats.atrasos} atrasos no mês (limite: ${limiteAtrasos})`,
            quantidade: stats.atrasos,
            limite: limiteAtrasos,
            jaAdvertido: advSet.has(`${empId}-atraso`) || advSet.has(`${empId}-atraso_reiterado`),
          });
        }
        if (stats.faltas >= limiteFaltas) {
          sugestoes.push({
            employeeId: empId,
            nomeCompleto: stats.nomeCompleto,
            motivo: 'falta_injustificada',
            descricao: `${stats.faltas} faltas injustificadas no mês (limite: ${limiteFaltas})`,
            quantidade: stats.faltas,
            limite: limiteFaltas,
            jaAdvertido: advSet.has(`${empId}-falta`) || advSet.has(`${empId}-falta_injustificada`),
          });
        }
        if (alertaHE && stats.heNaoAutorizada > 0) {
          sugestoes.push({
            employeeId: empId,
            nomeCompleto: stats.nomeCompleto,
            motivo: 'he_nao_autorizada',
            descricao: `${stats.heNaoAutorizada} ocorrências de HE não autorizada`,
            quantidade: stats.heNaoAutorizada,
            limite: 1,
            jaAdvertido: advSet.has(`${empId}-he_nao_autorizada`),
          });
        }
      }

      return {
        sugestoes: sugestoes.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto)),
        criterios: { limiteAtrasos, limiteFaltas, alertaHE },
      };
    }),
});
