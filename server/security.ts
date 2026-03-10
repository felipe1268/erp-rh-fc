/**
 * Middlewares de segurança para o ERP.
 * 
 * - Rate Limiting: protege contra brute force e abuso de API
 * - Security Headers: protege contra XSS, clickjacking, MIME sniffing
 */

import type { Request, Response, NextFunction } from "express";

// ============================================================
// RATE LIMITING (em memória, sem dependência externa)
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpar entradas expiradas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limiter configurável por rota.
 * @param maxRequests - Máximo de requests por janela
 * @param windowMs - Janela de tempo em milissegundos
 */
export function rateLimit(maxRequests: number = 100, windowMs: number = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Usar IP + path como chave
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    // Headers informativos
    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count).toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: "Muitas requisições. Tente novamente em alguns segundos.",
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// ============================================================
// SECURITY HEADERS
// ============================================================

/**
 * Adiciona headers de segurança HTTP em todas as respostas.
 * Equivalente a um helmet.js simplificado e customizado.
 */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Prevenir clickjacking (iframe embedding)
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    // Prevenir MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // XSS Protection (legacy browsers)
    res.setHeader("X-XSS-Protection", "1; mode=block");

    // Referrer Policy — não vazar URLs internas
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions Policy — desabilitar features desnecessárias
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()"
    );

    // Strict Transport Security (HSTS) — forçar HTTPS
    // max-age=1 ano, incluir subdomínios
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );

    next();
  };
}

// ============================================================
// API RATE LIMITS PRÉ-CONFIGURADOS
// ============================================================

/** Rate limit padrão para API: 200 req/min por IP+path */
export const apiRateLimit = rateLimit(200, 60 * 1000);

/** Rate limit para autenticação: 20 req/min (mais restritivo) */
export const authRateLimit = rateLimit(20, 60 * 1000);

/** Rate limit para uploads: 30 req/min */
export const uploadRateLimit = rateLimit(30, 60 * 1000);
