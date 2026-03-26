import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, desc, isNull, sql, ilike, or, inArray } from "drizzle-orm";
import {
  gdDisciplinas,
  gdTiposDocumento,
  gdDocumentos,
  gdRevisoes,
  gdRevisaoComentarios,
  gdDistribuicao,
  gdDownloadLog,
  gdArts,
} from "../../drizzle/schema";

const isAdmin = (ctx: any) =>
  ctx.user.role === "admin" || ctx.user.role === "admin_master";

export const gestaoDocumentosRouter = router({

  listDisciplinas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(gdDisciplinas)
        .where(eq(gdDisciplinas.companyId, input.companyId))
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
      await db.update(gdDisciplinas).set({ ativo: false })
        .where(and(eq(gdDisciplinas.id, input.id), eq(gdDisciplinas.companyId, input.companyId)));
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

  listDocumentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      disciplinaId: z.number().optional(),
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
      disciplinaId: z.number().nullable().optional(),
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

  updateDocumento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      disciplinaId: z.number().nullable().optional(),
      tipoDocumentoId: z.number().nullable().optional(),
      codigo: z.string().min(1).optional(),
      titulo: z.string().min(1).optional(),
      descricao: z.string().nullable().optional(),
      status: z.string().optional(),
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

      await db.update(gdDocumentos).set({
        revisaoAtual: input.numero,
        status: "em_revisao",
        atualizadoEm: new Date(),
      }).where(and(
        eq(gdDocumentos.id, input.documentoId),
        eq(gdDocumentos.companyId, input.companyId),
      ));

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

      const arts = input.obraId
        ? await db.select().from(gdArts)
            .where(and(eq(gdArts.companyId, input.companyId), eq(gdArts.obraId, input.obraId)))
        : [];

      const artsVencendo = arts.filter(a => {
        if (!a.dataValidade) return false;
        const validade = new Date(a.dataValidade);
        const hoje = new Date();
        const diff = (validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      });

      return {
        totalDocumentos: total,
        porStatus,
        totalRevisoes,
        revisoesPendentes: pendentes,
        totalArts: arts.length,
        artsVencendo: artsVencendo.length,
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
