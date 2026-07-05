// Rev. 4059 — helper central de catálogo SaaS, compartilhado por billing.ts
// (loja pública/self-service) e saasAdmin.ts (Painel SaaS), evitando duplicar
// a leitura de `billing_module_prices`. Cada módulo pode ter preço E
// disponibilidade-para-venda (isActive) sobrescritos pelo admin_master.
import { getDb } from "./db";
import { billingModulePrices } from "../drizzle/schema";
import { BILLING_MODULES, SEAT_MONTHLY_PRICE_CENTS, applyPriceOverrides, type BillingModuleDefinition } from "../shared/billingModules";

export interface ModuleOverride {
  monthlyPriceCents: number;
  isActive: boolean;
}

export type EffectiveModule = BillingModuleDefinition & { isActive: boolean };

export async function getModuleOverrides(): Promise<Record<string, ModuleOverride>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(billingModulePrices);
  const map: Record<string, ModuleOverride> = {};
  for (const r of rows) {
    map[r.moduleId] = { monthlyPriceCents: r.monthlyPriceCents, isActive: r.isActive !== 0 };
  }
  return map;
}

/**
 * `modules` traz TODOS os módulos (inclusive fora de venda, com `isActive:false`) —
 * necessário pra assinantes já contratados continuarem vendo/gerenciando o que já
 * têm. `sellableModules` é o subconjunto exibido em /planos e no checkout/upgrade
 * (loja pública NUNCA lista módulo desativado).
 */
export async function getEffectiveCatalog(): Promise<{
  modules: EffectiveModule[];
  sellableModules: EffectiveModule[];
  seatMonthlyPriceCents: number;
}> {
  const overrides = await getModuleOverrides();
  const priceMap: Record<string, number> = {};
  for (const [id, o] of Object.entries(overrides)) priceMap[id] = o.monthlyPriceCents;

  const modules: EffectiveModule[] = applyPriceOverrides(BILLING_MODULES, priceMap).map(m => ({
    ...m,
    isActive: overrides[m.id]?.isActive ?? true,
  }));

  return {
    modules,
    sellableModules: modules.filter(m => m.isActive),
    seatMonthlyPriceCents: overrides["seat"]?.monthlyPriceCents ?? SEAT_MONTHLY_PRICE_CENTS,
  };
}
