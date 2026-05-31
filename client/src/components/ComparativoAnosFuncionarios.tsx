import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { UserPlus, UserMinus, TrendingUp, TrendingDown, Minus, Loader2, CalendarRange } from "lucide-react";

export type AnoMov = { t1: number; t2: number; t3: number; t4: number; s1: number; s2: number; total: number };
export type AnoLinha = { ano: number; admissoes: AnoMov; demissoes: AnoMov };
export type AnualData = { anoRef: number; anos: AnoLinha[] };

function varPct(atual: number, ant: number | null) {
  if (ant == null) return null;
  if (!ant) return atual > 0 ? 100 : 0;
  return Math.round(((atual - ant) / ant) * 1000) / 10;
}

function VarBadge({ pct, lowerIsBetter }: { pct: number | null; lowerIsBetter: boolean }) {
  if (pct == null) return <span className="text-[11px] text-slate-300">—</span>;
  const flat = Math.abs(pct) < 0.1;
  if (flat) return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500">
      <Minus className="h-3 w-3" /> 0%
    </span>
  );
  const subiu = pct > 0;
  const piorou = lowerIsBetter ? subiu : !subiu;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${piorou ? "text-red-600" : "text-emerald-600"}`}>
      {subiu ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {subiu ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function TabelaMetric({
  titulo, icone: Icon, corHeader, anos, anoRef, pegar, lowerIsBetter,
}: {
  titulo: string;
  icone: any;
  corHeader: string;
  anos: AnoLinha[];
  anoRef: number;
  pegar: (l: AnoLinha) => AnoMov;
  lowerIsBetter: boolean;
}) {
  // Mais recente no topo
  const linhas = [...anos].sort((a, b) => b.ano - a.ano);
  const totalById = new Map<number, number>(anos.map(l => [l.ano, pegar(l).total]));

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className={`px-4 py-2.5 flex items-center gap-2 text-white ${corHeader}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{titulo}</span>
      </div>

      {/* Mobile (< sm): card por ano — sem rolagem horizontal, fácil de ler */}
      <div className="sm:hidden divide-y divide-slate-100">
        {linhas.map(l => {
          const m = pegar(l);
          const isRef = l.ano === anoRef;
          const antTotal = totalById.has(l.ano - 1) ? totalById.get(l.ano - 1)! : null;
          const vpct = varPct(m.total, antTotal);
          return (
            <div key={l.ano} className={`p-3 ${isRef ? "bg-blue-50/60" : ""}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-base font-bold tabular-nums ${isRef ? "text-blue-800" : "text-slate-700"}`}>{l.ano}</span>
                  {isRef && <span className="text-[9px] uppercase font-bold bg-blue-200 text-blue-800 rounded px-1 py-0.5">ref</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold tabular-nums ${isRef ? "text-blue-900" : "text-slate-900"}`}>{m.total}</span>
                  <VarBadge pct={vpct} lowerIsBetter={lowerIsBetter} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([["T1", m.t1], ["T2", m.t2], ["T3", m.t3], ["T4", m.t4]] as [string, number][]).map(([lbl, val]) => (
                  <div key={lbl} className="rounded-lg bg-slate-50 border border-slate-100 px-1.5 py-1.5 text-center">
                    <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide">{lbl}</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-700 mt-0.5">{val}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                {([["1º Sem", m.s1], ["2º Sem", m.s2]] as [string, number][]).map(([lbl, val]) => (
                  <div key={lbl} className="rounded-lg bg-slate-50 border border-slate-100 px-1.5 py-1.5 text-center">
                    <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide">{lbl}</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-700 mt-0.5">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop / tablet (≥ sm): tabela completa */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
              <th className="text-left font-semibold px-3 py-2">Ano</th>
              <th className="text-right font-semibold px-2 py-2">T1</th>
              <th className="text-right font-semibold px-2 py-2">T2</th>
              <th className="text-right font-semibold px-2 py-2">T3</th>
              <th className="text-right font-semibold px-2 py-2">T4</th>
              <th className="text-right font-semibold px-2 py-2 border-l border-slate-200">1º Sem</th>
              <th className="text-right font-semibold px-2 py-2">2º Sem</th>
              <th className="text-right font-semibold px-3 py-2 border-l border-slate-200">Ano</th>
              <th className="text-right font-semibold px-3 py-2">vs ant.</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              const m = pegar(l);
              const isRef = l.ano === anoRef;
              const antTotal = totalById.has(l.ano - 1) ? totalById.get(l.ano - 1)! : null;
              const vpct = varPct(m.total, antTotal);
              return (
                <tr key={l.ano} className={`border-t border-slate-100 ${isRef ? "bg-blue-50/60" : "hover:bg-slate-50/60"}`}>
                  <td className={`px-3 py-2 font-semibold tabular-nums ${isRef ? "text-blue-800" : "text-slate-700"}`}>
                    {l.ano}{isRef && <span className="ml-1.5 text-[9px] uppercase font-bold bg-blue-200 text-blue-800 rounded px-1 py-0.5 align-middle">ref</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{m.t1}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{m.t2}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{m.t3}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{m.t4}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700 border-l border-slate-100">{m.s1}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{m.s2}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold border-l border-slate-100 ${isRef ? "text-blue-900" : "text-slate-900"}`}>{m.total}</td>
                  <td className="px-3 py-2 text-right"><VarBadge pct={vpct} lowerIsBetter={lowerIsBetter} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ComparativoAnosFuncionarios({
  data, isLoading, anoRef,
}: {
  data: AnualData | undefined;
  isLoading?: boolean;
  anoRef: number;
}) {
  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardContent className="py-10 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando comparativo anual…
        </CardContent>
      </Card>
    );
  }
  const anos = data?.anos || [];
  if (anos.length === 0) return null;

  const refLinha = anos.find(l => l.ano === anoRef);
  const refAnt = anos.find(l => l.ano === anoRef - 1);
  const dAdm = varPct(refLinha?.admissoes.total || 0, refAnt ? refAnt.admissoes.total : null);
  const dDem = varPct(refLinha?.demissoes.total || 0, refAnt ? refAnt.demissoes.total : null);
  const saldoRef = (refLinha?.admissoes.total || 0) - (refLinha?.demissoes.total || 0);

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-blue-600" />
          Contratações x Desligamentos — comparativo anual
        </CardTitle>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Totais por trimestre (T1–T4), semestre e ano · {anoRef} comparado com os anos anteriores
        </p>
      </CardHeader>
      <CardContent className="pt-2 space-y-4">
        {/* Resumo do ano de referência */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <UserPlus className="h-4 w-4" />
              <span className="text-[11px] uppercase font-bold tracking-wide">Contratações {anoRef}</span>
            </div>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{refLinha?.admissoes.total ?? 0}</span>
              <span className="mb-1"><VarBadge pct={dAdm} lowerIsBetter={false} /></span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">vs {anoRef - 1} ({refAnt?.admissoes.total ?? 0})</div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-center gap-2 text-red-600">
              <UserMinus className="h-4 w-4" />
              <span className="text-[11px] uppercase font-bold tracking-wide">Desligamentos {anoRef}</span>
            </div>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{refLinha?.demissoes.total ?? 0}</span>
              <span className="mb-1"><VarBadge pct={dDem} lowerIsBetter={true} /></span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">vs {anoRef - 1} ({refAnt?.demissoes.total ?? 0})</div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
            <div className="flex items-center gap-2 text-blue-700">
              <TrendingUp className="h-4 w-4" />
              <span className="text-[11px] uppercase font-bold tracking-wide">Saldo {anoRef}</span>
            </div>
            <div className="flex items-end gap-2 mt-1">
              <span className={`text-2xl font-bold tabular-nums ${saldoRef >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {saldoRef > 0 ? "+" : ""}{saldoRef}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Contratações − desligamentos</div>
          </div>
        </div>

        <TabelaMetric
          titulo="Contratações (Admissões)"
          icone={UserPlus}
          corHeader="bg-emerald-600"
          anos={anos}
          anoRef={anoRef}
          pegar={l => l.admissoes}
          lowerIsBetter={false}
        />
        <TabelaMetric
          titulo="Desligamentos (Demissões)"
          icone={UserMinus}
          corHeader="bg-red-600"
          anos={anos}
          anoRef={anoRef}
          pegar={l => l.demissoes}
          lowerIsBetter={true}
        />
      </CardContent>
    </Card>
  );
}
