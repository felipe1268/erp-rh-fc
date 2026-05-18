import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Palmtree, Play, X, Loader2, PenLine, Undo2,
  Calendar, CalendarDays, Briefcase, AlertTriangle,
  CheckCircle2, ArrowRight,
} from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = String(d).slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d as string;
}

type Stage = "confirm" | "naoOptions";

export default function FeriasGozoPrompt() {
  const [, setLocation] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId || 0;
  const companyIds = getCompanyIdsForQuery();

  const [promptItem, setPromptItem] = useState<any>(null);
  const [stage, setStage] = useState<Stage>("confirm");

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
      setStage("confirm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, promptItem]);

  const fechar = (markSkipped: boolean) => {
    if (markSkipped && promptItem) {
      addSkipped(`${promptItem.id}:${String(promptItem.dataInicio).slice(0, 10)}`);
    }
    setPromptItem(null);
    setStage("confirm");
  };

  const updateFerias = trpc.avisoPrevio.ferias.update.useMutation({
    onSuccess: () => {
      toast.success("Férias atualizadas!");
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
        {stage === "confirm" ? (
          <>
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
                  <h2 className="text-lg font-bold leading-tight">Início de Férias</h2>
                  <p className="text-xs text-white/90 mt-0.5">
                    {atrasoDias === 0
                      ? "Férias agendadas para hoje — confirme o início do gozo"
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

              <p className="text-sm text-slate-700 leading-relaxed">
                Deseja confirmar o <span className="font-semibold text-slate-900">início do gozo de férias</span> deste colaborador?
              </p>
            </div>

            {/* Footer pill */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50/40 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setStage("naoOptions")}
                disabled={updateFerias.isPending}
              >
                Não, agora não
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
                  : <Play className="h-4 w-4 mr-2" />}
                Sim, iniciar gozo
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="relative bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 px-6 py-5 text-white">
              <button
                onClick={() => fechar(true)}
                className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/15 hover:text-white transition"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white/15 p-2.5 ring-4 ring-white/20">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold leading-tight">O que deseja fazer?</h2>
                  <p className="text-xs text-white/90 mt-0.5">
                    Escolha uma ação para as férias de <span className="font-semibold">{promptItem.employeeName}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 bg-white space-y-2.5">
              <button
                onClick={() => {
                  if (!confirm(`Cancelar o agendamento de férias de ${promptItem.employeeName}?`)) return;
                  updateFerias.mutate({ id: promptItem.id, status: "cancelada" } as any);
                }}
                disabled={updateFerias.isPending}
                className="w-full text-left rounded-xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-red-50/40 p-4 hover:border-rose-300 hover:shadow-md transition group disabled:opacity-50"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-rose-100 p-2 group-hover:bg-rose-200 transition">
                    <Undo2 className="h-4 w-4 text-rose-700" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-rose-900 text-sm">Cancelar agendamento</div>
                    <div className="text-xs text-rose-700/80 mt-0.5">As férias voltam ao status pendente e podem ser reagendadas depois.</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-rose-400 group-hover:translate-x-0.5 transition" />
                </div>
              </button>

              <button
                onClick={() => {
                  fechar(true);
                  setLocation("/ferias");
                }}
                className="w-full text-left rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50/40 p-4 hover:border-blue-300 hover:shadow-md transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-100 p-2 group-hover:bg-blue-200 transition">
                    <PenLine className="h-4 w-4 text-blue-700" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-blue-900 text-sm">Reagendar data</div>
                    <div className="text-xs text-blue-700/80 mt-0.5">Abre a tela de Férias para escolher uma nova data de início.</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-blue-400 group-hover:translate-x-0.5 transition" />
                </div>
              </button>

              <button
                onClick={() => fechar(true)}
                className="w-full text-left rounded-xl border-2 border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2 group-hover:bg-slate-200 transition">
                    <CheckCircle2 className="h-4 w-4 text-slate-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900 text-sm">Agora não</div>
                    <div className="text-xs text-slate-600 mt-0.5">Lembrar novamente na próxima sessão.</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition" />
                </div>
              </button>
            </div>

            <div className="px-6 py-3 bg-gradient-to-r from-slate-50 to-slate-100/40 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setStage("confirm")}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition"
              >
                ← Voltar
              </button>
              <span className="text-[11px] text-slate-500">{periodo} · {dias} dias</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
