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
  getSeedTemplate,
  DEFAULT_CODIGOS,
  type DocumentTemplateTipo,
} from "../../shared/documentTemplates";
import { invokeLLM, invokeAnthropicVision } from "../_core/llm";

function requireAdmin(ctx: any) {
  const role = ctx?.user?.role;
  if (role !== "admin" && role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem gerenciar templates." });
  }
}

const tipoSchema = z.enum(DOCUMENT_TEMPLATE_TIPOS as [string, ...string[]]);

/** Disponibilidade de IA (alguma chave configurada). Usado p/ degradar a UI. */
function iaDisponivel(): { anthropic: boolean; algum: boolean } {
  const anthropic = !!(
    (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) ||
    process.env.ANTHROPIC_API_KEY
  );
  const algum = anthropic || !!process.env.GOOGLE_API_KEY || !!process.env.OPENAI_API_KEY;
  return { anthropic, algum };
}

/**
 * Sanitização server-side do HTML vindo da IA (defesa em profundidade — o
 * render no /assinar/:token já filtra via DOMPurify, mas templates institucionais
 * não devem nem PERSISTIR vetores). Remove <script>/<style>/<iframe>, handlers
 * on*, javascript:/data:text-html e tags de documento (html/head/body) já que o
 * conteúdo é apenas o CORPO injetado no buildFcDocument.
 */
