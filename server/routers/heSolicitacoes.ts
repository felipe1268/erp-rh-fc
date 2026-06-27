import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog, getEffectiveAllowedObraIds, userCanAccessObra, recordTrashEntry, captureRowSnapshot } from "../db";
import {
  heSolicitacoes, heSolicitacaoFuncionarios, heSolicitacaoAtividades, heSolicitacaoConfirmacoes,
  employees, obras, terminationNotices, timeRecords,
  planejamentoAtividades, planejamentoProjetos, planejamentoRevisoes, planejamentoRefis,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull, asc } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { verificarAssinaturaMemorial } from "../services/assinaturaMemorial";

export const heSolicitacoesRouter = router({

  // ===================== CRIAR SOLICITAÇÃO =====================
  create: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional(),
    planejamentoAtividadeId: z.number().optional(),
    planejamentoAtividadeIds: z.array(z.number()).optional(),
    dataSolicitacao: z.string().min(10), // YYYY-MM-DD
    horaInicio: z.string().optional(),
    horaFim: z.string().optional(),
    motivo: z.string().min(5, "Motivo deve ter pelo menos 5 caracteres"),
    observacoes: z.string().optional(),
    funcionarioIds: z.array(z.number()).min(1, "Selecione pelo menos 1 funcionário"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    // Guard: não-admin só pode criar solicitação em obra liberada para ele.
    // Quando `obraId` vier omitido (undefined), `userCanAccessObra(null)` retorna
    // false para não-admin — impede criação fora do escopo de obra.
    if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, input.obraId ?? null))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
    }

    // === VALIDAÇÃO: bloquear funcionários desligados/inativos ===
    const empsCheck = await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, status: employees.status })
      .from(employees)
      .where(inArray(employees.id, input.funcionarioIds));
    const bloqueados = empsCheck.filter(e => ['Desligado', 'Lista_Negra', 'Inativo'].includes(e.status || ''));
    if (bloqueados.length > 0) {
      const nomes = bloqueados.map(e => e.nomeCompleto).join(", ");
      throw new TRPCError({ code: "BAD_REQUEST", message: `Funcionário(s) desligado(s) não podem ser incluídos em HE: ${nomes}` });
    }

    // Resolver lista de IDs de atividades (suporta array ou single)
    const atividadeIds: number[] = input.planejamentoAtividadeIds?.length
      ? input.planejamentoAtividadeIds
      : input.planejamentoAtividadeId
        ? [input.planejamentoAtividadeId]
        : [];

    // Criar a solicitação
    const [result] = await db.insert(heSolicitacoes).values({
      companyId: input.companyId,
      obraId: input.obraId || null,
      planejamentoAtividadeId: atividadeIds[0] || null,
      dataSolicitacao: input.dataSolicitacao,
      horaInicio: input.horaInicio || null,
      horaFim: input.horaFim || null,
      motivo: input.motivo,
      observacoes: input.observacoes || null,
      status: "pendente",
      solicitadoPor: ctx.user.name || "Sistema",
      solicitadoPorId: ctx.user.id,
    }).returning({ id: heSolicitacoes.id });

    const solicitacaoId = result.id;

    // Vincular funcionários (Rev. 2543 — dedup p/ evitar vínculo duplicado → join 1:N no Raio-X)
    const funcionarioIdsCreate = Array.from(new Set(input.funcionarioIds));
    if (funcionarioIdsCreate.length > 0) {
      await db.insert(heSolicitacaoFuncionarios).values(
        funcionarioIdsCreate.map(empId => ({
          solicitacaoId: Number(solicitacaoId),
          employeeId: empId,
          status: "pendente" as const,
        }))
      );
    }

    // Vincular atividades (join table) — suporta múltiplas
    if (atividadeIds.length > 0) {
      const db2 = await getDb();
      if (db2) {
        await db2.execute(sql`
          INSERT INTO he_solicitacao_atividades (solicitacao_id, atividade_id)
          VALUES ${sql.join(atividadeIds.map(aid => sql`(${solicitacaoId}, ${aid})`), sql`, `)}
          ON CONFLICT DO NOTHING
        `);
      }
    }

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "CREATE",
      module: "he_solicitacoes",
      entityType: "he_solicitacao",
      entityId: Number(solicitacaoId),
      details: `Solicitação de HE criada para ${input.dataSolicitacao} com ${input.funcionarioIds.length} funcionário(s)`,
    });

    return { id: Number(solicitacaoId), success: true };
  }),

  // ===================== LISTAR SOLICITAÇÕES =====================
  list: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.enum(["pendente", "aprovada", "rejeitada", "cancelada", "todas"]).optional(),
    mesReferencia: z.string().optional(), // YYYY-MM (fallback quando dataInicio/dataFim ausentes)
    // Rev. 2060 — bounds do CICLO de fechamento (16→15). Quando informados,
    // têm prioridade sobre `mesReferencia LIKE`, evitando perder HEs de mes
    // anterior em ciclos que cruzam virada de mês (ex: 16/04→15/05 perdia
    // todas as HEs de abril porque mesAno='2026-05').
    dataInicio: z.string().optional(), // YYYY-MM-DD
    dataFim: z.string().optional(),    // YYYY-MM-DD
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const conditions = [companyFilter(heSolicitacoes.companyId, input)];
    if (input.status && input.status !== "todas") {
      conditions.push(eq(heSolicitacoes.status, input.status));
    }
    if (input.dataInicio && input.dataFim) {
      // Rev. 2060 — filtro por bounds do ciclo (preferido)
      conditions.push(sql`${heSolicitacoes.dataSolicitacao} BETWEEN ${input.dataInicio} AND ${input.dataFim}`);
    } else if (input.mesReferencia) {
      conditions.push(sql`${heSolicitacoes.dataSolicitacao} LIKE ${input.mesReferencia + '%'}`);
    }

    // Filtro centralizado por obras permitidas. Solicitações sem obra só para admin.
    const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
    if (allowed !== null) {
      if (allowed.length === 0) return [];
      conditions.push(inArray(heSolicitacoes.obraId, allowed));
    }

    const rows = await db.select().from(heSolicitacoes)
      .where(and(...conditions))
      .orderBy(desc(heSolicitacoes.createdAt));

    // Para cada solicitação, buscar funcionários vinculados
    const result = [];
    for (const sol of rows) {
      const funcs = await db.select({
        id: heSolicitacaoFuncionarios.id,
        employeeId: heSolicitacaoFuncionarios.employeeId,
        horasRealizadas: heSolicitacaoFuncionarios.horasRealizadas,
        status: heSolicitacaoFuncionarios.status,
        observacao: heSolicitacaoFuncionarios.observacao,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
        employeeFuncao: employees.funcao,
        employeeSalarioBase: employees.salarioBase,
        employeeValorHora: employees.valorHora,
        employeeHeNormal50: employees.heNormal50,
        employeeHe100: employees.he100,
        employeeHeFeriado: employees.heFeriado,
        employeeHeNoturna: employees.heNoturna,
        employeeAcordoHE: employees.acordoHoraExtra,
      }).from(heSolicitacaoFuncionarios)
        .leftJoin(employees, eq(heSolicitacaoFuncionarios.employeeId, employees.id))
        .where(eq(heSolicitacaoFuncionarios.solicitacaoId, sol.id));

      // Buscar nome da obra se houver
      let obraNome = null;
      if (sol.obraId) {
        const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, sol.obraId));
        obraNome = obra?.nome || null;
      }

      const isAdmin = ctx.user.role === "admin_master" || ctx.user.role === "admin";
      const canEdit = isAdmin || (sol.solicitadoPorId === ctx.user.id && sol.status === "pendente");
      result.push({ ...sol, obraNome, funcionarios: funcs, canEdit });
    }

    return result;
  }),

  // ===================== APROVADAS SEM PONTO (Rev. 2217) =====================
  // Lista funcionários cuja solicitação de HE foi APROVADA mas que não bateram
  // ponto naquele dia (sem time_record OU horasTrabalhadas vazio/0:00). RH
  // analisa caso a caso se paga (HE retroativa manual) ou não.
  //
  // Aplica o mesmo filtro de obras permitidas que `list` (R-007: tenant safety).
  aprovadasSemPonto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      dataInicio: z.string().optional(), // YYYY-MM-DD
      dataFim: z.string().optional(),    // YYYY-MM-DD
      mesReferencia: z.string().optional(), // YYYY-MM (fallback)
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [] as any[];
      const cids = resolveCompanyIds(input);
      if (cids.length === 0) return [];

      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && allowed.length === 0) return [];
      const obrasClause = allowed === null
        ? sql``
        : sql` AND s."obraId" IN (${sql.join(allowed.map((id) => sql`${id}`), sql`,`)})`;

      let dateClause = sql``;
      if (input.dataInicio && input.dataFim) {
        dateClause = sql` AND s."dataSolicitacao" BETWEEN ${input.dataInicio}::date AND ${input.dataFim}::date`;
      } else if (input.mesReferencia) {
        dateClause = sql` AND TO_CHAR(s."dataSolicitacao", 'YYYY-MM') = ${input.mesReferencia}`;
      }

      // Rev. 2219 — LATERAL JOIN com `he_periods` pra detectar se a data da
      // solicitação cai dentro de um período HE já calculado/aprovado/pago.
      // Se cair, o frontend exibe badge "Período HE aprovado — não lançar
      // manual" pra evitar pagamento em duplicidade (RH adicionar HE no
      // Espelho de Ponto enquanto o período já foi/será reprocessado).
      // Também checa `he_period_employees` pra saber se o funcionário já
      // tem linha no período (`temLinhaNoPeriodo`) — se sim, recalcular o
      // período já basta; se não, a manual é mais segura.
      const rows = ((await db.execute(sql`
        SELECT s.id AS "solicitacaoId",
               s."dataSolicitacao",
               s."horaInicio", s."horaFim",
               s.motivo,
               s."obraId", o.nome AS "obraNome",
               sf."employeeId",
               e."nomeCompleto" AS "employeeName",
               e."codigoInterno",
               e.funcao,
               e."fotoUrl",
               hp.id           AS "hePeriodoId",
               hp."dataInicio" AS "hePeriodoInicio",
               hp."dataFim"    AS "hePeriodoFim",
               hp.status       AS "hePeriodoStatus",
               hp."aprovadoEm" AS "hePeriodoAprovadoEm",
               hp."pagoEm"     AS "hePeriodoPagoEm",
               EXISTS (
                 SELECT 1 FROM he_period_employees hpe
                 WHERE hpe."hePeriodId" = hp.id
                   AND hpe."employeeId" = sf."employeeId"
               )               AS "temLinhaNoPeriodo"
        FROM he_solicitacoes s
        JOIN he_solicitacao_funcionarios sf ON sf."solicitacaoId" = s.id
        LEFT JOIN employees e ON e.id = sf."employeeId"
        LEFT JOIN obras o ON o.id = s."obraId"
        LEFT JOIN LATERAL (
          SELECT hp2.*
          FROM he_periods hp2
          WHERE hp2."companyId" = s."companyId"
            AND s."dataSolicitacao" BETWEEN hp2."dataInicio" AND hp2."dataFim"
          ORDER BY
            CASE hp2.status
              WHEN 'pago'      THEN 0
              WHEN 'aprovado'  THEN 1
              WHEN 'calculado' THEN 2
              ELSE 3
            END,
            hp2."criadoEm" DESC
          LIMIT 1
        ) hp ON TRUE
        WHERE s."companyId" IN (${sql.join(cids.map((c) => sql`${c}`), sql`,`)})
          AND s.status = 'aprovada'
          ${dateClause}
          ${obrasClause}
          -- Rev. 2221 -- "SEM ponto na HE" = sem evidência de que o
          -- intervalo aprovado foi efetivamente batido (ver changelog).
          AND NOT EXISTS (
            SELECT 1 FROM time_records tr
            WHERE tr."employeeId" = sf."employeeId"
              AND tr.data = s."dataSolicitacao"
              AND (
                (tr."horasExtras" IS NOT NULL
                  AND tr."horasExtras" NOT IN ('', '0', '0:0', '0:00', '00:00', '00:0'))
                OR (
                  s."horaInicio" IS NOT NULL AND s."horaFim" IS NOT NULL AND (
                    (tr.entrada1 IS NOT NULL AND tr.entrada1 BETWEEN s."horaInicio" AND s."horaFim") OR
                    (tr.saida1   IS NOT NULL AND tr.saida1   BETWEEN s."horaInicio" AND s."horaFim") OR
                    (tr.entrada2 IS NOT NULL AND tr.entrada2 BETWEEN s."horaInicio" AND s."horaFim") OR
                    (tr.saida2   IS NOT NULL AND tr.saida2   BETWEEN s."horaInicio" AND s."horaFim") OR
                    (tr.entrada3 IS NOT NULL AND tr.entrada3 BETWEEN s."horaInicio" AND s."horaFim") OR
                    (tr.saida3   IS NOT NULL AND tr.saida3   BETWEEN s."horaInicio" AND s."horaFim")
                  )
                )
              )
          )
        ORDER BY s."dataSolicitacao" DESC, e."nomeCompleto" ASC
      `)) as any).rows || [];

      return rows.map((r: any) => {
        const periodo = r.hePeriodoId
          ? {
              id: Number(r.hePeriodoId),
              dataInicio: r.hePeriodoInicio instanceof Date
                ? r.hePeriodoInicio.toISOString().slice(0, 10)
                : String(r.hePeriodoInicio).slice(0, 10),
              dataFim: r.hePeriodoFim instanceof Date
                ? r.hePeriodoFim.toISOString().slice(0, 10)
                : String(r.hePeriodoFim).slice(0, 10),
              status: String(r.hePeriodoStatus || "calculado"),
              aprovadoEm: r.hePeriodoAprovadoEm || null,
              pagoEm: r.hePeriodoPagoEm || null,
              temLinhaNoPeriodo: !!r.temLinhaNoPeriodo,
            }
          : null;
        return {
          solicitacaoId: Number(r.solicitacaoId),
          dataSolicitacao: r.dataSolicitacao instanceof Date
            ? r.dataSolicitacao.toISOString().slice(0, 10)
            : String(r.dataSolicitacao).slice(0, 10),
          horaInicio: r.horaInicio || null,
          horaFim: r.horaFim || null,
          motivo: r.motivo || "",
          obraId: r.obraId != null ? Number(r.obraId) : null,
          obraNome: r.obraNome || null,
          employeeId: Number(r.employeeId),
          employeeName: r.employeeName || `ID ${r.employeeId}`,
          codigoInterno: r.codigoInterno || null,
          funcao: r.funcao || null,
          fotoUrl: r.fotoUrl || null,
          periodoHE: periodo,
        };
      });
    }),

  // ===================== LANÇAR PONTO MANUAL A PARTIR DO ALERTA HE =====================
  // Rev. 2222 — RH digita o ponto direto no card do alerta "HE aprovada SEM
  // ponto". Cria/atualiza time_records (entrada1/saida1) com horasExtras =
  // duração informada, fonte='manual', ajusteManual=1. Não trata HE cruzando
  // meia-noite (mesma limitação do alerta atual).
  lancarPontoFromHE: protectedProcedure
    .input(z.object({
      solicitacaoId: z.number(),
      employeeIds: z.array(z.number()).min(1),
      horaInicio: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
      horaFim: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.solicitacaoId));
      if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
      if (sol.status !== "aprovada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só lança ponto para HE aprovada" });
      }
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, sol.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra" });
      }

      const toMin = (hhmm: string) => {
        const [h, m] = hhmm.split(":").map(Number);
        return h * 60 + m;
      };
      const minIni = toMin(input.horaInicio);
      const minFim = toMin(input.horaFim);
      if (minFim <= minIni) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hora fim deve ser maior que hora início (HE cruzando meia-noite não suportada)" });
      }
      const totalMin = minFim - minIni;
      const totalHHMM = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

      // Confirma que os funcionários estão de fato vinculados à solicitação
      const sfRows = await db.select({ employeeId: heSolicitacaoFuncionarios.employeeId })
        .from(heSolicitacaoFuncionarios)
        .where(and(
          eq(heSolicitacaoFuncionarios.solicitacaoId, input.solicitacaoId),
          inArray(heSolicitacaoFuncionarios.employeeId, input.employeeIds),
        ));
      const validIds = new Set(sfRows.map((r: any) => Number(r.employeeId)));
      const filtered = input.employeeIds.filter((id) => validIds.has(id));
      if (filtered.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum funcionário válido para esta solicitação" });
      }

      const data = sol.dataSolicitacao;
      const mesRef = data.substring(0, 7);
      const ajustadoPor = ctx.user.name || "RH";
      const numero = `HE-${String(sol.id).padStart(5, "0")}`;
      const justificativa = `[HE manual ${numero}] Lançado da tela de alerta por ${ajustadoPor} (${input.horaInicio}—${input.horaFim})`;

      let created = 0;
      let updated = 0;

      for (const empId of filtered) {
        await db.transaction(async (tx: any) => {
          const [yLk, mLk, dLk] = data.split("-").map(Number);
          const dateKey = (yLk * 10000) + (mLk * 100) + dLk;
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${empId}, ${dateKey})`);

          const existing = await tx.select().from(timeRecords)
            .where(and(
              eq(timeRecords.companyId, sol.companyId),
              eq(timeRecords.employeeId, empId),
              eq(timeRecords.data, data),
            ))
            .limit(1);

          if (existing.length > 0) {
            const prev = existing[0] as any;
            await tx.update(timeRecords).set({
              entrada1: input.horaInicio,
              saida1: input.horaFim,
              horasTrabalhadas: totalHHMM,
              horasExtras: totalHHMM,
              obraId: prev.obraId || sol.obraId || null,
              mesReferencia: mesRef,
              fonte: "manual",
              ajusteManual: 1,
              ajustadoPor,
              justificativa: prev.justificativa
                ? `${prev.justificativa} | ${justificativa}`
                : justificativa,
            } as any).where(eq(timeRecords.id, prev.id));
            updated++;
          } else {
            await tx.insert(timeRecords).values({
              companyId: sol.companyId,
              employeeId: empId,
              data,
              mesReferencia: mesRef,
              obraId: sol.obraId || null,
              entrada1: input.horaInicio,
              saida1: input.horaFim,
              entrada2: null,
              saida2: null,
              entrada3: null,
              saida3: null,
              horasTrabalhadas: totalHHMM,
              horasExtras: totalHHMM,
              horasNoturnas: "0:00",
              faltas: "0",
              atrasos: "0:00",
              fonte: "manual",
              ajusteManual: 1,
              ajustadoPor,
              justificativa,
              tipoDia: "normal",
            } as any);
            created++;
          }
        });
      }

      await createAuditLog({
        userId: ctx.user.id,
        userName: ctx.user.name || "Sistema",
        companyId: sol.companyId,
        action: "UPDATE",
        module: "he_solicitacoes",
        entityType: "time_records",
        entityId: input.solicitacaoId,
        details: `HE manual ${numero} (${data} ${input.horaInicio}—${input.horaFim}): ${created} criado(s), ${updated} atualizado(s) em ${filtered.length} func(s)`,
      });

      return { success: true, created, updated, total: filtered.length };
    }),

  // ===================== DETALHES DE UMA SOLICITAÇÃO =====================
  getById: protectedProcedure.input(z.object({
    id: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
    if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, sol.obraId))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta solicitação" });
    }

    const funcs = await db.select({
      id: heSolicitacaoFuncionarios.id,
      employeeId: heSolicitacaoFuncionarios.employeeId,
      horasRealizadas: heSolicitacaoFuncionarios.horasRealizadas,
      status: heSolicitacaoFuncionarios.status,
      observacao: heSolicitacaoFuncionarios.observacao,
      employeeName: employees.nomeCompleto,
      employeeCpf: employees.cpf,
      employeeFuncao: employees.funcao,
      employeeFotoUrl: employees.fotoUrl,
      employeeSalarioBase: employees.salarioBase,
      employeeValorHora: employees.valorHora,
      employeeHeNormal50: employees.heNormal50,
      employeeHe100: employees.he100,
      employeeHeFeriado: employees.heFeriado,
      employeeHeNoturna: employees.heNoturna,
      employeeAcordoHE: employees.acordoHoraExtra,
      employeeCargoConfianca: employees.cargoConfianca,
      employeeCargoConfiancaInciso: employees.cargoConfiancaInciso,
    }).from(heSolicitacaoFuncionarios)
      .leftJoin(employees, eq(heSolicitacaoFuncionarios.employeeId, employees.id))
      .where(eq(heSolicitacaoFuncionarios.solicitacaoId, sol.id));

    let obraNome = null;
    if (sol.obraId) {
      const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, sol.obraId));
      obraNome = obra?.nome || null;
    }

    // Buscar atividades vinculadas (join table — suporta múltiplas)
    const atividadesVinculadasRaw = await db.execute(sql`
      SELECT a.id, a.nome,
             a.eap_codigo   AS "eapCodigo",
             a.data_inicio  AS "dataInicio",
             a.data_fim     AS "dataFim"
      FROM he_solicitacao_atividades hsa
      JOIN planejamento_atividades a ON a.id = hsa.atividade_id
      WHERE hsa.solicitacao_id = ${sol.id}
      ORDER BY a.eap_codigo
    `);
    const atividadesVinculadas: any[] = (atividadesVinculadasRaw as any)?.rows ?? atividadesVinculadasRaw ?? [];

    // Backward compat: se join table vazia mas coluna legada preenchida, buscar atividade legada
    let atividadeInfo = atividadesVinculadas[0] || null;
    if (atividadesVinculadas.length === 0 && sol.planejamentoAtividadeId) {
      const [atv] = await db.select({
        id: planejamentoAtividades.id,
        nome: planejamentoAtividades.nome,
        eapCodigo: planejamentoAtividades.eapCodigo,
        dataInicio: planejamentoAtividades.dataInicio,
        dataFim: planejamentoAtividades.dataFim,
      }).from(planejamentoAtividades).where(eq(planejamentoAtividades.id, sol.planejamentoAtividadeId));
      if (atv) { atividadeInfo = atv; atividadesVinculadas.push(atv); }
    }

    return { ...sol, obraNome, atividadeInfo, atividadesVinculadas, funcionarios: funcs };
  }),

  // ===================== APROVAR SOLICITAÇÃO (Admin Master) =====================
  // Permite aprovar pendentes OU reverter rejeitadas
  approve: protectedProcedure.input(z.object({
    id: z.number(),
    observacaoAdmin: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode aprovar solicitações de HE" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
    if (sol.status === "aprovada") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação já está aprovada" });
    }
    if (sol.status === "cancelada") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível aprovar uma solicitação cancelada" });
    }

    const isReversao = sol.status === "rejeitada";
    const jaFoiAprovadaAntes = !!(sol.observacaoAdmin && sol.observacaoAdmin.includes("[REVERSÃO"));

    await db.update(heSolicitacoes).set({
      status: "aprovada",
      aprovadoPor: ctx.user.name || "Admin",
      aprovadoPorId: ctx.user.id,
      aprovadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
      observacaoAdmin: input.observacaoAdmin || sol.observacaoAdmin || null,
    }).where(eq(heSolicitacoes.id, input.id));

    // === ACUMULAR CUSTO NO REFI quando HE está vinculada a atividades ===
    // Pula se é reversão de rejeição OU se já foi aprovada antes (evita double-counting após reverter)
    if (!isReversao && !jaFoiAprovadaAntes) {
      try {
        // Buscar todas as atividades vinculadas (join table + legada)
        const atvsRaw = await db.execute(sql`
          SELECT DISTINCT a.id, a.projeto_id AS "projetoId"
          FROM he_solicitacao_atividades hsa
          JOIN planejamento_atividades a ON a.id = hsa.atividade_id
          WHERE hsa.solicitacao_id = ${sol.id}
          UNION
          SELECT a.id, a.projeto_id AS "projetoId" FROM planejamento_atividades a
          WHERE a.id = ${sol.planejamentoAtividadeId ?? 0}
            AND NOT EXISTS (SELECT 1 FROM he_solicitacao_atividades WHERE solicitacao_id = ${sol.id})
        `);
        const atvsLinked: any[] = ((atvsRaw as any)?.rows ?? atvsRaw ?? []).filter((a: any) => a.id);

        // Calcular custo total da HE
        const funcsAll = await db.select({
          valorHora: employees.valorHora,
          salarioBase: employees.salarioBase,
          heNormal50: employees.heNormal50,
          he100: employees.he100,
          heFeriado: employees.heFeriado,
        }).from(heSolicitacaoFuncionarios)
          .leftJoin(employees, eq(heSolicitacaoFuncionarios.employeeId, employees.id))
          .where(eq(heSolicitacaoFuncionarios.solicitacaoId, sol.id));

        const calcHorasLocal = (ini: string, fim: string) => {
          const [h1, m1] = ini.split(":").map(Number);
          const [h2, m2] = fim.split(":").map(Number);
          const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
          return mins > 0 ? mins / 60 : 0;
        };
        const horas = (sol.horaInicio && sol.horaFim) ? calcHorasLocal(sol.horaInicio, sol.horaFim) : 0;
        const diaSemana = sol.dataSolicitacao ? new Date(sol.dataSolicitacao + "T12:00:00").getDay() : -1;
        const isWeekendApprove = diaSemana === 0 || diaSemana === 6;

        let custoHE = 0;
        for (const f of funcsAll) {
          let vh: number | null = null;
          if (f.valorHora) { const v = parseFloat(String(f.valorHora).replace(",", ".")); if (!isNaN(v) && v > 0) vh = v; }
          if (!vh && f.salarioBase) { const s = parseFloat(String(f.salarioBase).replace(",", ".")); if (!isNaN(s) && s > 0) vh = s / 220; }
          // Usar percentual cadastrado no funcionário, com fallback para 50%/100%
          const pctStr = isWeekendApprove
            ? (f.he100 ?? f.heFeriado ?? "100")
            : (f.heNormal50 ?? "50");
          const pct = parseFloat(String(pctStr).replace(",", ".")) || (isWeekendApprove ? 100 : 50);
          if (vh && horas > 0) custoHE += vh * (1 + pct / 100) * horas;
        }

        // Distribuir custo igualmente entre as atividades vinculadas
        const custoPerAtv = atvsLinked.length > 0 ? custoHE / atvsLinked.length : 0;

        // Agrupar atividades por projeto para upsert no REFI
        const projetoMap: Record<number, number> = {};
        for (const atv of atvsLinked) {
          if (atv.projetoId) projetoMap[atv.projetoId] = (projetoMap[atv.projetoId] || 0) + custoPerAtv;
        }

        for (const [projetoIdStr, custoTotal] of Object.entries(projetoMap)) {
          if (custoTotal <= 0) continue;
          const projetoId = parseInt(projetoIdStr);
          const dataHE = new Date(sol.dataSolicitacao + "T12:00:00");
          const diaSem = dataHE.getDay();
          const diff = diaSem === 0 ? -6 : 1 - diaSem;
          const segunda = new Date(dataHE);
          segunda.setDate(dataHE.getDate() + diff);
          const semanaStr = segunda.toISOString().split("T")[0];

          const [refExist] = await db.select({ id: planejamentoRefis.id, custoRealizado: planejamentoRefis.custoRealizado })
            .from(planejamentoRefis)
            .where(and(eq(planejamentoRefis.projetoId, projetoId), eq(planejamentoRefis.semana, semanaStr)));

          if (refExist) {
            const novoRealizado = parseFloat(String(refExist.custoRealizado || "0")) + custoTotal;
            await db.update(planejamentoRefis).set({ custoRealizado: String(novoRealizado.toFixed(2)) })
              .where(eq(planejamentoRefis.id, refExist.id));
          } else {
            await db.insert(planejamentoRefis).values({
              projetoId, semana: semanaStr,
              custoRealizado: String(custoTotal.toFixed(2)),
              criadoPor: ctx.user.name || "Sistema",
            });
          }
        }
      } catch (e) {
        console.warn("[HE] Erro ao acumular custo no REFI:", e);
      }
    }

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: sol.companyId,
      action: "APPROVE",
      module: "he_solicitacoes",
      entityType: "he_solicitacao",
      entityId: input.id,
      details: isReversao
        ? `Solicitação de HE #${input.id} REVERTIDA de rejeitada → aprovada para ${sol.dataSolicitacao}`
        : `Solicitação de HE #${input.id} aprovada para ${sol.dataSolicitacao}${sol.planejamentoAtividadeId ? ` (atividade #${sol.planejamentoAtividadeId})` : ""}`,
    });

    return { success: true, reversao: isReversao };
  }),

  // ===================== REJEITAR SOLICITAÇÃO (Admin Master) =====================
  // Permite rejeitar pendentes OU reverter aprovadas
  reject: protectedProcedure.input(z.object({
    id: z.number(),
    motivoRejeicao: z.string().min(5, "Informe o motivo da rejeição"),
    observacaoAdmin: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode rejeitar solicitações de HE" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
    if (sol.status === "rejeitada") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação já está rejeitada" });
    }
    if (sol.status === "cancelada") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível rejeitar uma solicitação cancelada" });
    }

    const isReversao = sol.status === "aprovada";

    await db.update(heSolicitacoes).set({
      status: "rejeitada",
      aprovadoPor: ctx.user.name || "Admin",
      aprovadoPorId: ctx.user.id,
      aprovadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
      motivoRejeicao: input.motivoRejeicao,
      observacaoAdmin: input.observacaoAdmin || sol.observacaoAdmin || null,
    }).where(eq(heSolicitacoes.id, input.id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: sol.companyId,
      action: "REJECT",
      module: "he_solicitacoes",
      entityType: "he_solicitacao",
      entityId: input.id,
      details: isReversao
        ? `Solicitação de HE #${input.id} REVERTIDA de aprovada → rejeitada: ${input.motivoRejeicao}`
        : `Solicitação de HE #${input.id} rejeitada: ${input.motivoRejeicao}`,
    });

    return { success: true, reversao: isReversao };
  }),

  // ===================== REVERTER APROVAÇÃO (Admin Master, com motivo obrigatório) =====================
  reverterAprovacao: protectedProcedure.input(z.object({
    id: z.number(),
    motivo: z.string().min(5, "Informe o motivo da reversão (mínimo 5 caracteres)"),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode reverter aprovações de HE" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

    if (sol.status === "pendente") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação já está pendente — nada a reverter" });
    }
    if (sol.status === "cancelada") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível reverter uma solicitação cancelada" });
    }

    const statusAnterior = sol.status;
    const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
    const obsReversao = `[REVERSÃO ${agora}] De "${statusAnterior}" para "pendente" por ${ctx.user.name || "Admin"}: ${input.motivo}`;
    const obsAtual = sol.observacaoAdmin ? `${sol.observacaoAdmin}\n${obsReversao}` : obsReversao;

    await db.update(heSolicitacoes).set({
      status: "pendente",
      aprovadoPor: null,
      aprovadoPorId: null,
      aprovadoEm: null,
      motivoRejeicao: null,
      observacaoAdmin: obsAtual,
    }).where(eq(heSolicitacoes.id, input.id));

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: sol.companyId,
      action: "REVERT",
      module: "he_solicitacoes",
      entityType: "he_solicitacao",
      entityId: input.id,
      details: `Solicitação de HE #${input.id} REVERTIDA de "${statusAnterior}" → "pendente". Motivo: ${input.motivo}`,
    });

    return { success: true, statusAnterior };
  }),

  // ===================== EDITAR SOLICITAÇÃO (pelo solicitante, enquanto pendente) =====================
  update: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    obraId: z.number().optional(),
    planejamentoAtividadeIds: z.array(z.number()).optional(),
    dataSolicitacao: z.string().optional(),
    horaInicio: z.string().optional(),
    horaFim: z.string().optional(),
    motivo: z.string().optional(),
    observacoes: z.string().optional(),
    funcionarioIds: z.array(z.number()).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

    if (sol.status !== "pendente") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível editar solicitações pendentes." });
    }

    if (sol.solicitadoPorId !== ctx.user.id && ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o solicitante ou Admin pode editar." });
    }

    const updateData: any = { updatedAt: new Date().toISOString() };
    if (input.obraId !== undefined) updateData.obraId = input.obraId || null;
    if (input.dataSolicitacao) updateData.dataSolicitacao = input.dataSolicitacao;
    if (input.horaInicio !== undefined) updateData.horaInicio = input.horaInicio || null;
    if (input.horaFim !== undefined) updateData.horaFim = input.horaFim || null;
    if (input.motivo) updateData.motivo = input.motivo;
    if (input.observacoes !== undefined) updateData.observacoes = input.observacoes || null;

    await db.update(heSolicitacoes).set(updateData).where(eq(heSolicitacoes.id, input.id));

    if (input.funcionarioIds && input.funcionarioIds.length > 0) {
      // Rev. 2543 — dedup p/ evitar vínculo duplicado (sem UNIQUE na tabela) → join 1:N no Raio-X
      const funcionarioIdsUpdate = Array.from(new Set(input.funcionarioIds));
      await db.delete(heSolicitacaoFuncionarios).where(eq(heSolicitacaoFuncionarios.solicitacaoId, input.id));
      await db.insert(heSolicitacaoFuncionarios).values(
        funcionarioIdsUpdate.map(empId => ({
          solicitacaoId: input.id,
          employeeId: empId,
          status: "pendente" as const,
        }))
      );
    }

    if (input.planejamentoAtividadeIds !== undefined) {
      await db.execute(sql`DELETE FROM he_solicitacao_atividades WHERE solicitacao_id = ${input.id}`);
      if (input.planejamentoAtividadeIds.length > 0) {
        await db.execute(sql`
          INSERT INTO he_solicitacao_atividades (solicitacao_id, atividade_id)
          VALUES ${sql.join(input.planejamentoAtividadeIds.map(aid => sql`(${input.id}, ${aid})`), sql`, `)}
          ON CONFLICT DO NOTHING
        `);
      }
    }

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: input.companyId,
      action: "UPDATE",
      module: "he_solicitacoes",
      entityType: "he_solicitacao",
      entityId: input.id,
      details: `Solicitação de HE #${input.id} editada pelo solicitante`,
    });

    return { success: true };
  }),

  // ===================== CANCELAR SOLICITAÇÃO (pelo solicitante) =====================
  cancel: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
    if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, sol.obraId))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta solicitação" });
    }
    if (sol.status !== "pendente") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível cancelar solicitações pendentes" });
    }
    // Apenas o solicitante ou admin master pode cancelar
    if (sol.solicitadoPorId !== ctx.user.id && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o solicitante ou Admin Master pode cancelar" });
    }

    await db.update(heSolicitacoes).set({
      status: "cancelada",
    }).where(eq(heSolicitacoes.id, input.id));

    return { success: true };
  }),

  // ===================== CONTADORES PARA BADGES =====================
  counts: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { pendentes: 0, aprovadas: 0, rejeitadas: 0, total: 0 };

    const [result] = await db.select({
      pendentes: sql<number>`SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END)`,
      aprovadas: sql<number>`SUM(CASE WHEN status = 'aprovada' THEN 1 ELSE 0 END)`,
      rejeitadas: sql<number>`SUM(CASE WHEN status = 'rejeitada' THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    }).from(heSolicitacoes)
      .where(companyFilter(heSolicitacoes.companyId, input));

    return {
      pendentes: Number(result?.pendentes || 0),
      aprovadas: Number(result?.aprovadas || 0),
      rejeitadas: Number(result?.rejeitadas || 0),
      total: Number(result?.total || 0),
    };
  }),

  // ===================== VERIFICAR HE AUTORIZADA PARA FUNCIONÁRIO/DATA =====================
  // Usado pelo motor CLT no fechamento para determinar se HE foi autorizada
  checkAuthorized: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
    data: z.string(), // YYYY-MM-DD
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { authorized: false, solicitacao: null };

    // Buscar solicitação aprovada para esta data que inclua o funcionário
    const rows = await db.select({
      solId: heSolicitacoes.id,
      horaInicio: heSolicitacoes.horaInicio,
      horaFim: heSolicitacoes.horaFim,
      motivo: heSolicitacoes.motivo,
      aprovadoPor: heSolicitacoes.aprovadoPor,
    }).from(heSolicitacoes)
      .innerJoin(heSolicitacaoFuncionarios, eq(heSolicitacaoFuncionarios.solicitacaoId, heSolicitacoes.id))
      .where(and(
        companyFilter(heSolicitacoes.companyId, input),
        eq(heSolicitacoes.dataSolicitacao, input.data),
        eq(heSolicitacoes.status, "aprovada"),
        eq(heSolicitacaoFuncionarios.employeeId, input.employeeId),
      ));

    if (rows.length > 0) {
      return { authorized: true, solicitacao: rows[0] };
    }
    return { authorized: false, solicitacao: null };
  }),

  // ===================== EXCLUIR SOLICITAÇÃO =====================
  delete: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

    const isCreator = sol.solicitadoPorId === ctx.user.id;
    const isAdmin = ctx.user.role === "admin_master" || ctx.user.role === "admin";

    if (!isAdmin && !isCreator) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para excluir esta solicitação." });
    }
    if (isCreator && !isAdmin && sol.status !== "pendente") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Só é possível excluir solicitações pendentes." });
    }

    // Capturar snapshot completo (pai + filhos) antes do delete
    const funcsRows = await db.select().from(heSolicitacaoFuncionarios).where(eq(heSolicitacaoFuncionarios.solicitacaoId, input.id));
    const atividadesResult = await db.execute(sql`SELECT * FROM he_solicitacao_atividades WHERE solicitacao_id = ${input.id}`);
    const atividadesRows = ((atividadesResult as any)?.rows ?? atividadesResult ?? []) as any[];
    await recordTrashEntry({
      entityType: "heSolicitacao",
      entityId: input.id,
      companyId: sol.companyId,
      obraId: (sol as any).obraId ?? null,
      label: `Solicitação HE #${input.id}`,
      snapshot: {
        __main: sol,
        __children: [
          ...funcsRows.map((r: any) => ({ entityType: "heSolicitacaoFuncionario", row: r })),
          ...atividadesRows.map((r: any) => ({ entityType: "heSolicitacaoAtividade", row: r })),
        ],
      },
      deletedBy: ctx.user.name ?? null,
      deletedByUserId: ctx.user.id,
    });

    // Excluir funcionários vinculados e atividades vinculadas primeiro
    await db.delete(heSolicitacaoFuncionarios).where(eq(heSolicitacaoFuncionarios.solicitacaoId, input.id));
    await db.execute(sql`DELETE FROM he_solicitacao_atividades WHERE solicitacao_id = ${input.id}`);
    // Excluir a solicitação
    await db.delete(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));

    // Resetar a sequência para o maior ID existente (ou 0 se vazia)
    // Assim o próximo registro criado continua do ponto certo após a exclusão
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('he_solicitacoes', 'id'),
        COALESCE((SELECT MAX(id) FROM he_solicitacoes), 0)
      )
    `);

    await createAuditLog({
      userId: ctx.user.id,
      userName: ctx.user.name || "Sistema",
      companyId: sol.companyId,
      action: "DELETE",
      module: "he_solicitacoes",
      entityType: "he_solicitacao",
      entityId: input.id,
      details: `Excluiu solicitação HE #${input.id} (${sol.motivo}) - status: ${sol.status}`,
    });

    return { success: true };
  }),

  // ===================== BULK CHECK - Verificar HE autorizada para múltiplos funcionários/data =====================
  bulkCheckAuthorized: protectedProcedure.input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), // YYYY-MM
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    // Buscar todas as solicitações aprovadas do mês com seus funcionários
    const rows = await db.select({
      solId: heSolicitacoes.id,
      dataSolicitacao: heSolicitacoes.dataSolicitacao,
      horaInicio: heSolicitacoes.horaInicio,
      horaFim: heSolicitacoes.horaFim,
      employeeId: heSolicitacaoFuncionarios.employeeId,
    }).from(heSolicitacoes)
      .innerJoin(heSolicitacaoFuncionarios, eq(heSolicitacaoFuncionarios.solicitacaoId, heSolicitacoes.id))
      .where(and(
        companyFilter(heSolicitacoes.companyId, input),
        eq(heSolicitacoes.status, "aprovada"),
        sql`${heSolicitacoes.dataSolicitacao} LIKE ${input.mesReferencia + '%'}`,
      ));

    return rows;
  }),

  // ===================== HISTÓRICO DE HE POR FUNCIONÁRIO =====================
  historyByEmployee: protectedProcedure.input(z.object({
    companyId: z.number(),
    employeeId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select({
      id: heSolicitacoes.id,
      dataSolicitacao: heSolicitacoes.dataSolicitacao,
      horaInicio: heSolicitacoes.horaInicio,
      horaFim: heSolicitacoes.horaFim,
      motivo: heSolicitacoes.motivo,
      status: heSolicitacoes.status,
      solicitadoPor: heSolicitacoes.solicitadoPor,
      aprovadoPor: heSolicitacoes.aprovadoPor,
      aprovadoEm: heSolicitacoes.aprovadoEm,
      motivoRejeicao: heSolicitacoes.motivoRejeicao,
      observacaoAdmin: heSolicitacoes.observacaoAdmin,
      obraId: heSolicitacoes.obraId,
      createdAt: heSolicitacoes.createdAt,
      obraNome: obras.nome,
      heStatus: heSolicitacaoFuncionarios.status,
      horasRealizadas: heSolicitacaoFuncionarios.horasRealizadas,
    }).from(heSolicitacaoFuncionarios)
      .innerJoin(heSolicitacoes, eq(heSolicitacaoFuncionarios.solicitacaoId, heSolicitacoes.id))
      .leftJoin(obras, eq(heSolicitacoes.obraId, obras.id))
      .where(and(
        eq(heSolicitacaoFuncionarios.employeeId, input.employeeId),
        eq(heSolicitacoes.companyId, input.companyId),
      ))
      .orderBy(desc(heSolicitacoes.dataSolicitacao));

    return rows;
  }),

  // ===================== FUNCIONÁRIOS EM AVISO PRÉVIO =====================
  // Retorna IDs dos funcionários com aviso prévio ativo na empresa
  empregadosEmAvisoPrevio: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select({
      employeeId: terminationNotices.employeeId,
      dataFim: terminationNotices.dataFim,
      tipo: terminationNotices.tipo,
    }).from(terminationNotices)
      .where(and(
        eq(terminationNotices.companyId, input.companyId),
        eq(terminationNotices.status, 'em_andamento'),
        sql`${terminationNotices.deletedAt} IS NULL`,
      ));

    return rows;
  }),

  // ===================== CONFIRMAÇÕES DE PRESENÇA =====================

  getConfirmacoes: protectedProcedure.input(z.object({
    solicitacaoId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const [sol] = await db.select({ id: heSolicitacoes.id }).from(heSolicitacoes)
      .where(eq(heSolicitacoes.id, input.solicitacaoId));
    if (!sol) return [];

    const rows = await db.select({
      id: heSolicitacaoConfirmacoes.id,
      solicitacaoId: heSolicitacaoConfirmacoes.solicitacaoId,
      employeeId: heSolicitacaoConfirmacoes.employeeId,
      assinaturaUrl: heSolicitacaoConfirmacoes.assinaturaUrl,
      confirmedAt: heSolicitacaoConfirmacoes.confirmedAt,
      compareceu: heSolicitacaoConfirmacoes.compareceu,
      registradoPor: heSolicitacaoConfirmacoes.registradoPor,
      registradoEm: heSolicitacaoConfirmacoes.registradoEm,
      observacao: heSolicitacaoConfirmacoes.observacao,
      assinaturaDivergente: heSolicitacaoConfirmacoes.assinaturaDivergente,
      similaridade: heSolicitacaoConfirmacoes.similaridade,
      provaAlternativa: heSolicitacaoConfirmacoes.provaAlternativa,
      provaAlternativaTipo: heSolicitacaoConfirmacoes.provaAlternativaTipo,
      provaAlternativaPor: heSolicitacaoConfirmacoes.provaAlternativaPor,
      provaAlternativaEm: heSolicitacaoConfirmacoes.provaAlternativaEm,
      nomeCompleto: employees.nomeCompleto,
      matricula: employees.matricula,
      cargo: employees.cargo,
      fotoUrl: employees.fotoUrl,
    }).from(heSolicitacaoConfirmacoes)
      .leftJoin(employees, eq(employees.id, heSolicitacaoConfirmacoes.employeeId))
      .where(eq(heSolicitacaoConfirmacoes.solicitacaoId, input.solicitacaoId))
      .orderBy(asc(heSolicitacaoConfirmacoes.confirmedAt));

    return rows;
  }),

  confirmarPresenca: protectedProcedure.input(z.object({
    solicitacaoId: z.number(),
    employeeId: z.number(),
    assinaturaBase64: z.string().min(100, "Assinatura inválida"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select({ id: heSolicitacoes.id, status: heSolicitacoes.status, companyId: heSolicitacoes.companyId }).from(heSolicitacoes)
      .where(eq(heSolicitacoes.id, input.solicitacaoId));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

    const [funcVinculado] = await db.select({ id: heSolicitacaoFuncionarios.id }).from(heSolicitacaoFuncionarios)
      .where(and(eq(heSolicitacaoFuncionarios.solicitacaoId, input.solicitacaoId), eq(heSolicitacaoFuncionarios.employeeId, input.employeeId)));
    if (!funcVinculado) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário não vinculado a esta solicitação" });

    const existing = await db.select({ id: heSolicitacaoConfirmacoes.id })
      .from(heSolicitacaoConfirmacoes)
      .where(and(
        eq(heSolicitacaoConfirmacoes.solicitacaoId, input.solicitacaoId),
        eq(heSolicitacaoConfirmacoes.employeeId, input.employeeId),
      ));
    if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Funcionário já confirmou presença" });

    const ipAddress = (ctx.req as any)?.ip || (ctx.req as any)?.headers?.["x-forwarded-for"] || "desconhecido";

    const [emp] = await db.select({
      id: employees.id,
      nome: employees.nomeCompleto,
    }).from(employees).where(eq(employees.id, input.employeeId));

    const verif = await verificarAssinaturaMemorial(db, input.employeeId, input.assinaturaBase64);

    const [row] = await db.insert(heSolicitacaoConfirmacoes).values({
      solicitacaoId: input.solicitacaoId,
      employeeId: input.employeeId,
      assinaturaUrl: input.assinaturaBase64,
      ipAddress: String(ipAddress).split(",")[0].trim(),
      assinaturaDivergente: verif.assinaturaDivergente,
      similaridade: verif.similaridade !== null ? String(verif.similaridade) : null,
    }).returning();

    await createAuditLog({
      userId: ctx.user?.id,
      action: "he_confirmacao_presenca",
      entity: "he_solicitacao_confirmacoes",
      entityId: row.id,
      details: `Funcionário #${input.employeeId} (${emp?.nome || "?"}) confirmou presença na HE #${input.solicitacaoId}${verif.assinaturaDivergente ? " ⚠️ ASSINATURA DIVERGENTE (similaridade: " + verif.similaridade + "%)" : ""}`,
      companyId: sol.companyId,
    });

    return { ...row, ...verif };
  }),

  registrarComparecimento: protectedProcedure.input(z.object({
    solicitacaoId: z.number(),
    registros: z.array(z.object({
      employeeId: z.number(),
      compareceu: z.boolean(),
      observacao: z.string().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select({ id: heSolicitacoes.id, status: heSolicitacoes.status }).from(heSolicitacoes)
      .where(eq(heSolicitacoes.id, input.solicitacaoId));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
    if (sol.status !== "aprovada") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Só é possível registrar comparecimento após a solicitação ser aprovada" });

    const userName = ctx.user?.name || "sistema";
    const agora = new Date().toISOString();
    let updated = 0;

    for (const reg of input.registros) {
      const result = await db.update(heSolicitacaoConfirmacoes)
        .set({
          compareceu: reg.compareceu,
          registradoPor: userName,
          registradoEm: agora,
          observacao: reg.observacao || null,
        })
        .where(and(
          eq(heSolicitacaoConfirmacoes.solicitacaoId, input.solicitacaoId),
          eq(heSolicitacaoConfirmacoes.employeeId, reg.employeeId),
        ));
      updated++;
    }

    await createAuditLog({
      userId: ctx.user?.id,
      action: "he_registro_comparecimento",
      entity: "he_solicitacoes",
      entityId: input.solicitacaoId,
      details: `Comparecimento registrado: ${input.registros.filter(r => r.compareceu).length} presentes, ${input.registros.filter(r => !r.compareceu).length} ausentes`,
      companyId: ctx.user?.companyId,
    });

    return { updated };
  }),

  getAssinaturaMemorial: protectedProcedure.input(z.object({
    employeeId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [emp] = await db.select({
      id: employees.id,
      nomeCompleto: employees.nomeCompleto,
      assinaturaMemorial: employees.assinaturaMemorial,
      assinaturaMemorialAt: employees.assinaturaMemorialAt,
    }).from(employees).where(eq(employees.id, input.employeeId));
    return emp || null;
  }),

  limparAssinaturaMemorial: protectedProcedure.input(z.object({
    employeeId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const userRole = (ctx.user as any)?.role || (ctx.user as any)?.tipo;
    if (userRole !== "admin_master" && userRole !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem limpar a assinatura memorial" });
    }

    const [emp] = await db.select({ id: employees.id, nome: employees.nomeCompleto })
      .from(employees).where(eq(employees.id, input.employeeId));
    if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

    await db.update(employees)
      .set({ assinaturaMemorial: null, assinaturaMemorialAt: null })
      .where(eq(employees.id, input.employeeId));

    await createAuditLog({
      userId: ctx.user?.id,
      action: "limpar_assinatura_memorial",
      entity: "employees",
      entityId: input.employeeId,
      details: `Assinatura memorial limpa para ${emp.nome} por ${ctx.user?.name || "admin"}. Próxima assinatura será registrada como nova memorial.`,
      companyId: ctx.user?.companyId,
    });

    return { ok: true };
  }),

  enviarProvaAlternativa: protectedProcedure.input(z.object({
    confirmacaoId: z.number(),
    provaBase64: z.string().min(100, "Arquivo inválido"),
    tipo: z.enum(["foto", "video"]),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [conf] = await db.select({
      id: heSolicitacaoConfirmacoes.id,
      employeeId: heSolicitacaoConfirmacoes.employeeId,
      assinaturaDivergente: heSolicitacaoConfirmacoes.assinaturaDivergente,
    }).from(heSolicitacaoConfirmacoes).where(eq(heSolicitacaoConfirmacoes.id, input.confirmacaoId));

    if (!conf) throw new TRPCError({ code: "NOT_FOUND", message: "Confirmação não encontrada" });

    await db.update(heSolicitacaoConfirmacoes)
      .set({
        provaAlternativa: input.provaBase64,
        provaAlternativaTipo: input.tipo,
        provaAlternativaPor: ctx.user?.name || "admin",
        provaAlternativaEm: new Date().toISOString(),
        assinaturaDivergente: false,
      })
      .where(eq(heSolicitacaoConfirmacoes.id, input.confirmacaoId));

    const [emp] = await db.select({ nome: employees.nomeCompleto })
      .from(employees).where(eq(employees.id, conf.employeeId));

    await createAuditLog({
      userId: ctx.user?.id,
      action: "prova_alternativa_he",
      entity: "he_solicitacao_confirmacoes",
      entityId: input.confirmacaoId,
      details: `Prova alternativa (${input.tipo}) anexada para ${emp?.nome || "?"} — divergência de assinatura resolvida por ${ctx.user?.name || "admin"}`,
      companyId: ctx.user?.companyId,
    });

    return { ok: true };
  }),
});
