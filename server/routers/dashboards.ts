import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getConstrutorasIds } from "../db";
import {
  employees, extraPayments, payroll, timeRecords, warnings, atestados,
  epis, epiDeliveries, processosTrabalhistas, processosAndamentos,
  monthlyPayrollSummary, obraHorasRateio, obras, folhaLancamentos, folhaItens,
  epiDiscountAlerts, terminationNotices, vacationPeriods, goldenRules,
  asos, trainings, employeeDocuments, obraFuncionarios,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count, asc, isNull, inArray } from "drizzle-orm";
import { parseBRL } from "../utils/parseBRL";
import { invokeLLM } from "../_core/llm";

// Helper: resolve company filter for single or multi-company (CONSTRUTORAS) queries
function resolveIds(companyId: number, companyIds?: number[]): number[] {
  return companyIds && companyIds.length > 0 ? companyIds : [companyId];
}
function companyWhere(table: any, companyId: number, companyIds?: number[]) {
  const ids = resolveIds(companyId, companyIds);
  return ids.length === 1 ? eq(table.companyId, ids[0]) : inArray(table.companyId, ids);
}


// ============================================================
// 1. DASHBOARD FUNCIONÁRIOS (análise completa)
// ============================================================
async function getDashFuncionarios(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;

  // Filtro base: excluir soft-deleted
  const baseWhere = and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`);
  // Filtro ativo: excluir Desligado e Lista_Negra de TODAS as análises (só contam no card de contagem)
  const activeWhere = and(baseWhere, sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`);

  // Total por status (inclui Desligado/Lista_Negra para os cards de contagem)
  const statusDist = await db.select({
    status: employees.status,
    count: sql<number>`count(*)`,
  }).from(employees).where(baseWhere).groupBy(employees.status);

  // Cross-reference: buscar funcionários com férias em gozo na vacation_periods
  // (para corrigir casos onde employees.status = 'Ativo' mas vacation_periods.status = 'em_gozo')
  const today = new Date().toISOString().split('T')[0];
  const ids = resolveIds(companyId, companyIds);
  const feriasEmGozo = await db.select({
    employeeId: vacationPeriods.employeeId,
  }).from(vacationPeriods)
    .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
    .where(and(
      companyWhere(vacationPeriods, companyId, companyIds),
      isNull(vacationPeriods.deletedAt),
      isNull(employees.deletedAt),
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
      sql`${employees.status} != 'Ferias'`,
      sql`(
        ${vacationPeriods.status} = 'em_gozo'
        OR (
          ${vacationPeriods.status} = 'agendada'
          AND ${vacationPeriods.dataInicio} IS NOT NULL
          AND ${vacationPeriods.dataFim} IS NOT NULL
          AND ${vacationPeriods.dataInicio} <= ${today}
          AND ${vacationPeriods.dataFim} >= ${today}
        )
      )`,
    ));
  // Unique employee IDs that are on vacation but status != 'Ferias'
  const feriasExtraIds = new Set(feriasEmGozo.map(f => f.employeeId));
  const feriasExtraCount = feriasExtraIds.size;

  // Gênero (apenas ativos)
  const sexDist = await db.select({
    sexo: employees.sexo,
    count: sql<number>`count(*)`,
  }).from(employees).where(activeWhere).groupBy(employees.sexo);

  // Por setor (top 10, apenas ativos)
  const setorDist = await db.select({
    setor: employees.setor,
    count: sql<number>`count(*)`,
  }).from(employees).where(activeWhere).groupBy(employees.setor)
    .orderBy(sql`count(*) desc`).limit(10);

  // Por função (top 10, apenas ativos)
  const funcaoDist = await db.select({
    funcao: employees.funcao,
    count: sql<number>`count(*)`,
  }).from(employees).where(activeWhere).groupBy(employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // Por tipo de contrato (apenas ativos)
  const contratoDist = await db.select({
    tipo: employees.tipoContrato,
    count: sql<number>`count(*)`,
  }).from(employees).where(activeWhere).groupBy(employees.tipoContrato);

  // Por estado civil (apenas ativos)
  const estadoCivilDist = await db.select({
    estadoCivil: employees.estadoCivil,
    count: sql<number>`count(*)`,
  }).from(employees).where(activeWhere).groupBy(employees.estadoCivil);

  // Por cidade (top 10, apenas ativos)
  const cidadeDist = await db.select({
    cidade: employees.cidade,
    count: sql<number>`count(*)`,
  }).from(employees).where(activeWhere).groupBy(employees.cidade)
    .orderBy(sql`count(*) desc`).limit(10);

  // Pirâmide etária por gênero
  const ageDist = await db.select({
    faixa: sql<string>`CASE 
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 21 THEN '14-20'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 26 THEN '21-25'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 31 THEN '26-30'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 41 THEN '31-40'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 51 THEN '41-50'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 61 THEN '51-60'
      ELSE '61+'
    END`,
    sexo: employees.sexo,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(activeWhere, sql`dataNascimento IS NOT NULL`))
    .groupBy(sql`CASE 
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 21 THEN '14-20'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 26 THEN '21-25'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 31 THEN '26-30'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 41 THEN '31-40'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 51 THEN '41-50'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) < 61 THEN '51-60'
      ELSE '61+'
    END`, employees.sexo);

  // Tempo de empresa (distribuição)
  const tenureDist = await db.select({
    faixa: sql<string>`CASE 
      WHEN (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 3 THEN '< 3 meses'
      WHEN (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 6 THEN '3-6 meses'
      WHEN (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 12 THEN '6-12 meses'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 2 THEN '1-2 anos'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 5 THEN '2-5 anos'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 10 THEN '5-10 anos'
      ELSE '10+ anos'
    END`,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(activeWhere, sql`dataAdmissao IS NOT NULL`))
    .groupBy(sql`CASE 
      WHEN (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 3 THEN '< 3 meses'
      WHEN (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 6 THEN '3-6 meses'
      WHEN (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 12 THEN '6-12 meses'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 2 THEN '1-2 anos'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 5 THEN '2-5 anos'
      WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 10 THEN '5-10 anos'
      ELSE '10+ anos'
    END`);

  // Admissões e demissões por mês (últimos 12 meses)
  const admissoesMensal = await db.select({
    mes: sql<string>`TO_CHAR(dataAdmissao, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(companyWhere(employees, companyId, companyIds), sql`dataAdmissao >= CURRENT_DATE - INTERVAL '12 months'`, sql`${employees.deletedAt} IS NULL`))
    .groupBy(sql`TO_CHAR(dataAdmissao, 'YYYY-MM')`).orderBy(sql`TO_CHAR(dataAdmissao, 'YYYY-MM')`);

  const demissoesMensal = await db.select({
    mes: sql<string>`TO_CHAR(dataDemissao, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(companyWhere(employees, companyId, companyIds), sql`dataDemissao >= CURRENT_DATE - INTERVAL '12 months'`, sql`${employees.deletedAt} IS NULL`))
    .groupBy(sql`TO_CHAR(dataDemissao, 'YYYY-MM')`).orderBy(sql`TO_CHAR(dataDemissao, 'YYYY-MM')`);

  // Destaques (apenas ativos)
  const [oldest] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataNascimento, funcao: employees.funcao,
  }).from(employees)
    .where(and(activeWhere, sql`dataNascimento IS NOT NULL`))
    .orderBy(employees.dataNascimento).limit(1);

  const [youngest] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataNascimento, funcao: employees.funcao,
  }).from(employees)
    .where(and(activeWhere, sql`dataNascimento IS NOT NULL`))
    .orderBy(desc(employees.dataNascimento)).limit(1);

  const [longestTenure] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataAdmissao, funcao: employees.funcao,
  }).from(employees)
    .where(and(activeWhere, sql`dataAdmissao IS NOT NULL`))
    .orderBy(employees.dataAdmissao).limit(1);

  const [shortestTenure] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataAdmissao, funcao: employees.funcao,
  }).from(employees)
    .where(and(activeWhere, sql`dataAdmissao IS NOT NULL`))
    .orderBy(desc(employees.dataAdmissao)).limit(1);

  // Ranking de advertências (top 10) — apenas ativos, filtrar soft-deleted
  const rankingAdvertencias = await db.select({
    employeeId: warnings.employeeId,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    total: sql<number>`count(*)`,
  }).from(warnings)
    .innerJoin(employees, eq(warnings.employeeId, employees.id))
    .where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt), isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
    .groupBy(warnings.employeeId, employees.nomeCompleto, employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // Ranking de atestados/faltas (top 10) — apenas ativos, filtrar soft-deleted
  const rankingAtestados = await db.select({
    employeeId: atestados.employeeId,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    totalAtestados: sql<number>`count(*)`,
    totalDias: sql<number>`COALESCE(SUM(diasAfastamento), 0)`,
  }).from(atestados)
    .innerJoin(employees, eq(atestados.employeeId, employees.id))
    .where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt), isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
    .groupBy(atestados.employeeId, employees.nomeCompleto, employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // Advertências por tipo — filtrar soft-deleted
  const advertenciasTipo = await db.select({
    tipo: warnings.tipoAdvertencia,
    count: sql<number>`count(*)`,
  }).from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt))).groupBy(warnings.tipoAdvertencia);

  // Total geral - Lista_Negra conta como Desligado nos dashboards
  const totalDesligados = statusDist.filter(s => s.status === 'Desligado' || s.status === 'Lista_Negra').reduce((s, r) => s + Number(r.count), 0);
  const totalAtivos = statusDist.filter(s => !['Desligado', 'Lista_Negra'].includes(s.status || '')).reduce((s, r) => s + Number(r.count), 0);
  const totalGeral = statusDist.reduce((s, r) => s + Number(r.count), 0);

  // Mesclar Lista_Negra com Desligado para exibição nos dashboards
  // E corrigir contagem de Férias com base na vacation_periods (cross-reference)
  const statusMergeObj: Record<string, number> = {};
  for (const r of statusDist) {
    const label = r.status === 'Lista_Negra' ? 'Desligado' : (r.status || 'Desconhecido');
    statusMergeObj[label] = (statusMergeObj[label] || 0) + Number(r.count);
  }
  // Ajustar: mover feriasExtraCount de 'Ativo' para 'Ferias'
  if (feriasExtraCount > 0) {
    statusMergeObj['Ferias'] = (statusMergeObj['Ferias'] || 0) + feriasExtraCount;
    statusMergeObj['Ativo'] = (statusMergeObj['Ativo'] || 0) - feriasExtraCount;
  }
  const statusDistMerged = Object.entries(statusMergeObj).map(([label, value]) => ({ label, value }));

  return {
    resumo: { totalGeral, totalAtivos: Number(totalAtivos), totalDesligados },
    statusDist: statusDistMerged,
    sexDist: sexDist.map(r => ({ label: r.sexo || "Não informado", value: Number(r.count) })),
    setorDist: setorDist.map(r => ({ label: r.setor || "Não informado", value: Number(r.count) })),
    funcaoDist: funcaoDist.map(r => ({ label: r.funcao || "Não informado", value: Number(r.count) })),
    contratoDist: contratoDist.map(r => ({ label: r.tipo || "Não informado", value: Number(r.count) })),
    estadoCivilDist: estadoCivilDist.map(r => ({ label: r.estadoCivil || "Não informado", value: Number(r.count) })),
    cidadeDist: cidadeDist.map(r => ({ label: r.cidade || "Não informado", value: Number(r.count) })),
    estadoDist: await (async () => {
      const rows = await db.select({
        estado: employees.estado,
        count: sql<number>`count(*)`,
      }).from(employees).where(activeWhere).groupBy(employees.estado).orderBy(sql`count(*) desc`);
      return rows.map(r => ({ state: (r.estado && r.estado.trim()) ? r.estado.toUpperCase() : 'Não informado', count: Number(r.count) }));
    })(),
    ageDist: ageDist.map(r => ({ faixa: r.faixa, sexo: r.sexo || "Outro", count: Number(r.count) })),
    tenureDist: (() => {
      const ordemCrescente = ['< 3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5-10 anos', '10+ anos'];
      const mapped = tenureDist.map(r => ({ label: r.faixa, value: Number(r.count) }));
      return mapped.sort((a, b) => ordemCrescente.indexOf(a.label) - ordemCrescente.indexOf(b.label));
    })(),
    turnover: { admissoes: admissoesMensal.map(r => ({ mes: r.mes, count: Number(r.count) })), demissoes: demissoesMensal.map(r => ({ mes: r.mes, count: Number(r.count) })) },
    destaques: {
      maisVelho: oldest ? { nome: oldest.nome, data: oldest.data, funcao: oldest.funcao } : null,
      maisNovo: youngest ? { nome: youngest.nome, data: youngest.data, funcao: youngest.funcao } : null,
      maiorTempo: longestTenure ? { nome: longestTenure.nome, data: longestTenure.data, funcao: longestTenure.funcao } : null,
      menorTempo: shortestTenure ? { nome: shortestTenure.nome, data: shortestTenure.data, funcao: shortestTenure.funcao } : null,
    },
    rankingAdvertencias: rankingAdvertencias.map(r => ({ nome: r.nome, funcao: r.funcao, total: Number(r.total) })),
    rankingAtestados: rankingAtestados.map(r => ({ nome: r.nome, funcao: r.funcao, totalAtestados: Number(r.totalAtestados), totalDias: Number(r.totalDias) })),
    advertenciasTipo: advertenciasTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
  };
}

// ============================================================
// 2. DASHBOARD CARTÃO DE PONTO
// ============================================================
async function getDashCartaoPonto(companyId: number, mesRef?: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const mes = mesRef || new Date().toISOString().slice(0, 7);

  // Registros do mês
  const registros = await db.select().from(timeRecords)
    .where(and(companyWhere(timeRecords, companyId, companyIds), eq(timeRecords.mesReferencia, mes)));

  // Funcionários ativos
  const allEmps = await db.select({
    id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor,
  }).from(employees).where(and(companyWhere(employees, companyId, companyIds), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`, sql`${employees.deletedAt} IS NULL`));
  const empMap = new Map(allEmps.map(e => [e.id, e]));

  // Totais
  let totalHorasTrab = 0, totalHorasExtras = 0, totalFaltas = 0, totalAtrasos = 0;
  let totalFaltasDias = 0, totalAtrasosComTolerancia = 0;
  const porFuncionario: Record<number, { horasTrab: number; horasExtras: number; faltas: number; faltasDias: number; atrasos: number; atrasosMinutos: number; dias: number }> = {};

  // CLT Art. 58, §1º: Tolerância de 10 minutos diários (não serão descontados atrasos <= 10min/dia)
  const TOLERANCIA_CLT_MINUTOS = 10;

  // Agrupar registros por funcionário+data para calcular tolerância diária
  const registrosPorEmpDia: Record<string, typeof registros> = {};
  for (const r of registros) {
    const key = `${r.employeeId}_${r.data}`;
    if (!registrosPorEmpDia[key]) registrosPorEmpDia[key] = [];
    registrosPorEmpDia[key].push(r);
  }

  for (const r of registros) {
    const ht = parseFloat(r.horasTrabalhadas || "0");
    const he = parseFloat(r.horasExtras || "0");
    const ft = parseFloat(r.faltas || "0");
    const atRaw = parseFloat(r.atrasos || "0");
    totalHorasTrab += ht;
    totalHorasExtras += he;
    totalFaltas += ft;
    if (!porFuncionario[r.employeeId]) porFuncionario[r.employeeId] = { horasTrab: 0, horasExtras: 0, faltas: 0, faltasDias: 0, atrasos: 0, atrasosMinutos: 0, dias: 0 };
    porFuncionario[r.employeeId].horasTrab += ht;
    porFuncionario[r.employeeId].horasExtras += he;
    porFuncionario[r.employeeId].faltas += ft;

    // Contar dia de falta: se há falta registrada (faltas > 0), conta como 1 dia inteiro
    // Não existe "meio dia" de falta — ou faltou ou não faltou
    if (ft > 0) {
      porFuncionario[r.employeeId].faltasDias += 1;
      totalFaltasDias += 1;
    }

    // Atrasos: aplicar tolerância CLT Art. 58 §1º
    // Converter horas para minutos para comparar com tolerância
    const atMinutos = Math.round(atRaw * 60);
    if (atMinutos > TOLERANCIA_CLT_MINUTOS) {
      // Acima da tolerância: conta o total (não só o excedente, conforme jurisprudência)
      porFuncionario[r.employeeId].atrasos += atRaw;
      porFuncionario[r.employeeId].atrasosMinutos += atMinutos;
      totalAtrasos += atRaw;
      totalAtrasosComTolerancia += atMinutos;
    }
    // Até 10min: tolerância legal, não conta

    porFuncionario[r.employeeId].dias++;
  }

  // Ranking de faltas (em DIAS)
  const rankingFaltas = Object.entries(porFuncionario)
    .filter(([, d]) => d.faltasDias > 0)
    .map(([empId, d]) => {
      const emp = empMap.get(Number(empId));
      return { employeeId: Number(empId), nome: emp?.nome || `#${empId}`, funcao: emp?.funcao || "-", faltasDias: d.faltasDias, faltasHoras: d.faltas };
    }).sort((a, b) => b.faltasDias - a.faltasDias).slice(0, 10);

  // Ranking de atrasos (com tolerância CLT Art. 58 §1º - 10min/dia)
  const rankingAtrasos = Object.entries(porFuncionario)
    .filter(([, d]) => d.atrasosMinutos > 0)
    .map(([empId, d]) => {
      const emp = empMap.get(Number(empId));
      const horas = Math.floor(d.atrasosMinutos / 60);
      const minutos = d.atrasosMinutos % 60;
      return { employeeId: Number(empId), nome: emp?.nome || `#${empId}`, funcao: emp?.funcao || "-", atrasosMinutos: d.atrasosMinutos, atrasosFormatado: `${horas}h${minutos > 0 ? String(minutos).padStart(2, '0') + 'min' : ''}` };
    }).sort((a, b) => b.atrasosMinutos - a.atrasosMinutos).slice(0, 10);

  // Horas por dia da semana
  const porDiaSemana: Record<string, { horas: number; registros: number }> = {
    "Dom": { horas: 0, registros: 0 }, "Seg": { horas: 0, registros: 0 }, "Ter": { horas: 0, registros: 0 },
    "Qua": { horas: 0, registros: 0 }, "Qui": { horas: 0, registros: 0 }, "Sex": { horas: 0, registros: 0 },
    "Sáb": { horas: 0, registros: 0 },
  };
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  for (const r of registros) {
    const d = new Date(r.data + "T12:00:00");
    const dia = diasSemana[d.getDay()];
    porDiaSemana[dia].horas += parseFloat(r.horasTrabalhadas || "0");
    porDiaSemana[dia].registros++;
  }

  // Evolução diária (horas totais por dia)
  const porDia: Record<string, number> = {};
  for (const r of registros) {
    porDia[r.data] = (porDia[r.data] || 0) + parseFloat(r.horasTrabalhadas || "0");
  }
  const evolucaoDiaria = Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b))
    .map(([data, horas]) => ({ data, horas: Math.round(horas * 100) / 100 }));

  const funcionariosComRegistro = Object.keys(porFuncionario).length;
  const funcionariosSemRegistro = allEmps.length - funcionariosComRegistro;

  // % de Horas Extras sobre Horas Normais
  const percentualHE = totalHorasTrab > 0 ? Math.round((totalHorasExtras / totalHorasTrab) * 10000) / 100 : 0;

  // Formatar total de atrasos
  const totalAtrasosH = Math.floor(totalAtrasosComTolerancia / 60);
  const totalAtrasosM = totalAtrasosComTolerancia % 60;
  const totalAtrasosFormatado = `${totalAtrasosH}h${totalAtrasosM > 0 ? String(totalAtrasosM).padStart(2, '0') + 'min' : ''}`;

  return {
    resumo: {
      totalHorasTrab: Math.round(totalHorasTrab * 100) / 100,
      totalHorasExtras: Math.round(totalHorasExtras * 100) / 100,
      percentualHE,
      totalFaltas: Math.round(totalFaltas * 100) / 100,
      totalFaltasDias: Math.round(totalFaltasDias * 10) / 10,
      totalAtrasos: Math.round(totalAtrasos * 100) / 100,
      totalAtrasosFormatado,
      totalAtrasosMinutos: totalAtrasosComTolerancia,
      totalRegistros: registros.length,
      funcionariosComRegistro,
      funcionariosSemRegistro,
      totalFuncionariosAtivos: allEmps.length,
      toleranciaCLT: TOLERANCIA_CLT_MINUTOS,
    },
    rankingFaltas,
    rankingAtrasos,
    porDiaSemana: Object.entries(porDiaSemana).map(([dia, d]) => ({ dia, horas: Math.round(d.horas * 100) / 100, registros: d.registros })),
    evolucaoDiaria,
    mesReferencia: mes,
  };
}

