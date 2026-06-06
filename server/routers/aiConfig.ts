// Rev. 2805 — Router de configuração do liga/desliga de IA por módulo/empresa.
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getUserCompanyLinks } from "../db";
import { aiModuleConfig } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { isAiModuleEnabled } from "../_core/aiConfig";
import {
  AI_MODULES,
  AI_MODULE_KEYS,
  type AiModuleKey,
  QA_CHAT_MODULES,
  QA_CHAT_MODULE_KEYS,
  qaChatModuleKey,
  type QaChatModuleKey,
} from "../../shared/aiModules";

// Rev. 2809 — upsert genérico de (companyId, modulo) -> enabled, reaproveitado
// pelas mutations de feature e de chat Q&A.
async function upsertModuloEnabled(
  db: any,
  companyId: number,
  modulo: string,
  enabled: boolean,
  updatedBy: string,
) {
  const enabledVal = enabled ? 1 : 0;
  const [existing] = await db
    .select({ id: aiModuleConfig.id })
    .from(aiModuleConfig)
    .where(and(eq(aiModuleConfig.companyId, companyId), eq(aiModuleConfig.modulo, modulo)))
    .limit(1);
  if (existing) {
    await db
      .update(aiModuleConfig)
      .set({ enabled: enabledVal, updatedBy, updatedAt: new Date().toISOString() })
      .where(eq(aiModuleConfig.id, existing.id));
  } else {
    await db.insert(aiModuleConfig).values({ companyId, modulo, enabled: enabledVal, updatedBy });
  }
}

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

  // ────────────────────────────────────────────────────────────────────────
  // Rev. 2809 — CHAT "PERGUNTAS E RESPOSTAS" (botão verde / IAModuloChat).
  // A ÚNICA IA controlada pela tela de Configurações. Toggle por persona
  // (planejamento, orçamento, compras, rh, financeiro, sst, medição) ou todas.
  // Escopo: companyId > 0 = empresa; companyId = 0 = GLOBAL (todas as empresas).
  // Display (e enforcement) seguem precedência empresa > global > habilitado.
  // ────────────────────────────────────────────────────────────────────────

  // Retorna { modulos: [{ key, persona, label, descricao, enabled }] }.
  getQaConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      // Linhas da empresa (quando há) + linhas globais (companyId = 0).
      const empresaRows = input.companyId
        ? await db
            .select({ modulo: aiModuleConfig.modulo, enabled: aiModuleConfig.enabled })
            .from(aiModuleConfig)
            .where(eq(aiModuleConfig.companyId, input.companyId))
        : [];
      const globalRows = await db
        .select({ modulo: aiModuleConfig.modulo, enabled: aiModuleConfig.enabled })
        .from(aiModuleConfig)
        .where(eq(aiModuleConfig.companyId, 0));
      const empresaMap = new Map(empresaRows.map(r => [r.modulo, Number(r.enabled) !== 0]));
      const globalMap = new Map(globalRows.map(r => [r.modulo, Number(r.enabled) !== 0]));
      return {
        modulos: QA_CHAT_MODULES.map(m => ({
          key: m.key,
          persona: m.persona,
          label: m.label,
          descricao: m.descricao,
          enabled: empresaMap.get(m.key) ?? globalMap.get(m.key) ?? true,
        })),
      };
    }),

  // Liga/desliga UMA persona do chat Q&A.
  setQaModulo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      modulo: z.enum(QA_CHAT_MODULE_KEYS as [QaChatModuleKey, ...QaChatModuleKey[]]),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const updatedBy = ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? "");
      await upsertModuloEnabled(db, input.companyId, input.modulo, input.enabled, updatedBy);
      return { ok: true };
    }),

  // Liga/desliga TODAS as personas do chat Q&A de uma vez.
  setQaTodos: protectedProcedure
    .input(z.object({ companyId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const updatedBy = ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? "");
      for (const m of QA_CHAT_MODULE_KEYS) {
        await upsertModuloEnabled(db, input.companyId, m, input.enabled, updatedBy);
      }
      return { ok: true };
    }),

  // Leitura leve usada pelo próprio botão flutuante p/ se auto-ocultar quando
  // a persona do chat estiver desativada. Aceita a persona crua do IAModuloChat.
  isQaModuloEnabled: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), modulo: z.string() }))
    .query(async ({ input }) => {
      const enabled = await isAiModuleEnabled(input.companyId, qaChatModuleKey(input.modulo));
      return { enabled };
    }),
});
