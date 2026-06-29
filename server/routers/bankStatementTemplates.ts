// ─────────────────────────────────────────────────────────────────────────────
// Router: Templates de Extrato Bancário
// Rev. 3879 — Adicionada mutation analisarPdf: IA lê o PDF, identifica o banco
// e propõe keywords/skip/instruções automaticamente. Coluna revisao adicionada
// para rastreio ISO 9001. ZERO DELETE.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getUserCompanyLinks } from "../db";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeGeminiVision, invokeAnthropicVision } from "../_core/llm";

// ── tenant guard ─────────────────────────────────────────────────────────────

async function assertCompanyAccess(ctx: { user: { id: number; role?: string | null } }, companyId: number) {
  if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctx.user.role === "admin" || ctx.user.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctx.user.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!new Set<number>(allowedIds).has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Sem acesso a esta empresa.` });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function getTemplates(companyId: number) {
  const db = await getDb();
  const rows = await db.execute(sql`
    SELECT id, company_id, banco_nome, palavras_chave, skip_prefixes,
           instrucoes_ia, ativo, revisao, notas_revisao,
           criado_em, atualizado_em, criado_por_id, criado_por_nome
    FROM bank_statement_templates
    WHERE company_id = ${companyId}
    ORDER BY banco_nome ASC
  `);
  return (rows.rows ?? []).map(mapRow);
}

function mapRow(r: any) {
  return {
    id:             r.id as number,
    companyId:      r.company_id as number,
    bancoNome:      r.banco_nome as string,
    palavrasChave:  safeJson(r.palavras_chave, []) as string[],
    skipPrefixes:   safeJson(r.skip_prefixes,  []) as string[],
    instrucoesIa:   (r.instrucoes_ia as string | null) ?? "",
    ativo:          (r.ativo as number) === 1,
    revisao:        (r.revisao as number) ?? 1,
    notasRevisao:   (r.notas_revisao as string | null) ?? "",
    criadoEm:       r.criado_em as string,
    atualizadoEm:   r.atualizado_em as string,
    criadoPorId:    r.criado_por_id as number | null,
    criadoPorNome:  r.criado_por_nome as string | null,
  };
}

function safeJson(v: any, fallback: any) {
  if (!v) return fallback;
  try { return JSON.parse(String(v)); } catch { return fallback; }
}

// ── prompt de análise de formato ─────────────────────────────────────────────

const PROMPT_ANALISAR_FORMATO = `Você é um especialista em extratos bancários brasileiros.
Analise o PDF de extrato bancário anexo e retorne SOMENTE um JSON descrevendo o FORMATO do extrato (não as transações).

JSON de saída (responda APENAS com este JSON, sem markdown, sem texto extra):
{
  "bancoNome": "Nome do banco + tipo de layout (ex: Caixa Econômica Federal — Extrato Online, Santander — Internet Banking Empresarial PJ, Banco do Brasil — Extrato Web)",
  "palavrasChave": ["texto1", "texto2", "texto3"],
  "skipPrefixes": ["prefixo1", "prefixo2"],
  "instrucoesIa": "Instruções completas aqui"
}

Regras:
• bancoNome: identifique banco + tipo de extrato. Seja específico (ex: não só "Santander", mas "Santander — Internet Banking PJ").
• palavrasChave: 3–6 textos ÚNICOS que aparecem no cabeçalho/rodapé e diferenciam ESTE layout de outros bancos. NUNCA inclua número de conta ou agência (são específicos de cliente).
• skipPrefixes: início exato de linhas que NÃO são transações: saldos diários, saldos anteriores, títulos de coluna, totalizadores, avisos. Inclua variações ortográficas que você viu.
• instrucoesIa: descreva em detalhe como a IA deve extrair transações deste formato específico:
  - Formato da data (DD/MM/AAAA, DD/MM, AAAA-MM-DD, etc.)
  - Como débitos são marcados (ex: "- R$", prefixo "D", coluna separada, etc.)
  - Como créditos são marcados (ex: "R$" sem sinal, prefixo "C", etc.)
  - Estrutura geral das colunas (ex: Data | Histórico | Valor | Saldo)
  - Qualquer particularidade deste banco que pode gerar erro de leitura`;

const SCHEMA_ANALISE = {
  type: "object",
  properties: {
    bancoNome:     { type: "string" },
    palavrasChave: { type: "array", items: { type: "string" } },
    skipPrefixes:  { type: "array", items: { type: "string" } },
    instrucoesIa:  { type: "string" },
  },
} as const;

function salvageJson(text: string): any {
  if (!text) throw new Error("IA não retornou conteúdo.");
  try { return JSON.parse(text); } catch { /* segue */ }
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start > -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* segue */ }
  }
  throw new Error("Não consegui interpretar o JSON da IA.");
}

async function chamarIAFormato(base64: string): Promise<{
  bancoNome: string;
  palavrasChave: string[];
  skipPrefixes: string[];
  instrucoesIa: string;
}> {
  let geminiErr: any = null;
  if (process.env.GOOGLE_API_KEY) {
    try {
      const txt = await invokeGeminiVision({
        prompt: PROMPT_ANALISAR_FORMATO,
        base64,
        mimeType: "application/pdf",
        responseSchema: SCHEMA_ANALISE as any,
        maxTokens: 4096,
        thinking: "off",
      });
      const raw = salvageJson(txt);
      if (raw?.bancoNome) return normalizeResult(raw);
    } catch (e: any) {
      geminiErr = e;
      console.warn(`[analisarPdf] Gemini falhou, tentando Anthropic: ${e?.message || e}`);
    }
  }
  try {
    const txt = await invokeAnthropicVision({
      prompt: PROMPT_ANALISAR_FORMATO + "\n\nResponda SOMENTE com JSON válido.",
      files: [{ base64, mimeType: "application/pdf" }],
      maxTokens: 4096,
    });
    const raw = salvageJson(txt);
    if (raw?.bancoNome) return normalizeResult(raw);
    throw new Error("IA não retornou bancoNome.");
  } catch (e: any) {
    if (geminiErr) throw geminiErr;
    throw e;
  }
}

function normalizeResult(raw: any) {
  const toStrArr = (v: any) => Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  return {
    bancoNome:     String(raw.bancoNome || "").trim(),
    palavrasChave: toStrArr(raw.palavrasChave),
    skipPrefixes:  toStrArr(raw.skipPrefixes),
    instrucoesIa:  String(raw.instrucoesIa || "").trim(),
  };
}

// ── schema de input ──────────────────────────────────────────────────────────

const templateInput = z.object({
  companyId:     z.number(),
  bancoNome:     z.string().min(1).max(100),
  palavrasChave: z.array(z.string()).default([]),
  skipPrefixes:  z.array(z.string()).default([]),
  instrucoesIa:  z.string().default(""),
  notasRevisao:  z.string().optional(),
  ativo:         z.boolean().default(true),
});

// ── router ───────────────────────────────────────────────────────────────────

export const bankStatementTemplatesRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      return getTemplates(input.companyId);
    }),

  create: protectedProcedure
    .input(templateInput)
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = await getDb();
      const res = await db.execute(sql`
        INSERT INTO bank_statement_templates
          (company_id, banco_nome, palavras_chave, skip_prefixes,
           instrucoes_ia, ativo, revisao, notas_revisao,
           criado_por_id, criado_por_nome)
        VALUES (
          ${input.companyId},
          ${input.bancoNome},
          ${JSON.stringify(input.palavrasChave)},
          ${JSON.stringify(input.skipPrefixes)},
          ${input.instrucoesIa || null},
          ${input.ativo ? 1 : 0},
          1,
          ${input.notasRevisao || "Criado automaticamente pela análise de IA."},
          ${(ctx.user as any).id ?? null},
          ${(ctx.user as any).name ?? (ctx.user as any).username ?? null}
        )
        RETURNING id
      `);
      const id = (res.rows?.[0] as any)?.id as number;
      return { id };
    }),

  update: protectedProcedure
    .input(templateInput.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = await getDb();
      const check = await db.execute(sql`
        SELECT id, revisao FROM bank_statement_templates
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      if (!check.rows?.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });
      }
      const revisaoAtual = ((check.rows[0] as any)?.revisao as number) ?? 1;
      await db.execute(sql`
        UPDATE bank_statement_templates SET
          banco_nome     = ${input.bancoNome},
          palavras_chave = ${JSON.stringify(input.palavrasChave)},
          skip_prefixes  = ${JSON.stringify(input.skipPrefixes)},
          instrucoes_ia  = ${input.instrucoesIa || null},
          ativo          = ${input.ativo ? 1 : 0},
          revisao        = ${revisaoAtual + 1},
          notas_revisao  = ${input.notasRevisao ?? null},
          atualizado_em  = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true, revisao: revisaoAtual + 1 };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM bank_statement_templates
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  // Rev. 3879 — IA analisa o PDF e propõe um template de extrato automaticamente.
  // Recebe o PDF em base64, chama Gemini Vision (→ fallback Anthropic), retorna
  // a proposta estruturada para o usuário revisar antes de salvar.
  analisarPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      pdfBase64: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const clean = input.pdfBase64.replace(/^data:[^,]*,/, "").trim();
      const buf = Buffer.from(clean, "base64");
      if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O arquivo enviado não é um PDF válido." });
      }
      try {
        const result = await chamarIAFormato(clean);
        if (!result.bancoNome) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não conseguiu identificar o banco neste PDF." });
        }
        return result;
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Cota da IA temporariamente esgotada. Aguarde alguns minutos e tente novamente." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha na análise: ${msg}` });
      }
    }),
});

// ── função de lookup usada internamente pelo parseExtratoLines ───────────────

export async function detectarTemplateExtrato(
  companyId: number,
  textoPdf: string
): Promise<{
  bancoNome: string;
  skipPrefixes: string[];
  instrucoesIa: string;
} | null> {
  try {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT banco_nome, palavras_chave, skip_prefixes, instrucoes_ia
      FROM bank_statement_templates
      WHERE company_id = ${companyId} AND ativo = 1
      ORDER BY banco_nome ASC
    `);
    const templates = (rows.rows ?? []).map(r => ({
      bancoNome:     r.banco_nome as string,
      palavrasChave: safeJson(r.palavras_chave, []) as string[],
      skipPrefixes:  safeJson(r.skip_prefixes,  []) as string[],
      instrucoesIa:  (r.instrucoes_ia as string) || "",
    }));
    const low = textoPdf.toLowerCase();
    return templates.find(t =>
      t.palavrasChave.length > 0 &&
      t.palavrasChave.some(kw => low.includes(kw.toLowerCase()))
    ) ?? null;
  } catch {
    return null;
  }
}
