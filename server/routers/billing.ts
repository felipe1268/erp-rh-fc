// Router público (não-autenticado) para o fluxo de contratação self-service
// do SaaS: página "/planos" lista o catálogo, "/contratar" cria a Stripe
// Checkout Session (assinatura com trial de 3 dias + cartão obrigatório).
// O provisionamento real (criar company/adm_cliente) acontece via webhook —
// ver server/billingProvisioning.ts — nunca aqui (checkout pode ser abandonado).
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { getDb, getCompaniesForUser } from "../db";
import { companies, companySubscriptions, companySubscriptionModules, billingModulePrices } from "../../drizzle/schema";
import { getUncachableStripeClient, getModulePriceMap, invalidateModulePriceCache } from "../stripeClient";
import { BILLING_MODULES, SEAT_MONTHLY_PRICE_CENTS, TRIAL_PERIOD_DAYS, applyPriceOverrides } from "../../shared/billingModules";
import { invalidateModuleGateCache } from "../_core/moduleGating";

function requireAdminMaster(role: string | undefined) {
  if (role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master pode ajustar preços do catálogo." });
  }
}

// Rev. 4047 — lê `billing_module_prices` (override editável) e mescla com os
// defaults estáticos de shared/billingModules.ts. Sem linha na tabela = usa o
// default; "seat" é tratado separadamente pois não faz parte de BILLING_MODULES.
async function getPriceOverrides(): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(billingModulePrices);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.moduleId] = r.monthlyPriceCents;
  return map;
}

async function getEffectiveCatalog() {
  const overrides = await getPriceOverrides();
  return {
    modules: applyPriceOverrides(BILLING_MODULES, overrides),
    seatMonthlyPriceCents: overrides["seat"] ?? SEAT_MONTHLY_PRICE_CENTS,
  };
}

// Rev. 4044 — self-service de lifecycle (T004): só `adm_cliente` gerencia a
// PRÓPRIA assinatura (nunca outra empresa). `admin`/`admin_master` são staff
// interno FC sem assinatura própria — ficam de fora deste guard por design
// (gestão cross-empresa é exclusiva do Painel SaaS em `saasAdmin.ts`).
async function getOwnSubscriptionOrThrow(userId: number, role: string) {
  if (role !== "adm_cliente") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o administrador da empresa-cliente pode gerenciar a assinatura." });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  const myCompanies = await getCompaniesForUser(userId, role);
  if (myCompanies.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma empresa vinculada a este usuário." });
  }
  const companyId = Number(myCompanies[0].id);
  const [sub] = await db.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, companyId));
  if (!sub) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma assinatura encontrada para esta empresa." });
  }
  return { db, companyId, sub };
}

function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function resolveOrigin(req: any): string {
  const configured = process.env.APP_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  return `${proto}://${host}`;
}

