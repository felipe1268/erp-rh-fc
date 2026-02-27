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
  obras,
  users,
} from "../../drizzle/schema";
import { eq, and, desc, asc, sql, count, avg, inArray, gte, isNull } from "drizzle-orm";
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

// Roles que podem ver resultados de avaliações
const ROLES_RESULTADOS = ["admin", "admin_master"];

function canViewResults(userRole: string | null | undefined): boolean {
  if (!userRole) return false;
  return ROLES_RESULTADOS.includes(userRole);
}

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
        const [result] = await db.insert(evalAvaliadores).values({
          companyId: input.companyId,
          nome: input.nome,
          email: input.email,
          passwordHash: tempPassword,
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
  // Avaliador = usuário logado (ctx.user)
  // ============================================================
  avaliacoes: router({
    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        obraId: z.number().optional(),
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
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();

        // Avaliador = usuário logado automaticamente
        const evaluatorId = ctx.user?.id || 0;
        const evaluatorName = ctx.user?.name || "Sistema";

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
          evaluatorId,
          obraId: input.obraId || null,
          evaluatorName,
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

        // Log de auditoria
        await db.insert(evalAuditLog).values({
          companyId: input.companyId,
          action: "AVALIACAO_CRIADA",
          actorType: "admin",
          actorId: evaluatorId,
          actorName: evaluatorName,
          targetType: "avaliacao",
          targetId: result.insertId,
          details: JSON.stringify({ employeeId: input.employeeId, mediaGeral: mediaGeral.toFixed(1), recomendacao }),
        });

        return { id: result.insertId, mediaGeral: parseFloat(mediaGeral.toFixed(1)), recomendacao };
      }),

    // Lista avaliações - com controle de visibilidade
    // Gestor que avaliou NÃO vê as notas (apenas que avaliou)
    // Apenas RH/ADM/ADM Master veem resultados completos
    list: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number().optional(),
        evaluatorId: z.number().optional(),
        mesReferencia: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ input, ctx }) => {
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

        const userRole = ctx.user?.role;
        const userId = ctx.user?.id;
        const canView = canViewResults(userRole);

        const enriched = [];
        for (const av of avaliacoes) {
          const [emp] = await db.select({ id: employees.id, nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor })
            .from(employees).where(eq(employees.id, av.employeeId));

          // Buscar nome do avaliador: primeiro do campo snapshot, depois da tabela eval_avaliadores
          let evaluatorDisplayName = av.evaluatorName || "N/A";
          if (!av.evaluatorName) {
            const [evaluator] = await db.select({ nome: evalAvaliadores.nome })
              .from(evalAvaliadores).where(eq(evalAvaliadores.id, av.evaluatorId));
            evaluatorDisplayName = evaluator?.nome || "N/A";
          }

          // Buscar nome da obra
          let obraNome = "";
          if (av.obraId) {
            const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, av.obraId));
            obraNome = obra?.nome || "";
          }

          // Se o usuário NÃO pode ver resultados E é o avaliador, ocultar notas
          const isEvaluator = av.evaluatorId === userId;
          const hideScores = !canView && isEvaluator;

          if (hideScores) {
            enriched.push({
              id: av.id,
              companyId: av.companyId,
              employeeId: av.employeeId,
              evaluatorId: av.evaluatorId,
              obraId: av.obraId,
              mesReferencia: av.mesReferencia,
              createdAt: av.createdAt,
              locked: av.locked,
              employeeName: emp?.nome || "N/A",
              employeeFuncao: emp?.funcao || "",
              employeeSetor: emp?.setor || "",
              evaluatorName: evaluatorDisplayName,
              obraNome,
              // Notas ocultas
              mediaGeral: null,
              mediaPilar1: null,
              mediaPilar2: null,
              mediaPilar3: null,
              recomendacao: "AVALIAÇÃO REGISTRADA",
              _hidden: true,
            });
          } else if (!canView) {
            // Usuário comum que NÃO é o avaliador: não mostrar nada
            continue;
          } else {
            enriched.push({
              ...av,
              employeeName: emp?.nome || "N/A",
              employeeFuncao: emp?.funcao || "",
              employeeSetor: emp?.setor || "",
              evaluatorName: evaluatorDisplayName,
              obraNome,
              _hidden: false,
            });
          }
        }
        return enriched;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        const [av] = await db.select().from(evalAvaliacoes).where(eq(evalAvaliacoes.id, input.id));
        if (!av) return null;

        // Verificar permissão
        const canView = canViewResults(ctx.user?.role);
        if (!canView) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas RH, ADM e ADM Master podem visualizar detalhes das avaliações." });
        }

        const [emp] = await db.select().from(employees).where(eq(employees.id, av.employeeId));
        let evaluatorDisplayName = av.evaluatorName || "N/A";
        if (!av.evaluatorName) {
          const [evaluator] = await db.select().from(evalAvaliadores).where(eq(evalAvaliadores.id, av.evaluatorId));
          evaluatorDisplayName = evaluator?.nome || "N/A";
        }
        let obraNome = "";
        if (av.obraId) {
          const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, av.obraId));
          obraNome = obra?.nome || "";
        }
        return { ...av, employee: emp || null, evaluatorDisplayName, obraNome };
      }),

    getByEmployee: protectedProcedure
      .input(z.object({ employeeId: z.number(), companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        const canView = canViewResults(ctx.user?.role);

        const avaliacoes = await db.select().from(evalAvaliacoes)
          .where(and(eq(evalAvaliacoes.employeeId, input.employeeId), eq(evalAvaliacoes.companyId, input.companyId)))
          .orderBy(desc(evalAvaliacoes.createdAt));

        const enriched = [];
        for (const av of avaliacoes) {
          let evaluatorDisplayName = av.evaluatorName || "N/A";
          if (!av.evaluatorName) {
            const [evaluator] = await db.select({ nome: evalAvaliadores.nome }).from(evalAvaliadores).where(eq(evalAvaliadores.id, av.evaluatorId));
            evaluatorDisplayName = evaluator?.nome || "N/A";
          }

          if (canView) {
            enriched.push({ ...av, evaluatorName: evaluatorDisplayName });
          } else {
            // Ocultar notas para quem não tem permissão
            enriched.push({
              id: av.id, companyId: av.companyId, employeeId: av.employeeId,
              mesReferencia: av.mesReferencia, createdAt: av.createdAt,
              evaluatorName: evaluatorDisplayName,
              mediaGeral: null, mediaPilar1: null, mediaPilar2: null, mediaPilar3: null,
              recomendacao: "AVALIAÇÃO REGISTRADA", _hidden: true,
            });
          }
        }
        return enriched;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!canViewResults(ctx.user?.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas RH/ADM podem excluir avaliações." });
        }
        await db.delete(evalScores).where(eq(evalScores.evaluationId, input.id));
        await db.delete(evalAvaliacoes).where(eq(evalAvaliacoes.id, input.id));
        return { success: true };
      }),

    generateAiSummary: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas RH/ADM podem gerar resumos." });
        }
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
  // DASHBOARD & RANKING (apenas para roles com permissão)
  // ============================================================
  dashboard: router({
    globalStats: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        const [totalAvaliacoes] = await db.select({ count: count() }).from(evalAvaliacoes).where(eq(evalAvaliacoes.companyId, input.companyId));
        const [totalAvaliadores] = await db.select({ count: count() }).from(evalAvaliadores).where(eq(evalAvaliadores.companyId, input.companyId));

        // Contar pesquisas ativas
        const [totalPesquisas] = await db.select({ count: count() }).from(evalSurveys).where(eq(evalSurveys.companyId, input.companyId));
        const [totalClima] = await db.select({ count: count() }).from(evalClimateSurveys).where(eq(evalClimateSurveys.companyId, input.companyId));

        const canView = canViewResults(ctx.user?.role);

        if (!canView) {
          return {
            totalAvaliacoes: totalAvaliacoes?.count || 0,
            totalAvaliadores: totalAvaliadores?.count || 0,
            totalPesquisas: (totalPesquisas?.count || 0) + (totalClima?.count || 0),
            mediaGeral: 0,
            porMes: [],
            porRecomendacao: [],
            _restricted: true,
          };
        }

        const [mediaGeralResult] = await db.select({ avg: avg(evalAvaliacoes.mediaGeral) }).from(evalAvaliacoes).where(eq(evalAvaliacoes.companyId, input.companyId));

        const porMes = await db.select({
          mes: evalAvaliacoes.mesReferencia,
          count: count(),
          media: avg(evalAvaliacoes.mediaGeral),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.mesReferencia)
          .orderBy(desc(evalAvaliacoes.mesReferencia))
          .limit(6);

        const porRecomendacao = await db.select({
          recomendacao: evalAvaliacoes.recomendacao,
          count: count(),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.recomendacao);

        return {
          totalAvaliacoes: totalAvaliacoes?.count || 0,
          totalAvaliadores: totalAvaliadores?.count || 0,
          totalPesquisas: (totalPesquisas?.count || 0) + (totalClima?.count || 0),
          mediaGeral: mediaGeralResult?.avg ? parseFloat(String(mediaGeralResult.avg)) : 0,
          porMes: porMes.reverse(),
          porRecomendacao,
          _restricted: false,
        };
      }),

    employeeRanking: protectedProcedure
      .input(z.object({ companyId: z.number(), limit: z.number().default(20) }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) {
          return [];
        }
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
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return [];
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
          // Tentar buscar nome do avaliador de eval_avaliadores ou de users
          const [ev] = await db.select({ nome: evalAvaliadores.nome }).from(evalAvaliadores).where(eq(evalAvaliadores.id, r.evaluatorId));
          let name = ev?.nome;
          if (!name) {
            const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.evaluatorId));
            name = u?.name || "N/A";
          }
          enriched.push({
            ...r,
            evaluatorName: name || "N/A",
            avgDuration: r.avgDuration ? Math.round(parseFloat(String(r.avgDuration))) : 0,
          });
        }
        return enriched;
      }),

    // Comparativo por pilar e critério
    pillarComparison: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return null;
        const db = await getDb();
        const result = await db.select({
          comportamento: avg(evalAvaliacoes.comportamento),
          pontualidade: avg(evalAvaliacoes.pontualidade),
          assiduidade: avg(evalAvaliacoes.assiduidade),
          segurancaEpis: avg(evalAvaliacoes.segurancaEpis),
          qualidadeAcabamento: avg(evalAvaliacoes.qualidadeAcabamento),
          produtividadeRitmo: avg(evalAvaliacoes.produtividadeRitmo),
          cuidadoFerramentas: avg(evalAvaliacoes.cuidadoFerramentas),
          economiaMateriais: avg(evalAvaliacoes.economiaMateriais),
          trabalhoEquipe: avg(evalAvaliacoes.trabalhoEquipe),
          iniciativaProatividade: avg(evalAvaliacoes.iniciativaProatividade),
          disponibilidadeFlexibilidade: avg(evalAvaliacoes.disponibilidadeFlexibilidade),
          organizacaoLimpeza: avg(evalAvaliacoes.organizacaoLimpeza),
        }).from(evalAvaliacoes).where(eq(evalAvaliacoes.companyId, input.companyId));
        if (!result[0]) return null;
        const r = result[0];
        const parse = (v: any) => v ? parseFloat(String(v)) : 0;
        const labels = ["Comportamento","Pontualidade","Assiduidade","Segurança/EPIs","Qualidade","Produtividade","Cuidado Ferramentas","Economia Materiais","Trabalho Equipe","Iniciativa","Disponibilidade","Organização"];
        const values = [parse(r.comportamento),parse(r.pontualidade),parse(r.assiduidade),parse(r.segurancaEpis),parse(r.qualidadeAcabamento),parse(r.produtividadeRitmo),parse(r.cuidadoFerramentas),parse(r.economiaMateriais),parse(r.trabalhoEquipe),parse(r.iniciativaProatividade),parse(r.disponibilidadeFlexibilidade),parse(r.organizacaoLimpeza)];
        const p1 = (values[0]+values[1]+values[2]+values[3])/4;
        const p2 = (values[4]+values[5]+values[6]+values[7])/4;
        const p3 = (values[8]+values[9]+values[10]+values[11])/4;
        return { labels, values, pilares: { posturaDisciplina: { label: "Postura e Disciplina", media: p1 }, desempenhoTecnico: { label: "Desempenho Técnico", media: p2 }, atitudeCrescimento: { label: "Atitude e Crescimento", media: p3 } } };
      }),

    // Comparativo por obra
    byObra: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return [];
        const db = await getDb();
        const results = await db.select({
          obraId: evalAvaliacoes.obraId,
          media: avg(evalAvaliacoes.mediaGeral),
          total: count(),
        }).from(evalAvaliacoes)
          .where(and(eq(evalAvaliacoes.companyId, input.companyId), sql`${evalAvaliacoes.obraId} IS NOT NULL`))
          .groupBy(evalAvaliacoes.obraId)
          .orderBy(desc(avg(evalAvaliacoes.mediaGeral)));
        const enriched = [];
        for (const r of results) {
          if (!r.obraId) continue;
          const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, r.obraId));
          enriched.push({ obraId: r.obraId, obraNome: obra?.nome || "Sem nome", media: r.media ? parseFloat(String(r.media)) : 0, total: r.total });
        }
        return enriched;
      }),

    // Evolução mensal com pilares
    monthlyEvolution: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return [];
        const db = await getDb();
        return db.select({
          mes: evalAvaliacoes.mesReferencia,
          total: count(),
          media: avg(evalAvaliacoes.mediaGeral),
          mediaPilar1: avg(evalAvaliacoes.mediaPilar1),
          mediaPilar2: avg(evalAvaliacoes.mediaPilar2),
          mediaPilar3: avg(evalAvaliacoes.mediaPilar3),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.mesReferencia)
          .orderBy(asc(evalAvaliacoes.mesReferencia))
          .limit(12);
      }),

    // Clima organizacional consolidado
    climaConsolidated: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return null;
        const db = await getDb();
        const surveys = await db.select().from(evalClimateSurveys)
          .where(eq(evalClimateSurveys.companyId, input.companyId));
        if (!surveys.length) return null;
        const surveyIds = surveys.map(s => s.id);
        const questions = await db.select().from(evalClimateQuestions)
          .where(inArray(evalClimateQuestions.surveyId, surveyIds));
        const questionIds = questions.map(q => q.id);
        if (!questionIds.length) return { totalSurveys: surveys.length, totalRespondentes: 0, totalPerguntas: 0, indiceGeral: 0, byCategory: [] };
        const answers = await db.select().from(evalClimateAnswers)
          .where(inArray(evalClimateAnswers.questionId, questionIds));
        const responseIds = Array.from(new Set(answers.map(a => a.responseId)));
        const catMap: Record<string, { total: number; count: number; label: string }> = {};
        const CATS: Record<string, string> = { empresa: "Empresa", gestor: "Gestão/Liderança", ambiente: "Ambiente de Trabalho", seguranca: "Segurança", crescimento: "Crescimento", recomendacao: "Recomendação" };
        for (const a of answers) {
          const q = questions.find(q => q.id === a.questionId);
          const nota = a.valor ? parseFloat(a.valor) : 0;
          if (!q || !nota) continue;
          const cat = q.categoria || "outro";
          if (!catMap[cat]) catMap[cat] = { total: 0, count: 0, label: CATS[cat] || cat };
          catMap[cat].total += nota;
          catMap[cat].count++;
        }
        const byCategory = Object.entries(catMap).map(([key, val]) => ({ key, label: val.label, media: val.count > 0 ? val.total / val.count : 0, totalRespostas: val.count }));
        const allNotes = answers.filter(a => a.valor).map(a => parseFloat(a.valor!)).filter(n => !isNaN(n) && n > 0);
        const indiceGeral = allNotes.length > 0 ? allNotes.reduce((a, b) => a + b, 0) / allNotes.length : 0;
        return { totalSurveys: surveys.length, totalRespondentes: responseIds.length, totalPerguntas: questions.length, indiceGeral, byCategory };
      }),

    // Top e Bottom funcionários
    topBottomEmployees: protectedProcedure
      .input(z.object({ companyId: z.number(), limit: z.number().default(5) }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return { top: [], bottom: [] };
        const db = await getDb();
        const all = await db.select({
          employeeId: evalAvaliacoes.employeeId,
          mediaGeral: avg(evalAvaliacoes.mediaGeral),
          mediaPilar1: avg(evalAvaliacoes.mediaPilar1),
          mediaPilar2: avg(evalAvaliacoes.mediaPilar2),
          mediaPilar3: avg(evalAvaliacoes.mediaPilar3),
          total: count(),
        }).from(evalAvaliacoes)
          .where(eq(evalAvaliacoes.companyId, input.companyId))
          .groupBy(evalAvaliacoes.employeeId);
        const enriched = [];
        for (const r of all) {
          const [emp] = await db.select({ nome: employees.nomeCompleto, funcao: employees.funcao, setor: employees.setor })
            .from(employees).where(eq(employees.id, r.employeeId));
          enriched.push({
            employeeId: r.employeeId,
            nome: emp?.nome || "N/A",
            funcao: emp?.funcao || "",
            setor: emp?.setor || "",
            mediaGeral: r.mediaGeral ? parseFloat(String(r.mediaGeral)) : 0,
            mediaPilar1: r.mediaPilar1 ? parseFloat(String(r.mediaPilar1)) : 0,
            mediaPilar2: r.mediaPilar2 ? parseFloat(String(r.mediaPilar2)) : 0,
            mediaPilar3: r.mediaPilar3 ? parseFloat(String(r.mediaPilar3)) : 0,
            total: r.total,
          });
        }
        enriched.sort((a, b) => b.mediaGeral - a.mediaGeral);
        const top = enriched.slice(0, input.limit);
        const bottom = [...enriched].sort((a, b) => a.mediaGeral - b.mediaGeral).slice(0, input.limit);
        return { top, bottom };
      }),

    // Distribuição de notas (histograma)
    scoreDistribution: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!canViewResults(ctx.user?.role)) return [];
        const db = await getDb();
        const result = await db.execute(
          sql`SELECT ROUND(mediaGeral) as nota, COUNT(*) as total FROM eval_avaliacoes WHERE companyId = ${input.companyId} GROUP BY nota ORDER BY nota`
        );
        const rows = (result as any)[0] || result;
        return (Array.isArray(rows) ? rows : []).map((d: any) => ({ nota: Number(d.nota), total: Number(d.total) }));
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
  // PESQUISAS CUSTOMIZADAS (internas/externas com IA)
  // ============================================================
  pesquisas: router({
    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        tipo: z.enum(["setor", "cliente", "outro"]).default("outro"),
        anonimo: z.boolean().default(false),
        isEvaluation: z.boolean().default(false),
        allowEmployeeSelection: z.boolean().default(true),
        obraId: z.number().optional(),
        questions: z.array(z.object({
          texto: z.string(),
          tipo: z.enum(["nota", "texto", "sim_nao"]).default("nota"),
          ordem: z.number(),
          obrigatoria: z.boolean().default(true),
        })),
        evaluatorIds: z.array(z.number()).optional(), // IDs dos usuários avaliadores
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const { questions, evaluatorIds, ...surveyData } = input;
        const publicToken = generateToken();
        const [survey] = await db.insert(evalSurveys).values({
          ...surveyData,
          anonimo: input.anonimo ? 1 : 0,
          isEvaluation: input.isEvaluation ? 1 : 0,
          allowEmployeeSelection: input.allowEmployeeSelection ? 1 : 0,
          publicToken,
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
        // Vincular avaliadores se fornecidos
        if (evaluatorIds && evaluatorIds.length > 0) {
          for (const evId of evaluatorIds) {
            await db.insert(evalSurveyEvaluators).values({
              surveyId: survey.insertId,
              evaluatorId: evId,
            });
          }
        }
        return { id: survey.insertId, publicToken };
      }),

    list: protectedProcedure
      .input(z.object({ companyId: z.number(), isEvaluation: z.boolean().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const conditions = [eq(evalSurveys.companyId, input.companyId)];
        if (input.isEvaluation !== undefined) {
          conditions.push(eq(evalSurveys.isEvaluation, input.isEvaluation ? 1 : 0));
        }
        const surveys = await db.select().from(evalSurveys)
          .where(and(...conditions))
          .orderBy(desc(evalSurveys.createdAt));
        const enriched = [];
        for (const s of surveys) {
          const [respCount] = await db.select({ count: count() }).from(evalSurveyResponses).where(eq(evalSurveyResponses.surveyId, s.id));
          const [qCount] = await db.select({ count: count() }).from(evalSurveyQuestions).where(eq(evalSurveyQuestions.surveyId, s.id));
          // Buscar avaliadores vinculados
          const evaluators = await db.select({
            id: evalSurveyEvaluators.evaluatorId,
          }).from(evalSurveyEvaluators).where(eq(evalSurveyEvaluators.surveyId, s.id));
          const evaluatorNames: string[] = [];
          for (const ev of evaluators) {
            const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, ev.id));
            if (u && u.name) evaluatorNames.push(u.name);
          }
          enriched.push({ ...s, totalRespostas: respCount?.count || 0, totalPerguntas: qCount?.count || 0, evaluatorIds: evaluators.map(e => e.id), evaluatorNames });
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

    // Acesso público via token
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [survey] = await db.select().from(evalSurveys).where(eq(evalSurveys.publicToken, input.token));
        if (!survey || survey.status !== "ativa") return null;
        const questions = await db.select().from(evalSurveyQuestions)
          .where(eq(evalSurveyQuestions.surveyId, survey.id))
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
        employeeId: z.number().optional(), // funcionário avaliado (quando isEvaluation)
        evaluatorUserId: z.number().optional(), // usuário avaliador
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
          employeeId: input.employeeId || null,
          evaluatorUserId: input.evaluatorUserId || null,
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
        // Enriquecer respostas com nome do funcionário e avaliador
        const enrichedResponses = [];
        for (const r of responses) {
          let employeeName = null;
          let evaluatorName = r.respondentName;
          if (r.employeeId) {
            const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, r.employeeId));
            employeeName = emp?.nome || null;
          }
          if (r.evaluatorUserId) {
            const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.evaluatorUserId));
            evaluatorName = u?.name || evaluatorName;
          }
          enrichedResponses.push({ ...r, employeeName, evaluatorName });
        }
        const results = [];
        for (const q of questions) {
          const answers = await db.select().from(evalSurveyAnswers)
            .where(eq(evalSurveyAnswers.questionId, q.id));
          let avgNota = 0;
          if (q.tipo === "nota" && answers.length > 0) {
            const nums = answers.map(a => parseFloat(a.valor || "0")).filter(n => n > 0);
            avgNota = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          }
          results.push({ question: q, answers, totalRespostas: answers.length, avgNota });
        }
        return { totalRespondentes: responses.length, responses: enrichedResponses, results };
      }),

    // Gerenciar avaliadores de uma pesquisa/avaliação
    addEvaluators: protectedProcedure
      .input(z.object({ surveyId: z.number(), userIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        for (const userId of input.userIds) {
          // Verificar se já existe
          const [existing] = await db.select().from(evalSurveyEvaluators)
            .where(and(eq(evalSurveyEvaluators.surveyId, input.surveyId), eq(evalSurveyEvaluators.evaluatorId, userId)));
          if (!existing) {
            await db.insert(evalSurveyEvaluators).values({ surveyId: input.surveyId, evaluatorId: userId });
          }
        }
        return { success: true };
      }),

    removeEvaluator: protectedProcedure
      .input(z.object({ surveyId: z.number(), userId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.delete(evalSurveyEvaluators)
          .where(and(eq(evalSurveyEvaluators.surveyId, input.surveyId), eq(evalSurveyEvaluators.evaluatorId, input.userId)));
        return { success: true };
      }),

    // Listar avaliadores de uma pesquisa
    getEvaluators: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const evaluators = await db.select().from(evalSurveyEvaluators)
          .where(eq(evalSurveyEvaluators.surveyId, input.surveyId));
        const enriched = [];
        for (const ev of evaluators) {
          const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, ev.evaluatorId));
          if (u) enriched.push(u);
        }
        return enriched;
      }),

    // Respostas de avaliação por funcionário (para dashboard)
    getEvaluationByEmployee: protectedProcedure
      .input(z.object({ surveyId: z.number(), employeeId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const responses = await db.select().from(evalSurveyResponses)
          .where(and(
            eq(evalSurveyResponses.surveyId, input.surveyId),
            eq(evalSurveyResponses.employeeId, input.employeeId)
          ));
        if (responses.length === 0) return null;
        const allAnswers = [];
        for (const r of responses) {
          const answers = await db.select().from(evalSurveyAnswers)
            .where(eq(evalSurveyAnswers.responseId, r.id));
          let evaluatorName = r.respondentName;
          if (r.evaluatorUserId) {
            const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.evaluatorUserId));
            evaluatorName = u?.name || evaluatorName;
          }
          allAnswers.push({ response: { ...r, evaluatorName }, answers });
        }
        return allAnswers;
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

    // IA sugere perguntas baseadas no tema
    suggestQuestions: protectedProcedure
      .input(z.object({ tema: z.string().min(1), tipo: z.enum(["setor", "cliente", "outro"]).default("outro") }))
      .mutation(async ({ input }) => {
        const isAvaliacao = input.tipo === "outro";
        const tipoLabel = input.tipo === "setor" ? "pesquisa interna de satisfação por setor" :
          input.tipo === "cliente" ? "pesquisa de satisfação de clientes" : "avaliação de desempenho de colaborador";

        const systemPrompt = isAvaliacao
          ? `Você é um especialista em Recursos Humanos e Avaliação de Desempenho para empresas de construção civil e engenharia. Gere perguntas abrangentes para avaliar TODOS os aspectos de um colaborador. Responda APENAS em JSON válido.`
          : `Você é um especialista em pesquisas organizacionais e de satisfação. Gere perguntas para uma ${tipoLabel}. Responda APENAS em JSON válido.`;

        const userPrompt = isAvaliacao
          ? `Gere 15 perguntas completas para uma avaliação de desempenho sobre o tema: "${input.tema}".

As perguntas devem cobrir TODOS estes aspectos do colaborador:
- Postura e Disciplina (comportamento, pontualidade, assiduidade)
- Segurança do Trabalho (uso de EPIs, cumprimento de normas, atenção a riscos)
- Competência Técnica (qualidade do trabalho, conhecimento técnico, produtividade)
- Trabalho em Equipe (colaboração, comunicação, relacionamento interpessoal)
- Proatividade e Iniciativa (disposição, resolução de problemas, sugestões de melhoria)
- Liderança e Responsabilidade (comprometimento, organização, capacidade de liderar)
- Adaptabilidade (flexibilidade, aprendizado, reação a mudanças)

Retorne um JSON com a seguinte estrutura:
{
  "perguntas": [
    { "texto": "...", "tipo": "nota", "obrigatoria": true },
    { "texto": "...", "tipo": "texto", "obrigatoria": false },
    { "texto": "...", "tipo": "sim_nao", "obrigatoria": true }
  ]
}

Tipos disponíveis: "nota" (escala 1 a 5), "texto" (resposta livre), "sim_nao".
Use majoritariamente tipo "nota" (pelo menos 12 perguntas), com 2 perguntas tipo "texto" para observações e 1 tipo "sim_nao".
As perguntas devem ser claras, objetivas e específicas para o contexto de construção civil e engenharia.`
          : `Gere 8 perguntas para uma pesquisa sobre o tema: "${input.tema}".

Retorne um JSON com a seguinte estrutura:
{
  "perguntas": [
    { "texto": "...", "tipo": "nota", "obrigatoria": true },
    { "texto": "...", "tipo": "texto", "obrigatoria": false },
    { "texto": "...", "tipo": "sim_nao", "obrigatoria": true }
  ]
}

Tipos disponíveis: "nota" (1 a 5), "texto" (resposta livre), "sim_nao".
Inclua uma mistura de tipos. As perguntas devem ser objetivas e relevantes para o contexto de construção civil e engenharia.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "survey_questions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  perguntas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        texto: { type: "string" },
                        tipo: { type: "string", enum: ["nota", "texto", "sim_nao"] },
                        obrigatoria: { type: "boolean" },
                      },
                      required: ["texto", "tipo", "obrigatoria"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["perguntas"],
                additionalProperties: false,
              },
            },
          },
        });

        try {
          const content = String(response.choices[0]?.message?.content || "{}");
          const parsed = JSON.parse(content);
          return { questions: parsed.perguntas || [] };
        } catch {
          return { questions: [] };
        }
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
        const publicToken = generateToken();
        const [survey] = await db.insert(evalClimateSurveys).values({ ...data, publicToken });
        for (const q of questions) {
          await db.insert(evalClimateQuestions).values({ surveyId: survey.insertId, ...q });
        }
        return { id: survey.insertId, publicToken };
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
          const [qCount] = await db.select({ count: count() }).from(evalClimateQuestions).where(eq(evalClimateQuestions.surveyId, s.id));
          enriched.push({ ...s, totalRespostas: respCount?.count || 0, totalPerguntas: qCount?.count || 0 });
        }
        return enriched;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [survey] = await db.select().from(evalClimateSurveys).where(eq(evalClimateSurveys.id, input.id));
        if (!survey) return null;
        const questions = await db.select().from(evalClimateQuestions)
          .where(eq(evalClimateQuestions.surveyId, input.id))
          .orderBy(evalClimateQuestions.ordem);
        return { ...survey, questions };
      }),

    getPublicSurvey: publicProcedure
      .input(z.object({ id: z.number().optional(), token: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        let survey;
        if (input.token) {
          [survey] = await db.select().from(evalClimateSurveys).where(eq(evalClimateSurveys.publicToken, input.token));
        } else if (input.id) {
          [survey] = await db.select().from(evalClimateSurveys).where(eq(evalClimateSurveys.id, input.id));
        }
        if (!survey || survey.status !== "ativa") return null;
        const questions = await db.select().from(evalClimateQuestions)
          .where(eq(evalClimateQuestions.surveyId, survey.id))
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
          let avgNota = 0;
          if (q.tipo === "nota" && answers.length > 0) {
            const nums = answers.map(a => parseFloat(a.valor || "0")).filter(n => n > 0);
            avgNota = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          }
          if (!byCategory[q.categoria]) byCategory[q.categoria] = [];
          byCategory[q.categoria].push({ question: q, answers, totalRespostas: answers.length, avgNota });
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

    deleteSurvey: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        const responses = await db.select({ id: evalClimateResponses.id }).from(evalClimateResponses).where(eq(evalClimateResponses.surveyId, input.id));
        if (responses.length > 0) {
          const respIds = responses.map(r => r.id);
          await db.delete(evalClimateAnswers).where(inArray(evalClimateAnswers.responseId, respIds));
        }
        await db.delete(evalClimateResponses).where(eq(evalClimateResponses.surveyId, input.id));
        await db.delete(evalClimateQuestions).where(eq(evalClimateQuestions.surveyId, input.id));
        await db.delete(evalClimateSurveys).where(eq(evalClimateSurveys.id, input.id));
        return { success: true };
      }),

    // IA sugere perguntas de clima
    suggestClimateQuestions: protectedProcedure
      .input(z.object({ tema: z.string().optional() }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em pesquisas de clima organizacional para empresas de construção civil. Gere perguntas distribuídas em 6 categorias. Responda APENAS em JSON válido." },
            { role: "user", content: `Gere perguntas para uma pesquisa de clima organizacional${input.tema ? ` com foco em: "${input.tema}"` : ""}.

Retorne um JSON com a seguinte estrutura:
{
  "perguntas": [
    { "texto": "...", "categoria": "empresa", "tipo": "nota" },
    { "texto": "...", "categoria": "gestor", "tipo": "nota" },
    { "texto": "...", "categoria": "ambiente", "tipo": "nota" },
    { "texto": "...", "categoria": "seguranca", "tipo": "nota" },
    { "texto": "...", "categoria": "crescimento", "tipo": "nota" },
    { "texto": "...", "categoria": "recomendacao", "tipo": "sim_nao" }
  ]
}

Categorias: empresa, gestor, ambiente, seguranca, crescimento, recomendacao.
Tipos: "nota" (1 a 5), "texto" (resposta livre), "sim_nao".
Gere 2-3 perguntas por categoria (total ~15 perguntas). Contexto: empresa de construção civil e engenharia.` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "climate_questions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  perguntas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        texto: { type: "string" },
                        categoria: { type: "string", enum: ["empresa", "gestor", "ambiente", "seguranca", "crescimento", "recomendacao"] },
                        tipo: { type: "string", enum: ["nota", "texto", "sim_nao"] },
                      },
                      required: ["texto", "categoria", "tipo"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["perguntas"],
                additionalProperties: false,
              },
            },
          },
        });

        try {
          const content = String(response.choices[0]?.message?.content || "{}");
          const parsed = JSON.parse(content);
          return { questions: parsed.perguntas || [] };
        } catch {
          return { questions: [] };
        }
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
          const token = generateToken();
          await db.insert(evalClimateExternalTokens).values({
            surveyId: input.surveyId,
            participantId: pid,
            token,
          });
          tokens.push({ participantId: pid, token });
        }
        return tokens;
      }),
  }),

  // ============================================================
  // OBRAS (para o campo de seleção de obra na avaliação)
  // ============================================================
  obras: router({
    listActive: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo, status: obras.status })
          .from(obras)
          .where(and(
            eq(obras.companyId, input.companyId),
            eq(obras.isActive, 1),
            isNull(obras.deletedAt),
          ))
          .orderBy(obras.nome);
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
