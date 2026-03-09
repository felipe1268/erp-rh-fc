import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { insuranceAlertConfig, insuranceAlertRecipients, insuranceAlertsLog, employees } from "../../drizzle/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";

export const insuranceRouter = router({
  // ============================================================
  // GET CONFIG - Buscar configuração de seguro de vida da empresa
  // ============================================================
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(insuranceAlertConfig)
        .where(companyFilter(insuranceAlertConfig.companyId, input))
        .limit(1);
      return rows[0] || null;
    }),

  // ============================================================
  // SAVE CONFIG - Salvar/atualizar configuração de seguro
  // ============================================================
  saveConfig: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), isActive: z.number().optional(),
      textoAdmissao: z.string().optional(),
      textoAfastamento: z.string().optional(),
      textoReclusao: z.string().optional(),
      textoDesligamento: z.string().optional(),
      seguradora: z.string().optional(),
      apolice: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const existing = await db.select().from(insuranceAlertConfig)
        .where(companyFilter(insuranceAlertConfig.companyId, input))
        .limit(1);

      const data: any = {
        isActive: input.isActive ?? 1,
        textoAdmissao: input.textoAdmissao || "Prezados, informamos a admissão do(a) colaborador(a) {NOME}, CPF {CPF}, na função de {FUNCAO}, com data de admissão {DATA_ADMISSAO}. Solicitamos a inclusão no seguro de vida.",
        textoAfastamento: input.textoAfastamento || "Prezados, informamos o afastamento do(a) colaborador(a) {NOME}, CPF {CPF}, função {FUNCAO}, a partir de {DATA}. Motivo: {MOTIVO}.",
        textoReclusao: input.textoReclusao || "Prezados, informamos a reclusão do(a) colaborador(a) {NOME}, CPF {CPF}, função {FUNCAO}, a partir de {DATA}.",
        textoDesligamento: input.textoDesligamento || "Prezados, informamos o desligamento do(a) colaborador(a) {NOME}, CPF {CPF}, função {FUNCAO}, com data de desligamento {DATA_DESLIGAMENTO}. Solicitamos a exclusão do seguro de vida.",
        seguradora: input.seguradora || null,
        apolice: input.apolice || null,
        observacoes: input.observacoes || null,
        atualizadoPor: ctx.user.name ?? "Sistema",
      };

      if (existing.length > 0) {
        await db.update(insuranceAlertConfig).set(data)
          .where(eq(insuranceAlertConfig.id, existing[0].id));
        return { success: true, id: existing[0].id, action: "updated" };
      } else {
        data.companyId = input.companyId;
        data.criadoPor = ctx.user.name ?? "Sistema";
        const [result] = await db.insert(insuranceAlertConfig).values(data).$returningId();
        return { success: true, id: (result as any).id, action: "created" };
      }
    }),

  // ============================================================
  // LIST RECIPIENTS - Listar destinatários dos alertas
  // ============================================================
  listRecipients: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      
      // Get config id first
      const config = await db.select().from(insuranceAlertConfig)
        .where(companyFilter(insuranceAlertConfig.companyId, input))
        .limit(1);
      
      if (!config.length) return [];
      
      return db.select().from(insuranceAlertRecipients)
        .where(and(
          companyFilter(insuranceAlertRecipients.companyId, input),
          eq(insuranceAlertRecipients.isActive, 1),
        ))
        .orderBy(insuranceAlertRecipients.tipoDestinatario);
    }),

  // ============================================================
  // ADD RECIPIENT - Adicionar destinatário
  // ============================================================
  addRecipient: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), tipoDestinatario: z.enum(["corretor", "diretoria", "usuario_sistema", "outro"]),
      nome: z.string().min(1),
      email: z.string().email(),
      telefone: z.string().optional(),
      cargo: z.string().optional(),
      recebeAdmissao: z.number().optional(),
      recebeAfastamento: z.number().optional(),
      recebeReclusao: z.number().optional(),
      recebeDesligamento: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Get or create config
      let config = await db.select().from(insuranceAlertConfig)
        .where(companyFilter(insuranceAlertConfig.companyId, input))
        .limit(1);
      
      let configId: number;
      if (!config.length) {
        const [result] = await db.insert(insuranceAlertConfig).values({
          companyId: input.companyId,
          isActive: 1,
          criadoPor: "Sistema",
        } as any).$returningId();
        configId = (result as any).id;
      } else {
        configId = config[0].id;
      }

      const [result] = await db.insert(insuranceAlertRecipients).values({
        companyId: input.companyId,
        configId,
        tipoDestinatario: input.tipoDestinatario,
        nome: input.nome,
        email: input.email,
        telefone: input.telefone || null,
        cargo: input.cargo || null,
        recebeAdmissao: input.recebeAdmissao ?? 1,
        recebeAfastamento: input.recebeAfastamento ?? 1,
        recebeReclusao: input.recebeReclusao ?? 1,
        recebeDesligamento: input.recebeDesligamento ?? 1,
        isActive: 1,
      } as any).$returningId();

      return { success: true, id: (result as any).id };
    }),

  // ============================================================
  // REMOVE RECIPIENT - Remover destinatário (soft delete)
  // ============================================================
  removeRecipient: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.update(insuranceAlertRecipients).set({ isActive: 0 })
        .where(eq(insuranceAlertRecipients.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // UPDATE RECIPIENT - Atualizar destinatário
  // ============================================================
  updateRecipient: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      email: z.string().optional(),
      telefone: z.string().optional(),
      cargo: z.string().optional(),
      tipoDestinatario: z.enum(["corretor", "diretoria", "usuario_sistema", "outro"]).optional(),
      recebeAdmissao: z.number().optional(),
      recebeAfastamento: z.number().optional(),
      recebeReclusao: z.number().optional(),
      recebeDesligamento: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { id, ...data } = input;
      await db.update(insuranceAlertRecipients).set(data as any)
        .where(eq(insuranceAlertRecipients.id, id));
      return { success: true };
    }),

  // ============================================================
  // LIST ALERTS LOG - Histórico de alertas enviados
  // ============================================================
  listAlertsLog: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(insuranceAlertsLog)
        .where(companyFilter(insuranceAlertsLog.companyId, input))
        .orderBy(desc(insuranceAlertsLog.createdAt))
        .limit(input.limit || 50);
    }),

  // ============================================================
  // SEND ALERT - Enviar alerta manual de seguro de vida
  // ============================================================
  sendAlert: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
      tipoMovimentacao: z.enum(["admissao", "afastamento", "reclusao", "desligamento"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Get employee data
      const emp = await db.select().from(employees)
        .where(eq(employees.id, input.employeeId))
        .limit(1);
      if (!emp.length) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

      // Get config
      const config = await db.select().from(insuranceAlertConfig)
        .where(companyFilter(insuranceAlertConfig.companyId, input))
        .limit(1);
      if (!config.length) throw new TRPCError({ code: "NOT_FOUND", message: "Configuração de seguro não encontrada. Configure primeiro em Configurações > Seguro de Vida." });

      // Get recipients for this type
      const tipoField = {
        admissao: "recebeAdmissao",
        afastamento: "recebeAfastamento",
        reclusao: "recebeReclusao",
        desligamento: "recebeDesligamento",
      }[input.tipoMovimentacao] as keyof typeof insuranceAlertRecipients;

      const recipients = await db.select().from(insuranceAlertRecipients)
        .where(and(
          companyFilter(insuranceAlertRecipients.companyId, input),
          eq(insuranceAlertRecipients.isActive, 1),
        ));

      const activeRecipients = recipients.filter((r: any) => r[tipoField] === 1);

      if (!activeRecipients.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum destinatário configurado para este tipo de movimentação." });
      }

      // Build alert text
      const textoField = {
        admissao: "textoAdmissao",
        afastamento: "textoAfastamento",
        reclusao: "textoReclusao",
        desligamento: "textoDesligamento",
      }[input.tipoMovimentacao] as keyof typeof config[0];

      let texto = (config[0] as any)[textoField] || `Alerta de ${input.tipoMovimentacao} para ${emp[0].nomeCompleto}`;
      texto = texto
        .replace(/{NOME}/g, emp[0].nomeCompleto || "")
        .replace(/{CPF}/g, emp[0].cpf || "")
        .replace(/{FUNCAO}/g, emp[0].funcao || "")
        .replace(/{DATA_ADMISSAO}/g, emp[0].dataAdmissao || "")
        .replace(/{DATA_DESLIGAMENTO}/g, emp[0].dataDemissao || "")
        .replace(/{DATA}/g, new Date().toLocaleDateString("pt-BR"))
        .replace(/{MOTIVO}/g, emp[0].motivoDesligamento || "Não informado");

      // Log the alert
      await db.insert(insuranceAlertsLog).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        tipoMovimentacao: input.tipoMovimentacao,
        statusAnterior: emp[0].status || "",
        statusNovo: input.tipoMovimentacao === "desligamento" ? "Desligado" : emp[0].status || "",
        textoAlerta: texto,
        nomeFuncionario: emp[0].nomeCompleto || "",
        cpfFuncionario: emp[0].cpf || "",
        funcaoFuncionario: emp[0].funcao || "",
        obraFuncionario: "", // obra via obra_funcionarios (não crítico para log de seguro)
        destinatarios: JSON.stringify(activeRecipients.map((r: any) => ({ nome: r.nome, email: r.email, tipo: r.tipoDestinatario }))),
        disparadoPor: ctx.user.name ?? "Sistema",
        disparoAutomatico: 0,
        statusEnvio: "enviado",
      } as any);

      return {
        success: true,
        texto,
        destinatarios: activeRecipients.map((r: any) => ({ nome: r.nome, email: r.email, tipo: r.tipoDestinatario })),
        message: `Alerta enviado para ${activeRecipients.length} destinatário(s)`,
      };
    }),
});
