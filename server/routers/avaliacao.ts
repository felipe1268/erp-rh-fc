import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb as _getDb } from "../db";
import {
  evalAvaliadores,
  evalAvaliacoes,
  evalScores,
  evalCriteriaRevisions,
  evalPillars,
  evalCriteria,
  evalSurveys,
  evalSurveyQuestions,
  evalSurveyResponses,
  evalSurveyAnswers,
  evalSurveyEvaluators,
  evalClimateSurveys,
  evalClimateQuestions,
  evalClimateResponses,
  evalClimateAnswers,
  evalExternalParticipants,
  evalClimateExternalTokens,
  evalAuditLog,
  employees,
} from "../../drizzle/schema";
import { eq, and, desc, asc, sql, count, avg, inArray, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";

async function getDb() {
  const db = await _getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
  return db;
}

// Regras de negócio - Recomendação automática
function getRecomendacao(media: number): string {
  if (media < 2.0) return "SUGERIR DEMISSÃO";
  if (media < 3.0) return "ATENÇÃO - ACOMPANHAR";
  if (media < 4.0) return "TREINAMENTO";
  return "PROMOÇÃO / PREMIAÇÃO";
}

function getCorRecomendacao(rec: string): string {
  if (rec.includes("DEMISSÃO")) return "#EF4444";
  if (rec.includes("ATENÇÃO")) return "#F59E0B";
  if (rec.includes("TREINAMENTO")) return "#3B82F6";
  return "#22C55E";
}

export const avaliacaoRouter = router({
  // ============================================================
  // AVALIADORES (gestão de avaliadores com login próprio)
  // ============================================================
  avaliadores: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const avaliadores = await db.select().from(evalAvaliadores)
          .where(eq(evalAvaliadores.companyId, input.companyId))
          .orderBy(desc(evalAvaliadores.createdAt));
        // Contar avaliações por avaliador
        const enriched = [];
        for (const a of avaliadores) {
          const [stats] = await db.select({ count: count() }).from(evalAvaliacoes)
            .where(eq(evalAvaliacoes.evaluatorId, a.id));
          enriched.push({ ...a, totalAvaliacoes: stats?.count || 0 });
        }
        return enriched;
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        nome: z.string().min(1),
        email: z.string().email(),
        obraId: z.number().optional(),
        evaluationFrequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]).default("monthly"),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const tempPassword = Math.random().toString(36).slice(-8);
        // Armazenar hash simples (em produção usar bcrypt)
        const [result] = await db.insert(evalAvaliadores).values({
          companyId: input.companyId,
          nome: input.nome,
          email: input.email,
          passwordHash: tempPassword, // simplificado
          obraId: input.obraId || null,
          evaluationFrequency: input.evaluationFrequency,
          mustChangePassword: 1,
        });
        return { id: result.insertId, tempPassword };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        email: z.string().email().optional(),
        obraId: z.number().nullable().optional(),
        evaluationFrequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const { id, ...data } = input;
        const updateData: any = {};
        if (data.nome !== undefined) updateData.nome = data.nome;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.obraId !== undefined) updateData.obraId = data.obraId;
        if (data.evaluationFrequency !== undefined) updateData.evaluationFrequency = data.evaluationFrequency;
        await db.update(evalAvaliadores).set(updateData).where(eq(evalAvaliadores.id, id));
        return { success: true };
      }),

    resetPassword: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const tempPassword = Math.random().toString(36).slice(-8);
        await db.update(evalAvaliadores).set({ passwordHash: tempPassword, mustChangePassword: 1 }).where(eq(evalAvaliadores.id, input.id));
        return { tempPassword };
      }),

    toggleStatus: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const [avaliador] = await db.select().from(evalAvaliadores).where(eq(evalAvaliadores.id, input.id));
        if (!avaliador) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliador não encontrado" });
        const newStatus = avaliador.status === "ativo" ? "inativo" : "ativo";
        await db.update(evalAvaliadores).set({ status: newStatus }).where(eq(evalAvaliadores.id, input.id));
        return { success: true, newStatus };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Verificar se tem avaliações vinculadas
        const [stats] = await db.select({ count: count() }).from(evalAvaliacoes).where(eq(evalAvaliacoes.evaluatorId, input.id));
        if ((stats?.count || 0) > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível excluir: existem avaliações vinculadas a este avaliador. Inative-o em vez disso." });
        }
        await db.delete(evalAvaliadores).where(eq(evalAvaliadores.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // AVALIAÇÕES (12 critérios fixos, 3 pilares)
  // ============================================================
  avaliacoes: router({
    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        evaluatorId: z.number(),
        // Pilar 1 - Postura e Disciplina
        comportamento: z.number().min(1).max(5),
        pontualidade: z.number().min(1).max(5),
        assiduidade: z.number().min(1).max(5),
        segurancaEpis: z.number().min(1).max(5),
        // Pilar 2 - Desempenho Técnico
        qualidadeAcabamento: z.number().min(1).max(5),
        produtividadeRitmo: z.number().min(1).max(5),
        cuidadoFerramentas: z.number().min(1).max(5),
        economiaMateriais: z.number().min(1).max(5),
        // Pilar 3 - Atitude e Crescimento
        trabalhoEquipe: z.number().min(1).max(5),
        iniciativaProatividade: z.number().min(1).max(5),
        disponibilidadeFlexibilidade: z.number().min(1).max(5),
        organizacaoLimpeza: z.number().min(1).max(5),
        observacoes: z.string().optional(),
        mesReferencia: z.string().optional(),
        durationSeconds: z.number().optional(),
        deviceType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();

        // Calcular médias dos 3 pilares
        const mediaPilar1 = (input.comportamento + input.pontualidade + input.assiduidade + input.segurancaEpis) / 4;
        const mediaPilar2 = (input.qualidadeAcabamento + input.produtividadeRitmo + input.cuidadoFerramentas + input.economiaMateriais) / 4;
        const mediaPilar3 = (input.trabalhoEquipe + input.iniciativaProatividade + input.disponibilidadeFlexibilidade + input.organizacaoLimpeza) / 4;
        const mediaGeral = (mediaPilar1 + mediaPilar2 + mediaPilar3) / 3;
        const recomendacao = getRecomendacao(mediaGeral);

        const mesRef = input.mesReferencia || new Date().toISOString().slice(0, 7);

        const [result] = await db.insert(evalAvaliacoes).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          evaluatorId: input.evaluatorId,
          comportamento: input.comportamento,
          pontualidade: input.pontualidade,
          assiduidade: input.assiduidade,
          segurancaEpis: input.segurancaEpis,
          qualidadeAcabamento: input.qualidadeAcabamento,
          produtividadeRitmo: input.produtividadeRitmo,
          cuidadoFerramentas: input.cuidadoFerramentas,
          economiaMateriais: input.economiaMateriais,
          trabalhoEquipe: input.trabalhoEquipe,
          iniciativaProatividade: input.iniciativaProatividade,
          disponibilidadeFlexibilidade: input.disponibilidadeFlexibilidade,
          organizacaoLimpeza: input.organizacaoLimpeza,
          mediaPilar1: String(mediaPilar1.toFixed(1)),
          mediaPilar2: String(mediaPilar2.toFixed(1)),
          mediaPilar3: String(mediaPilar3.toFixed(1)),
          mediaGeral: String(mediaGeral.toFixed(1)),
          recomendacao,
          observacoes: input.observacoes || null,
          mesReferencia: mesRef,
          locked: 1,
          durationSeconds: input.durationSeconds || null,
          deviceType: input.deviceType || null,
        });

        return { id: result.insertId, mediaGeral: parseFloat(mediaGeral.toFixed(1)), recomendacao };
      }),

    list: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number().optional(),
        evaluatorId: z.number().optional(),
        mesReferencia: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        const conditions: any[] = [eq(evalAvaliacoes.companyId, input.companyId)];
        if (input.employeeId) conditions.push(eq(evalAvaliacoes.employeeId, input.employeeId));
        if (input.evaluatorId) conditions.push(eq(evalAvaliacoes.evaluatorId, input.evaluatorId));
        if (input.mesReferencia) conditions.push(eq(evalAvaliacoes.mesReferencia, input.mesReferencia));

        const avaliacoes = await db.select().from(evalAvaliacoes)
          .where(and(...conditions))
          .orderBy(desc(evalAvaliacoes.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        // Enriquecer com dados do funcionário e avaliador
        const enriched = [];
        for (const av of avaliacoes) {
          const [emp] = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor })
            .from(employees).where(eq(employees.id, av.employeeId));
          const [evaluator] = await db.select({ id: evalAvaliadores.id, nome: evalAvaliadores.nome })
            .from(evalAvaliadores).where(eq(evalAvaliadores.id, av.evaluatorId));
          enriched.push({
            ...av,
            employeeName: emp?.nome || "N/A",
            employeeFuncao: emp?.funcao || "",
            employeeSetor: emp?.setor || "",
            evaluatorName: evaluator?.nome || "N/A",
          });
        }
        return enriched;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [av] = await db.select().from(evalAvaliacoes).where(eq(evalAvaliacoes.id, input.id));
        if (!av) return null;
        const [emp] = await db.select().from(employees).where(eq(employees.id, av.employeeId));
        const [evaluator] = await db.select().from(evalAvaliadores).where(eq(evalAvaliadores.id, av.evaluatorId));
        return { ...av, employee: emp || null, evaluator: evaluator || null };
      }),

    getByEmployee: protectedProcedure
      .input(z.object({ employeeId: z.number(), companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const avaliacoes = await db.select().from(evalAvaliacoes)
          .where(and(eq(evalAvaliacoes.employeeId, input.employeeId), eq(evalAvaliacoes.companyId, input.companyId)))
          .orderBy(desc(evalAvaliacoes.createdAt));
        const enriched = [];
        for (const av of avaliacoes) {
          const [evaluator] = await db.select({ nome: evalAvaliadores.nome }).from(evalAvaliadores).where(eq(evalAvaliadores.id, av.evaluatorId));
          enriched.push({ ...av, evaluatorName: evaluator?.nome || "N/A" });
        }
        return enriched;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.delete(evalScores).where(eq(evalScores.evaluationId, input.id));
        await db.delete(evalAvaliacoes).where(eq(evalAvaliacoes.id, input.id));
        return { success: true };
      }),

    generateAiSummary: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const [av] = await db.select().from(evalAvaliacoes).where(eq(evalAvaliacoes.id, input.id));
        if (!av) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliação não encontrada" });
        const [emp] = await db.select().from(employees).where(eq(employees.id, av.employeeId));

        const prompt = `Analise a avaliação de desempenho do funcionário ${emp?.nomeCompleto || "N/A"} (${emp?.funcao || "N/A"}).

Notas (1-5):
PILAR 1 - Postura e Disciplina:
- Comportamento: ${av.comportamento}/5
- Pontualidade: ${av.pontualidade}/5
- Assiduidade: ${av.assiduidade}/5
- Segurança/EPIs: ${av.segurancaEpis}/5
Média Pilar 1: ${av.mediaPilar1}

PILAR 2 - Desempenho Técnico:
- Qualidade/Acabamento: ${av.qualidadeAcabamento}/5
- Produtividade/Ritmo: ${av.produtividadeRitmo}/5
- Cuidado Ferramentas: ${av.cuidadoFerramentas}/5
- Economia Materiais: ${av.economiaMateriais}/5
Média Pilar 2: ${av.mediaPilar2}

PILAR 3 - Atitude e Crescimento:
- Trabalho em Equipe: ${av.trabalhoEquipe}/5
- Iniciativa/Proatividade: ${av.iniciativaProatividade}/5
- Disponibilidade/Flexibilidade: ${av.disponibilidadeFlexibilidade}/5
- Organização/Limpeza: ${av.organizacaoLimpeza}/5
Média Pilar 3: ${av.mediaPilar3}

Média Geral: ${av.mediaGeral}
Recomendação: ${av.recomendacao}
Observações: ${av.observacoes || "Nenhuma"}

Gere um resumo executivo em português brasileiro com:
1. Pontos fortes do colaborador
2. Pontos de atenção
3. Sugestões de desenvolvimento
4. Conclusão`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em RH e gestão de pessoas da construção civil. Responda em português brasileiro de forma objetiva." },
            { role: "user", content: prompt },
          ],
        });

        return { summary: response.choices[0]?.message?.content || "Não foi possível gerar o resumo." };
      }),
  }),

  // ============================================================
  // DASHBOARD & RANKING
  // ============================================================
  dashboard: router({
    globalStats: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [totalAvaliacoes] = await db.select({ count: count() }).from(evalAvaliacoes).where(eq(evalAvaliacoes.companyId, input.companyId));
        const [totalAvaliadores] = await db.select({ count: count() }).from(evalAvaliadores).where(eq(evalAvaliadores.companyId, input.companyId));
        const [mediaGeralResult] = await db.select({ avg: avg(evalAvaliacoes.mediaGeral) }).from(evalAvaliacoes).where(eq(evalAvaliacoes.companyId, input.companyId));

        // Avaliações por mês (últimos 6 meses)
        const porMes = await db.select({
          mes: evalAvaliacoes.mesReferencia,
          count: count(),
          media: avg(evalAvaliacoes.mediaGeral),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.mesReferencia)
          .orderBy(desc(evalAvaliacoes.mesReferencia))
          .limit(6);

        // Distribuição por recomendação
        const porRecomendacao = await db.select({
          recomendacao: evalAvaliacoes.recomendacao,
          count: count(),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.recomendacao);

        return {
          totalAvaliacoes: totalAvaliacoes?.count || 0,
          totalAvaliadores: totalAvaliadores?.count || 0,
          mediaGeral: mediaGeralResult?.avg ? parseFloat(String(mediaGeralResult.avg)) : 0,
          porMes: porMes.reverse(),
          porRecomendacao,
        };
      }),

    employeeRanking: protectedProcedure
      .input(z.object({ companyId: z.number(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        const db = await getDb();
        const ranking = await db.select({
          employeeId: evalAvaliacoes.employeeId,
          mediaGeral: avg(evalAvaliacoes.mediaGeral),
          totalAvaliacoes: count(),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.employeeId)
          .orderBy(desc(avg(evalAvaliacoes.mediaGeral)))
          .limit(input.limit);

        const enriched = [];
        for (const r of ranking) {
          const [emp] = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor })
            .from(employees).where(eq(employees.id, r.employeeId));
          const media = r.mediaGeral ? parseFloat(String(r.mediaGeral)) : 0;
          enriched.push({
            ...r,
            mediaGeral: media,
            employeeName: emp?.nome || "N/A",
            employeeFuncao: emp?.funcao || "",
            employeeSetor: emp?.setor || "",
            recomendacao: getRecomendacao(media),
            corRecomendacao: getCorRecomendacao(getRecomendacao(media)),
          });
        }
        return enriched;
      }),

    evaluatorStats: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const ranking = await db.select({
          evaluatorId: evalAvaliacoes.evaluatorId,
          totalAvaliacoes: count(),
          avgDuration: avg(evalAvaliacoes.durationSeconds),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.evaluatorId)
          .orderBy(desc(count()));

        const enriched = [];
        for (const r of ranking) {
          const [ev] = await db.select({ nome: evalAvaliadores.nome }).from(evalAvaliadores).where(eq(evalAvaliadores.id, r.evaluatorId));
          enriched.push({
            ...r,
            evaluatorName: ev?.nome || "N/A",
            avgDuration: r.avgDuration ? Math.round(parseFloat(String(r.avgDuration))) : 0,
          });
        }
        return enriched;
      }),
  }),

  // ============================================================
  // CRITÉRIOS CONFIGURÁVEIS (com revisões)
  // ============================================================
  criterios: router({
    getActiveRevision: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [revision] = await db.select().from(evalCriteriaRevisions)
          .where(and(eq(evalCriteriaRevisions.companyId, input.companyId), eq(evalCriteriaRevisions.isActive, 1)));
        if (!revision) return null;

        const pillars = await db.select().from(evalPillars)
          .where(eq(evalPillars.revisionId, revision.id))
          .orderBy(evalPillars.ordem);

        const enrichedPillars = [];
        for (const p of pillars) {
          const criteria = await db.select().from(evalCriteria)
            .where(and(eq(evalCriteria.pillarId, p.id), eq(evalCriteria.ativo, 1)))
            .orderBy(evalCriteria.ordem);
          enrichedPillars.push({ ...p, criteria });
        }

        return { ...revision, pillars: enrichedPillars };
      }),

    createRevision: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        descricao: z.string().optional(),
        pillars: z.array(z.object({
          nome: z.string(),
          ordem: z.number(),
          criteria: z.array(z.object({
            nome: z.string(),
            descricao: z.string().optional(),
            fieldKey: z.string().optional(),
            ordem: z.number(),
          })),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const existing = await db.select({ count: count() }).from(evalCriteriaRevisions)
          .where(eq(evalCriteriaRevisions.companyId, input.companyId));
        const version = ((existing[0]?.count as number) || 0) + 1;

        const [rev] = await db.insert(evalCriteriaRevisions).values({
          companyId: input.companyId,
          version,
          descricao: input.descricao || `Revisão ${version}`,
          isActive: 0,
          createdBy: ctx.user?.name || "Sistema",
        });

        for (const pillar of input.pillars) {
          const [p] = await db.insert(evalPillars).values({
            revisionId: rev.insertId,
            nome: pillar.nome,
            ordem: pillar.ordem,
          });
          for (const criterion of pillar.criteria) {
            await db.insert(evalCriteria).values({
              pillarId: p.insertId,
              revisionId: rev.insertId,
              nome: criterion.nome,
              descricao: criterion.descricao || null,
              fieldKey: criterion.fieldKey || null,
              ordem: criterion.ordem,
            });
          }
        }

        return { id: rev.insertId, version };
      }),

    activateRevision: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.update(evalCriteriaRevisions).set({ isActive: 0 }).where(eq(evalCriteriaRevisions.companyId, input.companyId));
        await db.update(evalCriteriaRevisions).set({ isActive: 1 }).where(eq(evalCriteriaRevisions.id, input.id));
        return { success: true };
      }),

    listRevisions: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return db.select().from(evalCriteriaRevisions)
          .where(eq(evalCriteriaRevisions.companyId, input.companyId))
          .orderBy(desc(evalCriteriaRevisions.version));
      }),

    // Criar revisão padrão com os 12 critérios / 3 pilares
    createDefaultRevision: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const [rev] = await db.insert(evalCriteriaRevisions).values({
          companyId: input.companyId,
          version: 1,
          descricao: "Padrão FC Engenharia - 12 Critérios / 3 Pilares",
          isActive: 1,
          createdBy: ctx.user?.name || "Sistema",
        });

        const pilares = [
          { nome: "Postura e Disciplina", ordem: 1, criterios: [
            { nome: "Comportamento", fieldKey: "comportamento", ordem: 1, descricao: "Postura profissional, respeito às normas e aos colegas" },
            { nome: "Pontualidade", fieldKey: "pontualidade", ordem: 2, descricao: "Cumprimento de horários de entrada, saída e intervalos" },
            { nome: "Assiduidade", fieldKey: "assiduidade", ordem: 3, descricao: "Frequência e comprometimento com a presença no trabalho" },
            { nome: "Segurança e EPIs", fieldKey: "segurancaEpis", ordem: 4, descricao: "Uso correto de EPIs e cumprimento das normas de segurança" },
          ]},
          { nome: "Desempenho Técnico", ordem: 2, criterios: [
            { nome: "Qualidade e Acabamento", fieldKey: "qualidadeAcabamento", ordem: 1, descricao: "Nível de qualidade e acabamento dos serviços executados" },
            { nome: "Produtividade e Ritmo", fieldKey: "produtividadeRitmo", ordem: 2, descricao: "Volume de trabalho entregue dentro do prazo esperado" },
            { nome: "Cuidado com Ferramentas", fieldKey: "cuidadoFerramentas", ordem: 3, descricao: "Zelo e manutenção dos equipamentos e ferramentas" },
            { nome: "Economia de Materiais", fieldKey: "economiaMateriais", ordem: 4, descricao: "Uso consciente e econômico dos materiais de trabalho" },
          ]},
          { nome: "Atitude e Crescimento", ordem: 3, criterios: [
            { nome: "Trabalho em Equipe", fieldKey: "trabalhoEquipe", ordem: 1, descricao: "Colaboração e relacionamento com colegas de trabalho" },
            { nome: "Iniciativa e Proatividade", fieldKey: "iniciativaProatividade", ordem: 2, descricao: "Capacidade de antecipar problemas e propor soluções" },
            { nome: "Disponibilidade e Flexibilidade", fieldKey: "disponibilidadeFlexibilidade", ordem: 3, descricao: "Adaptação a mudanças e disponibilidade para novas tarefas" },
            { nome: "Organização e Limpeza", fieldKey: "organizacaoLimpeza", ordem: 4, descricao: "Manutenção da organização e limpeza do ambiente de trabalho" },
          ]},
        ];

        for (const pilar of pilares) {
          const [p] = await db.insert(evalPillars).values({
            revisionId: rev.insertId,
            nome: pilar.nome,
            ordem: pilar.ordem,
          });
          for (const c of pilar.criterios) {
            await db.insert(evalCriteria).values({
              pillarId: p.insertId,
              revisionId: rev.insertId,
              nome: c.nome,
              descricao: c.descricao,
              fieldKey: c.fieldKey,
              ordem: c.ordem,
            });
          }
        }

        return { id: rev.insertId };
      }),
  }),

  // ============================================================
  // PESQUISAS CUSTOMIZADAS
  // ============================================================
  pesquisas: router({
    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        tipo: z.enum(["setor", "cliente", "outro"]).default("outro"),
        anonimo: z.boolean().default(false),
        obraId: z.number().optional(),
        questions: z.array(z.object({
          texto: z.string(),
          tipo: z.enum(["nota", "texto", "sim_nao"]).default("nota"),
          ordem: z.number(),
          obrigatoria: z.boolean().default(true),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const { questions, ...surveyData } = input;
        const [survey] = await db.insert(evalSurveys).values({
          ...surveyData,
          anonimo: input.anonimo ? 1 : 0,
        });
        for (const q of questions) {
          await db.insert(evalSurveyQuestions).values({
            surveyId: survey.insertId,
            texto: q.texto,
            tipo: q.tipo,
            ordem: q.ordem,
            obrigatoria: q.obrigatoria ? 1 : 0,
          });
        }
        return { id: survey.insertId };
      }),

    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const surveys = await db.select().from(evalSurveys)
          .where(eq(evalSurveys.companyId, input.companyId))
          .orderBy(desc(evalSurveys.createdAt));
        const enriched = [];
        for (const s of surveys) {
          const [respCount] = await db.select({ count: count() }).from(evalSurveyResponses).where(eq(evalSurveyResponses.surveyId, s.id));
          enriched.push({ ...s, totalRespostas: respCount?.count || 0 });
        }
        return enriched;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [survey] = await db.select().from(evalSurveys).where(eq(evalSurveys.id, input.id));
        if (!survey) return null;
        const questions = await db.select().from(evalSurveyQuestions)
          .where(eq(evalSurveyQuestions.surveyId, input.id))
          .orderBy(evalSurveyQuestions.ordem);
        return { ...survey, questions };
      }),

    getPublic: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [survey] = await db.select().from(evalSurveys).where(eq(evalSurveys.id, input.id));
        if (!survey || survey.status !== "ativa") return null;
        const questions = await db.select().from(evalSurveyQuestions)
          .where(eq(evalSurveyQuestions.surveyId, input.id))
          .orderBy(evalSurveyQuestions.ordem);
        return { ...survey, questions };
      }),

    submitResponse: publicProcedure
      .input(z.object({
        surveyId: z.number(),
        respondentName: z.string().optional(),
        respondentEmail: z.string().optional(),
        answers: z.array(z.object({
          questionId: z.number(),
          valor: z.string().optional(),
          textoLivre: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const [response] = await db.insert(evalSurveyResponses).values({
          surveyId: input.surveyId,
          respondentName: input.respondentName || null,
          respondentEmail: input.respondentEmail || null,
        });
        for (const a of input.answers) {
          await db.insert(evalSurveyAnswers).values({
            responseId: response.insertId,
            questionId: a.questionId,
            valor: a.valor || null,
            textoLivre: a.textoLivre || null,
          });
        }
        return { success: true };
      }),

    getResults: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const questions = await db.select().from(evalSurveyQuestions)
          .where(eq(evalSurveyQuestions.surveyId, input.surveyId))
          .orderBy(evalSurveyQuestions.ordem);
        const responses = await db.select().from(evalSurveyResponses)
          .where(eq(evalSurveyResponses.surveyId, input.surveyId));
        const results = [];
        for (const q of questions) {
          const answers = await db.select().from(evalSurveyAnswers)
            .where(eq(evalSurveyAnswers.questionId, q.id));
          results.push({ question: q, answers, totalRespostas: answers.length });
        }
        return { totalRespondentes: responses.length, results };
      }),

    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["ativa", "encerrada", "rascunho"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.update(evalSurveys).set({ status: input.status }).where(eq(evalSurveys.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Deletar respostas e perguntas vinculadas
        const responses = await db.select({ id: evalSurveyResponses.id }).from(evalSurveyResponses).where(eq(evalSurveyResponses.surveyId, input.id));
        if (responses.length > 0) {
          const respIds = responses.map(r => r.id);
          await db.delete(evalSurveyAnswers).where(inArray(evalSurveyAnswers.responseId, respIds));
        }
        await db.delete(evalSurveyResponses).where(eq(evalSurveyResponses.surveyId, input.id));
        await db.delete(evalSurveyQuestions).where(eq(evalSurveyQuestions.surveyId, input.id));
        await db.delete(evalSurveyEvaluators).where(eq(evalSurveyEvaluators.surveyId, input.id));
        await db.delete(evalSurveys).where(eq(evalSurveys.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // PESQUISA DE CLIMA ORGANIZACIONAL
  // ============================================================
  clima: router({
    createSurvey: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        questions: z.array(z.object({
          texto: z.string(),
          categoria: z.enum(["empresa", "gestor", "ambiente", "seguranca", "crescimento", "recomendacao"]),
          tipo: z.enum(["nota", "texto", "sim_nao"]).default("nota"),
          ordem: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const { questions, ...data } = input;
        const [survey] = await db.insert(evalClimateSurveys).values(data);
        for (const q of questions) {
          await db.insert(evalClimateQuestions).values({ surveyId: survey.insertId, ...q });
        }
        return { id: survey.insertId };
      }),

    listSurveys: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const surveys = await db.select().from(evalClimateSurveys)
          .where(eq(evalClimateSurveys.companyId, input.companyId))
          .orderBy(desc(evalClimateSurveys.createdAt));
        const enriched = [];
        for (const s of surveys) {
          const [respCount] = await db.select({ count: count() }).from(evalClimateResponses).where(eq(evalClimateResponses.surveyId, s.id));
          enriched.push({ ...s, totalRespostas: respCount?.count || 0 });
        }
        return enriched;
      }),

    getPublicSurvey: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [survey] = await db.select().from(evalClimateSurveys).where(eq(evalClimateSurveys.id, input.id));
        if (!survey || survey.status !== "ativa") return null;
        const questions = await db.select().from(evalClimateQuestions)
          .where(eq(evalClimateQuestions.surveyId, input.id))
          .orderBy(evalClimateQuestions.ordem);
        return { ...survey, questions };
      }),

    submitResponse: publicProcedure
      .input(z.object({
        surveyId: z.number(),
        cpfHash: z.string().optional(),
        answers: z.array(z.object({
          questionId: z.number(),
          valor: z.string().optional(),
          textoLivre: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (input.cpfHash) {
          const existing = await db.select().from(evalClimateResponses)
            .where(and(eq(evalClimateResponses.surveyId, input.surveyId), eq(evalClimateResponses.cpfHash, input.cpfHash)));
          if (existing.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Você já respondeu esta pesquisa." });
        }
        const [response] = await db.insert(evalClimateResponses).values({
          surveyId: input.surveyId,
          cpfHash: input.cpfHash || null,
        });
        for (const a of input.answers) {
          await db.insert(evalClimateAnswers).values({ responseId: response.insertId, questionId: a.questionId, valor: a.valor || null, textoLivre: a.textoLivre || null });
        }
        return { success: true };
      }),

    getResults: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const questions = await db.select().from(evalClimateQuestions)
          .where(eq(evalClimateQuestions.surveyId, input.surveyId))
          .orderBy(evalClimateQuestions.ordem);
        const responses = await db.select().from(evalClimateResponses)
          .where(eq(evalClimateResponses.surveyId, input.surveyId));
        const byCategory: Record<string, any[]> = {};
        for (const q of questions) {
          const answers = await db.select().from(evalClimateAnswers).where(eq(evalClimateAnswers.questionId, q.id));
          if (!byCategory[q.categoria]) byCategory[q.categoria] = [];
          byCategory[q.categoria].push({ question: q, answers, totalRespostas: answers.length });
        }
        return { totalRespondentes: responses.length, byCategory };
      }),

    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["ativa", "encerrada", "rascunho"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.update(evalClimateSurveys).set({ status: input.status }).where(eq(evalClimateSurveys.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // PARTICIPANTES EXTERNOS
  // ============================================================
  participantes: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return db.select().from(evalExternalParticipants)
          .where(eq(evalExternalParticipants.companyId, input.companyId))
          .orderBy(desc(evalExternalParticipants.createdAt));
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        nome: z.string().min(1),
        empresa: z.string().optional(),
        tipo: z.enum(["cliente", "fornecedor"]).default("cliente"),
        email: z.string().optional(),
        telefone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const [result] = await db.insert(evalExternalParticipants).values(input);
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        empresa: z.string().optional(),
        tipo: z.enum(["cliente", "fornecedor"]).optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const { id, ...data } = input;
        await db.update(evalExternalParticipants).set(data).where(eq(evalExternalParticipants.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.delete(evalExternalParticipants).where(eq(evalExternalParticipants.id, input.id));
        return { success: true };
      }),

    generateTokens: protectedProcedure
      .input(z.object({ surveyId: z.number(), participantIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const tokens = [];
        for (const pid of input.participantIds) {
          const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
          await db.insert(evalClimateExternalTokens).values({
            surveyId: input.surveyId,
            participantId: pid,
            token: token.slice(0, 32),
          });
          tokens.push({ participantId: pid, token: token.slice(0, 32) });
        }
        return tokens;
      }),
  }),

  // ============================================================
  // LOG DE AUDITORIA
  // ============================================================
  auditoria: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), limit: z.number().default(50), offset: z.number().default(0) }))
      .query(async ({ input }) => {
        const db = await getDb();
        return db.select().from(evalAuditLog)
          .where(eq(evalAuditLog.companyId, input.companyId))
          .orderBy(desc(evalAuditLog.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      }),

    log: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        action: z.string(),
        actorType: z.enum(["admin", "evaluator", "system", "anonymous"]).default("admin"),
        actorId: z.number().optional(),
        actorName: z.string().optional(),
        targetType: z.string().optional(),
        targetId: z.number().optional(),
        details: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.insert(evalAuditLog).values(input);
        return { success: true };
      }),
  }),
});
