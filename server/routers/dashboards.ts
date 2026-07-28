import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getConstrutorasIds, userCanSeeAvisoStatus } from "../db";
import { memCache, TTL } from "../services/memCache";
import {
  employees, extraPayments, payroll, timeRecords, warnings, atestados,
  epis, epiDeliveries, processosTrabalhistas, processosAndamentos,
  processosTributarios, processosCivis,
  monthlyPayrollSummary, obraHorasRateio, obras, folhaLancamentos, folhaItens,
  epiDiscountAlerts, terminationNotices, vacationPeriods, goldenRules,
  asos, trainings, employeeDocuments, obraFuncionarios,
  hePeriods, hePeriodEmployees,
  parceirosConveniados, lancamentosParceiros, pagamentosParceiros,
  cipaMembers, cipaElections,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count, asc, isNull, inArray } from "drizzle-orm";
import { parseBRL } from "../utils/parseBRL";
import { calcularRescisaoCompleta, calcularRescisaoComplementar, calcularDiasAvisoTotal, calcularDiasAviso, calcularDescontosRescisao, calcularIndenizacaoEstabilidade, type DescontosRescisaoContext } from "../utils/rescisaoCalc";
import { carregarMultaFgtsPorEmpresa } from "../utils/rescisaoMultaCfg";
import { invokeLLM } from "../_core/llm";
// Rev. 4695 — Dashboard Parceiros agrupa pelo MESMO ciclo de competência da
// tela de Lançamentos (16→15 configurável por empresa), não por mês-calendário.
import { competenciaFromDataCompra, getDiaCorteParaEmpresa } from "./parceiros";

const DESLIGADO_STATUSES = ['Desligado', 'Lista_Negra'];
function isDesligadoStatus(status?: string | null): boolean {
  return !!status && DESLIGADO_STATUSES.includes(status);
}

/** Chave de agrupamento de cidades: minúsculo + sem acentos */
const cidadeNormKey = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Title case preservando acentos: "GUARATINGUETÁ" → "Guaratinguetá" */
const cidadeDisplay = (s: string) =>
  s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
/** Dado dois nomes para a mesma cidade, prefere o que contém acentos */
const preferAccented = (a: string, b: string) => {
  const hasAcc = (x: string) => x !== x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (hasAcc(b) && !hasAcc(a)) ? b : a;
};
/** Mescla uma lista {label, value} de cidades por chave normalizada (sem acento, sem caixa) */
function mergeCidadesAccent(rows: { label: string; value: number }[]): { label: string; value: number }[] {
  const keyMap = new Map<string, { display: string; value: number }>();
  for (const r of rows) {
    const key     = cidadeNormKey(r.label);
    const display = cidadeDisplay(r.label);
    const existing = keyMap.get(key);
    if (existing) {
      existing.value += r.value;
      existing.display = preferAccented(existing.display, display);
    } else {
      keyMap.set(key, { display, value: r.value });
    }
  }
  return [...keyMap.values()]
    .map(({ display, value }) => ({ label: display, value }))
    .sort((a, b) => b.value - a.value);
}

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
async function getDashFuncionarios(companyId: number, companyIds?: number[], ano?: number) {
  const db = await getDb();
  if (!db) return null;

  // Rev. 2626 — Dashboard year-aware (snapshot do "Ano de análise").
  // Ano atual = mantém régua de status atual (zero regressão na visão padrão).
  // Ano passado = snapshot ponto-no-tempo via datas de admissão/demissão (fim do ano).
  const currentYear = new Date().getFullYear();
  const refY = ano && ano > 0 ? ano : currentYear;
  const isCurrentYear = refY === currentYear;
  const today = new Date().toISOString().split('T')[0];
  const refDate = isCurrentYear ? today : `${refY}-12-31`;     // data de referência (ponto-no-tempo)
  const yearStart = `${refY}-01-01`;                            // início do ano de análise
  const yearEndEvt = isCurrentYear ? today : `${refY}-12-31`;   // fim da janela de eventos do ano
  const refDateLit = sql.raw(`'${refDate}'::date`);            // literal (igual em SELECT e GROUP BY)

  const baseWhere = and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`);
  // "Ativo" = por status (ano atual) OU empregado na data de referência (ano passado)
  const activeWhere = isCurrentYear
    ? and(baseWhere, sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`)
    : and(baseWhere,
        sql`${employees.dataAdmissao} IS NOT NULL AND ${employees.dataAdmissao}::date <= ${refDate}::date`,
        sql`(${employees.dataDemissao} IS NULL OR ${employees.dataDemissao}::date > ${refDate}::date)`);

  // Executar todas as queries em paralelo para máxima performance
  let queryResults: any[];
  try {
    queryResults = await Promise.all([
    // 1. Status distribution (usado só p/ ano atual)
    db.select({ status: employees.status, count: sql<number>`count(*)` })
      .from(employees).where(baseWhere).groupBy(employees.status),

    // 2. Férias em gozo (cross-reference — usado só p/ ano atual)
    db.select({ employeeId: vacationPeriods.employeeId })
      .from(vacationPeriods)
      .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
      .where(and(
        companyWhere(vacationPeriods, companyId, companyIds),
        isNull(vacationPeriods.deletedAt), isNull(employees.deletedAt),
        sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
        sql`${employees.status} != 'Ferias'`,
        // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
        sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        sql`(${vacationPeriods.status} = 'em_gozo' OR (${vacationPeriods.status} = 'agendada' AND ${vacationPeriods.dataInicio} IS NOT NULL AND ${vacationPeriods.dataFim} IS NOT NULL AND ${vacationPeriods.dataInicio} <= ${today} AND ${vacationPeriods.dataFim} >= ${today}))`,
      )),

    // 3. Gênero
    db.select({ sexo: employees.sexo, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.sexo),

    // 4. Por setor (top 10)
    db.select({ setor: employees.setor, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.setor)
      .orderBy(sql`count(*) desc`).limit(10),

    // 5. Por função (top 10)
    db.select({ funcao: employees.funcao, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.funcao)
      .orderBy(sql`count(*) desc`).limit(10),

    // 6. Por tipo de contrato
    db.select({ tipo: employees.tipoContrato, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.tipoContrato),

    // 7. Por estado civil
    db.select({ estadoCivil: employees.estadoCivil, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.estadoCivil),

    // 8. Por cidade (top 10) — normalizado: INITCAP(LOWER()) para ignorar maiúsculas/minúsculas
    db.select({ cidade: sql<string>`INITCAP(LOWER(${employees.cidade}))`, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere)
      .groupBy(sql`INITCAP(LOWER(${employees.cidade}))`)
      .orderBy(sql`count(*) desc`).limit(10),

    // 9. Pirâmide etária (idade na data de referência)
    db.select({
      faixa: sql<string>`CASE 
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 21 THEN '14-20'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 26 THEN '21-25'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 31 THEN '26-30'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 41 THEN '31-40'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 51 THEN '41-50'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 61 THEN '51-60'
        ELSE '61+' END`,
      sexo: employees.sexo,
      count: sql<number>`count(*)`,
    }).from(employees)
      .where(and(activeWhere, sql`"dataNascimento" IS NOT NULL`))
      .groupBy(sql`CASE WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 21 THEN '14-20' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 26 THEN '21-25' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 31 THEN '26-30' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 41 THEN '31-40' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 51 THEN '41-50' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataNascimento")) < 61 THEN '51-60' ELSE '61+' END`, employees.sexo),

    // 10. Tempo de empresa (na data de referência)
    db.select({
      faixa: sql<string>`CASE 
        WHEN (EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(${refDateLit}, "dataAdmissao"))) < 3 THEN '< 3 meses'
        WHEN (EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(${refDateLit}, "dataAdmissao"))) < 6 THEN '3-6 meses'
        WHEN (EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(${refDateLit}, "dataAdmissao"))) < 12 THEN '6-12 meses'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) < 2 THEN '1-2 anos'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) < 5 THEN '2-5 anos'
        WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) < 10 THEN '5-10 anos'
        ELSE '10+ anos' END`,
      count: sql<number>`count(*)`,
    }).from(employees)
      .where(and(activeWhere, sql`"dataAdmissao" IS NOT NULL`))
      .groupBy(sql`CASE WHEN (EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(${refDateLit}, "dataAdmissao"))) < 3 THEN '< 3 meses' WHEN (EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(${refDateLit}, "dataAdmissao"))) < 6 THEN '3-6 meses' WHEN (EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) * 12 + EXTRACT(MONTH FROM AGE(${refDateLit}, "dataAdmissao"))) < 12 THEN '6-12 meses' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) < 2 THEN '1-2 anos' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) < 5 THEN '2-5 anos' WHEN EXTRACT(YEAR FROM AGE(${refDateLit}, "dataAdmissao")) < 10 THEN '5-10 anos' ELSE '10+ anos' END`),

    // 11. Por estado
    db.select({ estado: employees.estado, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.estado).orderBy(sql`count(*) desc`),

    // 12. Admissões por mês (ano de análise)
    db.select({ mes: sql<string>`TO_CHAR("dataAdmissao", 'YYYY-MM')`, count: sql<number>`count(*)` })
      .from(employees)
      .where(and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`, sql`"dataAdmissao"::date BETWEEN ${yearStart}::date AND ${yearEndEvt}::date`))
      .groupBy(sql`TO_CHAR("dataAdmissao", 'YYYY-MM')`).orderBy(sql`TO_CHAR("dataAdmissao", 'YYYY-MM')`),

    // 13. Demissões por mês (ano de análise)
    db.select({ mes: sql<string>`TO_CHAR("dataDemissao", 'YYYY-MM')`, count: sql<number>`count(*)` })
      .from(employees)
      .where(and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`, sql`"dataDemissao"::date BETWEEN ${yearStart}::date AND ${yearEndEvt}::date`))
      .groupBy(sql`TO_CHAR("dataDemissao", 'YYYY-MM')`).orderBy(sql`TO_CHAR("dataDemissao", 'YYYY-MM')`),

    // 14-17. Destaques (entre ativos na data de referência)
    db.select({ nome: employees.nomeCompleto, data: employees.dataNascimento, funcao: employees.funcao })
      .from(employees).where(and(activeWhere, sql`"dataNascimento" IS NOT NULL`)).orderBy(employees.dataNascimento).limit(1),
    db.select({ nome: employees.nomeCompleto, data: employees.dataNascimento, funcao: employees.funcao })
      .from(employees).where(and(activeWhere, sql`"dataNascimento" IS NOT NULL`)).orderBy(desc(employees.dataNascimento)).limit(1),
    db.select({ nome: employees.nomeCompleto, data: employees.dataAdmissao, funcao: employees.funcao })
      .from(employees).where(and(activeWhere, sql`"dataAdmissao" IS NOT NULL`)).orderBy(employees.dataAdmissao).limit(1),
    db.select({ nome: employees.nomeCompleto, data: employees.dataAdmissao, funcao: employees.funcao })
      .from(employees).where(and(activeWhere, sql`"dataAdmissao" IS NOT NULL`)).orderBy(desc(employees.dataAdmissao)).limit(1),

    // 18. Ranking advertências (top 10 — ocorridas no ano de análise)
    db.select({ employeeId: warnings.employeeId, nome: employees.nomeCompleto, funcao: employees.funcao, fotoUrl: employees.fotoUrl, total: sql<number>`count(*)` })
      .from(warnings).innerJoin(employees, eq(warnings.employeeId, employees.id))
      .where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt), isNull(employees.deletedAt), sql`${warnings.dataOcorrencia}::date BETWEEN ${yearStart}::date AND ${yearEndEvt}::date`))
      .groupBy(warnings.employeeId, employees.nomeCompleto, employees.funcao, employees.fotoUrl)
      .orderBy(sql`count(*) desc`).limit(10),

    // 19. Ranking atestados (top 10 — emitidos no ano de análise)
    db.select({ employeeId: atestados.employeeId, nome: employees.nomeCompleto, funcao: employees.funcao, fotoUrl: employees.fotoUrl, totalAtestados: sql<number>`count(*)`, totalDias: sql<number>`COALESCE(SUM("diasAfastamento"), 0)` })
      .from(atestados).innerJoin(employees, eq(atestados.employeeId, employees.id))
      .where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt), isNull(employees.deletedAt), sql`${atestados.dataEmissao}::date BETWEEN ${yearStart}::date AND ${yearEndEvt}::date`))
      .groupBy(atestados.employeeId, employees.nomeCompleto, employees.funcao, employees.fotoUrl)
      .orderBy(sql`count(*) desc`).limit(10),

    // 20. Advertências por tipo (ano de análise)
    db.select({ tipo: warnings.tipoAdvertencia, count: sql<number>`count(*)` })
      .from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt), sql`${warnings.dataOcorrencia}::date BETWEEN ${yearStart}::date AND ${yearEndEvt}::date`)).groupBy(warnings.tipoAdvertencia),

    // 21. Todas as funções (sem limite, para o seletor) — ativos na data de referência
    db.select({ funcao: employees.funcao, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.funcao)
      .orderBy(sql`count(*) desc`),

    // 22. Distribuição por função × status (para gráfico de análise) — ativos na data de referência
    db.select({ funcao: employees.funcao, status: employees.status, count: sql<number>`count(*)` })
      .from(employees).where(activeWhere).groupBy(employees.funcao, employees.status),

    // 23. Total de ativos na data de referência (usado p/ ano passado)
    db.select({ c: sql<number>`count(*)` }).from(employees).where(activeWhere),

    // 24. Total de desligados DURANTE o ano de análise
    db.select({ c: sql<number>`count(*)` }).from(employees)
      .where(and(baseWhere, sql`${employees.dataDemissao} IS NOT NULL`, sql`${employees.dataDemissao}::date BETWEEN ${yearStart}::date AND ${yearEndEvt}::date`)),

    // 25. Férias em gozo na data de referência (reconstruído por datas — usado p/ ano passado)
    db.select({ employeeId: vacationPeriods.employeeId })
      .from(vacationPeriods)
      .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
      .where(and(
        companyWhere(vacationPeriods, companyId, companyIds),
        isNull(vacationPeriods.deletedAt), isNull(employees.deletedAt),
        sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
        sql`${employees.dataAdmissao} IS NOT NULL AND ${employees.dataAdmissao}::date <= ${refDate}::date`,
        sql`(${employees.dataDemissao} IS NULL OR ${employees.dataDemissao}::date > ${refDate}::date)`,
        sql`${vacationPeriods.dataInicio} IS NOT NULL AND ${vacationPeriods.dataFim} IS NOT NULL AND ${vacationPeriods.dataInicio} <= ${refDate} AND ${vacationPeriods.dataFim} >= ${refDate}`,
      )),
    ]);
  } catch (err: any) {
    console.error('[getDashFuncionarios] Erro nas queries:', err?.message || err);
    return null;
  }

  const [
    statusDist, feriasEmGozo, sexDist, setorDist, funcaoDist, contratoDist,
    estadoCivilDist, cidadeDist, ageDist, tenureDist, estadoDist,
    admissoesMensal, demissoesMensal,
    oldestArr, youngestArr, longestTenureArr, shortestTenureArr,
    rankingAdvertencias, rankingAtestados, advertenciasTipo,
    funcaoAll, funcaoStatusDist,
    ativosRefArr, desligadosAnoArr, feriasAtRef,
  ] = queryResults;

  const [oldest] = oldestArr;
  const [youngest] = youngestArr;
  const [longestTenure] = longestTenureArr;
  const [shortestTenure] = shortestTenureArr;

  // Desligados = ocorridos DURANTE o ano de análise (ano atual ou passado)
  const totalDesligados = Number(desligadosAnoArr?.[0]?.c) || 0;

  let totalAtivos: number;
  let statusDistMerged: { label: string; value: number }[];

  if (isCurrentYear) {
    // Ano atual = régua de status atual (idêntico à visão padrão)
    const feriasExtraCount = new Set(feriasEmGozo.map((f: any) => f.employeeId)).size;
    totalAtivos = statusDist.filter(s => !['Desligado', 'Lista_Negra'].includes(s.status || '')).reduce((s, r) => s + Number(r.count), 0);
    const statusMergeObj: Record<string, number> = {};
    for (const r of statusDist) {
      if (r.status === 'Desligado' || r.status === 'Lista_Negra') continue; // KPI próprio cuida disso
      const label = r.status || 'Desconhecido';
      statusMergeObj[label] = (statusMergeObj[label] || 0) + Number(r.count);
    }
    if (feriasExtraCount > 0) {
      statusMergeObj['Ferias'] = (statusMergeObj['Ferias'] || 0) + feriasExtraCount;
      statusMergeObj['Ativo'] = (statusMergeObj['Ativo'] || 0) - feriasExtraCount;
    }
    statusDistMerged = Object.entries(statusMergeObj).map(([label, value]) => ({ label, value }));
  } else {
    // Ano passado = snapshot ponto-no-tempo (Ativo/Férias reconstruídos por datas;
    // sub-status como Afastado/Recluso não têm histórico → dobrados em Ativo).
    totalAtivos = Number(ativosRefArr?.[0]?.c) || 0;
    const feriasCount = new Set((feriasAtRef as any[]).map(f => f.employeeId)).size;
    statusDistMerged = [
      { label: 'Ativo', value: Math.max(0, totalAtivos - feriasCount) },
      { label: 'Ferias', value: feriasCount },
    ].filter(s => s.value > 0);
  }

  const totalGeral = totalAtivos + totalDesligados;
  const ordemCrescente = ['< 3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5-10 anos', '10+ anos'];

  return {
    ano: refY,
    resumo: { totalGeral, totalAtivos: Number(totalAtivos), totalDesligados },
    statusDist: statusDistMerged,
    sexDist: sexDist.map(r => ({ label: r.sexo || "Não informado", value: Number(r.count) })),
    setorDist: setorDist.map(r => ({ label: r.setor || "Não informado", value: Number(r.count) })),
    funcaoDist: funcaoDist.map(r => ({ label: r.funcao || "Não informado", value: Number(r.count) })),
    contratoDist: contratoDist.map(r => ({ label: r.tipo || "Não informado", value: Number(r.count) })),
    estadoCivilDist: estadoCivilDist.map(r => ({ label: r.estadoCivil || "Não informado", value: Number(r.count) })),
    cidadeDist: mergeCidadesAccent(cidadeDist.map(r => ({ label: r.cidade || "Não informado", value: Number(r.count) }))),
    estadoDist: estadoDist.map(r => {
      const raw = (r.estado || "").trim().toUpperCase();
      const nameToCode: Record<string, string> = {
        "ACRE":"AC","ALAGOAS":"AL","AMAPÁ":"AP","AMAZONAS":"AM","BAHIA":"BA",
        "CEARÁ":"CE","DISTRITO FEDERAL":"DF","ESPÍRITO SANTO":"ES","ESPIRITO SANTO":"ES",
        "GOIÁS":"GO","GOIAS":"GO","MARANHÃO":"MA","MARANHAO":"MA","MATO GROSSO DO SUL":"MS",
        "MATO GROSSO":"MT","MINAS GERAIS":"MG","PARÁ":"PA","PARA":"PA","PARAÍBA":"PB",
        "PARAIBA":"PB","PARANÁ":"PR","PARANA":"PR","PERNAMBUCO":"PE","PIAUÍ":"PI","PIAUI":"PI",
        "RIO DE JANEIRO":"RJ","RIO GRANDE DO NORTE":"RN","RIO GRANDE DO SUL":"RS",
        "RONDÔNIA":"RO","RONDONIA":"RO","RORAIMA":"RR","SANTA CATARINA":"SC",
        "SÃO PAULO":"SP","SAO PAULO":"SP","SERGIPE":"SE","TOCANTINS":"TO",
      };
      const state = raw.length === 2 ? raw : (nameToCode[raw] || raw || 'Não informado');
      return { state, count: Number(r.count) };
    }),
    ageDist: ageDist.map(r => ({ faixa: r.faixa, sexo: r.sexo || "Outro", count: Number(r.count) })),
    tenureDist: tenureDist.map(r => ({ label: r.faixa, value: Number(r.count) })).sort((a, b) => ordemCrescente.indexOf(a.label) - ordemCrescente.indexOf(b.label)),
    turnover: { admissoes: admissoesMensal.map(r => ({ mes: r.mes, count: Number(r.count) })), demissoes: demissoesMensal.map(r => ({ mes: r.mes, count: Number(r.count) })) },
    destaques: {
      maisVelho: oldest ? { nome: oldest.nome, data: oldest.data, funcao: oldest.funcao } : null,
      maisNovo: youngest ? { nome: youngest.nome, data: youngest.data, funcao: youngest.funcao } : null,
      maiorTempo: longestTenure ? { nome: longestTenure.nome, data: longestTenure.data, funcao: longestTenure.funcao } : null,
      menorTempo: shortestTenure ? { nome: shortestTenure.nome, data: shortestTenure.data, funcao: shortestTenure.funcao } : null,
    },
    rankingAdvertencias: rankingAdvertencias.map(r => ({ employeeId: r.employeeId, nome: r.nome, funcao: r.funcao, fotoUrl: r.fotoUrl ?? null, total: Number(r.total) })),
    rankingAtestados: rankingAtestados.map(r => ({ employeeId: r.employeeId, nome: r.nome, funcao: r.funcao, fotoUrl: r.fotoUrl ?? null, totalAtestados: Number(r.totalAtestados), totalDias: Number(r.totalDias) })),
    advertenciasTipo: advertenciasTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
    funcaoAll: funcaoAll.map(r => ({ label: r.funcao || "Não informado", value: Number(r.count) })),
    funcaoStatusDist: funcaoStatusDist.map(r => ({ funcao: r.funcao || "Não informado", status: isCurrentYear ? (r.status || "Desconhecido") : "Ativo", count: Number(r.count) })),
  };
}

