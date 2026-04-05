import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  Truck, Wrench, Fuel, AlertTriangle, DollarSign, TrendingDown, Gauge,
  BarChart3, Shield, Receipt, FileText, RefreshCw, AlertCircle, Info,
  CheckCircle2, Calendar, MapPin, Activity, PieChart, Car,
  ArrowUpRight, ArrowDownRight, Clock, Droplets, TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtN(v: number) {
  return v.toLocaleString("pt-BR");
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
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

  const pctRetidoGlobal = d && d.totalCompra > 0 ? Math.round((d.totalFipe / d.totalCompra) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-cyan-600" /> Dashboard Frotas
            </h1>
            <p className="text-muted-foreground text-sm">
              Gestão completa — indicadores, custos, patrimônio e alertas
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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard icon={Truck} label="Veículos Ativos" value={d.totalVehicles} onClick={() => navigate("/frotas/veiculos")} color="text-cyan-600" bg="bg-cyan-50" />
              <KpiCard icon={DollarSign} label="Patrimônio FIPE" value={fmt(d.totalFipe)} color="text-green-600" bg="bg-green-50" />
              <KpiCard icon={TrendingDown} label="Depreciação Real" value={fmt(d.depreciacao)} color="text-red-600" bg="bg-red-50" sub={`Retém ${pctRetidoGlobal}%`} />
              <KpiCard icon={Gauge} label="Km Total Rodado" value={`${fmtN(d.totalKm)} km`} color="text-blue-600" bg="bg-blue-50" />
              <KpiCard icon={Fuel} label="Consumo Médio" value={d.consumoMedio > 0 ? `${d.consumoMedio.toFixed(1)} km/l` : "—"} color="text-amber-600" bg="bg-amber-50" sub={d.totalLitros > 0 ? `${fmtN(Math.round(d.totalLitros))} litros` : undefined} />
              <KpiCard icon={Clock} label="Idade Média" value={`${d.idadeFrota.toFixed(1)} anos`} color="text-slate-600" bg="bg-slate-50" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
              <KpiCard icon={Wrench} label="Manutenção" value={fmt(d.totalManutCusto)} onClick={() => navigate("/frotas/manutencoes")} color="text-orange-600" bg="bg-orange-50" sub={`${d.veiculosEmManutencao} em andamento`} />
              <KpiCard icon={Fuel} label="Combustível" value={fmt(d.totalCombustivel)} onClick={() => navigate("/frotas/combustivel")} color="text-amber-600" bg="bg-amber-50" />
              <KpiCard icon={AlertTriangle} label="Multas" value={fmt(d.totalMultas)} onClick={() => navigate("/frotas/multas")} color="text-red-600" bg="bg-red-50" sub={d.multasPendentes > 0 ? `${d.multasPendentes} pendentes` : "Nenhuma pendente"} />
              <KpiCard icon={Receipt} label="IPVA Pendente" value={fmt(d.totalIpvaPendente)} onClick={() => navigate("/frotas/ipva")} color="text-purple-600" bg="bg-purple-50" />
              <KpiCard icon={Activity} label="Custo/km (M+C)" value={d.custoKm > 0 ? `R$ ${d.custoKm.toFixed(2)}/km` : "—"} color="text-indigo-600" bg="bg-indigo-50" sub={`Oper. total: ${fmt(d.custoOperTotal)}`} />
            </div>

            <Tabs defaultValue="visao-geral" className="space-y-4">
              <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
                <TabsTrigger value="visao-geral" className="text-xs">Visão Geral</TabsTrigger>
                <TabsTrigger value="custos" className="text-xs">Custos por Veículo</TabsTrigger>
                <TabsTrigger value="patrimonio" className="text-xs">Patrimônio</TabsTrigger>
                <TabsTrigger value="combustivel" className="text-xs">Combustível</TabsTrigger>
                <TabsTrigger value="alertas" className="text-xs">Alertas ({d.alertas.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="visao-geral" className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <PieChart className="h-4 w-4 text-cyan-600" /> Composição por Tipo
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(d.tipoCount).length === 0 ? (
                        <p className="text-muted-foreground text-sm">Sem dados</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(d.tipoCount)
                            .sort((a, b) => (b[1] as number) - (a[1] as number))
                            .map(([tipo, count]) => {
                              const pct = ((count as number) / d.totalVehicles) * 100;
                              const colors = ["bg-cyan-500", "bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-emerald-500"];
                              const idx = Object.keys(d.tipoCount).indexOf(tipo) % colors.length;
                              return (
                                <div key={tipo}>
                                  <div className="flex justify-between text-xs mb-0.5">
                                    <span className="font-medium">{tipo}</span>
                                    <span className="text-muted-foreground">{count as number} ({pct.toFixed(0)}%)</span>
                                  </div>
                                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full ${colors[idx]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Car className="h-4 w-4 text-indigo-600" /> Composição por Marca
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(d.marcaCount).length === 0 ? (
                        <p className="text-muted-foreground text-sm">Sem dados</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(d.marcaCount)
                            .sort((a, b) => (b[1] as number) - (a[1] as number))
                            .slice(0, 8)
                            .map(([marca, count]) => {
                              const pct = ((count as number) / d.totalVehicles) * 100;
                              return (
                                <div key={marca}>
                                  <div className="flex justify-between text-xs mb-0.5">
                                    <span className="font-medium">{marca}</span>
                                    <span className="text-muted-foreground">{count as number} ({pct.toFixed(0)}%)</span>
                                  </div>
                                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-600" /> Distribuição por Idade
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(d.idadeDistribuicao).length === 0 ? (
                        <p className="text-muted-foreground text-sm">Sem dados</p>
                      ) : (
                        <div className="space-y-3">
                          {["0-2 anos", "3-5 anos", "6-10 anos", "10+ anos"].map((faixa) => {
                            const count = (d.idadeDistribuicao as any)[faixa] || 0;
                            const pct = d.totalVehicles > 0 ? (count / d.totalVehicles) * 100 : 0;
                            const faixaColors: Record<string, string> = {
                              "0-2 anos": "bg-green-500",
                              "3-5 anos": "bg-blue-500",
                              "6-10 anos": "bg-amber-500",
                              "10+ anos": "bg-red-500",
                            };
                            return (
                              <div key={faixa}>
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="font-medium">{faixa}</span>
                                  <span className="text-muted-foreground">{count} veículo{count !== 1 ? "s" : ""}</span>
                                </div>
                                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full ${faixaColors[faixa] || "bg-slate-400"} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" /> Resumo Financeiro
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <FinRow label="Valor de Compra (est.)" value={fmt(d.totalCompra)} />
                      <FinRow label="Valor FIPE Atual" value={fmt(d.totalFipe)} color="text-green-600" />
                      <FinRow label="Depreciação (Compra → FIPE)" value={fmt(d.depreciacao)} color="text-red-600" />
                      <div className="border-t pt-2 mt-2" />
                      <FinRow label="Custo Manutenção" value={fmt(d.totalManutCusto)} color="text-orange-600" />
                      <FinRow label="Custo Combustível" value={fmt(d.totalCombustivel)} color="text-amber-600" />
                      <FinRow label="Multas" value={fmt(d.totalMultas)} color="text-red-600" />
                      <div className="border-t pt-2 mt-2" />
                      <FinRow label="Custo Operacional Total" value={fmt(d.custoOperTotal)} bold />
                      <FinRow label="Custo por Km" value={d.custoKm > 0 ? `R$ ${d.custoKm.toFixed(2)}/km` : "—"} />
                      <div className="border-t pt-2 mt-2" />
                      <FinRow label="Prêmios de Seguros" value={fmt(d.totalSegurosPremio)} color="text-emerald-600" />
                      <FinRow label="IPVA Total" value={fmt(d.totalIpvaGeral)} color="text-purple-600" />
                      <FinRow label="Licenciamento Total" value={fmt(d.totalLicenciamento)} color="text-indigo-600" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" /> Status e Obrigações
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Status dos Veículos</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(d.statusVeiculos).map(([st, count]) => (
                            <Badge key={st} variant="outline" className="text-xs px-3 py-1">
                              {st}: <span className="font-bold ml-1">{count as number}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="border-t pt-3">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Seguros</p>
                        <div className="grid grid-cols-3 gap-3">
                          <MiniKpi label="Ativos" value={d.segurosAtivos} color="text-green-600" />
                          <MiniKpi label="Sem Seguro" value={d.veiculosSemSeguro} color={d.veiculosSemSeguro > 0 ? "text-red-600" : "text-green-600"} />
                          <MiniKpi label="Prêmio Total" value={fmt(d.totalSegurosPremio)} color="text-emerald-600" />
                        </div>
                      </div>
                      <div className="border-t pt-3">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Alertas</p>
                        <div className="grid grid-cols-3 gap-3">
                          <MiniKpi label="Vencidos" value={d.alertasCriticos} color="text-red-600" />
                          <MiniKpi label="Próximos" value={d.alertasAlerta} color="text-amber-600" />
                          <MiniKpi label="Pendentes" value={d.alertasInfo} color="text-blue-600" />
                        </div>
                      </div>
                      <div className="border-t pt-3">
                        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Atalhos</p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/frotas/veiculos")}>
                            <Truck className="h-3 w-3 mr-1" /> Veículos
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/frotas/manutencoes")}>
                            <Wrench className="h-3 w-3 mr-1" /> Manutenções
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/frotas/combustivel")}>
                            <Fuel className="h-3 w-3 mr-1" /> Combustível
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/frotas/multas")}>
                            <AlertTriangle className="h-3 w-3 mr-1" /> Multas
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/frotas/seguros")}>
                            <Shield className="h-3 w-3 mr-1" /> Seguros
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/frotas/rastreamento")}>
                            <MapPin className="h-3 w-3 mr-1" /> Rastreamento
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Evolução de Custos Mensais
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(d.custosTotaisByMonth).length === 0 ? (
                      <p className="text-muted-foreground text-sm">Sem dados de custos mensais</p>
                    ) : (
                      <>
                        <div className="flex gap-4 mb-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Combustível</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-500 inline-block" /> Manutenção</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" /> Multas</span>
                        </div>
                        <div className="space-y-1.5">
                          {Object.entries(d.custosTotaisByMonth)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .slice(-12)
                            .map(([m, costs]) => {
                              const c = costs as any;
                              const total = c.combustivel + c.manutencao + c.multas;
                              const allTotals = Object.values(d.custosTotaisByMonth).map((x: any) => x.combustivel + x.manutencao + x.multas);
                              const max = Math.max(...allTotals);
                              const pctComb = max > 0 ? (c.combustivel / max) * 100 : 0;
                              const pctManut = max > 0 ? (c.manutencao / max) * 100 : 0;
                              const pctMultas = max > 0 ? (c.multas / max) * 100 : 0;
                              return (
                                <div key={m} className="flex items-center gap-2">
                                  <span className="text-[11px] w-16 text-muted-foreground font-mono">{m}</span>
                                  <div className="flex-1 h-5 bg-muted rounded overflow-hidden flex">
                                    {pctComb > 0 && <div className="h-full bg-amber-500" style={{ width: `${pctComb}%` }} />}
                                    {pctManut > 0 && <div className="h-full bg-orange-500" style={{ width: `${pctManut}%` }} />}
                                    {pctMultas > 0 && <div className="h-full bg-red-500" style={{ width: `${pctMultas}%` }} />}
                                  </div>
                                  <span className="text-[11px] font-medium w-24 text-right">{fmt(total)}</span>
                                </div>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="custos" className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-orange-600" /> Custo Total por Veículo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left bg-muted/30">
                            <th className="py-2.5 px-2 font-semibold">Veículo</th>
                            <th className="py-2.5 px-2 font-semibold text-right">Manutenção</th>
                            <th className="py-2.5 px-2 font-semibold text-right">Combustível</th>
                            <th className="py-2.5 px-2 font-semibold text-right">Multas</th>
                            <th className="py-2.5 px-2 font-semibold text-right">Total</th>
                            <th className="py-2.5 px-2 font-semibold text-right">R$/km</th>
                            <th className="py-2.5 px-2 font-semibold text-center">Km</th>
                            <th className="py-2.5 px-2 font-semibold text-center">km/l</th>
                            <th className="py-2.5 px-2 font-semibold text-center">Abast.</th>
                            <th className="py-2.5 px-2 font-semibold text-center">Manut.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(d.custoPorVeiculo || []).map((v: any, i: number) => {
                            const maxCusto = d.custoPorVeiculo[0]?.custoTotal || 1;
                            const pct = (v.custoTotal / maxCusto) * 100;
                            return (
                              <tr key={v.id} className={`border-b border-border/30 hover:bg-muted/30 ${i < 3 && v.custoTotal > 0 ? "bg-red-50/30" : ""}`}>
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-2">
                                    {i < 3 && v.custoTotal > 0 && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${i === 0 ? "bg-red-100 text-red-700" : i === 1 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                                        #{i + 1}
                                      </span>
                                    )}
                                    <div>
                                      <div className="font-medium">{v.placa || "—"}</div>
                                      <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{v.modelo}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right text-orange-600">{v.custoManut > 0 ? fmt(v.custoManut) : "—"}</td>
                                <td className="py-2 px-2 text-right text-amber-600">{v.custoComb > 0 ? fmt(v.custoComb) : "—"}</td>
                                <td className="py-2 px-2 text-right text-red-600">{v.custoMultas > 0 ? fmt(v.custoMultas) : "—"}</td>
                                <td className="py-2 px-2 text-right font-semibold">
                                  <div>{v.custoTotal > 0 ? fmt(v.custoTotal) : "—"}</div>
                                  {v.custoTotal > 0 && (
                                    <div className="w-full h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                                      <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-right text-muted-foreground">
                                  {v.custoKmV > 0 ? `R$ ${v.custoKmV.toFixed(2)}` : "—"}
                                </td>
                                <td className="py-2 px-2 text-center">{v.km > 0 ? fmtN(v.km) : "—"}</td>
                                <td className="py-2 px-2 text-center">
                                  {v.consumo > 0 ? (
                                    <span className={`font-medium ${v.consumo >= 10 ? "text-green-600" : v.consumo >= 6 ? "text-amber-600" : "text-red-600"}`}>
                                      {v.consumo.toFixed(1)}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="py-2 px-2 text-center">{v.abastecimentos || "—"}</td>
                                <td className="py-2 px-2 text-center">{v.manutencoes || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {d.custoPorVeiculo && d.custoPorVeiculo.length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 font-semibold bg-muted/30">
                              <td className="py-2.5 px-2">TOTAL ({d.custoPorVeiculo.length})</td>
                              <td className="py-2.5 px-2 text-right text-orange-600">{fmt(d.totalManutCusto)}</td>
                              <td className="py-2.5 px-2 text-right text-amber-600">{fmt(d.totalCombustivel)}</td>
                              <td className="py-2.5 px-2 text-right text-red-600">{fmt(d.totalMultas)}</td>
                              <td className="py-2.5 px-2 text-right">{fmt(d.custoOperTotal)}</td>
                              <td className="py-2.5 px-2 text-right text-muted-foreground">{d.custoKm > 0 ? `R$ ${d.custoKm.toFixed(2)}` : "—"}</td>
                              <td className="py-2.5 px-2 text-center">{fmtN(d.totalKm)}</td>
                              <td className="py-2.5 px-2 text-center">{d.consumoMedio > 0 ? d.consumoMedio.toFixed(1) : "—"}</td>
                              <td className="py-2.5 px-2 text-center" colSpan={2} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-red-500" /> Top 5 — Maior Custo
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(d.custoPorVeiculo || []).slice(0, 5).filter((v: any) => v.custoTotal > 0).map((v: any, i: number) => {
                          const maxVal = d.custoPorVeiculo[0]?.custoTotal || 1;
                          return (
                            <div key={v.id} className="flex items-center gap-3">
                              <span className="text-xs font-bold w-5 text-muted-foreground">#{i + 1}</span>
                              <div className="flex-1">
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="font-medium">{v.placa} - {v.modelo}</span>
                                  <span className="font-semibold">{fmt(v.custoTotal)}</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full" style={{ width: `${(v.custoTotal / maxVal) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-green-500" /> Ranking Eficiência (km/l)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(d.custoPorVeiculo || [])
                          .filter((v: any) => v.consumo > 0)
                          .sort((a: any, b: any) => b.consumo - a.consumo)
                          .slice(0, 8)
                          .map((v: any, i: number) => {
                            const maxCons = d.custoPorVeiculo.filter((x: any) => x.consumo > 0).sort((a: any, b: any) => b.consumo - a.consumo)[0]?.consumo || 1;
                            return (
                              <div key={v.id} className="flex items-center gap-3">
                                <span className="text-xs font-bold w-5 text-muted-foreground">#{i + 1}</span>
                                <div className="flex-1">
                                  <div className="flex justify-between text-xs mb-0.5">
                                    <span className="font-medium">{v.placa} - {v.modelo}</span>
                                    <span className={`font-semibold ${v.consumo >= 10 ? "text-green-600" : v.consumo >= 6 ? "text-amber-600" : "text-red-600"}`}>
                                      {v.consumo.toFixed(1)} km/l
                                    </span>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${v.consumo >= 10 ? "bg-green-500" : v.consumo >= 6 ? "bg-amber-500" : "bg-red-500"}`}
                                      style={{ width: `${(v.consumo / maxCons) * 100}%` }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        {(d.custoPorVeiculo || []).filter((v: any) => v.consumo > 0).length === 0 && (
                          <p className="text-muted-foreground text-sm">Sem dados de consumo registrados</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="patrimonio" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Valor de Compra</p>
                      <p className="text-xl font-bold">{fmt(d.totalCompra)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Valor FIPE Atual</p>
                      <p className="text-xl font-bold text-green-600">{fmt(d.totalFipe)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {pctRetidoGlobal >= 100 ? (
                          <span className="text-green-600 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" /> Valorizado</span>
                        ) : (
                          <span>Retém {pctRetidoGlobal}% do investimento</span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Depreciação Total</p>
                      <p className="text-xl font-bold text-red-600">{fmt(d.depreciacao)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{d.totalCompra > 0 ? fmtPct((d.depreciacao / d.totalCompra) * 100) : "0%"} do valor de compra</p>
                    </CardContent>
                  </Card>
                </div>

                {d.depreciacaoPorVeiculo && d.depreciacaoPorVeiculo.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" /> Depreciação por Veículo
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left bg-muted/30">
                              <th className="py-2.5 px-2 font-semibold">Veículo</th>
                              <th className="py-2.5 px-2 font-semibold text-center">Ano</th>
                              <th className="py-2.5 px-2 font-semibold text-center">Idade</th>
                              <th className="py-2.5 px-2 font-semibold text-right">Compra (est.)</th>
                              <th className="py-2.5 px-2 font-semibold text-right">FIPE Atual</th>
                              <th className="py-2.5 px-2 font-semibold text-right">Perda de Valor</th>
                              <th className="py-2.5 px-2 font-semibold text-right">Perda/Ano</th>
                              <th className="py-2.5 px-2 font-semibold text-center">% Retido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.depreciacaoPorVeiculo.map((v: any) => {
                              const pctRetido = v.valorCompra > 0 ? Math.round((v.valorFipe / v.valorCompra) * 100) : 0;
                              return (
                                <tr key={v.id} className="border-b border-border/30 hover:bg-muted/30">
                                  <td className="py-2 px-2">
                                    <div className="font-medium">{v.placa || "—"}</div>
                                    <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{v.modelo}</div>
                                  </td>
                                  <td className="py-2 px-2 text-center">{v.anoFab}</td>
                                  <td className="py-2 px-2 text-center">{v.idadeAnos}a</td>
                                  <td className="py-2 px-2 text-right">{fmt(v.valorCompra)}</td>
                                  <td className="py-2 px-2 text-right text-green-600 font-medium">{fmt(v.valorFipe)}</td>
                                  <td className="py-2 px-2 text-right text-red-600">{fmt(v.deprecReal)}</td>
                                  <td className="py-2 px-2 text-right text-muted-foreground">{fmt(v.deprecAnual)}/ano</td>
                                  <td className="py-2 px-2 text-center">
                                    <div className="flex items-center gap-1.5 justify-center">
                                      <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${
                                          pctRetido >= 70 ? "bg-green-500" : pctRetido >= 40 ? "bg-amber-500" : "bg-red-500"
                                        }`} style={{ width: `${Math.min(pctRetido, 100)}%` }} />
                                      </div>
                                      <span className={`text-[10px] font-semibold ${
                                        pctRetido >= 70 ? "text-green-600" : pctRetido >= 40 ? "text-amber-600" : "text-red-600"
                                      }`}>{pctRetido}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 font-semibold bg-muted/30">
                              <td className="py-2.5 px-2" colSpan={3}>TOTAL ({d.depreciacaoPorVeiculo.length} veículos)</td>
                              <td className="py-2.5 px-2 text-right">{fmt(d.totalCompra)}</td>
                              <td className="py-2.5 px-2 text-right text-green-600">{fmt(d.totalFipe)}</td>
                              <td className="py-2.5 px-2 text-right text-red-600">{fmt(d.depreciacao)}</td>
                              <td className="py-2.5 px-2 text-right text-muted-foreground">—</td>
                              <td className="py-2.5 px-2 text-center">
                                <span className="text-blue-600 font-bold">{pctRetidoGlobal}%</span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Retém 70%+</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 40-69%</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt;40%</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="combustivel" className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MiniCard label="Total Gasto" value={fmt(d.totalCombustivel)} icon={DollarSign} color="text-amber-600" />
                  <MiniCard label="Total Litros" value={`${fmtN(Math.round(d.totalLitros))} L`} icon={Droplets} color="text-blue-600" />
                  <MiniCard label="Consumo Médio" value={d.consumoMedio > 0 ? `${d.consumoMedio.toFixed(1)} km/l` : "—"} icon={Gauge} color="text-green-600" />
                  <MiniCard label="Preço Médio/L" value={d.totalLitros > 0 ? `R$ ${(d.totalCombustivel / d.totalLitros).toFixed(2)}` : "—"} icon={TrendingUp} color="text-purple-600" />
                </div>

                {Object.keys(d.tipoCombustivel || {}).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Fuel className="h-4 w-4 text-amber-600" /> Consumo por Tipo de Combustível
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(d.tipoCombustivel)
                          .sort((a, b) => (b[1] as number) - (a[1] as number))
                          .map(([tipo, litros]) => {
                            const pct = d.totalLitros > 0 ? ((litros as number) / d.totalLitros) * 100 : 0;
                            return (
                              <div key={tipo}>
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="font-medium">{tipo}</span>
                                  <span className="text-muted-foreground">{fmtN(Math.round(litros as number))} L ({pct.toFixed(0)}%)</span>
                                </div>
                                <div className="h-3 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Custos Mensais de Combustível</CardTitle>
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
                                  <span className="text-[11px] w-16 text-muted-foreground font-mono">{m}</span>
                                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${((v as number) / max) * 100}%` }} />
                                  </div>
                                  <span className="text-[11px] font-medium w-20 text-right">{fmt(v as number)}</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Custos Mensais de Manutenção</CardTitle>
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
                                  <span className="text-[11px] w-16 text-muted-foreground font-mono">{m}</span>
                                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${((v as number) / max) * 100}%` }} />
                                  </div>
                                  <span className="text-[11px] font-medium w-20 text-right">{fmt(v as number)}</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="alertas" className="space-y-4">
                {d.alertas.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                      <p className="font-medium">Nenhum alerta ativo</p>
                      <p className="text-sm text-muted-foreground">Todos os itens da frota estão em dia</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="flex gap-1.5 flex-wrap">
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

                    {d.alertasCriticos > 0 && alertFilter === "todos" && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                        <span className="text-sm text-red-700 font-medium">
                          {d.alertasCriticos} {d.alertasCriticos === 1 ? "item vencido" : "itens vencidos"} — ação imediata necessária!
                        </span>
                      </div>
                    )}

                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {Object.entries(alertasByTipo)
                        .sort(([, a], [, b]) => {
                          const criticos = (arr: any[]) => arr.filter(x => x.urgencia === "critico").length;
                          return criticos(b) - criticos(a);
                        })
                        .map(([tipo, items]) => {
                          const info = tipoLabels[tipo] || { label: tipo, icon: AlertTriangle, color: "text-gray-600" };
                          const Icon = info.icon;
                          return (
                            <Card key={tipo}>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-xs flex items-center gap-2">
                                  <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                                  {info.label}
                                  <Badge variant="outline" className="text-[10px] h-4">{items.length}</Badge>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-1.5">
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
                              </CardContent>
                            </Card>
                          );
                        })}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
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
            <p className="text-[11px] text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold truncate leading-tight">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function FinRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${bold ? "text-base font-bold" : "font-semibold"} ${color || ""}`}>{value}</span>
    </div>
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
