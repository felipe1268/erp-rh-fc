import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  sstIntegracaoConfig, sstIntegracaoModulos, sstIntegracaoPerguntas,
  sstIntegracaoAlternativas, sstIntegracaoRegistros, sstIntegracaoRespostas,
  sstIntegracaoSessoes, employees, warnings, funcionariosTerceiros, obras,
} from "../../drizzle/schema";
import { eq, and, sql, desc, asc, isNull, inArray, lte, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

function assertCompanyAccess(ctx: any, companyId: number) {
  const ids = ctx.user?.companyIds ?? [];
  if (!ids.includes(companyId) && ctx.user?.role !== "admin_master")
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa" });
}

function gerarToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Rev. 2047 — Perguntas-padrão "10 Regras de Ouro" da FC ENGENHARIA
// REESCRITAS pra serem FIÉIS ao vídeo "INTEGRAÇÃO FC ENGENHARIA" (cultura
// corporativa + conduta), substituindo as NRs genéricas da Rev. 2046.
// Linguagem simples (público alvo: servente/ajudante, baixa escolaridade).
// Cobre: pontualidade, ausência, celular, uniforme, materiais, insubordinação,
// assédio sexual/moral, intolerância, agressão, álcool/drogas, furto, EPI.
const PERGUNTAS_REGRAS_OURO: { texto: string; alternativas: { texto: string; correta: boolean }[] }[] = [
  {
    texto: "Cheguei atrasado no trabalho. O que pode acontecer?",
    alternativas: [
      { texto: "Nada, atraso é normal", correta: false },
      { texto: "Posso receber advertência e até perder o pagamento do dia", correta: true },
      { texto: "Só perco o café da manhã", correta: false },
    ],
  },
  {
    texto: "Não vou poder ir trabalhar amanhã. O que devo fazer?",
    alternativas: [
      { texto: "Faltar e não avisar ninguém", correta: false },
      { texto: "Avisar meu gestor o quanto antes e levar atestado se for médico", correta: true },
      { texto: "Mandar recado por outro colega no dia seguinte", correta: false },
    ],
  },
  {
    texto: "Posso usar meu celular pessoal durante o horário de trabalho?",
    alternativas: [
      { texto: "Sim, o tempo todo", correta: false },
      { texto: "Só com autorização prévia do gestor; uso indevido pode gerar advertência, suspensão ou demissão", correta: true },
      { texto: "Sim, desde que ninguém me veja", correta: false },
    ],
  },
  {
    texto: "Posso usar o uniforme da FC fora do horário de trabalho (na rua, em festa, no bar)?",
    alternativas: [
      { texto: "Sim, é meu uniforme, faço o que quiser", correta: false },
      { texto: "Não. O uso do uniforme fora do trabalho é proibido e pode gerar advertência", correta: true },
      { texto: "Sim, se for fim de semana", correta: false },
    ],
  },
  {
    texto: "Posso levar ferramenta, material ou equipamento da obra pra usar em casa ou pra vender?",
    alternativas: [
      { texto: "Sim, se for material que estava sobrando", correta: false },
      { texto: "Não. É proibido — caracteriza furto e leva à demissão imediata", correta: true },
      { texto: "Sim, se eu devolver depois", correta: false },
    ],
  },
  {
    texto: "Meu encarregado ou mestre de obras me deu uma ordem direta. O que faço?",
    alternativas: [
      { texto: "Discuto na frente da equipe e me recuso a obedecer", correta: false },
      { texto: "Cumpro a ordem. Insubordinação é causa de desligamento imediato", correta: true },
      { texto: "Faço só se eu concordar com a ordem", correta: false },
    ],
  },
  {
    texto: "Um colega faz comentários ou toques de cunho sexual que me incomodam. Isso é:",
    alternativas: [
      { texto: "Brincadeira normal entre adultos", correta: false },
      { texto: "Assédio sexual — é proibido e leva à demissão imediata; devo procurar o gestor ou o RH", correta: true },
      { texto: "Coisa que devo deixar passar pra evitar confusão", correta: false },
    ],
  },
  {
    texto: "Um colega humilha, grita ou expõe outro repetidamente. Isso é:",
    alternativas: [
      { texto: "Forma normal de cobrar resultado", correta: false },
      { texto: "Assédio moral / bullying — é proibido e pode gerar advertência, suspensão ou demissão", correta: true },
      { texto: "Problema só de quem está sofrendo", correta: false },
    ],
  },
  {
    texto: "Piadas ou ofensas sobre cor da pele, religião ou orientação sexual de um colega são:",
    alternativas: [
      { texto: "Permitidas se for entre amigos", correta: false },
      { texto: "Atos de intolerância — NÃO TOLERAMOS na FC e levam à demissão imediata", correta: true },
      { texto: "Liberadas fora do horário do almoço", correta: false },
    ],
  },
  {
    texto: "Posso beber cerveja no almoço ou usar drogas durante o horário de trabalho?",
    alternativas: [
      { texto: "Sim, se for só uma latinha", correta: false },
      { texto: "Não. Álcool e drogas no horário de trabalho são proibidos e levam à demissão", correta: true },
      { texto: "Sim, se ninguém perceber", correta: false },
    ],
  },
  {
    texto: "Posso brigar (empurrão, soco, xingamento) com colega ou superior dentro da obra?",
    alternativas: [
      { texto: "Sim, se o outro começou", correta: false },
      { texto: "Não. Agressão física ou verbal leva à demissão imediata", correta: true },
      { texto: "Sim, se for fora do horário oficial", correta: false },
    ],
  },
  {
    texto: "Vou trabalhar em altura ou em área de risco. Posso ir sem capacete, cinto ou outro EPI?",
    alternativas: [
      { texto: "Sim, se for serviço rápido", correta: false },
      { texto: "Não. Não usar EPI é uma das Regras de Ouro — leva à demissão imediata", correta: true },
      { texto: "Sim, se ninguém da segurança estiver olhando", correta: false },
    ],
  },
];

export const integracaoSSTRouter = router({

  listarConfigs: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      return db.select().from(sstIntegracaoConfig)
        .where(and(eq(sstIntegracaoConfig.companyId, input.companyId), isNull(sstIntegracaoConfig.deletedAt)))
        .orderBy(desc(sstIntegracaoConfig.createdAt));
    }),

  criarConfig: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().max(255).optional(),
      titulo: z.string().min(1).max(255),
      descricao: z.string().optional(),
      notaMinima: z.number().int().min(1).max(100).default(70),
      validadeMeses: z.number().int().min(1).max(60).default(12),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(sstIntegracaoConfig).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        notaMinima: input.notaMinima,
        validadeMeses: input.validadeMeses,
        criadoPor: ctx.user.name ?? "Sistema",
        criadoPorUserId: ctx.user.id,
      }).returning();
      return row;
    }),

  atualizarConfig: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      descricao: z.string().optional(),
      notaMinima: z.number().int().min(1).max(100).optional(),
      validadeMeses: z.number().int().min(1).max(60).optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const updates: any = { updatedAt: sql`NOW()` };
      if (input.titulo !== undefined) updates.titulo = input.titulo.trim();
      if (input.descricao !== undefined) updates.descricao = input.descricao.trim() || null;
      if (input.notaMinima !== undefined) updates.notaMinima = input.notaMinima;
      if (input.validadeMeses !== undefined) updates.validadeMeses = input.validadeMeses;
      if (input.ativo !== undefined) updates.ativo = input.ativo;
      await db.update(sstIntegracaoConfig).set(updates)
        .where(and(eq(sstIntegracaoConfig.id, input.id), eq(sstIntegracaoConfig.companyId, input.companyId)));
      return { success: true };
    }),

  excluirConfig: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(sstIntegracaoConfig).set({ deletedAt: sql`NOW()` })
        .where(and(eq(sstIntegracaoConfig.id, input.id), eq(sstIntegracaoConfig.companyId, input.companyId)));
      return { success: true };
    }),

  listarTodosModulos: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const modulos = await db.select({
        id: sstIntegracaoModulos.id,
        configId: sstIntegracaoModulos.configId,
        companyId: sstIntegracaoModulos.companyId,
        titulo: sstIntegracaoModulos.titulo,
        descricao: sstIntegracaoModulos.descricao,
        videoUrl: sstIntegracaoModulos.videoUrl,
        videoTipo: sstIntegracaoModulos.videoTipo,
        ordem: sstIntegracaoModulos.ordem,
        obrigatorio: sstIntegracaoModulos.obrigatorio,
        duracaoMinutos: sstIntegracaoModulos.duracaoMinutos,
        funcoesJson: sstIntegracaoModulos.funcoesJson,
        createdAt: sstIntegracaoModulos.createdAt,
        configTitulo: sstIntegracaoConfig.titulo,
      }).from(sstIntegracaoModulos)
        .leftJoin(sstIntegracaoConfig, eq(sstIntegracaoModulos.configId, sstIntegracaoConfig.id))
        .where(and(eq(sstIntegracaoModulos.companyId, input.companyId), isNull(sstIntegracaoModulos.deletedAt)))
        .orderBy(asc(sstIntegracaoModulos.configId), asc(sstIntegracaoModulos.ordem));

      const moduloIds = modulos.map(m => m.id);
      let perguntaCounts: { moduloId: number; count: number }[] = [];
      if (moduloIds.length > 0) {
        perguntaCounts = await db.select({
          moduloId: sstIntegracaoPerguntas.moduloId,
          count: sql<number>`count(*)::int`,
        }).from(sstIntegracaoPerguntas)
          .where(inArray(sstIntegracaoPerguntas.moduloId, moduloIds))
          .groupBy(sstIntegracaoPerguntas.moduloId);
      }
      const countMap = new Map(perguntaCounts.map(c => [c.moduloId, c.count]));
      return modulos.map(m => ({ ...m, totalPerguntas: countMap.get(m.id) || 0 }));
    }),

  listarModulos: protectedProcedure
    .input(z.object({ configId: z.number().int().positive(), companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const modulos = await db.select().from(sstIntegracaoModulos)
        .where(and(eq(sstIntegracaoModulos.configId, input.configId), eq(sstIntegracaoModulos.companyId, input.companyId), isNull(sstIntegracaoModulos.deletedAt)))
        .orderBy(asc(sstIntegracaoModulos.ordem));

      const moduloIds = modulos.map(m => m.id);
      if (moduloIds.length === 0) return modulos.map(m => ({ ...m, perguntas: [] }));

      const perguntas = await db.select().from(sstIntegracaoPerguntas)
        .where(and(inArray(sstIntegracaoPerguntas.moduloId, moduloIds), eq(sstIntegracaoPerguntas.companyId, input.companyId)))
        .orderBy(asc(sstIntegracaoPerguntas.ordem));

      const perguntaIds = perguntas.map(p => p.id);
      let alternativas: any[] = [];
      if (perguntaIds.length > 0) {
        alternativas = await db.select().from(sstIntegracaoAlternativas)
          .where(inArray(sstIntegracaoAlternativas.perguntaId, perguntaIds))
          .orderBy(asc(sstIntegracaoAlternativas.ordem));
      }

      const altMap = new Map<number, any[]>();
      for (const a of alternativas) {
        if (!altMap.has(a.perguntaId)) altMap.set(a.perguntaId, []);
        altMap.get(a.perguntaId)!.push(a);
      }

      const pergMap = new Map<number, any[]>();
      for (const p of perguntas) {
        if (!pergMap.has(p.moduloId)) pergMap.set(p.moduloId, []);
        pergMap.get(p.moduloId)!.push({ ...p, alternativas: altMap.get(p.id) || [] });
      }

      return modulos.map(m => ({ ...m, perguntas: pergMap.get(m.id) || [] }));
    }),

  criarModulo: protectedProcedure
    .input(z.object({
      configId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255),
      descricao: z.string().optional(),
      videoUrl: z.string().optional(),
      videoTipo: z.enum(["youtube", "upload", "vimeo", "url"]).default("youtube"),
      ordem: z.number().int().min(1).default(1),
      obrigatorio: z.boolean().default(true),
      funcoesJson: z.string().optional(),
      duracaoMinutos: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(sstIntegracaoModulos).values({
        configId: input.configId,
        companyId: input.companyId,
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        videoUrl: input.videoUrl?.trim() || null,
        videoTipo: input.videoTipo,
        ordem: input.ordem,
        obrigatorio: input.obrigatorio,
        funcoesJson: input.funcoesJson || null,
        duracaoMinutos: input.duracaoMinutos ?? null,
      }).returning();
      return row;
    }),

  atualizarModulo: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      descricao: z.string().optional(),
      videoUrl: z.string().optional(),
      videoTipo: z.enum(["youtube", "upload", "vimeo", "url"]).optional(),
      ordem: z.number().int().min(1).optional(),
      obrigatorio: z.boolean().optional(),
      funcoesJson: z.string().optional(),
      duracaoMinutos: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const updates: any = { updatedAt: sql`NOW()` };
      if (input.titulo !== undefined) updates.titulo = input.titulo.trim();
      if (input.descricao !== undefined) updates.descricao = input.descricao?.trim() || null;
      if (input.videoUrl !== undefined) updates.videoUrl = input.videoUrl?.trim() || null;
      if (input.videoTipo !== undefined) updates.videoTipo = input.videoTipo;
      if (input.ordem !== undefined) updates.ordem = input.ordem;
      if (input.obrigatorio !== undefined) updates.obrigatorio = input.obrigatorio;
      if (input.funcoesJson !== undefined) updates.funcoesJson = input.funcoesJson || null;
      if (input.duracaoMinutos !== undefined) updates.duracaoMinutos = input.duracaoMinutos;
      await db.update(sstIntegracaoModulos).set(updates)
        .where(and(eq(sstIntegracaoModulos.id, input.id), eq(sstIntegracaoModulos.companyId, input.companyId)));
      return { success: true };
    }),

  excluirModulo: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(sstIntegracaoModulos).set({ deletedAt: sql`NOW()` })
        .where(and(eq(sstIntegracaoModulos.id, input.id), eq(sstIntegracaoModulos.companyId, input.companyId)));
      return { success: true };
    }),

  salvarPerguntas: protectedProcedure
    .input(z.object({
      moduloId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      perguntas: z.array(z.object({
        id: z.number().int().optional(),
        texto: z.string().min(1),
        ordem: z.number().int().min(1),
        alternativas: z.array(z.object({
          id: z.number().int().optional(),
          texto: z.string().min(1),
          correta: z.boolean(),
          ordem: z.number().int().min(1),
        })),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const existingPerguntas = await db.select({ id: sstIntegracaoPerguntas.id })
        .from(sstIntegracaoPerguntas)
        .where(and(eq(sstIntegracaoPerguntas.moduloId, input.moduloId), eq(sstIntegracaoPerguntas.companyId, input.companyId)));
      const existingIds = new Set(existingPerguntas.map(p => p.id));
      const inputIds = new Set(input.perguntas.filter(p => p.id).map(p => p.id!));

      const toDelete = [...existingIds].filter(id => !inputIds.has(id));
      if (toDelete.length > 0) {
        const altToDelete = await db.select({ id: sstIntegracaoAlternativas.id })
          .from(sstIntegracaoAlternativas)
          .where(inArray(sstIntegracaoAlternativas.perguntaId, toDelete));
        if (altToDelete.length > 0) {
          await db.delete(sstIntegracaoAlternativas).where(inArray(sstIntegracaoAlternativas.id, altToDelete.map(a => a.id)));
        }
        await db.delete(sstIntegracaoPerguntas).where(inArray(sstIntegracaoPerguntas.id, toDelete));
      }

      for (const p of input.perguntas) {
        let perguntaId: number;
        if (p.id && existingIds.has(p.id)) {
          await db.update(sstIntegracaoPerguntas).set({ texto: p.texto, ordem: p.ordem })
            .where(eq(sstIntegracaoPerguntas.id, p.id));
          perguntaId = p.id;
        } else {
          const [row] = await db.insert(sstIntegracaoPerguntas).values({
            moduloId: input.moduloId, companyId: input.companyId,
            texto: p.texto, ordem: p.ordem,
          }).returning();
          perguntaId = row.id;
        }

        await db.delete(sstIntegracaoAlternativas).where(eq(sstIntegracaoAlternativas.perguntaId, perguntaId));
        if (p.alternativas.length > 0) {
          await db.insert(sstIntegracaoAlternativas).values(
            p.alternativas.map(a => ({ perguntaId, texto: a.texto, correta: a.correta, ordem: a.ordem }))
          );
        }
      }

      return { success: true };
    }),

  // Rev. 2047 — Perguntas-padrão "10 Regras de Ouro" da FC (cultura/conduta).
  // Aceita `substituir`: quando true, apaga TODAS as perguntas/alternativas
  // existentes do módulo antes de semear o padrão (operação destrutiva
  // só sobre dados de seed deste módulo — exige confirmação na UI).
  semearPerguntasPadrao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      moduloId: z.number().int().positive(),
      substituir: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        // Confirma que o módulo pertence à company (defesa cross-tenant)
        const [mod] = await db.select({ id: sstIntegracaoModulos.id })
          .from(sstIntegracaoModulos)
          .where(and(
            eq(sstIntegracaoModulos.id, input.moduloId),
            eq(sstIntegracaoModulos.companyId, input.companyId),
          )).limit(1);
        if (!mod) throw new TRPCError({ code: "NOT_FOUND", message: "Módulo não encontrado nesta empresa." });

        const existentes = await db.select({ id: sstIntegracaoPerguntas.id })
          .from(sstIntegracaoPerguntas)
          .where(and(
            eq(sstIntegracaoPerguntas.moduloId, input.moduloId),
            eq(sstIntegracaoPerguntas.companyId, input.companyId),
          ));

        if (existentes.length > 0 && !input.substituir) {
          throw new TRPCError({ code: "CONFLICT", message: `Este módulo já tem ${existentes.length} pergunta(s). Use "Substituir" para sobrescrever.` });
        }

        // Rev. 2047 follow-up architect: delete + insert em transação atômica
        // pra nunca deixar o módulo vazio se um INSERT falhar depois do DELETE.
        const PADRAO = PERGUNTAS_REGRAS_OURO;
        await db.transaction(async (tx: any) => {
          if (existentes.length > 0) {
            // Apaga perguntas e alternativas atuais (seed-only — não afeta
            // respostas dos colaboradores, que ficam em sst_integracao_respostas
            // sem FK rígida)
            const ids = existentes.map(e => e.id);
            await tx.delete(sstIntegracaoAlternativas).where(inArray(sstIntegracaoAlternativas.perguntaId, ids));
            await tx.delete(sstIntegracaoPerguntas).where(inArray(sstIntegracaoPerguntas.id, ids));
          }
          for (let i = 0; i < PADRAO.length; i++) {
            const p = PADRAO[i];
            const [row] = await tx.insert(sstIntegracaoPerguntas).values({
              moduloId: input.moduloId,
              companyId: input.companyId,
              texto: p.texto,
              ordem: i + 1,
            }).returning();
            await tx.insert(sstIntegracaoAlternativas).values(
              p.alternativas.map((a, j) => ({
                perguntaId: row.id,
                texto: a.texto,
                correta: a.correta,
                ordem: j + 1,
              }))
            );
          }
        });
        return { success: true, total: PADRAO.length, substituido: existentes.length };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[semearPerguntasPadrao] FAIL", { input, err, stack: err?.stack });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao carregar perguntas-padrão." });
      }
    }),

  listarRegistros: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      status: z.enum(["pendente", "em_andamento", "aprovado", "reprovado", "vencido", "todos"]).optional(),
      obraId: z.number().int().positive().optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(sstIntegracaoRegistros.companyId, input.companyId), isNull(sstIntegracaoRegistros.deletedAt)];
      if (input.status && input.status !== "todos") {
        conds.push(eq(sstIntegracaoRegistros.status, input.status));
      }
      if (input.obraId) conds.push(eq(sstIntegracaoRegistros.obraId, input.obraId));
      // Rev. 2049 — leftJoin com config pra trazer `notaMinima` real
      // (usado pelo certificado em AprovadosTab; antes era hardcoded 70).
      const rows = await db
        .select({
          r: sstIntegracaoRegistros,
          configNotaMinima: sstIntegracaoConfig.notaMinima,
          configTitulo: sstIntegracaoConfig.titulo,
        })
        .from(sstIntegracaoRegistros)
        .leftJoin(sstIntegracaoConfig, and(
          eq(sstIntegracaoConfig.id, sstIntegracaoRegistros.configId),
          // Rev. 2049 hardening: amarra o join por companyId pra evitar
          // qualquer acoplamento cruzado entre tenants em caso de dados
          // inconsistentes (defesa em profundidade — `assertCompanyAccess`
          // acima já valida acesso à empresa do registro).
          eq(sstIntegracaoConfig.companyId, sstIntegracaoRegistros.companyId),
        ))
        .where(and(...conds))
        .orderBy(desc(sstIntegracaoRegistros.createdAt));
      // Achata pra manter compatibilidade com chamadores existentes
      // (HistoricoTab/AprovadosTab acessam r.id, r.employeeNome, etc.).
      return rows.map((row) => ({
        ...row.r,
        configNotaMinima: row.configNotaMinima ?? null,
        configTitulo: row.configTitulo ?? null,
      }));
    }),

  // Rev. 2044 — Excluir registros do Histórico (soft-delete via deletedAt).
  // Como `listarPendentesAuto` filtra colaboradores SEM registro válido,
  // após o soft-delete o colaborador volta a aparecer em "Pendentes" pra
  // refazer a integração — exatamente o pedido do usuário (IMG_0891).
  excluirRegistros: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      ids: z.array(z.number().int().positive()).min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        const result = await db.update(sstIntegracaoRegistros)
          .set({ deletedAt: sql`NOW()`, updatedAt: sql`NOW()` })
          .where(and(
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            inArray(sstIntegracaoRegistros.id, input.ids),
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .returning({ id: sstIntegracaoRegistros.id });
        return { count: result.length };
      } catch (err: any) {
        console.error("[excluirRegistros] FAIL", { input, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao excluir registros" });
      }
    }),

  // Rev. 2044 — Editar registro (somente metadados que fazem sentido pós-criação:
  // obra associada). Status/nota/respostas seguem imutáveis pelo cliente —
  // pra "refazer" o usuário exclui e o colaborador volta pra pendentes.
  atualizarRegistro: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      id: z.number().int().positive(),
      obraId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        let obraNome: string | null = null;
        if (input.obraId) {
          const [o] = await db.select({ nome: obras.nome })
            .from(obras)
            .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId)));
          if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada nesta empresa" });
          obraNome = o.nome || null;
        }
        const result = await db.update(sstIntegracaoRegistros)
          .set({ obraId: input.obraId, obraNome, updatedAt: sql`NOW()` })
          .where(and(
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            eq(sstIntegracaoRegistros.id, input.id),
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .returning({ id: sstIntegracaoRegistros.id });
        if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
        return { success: true };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[atualizarRegistro] FAIL", { input, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao atualizar registro" });
      }
    }),

  // Rev. 2034 — Lista TODOS os colaboradores ativos (CLT/PJ via `employees`,
  // terceiros via `funcionariosTerceiros`) que precisam de Integração de
  // Segurança: nunca fizeram OU integração vencida OU vence em ≤60 dias.
  // Regra: integração vale 24 meses (registro grava `dataValidade` explícita;
  // fallback +730d sobre `dataRealizacao` se faltar). Excluímos quem já tem
  // registro em andamento (eles aparecem na seção "Em processo" existente).
  listarPendentesAuto: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      // 1) Última integração aprovada por employeeId.
      // Code-review/architect (Rev. 2034): usar DISTINCT ON pra pegar
      // dataValidade + dataRealizacao do MESMO registro (mais recente).
      // O MAX separado misturaria datas de registros diferentes quando
      // o funcionário tem múltiplos aprovados → validade incorreta.
      const lastApprovedRaw = await db.execute<{
        employee_id: number;
        data_validade: string | null;
        data_realizacao: string | null;
      }>(sql`
        SELECT DISTINCT ON (employee_id)
          employee_id, data_validade, data_realizacao
        FROM sst_integracao_registros
        WHERE company_id = ${input.companyId}
          AND status = 'aprovado'
          AND deleted_at IS NULL
        ORDER BY employee_id,
          COALESCE(data_realizacao, created_at) DESC
      `);
      const lastApproved = (lastApprovedRaw as any).rows ?? lastApprovedRaw;
      const lastMap = new Map<number, { dv: string | null; dr: string | null }>();
      for (const r of lastApproved as any[]) {
        lastMap.set(r.employee_id, { dv: r.data_validade, dr: r.data_realizacao });
      }

      // 2) Registros em processo (pendente/em_andamento) — excluir
      const inProgress = await db.select({ employeeId: sstIntegracaoRegistros.employeeId })
        .from(sstIntegracaoRegistros)
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          inArray(sstIntegracaoRegistros.status, ["pendente", "em_andamento"]),
          isNull(sstIntegracaoRegistros.deletedAt),
        ));
      const inProgressSet = new Set(inProgress.map(r => r.employeeId));

      // 3) Employees ativos (CLT/PJ)
      // Rev. 2036: filtro robusto contra "fantasmas" — exclui soft-delete
      // (deletedAt), lista negra e qualquer registro com dataDemissao gravada
      // (mesmo se status ainda estiver "Ativo" por inconsistência).
      const emps = await db.select({
        id: employees.id,
        nome: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        tipoContrato: employees.tipoContrato,
        dataAdmissao: employees.dataAdmissao,
        fotoUrl: employees.fotoUrl,
      })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, "Ativo"),
          sql`${employees.deletedAt} IS NULL`,
          sql`COALESCE(${employees.listaNegra}, 0) = 0`,
          sql`${employees.dataDemissao} IS NULL`,
        ));

      // 4) Terceiros ativos
      const ters = await db.select({
        id: funcionariosTerceiros.id,
        nome: funcionariosTerceiros.nome,
        cpf: funcionariosTerceiros.cpf,
        funcao: funcionariosTerceiros.funcao,
        obraNome: funcionariosTerceiros.obraNome,
        integracaoDocUrl: funcionariosTerceiros.integracaoDocUrl,
        fotoUrl: funcionariosTerceiros.fotoUrl,
      })
        .from(funcionariosTerceiros)
        .where(and(
          eq(funcionariosTerceiros.companyId, input.companyId),
          eq(funcionariosTerceiros.status, "ativo"),
          isNull(funcionariosTerceiros.deletedAt),
        ));

      const now = Date.now();
      const D60 = 60 * 24 * 3600 * 1000;
      const D730 = 730 * 24 * 3600 * 1000; // 24 meses

      type Estado = "nunca_fez" | "vencido" | "vencendo";
      type Item = {
        kind: "employee" | "terceiro";
        id: number;
        nome: string;
        cpf: string | null;
        funcao: string | null;
        tipoContrato: string | null;
        obraNome: string | null;
        fotoUrl: string | null;
        estado: Estado;
        ultimaRealizacao: string | null;
        dataValidade: string | null;
        diasParaVencer: number | null;
        dataAdmissao: string | null;
      };
      const out: Item[] = [];

      for (const e of emps) {
        if (inProgressSet.has(e.id)) continue;
        const last = lastMap.get(e.id);
        let estado: Estado = "nunca_fez";
        let dv: string | null = null;
        let dr: string | null = null;
        let diasParaVencer: number | null = null;
        if (last) {
          dr = last.dr;
          dv = last.dv
            ?? (last.dr ? new Date(new Date(last.dr).getTime() + D730).toISOString() : null);
          if (dv) {
            const t = new Date(dv).getTime();
            diasParaVencer = Math.ceil((t - now) / (24 * 3600 * 1000));
            if (t < now) estado = "vencido";
            else if (t - now <= D60) estado = "vencendo";
            else continue; // válido por > 60d, fora da lista
          }
        }
        out.push({
          kind: "employee",
          id: e.id, nome: e.nome, cpf: e.cpf, funcao: e.funcao,
          tipoContrato: e.tipoContrato, obraNome: null, fotoUrl: e.fotoUrl,
          estado, ultimaRealizacao: dr, dataValidade: dv, diasParaVencer,
          dataAdmissao: e.dataAdmissao,
        });
      }

      // Terceiros: critério simplificado — sem `integracaoDocUrl` = pendente.
      // (Schema não guarda timestamp do upload pra calcular 24m; renovação
      // visual fica no cadastro do terceiro.)
      for (const t of ters) {
        if (t.integracaoDocUrl) continue;
        out.push({
          kind: "terceiro",
          id: t.id, nome: t.nome, cpf: t.cpf, funcao: t.funcao,
          tipoContrato: "terceiro", obraNome: t.obraNome, fotoUrl: t.fotoUrl,
          estado: "nunca_fez", ultimaRealizacao: null, dataValidade: null, diasParaVencer: null,
          dataAdmissao: null,
        });
      }

      // Ordenar: vencido → nunca_fez → vencendo; depois por dias e nome.
      const order: Record<Estado, number> = { vencido: 0, nunca_fez: 1, vencendo: 2 };
      out.sort((a, b) => {
        const d = order[a.estado] - order[b.estado];
        if (d) return d;
        if (a.diasParaVencer !== null && b.diasParaVencer !== null) return a.diasParaVencer - b.diasParaVencer;
        return (a.nome || "").localeCompare(b.nome || "");
      });

      return out;
    }),

  criarRegistro: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      configId: z.number().int().positive().optional(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
      origem: z.enum(["manual", "smo", "reciclagem", "advertencia", "transferencia"]).default("manual"),
      smoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;

        const [emp] = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
        }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado nesta empresa" });

        const token = gerarToken();
        // Rev. 2042 — coerção explícita pra evitar undefined no insert
        // (causa de "Cannot convert undefined or null to object" no driver).
        const values = {
          companyId: Number(input.companyId),
          employeeId: Number(input.employeeId),
          employeeNome: emp.nome ?? null,
          employeeCpf: emp.cpf ?? null,
          employeeFuncao: emp.funcao ?? null,
          configId: input.configId != null ? Number(input.configId) : null,
          obraId: input.obraId != null ? Number(input.obraId) : null,
          obraNome: input.obraNome?.trim() || null,
          origem: input.origem || "manual",
          smoId: input.smoId != null ? Number(input.smoId) : null,
          token,
          responsavel: (ctx.user?.name ? String(ctx.user.name) : "Sistema"),
          responsavelId: ctx.user?.id != null ? Number(ctx.user.id) : null,
        };
        const [row] = await db.insert(sstIntegracaoRegistros).values(values).returning();
        return row;
      } catch (e: any) {
        console.error("[criarRegistro] FAIL", {
          input,
          userId: ctx.user?.id,
          err: e?.message || String(e),
          stack: e?.stack,
        });
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao criar integração: ${e?.message || String(e)}`,
        });
      }
    }),

  criarRegistrosEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      employeeIds: z.array(z.number().int().positive()),
      configId: z.number().int().positive().optional(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
      sessaoId: z.number().int().positive().optional(),
      origem: z.enum(["manual", "smo", "reciclagem", "advertencia", "transferencia"]).default("manual"),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const emps = await db.select({
        id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
      }).from(employees).where(and(inArray(employees.id, input.employeeIds), eq(employees.companyId, input.companyId)));

      const registros = emps.map(emp => ({
        companyId: input.companyId,
        employeeId: emp.id,
        employeeNome: emp.nome,
        employeeCpf: emp.cpf,
        employeeFuncao: emp.funcao,
        configId: input.configId ?? null,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        origem: input.origem,
        sessaoId: input.sessaoId ?? null,
        token: gerarToken(),
        responsavel: ctx.user.name ?? "Sistema",
        responsavelId: ctx.user.id,
      }));

      if (registros.length > 0) {
        await db.insert(sstIntegracaoRegistros).values(registros);
      }
      return { success: true, count: registros.length };
    }),

  criarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
      titulo: z.string().max(255).optional(),
      dataSessao: z.string().optional(),
      tipo: z.enum(["individual", "grupo"]).default("grupo"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(sstIntegracaoSessoes).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        titulo: input.titulo?.trim() || null,
        dataSessao: input.dataSessao || null,
        responsavel: ctx.user.name ?? "Sistema",
        responsavelId: ctx.user.id,
        tipo: input.tipo,
        observacoes: input.observacoes?.trim() || null,
      }).returning();
      return row;
    }),

  listarSessoes: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const sessoes = await db.select().from(sstIntegracaoSessoes)
        .where(eq(sstIntegracaoSessoes.companyId, input.companyId))
        .orderBy(desc(sstIntegracaoSessoes.createdAt));

      const sessaoIds = sessoes.map(s => s.id);
      if (sessaoIds.length === 0) return sessoes.map(s => ({ ...s, participantes: 0, aprovados: 0 }));

      const counts = await db.select({
        sessaoId: sstIntegracaoRegistros.sessaoId,
        total: sql<number>`count(*)::int`,
        aprovados: sql<number>`count(*) filter (where ${sstIntegracaoRegistros.status} = 'aprovado')::int`,
      }).from(sstIntegracaoRegistros)
        .where(and(inArray(sstIntegracaoRegistros.sessaoId, sessaoIds), isNull(sstIntegracaoRegistros.deletedAt)))
        .groupBy(sstIntegracaoRegistros.sessaoId);

      const countMap = new Map(counts.map(c => [c.sessaoId, c]));
      return sessoes.map(s => ({
        ...s,
        participantes: countMap.get(s.id)?.total || 0,
        aprovados: countMap.get(s.id)?.aprovados || 0,
      }));
    }),

  dashboardKpis: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), obraId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(sstIntegracaoRegistros.companyId, input.companyId), isNull(sstIntegracaoRegistros.deletedAt)];
      if (input.obraId) conds.push(eq(sstIntegracaoRegistros.obraId, input.obraId));

      const rows = await db.select({
        status: sstIntegracaoRegistros.status,
        count: sql<number>`count(*)::int`,
      }).from(sstIntegracaoRegistros)
        .where(and(...conds))
        .groupBy(sstIntegracaoRegistros.status);

      const statusMap: Record<string, number> = {};
      let total = 0;
      for (const r of rows) { statusMap[r.status] = r.count; total += r.count; }

      const mediaRows = await db.select({
        media: sql<number>`avg(${sstIntegracaoRegistros.nota}::numeric)`,
      }).from(sstIntegracaoRegistros)
        .where(and(...conds, sql`${sstIntegracaoRegistros.nota} IS NOT NULL`));

      const agora = new Date().toISOString();
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const [vencendo] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(sstIntegracaoRegistros)
        .where(and(
          ...conds,
          eq(sstIntegracaoRegistros.status, "aprovado"),
          lte(sstIntegracaoRegistros.dataValidade, em30dias),
          gte(sstIntegracaoRegistros.dataValidade, agora),
        ));

      return {
        total,
        pendentes: statusMap["pendente"] || 0,
        emAndamento: statusMap["em_andamento"] || 0,
        aprovados: statusMap["aprovado"] || 0,
        reprovados: statusMap["reprovado"] || 0,
        vencidos: statusMap["vencido"] || 0,
        vencendoEm30Dias: vencendo?.count || 0,
        mediaNota: mediaRows[0]?.media ? Number(Number(mediaRows[0].media).toFixed(1)) : null,
        taxaAprovacao: total > 0 ? Math.round(((statusMap["aprovado"] || 0) / total) * 100) : 0,
      };
    }),

  alertas: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const alertas: { tipo: string; mensagem: string; registroId?: number; employeeNome?: string; obraNome?: string; count?: number }[] = [];

      const [pendentes] = await db.select({ count: sql<number>`count(*)::int` })
        .from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.companyId, input.companyId), eq(sstIntegracaoRegistros.status, "pendente"), isNull(sstIntegracaoRegistros.deletedAt)));
      if (pendentes.count > 0) {
        alertas.push({ tipo: "pendente", mensagem: `${pendentes.count} colaborador(es) aguardando integração`, count: pendentes.count });
      }

      const agora = new Date().toISOString();
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const vencendo = await db.select({
        id: sstIntegracaoRegistros.id,
        employeeNome: sstIntegracaoRegistros.employeeNome,
        obraNome: sstIntegracaoRegistros.obraNome,
        dataValidade: sstIntegracaoRegistros.dataValidade,
      }).from(sstIntegracaoRegistros)
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          eq(sstIntegracaoRegistros.status, "aprovado"),
          lte(sstIntegracaoRegistros.dataValidade, em30dias),
          gte(sstIntegracaoRegistros.dataValidade, agora),
          isNull(sstIntegracaoRegistros.deletedAt),
        ))
        .orderBy(asc(sstIntegracaoRegistros.dataValidade))
        .limit(20);

      for (const v of vencendo) {
        alertas.push({ tipo: "vencendo", mensagem: `Integração de ${v.employeeNome} vence em breve`, registroId: v.id, employeeNome: v.employeeNome ?? undefined, obraNome: v.obraNome ?? undefined });
      }

      const reprovados = await db.select({
        id: sstIntegracaoRegistros.id,
        employeeNome: sstIntegracaoRegistros.employeeNome,
        tentativas: sstIntegracaoRegistros.tentativas,
      }).from(sstIntegracaoRegistros)
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          eq(sstIntegracaoRegistros.status, "reprovado"),
          isNull(sstIntegracaoRegistros.deletedAt),
        ))
        .limit(20);

      for (const r of reprovados) {
        alertas.push({ tipo: "reprovado", mensagem: `${r.employeeNome} reprovado (${r.tentativas} tentativa(s))`, registroId: r.id, employeeNome: r.employeeNome ?? undefined });
      }

      const advertenciasRows = await db.execute(sql`
        SELECT e.id as employee_id, e.nome as employee_nome, count(w.id)::int as total_advertencias
        FROM employees e
        JOIN warnings w ON w.employee_id = e.id AND w.company_id = e.company_id AND w.deleted_at IS NULL
        WHERE e.company_id = ${input.companyId} AND e.status = 'Ativo' AND e.deleted_at IS NULL
        GROUP BY e.id, e.nome
        HAVING count(w.id) >= 2
      `);
      const advRows = Array.isArray(advertenciasRows) ? advertenciasRows : advertenciasRows?.rows ?? [];
      for (const a of advRows as any[]) {
        const jaTemReciclagem = await db.select({ id: sstIntegracaoRegistros.id })
          .from(sstIntegracaoRegistros)
          .where(and(
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            eq(sstIntegracaoRegistros.employeeId, a.employee_id),
            eq(sstIntegracaoRegistros.origem, "advertencia"),
            sql`${sstIntegracaoRegistros.status} IN ('pendente', 'em_andamento')`,
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .limit(1);
        if (jaTemReciclagem.length === 0) {
          alertas.push({
            tipo: "advertencia",
            mensagem: `${a.employee_nome} tem ${a.total_advertencias} advertência(s) — recomenda-se reciclagem`,
            employeeNome: a.employee_nome,
          });
        }
      }

      return alertas;
    }),

  gerarReciclagem: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      origem: z.enum(["reciclagem", "advertencia", "transferencia"]).default("reciclagem"),
      configId: z.number().int().positive().optional(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const [emp] = await db.select({
        id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
      }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId)));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado nesta empresa" });

      const [row] = await db.insert(sstIntegracaoRegistros).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        employeeNome: emp.nome,
        employeeCpf: emp.cpf,
        employeeFuncao: emp.funcao,
        configId: input.configId ?? null,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        origem: input.origem,
        token: gerarToken(),
        responsavel: ctx.user.name ?? "Sistema",
        responsavelId: ctx.user.id,
      }).returning();
      return row;
    }),

  buscarPorCpf: publicProcedure
    .input(z.object({ token: z.string(), cpf: z.string().min(11).max(14) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cpfLimpo = input.cpf.replace(/\D/g, "");

      const [registro] = await db.select().from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.token, input.token), isNull(sstIntegracaoRegistros.deletedAt)));
      if (!registro) throw new TRPCError({ code: "NOT_FOUND", message: "Integração não encontrada" });

      const empCpf = (registro.employeeCpf || "").replace(/\D/g, "");
      if (empCpf !== cpfLimpo) throw new TRPCError({ code: "FORBIDDEN", message: "CPF não corresponde ao colaborador desta integração" });

      const registroSafe = {
        id: registro.id,
        status: registro.status,
        nota: registro.nota,
        tentativas: registro.tentativas,
        employeeNome: registro.employeeNome,
        employeeFuncao: registro.employeeFuncao,
        obraNome: registro.obraNome,
        dataRealizacao: registro.dataRealizacao,
        dataValidade: registro.dataValidade,
        origem: registro.origem,
        createdAt: registro.createdAt,
        configId: registro.configId,
      };

      if (registro.status === "aprovado") {
        return { status: "ja_aprovado", registro: registroSafe, modulos: [], config: null };
      }

      let config = null;
      if (registro.configId) {
        const [cfg] = await db.select().from(sstIntegracaoConfig).where(eq(sstIntegracaoConfig.id, registro.configId));
        config = cfg || null;
      }
      if (!config) {
        const conds: any[] = [eq(sstIntegracaoConfig.companyId, registro.companyId), eq(sstIntegracaoConfig.ativo, true), isNull(sstIntegracaoConfig.deletedAt)];
        if (registro.obraId) conds.push(eq(sstIntegracaoConfig.obraId, registro.obraId));
        const [cfg] = await db.select().from(sstIntegracaoConfig).where(and(...conds)).limit(1);
        config = cfg || null;
      }

      if (!config) {
        return { status: "sem_config", registro: registroSafe, modulos: [], config: null };
      }

      if (registro.status === "pendente") {
        await db.update(sstIntegracaoRegistros).set({
          status: "em_andamento", configId: config.id, updatedAt: sql`NOW()`,
        }).where(eq(sstIntegracaoRegistros.id, registro.id));
      }

      const modulos = await db.select().from(sstIntegracaoModulos)
        .where(and(eq(sstIntegracaoModulos.configId, config.id), isNull(sstIntegracaoModulos.deletedAt)))
        .orderBy(asc(sstIntegracaoModulos.ordem));

      const moduloIds = modulos.map(m => m.id);
      let perguntas: any[] = [];
      let alternativas: any[] = [];
      if (moduloIds.length > 0) {
        perguntas = await db.select().from(sstIntegracaoPerguntas)
          .where(inArray(sstIntegracaoPerguntas.moduloId, moduloIds))
          .orderBy(asc(sstIntegracaoPerguntas.ordem));
        const pIds = perguntas.map(p => p.id);
        if (pIds.length > 0) {
          alternativas = await db.select({
            id: sstIntegracaoAlternativas.id,
            perguntaId: sstIntegracaoAlternativas.perguntaId,
            texto: sstIntegracaoAlternativas.texto,
            ordem: sstIntegracaoAlternativas.ordem,
          }).from(sstIntegracaoAlternativas)
            .where(inArray(sstIntegracaoAlternativas.perguntaId, pIds))
            .orderBy(asc(sstIntegracaoAlternativas.ordem));
        }
      }

      const altMap = new Map<number, any[]>();
      for (const a of alternativas) {
        if (!altMap.has(a.perguntaId)) altMap.set(a.perguntaId, []);
        altMap.get(a.perguntaId)!.push(a);
      }
      const pergMap = new Map<number, any[]>();
      for (const p of perguntas) {
        if (!pergMap.has(p.moduloId)) pergMap.set(p.moduloId, []);
        pergMap.get(p.moduloId)!.push({ ...p, alternativas: altMap.get(p.id) || [] });
      }

      return {
        status: "pronto",
        registro: { ...registroSafe, status: "em_andamento" },
        modulos: modulos.map(m => ({ ...m, perguntas: pergMap.get(m.id) || [] })),
        config: { id: config.id, titulo: config.titulo, notaMinima: config.notaMinima, validadeMeses: config.validadeMeses },
      };
    }),

  submeterQuestionario: publicProcedure
    .input(z.object({
      token: z.string(),
      cpf: z.string().min(11).max(14),
      respostas: z.array(z.object({
        perguntaId: z.number().int().positive(),
        alternativaId: z.number().int().positive(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const cpfLimpo = input.cpf.replace(/\D/g, "");

      const [registro] = await db.select().from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.token, input.token), isNull(sstIntegracaoRegistros.deletedAt)));
      if (!registro) throw new TRPCError({ code: "NOT_FOUND", message: "Integração não encontrada" });

      const empCpf = (registro.employeeCpf || "").replace(/\D/g, "");
      if (empCpf !== cpfLimpo) throw new TRPCError({ code: "FORBIDDEN", message: "CPF não corresponde" });
      if (registro.status === "aprovado") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta integração já foi aprovada" });

      if (!registro.configId) throw new TRPCError({ code: "BAD_REQUEST", message: "Configuração não vinculada" });

      const modulos = await db.select({ id: sstIntegracaoModulos.id }).from(sstIntegracaoModulos)
        .where(and(eq(sstIntegracaoModulos.configId, registro.configId), isNull(sstIntegracaoModulos.deletedAt)));
      const moduloIds = modulos.map(m => m.id);

      let expectedPerguntas: { id: number; moduloId: number }[] = [];
      if (moduloIds.length > 0) {
        expectedPerguntas = await db.select({ id: sstIntegracaoPerguntas.id, moduloId: sstIntegracaoPerguntas.moduloId })
          .from(sstIntegracaoPerguntas)
          .where(inArray(sstIntegracaoPerguntas.moduloId, moduloIds));
      }
      const expectedPerguntaIds = new Set(expectedPerguntas.map(p => p.id));
      const totalPerguntas = expectedPerguntaIds.size;

      if (totalPerguntas === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma pergunta configurada" });

      const submittedPerguntaIds = new Set(input.respostas.map(r => r.perguntaId));
      for (const pid of submittedPerguntaIds) {
        if (!expectedPerguntaIds.has(pid)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pergunta inválida enviada" });
        }
      }
      if (submittedPerguntaIds.size !== totalPerguntas) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Todas as ${totalPerguntas} perguntas devem ser respondidas` });
      }
      if (input.respostas.length !== submittedPerguntaIds.size) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Respostas duplicadas não são permitidas" });
      }

      const alternativaIds = input.respostas.map(r => r.alternativaId);
      const altsDb = await db.select({
        id: sstIntegracaoAlternativas.id,
        perguntaId: sstIntegracaoAlternativas.perguntaId,
        correta: sstIntegracaoAlternativas.correta,
      }).from(sstIntegracaoAlternativas)
        .where(inArray(sstIntegracaoAlternativas.id, alternativaIds));
      const altMap = new Map(altsDb.map(a => [a.id, a]));

      for (const r of input.respostas) {
        const alt = altMap.get(r.alternativaId);
        if (!alt || alt.perguntaId !== r.perguntaId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Alternativa não pertence à pergunta informada" });
        }
      }

      const tentativa = (registro.tentativas || 0) + 1;
      let acertos = 0;
      const respostasInsert = input.respostas.map(r => {
        const alt = altMap.get(r.alternativaId);
        const correta = alt?.correta || false;
        if (correta) acertos++;
        return {
          registroId: registro.id,
          perguntaId: r.perguntaId,
          alternativaId: r.alternativaId,
          correta,
          tentativa,
        };
      });

      if (respostasInsert.length > 0) {
        await db.insert(sstIntegracaoRespostas).values(respostasInsert);
      }

      const nota = totalPerguntas > 0 ? Math.round((acertos / totalPerguntas) * 100) : 0;

      const [cfg] = await db.select({ notaMinima: sstIntegracaoConfig.notaMinima, validadeMeses: sstIntegracaoConfig.validadeMeses })
        .from(sstIntegracaoConfig).where(eq(sstIntegracaoConfig.id, registro.configId));
      const notaMinima = cfg?.notaMinima ?? 70;
      const validadeMeses = cfg?.validadeMeses ?? 12;

      const aprovado = nota >= notaMinima;
      const agora = new Date();
      const updates: any = {
        nota: String(nota),
        tentativas: tentativa,
        updatedAt: sql`NOW()`,
      };

      if (aprovado) {
        updates.status = "aprovado";
        updates.dataRealizacao = agora.toISOString();
        const validade = new Date(agora);
        validade.setMonth(validade.getMonth() + validadeMeses);
        updates.dataValidade = validade.toISOString();
      } else {
        updates.status = "reprovado";
      }

      await db.update(sstIntegracaoRegistros).set(updates)
        .where(eq(sstIntegracaoRegistros.id, registro.id));

      // Rev. 2035: retornar campos do registro pós-update pra
      // geração do certificado client-side (jspdf) sem nova query.
      return {
        aprovado,
        nota,
        acertos,
        totalPerguntas,
        tentativa,
        notaMinima,
        registroId: registro.id,
        dataRealizacao: aprovado ? (updates.dataRealizacao as string) : null,
        dataValidade: aprovado ? (updates.dataValidade as string) : null,
        validadeMeses,
        employeeNome: registro.employeeNome,
        employeeCpf: registro.employeeCpf,
        employeeFuncao: registro.employeeFuncao,
        obraNome: registro.obraNome,
      };
    }),

  obterResultado: publicProcedure
    .input(z.object({ token: z.string(), cpf: z.string().min(11).max(14) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cpfLimpo = input.cpf.replace(/\D/g, "");
      const [registro] = await db.select({
        id: sstIntegracaoRegistros.id,
        status: sstIntegracaoRegistros.status,
        nota: sstIntegracaoRegistros.nota,
        tentativas: sstIntegracaoRegistros.tentativas,
        employeeNome: sstIntegracaoRegistros.employeeNome,
        obraNome: sstIntegracaoRegistros.obraNome,
        dataRealizacao: sstIntegracaoRegistros.dataRealizacao,
        dataValidade: sstIntegracaoRegistros.dataValidade,
        origem: sstIntegracaoRegistros.origem,
        createdAt: sstIntegracaoRegistros.createdAt,
      }).from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.token, input.token), isNull(sstIntegracaoRegistros.deletedAt)));
      if (!registro) throw new TRPCError({ code: "NOT_FOUND", message: "Integração não encontrada" });

      const [full] = await db.select({ cpf: sstIntegracaoRegistros.employeeCpf }).from(sstIntegracaoRegistros)
        .where(eq(sstIntegracaoRegistros.id, registro.id));
      const empCpf = (full?.cpf || "").replace(/\D/g, "");
      if (empCpf !== cpfLimpo) throw new TRPCError({ code: "FORBIDDEN", message: "CPF não corresponde" });

      return registro;
    }),

  historicoColaborador: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), employeeId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // Rev. 2035: enriquece com nome da configuração pro card SST do Raio-X.
      const rows = await db.select({
        registro: sstIntegracaoRegistros,
        configNome: sstIntegracaoConfig.titulo,
        configNotaMinima: sstIntegracaoConfig.notaMinima,
        configValidadeMeses: sstIntegracaoConfig.validadeMeses,
      })
        .from(sstIntegracaoRegistros)
        .leftJoin(sstIntegracaoConfig, eq(sstIntegracaoConfig.id, sstIntegracaoRegistros.configId))
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          eq(sstIntegracaoRegistros.employeeId, input.employeeId),
          isNull(sstIntegracaoRegistros.deletedAt),
        ))
        .orderBy(desc(sstIntegracaoRegistros.createdAt));
      return rows.map(r => ({
        ...r.registro,
        configNome: r.configNome,
        configNotaMinima: r.configNotaMinima,
        configValidadeMeses: r.configValidadeMeses,
      }));
    }),
});
