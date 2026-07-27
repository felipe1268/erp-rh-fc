import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { executarBackup, listarBackups, obterConfigBackup, salvarConfigBackup, getBackupHealth } from "../services/backupService";
import { getCodeSyncStatus, startCodeSnapshotAsync, getSnapshotProgress } from "../services/codeSyncService";
import { TRPCError } from "@trpc/server";

function assertAdmin(ctx: any) {
  if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
  }
}

export const backupRouter = router({
  executar: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertAdmin(ctx);
      const result = await executarBackup("manual", ctx.user.name || "Admin");
      return result;
    }),

  listar: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx);
      return listarBackups(input?.limit ?? 30);
    }),

  obterConfig: protectedProcedure
    .query(async ({ ctx }) => {
      assertAdmin(ctx);
      return obterConfigBackup();
    }),

  salvarConfig: protectedProcedure
    .input(z.object({
      horario: z.string().regex(/^\d{2}:\d{2}$/, "Formato deve ser HH:MM"),
      ativo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const [h, m] = input.horario.split(":").map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Horário inválido" });
      }
      await salvarConfigBackup(input.horario, input.ativo, ctx.user.name || "Admin");
      return { success: true };
    }),

  // Saúde do backup de dados (idade, falhas, configuração).
  health: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    return getBackupHealth();
  }),

  // Status da sincronização do código com o GitHub.
  githubStatus: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    return getCodeSyncStatus();
  }),

  // Redundância: envia uma cópia do código-fonte para a branch dedicada no GitHub.
  // Rev. 4625 — dispara em BACKGROUND e retorna já (iPad/Safari aborta fetch
  // longo); a UI acompanha via snapshotProgress, que traz o resultado final.
  pushCodeSnapshot: protectedProcedure.mutation(async ({ ctx }) => {
    assertAdmin(ctx);
    return startCodeSnapshotAsync(ctx.user.name || "Admin");
  }),

  // Rev. 4620 — progresso (0–100%) do envio da cópia do código, para a UI.
  snapshotProgress: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    return getSnapshotProgress();
  }),
});
