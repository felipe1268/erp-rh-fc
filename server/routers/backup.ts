import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { executarBackup, listarBackups, obterConfigBackup, salvarConfigBackup } from "../services/backupService";
import { TRPCError } from "@trpc/server";

export const backupRouter = router({
  executar: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem executar backups" });
      }
      const result = await executarBackup("manual", ctx.user.name || "Admin");
      return result;
    }),

  listar: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem ver backups" });
      }
      return listarBackups(input?.limit ?? 30);
    }),

  obterConfig: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
      }
      return obterConfigBackup();
    }),

  salvarConfig: protectedProcedure
    .input(z.object({
      horario: z.string().regex(/^\d{2}:\d{2}$/, "Formato deve ser HH:MM"),
      ativo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
      }
      const [h, m] = input.horario.split(":").map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Horário inválido" });
      }
      await salvarConfigBackup(input.horario, input.ativo, ctx.user.name || "Admin");
      return { success: true };
    }),
});
