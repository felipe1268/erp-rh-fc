/**
 * Rev. 2131 — Alerta global de documentos FCSign pendentes pra assinatura.
 *
 * Aparece em QUALQUER tela do ERP assim que o user loga, caso exista algum
 * documento onde ele é signer pendente E está na vez dele assinar (respeita
 * a ordem sequencial da Rev. 2119). Match feito por email OU por PAPEL
 * (admin_master/admin → role='empregador' das empresas autorizadas — ver
 * Rev. 2128).
 *
 * UX (Rev. 2131):
 *  - **Popup MODAL bloqueante** (Dialog) com a lista de docs pendentes e
 *    botão "Assinar agora" por item. Abre SEMPRE que houver pendência E
 *    a tela trocar (cada navegação reabre o modal pra não deixar passar).
 *  - Após "Lembrar mais tarde" o modal fecha mas reabre na PRÓXIMA tela.
 *  - Toast sonner persistente complementa o modal (caso user feche e
 *    fique na mesma tela).
 *  - Refetch a cada 60s + on window focus.
 *  - Dispense automático quando assina em outra aba/dispositivo.
 *
 * Rev. 2130: gate `enabled` relaxado p/ admin_master/admin sem email.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { FileSignature, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function FCSignPendingAlertGlobal() {
  const { user, isAuthenticated } = useAuth();
  const toastIdsRef = useRef<Map<number, string | number>>(new Map());
  const [location] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  // Tela em que o user fechou o modal pela última vez — pra reabrir só
  // quando NAVEGA pra outra rota (não a cada refetch de 60s na mesma tela).
  const dismissedAtLocationRef = useRef<string | null>(null);

  const isAdminLike = user?.role === "admin_master" || user?.role === "admin";
  const { data } = trpc.signatures.pendingForCurrentUser.useQuery(undefined, {
    enabled: isAuthenticated && (!!user?.email || isAdminLike),
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
      setModalOpen(false);
      dismissedAtLocationRef.current = null;
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

  // Rev. 2131 — reabre o modal a cada NAVEGAÇÃO se ainda houver pendência.
  useEffect(() => {
    if (!data || data.length === 0) {
      setModalOpen(false);
      return;
    }
    // Se o user fechou o modal e ainda está na MESMA rota, não reabre.
    if (dismissedAtLocationRef.current === location) return;
    setModalOpen(true);
  }, [data, location]);

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

  const handleDismiss = () => {
    dismissedAtLocationRef.current = location;
    setModalOpen(false);
  };

  const handleSignNow = (token: string) => {
    const url = `${window.location.origin}/assinar/${token}`;
    window.open(url, "_blank", "noopener");
  };

  const pending = data ?? [];

  return (
    <Dialog open={modalOpen && pending.length > 0} onOpenChange={(open) => {
      if (!open) handleDismiss();
    }}>
      <DialogContent className="sm:max-w-lg border-blue-300">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-blue-100 p-2">
              <FileSignature className="h-5 w-5 text-blue-700" />
            </div>
            <DialogTitle className="text-blue-900">
              {pending.length === 1
                ? "Documento aguardando sua assinatura"
                : `${pending.length} documentos aguardando sua assinatura`}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Sua ação é necessária para concluir {pending.length === 1 ? "este documento" : "estes documentos"}.
            Clique em <strong>Assinar agora</strong> para abrir em uma nova aba.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {pending.map((item) => (
            <div
              key={item.signerId}
              className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3"
            >
              <FileSignature className="h-5 w-5 text-blue-700 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-900 truncate" title={item.documentTitle}>
                  {item.documentTitle}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {item.ordem ? `${item.ordem}ª assinatura` : "Sua vez de assinar"}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleSignNow(item.token)}
                className="bg-blue-700 hover:bg-blue-800 text-white shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Assinar agora
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <span className="text-[11px] text-muted-foreground self-center">
            O alerta volta a aparecer ao trocar de tela enquanto houver pendência.
          </span>
          <Button variant="outline" onClick={handleDismiss}>
            Lembrar mais tarde
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