// ============================================================
// 2. DASHBOARD CARTÃO DE PONTO
// ============================================================
async function getDashCartaoPonto(companyId: number, mesRef?: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const mes = mesRef || new Date().toISOString().slice(0, 7);

  // Registros do mês e funcionários ativos em paralelo
  const [registros, allEmps] = await Promise.all([
    db.select().from(timeRecords)
      .where(and(companyWhere(timeRecords, companyId, companyIds), eq(timeRecords.mesReferencia, mes))),
    db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor, status: employees.status, fotoUrl: employees.fotoUrl })
      .from(employees).where(and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`)),
  ]);
  const empMap = new Map(allEmps.map(e => [e.id, e]));

  // Totais
  let totalHorasTrab = 0, totalHorasExtras = 0, totalFaltas = 0, totalAtrasos = 0;
  let totalFaltasDias = 0, totalAtrasosComTolerancia = 0;
  const porFuncionario: Record<number, {
    horasTrab: number; horasExtras: number; faltas: number; faltasDias: number;
    atrasos: number; atrasosMinutos: number; dias: number;
    faltasDatasSet: Set<string>; // datas (YYYY-MM-DD) com falta real
  }> = {};

  // CLT Art. 58, §1º: Tolerância de 10 minutos diários (não serão descontados atrasos <= 10min/dia)
  const TOLERANCIA_CLT_MINUTOS = 10;

  // Pré-agrupa registros por funcionário+data para detectar se houve trabalho em qualquer obra naquele dia
  // Um dia só é falta se NÃO houve nenhuma batida com horas trabalhadas naquele dia (em nenhuma obra)
  const horasPorEmpDia: Record<string, number> = {};
  const faltasPorEmpDia: Record<string, number> = {};
  const atrasosPorEmpDia: Record<string, number> = {};
  for (const r of registros) {
    const key = `${r.employeeId}_${r.data}`;
    horasPorEmpDia[key] = (horasPorEmpDia[key] || 0) + parseFloat(r.horasTrabalhadas || "0");
    faltasPorEmpDia[key] = (faltasPorEmpDia[key] || 0) + parseFloat(r.faltas || "0");
    atrasosPorEmpDia[key] = (atrasosPorEmpDia[key] || 0) + parseFloat(r.atrasos || "0");
  }

  // Conjunto de chaves emp+data já processadas (para evitar dupla contagem entre obras)
  const processedEmpDia = new Set<string>();

  for (const r of registros) {
    const key = `${r.employeeId}_${r.data}`;
    const ht = parseFloat(r.horasTrabalhadas || "0");
    const he = parseFloat(r.horasExtras || "0");
    totalHorasTrab += ht;
    totalHorasExtras += he;
    if (!porFuncionario[r.employeeId]) porFuncionario[r.employeeId] = {
      horasTrab: 0, horasExtras: 0, faltas: 0, faltasDias: 0,
      atrasos: 0, atrasosMinutos: 0, dias: 0, faltasDatasSet: new Set(),
    };
    porFuncionario[r.employeeId].horasTrab += ht;
    porFuncionario[r.employeeId].horasExtras += he;

    // Lógica por dia única — só processa cada emp+data uma vez
    if (!processedEmpDia.has(key)) {
      processedEmpDia.add(key);
      porFuncionario[r.employeeId].dias++;

      const htDia = horasPorEmpDia[key] || 0;
      const ftDia = faltasPorEmpDia[key] || 0;
      const atDia = atrasosPorEmpDia[key] || 0;

      totalFaltas += ftDia;
      porFuncionario[r.employeeId].faltas += ftDia;

      // Dia de falta: tem registro de falta E não trabalhou nenhuma hora em NENHUMA obra
      // (evita contar como falta quando o funcionário tinha duas obras e bateu ponto em uma)
      if (ftDia > 0 && htDia === 0) {
        porFuncionario[r.employeeId].faltasDias++;
        porFuncionario[r.employeeId].faltasDatasSet.add(r.data);
        totalFaltasDias++;
      }

      // Atrasos: aplicar tolerância CLT Art. 58 §1º
      const atMinutos = Math.round(atDia * 60);
      if (atMinutos > TOLERANCIA_CLT_MINUTOS) {
        porFuncionario[r.employeeId].atrasos += atDia;
        porFuncionario[r.employeeId].atrasosMinutos += atMinutos;
        totalAtrasos += atDia;
        totalAtrasosComTolerancia += atMinutos;
      }
    }
  }

  // Ranking de faltas (em DIAS) — inclui lista de datas para popup
  const rankingFaltas = Object.entries(porFuncionario)
    .filter(([, d]) => d.faltasDias > 0)
    .map(([empId, d]) => {
      const emp = empMap.get(Number(empId));
      const faltasDatas = [...d.faltasDatasSet].sort();
      return {
        employeeId: Number(empId), nome: emp?.nome || `Func. ${empId}`,
        funcao: emp?.funcao || "-", isDesligado: isDesligadoStatus(emp?.status),
        fotoUrl: emp?.fotoUrl ?? null,
        faltasDias: d.faltasDias, faltasHoras: d.faltas,
        faltasDatas, // ex: ["2026-04-02","2026-04-07"]
      };
    }).sort((a, b) => b.faltasDias - a.faltasDias).slice(0, 10);

  // Ranking de atrasos (com tolerância CLT Art. 58 §1º - 10min/dia)
  const rankingAtrasos = Object.entries(porFuncionario)
    .filter(([, d]) => d.atrasosMinutos > 0)
    .map(([empId, d]) => {
      const emp = empMap.get(Number(empId));
      const horas = Math.floor(d.atrasosMinutos / 60);
      const minutos = d.atrasosMinutos % 60;
      return { employeeId: Number(empId), nome: emp?.nome || `Func. ${empId}`, funcao: emp?.funcao || "-", isDesligado: isDesligadoStatus(emp?.status), fotoUrl: emp?.fotoUrl ?? null, atrasosMinutos: d.atrasosMinutos, atrasosFormatado: `${horas}h${minutos > 0 ? String(minutos).padStart(2, '0') + 'min' : ''}` };
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

  const empsAtivos = allEmps.filter(e => !['Desligado', 'Lista_Negra'].includes(e.status || ''));
  const funcionariosComRegistro = Object.keys(porFuncionario).length;
  const funcionariosSemRegistro = Math.max(0, empsAtivos.length - funcionariosComRegistro);

  // Rev. 1779b — Top funcionários por indicador (rastreabilidade dos "meliantes").
  // Para cada indicador do dashboard, retorna até 10 funcionários ordenados pelo
  // valor relevante (maiores faltosos, maiores horas-extras, sem-registro, etc.)
  // Usado pelo modal "Análise aprofundada" — uma seção por mês × indicador.
  const idsComRegistro = new Set(Object.keys(porFuncionario).map(Number));
  const ativosSemRegistro = empsAtivos.filter(e => !idsComRegistro.has(e.id));
  const buildTopGenerico = (mapper: (d: typeof porFuncionario[number], emp: typeof allEmps[number]) => { valor: number; extra?: string } | null, limit = 10) => {
    return Object.entries(porFuncionario)
      .map(([empId, d]) => {
        const emp = empMap.get(Number(empId));
        if (!emp) return null;
        const m = mapper(d, emp);
        if (!m || m.valor <= 0) return null;
        return {
          employeeId: Number(empId),
          nome: emp.nome || `Func. ${empId}`,
          funcao: emp.funcao || "-",
          isDesligado: isDesligadoStatus(emp.status),
          valor: Math.round(m.valor * 100) / 100,
          extra: m.extra,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, limit);
  };
  const semRegistroList = ativosSemRegistro.slice(0, 30).map(e => ({
    employeeId: e.id, nome: e.nome || `Func. ${e.id}`, funcao: e.funcao || "-",
    isDesligado: isDesligadoStatus(e.status), valor: 0, extra: "sem nenhuma batida no mês",
  }));
  const topPorIndicador = {
    horasTrab: buildTopGenerico(d => ({ valor: d.horasTrab, extra: `${(d.horasTrab).toFixed(1)}h em ${d.dias}d` })),
    horasExtras: buildTopGenerico(d => ({ valor: d.horasExtras, extra: `${d.horasExtras.toFixed(1)}h em ${d.dias}d` })),
    percHE: buildTopGenerico(d => d.horasTrab > 0 ? { valor: (d.horasExtras / d.horasTrab) * 100, extra: `${d.horasExtras.toFixed(1)}h HE / ${d.horasTrab.toFixed(1)}h normais` } : null),
    faltas: rankingFaltas.map(r => ({
      employeeId: r.employeeId, nome: r.nome, funcao: r.funcao, isDesligado: r.isDesligado,
      valor: r.faltasDias, extra: r.faltasDatas.length > 0 ? `Datas: ${r.faltasDatas.slice(0, 5).join(", ")}${r.faltasDatas.length > 5 ? "…" : ""}` : undefined,
    })),
    atrasos: rankingAtrasos.map(r => ({
      employeeId: r.employeeId, nome: r.nome, funcao: r.funcao, isDesligado: r.isDesligado,
      valor: r.atrasosMinutos, extra: r.atrasosFormatado,
    })),
    ativos: empsAtivos.slice(0, 30).map(e => ({
      employeeId: e.id, nome: e.nome || `Func. ${e.id}`, funcao: e.funcao || "-",
      isDesligado: false, valor: 1, extra: e.setor || undefined,
    })),
    comReg: buildTopGenerico(d => ({ valor: d.horasTrab, extra: `${d.horasTrab.toFixed(1)}h trabalhadas` })),
    semReg: semRegistroList,
    cobertura: semRegistroList, // mesma lista — o "problema" da cobertura são os sem registro
  };

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
      totalFuncionariosAtivos: empsAtivos.length,
      toleranciaCLT: TOLERANCIA_CLT_MINUTOS,
      topPorIndicador,
    },
    rankingFaltas,
    rankingAtrasos,
    porDiaSemana: Object.entries(porDiaSemana).map(([dia, d]) => ({ dia, horas: Math.round(d.horas * 100) / 100, registros: d.registros })),
    evolucaoDiaria,
    mesReferencia: mes,
  };
}

// Rev. 1777 — Comparativo do ano corrente do Cartão de Ponto.
// Retorna o resumo de Janeiro até o mês de referência (do mesmo ano) para a
// tabela "Tendência mês-a-mês — ano corrente" no dashboard.
async function getDashCartaoPontoComparativo(companyId: number, mesRef?: string, companyIds?: number[]) {
  const ref = mesRef || new Date().toISOString().slice(0, 7);
  const [refY, refM] = ref.split("-").map(Number);
  const meses: string[] = [];
  for (let m = 1; m <= refM; m++) {
    meses.push(`${refY}-${String(m).padStart(2, "0")}`);
  }
  const resultados = await Promise.all(meses.map(m => getDashCartaoPonto(companyId, m, companyIds)));
  return {
    ano: refY,
    meses: resultados.map((r, i) => ({
      mes: meses[i],
      resumo: r?.resumo ?? null,
    })),
  };
}

// ============================================================
// Comparativos genéricos por dashboard (Rev. 1779)
// ============================================================
function _mesesAteRef(ano?: number, mesRef?: string) {
  const now = new Date();
  const refY = ano || (mesRef ? parseInt(mesRef.split("-")[0]) : now.getFullYear());
  const refM = (mesRef ? parseInt(mesRef.split("-")[1]) : (refY === now.getFullYear() ? now.getMonth() + 1 : 12));
  const meses: string[] = [];
  for (let m = 1; m <= refM; m++) meses.push(`${refY}-${String(m).padStart(2, "0")}`);
  return { refY, refM, meses };
}
function _companyList(companyId: number, companyIds?: number[]) {
  const ids = (companyIds && companyIds.length > 0 ? companyIds : [companyId]).filter(n => n > 0);
  if (ids.length === 0) return null;
  return sql.join(ids.map(id => sql`${id}`), sql`,`);
}

async function getDashHorasExtrasComparativo(companyId: number, ano?: number, companyIds?: number[]) {
  const { refY, meses } = _mesesAteRef(ano);
  const resultados = await Promise.all(meses.map(m => {
    const mesNum = parseInt(m.split("-")[1]);
    return getDashHorasExtras(companyId, refY, { periodoTipo: 'mes', periodoValor: String(mesNum) } as any, companyIds);
  }));
  return {
    ano: refY,
    meses: resultados.map((r, i) => ({ mes: meses[i], resumo: r?.resumo ?? null })),
  };
}

async function getDashFolhaPagamentoComparativo(companyId: number, mesRef?: string, companyIds?: number[]) {
  const { meses, refY } = _mesesAteRef(undefined, mesRef);
  const resultados = await Promise.all(meses.map(m => getDashFolhaPagamento(companyId, m, companyIds)));
  return {
    ano: refY,
    meses: resultados.map((r, i) => ({ mes: meses[i], resumo: r?.resumo ?? null })),
  };
}

async function getDashFuncionariosComparativo(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb(); if (!db) return { ano: ano || new Date().getFullYear(), meses: [] };
  const { refY, meses } = _mesesAteRef(ano);
  const cl = _companyList(companyId, companyIds);
  if (!cl) return { ano: refY, meses: [] };
  const inicioAno = `${refY}-01-01`;
  const fimRef = meses[meses.length - 1] + "-01";
  const rows: any = await db.execute(sql`
    WITH meses AS (
      SELECT generate_series(${inicioAno}::date, ${fimRef}::date, '1 month'::interval)::date AS mi
    )
    SELECT
      to_char(m.mi, 'YYYY-MM') AS mes,
      (SELECT COUNT(*) FROM employees e WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
        AND e."dataAdmissao"::date <= (m.mi + interval '1 month - 1 day')::date
        AND (e."dataDemissao" IS NULL OR e."dataDemissao"::date > (m.mi + interval '1 month - 1 day')::date)) AS ativos,
      (SELECT COUNT(*) FROM employees e WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
        AND e."dataAdmissao"::date >= m.mi AND e."dataAdmissao"::date <= (m.mi + interval '1 month - 1 day')::date) AS admissoes,
      (SELECT COUNT(*) FROM employees e WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
        AND e."dataDemissao" IS NOT NULL AND e."dataDemissao"::date >= m.mi AND e."dataDemissao"::date <= (m.mi + interval '1 month - 1 day')::date) AS demissoes
    FROM meses m
    ORDER BY m.mi
  `);
  const arr = (rows.rows || rows) as any[];
  const map = new Map<string, any>();
  arr.forEach(r => {
    const ativos = Number(r.ativos) || 0;
    const adm = Number(r.admissoes) || 0;
    const dem = Number(r.demissoes) || 0;
    const turnover = ativos > 0 ? Math.round(((adm + dem) / 2 / ativos) * 1000) / 10 : 0;
    map.set(r.mes, { ativos, admissoes: adm, demissoes: dem, saldo: adm - dem, turnoverPct: turnover });
  });
  return {
    ano: refY,
    meses: meses.map(m => ({ mes: m, resumo: map.get(m) || null })),
  };
}

// Comparativo ANUAL de admissões/demissões: por trimestre (T1-T4), semestre (S1/S2),
// total do ano e variação vs ano anterior — para o ano de referência + 4 anos anteriores.
async function getDashFuncionariosAnual(companyId: number, ano?: number, companyIds?: number[]) {
  const refY = ano || new Date().getFullYear();
  const anoMin = refY - 4;
  const db = await getDb(); if (!db) return { anoRef: refY, anos: [] };
  const cl = _companyList(companyId, companyIds);
  if (!cl) return { anoRef: refY, anos: [] };
  const rows: any = await db.execute(sql`
    SELECT 'adm' AS tipo,
      EXTRACT(YEAR FROM e."dataAdmissao"::date)::int AS ano,
      EXTRACT(QUARTER FROM e."dataAdmissao"::date)::int AS tri,
      COUNT(*)::int AS n
    FROM employees e
    WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
      AND e."dataAdmissao" IS NOT NULL
      AND EXTRACT(YEAR FROM e."dataAdmissao"::date) BETWEEN ${anoMin} AND ${refY}
    GROUP BY 2, 3
    UNION ALL
    SELECT 'dem' AS tipo,
      EXTRACT(YEAR FROM e."dataDemissao"::date)::int AS ano,
      EXTRACT(QUARTER FROM e."dataDemissao"::date)::int AS tri,
      COUNT(*)::int AS n
    FROM employees e
    WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
      AND e."dataDemissao" IS NOT NULL
      AND EXTRACT(YEAR FROM e."dataDemissao"::date) BETWEEN ${anoMin} AND ${refY}
    GROUP BY 2, 3
  `);
  const arr = (rows.rows || rows) as any[];
  const empty = () => ({ t1: 0, t2: 0, t3: 0, t4: 0, s1: 0, s2: 0, total: 0 });
  const byYear = new Map<number, { ano: number; admissoes: ReturnType<typeof empty>; demissoes: ReturnType<typeof empty> }>();
  for (let y = anoMin; y <= refY; y++) byYear.set(y, { ano: y, admissoes: empty(), demissoes: empty() });
  arr.forEach(r => {
    const y = Number(r.ano); const tri = Number(r.tri); const n = Number(r.n) || 0;
    const rec = byYear.get(y); if (!rec || tri < 1 || tri > 4) return;
    const tgt = r.tipo === 'adm' ? rec.admissoes : rec.demissoes;
    (tgt as any)[`t${tri}`] += n;
    tgt.total += n;
    if (tri <= 2) tgt.s1 += n; else tgt.s2 += n;
  });
  const anos = Array.from(byYear.values()).sort((a, b) => a.ano - b.ano);
  return { anoRef: refY, anos };
}

// Rev. 2627 — Total de funcionários (headcount ativo ao FIM de cada ano) desde a
// fundação da empresa (1º ano com admissão) até o ano corrente. SOMENTE SELECT
// (R-001/R-007/R-010). "Ativo ao fim do ano" = ponto-no-tempo por datas:
// admitido até 31/12 do ano E (sem demissão OU demitido só depois). Mesma régua do
// drill `ativosAno`, garantindo paridade entre o número exibido e a lista clicável.
async function getDashFuncionariosHeadcountAnual(companyId: number, companyIds?: number[]) {
  const anoAtual = new Date().getFullYear();
  const db = await getDb(); if (!db) return { anoAtual, anos: [] as Array<{ ano: number; ativos: number; admitidos: number; desligados: number }> };
  const cl = _companyList(companyId, companyIds);
  if (!cl) return { anoAtual, anos: [] };
  const rows: any = await db.execute(sql`
    WITH bounds AS (
      SELECT COALESCE(MIN(EXTRACT(YEAR FROM e."dataAdmissao"::date))::int, ${anoAtual}) AS ymin
      FROM employees e
      WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL AND e."dataAdmissao" IS NOT NULL
    ),
    anos AS (
      SELECT generate_series((SELECT ymin FROM bounds), ${anoAtual})::int AS ano
    )
    SELECT a.ano,
      (SELECT COUNT(*) FROM employees e
        WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
          AND e."dataAdmissao" IS NOT NULL
          AND e."dataAdmissao"::date <= make_date(a.ano, 12, 31)
          AND (e."dataDemissao" IS NULL OR e."dataDemissao"::date > make_date(a.ano, 12, 31))
      )::int AS ativos,
      (SELECT COUNT(*) FROM employees e
        WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
          AND e."dataAdmissao" IS NOT NULL
          AND EXTRACT(YEAR FROM e."dataAdmissao"::date) = a.ano
      )::int AS admitidos,
      (SELECT COUNT(*) FROM employees e
        WHERE e."companyId" IN (${cl}) AND e."deletedAt" IS NULL
          AND e."dataDemissao" IS NOT NULL
          AND EXTRACT(YEAR FROM e."dataDemissao"::date) = a.ano
      )::int AS desligados
    FROM anos a
    ORDER BY a.ano
  `);
  const arr = (rows.rows || rows) as any[];
  const anos = arr.map(r => ({
    ano: Number(r.ano),
    ativos: Number(r.ativos) || 0,
    admitidos: Number(r.admitidos) || 0,
    desligados: Number(r.desligados) || 0,
  }));
  return { anoAtual, anos };
}

async function getDashAvisoPrevioComparativo(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb(); if (!db) return { ano: ano || new Date().getFullYear(), meses: [] };
  const { refY, meses } = _mesesAteRef(ano);
  const cl = _companyList(companyId, companyIds);
  if (!cl) return { ano: refY, meses: [] };
  const inicioAno = `${refY}-01-01`;
  const fimRef = meses[meses.length - 1] + "-01";
  const rows: any = await db.execute(sql`
    WITH meses AS (
      SELECT generate_series(${inicioAno}::date, ${fimRef}::date, '1 month'::interval)::date AS mi
    )
    SELECT
      to_char(m.mi, 'YYYY-MM') AS mes,
      (SELECT COUNT(*) FROM termination_notices t WHERE t."companyId" IN (${cl}) AND t."deletedAt" IS NULL
        AND t.status <> 'cancelado'
        AND t."dataInicio"::date >= m.mi AND t."dataInicio"::date <= (m.mi + interval '1 month - 1 day')::date) AS iniciados,
      (SELECT COUNT(*) FROM termination_notices t WHERE t."companyId" IN (${cl}) AND t."deletedAt" IS NULL
        AND t.status = 'concluido'
        AND COALESCE(t."dataConclusao", t."dataFim")::date >= m.mi
        AND COALESCE(t."dataConclusao", t."dataFim")::date <= (m.mi + interval '1 month - 1 day')::date) AS concluidos,
      (SELECT COUNT(*) FROM termination_notices t WHERE t."companyId" IN (${cl}) AND t."deletedAt" IS NULL
        AND t.status = 'em_andamento'
        AND t."dataInicio"::date <= (m.mi + interval '1 month - 1 day')::date
        AND (t."dataConclusao" IS NULL OR t."dataConclusao"::date > (m.mi + interval '1 month - 1 day')::date)) AS em_andamento,
      (SELECT COALESCE(SUM(NULLIF(REPLACE(t."valorEstimadoTotal",',','.'),'')::numeric), 0) FROM termination_notices t
        WHERE t."companyId" IN (${cl}) AND t."deletedAt" IS NULL
        AND t.status <> 'cancelado'
        AND t."dataInicio"::date >= m.mi AND t."dataInicio"::date <= (m.mi + interval '1 month - 1 day')::date) AS valor_iniciados
    FROM meses m
    ORDER BY m.mi
  `);
  const arr = (rows.rows || rows) as any[];
  const map = new Map<string, any>();
  arr.forEach(r => map.set(r.mes, {
    iniciados: Number(r.iniciados) || 0,
    concluidos: Number(r.concluidos) || 0,
    emAndamento: Number(r.em_andamento) || 0,
    valorIniciados: Number(r.valor_iniciados) || 0,
  }));
  return { ano: refY, meses: meses.map(m => ({ mes: m, resumo: map.get(m) || null })) };
}

async function getDashFeriasComparativo(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb(); if (!db) return { ano: ano || new Date().getFullYear(), meses: [] };
  const { refY, meses } = _mesesAteRef(ano);
  const cl = _companyList(companyId, companyIds);
  if (!cl) return { ano: refY, meses: [] };
  const inicioAno = `${refY}-01-01`;
  const fimRef = meses[meses.length - 1] + "-01";
  const rows: any = await db.execute(sql`
    WITH meses AS (
      SELECT generate_series(${inicioAno}::date, ${fimRef}::date, '1 month'::interval)::date AS mi
    )
    SELECT
      to_char(m.mi, 'YYYY-MM') AS mes,
      (SELECT COUNT(*) FROM vacation_periods v WHERE v."companyId" IN (${cl}) AND v."deletedAt" IS NULL
        AND v."dataInicio" IS NOT NULL
        AND v."dataInicio"::date >= m.mi AND v."dataInicio"::date <= (m.mi + interval '1 month - 1 day')::date) AS iniciadas,
      (SELECT COUNT(*) FROM vacation_periods v WHERE v."companyId" IN (${cl}) AND v."deletedAt" IS NULL
        AND v."dataFim" IS NOT NULL
        AND v."dataFim"::date >= m.mi AND v."dataFim"::date <= (m.mi + interval '1 month - 1 day')::date) AS concluidas,
      (SELECT COUNT(*) FROM vacation_periods v WHERE v."companyId" IN (${cl}) AND v."deletedAt" IS NULL
        AND v."dataInicio" IS NOT NULL AND v."dataFim" IS NOT NULL
        AND v."dataInicio"::date <= (m.mi + interval '1 month - 1 day')::date
        AND v."dataFim"::date >= (m.mi + interval '1 month - 1 day')::date) AS em_gozo,
      (SELECT COUNT(*) FROM vacation_periods v WHERE v."companyId" IN (${cl}) AND v."deletedAt" IS NULL
        AND v."periodoConcessivoFim"::date <= (m.mi + interval '1 month - 1 day')::date
        AND v."dataInicio" IS NULL
        AND v.status NOT IN ('pago','cancelado')) AS vencidas,
      (SELECT COALESCE(SUM(NULLIF(REPLACE(v."valorTotal",',','.'),'')::numeric), 0) FROM vacation_periods v
        WHERE v."companyId" IN (${cl}) AND v."deletedAt" IS NULL
        AND v."dataInicio" IS NOT NULL
        AND v."dataInicio"::date >= m.mi AND v."dataInicio"::date <= (m.mi + interval '1 month - 1 day')::date) AS custo_iniciadas
    FROM meses m
    ORDER BY m.mi
  `);
  const arr = (rows.rows || rows) as any[];
  const map = new Map<string, any>();
  arr.forEach(r => map.set(r.mes, {
    iniciadas: Number(r.iniciadas) || 0,
    concluidas: Number(r.concluidas) || 0,
    emGozo: Number(r.em_gozo) || 0,
    vencidas: Number(r.vencidas) || 0,
    custoIniciadas: Number(r.custo_iniciadas) || 0,
  }));
  return { ano: refY, meses: meses.map(m => ({ mes: m, resumo: map.get(m) || null })) };
}

async function getDashApontamentosComparativo(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb(); if (!db) return { ano: ano || new Date().getFullYear(), meses: [] };
  const { refY, meses } = _mesesAteRef(ano);
  const cl = _companyList(companyId, companyIds);
  if (!cl) return { ano: refY, meses: [] };
  const inicioAno = `${refY}-01-01`;
  const fimRef = meses[meses.length - 1] + "-01";
  const rows: any = await db.execute(sql`
    WITH meses AS (
      SELECT generate_series(${inicioAno}::date, ${fimRef}::date, '1 month'::interval)::date AS mi
    )
    SELECT
      to_char(m.mi, 'YYYY-MM') AS mes,
      (SELECT COUNT(*) FROM field_notes f WHERE f."companyId" IN (${cl}) AND f."deletedAt" IS NULL
        AND f.data::date >= m.mi AND f.data::date <= (m.mi + interval '1 month - 1 day')::date) AS criados,
      (SELECT COUNT(*) FROM field_notes f WHERE f."companyId" IN (${cl}) AND f."deletedAt" IS NULL
        AND f."resolvidoEm" IS NOT NULL
        AND f."resolvidoEm"::date >= m.mi AND f."resolvidoEm"::date <= (m.mi + interval '1 month - 1 day')::date) AS resolvidos,
      (SELECT COUNT(*) FROM field_notes f WHERE f."companyId" IN (${cl}) AND f."deletedAt" IS NULL
        AND f.data::date <= (m.mi + interval '1 month - 1 day')::date
        AND (f."resolvidoEm" IS NULL OR f."resolvidoEm"::date > (m.mi + interval '1 month - 1 day')::date)) AS pendentes,
      (SELECT COUNT(*) FROM field_notes f WHERE f."companyId" IN (${cl}) AND f."deletedAt" IS NULL
        AND f.prioridade IN ('alta','urgente','critica')
        AND f.data::date >= m.mi AND f.data::date <= (m.mi + interval '1 month - 1 day')::date) AS urgentes,
      (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (f."resolvidoEm"::timestamp - f.data::timestamp)) / 3600.0), 0)
        FROM field_notes f WHERE f."companyId" IN (${cl}) AND f."deletedAt" IS NULL
        AND f."resolvidoEm" IS NOT NULL
        AND f."resolvidoEm"::date >= m.mi AND f."resolvidoEm"::date <= (m.mi + interval '1 month - 1 day')::date) AS tempo_medio_h
    FROM meses m
    ORDER BY m.mi
  `);
  const arr = (rows.rows || rows) as any[];
  const map = new Map<string, any>();
  arr.forEach(r => {
    const cri = Number(r.criados) || 0;
    const res = Number(r.resolvidos) || 0;
    map.set(r.mes, {
      criados: cri,
      resolvidos: res,
      pendentes: Number(r.pendentes) || 0,
      urgentes: Number(r.urgentes) || 0,
      tempoMedioHoras: Math.round((Number(r.tempo_medio_h) || 0) * 10) / 10,
      taxaResolucaoPct: cri > 0 ? Math.round((res / cri) * 1000) / 10 : 0,
    });
  });
  return { ano: refY, meses: meses.map(m => ({ mes: m, resumo: map.get(m) || null })) };
}

// ============================================================
// 3. DASHBOARD FOLHA DE PAGAMENTO
// ============================================================
async function getDashFolhaPagamento(companyId: number, mesRef?: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const mes = mesRef || new Date().toISOString().slice(0, 7);

  // Lista de companies a consultar (mantém comportamento original do companyWhere).
  const ids = (companyIds && companyIds.length > 0 ? companyIds : [companyId]).filter(n => n > 0);
  if (ids.length === 0) return null;
  const companyList = sql.join(ids.map(id => sql`${id}`), sql`,`);

  // Fonte real da folha: payroll_payments (mesma usada por RelatorioFolha e
  // AlertaDivergenciaFolha). A tabela legada monthly_payroll_summary não está
  // sendo populada pelo motor atual, gerando R$ 0,00 no dashboard mesmo com
  // 93 funcionários processados. Lemos direto da fonte verdadeira.
  const [pagamentosMesRaw, evolucaoRawRows] = await Promise.all([
    db.execute(sql`
      SELECT pp.*, e."nomeCompleto", e.funcao, e."bancoNome", e.banco
      FROM payroll_payments pp
      LEFT JOIN employees e ON pp."employeeId" = e.id
      WHERE pp."companyId" IN (${companyList}) AND pp."mesReferencia" = ${mes}
    `),
    db.execute(sql`
      SELECT
        "mesReferencia" AS mes,
        COALESCE(SUM(CAST("totalProventos" AS DECIMAL(14,2))), 0)        AS proventos,
        -- Descontos exibidos NÃO incluem adiantamento (vale já pago).
        COALESCE(SUM(
          GREATEST(
            CAST("totalDescontos" AS DECIMAL(14,2))
            - COALESCE(CAST("descontoAdiantamento" AS DECIMAL(14,2)), 0),
            0
          )
        ), 0) AS descontos,
        COALESCE(SUM(CAST("salarioLiquido" AS DECIMAL(14,2))), 0)        AS liquido,
        COALESCE(SUM(CAST("descontoFgts" AS DECIMAL(14,2))), 0)          AS fgts,
        COALESCE(SUM(CAST("descontoInss" AS DECIMAL(14,2))), 0)          AS inss,
        COUNT(DISTINCT "employeeId")                                       AS funcionarios
      FROM payroll_payments
      WHERE "companyId" IN (${companyList})
        AND "mesReferencia" >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM')
      GROUP BY "mesReferencia"
      ORDER BY "mesReferencia"
    `),
  ]);
  const pagamentosMes: any[] = (pagamentosMesRaw as any).rows || [];
  const evolucaoRaw: any[] = (evolucaoRawRows as any).rows || [];

  // Resumo do mês atual
  let totalProventosMes = 0, totalDescontosMes = 0, totalLiquidoMes = 0;
  let totalFgtsMes = 0, totalInssMes = 0, totalIrrfMes = 0, totalAdiantamentoMes = 0;
  for (const s of pagamentosMes) {
    const proventos = parseFloat(s.totalProventos || "0");
    const descBruto = parseFloat(s.totalDescontos || "0");
    const adiant    = parseFloat(s.descontoAdiantamento || "0");
    totalProventosMes    += proventos;
    totalDescontosMes    += Math.max(0, descBruto - adiant); // sem vale
    totalAdiantamentoMes += adiant;
    totalLiquidoMes      += parseFloat(s.salarioLiquido || "0");
    totalFgtsMes         += parseFloat(s.descontoFgts || "0");
    totalInssMes         += parseFloat(s.descontoInss || "0");
    totalIrrfMes         += parseFloat(s.descontoIrrf || "0");
  }
  // Custo Total ≈ proventos + INSS patronal estimado (20%) + FGTS (8%).
  // Mantém o KPI "Custo Total" diferente de "Total Proventos".
  const custoTotalMes = totalProventosMes + totalProventosMes * 0.20 + totalFgtsMes;

  // Detalhamento por funcionário (todos os funcionários, todos os campos)
  const detalhesPorFuncionario = pagamentosMes.map(s => {
    const proventos = parseFloat(s.totalProventos || "0");
    const descBruto = parseFloat(s.totalDescontos || "0");
    const adiant    = parseFloat(s.descontoAdiantamento || "0");
    return {
      employeeId: s.employeeId,
      nome:       s.nomeCompleto || "Desconhecido",
      funcao:     s.funcao || "-",
      banco:      s.bancoNome || s.banco || s.bancoDestino || "Não informado",
      bruto:      proventos,
      proventos,
      adiantamento:    adiant,
      descontosSemVale: Math.max(0, descBruto - adiant),
      faltas:     parseFloat(s.descontoFaltas || "0"),
      vrFaltas:   parseFloat(s.descontoVrFaltas || "0"),
      vtFaltas:   parseFloat(s.descontoVtFaltas || "0"),
      inss:       parseFloat(s.descontoInss || "0"),
      irrf:       parseFloat(s.descontoIrrf || "0"),
      fgts:       parseFloat(s.descontoFgts || "0"),
      liquido:    parseFloat(s.salarioLiquido || "0"),
    };
  });

  // Top 10 maiores salários
  const topSalarios = [...detalhesPorFuncionario]
    .sort((a, b) => b.bruto - a.bruto).slice(0, 10);

  // Distribuição por banco (líquido pago por banco)
  const porBanco: Record<string, { count: number; valor: number }> = {};
  for (const s of pagamentosMes) {
    const banco = s.bancoNome || s.banco || s.bancoDestino || "Não informado";
    if (!porBanco[banco]) porBanco[banco] = { count: 0, valor: 0 };
    porBanco[banco].count++;
    porBanco[banco].valor += parseFloat(s.salarioLiquido || "0");
  }

  // Custo por função (top 10) — usa proventos como proxy do custo.
  const porFuncao: Record<string, { count: number; custo: number }> = {};
  for (const s of pagamentosMes) {
    const f = s.funcao || "Sem Função";
    if (!porFuncao[f]) porFuncao[f] = { count: 0, custo: 0 };
    porFuncao[f].count++;
    porFuncao[f].custo += parseFloat(s.totalProventos || "0");
  }

  return {
    resumo: {
      custoTotalMes:        Math.round(custoTotalMes * 100) / 100,
      totalProventosMes:    Math.round(totalProventosMes * 100) / 100,
      totalDescontosMes:    Math.round(totalDescontosMes * 100) / 100,
      totalAdiantamentoMes: Math.round(totalAdiantamentoMes * 100) / 100,
      totalLiquidoMes:      Math.round(totalLiquidoMes * 100) / 100,
      totalFgtsMes:         Math.round(totalFgtsMes * 100) / 100,
      totalInssMes:         Math.round(totalInssMes * 100) / 100,
      totalIrrfMes:         Math.round(totalIrrfMes * 100) / 100,
      totalFuncionarios:    pagamentosMes.length,
    },
    evolucaoMensal: evolucaoRaw.map(r => ({
      mes: r.mes,
      proventos:    Number(r.proventos),
      descontos:    Number(r.descontos),
      liquido:      Number(r.liquido),
      fgts:         Number(r.fgts),
      inss:         Number(r.inss),
      funcionarios: Number(r.funcionarios),
    })),
    topSalarios,
    detalhesPorFuncionario,
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

  // ────────────────────────────────────────────────────────────────────────────
  // Fonte de dados: módulo Horas Extras (he_periods + he_period_employees).
  // Esses dados são populados pelo cálculo de HE rodado a partir da Folha.
  // A tabela legada extra_payments NÃO é usada aqui porque o módulo HE atual
  // não persiste nela — ler de lá deixava o dashboard sempre zerado.
  // Para cada mesReferencia escolhemos UM período (status priority:
  // pago > aprovado > calculado > rascunho/outros) ignorando 'cancelado'.
  // ────────────────────────────────────────────────────────────────────────────
  const STATUS_PRIORITY: Record<string, number> = {
    pago: 4, aprovado: 3, calculado: 2, rascunho: 1,
  };
  const pickPriority = (s: string | null | undefined) => STATUS_PRIORITY[s ?? ""] ?? 0;

  const periodConditions = [
    companyWhere(hePeriods, companyId, companyIds),
    gte(hePeriods.mesReferencia, startDate),
    lte(hePeriods.mesReferencia, endDate),
    sql`${hePeriods.status} <> 'cancelado'`,
  ];

  const [allPeriodsRaw, allEmps, empObraAlocs, allObras, allPayroll] = await Promise.all([
    db.select().from(hePeriods).where(and(...periodConditions)),
    db.select({
      id: employees.id, nomeCompleto: employees.nomeCompleto, cargo: employees.cargo,
      setor: employees.setor, valorHora: employees.valorHora, funcao: employees.funcao, status: employees.status,
    }).from(employees).where(and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`)),
    // IMPORTANTE: carregamos TODAS as alocações (ativas e encerradas) para
    // resolver a obra vigente em cada mesReferencia da HE — usar só
    // isActive=1 atribui HE histórica à obra ATUAL do funcionário, o que
    // distorce o ranking por obra (ex.: HE de Mar/2026 indo para uma obra
    // onde a pessoa só foi alocada em Mai/2026).
    db.select({
      employeeId: obraFuncionarios.employeeId,
      obraId: obraFuncionarios.obraId,
      dataInicio: obraFuncionarios.dataInicio,
      dataFim: obraFuncionarios.dataFim,
      isActive: obraFuncionarios.isActive,
    }).from(obraFuncionarios).where(companyWhere(obraFuncionarios, companyId, companyIds)),
    db.select({ id: obras.id, nome: obras.nome }).from(obras).where(and(companyWhere(obras, companyId, companyIds), sql`${obras.deletedAt} IS NULL`)),
    db.select().from(payroll).where(and(companyWhere(payroll, companyId, companyIds), gte(payroll.mesReferencia, startDate), lte(payroll.mesReferencia, endDate))),
  ]);

  // Vínculo "atual" (apenas para filtro de colaboradores na sidebar — não usado
  // mais para atribuir HE a obra histórica).
  const empObraIdMap = new Map<number, number>();
  for (const a of empObraAlocs) {
    if (a.isActive === 1 && !empObraIdMap.has(a.employeeId)) empObraIdMap.set(a.employeeId, a.obraId);
  }

  // Index por funcionário para lookup rápido por mês
  const empAlocsByEmp = new Map<number, typeof empObraAlocs>();
  for (const a of empObraAlocs) {
    if (!empAlocsByEmp.has(a.employeeId)) empAlocsByEmp.set(a.employeeId, [] as any);
    empAlocsByEmp.get(a.employeeId)!.push(a);
  }

  // Resolve a obra vigente do funcionário durante um mesReferencia ('YYYY-MM').
  // Critério: alocação cujo intervalo [dataInicio, dataFim] intersecta com
  // o mês inteiro. Se houver mais de uma, prefere a com dataInicio mais recente
  // dentro do mês; em empate, a alocação ativa.
  const resolveObraIdNoMes = (employeeId: number, mesRef: string): number | null => {
    const list = empAlocsByEmp.get(employeeId);
    if (!list || !list.length || !mesRef || mesRef.length < 7) return null;
    const ano = mesRef.slice(0, 4), mes = mesRef.slice(5, 7);
    const firstDay = `${ano}-${mes}-01`;
    // último dia do mês
    const lastDayDate = new Date(Number(ano), Number(mes), 0); // dia 0 do mês seguinte = último do atual
    const lastDay = `${ano}-${mes}-${String(lastDayDate.getDate()).padStart(2, "0")}`;
    let best: { obraId: number; dataInicio: string | null; isActive: number } | null = null;
    for (const a of list) {
      const ini = a.dataInicio;
      const fim = a.dataFim;
      const startsBeforeOrInMonth = !ini || ini <= lastDay;
      const endsAfterOrInMonth    = !fim || fim >= firstDay;
      if (!startsBeforeOrInMonth || !endsAfterOrInMonth) continue;
      if (!best) { best = { obraId: a.obraId, dataInicio: ini, isActive: a.isActive }; continue; }
      const cmp = (a.dataInicio || "") .localeCompare(best.dataInicio || "");
      if (cmp > 0 || (cmp === 0 && a.isActive > best.isActive)) {
        best = { obraId: a.obraId, dataInicio: ini, isActive: a.isActive };
      }
    }
    return best?.obraId ?? null;
  };

  const empMap = new Map(allEmps.map(e => [e.id, { ...e, obraAtualId: empObraIdMap.get(e.id) || null }]));
  const obraMap = new Map(allObras.map(o => [o.id, o.nome]));

  // Escolhe 1 período por (companyId, mesReferencia) — prioridade de status, desempate pelo id mais alto.
  const chosenByKey = new Map<string, typeof allPeriodsRaw[number]>();
  for (const p of allPeriodsRaw) {
    const key = `${p.companyId}::${p.mesReferencia}`;
    const cur = chosenByKey.get(key);
    if (!cur) { chosenByKey.set(key, p); continue; }
    const a = pickPriority(p.status), b = pickPriority(cur.status);
    if (a > b || (a === b && p.id > cur.id)) chosenByKey.set(key, p);
  }
  const chosenPeriods = Array.from(chosenByKey.values());
  const periodIdToMes = new Map(chosenPeriods.map(p => [p.id, p.mesReferencia]));
  const periodIds = chosenPeriods.map(p => p.id);

  // Carrega linhas de funcionário dos períodos escolhidos
  let allRows: any[] = [];
  if (periodIds.length > 0) {
    const empConds: any[] = [inArray(hePeriodEmployees.hePeriodId, periodIds)];
    if (filters?.employeeId) empConds.push(eq(hePeriodEmployees.employeeId, filters.employeeId));
    allRows = await db.select().from(hePeriodEmployees).where(and(...empConds));
  }

  // Filtro por obra: usa a obra vigente no mesReferencia da própria HE,
  // não o vínculo atual — assim mantém coerência com os rankings/detalhes.
  if (filters?.obraId) {
    allRows = allRows.filter(r => {
      const mesRef = periodIdToMes.get(r.hePeriodId) ?? "";
      return resolveObraIdNoMes(r.employeeId, mesRef) === filters.obraId;
    });
  }

  // Helpers
  const minsToHours = (m: number) => m / 60;

  let totalHoras = 0, totalValor = 0;
  for (const r of allRows) {
    totalHoras += minsToHours(Number(r.heTotalMins || 0));
    totalValor += parseFloat(r.valorHETotal || "0");
  }

  // Por pessoa
  const porPessoa: Record<number, { horas: number; valor: number; registros: number }> = {};
  for (const r of allRows) {
    if (!porPessoa[r.employeeId]) porPessoa[r.employeeId] = { horas: 0, valor: 0, registros: 0 };
    porPessoa[r.employeeId].horas += minsToHours(Number(r.heTotalMins || 0));
    porPessoa[r.employeeId].valor += parseFloat(r.valorHETotal || "0");
    porPessoa[r.employeeId].registros++;
  }

  const rankingPessoa = Object.entries(porPessoa)
    .filter(([, d]) => d.horas > 0 || d.valor > 0)
    .map(([empId, data]) => {
      const employeeId = Number(empId);
      const emp = empMap.get(employeeId);
      return {
        employeeId,
        nome: emp?.nomeCompleto || `Func. ${empId}`,
        funcao: emp?.funcao || emp?.cargo || "-",
        setor: emp?.setor || "-",
        valorHora: emp?.valorHora || "0",
        isDesligado: isDesligadoStatus(emp?.status),
        horas: Math.round(data.horas * 100) / 100,
        valor: Math.round(data.valor * 100) / 100,
        registros: data.registros,
      };
    }).sort((a, b) => b.horas - a.horas);

  // Por setor
  const porSetor: Record<string, { horas: number; valor: number; pessoas: Set<number> }> = {};
  for (const r of allRows) {
    const emp = empMap.get(r.employeeId);
    const setor = emp?.setor || "Sem Setor";
    if (!porSetor[setor]) porSetor[setor] = { horas: 0, valor: 0, pessoas: new Set() };
    porSetor[setor].horas += minsToHours(Number(r.heTotalMins || 0));
    porSetor[setor].valor += parseFloat(r.valorHETotal || "0");
    if (Number(r.heTotalMins || 0) > 0) porSetor[setor].pessoas.add(r.employeeId);
  }
  const rankingSetor = Object.entries(porSetor)
    .filter(([, d]) => d.horas > 0 || d.valor > 0)
    .map(([setor, data]) => ({ setor, horas: Math.round(data.horas * 100) / 100, valor: Math.round(data.valor * 100) / 100, pessoas: data.pessoas.size }))
    .sort((a, b) => b.valor - a.valor);

  // Por obra: a HE é atribuída à obra vigente no mesReferencia do período,
  // não à obra atual do funcionário.
  const porObra: Record<string, { horas: number; valor: number; pessoas: Set<number> }> = {};
  for (const r of allRows) {
    const mesRef = periodIdToMes.get(r.hePeriodId) ?? "";
    const obraId = resolveObraIdNoMes(r.employeeId, mesRef);
    const obraNome = obraId ? (obraMap.get(obraId) || `Obra #${obraId}`) : "Sem Obra";
    if (!porObra[obraNome]) porObra[obraNome] = { horas: 0, valor: 0, pessoas: new Set() };
    porObra[obraNome].horas += minsToHours(Number(r.heTotalMins || 0));
    porObra[obraNome].valor += parseFloat(r.valorHETotal || "0");
    if (Number(r.heTotalMins || 0) > 0) porObra[obraNome].pessoas.add(r.employeeId);
  }
  const rankingObra = Object.entries(porObra)
    .filter(([, d]) => d.horas > 0 || d.valor > 0)
    .map(([obra, data]) => ({ obra, horas: Math.round(data.horas * 100) / 100, valor: Math.round(data.valor * 100) / 100, pessoas: data.pessoas.size }))
    .sort((a, b) => b.valor - a.valor);

  // Evolução mensal: agrega minutos e valores por mesReferencia dos períodos escolhidos
  const porMes: Record<string, { horas: number; valor: number; registros: number }> = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${targetYear}-${String(m).padStart(2, "0")}`;
    porMes[key] = { horas: 0, valor: 0, registros: 0 };
  }
  for (const r of allRows) {
    const mesRef = periodIdToMes.get(r.hePeriodId);
    if (mesRef && porMes[mesRef]) {
      porMes[mesRef].horas += minsToHours(Number(r.heTotalMins || 0));
      porMes[mesRef].valor += parseFloat(r.valorHETotal || "0");
      porMes[mesRef].registros++;
    }
  }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, data]) => ({ mes, horas: Math.round(data.horas * 100) / 100, valor: Math.round(data.valor * 100) / 100, registros: data.registros }));

  // Percentuais: separa minutos 50% (úteis) vs 100% (domingos/feriados)
  let mins50 = 0, mins100 = 0;
  for (const r of allRows) {
    mins50  += Number(r.heUtilMins || 0);
    mins100 += Number(r.heFimMins  || 0);
  }
  const percentuais: { percentual: string; count: number }[] = [];
  if (mins50  > 0) percentuais.push({ percentual: "50%",  count: Math.round(minsToHours(mins50)  * 100) / 100 });
  if (mins100 > 0) percentuais.push({ percentual: "100%", count: Math.round(minsToHours(mins100) * 100) / 100 });

  // % sobre folha (mantém fallback a partir da tabela payroll quando houver)
  let totalFolhaBruto = 0;
  for (const p of allPayroll) totalFolhaBruto += parseFloat((p as any).salarioBruto || "0");
  const percentualHEsobreFolha = totalFolhaBruto > 0 ? (totalValor / totalFolhaBruto) * 100 : 0;

  const pessoasComHE = Object.values(porPessoa).filter(d => d.horas > 0).length;
  const totalRegistros = allRows.filter(r => Number(r.heTotalMins || 0) > 0).length;

  // Listas para filtros no frontend
  const obrasDisponiveis = allObras.map(o => ({ id: o.id, nome: o.nome })).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
  const colaboradoresDisponiveis = allEmps
    .filter(e => porPessoa[e.id] && porPessoa[e.id].horas > 0)
    .map(e => ({ id: e.id, nome: e.nomeCompleto, funcao: e.funcao || e.cargo || "-" }))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  // Detalhe por linha de funcionário (uma linha = um colaborador num período)
  const detalhes = allRows
    .filter(r => Number(r.heTotalMins || 0) > 0 || parseFloat(r.valorHETotal || "0") > 0)
    .map(r => {
      const emp = empMap.get(r.employeeId);
      const mesRefRow = periodIdToMes.get(r.hePeriodId) ?? "";
      const obraId = resolveObraIdNoMes(r.employeeId, mesRefRow);
      const horas50  = minsToHours(Number(r.heUtilMins || 0));
      const horas100 = minsToHours(Number(r.heFimMins  || 0));
      // Frontend já concatena '%' ao renderizar — então mandamos só o número
      // ou "50/100" quando há acréscimos mistos no mesmo período.
      let pctLabel = "50";
      if (horas50 > 0 && horas100 > 0) pctLabel = "50/100";
      else if (horas100 > 0)           pctLabel = "100";
      const mesRef = periodIdToMes.get(r.hePeriodId) ?? "";
      return {
        id: r.id,
        mesReferencia: mesRef,
        nome: emp?.nomeCompleto || r.nome || `Func. ${r.employeeId}`,
        employeeId: r.employeeId,
        funcao: emp?.funcao || emp?.cargo || "-",
        setor: emp?.setor || "-",
        isDesligado: isDesligadoStatus(emp?.status),
        obra: obraId ? (obraMap.get(obraId) || `Obra #${obraId}`) : "Sem Obra",
        horas: Math.round(minsToHours(Number(r.heTotalMins || 0)) * 100) / 100,
        percentual: pctLabel,
        valorHoraBase: parseFloat(r.valorHora || "0"),
        valorTotal: parseFloat(r.valorHETotal || "0"),
        descricao: r.destinacao ? `Destinação: ${r.destinacao}` : "",
      };
    }).sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));

  return {
    resumo: {
      totalHoras: Math.round(totalHoras * 100) / 100,
      totalValor: Math.round(totalValor * 100) / 100,
      totalRegistros,
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
    percentuais,
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

  const [allEpis, allDel, allEmps, epiEmpObraAlocs, allObras] = await Promise.all([
    db.select().from(epis).where(companyFilter),
    db.select().from(epiDeliveries).where(and(delFilter, isNull(epiDeliveries.deletedAt))),
    db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, status: employees.status, fotoUrl: employees.fotoUrl })
      .from(employees).where(and(empFilter, isNull(employees.deletedAt))),
    db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
      .from(obraFuncionarios).where(and(ids.length === 1 ? eq(obraFuncionarios.companyId, ids[0]) : inArray(obraFuncionarios.companyId, ids), eq(obraFuncionarios.isActive, 1))),
    db.select({ id: obras.id, nome: obras.nome }).from(obras).where(obraFilter),
  ]);
  const epiEmpObraMap = new Map(epiEmpObraAlocs.map(a => [a.employeeId, a.obraId]));
  const empMap = new Map(allEmps.map(e => [e.id, { ...e, obraAtualId: epiEmpObraMap.get(e.id) || null }]));
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

  const todosEpisResumo = allEpis.map(e => ({
    nome: e.nome,
    ca: e.ca,
    estoque: e.quantidadeEstoque || 0,
    valorUnit: e.valorProduto ? parseFloat(String(e.valorProduto)) : 0,
    validadeCa: e.validadeCa,
    categoria: e.categoria === 'Calcado' ? 'Calçado' : (e.categoria || 'EPI'),
  }));

  const ha30dias30 = new Date();
  ha30dias30.setDate(ha30dias30.getDate() - 30);
  const ha30dStr = ha30dias30.toISOString().split("T")[0];
  const entregas30dPorEpi: Record<number, { nome: string; ca: string; qtd: number; entregas: number }> = {};
  for (const d of allDel) {
    if (d.dataEntrega >= ha30dStr) {
      if (!entregas30dPorEpi[d.epiId]) {
        const ep = allEpis.find(e => e.id === d.epiId);
        entregas30dPorEpi[d.epiId] = { nome: ep?.nome || "EPI #" + d.epiId, ca: ep?.ca || '-', qtd: 0, entregas: 0 };
      }
      entregas30dPorEpi[d.epiId].qtd += d.quantidade;
      entregas30dPorEpi[d.epiId].entregas++;
    }
  }
  const topEpis30d = Object.values(entregas30dPorEpi).sort((a, b) => b.qtd - a.qtd).slice(0, 15);

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
      return { id: Number(empId), nome: emp?.nome || `Func. ${empId}`, funcao: emp?.funcao || "-", isDesligado: isDesligadoStatus(emp?.status), qtd: d.qtd, entregas: d.entregas, custo: d.custo };
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
    topEpis30d,
    todosEpisResumo,
    topFuncionarios,
    estoqueCritico,
    caVencidos: caVencido.map(e => ({ nome: e.nome, ca: e.ca, validadeCa: e.validadeCa })),
    casVencendo,
    porCategoria,
    custoPorObraList,
    porMotivo,
    entregasDetalhe: allDel.map(del => {
      const motivo = del.motivoTroca || del.motivo || 'Entrega regular';
      const label = motivo === 'mau_uso' ? 'Mau uso' : motivo === 'perda' ? 'Perda' : motivo === 'furto' ? 'Furto' : motivo === 'extravio' ? 'Extravio' : motivo === 'desgaste_normal' ? 'desgaste_normal' : motivo === 'desgaste' ? 'Desgaste' : motivo;
      const emp = empMap.get(del.employeeId || 0);
      const epi = allEpis.find(e => e.id === del.epiId);
      const obraId = del.employeeId ? epiEmpObraMap.get(del.employeeId) : null;
      const obra = obraId ? obraMap.get(obraId) : null;
      return {
        funcionario: emp?.nome || 'Não identificado',
        funcao: emp?.funcao || '',
        epi: epi?.nome || 'EPI não encontrado',
        data: del.dataEntrega,
        quantidade: del.quantidade,
        motivo: label,
        obra: obra || null,
        valorCobrado: del.valorCobrado ? parseFloat(String(del.valorCobrado)) : null,
      };
    }),
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

    vidaUtilAnalise: (() => {
      const episComVidaUtil = allEpis.filter(e => e.tempoMinimoTroca && e.tempoMinimoTroca > 0);
      if (episComVidaUtil.length === 0) return [];

      return episComVidaUtil.map(epi => {
        const entregas = allDel
          .filter(d => d.epiId === epi.id)
          .sort((a, b) => (a.dataEntrega || '').localeCompare(b.dataEntrega || ''));

        const porFunc: Record<number, { datas: string[]; motivos: string[] }> = {};
        for (const d of entregas) {
          if (!d.employeeId) continue;
          if (!porFunc[d.employeeId]) porFunc[d.employeeId] = { datas: [], motivos: [] };
          if (d.dataEntrega) {
            porFunc[d.employeeId].datas.push(d.dataEntrega);
            porFunc[d.employeeId].motivos.push(d.motivoTroca || d.motivo || 'regular');
          }
        }

        const intervalos: number[] = [];
        const funcDetalhe: { employeeId: number; nome: string; funcao: string; fotoUrl: string | null; isDesligado: boolean; diasReal: number; entregas: number; datasEntrega: string[]; motivos: string[] }[] = [];

        for (const [empIdStr, info] of Object.entries(porFunc)) {
          const empId = Number(empIdStr);
          const emp = empMap.get(empId);
          const { datas, motivos } = info;
          if (datas.length < 2) {
            funcDetalhe.push({
              employeeId: empId,
              nome: emp?.nome || `Func. ${empId}`,
              funcao: emp?.funcao || '-',
              fotoUrl: emp?.fotoUrl || null,
              isDesligado: isDesligadoStatus(emp?.status),
              diasReal: 0,
              entregas: datas.length,
              datasEntrega: datas,
              motivos,
            });
            continue;
          }
          let somaIntervalo = 0;
          let count = 0;
          for (let i = 1; i < datas.length; i++) {
            const d1 = new Date(datas[i - 1]);
            const d2 = new Date(datas[i]);
            const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
            if (diff > 0 && diff < 365) {
              intervalos.push(diff);
              somaIntervalo += diff;
              count++;
            }
          }
          funcDetalhe.push({
            employeeId: empId,
            nome: emp?.nome || `Func. ${empId}`,
            funcao: emp?.funcao || '-',
            fotoUrl: emp?.fotoUrl || null,
            isDesligado: isDesligadoStatus(emp?.status),
            diasReal: count > 0 ? Math.round(somaIntervalo / count) : 0,
            entregas: datas.length,
            datasEntrega: datas,
            motivos,
          });
        }

        if (intervalos.length === 0) return null;

        const mediaReal = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length);
        const esperado = epi.tempoMinimoTroca!;
        const percentual = Math.round((mediaReal / esperado) * 100);
        const status = percentual >= 80 ? 'ok' : percentual >= 50 ? 'atencao' : 'critico';

        const motivosTroca: Record<string, number> = {};
        for (const d of entregas) {
          const m = d.motivoTroca || d.motivo || 'regular';
          motivosTroca[m] = (motivosTroca[m] || 0) + 1;
        }

        return {
          epiId: epi.id,
          nome: epi.nome,
          ca: epi.ca,
          categoria: epi.categoria === 'Calcado' ? 'Calçado' : (epi.categoria || 'EPI'),
          esperado,
          mediaReal,
          percentual,
          status,
          totalEntregas: entregas.length,
          funcComTroca: funcDetalhe.filter(f => f.entregas >= 2).length,
          funcDetalhe: funcDetalhe.sort((a, b) => b.entregas - a.entregas),
          motivosTroca,
        };
      }).filter(Boolean);
    })(),

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
      passivoProvavel: Math.round(Object.values(valorPorRisco).reduce((s, v) => s + v, 0) * 100) / 100,
      creditoReceber: 0,
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
// 6b. DASHBOARD TRIBUTÁRIO
// ============================================================
async function getDashTributario(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];

  const allProcessos = await db.select().from(processosTributarios)
    .where(companyWhere(processosTributarios, companyId, companyIds));

  const parseBRLVal = (val: string | null) => {
    if (!val) return 0;
    const clean = val.replace(/R\$\s*/g, "").trim();
    if (clean.includes(",")) return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(clean) || 0;
  };

  let totalValorCausa = 0, totalValorCondenacao = 0, totalAutoInfracao = 0, totalValorPago = 0;
  for (const p of allProcessos) {
    totalValorCausa += parseBRLVal(p.valorCausa);
    totalValorCondenacao += parseBRLVal(p.valorCondenacao);
    totalAutoInfracao += parseBRLVal(p.valorAutoInfracao);
    totalValorPago += parseBRLVal(p.valorPago);
  }

  const porStatus: Record<string, number> = {};
  for (const p of allProcessos) porStatus[p.status] = (porStatus[p.status] || 0) + 1;

  const porRisco: Record<string, number> = {};
  for (const p of allProcessos) porRisco[p.risco] = (porRisco[p.risco] || 0) + 1;

  const porFase: Record<string, number> = {};
  for (const p of allProcessos) porFase[p.fase] = (porFase[p.fase] || 0) + 1;

  const porTributo: Record<string, number> = {};
  for (const p of allProcessos) porTributo[p.tipoTributo] = (porTributo[p.tipoTributo] || 0) + 1;

  const porEsfera: Record<string, number> = {};
  for (const p of allProcessos) porEsfera[p.esfera] = (porEsfera[p.esfera] || 0) + 1;

  const porMes: Record<string, number> = {};
  for (const p of allProcessos) {
    const mes = p.dataDistribuicao?.substring(0, 7) || "Desconhecido";
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, count]) => ({ mes, count }));

  const valorPorRisco: Record<string, number> = {};
  for (const p of allProcessos) {
    if (p.status !== "encerrado" && p.status !== "arquivado") {
      const risco = p.risco || "medio";
      valorPorRisco[risco] = (valorPorRisco[risco] || 0) + parseBRLVal(p.valorCausa);
    }
  }

  const processosAtivos = allProcessos.filter(p => p.status !== "encerrado" && p.status !== "arquivado").length;
  const processosEncerrados = allProcessos.filter(p => p.status === "encerrado" || p.status === "arquivado").length;

  const proximasAudiencias = allProcessos
    .filter(p => p.dataAudiencia && p.dataAudiencia >= hoje)
    .map(p => ({
      numero: p.numeroProcesso,
      contribuinte: p.contribuinte,
      tributo: p.tipoTributo,
      data: p.dataAudiencia,
      status: p.status,
      risco: p.risco,
    }))
    .sort((a, b) => (a.data || "").localeCompare(b.data || "")).slice(0, 10);

  return {
    resumo: {
      totalProcessos: allProcessos.length,
      processosAtivos,
      processosEncerrados,
      totalValorCausa: Math.round(totalValorCausa * 100) / 100,
      totalValorCondenacao: Math.round(totalValorCondenacao * 100) / 100,
      totalAutoInfracao: Math.round(totalAutoInfracao * 100) / 100,
      totalValorPago: Math.round(totalValorPago * 100) / 100,
      valorEmRisco: Math.round(Object.values(valorPorRisco).reduce((s, v) => s + v, 0) * 100) / 100,
    },
    porStatus: Object.entries(porStatus).map(([label, value]) => ({ label: label.replace(/_/g, " "), value })),
    porRisco: Object.entries(porRisco).map(([label, value]) => ({ label, value })),
    porFase: Object.entries(porFase).map(([label, value]) => ({ label, value })),
    porTributo: Object.entries(porTributo).map(([label, value]) => ({ label, value })),
    porEsfera: Object.entries(porEsfera).map(([label, value]) => ({ label, value })),
    evolucaoMensal,
    valorPorRisco: Object.entries(valorPorRisco).map(([risco, valor]) => ({ risco, valor: Math.round(valor * 100) / 100 })),
    proximasAudiencias,
  };
}

