/**
 * Avaliação de Funcionários — Rev. 1971 (Fase 1 MVP).
 *
 * Procedures READ-ONLY que calculam scores agregando dados existentes:
 *   - getRanking: lista todos os funcionários ativos com score geral e sub-scores,
 *     ordenada (top/bottom).
 *   - getScoreFuncionario: detalhe individual (todos os inputs + observações).
 *   - getResumo: KPIs gerais (média por sub-score + distribuição de classificação).
 *
 * Período: últimos N meses (default 6). Sem JOIN N+1 — agrega tudo via SQL.
 *
 * R-001/R-007/R-010: zero ALTER/DROP/DELETE. Tudo SELECT.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import {
  employees, pontoDescontosResumo, atestados, accidents, warnings, ddsSessaoFuncionarios, ddsSessoes,
} from "../../drizzle/schema";
import { and, eq, gte, isNull, sql, inArray } from "drizzle-orm";
import {
  scoreFrequencia, scoreSaude, scoreDisciplina, scoreSeguranca, scoreGeral,
  classificar, gerarObservacoes, PESOS_DEFAULT,
  type FrequenciaInputs, type SaudeInputs, type DisciplinaInputs, type SegurancaInputs,
  type PesosScore,
} from "../utils/employeeScore";

/**
 * Valida que o usuário autenticado tem vínculo com a companyId solicitada.
 * Protege contra IDOR (ranking de outra empresa via troca de id no payload).
 * Admin global passa sem checagem.
 */
async function ensureCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const role = String(ctxUser.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin') return;
  const userCompanies = await getCompaniesForUser(ctxUser.id, ctxUser.role);
  const allowed = userCompanies.map((c: any) => Number(c.id));
  if (allowed.length > 0 && !allowed.includes(Number(companyId))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado à empresa solicitada.' });
  }
}

const periodoInput = z.object({
  companyId: z.number(),
  obraId: z.number().nullable().optional(),
  periodoMeses: z.number().min(1).max(36).default(6),
  pesos: z.object({
    frequencia: z.number().min(0).max(1),
    saude: z.number().min(0).max(1),
    disciplina: z.number().min(0).max(1),
    seguranca: z.number().min(0).max(1),
  }).optional(),
});

function dataInicioPeriodo(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

function mesRefInicio(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 7);
}

/**
 * Carrega TODOS os inputs (4 categorias) para TODOS os employees ativos
 * de uma companyId em UMA passada de SQL por categoria.
 */
