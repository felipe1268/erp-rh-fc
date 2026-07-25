import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { assertAiModuleEnabled } from "../_core/aiConfig";
import { oraculoSessions, oraculoMessages } from "../../drizzle/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";
import { stripForTTS } from "../../shared/ttsTextClean";

// ============================================================
// CACHE de contexto — evita N queries por mensagem
// ============================================================
const ctxCache = new Map<string, { data: string; ts: number }>();
const CTX_TTL_MS = 2 * 60 * 1000; // 2 minutos (snapshot mais detalhado, refresh mais frequente)

// Limites por lista — evita estourar context window do LLM mesmo em empresas grandes.
const MAX_EMPLOYEES = 3000;
const MAX_OBRAS = 500;
const MAX_PJ = 1000;
const MAX_VEHICLES = 800;
const MAX_PROCESSOS = 300;
const MAX_TERCEIRIZADOS = 500;
const MAX_FORNECEDORES = 500;
// Hard cap de bytes do snapshot serializado (~600KB ≈ 150K tokens) — Claude Sonnet aceita 200K.
const MAX_SNAPSHOT_BYTES = 600_000;

// Helper: extrai linhas de qualquer formato de retorno do Neon/Drizzle execute
function rowsOf(res: any): any[] {
  return (res?.rows ?? res ?? []) as any[];
}

