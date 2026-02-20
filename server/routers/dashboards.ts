import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  employees, asos, trainings, epis, epiDeliveries, accidents, warnings, risks,
  vehicles, equipment, extinguishers, hydrants,
  audits, deviations, actionPlans, dds,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count } from "drizzle-orm";

// ============================================================
// DASHBOARD QUERIES
// ============================================================

// 1. DASHBOARD COLABORADORES
async function getDashColaboradores(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  // Status distribution
  const statusDist = await db.select({
    status: employees.status,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.status);

  // By sex
  const sexDist = await db.select({
    sexo: employees.sexo,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.sexo);

  // By sector
  const setorDist = await db.select({
    setor: employees.setor,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.setor);

  // By function (top 10)
  const funcaoDist = await db.select({
    funcao: employees.funcao,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.funcao)
    .orderBy(sql`count(*) desc`).limit(10);

  // By contract type
  const contratoDist = await db.select({
    tipo: employees.tipoContrato,
    count: sql<number>`count(*)`,
  }).from(employees).where(eq(employees.companyId, companyId)).groupBy(employees.tipoContrato);

  // Age distribution
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

  // Oldest/youngest, longest/shortest tenure
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

// 2. DASHBOARD PENDENTES
async function getDashPendentes(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const today = new Date().toISOString().split("T")[0];
  const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [asosVencidos] = await db.select({ count: sql<number>`count(*)` }).from(asos)
    .where(and(eq(asos.companyId, companyId), sql`${asos.dataValidade} < ${today}`));
  const [asosAVencer] = await db.select({ count: sql<number>`count(*)` }).from(asos)
    .where(and(eq(asos.companyId, companyId), sql`${asos.dataValidade} >= ${today}`, sql`${asos.dataValidade} <= ${in30days}`));
  const [treinVencidos] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataValidade} < ${today}`));
  const [treinAVencer] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataValidade} >= ${today}`, sql`${trainings.dataValidade} <= ${in30days}`));
  const [auditAberto] = await db.select({ count: sql<number>`count(*)` }).from(audits)
    .where(and(eq(audits.companyId, companyId), eq(audits.resultado, "Pendente")));
  const [desviosAberto] = await db.select({ count: sql<number>`count(*)` }).from(deviations)
    .where(and(eq(deviations.companyId, companyId), eq(deviations.status, "Aberto")));
  const [acoesAtrasadas] = await db.select({ count: sql<number>`count(*)` }).from(actionPlans)
    .where(and(eq(actionPlans.companyId, companyId), eq(actionPlans.status, "Pendente"), sql`${actionPlans.quando} < ${today}`));
  const [extintoresVencidos] = await db.select({ count: sql<number>`count(*)` }).from(extinguishers)
    .where(and(eq(extinguishers.companyId, companyId), sql`${extinguishers.validadeRecarga} < ${today}`));
  const [hidrantesVencidos] = await db.select({ count: sql<number>`count(*)` }).from(hydrants)
    .where(and(eq(hydrants.companyId, companyId), sql`${hydrants.proximaInspecao} < ${today}`));

  return {
    asosVencidos: Number(asosVencidos?.count ?? 0),
    asosAVencer: Number(asosAVencer?.count ?? 0),
    treinamentosVencidos: Number(treinVencidos?.count ?? 0),
    treinamentosAVencer: Number(treinAVencer?.count ?? 0),
    auditoriasEmAberto: Number(auditAberto?.count ?? 0),
    desviosEmAberto: Number(desviosAberto?.count ?? 0),
    acoesAtrasadas: Number(acoesAtrasadas?.count ?? 0),
    extintoresVencidos: Number(extintoresVencidos?.count ?? 0),
    hidrantesVencidos: Number(hidrantesVencidos?.count ?? 0),
  };
}

// 3. DASHBOARD TREINAMENTOS
async function getDashTreinamentos(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const today = new Date().toISOString().split("T")[0];
  const yr = year || new Date().getFullYear();
  const startDate = `${yr}-01-01`;
  const endDate = `${yr}-12-31`;

  // Vencidos por norma
  const vencidosPorNorma = await db.select({
    norma: trainings.norma,
    count: sql<number>`count(*)`,
  }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataValidade} < ${today}`))
    .groupBy(trainings.norma).orderBy(sql`count(*) desc`).limit(15);

  // Por mês no ano
  const porMes = await db.select({
    mes: sql<number>`MONTH(${trainings.dataRealizacao})`,
    count: sql<number>`count(*)`,
  }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataRealizacao} >= ${startDate}`, sql`${trainings.dataRealizacao} <= ${endDate}`))
    .groupBy(sql`MONTH(${trainings.dataRealizacao})`);

  // Total geral
  const [totalGeral] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .where(eq(trainings.companyId, companyId));
  const [totalVencidos] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataValidade} < ${today}`));
  const [totalValidos] = await db.select({ count: sql<number>`count(*)` }).from(trainings)
    .where(and(eq(trainings.companyId, companyId), sql`${trainings.dataValidade} >= ${today}`));

  return {
    totalGeral: Number(totalGeral?.count ?? 0),
    totalVencidos: Number(totalVencidos?.count ?? 0),
    totalValidos: Number(totalValidos?.count ?? 0),
    vencidosPorNorma: vencidosPorNorma.map(r => ({ label: r.norma || "Sem norma", value: Number(r.count) })),
    porMes: Array.from({ length: 12 }, (_, i) => {
      const found = porMes.find(r => Number(r.mes) === i + 1);
      return { mes: i + 1, count: found ? Number(found.count) : 0 };
    }),
  };
}

// 4. DASHBOARD EPI
async function getDashEpi(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const yr = year || new Date().getFullYear();
  const startDate = `${yr}-01-01`;
  const endDate = `${yr}-12-31`;

  // Movimentação por mês (entregas)
  const movPorMes = await db.select({
    mes: sql<number>`MONTH(${epiDeliveries.dataEntrega})`,
    entregas: sql<number>`count(*)`,
    quantidade: sql<number>`SUM(${epiDeliveries.quantidade})`,
  }).from(epiDeliveries)
    .where(and(eq(epiDeliveries.companyId, companyId), sql`${epiDeliveries.dataEntrega} >= ${startDate}`, sql`${epiDeliveries.dataEntrega} <= ${endDate}`))
    .groupBy(sql`MONTH(${epiDeliveries.dataEntrega})`);

  // Total EPIs em estoque
  const [estoqueTotal] = await db.select({
    total: sql<number>`SUM(${epis.quantidadeEstoque})`,
    itens: sql<number>`count(*)`,
  }).from(epis).where(eq(epis.companyId, companyId));

  // EPIs com CA vencido
  const today = new Date().toISOString().split("T")[0];
  const [caVencidos] = await db.select({ count: sql<number>`count(*)` }).from(epis)
    .where(and(eq(epis.companyId, companyId), sql`${epis.validadeCA} < ${today}`));

  // Top EPIs entregues
  const topEpis = await db.select({
    nome: epis.nome,
    count: sql<number>`count(*)`,
  }).from(epiDeliveries)
    .innerJoin(epis, eq(epiDeliveries.epiId, epis.id))
    .where(eq(epiDeliveries.companyId, companyId))
    .groupBy(epis.nome).orderBy(sql`count(*) desc`).limit(10);

  return {
    estoqueTotal: Number(estoqueTotal?.total ?? 0),
    itensEstoque: Number(estoqueTotal?.itens ?? 0),
    caVencidos: Number(caVencidos?.count ?? 0),
    movPorMes: Array.from({ length: 12 }, (_, i) => {
      const found = movPorMes.find(r => Number(r.mes) === i + 1);
      return { mes: i + 1, entregas: found ? Number(found.entregas) : 0, quantidade: found ? Number(found.quantidade) : 0 };
    }),
    topEpis: topEpis.map(r => ({ label: r.nome, value: Number(r.count) })),
  };
}

// 5. DASHBOARD ACIDENTES
async function getDashAcidentes(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const yr = year || new Date().getFullYear();
  const startDate = `${yr}-01-01`;
  const endDate = `${yr}-12-31`;

  // Total no ano
  const [totalAno] = await db.select({ count: sql<number>`count(*)` }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${startDate}`, sql`${accidents.dataAcidente} <= ${endDate}`));

  // Com/sem afastamento
  const [comAfastamento] = await db.select({ count: sql<number>`count(*)` }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${startDate}`, sql`${accidents.dataAcidente} <= ${endDate}`, sql`${accidents.diasAfastamento} > 0`));
  const [semAfastamento] = await db.select({ count: sql<number>`count(*)` }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${startDate}`, sql`${accidents.dataAcidente} <= ${endDate}`, sql`(${accidents.diasAfastamento} = 0 OR ${accidents.diasAfastamento} IS NULL)`));

  // Por mês
  const porMes = await db.select({
    mes: sql<number>`MONTH(${accidents.dataAcidente})`,
    count: sql<number>`count(*)`,
  }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${startDate}`, sql`${accidents.dataAcidente} <= ${endDate}`))
    .groupBy(sql`MONTH(${accidents.dataAcidente})`);

  // Por gravidade
  const porGravidade = await db.select({
    gravidade: accidents.gravidade,
    count: sql<number>`count(*)`,
  }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${startDate}`, sql`${accidents.dataAcidente} <= ${endDate}`))
    .groupBy(accidents.gravidade);

  // Por tipo
  const porTipo = await db.select({
    tipo: accidents.tipo,
    count: sql<number>`count(*)`,
  }).from(accidents)
    .where(and(eq(accidents.companyId, companyId), sql`${accidents.dataAcidente} >= ${startDate}`, sql`${accidents.dataAcidente} <= ${endDate}`))
    .groupBy(accidents.tipo);

  // Último acidente
  const [ultimoAcidente] = await db.select({
    data: accidents.dataAcidente,
  }).from(accidents)
    .where(eq(accidents.companyId, companyId))
    .orderBy(desc(accidents.dataAcidente)).limit(1);

  const diasSemAcidente = ultimoAcidente?.data
    ? Math.floor((Date.now() - new Date(ultimoAcidente.data).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    totalAno: Number(totalAno?.count ?? 0),
    comAfastamento: Number(comAfastamento?.count ?? 0),
    semAfastamento: Number(semAfastamento?.count ?? 0),
    diasSemAcidente,
    metaDias: 365,
    porMes: Array.from({ length: 12 }, (_, i) => {
      const found = porMes.find(r => Number(r.mes) === i + 1);
      return { mes: i + 1, count: found ? Number(found.count) : 0 };
    }),
    porGravidade: porGravidade.map(r => ({ label: r.gravidade, value: Number(r.count) })),
    porTipo: porTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
  };
}

