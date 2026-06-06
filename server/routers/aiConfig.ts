// Rev. 2805 — Router de configuração do liga/desliga de IA por módulo/empresa.
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getUserCompanyLinks } from "../db";
import { aiModuleConfig } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { AI_MODULES, AI_MODULE_KEYS, type AiModuleKey } from "../../shared/aiModules";

// Guard PERMISSIVO de empresa (mesmo padrão de compras._assertCompanyAccess):
// admin libera; usuário SEM vínculo libera; só bloqueia usuário vinculado a
// empresas tentando uma empresa fora dos vínculos.
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

const moduloEnum = z.enum(AI_MODULE_KEYS as [AiModuleKey, ...AiModuleKey[]]);

export const aiConfigRouter = router({
  // Retorna { modulos: [{ key, label, descricao, enabled }] } — default habilitado.
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const rows = await db
        .select({ modulo: aiModuleConfig.modulo, enabled: aiModuleConfig.enabled })
        .from(aiModuleConfig)
        .where(eq(aiModuleConfig.companyId, input.companyId));
      const map = new Map(rows.map(r => [r.modulo, Number(r.enabled) !== 0]));
      return {
        modulos: AI_MODULES.map(m => ({
          key: m.key,
          label: m.label,
          descricao: m.descricao,
          enabled: map.get(m.key) ?? true,
        })),
      };
    }),

  // Liga/desliga UM módulo de IA para a empresa.
  setModulo: protectedProcedure
    .input(z.object({ companyId: z.number(), modulo: moduloEnum, enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const enabledVal = input.enabled ? 1 : 0;
      const updatedBy = ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? "");
      const [existing] = await db
        .select({ id: aiModuleConfig.id })
        .from(aiModuleConfig)
        .where(and(eq(aiModuleConfig.companyId, input.companyId), eq(aiModuleConfig.modulo, input.modulo)))
        .limit(1);
      if (existing) {
        await db
          .update(aiModuleConfig)
          .set({ enabled: enabledVal, updatedBy, updatedAt: new Date().toISOString() })
          .where(eq(aiModuleConfig.id, existing.id));
      } else {
        await db.insert(aiModuleConfig).values({
          companyId: input.companyId,
          modulo: input.modulo,
          enabled: enabledVal,
          updatedBy,
        });
      }
      return { ok: true };
    }),

  // Liga/desliga TODOS os módulos de IA de uma vez.
  setTodos: protectedProcedure
    .input(z.object({ companyId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const enabledVal = input.enabled ? 1 : 0;
      const updatedBy = ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? "");
      for (const m of AI_MODULE_KEYS) {
        const [existing] = await db
          .select({ id: aiModuleConfig.id })
          .from(aiModuleConfig)
          .where(and(eq(aiModuleConfig.companyId, input.companyId), eq(aiModuleConfig.modulo, m)))
          .limit(1);
        if (existing) {
          await db
            .update(aiModuleConfig)
            .set({ enabled: enabledVal, updatedBy, updatedAt: new Date().toISOString() })
            .where(eq(aiModuleConfig.id, existing.id));
        } else {
          await db.insert(aiModuleConfig).values({
            companyId: input.companyId,
            modulo: m,
            enabled: enabledVal,
            updatedBy,
          });
        }
      }
      return { ok: true };
    }),
});
