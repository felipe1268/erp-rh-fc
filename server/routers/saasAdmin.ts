// Painel Master SaaS — visão consolidada das empresas-cliente (assinatura,
// MRR, trial) + ações de suspender/reativar/cancelar. Restrito a admin_master
// (equipe interna FC), NUNCA exposto a adm_cliente/user.
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { companies, companySubscriptions, companySubscriptionModules } from "../../drizzle/schema";
import { getUncachableStripeClient } from "../stripeClient";
import { SEAT_MONTHLY_PRICE_CENTS } from "../../shared/billingModules";
import { getEffectiveCatalog, type EffectiveModule } from "../billingCatalog";

function requireAdminMaster(role: string | undefined) {
  if (role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master pode acessar o Painel SaaS." });
  }
}

function computeMrrCents(seats: number, moduleIds: string[], effectiveModules: EffectiveModule[]): number {
  const modulesTotal = moduleIds.reduce((acc, id) => {
    const mod = effectiveModules.find(m => m.id === id);
    return acc + (mod?.monthlyPriceCents || 0);
  }, 0);
  return modulesTotal + seats * SEAT_MONTHLY_PRICE_CENTS;
}

function isSameMonth(dateStr: string | null | undefined, ref: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getUTCFullYear() === ref.getUTCFullYear() && d.getUTCMonth() === ref.getUTCMonth();
}

export const saasAdminRouter = router({
  listCompanies: protectedProcedure.query(async ({ ctx }) => {
    requireAdminMaster(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const subs = await db.select().from(companySubscriptions)
      .orderBy(desc(companySubscriptions.createdAt));

    const companyIds = subs.map(s => Number(s.companyId));
    const companyRows = companyIds.length > 0
      ? await db.select().from(companies)
      : [];
    const companyMap = new Map(companyRows.map((c: any) => [Number(c.id), c]));

    const allModuleLinks = await db.select().from(companySubscriptionModules);
    const modulesBySub = new Map<number, string[]>();
    for (const link of allModuleLinks) {
      const list = modulesBySub.get(Number(link.subscriptionId)) || [];
      list.push(link.moduleId);
      modulesBySub.set(Number(link.subscriptionId), list);
    }

    const { modules: effectiveModules } = await getEffectiveCatalog();

    return subs.map(sub => {
      const company = companyMap.get(Number(sub.companyId));
      const moduleIds = modulesBySub.get(Number(sub.id)) || [];
      return {
        subscriptionId: sub.id,
        companyId: sub.companyId,
        razaoSocial: company?.razaoSocial || "(empresa não encontrada)",
        cnpj: company?.cnpj || null,
        companyIsActive: company ? company.isActive === 1 : null,
        status: sub.status,
        seats: sub.seats,
        moduleIds,
        mrrCents: computeMrrCents(Number(sub.seats || 0), moduleIds, effectiveModules),
        trialEnd: sub.trialEnd,
        currentPeriodEnd: sub.currentPeriodEnd,
        canceledAt: sub.canceledAt,
        paymentFailedAt: sub.paymentFailedAt,
        createdAt: sub.createdAt,
      };
    });
  }),

  suspendCompany: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.update(companies).set({ isActive: 0 } as any).where(eq(companies.id, input.companyId));
      return { success: true };
    }),

  reactivateCompany: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.update(companies).set({ isActive: 1 } as any).where(eq(companies.id, input.companyId));
      return { success: true };
    }),

  cancelSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number(), immediately: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      requireAdminMaster(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const [sub] = await db.select().from(companySubscriptions).where(eq(companySubscriptions.id, input.subscriptionId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada." });

      const stripe = await getUncachableStripeClient();
      if (input.immediately) {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } else {
        await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      }
      // O webhook (customer.subscription.updated/deleted) sincroniza o status
      // local automaticamente via syncSubscriptionStatus — não duplicamos aqui.
      return { success: true };
    }),

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    requireAdminMaster(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const subs = await db.select().from(companySubscriptions);
    const allModuleLinks = await db.select().from(companySubscriptionModules);
    const modulesBySub = new Map<number, string[]>();
    for (const link of allModuleLinks) {
      const list = modulesBySub.get(Number(link.subscriptionId)) || [];
      list.push(link.moduleId);
      modulesBySub.set(Number(link.subscriptionId), list);
    }

    const { modules: effectiveModules } = await getEffectiveCatalog();

    const active = subs.filter(s => s.status === "active" || s.status === "trialing");
    const trialing = subs.filter(s => s.status === "trialing");
    const pastDue = subs.filter(s => s.status === "past_due");
    const canceled = subs.filter(s => s.status === "canceled");
    const mrrCents = active.reduce((acc, s) => acc + computeMrrCents(Number(s.seats || 0), modulesBySub.get(Number(s.id)) || [], effectiveModules), 0);
    const seatsTotal = active.reduce((acc, s) => acc + Number(s.seats || 0), 0);
    const arpuCents = active.length > 0 ? Math.round(mrrCents / active.length) : 0;

    // Rev. 4056 — crescimento/churn do mês corrente, pra dar noção de tração
    // (não é histórico completo — só o mês atual, cálculo em memória e leve).
    const now = new Date();
    const newThisMonth = subs.filter(s => isSameMonth(s.createdAt, now)).length;
    const canceledThisMonth = subs.filter(s => s.status === "canceled" && isSameMonth(s.canceledAt, now)).length;

    // Rev. 4056 — popularidade de cada módulo entre as empresas ATIVAS (não
    // canceladas), pra saber o que vale mais a pena promover/precificar melhor.
    const moduleBreakdown = effectiveModules.map(mod => {
      let companyCount = 0;
      let revenueCents = 0;
      for (const s of active) {
        const mods = modulesBySub.get(Number(s.id)) || [];
        if (mods.includes(mod.id)) {
          companyCount++;
          revenueCents += mod.monthlyPriceCents;
        }
      }
      return { id: mod.id, label: mod.label, companyCount, revenueCents, isActive: mod.isActive };
    }).sort((a, b) => b.companyCount - a.companyCount);

    return {
      totalCompanies: subs.length,
      activeCount: active.length,
      trialingCount: trialing.length,
      pastDueCount: pastDue.length,
      canceledCount: canceled.length,
      mrrCents,
      seatsTotal,
      arpuCents,
      newThisMonth,
      canceledThisMonth,
      moduleBreakdown,
    };
  }),
});
