import { useMemo } from "react";
import { BarChart2, AlertTriangle, TrendingUp, Clock, Repeat2, DollarSign, ArrowUpRight, Package } from "lucide-react";

const fmt = (v: number) =>
  "R$\u00a0" + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InsightRow({ icon, label, title, sub, color = "text-slate-700" }: {
  icon: React.ReactNode; label: string; title: string; sub: string; color?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-xs font-semibold text-slate-800 break-words leading-snug">{title}</p>
        <p className={`text-[11px] font-medium ${color} mt-0.5`}>{sub}</p>
      </div>
    </div>
  );
}

interface Props {
  itens: any[];
  totalGasto: number;
}

export default function AnaliseDashPanel({ itens, totalGasto }: Props) {
  const data = useMemo(() => {
    if (!itens?.length) return null;

    // ── Curva ABC ──────────────────────────────────────────
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

    // ── Insights simples ───────────────────────────────────
    const maisCaro = [...itens].sort((a, b) => (b.precoMax ?? 0) - (a.precoMax ?? 0))[0];
    const maisBaratoCandidatos = itens.filter(i => (i.precoMin ?? 0) > 0);
    const maisBarato = maisBaratoCandidatos.sort((a, b) => (a.precoMin ?? 0) - (b.precoMin ?? 0))[0] ?? null;
    const maiorAlta = [...itens]
      .filter(i => i.variacaoReason === 'variacao_real' && (i.variacaoPct ?? 0) > 2)
      .sort((a, b) => (b.variacaoPct ?? 0) - (a.variacaoPct ?? 0))[0] ?? null;
    const maisRecorrente = [...itens].sort((a, b) => (b.qtdOcs ?? 0) - (a.qtdOcs ?? 0))[0];
    const maisGasto = sorted[0];

    // ── Fragmentação: ≥3 OCs em ≤30 dias ─────────────────
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

    // ── Maior ciclo (intervalo primeira→última) ──────────
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

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
      <Package className="w-8 h-8 opacity-40" />
      <p className="text-xs">Sem dados para análise</p>
    </div>
  );

  const { curvaA, curvaB, curvaC, maisCaro, maisBarato, maiorAlta, maisRecorrente, maisGasto, fragmentados, maiorCiclo } = data;

  return (
    <div className="space-y-4">

      {/* ── Curva ABC ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1.5 mb-3">
          <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Curva ABC · Pareto</span>
        </div>
        <div className="space-y-2.5">
          {([
            { cls: 'A', count: curvaA.length, label: '≈80% do gasto', bg: 'bg-rose-500', track: 'bg-rose-100' },
            { cls: 'B', count: curvaB.length, label: '≈15% do gasto', bg: 'bg-amber-500', track: 'bg-amber-100' },
            { cls: 'C', count: curvaC.length, label: '≈5% do gasto',  bg: 'bg-slate-400', track: 'bg-slate-100' },
          ] as const).map(({ cls, count, label, bg, track }) => {
            const pctIt = itens.length > 0 ? (count / itens.length) * 100 : 0;
            return (
              <div key={cls}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0 ${bg}`}>{cls}</span>
                    <span className="text-[11px] text-slate-500">{count} iten{count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{label}</span>
                </div>
                <div className={`h-1.5 rounded-full ${track} overflow-hidden`}>
                  <div className={`h-1.5 rounded-full ${bg} transition-all`} style={{ width: `${Math.min(pctIt, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {curvaA.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Top Classe A</p>
            {curvaA.slice(0, 3).map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-slate-700 truncate flex-1" title={item.descricao}>{item.descricao}</span>
                <span className="text-[11px] font-semibold text-rose-600 shrink-0">{fmt(item.valorTotal)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Insights ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1.5 mb-1">
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Destaques</span>
        </div>
        <div>
          {maisGasto && (
            <InsightRow
              icon={<DollarSign className="w-3.5 h-3.5 text-rose-500" />}
              label="Maior gasto total"
              title={maisGasto.descricao}
              sub={fmt(maisGasto.valorTotal)}
              color="text-rose-600"
            />
          )}
          {maisCaro && (
            <InsightRow
              icon={<span className="text-sm leading-none">🏷️</span>}
              label="Preço unitário mais alto"
              title={maisCaro.descricao}
              sub={`${fmt(maisCaro.precoMax)}/${maisCaro.unidade || 'un'}`}
              color="text-orange-600"
            />
          )}
          {maisBarato && (
            <InsightRow
              icon={<span className="text-sm leading-none">✅</span>}
              label="Preço unitário mais baixo"
              title={maisBarato.descricao}
              sub={`${fmt(maisBarato.precoMin)}/${maisBarato.unidade || 'un'}`}
              color="text-emerald-600"
            />
          )}
          {maiorAlta && (
            <InsightRow
              icon={<TrendingUp className="w-3.5 h-3.5 text-red-500" />}
              label="Maior alta de preço"
              title={maiorAlta.descricao}
              sub={`+${(maiorAlta.variacaoPct ?? 0).toFixed(1)}% de variação`}
              color="text-red-600"
            />
          )}
          {maisRecorrente && (maisRecorrente.qtdOcs ?? 0) > 1 && (
            <InsightRow
              icon={<Repeat2 className="w-3.5 h-3.5 text-indigo-500" />}
              label="Produto mais recorrente"
              title={maisRecorrente.descricao}
              sub={`${maisRecorrente.qtdOcs} ordens de compra`}
              color="text-indigo-600"
            />
          )}
          {maiorCiclo && (
            <InsightRow
              icon={<Clock className="w-3.5 h-3.5 text-purple-500" />}
              label="Maior ciclo de compra"
              title={maiorCiclo.item.descricao}
              sub={`${maiorCiclo.dias} dias entre 1ª e última OC`}
              color="text-purple-600"
            />
          )}
        </div>
      </div>

      {/* ── Alerta de fragmentação ── */}
      {fragmentados.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-widest">Fragmentação de compras</span>
          </div>
          <p className="text-[11px] text-amber-700 mb-3 leading-relaxed">
            {fragmentados.length} produto{fragmentados.length > 1 ? 's foram comprados' : ' foi comprado'} 3× ou mais em menos de 30 dias.
            Consolidar em 1 OC aumenta o poder de negociação e a durabilidade dos itens.
          </p>
          <div className="space-y-1.5">
            {fragmentados.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-amber-800 truncate flex-1" title={item.descricao}>{item.descricao}</span>
                <span className="text-[11px] font-bold text-amber-700 shrink-0 bg-amber-100 px-1.5 py-0.5 rounded">
                  {item.qtdOcs} OCs
                </span>
              </div>
            ))}
            {fragmentados.length > 5 && (
              <p className="text-[10px] text-amber-500 pt-1">+{fragmentados.length - 5} outros produtos…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
