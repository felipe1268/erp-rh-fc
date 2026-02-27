import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb as _getDb } from "../db";
import {
  avaliacaoQuestionarios,
  avaliacaoPerguntas,
  avaliacaoCiclos,
  avaliacoes,
  avaliacaoRespostas,
  avaliacaoAvaliadores,
  avaliacaoConfig,
  employees,
} from "../../drizzle/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

async function getDb() {
  const db = await _getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
  return db;
}

export const avaliacaoRouter = router({
  // ============================================================
  // QUESTIONÁRIOS
  // ============================================================
  questionarios: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return db.select().from(avaliacaoQuestionarios)
          .where(eq(avaliacaoQuestionarios.companyId, input.companyId))
          .orderBy(desc(avaliacaoQuestionarios.createdAt));
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [q] = await db.select().from(avaliacaoQuestionarios)
          .where(eq(avaliacaoQuestionarios.id, input.id));
        if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Questionário não encontrado" });

        const perguntas = await db.select().from(avaliacaoPerguntas)
          .where(eq(avaliacaoPerguntas.questionarioId, input.id))
          .orderBy(asc(avaliacaoPerguntas.ordem));

        return { ...q, perguntas };
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        frequencia: z.enum(["diaria", "semanal", "mensal", "trimestral", "semestral", "anual"]).default("mensal"),
        perguntas: z.array(z.object({
          texto: z.string().min(1),
          tipo: z.enum(["nota_1_5", "nota_1_10", "sim_nao", "texto_livre"]).default("nota_1_5"),
          peso: z.number().default(1),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const [result] = await db.insert(avaliacaoQuestionarios).values({
          companyId: input.companyId,
          titulo: input.titulo,
          descricao: input.descricao || null,
          frequencia: input.frequencia,
          criadoPor: ctx.user.id,
        });
        const questionarioId = result.insertId;

        // Inserir perguntas
        if (input.perguntas.length > 0) {
          await db.insert(avaliacaoPerguntas).values(
            input.perguntas.map((p, idx) => ({
              questionarioId,
              texto: p.texto,
              tipo: p.tipo,
              peso: p.peso,
              ordem: idx + 1,
            }))
          );
        }

        return { id: questionarioId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        frequencia: z.enum(["diaria", "semanal", "mensal", "trimestral", "semestral", "anual"]),
        perguntas: z.array(z.object({
          id: z.number().optional(), // se existente
          texto: z.string().min(1),
          tipo: z.enum(["nota_1_5", "nota_1_10", "sim_nao", "texto_livre"]),
          peso: z.number().default(1),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.update(avaliacaoQuestionarios)
          .set({
            titulo: input.titulo,
            descricao: input.descricao || null,
            frequencia: input.frequencia,
          })
          .where(eq(avaliacaoQuestionarios.id, input.id));

        // Recriar perguntas (delete + insert)
        await db.delete(avaliacaoPerguntas)
          .where(eq(avaliacaoPerguntas.questionarioId, input.id));

        if (input.perguntas.length > 0) {
          await db.insert(avaliacaoPerguntas).values(
            input.perguntas.map((p, idx) => ({
              questionarioId: input.id,
              texto: p.texto,
              tipo: p.tipo,
              peso: p.peso,
              ordem: idx + 1,
            }))
          );
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Verificar se tem ciclos vinculados
        const ciclos = await db.select().from(avaliacaoCiclos)
          .where(eq(avaliacaoCiclos.questionarioId, input.id));
        if (ciclos.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível excluir: existem ciclos vinculados a este questionário." });
        }
        await db.delete(avaliacaoPerguntas).where(eq(avaliacaoPerguntas.questionarioId, input.id));
        await db.delete(avaliacaoQuestionarios).where(eq(avaliacaoQuestionarios.id, input.id));
        return { success: true };
      }),

    toggleAtivo: protectedProcedure
      .input(z.object({ id: z.number(), ativo: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.update(avaliacaoQuestionarios)
          .set({ ativo: input.ativo ? 1 : 0 })
          .where(eq(avaliacaoQuestionarios.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // CICLOS DE AVALIAÇÃO
  // ============================================================
  ciclos: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const ciclos = await db.select().from(avaliacaoCiclos)
          .where(eq(avaliacaoCiclos.companyId, input.companyId))
          .orderBy(desc(avaliacaoCiclos.createdAt));

        // Para cada ciclo, contar avaliações
        const result = [];
        for (const ciclo of ciclos) {
          const [stats] = await db.select({
            total: sql<number>`COUNT(*)`,
            finalizadas: sql<number>`SUM(CASE WHEN status = 'finalizada' THEN 1 ELSE 0 END)`,
            pendentes: sql<number>`SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END)`,
            emAndamento: sql<number>`SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END)`,
          }).from(avaliacoes).where(eq(avaliacoes.cicloId, ciclo.id));

          // Buscar nome do questionário
          const [q] = await db.select({ titulo: avaliacaoQuestionarios.titulo })
            .from(avaliacaoQuestionarios)
            .where(eq(avaliacaoQuestionarios.id, ciclo.questionarioId));

          result.push({
            ...ciclo,
            questionarioTitulo: q?.titulo || "—",
            stats: {
              total: Number(stats?.total || 0),
              finalizadas: Number(stats?.finalizadas || 0),
              pendentes: Number(stats?.pendentes || 0),
              emAndamento: Number(stats?.emAndamento || 0),
            },
          });
        }
        return result;
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        questionarioId: z.number(),
        titulo: z.string().min(1),
        dataInicio: z.string(),
        dataFim: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const [result] = await db.insert(avaliacaoCiclos).values({
          companyId: input.companyId,
          questionarioId: input.questionarioId,
          titulo: input.titulo,
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          criadoPor: ctx.user.id,
        });
        return { id: result.insertId };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["rascunho", "aberto", "fechado"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await db.update(avaliacaoCiclos)
          .set({ status: input.status })
          .where(eq(avaliacaoCiclos.id, input.id));

        // Se abrir o ciclo, criar avaliações pendentes para todos os funcionários ativos
        if (input.status === "aberto") {
          const [ciclo] = await db.select().from(avaliacaoCiclos)
            .where(eq(avaliacaoCiclos.id, input.id));
          if (!ciclo) return { success: true };

          // Buscar funcionários ativos da empresa
          const funcs = await db.select({ id: employees.id })
            .from(employees)
            .where(and(
              eq(employees.companyId, ciclo.companyId),
              eq(employees.status, "Ativo"),
            ));

          // Verificar quais já têm avaliação neste ciclo
          const existentes = await db.select({ employeeId: avaliacoes.employeeId })
            .from(avaliacoes)
            .where(eq(avaliacoes.cicloId, input.id));
          const existentesSet = new Set(existentes.map(e => e.employeeId));

          // Criar avaliações pendentes para os que não têm
          const novos = funcs.filter(f => !existentesSet.has(f.id));
          if (novos.length > 0) {
            // Buscar avaliadores vinculados
            const avaliadores = await db.select().from(avaliacaoAvaliadores)
              .where(and(
                eq(avaliacaoAvaliadores.companyId, ciclo.companyId),
                eq(avaliacaoAvaliadores.ativo, 1),
              ));
            const avaliadorMap = new Map<number, number>();
            for (const a of avaliadores) {
              avaliadorMap.set(a.employeeId, a.avaliadorUserId);
            }

            await db.insert(avaliacoes).values(
              novos.map(f => ({
                cicloId: input.id,
                companyId: ciclo.companyId,
                employeeId: f.id,
                avaliadorId: avaliadorMap.get(f.id) || ciclo.criadoPor,
                status: "pendente" as const,
              }))
            );
          }
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Deletar respostas das avaliações deste ciclo
        const avs = await db.select({ id: avaliacoes.id }).from(avaliacoes)
          .where(eq(avaliacoes.cicloId, input.id));
        if (avs.length > 0) {
          const avIds = avs.map(a => a.id);
          await db.delete(avaliacaoRespostas).where(inArray(avaliacaoRespostas.avaliacaoId, avIds));
        }
        await db.delete(avaliacoes).where(eq(avaliacoes.cicloId, input.id));
        await db.delete(avaliacaoCiclos).where(eq(avaliacaoCiclos.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // AVALIAÇÕES
  // ============================================================
  avaliacoes: router({
    listByCiclo: protectedProcedure
      .input(z.object({ cicloId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const avs = await db.select({
          id: avaliacoes.id,
          cicloId: avaliacoes.cicloId,
          companyId: avaliacoes.companyId,
          employeeId: avaliacoes.employeeId,
          avaliadorId: avaliacoes.avaliadorId,
          avaliadorNome: avaliacoes.avaliadorNome,
          status: avaliacoes.status,
          notaFinal: avaliacoes.notaFinal,
          observacoes: avaliacoes.observacoes,
          tempoAvaliacao: avaliacoes.tempoAvaliacao,
          finalizadaEm: avaliacoes.finalizadaEm,
          createdAt: avaliacoes.createdAt,
          nome: employees.nomeCompleto,
          funcao: employees.funcao,
          setor: employees.setor,
        })
          .from(avaliacoes)
          .leftJoin(employees, eq(avaliacoes.employeeId, employees.id))
          .where(eq(avaliacoes.cicloId, input.cicloId))
          .orderBy(asc(employees.nomeCompleto));
        return avs;
      }),

    // Minhas avaliações pendentes (para avaliador)
    minhasPendentes: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        const avs = await db.select({
          id: avaliacoes.id,
          cicloId: avaliacoes.cicloId,
          employeeId: avaliacoes.employeeId,
          status: avaliacoes.status,
          nome: employees.nomeCompleto,
          funcao: employees.funcao,
          setor: employees.setor,
        })
          .from(avaliacoes)
          .leftJoin(employees, eq(avaliacoes.employeeId, employees.id))
          .where(and(
            eq(avaliacoes.companyId, input.companyId),
            eq(avaliacoes.avaliadorId, ctx.user.id),
            sql`${avaliacoes.status} != 'finalizada'`,
          ))
          .orderBy(asc(employees.nomeCompleto));
        return avs;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const [av] = await db.select({
          id: avaliacoes.id,
          cicloId: avaliacoes.cicloId,
          companyId: avaliacoes.companyId,
          employeeId: avaliacoes.employeeId,
          avaliadorId: avaliacoes.avaliadorId,
          avaliadorNome: avaliacoes.avaliadorNome,
          status: avaliacoes.status,
          notaFinal: avaliacoes.notaFinal,
          observacoes: avaliacoes.observacoes,
          tempoAvaliacao: avaliacoes.tempoAvaliacao,
          finalizadaEm: avaliacoes.finalizadaEm,
          nome: employees.nomeCompleto,
          funcao: employees.funcao,
          setor: employees.setor,
        })
          .from(avaliacoes)
          .leftJoin(employees, eq(avaliacoes.employeeId, employees.id))
          .where(eq(avaliacoes.id, input.id));
        if (!av) throw new TRPCError({ code: "NOT_FOUND" });

        // Buscar ciclo e questionário
        const [ciclo] = await db.select().from(avaliacaoCiclos)
          .where(eq(avaliacaoCiclos.id, av.cicloId));

        const perguntas = ciclo ? await db.select().from(avaliacaoPerguntas)
          .where(eq(avaliacaoPerguntas.questionarioId, ciclo.questionarioId))
          .orderBy(asc(avaliacaoPerguntas.ordem)) : [];

        // Buscar respostas existentes
        const respostas = await db.select().from(avaliacaoRespostas)
          .where(eq(avaliacaoRespostas.avaliacaoId, input.id));

        return { ...av, ciclo, perguntas, respostas };
      }),

    salvarRespostas: protectedProcedure
      .input(z.object({
        avaliacaoId: z.number(),
        respostas: z.array(z.object({
          perguntaId: z.number(),
          valor: z.string().optional(),
          textoLivre: z.string().optional(),
        })),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();

        // Verificar se avaliação não está finalizada
        const [av] = await db.select().from(avaliacoes)
          .where(eq(avaliacoes.id, input.avaliacaoId));
        if (!av) throw new TRPCError({ code: "NOT_FOUND" });
        if (av.status === "finalizada") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta avaliação já foi finalizada e não pode ser alterada." });
        }

        // Deletar respostas anteriores e inserir novas
        await db.delete(avaliacaoRespostas)
          .where(eq(avaliacaoRespostas.avaliacaoId, input.avaliacaoId));

        if (input.respostas.length > 0) {
          await db.insert(avaliacaoRespostas).values(
            input.respostas.map(r => ({
              avaliacaoId: input.avaliacaoId,
              perguntaId: r.perguntaId,
              valor: r.valor || null,
              textoLivre: r.textoLivre || null,
            }))
          );
        }

        // Atualizar status para em_andamento
        await db.update(avaliacoes)
          .set({
            status: "em_andamento",
            observacoes: input.observacoes || null,
            avaliadorNome: ctx.user.name || null,
          })
          .where(eq(avaliacoes.id, input.avaliacaoId));

        return { success: true };
      }),

    finalizar: protectedProcedure
      .input(z.object({
        avaliacaoId: z.number(),
        respostas: z.array(z.object({
          perguntaId: z.number(),
          valor: z.string().optional(),
          textoLivre: z.string().optional(),
        })),
        observacoes: z.string().optional(),
        tempoAvaliacao: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();

        const [av] = await db.select().from(avaliacoes)
          .where(eq(avaliacoes.id, input.avaliacaoId));
        if (!av) throw new TRPCError({ code: "NOT_FOUND" });
        if (av.status === "finalizada") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta avaliação já foi finalizada." });
        }

        // Salvar respostas
        await db.delete(avaliacaoRespostas)
          .where(eq(avaliacaoRespostas.avaliacaoId, input.avaliacaoId));

        if (input.respostas.length > 0) {
          await db.insert(avaliacaoRespostas).values(
            input.respostas.map(r => ({
              avaliacaoId: input.avaliacaoId,
              perguntaId: r.perguntaId,
              valor: r.valor || null,
              textoLivre: r.textoLivre || null,
            }))
          );
        }

        // Calcular nota final (média ponderada)
        const [ciclo] = await db.select().from(avaliacaoCiclos)
          .where(eq(avaliacaoCiclos.id, av.cicloId));
        let notaFinal = 0;
        if (ciclo) {
          const perguntas = await db.select().from(avaliacaoPerguntas)
            .where(eq(avaliacaoPerguntas.questionarioId, ciclo.questionarioId));

          let somaNotas = 0;
          let somaPesos = 0;
          for (const resp of input.respostas) {
            const pergunta = perguntas.find(p => p.id === resp.perguntaId);
            if (!pergunta) continue;
            const peso = pergunta.peso || 1;

            if (pergunta.tipo === "nota_1_5" || pergunta.tipo === "nota_1_10") {
              const val = parseFloat(resp.valor || "0");
              // Normalizar para escala 0-5
              const normalizado = pergunta.tipo === "nota_1_10" ? val / 2 : val;
              somaNotas += normalizado * peso;
              somaPesos += peso;
            } else if (pergunta.tipo === "sim_nao") {
              somaNotas += (resp.valor === "sim" ? 5 : 0) * peso;
              somaPesos += peso;
            }
          }
          notaFinal = somaPesos > 0 ? Math.round((somaNotas / somaPesos) * 100) / 100 : 0;
        }

        // Finalizar avaliação (TRAVAR)
        await db.update(avaliacoes)
          .set({
            status: "finalizada",
            notaFinal: String(notaFinal),
            observacoes: input.observacoes || null,
            avaliadorNome: ctx.user.name || null,
            tempoAvaliacao: input.tempoAvaliacao || null,
            finalizadaEm: sql`NOW()`,
          })
          .where(eq(avaliacoes.id, input.avaliacaoId));

        return { success: true, notaFinal };
      }),
  }),

  // ============================================================
  // AVALIADORES
  // ============================================================
  avaliadores: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return db.select().from(avaliacaoAvaliadores)
          .where(and(
            eq(avaliacaoAvaliadores.companyId, input.companyId),
            eq(avaliacaoAvaliadores.ativo, 1),
          ));
      }),

    vincular: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        avaliadorUserId: z.number(),
        employeeIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Remover vínculos anteriores deste avaliador
        await db.delete(avaliacaoAvaliadores)
          .where(and(
            eq(avaliacaoAvaliadores.companyId, input.companyId),
            eq(avaliacaoAvaliadores.avaliadorUserId, input.avaliadorUserId),
          ));

        if (input.employeeIds.length > 0) {
          await db.insert(avaliacaoAvaliadores).values(
            input.employeeIds.map(empId => ({
              companyId: input.companyId,
              avaliadorUserId: input.avaliadorUserId,
              employeeId: empId,
            }))
          );
        }

        return { success: true };
      }),
  }),

  // ============================================================
  // RANKING
  // ============================================================
  ranking: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cicloId: z.number().optional(),
      limit: z.number().default(10),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      let query = db.select({
        employeeId: avaliacoes.employeeId,
        nome: employees.nomeCompleto,
        funcao: employees.funcao,
        setor: employees.setor,
        notaFinal: avaliacoes.notaFinal,
        avaliadorNome: avaliacoes.avaliadorNome,
        finalizadaEm: avaliacoes.finalizadaEm,
      })
        .from(avaliacoes)
        .leftJoin(employees, eq(avaliacoes.employeeId, employees.id))
        .where(and(
          eq(avaliacoes.companyId, input.companyId),
          eq(avaliacoes.status, "finalizada"),
          input.cicloId ? eq(avaliacoes.cicloId, input.cicloId) : sql`1=1`,
        ))
        .orderBy(desc(avaliacoes.notaFinal))
        .limit(input.limit);

      const melhores = await query;

      // Piores
      const piores = await db.select({
        employeeId: avaliacoes.employeeId,
        nome: employees.nomeCompleto,
        funcao: employees.funcao,
        setor: employees.setor,
        notaFinal: avaliacoes.notaFinal,
        avaliadorNome: avaliacoes.avaliadorNome,
        finalizadaEm: avaliacoes.finalizadaEm,
      })
        .from(avaliacoes)
        .leftJoin(employees, eq(avaliacoes.employeeId, employees.id))
        .where(and(
          eq(avaliacoes.companyId, input.companyId),
          eq(avaliacoes.status, "finalizada"),
          input.cicloId ? eq(avaliacoes.cicloId, input.cicloId) : sql`1=1`,
        ))
        .orderBy(asc(avaliacoes.notaFinal))
        .limit(input.limit);

      return { melhores, piores };
    }),

  // ============================================================
  // ESTATÍSTICAS DO AVALIADOR
  // ============================================================
  statsAvaliador: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [stats] = await db.select({
        total: sql<number>`COUNT(*)`,
        finalizadas: sql<number>`SUM(CASE WHEN status = 'finalizada' THEN 1 ELSE 0 END)`,
        pendentes: sql<number>`SUM(CASE WHEN status != 'finalizada' THEN 1 ELSE 0 END)`,
        tempoMedio: sql<number>`AVG(CASE WHEN tempoAvaliacao > 0 THEN tempoAvaliacao ELSE NULL END)`,
      })
        .from(avaliacoes)
        .where(and(
          eq(avaliacoes.companyId, input.companyId),
          eq(avaliacoes.avaliadorId, ctx.user.id),
        ));
      return {
        total: Number(stats?.total || 0),
        finalizadas: Number(stats?.finalizadas || 0),
        pendentes: Number(stats?.pendentes || 0),
        tempoMedio: stats?.tempoMedio ? Math.round(Number(stats.tempoMedio)) : null,
      };
    }),
});
