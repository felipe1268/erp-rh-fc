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
  importAllMedicoesPrevistaToRevenue,
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

  // Rev. 1621 — Detalhe completo de um título (Contas a Pagar drill-down)
  // Retorna entry + ordem de compra + itens + fornecedor + parcelas + auditoria
  getEntryDetalhe: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // 1) Entry principal (todos os campos)
    const entryRes = await dbExecute(db,
      `SELECT id, "company_id" AS "companyId", obra_id AS "obraId", obra_nome AS "obraNome",
              conta_id AS "contaId", conta_nome AS "contaNome",
              tipo, natureza,
              valor_previsto AS "valorPrevisto", valor_realizado AS "valorRealizado",
              data_competencia AS "dataCompetencia", data_vencimento AS "dataVencimento",
              data_pagamento AS "dataPagamento",
              status, conta_bancaria_id AS "contaBancariaId",
              origem_modulo AS "origemModulo", origem_id AS "origemId", origem_descricao AS "origemDescricao",
              parcela_numero AS "parcelaNumero", parcela_total AS "parcelaTotal",
              parcela_grupo_id AS "parcelaGrupoId",
              forma_pagamento AS "formaPagamento", comprovante_url AS "comprovanteUrl",
              codigo_barras AS "codigoBarras",
              cheque_numero AS "chequeNumero", cheque_banco AS "chequeBanco", cheque_data_bom_para AS "chequeDataBomPara",
              conciliado, data_conciliacao AS "dataConciliacao", extrato_banco_descricao AS "extratoBancoDescricao",
              descricao, observacoes, motivo_cancelamento AS "motivoCancelamento",
              criado_por_id AS "criadoPorId", criado_por_nome AS "criadoPorNome",
              aprovado_por_id AS "aprovadoPorId", aprovado_por_nome AS "aprovadoPorNome",
              vehicle_id AS "vehicleId",
              created_at AS "createdAt", updated_at AS "updatedAt",
              CASE WHEN data_vencimento < CURRENT_DATE AND status != 'pago' THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries
       WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    const entry = (rows(entryRes) as any[])[0];
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

    let ordem: any = null;
    let itens: any[] = [];
    let fornecedor: any = null;
    let parcelas: any[] = [];
    let bancoEmpresa: any = null;

    // 2) Se vier de Compras → busca OC, itens, fornecedor
    if ((entry.origemModulo === "compras" || entry.origemModulo === "compra_oc") && entry.origemId) {
      const ordRes = await dbExecute(db,
        `SELECT id, numero_oc AS "numeroOc", fornecedor_id AS "fornecedorId", fornecedor_nome AS "fornecedorNome",
                obra_id AS "obraId", data_entrega_prevista AS "dataEntregaPrevista", data_vencimento AS "dataVencimento",
                tipo_pagamento AS "tipoPagamento", forma_pagamento AS "formaPagamento", numero_parcelas AS "numeroParcelas",
                condicao_pagamento AS "condicaoPagamento", numero_nf AS "numeroNf",
                subtotal, frete, frete_tipo AS "freteTipo", outras_despesas AS "outrasDespesas",
                impostos, desconto, total,
                status, aprovacao_status AS "aprovacaoStatus",
                aprovador_nome AS "aprovadorNome", aprovado_em AS "aprovadoEm",
                observacoes, anexos, pdf_url AS "pdfUrl",
                criado_por_nome AS "criadoPorNome", created_at AS "createdAt"
         FROM compras_ordens
         WHERE id=$1 AND company_id=$2`,
        [entry.origemId, input.companyId]
      );
      ordem = (rows(ordRes) as any[])[0] ?? null;

      if (ordem) {
        const itRes = await dbExecute(db,
          `SELECT id, insumo_codigo AS "insumoCodigo", descricao, unidade,
                  quantidade, quantidade_entregue AS "quantidadeEntregue",
                  preco_unitario AS "precoUnitario", total
           FROM compras_ordens_itens WHERE ordem_id=$1 ORDER BY id`,
          [ordem.id]
        );
        itens = rows(itRes) as any[];

        if (ordem.fornecedorId) {
          const fRes = await dbExecute(db,
            `SELECT id, cnpj, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia",
                    telefone, email, contato_nome AS "contatoNome", contato_celular AS "contatoCelular",
                    banco, agencia, conta, pix, cidade, estado
             FROM fornecedores WHERE id=$1 AND company_id=$2`,
            [ordem.fornecedorId, input.companyId]
          );
          fornecedor = (rows(fRes) as any[])[0] ?? null;
        }
      }
    }

    // 3) Parcelas do mesmo grupo (se houver)
    if (entry.parcelaGrupoId) {
      const pRes = await dbExecute(db,
        `SELECT id, parcela_numero AS "parcelaNumero", parcela_total AS "parcelaTotal",
                valor_previsto AS "valorPrevisto", valor_realizado AS "valorRealizado",
                data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
                status, forma_pagamento AS "formaPagamento"
         FROM financial_entries
         WHERE parcela_grupo_id=$1 AND company_id=$2
         ORDER BY parcela_numero ASC NULLS LAST, data_vencimento ASC NULLS LAST`,
        [entry.parcelaGrupoId, input.companyId]
      );
      parcelas = rows(pRes) as any[];
    }

    // 4) Conta bancária da empresa (origem do pagamento, se já vinculada)
    if (entry.contaBancariaId) {
      const bRes = await dbExecute(db,
        `SELECT id, banco, agencia, conta, "tipoConta", apelido
         FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2`,
        [entry.contaBancariaId, input.companyId]
      );
      bancoEmpresa = (rows(bRes) as any[])[0] ?? null;
    }

    // 5) Histórico de auditoria (últimos 50 registros relativos ao entry id)
    // audit_logs usa identifiers camelCase ("companyId", "createdAt", "entityType", "entityId", "userName")
    const audRes = await dbExecute(db,
      `SELECT id, "userName", action, module, details, "createdAt"
       FROM audit_logs
       WHERE "companyId"=$1
         AND "entityType"='financial_entry'
         AND "entityId"=$2
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      [input.companyId, input.id]
    );
    const auditoria = rows(audRes) as any[];

    return { entry, ordem, itens, fornecedor, parcelas, bancoEmpresa, auditoria };
  }),

  // Rev. 1620 — Pagamento em lote (Onda 2: APQC 8.7.5 — Process Payments)
  bulkUpdateStatus: protectedProcedure.input(z.object({
    ids: z.array(z.number()).min(1).max(500),
    companyId: z.number(),
    status: z.string(),
    dataPagamento: z.string().optional(),
    formaPagamento: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const idList = input.ids.filter(n => Number.isInteger(n) && n > 0);
    if (idList.length === 0) return { ok: true, updated: 0 };
    // Para "pago": força valor_realizado = valor_previsto (substituindo eventuais parciais).
    // Para outros status: preserva valor_realizado existente.
    const isPago = input.status === "pago";
    const res = await dbExecute(db,
      `UPDATE financial_entries
         SET status=$1,
             data_pagamento=COALESCE($2, data_pagamento),
             forma_pagamento=COALESCE($3, forma_pagamento),
             valor_realizado=${isPago ? "valor_previsto" : "valor_realizado"},
             updated_at=NOW()
       WHERE company_id=$4 AND id = ANY($5::int[]) AND status != 'cancelado'`,
      [input.status, input.dataPagamento ?? null, input.formaPagamento ?? null, input.companyId, idList]
    );
    const updated = (res as any).rowCount ?? idList.length;
    await createAuditLog({
      action: "financial_entries_bulk_updated",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `${updated} título(s) atualizado(s) → ${input.status} (de ${idList.length} solicitado(s))`
    });
    return { ok: true, updated };
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
    retencaoContratual: z.number().default(0),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const retTrib = input.retencaoISS + input.retencaoINSS + input.retencaoIR;
    const retTotal = retTrib + input.retencaoContratual;
    const vlq = input.valorMedicao - retTotal;
    const res = await dbExecute(db, 
      `INSERT INTO financial_revenue
       (company_id, obra_id, obra_nome, cliente_nome, cliente_cnpj, valor_contrato,
        valor_medicao, medicao_numero, percentual_medicao, data_vencimento,
        retencao_iss, retencao_inss, retencao_ir, retencao_contratual, retencao_total,
        valor_liquido_receber, status, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'a_faturar',$17,NOW(),NOW())
       RETURNING id`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.clienteNome ?? null,
       input.clienteCnpj ?? null, input.valorContrato ?? null, input.valorMedicao,
       input.medicaoNumero ?? null, input.percentualMedicao ?? null, input.dataVencimento ?? null,
       input.retencaoISS, input.retencaoINSS, input.retencaoIR, input.retencaoContratual,
       retTotal, vlq, input.observacoes ?? null]
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
    companyId: z.number().optional(),
    status: z.string(),
    nfNumero: z.string().optional(),
    nfEmitidaEm: z.string().optional(),
    dataRecebimento: z.string().optional(),
    valorRecebido: z.number().optional(),
    formaPagamento: z.string().optional(),
    valorAprovado: z.number().optional(),
    dataAprovacao: z.string().optional(),
    medicaoEnviadaEm: z.string().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Resolve companyId — use provided value or look up from the record itself
    let companyId = (input.companyId && input.companyId > 0) ? input.companyId : 0;
    if (!companyId) {
      const rec = rows(await dbExecute(db, `SELECT company_id FROM financial_revenue WHERE id=$1`, [input.id]));
      companyId = Number(rec[0]?.company_id ?? 0);
    }
    if (!companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Registro financeiro não encontrado" });
    const glosa = input.valorAprovado != null
      ? (await dbExecute(db, `SELECT valor_medicao FROM financial_revenue WHERE id=$1`, [input.id]))
          .then((r: any) => {
            const vm = Number(rows(r)[0]?.valor_medicao ?? 0);
            return Math.max(0, vm - (input.valorAprovado ?? vm));
          })
      : Promise.resolve(0);
    const glosaVal = await glosa;
    await dbExecute(db, 
      `UPDATE financial_revenue
       SET status=$1,
           nf_numero=COALESCE($2,nf_numero),
           nf_emitida_em=COALESCE($3,nf_emitida_em),
           data_recebimento=COALESCE($4,data_recebimento),
           valor_recebido=COALESCE($5,valor_recebido),
           forma_pagamento=COALESCE($6,forma_pagamento),
           valor_aprovado=COALESCE($9,valor_aprovado),
           data_aprovacao=COALESCE($10,data_aprovacao),
           medicao_enviada_em=COALESCE($11,medicao_enviada_em),
           glosa=$12,
           observacoes=COALESCE($13,observacoes),
           updated_at=NOW()
       WHERE id=$7 AND company_id=$8`,
      [input.status, input.nfNumero ?? null, input.nfEmitidaEm ?? null,
       input.dataRecebimento ?? null, input.valorRecebido ?? null,
       input.formaPagamento ?? null, input.id, companyId,
       input.valorAprovado ?? null, input.dataAprovacao ?? null,
       input.medicaoEnviadaEm ?? null, glosaVal,
       input.observacoes || null]
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
      [entryStatus, input.valorRecebido ?? 0, input.dataRecebimento ?? null, input.id, companyId]
    );

    await createAuditLog({ action: "financial_revenue_status_updated", userId: ctx.user?.id, companyId, details: `Revenue ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  // ─── Dar Baixa — registra recebimento direto (sem burocracia de status) ─────
  registrarRecebimento: protectedProcedure.input(z.object({
    companyId:       z.number(),
    projetoId:       z.number(),
    obraId:          z.number().nullable().optional(),
    obraNome:        z.string().optional(),
    clienteNome:     z.string().optional(),
    competencia:     z.string(),  // "YYYY-MM"
    valorPrevisto:   z.number(),
    valorRecebido:   z.number(),
    dataRecebimento: z.string(),  // "YYYY-MM-DD"
    formaPagamento:  z.string().optional(),
    frId:            z.number().nullable().optional(),  // se já existe financial_revenue
    observacoes:     z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Se já existe um financial_revenue para esta medição → apenas atualiza
    if (input.frId) {
      await dbExecute(db,
        `UPDATE financial_revenue
         SET status='recebido_total',
             valor_recebido=$1,
             data_recebimento=$2,
             forma_pagamento=COALESCE($3, forma_pagamento),
             updated_at=NOW()
         WHERE id=$4 AND company_id=$5`,
        [input.valorRecebido, input.dataRecebimento, input.formaPagamento ?? null,
         input.frId, input.companyId]
      );
      await dbExecute(db,
        `UPDATE financial_entries
         SET status='recebido',
             valor_realizado=$1,
             data_pagamento=$2,
             updated_at=NOW()
         WHERE origem_modulo='revenue' AND origem_id=$3 AND company_id=$4`,
        [input.valorRecebido, input.dataRecebimento, input.frId, input.companyId]
      );
      // Sync planejamento_medicoes → marcar competência como confirmada
      // Nota: parâmetros são listados com índices únicos ($4,$5,$6) para evitar
      // repetição que confunde o dbExecute (que trata $N como posição sequencial)
      await dbExecute(db,
        `WITH upd AS (
           UPDATE planejamento_medicoes
           SET valor_medido=$1, status='confirmado', atualizado_em=NOW()
           WHERE projeto_id=$2 AND competencia=$3
           RETURNING id
         )
         INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
         SELECT $4::int, $5, 0, $6, 'confirmado', NOW()
         WHERE NOT EXISTS (SELECT 1 FROM upd)`,
        [input.valorRecebido, input.projetoId, input.competencia,
         input.projetoId, input.competencia, input.valorRecebido]
      );
      await createAuditLog({ action: "dar_baixa", userId: ctx.user?.id, companyId: input.companyId,
        details: `Baixa fr_id=${input.frId} R$${input.valorRecebido} em ${input.dataRecebimento}` });
      return { ok: true, frId: input.frId };
    }

    // Não existe registro → cria financial_revenue direto como recebido_total
    const obraId   = input.obraId ?? null;
    const obraNome = input.obraNome ?? `Projeto ${input.projetoId}`;
    const mesDate  = `${input.competencia}-01`;

    const revRes = await dbExecute(db,
      `INSERT INTO financial_revenue
       (company_id, obra_id, obra_nome, cliente_nome, valor_contrato,
        valor_medicao, valor_recebido, data_vencimento, data_recebimento,
        forma_pagamento, status, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,$5,$6,$7::date,$8,$9,'recebido_total',$10,NOW(),NOW())
       RETURNING id`,
      [input.companyId, obraId, obraNome, input.clienteNome ?? null,
       input.valorPrevisto, input.valorRecebido, mesDate,
       input.dataRecebimento, input.formaPagamento ?? null, input.observacoes ?? null]
    );
    const newFrId = rows(revRes)[0]?.id;

    if (newFrId) {
      await dbExecute(db,
        `INSERT INTO financial_entries
         (company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
          valor_previsto, valor_realizado, data_competencia, data_vencimento,
          data_pagamento, status, origem_modulo, origem_id, origem_descricao,
          descricao, created_at, updated_at)
         VALUES ($1,$2,$3,'Faturamento de Obras','receita','variavel',
                 $4,$5,$6::date,$7::date,$8,'recebido',
                 'revenue',$9,$10,$11,NOW(),NOW())`,
        [input.companyId, obraId, obraNome,
         input.valorPrevisto, input.valorRecebido,
         mesDate, mesDate,
         input.dataRecebimento,
         newFrId,
         `Recebimento — ${obraNome}`,
         `Baixa: ${obraNome}`]
      );
    }

    // Sync planejamento_medicoes → marcar competência como confirmada
    await dbExecute(db,
      `WITH upd AS (
         UPDATE planejamento_medicoes
         SET valor_medido=$1, status='confirmado', atualizado_em=NOW()
         WHERE projeto_id=$2 AND competencia=$3
         RETURNING id
       )
       INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
       SELECT $4::int, $5, 0, $6, 'confirmado', NOW()
       WHERE NOT EXISTS (SELECT 1 FROM upd)`,
      [input.valorRecebido, input.projetoId, input.competencia,
       input.projetoId, input.competencia, input.valorRecebido]
    );
    await createAuditLog({ action: "dar_baixa", userId: ctx.user?.id, companyId: input.companyId,
      details: `Nova baixa projeto ${input.projetoId} R$${input.valorRecebido} em ${input.dataRecebimento}` });
    return { ok: true, frId: newFrId };
  }),

  // ─── Cancelar Recebimento ─────────────────────────────────────────────────
  cancelarRecebimento: protectedProcedure.input(z.object({
    companyId:  z.number(),
    frId:       z.number(),
    medicaoId:  z.number().nullable().optional(),
    projetoId:  z.number().optional(),   // para resetar planejamento_medicoes
    competencia: z.string().optional(),  // "YYYY-MM"
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    if (input.medicaoId) {
      // FR vinculado a medição: reverte para "a_receber" (não exclui)
      await dbExecute(db,
        `UPDATE financial_revenue
         SET status='a_receber', valor_recebido=NULL, data_recebimento=NULL, updated_at=NOW()
         WHERE id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
      await dbExecute(db,
        `UPDATE financial_entries
         SET status='a_receber', valor_realizado=NULL, data_pagamento=NULL, updated_at=NOW()
         WHERE origem_modulo='revenue' AND origem_id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
    } else {
      // FR standalone (criado via Dar Baixa): exclui o registro
      await dbExecute(db,
        `DELETE FROM financial_entries
         WHERE origem_modulo='revenue' AND origem_id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
      await dbExecute(db,
        `DELETE FROM financial_revenue WHERE id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
    }

    // Sync planejamento_medicoes → resetar competência para pendente
    if (input.projetoId && input.competencia) {
      await dbExecute(db,
        `UPDATE planejamento_medicoes
         SET valor_medido=0, status='pendente', atualizado_em=NOW()
         WHERE projeto_id=$1 AND competencia=$2`,
        [input.projetoId, input.competencia]
      );
    }
    await createAuditLog({ action: "cancelar_baixa", userId: ctx.user?.id, companyId: input.companyId,
      details: `Cancelamento recebimento fr_id=${input.frId}` });
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
              retencao_ir AS "retencaoIR",
              COALESCE(retencao_contratual,0) AS "retencaoContratual",
              retencao_total AS "retencaoTotal",
              valor_liquido_receber AS "valorLiquidoReceber",
              COALESCE(valor_aprovado, valor_medicao) AS "valorAprovado",
              data_aprovacao AS "dataAprovacao",
              medicao_enviada_em AS "medicaoEnviadaEm",
              COALESCE(glosa,0) AS "glosa",
              observacoes, created_at AS "createdAt"
       FROM financial_revenue
       WHERE company_id IN (${inlineIds(ids)})
         AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date)) = $1
       ORDER BY data_vencimento ASC NULLS LAST`,
      [input.ano]
    );
    return rows(res);
  }),

  // ─── PREVISÃO DE RECEITA: 3 camadas (Baseline / Previsto / Realizado) ───────

  getRevenuePrevisao: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [baselineRes, previstoRes, realizadoRes] = await Promise.all([
      dbExecute(db,
        `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
                EXTRACT(month FROM mes)::int AS "mes", SUM(valor) AS "valor"
         FROM receita_baseline
         WHERE company_id=$1 AND EXTRACT(year FROM mes)=$2
         GROUP BY obra_id, obra_nome, EXTRACT(month FROM mes)`,
        [input.companyId, input.ano]
      ),
      dbExecute(db,
        `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
                EXTRACT(month FROM mes)::int AS "mes", SUM(valor) AS "valor"
         FROM receita_previsto
         WHERE company_id=$1 AND EXTRACT(year FROM mes)=$2
         GROUP BY obra_id, obra_nome, EXTRACT(month FROM mes)`,
        [input.companyId, input.ano]
      ),
      dbExecute(db,
        `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
                EXTRACT(month FROM COALESCE(data_vencimento::date, created_at::date))::int AS "mes",
                SUM(valor_medicao) AS "valor"
         FROM financial_revenue
         WHERE company_id=$1
           AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date))=$2
           AND status NOT IN ('cancelado')
         GROUP BY obra_id, obra_nome,
                  EXTRACT(month FROM COALESCE(data_vencimento::date, created_at::date))`,
        [input.companyId, input.ano]
      ),
    ]);

    const baseline  = rows(baselineRes)  as any[];
    const previsto  = rows(previstoRes)  as any[];
    const realizado = rows(realizadoRes) as any[];

    // Collect all obras
    const obraMap = new Map<number, string>();
    for (const r of [...baseline, ...previsto, ...realizado]) {
      if (r.obraId) obraMap.set(Number(r.obraId), r.obraNome ?? `Obra ${r.obraId}`);
    }

    const meses = [1,2,3,4,5,6,7,8,9,10,11,12];

    const obras = Array.from(obraMap.entries()).map(([obraId, obraNome]) => {
      const mesData = meses.map(mes => {
        const b = Number(baseline.find(r => Number(r.obraId) === obraId && Number(r.mes) === mes)?.valor ?? 0);
        const p = Number(previsto.find(r => Number(r.obraId) === obraId && Number(r.mes) === mes)?.valor ?? 0);
        const rv = Number(realizado.find(r => Number(r.obraId) === obraId && Number(r.mes) === mes)?.valor ?? 0);
        return { mes, baseline: b, previsto: p, realizado: rv };
      });
      const totB  = mesData.reduce((s, m) => s + m.baseline, 0);
      const totP  = mesData.reduce((s, m) => s + m.previsto, 0);
      const totR  = mesData.reduce((s, m) => s + m.realizado, 0);
      const spi   = totB > 0 ? totR / totB : null;
      const desvP = totB > 0 ? ((totP - totB) / totB) * 100 : null;
      return { obraId, obraNome, meses: mesData, totBaseline: totB, totPrevisto: totP, totRealizado: totR, spi, desvP };
    });

    // Rolling forecast: next 3 months from previsto
    const hoje = new Date();
    const rolling = [1,2,3].map(offset => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
      const mes = d.getMonth() + 1;
      const anoRoll = d.getFullYear();
      const valor = anoRoll === input.ano
        ? previsto.filter(r => Number(r.mes) === mes).reduce((s, r) => s + Number(r.valor), 0)
        : 0;
      return { mes, ano: anoRoll, valor };
    });

    return { obras, rolling };
  }),

  upsertRevenueBaseline: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    obraNome: z.string().optional(),
    mes: z.string(), // YYYY-MM-01
    valor: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db,
      `INSERT INTO receita_baseline (company_id, obra_id, obra_nome, mes, valor, atualizado_em)
       VALUES ($1,$2,$3,$4::date,$5,NOW())
       ON CONFLICT (company_id, obra_id, mes)
       DO UPDATE SET valor=$5, obra_nome=COALESCE($3, receita_baseline.obra_nome), atualizado_em=NOW()`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.mes, input.valor]
    );
    return { ok: true };
  }),

  upsertRevenuePrevisto: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    obraNome: z.string().optional(),
    mes: z.string(), // YYYY-MM-01
    valor: z.number(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db,
      `INSERT INTO receita_previsto (company_id, obra_id, obra_nome, mes, valor, observacoes, atualizado_em)
       VALUES ($1,$2,$3,$4::date,$5,$6,NOW())
       ON CONFLICT (company_id, obra_id, mes)
       DO UPDATE SET valor=$5, obra_nome=COALESCE($3, receita_previsto.obra_nome),
                     observacoes=COALESCE($6, receita_previsto.observacoes), atualizado_em=NOW()`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.mes, input.valor, input.observacoes ?? null]
    );
    return { ok: true };
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
              conta_id AS "contaId", conta_nome AS "contaNome",
              valor_previsto AS "valorPrevisto",
              valor_realizado AS "valorRealizado", status,
              data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
              data_competencia AS "dataCompetencia",
              forma_pagamento AS "formaPagamento",
              origem_modulo AS "origemModulo", origem_id AS "origemId",
              origem_descricao AS "origemDescricao",
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

  getCashFlow: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
    agrupamento: z.enum(["dia", "semana", "mes", "ano"]).default("dia"),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { companyId, dataInicio, dataFim, agrupamento } = input;

    // Build grouping expression — all label expressions derive from groupExpr so GROUP BY is clean
    let groupExpr: string;
    let labelExpr: string;
    if (agrupamento === "dia") {
      groupExpr = "data_vencimento::date";
      labelExpr = "TO_CHAR(data_vencimento::date, 'DD/MM/YYYY')";
    } else if (agrupamento === "semana") {
      groupExpr = "DATE_TRUNC('week', data_vencimento)";
      labelExpr = "TO_CHAR(DATE_TRUNC('week', data_vencimento), 'DD/MM/YYYY') || ' – ' || TO_CHAR(DATE_TRUNC('week', data_vencimento) + INTERVAL '6 days', 'DD/MM/YYYY')";
    } else if (agrupamento === "mes") {
      groupExpr = "DATE_TRUNC('month', data_vencimento)";
      labelExpr = "TO_CHAR(DATE_TRUNC('month', data_vencimento), 'MM/YYYY')";
    } else {
      groupExpr = "DATE_TRUNC('year', data_vencimento)";
      labelExpr = "TO_CHAR(DATE_TRUNC('year', data_vencimento), 'YYYY')";
    }

    const summaryRes = await dbExecute(db,
      `SELECT
         ${groupExpr} AS periodo_key,
         ${labelExpr} AS periodo_label,
         COALESCE(SUM(CASE WHEN tipo='receita' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS entradas_realizadas,
         COALESCE(SUM(CASE WHEN tipo='despesa' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS saidas_realizadas,
         COALESCE(SUM(CASE WHEN tipo='receita' AND status NOT IN ('cancelado','pago','recebido') THEN valor_previsto ELSE 0 END), 0) AS entradas_previstas,
         COALESCE(SUM(CASE WHEN tipo='despesa' AND status NOT IN ('cancelado','pago','recebido') THEN valor_previsto ELSE 0 END), 0) AS saidas_previstas
       FROM financial_entries
       WHERE company_id=$1
         AND status != 'cancelado'
         AND data_vencimento IS NOT NULL
         AND data_vencimento::date BETWEEN $2::date AND $3::date
       GROUP BY ${groupExpr}
       ORDER BY periodo_key`,
      [companyId, dataInicio, dataFim]
    );

    const periodos = rows(summaryRes);

    // Build totals
    let saldoAcumuladoRealizado = 0;
    let saldoAcumuladoTotal = 0;

    const result = periodos.map((p: any) => {
      const entR = parseFloat(p.entradas_realizadas ?? 0);
      const saiR = parseFloat(p.saidas_realizadas ?? 0);
      const entP = parseFloat(p.entradas_previstas ?? 0);
      const saiP = parseFloat(p.saidas_previstas ?? 0);
      saldoAcumuladoRealizado += entR - saiR;
      saldoAcumuladoTotal += (entR + entP) - (saiR + saiP);

      return {
        periodoKey: p.periodo_key,
        periodoLabel: p.periodo_label,
        entradasRealizadas: entR,
        saidasRealizadas: saiR,
        entradasPrevistas: entP,
        saidasPrevistas: saiP,
        saldoLiquidoRealizado: entR - saiR,
        saldoLiquidoPrevisto: entP - saiP,
        saldoAcumuladoRealizado,
        saldoAcumuladoTotal,
      };
    });

    const totais = result.reduce((acc: any, p: any) => {
      acc.entradasRealizadas += p.entradasRealizadas;
      acc.saidasRealizadas += p.saidasRealizadas;
      acc.entradasPrevistas += p.entradasPrevistas;
      acc.saidasPrevistas += p.saidasPrevistas;
      return acc;
    }, { entradasRealizadas: 0, saidasRealizadas: 0, entradasPrevistas: 0, saidasPrevistas: 0 });

    return { periodos: result, totais };
  }),

  getCashFlowMatrix: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { companyId, ano } = input;

    // Query all relevant entries for the year, grouped by month + origem_modulo + tipo + status category
    const res = await dbExecute(db,
      `SELECT
         EXTRACT(MONTH FROM data_competencia)::integer AS mes,
         COALESCE(origem_modulo, 'outros') AS origem_modulo,
         tipo,
         CASE WHEN status IN ('pago','recebido') THEN 'realizado' ELSE 'previsto' END AS categoria,
         SUM(CASE WHEN status IN ('pago','recebido')
             THEN COALESCE(valor_realizado, valor_previsto)
             ELSE valor_previsto END
         )::numeric AS valor
       FROM financial_entries
       WHERE company_id=$1
         AND EXTRACT(YEAR FROM data_competencia)=$2
         AND status NOT IN ('cancelado')
         AND data_competencia IS NOT NULL
       GROUP BY mes, origem_modulo, tipo, categoria
       ORDER BY mes`,
      [companyId, ano]
    );

    const rawRows = rows(res);

    // Categorize origins into display groups
    function categorizeOrigem(origem: string, tipo: string): string {
      if (tipo === "receita") {
        if (["revenue", "receita"].includes(origem)) return "faturamento";
        if (["planejamento_medicao", "obra_previsto"].includes(origem)) return "medicao_prevista";
        if (["cronograma_receita"].includes(origem)) return "cronograma_receita";
        if (["cronograma_receita_baseline"].includes(origem)) return "cronograma_baseline";
        return "receita_outros";
      } else {
        if (origem === "folha_clt") return "folha";
        if (origem === "compras") return "compras";
        if (["frotas", "frota_manutencao"].includes(origem)) return "frota";
        if (origem === "cronograma_atividade") return "obras";
        if (origem === "recorrente") return "recorrente";
        if (origem === "terceiro_medicao") return "terceiros";
        return "outros";
      }
    }

    // Build a month → category → { realizado, previsto } map
    type CatData = { realizado: number; previsto: number };
    type MesData = Record<string, CatData>;
    const matrix: Record<number, MesData> = {};
    for (let m = 1; m <= 12; m++) {
      matrix[m] = {};
    }

    for (const row of rawRows) {
      const mes = parseInt(row.mes);
      const grupo = categorizeOrigem(row.origem_modulo, row.tipo);
      const valor = parseFloat(row.valor ?? "0");
      if (!matrix[mes][grupo]) matrix[mes][grupo] = { realizado: 0, previsto: 0 };
      if (row.categoria === "realizado") matrix[mes][grupo].realizado += valor;
      else matrix[mes][grupo].previsto += valor;
    }

    // Build per-month summary
    const RECEITA_CATS = ["faturamento", "medicao_prevista", "cronograma_receita", "cronograma_baseline", "receita_outros"];
    const DESPESA_CATS = ["folha", "compras", "frota", "obras", "terceiros", "recorrente", "outros"];

    const meses: any[] = [];
    let saldoAcum = 0;

    for (let m = 1; m <= 12; m++) {
      const md = matrix[m];
      const receitaRealizada = RECEITA_CATS.reduce((s, c) => s + (md[c]?.realizado ?? 0), 0);
      const receitaPrevista  = RECEITA_CATS.reduce((s, c) => s + (md[c]?.previsto ?? 0), 0);
      const despesaRealizada = DESPESA_CATS.reduce((s, c) => s + (md[c]?.realizado ?? 0), 0);
      const despesaPrevista  = DESPESA_CATS.reduce((s, c) => s + (md[c]?.previsto ?? 0), 0);

      const totalReceitas = receitaRealizada + receitaPrevista;
      const totalDespesas = despesaRealizada + despesaPrevista;
      const resultado = totalReceitas - totalDespesas;
      saldoAcum += resultado;

      meses.push({
        mes: m,
        receitaRealizada,
        receitaPrevista,
        totalReceitas,
        despesaRealizada,
        despesaPrevista,
        totalDespesas,
        resultado,
        saldoAcumulado: saldoAcum,
        lucratividade: totalReceitas > 0 ? (resultado / totalReceitas) * 100 : 0,
        detalhe: {
          // receitas
          faturamento: md.faturamento ?? { realizado: 0, previsto: 0 },
          medicao_prevista: md.medicao_prevista ?? { realizado: 0, previsto: 0 },
          cronograma_receita: md.cronograma_receita ?? { realizado: 0, previsto: 0 },
          receita_outros: md.receita_outros ?? { realizado: 0, previsto: 0 },
          // despesas
          folha: md.folha ?? { realizado: 0, previsto: 0 },
          compras: md.compras ?? { realizado: 0, previsto: 0 },
          frota: md.frota ?? { realizado: 0, previsto: 0 },
          obras: md.obras ?? { realizado: 0, previsto: 0 },
          terceiros: md.terceiros ?? { realizado: 0, previsto: 0 },
          recorrente: md.recorrente ?? { realizado: 0, previsto: 0 },
          outros: md.outros ?? { realizado: 0, previsto: 0 },
        },
      });
    }

    return { ano, meses };
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
    const [n1, n2, n3] = await Promise.all([
      importAllMedicoesPrevistaToFinancial(companyId),
      importAtividadesCronogramaToFinancial(companyId),
      importAllMedicoesPrevistaToRevenue(companyId),
    ]);
    return { imported: n1 + n2 + n3, receitas: n1 + n3, despesas: n2 };
  }),

  // Sincroniza cronograma financeiro → Contas a Receber (financial_revenue)
  syncCronogramaToReceber: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const count = await importAllMedicoesPrevistaToRevenue(input.companyId);
    return { sincronizados: count };
  }),

  // ── Matriz Contas a Receber — espelho do cronograma financeiro ────────────
  // Previsto = distribuição proporcional do valor_contrato pelo timeline das atividades
  // Realizado = medições salvas (planejamento_medicoes) sobrepostas ao previsto
  getContasReceberMatrix: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // 1. Projetos ativos + orcamento total de venda
    const projRes = await dbExecute(db, `
      SELECT pp.id AS projeto_id, pp.nome AS projeto_nome, pp.cliente,
             pp.valor_contrato, pp.obra_id,
             COALESCE(o.nome, pp.nome) AS obra_nome,
             COALESCE(orc.valor_negociado::numeric,
                      orc."totalVenda"::numeric,
                      pp.valor_contrato::numeric, 0) AS total_venda,
             -- Rev. 1350: MDO no preço de VENDA (com BDI), base correta do sinal em modo "mao_de_obra"
             CASE WHEN COALESCE(orc."totalCusto"::numeric, 0) > 0
               THEN COALESCE(orc."totalMdo"::numeric, 0)
                    * COALESCE(orc.valor_negociado::numeric, orc."totalVenda"::numeric, 0)
                    / orc."totalCusto"::numeric
               ELSE COALESCE(orc."totalMdo"::numeric, 0)
             END AS total_mdo,
             COALESCE((SELECT SUM(b.total::numeric)
                       FROM bdi_fd b
                       WHERE b.orcamento_id = pp.orcamento_id), 0) AS fd_sugerido
      FROM planejamento_projetos pp
      LEFT JOIN obras o ON o.id = pp.obra_id
      LEFT JOIN orcamentos orc ON orc.id = pp.orcamento_id
      WHERE pp.company_id = $1
        AND pp.status NOT IN ('cancelado','encerrado','Cancelado','Encerrado')
      ORDER BY COALESCE(o.nome, pp.nome) ASC
    `, [input.companyId]);
    const projetos = projRes.rows;
    if (!projetos.length) return { projetos: [], totaisMes: {}, ano: input.ano, kpis: { totalContrato: 0, totalPrevisto: 0, totalFaturado: 0, totalRecebido: 0 } };

    const projetoIds = projetos.map((p: any) => Number(p.projeto_id)).filter(Boolean);
    const idsStr = projetoIds.join(",");

    // 2-7. Todas as queries dependentes rodam em PARALELO após obter projetos
    const anoInt = Number(input.ano);
    const t0 = Date.now();

    // Mapa projeto_id → projeto (necessário antes do processamento das queries paralelas)
    const projetoMap: Record<number, any> = {};
    for (const p of projetos) projetoMap[Number(p.projeto_id)] = p;

    const [configRes, prevRes, medRes, stRes, previsaoFatRes, totalRecebidoHistRes, prevBaselineRes] = await Promise.all([

    // 2. Configurações de medição
    dbExecute(db, `
      SELECT c.projeto_id,
             c.tipo_medicao,
             c.entrada::numeric         AS entrada,
             c.numero_parcelas,
             c.dia_corte                AS dia_corte,
             c.inicio_faturamento::text AS inicio_faturamento,
             c.sinal_pct::numeric       AS sinal_pct,
             c.sinal_valor::numeric     AS sinal_valor,
             c.retencao_pct::numeric    AS retencao_pct,
             c.data_inicio_obra::text   AS data_inicio_obra,
             c.data_primeiro_faturamento::text AS data_primeiro_faturamento,
             c.prazo_recebimento_dias_uteis    AS prazo_recebimento_dias_uteis,
             c.sinal_base                      AS sinal_base,
             c.fd_valor::numeric               AS fd_valor,
             c.valor_parcela_fixa::numeric AS valor_parcela_fixa
      FROM planejamento_medicao_config c
      WHERE c.projeto_id IN (${idsStr})
    `, []),

    // 3. Distribuição mensal de venda bruta via cruzamento atividades×orçamento
    //    Cobre o timeline completo do projeto (todos os meses, não só o ano atual)
    dbExecute(db, `
      WITH rev_ativa AS (
        SELECT DISTINCT ON (r.projeto_id) r.projeto_id, r.id AS rev_id
        FROM planejamento_revisoes r
        WHERE r.projeto_id IN (${idsStr}) AND r.status = 'aprovada'
        ORDER BY r.projeto_id, r.numero DESC
      ),
      orc_scope AS (
        SELECT i.*, p.id AS projeto_id
        FROM orcamento_itens i
        JOIN planejamento_projetos p ON p.orcamento_id = i."orcamentoId"
        WHERE p.id IN (${idsStr})
          AND (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
      ),
      folhas AS (
        SELECT o.*
        FROM orc_scope o
        WHERE NOT EXISTS (
          SELECT 1 FROM orc_scope c
          WHERE c."eapCodigo" LIKE o."eapCodigo" || '.%'
            AND c.id != o.id AND c.projeto_id = o.projeto_id
        )
      ),
      norm_ativ AS (
        SELECT a.projeto_id, a.id AS ativ_id,
               a.data_inicio::date AS data_inicio, a.data_fim::date AS data_fim,
               LOWER(REGEXP_REPLACE(TRIM(a.nome), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM planejamento_atividades a
        JOIN rev_ativa ra ON ra.rev_id = a.revisao_id AND ra.projeto_id = a.projeto_id
        WHERE NOT a.is_grupo AND a.data_inicio IS NOT NULL AND a.data_fim IS NOT NULL
      ),
      norm_name AS (
        SELECT *, LOWER(REGEXP_REPLACE(TRIM(descricao), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM folhas
      ),
      match_exact AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM norm_name i JOIN norm_ativ a ON a.nome_norm = i.nome_norm AND a.projeto_id = i.projeto_id
      ),
      match_contains AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM norm_name i JOIN norm_ativ a
          ON (a.nome_norm LIKE '%' || i.nome_norm || '%' OR i.nome_norm LIKE '%' || a.nome_norm || '%')
          AND a.projeto_id = i.projeto_id
        WHERE NOT EXISTS (SELECT 1 FROM match_exact m WHERE m.item_id = i.id)
          AND LENGTH(i.nome_norm) >= 5 AND LENGTH(a.nome_norm) >= 5
      ),
      all_pairs AS (
        SELECT i.projeto_id, i.id AS item_id,
               (i."vendaTotal"::numeric / COUNT(*) OVER (PARTITION BY i.id)) AS venda_frac,
               a.data_inicio, a.data_fim,
               (a.data_fim - a.data_inicio + 1) AS dur_total
        FROM folhas i
        JOIN (SELECT * FROM match_exact UNION ALL SELECT * FROM match_contains) m ON m.item_id = i.id
        JOIN norm_ativ a ON a.ativ_id = m.ativ_id
      ),
      proj_sums AS (
        SELECT projeto_id, SUM(venda_frac) AS soma_venda
        FROM all_pairs GROUP BY projeto_id
      ),
      -- Range completo de cada projeto (para gerar meses do timeline todo, não só o ano)
      ativ_any AS (
        SELECT na.projeto_id, MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim
        FROM norm_ativ na GROUP BY na.projeto_id
      ),
      -- Fallback: projetos sem cruzamento → distribuição linear por timeline
      ativ_range AS (
        SELECT na.projeto_id,
               MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim,
               (MAX(na.data_fim) - MIN(na.data_inicio) + 1) AS total_dias
        FROM norm_ativ na
        WHERE na.projeto_id NOT IN (SELECT projeto_id FROM proj_sums WHERE soma_venda > 0)
        GROUP BY na.projeto_id
      ),
      -- Todos os meses do timeline de cada projeto
      meses_all AS (
        SELECT aa.projeto_id,
               generate_series(
                 DATE_TRUNC('month', aa.inicio),
                 DATE_TRUNC('month', aa.fim),
                 '1 month'::interval
               )::date AS mes_inicio
        FROM ativ_any aa
      ),
      -- Distribuição via cruzamento atividade×orçamento
      dist_cruzamento AS (
        SELECT ap.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               SUM(
                 GREATEST(0,
                   LEAST(ap.data_fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                   - GREATEST(ap.data_inicio, m.mes_inicio) + 1
                 )::numeric / NULLIF(ap.dur_total, 0) * ap.venda_frac
               ) AS valor_raw,
               ps.soma_venda
        FROM all_pairs ap
        JOIN meses_all m ON m.projeto_id = ap.projeto_id
          AND m.mes_inicio <= ap.data_fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ap.data_inicio
        JOIN proj_sums ps ON ps.projeto_id = ap.projeto_id
        GROUP BY ap.projeto_id, m.mes_inicio, ps.soma_venda
      ),
      -- Distribuição fallback (linear)
      dist_fallback AS (
        SELECT ar.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               GREATEST(0,
                 LEAST(ar.fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                 - GREATEST(ar.inicio, m.mes_inicio) + 1
               )::numeric / NULLIF(ar.total_dias, 0) AS frac_mes,
               ar.total_dias
        FROM ativ_range ar
        JOIN meses_all m ON m.projeto_id = ar.projeto_id
          AND m.mes_inicio <= ar.fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ar.inicio
      )
      SELECT dc.projeto_id, dc.competencia,
             dc.valor_raw AS valor_previsto_raw,
             dc.soma_venda AS soma_venda,
             NULL::numeric AS frac_fallback
      FROM dist_cruzamento dc WHERE dc.valor_raw > 0
      UNION ALL
      SELECT df.projeto_id, df.competencia,
             NULL AS valor_previsto_raw,
             NULL AS soma_venda,
             df.frac_mes AS frac_fallback
      FROM dist_fallback df WHERE df.frac_mes > 0
      ORDER BY projeto_id, competencia
    `, []),

    // 4. Medições salvas (realizado)
    dbExecute(db, `
      SELECT pm.id, pm.projeto_id,
             SUBSTRING(pm.competencia::text, 1, 7) AS competencia,
             pm.numero, pm.valor_previsto, pm.valor_medido,
             pm.percentual_previsto, pm.percentual_medido,
             pm.status AS status_medicao,
             fr.id AS fr_id, fr.status AS status_financeiro,
             fr.nf_numero, fr.data_vencimento, fr.data_recebimento,
             fr.valor_recebido, fr.valor_medicao AS fr_valor_medicao
      FROM planejamento_medicoes pm
      JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
      LEFT JOIN financial_revenue fr ON fr.medicao_id = pm.id
        AND fr.status NOT IN ('a_faturar','cancelado')
      WHERE pp.company_id = $1
        AND LEFT(pm.competencia::text, 4) = $2
        AND pm.status NOT IN ('cancelada','rejeitada')
      ORDER BY pm.competencia ASC, pm.numero ASC, pm.id ASC
    `, [input.companyId, String(input.ano)]),

    // 5. Standalone financial_revenue (Dar Baixa direto, sem medicao_id)
    //    DISTINCT ON (obra_id, mês) → vence o registro mais recentemente atualizado,
    //    garantindo que um "Dar Baixa" manual sobreponha qualquer FR antigo importado
    //    pela API com valor divergente para o mesmo mês.
    dbExecute(db, `
      SELECT DISTINCT ON (fr.obra_id, TO_CHAR(fr.data_vencimento, 'YYYY-MM'))
             fr.id, fr.obra_id, fr.obra_nome,
             TO_CHAR(fr.data_vencimento, 'YYYY-MM') AS competencia,
             fr.status, fr.data_recebimento, fr.valor_recebido,
             fr.valor_medicao, fr.forma_pagamento, fr.nf_numero, fr.data_vencimento
      FROM financial_revenue fr
      WHERE fr.company_id = $1
        AND fr.medicao_id IS NULL
        AND fr.data_vencimento IS NOT NULL
        AND LEFT(fr.data_vencimento::text, 4) = $2
      ORDER BY fr.obra_id,
               TO_CHAR(fr.data_vencimento, 'YYYY-MM'),
               CASE fr.status
                 WHEN 'recebido_total'   THEN 1
                 WHEN 'recebido_parcial' THEN 2
                 WHEN 'pendente'         THEN 3
                 WHEN 'a_faturar'        THEN 4
                 ELSE 5
               END ASC,
               fr.updated_at DESC NULLS LAST,
               fr.id DESC
    `, [input.companyId, String(input.ano)]),

    // 6. Avanço físico mensal por projeto (Camada 2 - Previsão de Faturamento)
    //    DISTINCT ON = mais eficiente que ROW_NUMBER para este caso
    dbExecute(db, `
      WITH latest_per_month AS (
        SELECT DISTINCT ON (a.id, DATE_TRUNC('month', av.semana))
          a.projeto_id,
          a.id AS atividade_id,
          COALESCE(a.peso_financeiro, 0)::numeric AS peso,
          DATE_TRUNC('month', av.semana)::date AS mes_inicio,
          av.percentual_acumulado::numeric AS pct_acumulado
        FROM planejamento_atividades a
        JOIN planejamento_avancos av ON av.atividade_id = a.id
        WHERE a.projeto_id IN (${idsStr})
          AND NOT a.is_grupo
        ORDER BY a.id, DATE_TRUNC('month', av.semana), av.semana DESC
      ),
      with_prev_month AS (
        SELECT
          lm.*,
          LAG(lm.pct_acumulado) OVER (
            PARTITION BY lm.atividade_id
            ORDER BY lm.mes_inicio
          ) AS pct_mes_anterior
        FROM latest_per_month lm
      ),
      project_total_peso AS (
        SELECT projeto_id, NULLIF(SUM(COALESCE(peso_financeiro, 0)), 0) AS total_peso
        FROM planejamento_atividades
        WHERE projeto_id IN (${idsStr}) AND NOT is_grupo
        GROUP BY projeto_id
      )
      SELECT
        wp.projeto_id,
        TO_CHAR(wp.mes_inicio, 'YYYY-MM') AS competencia,
        SUM(GREATEST(0, (wp.pct_acumulado - COALESCE(wp.pct_mes_anterior, 0))) / 100.0 * wp.peso) AS incremento_peso,
        pt.total_peso
      FROM with_prev_month wp
      JOIN project_total_peso pt ON pt.projeto_id = wp.projeto_id
      GROUP BY wp.projeto_id, wp.mes_inicio, pt.total_peso
      HAVING SUM(GREATEST(0, (wp.pct_acumulado - COALESCE(wp.pct_mes_anterior, 0))) / 100.0 * wp.peso) > 0
      ORDER BY wp.projeto_id, wp.mes_inicio
    `, []),

    // 7. Total recebido histórico (todos os anos) para saldo de contrato
    // Usa DISTINCT ON (obra_id, competencia-mês) para evitar dupla-contagem quando
    // um mesmo mês tem tanto FR importado da API quanto FR criado pelo "Dar Baixa".
    // Mantém apenas o registro mais recentemente atualizado por (obra_id, mês).
    dbExecute(db, `
      SELECT sub.obra_id,
             CASE WHEN sub.obra_id IS NULL THEN sub.obra_nome ELSE NULL END AS obra_nome,
             SUM(COALESCE(sub.valor_recebido, 0)) AS total_recebido
      FROM (
        SELECT DISTINCT ON (
          fr.obra_id,
          TO_CHAR(COALESCE(fr.data_vencimento, fr.data_recebimento), 'YYYY-MM')
        )
          fr.obra_id, fr.obra_nome, fr.valor_recebido
        FROM financial_revenue fr
        WHERE fr.company_id = $1
          AND fr.valor_recebido > 0
        ORDER BY
          fr.obra_id,
          TO_CHAR(COALESCE(fr.data_vencimento, fr.data_recebimento), 'YYYY-MM'),
          fr.updated_at DESC NULLS LAST,
          fr.id DESC
      ) sub
      GROUP BY sub.obra_id,
               CASE WHEN sub.obra_id IS NULL THEN sub.obra_nome ELSE NULL END
    `, [input.companyId]),

    // 8. Baseline: mesma distribuição mas usando a PRIMEIRA revisão aprovada
    //    (baseline do contrato — nunca muda com revisões futuras)
    dbExecute(db, `
      WITH rev_ativa AS (
        SELECT DISTINCT ON (r.projeto_id) r.projeto_id, r.id AS rev_id
        FROM planejamento_revisoes r
        WHERE r.projeto_id IN (${idsStr}) AND r.status = 'aprovada'
        ORDER BY r.projeto_id, r.numero ASC
      ),
      orc_scope AS (
        SELECT i.*, p.id AS projeto_id
        FROM orcamento_itens i
        JOIN planejamento_projetos p ON p.orcamento_id = i."orcamentoId"
        WHERE p.id IN (${idsStr})
          AND (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
      ),
      folhas AS (
        SELECT o.*
        FROM orc_scope o
        WHERE NOT EXISTS (
          SELECT 1 FROM orc_scope c
          WHERE c."eapCodigo" LIKE o."eapCodigo" || '.%'
            AND c.id != o.id AND c.projeto_id = o.projeto_id
        )
      ),
      norm_ativ AS (
        SELECT a.projeto_id, a.id AS ativ_id,
               a.data_inicio::date AS data_inicio, a.data_fim::date AS data_fim,
               LOWER(REGEXP_REPLACE(TRIM(a.nome), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM planejamento_atividades a
        JOIN rev_ativa ra ON ra.rev_id = a.revisao_id AND ra.projeto_id = a.projeto_id
        WHERE NOT a.is_grupo AND a.data_inicio IS NOT NULL AND a.data_fim IS NOT NULL
      ),
      norm_name AS (
        SELECT *, LOWER(REGEXP_REPLACE(TRIM(descricao), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM folhas
      ),
      match_exact AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM norm_name i JOIN norm_ativ a ON a.nome_norm = i.nome_norm AND a.projeto_id = i.projeto_id
      ),
      match_contains AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM norm_name i JOIN norm_ativ a
          ON (a.nome_norm LIKE '%' || i.nome_norm || '%' OR i.nome_norm LIKE '%' || a.nome_norm || '%')
          AND a.projeto_id = i.projeto_id
        WHERE NOT EXISTS (SELECT 1 FROM match_exact m WHERE m.item_id = i.id)
          AND LENGTH(i.nome_norm) >= 5 AND LENGTH(a.nome_norm) >= 5
      ),
      all_pairs AS (
        SELECT i.projeto_id, i.id AS item_id,
               (i."vendaTotal"::numeric / COUNT(*) OVER (PARTITION BY i.id)) AS venda_frac,
               a.data_inicio, a.data_fim,
               (a.data_fim - a.data_inicio + 1) AS dur_total
        FROM folhas i
        JOIN (SELECT * FROM match_exact UNION ALL SELECT * FROM match_contains) m ON m.item_id = i.id
        JOIN norm_ativ a ON a.ativ_id = m.ativ_id
      ),
      proj_sums AS (
        SELECT projeto_id, SUM(venda_frac) AS soma_venda
        FROM all_pairs GROUP BY projeto_id
      ),
      ativ_any AS (
        SELECT na.projeto_id, MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim
        FROM norm_ativ na GROUP BY na.projeto_id
      ),
      ativ_range AS (
        SELECT na.projeto_id,
               MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim,
               (MAX(na.data_fim) - MIN(na.data_inicio) + 1) AS total_dias
        FROM norm_ativ na
        WHERE na.projeto_id NOT IN (SELECT projeto_id FROM proj_sums WHERE soma_venda > 0)
        GROUP BY na.projeto_id
      ),
      meses_all AS (
        SELECT aa.projeto_id,
               generate_series(
                 DATE_TRUNC('month', aa.inicio),
                 DATE_TRUNC('month', aa.fim),
                 '1 month'::interval
               )::date AS mes_inicio
        FROM ativ_any aa
      ),
      dist_cruzamento AS (
        SELECT ap.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               SUM(
                 GREATEST(0,
                   LEAST(ap.data_fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                   - GREATEST(ap.data_inicio, m.mes_inicio) + 1
                 )::numeric / NULLIF(ap.dur_total, 0) * ap.venda_frac
               ) AS valor_raw,
               ps.soma_venda
        FROM all_pairs ap
        JOIN meses_all m ON m.projeto_id = ap.projeto_id
          AND m.mes_inicio <= ap.data_fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ap.data_inicio
        JOIN proj_sums ps ON ps.projeto_id = ap.projeto_id
        GROUP BY ap.projeto_id, m.mes_inicio, ps.soma_venda
      ),
      dist_fallback AS (
        SELECT ar.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               GREATEST(0,
                 LEAST(ar.fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                 - GREATEST(ar.inicio, m.mes_inicio) + 1
               )::numeric / NULLIF(ar.total_dias, 0) AS frac_mes,
               ar.total_dias
        FROM ativ_range ar
        JOIN meses_all m ON m.projeto_id = ar.projeto_id
          AND m.mes_inicio <= ar.fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ar.inicio
      )
      SELECT dc.projeto_id, dc.competencia,
             dc.valor_raw AS valor_previsto_raw,
             dc.soma_venda AS soma_venda,
             NULL::numeric AS frac_fallback
      FROM dist_cruzamento dc WHERE dc.valor_raw > 0
      UNION ALL
      SELECT df.projeto_id, df.competencia,
             NULL AS valor_previsto_raw,
             NULL AS soma_venda,
             df.frac_mes AS frac_fallback
      FROM dist_fallback df WHERE df.frac_mes > 0
      ORDER BY projeto_id, competencia
    `, []),

    ]); // fim Promise.all

    // 9. Avanço físico acumulado GLOBAL — mesma fórmula do REFIS "Global (c/ Indiretas)":
    //    Detecta automaticamente o modo de ponderação por projeto:
    //    • Modo financeiro (peso_financeiro): quando as atividades COM avanço positivo têm peso_financeiro>0
    //    • Modo duração (duracao_dias):       quando as atividades COM avanço positivo têm peso_financeiro=0
    //    Indiretas → previsto proporcional ao prazo: (próxima seg - data_inicio) / (data_fim - data_inicio) × 100
    const avancoFisicoRes = await dbExecute(db, `
      WITH
      -- Revisão ativa por projeto: última revisão com status='aprovada' (igual ao frontend)
      rev_ativa AS (
        SELECT DISTINCT ON (projeto_id)
          projeto_id, id AS revisao_id
        FROM planejamento_revisoes
        WHERE projeto_id IN (${idsStr})
          AND status = 'aprovada'
        ORDER BY projeto_id, numero DESC
      ),
      -- Detecta soma de peso_financeiro das atividades DIRETAS com avanço positivo
      -- Se = 0 → projeto usa ponderação por duração (ex: QIU 2 importado do MS Project)
      -- Se > 0 → projeto usa ponderação financeira (ex: HOTEL DO PAPA com orçamento)
      proj_mode AS (
        SELECT pa.projeto_id,
               COALESCE((
                 SELECT SUM(a2.peso_financeiro::numeric)
                 FROM planejamento_avancos av2
                 JOIN planejamento_atividades a2 ON a2.id = av2.atividade_id
                 JOIN rev_ativa ra2 ON ra2.projeto_id = a2.projeto_id AND ra2.revisao_id = a2.revisao_id
                 WHERE a2.projeto_id = pa.projeto_id
                   AND NOT COALESCE(a2.is_grupo, false)
                   AND NOT COALESCE(a2.is_indireta, false)
                   AND av2.percentual_acumulado::numeric > 0
               ), 0) AS peso_diretas_avanco
        FROM planejamento_atividades pa
        JOIN rev_ativa ra ON ra.projeto_id = pa.projeto_id AND ra.revisao_id = pa.revisao_id
        WHERE pa.projeto_id IN (${idsStr})
          AND NOT COALESCE(pa.is_grupo, false)
        GROUP BY pa.projeto_id
      ),
      -- Configuração por projeto: modo de ponderação e denominador total
      -- Somente atividades da revisão ativa
      proj_cfg AS (
        SELECT pa.projeto_id,
               (pm.peso_diretas_avanco = 0) AS usar_duracao,
               CASE
                 WHEN pm.peso_diretas_avanco > 0 THEN
                   -- Modo financeiro: denominador = soma de peso_financeiro (ou contagem se todos zero)
                   CASE WHEN SUM(COALESCE(pa.peso_financeiro::numeric, 0)) > 0
                        THEN SUM(COALESCE(pa.peso_financeiro::numeric, 0))
                        ELSE COUNT(*)::numeric
                   END
                 ELSE
                   -- Modo duração: denominador = soma de duracao_dias
                   NULLIF(SUM(COALESCE(pa.duracao_dias::numeric, 0)), 0)
               END AS total_peso
        FROM planejamento_atividades pa
        JOIN rev_ativa ra ON ra.projeto_id = pa.projeto_id AND ra.revisao_id = pa.revisao_id
        JOIN proj_mode pm ON pm.projeto_id = pa.projeto_id
        WHERE pa.projeto_id IN (${idsStr})
          AND NOT COALESCE(pa.is_grupo, false)
        GROUP BY pa.projeto_id, pm.peso_diretas_avanco
      ),
      -- Diretas: valor real registrado em planejamento_avancos (percentual mais recente)
      -- NULL em is_indireta é tratado como FALSE (atividade direta)
      diretas AS (
        SELECT DISTINCT ON (av.atividade_id)
          a.projeto_id,
          CASE
            WHEN pc.usar_duracao THEN COALESCE(a.duracao_dias::numeric, 0)
            WHEN COALESCE(a.peso_financeiro::numeric, 0) > 0 THEN a.peso_financeiro::numeric
            ELSE 1::numeric
          END AS peso,
          av.percentual_acumulado::numeric AS val
        FROM planejamento_atividades a
        JOIN planejamento_avancos av ON av.atividade_id = a.id
        JOIN rev_ativa ra ON ra.projeto_id = a.projeto_id AND ra.revisao_id = a.revisao_id
        JOIN proj_cfg pc ON pc.projeto_id = a.projeto_id
        WHERE a.projeto_id IN (${idsStr})
          AND NOT COALESCE(a.is_grupo, false)
          AND NOT COALESCE(a.is_indireta, false)
        ORDER BY av.atividade_id, av.semana DESC
      ),
      -- Indiretas: previsto proporcional ao prazo (ref = próxima segunda-feira)
      indiretas AS (
        SELECT
          a.projeto_id,
          CASE
            WHEN pc.usar_duracao THEN COALESCE(a.duracao_dias::numeric, 0)
            WHEN COALESCE(a.peso_financeiro::numeric, 0) > 0 THEN a.peso_financeiro::numeric
            ELSE 1::numeric
          END AS peso,
          CASE
            WHEN a.data_fim IS NULL OR a.data_inicio IS NULL THEN 0
            WHEN (date_trunc('week', CURRENT_DATE)::date + 7) >= a.data_fim::date THEN 100
            WHEN (date_trunc('week', CURRENT_DATE)::date + 7) <= a.data_inicio::date THEN 0
            ELSE ((date_trunc('week', CURRENT_DATE)::date + 7) - a.data_inicio::date)::numeric
                 / (a.data_fim::date - a.data_inicio::date)::numeric * 100
          END AS val
        FROM planejamento_atividades a
        JOIN rev_ativa ra ON ra.projeto_id = a.projeto_id AND ra.revisao_id = a.revisao_id
        JOIN proj_cfg pc ON pc.projeto_id = a.projeto_id
        WHERE a.projeto_id IN (${idsStr})
          AND NOT COALESCE(a.is_grupo, false)
          AND COALESCE(a.is_indireta, false) = true
      ),
      combined AS (
        SELECT projeto_id, peso, val FROM diretas
        UNION ALL
        SELECT projeto_id, peso, val FROM indiretas
      )
      SELECT
        c.projeto_id,
        ROUND(
          CASE WHEN pc.total_peso > 0
          THEN SUM(c.val * c.peso) / pc.total_peso
          ELSE 0 END, 2
        ) AS avanco_fisico_pct
      FROM combined c
      JOIN proj_cfg pc ON pc.projeto_id = c.projeto_id
      GROUP BY c.projeto_id, pc.total_peso
    `, []);
    const avancoFisicoByProjId: Record<number, number> = {};
    for (const r of avancoFisicoRes.rows) {
      const v = parseFloat(r.avanco_fisico_pct ?? "0");
      if (!isNaN(v)) avancoFisicoByProjId[Number(r.projeto_id)] = v;
    }
    console.log(`[ContasReceber] company=${input.companyId} ano=${input.ano} projetos=${projetos.length} prev_rows=${prevRes.rows.length} medicoes=${medRes.rows.length} tempo=${Date.now()-t0}ms`);

    const prevRows = prevRes.rows;
    const medicoes = medRes.rows;

    // Indexa por projeto_id → mes, cruzando obra_id ou obra_nome
    const obraIdToProjId: Record<number, number> = {};
    const obraNameToProjId: Record<string, number> = {};
    for (const p of projetos) {
      const pid = Number(p.projeto_id);
      if (p.obra_id) obraIdToProjId[Number(p.obra_id)] = pid;
      const nome = (p.obra_nome ?? p.projeto_nome ?? "").trim().toLowerCase();
      if (nome) obraNameToProjId[nome] = pid;
    }

    const standaloneByProjetoByMes: Record<number, Record<string, any>> = {};
    for (const fr of stRes.rows) {
      let pid: number | undefined;
      if (fr.obra_id) pid = obraIdToProjId[Number(fr.obra_id)];
      if (!pid) {
        const nome = (fr.obra_nome ?? "").trim().toLowerCase();
        if (nome) pid = obraNameToProjId[nome];
      }
      if (!pid) continue;
      const mes = String(fr.competencia);
      if (!standaloneByProjetoByMes[pid]) standaloneByProjetoByMes[pid] = {};
      standaloneByProjetoByMes[pid][mes] = fr;
    }

    // Processa previsão de faturamento (resultado da query 6)
    const configByProjeto: Record<number, any> = {};
    for (const c of configRes.rows) configByProjeto[Number(c.projeto_id)] = c;

    const previsaoByProjeto: Record<number, Record<string, number>> = {};
    for (const r of previsaoFatRes.rows) {
      const pid = Number(r.projeto_id);
      const mes = String(r.competencia);
      const totalPeso = parseFloat(r.total_peso ?? "0") || 0;
      const incrementoPeso = parseFloat(r.incremento_peso ?? "0") || 0;
      if (!previsaoByProjeto[pid]) previsaoByProjeto[pid] = {};
      const proj = projetoMap[pid];
      const totalVenda = parseFloat(proj?.total_venda ?? "0") || parseFloat(proj?.valor_contrato ?? "0") || 0;
      if (totalPeso > 0 && totalVenda > 0) {
        previsaoByProjeto[pid][mes] = (previsaoByProjeto[pid][mes] ?? 0) + (incrementoPeso / totalPeso) * totalVenda;
      }
    }

    // Processa total recebido histórico (resultado da query 7)
    const totalRecebidoHistByProjId: Record<number, number> = {};
    for (const r of totalRecebidoHistRes.rows) {
      let pid: number | undefined;
      if (r.obra_id) pid = obraIdToProjId[Number(r.obra_id)];
      if (!pid) {
        const nome = (r.obra_nome ?? "").trim().toLowerCase();
        if (nome) pid = obraNameToProjId[nome];
      }
      if (!pid) continue;
      totalRecebidoHistByProjId[pid] = (totalRecebidoHistByProjId[pid] ?? 0) + parseFloat(r.total_recebido ?? "0");
    }

    // Rev. 1347: helper para deslocar competência → mês de recebimento previsto.
    // recebimento = data de corte do mês de competência + N dias úteis (pula sáb/dom).
    // Quando prazoDiasUteis = 0, mantém o próprio mês de competência.
    const shiftToRecebimentoMes = (competenciaMes: string, diaCorte: number, prazoDiasUteis: number): string => {
      if (!prazoDiasUteis || prazoDiasUteis <= 0) return competenciaMes;
      const [y, m] = competenciaMes.split("-").map(Number);
      if (!y || !m) return competenciaMes;
      const lastDay = new Date(y, m, 0).getDate();
      const diaCorteEfetivo = Math.min(Math.max(1, diaCorte || 30), lastDay);
      const dataRec = new Date(y, m - 1, diaCorteEfetivo);
      let restantes = prazoDiasUteis;
      while (restantes > 0) {
        dataRec.setDate(dataRec.getDate() + 1);
        const dow = dataRec.getDay();
        if (dow !== 0 && dow !== 6) restantes--;
      }
      return `${dataRec.getFullYear()}-${String(dataRec.getMonth() + 1).padStart(2, "0")}`;
    };

    // Helper: converte rows de distribuição em previsto líquido por projeto+mês
    //         (aplica tipo, retenção, sinal conforme planejamento_medicao_config)
    //         Rev. 1347: reindexa por MÊS DE RECEBIMENTO (competência + prazoDiasUteis úteis)
    //         para refletir corretamente o cronograma de Contas a Receber.
    const buildPrevDist = (rows: any[]): Record<number, Record<string, number>> => {
      const raw: Record<number, Record<string, number>> = {};
      const soma: Record<number, number> = {};
      for (const r of rows) {
        const pid = Number(r.projeto_id);
        const mes = String(r.competencia);
        if (!raw[pid]) raw[pid] = {};
        const p = projetoMap[pid];
        const totalVenda = parseFloat(p?.total_venda ?? "0") || parseFloat(p?.valor_contrato ?? "0") || 0;
        if (r.valor_previsto_raw !== null && r.valor_previsto_raw !== undefined) {
          raw[pid][mes] = (raw[pid][mes] ?? 0) + parseFloat(r.valor_previsto_raw);
          if (!soma[pid]) soma[pid] = parseFloat(r.soma_venda ?? "0") || 0;
        } else if (r.frac_fallback !== null && r.frac_fallback !== undefined) {
          raw[pid][mes] = (raw[pid][mes] ?? 0) + parseFloat(r.frac_fallback) * totalVenda;
        }
      }
      for (const p of projetos) {
        const pid = Number(p.projeto_id);
        const totalVenda = parseFloat(p.total_venda ?? "0") || parseFloat(p.valor_contrato ?? "0") || 0;
        const s = soma[pid] ?? 0;
        if (s > 0 && totalVenda > 0 && Math.abs(s - totalVenda) > 1) {
          const esc = totalVenda / s;
          for (const mes of Object.keys(raw[pid] ?? {})) raw[pid][mes] *= esc;
        }
      }
      const result: Record<number, Record<string, number>> = {};
      for (const p of projetos) {
        const pid = Number(p.projeto_id);
        const cfg = configByProjeto[pid];
        const totalVenda = parseFloat(p.total_venda ?? "0") || parseFloat(p.valor_contrato ?? "0") || 0;
        const vendaByMes = raw[pid] ?? {};
        const tipoMedicao = cfg?.tipo_medicao ?? "avanco";
        const retencaoPct = parseFloat(cfg?.retencao_pct ?? "0") || 0;
        result[pid] = {};
        if (tipoMedicao === "parcela_fixa" && cfg) {
          const entrada = parseFloat(cfg.entrada ?? "0") || 0;
          const numeroParcelas = Math.max(1, parseInt(cfg.numero_parcelas ?? "6") || 6);
          const priDataMes = Object.keys(vendaByMes).sort()[0] ?? null;
          const inicioMes = (cfg.inicio_faturamento as string | null)?.substring(0, 7) ?? priDataMes;
          if (inicioMes) {
            const [anoIni, mesIni] = inicioMes.split("-").map(Number);
            const saldoParcelar = Math.max(0, totalVenda - entrada);
            const valorParcelaManual = parseFloat(cfg.valor_parcela_fixa ?? "0") || 0;
            const parcelaBase = (valorParcelaManual > 0 && numeroParcelas > 0)
              ? valorParcelaManual
              : (numeroParcelas > 0 ? saldoParcelar / numeroParcelas : 0);
            const valorUltimaParcela = numeroParcelas > 1
              ? Math.max(0, saldoParcelar - parcelaBase * (numeroParcelas - 1))
              : saldoParcelar;
            if (entrada > 0) result[pid][inicioMes] = (result[pid][inicioMes] ?? 0) + entrada;
            for (let i = 1; i <= numeroParcelas; i++) {
              const offset = mesIni - 1 + i;
              const pmAno = anoIni + Math.floor(offset / 12);
              const pmMes = (offset % 12) + 1;
              const pm = `${pmAno}-${String(pmMes).padStart(2, "0")}`;
              const parcelaValor = (i === numeroParcelas) ? valorUltimaParcela : parcelaBase;
              result[pid][pm] = (result[pid][pm] ?? 0) + parcelaValor;
            }
          }
        } else {
          const sinalValor = parseFloat(cfg?.sinal_valor ?? "0") || 0;
          const sinalPct   = parseFloat(cfg?.sinal_pct   ?? "0") || 0;
          const dataInicioObra = (cfg?.data_inicio_obra as string | null) ?? null;
          // Rev. 1347: data exata do pagamento do sinal (substitui dataInicioObra para
          // posicionamento na matriz de Contas a Receber); fallback para dataInicioObra.
          const dataPrimeiroFat = (cfg?.data_primeiro_faturamento as string | null) ?? null;
          // Rev. 1347: prazo de recebimento em dias úteis (ex.: 15 = cliente paga 15
          // dias úteis após o fechamento da medição).
          const prazoRecDiasUteis = parseInt(cfg?.prazo_recebimento_dias_uteis ?? "0") || 0;
          const diaCorte = parseInt(cfg?.dia_corte ?? "30") || 30;
          // Rev. 1348: base de cálculo do sinal: 'contrato' (default) ou 'mao_de_obra'.
          // Quando 'mao_de_obra', o sinal incide apenas sobre a parcela de MDO do contrato.
          // Rev. 1349: alinha com o cliente (PlanejamentoDetalhe.previsoesMensais) — em modo
          // 'contrato' subtrai o Faturamento Direto (fd_valor manual ou fd_sugerido do BDI),
          // pois a parcela FD é faturada diretamente e não compõe a base do sinal.
          const sinalBase = String(cfg?.sinal_base ?? "contrato");
          const totalMdoProj = parseFloat(p.total_mdo ?? "0") || 0;
          const fdValorCfg = cfg?.fd_valor !== null && cfg?.fd_valor !== undefined
            ? (parseFloat(cfg.fd_valor) || 0)
            : null;
          const fdSugProj  = parseFloat(p.fd_sugerido ?? "0") || 0;
          const fdEfetivo  = fdValorCfg !== null ? fdValorCfg : fdSugProj;
          const baseSinalCalc = sinalBase === "mao_de_obra" && totalMdoProj > 0
            ? totalMdoProj
            : Math.max(0, totalVenda - fdEfetivo);
          const sinalRaw   = sinalValor > 0 ? sinalValor : (baseSinalCalc * sinalPct / 100);
          const sinalTotal = Math.max(0, Math.min(sinalRaw, totalVenda));
          const hasSinal   = sinalTotal > 0 && (dataPrimeiroFat !== null || dataInicioObra !== null);
          const baseMedicoes = hasSinal ? totalVenda - sinalTotal : totalVenda;
          const escala = totalVenda > 0 ? baseMedicoes / totalVenda : 1;
          const mesesOrd = Object.keys(vendaByMes).sort();
          let somaArr = 0, totalRet = 0, lastMes = "";
          for (let i = 0; i < mesesOrd.length; i++) {
            const mes = mesesOrd[i];
            const bruta = i === mesesOrd.length - 1
              ? parseFloat((baseMedicoes - somaArr).toFixed(2))
              : parseFloat(((vendaByMes[mes] ?? 0) * escala).toFixed(2));
            somaArr += bruta;
            const ret = parseFloat((bruta * retencaoPct / 100).toFixed(2));
            // Rev. 1347: usa mês de recebimento (competência + N dias úteis) em vez da
            // própria competência para refletir o ciclo real do cliente.
            const mesRec = shiftToRecebimentoMes(mes, diaCorte, prazoRecDiasUteis);
            result[pid][mesRec] = (result[pid][mesRec] ?? 0) + parseFloat((bruta - ret).toFixed(2));
            totalRet += ret;
            lastMes = mes;
          }
          if (hasSinal) {
            // Rev. 1347: SINAL cai no mês da data de pagamento informada (ou início da obra como fallback).
            // Não soma prazo de dias úteis — sinal é antecipado por contrato.
            const sinalDataExata = dataPrimeiroFat ?? dataInicioObra ?? "";
            const sinalMes = sinalDataExata.substring(0, 7);
            if (sinalMes) result[pid][sinalMes] = (result[pid][sinalMes] ?? 0) + sinalTotal;
          }
          if (totalRet > 0 && lastMes) {
            // Rev. 1347: retenção liberada também sofre prazo de N dias úteis após a competência
            // do mês seguinte ao último mês da obra (mês padrão de liberação).
            const [aU, mU] = lastMes.split("-").map(Number);
            const nd = new Date(aU, mU, 1);
            const liberacaoCompetencia = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
            const mesRecRetencao = shiftToRecebimentoMes(liberacaoCompetencia, diaCorte, prazoRecDiasUteis);
            result[pid][mesRecRetencao] = (result[pid][mesRecRetencao] ?? 0) + parseFloat(totalRet.toFixed(2));
          }
        }
      }
      return result;
    };

    // 4+5. Calcula distribuição para cronograma (última revisão) e baseline (primeira revisão)
    const prevByProjeto = buildPrevDist(prevRows);
    const prevBaselineByProjeto = buildPrevDist(prevBaselineRes.rows);

    // 6. Mapa medições salvas por projeto+mês
    const medByProjeto: Record<number, any[]> = {};
    for (const m of medicoes) {
      const pid = Number(m.projeto_id);
      if (!medByProjeto[pid]) medByProjeto[pid] = [];
      medByProjeto[pid].push(m);
    }

    // 6. Meses do ano
    const meses12 = Array.from({ length: 12 }, (_, i) =>
      `${input.ano}-${String(i + 1).padStart(2, "0")}`
    );

    // 7. KPIs e totais mensais
    let totalContrato = 0, totalPrevisto = 0, totalFaturado = 0, totalRecebido = 0, totalPrevisaoFat = 0;
    const totaisMes: Record<string, number> = {};
    for (const p of projetos) {
      totalContrato += parseFloat(p.total_venda ?? p.valor_contrato ?? "0") || 0;
    }
    for (const mes of meses12) {
      for (const pid of projetoIds) {
        // Se há medição salva, usa ela; senão usa previsto calculado.
        // Usa last-wins (igual ao medByMes em projetos.map) para evitar inflação
        // quando existem múltiplos PM records para o mesmo (projeto, mês) — ex:
        // um criado pelo backfill e outro pelo "Dar Baixa".
        const meds = (medByProjeto[pid] ?? []).filter((m: any) => String(m.competencia).slice(0, 7) === mes);
        const lastMed = meds.length > 0 ? meds[meds.length - 1] : null;
        const val = lastMed
          ? (parseFloat(lastMed.valor_medido ?? "0") || parseFloat(lastMed.valor_previsto ?? "0") || 0)
          : (prevByProjeto[pid]?.[mes] ?? 0);
        totaisMes[mes] = (totaisMes[mes] ?? 0) + val;
        totalPrevisto += val;

        // Previsão de faturamento: soma apenas onde não há medição formal nem standalone
        const hasMedicao = meds.length > 0;
        const hasStandalone = !!(standaloneByProjetoByMes[pid]?.[mes]);
        if (!hasMedicao && !hasStandalone) {
          totalPrevisaoFat += previsaoByProjeto[pid]?.[mes] ?? 0;
        }
      }
    }
    // Fallback: sem avanço físico registrado → Prev. Faturamento usa previsto cronograma
    // de meses que ainda não têm medição nem FR standalone (pipeline a ser faturado).
    if (totalPrevisaoFat === 0) {
      for (const mes of meses12) {
        for (const pid of projetoIds) {
          const hasMed = (medByProjeto[pid] ?? []).some(
            (m: any) => String(m.competencia).slice(0, 7) === mes
          );
          const hasSt = !!(standaloneByProjetoByMes[pid]?.[mes]);
          if (!hasMed && !hasSt) {
            totalPrevisaoFat += prevByProjeto[pid]?.[mes] ?? 0;
          }
        }
      }
    }
    // Statuses que representam "já faturado / recebido" (não entram no A Faturar)
    const FATURADO_SET = new Set(["faturado","a_receber","recebido_parcial","recebido_total","confirmado"]);
    // Statuses que representam "previsto puro" (já contados como cronograma no loop acima)
    const PREVISTO_SET = new Set(["previsto","previsao_faturamento",null,undefined]);
    for (const m of medicoes) {
      const val = parseFloat(m.valor_medido ?? "0") || parseFloat(m.valor_previsto ?? "0") || 0;
      // sf: usa status_financeiro se disponível; caso PM seja 'confirmado' trata como recebido_total
      const sf = m.status_financeiro === null && m.status_medicao === "confirmado"
        ? "recebido_total"
        : (m.status_financeiro ?? m.status_medicao);
      if (FATURADO_SET.has(sf)) totalFaturado += val;
      if (["recebido_parcial","recebido_total"].includes(sf)) totalRecebido += parseFloat(m.valor_recebido ?? "0") || val;
      // PM pendente de faturamento (a_faturar): tem valor mas não está confirmada/recebida/previsto-puro
      // Esses meses não foram contados no loop de cronograma (hasMedicao=true → foram pulados)
      if (val > 0 && !FATURADO_SET.has(sf) && !PREVISTO_SET.has(sf ?? null)) {
        totalPrevisaoFat += val;
      }
    }
    // Standalone FRs (Dar Baixa direto, sem medicao) — só contar meses sem PM para evitar dupla contagem
    for (const [pidStr, mesMap] of Object.entries(standaloneByProjetoByMes)) {
      const pid = Number(pidStr);
      for (const [mes, fr] of Object.entries(mesMap as Record<string, any>)) {
        const hasPm = (medByProjeto[pid] ?? []).some(
          (m: any) => String(m.competencia).slice(0, 7) === mes
        );
        if (hasPm) continue; // PM já contabilizado no loop anterior
        const sf = (fr as any).status;
        if (["recebido_parcial","recebido_total"].includes(sf)) {
          totalRecebido += parseFloat((fr as any).valor_recebido ?? "0") || 0;
          totalFaturado += parseFloat((fr as any).valor_recebido ?? "0") || 0;
        }
      }
    }

    return {
      ano: input.ano,
      projetos: projetos.map((p: any) => {
        const pid = Number(p.projeto_id);
        const meds = medByProjeto[pid] ?? [];
        const medByMes: Record<string, any> = {};
        for (const m of meds) medByMes[String(m.competencia).slice(0, 7)] = m;
        const valorContrato = parseFloat(p.total_venda ?? p.valor_contrato ?? "0") || 0;
        const totalRecebidoHistorico = totalRecebidoHistByProjId[pid] ?? 0;
        const avancoFisicoReal = avancoFisicoByProjId[pid] ?? null;
        return {
          projetoId: pid,
          obraId: p.obra_id ? Number(p.obra_id) : null,
          obraNome: p.obra_nome ?? p.projeto_nome,
          cliente: p.cliente,
          valorContrato,
          totalRecebidoHistorico,
          avancoFisicoReal,
          saldoContrato: Math.max(0, valorContrato - totalRecebidoHistorico),
          // Células mensais: previsto calculado + realizado salvo + previsão faturamento
          meses: Object.fromEntries(meses12.map(mes => {
            const previsto = prevByProjeto[pid]?.[mes] ?? 0;
            const prevBaseline = prevBaselineByProjeto[pid]?.[mes] ?? 0;
            const previsao = previsaoByProjeto[pid]?.[mes] ?? 0;
            const med = medByMes[mes];
            const standaloneFr = standaloneByProjetoByMes[pid]?.[mes] ?? null;
            const valorMedido = med ? (parseFloat(med.valor_medido ?? "0") || parseFloat(med.valor_previsto ?? "0") || 0) : 0;
            let sf: string | null;
            let frId: number | null = null;
            let dataRecebimento: string | null = null;
            let valorRecebido = 0;
            let dataVencimento: string | null = null;
            let nfNumero: string | null = null;
            if (med) {
              sf = med.status_financeiro ?? med.status_medicao ?? "previsto";
              frId = med.fr_id ?? null;
              dataRecebimento = med.data_recebimento ?? null;
              valorRecebido = parseFloat(med.valor_recebido ?? "0") || 0;
              dataVencimento = med.data_vencimento ?? null;
              nfNumero = med.nf_numero ?? null;
              // PM confirmada mas sem FR vinculado (registrarRecebimento cria FR com
              // medicao_id=NULL, então o LEFT JOIN não encontra). Mescla dados do FR
              // standalone SOMENTE se o FR for 'recebido_total' — nunca 'a_faturar'.
              if (!med.fr_id && !med.status_financeiro && sf === "confirmado" &&
                  standaloneFr?.status === "recebido_total") {
                sf = "recebido_total";
                frId = Number(standaloneFr.id);
                dataRecebimento = standaloneFr.data_recebimento ?? null;
                valorRecebido = parseFloat(standaloneFr.valor_recebido ?? "0") || 0;
                dataVencimento = standaloneFr.data_vencimento ?? null;
                nfNumero = standaloneFr.nf_numero ?? null;
              } else if (!med.fr_id && !med.status_financeiro && sf === "confirmado") {
                // Sem FR standalone também: trata como recebido_total para exibição correta
                sf = "recebido_total";
                valorRecebido = valorMedido;
              }
            } else if (standaloneFr) {
              sf = standaloneFr.status ?? "recebido_total";
              frId = Number(standaloneFr.id);
              dataRecebimento = standaloneFr.data_recebimento ?? null;
              valorRecebido = parseFloat(standaloneFr.valor_recebido ?? "0") || 0;
              dataVencimento = standaloneFr.data_vencimento ?? null;
              nfNumero = standaloneFr.nf_numero ?? null;
            } else {
              sf = previsto > 0 ? "previsto" : (previsao > 0 ? "previsao_faturamento" : null);
            }
            return [mes, {
              valorPrevisto: previsto,
              valorContratoBL: prevBaseline,
              valorMedido,
              valorPrevisao: previsao,
              status: sf,
              medicaoId: med?.id ?? null,
              frId,
              nfNumero,
              dataVencimento,
              dataRecebimento,
              valorRecebido,
            }];
          })),
          // Medições salvas (compatibilidade com painel lateral)
          medicoes: meds.map((m: any) => ({
            id: m.id,
            competencia: String(m.competencia).slice(0, 7),
            numero: m.numero,
            valorPrevisto: parseFloat(m.valor_previsto ?? "0") || 0,
            valorMedido: parseFloat(m.valor_medido ?? "0") || 0,
            percentualPrevisto: parseFloat(m.percentual_previsto ?? "0") || 0,
            percentualMedido: parseFloat(m.percentual_medido ?? "0") || 0,
            statusMedicao: m.status_medicao ?? "pendente",
            statusFinanceiro: m.status_financeiro ?? null,
            frId: m.fr_id ?? null,
            nfNumero: m.nf_numero ?? null,
            dataVencimento: m.data_vencimento ?? null,
            dataRecebimento: m.data_recebimento ?? null,
            valorRecebido: parseFloat(m.valor_recebido ?? "0") || 0,
          })),
        };
      }),
      totaisMes,
      kpis: {
        totalContrato,
        totalPrevisto,
        totalPrevisaoFaturamento: totalPrevisaoFat,
        totalFaturado,
        totalAReceber: Math.max(0, totalFaturado - totalRecebido),
        totalRecebido,
      },
    };
  }),
});
