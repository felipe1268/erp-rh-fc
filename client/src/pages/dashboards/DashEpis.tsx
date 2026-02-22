import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardHat, Package, AlertTriangle, ShieldAlert, TrendingUp, Users } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function DashEpis() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const { data, isLoading } = trpc.dashboards.epis.useQuery({ companyId }, { enabled: companyId > 0 });

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="text-sm text-muted-foreground hover:text-foreground">Dashboards</Link>
              <span className="text-muted-foreground">/</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard de EPIs</h1>
            <p className="text-muted-foreground text-sm mt-1">Controle de equipamentos de proteção individual</p>
          </div>
          <PrintActions title="Dashboard EPIs" />
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <DashKpi label="Itens Cadastrados" value={data.resumo.totalItens} icon={HardHat} color="blue" />
              <DashKpi label="Estoque Total" value={data.resumo.estoqueTotal} icon={Package} color="green" />
              <DashKpi label="Estoque Baixo" value={data.resumo.estoqueBaixo} icon={AlertTriangle} color="red" sub="≤ 5 unidades" />
              <DashKpi label="CA Vencido" value={data.resumo.caVencido} icon={ShieldAlert} color="orange" />
              <DashKpi label="Total Entregas" value={data.resumo.totalEntregas} icon={TrendingUp} color="purple" />
              <DashKpi label="Unidades Entregues" value={data.resumo.totalUnidadesEntregues} icon={Users} color="teal" />
            </div>

            {/* Evolução mensal de entregas */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Entregas de EPIs por Mês"
                type="bar"
                labels={data.evolucaoMensal.map(r => { const [y, m] = r.mes.split("-"); return `${m}/${y.slice(2)}`; })}
                datasets={[{ label: "Unidades", data: data.evolucaoMensal.map(r => r.qtd), backgroundColor: "#3B82F6" }]}
                height={280}
              />
            )}

            {/* Top EPIs + Top Funcionários */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.topEpis.length > 0 && (
                <DashChart
                  title="Top 10 EPIs Mais Entregues"
                  type="horizontalBar"
                  labels={data.topEpis.map(e => e.nome.length > 30 ? e.nome.slice(0, 30) + "..." : e.nome)}
                  datasets={[{ label: "Unidades", data: data.topEpis.map(e => e.qtd), backgroundColor: "#10B981" }]}
                  height={Math.max(200, data.topEpis.length * 30)}
                />
              )}
              {data.topFuncionarios.length > 0 && (
                <DashChart
                  title="Top 10 Funcionários (mais EPIs recebidos)"
                  type="horizontalBar"
                  labels={data.topFuncionarios.map(f => f.nome.length > 25 ? f.nome.slice(0, 25) + "..." : f.nome)}
                  datasets={[{ label: "Unidades", data: data.topFuncionarios.map(f => f.qtd), backgroundColor: "#8B5CF6" }]}
                  height={Math.max(200, data.topFuncionarios.length * 30)}
                />
              )}
            </div>

            {/* Estoque Crítico */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Estoque Crítico (menores estoques)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.estoqueCritico.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item com estoque crítico</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                          <th className="py-2 font-medium text-muted-foreground">Validade CA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.estoqueCritico.map((e, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.ca || "-"}</td>
                            <td className={`py-2 pr-3 text-right font-bold ${e.estoque <= 5 ? "text-red-600" : "text-foreground"}`}>{e.estoque}</td>
                            <td className={`py-2 ${e.validadeCa && e.validadeCa < new Date().toISOString().split("T")[0] ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                              {e.validadeCa ? new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CAs Vencidos */}
            {data.caVencidos.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-orange-500" />
                    Certificados de Aprovação Vencidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 font-medium text-muted-foreground">Vencimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.caVencidos.map((e, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.ca || "-"}</td>
                            <td className="py-2 text-red-600 font-semibold">
                              {e.validadeCa ? new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
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
