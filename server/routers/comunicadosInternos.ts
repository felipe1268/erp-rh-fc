import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { comunicadosInternos } from "../../drizzle/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

function formatNumero(seq: number, ano: number): string {
  return `${String(seq).padStart(3, "0")}/${ano}`;
}

async function ensureOwnership(db: any, id: number, companyId: number) {
  const [row] = await db.select({ id: comunicadosInternos.id, companyId: comunicadosInternos.companyId, status: comunicadosInternos.status })
    .from(comunicadosInternos).where(eq(comunicadosInternos.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Comunicado não encontrado" });
  if (row.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
  return row;
}

export const comunicadosInternosRouter = router({
  listar: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), ano: z.number().int().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds = [eq(comunicadosInternos.companyId, input.companyId), isNull(comunicadosInternos.deletedAt)];
      if (input.ano) conds.push(eq(comunicadosInternos.ano, input.ano));
      return await db.select().from(comunicadosInternos)
        .where(and(...conds))
        .orderBy(desc(comunicadosInternos.ano), desc(comunicadosInternos.sequencia));
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255),
      dataEmissao: z.string(),
      conteudo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ano = new Date(input.dataEmissao + "T12:00:00Z").getUTCFullYear();
      if (!ano || isNaN(ano)) throw new TRPCError({ code: "BAD_REQUEST", message: "Data inválida" });

      const lockKey1 = input.companyId;
      const lockKey2 = ano;

      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey1}::int, ${lockKey2}::int)`);

        const [{ maxSeq }] = await tx.select({
          maxSeq: sql<number>`COALESCE(MAX(${comunicadosInternos.sequencia}), 0)::int`,
        }).from(comunicadosInternos)
          .where(and(
            eq(comunicadosInternos.companyId, input.companyId),
            eq(comunicadosInternos.ano, ano),
          ));

        const sequencia = (maxSeq || 0) + 1;
        const numero = formatNumero(sequencia, ano);

        const [row] = await tx.insert(comunicadosInternos).values({
          companyId: input.companyId,
          numero, ano, sequencia,
          titulo: input.titulo,
          dataEmissao: input.dataEmissao,
          conteudo: input.conteudo || null,
          criadoPor: ctx.user.name ?? "Sistema",
          criadoPorUserId: ctx.user.id,
          status: "rascunho",
        }).returning();

        return row;
      });
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      conteudo: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser editado. Reverta o status primeiro." });
      }
      const data: any = { updatedAt: sql`NOW()` };
      if (input.titulo !== undefined) data.titulo = input.titulo;
      if (input.conteudo !== undefined) data.conteudo = input.conteudo;
      await db.update(comunicadosInternos).set(data).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  concluir: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comunicado já está concluído" });
      }
      await db.update(comunicadosInternos).set({
        status: "concluido",
        concluidoPor: ctx.user.name ?? "Sistema",
        concluidoPorUserId: ctx.user.id,
        concluidoEm: sql`NOW()`,
        updatedAt: sql`NOW()`,
      }).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  reverter: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Admin Master podem reverter um comunicado concluído" });
      }
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status !== "concluido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comunicado não está concluído" });
      }
      await db.update(comunicadosInternos).set({
        status: "rascunho",
        concluidoPor: null,
        concluidoPorUserId: null,
        concluidoEm: null,
        updatedAt: sql`NOW()`,
      }).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),

  uploadDoc: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser alterado. Reverta o status primeiro." });
      }
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = (input.fileName.split(".").pop() || "pdf").toLowerCase();
      const ct = ext === "pdf" ? "application/pdf"
        : ext === "doc" ? "application/msword"
        : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
      const key = `documentos/comunicados/c${input.companyId}/${input.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ct);
      await db.update(comunicadosInternos)
        .set({ documentoUrl: url, fileName: input.fileName, updatedAt: sql`NOW()` })
        .where(eq(comunicadosInternos.id, input.id));
      return { url };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser excluído. Reverta o status primeiro." });
      }
      await db.update(comunicadosInternos).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? "Sistema",
        deletedByUserId: ctx.user.id,
      } as any).where(eq(comunicadosInternos.id, input.id));
      return { success: true };
    }),
});
