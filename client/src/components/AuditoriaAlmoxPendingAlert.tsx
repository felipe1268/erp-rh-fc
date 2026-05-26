/**
 * Rev. 2450 — Banner global de pendências de Auditoria do Almoxarifado.
 *
 * Aparece em QUALQUER tela do ERP quando o user atual é validador
 * legítimo (admin/admin_master OU aprovador via `obra_responsaveis_estoque`)
 * de ≥1 auditoria pendente. Não bloqueia o uso — é uma barra discreta
 * no topo do conteúdo, com CTA "Revisar agora" que leva a
 * /almoxarifado/auditoria.
 *
 * UX:
 * - Sticky no topo da viewport (z-40, abaixo de modais).
 * - Dispensável por sessão (sessionStorage) — reaparece se nova
 *   pendência surgir (count muda) ou se trocar de sessão.
 * - Refetch a cada 90s e on window focus.
 * - Esconde quando total === 0.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldAlert, X, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const DISMISS_KEY = "fc:auditoriaAlmox:dismissedAtCount";

export function AuditoriaAlmoxPendingAlert() {
  const { isAuthenticated } = useAuth();
  const [location, navegar] = useLocation();
  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return raw ? Number(raw) || null : null;
  });

  const { data } = trpc.auditoriaAlmoxarifado.minhasPendencias.useQuery(
    {},
    {
      enabled: isAuthenticated,
      refetchInterval: 90_000,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
    },
  );

  // Reseta dismiss se o count aumentou (nova pendência apareceu).
  useEffect(() => {
    if (!data) return;
    if (dismissedAtCount !== null && data.total > dismissedAtCount) {
      setDismissedAtCount(null);
      sessionStorage.removeItem(DISMISS_KEY);
    }
  }, [data, dismissedAtCount]);

  if (!isAuthenticated) return null;
  if (!data || data.total === 0) return null;
  // Não exibe na própria tela de auditoria (já está lá).
  if (location.startsWith("/almoxarifado/auditoria")) return null;
  if (dismissedAtCount !== null && data.total <= dismissedAtCount) return null;

  function dismiss() {
    if (!data) return;
    sessionStorage.setItem(DISMISS_KEY, String(data.total));
    setDismissedAtCount(data.total);
  }

  const primeiroResumo = data.itens[0];

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 flex items-center gap-3">
        <div className="flex-shrink-0 bg-white/20 rounded-lg p-1.5">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm sm:text-base leading-tight">
            {data.total === 1
              ? "1 operação do Almoxarifado aguarda sua validação"
              : `${data.total} operações do Almoxarifado aguardam sua validação`}
          </div>
          {primeiroResumo && (
            <div className="text-[12px] text-amber-50 truncate">
              Última: <b>{primeiroResumo.userNome || "alguém"}</b>
              {primeiroResumo.entidadeNome ? <> · {primeiroResumo.entidadeNome}</> : null}
              {primeiroResumo.obraNome ? <> · {primeiroResumo.obraNome}</> : null}
            </div>
          )}
        </div>
        <button
          onClick={() => navegar("/almoxarifado/auditoria")}
          className="flex-shrink-0 inline-flex items-center gap-1 bg-white text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg font-bold text-sm shadow-sm">
          Revisar agora <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={dismiss}
          aria-label="Dispensar até nova pendência"
          className="flex-shrink-0 bg-white/15 hover:bg-white/25 rounded-full p-1.5">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
