import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Truck, Wrench, Fuel, AlertTriangle, DollarSign, TrendingDown, Gauge,
  BarChart3, Shield, Receipt, FileText, RefreshCw,
} from "lucide-react";
import { useEffect } from "react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PainelFrotas() {
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();

  const initMut = trpc.frotas.initTables.useMutation();
  const dash = trpc.frotas.getDashboard.useQuery(
    { companyId: cId },
    { enabled: cId > 0, retry: 1 },
  );

  useEffect(() => {
    if (cId > 0) initMut.mutate();
  }, [cId]);

  const d = dash.data;

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
              <KpiCard icon={FileText} label="Licenciamento" value="Ver" onClick={() => navigate("/frotas/licenciamento")} color="text-indigo-600" bg="bg-indigo-50" />
            </div>

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
                    <AlertTriangle className="h-4 w-4 text-red-500" /> Alertas ({d.alertas.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {d.alertas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum alerta</p>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {d.alertas.map((a: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                          <Badge
                            variant={a.urgencia === "critico" ? "destructive" : "outline"}
                            className="text-[10px] shrink-0 mt-0.5"
                          >
                            {a.tipo}
                          </Badge>
                          <div className="text-xs">
                            {a.placa && <span className="font-semibold">{a.placa} — </span>}
                            {a.msg}
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
