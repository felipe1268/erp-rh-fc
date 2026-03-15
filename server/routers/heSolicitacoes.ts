import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import {
  heSolicitacoes, heSolicitacaoFuncionarios, heSolicitacaoAtividades, employees, obras, terminationNotices,
  planejamentoAtividades, planejamentoProjetos, planejamentoRevisoes, planejamentoRefis,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull, asc } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ============================================================
// MÓDULO DE SOLICITAÇÃO DE HORAS EXTRAS
// Fluxo: Gestor solicita → Admin Master aprova → Fechamento cruza com batida
// Art. 59 CLT: Acordo individual ou coletivo para prorrogação de jornada
// ============================================================

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

    // Vincular funcionários
    if (input.funcionarioIds.length > 0) {
      await db.insert(heSolicitacaoFuncionarios).values(
        input.funcionarioIds.map(empId => ({
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
    mesReferencia: z.string().optional(), // YYYY-MM
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const conditions = [companyFilter(heSolicitacoes.companyId, input)];
    if (input.status && input.status !== "todas") {
      conditions.push(eq(heSolicitacoes.status, input.status));
    }
    if (input.mesReferencia) {
      conditions.push(sql`${heSolicitacoes.dataSolicitacao} LIKE ${input.mesReferencia + '%'}`);
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
      }).from(heSolicitacaoFuncionarios)
        .leftJoin(employees, eq(heSolicitacaoFuncionarios.employeeId, employees.id))
        .where(eq(heSolicitacaoFuncionarios.solicitacaoId, sol.id));

      // Buscar nome da obra se houver
      let obraNome = null;
      if (sol.obraId) {
        const [obra] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, sol.obraId));
        obraNome = obra?.nome || null;
      }

      result.push({ ...sol, obraNome, funcionarios: funcs });
    }

    return result;
  }),

  // ===================== DETALHES DE UMA SOLICITAÇÃO =====================
  getById: protectedProcedure.input(z.object({
    id: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

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

    await db.update(heSolicitacoes).set({
      status: "aprovada",
      aprovadoPor: ctx.user.name || "Admin",
      aprovadoPorId: ctx.user.id,
      aprovadoEm: new Date().toISOString().replace("T", " ").substring(0, 19),
      observacaoAdmin: input.observacaoAdmin || sol.observacaoAdmin || null,
    }).where(eq(heSolicitacoes.id, input.id));

    // === ACUMULAR CUSTO NO REFI quando HE está vinculada a atividades ===
    if (!isReversao) {
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
        const percentHE = (diaSemana === 0 || diaSemana === 6) ? 100 : 50;

        let custoHE = 0;
        for (const f of funcsAll) {
          let vh: number | null = null;
          if (f.valorHora) { const v = parseFloat(String(f.valorHora).replace(",", ".")); if (!isNaN(v) && v > 0) vh = v; }
          if (!vh && f.salarioBase) { const s = parseFloat(String(f.salarioBase).replace(",", ".")); if (!isNaN(s) && s > 0) vh = s / 220; }
          if (vh && horas > 0) custoHE += vh * (1 + percentHE / 100) * horas;
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

  // ===================== CANCELAR SOLICITAÇÃO (pelo solicitante) =====================
  cancel: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
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

  // ===================== EXCLUIR SOLICITAÇÃO (Admin Master) =====================
  delete: protectedProcedure.input(z.object({
    id: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    // Verificar se é Admin Master
    if (ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode excluir solicitações" });
    }

    // Buscar a solicitação
    const [sol] = await db.select().from(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));
    if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

    // Excluir funcionários vinculados primeiro
    await db.delete(heSolicitacaoFuncionarios).where(eq(heSolicitacaoFuncionarios.solicitacaoId, input.id));
    // Excluir a solicitação
    await db.delete(heSolicitacoes).where(eq(heSolicitacoes.id, input.id));

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
});
