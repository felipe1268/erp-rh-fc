// Rev. 3900 — PT Permissão de Trabalho (NR-35) — router tRPC
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { ptPermissoes, ptAssinaturas, employees, obras } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function assertCompany(ctx: any, companyId: number) {
  if (ctx.user?.companyId && String(ctx.user.companyId) !== String(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
  }
}

// Gera próximo número da PT: PT-001, PT-002...
async function proximoNumero(db: any, companyId: number): Promise<string> {
  const [row] = await db
    .select({ max: sql<string>`max(${ptPermissoes.numero})` })
    .from(ptPermissoes)
    .where(and(eq(ptPermissoes.companyId, companyId), isNull(ptPermissoes.deletedAt)));
  const last = row?.max;
  if (!last) return "PT-001";
  const match = last.match(/(\d+)$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `PT-${String(next).padStart(3, "0")}`;
}

export const ptPermissoesRouter = router({
  // ── Lista ──────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
      obraId: z.number().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const conds = [
        eq(ptPermissoes.companyId, input.companyId),
        isNull(ptPermissoes.deletedAt),
      ];
      if (input.status) conds.push(eq(ptPermissoes.status, input.status));
      if (input.obraId) conds.push(eq(ptPermissoes.obraId, input.obraId));

      const rows = await db
        .select({
          id:          ptPermissoes.id,
          numero:      ptPermissoes.numero,
          status:      ptPermissoes.status,
          dataEmissao: ptPermissoes.dataEmissao,
          horaInicio:  ptPermissoes.horaInicio,
          horaTermino: ptPermissoes.horaTermino,
          obraId:      ptPermissoes.obraId,
          employeeId:  ptPermissoes.employeeId,
          maoDeObra:   ptPermissoes.maoDeObra,
          criadoPorNome: ptPermissoes.criadoPorNome,
          createdAt:   ptPermissoes.createdAt,
          fcSignSessionId: ptPermissoes.fcSignSessionId,
          empresaExecutanteNome: ptPermissoes.empresaExecutanteNome,
          tiposTrabalhoJson: ptPermissoes.tiposTrabalhoJson,
          envolvidosJson: ptPermissoes.envolvidosJson,
        })
        .from(ptPermissoes)
        .where(and(...conds))
        .orderBy(desc(ptPermissoes.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Enriquecer com nome da obra e do solicitante
      const obraIds = [...new Set(rows.map(r => r.obraId).filter(Boolean))] as number[];
      const empIds  = [...new Set(rows.map(r => r.employeeId).filter(Boolean))] as number[];

      const obrasMap = new Map<number, string>();
      const empsMap  = new Map<number, string>();

      if (obraIds.length) {
        const oRows = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
          .where(inArray(obras.id, obraIds));
        oRows.forEach((o: any) => obrasMap.set(o.id, o.nome));
      }
      if (empIds.length) {
        const eRows = await db.select({ id: employees.id, nome: employees.nome }).from(employees)
          .where(inArray(employees.id, empIds));
        eRows.forEach((e: any) => empsMap.set(e.id, e.nome));
      }

      return rows.map(r => ({
        ...r,
        obraNome:       r.obraId ? (obrasMap.get(r.obraId) ?? null) : null,
        solicitanteNome: r.employeeId ? (empsMap.get(r.employeeId) ?? null) : null,
        envolvidos: r.envolvidosJson ? (() => { try { return JSON.parse(r.envolvidosJson); } catch { return []; } })() : [],
        tiposTrabalho: r.tiposTrabalhoJson ? (() => { try { return JSON.parse(r.tiposTrabalhoJson); } catch { return []; } })() : [],
      }));
    }),

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const rows = await db
        .select({ status: ptPermissoes.status, cnt: sql<number>`count(*)` })
        .from(ptPermissoes)
        .where(and(eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt)))
        .groupBy(ptPermissoes.status);
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status] = Number(r.cnt);
      return {
        total:        Object.values(byStatus).reduce((a, b) => a + b, 0),
        rascunho:     byStatus["rascunho"] ?? 0,
        em_andamento: byStatus["em_andamento"] ?? 0,
        liberada:     byStatus["liberada"] ?? 0,
        concluida:    byStatus["concluida"] ?? 0,
        cancelada:    byStatus["cancelada"] ?? 0,
      };
    }),

  // ── Get by ID ─────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [pt] = await db.select().from(ptPermissoes)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt)))
        .limit(1);
      if (!pt) throw new TRPCError({ code: "NOT_FOUND" });

      const assinaturas = await db.select().from(ptAssinaturas)
        .where(and(eq(ptAssinaturas.ptId, input.id), eq(ptAssinaturas.companyId, input.companyId)));

      let obraNome: string | null = null;
      if (pt.obraId) {
        const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, pt.obraId)).limit(1);
        obraNome = ob?.nome ?? null;
      }
      let solicitanteNome: string | null = null;
      if (pt.employeeId) {
        const [emp] = await db.select({ nome: employees.nome }).from(employees).where(eq(employees.id, pt.employeeId)).limit(1);
        solicitanteNome = emp?.nome ?? null;
      }

      return {
        ...pt,
        obraNome,
        solicitanteNome,
        assinaturas: assinaturas.map(a => ({ ...a, assinaturaImg: undefined })),
        envolvidos: pt.envolvidosJson ? (() => { try { return JSON.parse(pt.envolvidosJson); } catch { return []; } })() : [],
        tiposTrabalho: pt.tiposTrabalhoJson ? (() => { try { return JSON.parse(pt.tiposTrabalhoJson); } catch { return []; } })() : [],
        checklist: pt.checklistJson ? (() => { try { return JSON.parse(pt.checklistJson); } catch { return {}; } })() : {},
      };
    }),

  // ── Próximo número ─────────────────────────────────────────────────────────
  proximoNumero: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      return { numero: await proximoNumero(db, input.companyId) };
    }),

  // ── Create ─────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      companyId:             z.number(),
      obraId:                z.number().optional().nullable(),
      employeeId:            z.number(),
      dataEmissao:           z.string().optional().nullable(),
      horaInicio:            z.string().optional().nullable(),
      horaTermino:           z.string().optional().nullable(),
      maoDeObra:             z.string().optional().nullable(),
      supervisorNome:        z.string().optional().nullable(),
      empresaExecutanteCnpj: z.string().optional().nullable(),
      empresaExecutanteNome: z.string().optional().nullable(),
      outrosFormularios:     z.number().default(0),
      outrosFormulariosDesc: z.string().optional().nullable(),
      tiposTrabalhoJson:     z.string().optional().nullable(),
      descricaoTrabalho:     z.string().optional().nullable(),
      checklistJson:         z.string().optional().nullable(),
      envolvidosJson:        z.string().optional().nullable(),
      empresaSetorExecutante:   z.string().optional().nullable(),
      responsavelAreaNome:      z.string().optional().nullable(),
      responsavelLiberacaoNome: z.string().optional().nullable(),
      executanteNome:           z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const numero = await proximoNumero(db, input.companyId);
      const [pt] = await db.insert(ptPermissoes).values({
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        employeeId:            input.employeeId,
        numero,
        status:                "em_andamento",
        dataEmissao:           input.dataEmissao ?? null,
        horaInicio:            input.horaInicio ?? null,
        horaTermino:           input.horaTermino ?? null,
        maoDeObra:             input.maoDeObra ?? null,
        supervisorNome:        input.supervisorNome ?? null,
        empresaExecutanteCnpj: input.empresaExecutanteCnpj ?? null,
        empresaExecutanteNome: input.empresaExecutanteNome ?? null,
        outrosFormularios:     input.outrosFormularios,
        outrosFormulariosDesc: input.outrosFormulariosDesc ?? null,
        tiposTrabalhoJson:     input.tiposTrabalhoJson ?? null,
        descricaoTrabalho:     input.descricaoTrabalho ?? null,
        checklistJson:         input.checklistJson ?? null,
        envolvidosJson:        input.envolvidosJson ?? null,
        empresaSetorExecutante:   input.empresaSetorExecutante ?? null,
        responsavelAreaNome:      input.responsavelAreaNome ?? null,
        responsavelLiberacaoNome: input.responsavelLiberacaoNome ?? null,
        executanteNome:           input.executanteNome ?? null,
        criadoPorId:   ctx.user.id,
        criadoPorNome: ctx.user.name ?? "Sistema",
      }).returning();
      return pt;
    }),

  // ── Update ─────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id:        z.number(),
      companyId: z.number(),
      data:      z.record(z.unknown()),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const allowed = [
        "obraId","dataEmissao","horaInicio","horaTermino","maoDeObra","supervisorNome",
        "empresaExecutanteCnpj","empresaExecutanteNome","outrosFormularios","outrosFormulariosDesc",
        "tiposTrabalhoJson","descricaoTrabalho","checklistJson","envolvidosJson",
        "empresaSetorExecutante","responsavelAreaNome","responsavelAreaAss",
        "responsavelLiberacaoNome","responsavelLiberacaoAss","executanteNome","executanteAss",
        "conclusaoSolicitanteNome","conclusaoData","conclusaoHoraInicio","conclusaoHoraFim",
        "revalidacaoNome","revalidacaoData","revalidacaoHoraInicio","revalidacaoHoraFim","revalidacaoResponsavel",
        "status","fcSignSessionId","employeeId",
      ];
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const k of allowed) {
        if (k in input.data) patch[k] = (input.data as any)[k];
      }
      await db.update(ptPermissoes).set(patch as any)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt)));
      return { ok: true };
    }),

  // ── Liberar (muda status → liberada) ───────────────────────────────────────
  liberar: protectedProcedure
    .input(z.object({
      id:        z.number(),
      companyId: z.number(),
      responsavelAreaNome:      z.string().optional().nullable(),
      responsavelAreaAss:       z.string().optional().nullable(),
      responsavelLiberacaoNome: z.string().optional().nullable(),
      responsavelLiberacaoAss:  z.string().optional().nullable(),
      executanteNome:           z.string().optional().nullable(),
      executanteAss:            z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ptPermissoes).set({
        status: "liberada",
        responsavelAreaNome:      input.responsavelAreaNome ?? null,
        responsavelAreaAss:       input.responsavelAreaAss ?? null,
        responsavelLiberacaoNome: input.responsavelLiberacaoNome ?? null,
        responsavelLiberacaoAss:  input.responsavelLiberacaoAss ?? null,
        executanteNome:           input.executanteNome ?? null,
        executanteAss:            input.executanteAss ?? null,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt)));
      return { ok: true };
    }),

  // ── Concluir ───────────────────────────────────────────────────────────────
  concluir: protectedProcedure
    .input(z.object({
      id:        z.number(),
      companyId: z.number(),
      conclusaoSolicitanteNome: z.string().optional().nullable(),
      conclusaoData:            z.string().optional().nullable(),
      conclusaoHoraInicio:      z.string().optional().nullable(),
      conclusaoHoraFim:         z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ptPermissoes).set({
        status: "concluida",
        conclusaoSolicitanteNome: input.conclusaoSolicitanteNome ?? null,
        conclusaoData:            input.conclusaoData ?? null,
        conclusaoHoraInicio:      input.conclusaoHoraInicio ?? null,
        conclusaoHoraFim:         input.conclusaoHoraFim ?? null,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt)));
      return { ok: true };
    }),

  // ── Cancelar (soft) ────────────────────────────────────────────────────────
  cancelar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ptPermissoes).set({ status: "cancelada", updatedAt: new Date().toISOString() } as any)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt)));
      return { ok: true };
    }),

  // ── Assinaturas dos envolvidos (canvas pad) ────────────────────────────────
  addAssinatura: protectedProcedure
    .input(z.object({
      ptId:          z.number(),
      companyId:     z.number(),
      posicao:       z.number().min(1).max(6),
      nomeManual:    z.string().optional().nullable(),
      funcaoManual:  z.string().optional().nullable(),
      employeeId:    z.number().optional().nullable(),
      assinaturaImg: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      // Valida que a PT pertence à empresa
      const [pt] = await db.select({ id: ptPermissoes.id }).from(ptPermissoes)
        .where(and(eq(ptPermissoes.id, input.ptId), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt))).limit(1);
      if (!pt) throw new TRPCError({ code: "NOT_FOUND" });

      // dataURL válida?
      const re = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
      if (!re.test(input.assinaturaImg)) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });

      // Upsert: se já existe para aquela posição, remove e recria
      await db.delete(ptAssinaturas).where(and(eq(ptAssinaturas.ptId, input.ptId), eq(ptAssinaturas.posicao, input.posicao), eq(ptAssinaturas.companyId, input.companyId)));
      const ip = (ctx as any).req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ?? "desconhecido";
      const [row] = await db.insert(ptAssinaturas).values({
        ptId:          input.ptId,
        companyId:     input.companyId,
        posicao:       input.posicao,
        nomeManual:    input.nomeManual ?? null,
        funcaoManual:  input.funcaoManual ?? null,
        employeeId:    input.employeeId ?? null,
        assinaturaImg: input.assinaturaImg,
        assinadoEm:    new Date().toISOString(),
        ip,
      }).returning({ id: ptAssinaturas.id });
      return { id: row.id };
    }),

  getAssinaturaImg: protectedProcedure
    .input(z.object({ ptId: z.number(), companyId: z.number(), posicao: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.select({ assinaturaImg: ptAssinaturas.assinaturaImg })
        .from(ptAssinaturas)
        .where(and(eq(ptAssinaturas.ptId, input.ptId), eq(ptAssinaturas.posicao, input.posicao), eq(ptAssinaturas.companyId, input.companyId))).limit(1);
      return { assinaturaImg: row?.assinaturaImg ?? null };
    }),

  removeAssinatura: protectedProcedure
    .input(z.object({ ptId: z.number(), companyId: z.number(), posicao: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.delete(ptAssinaturas).where(and(eq(ptAssinaturas.ptId, input.ptId), eq(ptAssinaturas.posicao, input.posicao), eq(ptAssinaturas.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Excluir (soft) ─────────────────────────────────────────────────────────
  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ptPermissoes).set({ deletedAt: new Date().toISOString() } as any)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId)));
      return { ok: true };
    }),
});