// ============================================================
// 3. DASHBOARD FOLHA DE PAGAMENTO
// ============================================================
async function getDashFolhaPagamento(companyId: number, mesRef?: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const mes = mesRef || new Date().toISOString().slice(0, 7);
  const year = mes.slice(0, 4);

  // Dados do monthlyPayrollSummary (mais completo)
  const summaryMes = await db.select().from(monthlyPayrollSummary)
    .where(and(companyWhere(monthlyPayrollSummary, companyId, companyIds), eq(monthlyPayrollSummary.mesReferencia, mes)));

  // Evolução mensal (últimos 12 meses)
  const evolucaoRaw = await db.select({
    mes: monthlyPayrollSummary.mesReferencia,
    totalProventos: sql<number>`COALESCE(SUM(CAST(totalProventos AS DECIMAL(12,2))), 0)`,
    totalDescontos: sql<number>`COALESCE(SUM(CAST(totalDescontos AS DECIMAL(12,2))), 0)`,
    totalLiquido: sql<number>`COALESCE(SUM(CAST(folhaLiquido AS DECIMAL(12,2))), 0)`,
    totalFgts: sql<number>`COALESCE(SUM(CAST(valorFgts AS DECIMAL(12,2))), 0)`,
    totalInss: sql<number>`COALESCE(SUM(CAST(valorInss AS DECIMAL(12,2))), 0)`,
    funcionarios: sql<number>`count(DISTINCT employeeId)`,
  }).from(monthlyPayrollSummary)
    .where(and(companyWhere(monthlyPayrollSummary, companyId, companyIds), sql`mesReferencia >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM')`))
    .groupBy(monthlyPayrollSummary.mesReferencia)
    .orderBy(monthlyPayrollSummary.mesReferencia);

  // Custo total do mês atual
  let custoTotalMes = 0, totalProventosMes = 0, totalDescontosMes = 0, totalLiquidoMes = 0;
  let totalFgtsMes = 0, totalInssMes = 0, totalIrrfMes = 0;
  for (const s of summaryMes) {
    custoTotalMes += parseFloat(s.custoTotalMes || "0");
    totalProventosMes += parseFloat(s.totalProventos || "0");
    totalDescontosMes += parseFloat(s.totalDescontos || "0");
    totalLiquidoMes += parseFloat(s.folhaLiquido || "0");
    totalFgtsMes += parseFloat(s.valorFgts || "0");
    totalInssMes += parseFloat(s.valorInss || "0");
    totalIrrfMes += parseFloat(s.valorIrrf || "0");
  }

  // Top 10 maiores salários
  const topSalarios = summaryMes
    .map(s => ({
      nome: s.nomeColaborador || "Desconhecido",
      funcao: s.funcao || "-",
      liquido: parseFloat(s.folhaLiquido || "0"),
      bruto: parseFloat(s.totalProventos || "0"),
    }))
    .sort((a, b) => b.bruto - a.bruto).slice(0, 10);

  // Distribuição por banco
  const porBanco: Record<string, { count: number; valor: number }> = {};
  for (const s of summaryMes) {
    const banco = s.bancoFolha || "Não informado";
    if (!porBanco[banco]) porBanco[banco] = { count: 0, valor: 0 };
    porBanco[banco].count++;
    porBanco[banco].valor += parseFloat(s.folhaLiquido || "0");
  }

  // Custo por função (top 10)
  const porFuncao: Record<string, { count: number; custo: number }> = {};
  for (const s of summaryMes) {
    const f = s.funcao || "Sem Função";
    if (!porFuncao[f]) porFuncao[f] = { count: 0, custo: 0 };
    porFuncao[f].count++;
    porFuncao[f].custo += parseFloat(s.custoTotalMes || "0");
  }

  return {
    resumo: {
      custoTotalMes: Math.round(custoTotalMes * 100) / 100,
      totalProventosMes: Math.round(totalProventosMes * 100) / 100,
      totalDescontosMes: Math.round(totalDescontosMes * 100) / 100,
      totalLiquidoMes: Math.round(totalLiquidoMes * 100) / 100,
      totalFgtsMes: Math.round(totalFgtsMes * 100) / 100,
      totalInssMes: Math.round(totalInssMes * 100) / 100,
      totalIrrfMes: Math.round(totalIrrfMes * 100) / 100,
      totalFuncionarios: summaryMes.length,
    },
    evolucaoMensal: evolucaoRaw.map(r => ({
      mes: r.mes,
      proventos: Number(r.totalProventos),
      descontos: Number(r.totalDescontos),
      liquido: Number(r.totalLiquido),
      fgts: Number(r.totalFgts),
      inss: Number(r.totalInss),
      funcionarios: Number(r.funcionarios),
    })),
    topSalarios,
    porBanco: Object.entries(porBanco).map(([banco, d]) => ({ banco, count: d.count, valor: Math.round(d.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
    porFuncao: Object.entries(porFuncao).map(([funcao, d]) => ({ funcao, count: d.count, custo: Math.round(d.custo * 100) / 100 })).sort((a, b) => b.custo - a.custo).slice(0, 10),
    mesReferencia: mes,
  };
}

// ============================================================
// 4. DASHBOARD HORAS EXTRAS (análise detalhada)
// ============================================================
async function getDashHorasExtras(companyId: number, year?: number, filters?: {
  month?: number; obraId?: number; employeeId?: number;
  periodoTipo?: string; periodoValor?: string;
}, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const targetYear = year || new Date().getFullYear();

  // Calcular range de datas baseado nos filtros
  let startDate = `${targetYear}-01`;
  let endDate = `${targetYear}-12`;

  if (filters?.periodoTipo && filters?.periodoValor) {
    const pv = filters.periodoValor;
    switch (filters.periodoTipo) {
      case 'mes': {
        const m = parseInt(pv);
        if (m >= 1 && m <= 12) {
          startDate = `${targetYear}-${String(m).padStart(2, '0')}`;
          endDate = startDate;
        }
        break;
      }
      case 'trimestre': {
        const q = parseInt(pv);
        const qStart = (q - 1) * 3 + 1;
        const qEnd = q * 3;
        startDate = `${targetYear}-${String(qStart).padStart(2, '0')}`;
        endDate = `${targetYear}-${String(qEnd).padStart(2, '0')}`;
        break;
      }
      case 'semestre': {
        const s = parseInt(pv);
        startDate = s === 1 ? `${targetYear}-01` : `${targetYear}-07`;
        endDate = s === 1 ? `${targetYear}-06` : `${targetYear}-12`;
        break;
      }
      case 'semana': {
        // periodoValor = "YYYY-Wnn" ou "YYYY-MM-DD" (data da segunda-feira)
        // Filtramos por mês de referência que contenha essa semana
        break;
      }
      case 'dia': {
        // periodoValor = "YYYY-MM-DD"
        if (pv.length >= 7) {
          startDate = pv.substring(0, 7);
          endDate = startDate;
        }
        break;
      }
    }
  } else if (filters?.month) {
    startDate = `${targetYear}-${String(filters.month).padStart(2, '0')}`;
    endDate = startDate;
  }

  const conditions = [
    companyWhere(extraPayments, companyId, companyIds),
    eq(extraPayments.tipoExtra, "Horas_Extras"),
    gte(extraPayments.mesReferencia, startDate),
    lte(extraPayments.mesReferencia, endDate),
  ];

  // Filtro por colaborador
  if (filters?.employeeId) {
    conditions.push(eq(extraPayments.employeeId, filters.employeeId));
  }

  const allHE = await db.select().from(extraPayments)
    .where(and(...conditions));

  const allEmps = await db.select({
    id: employees.id, nomeCompleto: employees.nomeCompleto, cargo: employees.cargo,
    setor: employees.setor, valorHora: employees.valorHora, funcao: employees.funcao,
  }).from(employees).where(and(companyWhere(employees, companyId, companyIds), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`, sql`${employees.deletedAt} IS NULL`));
  
  // Buscar alocações ativas para mapear empId -> obraId
  const empObraAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
    .from(obraFuncionarios).where(and(companyWhere(obraFuncionarios, companyId, companyIds), eq(obraFuncionarios.isActive, 1)));
  const empObraIdMap = new Map(empObraAlocs.map(a => [a.employeeId, a.obraId]));
  
  const empMap = new Map(allEmps.map(e => [e.id, { ...e, obraAtualId: empObraIdMap.get(e.id) || null }]));

  // Obras
  const allObras = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(and(companyWhere(obras, companyId, companyIds), sql`${obras.deletedAt} IS NULL`));
  const obraMap = new Map(allObras.map(o => [o.id, o.nome]));

  const allPayroll = await db.select().from(payroll)
    .where(and(companyWhere(payroll, companyId, companyIds), gte(payroll.mesReferencia, startDate), lte(payroll.mesReferencia, endDate)));

  let totalHoras = 0, totalValor = 0;
  for (const he of allHE) {
    totalHoras += parseFloat(he.quantidadeHoras || "0");
    totalValor += parseFloat(he.valorTotal || "0");
  }

  // Por pessoa
  const porPessoa: Record<number, { horas: number; valor: number; registros: number }> = {};
  for (const he of allHE) {
    if (!porPessoa[he.employeeId]) porPessoa[he.employeeId] = { horas: 0, valor: 0, registros: 0 };
    porPessoa[he.employeeId].horas += parseFloat(he.quantidadeHoras || "0");
    porPessoa[he.employeeId].valor += parseFloat(he.valorTotal || "0");
    porPessoa[he.employeeId].registros++;
  }

  const rankingPessoa = Object.entries(porPessoa)
    .map(([empId, data]) => {
      const emp = empMap.get(Number(empId));
      return {
        nome: emp?.nomeCompleto || `#${empId}`,
        funcao: emp?.funcao || emp?.cargo || "-",
        setor: emp?.setor || "-",
        valorHora: emp?.valorHora || "0",
        ...data,
      };
    }).sort((a, b) => b.horas - a.horas);

  // Por setor
  const porSetor: Record<string, { horas: number; valor: number; pessoas: Set<number> }> = {};
  for (const he of allHE) {
    const emp = empMap.get(he.employeeId);
    const setor = emp?.setor || "Sem Setor";
    if (!porSetor[setor]) porSetor[setor] = { horas: 0, valor: 0, pessoas: new Set() };
    porSetor[setor].horas += parseFloat(he.quantidadeHoras || "0");
    porSetor[setor].valor += parseFloat(he.valorTotal || "0");
    porSetor[setor].pessoas.add(he.employeeId);
  }
  const rankingSetor = Object.entries(porSetor)
    .map(([setor, data]) => ({ setor, horas: Math.round(data.horas * 100) / 100, valor: Math.round(data.valor * 100) / 100, pessoas: data.pessoas.size }))
    .sort((a, b) => b.valor - a.valor);

  // Por obra (via obraAtualId do funcionário)
  const porObra: Record<string, { horas: number; valor: number; pessoas: Set<number> }> = {};
  for (const he of allHE) {
    const emp = empMap.get(he.employeeId);
    const obraId = emp?.obraAtualId;
    const obraNome = obraId ? (obraMap.get(obraId) || `Obra #${obraId}`) : "Sem Obra";
    if (!porObra[obraNome]) porObra[obraNome] = { horas: 0, valor: 0, pessoas: new Set() };
    porObra[obraNome].horas += parseFloat(he.quantidadeHoras || "0");
    porObra[obraNome].valor += parseFloat(he.valorTotal || "0");
    porObra[obraNome].pessoas.add(he.employeeId);
  }
  const rankingObra = Object.entries(porObra)
    .map(([obra, data]) => ({ obra, horas: Math.round(data.horas * 100) / 100, valor: Math.round(data.valor * 100) / 100, pessoas: data.pessoas.size }))
    .sort((a, b) => b.valor - a.valor);

  // Evolução mensal
  const porMes: Record<string, { horas: number; valor: number; registros: number }> = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${targetYear}-${String(m).padStart(2, "0")}`;
    porMes[key] = { horas: 0, valor: 0, registros: 0 };
  }
  for (const he of allHE) {
    if (porMes[he.mesReferencia]) {
      porMes[he.mesReferencia].horas += parseFloat(he.quantidadeHoras || "0");
      porMes[he.mesReferencia].valor += parseFloat(he.valorTotal || "0");
      porMes[he.mesReferencia].registros++;
    }
  }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, data]) => ({ mes, horas: Math.round(data.horas * 100) / 100, valor: Math.round(data.valor * 100) / 100, registros: data.registros }));

  // Percentuais
  const percentuais: Record<string, number> = {};
  for (const he of allHE) {
    const pct = he.percentualAcrescimo || "50";
    percentuais[pct + "%"] = (percentuais[pct + "%"] || 0) + 1;
  }

  // % sobre folha
  let totalFolhaBruto = 0;
  for (const p of allPayroll) totalFolhaBruto += parseFloat((p as any).salarioBruto || "0");
  const percentualHEsobreFolha = totalFolhaBruto > 0 ? (totalValor / totalFolhaBruto) * 100 : 0;

  const pessoasComHE = Object.keys(porPessoa).length;

  // Filtro por obra (filtrar allHE se obraId)
  let filteredHE = allHE;
  if (filters?.obraId) {
    const empIdsNaObra = new Set(allEmps.filter(e => empObraIdMap.get(e.id) === filters.obraId).map(e => e.id));
    filteredHE = allHE.filter(he => empIdsNaObra.has(he.employeeId));
    // Recalcular totais com filtro
    totalHoras = 0; totalValor = 0;
    for (const he of filteredHE) {
      totalHoras += parseFloat(he.quantidadeHoras || "0");
      totalValor += parseFloat(he.valorTotal || "0");
    }
  }

  // Listas para filtros no frontend
  const obrasDisponiveis = allObras.map(o => ({ id: o.id, nome: o.nome })).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const colaboradoresDisponiveis = allEmps
    .filter(e => porPessoa[e.id])
    .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao || e.cargo || "-" }))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  // Detalhe por registro (para tabela detalhada)
  const detalhes = filteredHE.map(he => {
    const emp = empMap.get(he.employeeId);
    const obraId = emp?.obraAtualId;
    return {
      id: he.id,
      mesReferencia: he.mesReferencia,
      nome: emp?.nomeCompleto || `#${he.employeeId}`,
      funcao: emp?.funcao || emp?.cargo || "-",
      setor: emp?.setor || "-",
      obra: obraId ? (obraMap.get(obraId) || `Obra #${obraId}`) : "Sem Obra",
      horas: parseFloat(he.quantidadeHoras || "0"),
      percentual: he.percentualAcrescimo || "50",
      valorHoraBase: parseFloat(he.valorHoraBase || "0"),
      valorTotal: parseFloat(he.valorTotal || "0"),
      descricao: he.descricao || "",
    };
  }).sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));

  return {
    resumo: {
      totalHoras: Math.round(totalHoras * 100) / 100,
      totalValor: Math.round(totalValor * 100) / 100,
      totalRegistros: filteredHE.length,
      pessoasComHE,
      mediaHorasPorPessoa: pessoasComHE > 0 ? Math.round((totalHoras / pessoasComHE) * 100) / 100 : 0,
      mediaValorPorPessoa: pessoasComHE > 0 ? Math.round((totalValor / pessoasComHE) * 100) / 100 : 0,
      percentualHEsobreFolha: Math.round(percentualHEsobreFolha * 100) / 100,
      totalFolhaBruto: Math.round(totalFolhaBruto * 100) / 100,
    },
    rankingPessoa: rankingPessoa.slice(0, 15),
    rankingSetor,
    rankingObra,
    evolucaoMensal,
    percentuais: Object.entries(percentuais).map(([pct, count]) => ({ percentual: pct, count })).sort((a, b) => b.count - a.count),
    ano: targetYear,
    filtros: {
      obras: obrasDisponiveis,
      colaboradores: colaboradoresDisponiveis,
    },
    detalhes: detalhes.slice(0, 200),
  };
}

