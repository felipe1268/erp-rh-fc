import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Building2, CheckCircle2 } from "lucide-react";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const fmtSemana = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}`;
};

export default function PrevisaoCaixa() {
  const { companyId } = useCompany();
  const [obraId, setObraId] = useState<string>("todos");

  const { data: obrasData = [] } = trpc.obras.list.useQuery({ companyId }, { enabled: companyId > 0 });

  const { data, isLoading } = trpc.terceiroContratos.previsaoCaixa.useQuery(
    { companyId, obraId: obraId !== "todos" ? parseInt(obraId) : undefined },
    { enabled: companyId > 0 }
  );

  const semanas = data?.semanas || [];
  const maxVal = Math.max(...semanas.map(s => Math.max(s.previsto, s.realizado)), 1);
  const totalPrevisto = data?.totalPrevisto || 0;
  const totalRealizado = data?.totalRealizado || 0;
  const variacao = totalPrevisto > 0 ? ((totalRealizado - totalPrevisto) / totalPrevisto) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de Caixa — Terceiros</h1>
            <p className="text-sm text-gray-500">Fluxo de pagamentos previsto (cronograma) vs realizado (medições aprovadas)</p>
          </div>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as obras</SelectItem>
              {obrasData.map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-xs text-gray-500">Total Previsto</p>
              <p className="text-lg font-bold text-gray-900">{BRL(totalPrevisto)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-xs text-gray-500">Total Realizado</p>
              <p className="text-lg font-bold text-emerald-700">{BRL(totalRealizado)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${variacao > 0 ? "bg-red-500" : variacao < 0 ? "bg-amber-500" : "bg-gray-400"} rounded-lg flex items-center justify-center`}>
              {variacao >= 0 ? <TrendingUp className="w-5 h-5 text-white" /> : <TrendingDown className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className="text-xs text-gray-500">Variação</p>
              <p className={`text-lg font-bold ${variacao > 0 ? "text-red-600" : variacao < 0 ? "text-amber-600" : "text-gray-600"}`}>
                {variacao > 0 ? "+" : ""}{variacao.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-xs text-gray-500">Contratos Ativos</p>
              <p className="text-lg font-bold text-gray-900">{data?.contratos?.length || 0}</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Calculando previsão...</div>
        ) : semanas.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sem dados de previsão</p>
            <p className="text-sm">Vincule os itens dos contratos a atividades do planejamento para gerar a previsão</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" /> Fluxo Semanal — Previsto vs Realizado
              </h3>
              <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-400 rounded-sm inline-block" /> Previsto</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block" /> Realizado</span>
              </div>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-2 min-w-max pb-2" style={{ height: 200 }}>
                  {semanas.map((s, i) => {
                    const hPrev = Math.max((s.previsto / maxVal) * 160, 2);
                    const hReal = Math.max((s.realizado / maxVal) * 160, s.realizado > 0 ? 4 : 0);
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 56 }}>
                        <span className="text-[10px] text-gray-500 font-medium leading-tight text-center">
                          {s.previsto > 0 || s.realizado > 0
                            ? BRL(Math.max(s.previsto, s.realizado)).replace("R$\u00a0", "")
                            : ""}
                        </span>
                        <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 160 }}>
                          <div
                            className="w-[42%] bg-blue-400 rounded-t transition-all hover:bg-blue-500"
                            style={{ height: hPrev }}
                            title={`Previsto: ${BRL(s.previsto)}`}
                          />
                          <div
                            className="w-[42%] bg-emerald-500 rounded-t transition-all hover:bg-emerald-600"
                            style={{ height: hReal }}
                            title={`Realizado: ${BRL(s.realizado)}`}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400">{fmtSemana(s.semana)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Semana (início)</th>
                    <th className="px-4 py-2 text-right">Previsto</th>
                    <th className="px-4 py-2 text-right">Realizado</th>
                    <th className="px-4 py-2 text-right">Diferença</th>
                    <th className="px-4 py-2 text-left">Comparação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {semanas.map((s, i) => {
                    const diff = s.realizado - s.previsto;
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-700">{s.semana}</td>
                        <td className="px-4 py-2 text-right font-semibold text-blue-700">{BRL(s.previsto)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{BRL(s.realizado)}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${diff > 0 ? "text-red-600" : diff < 0 ? "text-amber-600" : "text-gray-400"}`}>
                          {diff !== 0 ? `${diff > 0 ? "+" : ""}${BRL(diff)}` : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <div className="h-2 bg-gray-100 rounded-full flex-1 max-w-32 relative overflow-hidden">
                              <div className="absolute h-full bg-blue-300 rounded-full" style={{ width: `${(s.previsto / maxVal) * 100}%` }} />
                              <div className="absolute h-full bg-emerald-500 rounded-full opacity-70" style={{ width: `${(s.realizado / maxVal) * 100}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2 text-gray-700">Total</td>
                    <td className="px-4 py-2 text-right text-blue-700">{BRL(totalPrevisto)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{BRL(totalRealizado)}</td>
                    <td className={`px-4 py-2 text-right ${totalRealizado - totalPrevisto > 0 ? "text-red-600" : totalRealizado - totalPrevisto < 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {totalRealizado - totalPrevisto !== 0
                        ? `${totalRealizado - totalPrevisto > 0 ? "+" : ""}${BRL(totalRealizado - totalPrevisto)}`
                        : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {data?.contratos && data.contratos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">Contratos Incluídos</h3>
                <div className="space-y-2">
                  {data.contratos.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{c.descricao}</span>
                        <span className="text-gray-400 ml-2 text-xs">{c.empresaNome}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">{BRL(c.valorTotal)}</span>
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
