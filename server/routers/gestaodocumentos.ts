import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
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

export const gestaoDocumentosRouter = router({

  listObrasDisponiveis: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
        ));
      return allObras.filter(o => {
        const s = (o.status || "").toLowerCase();
        return s.includes("andamento") || s.includes("planejamento") || s.includes("execu");
      });
    }),

  listFicheiros: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ficheiros = await db.select().from(gdFicheirosObra)
        .where(eq(gdFicheirosObra.companyId, input.companyId))
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.id), eq(gdFicheirosObra.companyId, input.companyId)));
      return { success: true };
    }),

  getFicheiroDetail: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [ficheiro] = await db.select().from(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.id), eq(gdFicheirosObra.companyId, input.companyId)));
      if (!ficheiro) throw new TRPCError({ code: "NOT_FOUND" });
      const [obra] = await db.select({
        id: obras.id,
        nome: obras.nome,
        codigo: obras.codigo,
        cliente: obras.cliente,
        status: obras.status,
      }).from(obras).where(and(eq(obras.id, ficheiro.obraId), eq(obras.companyId, input.companyId)));
      const disciplinas = await db.select().from(gdDisciplinas)
        .where(and(
          eq(gdDisciplinas.companyId, input.companyId),
          eq(gdDisciplinas.ficheiroId, input.id),
          eq(gdDisciplinas.ativo, true),
        ))
        .orderBy(gdDisciplinas.nome);
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
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [fichCheck] = await db.select({ id: gdFicheirosObra.id }).from(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.ficheiroId), eq(gdFicheirosObra.companyId, input.companyId)));
      if (!fichCheck) throw new TRPCError({ code: "NOT_FOUND", message: "Ficheiro não encontrado" });
      const [disc] = await db.insert(gdDisciplinas).values({
        companyId: input.companyId,
        ficheiroId: input.ficheiroId,
        nome: input.nome,
        sigla: input.sigla,
        cor: input.cor,
      }).returning();
      const selectedPastas = input.subpastas && input.subpastas.length > 0 ? input.subpastas : PASTAS_PADRAO;
      const pastasValues = selectedPastas.map(nome => ({
        companyId: input.companyId,
        ficheiroId: input.ficheiroId,
        disciplinaId: disc.id,
        nome,
      }));
      await db.insert(gdPastas).values(pastasValues);
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [fichCheck] = await db.select({ id: gdFicheirosObra.id }).from(gdFicheirosObra)
        .where(and(eq(gdFicheirosObra.id, input.ficheiroId), eq(gdFicheirosObra.companyId, input.companyId)));
      if (!fichCheck) throw new TRPCError({ code: "NOT_FOUND", message: "Ficheiro não encontrado" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(gdDisciplinas).set({ ativo: false })
        .where(and(eq(gdDisciplinas.id, input.id), eq(gdDisciplinas.companyId, input.companyId)));
      return { success: true };
    }),

  deletePasta: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(gdPastas)
        .where(and(eq(gdPastas.id, input.id), eq(gdPastas.companyId, input.companyId)));
      return { success: true };
    }),

  listPastas: protectedProcedure
    .input(z.object({ companyId: z.number(), disciplinaId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(gdDocumentos.companyId, input.companyId),
        isNull(gdDocumentos.deletedAt),
      ];
      if (input.obraId) conditions.push(eq(gdDocumentos.obraId, input.obraId));
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [doc] = await db.select().from(gdDocumentos)
        .where(and(eq(gdDocumentos.id, input.id), eq(gdDocumentos.companyId, input.companyId)));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
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
      dataEmissao: z.string().optional(),
      dataValidade: z.string().optional(),
      tags: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
      dataEmissao: z.string().nullable().optional(),
      dataValidade: z.string().nullable().optional(),
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, companyId, ...data } = input;
      await db.update(gdDocumentos).set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(gdDocumentos.id, id), eq(gdDocumentos.companyId, companyId)));
      return { success: true };
    }),

  deleteDocumento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(gdDocumentos).set({ deletedAt: new Date() })
        .where(and(eq(gdDocumentos.id, input.id), eq(gdDocumentos.companyId, input.companyId)));
      return { success: true };
    }),

  deleteDocumentosBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(gdDocumentos).set({ deletedAt: new Date() })
        .where(and(inArray(gdDocumentos.id, input.ids), eq(gdDocumentos.companyId, input.companyId)));
      return { success: true, count: input.ids.length };
    }),

  updateStatusBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const buf = Buffer.from(input.fileBase64, "base64");
      if (buf.length > 50 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Arquivo excede 50MB" });
      }
      const [doc] = await db.select().from(gdDocumentos)
        .where(and(eq(gdDocumentos.id, input.documentoId), eq(gdDocumentos.companyId, input.companyId)));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(gdRevisoes).where(and(
        eq(gdRevisoes.id, input.id),
        eq(gdRevisoes.companyId, input.companyId),
      ));
      return { success: true };
    }),

  listComentarios: protectedProcedure
    .input(z.object({ companyId: z.number(), revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
      const [row] = await db.insert(gdRevisaoComentarios).values({
        ...input,
        usuarioId: ctx.user.id,
      }).returning();
      return row;
    }),

  resolverComentario: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(gdRevisaoComentarios).set({ resolvido: true })
        .where(and(eq(gdRevisaoComentarios.id, input.id), eq(gdRevisaoComentarios.companyId, input.companyId)));
      return { success: true };
    }),

  listDistribuicao: protectedProcedure
    .input(z.object({ companyId: z.number(), documentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
      await db.insert(gdDownloadLog).values({
        ...input,
        usuarioId: ctx.user.id,
      });
      return { success: true };
    }),

  getDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [
        eq(gdDocumentos.companyId, input.companyId),
        isNull(gdDocumentos.deletedAt),
      ];
      if (input.obraId) conditions.push(eq(gdDocumentos.obraId, input.obraId));

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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions: any[] = [eq(gdArts.companyId, input.companyId)];
      if (input.obraId) conditions.push(eq(gdArts.obraId, input.obraId));
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
      dataEmissao: z.string().optional(),
      dataValidade: z.string().optional(),
      arquivoUrl: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
      dataEmissao: z.string().nullable().optional(),
      dataValidade: z.string().nullable().optional(),
      status: z.string().optional(),
      arquivoUrl: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, companyId, ...data } = input;
      await db.update(gdArts).set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(gdArts.id, id), eq(gdArts.companyId, companyId)));
      return { success: true };
    }),

  deleteArt: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(gdArts)
        .where(and(eq(gdArts.id, input.id), eq(gdArts.companyId, input.companyId)));
      return { success: true };
    }),
});
