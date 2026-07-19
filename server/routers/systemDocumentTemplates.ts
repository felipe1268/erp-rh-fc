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
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  DOCUMENT_TEMPLATES_META,
  DOCUMENT_TEMPLATE_TIPOS,
  getTemplateMeta,
  getDocMetaOrFallback,
  getSeedTemplate,
  slugifyDocTipo,
  isCustomTipo,
  DEFAULT_CODIGOS,
  getCategoriaFromDoc,
  type DocumentTemplateTipo,
} from "../../shared/documentTemplates";
import { invokeLLM, invokeAnthropicVision } from "../_core/llm";

function requireAdmin(ctx: any) {
  const role = ctx?.user?.role;
  if (role !== "admin" && role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem gerenciar templates." });
  }
}

// Rev. 2753 — Teto de tempo para as chamadas de IA da Central de Documentos.
// O usuário pediu que a geração NUNCA passe de ~1 minuto: corremos a promise
// da IA contra um timeout e, se estourar, abortamos com mensagem clara (a UI
// mostra o erro e a barra de progresso para). 58s deixa folga antes do limite
// de 60s do proxy/cliente.
const IA_TIMEOUT_MS = 58_000;
function withTimeout<T>(p: Promise<T>, ms = IA_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("A IA demorou mais de 1 minuto para responder. Tente novamente ou simplifique o pedido.")),
      ms,
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// Schema FIXO (7 tipos institucionais) usado por endpoints exclusivos deles.
const tipoSchema = z.enum(DOCUMENT_TEMPLATE_TIPOS as [string, ...string[]]);
// Schema FLEXÍVEL (Rev. 2751): aceita os 7 fixos OU um slug custom_<...>.
// Slug seguro (a-z0-9_, 3..60) — casa com slugifyDocTipo e o varchar(60) do banco.
const tipoFlexSchema = z.string().regex(/^[a-z0-9_]{3,60}$/, "Tipo de documento inválido.");

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
    // Rev. 2754 — soft-delete: documentos excluídos (deleted_at != NULL) somem
    // da lista. Fixos excluídos voltam a aparecer como "ausente" (recriáveis);
    // custom excluídos somem de vez.
    const rows = await db.select().from(systemDocumentTemplates).where(isNull(systemDocumentTemplates.deletedAt));
    const byTipo = new Map<string, any>(rows.map(r => [r.tipo, r]));
    // (1) Os 7 tipos FIXOS (sempre listados, mesmo sem linha no banco).
    const fixos = DOCUMENT_TEMPLATES_META.map(meta => {
      const row = byTipo.get(meta.tipo);
      return {
        tipo: meta.tipo,
        titulo: meta.titulo,
        descricao: meta.descricao,
        icone: meta.icone,
        isCustom: false,
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
        categoria: meta.categoria ?? "rh",
      };
    });
    // (2) Documentos CUSTOM (Rev. 2751): qualquer linha cujo tipo não é fixo.
    const customs = rows
      .filter((row: any) => isCustomTipo(row.tipo))
      .map((row: any) => ({
        tipo: row.tipo,
        titulo: row.titulo,
        descricao: row.descricao ?? "",
        icone: "FileText",
        isCustom: true,
        templateId: row.id,
        versaoAtual: row.versaoAtual ?? 0,
        atualizadoEm: row.updatedAt ?? null,
        atualizadoPorNome: row.atualizadoPorNome ?? null,
        existe: true,
        codigo: row.codigo ?? null,
        status: (row.status ?? "rascunho") as string,
        elaboradoPorNome: row.elaboradoPorNome ?? null,
        aprovadoPorNome: row.aprovadoPorNome ?? null,
        aprovadoEm: row.aprovadoEm ?? null,
        dataVigencia: row.dataVigencia ?? null,
        proximaRevisao: row.proximaRevisao ?? null,
        categoria: getCategoriaFromDoc(row.tipo, row.codigo),
      }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    return [...fixos, ...customs];
  }),

  // ── Pega 1 template (versão atual ou versão específica) ───────────────────
  get: protectedProcedure
    .input(z.object({ tipo: tipoFlexSchema, versao: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [row] = await db.select().from(systemDocumentTemplates).where(and(
        eq(systemDocumentTemplates.tipo, input.tipo),
        isNull(systemDocumentTemplates.deletedAt),
      ));
      // Custom: a meta vem da própria linha (placeholders comuns). Fixos: meta do catálogo.
      const meta = getDocMetaOrFallback(input.tipo, row?.titulo);
      if (!getTemplateMeta(input.tipo) && !row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      }
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
    .input(z.object({ tipo: tipoFlexSchema }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [tpl] = await db.select().from(systemDocumentTemplates).where(and(
        eq(systemDocumentTemplates.tipo, input.tipo),
        isNull(systemDocumentTemplates.deletedAt),
      ));
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
      tipo: tipoFlexSchema,
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
      const custom = isCustomTipo(input.tipo);
      // Fixos exigem meta do catálogo; custom não tem (criado via criarNovo).
      if (!meta && !custom) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo inválido." });

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
          SELECT id, versao_atual, conteudo_html, status, deleted_at
            FROM system_document_templates
           WHERE tipo = ${input.tipo}
           FOR UPDATE
        `);
        const existing = (existingRows as any).rows?.[0] ?? (Array.isArray(existingRows) ? existingRows[0] : null);

        if (!existing) {
          // Documento custom é criado pelo endpoint `criarNovo` (precisa de
          // título/código). Aqui `save` só ATUALIZA custom já existente.
          if (custom || !meta) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado. Use o botão \"Novo Documento\" para criá-lo." });
          }
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
          // Rev. 2754 — re-salvar SEMPRE revive um doc excluído, mesmo sem mudança
          // de conteúdo OU de ISO (revive determinístico). Sem ISO novo e sem estar
          // excluído, é no-op real (não toca a linha).
          if (Object.keys(isoSet).length > 0 || existing.deleted_at != null) {
            await tx.update(systemDocumentTemplates).set({
              ...isoSet,
              deletedAt: null,
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
          deletedAt: null, // Rev. 2754 — re-salvar revive um doc que estava excluído.
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
    .input(z.object({ tipo: tipoFlexSchema, versao: z.number().int().positive() }))
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
          SELECT id, versao_atual FROM system_document_templates WHERE tipo = ${input.tipo} AND deleted_at IS NULL FOR UPDATE
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
      tipo: tipoFlexSchema,
      dataVigencia: z.string().max(20).optional().nullable(),
      proximaRevisao: z.string().max(20).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";
      const [row] = await db.select().from(systemDocumentTemplates).where(and(eq(systemDocumentTemplates.tipo, input.tipo), isNull(systemDocumentTemplates.deletedAt)));
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
    .input(z.object({ tipo: tipoFlexSchema }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [row] = await db.select().from(systemDocumentTemplates).where(and(eq(systemDocumentTemplates.tipo, input.tipo), isNull(systemDocumentTemplates.deletedAt)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });
      await db.update(systemDocumentTemplates).set({ status: "obsoleto", updatedAt: sql`NOW()` } as any)
        .where(eq(systemDocumentTemplates.id, row.id));
      return { ok: true };
    }),

  // ── Voltar para rascunho (reabre p/ edição/reaprovação). ──────────────────
  voltarParaRascunho: protectedProcedure
    .input(z.object({ tipo: tipoFlexSchema }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [row] = await db.select().from(systemDocumentTemplates).where(and(eq(systemDocumentTemplates.tipo, input.tipo), isNull(systemDocumentTemplates.deletedAt)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado." });
      await db.update(systemDocumentTemplates).set({ status: "rascunho", updatedAt: sql`NOW()` } as any)
        .where(eq(systemDocumentTemplates.id, row.id));
      return { ok: true };
    }),

  // ── Excluir (Rev. 2754): SOFT-DELETE — carimba deleted_at. NUNCA faz DELETE
  //    físico (R-001/R-007/R-010). O doc some das listas e do consumo (getVigente).
  //    Custom: some de vez. Fixo: volta a aparecer como "ausente" e pode ser
  //    recriado por "Inicializar padrões" ou re-salvando (que revive a linha).
  excluir: protectedProcedure
    .input(z.object({ tipo: tipoFlexSchema }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const [row] = await db.select().from(systemDocumentTemplates).where(and(
        eq(systemDocumentTemplates.tipo, input.tipo),
        isNull(systemDocumentTemplates.deletedAt),
      ));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      await db.update(systemDocumentTemplates).set({ deletedAt: sql`NOW()`, updatedAt: sql`NOW()` } as any)
        .where(eq(systemDocumentTemplates.id, row.id));
      return { ok: true, isCustom: isCustomTipo(row.tipo) };
    }),

  // ── getVigente: usado pelos MÓDULOS (não-admin) p/ consumir o template ───
  //    oficial. Só devolve conteúdo quando status === 'vigente'. Caso contrário
  //    retorna template:null → o gerador cai no HTML hard-coded (fallback).
  getVigente: protectedProcedure
    // SEGURANÇA (Rev. 2751): este endpoint é NÃO-admin (consumido pelos módulos/
    // geradores). Só os 7 tipos FIXOS alimentam geradores; documentos CUSTOM são
    // avulsos e NÃO devem ser legíveis por aqui — senão qualquer usuário autenticado
    // que adivinhe o slug `custom_*` leria o conteúdo vigente. Por isso o input volta
    // ao enum fixo (`tipoSchema`): um `tipo` custom é rejeitado na validação.
    .input(z.object({ tipo: tipoSchema }))
    .query(async ({ input }) => {
      const db = await getDb();
      const meta = getTemplateMeta(input.tipo);
      const [row] = await db.select().from(systemDocumentTemplates).where(and(
        eq(systemDocumentTemplates.tipo, input.tipo),
        isNull(systemDocumentTemplates.deletedAt),
      ));
      const titulo = meta?.titulo ?? row?.titulo ?? input.tipo;
      // Rev. 4441 — margens por template (fallback 10mm quando ausente)
      const margins = row ? {
        top:    (row as any).docMarginTopMm    ?? 10,
        right:  (row as any).docMarginRightMm  ?? 10,
        bottom: (row as any).docMarginBottomMm ?? 10,
        left:   (row as any).docMarginLeftMm   ?? 10,
      } : { top: 10, right: 10, bottom: 10, left: 10 };
      if (!row || row.status !== "vigente") {
        return { tipo: input.tipo, vigente: false, conteudoHtml: null as string | null, codigo: row?.codigo ?? null, versao: row?.versaoAtual ?? null, titulo, margins };
      }
      return {
        tipo: input.tipo,
        vigente: true,
        conteudoHtml: row.conteudoHtml,
        codigo: row.codigo ?? null,
        versao: row.versaoAtual,
        titulo,
        margins,
      };
    }),

  /** Rev. 4441 — Salva as margens (mm) de um template específico. Admin only. */
  updateTemplateMargins: protectedProcedure
    .input(z.object({
      tipo:   z.string().min(1),
      top:    z.number().int().min(0).max(50),
      right:  z.number().int().min(0).max(50),
      bottom: z.number().int().min(0).max(50),
      left:   z.number().int().min(0).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.$client.query(
        `UPDATE system_document_templates
            SET doc_margin_top_mm    = $1,
                doc_margin_right_mm  = $2,
                doc_margin_bottom_mm = $3,
                doc_margin_left_mm   = $4
          WHERE tipo = $5`,
        [input.top, input.right, input.bottom, input.left, input.tipo],
      );
      return { ok: true };
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

      const existentes = await db.select({
        tipo: systemDocumentTemplates.tipo,
        id: systemDocumentTemplates.id,
        deletedAt: systemDocumentTemplates.deletedAt,
      }).from(systemDocumentTemplates);
      // Ativos (deleted_at = NULL) são pulados; excluídos (Rev. 2754) são REVIVIDOS
      // (clear deleted_at + reseed), não reinseridos — a linha ocupa o `tipo` único.
      const setAtivos = new Set(existentes.filter((r: any) => !r.deletedAt).map((r: any) => r.tipo));
      const deletedByTipo = new Map<string, number>(
        existentes.filter((r: any) => r.deletedAt).map((r: any) => [r.tipo, r.id]),
      );

      const criados: string[] = [];
      for (const meta of DOCUMENT_TEMPLATES_META) {
        if (setAtivos.has(meta.tipo)) continue;
        const seed = getSeedTemplate(meta.tipo as DocumentTemplateTipo);
        // Reviver um fixo previamente excluído: atualiza a linha (some o deleted_at)
        // e reseeda o conteúdo/estado, em vez de inserir (violaria o tipo único).
        const deletedId = deletedByTipo.get(meta.tipo);
        if (deletedId) {
          await db.update(systemDocumentTemplates).set({
            titulo: meta.titulo,
            descricao: meta.descricao,
            conteudoHtml: seed.conteudoHtml,
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
            deletedAt: null,
            updatedAt: sql`NOW()`,
          } as any).where(eq(systemDocumentTemplates.id, deletedId));
          criados.push(meta.tipo);
          continue;
        }
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

  // ── criarNovo (Rev. 2751): cria um documento CUSTOM (fora dos 7 fixos). ────
  //    Gera um `tipo` slug único (custom_<slug>, com sufixo numérico se colidir)
  //    e um código ISO auto (FC-DOC-NNN) quando não informado. Nasce RASCUNHO
  //    Rev. 1. Não é consumido por geradores — é um documento institucional avulso.
  criarNovo: protectedProcedure
    .input(z.object({
      titulo: z.string().min(3, "Informe um título.").max(200),
      descricao: z.string().max(500).optional(),
      conteudoHtml: z.string().min(1, "Conteúdo não pode ser vazio."),
      codigo: z.string().max(40).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      const userId = (ctx.user as any)?.id ?? null;
      const userName = (ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "Sistema";

      return await db.transaction(async (tx: any) => {
        // Lock GLOBAL único de criação de docs custom (chave constante). Criar
        // documento avulso é ação rara de admin, então serializar todas as criações
        // é aceitável e resolve DOIS races de uma vez: (a) slug duplicado e
        // (b) código auto FC-DOC-NNN duplicado — se o lock fosse por título, duas
        // criações com TÍTULOS diferentes pegariam locks diferentes e poderiam ler
        // o mesmo `max` de código, gerando o mesmo NNN.
        const CRIAR_DOC_LOCK = 0x46434443; // "FCDC"
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${CRIAR_DOC_LOCK})`);

        // (1) Slug único: base + sufixo _2, _3... se já existir (respeita varchar(60)).
        const base = slugifyDocTipo(input.titulo);
        const usados = new Set<string>(
          (await tx.select({ tipo: systemDocumentTemplates.tipo }).from(systemDocumentTemplates))
            .map((r: any) => r.tipo as string),
        );
        let tipo = base;
        let n = 2;
        while (usados.has(tipo)) {
          const suf = `_${n++}`;
          tipo = `${base.slice(0, 60 - suf.length)}${suf}`;
        }

        // (2) Código ISO: usa o informado ou gera FC-DOC-NNN (próximo livre).
        let codigo = (input.codigo || "").trim();
        if (!codigo) {
          const rows = await tx.select({ codigo: systemDocumentTemplates.codigo }).from(systemDocumentTemplates);
          let max = 0;
          for (const r of rows as any[]) {
            const m = /^FC-DOC-(\d+)$/.exec(String(r.codigo || ""));
            if (m) max = Math.max(max, parseInt(m[1], 10));
          }
          codigo = `FC-DOC-${String(max + 1).padStart(3, "0")}`;
        }

        // (3) Insere a linha (RASCUNHO) + versão 1, na mesma transação.
        const [created] = await tx.insert(systemDocumentTemplates).values({
          tipo,
          titulo: input.titulo.trim(),
          descricao: input.descricao?.trim() || "Documento institucional avulso.",
          conteudoHtml: input.conteudoHtml,
          versaoAtual: 1,
          ativo: 1,
          atualizadoPorId: userId,
          atualizadoPorNome: userName,
          codigo,
          status: "rascunho",
          elaboradoPorId: userId,
          elaboradoPorNome: userName,
        } as any).returning({ id: systemDocumentTemplates.id });

        await tx.insert(systemDocumentTemplateVersions).values({
          templateId: created.id,
          versao: 1,
          conteudoHtml: input.conteudoHtml,
          comentario: "Criação do documento (Rev. 1)",
          criadoPorId: userId,
          criadoPorNome: userName,
        } as any);

        return { ok: true, tipo, templateId: created.id, codigo };
      });
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
      // tipo é OPCIONAL (Rev. 2751): ao criar um documento NOVO ainda não há tipo,
      // então passa-se `tituloDoc` e usam-se os placeholders comuns.
      tipo: tipoFlexSchema.optional(),
      tituloDoc: z.string().max(200).optional(),
      instrucoes: z.string().min(5, "Descreva o que o documento deve conter.").max(4000),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      if (!iaDisponivel().algum) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada. Cadastre uma chave (ex.: ANTHROPIC_API_KEY) para usar a geração automática." });
      }
      const meta = getDocMetaOrFallback(input.tipo ?? "", input.tituloDoc);
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
        const res = await withTimeout(invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.instrucoes },
          ],
          maxTokens: 4096,
          // Rev. 2753 — caminho rápido (Gemini Flash, thinking OFF) p/ responder
          // bem abaixo de 1 min; cai pro fluxo padrão (Claude) se falhar.
          fast: true,
        }));
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
      // tipo OPCIONAL (Rev. 2751): documento NOVO ainda não tem tipo → usa tituloDoc.
      tipo: tipoFlexSchema.optional(),
      tituloDoc: z.string().max(200).optional(),
      pdfBase64: z.string().min(1),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      if (!iaDisponivel().anthropic) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A leitura de PDF exige a IA Anthropic configurada (ANTHROPIC_API_KEY)." });
      }
      const meta = getDocMetaOrFallback(input.tipo ?? "", input.tituloDoc);
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
        out = await withTimeout(invokeAnthropicVision({
          prompt,
          base64: b64,
          mimeType: "application/pdf",
          systemPrompt,
          maxTokens: 4096,
        }));
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

  // ── Rev. 4440 — Margens configuráveis por empresa ──────────────────────────
  /** Retorna as 4 margens (mm) da empresa. Admin only. */
  getDocumentMargins: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companies } = await import("../../drizzle/schema");
      const row = await db
        .select({
          top:    companies.docMarginTopMm,
          right:  companies.docMarginRightMm,
          bottom: companies.docMarginBottomMm,
          left:   companies.docMarginLeftMm,
        })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      if (!row.length) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
      return {
        top:    row[0].top    ?? 10,
        right:  row[0].right  ?? 10,
        bottom: row[0].bottom ?? 10,
        left:   row[0].left   ?? 10,
      };
    }),

  /** Salva as 4 margens (mm) da empresa. Admin only. */
  updateDocumentMargins: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      top:       z.number().int().min(0).max(50),
      right:     z.number().int().min(0).max(50),
      bottom:    z.number().int().min(0).max(50),
      left:      z.number().int().min(0).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companies } = await import("../../drizzle/schema");
      await db
        .update(companies)
        .set({
          docMarginTopMm:    input.top,
          docMarginRightMm:  input.right,
          docMarginBottomMm: input.bottom,
          docMarginLeftMm:   input.left,
        })
        .where(eq(companies.id, input.companyId));
      return { ok: true };
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