// 6. DASHBOARD AUDITORIAS
async function getDashAuditorias(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const yr = year || new Date().getFullYear();
  const startDate = `${yr}-01-01`;
  const endDate = `${yr}-12-31`;

  // Status das auditorias
  const statusDist = await db.select({
    resultado: audits.resultado,
    count: sql<number>`count(*)`,
  }).from(audits)
    .where(and(eq(audits.companyId, companyId), sql`${audits.dataAuditoria} >= ${startDate}`, sql`${audits.dataAuditoria} <= ${endDate}`))
    .groupBy(audits.resultado);

  // Por tipo
  const porTipo = await db.select({
    tipo: audits.tipo,
    count: sql<number>`count(*)`,
  }).from(audits)
    .where(and(eq(audits.companyId, companyId), sql`${audits.dataAuditoria} >= ${startDate}`, sql`${audits.dataAuditoria} <= ${endDate}`))
    .groupBy(audits.tipo);

  // Não conformidades (desvios)
  const [totalNC] = await db.select({ count: sql<number>`count(*)` }).from(deviations)
    .where(eq(deviations.companyId, companyId));
  const [ncResolvidas] = await db.select({ count: sql<number>`count(*)` }).from(deviations)
    .where(and(eq(deviations.companyId, companyId), eq(deviations.status, "Fechado")));

  // Desvios por status
  const desviosStatus = await db.select({
    status: deviations.status,
    count: sql<number>`count(*)`,
  }).from(deviations)
    .where(eq(deviations.companyId, companyId))
    .groupBy(deviations.status);

  return {
    statusDist: statusDist.map(r => ({ label: r.resultado, value: Number(r.count) })),
    porTipo: porTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
    totalNC: Number(totalNC?.count ?? 0),
    ncResolvidas: Number(ncResolvidas?.count ?? 0),
    desviosStatus: desviosStatus.map(r => ({ label: r.status, value: Number(r.count) })),
  };
}

