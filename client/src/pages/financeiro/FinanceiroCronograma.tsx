import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  TrendingUp, TrendingDown, RefreshCw, Building2,
  BarChart3, DollarSign, AlertCircle
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Line, ComposedChart, ReferenceLine
} from "recharts";

// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), com centavos.
const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const BRL2 = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PCT = (v: number) => `${v.toFixed(1)}%`;

const MESES_PT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function labelMes(mes: string) {
  const [y, m] = mes.split("-");
  return `${MESES_PT[m] ?? m}/${y?.slice(2)}`;
}

function KpiCard({
  label, value, sub, icon: Icon, color, border,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; border: string;
}) {
  return (
    <Card className={`border-l-4 ${border}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <Icon className={`w-8 h-8 ${color} opacity-30`} />
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium">{BRL2(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function FinanceiroCronograma() {
  const { companyId } = useCompany();
  const [selectedObra, setSelectedObra] = useState<number | undefined>(undefined);
  const [importing, setImporting] = useState(false);

  const { data, isLoading, refetch } = (trpc as any).financial.getCronogramaFinanceiro.useQuery(
    { companyId, obraId: selectedObra },
    { enabled: !!companyId, refetchOnWindowFocus: false }
  );

  const importMutation = (trpc as any).financial.importarCronogramaFinanceiro.useMutation({
    onSuccess: (res: any) => {
      setImporting(false);
      refetch();
    },
    onError: () => setImporting(false),
  });

  const meses: any[] = data?.meses ?? [];
  const obras: any[] = data?.obras ?? [];
  const totais = data?.totais;

  const chartData = useMemo(() =>
    meses.map((m: any) => ({
      mes: labelMes(m.mes),
      "Receita Prevista": m.receitaPrevista,
      "Custo Previsto": m.custoPrevisto,
      "Resultado": m.resultadoPrevisto,
      "Realizado": m.receitaRealizada > 0 ? m.receitaRealizada : undefined,
    })), [meses]);

  const margem = totais && totais.totalReceitaPrevista > 0
    ? (totais.resultadoPrevisto / totais.totalReceitaPrevista) * 100 : 0;

  const obraAtual = obras.find((o: any) => o.obraId === selectedObra);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              Cronograma Financeiro
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Previsão de faturamento, custo e resultado por obra — base: cronograma físico-financeiro
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setImporting(true); importMutation.mutate({ companyId }); }}
              disabled={importing || importMutation.isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${importing ? "animate-spin" : ""}`} />
              {importing ? "Importando..." : "Atualizar dados"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Recarregar
            </Button>
          </div>
        </div>

        {/* Obra filter */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setSelectedObra(undefined)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedObra === undefined
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Empresa toda
          </button>
          {obras.map((o: any) => (
            <button
              key={o.obraId}
              onClick={() => setSelectedObra(o.obraId)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                selectedObra === o.obraId
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              {o.obraNome}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            Carregando projeções...
          </div>
        ) : meses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <AlertCircle className="w-10 h-10 text-gray-300" />
            <p className="text-base font-medium">Nenhum dado de cronograma encontrado</p>
            <p className="text-sm text-gray-400">Clique em "Atualizar dados" para importar o cronograma financeiro</p>
            <Button
              size="sm"
              onClick={() => { setImporting(true); importMutation.mutate({ companyId }); }}
              disabled={importing}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${importing ? "animate-spin" : ""}`} />
              Importar agora
            </Button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="Receita Prevista"
                value={BRL(totais?.totalReceitaPrevista ?? 0)}
                sub={selectedObra ? obraAtual?.obraNome : `${obras.length} obras`}
                icon={TrendingUp}
                color="text-green-700"
                border="border-green-500"
              />
              <KpiCard
                label="Custo Previsto"
                value={BRL(totais?.totalCustoPrevisto ?? 0)}
                sub="Cronograma de atividades"
                icon={TrendingDown}
                color="text-red-600"
                border="border-red-400"
              />
              <KpiCard
                label="Resultado Projetado"
                value={BRL(totais?.resultadoPrevisto ?? 0)}
                sub={`Margem: ${PCT(margem)}`}
                icon={DollarSign}
                color={(totais?.resultadoPrevisto ?? 0) >= 0 ? "text-blue-700" : "text-red-600"}
                border={(totais?.resultadoPrevisto ?? 0) >= 0 ? "border-blue-500" : "border-red-500"}
              />
              <KpiCard
                label="Já Realizado"
                value={BRL(totais?.receitaRealizada ?? 0)}
                sub={`Custo real: ${BRL(totais?.custoRealizado ?? 0)}`}
                icon={BarChart3}
                color="text-purple-700"
                border="border-purple-400"
              />
            </div>

            {/* Chart */}
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  Projeção Mensal — Receita × Custo × Resultado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 8, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="mes"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)}
                      width={60}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#e5e7eb" />
                    <Bar dataKey="Receita Prevista" fill="#22c55e" opacity={0.85} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Custo Previsto" fill="#ef4444" opacity={0.85} radius={[2, 2, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="Resultado"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#3b82f6" }}
                    />
                    {chartData.some((d: any) => d["Realizado"] !== undefined) && (
                      <Line
                        type="monotone"
                        dataKey="Realizado"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        dot={{ r: 3, fill: "#8b5cf6" }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">
                  Cronograma Mensal Detalhado
                  {selectedObra && obraAtual && (
                    <span className="ml-2 text-blue-600 font-normal">— {obraAtual.obraNome}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Competência</th>
                        <th className="text-right px-4 py-3 font-semibold text-green-700 text-xs uppercase tracking-wide">Receita Prevista</th>
                        <th className="text-right px-4 py-3 font-semibold text-orange-600 text-xs uppercase tracking-wide">Custo Previsto</th>
                        <th className="text-right px-4 py-3 font-semibold text-blue-700 text-xs uppercase tracking-wide">Resultado</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Margem</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Acum%</th>
                        <th className="text-right px-4 py-3 font-semibold text-purple-600 text-xs uppercase tracking-wide">Realizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meses.map((m: any, i: number) => {
                        const isNeg = m.resultadoPrevisto < 0;
                        const isCurrentMonth = m.mes === new Date().toISOString().slice(0, 7);
                        return (
                          <tr
                            key={m.mes}
                            className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                              isCurrentMonth ? "bg-blue-50/40" : i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-gray-700">
                              {isCurrentMonth && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 mb-0.5" />
                              )}
                              {labelMes(m.mes)}
                              {isCurrentMonth && <span className="ml-1 text-[10px] text-blue-500">(atual)</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-green-700 font-medium">
                              {m.receitaPrevista > 0 ? BRL2(m.receitaPrevista) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-600 font-medium">
                              {BRL2(m.custoPrevisto)}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold ${isNeg ? "text-red-600" : "text-blue-700"}`}>
                              {isNeg ? "" : "+"}{BRL2(m.resultadoPrevisto)}
                            </td>
                            <td className={`px-4 py-3 text-right text-sm ${
                              m.margemPct < 0 ? "text-red-500" : m.margemPct < 10 ? "text-yellow-600" : "text-green-600"
                            }`}>
                              {m.receitaPrevista > 0 ? PCT(m.margemPct) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 text-sm">
                              {PCT(m.acumPct)}
                            </td>
                            <td className="px-4 py-3 text-right text-purple-600 text-sm">
                              {m.receitaRealizada > 0 ? BRL2(m.receitaRealizada) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white font-bold">
                        <td className="px-4 py-3 text-sm">TOTAL</td>
                        <td className="px-4 py-3 text-right text-green-300 text-sm">
                          {BRL2(totais?.totalReceitaPrevista ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-300 text-sm">
                          {BRL2(totais?.totalCustoPrevisto ?? 0)}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm ${
                          (totais?.resultadoPrevisto ?? 0) >= 0 ? "text-blue-300" : "text-red-300"
                        }`}>
                          {(totais?.resultadoPrevisto ?? 0) >= 0 ? "+" : ""}
                          {BRL2(totais?.resultadoPrevisto ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300 text-sm">
                          {PCT(margem)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-sm">100%</td>
                        <td className="px-4 py-3 text-right text-purple-300 text-sm">
                          {totais?.receitaRealizada > 0 ? BRL2(totais.receitaRealizada) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Obras summary (only when company-wide) */}
            {!selectedObra && obras.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-500" />
                    Resumo por Obra
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Obra</th>
                          <th className="text-right px-4 py-3 font-semibold text-green-700 text-xs uppercase tracking-wide">Receita Prevista</th>
                          <th className="text-right px-4 py-3 font-semibold text-orange-600 text-xs uppercase tracking-wide">Custo Previsto</th>
                          <th className="text-right px-4 py-3 font-semibold text-blue-700 text-xs uppercase tracking-wide">Resultado</th>
                          <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Margem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obras.map((o: any, i: number) => {
                          const res = o.totalReceita - o.totalCusto;
                          const mg = o.totalReceita > 0 ? (res / o.totalReceita) * 100 : 0;
                          return (
                            <tr
                              key={o.obraId}
                              className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                              onClick={() => setSelectedObra(o.obraId)}
                            >
                              <td className="px-4 py-3 font-medium text-gray-700 flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                                {o.obraNome}
                              </td>
                              <td className="px-4 py-3 text-right text-green-700">
                                {o.totalReceita > 0 ? BRL2(o.totalReceita) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-orange-600">{BRL2(o.totalCusto)}</td>
                              <td className={`px-4 py-3 text-right font-semibold ${res < 0 ? "text-red-600" : "text-blue-700"}`}>
                                {res >= 0 ? "+" : ""}{BRL2(res)}
                              </td>
                              <td className={`px-4 py-3 text-right text-sm ${mg < 0 ? "text-red-500" : mg < 10 ? "text-yellow-600" : "text-green-600"}`}>
                                {o.totalReceita > 0 ? PCT(mg) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
