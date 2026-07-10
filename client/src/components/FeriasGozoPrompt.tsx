import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Palmtree, X, Loader2, PenLine, Undo2,
  Calendar, CalendarDays, Briefcase, AlertTriangle,
  CheckCircle2,
} from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = String(d).slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d as string;
}

export default function FeriasGozoPrompt() {
  const [, setLocation] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId || 0;
  const companyIds = getCompanyIdsForQuery();

  const [promptItem, setPromptItem] = useState<any>(null);

  const enabled = isConstrutoras ? companyIds.length > 0 : companyId > 0;
  const { data: allFerias = [], refetch } = trpc.avisoPrevio.ferias.list.useQuery(
    { companyId, ...(isConstrutoras ? { companyIds } : {}) } as any,
    { enabled, refetchOnWindowFocus: false },
  );

  const skipKey = `feriasGozoSkip:${companyId}`;
  const getSkipped = (): Set<string> => {
    try {
      const raw = sessionStorage.getItem(skipKey);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  };
  const addSkipped = (key: string) => {
    try {
      const s = getSkipped(); s.add(key);
      sessionStorage.setItem(skipKey, JSON.stringify(Array.from(s)));
    } catch { /* noop */ }
  };

  const candidatos = useMemo(() => {
    const hojeStr = new Date().toISOString().slice(0, 10);
    return (allFerias as any[]).filter((f: any) => {
      if (!f || f.status !== "agendada" || !f.dataInicio) return false;
      return String(f.dataInicio).slice(0, 10) <= hojeStr;
    });
  }, [allFerias]);

  useEffect(() => {
    if (promptItem) return;
    const skipped = getSkipped();
    const next = candidatos.find((f) => {
      const k = `${f.id}:${String(f.dataInicio).slice(0, 10)}`;
      return !skipped.has(k);
    });
    if (next) {
      setPromptItem(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, promptItem]);

  const fechar = (markSkipped: boolean) => {
    if (markSkipped && promptItem) {
      addSkipped(`${promptItem.id}:${String(promptItem.dataInicio).slice(0, 10)}`);
    }
    setPromptItem(null);
  };

  const updateFerias = trpc.avisoPrevio.ferias.update.useMutation({
    onSuccess: (_data, variables: any) => {
      if (variables?.status === "cancelada") {
        toast.success("Agendamento cancelado.");
      } else {
        toast.success("Gozo de férias iniciado!");
      }
      refetch();
      fechar(false);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar"),
  });

  if (!promptItem) return null;

  const totalPendentes = candidatos.length;
  const periodo = `${formatDate(promptItem.dataInicio)} a ${formatDate(promptItem.dataFim)}`;
  const dias = promptItem.diasGozo || 30;
  const cargo = promptItem.employeeCargo || promptItem.cargo || null;
  const hojeISO = new Date().toISOString().slice(0, 10);
  const atrasoDias = (() => {
    try {
      const di = new Date(String(promptItem.dataInicio).slice(0, 10));
      const hj = new Date(hojeISO);
      return Math.max(0, Math.round((hj.getTime() - di.getTime()) / 86_400_000));
    } catch { return 0; }
  })();

  return (
    <Dialog open={!!promptItem} onOpenChange={(o) => { if (!o) fechar(true); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border-0 shadow-2xl">
        {/* Header gradient — regra de ouro */}
        <div className="relative bg-gradient-to-br from-blue-600 via-sky-600 to-cyan-600 px-6 py-5 text-white">
          <button
            onClick={() => fechar(true)}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/15 p-2.5 ring-4 ring-white/20">
              <Palmtree className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold leading-tight">LEMBRETE DE GOZO DE FÉRIAS</h2>
              <p className="text-xs text-white/90 mt-0.5">
                {atrasoDias === 0
                  ? "Férias agendadas para hoje"
                  : `Férias agendadas há ${atrasoDias} dia${atrasoDias > 1 ? "s" : ""} — confirmação pendente`}
              </p>
            </div>
          </div>
          {totalPendentes > 1 && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium ring-1 ring-white/20">
              <AlertTriangle className="h-3 w-3" />
              {totalPendentes} colaboradores aguardando confirmação
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 bg-white">
          <p className="text-sm text-slate-800 leading-relaxed">
            O colaborador{" "}
            <span className="font-bold text-blue-900 break-words">
              {promptItem.employeeName || promptItem.nomeCompleto || "—"}
            </span>{" "}
            está com férias agendada{atrasoDias === 0 ? " para hoje" : ""}!!
          </p>

          <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50/40 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700/80 mb-1">
              Colaborador
            </div>
            <div className="text-base font-bold text-blue-900 break-words leading-tight">
              {promptItem.employeeName || promptItem.nomeCompleto || "—"}
            </div>
            {cargo && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-800/80">
                <Briefcase className="h-3.5 w-3.5" />
                <span>{cargo}</span>
              </div>
            )}
          </div>

          {/* KPI bar de 2 cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Calendar className="h-3 w-3" />
                Período
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900 tabular-nums leading-tight">
                {formatDate(promptItem.dataInicio)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                até {formatDate(promptItem.dataFim)}
              </div>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80">
                <CalendarDays className="h-3 w-3" />
                Duração
              </div>
              <div className="mt-1 text-sm font-bold text-emerald-900 tabular-nums leading-tight">
                {dias} dias
              </div>
              <div className="text-[11px] text-emerald-700/80">de gozo</div>
            </div>
          </div>
        </div>

        {/* Footer — 3 botões: Confirmar, Reagendar, Cancelar */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50/40 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <Button
            variant="outline"
            className="h-10 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            disabled={updateFerias.isPending}
            onClick={() => {
              if (!confirm(`Cancelar o agendamento de férias de ${promptItem.employeeName}?`)) return;
              updateFerias.mutate({ id: promptItem.id, status: "cancelada" } as any);
            }}
          >
            <Undo2 className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="h-10 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
            disabled={updateFerias.isPending}
            onClick={() => {
              fechar(true);
              setLocation("/ferias");
            }}
          >
            <PenLine className="h-4 w-4 mr-1.5" />
            Reagendar
          </Button>
          <Button
            className="h-10 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md font-semibold"
            disabled={updateFerias.isPending}
            onClick={() => {
              updateFerias.mutate({ id: promptItem.id, status: "em_gozo" } as any);
            }}
          >
            {updateFerias.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
