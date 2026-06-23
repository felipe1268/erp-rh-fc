// IMPORTANTE: Patch do DOM deve ser aplicado ANTES de qualquer coisa
import { patchDomForReact } from "@/lib/dom-patch";
patchDomForReact();

// Captura erros do client e envia ao servidor pra logar (debug em iPad/mobile sem devtools)
let __reporterDepth = 0;
function reportClientError(kind: string, err: any, extra?: any) {
  if (__reporterDepth > 0) return;
  __reporterDepth++;
  try {
    const payload = {
      kind,
      message: err?.message ?? String(err ?? ""),
      stack: err?.stack ?? err?.cause?.stack ?? null,
      url: location.href,
      ua: navigator.userAgent,
      extra,
    };
    fetch("/api/diag/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
  finally { __reporterDepth--; }
}
(window as any).__reportClientError = reportClientError;

window.addEventListener("error", (event) => {
  reportClientError("error", event.error || event.message, { filename: event.filename, lineno: event.lineno, colno: event.colno });
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason || "");
  reportClientError("unhandledrejection", event.reason, { msg });
  if (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Loading chunk")
  ) {
    event.preventDefault();
    // sessionStorage pode lançar exceção no modo privado do iOS — sempre em try/catch
    try {
      const key = "__erp_chunk_reload";
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem(key, String(now));
        reloadCacheBusting(now);
      }
    } catch { /* modo privado iOS: ignora */ }
  }
});

// Reload "cache-busting": no iOS Safari, window.location.reload() pode reusar o
// index.html em cache (com referências de chunk ANTIGAS pós-deploy), o que faz o
// chunk-load falhar de novo dentro da janela de 10s → cai no ErrorBoundary. Um
// query param único força o navegador a buscar um index.html FRESCO (novos hashes).
function reloadCacheBusting(now: number) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("_cb", String(now));
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}
(window as any).__reloadCacheBusting = reloadCacheBusting;

// Limpa o param "_cb" da URL após a recuperação (mantém a URL limpa).
try {
  const u = new URL(window.location.href);
  if (u.searchParams.has("_cb")) {
    u.searchParams.delete("_cb");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  }
} catch { /* noop */ }

import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,    // 2min — dados ficam frescos sem refetch desnecessário
      gcTime: 10 * 60 * 1000,      // 10min de retenção no cache (navegação mais rápida)
      retry: (failureCount, error) => {
        if (error instanceof TRPCClientError) {
          const code = error.data?.code;
          if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'NOT_FOUND') return false;
        }
        return failureCount < 1;   // apenas 1 retry para falhar rápido
      },
      retryDelay: 1000,            // retry fixo em 1s
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
    },
    mutations: {
      // iOS WebView pode dropar requests com "The string did not match the expected pattern."
      // Permitir 1 retry automático para esse padrão específico.
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false;
        const msg = error instanceof Error ? error.message : String(error ?? "");
        return msg.includes("did not match the expected pattern") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
      },
      retryDelay: 800,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  const path = window.location.pathname;
  // Rev. 1601 — Inclui rotas do Portal do Cliente/Terceiros/Parceiros
  // como públicas: o portal externo tem auth próprio (JWT em localStorage,
  // não cookie de sessão) e nunca deve cair no /login do ERP.
  const publicPaths = ["/login", "/portal/", "/a/", "/assinar/", "/pesquisa-publica/", "/verificar/", "/integrasign/assinar/", "/integracao/", "/cipa/votar/"];
  if (publicPaths.some(p => path.startsWith(p) || path === p)) return;
  window.location.href = "/login";
};

const isAuthErrorOnLoginPage = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return false;
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  const publicPaths = ["/login", "/portal/", "/a/", "/assinar/", "/pesquisa-publica/", "/verificar/", "/integrasign/assinar/", "/integracao/", "/cipa/votar/"];
  return error.message === UNAUTHED_ERR_MSG && publicPaths.some(p => path.startsWith(p) || path === p);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    // Não logar nem redirecionar erros de auth na página de login
    if (isAuthErrorOnLoginPage(error)) return;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (isAuthErrorOnLoginPage(error)) return;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      maxURLLength: 2048,
      fetch(input, init) {
        const controller = new AbortController();
        // 5 minutos para suportar importações pesadas (orçamentos, planilhas grandes)
        const timeoutId = setTimeout(() => controller.abort(new DOMException("Tempo limite de 5 minutos excedido. Tente novamente.", "TimeoutError")), 300000);
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// PWA — Service Worker (Rev. 2895): registra SÓ em produção para não interferir
// no HMR do dev nem servir assets velhos durante o desenvolvimento.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] Falha ao registrar service worker:", err);
    });
  });
}
