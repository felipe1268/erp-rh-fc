import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { fiscalNotes } from "../../drizzle/schema";
import { eq, and, desc, ilike, or, isNull, notInArray, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getUserCompanyLinks } from "../db";
import { invokeGeminiVision, invokeAnthropicVision } from "../_core/llm";

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
      return result;
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
      const novoStatus = input.stmtLineId != null && cur?.entryId != null
        ? "conciliada"
        : input.stmtLineId != null ? "recebida"
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
          (SELECT fn.id      FROM fiscal_notes fn WHERE fn.stmt_line_id = bsl.id AND fn.company_id = $1 LIMIT 1) AS fn_id,
          (SELECT fn.numero_nf FROM fiscal_notes fn WHERE fn.stmt_line_id = bsl.id AND fn.company_id = $1 LIMIT 1) AS fn_numero
        FROM bank_statement_lines bsl
        LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
        WHERE bsl.company_id = $1
          AND bsl.data >= $2 AND bsl.data < $3
          AND bsl.excluido_em IS NULL
        ORDER BY conta_nome ASC, bsl.data ASC
        LIMIT 600
      `, [companyId, di, df]);

      // 4. Ordens de Compra do período (com CNPJ do fornecedor)
      // NOTA: as OCs do sistema ficam em `compras_ordens`, NÃO em `purchase_orders`
      const ocQ = await db.$client.query(`
        SELECT co.id,
               co.numero_oc               AS numero,
               co.fornecedor_nome         AS supplier_nome,
               co.total                   AS valor_total,
               co.status,
               co.created_at,
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

      // Cross: OC × NF-e por CNPJ + valor ±30%
      const nfeByCnpj = new Map<string, any[]>();
      for (const nfe of nfeList) {
        const cnpj = (nfe.emitente_cnpj ?? "").replace(/\D/g, "");
        if (!cnpj) continue;
        if (!nfeByCnpj.has(cnpj)) nfeByCnpj.set(cnpj, []);
        nfeByCnpj.get(cnpj)!.push(nfe);
      }

      const ocsComNota: any[] = [];
      const ocsSemNota: any[] = [];
      const matchedNfeIds = new Set<number>();
      for (const oc of ocList) {
        const cnpj = (oc.supplier_cnpj ?? "").replace(/\D/g, "");
        const matches = cnpj ? (nfeByCnpj.get(cnpj) ?? []) : [];
        const ocVal = parseFloat(oc.valor_total ?? "0");
        const match = matches.find(nfe => {
          const nfeVal = parseFloat(nfe.valor_bruto ?? "0");
          if (ocVal <= 0 || nfeVal <= 0) return false;
          return Math.abs(ocVal - nfeVal) / Math.max(ocVal, nfeVal) <= 0.30;
        }) ?? (matches.length > 0 ? matches[0] : null);

        if (match) {
          matchedNfeIds.add(match.id);
          ocsComNota.push({ ...oc, nfeNumero: match.numero_nf, nfeValor: match.valor_bruto, nfeEmissao: match.data_emissao });
        } else {
          ocsSemNota.push(oc);
        }
      }
      // NF-e que não foram casadas com nenhuma OC do período
      const nfeSemOc = nfeList.filter((nfe: any) => !matchedNfeIds.has(nfe.id));

      // Entradas/saídas bancárias com/sem NF
      const bankCreditos = bankList.filter((b: any) => b.tipo === "credito");
      const bankDebitos  = bankList.filter((b: any) => b.tipo === "debito");
      const entradasComNota = bankCreditos.filter((b: any) => b.fn_id != null);
      const entradasSemNota = bankCreditos.filter((b: any) => b.fn_id == null);
      const saidasComNota   = bankDebitos.filter((b: any) => b.fn_id != null);
      const saidasSemNota   = bankDebitos.filter((b: any) => b.fn_id == null);

      const sumV = (arr: any[], f = "valor") => arr.reduce((s: number, r: any) => s + Math.abs(parseFloat(r[f] ?? "0")), 0);

      const totNfse       = sumV(nfseList, "valor_bruto");
      const totNfe        = sumV(nfeList, "valor_bruto");
      const totCreditos   = sumV(bankCreditos);
      const totDebitos    = sumV(bankDebitos);
      const totOcs        = sumV(ocList, "valor_total");
      const totOcsNota    = sumV(ocsComNota, "valor_total");
      const totSaiNota    = sumV(saidasComNota);

      return {
        periodo: { mes, ano },
        resumo: {
          nfseEmitidas:        { qtd: nfseList.length, total: totNfse },
          nfeRecebidas:        { qtd: nfeList.length,  total: totNfe  },
          entradasBancarias:   { qtd: bankCreditos.length, total: totCreditos },
          saidasBancarias:     { qtd: bankDebitos.length,  total: totDebitos  },
          totalOcs:            { qtd: ocList.length,   total: totOcs  },
          coberturaNfseReceita: totCreditos > 0 ? Math.min(100, Math.round(totNfse / totCreditos * 100)) : null,
          coberturaOcNfe:       totOcs > 0 ? Math.round(totOcsNota / totOcs * 100) : null,
          // Ratio de volume: NF-e recebidas / débitos bancários (mesmo padrão de coberturaNfseReceita)
          // Não depende de conciliação manual (fn_id); reflete cobertura documental real.
          coberturaSaidaNfe:    totDebitos > 0 ? Math.min(100, Math.round(totNfe / totDebitos * 100)) : null,
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
          // se já era parcial por nfe → agora ok
          if (cur === "parcial") result[r.mes] = "ok";
        } else {
          if (cur === "none") result[r.mes] = "parcial";
          if (cur === "parcial") result[r.mes] = "ok";
        }
      }
      return result as Record<number, "ok" | "parcial" | "none">;
    }),
});
