import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { fieldNotes, employees, obras } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, asc, gte, lte } from "drizzle-orm";

const tipoOcorrenciaEnum = z.enum(['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'insubordinacao', 'acidente', 'atestado_medico', 'desvio_conduta', 'elogio', 'outro']);
const prioridadeEnum = z.enum(['baixa', 'media', 'alta', 'urgente']);
const statusEnum = z.enum(['pendente', 'em_analise', 'resolvido', 'arquivado']);
const acaoTomadaEnum = z.enum(['nenhuma', 'advertencia_verbal', 'advertencia_escrita', 'suspensao', 'desconto_folha', 'ajuste_ponto', 'encaminhamento_medico', 'outro']);

export const fieldNotesRouter = router({
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: statusEnum.optional(),
      employeeId: z.number().optional(),
      obraId: z.number().optional(),
      tipoOcorrencia: tipoOcorrenciaEnum.optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [eq(fieldNotes.companyId, input.companyId), isNull(fieldNotes.deletedAt)];
      if (input.status) conds.push(eq(fieldNotes.status, input.status));
      if (input.employeeId) conds.push(eq(fieldNotes.employeeId, input.employeeId));
      if (input.obraId) conds.push(eq(fieldNotes.obraId, input.obraId));
      if (input.tipoOcorrencia) conds.push(eq(fieldNotes.tipoOcorrencia, input.tipoOcorrencia));
      if (input.dataInicio) conds.push(gte(fieldNotes.data, input.dataInicio));
      if (input.dataFim) conds.push(lte(fieldNotes.data, input.dataFim));

      const rows = await db.select({
        id: fieldNotes.id,
        companyId: fieldNotes.companyId,
        employeeId: fieldNotes.employeeId,
        obraId: fieldNotes.obraId,
        data: fieldNotes.data,
        tipoOcorrencia: fieldNotes.tipoOcorrencia,
        descricao: fieldNotes.descricao,
        solicitanteNome: fieldNotes.solicitanteNome,
        solicitanteId: fieldNotes.solicitanteId,
        evidenciaUrl: fieldNotes.evidenciaUrl,
        prioridade: fieldNotes.prioridade,
        status: fieldNotes.status,
        respostaRH: fieldNotes.respostaRH,
        acaoTomada: fieldNotes.acaoTomada,
        resolvidoPor: fieldNotes.resolvidoPor,
        resolvidoEm: fieldNotes.resolvidoEm,
        createdAt: fieldNotes.createdAt,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
        obraNome: obras.nome,
      })
        .from(fieldNotes)
        .leftJoin(employees, eq(fieldNotes.employeeId, employees.id))
        .leftJoin(obras, eq(fieldNotes.obraId, obras.id))
        .where(and(...conds))
        .orderBy(desc(fieldNotes.data), desc(fieldNotes.createdAt));

      return rows;
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      obraId: z.number().optional(),
      data: z.string(),
      tipoOcorrencia: tipoOcorrenciaEnum,
      descricao: z.string().min(1),
      prioridade: prioridadeEnum.optional(),
      evidenciaUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(fieldNotes).values({
        ...input,
        solicitanteNome: ctx.user?.name || ctx.user?.email || "Gestor",
        solicitanteId: ctx.user?.openId || ctx.user?.email || "",
      });
      return { id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      tipoOcorrencia: tipoOcorrenciaEnum.optional(),
      descricao: z.string().optional(),
      prioridade: prioridadeEnum.optional(),
      obraId: z.number().optional(),
      data: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(fieldNotes).set(data).where(eq(fieldNotes.id, id));
      return { success: true };
    }),

  resolve: protectedProcedure
    .input(z.object({
      id: z.number(),
      respostaRH: z.string().min(1),
      acaoTomada: acaoTomadaEnum,
      status: z.enum(['resolvido', 'arquivado']).default('resolvido'),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({
        respostaRH: input.respostaRH,
        acaoTomada: input.acaoTomada,
        status: input.status,
        resolvidoPor: ctx.user?.name || ctx.user?.email || "RH",
        resolvidoEm: sql`NOW()`,
      }).where(eq(fieldNotes.id, input.id));
      return { success: true };
    }),

  setEmAnalise: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({ status: 'em_analise' }).where(eq(fieldNotes.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({ deletedAt: sql`NOW()` }).where(eq(fieldNotes.id, input.id));
      return { success: true };
    }),

  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [rows] = await db.execute(sql`
        SELECT 
          status,
          COUNT(*) as total,
          SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgentes,
          SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as altas
        FROM field_notes
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL
        GROUP BY status
      `) as any[];

      const stats = { pendente: 0, em_analise: 0, resolvido: 0, arquivado: 0, urgentes: 0, altas: 0, total: 0 };
      for (const r of rows as any[]) {
        stats[r.status as keyof typeof stats] = parseInt(r.total);
        stats.urgentes += parseInt(r.urgentes || '0');
        stats.altas += parseInt(r.altas || '0');
        stats.total += parseInt(r.total);
      }
      return stats;
    }),

  // Stats por tipo de ocorrência (para dashboard)
  statsPorTipo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const dataConds = [];
      if (input.dataInicio) dataConds.push(sql`data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const [rows] = await db.execute(sql`
        SELECT tipoOcorrencia, COUNT(*) as total
        FROM field_notes
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL ${extraWhere}
        GROUP BY tipoOcorrencia
        ORDER BY total DESC
      `) as any[];

      return rows as { tipoOcorrencia: string; total: number }[];
    }),
});
