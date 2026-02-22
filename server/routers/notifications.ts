import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { notificationRecipients, notificationLogs, menuLabels, companies } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { dispararNotificacao, gerarTextoNotificacao } from "../services/emailNotification";

export const notificationsRouter = router({
  // ============================================================
  // DESTINATÁRIOS
  // ============================================================
  listRecipients: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!
        .select()
        .from(notificationRecipients)
        .where(eq(notificationRecipients.companyId, input.companyId));
      return rows;
    }),

  createRecipient: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1, "Nome é obrigatório"),
      email: z.string().email("E-mail inválido"),
      notificarContratacao: z.boolean().default(true),
      notificarDemissao: z.boolean().default(true),
      notificarTransferencia: z.boolean().default(false),
      notificarAfastamento: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [result] = await db!.insert(notificationRecipients).values(input);
      return { id: result.insertId, success: true };
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
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db!.update(notificationRecipients).set(data).where(eq(notificationRecipients.id, id));
      return { success: true };
    }),

  deleteRecipient: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(notificationRecipients).where(eq(notificationRecipients.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // LOG DE NOTIFICAÇÕES ENVIADAS
  // ============================================================
  listLogs: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      limit: z.number().default(50),
      tipoFiltro: z.enum(["todos", "contratacao", "demissao", "transferencia", "afastamento"]).default("todos"),
      statusFiltro: z.enum(["todos", "enviado", "erro", "pendente"]).default("todos"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      let query = db!
        .select()
        .from(notificationLogs)
        .where(eq(notificationLogs.companyId, input.companyId))
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!.select({
        total: sql<number>`COUNT(*)`,
        enviados: sql<number>`SUM(CASE WHEN statusEnvio = 'enviado' THEN 1 ELSE 0 END)`,
        erros: sql<number>`SUM(CASE WHEN statusEnvio = 'erro' THEN 1 ELSE 0 END)`,
        lidos: sql<number>`SUM(CASE WHEN lido = true THEN 1 ELSE 0 END)`,
      }).from(notificationLogs).where(eq(notificationLogs.companyId, input.companyId));
      return rows[0] || { total: 0, enviados: 0, erros: 0, lidos: 0 };
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
      empresa: z.string().default("FC Engenharia"),
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
      }, companyData);
    }),

  // Teste de envio de notificação
  testeEnvio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipo: z.enum(["contratacao", "demissao", "transferencia", "afastamento"]),
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
          empresa: "FC Engenharia",
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db!
        .select()
        .from(menuLabels)
        .where(eq(menuLabels.companyId, input.companyId));
      return rows;
    }),

  upsertMenuLabel: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      originalLabel: z.string().min(1),
      customLabel: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Tentar atualizar primeiro
      const existing = await db!
        .select()
        .from(menuLabels)
        .where(and(
          eq(menuLabels.companyId, input.companyId),
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
    .input(z.object({
      companyId: z.number(),
      originalLabel: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(menuLabels)
        .where(and(
          eq(menuLabels.companyId, input.companyId),
          eq(menuLabels.originalLabel, input.originalLabel),
        ));
      return { success: true };
    }),
});
