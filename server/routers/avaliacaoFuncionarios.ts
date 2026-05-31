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
  employees, pontoDescontosResumo, atestados, accidents, warnings, ddsSessaoFuncionarios, ddsSessoes, trainings,
} from "../../drizzle/schema";
import { and, eq, gte, isNull, sql, inArray } from "drizzle-orm";
import {
  scoreFrequencia, scoreSaude, scoreDisciplina, scoreSeguranca, scoreCapacitacao, scoreLealdade, scoreGeral,
  classificar, gerarObservacoes, PESOS_DEFAULT,
  type FrequenciaInputs, type SaudeInputs, type DisciplinaInputs, type SegurancaInputs,
  type CapacitacaoInputs, type LealdadeInputs,
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
    capacitacao: z.number().min(0).max(1),
    lealdade: z.number().min(0).max(1),
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
 * Rev. 2624 — Calcula a situação do contrato de experiência de um colaborador
 * (MESMA régua do home.getData / employees.analiseExperiencia): em experiência
 * = `experienciaTipo` setado E status != efetivado/desligado_experiencia.
 * Devolve `null` quando o colaborador NÃO está em experiência.
 * SOMENTE CÁLCULO EM MEMÓRIA — zero SQL (R-001/R-007/R-010).
 */
function calcularExperiencia(emp: any): {
  status: string;
  tipo: string;
  inicio: string;
  fim1: string;
  fim2: string;
  diasRestantes: number;
  diasDecorridos: number;
  urgencia: 'normal' | 'atencao' | 'urgente' | 'vencido';
  prorrogadoEm: string | null;
} | null {
  const tipo: string | null = emp.experienciaTipo || null;
  const status: string = emp.experienciaStatus || 'em_experiencia';
  if (!tipo || status === 'efetivado' || status === 'desligado_experiencia') return null;
  const inicioRaw = emp.experienciaInicio || emp.dataAdmissao;
  if (!inicioRaw) return null;
  const inicio = String(inicioRaw).split('T')[0];

  const dias1 = tipo === '30_30' ? 30 : 45;
  const dias2 = tipo === '30_30' ? 60 : 90;
  const dtInicio = new Date(inicio + 'T12:00:00');
  if (isNaN(dtInicio.getTime())) return null;
  // CLT: dia do início conta como dia 1.
  const dtFim1 = new Date(dtInicio); dtFim1.setDate(dtFim1.getDate() + dias1 - 1);
  const dtFim2 = new Date(dtInicio); dtFim2.setDate(dtFim2.getDate() + dias2 - 1);
  const fim1 = dtFim1.toISOString().split('T')[0];
  const fim2 = dtFim2.toISOString().split('T')[0];

  const isProrrogado = status === 'prorrogado';
  // Rev. 2624 — MESMA referência de "hoje" do home.getData (hora corrente, sem
  // normalizar p/ meio-dia) p/ que diasRestantes/urgência e a ordenação batam
  // EXATAMENTE com a lista de experiências do Home (fonte de verdade).
  const hoje = new Date();
  const fimRelevante = isProrrogado ? dtFim2 : dtFim1;
  const diasRestantes = Math.ceil((fimRelevante.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  const diasDecorridos = Math.max(0, Math.ceil((hoje.getTime() - dtInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  let urgencia: 'normal' | 'atencao' | 'urgente' | 'vencido' = 'normal';
  if (diasRestantes < 0) urgencia = 'vencido';
  else if (diasRestantes <= 7) urgencia = 'urgente';
  else if (diasRestantes <= 30) urgencia = 'atencao';

  return {
    status, tipo, inicio, fim1, fim2, diasRestantes, diasDecorridos, urgencia,
    prorrogadoEm: emp.experienciaProrrogadoEm ? String(emp.experienciaProrrogadoEm).split('T')[0] : null,
  };
}

/**
 * Carrega TODOS os inputs (4 categorias) para TODOS os employees ativos
 * de uma companyId em UMA passada de SQL por categoria.
 */
async function carregarInputs(companyId: number, obraId: number | null | undefined, periodoMeses: number) {
  // Rev. 2410 — `getDb()` é async (lazy init do pool Neon). Sem await,
  // `db` virava Promise e quebrava com "db.select is not a function" na
  // tela Avaliação Inteligente (página totalmente vazia).
  const db = await getDb();
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
    fotoUrl: employees.fotoUrl,
    // Rev. 2624 — campos do contrato de experiência p/ destacar e analisar
    // tecnicamente os colaboradores em período de experiência (mesma régua do
    // home.getData: experienciaTipo setado + status != efetivado/desligado).
    experienciaTipo: employees.experienciaTipo,
    experienciaStatus: employees.experienciaStatus,
    experienciaInicio: employees.experienciaInicio,
    experienciaProrrogadoEm: employees.experienciaProrrogadoEm,
  }).from(employees).where(and(...empConds));

  if (emps.length === 0) return { emps: [], freqMap: new Map(), saudeMap: new Map(), discMap: new Map(), segMap: new Map(), capMap: new Map(), lealMap: new Map() };

  const empIds = emps.map(e => e.id);
  const hoje = new Date().toISOString().slice(0, 10);

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

  // 6) Capacitação — trainings (válidos / vencidos / recentes)
  // Rev. 2505 — Snapshot agregado por funcionário em UMA SQL via CASE WHEN.
  // Considera-se "válido" quem tem dataValidade NULL (vitalício) OU >= hoje.
  // "Vencido" = dataValidade < hoje. "Recente" = dataRealizacao dentro do período.
  const treinoRows = await db.select({
    employeeId: trainings.employeeId,
    validos: sql<number>`sum(case when ${trainings.dataValidade} is null or ${trainings.dataValidade} >= ${hoje} then 1 else 0 end)::int`,
    vencidos: sql<number>`sum(case when ${trainings.dataValidade} is not null and ${trainings.dataValidade} < ${hoje} then 1 else 0 end)::int`,
    recentes: sql<number>`sum(case when ${trainings.dataRealizacao} >= ${dataInicio} then 1 else 0 end)::int`,
  }).from(trainings).where(and(
    eq(trainings.companyId, companyId),
    inArray(trainings.employeeId, empIds),
    isNull(trainings.deletedAt),
  )).groupBy(trainings.employeeId);
  const capMap = new Map<number, CapacitacaoInputs>();
  empIds.forEach(id => capMap.set(id, { countTreinamentosValidos: 0, countTreinamentosVencidos: 0, countTreinamentosRecentes: 0 }));
  treinoRows.forEach(r => {
    capMap.set(r.employeeId, {
      countTreinamentosValidos: Number(r.validos) || 0,
      countTreinamentosVencidos: Number(r.vencidos) || 0,
      countTreinamentosRecentes: Number(r.recentes) || 0,
    });
  });

  // 7) Lealdade — mesesDeCasa derivado de employees.dataAdmissao (já carregada).
  // Sem query extra: pura aritmética de data. dataAdmissao ausente → 0 (piso 60).
  const lealMap = new Map<number, LealdadeInputs>();
  const agora = new Date();
  emps.forEach(e => {
    let meses = 0;
    if (e.dataAdmissao) {
      const adm = new Date(e.dataAdmissao);
      if (!isNaN(adm.getTime())) {
        meses = (agora.getFullYear() - adm.getFullYear()) * 12 + (agora.getMonth() - adm.getMonth());
        if (agora.getDate() < adm.getDate()) meses -= 1;
        if (meses < 0) meses = 0;
      }
    }
    lealMap.set(e.id, { mesesDeCasa: meses });
  });

  return { emps, freqMap, saudeMap, discMap, segMap, capMap, lealMap };
}

function montarLinhaScore(
  emp: any,
  freqMap: Map<number, FrequenciaInputs>,
  saudeMap: Map<number, SaudeInputs>,
  discMap: Map<number, DisciplinaInputs>,
  segMap: Map<number, SegurancaInputs>,
  capMap: Map<number, CapacitacaoInputs>,
  lealMap: Map<number, LealdadeInputs>,
  pesos: PesosScore,
) {
  const f = freqMap.get(emp.id) || { totalFaltasInjustificadas: 0, totalAtrasos: 0, totalSaidasAntecipadas: 0, totalMinutosAtraso: 0 };
  const s = saudeMap.get(emp.id) || { countAtestados: 0, diasAfastadoAtestado: 0, countAcidentes: 0, diasAfastadoAcidente: 0 };
  const d = discMap.get(emp.id) || { countAdvertenciasLeves: 0, countAdvertenciasGraves: 0, countSuspensoes: 0, diasSuspensao: 0 };
  const g = segMap.get(emp.id) || { countAcidentesLeves: 0, countAcidentesGraves: 0, countAcidentesQuase: 0, ddsConvocados: 0, ddsPresentes: 0 };
  const c = capMap.get(emp.id) || { countTreinamentosValidos: 0, countTreinamentosVencidos: 0, countTreinamentosRecentes: 0 };
  const l = lealMap.get(emp.id) || { mesesDeCasa: 0 };
  const sub = {
    frequencia: scoreFrequencia(f),
    saude: scoreSaude(s),
    disciplina: scoreDisciplina(d),
    seguranca: scoreSeguranca(g),
    capacitacao: scoreCapacitacao(c),
    lealdade: scoreLealdade(l),
  };
  const geral = scoreGeral(sub, pesos);
  const experiencia = calcularExperiencia(emp); // Rev. 2624 — null quando NÃO em experiência
  return {
    employeeId: emp.id,
    nome: emp.nome,
    funcao: emp.funcao,
    dataAdmissao: emp.dataAdmissao,
    fotoUrl: (emp as any).fotoUrl ?? null,
    sub,
    geral,
    classificacao: classificar(geral),
    emExperiencia: experiencia != null, // Rev. 2624
    experiencia, // Rev. 2624 — situação do contrato (ou null)
    inputs: { frequencia: f, saude: s, disciplina: d, seguranca: g, capacitacao: c, lealdade: l },
  };
}

export const avaliacaoFuncionariosRouter = router({
  getRanking: protectedProcedure
    .input(periodoInput)
    .query(async ({ input, ctx }) => {
      await ensureCompanyAccess(ctx.user, input.companyId);
      const pesos = input.pesos || PESOS_DEFAULT;
      const { emps, freqMap, saudeMap, discMap, segMap, capMap, lealMap } = await carregarInputs(input.companyId, input.obraId, input.periodoMeses);
      const linhas = emps.map(e => montarLinhaScore(e, freqMap, saudeMap, discMap, segMap, capMap, lealMap, pesos));
      linhas.sort((a, b) => b.geral - a.geral);
      return linhas;
    }),

  getResumo: protectedProcedure
    .input(periodoInput)
    .query(async ({ input, ctx }) => {
      await ensureCompanyAccess(ctx.user, input.companyId);
      const pesos = input.pesos || PESOS_DEFAULT;
      const { emps, freqMap, saudeMap, discMap, segMap, capMap, lealMap } = await carregarInputs(input.companyId, input.obraId, input.periodoMeses);
      const linhas = emps.map(e => montarLinhaScore(e, freqMap, saudeMap, discMap, segMap, capMap, lealMap, pesos));
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
        mediaCapacitacao: avg(linhas.map(l => l.sub.capacitacao)),
        mediaLealdade: avg(linhas.map(l => l.sub.lealdade)),
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
        capacitacao: z.number(), lealdade: z.number(),
      }).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await ensureCompanyAccess(ctx.user, input.companyId);
      const pesos = input.pesos || PESOS_DEFAULT;
      const { emps, freqMap, saudeMap, discMap, segMap, capMap, lealMap } = await carregarInputs(input.companyId, null, input.periodoMeses);
      const emp = emps.find(e => e.id === input.employeeId);
      if (!emp) return null;
      const linha = montarLinhaScore(emp, freqMap, saudeMap, discMap, segMap, capMap, lealMap, pesos);
      const observacoes = gerarObservacoes(
        linha.inputs.frequencia, linha.inputs.saude,
        linha.inputs.disciplina, linha.inputs.seguranca,
        linha.inputs.capacitacao, linha.inputs.lealdade,
      );
      return { ...linha, observacoes };
    }),
});