// 7. DASHBOARD 5W2H
async function getDash5w2h(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const yr = year || new Date().getFullYear();
  const startDate = `${yr}-01-01`;
  const endDate = `${yr}-12-31`;

  // Status dos planos
  const statusDist = await db.select({
    status: actionPlans.status,
    count: sql<number>`count(*)`,
  }).from(actionPlans)
    .where(eq(actionPlans.companyId, companyId))
    .groupBy(actionPlans.status);

  // Por mês
  const porMes = await db.select({
    mes: sql<number>`MONTH(${actionPlans.quando})`,
    status: actionPlans.status,
    count: sql<number>`count(*)`,
  }).from(actionPlans)
    .where(and(eq(actionPlans.companyId, companyId), sql`${actionPlans.quando} >= ${startDate}`, sql`${actionPlans.quando} <= ${endDate}`))
    .groupBy(sql`MONTH(${actionPlans.quando})`, actionPlans.status);

  return {
    statusDist: statusDist.map(r => ({ label: r.status, value: Number(r.count) })),
    porMes: porMes.map(r => ({ mes: Number(r.mes), status: r.status, count: Number(r.count) })),
  };
}

// 8. DASHBOARD RISCOS
async function getDashRiscos(companyId: number, setor?: string) {
  const db = await getDb();
  if (!db) return null;

  const conds: any[] = [eq(risks.companyId, companyId)];
  if (setor && setor !== "Todos") conds.push(eq(risks.setor, setor));

  // Por tipo de risco
  const porTipo = await db.select({
    tipo: risks.tipoRisco,
    count: sql<number>`count(*)`,
  }).from(risks).where(and(...conds)).groupBy(risks.tipoRisco);

  // Por grau
  const porGrau = await db.select({
    grau: risks.grauRisco,
    count: sql<number>`count(*)`,
  }).from(risks).where(and(...conds)).groupBy(risks.grauRisco);

  // Por setor
  const porSetor = await db.select({
    setor: risks.setor,
    count: sql<number>`count(*)`,
  }).from(risks).where(eq(risks.companyId, companyId)).groupBy(risks.setor);

  // Setores disponíveis
  const setores = await db.selectDistinct({ setor: risks.setor }).from(risks)
    .where(eq(risks.companyId, companyId));

  return {
    porTipo: porTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
    porGrau: porGrau.map(r => ({ label: r.grau, value: Number(r.count) })),
    porSetor: porSetor.map(r => ({ label: r.setor, value: Number(r.count) })),
    setores: setores.map(r => r.setor),
  };
}

