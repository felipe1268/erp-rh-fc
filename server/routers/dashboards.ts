import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { employees, extraPayments, payroll, trainings, asos, accidents, audits, deviations, extinguishers, hydrants, actionPlans, epis, epiDeliveries } from "../../drizzle/schema";
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
      eq(extraPayments.tipoExtra, "Horas_Extras"),
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

// 3. DASHBOARD PENDÊNCIAS
async function getDashPendencias(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];
  const allAsos = await db.select().from(asos).where(eq(asos.companyId, companyId));
  const asosVencidos = allAsos.filter(a => a.dataValidade < hoje).length;
  const asosAVencer30 = allAsos.filter(a => { const d = new Date(a.dataValidade + "T00:00:00"); const diff = (d.getTime() - Date.now()) / (1000*60*60*24); return diff >= 0 && diff <= 30; }).length;
  const allTrainings = await db.select().from(trainings).where(eq(trainings.companyId, companyId));
  const treinVencidos = allTrainings.filter(t => t.dataValidade && t.dataValidade < hoje).length;
  const treinAVencer30 = allTrainings.filter(t => { if (!t.dataValidade) return false; const d = new Date(t.dataValidade + "T00:00:00"); const diff = (d.getTime() - Date.now()) / (1000*60*60*24); return diff >= 0 && diff <= 30; }).length;
  const allExt = await db.select().from(extinguishers).where(eq(extinguishers.companyId, companyId));
  const extVencidos = allExt.filter(e => e.statusExtintor === "Vencido" || (e.validadeRecarga && e.validadeRecarga < hoje)).length;
  const allHid = await db.select().from(hydrants).where(eq(hydrants.companyId, companyId));
  const hidManutencao = allHid.filter(h => h.statusHidrante === "Manutencao" || h.statusHidrante === "Inativo").length;
  return {
    asos: { vencidos: asosVencidos, aVencer30: asosAVencer30, ok: allAsos.length - asosVencidos, total: allAsos.length },
    treinamentos: { vencidos: treinVencidos, aVencer30: treinAVencer30, ok: allTrainings.length - treinVencidos, total: allTrainings.length },
    extintores: { vencidos: extVencidos, ok: allExt.length - extVencidos, total: allExt.length },
    hidrantes: { manutencao: hidManutencao, ok: allHid.length - hidManutencao, total: allHid.length },
  };
}

// 4. DASHBOARD TREINAMENTOS
async function getDashTreinamentos(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];
  const allT = await db.select().from(trainings).where(eq(trainings.companyId, companyId));
  const allEmps = await db.select({ id: employees.id, nome: employees.nomeCompleto }).from(employees).where(eq(employees.companyId, companyId));
  const empMap = new Map(allEmps.map(e => [e.id, e.nome]));
  const statusDist = [
    { label: "Válido", value: allT.filter(t => !t.dataValidade || t.dataValidade >= hoje).length },
    { label: "Vencido", value: allT.filter(t => t.dataValidade && t.dataValidade < hoje).length },
    { label: "A Vencer (30d)", value: allT.filter(t => { if (!t.dataValidade) return false; const d = new Date(t.dataValidade + "T00:00:00"); const diff = (d.getTime() - Date.now()) / (1000*60*60*24); return diff >= 0 && diff <= 30; }).length },
  ];
  const porNorma: Record<string, number> = {};
  for (const t of allT) { const n = t.norma || "Sem Norma"; porNorma[n] = (porNorma[n] || 0) + 1; }
  const normaDist = Object.entries(porNorma).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  const porMes: Record<string, number> = {};
  for (const t of allT) { const mes = t.dataRealizacao?.substring(0, 7) || "Desconhecido"; porMes[mes] = (porMes[mes] || 0) + 1; }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([mes, count]) => ({ mes, count }));
  const vencidos = allT.filter(t => t.dataValidade && t.dataValidade < hoje).map(t => ({ id: t.id, nome: t.nome, norma: t.norma, dataValidade: t.dataValidade, funcionario: empMap.get(t.employeeId) || "Desconhecido" })).sort((a, b) => (a.dataValidade || "").localeCompare(b.dataValidade || ""));
  return { statusDist, normaDist, evolucaoMensal, vencidos: vencidos.slice(0, 20), total: allT.length };
}

