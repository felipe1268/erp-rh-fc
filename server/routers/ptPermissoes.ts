// Rev. 3900 — PT Permissão de Trabalho (NR-35) — router tRPC
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { ptPermissoes, ptAssinaturas, employees, obras, signatureSessions, signatureSigners } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";

function sha256(s: string) { return createHash("sha256").update(s, "utf8").digest("hex"); }
function genToken() { return randomBytes(32).toString("hex"); }
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
        const eRows = await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto }).from(employees)
          .where(inArray(employees.id, empIds));
        eRows.forEach((e: any) => empsMap.set(e.id, e.nomeCompleto));
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
        const [emp] = await db.select({ nomeCompleto: employees.nomeCompleto }).from(employees).where(eq(employees.id, pt.employeeId)).limit(1);
        solicitanteNome = emp?.nomeCompleto ?? null;
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
      outrosFormularios:         z.number().default(0),
      outrosFormulariosDesc:     z.string().optional().nullable(),
      outrosFormulariosAnexoUrl: z.string().optional().nullable(),
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
        outrosFormularios:         input.outrosFormularios,
        outrosFormulariosDesc:     input.outrosFormulariosDesc ?? null,
        outrosFormulariosAnexoUrl: input.outrosFormulariosAnexoUrl ?? null,
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
        "empresaExecutanteCnpj","empresaExecutanteNome","outrosFormularios","outrosFormulariosDesc","outrosFormulariosAnexoUrl",
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
      posicao:       z.number().min(1).max(30),
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

  // ── Excluir lote (soft) ────────────────────────────────────────────────────
  excluirLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ptPermissoes).set({ deletedAt: new Date().toISOString() } as any)
        .where(and(inArray(ptPermissoes.id, input.ids), eq(ptPermissoes.companyId, input.companyId)));
      return { ok: true, count: input.ids.length };
    }),

  // ── Alertas para Painel SST ───────────────────────────────────────────────
  alertas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const hoje = new Date().toISOString().slice(0, 10);
      const horaAtual = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

      // PTs em andamento hoje
      const emAndamento = await db.select({ id: ptPermissoes.id, numero: ptPermissoes.numero, dataEmissao: ptPermissoes.dataEmissao, horaTermino: ptPermissoes.horaTermino, obraId: ptPermissoes.obraId })
        .from(ptPermissoes)
        .where(and(eq(ptPermissoes.companyId, input.companyId), eq(ptPermissoes.status, "em_andamento"), isNull(ptPermissoes.deletedAt)));

      // PTs liberadas com hora_termino < hora atual (vencidas)
      const liberadas = await db.select({ id: ptPermissoes.id, numero: ptPermissoes.numero, dataEmissao: ptPermissoes.dataEmissao, horaTermino: ptPermissoes.horaTermino, obraId: ptPermissoes.obraId })
        .from(ptPermissoes)
        .where(and(eq(ptPermissoes.companyId, input.companyId), eq(ptPermissoes.status, "liberada"), isNull(ptPermissoes.deletedAt)));

      const vencidas = liberadas.filter(pt => {
        if (!pt.horaTermino || !pt.dataEmissao) return false;
        if (pt.dataEmissao < hoje) return true;
        if (pt.dataEmissao === hoje) return pt.horaTermino < horaAtual;
        return false;
      });

      // Nomes das obras
      const obraIds = [...new Set([...emAndamento, ...vencidas].map(r => r.obraId).filter(Boolean))] as number[];
      const obrasMap = new Map<number, string>();
      if (obraIds.length) {
        (await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds)))
          .forEach((o: any) => obrasMap.set(o.id, o.nome));
      }

      return {
        totalEmAndamento: emAndamento.length,
        totalVencidas: vencidas.length,
        vencidas: vencidas.slice(0, 5).map(pt => ({ ...pt, obraNome: pt.obraId ? obrasMap.get(pt.obraId) ?? null : null })),
        emAndamento: emAndamento.slice(0, 5).map(pt => ({ ...pt, obraNome: pt.obraId ? obrasMap.get(pt.obraId) ?? null : null })),
      };
    }),

  // ── Info SST da obra (TST + Engenheiro + Encarregado) ─────────────────────
  getObraSST: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const rows = await db.$client.query(`
        SELECT
          o.responsavel_id        AS "responsavelId",
          e1."nomeCompleto"       AS "responsavelNome",
          o.tst_id                AS "tstId",
          e2."nomeCompleto"       AS "tstNome",
          o.encarregado_id        AS "encarregadoId",
          e3."nomeCompleto"       AS "encarregadoNome"
        FROM obras o
        LEFT JOIN employees e1 ON e1.id = o.responsavel_id
        LEFT JOIN employees e2 ON e2.id = o.tst_id
        LEFT JOIN employees e3 ON e3.id = o.encarregado_id
        WHERE o.id = $1 AND o."companyId" = $2
        LIMIT 1
      `, [input.obraId, input.companyId]);
      return (rows.rows[0] ?? null) as {
        responsavelId: number | null; responsavelNome: string | null;
        tstId: number | null; tstNome: string | null;
        encarregadoId: number | null; encarregadoNome: string | null;
      } | null;
    }),

  // ── Gerar HTML para impressão ─────────────────────────────────────────────
  gerarHtml: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), logoUrl: z.string().optional().nullable() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [pt] = await db.select().from(ptPermissoes)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt))).limit(1);
      if (!pt) throw new TRPCError({ code: "NOT_FOUND" });

      let obraNome = "";
      let obraClienteLogoUrl: string | null = null;
      let obraGerenciadoraLogoUrl: string | null = null;
      let obraGerenciadoraNome: string | null = null;
      let obraClienteNome: string | null = null;
      if (pt.obraId) {
        const [ob] = await db.select({
          nome: obras.nome,
          clienteLogoUrl: obras.clienteLogoUrl,
          gerenciadoraLogoUrl: obras.gerenciadoraLogoUrl,
          gerenciadoraNome: obras.gerenciadoraNome,
          cliente: obras.cliente,
        }).from(obras).where(eq(obras.id, pt.obraId)).limit(1);
        obraNome = ob?.nome ?? "";
        obraClienteLogoUrl = ob?.clienteLogoUrl ?? null;
        obraGerenciadoraLogoUrl = ob?.gerenciadoraLogoUrl ?? null;
        obraGerenciadoraNome = ob?.gerenciadoraNome ?? null;
        obraClienteNome = ob?.cliente ?? null;
      }

      // Solicitante: usa criadoPorNome (usuário logado na criação) com fallback no employee
      let solicitanteNome = pt.criadoPorNome ?? "";
      if (!solicitanteNome && pt.employeeId) {
        const [emp] = await db.select({ nomeCompleto: employees.nomeCompleto }).from(employees).where(eq(employees.id, pt.employeeId)).limit(1);
        solicitanteNome = emp?.nomeCompleto ?? "";
      }

      const assinaturas = await db.select().from(ptAssinaturas)
        .where(and(eq(ptAssinaturas.ptId, input.id), eq(ptAssinaturas.companyId, input.companyId)))
        .orderBy(ptAssinaturas.posicao);

      const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const escAttr = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      let checklist: any[] = [];
      try { checklist = JSON.parse(pt.checklistJson ?? "[]"); } catch {}
      let envolvidos: any[] = [];
      try { envolvidos = JSON.parse(pt.envolvidosJson ?? "[]"); } catch {}
      let tipos: any[] = [];
      try { tipos = JSON.parse(pt.tiposTrabalhoJson ?? "[]"); } catch {}

      // [item, NR referência]
      const checklistItems: [string, string][] = [
        ["Todas as pessoas envolvidas possuem treinamento de NR-35 vigente?",           "NR-35 / 35.3.1"],
        ["Todas as pessoas possuem ASO atualizado (aptidão médica)?",                   "NR-7 / NR-35 35.4"],
        ["As condições climáticas são propícias para o trabalho em altura?",            "NR-35 / 35.6.1"],
        ["Foi designado um supervisor responsável pela execução do serviço?",           "NR-35 / 35.5"],
        ["Todos os recursos, equipamentos e EPI foram verificados e estão disponíveis?","NR-35 / 35.6.3"],
        ["Foi estabelecida equipe de atendimento e resgate de emergência?",             "NR-35 / 35.7"],
        ["Foi estabelecido plano de comunicação entre os envolvidos?",                  "NR-35 / 35.5.2"],
        ["Os pontos de fixação / ancoragem dos sistemas de proteção foram aprovados?",  "NR-35 / 35.6.4"],
        ["Foi elaborado plano para prevenção de queda de materiais e ferramentas?",     "NR-35 / 35.6.2"],
        ["A proximidade com pontos de energia elétrica foi avaliada e controlada?",     "NR-10 / NR-35 35.6.5"],
        ["Serviço de Contratada: a PT está devidamente preenchida e autorizada?",       "NR-35 / 35.5.3"],
        ["Todos os EPIs foram inspecionados (cinturão, talabarte, capacete, etc.)?",    "NR-35 / 35.6.3 / NR-6"],
        ["O local do serviço está devidamente isolado e sinalizado?",                   "NR-26 / NR-35"],
        ["Existe procedimento específico escrito, testado e aprovado para a tarefa?",   "NR-35 / 35.5.1"],
        ["Todos os envolvidos estão usando corretamente os EPIs obrigatórios?",         "NR-6 / NR-35 35.6.3"],
      ];

      const assMap = new Map(assinaturas.map(a => [a.posicao, a]));

      const fcLogoUrl = input.logoUrl ?? null;

      const statusLabel: Record<string, string> = {
        rascunho: "Rascunho", em_andamento: "Em Andamento", liberada: "Liberada",
        concluida: "Concluída", cancelada: "Cancelada",
      };
      const statusColor: Record<string, string> = {
        rascunho: "#64748b", em_andamento: "#1d4ed8", liberada: "#15803d",
        concluida: "#166534", cancelada: "#9f1239",
      };
      const statusBg: Record<string, string> = {
        rascunho: "#f1f5f9", em_andamento: "#dbeafe", liberada: "#dcfce7",
        concluida: "#dcfce7", cancelada: "#ffe4e6",
      };
      const stLabel = statusLabel[pt.status] ?? pt.status;
      const stColor = statusColor[pt.status] ?? "#1e3a5f";
      const stBg = statusBg[pt.status] ?? "#f1f5f9";

      const logoBlock = (url: string | null, label: string, nome: string | null, align: "left" | "right") => {
        if (!url && !nome) return `<div style="flex:1;min-width:0"></div>`;
        const textAlign = align === "left" ? "left" : "right";
        const alignItems = align === "left" ? "flex-start" : "flex-end";
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:${alignItems};gap:3px;min-width:0">
          <span style="font-size:6.5pt;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px">${esc(label)}</span>
          ${url ? `<img src="${escAttr(url)}" alt="${escAttr(label)}" style="max-height:44px;max-width:160px;object-fit:contain" />` : ""}
          ${nome ? `<span style="font-size:8pt;color:#475569;font-weight:600;text-align:${textAlign};word-break:break-word">${esc(nome)}</span>` : ""}
        </div>`;
      };

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Permissão de Trabalho — ${esc(pt.numero)}</title>
<style>
  @page { margin: 14mm 16mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #1e293b; margin: 0; }
  /* ── Cabeçalho ───────────────────────────────────────────── */
  .pt-header { border: 2px solid #1e3a5f; border-radius: 5px; overflow: hidden; margin-bottom: 8px; }
  .pt-header-logos { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 8px 12px 6px; background: #fff; }
  .pt-header-title { background: #1e3a5f; color: #fff; text-align: center; padding: 5px 8px 4px; }
  .pt-header-title h1 { font-size: 12pt; font-weight: 800; margin: 0; letter-spacing: 0.5px; }
  .pt-header-title .sub { font-size: 8pt; opacity: 0.85; margin-top: 2px; }
  .pt-header-meta { display: flex; align-items: center; justify-content: center; gap: 14px; background: #f0f4ff; padding: 4px 12px; font-size: 8pt; color: #1e3a5f; border-top: 1px solid #bfdbfe; }
  .status-pill { display: inline-block; font-size: 7.5pt; font-weight: 700; padding: 1.5px 9px; border-radius: 10px; background: ${stBg}; color: ${stColor}; border: 1px solid ${stColor}40; }
  /* ── Seções ──────────────────────────────────────────────── */
  .sec-title { font-size: 9pt; background: #1e3a5f; color: white; padding: 3px 8px; margin: 7px 0 4px; font-weight: 700; letter-spacing: 0.3px; display: flex; align-items: center; gap: 5px; }
  .sec-title-nr { font-size: 7pt; font-weight: 400; opacity: 0.75; margin-left: auto; }
  /* ── Campos ──────────────────────────────────────────────── */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-bottom: 3px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px; margin-bottom: 3px; }
  .grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 3px; margin-bottom: 3px; }
  .field { border: 1px solid #cbd5e1; padding: 3px 6px; border-radius: 3px; background: #fafafa; }
  .fl { font-size: 6.5pt; color: #64748b; display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1px; }
  .fv { font-size: 9pt; font-weight: 700; color: #0f172a; }
  .field-wide { border: 1px solid #cbd5e1; padding: 4px 6px; border-radius: 3px; background: #fafafa; min-height: 36px; margin-bottom: 3px; }
  /* ── Checklist ───────────────────────────────────────────── */
  .cl-header { display: grid; grid-template-columns: 26px 1fr 80px 36px; gap: 4px; padding: 2px 4px; background: #1e3a5f; color: #fff; font-size: 7pt; font-weight: 700; margin-bottom: 2px; border-radius: 2px; }
  .cl-row { display: grid; grid-template-columns: 26px 1fr 80px 36px; gap: 4px; align-items: center; padding: 2.5px 4px; border-bottom: 1px solid #f1f5f9; font-size: 8pt; }
  .cl-row:nth-child(even) { background: #f8fafc; }
  .cl-num { font-weight: 700; color: #64748b; font-size: 7.5pt; text-align: center; }
  .cl-nr { font-size: 6.5pt; color: #64748b; }
  .check-badge { width: 30px; text-align: center; font-weight: 800; font-size: 7.5pt; padding: 2px 0; border-radius: 3px; }
  .check-S  { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
  .check-N  { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .check-NA { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
  /* ── Assinaturas ─────────────────────────────────────────── */
  .sig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 4px; }
  .sig-box { border: 1px solid #bfdbfe; border-radius: 4px; padding: 5px; text-align: center; min-height: 80px; background: #f8fafc; }
  .sig-box img { max-width: 100%; max-height: 52px; object-fit: contain; }
  .sig-img-empty { height: 52px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 7.5pt; border-bottom: 1px dashed #cbd5e1; margin-bottom: 4px; }
  .sig-name { font-size: 8pt; font-weight: 700; margin-top: 3px; color: #1e293b; }
  .sig-label { font-size: 7pt; color: #64748b; }
  .sig-date { font-size: 6.5pt; color: #94a3b8; margin-top: 1px; }
  /* ── Impressão ───────────────────────────────────────────── */
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- ═══════════════════════ CABEÇALHO ═══════════════════════ -->
<div class="pt-header">
  <div class="pt-header-logos">
    ${logoBlock(fcLogoUrl, "Executora", "FC Engenharia", "left")}
    <div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;min-width:0">
      <span style="font-size:7pt;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.6px">Norma</span>
      <span style="font-size:9pt;font-weight:800;color:#1e3a5f;letter-spacing:1px">NR-35</span>
      <span style="font-size:6.5pt;color:#64748b">Portaria MTE nº 313/2012</span>
    </div>
    <div style="flex:1;display:flex;flex-direction:row;align-items:flex-start;justify-content:flex-end;gap:10px;min-width:0">
      ${obraClienteLogoUrl || obraClienteNome ? logoBlock(obraClienteLogoUrl, "Cliente", obraClienteNome, "right") : ""}
      ${obraGerenciadoraLogoUrl || obraGerenciadoraNome ? logoBlock(obraGerenciadoraLogoUrl, "Gerenciadora", obraGerenciadoraNome, "right") : ""}
    </div>
  </div>
  <div class="pt-header-title">
    <h1>PERMISSÃO DE TRABALHO EM ALTURA</h1>
    <div class="sub">Trabalho em Altura — Conforme NR-35 (Portaria MTE nº 313/2012)</div>
  </div>
  <div class="pt-header-meta">
    <span><strong>PT Nº:</strong> ${esc(pt.numero)}</span>
    <span>|</span>
    <span><strong>Obra:</strong> ${esc(obraNome || "—")}</span>
    <span>|</span>
    <span><strong>Status:</strong> <span class="status-pill">${esc(stLabel.toUpperCase())}</span></span>
    <span>|</span>
    <span><strong>Emissão:</strong> ${esc(pt.dataEmissao || "—")}</span>
  </div>
</div>

<!-- ═══════════════════════ 1. IDENTIFICAÇÃO ═══════════════════════ -->
<div class="sec-title">1. IDENTIFICAÇÃO <span class="sec-title-nr">NR-35, item 35.5</span></div>
<div class="grid4">
  <div class="field"><span class="fl">Número PT</span><span class="fv">${esc(pt.numero)}</span></div>
  <div class="field"><span class="fl">Data de Emissão</span><span class="fv">${esc(pt.dataEmissao || "—")}</span></div>
  <div class="field"><span class="fl">Hora Início</span><span class="fv">${esc(pt.horaInicio || "—")}</span></div>
  <div class="field"><span class="fl">Hora Término</span><span class="fv">${esc(pt.horaTermino || "—")}</span></div>
</div>
<div class="grid3">
  <div class="field"><span class="fl">Solicitante / Emissor</span><span class="fv">${esc(solicitanteNome || "—")}</span></div>
  <div class="field"><span class="fl">Supervisor Responsável</span><span class="fv">${esc(pt.supervisorNome || "—")}</span></div>
  <div class="field"><span class="fl">Tipo de Mão de Obra</span><span class="fv">${esc(pt.maoDeObra || "—")}</span></div>
</div>
<div class="grid2">
  <div class="field"><span class="fl">Obra / Local do Serviço</span><span class="fv">${esc(obraNome || "—")}</span></div>
  <div class="field"><span class="fl">Tipos de Trabalho em Altura</span><span class="fv">${tipos.length ? tipos.join(", ") : "—"}</span></div>
</div>

<!-- ═══════════════════════ 2. DESCRIÇÃO DO SERVIÇO ═══════════════════════ -->
<div class="sec-title">2. DESCRIÇÃO DO SERVIÇO <span class="sec-title-nr">NR-35, item 35.5.1</span></div>
<div class="field-wide"><span class="fl">Descrição detalhada do trabalho a ser executado</span><span class="fv">${esc(pt.descricaoTrabalho || "—")}</span></div>
<div class="grid3">
  <div class="field"><span class="fl">Empresa Executante (CNPJ)</span><span class="fv">${esc(pt.empresaExecutanteCnpj || "—")}</span></div>
  <div class="field" style="grid-column:span 2"><span class="fl">Empresa Executante (Razão Social)</span><span class="fv">${esc(pt.empresaExecutanteNome || "—")}</span></div>
</div>

<!-- ═══════════════════════ 3. CHECKLIST DE SEGURANÇA — NR-35 ═══════════════════════ -->
<div class="sec-title">3. CHECKLIST DE SEGURANÇA — NR-35 <span class="sec-title-nr">S = Sim &nbsp;|&nbsp; N = Não &nbsp;|&nbsp; NA = Não Aplica</span></div>
<div class="cl-header">
  <span style="text-align:center">Nº</span>
  <span>Verificação</span>
  <span>Referência NR</span>
  <span style="text-align:center">Resp.</span>
</div>
${checklistItems.map(([item, nr], i) => {
  const resp = checklist[i] ?? "NA";
  return `<div class="cl-row">
    <span class="cl-num">${i+1}</span>
    <span>${esc(item)}</span>
    <span class="cl-nr">${esc(nr)}</span>
    <span style="text-align:center"><span class="check-badge check-${resp}">${resp}</span></span>
  </div>`;
}).join("")}

<!-- ═══════════════════════ 4. LIBERAÇÃO ═══════════════════════ -->
<div class="sec-title">4. LIBERAÇÃO PARA EXECUÇÃO <span class="sec-title-nr">NR-35, item 35.5.3</span></div>
<div class="grid3">
  <div class="field"><span class="fl">Responsável da Área</span><span class="fv">${esc(pt.responsavelAreaNome || "—")}</span></div>
  <div class="field"><span class="fl">Responsável pela Liberação</span><span class="fv">${esc(pt.responsavelLiberacaoNome || "—")}</span></div>
  <div class="field"><span class="fl">Responsável pela Execução</span><span class="fv">${esc(pt.executanteNome || "—")}</span></div>
</div>

<!-- ═══════════════════════ 5. ENVOLVIDOS E ASSINATURAS ═══════════════════════ -->
<div class="sec-title">5. ENVOLVIDOS E ASSINATURAS <span class="sec-title-nr">NR-35, item 35.5 / 35.3.1</span></div>
<div class="sig-grid">
${envolvidos.map((env: any, i: number) => {
  const pos = i + 1;
  const ass = assMap.get(pos);
  const terceiro = env.ehTerceiro ? `<div style="font-size:6pt;background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 4px;margin-top:2px;display:inline-block">Terceiro</div>` : "";
  return `<div class="sig-box">
    ${ass?.assinaturaImg
      ? `<img src="${escAttr(ass.assinaturaImg)}" alt="Assinatura" />`
      : `<div class="sig-img-empty">Aguardando assinatura</div>`}
    <div class="sig-name">${esc(env.nome || `Envolvido ${pos}`)}</div>
    <div class="sig-label">${esc(env.funcao || "")}</div>
    ${terceiro}
    ${ass?.assinadoEm ? `<div class="sig-date">${new Date(ass.assinadoEm).toLocaleString("pt-BR")}</div>` : ""}
  </div>`;
}).join("") || `<div style="color:#94a3b8;font-size:9pt;grid-column:span 3;text-align:center;padding:12px">Nenhum envolvido cadastrado</div>`}
</div>

${pt.conclusaoData ? `
<!-- ═══════════════════════ 6. CONCLUSÃO ═══════════════════════ -->
<div class="sec-title">6. CONCLUSÃO / ENCERRAMENTO <span class="sec-title-nr">NR-35, item 35.5.4</span></div>
<div class="grid4">
  <div class="field" style="grid-column:span 2"><span class="fl">Solicitante do Encerramento</span><span class="fv">${esc(pt.conclusaoSolicitanteNome || "—")}</span></div>
  <div class="field"><span class="fl">Data</span><span class="fv">${esc(pt.conclusaoData)}</span></div>
  <div class="field"><span class="fl">Período</span><span class="fv">${esc(pt.conclusaoHoraInicio || "—")} — ${esc(pt.conclusaoHoraFim || "—")}</span></div>
</div>` : ""}

<!-- ═══════════════════════ RODAPÉ ═══════════════════════ -->
<div style="margin-top:10px;padding-top:5px;border-top:1.5px solid #1e3a5f;display:flex;justify-content:space-between;align-items:center;font-size:6.5pt;color:#94a3b8">
  <span>FC Engenharia — Sistema ERP</span>
  <span style="font-weight:700;color:#1e3a5f">PT Nº ${esc(pt.numero)} &nbsp;|&nbsp; ${esc(obraNome || "Sem obra vinculada")}</span>
  <span>Gerado em ${new Date().toLocaleString("pt-BR")}</span>
</div>
</body>
</html>`;
      return { html };
    }),

  // ── Enviar para assinatura FCSign (liberação formal) ──────────────────────
  enviarFCSign: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(),
      signers: z.array(z.object({
        role: z.enum(["empregado","empregador","contratado","contratante","testemunha_1","testemunha_2"]),
        nome: z.string().min(1),
        cpf:  z.string().optional().nullable(),
        email: z.string().optional().nullable(),
      })).min(1).max(6),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [pt] = await db.select().from(ptPermissoes)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt))).limit(1);
      if (!pt) throw new TRPCError({ code: "NOT_FOUND" });
      if (pt.fcSignSessionId) throw new TRPCError({ code: "CONFLICT", message: "Esta PT já possui sessão FCSign associada." });

      // Gera HTML do documento
      const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const docHtml = `<h2>Permissão de Trabalho — ${esc(pt.numero)}</h2>
<p><strong>Data:</strong> ${esc(pt.dataEmissao)} | <strong>Início:</strong> ${esc(pt.horaInicio)} | <strong>Término:</strong> ${esc(pt.horaTermino)}</p>
<p><strong>Supervisor:</strong> ${esc(pt.supervisorNome)}</p>
<p><strong>Descrição:</strong> ${esc(pt.descricaoTrabalho)}</p>
<p><strong>Empresa Executante:</strong> ${esc(pt.empresaExecutanteNome)}</p>
${input.signers.map(s => `<!--FCSIGN:SIG:${s.role}-->`).join("\n")}`;

      const hash = sha256(docHtml);
      const [session] = await db.insert(signatureSessions as any).values({
        companyId: input.companyId,
        employeeId: pt.employeeId,
        tipo: "pt_liberacao",
        documentTitle: `Permissão de Trabalho — ${pt.numero}`,
        documentHtml: docHtml,
        documentHash: hash,
        status: "em_andamento",
        createdByUserId: ctx.user.id,
        createdByName: ctx.user.name ?? "Sistema",
        observacoes: `pt:${input.id}`,
      } as any).returning();

      // Insere signatários
      await db.insert(signatureSigners as any).values(
        input.signers.map((s, i) => ({
          sessionId: session.id,
          companyId: input.companyId,
          role:      s.role,
          nome:      s.nome,
          cpf:       s.cpf ?? null,
          email:     s.email ?? null,
          token:     genToken(),
          ordem:     i + 1,
          status:    "pendente",
        } as any))
      );

      // Associa sessionId à PT
      await db.update(ptPermissoes).set({ fcSignSessionId: session.id, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId)));

      return { sessionId: session.id };
    }),
});
