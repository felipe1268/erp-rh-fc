import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Truck, Wrench, Fuel, AlertTriangle, DollarSign, TrendingDown, Gauge,
  BarChart3, Shield, Receipt, FileText, RefreshCw, AlertCircle, Info,
  CheckCircle2, Calendar, MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

type AlertFilter = "todos" | "critico" | "alerta" | "info";

export default function PainelFrotas() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("todos");

  const initMut = trpc.frotas.initTables.useMutation();
  const dash = trpc.frotas.getDashboard.useQuery(
    { companyId: cId },
    { enabled: cId > 0, retry: 1 },
  );

  useEffect(() => {
    if (cId > 0) initMut.mutate();
  }, [cId]);

  const d = dash.data;

  const filteredAlertas = d?.alertas?.filter((a: any) =>
    alertFilter === "todos" ? true : a.urgencia === alertFilter
  ) || [];

  const alertasByTipo: Record<string, any[]> = {};
  for (const a of filteredAlertas) {
    if (!alertasByTipo[a.tipo]) alertasByTipo[a.tipo] = [];
    alertasByTipo[a.tipo].push(a);
  }

  const tipoLabels: Record<string, { label: string; icon: any; color: string }> = {
    crlv: { label: "CRLV", icon: FileText, color: "text-blue-600" },
    seguro: { label: "Seguro (veículo)", icon: Shield, color: "text-emerald-600" },
    seguro_apolice: { label: "Apólice de Seguro", icon: Shield, color: "text-emerald-600" },
    manutencao: { label: "Manutenção", icon: Wrench, color: "text-orange-600" },
    multa: { label: "Multas", icon: AlertTriangle, color: "text-red-600" },
    ipva: { label: "IPVA", icon: Receipt, color: "text-purple-600" },
    licenciamento: { label: "Licenciamento", icon: Calendar, color: "text-indigo-600" },
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6 text-cyan-600" /> Controle de Frotas
            </h1>
            <p className="text-muted-foreground text-sm">
              Visão consolidada da frota, custos, obrigações e alertas
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => dash.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>

        {dash.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-cyan-600 border-t-transparent rounded-full" />
          </div>
        ) : !d ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum dado disponível
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
              <KpiCard icon={Truck} label="Veículos" value={d.totalVehicles} onClick={() => navigate("/frotas/veiculos")} color="text-cyan-600" bg="bg-cyan-50" />
              <KpiCard icon={DollarSign} label="Valor FIPE" value={fmt(d.totalFipe)} color="text-green-600" bg="bg-green-50" />
              <KpiCard icon={TrendingDown} label="Depreciação" value={fmt(d.depreciacao)} color="text-red-600" bg="bg-red-50" />
              <KpiCard icon={Wrench} label="Manutenção" value={fmt(d.totalManutCusto)} onClick={() => navigate("/frotas/manutencoes")} color="text-orange-600" bg="bg-orange-50" />
              <KpiCard icon={Fuel} label="Combustível" value={fmt(d.totalCombustivel)} onClick={() => navigate("/frotas/combustivel")} color="text-amber-600" bg="bg-amber-50" />
              <KpiCard icon={Gauge} label="Consumo Médio" value={d.consumoMedio > 0 ? `${d.consumoMedio.toFixed(1)} km/l` : "—"} color="text-blue-600" bg="bg-blue-50" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon={AlertTriangle} label="Multas Pendentes" value={d.multasPendentes} onClick={() => navigate("/frotas/multas")} color="text-red-600" bg="bg-red-50" sub={d.totalMultas > 0 ? `Total: ${fmt(d.totalMultas)}` : undefined} />
              <KpiCard icon={Receipt} label="IPVA Pendente" value={fmt(d.totalIpvaPendente)} onClick={() => navigate("/frotas/ipva")} color="text-purple-600" bg="bg-purple-50" />
              <KpiCard icon={Shield} label="Seguros" value="Ver" onClick={() => navigate("/frotas/seguros")} color="text-emerald-600" bg="bg-emerald-50" />
              <KpiCard icon={MapPin} label="Rastreamento" value="Ver" onClick={() => navigate("/frotas/rastreamento")} color="text-indigo-600" bg="bg-indigo-50" />
            </div>

            {d.alertas.length > 0 && (
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      Central de Alertas
                      <Badge variant="outline" className="ml-2">
                        {d.alertas.length} {d.alertas.length === 1 ? "alerta" : "alertas"}
                      </Badge>
                    </CardTitle>
                    <div className="flex gap-1.5">
                      <FilterBtn active={alertFilter === "todos"} onClick={() => setAlertFilter("todos")} label="Todos" count={d.alertas.length} />
                      {d.alertasCriticos > 0 && (
                        <FilterBtn active={alertFilter === "critico"} onClick={() => setAlertFilter("critico")} label="Vencidos" count={d.alertasCriticos} color="bg-red-100 text-red-700 border-red-200" />
                      )}
                      {d.alertasAlerta > 0 && (
                        <FilterBtn active={alertFilter === "alerta"} onClick={() => setAlertFilter("alerta")} label="Próximos" count={d.alertasAlerta} color="bg-amber-100 text-amber-700 border-amber-200" />
                      )}
                      {d.alertasInfo > 0 && (
                        <FilterBtn active={alertFilter === "info"} onClick={() => setAlertFilter("info")} label="Pendentes" count={d.alertasInfo} color="bg-blue-100 text-blue-700 border-blue-200" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {d.alertasCriticos > 0 && alertFilter === "todos" && (
                    <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <span className="text-sm text-red-700 font-medium">
                        {d.alertasCriticos} {d.alertasCriticos === 1 ? "item vencido" : "itens vencidos"} — ação imediata necessária!
                      </span>
                    </div>
                  )}
                  <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {Object.entries(alertasByTipo)
                      .sort(([, a], [, b]) => {
                        const criticos = (arr: any[]) => arr.filter(x => x.urgencia === "critico").length;
                        return criticos(b) - criticos(a);
                      })
                      .map(([tipo, items]) => {
                        const info = tipoLabels[tipo] || { label: tipo, icon: AlertTriangle, color: "text-gray-600" };
                        const Icon = info.icon;
                        return (
                          <div key={tipo} className="space-y-1.5">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{info.label}</span>
                              <Badge variant="outline" className="text-[10px] h-4">{items.length}</Badge>
                            </div>
                            {items.map((a: any, i: number) => (
                              <div
                                key={i}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                  a.urgencia === "critico" ? "bg-red-50 border border-red-200" :
                                  a.urgencia === "alerta" ? "bg-amber-50 border border-amber-200" :
                                  "bg-blue-50 border border-blue-100"
                                }`}
                              >
                                {a.urgencia === "critico" ? <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> :
                                 a.urgencia === "alerta" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> :
                                 <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                                <Badge
                                  className={`text-[9px] shrink-0 ${
                                    a.urgencia === "critico" ? "bg-red-600 text-white" :
                                    a.urgencia === "alerta" ? "bg-amber-500 text-white" :
                                    "bg-blue-500 text-white"
                                  }`}
                                >
                                  {a.urgencia === "critico" ? "VENCIDO" : a.urgencia === "alerta" ? "EM BREVE" : "PENDENTE"}
                                </Badge>
                                {a.placa && <span className="font-bold text-slate-700">{a.placa}</span>}
                                <span className="text-slate-600 flex-1">{a.msg}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Composição por Tipo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(d.tipoCount).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sem dados</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(d.tipoCount)
                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                        .map(([tipo, count]) => (
                          <div key={tipo} className="flex items-center justify-between">
                            <span className="text-sm">{tipo}</span>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 bg-cyan-500 rounded-full"
                                style={{ width: `${Math.max(20, ((count as number) / d.totalVehicles) * 200)}px` }}
                              />
                              <span className="text-sm font-semibold w-8 text-right">{count as number}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Composição por Marca
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(d.marcaCount).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sem dados</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(d.marcaCount)
                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                        .slice(0, 10)
                        .map(([marca, count]) => (
                          <div key={marca} className="flex items-center justify-between">
                            <span className="text-sm">{marca}</span>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 bg-indigo-500 rounded-full"
                                style={{ width: `${Math.max(20, ((count as number) / d.totalVehicles) * 200)}px` }}
                              />
                              <span className="text-sm font-semibold w-8 text-right">{count as number}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> Patrimônio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Valor de Compra (total)</span>
                    <span className="font-semibold">{fmt(d.totalCompra)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Valor FIPE (total)</span>
                    <span className="font-semibold text-green-600">{fmt(d.totalFipe)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Depreciação acumulada</span>
                    <span className="font-semibold text-red-600">{fmt(d.depreciacao)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Valor contábil estimado</span>
                    <span className="font-semibold">{fmt(d.totalCompra - d.depreciacao)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm text-muted-foreground">Custo total (manut + comb)</span>
                    <span className="font-semibold text-orange-600">{fmt(d.totalManutCusto + d.totalCombustivel)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Custo por km</span>
                    <span className="font-semibold">{d.custoKm > 0 ? `R$ ${d.custoKm.toFixed(2)}/km` : "—"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> Resumo de Obrigações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ObrigacaoRow label="Multas pendentes" value={d.multasPendentes} total={fmt(d.totalMultas)} onClick={() => navigate("/frotas/multas")} />
                  <ObrigacaoRow label="IPVA pendente" value={null} total={fmt(d.totalIpvaPendente)} onClick={() => navigate("/frotas/ipva")} />
                  <ObrigacaoRow label="Em manutenção" value={d.veiculosEmManutencao} onClick={() => navigate("/frotas/manutencoes")} />
                  <div className="border-t pt-2 flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Alertas ativos</span>
                    <div className="flex gap-1.5">
                      {d.alertasCriticos > 0 && <Badge className="bg-red-600 text-white text-[10px]">{d.alertasCriticos} vencidos</Badge>}
                      {d.alertasAlerta > 0 && <Badge className="bg-amber-500 text-white text-[10px]">{d.alertasAlerta} próximos</Badge>}
                      {d.alertasInfo > 0 && <Badge className="bg-blue-500 text-white text-[10px]">{d.alertasInfo} pendentes</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Custos de Combustível por Mês</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(d.fuelByMonth).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sem dados</p>
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(d.fuelByMonth)
                        .sort()
                        .slice(-12)
                        .map(([m, v]) => {
                          const max = Math.max(...Object.values(d.fuelByMonth) as number[]);
                          return (
                            <div key={m} className="flex items-center gap-2">
                              <span className="text-xs w-16 text-muted-foreground">{m}</span>
                              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${((v as number) / max) * 100}%` }} />
                              </div>
                              <span className="text-xs font-medium w-20 text-right">{fmt(v as number)}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Custos de Manutenção por Mês</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(d.maintByMonth).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sem dados</p>
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(d.maintByMonth)
                        .sort()
                        .slice(-12)
                        .map(([m, v]) => {
                          const max = Math.max(...Object.values(d.maintByMonth) as number[]);
                          return (
                            <div key={m} className="flex items-center gap-2">
                              <span className="text-xs w-16 text-muted-foreground">{m}</span>
                              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${((v as number) / max) * 100}%` }} />
                              </div>
                              <span className="text-xs font-medium w-20 text-right">{fmt(v as number)}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {d.depreciacaoPorVeiculo && d.depreciacaoPorVeiculo.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" /> Depreciação por Veículo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-1 font-semibold">Veículo</th>
                          <th className="py-2 px-1 font-semibold text-center">Ano</th>
                          <th className="py-2 px-1 font-semibold text-center">Idade</th>
                          <th className="py-2 px-1 font-semibold text-right">Valor Compra</th>
                          <th className="py-2 px-1 font-semibold text-right">Valor FIPE</th>
                          <th className="py-2 px-1 font-semibold text-right">Dep. Anual</th>
                          <th className="py-2 px-1 font-semibold text-right">Dep. Acumulada</th>
                          <th className="py-2 px-1 font-semibold text-right">Valor Contábil</th>
                          <th className="py-2 px-1 font-semibold text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.depreciacaoPorVeiculo.map((v: any) => (
                          <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 px-1">
                              <div className="font-medium">{v.placa || "—"}</div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{v.modelo}</div>
                            </td>
                            <td className="py-2 px-1 text-center">{v.anoFab}</td>
                            <td className="py-2 px-1 text-center">{v.idadeAnos}a</td>
                            <td className="py-2 px-1 text-right">{fmt(v.valorCompra)}</td>
                            <td className="py-2 px-1 text-right text-green-600">{fmt(v.valorFipe)}</td>
                            <td className="py-2 px-1 text-right text-muted-foreground">{fmt(v.deprecAnual)}/ano</td>
                            <td className="py-2 px-1 text-right text-red-600 font-medium">{fmt(v.deprecAcumulada)}</td>
                            <td className="py-2 px-1 text-right font-semibold">{fmt(v.valorContabil)}</td>
                            <td className="py-2 px-1 text-center">
                              <Badge className={`text-[9px] ${
                                v.statusDep === 'totalmente' ? 'bg-red-100 text-red-700 hover:bg-red-100' :
                                v.statusDep === 'quase' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' :
                                'bg-green-100 text-green-700 hover:bg-green-100'
                              }`}>
                                {v.statusDep === 'totalmente' ? '100%' : v.statusDep === 'quase' ? '>80%' : 'Parcial'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-semibold">
                          <td className="py-2 px-1" colSpan={3}>TOTAL ({d.depreciacaoPorVeiculo.length} veículos)</td>
                          <td className="py-2 px-1 text-right">{fmt(d.totalCompra)}</td>
                          <td className="py-2 px-1 text-right text-green-600">{fmt(d.totalFipe)}</td>
                          <td className="py-2 px-1 text-right text-muted-foreground">—</td>
                          <td className="py-2 px-1 text-right text-red-600">{fmt(d.depreciacao)}</td>
                          <td className="py-2 px-1 text-right">{fmt(d.totalCompra - d.depreciacao)}</td>
                          <td className="py-2 px-1"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Totalmente depreciado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Quase totalmente (&gt;80%)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Depreciação parcial</span>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground italic">
                    * Valores de compra estimados com base no preço de mercado na época da fabricação. Depreciação linear com valor residual de 10%.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function KpiCard({
  icon: Icon, label, value, onClick, color, bg, sub,
}: {
  icon: any; label: string; value: any; onClick?: () => void; color: string; bg: string; sub?: string;
}) {
  return (
    <Card className={`${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold truncate">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterBtn({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
        active
          ? color || "bg-slate-800 text-white border-slate-800"
          : "bg-white text-muted-foreground border-border hover:border-slate-400"
      }`}
    >
      {label}
      <span className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold ${
        active ? "bg-white/20 text-inherit" : "bg-muted text-muted-foreground"
      }`}>{count}</span>
    </button>
  );
}

function ObrigacaoRow({ label, value, total, onClick }: { label: string; value?: number | null; total?: string; onClick?: () => void }) {
  return (
    <div className="flex justify-between items-center cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded" onClick={onClick}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {value != null && <span className="font-semibold">{value}</span>}
        {total && <span className="text-xs text-muted-foreground">({total})</span>}
      </div>
    </div>
  );
}
