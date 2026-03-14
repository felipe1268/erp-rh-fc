// IMPORTANTE: Patch do DOM deve ser aplicado ANTES de qualquer coisa
import { patchDomForReact } from "@/lib/dom-patch";
patchDomForReact();

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
      staleTime: 30 * 1000,        // 30s — avoids refetch on every navigation
      gcTime: 5 * 60 * 1000,       // 5min cache retention
      retry: (failureCount, error) => {
        if (error instanceof TRPCClientError) {
          const code = error.data?.code;
          if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'NOT_FOUND') return false;
        }
        return failureCount < 2;
      },
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: false,  // prevent refetch when switching tabs
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

  // Redirecionar para a tela de login interna, não para o Manus OAuth
  // Não redirecionar se já estiver na página de login (evita loop de erros)
  if (window.location.pathname === "/login") return;
  window.location.href = "/login";
};

// Verificar se o erro de auth deve ser silenciado (quando já está em /login)
const isAuthErrorOnLoginPage = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return false;
  if (typeof window === "undefined") return false;
  return error.message === UNAUTHED_ERR_MSG && window.location.pathname === "/login";
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
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
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
