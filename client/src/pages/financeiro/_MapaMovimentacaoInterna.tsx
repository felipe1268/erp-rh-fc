import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight, ChevronDown, ChevronRight, Loader2, Info, Building2,
  PiggyBank, Repeat, Boxes, Tag, RefreshCw,
} from "lucide-react";
import { NaturezaOverrideDialog, NaturezaBadge, type LancNaturezaLinha } from "./_NaturezaOverride";

/* ────────────────────────────────────────────────────────────────────────────
 * Rev. 3368 — MAPA DE MOVIMENTAÇÃO INTERNA DO GRUPO.
 * Mostra o montante movimentado no período POR CONTRAPARTE (cada empresa/CPF do
 * grupo cadastrado + aplicação/resgate + transf. entre contas próprias + outras),
 * com entrou / saiu / líquido. Só CONFERÊNCIA — lê a fonte única do split caixa
 * real × interno. Reclassificação pontual é opcional (exceção por lançamento) e
 * passa pelo diálogo de natureza; nada concilia/baixa aqui.
 * ──────────────────────────────────────────────────────────────────────────── */

const brl = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const fmtData = (d: any) => {
  const s = String(d || "").slice(0, 10);
  const [y, m, dd] = s.split("-");
  return y && m && dd ? `${dd}/${m}/${y}` : s;
};

const TIPO_META: Record<string, { icon: any; ring: string; chip: string }> = {
  grupo: { icon: Building2, ring: "border-indigo-200", chip: "bg-indigo-50 text-indigo-700" },
  aplicacao: { icon: PiggyBank, ring: "border-emerald-200", chip: "bg-emerald-50 text-emerald-700" },
  transf: { icon: Repeat, ring: "border-sky-200", chip: "bg-sky-50 text-sky-700" },
  outras: { icon: Boxes, ring: "border-slate-200", chip: "bg-slate-50 text-slate-600" },
};

type BucketRow = { label: string; tipo: string; entrou: number; saiu: number; liquido: number; qtd: number };
type LineRow = LancNaturezaLinha & { data?: any; bucket: string; conciliado?: number };

export function MapaMovimentacaoInternaDialog({
  open, onOpenChange, companyId, dataInicio, dataFim, periodoLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: number;
  dataInicio: string;
  dataFim: string;
  periodoLabel?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ovLine, setOvLine] = useState<LineRow | null>(null);

  const { data, isFetching, isError, error, refetch } = (trpc as any).financial.getMovimentacaoInternaGrupo.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: open && !!companyId, refetchOnWindowFocus: false },
  );

  const buckets: BucketRow[] = data?.buckets ?? [];
  const totais = data?.totais ?? { entrou: 0, saiu: 0, liquido: 0, bruto: 0, qtd: 0 };
  const linesByBucket = useMemo(() => {
    const m = new Map<string, LineRow[]>();
    for (const l of (data?.lines ?? []) as LineRow[]) {
      const arr = m.get(l.bucket) || [];
      arr.push(l);
      m.set(l.bucket, arr);
    }
    return m;
  }, [data]);

  const toggle = (label: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogHeader className="space-y-0 text-left">
                  <DialogTitle className="text-sm font-semibold text-white">Movimentação interna do grupo</DialogTitle>
                  <DialogDescription className="text-[11px] text-indigo-100">
                    Montante movimentado por contraparte{periodoLabel ? ` · ${periodoLabel}` : ""} — só conferência, não concilia
                  </DialogDescription>
                </DialogHeader>
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                title="Atualizar"
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3 overflow-y-auto">
            {/* Totais */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                <p className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Entrou (p/ a empresa)</p>
                <p className="text-base font-bold text-emerald-700 tabular-nums">{brl(totais.entrou)}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2">
                <p className="text-[10px] font-medium text-red-700 uppercase tracking-wide">Saiu (da empresa)</p>
                <p className="text-base font-bold text-red-700 tabular-nums">{brl(totais.saiu)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wide">Líquido</p>
                <p className={`text-base font-bold tabular-nums ${totais.liquido >= 0 ? "text-emerald-700" : "text-red-600"}`}>{brl(totais.liquido)}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Montante bruto movimentado no período: <strong className="text-slate-700">{brl(totais.bruto)}</strong> em {totais.qtd} lançamento(s).
            </p>

            {isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Não foi possível carregar o mapa: {(error as any)?.message ?? "tente novamente."}
              </div>
            )}

            {isFetching && !data && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            )}

            {!isFetching && data && buckets.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-500">
                Nenhuma movimentação interna no período selecionado.
              </div>
            )}

            {/* Baldes por contraparte */}
            <div className="space-y-2">
              {buckets.map((b) => {
                const meta = TIPO_META[b.tipo] || TIPO_META.outras;
                const Icon = meta.icon;
                const isOpen = expanded.has(b.label);
                const lines = linesByBucket.get(b.label) || [];
                return (
                  <div key={b.label} className={`rounded-lg border ${meta.ring} bg-white overflow-hidden`}>
                    <button
                      type="button"
                      onClick={() => toggle(b.label)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50/70 transition"
                    >
                      <span className="text-slate-400 shrink-0">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${meta.chip}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-700 truncate">{b.label}</span>
                        <span className="block text-[11px] text-slate-400">{b.qtd} lançamento(s)</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[11px] text-emerald-600 tabular-nums">+{brl(b.entrou)}</span>
                        <span className="block text-[11px] text-red-500 tabular-nums">−{brl(b.saiu)}</span>
                        <span className={`block text-xs font-bold tabular-nums ${b.liquido >= 0 ? "text-emerald-700" : "text-red-600"}`}>{brl(b.liquido)}</span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 divide-y divide-slate-50">
                        {lines.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-400">Sem linhas.</p>}
                        {lines.map((l) => {
                          const v = Number(l.valor) || 0;
                          const isEntrada = v >= 0;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setOvLine(l)}
                              title="Clique para reclassificar este lançamento (caixa real × interno)"
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-indigo-50/40 transition"
                            >
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0 w-16">{fmtData(l.data)}</span>
                              <span className="text-[11px] text-slate-600 truncate flex-1">{l.descricao || "—"}</span>
                              <NaturezaBadge natureza={l.overrideNatureza} />
                              <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${isEntrada ? "text-emerald-600" : "text-red-500"}`}>
                                {isEntrada ? "+" : "−"}{brl(Math.abs(v))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-1.5 text-[11px] text-slate-400 pt-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                "Interna" = transferências entre as suas contas, aplicação/resgate e movimentação com empresas/CPFs do grupo
                cadastrados — não entra no caixa real. Clique numa linha pra reclassificar (caixa real × interno) caso alguma
                esteja no balde errado. Nada é conciliado ou alterado aqui.
              </span>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <NaturezaOverrideDialog
        open={!!ovLine}
        onOpenChange={(o) => { if (!o) setOvLine(null); }}
        companyId={companyId}
        line={ovLine}
        onDone={() => { setOvLine(null); refetch(); }}
      />
    </>
  );
}
