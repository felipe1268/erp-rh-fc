import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { fiscalNotes } from "../../drizzle/schema";
import { eq, and, desc, ilike, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getUserCompanyLinks } from "../db";

async function _assertNfAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

const nfInput = z.object({
  companyId:           z.number(),
  numeroNf:            z.string().min(1),
  serie:               z.string().nullable().optional(),
  chaveAcesso:         z.string().nullable().optional(),
  dataEmissao:         z.string(),
  dataCompetencia:     z.string().nullable().optional(),
  dataVencimento:      z.string().nullable().optional(),
  tomadorCnpj:         z.string().nullable().optional(),
  tomadorRazaoSocial:  z.string().nullable().optional(),
  obraId:              z.number().nullable().optional(),
  obraNome:            z.string().nullable().optional(),
  bmReferencia:        z.string().nullable().optional(),
  descricaoServico:    z.string().nullable().optional(),
  valorBruto:          z.number(),
  deducoesTotal:       z.number().default(0),
  baseCalculoIss:      z.number().nullable().optional(),
  aliquotaIss:         z.number().nullable().optional(),
  issRetido:           z.number().default(0),
  retencaoInss:        z.number().default(0),
  retencaoIrrf:        z.number().default(0),
  retencaoPisCofins:   z.number().default(0),
  valorLiquido:        z.number(),
  entryId:             z.number().nullable().optional(),
  stmtLineId:          z.number().nullable().optional(),
  arquivoUrl:          z.string().nullable().optional(),
  arquivoNome:         z.string().nullable().optional(),
  observacoes:         z.string().nullable().optional(),
});

