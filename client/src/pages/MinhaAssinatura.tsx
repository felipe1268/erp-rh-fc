import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { CreditCard, Users, Loader2, PlusCircle, MinusCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-emerald-100 text-emerald-700" },
  trialing: { label: "Em período de teste", className: "bg-blue-100 text-blue-700" },
  past_due: { label: "Pagamento atrasado", className: "bg-amber-100 text-amber-700" },
  canceled: { label: "Cancelada", className: "bg-gray-200 text-gray-600" },
  incomplete: { label: "Incompleta", className: "bg-gray-200 text-gray-600" },
  unpaid: { label: "Não paga", className: "bg-red-100 text-red-700" },
};

export default function MinhaAssinatura() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.billing.getMySubscription.useQuery();

  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [seats, setSeats] = useState(1);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (data) {
      setSelectedModules(data.moduleIds);
      setSeats(data.seats);
    }
  }, [data]);

  const invalidate = () => utils.billing.getMySubscription.invalidate();

  const portalMut = trpc.billing.createPortalSession.useMutation({
    onSuccess: (r) => { window.location.href = r.portalUrl; },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.billing.updateSubscription.useMutation({
    onSuccess: () => { toast.success("Assinatura atualizada. Ajuste proporcional (pro-rata) já refletido na próxima fatura."); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.billing.cancelMySubscription.useMutation({
    onSuccess: () => { toast.success("Cancelamento agendado para o fim do período vigente."); invalidate(); setConfirmCancel(false); },
    onError: (e) => toast.error(e.message),
  });
  const reactivateMut = trpc.billing.reactivateMySubscription.useMutation({
    onSuccess: () => { toast.success("Assinatura reativada."); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (error || !data) {
    return <div className="p-8 text-center text-gray-500 text-sm">{error?.message || "Não foi possível carregar sua assinatura."}</div>;
  }

  const statusInfo = STATUS_LABEL[data.status] || { label: data.status, className: "bg-gray-100 text-gray-600" };
  const modulesTotal = selectedModules.reduce((acc, id) => {
    const mod = data.modules.find(m => m.id === id);
    return acc + (mod?.monthlyPriceCents || 0);
  }, 0);
  const estimatedTotal = modulesTotal + seats * data.seatMonthlyPriceCents;
  const hasChanges = JSON.stringify([...selectedModules].sort()) !== JSON.stringify([...data.moduleIds].sort()) || seats !== data.seats;
  const isBusy = updateMut.isPending || cancelMut.isPending || reactivateMut.isPending || portalMut.isPending;
  const isCanceling = !!data.canceledAt || data.status === "canceled";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-orange-500" /> Minha Assinatura
        </h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie os módulos contratados, assentos e forma de pagamento.</p>
      </div>

      <div className="rounded-xl border bg-white p-5 flex flex-wrap items-center gap-4">
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${statusInfo.className}`}>{statusInfo.label}</span>
        {data.status === "trialing" && <span className="text-sm text-gray-500">Teste até {formatDate(data.trialEnd)}</span>}
        {data.currentPeriodEnd && <span className="text-sm text-gray-500">Próxima cobrança em {formatDate(data.currentPeriodEnd)}</span>}
        {data.paymentFailedAt && (
          <span className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Última cobrança falhou — atualize a forma de pagamento.</span>
        )}
        <Button size="sm" variant="outline" onClick={() => portalMut.mutate()} disabled={isBusy} className="ml-auto">
          {portalMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar cartão / ver faturas"}
        </Button>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Módulos contratados</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {data.modules.map(m => (
            <label key={m.id} className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
              <Checkbox
                checked={selectedModules.includes(m.id)}
                onCheckedChange={(checked) => {
                  setSelectedModules(prev => checked ? [...prev, m.id] : prev.filter(id => id !== m.id));
                }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 break-words">{m.label}</p>
                <p className="text-xs text-gray-500 break-words">{m.description}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatCentsBRL(m.monthlyPriceCents)}/mês</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-4 h-4" /> Assentos (usuários)</h2>
        <div className="flex items-center gap-3">
          <Button size="icon" variant="outline" disabled={seats <= 1 || isBusy} onClick={() => setSeats(s => Math.max(1, s - 1))}>
            <MinusCircle className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold w-10 text-center">{seats}</span>
          <Button size="icon" variant="outline" disabled={isBusy} onClick={() => setSeats(s => Math.min(500, s + 1))}>
            <PlusCircle className="w-4 h-4" />
          </Button>
          <span className="text-xs text-gray-400">{formatCentsBRL(data.seatMonthlyPriceCents)}/assento/mês</span>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Total mensal estimado</p>
          <p className="text-2xl font-bold text-gray-800">{formatCentsBRL(estimatedTotal)}</p>
        </div>
        <Button
          disabled={!hasChanges || isBusy || isCanceling}
          onClick={() => updateMut.mutate({ moduleIds: selectedModules, seats })}
        >
          {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Salvar alterações
        </Button>
      </div>

      <div className="rounded-xl border bg-white p-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Cancelamento</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isCanceling
              ? "Sua assinatura está marcada para cancelar ao fim do período vigente — você pode reverter isso a qualquer momento antes do fim do período."
              : "O acesso continua até o fim do período já pago. Não há reembolso proporcional."}
          </p>
        </div>
        {isCanceling ? (
          <Button variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50" disabled={isBusy} onClick={() => reactivateMut.mutate()}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Reativar
          </Button>
        ) : (
          <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" disabled={isBusy} onClick={() => setConfirmCancel(true)}>
            Cancelar assinatura
          </Button>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar sua assinatura?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              O acesso ao sistema continua disponível até {formatDate(data.currentPeriodEnd)} (fim do período já pago). Após essa data, a empresa é suspensa automaticamente. Você pode reativar a qualquer momento antes disso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMut.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={cancelMut.isPending} onClick={() => cancelMut.mutate({ immediately: false })}>
              {cancelMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
