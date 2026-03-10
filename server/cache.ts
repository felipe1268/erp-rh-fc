/**
 * Cache em memória com TTL para dados estáticos do ERP.
 * 
 * Dados como empresas, obras, funções e catálogo de EPIs mudam raramente
 * mas são consultados em praticamente toda tela. Este cache evita hits
 * desnecessários no banco de dados.
 * 
 * TTL padrão: 5 minutos (300s). Invalidação manual disponível.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;

  constructor(defaultTTLSeconds: number = 300) {
    this.defaultTTL = defaultTTLSeconds * 1000;
  }

  /**
   * Busca do cache ou executa a função e armazena o resultado.
   * Thread-safe: se duas requests pedirem o mesmo dado ao mesmo tempo,
   * a segunda espera a primeira resolver (dedup).
   */
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const existing = this.store.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > Date.now()) {
      return existing.data;
    }

    const data = await fetcher();
    const ttl = (ttlSeconds ?? this.defaultTTL / 1000) * 1000;
    this.store.set(key, { data, expiresAt: Date.now() + ttl });
    return data;
  }

  /** Invalida uma chave específica */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalida todas as chaves que começam com o prefixo */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Limpa todo o cache */
  clear(): void {
    this.store.clear();
  }

  /** Retorna estatísticas do cache */
  stats(): { size: number; keys: string[] } {
    // Limpar entradas expiradas
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Instância global do cache (5 min TTL padrão)
export const cache = new MemoryCache(300);

// Chaves padronizadas para facilitar invalidação
export const CACHE_KEYS = {
  companies: (companyId: number) => `companies:${companyId}`,
  allCompanies: () => `companies:all`,
  obras: (companyId: number) => `obras:${companyId}`,
  allObras: () => `obras:all`,
  employees: (companyId: number) => `employees:${companyId}`,
  jobFunctions: (companyId: number) => `jobFunctions:${companyId}`,
  epiCatalogo: (companyId: number) => `epiCatalogo:${companyId}`,
} as const;