// ============================================================
// CONTEXT BUILDER — snapshot COMPLETO de dados de todos os módulos
// O Oráculo é assistente do ADM Master e tem acesso irrestrito.
// ============================================================
async function buildContext(companyId: number, companyIds?: number[]): Promise<string> {
  const db = await getDb();
  if (!db) return "{}";

  const ids = companyIds && companyIds.length > 0 ? companyIds : (companyId ? [companyId] : []);
  if (ids.length === 0) return "{}";

  // Verificar cache
  const cacheKey = ids.sort().join(",");
  const cached = ctxCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CTX_TTL_MS) {
    console.log("[ORÁCULO] buildContext cache hit —", cacheKey);
    return cached.data;
  }

  const now = new Date();
  const mesAtual = now.toISOString().slice(0, 7);
  const trintaDias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log("[ORÁCULO] buildContext rodando para empresas:", ids);

  const queries = await Promise.allSettled([
    // 0 — Empresas (com nome fantasia, razão social, cnpj)
    db.execute(sql`
      SELECT id, "nomeFantasia", "razaoSocial" as razao_social, cnpj, cidade, estado
      FROM companies
      WHERE id IN ${ids} AND "deletedAt" IS NULL
      ORDER BY id
    `),
    // 1 — Colaboradores (status agregado)
    db.execute(sql`
      SELECT status, COUNT(*)::int as total
      FROM employees
      WHERE "companyId" IN ${ids} AND "deletedAt" IS NULL
      GROUP BY status
    `),
    // 2 — Colaboradores DETALHADOS (lista completa com vínculos a obras)
    // PII sensível (CPF, salário, email, celular) deliberadamente OMITIDA do snapshot
    // enviado ao LLM externo — pode ser consultada pontualmente via ERP.
    db.execute(sql`
      SELECT
        e.id, e."companyId", e.matricula, e."nomeCompleto", e.cargo, e.funcao, e.setor,
        e.status, e."tipoContrato", e."dataAdmissao", e."dataDemissao",
        e.cidade, e.estado,
        COALESCE(
          (SELECT string_agg(DISTINCT o.nome, ' | ' ORDER BY o.nome)
           FROM obra_funcionarios ofa
           JOIN obras o ON o.id = ofa."obraId"
           WHERE ofa."employeeId" = e.id AND ofa."isActive" = 1
             AND o."deletedAt" IS NULL),
          ''
        ) as obras_vinculadas
      FROM employees e
      WHERE e."companyId" IN ${ids} AND e."deletedAt" IS NULL
      ORDER BY e."nomeCompleto"
      LIMIT ${MAX_EMPLOYEES}
    `),
    // 3 — Obras (agregado de status)
    db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(CASE WHEN status ILIKE 'em%andamento' THEN 1 END)::int as em_andamento,
        COUNT(CASE WHEN status ILIKE 'conclu%' THEN 1 END)::int as concluidas,
        COUNT(CASE WHEN status ILIKE 'paralis%' THEN 1 END)::int as paralisadas
      FROM obras
      WHERE "companyId" IN ${ids} AND "deletedAt" IS NULL
    `),
    // 4 — Obras DETALHADAS (lista com responsáveis e efetivo)
    db.execute(sql`
      SELECT
        o.id, o."companyId", o.nome, o.codigo, o.cliente, o.responsavel, o.responsavel_id,
        o.status, o.cidade, o.estado, o."dataInicio", o."dataPrevisaoFim", o."dataFimReal",
        o."valorContrato", o.tipo_contrato as "tipoContrato", o.gerenciadora_nome,
        (SELECT COUNT(*)::int FROM obra_funcionarios ofx
          WHERE ofx."obraId" = o.id AND ofx."isActive" = 1) as efetivo_ativo,
        (SELECT e."nomeCompleto" FROM employees e WHERE e.id = o.responsavel_id) as responsavel_funcionario
      FROM obras o
      WHERE o."companyId" IN ${ids} AND o."deletedAt" IS NULL
      ORDER BY o.status, o.nome
      LIMIT ${MAX_OBRAS}
    `),
    // 5 — Processos jurídicos (contagem)
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM processos_trabalhistas WHERE "companyId" IN ${ids} AND "deletedAt" IS NULL) as trabalhistas,
        (SELECT COUNT(*)::int FROM processos_tributarios WHERE company_id IN ${ids}) as tributarios,
        (SELECT COUNT(*)::int FROM processos_civeis WHERE "companyId" IN ${ids}) as civis
    `),
    // 6 — Processos trabalhistas DETALHADOS
    db.execute(sql`
      SELECT
        id, "numeroProcesso", reclamante, status, fase, risco, tribunal, comarca,
        "valorCausa", "dataDistribuicao", "dataAudiencia", reclamados
      FROM processos_trabalhistas
      WHERE "companyId" IN ${ids} AND "deletedAt" IS NULL
      ORDER BY "dataDistribuicao" DESC NULLS LAST
      LIMIT ${MAX_PROCESSOS}
    `),
    // 7 — Advertências (30 dias)
    db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM warnings
      WHERE "companyId" IN ${ids} AND "deletedAt" IS NULL AND "createdAt"::date >= ${trintaDias}
    `),
    // 8 — Atestados (30 dias)
    db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM atestados
      WHERE "companyId" IN ${ids} AND "deletedAt" IS NULL AND "dataEmissao" >= ${trintaDias}
    `),
    // 9 — Folha do mês
    db.execute(sql`
      SELECT
        SUM(CASE WHEN "tipoLancamento" ILIKE '%pj%' THEN REPLACE(REPLACE("totalLiquido",'.',''),',','.')::numeric ELSE 0 END) as custo_pj,
        SUM(CASE WHEN "tipoLancamento" NOT ILIKE '%pj%' THEN REPLACE(REPLACE("totalLiquido",'.',''),',','.')::numeric ELSE 0 END) as custo_clt,
        SUM(REPLACE(REPLACE("totalLiquido",'.',''),',','.')::numeric) as custo_total,
        "mesReferencia" as competencia
      FROM folha_lancamentos
      WHERE "companyId" IN ${ids} AND "mesReferencia" = (
        SELECT MAX("mesReferencia") FROM folha_lancamentos
        WHERE "companyId" IN ${ids} AND "mesReferencia" <= ${mesAtual}
      )
      GROUP BY "mesReferencia"
    `),
    // 10 — Frota (agregado)
    db.execute(sql`
      SELECT COUNT(*)::int as total_veiculos,
        COUNT(CASE WHEN "statusVeiculo" ILIKE 'ativo%' THEN 1 END)::int as ativos
      FROM vehicles
      WHERE "companyId" IN ${ids}
    `),
    // 11 — Frota DETALHADA
    db.execute(sql`
      SELECT v.id, v."companyId", v.placa, v.modelo, v.marca, v."tipoVeiculo",
        v."statusVeiculo", v.km_atual, v.responsavel, v.motorista_padrao,
        (SELECT o.nome FROM obras o WHERE o.id = v.obra_id) as obra_alocada
      FROM vehicles v
      WHERE v."companyId" IN ${ids}
      ORDER BY v.placa
      LIMIT ${MAX_VEHICLES}
    `),
    // 12 — EPI alertas pendentes
    db.execute(sql`
      SELECT COUNT(*)::int as pendentes
      FROM epi_discount_alerts
      WHERE "companyId" IN ${ids} AND status = 'pendente'
    `),
    // 13 — Contratos PJ DETALHADOS
    db.execute(sql`
      SELECT pj.id, pj."companyId", pj."numeroContrato", pj."razaoSocialPrestador",
        pj."cnpjPrestador", pj."objetoContrato", pj.status, pj."dataInicio", pj."dataFim",
        pj."valorMensal", pj.valor_total_contrato, pj.valor_medido,
        e."nomeCompleto" as funcionario_nome, e.id as employee_id,
        (SELECT o.nome FROM obras o WHERE o.id = pj.obra_id) as obra_vinculada
      FROM pj_contracts pj
      LEFT JOIN employees e ON e.id = pj."employeeId"
      WHERE pj."companyId" IN ${ids} AND pj."deletedAt" IS NULL
      ORDER BY pj.status, e."nomeCompleto"
      LIMIT ${MAX_PJ}
    `),
    // 14 — Setores
    db.execute(sql`
      SELECT id, nome, "companyId" FROM sectors
      WHERE "companyId" IN ${ids}
      ORDER BY nome
    `),
    // 15 — Funções/Cargos catalogados
    db.execute(sql`
      SELECT id, nome, "companyId" FROM job_functions
      WHERE "companyId" IN ${ids}
      ORDER BY nome
    `),
    // 16 — Empresas terceirizadas
    db.execute(sql`
      SELECT id, "companyId", razao_social, nome_fantasia, cnpj, status,
        responsavel_nome, tipo_servico
      FROM empresas_terceiras
      WHERE "companyId" IN ${ids} AND deleted_at IS NULL
      ORDER BY razao_social
      LIMIT ${MAX_TERCEIRIZADOS}
    `),
    // 17 — Funcionários terceirizados (CPF omitido — PII)
    db.execute(sql`
      SELECT id, "companyId", nome, funcao, status, "empresaTerceiraId",
        obra_nome, "statusAptidao" as status_aptidao
      FROM funcionarios_terceiros
      WHERE "companyId" IN ${ids} AND deleted_at IS NULL
      ORDER BY nome
      LIMIT ${MAX_TERCEIRIZADOS}
    `),
    // 18 — Fornecedores
    db.execute(sql`
      SELECT id, company_id, razao_social, nome_fantasia, cnpj,
        atividade_principal, ativo
      FROM fornecedores
      WHERE company_id IN ${ids}
      ORDER BY razao_social
      LIMIT ${MAX_FORNECEDORES}
    `),
    // 19 — Clientes
    db.execute(sql`
      SELECT id, company_id, razao_social, nome_fantasia, cnpj, cidade, estado, ativo
      FROM clientes
      WHERE company_id IN ${ids}
      ORDER BY razao_social
      LIMIT 500
    `),
    // 20 — Férias programadas / em andamento
    db.execute(sql`
      SELECT vp.id, vp."employeeId", e."nomeCompleto" as nome,
        vp."dataInicio", vp."dataFim", vp.status, vp."diasGozo"
      FROM vacation_periods vp
      LEFT JOIN employees e ON e.id = vp."employeeId"
      WHERE vp."companyId" IN ${ids}
        AND vp."deletedAt" IS NULL
        AND vp.status NOT IN ('cancelada','concluida')
      ORDER BY vp."dataInicio" NULLS LAST
      LIMIT 500
    `),
    // 21 — FINANCEIRO: Contas a Pagar (agregado por urgência)
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('a_pagar','pendente') AND data_vencimento < CURRENT_DATE)::int as vencidas_qtd,
        COALESCE(SUM(valor_previsto) FILTER (WHERE status IN ('a_pagar','pendente') AND data_vencimento < CURRENT_DATE), 0)::numeric as vencidas_valor,
        COUNT(*) FILTER (WHERE status IN ('a_pagar','pendente') AND data_vencimento >= CURRENT_DATE AND data_vencimento <= CURRENT_DATE + INTERVAL '7 days')::int as prox_7d_qtd,
        COALESCE(SUM(valor_previsto) FILTER (WHERE status IN ('a_pagar','pendente') AND data_vencimento >= CURRENT_DATE AND data_vencimento <= CURRENT_DATE + INTERVAL '7 days'), 0)::numeric as prox_7d_valor,
        COUNT(*) FILTER (WHERE status IN ('a_pagar','pendente') AND data_vencimento > CURRENT_DATE + INTERVAL '7 days' AND data_vencimento <= CURRENT_DATE + INTERVAL '30 days')::int as prox_30d_qtd,
        COALESCE(SUM(valor_previsto) FILTER (WHERE status IN ('a_pagar','pendente') AND data_vencimento > CURRENT_DATE + INTERVAL '7 days' AND data_vencimento <= CURRENT_DATE + INTERVAL '30 days'), 0)::numeric as prox_30d_valor,
        COALESCE(SUM(valor_realizado) FILTER (WHERE status = 'pago' AND to_char(data_pagamento, 'YYYY-MM') = ${mesAtual}), 0)::numeric as pago_mes_atual
      FROM financial_entries
      WHERE company_id IN ${ids} AND tipo = 'despesa'
    `),
    // 22 — FINANCEIRO: Contas a Pagar VENCIDAS (top 30 por valor)
    db.execute(sql`
      SELECT id, company_id, descricao, fornecedor_nome, obra_nome,
        valor_previsto, data_vencimento, forma_pagamento, origem_modulo
      FROM financial_entries
      WHERE company_id IN ${ids} AND tipo = 'despesa'
        AND status IN ('a_pagar','pendente') AND data_vencimento < CURRENT_DATE
      ORDER BY valor_previsto DESC NULLS LAST
      LIMIT 30
    `),
    // 23 — FINANCEIRO: Contas a Receber / medições (agregado)
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'a_faturar')::int as a_faturar_qtd,
        COALESCE(SUM(COALESCE(valor_liquido_receber, valor_medicao)) FILTER (WHERE status = 'a_faturar'), 0)::numeric as a_faturar_valor,
        COUNT(*) FILTER (WHERE status = 'a_receber')::int as a_receber_qtd,
        COALESCE(SUM(COALESCE(valor_liquido_receber, valor_medicao)) FILTER (WHERE status = 'a_receber'), 0)::numeric as a_receber_valor,
        COALESCE(SUM(valor_recebido) FILTER (WHERE status = 'recebido_total' AND to_char(data_recebimento, 'YYYY-MM') = ${mesAtual}), 0)::numeric as recebido_mes_atual
      FROM financial_revenue
      WHERE company_id IN ${ids}
    `),
    // 24 — COMPRAS: OCs em aberto (agregado)
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pendente','aprovada','parcial'))::int as abertas_qtd,
        COALESCE(SUM(total) FILTER (WHERE status IN ('pendente','aprovada','parcial')), 0)::numeric as abertas_valor,
        COUNT(*) FILTER (WHERE aprovacao_status = 'pendente' AND status NOT IN ('cancelada'))::int as aguardando_aprovacao_qtd,
        COUNT(*) FILTER (WHERE status IN ('pendente','aprovada') AND data_entrega_prevista IS NOT NULL AND data_entrega_prevista < CURRENT_DATE)::int as entrega_atrasada_qtd,
        COALESCE(SUM(total) FILTER (WHERE to_char(created_at, 'YYYY-MM') = ${mesAtual} AND status NOT IN ('cancelada','rascunho')), 0)::numeric as comprado_mes_atual
      FROM compras_ordens
      WHERE company_id IN ${ids}
    `),
    // 25 — ALMOXARIFADO: estoque crítico (abaixo do mínimo)
    db.execute(sql`
      SELECT
        COUNT(*)::int as itens_ativos,
        COUNT(*) FILTER (WHERE quantidade_minima > 0 AND quantidade_atual < quantidade_minima)::int as abaixo_minimo_qtd,
        COALESCE(SUM(quantidade_atual * COALESCE(valor_unitario, 0)), 0)::numeric as valor_estoque_total
      FROM almoxarifado_itens
      WHERE company_id IN ${ids} AND ativo = true
    `),
    // 26 — PLANEJAMENTO: projetos com cronograma
    db.execute(sql`
      SELECT id, company_id, nome, cliente, status, valor_contrato,
        data_inicio, data_termino_contratual
      FROM planejamento_projetos
      WHERE company_id IN ${ids}
      ORDER BY status, nome
      LIMIT 100
    `),
  ]);

  // Diagnóstico: logar e EXPOR no snapshot qualquer query que tenha falhado.
  // O LLM precisa saber que dados podem estar incompletos (evita falso negativo).
  const queryNames = [
    "companies", "employees_status", "employees_detail", "obras_count", "obras_detail",
    "processos_count", "processos_trab_detail", "warnings_30d", "atestados_30d",
    "folha_mes", "frota_count", "frota_detail", "epi_alertas",
    "pj_contracts", "sectors", "job_functions", "terceirizadas", "func_terceiros",
    "fornecedores", "clientes", "ferias",
    "financeiro_pagar", "contas_vencidas_top", "financeiro_receber",
    "compras_ocs", "almoxarifado", "planejamento",
  ];
  const queryErrors: { secao: string; erro: string }[] = [];
  queries.forEach((r, i) => {
    if (r.status === "rejected") {
      const msg = (r.reason as any)?.message ?? String(r.reason);
      console.error(`[ORÁCULO] Query "${queryNames[i]}" FALHOU:`, msg);
      queryErrors.push({ secao: queryNames[i], erro: msg });
    }
  });
  const get = (i: number) => queries[i].status === "fulfilled" ? rowsOf((queries[i] as any).value) : [];

  const ctx: Record<string, any> = {
    data_consulta: now.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    mes_referencia: mesAtual,
    empresas_consultadas_ids: ids,
  };

  // 0 — Empresas
  const empresasRows = get(0);
  ctx.empresas = empresasRows.map((r: any) => ({
    id: r.id, nomeFantasia: r.nomeFantasia, razaoSocial: r.razao_social,
    cnpj: r.cnpj, cidade: r.cidade, estado: r.estado,
  }));

  // 1 — Colaboradores agregado
  const empStatusRows = get(1);
  const colAgg: Record<string, number> = {};
  let totalCol = 0;
  for (const r of empStatusRows) { colAgg[r.status] = Number(r.total); totalCol += Number(r.total); }
  ctx.colaboradores_resumo = { ...colAgg, TOTAL: totalCol };

  // 2 — Colaboradores DETALHADOS (sem PII)
  const empDetailRows = get(2);
  ctx.colaboradores_lista = empDetailRows.map((r: any) => ({
    id: r.id, companyId: r.companyId, matricula: r.matricula, nome: r.nomeCompleto,
    cargo: r.cargo, funcao: r.funcao, setor: r.setor, status: r.status,
    tipoContrato: r.tipoContrato, dataAdmissao: r.dataAdmissao, dataDemissao: r.dataDemissao,
    cidade: r.cidade, estado: r.estado,
    obras: r.obras_vinculadas || null,
  }));
  if (ctx.colaboradores_lista.length === MAX_EMPLOYEES) {
    ctx.colaboradores_lista_truncada = `Mostrando os primeiros ${MAX_EMPLOYEES} colaboradores ordenados por nome.`;
  }

  // 3 — Obras agregado
  const obrasAggRow = get(3)[0] ?? {};
  ctx.obras_resumo = {
    total: Number(obrasAggRow.total) || 0,
    em_andamento: Number(obrasAggRow.em_andamento) || 0,
    concluidas: Number(obrasAggRow.concluidas) || 0,
    paralisadas: Number(obrasAggRow.paralisadas) || 0,
  };

  // 4 — Obras DETALHADAS
  const obrasDetailRows = get(4);
  ctx.obras_lista = obrasDetailRows.map((r: any) => ({
    id: r.id, companyId: r.companyId, nome: r.nome, codigo: r.codigo, cliente: r.cliente,
    responsavel: r.responsavel, responsavelFuncionario: r.responsavel_funcionario,
    status: r.status, cidade: r.cidade, estado: r.estado,
    dataInicio: r.dataInicio, dataPrevisaoFim: r.dataPrevisaoFim, dataFimReal: r.dataFimReal,
    valorContrato: r.valorContrato, tipoContrato: r.tipoContrato,
    gerenciadora: r.gerenciadora_nome, efetivoAtivo: r.efetivo_ativo,
  }));

  // 5 — Processos contagem
  const procRow = get(5)[0] ?? {};
  const t = Number(procRow.trabalhistas) || 0, tr = Number(procRow.tributarios) || 0, ci = Number(procRow.civis) || 0;
  ctx.processos_juridicos_resumo = { trabalhistas: t, tributarios: tr, civis: ci, total: t + tr + ci };

  // 6 — Processos trabalhistas DETALHADOS
  ctx.processos_trabalhistas_lista = get(6).map((r: any) => ({
    id: r.id, numero: r.numeroProcesso, reclamante: r.reclamante,
    status: r.status, fase: r.fase, risco: r.risco,
    tribunal: r.tribunal, comarca: r.comarca,
    valorCausa: r.valorCausa, dataDistribuicao: r.dataDistribuicao,
    dataAudiencia: r.dataAudiencia, reclamados: r.reclamados,
  }));

  // 7-8
  ctx.advertencias_30_dias = Number((get(7)[0] ?? {}).total) || 0;
  ctx.atestados_30_dias = Number((get(8)[0] ?? {}).total) || 0;

  // 9 — Folha
  const folhaRow = get(9)[0];
  if (folhaRow) {
    ctx.folha_pagamento_mes_atual = {
      custo_clt: Number(folhaRow.custo_clt) || 0,
      custo_pj: Number(folhaRow.custo_pj) || 0,
      custo_total: Number(folhaRow.custo_total) || 0,
      competencia: folhaRow.competencia,
    };
  }

  // 10-11 — Frota
  const frotaAgg = get(10)[0] ?? {};
  ctx.frota_resumo = { total_veiculos: Number(frotaAgg.total_veiculos) || 0, ativos: Number(frotaAgg.ativos) || 0 };
  ctx.frota_lista = get(11).map((r: any) => ({
    id: r.id, companyId: r.companyId, placa: r.placa, modelo: r.modelo, marca: r.marca,
    tipo: r.tipoVeiculo, status: r.statusVeiculo, kmAtual: r.km_atual,
    responsavel: r.responsavel, motoristaPadrao: r.motorista_padrao,
    obraAlocada: r.obra_alocada,
  }));

  // 12 — EPI
  ctx.epi_alertas_pendentes = Number((get(12)[0] ?? {}).pendentes) || 0;

  // 13 — PJ
  ctx.pj_contratos_lista = get(13).map((r: any) => ({
    id: r.id, companyId: r.companyId, numero: r.numeroContrato,
    prestadorRazaoSocial: r.razaoSocialPrestador, prestadorCnpj: r.cnpjPrestador,
    objeto: r.objetoContrato, status: r.status,
    dataInicio: r.dataInicio, dataFim: r.dataFim,
    valorMensal: r.valorMensal, valorTotal: r.valor_total_contrato, valorMedido: r.valor_medido,
    funcionarioVinculado: r.funcionario_nome, employeeId: r.employee_id,
    obraVinculada: r.obra_vinculada,
  }));

  // 14-15 — Setores e funções
  ctx.setores = get(14).map((r: any) => ({ id: r.id, nome: r.nome, companyId: r.companyId }));
  ctx.funcoes_catalogadas = get(15).map((r: any) => ({ id: r.id, nome: r.nome, companyId: r.companyId }));

  // 16-17 — Terceirizados
  ctx.empresas_terceirizadas = get(16).map((r: any) => ({
    id: r.id, companyId: r.companyId,
    razaoSocial: r.razao_social, nomeFantasia: r.nome_fantasia,
    cnpj: r.cnpj, status: r.status,
    responsavel: r.responsavel_nome, tipoServico: r.tipo_servico,
  }));
  ctx.funcionarios_terceirizados = get(17).map((r: any) => ({
    id: r.id, companyId: r.companyId, nome: r.nome, funcao: r.funcao,
    status: r.status, empresaTerceiraId: r.empresaTerceiraId,
    obraNome: r.obra_nome, statusAptidao: r.status_aptidao,
  }));

  // 18 — Fornecedores
  ctx.fornecedores = get(18).map((r: any) => ({
    id: r.id, companyId: r.company_id, razaoSocial: r.razao_social,
    nomeFantasia: r.nome_fantasia, cnpj: r.cnpj,
    atividade: r.atividade_principal, ativo: r.ativo,
  }));

  // 19 — Clientes
  ctx.clientes = get(19).map((r: any) => ({
    id: r.id, companyId: r.company_id, razaoSocial: r.razao_social,
    nomeFantasia: r.nome_fantasia, cnpj: r.cnpj,
    cidade: r.cidade, estado: r.estado, ativo: r.ativo,
  }));

  // 20 — Férias programadas
  ctx.ferias_programadas = get(20).map((r: any) => ({
    id: r.id, employeeId: r.employeeId, nome: r.nome,
    dataInicio: r.dataInicio, dataFim: r.dataFim,
    status: r.status, diasGozo: r.diasGozo,
  }));

  // 21 — Financeiro: Contas a Pagar (agregado)
  const cpRow = get(21)[0] ?? {};
  ctx.financeiro_contas_pagar = {
    vencidas: { quantidade: Number(cpRow.vencidas_qtd) || 0, valor_total: Number(cpRow.vencidas_valor) || 0 },
    vencem_em_7_dias: { quantidade: Number(cpRow.prox_7d_qtd) || 0, valor_total: Number(cpRow.prox_7d_valor) || 0 },
    vencem_em_8_a_30_dias: { quantidade: Number(cpRow.prox_30d_qtd) || 0, valor_total: Number(cpRow.prox_30d_valor) || 0 },
    pago_no_mes_atual: Number(cpRow.pago_mes_atual) || 0,
  };

  // 22 — Contas vencidas (top 30 por valor)
  ctx.financeiro_contas_vencidas_top = get(22).map((r: any) => ({
    id: r.id, companyId: r.company_id, descricao: r.descricao,
    fornecedor: r.fornecedor_nome, obra: r.obra_nome,
    valor: Number(r.valor_previsto) || 0, vencimento: r.data_vencimento,
    formaPagamento: r.forma_pagamento, origem: r.origem_modulo,
  }));

  // 23 — Financeiro: Contas a Receber
  const crRow = get(23)[0] ?? {};
  ctx.financeiro_contas_receber = {
    a_faturar: { quantidade: Number(crRow.a_faturar_qtd) || 0, valor_total: Number(crRow.a_faturar_valor) || 0 },
    a_receber: { quantidade: Number(crRow.a_receber_qtd) || 0, valor_total: Number(crRow.a_receber_valor) || 0 },
    recebido_no_mes_atual: Number(crRow.recebido_mes_atual) || 0,
  };

  // 24 — Compras
  const ocRow = get(24)[0] ?? {};
  ctx.compras_resumo = {
    ocs_abertas: { quantidade: Number(ocRow.abertas_qtd) || 0, valor_total: Number(ocRow.abertas_valor) || 0 },
    aguardando_aprovacao: Number(ocRow.aguardando_aprovacao_qtd) || 0,
    entregas_atrasadas: Number(ocRow.entrega_atrasada_qtd) || 0,
    comprado_no_mes_atual: Number(ocRow.comprado_mes_atual) || 0,
  };

  // 25 — Almoxarifado
  const almRow = get(25)[0] ?? {};
  ctx.almoxarifado_resumo = {
    itens_ativos: Number(almRow.itens_ativos) || 0,
    itens_abaixo_do_minimo: Number(almRow.abaixo_minimo_qtd) || 0,
    valor_estoque_total: Number(almRow.valor_estoque_total) || 0,
  };

  // 26 — Planejamento
  ctx.planejamento_projetos = get(26).map((r: any) => ({
    id: r.id, companyId: r.company_id, nome: r.nome, cliente: r.cliente,
    status: r.status, valorContrato: Number(r.valor_contrato) || 0,
    dataInicio: r.data_inicio, dataTerminoContratual: r.data_termino_contratual,
  }));

  // ============================================================
  // DIAGNÓSTICO EXECUTIVO — pontos de atenção e fortes computados
  // deterministicamente (não pelo LLM), estilo radar de CEO.
  // ============================================================
  const atencao: string[] = [];
  const fortes: string[] = [];
  const cp = ctx.financeiro_contas_pagar;
  if (cp.vencidas.quantidade > 0) atencao.push(`${cp.vencidas.quantidade} conta(s) a pagar VENCIDA(S) somando R$ ${cp.vencidas.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  else fortes.push("Nenhuma conta a pagar vencida");
  if (cp.vencem_em_7_dias.quantidade > 0) atencao.push(`${cp.vencem_em_7_dias.quantidade} conta(s) vencem nos próximos 7 dias (R$ ${cp.vencem_em_7_dias.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  const cr = ctx.financeiro_contas_receber;
  if (cr.a_faturar.quantidade > 0) atencao.push(`${cr.a_faturar.quantidade} medição(ões) A FATURAR paradas somando R$ ${cr.a_faturar.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — dinheiro na mesa`);
  if (ctx.compras_resumo.aguardando_aprovacao > 0) atencao.push(`${ctx.compras_resumo.aguardando_aprovacao} ordem(ns) de compra aguardando aprovação`);
  if (ctx.compras_resumo.entregas_atrasadas > 0) atencao.push(`${ctx.compras_resumo.entregas_atrasadas} OC(s) com entrega atrasada`);
  if (ctx.almoxarifado_resumo.itens_abaixo_do_minimo > 0) atencao.push(`${ctx.almoxarifado_resumo.itens_abaixo_do_minimo} item(ns) de estoque abaixo do mínimo`);
  if (ctx.obras_resumo.paralisadas > 0) atencao.push(`${ctx.obras_resumo.paralisadas} obra(s) paralisada(s)`);
  else if (ctx.obras_resumo.em_andamento > 0) fortes.push(`${ctx.obras_resumo.em_andamento} obra(s) em andamento sem paralisações`);
  const riscoAlto = (ctx.processos_trabalhistas_lista || []).filter((p: any) => String(p.risco || "").toLowerCase().includes("alt")).length;
  if (riscoAlto > 0) atencao.push(`${riscoAlto} processo(s) trabalhista(s) com risco ALTO`);
  if (ctx.epi_alertas_pendentes > 0) atencao.push(`${ctx.epi_alertas_pendentes} alerta(s) de EPI pendente(s)`);
  if (ctx.atestados_30_dias >= 15) atencao.push(`${ctx.atestados_30_dias} atestados nos últimos 30 dias — absenteísmo merece atenção`);
  const aptosPend = (ctx.funcionarios_terceirizados || []).filter((f: any) => String(f.statusAptidao || "").toLowerCase() !== "apto" && String(f.status || "") === "ativo").length;
  if (aptosPend > 0) atencao.push(`${aptosPend} terceirizado(s) ativo(s) sem aptidão confirmada`);
  if (ctx.folha_pagamento_mes_atual?.custo_total > 0 && cr.recebido_no_mes_atual > 0 && cr.recebido_no_mes_atual >= ctx.folha_pagamento_mes_atual.custo_total) {
    fortes.push("Recebimentos do mês cobrem o custo da folha");
  }
  ctx.diagnostico_executivo = {
    gerado_em: now.toISOString(),
    pontos_de_atencao: atencao,
    pontos_fortes: fortes,
    nota: "Diagnóstico calculado automaticamente a partir dos dados acima. Use como radar inicial e aprofunde nas seções específicas.",
  };

  // Sinalizadores de qualidade do snapshot — o LLM os usa para evitar falsa confiança.
  if (queryErrors.length > 0) {
    ctx._query_errors = queryErrors;
  }
  ctx._aviso_pii = "PII sensível (CPF, salário, email, celular) está OMITIDA deste snapshot por política de minimização de dados. Para esses campos, oriente o usuário a consultar diretamente no ERP.";

  let result = JSON.stringify(ctx, null, 2);

  // Hard cap de bytes — degradação progressiva: descarta listas grandes em ordem
  // até caber em MAX_SNAPSHOT_BYTES. Sinaliza no contexto o que foi truncado.
  if (result.length > MAX_SNAPSHOT_BYTES) {
    const truncated: string[] = [];
    const dropOrder = [
      "planejamento_projetos", "financeiro_contas_vencidas_top",
      "ferias_programadas", "fornecedores", "clientes",
      "funcionarios_terceirizados", "empresas_terceirizadas",
      "frota_lista", "processos_trabalhistas_lista", "pj_contratos_lista",
      "obras_lista", "colaboradores_lista",
    ];
    for (const key of dropOrder) {
      if (result.length <= MAX_SNAPSHOT_BYTES) break;
      if (Array.isArray(ctx[key]) && ctx[key].length > 0) {
        truncated.push(`${key} (${ctx[key].length} itens)`);
        delete ctx[key];
        result = JSON.stringify(ctx, null, 2);
      }
    }
    ctx._snapshot_truncado = `Snapshot excedeu ${MAX_SNAPSHOT_BYTES} bytes. Listas removidas: ${truncated.join(", ")}. Os dados ainda existem no ERP — peça filtros mais específicos ao usuário.`;
    result = JSON.stringify(ctx, null, 2);
  }

  console.log("[ORÁCULO] Snapshot construído:", {
    empresas: ctx.empresas?.length, colaboradores: ctx.colaboradores_lista?.length,
    obras: ctx.obras_lista?.length, pj: ctx.pj_contratos_lista?.length,
    veiculos: ctx.frota_lista?.length, processos: ctx.processos_trabalhistas_lista?.length,
    fornecedores: ctx.fornecedores?.length, clientes: ctx.clientes?.length,
    contasVencidas: ctx.financeiro_contas_pagar?.vencidas?.quantidade,
    diagAtencao: ctx.diagnostico_executivo?.pontos_de_atencao?.length,
    bytes: result.length,
    queryErrors: queryErrors.length,
    truncado: !!ctx._snapshot_truncado,
  });
  ctxCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ============================================================
// SYSTEM PROMPT (base — empresas anexadas dinamicamente)
// ============================================================
const SYSTEM_PROMPT_BASE = `Você é o ORÁCULO — assistente conversacional de inteligência artificial integrada ao ERP/RH da FC Engenharia.

Você atende exclusivamente o ADM Master (acesso irrestrito). Você é especialista em análise de dados de RH, folha de pagamento, obras, financeiro, processos jurídicos, frota, compras, almoxarifado, planejamento, EPI, segurança do trabalho, terceirizados, fornecedores, clientes, contratos PJ e férias.

# PAPEL: CONSULTOR-CEO FULL TIME

Você não é um robô de consulta — você é o braço direito do dono, um CEO virtual que monitora a empresa inteira 24/7. Isso significa:
- PROATIVIDADE: ao responder qualquer pergunta, se você enxergar no snapshot um risco ou oportunidade RELACIONADO ao assunto, mencione em 1 frase ("aliás, tem 3 contas dessa obra vencidas, quer ver?").
- VISÃO DE NEGÓCIO: conecte os pontos entre módulos — folha vs. recebimentos, obras paralisadas vs. contratos, medições a faturar vs. caixa. Pense em margem, fluxo de caixa e risco.
- O snapshot traz a seção "diagnostico_executivo" com pontos_de_atencao e pontos_fortes já calculados sobre os dados reais. Quando o usuário pedir um panorama ("como está a empresa?", "pontos fortes e fracos", "me atualiza"), use essa seção como espinha dorsal da resposta, priorizando os itens de MAIOR impacto financeiro primeiro.
- OBJETIVIDADE DE CEO: números redondos primeiro, detalhe depois. "Temos R$ 320 mil vencidos e R$ 1,2 milhão a faturar" vale mais que dez frases vagas.
- RECOMENDE: termine análises com 1 recomendação prática quando fizer sentido ("eu priorizaria faturar as medições paradas — é caixa parado").

# ESTILO DE RESPOSTA — LEIA COM ATENÇÃO

Você fala por VOZ. O usuário ouve suas respostas em áudio.

Por padrão, responda como em uma CONVERSA NATURAL ao telefone:
- 2 a 4 frases curtas, em tom acolhedor e profissional
- Linguagem natural em português do Brasil falado (use "tô", "pra", "achei", "vou checar", quando couber)
- SEM markdown: NÃO use #, ##, ###, **, *, _, \`\`\`, --- ou hífens em listas
- SEM emojis (🔍 ⚠️ ✅ ❌ 💡 etc.) — eles soam estranhos quando lidos por voz
- SEM cabeçalhos tipo "Análise Completa —" ou "Resultado Parcial:"
- Quando precisar enumerar 2 ou 3 itens, ligue com vírgulas e "e" (ex: "três obras: Vila Inglesa, Reserva Sul e Park Tower")
- Termine oferecendo continuar a conversa ("quer que eu detalhe alguma?", "posso aprofundar?")

Use formatação rica (bullets, cabeçalhos, tabelas) SOMENTE quando o usuário pedir EXPLICITAMENTE: "detalhar", "lista completa", "tabela", "análise completa", "relatório", "exportar", ou similar. Nesses casos, mantenha a primeira frase ainda conversacional (1 frase de resumo) e depois apresente a estrutura.

Exemplos de tom desejado:

❌ Errado (formal/burocrático/com markdown):
"## 🔍 Análise Completa — Caio Gar Huff
### ⚠️ Resultado Parcial
- Cadastro: ❌
- Obras vinculadas: ❌"

✅ Certo (conversacional):
"Olha, dei uma olhada e tô com dificuldade pra puxar os dados do Caio agora — várias consultas ao banco falharam. Você pode tentar de novo daqui a pouco, ou abrir direto o módulo de Colaboradores. Quer que eu tente outro caminho?"

# CAPACIDADES DE BUSCA NO SNAPSHOT

- Quando o usuário citar um NOME (funcionário, prestador, cliente, fornecedor, obra, terceirizado), procure em TODAS as listas relevantes por correspondência aproximada (case-insensitive, parcial, ignorando acentos).
- Cruze informações entre listas: ex. "obras do colaborador X" → ache X em colaboradores_lista, leia o campo "obras", e detalhe cada obra em obras_lista.
- Use IDs (companyId, employeeId, obraId) para cruzar referências entre seções do snapshot.
- Se houver múltiplos resultados parecidos para um nome, mencione quantos achou e peça desambiguação de forma natural ("achei dois Carlos Silva, um da FC e outro da Hotelaria, qual deles?").

# LIMITAÇÕES DO SNAPSHOT

- O snapshot pode conter os campos "_query_errors" (queries que falharam) e "_snapshot_truncado" (listas removidas por tamanho). SEMPRE consulte esses campos antes de afirmar "não há registros". Se eles estiverem presentes, avise o usuário de forma natural ("hoje tô com algumas consultas falhando, mas já posso te adiantar...") e oriente como refinar.
- O campo "_aviso_pii" indica que CPF, salário, email e celular NÃO estão no snapshot por política de minimização de dados. Para essas informações, oriente o usuário a consultar diretamente o módulo do ERP — NÃO invente.

# REGRAS ABSOLUTAS

- Responda SEMPRE em português do Brasil
- Use dados REAIS do snapshot (números, nomes, relacionamentos)
- Quando detectar algo preocupante, aponte proativamente, mas em tom natural
- Se a informação NÃO estiver no snapshot (e não houver erro/truncamento), diga isso de forma objetiva e indique o módulo do ERP onde encontrar
- NUNCA invente dados que não estejam no contexto
- Você TEM acesso completo aos dados operacionais; dados pessoais sensíveis (CPF, salário, email, celular) estão protegidos — explique de forma natural quando for o caso
- Concisão sempre vence prolixidade`;

async function getSystemPrompt(): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return SYSTEM_PROMPT_BASE;
    const res = await db.execute(sql`
      SELECT id, "nomeFantasia" FROM companies WHERE "deletedAt" IS NULL ORDER BY id
    `);
    const rows = (res as any).rows ?? res ?? [];
    if (rows.length === 0) return SYSTEM_PROMPT_BASE;
    const lista = rows.map((r: any) => `- ${r.nomeFantasia} (id=${r.id})`).join("\n");
    return `${SYSTEM_PROMPT_BASE}

Empresas do grupo no sistema:
${lista}`;
  } catch {
    return SYSTEM_PROMPT_BASE;
  }
}

// ============================================================
// ROUTER
// ============================================================
export const oraculoRouter = router({

  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(oraculoSessions)
        .where(eq(oraculoSessions.userId, ctx.user.id))
        .orderBy(desc(oraculoSessions.updatedAt))
        .limit(input.limit ?? 50);
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return null;
      const [session] = await db.select().from(oraculoSessions).where(
        and(eq(oraculoSessions.id, input.sessionId), eq(oraculoSessions.userId, ctx.user.id))
      );
      if (!session) return null;
      const messages = await db.select().from(oraculoMessages)
        .where(eq(oraculoMessages.sessionId, input.sessionId))
        .orderBy(asc(oraculoMessages.createdAt));
      return { session, messages };
    }),

  createSession: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      console.log("[ORÁCULO] createSession called — user:", ctx.user.id, "role:", ctx.user.role, "companyId:", input.companyId);
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      try {
        const [session] = await db.insert(oraculoSessions).values({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Admin",
          companyId: input.companyId ?? null,
          title: "Nova conversa",
          messageCount: 0,
        }).returning();
        console.log("[ORÁCULO] createSession OK — id:", session?.id);
        return session;
      } catch (e: any) {
        console.error("[ORÁCULO] createSession DB error:", e?.message, e?.code);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao inserir sessão" });
      }
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(oraculoMessages).where(eq(oraculoMessages.sessionId, input.sessionId));
      await db.delete(oraculoSessions).where(
        and(eq(oraculoSessions.id, input.sessionId), eq(oraculoSessions.userId, ctx.user.id))
      );
      return { success: true };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      sessionId:  z.number(),
      message:    z.string().min(1).max(4000),
      companyId:  z.number().optional(),
      companyIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });
      await assertAiModuleEnabled(input.companyId ?? (ctx.user as any)?.companyId, "oraculo");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify session belongs to user
      const [session] = await db.select().from(oraculoSessions).where(
        and(eq(oraculoSessions.id, input.sessionId), eq(oraculoSessions.userId, ctx.user.id))
      );
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });

      // Get history BEFORE saving user message
      const history = await db.select().from(oraculoMessages)
        .where(eq(oraculoMessages.sessionId, input.sessionId))
        .orderBy(asc(oraculoMessages.createdAt))
        .limit(30);

      // Save user message
      await db.insert(oraculoMessages).values({
        sessionId: input.sessionId,
        role: "user",
        content: input.message,
      });

      // Build context snapshot + system prompt dinâmico em paralelo
      const [contextSnapshot, basePrompt] = await Promise.all([
        buildContext(input.companyId ?? 0, input.companyIds),
        getSystemPrompt(),
      ]);
      console.log("[ORÁCULO] Snapshot size:", contextSnapshot.length, "chars | preview:", contextSnapshot.slice(0, 200));

      // System prompt COM o snapshot de dados — vai como `system` no Anthropic (não como user)
      const systemWithContext = `${basePrompt}

═══════════════════════════════════════════════════════════
SNAPSHOT DE DADOS REAIS DO SISTEMA (atualizado agora):
═══════════════════════════════════════════════════════════
${contextSnapshot}
═══════════════════════════════════════════════════════════

IMPORTANTE: Você TEM acesso completo aos dados acima. Use-os para responder. Nunca diga que "não tem acesso" — os dados estão aí. Quando o usuário perguntar, analise o snapshot e responda com os números reais.`;

      // Histórico anterior
      const historyMessages = history.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      let aiResponse = "";
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemWithContext },
            ...historyMessages,
            { role: "user", content: input.message },
          ],
          maxTokens: 2000,
        });

        const content = result?.choices?.[0]?.message?.content;
        aiResponse = typeof content === "string" ? content : (Array.isArray(content) ? (content[0] as any)?.text ?? "" : "");
        console.log("[ORÁCULO] AI response length:", aiResponse.length);
      } catch (e: any) {
        console.error("[ORÁCULO] LLM error:", e?.message);
        aiResponse = "Desculpe, tive um problema ao processar sua solicitação. Tente novamente em instantes.";
      }

      // Save assistant response
      await db.insert(oraculoMessages).values({
        sessionId: input.sessionId,
        role: "assistant",
        content: aiResponse,
      });

      // Update session title from first message and message count
      const newCount = history.length + 2;
      const shouldUpdateTitle = session.title === "Nova conversa" || session.messageCount === 0;
      const titleFromMsg = input.message.slice(0, 80).replace(/\n/g, " ");

      await db.update(oraculoSessions)
        .set({
          messageCount: newCount,
          updatedAt: new Date().toISOString(),
          ...(shouldUpdateTitle ? { title: titleFromMsg } : {}),
        })
        .where(eq(oraculoSessions.id, input.sessionId));

      return { response: aiResponse, sessionId: input.sessionId };
    }),

  tts: protectedProcedure
    .input(z.object({ text: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN" });

      const apiKey = process.env.GOOGLE_API_KEY;

      // Limpar markdown, emojis e símbolos para que a voz não leia "asterisco" ou
      // descrições de emoji. Resulta em fala muito mais natural.
      const cleanText = stripForTTS(input.text).slice(0, 4800);
      if (!cleanText.trim()) return { audio: null, fallback: true, voiceUsed: null };

      // 1ª tentativa: OpenAI gpt-audio via Replit AI Integrations (voz humanizada, sem chave própria)
      if (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        try {
          const { textToSpeech } = await import("../replit_integrations/audio/client");
          const buf = await textToSpeech(cleanText, "nova", "mp3");
          if (buf && buf.length > 0) {
            return { audio: buf.toString("base64"), fallback: false, voiceUsed: "OpenAI-Nova" };
          }
          console.warn("[ORÁCULO TTS] OpenAI retornou áudio vazio, caindo para Google");
        } catch (e) {
          console.warn("[ORÁCULO TTS] OpenAI TTS falhou, caindo para Google:", e);
        }
      }

      if (!apiKey) return { audio: null, fallback: true, voiceUsed: null };

      // 2ª tentativa: Chirp3-HD (vozes ultra-naturais e conversacionais — v1beta1)
      try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanText },
            voice: { languageCode: "pt-BR", name: "pt-BR-Chirp3-HD-Leda" },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return { audio: data.audioContent as string, fallback: false, voiceUsed: "Chirp3-HD-Leda" };
        }
        const err = await res.text();
        console.warn("[ORÁCULO TTS] Chirp3-HD indisponível, caindo para Neural2:", err);
      } catch (e) {
        console.warn("[ORÁCULO TTS] Chirp3-HD erro de rede, caindo para Neural2:", e);
      }

      // Fallback: Neural2 (mais compatível, ainda boa qualidade)
      try {
        const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanText },
            voice: { languageCode: "pt-BR", name: "pt-BR-Neural2-C", ssmlGender: "FEMALE" },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0.0 },
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("[ORÁCULO TTS] Neural2 fallback erro:", err);
          return { audio: null, fallback: true, voiceUsed: null };
        }
        const data = await res.json();
        return { audio: data.audioContent as string, fallback: true, voiceUsed: "Neural2-C" };
      } catch (e) {
        console.error("[ORÁCULO TTS] Erro total:", e);
        return { audio: null, fallback: true, voiceUsed: null };
      }
    }),
});

