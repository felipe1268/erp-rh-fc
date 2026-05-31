import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, TrendingUp, TrendingDown, Minus, Loader2, ChevronRight } from "lucide-react";
import DashChart from "@/components/DashChart";

export type HeadcountAno = { ano: number; ativos: number; admitidos: number; desligados: number };
export type HeadcountAnualData = { anoAtual: number; anos: HeadcountAno[] };

function VarBadge({ atual, ant }: { atual: number; ant: number | null }) {
  if (ant == null) return <span className="text-[11px] text-slate-300">—</span>;
  const delta = atual - ant;
  if (delta === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500">
      <Minus className="h-3 w-3" /> 0
    </span>
  );
  const subiu = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${subiu ? "text-emerald-600" : "text-red-600"}`}>
      {subiu ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {subiu ? "+" : ""}{delta}
    </span>
  );
}

export default function HeadcountAnualFuncionarios({
  data, isLoading, onSelectAno,
}: {
  data?: HeadcountAnualData;
  isLoading: boolean;
  onSelectAno: (ano: number) => void;
}) {
  const anos = data?.anos || [];
  const anoAtual = data?.anoAtual ?? new Date().getFullYear();

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-blue-600" />
          Total de Funcionários por Ano
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Quadro ativo ao fim de cada ano desde a fundação · clique em um ano para ver a lista (nome e foto)
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : anos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Sem dados de admissão para montar o histórico anual.
          </div>
        ) : (
          <div className="space-y-5">
            <DashChart
              title=""
              type="bar"
              labels={anos.map(a => String(a.ano))}
              datasets={[{
                label: "Funcionários ativos (fim do ano)",
                data: anos.map(a => a.ativos),
                backgroundColor: anos.map(a => a.ano === anoAtual ? "#1B2A4A" : "#2563EB"),
              }]}
              height={260}
              onChartClick={(info) => onSelectAno(Number(info.label))}
            />

            {/* Cards por ano — acesso por toque (mobile) e clique (desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {anos.map((a, i) => {
                const ant = i > 0 ? anos[i - 1].ativos : null;
                const isAtual = a.ano === anoAtual;
                return (
                  <button
                    key={a.ano}
                    type="button"
                    onClick={() => onSelectAno(a.ano)}
                    className={`group text-left rounded-xl border p-3 transition-all hover:shadow-md hover:border-blue-300 hover:bg-blue-50/40 ${isAtual ? "border-[#1B2A4A]/40 bg-[#1B2A4A]/[0.03]" : "border-gray-200 bg-white"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-700">{a.ano}</span>
                      {isAtual && <span className="text-[9px] font-semibold uppercase tracking-wide text-[#1B2A4A] bg-[#1B2A4A]/10 rounded px-1.5 py-0.5">atual</span>}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-gray-900 tabular-nums">{a.ativos}</span>
                      <VarBadge atual={a.ativos} ant={ant} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="text-emerald-600">+{a.admitidos} adm</span>
                      <span className="text-red-500">-{a.desligados} desl</span>
                    </div>
                    <div className="mt-1 flex items-center text-[10px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Ver lista <ChevronRight className="h-3 w-3" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
