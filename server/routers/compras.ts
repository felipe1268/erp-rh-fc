import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { criarParcelasFinanceiras } from "../services/purchaseFinancialBridge";
import { getTipoPagamentoInfo } from "../../shared/paymentConditions";
import { normalizarTexto } from "../../shared/textNormalization";
import { invokeLLM, invokeAnthropicVision } from "../_core/llm";
import { storagePut } from "../storage";
import { eq, and, desc, asc, ilike, or, sql, gte, lte, inArray, isNull } from "drizzle-orm";
import {
  fornecedores, avaliacoesFornecedor, almoxarifadoItens, almoxarifadoMovimentacoes,
  almoxarifadoCategorias, almoxarifadoUnidades, almoxarifadoRecebimentos,
  comprasSolicitacoes, comprasSolicitacoesItens,
  comprasCotacoes, comprasCotacoesItens,
  comprasCotacaoFornecedores, comprasCotacaoRespostas,
  comprasCotacaoPropostas, comprasCondicoesPagamento,
  comprasOrdens, comprasOrdensItens, comprasEntregasProgramadas,
  comprasRiscoDebitos,
  users,
  obras,
  orcamentos, orcamentoItens,
  composicaoInsumos, composicoesCatalogo, insumosCatalogo,
  bdiIndiretos, orcamentoBdi,
  planejamentoProjetos, planejamentoRevisoes, planejamentoAtividades,
  financialEntries, financialAccounts,
  purchaseAccountsPayable,
  almoxarifadoNotificacoes,
  purchaseOrders, purchaseRequests, purchaseQuotations,
} from "../../drizzle/schema";
const n = (v: any) => parseFloat(v ?? "0") || 0;

const iaExtractionJobs = new Map<string, { status: string; startedAt: number; result?: any; error?: string }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of iaExtractionJobs) {
    if (now - v.startedAt > 10 * 60 * 1000) iaExtractionJobs.delete(k);
  }
}, 60000);

const conversaoCache = new Map<string, { unidadeComercial: string; fatorConversao: number; embalagem: string }>();

