/**
 * DataJud Auto-Check Router
 * - Configuração de verificação automática por empresa
 * - Sistema de alertas para novas movimentações
 * - Job periódico que consulta DataJud para processos cadastrados
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { datajudAlerts, datajudAutoCheckConfig, processosTrabalhistas, companies } from "../../drizzle/schema";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ============================================================
// AUTO-CHECK JOB (runs server-side)
// ============================================================
let autoCheckInterval: NodeJS.Timeout | null = null;

async function runAutoCheck() {
  const db = (await getDb())!;
  if (!db) return;

  try {
    // Buscar todas as configs ativas
    const configs = await db.select().from(datajudAutoCheckConfig)
      .where(eq(datajudAutoCheckConfig.isActive, 1));

    const now = new Date();

    for (const config of configs) {
      // Verificar se já passou o intervalo desde a última verificação
      const ultimaVerif = config.ultimaVerificacao ? new Date(config.ultimaVerificacao) : null;
      if (ultimaVerif) {
        const diffMinutes = (now.getTime() - ultimaVerif.getTime()) / (1000 * 60);
        if (diffMinutes < config.intervaloMinutos) continue;
      }

      // Buscar processos ativos da empresa
      const processos = await db.select().from(processosTrabalhistas)
        .where(and(
          eq(processosTrabalhistas.companyId, config.companyId),
          sql`${processosTrabalhistas.deletedAt} IS NULL`,
          sql`${processosTrabalhistas.status} != 'arquivado'`,
        ));

      if (processos.length === 0) {
        await db.update(datajudAutoCheckConfig).set({
          ultimaVerificacao: sql`NOW()`,
          totalVerificacoes: sql`totalVerificacoes + 1`,
        }).where(eq(datajudAutoCheckConfig.id, config.id));
        continue;
      }

      const { buscarPorNumero, inferirSituacao, calcularRisco, getUltimasMovimentacoes, parseDatajudDate, detectarNovasMovimentacoes } = await import("../datajud");

      let alertasGerados = 0;

      for (const processo of processos) {
        try {
          const resultado = await buscarPorNumero(processo.numeroProcesso);
          if (!resultado) continue;

          // Detectar novas movimentações
          const movsAntigas = processo.datajudMovimentos ?
            (typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : processo.datajudMovimentos) : [];
          const novasMovs = detectarNovasMovimentacoes(movsAntigas, resultado.movimentos);

          if (novasMovs.length > 0) {
            const situacao = inferirSituacao(resultado.movimentos);
            const risco = calcularRisco(processo.valorCausa, resultado.assuntos, resultado.movimentos);
            const ultimasMovs = getUltimasMovimentacoes(resultado.movimentos, 50);
            const dataAjuiz = parseDatajudDate(resultado.dataAjuizamento);

            // Atualizar processo
            const updateData: any = {
              datajudId: resultado.id,
              datajudUltimaConsulta: sql`NOW()`,
              datajudUltimaAtualizacao: resultado.dataHoraUltimaAtualizacao,
              datajudGrau: resultado.grau,
              datajudClasse: resultado.classe?.nome,
              datajudAssuntos: JSON.stringify(resultado.assuntos),
              datajudOrgaoJulgador: resultado.orgaoJulgador?.nome,
              datajudSistema: resultado.sistema?.nome,
              datajudFormato: resultado.formato?.nome,
              datajudMovimentos: JSON.stringify(ultimasMovs),
              datajudTotalMovimentos: resultado.movimentos.length,
              tribunal: resultado.tribunal || processo.tribunal,
              vara: resultado.orgaoJulgador?.nome || processo.vara,
              status: situacao.status as any,
              fase: situacao.fase as any,
              risco: risco,
            };
            if (!processo.dataDistribuicao && dataAjuiz) {
              updateData.dataDistribuicao = dataAjuiz;
            }
            await db.update(processosTrabalhistas).set(updateData)
              .where(eq(processosTrabalhistas.id, processo.id));

            // Gerar alertas para cada nova movimentação relevante
            for (const mov of novasMovs.slice(0, 5)) {
              const nomeLower = mov.nome.toLowerCase();
              let tipo: any = 'nova_movimentacao';
              let prioridade: any = 'media';

              if (nomeLower.includes('audiência') || nomeLower.includes('audiencia')) {
                tipo = 'audiencia_marcada';
                prioridade = 'alta';
              } else if (nomeLower.includes('sentença') || nomeLower.includes('sentenca') || nomeLower.includes('julgamento')) {
                tipo = 'sentenca';
                prioridade = 'critica';
              } else if (nomeLower.includes('recurso')) {
                tipo = 'recurso';
                prioridade = 'alta';
              } else if (nomeLower.includes('acordo') || nomeLower.includes('conciliação')) {
                tipo = 'acordo';
                prioridade = 'alta';
              } else if (nomeLower.includes('penhora') || nomeLower.includes('bloqueio')) {
                tipo = 'penhora';
                prioridade = 'critica';
              } else if (nomeLower.includes('execução') || nomeLower.includes('execucao')) {
                tipo = 'execucao';
                prioridade = 'alta';
              } else if (nomeLower.includes('arquiv') || nomeLower.includes('baixa') || nomeLower.includes('trânsito')) {
                tipo = 'arquivamento';
                prioridade = 'media';
              }

              await db.insert(datajudAlerts).values({
                companyId: config.companyId,
                processoId: processo.id,
                tipo,
                titulo: `${mov.nome}`,
                descricao: `Processo ${processo.numeroProcesso} - Reclamante: ${processo.reclamante || 'N/I'}. Movimentação detectada automaticamente pelo monitoramento DataJud.`,
                prioridade,
                dados: JSON.stringify({
                  movimentacao: mov,
                  processoNumero: processo.numeroProcesso,
                  reclamante: processo.reclamante,
                  risco: risco,
                  status: situacao.status,
                }),
              });
              alertasGerados++;
            }
          } else {
            // Sem novas movimentações, apenas atualizar timestamp
            await db.update(processosTrabalhistas).set({
              datajudUltimaConsulta: sql`NOW()`,
            }).where(eq(processosTrabalhistas.id, processo.id));
          }

          // Rate limit: 500ms entre consultas
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`[AutoCheck] Erro ao consultar processo ${processo.numeroProcesso}:`, e);
        }
      }

      // Atualizar config
      await db.update(datajudAutoCheckConfig).set({
        ultimaVerificacao: sql`NOW()`,
        totalVerificacoes: sql`totalVerificacoes + 1`,
        totalAlertas: sql`totalAlertas + ${alertasGerados}`,
      }).where(eq(datajudAutoCheckConfig.id, config.id));

      console.log(`[AutoCheck] Empresa ${config.companyId}: ${processos.length} processos verificados, ${alertasGerados} alertas gerados`);
    }
  } catch (e) {
    console.error("[AutoCheck] Erro geral:", e);
  }
}

// Iniciar o job de verificação automática (a cada 5 minutos verifica se alguma empresa precisa de check)
export function startAutoCheckJob() {
  if (autoCheckInterval) clearInterval(autoCheckInterval);
  autoCheckInterval = setInterval(runAutoCheck, 5 * 60 * 1000); // Verifica a cada 5 min
  console.log("[AutoCheck] Job de verificação automática iniciado (verifica a cada 5 min)");
  // Executar imediatamente na primeira vez (com delay de 30s para o server iniciar)
  setTimeout(runAutoCheck, 30000);
}

// ============================================================
// ROUTER
// ============================================================
export const datajudAutoCheckRouter = router({
  // Obter configuração da empresa
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [config] = await db.select().from(datajudAutoCheckConfig)
        .where(eq(datajudAutoCheckConfig.companyId, input.companyId));
      return config || null;
    }),

  // Salvar/atualizar configuração
  saveConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      isActive: z.boolean(),
      intervaloMinutos: z.number().min(30).max(1440),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin_master') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o Admin Master pode configurar a verificação automática' });
      }
      const db = (await getDb())!;
      const [existing] = await db.select().from(datajudAutoCheckConfig)
        .where(eq(datajudAutoCheckConfig.companyId, input.companyId));

      if (existing) {
        await db.update(datajudAutoCheckConfig).set({
          isActive: input.isActive ? 1 : 0,
          intervaloMinutos: input.intervaloMinutos,
        }).where(eq(datajudAutoCheckConfig.id, existing.id));
      } else {
        await db.insert(datajudAutoCheckConfig).values({
          companyId: input.companyId,
          isActive: input.isActive ? 1 : 0,
          intervaloMinutos: input.intervaloMinutos,
          criadoPor: ctx.user.name || ctx.user.openId,
        });
      }
      return { success: true };
    }),

  // Executar verificação manual
  executarVerificacao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Garantir que existe config
      const [config] = await db.select().from(datajudAutoCheckConfig)
        .where(eq(datajudAutoCheckConfig.companyId, input.companyId));

      if (!config) {
        await db.insert(datajudAutoCheckConfig).values({
          companyId: input.companyId,
          isActive: 1,
          intervaloMinutos: 60,
        });
      }

      // Forçar a verificação para esta empresa
      const { buscarPorNumero, inferirSituacao, calcularRisco, getUltimasMovimentacoes, parseDatajudDate, detectarNovasMovimentacoes } = await import("../datajud");

      const processos = await db.select().from(processosTrabalhistas)
        .where(and(
          eq(processosTrabalhistas.companyId, input.companyId),
          sql`${processosTrabalhistas.deletedAt} IS NULL`,
        ));

      let atualizados = 0;
      let alertasGerados = 0;

      for (const processo of processos) {
        try {
          const resultado = await buscarPorNumero(processo.numeroProcesso);
          if (!resultado) continue;

          const movsAntigas = processo.datajudMovimentos ?
            (typeof processo.datajudMovimentos === 'string' ? JSON.parse(processo.datajudMovimentos) : processo.datajudMovimentos) : [];
          const novasMovs = detectarNovasMovimentacoes(movsAntigas, resultado.movimentos);
          const situacao = inferirSituacao(resultado.movimentos);
          const risco = calcularRisco(processo.valorCausa, resultado.assuntos, resultado.movimentos);
          const ultimasMovs = getUltimasMovimentacoes(resultado.movimentos, 50);
          const dataAjuiz = parseDatajudDate(resultado.dataAjuizamento);

          const updateData: any = {
            datajudId: resultado.id,
            datajudUltimaConsulta: sql`NOW()`,
            datajudUltimaAtualizacao: resultado.dataHoraUltimaAtualizacao,
            datajudGrau: resultado.grau,
            datajudClasse: resultado.classe?.nome,
            datajudAssuntos: JSON.stringify(resultado.assuntos),
            datajudOrgaoJulgador: resultado.orgaoJulgador?.nome,
            datajudSistema: resultado.sistema?.nome,
            datajudFormato: resultado.formato?.nome,
            datajudMovimentos: JSON.stringify(ultimasMovs),
            datajudTotalMovimentos: resultado.movimentos.length,
            tribunal: resultado.tribunal || processo.tribunal,
            vara: resultado.orgaoJulgador?.nome || processo.vara,
            status: situacao.status as any,
            fase: situacao.fase as any,
            risco: risco,
          };
          if (!processo.dataDistribuicao && dataAjuiz) {
            updateData.dataDistribuicao = dataAjuiz;
          }
          await db.update(processosTrabalhistas).set(updateData)
            .where(eq(processosTrabalhistas.id, processo.id));
          atualizados++;

          if (novasMovs.length > 0) {
            for (const mov of novasMovs.slice(0, 5)) {
              const nomeLower = mov.nome.toLowerCase();
              let tipo: any = 'nova_movimentacao';
              let prioridade: any = 'media';
              if (nomeLower.includes('audiência') || nomeLower.includes('audiencia')) { tipo = 'audiencia_marcada'; prioridade = 'alta'; }
              else if (nomeLower.includes('sentença') || nomeLower.includes('sentenca')) { tipo = 'sentenca'; prioridade = 'critica'; }
              else if (nomeLower.includes('recurso')) { tipo = 'recurso'; prioridade = 'alta'; }
              else if (nomeLower.includes('acordo')) { tipo = 'acordo'; prioridade = 'alta'; }
              else if (nomeLower.includes('penhora') || nomeLower.includes('bloqueio')) { tipo = 'penhora'; prioridade = 'critica'; }
              else if (nomeLower.includes('execução')) { tipo = 'execucao'; prioridade = 'alta'; }
              else if (nomeLower.includes('arquiv') || nomeLower.includes('baixa')) { tipo = 'arquivamento'; prioridade = 'media'; }

              await db.insert(datajudAlerts).values({
                companyId: input.companyId,
                processoId: processo.id,
                tipo,
                titulo: mov.nome,
                descricao: `Processo ${processo.numeroProcesso} - ${processo.reclamante || 'N/I'}`,
                prioridade,
                dados: JSON.stringify({ movimentacao: mov, processoNumero: processo.numeroProcesso, reclamante: processo.reclamante }),
              });
              alertasGerados++;
            }
          }
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`Erro verificação manual processo ${processo.numeroProcesso}:`, e);
        }
      }

      // Atualizar config
      const [cfgNow] = await db.select().from(datajudAutoCheckConfig)
        .where(eq(datajudAutoCheckConfig.companyId, input.companyId));
      if (cfgNow) {
        await db.update(datajudAutoCheckConfig).set({
          ultimaVerificacao: sql`NOW()`,
          totalVerificacoes: sql`totalVerificacoes + 1`,
          totalAlertas: sql`totalAlertas + ${alertasGerados}`,
        }).where(eq(datajudAutoCheckConfig.id, cfgNow.id));
      }

      return { total: processos.length, atualizados, alertasGerados };
    }),

  // Listar alertas
  listarAlertas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      apenasNaoLidos: z.boolean().optional().default(false),
      limit: z.number().optional().default(50),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let where = eq(datajudAlerts.companyId, input.companyId);
      if (input.apenasNaoLidos) {
        where = and(where, eq(datajudAlerts.lido, 0)) as any;
      }
      const alertas = await db.select().from(datajudAlerts)
        .where(where)
        .orderBy(desc(datajudAlerts.createdAt))
        .limit(input.limit);

      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(datajudAlerts)
        .where(and(eq(datajudAlerts.companyId, input.companyId), eq(datajudAlerts.lido, 0)));

      return {
        alertas,
        totalNaoLidos: Number(countResult?.count || 0),
      };
    }),

  // Marcar alerta como lido
  marcarLido: protectedProcedure
    .input(z.object({ alertaId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(datajudAlerts).set({
        lido: 1,
        lidoPor: ctx.user.name || ctx.user.openId,
        lidoEm: sql`NOW()`,
      }).where(eq(datajudAlerts.id, input.alertaId));
      return { success: true };
    }),

  // Marcar todos como lidos
  marcarTodosLidos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(datajudAlerts).set({
        lido: 1,
        lidoPor: ctx.user.name || ctx.user.openId,
        lidoEm: sql`NOW()`,
      }).where(and(
        eq(datajudAlerts.companyId, input.companyId),
        eq(datajudAlerts.lido, 0),
      ));
      return { success: true };
    }),

  // Excluir alerta
  excluirAlerta: protectedProcedure
    .input(z.object({ alertaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(datajudAlerts).where(eq(datajudAlerts.id, input.alertaId));
      return { success: true };
    }),

  // Contar alertas não lidos (para badge)
  contarNaoLidos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(datajudAlerts)
        .where(and(
          eq(datajudAlerts.companyId, input.companyId),
          eq(datajudAlerts.lido, 0),
        ));
      return { count: Number(result?.count || 0) };
    }),
});
