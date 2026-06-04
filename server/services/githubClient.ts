/**
 * Cliente leve para a API do GitHub usando a integração (connector) do Replit.
 *
 * Integração: GitHub connector (Replit). O token de acesso é obtido em runtime
 * via endpoint de connectors (REPLIT_CONNECTORS_HOSTNAME + REPL_IDENTITY /
 * WEB_REPL_RENEWAL). Nunca cacheamos o token — ele expira e é renovado.
 *
 * Repositório alvo: env GITHUB_REPO (formato "owner/repo"), default felipe1268/erp-rh-fc.
 */

export const GITHUB_REPO = process.env.GITHUB_REPO || "felipe1268/erp-rh-fc";

let cachedHostname: string | undefined;

function getXReplitToken(): string | null {
  if (process.env.REPL_IDENTITY) return "repl " + process.env.REPL_IDENTITY;
  if (process.env.WEB_REPL_RENEWAL) return "depl " + process.env.WEB_REPL_RENEWAL;
  return null;
}

/** Obtém o access_token do GitHub via connector. Retorna null se indisponível. */
export async function getGithubToken(): Promise<string | null> {
  const hostname = cachedHostname ?? process.env.REPLIT_CONNECTORS_HOSTNAME;
  cachedHostname = hostname;
  if (!hostname) return null;
  const xReplitToken = getXReplitToken();
  if (!xReplitToken) return null;

  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=github`,
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const conn = (data.items || [])[0];
    const s = conn?.settings || {};
    return s.access_token || s.oauth?.credentials?.access_token || null;
  } catch {
    return null;
  }
}

export class GitHubNotConnectedError extends Error {
  constructor() {
    super("GitHub não está conectado neste ambiente (integração indisponível).");
    this.name = "GitHubNotConnectedError";
  }
}

/** fetch autenticado contra api.github.com. Lança GitHubNotConnectedError se sem token. */
export async function githubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGithubToken();
  if (!token) throw new GitHubNotConnectedError();
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "erp-fc-sync",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
  });
}
