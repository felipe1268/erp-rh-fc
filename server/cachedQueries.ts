/**
 * Wrappers cacheados para queries frequentes de dados estáticos.
 * 
 * Estas funções envolvem as queries originais do db.ts com cache em memória.
 * Use estas funções ao invés das originais quando não precisar de dados
 * em tempo real (ex: listagens de empresas, obras, funções, catálogo EPIs).
 * 
 * Para operações de escrita (create/update/delete), continue usando db.ts
 * diretamente e chame invalidateCompanyCache() após a mutação.
 */

import { cache, CACHE_KEYS } from "./cache";
import { getCompanies, getObras, getObrasByCompanyActive, listJobFunctions } from "./db";

// ============================================================
// QUERIES CACHEADAS (TTL: 5 min)
// ============================================================

/** Lista todas as empresas (cacheada por 5 min) */
export async function getCachedCompanies() {
  return cache.getOrSet(CACHE_KEYS.allCompanies(), () => getCompanies(), 300);
}

/** Lista obras de uma empresa (cacheada por 5 min) */
export async function getCachedObras(companyId: number) {
  return cache.getOrSet(CACHE_KEYS.obras(companyId), () => getObras(companyId), 300);
}

/** Lista obras ativas de uma empresa (cacheada por 5 min) */
export async function getCachedObrasAtivas(companyId: number) {
  return cache.getOrSet(
    `obras_ativas:${companyId}`,
    () => getObrasByCompanyActive(companyId),
    300
  );
}

/** Lista funções de uma empresa (cacheada por 5 min) */
export async function getCachedJobFunctions(companyId: number) {
  return cache.getOrSet(CACHE_KEYS.jobFunctions(companyId), () => listJobFunctions(companyId), 300);
}

// ============================================================
// INVALIDAÇÃO
// ============================================================

/** Invalida cache de uma empresa específica (chamar após create/update/delete) */
export function invalidateCompanyCache(companyId: number) {
  cache.invalidate(CACHE_KEYS.companies(companyId));
  cache.invalidate(CACHE_KEYS.allCompanies());
}

/** Invalida cache de obras de uma empresa */
export function invalidateObrasCache(companyId: number) {
  cache.invalidate(CACHE_KEYS.obras(companyId));
  cache.invalidate(`obras_ativas:${companyId}`);
  cache.invalidate(CACHE_KEYS.allObras());
}

/** Invalida cache de funções de uma empresa */
export function invalidateJobFunctionsCache(companyId: number) {
  cache.invalidate(CACHE_KEYS.jobFunctions(companyId));
}

/** Invalida cache de EPIs de uma empresa */
export function invalidateEpiCache(companyId: number) {
  cache.invalidate(CACHE_KEYS.epiCatalogo(companyId));
}

/** Invalida todo o cache (usar com cuidado) */
export function invalidateAllCache() {
  cache.clear();
}
