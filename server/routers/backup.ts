/**
 * Router de Backup do Banco de Dados
 * Procedures: executar backup manual, listar backups
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { executarBackup, listarBackups } from "../services/backupService";
import { TRPCError } from "@trpc/server";

export const backupRouter = router({
  /** Executa backup manual (somente admin) */
  executar: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem executar backups" });
      }
      const result = await executarBackup("manual", ctx.user.name || "Admin");
      return result;
    }),

  /** Lista histórico de backups */
  listar: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem ver backups" });
      }
      return listarBackups(input?.limit ?? 30);
    }),
});
