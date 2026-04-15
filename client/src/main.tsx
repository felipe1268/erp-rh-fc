// IMPORTANTE: Patch do DOM deve ser aplicado ANTES de qualquer coisa
import { patchDomForReact } from "@/lib/dom-patch";
patchDomForReact();

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason || "");
  if (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Loading chunk")
  ) {
    event.preventDefault();
    const key = "__erp_chunk_reload";
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - Number(last) > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  }
});

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
      retry: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  const path = window.location.pathname;
  const publicPaths = ["/login", "/portal/cotacao/", "/portal/servico/", "/pesquisa-publica/", "/verificar/", "/integrasign/assinar/"];
  if (publicPaths.some(p => path.startsWith(p) || path === p)) return;
  window.location.href = "/login";
};

const isAuthErrorOnLoginPage = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return false;
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  const publicPaths = ["/login", "/portal/cotacao/", "/portal/servico/", "/pesquisa-publica/", "/verificar/", "/integrasign/assinar/"];
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
