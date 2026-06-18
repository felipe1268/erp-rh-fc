import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { fieldNotes, employees, obras, timeRecords } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull, asc, gte, lte, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { notifyOwner } from "../_core/notification";
import { getEffectiveAllowedObraIds } from "../db";
import { TRPCError } from "@trpc/server";

/**
 * Garante que o usuário tem acesso à obra associada a um apontamento.
 * Para admin/admin_master (helper retorna null) é sempre permitido.
 * Apontamentos sem obraId só passam para usuários sem restrição.
 */
async function assertObraAccessForFieldNote(db: any, fieldNoteId: number, userId: number, role?: string | null) {
  const allowed = await getEffectiveAllowedObraIds(userId, role);
  if (allowed === null) return;
  const [row] = await db.select({ obraId: fieldNotes.obraId }).from(fieldNotes).where(eq(fieldNotes.id, fieldNoteId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Apontamento não encontrado" });
  if (row.obraId == null || !allowed.includes(row.obraId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra deste apontamento" });
  }
}

/** Constrói trecho SQL para restringir queries de stats à lista de obras permitidas. */
async function obrasFilterSql(userId: number, role: string | null | undefined, columnExpr: ReturnType<typeof sql>) {
  const allowed = await getEffectiveAllowedObraIds(userId, role);
  if (allowed === null) return null;
  if (allowed.length === 0) return { empty: true as const };
  return { empty: false as const, clause: sql` AND ${columnExpr} = ANY(${allowed})` };
}

const tipoOcorrenciaEnum = z.enum(['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'insubordinacao', 'acidente', 'atestado_medico', 'desvio_conduta', 'elogio', 'outro']);
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
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(fieldNotes.companyId, input), isNull(fieldNotes.deletedAt)];
      if (input.status) conds.push(eq(fieldNotes.status, input.status));
      if (input.employeeId) conds.push(eq(fieldNotes.employeeId, input.employeeId));
      if (input.obraId) conds.push(eq(fieldNotes.obraId, input.obraId));
      if (input.tipoOcorrencia) conds.push(eq(fieldNotes.tipoOcorrencia, input.tipoOcorrencia));
      if (input.dataInicio) conds.push(gte(fieldNotes.data, input.dataInicio));
      if (input.dataFim) conds.push(lte(fieldNotes.data, input.dataFim));

      // Filtro por obras permitidas (data-row level). null => sem restrição.
      // Apontamento sem obraId só é mostrado a admin/admin_master (allowed === null).
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conds.push(inArray(fieldNotes.obraId, allowed));
      }

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
        entrada1: fieldNotes.entrada1,
        saida1: fieldNotes.saida1,
        entrada2: fieldNotes.entrada2,
        saida2: fieldNotes.saida2,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
        obraNome: obras.nome,
      })
        .from(fieldNotes)
        .leftJoin(employees, eq(fieldNotes.employeeId, employees.id))
        .leftJoin(obras, eq(fieldNotes.obraId, obras.id))
        .where(and(...conds))
        .orderBy(desc(fieldNotes.data), desc(fieldNotes.createdAt));

      const needsTimeEnrich = rows.filter(r => !r.entrada1 && !r.saida1 && !r.entrada2 && !r.saida2);
      if (needsTimeEnrich.length > 0) {
        const enrichKeys = needsTimeEnrich.map(r => ({ empId: r.employeeId, data: r.data }));
        const uniqueKeys = [...new Map(enrichKeys.map(k => [`${k.empId}-${k.data}`, k])).values()];
        for (const uk of uniqueKeys) {
          const [tr] = await db.select({
            entrada1: timeRecords.entrada1, saida1: timeRecords.saida1,
            entrada2: timeRecords.entrada2, saida2: timeRecords.saida2,
          }).from(timeRecords).where(and(
            eq(timeRecords.employeeId, uk.empId),
            eq(timeRecords.data, uk.data),
          )).limit(1);
          if (tr) {
            for (const row of rows) {
              if (row.employeeId === uk.empId && row.data === uk.data && !row.entrada1 && !row.saida1) {
                row.entrada1 = tr.entrada1;
                row.saida1 = tr.saida1;
                row.entrada2 = tr.entrada2;
                row.saida2 = tr.saida2;
              }
            }
          }
        }
      }

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
      entrada1: z.string().optional(),
      saida1: z.string().optional(),
      entrada2: z.string().optional(),
      saida2: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const solicitanteNome = ctx.user?.name || ctx.user?.email || "Gestor";
      const { entrada1, saida1, entrada2, saida2, ...fieldData } = input;
      const [result] = await db.insert(fieldNotes).values({
        ...fieldData,
        entrada1: entrada1 || null,
        saida1: saida1 || null,
        entrada2: entrada2 || null,
        saida2: saida2 || null,
        solicitanteNome,
        solicitanteId: ctx.user?.openId || ctx.user?.email || "",
      }).returning();
      const newId = result.id;

      const tiposComPonto = ['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'outro'];
      const tiposSemprePonto = ['falta', 'abandono_posto', 'esqueceu_bater'];
      if (tiposComPonto.includes(input.tipoOcorrencia) && input.obraId && (entrada1 || saida1 || entrada2 || saida2 || tiposSemprePonto.includes(input.tipoOcorrencia))) {
        const mesRef = input.data.substring(0, 7);
        const justificativa = `[Apontamento #${newId} - ${input.tipoOcorrencia}] ${input.descricao.substring(0, 200)} (por ${solicitanteNome})`;
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

        const existing = await db.select().from(timeRecords)
          .where(and(
            eq(timeRecords.companyId, input.companyId),
            eq(timeRecords.employeeId, input.employeeId),
            eq(timeRecords.data, input.data),
          ));

        const mergedE1 = existing.reduce((v: string | null, r: any) => v || r.entrada1 || null, null as string | null);
        const mergedS1 = existing.reduce((v: string | null, r: any) => v || r.saida1 || null, null as string | null);
        const mergedE2 = existing.reduce((v: string | null, r: any) => v || r.entrada2 || null, null as string | null);
        const mergedS2 = existing.reduce((v: string | null, r: any) => v || r.saida2 || null, null as string | null);
        const mergedJust = existing.map((r: any) => r.justificativa).filter(Boolean).join(" | ");
        const mergedObra = input.obraId || existing.find((r: any) => r.obraId)?.obraId || null;

        const finalE1 = entrada1 || mergedE1 || null;
        const finalS1 = saida1 || mergedS1 || null;
        const finalE2 = entrada2 || mergedE2 || null;
        const finalS2 = saida2 || mergedS2 || null;

        let totalMin = 0;
        if (finalE1 && finalS1) totalMin += toMin(finalS1) - toMin(finalE1);
        if (finalE2 && finalS2) totalMin += toMin(finalS2) - toMin(finalE2);
        if (totalMin < 0) totalMin = 0;
        const hh = Math.floor(totalMin / 60);
        const mm = totalMin % 60;
        const horasTrabalhadas = `${hh}:${String(mm).padStart(2, '0')}`;

        let faltas = "0";
        let atrasos = "0:00";
        if (input.tipoOcorrencia === 'falta' || input.tipoOcorrencia === 'abandono_posto') {
          faltas = totalMin > 0 ? "0" : "1";
        }
        if (input.tipoOcorrencia === 'esqueceu_bater') {
          faltas = "0";
        }

        const hadDixi = existing.some((r: any) => r.fonte === "dixi" || r.fonte === "dixi+apontamento");
        const fonteValue = hadDixi ? "dixi+apontamento" : "apontamento";

        if (existing.length > 1) {
          const keepId = existing[0].id;
          const removeIds = existing.slice(1).map((r: any) => r.id);
          await db.delete(timeRecords).where(inArray(timeRecords.id, removeIds));
          const fullJust = mergedJust ? `${mergedJust} | ${justificativa}` : justificativa;
          await db.update(timeRecords).set({
            entrada1: finalE1, saida1: finalS1, entrada2: finalE2, saida2: finalS2,
            horasTrabalhadas, faltas, atrasos,
            justificativa: fullJust,
            ajusteManual: 1, ajustadoPor: solicitanteNome, fonte: fonteValue,
            obraId: mergedObra,
          }).where(eq(timeRecords.id, keepId));
        } else if (existing.length === 1) {
          const ex = existing[0];
          const prevJust = ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa;
          await db.update(timeRecords).set({
            entrada1: finalE1, saida1: finalS1, entrada2: finalE2, saida2: finalS2,
            horasTrabalhadas, faltas, atrasos,
            justificativa: prevJust,
            ajusteManual: 1, ajustadoPor: solicitanteNome, fonte: fonteValue,
          }).where(eq(timeRecords.id, ex.id));
        } else {
          await db.insert(timeRecords).values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            data: input.data,
            mesReferencia: mesRef,
            obraId: mergedObra,
            entrada1: finalE1, saida1: finalS1, entrada2: finalE2, saida2: finalS2,
            horasTrabalhadas,
            horasExtras: "0:00",
            horasNoturnas: "0:00",
            faltas, atrasos,
            fonte: "apontamento",
            ajusteManual: 1, ajustadoPor: solicitanteNome,
            justificativa,
          });
        }
      }

      const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, input.employeeId));
      const nomeFunc = emp?.nome || `Func. #${input.employeeId}`;

      if (input.prioridade === 'urgente' || input.prioridade === 'alta') {
        const prioridadeLabel = input.prioridade === 'urgente' ? '🚨 URGENTE' : '⚠️ ALTA';
        const tipoLabel = input.tipoOcorrencia.replace(/_/g, ' ');
        try {
          await notifyOwner({
            title: `${prioridadeLabel} - Apontamento de Campo`,
            content: `Novo apontamento ${prioridadeLabel} registrado por ${solicitanteNome}:\n\nFuncionário: ${nomeFunc}\nTipo: ${tipoLabel}\nData: ${input.data}\nDescrição: ${input.descricao.substring(0, 200)}`,
          });
        } catch (e) {
          console.error('[FieldNotes] Falha ao notificar owner:', e);
        }
      }

      return { id: newId, vinculadoPonto: tiposComPonto.includes(input.tipoOcorrencia) && !!input.obraId };
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
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await assertObraAccessForFieldNote(db, id, ctx.user.id, ctx.user.role);
      await db.update(fieldNotes).set(data).where(eq(fieldNotes.id, id));
      return { success: true };
    }),

  resolve: protectedProcedure
    .input(z.object({
      id: z.number(),
      respostaRH: z.string().min(1),
      acaoTomada: acaoTomadaEnum,
      status: z.enum(['resolvido', 'arquivado']).default('resolvido'),
      entrada1: z.string().optional(),
      saida1: z.string().optional(),
      entrada2: z.string().optional(),
      saida2: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertObraAccessForFieldNote(db, input.id, ctx.user.id, ctx.user.role);
      const resolvidoPor = ctx.user?.name || ctx.user?.email || "RH";

      const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, input.id));
      if (!note) throw new Error("Apontamento não encontrado");

      const resolveEntrada1 = input.entrada1 || note.entrada1 || null;
      const resolveSaida1 = input.saida1 || note.saida1 || null;
      const resolveEntrada2 = input.entrada2 || note.entrada2 || null;
      const resolveSaida2 = input.saida2 || note.saida2 || null;

      await db.update(fieldNotes).set({
        respostaRH: input.respostaRH,
        acaoTomada: input.acaoTomada,
        status: input.status,
        resolvidoPor,
        resolvidoEm: sql`NOW()`,
        entrada1: resolveEntrada1,
        saida1: resolveSaida1,
        entrada2: resolveEntrada2,
        saida2: resolveSaida2,
      }).where(eq(fieldNotes.id, input.id));

      // === VINCULAR AO PONTO ===
      // Tipos de ocorrência que impactam o cartão de ponto
      const tiposVinculaveis = ['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'outro'];
      // Ações que NÃO gravam MARCADOR DISCIPLINAR no ponto (advertências/elogios sem impacto de horas)
      const acoesNaoVinculam = ['nenhuma'];
      // Tipos que carregam BATIDAS de ponto (entrada/saída)
      const tiposComHorario = ['atraso', 'saida_antecipada', 'esqueceu_bater', 'outro'];
      const temHorarioResolvido = !!(resolveEntrada1 || resolveSaida1 || resolveEntrada2 || resolveSaida2);

      // O marcador disciplinar (falta/atraso) respeita a acaoTomada.
      const deveMarcarDisciplina = !!note.data
        && tiposVinculaveis.includes(note.tipoOcorrencia)
        && !acoesNaoVinculam.includes(input.acaoTomada);
      // As BATIDAS do ponto são FATO (horário real), não ação disciplinar: quando o RH
      // confirma/ajusta um horário ao resolver o apontamento, ele DEVE refletir no espelho
      // de ponto MESMO com acaoTomada='nenhuma'. (Antes, atraso/saída antecipada nunca
      // gravavam entrada/saída no time_records e 'nenhuma' pulava a vinculação inteira,
      // então a correção do horário ficava só no field_notes e o espelho exibia o valor antigo.)
      const deveSincronizarHorario = !!note.data
        && tiposComHorario.includes(note.tipoOcorrencia)
        && temHorarioResolvido;

      if (deveMarcarDisciplina || deveSincronizarHorario) {
        const allRecs = await db.select().from(timeRecords)
          .where(and(
            eq(timeRecords.companyId, note.companyId),
            eq(timeRecords.employeeId, note.employeeId),
            eq(timeRecords.data, note.data),
          ));

        if (allRecs.length > 1) {
          const keepId = allRecs[0].id;
          const removeIds = allRecs.slice(1).map((r: any) => r.id);
          const mE1 = allRecs.reduce((v: any, r: any) => v || r.entrada1 || null, null);
          const mS1 = allRecs.reduce((v: any, r: any) => v || r.saida1 || null, null);
          const mE2 = allRecs.reduce((v: any, r: any) => v || r.entrada2 || null, null);
          const mS2 = allRecs.reduce((v: any, r: any) => v || r.saida2 || null, null);
          const mJust = allRecs.map((r: any) => r.justificativa).filter(Boolean).join(" | ");
          const mObra = allRecs.find((r: any) => r.obraId)?.obraId || note.obraId;
          await db.delete(timeRecords).where(inArray(timeRecords.id, removeIds));
          await db.update(timeRecords).set({
            entrada1: mE1, saida1: mS1, entrada2: mE2, saida2: mS2,
            justificativa: mJust, obraId: mObra,
          }).where(eq(timeRecords.id, keepId));
        }

        const existing = await db.select().from(timeRecords)
          .where(and(
            eq(timeRecords.companyId, note.companyId),
            eq(timeRecords.employeeId, note.employeeId),
            eq(timeRecords.data, note.data),
          ));
        const ex = existing[0];

        const justificativa = `[Apontamento #${note.id} - ${note.tipoOcorrencia}] ${input.respostaRH} (Resolvido por ${resolvidoPor})`;
        const mesRef = note.data.substring(0, 7);
        const exHadDixi = ex && (ex.fonte === "dixi" || ex.fonte === "dixi+apontamento");
        const resolveFonte = exHadDixi ? "dixi+apontamento" : "apontamento";

        // Guard anti-sobrescrita: NÃO regravar as batidas de uma correção POSTERIOR
        // (manual/dixi) com o horário ANTIGO do apontamento quando o RH não digitou um
        // horário novo na resolução. Batidas manuais/dixi são correções/importações que
        // vieram DEPOIS do apontamento — sincronizar de volta corromperia o ponto (mesma
        // razão pela qual o backfill desta correção tocou só fonte='apontamento'). Se o RH
        // digitou um horário explícito no resolve, esse vence (intenção deliberada).
        const temHorarioNovoInput = !!(input.entrada1 || input.saida1 || input.entrada2 || input.saida2);
        const exFonteProtegida = !!ex && (ex.fonte === "manual" || ex.fonte === "dixi" || ex.fonte === "dixi+apontamento");
        const podeSincronizarBatidas = temHorarioNovoInput || !exFonteProtegida;

        if ((note.tipoOcorrencia === 'falta' || note.tipoOcorrencia === 'abandono_posto') && deveMarcarDisciplina) {
          if (ex) {
            await db.update(timeRecords).set({
              faltas: "1", horasTrabalhadas: "00:00",
              justificativa: ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa,
              ajusteManual: 1, ajustadoPor: resolvidoPor,
              fonte: resolveFonte,
            }).where(eq(timeRecords.id, ex.id));
          } else {
            await db.insert(timeRecords).values({
              companyId: note.companyId, employeeId: note.employeeId,
              data: note.data, mesReferencia: mesRef, obraId: note.obraId,
              faltas: "1", horasTrabalhadas: "00:00",
              horasExtras: "0:00", horasNoturnas: "0:00", atrasos: "0:00",
              fonte: "apontamento", ajusteManual: 1, ajustadoPor: resolvidoPor, justificativa,
            });
          }
        } else if (note.tipoOcorrencia === 'esqueceu_bater' || note.tipoOcorrencia === 'outro') {
          const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
          const fE1 = resolveEntrada1 || ex?.entrada1 || null;
          const fS1 = resolveSaida1 || ex?.saida1 || null;
          const fE2 = resolveEntrada2 || ex?.entrada2 || null;
          const fS2 = resolveSaida2 || ex?.saida2 || null;
          let totalMin = 0;
          if (fE1 && fS1) totalMin += toMin(fS1) - toMin(fE1);
          if (fE2 && fS2) totalMin += toMin(fS2) - toMin(fE2);
          if (totalMin < 0) totalMin = 0;
          const hh = Math.floor(totalMin / 60);
          const mm = totalMin % 60;
          const horasTrabalhadas = `${hh}:${String(mm).padStart(2, '0')}`;

          if (ex) {
            if (podeSincronizarBatidas) {
              await db.update(timeRecords).set({
                entrada1: fE1, saida1: fS1, entrada2: fE2, saida2: fS2,
                horasTrabalhadas, faltas: "0",
                justificativa: ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa,
                ajusteManual: 1, ajustadoPor: resolvidoPor, fonte: resolveFonte,
              }).where(eq(timeRecords.id, ex.id));
            } else {
              // ex é correção posterior (manual/dixi) e o RH não digitou horário novo:
              // preserva as batidas/horas/fonte, só anexa a justificativa da resolução.
              await db.update(timeRecords).set({
                justificativa: ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa,
                ajusteManual: 1, ajustadoPor: resolvidoPor,
              }).where(eq(timeRecords.id, ex.id));
            }
          } else {
            await db.insert(timeRecords).values({
              companyId: note.companyId, employeeId: note.employeeId,
              data: note.data, mesReferencia: mesRef, obraId: note.obraId,
              entrada1: fE1, saida1: fS1, entrada2: fE2, saida2: fS2,
              horasTrabalhadas, faltas: "0",
              horasExtras: "0:00", horasNoturnas: "0:00", atrasos: "0:00",
              fonte: "apontamento", ajusteManual: 1, ajustadoPor: resolvidoPor, justificativa,
            });
          }
        } else if (note.tipoOcorrencia === 'atraso' || note.tipoOcorrencia === 'saida_antecipada') {
          const atrasoMarker = deveMarcarDisciplina && note.tipoOcorrencia === 'atraso' ? "1:00" : null;
          if (temHorarioResolvido) {
            // BATIDAS confirmadas pelo RH → refletem no espelho de ponto (fix do apontamento de atraso)
            const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
            const fE1 = resolveEntrada1 || ex?.entrada1 || null;
            const fS1 = resolveSaida1 || ex?.saida1 || null;
            const fE2 = resolveEntrada2 || ex?.entrada2 || null;
            const fS2 = resolveSaida2 || ex?.saida2 || null;
            let totalMin = 0;
            if (fE1 && fS1) totalMin += toMin(fS1) - toMin(fE1);
            if (fE2 && fS2) totalMin += toMin(fS2) - toMin(fE2);
            if (totalMin < 0) totalMin = 0;
            const hh = Math.floor(totalMin / 60);
            const mm = totalMin % 60;
            const horasTrabalhadas = `${hh}:${String(mm).padStart(2, '0')}`;
            if (ex) {
              if (podeSincronizarBatidas) {
                await db.update(timeRecords).set({
                  entrada1: fE1, saida1: fS1, entrada2: fE2, saida2: fS2,
                  horasTrabalhadas,
                  ...(atrasoMarker ? { atrasos: atrasoMarker } : {}),
                  justificativa: ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa,
                  ajusteManual: 1, ajustadoPor: resolvidoPor, fonte: resolveFonte,
                }).where(eq(timeRecords.id, ex.id));
              } else {
                // ex é correção posterior (manual/dixi) e sem horário novo: preserva as
                // batidas/horas/fonte; só marca disciplina (se houver) e anexa justificativa.
                await db.update(timeRecords).set({
                  ...(atrasoMarker ? { atrasos: atrasoMarker } : {}),
                  justificativa: ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa,
                  ajusteManual: 1, ajustadoPor: resolvidoPor,
                }).where(eq(timeRecords.id, ex.id));
              }
            } else {
              await db.insert(timeRecords).values({
                companyId: note.companyId, employeeId: note.employeeId,
                data: note.data, mesReferencia: mesRef, obraId: note.obraId,
                entrada1: fE1, saida1: fS1, entrada2: fE2, saida2: fS2,
                horasTrabalhadas, faltas: "0",
                horasExtras: "0:00", horasNoturnas: "0:00",
                atrasos: atrasoMarker || "0:00",
                fonte: "apontamento", ajusteManual: 1, ajustadoPor: resolvidoPor, justificativa,
              });
            }
          } else if (deveMarcarDisciplina) {
            // Sem horário informado: mantém o comportamento anterior (só marca atraso/justificativa).
            if (ex) {
              await db.update(timeRecords).set({
                atrasos: note.tipoOcorrencia === 'atraso' ? "1:00" : ex.atrasos,
                justificativa: ex.justificativa ? `${ex.justificativa} | ${justificativa}` : justificativa,
                ajusteManual: 1, ajustadoPor: resolvidoPor, fonte: resolveFonte,
              }).where(eq(timeRecords.id, ex.id));
            } else {
              await db.insert(timeRecords).values({
                companyId: note.companyId, employeeId: note.employeeId,
                data: note.data, mesReferencia: mesRef, obraId: note.obraId,
                faltas: "0", horasTrabalhadas: "00:00",
                horasExtras: "0:00", horasNoturnas: "0:00",
                atrasos: note.tipoOcorrencia === 'atraso' ? "1:00" : "0:00",
                fonte: "apontamento", ajusteManual: 1, ajustadoPor: resolvidoPor, justificativa,
              });
            }
          }
        }
      }

      return { success: true, vinculadoPonto: !!(deveMarcarDisciplina || deveSincronizarHorario) };
    }),

  setEmAnalise: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({ status: 'em_analise' }).where(eq(fieldNotes.id, input.id));
      return { success: true };
    }),

  reopen: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(fieldNotes).set({
        status: 'pendente',
        respostaRH: null,
        acaoTomada: null,
        resolvidoPor: null,
        resolvidoEm: null,
      }).where(eq(fieldNotes.id, input.id));
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
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const obrasFilter = await obrasFilterSql(ctx.user.id, ctx.user.role, sql`"obraId"`);
      if (obrasFilter?.empty) return { pendente: 0, em_analise: 0, resolvido: 0, arquivado: 0, urgentes: 0, altas: 0, total: 0 };
      const obrasClause = obrasFilter?.clause ?? sql``;
      const rows = ((await db.execute(sql`
        SELECT 
          status,
          COUNT(*) as total,
          SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgentes,
          SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as altas
        FROM field_notes
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL ${obrasClause}
        GROUP BY status
      `)) as any).rows || [];

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
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const obrasFilter = await obrasFilterSql(ctx.user.id, ctx.user.role, sql`fn."obraId"`);
      if (obrasFilter?.empty) return [];
      const obrasClause = obrasFilter?.clause ?? sql``;
      const dataConds: any[] = [];
      if (input.dataInicio) dataConds.push(sql`fn.data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`fn.data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const rows = ((await db.execute(sql`
        SELECT o.nome as "obraNome", fn."obraId", COUNT(*) as total,
          SUM(CASE WHEN fn.status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN fn.status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos
        FROM field_notes fn
        LEFT JOIN obras o ON fn."obraId" = o.id
        WHERE fn."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND fn."deletedAt" IS NULL ${extraWhere} ${obrasClause}
        GROUP BY fn."obraId", o.nome
        ORDER BY total DESC
      `)) as any).rows || [];
      return rows as { obraNome: string | null; obraId: number | null; total: number; pendentes: number; resolvidos: number }[];
    }),

  statsPorMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const obrasFilter = await obrasFilterSql(ctx.user.id, ctx.user.role, sql`"obraId"`);
      if (obrasFilter?.empty) return [];
      const obrasClause = obrasFilter?.clause ?? sql``;
      const ano = input.ano || new Date().getFullYear();
      const rows = ((await db.execute(sql`
        SELECT TO_CHAR(data, 'YYYY-MM') as mes, COUNT(*) as total,
          SUM(CASE WHEN status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes
        FROM field_notes
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL
          AND EXTRACT(YEAR FROM data) = ${ano} ${obrasClause}
        GROUP BY TO_CHAR(data, 'YYYY-MM')
        ORDER BY mes ASC
      `)) as any).rows || [];
      return rows as { mes: string; total: number; resolvidos: number; pendentes: number }[];
    }),

  taxaResolucao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const obrasFilter = await obrasFilterSql(ctx.user.id, ctx.user.role, sql`"obraId"`);
      if (obrasFilter?.empty) {
        return { total: 0, resolvidos: 0, pendentes: 0, emAnalise: 0, arquivados: 0, urgentes: 0, altas: 0, taxaResolucao: 0, tempoMedioResolucaoHoras: 0 };
      }
      const obrasClause = obrasFilter?.clause ?? sql``;
      const dataConds: any[] = [];
      if (input.dataInicio) dataConds.push(sql`data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const rows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN status = 'em_analise' THEN 1 ELSE 0 END) as "emAnalise",
          SUM(CASE WHEN status = 'arquivado' THEN 1 ELSE 0 END) as arquivados,
          SUM(CASE WHEN prioridade = 'urgente' THEN 1 ELSE 0 END) as urgentes,
          SUM(CASE WHEN prioridade = 'alta' THEN 1 ELSE 0 END) as altas,
          AVG(CASE WHEN "resolvidoEm" IS NOT NULL THEN EXTRACT(EPOCH FROM ("resolvidoEm" - "createdAt")) / 3600 END) as "tempoMedioResolucaoHoras"
        FROM field_notes
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL ${extraWhere} ${obrasClause}
      `)) as any).rows || [];
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
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const obrasFilter = await obrasFilterSql(ctx.user.id, ctx.user.role, sql`"obraId"`);
      if (obrasFilter?.empty) return [];
      const obrasClause = obrasFilter?.clause ?? sql``;
      const dataConds = [];
      if (input.dataInicio) dataConds.push(sql`data >= ${input.dataInicio}`);
      if (input.dataFim) dataConds.push(sql`data <= ${input.dataFim}`);
      const extraWhere = dataConds.length > 0 ? sql` AND ${sql.join(dataConds, sql` AND `)}` : sql``;

      const rows = ((await db.execute(sql`
        SELECT "tipoOcorrencia", COUNT(*) as total
        FROM field_notes
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL ${extraWhere} ${obrasClause}
        GROUP BY "tipoOcorrencia"
        ORDER BY total DESC
      `)) as any).rows || [];

      return rows as { tipoOcorrencia: string; total: number }[];
    }),
});
