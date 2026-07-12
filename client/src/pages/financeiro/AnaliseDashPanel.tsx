import { useMemo, useState } from "react";
import { BarChart2, AlertTriangle, TrendingUp, Clock, Repeat2, DollarSign, ArrowUpRight, Package, ChevronDown } from "lucide-react";

const fmt = (v: number) =>
  "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  itens: any[];
  totalGasto: number;
}

export default function AnaliseDashPanel({ itens, totalGasto }: Props) {
  const [open, setOpen] = useState(true);

  const data = useMemo(() => {
    if (!itens?.length) return null;

    const sorted = [...itens].sort((a, b) => (b.valorTotal ?? 0) - (a.valorTotal ?? 0));
    let cum = 0;
    const classe: ('A' | 'B' | 'C')[] = [];
    for (const item of sorted) {
      cum += item.valorTotal ?? 0;
      const r = totalGasto > 0 ? cum / totalGasto : 0;
      classe.push(r <= 0.80 ? 'A' : r <= 0.95 ? 'B' : 'C');
    }
    const curvaA = sorted.filter((_, i) => classe[i] === 'A');
    const curvaB = sorted.filter((_, i) => classe[i] === 'B');
    const curvaC = sorted.filter((_, i) => classe[i] === 'C');

    const maisCaro = [...itens].sort((a, b) => (b.precoMax ?? 0) - (a.precoMax ?? 0))[0];
    const maisBaratoCandidatos = itens.filter(i => (i.precoMin ?? 0) > 0);
    const maisBarato = maisBaratoCandidatos.sort((a, b) => (a.precoMin ?? 0) - (b.precoMin ?? 0))[0] ?? null;
    const maiorAlta = [...itens]
      .filter(i => i.variacaoReason === 'variacao_real' && (i.variacaoPct ?? 0) > 2)
      .sort((a, b) => (b.variacaoPct ?? 0) - (a.variacaoPct ?? 0))[0] ?? null;
    const maisRecorrente = [...itens].sort((a, b) => (b.qtdOcs ?? 0) - (a.qtdOcs ?? 0))[0];
    const maisGasto = sorted[0];

    const fragmentados = itens.filter(item => {
      const occs: any[] = item.ocorrencias ?? [];
      if (occs.length < 3) return false;
      const dates = occs
        .map(oc => oc.data ? new Date(oc.data).getTime() : 0)
        .filter(Boolean)
        .sort((a, b) => a - b);
      if (dates.length < 3) return false;
      for (let i = 0; i + 2 < dates.length; i++) {
        if ((dates[i + 2] - dates[i]) / 86400000 <= 30) return true;
      }
      return false;
    });

    let maiorCiclo: { item: any; dias: number } | null = null;
    for (const item of itens) {
      const occs: any[] = item.ocorrencias ?? [];
      if (occs.length < 2) continue;
      const dates = occs
        .map(oc => oc.data ? new Date(oc.data).getTime() : 0)
        .filter(Boolean)
        .sort((a, b) => a - b);
      if (dates.length < 2) continue;
      const dias = Math.round((dates[dates.length - 1] - dates[0]) / 86400000);
      if (!maiorCiclo || dias > maiorCiclo.dias) maiorCiclo = { item, dias };
    }

    return { curvaA, curvaB, curvaC, maisCaro, maisBarato, maiorAlta, maisRecorrente, maisGasto, fragmentados, maiorCiclo };
  }, [itens, totalGasto]);

  if (!data) return null;

  const { curvaA, curvaB, curvaC, maisCaro, maisBarato, maiorAlta, maisRecorrente, maisGasto, fragmentados, maiorCiclo } = data;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* ── Cabeçalho colapsável ── */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
            <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">Análise Inteligente</span>
          {fragmentados.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200">
              <AlertTriangle className="w-3 h-3" />
              {fragmentados.length} fragilidade{fragmentados.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {/* ── Grade principal: Curva ABC + Insights + Fragmentação ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">

            {/* ── Coluna 1: Curva ABC ── */}
            <div className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Curva ABC · Pareto
              </p>
              <div className="space-y-3">
                {([
                  { cls: 'A', items: curvaA, label: '≈80% do gasto', bar: 'bg-rose-500', track: 'bg-rose-100', text: 'text-rose-700' },
                  { cls: 'B', items: curvaB, label: '≈15% do gasto', bar: 'bg-amber-500', track: 'bg-amber-100', text: 'text-amber-700' },
                  { cls: 'C', items: curvaC, label: '≈5% do gasto',  bar: 'bg-slate-400', track: 'bg-slate-100', text: 'text-slate-500' },
                ] as const).map(({ cls, items, label, bar, track, text }) => {
                  const pct = itens.length > 0 ? (items.length / itens.length) * 100 : 0;
                  return (
                    <div key={cls}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-5 h-5 rounded text-[10px] font-bold text-white flex items-center justify-center shrink-0 ${bar}`}>{cls}</span>
                          <span className="text-xs font-semibold text-slate-700">{items.length} iten{items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <span className={`text-[10px] font-medium ${text}`}>{label}</span>
                      </div>
                      <div className={`h-2 rounded-full ${track} overflow-hidden`}>
                        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {curvaA.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Top Classe A</p>
                  {curvaA.slice(0, 3).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-700 truncate flex-1" title={item.descricao}>{item.descricao}</span>
                      <span className="text-[11px] font-bold text-rose-600 shrink-0 tabular-nums">{fmt(item.valorTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Coluna 2: Insights em grade 2×3 ── */}
            <div className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> Destaques
              </p>
              <div className="grid grid-cols-2 gap-2">
                {maisGasto && (
                  <InsightCard
                    icon={<DollarSign className="w-3.5 h-3.5 text-rose-500" />}
                    bg="bg-rose-50"
                    label="Maior gasto"
                    title={maisGasto.descricao}
                    value={fmt(maisGasto.valorTotal)}
                    valueColor="text-rose-600"
                  />
                )}
                {maisCaro && (
                  <InsightCard
                    icon={<span className="text-sm">🏷️</span>}
                    bg="bg-orange-50"
                    label="Preço mais alto"
                    title={maisCaro.descricao}
                    value={`${fmt(maisCaro.precoMax)}/${maisCaro.unidade || 'un'}`}
                    valueColor="text-orange-600"
                  />
                )}
                {maisBarato && (
                  <InsightCard
                    icon={<span className="text-sm">✅</span>}
                    bg="bg-emerald-50"
                    label="Preço mais baixo"
                    title={maisBarato.descricao}
                    value={`${fmt(maisBarato.precoMin)}/${maisBarato.unidade || 'un'}`}
                    valueColor="text-emerald-600"
                  />
                )}
                {maiorAlta && (
                  <InsightCard
                    icon={<TrendingUp className="w-3.5 h-3.5 text-red-500" />}
                    bg="bg-red-50"
                    label="Maior alta de preço"
                    title={maiorAlta.descricao}
                    value={`+${(maiorAlta.variacaoPct ?? 0).toFixed(1)}%`}
                    valueColor="text-red-600"
                  />
                )}
                {maisRecorrente && (maisRecorrente.qtdOcs ?? 0) > 1 && (
                  <InsightCard
                    icon={<Repeat2 className="w-3.5 h-3.5 text-indigo-500" />}
                    bg="bg-indigo-50"
                    label="Mais recorrente"
                    title={maisRecorrente.descricao}
                    value={`${maisRecorrente.qtdOcs} OCs`}
                    valueColor="text-indigo-600"
                  />
                )}
                {maiorCiclo && (
                  <InsightCard
                    icon={<Clock className="w-3.5 h-3.5 text-purple-500" />}
                    bg="bg-purple-50"
                    label="Maior ciclo"
                    title={maiorCiclo.item.descricao}
                    value={`${maiorCiclo.dias} dias`}
                    valueColor="text-purple-600"
                  />
                )}
              </div>
            </div>

            {/* ── Coluna 3: Fragmentação ── */}
            <div className="p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Fragmentação de Compras
              </p>
              {fragmentados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Package className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">Nenhuma fragmentação detectada</p>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-[11px] text-amber-700 mb-2.5 leading-relaxed">
                    {fragmentados.length} produto{fragmentados.length > 1 ? 's comprados' : ' comprado'} 3× ou mais em ≤30 dias.
                    Consolidar em 1 OC aumenta o poder de negociação e a durabilidade dos itens.
                  </p>
                  <div className="space-y-1.5">
                    {fragmentados.slice(0, 6).map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-amber-800 truncate flex-1" title={item.descricao}>{item.descricao}</span>
                        <span className="text-[10px] font-bold text-amber-700 shrink-0 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                          {item.qtdOcs} OCs
                        </span>
                      </div>
                    ))}
                    {fragmentados.length > 6 && (
                      <p className="text-[10px] text-amber-500 pt-0.5">+{fragmentados.length - 6} outros produtos…</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ icon, bg, label, title, value, valueColor }: {
  icon: React.ReactNode; bg: string; label: string;
  title: string; value: string; valueColor: string;
}) {
  return (
    <div className={`rounded-lg p-2.5 ${bg} flex flex-col gap-1 min-w-0`}>
      <div className="flex items-center gap-1.5">
        <div className="shrink-0">{icon}</div>
        <p className="text-[10px] text-slate-500 font-medium leading-tight">{label}</p>
      </div>
      <p className="text-[11px] text-slate-700 font-semibold leading-tight truncate" title={title}>{title}</p>
      <p className={`text-xs font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