// ============================================================
// 5. DASHBOARD EPIs
// ============================================================
async function getDashEpis(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];
  const ids = resolveIds(companyId, companyIds);
  const companyFilter = ids.length === 1 ? eq(epis.companyId, ids[0]) : inArray(epis.companyId, ids);
  const delFilter = ids.length === 1 ? eq(epiDeliveries.companyId, ids[0]) : inArray(epiDeliveries.companyId, ids);
  const empFilter = ids.length === 1 ? eq(employees.companyId, ids[0]) : inArray(employees.companyId, ids);
  const obraFilter = ids.length === 1 ? eq(obras.companyId, ids[0]) : inArray(obras.companyId, ids);

  const allEpis = await db.select().from(epis).where(companyFilter);
  const allDel = await db.select().from(epiDeliveries)
    .where(and(delFilter, isNull(epiDeliveries.deletedAt)));
  const allEmps = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao })
    .from(employees).where(and(empFilter, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`));
  // Buscar alocações ativas para mapear empId -> obraId
  const epiEmpObraAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
    .from(obraFuncionarios).where(and(ids.length === 1 ? eq(obraFuncionarios.companyId, ids[0]) : inArray(obraFuncionarios.companyId, ids), eq(obraFuncionarios.isActive, 1)));
  const epiEmpObraMap = new Map(epiEmpObraAlocs.map(a => [a.employeeId, a.obraId]));
  const empMap = new Map(allEmps.map(e => [e.id, { ...e, obraAtualId: epiEmpObraMap.get(e.id) || null }]));
  const allObras = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(obraFilter);
  const obraMap = new Map(allObras.map(o => [o.id, o.nome]));

  const estoqueTotal = allEpis.reduce((s, e) => s + (e.quantidadeEstoque || 0), 0);
  const estoqueBaixo = allEpis.filter(e => (e.quantidadeEstoque || 0) <= 5);
  const caVencido = allEpis.filter(e => e.validadeCa && e.validadeCa < hoje);

  // Valor total do inventário
  const valorTotalInventario = allEpis.reduce((s, e) => {
    const v = e.valorProduto ? parseFloat(String(e.valorProduto)) : 0;
    return s + v * (e.quantidadeEstoque || 0);
  }, 0);

  // Entregas por mês (últimos 12 meses)
  const consumoMensal: { mes: string; mesKey: string; entregas: number; unidades: number; custo: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mesLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const entregas = allDel.filter(del => del.dataEntrega?.startsWith(mesKey));
    const unidades = entregas.reduce((s, del) => s + (del.quantidade || 1), 0);
    const custo = entregas.reduce((s, del) => {
      if (del.valorCobrado) return s + parseFloat(String(del.valorCobrado));
      const ep = allEpis.find(e => e.id === del.epiId);
      return s + ((ep?.valorProduto ? parseFloat(String(ep.valorProduto)) : 0) * (del.quantidade || 1));
    }, 0);
    consumoMensal.push({ mes: mesLabel, mesKey, entregas: entregas.length, unidades, custo });
  }

  // Top EPIs mais entregues (com custo)
  const porEpi: Record<number, { nome: string; ca: string; qtd: number; custo: number; valor: number; categoria: string }> = {};
  for (const d of allDel) {
    if (!porEpi[d.epiId]) {
      const ep = allEpis.find(e => e.id === d.epiId);
      porEpi[d.epiId] = {
        nome: ep?.nome || "EPI #" + d.epiId,
        ca: ep?.ca || '-',
        qtd: 0,
        custo: 0,
        valor: ep?.valorProduto ? parseFloat(String(ep.valorProduto)) : 0,
        categoria: ep?.categoria === 'Calcado' ? 'Calçado' : (ep?.categoria || 'EPI'),
      };
    }
    porEpi[d.epiId].qtd += d.quantidade;
    porEpi[d.epiId].custo += d.valorCobrado ? parseFloat(String(d.valorCobrado)) : (porEpi[d.epiId].valor * d.quantidade);
  }
  const allEpiStats = Object.values(porEpi);
  const topEpis = [...allEpiStats].sort((a, b) => b.qtd - a.qtd).slice(0, 10);

  // ===== NOVAS ANÁLISES =====

  // Item MAIS utilizado (maior quantidade de entregas)
  const itemMaisUtilizado = allEpiStats.length > 0
    ? [...allEpiStats].sort((a, b) => b.qtd - a.qtd)[0]
    : null;

  // Item MENOS utilizado (menor quantidade de entregas, pelo menos 1 entrega)
  const itemMenosUtilizado = allEpiStats.length > 0
    ? [...allEpiStats].sort((a, b) => a.qtd - b.qtd)[0]
    : null;

  // Item MAIS caro (maior valor unitário cadastrado)
  const episComValor = allEpis.filter(e => e.valorProduto && parseFloat(String(e.valorProduto)) > 0);
  const itemMaisCaro = episComValor.length > 0
    ? episComValor.sort((a, b) => parseFloat(String(b.valorProduto || '0')) - parseFloat(String(a.valorProduto || '0')))[0]
    : null;

  // Item MAIS barato (menor valor unitário cadastrado, > 0)
  const itemMaisBarato = episComValor.length > 0
    ? episComValor.sort((a, b) => parseFloat(String(a.valorProduto || '0')) - parseFloat(String(b.valorProduto || '0')))[0]
    : null;

  // Funcionários que mais receberam EPIs (com custo)
  const porFunc: Record<number, { qtd: number; entregas: number; custo: number }> = {};
  for (const d of allDel) {
    if (!porFunc[d.employeeId]) porFunc[d.employeeId] = { qtd: 0, entregas: 0, custo: 0 };
    porFunc[d.employeeId].qtd += d.quantidade;
    porFunc[d.employeeId].entregas++;
    const epiValorFunc = allEpis.find(e => e.id === d.epiId);
    const custoFunc = d.valorCobrado ? parseFloat(String(d.valorCobrado)) : ((epiValorFunc?.valorProduto ? parseFloat(String(epiValorFunc.valorProduto)) : 0) * d.quantidade);
    porFunc[d.employeeId].custo += custoFunc;
  }
  const allFuncStats = Object.entries(porFunc)
    .map(([empId, d]) => {
      const emp = empMap.get(Number(empId));
      return { id: Number(empId), nome: emp?.nome || `#${empId}`, funcao: emp?.funcao || "-", qtd: d.qtd, entregas: d.entregas, custo: d.custo };
    });
  const topFuncionarios = [...allFuncStats].sort((a, b) => b.qtd - a.qtd).slice(0, 10);

  // Funcionário que MAIS recebe EPI
  const funcMaisEpi = allFuncStats.length > 0
    ? [...allFuncStats].sort((a, b) => b.qtd - a.qtd)[0]
    : null;

  // Funcionário que MENOS recebe EPI (pelo menos 1 entrega)
  const funcMenosEpi = allFuncStats.length > 0
    ? [...allFuncStats].sort((a, b) => a.qtd - b.qtd)[0]
    : null;

  // Custo de EPI por funcionário (ranking completo top 10)
  const custoPorFuncionario = [...allFuncStats]
    .filter(f => f.custo > 0)
    .sort((a, b) => b.custo - a.custo)
    .slice(0, 10);

  // EPI mais perdido/estragado (motivos de reposição: perda, dano, mau_uso, furto, extravio)
  const motivosReposicao = ['perda', 'dano', 'mau_uso', 'furto', 'extravio', 'desgaste'];
  const epiPorReposicao: Record<number, { nome: string; ca: string; qtd: number }> = {};
  for (const d of allDel) {
    const motivo = (d.motivoTroca || '').toLowerCase();
    if (motivosReposicao.includes(motivo)) {
      if (!epiPorReposicao[d.epiId]) {
        const ep = allEpis.find(e => e.id === d.epiId);
        epiPorReposicao[d.epiId] = { nome: ep?.nome || "EPI #" + d.epiId, ca: ep?.ca || '-', qtd: 0 };
      }
      epiPorReposicao[d.epiId].qtd += d.quantidade;
    }
  }
  const epiMaisPerdido = Object.values(epiPorReposicao).sort((a, b) => b.qtd - a.qtd);
  const topEpiPerdidos = epiMaisPerdido.slice(0, 10);

  // Detalhamento por motivo de reposição (para gráfico)
  const reposicaoPorMotivo: Record<string, number> = {};
  for (const d of allDel) {
    const motivo = (d.motivoTroca || '').toLowerCase();
    if (motivosReposicao.includes(motivo)) {
      const label = motivo === 'mau_uso' ? 'Mau uso' : motivo === 'perda' ? 'Perda' : motivo === 'furto' ? 'Furto' : motivo === 'extravio' ? 'Extravio' : motivo === 'desgaste' ? 'Desgaste' : motivo === 'dano' ? 'Dano' : motivo;
      reposicaoPorMotivo[label] = (reposicaoPorMotivo[label] || 0) + 1;
    }
  }
  const totalReposicoes = Object.values(reposicaoPorMotivo).reduce((s, v) => s + v, 0);
  const taxaReposicao = allDel.length > 0 ? ((totalReposicoes / allDel.length) * 100) : 0;

  // Custo por obra (com valor R$)
  // Mapa de valor unitário por EPI para fallback quando valorCobrado é null
  const epiValorMap = new Map(allEpis.map(e => [e.id, e.valorProduto ? parseFloat(String(e.valorProduto)) : 0]));

  const custoPorObraDetalhado: Record<string, { nome: string; entregas: number; unidades: number; custo: number }> = {};
  allDel.forEach(del => {
    const emp = empMap.get(del.employeeId);
    const obraNome = emp?.obraAtualId ? (obraMap.get(emp.obraAtualId) || 'Sem obra') : 'Sem obra';
    if (!custoPorObraDetalhado[obraNome]) custoPorObraDetalhado[obraNome] = { nome: obraNome, entregas: 0, unidades: 0, custo: 0 };
    custoPorObraDetalhado[obraNome].entregas++;
    custoPorObraDetalhado[obraNome].unidades += (del.quantidade || 1);
    // Usar valorCobrado se disponível, senão usar valor_produto do EPI * quantidade
    const custoEntrega = del.valorCobrado ? parseFloat(String(del.valorCobrado)) : (epiValorMap.get(del.epiId) || 0) * (del.quantidade || 1);
    custoPorObraDetalhado[obraNome].custo += custoEntrega;
  });
  const custoPorObraRanking = Object.values(custoPorObraDetalhado).sort((a, b) => b.unidades - a.unidades);

  // Obra que MAIS solicita EPI
  const obraMaisSolicita = custoPorObraRanking.length > 0 ? custoPorObraRanking[0] : null;

  // Evolução do custo mensal (para gráfico de linha)
  const custoMensal = consumoMensal.map(c => {
    const mesEntregas = allDel.filter(d => d.dataEntrega?.startsWith(c.mesKey));
    const custoMes = mesEntregas.reduce((s, d) => {
      const ep = allEpis.find(e => e.id === d.epiId);
      const valor = ep?.valorProduto ? parseFloat(String(ep.valorProduto)) : 0;
      return s + (valor * d.quantidade);
    }, 0);
    return { ...c, custoEstimado: custoMes };
  });

  // Média de vida útil (tempo entre entregas do mesmo EPI para mesmo funcionário)
  // Previsão de consumo próximo mês (média dos últimos 3 meses)
  const ultimos3 = consumoMensal.slice(-3);
  const mediaConsumo3m = ultimos3.length > 0
    ? Math.round(ultimos3.reduce((s, c) => s + c.unidades, 0) / ultimos3.length)
    : 0;
  const mediaEntregas3m = ultimos3.length > 0
    ? Math.round(ultimos3.reduce((s, c) => s + c.entregas, 0) / ultimos3.length)
    : 0;

  // Custo total geral de EPIs entregues (baseado no valor do produto)
  const custoTotalEntregas = allDel.reduce((s, d) => {
    const ep = allEpis.find(e => e.id === d.epiId);
    const valor = ep?.valorProduto ? parseFloat(String(ep.valorProduto)) : 0;
    return s + (valor * d.quantidade);
  }, 0);

  // Estoque por item (top 10 menores)
  const estoqueCritico = allEpis
    .map(e => ({ nome: e.nome, ca: e.ca, estoque: e.quantidadeEstoque || 0, validadeCa: e.validadeCa }))
    .sort((a, b) => a.estoque - b.estoque).slice(0, 10);

  // Distribuição por categoria
  const porCategoria: Record<string, { itens: number; estoque: number; valor: number }> = {};
  allEpis.forEach(e => {
    const cat = e.categoria === 'Calcado' ? 'Calçado' : (e.categoria || 'EPI');
    if (!porCategoria[cat]) porCategoria[cat] = { itens: 0, estoque: 0, valor: 0 };
    porCategoria[cat].itens++;
    porCategoria[cat].estoque += (e.quantidadeEstoque || 0);
    porCategoria[cat].valor += (e.valorProduto ? parseFloat(String(e.valorProduto)) : 0) * (e.quantidadeEstoque || 0);
  });

  // CAs vencendo nos próximos 90 dias
  const em90dias = new Date();
  em90dias.setDate(em90dias.getDate() + 90);
  const em90diasStr = em90dias.toISOString().split("T")[0];
  const casVencendo = allEpis
    .filter(e => e.validadeCa && e.validadeCa >= hoje && e.validadeCa <= em90diasStr)
    .map(e => ({ nome: e.nome, ca: e.ca, validadeCa: e.validadeCa, estoque: e.quantidadeEstoque || 0 }))
    .sort((a, b) => (a.validadeCa || '').localeCompare(b.validadeCa || ''));

  // Custo por obra (legado - mantido para compatibilidade)
  const custoPorObraList = custoPorObraRanking;

  // Entregas por motivo
  const porMotivo: Record<string, number> = {};
  allDel.forEach(del => {
    const motivo = del.motivoTroca || del.motivo || 'Entrega regular';
    const label = motivo === 'mau_uso' ? 'Mau uso' : motivo === 'perda' ? 'Perda' : motivo === 'furto' ? 'Furto' : motivo === 'extravio' ? 'Extravio' : motivo === 'desgaste' ? 'Desgaste' : motivo;
    porMotivo[label] = (porMotivo[label] || 0) + 1;
  });

  // Alertas de desconto pendentes
  const discountFilter = ids.length === 1 ? eq(epiDiscountAlerts.companyId, ids[0]) : inArray(epiDiscountAlerts.companyId, ids);
  const alertasPendentes = await db.select().from(epiDiscountAlerts)
    .where(and(discountFilter, eq(epiDiscountAlerts.status, 'pendente')));
  const valorDescontosPendentes = alertasPendentes.reduce((s, a) => s + parseFloat(String(a.valorTotal || '0')), 0);

  // Custo médio por funcionário
  const totalCusto = allDel.reduce((s, d) => {
    const epVal = allEpis.find(e => e.id === d.epiId);
    const c = d.valorCobrado ? parseFloat(String(d.valorCobrado)) : ((epVal?.valorProduto ? parseFloat(String(epVal.valorProduto)) : 0) * d.quantidade);
    return s + c;
  }, 0);
  const funcUnicos = new Set(allDel.map(d => d.employeeId)).size;
  const custoMedioPorFunc = funcUnicos > 0 ? totalCusto / funcUnicos : 0;

  // Entregas últimos 30 dias
  const ha30dias = new Date();
  ha30dias.setDate(ha30dias.getDate() - 30);
  const ha30diasStr = ha30dias.toISOString().split("T")[0];
  const entregasMes = allDel.filter(d => d.dataEntrega >= ha30diasStr).length;

  return {
    resumo: {
      totalItens: allEpis.length,
      estoqueTotal,
      estoqueBaixo: estoqueBaixo.length,
      caVencido: caVencido.length,
      totalEntregas: allDel.length,
      totalUnidadesEntregues: allDel.reduce((s, d) => s + d.quantidade, 0),
      valorTotalInventario,
      entregasMes,
      custoMedioPorFunc,
      funcUnicos,
      alertasPendentes: alertasPendentes.length,
      valorDescontosPendentes,
      casVencendoCount: casVencendo.length,
    },
    consumoMensal,
    custoMensal,
    topEpis,
    topFuncionarios,
    estoqueCritico,
    caVencidos: caVencido.map(e => ({ nome: e.nome, ca: e.ca, validadeCa: e.validadeCa })),
    casVencendo,
    porCategoria,
    custoPorObraList,
    porMotivo,
    // Novas análises
    itemMaisUtilizado: itemMaisUtilizado ? { nome: itemMaisUtilizado.nome, ca: itemMaisUtilizado.ca, qtd: itemMaisUtilizado.qtd, categoria: itemMaisUtilizado.categoria } : null,
    itemMenosUtilizado: itemMenosUtilizado ? { nome: itemMenosUtilizado.nome, ca: itemMenosUtilizado.ca, qtd: itemMenosUtilizado.qtd, categoria: itemMenosUtilizado.categoria } : null,
    itemMaisCaro: itemMaisCaro ? { nome: itemMaisCaro.nome, ca: itemMaisCaro.ca, valor: parseFloat(String(itemMaisCaro.valorProduto || '0')), categoria: itemMaisCaro.categoria === 'Calcado' ? 'Calçado' : (itemMaisCaro.categoria || 'EPI') } : null,
    itemMaisBarato: itemMaisBarato ? { nome: itemMaisBarato.nome, ca: itemMaisBarato.ca, valor: parseFloat(String(itemMaisBarato.valorProduto || '0')), categoria: itemMaisBarato.categoria === 'Calcado' ? 'Calçado' : (itemMaisBarato.categoria || 'EPI') } : null,
    funcMaisEpi: funcMaisEpi ? { nome: funcMaisEpi.nome, funcao: funcMaisEpi.funcao, qtd: funcMaisEpi.qtd, entregas: funcMaisEpi.entregas } : null,
    funcMenosEpi: funcMenosEpi ? { nome: funcMenosEpi.nome, funcao: funcMenosEpi.funcao, qtd: funcMenosEpi.qtd, entregas: funcMenosEpi.entregas } : null,
    custoPorFuncionario,
    topEpiPerdidos,
    reposicaoPorMotivo,
    taxaReposicao,
    totalReposicoes,
    obraMaisSolicita,
    custoPorObraRanking,
    mediaConsumo3m,
    mediaEntregas3m,
    custoTotalEntregas,
    // Legacy compat
    evolucaoMensal: consumoMensal.map(c => ({ mes: c.mesKey, qtd: c.unidades })),
  };
}

