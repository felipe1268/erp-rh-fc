/**
 * Proventos em Folha — "Outras Receitas" (módulo RH).
 *
 * Lançamentos mensais manuais de PROVENTO por funcionário e competência
 * (ex.: reembolso de despesas, bonificação). Espelho do folha_descontos.
 * A simulação da folha lê esta tabela por competência e SOMA os valores no
 * líquido do funcionário. Natureza indenizatória (reembolso) NÃO entra na
 * base de INSS/IRRF/FGTS — soma apenas no total de proventos/líquido.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { sql } from "drizzle-orm";

export const TIPOS_PROVENTO_FOLHA = ["reembolso", "bonificacao", "outros"] as const;

const tipoEnum = z.enum(TIPOS_PROVENTO_FOLHA);
const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida (AAAA-MM)");

async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const companies = await getCompaniesForUser(ctxUser.id, ctxUser.role);
  const allowedIds = (companies as any[]).map((c: any) => Number(c.id)).filter((v: any) => Number.isFinite(v));
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

function rows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function loadProventoOrForbid(db: any, ctxUser: any, id: number) {
  const r = rows(await db.execute(sql`SELECT * FROM folha_proventos WHERE id = ${id} LIMIT 1`));
  if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Provento não encontrado." });
  await assertCompanyAccess(ctxUser, Number(r[0].companyId));
  return r[0];
}

export const folhaProventosRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: mesSchema }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return rows(await db.execute(sql`
        SELECT fp.*, e."nomeCompleto" AS "employeeNome", e.funcao AS "employeeFuncao",
               e."fotoUrl" AS "employeeFotoUrl", e.status AS "employeeStatus"
        FROM folha_proventos fp
        LEFT JOIN employees e ON e.id = fp."employeeId"
        WHERE fp."companyId" = ${input.companyId} AND fp."mesReferencia" = ${input.mesReferencia}
        ORDER BY fp.tipo, e."nomeCompleto"
      `));
    }),

  criar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      mesReferencia: mesSchema,
      tipo: tipoEnum,
      valor: z.number().positive("Valor deve ser maior que zero"),
      descricao: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const emp = rows(await db.execute(sql`
        SELECT id, "companyId", "deletedAt" FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `));
      if (!emp.length || emp[0].deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
      }
      if (Number(emp[0].companyId) !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Funcionário não pertence a esta empresa." });
      }
      const r = rows(await db.execute(sql`
        INSERT INTO folha_proventos ("companyId", "employeeId", "mesReferencia", tipo, descricao, valor, "criadoPor")
        VALUES (${input.companyId}, ${input.employeeId}, ${input.mesReferencia}, ${input.tipo},
                ${input.descricao || null}, ${input.valor.toFixed(2)}, ${ctx.user?.name || ctx.user?.email || null})
        RETURNING *
      `));
      return r[0];
    }),

  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      valor: z.number().positive("Valor deve ser maior que zero").optional(),
      descricao: z.string().trim().max(500).optional(),
      tipo: tipoEnum.optional(),
      mesReferencia: mesSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const atual = await loadProventoOrForbid(db, ctx.user, input.id);
      const r = rows(await db.execute(sql`
        UPDATE folha_proventos
        SET valor = ${input.valor !== undefined ? input.valor.toFixed(2) : atual.valor},
            descricao = ${input.descricao !== undefined ? (input.descricao || null) : atual.descricao},
            tipo = ${input.tipo ?? atual.tipo},
            "mesReferencia" = ${input.mesReferencia ?? atual.mesReferencia},
            "updatedAt" = now()
        WHERE id = ${input.id}
        RETURNING *
      `));
      return r[0];
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await loadProventoOrForbid(db, ctx.user, input.id);
      await db.execute(sql`DELETE FROM folha_proventos WHERE id = ${input.id}`);
      return { ok: true };
    }),
});
