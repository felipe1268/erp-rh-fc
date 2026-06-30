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
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertCompany(ctx, input.companyId);
      const db = (await getDb())!;
      const [pt] = await db.select().from(ptPermissoes)
        .where(and(eq(ptPermissoes.id, input.id), eq(ptPermissoes.companyId, input.companyId), isNull(ptPermissoes.deletedAt))).limit(1);
      if (!pt) throw new TRPCError({ code: "NOT_FOUND" });

      let obraNome = "";
      if (pt.obraId) {
        const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, pt.obraId)).limit(1);
        obraNome = ob?.nome ?? "";
      }
      let solicitanteNome = "";
      if (pt.employeeId) {
        const [emp] = await db.select({ nomeCompleto: employees.nomeCompleto }).from(employees).where(eq(employees.id, pt.employeeId)).limit(1);
        solicitanteNome = emp?.nomeCompleto ?? "";
      }
      const assinaturas = await db.select().from(ptAssinaturas)
        .where(and(eq(ptAssinaturas.ptId, input.id), eq(ptAssinaturas.companyId, input.companyId)))
        .orderBy(ptAssinaturas.posicao);

      const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      let checklist: any[] = [];
      try { checklist = JSON.parse(pt.checklistJson ?? "[]"); } catch {}
      let envolvidos: any[] = [];
      try { envolvidos = JSON.parse(pt.envolvidosJson ?? "[]"); } catch {}
      let tipos: any[] = [];
      try { tipos = JSON.parse(pt.tiposTrabalhoJson ?? "[]"); } catch {}

      const checklistItems = [
        "Todas as pessoas envolvidas possuem treinamento de trabalho em altura?",
        "Todas as pessoas possuem ASO atualizado?",
        "As condições climáticas são propícias para o trabalho em altura?",
        "Foi determinado um supervisor para execução do serviço?",
        "Todos os recursos necessários foram previstos e estão disponíveis?",
        "Foi estabelecida a equipe de atendimento/resgate de emergência?",
        "Foi estabelecido um plano de comunicação entre os envolvidos?",
        "Os pontos de fixação dos sistemas de proteção foram aprovados?",
        "Foi elaborado plano de trabalho para prevenção de queda de materiais?",
        "A proximidade com pontos de energia foi avaliada e os riscos controlados?",
        "O serviço de Contratada — a PT foi devidamente preenchida?",
        "Todos os EPIs foram inspecionados?",
        "Todo local do serviço está isolado e sinalizado?",
        "Existe procedimento específico escrito, testado e aprovado?",
        "As pessoas envolvidas estão usando todos os EPIs necessários?",
      ];

      const assMap = new Map(assinaturas.map(a => [a.posicao, a]));

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Permissão de Trabalho — ${esc(pt.numero)}</title>
<style>
  @page { margin: 15mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; margin: 0; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4px; color: #065f46; }
  h2 { font-size: 10pt; background: #065f46; color: white; padding: 4px 8px; margin: 8px 0 4px; }
  h3 { font-size: 9pt; background: #d1fae5; color: #065f46; padding: 3px 6px; margin: 6px 0 3px; border-left: 3px solid #10b981; }
  .header { text-align: center; border: 2px solid #065f46; padding: 8px; margin-bottom: 8px; border-radius: 4px; }
  .subtitle { font-size: 8pt; color: #64748b; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 4px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; }
  .field { border: 1px solid #cbd5e1; padding: 3px 6px; border-radius: 3px; }
  .field-label { font-size: 7pt; color: #64748b; display: block; }
  .field-value { font-size: 9pt; font-weight: bold; }
  .checklist-row { display: flex; gap: 6px; align-items: center; padding: 2px 4px; font-size: 8.5pt; border-bottom: 1px solid #f1f5f9; }
  .check-badge { width: 22px; text-align: center; font-weight: bold; font-size: 8pt; padding: 1px; border-radius: 3px; flex-shrink: 0; }
  .check-S { background: #d1fae5; color: #065f46; }
  .check-N { background: #fee2e2; color: #991b1b; }
  .check-NA { background: #f1f5f9; color: #64748b; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 4px; }
  .sig-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; text-align: center; min-height: 70px; }
  .sig-box img { max-width: 100%; max-height: 50px; object-fit: contain; }
  .sig-name { font-size: 8pt; font-weight: bold; margin-top: 2px; }
  .sig-label { font-size: 7pt; color: #64748b; }
  .status-chip { display: inline-block; font-size: 8pt; font-weight: bold; padding: 2px 8px; border-radius: 12px; background: #d1fae5; color: #065f46; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>PERMISSÃO DE TRABALHO EM ALTURA — NR-35</h1>
  <div class="subtitle">FC Engenharia &nbsp;|&nbsp; ${esc(pt.numero)} &nbsp;|&nbsp; <span class="status-chip">${esc(pt.status.toUpperCase().replace("_"," "))}</span></div>
</div>

<h2>1. SOLICITAÇÃO</h2>
<div class="grid3">
  <div class="field"><span class="field-label">Número PT</span><span class="field-value">${esc(pt.numero)}</span></div>
  <div class="field"><span class="field-label">Data de Emissão</span><span class="field-value">${esc(pt.dataEmissao)}</span></div>
  <div class="field"><span class="field-label">Tipo de Mão de Obra</span><span class="field-value">${esc(pt.maoDeObra)}</span></div>
</div>
<div class="grid3">
  <div class="field"><span class="field-label">Hora Início</span><span class="field-value">${esc(pt.horaInicio)}</span></div>
  <div class="field"><span class="field-label">Hora Término</span><span class="field-value">${esc(pt.horaTermino)}</span></div>
  <div class="field"><span class="field-label">Obra</span><span class="field-value">${esc(obraNome)}</span></div>
</div>
<div class="grid2">
  <div class="field"><span class="field-label">Solicitante</span><span class="field-value">${esc(solicitanteNome)}</span></div>
  <div class="field"><span class="field-label">Supervisor</span><span class="field-value">${esc(pt.supervisorNome)}</span></div>
</div>
<div class="field"><span class="field-label">Tipos de Trabalho</span><span class="field-value">${tipos.join(", ") || "—"}</span></div>

<h2>2. DESCRIÇÃO DO TRABALHO</h2>
<div class="field" style="min-height:40px"><span class="field-label">Descrição</span><span class="field-value">${esc(pt.descricaoTrabalho)}</span></div>
<div class="grid2" style="margin-top:4px">
  <div class="field"><span class="field-label">Empresa Executante (CNPJ)</span><span class="field-value">${esc(pt.empresaExecutanteCnpj)}</span></div>
  <div class="field"><span class="field-label">Empresa Executante (Nome)</span><span class="field-value">${esc(pt.empresaExecutanteNome)}</span></div>
</div>

<h2>3. CHECKLIST NR-35</h2>
${checklistItems.map((item, i) => {
  const resp = checklist[i] ?? "NA";
  return `<div class="checklist-row"><span class="check-badge check-${resp}">${resp}</span><span>${i+1}. ${esc(item)}</span></div>`;
}).join("")}

<h2>4. LIBERAÇÃO</h2>
<div class="grid3">
  <div class="field"><span class="field-label">Responsável da Área</span><span class="field-value">${esc(pt.responsavelAreaNome)}</span></div>
  <div class="field"><span class="field-label">Responsável pela Liberação</span><span class="field-value">${esc(pt.responsavelLiberacaoNome)}</span></div>
  <div class="field"><span class="field-label">Responsável pela Execução</span><span class="field-value">${esc(pt.executanteNome)}</span></div>
</div>

<h2>5. ENVOLVIDOS E ASSINATURAS</h2>
<div class="sig-grid">
${envolvidos.map((env: any, i: number) => {
  const pos = i + 1;
  const ass = assMap.get(pos);
  return `<div class="sig-box">
    ${ass?.assinaturaImg ? `<img src="${ass.assinaturaImg}" alt="Assinatura" />` : `<div style="height:50px;background:#f8fafc;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:8pt">Sem assinatura</div>`}
    <div class="sig-name">${esc(env.nome || `Envolvido ${pos}`)}</div>
    <div class="sig-label">${esc(env.funcao || "")}</div>
    ${ass?.assinadoEm ? `<div style="font-size:6.5pt;color:#64748b">${new Date(ass.assinadoEm).toLocaleString("pt-BR")}</div>` : ""}
  </div>`;
}).join("") || '<div style="color:#94a3b8;font-size:9pt;grid-column:span 3;text-align:center">Nenhum envolvido cadastrado</div>'}
</div>

${pt.conclusaoData ? `
<h2>6. CONCLUSÃO</h2>
<div class="grid3">
  <div class="field"><span class="field-label">Solicitante</span><span class="field-value">${esc(pt.conclusaoSolicitanteNome)}</span></div>
  <div class="field"><span class="field-label">Data</span><span class="field-value">${esc(pt.conclusaoData)}</span></div>
  <div class="field"><span class="field-label">Período</span><span class="field-value">${esc(pt.conclusaoHoraInicio)} — ${esc(pt.conclusaoHoraFim)}</span></div>
</div>` : ""}

<div style="margin-top:12px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:7pt;color:#94a3b8;text-align:center">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} &nbsp;|&nbsp; FC Engenharia &nbsp;|&nbsp; PT ${esc(pt.numero)} &nbsp;|&nbsp; Sistema ERP
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