export const billingRouter = router({
  getCatalog: publicProcedure.query(async () => {
    const { modules, seatMonthlyPriceCents } = await getEffectiveCatalog();
    return {
      modules: modules.map(m => ({
        id: m.id,
        label: m.label,
        description: m.description,
        monthlyPriceCents: m.monthlyPriceCents,
      })),
      seatMonthlyPriceCents,
      trialPeriodDays: TRIAL_PERIOD_DAYS,
    };
  }),

  // Rev. 4047 — admin_master ajusta os valores de catálogo (baixar pra atrair
  // cliente novo, subir depois que ele já usa o sistema). Cria um NOVO Stripe
  // Price (imóveis são imutáveis na Stripe) e arquiva o antigo; assinaturas já
  // ativas continuam com o preço travado no momento da contratação — só o
  // catálogo (novas vendas / upgrades) muda.
  adminGetPrices: protectedProcedure.query(async ({ ctx }) => {
    requireAdminMaster(ctx.user.role);
    const overrides = await getPriceOverrides();
    const modules = BILLING_MODULES.map(m => ({
      id: m.id,
      label: m.label,
      defaultPriceCents: m.monthlyPriceCents,
      currentPriceCents: overrides[m.id] ?? m.monthlyPriceCents,
    }));
    modules.push({
      id: "seat",
      label: "Assento por usuário",
      defaultPriceCents: SEAT_MONTHLY_PRICE_CENTS,
      currentPriceCents: overrides["seat"] ?? SEAT_MONTHLY_PRICE_CENTS,
    });
    return { modules };
  }),

  adminUpdatePrices: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        id: z.string(),
        monthlyPriceCents: z.number().int().min(0).max(10_000_00),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminMaster(ctx.user.role);
      const validIds = new Set([...BILLING_MODULES.map(m => m.id), "seat"]);
      const invalid = input.updates.filter(u => !validIds.has(u.id));
      if (invalid.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Módulo(s) inválido(s): ${invalid.map(u => u.id).join(", ")}` });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

      const stripe = await getUncachableStripeClient();
      const priceMap = await getModulePriceMap();

      for (const update of input.updates) {
        // Persiste o valor exibido/cobrado no catálogo local (fonte para getCatalog).
        await db.execute(
          sql`
            INSERT INTO billing_module_prices (module_id, monthly_price_cents, updated_by_name)
            VALUES (${update.id}, ${update.monthlyPriceCents}, ${ctx.user.name || "admin_master"})
            ON CONFLICT (module_id) DO UPDATE SET
              monthly_price_cents = EXCLUDED.monthly_price_cents,
              updated_by_name = EXCLUDED.updated_by_name,
              updated_at = NOW()
          `
        );

        // Sincroniza com o Stripe: cria um Price novo (imutável) apontando pro
        // mesmo Product do preço ativo atual e arquiva o antigo. Sem preço
        // ativo prévio (catálogo Stripe ainda não semeado) apenas grava o
        // override local — o seed inicial via scripts/seed-products.ts segue
        // valendo até o próximo `pnpm seed:products`.
        const currentPriceId = priceMap[update.id];
        if (currentPriceId) {
          try {
            const currentPrice = await stripe.prices.retrieve(currentPriceId);
            const productId = typeof currentPrice.product === "string" ? currentPrice.product : currentPrice.product.id;
            const newPrice = await stripe.prices.create({
              product: productId,
              currency: "brl",
              unit_amount: update.monthlyPriceCents,
              recurring: { interval: "month" },
              metadata: { moduleId: update.id },
            });
            await stripe.prices.update(currentPriceId, { active: false });
            await stripe.products.update(productId, { default_price: newPrice.id });
          } catch (e: any) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha ao sincronizar preço "${update.id}" no Stripe: ${e?.message || e}` });
          }
        }
      }

      invalidateModulePriceCache();
      return { success: true };
    }),

  createCheckoutSession: publicProcedure
    .input(z.object({
      razaoSocial: z.string().min(2).max(255),
      cnpj: z.string().min(11).max(18),
      adminName: z.string().min(2).max(255),
      adminEmail: z.string().email(),
      adminUsername: z.string().min(3).max(100).optional(),
      moduleIds: z.array(z.string()).min(1, "Selecione ao menos 1 módulo"),
      seats: z.number().int().min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const cnpjDigits = onlyDigits(input.cnpj);
      if (cnpjDigits.length !== 14) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido." });
      }

      const invalidModules = input.moduleIds.filter(id => !BILLING_MODULES.some(m => m.id === id));
      if (invalidModules.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Módulo(s) inválido(s): ${invalidModules.join(", ")}` });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

      const existing = await db.select({ id: companies.id }).from(companies).where(eq(companies.cnpj, cnpjDigits));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma empresa cadastrada com este CNPJ." });
      }

      const priceMap = await getModulePriceMap();
      const missingPrices = input.moduleIds.filter(id => !priceMap[id]);
      if (missingPrices.length > 0 || !priceMap["seat"]) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Catálogo de preços não configurado no Stripe (rode o seed de produtos).",
        });
      }

      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.create({
        name: input.razaoSocial,
        email: input.adminEmail,
        metadata: { cnpj: cnpjDigits },
      });

      const lineItems = [
        { price: priceMap["seat"], quantity: input.seats },
        ...input.moduleIds.map(id => ({ price: priceMap[id], quantity: 1 })),
      ];

      const subscriptionMetadata = {
        razaoSocial: input.razaoSocial,
        cnpj: cnpjDigits,
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        adminUsername: input.adminUsername || input.adminEmail.split("@")[0],
        moduleIds: input.moduleIds.join(","),
        seats: String(input.seats),
      };

      const origin = resolveOrigin(ctx.req);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customer.id,
        line_items: lineItems,
        payment_method_collection: "always",
        subscription_data: {
          trial_period_days: TRIAL_PERIOD_DAYS,
          metadata: subscriptionMetadata,
        },
        metadata: subscriptionMetadata,
        success_url: `${origin}/contratar/sucesso?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/contratar?cancelado=1`,
        allow_promotion_codes: true,
        locale: "pt-BR",
      });

      if (!session.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe não retornou a URL do checkout." });
      }

      return { checkoutUrl: session.url };
    }),

  getCheckoutSessionStatus: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(input.sessionId, { expand: ["subscription"] });
      return {
        status: session.status,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email || null,
      };
    }),

  // ===== T004 — Lifecycle self-service (adm_cliente gerencia a PRÓPRIA empresa) =====

  getMySubscription: protectedProcedure.query(async ({ ctx }) => {
    const { sub } = await getOwnSubscriptionOrThrow(ctx.user.id, ctx.user.role);
    const db = await getDb();
    const links = db ? await db.select().from(companySubscriptionModules).where(eq(companySubscriptionModules.subscriptionId, sub.id)) : [];
    const { modules, seatMonthlyPriceCents } = await getEffectiveCatalog();
    return {
      status: sub.status,
      seats: sub.seats,
      moduleIds: links.map(l => l.moduleId),
      trialEnd: sub.trialEnd,
      currentPeriodEnd: sub.currentPeriodEnd,
      canceledAt: sub.canceledAt,
      paymentFailedAt: sub.paymentFailedAt,
      modules: modules.map(m => ({ id: m.id, label: m.label, description: m.description, monthlyPriceCents: m.monthlyPriceCents })),
      seatMonthlyPriceCents,
    };
  }),

  // Rev. 4045 — T005: usado pelo frontend (ModuleConfigContext) para esconder
  // da sidebar/gate de UI módulos não contratados. `legacy:true` = empresa sem
  // subscription (interna FC) → libera tudo; senão só os moduleIds retornados.
  getContractedModules: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      // admin/admin_master: staff interno FC, acesso global irrestrito (Rev. 4040).
      if (ctx.user.role === "admin" || ctx.user.role === "admin_master") {
        return { legacy: true, moduleIds: [] as string[] };
      }
      const db = await getDb();
      if (!db) return { legacy: true, moduleIds: [] as string[] };
      const myCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!myCompanies.some((c: any) => Number(c.id) === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [sub] = await db.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, input.companyId));
      if (!sub) return { legacy: true, moduleIds: [] as string[] };
      const ACTIVE = new Set(["trialing", "active", "past_due"]);
      if (!ACTIVE.has(sub.status)) return { legacy: false, moduleIds: [] as string[] };
      const links = await db.select().from(companySubscriptionModules).where(eq(companySubscriptionModules.subscriptionId, sub.id));
      return { legacy: false, moduleIds: links.map(l => l.moduleId) };
    }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const { sub } = await getOwnSubscriptionOrThrow(ctx.user.id, ctx.user.role);
    const stripe = await getUncachableStripeClient();
    const origin = resolveOrigin(ctx.req);
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${origin}/minha-assinatura`,
    });
    return { portalUrl: session.url };
  }),

  // Ajusta módulos contratados + quantidade de assentos DIRETAMENTE no Stripe
  // (sem passar pelo Customer Portal, que não expõe troca de itens de forma
  // amigável). O webhook `customer.subscription.updated` reconcilia o status
  // local em seguida — mas já atualizamos as tabelas de módulo aqui, síncrono,
  // para a UI refletir na hora (sem esperar o round-trip do webhook).
  updateSubscription: protectedProcedure
    .input(z.object({
      moduleIds: z.array(z.string()).min(1, "Selecione ao menos 1 módulo"),
      seats: z.number().int().min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const invalidModules = input.moduleIds.filter(id => !BILLING_MODULES.some(m => m.id === id));
      if (invalidModules.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Módulo(s) inválido(s): ${invalidModules.join(", ")}` });
      }

      const { db, sub } = await getOwnSubscriptionOrThrow(ctx.user.id, ctx.user.role);
      if (sub.status === "canceled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura cancelada — não é possível alterar módulos/assentos." });
      }

      const priceMap = await getModulePriceMap();
      const missingPrices = input.moduleIds.filter(id => !priceMap[id]);
      if (missingPrices.length > 0 || !priceMap["seat"]) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Catálogo de preços não configurado no Stripe." });
      }

      const stripe = await getUncachableStripeClient();
      const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      const currentItems = subscription.items.data;

      const seatItem = currentItems.find(it => it.price.id === priceMap["seat"]);
      const items: any[] = [];

      if (seatItem) {
        if (seatItem.quantity !== input.seats) items.push({ id: seatItem.id, quantity: input.seats });
      } else {
        items.push({ price: priceMap["seat"], quantity: input.seats });
      }

      const moduleItemsByPrice = new Map(
        currentItems.filter(it => it.price.metadata?.moduleId).map(it => [it.price.metadata!.moduleId as string, it])
      );
      for (const moduleId of input.moduleIds) {
        if (!moduleItemsByPrice.has(moduleId)) {
          items.push({ price: priceMap[moduleId], quantity: 1 });
        }
      }
      for (const [moduleId, item] of moduleItemsByPrice.entries()) {
        if (!input.moduleIds.includes(moduleId)) {
          items.push({ id: item.id, deleted: true });
        }
      }

      if (items.length > 0) {
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          items,
          proration_behavior: "create_prorations",
        });
      }

      await db.update(companySubscriptions).set({ seats: input.seats, updatedAt: new Date().toISOString() } as any)
        .where(eq(companySubscriptions.id, sub.id));
      await db.delete(companySubscriptionModules).where(eq(companySubscriptionModules.subscriptionId, sub.id));
      const refreshedPriceMap = await getModulePriceMap();
      await db.insert(companySubscriptionModules).values(
        input.moduleIds.map(moduleId => ({
          subscriptionId: sub.id,
          moduleId,
          stripePriceId: refreshedPriceMap[moduleId] || null,
        }))
      );

      invalidateModuleGateCache(ctx.user.id);
      return { success: true };
    }),

  cancelMySubscription: protectedProcedure
    .input(z.object({ immediately: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const { sub } = await getOwnSubscriptionOrThrow(ctx.user.id, ctx.user.role);
      const stripe = await getUncachableStripeClient();
      if (input.immediately) {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } else {
        await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      }
      invalidateModuleGateCache(ctx.user.id);
      return { success: true };
    }),

  reactivateMySubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const { sub } = await getOwnSubscriptionOrThrow(ctx.user.id, ctx.user.role);
    const stripe = await getUncachableStripeClient();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: false });
    invalidateModuleGateCache(ctx.user.id);
    return { success: true };
  }),
});
