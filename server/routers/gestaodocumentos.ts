import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getEffectiveAllowedObraIds, userCanAccessObra } from "../db";
import { eq, and, desc, isNull, sql, ilike, or, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import {
  gdFicheirosObra,
  gdDisciplinas,
  gdPastas,
  gdTiposDocumento,
  gdDocumentos,
  gdRevisoes,
  gdRevisaoComentarios,
  gdDistribuicao,
  gdDownloadLog,
  gdArts,
  gdTiposSubpasta,
  gdCategoriasAdminPadrao,
  obras,
} from "../../drizzle/schema";

const isAdmin = (ctx: any) =>
  ctx.user.role === "admin" || ctx.user.role === "admin_master";

const PASTAS_PADRAO = ["DWG", "PDF", "IFC", "DOC"];

const DISCIPLINAS_PADRAO = [
  { nome: "Arquitetura", sigla: "ARQ", cor: "#3B82F6" },
  { nome: "Estrutural", sigla: "EST", cor: "#EF4444" },
  { nome: "Elétrica", sigla: "ELE", cor: "#F59E0B" },
  { nome: "Hidrossanitário", sigla: "HID", cor: "#06B6D4" },
  { nome: "HVAC / Climatização", sigla: "CLI", cor: "#8B5CF6" },
  { nome: "Incêndio", sigla: "INC", cor: "#DC2626" },
  { nome: "Fundações", sigla: "FUN", cor: "#78716C" },
  { nome: "Topografia", sigla: "TOP", cor: "#22C55E" },
  { nome: "Paisagismo", sigla: "PAI", cor: "#10B981" },
  { nome: "Comunicação / Dados", sigla: "COM", cor: "#6366F1" },
  { nome: "Automação", sigla: "AUT", cor: "#EC4899" },
  { nome: "Geotecnia", sigla: "GEO", cor: "#A16207" },
];

const SUBPASTAS_PADRAO_COMPLETAS = ["DWG", "PDF", "IFC", "DOC", "REVIT", "SKP", "XLS", "FOTOS", "BIM", "MEMORIAIS"];

// Rev. 1774 — Catálogo padrão de categorias administrativas (Documentos da Obra).
// Decisão fechada com o usuário (FC Engenharia): 9 categorias semente, com
// botão pra adicionar mais nas Configurações. Cada categoria vira uma
// "disciplina" tipoAcervo='documento' em cada obra, mantendo 100% das
// features atuais (sub-pastas livres, upload, revisões, busca).
const CATEGORIAS_ADMIN_PADRAO = [
  { chave: "contratos",   sigla: "CTR", nome: "Contratos & Aditivos",        cor: "#2563EB", ordem: 10 },
  { chave: "propostas",   sigla: "PRO", nome: "Propostas Comerciais",        cor: "#0EA5E9", ordem: 20 },
  { chave: "atas",        sigla: "ATA", nome: "Atas de Reunião",             cor: "#8B5CF6", ordem: 30 },
  { chave: "seguros",     sigla: "SEG", nome: "Seguros & Garantias",         cor: "#10B981", ordem: 40 },
  { chave: "licencas",    sigla: "LIC", nome: "Licenças & Alvarás",          cor: "#F59E0B", ordem: 50 },
  { chave: "arts",        sigla: "ART", nome: "ARTs / RRTs",                 cor: "#DC2626", ordem: 60 },
  { chave: "comunicacoes",sigla: "COM", nome: "Comunicações Oficiais",       cor: "#6366F1", ordem: 70 },
  { chave: "memoriais",   sigla: "MEM", nome: "Memoriais & Especificações",  cor: "#0891B2", ordem: 80 },
  { chave: "diversos",    sigla: "DIV", nome: "Diversos",                    cor: "#64748B", ordem: 90 },
];

// Rev. 1774 — Garante o catálogo de categorias administrativas para a
// empresa (lazy seed). Idempotente: só insere se vazio.
async function ensureCategoriasAdminCatalogo(db: any, companyId: number) {
  const existing = await db.select({ id: gdCategoriasAdminPadrao.id })
    .from(gdCategoriasAdminPadrao)
    .where(eq(gdCategoriasAdminPadrao.companyId, companyId))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(gdCategoriasAdminPadrao).values(
    CATEGORIAS_ADMIN_PADRAO.map(c => ({ ...c, companyId }))
  );
}

// Rev. 1775b — Auto-clone das disciplinas TEMPLATE da empresa (criadas
// historicamente em "Configurações > Disciplinas Padrão" com ficheiroId=NULL)
// pra dentro do ficheiro na PRIMEIRA abertura. Idempotente: só clona se o
// ficheiro tem ZERO disciplinas tipo 'projeto'. Replica também as 4 sub-pastas
// padrão (DWG/PDF/IFC/DOC). Sem isso, obras criadas após a Rev. 1774 abriam
// vazias mesmo a empresa tendo o template populado.
async function ensureDisciplinasProjetoNoFicheiro(db: any, companyId: number, ficheiroId: number) {
  const jaTem = await db.select({ id: gdDisciplinas.id }).from(gdDisciplinas)
    .where(and(
      eq(gdDisciplinas.companyId, companyId),
      eq(gdDisciplinas.ficheiroId, ficheiroId),
      sql`(${gdDisciplinas.tipoAcervo} = 'projeto' OR ${gdDisciplinas.tipoAcervo} IS NULL)`,
    ))
    .limit(1);
  if (jaTem.length > 0) return; // ficheiro já tem disciplinas técnicas
  const templates = await db.select().from(gdDisciplinas)
    .where(and(
      eq(gdDisciplinas.companyId, companyId),
      isNull(gdDisciplinas.ficheiroId),
      eq(gdDisciplinas.ativo, true),
    ));
  if (templates.length === 0) return; // empresa não tem template
  const novas = templates.map((t: any) => ({
    companyId,
    ficheiroId,
    nome: t.nome,
    sigla: t.sigla,
    cor: t.cor,
    tipoAcervo: "projeto" as const,
    ordem: t.ordem ?? 0,
  }));
  const inseridas = await db.insert(gdDisciplinas).values(novas).returning();
  const pastasValues = inseridas.flatMap((d: any) =>
    PASTAS_PADRAO.map(nome => ({ companyId, ficheiroId, disciplinaId: d.id, nome }))
  );
  if (pastasValues.length > 0) await db.insert(gdPastas).values(pastasValues);
}

// Rev. 1774 — Garante que as categorias administrativas ATIVAS do catálogo
// estão criadas como "disciplinas" tipoAcervo='documento' DENTRO do ficheiro.
// Idempotente por (ficheiroId, categoriaChave). Roda automaticamente em
// getFicheiroDetail e pode ser disparada manualmente em "Aplicar a todas".
async function ensureDisciplinasAdminNoFicheiro(db: any, companyId: number, ficheiroId: number) {
  await ensureCategoriasAdminCatalogo(db, companyId);
  const catalogo = await db.select().from(gdCategoriasAdminPadrao)
    .where(and(
      eq(gdCategoriasAdminPadrao.companyId, companyId),
      eq(gdCategoriasAdminPadrao.ativo, true),
    ));
  if (catalogo.length === 0) return;
  const existentes = await db.select({ chave: gdDisciplinas.categoriaChave })
    .from(gdDisciplinas)
    .where(and(
      eq(gdDisciplinas.companyId, companyId),
      eq(gdDisciplinas.ficheiroId, ficheiroId),
      eq(gdDisciplinas.tipoAcervo, "documento"),
    ));
  const jaExistem = new Set(existentes.map((e: any) => e.chave).filter(Boolean));
  const novas = catalogo
    .filter((c: any) => !jaExistem.has(c.chave))
    .map((c: any) => ({
      companyId,
      ficheiroId,
      nome: c.nome,
      sigla: c.sigla,
      cor: c.cor,
      tipoAcervo: "documento" as const,
      categoriaChave: c.chave,
      ordem: c.ordem ?? 0,
    }));
  if (novas.length > 0) {
    try {
      await db.insert(gdDisciplinas).values(novas);
    } catch (e: any) {
      // Race: 2 requests concorrentes da mesma obra fazem o seed simultâneo.
      // Índice parcial uniq_gd_disc_ficheiro_cat_chave (Rev. 1774b) protege
      // o banco; aqui só engolimos o duplicate key — a outra request já
      // criou as pastas. Outros erros propagam.
      if (e?.code !== "23505") throw e;
    }
  }
}

// ----- Helpers de controle de acesso por obra (Rev.1425) -----
async function assertObraAccess(ctx: any, obraId: number | null | undefined) {
  if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, obraId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
  }
}
async function assertDocAccess(ctx: any, db: any, docId: number, companyId: number) {
  const [doc] = await db.select({ obraId: gdDocumentos.obraId }).from(gdDocumentos)
    .where(and(eq(gdDocumentos.id, docId), eq(gdDocumentos.companyId, companyId)));
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
  await assertObraAccess(ctx, doc.obraId);
  return doc;
}
async function assertDocsAccess(ctx: any, db: any, docIds: number[], companyId: number) {
  if (docIds.length === 0) return;
  const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
  if (allowed === null) return;
  const docs = await db.select({ id: gdDocumentos.id, obraId: gdDocumentos.obraId }).from(gdDocumentos)
    .where(and(inArray(gdDocumentos.id, docIds), eq(gdDocumentos.companyId, companyId)));
  if (docs.length !== docIds.length) throw new TRPCError({ code: "NOT_FOUND" });
  for (const d of docs) {
    if (d.obraId == null || !allowed.includes(d.obraId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a uma das obras envolvidas" });
    }
  }
}
async function assertRevisaoAccess(ctx: any, db: any, revisaoId: number, companyId: number) {
  const [row] = await db.select({ obraId: gdDocumentos.obraId, documentoId: gdRevisoes.documentoId })
    .from(gdRevisoes)
    .innerJoin(gdDocumentos, and(eq(gdDocumentos.id, gdRevisoes.documentoId), eq(gdDocumentos.companyId, companyId)))
    .where(and(eq(gdRevisoes.id, revisaoId), eq(gdRevisoes.companyId, companyId)));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Revisão não encontrada" });
  await assertObraAccess(ctx, row.obraId);
  return row;
}
async function assertFicheiroAccess(ctx: any, db: any, ficheiroId: number, companyId: number) {
  const [f] = await db.select({ obraId: gdFicheirosObra.obraId }).from(gdFicheirosObra)
    .where(and(eq(gdFicheirosObra.id, ficheiroId), eq(gdFicheirosObra.companyId, companyId)));
  if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Ficheiro não encontrado" });
  await assertObraAccess(ctx, f.obraId);
  return f;
}
async function assertArtAccess(ctx: any, db: any, artId: number, companyId: number) {
  const [a] = await db.select({ obraId: gdArts.obraId }).from(gdArts)
    .where(and(eq(gdArts.id, artId), eq(gdArts.companyId, companyId)));
  if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "ART não encontrada" });
  await assertObraAccess(ctx, a.obraId);
  return a;
}

