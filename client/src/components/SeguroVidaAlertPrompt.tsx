/**
 * Rev. 4927 — Pop-up "regra de ouro": nenhum colaborador CLT pode trabalhar
 * sem Seguro de Vida ativo. Aparece ao entrar em qualquer tela do módulo RH
 * quando existir ao menos 1 CLT ativo sem cobertura (1x por sessão por
 * dia/empresa, padrão do AlertasDiaPrompt).
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldAlert, ExternalLink, X } from "lucide-react";

export default function SeguroVidaAlertPrompt() {
  const [, setLocation] = useLocation();
  const { selectedCompanyId, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery().map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const [open, setOpen] = useState(false);

  const q = trpc.notifications.pendingRequestCounts.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0, staleTime: 30_000 }
  );
  const count = Number((q.data as any)?.semSeguroCount || 0);

  const { user } = useAuth();
  const hoje = new Date().toISOString().slice(0, 10);
  // Rev. 4977 — chave POR USUÁRIO: cada usuário de RH/master resolve o seu
  const storageKey = `seguro-vida-alert:${user?.id ?? "anon"}:${companyId}:${hoje}`;

  useEffect(() => {
    if (count > 0 && !sessionStorage.getItem(storageKey)) {
      setOpen(true);
    }
  }, [count, storageKey]);

  const dismiss = () => {
    sessionStorage.setItem(storageKey, "1");
    setOpen(false);
  };

  if (count <= 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      {/* Rev. 4977 — z-[80] acima do alerta de locações; só fecha nos botões */}
      <DialogContent className="max-w-md p-0 overflow-hidden [&>button]:hidden z-[80]"
        onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-5 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-bold text-base leading-tight">Colaborador sem Seguro de Vida!</p>
            <p className="text-red-100 text-xs mt-0.5">Regra de ouro — ninguém trabalha sem seguro ativo</p>
          </div>
          <button onClick={dismiss} className="text-white/70 hover:text-white shrink-0" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-700 break-words">
            {count === 1
              ? <>Existe <b className="text-red-700">1 colaborador CLT ativo</b> sem cobertura de seguro de vida.</>
              : <>Existem <b className="text-red-700">{count} colaboradores CLT ativos</b> sem cobertura de seguro de vida.</>}
            {" "}Pela convenção coletiva, todo funcionário deve ter seguro vigente desde o primeiro dia de trabalho.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={dismiss}>Depois</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { dismiss(); setLocation("/seguro-vida"); }}>
              <ExternalLink className="h-4 w-4 mr-1.5" /> Ver Seguro de Vida
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
