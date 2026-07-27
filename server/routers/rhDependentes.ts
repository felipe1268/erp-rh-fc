// ============================================================================
// Rev. 4672 — FASE 4: DEPENDENTES DO COLABORADOR
// Cadastro completo (nome, parentesco, nascimento, CPF, certidão, vacinação,
// IRRF e salário-família) com anexos por dependente. Guards anti-IDOR: toda
// operação valida acesso à empresa via getCompaniesForUser, e o vínculo do
// funcionário à empresa informada.
// ============================================================================
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { employeeDependentes, employees } from "../../drizzle/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { storagePut } from "../storage";

async function assertAccess(userId: number, role: string, companyId: number) {
  const allowed = new Set((await getCompaniesForUser(userId, role)).map((c: any) => c.id));
  if (!allowed.has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à empresa informada." });
  }
}

/** Carrega dependente e valida acesso à empresa DELE (anti-IDOR). */
async function loadDepGuarded(db: any, ctx: any, id: number) {
  const [dep] = await db.select().from(employeeDependentes)
    .where(and(eq(employeeDependentes.id, id), isNull(employeeDependentes.deletedAt)));
  if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Dependente não encontrado." });
  await assertAccess(ctx.user.id, ctx.user.role, dep.companyId);
  return dep;
}

const depInput = z.object({
  nome: z.string().min(2).max(255),
  parentesco: z.enum(["filho", "conjuge", "enteado", "pai_mae", "outro"]),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  cpf: z.string().max(14).nullish(),
  irrf: z.boolean().optional(),
  salarioFamilia: z.boolean().optional(),
  observacoes: z.string().max(2000).nullish(),
});

export const rhDependentesRouter = router({
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      return db.select().from(employeeDependentes).where(and(
        eq(employeeDependentes.companyId, input.companyId),
        eq(employeeDependentes.employeeId, input.employeeId),
        isNull(employeeDependentes.deletedAt),
      )).orderBy(asc(employeeDependentes.nome));
    }),

  criar: protectedProcedure
    .input(depInput.extend({ companyId: z.number(), employeeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const [emp] = await db.select({ id: employees.id }).from(employees).where(and(
        eq(employees.id, input.employeeId),
        eq(employees.companyId, input.companyId),
        isNull(employees.deletedAt),
      ));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado nesta empresa." });
      const [row] = await db.insert(employeeDependentes).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        nome: input.nome.trim(),
        parentesco: input.parentesco,
        dataNascimento: input.dataNascimento || null,
        cpf: input.cpf?.trim() || null,
        irrf: input.irrf ? 1 : 0,
        salarioFamilia: input.salarioFamilia ? 1 : 0,
        observacoes: input.observacoes?.trim() || null,
      }).returning({ id: employeeDependentes.id });
      return { id: row.id };
    }),

  atualizar: protectedProcedure
    .input(depInput.partial().extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await loadDepGuarded(db, ctx, input.id);
      const set: Record<string, any> = { updatedAt: new Date().toISOString() };
      if (input.nome !== undefined) set.nome = input.nome.trim();
      if (input.parentesco !== undefined) set.parentesco = input.parentesco;
      if (input.dataNascimento !== undefined) set.dataNascimento = input.dataNascimento || null;
      if (input.cpf !== undefined) set.cpf = input.cpf?.trim() || null;
      if (input.irrf !== undefined) set.irrf = input.irrf ? 1 : 0;
      if (input.salarioFamilia !== undefined) set.salarioFamilia = input.salarioFamilia ? 1 : 0;
      if (input.observacoes !== undefined) set.observacoes = input.observacoes?.trim() || null;
      await db.update(employeeDependentes).set(set).where(eq(employeeDependentes.id, input.id));
      return { ok: true };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await loadDepGuarded(db, ctx, input.id);
      await db.update(employeeDependentes)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(employeeDependentes.id, input.id));
      return { ok: true };
    }),

  /** Anexa certidão ou caderneta de vacinação (base64, máx ~5MB). */
  anexar: protectedProcedure
    .input(z.object({
      id: z.number(),
      campo: z.enum(["certidao", "vacinacao"]),
      base64: z.string().min(10),
      contentType: z.string().max(100),
      nomeArquivo: z.string().max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const dep = await loadDepGuarded(db, ctx, input.id);
      if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de arquivo não suportado (use imagem ou PDF)." });
      }
      const buffer = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (buffer.length > 5 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo acima de 5MB." });
      }
      const ext = input.nomeArquivo.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const key = `dependentes/${dep.companyId}/${dep.employeeId}/${input.id}-${input.campo}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      await db.update(employeeDependentes)
        .set(input.campo === "certidao" ? { certidaoUrl: url, updatedAt: new Date().toISOString() } : { vacinacaoUrl: url, updatedAt: new Date().toISOString() })
        .where(eq(employeeDependentes.id, input.id));
      return { url };
    }),
});
