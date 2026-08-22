import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getEffectiveAllowedObraIds } from "../db";
import { eq, and, desc, asc, or, sql, lte, inArray } from "drizzle-orm";
import {
  fornecedores,
  purchaseCatalogItems,
  supplierPriceHistory,
  supplierEvaluations,
  supplierContracts,
  purchaseApprovalRules,
  purchaseSpendingLimits,
  ocNumberConfig,
  purchaseRequests,
  purchaseRequestItems,
  purchaseQuotations,
  purchaseQuotationSuppliers,
  purchaseQuotationTokens,
  purchaseNegotiations,
  purchaseOrders,
  purchaseOrderItems,
  purchaseReceipts,
  purchaseReceiptItems,
  purchaseAccountsPayable,
  budgetReallocations,
  buyerCommissions,
  emergencyMetrics,
  purchaseCancellations,
  obras,
  almoxarifadoRecebimentos,
  almoxarifadoRecebimentoItens,
  comprasOrdens,
  comprasOrdensItens,
  comprasSolicitacoesItens,
} from "../../drizzle/schema";
import { onOCEmitida, onOCCancelada, onRecebimentoConfirmado, onComissaoAprovada } from "../services/purchaseFinancialBridge";

// ── Rev. 5104 — Regras de Comissão de Compras (documento versionado) ──
let _comissaoRegrasTablesOk = false;
async function ensureComissaoRegrasTables(db: any) {
  if (_comissaoRegrasTablesOk) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS compras_comissao_regras (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      versao INTEGER NOT NULL,
      percentual NUMERIC(6,2) NOT NULL DEFAULT 10,
      gatilho_min_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
      teto_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
      antecipacao_max_pct NUMERIC(6,2) NOT NULL DEFAULT 40,
      texto_complementar TEXT NOT NULL DEFAULT '',
      criado_por_id INTEGER NOT NULL DEFAULT 0,
      criado_por_nome TEXT NOT NULL DEFAULT '',
      vigente INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      encerrado_em TIMESTAMPTZ
    )`);
  // Garantias de integridade do versionamento (corrida entre saves simultâneos)
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissao_regras_company_versao ON compras_comissao_regras (company_id, versao)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissao_regras_vigente ON compras_comissao_regras (company_id) WHERE vigente = 1`);
  // Rev. 5105 — scorecard de KPIs ponderados (soma 100%)
  await db.execute(sql`ALTER TABLE compras_comissao_regras ADD COLUMN IF NOT EXISTS kpis_json TEXT NOT NULL DEFAULT ''`);
  // Rev. 5108 — prêmio escalonado progressivo por faixas de economia
  await db.execute(sql`ALTER TABLE compras_comissao_regras ADD COLUMN IF NOT EXISTS faixas_json TEXT NOT NULL DEFAULT ''`);
  // Rev. 5107 — adesões ao programa (termo assinado online via IntegraSign)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS compras_premio_adesoes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_nome TEXT NOT NULL DEFAULT '',
      regra_versao INTEGER NOT NULL DEFAULT 1,
      envelope_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pendente',
      aceite_ciencia_em TIMESTAMPTZ,
      concluido_em TIMESTAMPTZ,
      employee_doc_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_premio_adesao_ativa ON compras_premio_adesoes (company_id, user_id) WHERE status IN ('pendente','concluido')`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS compras_comissao_antecipacoes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      obra_id INTEGER NOT NULL,
      comprador_nome TEXT NOT NULL,
      valor NUMERIC(14,2) NOT NULL,
      observacao TEXT NOT NULL DEFAULT '',
      criado_por_id INTEGER NOT NULL DEFAULT 0,
      criado_por_nome TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  _comissaoRegrasTablesOk = true;
}

// Rev. 5107 — HTML do Termo de Adesão (consome template ISO vigente com fallback ao seed)
async function buildTermoAdesaoHtml(db: any, companyId: number, opts: { participanteNome: string; participanteCpf?: string; participanteFuncao?: string }) {
  const { getSeedTemplate } = await import("../../shared/documentTemplates");
  const regraRow: any = await db.execute(sql`SELECT * FROM compras_comissao_regras WHERE company_id = ${companyId} AND vigente = 1 LIMIT 1`);
  const regra = ((regraRow.rows || regraRow) as any[])[0] || {};
  const kpis = parseKpis(regra.kpis_json);
  const compRow: any = await db.execute(sql`SELECT "razaoSocial" AS name, cnpj, endereco, cidade, estado FROM companies WHERE id = ${companyId} LIMIT 1`);
  const comp = ((compRow.rows || compRow) as any[])[0] || {};
  const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const kpisTabela = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:6px 0;font-size:11px">
    <thead><tr><th style="background:#0f172a;color:#fff;text-transform:uppercase;font-size:9px;padding:5px 6px;text-align:left">Indicador — definição, fórmula e régua de pontuação</th><th style="background:#0f172a;color:#fff;font-size:9px;padding:5px 6px;text-align:right;width:56px">Peso</th></tr></thead>
    <tbody>${kpis.map((k: any, i: number) => `<tr${i % 2 ? ' style="background:#f8fafc"' : ""}>
      <td style="border-bottom:1px solid #e2e8f0;padding:6px;vertical-align:top"><b>${esc(k.label)}</b><br/><span style="color:#64748b;font-size:9.5px">${esc(k.como)}</span>
      ${k.formula ? `<br/><span style="color:#64748b;font-size:9.5px"><b>Fórmula:</b> ${esc(k.formula)}</span>` : ""}
      ${(k.regua || []).length ? `<br/><span style="color:#64748b;font-size:9.5px"><b>Régua:</b> ${(k.regua || []).map((r: string) => esc(r)).join(" · ")}</span>` : ""}</td>
      <td style="border-bottom:1px solid #e2e8f0;padding:6px;text-align:right;font-weight:bold">${esc(k.peso)}%</td></tr>`).join("")}</tbody></table>`;
  // Template ISO vigente (Central de Documentos) com fallback ao seed institucional
  let corpo = "";
  try {
    const t: any = await db.execute(sql`SELECT conteudo_html FROM system_document_templates WHERE tipo = 'termo_adesao_premio' AND status = 'vigente' AND ativo = 1 AND deleted_at IS NULL LIMIT 1`);
    corpo = ((t.rows || t) as any[])[0]?.conteudo_html || "";
  } catch (_) {}
  if (!corpo) corpo = getSeedTemplate("termo_adesao_premio").conteudoHtml;
  const vals: Record<string, string> = {
    empNome: esc(opts.participanteNome), empCpf: esc(opts.participanteCpf || "____________________"),
    empRg: "____________________", empFuncao: esc(opts.participanteFuncao || "Comprador(a)"),
    empresaRazaoSocial: esc(comp.name || ""), empresaCnpj: esc(comp.cnpj || ""),
    empresaEndereco: esc([comp.endereco, comp.cidade, comp.estado].filter(Boolean).join(" - ")),
    docNumero: `ADESAO-${companyId}`, docData: new Date().toLocaleDateString("pt-BR"),
    docLocal: esc([comp.cidade, comp.estado].filter(Boolean).join(" - ") || ""),
    pctPremio: String(Number(regra.percentual ?? 10)), gatilhoMin: String(Number(regra.gatilho_min_pct ?? 2)),
    antecMax: String(Number(regra.antecipacao_max_pct ?? 40)), versaoRegra: String(Number(regra.versao ?? 1)),
    kpisTabela,
    faixasTexto: esc((await import("../../shared/premioFaixas")).faixasTexto((await import("../../shared/premioFaixas")).resolveFaixasRegra(regra.faixas_json, Number(regra.percentual ?? 10)))),
  };
  const html = corpo.replace(/\{\{(\w+)\}\}/g, (_m: string, ch: string) => vals[ch] ?? "");
  return { html, regraVersao: Number(regra.versao ?? 1) };
}

/** Rev. 5108 — faixas escalonadas + gatilho da regra vigente da empresa (fallback: percentual único legado). */
async function getFaixasVigentes(db: any, companyId: number) {
  const { resolveFaixasRegra, faixasFromLegacyPct } = await import("../../shared/premioFaixas");
  try {
    const r: any = await db.execute(sql`SELECT faixas_json, percentual, gatilho_min_pct FROM compras_comissao_regras WHERE company_id = ${companyId} AND vigente = 1 LIMIT 1`);
    const regra = ((r.rows || r) as any[])[0];
    if (regra) return { faixas: resolveFaixasRegra(regra.faixas_json, Number(regra.percentual ?? 10)), gatilho: Number(regra.gatilho_min_pct ?? 0) };
  } catch (_) {}
  const cfg = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, companyId)).limit(1);
  const pct = cfg.length ? Number(cfg[0].comissaoPercentual ?? 10) : 10;
  return { faixas: faixasFromLegacyPct(pct), gatilho: 0 };
}

/** Guard estrito de empresa (deny-by-default): companyId precisa estar entre as
 * empresas do usuário via getCompaniesForUser — sem fail-open p/ user sem vínculo. */