// ============================================================
// 6. DASHBOARD JURÍDICO
// ============================================================
async function getDashJuridico(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];

  const allProcessos = await db.select().from(processosTrabalhistas)
    .where(companyWhere(processosTrabalhistas, companyId, companyIds));

  // Próximas audiências
  const proximasAudiencias = allProcessos
    .filter(p => p.dataAudiencia && p.dataAudiencia >= hoje)
    .map(p => ({
      numero: p.numeroProcesso,
      reclamante: p.reclamante,
      vara: p.vara,
      data: p.dataAudiencia,
      status: p.status,
      risco: p.risco,
    }))
    .sort((a, b) => (a.data || "").localeCompare(b.data || "")).slice(0, 10);

  // Valores
  const parseBRLVal = (val: string | null) => {
    if (!val) return 0;
    const clean = val.replace(/R\$\s*/g, "").trim();
    if (clean.includes(",")) return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(clean) || 0;
  };
  let totalValorCausa = 0, totalValorCondenacao = 0, totalValorAcordo = 0, totalValorPago = 0;
  for (const p of allProcessos) {
    totalValorCausa += parseBRLVal(p.valorCausa);
    totalValorCondenacao += parseBRLVal(p.valorCondenacao);
    totalValorAcordo += parseBRLVal(p.valorAcordo);
    totalValorPago += parseBRLVal(p.valorPago);
  }

  // Por status
  const porStatus: Record<string, number> = {};
  for (const p of allProcessos) porStatus[p.status] = (porStatus[p.status] || 0) + 1;

  // Por risco
  const porRisco: Record<string, number> = {};
  for (const p of allProcessos) porRisco[p.risco] = (porRisco[p.risco] || 0) + 1;

  // Por fase
  const porFase: Record<string, number> = {};
  for (const p of allProcessos) porFase[p.fase] = (porFase[p.fase] || 0) + 1;

  // Por tipo de ação
  const porTipo: Record<string, number> = {};
  for (const p of allProcessos) porTipo[p.tipoAcao] = (porTipo[p.tipoAcao] || 0) + 1;

  // Evolução mensal (por data de distribuição)
  const porMes: Record<string, number> = {};
  for (const p of allProcessos) {
    const mes = p.dataDistribuicao?.substring(0, 7) || "Desconhecido";
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, count]) => ({ mes, count }));

  // Valor em risco por nível
  const valorPorRisco: Record<string, number> = {};
  for (const p of allProcessos) {
    if (p.status !== "encerrado" && p.status !== "arquivado") {
      const risco = p.risco || "medio";
      valorPorRisco[risco] = (valorPorRisco[risco] || 0) + parseBRLVal(p.valorCausa);
    }
  }

  const processosAtivos = allProcessos.filter(p => p.status !== "encerrado" && p.status !== "arquivado").length;
  const processosEncerrados = allProcessos.filter(p => p.status === "encerrado" || p.status === "arquivado").length;

  // Pedidos mais comuns
  const pedidosCount: Record<string, number> = {};
  for (const p of allProcessos) {
    let pedidos: string[] = [];
    try {
      if (typeof p.pedidos === "string") {
        pedidos = JSON.parse(p.pedidos);
      } else if (Array.isArray(p.pedidos)) {
        pedidos = p.pedidos as string[];
      }
    } catch { pedidos = []; }
    if (!Array.isArray(pedidos)) pedidos = [];
    for (const ped of pedidos) {
      if (typeof ped === "string" && ped.trim()) {
        pedidosCount[ped.trim()] = (pedidosCount[ped.trim()] || 0) + 1;
      }
    }
  }
  const topPedidos = Object.entries(pedidosCount).map(([pedido, count]) => ({ pedido, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  // Contar assuntos do DataJud
  const assuntosCount: Record<string, number> = {};
  for (const p of allProcessos) {
    let assuntos: any[] = [];
    try {
      if (typeof p.datajudAssuntos === "string" && p.datajudAssuntos) {
        assuntos = JSON.parse(p.datajudAssuntos);
      } else if (Array.isArray(p.datajudAssuntos)) {
        assuntos = p.datajudAssuntos as any[];
      }
    } catch { assuntos = []; }
    if (!Array.isArray(assuntos)) assuntos = [];
    for (const a of assuntos) {
      const nome = typeof a === 'string' ? a : (a?.nome || '');
      if (nome.trim()) {
        assuntosCount[nome.trim()] = (assuntosCount[nome.trim()] || 0) + 1;
      }
    }
  }
  const topAssuntos = Object.entries(assuntosCount).map(([assunto, count]) => ({ assunto, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    resumo: {
      totalProcessos: allProcessos.length,
      processosAtivos,
      processosEncerrados,
      totalValorCausa: Math.round(totalValorCausa * 100) / 100,
      totalValorCondenacao: Math.round(totalValorCondenacao * 100) / 100,
      totalValorAcordo: Math.round(totalValorAcordo * 100) / 100,
      totalValorPago: Math.round(totalValorPago * 100) / 100,
      valorEmRisco: Math.round(Object.values(valorPorRisco).reduce((s, v) => s + v, 0) * 100) / 100,
    },
    porStatus: Object.entries(porStatus).map(([label, value]) => ({ label: label.replace(/_/g, " "), value })),
    porRisco: Object.entries(porRisco).map(([label, value]) => ({ label, value })),
    porFase: Object.entries(porFase).map(([label, value]) => ({ label, value })),
    porTipo: Object.entries(porTipo).map(([label, value]) => ({ label: label.replace(/_/g, " "), value })),
    evolucaoMensal,
    valorPorRisco: Object.entries(valorPorRisco).map(([risco, valor]) => ({ risco, valor: Math.round(valor * 100) / 100 })),
    proximasAudiencias,
    topPedidos,
    topAssuntos,
    porEstado: (() => {
      const stateMap: Record<string, number> = {};
      const trtMap: Record<string, string> = {
        'TRT-1': 'RJ', 'TRT-2': 'SP', 'TRT-3': 'MG', 'TRT-4': 'RS', 'TRT-5': 'BA',
        'TRT-6': 'PE', 'TRT-7': 'CE', 'TRT-8': 'PA', 'TRT-9': 'PR', 'TRT-10': 'DF',
        'TRT-11': 'AM', 'TRT-12': 'SC', 'TRT-13': 'PB', 'TRT-14': 'RO', 'TRT-15': 'SP',
        'TRT-16': 'MA', 'TRT-17': 'ES', 'TRT-18': 'GO', 'TRT-19': 'AL', 'TRT-20': 'SE',
        'TRT-21': 'RN', 'TRT-22': 'PI', 'TRT-23': 'MT', 'TRT-24': 'MS',
      };
      // TRT number map (number only)
      const trtNumMap: Record<string, string> = {
        '1': 'RJ', '2': 'SP', '3': 'MG', '4': 'RS', '5': 'BA',
        '6': 'PE', '7': 'CE', '8': 'PA', '9': 'PR', '10': 'DF',
        '11': 'AM', '12': 'SC', '13': 'PB', '14': 'RO', '15': 'SP',
        '16': 'MA', '17': 'ES', '18': 'GO', '19': 'AL', '20': 'SE',
        '21': 'RN', '22': 'PI', '23': 'MT', '24': 'MS',
      };
      for (const p of allProcessos) {
        let state = '';
        // 1. Try extracting from processo number: NNNNNNN-NN.YYYY.5.TR.OOOO
        const numProc = p.numeroProcesso || '';
        const numMatch = numProc.match(/\d{7}-\d{2}\.\d{4}\.5\.(\d{2})\.\d{4}/);
        if (numMatch) {
          const trtNum = String(parseInt(numMatch[1], 10)); // remove leading zero
          if (trtNumMap[trtNum]) state = trtNumMap[trtNum];
        }
        // 2. Try tribunal field
        if (!state) {
          const tribunal = (p.tribunal || '').toUpperCase();
          for (const [trt, uf] of Object.entries(trtMap)) {
            if (tribunal.includes(trt)) { state = uf; break; }
          }
        }
        // 3. Try comarca field
        if (!state) {
          const comarca = (p.comarca || '').toUpperCase();
          if (comarca) {
            const match = comarca.match(/\/([A-Z]{2})$/);
            if (match) state = match[1];
          }
        }
        if (state) stateMap[state] = (stateMap[state] || 0) + 1;
      }
      return Object.entries(stateMap).map(([state, count]) => ({ state, count }));
    })(),
  };
}

// ============================================================
// DRILL-DOWN: buscar funcionários detalhados por filtro
// ============================================================
async function getDrillDown(companyId: number, filterType: string, filterValue: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];

  let whereClause = and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`);

  // Para drill-downs que não são por status, excluir Desligado e Lista_Negra
  if (filterType !== 'status') {
    whereClause = and(whereClause, sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`);
  }

  switch (filterType) {
    case 'status':
      if (filterValue === 'Desligado') {
        // Desligado inclui Lista_Negra nos dashboards
        whereClause = and(whereClause, sql`${employees.status} IN ('Desligado', 'Lista_Negra')`);
      } else {
        whereClause = and(whereClause, sql`${employees.status} = ${filterValue}`);
      }
      break;
    case 'sexo':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.sexo} IS NULL OR ${employees.sexo} = '')`);
      } else {
        whereClause = and(whereClause, sql`${employees.sexo} = ${filterValue}`);
      }
      break;
    case 'setor':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.setor} IS NULL OR ${employees.setor} = '')`);
      } else {
        whereClause = and(whereClause, sql`${employees.setor} = ${filterValue}`);
      }
      break;
    case 'funcao':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.funcao} IS NULL OR ${employees.funcao} = '')`);
      } else {
        whereClause = and(whereClause, sql`${employees.funcao} = ${filterValue}`);
      }
      break;
    case 'tipoContrato':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} = '')`);
      } else {
        whereClause = and(whereClause, sql`${employees.tipoContrato} = ${filterValue}`);
      }
      break;
    case 'estadoCivil':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.estadoCivil} IS NULL OR ${employees.estadoCivil} = '')`);
      } else {
        whereClause = and(whereClause, sql`${employees.estadoCivil} = ${filterValue.replace(/ /g, '_')}`);
      }
      break;
    case 'cidade':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.cidade} IS NULL OR ${employees.cidade} = '')`);
      } else {
        whereClause = and(whereClause, sql`${employees.cidade} = ${filterValue}`);
      }
      break;
    case 'estado':
      if (filterValue === 'Não informado') {
        whereClause = and(whereClause, sql`(${employees.estado} IS NULL OR ${employees.estado} = '')`);
      } else {
        whereClause = and(whereClause, sql`UPPER(${employees.estado}) = ${filterValue.toUpperCase()}`);
      }
      break;
    case 'faixaEtaria': {
      const ranges: Record<string, [number, number]> = {
        '14-20': [14, 20], '21-25': [21, 25], '26-30': [26, 30],
        '31-40': [31, 40], '41-50': [41, 50], '51-60': [51, 60], '61+': [61, 120],
      };
      const [min, max] = ranges[filterValue] || [0, 120];
      whereClause = and(whereClause, sql`dataNascimento IS NOT NULL`,
        sql`EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) >= ${min}`,
        sql`EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) <= ${max}`);
      break;
    }
    case 'faixaEtariaSexo': {
      // filterValue = "21-25|M"
      const [faixa, sexo] = filterValue.split('|');
      const ranges2: Record<string, [number, number]> = {
        '14-20': [14, 20], '21-25': [21, 25], '26-30': [26, 30],
        '31-40': [31, 40], '41-50': [41, 50], '51-60': [51, 60], '61+': [61, 120],
      };
      const [min2, max2] = ranges2[faixa] || [0, 120];
      whereClause = and(whereClause, sql`dataNascimento IS NOT NULL`,
        sql`EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) >= ${min2}`,
        sql`EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataNascimento")) <= ${max2}`,
        sql`${employees.sexo} = ${sexo}`);
      break;
    }
    case 'tempoEmpresa': {
      const tenureRanges: Record<string, string> = {
        '< 3 meses': '(EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 3',
        '3-6 meses': '(EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) >= 3 AND (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 6',
        '6-12 meses': '(EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) >= 6 AND (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "dataAdmissao"))) < 12',
        '1-2 anos': 'EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) >= 1 AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 2',
        '2-5 anos': 'EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) >= 2 AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 5',
        '5-10 anos': 'EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) >= 5 AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) < 10',
        '10+ anos': 'EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dataAdmissao")) >= 10',
      };
      const tenureSql = tenureRanges[filterValue];
      if (tenureSql) {
        whereClause = and(whereClause, sql`dataAdmissao IS NOT NULL`, sql`status != 'Desligado'`, sql.raw(tenureSql));
      }
      break;
    }
    case 'admissaoMes': {
      // filterValue = "2025-03"
      whereClause = and(whereClause, sql`TO_CHAR(dataAdmissao, 'YYYY-MM') = ${filterValue}`);
      break;
    }
    case 'demissaoMes': {
      // filterValue = "2025-03"
      whereClause = and(whereClause, sql`TO_CHAR(dataDemissao, 'YYYY-MM') = ${filterValue}`);
      break;
    }
    default:
      return [];
  }

  const results = await db.select({
    id: employees.id,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    setor: employees.setor,
    status: employees.status,
    dataAdmissao: employees.dataAdmissao,
    dataDemissao: employees.dataDemissao,
    dataNascimento: employees.dataNascimento,
    sexo: employees.sexo,
    cidade: employees.cidade,
    tipoContrato: employees.tipoContrato,
  }).from(employees).where(whereClause).orderBy(employees.nomeCompleto).limit(100);

  return results;
}

