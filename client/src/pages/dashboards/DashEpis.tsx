import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  HardHat, Package, AlertTriangle, ShieldAlert, TrendingUp, Users,
  DollarSign, Calendar, Building2, ClipboardList, Loader2, ArrowRight,
  Shirt, Footprints, Shield
} from "lucide-react";
import { Link } from "wouter";

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
            <p className="text-muted-foreground text-sm mt-1">Controle completo de equipamentos de proteção individual</p>
          </div>
          <PrintActions title="Dashboard EPIs" />
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* ============================================================ */}
            {/* KPIs PRINCIPAIS */}
            {/* ============================================================ */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <DashKpi label="Itens Cadastrados" value={data.resumo.totalItens} icon={HardHat} color="blue" />
              <DashKpi label="Estoque Total" value={data.resumo.estoqueTotal} icon={Package} color="green" sub="unidades em estoque" />
              <DashKpi label="Valor Inventário" value={fmtBRL(data.resumo.valorTotalInventario || 0)} icon={DollarSign} color="teal" />
              <DashKpi label="Entregas (30d)" value={data.resumo.entregasMes || 0} icon={ClipboardList} color="purple" sub="últimos 30 dias" />
            </div>

            {/* KPIs ALERTAS */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <DashKpi label="Estoque Baixo" value={data.resumo.estoqueBaixo} icon={AlertTriangle} color="red" sub="≤ 5 unidades" />
              <DashKpi label="CA Vencido" value={data.resumo.caVencido} icon={ShieldAlert} color="orange" />
              <DashKpi label="CA Vencendo (90d)" value={data.resumo.casVencendoCount || 0} icon={Calendar} color="yellow" sub="próximos 90 dias" />
              <DashKpi label="Total Entregas" value={data.resumo.totalEntregas} icon={TrendingUp} color="indigo" />
              <DashKpi label="Funcionários Atendidos" value={data.resumo.funcUnicos || 0} icon={Users} color="slate" />
            </div>

            {/* Descontos pendentes */}
            {(data.resumo.alertasPendentes || 0) > 0 && (
              <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800">
                      {data.resumo.alertasPendentes} alerta(s) de desconto pendente(s)
                    </p>
                    <p className="text-sm text-amber-700">
                      Valor total: {fmtBRL(data.resumo.valorDescontosPendentes || 0)} — Valide em EPIs &gt; Entregas
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 1: Consumo Mensal + Distribuição por Categoria */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashChart
                  title="Consumo Mensal de EPIs (últimos 12 meses)"
                  type="bar"
                  labels={data.consumoMensal?.map((r: any) => r.mes) || []}
                  datasets={[
                    { label: "Unidades", data: data.consumoMensal?.map((r: any) => r.unidades) || [], backgroundColor: "#3B82F6" },
                    { label: "Entregas", data: data.consumoMensal?.map((r: any) => r.entregas) || [], backgroundColor: "#93C5FD" },
                  ]}
                  height={280}
                />
              </div>
              <div>
                {data.porCategoria && Object.keys(data.porCategoria).length > 0 ? (
                  <DashChart
                    title="Distribuição por Categoria"
                    type="doughnut"
                    labels={Object.keys(data.porCategoria)}
                    datasets={[{
                      label: "Itens",
                      data: Object.values(data.porCategoria).map((c: any) => c.itens),
                      backgroundColor: ["#10B981", "#6366F1", "#F59E0B", "#EF4444"],
                    }]}
                    height={280}
                  />
                ) : (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Categoria</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                      Nenhum dado disponível
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 2: Top EPIs + Top Funcionários */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.topEpis?.length > 0 && (
                <DashChart
                  title="Top 10 EPIs Mais Entregues"
                  type="horizontalBar"
                  labels={data.topEpis.map((e: any) => e.nome.length > 30 ? e.nome.slice(0, 30) + "..." : e.nome)}
                  datasets={[{ label: "Unidades", data: data.topEpis.map((e: any) => e.qtd), backgroundColor: "#10B981" }]}
                  height={Math.max(220, data.topEpis.length * 28)}
                />
              )}
              {data.topFuncionarios?.length > 0 && (
                <DashChart
                  title="Top 10 Funcionários (mais EPIs recebidos)"
                  type="horizontalBar"
                  labels={data.topFuncionarios.map((f: any) => f.nome.length > 25 ? f.nome.slice(0, 25) + "..." : f.nome)}
                  datasets={[{ label: "Unidades", data: data.topFuncionarios.map((f: any) => f.qtd), backgroundColor: "#8B5CF6" }]}
                  height={Math.max(220, data.topFuncionarios.length * 28)}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 3: Custo por Obra + Motivo de Troca */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.custoPorObraList?.length > 0 && (
                <DashChart
                  title="Entregas por Obra"
                  type="horizontalBar"
                  labels={data.custoPorObraList.map((o: any) => o.nome.length > 30 ? o.nome.slice(0, 30) + "..." : o.nome)}
                  datasets={[{ label: "Unidades", data: data.custoPorObraList.map((o: any) => o.unidades), backgroundColor: "#F59E0B" }]}
                  height={Math.max(200, data.custoPorObraList.length * 30)}
                />
              )}
              {data.porMotivo && Object.keys(data.porMotivo).length > 0 && (
                <DashChart
                  title="Entregas por Motivo"
                  type="doughnut"
                  labels={Object.keys(data.porMotivo)}
                  datasets={[{
                    label: "Entregas",
                    data: Object.values(data.porMotivo) as number[],
                    backgroundColor: ["#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"],
                  }]}
                  height={260}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* TABELA: Distribuição por Categoria (detalhada) */}
            {/* ============================================================ */}
            {data.porCategoria && Object.keys(data.porCategoria).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    Resumo por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Categoria</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Itens</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.porCategoria).map(([cat, vals]: [string, any]) => (
                          <tr key={cat} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium flex items-center gap-2">
                              {cat === 'EPI' && <Shield className="h-4 w-4 text-emerald-500" />}
                              {cat === 'Uniforme' && <Shirt className="h-4 w-4 text-indigo-500" />}
                              {cat === 'Calçado' && <Footprints className="h-4 w-4 text-amber-500" />}
                              {cat}
                            </td>
                            <td className="py-2 pr-3 text-right">{vals.itens}</td>
                            <td className="py-2 pr-3 text-right">{vals.estoque}</td>
                            <td className="py-2 text-right font-medium">{fmtBRL(vals.valor)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 font-bold">
                          <td className="py-2 pr-3">Total</td>
                          <td className="py-2 pr-3 text-right">{Object.values(data.porCategoria).reduce((s: number, v: any) => s + v.itens, 0)}</td>
                          <td className="py-2 pr-3 text-right">{Object.values(data.porCategoria).reduce((s: number, v: any) => s + v.estoque, 0)}</td>
                          <td className="py-2 text-right">{fmtBRL(Object.values(data.porCategoria).reduce((s: number, v: any) => s + v.valor, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: CAs Vencendo nos próximos 90 dias */}
            {/* ============================================================ */}
            {data.casVencendo?.length > 0 && (
              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-yellow-500" />
                    CAs Vencendo nos Próximos 90 Dias ({data.casVencendo.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Vencimento</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.casVencendo.map((e: any, i: number) => {
                          const dias = Math.ceil((new Date(e.validadeCa + "T00:00:00").getTime() - Date.now()) / 86400000);
                          return (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-2 pr-3 font-medium">{e.nome}</td>
                              <td className="py-2 pr-3"><Badge variant="outline">{e.ca}</Badge></td>
                              <td className="py-2 pr-3">
                                <span className={dias <= 30 ? "text-red-600 font-semibold" : dias <= 60 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                                  {new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">({dias}d)</span>
                              </td>
                              <td className="py-2 text-right">{e.estoque}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: Estoque Crítico */}
            {/* ============================================================ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Estoque Crítico (menores estoques)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.estoqueCritico?.length === 0 ? (
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
                        {data.estoqueCritico?.map((e: any, i: number) => (
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

            {/* ============================================================ */}
            {/* TABELA: CAs Vencidos */}
            {/* ============================================================ */}
            {data.caVencidos?.length > 0 && (
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                    Certificados de Aprovação Vencidos ({data.caVencidos.length})
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
                        {data.caVencidos.map((e: any, i: number) => (
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

            {/* ============================================================ */}
            {/* TABELA: Entregas por Obra (detalhada) */}
            {/* ============================================================ */}
            {data.custoPorObraList?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    Entregas por Obra (detalhado)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Obra</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Entregas</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.custoPorObraList.map((o: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{o.nome}</td>
                            <td className="py-2 pr-3 text-right">{o.entregas}</td>
                            <td className="py-2 text-right font-bold">{o.unidades}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 font-bold">
                          <td className="py-2 pr-3">Total</td>
                          <td className="py-2 pr-3 text-right">{data.custoPorObraList.reduce((s: number, o: any) => s + o.entregas, 0)}</td>
                          <td className="py-2 text-right">{data.custoPorObraList.reduce((s: number, o: any) => s + o.unidades, 0)}</td>
                        </tr>
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
