import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, DollarSign, Calendar, Building2 } from "lucide-react";

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
  const maxVal = Math.max(...semanas.map(s => s.valor), 1);

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de Caixa — Terceiros</h1>
            <p className="text-sm text-gray-500">Fluxo de pagamentos previsto com base no cronograma de planejamento</p>
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

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center"><DollarSign className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-xs text-gray-500">Total Previsto</p>
              <p className="text-lg font-bold text-gray-900">{BRL(data?.totalPrevisto || 0)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-xs text-gray-500">Contratos Ativos</p>
              <p className="text-lg font-bold text-gray-900">{data?.contratos?.length || 0}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center"><Calendar className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-xs text-gray-500">Semanas com Pagamento</p>
              <p className="text-lg font-bold text-gray-900">{semanas.filter(s => s.valor > 0).length}</p>
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
            {/* Gráfico de barras */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" /> Fluxo Semanal Previsto
              </h3>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-2 min-w-max pb-2" style={{ height: 180 }}>
                  {semanas.map((s, i) => {
                    const h = Math.max((s.valor / maxVal) * 150, 4);
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 48 }}>
                        <span className="text-xs text-gray-500 font-medium">{BRL(s.valor).replace("R$\u00a0", "")}</span>
                        <div
                          className="w-full bg-blue-500 rounded-t-md transition-all hover:bg-blue-600"
                          style={{ height: h }}
                          title={`Semana ${s.semana}: ${BRL(s.valor)}`}
                        />
                        <span className="text-xs text-gray-400">{fmtSemana(s.semana)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tabela detalhada */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Semana (início)</th>
                    <th className="px-4 py-2 text-right">Valor Previsto</th>
                    <th className="px-4 py-2 text-left">Proporção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {semanas.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-700">{s.semana}</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900">{BRL(s.valor)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-gray-100 rounded-full flex-1 max-w-32">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(s.valor / maxVal) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{data?.totalPrevisto ? ((s.valor / data.totalPrevisto) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2 text-gray-700">Total</td>
                    <td className="px-4 py-2 text-right text-blue-700">{BRL(data?.totalPrevisto || 0)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Contratos ativos */}
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