// 5. DASHBOARD EPI
async function getDashEpi(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const allEpis = await db.select().from(epis).where(eq(epis.companyId, companyId));
  const allDel = await db.select().from(epiDeliveries).where(eq(epiDeliveries.companyId, companyId));
  const hoje = new Date().toISOString().split("T")[0];
  const estoqueTotal = allEpis.reduce((s, e) => s + (e.quantidadeEstoque || 0), 0);
  const estoqueBaixo = allEpis.filter(e => (e.quantidadeEstoque || 0) <= 5).length;
  const caVencido = allEpis.filter(e => e.validadeCa && e.validadeCa < hoje).length;
  const porMes: Record<string, number> = {};
  for (const d of allDel) { const mes = d.dataEntrega?.substring(0, 7) || "?"; porMes[mes] = (porMes[mes] || 0) + d.quantidade; }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([mes, qtd]) => ({ mes, qtd }));
  const porEpi: Record<number, { nome: string; qtd: number }> = {};
  for (const d of allDel) { if (!porEpi[d.epiId]) { const ep = allEpis.find(e => e.id === d.epiId); porEpi[d.epiId] = { nome: ep?.nome || "EPI #" + d.epiId, qtd: 0 }; } porEpi[d.epiId].qtd += d.quantidade; }
  const topEpis = Object.values(porEpi).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
  return { resumo: { totalItens: allEpis.length, estoqueTotal, estoqueBaixo, caVencido, totalEntregas: allDel.length }, evolucaoMensal, topEpis };
}

// 6. DASHBOARD ACIDENTES
async function getDashAcidentes(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const allAcc = await db.select().from(accidents).where(eq(accidents.companyId, companyId));
  const totalAfastamento = allAcc.reduce((s, a) => s + (a.diasAfastamento || 0), 0);
  const comAfastamento = allAcc.filter(a => (a.diasAfastamento || 0) > 0).length;
  const porTipo: Record<string, number> = {};
  for (const a of allAcc) { const t = a.tipoAcidente || "Outro"; porTipo[t] = (porTipo[t] || 0) + 1; }
  const tipoDist = Object.entries(porTipo).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  const porGravidade: Record<string, number> = {};
  for (const a of allAcc) { const g = a.gravidade || "Outro"; porGravidade[g] = (porGravidade[g] || 0) + 1; }
  const gravidadeDist = Object.entries(porGravidade).map(([label, value]) => ({ label, value }));
  const porMes: Record<string, number> = {};
  for (const a of allAcc) { const mes = a.dataAcidente?.substring(0, 7) || "?"; porMes[mes] = (porMes[mes] || 0) + 1; }
  const evolucaoMensal = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([mes, count]) => ({ mes, count }));
  const sorted = [...allAcc].sort((a, b) => b.dataAcidente.localeCompare(a.dataAcidente));
  const ultimoAcidente = sorted[0]?.dataAcidente;
  const diasSemAcidente = ultimoAcidente ? Math.floor((Date.now() - new Date(ultimoAcidente + "T00:00:00").getTime()) / (1000*60*60*24)) : null;
  return { resumo: { totalAcidentes: allAcc.length, totalAfastamento, comAfastamento, diasSemAcidente, ultimoAcidente }, tipoDist, gravidadeDist, evolucaoMensal };
}

// 7. DASHBOARD AUDITORIAS
async function getDashAuditorias(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const allAud = await db.select().from(audits).where(eq(audits.companyId, companyId));
  const allDev = await db.select().from(deviations).where(eq(deviations.companyId, companyId));
  const porResultado: Record<string, number> = {};
  for (const a of allAud) { const r = a.resultadoAuditoria || "Pendente"; porResultado[r] = (porResultado[r] || 0) + 1; }
  const resultadoDist = Object.entries(porResultado).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  const porTipo: Record<string, number> = {};
  for (const a of allAud) { const t = a.tipoAuditoria || "Outro"; porTipo[t] = (porTipo[t] || 0) + 1; }
  const tipoDist = Object.entries(porTipo).map(([label, value]) => ({ label, value }));
  const ncAbertas = allDev.filter(d => d.statusDesvio === "Aberto" || d.statusDesvio === "Em_Andamento").length;
  const ncFechadas = allDev.filter(d => d.statusDesvio === "Fechado").length;
  return { resumo: { totalAuditorias: allAud.length, ncTotal: allDev.length, ncAbertas, ncFechadas }, resultadoDist, tipoDist };
}