// ============================================================
// 6c. DASHBOARD CIVIL
// ============================================================
async function getDashCivil(companyId: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];

  const allProcessos = await db.select().from(processosCivis)
    .where(companyWhere(processosCivis, companyId, companyIds));

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

  const porStatus: Record<string, number> = {};
  for (const p of allProcessos) porStatus[p.status] = (porStatus[p.status] || 0) + 1;

  const porRisco: Record<string, number> = {};
  for (const p of allProcessos) porRisco[p.risco] = (porRisco[p.risco] || 0) + 1;

  const porFase: Record<string, number> = {};
  for (const p of allProcessos) porFase[p.fase] = (porFase[p.fase] || 0) + 1;

  const porTipoAcao: Record<string, number> = {};
  for (const p of allProcessos) porTipoAcao[p.tipoAcao] = (porTipoAcao[p.tipoAcao] || 0) + 1;

  const porMes: Record<string, number> = {};
  for (const p of allProcessos) {
    const mes = p.dataDistribuicao?.substring(0, 7) || "Desconhecido";
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, count]) => ({ mes, count }));

  const valorPorRisco: Record<string, number> = {};
  let passivoProvavel = 0, creditoReceber = 0;
  for (const p of allProcessos) {
    if (p.status !== "encerrado" && p.status !== "arquivado") {
      const risco = p.risco || "medio";
      const val = parseBRLVal(p.valorCausa);
      const polo = (p as any).polo || "passivo";
      if (polo === "ativo") {
        creditoReceber += val;
      } else {
        valorPorRisco[risco] = (valorPorRisco[risco] || 0) + val;
        passivoProvavel += val;
      }
    }
  }

  const processosAtivos = allProcessos.filter(p => p.status !== "encerrado" && p.status !== "arquivado").length;
  const processosEncerrados = allProcessos.filter(p => p.status === "encerrado" || p.status === "arquivado").length;

  const proximasAudiencias = allProcessos
    .filter(p => p.dataAudiencia && p.dataAudiencia >= hoje)
    .map(p => ({
      numero: p.numeroProcesso,
      autor: p.autor,
      reu: p.reu,
      tipoAcao: p.tipoAcao,
      data: p.dataAudiencia,
      status: p.status,
      risco: p.risco,
    }))
    .sort((a, b) => (a.data || "").localeCompare(b.data || "")).slice(0, 10);

  return {
    resumo: {
      totalProcessos: allProcessos.length,
      processosAtivos,
      processosEncerrados,
      totalValorCausa: Math.round(totalValorCausa * 100) / 100,
      totalValorCondenacao: Math.round(totalValorCondenacao * 100) / 100,
      totalValorAcordo: Math.round(totalValorAcordo * 100) / 100,
      totalValorPago: Math.round(totalValorPago * 100) / 100,
      valorEmRisco: Math.round(passivoProvavel * 100) / 100,
      passivoProvavel: Math.round(passivoProvavel * 100) / 100,
      creditoReceber: Math.round(creditoReceber * 100) / 100,
    },
    porStatus: Object.entries(porStatus).map(([label, value]) => ({ label: label.replace(/_/g, " "), value })),
    porRisco: Object.entries(porRisco).map(([label, value]) => ({ label, value })),
    porFase: Object.entries(porFase).map(([label, value]) => ({ label, value })),
    porTipoAcao: Object.entries(porTipoAcao).map(([label, value]) => ({ label: label.replace(/_/g, " "), value })),
    evolucaoMensal,
    valorPorRisco: Object.entries(valorPorRisco).map(([risco, valor]) => ({ risco, valor: Math.round(valor * 100) / 100 })),
    proximasAudiencias,
  };
}