// 9. DASHBOARD EXTINTORES E HIDRANTES
async function getDashExtintoresHidrantes(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const today = new Date().toISOString().split("T")[0];

  // Extintores
  const [totalExtintores] = await db.select({ count: sql<number>`count(*)` }).from(extinguishers)
    .where(eq(extinguishers.companyId, companyId));
  const [extintoresOk] = await db.select({ count: sql<number>`count(*)` }).from(extinguishers)
    .where(and(eq(extinguishers.companyId, companyId), eq(extinguishers.status, "OK")));
  const [extintoresVencidos] = await db.select({ count: sql<number>`count(*)` }).from(extinguishers)
    .where(and(eq(extinguishers.companyId, companyId), sql`${extinguishers.validadeRecarga} < ${today}`));
  const [hidrostaticosValidos] = await db.select({ count: sql<number>`count(*)` }).from(extinguishers)
    .where(and(eq(extinguishers.companyId, companyId), sql`${extinguishers.validadeTesteHidrostatico} >= ${today}`));

  // Por tipo
  const extPorTipo = await db.select({
    tipo: extinguishers.tipo,
    count: sql<number>`count(*)`,
  }).from(extinguishers).where(eq(extinguishers.companyId, companyId)).groupBy(extinguishers.tipo);

  // Hidrantes
  const [totalHidrantes] = await db.select({ count: sql<number>`count(*)` }).from(hydrants)
    .where(eq(hydrants.companyId, companyId));
  const [hidrantesOk] = await db.select({ count: sql<number>`count(*)` }).from(hydrants)
    .where(and(eq(hydrants.companyId, companyId), eq(hydrants.status, "OK")));
  const [hidrantesVencidos] = await db.select({ count: sql<number>`count(*)` }).from(hydrants)
    .where(and(eq(hydrants.companyId, companyId), sql`${hydrants.proximaInspecao} < ${today}`));

  return {
    extintores: {
      total: Number(totalExtintores?.count ?? 0),
      ok: Number(extintoresOk?.count ?? 0),
      vencidos: Number(extintoresVencidos?.count ?? 0),
      hidrostaticosValidos: Number(hidrostaticosValidos?.count ?? 0),
      porTipo: extPorTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
    },
    hidrantes: {
      total: Number(totalHidrantes?.count ?? 0),
      ok: Number(hidrantesOk?.count ?? 0),
      vencidos: Number(hidrantesVencidos?.count ?? 0),
    },
  };
}