// 8. DASHBOARD 5W2H
async function getDash5w2h(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const allPlans = await db.select().from(actionPlans).where(eq(actionPlans.companyId, companyId));
  const porStatus: Record<string, number> = {};
  for (const p of allPlans) { const s = p.statusPlano || "Pendente"; porStatus[s] = (porStatus[s] || 0) + 1; }
  const statusDist = Object.entries(porStatus).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  const atrasados = allPlans.filter(p => p.quando && p.quando < new Date().toISOString().split("T")[0] && p.statusPlano !== "Concluido" && p.statusPlano !== "Cancelado").length;
  const concluidos = allPlans.filter(p => p.statusPlano === "Concluido").length;
  const taxaConclusao = allPlans.length > 0 ? Math.round((concluidos / allPlans.length) * 100) : 0;
  return { resumo: { total: allPlans.length, atrasados, concluidos, taxaConclusao }, statusDist };
}

// 9. DASHBOARD EXTINTORES E HIDRANTES
async function getDashExtintoresHidrantes(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const hoje = new Date().toISOString().split("T")[0];
  const allExt = await db.select().from(extinguishers).where(eq(extinguishers.companyId, companyId));
  const allHid = await db.select().from(hydrants).where(eq(hydrants.companyId, companyId));
  const extPorTipo: Record<string, number> = {};
  for (const e of allExt) { extPorTipo[e.tipoExtintor || "Outro"] = (extPorTipo[e.tipoExtintor || "Outro"] || 0) + 1; }
  const extTipoDist = Object.entries(extPorTipo).map(([label, value]) => ({ label, value }));
  const extPorStatus: Record<string, number> = {};
  for (const e of allExt) { extPorStatus[e.statusExtintor || "OK"] = (extPorStatus[e.statusExtintor || "OK"] || 0) + 1; }
  const extStatusDist = Object.entries(extPorStatus).map(([label, value]) => ({ label, value }));
  const hidPorStatus: Record<string, number> = {};
  for (const h of allHid) { hidPorStatus[h.statusHidrante || "OK"] = (hidPorStatus[h.statusHidrante || "OK"] || 0) + 1; }
  const hidStatusDist = Object.entries(hidPorStatus).map(([label, value]) => ({ label, value }));
  const extVencidos = allExt.filter(e => e.validadeRecarga && e.validadeRecarga < hoje).length;
  return { extintores: { total: allExt.length, tipoDist: extTipoDist, statusDist: extStatusDist, vencidos: extVencidos }, hidrantes: { total: allHid.length, statusDist: hidStatusDist } };
}

// 10. DASHBOARD DESVIOS
async function getDashDesvios(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const allDev = await db.select().from(deviations).where(eq(deviations.companyId, companyId));
  const porStatus: Record<string, number> = {};
  for (const d of allDev) { porStatus[d.statusDesvio || "Aberto"] = (porStatus[d.statusDesvio || "Aberto"] || 0) + 1; }
  const statusDist = Object.entries(porStatus).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  const porTipo: Record<string, number> = {};
  for (const d of allDev) { porTipo[d.tipoDesvio || "Outro"] = (porTipo[d.tipoDesvio || "Outro"] || 0) + 1; }
  const tipoDist = Object.entries(porTipo).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  const porSetor: Record<string, number> = {};
  for (const d of allDev) { porSetor[d.setor || "Sem Setor"] = (porSetor[d.setor || "Sem Setor"] || 0) + 1; }
  const setorDist = Object.entries(porSetor).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const fechados = allDev.filter(d => d.statusDesvio === "Fechado").length;
  const taxaResolucao = allDev.length > 0 ? Math.round((fechados / allDev.length) * 100) : 0;
  return { resumo: { total: allDev.length, abertos: allDev.filter(d => d.statusDesvio === "Aberto").length, emAndamento: allDev.filter(d => d.statusDesvio === "Em_Andamento").length, fechados, taxaResolucao }, statusDist, tipoDist, setorDist };
}

export const dashboardsRouter = router({
  colaboradores: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashColaboradores(input.companyId)),
  horasExtras: protectedProcedure.input(z.object({ companyId: z.number(), year: z.number().optional() })).query(({ input }) => getDashHorasExtras(input.companyId, input.year)),
  pendencias: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashPendencias(input.companyId)),
  treinamentos: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashTreinamentos(input.companyId)),
  epi: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashEpi(input.companyId)),
  acidentes: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashAcidentes(input.companyId)),
  auditorias: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashAuditorias(input.companyId)),
  planos5w2h: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDash5w2h(input.companyId)),
  extintoresHidrantes: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashExtintoresHidrantes(input.companyId)),
  desvios: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => getDashDesvios(input.companyId)),
});
