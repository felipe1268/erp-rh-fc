import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import { resolveCompanyIds } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { seedPlanoDeConta, ensureTaxConfig } from "../services/financialSeedAccounts";
import { runAllAutoImports } from "../services/financialAutoImport";
import {
  runAllDespesasImport,
  runAllReceitasImport,
  verificarImpactoFinanceiro,
  solicitarAprovacaoPorAlcada,
  rollbackFinanceiroPorOrigem,
  sincronizarStatusPagamento,
  gerarAlertasVencimento,
  importAllMedicoesPrevistaToFinancial,
  importAtividadesCronogramaToFinancial,
} from "../services/financialIntegrationBridge";
import {
  calcularKpis,
  calcularDRE,
  projetarFluxoCaixa90Dias,
  gerarEFDReinf,
} from "../services/financialKpiService";
import { runFinancialJobNow } from "../services/financialAutoImportJob";

// ============================================================
// MÓDULO FINANCEIRO — Router tRPC
// ============================================================

function rows(res: any): any[] {
  return (res as any)?.rows ?? (res as any) ?? [];
}

// Executa queries parametrizadas corretamente no Drizzle ORM
// dbExecute(db, string, array) ignora o array — é preciso usar sql template
async function dbExecute(db: any, query: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const paramVal = params[i - 1];
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${paramVal}${sql.raw(tail)}` : sql`${built}${paramVal}`;
  }
  const res = await db.execute(built);
  const rowsArr: any[] = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  return { rows: rowsArr };
}


// Safe inline of integer IDs to avoid pg-driver array literal issues
function inlineIds(ids: number[]): string {
  if (!ids || !ids.length) return "0";
  return ids.map(Number).join(",");
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
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", codigo, nome, tipo, natureza, nivel,
              conta_pai_id AS "contaPaiId", classificacao_dre AS "classificacaoDRE",
              ativo, ordem
       FROM financial_accounts
       WHERE company_id IN (${inlineIds(ids)}) ${ativoPart} ${tipoPart}
              ORDER BY ordem ASC, codigo ASC`,
      []
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
    const res = await dbExecute(db, 
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
    await dbExecute(db, `UPDATE financial_accounts SET ${parts.join(",")} WHERE id=$${i++} AND company_id=$${i}`, vals);
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
    const conds: string[] = [`e.company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.obraId) { conds.push(`e.obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.tipo) { conds.push(`e.tipo=$${i++}`); vals.push(input.tipo); }
    if (input.status) { conds.push(`e.status=$${i++}`); vals.push(input.status); }
    if (input.mesCompetencia) { conds.push(`TO_CHAR(e.data_competencia,'YYYY-MM')=$${i++}`); vals.push(input.mesCompetencia); }
    if (input.dataInicio) { conds.push(`e.data_competencia>=$${i++}`); vals.push(input.dataInicio); }
    if (input.dataFim) { conds.push(`e.data_competencia<=$${i++}`); vals.push(input.dataFim); }
    if (input.origemModulo) { conds.push(`e.origem_modulo=$${i++}`); vals.push(input.origemModulo); }
    vals.push(input.limit, input.offset);
    const res = await dbExecute(db, 
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
    const countRes = await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    await dbExecute(db, 
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
    await dbExecute(db, 
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
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_realizado),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('recebido','pago')
           AND TO_CHAR(data_competencia,'YYYY-MM')=$1`,
        [mes]
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_realizado),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido')
           AND TO_CHAR(data_competencia,'YYYY-MM')=$1`,
        [mes]
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status='a_receber'`,
        []
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status='a_pagar'`,
        []
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND status IN ('a_pagar','a_receber')
           AND data_vencimento < CURRENT_DATE`,
        []
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
    // Monta IN clause diretamente (ids são integers — sem risco de injection)
    const idList = ids.map(Number).join(",");
    const conds: string[] = [`company_id IN (${idList})`];
    const vals: any[] = [];
    let i = 1;
    if (input.obraId) { conds.push(`obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    vals.push(input.limit, input.offset);
    const res = await dbExecute(db, 
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
    const res = await dbExecute(db, 
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

    // Criar automaticamente um financial_entry tipo='receita' para aparecer no Contas a Receber
    if (id) {
      const mesComp = input.dataVencimento
        ? input.dataVencimento.substring(0, 7)
        : new Date().toISOString().substring(0, 7);
      const obraInfo = input.obraNome ?? `Obra ${input.obraId}`;
      const clienteInfo = input.clienteNome ? ` — ${input.clienteNome}` : "";
      const medicaoInfo = input.medicaoNumero ? ` #${input.medicaoNumero}` : "";
      await dbExecute(db, 
        `INSERT INTO financial_entries
         (company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
          valor_previsto, data_competencia, data_vencimento, status,
          origem_modulo, origem_id, origem_descricao, descricao, created_at, updated_at)
         VALUES ($1,$2,$3,'Faturamento de Obras','receita','variavel',
                 $4, $5::date, $6::date, 'a_receber',
                 'revenue', $7, $8, $9, NOW(), NOW())`,
        [
          input.companyId, input.obraId, obraInfo,
          vlq > 0 ? vlq : input.valorMedicao,
          mesComp + "-01",
          input.dataVencimento ?? mesComp + "-30",
          id,
          `Medição${medicaoInfo} — ${obraInfo}${clienteInfo}`,
          `Faturamento${medicaoInfo}: ${obraInfo}`,
        ]
      );
    }

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
    await dbExecute(db, 
      `UPDATE financial_revenue
       SET status=$1, nf_numero=COALESCE($2,nf_numero), nf_emitida_em=COALESCE($3,nf_emitida_em),
           data_recebimento=COALESCE($4,data_recebimento), valor_recebido=COALESCE($5,valor_recebido),
           forma_pagamento=COALESCE($6,forma_pagamento), updated_at=NOW()
       WHERE id=$7 AND company_id=$8`,
      [input.status, input.nfNumero ?? null, input.nfEmitidaEm ?? null,
       input.dataRecebimento ?? null, input.valorRecebido ?? null,
       input.formaPagamento ?? null, input.id, input.companyId]
    );

    // Sincronizar status no financial_entry correspondente
    const entryStatusMap: Record<string, string> = {
      a_faturar: "a_receber",
      faturado: "a_receber",
      a_receber: "a_receber",
      recebido_parcial: "recebido_parcial",
      recebido_total: "recebido",
      cancelado: "cancelado",
    };
    const entryStatus = entryStatusMap[input.status] ?? "a_receber";
    await dbExecute(db, 
      `UPDATE financial_entries
       SET status=$1,
           valor_realizado=CASE WHEN $2::numeric > 0 THEN $2::numeric ELSE valor_realizado END,
           data_pagamento=COALESCE($3, data_pagamento),
           updated_at=NOW()
       WHERE origem_modulo='revenue' AND origem_id=$4 AND company_id=$5`,
      [entryStatus, input.valorRecebido ?? 0, input.dataRecebimento ?? null, input.id, input.companyId]
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
    const conds: string[] = [`company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.mesCompetencia) { conds.push(`mes_competencia=$${i++}`); vals.push(input.mesCompetencia); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    if (input.tipo) { conds.push(`tipo=$${i++}`); vals.push(input.tipo); }
    const res = await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    await dbExecute(db, 
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
    const receitaBruta = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(valor_realizado,valor_previsto)),0) AS total
       FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' ${dataCond} ${obraCond} AND status NOT IN ('cancelado')`,
      []
    );
    const deducoes = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(valor_realizado,valor_previsto)),0) AS total
       FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='imposto' ${dataCond} ${obraCond} AND status NOT IN ('cancelado')`,
      []
    );
    const custoObra = await dbExecute(db, 
      `SELECT fa.classificacao_dre, COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id IN (${inlineIds(ids)}) AND fe.tipo='despesa' AND fa.tipo='custo_obra' ${dataCond} ${obraCond} AND fe.status NOT IN ('cancelado')
              GROUP BY fa.classificacao_dre`,
      []
    );
    const despFixa = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id IN (${inlineIds(ids)}) AND fe.tipo='despesa' AND fa.tipo='despesa_fixa' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      []
    );
    const despVar = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id IN (${inlineIds(ids)}) AND fe.tipo='despesa' AND fa.tipo='despesa_variavel' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      []
    );
    const despFin = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id IN (${inlineIds(ids)}) AND fe.tipo='despesa' AND fa.tipo='despesa_financeira' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      []
    );
    const recFin = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id IN (${inlineIds(ids)}) AND fe.tipo='receita' AND fa.tipo='receita_financeira' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      []
    );
    const impostos = await dbExecute(db, 
      `SELECT COALESCE(SUM(COALESCE(fe.valor_realizado,fe.valor_previsto)),0) AS total
       FROM financial_entries fe
       LEFT JOIN financial_accounts fa ON fa.id=fe.conta_id
       WHERE fe.company_id IN (${inlineIds(ids)}) AND fa.tipo='imposto_resultado' ${dataCond} AND fe.status NOT IN ('cancelado')`,
      []
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
    const res = await dbExecute(db, 
      `SELECT TO_CHAR(COALESCE(data_pagamento,data_vencimento,data_competencia),'YYYY-MM-DD') AS data,
              tipo, natureza, status,
              COALESCE(valor_realizado,valor_previsto) AS valor,
              descricao, conta_nome AS "contaNome", obra_nome AS "obraNome"
       FROM financial_entries
       WHERE company_id IN (${inlineIds(ids)})
         AND COALESCE(data_pagamento,data_vencimento,data_competencia) BETWEEN $1 AND $2
         AND status NOT IN ('cancelado')
         ${obraCond}
       ORDER BY COALESCE(data_pagamento,data_vencimento,data_competencia) ASC`,
      [input.dataInicio, input.dataFim]
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
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", codigo, nome, tipo, obra_id AS "obraId",
              responsavel_nome AS "responsavelNome", orcamento_mensal AS "orcamentoMensal", ativo
       FROM financial_cost_centers WHERE company_id IN (${inlineIds(ids)}) AND ativo=1 ORDER BY codigo ASC`,
      []
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
    const res = await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    const res = await dbExecute(db, 
      `SELECT id, "companyId", banco, "codigoBanco", agencia, conta,
              "tipoConta" AS tipo, apelido AS descricao, ativo
       FROM company_bank_accounts WHERE "companyId" IN (${inlineIds(ids)}) ORDER BY banco ASC`,
      []
    );
    return rows(res);
  }),

  // ─────────────────── SÓCIOS / PRÓ-LABORE ───────────────────

  getPartners: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    await dbExecute(db, `UPDATE company_partners SET ${parts.join(",")}, updated_at=NOW() WHERE id=$${i++} AND company_id=$${i}`, vals);
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
    const res = await dbExecute(db, 
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
    const existing = await dbExecute(db, 
      `SELECT id FROM financial_budget WHERE company_id=$1 AND ano=$2 AND mes=$3 AND (conta_id=$4 OR ($4 IS NULL AND conta_id IS NULL)) LIMIT 1`,
      [input.companyId, input.ano, input.mes, input.contaId ?? null]
    );
    if (rows(existing).length > 0) {
      await dbExecute(db, 
        `UPDATE financial_budget SET valor_orcado=$1, observacoes=COALESCE($2,observacoes), updated_at=NOW()
         WHERE company_id=$3 AND ano=$4 AND mes=$5 AND (conta_id=$6 OR ($6 IS NULL AND conta_id IS NULL))`,
        [input.valorOrcado, input.observacoes ?? null, input.companyId, input.ano, input.mes, input.contaId ?? null]
      );
    } else {
      await dbExecute(db, 
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
    const res = await dbExecute(db, 
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
    await dbExecute(db, 
      `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1 WHERE id=$2 AND company_id=$3`,
      [input.entryId, input.statementLineId, input.companyId]
    );
    await dbExecute(db, 
      `UPDATE financial_entries SET conciliado=1, data_conciliacao=CURRENT_DATE WHERE id=$1 AND company_id=$2`,
      [input.entryId, input.companyId]
    );
    return { ok: true };
  }),

  // ─────────────────── RÉGUA DE COBRANÇA ───────────────────

  getCollectionRules: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
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
      await dbExecute(db, 
        `UPDATE collection_rules SET nome=$1,dias_atraso_1=$2,mensagem_1=$3,dias_atraso_2=$4,mensagem_2=$5,
         dias_atraso_3=$6,mensagem_3=$7,dias_atraso_4=$8,mensagem_4=$9,enviar_email=$10
         WHERE id=$11 AND company_id=$12`,
        [input.nome ?? null, input.diasAtraso1, input.mensagem1 ?? null,
         input.diasAtraso2, input.mensagem2 ?? null, input.diasAtraso3, input.mensagem3 ?? null,
         input.diasAtraso4, input.mensagem4 ?? null, input.enviarEmail ? 1 : 0, input.id, input.companyId]
      );
    } else {
      await dbExecute(db, 
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

  getDashboardExecutivo: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    mesCompetencia: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.mesCompetencia ?? new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().split("T")[0];
    const [year, month] = mes.split("-").map(Number);
    const mesAnterior = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;

    const [
      receitaMesRes, despesaMesRes,
      receitaMesAntRes, despesaMesAntRes,
      aReceberRes, aPagarRes,
      vencidosRecRes, vencidosPagRes,
      bancosRes,
      evolucaoRes,
      topDespesasRes,
      proxVencimentosRes,
      receitaPorObraRes,
    ] = await Promise.all([
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('recebido','pago') AND TO_CHAR(data_competencia,'YYYY-MM')=$1`, [mes]),
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido') AND TO_CHAR(data_competencia,'YYYY-MM')=$1`, [mes]),
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('recebido','pago') AND TO_CHAR(data_competencia,'YYYY-MM')=$1`, [mesAnterior]),
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido') AND TO_CHAR(data_competencia,'YYYY-MM')=$1`, [mesAnterior]),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('a_receber','recebido_parcial')`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status='a_pagar'`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('a_receber','recebido_parcial') AND data_vencimento < $1`, [today]),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status='a_pagar' AND data_vencimento < $1`, [today]),
      dbExecute(db, `SELECT id, banco, agencia, conta, "tipoConta" AS tipo, apelido AS descricao FROM company_bank_accounts WHERE "companyId" IN (${inlineIds(ids)}) AND ativo=1 ORDER BY banco ASC`, []),
      dbExecute(db, `
        SELECT TO_CHAR(data_competencia, 'YYYY-MM-DD') AS dia,
               SUM(CASE WHEN tipo='receita' AND status IN ('recebido','pago') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS entradas,
               SUM(CASE WHEN tipo='despesa' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS saidas
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND data_competencia >= (CURRENT_DATE - INTERVAL '30 days') AND status IN ('pago','recebido')
                GROUP BY TO_CHAR(data_competencia, 'YYYY-MM-DD')
                ORDER BY dia ASC`, []),
      dbExecute(db, `
        SELECT conta_nome AS "categoria", SUM(COALESCE(valor_realizado, valor_previsto)) AS total
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido') AND TO_CHAR(data_competencia,'YYYY-MM')=        
                GROUP BY conta_nome ORDER BY total DESC LIMIT 8`, [mes]),
      dbExecute(db, `
        SELECT id, descricao, obra_nome AS "obraNome", valor_previsto AS "valor", data_vencimento AS "vencimento", tipo,
               CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND status IN ('a_pagar','a_receber','recebido_parcial')
                ORDER BY data_vencimento ASC LIMIT 15`, []),
      dbExecute(db, `
        SELECT obra_nome AS "obraNome", obra_id AS "obraId",
               SUM(CASE WHEN tipo='receita' AND status IN ('recebido','pago') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS receita,
               SUM(CASE WHEN tipo='despesa' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS despesa
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND obra_id IS NOT NULL AND TO_CHAR(data_competencia,'YYYY-MM')=        
                GROUP BY obra_nome, obra_id ORDER BY receita DESC LIMIT 10`, [mes]),
    ]);

    const rec = Number(rows(receitaMesRes)[0]?.total ?? 0);
    const desp = Number(rows(despesaMesRes)[0]?.total ?? 0);
    const recAnt = Number(rows(receitaMesAntRes)[0]?.total ?? 0);
    const despAnt = Number(rows(despesaMesAntRes)[0]?.total ?? 0);
    const aReceber = Number(rows(aReceberRes)[0]?.total ?? 0);
    const aPagar = Number(rows(aPagarRes)[0]?.total ?? 0);
    const vencRec = Number(rows(vencidosRecRes)[0]?.total ?? 0);
    const vencPag = Number(rows(vencidosPagRes)[0]?.total ?? 0);

    const openingRes = await dbExecute(db, 
      `SELECT conta_bancaria_id, COALESCE(SUM(valor),0) AS total
       FROM financial_opening_balances WHERE company_id IN (${inlineIds(ids)}) GROUP BY conta_bancaria_id`, []
    );
    const openingMap: Record<number, number> = {};
    rows(openingRes).forEach((r: any) => { openingMap[r.conta_bancaria_id] = Number(r.total ?? 0); });

    const bancos = rows(bancosRes).map((b: any) => {
      const saldoAbertura = openingMap[b.id] ?? 0;
      return { ...b, descricao: b.descricao || b.banco, saldoAtual: saldoAbertura };
    });
    const saldoConsolidado = bancos.reduce((s: number, b: any) => s + b.saldoAtual, 0);

    const compromissos30d = aPagar;
    const caixaLivre = saldoConsolidado - compromissos30d;

    const varReceita = recAnt > 0 ? ((rec - recAnt) / recAnt) * 100 : 0;
    const varDespesa = despAnt > 0 ? ((desp - despAnt) / despAnt) * 100 : 0;

    return {
      kpis: {
        receitaMes: rec, despesaMes: desp, resultadoMes: rec - desp,
        receitaMesAnterior: recAnt, despesaMesAnterior: despAnt,
        varReceita, varDespesa,
        totalAReceber: aReceber, qtdAReceber: Number(rows(aReceberRes)[0]?.qtd ?? 0),
        totalAPagar: aPagar, qtdAPagar: Number(rows(aPagarRes)[0]?.qtd ?? 0),
        vencidosReceber: vencRec, qtdVencidosReceber: Number(rows(vencidosRecRes)[0]?.qtd ?? 0),
        vencidosPagar: vencPag, qtdVencidosPagar: Number(rows(vencidosPagRes)[0]?.qtd ?? 0),
        saldoConsolidado, caixaLivre,
        margemOperacional: rec > 0 ? ((rec - desp) / rec) * 100 : 0,
      },
      bancos,
      evolucaoDiaria: rows(evolucaoRes).map((r: any) => ({
        dia: r.dia, entradas: Number(r.entradas ?? 0), saidas: Number(r.saidas ?? 0),
      })),
      topDespesas: rows(topDespesasRes).map((r: any) => ({ categoria: r.categoria ?? "Sem categoria", total: Number(r.total ?? 0) })),
      proxVencimentos: rows(proxVencimentosRes).map((r: any) => ({
        id: r.id, descricao: r.descricao, obraNome: r.obraNome, valor: Number(r.valor ?? 0),
        vencimento: r.vencimento, tipo: r.tipo, diasAtraso: Number(r.diasAtraso ?? 0),
      })),
      resultadoPorObra: rows(receitaPorObraRes).map((r: any) => ({
        obraId: r.obraId, obraNome: r.obraNome ?? "Sem obra",
        receita: Number(r.receita ?? 0), despesa: Number(r.despesa ?? 0),
        margem: Number(r.receita ?? 0) - Number(r.despesa ?? 0),
      })),
    };
  }),

  // ─────────────────── LANÇAMENTOS RECORRENTES ───────────────────

  getRecurringEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT id, descricao, valor, tipo, natureza, conta_nome AS "contaNome",
              obra_nome AS "obraNome", frequencia, dia_vencimento AS "diaVencimento",
              forma_pagamento AS "formaPagamento", fornecedor_nome AS "fornecedorNome",
              ativo, proximo_vencimento AS "proximoVencimento",
              ultimo_gerado AS "ultimoGerado", observacoes,
              criado_por_nome AS "criadoPorNome", created_at AS "createdAt"
       FROM financial_recurring_entries WHERE company_id=$1 ORDER BY ativo DESC, descricao ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  createRecurringEntry: protectedProcedure.input(z.object({
    companyId: z.number(),
    descricao: z.string().min(2),
    valor: z.number().positive(),
    tipo: z.enum(["receita", "despesa"]).default("despesa"),
    natureza: z.string().default("fixo"),
    contaId: z.number().optional(),
    contaNome: z.string().optional(),
    obraId: z.number().optional(),
    obraNome: z.string().optional(),
    frequencia: z.enum(["mensal", "quinzenal", "semanal", "trimestral", "anual"]).default("mensal"),
    diaVencimento: z.number().min(1).max(31).default(5),
    formaPagamento: z.string().optional(),
    fornecedorNome: z.string().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(input.diaVencimento, 28));
    const res = await dbExecute(db, 
      `INSERT INTO financial_recurring_entries
        (company_id, descricao, valor, tipo, natureza, conta_id, conta_nome, obra_id, obra_nome,
         frequencia, dia_vencimento, forma_pagamento, fornecedor_nome, observacoes,
         proximo_vencimento, criado_por_id, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [input.companyId, input.descricao, input.valor, input.tipo, input.natureza,
       input.contaId ?? null, input.contaNome ?? null, input.obraId ?? null, input.obraNome ?? null,
       input.frequencia, input.diaVencimento, input.formaPagamento ?? null,
       input.fornecedorNome ?? null, input.observacoes ?? null,
       nextMonth.toISOString().split("T")[0],
       ctx.user?.id ?? null, ctx.user?.name ?? ctx.user?.email ?? null]
    );
    await createAuditLog(db, {
      userId: ctx.user?.id,
      userName: ctx.user?.name ?? ctx.user?.email,
      action: "financial_recurring_create",
      entityType: "financial_recurring_entries",
      entityId: rows(res)[0]?.id,
      details: `Recorrência criada: ${input.descricao} - ${input.valor}`,
      companyId: input.companyId,
    });
    return { id: rows(res)[0]?.id };
  }),

  updateRecurringEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    descricao: z.string().optional(),
    valor: z.number().optional(),
    tipo: z.string().optional(),
    contaNome: z.string().optional(),
    obraNome: z.string().optional(),
    frequencia: z.string().optional(),
    diaVencimento: z.number().optional(),
    formaPagamento: z.string().optional(),
    fornecedorNome: z.string().optional(),
    observacoes: z.string().optional(),
    ativo: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const fields: Record<string, string> = {
      descricao: "descricao", valor: "valor", tipo: "tipo", contaNome: "conta_nome",
      obraNome: "obra_nome", frequencia: "frequencia", diaVencimento: "dia_vencimento",
      formaPagamento: "forma_pagamento", fornecedorNome: "fornecedor_nome",
      observacoes: "observacoes", ativo: "ativo",
    };
    for (const [k, col] of Object.entries(fields)) {
      if ((input as any)[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push((input as any)[k]); }
    }
    if (sets.length === 0) return { ok: true };
    sets.push(`updated_at=NOW()`);
    vals.push(input.id, input.companyId);
    await dbExecute(db, `UPDATE financial_recurring_entries SET ${sets.join(",")} WHERE id=$${i++} AND company_id=$${i}`, vals);
    return { ok: true };
  }),

  generateRecurringEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const recRes = await dbExecute(db, 
      `SELECT * FROM financial_recurring_entries WHERE company_id=$1 AND ativo=1 AND (proximo_vencimento IS NULL OR proximo_vencimento <= $2)`,
      [input.companyId, todayStr]
    );
    const recs = rows(recRes);
    let count = 0;
    for (const rec of recs) {
      const venc = rec.proximo_vencimento ? new Date(rec.proximo_vencimento) : today;
      const vencStr = venc.toISOString().split("T")[0];
      const mesComp = vencStr.slice(0, 7);
      const existing = await dbExecute(db, 
        `SELECT id FROM financial_entries WHERE company_id=$1 AND origem_modulo='recorrente' AND origem_id=$2 AND TO_CHAR(data_vencimento,'YYYY-MM')=$3 LIMIT 1`,
        [input.companyId, rec.id, mesComp]
      );
      if (rows(existing).length > 0) continue;
      await dbExecute(db, 
        `INSERT INTO financial_entries
          (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
           valor_previsto, data_competencia, data_vencimento, status,
           origem_modulo, origem_id, origem_descricao, descricao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'recorrente',$12,$13,$14)`,
        [input.companyId, rec.obra_id, rec.obra_nome, rec.conta_id, rec.conta_nome,
         rec.tipo, rec.natureza ?? "fixo", rec.valor, vencStr, vencStr,
         rec.tipo === "receita" ? "a_receber" : "a_pagar",
         rec.id, `Recorrência: ${rec.descricao}`, rec.descricao]
      );
      let nextVenc = new Date(venc);
      if (rec.frequencia === "mensal") nextVenc.setMonth(nextVenc.getMonth() + 1);
      else if (rec.frequencia === "quinzenal") nextVenc.setDate(nextVenc.getDate() + 15);
      else if (rec.frequencia === "semanal") nextVenc.setDate(nextVenc.getDate() + 7);
      else if (rec.frequencia === "trimestral") nextVenc.setMonth(nextVenc.getMonth() + 3);
      else if (rec.frequencia === "anual") nextVenc.setFullYear(nextVenc.getFullYear() + 1);
      await dbExecute(db, 
        `UPDATE financial_recurring_entries SET proximo_vencimento=$1, ultimo_gerado=$2, updated_at=NOW() WHERE id=$3`,
        [nextVenc.toISOString().split("T")[0], todayStr, rec.id]
      );
      count++;
    }
    return { generated: count };
  }),

  // ─────────────────── IMPORTAÇÃO EXTRATO OFX/CSV ───────────────────

  importBankStatement: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    formato: z.enum(["ofx", "csv"]),
    conteudo: z.string(),
    csvSeparador: z.string().optional(),
    csvColunaData: z.number().optional(),
    csvColunaDescricao: z.number().optional(),
    csvColunaValor: z.number().optional(),
    csvColunaSaldo: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const ownerCheck = await dbExecute(db, 
      `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [input.contaBancariaId, input.companyId]
    );
    if (rows(ownerCheck).length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa" });
    }

    let lines: Array<{ data: string; descricao: string; valor: number; saldo: number | null }> = [];

    if (input.formato === "ofx") {
      const content = input.conteudo;
      const stmtTrnMatch = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi);
      if (!stmtTrnMatch || stmtTrnMatch.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma transação encontrada no arquivo OFX" });
      }
      for (const trn of stmtTrnMatch) {
        const dtposted = trn.match(/<DTPOSTED>(\d{8})/)?.[1] ?? "";
        const trnamt = trn.match(/<TRNAMT>([-\d.,]+)/)?.[1] ?? "0";
        const memo = trn.match(/<MEMO>([^<\n]+)/)?.[1]?.trim() ?? "";
        const name = trn.match(/<NAME>([^<\n]+)/)?.[1]?.trim() ?? "";
        if (!dtposted) continue;
        const y = dtposted.slice(0, 4);
        const m = dtposted.slice(4, 6);
        const d = dtposted.slice(6, 8);
        const dataStr = `${y}-${m}-${d}`;
        const valor = parseFloat(trnamt.replace(",", "."));
        lines.push({
          data: dataStr,
          descricao: memo || name || "Sem descrição",
          valor: isNaN(valor) ? 0 : valor,
          saldo: null,
        });
      }
      const balMatch = content.match(/<BALAMT>([-\d.,]+)/);
      if (balMatch && lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        lastLine.saldo = parseFloat(balMatch[1].replace(",", "."));
      }
    } else {
      const sep = input.csvSeparador ?? ";";
      const colData = input.csvColunaData ?? 0;
      const colDesc = input.csvColunaDescricao ?? 1;
      const colValor = input.csvColunaValor ?? 2;
      const colSaldo = input.csvColunaSaldo ?? -1;
      const rawLines = input.conteudo.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (let i = 1; i < rawLines.length; i++) {
        const cols = rawLines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 3) continue;
        const rawData = cols[colData] ?? "";
        let dataStr = rawData;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawData)) {
          const [dd, mm, yyyy] = rawData.split("/");
          dataStr = `${yyyy}-${mm}-${dd}`;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) continue;
        const rawValor = (cols[colValor] ?? "0").replace(/\./g, "").replace(",", ".");
        const valor = parseFloat(rawValor);
        const saldoRaw = colSaldo >= 0 ? (cols[colSaldo] ?? "") : "";
        const saldo = saldoRaw ? parseFloat(saldoRaw.replace(/\./g, "").replace(",", ".")) : null;
        lines.push({
          data: dataStr,
          descricao: cols[colDesc] ?? "Sem descrição",
          valor: isNaN(valor) ? 0 : valor,
          saldo: saldo !== null && isNaN(saldo) ? null : saldo,
        });
      }
    }

    if (lines.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma linha válida encontrada no arquivo" });
    }

    let inserted = 0;
    let skipped = 0;
    const importadoEm = new Date().toISOString();
    for (const line of lines) {
      const existing = await dbExecute(db, 
        `SELECT id FROM bank_statement_lines WHERE company_id=$1 AND conta_bancaria_id=$2 AND data=$3 AND descricao=$4 AND valor=$5 LIMIT 1`,
        [input.companyId, input.contaBancariaId, line.data, line.descricao, line.valor]
      );
      if (rows(existing).length > 0) { skipped++; continue; }
      await dbExecute(db, 
        `INSERT INTO bank_statement_lines (company_id, conta_bancaria_id, data, descricao, valor, tipo, saldo_apos, conciliado, importado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
        [input.companyId, input.contaBancariaId, line.data, line.descricao, line.valor,
         line.valor >= 0 ? "credito" : "debito", line.saldo, importadoEm]
      );
      inserted++;
    }

    await createAuditLog(db, {
      userId: ctx.user?.id,
      action: "bank_statement_import",
      details: `Importação ${input.formato.toUpperCase()}: ${inserted} inseridos, ${skipped} duplicados`,
      companyId: input.companyId,
    });

    return { inserted, skipped, total: lines.length };
  }),

  getContasAReceber: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    vencimentoAte: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds = [`company_id IN (${inlineIds(ids)})`, `tipo='receita'`, `status IN ('a_receber','recebido_parcial')`];
    const vals: any[] = [];
    let i = 1;
    if (input.vencimentoAte) { conds.push(`data_vencimento<=$${i++}`); vals.push(input.vencimentoAte); }
    const res = await dbExecute(db, 
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
    const conds = [`company_id IN (${inlineIds(ids)})`, `tipo='despesa'`, `status='a_pagar'`];
    const vals: any[] = [];
    let i = 1;
    if (input.vencimentoAte) { conds.push(`data_vencimento<=$${i++}`); vals.push(input.vencimentoAte); }
    const res = await dbExecute(db, 
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              conta_nome AS "contaNome", valor_previsto AS "valorPrevisto",
              data_vencimento AS "dataVencimento", origem_modulo AS "origemModulo",
              origem_descricao AS "origemDescricao",
              CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries WHERE ${conds.join(" AND ")} ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),

  getRevenueByYear: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const res = await dbExecute(db,
      `SELECT id, company_id AS "companyId", obra_id AS "obraId", obra_nome AS "obraNome",
              cliente_nome AS "clienteNome", cliente_cnpj AS "clienteCnpj",
              valor_contrato AS "valorContrato", medicao_numero AS "medicaoNumero",
              percentual_medicao AS "percentualMedicao", valor_medicao AS "valorMedicao",
              nf_numero AS "nfNumero", nf_emitida_em AS "nfEmitidaEm",
              data_vencimento AS "dataVencimento", data_recebimento AS "dataRecebimento",
              valor_recebido AS "valorRecebido", status, forma_pagamento AS "formaPagamento",
              retencao_iss AS "retencaoISS", retencao_inss AS "retencaoINSS",
              retencao_ir AS "retencaoIR", retencao_total AS "retencaoTotal",
              valor_liquido_receber AS "valorLiquidoReceber", observacoes,
              created_at AS "createdAt"
       FROM financial_revenue
       WHERE company_id IN (${inlineIds(ids)})
         AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date)) = $1
       ORDER BY data_vencimento ASC NULLS LAST`,
      [input.ano]
    );
    return rows(res);
  }),

  getContasAPagarByYear: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const res = await dbExecute(db,
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              conta_nome AS "contaNome", valor_previsto AS "valorPrevisto",
              valor_realizado AS "valorRealizado", status,
              data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
              forma_pagamento AS "formaPagamento",
              origem_modulo AS "origemModulo", origem_descricao AS "origemDescricao",
              tipo,
              CASE WHEN data_vencimento < CURRENT_DATE AND status != 'pago' THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries
       WHERE company_id IN (${inlineIds(ids)})
         AND tipo = 'despesa'
         AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date)) = $1
       ORDER BY data_vencimento ASC NULLS LAST`,
      [input.ano]
    );
    return rows(res);
  }),

  // ─────────────────── FASE 5: KPIs FINANCEIROS ───────────────────

  getKpis: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    try {
      const kpis = await calcularKpis(input.companyId, input.periodo);
      return kpis;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao calcular KPIs" });
    }
  }),

  getDRE: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
  })).query(async ({ input }) => {
    try {
      const dre = await calcularDRE(input.companyId, input.periodo);
      return dre;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao calcular DRE" });
    }
  }),

  getFluxoCaixa: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    try {
      const fluxo = await projetarFluxoCaixa90Dias(input.companyId);
      return fluxo;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao projetar fluxo de caixa" });
    }
  }),

  getEFDReinf: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesRef: z.string(),
  })).query(async ({ input }) => {
    try {
      const efd = await gerarEFDReinf(input.companyId, input.mesRef);
      return efd;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao gerar EFD-REINF" });
    }
  }),

  getKpiPorObra: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const mes = input.periodo ?? new Date().toISOString().slice(0, 7);
    const res = await dbExecute(db, 
      `SELECT tipo,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN valor_previsto ELSE 0 END), 0) AS previsto,
              COALESCE(SUM(CASE WHEN status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS realizado,
              COUNT(*) AS qtd
       FROM financial_entries
       WHERE company_id=$1 AND obra_id=$2
         AND TO_CHAR(data_competencia,'YYYY-MM')=$3
         AND status NOT IN ('cancelado')
       GROUP BY tipo`,
      [input.companyId, input.obraId, mes]
    );
    const linhas = rows(res);
    const rec = linhas.find((l: any) => l.tipo === "receita") ?? { previsto: "0", realizado: "0" };
    const desp = linhas.find((l: any) => l.tipo === "despesa") ?? { previsto: "0", realizado: "0" };
    const receitaPrev = parseFloat(rec.previsto);
    const despesaPrev = parseFloat(desp.previsto);
    const margem = receitaPrev - despesaPrev;
    return {
      obraId: input.obraId,
      periodo: mes,
      receitaPrevista: receitaPrev,
      receitaRealizada: parseFloat(rec.realizado),
      despesaPrevista: despesaPrev,
      despesaRealizada: parseFloat(desp.realizado),
      margem,
      margemPct: receitaPrev > 0 ? (margem / receitaPrev) * 100 : 0,
    };
  }),

  // ─────────────────── FASE 4: ALERTAS E APROVAÇÕES ───────────────────

  getAlerts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    nivel: z.string().optional(),
    resolvido: z.boolean().optional(),
    tipo: z.string().optional(),
    limit: z.number().default(50),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.nivel) { conds.push(`nivel=$${i++}`); vals.push(input.nivel); }
    if (input.resolvido !== undefined) { conds.push(`resolvido=$${i++}`); vals.push(input.resolvido ? 1 : 0); }
    if (input.tipo) { conds.push(`tipo=$${i++}`); vals.push(input.tipo); }
    vals.push(input.limit);
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", entry_id AS "entryId", revenue_id AS "revenueId",
              tipo, nivel, titulo, descricao, valor_referencia AS "valorReferencia",
              data_referencia AS "dataReferencia", responsavel_nome AS "responsavelNome",
              lido, lido_em AS "lidoEm", resolvido, resolvido_em AS "resolvidoEm",
              origem_modulo AS "origemModulo", origem_id AS "origemId",
              created_at AS "createdAt"
       FROM financial_revision_alerts
       WHERE ${conds.join(" AND ")}
       ORDER BY CASE nivel WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC
       LIMIT $${i}`,
      vals
    );
    return rows(res);
  }),

  markAlertRead: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_revision_alerts SET lido=1, lido_em=NOW() WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    return { ok: true };
  }),

  resolveAlert: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_revision_alerts
       SET resolvido=1, resolvido_em=NOW(), resolvido_por_nome=$1 WHERE id=$2 AND company_id=$3`,
      [ctx.user?.name ?? "Sistema", input.id, input.companyId]
    );
    return { ok: true };
  }),

  gerarAlertasVencimento: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const gerados = await gerarAlertasVencimento(input.companyId);
    return { gerados };
  }),

  getApprovals: protectedProcedure.input(z.object({
    companyId: z.number(),
    status: z.string().optional(),
    nivel: z.string().optional(),
    limit: z.number().default(50),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds: string[] = [`company_id=$1`];
    const vals: any[] = [input.companyId];
    let i = 2;
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    if (input.nivel) { conds.push(`nivel=$${i++}`); vals.push(input.nivel); }
    vals.push(input.limit);
    const res = await dbExecute(db, 
      `SELECT id, entry_id AS "entryId", valor, nivel, status,
              solicitante_nome AS "solicitanteNome", aprovador_nome AS "aprovadorNome",
              motivo_recusa AS "motivoRecusa", created_at AS "createdAt", resolvido_em AS "resolvidoEm"
       FROM financial_payment_approvals
       WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT $${i}`,
      vals
    );
    return rows(res);
  }),

  resolveApproval: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    status: z.enum(["aprovado", "recusado"]),
    motivoRecusa: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_payment_approvals
       SET status=$1, aprovador_id=$2, aprovador_nome=$3, motivo_recusa=$4, resolvido_em=NOW()
       WHERE id=$5 AND company_id=$6`,
      [input.status, ctx.user?.id ?? null, ctx.user?.name ?? "Sistema",
       input.motivoRecusa ?? null, input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_approval_resolved", userId: ctx.user?.id, companyId: input.companyId, details: `Aprovação ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  verificarImpacto: protectedProcedure.input(z.object({
    companyId: z.number(),
    origemModulo: z.string(),
    origemId: z.number(),
  })).query(async ({ input }) => {
    return verificarImpactoFinanceiro(input.companyId, input.origemModulo, input.origemId);
  }),

  rollbackOrigem: protectedProcedure.input(z.object({
    companyId: z.number(),
    origemModulo: z.string(),
    origemId: z.number(),
    motivo: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const cancelados = await rollbackFinanceiroPorOrigem(input.companyId, input.origemModulo, input.origemId, input.motivo);
    await createAuditLog({ action: "financial_rollback", userId: ctx.user?.id, companyId: input.companyId, details: `Rollback ${input.origemModulo}#${input.origemId}: ${cancelados} entries cancelados — ${input.motivo}` });
    return { cancelados };
  }),

  sincronizarStatus: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
    novoStatus: z.string(),
    dataPagamento: z.string().optional(),
    valorRealizado: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    await sincronizarStatusPagamento(input.companyId, input.entryId, input.novoStatus, input.dataPagamento, input.valorRealizado);
    await createAuditLog({ action: "financial_status_sync", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.entryId} → ${input.novoStatus}` });
    return { ok: true };
  }),

  // ─────────────────── FASE 6: RETROAÇÃO HISTÓRICA ───────────────────

  retroacaoHistorica: protectedProcedure.input(z.object({
    companyId: z.number(),
    meses: z.number().min(1).max(24).default(6),
  })).mutation(async ({ input, ctx }) => {
    const { runAllAutoImports: autoImport } = await import("../services/financialAutoImport");
    const { runAllDespesasImport: despImport, runAllReceitasImport: recImport } = await import("../services/financialIntegrationBridge");

    let totalImportado = 0;
    const resultados: Record<string, number> = {};

    const hoje = new Date();
    for (let i = 0; i < input.meses; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const [r1, r2] = await Promise.all([
        autoImport(input.companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 })),
        despImport(input.companyId, mes).catch(() => 0),
      ]);
      const r3 = await recImport(input.companyId, mes).catch(() => 0);

      const sub = r1.folha + r1.pj + r1.parceiros + (r2 as number) + r3;
      resultados[mes] = sub;
      totalImportado += sub;
    }

    await createAuditLog({
      action: "financial_retroacao",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Retroação ${input.meses} meses: ${totalImportado} lançamentos importados`,
    });

    return { totalImportado, resultados };
  }),

  // ─────────────────── IMPORTAÇÃO MANUAL ───────────────────

  importarAgora: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesRef: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const mes = input.mesRef ?? new Date().toISOString().slice(0, 7);
    const { runAllAutoImports: autoImport } = await import("../services/financialAutoImport");
    const { runAllDespesasImport: despImport, runAllReceitasImport: recImport } = await import("../services/financialIntegrationBridge");

    const [r1, r2, r3] = await Promise.all([
      autoImport(input.companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 })),
      despImport(input.companyId, mes).catch(() => 0),
      recImport(input.companyId, mes).catch(() => 0),
    ]);

    const totalImportado = r1.folha + r1.pj + r1.parceiros + (r2 as number) + (r3 as number);

    await createAuditLog({
      action: "financial_import_manual",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Importação manual ${mes}: folha=${r1.folha} pj=${r1.pj} parceiros=${r1.parceiros} despesas=${r2} receitas=${r3} TOTAL=${totalImportado}`,
    });

    return {
      totalImportado,
      folha: r1.folha,
      pj: r1.pj,
      parceiros: r1.parceiros,
      despesas: r2 as number,
      receitas: r3 as number,
    };
  }),

  // ─────────────────── RESUMO POR MÓDULO ORIGEM ───────────────────

  getResumoModulos: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.periodo ?? new Date().toISOString().slice(0, 7);
    const res = await dbExecute(db, 
      `SELECT origem_modulo AS "origemModulo", tipo,
              COUNT(*) AS qtd,
              COALESCE(SUM(valor_previsto), 0) AS total_previsto,
              COALESCE(SUM(CASE WHEN status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS total_realizado,
              COALESCE(SUM(CASE WHEN status='a_pagar' OR status='a_receber' THEN valor_previsto ELSE 0 END), 0) AS total_pendente
       FROM financial_entries
       WHERE company_id IN (${inlineIds(ids)})
                  AND TO_CHAR(data_competencia,'YYYY-MM')=         
                  AND status NOT IN ('cancelado')
                  AND origem_modulo IS NOT NULL
                GROUP BY origem_modulo, tipo
                ORDER BY total_previsto DESC`,
      [mes]
    );
    return rows(res);
  }),

  // ─────────────────── LOG DE IMPORTAÇÃO ───────────────────

  getImportLog: protectedProcedure.input(z.object({
    companyId: z.number(),
    limit: z.number().default(100),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT id, origem_modulo AS "origemModulo", mes_referencia AS "mesReferencia",
              total_importados AS "totalImportados", total_erros AS "totalErros",
              detalhes, executado_em AS "executadoEm"
       FROM financial_import_log
       WHERE company_id=$1
       ORDER BY executado_em DESC LIMIT $2`,
      [input.companyId, input.limit]
    );
    return rows(res);
  }),

  // ─────────────────── INDICADORES RÁPIDOS (para cards do dashboard) ───────────────────

  getIndicadores: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.periodo ?? new Date().toISOString().slice(0, 7);

    const [recRes, despRes, alertRes, vencRes, tributosRes, aprovRes] = await Promise.all([
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND TO_CHAR(data_competencia,'YYYY-MM')=$1 AND status NOT IN ('cancelado')`, [mes]),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND TO_CHAR(data_competencia,'YYYY-MM')=$1 AND status NOT IN ('cancelado')`, [mes]),
      dbExecute(db, `SELECT COUNT(*) AS total FROM financial_revision_alerts WHERE company_id IN (${inlineIds(ids)}) AND resolvido=0`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND status IN ('a_pagar','a_receber') AND data_vencimento < CURRENT_DATE`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_total),0) AS total FROM financial_tax_obligations WHERE company_id IN (${inlineIds(ids)}) AND mes_competencia=$1 AND status='a_pagar'`, [mes]),
      dbExecute(db, `SELECT COUNT(*) AS total FROM financial_payment_approvals WHERE company_id IN (${inlineIds(ids)}) AND status='pendente'`, []),
    ]);

    const receita = parseFloat(rows(recRes)[0]?.total ?? "0");
    const despesa = parseFloat(rows(despRes)[0]?.total ?? "0");
    const alertas = parseInt(rows(alertRes)[0]?.total ?? "0");
    const vencidos = parseFloat(rows(vencRes)[0]?.total ?? "0");
    const tributos = parseFloat(rows(tributosRes)[0]?.total ?? "0");
    const aprovacoespendentes = parseInt(rows(aprovRes)[0]?.total ?? "0");

    return {
      receita,
      despesa,
      resultado: receita - despesa,
      margemPct: receita > 0 ? ((receita - despesa) / receita) * 100 : 0,
      alertas,
      vencidos,
      tributos,
      aprovacoespendentes,
      periodo: mes,
    };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // Cronograma Financeiro — projeção mensal de receitas e despesas por obra
  // ─────────────────────────────────────────────────────────────────────────
  getCronogramaFinanceiro: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { meses: [], obras: [], totais: null };

    const { companyId, obraId } = input;
    const obraClause = obraId ? `AND fe.obra_id = ${Number(obraId)}` : "";

    // Monthly breakdown with receita and custo
    const { rows: mesesRows } = await dbExecute(db,
      `SELECT
         TO_CHAR(fe.data_competencia, 'YYYY-MM') AS mes,
         SUM(CASE WHEN fe.tipo='receita'
               THEN COALESCE(fe.valor_previsto::numeric, 0) ELSE 0 END) AS receita_prevista,
         SUM(CASE WHEN fe.tipo='despesa'
               THEN COALESCE(fe.valor_previsto::numeric, 0) ELSE 0 END) AS custo_previsto,
         SUM(CASE WHEN fe.tipo='receita' AND fe.status IN ('pendente','pago','recebido','faturado')
               THEN COALESCE(fe.valor_realizado::numeric, fe.valor_previsto::numeric, 0) ELSE 0 END) AS receita_realizada,
         SUM(CASE WHEN fe.tipo='despesa' AND fe.status IN ('pago')
               THEN COALESCE(fe.valor_realizado::numeric, fe.valor_previsto::numeric, 0) ELSE 0 END) AS custo_realizado
       FROM financial_entries fe
       WHERE fe.company_id = $1
         AND fe.origem_modulo IN ('cronograma_atividade','planejamento_medicao','medicao_obra')
         AND fe.status != 'cancelado'
         ${obraClause}
       GROUP BY mes
       ORDER BY mes`,
      [companyId]
    );

    // Per-obra breakdown (for filter dropdown + by-obra table)
    const { rows: obrasRows } = await dbExecute(db,
      `SELECT
         fe.obra_id,
         fe.obra_nome,
         SUM(CASE WHEN fe.tipo='receita'
               THEN COALESCE(fe.valor_previsto::numeric, 0) ELSE 0 END) AS total_receita,
         SUM(CASE WHEN fe.tipo='despesa'
               THEN COALESCE(fe.valor_previsto::numeric, 0) ELSE 0 END) AS total_custo
       FROM financial_entries fe
       WHERE fe.company_id = $1
         AND fe.origem_modulo IN ('cronograma_atividade','planejamento_medicao','medicao_obra')
         AND fe.obra_id IS NOT NULL
         AND fe.status != 'cancelado'
       GROUP BY fe.obra_id, fe.obra_nome
       ORDER BY total_custo DESC`,
      [companyId]
    );

    // Build monthly array with accumulated %
    let acumReceita = 0;
    let totalReceita = mesesRows.reduce((s: number, r: any) => s + parseFloat(r.receita_prevista ?? "0"), 0);

    const meses = mesesRows.map((r: any) => {
      const recPrev = parseFloat(r.receita_prevista ?? "0");
      const custoPrev = parseFloat(r.custo_previsto ?? "0");
      const recReal = parseFloat(r.receita_realizada ?? "0");
      const custoReal = parseFloat(r.custo_realizado ?? "0");
      acumReceita += recPrev;
      const resultado = recPrev - custoPrev;
      const margemPct = recPrev > 0 ? (resultado / recPrev) * 100 : 0;
      const acumPct = totalReceita > 0 ? (acumReceita / totalReceita) * 100 : 0;
      return {
        mes: r.mes,
        receitaPrevista: recPrev,
        custoPrevisto: custoPrev,
        resultadoPrevisto: resultado,
        margemPct,
        acumPct,
        receitaRealizada: recReal,
        custoRealizado: custoReal,
        resultadoRealizado: recReal - custoReal,
      };
    });

    const totais = {
      totalReceitaPrevista: totalReceita,
      totalCustoPrevisto: meses.reduce((s: number, m: any) => s + m.custoPrevisto, 0),
      resultadoPrevisto: meses.reduce((s: number, m: any) => s + m.resultadoPrevisto, 0),
      receitaRealizada: meses.reduce((s: number, m: any) => s + m.receitaRealizada, 0),
      custoRealizado: meses.reduce((s: number, m: any) => s + m.custoRealizado, 0),
    };

    const obras = obrasRows.map((r: any) => ({
      obraId: r.obra_id,
      obraNome: r.obra_nome ?? `Obra ${r.obra_id}`,
      totalReceita: parseFloat(r.total_receita ?? "0"),
      totalCusto: parseFloat(r.total_custo ?? "0"),
    }));

    return { meses, obras, totais };
  }),

  // Trigger: importa todas as medições previstas para o cronograma financeiro
  importarCronogramaFinanceiro: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const { companyId } = input;
    const [n1, n2] = await Promise.all([
      importAllMedicoesPrevistaToFinancial(companyId),
      importAtividadesCronogramaToFinancial(companyId),
    ]);
    return { imported: n1 + n2, receitas: n1, despesas: n2 };
  }),
});
