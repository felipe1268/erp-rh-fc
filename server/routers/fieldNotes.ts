import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { fieldNotes, employees, obras, timeRecords } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, asc, gte, lte, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { notifyOwner } from "../_core/notification";

const tipoOcorrenciaEnum = z.enum(['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'insubordinacao', 'acidente', 'atestado_medico', 'desvio_conduta', 'elogio', 'outro']);
const prioridadeEnum = z.enum(['baixa', 'media', 'alta', 'urgente']);
const statusEnum = z.enum(['pendente', 'em_analise', 'resolvido', 'arquivado']);
const acaoTomadaEnum = z.enum(['nenhuma', 'advertencia_verbal', 'advertencia_escrita', 'suspensao', 'desconto_folha', 'ajuste_ponto', 'encaminhamento_medico', 'outro']);

export const fieldNotesRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: statusEnum.optional(),
      employeeId: z.number().optional(),
      obraId: z.number().optional(),
      tipoOcorrencia: tipoOcorrenciaEnum.optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(fieldNotes.companyId, input), isNull(fieldNotes.deletedAt)];
      if (input.status) conds.push(eq(fieldNotes.status, input.status));
      if (input.employeeId) conds.push(eq(fieldNotes.employeeId, input.employeeId));
      if (input.obraId) conds.push(eq(fieldNotes.obraId, input.obraId));
      if (input.tipoOcorrencia) conds.push(eq(fieldNotes.tipoOcorrencia, input.tipoOcorrencia));
      if (input.dataInicio) conds.push(gte(fieldNotes.data, input.dataInicio));
      if (input.dataFim) conds.push(lte(fieldNotes.data, input.dataFim));

      const rows = await db.select({
        id: fieldNotes.id,
        companyId: fieldNotes.companyId,
        employeeId: fieldNotes.employeeId,
        obraId: fieldNotes.obraId,
        data: fieldNotes.data,
        tipoOcorrencia: fieldNotes.tipoOcorrencia,
        descricao: fieldNotes.descricao,
        solicitanteNome: fieldNotes.solicitanteNome,
        solicitanteId: fieldNotes.solicitanteId,
        evidenciaUrl: fieldNotes.evidenciaUrl,
        prioridade: fieldNotes.prioridade,
        status: fieldNotes.status,
        respostaRH: fieldNotes.respostaRH,
        acaoTomada: fieldNotes.acaoTomada,
        resolvidoPor: fieldNotes.resolvidoPor,
        resolvidoEm: fieldNotes.resolvidoEm,
        createdAt: fieldNotes.createdAt,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
        obraNome: obras.nome,
      })
        .from(fieldNotes)
        .leftJoin(employees, eq(fieldNotes.employeeId, employees.id))
        .leftJoin(obras, eq(fieldNotes.obraId, obras.id))
        .where(and(...conds))
        .orderBy(desc(fieldNotes.data), desc(fieldNotes.createdAt));

      return rows;
    }),

  create: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
      obraId: z.number().optional(),
      data: z.string(),
      tipoOcorrencia: tipoOcorrenciaEnum,
      descricao: z.string().min(1),
      prioridade: prioridadeEnum.optional(),
      evidenciaUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const solicitanteNome = ctx.user?.name || ctx.user?.email || "Gestor";
      const [result] = await db.insert(fieldNotes).values({
        ...input,
        solicitanteNome,
        solicitanteId: ctx.user?.openId || ctx.user?.email || "",
      }).returning();
      const newId = result.id;

      // Buscar nome do funcionário para a notificação
      const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, input.employeeId));
      const nomeFunc = emp?.nome || `Func. #${input.employeeId}`;

      // Notificar owner para apontamentos urgentes ou de alta prioridade
      if (input.prioridade === 'urgente' || input.prioridade === 'alta') {
        const prioridadeLabel = input.prioridade === 'urgente' ? '🚨 URGENTE' : '⚠️ ALTA';
        const tipoLabel = input.tipoOcorrencia.replace(/_/g, ' ');
        try {
          await notifyOwner({
            title: `${prioridadeLabel} - Apontamento de Campo`,
            content: `Novo apontamento ${prioridadeLabel} registrado por ${solicitanteNome}:\n\nFuncionário: ${nomeFunc}\nTipo: ${tipoLabel}\nData: ${input.data}\nDescrição: ${input.descricao.substring(0, 200)}`,
          });
        } catch (e) {
          // Notificação falhou, mas não bloqueia o registro
          console.error('[FieldNotes] Falha ao notificar owner:', e);
        }
      }

      return { id: newId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      tipoOcorrencia: tipoOcorrenciaEnum.optional(),
      descricao: z.string().optional(),
      prioridade: prioridadeEnum.optional(),
      obraId: z.number().optional(),
      data: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(fieldNotes).set(data).where(eq(fieldNotes.id, id));
      return { success: true };
    }),

  resolve: protectedProcedure
    .input(z.object({
      id: z.number(),
      respostaRH: z.string().min(1),
      acaoTomada: acaoTomadaEnum,
      status: z.enum(['resolvido', 'arquivado']).default('resolvido'),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const resolvidoPor = ctx.user?.name || ctx.user?.email || "RH";

      // Buscar dados do apontamento para vincular ao ponto
      const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, input.id));
      if (!note) throw new Error("Apontamento não encontrado");

      // Atualizar o apontamento
      await db.update(fieldNotes).set({
        respostaRH: input.respostaRH,
        acaoTomada: input.acaoTomada,
        status: input.status,
        resolvidoPor,
        resolvidoEm: sql`NOW()`,
      }).where(eq(fieldNotes.id, input.id));

      // === VINCULAR AO PONTO ===
      // Se a ação é desconto_folha ou ajuste_ponto, e o tipo é falta/atraso/saida_antecipada
      const tiposVinculaveis = ['falta', 'atraso', 'saida_antecipada', 'abandono_posto'];
      const acoesVinculaveis = ['desconto_folha', 'ajuste_ponto'];

      if (note.data && tiposVinculaveis.includes(note.tipoOcorrencia) && acoesVinculaveis.includes(input.acaoTomada)) {
        // Verificar se já existe registro de ponto para esse dia
        const existing = await db.select().from(timeRecords)
          .where(and(
            eq(timeRecords.companyId, note.companyId),
            eq(timeRecords.employeeId, note.employeeId),
            eq(timeRecords.data, note.data),
          ));

        const justificativa = `[Apontamento #${note.id} - ${note.tipoOcorrencia}] ${input.respostaRH} (Resolvido por ${resolvidoPor})`;
        const mesRef = note.data.substring(0, 7); // YYYY-MM

        if (note.tipoOcorrencia === 'falta' || note.tipoOcorrencia === 'abandono_posto') {
          // Marcar como falta no ponto
          if (existing.length > 0) {
            await db.update(timeRecords).set({
              faltas: "1",
              horasTrabalhadas: "00:00",
              justificativa,
              ajusteManual: 1,
              ajustadoPor: resolvidoPor,
            }).where(and(
              eq(timeRecords.companyId, note.companyId),
              eq(timeRecords.employeeId, note.employeeId),
              eq(timeRecords.data, note.data),
            ));
          } else {
            // Criar registro de falta
            await db.insert(timeRecords).values({
              companyId: note.companyId,
              employeeId: note.employeeId,
              data: note.data,
              mesReferencia: mesRef,
              obraId: note.obraId,
              faltas: "1",
              horasTrabalhadas: "00:00",
              horasExtras: "0:00",
              horasNoturnas: "0:00",
              atrasos: "0:00",
              fonte: "apontamento",
              ajusteManual: 1,
              ajustadoPor: resolvidoPor,
              justificativa,
            });
          }
        } else if (note.tipoOcorrencia === 'atraso' || note.tipoOcorrencia === 'saida_antecipada') {
          // Marcar atraso no ponto existente
          if (existing.length > 0) {
            await db.update(timeRecords).set({
              atrasos: note.tipoOcorrencia === 'atraso' ? "1:00" : existing[0].atrasos,
              justificativa: existing[0].justificativa
                ? `${existing[0].justificativa} | ${justificativa}`
                : justificativa,
              ajusteManual: 1,
              ajustadoPor: resolvidoPor,
            }).where(and(
              eq(timeRecords.companyId, note.companyId),
              eq(timeRecords.employeeId, note.employeeId),
              eq(timeRecords.data, note.data),
            ));
          }
        }
      }

      return { success: true, vinculadoPonto: tiposVinculaveis.includes(note.tipoOcorrencia) && acoesVinculaveis.includes(input.acaoTomada) };
    }),

  setEmAnalise: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({ status: 'em_analise' }).where(eq(fieldNotes.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({ deletedAt: sql`NOW()` }).where(eq(fieldNotes.id, input.id));
      return { success: true };
    }),

  stats: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [rows] = await db.execute(sql`
        SELECT 
          status,
          COUNT(*) as total,
          SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgentes,
          SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as altas
        FROM field_notes
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL
        GROUP BY status
      `) as any[];

      const stats = { pendente: 0, em_analise: 0, resolvido: 0, arquivado: 0, urgentes: 0, altas: 0, total: 0 };
      for (const r of rows as any[]) {
        stats[r.status as keyof typeof stats] = parseInt(r.total);
        stats.urgentes += parseInt(r.urgentes || '0');
        stats.altas += parseInt(r.altas || '0');
        stats.total += parseInt(r.total);
      }
      return stats;
    }),

  // ============ DASHBOARD PROCEDURES ============

  statsPorObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const dataConds: any[] = [];
      if (input.dataInicio) dataConds.push(sql`fn.data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`fn.data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const [rows] = await db.execute(sql`
        SELECT o.nome as obraNome, fn.obraId, COUNT(*) as total,
          SUM(CASE WHEN fn.status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN fn.status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos
        FROM field_notes fn
        LEFT JOIN obras o ON fn.obraId = o.id
        WHERE fn.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND fn.deletedAt IS NULL ${extraWhere}
        GROUP BY fn.obraId, o.nome
        ORDER BY total DESC
      `) as any[];
      return rows as { obraNome: string | null; obraId: number | null; total: number; pendentes: number; resolvidos: number }[];
    }),

  statsPorMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ano = input.ano || new Date().getFullYear();
      const [rows] = await db.execute(sql`
        SELECT DATE_FORMAT(data, '%Y-%m') as mes, COUNT(*) as total,
          SUM(CASE WHEN status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes
        FROM field_notes
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL
          AND YEAR(data) = ${ano}
        GROUP BY DATE_FORMAT(data, '%Y-%m')
        ORDER BY mes ASC
      `) as any[];
      return rows as { mes: string; total: number; resolvidos: number; pendentes: number }[];
    }),

  taxaResolucao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const dataConds: any[] = [];
      if (input.dataInicio) dataConds.push(sql`data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const [rows] = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN status = 'em_analise' THEN 1 ELSE 0 END) as emAnalise,
          SUM(CASE WHEN status = 'arquivado' THEN 1 ELSE 0 END) as arquivados,
          SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgentes,
          SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as altas,
          AVG(CASE WHEN resolvidoEm IS NOT NULL THEN TIMESTAMPDIFF(HOUR, createdAt, resolvidoEm) END) as tempoMedioResolucaoHoras
        FROM field_notes
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL ${extraWhere}
      `) as any[];
      const r = (rows as any[])[0] || {};
      return {
        total: parseInt(r.total || '0'),
        resolvidos: parseInt(r.resolvidos || '0'),
        pendentes: parseInt(r.pendentes || '0'),
        emAnalise: parseInt(r.emAnalise || '0'),
        arquivados: parseInt(r.arquivados || '0'),
        urgentes: parseInt(r.urgentes || '0'),
        altas: parseInt(r.altas || '0'),
        taxaResolucao: r.total > 0 ? Math.round((parseInt(r.resolvidos || '0') / parseInt(r.total)) * 100) : 0,
        tempoMedioResolucaoHoras: Math.round(parseFloat(r.tempoMedioResolucaoHoras || '0')),
      };
    }),

  statsPorTipo: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const dataConds = [];
      if (input.dataInicio) dataConds.push(sql`data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const [rows] = await db.execute(sql`
        SELECT tipoOcorrencia, COUNT(*) as total
        FROM field_notes
        WHERE companyId = ${input.companyId} AND deletedAt IS NULL ${extraWhere}
        GROUP BY tipoOcorrencia
        ORDER BY total DESC
      `) as any[];

      return rows as { tipoOcorrencia: string; total: number }[];
    }),
});
