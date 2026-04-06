import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { processosCivis, processosAndamentos, processoDocumentos } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, type InferInsertModel } from "drizzle-orm";

type ProcessoCivilInsert = InferInsertModel<typeof processosCivis>;

const TIPO_PROCESSO = 'civil' as const;

function emptyToNull(val: string | null | undefined): string | null | undefined {
  if (val === undefined) return undefined;
  return val === '' ? null : val;
}

export const processosCivisRouter = router({
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const processos = await db.select().from(processosCivis)
        .where(and(
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));

      let filtered = processos;
      if (input.status && input.status !== "all") {
        filtered = processos.filter(p => p.status === input.status);
      }

      return filtered.sort((a, b) => {
        const statusOrder: Record<string, number> = {
          em_andamento: 0, aguardando_audiencia: 1, aguardando_pericia: 2,
          recurso: 3, execucao: 4, sentenca: 5, suspenso: 6, acordo: 7, arquivado: 8, encerrado: 9,
        };
        return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.id),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo cível não encontrado" });

      const andamentos = await db.select().from(processosAndamentos)
        .where(and(
          eq(processosAndamentos.processoId, input.id),
          eq(processosAndamentos.tipoProcesso, TIPO_PROCESSO),
        ))
        .orderBy(desc(processosAndamentos.data));

      return { ...processo, andamentos };
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      numeroProcesso: z.string().min(1),
      tipoAcao: z.enum(['cobranca', 'indenizacao', 'execucao', 'monitoria', 'consignacao', 'despejo', 'possessoria', 'declaratoria', 'anulatoria', 'mandado_seguranca', 'outros']).default('cobranca'),
      vara: z.string().optional(),
      comarca: z.string().optional(),
      tribunal: z.string().optional(),
      autor: z.string().min(1),
      reu: z.string().min(1),
      advogadoAutor: z.string().optional(),
      advogadoReu: z.string().optional(),
      valorCausa: z.string().optional(),
      dataDistribuicao: z.string().optional(),
      dataCitacao: z.string().optional(),
      dataAudiencia: z.string().optional(),
      status: z.enum(['em_andamento', 'aguardando_audiencia', 'aguardando_pericia', 'recurso', 'execucao', 'sentenca', 'acordo', 'suspenso', 'arquivado', 'encerrado']).default('em_andamento'),
      fase: z.enum(['conhecimento', 'inicial', 'instrucao', 'sentenca', 'decisoria', 'recurso', 'recursal', 'execucao', 'encerrado']).default('conhecimento'),
      risco: z.enum(['baixo', 'medio', 'alto', 'critico']).default('medio'),
      objetoAcao: z.string().optional(),
      observacoes: z.string().optional(),
      criadoPor: z.string().optional(),
      resultado: z.string().optional(),
      andamentoProcessual: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const emptyToNull = (v: string | undefined) => (v && v.trim() !== '' ? v : null);
      const result = await db.insert(processosCivis).values({
        companyId: input.companyId,
        numeroProcesso: input.numeroProcesso,
        tipoAcao: input.tipoAcao,
        vara: emptyToNull(input.vara),
        comarca: emptyToNull(input.comarca),
        tribunal: emptyToNull(input.tribunal),
        autor: input.autor,
        reu: input.reu,
        advogadoAutor: emptyToNull(input.advogadoAutor),
        advogadoReu: emptyToNull(input.advogadoReu),
        valorCausa: emptyToNull(input.valorCausa),
        dataDistribuicao: emptyToNull(input.dataDistribuicao),
        dataCitacao: emptyToNull(input.dataCitacao),
        dataAudiencia: emptyToNull(input.dataAudiencia),
        status: input.status,
        fase: input.fase,
        risco: input.risco,
        objetoAcao: emptyToNull(input.objetoAcao),
        observacoes: emptyToNull(input.observacoes),
        criadoPor: emptyToNull(input.criadoPor),
        resultado: emptyToNull(input.resultado),
        andamentoProcessual: emptyToNull(input.andamentoProcessual),
      }).returning();
      return { id: result[0].id };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      numeroProcesso: z.string().optional(),
      tipoAcao: z.string().optional(),
      vara: z.string().nullable().optional(),
      comarca: z.string().nullable().optional(),
      tribunal: z.string().nullable().optional(),
      autor: z.string().optional(),
      reu: z.string().optional(),
      advogadoAutor: z.string().nullable().optional(),
      advogadoReu: z.string().nullable().optional(),
      valorCausa: z.string().nullable().optional(),
      valorCondenacao: z.string().nullable().optional(),
      valorAcordo: z.string().nullable().optional(),
      valorPago: z.string().nullable().optional(),
      dataDistribuicao: z.string().nullable().optional(),
      dataCitacao: z.string().nullable().optional(),
      dataAudiencia: z.string().nullable().optional(),
      dataEncerramento: z.string().nullable().optional(),
      status: z.string().optional(),
      fase: z.string().optional(),
      risco: z.string().optional(),
      objetoAcao: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      resultado: z.string().nullable().optional(),
      andamentoProcessual: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, companyId, companyIds, ...data } = input;
      const db = (await getDb())!;
      const allowedIds = companyIds && companyIds.length > 0 ? companyIds : [companyId];
      const updateData: Partial<ProcessoCivilInsert> = {};
      if (data.numeroProcesso !== undefined) updateData.numeroProcesso = data.numeroProcesso;
      if (data.tipoAcao !== undefined) updateData.tipoAcao = data.tipoAcao;
      if (data.vara !== undefined) updateData.vara = emptyToNull(data.vara);
      if (data.comarca !== undefined) updateData.comarca = emptyToNull(data.comarca);
      if (data.tribunal !== undefined) updateData.tribunal = emptyToNull(data.tribunal);
      if (data.autor !== undefined) updateData.autor = data.autor;
      if (data.reu !== undefined) updateData.reu = data.reu;
      if (data.advogadoAutor !== undefined) updateData.advogadoAutor = emptyToNull(data.advogadoAutor);
      if (data.advogadoReu !== undefined) updateData.advogadoReu = emptyToNull(data.advogadoReu);
      if (data.valorCausa !== undefined) updateData.valorCausa = emptyToNull(data.valorCausa);
      if (data.valorCondenacao !== undefined) updateData.valorCondenacao = emptyToNull(data.valorCondenacao);
      if (data.valorAcordo !== undefined) updateData.valorAcordo = emptyToNull(data.valorAcordo);
      if (data.valorPago !== undefined) updateData.valorPago = emptyToNull(data.valorPago);
      if (data.dataDistribuicao !== undefined) updateData.dataDistribuicao = emptyToNull(data.dataDistribuicao);
      if (data.dataCitacao !== undefined) updateData.dataCitacao = emptyToNull(data.dataCitacao);
      if (data.dataAudiencia !== undefined) updateData.dataAudiencia = emptyToNull(data.dataAudiencia);
      if (data.dataEncerramento !== undefined) updateData.dataEncerramento = emptyToNull(data.dataEncerramento);
      if (data.status !== undefined) updateData.status = data.status;
      if (data.fase !== undefined) updateData.fase = data.fase;
      if (data.risco !== undefined) updateData.risco = data.risco;
      if (data.objetoAcao !== undefined) updateData.objetoAcao = data.objetoAcao;
      if (data.observacoes !== undefined) updateData.observacoes = data.observacoes;
      if (data.resultado !== undefined) (updateData as any).resultado = emptyToNull(data.resultado);
      if (data.andamentoProcessual !== undefined) (updateData as any).andamentoProcessual = emptyToNull(data.andamentoProcessual);
      await db.update(processosCivis).set(updateData)
        .where(and(
          eq(processosCivis.id, id),
          allowedIds.length === 1 ? eq(processosCivis.companyId, allowedIds[0]) : inArray(processosCivis.companyId, allowedIds),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const allowedIds = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const softDelete: Partial<ProcessoCivilInsert> = {
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      };
      await db.update(processosCivis).set({ ...softDelete, deletedAt: sql`NOW()` })
        .where(and(
          eq(processosCivis.id, input.id),
          allowedIds.length === 1 ? eq(processosCivis.companyId, allowedIds[0]) : inArray(processosCivis.companyId, allowedIds),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      return { success: true };
    }),

  excluirLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const allowedIds = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const softDelete: Partial<ProcessoCivilInsert> = {
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      };
      await db.update(processosCivis).set({ ...softDelete, deletedAt: sql`NOW()` })
        .where(and(
          inArray(processosCivis.id, input.ids),
          allowedIds.length === 1 ? eq(processosCivis.companyId, allowedIds[0]) : inArray(processosCivis.companyId, allowedIds),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      return { success: true, count: input.ids.length };
    }),

  listarAndamentos: protectedProcedure
    .input(z.object({ processoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.processoId),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      return db.select().from(processosAndamentos)
        .where(and(
          eq(processosAndamentos.processoId, input.processoId),
          eq(processosAndamentos.tipoProcesso, TIPO_PROCESSO),
        ))
        .orderBy(desc(processosAndamentos.data));
    }),

  criarAndamento: protectedProcedure
    .input(z.object({
      processoId: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      data: z.string(),
      tipo: z.enum(['audiencia', 'despacho', 'sentenca', 'recurso', 'pericia', 'acordo', 'pagamento', 'citacao', 'intimacao', 'peticao', 'outros']).default('outros'),
      descricao: z.string().min(1),
      resultado: z.string().optional(),
      documentoUrl: z.string().optional(),
      documentoNome: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { companyId, companyIds, ...andamentoData } = input;
      const db = (await getDb())!;
      const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.processoId),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      const result = await db.insert(processosAndamentos).values({
        ...andamentoData,
        tipoProcesso: TIPO_PROCESSO,
      }).returning();
      return { id: result[0].id };
    }),

  excluirAndamento: protectedProcedure
    .input(z.object({ id: z.number(), processoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.processoId),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      await db.delete(processosAndamentos).where(and(
        eq(processosAndamentos.id, input.id),
        eq(processosAndamentos.processoId, input.processoId),
        eq(processosAndamentos.tipoProcesso, TIPO_PROCESSO),
      ));
      return { success: true };
    }),

  listarDocumentos: protectedProcedure
    .input(z.object({ processoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.processoId),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      return db.select().from(processoDocumentos)
        .where(and(
          eq(processoDocumentos.processoId, input.processoId),
          eq(processoDocumentos.tipoProcesso, TIPO_PROCESSO),
          sql`${processoDocumentos.deletedAt} IS NULL`,
        ))
        .orderBy(desc(processoDocumentos.createdAt));
    }),

  criarDocumento: protectedProcedure
    .input(z.object({
      processoId: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      nome: z.string().min(1),
      tipo: z.enum(['contrato', 'peticao', 'sentenca', 'recurso', 'procuracao', 'comprovante', 'notificacao', 'laudo', 'outros']).default('outros'),
      descricao: z.string().optional(),
      fileKey: z.string().min(1),
      fileUrl: z.string().min(1),
      mimeType: z.string().optional(),
      tamanhoBytes: z.number().optional(),
      criadoPor: z.string().optional(),
      criadoPorUserId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { companyId, companyIds, ...docData } = input;
      const db = (await getDb())!;
      const ids = companyIds && companyIds.length > 0 ? companyIds : [companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.processoId),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      const result = await db.insert(processoDocumentos).values({
        ...docData,
        companyId: processo.companyId,
        tipoProcesso: TIPO_PROCESSO,
      }).returning();
      return { id: result[0].id };
    }),

  excluirDocumento: protectedProcedure
    .input(z.object({ id: z.number(), processoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosCivis)
        .where(and(
          eq(processosCivis.id, input.processoId),
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      await db.update(processoDocumentos).set({ deletedAt: sql`NOW()` })
        .where(and(
          eq(processoDocumentos.id, input.id),
          eq(processoDocumentos.processoId, input.processoId),
          eq(processoDocumentos.tipoProcesso, TIPO_PROCESSO),
        ));
      return { success: true };
    }),

  estatisticas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const processos = await db.select().from(processosCivis)
        .where(and(
          ids.length === 1 ? eq(processosCivis.companyId, ids[0]) : inArray(processosCivis.companyId, ids),
          sql`${processosCivis.deletedAt} IS NULL`,
        ));

      const total = processos.length;
      const isEncerrado = (p: { status: string }) => ['encerrado', 'arquivado'].includes(p.status);
      const emAndamento = processos.filter(p => !isEncerrado(p)).length;
      const encerrados = processos.filter(p => isEncerrado(p)).length;

      const parseBRL = (val: string | null) => {
        if (!val) return 0;
        const clean = val.replace(/R\$\s*/g, "").trim();
        if (clean.includes(",")) return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
        return parseFloat(clean) || 0;
      };

      const totalValorCausa = processos.reduce((s, p) => s + parseBRL(p.valorCausa), 0);
      const totalValorPago = processos.reduce((s, p) => s + parseBRL(p.valorPago), 0);

      const porRisco = {
        baixo: processos.filter(p => p.risco === 'baixo' && !isEncerrado(p)).length,
        medio: processos.filter(p => p.risco === 'medio' && !isEncerrado(p)).length,
        alto: processos.filter(p => p.risco === 'alto' && !isEncerrado(p)).length,
        critico: processos.filter(p => p.risco === 'critico' && !isEncerrado(p)).length,
      };

      const porStatus: Record<string, number> = {};
      for (const p of processos) {
        porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      }

      const porTipoAcao: Record<string, number> = {};
      for (const p of processos) {
        porTipoAcao[p.tipoAcao] = (porTipoAcao[p.tipoAcao] || 0) + 1;
      }

      return {
        total, emAndamento, encerrados,
        totalValorCausa, totalValorPago,
        porRisco, porStatus, porTipoAcao,
      };
    }),
});
