import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { storagePut } from "../storage";
import path from "path";
import fs from "fs";

const MAX_FILE_BYTES = 35 * 1024 * 1024;

export const bimRouter = router({
  listModels: protectedProcedure
    .input(z.object({ projetoId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(
        sql`SELECT id, nome, disciplina, arquivo_path, tamanho_bytes, num_elementos, num_pavimentos, pavimentos, criado_em
            FROM bim_models
            WHERE projeto_id = ${input.projetoId} AND company_id = ${input.companyId}
            ORDER BY criado_em ASC`
      );
      return (rows.rows || []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        disciplina: r.disciplina,
        arquivoPath: r.arquivo_path,
        tamanhoBytes: r.tamanho_bytes || 0,
        numElementos: r.num_elementos || 0,
        numPavimentos: r.num_pavimentos || 0,
        pavimentos: r.pavimentos || [],
        criadoEm: r.criado_em,
      }));
    }),

  uploadModel: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      companyId: z.number(),
      nome: z.string().min(1),
      disciplina: z.string().min(1),
      fileBase64: z.string(),
      numElementos: z.number().default(0),
      numPavimentos: z.number().default(0),
      pavimentos: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const buf = Buffer.from(input.fileBase64, "base64");

      if (buf.length > MAX_FILE_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Arquivo muito grande (máx ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)` });
      }

      const filename = `${input.projetoId}-${Date.now()}-${input.nome.replace(/[^a-zA-Z0-9_.-]/g, "_")}.ifc`;
      const relKey = `bim/${input.companyId}/${filename}`;

      await storagePut(relKey, buf, "application/octet-stream");

      const db = getDb();
      const result = await db.execute(
        sql`INSERT INTO bim_models (company_id, projeto_id, nome, disciplina, arquivo_path, tamanho_bytes, num_elementos, num_pavimentos, pavimentos, criado_por)
            VALUES (${input.companyId}, ${input.projetoId}, ${input.nome}, ${input.disciplina}, ${relKey}, ${buf.length}, ${input.numElementos}, ${input.numPavimentos}, ${JSON.stringify(input.pavimentos)}::jsonb, ${(ctx as any).user?.id || 0})
            RETURNING id`
      );

      const id = (result.rows?.[0] as any)?.id;
      return { id, arquivoPath: relKey };
    }),

  downloadModel: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(
        sql`SELECT arquivo_path FROM bim_models WHERE id = ${input.id} AND company_id = ${input.companyId}`
      );

      const row = rows.rows?.[0] as any;
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });
      }

      const filePath = path.join(process.cwd(), "server", "uploads", row.arquivo_path);
      if (!fs.existsSync(filePath)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado no servidor" });
      }

      const data = fs.readFileSync(filePath);
      return { fileBase64: data.toString("base64") };
    }),

  deleteModel: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.execute(
        sql`SELECT arquivo_path FROM bim_models WHERE id = ${input.id} AND company_id = ${input.companyId}`
      );
      const row = rows.rows?.[0] as any;

      if (row?.arquivo_path) {
        const filePath = path.join(process.cwd(), "server", "uploads", row.arquivo_path);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn("[BIM] Erro ao deletar arquivo local:", e);
        }
      }

      await db.execute(
        sql`DELETE FROM bim_models WHERE id = ${input.id} AND company_id = ${input.companyId}`
      );

      return { success: true };
    }),
});