async function ensureConversaoCacheTable() {
  const db = await getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS insumos_conversao_cache (
      chave TEXT PRIMARY KEY,
      unidade_comercial TEXT NOT NULL,
      fator_conversao NUMERIC NOT NULL,
      embalagem TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
let conversaoTableReady = false;

async function getConversaoIA(insumos: { descricao: string; unidade: string }[]): Promise<Record<string, { unidadeComercial: string; fatorConversao: number; embalagem: string }>> {
  if (!conversaoTableReady) {
    await ensureConversaoCacheTable();
    conversaoTableReady = true;
  }
  const db = await getDb();

  const toResolve: { descricao: string; unidade: string; chave: string }[] = [];
  const result: Record<string, { unidadeComercial: string; fatorConversao: number; embalagem: string }> = {};

  for (const ins of insumos) {
    const chave = `${ins.descricao.toLowerCase().trim()}|${ins.unidade.toLowerCase().trim()}`;
    if (conversaoCache.has(chave)) {
      result[chave] = conversaoCache.get(chave)!;
      continue;
    }
    const dbRow = await db.execute(sql`SELECT unidade_comercial, fator_conversao, embalagem FROM insumos_conversao_cache WHERE chave = ${chave} LIMIT 1`);
    const rows = (dbRow as any).rows || [];
    if (rows.length > 0) {
      const cached = { unidadeComercial: rows[0].unidade_comercial, fatorConversao: parseFloat(rows[0].fator_conversao), embalagem: rows[0].embalagem };
      conversaoCache.set(chave, cached);
      result[chave] = cached;
      continue;
    }
    toResolve.push({ ...ins, chave });
  }

  if (toResolve.length === 0) return result;

  const batchSize = 20;
  for (let i = 0; i < toResolve.length; i += batchSize) {
    const batch = toResolve.slice(i, i + batchSize);
    const lista = batch.map((b, idx) => `${idx + 1}. "${b.descricao}" (unidade orçamento: ${b.unidade})`).join("\n");

    try {
      const aiResult = await invokeLLM({
        messages: [
          { role: "system", content: `Você é um especialista em materiais de construção civil no Brasil. Para cada insumo, informe como ele é REALMENTE vendido no mercado (embalagem comercial, unidade de venda, fator de conversão).

REGRAS:
- Responda APENAS com JSON válido, sem markdown
- O JSON deve ser um array de objetos com: idx, embalagem, unidadeComercial, fatorConversao
- embalagem: descrição curta da embalagem comercial real (ex: "saco 50kg", "balde 18L", "tambor 200L", "barra 12m", "caminhão 6m³", "m²", "m³")
- unidadeComercial: unidade de venda (ex: "saco", "balde", "lata", "galão", "barra", "caminhão", "m²", "rolo")
- fatorConversao: quantas unidades orçadas cabem em 1 embalagem comercial (ex: 1 saco de cimento = 50kg, então fator = 50)
- Se o insumo já é vendido na mesma unidade do orçamento (ex: m², m³, un), retorne fatorConversao = 1 e embalagem = unidade original
- NÃO invente embalagens que não existem no mercado. Cal líquido é vendido em baldes/tambores, não em sacos.
- Considere as formas de comercialização mais comuns no mercado brasileiro de construção civil` },
          { role: "user", content: `Determine a embalagem comercial real para cada insumo:\n${lista}` }
        ],
        maxTokens: 2048,
      });

      const content = aiResult.choices[0]?.message?.content || "";
      const textContent = typeof content === "string" ? content : (content as any[]).map((c: any) => c.text || "").join("");
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { idx: number; embalagem: string; unidadeComercial: string; fatorConversao: number }[];
        for (const item of parsed) {
          const batchItem = batch[item.idx - 1];
          if (!batchItem) continue;
          const fator = Number(item.fatorConversao);
          if (!isFinite(fator) || fator <= 0) continue;
          const conv = { unidadeComercial: item.unidadeComercial || "", fatorConversao: fator, embalagem: item.embalagem || "" };
          result[batchItem.chave] = conv;
          conversaoCache.set(batchItem.chave, conv);
          try {
            await db.execute(sql`INSERT INTO insumos_conversao_cache (chave, unidade_comercial, fator_conversao, embalagem) VALUES (${batchItem.chave}, ${conv.unidadeComercial}, ${conv.fatorConversao}, ${conv.embalagem}) ON CONFLICT (chave) DO UPDATE SET unidade_comercial = ${conv.unidadeComercial}, fator_conversao = ${conv.fatorConversao}, embalagem = ${conv.embalagem}`);
          } catch {}
        }
      }
    } catch (e: any) {
      console.error("[ConversaoIA] Erro:", e.message);
    }
  }

  return result;
}

async function calcScoreFornecedor(db: any, fornecedorId: number, companyId: number) {
  const ocsRows = await db.select().from(comprasOrdens)
    .where(and(
      eq(comprasOrdens.companyId, companyId),
      eq(comprasOrdens.fornecedorId, fornecedorId),
    ));

  const totalOCs = ocsRows.length;
  let ocsPontuais = 0;
  let ocsComData = 0;
  let totalValorOCs = 0;

  for (const oc of ocsRows) {
    totalValorOCs += n(oc.total);
    if (oc.dataEntregaPrevista && oc.dataEntregaReal) {
      ocsComData++;
      if (new Date(oc.dataEntregaReal) <= new Date(oc.dataEntregaPrevista)) ocsPontuais++;
    } else if (oc.dataEntregaPrevista && !oc.dataEntregaReal && oc.status === "entregue") {
      ocsComData++;
      ocsPontuais++;
    }
  }
  const taxaPontualidade = ocsComData > 0 ? ocsPontuais / ocsComData : 1;

  const companyCotIds = await db.select({ id: comprasCotacoes.id })
    .from(comprasCotacoes).where(eq(comprasCotacoes.companyId, companyId));
  const cotIdSet = new Set(companyCotIds.map((c: any) => c.id));

  const cotacoesParticipadas = cotIdSet.size > 0
    ? await db.select({
        cotacaoId: comprasCotacaoFornecedores.cotacaoId,
        totalOrcado: comprasCotacaoFornecedores.totalOrcado,
        selecionado: comprasCotacaoFornecedores.selecionado,
        prazoEntregaDias: comprasCotacaoFornecedores.prazoEntregaDias,
      }).from(comprasCotacaoFornecedores)
        .where(and(
          eq(comprasCotacaoFornecedores.fornecedorId, fornecedorId),
          inArray(comprasCotacaoFornecedores.cotacaoId, [...cotIdSet]),
        ))
    : [];

  let cotacoesVencidas = 0;
  let cotacoesComPreco = 0;
  let melhorPrecoCount = 0;
  let cotacoesComPrazo = 0;
  let melhorPrazoCount = 0;

  if (cotacoesParticipadas.length > 0) {
    const participatedCotIds = [...new Set(cotacoesParticipadas.map((cp: any) => cp.cotacaoId))];
    const allPartRows = await db.select({
      cotacaoId: comprasCotacaoFornecedores.cotacaoId,
      fornecedorId: comprasCotacaoFornecedores.fornecedorId,
      totalOrcado: comprasCotacaoFornecedores.totalOrcado,
      prazoEntregaDias: comprasCotacaoFornecedores.prazoEntregaDias,
    }).from(comprasCotacaoFornecedores)
      .where(inArray(comprasCotacaoFornecedores.cotacaoId, participatedCotIds));

    const minPriceByCot: Record<number, number> = {};
    const minPrazoByCot: Record<number, number> = {};
    for (const row of allPartRows) {
      const v = n(row.totalOrcado);
      if (v > 0 && (!(row.cotacaoId in minPriceByCot) || v < minPriceByCot[row.cotacaoId])) {
        minPriceByCot[row.cotacaoId] = v;
      }
      const prazo = row.prazoEntregaDias ?? 0;
      if (prazo > 0 && (!(row.cotacaoId in minPrazoByCot) || prazo < minPrazoByCot[row.cotacaoId])) {
        minPrazoByCot[row.cotacaoId] = prazo;
      }
    }

    for (const cp of cotacoesParticipadas) {
      const totalForn = n(cp.totalOrcado);
      if (totalForn > 0) {
        cotacoesComPreco++;
        if (cp.selecionado) cotacoesVencidas++;
        if (totalForn <= (minPriceByCot[cp.cotacaoId] ?? Infinity)) melhorPrecoCount++;
      }
      const prazo = cp.prazoEntregaDias ?? 0;
      if (prazo > 0) {
        cotacoesComPrazo++;
        if (prazo <= (minPrazoByCot[cp.cotacaoId] ?? Infinity)) melhorPrazoCount++;
      }
    }
  }
  const taxaCompetitividade = cotacoesComPreco > 0 ? melhorPrecoCount / cotacoesComPreco : 0;
  const taxaPrazoEntrega = cotacoesComPrazo > 0 ? melhorPrazoCount / cotacoesComPrazo : 0;

  const avaliacoesRows = await db.select({
      nota: avaliacoesFornecedor.nota,
      comentario: avaliacoesFornecedor.comentario,
      criadoEm: avaliacoesFornecedor.criadoEm,
    })
    .from(avaliacoesFornecedor)
    .where(and(
      eq(avaliacoesFornecedor.fornecedorId, fornecedorId),
      eq(avaliacoesFornecedor.companyId, companyId),
    ))
    .orderBy(desc(avaliacoesFornecedor.criadoEm));
  const mediaAvaliacoes = avaliacoesRows.length > 0
    ? avaliacoesRows.reduce((s: number, r: any) => s + r.nota, 0) / avaliacoesRows.length
    : 0;
  const totalAvaliacoes = avaliacoesRows.length;
  const ultimasAvaliacoes = avaliacoesRows.slice(0, 5).map((a: any) => ({
    nota: a.nota,
    comentario: a.comentario,
    criadoEm: a.criadoEm,
  }));

  const ocIds = ocsRows.map((oc: any) => oc.id);
  let totalRecebimentos = 0;
  let totalDivergencias = 0;
  if (ocIds.length > 0) {
    const recebimentosRows = await db.select({
      temDivergencia: almoxarifadoRecebimentos.temDivergencia,
    }).from(almoxarifadoRecebimentos)
      .where(and(
        eq(almoxarifadoRecebimentos.companyId, companyId),
        inArray(almoxarifadoRecebimentos.ordemCompraId, ocIds),
      ));
    totalRecebimentos = recebimentosRows.length;
    totalDivergencias = recebimentosRows.filter((r: any) => r.temDivergencia).length;
  }
  const taxaSemDivergencia = totalRecebimentos > 0
    ? (totalRecebimentos - totalDivergencias) / totalRecebimentos
    : 1;

  let score = 0;
  score += taxaPontualidade * 5 * 0.25;
  score += taxaCompetitividade * 5 * 0.20;
  score += taxaSemDivergencia * 5 * 0.15;
  score += taxaPrazoEntrega * 5 * 0.15;
  score += (totalAvaliacoes > 0 ? mediaAvaliacoes : 3) * 0.15;
  score += Math.min(totalOCs / 10, 1) * 5 * 0.10;
  score = Math.round(Math.min(score, 5) * 10) / 10;

  return {
    score,
    totalOCs,
    totalValorOCs,
    taxaPontualidade: Math.round(taxaPontualidade * 100),
    ocsComData,
    ocsPontuais,
    cotacoesParticipadas: cotacoesParticipadas.length,
    cotacoesVencidas,
    taxaCompetitividade: Math.round(taxaCompetitividade * 100),
    taxaPrazoEntrega: Math.round(taxaPrazoEntrega * 100),
    mediaAvaliacoes: totalAvaliacoes > 0 ? Math.round(mediaAvaliacoes * 10) / 10 : null,
    totalAvaliacoes,
    totalDivergencias,
    totalRecebimentos,
    taxaSemDivergencia: Math.round(taxaSemDivergencia * 100),
    ultimasAvaliacoes,
  };
}

export const comprasRouter = router({

  // ══════════════════════════════════════════════════════════════
  // FORNECEDORES
  // ══════════════════════════════════════════════════════════════

  listarFornecedores: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      busca:     z.string().optional(),
      categoria: z.string().optional(),
      ativo:     z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(fornecedores)
        .where(and(
          eq(fornecedores.companyId, input.companyId),
          input.ativo !== undefined ? eq(fornecedores.ativo, input.ativo) : undefined,
        ))
        .orderBy(asc(fornecedores.razaoSocial));

      let result = rows;
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(f =>
          f.razaoSocial?.toLowerCase().includes(b) ||
          f.nomeFantasia?.toLowerCase().includes(b) ||
          f.cnpj?.includes(b) ||
          f.cidade?.toLowerCase().includes(b)
        );
      }
      if (input.categoria) {
        result = result.filter(f =>
          Array.isArray(f.categorias) && (f.categorias as string[]).includes(input.categoria!)
        );
      }
      return result;
    }),

  getFornecedor: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [f] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.id));
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      return f;
    }),

  criarFornecedor: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      cnpj:            z.string().optional(),
      razaoSocial:     z.string().min(1),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      banco:           z.string().optional(),
      agencia:         z.string().optional(),
      conta:           z.string().optional(),
      pix:             z.string().optional(),
      categorias:      z.array(z.string()).optional(),
      observacoes:     z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [f] = await db.insert(fornecedores).values({
        companyId:       input.companyId,
        cnpj:            input.cnpj ?? null,
        razaoSocial:     input.razaoSocial,
        nomeFantasia:    input.nomeFantasia ?? null,
        situacaoReceita: input.situacaoReceita ?? null,
        endereco:        input.endereco ?? null,
        numero:          input.numero ?? null,
        complemento:     input.complemento ?? null,
        bairro:          input.bairro ?? null,
        cidade:          input.cidade ?? null,
        estado:          input.estado ?? null,
        cep:             input.cep ?? null,
        telefone:        input.telefone ?? null,
        email:           input.email ?? null,
        contatoNome:     input.contatoNome ?? null,
        contatoCelular:  input.contatoCelular ?? null,
        contatoEmail:    input.contatoEmail ?? null,
        banco:           input.banco ?? null,
        agencia:         input.agencia ?? null,
        conta:           input.conta ?? null,
        pix:             input.pix ?? null,
        categorias:      input.categorias ?? [],
        observacoes:     input.observacoes ?? null,
        ativo:           true,
      }).returning();
      return f;
    }),

  atualizarFornecedor: protectedProcedure
    .input(z.object({
      id:              z.number(),
      razaoSocial:     z.string().min(1).optional(),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      banco:           z.string().optional(),
      agencia:         z.string().optional(),
      conta:           z.string().optional(),
      pix:             z.string().optional(),
      categorias:      z.array(z.string()).optional(),
      observacoes:     z.string().optional(),
      ativo:           z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(fornecedores)
        .set({ ...data, atualizadoEm: new Date().toISOString() })
        .where(eq(fornecedores.id, id));
      return { success: true };
    }),

  excluirFornecedor: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(fornecedores)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() })
        .where(eq(fornecedores.id, input.id));
      return { success: true };
    }),

  // Busca dados do CNPJ via BrasilAPI (proxy server-side evita CORS)
  buscarCNPJ: protectedProcedure
    .input(z.object({ cnpj: z.string() }))
    .query(async ({ input }) => {
      const cnpjLimpo = input.cnpj.replace(/\D/g, "");
      if (cnpjLimpo.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido" });
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
        if (!res.ok) throw new TRPCError({ code: "NOT_FOUND", message: "CNPJ não encontrado na Receita Federal" });
        const data = await res.json() as any;
        return {
          cnpj:            cnpjLimpo,
          razaoSocial:     data.razao_social ?? "",
          nomeFantasia:    data.nome_fantasia ?? "",
          situacaoReceita: data.descricao_situacao_cadastral ?? "",
          situacaoCodigo:  data.codigo_situacao_cadastral ?? 0,
          endereco:        data.logradouro ? `${data.tipo_logradouro ?? ""} ${data.logradouro}`.trim() : "",
          numero:          data.numero ?? "",
          complemento:     data.complemento ?? "",
          bairro:          data.bairro ?? "",
          cidade:          data.municipio ?? "",
          estado:          data.uf ?? "",
          cep:             data.cep ?? "",
          telefone:        data.ddd_telefone_1 ?? "",
          email:           data.email ?? "",
        };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao consultar a Receita Federal" });
      }
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — ITENS
  // ══════════════════════════════════════════════════════════════

  listarItens: protectedProcedure
    .input(z.object({
      companyId:          z.number(),
      obraId:             z.number().nullable().optional(),
      busca:              z.string().optional(),
      categoria:          z.string().optional(),
      apenasAbaixoMinimo: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const conditions: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ];

      if (input.obraId === null) {
        conditions.push(sql`${almoxarifadoItens.obraId} IS NULL`);
      } else if (input.obraId !== undefined) {
        conditions.push(eq(almoxarifadoItens.obraId, input.obraId));
      }

      const rows = await db.select().from(almoxarifadoItens)
        .where(and(...conditions))
        .orderBy(asc(almoxarifadoItens.nome));

      let result = rows;
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(i =>
          i.nome.toLowerCase().includes(b) ||
          i.codigoInterno?.toLowerCase().includes(b) ||
          i.categoria?.toLowerCase().includes(b)
        );
      }
      if (input.categoria) {
        result = result.filter(i => i.categoria === input.categoria);
      }
      if (input.apenasAbaixoMinimo) {
        result = result.filter(i => n(i.quantidadeAtual) < n(i.quantidadeMinima));
      }
      return result;
    }),

  criarItem: protectedProcedure
    .input(z.object({
      companyId:             z.number(),
      obraId:                z.number().nullable().optional(),
      nome:                  z.string().min(1),
      unidade:               z.string().default("un"),
      categoria:             z.string().optional(),
      codigoInterno:         z.string().optional(),
      quantidadeAtual:       z.number().optional(),
      quantidadeMinima:      z.number().optional(),
      observacoes:           z.string().optional(),
      fotoUrl:               z.string().optional(),
      valorUnitario:         z.number().nullable().optional(),
      origem:                z.enum(["proprio", "alugado"]).optional(),
      fornecedorLocacao:     z.string().optional(),
      dataInicioLocacao:     z.string().optional(),
      dataVencimentoLocacao: z.string().optional(),
      valorLocacaoMensal:    z.number().optional(),
      diasAlertaLocacao:     z.number().optional(),
      observacoesLocacao:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.insert(almoxarifadoItens).values({
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        nome:                  input.nome,
        unidade:               input.unidade,
        categoria:             input.categoria ?? null,
        codigoInterno:         input.codigoInterno ?? null,
        quantidadeAtual:       String(input.quantidadeAtual ?? 0),
        quantidadeMinima:      String(input.quantidadeMinima ?? 0),
        observacoes:           input.observacoes ?? null,
        fotoUrl:               input.fotoUrl ?? null,
        valorUnitario:         input.valorUnitario != null ? String(input.valorUnitario) : null,
        ativo:                 true,
        origem:                input.origem ?? "proprio",
        fornecedorLocacao:     input.fornecedorLocacao ?? null,
        dataInicioLocacao:     input.dataInicioLocacao ?? null,
        dataVencimentoLocacao: input.dataVencimentoLocacao ?? null,
        valorLocacaoMensal:    input.valorLocacaoMensal != null ? String(input.valorLocacaoMensal) : null,
        diasAlertaLocacao:     input.diasAlertaLocacao ?? 7,
        observacoesLocacao:    input.observacoesLocacao ?? null,
      } as any).returning();
      return item;
    }),

  atualizarItem: protectedProcedure
    .input(z.object({
      id:                    z.number(),
      nome:                  z.string().optional(),
      unidade:               z.string().optional(),
      categoria:             z.string().optional(),
      codigoInterno:         z.string().optional(),
      quantidadeMinima:      z.number().optional(),
      observacoes:           z.string().optional(),
      fotoUrl:               z.string().nullable().optional(),
      valorUnitario:         z.number().nullable().optional(),
      origem:                z.enum(["proprio", "alugado"]).optional(),
      fornecedorLocacao:     z.string().nullable().optional(),
      dataInicioLocacao:     z.string().nullable().optional(),
      dataVencimentoLocacao: z.string().nullable().optional(),
      valorLocacaoMensal:    z.number().nullable().optional(),
      diasAlertaLocacao:     z.number().nullable().optional(),
      observacoesLocacao:    z.string().nullable().optional(),
      quantidadeAtual:       z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const updates: any = { atualizadoEm: new Date().toISOString() };
      if (data.nome !== undefined)                 updates.nome = data.nome;
      if (data.unidade !== undefined)              updates.unidade = data.unidade;
      if (data.categoria !== undefined)            updates.categoria = data.categoria;
      if (data.codigoInterno !== undefined)        updates.codigoInterno = data.codigoInterno;
      if (data.quantidadeMinima !== undefined)     updates.quantidadeMinima = String(data.quantidadeMinima);
      if (data.observacoes !== undefined)          updates.observacoes = data.observacoes;
      if ('fotoUrl' in data)                       updates.fotoUrl = data.fotoUrl;
      if ('valorUnitario' in data)                 updates.valorUnitario = data.valorUnitario != null ? String(data.valorUnitario) : null;
      if (data.origem !== undefined)               updates.origem = data.origem;
      if ('fornecedorLocacao' in data)             updates.fornecedorLocacao = data.fornecedorLocacao;
      if ('dataInicioLocacao' in data)             updates.dataInicioLocacao = data.dataInicioLocacao;
      if ('dataVencimentoLocacao' in data)         updates.dataVencimentoLocacao = data.dataVencimentoLocacao;
      if ('valorLocacaoMensal' in data)            updates.valorLocacaoMensal = data.valorLocacaoMensal != null ? String(data.valorLocacaoMensal) : null;
      if ('diasAlertaLocacao' in data && data.diasAlertaLocacao != null) updates.diasAlertaLocacao = data.diasAlertaLocacao;
      if ('observacoesLocacao' in data)            updates.observacoesLocacao = data.observacoesLocacao;
      if (data.quantidadeAtual !== undefined && data.quantidadeAtual !== null) updates.quantidadeAtual = String(data.quantidadeAtual);
      await db.update(almoxarifadoItens).set(updates).where(eq(almoxarifadoItens.id, id));
      return { success: true };
    }),

  getItensLocadosVencendo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          eq(almoxarifadoItens.origem, "alugado"),
        ));
      const hoje = new Date();
      return rows
        .filter(i => i.dataVencimentoLocacao)
        .map(i => {
          const venc = new Date(i.dataVencimentoLocacao!);
          const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const alertaDias = (i as any).diasAlertaLocacao ?? 7;
          return { ...i, diasParaVencimento: diffDias, alertaDias };
        })
        .filter(i => i.diasParaVencimento <= i.alertaDias)
        .sort((a, b) => a.diasParaVencimento - b.diasParaVencimento);
    }),

  devolverLocacaoItem: protectedProcedure
    .input(z.object({ id: z.number(), observacao: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const obs = input.observacao ? `\nDevolução em ${new Date().toLocaleDateString("pt-BR")}: ${input.observacao}` : `\nDevolução em ${new Date().toLocaleDateString("pt-BR")}`;
      await db.update(almoxarifadoItens).set({
        origem: "proprio",
        fornecedorLocacao: null,
        dataInicioLocacao: null,
        dataVencimentoLocacao: null,
        valorLocacaoMensal: null,
        observacoesLocacao: sql`COALESCE(observacoes_locacao, '') || ${obs}`,
        ativo: false,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(almoxarifadoItens.id, input.id));
      return { success: true };
    }),

  excluirItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(almoxarifadoItens)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() })
        .where(eq(almoxarifadoItens.id, input.id));
      return { success: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — ESTOQUE CONSOLIDADO
  // ══════════════════════════════════════════════════════════════

  listarItensConsolidado: protectedProcedure
    .input(z.object({ companyId: z.number(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(eq(almoxarifadoItens.companyId, input.companyId), eq(almoxarifadoItens.ativo, true)))
        .orderBy(asc(almoxarifadoItens.nome));

      const busca = input.busca?.toLowerCase();
      const filtered = busca
        ? rows.filter(i => i.nome.toLowerCase().includes(busca) || i.categoria?.toLowerCase().includes(busca) || i.codigoInterno?.toLowerCase().includes(busca))
        : rows;

      // Group by (nome + unidade + categoria) and sum quantities
      const map = new Map<string, any>();
      for (const item of filtered) {
        const key = `${item.nome.toLowerCase()}|${item.unidade}`;
        if (!map.has(key)) {
          map.set(key, {
            nome: item.nome, unidade: item.unidade, categoria: item.categoria,
            codigoInterno: item.codigoInterno,
            quantidadeTotal: 0, valorUnitario: null,
            valorTotalEstoque: 0, almoxarifados: [],
          });
        }
        const entry = map.get(key)!;
        const qty = n(item.quantidadeAtual);
        entry.quantidadeTotal += qty;
        if (!entry.valorUnitario && item.valorUnitario) entry.valorUnitario = item.valorUnitario;
        const vu = n(entry.valorUnitario);
        if (item.obraId) {
          entry.almoxarifados.push({ tipo: "obra", obraId: item.obraId, quantidade: qty, itemId: item.id });
        } else {
          entry.almoxarifados.push({ tipo: "central", quantidade: qty, itemId: item.id });
        }
      }
      const result = Array.from(map.values()).map(e => ({
        ...e,
        valorTotalEstoque: n(e.valorUnitario) * e.quantidadeTotal,
      }));
      const totalGeral = result.reduce((s, r) => s + r.valorTotalEstoque, 0);
      return { itens: result, totalGeral };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — IA: SUGESTÃO DE PREÇO POR FOTO
  // ══════════════════════════════════════════════════════════════

  sugerirPrecoIA: protectedProcedure
    .input(z.object({
      nome: z.string(),
      unidade: z.string().optional(),
      categoria: z.string().optional(),
      fotoUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const content: any[] = [];
      if (input.fotoUrl) {
        try {
          if (input.fotoUrl.startsWith("data:")) {
            content.push({ type: "image_url", image_url: { url: input.fotoUrl, detail: "low" } });
          } else {
            const imgResp = await fetch(input.fotoUrl);
            if (imgResp.ok) {
              const buf = Buffer.from(await imgResp.arrayBuffer());
              const ct = imgResp.headers.get("content-type") || "image/jpeg";
              const b64 = `data:${ct};base64,${buf.toString("base64")}`;
              content.push({ type: "image_url", image_url: { url: b64, detail: "low" } });
            }
          }
        } catch {}
      }
      content.push({
        type: "text",
        text: `Você é um especialista em precificação de materiais e equipamentos de construção civil no Brasil.
Com base ${input.fotoUrl ? "na imagem e " : ""}no nome do item abaixo, estime o preço médio unitário de mercado (em Reais, R$) para compra/aquisição deste item.

Item: ${input.nome}
${input.unidade ? `Unidade: ${input.unidade}` : ""}
${input.categoria ? `Categoria: ${input.categoria}` : ""}

Responda APENAS com um objeto JSON no formato:
{
  "precoSugerido": <número em reais, ex: 45.90>,
  "descricao": "<breve descrição do item identificado>",
  "justificativa": "<1-2 frases explicando a base da estimativa>",
  "confianca": "alta" | "media" | "baixa"
}`,
      });

      const result = await invokeLLM({
        messages: [{ role: "user", content }],
        maxTokens: 300,
      });

      try {
        const text = result.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("JSON não encontrado na resposta");
        return JSON.parse(match[0]);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou preço válido. Tente novamente." });
      }
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — MOVIMENTAÇÕES
  // ══════════════════════════════════════════════════════════════

  registrarMovimento: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      itemId:      z.number(),
      tipo:        z.enum(["entrada", "saida", "ajuste"]),
      quantidade:  z.number().positive(),
      obraId:      z.number().optional(),
      obraNome:    z.string().optional(),
      motivo:      z.string().optional(),
      usuarioId:   z.number().optional(),
      usuarioNome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Verifica saldo disponível para saída
      if (input.tipo === "saida") {
        const [item] = await db.select().from(almoxarifadoItens)
          .where(eq(almoxarifadoItens.id, input.itemId));
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        if (n(item.quantidadeAtual) < input.quantidade) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo insuficiente. Disponível: ${n(item.quantidadeAtual)} ${item.unidade}`,
          });
        }
      }

      // Registra movimentação
      await db.insert(almoxarifadoMovimentacoes).values({
        companyId:   input.companyId,
        itemId:      input.itemId,
        tipo:        input.tipo,
        quantidade:  String(input.quantidade),
        obraId:      input.obraId ?? null,
        obraNome:    input.obraNome ?? null,
        motivo:      input.motivo ?? null,
        usuarioId:   input.usuarioId ?? null,
        usuarioNome: input.usuarioNome ?? null,
        observacoes: input.observacoes ?? null,
      });

      // Atualiza saldo do item
      const delta = input.tipo === "entrada" ? input.quantidade : -input.quantidade;
      await db.update(almoxarifadoItens)
        .set({
          quantidadeAtual: sql`GREATEST(0, ${almoxarifadoItens.quantidadeAtual}::numeric + ${delta})`,
          atualizadoEm: new Date().toISOString(),
        })
        .where(eq(almoxarifadoItens.id, input.itemId));

      return { success: true };
    }),

  listarMovimentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      itemId:    z.number().optional(),
      limite:    z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(almoxarifadoMovimentacoes)
        .where(and(
          eq(almoxarifadoMovimentacoes.companyId, input.companyId),
          input.itemId ? eq(almoxarifadoMovimentacoes.itemId, input.itemId) : undefined,
        ))
        .orderBy(desc(almoxarifadoMovimentacoes.criadoEm))
        .limit(input.limite ?? 200);
    }),

  // Categorias distintas dos itens do almoxarifado (legado - mantido para compatibilidade)
  listarCategoriasAlmoxarifado: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
      return rows.map(r => r.nome);
    }),

  // ══════════════════════════════════════════════════════════════
  // CATEGORIAS DO ALMOXARIFADO (CRUD)
  // ══════════════════════════════════════════════════════════════
  listarCategorias: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
    }),

  criarCategoria: protectedProcedure
    .input(z.object({ companyId: z.number(), nome: z.string().min(1, "Nome obrigatório"), ordem: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db.select().from(almoxarifadoCategorias)
        .where(and(eq(almoxarifadoCategorias.companyId, input.companyId), eq(almoxarifadoCategorias.nome, input.nome.trim())));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Categoria já existe" });
      const [cat] = await db.insert(almoxarifadoCategorias).values({
        companyId: input.companyId,
        nome: input.nome.trim(),
        ordem: input.ordem ?? 0,
      }).returning();
      return cat;
    }),

  atualizarCategoria: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), nome: z.string().min(1), ordem: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const dup = await db.select().from(almoxarifadoCategorias)
        .where(and(
          eq(almoxarifadoCategorias.companyId, input.companyId),
          eq(almoxarifadoCategorias.nome, input.nome.trim()),
        ));
      if (dup.length > 0 && dup[0].id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria com este nome" });
      await db.update(almoxarifadoCategorias).set({ nome: input.nome.trim(), ordem: input.ordem ?? 0 })
        .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
      return { success: true };
    }),

  excluirCategoria: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(almoxarifadoCategorias)
        .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
      return { success: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // UNIDADES DE MEDIDA DO ALMOXARIFADO (CRUD)
  // ══════════════════════════════════════════════════════════════
  listarUnidades: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoUnidades)
        .where(eq(almoxarifadoUnidades.companyId, input.companyId))
        .orderBy(asc(almoxarifadoUnidades.sigla));

      if (rows.length === 0) {
        const defaults = [
          { sigla: "un", descricao: "Unidade" },
          { sigla: "pç", descricao: "Peça" },
          { sigla: "cx", descricao: "Caixa" },
          { sigla: "sc", descricao: "Saco" },
          { sigla: "rolo", descricao: "Rolo" },
          { sigla: "barra", descricao: "Barra" },
          { sigla: "fardo", descricao: "Fardo" },
          { sigla: "pct", descricao: "Pacote" },
          { sigla: "m", descricao: "Metro" },
          { sigla: "m²", descricao: "Metro quadrado" },
          { sigla: "m³", descricao: "Metro cúbico" },
          { sigla: "kg", descricao: "Quilograma" },
          { sigla: "g", descricao: "Grama" },
          { sigla: "t", descricao: "Tonelada" },
          { sigla: "L", descricao: "Litro" },
          { sigla: "mL", descricao: "Mililitro" },
          { sigla: "galão", descricao: "Galão" },
          { sigla: "vb", descricao: "Verba" },
          { sigla: "gl", descricao: "Global" },
          { sigla: "kit", descricao: "Kit" },
          { sigla: "par", descricao: "Par" },
          { sigla: "dz", descricao: "Dúzia" },
        ];
        const inserted = await db.insert(almoxarifadoUnidades)
          .values(defaults.map(d => ({ companyId: input.companyId, sigla: d.sigla, descricao: d.descricao })))
          .returning();
        return inserted.sort((a, b) => a.sigla.localeCompare(b.sigla));
      }

      return rows;
    }),

  criarUnidade: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sigla:     z.string().min(1).max(20),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const sigla = input.sigla.trim();
      const existing = await db.select().from(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.companyId, input.companyId), eq(almoxarifadoUnidades.sigla, sigla)));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Unidade já cadastrada" });
      const [row] = await db.insert(almoxarifadoUnidades).values({
        companyId: input.companyId,
        sigla,
        descricao: input.descricao?.trim() || null,
      }).returning();
      return row;
    }),

  excluirUnidade: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const emUso = await db.select({ id: almoxarifadoItens.id })
        .from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          sql`${almoxarifadoItens.unidade} = (SELECT sigla FROM almoxarifado_unidades WHERE id = ${input.id})`,
        ))
        .limit(1);
      if (emUso.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Esta unidade está em uso por um ou mais itens e não pode ser excluída." });
      await db.delete(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.id, input.id), eq(almoxarifadoUnidades.companyId, input.companyId)));
      return { success: true };
    }),

  // Categorias distintas dos fornecedores
  listarCategoriasFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({ categorias: fornecedores.categorias })
        .from(fornecedores)
        .where(and(
          eq(fornecedores.companyId, input.companyId),
          eq(fornecedores.ativo, true),
        ));
      const set = new Set<string>();
      rows.forEach(r => {
        if (Array.isArray(r.categorias)) (r.categorias as string[]).forEach(c => set.add(c));
      });
      return Array.from(set).sort();
    }),

  // ══════════════════════════════════════════════════════════════
  // SOLICITAÇÕES DE COMPRA (SC)
  // ══════════════════════════════════════════════════════════════

  listarSolicitacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), aprovacaoStatus: z.string().optional(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(comprasSolicitacoes)
        .where(and(
          eq(comprasSolicitacoes.companyId, input.companyId),
          input.status ? eq(comprasSolicitacoes.status, input.status) : undefined,
          input.aprovacaoStatus ? eq(comprasSolicitacoes.aprovacaoStatus, input.aprovacaoStatus) : undefined,
        ))
        .orderBy(desc(comprasSolicitacoes.criadoEm));
      // attach item counts
      const ids = rows.map(r => r.id);
      let itensCounts: Record<number, { total: number; atendidos: number }> = {};
      if (ids.length > 0) {
        const allItens = await db.select().from(comprasSolicitacoesItens)
          .where(sql`${comprasSolicitacoesItens.solicitacaoId} = ANY(${sql.raw("ARRAY[" + ids.join(",") + "]::int[]")})`);
        allItens.forEach(it => {
          if (!itensCounts[it.solicitacaoId]) itensCounts[it.solicitacaoId] = { total: 0, atendidos: 0 };
          itensCounts[it.solicitacaoId].total++;
          if (n(it.quantidadeAtendida) >= n(it.quantidade)) itensCounts[it.solicitacaoId].atendidos++;
        });
      }
      let result = rows.map(r => ({ ...r, _itens: itensCounts[r.id] ?? { total: 0, atendidos: 0 } }));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(r =>
          r.numeroSc?.toLowerCase().includes(b) ||
          r.titulo?.toLowerCase().includes(b) ||
          r.departamento?.toLowerCase().includes(b) ||
          r.observacoes?.toLowerCase().includes(b)
        );
      }
      const prioridadeOrdem: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      result.sort((a, b) => {
        const pa = prioridadeOrdem[a.prioridade ?? "normal"] ?? 2;
        const pb = prioridadeOrdem[b.prioridade ?? "normal"] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime();
      });
      return result;
    }),

  getSolicitacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      console.log("[getSolicitacao] step1: fetching SC id=" + input.id);
      const scRows = await db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      const sc = scRows[0];
      if (!sc) throw new TRPCError({ code: "NOT_FOUND" });

      console.log("[getSolicitacao] step2: checking permissions for user=" + ctx.user.id + " role=" + ctx.user.role);
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      console.log("[getSolicitacao] step2b: allowedCompanies type=" + typeof allowedCompanies + " isArray=" + Array.isArray(allowedCompanies) + " length=" + (allowedCompanies?.length ?? "null"));
      const allowedIds = (allowedCompanies || []).map((c: any) => c.id);
      if (!allowedIds.includes(sc.companyId)) throw new TRPCError({ code: "FORBIDDEN" });

      console.log("[getSolicitacao] step3: fetching itens");
      const itens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

      console.log("[getSolicitacao] step4: fetching nomes");
      let solicitanteNome: string | null = null;
      let aprovadorNome: string | null = null;
      if (sc.solicitanteId) {
        const uRows = await db.select({ nome: users.name }).from(users).where(eq(users.id, sc.solicitanteId));
        solicitanteNome = uRows[0]?.nome || null;
      }
      if (sc.aprovadorId) {
        const uRows = await db.select({ nome: users.name }).from(users).where(eq(users.id, sc.aprovadorId));
        aprovadorNome = uRows[0]?.nome || null;
      }

      console.log("[getSolicitacao] step5: fetching cotacoes");
      let cotacoes: any[] = [];
      try {
        cotacoes = await db.select({
          id: comprasCotacoes.id,
          numeroCotacao: comprasCotacoes.numeroCotacao,
          status: comprasCotacoes.status,
          criadoEm: comprasCotacoes.criadoEm,
          total: comprasCotacoes.total,
        }).from(comprasCotacoes)
          .where(and(eq(comprasCotacoes.solicitacaoId, input.id), eq(comprasCotacoes.companyId, sc.companyId)))
          .orderBy(asc(comprasCotacoes.criadoEm));
      } catch (e: any) { console.warn("[getSolicitacao] cotacoes query failed:", e?.message); }

      console.log("[getSolicitacao] step6: fetching ordens");
      let ordens: any[] = [];
      try {
        ordens = await db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          status: comprasOrdens.status,
          fornecedorNome: comprasOrdens.fornecedorNome,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
          aprovacaoStatus: comprasOrdens.aprovacaoStatus,
          aprovadorId: comprasOrdens.aprovadorId,
        }).from(comprasOrdens)
          .where(and(eq(comprasOrdens.solicitacaoId, input.id), eq(comprasOrdens.companyId, sc.companyId)))
          .orderBy(asc(comprasOrdens.criadoEm));
      } catch (e: any) { console.warn("[getSolicitacao] ordens query failed:", e?.message); }

      console.log("[getSolicitacao] step7: fetching aprovadores + recebimentos");
      const ocAprovadorIds = [...new Set(ordens.filter(o => o.aprovadorId).map(o => o.aprovadorId!))];
      const ocAprovadores: Record<number, string> = {};
      if (ocAprovadorIds.length > 0) {
        try {
          const aprovUsers = await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, ocAprovadorIds));
          for (const u of aprovUsers) ocAprovadores[u.id] = u.nome || "";
        } catch (e: any) { console.warn("[getSolicitacao] aprovadores query failed:", e?.message); }
      }

      let recebimentos: any[] = [];
      const ocIds = ordens.map(o => o.id).filter(Boolean);
      if (ocIds.length > 0) {
        try {
          recebimentos = await db.select({
            id: almoxarifadoRecebimentos.id,
            ordemCompraId: almoxarifadoRecebimentos.ordemCompraId,
            criadoEm: almoxarifadoRecebimentos.criadoEm,
            usuarioNome: almoxarifadoRecebimentos.usuarioNome,
            status: almoxarifadoRecebimentos.status,
            numeroNf: almoxarifadoRecebimentos.numeroNf,
          }).from(almoxarifadoRecebimentos)
            .where(inArray(almoxarifadoRecebimentos.ordemCompraId, ocIds));
        } catch (e: any) { console.warn("[getSolicitacao] recebimentos query failed:", e?.message); }
      }

      console.log("[getSolicitacao] step8: building result, sc keys=" + Object.keys(sc).join(","));
      return {
        id: sc.id,
        companyId: sc.companyId,
        numeroSc: sc.numeroSc,
        obraId: sc.obraId,
        projetoId: sc.projetoId,
        solicitanteId: sc.solicitanteId,
        departamento: sc.departamento,
        titulo: sc.titulo,
        dataNecessidade: sc.dataNecessidade,
        prioridade: sc.prioridade,
        status: sc.status,
        aprovacaoStatus: sc.aprovacaoStatus,
        aprovadorId: sc.aprovadorId,
        aprovadoEm: sc.aprovadoEm,
        observacoes: sc.observacoes,
        imagemReferenciaUrl: sc.imagemReferenciaUrl,
        criadoEm: sc.criadoEm,
        atualizadoEm: sc.atualizadoEm,
        itens: itens || [],
        solicitanteNome,
        aprovadorNome,
        rastreio: {
          cotacoes: (cotacoes || []).map(c => ({ id: c.id, numeroCotacao: c.numeroCotacao, status: c.status, criadoEm: c.criadoEm, total: parseFloat(String(c.total || "0")) })),
          ordens: (ordens || []).map(o => ({
            id: o.id, numeroOc: o.numeroOc, status: o.status, fornecedorNome: o.fornecedorNome,
            total: parseFloat(String(o.total || "0")), criadoEm: o.criadoEm,
            aprovacaoStatus: o.aprovacaoStatus, aprovadorId: o.aprovadorId,
            aprovadorNome: o.aprovadorId ? (ocAprovadores[o.aprovadorId] || null) : null,
          })),
          recebimentos: recebimentos || [],
        },
      };
      } catch (err: any) {
        console.error("[getSolicitacao] CRASH for SC id=" + input.id + ":", err?.message);
        console.error("[getSolicitacao] STACK:", err?.stack);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err?.message || "Erro interno" });
      }
    }),

  criarSolicitacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      projetoId: z.number().nullable().optional(),
      solicitanteId: z.number().nullable().optional(),
      departamento: z.string().optional(),
      titulo: z.string().optional(),
      prioridade: z.string().optional(),
      dataNecessidade: z.string().optional(),
      observacoes: z.string().optional(),
      imagemReferenciaUrl: z.string().optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
        orcamentoItemId: z.number().optional(),
        eapCodigo: z.string().optional(),
        insumoCodigo: z.string().optional(),
        composicaoCodigo: z.string().optional(),
        precoMeta: z.number().optional(),
        quantidadeServico: z.number().optional(),
        coeficiente: z.number().optional(),
        origemEap: z.boolean().optional(),
        semVerba: z.boolean().optional(),
        motivoSemVerba: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroSc = `SC-${new Date().getFullYear()}-${seq}`;
      const [sc] = await db.insert(comprasSolicitacoes).values({
        companyId: input.companyId,
        numeroSc,
        obraId: input.obraId ?? null,
        projetoId: input.projetoId ?? null,
        solicitanteId: input.solicitanteId ?? null,
        departamento: input.departamento,
        titulo: normalizarTexto(input.titulo),
        prioridade: input.prioridade ?? "normal",
        dataNecessidade: input.dataNecessidade,
        observacoes: input.observacoes,
        imagemReferenciaUrl: input.imagemReferenciaUrl ?? null,
        status: "pendente",
        aprovacaoStatus: "aguardando",
      }).returning();
      if (input.itens.length > 0) {
        await db.insert(comprasSolicitacoesItens).values(
          input.itens.map(it => ({
            solicitacaoId: sc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            observacoes: it.observacoes,
            statusItem: "pendente",
            orcamentoItemId: it.orcamentoItemId ?? null,
            eapCodigo: it.eapCodigo ?? null,
            insumoCodigo: it.insumoCodigo ?? null,
            composicaoCodigo: it.composicaoCodigo ?? null,
            precoMeta: it.precoMeta ? String(it.precoMeta) : null,
            quantidadeServico: it.quantidadeServico ? String(it.quantidadeServico) : null,
            coeficiente: it.coeficiente ? String(it.coeficiente) : null,
            origemEap: it.origemEap ?? false,
            semVerba: it.semVerba ?? false,
            motivoSemVerba: it.motivoSemVerba ?? null,
          }))
        );
      }
      return sc;
    }),

  uploadImagemReferenciaSC: protectedProcedure
    .input(z.object({
      solicitacaoId: z.number().optional(),
      companyId: z.number(),
      fileBase64: z.string().max(14_000_000),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const allowedExts = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
      const ext = input.fileName.split(".").pop()?.toLowerCase() || "jpg";
      if (!allowedExts.has(ext)) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de imagem não suportado." });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem muito grande (máx. 10 MB)." });
      if (input.solicitacaoId) {
        const [sc] = await db.select({ id: comprasSolicitacoes.id }).from(comprasSolicitacoes)
          .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
        if (!sc) throw new TRPCError({ code: "FORBIDDEN", message: "SC não encontrada ou sem permissão." });
      }
      const ts = Date.now();
      const key = `compras/sc-imagens/${input.companyId}-${input.solicitacaoId || 'new'}-${ts}.${ext}`;
      const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
      const contentType = mimeMap[ext] || "image/jpeg";
      const { url } = await storagePut(key, buffer, contentType);
      if (input.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ imagemReferenciaUrl: url, atualizadoEm: new Date().toISOString() })
          .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
      }
      return { url };
    }),

  atualizarStatusSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasSolicitacoes).set({ status: input.status, atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  aprovarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), aprovacaoStatus: z.string(), aprovadorId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasSolicitacoes).set({
        aprovacaoStatus: input.aprovacaoStatus,
        aprovadorId: input.aprovadorId ?? null,
        aprovadoEm: input.aprovacaoStatus !== "aguardando" ? new Date().toISOString() : null,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasSolicitacoes.id, input.id));

      let cotacaoCriada: any = null;

      if (input.aprovacaoStatus === "aprovada") {
        const [sc] = await db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
        if (sc) {
          const existingCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status })
            .from(comprasCotacoes)
            .where(and(
              eq(comprasCotacoes.solicitacaoId, input.id),
              eq(comprasCotacoes.companyId, sc.companyId),
            ));
          const activeCots = existingCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));

          if (activeCots.length === 0) {
            const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

            const count = await db.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, sc.companyId));
            const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
            const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;

            const itensMapped = scItens.map(it => ({
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade ?? "un",
              quantidade: n(it.quantidade),
              precoUnitario: 0,
              solicitacaoItemId: it.id,
              semVerba: it.semVerba ?? false,
              motivoSemVerba: it.motivoSemVerba ?? null,
            }));
            const totalGeral = 0;

            const [cot] = await db.insert(comprasCotacoes).values({
              companyId: sc.companyId,
              numeroCotacao,
              descricao: sc.titulo || sc.departamento || "Cotação automática",
              prioridade: sc.prioridade ?? "normal",
              obraId: sc.obraId ?? null,
              solicitacaoId: sc.id,
              total: String(totalGeral.toFixed(2)),
              status: "pendente",
            }).returning();

            if (itensMapped.length > 0) {
              await db.insert(comprasCotacoesItens).values(
                itensMapped.map(it => ({
                  cotacaoId: cot.id,
                  solicitacaoItemId: it.solicitacaoItemId ?? null,
                  descricao: it.descricao,
                  unidade: it.unidade,
                  quantidade: String(it.quantidade),
                  precoUnitario: "0",
                  descontoPct: "0",
                  total: "0",
                  semVerba: it.semVerba ?? false,
                  motivoSemVerba: it.motivoSemVerba ?? null,
                }))
              );
            }

            await db.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.id));
            cotacaoCriada = { id: cot.id, numeroCotacao };
          }
        }
      }

      return { ok: true, cotacaoCriada };
    }),

  registrarRecebimentoItem: protectedProcedure
    .input(z.object({ itemId: z.number(), solicitacaoId: z.number(), quantidadeAtendida: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const qtdTotal = n(item.quantidade);
      const novaQtd = Math.min(input.quantidadeAtendida, qtdTotal);
      const novoStatus = novaQtd >= qtdTotal ? "recebido" : novaQtd > 0 ? "recebido_parcial" : "pendente";
      await db.update(comprasSolicitacoesItens).set({
        quantidadeAtendida: String(novaQtd),
        statusItem: novoStatus,
      }).where(eq(comprasSolicitacoesItens.id, input.itemId));
      // update SC status based on all items
      const allItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.solicitacaoId));
      const todoRecebido = allItens.every(it => n(it.quantidadeAtendida) >= n(it.quantidade));
      const algumRecebido = allItens.some(it => n(it.quantidadeAtendida) > 0);
      if (todoRecebido) {
        await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      } else if (algumRecebido) {
        await db.update(comprasSolicitacoes).set({ atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      }
      return { ok: true, statusItem: novoStatus };
    }),

  excluirSolicitacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const linkedCots = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao, status: comprasCotacoes.status })
        .from(comprasCotacoes)
        .where(eq(comprasCotacoes.solicitacaoId, input.id));
      const activeCots = linkedCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));

      if (activeCots.length > 0) {
        const linkedOCs = await db.select({ id: comprasOrdens.id, numeroOc: comprasOrdens.numeroOc, status: comprasOrdens.status })
          .from(comprasOrdens)
          .where(inArray(comprasOrdens.cotacaoId, activeCots.map(c => c.id)));
        const ocsAtivas = linkedOCs.filter(o => !["cancelada", "recebido"].includes(o.status ?? ""));
        if (ocsAtivas.length > 0) {
          throw new Error(`Não é possível excluir: esta SC possui Ordem de Compra em andamento (${ocsAtivas.map(o => o.numeroOc).join(", ")}).`);
        }
        for (const cot of activeCots) {
          await db.update(comprasCotacoes)
            .set({ status: "cancelada" })
            .where(eq(comprasCotacoes.id, cot.id));
        }
      }

      const allCotIds = linkedCots.map(c => c.id);
      if (allCotIds.length > 0) {
        await db.update(comprasCotacoesItens)
          .set({ solicitacaoItemId: null })
          .where(inArray(comprasCotacoesItens.cotacaoId, allCotIds));
      }

      const cotItemsRef = await db.select({ id: comprasCotacoesItens.id })
        .from(comprasCotacoesItens)
        .innerJoin(comprasSolicitacoesItens, eq(comprasCotacoesItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(eq(comprasSolicitacoesItens.solicitacaoId, input.id))
        .limit(1);
      if (cotItemsRef.length > 0) {
        await db.update(comprasCotacoesItens)
          .set({ solicitacaoItemId: null })
          .where(inArray(comprasCotacoesItens.solicitacaoItemId,
            db.select({ id: comprasSolicitacoesItens.id }).from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id))
          ));
      }

      if (linkedCots.length > 0) {
        await db.update(comprasCotacoes)
          .set({ solicitacaoId: null })
          .where(eq(comprasCotacoes.solicitacaoId, input.id));
      }

      const solItemIds = (await db.select({ id: comprasSolicitacoesItens.id }).from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id))).map(r => r.id);
      if (solItemIds.length > 0) {
        await db.update(comprasOrdensItens)
          .set({ solicitacaoItemId: null })
          .where(inArray(comprasOrdensItens.solicitacaoItemId, solItemIds));
      }

      await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
      await db.delete(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  excluirSolicitacoesEmLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      const owned = await db.select({ id: comprasSolicitacoes.id }).from(comprasSolicitacoes).where(and(inArray(comprasSolicitacoes.id, input.ids), eq(comprasSolicitacoes.companyId, input.companyId)));
      const ownedIds = owned.map(o => o.id);
      if (ownedIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma SC encontrada" });

      const errors: string[] = [];
      let deleted = 0;
      for (const scId of ownedIds) {
        try {
          const linkedCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status }).from(comprasCotacoes).where(eq(comprasCotacoes.solicitacaoId, scId));
          const activeCots = linkedCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));
          if (activeCots.length > 0) {
            const linkedOCs = await db.select({ id: comprasOrdens.id, status: comprasOrdens.status }).from(comprasOrdens).where(inArray(comprasOrdens.cotacaoId, activeCots.map(c => c.id)));
            const ocsAtivas = linkedOCs.filter(o => !["cancelada", "recebido"].includes(o.status ?? ""));
            if (ocsAtivas.length > 0) { errors.push(`SC #${scId}: possui OC em andamento`); continue; }
            for (const cot of activeCots) { await db.update(comprasCotacoes).set({ status: "cancelada" }).where(eq(comprasCotacoes.id, cot.id)); }
          }
          const allCotIds = linkedCots.map(c => c.id);
          if (allCotIds.length > 0) { await db.update(comprasCotacoesItens).set({ solicitacaoItemId: null }).where(inArray(comprasCotacoesItens.cotacaoId, allCotIds)); }
          if (linkedCots.length > 0) { await db.update(comprasCotacoes).set({ solicitacaoId: null }).where(eq(comprasCotacoes.solicitacaoId, scId)); }
          const solItemIds = (await db.select({ id: comprasSolicitacoesItens.id }).from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, scId))).map(r => r.id);
          if (solItemIds.length > 0) { await db.update(comprasOrdensItens).set({ solicitacaoItemId: null }).where(inArray(comprasOrdensItens.solicitacaoItemId, solItemIds)); }
          await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, scId));
          await db.delete(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, scId));
          deleted++;
        } catch (e: any) { errors.push(`SC #${scId}: ${e.message}`); }
      }
      return { ok: true, count: deleted, errors };
    }),

  // ══════════════════════════════════════════════════════════════
  // COTAÇÕES
  // ══════════════════════════════════════════════════════════════

  listarCotacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), solicitacaoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(comprasCotacoes)
        .where(and(
          eq(comprasCotacoes.companyId, input.companyId),
          input.status ? eq(comprasCotacoes.status, input.status) : undefined,
          input.solicitacaoId ? eq(comprasCotacoes.solicitacaoId, input.solicitacaoId) : undefined,
        ))
        .orderBy(desc(comprasCotacoes.criadoEm));
    }),

  getCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.id));

      let fornecedorContato: { contatoNome: string | null; telefone: string | null; contatoCelular: string | null; contatoEmail: string | null; email: string | null; nomeFantasia: string | null; razaoSocial: string | null } | null = null;
      if (cot.fornecedorId) {
        const [f] = await db.select({
          contatoNome: fornecedores.contatoNome,
          telefone: fornecedores.telefone,
          contatoCelular: fornecedores.contatoCelular,
          contatoEmail: fornecedores.contatoEmail,
          email: fornecedores.email,
          nomeFantasia: fornecedores.nomeFantasia,
          razaoSocial: fornecedores.razaoSocial,
        }).from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId));
        fornecedorContato = f ?? null;
      }

      // Se há um fornecedor vencedor selecionado, enriquecer os itens com preços reais do Mapa
      if (cot.fornecedorId) {
        const respostas = await db.select().from(comprasCotacaoRespostas).where(
          and(
            eq(comprasCotacaoRespostas.cotacaoId, input.id),
            eq(comprasCotacaoRespostas.fornecedorId, cot.fornecedorId),
          )
        );
        if (respostas.length > 0) {
          const respostaByItemId = new Map(respostas.map(r => [r.itemId, r]));
          const itensEnriquecidos = itens.map(it => {
            const r = respostaByItemId.get(it.id);
            if (!r) return it;
            return {
              ...it,
              precoUnitario: r.precoUnitario ?? it.precoUnitario,
              descontoPct:   r.descontoPct   ?? it.descontoPct,
              quantidade:    r.quantidade    ?? it.quantidade,
              total:         r.total         ?? it.total,
            };
          });
          return { ...cot, itens: itensEnriquecidos, fornecedorContato };
        }
      }

      return { ...cot, itens, fornecedorContato };
    }),

  criarCotacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricao: z.string().optional(),
      prioridade: z.string().optional(),
      tipo: z.enum(["material", "servico"]).optional().default("material"),
      obraId: z.number().nullable().optional(),
      solicitacaoId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      dataValidade: z.string().optional(),
      condicaoPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      prazoEntregaDias: z.number().nullable().optional(),
      observacoes: z.string().optional(),
      itens: z.array(z.object({
        solicitacaoItemId: z.number().nullable().optional(),
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
        descontoPct: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      if (input.solicitacaoId) {
        const [sc] = await db.select({ id: comprasSolicitacoes.id, aprovacaoStatus: comprasSolicitacoes.aprovacaoStatus, status: comprasSolicitacoes.status })
          .from(comprasSolicitacoes)
          .where(eq(comprasSolicitacoes.id, input.solicitacaoId));
        if (sc && sc.aprovacaoStatus !== "aprovada") {
          throw new Error("Esta solicitação ainda não foi aprovada. Só é possível criar cotação após a aprovação da SC.");
        }

        const existingCots = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao, status: comprasCotacoes.status })
          .from(comprasCotacoes)
          .where(and(
            eq(comprasCotacoes.solicitacaoId, input.solicitacaoId),
            eq(comprasCotacoes.companyId, input.companyId),
          ));
        const activeCots = existingCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));
        if (activeCots.length > 0) {
          const existingOCs = await db.select({ id: comprasOrdens.id, numeroOc: comprasOrdens.numeroOc })
            .from(comprasOrdens)
            .where(and(
              inArray(comprasOrdens.cotacaoId, activeCots.map(c => c.id)),
              eq(comprasOrdens.companyId, input.companyId),
            ));
          if (existingOCs.length > 0) {
            throw new Error(`Esta solicitação já possui Ordem de Compra em andamento (${existingOCs.map(o => o.numeroOc).join(", ")}). Não é possível criar nova cotação.`);
          }
          throw new Error(`Esta solicitação já possui cotação ativa (${activeCots.map(c => c.numeroCotacao).join(", ")}). Cancele a cotação existente antes de criar uma nova.`);
        }
      }

      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;
      const itensMapped = input.itens.map(it => {
        const desc = it.descontoPct ?? 0;
        const total = n(it.quantidade) * n(it.precoUnitario) * (1 - desc / 100);
        return { ...it, total: total.toFixed(2) };
      });
      const totalGeral = itensMapped.reduce((s, it) => s + n(it.total), 0);
      const [cot] = await db.insert(comprasCotacoes).values({
        companyId: input.companyId,
        numeroCotacao,
        descricao: normalizarTexto(input.descricao),
        prioridade: input.prioridade ?? "normal",
        tipo: input.tipo ?? "material",
        obraId: input.obraId ?? null,
        solicitacaoId: input.solicitacaoId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        dataValidade: input.dataValidade,
        condicaoPagamento: input.condicaoPagamento,
        tipoPagamento: input.tipoPagamento ?? null,
        numeroParcelas: input.numeroParcelas ?? 1,
        prazoEntregaDias: input.prazoEntregaDias ?? null,
        observacoes: input.observacoes,
        total: String(totalGeral.toFixed(2)),
        status: "pendente",
      }).returning();
      if (itensMapped.length > 0) {
        await db.insert(comprasCotacoesItens).values(
          itensMapped.map(it => ({
            cotacaoId: cot.id,
            solicitacaoItemId: it.solicitacaoItemId ?? null,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            descontoPct: String(it.descontoPct ?? 0),
            total: it.total,
          }))
        );
      }
      if (input.solicitacaoId) {
        await db.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      }
      return cot;
    }),

  aprovarCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasCotacoes).set({ status: "aprovada" }).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  atualizarStatusCotacao: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasCotacoes).set({ status: input.status }).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  excluirCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 0. Buscar a cotação para pegar solicitacaoId (revertida ao final)
      const [cot] = await db.select({ solicitacaoId: comprasCotacoes.solicitacaoId })
        .from(comprasCotacoes)
        .where(eq(comprasCotacoes.id, input.id));

      // 1. Encontrar OCs vinculadas a esta cotação
      const ocs = await db.select({ id: comprasOrdens.id })
        .from(comprasOrdens)
        .where(eq(comprasOrdens.cotacaoId, input.id));

      if (ocs.length > 0) {
        const ocIds = ocs.map(o => o.id);

        // 2. Deletar itens das OCs
        await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocIds));

        // 3. Deletar as OCs
        await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
      }

      // 4. Reverter SC para "pendente" (usando solicitacaoId da cotação)
      if (cot?.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "pendente" })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      // 5. Deletar respostas e participantes da cotação
      await db.delete(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, input.id));
      await db.delete(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, input.id));

      // 6. Deletar itens da cotação
      await db.delete(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.id));

      // 7. Deletar a cotação
      await db.delete(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));

      return { ok: true };
    }),

  excluirCotacoesEmLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      const owned = await db.select({ id: comprasCotacoes.id, solicitacaoId: comprasCotacoes.solicitacaoId }).from(comprasCotacoes).where(and(inArray(comprasCotacoes.id, input.ids), eq(comprasCotacoes.companyId, input.companyId)));
      const ownedIds = owned.map(o => o.id);
      if (ownedIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma cotação encontrada" });

      const ocs = await db.select({ id: comprasOrdens.id }).from(comprasOrdens).where(inArray(comprasOrdens.cotacaoId, ownedIds));
      if (ocs.length > 0) {
        const ocIds = ocs.map(o => o.id);
        await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocIds));
        await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
      }

      const scIds = [...new Set(owned.filter(o => o.solicitacaoId).map(o => o.solicitacaoId!))];
      if (scIds.length > 0) {
        await db.update(comprasSolicitacoes).set({ status: "pendente" }).where(inArray(comprasSolicitacoes.id, scIds));
      }

      await db.delete(comprasCotacaoRespostas).where(inArray(comprasCotacaoRespostas.cotacaoId, ownedIds));
      await db.delete(comprasCotacaoFornecedores).where(inArray(comprasCotacaoFornecedores.cotacaoId, ownedIds));
      await db.delete(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, ownedIds));
      await db.delete(comprasCotacoes).where(inArray(comprasCotacoes.id, ownedIds));
      return { ok: true, count: ownedIds.length };
    }),

  // ══════════════════════════════════════════════════════════════
  // MAPA DE COTAÇÃO (comparativo multi-fornecedor)
  // ══════════════════════════════════════════════════════════════

  getMapaCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
      const participantes = await db.select().from(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      const respostas = await db.select().from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId));
      const fornIds = participantes.map(p => p.fornecedorId);
      const forns = fornIds.length > 0 ? await db.select().from(fornecedores).where(inArray(fornecedores.id, fornIds)) : [];

      // Buscar metaUnitario via SC item → orcamento item → orcamento.metaPercentual
      // Calcula ao vivo: custoUnitTotal × (1 − metaPercentual), igual ao EAP faz
      const scItemIds = itens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
      let scItens: any[] = [];
      if (scItemIds.length > 0) {
        scItens = await db.select({
          id: comprasSolicitacoesItens.id,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          eapCodigo: comprasSolicitacoesItens.eapCodigo,
          insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
          composicaoCodigo: comprasSolicitacoesItens.composicaoCodigo,
          origemEap: comprasSolicitacoesItens.origemEap,
          solicitacaoId: comprasSolicitacoesItens.solicitacaoId,
          precoMeta: comprasSolicitacoesItens.precoMeta,
        }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      }
      const orcItemIds = scItens.map(s => s.orcamentoItemId).filter(Boolean) as number[];
      let orcItensData: any[] = [];
      if (orcItemIds.length > 0) {
        orcItensData = await db.select({
          id: orcamentoItens.id,
          orcamentoId: orcamentoItens.orcamentoId,
          custoUnitMat: orcamentoItens.custoUnitMat,
          custoUnitTotal: orcamentoItens.custoUnitTotal,
          metaUnitTotal: orcamentoItens.metaUnitTotal,
          quantidade: orcamentoItens.quantidade,
          eapCodigo: orcamentoItens.eapCodigo,
        }).from(orcamentoItens).where(inArray(orcamentoItens.id, orcItemIds));
      }
      // Buscar metaPercentual de cada orçamento vinculado
      const orcIds = [...new Set(orcItensData.map((o: any) => o.orcamentoId).filter(Boolean))] as number[];
      let orcData: any[] = [];
      if (orcIds.length > 0) {
        orcData = await db.select({ id: orcamentos.id, metaPercentual: orcamentos.metaPercentual })
          .from(orcamentos).where(inArray(orcamentos.id, orcIds));
      }
      const orcToMetaPerc: Record<number, number> = {};
      for (const o of orcData) orcToMetaPerc[o.id] = n(o.metaPercentual);

      // Buscar descrições dos ancestrais para montar breadcrumb (EAP path)
      // Ex: "02.02.01.92.93" → ancestrais: ["02", "02.02", "02.02.01", "02.02.01.92"]
      const ancestorCodeSet = new Set<string>();
      for (const o of orcItensData) {
        if (!o.eapCodigo) continue;
        const parts = String(o.eapCodigo).split(".");
        for (let k = 1; k < parts.length; k++) {
          ancestorCodeSet.add(parts.slice(0, k).join("."));
        }
      }
      const ancestorCodes = [...ancestorCodeSet];
      let ancestorItens: any[] = [];
      if (ancestorCodes.length > 0 && orcIds.length > 0) {
        ancestorItens = await db.select({
          orcamentoId: orcamentoItens.orcamentoId,
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          nivel: orcamentoItens.nivel,
        }).from(orcamentoItens)
          .where(and(inArray(orcamentoItens.orcamentoId, orcIds), inArray(orcamentoItens.eapCodigo, ancestorCodes)));
      }
      // Mapa: `${orcamentoId}:${eapCodigo}` → descricao
      const ancestorMap: Record<string, string> = {};
      for (const a of ancestorItens) ancestorMap[`${a.orcamentoId}:${a.eapCodigo}`] = a.descricao;

      const scItemToOrcItem: Record<number, number> = {};
      const scItemToPrecoMeta: Record<number, number> = {};
      const scItemToTraceability: Record<number, { eapCodigo?: string; insumoCodigo?: string; composicaoCodigo?: string; origemEap?: boolean; solicitacaoId?: number }> = {};
      for (const s of scItens) {
        if (s.orcamentoItemId) scItemToOrcItem[s.id] = s.orcamentoItemId;
        const pm = n(s.precoMeta);
        if (pm > 0) scItemToPrecoMeta[s.id] = pm;
        scItemToTraceability[s.id] = { eapCodigo: s.eapCodigo, insumoCodigo: s.insumoCodigo, composicaoCodigo: s.composicaoCodigo, origemEap: s.origemEap, solicitacaoId: s.solicitacaoId };
      }

      const scIds = [...new Set(scItens.map(s => s.solicitacaoId).filter(Boolean))] as number[];
      let scMap: Record<number, string> = {};
      if (scIds.length > 0) {
        const scs = await db.select({ id: comprasSolicitacoes.id, numeroSc: comprasSolicitacoes.numeroSc }).from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.id, scIds));
        for (const sc of scs) scMap[sc.id] = sc.numeroSc;
      }

      // Mapa: orcamentoItemId → { metaUnitario, eapPath }
      const orcItemToMeta: Record<number, number> = {};
      const orcItemToPath: Record<number, string> = {};
      for (const o of orcItensData) {
        const metaPerc = orcToMetaPerc[o.orcamentoId] ?? 0;
        // Prioridade: usar metaUnitTotal pré-calculado do orçamento.
        // Fallback: custo de MATERIAL × (1 − metaPercentual)
        const metaDireta = n(o.metaUnitTotal);
        orcItemToMeta[o.id] = metaDireta > 0
          ? metaDireta
          : n(o.custoUnitMat) * (1 - metaPerc);
        // Montar breadcrumb com até 3 níveis intermediários
        if (o.eapCodigo) {
          const parts = String(o.eapCodigo).split(".");
          const labels: string[] = [];
          for (let k = 1; k < parts.length; k++) {
            const code = parts.slice(0, k).join(".");
            const desc = ancestorMap[`${o.orcamentoId}:${code}`];
            if (desc) labels.push(desc);
          }
          orcItemToPath[o.id] = labels.slice(0, 3).join(" › ");
        }
      }

      // Buscar qtd total já solicitada por orcamentoItemId (todas as SCs da mesma obra)
      const orcItemToQtdOrcada: Record<number, number> = {};
      for (const o of orcItensData) orcItemToQtdOrcada[o.id] = n(o.quantidade);

      const orcItemToQtdSolicitada: Record<number, number> = {};
      if (orcItemIds.length > 0) {
        const solicitadoRows = await db.execute(sql`
          SELECT si.orcamento_item_id, COALESCE(SUM(si.quantidade::numeric), 0) as total_solicitado
          FROM compras_solicitacoes_itens si
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
          WHERE si.orcamento_item_id IN (${sql.join(orcItemIds.map(id => sql`${id}`), sql`, `)})
            AND s.company_id = ${cot.companyId}
          GROUP BY si.orcamento_item_id
        `);
        for (const r of (solicitadoRows as any).rows ?? []) {
          orcItemToQtdSolicitada[r.orcamento_item_id] = n(r.total_solicitado);
        }
      }

      const itensComMeta = itens.map(it => {
        const orcId = it.solicitacaoItemId ? scItemToOrcItem[it.solicitacaoItemId] : undefined;
        const metaFromOrc = orcId ? (orcItemToMeta[orcId] ?? 0) : 0;
        const metaFromSC = it.solicitacaoItemId ? (scItemToPrecoMeta[it.solicitacaoItemId] ?? 0) : 0;
        const metaUnitario = metaFromOrc > 0 ? metaFromOrc : metaFromSC;
        const eapPath = orcId ? (orcItemToPath[orcId] ?? "") : "";
        const trace = it.solicitacaoItemId ? scItemToTraceability[it.solicitacaoItemId] : undefined;
        const scNumero = trace?.solicitacaoId ? (scMap[trace.solicitacaoId] ?? "") : "";
        const qtdOrcada = orcId ? (orcItemToQtdOrcada[orcId] ?? 0) : 0;
        const qtdTotalSolicitada = orcId ? (orcItemToQtdSolicitada[orcId] ?? 0) : 0;
        const qtdEstaSC = n(it.quantidade);
        return { ...it, metaUnitario, eapPath, scNumero, eapCodigo: trace?.eapCodigo ?? "", origemEap: trace?.origemEap ?? false, insumoCodigo: trace?.insumoCodigo ?? "", qtdOrcada, qtdTotalSolicitada, qtdEstaSC };
      });

      const respostaMap: Record<string, { precoUnitario: string; descontoPct: string; total: string; quantidade: string }> = {};
      for (const r of respostas) respostaMap[`${r.itemId}_${r.fornecedorId}`] = {
        precoUnitario: r.precoUnitario ?? "0", descontoPct: r.descontoPct ?? "0", total: r.total ?? "0",
        quantidade: r.quantidade ?? "0",
      };
      const totaisPorFornecedor: Record<number, number> = {};
      for (const p of participantes) {
        const totalItens = itensComMeta.reduce((acc, it) => {
          const r = respostaMap[`${it.id}_${p.fornecedorId}`];
          return acc + n(r?.total ?? 0);
        }, 0);
        const pFreteTipo = (p as any).freteTipo ?? "cif";
        const pValorFrete = pFreteTipo === "fob" ? n((p as any).valorFrete) : 0;
        totaisPorFornecedor[p.fornecedorId] = totalItens + pValorFrete;
      }
      return { cotacao: cot, itens: itensComMeta, participantes: participantes.map(p => ({ ...p, fornecedor: forns.find(f => f.id === p.fornecedorId) })), respostaMap, totaisPorFornecedor };
    }),

  adicionarFornecedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.insert(comprasCotacaoFornecedores).values({ cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId }).onConflictDoNothing();
      return { ok: true };
    }),

  removerFornecedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(comprasCotacaoRespostas).where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId)));
      await db.delete(comprasCotacaoFornecedores).where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true };
    }),

  salvarRespostasLote: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      propostaId: z.number().optional(),
      prazoEntregaDias: z.number().nullable().optional(),
      condicaoPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      formaPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      freteTipo: z.string().optional(),
      valorFrete: z.number().optional(),
      transportadora: z.string().optional(),
      respostas: z.array(z.object({
        itemId: z.number(),
        precoUnitario: z.number(),
        descontoPct: z.number().optional(),
        quantidade: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const validItemIds = new Set(
        (await db.select({ id: comprasCotacoesItens.id }).from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId)))
          .map(r => r.id)
      );
      let totalForn = 0;
      for (const r of input.respostas) {
        if (!validItemIds.has(r.itemId)) continue;
        const desc = r.descontoPct ?? 0;
        let qty = r.quantidade ?? 0;
        if (qty <= 0) {
          const itRow = await db.select({ quantidade: comprasCotacoesItens.quantidade }).from(comprasCotacoesItens).where(eq(comprasCotacoesItens.id, r.itemId));
          qty = n(itRow[0]?.quantidade ?? 1);
        }
        const total = qty * r.precoUnitario * (1 - desc / 100);
        totalForn += total;
        await db.insert(comprasCotacaoRespostas).values({
          cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId, itemId: r.itemId,
          propostaId: input.propostaId ?? null,
          quantidade: String(qty), precoUnitario: String(r.precoUnitario), descontoPct: String(desc), total: String(total.toFixed(2)),
        }).onConflictDoUpdate({ target: [comprasCotacaoRespostas.cotacaoId, comprasCotacaoRespostas.fornecedorId, comprasCotacaoRespostas.itemId], set: {
          quantidade: String(qty), precoUnitario: String(r.precoUnitario), descontoPct: String(desc), total: String(total.toFixed(2)),
          propostaId: input.propostaId ?? null,
        }});
      }
      const valorFrete = n(input.valorFrete);
      const isFob = (input.freteTipo ?? "cif") === "fob";
      const totalComFrete = totalForn + (isFob ? valorFrete : 0);

      await db.update(comprasCotacaoFornecedores).set({
        totalOrcado: String(totalComFrete.toFixed(2)),
        prazoEntregaDias: input.prazoEntregaDias ?? null,
        condicaoPagamento: input.condicaoPagamento ?? null,
        tipoPagamento: input.tipoPagamento ?? null,
        formaPagamento: input.formaPagamento ?? null,
        numeroParcelas: input.numeroParcelas ?? null,
        freteTipo: input.freteTipo ?? "cif",
        valorFrete: String(valorFrete.toFixed(2)),
        transportadora: input.transportadora ?? null,
      } as any)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true, total: totalComFrete };
    }),

  listarPropostasFornecedor: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const propostas = await db.select().from(comprasCotacaoPropostas)
        .where(and(
          eq(comprasCotacaoPropostas.cotacaoId, input.cotacaoId),
          eq(comprasCotacaoPropostas.fornecedorId, input.fornecedorId),
          eq(comprasCotacaoPropostas.companyId, input.companyId),
        ))
        .orderBy(desc(comprasCotacaoPropostas.criadoEm));
      return propostas;
    }),

  excluirProposta: protectedProcedure
    .input(z.object({ propostaId: z.number(), cotacaoId: z.number(), fornecedorId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [proposta] = await db.select().from(comprasCotacaoPropostas)
        .where(and(
          eq(comprasCotacaoPropostas.id, input.propostaId),
          eq(comprasCotacaoPropostas.cotacaoId, input.cotacaoId),
          eq(comprasCotacaoPropostas.fornecedorId, input.fornecedorId),
          eq(comprasCotacaoPropostas.companyId, input.companyId),
        ));
      if (!proposta) throw new Error("Proposta não encontrada ou acesso negado");
      await db.delete(comprasCotacaoRespostas)
        .where(and(
          eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId),
          eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId),
          eq(comprasCotacaoRespostas.propostaId, input.propostaId),
        ));
      await db.update(comprasCotacaoPropostas)
        .set({ status: "excluida" } as any)
        .where(eq(comprasCotacaoPropostas.id, input.propostaId));
      const remaining = await db.select({ total: comprasCotacaoRespostas.total }).from(comprasCotacaoRespostas)
        .where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId)));
      const newTotal = remaining.reduce((acc, r) => acc + n(r.total), 0);
      await db.update(comprasCotacaoFornecedores)
        .set({ totalOrcado: String(newTotal.toFixed(2)) } as any)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true };
    }),

  salvarCondicoesComerciais: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      companyId: z.number(),
      formaPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      condicaoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      prazoEntregaDias: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot || cot.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Cotação não pertence à empresa" });
      const updateData: any = {};
      if (input.formaPagamento !== undefined) updateData.formaPagamento = input.formaPagamento || null;
      if (input.tipoPagamento !== undefined) updateData.tipoPagamento = input.tipoPagamento || null;
      if (input.condicaoPagamento !== undefined) updateData.condicaoPagamento = input.condicaoPagamento || null;
      if (input.numeroParcelas !== undefined) updateData.numeroParcelas = input.numeroParcelas;
      if (input.prazoEntregaDias !== undefined) updateData.prazoEntregaDias = input.prazoEntregaDias;
      if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
      if (Object.keys(updateData).length > 0) {
        if (input.fornecedorId === 0) {
          await db.update(comprasCotacoes)
            .set(updateData)
            .where(eq(comprasCotacoes.id, input.cotacaoId));
        } else {
          await db.update(comprasCotacaoFornecedores)
            .set(updateData)
            .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
        }
      }
      return { ok: true };
    }),

  salvarAnexoFornecedor: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number(), arquivoUrl: z.string(), arquivoNome: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasCotacaoFornecedores)
        .set({ arquivoUrl: input.arquivoUrl, arquivoNome: input.arquivoNome })
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true };
    }),

  uploadAnexoFornecedor: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      companyId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const ext = input.fileName.split('.').pop() || 'pdf';
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `cotacoes/${input.companyId}/${input.cotacaoId}/forn-${input.fornecedorId}-${randomSuffix}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.update(comprasCotacaoFornecedores)
        .set({ arquivoUrl: url, arquivoNome: input.fileName })
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true, url };
    }),

  extrairCotacaoIA: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      companyId: z.number(),
      fileBase64: z.string().max(15_000_000),
      fileName: z.string(),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg"]),
      tipoProposta: z.enum(["complemento", "revisao"]).default("complemento"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes)
        .where(and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId)));
      if (!cot) throw new TRPCError({ code: "FORBIDDEN", message: "Cotação não encontrada ou sem permissão" });

      const [forn] = await db.select({ id: comprasCotacaoFornecedores.id }).from(comprasCotacaoFornecedores)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      if (!forn) throw new TRPCError({ code: "BAD_REQUEST", message: "Fornecedor não é participante desta cotação" });

      const itens = await db.select().from(comprasCotacoesItens)
        .where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      if (itens.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum item na cotação" });

      const existingRespostas = await db.select().from(comprasCotacaoRespostas)
        .where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId)));

      const jobId = `ia-${input.cotacaoId}-${input.fornecedorId}-${Date.now()}`;
      const itensRef = itens.map(it => {
        const existing = existingRespostas.find(r => r.itemId === it.id);
        return {
          id: it.id,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: it.quantidade,
          jaPreenchido: existing ? { precoUnitario: n(existing.precoUnitario), quantidade: n(existing.quantidade) } : null,
        };
      });

      iaExtractionJobs.set(jobId, { status: "processing", startedAt: Date.now() });

      (async () => {
        try {
          const systemPrompt = `Você é um assistente especializado em compras de construção civil. Sua tarefa é extrair itens, quantidades e preços unitários de documentos de cotação/orçamento de fornecedores.

