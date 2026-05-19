/**
 * Rev. 2121 — Alerta global de documentos FCSign pendentes pra assinatura.
 *
 * Aparece em QUALQUER tela do ERP assim que o user loga, caso exista algum
 * documento onde ele é signer pendente E está na vez dele assinar (respeita
 * a ordem sequencial da Rev. 2119). Match feito por email (case-insensitive).
 *
 * UX:
 *  - Toast persistente (sonner) por SIGNER pendente, com botão "Assinar
 *    agora" que abre `/assinar/:token` em nova aba.
 *  - Dedupe por `signerId` (não `sessionId`) — cobre o caso de o mesmo email
 *    ter mais de um papel na mesma sessão.
 *  - Quando uma pendência some da lista (assinou em outra aba/dispositivo),
 *    o toast correspondente é dispensado automaticamente — evita "aviso
 *    fantasma".
 *  - Refetch a cada 60s + on window focus.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { FileSignature } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export function FCSignPendingAlertGlobal() {
  const { user, isAuthenticated } = useAuth();
  const toastIdsRef = useRef<Map<number, string | number>>(new Map());

  const { data } = trpc.signatures.pendingForCurrentUser.useQuery(undefined, {
    enabled: isAuthenticated && !!user?.email,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // HOTFIX (code review): força dismiss de todos os toasts ao deslogar/unmount
  // pra evitar que um token bearer de assinatura fique pendurado na UI após
  // troca de usuário em máquina compartilhada.
  useEffect(() => {
    if (!isAuthenticated) {
      for (const [signerId, toastId] of Array.from(toastIdsRef.current.entries())) {
        toast.dismiss(toastId);
        toastIdsRef.current.delete(signerId);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      for (const toastId of Array.from(toastIdsRef.current.values())) {
        toast.dismiss(toastId);
      }
      toastIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const currentIds = new Set(data.map((d) => d.signerId));

    // Dispensa toasts cujos signers não estão mais pendentes (assinou em outra
    // aba, sessão cancelada, etc).
    for (const [signerId, toastId] of Array.from(toastIdsRef.current.entries())) {
      if (!currentIds.has(signerId)) {
        toast.dismiss(toastId);
        toastIdsRef.current.delete(signerId);
      }
    }

    // Mostra um toast por NOVO signer pendente (não re-dispara os já visíveis).
    for (const item of data) {
      if (toastIdsRef.current.has(item.signerId)) continue;
      const url = `${window.location.origin}/assinar/${item.token}`;
      const id = toast(
        `📝 Documento aguardando sua assinatura`,
        {
          description: item.documentTitle,
          duration: Infinity,
          icon: <FileSignature className="h-5 w-5 text-blue-700" />,
          action: {
            label: "Assinar agora",
            onClick: () => window.open(url, "_blank", "noopener"),
          },
          className: "border-blue-300 bg-blue-50",
        }
      );
      toastIdsRef.current.set(item.signerId, id);
    }
  }, [data]);

  return null;
}
