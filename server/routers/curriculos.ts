import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { curriculos, curriculoFuncoes } from "../../drizzle/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

const FUNCOES_PADRAO = [
  "SERVENTE", "PEDREIRO", "CARPINTEIRO", "ARMADOR",
  "ENGENHEIRO", "PINTOR", "AUX. ADMINISTRATIVO",
];

async function ensureFuncoesPadrao(db: any, companyId: number) {
  const existing = await db.select({ nome: curriculoFuncoes.nome })
    .from(curriculoFuncoes)
    .where(and(
      eq(curriculoFuncoes.companyId, companyId),
      isNull(curriculoFuncoes.deletedAt),
    ));
  const existingNames = new Set(existing.map((r: any) => (r.nome || "").toUpperCase()));
  const toAdd = FUNCOES_PADRAO.filter(n => !existingNames.has(n));
  if (toAdd.length > 0) {
    await db.insert(curriculoFuncoes).values(
      toAdd.map(nome => ({ companyId, nome, ativo: 1 }))
    );
  }
}

async function ensureFuncaoOwnership(db: any, funcaoId: number, companyId: number) {
  const [row] = await db.select({ id: curriculoFuncoes.id, companyId: curriculoFuncoes.companyId })
    .from(curriculoFuncoes).where(eq(curriculoFuncoes.id, funcaoId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Função não encontrada" });
  if (row.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
  return row;
}

async function ensureCurriculoOwnership(db: any, id: number, companyId: number) {
  const [row] = await db.select({ id: curriculos.id, companyId: curriculos.companyId })
    .from(curriculos).where(eq(curriculos.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Currículo não encontrado" });
  if (row.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
}

export const curriculosRouter = router({
  // ───── Funções ─────
  listarFuncoes: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      await ensureFuncoesPadrao(db, input.companyId);
      return await db.select().from(curriculoFuncoes)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          isNull(curriculoFuncoes.deletedAt),
        ))
        .orderBy(curriculoFuncoes.nome);
    }),

  criarFuncao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), nome: z.string().min(1).max(120) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const nome = input.nome.trim().toUpperCase();
      const existing = await db.select({ id: curriculoFuncoes.id }).from(curriculoFuncoes)
        .where(and(
          eq(curriculoFuncoes.companyId, input.companyId),
          sql`UPPER(${curriculoFuncoes.nome}) = ${nome}`,
          isNull(curriculoFuncoes.deletedAt),
        ));
      if (existing.length > 0) return existing[0];
      const [row] = await db.insert(curriculoFuncoes).values({
        companyId: input.companyId, nome, ativo: 1,
      }).returning();
      return row;
    }),

  excluirFuncao: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensureFuncaoOwnership(db, input.id, input.companyId);
      await db.update(curriculoFuncoes).set({ deletedAt: sql`NOW()` } as any)
        .where(eq(curriculoFuncoes.id, input.id));
      return { success: true };
    }),

  // ───── Currículos ─────
  listar: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), funcaoId: z.number().int().positive().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds = [eq(curriculos.companyId, input.companyId), isNull(curriculos.deletedAt)];
      if (input.funcaoId) conds.push(eq(curriculos.funcaoId, input.funcaoId));
      return await db.select().from(curriculos)
        .where(and(...conds))
        .orderBy(desc(curriculos.createdAt));
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      funcaoId: z.number().int().positive(),
      nomeCandidato: z.string().min(1).max(255),
      telefone: z.string().optional(),
      email: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensureFuncaoOwnership(db, input.funcaoId, input.companyId);
      const [funcRow] = await db.select({ nome: curriculoFuncoes.nome })
        .from(curriculoFuncoes).where(eq(curriculoFuncoes.id, input.funcaoId));
      const funcaoNome = funcRow?.nome || "Sem função";

      const [row] = await db.insert(curriculos).values({
        companyId: input.companyId,
        funcaoId: input.funcaoId,
        funcaoNome,
        nomeCandidato: input.nomeCandidato,
        telefone: input.telefone || null,
        email: input.email || null,
        observacoes: input.observacoes || null,
        criadoPor: ctx.user.name ?? "Sistema",
        criadoPorUserId: ctx.user.id,
      }).returning();
      return row;
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
      await ensureCurriculoOwnership(db, input.id, input.companyId);
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = (input.fileName.split(".").pop() || "pdf").toLowerCase();
      const ct = ext === "pdf" ? "application/pdf"
        : ext === "doc" ? "application/msword"
        : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "png" ? "image/png"
        : "application/octet-stream";
      const key = `documentos/curriculos/c${input.companyId}/${input.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ct);
      await db.update(curriculos)
        .set({ documentoUrl: url, fileName: input.fileName, updatedAt: sql`NOW()` })
        .where(eq(curriculos.id, input.id));
      return { url };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensureCurriculoOwnership(db, input.id, input.companyId);
      await db.update(curriculos).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? "Sistema",
        deletedByUserId: ctx.user.id,
      } as any).where(eq(curriculos.id, input.id));
      return { success: true };
    }),
});
