import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { notificationRecipients } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const notificationsRouter = router({
  // Listar destinatários de notificação por empresa
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

  // Criar destinatário
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

  // Atualizar destinatário
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

  // Excluir destinatário
  deleteRecipient: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db!.delete(notificationRecipients).where(eq(notificationRecipients.id, input.id));
      return { success: true };
    }),
});
