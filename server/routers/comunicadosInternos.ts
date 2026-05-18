import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { comunicadosInternos, comunicadoAssinaturas, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, isNull, asc, inArray, ne } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string | null> {
  try {
    if (ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return data.text?.trim() || null;
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || null;
    }
    if (ext === "doc") {
      const WordExtractor = (await import("word-extractor")).default;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody()?.trim() || null;
    }
  } catch (e: any) {
    console.error(`[ComunicadosInternos] Erro ao extrair texto (${ext}):`, e.message);
  }
  return null;
}

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
      const ext = (input.fileName.split(".").pop() || "").toLowerCase();
      const allowedExts = ["pdf", "doc", "docx"];
      if (!allowedExts.includes(ext)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não permitido. Use PDF, DOC ou DOCX." });
      }
      const buffer = Buffer.from(input.fileBase64, "base64");
      const maxSize = 10 * 1024 * 1024;
      if (buffer.length > maxSize) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande. Tamanho máximo: 10 MB." });
      }
      const ct = ext === "pdf" ? "application/pdf"
        : ext === "doc" ? "application/msword"
        : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
      const key = `documentos/comunicados/c${input.companyId}/${input.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ct);
      await db.update(comunicadosInternos)
        .set({ documentoUrl: url, fileName: input.fileName, updatedAt: sql`NOW()` })
        .where(eq(comunicadosInternos.id, input.id));

      const extractedText = await extractTextFromBuffer(buffer, ext);
      return { url, extractedText };
    }),

  removerAnexo: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const row = await ensureOwnership(db, input.id, input.companyId);
      if (row.status === "concluido") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Comunicado concluído não pode ser alterado. Reverta o status primeiro." });
      }
      await db.update(comunicadosInternos)
        .set({ documentoUrl: null, fileName: null, updatedAt: sql`NOW()` })
        .where(eq(comunicadosInternos.id, input.id));
      return { success: true };
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

  // Rev. 2079 — Lista para Assinatura: devolve TODOS os funcionários ATIVOS da empresa
  // com o status de assinatura (presente/ausente) pra este comunicado.
  listarFuncionariosParaAssinatura: protectedProcedure
    .input(z.object({
      comunicadoId: z.number().int().positive(),
      companyId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      await ensureOwnership(db, input.comunicadoId, input.companyId);
      // Funcionários ATIVOS da empresa (exclui Desligado/Inativo + soft-deleted).
      const ativos = await db.select({
        id: employees.id,
        matricula: employees.matricula,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        cargo: employees.cargo,
        funcao: employees.funcao,
        setor: employees.setor,
        fotoUrl: employees.fotoUrl,
      })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, "Ativo"),
          isNull((employees as any).deletedAt),
        ))
        .orderBy(asc(employees.nomeCompleto));
      // Assinaturas registradas pra este comunicado
      const assinaturas = await db.select({
        id: comunicadoAssinaturas.id,
        employeeId: comunicadoAssinaturas.employeeId,
        assinaturaBase64: comunicadoAssinaturas.assinaturaBase64,
        assinadoEm: comunicadoAssinaturas.assinadoEm,
        registradoPor: comunicadoAssinaturas.registradoPor,
      })
        .from(comunicadoAssinaturas)
        .where(and(
          eq(comunicadoAssinaturas.comunicadoId, input.comunicadoId),
          eq(comunicadoAssinaturas.companyId, input.companyId),
        ));
      const mapAssin = new Map<number, any>(assinaturas.map(a => [a.employeeId, a]));
      // Conta APENAS assinaturas de funcionários atualmente ATIVOS (mantém KPI
      // consistente com a tabela exibida — assinaturas órfãs de desligados ficam
      // no banco mas não entram no percentual).
      const ativoIds = new Set(ativos.map(a => a.id));
      const totalAssinadosAtivos = assinaturas.filter(a => ativoIds.has(a.employeeId)).length;
      return {
        funcionarios: ativos.map(f => ({
          ...f,
          assinatura: mapAssin.get(f.id) || null,
        })),
        totalAtivos: ativos.length,
        totalAssinados: totalAssinadosAtivos,
      };
    }),

  // Rev. 2079 — Registra (ou substitui) a assinatura digital de um colaborador
  // para um comunicado. assinaturaBase64 = PNG data URL ("data:image/png;base64,...").
  assinar: protectedProcedure
    .input(z.object({
      comunicadoId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      assinaturaBase64: z.string().min(50), // canvas vazio gera ~200 bytes; assinatura real bem maior
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensureOwnership(db, input.comunicadoId, input.companyId);
      // Validar tamanho do payload (limita a 500KB pra evitar abuso)
      const maxLen = 500 * 1024;
      if (input.assinaturaBase64.length > maxLen) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura muito grande (máx. 500 KB)." });
      }
      // Validar que é uma data URL de imagem
      if (!input.assinaturaBase64.startsWith("data:image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de assinatura inválido (esperado data:image/...)." });
      }
      // Validar que o employee pertence à empresa e está ativo
      const [emp] = await db.select({ id: employees.id, status: employees.status, companyId: employees.companyId })
        .from(employees).where(eq(employees.id, input.employeeId));
      if (!emp || emp.companyId !== input.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });
      }
      if (emp.status !== "Ativo") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas funcionários ATIVOS podem assinar." });
      }
      // Upsert: deleta existente + insere nova (mantém auditoria via assinadoEm sempre atual)
      await db.delete(comunicadoAssinaturas).where(and(
        eq(comunicadoAssinaturas.comunicadoId, input.comunicadoId),
        eq(comunicadoAssinaturas.employeeId, input.employeeId),
      ));
      const [row] = await db.insert(comunicadoAssinaturas).values({
        comunicadoId: input.comunicadoId,
        companyId: input.companyId,
        employeeId: input.employeeId,
        assinaturaBase64: input.assinaturaBase64,
        registradoPor: ctx.user.name ?? "Sistema",
        registradoPorUserId: ctx.user.id,
      }).returning();
      return row;
    }),

  // Rev. 2079 — Remove a assinatura digital de um colaborador para um comunicado.
  removerAssinatura: protectedProcedure
    .input(z.object({
      comunicadoId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensureOwnership(db, input.comunicadoId, input.companyId);
      await db.delete(comunicadoAssinaturas).where(and(
        eq(comunicadoAssinaturas.comunicadoId, input.comunicadoId),
        eq(comunicadoAssinaturas.companyId, input.companyId),
        eq(comunicadoAssinaturas.employeeId, input.employeeId),
      ));
      return { success: true };
    }),
});