// ============================================================
// 8. DASHBOARD AVISO PRÉVIO
// ============================================================
async function getDashAvisoPrevio(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const anoRef = ano || new Date().getFullYear();

  // Auto-conclude: mark as 'concluido' any aviso where dataFim < today and status is still 'em_andamento'
  // SKIP avisos that were manually reverted (revertidoManualmente = 1)
  const today = new Date().toISOString().split('T')[0];
  await db.update(terminationNotices)
    .set({ status: 'concluido', dataConclusao: today, updatedAt: sql`NOW()` })
    .where(and(
      companyWhere(terminationNotices, companyId, companyIds),
      eq(terminationNotices.status, 'em_andamento'),
      isNull(terminationNotices.deletedAt),
      sql`${terminationNotices.dataFim} IS NOT NULL AND ${terminationNotices.dataFim} < ${today}`,
      sql`(${terminationNotices.revertidoManualmente} = 0 OR ${terminationNotices.revertidoManualmente} IS NULL)`
    ));

  const allNotices = await db.select({
    id: terminationNotices.id,
    employeeId: terminationNotices.employeeId,
    tipo: terminationNotices.tipo,
    dataInicio: terminationNotices.dataInicio,
    dataFim: terminationNotices.dataFim,
    diasAviso: terminationNotices.diasAviso,
    anosServico: terminationNotices.anosServico,
    reducaoJornada: terminationNotices.reducaoJornada,
    salarioBase: terminationNotices.salarioBase,
    valorEstimadoTotal: terminationNotices.valorEstimadoTotal,
    status: terminationNotices.status,
    dataConclusao: terminationNotices.dataConclusao,
    previsaoRescisao: terminationNotices.previsaoRescisao,
    observacoes: terminationNotices.observacoes,
    criadoPor: terminationNotices.criadoPor,
    createdAt: terminationNotices.createdAt,
    nomeCompleto: employees.nomeCompleto,
    setor: employees.setor,
    funcao: employees.funcao,
    cargo: employees.cargo,
    dataAdmissao: employees.dataAdmissao,
    empSalarioBase: employees.salarioBase,
  }).from(terminationNotices)
    .leftJoin(employees, eq(terminationNotices.employeeId, employees.id))
    .where(and(companyWhere(terminationNotices, companyId, companyIds), isNull(terminationNotices.deletedAt)))
    .orderBy(desc(terminationNotices.createdAt));

  // Filtrar pelo ano selecionado
  const filteredNotices = allNotices.filter(n => {
    const getYear = (d: string | null | undefined) => d ? new Date(d + 'T00:00:00').getFullYear() : null;
    const inicioYear = getYear(n.dataInicio);
    const fimYear = getYear(n.dataFim);
    const conclusaoYear = getYear(n.dataConclusao);
    if (inicioYear === anoRef) return true;
    if (fimYear === anoRef) return true;
    if (conclusaoYear === anoRef) return true;
    return false;
  });

  const total = filteredNotices.length;
  const emAndamento = filteredNotices.filter(n => n.status === 'em_andamento').length;
  const concluidos = filteredNotices.filter(n => n.status === 'concluido').length;
  const cancelados = filteredNotices.filter(n => n.status === 'cancelado').length;
  const empregadorTrabalhado = filteredNotices.filter(n => n.tipo === 'empregador_trabalhado').length;
  const empregadorIndenizado = filteredNotices.filter(n => n.tipo === 'empregador_indenizado').length;
  const empregadoTrabalhado = filteredNotices.filter(n => n.tipo === 'empregado_trabalhado').length;
  const empregadoIndenizado = filteredNotices.filter(n => n.tipo === 'empregado_indenizado').length;

  // Recalcular valores em tempo real para cada aviso (importar função inline)
  const { calcularRescisaoCompletaDash } = (() => {
    function calcAnosServico(admStr: string, fimStr: string) {
      const adm = new Date(admStr + 'T00:00:00');
      const fim = new Date(fimStr + 'T00:00:00');
      let anos = fim.getFullYear() - adm.getFullYear();
      if (fim.getMonth() < adm.getMonth() || (fim.getMonth() === adm.getMonth() && fim.getDate() < adm.getDate())) anos--;
      return Math.max(0, anos);
    }
    function calcDiasAvisoTotal(anos: number) { return Math.min(30 + anos * 3, 90); }
    function calcDiasExtras(anos: number) { return Math.min(anos * 3, 60); }
    function calcMesesFerias(admStr: string, refStr: string) {
      const adm = new Date(admStr + 'T00:00:00');
      const ref = new Date(refStr + 'T00:00:00');
      let lastAniv = new Date(ref.getFullYear(), adm.getMonth(), adm.getDate());
      if (lastAniv > ref) lastAniv.setFullYear(lastAniv.getFullYear() - 1);
      let m = (ref.getFullYear() - lastAniv.getFullYear()) * 12 + ref.getMonth() - lastAniv.getMonth();
      if (ref.getDate() < lastAniv.getDate()) m--;
      return Math.min(Math.max(0, m), 12);
    }
    function calcMeses13o(admStr: string, refStr: string) {
      const adm = new Date(admStr + 'T00:00:00');
      const ref = new Date(refStr + 'T00:00:00');
      const anoRef = ref.getFullYear();
      const inicioAno = new Date(anoRef, 0, 1);
      const start = adm > inicioAno ? adm : inicioAno;
      if (start > ref) return 0;
      let m = (ref.getFullYear() - start.getFullYear()) * 12 + ref.getMonth() - start.getMonth();
      if (ref.getDate() >= start.getDate()) m++;
      return Math.min(Math.max(0, m), 12);
    }
    function calcMesesServico(admStr: string, refStr: string) {
      const adm = new Date(admStr + 'T00:00:00');
      const ref = new Date(refStr + 'T00:00:00');
      return Math.max(0, (ref.getFullYear() - adm.getFullYear()) * 12 + ref.getMonth() - adm.getMonth());
    }
    function calcularRescisaoCompletaDash(p: { salarioBase: number; dataAdmissao: string; dataInicio: string; dataFim: string; tipo: string }) {
      const { salarioBase, dataAdmissao, dataInicio, dataFim, tipo } = p;
      const DIVISOR = 30;
      const salarioDia = salarioBase / DIVISOR;
      const dtFim = new Date(dataFim + 'T00:00:00');
      const dtSaida = new Date(dtFim); dtSaida.setDate(dtSaida.getDate() + 1);
      const dataSaida = dtSaida.toISOString().split('T')[0];
      const dtProj = new Date(dtFim.getFullYear(), dtFim.getMonth() + 1, 0);
      const dataProj = dtProj.toISOString().split('T')[0];
      const diasTrab = dtSaida.getDate();
      const anos = calcAnosServico(dataAdmissao, dataSaida);
      const diasExtras = calcDiasExtras(anos);
      const diasTotal = calcDiasAvisoTotal(anos);
      const saldoSalario = salarioDia * diasTrab;
      const mF = calcMesesFerias(dataAdmissao, dataProj);
      const feriasProp = (salarioBase * mF) / 12;
      const terco = feriasProp / 3;
      const totalFerias = feriasProp + terco;
      const m13 = calcMeses13o(dataAdmissao, dataProj);
      const dec13 = (salarioBase * m13) / 12;
      let avisoInd = 0;
      if (tipo === 'empregador_indenizado') avisoInd = salarioDia * diasTotal;
      else if (tipo === 'empregador_trabalhado') avisoInd = salarioDia * diasExtras;
      const mServ = calcMesesServico(dataAdmissao, dataProj);
      const fgts = salarioBase * 0.08 * mServ;
      const multa = tipo.includes('empregador') ? fgts * 0.4 : 0;
      const total = saldoSalario + totalFerias + dec13 + avisoInd + multa;
      return { total, saldoSalario, totalFerias, dec13, fgts, multa, avisoInd };
    }
    return { calcularRescisaoCompletaDash };
  })();

  // Recalcular valor de cada aviso em tempo real
  const recalculated = filteredNotices.map(n => {
    try {
      const salBase = parseBRL(n.empSalarioBase || n.salarioBase || '0');
      const admissao = n.dataAdmissao || new Date().toISOString().split('T')[0];
      if (salBase > 0 && n.dataInicio && n.dataFim && n.tipo) {
        const r = calcularRescisaoCompletaDash({ salarioBase: salBase, dataAdmissao: admissao, dataInicio: n.dataInicio, dataFim: n.dataFim, tipo: n.tipo });
        return { ...n, valorRecalculado: r.total, rescisao: r };
      }
    } catch {}
    const parseVal = (v: string | null) => { const x = parseFloat(v || '0'); return isNaN(x) ? 0 : x; };
    return { ...n, valorRecalculado: parseVal(n.valorEstimadoTotal), rescisao: null };
  });

  // Custos: apenas avisos em andamento são relevantes para previsão
  const recalcEmAndamento = recalculated.filter(n => n.status === 'em_andamento');
  const valorEmAndamento = recalcEmAndamento.reduce((s, n) => s + n.valorRecalculado, 0);
  const valorConcluido = recalculated.filter(n => n.status === 'concluido').reduce((s, n) => s + n.valorRecalculado, 0);
  const valorCancelado = recalculated.filter(n => n.status === 'cancelado').reduce((s, n) => s + n.valorRecalculado, 0);
  // Custo total = apenas em andamento (cancelados/concluídos não entram na previsão)
  const valorTotalEstimado = valorEmAndamento;

  // Distribuições: apenas avisos em andamento
  const avisosAtivos = filteredNotices.filter(n => n.status === 'em_andamento');
  const reducao2h = avisosAtivos.filter(n => n.reducaoJornada === '2h_dia').length;
  const reducao7dias = avisosAtivos.filter(n => n.reducaoJornada === '7_dias_corridos').length;
  const semReducao = avisosAtivos.filter(n => n.reducaoJornada === 'nenhuma' || !n.reducaoJornada).length;

  const porSetor: Record<string, number> = {};
  avisosAtivos.forEach(n => { const s = n.setor || 'Não informado'; porSetor[s] = (porSetor[s] || 0) + 1; });
  const setorDist = Object.entries(porSetor).map(([setor, c]) => ({ setor, count: c })).sort((a, b) => b.count - a.count);

  const porFuncao: Record<string, number> = {};
  avisosAtivos.forEach(n => { const f = n.funcao || n.cargo || 'Não informado'; porFuncao[f] = (porFuncao[f] || 0) + 1; });
  const funcaoDist = Object.entries(porFuncao).map(([funcao, c]) => ({ funcao, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Pré-popular todos os 12 meses do ano selecionado para continuidade visual
  // Evolução mensal: apenas avisos em andamento
  const porMes: Record<string, { trabalhado: number; indenizado: number }> = {};
  for (let m = 1; m <= 12; m++) {
    porMes[`${anoRef}-${String(m).padStart(2, '0')}`] = { trabalhado: 0, indenizado: 0 };
  }
  avisosAtivos.forEach(n => {
    const d = n.dataInicio ? new Date(n.dataInicio) : new Date(n.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!porMes[key]) porMes[key] = { trabalhado: 0, indenizado: 0 };
    if (n.tipo?.includes('indenizado')) porMes[key].indenizado++; else porMes[key].trabalhado++;
  });
  const evolucaoMensal = Object.entries(porMes).map(([mes, v]) => ({ mes, ...v, total: v.trabalhado + v.indenizado })).sort((a, b) => a.mes.localeCompare(b.mes));

  const diasDist: Record<number, number> = {};
  avisosAtivos.forEach(n => { const d = n.diasAviso || 30; diasDist[d] = (diasDist[d] || 0) + 1; });
  const diasAvisoDist = Object.entries(diasDist).map(([dias, c]) => ({ dias: Number(dias), count: c })).sort((a, b) => a.dias - b.dias);

  const anosDist: Record<number, number> = {};
  avisosAtivos.forEach(n => { const a = n.anosServico || 0; anosDist[a] = (anosDist[a] || 0) + 1; });
  const anosServicoDist = Object.entries(anosDist).map(([anos, c]) => ({ anos: Number(anos), count: c })).sort((a, b) => a.anos - b.anos);

  // Custo por setor: apenas avisos em andamento
  const custoSetor: Record<string, number> = {};
  recalcEmAndamento.forEach(n => { const s = n.setor || 'Não informado'; custoSetor[s] = (custoSetor[s] || 0) + n.valorRecalculado; });
  const custoPorSetor = Object.entries(custoSetor).map(([setor, valor]) => ({ setor, valor })).sort((a, b) => b.valor - a.valor);

  const hoje = new Date();
  const em7dias = new Date(hoje); em7dias.setDate(em7dias.getDate() + 7);
  const em30dias = new Date(hoje); em30dias.setDate(em30dias.getDate() + 30);
  const vencendo7dias = avisosAtivos.filter(n => { const fim = new Date(n.dataFim); return fim >= hoje && fim <= em7dias; }).length;
  const vencendo30dias = avisosAtivos.filter(n => { const fim = new Date(n.dataFim); return fim >= hoje && fim <= em30dias; }).length;

  // Breakdown de rescisão: apenas avisos em andamento
  let totalSaldoSalario = 0, totalFerias = 0, total13o = 0, totalFGTS = 0, totalMultaFGTS = 0, totalAvisoIndenizado = 0;
  recalcEmAndamento.forEach(n => {
    if (n.rescisao) {
      totalSaldoSalario += n.rescisao.saldoSalario;
      totalFerias += n.rescisao.totalFerias;
      total13o += n.rescisao.dec13;
      totalFGTS += n.rescisao.fgts;
      totalMultaFGTS += n.rescisao.multa;
      totalAvisoIndenizado += n.rescisao.avisoInd;
    } else if (n.previsaoRescisao) {
      try {
        const p = JSON.parse(n.previsaoRescisao);
        totalSaldoSalario += parseFloat(p.saldoSalario || '0');
        totalFerias += parseFloat(p.totalFerias || '0');
        total13o += parseFloat(p.decimoTerceiroProporcional || '0');
        totalFGTS += parseFloat(p.fgtsEstimado || '0');
        totalMultaFGTS += parseFloat(p.multaFGTS || '0');
        totalAvisoIndenizado += parseFloat(p.avisoPrevioIndenizado || '0');
      } catch {}
    }
  });
  const breakdownRescisao = [
    { componente: 'Saldo Salário', valor: totalSaldoSalario },
    { componente: 'Férias + 1/3', valor: totalFerias },
    { componente: '13º Proporcional', valor: total13o },
    { componente: 'FGTS', valor: totalFGTS },
    { componente: 'Multa 40% FGTS', valor: totalMultaFGTS },
    { componente: 'Aviso Indenizado', valor: totalAvisoIndenizado },
  ];

  return {
    total, emAndamento, concluidos, cancelados,
    empregadorTrabalhado, empregadorIndenizado, empregadoTrabalhado, empregadoIndenizado,
    valorTotalEstimado, valorEmAndamento, valorConcluido, valorCancelado,
    reducao2h, reducao7dias, semReducao,
    setorDist, funcaoDist, evolucaoMensal, diasAvisoDist, anosServicoDist,
    custoPorSetor, breakdownRescisao, vencendo7dias, vencendo30dias,
    avisos: recalculated.map(n => ({
      id: n.id, nomeCompleto: n.nomeCompleto || 'Funcionário não encontrado',
      tipo: n.tipo, dataInicio: n.dataInicio, dataFim: n.dataFim,
      diasAviso: n.diasAviso, anosServico: n.anosServico,
      reducaoJornada: n.reducaoJornada, salarioBase: n.salarioBase || n.empSalarioBase,
      valorEstimadoTotal: n.valorRecalculado.toFixed(2), status: n.status,
      setor: n.setor, funcao: n.funcao || n.cargo, criadoPor: n.criadoPor,
    })),
  };
}

// ============================================================
// 9. DASHBOARD FÉRIAS (análise completa)
// ============================================================
async function getDashFerias(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const anoRef = ano || new Date().getFullYear();

  // Todos os períodos de férias da empresa — filtrados pelo ano selecionado
  // Um período pertence ao ano se: o período concessivo termina naquele ano,
  // OU o período aquisitivo termina naquele ano, OU as férias foram gozadas naquele ano
  const allPeriodsRaw = await db.select({
    id: vacationPeriods.id,
    employeeId: vacationPeriods.employeeId,
    periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
    periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
    periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
    dataInicio: vacationPeriods.dataInicio,
    dataFim: vacationPeriods.dataFim,
    diasGozo: vacationPeriods.diasGozo,
    abonoPecuniario: vacationPeriods.abonoPecuniario,
    valorFerias: vacationPeriods.valorFerias,
    valorTercoConstitucional: vacationPeriods.valorTercoConstitucional,
    valorAbono: vacationPeriods.valorAbono,
    valorTotal: vacationPeriods.valorTotal,
    dataPagamento: vacationPeriods.dataPagamento,
    status: vacationPeriods.status,
    vencida: vacationPeriods.vencida,
    pagamentoEmDobro: vacationPeriods.pagamentoEmDobro,
    dataSugeridaInicio: vacationPeriods.dataSugeridaInicio,
    dataSugeridaFim: vacationPeriods.dataSugeridaFim,
    dataAlteradaPeloRh: vacationPeriods.dataAlteradaPeloRh,
    numeroPeriodo: vacationPeriods.numeroPeriodo,
    fracionamento: vacationPeriods.fracionamento,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    setor: employees.setor,
    salarioBase: employees.salarioBase,
    empStatus: employees.status,
  }).from(vacationPeriods)
    .leftJoin(employees, eq(vacationPeriods.employeeId, employees.id))
    .where(and(
      companyWhere(vacationPeriods, companyId, companyIds),
      isNull(vacationPeriods.deletedAt),
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
      isNull(employees.deletedAt),
    ))
    .orderBy(desc(vacationPeriods.createdAt));

  // Filtrar pelo ano selecionado: período pertence ao ano se:
  // - periodoAquisitivoFim cai no ano, OU
  // - periodoConcessivoFim cai no ano, OU
  // - dataInicio (gozo) cai no ano, OU
  // - dataPagamento cai no ano
  // NÃO inclui períodos antigos só porque estão vencidos
  const allPeriods = allPeriodsRaw.filter(p => {
    const getYear = (d: string | null) => d ? new Date(d + 'T00:00:00').getFullYear() : null;
    const aqFimYear = getYear(p.periodoAquisitivoFim);
    const concFimYear = getYear(p.periodoConcessivoFim);
    const inicioYear = getYear(p.dataInicio);
    const pagYear = getYear(p.dataPagamento);
    // Período aquisitivo termina no ano selecionado
    if (aqFimYear === anoRef) return true;
    // Período concessivo termina no ano selecionado
    if (concFimYear === anoRef) return true;
    // Férias foram gozadas/agendadas no ano selecionado
    if (inicioYear === anoRef) return true;
    // Pagamento foi feito no ano selecionado
    if (pagYear === anoRef) return true;
    return false;
  });

  // Recalcular valores de férias em tempo real usando salário atual
  function recalcFeriasVal(p: typeof allPeriods[0]): number {
    try {
      const sal = parseBRL(p.salarioBase || '0');
      const diasGozo = p.diasGozo || 30;
      const abono = p.abonoPecuniario ? 1 : 0;
      const diasAbono = abono ? Math.floor(diasGozo / 3) : 0;
      const diasEfetivos = diasGozo - diasAbono;
      if (sal > 0) {
        const valorFerias = (sal / 30) * diasEfetivos;
        const terco = valorFerias / 3;
        const valorAbonoPec = abono ? ((sal / 30) * diasAbono + (sal / 30) * diasAbono / 3) : 0;
        const pagDobro = p.pagamentoEmDobro === 1;
        const mult = pagDobro ? 2 : 1;
        return (valorFerias + terco + valorAbonoPec) * mult;
      }
    } catch {}
    return parseBRL(p.valorTotal || '0');
  }

  // KPIs por status
  const total = allPeriods.length;
  const pendentes = allPeriods.filter(p => p.status === 'pendente').length;
  const agendadas = allPeriods.filter(p => p.status === 'agendada').length;
  const vencidas = allPeriods.filter(p => p.status === 'vencida' || p.vencida === 1).length;
  const emGozo = allPeriods.filter(p => p.status === 'em_gozo').length;
  const concluidas = allPeriods.filter(p => p.status === 'concluida').length;
  const canceladas = allPeriods.filter(p => p.status === 'cancelada').length;

  // KPIs financeiros
  const custoTotalEstimado = allPeriods.reduce((s, p) => s + recalcFeriasVal(p), 0);
  const custoPendente = allPeriods.filter(p => p.status === 'pendente' || p.status === 'agendada').reduce((s, p) => s + recalcFeriasVal(p), 0);
  const custoVencidas = allPeriods.filter(p => p.status === 'vencida' || p.vencida === 1).reduce((s, p) => s + recalcFeriasVal(p), 0);
  const custoConcluido = allPeriods.filter(p => p.status === 'concluida').reduce((s, p) => s + recalcFeriasVal(p), 0);
  const custoEmGozo = allPeriods.filter(p => p.status === 'em_gozo').reduce((s, p) => s + recalcFeriasVal(p), 0);
  const pagamentosEmDobro = allPeriods.filter(p => p.pagamentoEmDobro === 1).length;
  const totalAbonoPecuniario = allPeriods.filter(p => p.abonoPecuniario === 1).length;

  // Distribuição por status (donut)
  const statusDist = [
    { label: 'Férias a Vencer', value: pendentes, color: '#F59E0B' },
    { label: 'Agendadas', value: agendadas, color: '#3B82F6' },
    { label: 'Vencidas', value: vencidas, color: '#EF4444' },
    { label: 'Em Gozo', value: emGozo, color: '#10B981' },
    { label: 'Concluídas', value: concluidas, color: '#6B7280' },
  ].filter(s => s.value > 0);

  // Timeline mensal: quantos colaboradores em férias por mês no ano
  const timelineMensal: { mes: string; emFerias: number; iniciando: number; finalizando: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const mesKey = `${anoRef}-${String(m).padStart(2, '0')}`;
    const mesInicio = new Date(anoRef, m - 1, 1);
    const mesFim = new Date(anoRef, m, 0);
    let emFeriasMes = 0, iniciandoMes = 0, finalizandoMes = 0;
    allPeriods.forEach(p => {
      if (!p.dataInicio || !p.dataFim) return;
      const di = new Date(p.dataInicio);
      const df = new Date(p.dataFim);
      if (di <= mesFim && df >= mesInicio) emFeriasMes++;
      if (di >= mesInicio && di <= mesFim) iniciandoMes++;
      if (df >= mesInicio && df <= mesFim) finalizandoMes++;
    });
    timelineMensal.push({ mes: mesKey, emFerias: emFeriasMes, iniciando: iniciandoMes, finalizando: finalizandoMes });
  }

  // Top setores com férias vencidas
  const setorVencidas: Record<string, number> = {};
  allPeriods.filter(p => p.status === 'vencida' || p.vencida === 1).forEach(p => {
    const s = p.setor || 'Não informado';
    setorVencidas[s] = (setorVencidas[s] || 0) + 1;
  });
  const topSetoresVencidas = Object.entries(setorVencidas).map(([setor, c]) => ({ setor, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Custo mensal projetado (por mês de pagamento ou data de início)
  const custoMensal: Record<string, number> = {};
  allPeriods.forEach(p => {
    const d = p.dataPagamento || p.dataInicio;
    if (!d) return;
    const dt = new Date(d);
    if (dt.getFullYear() !== anoRef) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    custoMensal[key] = (custoMensal[key] || 0) + recalcFeriasVal(p);
  });
  const custoMensalDist = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${anoRef}-${String(m).padStart(2, '0')}`;
    custoMensalDist.push({ mes: key, valor: custoMensal[key] || 0 });
  }

  // Férias por obra (via obra_funcionarios)
  const feriasEmpIds = Array.from(new Set(allPeriods.map(p => p.employeeId)));
  const feriasEmpAlocs = feriasEmpIds.length > 0
    ? await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
        .from(obraFuncionarios).where(and(companyWhere(obraFuncionarios, companyId, companyIds), eq(obraFuncionarios.isActive, 1)))
    : [];
  const feriasEmpObraMap = new Map(feriasEmpAlocs.map(a => [a.employeeId, a.obraId]));
  let obraNames: Record<number, string> = {};
  const obraIdsFerias = new Set(feriasEmpAlocs.map(a => a.obraId));
  if (obraIdsFerias.size > 0) {
    const obraList = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
      .where(and(companyWhere(obras, companyId, companyIds), isNull(obras.deletedAt)));
    obraList.forEach(o => { obraNames[o.id] = o.nome; });
  }
  const porObra: Record<string, { total: number; vencidas: number; pendentes: number; agendadas: number }> = {};
  allPeriods.forEach(p => {
    const empObraId = feriasEmpObraMap.get(p.employeeId);
    const obraNome = empObraId ? (obraNames[empObraId] || `Obra ${empObraId}`) : 'Sem Obra';
    if (!porObra[obraNome]) porObra[obraNome] = { total: 0, vencidas: 0, pendentes: 0, agendadas: 0 };
    porObra[obraNome].total++;
    if (p.status === 'vencida' || p.vencida === 1) porObra[obraNome].vencidas++;
    if (p.status === 'pendente') porObra[obraNome].pendentes++;
    if (p.status === 'agendada') porObra[obraNome].agendadas++;
  });
  const feriasObra = Object.entries(porObra).map(([obra, v]) => ({ obra, ...v })).sort((a, b) => b.total - a.total).slice(0, 10);

  // Proporção 1º vs 2º+ período
  const primeiroPeriodo = allPeriods.filter(p => (p.numeroPeriodo || 1) === 1).length;
  const segundoPeriodo = allPeriods.filter(p => (p.numeroPeriodo || 1) >= 2).length;

  // Fracionamento
  const fracionamento1 = allPeriods.filter(p => (p.fracionamento || 1) === 1).length;
  const fracionamento2 = allPeriods.filter(p => (p.fracionamento || 1) === 2).length;
  const fracionamento3 = allPeriods.filter(p => (p.fracionamento || 1) === 3).length;

  // Alterações pelo RH
  const totalAlteradoRH = allPeriods.filter(p => p.dataAlteradaPeloRh === 1).length;
  const totalSugerido = allPeriods.filter(p => p.dataSugeridaInicio).length;

  // Férias por setor (geral)
  const porSetor: Record<string, { total: number; vencidas: number; pendentes: number }> = {};
  allPeriods.forEach(p => {
    const s = p.setor || 'Não informado';
    if (!porSetor[s]) porSetor[s] = { total: 0, vencidas: 0, pendentes: 0 };
    porSetor[s].total++;
    if (p.status === 'vencida' || p.vencida === 1) porSetor[s].vencidas++;
    if (p.status === 'pendente') porSetor[s].pendentes++;
  });
  const setorDist = Object.entries(porSetor).map(([setor, v]) => ({ setor, ...v })).sort((a, b) => b.total - a.total).slice(0, 10);

  // Alertas: vencendo em 30 e 60 dias
  const hoje = new Date();
  const em30dias = new Date(hoje); em30dias.setDate(em30dias.getDate() + 30);
  const em60dias = new Date(hoje); em60dias.setDate(em60dias.getDate() + 60);
  const vencendo30dias = allPeriods.filter(p => {
    if (p.status !== 'pendente' && p.status !== 'agendada') return false;
    const fim = new Date(p.periodoConcessivoFim);
    return fim >= hoje && fim <= em30dias;
  }).length;
  const vencendo60dias = allPeriods.filter(p => {
    if (p.status !== 'pendente' && p.status !== 'agendada') return false;
    const fim = new Date(p.periodoConcessivoFim);
    return fim >= hoje && fim <= em60dias;
  }).length;

  // Custo por setor
  const custoSetor: Record<string, number> = {};
  allPeriods.forEach(p => {
    const s = p.setor || 'Não informado';
    custoSetor[s] = (custoSetor[s] || 0) + recalcFeriasVal(p);
  });
  const custoPorSetor = Object.entries(custoSetor).map(([setor, valor]) => ({ setor, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10);

  // Funcionários com mais períodos vencidos
  const empVencidos: Record<number, { nome: string; funcao: string; setor: string; count: number }> = {};
  allPeriods.filter(p => p.status === 'vencida' || p.vencida === 1).forEach(p => {
    if (!empVencidos[p.employeeId]) empVencidos[p.employeeId] = { nome: p.nomeCompleto || 'N/A', funcao: p.funcao || '', setor: p.setor || '', count: 0 };
    empVencidos[p.employeeId].count++;
  });
  const topFuncionariosVencidos = Object.entries(empVencidos).map(([id, v]) => ({ employeeId: Number(id), ...v })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Drill-down data: lista de férias para cada status
  const feriasLista = allPeriods.map(p => ({
    id: p.id, employeeId: p.employeeId, nomeCompleto: p.nomeCompleto || 'N/A',
    funcao: p.funcao || '', setor: p.setor || '',
    periodoAquisitivoInicio: p.periodoAquisitivoInicio, periodoAquisitivoFim: p.periodoAquisitivoFim,
    periodoConcessivoFim: p.periodoConcessivoFim,
    dataInicio: p.dataInicio, dataFim: p.dataFim, diasGozo: p.diasGozo,
    valorTotal: p.valorTotal, status: p.status, vencida: p.vencida,
    pagamentoEmDobro: p.pagamentoEmDobro, numeroPeriodo: p.numeroPeriodo,
    dataAlteradaPeloRh: p.dataAlteradaPeloRh,
  }));

  return {
    anoRef,
    kpis: { total, pendentes, agendadas, vencidas, emGozo, concluidas, canceladas },
    financeiro: { custoTotalEstimado, custoPendente, custoVencidas, custoConcluido, custoEmGozo, pagamentosEmDobro, totalAbonoPecuniario },
    statusDist, timelineMensal, topSetoresVencidas, custoMensalDist,
    feriasObra, setorDist, custoPorSetor,
    periodos: { primeiroPeriodo, segundoPeriodo },
    fracionamento: { periodo1: fracionamento1, periodo2: fracionamento2, periodo3: fracionamento3 },
    rhOverride: { totalAlteradoRH, totalSugerido },
    alertas: { vencendo30dias, vencendo60dias },
    topFuncionariosVencidos,
    feriasLista,
  };
}

// ============================================================
// DASHBOARD ANÁLISE DE PERFIL POR TEMPO DE CASA
// ============================================================
const FAIXAS_TEMPO = [
  { label: '< 3 meses', minDays: 0, maxDays: 90 },
  { label: '3-6 meses', minDays: 91, maxDays: 180 },
  { label: '6-12 meses', minDays: 181, maxDays: 365 },
  { label: '1-2 anos', minDays: 366, maxDays: 730 },
  { label: '2-5 anos', minDays: 731, maxDays: 1825 },
  { label: '5+ anos', minDays: 1826, maxDays: 999999 },
];

function getFaixaTempo(dataAdmissao: string | null): string {
  if (!dataAdmissao) return 'N/A';
  const diff = Math.floor((Date.now() - new Date(dataAdmissao).getTime()) / (1000 * 60 * 60 * 24));
  for (const f of FAIXAS_TEMPO) {
    if (diff >= f.minDays && diff <= f.maxDays) return f.label;
  }
  return '5+ anos';
}

function getFaixaEtaria(dataNascimento: string | null): string {
  if (!dataNascimento) return 'N/A';
  const age = Math.floor((Date.now() - new Date(dataNascimento).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

async function getDashPerfilTempoCasa(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;

  const allEmps = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    setor: employees.setor,
    sexo: employees.sexo,
    estadoCivil: employees.estadoCivil,
    cidade: employees.cidade,
    estado: employees.estado,
    dataAdmissao: employees.dataAdmissao,
    dataNascimento: employees.dataNascimento,
    tipoContrato: employees.tipoContrato,
    status: employees.status,
  }).from(employees).where(
    and(
      companyWhere(employees, companyId, companyIds),
      sql`${employees.deletedAt} IS NULL`,
      sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`
    )
  );

  // Buscar nomes das obras e alocações ativas
  const obrasList = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(companyWhere(obras, companyId, companyIds));
  const obraMap = new Map(obrasList.map(o => [o.id, o.nome]));
  const perfilEmpAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
    .from(obraFuncionarios).where(and(companyWhere(obraFuncionarios, companyId, companyIds), eq(obraFuncionarios.isActive, 1)));
  const perfilEmpObraMap = new Map(perfilEmpAlocs.map(a => [a.employeeId, a.obraId]));

  // Buscar advertencias count por employee
  const warnRows = await db.select({
    employeeId: warnings.employeeId,
    total: sql<number>`count(*)`,
  }).from(warnings).where(
    and(companyWhere(warnings, companyId, companyIds), sql`${warnings.deletedAt} IS NULL`)
  ).groupBy(warnings.employeeId);
  const warnMap = new Map(warnRows.map(r => [r.employeeId, Number(r.total)]));

  // Buscar atestados count por employee
  const atestRows = await db.select({
    employeeId: atestados.employeeId,
    total: sql<number>`count(*)`,
  }).from(atestados).where(
    and(companyWhere(atestados, companyId, companyIds), sql`${atestados.deletedAt} IS NULL`)
  ).groupBy(atestados.employeeId);
  const atestMap = new Map(atestRows.map(r => [r.employeeId, Number(r.total)]));

  // Agrupar por faixa de tempo
  const faixaData: Record<string, {
    total: number;
    estadoCivil: Record<string, number>;
    sexo: Record<string, number>;
    faixaEtaria: Record<string, number>;
    estado: Record<string, number>;
    cidade: Record<string, number>;
    funcao: Record<string, number>;
    setor: Record<string, number>;
    obra: Record<string, number>;
    advertencias: number;
    atestados: number;
    funcionarios: { nome: string; funcao: string; tempo: string; advertencias: number; atestados: number }[];
  }> = {};

  for (const f of FAIXAS_TEMPO) {
    faixaData[f.label] = {
      total: 0,
      estadoCivil: {}, sexo: {}, faixaEtaria: {}, estado: {}, cidade: {},
      funcao: {}, setor: {}, obra: {},
      advertencias: 0, atestados: 0,
      funcionarios: [],
    };
  }

  for (const emp of allEmps) {
    const faixa = getFaixaTempo(emp.dataAdmissao);
    if (faixa === 'N/A' || !faixaData[faixa]) continue;
    const d = faixaData[faixa];
    d.total++;

    const ec = emp.estadoCivil || 'Não informado';
    d.estadoCivil[ec] = (d.estadoCivil[ec] || 0) + 1;

    const sx = emp.sexo === 'M' ? 'Masculino' : emp.sexo === 'F' ? 'Feminino' : 'Outro';
    d.sexo[sx] = (d.sexo[sx] || 0) + 1;

    const fe = getFaixaEtaria(emp.dataNascimento);
    d.faixaEtaria[fe] = (d.faixaEtaria[fe] || 0) + 1;

    const uf = (emp.estado && emp.estado.trim()) ? emp.estado.toUpperCase() : 'Não informado';
    d.estado[uf] = (d.estado[uf] || 0) + 1;

    const cid = emp.cidade || 'Não informado';
    d.cidade[cid] = (d.cidade[cid] || 0) + 1;

    const fn = emp.funcao || 'Não informado';
    d.funcao[fn] = (d.funcao[fn] || 0) + 1;

    const st = emp.setor || 'Não informado';
    d.setor[st] = (d.setor[st] || 0) + 1;

    const empObraId = perfilEmpObraMap.get(emp.id);
    const ob = empObraId ? (obraMap.get(empObraId) || 'Sem obra') : 'Sem obra';
    d.obra[ob] = (d.obra[ob] || 0) + 1;

    const advCount = warnMap.get(emp.id) || 0;
    const atCount = atestMap.get(emp.id) || 0;
    d.advertencias += advCount;
    d.atestados += atCount;

    d.funcionarios.push({
      nome: emp.nomeCompleto || '',
      funcao: emp.funcao || '',
      tempo: faixa,
      advertencias: advCount,
      atestados: atCount,
    });
  }

  // Converter para array ordenada
  const faixas = FAIXAS_TEMPO.map(f => ({
    label: f.label,
    ...faixaData[f.label],
    estadoCivil: Object.entries(faixaData[f.label].estadoCivil).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    sexo: Object.entries(faixaData[f.label].sexo).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    faixaEtaria: Object.entries(faixaData[f.label].faixaEtaria).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    estado: Object.entries(faixaData[f.label].estado).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    cidade: Object.entries(faixaData[f.label].cidade).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    funcao: Object.entries(faixaData[f.label].funcao).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    setor: Object.entries(faixaData[f.label].setor).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
    obra: Object.entries(faixaData[f.label].obra).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value),
  }));

  return {
    totalAtivos: allEmps.length,
    faixas,
  };
}

async function getAnaliseIAPerfil(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;

  // Buscar dados do dashboard
  const dashData = await getDashPerfilTempoCasa(companyId);
  if (!dashData) return { analise: 'Dados não disponíveis.' };

  // Buscar regras de ouro da empresa
  const rules = await db.select({ titulo: goldenRules.titulo, descricao: goldenRules.descricao, categoria: goldenRules.categoria })
    .from(goldenRules)
    .where(and(companyWhere(goldenRules, companyId, companyIds), eq(goldenRules.isActive, 1), sql`${goldenRules.deletedAt} IS NULL`));

  // Buscar demitidos recentes para análise de turnover
  const demitidos = await db.select({
    funcao: employees.funcao,
    setor: employees.setor,
    sexo: employees.sexo,
    estadoCivil: employees.estadoCivil,
    estado: employees.estado,
    cidade: employees.cidade,
    dataAdmissao: employees.dataAdmissao,
    categoriaDesligamento: employees.categoriaDesligamento,
  }).from(employees).where(
    and(
      companyWhere(employees, companyId, companyIds),
      sql`${employees.deletedAt} IS NULL`,
      sql`${employees.status} = 'Demitido'`
    )
  );

  // Montar resumo para a IA
  const resumoFaixas = dashData.faixas.map(f => {
    const topEstadoCivil = f.estadoCivil.slice(0, 3).map(e => `${e.label}(${e.value})`).join(', ');
    const topFuncao = f.funcao.slice(0, 5).map(e => `${e.label}(${e.value})`).join(', ');
    const topEstado = f.estado.slice(0, 3).map(e => `${e.label}(${e.value})`).join(', ');
    const topSexo = f.sexo.map(e => `${e.label}(${e.value})`).join(', ');
    const topIdade = f.faixaEtaria.slice(0, 3).map(e => `${e.label}(${e.value})`).join(', ');
    return `Faixa "${f.label}" (${f.total} funcionários): Estado civil: ${topEstadoCivil}. Funções: ${topFuncao}. UF: ${topEstado}. Sexo: ${topSexo}. Idade: ${topIdade}. Advertências: ${f.advertencias}. Atestados: ${f.atestados}.`;
  }).join('\n');

  let resumoDemitidos = '';
  if (demitidos.length > 0) {
    const categoriasArr: string[] = [];
    const catSet = new Set<string>();
    for (const d of demitidos) { const c = d.categoriaDesligamento || 'N/A'; if (!catSet.has(c)) { catSet.add(c); categoriasArr.push(c); } }
    const funcFreq: Record<string, number> = {};
    for (const d of demitidos) { const fn = d.funcao || 'N/A'; funcFreq[fn] = (funcFreq[fn] || 0) + 1; }
    const topFuncDem = Object.entries(funcFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    resumoDemitidos = `\nDemitidos (${demitidos.length} total): Categorias: ${categoriasArr.join(', ')}. Funções mais frequentes: ${topFuncDem.join(', ')}.`;
  }

  const regrasTexto = rules.length > 0 ? `\nRegras de Ouro da empresa:\n${rules.map(r => `- [${r.categoria}] ${r.titulo}: ${r.descricao}`).join('\n')}` : '';

  const prompt = `Você é um analista de RH especializado em construção civil. Analise os dados dos funcionários agrupados por tempo de casa e forneça insights estratégicos.

Dados da empresa (${dashData.totalAtivos} funcionários ativos):
${resumoFaixas}
${resumoDemitidos}
${regrasTexto}

Forneça uma análise estruturada em JSON com exatamente este formato:
{
  "pontosPositivos": [
    { "titulo": "Título curto", "descricao": "Explicação detalhada do que aproveitar", "acaoSugerida": "Ação prática" }
  ],
  "pontosNegativos": [
    { "titulo": "Título curto", "descricao": "Explicação do que evitar ou melhorar", "acaoSugerida": "Ação prática" }
  ],
  "perfilIdeal": "Descrição do perfil ideal de contratação baseado nos padrões de retenção",
  "alertas": ["Alerta 1", "Alerta 2"]
}

Foque em:
- PONTOS POSITIVOS: O que os funcionários com mais tempo de casa têm em comum (perfil que retém bem, características a replicar nas contratações)
- PONTOS NEGATIVOS: Padrões dos que saíram rápido ou têm problemas (advertências, faltas, perfil a evitar ou trabalhar melhor no onboarding)
- Considere as Regras de Ouro da empresa se fornecidas
- Seja específico com dados e números, não genérico
- Máximo 4 pontos positivos e 4 negativos
- Responda APENAS o JSON, sem texto adicional`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: 'Você é um analista de RH especializado em construção civil brasileira. Responda sempre em português do Brasil. Retorne APENAS JSON válido.' },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'analise_perfil',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              pontosPositivos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    titulo: { type: 'string' },
                    descricao: { type: 'string' },
                    acaoSugerida: { type: 'string' },
                  },
                  required: ['titulo', 'descricao', 'acaoSugerida'],
                  additionalProperties: false,
                },
              },
              pontosNegativos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    titulo: { type: 'string' },
                    descricao: { type: 'string' },
                    acaoSugerida: { type: 'string' },
                  },
                  required: ['titulo', 'descricao', 'acaoSugerida'],
                  additionalProperties: false,
                },
              },
              perfilIdeal: { type: 'string' },
              alertas: { type: 'array', items: { type: 'string' } },
            },
            required: ['pontosPositivos', 'pontosNegativos', 'perfilIdeal', 'alertas'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = result.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      return { analise: JSON.parse(content) };
    }
    return { analise: null };
  } catch (err) {
    console.error('[IA Perfil] Erro:', err);
    return { analise: null };
  }
}

