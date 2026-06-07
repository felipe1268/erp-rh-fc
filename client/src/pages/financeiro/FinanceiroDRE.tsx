import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { BarChart2, TrendingUp, TrendingDown, RefreshCw, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatPct(v: number) {
  return `${v.toFixed(2)}%`;
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

interface DRERow {
  label: string;
  value: number;
  indent?: number;
  isSeparator?: boolean;
  isTotal?: boolean;
  isNegative?: boolean;
  percentOf?: number;
  highlight?: "green" | "red" | "blue";
}

export default function FinanceiroDRE() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  // mesSel: 1..12 = DRE mensal daquele mês; null = DRE do ano inteiro.
  const [mesSel, setMesSel] = useState<number | null>(hoje.getMonth() + 1);

  const tipoPeriodo: "mensal" | "anual" = mesSel === null ? "anual" : "mensal";
  const periodo = mesSel === null ? `${ano}` : `${ano}-${String(mesSel).padStart(2, "0")}`;

  // Disponibilidade por mês (pontinhos do seletor)
  const { data: disp } = (trpc as any).financial.getDREDisponibilidade.useQuery(
    { companyId, ano: `${ano}` },
    { enabled: !!companyId }
  );

  const mesesStatus: Record<number, MesStatus> = {};
  for (let m = 1; m <= 12; m++) {
    const info = disp?.meses?.[m] ?? disp?.meses?.[String(m)];
    const total = Number(info?.n ?? 0);
    const realizado = Number(info?.nRealizado ?? 0);
    mesesStatus[m] = total === 0 ? "sem_dados" : (realizado >= total ? "consolidado" : "lancamento");
  }

  const { data: dre, isLoading, refetch } = (trpc as any).financial.getDRE.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );

  const rows: DRERow[] = dre ? [
    { label: "1. RECEITA BRUTA", value: dre.receitaBruta, isTotal: false, highlight: "green" },
    { label: "  (-) Deduções da Receita", value: -dre.deducoes, indent: 1, isNegative: true },
    { label: "= RECEITA LÍQUIDA", value: dre.receitaLiquida, isTotal: true, highlight: "blue" },
    { label: "", value: 0, isSeparator: true },
    { label: "  (-) Custos Diretos das Obras", value: -dre.custosObra, indent: 1, isNegative: true },
    { label: "= LUCRO BRUTO", value: dre.lucroBruto, isTotal: true, percentOf: dre.receitaLiquida, highlight: dre.lucroBruto >= 0 ? "green" : "red" },
    { label: "    Margem Bruta", value: dre.margemBruta, indent: 2 },
    { label: "", value: 0, isSeparator: true },
    { label: "  (-) Despesas Fixas", value: -dre.despesasFixas, indent: 1, isNegative: true },
    { label: "  (-) Despesas Variáveis", value: -dre.despesasVariaveis, indent: 1, isNegative: true },
    { label: "= EBITDA", value: dre.ebitda, isTotal: true, percentOf: dre.receitaLiquida, highlight: dre.ebitda >= 0 ? "green" : "red" },
    { label: "    Margem EBITDA", value: dre.margemEbitda, indent: 2 },
    { label: "", value: 0, isSeparator: true },
    { label: "  (+) Receitas Financeiras", value: dre.receitasFinanceiras, indent: 1 },
    { label: "  (-) Despesas Financeiras", value: -dre.despesasFinanceiras, indent: 1, isNegative: true },
    { label: "= RESULTADO FINANCEIRO", value: dre.resultadoFinanceiro, isTotal: true, highlight: dre.resultadoFinanceiro >= 0 ? "green" : "red" },
    { label: "", value: 0, isSeparator: true },
    { label: "= LAIR (Antes dos Impostos)", value: dre.lair, isTotal: true, highlight: dre.lair >= 0 ? "green" : "red" },
    { label: "  (-) Impostos sobre o Resultado", value: -dre.impostos, indent: 1, isNegative: true },
    { label: "= LUCRO LÍQUIDO", value: dre.lucroLiquido, isTotal: true, highlight: dre.lucroLiquido >= 0 ? "green" : "red" },
    { label: "    Margem Líquida", value: dre.margemLiquida, indent: 2 },
  ] : [];

  const isPct = (row: DRERow) => row.label.includes("Margem");

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-blue-600" />
              DRE — Demonstrativo de Resultado
            </h1>
            <p className="text-sm text-gray-500 mt-1">Demonstrativo do Exercício conforme CPC</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start sm:self-auto">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
          </Button>
        </div>

        {/* Seletor: Ano + Meses (chips) + Ano inteiro */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_ABREV.map((m, i) => {
                const num = i + 1;
                const status = mesesStatus[num];
                const isSelected = mesSel === num;
                return (
                  <button
                    key={m}
                    onClick={() => setMesSel(num)}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span>{m}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === "consolidado" ? "bg-green-500" :
                      status === "lancamento" ? "bg-blue-500" :
                      "bg-gray-300"
                    }`} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setMesSel(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                  ${mesSel === null
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                <CalendarDays className="w-3.5 h-3.5" /> Ano inteiro ({ano})
              </button>
            </div>
          </CardContent>
        </Card>

        {/* KPIs rápidos */}
        {dre && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Receita Líquida", value: dre.receitaLiquida, icon: TrendingUp, color: "text-blue-600" },
              { label: "Lucro Bruto", value: dre.lucroBruto, icon: BarChart2, color: dre.lucroBruto >= 0 ? "text-green-600" : "text-red-600" },
              { label: "EBITDA", value: dre.ebitda, icon: BarChart2, color: dre.ebitda >= 0 ? "text-green-600" : "text-red-600" },
              { label: "Lucro Líquido", value: dre.lucroLiquido, icon: dre.lucroLiquido >= 0 ? TrendingUp : TrendingDown, color: dre.lucroLiquido >= 0 ? "text-green-600" : "text-red-600" },
            ].map(kpi => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${kpi.color}`} />
                      <span className="text-xs text-gray-500">{kpi.label}</span>
                    </div>
                    <p className={`text-lg font-bold ${kpi.color}`}>{formatBRL(kpi.value)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tabela DRE */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              DRE — {mesSel === null ? `${ano} (ano inteiro)` : `${MESES_PT[mesSel - 1]}/${ano}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center text-gray-500">Calculando DRE...</div>
            ) : !dre ? (
              <div className="p-10 text-center text-gray-400">Selecione um período para visualizar o DRE.</div>
            ) : (
              <div>
                {rows.map((row, idx) => {
                  if (row.isSeparator) return <div key={idx} className="border-t border-gray-200 my-1" />;
                  const isMargin = isPct(row);
                  const val = row.value;
                  const displayVal = isMargin ? formatPct(val) : formatBRL(Math.abs(val));

                  let textColor = "text-gray-700";
                  if (row.highlight === "green") textColor = "text-green-700";
                  if (row.highlight === "red") textColor = "text-red-600";
                  if (row.highlight === "blue") textColor = "text-blue-700";
                  if (isMargin) textColor = val >= 0 ? "text-emerald-600" : "text-red-600";

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between px-5 py-2.5 ${row.isTotal ? "font-semibold bg-gray-50" : ""} hover:bg-gray-50/50`}
                      style={{ paddingLeft: `${20 + (row.indent ?? 0) * 20}px` }}
                    >
                      <span className={`text-sm ${row.isTotal ? "font-bold" : "text-gray-600"}`}>{row.label}</span>
                      <span className={`text-sm font-medium ${textColor} tabular-nums`}>
                        {isMargin ? displayVal : (row.isNegative ? `(${displayVal})` : displayVal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {dre && (
          <p className="text-xs text-gray-400 text-center">
            Dados calculados automaticamente com base nos lançamentos financeiros do período.
            Valores entre parênteses representam saídas/deduções.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
