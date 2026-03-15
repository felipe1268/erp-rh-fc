/**
 * Cache de memória server-side com TTL
 * Reduz hits ao banco para dados frequentemente consultados (empresas, obras, módulos, etc.)
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemCache {
  private store = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Limpar entradas expiradas a cada 5 minutos
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Invalida todas as chaves que começam com o prefixo */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  /** Wrapper: busca no cache ou executa a função e armazena o resultado */
  async getOrFetch<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fetchFn();
    this.set(key, data, ttlMs);
    return data;
  }
}

export const memCache = new MemCache();

// TTLs predefinidos (em ms)
export const TTL = {
  SHORT:  30 * 1000,          // 30s — dados semi-dinâmicos
  MEDIUM: 2 * 60 * 1000,      // 2min — dados de referência
  LONG:   10 * 60 * 1000,     // 10min — dados quase estáticos
  STATIC: 60 * 60 * 1000,     // 1h — dados muito estáticos (feriados, etc.)
};
