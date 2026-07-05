// Rev. 4045 — T005: enforcement de módulos contratados (SaaS).
//
// Regra de compatibilidade: empresas SEM linha em `company_subscriptions`
// (todas as empresas internas históricas da FC Engenharia, cadastradas antes
// da transformação SaaS) são tratadas como "legado" e têm acesso irrestrito —
// nunca ficaram sujeitas a cobrança por módulo. Só empresas-cliente que
// passaram pelo checkout self-service (T002) têm subscription real e, a
// partir daí, só acessam os módulos presentes em `company_subscription_modules`
// enquanto o status da assinatura permitir uso (trialing/active/past_due —
// past_due é o período de graça do dunning, ver server/webhookHandlers.ts).
//
// O gate roda por USUÁRIO, não por empresa isolada: se QUALQUER empresa
// acessível ao usuário permite o módulo (seja por ser legado, seja por ter
// contratado), a chamada passa. Isso evita quebrar usuários com acesso a
// múltiplas empresas (comum no ERP) e mantém admin/admin_master (que veem
// TODAS as empresas via getCompaniesForUser) sempre liberados, já que a FC
// sempre terá ao menos uma empresa legada sem assinatura.
import { getCompaniesForUser } from "../db";
import { getDb } from "../db";
import { companySubscriptions, companySubscriptionModules } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";

// Mapeia o namespace de topo do router tRPC (appRouter) para o moduleId de
// cobrança (shared/billingModules.ts). Namespaces ausentes daqui NUNCA são
// gateados (ex.: auth, companies, users, notifications, billing, saasAdmin,
// system, docs base, etc. — funcionalidades de plataforma/base plan).
export const ROUTER_MODULE_MAP: Record<string, string> = {
  // financeiro
  financial: "financeiro",
  bankStatementTemplates: "financeiro",
  // compras
  compras: "compras",
  purchase: "compras",
  // almoxarifado & equipamentos
  warehouse: "almoxarifado",
  auditoriaAlmoxarifado: "almoxarifado",
  equipamentos: "almoxarifado",
  ferramentasTerceiros: "almoxarifado",
  epis: "almoxarifado",
  epiAvancado: "almoxarifado",
  // sst
  sst: "sst",
  sstDocuments: "sst",
  integracaoSST: "sst",
  sstAnalytics: "sst",
  acidentes: "sst",
  dds: "sst",
  ptPermissoes: "sst",
  aprAnalises: "sst",
  // medição
  medicao: "medicao",
  medicaoConfig: "medicao",
  // folha / rh-dp
  payrollEngine: "rh-dp",
  horasExtras: "rh-dp",
  recontratacao: "rh-dp",
  coletaRh: "rh-dp",
  // frotas
  frotas: "frotas",
  // planejamento
  planejamento: "planejamento",
  bim: "planejamento",
  iaCronograma: "planejamento",
  // orçamento
  orcamento: "orcamento",
  orcamentista: "orcamento",
  // terceiros
  terceiros: "terceiros",
  terceiroContratos: "terceiros",
  // parceiros
  parceiros: "parceiros",
  portalServico: "parceiros",
  // avaliação de desempenho
  avaliacao: "avaliacao",
  avaliacaoFuncionarios: "avaliacao",
  // gestão de documentos
  gestaoDocumentos: "gestao-documentos",
  systemDocumentTemplates: "gestao-documentos",
};

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

type CacheEntry = { value: boolean; expiresAt: number };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: number, moduleId: string) {
  return `${userId}:${moduleId}`;
}

/** Limpa o cache (usado após updateSubscription para refletir mudança na hora). */
export function invalidateModuleGateCache(userId?: number) {
  if (userId === undefined) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

export async function isModuleAccessibleForUser(userId: number, role: string, moduleId: string): Promise<boolean> {
  const key = cacheKey(userId, moduleId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const result = await computeModuleAccess(userId, role, moduleId);
  cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function computeModuleAccess(userId: number, role: string, moduleId: string): Promise<boolean> {
  // Rev. 4040 (confirmado por design): admin/admin_master são staff interno
  // FC com acesso global irrestrito — nunca sujeitos ao gate de módulos SaaS,
  // mesmo ao navegar dentro de uma empresa-cliente específica.
  if (role === "admin" || role === "admin_master") return true;

  const db = await getDb();
  if (!db) return true; // sem DB configurado (dev sem banco) — não bloquear

  const companies = await getCompaniesForUser(userId, role);
  if (!companies.length) return false;
  const companyIds = companies.map((c: any) => c.id);

  const subs = await db.select().from(companySubscriptions).where(inArray(companySubscriptions.companyId, companyIds));
  const subscribedCompanyIds = new Set(subs.map(s => s.companyId));

  // Qualquer empresa acessível SEM subscription = legado, acesso liberado.
  const hasLegacyCompany = companyIds.some((id: number) => !subscribedCompanyIds.has(id));
  if (hasLegacyCompany) return true;

  if (!subs.length) return false;
  const activeSubs = subs.filter(s => ACTIVE_STATUSES.has(s.status));
  if (!activeSubs.length) return false;

  const subIds = activeSubs.map(s => s.id);
  const modules = await db.select().from(companySubscriptionModules).where(inArray(companySubscriptionModules.subscriptionId, subIds));
  return modules.some(m => m.moduleId === moduleId);
}
