/**
 * Router de Migração - Exportar/Importar dados completos do ERP
 * Permite migrar para plataforma independente (Railway, etc.)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { generateExportPackage, importDatabase, exportDatabase } from "../services/migrationService";
import { storagePut } from "../storage";

export const migrationRouter = router({
  /**
   * Exportar banco de dados completo + manifesto de arquivos
   * Retorna URL para download do pacote JSON
   */
  exportar: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Apenas admin_master pode exportar
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem exportar dados",
        });
      }

      console.log(`[Migration] Exportação iniciada por ${ctx.user.name}`);
      const result = await generateExportPackage();

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na exportação: ${result.error}`,
        });
      }

      return result;
    }),

  /**
   * Exportar apenas o manifesto de arquivos (lista de URLs)
   * O frontend usa isso para baixar os arquivos individualmente
   */
  exportarArquivos: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
      }

      const { fileUrls, meta } = await exportDatabase();

      // Gerar manifesto organizado
      const manifest = {
        _meta: {
          totalFiles: fileUrls.length,
          exportedAt: new Date().toISOString(),
        },
        files: fileUrls.map((f, idx) => ({
          id: idx + 1,
          table: f.table,
          field: f.field,
          rowId: f.rowId,
          originalUrl: f.url,
          suggestedPath: `files/${f.table}/${f.rowId}_${f.field}`,
        })),
      };

      // Upload do manifesto
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const key = `migration-exports/files-manifest-${timestamp}.json`;
      const { url } = await storagePut(key, JSON.stringify(manifest, null, 2), "application/json");

      return {
        downloadUrl: url,
        totalFiles: fileUrls.length,
        byTable: Object.entries(
          fileUrls.reduce((acc, f) => {
            acc[f.table] = (acc[f.table] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([table, count]) => ({ table, count })).sort((a, b) => b.count - a.count),
      };
    }),

  /**
   * Importar dados de um pacote de exportação
   * Recebe o JSON do banco e restaura todas as tabelas
   */
  importar: protectedProcedure
    .input(z.object({
      data: z.record(z.any()),
      mode: z.enum(["replace", "merge"]).default("replace"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
      }

      console.log(`[Migration] Importação (${input.mode}) iniciada por ${ctx.user.name}`);
      const result = await importDatabase(input.data, input.mode);

      return result;
    }),

  /**
   * Retorna estatísticas do banco atual para preview
   */
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin_master" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
      }

      const { tables, meta, fileUrls } = await exportDatabase();

      return {
        totalTables: meta.totalTables,
        totalRecords: meta.totalRecords,
        totalFiles: fileUrls.length,
        tableStats: meta.tableStats,
        filesByTable: Object.entries(
          fileUrls.reduce((acc, f) => {
            acc[f.table] = (acc[f.table] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([table, count]) => ({ table, count })).sort((a, b) => b.count - a.count),
      };
    }),
});
