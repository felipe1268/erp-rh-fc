// ─────────────────────────────────────────────────────────────────────────────
// Router: Templates de Extrato Bancário (Rev. 3877)
// CRUD de templates por banco, usados para fornecer instruções extras à IA
// quando o parser determinístico não reconhece o formato.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getUserCompanyLinks } from "../db";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ── tenant guard (padrão local, igual ferramentasTerceiros / encargosSociais) ─

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
           instrucoes_ia, ativo, criado_em, atualizado_em,
           criado_por_id, criado_por_nome
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

// ── schema de input ──────────────────────────────────────────────────────────

const templateInput = z.object({
  companyId:     z.number(),
  bancoNome:     z.string().min(1).max(100),
  palavrasChave: z.array(z.string()).default([]),
  skipPrefixes:  z.array(z.string()).default([]),
  instrucoesIa:  z.string().default(""),
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
           instrucoes_ia, ativo, criado_por_id, criado_por_nome)
        VALUES (
          ${input.companyId},
          ${input.bancoNome},
          ${JSON.stringify(input.palavrasChave)},
          ${JSON.stringify(input.skipPrefixes)},
          ${input.instrucoesIa || null},
          ${input.ativo ? 1 : 0},
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
        SELECT id FROM bank_statement_templates
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      if (!check.rows?.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });
      }
      await db.execute(sql`
        UPDATE bank_statement_templates SET
          banco_nome     = ${input.bancoNome},
          palavras_chave = ${JSON.stringify(input.palavrasChave)},
          skip_prefixes  = ${JSON.stringify(input.skipPrefixes)},
          instrucoes_ia  = ${input.instrucoesIa || null},
          ativo          = ${input.ativo ? 1 : 0},
          atualizado_em  = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
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
