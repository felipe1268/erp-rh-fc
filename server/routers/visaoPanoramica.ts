import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import {
  employees, payroll, timeRecords, extraPayments, warnings, atestados,
  epis, epiDeliveries, processosTrabalhistas, processosAndamentos,
  monthlyPayrollSummary, terminationNotices, vacationPeriods,
  goldenRules, epiDiscountAlerts,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, count, asc, isNull } from "drizzle-orm";
import { parseBRL } from "../utils/parseBRL";

// ============================================================
// VISÃO PANORÂMICA — Dashboard Executivo
// ============================================================
async function getVisaoPanoramica(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const mesAtual = now.toISOString().slice(0, 7);
  const anoAtual = now.getFullYear();

  // ── 1. QUADRO DE PESSOAL ──
  const allEmps = await db.select({
    id: employees.id,
    nome: employees.nomeCompleto,
    status: employees.status,
    setor: employees.setor,
    funcao: employees.funcao,
    dataAdmissao: employees.dataAdmissao,
    salarioBase: employees.salarioBase,
    sexo: employees.sexo,
  }).from(employees).where(and(eq(employees.companyId, companyId), sql`${employees.deletedAt} IS NULL`));

  const totalFuncionarios = allEmps.length;
  const ativos = allEmps.filter(e => e.status === "Ativo").length;
  const afastados = allEmps.filter(e => ["Afastado", "Licença", "Férias"].includes(e.status || "")).length;
  const desligados = allEmps.filter(e => e.status === "Desligado").length;

  // Admissões e demissões nos últimos 3 meses
  const tresMesesAtras = new Date(now);
  tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
  const tresMesesStr = tresMesesAtras.toISOString().slice(0, 10);
  const admissoes3m = allEmps.filter(e => e.dataAdmissao && e.dataAdmissao >= tresMesesStr).length;

  // Setores únicos
  const setoresUnicos = new Set(allEmps.map(e => e.setor).filter(Boolean));

  // Massa salarial (usa parseBRL para formato brasileiro "2.774,20")
  const massaSalarial = allEmps.filter(e => e.status === "Ativo").reduce((s, e) => s + parseBRL(e.salarioBase || '0'), 0);

  // ── 2. FOLHA DE PAGAMENTO ──
  const folhaRows = await db.select({
    mes: monthlyPayrollSummary.mesReferencia,
    totalProventos: monthlyPayrollSummary.totalProventos,
    totalDescontos: monthlyPayrollSummary.totalDescontos,
    totalLiquido: monthlyPayrollSummary.folhaLiquido,
    totalFgts: monthlyPayrollSummary.valorFgts,
    valorInss: monthlyPayrollSummary.valorInss,
  }).from(monthlyPayrollSummary)
    .where(eq(monthlyPayrollSummary.companyId, companyId))
    .orderBy(desc(monthlyPayrollSummary.mesReferencia))
    .limit(6);

  const folhaAtual = folhaRows[0];
  const folhaAnterior = folhaRows[1];
  const custoFolhaAtual = folhaAtual ? Number(folhaAtual.totalProventos) : 0;
  const custoFolhaAnterior = folhaAnterior ? Number(folhaAnterior.totalProventos) : 0;
  const liquidoAtual = folhaAtual ? Number(folhaAtual.totalLiquido) : 0;
  const fgtsAtual = folhaAtual ? Number(folhaAtual.totalFgts) : 0;
  const variacaoFolha = custoFolhaAnterior > 0 ? ((custoFolhaAtual - custoFolhaAnterior) / custoFolhaAnterior * 100) : 0;

  const evolucaoFolha = folhaRows.reverse().map(r => ({
    mes: r.mes,
    proventos: Number(r.totalProventos),
    descontos: Number(r.totalDescontos),
    liquido: Number(r.totalLiquido),
    fgts: Number(r.totalFgts),
  }));

  // ── 3. HORAS EXTRAS ──
  const heRows = await db.select({
    id: extraPayments.id,
    valor: extraPayments.valorTotal,
    horas: extraPayments.quantidadeHoras,
    mesReferencia: extraPayments.mesReferencia,
    tipoExtra: extraPayments.tipoExtra,
  }).from(extraPayments)
    .where(eq(extraPayments.companyId, companyId));

  const heMesAtual = heRows.filter(r => r.mesReferencia === mesAtual && r.tipoExtra === 'Horas_Extras');
  const totalHEValor = heMesAtual.reduce((s, r) => s + parseFloat(String(r.valor || 0)), 0);
  const totalHEHoras = heMesAtual.reduce((s, r) => s + parseFloat(String(r.horas || 0)), 0);
  const percentualHEsobreFolha = custoFolhaAtual > 0 ? (totalHEValor / custoFolhaAtual * 100) : 0;

  // ── 4. PONTO (faltas e atrasos) ──
  const pontoRows = await db.select({
    horasTrabalhadas: timeRecords.horasTrabalhadas,
    horasExtras: timeRecords.horasExtras,
    faltas: timeRecords.faltas,
    atrasos: timeRecords.atrasos,
    data: timeRecords.data,
  }).from(timeRecords)
    .where(and(
      eq(timeRecords.companyId, companyId),
      sql`${timeRecords.data} LIKE ${mesAtual + '%'}`,
    ));

  const totalFaltas = pontoRows.filter(r => r.faltas && parseFloat(String(r.faltas)) > 0).length;
  const totalAtrasos = pontoRows.filter(r => r.atrasos && parseFloat(String(r.atrasos)) > 0).length;

  // ── 5. EPIs ──
  const allEpis = await db.select({
    id: epis.id,
    quantidadeEstoque: epis.quantidadeEstoque,
    validadeCa: epis.validadeCa,
    valorProduto: epis.valorProduto,
  }).from(epis)
    .where(eq(epis.companyId, companyId));

  const estoqueBaixo = allEpis.filter(e => {
    const est = parseInt(String(e.quantidadeEstoque || 0));
    return est <= 5 && est >= 0;
  }).length;

  const caVencido = allEpis.filter(e => {
    if (!e.validadeCa) return false;
    return new Date(e.validadeCa) < now;
  }).length;

  const alertasPendentes = await db.select({ count: sql<number>`count(*)` })
    .from(epiDiscountAlerts)
    .where(and(eq(epiDiscountAlerts.companyId, companyId), eq(epiDiscountAlerts.status, 'pendente')));
  const totalAlertasEPI = Number(alertasPendentes[0]?.count || 0);

  // ── 6. JURÍDICO ──
  const processos = await db.select({
    id: processosTrabalhistas.id,
    status: processosTrabalhistas.status,
    nivelRisco: processosTrabalhistas.risco,
    valorCausa: processosTrabalhistas.valorCausa,
    valorCondenacao: processosTrabalhistas.valorCondenacao,
    valorAcordo: processosTrabalhistas.valorAcordo,
  }).from(processosTrabalhistas)
    .where(and(eq(processosTrabalhistas.companyId, companyId), sql`${processosTrabalhistas.deletedAt} IS NULL`));

  const processosAtivos = processos.filter(p => !['Encerrado', 'Arquivado'].includes(p.status || '')).length;
  const processosAltoRisco = processos.filter(p => ['Crítico', 'Alto'].includes(p.nivelRisco || '')).length;
  const valorEmRisco = processos.filter(p => !['Encerrado', 'Arquivado'].includes(p.status || ''))
    .reduce((s, p) => s + parseBRL(p.valorCausa || '0'), 0);

  // Próximas audiências
  // Audiências: join processos -> andamentos
  const audiencias = await db.select({
    data: processosAndamentos.data,
    tipo: processosAndamentos.tipo,
  }).from(processosAndamentos)
    .innerJoin(processosTrabalhistas, eq(processosAndamentos.processoId, processosTrabalhistas.id))
    .where(and(
      eq(processosTrabalhistas.companyId, companyId),
      eq(processosAndamentos.tipo, 'audiencia'),
      gte(processosAndamentos.data, now.toISOString().slice(0, 10)),
    ))
    .orderBy(asc(processosAndamentos.data))
    .limit(5);

  // ── 7. ADVERTÊNCIAS ──
  const advRows = await db.select({ count: sql<number>`count(*)` })
    .from(warnings)
    .where(and(eq(warnings.companyId, companyId), sql`${warnings.deletedAt} IS NULL`));
  const totalAdvertencias = Number(advRows[0]?.count || 0);

  // ── 8. ATESTADOS ──
  const atestadoRows = await db.select({
    count: sql<number>`count(*)`,
    totalDias: sql<number>`COALESCE(SUM(${atestados.diasAfastamento}), 0)`,
  }).from(atestados)
    .where(and(eq(atestados.companyId, companyId), sql`${atestados.deletedAt} IS NULL`));
  const totalAtestados = Number(atestadoRows[0]?.count || 0);
  const totalDiasAtestado = Number(atestadoRows[0]?.totalDias || 0);

  // ── 9. FÉRIAS ──
  const feriasRows = await db.select({
    id: vacationPeriods.id,
    status: vacationPeriods.status,
    valorTotal: vacationPeriods.valorTotal,
  }).from(vacationPeriods)
    .where(and(eq(vacationPeriods.companyId, companyId), sql`${vacationPeriods.deletedAt} IS NULL`));

  const feriasVencidas = feriasRows.filter(f => f.status === 'vencida').length;
  const feriasAgendadas = feriasRows.filter(f => f.status === 'agendada').length;
  const custoFeriasVencidas = feriasRows.filter(f => f.status === 'vencida')
    .reduce((s, f) => s + parseBRL(f.valorTotal || '0'), 0);

  // ── 10. AVISO PRÉVIO (recálculo em tempo real) ──
  const avisosRows = await db.select({
    id: terminationNotices.id,
    status: terminationNotices.status,
    valorEstimadoTotal: terminationNotices.valorEstimadoTotal,
    tipo: terminationNotices.tipo,
    dataInicio: terminationNotices.dataInicio,
    dataFim: terminationNotices.dataFim,
    empId: terminationNotices.employeeId,
    salarioBase: terminationNotices.salarioBase,
  }).from(terminationNotices)
    .where(and(eq(terminationNotices.companyId, companyId), sql`${terminationNotices.deletedAt} IS NULL`));

  // Buscar salarioBase e dataAdmissao dos funcionários para recálculo
  const empMap = new Map(allEmps.map(e => [e.id, e]));

  function recalcAvisoTotal(a: typeof avisosRows[0]): number {
    try {
      const emp = empMap.get(a.empId!);
      const sal = parseBRL(emp?.salarioBase || a.salarioBase || '0');
      const admissao = emp?.dataAdmissao || '';
      if (sal <= 0 || !admissao || !a.dataFim || !a.tipo) return parseBRL(a.valorEstimadoTotal || '0');
      const DIVISOR = 30;
      const salDia = sal / DIVISOR;
      const dtFim = new Date(a.dataFim + 'T00:00:00');
      const dtSaida = new Date(dtFim); dtSaida.setDate(dtSaida.getDate() + 1);
      const dataSaida = dtSaida.toISOString().split('T')[0];
      const dtProj = new Date(dtFim.getFullYear(), dtFim.getMonth() + 1, 0);
      const dataProj = dtProj.toISOString().split('T')[0];
      const diasTrab = dtSaida.getDate();
      // Anos de serviço
      const admD = new Date(admissao + 'T00:00:00');
      const fimD = new Date(dataSaida + 'T00:00:00');
      let anos = fimD.getFullYear() - admD.getFullYear();
      if (fimD.getMonth() < admD.getMonth() || (fimD.getMonth() === admD.getMonth() && fimD.getDate() < admD.getDate())) anos--;
      anos = Math.max(0, anos);
      const diasAvisoTotal = Math.min(30 + anos * 3, 90);
      const diasExtras = Math.min(anos * 3, 60);
      const saldoSalario = salDia * diasTrab;
      // Férias proporcionais
      const admDate = new Date(admissao + 'T00:00:00');
      const refDate = new Date(dataProj + 'T00:00:00');
      let lastAniv = new Date(refDate.getFullYear(), admDate.getMonth(), admDate.getDate());
      if (lastAniv > refDate) lastAniv.setFullYear(lastAniv.getFullYear() - 1);
      let mF = (refDate.getFullYear() - lastAniv.getFullYear()) * 12 + refDate.getMonth() - lastAniv.getMonth();
      if (refDate.getDate() < lastAniv.getDate()) mF--;
      mF = Math.min(Math.max(0, mF), 12);
      const feriasProp = (sal * mF) / 12;
      const totalFerias = feriasProp + feriasProp / 3;
      // 13º
      const anoRef = refDate.getFullYear();
      const inicioAno = new Date(anoRef, 0, 1);
      const start = admDate > inicioAno ? admDate : inicioAno;
      let m13 = 0;
      if (start <= refDate) {
        m13 = (refDate.getFullYear() - start.getFullYear()) * 12 + refDate.getMonth() - start.getMonth();
        if (refDate.getDate() >= start.getDate()) m13++;
        m13 = Math.min(Math.max(0, m13), 12);
      }
      const dec13 = (sal * m13) / 12;
      // Aviso indenizado
      let avisoInd = 0;
      if (a.tipo === 'empregador_indenizado') avisoInd = salDia * diasAvisoTotal;
      else if (a.tipo === 'empregador_trabalhado') avisoInd = salDia * diasExtras;
      // FGTS
      const mServ = Math.max(0, (refDate.getFullYear() - admDate.getFullYear()) * 12 + refDate.getMonth() - admDate.getMonth());
      const fgts = sal * 0.08 * mServ;
      const multa = a.tipo?.includes('empregador') ? fgts * 0.4 : 0;
      return saldoSalario + totalFerias + dec13 + avisoInd + multa;
    } catch { return parseBRL(a.valorEstimadoTotal || '0'); }
  }

  const avisosEmAndamento = avisosRows.filter(a => a.status === 'em_andamento').length;
  const custoAvisos = avisosRows.filter(a => a.status === 'em_andamento')
    .reduce((s, a) => s + recalcAvisoTotal(a), 0);

  // Vencendo em 7 dias
  const seteDias = new Date(now);
  seteDias.setDate(seteDias.getDate() + 7);
  const avisosVencendo = avisosRows.filter(a => {
    if (a.status !== 'em_andamento' || !a.dataFim) return false;
    return new Date(a.dataFim) <= seteDias;
  }).length;

  // ── 11. GOLDEN RULES ──
  const rules = await db.select().from(goldenRules)
    .where(eq(goldenRules.companyId, companyId))
    .orderBy(desc(goldenRules.prioridade));

  return {
    pessoal: {
      totalFuncionarios, ativos, afastados, desligados,
      admissoes3m, setores: setoresUnicos.size,
      massaSalarial: Math.round(massaSalarial * 100) / 100,
    },
    folha: {
      custoAtual: Math.round(custoFolhaAtual * 100) / 100,
      liquidoAtual: folhaAtual ? Math.round(Number(folhaAtual.totalLiquido) * 100) / 100 : 0,
      fgtsAtual: folhaAtual ? Math.round(Number(folhaAtual.totalFgts) * 100) / 100 : 0,
      variacaoPercentual: Math.round(variacaoFolha * 100) / 100,
      mesReferencia: folhaAtual?.mes || mesAtual,
      evolucao: evolucaoFolha,
    },
    horasExtras: {
      totalHoras: Math.round(totalHEHoras * 100) / 100,
      totalValor: Math.round(totalHEValor * 100) / 100,
      percentualSobreFolha: Math.round(percentualHEsobreFolha * 100) / 100,
    },
    ponto: {
      totalFaltas,
      totalAtrasos,
      totalRegistros: pontoRows.length,
    },
    epis: {
      totalItens: allEpis.length,
      estoqueBaixo,
      caVencido,
      alertasPendentes: totalAlertasEPI,
    },
    juridico: {
      totalProcessos: processos.length,
      processosAtivos,
      processosAltoRisco,
      valorEmRisco: Math.round(valorEmRisco * 100) / 100,
      proximasAudiencias: audiencias.length,
    },
    advertencias: { total: totalAdvertencias },
    atestados: { total: totalAtestados, totalDias: totalDiasAtestado },
    ferias: {
      vencidas: feriasVencidas,
      agendadas: feriasAgendadas,
      custoVencidas: Math.round(custoFeriasVencidas * 100) / 100,
    },
    avisosPrevios: {
      emAndamento: avisosEmAndamento,
      custoEstimado: Math.round(custoAvisos * 100) / 100,
      vencendo7dias: avisosVencendo,
    },
    goldenRules: rules.map(r => ({ titulo: r.titulo, descricao: r.descricao, categoria: r.categoria, prioridade: r.prioridade })),
  };
}

