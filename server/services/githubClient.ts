/**
 * Cliente leve para a API do GitHub usando a integração (connector) do Replit.
 *
 * Integração: GitHub connector (Replit). O token de acesso é obtido em runtime
 * via endpoint de connectors (REPLIT_CONNECTORS_HOSTNAME + REPL_IDENTITY /
 * WEB_REPL_RENEWAL). Nunca cacheamos o token — ele expira e é renovado.
 *
 * Repositório alvo: env GITHUB_REPO (formato "owner/repo"), default felipe1268/erp-rh-fc.
 */

import { ReplitConnectors } from "@replit/connectors-sdk";

export const GITHUB_REPO = process.env.GITHUB_REPO || "felipe1268/erp-rh-fc";

export class GitHubNotConnectedError extends Error {
  constructor() {
    super("GitHub não está conectado neste ambiente (integração indisponível).");
    this.name = "GitHubNotConnectedError";
  }
}

/**
 * fetch autenticado contra a API do GitHub via proxy do connector Replit.
 * Rev. 4619 — migrado do endpoint legado /api/v2/connection (que passou a
 * devolver lista vazia) para o @replit/connectors-sdk, que cuida de identidade,
 * refresh e injeção do token automaticamente. NUNCA cachear cliente/token.
 */
export async function githubFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy("github", path, {
      method: (init?.method as string) || "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
      body: init?.body as any,
    });
    // 401/403 sem rate-limit = credencial indisponível/expirada → "não conectado"
    if (res.status === 401 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") !== "0")) {
      throw new GitHubNotConnectedError();
    }
    return res as unknown as Response;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/not.?connected|no connection|unauthorized|401|credential/i.test(msg)) {
      throw new GitHubNotConnectedError();
    }
    throw e;
  }
}