REGRAS CRÍTICAS:
- Extraia TODOS os itens do documento com: descrição, quantidade, unidade, preço unitário e preço total
- Valores devem ser numéricos (sem R$, sem pontos de milhar - use ponto como separador decimal)
- Se não conseguir identificar um campo, use null
- Retorne JSON válido, sem texto adicional

INTELIGÊNCIA DE MATCHING:
- Vários itens da SC podem ser o MESMO produto, divididos por atividade/EAP (ex: mesmo material aparece 3x com quantidades diferentes)
- Um item do fornecedor pode corresponder a MÚLTIPLOS itens da SC se forem o mesmo produto
- Se o fornecedor cota "Bacia acoplada" e a SC tem 3 linhas de "Bacia acoplada" com quantidades diferentes, faça match com TODOS eles
- Use matchItemIds (array) quando um item do fornecedor cobre múltiplos itens da SC`;

          const jaPreenchidosInfo = itensRef.filter(it => it.jaPreenchido).length > 0
            ? `\n\nITENS JÁ PREENCHIDOS POR PROPOSTAS ANTERIORES (para contexto):\n${itensRef.filter(it => it.jaPreenchido).map(it => `- [ID:${it.id}] ${it.descricao}: R$ ${it.jaPreenchido!.precoUnitario.toFixed(2)} x ${it.jaPreenchido!.quantidade}`).join("\n")}`
            : "";

          const prompt = `Analise este documento de cotação/orçamento de fornecedor e extraia todos os itens.

ITENS DA SOLICITAÇÃO DE COMPRA (para referência de matching):
${itensRef.map((it, i) => `${i + 1}. [ID:${it.id}] ${it.descricao} | Qtd solicitada: ${it.quantidade} ${it.unidade || "un"}${it.jaPreenchido ? " (JÁ PREENCHIDO)" : ""}`).join("\n")}
${jaPreenchidosInfo}

INSTRUÇÕES:
1. Extraia TODOS os itens do documento do fornecedor
2. Para cada item extraído, faça matching com os itens da SC por semelhança de descrição
3. IMPORTANTE: Se um item do fornecedor corresponde a vários itens da SC (mesmo produto em linhas diferentes), use matchItemIds (array com todos os IDs)
4. Se o item do fornecedor corresponde a apenas um item da SC, use matchItemId (singular)
5. Compare a quantidade cotada pelo fornecedor com a quantidade total solicitada na SC
6. Extraia condição de pagamento, prazo de entrega e forma de pagamento se mencionados
7. FORMA DE PAGAMENTO: identifique como o pagamento será feito (boleto, pix, transferencia, cheque, cartao, deposito). Procure menções a "boleto", "PIX", "transferência bancária", "depósito", etc.
8. PARCELAMENTO: identifique o tipo de parcelamento. Classifique como um destes valores: a_vista, 7ddl, 14ddl, 21ddl, 28ddl, 30ddl, 30_60, 30_60_90, entrada_30, entrada_30_60, medicao. Se não corresponder a nenhum, use "personalizado".