export const fiscalNotesRouter = router({

  list: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      search:     z.string().optional(),
      status:     z.string().optional(),
      obraId:     z.number().nullable().optional(),
      ano:        z.number().optional(),
      mes:        z.number().optional(),
      semVinculo: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db
        .select()
        .from(fiscalNotes)
        .where(and(
          eq(fiscalNotes.companyId, input.companyId),
          input.status   ? eq(fiscalNotes.status, input.status) : undefined,
          input.obraId   ? eq(fiscalNotes.obraId, input.obraId) : undefined,
          input.semVinculo ? isNull(fiscalNotes.entryId) : undefined,
          input.search
            ? or(
                ilike(fiscalNotes.numeroNf, `%${input.search}%`),
                ilike(fiscalNotes.tomadorRazaoSocial, `%${input.search}%`),
                ilike(fiscalNotes.bmReferencia, `%${input.search}%`),
                ilike(fiscalNotes.descricaoServico, `%${input.search}%`),
              )
            : undefined,
        ))
        .orderBy(desc(fiscalNotes.dataEmissao), desc(fiscalNotes.id));

      let result = rows;
      if (input.ano) {
        result = result.filter(r => r.dataEmissao?.startsWith(String(input.ano)));
      }
      if (input.mes) {
        const mm = String(input.mes).padStart(2, "0");
        result = result.filter(r => r.dataEmissao?.slice(0, 7).endsWith(`-${mm}`));
      }
      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [row] = await db
        .select()
        .from(fiscalNotes)
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      return row;
    }),

  criar: protectedProcedure
    .input(nfInput)
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      const [row] = await db.insert(fiscalNotes).values({
        companyId:          input.companyId,
        numeroNf:           input.numeroNf,
        serie:              input.serie ?? null,
        chaveAcesso:        input.chaveAcesso ?? null,
        dataEmissao:        input.dataEmissao,
        dataCompetencia:    input.dataCompetencia ?? null,
        dataVencimento:     input.dataVencimento ?? null,
        tomadorCnpj:        input.tomadorCnpj ?? null,
        tomadorRazaoSocial: input.tomadorRazaoSocial ?? null,
        obraId:             input.obraId ?? null,
        obraNome:           input.obraNome ?? null,
        bmReferencia:       input.bmReferencia ?? null,
        descricaoServico:   input.descricaoServico ?? null,
        valorBruto:         String(input.valorBruto),
        deducoesTotal:      String(input.deducoesTotal ?? 0),
        baseCalculoIss:     input.baseCalculoIss != null ? String(input.baseCalculoIss) : null,
        aliquotaIss:        input.aliquotaIss != null ? String(input.aliquotaIss) : null,
        issRetido:          String(input.issRetido ?? 0),
        retencaoInss:       String(input.retencaoInss ?? 0),
        retencaoIrrf:       String(input.retencaoIrrf ?? 0),
        retencaoPisCofins:  String(input.retencaoPisCofins ?? 0),
        valorLiquido:       String(input.valorLiquido),
        status:             "pendente",
        entryId:            input.entryId ?? null,
        stmtLineId:         input.stmtLineId ?? null,
        arquivoUrl:         input.arquivoUrl ?? null,
        arquivoNome:        input.arquivoNome ?? null,
        observacoes:        input.observacoes ?? null,
        criadoPorId:        ctx.user?.id ?? null,
        criadoPorNome:      (ctx.user as any)?.name ?? null,
        createdAt:          now,
        updatedAt:          now,
      }).returning();
      return row;
    }),

  atualizar: protectedProcedure
    .input(nfInput.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      await db.update(fiscalNotes)
        .set({
          numeroNf:           input.numeroNf,
          serie:              input.serie ?? null,
          chaveAcesso:        input.chaveAcesso ?? null,
          dataEmissao:        input.dataEmissao,
          dataCompetencia:    input.dataCompetencia ?? null,
          dataVencimento:     input.dataVencimento ?? null,
          tomadorCnpj:        input.tomadorCnpj ?? null,
          tomadorRazaoSocial: input.tomadorRazaoSocial ?? null,
          obraId:             input.obraId ?? null,
          obraNome:           input.obraNome ?? null,
          bmReferencia:       input.bmReferencia ?? null,
          descricaoServico:   input.descricaoServico ?? null,
          valorBruto:         String(input.valorBruto),
          deducoesTotal:      String(input.deducoesTotal ?? 0),
          baseCalculoIss:     input.baseCalculoIss != null ? String(input.baseCalculoIss) : null,
          aliquotaIss:        input.aliquotaIss != null ? String(input.aliquotaIss) : null,
          issRetido:          String(input.issRetido ?? 0),
          retencaoInss:       String(input.retencaoInss ?? 0),
          retencaoIrrf:       String(input.retencaoIrrf ?? 0),
          retencaoPisCofins:  String(input.retencaoPisCofins ?? 0),
          valorLiquido:       String(input.valorLiquido),
          arquivoUrl:         input.arquivoUrl ?? null,
          arquivoNome:        input.arquivoNome ?? null,
          observacoes:        input.observacoes ?? null,
          updatedAt:          now,
        })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  vincularLancamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), entryId: z.number().nullable() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      const [cur] = await db.select({ stmtLineId: fiscalNotes.stmtLineId })
        .from(fiscalNotes)
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      const novoStatus = input.entryId != null && cur?.stmtLineId != null
        ? "conciliada"
        : input.entryId != null ? "recebida" : "pendente";
      await db.update(fiscalNotes)
        .set({ entryId: input.entryId, status: novoStatus, updatedAt: now })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  vincularExtrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), stmtLineId: z.number().nullable() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      const [cur] = await db.select({ entryId: fiscalNotes.entryId })
        .from(fiscalNotes)
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      const novoStatus = input.stmtLineId != null && cur?.entryId != null
        ? "conciliada"
        : input.stmtLineId != null ? "recebida"
        : cur?.entryId != null ? "recebida" : "pendente";
      await db.update(fiscalNotes)
        .set({ stmtLineId: input.stmtLineId, status: novoStatus, updatedAt: now })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      const now = new Date().toISOString();
      await db.update(fiscalNotes)
        .set({ status: "cancelada", updatedAt: now })
        .where(and(eq(fiscalNotes.id, input.id), eq(fiscalNotes.companyId, input.companyId)));
      return { success: true };
    }),

  listByEntry: protectedProcedure
    .input(z.object({ companyId: z.number(), entryId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertNfAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select().from(fiscalNotes)
        .where(and(eq(fiscalNotes.companyId, input.companyId), eq(fiscalNotes.entryId, input.entryId)));
    }),
});
