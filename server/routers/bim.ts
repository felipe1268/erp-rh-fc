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
      const db = await getDb();
      if (!db) return [];
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

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

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

  listLinks: protectedProcedure
    .input(z.object({ projetoId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(
        sql`SELECT bl.id, bl.atividade_id, bl.model_id, bl.express_ids, bl.storey_name, bl.descricao,
                   pa.nome as atividade_nome, pa.data_inicio as inicio, pa.data_fim as fim
            FROM bim_links bl
            LEFT JOIN planejamento_atividades pa ON pa.id = bl.atividade_id
            WHERE bl.projeto_id = ${input.projetoId} AND bl.company_id = ${input.companyId}
            ORDER BY bl.criado_em ASC`
      );
      return (rows.rows || []).map((r: any) => ({
        id: r.id,
        atividadeId: r.atividade_id,
        modelId: r.model_id,
        expressIds: r.express_ids || [],
        storeyName: r.storey_name,
        descricao: r.descricao,
        atividadeNome: r.atividade_nome,
        inicio: r.inicio,
        fim: r.fim,
        progressoReal: 0,
      }));
    }),

  saveLink: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      companyId: z.number(),
      atividadeId: z.number(),
      modelId: z.number(),
      expressIds: z.array(z.number()),
      storeyName: z.string().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      if (!input.expressIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum elemento selecionado" });

      const projCheck = await db.execute(
        sql`SELECT id FROM planejamento_projetos WHERE id = ${input.projetoId} AND company_id = ${input.companyId}`
      );
      if (!projCheck.rows?.length) throw new TRPCError({ code: "FORBIDDEN", message: "Projeto não pertence à empresa" });

      if (input.modelId > 0) {
        const modelCheck = await db.execute(
          sql`SELECT id FROM bim_models WHERE id = ${input.modelId} AND company_id = ${input.companyId} AND projeto_id = ${input.projetoId}`
        );
        if (!modelCheck.rows?.length) throw new TRPCError({ code: "FORBIDDEN", message: "Modelo não pertence ao projeto" });
      }

      const ativCheck = await db.execute(
        sql`SELECT pa.id FROM planejamento_atividades pa
            JOIN planejamento_projetos pp ON pp.id = pa.projeto_id
            WHERE pa.id = ${input.atividadeId} AND pa.projeto_id = ${input.projetoId} AND pp.company_id = ${input.companyId}`
      );
      if (!ativCheck.rows?.length) throw new TRPCError({ code: "FORBIDDEN", message: "Atividade não pertence ao projeto" });

      const result = await db.execute(
        sql`INSERT INTO bim_links (company_id, projeto_id, atividade_id, model_id, express_ids, storey_name, descricao)
            VALUES (${input.companyId}, ${input.projetoId}, ${input.atividadeId}, ${input.modelId}, ${JSON.stringify(input.expressIds)}::jsonb, ${input.storeyName || null}, ${input.descricao || null})
            RETURNING id`
      );

      return { id: (result.rows?.[0] as any)?.id };
    }),

  listAtividades: protectedProcedure
    .input(z.object({ projetoId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) { console.log("[BIM] listAtividades: db null"); return []; }
      console.log(`[BIM] listAtividades projetoId=${input.projetoId} companyId=${input.companyId}`);

      const [atividadesRes, gruposRes] = await Promise.all([
        db.execute(
          sql`SELECT pa.id, pa.nome, pa.eap_codigo, pa.data_inicio as inicio, pa.data_fim as fim
              FROM planejamento_atividades pa
              JOIN planejamento_projetos pp ON pp.id = pa.projeto_id
              WHERE pa.projeto_id = ${input.projetoId}
                AND pp.company_id = ${input.companyId}
                AND (pa.is_grupo IS NOT TRUE)
                AND (pa.disabled IS NOT TRUE)
              ORDER BY pa.eap_codigo ASC NULLS LAST, pa.ordem ASC, pa.id ASC
              LIMIT 2000`
        ),
        db.execute(
          sql`SELECT pa.eap_codigo, pa.nome
              FROM planejamento_atividades pa
              JOIN planejamento_projetos pp ON pp.id = pa.projeto_id
              WHERE pa.projeto_id = ${input.projetoId}
                AND pp.company_id = ${input.companyId}
                AND pa.is_grupo = true
                AND (pa.disabled IS NOT TRUE)`
        ),
      ]);

      const grupoMap = new Map<string, string>();
      (gruposRes.rows || []).forEach((g: any) => {
        if (g.eap_codigo) grupoMap.set(g.eap_codigo, (g.nome || "").replace(/:$/, "").trim());
      });

      const getPath = (eap: string | null): string => {
        if (!eap || !eap.includes(".")) return "";
        const parts = eap.split(".");
        const path: string[] = [];
        for (let i = 1; i < parts.length; i++) {
          const parentEap = parts.slice(0, i).join(".");
          const name = grupoMap.get(parentEap);
          if (name) path.push(name);
        }
        return path.join(" > ");
      };

      console.log(`[BIM] listAtividades result: ${atividadesRes.rows?.length ?? 0} rows, ${gruposRes.rows?.length ?? 0} grupos`);
      return (atividadesRes.rows || []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        eapCodigo: r.eap_codigo,
        inicio: r.inicio,
        fim: r.fim,
        progressoReal: 0,
        grupoPath: getPath(r.eap_codigo),
      }));
    }),

  deleteLink: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      await db.execute(
        sql`DELETE FROM bim_links WHERE id = ${input.id} AND company_id = ${input.companyId}`
      );
      return { success: true };
    }),
});
