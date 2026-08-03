/**
 * Adicionais Legais (Insalubridade / Periculosidade) por vigência.
 *
 * Modelo close-old + insert-new: cada ativação cria uma LINHA nova em
 * employee_adicionais; desativar só preenche dataFim (histórico preservado).
 * Reativar cria outra linha. A folha (payrollEngine.simularPagamento) lê as
 * vigências que intersectam a competência e calcula pró-rata por dias:
 *   - insalubridade  = % × salário mínimo vigente (system_criteria)
 *   - periculosidade = 30% × salário base
 * Poka-Yoke: CLT art. 193 §2º — não acumula insalubridade + periculosidade;
 * o servidor bloqueia vigências simultâneas dos dois tipos.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { sql } from "drizzle-orm";

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (AAAA-MM-DD)");

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

async function loadEmployeeOrForbid(db: any, ctxUser: any, employeeId: number) {
  const r = rows(await db.execute(sql`
    SELECT id, "companyId", COALESCE(NULLIF("nomeCompleto",''), nome) AS nome, "deletedAt"
    FROM employees WHERE id = ${employeeId} LIMIT 1
  `));
  if (!r.length || r[0].deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
  await assertCompanyAccess(ctxUser, Number(r[0].companyId));
  return r[0];
}

const TIPO_LABEL: Record<string, string> = {
  insalubridade: "Adicional de Insalubridade",
  periculosidade: "Adicional de Periculosidade",
};

async function registrarHistorico(db: any, emp: any, ctxUser: any, tipo: string, descricao: string, valorAnterior: string | null, valorNovo: string | null, dataEvento: string) {
  try {
    await db.execute(sql`
      INSERT INTO employee_history ("employeeId", "companyId", tipo, descricao, "valorAnterior", "valorNovo", "dataEvento", "registradoPor")
      VALUES (${emp.id}, ${emp.companyId}, ${tipo}, ${descricao}, ${valorAnterior}, ${valorNovo}, ${dataEvento}, ${ctxUser?.name || ctxUser?.email || null})
    `);
  } catch (err: any) {
    console.error("[AdicionaisLegais] erro gravando employee_history:", err?.message ?? err);
  }
}

export const adicionaisLegaisRouter = router({
  list: protectedProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      await loadEmployeeOrForbid(db, ctx.user, input.employeeId);
      return rows(await db.execute(sql`
        SELECT * FROM employee_adicionais
        WHERE "employeeId" = ${input.employeeId}
        ORDER BY tipo, "dataInicio" DESC, id DESC
      `));
    }),

  ativar: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      tipo: z.enum(["insalubridade", "periculosidade"]),
      percentual: z.number().int(),
      dataInicio: dataSchema,
      observacoes: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const emp = await loadEmployeeOrForbid(db, ctx.user, input.employeeId);

      // Poka-Yoke: percentuais válidos por lei
      if (input.tipo === "insalubridade" && ![10, 20, 40].includes(input.percentual)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insalubridade: percentual deve ser 10, 20 ou 40." });
      }
      if (input.tipo === "periculosidade" && input.percentual !== 30) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Periculosidade: percentual é fixo em 30%." });
      }

      // Já existe vigência ABERTA do mesmo tipo?
      const abertaMesmo = rows(await db.execute(sql`
        SELECT id FROM employee_adicionais
        WHERE "employeeId" = ${input.employeeId} AND tipo = ${input.tipo} AND "dataFim" IS NULL LIMIT 1
      `));
      if (abertaMesmo.length) {
        throw new TRPCError({ code: "CONFLICT", message: `${TIPO_LABEL[input.tipo]} já está ativo. Desative a vigência atual antes de criar outra.` });
      }

      // Poka-Yoke CLT art. 193 §2º: não acumula com o OUTRO tipo.
      // Bloqueia SOBREPOSIÇÃO TEMPORAL (não só vigência aberta): cobre o caso
      // de desativar com dataFim futura e tentar ativar o outro tipo antes do fim.
      const outroTipo = input.tipo === "insalubridade" ? "periculosidade" : "insalubridade";
      const abertaOutro = rows(await db.execute(sql`
        SELECT id FROM employee_adicionais
        WHERE "employeeId" = ${input.employeeId} AND tipo = ${outroTipo}
          AND ("dataFim" IS NULL OR "dataFim" >= ${input.dataInicio})
        LIMIT 1
      `));
      if (abertaOutro.length) {
        throw new TRPCError({ code: "CONFLICT", message: `Não é permitido acumular Insalubridade e Periculosidade (CLT art. 193 §2º). A vigência informada sobrepõe um período de ${TIPO_LABEL[outroTipo]}.` });
      }

      // Poka-Yoke: não pode sobrepor vigência já ENCERRADA (histórico)
      const sobreposta = rows(await db.execute(sql`
        SELECT id FROM employee_adicionais
        WHERE "employeeId" = ${input.employeeId} AND tipo = ${input.tipo}
          AND "dataFim" IS NOT NULL AND "dataFim" >= ${input.dataInicio}
        LIMIT 1
      `));
      if (sobreposta.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data de início sobrepõe uma vigência anterior deste adicional. Use uma data após o fim do último período." });
      }

      const r = rows(await db.execute(sql`
        INSERT INTO employee_adicionais ("companyId", "employeeId", tipo, percentual, "dataInicio", observacoes, "registradoPor")
        VALUES (${emp.companyId}, ${input.employeeId}, ${input.tipo}, ${input.percentual}, ${input.dataInicio},
                ${input.observacoes || null}, ${ctx.user?.name || ctx.user?.email || null})
        RETURNING *
      `));
      await registrarHistorico(db, emp, ctx.user, "adicional_ativado",
        `${TIPO_LABEL[input.tipo]} ativado (${input.percentual}%) a partir de ${input.dataInicio}`,
        null, `${input.percentual}%`, input.dataInicio);
      return r[0];
    }),

  desativar: protectedProcedure
    .input(z.object({ id: z.number(), dataFim: dataSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const reg = rows(await db.execute(sql`SELECT * FROM employee_adicionais WHERE id = ${input.id} LIMIT 1`));
      if (!reg.length) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
      const adic = reg[0];
      await assertCompanyAccess(ctx.user, Number(adic.companyId));
      if (adic.dataFim) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta vigência já foi encerrada." });
      if (input.dataFim < adic.dataInicio) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data de fim não pode ser anterior ao início da vigência." });
      }
      const r = rows(await db.execute(sql`
        UPDATE employee_adicionais SET "dataFim" = ${input.dataFim}, "updatedAt" = now()
        WHERE id = ${input.id} RETURNING *
      `));
      const emp = { id: adic.employeeId, companyId: adic.companyId };
      await registrarHistorico(db, emp, ctx.user, "adicional_desativado",
        `${TIPO_LABEL[adic.tipo] || adic.tipo} desativado em ${input.dataFim} (vigente desde ${adic.dataInicio}, ${adic.percentual}%)`,
        `${adic.percentual}%`, null, input.dataFim);
      return r[0];
    }),

  // Exclusão real só para Admin Master (correção de lançamento errado) — o fluxo
  // normal é DESATIVAR, preservando o histórico.
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente Admin Master pode excluir. Use Desativar para encerrar a vigência." });
      }
      const db = await getDb();
      const reg = rows(await db.execute(sql`SELECT * FROM employee_adicionais WHERE id = ${input.id} LIMIT 1`));
      if (!reg.length) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
      await assertCompanyAccess(ctx.user, Number(reg[0].companyId));
      await db.execute(sql`DELETE FROM employee_adicionais WHERE id = ${input.id}`);
      return { ok: true };
    }),
});
