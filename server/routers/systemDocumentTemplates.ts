/**
 * Rev. 2141 — Router de Templates Institucionais FC.
 *
 * CRUD + versionamento completo dos 7 templates de documentos institucionais.
 * Cada save() cria uma nova linha em system_document_template_versions e
 * incrementa o pointer versaoAtual em system_document_templates.
 *
 * ACL: somente admin/admin_master podem listar/editar templates.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { systemDocumentTemplates, systemDocumentTemplateVersions } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  DOCUMENT_TEMPLATES_META,
  DOCUMENT_TEMPLATE_TIPOS,
  getTemplateMeta,
  type DocumentTemplateTipo,
} from "../../shared/documentTemplates";

function requireAdmin(ctx: any) {
  const role = ctx?.user?.role;
  if (role !== "admin" && role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem gerenciar templates." });
  }
}

const tipoSchema = z.enum(DOCUMENT_TEMPLATE_TIPOS as [string, ...string[]]);

export const systemDocumentTemplatesRouter = router({
  // ── Lista todos os 7 tipos (com ou sem template salvo) ────────────────────
  listAll: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    const rows = await db.select().from(systemDocumentTemplates);
    const byTipo = new Map<string, any>(rows.map(r => [r.tipo, r]));
    return DOCUMENT_TEMPLATES_META.map(meta => {
      const row = byTipo.get(meta.tipo);
      return {
        tipo: meta.tipo,
        titulo: meta.titulo,
        descricao: meta.descricao,
        icone: meta.icone,
        templateId: row?.id ?? null,
        versaoAtual: row?.versaoAtual ?? 0,
        atualizadoEm: row?.updatedAt ?? null,
        atualizadoPorNome: row?.atualizadoPorNome ?? null,
        existe: !!row,
      };
    });
  }),

  // ── Pega 1 template (versão atual ou versão específica) ───────────────────
  get: protectedProcedure
    .input(z.object({ tipo: tipoSchema, versao: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const meta = getTemplateMeta(input.tipo);
      if (!meta) throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de template desconhecido." });

      const [row] = await db.select().from(systemDocumentTemplates).where(eq(systemDocumentTemplates.tipo, input.tipo));
      if (!row) {
        return {
          meta,
          template: null,
          versaoExibida: null as number | null,
          conteudoHtml: "",
        };
      }

      let conteudoHtml = row.conteudoHtml;
      let versaoExibida = row.versaoAtual;
      if (input.versao && input.versao !== row.versaoAtual) {
        const [ver] = await db.select().from(systemDocumentTemplateVersions).where(and(
          eq(systemDocumentTemplateVersions.templateId, row.id),
          eq(systemDocumentTemplateVersions.versao, input.versao),
        ));
        if (!ver) throw new TRPCError({ code: "NOT_FOUND", message: "Versão não encontrada." });
        conteudoHtml = ver.conteudoHtml;
        versaoExibida = ver.versao;
      }

      return { meta, template: row, versaoExibida, conteudoHtml };
    }),

  // ── Histórico de versões de 1 template ────────────────────────────────────
  listVersions: protectedProcedure
    .input(z.object({ tipo: tipoSchema }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [tpl] = await db.select().from(systemDocumentTemplates).where(eq(systemDocumentTemplates.tipo, input.tipo));
      if (!tpl) return [];
      const versions = await db.select({
        id: systemDocumentTemplateVersions.id,
        versao: systemDocumentTemplateVersions.versao,
        comentario: systemDocumentTemplateVersions.comentario,
        criadoPorNome: systemDocumentTemplateVersions.criadoPorNome,
        createdAt: systemDocumentTemplateVersions.createdAt,
      }).from(systemDocumentTemplateVersions)
        .where(eq(systemDocumentTemplateVersions.templateId, tpl.id))
        .orderBy(desc(systemDocumentTemplateVersions.versao));
      return versions.map(v => ({ ...v, ehAtual: v.versao === tpl.versaoAtual }));
    }),

  // ── Salva (upsert): cria template se não existir OU incrementa versão ────
  // Atômico via db.transaction + SELECT FOR UPDATE pra evitar race condition
  // entre 2 admins salvando simultaneamente (sem isso, o índice único
  // (template_id, versao) falhava DEPOIS do UPDATE do ponteiro, deixando
  // versaoAtual inconsistente com o histórico).
  save: protectedProcedure
    .input(z.object({
      tipo: tipoSchema,
      conteudoHtml: z.string().min(1, "Conteúdo não pode ser vazio."),
      comentario: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const meta = getTemplateMeta(input.tipo);
      if (!meta) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo inválido." });

      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";

      return await db.transaction(async (tx: any) => {
        // FOR UPDATE serializa concorrência por tipo. Se a linha ainda não
        // existe (criação inicial), advisory lock por hash do tipo evita
        // que 2 admins criem simultaneamente.
        const lockKey = (() => {
          // hash determinístico simples do tipo → bigint pro pg_advisory_xact_lock
          let h = 0;
          for (const c of input.tipo) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
          return h;
        })();
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

        const existingRows: any[] = await tx.execute(sql`
          SELECT id, versao_atual, conteudo_html
            FROM system_document_templates
           WHERE tipo = ${input.tipo}
           FOR UPDATE
        `);
        const existing = (existingRows as any).rows?.[0] ?? (Array.isArray(existingRows) ? existingRows[0] : null);

        if (!existing) {
          // Cria template + versão 1 (mesma transação)
          const [created] = await tx.insert(systemDocumentTemplates).values({
            tipo: input.tipo,
            titulo: meta.titulo,
            descricao: meta.descricao,
            conteudoHtml: input.conteudoHtml,
            versaoAtual: 1,
            ativo: 1,
            atualizadoPorId: userId,
            atualizadoPorNome: userName,
          } as any).returning({ id: systemDocumentTemplates.id });
          await tx.insert(systemDocumentTemplateVersions).values({
            templateId: created.id,
            versao: 1,
            conteudoHtml: input.conteudoHtml,
            comentario: input.comentario ?? "Criação inicial",
            criadoPorId: userId,
            criadoPorNome: userName,
          } as any);
          return { ok: true, templateId: created.id, versao: 1 };
        }

        // No-op se conteúdo idêntico (não polui histórico)
        if (existing.conteudo_html === input.conteudoHtml) {
          return { ok: true, templateId: existing.id, versao: existing.versao_atual, semMudanca: true };
        }

        const novaVersao = (existing.versao_atual ?? 0) + 1;
        // INSERT version PRIMEIRO — se algum conflito (improvável após FOR
        // UPDATE), aborta antes de mexer no ponteiro.
        await tx.insert(systemDocumentTemplateVersions).values({
          templateId: existing.id,
          versao: novaVersao,
          conteudoHtml: input.conteudoHtml,
          comentario: input.comentario ?? null,
          criadoPorId: userId,
          criadoPorNome: userName,
        } as any);
        await tx.update(systemDocumentTemplates).set({
          conteudoHtml: input.conteudoHtml,
          versaoAtual: novaVersao,
          atualizadoPorId: userId,
          atualizadoPorNome: userName,
          updatedAt: sql`NOW()`,
        } as any).where(eq(systemDocumentTemplates.id, existing.id));
        return { ok: true, templateId: existing.id, versao: novaVersao };
      });
    }),

  // ── Restaurar versão antiga (cria nova versão idêntica à escolhida) ──────
  // Mesma proteção atômica do save().
  restoreVersion: protectedProcedure
    .input(z.object({ tipo: tipoSchema, versao: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();

      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";

      return await db.transaction(async (tx: any) => {
        const lockKey = (() => {
          let h = 0;
          for (const c of input.tipo) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
          return h;
        })();
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

        const tplRows: any[] = await tx.execute(sql`
          SELECT id, versao_atual FROM system_document_templates WHERE tipo = ${input.tipo} FOR UPDATE
        `);
        const tpl = (tplRows as any).rows?.[0] ?? (Array.isArray(tplRows) ? tplRows[0] : null);
        if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });

        const [ver] = await tx.select().from(systemDocumentTemplateVersions).where(and(
          eq(systemDocumentTemplateVersions.templateId, tpl.id),
          eq(systemDocumentTemplateVersions.versao, input.versao),
        ));
        if (!ver) throw new TRPCError({ code: "NOT_FOUND", message: "Versão não encontrada." });

        const novaVersao = (tpl.versao_atual ?? 0) + 1;
        await tx.insert(systemDocumentTemplateVersions).values({
          templateId: tpl.id,
          versao: novaVersao,
          conteudoHtml: ver.conteudoHtml,
          comentario: `Restaurado a partir da Rev. ${ver.versao}`,
          criadoPorId: userId,
          criadoPorNome: userName,
        } as any);
        await tx.update(systemDocumentTemplates).set({
          conteudoHtml: ver.conteudoHtml,
          versaoAtual: novaVersao,
          atualizadoPorId: userId,
          atualizadoPorNome: userName,
          updatedAt: sql`NOW()`,
        } as any).where(eq(systemDocumentTemplates.id, tpl.id));
        return { ok: true, novaVersao };
      });
    }),
});
