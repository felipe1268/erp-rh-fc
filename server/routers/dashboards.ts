import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  employees, extraPayments, payroll, timeRecords, warnings, atestados,
  epis, epiDeliveries, processosTrabalhistas, processosAndamentos,
  monthlyPayrollSummary, obraHorasRateio, obras, folhaLancamentos, folhaItens,
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

    // Contar dia de falta: se horasTrabalhadas == 0 e faltas > 0, conta como 1 dia
    // Se horasTrabalhadas > 0 mas < 50% da jornada (4h), conta como 0.5 dia
    if (ft > 0 && ht === 0) {
      porFuncionario[r.employeeId].faltasDias += 1;
      totalFaltasDias += 1;
    } else if (ft > 0 && ht > 0 && ht < 4) {
      porFuncionario[r.employeeId].faltasDias += 0.5;
      totalFaltasDias += 0.5;
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
  const allDel = await db.select().from(epiDeliveries).where(eq(epiDeliveries.companyId, companyId));
  const allEmps = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao })
    .from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`));
  const empMap = new Map(allEmps.map(e => [e.id, e]));

  const estoqueTotal = allEpis.reduce((s, e) => s + (e.quantidadeEstoque || 0), 0);
  const estoqueBaixo = allEpis.filter(e => (e.quantidadeEstoque || 0) <= 5);
  const caVencido = allEpis.filter(e => e.validadeCa && e.validadeCa < hoje);

  // Entregas por mês (últimos 12 meses)
  const porMes: Record<string, number> = {};
  for (const d of allDel) {
    const mes = d.dataEntrega?.substring(0, 7) || "?";
    porMes[mes] = (porMes[mes] || 0) + d.quantidade;
  }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, qtd]) => ({ mes, qtd }));

  // Top EPIs mais entregues
  const porEpi: Record<number, { nome: string; qtd: number }> = {};
  for (const d of allDel) {
    if (!porEpi[d.epiId]) {
      const ep = allEpis.find(e => e.id === d.epiId);
      porEpi[d.epiId] = { nome: ep?.nome || "EPI #" + d.epiId, qtd: 0 };
    }
    porEpi[d.epiId].qtd += d.quantidade;
  }
  const topEpis = Object.values(porEpi).sort((a, b) => b.qtd - a.qtd).slice(0, 10);

  // Funcionários que mais receberam EPIs
  const porFunc: Record<number, { qtd: number; entregas: number }> = {};
  for (const d of allDel) {
    if (!porFunc[d.employeeId]) porFunc[d.employeeId] = { qtd: 0, entregas: 0 };
    porFunc[d.employeeId].qtd += d.quantidade;
    porFunc[d.employeeId].entregas++;
  }
  const topFuncionarios = Object.entries(porFunc)
    .map(([empId, d]) => {
      const emp = empMap.get(Number(empId));
      return { nome: emp?.nome || `#${empId}`, funcao: emp?.funcao || "-", qtd: d.qtd, entregas: d.entregas };
    }).sort((a, b) => b.qtd - a.qtd).slice(0, 10);

  // Estoque por item (top 10 menores)
  const estoqueCritico = allEpis
    .map(e => ({ nome: e.nome, ca: e.ca, estoque: e.quantidadeEstoque || 0, validadeCa: e.validadeCa }))
    .sort((a, b) => a.estoque - b.estoque).slice(0, 10);

  return {
    resumo: {
      totalItens: allEpis.length,
      estoqueTotal,
      estoqueBaixo: estoqueBaixo.length,
      caVencido: caVencido.length,
      totalEntregas: allDel.length,
      totalUnidadesEntregues: allDel.reduce((s, d) => s + d.quantidade, 0),
    },
    evolucaoMensal,
    topEpis,
    topFuncionarios,
    estoqueCritico,
    caVencidos: caVencido.map(e => ({ nome: e.nome, ca: e.ca, validadeCa: e.validadeCa })),
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
// ROUTER
// ============================================================
export const dashboardsRouter = router({
  funcionarios: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashFuncionarios(input.companyId)),
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
});