export const gestaoDocumentosRouter = router({

  listObrasDisponiveis: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && allowed.length === 0) return [];
      const allObras = await db.select({
        id: obras.id,
        nome: obras.nome,
        codigo: obras.codigo,
        cliente: obras.cliente,
        status: obras.status,
      }).from(obras)
        .where(and(
          eq(obras.companyId, input.companyId),
          isNull(obras.deletedAt),
          allowed !== null ? inArray(obras.id, allowed) : sql`TRUE`,
        ));
      return allObras.filter(o => {
        const s = (o.status || "").toLowerCase();
        return s.includes("andamento") || s.includes("planejamento") || s.includes("execu");
      });
    }),

  listFicheiros: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && allowed.length === 0) return [];
      const ficheiros = await db.select().from(gdFicheirosObra)
        .where(and(
          eq(gdFicheirosObra.companyId, input.companyId),
          allowed !== null ? inArray(gdFicheirosObra.obraId, allowed) : sql`TRUE`,
        ))
        .orderBy(desc(gdFicheirosObra.criadoEm));
      const obraIds = ficheiros.map(f => f.obraId).filter(Boolean);
      let obrasMap: Record<number, any> = {};
      if (obraIds.length > 0) {
        const obrasData = await db.select({
          id: obras.id,
          nome: obras.nome,
          codigo: obras.codigo,
          cliente: obras.cliente,
          status: obras.status,
        }).from(obras)
          .where(and(inArray(obras.id, obraIds), eq(obras.companyId, input.companyId)));
        obrasData.forEach(o => { obrasMap[o.id] = o; });
      }
      const disciplinasCounts = await db.select({
        ficheiroId: gdDisciplinas.ficheiroId,
        count: sql<number>`count(*)::int`,
      }).from(gdDisciplinas)
        .where(and(
          eq(gdDisciplinas.companyId, input.companyId),
          eq(gdDisciplinas.ativo, true),
        ))
        .groupBy(gdDisciplinas.ficheiroId);
      const discMap: Record<number, number> = {};
      disciplinasCounts.forEach((d: any) => { if (d.ficheiroId) discMap[d.ficheiroId] = d.count; });
      const docCounts = await db.select({
        ficheiroId: gdDocumentos.ficheiroId,
        count: sql<number>`count(*)::int`,
      }).from(gdDocumentos)
        .where(and(
          eq(gdDocumentos.companyId, input.companyId),
          isNull(gdDocumentos.deletedAt),
        ))
        .groupBy(gdDocumentos.ficheiroId);
      const docMap: Record<number, number> = {};
      docCounts.forEach((d: any) => { if (d.ficheiroId) docMap[d.ficheiroId] = d.count; });
      return ficheiros.map(f => ({
        ...f,
        obra: obrasMap[f.obraId] || null,
        totalDisciplinas: discMap[f.id] || 0,
        totalDocumentos: docMap[f.id] || 0,
      }));
    }),

  createFicheiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, input.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
      }
      const [obraCheck] = await db.select({ id: obras.id }).from(obras)
        .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId)));
      if (!obraCheck) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada ou não pertence à empresa" });
      const existing = await db.select().from(gdFicheirosObra)
        .where(and(
          eq(gdFicheirosObra.companyId, input.companyId),
          eq(gdFicheirosObra.obraId, input.obraId),
        ));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um ficheiro para esta obra" });
      }
      const [row] = await db.insert(gdFicheirosObra).values({
        companyId: input.companyId,
        obraId: input.obraId,
        criadoPor: ctx.user.id,
      }).returning();
      return row;
    }),

  deleteFicheiro: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [fich] = await db.select({ obraId: gdFicheirosObra.obraId }).from(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.id), eq(gdFicheirosObra.companyId, input.companyId)));
      if (!fich) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, fich.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
      }
      await db.delete(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.id), eq(gdFicheirosObra.companyId, input.companyId)));
      return { success: true };
    }),

  getFicheiroDetail: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [ficheiro] = await db.select().from(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.id), eq(gdFicheirosObra.companyId, input.companyId)));
      if (!ficheiro) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, ficheiro.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
      }
      const [obra] = await db.select({
        id: obras.id,
        nome: obras.nome,
        codigo: obras.codigo,
        cliente: obras.cliente,
        status: obras.status,
      }).from(obras).where(and(eq(obras.id, ficheiro.obraId), eq(obras.companyId, input.companyId)));
      // Rev. 1775b — Auto-clone das disciplinas TEMPLATE da empresa pra dentro
      // do ficheiro (recupera ARQ/EST/ROHR… que ficavam só no template). Roda
      // ANTES do auto-seed das categorias admin pra garantir ordem visual.
      try { await ensureDisciplinasProjetoNoFicheiro(db, input.companyId, input.id); }
      catch (e: any) {
        console.error("[GD] ensureDisciplinasProjetoNoFicheiro FAIL", {
          companyId: input.companyId, ficheiroId: input.id,
          code: e?.code, message: e?.message,
        });
      }
      // Rev. 1774 — Auto-seed silencioso das categorias admin (Documentos da Obra).
      try { await ensureDisciplinasAdminNoFicheiro(db, input.companyId, input.id); }
      catch (e: any) {
        console.error("[GD] ensureDisciplinasAdminNoFicheiro FAIL", {
          companyId: input.companyId, ficheiroId: input.id,
          code: e?.code, constraint: e?.constraint, detail: e?.detail,
          message: e?.message, stack: e?.stack?.split("\n").slice(0, 3).join(" | "),
        });
      }
      const disciplinas = await db.select().from(gdDisciplinas)
        .where(and(
          eq(gdDisciplinas.companyId, input.companyId),
          eq(gdDisciplinas.ficheiroId, input.id),
          eq(gdDisciplinas.ativo, true),
        ))
        .orderBy(gdDisciplinas.ordem, gdDisciplinas.nome);
      const pastas = await db.select().from(gdPastas)
        .where(and(
          eq(gdPastas.companyId, input.companyId),
          eq(gdPastas.ficheiroId, input.id),
        ));
      const docs = await db.select().from(gdDocumentos)
        .where(and(
          eq(gdDocumentos.companyId, input.companyId),
          eq(gdDocumentos.ficheiroId, input.id),
          isNull(gdDocumentos.deletedAt),
        ))
        .orderBy(desc(gdDocumentos.criadoEm));
      return { ficheiro, obra, disciplinas, pastas, docs };
    }),

  createDisciplinaFicheiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ficheiroId: z.number(),
      nome: z.string().min(1),
      sigla: z.string().min(1).max(10),
      cor: z.string().optional(),
      subpastas: z.array(z.string()).optional(),
      // Rev. 1882 — separa categorias do acervo "documento" (Contratos,
      // Atas, ARTs…) das disciplinas técnicas "projeto" (ARQ, EST…). Sem
      // isto, qualquer pasta criada pelo modal caía sempre em "projeto" e
      // não aparecia na aba Documentos da Obra.
      tipoAcervo: z.enum(["projeto", "documento"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertFicheiroAccess(ctx, db, input.ficheiroId, input.companyId);
      const [disc] = await db.insert(gdDisciplinas).values({
        companyId: input.companyId,
        ficheiroId: input.ficheiroId,
        nome: input.nome,
        sigla: input.sigla,
        cor: input.cor,
        tipoAcervo: input.tipoAcervo || "projeto",
      }).returning();
      // Rev. 1882 — categorias de "documento" não precisam de DWG/PDF/IFC/DOC
      // pré-criadas. Só cria sub-pastas se vier algo explícito do front.
      const selectedPastas = input.subpastas && input.subpastas.length > 0
        ? input.subpastas
        : (input.tipoAcervo === "documento" ? [] : PASTAS_PADRAO);
      if (selectedPastas.length > 0) {
        const pastasValues = selectedPastas.map(nome => ({
          companyId: input.companyId,
          ficheiroId: input.ficheiroId,
          disciplinaId: disc.id,
          nome,
        }));
        await db.insert(gdPastas).values(pastasValues);
      }
      return disc;
    }),

  bulkCreateDisciplinasFicheiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ficheiroId: z.number(),
      disciplinas: z.array(z.object({
        nome: z.string().min(1),
        sigla: z.string().min(1).max(10),
        cor: z.string().optional(),
        subpastas: z.array(z.string()).min(1),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertFicheiroAccess(ctx, db, input.ficheiroId, input.companyId);
      const results = [];
      for (const d of input.disciplinas) {
        const [disc] = await db.insert(gdDisciplinas).values({
          companyId: input.companyId,
          ficheiroId: input.ficheiroId,
          nome: d.nome,
          sigla: d.sigla,
          cor: d.cor,
        }).returning();
        const pastasValues = d.subpastas.map(nome => ({
          companyId: input.companyId,
          ficheiroId: input.ficheiroId,
          disciplinaId: disc.id,
          nome,
        }));
        await db.insert(gdPastas).values(pastasValues);
        results.push(disc);
      }
      return results;
    }),

  deleteDisciplinaFicheiro: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [disc] = await db.select({ ficheiroId: gdDisciplinas.ficheiroId }).from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.id, input.id), eq(gdDisciplinas.companyId, input.companyId)));
      if (!disc) throw new TRPCError({ code: "NOT_FOUND" });
      if (disc.ficheiroId) await assertFicheiroAccess(ctx, db, disc.ficheiroId, input.companyId);
      await db.update(gdDisciplinas).set({ ativo: false })
        .where(and(eq(gdDisciplinas.id, input.id), eq(gdDisciplinas.companyId, input.companyId)));
      return { success: true };
    }),

  // Rev. 1776 — Cria uma sub-pasta nova dentro de uma disciplina existente.
  // Usado pelo botão "+ Nova" na árvore. Bloqueia colisão por (disciplinaId, nome).
  createPasta: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      disciplinaId: z.number(),
      nome: z.string().min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [disc] = await db.select({ ficheiroId: gdDisciplinas.ficheiroId }).from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.id, input.disciplinaId), eq(gdDisciplinas.companyId, input.companyId)));
      if (!disc) throw new TRPCError({ code: "NOT_FOUND", message: "Disciplina não encontrada" });
      if (disc.ficheiroId) await assertFicheiroAccess(ctx, db, disc.ficheiroId, input.companyId);
      const novoNome = input.nome.trim().toUpperCase();
      const [conflict] = await db.select({ id: gdPastas.id }).from(gdPastas)
        .where(and(
          eq(gdPastas.companyId, input.companyId),
          eq(gdPastas.disciplinaId, input.disciplinaId),
          eq(gdPastas.nome, novoNome),
        ));
      if (conflict) throw new TRPCError({ code: "CONFLICT", message: `Já existe uma sub-pasta "${novoNome}" nesta disciplina.` });
      const [row] = await db.insert(gdPastas).values({
        companyId: input.companyId,
        ficheiroId: disc.ficheiroId,
        disciplinaId: input.disciplinaId,
        nome: novoNome,
      }).returning();
      return row;
    }),

  deletePasta: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [p] = await db.select({ ficheiroId: gdPastas.ficheiroId }).from(gdPastas)
        .where(and(eq(gdPastas.id, input.id), eq(gdPastas.companyId, input.companyId)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      if (p.ficheiroId) await assertFicheiroAccess(ctx, db, p.ficheiroId, input.companyId);
      await db.delete(gdPastas)
        .where(and(eq(gdPastas.id, input.id), eq(gdPastas.companyId, input.companyId)));
      return { success: true };
    }),

  // Rev. 1717 — Renomear sub-pasta. Mantém companyId/ficheiroId/disciplinaId
  // intactos; só atualiza `nome`. Como `selectedSubpasta` no client usa o
  // próprio nome como chave (não o id), e os documentos referenciam a
  // subpasta por `subpasta` (texto, ver gdDocumentos), também propagamos
  // o rename para os documentos da MESMA disciplina+subpasta antiga,
  // evitando órfãos invisíveis na árvore.
  updatePasta: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [p] = await db.select().from(gdPastas)
        .where(and(eq(gdPastas.id, input.id), eq(gdPastas.companyId, input.companyId)));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      if (p.ficheiroId) await assertFicheiroAccess(ctx, db, p.ficheiroId, input.companyId);
      const novoNome = input.nome.trim().toUpperCase();
      const nomeAntigo = p.nome;
      if (novoNome === nomeAntigo) return { success: true };
      // Bloqueia colisão dentro da mesma disciplina
      const [conflict] = await db.select({ id: gdPastas.id }).from(gdPastas)
        .where(and(
          eq(gdPastas.companyId, input.companyId),
          eq(gdPastas.disciplinaId, p.disciplinaId!),
          eq(gdPastas.nome, novoNome),
        ));
      if (conflict) throw new TRPCError({ code: "CONFLICT", message: `Já existe uma sub-pasta "${novoNome}" nesta disciplina.` });
      await db.update(gdPastas).set({ nome: novoNome })
        .where(and(eq(gdPastas.id, input.id), eq(gdPastas.companyId, input.companyId)));
      // Reconcilia documentos — campo `subpasta` em gdDocumentos é texto livre.
      await db.update(gdDocumentos).set({ subpasta: novoNome })
        .where(and(
          eq(gdDocumentos.companyId, input.companyId),
          eq(gdDocumentos.disciplinaId, p.disciplinaId!),
          eq(gdDocumentos.subpasta, nomeAntigo),
        ));
      return { success: true };
    }),

  listPastas: protectedProcedure
    .input(z.object({ companyId: z.number(), disciplinaId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [disc] = await db.select({ ficheiroId: gdDisciplinas.ficheiroId }).from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.id, input.disciplinaId), eq(gdDisciplinas.companyId, input.companyId)));
      if (disc?.ficheiroId) await assertFicheiroAccess(ctx, db, disc.ficheiroId, input.companyId);
      return db.select().from(gdPastas)
        .where(and(
          eq(gdPastas.companyId, input.companyId),
          eq(gdPastas.disciplinaId, input.disciplinaId),
        ))
        .orderBy(gdPastas.nome);
    }),

  listDisciplinas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.companyId, input.companyId), isNull(gdDisciplinas.ficheiroId)))
        .orderBy(gdDisciplinas.nome);
    }),

  createDisciplina: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      sigla: z.string().min(1).max(10),
      cor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.insert(gdDisciplinas).values(input).returning();
      return row;
    }),

  updateDisciplina: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(1).optional(),
      sigla: z.string().min(1).max(10).optional(),
      cor: z.string().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [disc] = await db.select({ ficheiroId: gdDisciplinas.ficheiroId }).from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.id, input.id), eq(gdDisciplinas.companyId, input.companyId)));
      if (!disc) throw new TRPCError({ code: "NOT_FOUND" });
      if (disc.ficheiroId) await assertFicheiroAccess(ctx, db, disc.ficheiroId, input.companyId);
      const { id, companyId, ...data } = input;
      await db.update(gdDisciplinas).set(data)
        .where(and(eq(gdDisciplinas.id, id), eq(gdDisciplinas.companyId, companyId)));
      return { success: true };
    }),

  deleteDisciplina: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(gdDisciplinas)
        .where(and(eq(gdDisciplinas.id, input.id), eq(gdDisciplinas.companyId, input.companyId), isNull(gdDisciplinas.ficheiroId)));
      return { success: true };
    }),

  listTiposDocumento: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(gdTiposDocumento)
        .where(eq(gdTiposDocumento.companyId, input.companyId))
        .orderBy(gdTiposDocumento.nome);
    }),

  createTipoDocumento: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      sigla: z.string().min(1).max(10),
      requerAprovacao: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.insert(gdTiposDocumento).values(input).returning();
      return row;
    }),

  updateTipoDocumento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(1).optional(),
      sigla: z.string().min(1).max(10).optional(),
      requerAprovacao: z.boolean().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, companyId, ...data } = input;
      await db.update(gdTiposDocumento).set(data)
        .where(and(eq(gdTiposDocumento.id, id), eq(gdTiposDocumento.companyId, companyId)));
      return { success: true };
    }),

  deleteTipoDocumento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(gdTiposDocumento)
        .where(and(eq(gdTiposDocumento.id, input.id), eq(gdTiposDocumento.companyId, input.companyId)));
      return { success: true };
    }),

  updateTipoSubpasta: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().min(1).max(50).optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, companyId, ...data } = input;
      await db.update(gdTiposSubpasta).set(data)
        .where(and(eq(gdTiposSubpasta.id, id), eq(gdTiposSubpasta.companyId, companyId)));
      return { success: true };
    }),

  listTiposSubpasta: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(gdTiposSubpasta)
        .where(and(eq(gdTiposSubpasta.companyId, input.companyId), eq(gdTiposSubpasta.ativo, true)))
        .orderBy(gdTiposSubpasta.nome);
    }),

  createTipoSubpasta: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.insert(gdTiposSubpasta).values(input).returning();
      return row;
    }),

  deleteTipoSubpasta: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(gdTiposSubpasta).set({ ativo: false })
        .where(and(eq(gdTiposSubpasta.id, input.id), eq(gdTiposSubpasta.companyId, input.companyId)));
      return { success: true };
    }),

  seedTiposSubpastaPadrao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(gdTiposSubpasta)
        .where(and(eq(gdTiposSubpasta.companyId, input.companyId), eq(gdTiposSubpasta.ativo, true)));
      if (existing.length > 0) return existing;
      const defaults = SUBPASTAS_PADRAO_COMPLETAS.map(nome => ({
        companyId: input.companyId,
        nome,
        padrao: PASTAS_PADRAO.includes(nome),
      }));
      return db.insert(gdTiposSubpasta).values(defaults).returning();
    }),

  seedDisciplinasPadrao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.companyId, input.companyId), isNull(gdDisciplinas.ficheiroId)));
      if (existing.length > 0) return existing;
      const defaults = DISCIPLINAS_PADRAO.map(d => ({
        companyId: input.companyId,
        nome: d.nome,
        sigla: d.sigla,
        cor: d.cor,
      }));
      return db.insert(gdDisciplinas).values(defaults).returning();
    }),

  seedTiposDocumentoPadrao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(gdTiposDocumento)
        .where(eq(gdTiposDocumento.companyId, input.companyId));
      if (existing.length > 0) return existing;
      const TIPOS_DOC_PADRAO = [
        { nome: "Projeto Executivo", sigla: "PE" },
        { nome: "Projeto Básico", sigla: "PB" },
        { nome: "Projeto Legal", sigla: "PL" },
        { nome: "Memorial Descritivo", sigla: "MD" },
        { nome: "Memorial de Cálculo", sigla: "MC" },
        { nome: "Especificação Técnica", sigla: "ET" },
        { nome: "Relatório Técnico", sigla: "RT" },
        { nome: "Lista de Materiais", sigla: "LM" },
        { nome: "Detalhamento", sigla: "DT" },
        { nome: "As-Built", sigla: "AB" },
      ];
      const defaults = TIPOS_DOC_PADRAO.map(d => ({
        companyId: input.companyId,
        nome: d.nome,
        sigla: d.sigla,
      }));
      return db.insert(gdTiposDocumento).values(defaults).returning();
    }),

  listDocumentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      disciplinaId: z.number().optional(),
      subpasta: z.string().optional(),
      tipoDocumentoId: z.number().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (input.obraId && allowed !== null && !allowed.includes(input.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
      }

      const conditions: any[] = [
        eq(gdDocumentos.companyId, input.companyId),
        isNull(gdDocumentos.deletedAt),
      ];
      if (input.obraId) conditions.push(eq(gdDocumentos.obraId, input.obraId));
      else if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(gdDocumentos.obraId, allowed));
      }
      if (input.disciplinaId) conditions.push(eq(gdDocumentos.disciplinaId, input.disciplinaId));
      if (input.subpasta) conditions.push(eq(gdDocumentos.subpasta, input.subpasta));
      if (input.tipoDocumentoId) conditions.push(eq(gdDocumentos.tipoDocumentoId, input.tipoDocumentoId));
      if (input.status) conditions.push(eq(gdDocumentos.status, input.status));
      if (input.search) {
        conditions.push(or(
          ilike(gdDocumentos.codigo, `%${input.search}%`),
          ilike(gdDocumentos.titulo, `%${input.search}%`),
        ));
      }

      return db.select().from(gdDocumentos)
        .where(and(...conditions))
        .orderBy(desc(gdDocumentos.atualizadoEm));
    }),

  getDocumento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [doc] = await db.select().from(gdDocumentos)
        .where(and(eq(gdDocumentos.id, input.id), eq(gdDocumentos.companyId, input.companyId)));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
      await assertObraAccess(ctx, doc.obraId);
      return doc;
    }),

  createDocumento: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      ficheiroId: z.number().nullable().optional(),
      disciplinaId: z.number().nullable().optional(),
      pastaId: z.number().nullable().optional(),
      subpasta: z.string().nullable().optional(),
      tipoDocumentoId: z.number().nullable().optional(),
      codigo: z.string().min(1),
      titulo: z.string().min(1),
      descricao: z.string().optional(),
      emitente: z.string().optional(),
      responsavelId: z.number().nullable().optional(),
      dataEmissao: z.preprocess(v => (v === "" ? undefined : v), z.string().optional()),
      dataValidade: z.preprocess(v => (v === "" ? undefined : v), z.string().optional()),
      tags: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertObraAccess(ctx, input.obraId);
      const [row] = await db.insert(gdDocumentos).values({
        ...input,
        criadoPor: ctx.user.id,
      }).returning();
      return row;
    }),

  syncCounterpartStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      docIds: z.array(z.number()).min(1),
      status: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocsAccess(ctx, db, input.docIds, input.companyId);
      const docs = await db.select().from(gdDocumentos)
        .where(and(
          inArray(gdDocumentos.id, input.docIds),
          eq(gdDocumentos.companyId, input.companyId),
          isNull(gdDocumentos.deletedAt),
        ));
      const counterpartSubpasta: Record<string, string> = { DWG: "PDF", PDF: "DWG" };
      let synced = 0;
      for (const doc of docs) {
        const sp = (doc.subpasta || "").toUpperCase();
        const targetSp = counterpartSubpasta[sp];
        if (!targetSp) continue;
        const titulo = (doc.titulo || doc.codigo || "").replace(/\.[^.]+$/, "").trim();
        const baseMatch = titulo.replace(/-R\d{2,3}$/i, "");
        if (!baseMatch) continue;
        const counterparts = await db.select().from(gdDocumentos)
          .where(and(
            eq(gdDocumentos.companyId, input.companyId),
            eq(gdDocumentos.obraId, doc.obraId),
            sql`UPPER(${gdDocumentos.subpasta}) = ${targetSp}`,
            isNull(gdDocumentos.deletedAt),
          ));
        for (const cp of counterparts) {
          const cpTitulo = (cp.titulo || cp.codigo || "").replace(/\.[^.]+$/, "").trim();
          const cpBase = cpTitulo.replace(/-R\d{2,3}$/i, "");
          if (cpBase.toLowerCase() === baseMatch.toLowerCase() && cp.status !== input.status) {
            await db.update(gdDocumentos).set({ status: input.status, atualizadoEm: new Date() })
              .where(and(eq(gdDocumentos.id, cp.id), eq(gdDocumentos.companyId, input.companyId)));
            synced++;
          }
        }
      }
      return { success: true, synced };
    }),

  updateDocumento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      disciplinaId: z.number().nullable().optional(),
      subpasta: z.string().nullable().optional(),
      tipoDocumentoId: z.number().nullable().optional(),
      codigo: z.string().min(1).optional(),
      titulo: z.string().min(1).optional(),
      descricao: z.string().nullable().optional(),
      status: z.string().optional(),
      revisaoAtual: z.string().nullable().optional(),
      emitente: z.string().nullable().optional(),
      responsavelId: z.number().nullable().optional(),
      dataEmissao: z.preprocess(v => (v === "" ? null : v), z.string().nullable().optional()),
      dataValidade: z.preprocess(v => (v === "" ? null : v), z.string().nullable().optional()),
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.id, input.companyId);
      const { id, companyId, ...data } = input;
      await db.update(gdDocumentos).set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(gdDocumentos.id, id), eq(gdDocumentos.companyId, companyId)));
      return { success: true };
    }),

  deleteDocumento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.id, input.companyId);
      await db.update(gdDocumentos).set({ deletedAt: new Date() })
        .where(and(eq(gdDocumentos.id, input.id), eq(gdDocumentos.companyId, input.companyId)));
      return { success: true };
    }),

  deleteDocumentosBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocsAccess(ctx, db, input.ids, input.companyId);
      await db.update(gdDocumentos).set({ deletedAt: new Date() })
        .where(and(inArray(gdDocumentos.id, input.ids), eq(gdDocumentos.companyId, input.companyId)));
      return { success: true, count: input.ids.length };
    }),

  updateStatusBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number(), status: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocsAccess(ctx, db, input.ids, input.companyId);
      await db.update(gdDocumentos).set({ status: input.status, atualizadoEm: new Date() })
        .where(and(inArray(gdDocumentos.id, input.ids), eq(gdDocumentos.companyId, input.companyId)));
      return { success: true, count: input.ids.length };
    }),

  uploadArquivoDocumento: protectedProcedure
    .input(z.object({
      documentoId: z.number(),
      companyId: z.number(),
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string(),
      fileSize: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const buf = Buffer.from(input.fileBase64, "base64");
      if (buf.length > 50 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Arquivo excede 50MB" });
      }
      const [doc] = await db.select().from(gdDocumentos)
        .where(and(eq(gdDocumentos.id, input.documentoId), eq(gdDocumentos.companyId, input.companyId)));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
      await assertObraAccess(ctx, doc.obraId);
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
      const key = `gestao-documentos/${input.companyId}/${doc.obraId}/${Date.now()}-${safeName}`;
      const { url } = await storagePut(key, buf, input.contentType);
      await db.update(gdDocumentos).set({
        arquivoUrl: url,
        arquivoNome: input.fileName,
        arquivoTamanho: buf.length,
        atualizadoEm: new Date(),
      }).where(and(eq(gdDocumentos.id, input.documentoId), eq(gdDocumentos.companyId, input.companyId)));
      return { url, fileName: input.fileName };
    }),

  listRevisoes: protectedProcedure
    .input(z.object({ companyId: z.number(), documentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      return db.select().from(gdRevisoes)
        .where(and(
          eq(gdRevisoes.companyId, input.companyId),
          eq(gdRevisoes.documentoId, input.documentoId),
        ))
        .orderBy(desc(gdRevisoes.criadoEm));
    }),

  createRevisao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      documentoId: z.number(),
      numero: z.string().min(1),
      descricao: z.string().optional(),
      arquivoUrl: z.string().optional(),
      arquivoNome: z.string().optional(),
      arquivoTamanho: z.number().optional(),
      arquivoMime: z.string().optional(),
      motivoRevisao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      const [rev] = await db.insert(gdRevisoes).values({
        ...input,
        criadoPor: ctx.user.id,
      }).returning();

      return rev;
    }),

  aprovarRevisao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      documentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      await db.update(gdRevisoes).set({
        status: "aprovada",
        aprovadoPor: ctx.user.id,
        aprovadoEm: new Date(),
      }).where(and(eq(gdRevisoes.id, input.id), eq(gdRevisoes.companyId, input.companyId)));

      const [rev] = await db.select().from(gdRevisoes)
        .where(and(eq(gdRevisoes.id, input.id), eq(gdRevisoes.companyId, input.companyId)));
      if (rev && rev.documentoId === input.documentoId) {
        await db.update(gdDocumentos).set({
          revisaoAtual: rev.numero,
          status: "aprovado",
          atualizadoEm: new Date(),
        }).where(and(
          eq(gdDocumentos.id, input.documentoId),
          eq(gdDocumentos.companyId, input.companyId),
        ));
      }
      return { success: true };
    }),

  rejeitarRevisao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      documentoId: z.number(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      await db.update(gdRevisoes).set({ status: "rejeitada" })
        .where(and(eq(gdRevisoes.id, input.id), eq(gdRevisoes.companyId, input.companyId)));

      await db.update(gdDocumentos).set({
        status: "em_elaboracao",
        atualizadoEm: new Date(),
      }).where(and(
        eq(gdDocumentos.id, input.documentoId),
        eq(gdDocumentos.companyId, input.companyId),
      ));
      return { success: true };
    }),

  deleteRevisao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertRevisaoAccess(ctx, db, input.id, input.companyId);
      await db.delete(gdRevisoes).where(and(
        eq(gdRevisoes.id, input.id),
        eq(gdRevisoes.companyId, input.companyId),
      ));
      return { success: true };
    }),

  listComentarios: protectedProcedure
    .input(z.object({ companyId: z.number(), revisaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertRevisaoAccess(ctx, db, input.revisaoId, input.companyId);
      return db.select().from(gdRevisaoComentarios)
        .where(and(
          eq(gdRevisaoComentarios.companyId, input.companyId),
          eq(gdRevisaoComentarios.revisaoId, input.revisaoId),
        ))
        .orderBy(gdRevisaoComentarios.criadoEm);
    }),

  createComentario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      revisaoId: z.number(),
      comentario: z.string().min(1),
      tipo: z.string().optional(),
      posicaoX: z.number().optional(),
      posicaoY: z.number().optional(),
      pagina: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertRevisaoAccess(ctx, db, input.revisaoId, input.companyId);
      const [row] = await db.insert(gdRevisaoComentarios).values({
        ...input,
        usuarioId: ctx.user.id,
      }).returning();
      return row;
    }),

  resolverComentario: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [c] = await db.select({ revisaoId: gdRevisaoComentarios.revisaoId }).from(gdRevisaoComentarios)
        .where(and(eq(gdRevisaoComentarios.id, input.id), eq(gdRevisaoComentarios.companyId, input.companyId)));
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      await assertRevisaoAccess(ctx, db, c.revisaoId, input.companyId);
      await db.update(gdRevisaoComentarios).set({ resolvido: true })
        .where(and(eq(gdRevisaoComentarios.id, input.id), eq(gdRevisaoComentarios.companyId, input.companyId)));
      return { success: true };
    }),

  listDistribuicao: protectedProcedure
    .input(z.object({ companyId: z.number(), documentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      return db.select().from(gdDistribuicao)
        .where(and(
          eq(gdDistribuicao.companyId, input.companyId),
          eq(gdDistribuicao.documentoId, input.documentoId),
        ))
        .orderBy(desc(gdDistribuicao.dataEnvio));
    }),

  distribuirDocumento: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      documentoId: z.number(),
      revisaoId: z.number().optional(),
      usuarioIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      const values = input.usuarioIds.map(uid => ({
        companyId: input.companyId,
        documentoId: input.documentoId,
        revisaoId: input.revisaoId,
        usuarioId: uid,
      }));
      if (values.length > 0) {
        await db.insert(gdDistribuicao).values(values);
      }
      return { success: true, count: values.length };
    }),

  confirmarRecebimento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [d] = await db.select({ documentoId: gdDistribuicao.documentoId }).from(gdDistribuicao)
        .where(and(eq(gdDistribuicao.id, input.id), eq(gdDistribuicao.companyId, input.companyId)));
      if (!d) throw new TRPCError({ code: "NOT_FOUND" });
      await assertDocAccess(ctx, db, d.documentoId, input.companyId);
      await db.update(gdDistribuicao).set({
        confirmado: true,
        confirmadoEm: new Date(),
      }).where(and(eq(gdDistribuicao.id, input.id), eq(gdDistribuicao.companyId, input.companyId)));
      return { success: true };
    }),

  logDownload: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      documentoId: z.number(),
      revisaoId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDocAccess(ctx, db, input.documentoId, input.companyId);
      await db.insert(gdDownloadLog).values({
        ...input,
        usuarioId: ctx.user.id,
      });
      return { success: true };
    }),

  getDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (input.obraId && allowed !== null && !allowed.includes(input.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
      }

      const conditions: any[] = [
        eq(gdDocumentos.companyId, input.companyId),
        isNull(gdDocumentos.deletedAt),
      ];
      if (input.obraId) conditions.push(eq(gdDocumentos.obraId, input.obraId));
      else if (allowed !== null) {
        if (allowed.length === 0) conditions.push(sql`FALSE`);
        else conditions.push(inArray(gdDocumentos.obraId, allowed));
      }

      const docs = await db.select().from(gdDocumentos).where(and(...conditions));

      const total = docs.length;
      const porStatus: Record<string, number> = {};
      docs.forEach(d => {
        const s = d.status || "sem_status";
        porStatus[s] = (porStatus[s] || 0) + 1;
      });

      const revs = total > 0
        ? await db.select().from(gdRevisoes)
            .where(and(
              eq(gdRevisoes.companyId, input.companyId),
              inArray(gdRevisoes.documentoId, docs.map(d => d.id)),
            ))
        : [];

      const totalRevisoes = revs.length;
      const pendentes = revs.filter(r => r.status === "pendente").length;

      const artConditions: any[] = [eq(gdArts.companyId, input.companyId)];
      if (input.obraId) artConditions.push(eq(gdArts.obraId, input.obraId));
      else if (allowed !== null) {
        if (allowed.length === 0) artConditions.push(sql`FALSE`);
        else artConditions.push(inArray(gdArts.obraId, allowed));
      }
      const arts = await db.select().from(gdArts).where(and(...artConditions));

      const hoje = new Date();
      const artsVencendo = arts.filter(a => {
        if (!a.dataValidade) return false;
        const diff = (new Date(a.dataValidade).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      });
      const artsVencidas = arts.filter(a => {
        if (!a.dataValidade) return false;
        return new Date(a.dataValidade).getTime() < hoje.getTime();
      });

      const aprovados = porStatus.aprovado || 0;
      const taxaAprovacao = total > 0 ? Math.round((aprovados / total) * 100) : 0;
      const emRevisao = porStatus.em_revisao || 0;
      const emElaboracao = porStatus.em_elaboracao || 0;
      const reprovados = porStatus.reprovado || 0;
      const obsoletos = porStatus.obsoleto || 0;
      const cancelados = porStatus.cancelado || 0;

      const docsAtivos = total - obsoletos - cancelados;
      const dpi = docsAtivos > 0 ? Math.round((aprovados / docsAtivos) * 100) : 0;

      const revisoesPorDoc: Record<number, number> = {};
      revs.forEach(r => {
        revisoesPorDoc[r.documentoId] = (revisoesPorDoc[r.documentoId] || 0) + 1;
      });
      const docsComRevisao = Object.keys(revisoesPorDoc).length;
      const mediaRevisoesPorDoc = docsComRevisao > 0
        ? Math.round((totalRevisoes / docsComRevisao) * 10) / 10 : 0;

      const revsAprovadas = revs.filter(r => r.status === "aprovada");
      const revsRejeitadas = revs.filter(r => r.status === "rejeitada");
      const ftr = (revsAprovadas.length + revsRejeitadas.length) > 0
        ? Math.round((revsAprovadas.length / (revsAprovadas.length + revsRejeitadas.length)) * 100) : 100;

      const tempoRevisao: number[] = [];
      const docCriadoMap: Record<number, Date> = {};
      docs.forEach(d => { if (d.criadoEm) docCriadoMap[d.id] = new Date(d.criadoEm); });
      revsAprovadas.forEach(r => {
        if (r.criadoEm && r.aprovadoEm) {
          const diff = (new Date(r.aprovadoEm).getTime() - new Date(r.criadoEm).getTime()) / (1000 * 60 * 60 * 24);
          if (diff >= 0) tempoRevisao.push(diff);
        }
      });
      const tempoMedioRevisaoDias = tempoRevisao.length > 0
        ? Math.round((tempoRevisao.reduce((a, b) => a + b, 0) / tempoRevisao.length) * 10) / 10 : 0;

      const disciplinasData = await db.select().from(gdDisciplinas)
        .where(and(eq(gdDisciplinas.companyId, input.companyId), eq(gdDisciplinas.ativo, true)));
      const porDisciplina: { id: number; nome: string; sigla: string; cor: string; total: number; aprovados: number }[] = [];
      disciplinasData.forEach(disc => {
        const discDocs = docs.filter(d => d.disciplinaId === disc.id);
        const discAprovados = discDocs.filter(d => d.status === "aprovado").length;
        porDisciplina.push({
          id: disc.id,
          nome: disc.nome,
          sigla: disc.sigla,
          cor: disc.cor || "#3b82f6",
          total: discDocs.length,
          aprovados: discAprovados,
        });
      });

      const docsVencidos = docs.filter(d => {
        if (!d.dataValidade) return false;
        return new Date(d.dataValidade).getTime() < hoje.getTime() && d.status !== "cancelado" && d.status !== "obsoleto";
      }).length;

      const docsVencendoEm30 = docs.filter(d => {
        if (!d.dataValidade) return false;
        const diff = (new Date(d.dataValidade).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30 && d.status !== "cancelado" && d.status !== "obsoleto";
      }).length;

      const meses7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mesAno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const mesLabel = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        const docsDoMes = docs.filter(doc => {
          if (!doc.criadoEm) return false;
          const created = new Date(doc.criadoEm);
          return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
        }).length;
        const revsDoMes = revs.filter(rev => {
          if (!rev.criadoEm) return false;
          const created = new Date(rev.criadoEm);
          return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
        }).length;
        meses7.push({ mesAno, mesLabel, documentos: docsDoMes, revisoes: revsDoMes });
      }

      const docsRecentes = docs
        .sort((a, b) => (b.criadoEm ? new Date(b.criadoEm).getTime() : 0) - (a.criadoEm ? new Date(a.criadoEm).getTime() : 0))
        .slice(0, 5)
        .map(d => ({ id: d.id, codigo: d.codigo, titulo: d.titulo, status: d.status, criadoEm: d.criadoEm }));

      return {
        totalDocumentos: total,
        porStatus,
        totalRevisoes,
        revisoesPendentes: pendentes,
        totalArts: arts.length,
        artsVencendo: artsVencendo.length,
        artsVencidas: artsVencidas.length,
        taxaAprovacao,
        dpi,
        emRevisao,
        emElaboracao,
        reprovados,
        obsoletos,
        cancelados,
        mediaRevisoesPorDoc,
        ftr,
        tempoMedioRevisaoDias,
        porDisciplina,
        docsVencidos,
        docsVencendoEm30,
        tendencia7meses: meses7,
        docsRecentes,
        docsAtivos,
      };
    }),

  listArts: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (input.obraId && allowed !== null && !allowed.includes(input.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta obra" });
      }
      const conditions: any[] = [eq(gdArts.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(gdArts.obraId, input.obraId));
      else if (allowed !== null) {
        if (allowed.length === 0) return [];
        conditions.push(inArray(gdArts.obraId, allowed));
      }
      return db.select().from(gdArts).where(and(...conditions)).orderBy(desc(gdArts.criadoEm));
    }),

  createArt: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      documentoId: z.number().nullable().optional(),
      tipo: z.string().min(1),
      numero: z.string().min(1),
      profissional: z.string().min(1),
      creaOuCau: z.string().optional(),
      dataEmissao: z.preprocess(v => (v === "" ? undefined : v), z.string().optional()),
      dataValidade: z.preprocess(v => (v === "" ? undefined : v), z.string().optional()),
      arquivoUrl: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertObraAccess(ctx, input.obraId);
      const [row] = await db.insert(gdArts).values({
        ...input,
        criadoPor: ctx.user.id,
      }).returning();
      return row;
    }),

  updateArt: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      tipo: z.string().optional(),
      numero: z.string().optional(),
      profissional: z.string().optional(),
      creaOuCau: z.string().nullable().optional(),
      dataEmissao: z.preprocess(v => (v === "" ? null : v), z.string().nullable().optional()),
      dataValidade: z.preprocess(v => (v === "" ? null : v), z.string().nullable().optional()),
      status: z.string().optional(),
      arquivoUrl: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertArtAccess(ctx, db, input.id, input.companyId);
      const { id, companyId, ...data } = input;
      await db.update(gdArts).set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(gdArts.id, id), eq(gdArts.companyId, companyId)));
      return { success: true };
    }),

  deleteArt: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertArtAccess(ctx, db, input.id, input.companyId);
      await db.delete(gdArts)
        .where(and(eq(gdArts.id, input.id), eq(gdArts.companyId, input.companyId)));
      return { success: true };
    }),

  getDashboardStats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const obraFilterDocs = allowed === null
        ? sql`TRUE`
        : (allowed.length === 0 ? sql`FALSE` : inArray(gdDocumentos.obraId, allowed));
      const obraFilterArts = allowed === null
        ? sql`TRUE`
        : (allowed.length === 0 ? sql`FALSE` : inArray(gdArts.obraId, allowed));

      const baseDocs = and(eq(gdDocumentos.companyId, input.companyId), isNull(gdDocumentos.deletedAt), obraFilterDocs);

      const [totalDocs] = await db.select({ count: sql<number>`count(*)::int` }).from(gdDocumentos)
        .where(baseDocs);

      const statusCounts = await db.select({
        status: gdDocumentos.status,
        count: sql<number>`count(*)::int`,
      }).from(gdDocumentos)
        .where(baseDocs)
        .groupBy(gdDocumentos.status);

      const subpastaCounts = await db.select({
        subpasta: gdDocumentos.subpasta,
        count: sql<number>`count(*)::int`,
      }).from(gdDocumentos)
        .where(baseDocs)
        .groupBy(gdDocumentos.subpasta);

      const obraCounts = await db.select({
        obraId: gdDocumentos.obraId,
        obraNome: obras.nome,
        count: sql<number>`count(*)::int`,
      }).from(gdDocumentos)
        .innerJoin(obras, and(eq(obras.id, gdDocumentos.obraId), eq(obras.companyId, input.companyId)))
        .where(baseDocs)
        .groupBy(gdDocumentos.obraId, obras.nome);

      const [totalRevisoes] = await db.select({ count: sql<number>`count(*)::int` }).from(gdRevisoes)
        .innerJoin(gdDocumentos, and(eq(gdDocumentos.id, gdRevisoes.documentoId), eq(gdDocumentos.companyId, input.companyId)))
        .where(and(eq(gdRevisoes.companyId, input.companyId), obraFilterDocs));

      const [totalArts] = await db.select({ count: sql<number>`count(*)::int` }).from(gdArts)
        .where(and(eq(gdArts.companyId, input.companyId), obraFilterArts));

      const recentRevisions = await db.select({
        id: gdRevisoes.id,
        documentoId: gdRevisoes.documentoId,
        numero: gdRevisoes.numero,
        descricao: gdRevisoes.descricao,
        status: gdRevisoes.status,
        arquivoNome: gdRevisoes.arquivoNome,
        criadoEm: gdRevisoes.criadoEm,
        docTitulo: gdDocumentos.titulo,
        docDescricao: gdDocumentos.descricao,
        obraNome: obras.nome,
      }).from(gdRevisoes)
        .innerJoin(gdDocumentos, and(eq(gdDocumentos.id, gdRevisoes.documentoId), eq(gdDocumentos.companyId, input.companyId)))
        .innerJoin(obras, and(eq(obras.id, gdDocumentos.obraId), eq(obras.companyId, input.companyId)))
        .where(and(eq(gdRevisoes.companyId, input.companyId), obraFilterDocs))
        .orderBy(desc(gdRevisoes.criadoEm))
        .limit(15);

      const now = new Date();
      const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expiringArts = await db.select({
        id: gdArts.id,
        tipo: gdArts.tipo,
        numero: gdArts.numero,
        profissional: gdArts.profissional,
        dataValidade: gdArts.dataValidade,
        status: gdArts.status,
        obraNome: obras.nome,
      }).from(gdArts)
        .innerJoin(obras, and(eq(obras.id, gdArts.obraId), eq(obras.companyId, input.companyId)))
        .where(and(
          eq(gdArts.companyId, input.companyId),
          obraFilterArts,
          sql`${gdArts.dataValidade} IS NOT NULL`,
          sql`${gdArts.dataValidade}::date <= ${in30days.toISOString().split("T")[0]}::date`,
        ))
        .orderBy(gdArts.dataValidade)
        .limit(20);

      const expiringDocs = await db.select({
        id: gdDocumentos.id,
        titulo: gdDocumentos.titulo,
        codigo: gdDocumentos.codigo,
        descricao: gdDocumentos.descricao,
        subpasta: gdDocumentos.subpasta,
        dataValidade: gdDocumentos.dataValidade,
        status: gdDocumentos.status,
        obraNome: obras.nome,
      }).from(gdDocumentos)
        .innerJoin(obras, and(eq(obras.id, gdDocumentos.obraId), eq(obras.companyId, input.companyId)))
        .where(and(
          eq(gdDocumentos.companyId, input.companyId),
          isNull(gdDocumentos.deletedAt),
          obraFilterDocs,
          sql`${gdDocumentos.dataValidade} IS NOT NULL`,
          sql`${gdDocumentos.dataValidade}::date <= ${in30days.toISOString().split("T")[0]}::date`,
        ))
        .orderBy(gdDocumentos.dataValidade)
        .limit(20);

      const recentDocs = await db.select({
        id: gdDocumentos.id,
        titulo: gdDocumentos.titulo,
        descricao: gdDocumentos.descricao,
        status: gdDocumentos.status,
        subpasta: gdDocumentos.subpasta,
        revisaoAtual: gdDocumentos.revisaoAtual,
        atualizadoEm: gdDocumentos.atualizadoEm,
        obraNome: obras.nome,
      }).from(gdDocumentos)
        .innerJoin(obras, and(eq(obras.id, gdDocumentos.obraId), eq(obras.companyId, input.companyId)))
        .where(baseDocs)
        .orderBy(desc(gdDocumentos.atualizadoEm))
        .limit(10);

      const [docsComValidade] = await db.select({ count: sql<number>`count(*)::int` }).from(gdDocumentos)
        .where(and(baseDocs, sql`${gdDocumentos.dataValidade} IS NOT NULL`));

      const [docsAprovados] = await db.select({ count: sql<number>`count(*)::int` }).from(gdDocumentos)
        .where(and(baseDocs, eq(gdDocumentos.status, "aprovado")));

      const [docsR0] = await db.select({ count: sql<number>`count(*)::int` }).from(gdDocumentos)
        .where(and(baseDocs, sql`(${gdDocumentos.revisaoAtual} IS NULL OR ${gdDocumentos.revisaoAtual} = '0')`));

      const obraDetails = await db.select({
        obraId: gdDocumentos.obraId,
        obraNome: obras.nome,
        total: sql<number>`count(*)::int`,
        aprovados: sql<number>`sum(case when ${gdDocumentos.status} = 'aprovado' then 1 else 0 end)::int`,
        emRevisao: sql<number>`sum(case when ${gdDocumentos.status} = 'em_revisao' then 1 else 0 end)::int`,
        reprovados: sql<number>`sum(case when ${gdDocumentos.status} = 'reprovado' then 1 else 0 end)::int`,
        dwgs: sql<number>`sum(case when ${gdDocumentos.subpasta} = 'DWG' then 1 else 0 end)::int`,
        pdfs: sql<number>`sum(case when ${gdDocumentos.subpasta} = 'PDF' then 1 else 0 end)::int`,
      }).from(gdDocumentos)
        .innerJoin(obras, and(eq(obras.id, gdDocumentos.obraId), eq(obras.companyId, input.companyId)))
        .where(baseDocs)
        .groupBy(gdDocumentos.obraId, obras.nome);

      return {
        totalDocs: totalDocs?.count || 0,
        totalRevisoes: totalRevisoes?.count || 0,
        totalArts: totalArts?.count || 0,
        docsComValidade: docsComValidade?.count || 0,
        docsAprovados: docsAprovados?.count || 0,
        docsR0: docsR0?.count || 0,
        statusCounts: statusCounts as { status: string; count: number }[],
        subpastaCounts: subpastaCounts as { subpasta: string; count: number }[],
        obraCounts: obraCounts as { obraId: number; obraNome: string; count: number }[],
        obraDetails: obraDetails as any[],
        recentRevisions,
        expiringArts,
        expiringDocs,
        recentDocs,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Rev. 1774 — Catálogo de Categorias Administrativas (Documentos da Obra)
  // ─────────────────────────────────────────────────────────────────────────
  listCategoriasAdminPadrao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureCategoriasAdminCatalogo(db, input.companyId);
      return db.select().from(gdCategoriasAdminPadrao)
        .where(eq(gdCategoriasAdminPadrao.companyId, input.companyId))
        .orderBy(gdCategoriasAdminPadrao.ordem, gdCategoriasAdminPadrao.nome);
    }),

  criarCategoriaAdminPadrao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      chave:     z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e _"),
      nome:      z.string().min(1).max(150),
      sigla:     z.string().min(1).max(10),
      cor:       z.string().optional(),
      ordem:     z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar o catálogo" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        const [row] = await db.insert(gdCategoriasAdminPadrao).values({
          companyId: input.companyId,
          chave:     input.chave.toLowerCase().trim(),
          nome:      input.nome.trim(),
          sigla:     input.sigla.toUpperCase().trim(),
          cor:       input.cor || "#64748B",
          ordem:     input.ordem ?? 100,
        }).returning();
        return row;
      } catch (e: any) {
        if (e?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria com essa chave" });
        throw e;
      }
    }),

  editarCategoriaAdminPadrao: protectedProcedure
    .input(z.object({
      id:        z.number(),
      companyId: z.number(),
      nome:      z.string().min(1).max(150).optional(),
      sigla:     z.string().min(1).max(10).optional(),
      cor:       z.string().optional(),
      ordem:     z.number().optional(),
      ativo:     z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar o catálogo" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const patch: any = {};
      if (input.nome !== undefined)  patch.nome  = input.nome.trim();
      if (input.sigla !== undefined) patch.sigla = input.sigla.toUpperCase().trim();
      if (input.cor !== undefined)   patch.cor   = input.cor;
      if (input.ordem !== undefined) patch.ordem = input.ordem;
      if (input.ativo !== undefined) patch.ativo = input.ativo;
      await db.update(gdCategoriasAdminPadrao).set(patch)
        .where(and(
          eq(gdCategoriasAdminPadrao.id, input.id),
          eq(gdCategoriasAdminPadrao.companyId, input.companyId),
        ));
      return { success: true };
    }),

  excluirCategoriaAdminPadrao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar o catálogo" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Soft-delete: deixa ativo=false. Disciplinas já criadas nas obras
      // PERMANECEM (preserva docs históricos). Novas obras não recebem mais
      // a categoria. Admin pode reativar a qualquer momento.
      await db.update(gdCategoriasAdminPadrao).set({ ativo: false })
        .where(and(
          eq(gdCategoriasAdminPadrao.id, input.id),
          eq(gdCategoriasAdminPadrao.companyId, input.companyId),
        ));
      return { success: true };
    }),

  aplicarCategoriasATodasObras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!isAdmin(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem aplicar o catálogo" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ficheiros = await db.select({ id: gdFicheirosObra.id })
        .from(gdFicheirosObra)
        .where(eq(gdFicheirosObra.companyId, input.companyId));
      let processados = 0;
      for (const f of ficheiros) {
        try {
          await ensureDisciplinasAdminNoFicheiro(db, input.companyId, f.id);
          processados++;
        } catch (e: any) {
          console.warn(`[GD] aplicarCategoriasATodasObras ficheiro=${f.id}:`, e?.message ?? e);
        }
      }
      return { ficheiros: ficheiros.length, processados };
    }),
});
