import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import { resolveCompanyIds } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { seedPlanoDeConta, ensureTaxConfig } from "../services/financialSeedAccounts";
import { runAllAutoImports } from "../services/financialAutoImport";

// ============================================================
// MÓDULO FINANCEIRO — Router tRPC
// ============================================================

function rows(res: any): any[] {
  return (res as any)?.rows ?? (res as any) ?? [];
}

export const financialRouter = router({

  // ─────────────────── PLANO DE CONTAS ───────────────────

  getAccounts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    tipo: z.string().optional(),
    ativo: z.boolean().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const ativoPart = input.ativo !== undefined ? `AND ativo = ${input.ativo ? 1 : 0}` : "";
    const tipoPart = input.tipo ? `AND tipo = '${input.tipo.replace(/'/g, "''")}'` : "";
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", codigo, nome, tipo, natureza, nivel,
              conta_pai_id AS "contaPaiId", classificacao_dre AS "classificacaoDRE",
              ativo, ordem
       FROM financial_accounts
       WHERE company_id = ANY($1::int[]) ${ativoPart} ${tipoPart}
       ORDER BY ordem ASC, codigo ASC`,
      [ids]
    );
    return rows(res);
  }),

  createAccount: protectedProcedure.input(z.object({
    companyId: z.number(),
    codigo: z.string().min(1),
    nome: z.string().min(2),
    tipo: z.string(),
    natureza: z.string(),
    nivel: z.number().default(1),
    contaPaiId: z.number().optional(),
    classificacaoDRE: z.string().optional(),
    ordem: z.number().default(0),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `INSERT INTO financial_accounts (company_id, codigo, nome, tipo, natureza, nivel, conta_pai_id, classificacao_dre, ativo, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9) RETURNING id`,
      [input.companyId, input.codigo, input.nome, input.tipo, input.natureza,
       input.nivel, input.contaPaiId ?? null, input.classificacaoDRE ?? null, input.ordem]
    );
    const id = rows(res)[0]?.id;
    await createAuditLog({ action: "financial_account_created", userId: ctx.user?.id, companyId: input.companyId, details: `Conta ${input.codigo} - ${input.nome}` });
    return { id };
  }),

  updateAccount: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    nome: z.string().optional(),
    classificacaoDRE: z.string().optional(),
    ativo: z.boolean().optional(),
    ordem: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const parts: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (input.nome !== undefined) { parts.push(`nome=$${i++}`); vals.push(input.nome); }
    if (input.classificacaoDRE !== undefined) { parts.push(`classificacao_dre=$${i++}`); vals.push(input.classificacaoDRE); }
    if (input.ativo !== undefined) { parts.push(`ativo=$${i++}`); vals.push(input.ativo ? 1 : 0); }
    if (input.ordem !== undefined) { parts.push(`ordem=$${i++}`); vals.push(input.ordem); }
    if (!parts.length) return { ok: true };
    vals.push(input.id, input.companyId);
    await db.execute(`UPDATE financial_accounts SET ${parts.join(",")} WHERE id=$${i++} AND company_id=$${i}`, vals);
    return { ok: true };
  }),

  seedAccounts: protectedProcedure.input(z.object({ companyId: z.number() })).mutation(async ({ input }) => {
    await seedPlanoDeConta(input.companyId);
    await ensureTaxConfig(input.companyId);
    return { ok: true };
  }),

  // ─────────────────── LANÇAMENTOS ───────────────────

  getEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    obraId: z.number().optional(),
    tipo: z.string().optional(),
    status: z.string().optional(),
    mesCompetencia: z.string().optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    origemModulo: z.string().optional(),
    limit: z.number().default(100),
    offset: z.number().default(0),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`e.company_id = ANY($1::int[])`];
    const vals: any[] = [ids];
    let i = 2;
    if (input.obraId) { conds.push(`e.obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.tipo) { conds.push(`e.tipo=$${i++}`); vals.push(input.tipo); }
    if (input.status) { conds.push(`e.status=$${i++}`); vals.push(input.status); }
    if (input.mesCompetencia) { conds.push(`TO_CHAR(e.data_competencia,'YYYY-MM')=$${i++}`); vals.push(input.mesCompetencia); }
    if (input.dataInicio) { conds.push(`e.data_competencia>=$${i++}`); vals.push(input.dataInicio); }
    if (input.dataFim) { conds.push(`e.data_competencia<=$${i++}`); vals.push(input.dataFim); }
    if (input.origemModulo) { conds.push(`e.origem_modulo=$${i++}`); vals.push(input.origemModulo); }
    vals.push(input.limit, input.offset);
    const res = await db.execute(
      `SELECT e.id, e.company_id AS "companyId", e.obra_id AS "obraId", e.obra_nome AS "obraNome",
              e.conta_id AS "contaId", e.conta_nome AS "contaNome", e.tipo, e.natureza,
              e.valor_previsto AS "valorPrevisto", e.valor_realizado AS "valorRealizado",
              e.data_competencia AS "dataCompetencia", e.data_vencimento AS "dataVencimento",
              e.data_pagamento AS "dataPagamento", e.status, e.origem_modulo AS "origemModulo",
              e.origem_descricao AS "origemDescricao", e.forma_pagamento AS "formaPagamento",
              e.descricao, e.observacoes, e.conciliado, e.parcela_numero AS "parcelaNumero",
              e.parcela_total AS "parcelaTotal", e.cheque_status AS "chequeStatus",
              e.criado_por_nome AS "criadoPorNome", e.created_at AS "createdAt"
       FROM financial_entries e
       WHERE ${conds.join(" AND ")}
       ORDER BY e.data_competencia DESC, e.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    const countRes = await db.execute(
      `SELECT COUNT(*) AS total FROM financial_entries e WHERE ${conds.slice(0, -0).join(" AND ")}`,
      vals.slice(0, -2)
    );
    return {
      data: rows(res),
      total: Number(rows(countRes)[0]?.total ?? 0),
    };
  }),

  createEntry: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
    obraNome: z.string().optional(),
    contaId: z.number().optional(),
    contaNome: z.string().optional(),
    tipo: z.enum(["receita", "despesa", "transferencia", "imposto", "provisao"]),
    natureza: z.enum(["fixo", "variavel"]),
    valorPrevisto: z.number().positive(),
    valorRealizado: z.number().optional(),
    dataCompetencia: z.string(),
    dataVencimento: z.string().optional(),
    dataPagamento: z.string().optional(),
    status: z.string().default("previsto"),
    contaBancariaId: z.number().optional(),
    formaPagamento: z.string().optional(),
    descricao: z.string().optional(),
    observacoes: z.string().optional(),
    parcelaNumero: z.number().optional(),
    parcelaTotal: z.number().optional(),
    parcelaGrupoId: z.string().optional(),
    chequeNumero: z.string().optional(),
    chequeBanco: z.string().optional(),
    chequeAgencia: z.string().optional(),
    chequeConta: z.string().optional(),
    chequeTitular: z.string().optional(),
    chequeDataEmissao: z.string().optional(),
    chequeDataBomPara: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `INSERT INTO financial_entries
       (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
        valor_previsto, valor_realizado, data_competencia, data_vencimento, data_pagamento,
        status, conta_bancaria_id, forma_pagamento, descricao, observacoes,
        parcela_numero, parcela_total, parcela_grupo_id,
        cheque_numero, cheque_banco, cheque_agencia, cheque_conta, cheque_titular,
        cheque_data_emissao, cheque_data_bom_para,
        criado_por_id, criado_por_nome, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW(),NOW())
       RETURNING id`,
      [
        input.companyId, input.obraId ?? null, input.obraNome ?? null,
        input.contaId ?? null, input.contaNome ?? null, input.tipo, input.natureza,
        input.valorPrevisto, input.valorRealizado ?? null,
        input.dataCompetencia, input.dataVencimento ?? null, input.dataPagamento ?? null,
        input.status, input.contaBancariaId ?? null, input.formaPagamento ?? null,
        input.descricao ?? null, input.observacoes ?? null,
        input.parcelaNumero ?? null, input.parcelaTotal ?? null, input.parcelaGrupoId ?? null,
        input.chequeNumero ?? null, input.chequeBanco ?? null, input.chequeAgencia ?? null,
        input.chequeConta ?? null, input.chequeTitular ?? null,
        input.chequeDataEmissao ?? null, input.chequeDataBomPara ?? null,
        ctx.user?.id ?? null, ctx.user?.name ?? null,
      ]
    );
    const id = rows(res)[0]?.id;
    await createAuditLog({ action: "financial_entry_created", userId: ctx.user?.id, companyId: input.companyId, details: `${input.tipo} R$${input.valorPrevisto} - ${input.descricao ?? ""}` });
    return { id };
  }),

  updateEntryStatus: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    status: z.string(),
    dataPagamento: z.string().optional(),
    valorRealizado: z.number().optional(),
    formaPagamento: z.string().optional(),
    comprovanteUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.execute(
      `UPDATE financial_entries
       SET status=$1, data_pagamento=COALESCE($2, data_pagamento),
           valor_realizado=COALESCE($3, valor_realizado),
           forma_pagamento=COALESCE($4, forma_pagamento),
           comprovante_url=COALESCE($5, comprovante_url),
           updated_at=NOW()
       WHERE id=$6 AND company_id=$7`,
      [input.status, input.dataPagamento ?? null, input.valorRealizado ?? null,
       input.formaPagamento ?? null, input.comprovanteUrl ?? null, input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_entry_status_updated", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  cancelEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    motivoCancelamento: z.string().min(5),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.execute(
      `UPDATE financial_entries SET status='cancelado', motivo_cancelamento=$1, updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status != 'cancelado'`,
      [input.motivoCancelamento, input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_entry_cancelled", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.id}: ${input.motivoCancelamento}` });
    return { ok: true };
  }),

  // ─────────────────── RESUMO / DASHBOARD ───────────────────

  getDashboardSummary: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    mesCompetencia: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.mesCompetencia ?? new Date().toISOString().slice(0, 7);

    const [recRes, despRes, aReceberRes, apagarRes, vencRes] = await Promise.all([
      db.execute(
        `SELECT COALESCE(SUM(valor_realizado),0) AS total FROM financial_entries
         WHERE company_id=ANY($1::int[]) AND tipo='receita' AND status IN ('recebido','pago')
           AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
        [ids, mes]
      ),
      db.execute(
        `SELECT COALESCE(SUM(valor_realizado),0) AS total FROM financial_entries
         WHERE company_id=ANY($1::int[]) AND tipo='despesa' AND status IN ('pago','recebido')
           AND TO_CHAR(data_competencia,'YYYY-MM')=$2`,
        [ids, mes]
      ),
      db.execute(
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id=ANY($1::int[]) AND tipo='receita' AND status='a_receber'`,
        [ids]
      ),
      db.execute(
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id=ANY($1::int[]) AND tipo='despesa' AND status='a_pagar'`,
        [ids]
      ),
      db.execute(
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id=ANY($1::int[]) AND status IN ('a_pagar','a_receber')
           AND data_vencimento < CURRENT_DATE`,
        [ids]
      ),
    ]);

    const rec = Number(rows(recRes)[0]?.total ?? 0);
    const desp = Number(rows(despRes)[0]?.total ?? 0);
    const aReceber = Number(rows(aReceberRes)[0]?.total ?? 0);
    const aPagar = Number(rows(apagarRes)[0]?.total ?? 0);
    const vencidos = Number(rows(vencRes)[0]?.total ?? 0);

    return {
      receitaMes: rec,
      despesaMes: desp,
      resultadoMes: rec - desp,
      totalAReceber: aReceber,
      totalAPagar: aPagar,
      totalVencidos: vencidos,
      saldoLiquido: aReceber - aPagar,
    };
  }),

  // ─────────────────── RECEITAS DE OBRAS ───────────────────

  getRevenue: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    obraId: z.number().optional(),
    status: z.string().optional(),
    limit: z.number().default(50),
    offset: z.number().default(0),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`company_id=ANY($1::int[])`];
    const vals: any[] = [ids];
    let i = 2;
    if (input.obraId) { conds.push(`obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    vals.push(input.limit, input.offset);
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", obra_id AS "obraId", obra_nome AS "obraNome",
              cliente_nome AS "clienteNome", cliente_cnpj AS "clienteCnpj",
              valor_contrato AS "valorContrato", valor_aditivos AS "valorAditivos",
              valor_contrato_total AS "valorContratoTotal", medicao_numero AS "medicaoNumero",
              percentual_medicao AS "percentualMedicao", valor_medicao AS "valorMedicao",
              nf_numero AS "nfNumero", nf_emitida_em AS "nfEmitidaEm",
              data_vencimento AS "dataVencimento", data_recebimento AS "dataRecebimento",
              valor_recebido AS "valorRecebido", status, forma_pagamento AS "formaPagamento",
              retencao_iss AS "retencaoISS", retencao_inss AS "retencaoINSS",
              retencao_ir AS "retencaoIR", retencao_total AS "retencaoTotal",
              valor_liquido_receber AS "valorLiquidoReceber", observacoes,
              created_at AS "createdAt"
       FROM financial_revenue
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    return rows(res);
  }),

  createRevenue: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    obraNome: z.string().optional(),
    clienteNome: z.string().optional(),
    clienteCnpj: z.string().optional(),
    valorContrato: z.number().optional(),
    valorMedicao: z.number(),
    medicaoNumero: z.number().optional(),
    percentualMedicao: z.number().optional(),
    dataVencimento: z.string().optional(),
    retencaoISS: z.number().default(0),
    retencaoINSS: z.number().default(0),
    retencaoIR: z.number().default(0),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const retTotal = input.retencaoISS + input.retencaoINSS + input.retencaoIR;
    const vlq = input.valorMedicao - retTotal;
    const res = await db.execute(
      `INSERT INTO financial_revenue
       (company_id, obra_id, obra_nome, cliente_nome, cliente_cnpj, valor_contrato,
        valor_medicao, medicao_numero, percentual_medicao, data_vencimento,
        retencao_iss, retencao_inss, retencao_ir, retencao_total, valor_liquido_receber,
        status, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'a_faturar',$16,NOW(),NOW())
       RETURNING id`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.clienteNome ?? null,
       input.clienteCnpj ?? null, input.valorContrato ?? null, input.valorMedicao,
       input.medicaoNumero ?? null, input.percentualMedicao ?? null, input.dataVencimento ?? null,
       input.retencaoISS, input.retencaoINSS, input.retencaoIR, retTotal, vlq,
       input.observacoes ?? null]
    );
    const id = rows(res)[0]?.id;
    await createAuditLog({ action: "financial_revenue_created", userId: ctx.user?.id, companyId: input.companyId, details: `Receita obra ${input.obraId}: R$${input.valorMedicao}` });
    return { id };
  }),

  updateRevenueStatus: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    status: z.string(),
    nfNumero: z.string().optional(),
    nfEmitidaEm: z.string().optional(),
    dataRecebimento: z.string().optional(),
    valorRecebido: z.number().optional(),
    formaPagamento: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.execute(
      `UPDATE financial_revenue
       SET status=$1, nf_numero=COALESCE($2,nf_numero), nf_emitida_em=COALESCE($3,nf_emitida_em),
           data_recebimento=COALESCE($4,data_recebimento), valor_recebido=COALESCE($5,valor_recebido),
           forma_pagamento=COALESCE($6,forma_pagamento), updated_at=NOW()
       WHERE id=$7 AND company_id=$8`,
      [input.status, input.nfNumero ?? null, input.nfEmitidaEm ?? null,
       input.dataRecebimento ?? null, input.valorRecebido ?? null,
       input.formaPagamento ?? null, input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_revenue_status_updated", userId: ctx.user?.id, companyId: input.companyId, details: `Revenue ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  // ─────────────────── OBRIGAÇÕES FISCAIS ───────────────────

  getTaxObligations: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    mesCompetencia: z.string().optional(),
    status: z.string().optional(),
    tipo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`company_id=ANY($1::int[])`];
    const vals: any[] = [ids];
    let i = 2;
    if (input.mesCompetencia) { conds.push(`mes_competencia=$${i++}`); vals.push(input.mesCompetencia); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    if (input.tipo) { conds.push(`tipo=$${i++}`); vals.push(input.tipo); }
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", tipo, mes_competencia AS "mesCompetencia",
              base_calculo AS "baseCalculo", aliquota, valor_principal AS "valorPrincipal",
              valor_multa AS "valorMulta", valor_juros AS "valorJuros", valor_total AS "valorTotal",
              data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
              codigo_receita AS "codigoReceita", codigo_barras AS "codigoBarras",
              guia_url AS "guiaUrl", status, gerada_automaticamente AS "geradaAutomaticamente",
              created_at AS "createdAt"
       FROM financial_tax_obligations
       WHERE ${conds.join(" AND ")}
       ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),

  createTaxObligation: protectedProcedure.input(z.object({
    companyId: z.number(),
    tipo: z.string(),
    mesCompetencia: z.string(),
    baseCalculo: z.number().optional(),
    aliquota: z.number().optional(),
    valorPrincipal: z.number(),
    valorMulta: z.number().default(0),
    valorJuros: z.number().default(0),
    dataVencimento: z.string(),
    codigoReceita: z.string().optional(),
    status: z.string().default("a_pagar"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const valorTotal = input.valorPrincipal + input.valorMulta + input.valorJuros;
    const res = await db.execute(
      `INSERT INTO financial_tax_obligations
       (company_id, tipo, mes_competencia, base_calculo, aliquota, valor_principal,
        valor_multa, valor_juros, valor_total, data_vencimento, codigo_receita, status, gerada_automaticamente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0) RETURNING id`,
      [input.companyId, input.tipo, input.mesCompetencia, input.baseCalculo ?? null,
       input.aliquota ?? null, input.valorPrincipal, input.valorMulta, input.valorJuros,
       valorTotal, input.dataVencimento, input.codigoReceita ?? null, input.status]
    );
    return { id: rows(res)[0]?.id };
  }),

  payTaxObligation: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    dataPagamento: z.string(),
    guiaUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.execute(
      `UPDATE financial_tax_obligations
       SET status='pago', data_pagamento=$1, guia_url=COALESCE($2,guia_url)
       WHERE id=$3 AND company_id=$4`,
      [input.dataPagamento, input.guiaUrl ?? null, input.id, input.companyId]
    );
    await createAuditLog({ action: "tax_obligation_paid", userId: ctx.user?.id, companyId: input.companyId, details: `Obrigação ${input.id} paga em ${input.dataPagamento}` });
    return { ok: true };
  }),

  // ─────────────────── CONFIGURAÇÃO TRIBUTÁRIA ───────────────────

  getTaxConfig: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await ensureTaxConfig(input.companyId);
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", regime_tributario AS "regimeTributario",
              anexo_simples AS "anexoSimples", aliquota_simples AS "aliquotaSimples",
              aliquota_iss AS "aliquotaISS", aliquota_pis AS "aliquotaPIS",
              aliquota_cofins AS "aliquotaCOFINS", aliquota_irpj AS "aliquotaIRPJ",
              aliquota_csll AS "aliquotaCSLL", aliquota_inss_empresa AS "aliquotaINSSEmpresa",
              aliquota_fgts AS "aliquotaFGTS", aliquota_rat AS "aliquotaRAT",
              aliquota_sistema AS "aliquotaSistema",
              dia_pagamento_iss AS "diaPagamentoISS", dia_pagamento_pis AS "diaPagamentoPIS",
              dia_pagamento_cofins AS "diaPagamentoCOFINS", dia_pagamento_darf AS "diaPagamentoDARF",
              dia_pagamento_gps AS "diaPagamentoGPS", dia_pagamento_fgts AS "diaPagamentoFGTS"
       FROM financial_tax_config WHERE company_id=$1 LIMIT 1`,
      [input.companyId]
    );
    return rows(res)[0] ?? null;
  }),

  updateTaxConfig: protectedProcedure.input(z.object({
    companyId: z.number(),
    regimeTributario: z.string().optional(),
    anexoSimples: z.string().optional(),
    aliquotaSimples: z.number().optional(),
    aliquotaISS: z.number().optional(),
    aliquotaPIS: z.number().optional(),
    aliquotaCOFINS: z.number().optional(),
    aliquotaIRPJ: z.number().optional(),
    aliquotaCSLL: z.number().optional(),
    aliquotaINSSEmpresa: z.number().optional(),
    aliquotaFGTS: z.number().optional(),
    aliquotaRAT: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const parts: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const map: Record<string, string> = {
      regimeTributario: "regime_tributario",
      anexoSimples: "anexo_simples",
      aliquotaSimples: "aliquota_simples",
      aliquotaISS: "aliquota_iss",
      aliquotaPIS: "aliquota_pis",
      aliquotaCOFINS: "aliquota_cofins",
      aliquotaIRPJ: "aliquota_irpj",
      aliquotaCSLL: "aliquota_csll",
      aliquotaINSSEmpresa: "aliquota_inss_empresa",
      aliquotaFGTS: "aliquota_fgts",
      aliquotaRAT: "aliquota_rat",
    };
    for (const [k, col] of Object.entries(map)) {
      if ((input as any)[k] !== undefined) {
        parts.push(`${col}=$${i++}`);
        vals.push((input as any)[k]);
      }
    }
    if (!parts.length) return { ok: true };
    vals.push(input.companyId);
    await db.execute(
      `UPDATE financial_tax_config SET ${parts.join(",")}, updated_at=NOW() WHERE company_id=$${i}`,
      vals
    );
    await createAuditLog({ action: "tax_config_updated", userId: ctx.user?.id, companyId: input.companyId, details: "Configuração tributária atualizada" });
    return { ok: true };
  }),

  // ─────────────────── DRE ───────────────────

  getDRE: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "anual"]).default("mensal"),
    obraId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);

    let dataCond = "";
    const [ano, mes] = input.periodo.split("-");
    if (input.tipoPeriodo === "mensal") {
      dataCond = `AND TO_CHAR(data_competencia,'YYYY-MM')='${input.periodo}'`;
    } else if (input.tipoPeriodo === "trimestral") {
      const mesN = parseInt(mes);
      const trimestreStart = Math.floor((mesN - 1) / 3) * 3 + 1;
      dataCond = `AND EXTRACT(YEAR FROM data_competencia)=${ano}
        AND EXTRACT(MONTH FROM data_competencia) BETWEEN ${trimestreStart} AND ${trimestreStart + 2}`;
    } else {
      dataCond = `AND EXTRACT(YEAR FROM data_competencia)=${ano}`;
    }

    const obraCond = input.obraId ? `AND obra_id=${input.obraId}` : "";
    const receitaBruta = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(valor_realizado,valor_previsto)),0) AS total
       FROM financial_entries WHERE company_id=ANY($1::int[]) AND tipo='receita' ${dataCond} ${obraCond} AND status NOT IN ('cancelado')`,
      [ids]
    );
    const deducoes = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(valor_realizado,valor_previsto)),0) AS total
       FROM financial_entries WHERE company_id=ANY($1::int[]) AND tipo='imposto' ${dataCond} ${obraCond} AND status NOT IN ('cancelado')`,
      [ids]
    );
    const custoObra = await db.execute(
      `SELECT fa.classificacao_dre, COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id=ANY($1::int[]) AND fe.tipo='despesa' AND fa.tipo='custo_obra' ${dataCond} ${obraCond} AND fe.status NOT IN ('cancelado')
       GROUP BY fa.classificacao_dre`,
      [ids]
    );
    const despFixa = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id=ANY($1::int[]) AND fe.tipo='despesa' AND fa.tipo='despesa_fixa' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      [ids]
    );
    const despVar = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id=ANY($1::int[]) AND fe.tipo='despesa' AND fa.tipo='despesa_variavel' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      [ids]
    );
    const despFin = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id=ANY($1::int[]) AND fe.tipo='despesa' AND fa.tipo='despesa_financeira' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      [ids]
    );
    const recFin = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id=ANY($1::int[]) AND fe.tipo='receita' AND fa.tipo='receita_financeira' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      [ids]
    );
    const impostos = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id=ANY($1::int[]) AND fa.tipo='imposto_resultado' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      [ids]
    );

    const rb = Number(rows(receitaBruta)[0]?.total ?? 0);
    const ded = Number(rows(deducoes)[0]?.total ?? 0);
    const co = Number(rows(custoObra)[0]?.total ?? 0);
    const df = Number(rows(despFixa)[0]?.total ?? 0);
    const dv = Number(rows(despVar)[0]?.total ?? 0);
    const dfin = Number(rows(despFin)[0]?.total ?? 0);
    const rfin = Number(rows(recFin)[0]?.total ?? 0);
    const imp = Number(rows(impostos)[0]?.total ?? 0);

    const rl = rb - ded;
    const lucBruto = rl - co;
    const ebitda = lucBruto - df - dv;
    const ebit = ebitda;
    const laJir = ebit + rfin - dfin;
    const lucroLiq = laJir - imp;

    return {
      periodo: input.periodo,
      tipoPeriodo: input.tipoPeriodo,
      receitaBruta: rb,
      deducoes: ded,
      receitaLiquida: rl,
      custosObra: co,
      lucroBruto: lucBruto,
      margemBruta: rl > 0 ? (lucBruto / rl) * 100 : 0,
      despesasFixas: df,
      despesasVariaveis: dv,
      ebitda: ebitda,
      margemEbitda: rl > 0 ? (ebitda / rl) * 100 : 0,
      receitasFinanceiras: rfin,
      despesasFinanceiras: dfin,
      resultadoFinanceiro: rfin - dfin,
      lair: laJir,
      impostos: imp,
      lucroLiquido: lucroLiq,
      margemLiquida: rl > 0 ? (lucroLiq / rl) * 100 : 0,
    };
  }),

  // ─────────────────── FLUXO DE CAIXA ───────────────────

  getCashFlow: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    dataInicio: z.string(),
    dataFim: z.string(),
    obraId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const obraCond = input.obraId ? `AND obra_id=${input.obraId}` : "";
    const res = await db.execute(
      `SELECT TO_CHAR(COALESCE(data_pagamento,data_vencimento,data_competencia),'YYYY-MM-DD') AS data,
              tipo, natureza, status,
              COALESCE(valor_realizado,valor_previsto) AS valor,
              descricao, conta_nome AS "contaNome", obra_nome AS "obraNome"
       FROM financial_entries
       WHERE company_id=ANY($1::int[])
         AND COALESCE(data_pagamento,data_vencimento,data_competencia) BETWEEN $2 AND $3
         AND status NOT IN ('cancelado')
         ${obraCond}
       ORDER BY COALESCE(data_pagamento,data_vencimento,data_competencia) ASC`,
      [ids, input.dataInicio, input.dataFim]
    );
    const lancamentos = rows(res);

    // agrupa por data
    const byDate: Record<string, { entradas: number; saidas: number; items: any[] }> = {};
    for (const l of lancamentos) {
      if (!byDate[l.data]) byDate[l.data] = { entradas: 0, saidas: 0, items: [] };
      const valor = Number(l.valor ?? 0);
      if (l.tipo === "receita") byDate[l.data].entradas += valor;
      else byDate[l.data].saidas += valor;
      byDate[l.data].items.push(l);
    }

    const dias = Object.keys(byDate).sort();
    let saldoAcumulado = 0;
    const resultado = dias.map(d => {
      const { entradas, saidas, items } = byDate[d];
      saldoAcumulado += entradas - saidas;
      return { data: d, entradas, saidas, saldoLiquido: entradas - saidas, saldoAcumulado, items };
    });

    const totalEntradas = resultado.reduce((a, r) => a + r.entradas, 0);
    const totalSaidas = resultado.reduce((a, r) => a + r.saidas, 0);

    return { dias: resultado, totalEntradas, totalSaidas, saldoFinal: totalEntradas - totalSaidas };
  }),

  // ─────────────────── CENTROS DE CUSTO ───────────────────

  getCostCenters: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", codigo, nome, tipo, obra_id AS "obraId",
              responsavel_nome AS "responsavelNome", orcamento_mensal AS "orcamentoMensal", ativo
       FROM financial_cost_centers WHERE company_id=ANY($1::int[]) AND ativo=1 ORDER BY codigo ASC`,
      [ids]
    );
    return rows(res);
  }),

  createCostCenter: protectedProcedure.input(z.object({
    companyId: z.number(),
    codigo: z.string().min(1),
    nome: z.string().min(2),
    tipo: z.string(),
    obraId: z.number().optional(),
    responsavelNome: z.string().optional(),
    orcamentoMensal: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `INSERT INTO financial_cost_centers (company_id, codigo, nome, tipo, obra_id, responsavel_nome, orcamento_mensal, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1) RETURNING id`,
      [input.companyId, input.codigo, input.nome, input.tipo, input.obraId ?? null,
       input.responsavelNome ?? null, input.orcamentoMensal ?? null]
    );
    return { id: rows(res)[0]?.id };
  }),

  // ─────────────────── MEDIÇÕES DE OBRA ───────────────────

  getMedicoes: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds: string[] = [`company_id=$1`];
    const vals: any[] = [input.companyId];
    let i = 2;
    if (input.obraId) { conds.push(`obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", obra_id AS "obraId", numero, data_referencia AS "dataReferencia",
              percentual_acumulado AS "percentualAcumulado", percentual_periodo AS "percentualPeriodo",
              valor_contrato AS "valorContrato", valor_medicao AS "valorMedicao",
              valor_acumulado AS "valorAcumulado", status, aprovado_por_id AS "aprovadoPorId",
              revenue_id AS "revenueId", observacoes, created_at AS "createdAt"
       FROM obra_medicoes WHERE ${conds.join(" AND ")} ORDER BY numero DESC`,
      vals
    );
    return rows(res);
  }),

  createMedicao: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    numero: z.number(),
    dataReferencia: z.string(),
    percentualPeriodo: z.number().optional(),
    percentualAcumulado: z.number().optional(),
    valorContrato: z.number().optional(),
    valorMedicao: z.number(),
    valorAcumulado: z.number().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `INSERT INTO obra_medicoes (company_id, obra_id, numero, data_referencia, percentual_periodo,
       percentual_acumulado, valor_contrato, valor_medicao, valor_acumulado, status, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'rascunho',$10,NOW(),NOW()) RETURNING id`,
      [input.companyId, input.obraId, input.numero, input.dataReferencia,
       input.percentualPeriodo ?? null, input.percentualAcumulado ?? null,
       input.valorContrato ?? null, input.valorMedicao, input.valorAcumulado ?? null,
       input.observacoes ?? null]
    );
    return { id: rows(res)[0]?.id };
  }),

  // ─────────────────── CONTAS BANCÁRIAS ───────────────────

  getBankAccounts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", banco, agencia, conta, tipo, descricao,
              saldo_atual AS "saldoAtual", ativo
       FROM company_bank_accounts WHERE company_id=ANY($1::int[]) ORDER BY banco ASC`,
      [ids]
    );
    return rows(res);
  }),

  // ─────────────────── SÓCIOS / PRÓ-LABORE ───────────────────

  getPartners: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `SELECT id, company_id AS "companyId", nome, cpf, cargo,
              percentual_sociedade AS "percentualSociedade",
              valor_pro_labore AS "valorProLabore",
              dia_vencimento AS "diaVencimento", pix_chave AS "pixChave", ativo
       FROM company_partners WHERE company_id=$1 AND ativo=1 ORDER BY nome ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  createPartner: protectedProcedure.input(z.object({
    companyId: z.number(),
    nome: z.string().min(2),
    cpf: z.string().optional(),
    cargo: z.string().optional(),
    percentualSociedade: z.number().optional(),
    valorProLabore: z.number().optional(),
    diaVencimento: z.number().default(5),
    pixChave: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `INSERT INTO company_partners (company_id, nome, cpf, cargo, percentual_sociedade, valor_pro_labore, dia_vencimento, pix_chave, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING id`,
      [input.companyId, input.nome, input.cpf ?? null, input.cargo ?? null,
       input.percentualSociedade ?? null, input.valorProLabore ?? null,
       input.diaVencimento, input.pixChave ?? null]
    );
    return { id: rows(res)[0]?.id };
  }),

  updatePartner: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    nome: z.string().optional(),
    cpf: z.string().optional(),
    cargo: z.string().optional(),
    percentualSociedade: z.number().optional(),
    valorProLabore: z.number().optional(),
    diaVencimento: z.number().optional(),
    pixChave: z.string().optional(),
    ativo: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const parts: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const map: Record<string, string> = {
      nome: "nome", cpf: "cpf", cargo: "cargo",
      percentualSociedade: "percentual_sociedade", valorProLabore: "valor_pro_labore",
      diaVencimento: "dia_vencimento", pixChave: "pix_chave",
    };
    for (const [k, col] of Object.entries(map)) {
      if ((input as any)[k] !== undefined) { parts.push(`${col}=$${i++}`); vals.push((input as any)[k]); }
    }
    if (input.ativo !== undefined) { parts.push(`ativo=$${i++}`); vals.push(input.ativo ? 1 : 0); }
    if (!parts.length) return { ok: true };
    vals.push(input.id, input.companyId);
    await db.execute(`UPDATE company_partners SET ${parts.join(",")}, updated_at=NOW() WHERE id=$${i++} AND company_id=$${i}`, vals);
    return { ok: true };
  }),

  // ─────────────────── ORÇAMENTO ANUAL ───────────────────

  getBudget: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
    obraId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds = [`company_id=$1`, `ano=$2`];
    const vals: any[] = [input.companyId, input.ano];
    if (input.obraId) { conds.push(`obra_id=$3`); vals.push(input.obraId); }
    const res = await db.execute(
      `SELECT b.id, b.ano, b.mes, b.conta_id AS "contaId", b.obra_id AS "obraId",
              b.valor_orcado AS "valorOrcado", b.observacoes,
              fa.nome AS "contaNome", fa.tipo AS "contaTipo"
       FROM financial_budget b
       LEFT JOIN financial_accounts fa ON fa.id=b.conta_id
       WHERE ${conds.join(" AND ")} ORDER BY b.mes ASC, fa.ordem ASC`,
      vals
    );
    return rows(res);
  }),

  upsertBudget: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
    mes: z.number(),
    contaId: z.number().optional(),
    obraId: z.number().optional(),
    valorOrcado: z.number(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = await db.execute(
      `SELECT id FROM financial_budget WHERE company_id=$1 AND ano=$2 AND mes=$3 AND (conta_id=$4 OR ($4 IS NULL AND conta_id IS NULL)) LIMIT 1`,
      [input.companyId, input.ano, input.mes, input.contaId ?? null]
    );
    if (rows(existing).length > 0) {
      await db.execute(
        `UPDATE financial_budget SET valor_orcado=$1, observacoes=COALESCE($2,observacoes), updated_at=NOW()
         WHERE company_id=$3 AND ano=$4 AND mes=$5 AND (conta_id=$6 OR ($6 IS NULL AND conta_id IS NULL))`,
        [input.valorOrcado, input.observacoes ?? null, input.companyId, input.ano, input.mes, input.contaId ?? null]
      );
    } else {
      await db.execute(
        `INSERT INTO financial_budget (company_id, ano, mes, conta_id, obra_id, valor_orcado, observacoes, criado_por_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.companyId, input.ano, input.mes, input.contaId ?? null, input.obraId ?? null,
         input.valorOrcado, input.observacoes ?? null, ctx.user?.id ?? null]
      );
    }
    return { ok: true };
  }),

  // ─────────────────── AUTO-IMPORTAÇÃO ───────────────────

  runAutoImport: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesCompetencia: z.string().optional(),
  })).mutation(async ({ input }) => {
    const result = await runAllAutoImports(input.companyId, input.mesCompetencia);
    return result;
  }),

  // ─────────────────── CONCILIAÇÃO BANCÁRIA ───────────────────

  getBankStatements: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    conciliado: z.boolean().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds = [`company_id=$1`, `conta_bancaria_id=$2`];
    const vals: any[] = [input.companyId, input.contaBancariaId];
    let i = 3;
    if (input.dataInicio) { conds.push(`data>=$${i++}`); vals.push(input.dataInicio); }
    if (input.dataFim) { conds.push(`data<=$${i++}`); vals.push(input.dataFim); }
    if (input.conciliado !== undefined) { conds.push(`conciliado=$${i++}`); vals.push(input.conciliado ? 1 : 0); }
    const res = await db.execute(
      `SELECT id, data, descricao, valor, tipo, saldo_apos AS "saldoApos", conciliado, entry_id AS "entryId"
       FROM bank_statement_lines WHERE ${conds.join(" AND ")} ORDER BY data DESC, id DESC`,
      vals
    );
    return rows(res);
  }),

  conciliarLancamento: protectedProcedure.input(z.object({
    statementLineId: z.number(),
    entryId: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.execute(
      `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1 WHERE id=$2 AND company_id=$3`,
      [input.entryId, input.statementLineId, input.companyId]
    );
    await db.execute(
      `UPDATE financial_entries SET conciliado=1, data_conciliacao=CURRENT_DATE WHERE id=$1 AND company_id=$2`,
      [input.entryId, input.companyId]
    );
    return { ok: true };
  }),

  // ─────────────────── RÉGUA DE COBRANÇA ───────────────────

  getCollectionRules: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await db.execute(
      `SELECT id, nome, dias_atraso_1 AS "diasAtraso1", mensagem_1 AS "mensagem1",
              dias_atraso_2 AS "diasAtraso2", mensagem_2 AS "mensagem2",
              dias_atraso_3 AS "diasAtraso3", mensagem_3 AS "mensagem3",
              dias_atraso_4 AS "diasAtraso4", mensagem_4 AS "mensagem4",
              enviar_email AS "enviarEmail", ativo
       FROM collection_rules WHERE company_id=$1 AND ativo=1 ORDER BY id ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  upsertCollectionRule: protectedProcedure.input(z.object({
    id: z.number().optional(),
    companyId: z.number(),
    nome: z.string().optional(),
    diasAtraso1: z.number().default(3),
    mensagem1: z.string().optional(),
    diasAtraso2: z.number().default(10),
    mensagem2: z.string().optional(),
    diasAtraso3: z.number().default(30),
    mensagem3: z.string().optional(),
    diasAtraso4: z.number().default(60),
    mensagem4: z.string().optional(),
    enviarEmail: z.boolean().default(true),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.id) {
      await db.execute(
        `UPDATE collection_rules SET nome=$1,dias_atraso_1=$2,mensagem_1=$3,dias_atraso_2=$4,mensagem_2=$5,
         dias_atraso_3=$6,mensagem_3=$7,dias_atraso_4=$8,mensagem_4=$9,enviar_email=$10
         WHERE id=$11 AND company_id=$12`,
        [input.nome ?? null, input.diasAtraso1, input.mensagem1 ?? null,
         input.diasAtraso2, input.mensagem2 ?? null, input.diasAtraso3, input.mensagem3 ?? null,
         input.diasAtraso4, input.mensagem4 ?? null, input.enviarEmail ? 1 : 0, input.id, input.companyId]
      );
    } else {
      await db.execute(
        `INSERT INTO collection_rules (company_id, nome, dias_atraso_1, mensagem_1, dias_atraso_2, mensagem_2,
         dias_atraso_3, mensagem_3, dias_atraso_4, mensagem_4, enviar_email, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)`,
        [input.companyId, input.nome ?? null, input.diasAtraso1, input.mensagem1 ?? null,
         input.diasAtraso2, input.mensagem2 ?? null, input.diasAtraso3, input.mensagem3 ?? null,
         input.diasAtraso4, input.mensagem4 ?? null, input.enviarEmail ? 1 : 0]
      );
    }
    return { ok: true };
  }),

  // ─────────────────── A RECEBER / A PAGAR RESUMO ───────────────────

  getContasAReceber: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    vencimentoAte: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds = [`company_id=ANY($1::int[])`, `tipo='receita'`, `status IN ('a_receber','recebido_parcial')`];
    const vals: any[] = [ids];
    let i = 2;
    if (input.vencimentoAte) { conds.push(`data_vencimento<=$${i++}`); vals.push(input.vencimentoAte); }
    const res = await db.execute(
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              valor_previsto AS "valorPrevisto", valor_realizado AS "valorRealizado",
              data_vencimento AS "dataVencimento", status,
              CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries WHERE ${conds.join(" AND ")} ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),

  getContasAPagar: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    vencimentoAte: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds = [`company_id=ANY($1::int[])`, `tipo='despesa'`, `status='a_pagar'`];
    const vals: any[] = [ids];
    let i = 2;
    if (input.vencimentoAte) { conds.push(`data_vencimento<=$${i++}`); vals.push(input.vencimentoAte); }
    const res = await db.execute(
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              conta_nome AS "contaNome", valor_previsto AS "valorPrevisto",
              data_vencimento AS "dataVencimento",
              CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries WHERE ${conds.join(" AND ")} ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),
});