function sanitizeAiHtml(raw: string): string {
  let h = String(raw || "");
  // Extrai bloco de código markdown se a IA devolver ```html ... ```
  const fence = h.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) h = fence[1];
  h = h
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/<\/?\s*(html|head|body)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*"(?:javascript|data):[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'(?:javascript|data):[^']*'/gi, "$1='#'");
  return h.trim();
}

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
        // ── ISO ──
        codigo: row?.codigo ?? DEFAULT_CODIGOS[meta.tipo as DocumentTemplateTipo],
        status: (row?.status ?? (row ? "rascunho" : "ausente")) as string,
        elaboradoPorNome: row?.elaboradoPorNome ?? null,
        aprovadoPorNome: row?.aprovadoPorNome ?? null,
        aprovadoEm: row?.aprovadoEm ?? null,
        dataVigencia: row?.dataVigencia ?? null,
        proximaRevisao: row?.proximaRevisao ?? null,
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
      // ── Metadados ISO (opcionais; gravados na LINHA do template, não na versão) ──
      codigo: z.string().max(40).optional(),
      dataVigencia: z.string().max(20).optional().nullable(),
      proximaRevisao: z.string().max(20).optional().nullable(),
      elaboradoPorNome: z.string().max(255).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const meta = getTemplateMeta(input.tipo);
      if (!meta) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo inválido." });

      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";
      // Campos ISO normalizados (undefined = não mexe; null/"" = limpa)
      const isoSet: Record<string, any> = {};
      if (input.codigo !== undefined) isoSet.codigo = input.codigo || null;
      if (input.dataVigencia !== undefined) isoSet.dataVigencia = input.dataVigencia || null;
      if (input.proximaRevisao !== undefined) isoSet.proximaRevisao = input.proximaRevisao || null;
      if (input.elaboradoPorNome !== undefined) isoSet.elaboradoPorNome = input.elaboradoPorNome || null;

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
          SELECT id, versao_atual, conteudo_html, status
            FROM system_document_templates
           WHERE tipo = ${input.tipo}
           FOR UPDATE
        `);
        const existing = (existingRows as any).rows?.[0] ?? (Array.isArray(existingRows) ? existingRows[0] : null);

        if (!existing) {
          // Cria template + versão 1 (mesma transação). Nasce como RASCUNHO ISO,
          // com código default FC-XX-NNN e o autor como "elaborado por".
          const [created] = await tx.insert(systemDocumentTemplates).values({
            tipo: input.tipo,
            titulo: meta.titulo,
            descricao: meta.descricao,
            conteudoHtml: input.conteudoHtml,
            versaoAtual: 1,
            ativo: 1,
            atualizadoPorId: userId,
            atualizadoPorNome: userName,
            codigo: isoSet.codigo ?? DEFAULT_CODIGOS[input.tipo as DocumentTemplateTipo],
            status: "rascunho",
            elaboradoPorId: userId,
            elaboradoPorNome: isoSet.elaboradoPorNome ?? userName,
            dataVigencia: isoSet.dataVigencia ?? null,
            proximaRevisao: isoSet.proximaRevisao ?? null,
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

        // No-op de CONTEÚDO (não polui histórico). Mesmo assim, se vieram
        // metadados ISO novos, atualiza só a ficha (sem bumpar versão).
        if (existing.conteudo_html === input.conteudoHtml) {
          if (Object.keys(isoSet).length > 0) {
            await tx.update(systemDocumentTemplates).set({
              ...isoSet,
              updatedAt: sql`NOW()`,
            } as any).where(eq(systemDocumentTemplates.id, existing.id));
          }
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
        // GATE ISO: qualquer mudança de CONTEÚDO rebaixa o documento para
        // RASCUNHO e LIMPA a aprovação anterior — uma nova revisão SÓ volta a
        // ser entregue por getVigente após passar por `aprovar` de novo. Isso
        // impede que editar um documento JÁ VIGENTE publique texto institucional
        // sem aprovação formal (Rev. 2747).
        await tx.update(systemDocumentTemplates).set({
          ...isoSet,
          conteudoHtml: input.conteudoHtml,
          versaoAtual: novaVersao,
          status: "rascunho",
          aprovadoPorId: null,
          aprovadoPorNome: null,
          aprovadoEm: null,
          atualizadoPorId: userId,
          atualizadoPorNome: userName,
          updatedAt: sql`NOW()`,
        } as any).where(eq(systemDocumentTemplates.id, existing.id));
        return { ok: true, templateId: existing.id, versao: novaVersao, rebaixadoParaRascunho: true };
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
        // GATE ISO (igual ao `save`): restaurar uma versão antiga é uma mudança
        // de conteúdo → rebaixa p/ `rascunho` e LIMPA a aprovação, exigindo
        // `aprovar` de novo antes de `getVigente` voltar a entregá-lo. Sem isso,
        // restaurar num doc vigente publicaria conteúdo histórico sem aprovação.
        await tx.update(systemDocumentTemplates).set({
          conteudoHtml: ver.conteudoHtml,
          versaoAtual: novaVersao,
          status: "rascunho",
          aprovadoPorId: null,
          aprovadoPorNome: null,
          aprovadoEm: null,
          atualizadoPorId: userId,
          atualizadoPorNome: userName,
          updatedAt: sql`NOW()`,
        } as any).where(eq(systemDocumentTemplates.id, tpl.id));
        return { ok: true, novaVersao, rebaixadoParaRascunho: true };
      });
    }),

  // ════════════════════════════════════════════════════════════════════════
  // Rev. 2747 — CONTROLE ISO + getVigente + seedDefaults + IA
  // ════════════════════════════════════════════════════════════════════════

  // ── Aprovar (rascunho → vigente). Carimba aprovador + data. ───────────────
  aprovar: protectedProcedure
    .input(z.object({
      tipo: tipoSchema,
      dataVigencia: z.string().max(20).optional().nullable(),
      proximaRevisao: z.string().max(20).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";
      const [row] = await db.select().from(systemDocumentTemplates).where(eq(systemDocumentTemplates.tipo, input.tipo));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Salve o template antes de aprovar." });
      const hoje = new Date().toISOString().slice(0, 10);
      await db.update(systemDocumentTemplates).set({
        status: "vigente",
        aprovadoPorId: userId,
        aprovadoPorNome: userName,
        aprovadoEm: sql`NOW()`,
        dataVigencia: input.dataVigencia ?? row.dataVigencia ?? hoje,
        proximaRevisao: input.proximaRevisao ?? row.proximaRevisao ?? null,
        updatedAt: sql`NOW()`,
      } as any).where(eq(systemDocumentTemplates.id, row.id));
      return { ok: true };
    }),

  // ── Marcar obsoleto (deixa de ser consumido pelos módulos). ───────────────
  marcarObsoleto: protectedProcedure
    .input(z.object({ tipo: tipoSchema }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [row] = await db.select().from(systemDocumentTemplates).where(eq(systemDocumentTemplates.tipo, input.tipo));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });
      await db.update(systemDocumentTemplates).set({ status: "obsoleto", updatedAt: sql`NOW()` } as any)
        .where(eq(systemDocumentTemplates.id, row.id));
      return { ok: true };
    }),

  // ── Voltar para rascunho (reabre p/ edição/reaprovação). ──────────────────
  voltarParaRascunho: protectedProcedure
    .input(z.object({ tipo: tipoSchema }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [row] = await db.select().from(systemDocumentTemplates).where(eq(systemDocumentTemplates.tipo, input.tipo));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });
      await db.update(systemDocumentTemplates).set({ status: "rascunho", updatedAt: sql`NOW()` } as any)
        .where(eq(systemDocumentTemplates.id, row.id));
      return { ok: true };
    }),

  // ── getVigente: usado pelos MÓDULOS (não-admin) p/ consumir o template ───
  //    oficial. Só devolve conteúdo quando status === 'vigente'. Caso contrário
  //    retorna template:null → o gerador cai no HTML hard-coded (fallback).
  getVigente: protectedProcedure
    .input(z.object({ tipo: tipoSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      const meta = getTemplateMeta(input.tipo);
      const [row] = await db.select().from(systemDocumentTemplates).where(eq(systemDocumentTemplates.tipo, input.tipo));
      if (!row || row.status !== "vigente") {
        return { tipo: input.tipo, vigente: false, conteudoHtml: null as string | null, codigo: row?.codigo ?? null, versao: row?.versaoAtual ?? null, titulo: meta?.titulo ?? input.tipo };
      }
      return {
        tipo: input.tipo,
        vigente: true,
        conteudoHtml: row.conteudoHtml,
        codigo: row.codigo ?? null,
        versao: row.versaoAtual,
        titulo: meta?.titulo ?? input.tipo,
      };
    }),

  // ── seedDefaults: cria os 7 tipos faltantes a partir do seed institucional,
  //    já como Rev. 1 VIGENTE (fonte oficial imediata). Idempotente: nunca
  //    sobrescreve um template já existente. ──────────────────────────────────
  seedDefaults: protectedProcedure
    .input(z.object({ ativarVigente: z.boolean().default(true) }).optional())
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const ativarVigente = input?.ativarVigente ?? true;
      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";
      const hoje = new Date().toISOString().slice(0, 10);

      const existentes = await db.select({ tipo: systemDocumentTemplates.tipo }).from(systemDocumentTemplates);
      const setExist = new Set(existentes.map((r: any) => r.tipo));

      const criados: string[] = [];
      for (const meta of DOCUMENT_TEMPLATES_META) {
        if (setExist.has(meta.tipo)) continue;
        const seed = getSeedTemplate(meta.tipo as DocumentTemplateTipo);
        const [created] = await db.insert(systemDocumentTemplates).values({
          tipo: meta.tipo,
          titulo: meta.titulo,
          descricao: meta.descricao,
          conteudoHtml: seed.conteudoHtml,
          versaoAtual: 1,
          ativo: 1,
          atualizadoPorId: userId,
          atualizadoPorNome: userName,
          codigo: seed.codigo,
          status: ativarVigente ? "vigente" : "rascunho",
          elaboradoPorId: userId,
          elaboradoPorNome: userName,
          aprovadoPorId: ativarVigente ? userId : null,
          aprovadoPorNome: ativarVigente ? userName : null,
          aprovadoEm: ativarVigente ? (sql`NOW()` as any) : null,
          dataVigencia: ativarVigente ? hoje : null,
        } as any).returning({ id: systemDocumentTemplates.id });
        await db.insert(systemDocumentTemplateVersions).values({
          templateId: created.id,
          versao: 1,
          conteudoHtml: seed.conteudoHtml,
          comentario: "Seed institucional (Rev. 2747)",
          criadoPorId: userId,
          criadoPorNome: userName,
        } as any);
        criados.push(meta.tipo);
      }
      return { ok: true, criados, total: criados.length };
    }),

  // ── IA: status (p/ a UI degradar botões quando não há chave). ─────────────
  iaStatus: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const { anthropic, algum } = iaDisponivel();
    // PDF→sugerir exige Anthropic (document vision); gerar-do-zero usa qualquer LLM.
    return { lerPdf: anthropic, gerarDoZero: algum };
  }),

  // ── IA: gerar do zero. Instruções em linguagem natural → CORPO HTML c/
  //    placeholders {{chave}}. Valida que veio HTML não-vazio + sanitiza. ─────
  iaGerarDoZero: protectedProcedure
    .input(z.object({
      tipo: tipoSchema,
      instrucoes: z.string().min(5, "Descreva o que o documento deve conter.").max(4000),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      if (!iaDisponivel().algum) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada. Cadastre uma chave (ex.: ANTHROPIC_API_KEY) para usar a geração automática." });
      }
      const meta = getTemplateMeta(input.tipo);
      if (!meta) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo inválido." });
      const placeholders = meta.placeholders.map(p => `{{${p.chave}}} = ${p.rotulo}`).join("\n");
      const systemPrompt =
        `Você é um redator jurídico-trabalhista da FC Engenharia (construção civil, Brasil). ` +
        `Gere APENAS o CORPO (em HTML) de um documento institucional do tipo "${meta.titulo}". ` +
        `NÃO inclua cabeçalho, logo, faixa de título, blocos de assinatura nem as tags <html>/<head>/<body> — ` +
        `tudo isso é adicionado automaticamente pelo sistema. ` +
        `Use parágrafos <p>, listas <ul>/<ol> e títulos de cláusula em <strong>. ` +
        `Para os dados variáveis use EXATAMENTE estes placeholders (formato {{chave}}), sem inventar outros:\n${placeholders}\n` +
        `Linguagem formal, pt-BR, fundamentação na CLT quando cabível. Responda só com o HTML do corpo.`;
      let out = "";
      try {
        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.instrucoes },
          ],
          maxTokens: 4096,
        });
        out = (res.choices?.[0]?.message?.content as string) ?? "";
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha na IA: ${String(e?.message ?? e).slice(0, 160)}` });
      }
      const html = sanitizeAiHtml(out);
      if (!html || html.replace(/<[^>]*>/g, "").trim().length < 20) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A IA não retornou um corpo de documento válido. Tente refinar as instruções." });
      }
      return { ok: true, conteudoHtml: html };
    }),

  // ── IA: ler PDF e sugerir o template. Recebe PDF base64, devolve CORPO HTML
  //    com placeholders, espelhando o documento enviado. Exige Anthropic. ─────
  iaLerPdfSugerir: protectedProcedure
    .input(z.object({
      tipo: tipoSchema,
      pdfBase64: z.string().min(1),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      if (!iaDisponivel().anthropic) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A leitura de PDF exige a IA Anthropic configurada (ANTHROPIC_API_KEY)." });
      }
      const meta = getTemplateMeta(input.tipo);
      if (!meta) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo inválido." });
      // Limite defensivo de tamanho (~8MB base64 ≈ 6MB binário).
      if (input.pdfBase64.length > 8_500_000) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PDF muito grande (máx. ~6MB)." });
      }
      const b64 = input.pdfBase64.includes(",") ? input.pdfBase64.split(",").pop()! : input.pdfBase64;
      const placeholders = meta.placeholders.map(p => `{{${p.chave}}} = ${p.rotulo}`).join("\n");
      const systemPrompt =
        `Você converte documentos institucionais em MODELOS reutilizáveis para a FC Engenharia. ` +
        `Leia o PDF anexado (um "${meta.titulo}") e reproduza fielmente o TEXTO/estrutura como CORPO em HTML, ` +
        `substituindo os dados específicos (nomes, CPF, datas, valores, função, empresa) pelos placeholders {{chave}}. ` +
        `Use EXATAMENTE estes placeholders quando o dado existir:\n${placeholders}\n` +
        `NÃO inclua cabeçalho, logo, faixa de título, assinaturas nem tags <html>/<head>/<body>. ` +
        `Além do modelo, AVALIE o documento e proponha melhorias objetivas (cláusulas faltantes, ` +
        `riscos jurídicos/trabalhistas, dados que deveriam virar placeholder, clareza/formatação). ` +
        `Responda SOMENTE com um objeto JSON válido, sem texto fora dele, no formato: ` +
        `{"html":"<o corpo HTML do modelo>","sugestoes":["sugestão 1","sugestão 2", ...]}. ` +
        `A lista "sugestoes" pode ser vazia se o documento já estiver bom.`;
      const prompt = `Converta este documento em um modelo com placeholders e liste sugestões de melhoria.${input.observacoes ? ` Observações do usuário: ${input.observacoes}` : ""}`;
      let out = "";
      try {
        out = await invokeAnthropicVision({
          prompt,
          base64: b64,
          mimeType: "application/pdf",
          systemPrompt,
          maxTokens: 4096,
        });
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao ler o PDF: ${String(e?.message ?? e).slice(0, 160)}` });
      }
      // A IA deve devolver JSON {html, sugestoes[]}. Parsing tolerante: extrai o
      // bloco JSON (mesmo embrulhado em ```), e cai pro texto cru como HTML se a
      // IA ignorar o formato (degradação graciosa — nunca quebra o fluxo).
      const { html: rawHtml, sugestoes } = parseIaModeloComSugestoes(out);
      const html = sanitizeAiHtml(rawHtml);
      if (!html || html.replace(/<[^>]*>/g, "").trim().length < 20) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não consegui extrair um modelo do PDF. Verifique se o arquivo tem texto legível." });
      }
      return { ok: true, conteudoHtml: html, sugestoes };
    }),
});