// ============================================================
// DASHBOARD CONTROLE DE DOCUMENTOS
// ============================================================
async function getDashDocumentos(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const d60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const d90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // ── ASOs ──
  const asoTotal = await db.select({ count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt)));
  const asoVencidos = await db.select({ count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} < ${today}`));
  const asoAVencer30 = await db.select({ count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d30}`));
  const asoAVencer60 = await db.select({ count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d60}`));
  const asoAVencer90 = await db.select({ count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d90}`));
  const asoPorTipo = await db.select({ tipo: asos.tipo, count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt))).groupBy(asos.tipo);
  const asoPorResultado = await db.select({ resultado: asos.resultado, count: sql<number>`count(*)` })
    .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt))).groupBy(asos.resultado);
  const asosVencidosList = await db.select({
    id: asos.id, employeeId: asos.employeeId, nome: employees.nomeCompleto, cpf: employees.cpf,
    funcao: employees.funcao, tipo: asos.tipo, dataExame: asos.dataExame, dataValidade: asos.dataValidade,
    resultado: asos.resultado, medico: asos.medico,
  }).from(asos).innerJoin(employees, eq(asos.employeeId, employees.id))
    .where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} < ${today}`, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
    .orderBy(asc(asos.dataValidade)).limit(50);
  const asosAVencerList = await db.select({
    id: asos.id, employeeId: asos.employeeId, nome: employees.nomeCompleto, cpf: employees.cpf,
    funcao: employees.funcao, tipo: asos.tipo, dataExame: asos.dataExame, dataValidade: asos.dataValidade,
    resultado: asos.resultado, medico: asos.medico,
  }).from(asos).innerJoin(employees, eq(asos.employeeId, employees.id))
    .where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d90}`, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
    .orderBy(asc(asos.dataValidade)).limit(50);
  // Funcionários ativos sem ASO válido
  const funcSemAsoValido = await db.select({ count: sql<number>`count(DISTINCT ${employees.id})` })
    .from(employees)
    .where(and(
      companyWhere(employees, companyId, companyIds), isNull(employees.deletedAt),
      sql`${employees.status} NOT IN ('Desligado','Lista_Negra')`,
      sql`${employees.id} NOT IN (SELECT employeeId FROM asos WHERE companyId IN (${sql.join((companyIds || [companyId]).map(id => sql`${id}`), sql`, `)}) AND deletedAt IS NULL AND dataValidade >= ${today})`,
    ));

  // ── TREINAMENTOS ──
  const treinTotal = await db.select({ count: sql<number>`count(*)` })
    .from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt)));
  const treinVencidos = await db.select({ count: sql<number>`count(*)` })
    .from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.dataValidade} IS NOT NULL AND ${trainings.dataValidade} < ${today}`));
  const treinAVencer30 = await db.select({ count: sql<number>`count(*)` })
    .from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.dataValidade} >= ${today} AND ${trainings.dataValidade} <= ${d30}`));
  const treinPorNorma = await db.select({ norma: trainings.norma, count: sql<number>`count(*)` })
    .from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.norma} IS NOT NULL AND ${trainings.norma} != ''`))
    .groupBy(trainings.norma).orderBy(sql`count(*) desc`).limit(10);
  const treinTop10 = await db.select({ nome: trainings.nome, count: sql<number>`count(*)` })
    .from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt)))
    .groupBy(trainings.nome).orderBy(sql`count(*) desc`).limit(10);
  const treinVencidosList = await db.select({
    id: trainings.id, employeeId: trainings.employeeId, nome: employees.nomeCompleto, cpf: employees.cpf,
    funcao: employees.funcao, treinamento: trainings.nome, norma: trainings.norma,
    dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade, instrutor: trainings.instrutor,
  }).from(trainings).innerJoin(employees, eq(trainings.employeeId, employees.id))
    .where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.dataValidade} IS NOT NULL AND ${trainings.dataValidade} < ${today}`, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
    .orderBy(asc(trainings.dataValidade)).limit(50);

  // ── ATESTADOS ──
  const atestTotal = await db.select({ count: sql<number>`count(*)` })
    .from(atestados).where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt)));
  const atestPorTipo = await db.select({ tipo: atestados.tipo, count: sql<number>`count(*)` })
    .from(atestados).where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt))).groupBy(atestados.tipo);
  const atestPorMes = await db.select({
    mes: sql<string>`TO_CHAR(${atestados.dataEmissao}, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
    diasTotal: sql<number>`COALESCE(SUM(${atestados.diasAfastamento}), 0)`,
  }).from(atestados).where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt), sql`${atestados.dataEmissao} >= CURRENT_DATE - INTERVAL '12 months'`))
    .groupBy(sql`TO_CHAR(${atestados.dataEmissao}, 'YYYY-MM')`).orderBy(sql`TO_CHAR(${atestados.dataEmissao}, 'YYYY-MM')`);

  // ── ADVERTÊNCIAS ──
  const advTotal = await db.select({ count: sql<number>`count(*)` })
    .from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt)));
  const advPorTipo = await db.select({ tipo: warnings.tipoAdvertencia, count: sql<number>`count(*)` })
    .from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt))).groupBy(warnings.tipoAdvertencia);
  const advPorMes = await db.select({
    mes: sql<string>`TO_CHAR(${warnings.dataOcorrencia}, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
  }).from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt), sql`${warnings.dataOcorrencia} >= CURRENT_DATE - INTERVAL '12 months'`))
    .groupBy(sql`TO_CHAR(${warnings.dataOcorrencia}, 'YYYY-MM')`).orderBy(sql`TO_CHAR(${warnings.dataOcorrencia}, 'YYYY-MM')`);

  // ── DOCUMENTOS PESSOAIS ──
  const docTotal = await db.select({ count: sql<number>`count(*)` })
    .from(employeeDocuments).where(companyWhere(employeeDocuments, companyId, companyIds));
  const docVencidos = await db.select({ count: sql<number>`count(*)` })
    .from(employeeDocuments).where(and(companyWhere(employeeDocuments, companyId, companyIds), sql`${employeeDocuments.dataValidade} IS NOT NULL AND ${employeeDocuments.dataValidade} < ${today}`));
  const docPorTipo = await db.select({ tipo: employeeDocuments.tipo, count: sql<number>`count(*)` })
    .from(employeeDocuments).where(companyWhere(employeeDocuments, companyId, companyIds)).groupBy(employeeDocuments.tipo);

  // ── EPIs com CA vencido ──
  const episCaVencido = await db.select({ count: sql<number>`count(*)` })
    .from(epis).where(and(companyWhere(epis, companyId, companyIds), sql`${epis.validadeCa} IS NOT NULL AND ${epis.validadeCa} < ${today}`));

  // ── RESUMO GERAL ──
  const totalAtivos = await db.select({ count: sql<number>`count(*)` })
    .from(employees).where(and(companyWhere(employees, companyId, companyIds), isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado','Lista_Negra')`));

  return {
    totalAtivos: totalAtivos[0]?.count ?? 0,
    asoTotal: asoTotal[0]?.count ?? 0,
    asoVencidos: asoVencidos[0]?.count ?? 0,
    asoAVencer30: asoAVencer30[0]?.count ?? 0,
    asoAVencer60: asoAVencer60[0]?.count ?? 0,
    asoAVencer90: asoAVencer90[0]?.count ?? 0,
    asoPorTipo, asoPorResultado, asosVencidosList, asosAVencerList,
    funcSemAsoValido: funcSemAsoValido[0]?.count ?? 0,
    treinTotal: treinTotal[0]?.count ?? 0,
    treinVencidos: treinVencidos[0]?.count ?? 0,
    treinAVencer30: treinAVencer30[0]?.count ?? 0,
    treinPorNorma, treinTop10, treinVencidosList,
    atestTotal: atestTotal[0]?.count ?? 0,
    atestPorTipo, atestPorMes,
    advTotal: advTotal[0]?.count ?? 0,
    advPorTipo, advPorMes,
    docTotal: docTotal[0]?.count ?? 0,
    docVencidos: docVencidos[0]?.count ?? 0,
    docPorTipo,
    episCaVencido: episCaVencido[0]?.count ?? 0,
  };
}

// ============================================================
// DASHBOARD CONTROLE DE DOCUMENTOS
// ============================================================
async function getDashControleDocumentos(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const d60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const d90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // ── FUNCIONÁRIOS ATIVOS ──
  const ativosRows = await db.select({
    id: employees.id, nomeCompleto: employees.nomeCompleto, cpf: employees.cpf,
    funcao: employees.funcao, setor: employees.setor, status: employees.status,
    validadeCnh: employees.validadeCnh,
  }).from(employees).where(and(
    companyWhere(employees, companyId, companyIds), isNull(employees.deletedAt),
    sql`${employees.status} NOT IN ('Desligado','Lista_Negra')`,
  ));
  const totalAtivos = ativosRows.length;

  // ── ASOs ──
  const allAsos = await db.select({
    id: asos.id, employeeId: asos.employeeId, tipo: asos.tipo,
    dataExame: asos.dataExame, dataValidade: asos.dataValidade,
    resultado: asos.resultado, medico: asos.medico,
  }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt)));

  // Último ASO válido por funcionário
  const lastAsoMap = new Map<number, typeof allAsos[0]>();
  for (const a of allAsos) {
    const existing = lastAsoMap.get(a.employeeId);
    if (!existing || (a.dataExame > existing.dataExame)) {
      lastAsoMap.set(a.employeeId, a);
    }
  }

  const asoTotal = allAsos.length;
  const asoVencidos = allAsos.filter(a => a.dataValidade && a.dataValidade < today).length;
  const asoAVencer30 = allAsos.filter(a => a.dataValidade && a.dataValidade >= today && a.dataValidade <= d30).length;
  const asoAVencer60 = allAsos.filter(a => a.dataValidade && a.dataValidade >= today && a.dataValidade <= d60).length;
  const asoAVencer90 = allAsos.filter(a => a.dataValidade && a.dataValidade >= today && a.dataValidade <= d90).length;
  const asoEmDia = allAsos.filter(a => a.dataValidade && a.dataValidade > d90).length;

  // Funcionários ativos sem ASO válido
  const funcSemAso: number[] = [];
  for (const emp of ativosRows) {
    const lastAso = lastAsoMap.get(emp.id);
    if (!lastAso || !lastAso.dataValidade || lastAso.dataValidade < today) {
      funcSemAso.push(emp.id);
    }
  }

  // ── TREINAMENTOS ──
  const allTrein = await db.select({
    id: trainings.id, employeeId: trainings.employeeId, nome: trainings.nome,
    norma: trainings.norma, dataRealizacao: trainings.dataRealizacao,
    dataValidade: trainings.dataValidade, instrutor: trainings.instrutor,
  }).from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt)));

  const treinTotal = allTrein.length;
  const treinVencidos = allTrein.filter(t => t.dataValidade && t.dataValidade < today).length;
  const treinAVencer30 = allTrein.filter(t => t.dataValidade && t.dataValidade >= today && t.dataValidade <= d30).length;
  const treinAVencer60 = allTrein.filter(t => t.dataValidade && t.dataValidade >= today && t.dataValidade <= d60).length;
  const treinAVencer90 = allTrein.filter(t => t.dataValidade && t.dataValidade >= today && t.dataValidade <= d90).length;
  const treinEmDia = allTrein.filter(t => !t.dataValidade || t.dataValidade > d90).length;

  // ── DOCUMENTOS PESSOAIS ──
  const allDocs = await db.select({
    id: employeeDocuments.id, employeeId: employeeDocuments.employeeId,
    tipo: employeeDocuments.tipo, nome: employeeDocuments.nome,
    dataValidade: employeeDocuments.dataValidade, createdAt: employeeDocuments.createdAt,
  }).from(employeeDocuments).where(and(
    companyWhere(employeeDocuments, companyId, companyIds),
    sql`${employeeDocuments.deletedAt} IS NULL`,
  ));

  const docTotal = allDocs.length;
  const docComValidade = allDocs.filter(d => d.dataValidade);
  const docVencidos = docComValidade.filter(d => d.dataValidade! < today).length;
  const docAVencer30 = docComValidade.filter(d => d.dataValidade! >= today && d.dataValidade! <= d30).length;
  const docAVencer60 = docComValidade.filter(d => d.dataValidade! >= today && d.dataValidade! <= d60).length;
  const docAVencer90 = docComValidade.filter(d => d.dataValidade! >= today && d.dataValidade! <= d90).length;

  // Docs por tipo
  const docPorTipoMap = new Map<string, number>();
  for (const d of allDocs) { docPorTipoMap.set(d.tipo, (docPorTipoMap.get(d.tipo) || 0) + 1); }
  const docPorTipo = Array.from(docPorTipoMap.entries()).map(([tipo, count]) => ({ tipo, count })).sort((a, b) => b.count - a.count);

  // ── CNH (do cadastro do funcionário) ──
  const cnhAtivos = ativosRows.filter(e => e.validadeCnh);
  const cnhVencidas = cnhAtivos.filter(e => e.validadeCnh! < today).length;
  const cnhAVencer30 = cnhAtivos.filter(e => e.validadeCnh! >= today && e.validadeCnh! <= d30).length;
  const cnhAVencer60 = cnhAtivos.filter(e => e.validadeCnh! >= today && e.validadeCnh! <= d60).length;
  const cnhAVencer90 = cnhAtivos.filter(e => e.validadeCnh! >= today && e.validadeCnh! <= d90).length;

  // ── OBRAS (para filtro) ──
  const obrasRows = await db.select({ id: obras.id, nome: obras.nome })
    .from(obras).where(and(companyWhere(obras, companyId, companyIds), isNull(obras.deletedAt)));

  // Alocações ativas
  const alocacoes = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
    .from(obraFuncionarios).where(and(
      companyWhere(obraFuncionarios, companyId, companyIds),
      eq(obraFuncionarios.isActive, 1),
    ));
  const empObraMap = new Map<number, number>();
  for (const a of alocacoes) empObraMap.set(a.employeeId, a.obraId);

  // ── CONSOLIDAR: Totais gerais ──
  const totalDocumentos = asoTotal + treinTotal + docTotal + cnhAtivos.length;
  const totalVencidos = asoVencidos + treinVencidos + docVencidos + cnhVencidas;
  const totalAVencer30 = asoAVencer30 + treinAVencer30 + docAVencer30 + cnhAVencer30;
  const totalAVencer90 = asoAVencer90 + treinAVencer90 + docAVencer90 + cnhAVencer90;
  const totalEmDia = totalDocumentos - totalVencidos - totalAVencer90;
  const compliance = totalDocumentos > 0 ? ((totalDocumentos - totalVencidos) / totalDocumentos * 100) : 100;

  // ── STATUS POR CATEGORIA (para gráfico empilhado) ──
  const statusPorCategoria = [
    { categoria: 'ASO', vencidos: asoVencidos, aVencer30: asoAVencer30, aVencer60: asoAVencer60 - asoAVencer30, aVencer90: asoAVencer90 - asoAVencer60, emDia: asoEmDia },
    { categoria: 'Treinamentos', vencidos: treinVencidos, aVencer30: treinAVencer30, aVencer60: treinAVencer60 - treinAVencer30, aVencer90: treinAVencer90 - treinAVencer60, emDia: treinEmDia },
    { categoria: 'Docs Pessoais', vencidos: docVencidos, aVencer30: docAVencer30, aVencer60: docAVencer60 - docAVencer30, aVencer90: docAVencer90 - docAVencer60, emDia: docComValidade.length - docVencidos - docAVencer90 },
    { categoria: 'CNH', vencidos: cnhVencidas, aVencer30: cnhAVencer30, aVencer60: cnhAVencer60 - cnhAVencer30, aVencer90: cnhAVencer90 - cnhAVencer60, emDia: cnhAtivos.length - cnhVencidas - cnhAVencer90 },
  ];

  // ── TIMELINE DE VENCIMENTOS (próximos 90 dias, agrupados por semana) ──
  const timeline: { semana: string; asos: number; treinamentos: number; docs: number; cnhs: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const weekStart = new Date(Date.now() + i * 7 * 86400000);
    const weekEnd = new Date(Date.now() + (i + 1) * 7 * 86400000);
    const ws = weekStart.toISOString().slice(0, 10);
    const we = weekEnd.toISOString().slice(0, 10);
    const label = weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    timeline.push({
      semana: label,
      asos: allAsos.filter(a => a.dataValidade && a.dataValidade >= ws && a.dataValidade < we).length,
      treinamentos: allTrein.filter(t => t.dataValidade && t.dataValidade >= ws && t.dataValidade < we).length,
      docs: docComValidade.filter(d => d.dataValidade! >= ws && d.dataValidade! < we).length,
      cnhs: cnhAtivos.filter(e => e.validadeCnh! >= ws && e.validadeCnh! < we).length,
    });
  }

  // ── LISTA CONSOLIDADA DE VENCIDOS + A VENCER (para tabela) ──
  const empMap = new Map(ativosRows.map(e => [e.id, e]));
  type AlertaDoc = {
    id: number; employeeId: number; funcionarioNome: string; cpf: string;
    funcao: string; setor: string; obraId: number | null; obraNome: string;
    categoria: string; tipo: string; dataValidade: string;
    diasParaVencer: number; status: 'vencido' | 'critico' | 'alerta' | 'atencao';
  };
  const alertas: AlertaDoc[] = [];
  const calcDias = (dv: string) => Math.ceil((new Date(dv + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
  const getStatus = (dias: number): 'vencido' | 'critico' | 'alerta' | 'atencao' => {
    if (dias < 0) return 'vencido';
    if (dias <= 30) return 'critico';
    if (dias <= 60) return 'alerta';
    return 'atencao';
  };
  const getObraNome = (empId: number) => {
    const obraId = empObraMap.get(empId);
    if (!obraId) return '—';
    return obrasRows.find(o => o.id === obraId)?.nome || '—';
  };

  // ASOs vencidos/a vencer
  for (const a of allAsos) {
    if (!a.dataValidade || a.dataValidade > d90) continue;
    const emp = empMap.get(a.employeeId);
    if (!emp) continue;
    const dias = calcDias(a.dataValidade);
    alertas.push({
      id: a.id, employeeId: a.employeeId, funcionarioNome: emp.nomeCompleto, cpf: emp.cpf || '',
      funcao: emp.funcao || '', setor: emp.setor || '', obraId: empObraMap.get(a.employeeId) ?? null,
      obraNome: getObraNome(a.employeeId), categoria: 'ASO', tipo: a.tipo,
      dataValidade: a.dataValidade, diasParaVencer: dias, status: getStatus(dias),
    });
  }

  // Treinamentos vencidos/a vencer
  for (const t of allTrein) {
    if (!t.dataValidade || t.dataValidade > d90) continue;
    const emp = empMap.get(t.employeeId);
    if (!emp) continue;
    const dias = calcDias(t.dataValidade);
    alertas.push({
      id: t.id, employeeId: t.employeeId, funcionarioNome: emp.nomeCompleto, cpf: emp.cpf || '',
      funcao: emp.funcao || '', setor: emp.setor || '', obraId: empObraMap.get(t.employeeId) ?? null,
      obraNome: getObraNome(t.employeeId), categoria: 'Treinamento', tipo: t.norma || t.nome,
      dataValidade: t.dataValidade, diasParaVencer: dias, status: getStatus(dias),
    });
  }

  // Docs pessoais vencidos/a vencer
  for (const d of docComValidade) {
    if (d.dataValidade! > d90) continue;
    const emp = empMap.get(d.employeeId);
    if (!emp) continue;
    const dias = calcDias(d.dataValidade!);
    alertas.push({
      id: d.id, employeeId: d.employeeId, funcionarioNome: emp.nomeCompleto, cpf: emp.cpf || '',
      funcao: emp.funcao || '', setor: emp.setor || '', obraId: empObraMap.get(d.employeeId) ?? null,
      obraNome: getObraNome(d.employeeId), categoria: 'Doc. Pessoal', tipo: d.tipo.toUpperCase(),
      dataValidade: d.dataValidade!, diasParaVencer: dias, status: getStatus(dias),
    });
  }

  // CNH vencidas/a vencer
  for (const e of cnhAtivos) {
    if (e.validadeCnh! > d90) continue;
    const dias = calcDias(e.validadeCnh!);
    alertas.push({
      id: e.id, employeeId: e.id, funcionarioNome: e.nomeCompleto, cpf: e.cpf || '',
      funcao: e.funcao || '', setor: e.setor || '', obraId: empObraMap.get(e.id) ?? null,
      obraNome: getObraNome(e.id), categoria: 'CNH', tipo: 'CNH',
      dataValidade: e.validadeCnh!, diasParaVencer: dias, status: getStatus(dias),
    });
  }

  // Ordenar por dias para vencer (mais urgente primeiro)
  alertas.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

  // ── FUNCIONÁRIOS COM DOCUMENTAÇÃO INCOMPLETA ──
  type FuncIncompleto = {
    employeeId: number; funcionarioNome: string; cpf: string;
    funcao: string; setor: string; obraNome: string;
    semAso: boolean; asoVencido: boolean;
    treinVencidos: number; docsVencidos: number; cnhVencida: boolean;
    totalPendencias: number;
  };
  const funcIncompletos: FuncIncompleto[] = [];
  for (const emp of ativosRows) {
    const lastAso = lastAsoMap.get(emp.id);
    const semAso = !lastAso;
    const asoVenc = lastAso ? (lastAso.dataValidade ? lastAso.dataValidade < today : false) : false;
    const treinVenc = allTrein.filter(t => t.employeeId === emp.id && t.dataValidade && t.dataValidade < today).length;
    const docsVenc = docComValidade.filter(d => d.employeeId === emp.id && d.dataValidade! < today).length;
    const cnhVenc = emp.validadeCnh ? emp.validadeCnh < today : false;
    const totalPend = (semAso ? 1 : 0) + (asoVenc ? 1 : 0) + treinVenc + docsVenc + (cnhVenc ? 1 : 0);
    if (totalPend > 0) {
      funcIncompletos.push({
        employeeId: emp.id, funcionarioNome: emp.nomeCompleto, cpf: emp.cpf || '',
        funcao: emp.funcao || '', setor: emp.setor || '', obraNome: getObraNome(emp.id),
        semAso, asoVencido: asoVenc, treinVencidos: treinVenc, docsVencidos: docsVenc,
        cnhVencida: cnhVenc, totalPendencias: totalPend,
      });
    }
  }
  funcIncompletos.sort((a, b) => b.totalPendencias - a.totalPendencias);

  // ── TREINAMENTOS POR NORMA (top 10 mais realizados) ──
  const treinPorNormaMap = new Map<string, { total: number; vencidos: number }>(); 
  for (const t of allTrein) {
    const key = t.norma || t.nome;
    const existing = treinPorNormaMap.get(key) || { total: 0, vencidos: 0 };
    existing.total++;
    if (t.dataValidade && t.dataValidade < today) existing.vencidos++;
    treinPorNormaMap.set(key, existing);
  }
  const treinPorNorma = Array.from(treinPorNormaMap.entries())
    .map(([norma, v]) => ({ norma, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    totalAtivos,
    totalDocumentos,
    totalVencidos,
    totalAVencer30,
    totalAVencer90,
    totalEmDia,
    compliance: Math.round(compliance * 10) / 10,
    // ASOs
    asoTotal, asoVencidos, asoAVencer30, asoAVencer90, asoEmDia,
    funcSemAso: funcSemAso.length,
    // Treinamentos
    treinTotal, treinVencidos, treinAVencer30, treinAVencer90, treinEmDia,
    treinPorNorma,
    // Docs pessoais
    docTotal, docVencidos, docAVencer30, docAVencer90, docPorTipo,
    // CNH
    cnhTotal: cnhAtivos.length, cnhVencidas, cnhAVencer30, cnhAVencer90,
    // Gráficos
    statusPorCategoria,
    timeline,
    // Tabelas
    alertas,
    funcIncompletos,
    // Obras (para filtro)
    obras: obrasRows,
  };
}

// ============================================================
// ROUTER
// ============================================================
// ============================================================
// DASHBOARD COMPETÊNCIAS ANUAL
// ============================================================
async function getDashCompetenciasAnual(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const year = ano || new Date().getFullYear();

  // All periods for the year
  const periods = ((await db.execute(sql`
    SELECT * FROM payroll_periods 
    WHERE "companyId" = ${companyId} AND "mesReferencia" LIKE ${year + '%'}
    ORDER BY "mesReferencia" ASC
  `)) as any).rows || [];

  // Monthly payment summaries
  const monthlySums = ((await db.execute(sql`
    SELECT "mesReferencia",
      COUNT(*) as "totalFuncionarios",
      SUM(CAST("salarioBrutoMes" AS DECIMAL(12,2))) as "totalBruto",
      SUM(CAST("horasExtrasValor" AS DECIMAL(12,2))) as "totalHE",
      SUM(CAST("totalDescontos" AS DECIMAL(12,2))) as "totalDescontos",
      SUM(CAST("salarioLiquido" AS DECIMAL(12,2))) as "totalLiquido",
      SUM(CAST(COALESCE("vaValor",'0') AS DECIMAL(12,2))) as "totalVA",
      SUM(CAST(COALESCE("vtValor",'0') AS DECIMAL(12,2))) as "totalVT",
      SUM(CAST(COALESCE("vrValor",'0') AS DECIMAL(12,2))) as "totalVR",
      SUM(CAST(COALESCE("fgtsValor",'0') AS DECIMAL(12,2))) as "totalFGTS",
      SUM(CAST(COALESCE("inssValor",'0') AS DECIMAL(12,2))) as "totalINSS",
      SUM(CAST(COALESCE("seguroVidaValor",'0') AS DECIMAL(12,2))) as "totalSeguro",
      SUM(CAST("descontoAdiantamento" AS DECIMAL(12,2))) as "totalAdiantamento",
      SUM(CAST("descontoFaltas" AS DECIMAL(12,2))) as "totalDescontoFaltas",
      SUM("descontoFaltasQtd") as "totalFaltasQtd"
    FROM payroll_payments
    WHERE "companyId" = ${companyId} AND "mesReferencia" LIKE ${year + '%'}
    GROUP BY "mesReferencia"
    ORDER BY "mesReferencia" ASC
  `)) as any).rows || [];

  // Inconsistencies summary per month
  const inconsistencias = ((await db.execute(sql`
    SELECT "mesCompetencia",
      COUNT(*) as total,
      SUM(CASE WHEN "isInconsistente" = true THEN 1 ELSE 0 END) as inconsistentes,
      SUM(CASE WHEN "inconsistenciaResolvida" = true THEN 1 ELSE 0 END) as resolvidas
    FROM timecard_daily
    WHERE "companyId" = ${companyId} AND "mesCompetencia" LIKE ${year + '%'}
    GROUP BY "mesCompetencia"
    ORDER BY "mesCompetencia" ASC
  `)) as any).rows || [];

  // Cost per obra (annual)
  const custoObra = ((await db.execute(sql`
    SELECT o.nome as "obraNome", o.id as "obraId",
      COUNT(DISTINCT td."employeeId") as funcionarios,
      COUNT(DISTINCT td.data) as "diasTrabalhados",
      SUM(CAST(COALESCE(td."totalHorasNormais",'0') AS DECIMAL(10,2))) as "horasNormais",
      SUM(CAST(COALESCE(td."totalHorasExtras",'0') AS DECIMAL(10,2))) as "horasExtras"
    FROM timecard_daily td
    LEFT JOIN obras o ON td."obraId" = o.id
    WHERE td."companyId" IN (${sql.join((companyIds || [companyId]).map(id => sql`${id}`), sql`, `)}) AND td."mesCompetencia" LIKE ${year + '%'}
    AND td."obraId" IS NOT NULL
    GROUP BY o.id, o.nome
    ORDER BY "horasNormais" DESC
  `)) as any).rows || [];

  // Totals
  const totalBrutoAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalBruto || 0), 0);
  const totalLiquidoAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalLiquido || 0), 0);
  const totalDescontosAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalDescontos || 0), 0);
  const totalFGTSAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalFGTS || 0), 0);
  const totalINSSAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalINSS || 0), 0);
  const totalVAAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalVA || 0), 0);
  const totalVTAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalVT || 0), 0);
  const totalVRAnual = (monthlySums || []).reduce((s: number, r: any) => s + Number(r.totalVR || 0), 0);

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  return {
    ano: year,
    kpis: {
      totalBrutoAnual,
      totalLiquidoAnual,
      totalDescontosAnual,
      totalFGTSAnual,
      totalINSSAnual,
      totalBeneficiosAnual: totalVAAnual + totalVTAnual + totalVRAnual,
      competenciasAbertas: (periods || []).filter((p: any) => !['travada','consolidada'].includes(p.status)).length,
      competenciasFechadas: (periods || []).filter((p: any) => ['travada','consolidada'].includes(p.status)).length,
    },
    periodos: (periods || []).map((p: any) => {
      const [, m] = (p.mesReferencia || '').split('-');
      return {
        mesReferencia: p.mesReferencia,
        mesLabel: meses[parseInt(m) - 1] || m,
        status: p.status,
        totalFuncionarios: p.totalFuncionarios,
        totalBruto: p.totalSalarioBruto,
        totalLiquido: p.totalLiquido,
        totalDescontos: p.totalDescontos,
      };
    }),
    evolucaoMensal: (monthlySums || []).map((r: any) => {
      const [, m] = (r.mesReferencia || '').split('-');
      return {
        mes: meses[parseInt(m) - 1] || m,
        mesRef: r.mesReferencia,
        bruto: Number(r.totalBruto || 0),
        liquido: Number(r.totalLiquido || 0),
        descontos: Number(r.totalDescontos || 0),
        he: Number(r.totalHE || 0),
        fgts: Number(r.totalFGTS || 0),
        inss: Number(r.totalINSS || 0),
        va: Number(r.totalVA || 0),
        vt: Number(r.totalVT || 0),
        vr: Number(r.totalVR || 0),
        funcionarios: Number(r.totalFuncionarios || 0),
        faltasQtd: Number(r.totalFaltasQtd || 0),
      };
    }),
    inconsistencias: (inconsistencias || []).map((r: any) => {
      const [, m] = (r.mesCompetencia || '').split('-');
      return {
        mes: meses[parseInt(m) - 1] || m,
        total: Number(r.total || 0),
        inconsistentes: Number(r.inconsistentes || 0),
        resolvidas: Number(r.resolvidas || 0),
      };
    }),
    custoObra: (custoObra || []).map((r: any) => ({
      obraId: r.obraId,
      obraNome: r.obraNome || 'Sem nome',
      funcionarios: Number(r.funcionarios || 0),
      diasTrabalhados: Number(r.diasTrabalhados || 0),
      horasNormais: Number(r.horasNormais || 0),
      horasExtras: Number(r.horasExtras || 0),
    })),
  };
}

