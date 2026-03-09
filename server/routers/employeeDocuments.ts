import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { employeeDocuments, employees } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

export const employeeDocumentsRouter = router({
  // Listar documentos de um funcionário
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number().optional(),
      tipo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        companyFilter(employeeDocuments.companyId, input),
        sql`${employeeDocuments.deletedAt} IS NULL`,
      ];
      if (input.employeeId) conditions.push(eq(employeeDocuments.employeeId, input.employeeId));
      if (input.tipo) conditions.push(eq(employeeDocuments.tipo, input.tipo as any));

      return db.select().from(employeeDocuments)
        .where(and(...conditions))
        .orderBy(desc(employeeDocuments.createdAt));
    }),

  // Upload de documento
  upload: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
      tipo: z.enum(['rg','cnh','ctps','comprovante_residencia','certidao_nascimento','titulo_eleitor','reservista','pis','foto_3x4','contrato_trabalho','termo_rescisao','atestado_medico','diploma','certificado','outros']),
      nome: z.string(),
      descricao: z.string().optional(),
      fileBase64: z.string(),
      mimeType: z.string(),
      fileSize: z.number(),
      dataValidade: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Upload para S3
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const ext = input.mimeType.split('/')[1] || 'pdf';
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `docs/${input.companyId}/${input.employeeId}/${input.tipo}-${randomSuffix}.${ext}`;

      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Salvar no banco
      await db.insert(employeeDocuments).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        tipo: input.tipo,
        nome: input.nome,
        descricao: input.descricao || null,
        fileUrl: url,
        fileKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        dataValidade: input.dataValidade || null,
        uploadPor: ctx.user.name ?? 'Sistema',
        uploadPorUserId: ctx.user.id,
      });

      return { success: true, url };
    }),

  // Excluir documento (soft delete)
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(employeeDocuments).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
      }).where(eq(employeeDocuments.id, input.id));
      return { success: true };
    }),

  // Resumo de documentos por funcionário (para dashboard)
  resumoPorFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const docs = await db.select({
        employeeId: employeeDocuments.employeeId,
        tipo: employeeDocuments.tipo,
        count: sql<number>`COUNT(*)`,
      }).from(employeeDocuments)
        .where(and(
          companyFilter(employeeDocuments.companyId, input),
          sql`${employeeDocuments.deletedAt} IS NULL`,
        ))
        .groupBy(employeeDocuments.employeeId, employeeDocuments.tipo);

      // Agrupar por funcionário
      const map = new Map<number, Record<string, number>>();
      for (const d of docs) {
        const existing = map.get(d.employeeId) || {};
        existing[d.tipo] = d.count;
        map.set(d.employeeId, existing);
      }

      return Array.from(map.entries()).map(([employeeId, tipos]) => ({
        employeeId,
        totalDocumentos: Object.values(tipos).reduce((s, v) => s + v, 0),
        tipos,
      }));
    }),

  // Documentos com validade vencida ou próxima do vencimento
  alertasVencimento: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), diasAntecedencia: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const hoje = new Date().toISOString().split('T')[0];
      const futuro = new Date();
      futuro.setDate(futuro.getDate() + input.diasAntecedencia);
      const futuroStr = futuro.toISOString().split('T')[0];

      const docs = await db.select().from(employeeDocuments)
        .where(and(
          companyFilter(employeeDocuments.companyId, input),
          sql`${employeeDocuments.deletedAt} IS NULL`,
          sql`${employeeDocuments.dataValidade} IS NOT NULL`,
          sql`${employeeDocuments.dataValidade} <= ${futuroStr}`,
        ))
        .orderBy(employeeDocuments.dataValidade);

      // Buscar nomes dos funcionários
      const empIds = Array.from(new Set(docs.map(d => d.employeeId)));
      let emps: any[] = [];
      if (empIds.length > 0) {
        emps = await db.select().from(employees).where(inArray(employees.id, empIds));
      }
      const empMap = new Map(emps.map((e: any) => [e.id, e]));

      return docs.map(d => ({
        ...d,
        funcionarioNome: empMap.get(d.employeeId)?.nomeCompleto || 'Desconhecido',
        vencido: d.dataValidade! <= hoje,
        diasParaVencer: Math.ceil((new Date(d.dataValidade! + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)),
      }));
    }),
});