Retorne APENAS um JSON válido neste formato:
{
  "itensExtraidos": [
    {
      "descricaoFornecedor": "descrição como aparece no documento",
      "quantidade": 10,
      "unidade": "un",
      "precoUnitario": 25.50,
      "precoTotal": 255.00,
      "matchItemId": 123,
      "matchItemIds": [123, 456, 789],
      "matchConfianca": "alta",
      "matchDescricaoSC": "descrição do item da SC que deu match"
    }
  ],
  "condicaoPagamento": "30 DDL" ou null,
  "formaPagamento": "boleto" ou "pix" ou "transferencia" ou "cheque" ou "cartao" ou "deposito" ou null,
  "tipoPagamento": "30ddl" ou "30_60" ou "a_vista" etc. ou null,
  "prazoEntrega": "15 dias" ou null,
  "observacoes": "informações relevantes extraídas" ou null
}`;

          const isPdf = input.mimeType === "application/pdf";
          const resultText = await invokeAnthropicVision({
            prompt,
            base64: input.fileBase64,
            mimeType: isPdf ? "application/pdf" : input.mimeType,
            systemPrompt,
            maxTokens: 4096,
          });

          console.log("[extrairCotacaoIA] Resultado bruto (500 chars):", resultText.substring(0, 500));

          let jsonStr = resultText.trim();
          const jsonMatch2 = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch2) jsonStr = jsonMatch2[1].trim();
          const startIdx = jsonStr.indexOf("{");
          const endIdx = jsonStr.lastIndexOf("}");
          if (startIdx >= 0 && endIdx > startIdx) jsonStr = jsonStr.substring(startIdx, endIdx + 1);

          const parsed = JSON.parse(jsonStr);
          console.log("[extrairCotacaoIA] Parsed OK. itens:", (parsed.itensExtraidos ?? parsed.itens ?? []).length);

          const rawItens = (parsed.itensExtraidos ?? parsed.itens ?? []);
          const itensExtraidos: any[] = [];

          for (const item of rawItens) {
            const descForn = String(item.descricaoFornecedor ?? item.descricao ?? "");
            const qtdForn = parseFloat(item.quantidade) || null;
            const unidade = item.unidade || null;
            const precoUnit = parseFloat(item.precoUnitario ?? item.preco_unitario) || null;
            const precoTotal = parseFloat(item.precoTotal ?? item.preco_total) || null;
            const confianca = item.matchConfianca ?? item.match_confianca ?? null;
            const descSC = item.matchDescricaoSC ?? item.match_descricao_sc ?? null;

            const multiIds: number[] = item.matchItemIds ?? item.match_item_ids ?? [];
            const singleId = item.matchItemId ?? item.match_item_id ?? null;
            const allMatchIds = multiIds.length > 0 ? multiIds : (singleId ? [singleId] : []);

            if (allMatchIds.length > 1 && precoUnit != null) {
              const totalQtdSC = allMatchIds.reduce((acc: number, id: number) => {
                const ref = itensRef.find(r => r.id === id);
                return acc + n(ref?.quantidade);
              }, 0);

              for (const matchId of allMatchIds) {
                const ref = itensRef.find(r => r.id === matchId);
                const qtdItem = n(ref?.quantidade);
                const proporcao = totalQtdSC > 0 ? qtdItem / totalQtdSC : 1 / allMatchIds.length;
                const qtdDistribuida = qtdForn ? Math.round(qtdForn * proporcao * 100) / 100 : qtdItem;

                itensExtraidos.push({
                  descricaoFornecedor: descForn,
                  quantidade: qtdDistribuida,
                  quantidadeSC: qtdItem,
                  unidade,
                  precoUnitario: precoUnit,
                  precoTotal: precoUnit * qtdDistribuida,
                  matchItemId: matchId,
                  matchConfianca: confianca,
                  matchDescricaoSC: ref?.descricao ?? descSC,
                  distribuido: true,
                  grupoDistribuicao: allMatchIds,
                  quantidadeFornecedorOriginal: qtdForn,
                });
              }
            } else {
              const matchId = allMatchIds[0] ?? null;
              const ref = matchId ? itensRef.find(r => r.id === matchId) : null;
              const qtdSC = ref ? n(ref.quantidade) : null;

              itensExtraidos.push({
                descricaoFornecedor: descForn,
                quantidade: qtdForn,
                quantidadeSC: qtdSC,
                unidade,
                precoUnitario: precoUnit,
                precoTotal,
                matchItemId: matchId,
                matchConfianca: confianca,
                matchDescricaoSC: ref?.descricao ?? descSC,
                distribuido: false,
                grupoDistribuicao: null,
                quantidadeFornecedorOriginal: qtdForn,
              });
            }
          }

          const matchedIds = new Set(itensExtraidos.filter((i: any) => i.matchItemId).map((i: any) => i.matchItemId));
          const itensSemMatch = itensRef.filter(it => !matchedIds.has(it.id));
          const itensExtras = itensExtraidos.filter((i: any) => !i.matchItemId);

          const alertas: any[] = [];
          for (const item of itensExtraidos) {
            if (!item.matchItemId || item.quantidadeSC == null || item.quantidade == null) continue;
            const diff = item.quantidade - item.quantidadeSC;
            if (Math.abs(diff) > 0.01) {
              const pctCobertura = (item.quantidade / item.quantidadeSC) * 100;
              alertas.push({
                matchItemId: item.matchItemId,
                descricao: item.matchDescricaoSC || item.descricaoFornecedor,
                tipo: diff < 0 ? "parcial" : "excedente",
                qtdCotada: item.quantidade,
                qtdSolicitada: item.quantidadeSC,
                diferenca: Math.abs(diff),
                pctCobertura: Math.round(pctCobertura * 10) / 10,
              });
            }
          }

          if (itensSemMatch.length > 0) {
            for (const it of itensSemMatch) {
              alertas.push({
                matchItemId: it.id,
                descricao: it.descricao,
                tipo: "sem_cotacao",
                qtdCotada: 0,
                qtdSolicitada: n(it.quantidade),
                diferenca: n(it.quantidade),
                pctCobertura: 0,
              });
            }
          }

          const [proposta] = await db.insert(comprasCotacaoPropostas).values({
            cotacaoId: input.cotacaoId,
            fornecedorId: input.fornecedorId,
            companyId: input.companyId,
            fileName: input.fileName,
            tipo: input.tipoProposta,
            status: "ativa",
            itensExtraidos: itensExtraidos.length,
            itensComMatch: matchedIds.size,
            condicaoPagamento: parsed.condicaoPagamento ?? null,
            prazoEntrega: parsed.prazoEntrega ?? null,
            observacoesIa: parsed.observacoes ?? null,
          }).returning({ id: comprasCotacaoPropostas.id });

          if (input.tipoProposta === "revisao") {
            const antigas = await db.select().from(comprasCotacaoPropostas)
              .where(and(
                eq(comprasCotacaoPropostas.cotacaoId, input.cotacaoId),
                eq(comprasCotacaoPropostas.fornecedorId, input.fornecedorId),
                eq(comprasCotacaoPropostas.status, "ativa"),
              ));
            for (const ant of antigas) {
              if (ant.id === proposta.id) continue;
              await db.update(comprasCotacaoPropostas)
                .set({ status: "substituida", substituiPropostaId: proposta.id } as any)
                .where(eq(comprasCotacaoPropostas.id, ant.id));
              await db.delete(comprasCotacaoRespostas)
                .where(and(
                  eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId),
                  eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId),
                  eq(comprasCotacaoRespostas.propostaId, ant.id),
                ));
            }
          }

          const iaFormaPag = parsed.formaPagamento ?? null;
          const iaTipoPag = parsed.tipoPagamento ?? null;
          if (iaFormaPag || iaTipoPag || parsed.condicaoPagamento) {
            const updateCond: any = {};
            if (iaFormaPag) updateCond.formaPagamento = iaFormaPag;
            if (iaTipoPag) updateCond.tipoPagamento = iaTipoPag;
            if (parsed.condicaoPagamento) updateCond.condicaoPagamento = parsed.condicaoPagamento;
            if (iaTipoPag) {
              const tipoInfo = getTipoPagamentoInfo(iaTipoPag);
              if (tipoInfo) updateCond.numeroParcelas = tipoInfo.parcelas;
            }
            await db.update(comprasCotacaoFornecedores)
              .set(updateCond)
              .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
          }

          iaExtractionJobs.set(jobId, {
            status: "done",
            startedAt: Date.now(),
            result: {
              propostaId: proposta.id,
              itensExtraidos,
              itensSemMatch,
              itensExtras,
              alertas,
              condicaoPagamento: parsed.condicaoPagamento ?? null,
              formaPagamento: iaFormaPag,
              tipoPagamento: iaTipoPag,
              prazoEntrega: parsed.prazoEntrega ?? null,
              observacoes: parsed.observacoes ?? null,
              totalItensExtraidos: itensExtraidos.length,
              totalMatches: matchedIds.size,
              totalSemMatch: itensSemMatch.length,
              totalExtras: itensExtras.length,
              totalAlertas: alertas.length,
              tipoProposta: input.tipoProposta,
              fileName: input.fileName,
            },
          });
          console.log("[extrairCotacaoIA] Job", jobId, "concluído. Proposta", proposta.id, "tipo:", input.tipoProposta, "matches:", matchedIds.size, "alertas:", alertas.length);
        } catch (err: any) {
          console.error("[extrairCotacaoIA] Erro no job:", err.message);
          iaExtractionJobs.set(jobId, { status: "error", startedAt: Date.now(), error: err.message || "Erro desconhecido" });
        }
      })();

      return { jobId };
    }),

  getIaExtractionResult: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = iaExtractionJobs.get(input.jobId);
      if (!job) return { status: "not_found" as const };
      if (job.status === "processing") return { status: "processing" as const };
      if (job.status === "error") {
        iaExtractionJobs.delete(input.jobId);
        return { status: "error" as const, error: job.error };
      }
      const result = job.result;
      iaExtractionJobs.delete(input.jobId);
      return { status: "done" as const, ...result };
    }),

  getSaldosRealocacaoGeral: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();

      // ── 1. DI-08: pega o latest orcamento por obra ─────────────────────
      const orcs = await db.select({ id: orcamentos.id, obraId: orcamentos.obraId })
        .from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          input.obraId ? eq(orcamentos.obraId, input.obraId) : undefined,
        ))
        .orderBy(desc(orcamentos.id));

      // latest per obra (ignora orçamentos sem obraId)
      const latestPerObra = new Map<number, number>();
      for (const o of orcs) {
        if (o.obraId && !latestPerObra.has(o.obraId)) latestPerObra.set(o.obraId, o.id);
      }
      const latestOrcIds = [...latestPerObra.values()];

      let di08Rows: { orcamentoId: number; valorAbsoluto: string | null }[] = [];
      if (latestOrcIds.length > 0) {
        di08Rows = await db.select({ orcamentoId: orcamentoBdi.orcamentoId, valorAbsoluto: orcamentoBdi.valorAbsoluto })
          .from(orcamentoBdi)
          .where(and(inArray(orcamentoBdi.orcamentoId, latestOrcIds), eq(orcamentoBdi.codigo, "DI-08")));
      }
      const di08Total = di08Rows.reduce((s, r) => s + n(r.valorAbsoluto), 0);

      // débitos de risco
      let allDebitos: { valor: string | null }[] = [];
      if (latestOrcIds.length > 0) {
        allDebitos = await db.select({ valor: comprasRiscoDebitos.valor })
          .from(comprasRiscoDebitos)
          .where(inArray(comprasRiscoDebitos.orcamentoId, latestOrcIds));
      }
      const di08Usado = allDebitos.reduce((s, r) => s + n(r.valor), 0);
      const di08Disponivel = Math.max(0, di08Total - di08Usado);

      // ── 2. Sobras das compras: comparação pelo total da OC (não item a item) ─
      // Regra: se a OC inteira ficou abaixo do total orçado → economia.
      // Se a soma final furou a meta → zero (itens que ficaram baratos não compensam
      // os que furaram). Evita contabilizar sobras parciais em OCs que no total excederam.
      const ocsConds: any[] = [
        eq(comprasOrdens.companyId, input.companyId),
        inArray(comprasOrdens.status as any, ["aprovada", "recebida", "parcialmente_recebida"]),
      ];
      if (input.obraId) ocsConds.push(eq(comprasOrdens.obraId, input.obraId));
      const ocs = await db.select({ id: comprasOrdens.id }).from(comprasOrdens).where(and(...ocsConds));

      let totalSobras = 0;
      if (ocs.length > 0) {
        const ocItens = await db.select().from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocs.map(o => o.id)));
        const scItemIds = ocItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
        let scItens: { id: number; orcamentoItemId: number | null }[] = [];
        if (scItemIds.length > 0) {
          scItens = await db.select({ id: comprasSolicitacoesItens.id, orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId })
            .from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
        }
        const orcIds = scItens.map(s => s.orcamentoItemId).filter(Boolean) as number[];
        // metaTotal = valor total orçado para a linha (já inclui qtd orçada × preço meta)
        // Usar metaTotal e não metaUnitTotal × qtd_comprada: captura variação de preço E quantidade
        let metas: { id: number; metaTotal: string | null }[] = [];
        if (orcIds.length > 0) {
          metas = await db.select({ id: orcamentoItens.id, metaTotal: orcamentoItens.metaTotal })
            .from(orcamentoItens).where(inArray(orcamentoItens.id, orcIds));
        }
        const scToOrc: Record<number, number> = {};
        for (const s of scItens) if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
        const orcToMetaTotal: Record<number, number> = {};
        for (const m of metas) orcToMetaTotal[m.id] = n(m.metaTotal);

        // Acumula totalComprado e totalMeta por OC
        const ocTotalComprado: Record<number, number> = {};
        const ocTotalMeta: Record<number, number> = {};
        for (const it of ocItens) {
          const ocId = it.ordemId;
          if (!it.solicitacaoItemId) continue;
          const orcId = scToOrc[it.solicitacaoItemId];
          if (!orcId) continue;
          const metaItemTotal = orcToMetaTotal[orcId] ?? 0;
          if (metaItemTotal === 0) continue;
          const qty = n(it.quantidade);
          ocTotalComprado[ocId] = (ocTotalComprado[ocId] ?? 0) + n(it.precoUnitario) * qty;
          ocTotalMeta[ocId]     = (ocTotalMeta[ocId]     ?? 0) + metaItemTotal;
        }
        // Só conta sobra se a OC INTEIRA ficou abaixo do total orçado
        for (const ocId of Object.keys(ocTotalMeta)) {
          const sobra = (ocTotalMeta[+ocId] ?? 0) - (ocTotalComprado[+ocId] ?? 0);
          if (sobra > 0.01) totalSobras += sobra;
        }
      }

      return {
        di08Total,
        di08Usado,
        di08Disponivel,
        totalSobras,
        totalDisponivel: di08Disponivel + totalSobras,
      };
    }),

  buscarSaldosRealocacao: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional(), cotacaoId: z.number().optional(), deficit: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      // ── 1. RESERVA DE RISCO (BDI DI-08) ──────────────────────────────
      let riscoInicial = 0;
      let riscoOrcamentoId: number | null = null;
      if (input.obraId) {
        const [orc] = await db.select({ id: orcamentos.id })
          .from(orcamentos)
          .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId)))
          .orderBy(desc(orcamentos.id))
          .limit(1);
        if (orc) {
          riscoOrcamentoId = orc.id;
          const [di08] = await db.select({ valorAbsoluto: orcamentoBdi.valorAbsoluto })
            .from(orcamentoBdi)
            .where(and(eq(orcamentoBdi.orcamentoId, orc.id), eq(orcamentoBdi.codigo, "DI-08")));
          riscoInicial = n(di08?.valorAbsoluto ?? 0);
        }
      }
      const debitosRisco = riscoOrcamentoId
        ? await db.select({ valor: comprasRiscoDebitos.valor })
            .from(comprasRiscoDebitos)
            .where(eq(comprasRiscoDebitos.orcamentoId, riscoOrcamentoId))
        : [];
      const riscoUsado = debitosRisco.reduce((s, x) => s + n(x.valor), 0);
      const riscoDisponivel = Math.max(0, riscoInicial - riscoUsado);

      // ── 2. SOBRAS DE OCs APROVADAS ─────────────────────────────────────
      const ocs = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
        obraId: comprasOrdens.obraId,
      }).from(comprasOrdens).where(and(
        eq(comprasOrdens.companyId, input.companyId),
        inArray(comprasOrdens.status as any, ["aprovada", "recebida", "parcialmente_recebida"]),
        input.obraId ? eq(comprasOrdens.obraId, input.obraId) : undefined,
      ));

      type Sobra = { descricao: string; unidade: string; ocNumero: string; vlrMeta: number; vlrComprado: number; sobra: number };
      const sobras: Sobra[] = [];

      if (ocs.length > 0) {
        const ocItens = await db.select().from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocs.map(o => o.id)));
        const scItemIds = ocItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
        let scItensOc: any[] = [];
        if (scItemIds.length > 0) {
          scItensOc = await db.select({ id: comprasSolicitacoesItens.id, orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId })
            .from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
        }
        const orcIdsOc = scItensOc.map(s => s.orcamentoItemId).filter(Boolean) as number[];
        let orcMetasOc: any[] = [];
        if (orcIdsOc.length > 0) {
          orcMetasOc = await db.select({ id: orcamentoItens.id, metaUnitTotal: orcamentoItens.metaUnitTotal })
            .from(orcamentoItens).where(inArray(orcamentoItens.id, orcIdsOc));
        }
        const scToOrc: Record<number, number> = {};
        for (const s of scItensOc) if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
        const orcToMeta: Record<number, number> = {};
        for (const o of orcMetasOc) orcToMeta[o.id] = n(o.metaUnitTotal);

        for (const it of ocItens) {
          if (!it.solicitacaoItemId) continue;
          const orcId = scToOrc[it.solicitacaoItemId];
          if (!orcId) continue;
          const metaUnit = orcToMeta[orcId] ?? 0;
          if (metaUnit === 0) continue;
          const qty = n(it.quantidade);
          const vlrMeta = metaUnit * qty;
          const vlrComprado = n(it.precoUnitario) * qty;
          const sobra = vlrMeta - vlrComprado;
          if (sobra > 0.01) {
            const oc = ocs.find(o => o.id === it.ordemId);
            sobras.push({ descricao: it.descricao || "—", unidade: it.unidade || "", ocNumero: oc?.numeroOc || String(it.ordemId), vlrMeta, vlrComprado, sobra });
          }
        }
        sobras.sort((a, b) => b.sobra - a.sobra);
      }

      const totalSobras = sobras.reduce((s, x) => s + x.sobra, 0);
      const totalCobertura = riscoDisponivel + totalSobras;

      // Verifica débitos de risco feitos especificamente para esta cotação
      const debitosEstaCotacao = input.cotacaoId
        ? await db.select({ id: comprasRiscoDebitos.id, valor: comprasRiscoDebitos.valor, observacao: comprasRiscoDebitos.observacao, criadoEm: comprasRiscoDebitos.criadoEm })
            .from(comprasRiscoDebitos)
            .where(eq(comprasRiscoDebitos.cotacaoId, input.cotacaoId))
            .orderBy(asc(comprasRiscoDebitos.id))
        : [];
      const totalDebitadoEstaCotacao = debitosEstaCotacao.reduce((s, x) => s + n(x.valor), 0);
      const cobertoPorRisco = totalDebitadoEstaCotacao >= input.deficit - 0.01;

      return {
        risco: { inicial: riscoInicial, usado: riscoUsado, disponivel: riscoDisponivel, orcamentoId: riscoOrcamentoId },
        sobras: sobras.slice(0, 20),
        totalSobras,
        deficit: input.deficit,
        cobreDeficit: totalCobertura >= input.deficit,
        semCobertura: totalCobertura < 0.01,
        cobertoPorRisco,
        totalDebitadoEstaCotacao,
        debitosEstaCotacao,
      };
    }),

  debitarDoRisco: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      orcamentoId: z.number(),
      cotacaoId: z.number().optional(),
      valor: z.number().positive(),
      deficit: z.number().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Valida que não excede disponível na reserva global
      const debitos = await db.select({ valor: comprasRiscoDebitos.valor })
        .from(comprasRiscoDebitos)
        .where(eq(comprasRiscoDebitos.orcamentoId, input.orcamentoId));
      const [di08] = await db.select({ valorAbsoluto: orcamentoBdi.valorAbsoluto })
        .from(orcamentoBdi)
        .where(and(eq(orcamentoBdi.orcamentoId, input.orcamentoId), eq(orcamentoBdi.codigo, "DI-08")));
      const inicial = n(di08?.valorAbsoluto ?? 0);
      const usado = debitos.reduce((s, x) => s + n(x.valor), 0);
      const disponivel = Math.max(0, inicial - usado);
      if (input.valor > disponivel + 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Valor solicitado (${input.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) excede a reserva disponível (${disponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` });
      }
      // Valida que não excede o déficit desta cotação específica
      if (input.cotacaoId && input.deficit !== undefined) {
        const debitosEsta = await db.select({ valor: comprasRiscoDebitos.valor })
          .from(comprasRiscoDebitos)
          .where(eq(comprasRiscoDebitos.cotacaoId, input.cotacaoId));
        const totalEsta = debitosEsta.reduce((s, x) => s + n(x.valor), 0);
        const restante = Math.max(0, input.deficit - totalEsta);
        if (input.valor > restante + 0.01) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `O débito de ${input.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} excede o déficit restante desta cotação (${restante.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` });
        }
      }
      await db.insert(comprasRiscoDebitos).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        orcamentoId: input.orcamentoId,
        cotacaoId: input.cotacaoId ?? null,
        valor: String(input.valor),
        observacao: input.observacao ?? null,
      });
      return { ok: true, novoDisponivel: disponivel - input.valor };
    }),

  reverterDebitoRisco: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), senhaMaster: z.string().min(1, "Senha do ADM Master obrigatória") }))
    .mutation(async ({ input, ctx }) => {
      if ((ctx.user as any)?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode desfazer um débito da Reserva de Risco." });
      }
      const db = await getDb();
      const [masterUser] = await db.select({ password: users.password }).from(users).where(eq(users.id, (ctx.user as any).id));
      if (!masterUser?.password) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário master não encontrado." });
      const bcrypt = await import("bcryptjs");
      const senhaValida = bcrypt.compareSync(input.senhaMaster, masterUser.password);
      if (!senhaValida) throw new TRPCError({ code: "FORBIDDEN", message: "Senha incorreta. Operação negada." });
      const [row] = await db.select().from(comprasRiscoDebitos).where(and(eq(comprasRiscoDebitos.id, input.id), eq(comprasRiscoDebitos.companyId, input.companyId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Débito não encontrado." });
      await db.delete(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.id, input.id));
      return { ok: true, valorRestituido: n(row.valor) };
    }),

  listarDebitosRisco: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conds: any[] = [eq(comprasRiscoDebitos.companyId, input.companyId)];
      if (input.obraId) conds.push(eq(comprasRiscoDebitos.obraId, input.obraId));
      const rows = await db.select({
        id: comprasRiscoDebitos.id,
        obraId: comprasRiscoDebitos.obraId,
        orcamentoId: comprasRiscoDebitos.orcamentoId,
        cotacaoId: comprasRiscoDebitos.cotacaoId,
        valor: comprasRiscoDebitos.valor,
        observacao: comprasRiscoDebitos.observacao,
        criadoEm: comprasRiscoDebitos.criadoEm,
      }).from(comprasRiscoDebitos).where(and(...conds)).orderBy(desc(comprasRiscoDebitos.criadoEm));
      // Enrich with cotacao numeroCotacao and obra nome
      const cotacaoIds = [...new Set(rows.map(r => r.cotacaoId).filter(Boolean))] as number[];
      const obraIds = [...new Set(rows.map(r => r.obraId).filter(Boolean))] as number[];
      const [cotacoes, obrasRows] = await Promise.all([
        cotacaoIds.length > 0 ? db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao }).from(comprasCotacoes).where(inArray(comprasCotacoes.id, cotacaoIds)) : [],
        obraIds.length > 0 ? db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds)) : [],
      ]);
      const cotMap = new Map(cotacoes.map(c => [c.id, c.numeroCotacao]));
      const obraMap = new Map(obrasRows.map(o => [o.id, o.nome]));
      return rows.map(r => ({
        ...r,
        numeroCotacao: r.cotacaoId ? cotMap.get(r.cotacaoId) ?? null : null,
        obraNome: r.obraId ? obraMap.get(r.obraId) ?? null : null,
      }));
    }),

  solicitarAutorizacaoCompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cotacaoId: z.number(),
      deficit: z.number(),
      solicitanteNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Grava um registro de pedido de autorização como observação especial na cotação
      await db.update(comprasCotacoes)
        .set({ observacoes: sql`COALESCE(observacoes || E'\n', '') || ${`[AGUARDANDO AUTORIZAÇÃO MASTER — Déficit de R$ ${input.deficit.toFixed(2)} em relação ao orçamento. Solicitado por: ${input.solicitanteNome ?? "Usuário"}]`}` })
        .where(eq(comprasCotacoes.id, input.cotacaoId));
      return { ok: true };
    }),

  selecionarVencedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(comprasCotacaoFornecedores).set({ selecionado: false }).where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      await db.update(comprasCotacaoFornecedores).set({ selecionado: true }).where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      const [p] = await db.select().from(comprasCotacaoFornecedores).where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      await db.update(comprasCotacoes).set({
        fornecedorId: input.fornecedorId,
        total: p.totalOrcado ?? "0",
        prazoEntregaDias: p.prazoEntregaDias ?? null,
        condicaoPagamento: p.condicaoPagamento ?? null,
        tipoPagamento: p.tipoPagamento ?? null,
        formaPagamento: (p as any).formaPagamento ?? null,
        numeroParcelas: p.numeroParcelas ?? null,
      } as any).where(eq(comprasCotacoes.id, input.cotacaoId));
      return { ok: true };
    }),

  cancelarVencedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Remove seleção de todos os fornecedores
      await db.update(comprasCotacaoFornecedores)
        .set({ selecionado: false })
        .where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      // Limpa fornecedor vencedor da cotação mas mantém o total intacto para referência
      await db.update(comprasCotacoes)
        .set({ fornecedorId: null })
        .where(eq(comprasCotacoes.id, input.cotacaoId));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ORDENS DE COMPRA (OC)
  // ══════════════════════════════════════════════════════════════

  listarOrdens: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), busca: z.string().optional(), apenasAtrasadas: z.boolean().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db.select().from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          input.status ? eq(comprasOrdens.status, input.status) : undefined,
        ))
        .orderBy(desc(comprasOrdens.criadoEm));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        rows = rows.filter(r => r.numeroOc?.toLowerCase().includes(b) || r.observacoes?.toLowerCase().includes(b));
      }

      const allItemIds = new Set<number>();
      const ordemIds = rows.map(r => r.id);
      let itemsByOrdem: Record<number, number[]> = {};
      if (ordemIds.length > 0) {
        const allItems = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId })
          .from(comprasOrdensItens)
          .where(inArray(comprasOrdensItens.ordemId, ordemIds));
        for (const item of allItems) {
          allItemIds.add(item.id);
          if (!itemsByOrdem[item.ordemId]) itemsByOrdem[item.ordemId] = [];
          itemsByOrdem[item.ordemId].push(item.id);
        }
      }

      let entregasProgramadasMap: Record<number, { dataEntrega: string; status: string }[]> = {};
      if (allItemIds.size > 0) {
        const entregas = await db.select({
          ordemItemId: comprasEntregasProgramadas.ordemItemId,
          dataEntrega: comprasEntregasProgramadas.dataEntrega,
          status: comprasEntregasProgramadas.status,
        }).from(comprasEntregasProgramadas)
          .where(inArray(comprasEntregasProgramadas.ordemItemId, Array.from(allItemIds)));
        for (const e of entregas) {
          if (!entregasProgramadasMap[e.ordemItemId]) entregasProgramadasMap[e.ordemItemId] = [];
          entregasProgramadasMap[e.ordemItemId].push({ dataEntrega: e.dataEntrega, status: e.status });
        }
      }

      const result = rows.map(r => {
        const itemIds = itemsByOrdem[r.id] || [];
        let proximaEntregaProgramada: string | null = null;
        for (const itemId of itemIds) {
          const entregas = entregasProgramadasMap[itemId] || [];
          const pendentes = entregas.filter(e => e.status === "pendente").sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
          if (pendentes.length > 0) {
            if (!proximaEntregaProgramada || pendentes[0].dataEntrega < proximaEntregaProgramada) {
              proximaEntregaProgramada = pendentes[0].dataEntrega;
            }
          }
        }
        return { ...r, proximaEntregaProgramada };
      });

      if (input.apenasAtrasadas) {
        const hoje = new Date().toISOString().slice(0, 10);
        const closedStatuses = ["entregue", "cancelada", "recebido"];
        return result.filter(r => {
          if (closedStatuses.includes(r.status)) return false;
          const dataRef = r.proximaEntregaProgramada || r.dataEntregaPrevista;
          return dataRef && dataRef < hoje;
        });
      }

      return result;
    }),

  getOrdem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      let fornecedor = null;
      if (oc.fornecedorId) {
        const [f] = await db.select({
          razaoSocial: fornecedores.razaoSocial,
          nomeFantasia: fornecedores.nomeFantasia,
          cnpj: fornecedores.cnpj,
          telefone: fornecedores.telefone,
          email: fornecedores.email,
          contatoNome: fornecedores.contatoNome,
          contatoCelular: fornecedores.contatoCelular,
          contatoEmail: fornecedores.contatoEmail,
        }).from(fornecedores).where(eq(fornecedores.id, oc.fornecedorId));
        fornecedor = f ?? null;
      }
      let proximaEntregaProgramada: string | null = null;
      if (itens.length > 0) {
        const itemIds = itens.map(i => i.id);
        const entregas = await db.select({
          dataEntrega: comprasEntregasProgramadas.dataEntrega,
          status: comprasEntregasProgramadas.status,
        }).from(comprasEntregasProgramadas)
          .where(inArray(comprasEntregasProgramadas.ordemItemId, itemIds));
        const pendentes = entregas.filter(e => e.status === "pendente").sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
        if (pendentes.length > 0) {
          proximaEntregaProgramada = pendentes[0].dataEntrega;
        }
      }
      return { ...oc, itens, fornecedor, proximaEntregaProgramada };
    }),

  criarOrdemDeCotacao: protectedProcedure
    .input(z.object({ companyId: z.number(), cotacaoId: z.number(), userId: z.number().optional(), userName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      if (cot.status === "aprovada") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cotação já foi aprovada e possui OC gerada." });

      const existingOC = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
        .where(and(eq(comprasOrdens.cotacaoId, input.cotacaoId), sql`${comprasOrdens.status} != 'cancelada'`))
        .limit(1);
      if (existingOC.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe uma OC ativa para esta cotação." });

      const fornParts = cot.fornecedorId
        ? await db.select().from(comprasCotacaoFornecedores).where(
            and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, cot.fornecedorId))
          )
        : [];
      const fornInfoCheck = fornParts[0] ?? null;
      const condPag = (fornInfoCheck as any)?.condicaoPagamento ?? cot.condicaoPagamento;
      const formaPag = (fornInfoCheck as any)?.formaPagamento ?? (cot as any).formaPagamento;
      const prazoEntrega = (fornInfoCheck as any)?.prazoEntregaDias;
      if (!condPag && !formaPag) throw new TRPCError({ code: "BAD_REQUEST", message: "Defina a Condição de Pagamento antes de gerar a OC. Edite as condições do vencedor na cotação." });
      if (!prazoEntrega || Number(prazoEntrega) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Defina o Prazo de Entrega antes de gerar a OC. Edite as condições do vencedor na cotação." });

      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      // Busca preços do fornecedor vencedor no mapa de cotação
      const respostasForn = cot.fornecedorId
        ? await db.select().from(comprasCotacaoRespostas).where(
            and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, cot.fornecedorId))
          )
        : [];
      const precoMap = new Map(respostasForn.map(r => [r.itemId, r]));

      const fornInfo = fornInfoCheck;
      const freteValor = n((fornInfo as any)?.valorFrete);
      const freteTipoOC = (fornInfo as any)?.freteTipo ?? "cif";
      const transportadoraOC = (fornInfo as any)?.transportadora ?? null;
      const freteParaTotal = freteTipoOC === "fob" ? freteValor : 0;

      const prazoEntregaDias = (fornInfo as any)?.prazoEntregaDias ?? null;
      let dataEntregaPrevista: string | null = null;
      if (prazoEntregaDias && Number(prazoEntregaDias) > 0) {
        const d = new Date();
        d.setDate(d.getDate() + Number(prazoEntregaDias));
        dataEntregaPrevista = d.toISOString().slice(0, 10);
      }

      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroOc = `OC-${new Date().getFullYear()}-${seq}`;
      const subtotalItens = n(cot.total) - freteParaTotal;
      const subtotal = Math.max(subtotalItens, 0);
      const totalOC = subtotal + freteParaTotal;
      let extraAprovacaoRequerida = false;
      let extraMotivo = "";
      if (cot.obraId) {
        try {
          const solicitacaoItemIds = itens.map(it => it.solicitacaoItemId).filter(Boolean);
          if (solicitacaoItemIds.length > 0) {
            const scItens = await db.select({
              insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
              descricao: comprasSolicitacoesItens.descricao,
              id: comprasSolicitacoesItens.id,
            }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, solicitacaoItemIds as number[]));

            const itensParaVerificar = itens.map(it => {
              const scItem = scItens.find(s => s.id === it.solicitacaoItemId);
              const resp = precoMap.get(it.id);
              const qty = resp ? n(resp.quantidade) : n(it.quantidade);
              return { insumoCodigo: scItem?.insumoCodigo || undefined, descricao: scItem?.descricao || it.descricao, quantidade: qty };
            }).filter(it => it.insumoCodigo);

            if (itensParaVerificar.length > 0) {
              const [orcCheck] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
                .from(orcamentos)
                .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, cot.obraId!), isNull(orcamentos.deletedAt)))
                .orderBy(desc(orcamentos.createdAt)).limit(1);
              if (orcCheck) {
                const insCodigos = itensParaVerificar.map(it => it.insumoCodigo!);
                const orcItCheck = await db.select({ servicoCodigo: orcamentoItens.servicoCodigo, quantidade: orcamentoItens.quantidade })
                  .from(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orcCheck.id), eq(orcamentoItens.companyId, input.companyId)));
                const svcCods = [...new Set(orcItCheck.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
                if (svcCods.length > 0) {
                  const insCheck = await db.select({ composicaoCodigo: composicaoInsumos.composicaoCodigo, insumoCodigo: composicaoInsumos.insumoCodigo, quantidade: composicaoInsumos.quantidade, alocacaoMat: composicaoInsumos.alocacaoMat, alocacaoMdo: composicaoInsumos.alocacaoMdo })
                    .from(composicaoInsumos).where(and(eq(composicaoInsumos.companyId, Number(orcCheck.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCods)));
                  const matOnly = insCheck.filter(i => n(i.alocacaoMat) > 0 || (n(i.alocacaoMdo) === 0 && n(i.alocacaoMat) === 0));
                  const qtdOrcMap: Record<string, number> = {};
                  for (const ins of matOnly) {
                    if (!insCodigos.includes(ins.insumoCodigo || "")) continue;
                    const coef = n(ins.quantidade);
                    for (const svc of orcItCheck.filter(s => s.servicoCodigo === ins.composicaoCodigo)) {
                      qtdOrcMap[ins.insumoCodigo || ""] = (qtdOrcMap[ins.insumoCodigo || ""] || 0) + (n(svc.quantidade) * coef);
                    }
                  }
                  const ocExist = await db.select({ insumoCodigo: comprasSolicitacoesItens.insumoCodigo, quantidade: comprasOrdensItens.quantidade })
                    .from(comprasOrdensItens)
                    .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
                    .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
                    .where(and(eq(comprasOrdens.companyId, input.companyId), eq(comprasOrdens.obraId, cot.obraId!), sql`${comprasOrdens.status} NOT IN ('cancelada')`));
                  const jaCompMap: Record<string, number> = {};
                  for (const oc of ocExist) { jaCompMap[oc.insumoCodigo || ""] = (jaCompMap[oc.insumoCodigo || ""] || 0) + n(oc.quantidade); }
                  const estouros: string[] = [];
                  for (const item of itensParaVerificar) {
                    const qtdOrc = qtdOrcMap[item.insumoCodigo!] || 0;
                    if (qtdOrc <= 0) continue;
                    const jaCom = jaCompMap[item.insumoCodigo!] || 0;
                    if (jaCom + item.quantidade > qtdOrc) {
                      const exc = Math.round(((jaCom + item.quantidade - qtdOrc) / qtdOrc) * 100);
                      estouros.push(`${item.descricao}: orçado ${qtdOrc.toLocaleString("pt-BR")}, já comprado ${jaCom.toLocaleString("pt-BR")}, novo ${item.quantidade.toLocaleString("pt-BR")} (+${exc}%)`);
                    }
                  }
                  if (estouros.length > 0) {
                    extraAprovacaoRequerida = true;
                    extraMotivo = `Insumos acima do orçamento:\n${estouros.join("\n")}`;
                  }
                }
              }
            }
          }
        } catch (e: any) { console.warn("[criarOrdemDeCotacao] Erro na verificação de saldo:", e?.message); }
      }

      const [oc] = await db.insert(comprasOrdens).values({
        companyId: input.companyId,
        numeroOc,
        cotacaoId: input.cotacaoId,
        obraId: cot.obraId ?? null,
        fornecedorId: cot.fornecedorId ?? null,
        fornecedorNome: cot.fornecedorId ? (await db.select({ nome: fornecedores.nomeFantasia, razao: fornecedores.razaoSocial }).from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId!))).map(f => f.nome || f.razao || null)[0] ?? null : null,
        status: extraAprovacaoRequerida ? "aguardando_aprovacao_extra" : "aprovada",
        aprovacaoStatus: extraAprovacaoRequerida ? "aguardando_admin" : "aprovado",
        aprovacaoExtraRequerida: extraAprovacaoRequerida,
        aprovacaoExtraMotivo: extraAprovacaoRequerida ? extraMotivo : null,
        subtotal: String(subtotal.toFixed(2)),
        frete: String(freteValor.toFixed(2)),
        freteTipo: freteTipoOC,
        transportadora: transportadoraOC,
        outrasDespesas: "0",
        impostos: "0",
        desconto: "0",
        total: String(totalOC.toFixed(2)),
        condicaoPagamento: fornInfo?.condicaoPagamento ?? cot.condicaoPagamento ?? null,
        tipoPagamento: fornInfo?.tipoPagamento ?? cot.tipoPagamento ?? null,
        formaPagamento: (fornInfo as any)?.formaPagamento ?? (cot as any).formaPagamento ?? null,
        numeroParcelas: fornInfo?.numeroParcelas ?? cot.numeroParcelas ?? 1,
        dataEntregaPrevista: dataEntregaPrevista,
        pendenteCoberturaOrcamentaria: itens.some(it => (it as any).semVerba === true),
      } as any).returning();
      if (itens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          itens.map(it => {
            const resp = precoMap.get(it.id);
            const pu = resp ? n(resp.precoUnitario) : n(it.precoUnitario);
            const qty = resp ? n(resp.quantidade) : n(it.quantidade);
            const tot = resp ? n(resp.total) : (pu * qty);
            return {
              ordemId: oc.id,
              solicitacaoItemId: it.solicitacaoItemId ?? null,
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade,
              quantidade: String(qty),
              precoUnitario: String(pu.toFixed(4)),
              total: String(tot.toFixed(2)),
            };
          })
        );
      }
      if (cot.fornecedorId && !extraAprovacaoRequerida) {
        const forn = await db.select().from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId));
        const { entryIds, apIds } = await criarParcelasFinanceiras({
          ocId: oc.id,
          companyId: input.companyId,
          obraId: oc.obraId ?? undefined,
          supplierId: oc.fornecedorId,
          supplierNome: forn?.[0]?.razaoSocial || null,
          valorTotal: n(oc.total),
          tipoPagamento: oc.tipoPagamento,
          formaPagamento: (oc as any).formaPagamento || null,
          numeroParcelas: oc.numeroParcelas ?? 1,
          dataBase: oc.dataEntregaPrevista || null,
          numero: oc.numeroOc,
        }, input.userId ?? 0, input.userName ?? "Sistema");

        if (entryIds.length > 0) {
          await db.update(comprasOrdens).set({
            financialEntryId: entryIds[0],
          }).where(eq(comprasOrdens.id, oc.id));
        }
      }

      await db.update(comprasCotacoes).set({ status: "aprovada" }).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      return oc;
    }),

  cancelarAprovacaoCotacao: protectedProcedure
    .input(z.object({
      cotacaoId:    z.number(),
      companyId:    z.number(),
      justificativa: z.string().min(1, "Informe a justificativa"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userRole = (ctx.user as any)?.role;
      console.log(`[CancelarAprovacao] cotacaoId=${input.cotacaoId} companyId=${input.companyId} userRole=${userRole}`);
      if (userRole !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode cancelar uma aprovação de cotação." });
      }
      const db = await getDb();

      const [cot] = await db.select().from(comprasCotacoes).where(
        and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId))
      );
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      console.log(`[CancelarAprovacao] status real='${cot.status}' (tipo=${typeof cot.status})`);
      if (!["aprovada", "encerrada"].includes(cot.status ?? "")) throw new TRPCError({ code: "BAD_REQUEST", message: `Cotação não está aprovada (status atual: ${cot.status}).` });

      // Busca OCs vinculadas
      const ocs = await db.select().from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, input.cotacaoId));
      for (const oc of ocs) {
        if (["entregue", "recebida", "parcialmente_recebida"].includes(oc.status ?? "")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `OC ${oc.numeroOc} já foi ${oc.status} e não pode ser revertida.` });
        }
        await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
        await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
      }

      // Reverte cotação → pendente
      await db.update(comprasCotacoes)
        .set({ status: "pendente" })
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      // Reverte solicitação → cotacao (se houver vínculo)
      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "cotacao", atualizadoEm: new Date().toISOString() })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      return { ok: true, ocsRemovidas: ocs.length };
    }),

  cancelarCotacao: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(
        and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId))
      );
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      if (["cancelada"].includes(cot.status ?? "")) throw new TRPCError({ code: "BAD_REQUEST", message: "Cotação já está cancelada." });

      const ocs = await db.select().from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, input.cotacaoId));
      for (const oc of ocs) {
        if (["entregue", "recebida", "parcialmente_recebida"].includes(oc.status ?? "")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `OC ${oc.numeroOc} já foi ${oc.status} e não pode ser revertida.` });
        }
        await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
        await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
      }

      await db.update(comprasCotacoes)
        .set({ status: "cancelada" })
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      if (cot.solicitacaoId) {
        const otherActive = await db.select({ id: comprasCotacoes.id }).from(comprasCotacoes)
          .where(and(
            eq(comprasCotacoes.solicitacaoId, cot.solicitacaoId),
            eq(comprasCotacoes.companyId, input.companyId),
            sql`${comprasCotacoes.id} != ${input.cotacaoId}`,
            sql`${comprasCotacoes.status} NOT IN ('cancelada', 'recusada')`,
          ));
        if (otherActive.length === 0) {
          await db.update(comprasSolicitacoes)
            .set({ status: "aprovado", atualizadoEm: new Date().toISOString() })
            .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
        }
      }

      return { ok: true, ocsRemovidas: ocs.length };
    }),

  criarOrdemManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      condicaoPagamento: z.string().min(1, "Condição de pagamento é obrigatória"),
      prazoEntregaDias: z.number().optional(),
      dataEntregaPrevista: z.string().optional(),
      dataVencimento: z.string().optional(),
      observacoes: z.string().optional(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      if (!input.condicaoPagamento?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Condição de pagamento é obrigatória para gerar OC." });
      if (!input.prazoEntregaDias && !input.dataEntregaPrevista) throw new TRPCError({ code: "BAD_REQUEST", message: "Prazo de entrega é obrigatório para gerar OC." });
      const db = await getDb();
      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroOc = `OC-${new Date().getFullYear()}-${seq}`;
      const subtotal = input.itens.reduce((s, it) => s + n(it.quantidade) * n(it.precoUnitario), 0);
      const frete = n(input.frete);
      const outrasDespesas = n(input.outrasDespesas);
      const impostos = n(input.impostos);
      const desconto = n(input.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;

      let fornecedorNome: string | null = null;
      if (input.fornecedorId) {
        const [forn] = await db.select({ nomeFantasia: fornecedores.nomeFantasia, razaoSocial: fornecedores.razaoSocial })
          .from(fornecedores).where(eq(fornecedores.id, input.fornecedorId));
        fornecedorNome = forn?.nomeFantasia || forn?.razaoSocial || null;
      }

      const [oc] = await db.insert(comprasOrdens).values({
        companyId: input.companyId,
        numeroOc,
        obraId: input.obraId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        fornecedorNome,
        dataEntregaPrevista: input.dataEntregaPrevista,
        dataVencimento: input.dataVencimento ?? null,
        observacoes: input.observacoes,
        condicaoPagamento: input.condicaoPagamento,
        status: "pendente",
        aprovacaoStatus: "aguardando",
        subtotal: String(subtotal.toFixed(2)),
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        total: String(total.toFixed(2)),
      } as any).returning();
      if (input.itens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          input.itens.map(it => ({
            ordemId: oc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            total: String((n(it.quantidade) * n(it.precoUnitario)).toFixed(2)),
          }))
        );
      }
      return oc;
    }),

  atualizarOrdem: protectedProcedure
    .input(z.object({
      id: z.number(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      dataEntregaPrevista: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      const itens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      const subtotal = itens.reduce((s, it) => s + n(it.total), 0);
      const frete = n(input.frete ?? oc.frete);
      const outrasDespesas = n(input.outrasDespesas ?? oc.outrasDespesas);
      const impostos = n(input.impostos ?? oc.impostos);
      const desconto = n(input.desconto ?? oc.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;
      await db.update(comprasOrdens).set({
        subtotal: String(subtotal.toFixed(2)),
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        total: String(total.toFixed(2)),
        dataEntregaPrevista: input.dataEntregaPrevista ?? oc.dataEntregaPrevista ?? undefined,
        observacoes: input.observacoes ?? oc.observacoes ?? undefined,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasOrdens.id, input.id));
      return { ok: true, total };
    }),

  atualizarStatusOrdem: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string(), dataEntregaReal: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [ocCurrent] = await db.select({ status: comprasOrdens.status, aprovacaoExtraRequerida: comprasOrdens.aprovacaoExtraRequerida }).from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (ocCurrent?.status === "aguardando_aprovacao_extra" && input.status === "aprovada") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esta OC requer aprovação de administrador (compra extra-orçamento). Use o fluxo de aprovação com senha admin." });
      }

      await db.update(comprasOrdens).set({
        status: input.status,
        dataEntregaReal: input.dataEntregaReal,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasOrdens.id, input.id));

      // ── Integração financeira ─────────────────────────────────────────
      if (input.status === "aprovada" || input.status === "entregue" || input.status === "entregue_parcial") {
        const [ocFin] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (ocFin) {
          let obraNomeFin: string | null = ocFin.obraId
            ? (await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, ocFin.obraId)))[0]?.nome ?? null
            : null;

          const codigoConta = (ocFin as any).tipo === "servico" ? "3.2" : (ocFin as any).tipo === "locacao" ? "3.4" : "3.3";
          const contaRows = await db.select({ id: (financialAccounts as any).id })
            .from(financialAccounts as any)
            .where(and(eq((financialAccounts as any).companyId, ocFin.companyId), eq((financialAccounts as any).codigo, codigoConta)))
            .limit(1);
          let contaId = contaRows?.[0]?.id ?? null;
          if (!contaId) {
            const CONTA_NAMES: Record<string, string> = { "3.2": "Despesas com Serviços", "3.3": "Despesas com Materiais", "3.4": "Despesas com Locação" };
            const [newConta] = await db.insert(financialAccounts as any).values({
              companyId: ocFin.companyId,
              codigo: codigoConta,
              nome: CONTA_NAMES[codigoConta] || `Conta ${codigoConta}`,
              tipo: "despesa_variavel",
              natureza: "devedora",
              nivel: 2,
              ativo: 1,
            }).returning({ id: (financialAccounts as any).id });
            contaId = newConta?.id ?? null;
          }

          const novoStatus = (input.status === "aprovada") ? "previsto" : "a_pagar";

          if (!ocFin.financialEntryId) {
            const [entry] = await db.insert(financialEntries as any).values({
              companyId: ocFin.companyId,
              obraId: ocFin.obraId ?? null,
              obraNome: obraNomeFin,
              contaId,
              tipo: "despesa",
              natureza: "variavel",
              valorPrevisto: String(ocFin.total ?? "0"),
              dataCompetencia: new Date().toISOString().split("T")[0],
              dataVencimento: (ocFin as any).dataVencimento ?? (ocFin as any).dataEntregaPrevista ?? null,
              status: novoStatus,
              origemModulo: "compras",
              origemId: ocFin.id,
              descricao: `OC ${ocFin.numeroOc}${ocFin.fornecedorNome ? " — " + ocFin.fornecedorNome : ""}`,
            } as any).returning({ id: (financialEntries as any).id });
            if (entry?.id) {
              await db.update(comprasOrdens).set({ financialEntryId: entry.id } as any).where(eq(comprasOrdens.id, ocFin.id));
            }
          } else if (input.status !== "aprovada") {
            await db.update(financialEntries as any).set({ status: "a_pagar" } as any)
              .where(eq((financialEntries as any).id, ocFin.financialEntryId));
          }
        }
      }

      // ── Integração automática: OC entregue → Almoxarifado ───────────
      if (input.status === "entregue") {
        const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (!oc) return { ok: true, almoxarifado: false };

        const itensOC = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));

        // busca nome da obra
        let obraNome: string | null = null;
        if (oc.obraId) {
          const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, oc.obraId));
          obraNome = ob?.nome ?? null;
        }

        const usuarioNome = ctx.user?.name ?? ctx.user?.email ?? null;
        const usuarioId   = ctx.user?.id ?? null;

        for (const item of itensOC) {
          const qtd = n(item.quantidade);
          if (qtd <= 0) continue;

          // busca ou cria item no almoxarifado
          const existing = await db.select().from(almoxarifadoItens)
            .where(and(
              eq(almoxarifadoItens.companyId, oc.companyId),
              ilike(almoxarifadoItens.nome, item.descricao),
            )).limit(1);

          let almoItemId: number;
          if (existing.length > 0) {
            almoItemId = existing[0].id;
          } else {
            const [novo] = await db.insert(almoxarifadoItens).values({
              companyId: oc.companyId,
              nome: item.descricao,
              unidade: item.unidade ?? "un",
              categoria: "Compras",
              ativo: true,
            }).returning();
            almoItemId = novo.id;
          }

          // cria movimentação de entrada
          await db.insert(almoxarifadoMovimentacoes).values({
            companyId: oc.companyId,
            itemId: almoItemId,
            tipo: "entrada",
            quantidade: String(qtd),
            obraId: oc.obraId ?? null,
            obraNome: obraNome ?? null,
            motivo: `OC ${oc.numeroOc} entregue`,
            usuarioId,
            usuarioNome,
            observacoes: `Entrada automática via Ordem de Compra ${oc.numeroOc}`,
          });

          // atualiza quantidade no almoxarifado
          await db.update(almoxarifadoItens).set({
            quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${qtd}`,
            atualizadoEm: new Date().toISOString(),
          }).where(eq(almoxarifadoItens.id, almoItemId));

          // atualiza quantidadeEntregue no item da OC
          await db.update(comprasOrdensItens).set({
            quantidadeEntregue: String(qtd),
          }).where(eq(comprasOrdensItens.id, item.id));

          // atualiza quantidadeAtendida no item da SC se houver vínculo
          if (item.solicitacaoItemId) {
            const [scItem] = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            if (scItem) {
              const novaAtendida = n(scItem.quantidadeAtendida) + qtd;
              const atendido = novaAtendida >= n(scItem.quantidade);
              await db.update(comprasSolicitacoesItens).set({
                quantidadeAtendida: String(novaAtendida),
                statusItem: atendido ? "atendido" : "parcial",
              }).where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            }
          }
        }

        // verifica se todos os itens da SC foram atendidos → marca SC como concluída
        if (oc.cotacaoId) {
          const [cot] = await db.select({ solicitacaoId: comprasCotacoes.solicitacaoId })
            .from(comprasCotacoes).where(eq(comprasCotacoes.id, oc.cotacaoId));
          if (cot?.solicitacaoId) {
            const scItens = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.solicitacaoId, cot.solicitacaoId));
            const todosAtendidos = scItens.length > 0 && scItens.every(it => it.statusItem === "atendido");
            if (todosAtendidos) {
              await db.update(comprasSolicitacoes).set({
                status: "concluida",
                atualizadoEm: new Date().toISOString(),
              }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
            }
          }
        }

        return { ok: true, almoxarifado: true, itens: itensOC.length };
      }

      return { ok: true, almoxarifado: false };
    }),

  atualizarDadosEntregaOC: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      transportadora: z.string().optional(),
      codigoRastreamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [oc] = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.id), eq(comprasOrdens.companyId, input.companyId)))
        .limit(1);
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem não encontrada" });
      const updates: any = { atualizadoEm: new Date().toISOString() };
      if (input.transportadora !== undefined) updates.transportadora = input.transportadora || null;
      if (input.codigoRastreamento !== undefined) updates.codigoRastreamento = input.codigoRastreamento || null;
      await db.update(comprasOrdens).set(updates).where(eq(comprasOrdens.id, input.id));
      return { ok: true };
    }),

  excluirOrdem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      await db.delete(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      return { ok: true };
    }),

  excluirOrdensEmLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      const owned = await db.select({ id: comprasOrdens.id }).from(comprasOrdens).where(and(inArray(comprasOrdens.id, input.ids), eq(comprasOrdens.companyId, input.companyId)));
      const ownedIds = owned.map(o => o.id);
      if (ownedIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma OC encontrada" });
      await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ownedIds));
      await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ownedIds));
      return { ok: true, count: ownedIds.length };
    }),

  // Resumo/contadores para dashboard (legado)
  resumoCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scs, cots, ocs] = await Promise.all([
        db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.companyId, input.companyId)),
        db.select().from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId)),
        db.select().from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId)),
      ]);
      return {
        scPendentes: scs.filter(r => r.status === "pendente").length,
        scTotal: scs.length,
        cotPendentes: cots.filter(r => r.status === "pendente").length,
        cotTotal: cots.length,
        ocPendentes: ocs.filter(r => r.status === "pendente").length,
        ocTotal: ocs.length,
        totalOCsValor: ocs.reduce((s, r) => s + n(r.total), 0),
      };
    }),

  getDashboardCompras: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const today = new Date().toISOString().slice(0, 10);
      const ids = input.companyIds;

      const [scs, cots, ocs, forn, obrasRows] = await Promise.all([
        db.select().from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.companyId, ids)).orderBy(desc(comprasSolicitacoes.criadoEm)),
        db.select().from(comprasCotacoes).where(inArray(comprasCotacoes.companyId, ids)).orderBy(desc(comprasCotacoes.criadoEm)),
        db.select().from(comprasOrdens).where(inArray(comprasOrdens.companyId, ids)).orderBy(desc(comprasOrdens.criadoEm)),
        db.select().from(fornecedores).where(and(inArray(fornecedores.companyId, ids), eq(fornecedores.ativo, true))),
        db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo }).from(obras).where(inArray(obras.companyId, ids)),
      ]);

      const obraMap: Record<number, string> = {};
      obrasRows.forEach(o => { obraMap[o.id] = o.codigo ? `${o.codigo} – ${o.nome}` : o.nome; });

      // KPIs
      const kpis = {
        scPendentes:      scs.filter(r => r.status === "pendente").length,
        scAguardandoAprov:scs.filter(r => r.aprovacaoStatus === "aguardando").length,
        cotPendentes:     cots.filter(r => r.status === "pendente").length,
        ocPendentes:      ocs.filter(r => r.status === "pendente").length,
        ocAprovadas:      ocs.filter(r => r.status === "aprovada").length,
        totalValorOCs:    ocs.filter(r => !["cancelada"].includes(r.status)).reduce((s, r) => s + n(r.total), 0),
        fornecedoresAtivos: forn.length,
      };

      const CLOSED_OC = ["entregue", "cancelada", "recebido"];
      // Alertas: OCs com entrega vencida ou hoje
      const alertasOC = ocs.filter(r =>
        r.dataEntregaPrevista &&
        r.dataEntregaPrevista <= today &&
        !CLOSED_OC.includes(r.status)
      ).map(r => ({
        id: r.id, numeroOc: r.numeroOc, dataEntregaPrevista: r.dataEntregaPrevista,
        status: r.status, fornecedorId: r.fornecedorId, total: r.total,
        obraId: r.obraId,
        obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null,
        atrasado: r.dataEntregaPrevista! < today,
      }));

      // SCs aguardando aprovação
      const scsPendentesAprov = scs.filter(r => r.aprovacaoStatus === "aguardando" && r.status !== "cancelado").slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // Cotações pendentes (mais antigas primeiro)
      const cotsPendentes = cots.filter(r => r.status === "pendente").slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // OCs recentes (últimas 8)
      const ocsRecentes = ocs.slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // SCs recentes (últimas 8)
      const scsRecentes = scs.slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // Gastos por mês (últimos 6 meses) — baseado na data de criação das OCs aprovadas/entregues
      const seisM: Record<string, number> = {};
      ocs.filter(r => !["cancelada"].includes(r.status)).forEach(r => {
        const mes = r.criadoEm.slice(0, 7); // YYYY-MM
        seisM[mes] = (seisM[mes] ?? 0) + n(r.total);
      });
      const gastosMensais = Object.entries(seisM).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([mes, valor]) => ({ mes, valor }));

      const hoje = today;
      const ocsAbertas = ocs.filter(r => !CLOSED_OC.includes(r.status));
      const ocAbertasIds = ocsAbertas.map(r => r.id);
      let ocEntregaRefMap: Record<number, string | null> = {};
      if (ocAbertasIds.length > 0) {
        const ocItens = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId })
          .from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocAbertasIds));
        const allItemIds = ocItens.map(i => i.id);
        let entregasMap: Record<number, { dataEntrega: string; status: string }[]> = {};
        if (allItemIds.length > 0) {
          const entregas = await db.select({
            ordemItemId: comprasEntregasProgramadas.ordemItemId,
            dataEntrega: comprasEntregasProgramadas.dataEntrega,
            status: comprasEntregasProgramadas.status,
          }).from(comprasEntregasProgramadas)
            .where(inArray(comprasEntregasProgramadas.ordemItemId, allItemIds));
          for (const e of entregas) {
            if (!entregasMap[e.ordemItemId]) entregasMap[e.ordemItemId] = [];
            entregasMap[e.ordemItemId].push({ dataEntrega: e.dataEntrega, status: e.status });
          }
        }
        const itemsByOrdem: Record<number, number[]> = {};
        for (const item of ocItens) {
          if (!itemsByOrdem[item.ordemId]) itemsByOrdem[item.ordemId] = [];
          itemsByOrdem[item.ordemId].push(item.id);
        }
        for (const oc of ocsAbertas) {
          const itemIds = itemsByOrdem[oc.id] || [];
          let proxima: string | null = null;
          for (const itemId of itemIds) {
            const entregas = entregasMap[itemId] || [];
            const pendentes = entregas.filter(e => e.status === "pendente").sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
            if (pendentes.length > 0 && (!proxima || pendentes[0].dataEntrega < proxima)) {
              proxima = pendentes[0].dataEntrega;
            }
          }
          ocEntregaRefMap[oc.id] = proxima;
        }
      }

      const atrasadasPorObra: Record<number, number> = {};
      ocsAbertas.filter(r => r.obraId).forEach(r => {
        const dataRef = ocEntregaRefMap[r.id] || r.dataEntregaPrevista;
        if (dataRef && dataRef < hoje) {
          atrasadasPorObra[r.obraId!] = (atrasadasPorObra[r.obraId!] ?? 0) + 1;
        }
      });
      const ocsAtrasadasPorObra = Object.entries(atrasadasPorObra).map(([obraId, count]) => ({
        obraId: Number(obraId),
        obraNome: obraMap[Number(obraId)] ?? `Obra #${obraId}`,
        count,
      })).sort((a, b) => b.count - a.count);

      return { kpis, alertasOC, scsPendentesAprov, cotsPendentes, ocsRecentes, scsRecentes, gastosMensais, fornecedores: forn, obraMap, ocsAtrasadasPorObra };
    }),

  getAlertasCompras: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = input.companyIds;
      const hoje = new Date().toISOString().slice(0, 10);
      const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const [pagRows, notifRows, ocsRows, scsRows, scItensRows] = await Promise.all([
        db.select({
          id: purchaseAccountsPayable.id,
          ordemId: purchaseAccountsPayable.ordemId,
          supplierNome: purchaseAccountsPayable.supplierNome,
          valorTotal: purchaseAccountsPayable.valorTotal,
          status: purchaseAccountsPayable.status,
          dataVencimento: purchaseAccountsPayable.dataVencimento,
          parcelaNumero: purchaseAccountsPayable.parcelaNumero,
          parcelaTotal: purchaseAccountsPayable.parcelaTotal,
          obraId: purchaseAccountsPayable.obraId,
        }).from(purchaseAccountsPayable)
          .where(and(
            inArray(purchaseAccountsPayable.companyId, ids),
            or(eq(purchaseAccountsPayable.status, "liberado"), eq(purchaseAccountsPayable.status, "bloqueado")),
          )),

        db.select().from(almoxarifadoNotificacoes)
          .where(and(
            inArray(almoxarifadoNotificacoes.companyId, ids),
            eq(almoxarifadoNotificacoes.lida, false),
          ))
          .orderBy(desc(almoxarifadoNotificacoes.criadoEm))
          .limit(20),

        db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          status: comprasOrdens.status,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          fornecedorId: comprasOrdens.fornecedorId,
          obraId: comprasOrdens.obraId,
          total: comprasOrdens.total,
        }).from(comprasOrdens)
          .where(and(
            inArray(comprasOrdens.companyId, ids),
            or(
              eq(comprasOrdens.status, "pendente"),
              eq(comprasOrdens.status, "aprovada"),
              eq(comprasOrdens.status, "enviada"),
              eq(comprasOrdens.status, "parcial"),
            ),
          )),

        db.select({
          id: comprasSolicitacoes.id,
          numero: comprasSolicitacoes.numero,
          titulo: comprasSolicitacoes.titulo,
          obraId: comprasSolicitacoes.obraId,
        }).from(comprasSolicitacoes)
          .where(and(
            inArray(comprasSolicitacoes.companyId, ids),
            or(eq(comprasSolicitacoes.status, "pendente"), eq(comprasSolicitacoes.status, "em_cotacao")),
          )),

        db.select({
          id: comprasSolicitacoesItens.id,
          solicitacaoId: comprasSolicitacoesItens.solicitacaoId,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          descricao: comprasSolicitacoesItens.descricao,
        }).from(comprasSolicitacoesItens)
          .where(inArray(comprasSolicitacoesItens.companyId, ids)),
      ]);

      const pagVencidas = pagRows.filter(p =>
        p.status === "liberado" && p.dataVencimento && p.dataVencimento < hoje
      ).map(p => ({
        ...p, valorTotal: n(p.valorTotal), tipo: "vencida" as const,
      }));

      const pagProximas = pagRows.filter(p =>
        p.status === "liberado" && p.dataVencimento && p.dataVencimento >= hoje && p.dataVencimento <= em7dias
      ).map(p => ({
        ...p, valorTotal: n(p.valorTotal), tipo: "proxima" as const,
      }));

      const pagBloqueadas = pagRows.filter(p => p.status === "bloqueado").map(p => ({
        ...p, valorTotal: n(p.valorTotal), tipo: "bloqueada" as const,
      }));

      const CLOSED_OC = ["entregue", "cancelada", "recebido"];
      const ocsAtrasadas = ocsRows.filter(oc =>
        oc.dataEntregaPrevista && oc.dataEntregaPrevista < hoje && !CLOSED_OC.includes(oc.status)
      );
      const ocsProximas = ocsRows.filter(oc =>
        oc.dataEntregaPrevista && oc.dataEntregaPrevista >= hoje && oc.dataEntregaPrevista <= em7dias && !CLOSED_OC.includes(oc.status)
      );

      const scsSemCobertura: { scId: number; numero: string; titulo: string; itensCount: number }[] = [];
      const scIds = scsRows.map(s => s.id);
      const itensAtivos = scItensRows.filter(i => scIds.includes(i.solicitacaoId));
      const scsSemOrcMap: Record<number, number> = {};
      for (const item of itensAtivos) {
        if (!item.orcamentoItemId) {
          scsSemOrcMap[item.solicitacaoId] = (scsSemOrcMap[item.solicitacaoId] ?? 0) + 1;
        }
      }
      for (const [scIdStr, count] of Object.entries(scsSemOrcMap)) {
        const scId = Number(scIdStr);
        const sc = scsRows.find(s => s.id === scId);
        if (sc) {
          scsSemCobertura.push({
            scId, numero: sc.numero ?? `SC-${scId}`, titulo: sc.titulo ?? "", itensCount: count,
          });
        }
      }

      const notifCompras = notifRows.filter(n => n.destinoModulo === "compras");
      const notifFinanceiro = notifRows.filter(n => n.destinoModulo === "financeiro");

      return {
        pagamentos: {
          vencidas: pagVencidas,
          proximas: pagProximas,
          bloqueadas: pagBloqueadas,
          totalVencido: pagVencidas.reduce((s, p) => s + p.valorTotal, 0),
          totalProximo: pagProximas.reduce((s, p) => s + p.valorTotal, 0),
          totalBloqueado: pagBloqueadas.reduce((s, p) => s + p.valorTotal, 0),
        },
        entregas: {
          atrasadas: ocsAtrasadas.length,
          proximas: ocsProximas.length,
          listaAtrasadas: ocsAtrasadas.slice(0, 10),
          listaProximas: ocsProximas.slice(0, 10),
        },
        cobertura: {
          scsSemCobertura: scsSemCobertura.slice(0, 10),
          totalSemCobertura: scsSemCobertura.length,
        },
        divergencias: {
          compras: notifCompras,
          financeiro: notifFinanceiro,
          total: notifRows.length,
        },
      };
    }),

  getDashboardPorObra: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ids = input.companyIds;
      const hoje = new Date().toISOString().slice(0, 10);

      const [ocsRows, scsRows, obrasRows, fornRows, pagRows] = await Promise.all([
        db.select({
          id: comprasOrdens.id,
          status: comprasOrdens.status,
          total: comprasOrdens.total,
          obraId: comprasOrdens.obraId,
          fornecedorId: comprasOrdens.fornecedorId,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          criadoEm: comprasOrdens.criadoEm,
        }).from(comprasOrdens)
          .where(inArray(comprasOrdens.companyId, ids)),

        db.select({
          id: comprasSolicitacoes.id,
          status: comprasSolicitacoes.status,
          obraId: comprasSolicitacoes.obraId,
        }).from(comprasSolicitacoes)
          .where(inArray(comprasSolicitacoes.companyId, ids)),

        db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo })
          .from(obras).where(inArray(obras.companyId, ids)),

        db.select({ id: fornecedores.id, nomeFantasia: fornecedores.nomeFantasia, razaoSocial: fornecedores.razaoSocial })
          .from(fornecedores).where(and(inArray(fornecedores.companyId, ids), eq(fornecedores.ativo, true))),

        db.select({
          obraId: purchaseAccountsPayable.obraId,
          valorTotal: purchaseAccountsPayable.valorTotal,
          valorPago: purchaseAccountsPayable.valorPago,
          status: purchaseAccountsPayable.status,
        }).from(purchaseAccountsPayable)
          .where(inArray(purchaseAccountsPayable.companyId, ids)),
      ]);

      const obraMap: Record<number, { nome: string; codigo: string | null }> = {};
      obrasRows.forEach(o => { obraMap[o.id] = { nome: o.nome, codigo: o.codigo }; });

      const fornMap: Record<number, string> = {};
      fornRows.forEach(f => { fornMap[f.id] = f.nomeFantasia || f.razaoSocial; });

      const CLOSED_OC = ["entregue", "cancelada", "recebido"];

      const obraStats: Record<number, {
        obraId: number; obraNome: string; obraCodigo: string | null;
        totalGasto: number; totalOCs: number; ocsPendentes: number; ocsAtrasadas: number;
        totalSCs: number; scsPendentes: number;
        totalPago: number; totalAPagar: number;
        fornecedoresUsados: Set<number>;
        gastosMensais: Record<string, number>;
      }> = {};

      const getObraStats = (obraId: number) => {
        if (!obraStats[obraId]) {
          const info = obraMap[obraId] || { nome: `Obra #${obraId}`, codigo: null };
          obraStats[obraId] = {
            obraId, obraNome: info.nome, obraCodigo: info.codigo,
            totalGasto: 0, totalOCs: 0, ocsPendentes: 0, ocsAtrasadas: 0,
            totalSCs: 0, scsPendentes: 0,
            totalPago: 0, totalAPagar: 0,
            fornecedoresUsados: new Set(),
            gastosMensais: {},
          };
        }
        return obraStats[obraId];
      };

      for (const oc of ocsRows) {
        if (!oc.obraId) continue;
        const stats = getObraStats(oc.obraId);
        const val = n(oc.total);
        if (oc.status !== "cancelada") {
          stats.totalGasto += val;
          stats.totalOCs++;
          const mes = oc.criadoEm.slice(0, 7);
          stats.gastosMensais[mes] = (stats.gastosMensais[mes] ?? 0) + val;
        }
        if (!CLOSED_OC.includes(oc.status)) stats.ocsPendentes++;
        if (oc.dataEntregaPrevista && oc.dataEntregaPrevista < hoje && !CLOSED_OC.includes(oc.status)) stats.ocsAtrasadas++;
        if (oc.fornecedorId) stats.fornecedoresUsados.add(oc.fornecedorId);
      }

      for (const sc of scsRows) {
        if (!sc.obraId) continue;
        const stats = getObraStats(sc.obraId);
        stats.totalSCs++;
        if (sc.status === "pendente" || sc.status === "em_cotacao") stats.scsPendentes++;
      }

      for (const pag of pagRows) {
        if (!pag.obraId) continue;
        const stats = getObraStats(pag.obraId);
        stats.totalPago += n(pag.valorPago);
        if (pag.status !== "pago" && pag.status !== "cancelado") {
          stats.totalAPagar += n(pag.valorTotal) - n(pag.valorPago);
        }
      }

      const result = Object.values(obraStats).map(s => ({
        obraId: s.obraId,
        obraNome: s.obraCodigo ? `${s.obraCodigo} – ${s.obraNome}` : s.obraNome,
        totalGasto: s.totalGasto,
        totalOCs: s.totalOCs,
        ocsPendentes: s.ocsPendentes,
        ocsAtrasadas: s.ocsAtrasadas,
        totalSCs: s.totalSCs,
        scsPendentes: s.scsPendentes,
        totalPago: s.totalPago,
        totalAPagar: s.totalAPagar,
        fornecedoresCount: s.fornecedoresUsados.size,
        topFornecedores: [...s.fornecedoresUsados].slice(0, 5).map(id => ({
          id, nome: fornMap[id] ?? `#${id}`,
        })),
        gastosMensais: Object.entries(s.gastosMensais)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-6)
          .map(([mes, valor]) => ({ mes, valor })),
      })).sort((a, b) => b.totalGasto - a.totalGasto);

      return { obras: result };
    }),

  // ══════════════════════════════════════════════════════════════
  // AVALIAÇÕES DE FORNECEDORES
  // ══════════════════════════════════════════════════════════════

  avaliarFornecedor: protectedProcedure
    .input(z.object({
      fornecedorId: z.number(),
      companyId:    z.number(),
      nota:         z.number().min(1).max(5),
      comentario:   z.string().optional(),
      criadoPor:    z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.insert(avaliacoesFornecedor).values({
        fornecedorId: input.fornecedorId,
        companyId:    input.companyId,
        nota:         input.nota,
        comentario:   input.comentario ?? null,
        criadoPor:    input.criadoPor ?? null,
      });
      return { ok: true };
    }),

  listarAvaliacoesFornecedor: protectedProcedure
    .input(z.object({ fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(avaliacoesFornecedor)
        .where(and(
          eq(avaliacoesFornecedor.fornecedorId, input.fornecedorId),
          eq(avaliacoesFornecedor.companyId, input.companyId),
        ))
        .orderBy(desc(avaliacoesFornecedor.criadoEm));
      return rows;
    }),

  rankingFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT
          f.id,
          f.razao_social   AS "razaoSocial",
          f.nome_fantasia  AS "nomeFantasia",
          f.categorias,
          f.cidade,
          f.estado,
          COUNT(a.id)::int                        AS "totalAvaliacoes",
          ROUND(AVG(a.nota)::numeric, 1)::float   AS "mediaEstrelas"
        FROM fornecedores f
        LEFT JOIN avaliacoes_fornecedor a
          ON a.fornecedor_id = f.id AND a.company_id = ${input.companyId}
        WHERE f.company_id = ${input.companyId}
          AND f.ativo = true
        GROUP BY f.id, f.razao_social, f.nome_fantasia, f.categorias, f.cidade, f.estado
        HAVING COUNT(a.id) > 0
        ORDER BY "mediaEstrelas" DESC, "totalAvaliacoes" DESC
        LIMIT 50
      `);
      return rows as any[];
    }),

  // ══════════════════════════════════════════════════════════════
  // EAP PARA SC — retorna itens do orçamento + prazo do planejamento
  // SEM custos/metas (blind quotation até equalização)
  // ══════════════════════════════════════════════════════════════
  getInsumosComposicao: protectedProcedure
    .input(z.object({ companyId: z.number(), servicoCodigo: z.string(), orcamentoItemId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const insumos = await db.select({
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        unidade: composicaoInsumos.unidade,
        quantidade: composicaoInsumos.quantidade,
        precoUnitario: composicaoInsumos.precoUnitario,
        custoUnitTotal: composicaoInsumos.custoUnitTotal,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(
          eq(composicaoInsumos.companyId, input.companyId),
          eq(composicaoInsumos.composicaoCodigo, input.servicoCodigo),
        ))
        .orderBy(asc(composicaoInsumos.insumoDescricao));

      const materiaisOnly = insumos.filter(i => n(i.alocacaoMat) > 0 || (n(i.alocacaoMdo) === 0 && n(i.alocacaoMat) === 0));

      return materiaisOnly.map(i => ({
        insumoCodigo: i.insumoCodigo,
        descricao: i.insumoDescricao || "",
        unidade: i.unidade || "un",
        coeficiente: n(i.quantidade),
        precoUnitario: n(i.precoUnitario),
        custoUnitTotal: n(i.custoUnitTotal),
      }));
    }),

  getSaldoOrcamentario: protectedProcedure
    .input(z.object({ companyId: z.number(), orcamentoItemId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [orcItem] = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
        metaUnitTotal: orcamentoItens.metaUnitTotal,
        metaTotal: orcamentoItens.metaTotal,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.id, input.orcamentoItemId), eq(orcamentoItens.companyId, input.companyId)));

      if (!orcItem) return null;

      const qtdOrcada = n(orcItem.quantidade);

      const scItens = await db.select({
        quantidade: comprasSolicitacoesItens.quantidade,
        quantidadeServico: comprasSolicitacoesItens.quantidadeServico,
        statusItem: comprasSolicitacoesItens.statusItem,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(
          eq(comprasSolicitacoesItens.orcamentoItemId, input.orcamentoItemId),
          eq(comprasSolicitacoes.companyId, input.companyId),
          sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`,
        ));

      const qtdJaSolicitada = scItens.reduce((acc, it) => acc + (it.quantidadeServico != null ? n(it.quantidadeServico) : n(it.quantidade)), 0);
      const qtdRecebidaSc = scItens.reduce((acc, it) => acc + n(it.quantidadeAtendida), 0);
      const saldoDisponivel = qtdOrcada - qtdJaSolicitada;

      const ocItens = await db.select({
        quantidade: comprasOrdensItens.quantidade,
        quantidadeEntregue: comprasOrdensItens.quantidadeEntregue,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(
          eq(comprasSolicitacoesItens.orcamentoItemId, input.orcamentoItemId),
          eq(comprasOrdens.companyId, input.companyId),
          sql`${comprasOrdens.status} NOT IN ('cancelada')`,
        ));

      const qtdComprada = ocItens.reduce((acc, it) => acc + n(it.quantidade), 0);
      const qtdEntregue = ocItens.reduce((acc, it) => acc + n(it.quantidadeEntregue), 0);

      return {
        orcamentoItemId: orcItem.id,
        eapCodigo: orcItem.eapCodigo,
        descricao: orcItem.descricao,
        unidade: orcItem.unidade,
        qtdOrcada,
        qtdJaSolicitada,
        qtdComprada,
        qtdRecebida: Math.max(qtdRecebidaSc, qtdEntregue),
        saldoDisponivel,
        metaUnitTotal: n(orcItem.metaUnitTotal),
        metaTotal: n(orcItem.metaTotal),
      };
    }),

  getHistoricoPrecos: protectedProcedure
    .input(z.object({ companyId: z.number(), insumoCodigo: z.string().optional(), descricao: z.string().optional(), descricaoInsumo: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const conditions = [eq(comprasOrdensItens.id, comprasOrdensItens.id)];

      const rows = await db.select({
        descricao: comprasOrdensItens.descricao,
        unidade: comprasOrdensItens.unidade,
        precoUnitario: comprasOrdensItens.precoUnitario,
        quantidade: comprasOrdensItens.quantidade,
        fornecedorNome: comprasOrdens.fornecedorNome,
        dataOc: comprasOrdens.criadoEm,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          (input.descricaoInsumo || input.descricao) ? ilike(comprasOrdensItens.descricao, `%${input.descricaoInsumo || input.descricao}%`) : undefined,
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(20);

      return rows.map(r => ({
        descricao: r.descricao,
        unidade: r.unidade,
        precoUnitario: n(r.precoUnitario),
        quantidade: n(r.quantidade),
        fornecedor: r.fornecedorNome,
        fornecedorNome: r.fornecedorNome,
        data: r.dataOc,
        dataOc: r.dataOc,
        numeroCotacao: r.numeroOc,
        numeroOc: r.numeroOc,
      }));
    }),

  getInsumosConsolidados: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), busca: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return [];

      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));

      const servicos = orcItems.filter(it => it.servicoCodigo);
      if (!servicos.length) return [];

      const servicoCodigos = [...new Set(servicos.map(it => it.servicoCodigo!))];
      const allInsumos = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        unidade: composicaoInsumos.unidade,
        quantidade: composicaoInsumos.quantidade,
        precoUnitario: composicaoInsumos.precoUnitario,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      const materiaisOnly = allInsumos.filter(i => n(i.alocacaoMat) > 0 || (n(i.alocacaoMdo) === 0 && n(i.alocacaoMat) === 0));

      const consolidado: Record<string, {
        insumoCodigo: string; descricao: string; unidade: string;
        qtdTotalOrcada: number; precoMedio: number; composicoes: string[];
        eapItens: { orcamentoItemId: number; eapCodigo: string; servicoCodigo: string; servicoDescricao: string; qtdServico: number; coeficiente: number; qtdInsumo: number }[];
      }> = {};

      for (const ins of materiaisOnly) {
        const key = ins.insumoCodigo || ins.insumoDescricao || "";
        if (!consolidado[key]) {
          consolidado[key] = {
            insumoCodigo: ins.insumoCodigo || "",
            descricao: ins.insumoDescricao || "",
            unidade: ins.unidade || "un",
            qtdTotalOrcada: 0,
            precoMedio: 0,
            composicoes: [],
            eapItens: [],
          };
        }
        const entry = consolidado[key];
        if (!entry.composicoes.includes(ins.composicaoCodigo)) entry.composicoes.push(ins.composicaoCodigo);
        const coef = n(ins.quantidade);
        const pu = n(ins.precoUnitario);
        const matchingServicos = servicos.filter(s => s.servicoCodigo === ins.composicaoCodigo);
        for (const svc of matchingServicos) {
          const qtdServico = n(svc.quantidade);
          const qtdInsumo = qtdServico * coef;
          entry.qtdTotalOrcada += qtdInsumo;
          entry.eapItens.push({ orcamentoItemId: svc.id, eapCodigo: svc.eapCodigo, servicoCodigo: svc.servicoCodigo!, servicoDescricao: svc.descricao || svc.servicoCodigo!, qtdServico, coeficiente: coef, qtdInsumo });
        }
        if (pu > 0) entry.precoMedio = pu;
      }

      let result = Object.values(consolidado).filter(c => c.qtdTotalOrcada > 0);
      if (input.busca && input.busca.trim().length >= 2) {
        const term = input.busca.trim().toLowerCase();
        result = result.filter(c => c.descricao.toLowerCase().includes(term) || c.insumoCodigo.toLowerCase().includes(term));
      }

      const scRows = await db.select({
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasSolicitacoesItens.quantidade,
        solicitacaoId: comprasSolicitacoes.id,
        scNumero: comprasSolicitacoes.numeroSc,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(eq(comprasSolicitacoes.companyId, input.companyId), eq(comprasSolicitacoes.obraId, input.obraId), sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`));
      const scMap: Record<string, number> = {};
      const scDocsMap: Record<string, { id: number; numero: string }[]> = {};
      for (const sc of scRows) {
        const key = sc.insumoCodigo || "";
        scMap[key] = (scMap[key] || 0) + n(sc.quantidade);
        if (!scDocsMap[key]) scDocsMap[key] = [];
        const num = sc.scNumero || `SC-${sc.solicitacaoId}`;
        if (!scDocsMap[key].some(d => d.id === sc.solicitacaoId)) scDocsMap[key].push({ id: sc.solicitacaoId, numero: num });
      }

      const ocRows = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasOrdensItens.quantidade,
        quantidadeEntregue: comprasOrdensItens.quantidadeEntregue,
        ordemId: comprasOrdens.id,
        ocNumero: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(eq(comprasOrdens.companyId, input.companyId), eq(comprasOrdens.obraId, input.obraId), sql`${comprasOrdens.status} NOT IN ('cancelada')`));
      const ocMapComprado: Record<string, number> = {};
      const ocMapRecebido: Record<string, number> = {};
      const ocDocsMap: Record<string, { id: number; numero: string }[]> = {};
      for (const oc of ocRows) {
        const key = oc.insumoCodigo || "";
        ocMapComprado[key] = (ocMapComprado[key] || 0) + n(oc.quantidade);
        ocMapRecebido[key] = (ocMapRecebido[key] || 0) + n(oc.quantidadeEntregue);
        if (!ocDocsMap[key]) ocDocsMap[key] = [];
        if (!ocDocsMap[key].some(d => d.id === oc.ordemId)) ocDocsMap[key].push({ id: oc.ordemId, numero: oc.ocNumero });
      }

      const cotRows = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasSolicitacoesItens.quantidade,
        cotacaoId: comprasCotacoes.id,
        cotNumero: comprasCotacoes.numeroCotacao,
      }).from(comprasCotacoesItens)
        .innerJoin(comprasSolicitacoesItens, eq(comprasCotacoesItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .innerJoin(comprasCotacoes, eq(comprasCotacoesItens.cotacaoId, comprasCotacoes.id))
        .where(and(eq(comprasCotacoes.companyId, input.companyId), eq(comprasCotacoes.obraId, input.obraId), sql`${comprasCotacoes.status} NOT IN ('cancelada','concluida')`));
      const cotMap: Record<string, number> = {};
      const cotDocsMap: Record<string, { id: number; numero: string }[]> = {};
      for (const ct of cotRows) {
        const key = ct.insumoCodigo || "";
        cotMap[key] = (cotMap[key] || 0) + n(ct.quantidade);
        if (!cotDocsMap[key]) cotDocsMap[key] = [];
        const num = ct.cotNumero || `COT-${ct.cotacaoId}`;
        if (!cotDocsMap[key].some(d => d.id === ct.cotacaoId)) cotDocsMap[key].push({ id: ct.cotacaoId, numero: num });
      }

      return result.map(c => {
        const qtdJaSolicitada = scMap[c.insumoCodigo] || 0;
        const qtdEmCotacao = cotMap[c.insumoCodigo] || 0;
        const qtdComprada = ocMapComprado[c.insumoCodigo] || 0;
        const qtdRecebida = ocMapRecebido[c.insumoCodigo] || 0;
        const saldoDisponivel = c.qtdTotalOrcada - qtdJaSolicitada;
        let statusInsumo: "disponivel" | "solicitado" | "em_cotacao" | "comprado" | "recebido" | "estouro" = "disponivel";
        if (qtdComprada > c.qtdTotalOrcada) statusInsumo = "estouro";
        else if (qtdRecebida >= c.qtdTotalOrcada) statusInsumo = "recebido";
        else if (qtdComprada >= c.qtdTotalOrcada) statusInsumo = "comprado";
        else if (qtdEmCotacao > 0) statusInsumo = "em_cotacao";
        else if (qtdJaSolicitada > 0) statusInsumo = "solicitado";
        return {
          ...c, qtdJaSolicitada, qtdEmCotacao, qtdComprada, qtdRecebida, saldoDisponivel, statusInsumo,
          scDocs: scDocsMap[c.insumoCodigo] || [],
          cotDocs: cotDocsMap[c.insumoCodigo] || [],
          ocDocs: ocDocsMap[c.insumoCodigo] || [],
        };
      }).sort((a, b) => a.descricao.localeCompare(b.descricao));
    }),

  getSugestoesCompra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return [];

      const proj = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, input.obraId)))
        .limit(1);
      if (!proj.length) return [];

      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, proj[0].id))
        .orderBy(desc(planejamentoRevisoes.id)).limit(1);
      if (!rev) return [];

      const hoje = new Date();
      const em14dias = new Date(hoje.getTime() + 14 * 24 * 60 * 60 * 1000);
      const hojeStr = hoje.toISOString().slice(0, 10);
      const em14Str = em14dias.toISOString().slice(0, 10);

      const atividades = await db.select({
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
        dataInicio: planejamentoAtividades.dataInicio,
        dataFim: planejamentoAtividades.dataFim,
      }).from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.revisaoId, rev.id),
          sql`${planejamentoAtividades.dataInicio} IS NOT NULL`,
          sql`${planejamentoAtividades.dataInicio} <= ${em14Str}`,
          sql`(${planejamentoAtividades.dataFim} IS NULL OR ${planejamentoAtividades.dataFim} >= ${hojeStr})`,
        ));

      if (!atividades.length) return [];

      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));

      const atividadeEaps = new Set(atividades.map(a => a.eapCodigo).filter(Boolean));
      const servicosProximos = orcItems.filter(it => it.servicoCodigo && atividadeEaps.has(it.eapCodigo));
      if (!servicosProximos.length) return [];

      const servicoCodigos = [...new Set(servicosProximos.map(it => it.servicoCodigo!))];
      const insumosDb = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        unidade: composicaoInsumos.unidade,
        quantidade: composicaoInsumos.quantidade,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      const materiaisOnly = insumosDb.filter(i => n(i.alocacaoMat) > 0 || (n(i.alocacaoMdo) === 0 && n(i.alocacaoMat) === 0));

      const sugestoes: Record<string, { insumoCodigo: string; descricao: string; unidade: string; qtdNecessaria: number; atividades: string[] }> = {};
      for (const ins of materiaisOnly) {
        const svcs = servicosProximos.filter(s => s.servicoCodigo === ins.composicaoCodigo);
        for (const svc of svcs) {
          const key = ins.insumoCodigo || ins.insumoDescricao || "";
          if (!sugestoes[key]) {
            sugestoes[key] = { insumoCodigo: ins.insumoCodigo || "", descricao: ins.insumoDescricao || "", unidade: ins.unidade || "un", qtdNecessaria: 0, atividades: [] };
          }
          sugestoes[key].qtdNecessaria += n(svc.quantidade) * n(ins.quantidade);
          const atv = atividades.find(a => a.eapCodigo === svc.eapCodigo);
          if (atv && !sugestoes[key].atividades.includes(atv.nome || svc.descricao)) {
            sugestoes[key].atividades.push(atv.nome || svc.descricao);
          }
        }
      }

      return Object.values(sugestoes).filter(s => s.qtdNecessaria > 0).sort((a, b) => b.qtdNecessaria - a.qtdNecessaria).slice(0, 20);
    }),

  getAlertasEstoque: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [eq(almoxarifadoItens.companyId, input.companyId), eq(almoxarifadoItens.ativo, true)];
      if (input.obraId) conditions.push(eq(almoxarifadoItens.obraId, input.obraId));

      const itens = await db.select({
        id: almoxarifadoItens.id,
        nome: almoxarifadoItens.nome,
        unidade: almoxarifadoItens.unidade,
        quantidadeAtual: almoxarifadoItens.quantidadeAtual,
        quantidadeMinima: almoxarifadoItens.quantidadeMinima,
        obraId: almoxarifadoItens.obraId,
      }).from(almoxarifadoItens)
        .where(and(...conditions));

      const alertas = itens.filter(it => {
        const minimo = n(it.quantidadeMinima);
        if (minimo <= 0) return false;
        return n(it.quantidadeAtual) <= minimo;
      });

      return alertas.map(it => ({
        id: it.id,
        nome: it.nome,
        unidade: it.unidade || "un",
        quantidadeAtual: n(it.quantidadeAtual),
        estoqueMinimo: n(it.quantidadeMinima),
        obraId: it.obraId,
        percentual: n(it.quantidadeMinima) > 0 ? Math.round((n(it.quantidadeAtual) / n(it.quantidadeMinima)) * 100) : 0,
      })).sort((a, b) => a.percentual - b.percentual);
    }),

  getSCsPendentesAgrupamento: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [
        eq(comprasSolicitacoes.companyId, input.companyId),
        inArray(comprasSolicitacoes.status, ["pendente", "aprovado"]),
      ];
      if (input.obraId) conditions.push(eq(comprasSolicitacoes.obraId, input.obraId));

      const scItens = await db.select({
        scId: comprasSolicitacoes.id,
        scNumero: comprasSolicitacoes.numeroSc,
        scTitulo: comprasSolicitacoes.titulo,
        itemId: comprasSolicitacoesItens.id,
        descricao: comprasSolicitacoesItens.descricao,
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        unidade: comprasSolicitacoesItens.unidade,
        quantidade: comprasSolicitacoesItens.quantidade,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(...conditions));

      const grouped: Record<string, { descricao: string; unidade: string; insumoCodigo: string; totalQtd: number; scs: { scId: number; scNumero: string | null; scTitulo: string | null; quantidade: number }[] }> = {};
      for (const it of scItens) {
        const key = it.insumoCodigo || it.descricao?.toLowerCase().trim() || "";
        if (!key) continue;
        if (!grouped[key]) {
          grouped[key] = { descricao: it.descricao || "", unidade: it.unidade || "un", insumoCodigo: it.insumoCodigo || "", totalQtd: 0, scs: [] };
        }
        grouped[key].totalQtd += n(it.quantidade);
        const existing = grouped[key].scs.find(s => s.scId === it.scId);
        if (existing) { existing.quantidade += n(it.quantidade); }
        else { grouped[key].scs.push({ scId: it.scId, scNumero: it.scNumero, scTitulo: it.scTitulo, quantidade: n(it.quantidade) }); }
      }

      return Object.values(grouped).filter(g => g.scs.length >= 2).sort((a, b) => b.scs.length - a.scs.length);
    }),

  getEapParaObra: protectedProcedure
    .input(z.object({ obraId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Orçamento mais recente da obra
      const [orc] = await db.select({
        id: orcamentos.id,
        codigo: orcamentos.codigo,
        descricao: orcamentos.descricao,
      }).from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          isNull(orcamentos.deletedAt),
        ))
        .orderBy(desc(orcamentos.createdAt))
        .limit(1);

      if (!orc) return { items: [], orcamentoId: null, projetoId: null, semOrcamento: true };

      // Itens da EAP com campos de meta para exibição na SC
      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        nivel: orcamentoItens.nivel,
        tipo: orcamentoItens.tipo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
        ordem: orcamentoItens.ordem,
        metaUnitTotal: orcamentoItens.metaUnitTotal,
        metaTotal: orcamentoItens.metaTotal,
        custoUnitTotal: orcamentoItens.custoUnitTotal,
      }).from(orcamentoItens)
        .where(and(
          eq(orcamentoItens.orcamentoId, orc.id),
          eq(orcamentoItens.companyId, input.companyId),
        ))
        .orderBy(asc(orcamentoItens.ordem));

      // Projeto de planejamento mais recente da obra
      const [proj] = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(
          eq(planejamentoProjetos.companyId, input.companyId),
          eq(planejamentoProjetos.obraId, input.obraId),
        ))
        .orderBy(desc(planejamentoProjetos.criadoEm))
        .limit(1);

      // Revisão mais recente → atividades com prazo
      const atividadesMap: Record<string, { dataFim: string | null; duracaoDias: number | null }> = {};
      if (proj) {
        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, proj.id))
          .orderBy(desc(planejamentoRevisoes.id))
          .limit(1);

        if (rev) {
          const atividades = await db.select({
            eapCodigo: planejamentoAtividades.eapCodigo,
            dataFim: planejamentoAtividades.dataFim,
            duracaoDias: planejamentoAtividades.duracaoDias,
          }).from(planejamentoAtividades)
            .where(eq(planejamentoAtividades.revisaoId, rev.id));

          atividades.forEach(a => {
            if (a.eapCodigo) atividadesMap[a.eapCodigo] = { dataFim: a.dataFim, duracaoDias: a.duracaoDias };
          });
        }
      }

      const items = orcItems.map(it => ({
        ...it,
        prazoFim: atividadesMap[it.eapCodigo]?.dataFim ?? null,
        duracaoDias: atividadesMap[it.eapCodigo]?.duracaoDias ?? null,
      }));

      return { items, orcamentoId: orc.id, projetoId: proj?.id ?? null, semOrcamento: false };
    }),

  // ══════════════════════════════════════════════════════════════
  // CONDIÇÕES DE PAGAMENTO (tabela pré-cadastrada por empresa)
  // ══════════════════════════════════════════════════════════════

  listarCondicoesPagamento: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select()
        .from(comprasCondicoesPagamento)
        .where(and(eq(comprasCondicoesPagamento.companyId, input.companyId), eq(comprasCondicoesPagamento.ativo, true)))
        .orderBy(asc(comprasCondicoesPagamento.ordem), asc(comprasCondicoesPagamento.descricao));
    }),

  criarCondicaoPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), descricao: z.string().min(1).max(150) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existente = await db.select().from(comprasCondicoesPagamento)
        .where(and(eq(comprasCondicoesPagamento.companyId, input.companyId), eq(comprasCondicoesPagamento.descricao, input.descricao.trim())));
      if (existente.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Condição já cadastrada" });
      const [row] = await db.insert(comprasCondicoesPagamento).values({
        companyId: input.companyId,
        descricao: input.descricao.trim(),
      }).returning();
      return row;
    }),

  deletarCondicaoPagamento: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(comprasCondicoesPagamento).where(eq(comprasCondicoesPagamento.id, input.id));
      return { ok: true };
    }),

  getEntregasProgramadas: protectedProcedure
    .input(z.object({ ordemItemId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId }).from(comprasOrdensItens).where(eq(comprasOrdensItens.id, input.ordemItemId));
      if (!item) return [];
      const [ordem] = await db.select({ companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, item.ordemId));
      if (!ordem || ordem.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      return db.select().from(comprasEntregasProgramadas)
        .where(eq(comprasEntregasProgramadas.ordemItemId, input.ordemItemId))
        .orderBy(asc(comprasEntregasProgramadas.dataEntrega));
    }),

  salvarEntregasProgramadas: protectedProcedure
    .input(z.object({
      ordemItemId: z.number(),
      companyId: z.number(),
      entregas: z.array(z.object({
        id: z.number().optional(),
        dataEntrega: z.string(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [item] = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId }).from(comprasOrdensItens).where(eq(comprasOrdensItens.id, input.ordemItemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const [ordem] = await db.select({ companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, item.ordemId));
      if (!ordem || ordem.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      await db.delete(comprasEntregasProgramadas).where(eq(comprasEntregasProgramadas.ordemItemId, input.ordemItemId));
      if (input.entregas.length > 0) {
        await db.insert(comprasEntregasProgramadas).values(
          input.entregas.map(e => ({
            ordemItemId: input.ordemItemId,
            dataEntrega: e.dataEntrega,
            quantidade: String(e.quantidade),
            observacoes: e.observacoes || null,
            status: "pendente",
          }))
        );
      }
      return { ok: true };
    }),

  registrarEntregaProgramada: protectedProcedure
    .input(z.object({ id: z.number(), quantidadeEntregue: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [entrega] = await db.select().from(comprasEntregasProgramadas).where(eq(comprasEntregasProgramadas.id, input.id));
      if (!entrega) throw new TRPCError({ code: "NOT_FOUND" });
      const [item] = await db.select({ ordemId: comprasOrdensItens.ordemId }).from(comprasOrdensItens).where(eq(comprasOrdensItens.id, entrega.ordemItemId));
      if (item) {
        const [ordem] = await db.select({ companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, item.ordemId));
        if (!ordem || ordem.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const novaQtd = n(entrega.quantidadeEntregue) + input.quantidadeEntregue;
      const qtdProg = n(entrega.quantidade);
      const novoStatus = novaQtd >= qtdProg ? "entregue" : "parcial";
      await db.update(comprasEntregasProgramadas)
        .set({ quantidadeEntregue: String(novaQtd), status: novoStatus })
        .where(eq(comprasEntregasProgramadas.id, input.id));
      return { ok: true, novoStatus };
    }),

  getTimelineCompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cotacaoId: z.number().optional(),
      ordemId: z.number().optional(),
    }).refine(d => d.cotacaoId || d.ordemId, { message: "cotacaoId ou ordemId é obrigatório" }))
    .query(async ({ input }) => {
      const db = await getDb();
      const { companyId } = input;

      let sc: typeof comprasSolicitacoes.$inferSelect | null = null;
      let cot: typeof comprasCotacoes.$inferSelect | null = null;
      let oc: typeof comprasOrdens.$inferSelect | null = null;

      if (input.cotacaoId) {
        const [c] = await db.select().from(comprasCotacoes).where(
          and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, companyId))
        );
        cot = c ?? null;
        if (!cot) return { etapas: [], etapaAtual: null };
        if (cot.solicitacaoId) {
          const [s] = await db.select().from(comprasSolicitacoes).where(
            and(eq(comprasSolicitacoes.id, cot.solicitacaoId), eq(comprasSolicitacoes.companyId, companyId))
          );
          sc = s ?? null;
        }
        const ordens = await db.select().from(comprasOrdens)
          .where(and(eq(comprasOrdens.cotacaoId, input.cotacaoId), eq(comprasOrdens.companyId, companyId)))
          .orderBy(desc(comprasOrdens.criadoEm));
        const nonCancelled = ordens.filter(o => o.status !== "cancelada");
        oc = nonCancelled.length > 0 ? nonCancelled[0] : (ordens.length > 0 ? ordens[0] : null);
      } else if (input.ordemId) {
        const [o] = await db.select().from(comprasOrdens).where(
          and(eq(comprasOrdens.id, input.ordemId), eq(comprasOrdens.companyId, companyId))
        );
        oc = o ?? null;
        if (!oc) return { etapas: [], etapaAtual: null };
        if (oc.cotacaoId) {
          const [c] = await db.select().from(comprasCotacoes).where(
            and(eq(comprasCotacoes.id, oc.cotacaoId), eq(comprasCotacoes.companyId, companyId))
          );
          cot = c ?? null;
        }
        const solId = cot?.solicitacaoId ?? null;
        if (solId) {
          const [s] = await db.select().from(comprasSolicitacoes).where(
            and(eq(comprasSolicitacoes.id, solId), eq(comprasSolicitacoes.companyId, companyId))
          );
          sc = s ?? null;
        }
      }

      let financialEntry: { status: string; dataPagamento: string | null; dataVencimento: string | null } | null = null;
      if (oc?.financialEntryId) {
        const feRows = await db.select({
          status: financialEntries.status,
          dataPagamento: financialEntries.dataPagamento,
          dataVencimento: financialEntries.dataVencimento,
          feCompanyId: financialEntries.companyId,
        }).from(financialEntries)
          .where(and(
            eq(financialEntries.id, oc.financialEntryId),
            eq(financialEntries.companyId, companyId),
          ));
        if (feRows[0]) {
          financialEntry = {
            status: feRows[0].status,
            dataPagamento: feRows[0].dataPagamento ?? null,
            dataVencimento: feRows[0].dataVencimento ?? null,
          };
        }
      }

      const parseDate = (d: string): Date => {
        const clean = d.replace(" ", "T").replace(/\+00$/, "Z");
        return new Date(clean.includes("T") ? clean : clean + "T00:00:00");
      };
      const daysBetween = (d1: string | null | undefined, d2: string | null | undefined): number | null => {
        if (!d1 || !d2) return null;
        try {
          const a = parseDate(d1);
          const b = parseDate(d2);
          if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
          return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
        } catch { return null; }
      };

      interface TimelineEtapa {
        key: string;
        label: string;
        status: "concluida" | "atual" | "pendente" | "atrasada";
        data: string | null;
        tempoDesdeAnterior: number | null;
        detalhe: string | null;
      }

      const today = new Date().toISOString().split("T")[0];
      const etapas: TimelineEtapa[] = [];
      let prevDate: string | null = null;

      if (sc) {
        etapas.push({
          key: "sc_criada",
          label: "SC Criada",
          status: "concluida",
          data: sc.criadoEm,
          tempoDesdeAnterior: null,
          detalhe: sc.numeroSc ? `#${sc.numeroSc}` : null,
        });
        prevDate = sc.criadoEm;

        if (sc.aprovacaoStatus === "aprovada" && sc.aprovadoEm) {
          const dias = daysBetween(prevDate, sc.aprovadoEm);
          etapas.push({
            key: "sc_aprovada",
            label: "SC Aprovada",
            status: "concluida",
            data: sc.aprovadoEm,
            tempoDesdeAnterior: dias,
            detalhe: null,
          });
          prevDate = sc.aprovadoEm;
        } else if (!cot) {
          etapas.push({
            key: "sc_aprovada",
            label: "SC Aprovação",
            status: sc.aprovacaoStatus === "aguardando" ? "atual" : "pendente",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        }
      }

      if (cot) {
        const dias = daysBetween(prevDate, cot.criadoEm);
        etapas.push({
          key: "cotacao_aberta",
          label: "Cotação Aberta",
          status: "concluida",
          data: cot.criadoEm,
          tempoDesdeAnterior: dias,
          detalhe: cot.numeroCotacao ? `#${cot.numeroCotacao}` : null,
        });
        prevDate = cot.criadoEm;

        if (oc) {
          const approvalDate = oc.criadoEm;
          const diasAprov = daysBetween(prevDate, approvalDate);
          etapas.push({
            key: "cotacao_aprovada",
            label: "Cotação Aprovada",
            status: "concluida",
            data: approvalDate,
            tempoDesdeAnterior: diasAprov,
            detalhe: cot.fornecedorId ? "Fornecedor selecionado" : null,
          });
          prevDate = approvalDate;
        } else if (cot.status === "aprovada" || cot.status === "encerrada") {
          etapas.push({
            key: "cotacao_aprovada",
            label: "Cotação Aprovada",
            status: "concluida",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: cot.fornecedorId ? "Fornecedor selecionado" : "Aguardando emissão de OC",
          });
        } else if (cot.status === "recusada" || cot.status === "cancelada") {
          etapas.push({
            key: "cotacao_aprovada",
            label: cot.status === "recusada" ? "Cotação Recusada" : "Cotação Cancelada",
            status: "concluida",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: "Processo encerrado",
          });

          const resolvedAtual2 = etapas.find(e => e.status === "atual");
          const etapaAtual2 = resolvedAtual2?.label ?? "Processo encerrado";
          return { etapas, etapaAtual: etapaAtual2 };
        } else {
          etapas.push({
            key: "cotacao_aprovada",
            label: "Aguardando Aprovação",
            status: "atual",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        }
      }

      if (oc) {
        const dias = daysBetween(prevDate, oc.criadoEm);
        etapas.push({
          key: "oc_emitida",
          label: "OC Emitida",
          status: "concluida",
          data: oc.criadoEm,
          tempoDesdeAnterior: dias,
          detalhe: oc.numeroOc ? `#${oc.numeroOc}` : null,
        });
        prevDate = oc.criadoEm;

        if (oc.dataEntregaPrevista) {
          const isDelivered = ["entregue", "entregue_parcial"].includes(oc.status);
          const isOverdue = !isDelivered && oc.dataEntregaPrevista < today;
          const diasEntrega = daysBetween(prevDate, oc.dataEntregaPrevista);
          const diasAtraso = isOverdue ? daysBetween(oc.dataEntregaPrevista, today) : null;
          etapas.push({
            key: "entrega_prevista",
            label: isOverdue ? "Entrega Atrasada" : (isDelivered ? "Entrega Prevista" : "Aguardando Entrega"),
            status: isDelivered ? "concluida" : (isOverdue ? "atrasada" : "atual"),
            data: oc.dataEntregaPrevista,
            tempoDesdeAnterior: isOverdue ? diasAtraso : diasEntrega,
            detalhe: isOverdue ? "Prazo excedido" : null,
          });
        }

        if (oc.status === "entregue" || oc.status === "entregue_parcial") {
          const diasReceb = daysBetween(oc.dataEntregaPrevista || prevDate, oc.dataEntregaReal || oc.atualizadoEm);
          etapas.push({
            key: "material_recebido",
            label: oc.status === "entregue_parcial" ? "Recebimento Parcial" : "Material Recebido",
            status: "concluida",
            data: oc.dataEntregaReal || oc.atualizadoEm,
            tempoDesdeAnterior: diasReceb,
            detalhe: null,
          });
          prevDate = oc.dataEntregaReal || oc.atualizadoEm;
        } else if (!oc.dataEntregaPrevista) {
          etapas.push({
            key: "material_recebido",
            label: "Aguardando Recebimento",
            status: "atual",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        } else {
          etapas.push({
            key: "material_recebido",
            label: "Recebimento",
            status: "pendente",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        }

        if (financialEntry) {
          const isPaid = financialEntry.status === "pago" || financialEntry.status === "confirmado";
          const diasPag = isPaid && financialEntry.dataPagamento
            ? daysBetween(prevDate, financialEntry.dataPagamento) : null;
          etapas.push({
            key: "pagamento",
            label: isPaid ? "Pagamento Realizado" : "Pagamento Pendente",
            status: isPaid ? "concluida" : (oc.status === "entregue" ? "atual" : "pendente"),
            data: isPaid ? financialEntry.dataPagamento : financialEntry.dataVencimento,
            tempoDesdeAnterior: diasPag,
            detalhe: isPaid ? null : (financialEntry.dataVencimento ? `Venc. ${financialEntry.dataVencimento}` : null),
          });
        } else {
          etapas.push({
            key: "pagamento",
            label: "Pagamento",
            status: "pendente",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        }
      } else {
        if (cot) {
          etapas.push({ key: "oc_emitida", label: "Emissão OC", status: "pendente", data: null, tempoDesdeAnterior: null, detalhe: null });
          etapas.push({ key: "material_recebido", label: "Recebimento", status: "pendente", data: null, tempoDesdeAnterior: null, detalhe: null });
          etapas.push({ key: "pagamento", label: "Pagamento", status: "pendente", data: null, tempoDesdeAnterior: null, detalhe: null });
        }
      }

      const atrasada = etapas.find(e => e.status === "atrasada");
      const atual = etapas.find(e => e.status === "atual");
      if (!atrasada && !atual) {
        const firstPending = etapas.find(e => e.status === "pendente");
        if (firstPending) {
          firstPending.status = "atual";
        }
      }
      const resolvedAtual = etapas.find(e => e.status === "atual");
      const resolvedAtrasada = etapas.find(e => e.status === "atrasada");
      const etapaAtual = resolvedAtrasada?.label ?? resolvedAtual?.label ?? (etapas.length > 0 && etapas.every(e => e.status === "concluida") ? "Concluído" : null);

      return { etapas, etapaAtual };
    }),

  getHistoricoRecompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricao: z.string().optional(),
      insumoCodigo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!input.descricao && !input.insumoCodigo) return null;

      const stripEapPrefix = (desc: string) => desc.replace(/^\[[\d.]+\]\s*/, "").trim();
      const descNorm = input.descricao ? stripEapPrefix(input.descricao) : null;

      if (!descNorm && !input.insumoCodigo) return null;

      const ocStatusAprovados = ["aprovada", "recebida", "parcialmente_recebida"];

      if (input.insumoCodigo) {
        const codeRows = await db.select({
          descricao: comprasOrdensItens.descricao,
          unidade: comprasOrdensItens.unidade,
          precoUnitario: comprasOrdensItens.precoUnitario,
          quantidade: comprasOrdensItens.quantidade,
          fornecedorNome: comprasOrdens.fornecedorNome,
          fornecedorId: comprasOrdens.fornecedorId,
          dataOc: comprasOrdens.criadoEm,
          numeroOc: comprasOrdens.numeroOc,
        }).from(comprasOrdensItens)
          .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
          .leftJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
          .where(and(
            eq(comprasOrdens.companyId, input.companyId),
            inArray(comprasOrdens.status, ocStatusAprovados),
            eq(comprasSolicitacoesItens.insumoCodigo, input.insumoCodigo),
          ))
          .orderBy(desc(comprasOrdens.criadoEm))
          .limit(1);

        if (codeRows.length > 0) {
          const best = codeRows[0];
          return {
            fornecedorNome: best.fornecedorNome,
            fornecedorId: best.fornecedorId,
            precoUnitario: n(best.precoUnitario),
            quantidade: n(best.quantidade),
            unidade: best.unidade,
            dataOc: best.dataOc,
            numeroOc: best.numeroOc,
            descricao: best.descricao,
          };
        }
      }

      if (descNorm) {
        const descRows = await db.select({
          descricao: comprasOrdensItens.descricao,
          unidade: comprasOrdensItens.unidade,
          precoUnitario: comprasOrdensItens.precoUnitario,
          quantidade: comprasOrdensItens.quantidade,
          fornecedorNome: comprasOrdens.fornecedorNome,
          fornecedorId: comprasOrdens.fornecedorId,
          dataOc: comprasOrdens.criadoEm,
          numeroOc: comprasOrdens.numeroOc,
        }).from(comprasOrdensItens)
          .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
          .where(and(
            eq(comprasOrdens.companyId, input.companyId),
            inArray(comprasOrdens.status, ocStatusAprovados),
            ilike(comprasOrdensItens.descricao, `%${descNorm}%`),
          ))
          .orderBy(desc(comprasOrdens.criadoEm))
          .limit(1);

        if (descRows.length > 0) {
          const best = descRows[0];
          return {
            fornecedorNome: best.fornecedorNome,
            fornecedorId: best.fornecedorId,
            precoUnitario: n(best.precoUnitario),
            quantidade: n(best.quantidade),
            unidade: best.unidade,
            dataOc: best.dataOc,
            numeroOc: best.numeroOc,
            descricao: best.descricao,
          };
        }
      }

      return null;
    }),

  getSugestoesFornecedoresRecompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricoes: z.array(z.string()),
      insumoCodigos: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (input.descricoes.length === 0 && (!input.insumoCodigos || input.insumoCodigos.length === 0)) return [];

      const stripEapPrefix = (desc: string) => desc.replace(/^\[[\d.]+\]\s*/, "").trim();
      const descNormalizadas = input.descricoes.map(d => stripEapPrefix(d)).filter(d => d.length > 0);
      const insumoCodigosValidos = (input.insumoCodigos ?? []).filter(c => c.length > 0);

      if (descNormalizadas.length === 0 && insumoCodigosValidos.length === 0) return [];

      const ocStatusAprovados = ["aprovada", "recebida", "parcialmente_recebida"];
      const descConditions = descNormalizadas.map(d => ilike(comprasOrdensItens.descricao, `%${d}%`));

      const descRows = descConditions.length > 0 ? await db.select({
        fornecedorId: comprasOrdens.fornecedorId,
        fornecedorNome: comprasOrdens.fornecedorNome,
        descricao: comprasOrdensItens.descricao,
        precoUnitario: comprasOrdensItens.precoUnitario,
        dataOc: comprasOrdens.criadoEm,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          inArray(comprasOrdens.status, ocStatusAprovados),
          or(...descConditions),
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(50) : [];

      const codeRows = insumoCodigosValidos.length > 0 ? await db.select({
        fornecedorId: comprasOrdens.fornecedorId,
        fornecedorNome: comprasOrdens.fornecedorNome,
        descricao: comprasOrdensItens.descricao,
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        dataOc: comprasOrdens.criadoEm,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          inArray(comprasOrdens.status, ocStatusAprovados),
          inArray(comprasSolicitacoesItens.insumoCodigo, insumoCodigosValidos),
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(50) : [];

      const rows = [...codeRows.map(r => ({ ...r, descricao: r.descricao })), ...descRows];

      const fornMap = new Map<number, { fornecedorId: number; fornecedorNome: string | null; itensAtendidos: number; ultimaData: string | null; ultimaOc: string | null; descVistas: Set<string> }>();
      for (const r of rows) {
        if (!r.fornecedorId) continue;
        if (!fornMap.has(r.fornecedorId)) {
          fornMap.set(r.fornecedorId, {
            fornecedorId: r.fornecedorId,
            fornecedorNome: r.fornecedorNome,
            itensAtendidos: 0,
            ultimaData: r.dataOc,
            ultimaOc: r.numeroOc,
            descVistas: new Set(),
          });
        }
        const entry = fornMap.get(r.fornecedorId)!;
        if (r.dataOc && (!entry.ultimaData || r.dataOc > entry.ultimaData)) {
          entry.ultimaData = r.dataOc;
          entry.ultimaOc = r.numeroOc;
        }
        const descNorm = stripEapPrefix(r.descricao).toLowerCase();
        if (!entry.descVistas.has(descNorm)) {
          entry.descVistas.add(descNorm);
          entry.itensAtendidos++;
        }
      }

      return Array.from(fornMap.values())
        .map(({ descVistas, ...rest }) => rest)
        .sort((a, b) => b.itensAtendidos - a.itensAtendidos)
        .slice(0, 5);
    }),

  scoreFornecedor: protectedProcedure
    .input(z.object({ fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c: any) => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const db = await getDb();
      const scoreData = await calcScoreFornecedor(db, input.fornecedorId, input.companyId);
      return scoreData;
    }),

  scoresFornecedoresLote: protectedProcedure
    .input(z.object({ fornecedorIds: z.array(z.number()), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c: any) => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      if (input.fornecedorIds.length === 0) return {};
      const db = await getDb();
      const { companyId } = input;

      const allOcs = await db.select().from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, companyId),
          inArray(comprasOrdens.fornecedorId, input.fornecedorIds),
        ));

      const companyCotIds = await db.select({ id: comprasCotacoes.id })
        .from(comprasCotacoes).where(eq(comprasCotacoes.companyId, companyId));
      const cotIdSet = new Set(companyCotIds.map(c => c.id));

      const allCotPart = cotIdSet.size > 0
        ? await db.select({
            cotacaoId: comprasCotacaoFornecedores.cotacaoId,
            fornecedorId: comprasCotacaoFornecedores.fornecedorId,
            totalOrcado: comprasCotacaoFornecedores.totalOrcado,
            selecionado: comprasCotacaoFornecedores.selecionado,
            prazoEntregaDias: comprasCotacaoFornecedores.prazoEntregaDias,
          }).from(comprasCotacaoFornecedores)
            .where(inArray(comprasCotacaoFornecedores.cotacaoId, [...cotIdSet]))
        : [];

      const minPriceByCot: Record<number, number> = {};
      const minPrazoByCot: Record<number, number> = {};
      for (const cp of allCotPart) {
        const v = n(cp.totalOrcado);
        if (v > 0 && (!(cp.cotacaoId in minPriceByCot) || v < minPriceByCot[cp.cotacaoId])) {
          minPriceByCot[cp.cotacaoId] = v;
        }
        const prazo = cp.prazoEntregaDias ?? 0;
        if (prazo > 0 && (!(cp.cotacaoId in minPrazoByCot) || prazo < minPrazoByCot[cp.cotacaoId])) {
          minPrazoByCot[cp.cotacaoId] = prazo;
        }
      }

      const allAvals = await db.select({ fornecedorId: avaliacoesFornecedor.fornecedorId, nota: avaliacoesFornecedor.nota })
        .from(avaliacoesFornecedor)
        .where(and(
          eq(avaliacoesFornecedor.companyId, companyId),
          inArray(avaliacoesFornecedor.fornecedorId, input.fornecedorIds),
        ));

      const allOcIds = allOcs.map(oc => oc.id);
      const allRecebimentos = allOcIds.length > 0
        ? await db.select({
            ordemCompraId: almoxarifadoRecebimentos.ordemCompraId,
            temDivergencia: almoxarifadoRecebimentos.temDivergencia,
          }).from(almoxarifadoRecebimentos)
            .where(and(
              eq(almoxarifadoRecebimentos.companyId, companyId),
              inArray(almoxarifadoRecebimentos.ordemCompraId, allOcIds),
            ))
        : [];

      const result: Record<number, { score: number; totalOCs: number; taxaPontualidade: number; taxaCompetitividade: number; totalAvaliacoes: number; mediaAvaliacoes: number | null }> = {};

      for (const fornecedorId of input.fornecedorIds) {
        const ocs = allOcs.filter(o => o.fornecedorId === fornecedorId);
        const totalOCs = ocs.length;
        let ocsPontuais = 0, ocsComData = 0;
        for (const oc of ocs) {
          if (oc.dataEntregaPrevista && oc.dataEntregaReal) {
            ocsComData++;
            if (new Date(oc.dataEntregaReal) <= new Date(oc.dataEntregaPrevista)) ocsPontuais++;
          } else if (oc.dataEntregaPrevista && !oc.dataEntregaReal && oc.status === "entregue") {
            ocsComData++;
            ocsPontuais++;
          }
        }
        const taxaPontualidade = ocsComData > 0 ? ocsPontuais / ocsComData : 1;

        const cotPart = allCotPart.filter(cp => cp.fornecedorId === fornecedorId);
        let cotacoesComPreco = 0, melhorPrecoCount = 0;
        let cotacoesComPrazo = 0, melhorPrazoCount = 0;
        for (const cp of cotPart) {
          const v = n(cp.totalOrcado);
          if (v > 0) {
            cotacoesComPreco++;
            if (v <= (minPriceByCot[cp.cotacaoId] ?? Infinity)) melhorPrecoCount++;
          }
          const prazo = cp.prazoEntregaDias ?? 0;
          if (prazo > 0) {
            cotacoesComPrazo++;
            if (prazo <= (minPrazoByCot[cp.cotacaoId] ?? Infinity)) melhorPrazoCount++;
          }
        }
        const taxaCompetitividade = cotacoesComPreco > 0 ? melhorPrecoCount / cotacoesComPreco : 0;
        const taxaPrazoEntrega = cotacoesComPrazo > 0 ? melhorPrazoCount / cotacoesComPrazo : 0;

        const avals = allAvals.filter(a => a.fornecedorId === fornecedorId);
        const mediaAvaliacoes = avals.length > 0 ? avals.reduce((s, r) => s + r.nota, 0) / avals.length : 0;
        const totalAvaliacoes = avals.length;

        const ocIdsForSupplier = ocs.map(oc => oc.id);
        const recebForSupplier = allRecebimentos.filter(r => ocIdsForSupplier.includes(r.ordemCompraId));
        const totalRecebimentos = recebForSupplier.length;
        const totalDivergencias = recebForSupplier.filter(r => r.temDivergencia).length;
        const taxaSemDiv = totalRecebimentos > 0 ? (totalRecebimentos - totalDivergencias) / totalRecebimentos : 1;

        let score = 0;
        score += taxaPontualidade * 5 * 0.25;
        score += taxaCompetitividade * 5 * 0.20;
        score += taxaSemDiv * 5 * 0.15;
        score += taxaPrazoEntrega * 5 * 0.15;
        score += (totalAvaliacoes > 0 ? mediaAvaliacoes : 3) * 0.15;
        score += Math.min(totalOCs / 10, 1) * 5 * 0.10;
        score = Math.round(Math.min(score, 5) * 10) / 10;

        result[fornecedorId] = {
          score,
          totalOCs,
          taxaPontualidade: Math.round(taxaPontualidade * 100),
          taxaCompetitividade: Math.round(taxaCompetitividade * 100),
          totalAvaliacoes,
          mediaAvaliacoes: totalAvaliacoes > 0 ? Math.round(mediaAvaliacoes * 10) / 10 : null,
        };
      }

      return result;
    }),

  dashboardPorObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      periodoInicio: z.string().optional(),
      periodoFim: z.string().optional(),
      statusFiltro: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const obrasAtivas = await db.select().from(obras)
        .where(and(
          eq(obras.companyId, input.companyId),
          eq(obras.isActive, 1),
        ))
        .orderBy(asc(obras.nome));

      const result = await Promise.all(obrasAtivas.map(async (obra) => {
        const orcs = await db.select().from(orcamentos)
          .where(and(
            eq(orcamentos.companyId, input.companyId),
            eq(orcamentos.obraId, obra.id),
          ));
        const totalOrcado = orcs.reduce((s, o) => s + n(o.totalMeta), 0);

        const ocConditions: any[] = [
          eq(comprasOrdens.companyId, input.companyId),
          eq(comprasOrdens.obraId, obra.id),
        ];
        if (input.periodoInicio) ocConditions.push(gte(comprasOrdens.criadoEm, input.periodoInicio));
        if (input.periodoFim) ocConditions.push(lte(comprasOrdens.criadoEm, input.periodoFim));

        const ocsLegacy = await db.select().from(comprasOrdens)
          .where(and(...ocConditions));

        const poConditions: any[] = [
          eq(purchaseOrders.companyId, input.companyId),
          eq(purchaseOrders.obraId, obra.id),
        ];
        if (input.periodoInicio) poConditions.push(gte(purchaseOrders.createdAt, input.periodoInicio));
        if (input.periodoFim) poConditions.push(lte(purchaseOrders.createdAt, input.periodoFim));

        const ocsV2 = await db.select().from(purchaseOrders)
          .where(and(...poConditions));

        const allOCs = [
          ...ocsLegacy.map((o: any) => ({
            id: o.id,
            numero: o.numeroOc || `OC-${o.id}`,
            status: o.status,
            valor: n(o.total),
            fornecedor: o.fornecedorNome,
            data: o.criadoEm,
            source: "legacy" as const,
          })),
          ...ocsV2.map((o: any) => ({
            id: o.id,
            numero: o.numero || `OC-${o.id}`,
            status: o.status,
            valor: n(o.valorTotal),
            fornecedor: o.supplierNome,
            data: o.createdAt,
            source: "v2" as const,
          })),
        ];

        const statusAprovadas = ["aprovada", "emitida", "em_entrega", "recebido", "entregue", "parcial"];
        const statusCancelada = ["cancelada"];

        let totalComprado = 0;
        let totalOCsAtivas = 0;
        allOCs.forEach(oc => {
          if (statusAprovadas.includes(oc.status)) {
            totalComprado += oc.valor;
            totalOCsAtivas++;
          }
        });

        const scConditions: any[] = [
          eq(purchaseRequests.companyId, input.companyId),
          eq(purchaseRequests.obraId, obra.id),
        ];
        if (input.periodoInicio) scConditions.push(gte(purchaseRequests.createdAt, input.periodoInicio));
        if (input.periodoFim) scConditions.push(lte(purchaseRequests.createdAt, input.periodoFim));
        const scs = await db.select().from(purchaseRequests)
          .where(and(...scConditions));

        const scIds = scs.map(sc => sc.id);

        let cotacoesPendentes: any[] = [];
        let totalEmCotacao = 0;
        if (scIds.length > 0) {
          const cotConditions: any[] = [
            eq(purchaseQuotations.companyId, input.companyId),
            inArray(purchaseQuotations.solicitacaoId, scIds),
          ];
          if (input.periodoInicio) cotConditions.push(gte(purchaseQuotations.createdAt, input.periodoInicio));
          if (input.periodoFim) cotConditions.push(lte(purchaseQuotations.createdAt, input.periodoFim));
          cotacoesPendentes = await db.select().from(purchaseQuotations)
            .where(and(...cotConditions));

          const cotacoesAbertas = cotacoesPendentes.filter((c: any) => c.status === "aberta" || c.status === "pendente");
          const scIdsContados = new Set<number>();
          for (const cot of cotacoesAbertas) {
            if (cot.solicitacaoId && !scIdsContados.has(cot.solicitacaoId)) {
              const sc = scs.find(s => s.id === cot.solicitacaoId);
              if (sc) {
                totalEmCotacao += n(sc.valorEstimadoTotal);
                scIdsContados.add(cot.solicitacaoId);
              }
            }
          }
        }

        const legacyCotConditions: any[] = [
          eq(comprasCotacoes.companyId, input.companyId),
          eq(comprasCotacoes.obraId, obra.id),
        ];
        if (input.periodoInicio) legacyCotConditions.push(gte(comprasCotacoes.criadoEm, input.periodoInicio));
        if (input.periodoFim) legacyCotConditions.push(lte(comprasCotacoes.criadoEm, input.periodoFim));
        const legacyCots = await db.select().from(comprasCotacoes)
          .where(and(...legacyCotConditions));
        const legacyCotsPendentes = legacyCots.filter((c: any) =>
          c.status === "aberta" || c.status === "em_andamento" || c.status === "pendente"
        );
        for (const c of legacyCotsPendentes) {
          totalEmCotacao += n(c.total);
        }

        const saldoDisponivel = totalOrcado - totalComprado;
        const percentualExecucao = totalOrcado > 0 ? (totalComprado / totalOrcado) * 100 : 0;
        const alertaSaldo = totalOrcado > 0 && (saldoDisponivel / totalOrcado) < 0.10;

        return {
          obra: {
            id: obra.id,
            nome: obra.nome,
            codigo: obra.codigo,
            status: obra.status,
            cliente: obra.cliente,
          },
          totalOrcado,
          totalComprado,
          totalEmCotacao,
          saldoDisponivel,
          percentualExecucao: Math.min(percentualExecucao, 100),
          alertaSaldo,
          totalOCs: allOCs.length,
          totalOCsAtivas,
          totalSCs: scs.length,
          totalCotacoes: cotacoesPendentes.length + legacyCots.length,
          ocs: allOCs,
          scs: scs.map((sc: any) => ({
            id: sc.id,
            status: sc.status,
            tipo: sc.tipo,
            valorEstimado: n(sc.valorEstimadoTotal),
            solicitante: sc.solicitanteNome,
            data: sc.createdAt,
            emergencial: sc.emergencial === 1,
          })),
          cotacoes: [
            ...cotacoesPendentes.map((c: any) => ({
              id: c.id,
              status: c.status,
              comprador: c.compradorNome,
              validadeAte: c.validadeAte,
              data: c.createdAt,
              source: "v2" as const,
            })),
            ...legacyCots.map((c: any) => ({
              id: c.id,
              status: c.status,
              comprador: null,
              validadeAte: c.dataValidade || null,
              data: c.criadoEm,
              source: "legacy" as const,
            })),
          ],
        };
      }));

      const filtered = input.statusFiltro && input.statusFiltro !== "todos"
        ? result.filter(r => {
            if (input.statusFiltro === "alerta") return r.alertaSaldo;
            if (input.statusFiltro === "sem_orcamento") return r.totalOrcado === 0;
            return true;
          })
        : result;

      return filtered;
    }),

  getSaldoInsumoPorObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      orcamentoItemIds: z.array(z.number()).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          isNull(orcamentos.deletedAt),
        ))
        .orderBy(desc(orcamentos.createdAt))
        .limit(1);
      if (!orc) return [];

      const rawResult = await db.execute(sql`
        WITH sc_agg AS (
          SELECT si.orcamento_item_id,
            SUM(CASE WHEN si.quantidade_servico IS NOT NULL THEN si.quantidade_servico ELSE si.quantidade END) AS qtd_solicitada,
            SUM(COALESCE(si.quantidade_atendida, 0)) AS qtd_recebida_sc
          FROM compras_solicitacoes_itens si
          JOIN compras_solicitacoes s ON si.solicitacao_id = s.id
          WHERE s.company_id = ${input.companyId} AND s.status != 'cancelado'
            AND si.orcamento_item_id IN (SELECT id FROM orcamento_itens WHERE "orcamentoId" = ${orc.id})
          GROUP BY si.orcamento_item_id
        ),
        oc_agg AS (
          SELECT si2.orcamento_item_id,
            SUM(oci.quantidade) AS qtd_comprada,
            SUM(COALESCE(oci.quantidade_entregue, 0)) AS qtd_entregue
          FROM compras_ordens_itens oci
          JOIN compras_ordens o ON oci.ordem_id = o.id
          JOIN compras_solicitacoes_itens si2 ON oci.solicitacao_item_id = si2.id
          WHERE o.company_id = ${input.companyId} AND o.status != 'cancelada'
            AND si2.orcamento_item_id IN (SELECT id FROM orcamento_itens WHERE "orcamentoId" = ${orc.id})
          GROUP BY si2.orcamento_item_id
        )
        SELECT oi.id AS "orcamentoItemId",
          oi.quantidade AS "qtdOrcada",
          COALESCE(sc.qtd_solicitada, 0) AS "qtdSolicitada",
          COALESCE(oc.qtd_comprada, 0) AS "qtdComprada",
          GREATEST(COALESCE(sc.qtd_recebida_sc, 0), COALESCE(oc.qtd_entregue, 0)) AS "qtdRecebida"
        FROM orcamento_itens oi
        LEFT JOIN sc_agg sc ON sc.orcamento_item_id = oi.id
        LEFT JOIN oc_agg oc ON oc.orcamento_item_id = oi.id
        WHERE oi."orcamentoId" = ${orc.id}
          AND oi."companyId" = ${input.companyId}
          AND (COALESCE(sc.qtd_solicitada, 0) > 0 OR COALESCE(oc.qtd_comprada, 0) > 0)
      `);

      const rows = (rawResult as any).rows || rawResult || [];
      return (rows as any[]).map((r: any) => {
        const qtdOrcada = n(r.qtdOrcada);
        const qtdSolicitada = n(r.qtdSolicitada);
        return {
          orcamentoItemId: Number(r.orcamentoItemId),
          qtdOrcada,
          qtdSolicitada,
          qtdComprada: n(r.qtdComprada),
          qtdRecebida: n(r.qtdRecebida),
          saldoDisponivel: qtdOrcada - qtdSolicitada,
        };
      });
    }),

  getCoberturaInsumosEAP: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return [];

      const servicos = await db.select({
        id: orcamentoItens.id,
        servicoCodigo: orcamentoItens.servicoCodigo,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId), sql`${orcamentoItens.servicoCodigo} IS NOT NULL`));

      if (!servicos.length) return [];

      const servicoCodigos = [...new Set(servicos.map(s => s.servicoCodigo!))];
      const insumos = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      const materiaisOnly = insumos.filter(i => n(i.alocacaoMat) > 0 || (n(i.alocacaoMdo) === 0 && n(i.alocacaoMat) === 0));

      const totalInsumosPorComposicao: Record<string, Set<string>> = {};
      for (const ins of materiaisOnly) {
        if (!totalInsumosPorComposicao[ins.composicaoCodigo]) totalInsumosPorComposicao[ins.composicaoCodigo] = new Set();
        totalInsumosPorComposicao[ins.composicaoCodigo].add(ins.insumoCodigo);
      }

      const scItens = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(eq(comprasSolicitacoes.companyId, input.companyId), eq(comprasSolicitacoes.obraId, input.obraId), sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`));

      const insumosCobertosPorOrcItem: Record<number, Set<string>> = {};
      for (const sc of scItens) {
        if (sc.insumoCodigo && sc.orcamentoItemId) {
          if (!insumosCobertosPorOrcItem[sc.orcamentoItemId]) insumosCobertosPorOrcItem[sc.orcamentoItemId] = new Set();
          insumosCobertosPorOrcItem[sc.orcamentoItemId].add(sc.insumoCodigo);
        }
      }

      return servicos.map(svc => {
        const totalSet = totalInsumosPorComposicao[svc.servicoCodigo!] || new Set();
        const totalInsumos = totalSet.size;
        const cobertos = insumosCobertosPorOrcItem[svc.id] || new Set();
        const insumosCobertos = [...cobertos].filter(ic => totalSet.has(ic)).length;
        return {
          orcamentoItemId: svc.id,
          totalInsumos,
          insumosCobertos,
        };
      }).filter(r => r.totalInsumos > 0);
    }),

  getConversaoComercial: protectedProcedure
    .input(z.object({
      insumos: z.array(z.object({
        descricao: z.string(),
        unidade: z.string(),
        quantidade: z.number(),
      })).max(50),
    }))
    .query(async ({ input }) => {
      const conversoes = await getConversaoIA(input.insumos);
      return input.insumos.map(ins => {
        const chave = `${ins.descricao.toLowerCase().trim()}|${ins.unidade.toLowerCase().trim()}`;
        const conv = conversoes[chave];
        if (!conv || conv.fatorConversao <= 0 || conv.fatorConversao === 1) return { descricao: ins.descricao, conversao: null };
        const qtdConvertida = ins.quantidade / conv.fatorConversao;
        return {
          descricao: ins.descricao,
          conversao: {
            texto: `≈ ${qtdConvertida < 1 ? qtdConvertida.toFixed(2) : Math.ceil(qtdConvertida).toLocaleString("pt-BR")} ${conv.embalagem}`,
            embalagem: conv.embalagem,
            fator: conv.fatorConversao,
            unidadeComercial: conv.unidadeComercial,
            qtdConvertida: Math.ceil(qtdConvertida),
          },
        };
      });
    }),

  editarSolicitacao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      titulo: z.string().optional(),
      departamento: z.string().optional(),
      prioridade: z.string().optional(),
      dataNecessidade: z.string().optional(),
      observacoes: z.string().optional(),
      obraId: z.number().nullable().optional(),
      itens: z.array(z.object({
        id: z.number().optional(),
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
        orcamentoItemId: z.number().optional(),
        eapCodigo: z.string().optional(),
        insumoCodigo: z.string().optional(),
        composicaoCodigo: z.string().optional(),
        precoMeta: z.number().optional(),
        quantidadeServico: z.number().optional(),
        coeficiente: z.number().optional(),
        origemEap: z.boolean().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [sc] = await db.select().from(comprasSolicitacoes)
        .where(and(eq(comprasSolicitacoes.id, input.id), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "SC não encontrada." });

      if (!["pendente", "aprovado"].includes(sc.status ?? "") && sc.aprovacaoStatus !== "aguardando") {
        const activeCots = await db.select({ id: comprasCotacoes.id })
          .from(comprasCotacoes)
          .where(and(
            eq(comprasCotacoes.solicitacaoId, input.id),
            sql`${comprasCotacoes.status} NOT IN ('cancelada', 'recusada')`,
          ));
        const activeOCs = activeCots.length > 0
          ? await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
              .where(and(
                inArray(comprasOrdens.cotacaoId, activeCots.map(c => c.id)),
                sql`${comprasOrdens.status} NOT IN ('cancelada', 'recebido')`,
              ))
          : [];
        if (activeOCs.length > 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não é possível editar: SC possui OC em andamento." });
        }
      }

      await db.update(comprasSolicitacoes).set({
        titulo: input.titulo ? normalizarTexto(input.titulo) : sc.titulo,
        departamento: input.departamento ?? sc.departamento,
        prioridade: input.prioridade ?? sc.prioridade,
        dataNecessidade: input.dataNecessidade ?? sc.dataNecessidade,
        observacoes: input.observacoes !== undefined ? input.observacoes : sc.observacoes,
        obraId: input.obraId !== undefined ? input.obraId : sc.obraId,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasSolicitacoes.id, input.id));

      if (input.itens) {
        await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

        if (input.itens.length > 0) {
          await db.insert(comprasSolicitacoesItens).values(
            input.itens.map(it => ({
              solicitacaoId: input.id,
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade,
              quantidade: String(it.quantidade),
              observacoes: it.observacoes,
              statusItem: "pendente",
              orcamentoItemId: it.orcamentoItemId ?? null,
              eapCodigo: it.eapCodigo ?? null,
              insumoCodigo: it.insumoCodigo ?? null,
              composicaoCodigo: it.composicaoCodigo ?? null,
              precoMeta: it.precoMeta ? String(it.precoMeta) : null,
              quantidadeServico: it.quantidadeServico ? String(it.quantidadeServico) : null,
              coeficiente: it.coeficiente ? String(it.coeficiente) : null,
              origemEap: it.origemEap ?? false,
            }))
          );
        }
      }

      return { ok: true };
    }),

  aprovarSolicitacoesEmLote: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      companyId: z.number(),
      aprovacaoStatus: z.string(),
      aprovadorId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const resultados: { id: number; ok: boolean; cotacaoCriada?: any; erro?: string }[] = [];

      for (const id of input.ids) {
        try {
          const [sc] = await db.select().from(comprasSolicitacoes).where(and(eq(comprasSolicitacoes.id, id), eq(comprasSolicitacoes.companyId, input.companyId)));
          if (!sc) { resultados.push({ id, ok: false, erro: "SC não encontrada" }); continue; }
          if (sc.aprovacaoStatus !== "aguardando") { resultados.push({ id, ok: false, erro: "SC já foi processada" }); continue; }

          await db.update(comprasSolicitacoes).set({
            aprovacaoStatus: input.aprovacaoStatus,
            aprovadorId: input.aprovadorId ?? null,
            aprovadoEm: input.aprovacaoStatus !== "aguardando" ? new Date().toISOString() : null,
            atualizadoEm: new Date().toISOString(),
          }).where(eq(comprasSolicitacoes.id, id));

          let cotacaoCriada: any = null;

          if (input.aprovacaoStatus === "aprovada") {
            const existingCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status })
              .from(comprasCotacoes)
              .where(eq(comprasCotacoes.solicitacaoId, id));
            const activeCots = existingCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));

            if (activeCots.length === 0) {
              const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, id));
              const count = await db.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, sc.companyId));
              const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
              const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;

              const [cot] = await db.insert(comprasCotacoes).values({
                companyId: sc.companyId,
                numeroCotacao,
                descricao: sc.titulo || sc.departamento || "Cotação automática",
                prioridade: sc.prioridade ?? "normal",
                obraId: sc.obraId ?? null,
                solicitacaoId: sc.id,
                total: "0",
                status: "pendente",
              }).returning();

              if (scItens.length > 0) {
                await db.insert(comprasCotacoesItens).values(
                  scItens.map(it => ({
                    cotacaoId: cot.id,
                    solicitacaoItemId: it.id,
                    descricao: normalizarTexto(it.descricao),
                    unidade: it.unidade ?? "un",
                    quantidade: String(n(it.quantidade)),
                    precoUnitario: "0",
                    descontoPct: "0",
                    total: "0",
                    semVerba: it.semVerba ?? false,
                    motivoSemVerba: it.motivoSemVerba ?? null,
                  }))
                );
              }

              await db.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, id));
              cotacaoCriada = { id: cot.id, numeroCotacao };
            }
          }

          resultados.push({ id, ok: true, cotacaoCriada });
        } catch (err: any) {
          resultados.push({ id, ok: false, erro: err.message });
        }
      }

      return resultados;
    }),

  duplicarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [sc] = await db.select().from(comprasSolicitacoes)
        .where(and(eq(comprasSolicitacoes.id, input.id), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "SC não encontrada." });

      const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

      const count = await db.select({ c: sql<number>`count(*)` }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.companyId, input.companyId));
      const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
      const numeroSc = `SC-${new Date().getFullYear()}-${seq}`;

      const [novaSc] = await db.insert(comprasSolicitacoes).values({
        companyId: sc.companyId,
        numeroSc,
        obraId: sc.obraId,
        projetoId: sc.projetoId,
        solicitanteId: sc.solicitanteId,
        departamento: sc.departamento,
        titulo: sc.titulo ? `${sc.titulo} (cópia)` : undefined,
        prioridade: sc.prioridade ?? "normal",
        dataNecessidade: null,
        observacoes: sc.observacoes,
        imagemReferenciaUrl: sc.imagemReferenciaUrl,
        status: "pendente",
        aprovacaoStatus: "aguardando",
      }).returning();

      if (scItens.length > 0) {
        await db.insert(comprasSolicitacoesItens).values(
          scItens.map(it => ({
            solicitacaoId: novaSc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: it.quantidade,
            observacoes: it.observacoes,
            statusItem: "pendente",
            orcamentoItemId: it.orcamentoItemId,
            eapCodigo: it.eapCodigo,
            insumoCodigo: it.insumoCodigo,
            composicaoCodigo: it.composicaoCodigo,
            precoMeta: it.precoMeta,
            quantidadeServico: it.quantidadeServico,
            coeficiente: it.coeficiente,
            origemEap: it.origemEap ?? false,
          }))
        );
      }

      return novaSc;
    }),

  verificarSaldoOrcamentarioParaOC: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), itens: z.array(z.object({ insumoCodigo: z.string().optional(), descricao: z.string(), quantidade: z.number() })) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!input.obraId || input.itens.length === 0) return { ok: true, estouros: [] };

      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return { ok: true, estouros: [] };

      const insumoCodigosFromInput = input.itens.map(it => it.insumoCodigo).filter(Boolean) as string[];
      if (insumoCodigosFromInput.length === 0) return { ok: true, estouros: [] };

      const orcItems = await db.select({
        id: orcamentoItens.id,
        servicoCodigo: orcamentoItens.servicoCodigo,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));

      const servicoCodigos = [...new Set(orcItems.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
      if (servicoCodigos.length === 0) return { ok: true, estouros: [] };

      const allInsumos = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        quantidade: composicaoInsumos.quantidade,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      const materiaisOnly = allInsumos.filter(i => n(i.alocacaoMat) > 0 || (n(i.alocacaoMdo) === 0 && n(i.alocacaoMat) === 0));

      const qtdOrcadaMap: Record<string, number> = {};
      for (const ins of materiaisOnly) {
        const key = ins.insumoCodigo || "";
        if (!insumoCodigosFromInput.includes(key)) continue;
        const coef = n(ins.quantidade);
        const matchingServicos = orcItems.filter(s => s.servicoCodigo === ins.composicaoCodigo);
        for (const svc of matchingServicos) {
          const qtdServico = n(svc.quantidade);
          qtdOrcadaMap[key] = (qtdOrcadaMap[key] || 0) + (qtdServico * coef);
        }
      }

      const ocRows = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasOrdensItens.quantidade,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(eq(comprasOrdens.companyId, input.companyId), eq(comprasOrdens.obraId, input.obraId), sql`${comprasOrdens.status} NOT IN ('cancelada')`));

      const jaCompradoMap: Record<string, number> = {};
      for (const oc of ocRows) {
        const key = oc.insumoCodigo || "";
        jaCompradoMap[key] = (jaCompradoMap[key] || 0) + n(oc.quantidade);
      }

      const estouros: { insumoCodigo: string; descricao: string; qtdOrcada: number; qtdJaComprada: number; qtdNova: number; qtdTotal: number; excesso: number; percentualExcesso: number }[] = [];
      for (const item of input.itens) {
        if (!item.insumoCodigo) continue;
        const qtdOrcada = qtdOrcadaMap[item.insumoCodigo] || 0;
        if (qtdOrcada <= 0) continue;
        const jaComprada = jaCompradoMap[item.insumoCodigo] || 0;
        const total = jaComprada + item.quantidade;
        if (total > qtdOrcada) {
          estouros.push({
            insumoCodigo: item.insumoCodigo,
            descricao: item.descricao,
            qtdOrcada,
            qtdJaComprada: jaComprada,
            qtdNova: item.quantidade,
            qtdTotal: total,
            excesso: total - qtdOrcada,
            percentualExcesso: Math.round(((total - qtdOrcada) / qtdOrcada) * 100),
          });
        }
      }

      return { ok: estouros.length === 0, estouros };
    }),

  aprovarOcExtra: protectedProcedure
    .input(z.object({
      ocId: z.number(),
      companyId: z.number(),
      adminEmail: z.string(),
      adminSenha: z.string(),
      justificativa: z.string().min(1, "Justificativa é obrigatória"),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [admin] = await db.select({
        id: users.id,
        name: users.name,
        role: users.role,
        password: users.password,
      }).from(users).where(eq(users.email, input.adminEmail)).limit(1);

      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário admin não encontrado" });
      if (admin.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem aprovar compras extra-orçamento" });

      const bcrypt = await import("bcryptjs");
      const senhaValida = await bcrypt.compare(input.adminSenha, admin.password);
      if (!senhaValida) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });

      const allowed = await getCompaniesForUser(admin.id, admin.role);
      if (!allowed.some((c: any) => c.id === input.companyId))
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin não tem acesso a esta empresa" });

      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ocId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada" });

      await db.update(comprasOrdens).set({
        aprovacaoExtraRequerida: false,
        aprovacaoExtraAdminId: admin.id,
        aprovacaoExtraAdminNome: admin.name,
        aprovacaoExtraJustificativa: input.justificativa,
        aprovacaoExtraMotivo: input.motivo || "Compra extra-orçamento aprovada pelo admin",
        aprovacaoExtraEm: new Date().toISOString(),
        status: "aprovada",
        aprovacaoStatus: "aprovado",
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasOrdens.id, input.ocId));

      if (oc.fornecedorId && !oc.financialEntryId) {
        try {
          const forn = await db.select().from(fornecedores).where(eq(fornecedores.id, oc.fornecedorId));
          const { entryIds } = await criarParcelasFinanceiras({
            ocId: oc.id,
            companyId: input.companyId,
            obraId: oc.obraId ?? undefined,
            supplierId: oc.fornecedorId,
            supplierNome: forn?.[0]?.razaoSocial || null,
            valorTotal: n(oc.total),
            tipoPagamento: oc.tipoPagamento,
            formaPagamento: (oc as any).formaPagamento || null,
            numeroParcelas: oc.numeroParcelas ?? 1,
            dataBase: oc.dataEntregaPrevista || null,
            numero: oc.numeroOc,
          }, admin.id, admin.name);
          if (entryIds.length > 0) {
            await db.update(comprasOrdens).set({ financialEntryId: entryIds[0] }).where(eq(comprasOrdens.id, oc.id));
          }
        } catch (e: any) { console.warn("[aprovarOcExtra] Erro ao criar parcelas financeiras:", e?.message); }
      }

      return { success: true, adminNome: admin.name };
    }),
});