export const dashboardsRouter = router({
  funcionarios: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFuncionarios(input.companyId, input.companyIds)),
  drillDown: protectedProcedure.input(z.object({ companyId: z.number(), filterType: z.string(), filterValue: z.string(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDrillDown(input.companyId, input.filterType, input.filterValue, input.companyIds)),
  cartaoPonto: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashCartaoPonto(input.companyId, input.mesReferencia, input.companyIds)),
  folhaPagamento: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFolhaPagamento(input.companyId, input.mesReferencia, input.companyIds)),
  horasExtras: protectedProcedure.input(z.object({
    companyId: z.number(),
    year: z.number().optional(),
    month: z.number().optional(),
    obraId: z.number().optional(),
    employeeId: z.number().optional(),
    periodoTipo: z.enum(['ano','semestre','trimestre','mes','semana','dia']).optional(),
    periodoValor: z.string().optional(),
    companyIds: z.array(z.number()).optional(),
  })).query(({ input }) => getDashHorasExtras(input.companyId, input.year, input, input.companyIds)),
  epis: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashEpis(input.companyId, input.companyIds)),
  juridico: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashJuridico(input.companyId, input.companyIds)),
  avisoPrevio: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashAvisoPrevio(input.companyId, input.ano, input.companyIds)),
  ferias: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFerias(input.companyId, input.ano, input.companyIds)),
  perfilTempoCasa: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashPerfilTempoCasa(input.companyId, input.companyIds)),
  analiseIAPerfil: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).mutation(({ input }) => getAnaliseIAPerfil(input.companyId, input.companyIds)),
  documentos: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashDocumentos(input.companyId, input.companyIds)),
  controleDocumentos: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashControleDocumentos(input.companyId, input.companyIds)),
  competenciasAnual: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashCompetenciasAnual(input.companyId, input.ano, input.companyIds)),
});
