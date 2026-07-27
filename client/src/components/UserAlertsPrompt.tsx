/**
 * Rev. 4690 — Pop-up de alertas pessoais do usuário logado (ex.: "seu
 * apontamento de campo foi reprovado", "sua solicitação de HE foi rejeitada").
 * Busca alertas não lidos periodicamente; "Ciente" marca como lido.
 * Montado globalmente no DashboardLayout (todos os módulos).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function UserAlertsPrompt() {
  const [, setLocation] = useLocation();
  const [fechados, setFechados] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  const alertasQ = trpc.notifications.meusAlertas.useQuery(undefined, {
    refetchInterval: 120_000, // 2 min
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
  const marcarLidos = trpc.notifications.marcarAlertasLidos.useMutation({
    onSettled: () => utils.notifications.meusAlertas.invalidate(),
  });

  const alertas = (alertasQ.data ?? []).filter((a: any) => !fechados.has(a.id));
  if (alertas.length === 0) return null;

  const ids = alertas.map((a: any) => a.id);
  const fechar = () => setFechados(prev => new Set([...Array.from(prev), ...ids]));
  const ciente = () => { marcarLidos.mutate({ ids }); fechar(); };
  const linkUrl = alertas.find((a: any) => a.linkUrl)?.linkUrl as string | undefined;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            {alertas.length === 1 ? "Você tem um alerta" : `Você tem ${alertas.length} alertas`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {alertas.map((a: any) => (
            <div key={a.id} className="rounded-lg border border-red-200 bg-red-50/60 p-3">
              <p className="text-sm font-semibold text-red-800 break-words">{a.titulo}</p>
              <p className="text-sm text-slate-700 mt-1 break-words whitespace-pre-wrap">{a.mensagem}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {a.createdAt ? new Date(String(a.createdAt).replace(" ", "T")).toLocaleString("pt-BR") : ""}
              </p>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          {linkUrl && (
            <Button variant="outline" disabled={marcarLidos.isPending}
              onClick={() => { marcarLidos.mutate({ ids }); fechar(); setLocation(linkUrl); }}>
              Ver registro
            </Button>
          )}
          <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={marcarLidos.isPending} onClick={ciente}>
            {marcarLidos.isPending ? "Salvando..." : "Ciente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
