import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Building2, DollarSign, Users, AlertTriangle, Ban, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { BILLING_MODULES } from "../../../shared/billingModules";

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-emerald-100 text-emerald-700" },
  trialing: { label: "Em teste", className: "bg-blue-100 text-blue-700" },
  past_due: { label: "Pagamento atrasado", className: "bg-amber-100 text-amber-700" },
  canceled: { label: "Cancelada", className: "bg-gray-200 text-gray-600" },
  incomplete: { label: "Incompleta", className: "bg-gray-200 text-gray-600" },
  incomplete_expired: { label: "Expirada", className: "bg-gray-200 text-gray-600" },
  unpaid: { label: "Não paga", className: "bg-red-100 text-red-700" },
};

export default function SaasAdminPanel() {
  const utils = trpc.useUtils();
  const { data: summary } = trpc.saasAdmin.getSummary.useQuery();
  const { data: companiesList, isLoading } = trpc.saasAdmin.listCompanies.useQuery();

  const [confirmAction, setConfirmAction] = useState<
    | { type: "suspend" | "reactivate"; companyId: number; razaoSocial: string }
    | { type: "cancel"; subscriptionId: number; razaoSocial: string }
    | null
  >(null);

  const invalidate = () => {
    utils.saasAdmin.listCompanies.invalidate();
    utils.saasAdmin.getSummary.invalidate();
  };

  const suspendMut = trpc.saasAdmin.suspendCompany.useMutation({
    onSuccess: () => { toast.success("Empresa suspensa."); invalidate(); setConfirmAction(null); },
    onError: (e) => toast.error(e.message),
  });
  const reactivateMut = trpc.saasAdmin.reactivateCompany.useMutation({
    onSuccess: () => { toast.success("Empresa reativada."); invalidate(); setConfirmAction(null); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.saasAdmin.cancelSubscription.useMutation({
    onSuccess: () => { toast.success("Cancelamento agendado para o fim do período vigente."); invalidate(); setConfirmAction(null); },
    onError: (e) => toast.error(e.message),
  });

  const isBusy = suspendMut.isPending || reactivateMut.isPending || cancelMut.isPending;

  const moduleLabel = (id: string) => BILLING_MODULES.find(m => m.id === id)?.label || id;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-orange-500" /> Painel SaaS — Empresas-cliente
        </h1>
        <p className="text-sm text-gray-500 mt-1">Assinaturas, MRR e ciclo de vida das empresas contratantes.</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">Empresas</p>
            <p className="text-xl font-bold text-gray-800">{summary.totalCompanies}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Ativas</p>
            <p className="text-xl font-bold text-emerald-600">{summary.activeCount}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">Em teste</p>
            <p className="text-xl font-bold text-blue-600">{summary.trialingCount}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Pagto atrasado</p>
            <p className="text-xl font-bold text-amber-600">{summary.pastDueCount}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-orange-500" /> MRR</p>
            <p className="text-xl font-bold text-orange-600">{formatCentsBRL(summary.mrrCents)}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : !companiesList || companiesList.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Nenhuma empresa contratante ainda.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead className="text-center"><Users className="w-4 h-4 inline" /> Assentos</TableHead>
                <TableHead>MRR</TableHead>
                <TableHead>Trial até</TableHead>
                <TableHead>Período atual até</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companiesList.map((c) => {
                const statusInfo = STATUS_LABEL[c.status] || { label: c.status, className: "bg-gray-100 text-gray-600" };
                return (
                  <TableRow key={c.subscriptionId}>
                    <TableCell>
                      <p className="font-medium text-gray-800">{c.razaoSocial}</p>
                      <p className="text-xs text-gray-400">{c.cnpj}</p>
                      {c.companyIsActive === false && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-red-600 mt-0.5"><Ban className="w-3 h-3" /> Empresa suspensa</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.className}`}>{statusInfo.label}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {c.moduleIds.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : c.moduleIds.map(id => (
                          <span key={id} className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{moduleLabel(id)}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{c.seats}</TableCell>
                    <TableCell className="font-medium text-gray-700">{formatCentsBRL(c.mrrCents)}</TableCell>
                    <TableCell className="text-xs text-gray-500">{formatDate(c.trialEnd)}</TableCell>
                    <TableCell className="text-xs text-gray-500">{formatDate(c.currentPeriodEnd)}</TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {c.companyIsActive ? (
                        <Button
                          size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50"
                          disabled={isBusy}
                          onClick={() => setConfirmAction({ type: "suspend", companyId: Number(c.companyId), razaoSocial: c.razaoSocial })}
                        >
                          <Ban className="w-3.5 h-3.5 mr-1" /> Suspender
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                          disabled={isBusy}
                          onClick={() => setConfirmAction({ type: "reactivate", companyId: Number(c.companyId), razaoSocial: c.razaoSocial })}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Reativar
                        </Button>
                      )}
                      {c.status !== "canceled" && (
                        <Button
                          size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                          disabled={isBusy}
                          onClick={() => setConfirmAction({ type: "cancel", subscriptionId: Number(c.subscriptionId), razaoSocial: c.razaoSocial })}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "suspend" && "Suspender empresa?"}
              {confirmAction?.type === "reactivate" && "Reativar empresa?"}
              {confirmAction?.type === "cancel" && "Cancelar assinatura?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {confirmAction?.type === "suspend" && `Os usuários de "${confirmAction.razaoSocial}" (exceto admin/admin_master internos) perderão acesso ao sistema imediatamente. A cobrança no Stripe não é afetada — use "Cancelar" para isso.`}
              {confirmAction?.type === "reactivate" && `Os usuários de "${confirmAction.razaoSocial}" voltarão a acessar o sistema normalmente.`}
              {confirmAction?.type === "cancel" && `A assinatura de "${confirmAction.razaoSocial}" será cancelada no Stripe ao fim do período vigente já pago (não gera reembolso nem corta acesso antes disso).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "suspend") suspendMut.mutate({ companyId: confirmAction.companyId });
                else if (confirmAction.type === "reactivate") reactivateMut.mutate({ companyId: confirmAction.companyId });
                else cancelMut.mutate({ subscriptionId: confirmAction.subscriptionId });
              }}
            >
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
