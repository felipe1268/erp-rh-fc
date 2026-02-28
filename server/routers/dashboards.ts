import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  employees, extraPayments, payroll, timeRecords, warnings, atestados,
  epis, epiDeliveries, processosTrabalhistas, processosAndamentos,
  monthlyPayrollSummary, obraHorasRateio, obras, folhaLancamentos, folhaItens,
  epiDiscountAlerts, terminationNotices, vacationPeriods,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count, asc, isNull } from "drizzle-orm";

// ============================================================
// 1. DASHBOARD FUNCIONÁRIOS (análise completa)
// ============================================================
async function getDashFuncionarios(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  // Total por status
  const statusDist = await db.select({
    status: employees.status,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.status);

  // Gênero
  const sexDist = await db.select({
    sexo: employees.sexo,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.sexo);

  // Por setor (top 10)
  const setorDist = await db.select({
    setor: employees.setor,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.setor)
    .orderBy(sql`count(*) desc`).limit(10);

  // Por função (top 10)
  const funcaoDist = await db.select({
    funcao: employees.funcao,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // Por tipo de contrato
  const contratoDist = await db.select({
    tipo: employees.tipoContrato,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.tipoContrato);

  // Por estado civil
  const estadoCivilDist = await db.select({
    estadoCivil: employees.estadoCivil,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.estadoCivil);

  // Por cidade (top 10)
  const cidadeDist = await db.select({
    cidade: employees.cidade,
    count: sql<number>`count(*)`,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`)).groupBy(employees.cidade)
    .orderBy(sql`count(*) desc`).limit(10);

  // Pirâmide etária por gênero
  const ageDist = await db.select({
    faixa: sql<string>`CASE 
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 21 THEN '14-20'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 26 THEN '21-25'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 31 THEN '26-30'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 41 THEN '31-40'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 51 THEN '41-50'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 61 THEN '51-60'
      ELSE '61+'
    END`,
    sexo: employees.sexo,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataNascimento IS NOT NULL`, sql`${employees.deletedAt} IS NULL`))
    .groupBy(sql`CASE 
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 21 THEN '14-20'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 26 THEN '21-25'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 31 THEN '26-30'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 41 THEN '31-40'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 51 THEN '41-50'
      WHEN TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) < 61 THEN '51-60'
      ELSE '61+'
    END`, employees.sexo);

  // Tempo de empresa (distribuição)
  const tenureDist = await db.select({
    faixa: sql<string>`CASE 
      WHEN TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 3 THEN '< 3 meses'
      WHEN TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 6 THEN '3-6 meses'
      WHEN TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 12 THEN '6-12 meses'
      WHEN TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 2 THEN '1-2 anos'
      WHEN TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 5 THEN '2-5 anos'
      WHEN TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 10 THEN '5-10 anos'
      ELSE '10+ anos'
    END`,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataAdmissao IS NOT NULL`, sql`status != 'Desligado'`, sql`${employees.deletedAt} IS NULL`))
    .groupBy(sql`CASE 
      WHEN TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 3 THEN '< 3 meses'
      WHEN TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 6 THEN '3-6 meses'
      WHEN TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 12 THEN '6-12 meses'
      WHEN TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 2 THEN '1-2 anos'
      WHEN TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 5 THEN '2-5 anos'
      WHEN TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 10 THEN '5-10 anos'
      ELSE '10+ anos'
    END`);

  // Admissões e demissões por mês (últimos 12 meses)
  const admissoesMensal = await db.select({
    mes: sql<string>`DATE_FORMAT(dataAdmissao, '%Y-%m')`,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataAdmissao >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`, sql`${employees.deletedAt} IS NULL`))
    .groupBy(sql`DATE_FORMAT(dataAdmissao, '%Y-%m')`).orderBy(sql`DATE_FORMAT(dataAdmissao, '%Y-%m')`);

  const demissoesMensal = await db.select({
    mes: sql<string>`DATE_FORMAT(dataDemissao, '%Y-%m')`,
    count: sql<number>`count(*)`,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataDemissao >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`, sql`${employees.deletedAt} IS NULL`))
    .groupBy(sql`DATE_FORMAT(dataDemissao, '%Y-%m')`).orderBy(sql`DATE_FORMAT(dataDemissao, '%Y-%m')`);

  // Destaques
  const [oldest] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataNascimento, funcao: employees.funcao,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataNascimento IS NOT NULL`, sql`${employees.deletedAt} IS NULL`))
    .orderBy(employees.dataNascimento).limit(1);

  const [youngest] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataNascimento, funcao: employees.funcao,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataNascimento IS NOT NULL`, sql`${employees.deletedAt} IS NULL`))
    .orderBy(desc(employees.dataNascimento)).limit(1);

  const [longestTenure] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataAdmissao, funcao: employees.funcao,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataAdmissao IS NOT NULL`, sql`status != 'Desligado'`, sql`${employees.deletedAt} IS NULL`))
    .orderBy(employees.dataAdmissao).limit(1);

  const [shortestTenure] = await db.select({
    nome: employees.nomeCompleto, data: employees.dataAdmissao, funcao: employees.funcao,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataAdmissao IS NOT NULL`, sql`status != 'Desligado'`, sql`${employees.deletedAt} IS NULL`))
    .orderBy(desc(employees.dataAdmissao)).limit(1);

  // Ranking de advertências (top 10) — filtrar soft-deleted
  const rankingAdvertencias = await db.select({
    employeeId: warnings.employeeId,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    total: sql<number>`count(*)`,
  }).from(warnings)
    .innerJoin(employees, eq(warnings.employeeId, employees.id))
    .where(and(eq(warnings.companyId, companyId), isNull(warnings.deletedAt), isNull(employees.deletedAt)))
    .groupBy(warnings.employeeId, employees.nomeCompleto, employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // Ranking de atestados/faltas (top 10) — filtrar soft-deleted
  const rankingAtestados = await db.select({
    employeeId: atestados.employeeId,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    totalAtestados: sql<number>`count(*)`,
    totalDias: sql<number>`COALESCE(SUM(diasAfastamento), 0)`,
  }).from(atestados)
    .innerJoin(employees, eq(atestados.employeeId, employees.id))
    .where(and(eq(atestados.companyId, companyId), isNull(atestados.deletedAt), isNull(employees.deletedAt)))
    .groupBy(atestados.employeeId, employees.nomeCompleto, employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // Advertências por tipo — filtrar soft-deleted
  const advertenciasTipo = await db.select({
    tipo: warnings.tipoAdvertencia,
    count: sql<number>`count(*)`,
  }).from(warnings).where(and(eq(warnings.companyId, companyId), isNull(warnings.deletedAt))).groupBy(warnings.tipoAdvertencia);

  // Total geral
  const totalAtivos = statusDist.find(s => s.status === "Ativo")?.count || 0;
  const totalGeral = statusDist.reduce((s, r) => s + Number(r.count), 0);

  return {
    resumo: { totalGeral, totalAtivos: Number(totalAtivos) },
    statusDist: statusDist.map(r => ({ label: r.status, value: Number(r.count) })),
    sexDist: sexDist.map(r => ({ label: r.sexo || "Não informado", value: Number(r.count) })),
    setorDist: setorDist.map(r => ({ label: r.setor || "Não informado", value: Number(r.count) })),
    funcaoDist: funcaoDist.map(r => ({ label: r.funcao || "Não informado", value: Number(r.count) })),
    contratoDist: contratoDist.map(r => ({ label: r.tipo || "Não informado", value: Number(r.count) })),
    estadoCivilDist: estadoCivilDist.map(r => ({ label: r.estadoCivil || "Não informado", value: Number(r.count) })),
    cidadeDist: cidadeDist.map(r => ({ label: r.cidade || "Não informado", value: Number(r.count) })),
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
async function getDashCartaoPonto(companyId: number, mesRef?: string) {
  const db = await getDb();
  if (!db) return null;
  const mes = mesRef || new Date().toISOString().slice(0, 7);

  // Registros do mês
  const registros = await db.select().from(timeRecords)
    .where(and(eq(timeRecords.companyId, companyId), eq(timeRecords.mesReferencia, mes)));

  // Funcionários ativos
  const allEmps = await db.select({
    id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`status = 'Ativo'`, sql`${employees.deletedAt} IS NULL`));
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
async function getDashFolhaPagamento(companyId: number, mesRef?: string) {
  const db = await getDb();
  if (!db) return null;
  const mes = mesRef || new Date().toISOString().slice(0, 7);
  const year = mes.slice(0, 4);

  // Dados do monthlyPayrollSummary (mais completo)
  const summaryMes = await db.select().from(monthlyPayrollSummary)
    .where(and(eq(monthlyPayrollSummary.companyId, companyId), eq(monthlyPayrollSummary.mesReferencia, mes)));

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
    .where(and(eq(monthlyPayrollSummary.companyId, companyId), sql`mesReferencia >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 12 MONTH), '%Y-%m')`))
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
}) {
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
    eq(extraPayments.companyId, companyId),
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
    obraAtualId: employees.obraAtualId,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`));
  const empMap = new Map(allEmps.map(e => [e.id, e]));

  // Obras
  const allObras = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(and(eq(obras.companyId, companyId), sql`${obras.deletedAt} IS NULL`));
  const obraMap = new Map(allObras.map(o => [o.id, o.nome]));

  const allPayroll = await db.select().from(payroll)
    .where(and(eq(payroll.companyId, companyId), gte(payroll.mesReferencia, startDate), lte(payroll.mesReferencia, endDate)));

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
    const empIdsNaObra = new Set(allEmps.filter(e => e.obraAtualId === filters.obraId).map(e => e.id));
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
async function getDashEpis(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];

  const allEpis = await db.select().from(epis).where(eq(epis.companyId, companyId));
  const allDel = await db.select().from(epiDeliveries)
    .where(and(eq(epiDeliveries.companyId, companyId), isNull(epiDeliveries.deletedAt)));
  const allEmps = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, obraAtualId: employees.obraAtualId })
    .from(employees).where(and(eq(employees.companyId, companyId), isNull(employees.deletedAt)));
  const empMap = new Map(allEmps.map(e => [e.id, e]));
  const allObras = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(eq(obras.companyId, companyId));
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
    const custo = entregas.reduce((s, del) => s + parseFloat(String(del.valorCobrado || '0')), 0);
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
    porEpi[d.epiId].custo += parseFloat(String(d.valorCobrado || '0'));
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
    porFunc[d.employeeId].custo += parseFloat(String(d.valorCobrado || '0'));
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
  const custoPorObraDetalhado: Record<string, { nome: string; entregas: number; unidades: number; custo: number }> = {};
  allDel.forEach(del => {
    const emp = empMap.get(del.employeeId);
    const obraNome = emp?.obraAtualId ? (obraMap.get(emp.obraAtualId) || 'Sem obra') : 'Sem obra';
    if (!custoPorObraDetalhado[obraNome]) custoPorObraDetalhado[obraNome] = { nome: obraNome, entregas: 0, unidades: 0, custo: 0 };
    custoPorObraDetalhado[obraNome].entregas++;
    custoPorObraDetalhado[obraNome].unidades += (del.quantidade || 1);
    custoPorObraDetalhado[obraNome].custo += parseFloat(String(del.valorCobrado || '0'));
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
  const alertasPendentes = await db.select().from(epiDiscountAlerts)
    .where(and(eq(epiDiscountAlerts.companyId, companyId), eq(epiDiscountAlerts.status, 'pendente')));
  const valorDescontosPendentes = alertasPendentes.reduce((s, a) => s + parseFloat(String(a.valorTotal || '0')), 0);

  // Custo médio por funcionário
  const totalCusto = allDel.reduce((s, d) => s + parseFloat(String(d.valorCobrado || '0')), 0);
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
async function getDashJuridico(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];

  const allProcessos = await db.select().from(processosTrabalhistas)
    .where(eq(processosTrabalhistas.companyId, companyId));

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
    const pedidos = (p.pedidos as string[] | null) || [];
    for (const ped of pedidos) {
      pedidosCount[ped] = (pedidosCount[ped] || 0) + 1;
    }
  }
  const topPedidos = Object.entries(pedidosCount).map(([pedido, count]) => ({ pedido, count }))
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
  };
}

// ============================================================
// DRILL-DOWN: buscar funcionários detalhados por filtro
// ============================================================
async function getDrillDown(companyId: number, filterType: string, filterValue: string) {
  const db = await getDb();
  if (!db) return [];

  let whereClause = and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`);

  switch (filterType) {
    case 'status':
      whereClause = and(whereClause, sql`${employees.status} = ${filterValue}`);
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
    case 'faixaEtaria': {
      const ranges: Record<string, [number, number]> = {
        '14-20': [14, 20], '21-25': [21, 25], '26-30': [26, 30],
        '31-40': [31, 40], '41-50': [41, 50], '51-60': [51, 60], '61+': [61, 120],
      };
      const [min, max] = ranges[filterValue] || [0, 120];
      whereClause = and(whereClause, sql`dataNascimento IS NOT NULL`,
        sql`TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) >= ${min}`,
        sql`TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) <= ${max}`);
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
        sql`TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) >= ${min2}`,
        sql`TIMESTAMPDIFF(YEAR, dataNascimento, CURDATE()) <= ${max2}`,
        sql`${employees.sexo} = ${sexo}`);
      break;
    }
    case 'tempoEmpresa': {
      const tenureRanges: Record<string, string> = {
        '< 3 meses': 'TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 3',
        '3-6 meses': 'TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) >= 3 AND TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 6',
        '6-12 meses': 'TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) >= 6 AND TIMESTAMPDIFF(MONTH, dataAdmissao, CURDATE()) < 12',
        '1-2 anos': 'TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) >= 1 AND TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 2',
        '2-5 anos': 'TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) >= 2 AND TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 5',
        '5-10 anos': 'TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) >= 5 AND TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) < 10',
        '10+ anos': 'TIMESTAMPDIFF(YEAR, dataAdmissao, CURDATE()) >= 10',
      };
      const tenureSql = tenureRanges[filterValue];
      if (tenureSql) {
        whereClause = and(whereClause, sql`dataAdmissao IS NOT NULL`, sql`status != 'Desligado'`, sql.raw(tenureSql));
      }
      break;
    }
    case 'admissaoMes': {
      // filterValue = "2025-03"
      whereClause = and(whereClause, sql`DATE_FORMAT(dataAdmissao, '%Y-%m') = ${filterValue}`);
      break;
    }
    case 'demissaoMes': {
      // filterValue = "2025-03"
      whereClause = and(whereClause, sql`DATE_FORMAT(dataDemissao, '%Y-%m') = ${filterValue}`);
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
async function getDashAvisoPrevio(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  // Auto-conclude: mark as 'concluido' any aviso where dataFim < today and status is still 'em_andamento'
  const today = new Date().toISOString().split('T')[0];
  await db.update(terminationNotices)
    .set({ status: 'concluido', dataConclusao: today, updatedAt: sql`NOW()` })
    .where(and(
      eq(terminationNotices.companyId, companyId),
      eq(terminationNotices.status, 'em_andamento'),
      isNull(terminationNotices.deletedAt),
      sql`${terminationNotices.dataFim} IS NOT NULL AND ${terminationNotices.dataFim} < ${today}`
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
    .where(and(eq(terminationNotices.companyId, companyId), isNull(terminationNotices.deletedAt)))
    .orderBy(desc(terminationNotices.createdAt));

  const total = allNotices.length;
  const emAndamento = allNotices.filter(n => n.status === 'em_andamento').length;
  const concluidos = allNotices.filter(n => n.status === 'concluido').length;
  const cancelados = allNotices.filter(n => n.status === 'cancelado').length;
  const empregadorTrabalhado = allNotices.filter(n => n.tipo === 'empregador_trabalhado').length;
  const empregadorIndenizado = allNotices.filter(n => n.tipo === 'empregador_indenizado').length;
  const empregadoTrabalhado = allNotices.filter(n => n.tipo === 'empregado_trabalhado').length;
  const empregadoIndenizado = allNotices.filter(n => n.tipo === 'empregado_indenizado').length;

  const parseVal = (v: string | null) => { const n = parseFloat(v || '0'); return isNaN(n) ? 0 : n; };
  const valorTotalEstimado = allNotices.reduce((s, n) => s + parseVal(n.valorEstimadoTotal), 0);
  const valorEmAndamento = allNotices.filter(n => n.status === 'em_andamento').reduce((s, n) => s + parseVal(n.valorEstimadoTotal), 0);
  const valorConcluido = allNotices.filter(n => n.status === 'concluido').reduce((s, n) => s + parseVal(n.valorEstimadoTotal), 0);
  const valorCancelado = allNotices.filter(n => n.status === 'cancelado').reduce((s, n) => s + parseVal(n.valorEstimadoTotal), 0);

  const reducao2h = allNotices.filter(n => n.reducaoJornada === '2h_dia').length;
  const reducao7dias = allNotices.filter(n => n.reducaoJornada === '7_dias_corridos').length;
  const semReducao = allNotices.filter(n => n.reducaoJornada === 'nenhuma' || !n.reducaoJornada).length;

  const porSetor: Record<string, number> = {};
  allNotices.forEach(n => { const s = n.setor || 'Não informado'; porSetor[s] = (porSetor[s] || 0) + 1; });
  const setorDist = Object.entries(porSetor).map(([setor, c]) => ({ setor, count: c })).sort((a, b) => b.count - a.count);

  const porFuncao: Record<string, number> = {};
  allNotices.forEach(n => { const f = n.funcao || n.cargo || 'Não informado'; porFuncao[f] = (porFuncao[f] || 0) + 1; });
  const funcaoDist = Object.entries(porFuncao).map(([funcao, c]) => ({ funcao, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);

  const porMes: Record<string, { trabalhado: number; indenizado: number }> = {};
  allNotices.forEach(n => {
    const d = n.dataInicio ? new Date(n.dataInicio) : new Date(n.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!porMes[key]) porMes[key] = { trabalhado: 0, indenizado: 0 };
    if (n.tipo?.includes('indenizado')) porMes[key].indenizado++; else porMes[key].trabalhado++;
  });
  const evolucaoMensal = Object.entries(porMes).map(([mes, v]) => ({ mes, ...v, total: v.trabalhado + v.indenizado })).sort((a, b) => a.mes.localeCompare(b.mes));

  const diasDist: Record<number, number> = {};
  allNotices.forEach(n => { const d = n.diasAviso || 30; diasDist[d] = (diasDist[d] || 0) + 1; });
  const diasAvisoDist = Object.entries(diasDist).map(([dias, c]) => ({ dias: Number(dias), count: c })).sort((a, b) => a.dias - b.dias);

  const anosDist: Record<number, number> = {};
  allNotices.forEach(n => { const a = n.anosServico || 0; anosDist[a] = (anosDist[a] || 0) + 1; });
  const anosServicoDist = Object.entries(anosDist).map(([anos, c]) => ({ anos: Number(anos), count: c })).sort((a, b) => a.anos - b.anos);

  const custoSetor: Record<string, number> = {};
  allNotices.forEach(n => { const s = n.setor || 'Não informado'; custoSetor[s] = (custoSetor[s] || 0) + parseVal(n.valorEstimadoTotal); });
  const custoPorSetor = Object.entries(custoSetor).map(([setor, valor]) => ({ setor, valor })).sort((a, b) => b.valor - a.valor);

  const hoje = new Date();
  const em7dias = new Date(hoje); em7dias.setDate(em7dias.getDate() + 7);
  const em30dias = new Date(hoje); em30dias.setDate(em30dias.getDate() + 30);
  const vencendo7dias = allNotices.filter(n => { if (n.status !== 'em_andamento') return false; const fim = new Date(n.dataFim); return fim >= hoje && fim <= em7dias; }).length;
  const vencendo30dias = allNotices.filter(n => { if (n.status !== 'em_andamento') return false; const fim = new Date(n.dataFim); return fim >= hoje && fim <= em30dias; }).length;

  let totalSaldoSalario = 0, totalFerias = 0, total13o = 0, totalFGTS = 0, totalMultaFGTS = 0, totalAvisoIndenizado = 0;
  allNotices.forEach(n => {
    if (n.previsaoRescisao) {
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
    avisos: allNotices.map(n => ({
      id: n.id, nomeCompleto: n.nomeCompleto || 'Funcionário não encontrado',
      tipo: n.tipo, dataInicio: n.dataInicio, dataFim: n.dataFim,
      diasAviso: n.diasAviso, anosServico: n.anosServico,
      reducaoJornada: n.reducaoJornada, salarioBase: n.salarioBase || n.empSalarioBase,
      valorEstimadoTotal: n.valorEstimadoTotal, status: n.status,
      setor: n.setor, funcao: n.funcao || n.cargo, criadoPor: n.criadoPor,
    })),
  };
}

// ============================================================
// 9. DASHBOARD FÉRIAS (análise completa)
// ============================================================
async function getDashFerias(companyId: number, ano?: number) {
  const db = await getDb();
  if (!db) return null;
  const anoRef = ano || new Date().getFullYear();

  // Todos os períodos de férias da empresa
  const allPeriods = await db.select({
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
    dataAlteradaPeloRH: vacationPeriods.dataAlteradaPeloRH,
    numeroPeriodo: vacationPeriods.numeroPeriodo,
    fracionamento: vacationPeriods.fracionamento,
    nomeCompleto: employees.nomeCompleto,
    funcao: employees.funcao,
    setor: employees.setor,
    obraAtualId: employees.obraAtualId,
    salarioBase: employees.salarioBase,
    empStatus: employees.status,
  }).from(vacationPeriods)
    .leftJoin(employees, eq(vacationPeriods.employeeId, employees.id))
    .where(and(eq(vacationPeriods.companyId, companyId), isNull(vacationPeriods.deletedAt)))
    .orderBy(desc(vacationPeriods.createdAt));

  const parseVal = (v: string | null) => { const n = parseFloat(v || '0'); return isNaN(n) ? 0 : n; };

  // KPIs por status
  const total = allPeriods.length;
  const pendentes = allPeriods.filter(p => p.status === 'pendente').length;
  const agendadas = allPeriods.filter(p => p.status === 'agendada').length;
  const vencidas = allPeriods.filter(p => p.status === 'vencida' || p.vencida === 1).length;
  const emGozo = allPeriods.filter(p => p.status === 'em_gozo').length;
  const concluidas = allPeriods.filter(p => p.status === 'concluida').length;
  const canceladas = allPeriods.filter(p => p.status === 'cancelada').length;

  // KPIs financeiros
  const custoTotalEstimado = allPeriods.reduce((s, p) => s + parseVal(p.valorTotal), 0);
  const custoPendente = allPeriods.filter(p => p.status === 'pendente' || p.status === 'agendada').reduce((s, p) => s + parseVal(p.valorTotal), 0);
  const custoVencidas = allPeriods.filter(p => p.status === 'vencida' || p.vencida === 1).reduce((s, p) => s + parseVal(p.valorTotal), 0);
  const custoConcluido = allPeriods.filter(p => p.status === 'concluida').reduce((s, p) => s + parseVal(p.valorTotal), 0);
  const custoEmGozo = allPeriods.filter(p => p.status === 'em_gozo').reduce((s, p) => s + parseVal(p.valorTotal), 0);
  const pagamentosEmDobro = allPeriods.filter(p => p.pagamentoEmDobro === 1).length;
  const totalAbonoPecuniario = allPeriods.filter(p => p.abonoPecuniario === 1).length;

  // Distribuição por status (donut)
  const statusDist = [
    { label: 'Pendentes', value: pendentes, color: '#F59E0B' },
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
    custoMensal[key] = (custoMensal[key] || 0) + parseVal(p.valorTotal);
  });
  const custoMensalDist = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${anoRef}-${String(m).padStart(2, '0')}`;
    custoMensalDist.push({ mes: key, valor: custoMensal[key] || 0 });
  }

  // Férias por obra
  const obraIds = new Set(allPeriods.map(p => p.obraAtualId).filter(Boolean));
  let obraNames: Record<number, string> = {};
  if (obraIds.size > 0) {
    const obraList = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
      .where(and(eq(obras.companyId, companyId), isNull(obras.deletedAt)));
    obraList.forEach(o => { obraNames[o.id] = o.nome; });
  }
  const porObra: Record<string, { total: number; vencidas: number; pendentes: number; agendadas: number }> = {};
  allPeriods.forEach(p => {
    const obraNome = p.obraAtualId ? (obraNames[p.obraAtualId] || `Obra ${p.obraAtualId}`) : 'Sem Obra';
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
  const totalAlteradoRH = allPeriods.filter(p => p.dataAlteradaPeloRH === 1).length;
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
    custoSetor[s] = (custoSetor[s] || 0) + parseVal(p.valorTotal);
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
    dataAlteradaPeloRH: p.dataAlteradaPeloRH,
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
// ROUTER
// ============================================================
export const dashboardsRouter = router({
  funcionarios: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashFuncionarios(input.companyId)),
  drillDown: protectedProcedure.input(z.object({ companyId: z.number(), filterType: z.string(), filterValue: z.string() })).query(({ input }) => getDrillDown(input.companyId, input.filterType, input.filterValue)),
  cartaoPonto: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional() })).query(({ input }) => getDashCartaoPonto(input.companyId, input.mesReferencia)),
  folhaPagamento: protectedProcedure.input(z.object({ companyId: z.number(), mesReferencia: z.string().optional() })).query(({ input }) => getDashFolhaPagamento(input.companyId, input.mesReferencia)),
  horasExtras: protectedProcedure.input(z.object({
    companyId: z.number(),
    year: z.number().optional(),
    month: z.number().optional(),
    obraId: z.number().optional(),
    employeeId: z.number().optional(),
    periodoTipo: z.enum(['ano','semestre','trimestre','mes','semana','dia']).optional(),
    periodoValor: z.string().optional(),
  })).query(({ input }) => getDashHorasExtras(input.companyId, input.year, input)),
  epis: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashEpis(input.companyId)),
  juridico: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashJuridico(input.companyId)),
  avisoPrevio: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashAvisoPrevio(input.companyId)),
  ferias: protectedProcedure.input(z.object({ companyId: z.number(), ano: z.number().optional() })).query(({ input }) => getDashFerias(input.companyId, input.ano)),
});
