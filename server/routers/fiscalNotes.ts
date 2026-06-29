import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { fiscalNotes } from "../../drizzle/schema";
import { eq, and, desc, ilike, or, isNull, notInArray, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getUserCompanyLinks } from "../db";
import { invokeGeminiVision, invokeAnthropicVision } from "../_core/llm";
import { sincronizarNfsPeriodo, obterSugestoesPeriodo } from "../services/autoVincularNfService";

// ─── Prompt e helpers para parsing de DANFSe ───────────────────────────────

const PROMPT_DANFSE = `Você é um extrator de NOTA FISCAL DE SERVIÇO ELETRÔNICA (NFS-e / DANFSe) brasileira em PDF.
Extraia os campos abaixo com precisão. Devolva SOMENTE JSON válido, sem texto adicional.

Campos esperados:
- "numeroNf": número da NFS-e (string, ex.: "55")
- "serie": série da DPS (string, pode ser null)
- "chaveAcesso": chave de acesso da NFS-e (string de dígitos, ex.: "35184042...")
- "dataEmissao": data de emissão no formato "YYYY-MM-DD"
- "dataCompetencia": competência da NFS-e no formato "YYYY-MM-DD" (se vier como MM/YYYY ou DD/MM/YYYY converta)
- "dataVencimento": data de vencimento do pagamento no formato "YYYY-MM-DD" (procure em "Data de Vencimento:" na descrição do serviço, pode ser null)
- "tomadorCnpj": CNPJ do tomador apenas os dígitos (14 chars), sem pontos ou traços (ex.: "30653585000100"), null se CPF/não houver
- "tomadorRazaoSocial": razão social do tomador do serviço (string)
- "descricaoServico": descrição completa do serviço prestado (string)
- "valorBruto": valor do serviço (número, use ponto decimal, ex.: 20572.29)
- "deducoesTotal": total de deduções/reduções (número, 0 se não houver)
- "baseCalculoIss": base de cálculo do ISS/ISSQN (número, null se não houver)
- "aliquotaIss": alíquota do ISS em % (número, ex.: 5.0, null se não houver)
- "issRetido": valor do ISSQN retido pelo tomador (número, 0 se não houver — use "ISSQN Apurado" ou "ISSQN Retido")
- "retencaoInss": valor da Contribuição Previdenciária RETIDA pelo tomador (número, 0 se não houver — NÃO confundir com débito apuração própria)
- "retencaoIrrf": valor do IRRF retido pelo tomador (número, 0 se não houver — "-" = 0)
- "retencaoPisCofins": valor de PIS/COFINS/CSLL RETIDO pelo tomador (número, 0 se não houver — "Contribuições Sociais - Retidas"; NÃO usar "Débito Apuração Própria")
- "valorLiquido": valor líquido da NFS-e (número)

REGRAS:
- Valores em reais: converta "R$ 1.234,56" para 1234.56; "-" ou vazio = 0 ou null conforme tipo.
- Datas: DD/MM/AAAA → AAAA-MM-DD; DD/MM/AAAA HH:MM:SS → só a data.
- Responda SOMENTE com JSON: { "numeroNf": "...", "serie": null, ... }`;

function salvageNfJson(text: string): any {
  if (!text) throw new Error("IA não retornou conteúdo.");
  try { return JSON.parse(text); } catch { /* fallback */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start > -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* segue */ }
  }
  throw new Error("Não consegui interpretar o JSON da IA.");
}