// ============================================================
// ANÁLISE IA — Insights Estratégicos
// ============================================================
async function getAnaliseIA(companyId: number, companyName: string, data: any) {
  const rulesText = data.goldenRules?.length > 0
    ? data.goldenRules.map((r: any) => `[${r.prioridade?.toUpperCase()}] ${r.titulo}: ${r.descricao}`).join("\n")
    : "Nenhuma regra de ouro cadastrada.";

  const prompt = `Você é um consultor estratégico de RH e gestão empresarial. Analise os dados abaixo da empresa "${companyName}" e forneça insights estratégicos em português brasileiro.

DADOS DA EMPRESA:
- Quadro: ${data.pessoal.totalFuncionarios} funcionários (${data.pessoal.ativos} ativos, ${data.pessoal.afastados} afastados, ${data.pessoal.desligados} desligados)
- Admissões últimos 3 meses: ${data.pessoal.admissoes3m}
- Setores: ${data.pessoal.setores}
- Massa salarial: R$ ${data.pessoal.massaSalarial.toLocaleString('pt-BR')}
- Folha bruta mês: R$ ${data.folha.custoAtual.toLocaleString('pt-BR')} (variação: ${data.folha.variacaoPercentual > 0 ? '+' : ''}${data.folha.variacaoPercentual}%)
- Horas extras mês: ${data.horasExtras.totalHoras}h = R$ ${data.horasExtras.totalValor.toLocaleString('pt-BR')} (${data.horasExtras.percentualSobreFolha}% da folha)
- Ponto: ${data.ponto.totalFaltas} faltas, ${data.ponto.totalAtrasos} atrasos no mês
- EPIs: ${data.epis.estoqueBaixo} itens estoque baixo, ${data.epis.caVencido} CAs vencidos, ${data.epis.alertasPendentes} alertas pendentes
- Jurídico: ${data.juridico.totalProcessos} processos (${data.juridico.processosAtivos} ativos, ${data.juridico.processosAltoRisco} alto risco), R$ ${data.juridico.valorEmRisco.toLocaleString('pt-BR')} em risco
- Advertências: ${data.advertencias.total} total
- Atestados: ${data.atestados.total} total (${data.atestados.totalDias} dias)
- Férias vencidas: ${data.ferias.vencidas} (custo: R$ ${data.ferias.custoVencidas.toLocaleString('pt-BR')})
- Avisos prévios em andamento: ${data.avisosPrevios.emAndamento} (custo: R$ ${data.avisosPrevios.custoEstimado.toLocaleString('pt-BR')})

REGRAS DE OURO DA EMPRESA:
${rulesText}

Responda EXATAMENTE no formato JSON abaixo (sem markdown, sem backticks):
{
  "resumoExecutivo": "Parágrafo de 2-3 frases resumindo a situação geral da empresa",
  "saudeGeral": "verde|amarelo|vermelho",
  "pontuacao": 0-100,
  "pontosFortes": [
    {"titulo": "...", "descricao": "...", "impacto": "alto|medio|baixo"}
  ],
  "pontosFracos": [
    {"titulo": "...", "descricao": "...", "impacto": "alto|medio|baixo", "recomendacao": "..."}
  ],
  "riscos": [
    {"titulo": "...", "descricao": "...", "severidade": "critico|alto|medio|baixo", "acaoImediata": "..."}
  ],
  "oportunidades": [
    {"titulo": "...", "descricao": "...", "potencial": "alto|medio|baixo"}
  ],
  "kpisAlerta": [
    {"indicador": "...", "valor": "...", "status": "critico|atencao|ok", "meta": "..."}
  ],
  "planosAcao": [
    {"acao": "...", "prazo": "imediato|curto|medio|longo", "responsavel": "RH|Jurídico|SST|Financeiro|Diretoria", "prioridade": "alta|media|baixa"}
  ]
}

Forneça pelo menos 3 itens em cada categoria. Seja específico, use os números reais dos dados. Considere as Regras de Ouro da empresa na análise.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um consultor estratégico de gestão empresarial especializado em RH, SST e jurídico trabalhista brasileiro. Responda sempre em JSON válido." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "analise_estrategica",
          strict: true,
          schema: {
            type: "object",
            properties: {
              resumoExecutivo: { type: "string" },
              saudeGeral: { type: "string", enum: ["verde", "amarelo", "vermelho"] },
              pontuacao: { type: "integer" },
              pontosFortes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    titulo: { type: "string" },
                    descricao: { type: "string" },
                    impacto: { type: "string", enum: ["alto", "medio", "baixo"] },
                  },
                  required: ["titulo", "descricao", "impacto"],
                  additionalProperties: false,
                },
              },
              pontosFracos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    titulo: { type: "string" },
                    descricao: { type: "string" },
                    impacto: { type: "string", enum: ["alto", "medio", "baixo"] },
                    recomendacao: { type: "string" },
                  },
                  required: ["titulo", "descricao", "impacto", "recomendacao"],
                  additionalProperties: false,
                },
              },
              riscos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    titulo: { type: "string" },
                    descricao: { type: "string" },
                    severidade: { type: "string", enum: ["critico", "alto", "medio", "baixo"] },
                    acaoImediata: { type: "string" },
                  },
                  required: ["titulo", "descricao", "severidade", "acaoImediata"],
                  additionalProperties: false,
                },
              },
              oportunidades: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    titulo: { type: "string" },
                    descricao: { type: "string" },
                    potencial: { type: "string", enum: ["alto", "medio", "baixo"] },
                  },
                  required: ["titulo", "descricao", "potencial"],
                  additionalProperties: false,
                },
              },
              kpisAlerta: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    indicador: { type: "string" },
                    valor: { type: "string" },
                    status: { type: "string", enum: ["critico", "atencao", "ok"] },
                    meta: { type: "string" },
                  },
                  required: ["indicador", "valor", "status", "meta"],
                  additionalProperties: false,
                },
              },
              planosAcao: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    acao: { type: "string" },
                    prazo: { type: "string", enum: ["imediato", "curto", "medio", "longo"] },
                    responsavel: { type: "string" },
                    prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
                  },
                  required: ["acao", "prazo", "responsavel", "prioridade"],
                  additionalProperties: false,
                },
              },
            },
            required: ["resumoExecutivo", "saudeGeral", "pontuacao", "pontosFortes", "pontosFracos", "riscos", "oportunidades", "kpisAlerta", "planosAcao"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      return JSON.parse(content);
    }
    return null;
  } catch (err) {
    console.error("[VisaoPanoramica] AI analysis error:", err);
    return null;
  }
}

// ============================================================
// ROUTER
// ============================================================
export const visaoPanoramicaRouter = router({
  getData: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return getVisaoPanoramica(input.companyId);
    }),

  analiseIA: protectedProcedure
    .input(z.object({ companyId: z.number(), companyName: z.string() }))
    .mutation(async ({ input }) => {
      const data = await getVisaoPanoramica(input.companyId);
      if (!data) return null;
      return getAnaliseIA(input.companyId, input.companyName, data);
    }),
});