async function carregarInputs(companyId: number, obraId: number | null | undefined, periodoMeses: number) {
  const db = getDb();
  const dataInicio = dataInicioPeriodo(periodoMeses);
  const mesInicio = mesRefInicio(periodoMeses);

  // 1) Employees ativos da empresa.
  // NOTA Fase 1 MVP: filtro de obra atual será implementado na Fase 2 (precisa
  // de JOIN com a tabela de alocações). Por enquanto retorna toda a empresa.
  void obraId;
  const empConds = [eq(employees.companyId, companyId), eq(employees.status, 'Ativo'), isNull(employees.deletedAt)];
  const emps = await db.select({
    id: employees.id,
    nome: employees.nomeCompleto,
    funcao: employees.funcao,
    dataAdmissao: employees.dataAdmissao,
  }).from(employees).where(and(...empConds));

  if (emps.length === 0) return { emps: [], freqMap: new Map(), saudeMap: new Map(), discMap: new Map(), segMap: new Map() };

  const empIds = emps.map(e => e.id);

  // 2) Frequência — soma de pontoDescontosResumo no período (mesReferencia YYYY-MM)
  const freqRows = await db.select({
    employeeId: pontoDescontosResumo.employeeId,
    faltas: sql<number>`coalesce(sum(${pontoDescontosResumo.totalFaltasInjustificadas}), 0)::int`,
    atrasos: sql<number>`coalesce(sum(${pontoDescontosResumo.totalAtrasos}), 0)::int`,
    saidasAnt: sql<number>`coalesce(sum(${pontoDescontosResumo.totalSaidasAntecipadas}), 0)::int`,
    minAtraso: sql<number>`coalesce(sum(${pontoDescontosResumo.totalMinutosAtraso}), 0)::int`,
  }).from(pontoDescontosResumo).where(and(
    eq(pontoDescontosResumo.companyId, companyId),
    inArray(pontoDescontosResumo.employeeId, empIds),
    gte(pontoDescontosResumo.mesReferencia, mesInicio),
  )).groupBy(pontoDescontosResumo.employeeId);
  const freqMap = new Map<number, FrequenciaInputs>();
  freqRows.forEach(r => freqMap.set(r.employeeId, {
    totalFaltasInjustificadas: Number(r.faltas) || 0,
    totalAtrasos: Number(r.atrasos) || 0,
    totalSaidasAntecipadas: Number(r.saidasAnt) || 0,
    totalMinutosAtraso: Number(r.minAtraso) || 0,
  }));

  // 3) Saúde — atestados + acidentes (count + dias)
  const ateRows = await db.select({
    employeeId: atestados.employeeId,
    count: sql<number>`count(*)::int`,
    dias: sql<number>`coalesce(sum(${atestados.diasAfastamento}), 0)::int`,
  }).from(atestados).where(and(
    eq(atestados.companyId, companyId),
    inArray(atestados.employeeId, empIds),
    gte(atestados.dataEmissao, dataInicio),
    isNull(atestados.deletedAt),
  )).groupBy(atestados.employeeId);
  const acidSaudeRows = await db.select({
    employeeId: accidents.employeeId,
    count: sql<number>`count(*)::int`,
    dias: sql<number>`coalesce(sum(${accidents.diasAfastamento}), 0)::int`,
  }).from(accidents).where(and(
    eq(accidents.companyId, companyId),
    inArray(accidents.employeeId, empIds),
    gte(accidents.dataAcidente, dataInicio),
    isNull(accidents.deletedAt),
  )).groupBy(accidents.employeeId);
  const saudeMap = new Map<number, SaudeInputs>();
  empIds.forEach(id => saudeMap.set(id, { countAtestados: 0, diasAfastadoAtestado: 0, countAcidentes: 0, diasAfastadoAcidente: 0 }));
  ateRows.forEach(r => {
    const s = saudeMap.get(r.employeeId)!;
    s.countAtestados = Number(r.count) || 0;
    s.diasAfastadoAtestado = Number(r.dias) || 0;
  });
  acidSaudeRows.forEach(r => {
    const s = saudeMap.get(r.employeeId)!;
    s.countAcidentes = Number(r.count) || 0;
    s.diasAfastadoAcidente = Number(r.dias) || 0;
  });

  // 4) Disciplina — warnings por tipo
  const discRows = await db.select({
    employeeId: warnings.employeeId,
    tipo: warnings.tipoAdvertencia,
    count: sql<number>`count(*)::int`,
    diasSusp: sql<number>`coalesce(sum(coalesce(${warnings.diasSuspensao}, ${warnings.diasSupensao}, 0)), 0)::int`,
  }).from(warnings).where(and(
    eq(warnings.companyId, companyId),
    inArray(warnings.employeeId, empIds),
    gte(warnings.dataOcorrencia, dataInicio),
    isNull(warnings.deletedAt),
  )).groupBy(warnings.employeeId, warnings.tipoAdvertencia);
  const discMap = new Map<number, DisciplinaInputs>();
  empIds.forEach(id => discMap.set(id, { countAdvertenciasLeves: 0, countAdvertenciasGraves: 0, countSuspensoes: 0, diasSuspensao: 0 }));
  discRows.forEach(r => {
    const d = discMap.get(r.employeeId)!;
    const tipo = (r.tipo || '').toLowerCase();
    const c = Number(r.count) || 0;
    const ds = Number(r.diasSusp) || 0;
    if (tipo.includes('suspens')) { d.countSuspensoes += c; d.diasSuspensao += ds; }
    else if (tipo.includes('grav')) d.countAdvertenciasGraves += c;
    else d.countAdvertenciasLeves += c;
  });

  // 5) Segurança — acidentes por gravidade + DDS (presença)
  const acidSegRows = await db.select({
    employeeId: accidents.employeeId,
    gravidade: accidents.gravidade,
    count: sql<number>`count(*)::int`,
  }).from(accidents).where(and(
    eq(accidents.companyId, companyId),
    inArray(accidents.employeeId, empIds),
    gte(accidents.dataAcidente, dataInicio),
    isNull(accidents.deletedAt),
  )).groupBy(accidents.employeeId, accidents.gravidade);

  // DDS: join com dds_sessoes pra filtrar pela DATA REAL da sessão (não
  // pela data de assinatura — funcionário pode nunca ter assinado). Também
  // restringimos por companyId da sessão e ignora sessões soft-deleted.
  const ddsRows = await db.select({
    employeeId: ddsSessaoFuncionarios.employeeId,
    convocados: sql<number>`count(*)::int`,
    presentes: sql<number>`coalesce(sum(case when ${ddsSessaoFuncionarios.presente} = 1 then 1 else 0 end), 0)::int`,
  }).from(ddsSessaoFuncionarios)
    .innerJoin(ddsSessoes, eq(ddsSessaoFuncionarios.sessaoId, ddsSessoes.id))
    .where(and(
      inArray(ddsSessaoFuncionarios.employeeId, empIds),
      eq(ddsSessoes.companyId, companyId),
      gte(ddsSessoes.data, dataInicio),
      isNull(ddsSessoes.deletedAt),
    ))
    .groupBy(ddsSessaoFuncionarios.employeeId);

  const segMap = new Map<number, SegurancaInputs>();
  empIds.forEach(id => segMap.set(id, { countAcidentesLeves: 0, countAcidentesGraves: 0, countAcidentesQuase: 0, ddsConvocados: 0, ddsPresentes: 0 }));
  acidSegRows.forEach(r => {
    const s = segMap.get(r.employeeId)!;
    const g = (r.gravidade || '').toLowerCase();
    const c = Number(r.count) || 0;
    if (g.includes('quase')) s.countAcidentesQuase += c;
    else if (g.includes('grav') || g.includes('fatal') || g.includes('moder')) s.countAcidentesGraves += c;
    else s.countAcidentesLeves += c;
  });
  ddsRows.forEach(r => {
    if (r.employeeId == null) return;
    const s = segMap.get(r.employeeId);
    if (!s) return;
    s.ddsConvocados = Number(r.convocados) || 0;
    s.ddsPresentes = Number(r.presentes) || 0;
  });

  return { emps, freqMap, saudeMap, discMap, segMap };
}