/**
 * Faz o parse tolerante da resposta da IA esperada como JSON
 * `{ html, sugestoes[] }`. Estratégia em camadas:
 *  1) Remove cercas markdown (```json ... ```).
 *  2) Tenta JSON.parse direto; se falhar, extrai o 1º {...} balanceado.
 *  3) Se nada parsear, trata a resposta inteira como HTML e devolve sugestões
 *     vazias — assim o fluxo NUNCA quebra por desvio de formato da IA.
 * As sugestões são limitadas/limpas (strings curtas, no máx. 12).
 */
function parseIaModeloComSugestoes(raw: string): { html: string; sugestoes: string[] } {
  let txt = String(raw || "").trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();

  const tentarObjeto = (s: string): { html: string; sugestoes: string[] } | null => {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object" && typeof obj.html === "string") {
        const sug = Array.isArray(obj.sugestoes)
          ? obj.sugestoes.map((x: any) => String(x).trim()).filter((x: string) => x.length > 0).slice(0, 12)
          : [];
        return { html: obj.html, sugestoes: sug };
      }
    } catch { /* ignora — tenta próxima estratégia */ }
    return null;
  };

  const direto = tentarObjeto(txt);
  if (direto) return direto;

  const inicio = txt.indexOf("{");
  const fim = txt.lastIndexOf("}");
  if (inicio !== -1 && fim > inicio) {
    const recorte = tentarObjeto(txt.slice(inicio, fim + 1));
    if (recorte) return recorte;
  }

  // Fallback: a IA devolveu HTML puro (sem JSON). Mantém o comportamento antigo.
  return { html: txt, sugestoes: [] };
}
