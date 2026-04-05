import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { processosTributarios, processosAndamentos, processoDocumentos } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, type InferInsertModel } from "drizzle-orm";

type ProcessoTributarioInsert = InferInsertModel<typeof processosTributarios>;

const TIPO_PROCESSO = 'tributario' as const;

function emptyToNull(val: string | null | undefined): string | null | undefined {
  if (val === undefined) return undefined;
  return val === '' ? null : val;
}

export const processosTributariosRouter = router({
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const processos = await db.select().from(processosTributarios)
        .where(and(
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
        ));

      let filtered = processos;
      if (input.status && input.status !== "all") {
        filtered = processos.filter(p => p.status === input.status);
      }

      return filtered.sort((a, b) => {
        const statusOrder: Record<string, number> = {
          em_andamento: 0, aguardando_julgamento: 1, recurso_administrativo: 2,
          recurso: 3, execucao_fiscal: 4, sentenca: 5, acordo: 6, arquivado: 7, encerrado: 8,
        };
        return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.id),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
        ));
      if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo tributário não encontrado" });

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
      tipoTributo: z.enum(['icms', 'iss', 'iptu', 'irpj', 'csll', 'pis', 'cofins', 'ipi', 'inss', 'fgts', 'itbi', 'itcmd', 'taxa', 'contribuicao', 'outros']).default('icms'),
      esfera: z.enum(['judicial', 'administrativa', 'carf', 'tit', 'outros']).default('judicial'),
      orgaoJulgador: z.string().optional(),
      vara: z.string().optional(),
      comarca: z.string().optional(),
      tribunal: z.string().optional(),
      autoInfracao: z.string().optional(),
      valorAutoInfracao: z.string().optional(),
      valorCausa: z.string().optional(),
      contribuinte: z.string().min(1),
      cnpjContribuinte: z.string().optional(),
      advogadoResponsavel: z.string().optional(),
      dataDistribuicao: z.string().optional(),
      dataAutoInfracao: z.string().optional(),
      dataAudiencia: z.string().optional(),
      status: z.enum(['em_andamento', 'aguardando_julgamento', 'recurso_administrativo', 'recurso', 'execucao_fiscal', 'sentenca', 'acordo', 'arquivado', 'encerrado']).default('em_andamento'),
      fase: z.enum(['conhecimento', 'instrucao', 'decisoria', 'recursal', 'execucao', 'encerrado']).default('conhecimento'),
      risco: z.enum(['baixo', 'medio', 'alto', 'critico']).default('medio'),
      observacoes: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const emptyToNull = (v: string | undefined) => (v && v.trim() !== '' ? v : null);
      const result = await db.insert(processosTributarios).values({
        companyId: input.companyId,
        numeroProcesso: input.numeroProcesso,
        tipoTributo: input.tipoTributo,
        esfera: input.esfera,
        orgaoJulgador: emptyToNull(input.orgaoJulgador),
        vara: emptyToNull(input.vara),
        comarca: emptyToNull(input.comarca),
        tribunal: emptyToNull(input.tribunal),
        autoInfracao: emptyToNull(input.autoInfracao),
        valorAutoInfracao: emptyToNull(input.valorAutoInfracao),
        valorCausa: emptyToNull(input.valorCausa),
        contribuinte: input.contribuinte,
        cnpjContribuinte: emptyToNull(input.cnpjContribuinte),
        advogadoResponsavel: emptyToNull(input.advogadoResponsavel),
        dataDistribuicao: emptyToNull(input.dataDistribuicao),
        dataAutoInfracao: emptyToNull(input.dataAutoInfracao),
        dataAudiencia: emptyToNull(input.dataAudiencia),
        status: input.status,
        fase: input.fase,
        risco: input.risco,
        observacoes: emptyToNull(input.observacoes),
        criadoPor: emptyToNull(input.criadoPor),
      }).returning();
      return { id: result[0].id };
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      numeroProcesso: z.string().optional(),
      tipoTributo: z.string().optional(),
      esfera: z.string().optional(),
      orgaoJulgador: z.string().nullable().optional(),
      vara: z.string().nullable().optional(),
      comarca: z.string().nullable().optional(),
      tribunal: z.string().nullable().optional(),
      autoInfracao: z.string().nullable().optional(),
      valorAutoInfracao: z.string().nullable().optional(),
      valorCausa: z.string().nullable().optional(),
      valorCondenacao: z.string().nullable().optional(),
      valorPago: z.string().nullable().optional(),
      contribuinte: z.string().optional(),
      cnpjContribuinte: z.string().nullable().optional(),
      advogadoResponsavel: z.string().nullable().optional(),
      dataDistribuicao: z.string().nullable().optional(),
      dataAutoInfracao: z.string().nullable().optional(),
      dataAudiencia: z.string().nullable().optional(),
      dataEncerramento: z.string().nullable().optional(),
      status: z.string().optional(),
      fase: z.string().optional(),
      risco: z.string().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, companyId, companyIds, ...data } = input;
      const db = (await getDb())!;
      const allowedIds = companyIds && companyIds.length > 0 ? companyIds : [companyId];
      const updateData: Partial<ProcessoTributarioInsert> = {};
      if (data.numeroProcesso !== undefined) updateData.numeroProcesso = data.numeroProcesso;
      if (data.tipoTributo !== undefined) updateData.tipoTributo = data.tipoTributo;
      if (data.esfera !== undefined) updateData.esfera = data.esfera;
      if (data.orgaoJulgador !== undefined) updateData.orgaoJulgador = emptyToNull(data.orgaoJulgador);
      if (data.vara !== undefined) updateData.vara = emptyToNull(data.vara);
      if (data.comarca !== undefined) updateData.comarca = emptyToNull(data.comarca);
      if (data.tribunal !== undefined) updateData.tribunal = emptyToNull(data.tribunal);
      if (data.autoInfracao !== undefined) updateData.autoInfracao = emptyToNull(data.autoInfracao);
      if (data.valorAutoInfracao !== undefined) updateData.valorAutoInfracao = emptyToNull(data.valorAutoInfracao);
      if (data.valorCausa !== undefined) updateData.valorCausa = emptyToNull(data.valorCausa);
      if (data.valorCondenacao !== undefined) updateData.valorCondenacao = emptyToNull(data.valorCondenacao);
      if (data.valorPago !== undefined) updateData.valorPago = emptyToNull(data.valorPago);
      if (data.contribuinte !== undefined) updateData.contribuinte = data.contribuinte;
      if (data.cnpjContribuinte !== undefined) updateData.cnpjContribuinte = emptyToNull(data.cnpjContribuinte);
      if (data.advogadoResponsavel !== undefined) updateData.advogadoResponsavel = emptyToNull(data.advogadoResponsavel);
      if (data.dataDistribuicao !== undefined) updateData.dataDistribuicao = emptyToNull(data.dataDistribuicao);
      if (data.dataAutoInfracao !== undefined) updateData.dataAutoInfracao = emptyToNull(data.dataAutoInfracao);
      if (data.dataAudiencia !== undefined) updateData.dataAudiencia = emptyToNull(data.dataAudiencia);
      if (data.dataEncerramento !== undefined) updateData.dataEncerramento = emptyToNull(data.dataEncerramento);
      if (data.status !== undefined) updateData.status = data.status;
      if (data.fase !== undefined) updateData.fase = data.fase;
      if (data.risco !== undefined) updateData.risco = data.risco;
      if (data.observacoes !== undefined) updateData.observacoes = data.observacoes;
      await db.update(processosTributarios).set(updateData)
        .where(and(
          eq(processosTributarios.id, id),
          allowedIds.length === 1 ? eq(processosTributarios.companyId, allowedIds[0]) : inArray(processosTributarios.companyId, allowedIds),
          sql`${processosTributarios.deletedAt} IS NULL`,
        ));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const allowedIds = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const softDelete: Partial<ProcessoTributarioInsert> = {
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      };
      await db.update(processosTributarios).set({ ...softDelete, deletedAt: sql`NOW()` })
        .where(and(
          eq(processosTributarios.id, input.id),
          allowedIds.length === 1 ? eq(processosTributarios.companyId, allowedIds[0]) : inArray(processosTributarios.companyId, allowedIds),
          sql`${processosTributarios.deletedAt} IS NULL`,
        ));
      return { success: true };
    }),

  excluirLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const allowedIds = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const softDelete: Partial<ProcessoTributarioInsert> = {
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id,
      };
      await db.update(processosTributarios).set({ ...softDelete, deletedAt: sql`NOW()` })
        .where(and(
          inArray(processosTributarios.id, input.ids),
          allowedIds.length === 1 ? eq(processosTributarios.companyId, allowedIds[0]) : inArray(processosTributarios.companyId, allowedIds),
          sql`${processosTributarios.deletedAt} IS NULL`,
        ));
      return { success: true, count: input.ids.length };
    }),

  listarAndamentos: protectedProcedure
    .input(z.object({ processoId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.processoId),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.processoId),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.processoId),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.processoId),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.processoId),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ids = input.companyIds && input.companyIds.length > 0 ? input.companyIds : [input.companyId];
      const [processo] = await db.select().from(processosTributarios)
        .where(and(
          eq(processosTributarios.id, input.processoId),
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
      const processos = await db.select().from(processosTributarios)
        .where(and(
          ids.length === 1 ? eq(processosTributarios.companyId, ids[0]) : inArray(processosTributarios.companyId, ids),
          sql`${processosTributarios.deletedAt} IS NULL`,
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
      const totalAutoInfracao = processos.reduce((s, p) => s + parseBRL(p.valorAutoInfracao), 0);

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

      const porTributo: Record<string, number> = {};
      for (const p of processos) {
        porTributo[p.tipoTributo] = (porTributo[p.tipoTributo] || 0) + 1;
      }

      return {
        total, emAndamento, encerrados,
        totalValorCausa, totalValorPago, totalAutoInfracao,
        porRisco, porStatus, porTributo,
      };
    }),
});