async function assertCompanyStrict(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  const { getCompaniesForUser } = await import("../db");
  const companies = await getCompaniesForUser(ctxUser.id, ctxUser.role);
  if (!(companies as any[]).some((c: any) => Number(c.id) === companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// Rev. 5105 — Scorecard padrão (literatura: McKinsey procurement incentive model +
// KPIs clássicos de suprimentos). Preço e tempo com os maiores pesos (60% juntos).
export const COMISSAO_KPIS_DEFAULT = [
  {
    chave: "saving", label: "Saving vs. orçamento (preço)", peso: 35,
    como: "Economia real: meta do orçamento − valor comprado em OCs entregues, por obra.",
    formula: "% saving = (Meta da obra − Total comprado) ÷ Meta da obra × 100. Só OCs entregues e com preço meta.",
    regua: ["Saving ≥ 5% da meta → 100 pontos", "Entre 2% e 5% → proporcional (ex.: 3,5% = 70 pts)", "Abaixo do gatilho de 2% → 0 ponto", "Obra estourada (saving negativo) → 0 ponto no KPI e sem prêmio na obra"],
    fonte: "Painel Análise de Prêmios — Meta × Comprado por obra (automático).",
  },
  {
    chave: "ciclo", label: "Tempo de ciclo SC → OC (agilidade)", peso: 25,
    como: "Dias corridos entre a aprovação da Solicitação de Compra e a emissão da OC. Média das compras do período.",
    formula: "Média de dias = Σ (data emissão OC − data aprovação SC) ÷ nº de OCs do comprador.",
    regua: ["Média ≤ 3 dias → 100 pontos", "4 a 5 dias → 80 pontos", "6 a 7 dias → 60 pontos", "8 a 10 dias → 40 pontos", "11 a 15 dias → 20 pontos", "Acima de 15 dias → 0 ponto", "Compra emergencial aprovada pela diretoria fica fora da média"],
    fonte: "Datas registradas na SC e na OC dentro do sistema (automático).",
  },
  {
    chave: "otif", label: "Entrega no prazo do fornecedor (OTIF)", peso: 15,
    como: "% de OCs entregues completas E dentro do prazo combinado com o fornecedor escolhido pelo comprador.",
    formula: "OTIF = OCs entregues completas e no prazo ÷ OCs entregues × 100.",
    regua: ["OTIF ≥ 95% → 100 pontos", "90% a 94,9% → 80 pontos", "85% a 89,9% → 60 pontos", "80% a 84,9% → 40 pontos", "Abaixo de 80% → 0 ponto", "Atraso comprovadamente causado pela obra (ex.: frente não liberada) não conta contra"],
    fonte: "Status e datas de entrega das OCs no sistema (automático).",
  },
  {
    chave: "qualidade", label: "Qualidade do fornecedor", peso: 15,
    como: "% de entregas sem devolução, troca ou não-conformidade registrada no recebimento.",
    formula: "Qualidade = entregas sem ocorrência ÷ total de entregas × 100.",
    regua: ["≥ 98% sem ocorrência → 100 pontos", "95% a 97,9% → 80 pontos", "90% a 94,9% → 50 pontos", "Abaixo de 90% → 0 ponto", "Material devolvido sai também da base de saving (não conta economia de material que voltou)"],
    fonte: "Ocorrências de devolução/troca registradas no recebimento (Almoxarifado).",
  },
  {
    chave: "conformidade", label: "Conformidade e alimentação do sistema", peso: 10,
    como: "Disciplina de processo: cotações mínimas, nada comprado por fora do sistema (maverick buying) e lançamentos corretos, na hora certa — quem alimenta certinho pontua, quem lança errado de última hora perde ponto.",
    formula: "Conformidade = compras com ≥ 3 cotações válidas, fluxo completo no sistema e lançamento correto (sem retificação por erro) ÷ total de compras × 100.",
    regua: ["≥ 95% conformes → 100 pontos", "90% a 94,9% → 70 pontos", "85% a 89,9% → 40 pontos", "Abaixo de 85% → 0 ponto", "Lançamento fora do fluxo ou corrigido de última hora por erro do comprador conta como NÃO conforme", "Fornecedor exclusivo/monopólio documentado na cotação não penaliza", "QUALQUER compra por fora do sistema sem aprovação → 0 ponto no KPI no período"],
    fonte: "Nº de propostas por cotação, origem das OCs e retificações de lançamento (automático).",
  },
];

function parseKpis(raw: any): any[] {
  try {
    const arr = JSON.parse(String(raw || ""));
    if (Array.isArray(arr) && arr.length) {
      // Enriquece KPIs salvos antes da Rev. 5106 com fórmula/régua/fonte do padrão
      return arr.map((k: any) => {
        const def = COMISSAO_KPIS_DEFAULT.find(d => d.chave === k.chave);
        return { ...(def || {}), ...k, formula: k.formula || def?.formula || "", regua: k.regua?.length ? k.regua : (def?.regua || []), fonte: k.fonte || def?.fonte || "" };
      });
    }
  } catch (_) {}
  return COMISSAO_KPIS_DEFAULT;
}

/** Exige role admin_master + senha conferida no backend (bcrypt). */
async function assertMasterComSenha(db: any, ctx: any, senha: string) {
  if ((ctx.user as any)?.role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode alterar as regras do prêmio." });
  }
  const [masterUser] = await db.select({ password: users.password }).from(users).where(eq(users.id, (ctx.user as any).id));
  if (!masterUser?.password) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário master não encontrado." });
  const bcrypt = await import("bcryptjs");
  if (!bcrypt.compareSync(senha, masterUser.password)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Senha incorreta. Operação negada." });
  }
}
import crypto from "crypto";

const n = (v: any) => parseFloat(v ?? "0") || 0;

// Rev. 2483 — Delegação pra fonte de verdade ÚNICA (compras.gerarProximoNumeroOC).
// O gerador antigo aqui usava padStart(3) enquanto compras.ts usava padStart(4) sobre
// o MESMO contador `ocNumberConfig.proximoNumero` — resultado: OCs visualmente
// duplicadas (218 vs 0218). Agora ambos compartilham a mesma função com advisory
// lock + persistência atômica + padStart(4).
import { gerarProximoNumeroOC } from "./compras";
import { users } from "../../drizzle/schema";
async function gerarNumeroOC(_db: any, companyId: number): Promise<string> {
  return await gerarProximoNumeroOC(companyId, "compra");
}

export const purchaseRouter = router({

  // ══════════════════════════════════════════════════════════════
  // CATÁLOGO DE ITENS
  // ══════════════════════════════════════════════════════════════

  listarCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number(), busca: z.string().optional(), categoria: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db.select().from(purchaseCatalogItems)
        .where(and(eq(purchaseCatalogItems.companyId, input.companyId), eq(purchaseCatalogItems.ativo, 1)))
        .orderBy(asc(purchaseCatalogItems.nome));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        rows = rows.filter((r: any) => r.nome?.toLowerCase().includes(b) || r.codigo?.toLowerCase().includes(b));
      }
      if (input.categoria) rows = rows.filter((r: any) => r.categoria === input.categoria);
      return rows;
    }),

  criarItemCatalogo: protectedProcedure
    .input(z.object({
      companyId: z.number(), nome: z.string(), nomeAbreviado: z.string().optional(),
      codigo: z.string().optional(), unidade: z.string(), categoria: z.string().optional(),
      ncm: z.string().optional(), codigoSinapi: z.string().optional(),
      contaFinanceiraId: z.number().optional(), contaFinanceiraNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.insert(purchaseCatalogItems).values({ ...input } as any).returning();
      return item;
    }),

  atualizarItemCatalogo: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().optional(), unidade: z.string().optional(), categoria: z.string().optional(), ativo: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      await db.update(purchaseCatalogItems).set({ ...rest, updatedAt: new Date().toISOString() } as any).where(eq(purchaseCatalogItems.id, id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // SOLICITAÇÕES DE COMPRA (SC) — NOVO FLUXO
  // ══════════════════════════════════════════════════════════════

  listarSolicitacoesV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number().optional(), status: z.string().optional(),
      emergencial: z.boolean().optional(), page: z.number().default(1), limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseRequests.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(purchaseRequests.obraId, input.obraId));
      if (input.status) conditions.push(eq(purchaseRequests.status, input.status));
      if (input.emergencial !== undefined) conditions.push(eq(purchaseRequests.emergencial, input.emergencial ? 1 : 0));
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(purchaseRequests.obraId, allowed));
      }
      const rows = await db.select().from(purchaseRequests)
        .where(and(...conditions)).orderBy(desc(purchaseRequests.createdAt))
        .limit(input.limit).offset((input.page - 1) * input.limit);
      const withItens = await Promise.all(rows.map(async (sc: any) => {
        const itens = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.solicitacaoId, sc.id));
        return { ...sc, itens };
      }));
      return withItens;
    }),

  criarSolicitacaoV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(), obraNome: z.string().optional(),
      solicitanteId: z.number(), solicitanteNome: z.string().optional(),
      tipo: z.string().default("compra"), emergencial: z.boolean().default(false),
      justificativaEmergencial: z.string().optional(), prazoNecessidade: z.string().optional(),
      itens: z.array(z.object({
        catalogItemId: z.number().optional(), insumoNome: z.string(), unidade: z.string(),
        quantidade: z.number(), valorMetaUnitario: z.number().optional(), observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const valorEstimado = input.itens.reduce((s, i) => s + (i.quantidade * (i.valorMetaUnitario || 0)), 0);
      const [sc] = await db.insert(purchaseRequests).values({
        companyId: input.companyId, obraId: input.obraId, obraNome: input.obraNome,
        solicitanteId: input.solicitanteId, solicitanteNome: input.solicitanteNome,
        tipo: input.tipo, status: "pendente",
        emergencial: input.emergencial ? 1 : 0,
        justificativaEmergencial: input.justificativaEmergencial,
        prazoNecessidade: input.prazoNecessidade,
        valorEstimadoTotal: String(valorEstimado.toFixed(2)),
      } as any).returning();
      for (const item of input.itens) {
        await db.insert(purchaseRequestItems).values({
          solicitacaoId: sc.id, catalogItemId: item.catalogItemId,
          insumoNome: item.insumoNome, unidade: item.unidade,
          quantidade: String(item.quantidade), quantidadeAComprar: String(item.quantidade),
          valorMetaUnitario: item.valorMetaUnitario ? String(item.valorMetaUnitario) : null,
          observacoes: item.observacoes,
        } as any);
      }
      return sc;
    }),

  aprovarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), aprovadorId: z.number(), aprovadorNome: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseRequests).set({
        status: "aprovada", aprovadorId: input.aprovadorId, aprovadorNome: input.aprovadorNome,
        aprovadoEm: new Date().toISOString(),
      } as any).where(eq(purchaseRequests.id, input.id));
      return { ok: true };
    }),

  recusarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), justificativa: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseRequests).set({ status: "recusada", justificativaRecusa: input.justificativa } as any).where(eq(purchaseRequests.id, input.id));
      return { ok: true };
    }),

  cancelarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), motivo: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseRequests).set({ status: "cancelada" } as any).where(eq(purchaseRequests.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // COTAÇÕES — NOVO FLUXO
  // ══════════════════════════════════════════════════════════════

  listarCotacoesV2: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), page: z.number().default(1), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseQuotations.companyId, input.companyId)];
      if (input.status) conditions.push(eq(purchaseQuotations.status, input.status));
      const rows = await db.select().from(purchaseQuotations).where(and(...conditions))
        .orderBy(desc(purchaseQuotations.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
      const withData = await Promise.all(rows.map(async (cot: any) => {
        const fornecedoresRows = await db.select().from(purchaseQuotationSuppliers).where(eq(purchaseQuotationSuppliers.cotacaoId, cot.id));
        return { ...cot, fornecedores: fornecedoresRows };
      }));
      return withData;
    }),

  criarCotacao: protectedProcedure
    .input(z.object({
      companyId: z.number(), solicitacaoId: z.number(), compradorId: z.number().optional(),
      compradorNome: z.string().optional(), validadeDias: z.number().default(5),
      fornecedorIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const validadeAte = new Date();
      validadeAte.setDate(validadeAte.getDate() + input.validadeDias);
      const [cot] = await db.insert(purchaseQuotations).values({
        companyId: input.companyId, solicitacaoId: input.solicitacaoId,
        compradorId: input.compradorId, compradorNome: input.compradorNome,
        validadeDias: input.validadeDias, validadeAte: validadeAte.toISOString().split("T")[0],
        status: "aberta",
      } as any).returning();
      for (const suppId of input.fornecedorIds) {
        const sup = await db.select().from(fornecedores).where(eq(fornecedores.id, suppId)).limit(1);
        const [qs] = await db.insert(purchaseQuotationSuppliers).values({
          cotacaoId: cot.id, supplierId: suppId,
          supplierNome: sup?.[0]?.razaoSocial || String(suppId), status: "aguardando",
        } as any).returning();
        const token = crypto.randomBytes(32).toString("hex");
        await db.insert(purchaseQuotationTokens).values({
          companyId: input.companyId, cotacaoId: cot.id, quotationSupplierId: qs.id,
          supplierId: suppId, supplierNome: sup?.[0]?.razaoSocial,
          supplierEmail: sup?.[0]?.email, token,
          expiresAt: validadeAte.toISOString(),
        } as any);
      }
      await db.update(purchaseRequests).set({ status: "em_cotacao" } as any).where(eq(purchaseRequests.id, input.solicitacaoId));
      return cot;
    }),

  registrarPropostaFornecedor: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(), quotationSupplierId: z.number(),
      valorUnitario: z.number(), valorFrete: z.number().default(0),
      freteTipo: z.string().default("cif"), transportadora: z.string().optional(),
      prazoEntregaDias: z.number().optional(),
      condicaoPagamento: z.string().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const freteParaTotal = input.freteTipo === "fob" ? input.valorFrete : 0;
      const total = input.valorUnitario + freteParaTotal;
      await db.update(purchaseQuotationSuppliers).set({
        status: "respondido", valorUnitario: String(input.valorUnitario),
        valorFrete: String(input.valorFrete), freteTipo: input.freteTipo,
        transportadora: input.transportadora ?? null,
        valorTotalComFrete: String(total.toFixed(2)),
        prazoEntregaDias: input.prazoEntregaDias, condicaoPagamento: input.condicaoPagamento,
        observacoes: input.observacoes, respondidoEm: new Date().toISOString(),
      } as any).where(eq(purchaseQuotationSuppliers.id, input.quotationSupplierId));
      return { ok: true };
    }),

  fecharCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorVencedorId: z.number(), justificativa: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseQuotations).set({
        status: "encerrada", fornecedorVencedorId: input.fornecedorVencedorId,
        justificativaVencedor: input.justificativa,
      } as any).where(eq(purchaseQuotations.id, input.cotacaoId));
      return { ok: true };
    }),

  registrarNegociacao: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(), quotationSupplierId: z.number().optional(),
      rodada: z.number().default(1), tipo: z.string().optional(),
      valorUnitarioProposto: z.number().optional(), mensagem: z.string().optional(),
      autor: z.string().optional(), autorNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.insert(purchaseNegotiations).values({ ...input, valorUnitarioProposto: input.valorUnitarioProposto ? String(input.valorUnitarioProposto) : null } as any);
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ORDENS DE COMPRA (OC) — NOVO FLUXO
  // ══════════════════════════════════════════════════════════════

  listarOrdensV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number().optional(), status: z.string().optional(),
      supplierId: z.number().optional(), page: z.number().default(1), limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseOrders.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(purchaseOrders.obraId, input.obraId));
      if (input.status) conditions.push(eq(purchaseOrders.status, input.status));
      if (input.supplierId) conditions.push(eq(purchaseOrders.supplierId, input.supplierId));
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(purchaseOrders.obraId, allowed));
      }
      const rows = await db.select().from(purchaseOrders).where(and(...conditions))
        .orderBy(desc(purchaseOrders.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
      const withItens = await Promise.all(rows.map(async (o: any) => {
        const itens = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.ordemId, o.id));
        return { ...o, itens };
      }));
      return withItens;
    }),

  criarOrdemV2: protectedProcedure
    .input(z.object({
      companyId: z.number(), solicitacaoId: z.number().optional(), cotacaoId: z.number().optional(),
      supplierId: z.number(), supplierNome: z.string().optional(),
      obraId: z.number().optional(), obraNome: z.string().optional(),
      compradorId: z.number().optional(), compradorNome: z.string().optional(),
      tipo: z.string().default("compra"), formaPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      numeroParcelas: z.number().default(1), prazoEntrega: z.string().optional(),
      valorFrete: z.number().default(0), freteTipo: z.string().default("cif"),
      transportadora: z.string().optional(),
      enderecoEntrega: z.string().optional(), cidadeEntrega: z.string().optional(),
      estadoEntrega: z.string().optional(), cepEntrega: z.string().optional(),
      retencaoINSS: z.number().default(0), retencaoIR: z.number().default(0), retencaoISS: z.number().default(0),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        catalogItemId: z.number().optional(), insumoNome: z.string(), unidade: z.string(),
        quantidadePedida: z.number(), valorUnitario: z.number(), valorMetaUnitario: z.number().optional(),
        contaFinanceiraId: z.number().optional(),
      })),
      userId: z.number(), userName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const numero = await gerarNumeroOC(db, input.companyId);
      const valorItens = input.itens.reduce((s, i) => s + i.quantidadePedida * i.valorUnitario, 0);
      const freteParaTotal = input.freteTipo === "fob" ? input.valorFrete : 0;
      const valorTotal = valorItens + freteParaTotal - input.retencaoINSS - input.retencaoIR - input.retencaoISS;
      const [oc] = await db.insert(purchaseOrders).values({
        companyId: input.companyId, numero, solicitacaoId: input.solicitacaoId,
        cotacaoId: input.cotacaoId, supplierId: input.supplierId, supplierNome: input.supplierNome,
        obraId: input.obraId, obraNome: input.obraNome, compradorId: input.compradorId,
        compradorNome: input.compradorNome, tipo: input.tipo, status: "emitida",
        valorItens: String(valorItens.toFixed(2)), valorFrete: String(input.valorFrete),
        freteTipo: input.freteTipo, transportadora: input.transportadora ?? null,
        valorTotal: String(valorTotal.toFixed(2)),
        portalToken: crypto.randomBytes(32).toString("hex"),
        formaPagamento: input.formaPagamento, tipoPagamento: input.tipoPagamento,
        numeroParcelas: input.numeroParcelas,
        prazoEntrega: input.prazoEntrega, enderecoEntrega: input.enderecoEntrega,
        cidadeEntrega: input.cidadeEntrega, estadoEntrega: input.estadoEntrega,
        cepEntrega: input.cepEntrega,
        retencaoINSS: String(input.retencaoINSS), retencaoIR: String(input.retencaoIR), retencaoISS: String(input.retencaoISS),
        observacoes: input.observacoes, emitidaEm: new Date().toISOString(),
      } as any).returning();
      for (const item of input.itens) {
        await db.insert(purchaseOrderItems).values({
          ordemId: oc.id, catalogItemId: item.catalogItemId, insumoNome: item.insumoNome,
          unidade: item.unidade, quantidadePedida: String(item.quantidadePedida),
          valorUnitario: String(item.valorUnitario), valorTotal: String((item.quantidadePedida * item.valorUnitario).toFixed(2)),
          valorMetaUnitario: item.valorMetaUnitario ? String(item.valorMetaUnitario) : null,
          contaFinanceiraId: item.contaFinanceiraId,
        } as any);
      }
      if (input.solicitacaoId) {
        await db.update(purchaseRequests).set({ status: "em_oc" } as any).where(eq(purchaseRequests.id, input.solicitacaoId));
      }
      await onOCEmitida(oc.id, input.userId, input.userName || "Sistema");
      return oc;
    }),

  cancelarOrdem: protectedProcedure
    .input(z.object({ id: z.number(), motivo: z.string(), userId: z.number(), userName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(purchaseOrders).set({ status: "cancelada" } as any).where(eq(purchaseOrders.id, input.id));
      await onOCCancelada(input.id, input.motivo, input.userId, input.userName || "Sistema");
      return { ok: true };
    }),

  listarParcelasOC: protectedProcedure
    .input(z.object({ ordemId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const parcelas = await db.select().from(purchaseAccountsPayable)
        .where(and(eq(purchaseAccountsPayable.ordemId, input.ordemId), eq(purchaseAccountsPayable.companyId, input.companyId)))
        .orderBy(asc(purchaseAccountsPayable.id));
      return parcelas;
    }),

  // ══════════════════════════════════════════════════════════════
  // RECEBIMENTOS
  // ══════════════════════════════════════════════════════════════

  listarRecebimentos: protectedProcedure
    .input(z.object({ companyId: z.number(), ordemId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const conditions: any[] = [eq(purchaseReceipts.companyId, input.companyId)];
      if (input.ordemId) conditions.push(eq(purchaseReceipts.ordemId, input.ordemId));
      if (input.status) conditions.push(eq(purchaseReceipts.status, input.status));
      const rows = await db.select().from(purchaseReceipts).where(and(...conditions)).orderBy(desc(purchaseReceipts.createdAt));

      const almoxConditions: any[] = [
        eq(almoxarifadoRecebimentos.companyId, input.companyId),
        sql`${almoxarifadoRecebimentos.ordemCompraId} IS NOT NULL`,
      ];
      if (input.ordemId) almoxConditions.push(eq(almoxarifadoRecebimentos.ordemCompraId, input.ordemId));
      const almoxRows = await db.select().from(almoxarifadoRecebimentos)
        .where(and(...almoxConditions))
        .orderBy(desc(almoxarifadoRecebimentos.criadoEm));

      const almoxMapped = almoxRows
        .filter(ar => {
          if (!input.status) return true;
          const mapped = ar.temDivergencia ? "parcial" : (ar.totalItensRecebidos ?? 0) > 0 ? "total" : "pendente";
          return mapped === input.status;
        })
        .map(ar => {
          const st = ar.temDivergencia ? "parcial" : (ar.totalItensRecebidos ?? 0) > 0 ? "total" : "pendente";
          return {
            id: ar.id,
            ordemId: ar.ordemCompraId!,
            companyId: ar.companyId,
            obraId: ar.obraId,
            recebedorId: ar.usuarioId,
            recebedorNome: ar.usuarioNome || "Almoxarifado",
            status: st,
            notaFiscalNumero: ar.numeroNf || null,
            notaFiscalUrl: ar.fotoNfUrl || null,
            fotoMaterialUrl: ar.fotoMaterialUrl || null,
            observacoes: ar.observacoes,
            valorLiberado: null as string | null,
            recebidoEm: ar.criadoEm,
            createdAt: ar.criadoEm,
            _source: "almoxarifado" as const,
          };
        });

      const allRows = [
        ...rows.map(r => ({ ...r, _source: "compras" as const })),
        ...almoxMapped.filter(am => !rows.some(r => r.ordemId === am.ordemId && r.recebidoEm === am.recebidoEm)),
      ].sort((a, b) => new Date(b.recebidoEm || b.createdAt).getTime() - new Date(a.recebidoEm || a.createdAt).getTime());

      const purchaseOcMap = new Map<number, any>();
      const almoxOcMap = new Map<number, any>();

      const purchaseOcIds = [...new Set(rows.map(r => r.ordemId).filter(Boolean))];
      for (const oid of purchaseOcIds) {
        try {
          const [oc] = await db.select({
            transportadora: (purchaseOrders as any).transportadora,
            codigoRastreamento: (purchaseOrders as any).codigoRastreamento,
            freteTipo: (purchaseOrders as any).freteTipo,
            fornecedorNome: (purchaseOrders as any).fornecedorNome,
            numeroOc: (purchaseOrders as any).numeroOc,
          }).from(purchaseOrders).where(and(eq(purchaseOrders.id, oid), eq(purchaseOrders.companyId, input.companyId))).limit(1);
          if (oc) purchaseOcMap.set(oid, oc);
        } catch (e: any) {
          console.warn(`[listarRecebimentos] Erro ao buscar purchaseOrder ${oid}:`, e.message);
        }
      }

      const almoxOcIds = [...new Set(almoxMapped.map(r => r.ordemId).filter(Boolean))];
      for (const oid of almoxOcIds) {
        try {
          const [oc] = await db.select({
            transportadora: comprasOrdens.transportadora,
            codigoRastreamento: comprasOrdens.codigoRastreamento,
            freteTipo: comprasOrdens.freteTipo,
            fornecedorNome: comprasOrdens.fornecedorNome,
            numeroOc: comprasOrdens.numeroOc,
          }).from(comprasOrdens).where(and(eq(comprasOrdens.id, oid), eq(comprasOrdens.companyId, input.companyId))).limit(1);
          if (oc) almoxOcMap.set(oid, oc);
        } catch (e: any) {
          console.warn(`[listarRecebimentos] Erro ao buscar comprasOrdens ${oid}:`, e.message);
        }
      }

      return allRows.map(r => {
        const ocData = r._source === "almoxarifado" ? almoxOcMap.get(r.ordemId) : purchaseOcMap.get(r.ordemId);
        return {
          ...r,
          transportadora: ocData?.transportadora ?? null,
          codigoRastreamento: ocData?.codigoRastreamento ?? null,
          freteTipo: ocData?.freteTipo ?? null,
          fornecedorNome: ocData?.fornecedorNome ?? null,
          numeroOc: ocData?.numeroOc ?? null,
        };
      });
    }),

  criarRecebimento: protectedProcedure
    .input(z.object({
      companyId: z.number(), ordemId: z.number(), obraId: z.number().optional(),
      recebedorId: z.number(), recebedorNome: z.string().optional(),
      notaFiscalNumero: z.string().optional(), observacoes: z.string().optional(),
      itens: z.array(z.object({ ordemItemId: z.number(), insumoNome: z.string().optional(), unidade: z.string().optional(), quantidadePedida: z.number().optional(), quantidadeRecebida: z.number() })),
      userId: z.number(), userName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const ordemItens = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.ordemId, input.ordemId));
      const totalPedido = ordemItens.reduce((s: number, i: any) => s + n(i.quantidadePedida), 0);
      const totalRecebido = input.itens.reduce((s, i) => s + i.quantidadeRecebida, 0);
      const status = totalRecebido >= totalPedido ? "total" : "parcial";
      const valorLiberado = ordemItens.reduce((s: number, item: any) => {
        const rec = input.itens.find(i => i.ordemItemId === item.id);
        if (!rec) return s;
        return s + (n(rec.quantidadeRecebida) * n(item.valorUnitario));
      }, 0);
      const [receb] = await db.insert(purchaseReceipts).values({
        companyId: input.companyId, ordemId: input.ordemId, obraId: input.obraId,
        recebedorId: input.recebedorId, recebedorNome: input.recebedorNome,
        notaFiscalNumero: input.notaFiscalNumero, observacoes: input.observacoes,
        status, valorLiberado: String(valorLiberado.toFixed(2)),
        recebidoEm: new Date().toISOString(),
      } as any).returning();
      for (const item of input.itens) {
        await db.insert(purchaseReceiptItems).values({
          recebimentoId: receb.id, ordemItemId: item.ordemItemId,
          insumoNome: item.insumoNome, unidade: item.unidade,
          quantidadePedida: item.quantidadePedida ? String(item.quantidadePedida) : null,
          quantidadeRecebida: String(item.quantidadeRecebida),
        } as any);
        await db.update(purchaseOrderItems).set({
          quantidadeRecebida: sql`COALESCE(quantidade_recebida,0) + ${item.quantidadeRecebida}`,
        } as any).where(eq(purchaseOrderItems.id, item.ordemItemId));
      }
      if (status === "total") {
        await db.update(purchaseOrders).set({ status: "recebido" } as any).where(eq(purchaseOrders.id, input.ordemId));
        try {
          const [oc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.ordemId)).limit(1);
          if (oc && (oc as any).compradorId && (oc as any).obraId) {
            const compradorId = Number((oc as any).compradorId);
            const obraId = Number((oc as any).obraId);
            const valorComprado = n((oc as any).valorTotal);
            const ocItens = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.ordemId, input.ordemId));
            const valorMeta = ocItens.reduce((s: number, i: any) => s + (n(i.quantidadePedida) * n(i.valorMetaUnitario)), 0);
            const economia = Math.max(0, valorMeta - valorComprado);
            if (economia > 0) {
              // Rev. 5108 — usa a regra vigente (faixas escalonadas + gatilho), não o percentual único legado
              const { faixas, gatilho } = await getFaixasVigentes(db, input.companyId);
              const { calcPremioProgressivo } = await import("../../shared/premioFaixas");
              const calc = calcPremioProgressivo(economia, valorMeta, faixas, gatilho);
              const pct = Math.round(calc.pctEfetivo * 100) / 100;
              const comissao = calc.premio;
              await db.insert(buyerCommissions).values({
                companyId: input.companyId, obraId, obraNome: (oc as any).obraNome,
                compradorId, compradorNome: (oc as any).compradorNome,
                valorMetaTotal: String(valorMeta.toFixed(2)), valorCompradoTotal: String(valorComprado.toFixed(2)),
                economiaTotal: String(economia.toFixed(2)), percentualParticipacao: String(pct),
                valorComissao: String(comissao.toFixed(2)), calculadoEm: new Date().toISOString(),
              } as any);
            }
          }
        } catch (_) {}
      }
      await onRecebimentoConfirmado(receb.id, input.ordemId, status as any, valorLiberado, input.userId, input.userName || "Sistema");
      return { ...receb, status };
    }),

  excluirRecebimentosEmLote: protectedProcedure
    .input(z.object({
      comprasIds: z.array(z.number()).default([]),
      almoxIds: z.array(z.number()).default([]),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { getCompaniesForUser } = await import("../db");
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c: any) => c.id === input.companyId))
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });

      let count = 0;

      if (input.comprasIds.length > 0) {
        const owned = await db.select({ id: purchaseReceipts.id })
          .from(purchaseReceipts)
          .where(and(inArray(purchaseReceipts.id, input.comprasIds), eq(purchaseReceipts.companyId, input.companyId)));
        const ownedIds = owned.map(r => r.id);
        if (ownedIds.length > 0) {
          await db.delete(purchaseReceiptItems).where(inArray(purchaseReceiptItems.recebimentoId, ownedIds));
          await db.delete(purchaseReceipts).where(inArray(purchaseReceipts.id, ownedIds));
          count += ownedIds.length;
        }
      }

      if (input.almoxIds.length > 0) {
        const almoxOwned = await db.select({ id: almoxarifadoRecebimentos.id })
          .from(almoxarifadoRecebimentos)
          .where(and(inArray(almoxarifadoRecebimentos.id, input.almoxIds), eq(almoxarifadoRecebimentos.companyId, input.companyId)));
        const validAlmoxIds = almoxOwned.map(r => r.id);
        if (validAlmoxIds.length > 0) {
          await db.delete(almoxarifadoRecebimentoItens).where(inArray(almoxarifadoRecebimentoItens.recebimentoId, validAlmoxIds));
          await db.delete(almoxarifadoRecebimentos).where(inArray(almoxarifadoRecebimentos.id, validAlmoxIds));
          count += validAlmoxIds.length;
        }
      }

      return { count };
    }),

  // ══════════════════════════════════════════════════════════════
  // CONTAS A PAGAR (AP)
  // ══════════════════════════════════════════════════════════════

  listarContasPagar: protectedProcedure
    .input(z.object({
      companyId: z.number(), status: z.string().optional(), obraId: z.number().optional(),
      vencimentoAte: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(purchaseAccountsPayable.companyId, input.companyId)];
      if (input.status) conditions.push(eq(purchaseAccountsPayable.status, input.status));
      if (input.obraId) conditions.push(eq(purchaseAccountsPayable.obraId, input.obraId));
      if (input.vencimentoAte) conditions.push(lte(purchaseAccountsPayable.dataVencimento, input.vencimentoAte));
      return db.select().from(purchaseAccountsPayable).where(and(...conditions)).orderBy(asc(purchaseAccountsPayable.dataVencimento));
    }),

  marcarPago: protectedProcedure
    .input(z.object({ id: z.number(), dataPagamento: z.string(), comprovanteUrl: z.string().optional(), valorPago: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseAccountsPayable).where(eq(purchaseAccountsPayable.id, input.id)).limit(1);
      const ap = rows?.[0];
      await db.update(purchaseAccountsPayable).set({
        status: "pago", dataPagamento: input.dataPagamento,
        valorPago: String(input.valorPago ?? ap?.valorTotal ?? "0"),
        comprovanteUrl: input.comprovanteUrl,
      } as any).where(eq(purchaseAccountsPayable.id, input.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // REALOCAÇÕES DE VERBA
  // ══════════════════════════════════════════════════════════════

  listarRealocacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(budgetReallocations.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(budgetReallocations.obraId, input.obraId));
      return db.select().from(budgetReallocations).where(and(...conditions)).orderBy(desc(budgetReallocations.createdAt));
    }),

  criarRealocacao: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(),
      origemEapItemId: z.number().optional(), origemEapItemNome: z.string().optional(),
      destinoEapItemId: z.number().optional(), destinoEapItemNome: z.string().optional(),
      valorRealocado: z.number(), motivo: z.string(),
      usuarioId: z.number(), usuarioNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [r] = await db.insert(budgetReallocations).values({
        ...input, valorRealocado: String(input.valorRealocado),
      } as any).returning();
      return r;
    }),

  // ══════════════════════════════════════════════════════════════
  // COMISSÕES DE COMPRADOR
  // ══════════════════════════════════════════════════════════════

  listarComissoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), compradorId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(buyerCommissions.companyId, input.companyId)];
      if (input.status) conditions.push(eq(buyerCommissions.status, input.status));
      if (input.compradorId) conditions.push(eq(buyerCommissions.compradorId, input.compradorId));
      return db.select().from(buyerCommissions).where(and(...conditions)).orderBy(desc(buyerCommissions.createdAt));
    }),

  analiseComissoesOCs: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ocs = await db.select().from(comprasOrdens)
        .where(eq(comprasOrdens.companyId, input.companyId))
        .orderBy(asc(comprasOrdens.criadoEm));
      if (ocs.length === 0) return [];

      const ocIds = ocs.map(oc => oc.id);
      const allItens = await db.select().from(comprasOrdensItens)
        .where(inArray(comprasOrdensItens.ordemId, ocIds));

      const scItemIds = [...new Set(allItens.map(i => i.solicitacaoItemId).filter((id): id is number => !!id))];
      const allScItens = scItemIds.length > 0
        ? await db.select().from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds))
        : [];
      const scItemMap = new Map(allScItens.map(si => [si.id, si]));

      const { comprasSolicitacoes, orcamentoItens: orcItensTable } = await import("../../drizzle/schema");

      const scIdList = [...new Set(allScItens.map(si => (si as any).solicitacaoId).filter(Boolean))];
      const scObraMap: Record<number, number> = {};
      if (scIdList.length > 0) {
        const scs = await db.select({ id: comprasSolicitacoes.id, obraId: comprasSolicitacoes.obraId })
          .from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.id, scIdList));
        for (const sc of scs) scObraMap[sc.id] = sc.obraId ?? 0;
      }

      const orcItemIds = [...new Set(allScItens.map(si => (si as any).orcamentoItemId).filter(Boolean))];
      const orcItemQtyMap: Record<number, number> = {};
      if (orcItemIds.length > 0) {
        const orcRows = await db.select({ id: orcItensTable.id, quantidade: orcItensTable.quantidade })
          .from(orcItensTable).where(inArray(orcItensTable.id, orcItemIds));
        for (const r of orcRows) orcItemQtyMap[r.id] = n(r.quantidade);
      }

      const orcBudgetByKey: Record<string, number> = {};
      for (const scItem of allScItens) {
        const orcItemId = (scItem as any).orcamentoItemId;
        const scObraId = scObraMap[(scItem as any).solicitacaoId] ?? 0;
        if (orcItemId && orcItemQtyMap[orcItemId] !== undefined) {
          const budgetKey = `${scObraId}:orc:${orcItemId}`;
          orcBudgetByKey[budgetKey] = orcItemQtyMap[orcItemId];
        }
      }

      const firstScQtyByKey: Record<string, number> = {};
      for (const scItem of allScItens) {
        const orcItemId = (scItem as any).orcamentoItemId;
        const insumoCodigo = (scItem as any).insumoCodigo;
        const scObraId = scObraMap[(scItem as any).solicitacaoId] ?? 0;
        if (!orcItemId && insumoCodigo) {
          const budgetKey = `${scObraId}:ins:${insumoCodigo}`;
          if (firstScQtyByKey[budgetKey] === undefined) {
            firstScQtyByKey[budgetKey] = n(scItem.quantidade);
          }
        }
      }

      const itensByOrdem = new Map<number, typeof allItens>();
      for (const item of allItens) {
        const arr = itensByOrdem.get(item.ordemId!) || [];
        arr.push(item);
        itensByOrdem.set(item.ordemId!, arr);
      }

      const budgetConsumed: Record<string, number> = {};

      const results = ocs.map(oc => {
        const itens = itensByOrdem.get(oc.id) || [];
        let valorMeta = 0;
        let temMeta = false;
        for (const item of itens) {
          if (!item.solicitacaoItemId) continue;
          const scItem = scItemMap.get(item.solicitacaoItemId);
          if (!scItem) continue;
          const orcItemId = (scItem as any).orcamentoItemId;
          const insumoCodigo = (scItem as any).insumoCodigo;
          const precoMeta = n((scItem as any).precoMeta);
          if (precoMeta <= 0) continue;
          temMeta = true;
          const qty = n(item.quantidade);
          const obraKey = `${oc.obraId ?? 0}`;

          let budgetKey = "";
          let totalBudgetQty = 0;
          if (orcItemId) {
            budgetKey = `${obraKey}:orc:${orcItemId}`;
            totalBudgetQty = orcBudgetByKey[budgetKey] ?? 0;
          } else if (insumoCodigo) {
            budgetKey = `${obraKey}:ins:${insumoCodigo}`;
            totalBudgetQty = firstScQtyByKey[budgetKey] ?? 0;
          }

          if (budgetKey && totalBudgetQty > 0) {
            const alreadyConsumed = budgetConsumed[budgetKey] ?? 0;
            const remainingBudgetQty = Math.max(0, totalBudgetQty - alreadyConsumed);
            const coveredQty = Math.min(qty, remainingBudgetQty);
            valorMeta += precoMeta * coveredQty;
            budgetConsumed[budgetKey] = alreadyConsumed + qty;
          } else if (budgetKey) {
            valorMeta += precoMeta * qty;
            budgetConsumed[budgetKey] = (budgetConsumed[budgetKey] ?? 0) + qty;
          } else {
            valorMeta += precoMeta * qty;
          }
        }
        const valorComprado = n(oc.total);
        const economia = temMeta ? (valorMeta - valorComprado) : 0;
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          fornecedorNome: oc.fornecedorNome,
          compradorId: (oc as any).criadoPorId ?? null,
          compradorNome: (oc as any).criadoPorNome || null,
          obraId: oc.obraId,
          status: oc.status,
          valorComprado,
          valorMeta: temMeta ? valorMeta : null,
          economia,
          temMeta,
          totalItens: itens.length,
          criadoEm: oc.criadoEm,
        };
      });

      results.sort((a, b) => new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime());
      return results;
    }),

  calcularComissoes: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), compradorId: z.number(), compradorNome: z.string().optional(), obraNome: z.string().optional(), percentualParticipacao: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const ocs = await db.select().from(purchaseOrders)
        .where(and(eq(purchaseOrders.companyId, input.companyId), eq(purchaseOrders.obraId, input.obraId), eq(purchaseOrders.compradorId, input.compradorId)));
      const valorComprado = ocs.reduce((s: number, o: any) => s + n(o.valorTotal), 0);
      const scs = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.obraId, input.obraId)));
      const valorMeta = scs.reduce((s: number, sc: any) => s + n(sc.valorMetaTotal), 0);
      const economia = Math.max(0, valorMeta - valorComprado);
      // Rev. 5108 — override manual mantido; sem override, usa a regra vigente (faixas + gatilho)
      let pct: number;
      let comissao: number;
      if (input.percentualParticipacao !== undefined && input.percentualParticipacao !== null) {
        pct = input.percentualParticipacao;
        comissao = economia * (pct / 100);
      } else {
        const { faixas, gatilho } = await getFaixasVigentes(db, input.companyId);
        const { calcPremioProgressivo } = await import("../../shared/premioFaixas");
        const calc = calcPremioProgressivo(economia, valorMeta, faixas, gatilho);
        pct = Math.round(calc.pctEfetivo * 100) / 100;
        comissao = calc.premio;
      }
      const [c] = await db.insert(buyerCommissions).values({
        companyId: input.companyId, obraId: input.obraId, obraNome: input.obraNome,
        compradorId: input.compradorId, compradorNome: input.compradorNome,
        valorMetaTotal: String(valorMeta.toFixed(2)), valorCompradoTotal: String(valorComprado.toFixed(2)),
        economiaTotal: String(economia.toFixed(2)), percentualParticipacao: String(pct),
        valorComissao: String(comissao.toFixed(2)), calculadoEm: new Date().toISOString(),
      } as any).returning();
      return c;
    }),

  // ── Rev. 5104 — Regras de Comissão (documento versionado, edição só ADM Master + senha) ──
  regrasComissaoGet: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      await ensureComissaoRegrasTables(db);
      let rows: any = await db.execute(sql`SELECT * FROM compras_comissao_regras WHERE company_id = ${input.companyId} ORDER BY versao DESC`);
      rows = (rows.rows || rows) as any[];
      if (!rows.length) {
        // Seed v1 com o percentual já configurado (Configurações → Compras).
        // ON CONFLICT DO NOTHING: corrida de 2 primeiras leituras não duplica.
        const cfg = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
        const pct = cfg.length ? Number(cfg[0].comissaoPercentual ?? 10) : 10;
        await db.execute(sql`
          INSERT INTO compras_comissao_regras (company_id, versao, percentual, gatilho_min_pct, teto_valor, antecipacao_max_pct, texto_complementar, criado_por_id, criado_por_nome, vigente, kpis_json)
          VALUES (${input.companyId}, 1, ${pct}, 2, 0, 40, '', 0, 'Sistema (versão inicial)', 1, ${JSON.stringify(COMISSAO_KPIS_DEFAULT)})
          ON CONFLICT (company_id, versao) DO NOTHING`);
        rows = ((await db.execute(sql`SELECT * FROM compras_comissao_regras WHERE company_id = ${input.companyId} ORDER BY versao DESC`)) as any).rows;
      }
      const vigente = rows.find((r: any) => Number(r.vigente) === 1) || rows[0];
      const { resolveFaixasRegra, DEFAULT_PREMIO_FAIXAS } = await import("../../shared/premioFaixas");
      return { vigente, historico: rows, kpis: parseKpis(vigente?.kpis_json), kpisDefault: COMISSAO_KPIS_DEFAULT, faixas: resolveFaixasRegra(vigente?.faixas_json, Number(vigente?.percentual ?? 10)), faixasDefault: DEFAULT_PREMIO_FAIXAS };
    }),

  regrasComissaoSalvar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      senhaMaster: z.string().min(1, "Senha do ADM Master obrigatória"),
      percentual: z.number().min(0).max(100),
      gatilhoMinPct: z.number().min(0).max(100),
      tetoValor: z.number().min(0),
      antecipacaoMaxPct: z.number().min(0).max(100),
      textoComplementar: z.string().max(5000).optional(),
      kpis: z.array(z.object({
        chave: z.string().min(1).max(40),
        label: z.string().min(1).max(120),
        peso: z.number().min(0).max(100),
        como: z.string().max(300).optional().default(""),
        formula: z.string().max(400).optional().default(""),
        regua: z.array(z.string().max(200)).max(10).optional().default([]),
        fonte: z.string().max(200).optional().default(""),
      })).min(1).max(10).optional(),
      faixas: z.array(z.object({
        atePct: z.number().positive().max(100).nullable(),
        premioPct: z.number().min(0).max(100),
      })).min(1).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      await assertMasterComSenha(db, ctx, input.senhaMaster);
      await ensureComissaoRegrasTables(db);
      // Scorecard: pesos precisam somar exatamente 100%
      const kpis = input.kpis && input.kpis.length ? input.kpis : COMISSAO_KPIS_DEFAULT;
      const somaPesos = kpis.reduce((s, k) => s + k.peso, 0);
      if (Math.abs(somaPesos - 100) > 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Os pesos dos KPIs devem somar 100% (soma atual: ${somaPesos}%).` });
      }
      const kpisJson = JSON.stringify(kpis);
      // Faixas do prêmio escalonado: validação ESTRITA (última aberta, limites crescentes).
      // Sem faixas no payload (cliente antigo) → preserva o comportamento legado: faixa única com o percentual.
      const { faixasFromLegacyPct, validarFaixasEstrito } = await import("../../shared/premioFaixas");
      let faixasNorm = faixasFromLegacyPct(input.percentual);
      if (input.faixas && input.faixas.length) {
        const erro = validarFaixasEstrito(input.faixas);
        if (erro) throw new TRPCError({ code: "BAD_REQUEST", message: `Faixas inválidas: ${erro}` });
        faixasNorm = input.faixas;
      }
      const faixasJson = JSON.stringify(faixasNorm);
      // Vigência: encerra a versão atual e insere nova (nunca UPDATE in-place).
      // Transação + advisory lock por empresa: saves concorrentes serializam,
      // sem duplicar versão nem deixar 2 vigentes (índices únicos garantem).
      let proxVersao = 0;
      await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478009, ${input.companyId})`);
        const atual: any = await tx.execute(sql`SELECT COALESCE(MAX(versao),0) AS v FROM compras_comissao_regras WHERE company_id = ${input.companyId}`);
        proxVersao = Number(((atual.rows || atual) as any[])[0]?.v || 0) + 1;
        await tx.execute(sql`UPDATE compras_comissao_regras SET vigente = 0, encerrado_em = now() WHERE company_id = ${input.companyId} AND vigente = 1`);
        await tx.execute(sql`
          INSERT INTO compras_comissao_regras (company_id, versao, percentual, gatilho_min_pct, teto_valor, antecipacao_max_pct, texto_complementar, criado_por_id, criado_por_nome, vigente, kpis_json, faixas_json)
          VALUES (${input.companyId}, ${proxVersao}, ${input.percentual}, ${input.gatilhoMinPct}, ${input.tetoValor}, ${input.antecipacaoMaxPct}, ${input.textoComplementar || ""}, ${(ctx.user as any).id}, ${(ctx.user as any).name || (ctx.user as any).email || "ADM Master"}, 1, ${kpisJson}, ${faixasJson})`);
      });
      // Mantém o motor legado (ocNumberConfig.comissaoPercentual) sincronizado
      const existing = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
      if (existing.length) {
        await db.update(ocNumberConfig).set({ comissaoPercentual: String(input.percentual), updatedAt: new Date().toISOString() } as any).where(eq(ocNumberConfig.companyId, input.companyId));
      } else {
        await db.insert(ocNumberConfig).values({ companyId: input.companyId, comissaoPercentual: String(input.percentual) } as any);
      }
      return { ok: true, versao: proxVersao };
    }),

  comissaoAntecipacaoRegistrar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      senhaMaster: z.string().min(1, "Senha do ADM Master obrigatória"),
      obraId: z.number(),
      compradorNome: z.string().min(1),
      valor: z.number().positive(),
      observacao: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      await assertMasterComSenha(db, ctx, input.senhaMaster);
      await ensureComissaoRegrasTables(db);
      // Obra precisa pertencer à empresa (nada de FK cross-tenant)
      const obraRow: any = await db.execute(sql`SELECT id FROM obras WHERE id = ${input.obraId} AND "companyId" = ${input.companyId} AND "deletedAt" IS NULL LIMIT 1`);
      if (!((obraRow.rows || obraRow) as any[]).length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Obra não pertence a esta empresa." });
      }
      // Limite server-side: acumulado de antecipações da obra ≤ antecipacao_max_pct
      // do provisionado formalizado (buyerCommissions). Sem provisão formalizada,
      // exige justificativa em observação (liberalidade consciente do Master).
      const regraRow: any = await db.execute(sql`SELECT antecipacao_max_pct FROM compras_comissao_regras WHERE company_id = ${input.companyId} AND vigente = 1 LIMIT 1`);
      const antecMaxPct = Number(((regraRow.rows || regraRow) as any[])[0]?.antecipacao_max_pct ?? 40);
      const provRow: any = await db.execute(sql`SELECT COALESCE(SUM(valor_comissao::numeric),0) AS prov FROM buyer_commissions WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}`).catch(() => ({ rows: [{ prov: 0 }] }));
      const provisionado = Number(((provRow.rows || provRow) as any[])[0]?.prov || 0);
      const antRow: any = await db.execute(sql`SELECT COALESCE(SUM(valor),0) AS tot FROM compras_comissao_antecipacoes WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}`);
      const jaAntecipado = Number(((antRow.rows || antRow) as any[])[0]?.tot || 0);
      if (provisionado > 0) {
        const limite = provisionado * (antecMaxPct / 100);
        if (jaAntecipado + input.valor > limite + 0.005) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Limite de antecipação excedido: máx. ${antecMaxPct}% do provisionado (${limite.toFixed(2)}); já antecipado ${jaAntecipado.toFixed(2)}.` });
        }
      } else if (!input.observacao || input.observacao.trim().length < 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sem prêmio formalizado nesta obra: informe uma justificativa (mín. 10 caracteres) para antecipar." });
      }
      await db.execute(sql`
        INSERT INTO compras_comissao_antecipacoes (company_id, obra_id, comprador_nome, valor, observacao, criado_por_id, criado_por_nome)
        VALUES (${input.companyId}, ${input.obraId}, ${input.compradorNome}, ${input.valor}, ${input.observacao || ""}, ${(ctx.user as any).id}, ${(ctx.user as any).name || (ctx.user as any).email || "ADM Master"})`);
      return { ok: true };
    }),

  comissaoAntecipacoesListar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      await ensureComissaoRegrasTables(db);
      const rows: any = await db.execute(sql`SELECT * FROM compras_comissao_antecipacoes WHERE company_id = ${input.companyId} ORDER BY created_at DESC`);
      return (rows.rows || rows) as any[];
    }),

  // ── Rev. 5107 — Termo de Adesão com assinatura online (IntegraSign) ──────
  // Fluxo: usuário clica "Estou ciente de tudo" → envelope com 2 signatários
  // (participante + sócio administrador, nesta ordem) → participante assina →
  // sócio assina → adesão concluída = habilitado no ranking + doc no dossiê RH.
  termoAdesaoStatus: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      await ensureComissaoRegrasTables(db);
      const rows: any = await db.execute(sql`SELECT * FROM compras_premio_adesoes WHERE company_id = ${input.companyId} AND status IN ('pendente','concluido') ORDER BY id DESC`);
      const adesoes = (rows.rows || rows) as any[];
      // Sincroniza pendentes com o estado do envelope (concluído/recusado/excluído)
      for (const a of adesoes.filter(x => x.status === "pendente" && x.envelope_id)) {
        const envR: any = await db.execute(sql`SELECT id, status, excluido_em FROM integrasign_envelopes WHERE id = ${a.envelope_id} LIMIT 1`);
        const env = ((envR.rows || envR) as any[])[0];
        if (!env || env.excluido_em || env.status === "recusado" || env.status === "cancelado") {
          await db.execute(sql`UPDATE compras_premio_adesoes SET status = 'cancelado' WHERE id = ${a.id}`);
          a.status = "cancelado";
          continue;
        }
        if (env.status === "concluido") {
          await db.execute(sql`UPDATE compras_premio_adesoes SET status = 'concluido', concluido_em = now() WHERE id = ${a.id} AND status = 'pendente'`);
          a.status = "concluido";
          a.concluido_em = new Date().toISOString();
          // Arquiva no dossiê RH (ficha de documentos) + Raio-X do funcionário
          try {
            const uR: any = await db.execute(sql`SELECT email, name FROM users WHERE id = ${a.user_id} LIMIT 1`);
            const u = ((uR.rows || uR) as any[])[0];
            if (u?.email) {
              const eR: any = await db.execute(sql`SELECT id FROM employees WHERE "companyId" = ${a.company_id} AND LOWER(email) = LOWER(${u.email}) AND "deletedAt" IS NULL LIMIT 1`);
              const emp = ((eR.rows || eR) as any[])[0];
              if (emp && !a.employee_doc_id) {
                const sR: any = await db.execute(sql`SELECT token FROM integrasign_signatarios WHERE envelope_id = ${a.envelope_id} ORDER BY ordem_assinatura ASC LIMIT 1`);
                const token = ((sR.rows || sR) as any[])[0]?.token || "";
                const dR: any = await db.execute(sql`
                  INSERT INTO employee_documents ("companyId", "employeeId", tipo, nome, descricao, "fileUrl", "fileKey", "mimeType", "uploadPor", "uploadPorUserId")
                  VALUES (${a.company_id}, ${emp.id}, 'termo_adesao_premio', ${`Termo de Adesão — Prêmio de Compras (regulamento v${a.regra_versao})`},
                          ${"Assinado eletronicamente pelo participante e pelo sócio administrador (IntegraSign)."},
                          ${token ? `/integrasign/assinar/${token}` : `/integrasign`}, ${`integrasign-envelope-${a.envelope_id}`}, 'text/html', 'Sistema (IntegraSign)', ${a.user_id})
                  RETURNING id`);
                const docId = ((dR.rows || dR) as any[])[0]?.id;
                if (docId) await db.execute(sql`UPDATE compras_premio_adesoes SET employee_doc_id = ${docId} WHERE id = ${a.id}`);
              }
            }
          } catch (err: any) {
            console.error("[PremioCompras] falha ao arquivar termo no dossiê:", err?.message);
          }
        }
      }
      const ativos = adesoes.filter(a => a.status !== "cancelado");
      const minha = ativos.find(a => a.user_id === (ctx.user as any).id) || null;
      let meuToken: string | null = null;
      let faltaSocio = false;
      let socioToken: string | null = null;
      let socioNome: string | null = null;
      if (minha?.envelope_id && minha.status === "pendente") {
        const sR: any = await db.execute(sql`SELECT token, status, ordem_assinatura, nome FROM integrasign_signatarios WHERE envelope_id = ${minha.envelope_id} ORDER BY ordem_assinatura ASC`);
        const sigs = (sR.rows || sR) as any[];
        const meu = sigs[0];
        if (meu && meu.status !== "assinado") meuToken = meu.token;
        faltaSocio = !!meu && meu.status === "assinado";
        // Rev. 5110 — assinatura presencial em sequência (pedido do usuário): depois que o
        // PARTICIPANTE assina, a própria tela Prêmios oferece a assinatura do sócio
        // administrador no mesmo aparelho. O token do sócio só é exposto ao dono da
        // adesão (minha) e somente após a 1ª assinatura (ordem do envelope preservada).
        if (faltaSocio) {
          const soc = sigs[1];
          if (soc && soc.status !== "assinado") { socioToken = soc.token; socioNome = soc.nome || null; }
        }
      }
      return {
        minha: minha ? { status: minha.status, regraVersao: minha.regra_versao, meuToken, faltaSocio, socioToken, socioNome, concluidoEm: minha.concluido_em } : null,
        habilitados: ativos.filter(a => a.status === "concluido").map(a => ({ userId: a.user_id, nome: a.user_nome })),
        pendentes: ativos.filter(a => a.status === "pendente").map(a => ({ userId: a.user_id, nome: a.user_nome })),
      };
    }),

  // Rev. 5111 — Ranking do processo: quantas SCs e cotações cada pessoa criou (por nome de login).
  // OCs e prêmio a receber já são calculados no client a partir de analiseComissoesOCs.
  rankingProcessoCounts: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      const scR: any = await db.execute(sql`
        SELECT UPPER(TRIM(criado_por_nome)) AS chave, MAX(criado_por_nome) AS nome, COUNT(*)::int AS qtd
        FROM compras_solicitacoes
        WHERE company_id = ${input.companyId} AND COALESCE(TRIM(criado_por_nome), '') <> ''
        GROUP BY 1`);
      const cotR: any = await db.execute(sql`
        SELECT UPPER(TRIM(criado_por_nome)) AS chave, MAX(criado_por_nome) AS nome, COUNT(*)::int AS qtd
        FROM compras_cotacoes
        WHERE company_id = ${input.companyId} AND COALESCE(TRIM(criado_por_nome), '') <> ''
        GROUP BY 1`);
      // Rev. 5121 — colaboradores DESLIGADOS ficam fora do ranking, com casamento
      // TOLERANTE de nome (login abreviado, acentos): resolve cada chave do ranking
      // para o colaborador via (a) nome exato normalizado; (b) nome do user com
      // e-mail casando com employee; (c) tokens do login todos contidos no nome
      // completo (só quando o match é ÚNICO — ambíguo nunca derruba ninguém).
      // Cadastro duplicado (mesmo nome, Ativo + Desligado): vale o registro mais
      // recente (maior id) — cobre re-cadastros com status defasado.
      const empR: any = await db.execute(sql`
        SELECT e.id, e."nomeCompleto" AS nome, e.status, e."fotoUrl" AS foto
        FROM employees e
        WHERE e."companyId" = ${input.companyId} AND e."deletedAt" IS NULL
          AND COALESCE(TRIM(e."nomeCompleto"), '') <> ''`);
      const aliasR: any = await db.execute(sql`
        SELECT u.name AS alias, e."nomeCompleto" AS nome
        FROM employees e
        JOIN users u ON e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email)
        WHERE e."companyId" = ${input.companyId} AND e."deletedAt" IS NULL
          AND COALESCE(TRIM(u.name), '') <> ''`);
      const norm = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
      // Por nome normalizado, fica o registro mais recente (maior id)
      const porNome = new Map<string, { id: number; status: string; foto: string | null }>();
      for (const r of ((empR.rows || empR) as any[])) {
        const nk = norm(r.nome);
        const atual = porNome.get(nk);
        if (!atual || Number(r.id) > atual.id) porNome.set(nk, { id: Number(r.id), status: String(r.status || ""), foto: r.foto ? String(r.foto) : (atual?.foto ?? null) });
        else if (!atual.foto && r.foto) atual.foto = String(r.foto);
      }
      const aliasMap = new Map<string, string>();
      for (const r of ((aliasR.rows || aliasR) as any[])) {
        const a = norm(r.alias), nk = norm(r.nome);
        if (a && porNome.has(nk)) aliasMap.set(a, nk);
      }
      const STATUS_FORA = new Set(["DESLIGADO", "LISTA_NEGRA", "INATIVO"]);
      const resolve = (chave: string): { status: string; foto: string | null } | null => {
        const k = norm(chave);
        if (!k) return null;
        const direto = porNome.get(k) || (aliasMap.has(k) ? porNome.get(aliasMap.get(k)!) : undefined);
        if (direto) return direto;
        // Tokens do login todos contidos no nome completo — só com match único
        const toks = k.split(" ").filter(Boolean);
        if (toks.length < 2) return null;
        let achado: string | null = null;
        for (const nk of porNome.keys()) {
          const nomeToks = new Set(nk.split(" "));
          if (toks.every(t => nomeToks.has(t))) {
            if (achado && achado !== nk) return null; // ambíguo: não mexe
            achado = nk;
          }
        }
        return achado ? porNome.get(achado)! : null;
      };
      const chaves = new Set<string>();
      for (const r of ((scR.rows || scR) as any[])) chaves.add(String(r.chave));
      for (const r of ((cotR.rows || cotR) as any[])) chaves.add(String(r.chave));
      const desligados: string[] = [];
      const fotos: Record<string, string> = {};
      for (const chave of chaves) {
        const emp = resolve(chave);
        if (!emp) continue;
        if (STATUS_FORA.has(norm(emp.status))) desligados.push(chave);
        else if (emp.foto) fotos[chave] = emp.foto;
      }
      return {
        scs: ((scR.rows || scR) as any[]).map(r => ({ chave: r.chave, nome: r.nome, qtd: Number(r.qtd) })),
        cotacoes: ((cotR.rows || cotR) as any[]).map(r => ({ chave: r.chave, nome: r.nome, qtd: Number(r.qtd) })),
        desligados,
        fotos,
      };
    }),

  termoAdesaoIniciar: protectedProcedure
    .input(z.object({ companyId: z.number(), aceiteCiencia: z.literal(true) }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyStrict(ctx.user, input.companyId);
      const db = await getDb();
      await ensureComissaoRegrasTables(db);
      const uid = (ctx.user as any).id;
      const uNome = (ctx.user as any).name || (ctx.user as any).email || `Usuário ${uid}`;
      // Idempotente: adesão ativa existente → devolve o link atual
      const { html, regraVersao } = await buildTermoAdesaoHtml(db, input.companyId, { participanteNome: uNome });
      // CLAIM ATÔMICO antes do side effect no IntegraSign: o índice único parcial
      // (company_id, user_id) WHERE status IN ('pendente','concluido') decide a corrida.
      // Quem perde o conflito reusa a adesão existente em vez de criar 2º envelope.
      const insR: any = await db.execute(sql`
        INSERT INTO compras_premio_adesoes (company_id, user_id, user_nome, regra_versao, status, aceite_ciencia_em)
        VALUES (${input.companyId}, ${uid}, ${uNome}, ${regraVersao}, 'pendente', now())
        ON CONFLICT DO NOTHING
        RETURNING id`);
      const claimId = ((insR.rows || insR) as any[])[0]?.id as number | undefined;
      if (!claimId) {
        // Perdeu a corrida ou já existia adesão ativa — devolve o estado atual
        const exR: any = await db.execute(sql`SELECT * FROM compras_premio_adesoes WHERE company_id = ${input.companyId} AND user_id = ${uid} AND status IN ('pendente','concluido') LIMIT 1`);
        const ex = ((exR.rows || exR) as any[])[0];
        if (!ex) throw new TRPCError({ code: "CONFLICT", message: "Tente novamente." });
        if (ex.status === "concluido") return { ok: true, jaHabilitado: true, token: null };
        if (!ex.envelope_id) return { ok: true, jaHabilitado: false, token: null }; // envelope ainda sendo criado pela outra requisição
        const sR: any = await db.execute(sql`SELECT token, status FROM integrasign_signatarios WHERE envelope_id = ${ex.envelope_id} ORDER BY ordem_assinatura ASC LIMIT 1`);
        const meu = ((sR.rows || sR) as any[])[0];
        return { ok: true, jaHabilitado: false, token: meu && meu.status !== "assinado" ? meu.token : null };
      }
      try {
      const { resolveSocioAdministradorSigner } = await import("../services/signatariosContrato");
      const socio = await resolveSocioAdministradorSigner(db, input.companyId);
      const { integrasignRouter } = await import("./integrasign");
      const caller = (integrasignRouter as any).createCaller({ user: ctx.user, session: { userId: uid, name: uNome } });
      const envelope = await caller.criarEnvelope({
        companyId: input.companyId,
        titulo: `Termo de Adesão — Prêmio de Compras — ${uNome}`,
        descricao: `Adesão ao Programa de Prêmio por Desempenho em Compras (regulamento v${regraVersao}). Aceite "Estou ciente de tudo" registrado em ${new Date().toLocaleString("pt-BR")}.`,
        textoContrato: html,
        signatarios: [
          { papel: "gestor_projeto", ordemAssinatura: 1, nome: uNome, email: (ctx.user as any).email || "", cargo: "Participante" },
          { papel: "diretor", ordemAssinatura: 2, nome: socio.nome, email: "", cpfCnpj: socio.cpfCnpj ?? undefined, cargo: "Sócio Administrador" },
        ],
      });
      await caller.enviarParaAssinatura({ companyId: input.companyId, envelopeId: envelope.id, enviarEmail: false });
      await db.execute(sql`UPDATE compras_premio_adesoes SET envelope_id = ${envelope.id} WHERE id = ${claimId}`);
      const sR: any = await db.execute(sql`SELECT token FROM integrasign_signatarios WHERE envelope_id = ${envelope.id} ORDER BY ordem_assinatura ASC LIMIT 1`);
      return { ok: true, jaHabilitado: false, token: ((sR.rows || sR) as any[])[0]?.token || null };
      } catch (err) {
        // Falha no IntegraSign: solta o claim para o usuário poder tentar de novo
        await db.execute(sql`DELETE FROM compras_premio_adesoes WHERE id = ${claimId} AND envelope_id IS NULL`).catch(() => {});
        throw err;
      }
    }),

  aprovarComissao: protectedProcedure
    .input(z.object({ id: z.number(), userId: z.number(), userName: z.string().optional() }))
    .mutation(async ({ input }) => {
      await onComissaoAprovada(input.id, input.userId, input.userName || "Diretor");
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // EMERGENCIAL
  // ══════════════════════════════════════════════════════════════

  metricsEmergencial: protectedProcedure
    .input(z.object({ companyId: z.number(), mes: z.number().optional(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const agora = new Date();
      const mes = input.mes || agora.getMonth() + 1;
      const ano = input.ano || agora.getFullYear();
      const emerg = await db.select().from(emergencyMetrics)
        .where(and(eq(emergencyMetrics.companyId, input.companyId), eq(emergencyMetrics.mes, mes), eq(emergencyMetrics.ano, ano)));
      const scsEmerg = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.emergencial, 1)));
      return { metrics: emerg, totalEmergenciais: scsEmerg.length, emergenciais: scsEmerg };
    }),

  // ══════════════════════════════════════════════════════════════
  // APROVAÇÕES PENDENTES
  // ══════════════════════════════════════════════════════════════

  pendentesAprovacao: protectedProcedure
    .input(z.object({ companyId: z.number(), aprovadorId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const scs = await db.select().from(purchaseRequests)
        .where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.status, "pendente")))
        .orderBy(desc(purchaseRequests.emergencial), asc(purchaseRequests.prazoNecessidade));
      return scs;
    }),

  // ══════════════════════════════════════════════════════════════
  // PORTAL DO FORNECEDOR (por token)
  // ══════════════════════════════════════════════════════════════

  verificarTokenPortal: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseQuotationTokens)
        .where(eq(purchaseQuotationTokens.token, input.token)).limit(1);
      const tok = rows?.[0];
      if (!tok) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      if (tok.expiresAt && new Date(tok.expiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token expirado" });
      }
      await db.update(purchaseQuotationTokens).set({ accessedAt: new Date().toISOString() } as any).where(eq(purchaseQuotationTokens.token, input.token));
      const cot = await db.select().from(purchaseQuotations).where(eq(purchaseQuotations.id, tok.cotacaoId)).limit(1);
      const sc = cot?.[0]?.solicitacaoId
        ? await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, cot[0].solicitacaoId)).limit(1)
        : [];
      const itens = sc?.[0]?.id
        ? await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.solicitacaoId, sc[0].id))
        : [];
      return { token: tok, cotacao: cot?.[0], solicitacao: sc?.[0], itens };
    }),

  submeterPropostaPortal: protectedProcedure
    .input(z.object({
      token: z.string(), valorUnitario: z.number(), valorFrete: z.number().default(0),
      freteTipo: z.string().default("cif"), transportadora: z.string().optional(),
      prazoEntregaDias: z.number().optional(),
      condicaoPagamento: z.string().optional(), tipoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseQuotationTokens).where(eq(purchaseQuotationTokens.token, input.token)).limit(1);
      const tok = rows?.[0];
      if (!tok) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      const freteParaTotal = input.freteTipo === "fob" ? input.valorFrete : 0;
      const total = input.valorUnitario + freteParaTotal;
      await db.update(purchaseQuotationSuppliers).set({
        status: "respondido", valorUnitario: String(input.valorUnitario),
        valorFrete: String(input.valorFrete), freteTipo: input.freteTipo,
        transportadora: input.transportadora ?? null,
        valorTotalComFrete: String(total.toFixed(2)), prazoEntregaDias: input.prazoEntregaDias,
        condicaoPagamento: input.condicaoPagamento, tipoPagamento: input.tipoPagamento,
        numeroParcelas: input.numeroParcelas ?? null,
        observacoes: input.observacoes, respondidoEm: new Date().toISOString(),
      }).where(eq(purchaseQuotationSuppliers.id, tok.quotationSupplierId));
      await db.update(purchaseQuotationTokens).set({ status: "respondido", respondedAt: new Date().toISOString() } as any).where(eq(purchaseQuotationTokens.token, input.token));
      return { ok: true };
    }),

  atualizarDadosEntregaOC: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ordemId: z.number(),
      transportadora: z.string().optional(),
      codigoRastreamento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [oc] = await db.select({ id: purchaseOrders.id, companyId: purchaseOrders.companyId })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, input.ordemId), eq(purchaseOrders.companyId, input.companyId)))
        .limit(1);
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem não encontrada" });
      const updates: any = { updatedAt: new Date().toISOString() };
      if (input.transportadora !== undefined) updates.transportadora = input.transportadora || null;
      if (input.codigoRastreamento !== undefined) updates.codigoRastreamento = input.codigoRastreamento || null;
      await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, input.ordemId));
      return { ok: true };
    }),

  verificarTokenOCPortal: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(purchaseOrders)
        .where(eq((purchaseOrders as any).portalToken, input.token)).limit(1);
      const oc = rows?.[0];
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido ou OC não encontrada" });
      return {
        id: oc.id, numero: oc.numero, supplierNome: oc.supplierNome,
        obraNome: oc.obraNome, status: oc.status,
        freteTipo: (oc as any).freteTipo, valorFrete: (oc as any).valorFrete,
        transportadora: (oc as any).transportadora, codigoRastreamento: (oc as any).codigoRastreamento,
        valorTotal: oc.valorTotal, prazoEntrega: oc.prazoEntrega,
      };
    }),

  atualizarEntregaPortalOC: protectedProcedure
    .input(z.object({
      token: z.string(),
      transportadora: z.string().optional(),
      codigoRastreamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({ id: purchaseOrders.id }).from(purchaseOrders)
        .where(eq((purchaseOrders as any).portalToken, input.token)).limit(1);
      const oc = rows?.[0];
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
      const updates: any = { updatedAt: new Date().toISOString() };
      if (input.transportadora !== undefined) updates.transportadora = input.transportadora || null;
      if (input.codigoRastreamento !== undefined) updates.codigoRastreamento = input.codigoRastreamento || null;
      await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, oc.id));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES
  // ══════════════════════════════════════════════════════════════

  getConfigCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const config = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
      const regras = await db.select().from(purchaseApprovalRules)
        .where(and(eq(purchaseApprovalRules.companyId, input.companyId), eq(purchaseApprovalRules.ativo, 1)));
      const limites = await db.select().from(purchaseSpendingLimits)
        .where(and(eq(purchaseSpendingLimits.companyId, input.companyId), eq(purchaseSpendingLimits.ativo, 1)));
      return { config: config?.[0] ?? null, regras, limites };
    }),

  salvarConfigOC: protectedProcedure
    .input(z.object({
      companyId: z.number(), prefixo: z.string().optional(), separador: z.string().optional(),
      formatoAno: z.string().optional(), digitosSequencial: z.number().optional(),
      comissaoPercentual: z.number().optional(),
      prefixoOs: z.string().optional(),
      retencaoTecnicaPerc: z.number().optional(),
      diaCorte: z.number().optional(),
      prazoAprovacaoDias: z.number().optional(),
      diaPagamento: z.number().optional(),
      alertaReservasAtivo: z.boolean().optional(),
      previstoFonte: z.enum(["motor", "manual"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, alertaReservasAtivo, ...rest } = input;
      const vals: any = { ...rest, updatedAt: new Date().toISOString() };
      if (alertaReservasAtivo !== undefined) {
        vals.alertaReservasAtivo = alertaReservasAtivo ? 1 : 0;
      }
      if (vals.comissaoPercentual !== undefined) {
        vals.comissaoPercentual = String(vals.comissaoPercentual);
      }
      if (vals.retencaoTecnicaPerc !== undefined) {
        vals.retencaoTecnicaPerc = String(vals.retencaoTecnicaPerc);
      }
      const existing = await db.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, companyId)).limit(1);
      if (existing.length) {
        await db.update(ocNumberConfig).set(vals).where(eq(ocNumberConfig.companyId, companyId));
      } else {
        await db.insert(ocNumberConfig).values({ companyId, ...vals } as any);
      }
      return { ok: true };
    }),

  salvarRegraAprovacao: protectedProcedure
    .input(z.object({
      id: z.number().optional(), companyId: z.number(), nome: z.string(),
      obraId: z.number().optional(), nivel1AprovadorId: z.number().optional(),
      nivel1AprovadorTipo: z.string().optional(), nivel1Cargo: z.string().optional(),
      nivel1PrazoHoras: z.number().optional(), nivel2Ativo: z.boolean().optional(),
      nivel2AprovadorId: z.number().optional(), nivel2PrazoHoras: z.number().optional(),
      limiteCompraDireta: z.number().optional(), slaEmergencialHoras: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const data = { ...rest, nivel2Ativo: rest.nivel2Ativo ? 1 : 0, limiteCompraDireta: rest.limiteCompraDireta ? String(rest.limiteCompraDireta) : null } as any;
      if (id) {
        await db.update(purchaseApprovalRules).set(data).where(eq(purchaseApprovalRules.id, id));
      } else {
        await db.insert(purchaseApprovalRules).values(data);
      }
      return { ok: true };
    }),

  salvarLimiteGasto: protectedProcedure
    .input(z.object({
      id: z.number().optional(), companyId: z.number(), nome: z.string().optional(),
      obraId: z.number().optional(), catalogCategoria: z.string().optional(),
      periodoTipo: z.string().optional(), valorLimite: z.number(),
      acaoAoAtingir: z.string().optional(), alertaPercentual: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      const data = { ...rest, valorLimite: String(input.valorLimite) } as any;
      if (id) {
        await db.update(purchaseSpendingLimits).set(data).where(eq(purchaseSpendingLimits.id, id));
      } else {
        await db.insert(purchaseSpendingLimits).values(data);
      }
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // DASHBOARD — painel de resumo
  // ══════════════════════════════════════════════════════════════

  dashboardCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scs, ocs, pendentes, emerg, ap] = await Promise.all([
        db.select().from(purchaseRequests).where(eq(purchaseRequests.companyId, input.companyId)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, input.companyId)),
        db.select().from(purchaseRequests).where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.status, "pendente"))),
        db.select().from(purchaseRequests).where(and(eq(purchaseRequests.companyId, input.companyId), eq(purchaseRequests.emergencial, 1))),
        db.select().from(purchaseAccountsPayable).where(and(eq(purchaseAccountsPayable.companyId, input.companyId), eq(purchaseAccountsPayable.status, "pendente"))),
      ]);
      const valorTotalOCs = ocs.reduce((s: number, o: any) => s + n(o.valorTotal), 0);
      const valorAPendente = ap.reduce((s: number, a: any) => s + (n(a.valorTotal) - n(a.valorPago)), 0);
      return {
        totalSCs: scs.length, totalOCs: ocs.length,
        scsPendentes: pendentes.length, scsEmergenciais: emerg.length,
        valorTotalOCs, valorAPendente,
        statusOCs: ocs.reduce((acc: any, o: any) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {}),
      };
    }),

  // Avaliações de fornecedor
  listarAvaliacoesFornecedor: protectedProcedure
    .input(z.object({ companyId: z.number(), supplierId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(supplierEvaluations.companyId, input.companyId)];
      if (input.supplierId) conditions.push(eq(supplierEvaluations.supplierId, input.supplierId));
      return db.select().from(supplierEvaluations).where(and(...conditions)).orderBy(desc(supplierEvaluations.createdAt));
    }),

  criarAvaliacaoFornecedor: protectedProcedure
    .input(z.object({
      companyId: z.number(), supplierId: z.number(), ordemCompraId: z.number().optional(),
      notaPrazo: z.number(), notaQualidade: z.number(), notaAtendimento: z.number(),
      observacoes: z.string().optional(), avaliadorId: z.number(), avaliadorNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const media = ((input.notaPrazo + input.notaQualidade + input.notaAtendimento) / 3).toFixed(2);
      const [av] = await db.insert(supplierEvaluations).values({ ...input, mediaGeral: media } as any).returning();
      return av;
    }),

  // Contratos de fornecedor
  listarContratosFornecedor: protectedProcedure
    .input(z.object({ companyId: z.number(), supplierId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(supplierContracts.companyId, input.companyId)];
      if (input.supplierId) conditions.push(eq(supplierContracts.supplierId, input.supplierId));
      if (input.status) conditions.push(eq(supplierContracts.status, input.status));
      return db.select().from(supplierContracts).where(and(...conditions)).orderBy(desc(supplierContracts.dataFim));
    }),

  criarContratoFornecedor: protectedProcedure
    .input(z.object({
      companyId: z.number(), supplierId: z.number(), supplierNome: z.string().optional(),
      catalogItemId: z.number().optional(), itemNome: z.string().optional(),
      valorUnitario: z.number(), unidade: z.string().optional(),
      dataInicio: z.string(), dataFim: z.string(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [c] = await db.insert(supplierContracts).values({ ...input, valorUnitario: String(input.valorUnitario) } as any).returning();
      return c;
    }),

  // Histórico de preços
  historicoPrecosItem: protectedProcedure
    .input(z.object({ companyId: z.number(), catalogItemId: z.number(), supplierId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: any[] = [eq(supplierPriceHistory.companyId, input.companyId), eq(supplierPriceHistory.catalogItemId, input.catalogItemId)];
      if (input.supplierId) conditions.push(eq(supplierPriceHistory.supplierId, input.supplierId));
      return db.select().from(supplierPriceHistory).where(and(...conditions)).orderBy(desc(supplierPriceHistory.dataReferencia)).limit(50);
    }),
});