// 10. DASHBOARD DESVIOS
async function getDashDesvios(companyId: number, year?: number) {
  const db = await getDb();
  if (!db) return null;
  const yr = year || new Date().getFullYear();

  // Total e concluídos
  const [totalDesvios] = await db.select({ count: sql<number>`count(*)` }).from(deviations)
    .where(eq(deviations.companyId, companyId));
  const [concluidos] = await db.select({ count: sql<number>`count(*)` }).from(deviations)
    .where(and(eq(deviations.companyId, companyId), eq(deviations.status, "Fechado")));

  // Por status
  const statusDist = await db.select({
    status: deviations.status,
    count: sql<number>`count(*)`,
  }).from(deviations).where(eq(deviations.companyId, companyId)).groupBy(deviations.status);

  // Por setor
  const porSetor = await db.select({
    setor: deviations.setor,
    count: sql<number>`count(*)`,
  }).from(deviations).where(eq(deviations.companyId, companyId)).groupBy(deviations.setor)
    .orderBy(sql`count(*) desc`).limit(10);

  // Por tipo
  const porTipo = await db.select({
    tipo: deviations.tipo,
    count: sql<number>`count(*)`,
  }).from(deviations).where(eq(deviations.companyId, companyId)).groupBy(deviations.tipo);

  return {
    total: Number(totalDesvios?.count ?? 0),
    concluidos: Number(concluidos?.count ?? 0),
    statusDist: statusDist.map(r => ({ label: r.status, value: Number(r.count) })),
    porSetor: porSetor.map(r => ({ label: r.setor || "Não informado", value: Number(r.count) })),
    porTipo: porTipo.map(r => ({ label: r.tipo, value: Number(r.count) })),
  };
}

// ============================================================
// ROUTER
// ============================================================

export const dashboardsRouter = router({
  colaboradores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(({ input }) => getDashColaboradores(input.companyId)),

  pendentes: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(({ input }) => getDashPendentes(input.companyId)),

  treinamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDashTreinamentos(input.companyId, input.year)),

  epi: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDashEpi(input.companyId, input.year)),

  acidentes: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDashAcidentes(input.companyId, input.year)),

  auditorias: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDashAuditorias(input.companyId, input.year)),

  planos5w2h: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDash5w2h(input.companyId, input.year)),

  riscos: protectedProcedure
    .input(z.object({ companyId: z.number(), setor: z.string().optional() }))
    .query(({ input }) => getDashRiscos(input.companyId, input.setor)),

  extintoresHidrantes: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(({ input }) => getDashExtintoresHidrantes(input.companyId)),

  desvios: protectedProcedure
    .input(z.object({ companyId: z.number(), year: z.number().optional() }))
    .query(({ input }) => getDashDesvios(input.companyId, input.year)),
});
