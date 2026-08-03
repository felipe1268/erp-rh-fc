/**
 * Rev. 4868 — Descontos em Folha (módulo RH).
 *
 * Lançamentos mensais manuais de desconto por funcionário, além dos
 * convênios e adiantamento (vale) já automáticos:
 *   - pensao_alimenticia  → soma na coluna PENSÃO da folha
 *   - credito_trabalhador → soma na coluna OUTROS
 *   - multa_judicial      → soma na coluna OUTROS
 *   - outros              → soma na coluna OUTROS
 *
 * A simulação da folha (payrollEngine.simular) lê esta tabela por
 * competência e agrega os valores por funcionário.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { sql } from "drizzle-orm";

export const TIPOS_DESCONTO_FOLHA = [
  "pensao_alimenticia",
  "credito_trabalhador",
  "multa_judicial",
  "outros",
] as const;

const tipoEnum = z.enum(TIPOS_DESCONTO_FOLHA);
const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida (AAAA-MM)");

// Guard multi-tenant (deny-by-default): admin libera; demais usuários só
// operam nas empresas visíveis via getCompaniesForUser (vínculos explícitos
// + empresas donas das obras concedidas). Sem vínculo nenhum = FORBIDDEN —
// dinheiro saindo da folha exige lastro de acesso explícito.
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

async function loadDescontoOrForbid(db: any, ctxUser: any, id: number) {
  const r = rows(await db.execute(sql`SELECT * FROM folha_descontos WHERE id = ${id} LIMIT 1`));
  if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Desconto não encontrado." });
  await assertCompanyAccess(ctxUser, Number(r[0].companyId));
  return r[0];
}

export const folhaDescontosRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: mesSchema }))
    .query(async ({ ctx, input }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const r = rows(await db.execute(sql`
        SELECT fd.*, e."nomeCompleto" AS "employeeNome", e.funcao AS "employeeFuncao",
               e."fotoUrl" AS "employeeFotoUrl", e.status AS "employeeStatus"
        FROM folha_descontos fd
        LEFT JOIN employees e ON e.id = fd."employeeId"
        WHERE fd."companyId" = ${input.companyId} AND fd."mesReferencia" = ${input.mesReferencia}
        ORDER BY fd.tipo, e."nomeCompleto"
      `));
      return r;
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
      // Poka-Yoke: funcionário deve existir e pertencer à empresa informada
      const emp = rows(await db.execute(sql`
        SELECT id, "companyId", "nomeCompleto", status, "deletedAt" FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `));
      if (!emp.length || emp[0].deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
      }
      if (Number(emp[0].companyId) !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Funcionário não pertence a esta empresa." });
      }
      const valorStr = input.valor.toFixed(2);
      const r = rows(await db.execute(sql`
        INSERT INTO folha_descontos ("companyId", "employeeId", "mesReferencia", tipo, descricao, valor, "criadoPor")
        VALUES (${input.companyId}, ${input.employeeId}, ${input.mesReferencia}, ${input.tipo},
                ${input.descricao || null}, ${valorStr}, ${ctx.user?.name || ctx.user?.email || null})
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
      const atual = await loadDescontoOrForbid(db, ctx.user, input.id);
      const novoValor = input.valor !== undefined ? input.valor.toFixed(2) : atual.valor;
      const novaDesc = input.descricao !== undefined ? (input.descricao || null) : atual.descricao;
      const novoTipo = input.tipo ?? atual.tipo;
      const novoMes = input.mesReferencia ?? atual.mesReferencia;
      const r = rows(await db.execute(sql`
        UPDATE folha_descontos
        SET valor = ${novoValor}, descricao = ${novaDesc}, tipo = ${novoTipo},
            "mesReferencia" = ${novoMes}, "updatedAt" = now()
        WHERE id = ${input.id}
        RETURNING *
      `));
      return r[0];
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await loadDescontoOrForbid(db, ctx.user, input.id);
      await db.execute(sql`DELETE FROM folha_descontos WHERE id = ${input.id}`);
      return { ok: true };
    }),
});