function parseValorNf(v: any): number {
  if (v == null || v === "" || v === "-") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normDataNf(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // MM/YYYY → primeiro dia do mês
  m = s.match(/^(\d{2})\/(\d{4})/);
  if (m) return `${m[2]}-${m[1]}-01`;
  return null;
}

async function invocarIANfe(base64: string): Promise<string> {
  if (process.env.GOOGLE_API_KEY) {
    try {
      return await invokeGeminiVision({
        prompt: PROMPT_DANFSE,
        base64,
        mimeType: "application/pdf",
        maxTokens: 4096,
        thinking: "off",
      });
    } catch (e: any) {
      console.warn(`[fiscalNotesIA] Gemini falhou, tentando Anthropic: ${e?.message}`);
    }
  }
  return invokeAnthropicVision({
    prompt: PROMPT_DANFSE + "\nResponda SOMENTE com JSON válido.",
    files: [{ base64, mimeType: "application/pdf" }],
    maxTokens: 4096,
  });
}

async function _assertNfAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

const nfInput = z.object({
  companyId:           z.number(),
  numeroNf:            z.string().min(1),
  serie:               z.string().nullable().optional(),
  chaveAcesso:         z.string().nullable().optional(),
  dataEmissao:         z.string(),
  dataCompetencia:     z.string().nullable().optional(),
  dataVencimento:      z.string().nullable().optional(),
  tomadorCnpj:         z.string().nullable().optional(),
  tomadorRazaoSocial:  z.string().nullable().optional(),
  obraId:              z.number().nullable().optional(),
  obraNome:            z.string().nullable().optional(),
  bmReferencia:        z.string().nullable().optional(),
  descricaoServico:    z.string().nullable().optional(),
  valorBruto:          z.number(),
  deducoesTotal:       z.number().default(0),
  baseCalculoIss:      z.number().nullable().optional(),
  aliquotaIss:         z.number().nullable().optional(),
  issRetido:           z.number().default(0),
  retencaoInss:        z.number().default(0),
  retencaoIrrf:        z.number().default(0),
  retencaoPisCofins:   z.number().default(0),
  valorLiquido:        z.number(),
  entryId:             z.number().nullable().optional(),
  stmtLineId:          z.number().nullable().optional(),
  arquivoUrl:          z.string().nullable().optional(),
  arquivoNome:         z.string().nullable().optional(),
  observacoes:         z.string().nullable().optional(),
});

export const fiscalNotesRouter = router({

  list: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      search:     z.string().optional(),
      status:     z.string().optional(),
      obraId:     z.number().nullable().optional(),
      ano:        z.number().optional(),
      mes:        z.number().optional(),
      semVinculo: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db
        .select()
        .from(fiscalNotes)
        .where(and(
          eq(fiscalNotes.companyId, input.companyId),
          // Excluir NF-e recebidas (SEFAZ e XML upload) — elas aparecem na aba "NF-e Recebidas"
          notInArray(fiscalNotes.origem, ["sefaz_nfe", "xml_upload"]),
          input.status   ? eq(fiscalNotes.status, input.status) : undefined,
          input.obraId   ? eq(fiscalNotes.obraId, input.obraId) : undefined,
          input.semVinculo ? isNull(fiscalNotes.entryId) : undefined,
          input.search
            ? or(
                ilike(fiscalNotes.numeroNf, `%${input.search}%`),
                ilike(fiscalNotes.tomadorRazaoSocial, `%${input.search}%`),
                ilike(fiscalNotes.bmReferencia, `%${input.search}%`),
                ilike(fiscalNotes.descricaoServico, `%${input.search}%`),
              )
            : undefined,
        ))
        .orderBy(desc(fiscalNotes.dataEmissao), desc(fiscalNotes.id));

      let result = rows;
      if (input.ano) {
        result = result.filter(r => r.dataEmissao?.startsWith(String(input.ano)));
      }
      if (input.mes) {
        const mm = String(input.mes).padStart(2, "0");
        result = result.filter(r => r.dataEmissao?.slice(0, 7).endsWith(`-${mm}`));
      }
      // Enriquecer com dados da linha do extrato vinculada
      const stmtIds = result.filter(r => r.stmtLineId != null).map(r => r.stmtLineId!);
      const stmtMap: Record<number, { id: number; descricao: string; valor: string; data: string }> = {};
      if (stmtIds.length > 0) {
        const stmtQ = await db.$client.query(
          `SELECT id, descricao, valor::text, data::text FROM bank_statement_lines WHERE id = ANY($1::int[])`,
          [stmtIds]
        );
        for (const s of stmtQ.rows) {
          stmtMap[Number(s.id)] = { id: Number(s.id), descricao: String(s.descricao ?? ""), valor: String(s.valor ?? "0"), data: String(s.data ?? "") };
        }
      }
      return result.map(r => ({ ...r, stmtLine: r.stmtLineId ? (stmtMap[r.stmtLineId] ?? null) : null }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [row] = await db
        .select()
        .from(fiscalNotes)
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      return row;
    }),

  criar: protectedProcedure
    .input(nfInput)
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      const [row] = await db.insert(fiscalNotes).values({
        companyId:          input.companyId,
        numeroNf:           input.numeroNf,
        serie:              input.serie ?? null,
        chaveAcesso:        input.chaveAcesso ?? null,
        dataEmissao:        input.dataEmissao,
        dataCompetencia:    input.dataCompetencia ?? null,
        dataVencimento:     input.dataVencimento ?? null,
        tomadorCnpj:        input.tomadorCnpj ?? null,
        tomadorRazaoSocial: input.tomadorRazaoSocial ?? null,
        obraId:             input.obraId ?? null,
        obraNome:           input.obraNome ?? null,
        bmReferencia:       input.bmReferencia ?? null,
        descricaoServico:   input.descricaoServico ?? null,
        valorBruto:         String(input.valorBruto),
        deducoesTotal:      String(input.deducoesTotal ?? 0),
        baseCalculoIss:     input.baseCalculoIss != null ? String(input.baseCalculoIss) : null,
        aliquotaIss:        input.aliquotaIss != null ? String(input.aliquotaIss) : null,
        issRetido:          String(input.issRetido ?? 0),
        retencaoInss:       String(input.retencaoInss ?? 0),
        retencaoIrrf:       String(input.retencaoIrrf ?? 0),
        retencaoPisCofins:  String(input.retencaoPisCofins ?? 0),
        valorLiquido:       String(input.valorLiquido),
        status:             "pendente",
        entryId:            input.entryId ?? null,
        stmtLineId:         input.stmtLineId ?? null,
        arquivoUrl:         input.arquivoUrl ?? null,
        arquivoNome:        input.arquivoNome ?? null,
        observacoes:        input.observacoes ?? null,
        criadoPorId:        ctx.user?.id ?? null,
        criadoPorNome:      (ctx.user as any)?.name ?? null,
        createdAt:          now,
        updatedAt:          now,
      }).returning();
      return row;
    }),

  atualizar: protectedProcedure
    .input(nfInput.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      await db.update(fiscalNotes)
        .set({
          numeroNf:           input.numeroNf,
          serie:              input.serie ?? null,
          chaveAcesso:        input.chaveAcesso ?? null,
          dataEmissao:        input.dataEmissao,
          dataCompetencia:    input.dataCompetencia ?? null,
          dataVencimento:     input.dataVencimento ?? null,
          tomadorCnpj:        input.tomadorCnpj ?? null,
          tomadorRazaoSocial: input.tomadorRazaoSocial ?? null,
          obraId:             input.obraId ?? null,
          obraNome:           input.obraNome ?? null,
          bmReferencia:       input.bmReferencia ?? null,
          descricaoServico:   input.descricaoServico ?? null,
          valorBruto:         String(input.valorBruto),
          deducoesTotal:      String(input.deducoesTotal ?? 0),
          baseCalculoIss:     input.baseCalculoIss != null ? String(input.baseCalculoIss) : null,
          aliquotaIss:        input.aliquotaIss != null ? String(input.aliquotaIss) : null,
          issRetido:          String(input.issRetido ?? 0),
          retencaoInss:       String(input.retencaoInss ?? 0),
          retencaoIrrf:       String(input.retencaoIrrf ?? 0),
          retencaoPisCofins:  String(input.retencaoPisCofins ?? 0),
          valorLiquido:       String(input.valorLiquido),
          arquivoUrl:         input.arquivoUrl ?? null,
          arquivoNome:        input.arquivoNome ?? null,
          observacoes:        input.observacoes ?? null,
          updatedAt:          now,
        })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  vincularLancamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), entryId: z.number().nullable() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      const [cur] = await db.select({ stmtLineId: fiscalNotes.stmtLineId })
        .from(fiscalNotes)
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      const novoStatus = input.entryId != null && cur?.stmtLineId != null
        ? "conciliada"
        : input.entryId != null ? "recebida" : "pendente";
      await db.update(fiscalNotes)
        .set({ entryId: input.entryId, status: novoStatus, updatedAt: now })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  vincularExtrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), stmtLineId: z.number().nullable() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      const [cur] = await db.select({ entryId: fiscalNotes.entryId })
        .from(fiscalNotes)
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      // Vincular ao extrato → sempre conciliada; desvincular → recebida
      const novoStatus = input.stmtLineId != null
        ? "conciliada"
        : cur?.entryId != null ? "recebida" : "pendente";
      await db.update(fiscalNotes)
        .set({ stmtLineId: input.stmtLineId, status: novoStatus, updatedAt: now })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      await db.update(fiscalNotes)
        .set({ status: "cancelada", updatedAt: now })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(200),
      companyId: z.number(),
      status: z.enum(["pendente","recebida","validada","conciliada","cancelada"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const result = await db
        .update(fiscalNotes)
        .set({ status: input.status, updatedAt: new Date() } as any)
        .where(and(inArray(fiscalNotes.id, input.ids), eq(fiscalNotes.companyId, input.companyId)))
        .returning({ id: fiscalNotes.id });
      return { updated: result.length };
    }),

  conciliarMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number().int().min(2010).max(2100),
      mes: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const mm = String(input.mes).padStart(2, "0");
      const dataInicio = `${input.ano}-${mm}-01`;
      const proxMes = input.mes === 12 ? 1 : input.mes + 1;
      const proxAno = input.mes === 12 ? input.ano + 1 : input.ano;
      const dataFim = `${proxAno}-${String(proxMes).padStart(2, "0")}-01`;
      const result = await db.$client.query(
        `UPDATE fiscal_notes
            SET status = 'conciliada', updated_at = NOW()
          WHERE company_id = $1
            AND data_emissao >= $2
            AND data_emissao <  $3
            AND status != 'cancelada'
          RETURNING id`,
        [input.companyId, dataInicio, dataFim]
      );
      return { updated: result.rowCount ?? 0 };
    }),

  excluirLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(200), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const result = await db.delete(fiscalNotes)
        .where(and(inArray(fiscalNotes.id, input.ids), eq(fiscalNotes.companyId, input.companyId)))
        .returning({ id: fiscalNotes.id });
      return { deleted: result.length };
    }),

  parsePdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      pdfBase64: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const clean = input.pdfBase64.replace(/^data:[^,]*,/, "").trim();
      const buf = Buffer.from(clean, "base64");
      if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo enviado não é um PDF válido." });
      }
      const txt = await invocarIANfe(clean);
      const raw = salvageNfJson(txt);

      const cnpjRaw = raw.tomadorCnpj ? String(raw.tomadorCnpj).replace(/\D/g, "") : null;

      return {
        numeroNf:           raw.numeroNf ? String(raw.numeroNf) : "",
        serie:              raw.serie ? String(raw.serie) : null,
        chaveAcesso:        raw.chaveAcesso ? String(raw.chaveAcesso).replace(/\D/g, "") : null,
        dataEmissao:        normDataNf(raw.dataEmissao) ?? new Date().toISOString().slice(0, 10),
        dataCompetencia:    normDataNf(raw.dataCompetencia),
        dataVencimento:     normDataNf(raw.dataVencimento),
        tomadorCnpj:        cnpjRaw?.length === 14 ? cnpjRaw : null,
        tomadorRazaoSocial: raw.tomadorRazaoSocial ? String(raw.tomadorRazaoSocial).trim() : null,
        descricaoServico:   raw.descricaoServico ? String(raw.descricaoServico).trim() : null,
        valorBruto:         parseValorNf(raw.valorBruto),
        deducoesTotal:      parseValorNf(raw.deducoesTotal),
        baseCalculoIss:     raw.baseCalculoIss != null ? parseValorNf(raw.baseCalculoIss) : null,
        aliquotaIss:        raw.aliquotaIss != null ? parseFloat(String(raw.aliquotaIss)) : null,
        issRetido:          parseValorNf(raw.issRetido),
        retencaoInss:       parseValorNf(raw.retencaoInss),
        retencaoIrrf:       parseValorNf(raw.retencaoIrrf),
        retencaoPisCofins:  parseValorNf(raw.retencaoPisCofins),
        valorLiquido:       parseValorNf(raw.valorLiquido),
      };
    }),

  listByEntry: protectedProcedure
    .input(z.object({ companyId: z.number(), entryId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select().from(fiscalNotes)
        .where(and(eq(fiscalNotes.companyId, input.companyId), eq(fiscalNotes.entryId, input.entryId)));
    }),

  // ── Panorama Fiscal: cruzamento NF-e × OC × banco ─────────────────────────
  getPanoramaFiscal: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().min(0).max(12),   // 0 = ano todo
      ano: z.number().min(2018).max(2040),
    }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const { companyId, mes, ano } = input;

      // mes=0 → ano todo; mes=1..12 → mês específico
      const di = mes === 0 ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, "0")}-01`;
      const mesProx = mes === 0 ? 1 : (mes === 12 ? 1 : mes + 1);
      const anoProx = mes === 0 ? ano + 1 : (mes === 12 ? ano + 1 : ano);
      const df = mes === 0 ? `${ano + 1}-01-01` : `${anoProx}-${String(mesProx).padStart(2, "0")}-01`;

      // 1. NFS-e emitidas do período
      const nfseQ = await db.$client.query(`
        SELECT id, numero_nf, tomador_razao_social, tomador_cnpj,
               valor_bruto, valor_liquido, data_emissao, status, origem
        FROM fiscal_notes
        WHERE company_id = $1
          AND data_emissao >= $2 AND data_emissao < $3
          AND origem LIKE 'nfse_%'
          AND status != 'cancelada'
        ORDER BY data_emissao DESC
      `, [companyId, di, df]);

      // 2. NF-e recebidas do período
      const nfeQ = await db.$client.query(`
        SELECT id, numero_nf, emitente_cnpj, emitente_nome,
               valor_bruto, data_emissao, status, chave_acesso
        FROM fiscal_notes
        WHERE company_id = $1
          AND data_emissao >= $2 AND data_emissao < $3
          AND (origem = 'sefaz_nfe' OR origem = 'xml_upload')
          AND status != 'cancelada'
        ORDER BY data_emissao DESC
      `, [companyId, di, df]);

      // 3. Linhas de extrato bancário do período (com vínculo a NF via stmt_line_id)
      const bankQ = await db.$client.query(`
        SELECT bsl.id, bsl.data, bsl.descricao, bsl.valor, bsl.tipo, bsl.conciliado,
          COALESCE(cba.apelido, cba.banco, '') AS conta_nome,
          COALESCE(cba.agencia, '') AS conta_agencia,
          COALESCE(cba.conta, '') AS conta_numero,
          (SELECT fn.id FROM fiscal_notes fn
           WHERE fn.company_id = $1
             AND (fn.stmt_line_id = bsl.id
                  OR (bsl.entry_id IS NOT NULL AND fn.entry_id = bsl.entry_id))
           ORDER BY (fn.stmt_line_id IS NOT NULL) DESC LIMIT 1) AS fn_id,
          (SELECT fn.numero_nf FROM fiscal_notes fn
           WHERE fn.company_id = $1
             AND (fn.stmt_line_id = bsl.id
                  OR (bsl.entry_id IS NOT NULL AND fn.entry_id = bsl.entry_id))
           ORDER BY (fn.stmt_line_id IS NOT NULL) DESC LIMIT 1) AS fn_numero
        FROM bank_statement_lines bsl
        LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
        WHERE bsl.company_id = $1
          AND bsl.data >= $2 AND bsl.data < $3
          AND bsl.excluido_em IS NULL
          AND bsl.desconsiderado_em IS NULL
        ORDER BY conta_nome ASC, bsl.data ASC
        LIMIT 600
      `, [companyId, di, df]);

      // 4. Ordens de Compra do período (com CNPJ do fornecedor e número da NF se preenchido)
      // NOTA: as OCs do sistema ficam em `compras_ordens`, NÃO em `purchase_orders`
      const ocQ = await db.$client.query(`
        SELECT co.id,
               co.numero_oc               AS numero,
               co.fornecedor_nome         AS supplier_nome,
               co.total                   AS valor_total,
               co.status,
               co.created_at,
               co.data_entrega_real       AS data_entrega,
               co.numero_nf               AS numero_nf_oc,
               COALESCE(o.nome, '')       AS obra_nome,
               COALESCE(co.tipo, 'compra') AS tipo,
               COALESCE(f.cnpj, '')       AS supplier_cnpj,
               COALESCE(f.razao_social, co.fornecedor_nome, '') AS supplier_razao
        FROM compras_ordens co
        LEFT JOIN fornecedores f ON f.id = co.fornecedor_id AND f.company_id = $1
        LEFT JOIN obras o ON o.id = co.obra_id
        WHERE co.company_id = $1
          AND co.status NOT IN ('cancelada', 'rascunho')
          AND co.created_at >= $2 AND co.created_at < $3
        ORDER BY co.created_at DESC
        LIMIT 300
      `, [companyId, di, df]);

      const nfseList: any[] = nfseQ.rows;
      const nfeList: any[]  = nfeQ.rows;
      const bankList: any[] = bankQ.rows;
      const ocList: any[]   = ocQ.rows;

      // Cross: OC × NF-e — match em camadas, sem fallback genérico
      // Camada 1: match direto pelo número da NF gravado na OC (definitivo)
      // Camada 2: CNPJ + valor ±10% + data ±90 dias
      // Regra: cada NF-e só pode ser vinculada a UMA OC (first-come-first-served por valor)

      // Índices de NF-e
      const nfeByCnpj = new Map<string, any[]>();
      const nfeByNumero = new Map<string, any>();
      for (const nfe of nfeList) {
        const cnpj = (nfe.emitente_cnpj ?? "").replace(/\D/g, "");
        if (cnpj) {
          if (!nfeByCnpj.has(cnpj)) nfeByCnpj.set(cnpj, []);
          nfeByCnpj.get(cnpj)!.push(nfe);
        }
        const num = (nfe.numero_nf ?? "").toString().replace(/^0+/, "").trim();
        if (num) nfeByNumero.set(num, nfe);
      }

      const ocsComNota: any[] = [];
      const ocsSemNota: any[] = [];
      const matchedNfeIds = new Set<number>();

      for (const oc of ocList) {
        let match: any = null;

        // Camada 1: número da NF direto (campo preenchido ao receber a OC)
        if (oc.numero_nf_oc) {
          const numNorm = (oc.numero_nf_oc as string).replace(/^0+/, "").trim();
          const candidate = nfeByNumero.get(numNorm);
          if (candidate && !matchedNfeIds.has(candidate.id)) {
            match = candidate;
          }
        }

        // Camada 2: CNPJ + valor ±10% + janela de ±90 dias
        if (!match) {
          const cnpj = (oc.supplier_cnpj ?? "").replace(/\D/g, "");
          const candidates = cnpj ? (nfeByCnpj.get(cnpj) ?? []) : [];
          const ocVal = parseFloat(oc.valor_total ?? "0");
          const ocRefDate = new Date(oc.data_entrega ?? oc.created_at).getTime();
          match = candidates.find(nfe => {
            if (matchedNfeIds.has(nfe.id)) return false;
            const nfeVal = parseFloat(nfe.valor_bruto ?? "0");
            if (ocVal <= 0 || nfeVal <= 0) return false;
            const pct = Math.abs(ocVal - nfeVal) / Math.max(ocVal, nfeVal);
            if (pct > 0.10) return false; // ±10% de tolerância
            const nfeDate = new Date(nfe.data_emissao).getTime();
            const diffDays = Math.abs(ocRefDate - nfeDate) / 86_400_000;
            return diffDays <= 90;
          }) ?? null;
        }

        if (match) {
          matchedNfeIds.add(match.id);
          ocsComNota.push({ ...oc, nfeNumero: match.numero_nf, nfeValor: match.valor_bruto, nfeEmissao: match.data_emissao });
        } else {
          ocsSemNota.push(oc);
        }
      }
      // NF-e que não foram casadas com nenhuma OC do período
      const nfeSemOc = nfeList.filter((nfe: any) => !matchedNfeIds.has(nfe.id));

      // Padrões de movimentação interna / bancária que NÃO exigem cobertura por NF-e.
      // Espelha os mesmos padrões de _INTERNO_PATTERNS usados na Conciliação (financial.ts).
      const _PANORAMA_INTERNO_RE = new RegExp(
        [
          "cheque devol", "dev.*cheq",          // cheque devolvido (qualquer motivo)
          "transfer.*inter|transf.*prop",        // transferência interna / própria
          "ted.*prop|pix.*prop",                 // TED/PIX para conta própria
          "saldo anterior",                      // saldo inicial
          "tarifa banc|tarifa serv|tarifa cobr", // tarifas bancárias
          "encargo banc|juros banc|juros mora",  // encargos
          "iof\\b|cpmf",                         // tributos bancários
          "pagto.*boleto.*prop",                 // boleto próprio
        ].join("|"),
        "i"
      );
      const _isInterno = (b: any) =>
        _PANORAMA_INTERNO_RE.test((b.descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

      // Entradas/saídas bancárias com/sem NF
      const bankCreditos = bankList.filter((b: any) => b.tipo === "credito");
      // Débitos REAIS = excluir movimentações internas (cheque devolvido, tarifas, etc.)
      const bankDebitos       = bankList.filter((b: any) => b.tipo === "debito");
      const bankDebitosReais  = bankDebitos.filter((b: any) => !_isInterno(b));
      const bankInternos      = bankDebitos.filter((b: any) =>  _isInterno(b));
      const entradasComNota = bankCreditos.filter((b: any) => b.fn_id != null);
      const entradasSemNota = bankCreditos.filter((b: any) => b.fn_id == null);
      const saidasComNota   = bankDebitosReais.filter((b: any) => b.fn_id != null);
      const saidasSemNota   = bankDebitosReais.filter((b: any) => b.fn_id == null);

      const sumV = (arr: any[], f = "valor") => arr.reduce((s: number, r: any) => s + Math.abs(parseFloat(r[f] ?? "0")), 0);

      const totNfse        = sumV(nfseList, "valor_bruto");
      const totNfe         = sumV(nfeList, "valor_bruto");
      const totCreditos    = sumV(bankCreditos);
      // Débitos REAIS (excluindo cheque devolvido, tarifas, movimentações internas)
      const totDebitosReais = sumV(bankDebitosReais);
      const totInternos    = sumV(bankInternos);
      const totOcs         = sumV(ocList, "valor_total");
      const totOcsNota     = sumV(ocsComNota, "valor_total");
      const totSaiNota     = sumV(saidasComNota);

      return {
        periodo: { mes, ano },
        resumo: {
          nfseEmitidas:        { qtd: nfseList.length, total: totNfse },
          nfeRecebidas:        { qtd: nfeList.length,  total: totNfe  },
          entradasBancarias:   { qtd: bankCreditos.length,    total: totCreditos     },
          saidasBancarias:     { qtd: bankDebitosReais.length, total: totDebitosReais },
          saidasInternas:      { qtd: bankInternos.length,    total: totInternos     },
          totalOcs:            { qtd: ocList.length,   total: totOcs  },
          coberturaNfseReceita: totCreditos > 0 ? Math.min(100, Math.round(totNfse / totCreditos * 100)) : null,
          coberturaOcNfe:       totOcs > 0 ? Math.round(totOcsNota / totOcs * 100) : null,
          // Ratio de volume: NF-e recebidas / débitos reais (excl. cheque devolvido/tarifas)
          coberturaSaidaNfe:    totDebitosReais > 0 ? Math.min(100, Math.round(totNfe / totDebitosReais * 100)) : null,
        },
        nfseEmitidas: nfseList,
        nfeRecebidas: nfeList,
        ocsComNota,
        ocsSemNota,
        nfeSemOc,
        entradasComNota,
        entradasSemNota,
        saidasComNota,
        saidasSemNota,
      };
    }),

  /** Retorna status de cada mês do ano: "ok" | "parcial" | "none"
   *  "ok"      = tem NFS-e emitidas E NF-e recebidas
   *  "parcial" = tem apenas um dos dois
   *  "none"    = nenhum dado fiscal
   */
  getMesesStatus: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().min(2018).max(2040) }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const { companyId, ano } = input;
      const rows = await db.$client.query<{ mes: number; tipo: string; cnt: number }>(`
        SELECT
          EXTRACT(MONTH FROM data_emissao)::int AS mes,
          CASE
            WHEN origem LIKE 'nfse_%' THEN 'nfse'
            ELSE 'nfe'
          END AS tipo,
          COUNT(*)::int AS cnt
        FROM fiscal_notes
        WHERE company_id = $1
          AND data_emissao >= $2 AND data_emissao < $3
          AND status != 'cancelada'
        GROUP BY 1, 2
      `, [companyId, `${ano}-01-01`, `${ano + 1}-01-01`]);

      const result: Record<number, "ok" | "parcial" | "none"> = {};
      for (let m = 1; m <= 12; m++) result[m] = "none";
      for (const r of rows.rows) {
        const cur = result[r.mes];
        if (r.tipo === "nfse") {
          result[r.mes] = cur === "parcial" || cur === "ok" ? "ok" : "parcial";
          if (cur === "none") result[r.mes] = "parcial";
          if (cur === "parcial") result[r.mes] = "ok";
        } else {
          if (cur === "none") result[r.mes] = "parcial";
          if (cur === "parcial") result[r.mes] = "ok";
        }
      }
      return result as Record<number, "ok" | "parcial" | "none">;
    }),

  getMultiYearSeries: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      anos: z.number().min(2).max(10).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const { companyId } = input;
      const qtdAnos = Math.min(10, Math.max(2, input.anos ?? 5));
      const anoFim = new Date().getFullYear();
      const anoIni = anoFim - qtdAnos + 1;

      const rows = await db.$client.query(`
        SELECT
          EXTRACT(YEAR FROM data_emissao)::int AS ano,
          SUM(CASE WHEN (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
              THEN COALESCE(valor_bruto::numeric, 0) ELSE 0 END) AS nfe_total,
          COUNT(CASE WHEN (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
              THEN 1 END)::int AS nfe_count,
          SUM(CASE WHEN origem LIKE 'nfse_%' AND status != 'cancelada'
              THEN COALESCE(valor_bruto::numeric, 0) ELSE 0 END) AS nfse_total,
          COUNT(CASE WHEN origem LIKE 'nfse_%' AND status != 'cancelada'
              THEN 1 END)::int AS nfse_count
        FROM fiscal_notes
        WHERE company_id = $1
          AND data_emissao >= $2 AND data_emissao < $3
          AND data_emissao IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `, [companyId, `${anoIni}-01-01`, `${anoFim + 1}-01-01`]);

      const byAno = new Map<number, any>();
      for (const r of rows.rows) byAno.set(Number(r.ano), r);

      const series = [];
      for (let a = anoIni; a <= anoFim; a++) {
        const r = byAno.get(a);
        series.push({
          ano: a,
          nfeTotal:  parseFloat(r?.nfe_total  ?? "0") || 0,
          nfeCount:  parseInt(r?.nfe_count   ?? "0") || 0,
          nfseTotal: parseFloat(r?.nfse_total ?? "0") || 0,
          nfseCount: parseInt(r?.nfse_count  ?? "0") || 0,
        });
      }
      return series;
    }),

  getQuarterlySeries: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      anos: z.number().min(2).max(10).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const { companyId } = input;
      const qtdAnos = Math.min(10, Math.max(2, input.anos ?? 5));
      const anoFim = new Date().getFullYear();
      const anoIni = anoFim - qtdAnos + 1;

      const rows = await db.$client.query(`
        SELECT
          EXTRACT(YEAR    FROM data_emissao)::int AS ano,
          EXTRACT(QUARTER FROM data_emissao)::int AS tri,
          SUM(CASE WHEN origem LIKE 'nfse_%' AND status != 'cancelada'
              THEN COALESCE(valor_bruto::numeric, 0) ELSE 0 END) AS nfse_total,
          COUNT(CASE WHEN origem LIKE 'nfse_%' AND status != 'cancelada'
              THEN 1 END)::int AS nfse_count,
          SUM(CASE WHEN (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
              THEN COALESCE(valor_bruto::numeric, 0) ELSE 0 END) AS nfe_total
        FROM fiscal_notes
        WHERE company_id = $1
          AND data_emissao >= $2 AND data_emissao < $3
          AND data_emissao IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1, 2
      `, [companyId, `${anoIni}-01-01`, `${anoFim + 1}-01-01`]);

      // pivot: { ano, q1Nfse, q2Nfse, q3Nfse, q4Nfse, q1Nfe, ... }
      const byAno = new Map<number, { nfse: number[]; nfe: number[] }>();
      for (let a = anoIni; a <= anoFim; a++) byAno.set(a, { nfse: [0,0,0,0], nfe: [0,0,0,0] });
      for (const r of rows.rows) {
        const a = Number(r.ano);
        const t = Number(r.tri) - 1; // 0..3
        const entry = byAno.get(a);
        if (entry && t >= 0 && t < 4) {
          entry.nfse[t] += parseFloat(r.nfse_total ?? "0") || 0;
          entry.nfe[t]  += parseFloat(r.nfe_total  ?? "0") || 0;
        }
      }

      const anos = Array.from({ length: qtdAnos }, (_, i) => anoIni + i);
      // per-quarter rows for grouped BarChart
      const quarters = ["Q1","Q2","Q3","Q4"].map((label, qi) => {
        const entry: Record<string, number | string> = { trimestre: label };
        for (const a of anos) {
          const d = byAno.get(a)!;
          entry[`nfse_${a}`] = d.nfse[qi];
          entry[`nfe_${a}`]  = d.nfe[qi];
        }
        return entry;
      });

      // annual totals for context
      const anuais = anos.map(a => {
        const d = byAno.get(a)!;
        return { ano: a, nfseTotal: d.nfse.reduce((s,v)=>s+v,0), nfeTotal: d.nfe.reduce((s,v)=>s+v,0) };
      });

      return { anos, quarters, anuais };
    }),

  getAnalyseTributaria: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().min(0).max(12),
      ano: z.number().min(2018).max(2040),
    }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const di = mes === 0 ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, "0")}-01`;
      const mesProx = mes === 0 ? 1 : (mes === 12 ? 1 : mes + 1);
      const anoProx = mes === 0 ? ano + 1 : (mes === 12 ? ano + 1 : ano);
      const df = mes === 0 ? `${ano + 1}-01-01` : `${anoProx}-${String(mesProx).padStart(2, "0")}-01`;

      const [nfseQ, nfeQ, mesQ] = await Promise.all([
        // Agregados de impostos das NFS-e emitidas
        db.$client.query(`
          SELECT
            COUNT(*)::int                                           AS qtd,
            SUM(valor_bruto::numeric)                              AS bruto,
            SUM(valor_liquido::numeric)                            AS liquido,
            SUM(COALESCE(deducoes_total::numeric,0))               AS deducoes,
            SUM(COALESCE(base_calculo_iss::numeric,0))             AS base_iss,
            SUM(COALESCE(iss_retido::numeric,0))                   AS iss,
            SUM(COALESCE(retencao_inss::numeric,0))                AS inss,
            SUM(COALESCE(retencao_irrf::numeric,0))                AS irrf,
            SUM(COALESCE(retencao_csll::numeric,0))                AS csll,
            SUM(COALESCE(retencao_pis::numeric,0)
              + COALESCE(retencao_cofins::numeric,0)
              + COALESCE(retencao_pis_cofins::numeric,0))          AS pis_cofins,
            SUM(COALESCE(retencao_outras::numeric,0))              AS outras,
            COUNT(CASE WHEN optante_simples = true THEN 1 END)::int AS simples_count,
            COUNT(CASE WHEN tributada = true THEN 1 END)::int       AS tributada_count
          FROM fiscal_notes
          WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
            AND origem LIKE 'nfse_%' AND status != 'cancelada'
        `, [companyId, di, df]),

        // KPIs de NF-e recebidas
        db.$client.query(`
          SELECT
            COUNT(*)::int                                              AS qtd,
            SUM(valor_bruto::numeric)                                  AS total,
            AVG(valor_bruto::numeric)                                  AS ticket_medio,
            COUNT(DISTINCT NULLIF(
              regexp_replace(COALESCE(emitente_cnpj,''),'[^0-9]','','g'),''
            ))                                                         AS fornecedores_unicos,
            COUNT(CASE WHEN status = 'pendente' THEN 1 END)::int       AS pendentes,
            COUNT(CASE WHEN entry_id IS NOT NULL THEN 1 END)::int      AS com_lancamento,
            MIN(valor_bruto::numeric)                                  AS menor_nf,
            MAX(valor_bruto::numeric)                                  AS maior_nf
          FROM fiscal_notes
          WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
            AND (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
        `, [companyId, di, df]),

        // Evolução mensal de impostos (só quando ano todo, mes=0)
        mes === 0 ? db.$client.query(`
          SELECT
            EXTRACT(MONTH FROM data_emissao)::int                      AS mes,
            SUM(COALESCE(iss_retido::numeric,0))                       AS iss,
            SUM(COALESCE(retencao_inss::numeric,0))                    AS inss,
            SUM(COALESCE(retencao_irrf::numeric,0))                    AS irrf,
            SUM(COALESCE(retencao_csll::numeric,0))                    AS csll,
            SUM(COALESCE(retencao_pis::numeric,0)
              + COALESCE(retencao_cofins::numeric,0)
              + COALESCE(retencao_pis_cofins::numeric,0))              AS pis_cofins,
            SUM(valor_bruto::numeric)                                  AS bruto
          FROM fiscal_notes
          WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
            AND origem LIKE 'nfse_%' AND status != 'cancelada'
          GROUP BY 1 ORDER BY 1
        `, [companyId, di, df]) : Promise.resolve({ rows: [] }),
      ]);

      const n = nfseQ.rows[0] ?? {};
      const f = nfeQ.rows[0] ?? {};
      const p = (v: any) => parseFloat(v ?? "0") || 0;
      const ii = (v: any) => parseInt(v ?? "0") || 0;

      const iss = p(n.iss), inss = p(n.inss), irrf = p(n.irrf);
      const csll = p(n.csll), pisCofins = p(n.pis_cofins), outras = p(n.outras);
      const totalRetencoes = iss + inss + irrf + csll + pisCofins + outras;
      const bruto = p(n.bruto);
      const cargaEfetiva = bruto > 0 ? (totalRetencoes / bruto) * 100 : 0;

      const MESES_ABREV_BK = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const mensal = Array.from({ length: 12 }, (_, i) => {
        const r = mesQ.rows.find((x: any) => Number(x.mes) === i + 1);
        return {
          mes: MESES_ABREV_BK[i],
          iss:      p(r?.iss),
          inss:     p(r?.inss),
          irrf:     p(r?.irrf),
          csll:     p(r?.csll),
          pisCofins:p(r?.pis_cofins),
          bruto:    p(r?.bruto),
        };
      });

      return {
        nfse: {
          qtd: ii(n.qtd), bruto, liquido: p(n.liquido),
          deducoes: p(n.deducoes), baseIss: p(n.base_iss),
          iss, inss, irrf, csll, pisCofins, outras,
          totalRetencoes, cargaEfetiva,
          simplesCount: ii(n.simples_count), tributadaCount: ii(n.tributada_count),
          mensal,
        },
        nfe: {
          qtd: ii(f.qtd), total: p(f.total), ticketMedio: p(f.ticket_medio),
          fornecedoresUnicos: ii(f.fornecedores_unicos),
          pendentes: ii(f.pendentes), comLancamento: ii(f.com_lancamento),
          menorNf: p(f.menor_nf), maiorNf: p(f.maior_nf),
        },
      };
    }),

  sincronizarComExtrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
      tipo: z.enum(["emitida", "recebida"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const result = await sincronizarNfsPeriodo(
        input.companyId,
        input.dataInicio,
        input.dataFim,
        input.tipo,
      );
      return result;
    }),

  obterSugestoes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
      tipo: z.enum(["emitida", "recebida"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      return obterSugestoesPeriodo(
        input.companyId,
        input.dataInicio,
        input.dataFim,
        input.tipo,
      );
    }),
});
