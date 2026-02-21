import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { employees, extraPayments, payroll } from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count } from "drizzle-orm";

// ============================================================
// DASHBOARD QUERIES
// ============================================================

// 1. DASHBOARD COLABORADORES
async function getDashColaboradores(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  const statusDist = await db.select({
    status: employees.status,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.status);

  const sexDist = await db.select({
    sexo: employees.sexo,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.sexo);

  const setorDist = await db.select({
    setor: employees.setor,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.setor);

  const funcaoDist = await db.select({
    funcao: employees.funcao,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  const contratoDist = await db.select({
    tipo: employees.tipoContrato,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.tipoContrato);

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
    .where(and(eq(employees.companyId, companyId), sql`dataNascimento IS NOT NULL`))
    .groupBy(sql`faixa`, employees.sexo);

  const [oldest] = await db.select({
    nome: employees.nomeCompleto,
    data: employees.dataNascimento,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataNascimento IS NOT NULL`))
    .orderBy(employees.dataNascimento).limit(1);

  const [youngest] = await db.select({
    nome: employees.nomeCompleto,
    data: employees.dataNascimento,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataNascimento IS NOT NULL`))
    .orderBy(desc(employees.dataNascimento)).limit(1);

  const [longestTenure] = await db.select({
    nome: employees.nomeCompleto,
    data: employees.dataAdmissao,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataAdmissao IS NOT NULL`, eq(employees.status, "Ativo")))
    .orderBy(employees.dataAdmissao).limit(1);

  const [shortestTenure] = await db.select({
    nome: employees.nomeCompleto,
    data: employees.dataAdmissao,
  }).from(employees)
    .where(and(eq(employees.companyId, companyId), sql`dataAdmissao IS NOT NULL`, eq(employees.status, "Ativo")))
    .orderBy(desc(employees.dataAdmissao)).limit(1);

  return {
    statusDist: statusDist.map(r => ({ label: r.status, value: Number(r.count) })),
    sexDist: sexDist.map(r => ({ label: r.sexo || "Não informado", value: Number(r.count) })),
    setorDist: setorDist.map(r => ({ label: r.setor || "Não informado", value: Number(r.count) })),
    funcaoDist: funcaoDist.map(r => ({ label: r.funcao || "Não informado", value: Number(r.count) })),
    contratoDist: contratoDist.map(r => ({ label: r.tipo || "Não informado", value: Number(r.count) })),
    ageDist: ageDist.map(r => ({ faixa: r.faixa, sexo: r.sexo || "Outro", count: Number(r.count) })),
    destaques: {
      maisVelho: oldest ? { nome: oldest.nome, data: oldest.data } : null,
      maisNovo: youngest ? { nome: youngest.nome, data: youngest.data } : null,
      maiorTempo: longestTenure ? { nome: longestTenure.nome, data: longestTenure.data } : null,
      menorTempo: shortestTenure ? { nome: shortestTenure.nome, data: shortestTenure.data } : null,
    },
  };
}

// 2. DASHBOARD HORAS EXTRAS
async function getDashHorasExtras(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const targetYear = year || new Date().getFullYear();
  const startDate = `${targetYear}-01`;
  const endDate = `${targetYear}-12`;

  const allHE = await db.select()
    .from(extraPayments)
    .where(and(
      eq(extraPayments.companyId, companyId),
      eq(extraPayments.tipo, "Horas_Extras"),
      gte(extraPayments.mesReferencia, startDate),
      lte(extraPayments.mesReferencia, endDate),
    ));

  const allEmployees = await db.select({
    id: employees.id,
    nomeCompleto: employees.nomeCompleto,
    cargo: employees.cargo,
    setor: employees.setor,
    valorHora: employees.valorHora,
  }).from(employees).where(eq(employees.companyId, companyId));

  const empMap = new Map(allEmployees.map(e => [e.id, e]));

  const allPayroll = await db.select()
    .from(payroll)
    .where(and(
      eq(payroll.companyId, companyId),
      gte(payroll.mesReferencia, startDate),
      lte(payroll.mesReferencia, endDate),
    ));

  let totalHoras = 0;
  let totalValor = 0;
  let totalRegistros = allHE.length;

  for (const he of allHE) {
    totalHoras += parseFloat(he.quantidadeHoras || "0");
    totalValor += parseFloat(he.valorTotal || "0");
  }

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
        employeeId: Number(empId),
        nome: emp?.nomeCompleto || `Funcionário #${empId}`,
        cargo: emp?.cargo || "-",
        setor: emp?.setor || "-",
        valorHora: emp?.valorHora || "0",
        ...data,
      };
    })
    .sort((a, b) => b.horas - a.horas);

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
    .map(([setor, data]) => ({
      setor,
      horas: data.horas,
      valor: data.valor,
      pessoas: data.pessoas.size,
    }))
    .sort((a, b) => b.valor - a.valor);

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

  const evolucaoMensal = Object.entries(porMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, data]) => ({ mes, ...data }));

  const percentuais: Record<string, number> = {};
  for (const he of allHE) {
    const pct = he.percentualAcrescimo || "50";
    percentuais[pct] = (percentuais[pct] || 0) + 1;
  }

  let totalFolhaBruto = 0;
  for (const p of allPayroll) {
    totalFolhaBruto += parseFloat((p as any).salarioBruto || "0");
  }
  const percentualHEsobreFolha = totalFolhaBruto > 0 ? (totalValor / totalFolhaBruto) * 100 : 0;

  const pessoasComHE = Object.keys(porPessoa).length;
  const mediaHorasPorPessoa = pessoasComHE > 0 ? totalHoras / pessoasComHE : 0;
  const mediaValorPorPessoa = pessoasComHE > 0 ? totalValor / pessoasComHE : 0;

  return {
    resumo: {
      totalHoras: Math.round(totalHoras * 100) / 100,
      totalValor: Math.round(totalValor * 100) / 100,
      totalRegistros,
      pessoasComHE,
      mediaHorasPorPessoa: Math.round(mediaHorasPorPessoa * 100) / 100,
      mediaValorPorPessoa: Math.round(mediaValorPorPessoa * 100) / 100,
      percentualHEsobreFolha: Math.round(percentualHEsobreFolha * 100) / 100,
      totalFolhaBruto: Math.round(totalFolhaBruto * 100) / 100,
    },
    rankingPessoa,
    rankingSetor,
    evolucaoMensal,
    percentuais: Object.entries(percentuais).map(([pct, count]) => ({ percentual: pct, count })).sort((a, b) => b.count - a.count),
    ano: targetYear,
  };
}

export const dashboardsRouter = router({
  colaboradores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(({ input }) => getDashColaboradores(input.companyId)),
  horasExtras: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDashHorasExtras(input.companyId, input.year)),
});
