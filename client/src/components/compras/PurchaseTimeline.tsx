import { trpc } from "@/lib/trpc";
import { Loader2, FileText, Search, CheckCircle, ShoppingCart, Package, CreditCard, Clock, AlertTriangle, CircleDot, type LucideIcon } from "lucide-react";
import { useState } from "react";

interface TimelineStep {
  key: string;
  label: string;
  status: "concluida" | "atual" | "pendente" | "atrasada";
  data?: string | null;
  tempoDesdeAnterior?: number | null;
  detalhe?: string | null;
}

const STEP_ICONS: Record<string, LucideIcon> = {
  sc_criada: FileText,
  sc_aprovada: CheckCircle,
  cotacao_aberta: Search,
  cotacao_aprovada: CheckCircle,
  oc_emitida: ShoppingCart,
  contrato_gerado: FileText,
  entrega_prevista: Clock,
  material_recebido: Package,
  pagamento: CreditCard,
};

const STATUS_STYLES: Record<string, { dot: string; line: string; text: string; bg: string }> = {
  concluida: { dot: "bg-emerald-500 ring-emerald-100", line: "bg-emerald-300", text: "text-emerald-700", bg: "bg-emerald-50" },
  atual: { dot: "bg-blue-500 ring-blue-100 animate-pulse", line: "bg-gray-200", text: "text-blue-700", bg: "bg-blue-50" },
  pendente: { dot: "bg-gray-300 ring-gray-100", line: "bg-gray-200", text: "text-gray-400", bg: "bg-gray-50" },
  atrasada: { dot: "bg-red-500 ring-red-100", line: "bg-red-300", text: "text-red-700", bg: "bg-red-50" },
};

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    const clean = d.replace(" ", "T").replace(/\+00$/, "Z");
    const dt = new Date(clean.includes("T") ? clean : clean + "T00:00:00");
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function formatDias(dias?: number | null) {
  if (dias === null || dias === undefined) return null;
  if (dias === 0) return "mesmo dia";
  if (dias === 1) return "1 dia";
  return `${dias} dias`;
}

export function PurchaseTimeline({ companyId, cotacaoId, ordemId }: { companyId: number; cotacaoId?: number; ordemId?: number }) {
  const q = trpc.compras.getTimelineCompra.useQuery(
    { companyId, cotacaoId, ordemId },
    { enabled: companyId > 0 && ((cotacaoId !== undefined && cotacaoId > 0) || (ordemId !== undefined && ordemId > 0)) }
  );

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        <span className="ml-2 text-xs text-gray-400">Carregando timeline...</span>
      </div>
    );
  }

  if (q.error) {
    return (
      <div className="text-center py-4 text-xs text-red-400">
        Erro ao carregar timeline.
      </div>
    );
  }

  if (!q.data || !q.data.etapas || q.data.etapas.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-gray-400">
        Nenhuma informação de timeline disponível.
      </div>
    );
  }

  const etapas: TimelineStep[] = q.data.etapas;
  const etapaAtualLabel = q.data.etapaAtual;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Timeline do Processo</span>
        {etapaAtualLabel && (
          <span className="ml-auto text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200">
            {etapaAtualLabel}
          </span>
        )}
      </div>

      <div className="relative">
        {etapas.map((step, i) => {
          const Icon = STEP_ICONS[step.key] || CircleDot;
          const style = STATUS_STYLES[step.status] || STATUS_STYLES.pendente;
          const isLast = i === etapas.length - 1;

          return (
            <div key={step.key} className="flex gap-3 relative">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ${style.dot} flex-shrink-0 z-10`}>
                  {step.status === "atrasada" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Icon className={`h-3.5 w-3.5 ${step.status === "pendente" ? "text-gray-500" : "text-white"}`} />
                  )}
                </div>
                {!isLast && (
                  <div className={`w-0.5 flex-1 min-h-[24px] ${style.line}`} />
                )}
              </div>

              <div className={`flex-1 pb-4 ${isLast ? "pb-0" : ""}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${style.text}`}>
                    {step.label}
                  </span>
                  {step.data && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                      {formatDate(step.data)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {step.tempoDesdeAnterior !== null && step.tempoDesdeAnterior !== undefined && step.status !== "pendente" && (
                    <span className="text-[10px] text-gray-400">
                      {step.status === "atrasada" ? (
                        <span className="text-red-500 font-medium">⚠ Atraso de {formatDias(step.tempoDesdeAnterior)}</span>
                      ) : (
                        <>↳ {formatDias(step.tempoDesdeAnterior)} desde etapa anterior</>
                      )}
                    </span>
                  )}
                  {step.detalhe && (
                    <span className="text-[10px] text-gray-400">{step.detalhe}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimelineBadge({ companyId, cotacaoId, ordemId, lazy = false }: { companyId: number; cotacaoId?: number; ordemId?: number; lazy?: boolean }) {
  const [requested, setRequested] = useState(!lazy);
  const hasTarget = companyId > 0 && ((cotacaoId !== undefined && cotacaoId > 0) || (ordemId !== undefined && ordemId > 0));
  const q = trpc.compras.getTimelineCompra.useQuery(
    { companyId, cotacaoId, ordemId },
    { enabled: hasTarget && requested }
  );

  if (lazy && !requested) {
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setRequested(true); }}
        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        title="Carregar a etapa atual desta compra"
      >
        <Clock className="h-2.5 w-2.5" /> Ver etapa
      </button>
    );
  }
  if (requested && q.isLoading) {
    return <span className="inline-flex items-center gap-1 text-[10px] text-gray-400"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Etapa</span>;
  }
  if (requested && q.isError) {
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); void q.refetch(); }}
        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600"
        title="Tentar carregar a etapa novamente"
      >
        <AlertTriangle className="h-2.5 w-2.5" /> Tentar etapa
      </button>
    );
  }
  if (!q.data?.etapaAtual) return null;

  const hasAtraso = q.data.etapas?.some((e: { status: string }) => e.status === "atrasada");

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
      hasAtraso
        ? "bg-red-50 text-red-600 border-red-200"
        : "bg-blue-50 text-blue-600 border-blue-200"
    }`}>
      {hasAtraso && <AlertTriangle className="h-2.5 w-2.5" />}
      {q.data.etapaAtual}
    </span>
  );
}