// ============================================================
// DRILL-DOWN: buscar funcionários detalhados por filtro
// ============================================================
async function getDrillDown(companyId: number, filterType: string, filterValue: string, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return [];

  let whereClause = and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`);
  // Rev. 2627 — teto de linhas do drill. Por padrão 100; o snapshot "ativos no
  // fim do ano" pode passar de 100 e PRECISA bater com o nº do card (paridade),
  // então elevamos o teto pra esse caso (a empresa tem poucas centenas de pessoas).
  let rowLimit = 100;

  // Rev. 2619 — filtros HISTÓRICOS (por mês) dependem das DATAS, não do status atual:
  // demissões/ativos-no-fim-do-mês/movimentação precisam INCLUIR Desligado/Lista_Negra
  // (quem foi demitido no mês hoje está Desligado). Só os snapshots atuais excluem.
  const HISTORICOS_MES = ['admissaoMes', 'demissaoMes', 'ativosMes', 'movimentacaoMes', 'ativosAno'];
  // Para drill-downs que não são por status nem históricos, excluir Desligado e Lista_Negra
  if (filterType !== 'status' && !HISTORICOS_MES.includes(filterType)) {
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
        // Sem acento + sem caixa: "Guaratinguetá" = "Guaratingueta" = "GUARATINGUETA"
        whereClause = and(whereClause, sql`
          LOWER(TRANSLATE(COALESCE(${employees.cidade},''),
            'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
            'aaaaaaeeeeiiiiooooouuuucAAAAEEEEIIIIOOOOOUUUUC'))
          =
          LOWER(TRANSLATE(${filterValue},
            'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
            'aaaaaaeeeeiiiiooooouuuucAAAAEEEEIIIIOOOOOUUUUC'))
        `);
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
      // Rev. 1777 — colunas camelCase precisam de aspas duplas no Postgres
      whereClause = and(whereClause, sql`TO_CHAR("dataAdmissao", 'YYYY-MM') = ${filterValue}`);
      break;
    }
    case 'demissaoMes': {
      // filterValue = "2025-03"
      // Rev. 1777 — colunas camelCase precisam de aspas duplas no Postgres
      whereClause = and(whereClause, sql`TO_CHAR("dataDemissao", 'YYYY-MM') = ${filterValue}`);
      break;
    }
    case 'ativosMes': {
      // Rev. 2619 — filterValue = "2025-03" — ativos no FIM do mês
      // (admitido até o fim do mês E sem demissão ou demitido só depois). Mesma régra do comparativo mensal.
      const fimMes = sql`(TO_DATE(${filterValue}, 'YYYY-MM') + interval '1 month - 1 day')::date`;
      whereClause = and(whereClause,
        sql`"dataAdmissao"::date <= ${fimMes}`,
        sql`("dataDemissao" IS NULL OR "dataDemissao"::date > ${fimMes})`);
      break;
    }
    case 'movimentacaoMes': {
      // Rev. 2619 — filterValue = "2025-03" — admitido OU demitido no mês (base do Saldo e do Turnover)
      whereClause = and(whereClause,
        sql`(TO_CHAR("dataAdmissao", 'YYYY-MM') = ${filterValue} OR TO_CHAR("dataDemissao", 'YYYY-MM') = ${filterValue})`);
      break;
    }
    case 'ativosAno': {
      // Rev. 2627 — filterValue = "2024" — quadro ativo ao FIM do ano (31/12):
      // admitido até 31/12 do ano E (sem demissão OU demitido só depois).
      // Mesma régua do headcount anual → o nº exibido casa com a lista.
      if (!/^\d{4}$/.test(filterValue)) return [];
      const yr = parseInt(filterValue, 10);
      if (!yr || yr < 1900 || yr > 3000) return [];
      const fimAno = sql`make_date(${yr}, 12, 31)`;
      whereClause = and(whereClause,
        sql`"dataAdmissao" IS NOT NULL`,
        sql`"dataAdmissao"::date <= ${fimAno}`,
        sql`("dataDemissao" IS NULL OR "dataDemissao"::date > ${fimAno})`);
      // Paridade card↔lista: sem teto de 100 (snapshot anual pode ser maior).
      rowLimit = 100000;
      break;
    }
    default:
      return [];
  }

  const results = await db.select({
    id: employees.id,
    nome: employees.nomeCompleto,
    fotoUrl: employees.fotoUrl,
    funcao: employees.funcao,
    setor: employees.setor,
    status: employees.status,
    dataAdmissao: employees.dataAdmissao,
    dataDemissao: employees.dataDemissao,
    dataNascimento: employees.dataNascimento,
    sexo: employees.sexo,
    cidade: employees.cidade,
    tipoContrato: employees.tipoContrato,
  }).from(employees).where(whereClause).orderBy(employees.nomeCompleto).limit(rowLimit);

  // ────────────────────────────────────────────────────────────────────────
  // Enriquecimento (Rev. 3290): OBRA ativa + status CIPA por funcionário.
  // Pedido do piloto FC: na drill-down "Função: X", mostrar a obra em que a
  // pessoa está e se ela é da CIPA ATIVA (mandato vigente) ou membro da CIPA de
  // um mandato ANTERIOR mas que AINDA tem estabilidade (Art. 10 ADCT — até 1
  // ano após o fim do mandato). 100% aditivo · READ-ONLY · sem N+1 (2 queries).
  const empIds = results.map((r) => r.id).filter((n): n is number => Number.isFinite(n));
  const obraMap = new Map<number, string>();
  const cipaMap = new Map<
    number,
    { status: "ativa" | "estavel_anterior"; cargo: string | null; fimEstabilidade: string | null }
  >();
  if (empIds.length > 0) {
    try {
      // Obra ativa (≤1 alocação ativa por funcionário — uniq index).
      const obraRows = await db
        .select({ employeeId: obraFuncionarios.employeeId, obraNome: obras.nome })
        .from(obraFuncionarios)
        .innerJoin(obras, eq(obraFuncionarios.obraId, obras.id))
        .where(
          and(
            companyWhere(obraFuncionarios, companyId, companyIds),
            eq(obraFuncionarios.isActive, 1),
            inArray(obraFuncionarios.employeeId, empIds),
          ),
        );
      for (const o of obraRows) {
        if (o.employeeId != null && o.obraNome && !obraMap.has(o.employeeId)) {
          obraMap.set(o.employeeId, o.obraNome);
        }
      }
    } catch (e) {
      console.error("[getDrillDown] falha ao derivar obra ativa:", e);
    }
    try {
      // CIPA: membro de mandato vigente (mandatoFim >= hoje) = "ativa"; senão,
      // membro com estabilidade ainda vigente (fimEstabilidade >= hoje) de um
      // mandato anterior = "estavel_anterior". CIPA ativa tem prioridade.
      const hoje = new Date().toISOString().split("T")[0];
      const cipaRows = await db
        .select({
          employeeId: cipaMembers.employeeId,
          cargoCipa: cipaMembers.cargoCipa,
          fimEstabilidade: cipaMembers.fimEstabilidade,
          mandatoFim: cipaElections.mandatoFim,
        })
        .from(cipaMembers)
        .innerJoin(cipaElections, eq(cipaMembers.electionId, cipaElections.id))
        .where(
          and(
            companyWhere(cipaMembers, companyId, companyIds),
            inArray(cipaMembers.employeeId, empIds),
            // Mesma régua de "membro válido" do módulo CIPA (checkEstabilidade):
            // ignora membros encerrados, que não contam p/ vigência nem estabilidade.
            sql`${cipaMembers.statusMembro} != 'Encerrado'`,
          ),
        );
      for (const c of cipaRows) {
        if (c.employeeId == null) continue;
        const ativa = !!c.mandatoFim && c.mandatoFim >= hoje;
        const estavel = !!c.fimEstabilidade && c.fimEstabilidade >= hoje;
        if (!ativa && !estavel) continue;
        const prev = cipaMap.get(c.employeeId);
        if (ativa) {
          cipaMap.set(c.employeeId, {
            status: "ativa",
            cargo: c.cargoCipa ?? null,
            fimEstabilidade: c.fimEstabilidade ?? null,
          });
        } else if (estavel && (!prev || prev.status !== "ativa")) {
          cipaMap.set(c.employeeId, {
            status: "estavel_anterior",
            cargo: c.cargoCipa ?? null,
            fimEstabilidade: c.fimEstabilidade ?? null,
          });
        }
      }
    } catch (e) {
      console.error("[getDrillDown] falha ao derivar status CIPA:", e);
    }
  }

  return results.map((r) => {
    const cipa = cipaMap.get(r.id);
    return {
      ...r,
      obra: obraMap.get(r.id) ?? null,
      cipaStatus: cipa?.status ?? null,
      cipaCargo: cipa?.cargo ?? null,
      cipaFimEstabilidade: cipa?.fimEstabilidade ?? null,
    };
  });
}

// ============================================================
// 8.B  CUSTO DE DEMISSÃO EM MASSA (Rev. 1908)
// ------------------------------------------------------------
// Lista TODOS os funcionários ATIVOS da empresa e estima o custo
// de uma rescisão sem justa causa (tipo='empregador_indenizado',
// pior caso para o caixa: paga tudo de uma vez, inclui aviso prévio
// indenizado + multa 40% FGTS). Ordena do MAIS CARO ao mais barato.
// dataReferencia é o último dia trabalhado (default = HOJE).
// VR e descontos NÃO entram nesta estimativa rápida em massa —
// é uma fotografia de "provisão de caixa" para a diretoria.
// ============================================================
async function getDashCustoDemissaoMassa(
  companyId: number,
  dataReferencia?: string,
  companyIds?: number[],
  tipoParam?: 'empregador_indenizado' | 'empregador_trabalhado',
) {
  const db = await getDb();
  if (!db) return null;
  const dataRef = dataReferencia || new Date().toISOString().split('T')[0];
  // Rev. 1921 — Seletor de TIPO (default 'empregador_trabalhado' p/ paridade
  // direta com o módulo oficial Aviso Prévio, que é o cenário que o usuário
  // simula com mais frequência). Mantém 'empregador_indenizado' como pior
  // cenário (pago tudo de uma vez, inclui aviso prévio indenizado completo).
  const tipo = tipoParam === 'empregador_indenizado' ? 'empregador_indenizado' : 'empregador_trabalhado';
  // Rev. 4681 — poka-yoke: fontes que falharam (custo sai parcial) → a tela avisa
  const fontesComFalha: string[] = [];

  const baseWhere = and(
    companyWhere(employees, companyId, companyIds),
    sql`${employees.deletedAt} IS NULL`,
  );
  const activeWhere = and(
    baseWhere,
    sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
    // Rev. 1915 — Excluir PJ e Sócios da lista de Custo de Demissão em Massa.
    // Decisão do usuário (16/05/2026, screenshot tabela CDM): "Quem é PJ é sócio
    // não entra nesta lista". PJ e Sócio não são CLT, não geram rescisão
    // trabalhista (aviso prévio, férias, 13º, multa FGTS) — incluí-los na
    // provisão de caixa de demissão era contabilmente incorreto. Critério
    // idêntico ao usado em avisoPrevioFerias.ts L2291/2463/2486/2558 e em
    // dashboards.ts L94 (KPIs Visão Geral RH) — fonte de verdade do módulo.
    sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
    // Rev. 1923 — Excluir RECLUSOS e AFASTADOS de longa duração (>15 dias).
    // User (16/05/2026, screenshot CDM listando funcionários afastados de longa
    // data): "TIRE DA LISTA OS AFASTADOS ACIMA DE 15 DIAS E OS RECLUSOS".
    // Justificativa: Recluso = contrato suspenso (auxílio-reclusão INSS, sem
    // remuneração do empregador). Afastado >15d = INSS toma conta (B91/B31,
    // CLT Art. 60 §3º). Em ambos os casos, demitir AGORA seria juridicamente
    // inviável (estabilidade) e contabilmente irrelevante (não consome caixa
    // do empregador no curto prazo). Critério idêntico ao homeData.ts da
    // Rev. 14716 (Central de Alertas): status='Afastado' há mais de 15 dias é
    // proxy seguro para "fora da operação por longo prazo". Sem
    // licencaDataInicio (legado), trata como longo prazo (status setado nunca
    // por acaso). Atestados curtos ≤15d (ônus empregador) NÃO mudam status no
    // sistema — ficam só no espelho de ponto.
    sql`${employees.status} <> 'Recluso'`,
    // Rev. 3339 — Excluir quem JÁ está em aviso prévio (status='Aviso').
    // User (20/06/2026, screenshot CDM): "funcionário que já está de aviso não
    // pode aparecer na lista". O módulo Aviso Prévio seta employees.status='Aviso'
    // ao criar o aviso (avisoPrevioFerias.ts L511); mantê-lo na simulação de
    // Custo de Demissão em Massa dupla-contava o passivo (o aviso dele já está
    // em curso) e poluía a lista de "quem eu ainda posso/preciso demitir".
    sql`${employees.status} <> 'Aviso'`,
    sql`NOT (
      ${employees.status} = 'Afastado'
      AND (
        ${employees.licencaDataInicio} IS NULL
        OR ${employees.licencaDataInicio} <= (${dataRef}::date - INTERVAL '15 days')
      )
    )`,
  );

  const rows = await db.select({
    id: employees.id,
    companyId: employees.companyId,
    nomeCompleto: employees.nomeCompleto,
    cpf: employees.cpf,
    cargo: employees.cargo,
    funcao: employees.funcao,
    setor: employees.setor,
    dataAdmissao: employees.dataAdmissao,
    // Rev. 1941 — `fotoUrl` p/ exibir avatar do funcionário na tabela CDM
    // (user 16/05/2026: "COLOCA A FOTO DO FUNCIONARIO AO LADO DO NOME").
    fotoUrl: employees.fotoUrl,
    // Rev. 1931 — `dataNascimento` p/ exibir idade real do funcionário na
    // tabela (user 16/05/2026: "coloca outra coluna com a idade real").
    dataNascimento: employees.dataNascimento,
    salarioBase: employees.salarioBase,
    status: employees.status,
    recebeComplemento: employees.recebeComplemento,
    valorComplemento: employees.valorComplemento,
    // Rev. 1964 — Cols pra cálculo de descontos legais (INSS+IRRF+pensão+sindical)
    // espelhando `buildDescontosContextRescisao` em avisoPrevioFerias.ts L44-67.
    // Permite que o CDM bata 1:1 com o modal "Novo Aviso Prévio" → "TOTAL GERAL".
    // Ajustes operacionais (faltas/vales/EPI/convênios/outros) NÃO entram aqui —
    // são variáveis por mês de competência e ficam só no detalhe individual.
    dependentesIR: employees.dependentesIR,
    pensaoAlimenticia: employees.pensaoAlimenticia,
    pensaoTipo: employees.pensaoTipo,
    pensaoValor: employees.pensaoValor,
    pensaoPercentual: employees.pensaoPercentual,
    pensaoBase: employees.pensaoBase,
    contribuicaoSindical: employees.contribuicaoSindical,
    // Rev. 2953 — seguro de vida mensal RECORRENTE (read-only) p/ projeção de
    // redução de caixa no Combo de Demissões. Coluna varchar do cadastro do
    // funcionário; vazia → 0. (Vale alimentação NÃO vem de employees — vem de
    // meal_benefit_configs, ver Rev. 2955 / `vrDiarioByObra` abaixo.)
    seguroVida: employees.seguroVida,
  }).from(employees).where(activeWhere);

  // Rev. 1921 — Datas espelham EXATAMENTE o módulo Aviso Prévio oficial
  // (`avisoPrevioFerias.ts` L915-956 — `prevTrab`/`prevInd`):
  //   dataDesligamento = dataRef (último dia trabalhado informado pelo user)
  //   dataInicioAviso  = dataRef + 1
  //   dataFimAviso     = dataInicioAviso + N - 1
  //     onde N = 30 (trabalhado) ou diasAvisoTotal (indenizado, por funcionário)
  // Antes (Rev. 1909-fix): `dataFimAviso = dataRef + diasAvisoTotal` — off by
  // one e usava sempre indenizado. Resultado: Anderson CDM 87k vs oficial 71k.
  const dtRef = new Date(dataRef + 'T00:00:00');
  const dtFimAviso = new Date(dtRef);
  const diasTrabMes = isNaN(dtFimAviso.getTime()) ? 30 : dtFimAviso.getDate();

  // Rev. 1911 — Carrega contagem REAL de períodos de férias vencidos por
  // employeeId em UMA única query (batch), evitando N+1. Necessário porque
  // `calcularRescisaoCompleta` SEM `periodosVencidosOverride` cai no fallback
  // matemático `calcularFeriasVencidas() - 1` — proibido pelo BUG-001
  // (rescisaoCalc.ts L292-296): "Sempre passar periodosVencidosOverride com
  // contagem real do banco. Nunca usar o cálculo matemático puro". Sem este
  // override, funcionários com muitos anos de casa (ex.: Enivaldo, 13 anos)
  // recebem ~12 períodos VENCIDOS fictícios, inflando o total em ~R$ 56k.
  // Critério idêntico ao avisoPrevioFerias.ts L494-503 (fonte de verdade
  // do módulo Aviso Prévio que o user usa pra conferir os números oficiais).
  const empIds = rows.map(r => r.id);

  // Rev. 1916 — Carrega obra ATIVA mais recente por employeeId em UMA query
  // (DISTINCT ON), evitando N+1. Critério: `obra_funcionarios.isActive=1`,
  // ordenado por dataInicio DESC (alocação mais recente vence em caso de
  // múltiplas obras simultâneas — comum em encarregados/engenheiros que
  // visitam várias frentes). Funcionários sem nenhuma alocação ativa caem
  // no fallback "—" no client.
  const obraByEmp = new Map<number, string>();
  const obraIdByEmp = new Map<number, number>();
  if (empIds.length > 0) {
    try {
      const obraRows = ((await db.execute(sql`
        SELECT DISTINCT ON (ofu."employeeId") ofu."employeeId", ofu."obraId", o.nome
        FROM obra_funcionarios ofu
        INNER JOIN obras o ON o.id = ofu."obraId"
        WHERE ofu."employeeId" IN (${sql.join(empIds.map(id => sql`${id}`), sql`, `)})
          AND ofu."isActive" = 1
        ORDER BY ofu."employeeId", ofu."dataInicio" DESC NULLS LAST, ofu.id DESC
      `)) as any).rows || [];
      for (const r of obraRows) {
        obraByEmp.set(Number(r.employeeId), String(r.nome ?? ''));
        if (r.obraId != null) obraIdByEmp.set(Number(r.employeeId), Number(r.obraId));
      }
    } catch (e) {
      console.error('[getDashCustoDemissaoMassa] falha ao carregar obra_funcionarios (assumindo vazio):', (e as any)?.message ?? e);
      fontesComFalha.push('Obras dos funcionários');
    }
  }

  // Rev. 1927 — Paridade total com módulo Aviso Prévio:
  //   (a) vrDiario por funcionário (via meal_benefit_configs da obra dele),
  //       espelhando avisoPrevioFerias.ts L840-870 (`comparativo`). CDM antes
  //       passava 0 → `vrProporcional` zerava no total. Diferença real em
  //       obras com VR/VA configurado (cafeManhaDia, lancheTardeDia, valeAlimMes).
  //   (b) diasTrabalhadosMes = `dataFimAviso.getDate() − diasFeriasAgendadasNoMes`,
  //       espelhando avisoPrevioFerias.ts L922-923/L948-949. CDM antes usava
  //       `dataRef.getDate()` (mês errado quando aviso indenizado cruzava
  //       virada de mês — ex.: Anderson dataRef=16/05 + 60d → dataFim=15/07
  //       → official passava 15, CDM passava 16 → saldoSalario divergente).
  // Ambas com batch queries (sem N+1).

  // Batch: meal_benefit_configs por companyId — obraId específica > default da empresa.
  const vrDiarioByObra = new Map<number, number>();
  const vrDiarioDefaultByCompany = new Map<number, number>();
  const cfgCompanyIds = companyIds && companyIds.length > 0 ? companyIds : [companyId];
  try {
    // Rev. 3985 — vigente na data de referência (dataRef), pegando a mais recente por
    // vigenciaInicio dentro de cada escopo (companyId+obraId, incl. NULL = "Todas as Obras").
    const cfgRowsRaw = ((await db.execute(sql`
      SELECT "companyId", "obraId", "cafeManhaDia", "lancheTardeDia",
             "valeAlimentacaoMes", "diasUteisRef", "cafeAtivo", "lancheAtivo", vigencia_inicio
      FROM meal_benefit_configs
      WHERE "companyId" IN (${sql.join(cfgCompanyIds.map(id => sql`${id}`), sql`, `)})
        AND ativo = 1
        AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${dataRef}::date)
        AND (vigencia_fim IS NULL OR vigencia_fim >= ${dataRef}::date)
      ORDER BY "companyId", "obraId" IS NULL DESC, "obraId", vigencia_inicio DESC NULLS LAST
    `)) as any).rows || [];
    const seenScope = new Set<string>();
    const cfgRows = cfgRowsRaw.filter((cfg: any) => {
      const key = `${cfg.companyId}:${cfg.obraId ?? 'null'}`;
      if (seenScope.has(key)) return false;
      seenScope.add(key);
      return true;
    });
    for (const cfg of cfgRows) {
      const cafe = parseBRL(cfg.cafeManhaDia);
      const lanche = parseBRL(cfg.lancheTardeDia);
      const vaMes = parseBRL(cfg.valeAlimentacaoMes);
      const diasUteis = Number(cfg.diasUteisRef) || 22;
      const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
      const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
      const totalVAMensal = (cafeAtivo ? cafe * diasUteis : 0)
                          + (lancheAtivo ? lanche * diasUteis : 0)
                          + vaMes;
      const vrDia = totalVAMensal / 30;
      if (cfg.obraId != null) vrDiarioByObra.set(Number(cfg.obraId), vrDia);
      else vrDiarioDefaultByCompany.set(Number(cfg.companyId), vrDia);
    }
  } catch (e) {
    console.error('[getDashCustoDemissaoMassa] falha meal_benefit_configs (assumindo VR=0):', (e as any)?.message ?? e);
      fontesComFalha.push('VR/VA (benefícios)');
  }

  // Rev. 2959 — Seguro de vida mensal REAL por funcionário, vindo do MÓDULO
  // Seguro de Vida (`seguro_vida_coberturas.premio_vg + premio_apc`), NÃO da
  // coluna `employees.seguroVida` (que vinha vazia → R$ 0,00 no Combo, mesmo
  // com cobertura ativa custando ~R$ 21,45/mês). Mesma fonte/parsing do
  // `getResumo` (seguroVida.ts L644-657): coberturas com status `ativo` ou
  // `pendente_inclusao`, prêmio em formato BR (texto) → numeric. Keyed por
  // employee_id. Read-only, ZERO ALTER/DROP/DELETE.
  const seguroVidaByEmp = new Map<number, number>();
  if (empIds.length > 0) {
    try {
      const svRows = ((await db.execute(sql`
        SELECT employee_id,
          COALESCE(SUM(
            (CASE WHEN premio_vg ~ '^[0-9.,]+$'
              THEN CAST(REPLACE(REPLACE(premio_vg, '.', ''), ',', '.') AS NUMERIC) ELSE 0 END)
            +
            (CASE WHEN premio_apc ~ '^[0-9.,]+$'
              THEN CAST(REPLACE(REPLACE(premio_apc, '.', ''), ',', '.') AS NUMERIC) ELSE 0 END)
          ), 0) AS premio_mensal
        FROM seguro_vida_coberturas
        WHERE employee_id IN (${sql.join(empIds.map(id => sql`${id}`), sql`, `)})
          AND status IN ('ativo','pendente_inclusao')
        GROUP BY employee_id
      `)) as any).rows || [];
      for (const r of svRows) {
        if (r.employee_id != null) seguroVidaByEmp.set(Number(r.employee_id), Number(r.premio_mensal) || 0);
      }
    } catch (e) {
      console.error('[getDashCustoDemissaoMassa] falha seguro_vida_coberturas (assumindo 0):', (e as any)?.message ?? e);
      fontesComFalha.push('Seguro de Vida');
    }
  }

  // Rev. 1936 — Batch: membros ATIVOS da CIPA com estabilidade ainda VIGENTE
  // na dataRef. Marcador visual apenas (NÃO exclui da lista — user explicitou:
  // "so demarca para saber quem é"). Estabilidade CIPA: CF Art. 10 II 'a' ADCT
  // + CLT Art. 165 / Súm. 339 TST — não pode dispensar sem justa causa desde
  // registro da candidatura até 1 ano após o fim do mandato.
  const cipaByEmp = new Map<number, { cargo: string; fimEstabilidade: string | null }>();
  if (empIds.length > 0) {
    try {
      const dataRefIso = dtRef.toISOString().slice(0, 10);
      const cipaRows = ((await db.execute(sql`
        SELECT DISTINCT ON ("employeeId") "employeeId", "cargoCipa", "fimEstabilidade"
        FROM cipa_members
        WHERE "employeeId" IN (${sql.join(empIds.map(id => sql`${id}`), sql`, `)})
          AND "statusMembro" = 'Ativo'
          AND ("fimEstabilidade" IS NULL OR "fimEstabilidade" >= ${dataRefIso})
        ORDER BY "employeeId", "fimEstabilidade" DESC NULLS LAST, id DESC
      `)) as any).rows || [];
      for (const r of cipaRows) {
        cipaByEmp.set(Number(r.employeeId), {
          cargo: String(r.cargoCipa ?? ''),
          fimEstabilidade: r.fimEstabilidade ? String(r.fimEstabilidade) : null,
        });
      }
    } catch (e) {
      console.error('[getDashCustoDemissaoMassa] falha cipa_members (assumindo vazio):', (e as any)?.message ?? e);
      fontesComFalha.push('Estabilidade CIPA');
    }
  }

  // Batch: períodos de férias agendados/em_gozo/concluídos que podem cair no
  // mês da saída de qualquer funcionário. Janela: dataRef → dataRef+90d
  // (teto Lei 12.506 = aviso máximo 90 dias indenizado).
  const dtMaxFimWin = new Date(dtRef.getTime() + 90 * 86400000);
  const dataMaxFimWin = dtMaxFimWin.toISOString().slice(0, 10);
  const vpAgendadasByEmp = new Map<number, Array<{ ini: string; fim: string }>>();
  if (empIds.length > 0) {
    try {
      const vpAgRows = ((await db.execute(sql`
        SELECT "employeeId", "dataInicio", "dataFim"
        FROM vacation_periods
        WHERE "employeeId" IN (${sql.join(empIds.map(id => sql`${id}`), sql`, `)})
          AND "deletedAt" IS NULL
          AND status IN ('agendada','em_gozo','concluida')
          AND "dataInicio" IS NOT NULL
          AND "dataFim" IS NOT NULL
          AND "dataInicio" <= ${dataMaxFimWin}
          AND "dataFim" >= ${dataRef}
      `)) as any).rows || [];
      for (const r of vpAgRows) {
        const arr = vpAgendadasByEmp.get(Number(r.employeeId)) ?? [];
        arr.push({ ini: String(r.dataInicio).slice(0, 10), fim: String(r.dataFim).slice(0, 10) });
        vpAgendadasByEmp.set(Number(r.employeeId), arr);
      }
    } catch (e) {
      console.error('[getDashCustoDemissaoMassa] falha vacation_periods agendadas (assumindo 0):', (e as any)?.message ?? e);
      fontesComFalha.push('Férias agendadas');
    }
  }
  // Helper espelha avisoPrevioFerias.ts `diasFeriasNoMesDaSaida` (L169-207).
  function diasFeriasNoMesDaSaidaCdm(empId: number, dataFimAvisoStr: string): number {
    const ano = parseInt(dataFimAvisoStr.slice(0, 4));
    const mes = parseInt(dataFimAvisoStr.slice(5, 7));
    if (!ano || !mes) return 0;
    const saidaNum = parseInt(dataFimAvisoStr.slice(8, 10));
    const periodos = vpAgendadasByEmp.get(empId) ?? [];
    if (periodos.length === 0) return 0;
    const dias = new Set<string>();
    for (const p of periodos) {
      const di = new Date(p.ini + 'T00:00:00');
      const df = new Date(p.fim + 'T00:00:00');
      const d = new Date(di);
      while (d <= df) {
        if (d.getFullYear() === ano && d.getMonth() + 1 === mes) {
          const dia = d.getDate();
          if (dia <= saidaNum) dias.add(d.toISOString().slice(0, 10));
        }
        d.setDate(d.getDate() + 1);
      }
    }
    return dias.size;
  }

  const vpCountByEmp = new Map<number, number>();
  if (empIds.length > 0) {
    try {
      const vpRows = ((await db.execute(sql`
        SELECT "employeeId", COUNT(*)::int AS total
        FROM vacation_periods
        WHERE "employeeId" IN (${sql.join(empIds.map(id => sql`${id}`), sql`, `)})
          AND status NOT IN ('concluida', 'cancelada', 'em_gozo')
          AND "periodoAquisitivoFim" IS NOT NULL
          AND "periodoAquisitivoFim" < ${dataRef}
          AND ("dataPagamento" IS NULL OR "dataPagamento" > ${dataRef})
          AND "deletedAt" IS NULL
        GROUP BY "employeeId"
      `)) as any).rows || [];
      for (const r of vpRows) {
        vpCountByEmp.set(Number(r.employeeId), Number(r.total ?? 0));
      }
    } catch (e) {
      console.error('[getDashCustoDemissaoMassa] falha ao carregar vacation_periods (assumindo 0):', (e as any)?.message ?? e);
      fontesComFalha.push('Períodos de férias');
    }
  }

  const multaMapCdm = await carregarMultaFgtsPorEmpresa(db, cfgCompanyIds);
  const linhas = rows
    .filter(r => !!r.dataAdmissao && parseBRL(r.salarioBase) > 0 && r.dataAdmissao! <= dataRef)
    .map(r => {
      const salario = parseBRL(r.salarioBase);
      // Rev. 1909-fix (architect): projeta dataFimAviso = dataRef + diasAvisoTotal
      // para que férias proporcional / 13º / multa FGTS contemplem o período
      // de aviso indenizado (worst case real). Sem isso, todos os componentes
      // tempo-dependentes ficavam subestimados.
      const dtAdm = new Date(r.dataAdmissao! + 'T00:00:00');
      const anosBase = !isNaN(dtAdm.getTime())
        ? Math.max(0, Math.floor((dtFimAviso.getTime() - dtAdm.getTime()) / (1000 * 60 * 60 * 24 * 365.25)))
        : 0;
      // Rev. 2423 — CUMPRIMENTO físico do trabalhado = 30 fixos; indenizado
      // segue total proporcional 30+3·ano. Antes (Rev. 1943) ambos usavam o
      // total, gerando paridade visual mas projeção de mês incorreta para o
      // trabalhado (10 anos → mês saída 2 meses à frente). Agora delega ao
      // helper canônico `calcularDiasAviso(anos, tipo)` — mesma fonte do
      // módulo oficial Aviso Prévio (avisoPrevioFerias.ts L951/L1207), garante
      // paridade dataFimAviso ↔ projeção férias/13º/multa 40%. VERBA financeira
      // (avisoIndenizado) segue íntegra em calcularRescisaoCompleta (paga
      // diasExtras pro trabalhado, diasAvisoTotal pro indenizado).
      const diasAvisoEstimado = calcularDiasAviso(anosBase, tipo);
      const dtFimProjetada = new Date(dtFimAviso.getTime() + diasAvisoEstimado * 24 * 60 * 60 * 1000);
      const dataFimProjetada = dtFimProjetada.toISOString().slice(0, 10);
      // Rev. 1911 — Passa override real (default 0 quando funcionário não tem
      // nenhum período vencido em vacation_periods — caso normal de empresa
      // que mantém férias em dia). Bloqueia o fallback matemático tóxico.
      const periodosVencidosReal = vpCountByEmp.get(r.id) ?? 0;
      // Rev. 1927 — diasTrabalhadosMes do MÊS da dataFimAviso (não da dataRef).
      // Quando aviso indenizado cruza virada de mês (ex.: 16/05 + 60d = 15/07),
      // saldoSalario do oficial usa dia 15 (Jul); CDM antes usava 16 (Mai).
      // Subtrai férias agendadas DENTRO desse mês até o dia da saída (idem
      // avisoPrevioFerias.ts L922-923/948-949).
      const diaSaidaReal = dtFimProjetada.getDate();
      const diasFeriasMesSaida = diasFeriasNoMesDaSaidaCdm(r.id, dataFimProjetada);
      const diasTrabMesReal = Math.max(0, diaSaidaReal - diasFeriasMesSaida);
      // Rev. 1927 — vrDiario real do funcionário (config da obra > default da
      // empresa > 0). Sem isso, `vrProporcional = vrDiario × diasTrabMes` era
      // zero no CDM e contribuía pra divergência vs módulo oficial.
      const obraIdEmp = obraIdByEmp.get(r.id);
      const vrDiarioReal = (obraIdEmp != null ? vrDiarioByObra.get(obraIdEmp) : undefined)
        ?? vrDiarioDefaultByCompany.get(Number(r.companyId))
        ?? 0;
      const previsao = calcularRescisaoCompleta({
        salarioBase: salario,
        dataAdmissao: r.dataAdmissao!,
        dataDesligamento: dataRef,
        dataFimAviso: dataFimProjetada,
        tipo,
        vrDiario: vrDiarioReal,
        diasTrabalhadosMes: diasTrabMesReal,
        periodosVencidosOverride: periodosVencidosReal,
        incluirMultaFgts: multaMapCdm.get(Number(r.companyId)) ?? true,
      });
      // Rev. 1919 — Rescisão COMPLEMENTAR ("por fora" / uso interno).
      // O módulo oficial Aviso Prévio mostra TOTAL GERAL = Oficial + Complementar
      // pra funcionários com `recebeComplemento=true` e `valorComplemento>0`.
      // Sem este bloco, a tabela CDM ficava DIVERGENTE do detalhe oficial
      // (ex.: Anderson — CDM R$ 53.256,22 vs oficial R$ 71.281,82 = 45.428 + 25.853).
      // Espelha `buildPrevisaoComplementar` em avisoPrevioFerias.ts L269-281.
      const valorComplemento = parseBRL(r.valorComplemento);
      let totalComplementar = 0;
      let avisoComplementar = 0;
      if (r.recebeComplemento && valorComplemento > 0) {
        const compl = calcularRescisaoComplementar({
          valorComplemento,
          dataAdmissao: r.dataAdmissao!,
          dataDesligamento: dataRef,
          dataFimAviso: dataFimProjetada,
          tipo,
          diasTrabalhadosMes: diasTrabMesReal,
          periodosVencidosOverride: periodosVencidosReal,
        });
        if (compl) {
          totalComplementar = parseFloat(compl.total);
          avisoComplementar = parseFloat(compl.avisoPrevioIndenizado);
        }
      }
      const totalOficialBruto = parseFloat(previsao.total);
      // Rev. 1964 — Descontos legais (INSS+IRRF+pensão+sindical) replicando o
      // engine do modal "Novo Aviso Prévio" (avisoPrevioFerias.ts L547-553).
      // Ajustes operacionais (faltas/vales/EPI/convênios/outros) ficam ZERADOS
      // — esses dependem do mês de competência e variam linha-a-linha, então
      // só aparecem no detalhe individual. Em funcionários SEM esses ajustes
      // (caso típico — Anderson IMG_0814), CDM passa a bater 1:1 com o modal.
      const descontosCtx: DescontosRescisaoContext = {
        // numDependentes=0 INTENCIONAL pra paridade 1:1 com o modal: o helper
        // `buildDescontosContextRescisao` (avisoPrevioFerias.ts L50) lê de
        // `emp.numDependentes` que NÃO existe no schema (coluna real é
        // `dependentesIR`/`dependentes_ir`). Resultado: modal sempre cai em
        // fallback 0. Aqui replicamos exatamente esse comportamento — usar
        // `dependentesIR` daria mais precisão mas DIVERGIRIA do modal (que é
        // a fonte de verdade pedida pelo user pra esta tela CDM). Quando o
        // bug do modal for corrigido lá, corrige aqui também.
        numDependentes: 0,
        contribuicaoSindical: parseBRL(r.contribuicaoSindical),
        pensaoConfig: r.pensaoAlimenticia
          ? {
              ativa: true,
              tipo: (r.pensaoTipo as any) || "valor_fixo",
              valor: parseBRL(r.pensaoValor),
              percentual: parseFloat(String(r.pensaoPercentual || "0").replace(",", ".")) || 0,
              base: (r.pensaoBase as any) || "bruto",
            }
          : null,
        salarioMinimo: 1621,
        faltasAtrasosValor: 0,
        conveniosValor: 0,
        episValor: 0,
        valesValor: 0,
        outrosDescontosValor: 0,
      };
      const descontosLegais = calcularDescontosRescisao(previsao, descontosCtx);
      const totalDescontos = parseFloat(descontosLegais.totalDescontos);
      const totalOficialLiquido = parseFloat(descontosLegais.totalLiquido);
      // Rev. 1931 — idade real calculada da dataNascimento (anos completos
      // até a dataRef do dashboard, não até HOJE — coerente com o resto da
      // simulação que projeta sobre dtRef).
      let idade: number | null = null;
      if (r.dataNascimento) {
        const dtNasc = new Date(r.dataNascimento + 'T00:00:00');
        if (!isNaN(dtNasc.getTime())) {
          let i = dtRef.getFullYear() - dtNasc.getFullYear();
          const mDiff = dtRef.getMonth() - dtNasc.getMonth();
          if (mDiff < 0 || (mDiff === 0 && dtRef.getDate() < dtNasc.getDate())) i--;
          idade = Math.max(0, i);
        }
      }
      // Rev. 1934 — Tempo de empresa em anos/meses/dias (não só anos).
      // User (16/05/2026): "quero anos, meses e dias..". Cálculo do
      // calendário civil até dtRef (mesma data-base das outras métricas
      // do dashboard, NÃO até HOJE). Algoritmo: diferença ano→ano,
      // ajustando mês e dia com empréstimo (borrow) — mesma técnica usada
      // p/ idade humana.
      let tempoAnos = 0, tempoMeses = 0, tempoDias = 0;
      if (!isNaN(dtAdm.getTime()) && dtAdm <= dtRef) {
        tempoAnos = dtRef.getFullYear() - dtAdm.getFullYear();
        tempoMeses = dtRef.getMonth() - dtAdm.getMonth();
        tempoDias = dtRef.getDate() - dtAdm.getDate();
        if (tempoDias < 0) {
          // Empresta dias do mês anterior (último dia desse mês).
          const prevMonth = new Date(dtRef.getFullYear(), dtRef.getMonth(), 0);
          tempoDias += prevMonth.getDate();
          tempoMeses--;
        }
        if (tempoMeses < 0) {
          tempoMeses += 12;
          tempoAnos--;
        }
        if (tempoAnos < 0) { tempoAnos = 0; tempoMeses = 0; tempoDias = 0; }
      }
      // Rev. 3339 — INDENIZAÇÃO DO PERÍODO DE ESTABILIDADE CIPA (Súmula 396 TST).
      // User (20/06/2026, screenshot CDM): "para os membros da CIPA não está
      // calculando a indenização por estabilidade no custo". Membro da CIPA com
      // estabilidade ainda VIGENTE (cipa_members.fimEstabilidade futuro), se
      // dispensado pelo empregador SEM justa causa, gera custo ADICIONAL =
      // remuneração do período restante de estabilidade (salários + 13º +
      // férias+1/3 + FGTS 8% — calcularIndenizacaoEstabilidade). O CDM simula
      // SEMPRE dispensa do empregador (tipo empregador_*), então é sempre
      // aplicável quando há estabilidade futura. Antes a tag CIPA (Rev. 1936)
      // era só VISUAL e o "Custo Total" NÃO contemplava essa indenização,
      // subestimando o passivo real de demitir um cipeiro. Soma-se ao `total`.
      const cipaInfoRow = cipaByEmp.get(r.id);
      const estabCalc = cipaInfoRow?.fimEstabilidade
        ? calcularIndenizacaoEstabilidade({
            salarioBase: salario,
            dataDesligamento: dataRef,
            fimEstabilidade: cipaInfoRow.fimEstabilidade,
          })
        : null;
      const indenizacaoEstabilidade = estabCalc?.aplicavel ? parseFloat(estabCalc.total) : 0;
      const cipaDiasEstabilidade = estabCalc?.aplicavel ? estabCalc.diasRestantes : 0;
      return {
        id: r.id,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        cargo: r.cargo || r.funcao || '',
        funcao: r.funcao || '',
        setor: r.setor || '',
        obra: obraByEmp.get(r.id) || '',
        dataAdmissao: r.dataAdmissao!,
        dataNascimento: r.dataNascimento,
        idade,
        // Rev. 1949 — FIX: fotoUrl era SELECTed (L2290 desde Rev. 1941) mas
        // NÃO era devolvido no objeto da linha, então o client sempre recebia
        // undefined e caía no fallback de inicial cinza. Em Colaboradores as
        // fotos apareciam normalmente (mesma coluna employees.fotoUrl), só
        // aqui no CDM faltava propagar. User (16/05/2026, screenshot Colab
        // com avatares circulares ACACIO/AGOSTINHO/ALEX/etc.): "veja que tem
        // fotos no cadastro, é so vc copiar e colocar ali.. preciso disso
        // resolvido agora..".
        fotoUrl: r.fotoUrl ?? null,
        salarioBase: salario,
        // Rev. 2953/2955/2959 — benefícios mensais recorrentes (sobra de caixa
        // pós-demissão). Seguro de vida = prêmio REAL do módulo Seguro de Vida
        // (seguro_vida_coberturas.premio_vg+premio_apc, batch acima); fallback
        // p/ a coluna do cadastro (employees.seguroVida) quando o funcionário
        // não tem cobertura registrada. Antes (Rev. 2953) lia SÓ a coluna do
        // cadastro, que vinha vazia → R$ 0,00 mesmo com cobertura ativa.
        // Vale alimentação = MESMA fonte do VR proporcional da rescisão
        // (meal_benefit_configs por obra → default da empresa): vrDia × 30.
        // NÃO usa employees.valeAlimentacao (coluna inexistente no banco, que
        // quebrava a query inteira → tela "Selecione uma empresa").
        seguroVidaMensal: seguroVidaByEmp.get(r.id) ?? parseBRL(r.seguroVida),
        valeAlimentacaoMensal: ((obraIdByEmp.has(r.id) && vrDiarioByObra.has(obraIdByEmp.get(r.id)!))
          ? vrDiarioByObra.get(obraIdByEmp.get(r.id)!)!
          : (vrDiarioDefaultByCompany.get(r.companyId) ?? 0)) * 30,
        anosServico: previsao.anosServico,
        tempoAnos,
        tempoMeses,
        tempoDias,
        // Rev. 1936 — CIPA: estabilidade (CF Art. 10 II 'a' ADCT).
        isCipa: cipaByEmp.has(r.id),
        cipaCargo: cipaByEmp.get(r.id)?.cargo ?? null,
        cipaFimEstabilidade: cipaByEmp.get(r.id)?.fimEstabilidade ?? null,
        // Rev. 3339 — Indenização do período de estabilidade CIPA (Súmula 396
        // TST) somada ao `total`. `cipaDiasEstabilidade` = dias restantes de
        // estabilidade a partir da dataRef (base do cálculo).
        indenizacaoEstabilidade,
        cipaDiasEstabilidade,
        // Rev. 1930 — Devolve `diasAvisoEstimado` (que respeita o `tipo` —
        // 30 fixos no Trabalhado / 30+3·ano no Indenizado conforme L2476),
        // não `previsao.diasAvisoTotal` (que SEMPRE retorna o cálculo legal
        // total da Lei 12.506, ignora o tipo — fonte do bug: tabela mostrava
        // 60/66/45 com toggle "Trabalhado" selecionado).
        diasAvisoTotal: diasAvisoEstimado,
        saldoSalario: parseFloat(previsao.saldoSalario),
        feriasProporcional: parseFloat(previsao.totalFerias),
        feriasVencidas: parseFloat(previsao.feriasVencidas),
        decimoTerceiro: parseFloat(previsao.decimoTerceiroProporcional),
        // Rev. 1964 — Aviso oficial e complementar SEPARADOS (antes vinham
        // somados num único campo `avisoPrevioIndenizado` — frontend não
        // sabia distinguir). Mantém o campo agregado pra compat.
        avisoOficial: parseFloat(previsao.avisoPrevioIndenizado),
        avisoComplementar,
        avisoPrevioIndenizado: parseFloat(previsao.avisoPrevioIndenizado) + avisoComplementar,
        multaFGTS: parseFloat(previsao.multaFGTS),
        fgtsEstimado: parseFloat(previsao.fgtsEstimado),
        // Rev. 1964 — `totalOficial` PRESERVADO com semântica BRUTA (legado —
        // consumidores antigos esperavam o valor pré-descontos). Novo campo
        // `totalOficialLiquido` expõe o valor após descontos legais (= o que
        // o modal mostra). `total` (custo total exibido) usa o líquido pra
        // bater 1:1 com modal. `totalOficialBruto` repete `totalOficial` pra
        // semântica explícita em tooltip/auditoria.
        totalOficial: totalOficialBruto,
        totalOficialBruto,
        totalOficialLiquido,
        totalDescontos,
        totalComplementar,
        // Rev. 3339 — `total` agora inclui a indenização de estabilidade CIPA
        // (quando aplicável). Em não-cipeiros `indenizacaoEstabilidade=0`, sem
        // efeito. Isso faz o "Custo Total" da linha, o TOTAL GERAL e o KPI
        // "Custo Total Estimado" refletirem o passivo real de demitir cipeiros.
        total: totalOficialLiquido + totalComplementar + indenizacaoEstabilidade,
      };
    })
    .sort((a, b) => b.total - a.total);

  const grandTotal = linhas.reduce((s, l) => s + l.total, 0);
  const grandTotalFolha = linhas.reduce((s, l) => s + l.salarioBase, 0);

  return {
    dataReferencia: dataRef,
    tipo,
    totalFuncionarios: linhas.length,
    funcionariosIgnorados: rows.length - linhas.length,
    grandTotal,
    grandTotalFolha,
    mediaPorFuncionario: linhas.length > 0 ? grandTotal / linhas.length : 0,
    linhas,
    fontesComFalha, // Rev. 4681 — dados parciais → banner na tela
  };
}

// ============================================================
// 8. DASHBOARD AVISO PRÉVIO
// ============================================================
async function getDashAvisoPrevio(companyId: number, ano?: number, companyIds?: number[]) {
  const db = await getDb();
  if (!db) return null;
  const anoRef = ano || new Date().getFullYear();

  // Auto: when notice period ends, move to 'aguardando_pagamento' (NOT 'concluido').
  // 'concluido' is only set by explicit user "Dar Baixa" after payment review.
  // SKIP avisos that were manually reverted (revertidoManualmente = 1)
  const today = new Date().toISOString().split('T')[0];
  await db.update(terminationNotices)
    .set({ status: 'aguardando_pagamento', updatedAt: sql`NOW()` })
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
    companyId: terminationNotices.companyId,
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
    // Rev. 2473 — foto do colaborador pra renderizar avatar no
    // modal de drill-down (PersonPhoto com zoom on-click).
    fotoUrl: employees.fotoUrl,
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
  const aguardandoPagamento = filteredNotices.filter(n => n.status === 'aguardando_pagamento').length;
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
    function calcularRescisaoCompletaDash(p: { salarioBase: number; dataAdmissao: string; dataInicio: string; dataFim: string; tipo: string; incluirMultaFgts?: boolean }) {
      const { salarioBase, dataAdmissao, dataInicio, dataFim, tipo } = p;
      const incluirMultaFgts = p.incluirMultaFgts !== false;
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
      if (tipo === 'empregador_indenizado' || tipo === 'rescisao_indireta') avisoInd = salarioDia * diasTotal;
      else if (tipo === 'empregador_trabalhado') avisoInd = salarioDia * diasExtras;
      // Rev. 4686 — acordo mútuo (Art. 484-A): aviso indenizado pela metade.
      else if (tipo === 'acordo_mutuo') avisoInd = (salarioDia * diasTotal) / 2;
      const mServ = calcMesesServico(dataAdmissao, dataProj);
      const fgts = salarioBase * 0.08 * mServ;
      // Rev. 4686 — multa: 40% (empregador/rescisão indireta), 20% (acordo mútuo), 0 (justa causa/pedido).
      const multa = !incluirMultaFgts ? 0
        : tipo === 'acordo_mutuo' ? fgts * 0.2
        : (tipo.includes('empregador') || tipo === 'rescisao_indireta') ? fgts * 0.4
        : 0;
      // Rev. 4686 — justa causa perde férias proporcionais + 1/3 e 13º proporcional.
      const isJC = tipo === 'justa_causa';
      const total = saldoSalario + (isJC ? 0 : totalFerias) + (isJC ? 0 : dec13) + avisoInd + multa;
      return { total, saldoSalario, totalFerias, dec13, fgts, multa, avisoInd };
    }
    return { calcularRescisaoCompletaDash };
  })();

  // Recalcular valor de cada aviso em tempo real
  const multaMapDash = await carregarMultaFgtsPorEmpresa(db, filteredNotices.map((n: any) => n.companyId));
  const recalculated = filteredNotices.map(n => {
    try {
      const salBase = parseBRL(n.empSalarioBase || n.salarioBase || '0');
      const admissao = n.dataAdmissao || new Date().toISOString().split('T')[0];
      if (salBase > 0 && n.dataInicio && n.dataFim && n.tipo) {
        const r = calcularRescisaoCompletaDash({ salarioBase: salBase, dataAdmissao: admissao, dataInicio: n.dataInicio, dataFim: n.dataFim, tipo: n.tipo, incluirMultaFgts: multaMapDash.get(Number(n.companyId)) ?? true });
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
    total, emAndamento, concluidos, aguardandoPagamento, cancelados,
    empregadorTrabalhado, empregadorIndenizado, empregadoTrabalhado, empregadoIndenizado,
    valorTotalEstimado, valorEmAndamento, valorConcluido, valorCancelado,
    reducao2h, reducao7dias, semReducao,
    setorDist, funcaoDist, evolucaoMensal, diasAvisoDist, anosServicoDist,
    custoPorSetor, breakdownRescisao, vencendo7dias, vencendo30dias,
    avisos: recalculated.map(n => ({
      id: n.id, employeeId: n.employeeId,
      nomeCompleto: n.nomeCompleto || 'Funcionário não encontrado',
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
      // Rev. 1613 — Sócios e PJ não têm direito a férias (CLT Art. 129)
      sql`(${employees.tipoContrato} IS NULL OR ${employees.tipoContrato} NOT IN ('PJ','Socio'))`,
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
    // Rev. 1961 — Concluídas agora é VERDE (estado positivo "ciclo completo").
    // Em Gozo passa a TURQUESA pra continuar distinto (antes era verde, conflitava).
    { label: 'Em Gozo', value: emGozo, color: '#5CC5CF' },
    { label: 'Concluídas', value: concluidas, color: '#10B981' },
  ].filter(s => s.value > 0);

  // Timeline mensal: quantos colaboradores em férias por mês no ano
  // Rev. 1870: + concluidasMes (status='concluida' E dataFim no mês)
  const timelineMensal: { mes: string; emFerias: number; iniciando: number; finalizando: number; concluidas: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const mesKey = `${anoRef}-${String(m).padStart(2, '0')}`;
    const mesInicio = new Date(anoRef, m - 1, 1);
    const mesFim = new Date(anoRef, m, 0);
    let emFeriasMes = 0, iniciandoMes = 0, finalizandoMes = 0, concluidasMes = 0;
    allPeriods.forEach(p => {
      if (!p.dataInicio || !p.dataFim) return;
      const di = new Date(p.dataInicio);
      const df = new Date(p.dataFim);
      if (di <= mesFim && df >= mesInicio) emFeriasMes++;
      if (di >= mesInicio && di <= mesFim) iniciandoMes++;
      if (df >= mesInicio && df <= mesFim) finalizandoMes++;
      if (p.status === 'concluida' && df >= mesInicio && df <= mesFim) concluidasMes++;
    });
    timelineMensal.push({ mes: mesKey, emFerias: emFeriasMes, iniciando: iniciandoMes, finalizando: finalizandoMes, concluidas: concluidasMes });
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
    abonoPecuniario: p.abonoPecuniario,
    dataSugeridaInicio: p.dataSugeridaInicio,
    fracionamento: p.fracionamento,
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

  const [allEmps, obrasList, perfilEmpAlocs, warnRows, atestRows] = await Promise.all([
    db.select({
      id: employees.id, nomeCompleto: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor,
      sexo: employees.sexo, estadoCivil: employees.estadoCivil, cidade: employees.cidade, estado: employees.estado,
      dataAdmissao: employees.dataAdmissao, dataNascimento: employees.dataNascimento, tipoContrato: employees.tipoContrato, status: employees.status,
    }).from(employees).where(and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`, sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`)),
    db.select({ id: obras.id, nome: obras.nome }).from(obras).where(companyWhere(obras, companyId, companyIds)),
    db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(companyWhere(obraFuncionarios, companyId, companyIds), eq(obraFuncionarios.isActive, 1))),
    db.select({ employeeId: warnings.employeeId, total: sql<number>`count(*)` }).from(warnings).where(and(companyWhere(warnings, companyId, companyIds), sql`${warnings.deletedAt} IS NULL`)).groupBy(warnings.employeeId),
    db.select({ employeeId: atestados.employeeId, total: sql<number>`count(*)` }).from(atestados)
      .where(and(companyWhere(atestados, companyId, companyIds), sql`${atestados.deletedAt} IS NULL`))
      .groupBy(atestados.employeeId),
  ]);
  const obraMap = new Map(obrasList.map(o => [o.id, o.nome]));
  const perfilEmpObraMap = new Map(perfilEmpAlocs.map(a => [a.employeeId, a.obraId]));
  const warnMap = new Map(warnRows.map(r => [r.employeeId, Number(r.total)]));
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

    // Normaliza cidade: sem acento + title-case. Usa normKey para unir "Guaratinguetá"+"Guaratingueta"
    const cidRaw = (emp.cidade || '').trim();
    if (cidRaw) {
      const key = cidadeNormKey(cidRaw);
      const display = cidadeDisplay(cidRaw);
      // Procura chave existente (sem acento) para somar ao grupo correto
      const existingKey = Object.keys(d.cidade).find(k => cidadeNormKey(k) === key);
      if (existingKey) {
        d.cidade[existingKey] = (d.cidade[existingKey] || 0) + 1;
        // Upgrade display: se o novo nome tem acento e o existente não, renomeia a chave
        if (preferAccented(existingKey, display) !== existingKey) {
          d.cidade[display] = d.cidade[existingKey];
          delete d.cidade[existingKey];
        }
      } else {
        d.cidade[display] = (d.cidade[display] || 0) + 1;
      }
    } else {
      d.cidade['Não informado'] = (d.cidade['Não informado'] || 0) + 1;
    }

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

  // Regras de ouro e demitidos em paralelo
  const [rules, demitidos] = await Promise.all([
    db.select({ titulo: goldenRules.titulo, descricao: goldenRules.descricao, categoria: goldenRules.categoria })
      .from(goldenRules)
      .where(and(companyWhere(goldenRules, companyId, companyIds), eq(goldenRules.isActive, 1), sql`${goldenRules.deletedAt} IS NULL`)),
    db.select({ funcao: employees.funcao, setor: employees.setor, sexo: employees.sexo, estadoCivil: employees.estadoCivil, estado: employees.estado, cidade: employees.cidade, dataAdmissao: employees.dataAdmissao, categoriaDesligamento: employees.categoriaDesligamento })
      .from(employees).where(and(companyWhere(employees, companyId, companyIds), sql`${employees.deletedAt} IS NULL`, sql`${employees.status} = 'Demitido'`)),
  ]);

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
      return { analise: parseLLMJson(content) };
    }
    return { analise: null };
  } catch (err: any) {
    console.error('[IA Perfil] Erro:', err);
    throw new Error('Falha ao gerar análise IA: ' + (err?.message || 'erro desconhecido'));
  }
}

// Rev. 2504 — Parser tolerante para JSON retornado pelo Claude.
// invokeAnthropic ignora `response_format` (não há JSON mode nativo na API),
// então o Claude frequentemente envolve a resposta em fence markdown
// (```json ... ```) ou adiciona texto antes/depois. JSON.parse puro quebra.
// Estratégia: (1) remove fence ```json/```; (2) se ainda falhar, extrai o
// primeiro {...} ou [...] balanceado via regex e tenta de novo.
function parseLLMJson(raw: string): any {
  const trimmed = raw.trim();
  // Strip ```json ... ``` ou ``` ... ```
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Fallback: encontra primeiro objeto ou array no texto
    const objMatch = candidate.match(/\{[\s\S]*\}/);
    const arrMatch = candidate.match(/\[[\s\S]*\]/);
    const pick = objMatch && arrMatch
      ? (objMatch.index! < arrMatch.index! ? objMatch[0] : arrMatch[0])
      : (objMatch?.[0] || arrMatch?.[0]);
    if (pick) return JSON.parse(pick);
    throw new Error('Resposta da IA não contém JSON válido');
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

  // Todas as queries em paralelo para máxima performance
  const [
    asoTotal, asoVencidos, asoAVencer30, asoAVencer60, asoAVencer90,
    asoPorTipo, asoPorResultado, asosVencidosList, asosAVencerList, funcSemAsoValido,
    treinTotal, treinVencidos, treinAVencer30, treinPorNorma, treinTop10, treinVencidosList,
    atestTotal, atestPorTipo, atestPorMes,
    advTotal, advPorTipo, advPorMes,
    docTotal, docVencidos, docPorTipo,
    episCaVencido, totalAtivosArr,
  ] = await Promise.all([
    // ASOs
    db.select({ count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt))),
    db.select({ count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} < ${today} AND NOT EXISTS (SELECT 1 FROM asos a2 WHERE a2."employeeId" = ${asos.employeeId} AND a2."deletedAt" IS NULL AND a2."dataExame" > ${asos.dataExame} AND a2."dataValidade" >= ${today})`)),
    db.select({ count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d30}`)),
    db.select({ count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d60}`)),
    db.select({ count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d90}`)),
    db.select({ tipo: asos.tipo, count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt))).groupBy(asos.tipo),
    db.select({ resultado: asos.resultado, count: sql<number>`count(*)` }).from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt))).groupBy(asos.resultado),
    db.select({ id: asos.id, employeeId: asos.employeeId, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao, tipo: asos.tipo, dataExame: asos.dataExame, dataValidade: asos.dataValidade, resultado: asos.resultado, medico: asos.medico })
      .from(asos).innerJoin(employees, eq(asos.employeeId, employees.id))
      .where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} < ${today} AND NOT EXISTS (SELECT 1 FROM asos a2 WHERE a2."employeeId" = ${asos.employeeId} AND a2."deletedAt" IS NULL AND a2."dataExame" > ${asos.dataExame} AND a2."dataValidade" >= ${today})`, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
      .orderBy(asc(asos.dataValidade)).limit(50),
    db.select({ id: asos.id, employeeId: asos.employeeId, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao, tipo: asos.tipo, dataExame: asos.dataExame, dataValidade: asos.dataValidade, resultado: asos.resultado, medico: asos.medico })
      .from(asos).innerJoin(employees, eq(asos.employeeId, employees.id))
      .where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt), sql`${asos.dataValidade} >= ${today} AND ${asos.dataValidade} <= ${d90}`, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
      .orderBy(asc(asos.dataValidade)).limit(50),
    db.select({ count: sql<number>`count(DISTINCT ${employees.id})` }).from(employees)
      .where(and(companyWhere(employees, companyId, companyIds), isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado','Lista_Negra')`, sql`${employees.id} NOT IN (SELECT "employeeId" FROM asos WHERE "companyId" IN (${sql.join((companyIds || [companyId]).map(id => sql`${id}`), sql`, `)}) AND "deletedAt" IS NULL AND "dataValidade" >= ${today})`)),
    // Treinamentos
    db.select({ count: sql<number>`count(*)` }).from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt))),
    db.select({ count: sql<number>`count(*)` }).from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.dataValidade} IS NOT NULL AND ${trainings.dataValidade} < ${today}`)),
    db.select({ count: sql<number>`count(*)` }).from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.dataValidade} >= ${today} AND ${trainings.dataValidade} <= ${d30}`)),
    db.select({ norma: trainings.norma, count: sql<number>`count(*)` }).from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.norma} IS NOT NULL AND ${trainings.norma} != ''`)).groupBy(trainings.norma).orderBy(sql`count(*) desc`).limit(10),
    db.select({ nome: trainings.nome, count: sql<number>`count(*)` }).from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt))).groupBy(trainings.nome).orderBy(sql`count(*) desc`).limit(10),
    db.select({ id: trainings.id, employeeId: trainings.employeeId, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao, treinamento: trainings.nome, norma: trainings.norma, dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade, instrutor: trainings.instrutor })
      .from(trainings).innerJoin(employees, eq(trainings.employeeId, employees.id))
      .where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt), sql`${trainings.dataValidade} IS NOT NULL AND ${trainings.dataValidade} < ${today}`, isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`))
      .orderBy(asc(trainings.dataValidade)).limit(50),
    // Atestados
    db.select({ count: sql<number>`count(*)` }).from(atestados).where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt))),
    db.select({ tipo: atestados.tipo, count: sql<number>`count(*)` }).from(atestados).where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt))).groupBy(atestados.tipo),
    db.select({ mes: sql<string>`TO_CHAR(${atestados.dataEmissao}, 'YYYY-MM')`, count: sql<number>`count(*)`, diasTotal: sql<number>`COALESCE(SUM(${atestados.diasAfastamento}), 0)` }).from(atestados).where(and(companyWhere(atestados, companyId, companyIds), isNull(atestados.deletedAt), sql`${atestados.dataEmissao} >= CURRENT_DATE - INTERVAL '12 months'`)).groupBy(sql`TO_CHAR(${atestados.dataEmissao}, 'YYYY-MM')`).orderBy(sql`TO_CHAR(${atestados.dataEmissao}, 'YYYY-MM')`),
    // Advertências
    db.select({ count: sql<number>`count(*)` }).from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt))),
    db.select({ tipo: warnings.tipoAdvertencia, count: sql<number>`count(*)` }).from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt))).groupBy(warnings.tipoAdvertencia),
    db.select({ mes: sql<string>`TO_CHAR(${warnings.dataOcorrencia}, 'YYYY-MM')`, count: sql<number>`count(*)` }).from(warnings).where(and(companyWhere(warnings, companyId, companyIds), isNull(warnings.deletedAt), sql`${warnings.dataOcorrencia} >= CURRENT_DATE - INTERVAL '12 months'`)).groupBy(sql`TO_CHAR(${warnings.dataOcorrencia}, 'YYYY-MM')`).orderBy(sql`TO_CHAR(${warnings.dataOcorrencia}, 'YYYY-MM')`),
    // Documentos pessoais
    db.select({ count: sql<number>`count(*)` }).from(employeeDocuments).where(companyWhere(employeeDocuments, companyId, companyIds)),
    db.select({ count: sql<number>`count(*)` }).from(employeeDocuments).where(and(companyWhere(employeeDocuments, companyId, companyIds), sql`${employeeDocuments.dataValidade} IS NOT NULL AND ${employeeDocuments.dataValidade} < ${today}`)),
    db.select({ tipo: employeeDocuments.tipo, count: sql<number>`count(*)` }).from(employeeDocuments).where(companyWhere(employeeDocuments, companyId, companyIds)).groupBy(employeeDocuments.tipo),
    // EPIs CA vencido
    db.select({ count: sql<number>`count(*)` }).from(epis).where(and(companyWhere(epis, companyId, companyIds), sql`${epis.validadeCa} IS NOT NULL AND ${epis.validadeCa} < ${today}`)),
    // Total ativos
    db.select({ count: sql<number>`count(*)` }).from(employees).where(and(companyWhere(employees, companyId, companyIds), isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado','Lista_Negra')`)),
  ]);

  return {
    totalAtivos: totalAtivosArr[0]?.count ?? 0,
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

  // Todas as queries em paralelo
  const [ativosRows, allAsos, allTreinCtrl, allDocsCtrl, obrasCtrlRows, alocacoesCtrl] = await Promise.all([
    db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao, setor: employees.setor, status: employees.status, validadeCnh: employees.validadeCnh, fotoUrl: employees.fotoUrl })
      .from(employees).where(and(companyWhere(employees, companyId, companyIds), isNull(employees.deletedAt), sql`${employees.status} NOT IN ('Desligado','Lista_Negra')`)),
    db.select({ id: asos.id, employeeId: asos.employeeId, tipo: asos.tipo, dataExame: asos.dataExame, dataValidade: asos.dataValidade, resultado: asos.resultado, medico: asos.medico })
      .from(asos).where(and(companyWhere(asos, companyId, companyIds), isNull(asos.deletedAt))),
    db.select({ id: trainings.id, employeeId: trainings.employeeId, nome: trainings.nome, norma: trainings.norma, dataRealizacao: trainings.dataRealizacao, dataValidade: trainings.dataValidade, instrutor: trainings.instrutor })
      .from(trainings).where(and(companyWhere(trainings, companyId, companyIds), isNull(trainings.deletedAt))),
    db.select({ id: employeeDocuments.id, employeeId: employeeDocuments.employeeId, tipo: employeeDocuments.tipo, nome: employeeDocuments.nome, dataValidade: employeeDocuments.dataValidade, createdAt: employeeDocuments.createdAt })
      .from(employeeDocuments).where(and(companyWhere(employeeDocuments, companyId, companyIds), sql`${employeeDocuments.deletedAt} IS NULL`)),
    db.select({ id: obras.id, nome: obras.nome }).from(obras).where(and(companyWhere(obras, companyId, companyIds), isNull(obras.deletedAt))),
    db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(companyWhere(obraFuncionarios, companyId, companyIds), eq(obraFuncionarios.isActive, 1))),
  ]);
  const totalAtivos = ativosRows.length;

  // Último ASO válido por funcionário
  const lastAsoMap = new Map<number, typeof allAsos[0]>();
  for (const a of allAsos) {
    const existing = lastAsoMap.get(a.employeeId);
    if (!existing || (a.dataExame > existing.dataExame)) {
      lastAsoMap.set(a.employeeId, a);
    }
  }

  const asoTotal = allAsos.length;
  const latestAsoPerEmp = Array.from(lastAsoMap.values());
  const asoVencidos = latestAsoPerEmp.filter(a => a.dataValidade && a.dataValidade < today).length;
  const asoAVencer30 = latestAsoPerEmp.filter(a => a.dataValidade && a.dataValidade >= today && a.dataValidade <= d30).length;
  const asoAVencer60 = latestAsoPerEmp.filter(a => a.dataValidade && a.dataValidade >= today && a.dataValidade <= d60).length;
  const asoAVencer90 = latestAsoPerEmp.filter(a => a.dataValidade && a.dataValidade >= today && a.dataValidade <= d90).length;
  const asoEmDia = latestAsoPerEmp.filter(a => a.dataValidade && a.dataValidade > d90).length;

  // Funcionários ativos sem ASO válido
  const funcSemAso: number[] = [];
  for (const emp of ativosRows) {
    const lastAso = lastAsoMap.get(emp.id);
    if (!lastAso || !lastAso.dataValidade || lastAso.dataValidade < today) {
      funcSemAso.push(emp.id);
    }
  }

  // ── TREINAMENTOS ──
  const treinTotal = allTreinCtrl.length;
  const treinVencidos = allTreinCtrl.filter(t => t.dataValidade && t.dataValidade < today).length;
  const treinAVencer30 = allTreinCtrl.filter(t => t.dataValidade && t.dataValidade >= today && t.dataValidade <= d30).length;
  const treinAVencer60 = allTreinCtrl.filter(t => t.dataValidade && t.dataValidade >= today && t.dataValidade <= d60).length;
  const treinAVencer90 = allTreinCtrl.filter(t => t.dataValidade && t.dataValidade >= today && t.dataValidade <= d90).length;
  const treinEmDia = allTreinCtrl.filter(t => !t.dataValidade || t.dataValidade > d90).length;

  // ── DOCUMENTOS PESSOAIS ──
  const docTotal = allDocsCtrl.length;
  const docComValidade = allDocsCtrl.filter(d => d.dataValidade);
  const docVencidos = docComValidade.filter(d => d.dataValidade! < today).length;
  const docAVencer30 = docComValidade.filter(d => d.dataValidade! >= today && d.dataValidade! <= d30).length;
  const docAVencer60 = docComValidade.filter(d => d.dataValidade! >= today && d.dataValidade! <= d60).length;
  const docAVencer90 = docComValidade.filter(d => d.dataValidade! >= today && d.dataValidade! <= d90).length;

  const docPorTipoMap = new Map<string, number>();
  for (const d of allDocsCtrl) { docPorTipoMap.set(d.tipo, (docPorTipoMap.get(d.tipo) || 0) + 1); }
  const docPorTipo = Array.from(docPorTipoMap.entries()).map(([tipo, count]) => ({ tipo, count })).sort((a, b) => b.count - a.count);

  // ── CNH ──
  const cnhAtivos = ativosRows.filter(e => e.validadeCnh);
  const cnhVencidas = cnhAtivos.filter(e => e.validadeCnh! < today).length;
  const cnhAVencer30 = cnhAtivos.filter(e => e.validadeCnh! >= today && e.validadeCnh! <= d30).length;
  const cnhAVencer60 = cnhAtivos.filter(e => e.validadeCnh! >= today && e.validadeCnh! <= d60).length;
  const cnhAVencer90 = cnhAtivos.filter(e => e.validadeCnh! >= today && e.validadeCnh! <= d90).length;

  const empObraMap = new Map<number, number>();
  for (const a of alocacoesCtrl) empObraMap.set(a.employeeId, a.obraId);

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
      treinamentos: allTreinCtrl.filter(t => t.dataValidade && t.dataValidade >= ws && t.dataValidade < we).length,
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
    return obrasCtrlRows.find(o => o.id === obraId)?.nome || '—';
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
  for (const t of allTreinCtrl) {
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
  type PendenciaDoc = {
    categoria: string; tipo: string;
    dataValidade: string | null; diasAtraso: number | null;
    motivo: 'sem' | 'vencido';
  };
  type FuncIncompleto = {
    employeeId: number; funcionarioNome: string; cpf: string; fotoUrl: string | null;
    funcao: string; setor: string; obraNome: string;
    semAso: boolean; asoVencido: boolean;
    treinVencidos: number; docsVencidos: number; cnhVencida: boolean;
    totalPendencias: number;
    pendencias: PendenciaDoc[];
  };
  const diasAtrasoDe = (dv: string) => Math.abs(calcDias(dv));
  const funcIncompletos: FuncIncompleto[] = [];
  for (const emp of ativosRows) {
    const lastAso = lastAsoMap.get(emp.id);
    const semAso = !lastAso;
    const asoVenc = lastAso ? (lastAso.dataValidade ? lastAso.dataValidade < today : false) : false;
    const treinVencList = allTreinCtrl.filter(t => t.employeeId === emp.id && t.dataValidade && t.dataValidade < today);
    const docsVencList = docComValidade.filter(d => d.employeeId === emp.id && d.dataValidade! < today);
    const cnhVenc = emp.validadeCnh ? emp.validadeCnh < today : false;
    const treinVenc = treinVencList.length;
    const docsVenc = docsVencList.length;
    const totalPend = (semAso ? 1 : 0) + (asoVenc ? 1 : 0) + treinVenc + docsVenc + (cnhVenc ? 1 : 0);
    if (totalPend > 0) {
      // Lista EXATA dos documentos pendentes (1:1 com as contagens acima) para drill-down na tela
      const pendencias: PendenciaDoc[] = [];
      if (semAso) pendencias.push({ categoria: 'ASO', tipo: 'ASO não cadastrado', dataValidade: null, diasAtraso: null, motivo: 'sem' });
      if (asoVenc && lastAso?.dataValidade) pendencias.push({ categoria: 'ASO', tipo: lastAso.tipo || 'ASO', dataValidade: lastAso.dataValidade, diasAtraso: diasAtrasoDe(lastAso.dataValidade), motivo: 'vencido' });
      for (const t of treinVencList) pendencias.push({ categoria: 'Treinamento', tipo: t.norma || t.nome, dataValidade: t.dataValidade!, diasAtraso: diasAtrasoDe(t.dataValidade!), motivo: 'vencido' });
      for (const d of docsVencList) pendencias.push({ categoria: 'Doc. Pessoal', tipo: d.tipo.toUpperCase(), dataValidade: d.dataValidade!, diasAtraso: diasAtrasoDe(d.dataValidade!), motivo: 'vencido' });
      if (cnhVenc && emp.validadeCnh) pendencias.push({ categoria: 'CNH', tipo: 'CNH', dataValidade: emp.validadeCnh, diasAtraso: diasAtrasoDe(emp.validadeCnh), motivo: 'vencido' });
      // Mais críticos primeiro: "não cadastrado" no topo, depois maior atraso
      pendencias.sort((a, b) => (b.diasAtraso ?? Number.MAX_SAFE_INTEGER) - (a.diasAtraso ?? Number.MAX_SAFE_INTEGER));
      funcIncompletos.push({
        employeeId: emp.id, funcionarioNome: emp.nomeCompleto, cpf: emp.cpf || '', fotoUrl: emp.fotoUrl ?? null,
        funcao: emp.funcao || '', setor: emp.setor || '', obraNome: getObraNome(emp.id),
        semAso, asoVencido: asoVenc, treinVencidos: treinVenc, docsVencidos: docsVenc,
        cnhVencida: cnhVenc, totalPendencias: totalPend, pendencias,
      });
    }
  }
  funcIncompletos.sort((a, b) => b.totalPendencias - a.totalPendencias);

  // ── TREINAMENTOS POR NORMA (top 10 mais realizados) ──
  const treinPorNormaMap = new Map<string, { total: number; vencidos: number }>(); 
  for (const t of allTreinCtrl) {
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
    obras: obrasCtrlRows,
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

  // Todas as queries do dashboard anual em paralelo
  const [periodsRaw, monthlyRaw, inconsistenciasRaw, custoObraRaw] = await Promise.all([
    db.execute(sql`SELECT * FROM payroll_periods WHERE "companyId" = ${companyId} AND "mesReferencia" LIKE ${year + '%'} ORDER BY "mesReferencia" ASC`),
    db.execute(sql`SELECT "mesReferencia", COUNT(*) as "totalFuncionarios", SUM(CAST("salarioBrutoMes" AS DECIMAL(12,2))) as "totalBruto", SUM(CAST("horasExtrasValor" AS DECIMAL(12,2))) as "totalHE", SUM(CAST("totalDescontos" AS DECIMAL(12,2))) as "totalDescontos", SUM(CAST("salarioLiquido" AS DECIMAL(12,2))) as "totalLiquido", SUM(CAST(COALESCE("vaValor",'0') AS DECIMAL(12,2))) as "totalVA", SUM(CAST(COALESCE("vtValor",'0') AS DECIMAL(12,2))) as "totalVT", SUM(CAST(COALESCE("vrValor",'0') AS DECIMAL(12,2))) as "totalVR", SUM(CAST(COALESCE("fgtsValor",'0') AS DECIMAL(12,2))) as "totalFGTS", SUM(CAST(COALESCE("inssValor",'0') AS DECIMAL(12,2))) as "totalINSS", SUM(CAST(COALESCE("seguroVidaValor",'0') AS DECIMAL(12,2))) as "totalSeguro", SUM(CAST("descontoAdiantamento" AS DECIMAL(12,2))) as "totalAdiantamento", SUM(CAST("descontoFaltas" AS DECIMAL(12,2))) as "totalDescontoFaltas", SUM("descontoFaltasQtd") as "totalFaltasQtd" FROM payroll_payments WHERE "companyId" = ${companyId} AND "mesReferencia" LIKE ${year + '%'} GROUP BY "mesReferencia" ORDER BY "mesReferencia" ASC`),
    db.execute(sql`SELECT "mesCompetencia", COUNT(*) as total, SUM(CASE WHEN "isInconsistente" = true THEN 1 ELSE 0 END) as inconsistentes, SUM(CASE WHEN "inconsistenciaResolvida" = true THEN 1 ELSE 0 END) as resolvidas FROM timecard_daily WHERE "companyId" = ${companyId} AND "mesCompetencia" LIKE ${year + '%'} GROUP BY "mesCompetencia" ORDER BY "mesCompetencia" ASC`),
    db.execute(sql`SELECT o.nome as "obraNome", o.id as "obraId", COUNT(DISTINCT td."employeeId") as funcionarios, COUNT(DISTINCT td.data) as "diasTrabalhados", SUM(CAST(COALESCE(td."totalHorasNormais",'0') AS DECIMAL(10,2))) as "horasNormais", SUM(CAST(COALESCE(td."totalHorasExtras",'0') AS DECIMAL(10,2))) as "horasExtras" FROM timecard_daily td LEFT JOIN obras o ON td."obraId" = o.id WHERE td."companyId" IN (${sql.join((companyIds || [companyId]).map(id => sql`${id}`), sql`, `)}) AND td."mesCompetencia" LIKE ${year + '%'} AND td."obraId" IS NOT NULL GROUP BY o.id, o.nome ORDER BY "horasNormais" DESC`),
  ]);
  const periods = (periodsRaw as any).rows || [];
  const monthlySums = (monthlyRaw as any).rows || [];
  const inconsistencias = (inconsistenciasRaw as any).rows || [];
  const custoObra = (custoObraRaw as any).rows || [];

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

async function getFuncionariosParaMapa(companyId: number, companyIds?: number[], statusFiltros?: string[]) {
  const db = await getDb();
  const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];

  const statusCondition = statusFiltros && statusFiltros.length > 0
    ? inArray(employees.status, statusFiltros)
    : sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`;

  const results = await db.select({
    id: employees.id,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    status: employees.status,
    logradouro: employees.logradouro,
    numero: employees.numero,
    bairro: employees.bairro,
    cidade: employees.cidade,
    estado: employees.estado,
    cep: employees.cep,
  })
  .from(employees)
  .where(and(
    inArray(employees.companyId, ids),
    statusCondition,
    sql`(
      (${employees.estado} IS NOT NULL AND TRIM(${employees.estado}) != '')
      OR (${employees.cidade} IS NOT NULL AND TRIM(${employees.cidade}) != '')
      OR (${employees.logradouro} IS NOT NULL AND TRIM(${employees.logradouro}) != '')
      OR (${employees.cep} IS NOT NULL AND TRIM(${employees.cep}) != '')
    )`
  ));
  return results;
}

// ============================================================
// DASHBOARD PARCEIROS — Gestão Integrada (Lançamentos, Aprovações,
// Guia de Descontos e Pagamentos do módulo Parceiros).
// Agrega dados do ano selecionado, com filtros opcionais por
// parceiro / tipo de convênio / mês. Retorna shape consumido por
// client/src/pages/dashboards/DashParceiros.tsx.
// ============================================================
async function getDashParceiros(
  companyId: number,
  ano: number,
  companyIds?: number[],
  parceiroId?: number,
  tipoConvenio?: string,
  mes?: number,
) {
  const db = (await getDb())!;
  const ids = resolveIds(companyId, companyIds);

  const yearStart = `${ano}-01-01`;
  const yearEnd = `${ano}-12-31`;

  // Parceiros conveniados (vivos)
  const parceirosRows: any[] = await db
    .select()
    .from(parceirosConveniados)
    .where(and(
      companyWhere(parceirosConveniados, companyId, companyIds),
      isNull(parceirosConveniados.deletedAt),
    ));

  // Lançamentos do ano — Rev. 4695: o "mês" do dashboard é a COMPETÊNCIA do
  // ciclo de desconto (ex.: Jul = 16/06 a 15/07), a mesma da tela de
  // Lançamentos, e não o mês-calendário de dataCompra. A janela de busca é
  // alargada em 1 mês para cada lado porque a competência Jan/{ano} inclui
  // compras de dez/{ano-1} e compras de dez/{ano} caem em Jan/{ano+1}.
  const diaCorte = await getDiaCorteParaEmpresa(db, companyId);
  const lancConditions: any[] = [
    companyWhere(lancamentosParceiros, companyId, companyIds),
    gte(lancamentosParceiros.dataCompra, `${ano - 1}-12-01`),
    lte(lancamentosParceiros.dataCompra, `${yearEnd} 23:59:59`),
  ];
  if (parceiroId) lancConditions.push(eq(lancamentosParceiros.parceiroId, parceiroId));
  const lancamentosRawRows: any[] = await db
    .select()
    .from(lancamentosParceiros)
    .where(and(...lancConditions));

  // Competência efetiva por lançamento: usa a coluna competenciaDesconto
  // quando válida (fonte de verdade, saneada pelo list de Lançamentos);
  // senão deriva de dataCompra com o diaCorte da empresa.
  for (const l of lancamentosRawRows) {
    const persisted = typeof l.competenciaDesconto === "string" && /^\d{4}-\d{2}$/.test(l.competenciaDesconto)
      ? l.competenciaDesconto
      : null;
    l.__competencia = persisted ?? competenciaFromDataCompra(l.dataCompra, diaCorte);
  }
  // Só entram no dashboard as competências do ano selecionado.
  const lancamentosRows: any[] = lancamentosRawRows.filter(l => String(l.__competencia ?? "").startsWith(`${ano}-`));

  // Pagamentos do ano (competencia LIKE 'YYYY-%')
  const pagConditions: any[] = [
    companyWhere(pagamentosParceiros, companyId, companyIds),
    sql`${pagamentosParceiros.competencia} LIKE ${ano + '-%'}`,
  ];
  if (parceiroId) pagConditions.push(eq(pagamentosParceiros.parceiroId, parceiroId));
  const pagamentosRows: any[] = await db
    .select()
    .from(pagamentosParceiros)
    .where(and(...pagConditions));

  // Mapa parceiroId → metadados
  const parceiroMap = new Map<number, any>();
  for (const p of parceirosRows) parceiroMap.set(p.id, p);

  // Rev. 4570 — mapa employeeId → fotoUrl (avatar nas listas de colaboradores)
  const empFotoMap = new Map<number, string | null>();
  {
    const empIds = [...new Set(lancamentosRows.map(l => Number(l.employeeId)).filter(Boolean))];
    if (empIds.length > 0) {
      const fotoRows = await db
        .select({ id: employees.id, fotoUrl: employees.fotoUrl })
        .from(employees)
        .where(and(
          companyWhere(employees, companyId, companyIds),
          inArray(employees.id, empIds),
        ));
      for (const r of fotoRows) empFotoMap.set(r.id, r.fotoUrl ?? null);
    }
  }

  // Aplica filtro de tipoConvenio nos lançamentos / pagamentos
  const matchTipo = (pid: number) => {
    if (!tipoConvenio || tipoConvenio === "todos") return true;
    const p = parceiroMap.get(pid);
    return p?.tipoConvenio === tipoConvenio;
  };
  const lancFiltrados = lancamentosRows.filter(l => matchTipo(l.parceiroId));
  const pagFiltrados = pagamentosRows.filter(p => matchTipo(p.parceiroId));

  // Filtro adicional por mês (se informado) — mês = mês da COMPETÊNCIA (Rev. 4695)
  const lancMes = lancFiltrados.filter(l => {
    if (!mes) return true;
    return Number(String(l.__competencia ?? "").slice(5, 7)) === mes;
  });
  const pagMes = pagFiltrados.filter(p => {
    if (!mes) return true;
    const m = Number(String(p.competencia ?? '').slice(5, 7));
    return m === mes;
  });

  const valor = (v: any) => Number.parseFloat(String(v ?? '0')) || 0;

  // ----- Resumo (KPIs) -----
  const lancByStatus = (st: string) => lancMes.filter(l => l.status === st);
  const pagByStatus = (st: string) => pagMes.filter(p => p.status === st);
  const sum = (arr: any[], k = 'valor') => arr.reduce((s, x) => s + valor(x[k]), 0);

  const resumo = {
    parceirosCadastrados: parceirosRows.length,
    parceirosAtivos: parceirosRows.filter(p => p.status === 'ativo').length,
    parceirosSuspensos: parceirosRows.filter(p => p.status === 'suspenso').length,
    parceirosInativos: parceirosRows.filter(p => p.status === 'inativo').length,
    totalLancamentos: lancMes.length,
    valorTotal: sum(lancMes),
    pendentes: lancByStatus('pendente').length,
    valorPendente: sum(lancByStatus('pendente')),
    aprovados: lancByStatus('aprovado').length,
    valorAprovado: sum(lancByStatus('aprovado')),
    rejeitados: lancByStatus('rejeitado').length,
    valorRejeitado: sum(lancByStatus('rejeitado')),
    colaboradoresUtilizando: new Set(lancMes.map(l => l.employeeId)).size,
    pagamentosTotal: pagMes.length,
    pagamentosPagos: pagByStatus('pago').length,
    pagamentosPendentes: pagByStatus('pendente').length,
    valorPago: sum(pagByStatus('pago'), 'valorTotal'),
    valorAPagar: sum(pagByStatus('pendente'), 'valorTotal'),
  };

  // Taxa aprovação (ignora pendentes)
  const decididos = resumo.aprovados + resumo.rejeitados;
  const taxaAprovacao = decididos > 0 ? (resumo.aprovados / decididos) * 100 : 0;

  // SLA aprovação: dias médios entre createdAt e aprovadoEm (apenas aprovados)
  const slaDias = (() => {
    const aprov = lancMes.filter(l => l.status === 'aprovado' && l.aprovadoEm && l.createdAt);
    if (aprov.length === 0) return 0;
    const totalMs = aprov.reduce((s, l) => {
      const a = new Date(l.aprovadoEm as string).getTime();
      const c = new Date(l.createdAt as string).getTime();
      return s + Math.max(0, a - c);
    }, 0);
    return totalMs / aprov.length / (1000 * 60 * 60 * 24);
  })();

  // ----- Evolução mensal (12 meses do ano) -----
  const evolucaoMensal = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    label: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i],
    lancamentos: 0, valor: 0, aprovados: 0, pendentes: 0, rejeitados: 0,
    valorAprovado: 0, valorPendente: 0,
  }));
  for (const l of lancFiltrados) {
    // Rev. 4695 — evolução mensal agrupada pela competência do ciclo
    const m = Number(String(l.__competencia ?? '').slice(5, 7));
    if (!m || m < 1 || m > 12) continue;
    const row = evolucaoMensal[m - 1];
    row.lancamentos += 1;
    row.valor += valor(l.valor);
    if (l.status === 'aprovado') { row.aprovados += 1; row.valorAprovado += valor(l.valor); }
    else if (l.status === 'pendente') { row.pendentes += 1; row.valorPendente += valor(l.valor); }
    else if (l.status === 'rejeitado') row.rejeitados += 1;
  }

  // Pagamentos por mês (competencia)
  const pagamentosPorMes = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    label: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i],
    total: 0, pagos: 0, pendentes: 0, valorPago: 0, valorAPagar: 0,
  }));
  for (const p of pagFiltrados) {
    const m = Number(String(p.competencia ?? '').slice(5, 7));
    if (!m || m < 1 || m > 12) continue;
    const row = pagamentosPorMes[m - 1];
    row.total += 1;
    if (p.status === 'pago') { row.pagos += 1; row.valorPago += valor(p.valorTotal); }
    else if (p.status === 'pendente') { row.pendentes += 1; row.valorAPagar += valor(p.valorTotal); }
  }

  // ----- Ranking parceiros (por valor total no período filtrado) -----
  const byParceiro = new Map<number, { id: number; nome: string; tipo: string; lancamentos: number; valor: number; aprovados: number; pendentes: number }>();
  for (const l of lancMes) {
    const p = parceiroMap.get(l.parceiroId);
    const nome = p?.nomeFantasia || p?.razaoSocial || `Parceiro #${l.parceiroId}`;
    const tipo = p?.tipoConvenio || '—';
    let r = byParceiro.get(l.parceiroId);
    if (!r) { r = { id: l.parceiroId, nome, tipo, lancamentos: 0, valor: 0, aprovados: 0, pendentes: 0 }; byParceiro.set(l.parceiroId, r); }
    r.lancamentos += 1;
    r.valor += valor(l.valor);
    if (l.status === 'aprovado') r.aprovados += 1;
    else if (l.status === 'pendente') r.pendentes += 1;
  }
  const rankingParceiros = [...byParceiro.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);

  // ----- Ranking colaboradores -----
  const byColab = new Map<number, { employeeId: number; nome: string; fotoUrl: string | null; lancamentos: number; valor: number }>();
  for (const l of lancMes) {
    let r = byColab.get(l.employeeId);
    if (!r) { r = { employeeId: l.employeeId, nome: l.employeeNome ?? `Colab #${l.employeeId}`, fotoUrl: empFotoMap.get(Number(l.employeeId)) ?? null, lancamentos: 0, valor: 0 }; byColab.set(l.employeeId, r); }
    r.lancamentos += 1;
    r.valor += valor(l.valor);
  }
  const rankingColaboradores = [...byColab.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);

  // ----- Por tipo de convênio -----
  const TIPOS = [
    { key: 'farmacia', label: 'Farmácia' },
    { key: 'posto_combustivel', label: 'Posto de Combustível' },
    { key: 'restaurante', label: 'Restaurante' },
    { key: 'mercado', label: 'Mercado' },
    { key: 'outros', label: 'Outros' },
  ];
  const porTipoConvenio = TIPOS.map(t => {
    const parc = parceirosRows.filter(p => p.tipoConvenio === t.key);
    const lancs = lancMes.filter(l => parceiroMap.get(l.parceiroId)?.tipoConvenio === t.key);
    return {
      tipo: t.key,
      label: t.label,
      parceiros: parc.length,
      lancamentos: lancs.length,
      valor: lancs.reduce((s, l) => s + valor(l.valor), 0),
    };
  }).filter(t => t.parceiros > 0 || t.lancamentos > 0);

  // ----- Detalhes (top 100 mais recentes do período filtrado) -----
  const detalhes = [...lancMes]
    .sort((a, b) => String(b.dataCompra).localeCompare(String(a.dataCompra)))
    .slice(0, 100)
    .map(l => {
      const p = parceiroMap.get(l.parceiroId);
      return {
        id: l.id,
        dataCompra: String(l.dataCompra ?? '').slice(0, 10),
        parceiroId: l.parceiroId,
        parceiroNome: p?.nomeFantasia || p?.razaoSocial || `Parceiro #${l.parceiroId}`,
        tipoConvenio: p?.tipoConvenio || '—',
        employeeId: l.employeeId,
        employeeNome: l.employeeNome,
        employeeFotoUrl: empFotoMap.get(Number(l.employeeId)) ?? null,
        valor: valor(l.valor),
        status: l.status,
        // Rev. 4695 — competência efetiva (coluna válida ou derivada do ciclo)
        competenciaDesconto: l.__competencia ?? l.competenciaDesconto,
        descricaoItens: l.descricaoItens,
        comprovanteUrl: l.comprovanteUrl,
        motivoRejeicao: l.motivoRejeicao,
        aprovadoEm: l.aprovadoEm ? String(l.aprovadoEm).slice(0, 10) : null,
        createdAt: l.createdAt ? String(l.createdAt).slice(0, 10) : null,
      };
    });

  // ----- Filtros disponíveis -----
  const parceirosFiltro = parceirosRows
    .map(p => ({ id: p.id, nome: p.nomeFantasia || p.razaoSocial, tipo: p.tipoConvenio }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

  const anosDisponiveis = (() => {
    const set = new Set<number>();
    set.add(new Date().getFullYear());
    set.add(ano);
    // Rev. 4695 — anos derivados da competência efetiva (mesma base do agrupamento)
    for (const l of lancamentosRawRows) {
      const y = Number(String(l.__competencia ?? '').slice(0, 4));
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  })();

  return {
    ano,
    mes: mes ?? null,
    parceiroId: parceiroId ?? null,
    tipoConvenio: tipoConvenio ?? 'todos',
    resumo: { ...resumo, taxaAprovacao, slaDias },
    evolucaoMensal,
    pagamentosPorMes,
    rankingParceiros,
    rankingColaboradores,
    porTipoConvenio,
    detalhes,
    filtros: { parceiros: parceirosFiltro, anosDisponiveis, tipos: TIPOS },
  };
}

export const dashboardsRouter = router({
  funcionarios: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => {
    const cacheKey = `dash:func:${input.companyId}:${input.ano ?? 'cur'}:${(input.companyIds ?? []).join(',')}`;
    return memCache.getOrFetch(cacheKey, TTL.MEDIUM, () => getDashFuncionarios(input.companyId, input.companyIds, input.ano));
  }),
  drillDown: protectedProcedure.input(z.object({ companyId: z.number(), filterType: z.string(), filterValue: z.string(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDrillDown(input.companyId, input.filterType, input.filterValue, input.companyIds)),
  cartaoPonto: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashCartaoPonto(input.companyId, input.mesReferencia, input.companyIds)),
  cartaoPontoComparativo: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashCartaoPontoComparativo(input.companyId, input.mesReferencia, input.companyIds)),
  horasExtrasComparativo: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashHorasExtrasComparativo(input.companyId, input.ano, input.companyIds)),
  folhaPagamentoComparativo: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFolhaPagamentoComparativo(input.companyId, input.mesReferencia, input.companyIds)),
  funcionariosComparativo: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFuncionariosComparativo(input.companyId, input.ano, input.companyIds)),
  funcionariosAnual: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFuncionariosAnual(input.companyId, input.ano, input.companyIds)),
  // Rev. 2627 — total de funcionários (headcount ativo ao fim de cada ano) desde a fundação.
  funcionariosHeadcountAnual: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFuncionariosHeadcountAnual(input.companyId, input.companyIds)),
  // Rev. 2208 — sigilo Aviso Prévio: zera dashboard pra quem não tem verStatusAviso.
  avisoPrevioComparativo: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(async ({ input, ctx }) => {
    const canSee = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
    if (!canSee) return { ano: input.ano || new Date().getFullYear(), meses: [] as any[] };
    return getDashAvisoPrevioComparativo(input.companyId, input.ano, input.companyIds);
  }),
  feriasComparativo: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFeriasComparativo(input.companyId, input.ano, input.companyIds)),
  apontamentosComparativo: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashApontamentosComparativo(input.companyId, input.ano, input.companyIds)),
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
  tributario: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashTributario(input.companyId, input.companyIds)),
  civil: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashCivil(input.companyId, input.companyIds)),
  // Rev. 2208 — sigilo Aviso Prévio: zera dashboard pra quem não tem verStatusAviso.
  avisoPrevio: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(async ({ input, ctx }) => {
    const canSee = await userCanSeeAvisoStatus(ctx.user.id, ctx.user.role);
    if (!canSee) return null;
    return getDashAvisoPrevio(input.companyId, input.ano, input.companyIds);
  }),
  custoDemissaoMassa: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tipo: z.enum(['empregador_indenizado', 'empregador_trabalhado']).optional(),
  })).query(({ input }) => getDashCustoDemissaoMassa(input.companyId, input.dataReferencia, input.companyIds, input.tipo)),
  ferias: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashFerias(input.companyId, input.ano, input.companyIds)),
  perfilTempoCasa: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashPerfilTempoCasa(input.companyId, input.companyIds)),
  analiseIAPerfil: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).mutation(({ input }) => getAnaliseIAPerfil(input.companyId, input.companyIds)),
  documentos: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashDocumentos(input.companyId, input.companyIds)),
  controleDocumentos: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashControleDocumentos(input.companyId, input.companyIds)),
  competenciasAnual: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional(), companyIds: z.array(z.number()).optional() })).query(({ input }) => getDashCompetenciasAnual(input.companyId, input.ano, input.companyIds)),
  funcionariosParaMapa: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), statusFiltros: z.array(z.string()).optional() })).query(({ input }) => getFuncionariosParaMapa(input.companyId, input.companyIds, input.statusFiltros)),
  parceiros: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      ano: z.number().optional(),
      mes: z.number().min(1).max(12).optional(),
      parceiroId: z.number().optional(),
      tipoConvenio: z.string().optional(),
    }))
    .query(({ input }) => getDashParceiros(
      input.companyId,
      input.ano ?? new Date().getFullYear(),
      input.companyIds,
      input.parceiroId,
      input.tipoConvenio,
      input.mes,
    )),
});