function montarLinhaScore(emp: any, freqMap: Map<number, FrequenciaInputs>, saudeMap: Map<number, SaudeInputs>, discMap: Map<number, DisciplinaInputs>, segMap: Map<number, SegurancaInputs>, pesos: PesosScore) {
  const f = freqMap.get(emp.id) || { totalFaltasInjustificadas: 0, totalAtrasos: 0, totalSaidasAntecipadas: 0, totalMinutosAtraso: 0 };
  const s = saudeMap.get(emp.id) || { countAtestados: 0, diasAfastadoAtestado: 0, countAcidentes: 0, diasAfastadoAcidente: 0 };
  const d = discMap.get(emp.id) || { countAdvertenciasLeves: 0, countAdvertenciasGraves: 0, countSuspensoes: 0, diasSuspensao: 0 };
  const g = segMap.get(emp.id) || { countAcidentesLeves: 0, countAcidentesGraves: 0, countAcidentesQuase: 0, ddsConvocados: 0, ddsPresentes: 0 };
  const sub = {
    frequencia: scoreFrequencia(f),
    saude: scoreSaude(s),
    disciplina: scoreDisciplina(d),
    seguranca: scoreSeguranca(g),
  };
  const geral = scoreGeral(sub, pesos);
  return {
    employeeId: emp.id,
    nome: emp.nome,
    funcao: emp.funcao,
    dataAdmissao: emp.dataAdmissao,
    sub,
    geral,
    classificacao: classificar(geral),
    inputs: { frequencia: f, saude: s, disciplina: d, seguranca: g },
  };
}

export const avaliacaoFuncionariosRouter = router({
  getRanking: protectedProcedure
    .input(periodoInput)
    .query(async ({ input, ctx }) => {
      await ensureCompanyAccess(ctx.user, input.companyId);
      const pesos = input.pesos || PESOS_DEFAULT;
      const { emps, freqMap, saudeMap, discMap, segMap } = await carregarInputs(input.companyId, input.obraId, input.periodoMeses);
      const linhas = emps.map(e => montarLinhaScore(e, freqMap, saudeMap, discMap, segMap, pesos));
      linhas.sort((a, b) => b.geral - a.geral);
      return linhas;
    }),

  getResumo: protectedProcedure
    .input(periodoInput)
    .query(async ({ input, ctx }) => {
      await ensureCompanyAccess(ctx.user, input.companyId);
      const pesos = input.pesos || PESOS_DEFAULT;
      const { emps, freqMap, saudeMap, discMap, segMap } = await carregarInputs(input.companyId, input.obraId, input.periodoMeses);
      const linhas = emps.map(e => montarLinhaScore(e, freqMap, saudeMap, discMap, segMap, pesos));
      const n = linhas.length;
      const avg = (arr: number[]) => n > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / n) : 0;
      const dist = { Excelente: 0, Bom: 0, 'Atenção': 0, 'Crítico': 0, 'Alto Risco': 0 };
      linhas.forEach(l => { dist[l.classificacao]++; });
      return {
        total: n,
        mediaGeral: avg(linhas.map(l => l.geral)),
        mediaFrequencia: avg(linhas.map(l => l.sub.frequencia)),
        mediaSaude: avg(linhas.map(l => l.sub.saude)),
        mediaDisciplina: avg(linhas.map(l => l.sub.disciplina)),
        mediaSeguranca: avg(linhas.map(l => l.sub.seguranca)),
        distribuicao: dist,
      };
    }),

  getScoreFuncionario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      periodoMeses: z.number().min(1).max(36).default(6),
      pesos: z.object({
        frequencia: z.number(), saude: z.number(), disciplina: z.number(), seguranca: z.number(),
      }).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await ensureCompanyAccess(ctx.user, input.companyId);
      const pesos = input.pesos || PESOS_DEFAULT;
      const { emps, freqMap, saudeMap, discMap, segMap } = await carregarInputs(input.companyId, null, input.periodoMeses);
      const emp = emps.find(e => e.id === input.employeeId);
      if (!emp) return null;
      const linha = montarLinhaScore(emp, freqMap, saudeMap, discMap, segMap, pesos);
      const observacoes = gerarObservacoes(
        linha.inputs.frequencia, linha.inputs.saude,
        linha.inputs.disciplina, linha.inputs.seguranca,
      );
      return { ...linha, observacoes };
    }),
});
