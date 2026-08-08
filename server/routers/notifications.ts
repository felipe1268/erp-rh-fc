import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { TRPCError } from "@trpc/server";

// Rev. — Guard de tenancy dos destinatários de e-mail: o chamador precisa ter
// acesso à empresa do registro (create confia no input; update/delete resolvem
// a empresa pela LINHA, nunca pelo input).
async function assertRecipientCompanyAccess(ctx: any, companyId: number) {
  const empresas = await getCompaniesForUser(ctx.user.id, ctx.user.role);
  if (!empresas.some((c: any) => c.id === companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
  }
}
import { notificationRecipients, notificationLogs, menuLabels, companies, notificationViews, heSolicitacoes, smoSolicitacoes, obras, employees, fieldNotes, recontratacaoSolicitacoes, userAlerts } from "../../drizzle/schema";
import { eq, and, desc, sql, inArray, isNull, gt } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { dispararNotificacao, gerarTextoNotificacao } from "../services/emailNotification";

export const notificationsRouter = router({
  // ============================================================
  // Rev. 4690 — ALERTAS IN-APP POR USUÁRIO (pop-up "seu registro foi reprovado")
  // ============================================================
  meusAlertas: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select().from(userAlerts)
        .where(and(eq(userAlerts.userId, ctx.user.id), isNull(userAlerts.lidoEm)))
        .orderBy(desc(userAlerts.createdAt)).limit(20);
    } catch { return []; } // tabela pode ainda não existir no 1º boot
  }),

  marcarAlertasLidos: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false };
      // Só marca alertas do PRÓPRIO usuário (tenancy).
      await db.update(userAlerts).set({ lidoEm: sql`NOW()` })
        .where(and(eq(userAlerts.userId, ctx.user.id), inArray(userAlerts.id, input.ids), isNull(userAlerts.lidoEm)));
      return { success: true };
    }),

  // ============================================================
  // DESTINATÁRIOS
  // ============================================================
  listRecipients: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!
        .select()
        .from(notificationRecipients)
        .where(companyFilter(notificationRecipients.companyId, input));
      return rows;
    }),

  createRecipient: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1, "Nome é obrigatório"),
      email: z.string().email("E-mail inválido"),
      notificarContratacao: z.boolean().default(true),
      notificarDemissao: z.boolean().default(true),
      notificarTransferencia: z.boolean().default(false),
      notificarAfastamento: z.boolean().default(false),
      notificarRelatorioSemanal: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertRecipientCompanyAccess(ctx, input.companyId);
      const rows = await db!.insert(notificationRecipients).values({
        companyId: input.companyId,
        nome: input.nome,
        email: input.email,
        notificarContratacao: input.notificarContratacao ? 1 : 0,
        notificarDemissao: input.notificarDemissao ? 1 : 0,
        notificarTransferencia: input.notificarTransferencia ? 1 : 0,
        notificarAfastamento: input.notificarAfastamento ? 1 : 0,
        notificarRelatorioSemanal: input.notificarRelatorioSemanal ? 1 : 0,
      }).returning();
      return { id: rows[0]?.id, success: true };
    }),

  updateRecipient: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      email: z.string().email().optional(),
      notificarContratacao: z.boolean().optional(),
      notificarDemissao: z.boolean().optional(),
      notificarTransferencia: z.boolean().optional(),
      notificarAfastamento: z.boolean().optional(),
      notificarRelatorioSemanal: z.boolean().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { id, ...data } = input;
      const [row] = await db!.select({ companyId: notificationRecipients.companyId })
        .from(notificationRecipients).where(eq(notificationRecipients.id, id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Destinatário não encontrado" });
      await assertRecipientCompanyAccess(ctx, row.companyId);
      const setData: Record<string, any> = {};
      if (data.nome !== undefined) setData.nome = data.nome;
      if (data.email !== undefined) setData.email = data.email;
      if (data.notificarContratacao !== undefined) setData.notificarContratacao = data.notificarContratacao ? 1 : 0;
      if (data.notificarDemissao !== undefined) setData.notificarDemissao = data.notificarDemissao ? 1 : 0;
      if (data.notificarTransferencia !== undefined) setData.notificarTransferencia = data.notificarTransferencia ? 1 : 0;
      if (data.notificarAfastamento !== undefined) setData.notificarAfastamento = data.notificarAfastamento ? 1 : 0;
      if (data.notificarRelatorioSemanal !== undefined) setData.notificarRelatorioSemanal = data.notificarRelatorioSemanal ? 1 : 0;
      if (data.ativo !== undefined) setData.ativo = data.ativo ? 1 : 0;
      await db!.update(notificationRecipients).set(setData).where(eq(notificationRecipients.id, id));
      return { success: true };
    }),

  // Rev. — Disparo manual do Relatório Semanal de Pessoal (para teste/conferência)
  enviarRelatorioSemanalAgora: protectedProcedure
    .mutation(async () => {
      const { enviarRelatorioSemanal } = await import("../services/relatorioSemanalJob");
      return await enviarRelatorioSemanal({ force: true });
    }),

  deleteRecipient: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [row] = await db!.select({ companyId: notificationRecipients.companyId })
        .from(notificationRecipients).where(eq(notificationRecipients.id, input.id));
      if (!row) return { success: true };
      await assertRecipientCompanyAccess(ctx, row.companyId);
      await db!.delete(notificationRecipients).where(eq(notificationRecipients.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // LOG DE NOTIFICAÇÕES ENVIADAS
  // ============================================================
  listLogs: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), limit: z.number().default(50),
      tipoFiltro: z.enum(["todos", "contratacao", "demissao", "transferencia", "afastamento"]).default("todos"),
      statusFiltro: z.enum(["todos", "enviado", "erro", "pendente"]).default("todos"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      let query = db!
        .select()
        .from(notificationLogs)
        .where(companyFilter(notificationLogs.companyId, input))
        .orderBy(desc(notificationLogs.enviadoEm))
        .limit(input.limit);
      
      const rows = await query;
      
      // Filtrar no JS (mais simples que montar query dinâmica)
      let filtered = rows;
      if (input.tipoFiltro !== "todos") {
        filtered = filtered.filter(r => r.tipoMovimentacao === input.tipoFiltro);
      }
      if (input.statusFiltro !== "todos") {
        filtered = filtered.filter(r => r.statusEnvio === input.statusFiltro);
      }
      return filtered;
    }),

  logStats: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Rev. 1352: usa refs de coluna do Drizzle (gera identificadores entre aspas)
      // em vez de SQL cru com camelCase (Postgres lowercased → "column statusenvio does not exist").
      // Também: coluna `lido` é smallint (0/1), nunca booleana — usa `= 1`.
      const rows = await db!.select({
        total: sql<number>`COUNT(*)::int`,
        enviados: sql<number>`COALESCE(SUM(CASE WHEN ${notificationLogs.statusEnvio} = 'enviado' THEN 1 ELSE 0 END), 0)::int`,
        erros: sql<number>`COALESCE(SUM(CASE WHEN ${notificationLogs.statusEnvio} = 'erro' THEN 1 ELSE 0 END), 0)::int`,
        pendentes: sql<number>`COALESCE(SUM(CASE WHEN ${notificationLogs.statusEnvio} = 'pendente' THEN 1 ELSE 0 END), 0)::int`,
        lidos: sql<number>`COALESCE(SUM(CASE WHEN ${notificationLogs.lido} = 1 THEN 1 ELSE 0 END), 0)::int`,
      }).from(notificationLogs).where(companyFilter(notificationLogs.companyId, input));
      const r = rows[0];
      return r
        ? { total: Number(r.total) || 0, enviados: Number(r.enviados) || 0, erros: Number(r.erros) || 0, pendentes: Number(r.pendentes) || 0, lidos: Number(r.lidos) || 0 }
        : { total: 0, enviados: 0, erros: 0, pendentes: 0, lidos: 0 };
    }),

  // Preview de texto de notificação (para visualizar antes de enviar)
  previewTexto: protectedProcedure
    .input(z.object({
      tipo: z.enum(["contratacao", "demissao", "transferencia", "afastamento"]),
      companyId: z.number().optional(),
      nome: z.string().default("João da Silva"),
      cpf: z.string().default("000.000.000-00"),
      funcao: z.string().default("Servente"),
      setor: z.string().default("Obra"),
      empresa: z.string().default("Empresa"),
      dataNascimento: z.string().default("15/03/1990"),
      estadoCivil: z.string().default("Solteiro"),
      salario: z.string().default("2.500,00"),
    }))
    .query(async ({ input }) => {
      let companyData: any = null;
      if (input.companyId) {
        try {
          const db = await getDb();
          if (db) {
            const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
            if (company) {
              companyData = {
                razaoSocial: company.razaoSocial || "",
                nomeFantasia: company.nomeFantasia || "",
                cnpj: company.cnpj || "",
                logoUrl: company.logoUrl || "",
                email: company.email || "",
                telefone: company.telefone || "",
              };
            }
          }
        } catch (e) { /* fallback to default */ }
      }
      return gerarTextoNotificacao(input.tipo, {
        nome: input.nome,
        cpf: input.cpf,
        funcao: input.funcao,
        setor: input.setor,
        empresa: input.empresa,
        dataNascimento: input.dataNascimento,
        estadoCivil: input.estadoCivil,
        salario: input.salario,
      }, companyData);
    }),

  // Teste de envio de notificação
  testeEnvio: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), tipo: z.enum(["contratacao", "demissao", "transferencia", "afastamento"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await dispararNotificacao(
        input.companyId,
        input.tipo,
        {
          nome: "TESTE - Funcionário Exemplo",
          cpf: "000.000.000-00",
          funcao: "Servente",
          setor: "Obra Teste",
          empresa: "Empresa",
          dataNascimento: "15/03/1990",
          estadoCivil: "Solteiro",
          salario: "2.500,00",
          employeeId: 0,
          statusAnterior: "Ativo",
          statusNovo: input.tipo === "demissao" ? "Desligado" : input.tipo === "afastamento" ? "Afastado" : "Ativo",
        },
        ctx.user.id,
        ctx.user.name ?? "Sistema"
      );
      return result;
    }),

  // ============================================================
  // MENU LABELS (Critérios - renomear itens do menu)
  // ============================================================
  listMenuLabels: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!
        .select()
        .from(menuLabels)
        .where(companyFilter(menuLabels.companyId, input));
      return rows;
    }),

  upsertMenuLabel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), originalLabel: z.string().min(1),
      customLabel: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Tentar atualizar primeiro
      const existing = await db!
        .select()
        .from(menuLabels)
        .where(and(
          companyFilter(menuLabels.companyId, input),
          eq(menuLabels.originalLabel, input.originalLabel),
        ));
      
      if (existing.length > 0) {
        await db!.update(menuLabels)
          .set({ customLabel: input.customLabel })
          .where(eq(menuLabels.id, existing[0].id));
      } else {
        await db!.insert(menuLabels).values(input);
      }
      return { success: true };
    }),

  resetMenuLabel: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), originalLabel: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(menuLabels)
        .where(and(
          companyFilter(menuLabels.companyId, input),
          eq(menuLabels.originalLabel, input.originalLabel),
        ));
      return { success: true };
    }),

  // ============================================================
  // BADGES DE SOLICITAÇÕES PENDENTES (HE / MO)
  // Rev. 1274 — Bolinha vermelha agora reflete o estado REAL do
  // sistema: enquanto a solicitação estiver pendente (HE) ou em
  // tramitação (MO), o alerta permanece visível para todos os
  // usuários. Não desaparece só porque o usuário visualizou —
  // apenas some quando a solicitação for aprovada/rejeitada.
  // (markRequestsSeen continua existindo mas não afeta a contagem.)
  // ============================================================
  pendingRequestCounts: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { heNovas: 0, mdoNovas: 0, apontamentosNovas: 0, recontratacoesNovas: 0, semSeguroCount: 0, heItems: [], mdoItems: [], apontamentosItems: [], recontratacaoItems: [] };

      // Rev. 2755 — Tenancy: o servidor NÃO confia nos companyId(s) do cliente.
      // Restringe a consulta às empresas que o usuário pode acessar (admin =
      // tudo). Sem empresas permitidas → retorna vazio. Fecha IDOR/PII (inclui
      // os recontratacaoItems adicionados nesta revisão).
      const role = ctx?.user?.role;
      let safeInput: { companyId: number; companyIds?: number[] } = input;
      if (role !== "admin_master" && role !== "admin") {
        const comps = await getCompaniesForUser(ctx.user.id, role);
        const permitidas = new Set(comps.map((c: any) => c.id));
        const ids = resolveCompanyIds(input).filter((id) => permitidas.has(id));
        if (ids.length === 0) {
          return { heNovas: 0, mdoNovas: 0, apontamentosNovas: 0, recontratacoesNovas: 0, semSeguroCount: 0, heItems: [], mdoItems: [], apontamentosItems: [], recontratacaoItems: [] };
        }
        safeInput = { companyId: ids[0], companyIds: ids };
      }

      // ── HE: TODAS as solicitações com status "pendente"
      const heAllRows = await db.select({
        id: heSolicitacoes.id,
        dataSolicitacao: heSolicitacoes.dataSolicitacao,
        solicitadoPor: heSolicitacoes.solicitadoPor,
        motivo: heSolicitacoes.motivo,
        createdAt: heSolicitacoes.createdAt,
        obraNome: obras.nome,
      })
        .from(heSolicitacoes)
        .leftJoin(obras, eq(heSolicitacoes.obraId, obras.id))
        .where(and(
          companyFilter(heSolicitacoes.companyId, safeInput),
          eq(heSolicitacoes.status, "pendente"),
        ))
        .orderBy(desc(heSolicitacoes.createdAt));

      // ── MO (SMO): TODAS em tramitação (enviada/aprovada_rh)
      const mdoAllRows = await db.select({
        id: smoSolicitacoes.id,
        funcaoSolicitada: smoSolicitacoes.funcaoSolicitada,
        quantidade: smoSolicitacoes.quantidade,
        solicitanteNome: smoSolicitacoes.solicitanteNome,
        prioridade: smoSolicitacoes.prioridade,
        status: smoSolicitacoes.status,
        criadoEm: smoSolicitacoes.criadoEm,
        obraNome: obras.nome,
      })
        .from(smoSolicitacoes)
        .leftJoin(obras, eq(smoSolicitacoes.obraId, obras.id))
        .where(and(
          companyFilter(smoSolicitacoes.companyId, safeInput),
          isNull(smoSolicitacoes.deletedAt),
          inArray(smoSolicitacoes.status, ["enviada", "aprovada_rh"]),
        ))
        .orderBy(desc(smoSolicitacoes.criadoEm));

      // ── Apontamentos de Campo (field_notes): TODOS os apontamentos
      // ainda não aprovados/concluídos pelo RH. O alerta só some quando o
      // apontamento é resolvido ou arquivado.
      const apontAllRows = await db.select({
        id: fieldNotes.id,
        data: fieldNotes.data,
        tipoOcorrencia: fieldNotes.tipoOcorrencia,
        descricao: fieldNotes.descricao,
        solicitanteNome: fieldNotes.solicitanteNome,
        prioridade: fieldNotes.prioridade,
        status: fieldNotes.status,
        createdAt: fieldNotes.createdAt,
        obraNome: obras.nome,
      })
        .from(fieldNotes)
        .leftJoin(obras, eq(fieldNotes.obraId, obras.id))
        .where(and(
          companyFilter(fieldNotes.companyId, safeInput),
          isNull(fieldNotes.deletedAt),
          inArray(fieldNotes.status, ["pendente", "em_analise"]),
        ))
        .orderBy(desc(fieldNotes.createdAt));

      // ── Recontratações: solicitações em staging aguardando liberação do sócio
      const reconAllRows = await db.select({
        id: recontratacaoSolicitacoes.id,
        nomeCompleto: recontratacaoSolicitacoes.nomeCompleto,
        funcao: recontratacaoSolicitacoes.funcao,
        solicitadoPor: recontratacaoSolicitacoes.solicitadoPor,
        experienciaPermitida: recontratacaoSolicitacoes.experienciaPermitida,
        mesmaEmpresa: recontratacaoSolicitacoes.mesmaEmpresa,
        createdAt: recontratacaoSolicitacoes.createdAt,
      })
        .from(recontratacaoSolicitacoes)
        .where(and(
          companyFilter(recontratacaoSolicitacoes.companyId, safeInput),
          eq(recontratacaoSolicitacoes.status, "pendente"),
        ))
        .orderBy(desc(recontratacaoSolicitacoes.createdAt));

      // ── Seguro de Vida (Rev. 4927 — regra de ouro): CLT ativo SEM cobertura
      // ativa/pendente de inclusão. Mesma lógica de listarFuncionariosComStatus.
      let semSeguroCount = 0;
      try {
        const segIds = resolveCompanyIds(safeInput);
        if (segIds.length > 0) {
          const segRes: any = await db.execute(sql`
            SELECT COUNT(*)::int AS n
            FROM employees e
            WHERE e."companyId" IN (${sql.join(segIds.map((id) => sql`${id}`), sql`,`)})
              AND e.status IN ('Ativo','Ferias','Afastado','Aviso','Licenca','Licença')
              AND e."deletedAt" IS NULL
              AND COALESCE(e."tipoContrato",'CLT') NOT IN ('PJ','Socio')
              AND NOT EXISTS (
                SELECT 1 FROM seguro_vida_coberturas s
                WHERE s.employee_id = e.id AND s.status IN ('ativo','pendente_inclusao')
              )
          `);
          semSeguroCount = Number((segRes.rows || segRes)[0]?.n || 0);
        }
      } catch { semSeguroCount = 0; }

      return {
        semSeguroCount,
        heNovas: heAllRows.length,
        mdoNovas: mdoAllRows.length,
        apontamentosNovas: apontAllRows.length,
        recontratacoesNovas: reconAllRows.length,
        heItems: heAllRows,
        mdoItems: mdoAllRows,
        apontamentosItems: apontAllRows,
        recontratacaoItems: reconAllRows,
      };
    }),

  markRequestsSeen: protectedProcedure
    .input(z.object({ key: z.enum(["he_solicitacao", "mdo_solicitacao"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const userId = ctx.user.id;
      // Upsert manual: tenta UPDATE, se 0 linhas → INSERT
      const updated = await db.update(notificationViews)
        .set({ lastViewedAt: sql`NOW()` })
        .where(and(
          eq(notificationViews.userId, userId),
          eq(notificationViews.notificationKey, input.key),
        ))
        .returning();
      if (updated.length === 0) {
        try {
          await db.insert(notificationViews).values({
            userId,
            notificationKey: input.key,
          });
        } catch {
          // race condition: outro insert paralelo, ignora
        }
      }
      return { success: true };
    }),
});
