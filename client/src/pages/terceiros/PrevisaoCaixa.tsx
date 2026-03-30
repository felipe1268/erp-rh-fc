import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, Building2, CheckCircle2, BarChart3 } from "lucide-react";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const BRLShort = (v: number) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
};
const fmtSemana = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}`;
};
const fmtSemanaFull = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export default function PrevisaoCaixa() {
  const { companyId } = useCompany();
  const [obraId, setObraId] = useState<string>("todos");
  const [showPrevisto, setShowPrevisto] = useState(true);
  const [showRealizado, setShowRealizado] = useState(true);

  const { data: obrasData = [] } = trpc.obras.list.useQuery({ companyId }, { enabled: companyId > 0 });

  const { data, isLoading } = trpc.terceiroContratos.previsaoCaixa.useQuery(
    { companyId, obraId: obraId !== "todos" ? parseInt(obraId) : undefined },
    { enabled: companyId > 0 }
  );

  const semanas = data?.semanas || [];
  const maxVal = Math.max(...semanas.map(s => Math.max(showPrevisto ? s.previsto : 0, showRealizado ? s.realizado : 0)), 1);
  const totalPrevisto = data?.totalPrevisto || 0;
  const totalRealizado = data?.totalRealizado || 0;
  const variacao = totalPrevisto > 0 ? ((totalRealizado - totalPrevisto) / totalPrevisto) * 100 : 0;

  const ySteps = 5;
  const yMax = Math.ceil(maxVal / Math.pow(10, Math.floor(Math.log10(maxVal)))) * Math.pow(10, Math.floor(Math.log10(maxVal)));
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => (yMax / ySteps) * i);

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de Caixa</h1>
            <p className="text-sm text-gray-500">Previsto (cronograma) vs Realizado (medições) — Contratos de Terceiros</p>
          </div>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as obras</SelectItem>
              {obrasData.map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard icon={<DollarSign className="w-5 h-5 text-white" />} bg="bg-blue-500" label="Total Previsto" value={BRL(totalPrevisto)} color="text-gray-900" />
          <KPICard icon={<CheckCircle2 className="w-5 h-5 text-white" />} bg="bg-emerald-500" label="Total Realizado" value={BRL(totalRealizado)} color="text-emerald-700" />
          <KPICard
            icon={variacao >= 0 ? <TrendingUp className="w-5 h-5 text-white" /> : <TrendingDown className="w-5 h-5 text-white" />}
            bg={variacao > 0 ? "bg-red-500" : variacao < 0 ? "bg-amber-500" : "bg-gray-400"}
            label="Variação"
            value={`${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%`}
            color={variacao > 0 ? "text-red-600" : variacao < 0 ? "text-amber-600" : "text-gray-600"}
          />
          <KPICard icon={<Building2 className="w-5 h-5 text-white" />} bg="bg-indigo-500" label="Contratos Ativos" value={String(data?.contratos?.length || 0)} color="text-gray-900" />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Calculando previsão...</div>
        ) : semanas.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sem dados de previsão</p>
            <p className="text-sm">Vincule os itens dos contratos a atividades do planejamento para gerar a previsão</p>
          </div>
        ) : (
          <>
            {/* CHART */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" /> Fluxo Semanal — Previsto vs Realizado
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <button
                    onClick={() => setShowPrevisto(p => !p)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${showPrevisto ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-400 line-through opacity-60 hover:opacity-80"}`}
                  >
                    <span className={`w-3 h-3 rounded-sm inline-block ${showPrevisto ? "bg-blue-500" : "bg-gray-300"}`} /> Previsto
                  </button>
                  <button
                    onClick={() => setShowRealizado(r => !r)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${showRealizado ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-400 line-through opacity-60 hover:opacity-80"}`}
                  >
                    <span className={`w-3 h-3 rounded-sm inline-block ${showRealizado ? "bg-emerald-500" : "bg-gray-300"}`} /> Realizado
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-max">
                  {/* Y-axis + Bars */}
                  <div className="flex">
                    {/* Y-axis labels */}
                    <div className="flex flex-col-reverse justify-between pr-2 text-right" style={{ height: 220, width: 60 }}>
                      {yLabels.map((v, i) => (
                        <span key={i} className="text-[10px] text-gray-400 leading-none">{BRLShort(v)}</span>
                      ))}
                    </div>

                    {/* Chart area */}
                    <div className="flex-1 relative" style={{ height: 220 }}>
                      {/* Grid lines */}
                      {yLabels.map((_, i) => (
                        <div key={i} className="absolute w-full border-t border-gray-100" style={{ bottom: `${(i / ySteps) * 100}%` }} />
                      ))}

                      {/* Bars */}
                      <div className="relative flex items-end h-full gap-1 px-1">
                        {semanas.map((s, i) => {
                          const barW = Math.max(Math.min(800 / semanas.length, 40), 16);
                          const hPrev = (s.previsto / yMax) * 100;
                          const hReal = (s.realizado / yMax) * 100;
                          return (
                            <div key={i} className="flex flex-col items-center flex-shrink-0 group" style={{ width: barW + 8 }}>
                              <div className="flex items-end gap-px w-full justify-center" style={{ height: 210 }}>
                                {showPrevisto && (
                                  <div
                                    className="rounded-t bg-blue-500 hover:bg-blue-600 transition-all relative"
                                    style={{ height: `${Math.max(hPrev, 0.5)}%`, width: showRealizado ? barW / 2 : barW * 0.7 }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                      P: {BRL(s.previsto)}
                                    </div>
                                  </div>
                                )}
                                {showRealizado && (
                                  <div
                                    className="rounded-t bg-emerald-500 hover:bg-emerald-600 transition-all relative"
                                    style={{ height: `${Math.max(hReal, s.realizado > 0 ? 1 : 0)}%`, width: showPrevisto ? barW / 2 : barW * 0.7 }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                      R: {BRL(s.realizado)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* X-axis labels */}
                  <div className="flex" style={{ marginLeft: 62 }}>
                    {semanas.map((s, i) => {
                      const barW = Math.max(Math.min(800 / semanas.length, 40), 16);
                      return (
                        <div key={i} className="text-center flex-shrink-0" style={{ width: barW + 8 + 1 }}>
                          <span className="text-[10px] text-gray-400 block mt-1">{fmtSemana(s.semana)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Semana</th>
                      <th className="px-4 py-3 text-right font-medium">Previsto</th>
                      <th className="px-4 py-3 text-right font-medium">Realizado</th>
                      <th className="px-4 py-3 text-right font-medium">Diferença</th>
                      <th className="px-4 py-3 text-center font-medium w-40">Comparação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {semanas.map((s, i) => {
                      const diff = s.realizado - s.previsto;
                      const pctPrev = (s.previsto / maxVal) * 100;
                      const pctReal = (s.realizado / maxVal) * 100;
                      return (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-gray-700 text-xs">{fmtSemanaFull(s.semana)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{BRL(s.previsto)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{BRL(s.realizado)}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-gray-300"}`}>
                            {diff !== 0 ? `${diff > 0 ? "+" : ""}${BRL(diff)}` : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 justify-center">
                              <div className="h-3 bg-gray-100 rounded-full flex-1 max-w-36 relative overflow-hidden">
                                <div className="absolute h-full bg-blue-400/60 rounded-full transition-all" style={{ width: `${pctPrev}%` }} />
                                <div className="absolute h-full bg-emerald-500/80 rounded-full transition-all" style={{ width: `${pctReal}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr className="font-bold">
                      <td className="px-4 py-3 text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right text-blue-700">{BRL(totalPrevisto)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{BRL(totalRealizado)}</td>
                      <td className={`px-4 py-3 text-right ${totalRealizado - totalPrevisto > 0 ? "text-green-600" : totalRealizado - totalPrevisto < 0 ? "text-red-500" : "text-gray-400"}`}>
                        {totalRealizado - totalPrevisto !== 0
                          ? `${totalRealizado - totalPrevisto > 0 ? "+" : ""}${BRL(totalRealizado - totalPrevisto)}`
                          : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* CONTRATOS */}
            {data?.contratos && data.contratos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500" /> Contratos Incluídos
                </h3>
                <div className="space-y-2">
                  {data.contratos.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 truncate">{c.descricao}</span>
                        <span className="text-gray-400 text-xs flex-shrink-0">{c.empresaNome}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <span className="font-semibold text-gray-900">{BRL(c.valorTotal)}</span>
                        <span className="text-gray-400 text-xs ml-2">{(c.percentualPago || 0).toFixed(0)}% pago</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function KPICard({ icon, bg, label, value, color }: { icon: React.ReactNode; bg: string; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
      </div>
    </div>
  );
}
