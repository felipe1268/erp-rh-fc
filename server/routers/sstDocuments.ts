import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sstDocuments, obras } from "../../drizzle/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { companyFilter } from "../companyHelper";

function calcularStatus(dataValidade: string | null): { status: string; diasRestantes: number } {
  if (!dataValidade) return { status: "SEM VALIDADE", diasRestantes: 999 };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + "T00:00:00");
  const diffMs = validade.getTime() - hoje.getTime();
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return { status: "VENCIDO", diasRestantes };
  if (diasRestantes <= 30) return { status: `${diasRestantes} DIAS PARA VENCER`, diasRestantes };
  if (diasRestantes <= 90) return { status: `${diasRestantes} DIAS PARA VENCER`, diasRestantes };
  return { status: "VÁLIDO", diasRestantes };
}

export const sstDocumentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      tipo: z.enum(["PGR", "PCMSO", "LTCAT"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [
        companyFilter(sstDocuments.companyId, input),
        isNull(sstDocuments.deletedAt),
      ];
      if (input.tipo) {
        conditions.push(eq(sstDocuments.tipo, input.tipo));
      }
      const rows = await db
        .select({
          id: sstDocuments.id,
          companyId: sstDocuments.companyId,
          obraId: sstDocuments.obraId,
          tipo: sstDocuments.tipo,
          descricao: sstDocuments.descricao,
          dataElaboracao: sstDocuments.dataElaboracao,
          dataValidade: sstDocuments.dataValidade,
          responsavelElaboracao: sstDocuments.responsavelElaboracao,
          registroProfissional: sstDocuments.registroProfissional,
          empresaElaboradora: sstDocuments.empresaElaboradora,
          arquivoUrl: sstDocuments.arquivoUrl,
          arquivoNome: sstDocuments.arquivoNome,
          observacoes: sstDocuments.observacoes,
          criadoPor: sstDocuments.criadoPor,
          createdAt: sstDocuments.createdAt,
          obraNome: obras.nome,
        })
        .from(sstDocuments)
        .leftJoin(obras, eq(sstDocuments.obraId, obras.id))
        .where(and(...conditions))
        .orderBy(desc(sstDocuments.createdAt));

      return rows.map((r: any) => {
        const calc = calcularStatus(r.dataValidade);
        return {
          ...r,
          lotacao: r.obraId ? (r.obraNome || `Obra #${r.obraId}`) : "Matriz",
          statusCalculado: calc.status,
          diasRestantes: calc.diasRestantes,
        };
      });
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      tipo: z.enum(["PGR", "PCMSO", "LTCAT"]),
      descricao: z.string().optional(),
      dataElaboracao: z.string().optional(),
      dataValidade: z.string().optional(),
      responsavelElaboracao: z.string().optional(),
      registroProfissional: z.string().optional(),
      empresaElaboradora: z.string().optional(),
      observacoes: z.string().optional(),
      arquivoUrl: z.string().optional(),
      arquivoNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      const [row] = await db.insert(sstDocuments).values({
        companyId: input.companyId,
        obraId: input.obraId || null,
        tipo: input.tipo,
        descricao: input.descricao || null,
        dataElaboracao: input.dataElaboracao || null,
        dataValidade: input.dataValidade || null,
        responsavelElaboracao: input.responsavelElaboracao || null,
        registroProfissional: input.registroProfissional || null,
        empresaElaboradora: input.empresaElaboradora || null,
        observacoes: input.observacoes || null,
        arquivoUrl: input.arquivoUrl || null,
        arquivoNome: input.arquivoNome || null,
        criadoPor: ctx.user.name ?? "Sistema",
        criadoPorUserId: ctx.user.id,
      }).returning();

      return { success: true, id: row.id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      obraId: z.number().nullable().optional(),
      descricao: z.string().optional(),
      dataElaboracao: z.string().optional(),
      dataValidade: z.string().optional(),
      responsavelElaboracao: z.string().optional(),
      registroProfissional: z.string().optional(),
      empresaElaboradora: z.string().optional(),
      observacoes: z.string().optional(),
      arquivoUrl: z.string().optional(),
      arquivoNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...rest } = input;
      const updateData: any = { updatedAt: new Date().toISOString() };
      const nullableFields = ["descricao", "dataElaboracao", "dataValidade", "responsavelElaboracao", "registroProfissional", "empresaElaboradora", "observacoes"];
      Object.entries(rest).forEach(([k, v]) => {
        if (v === undefined) return;
        if (k === "obraId") { updateData[k] = v; return; }
        if (k === "arquivoUrl" || k === "arquivoNome") { updateData[k] = v || null; return; }
        updateData[k] = v === "" && nullableFields.includes(k) ? null : v;
      });
      await db.update(sstDocuments).set(updateData).where(eq(sstDocuments.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(sstDocuments).set({
        deletedAt: new Date().toISOString(),
        deletedBy: ctx.user.name ?? "Sistema",
        deletedByUserId: ctx.user.id,
      } as any).where(eq(sstDocuments.id, input.id));
      return { success: true };
    }),
});
