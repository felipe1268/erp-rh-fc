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
  BarChart3, Shield, Receipt, FileText, AlertCircle, Info,
  CheckCircle2, Calendar, MapPin, Activity, PieChart, Car,
  ArrowUpRight, ArrowDownRight, Clock, Droplets, TrendingUp,
  Filter, X, ChevronRight, Eye, Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const MESES_BR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function fmtMesAno(m: string) {
  const [ano, mes] = m.split("-");
  const idx = parseInt(mes) - 1;
  return `${MESES_BR[idx] || mes}/${ano}`;
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
  const [idadeDialog, setIdadeDialog] = useState<string | null>(null);
  const [custoMesDialog, setCustoMesDialog] = useState<string | null>(null);

  const [maintTab, setMaintTab] = useState<string>("pecas");
  const [hiddenCustos, setHiddenCustos] = useState<Set<string>>(new Set());
  const [filtroAno, setFiltroAno] = useState<number | undefined>();
  const [filtroMes, setFiltroMes] = useState<number | undefined>();
  const [filtroVeiculo, setFiltroVeiculo] = useState<string | undefined>();
  const [anoDash, setAnoDash] = useState<number | undefined>(new Date().getFullYear());
  const initMut = trpc.frotas.initTables.useMutation();
  const dash = trpc.frotas.getDashboard.useQuery(
    { companyId: cId, ano: anoDash },
    { enabled: cId > 0, retry: 1 },
  );
  const maintAnalytics = trpc.frotas.getMaintenanceAnalytics.useQuery(
    { companyId: cId, ano: filtroAno, mes: filtroMes, vehiclePlaca: filtroVeiculo },
    { enabled: cId > 0 },
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
    manutencao: { label: "Manutenção", icon: Wrench, color: "text-emerald-600" },
    multa: { label: "Multas", icon: AlertTriangle, color: "text-red-600" },
    ipva: { label: "IPVA", icon: Receipt, color: "text-purple-600" },
    licenciamento: { label: "Licenciamento", icon: Calendar, color: "text-indigo-600" },
  };

  const pctRetidoGlobal = d && d.totalCompra > 0 ? Math.round((d.totalFipe / d.totalCompra) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="p-2 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-cyan-600" /> Dashboard Frotas
            </h1>
            <p className="text-muted-foreground text-sm">
              Gestão completa — indicadores, custos, patrimônio e alertas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              value={anoDash ?? ""}
              onChange={(e) => setAnoDash(e.target.value ? Number(e.target.value) : undefined)}
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
            >
              <option value="">Todos os anos</option>
              {(d?.anosDisponiveis || []).map((a: number) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {anoDash && (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setAnoDash(undefined)}>
                {anoDash} <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
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
              <KpiCard icon={Truck} label="Veículos Ativos" value={d.totalVehicles} onClick={() => navigate("/frotas/veiculos")} color="text-cyan-600" bg="bg-cyan-50" tip="Quantidade total de veículos ativos cadastrados na frota" />
              <KpiCard icon={DollarSign} label="Patrimônio FIPE" value={fmt(d.totalFipe)} color="text-green-600" bg="bg-green-50" tip="Valor de mercado atual de todos os veículos com base na tabela FIPE" />
              <KpiCard icon={TrendingDown} label={anoDash ? `Depreciação ${anoDash}` : "Depreciação Real"} value={fmt(d.depreciacao)} color="text-red-600" bg="bg-red-50" sub={anoDash ? "Estimativa anual" : `Retém ${pctRetidoGlobal}%`} tip="Diferença entre o valor de compra e o valor FIPE atual — quanto o patrimônio desvalorizou" />
              <KpiCard icon={Gauge} label={anoDash ? `Km Rodado ${anoDash}` : "Km Total Rodado"} value={`${fmtN(Math.round(d.totalKm))} km`} color="text-blue-600" bg="bg-blue-50" sub={anoDash ? (d.kmMetodo === 'odometro' ? "Via odômetro" : d.kmMetodo === 'estimado' ? "Estimado por consumo" : d.kmMetodo === 'misto' ? "Odômetro + estimado" : "Sem dados no período") : undefined} tip="Quilometragem total percorrida pela frota no período selecionado" />
              <KpiCard icon={Fuel} label={anoDash ? `Consumo ${anoDash}` : "Consumo Médio"} value={d.consumoMedio > 0 ? `${d.consumoMedio.toFixed(1)} km/l` : "—"} color="text-amber-600" bg="bg-amber-50" sub={d.totalLitros > 0 ? `${fmtN(Math.round(d.totalLitros))} litros` : undefined} tip="Média de km percorridos por litro de combustível — quanto maior, mais econômica a frota" />
              <KpiCard icon={Clock} label="Idade Média" value={`${d.idadeFrota.toFixed(1)} anos`} color="text-slate-600" bg="bg-slate-50" tip="Idade média dos veículos da frota com base no ano de fabricação" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
              <KpiCard icon={Wrench} label={anoDash ? `Manutenção ${anoDash}` : "Manutenção"} value={fmt(d.totalManutCusto)} onClick={() => navigate("/frotas/manutencoes")} color="text-emerald-600" bg="bg-emerald-50" sub={`${d.veiculosEmManutencao} em andamento`} tip="Total gasto com manutenções preventivas e corretivas — clique para ver detalhes" />
              <KpiCard icon={Fuel} label={anoDash ? `Combustível ${anoDash}` : "Combustível"} value={fmt(d.totalCombustivel)} onClick={() => navigate("/frotas/combustivel")} color="text-blue-600" bg="bg-blue-50" tip="Total gasto com abastecimentos da frota — clique para ver registros" />
              <KpiCard icon={AlertTriangle} label={anoDash ? `Multas ${anoDash}` : "Multas"} value={fmt(d.totalMultas)} onClick={() => navigate("/frotas/multas")} color="text-red-600" bg="bg-red-50" sub={d.multasPendentes > 0 ? `${d.multasPendentes} pendentes` : "Nenhuma pendente"} tip="Total de multas de trânsito registradas no período — clique para gerenciar" />
              <KpiCard icon={Receipt} label={anoDash ? `IPVA ${anoDash}` : "IPVA Pendente"} value={fmt(d.totalIpvaPendente)} onClick={() => navigate("/frotas/ipva")} color="text-purple-600" bg="bg-purple-50" tip="Valor pendente de IPVA a pagar — clique para ver situação por veículo" />
              <KpiCard icon={Activity} label={anoDash ? `Custo/km ${anoDash}` : "Custo/km (M+C)"} value={d.custoKm > 0 ? `R$ ${d.custoKm.toFixed(2)}/km` : "—"} color="text-indigo-600" bg="bg-indigo-50" sub={`Oper. total: ${fmt(d.custoOperTotal)}`} tip="Custo por quilômetro rodado (manutenção + combustível) — quanto menor, mais eficiente a operação" />
            </div>

            <Tabs defaultValue="visao-geral" className="space-y-4">
              <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
                <TabsTrigger value="visao-geral" className="text-xs">Visão Geral</TabsTrigger>
                <TabsTrigger value="custos" className="text-xs">Custos por Veículo</TabsTrigger>
                <TabsTrigger value="patrimonio" className="text-xs">Patrimônio</TabsTrigger>
                <TabsTrigger value="combustivel" className="text-xs">Combustível</TabsTrigger>
                <TabsTrigger value="alertas" className="text-xs">Alertas ({d.alertas.length})</TabsTrigger>
                <TabsTrigger value="manutencao" className="text-xs">Análise Manutenção</TabsTrigger>
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
                              <div
                                key={faixa}
                                className={`cursor-pointer rounded-lg p-1.5 -mx-1.5 transition-colors ${count > 0 ? "hover:bg-muted/60" : ""}`}
                                onClick={() => count > 0 && setIdadeDialog(faixa)}
                              >
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
                      <FinRow label="Custo Manutenção" value={fmt(d.totalManutCusto)} color="text-emerald-600" />
                      <FinRow label="Custo Combustível" value={fmt(d.totalCombustivel)} color="text-blue-600" />
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
                          {([
                            { key: "combustivel", label: "Combustível", bg: "bg-blue-500" },
                            { key: "manutencao", label: "Manutenção", bg: "bg-emerald-500" },
                            { key: "multas", label: "Multas", bg: "bg-red-500" },
                          ] as const).map((item) => {
                            const hidden = hiddenCustos.has(item.key);
                            return (
                              <span
                                key={item.key}
                                className={`flex items-center gap-1 cursor-pointer select-none transition-opacity ${hidden ? "opacity-40 line-through" : ""}`}
                                onClick={() => setHiddenCustos((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
                                  return next;
                                })}
                              >
                                <span className={`w-2.5 h-2.5 rounded inline-block ${hidden ? "bg-gray-300" : item.bg}`} />
                                {item.label}
                              </span>
                            );
                          })}
                        </div>
                        <div className="space-y-1.5">
                          {Object.entries(d.custosTotaisByMonth)
                            .sort(([a], [b]) => b.localeCompare(a))
                            .slice(0, 12)
                            .map(([m, costs]) => {
                              const c = costs as any;
                              const vComb = hiddenCustos.has("combustivel") ? 0 : c.combustivel;
                              const vManut = hiddenCustos.has("manutencao") ? 0 : c.manutencao;
                              const vMultas = hiddenCustos.has("multas") ? 0 : c.multas;
                              const total = vComb + vManut + vMultas;
                              const allTotals = Object.values(d.custosTotaisByMonth).map((x: any) => {
                                return (hiddenCustos.has("combustivel") ? 0 : x.combustivel)
                                  + (hiddenCustos.has("manutencao") ? 0 : x.manutencao)
                                  + (hiddenCustos.has("multas") ? 0 : x.multas);
                              });
                              const max = Math.max(...allTotals, 1);
                              const pctComb = max > 0 ? (vComb / max) * 100 : 0;
                              const pctManut = max > 0 ? (vManut / max) * 100 : 0;
                              const pctMultas = max > 0 ? (vMultas / max) * 100 : 0;
                              return (
                                <div
                                  key={m}
                                  className="flex items-center gap-2 cursor-pointer rounded-lg p-1 -mx-1 hover:bg-muted/60 transition-colors"
                                  onClick={() => setCustoMesDialog(m)}
                                >
                                  <span className="text-[11px] w-20 text-muted-foreground font-mono">{fmtMesAno(m)}</span>
                                  <div className="flex-1 h-5 bg-muted rounded overflow-hidden flex">
                                    {pctComb > 0 && <div className="h-full bg-blue-500 transition-all" style={{ width: `${pctComb}%` }} />}
                                    {pctManut > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctManut}%` }} />}
                                    {pctMultas > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${pctMultas}%` }} />}
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
                                  <span className="text-[11px] w-20 text-muted-foreground font-mono">{fmtMesAno(m)}</span>
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
                                  <span className="text-[11px] w-20 text-muted-foreground font-mono">{fmtMesAno(m)}</span>
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

              <TabsContent value="manutencao" className="space-y-4">
                {maintAnalytics.isLoading ? (
                  <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Carregando análise...</p></CardContent></Card>
                ) : maintAnalytics.data ? (() => {
                  const ma = maintAnalytics.data;
                  const totalGeral = ma.categoriaTotais.pecas + ma.categoriaTotais.servicos;
                  const pctPecas = totalGeral > 0 ? Math.round((ma.categoriaTotais.pecas / totalGeral) * 100) : 0;
                  const evolKeys = Object.keys(ma.evolucaoMensal).sort();
                  const maxEvolTotal = evolKeys.length > 0 ? Math.max(...evolKeys.map(k => (ma.evolucaoMensal as any)[k].total)) : 1;
                  const comp = ma.comparativoAnual;
                  const MESES_FULL = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
                  const filtroPeriodoLabel = filtroAno
                    ? filtroMes ? `${MESES_FULL[filtroMes]}/${filtroAno}` : `Ano ${filtroAno}`
                    : "Todo Período";
                  const temFiltro = filtroAno || filtroMes || filtroVeiculo;
                  return (
                    <>
                      <Card className="border-emerald-200 bg-emerald-50/30">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Filter className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-800">Filtros de Análise</span>
                            {temFiltro && (
                              <button onClick={() => { setFiltroAno(undefined); setFiltroMes(undefined); setFiltroVeiculo(undefined); }}
                                className="ml-auto text-xs text-red-600 hover:text-red-800 flex items-center gap-1">
                                <X className="h-3 w-3" /> Limpar filtros
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <select value={filtroAno || ""} onChange={e => { setFiltroAno(e.target.value ? Number(e.target.value) : undefined); setFiltroMes(undefined); }}
                              className="text-xs border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-emerald-300 outline-none">
                              <option value="">Todos os anos</option>
                              {(ma.anosDisponiveis || []).map((a: number) => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </select>
                            {filtroAno && (
                              <select value={filtroMes || ""} onChange={e => setFiltroMes(e.target.value ? Number(e.target.value) : undefined)}
                                className="text-xs border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-emerald-300 outline-none">
                                <option value="">Todos os meses</option>
                                {(ma.mesesDisponiveis || []).map((m: number) => (
                                  <option key={m} value={m}>{MESES_FULL[m]}</option>
                                ))}
                              </select>
                            )}
                            <select value={filtroVeiculo || ""} onChange={e => setFiltroVeiculo(e.target.value || undefined)}
                              className="text-xs border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-emerald-300 outline-none">
                              <option value="">Todos os veículos</option>
                              {(ma.veiculosDisponiveis || []).map((p: string) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            {temFiltro && (
                              <div className="flex items-center gap-1 px-3 py-1 bg-emerald-100 rounded-lg text-xs text-emerald-800">
                                <Search className="h-3 w-3" />
                                {filtroPeriodoLabel}{filtroVeiculo ? ` | ${filtroVeiculo}` : ""}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <MiniCard label="Manutenções" value={String(ma.totalManutencoes)} icon={Wrench} color="text-emerald-600" />
                        <MiniCard label="Itens" value={String(ma.totalItens)} icon={Activity} color="text-blue-600" />
                        <MiniCard label="Peças" value={fmt(ma.categoriaTotais.pecas)} icon={PieChart} color="text-orange-600" />
                        <MiniCard label="Serviços (MO)" value={fmt(ma.categoriaTotais.servicos)} icon={DollarSign} color="text-violet-600" />
                      </div>

                      {comp && (
                        <Card className="border-blue-200">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-blue-600" />
                              Comparativo {comp.anoAnterior} vs {filtroAno}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                { label: "Manutenções", atual: ma.totalManutencoes, anterior: comp.totalManutAnterior },
                                { label: "Itens", atual: ma.totalItens, anterior: comp.totalItensAnterior },
                                { label: "Peças (R$)", atual: ma.categoriaTotais.pecas, anterior: comp.categoriaTotaisAnterior.pecas, isCurrency: true },
                                { label: "Serviços (R$)", atual: ma.categoriaTotais.servicos, anterior: comp.categoriaTotaisAnterior.servicos, isCurrency: true },
                              ].map((c, i) => {
                                const diff = c.anterior > 0 ? ((c.atual - c.anterior) / c.anterior * 100) : 0;
                                const up = diff > 0;
                                return (
                                  <div key={i} className="p-3 rounded-lg border bg-white">
                                    <p className="text-[10px] text-muted-foreground uppercase mb-1">{c.label}</p>
                                    <div className="flex items-end gap-2">
                                      <span className="text-base font-bold">{c.isCurrency ? fmt(c.atual) : c.atual}</span>
                                      {c.anterior > 0 && (
                                        <span className={`text-[10px] flex items-center gap-0.5 ${up ? "text-red-600" : "text-green-600"}`}>
                                          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                          {Math.abs(diff).toFixed(0)}%
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{comp.anoAnterior}: {c.isCurrency ? fmt(c.anterior) : c.anterior}</p>
                                  </div>
                                );
                              })}
                            </div>

                            {comp.pecasAnterior?.length > 0 && ma.pecasMaisTrocadas.length > 0 && (
                              <div className="mt-4 border-t pt-3">
                                <p className="text-xs font-semibold mb-2 text-blue-700">Comparativo de Peças — Top 10</p>
                                <div className="border rounded-lg overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-blue-50 text-[10px]">
                                        <th className="text-left p-2 font-medium">Peça</th>
                                        <th className="text-center p-2 font-medium">{comp.anoAnterior} (qtd)</th>
                                        <th className="text-center p-2 font-medium">{filtroAno} (qtd)</th>
                                        <th className="text-right p-2 font-medium">{comp.anoAnterior} (R$)</th>
                                        <th className="text-right p-2 font-medium">{filtroAno} (R$)</th>
                                        <th className="text-center p-2 font-medium">Var.</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        const pecasAtualMap: Record<string, any> = {};
                                        for (const p of ma.pecasMaisTrocadas) pecasAtualMap[p.nome.toLowerCase().trim()] = p;
                                        const pecasAntMap: Record<string, any> = {};
                                        for (const p of comp.pecasAnterior) pecasAntMap[p.nome.toLowerCase().trim()] = p;
                                        const allKeys = [...new Set([...Object.keys(pecasAtualMap), ...Object.keys(pecasAntMap)])];
                                        return allKeys.slice(0, 10).map((key, i) => {
                                          const ant = pecasAntMap[key];
                                          const atu = pecasAtualMap[key];
                                          const qAnt = ant?.count || 0;
                                          const qAtu = atu?.count || 0;
                                          const vAnt = ant?.totalGasto || 0;
                                          const vAtu = atu?.totalGasto || 0;
                                          const varPct = vAnt > 0 ? ((vAtu - vAnt) / vAnt * 100) : (vAtu > 0 ? 100 : 0);
                                          return (
                                            <tr key={i} className="border-t">
                                              <td className="p-2 font-medium">{(atu || ant).nome}</td>
                                              <td className="p-2 text-center">{qAnt || "—"}</td>
                                              <td className="p-2 text-center font-bold">{qAtu || "—"}</td>
                                              <td className="p-2 text-right">{vAnt > 0 ? fmt(vAnt) : "—"}</td>
                                              <td className="p-2 text-right font-bold">{vAtu > 0 ? fmt(vAtu) : "—"}</td>
                                              <td className={`p-2 text-center font-bold ${varPct > 0 ? "text-red-600" : varPct < 0 ? "text-green-600" : ""}`}>
                                                {varPct !== 0 ? `${varPct > 0 ? "+" : ""}${varPct.toFixed(0)}%` : "—"}
                                              </td>
                                            </tr>
                                          );
                                        });
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { key: "pecas", label: "Peças Mais Trocadas" },
                          { key: "rapidas", label: "Trocas Rápidas" },
                          { key: "veiculos", label: "Custo por Veículo" },
                          { key: "detalhe", label: "Detalhe Veículo" },
                          { key: "fornecedores", label: "Fornecedores" },
                          { key: "evolucao", label: "Evolução Mensal" },
                        ].map(t => (
                          <button key={t.key} onClick={() => setMaintTab(t.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              maintTab === t.key ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-muted-foreground border-border hover:border-emerald-400"
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {maintTab === "pecas" && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <PieChart className="h-4 w-4 text-orange-600" />
                              Top Peças Mais Trocadas
                              {temFiltro && <Badge variant="outline" className="text-[9px]">{filtroPeriodoLabel}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {ma.pecasMaisTrocadas.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item de peça no período.</p>
                            ) : (
                              <div className="space-y-2">
                                {ma.pecasMaisTrocadas.map((p: any, i: number) => {
                                  const maxCount = ma.pecasMaisTrocadas[0]?.count || 1;
                                  const pct = Math.round((p.count / maxCount) * 100);
                                  return (
                                    <div key={i} className="group">
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i+1}.</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium truncate">{p.nome}</span>
                                            <Badge variant="outline" className="text-[9px] h-4 shrink-0">{p.count}x</Badge>
                                          </div>
                                          <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                                            <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                            <span>{fmt(p.totalGasto)}</span>
                                            <span>•</span>
                                            <span>{p.numVeiculos} veículo{p.numVeiculos > 1 ? "s" : ""}</span>
                                            <span>•</span>
                                            <span>{p.veiculos.slice(0, 3).join(", ")}{p.veiculos.length > 3 ? ` +${p.veiculos.length - 3}` : ""}</span>
                                          </div>
                                        </div>
                                        <span className="text-sm font-bold text-orange-600 shrink-0">{fmt(p.totalGasto)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {maintTab === "rapidas" && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              Trocas Rápidas (menos de 6 meses)
                              {temFiltro && <Badge variant="outline" className="text-[9px]">{filtroPeriodoLabel}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {ma.trocasRapidas.length === 0 ? (
                              <div className="py-6 text-center">
                                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                                <p className="text-sm font-medium">Nenhuma troca rápida detectada</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {ma.trocasRapidas.map((t: any, i: number) => (
                                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    t.dias <= 30 ? "bg-red-50 border-red-200" : t.dias <= 90 ? "bg-amber-50 border-amber-200" : "bg-yellow-50 border-yellow-200"
                                  }`}>
                                    <div className={`flex items-center justify-center h-10 w-10 rounded-lg text-xs font-bold ${
                                      t.dias <= 30 ? "bg-red-100 text-red-700" : t.dias <= 90 ? "bg-amber-100 text-amber-700" : "bg-yellow-100 text-yellow-700"
                                    }`}>
                                      {t.dias}d
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{t.peca}</p>
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-mono font-bold">{t.placa}</span> — {t.modelo}
                                      </p>
                                    </div>
                                    <div className="text-right text-xs text-muted-foreground shrink-0">
                                      <p>{t.de}</p>
                                      <p>→ {t.ate}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {maintTab === "veiculos" && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Truck className="h-4 w-4 text-blue-600" />
                              Custo por Veículo (Peças vs Serviços)
                              {temFiltro && <Badge variant="outline" className="text-[9px]">{filtroPeriodoLabel}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-muted/50 text-xs">
                                    <th className="text-left p-2.5 font-medium">Veículo</th>
                                    <th className="text-right p-2.5 font-medium text-orange-600">Peças</th>
                                    <th className="text-right p-2.5 font-medium text-violet-600">Serviços</th>
                                    <th className="text-right p-2.5 font-medium">Total</th>
                                    <th className="text-center p-2.5 font-medium">OS</th>
                                    <th className="p-2.5 font-medium w-32">Composição</th>
                                    <th className="p-2.5 w-8"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ma.custoPorVeiculoManut.map((v: any, i: number) => {
                                    const pctP = v.total > 0 ? Math.round((v.totalPecas / v.total) * 100) : 0;
                                    return (
                                      <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                                        <td className="p-2.5">
                                          <span className="font-mono text-xs font-bold">{v.placa}</span>
                                          <span className="text-xs text-muted-foreground ml-2 truncate">{v.modelo?.substring(0, 25)}</span>
                                        </td>
                                        <td className="p-2.5 text-right text-orange-600 font-medium">{fmt(v.totalPecas)}</td>
                                        <td className="p-2.5 text-right text-violet-600 font-medium">{fmt(v.totalServicos)}</td>
                                        <td className="p-2.5 text-right font-bold">{fmt(v.total)}</td>
                                        <td className="p-2.5 text-center">{v.numOS}</td>
                                        <td className="p-2.5">
                                          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                                            <div className="h-full bg-orange-500" style={{ width: `${pctP}%` }} />
                                            <div className="h-full bg-violet-500" style={{ width: `${100-pctP}%` }} />
                                          </div>
                                          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                                            <span>{pctP}% peças</span>
                                            <span>{100-pctP}% MO</span>
                                          </div>
                                        </td>
                                        <td className="p-1">
                                          <button onClick={() => { setFiltroVeiculo(v.placa); setMaintTab("detalhe"); }}
                                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors" title="Ver detalhe">
                                            <Eye className="h-3.5 w-3.5" />
                                          </button>
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

                      {maintTab === "detalhe" && (
                        <>
                          {!filtroVeiculo ? (
                            <Card>
                              <CardContent className="py-8 text-center">
                                <Truck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                <p className="text-sm font-medium mb-2">Selecione um veículo para análise detalhada</p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                  {(ma.veiculosDisponiveis || []).map((p: string) => (
                                    <button key={p} onClick={() => setFiltroVeiculo(p)}
                                      className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-mono font-bold text-blue-700 hover:bg-blue-100 transition-colors">
                                      {p}
                                    </button>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ) : ma.detalheVeiculo ? (() => {
                            const dv = ma.detalheVeiculo;
                            const totalVeic = ma.categoriaTotais.pecas + ma.categoriaTotais.servicos;
                            const pctPecasV = totalVeic > 0 ? Math.round((ma.categoriaTotais.pecas / totalVeic) * 100) : 0;
                            const evolKeysV = Object.keys(dv.evolucaoMensal || {}).sort();
                            const maxEvolV = evolKeysV.length > 0 ? Math.max(...evolKeysV.map((k: string) => (dv.evolucaoMensal as any)[k].total)) : 1;
                            return (
                              <div className="space-y-4">
                                <Card className="border-blue-300 bg-blue-50/30">
                                  <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                          <Truck className="h-6 w-6 text-blue-600" />
                                        </div>
                                        <div>
                                          <p className="font-mono text-lg font-bold text-blue-800">{dv.placa}</p>
                                          <p className="text-sm text-muted-foreground">{dv.marca} {dv.modelo}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-2xl font-bold text-blue-800">{fmt(totalVeic)}</p>
                                        <p className="text-xs text-muted-foreground">{ma.totalManutencoes} OS | {ma.totalItens} itens</p>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-center">
                                    <p className="text-[10px] text-orange-600 uppercase font-medium">Peças</p>
                                    <p className="text-base font-bold text-orange-700">{fmt(ma.categoriaTotais.pecas)}</p>
                                    <p className="text-[10px] text-muted-foreground">{ma.categoriaTotais.pecasCount} un.</p>
                                  </div>
                                  <div className="p-3 bg-violet-50 rounded-lg border border-violet-200 text-center">
                                    <p className="text-[10px] text-violet-600 uppercase font-medium">Serviços</p>
                                    <p className="text-base font-bold text-violet-700">{fmt(ma.categoriaTotais.servicos)}</p>
                                    <p className="text-[10px] text-muted-foreground">{ma.categoriaTotais.servicosCount} lançam.</p>
                                  </div>
                                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
                                    <p className="text-[10px] text-emerald-600 uppercase font-medium">Composição</p>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden flex mt-1 mb-0.5">
                                      <div className="h-full bg-orange-500" style={{ width: `${pctPecasV}%` }} />
                                      <div className="h-full bg-violet-500" style={{ width: `${100-pctPecasV}%` }} />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{pctPecasV}% peças | {100-pctPecasV}% MO</p>
                                  </div>
                                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                                    <p className="text-[10px] text-blue-600 uppercase font-medium">Fornecedores</p>
                                    <p className="text-base font-bold text-blue-700">{(dv.fornecedores || []).length}</p>
                                    <p className="text-[10px] text-muted-foreground">{(dv.fornecedores || []).map((f: any) => f.nome).slice(0,2).join(", ")}</p>
                                  </div>
                                </div>

                                {dv.pecas && dv.pecas.length > 0 && (
                                  <Card>
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm flex items-center gap-2">
                                        <PieChart className="h-4 w-4 text-orange-600" />
                                        Peças deste Veículo
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="space-y-1.5">
                                        {dv.pecas.map((p: any, i: number) => {
                                          const maxC = dv.pecas[0]?.count || 1;
                                          const pctBar = Math.round((p.count / maxC) * 100);
                                          return (
                                            <div key={i} className="flex items-center gap-3">
                                              <span className="text-xs text-muted-foreground w-4 text-right">{i+1}.</span>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs font-medium truncate">{p.nome}</span>
                                                  <Badge variant="outline" className="text-[9px] h-4">{p.count}x</Badge>
                                                </div>
                                                <div className="h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                                                  <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pctBar}%` }} />
                                                </div>
                                              </div>
                                              <span className="text-xs font-bold text-orange-600">{fmt(p.totalGasto)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}

                                {evolKeysV.length > 0 && (
                                  <Card>
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm flex items-center gap-2">
                                        <BarChart3 className="h-4 w-4 text-emerald-600" />
                                        Evolução Mensal — {dv.placa}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="space-y-2">
                                        {evolKeysV.map((mes: string) => {
                                          const ev = (dv.evolucaoMensal as any)[mes];
                                          const pctMes = Math.round((ev.total / maxEvolV) * 100);
                                          const pctP = ev.total > 0 ? Math.round((ev.pecas / ev.total) * 100) : 0;
                                          return (
                                            <div key={mes}>
                                              <div className="flex items-center justify-between text-xs mb-0.5">
                                                <span className="font-medium">{fmtMesAno(mes)}</span>
                                                <span className="font-bold">{fmt(ev.total)} <span className="text-muted-foreground font-normal">({ev.numOS} OS)</span></span>
                                              </div>
                                              <div className="h-3 bg-muted rounded-full overflow-hidden flex" style={{ width: `${Math.max(pctMes, 8)}%` }}>
                                                <div className="h-full bg-orange-500" style={{ width: `${pctP}%` }} />
                                                <div className="h-full bg-violet-500" style={{ width: `${100-pctP}%` }} />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}

                                {dv.ordens && dv.ordens.length > 0 && (
                                  <Card>
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-slate-600" />
                                        Histórico de OS — {dv.placa}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="space-y-3">
                                        {dv.ordens.map((os: any, idx: number) => (
                                          <div key={idx} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center gap-2">
                                                <Badge variant={os.tipo === 'corretiva' ? 'destructive' : 'default'} className="text-[9px]">
                                                  {os.tipo}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">{os.data}</span>
                                              </div>
                                              <span className="text-sm font-bold">{fmt(os.custo)}</span>
                                            </div>
                                            <p className="text-sm font-medium mb-1">{os.descricao}</p>
                                            <p className="text-xs text-muted-foreground mb-2">{os.fornecedor}</p>
                                            {os.itens && os.itens.length > 0 && (
                                              <div className="border-t pt-2">
                                                <table className="w-full text-[11px]">
                                                  <thead>
                                                    <tr className="text-muted-foreground">
                                                      <th className="text-left py-0.5 font-medium">Item</th>
                                                      <th className="text-center py-0.5 font-medium w-10">Tipo</th>
                                                      <th className="text-center py-0.5 font-medium w-10">Qtd</th>
                                                      <th className="text-right py-0.5 font-medium w-20">Unit.</th>
                                                      <th className="text-right py-0.5 font-medium w-20">Total</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {os.itens.map((it: any, j: number) => (
                                                      <tr key={j} className="border-t border-dashed">
                                                        <td className="py-0.5">{it.nome}</td>
                                                        <td className="py-0.5 text-center">
                                                          <span className={`px-1 rounded text-[9px] ${it.categoria === 'peca' ? 'bg-orange-100 text-orange-700' : 'bg-violet-100 text-violet-700'}`}>
                                                            {it.categoria === 'peca' ? 'P' : 'S'}
                                                          </span>
                                                        </td>
                                                        <td className="py-0.5 text-center">{it.quantidade}</td>
                                                        <td className="py-0.5 text-right">{fmt(it.valorUnit)}</td>
                                                        <td className="py-0.5 text-right font-medium">{fmt(it.valorTotal)}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </div>
                            );
                          })() : (
                            <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground text-sm">Carregando detalhe...</p></CardContent></Card>
                          )}
                        </>
                      )}

                      {maintTab === "fornecedores" && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-teal-600" />
                              Análise por Fornecedor
                              {temFiltro && <Badge variant="outline" className="text-[9px]">{filtroPeriodoLabel}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {ma.fornecedores.map((f: any, i: number) => {
                                const maxGasto = ma.fornecedores[0]?.totalGasto || 1;
                                const pct = Math.round((f.totalGasto / maxGasto) * 100);
                                return (
                                  <div key={i} className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-sm">{f.nome}</span>
                                      <span className="font-bold text-teal-700">{fmt(f.totalGasto)}</span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="flex gap-4 text-[10px] text-muted-foreground">
                                      <span>{f.numOS} OS</span>
                                      <span>Ticket médio: {fmt(f.ticketMedio)}</span>
                                      <span>{f.numVeiculos} veículo{f.numVeiculos > 1 ? "s" : ""}: {f.veiculos.slice(0, 3).join(", ")}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {maintTab === "evolucao" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-emerald-600" />
                                Evolução Mensal
                                {temFiltro && <Badge variant="outline" className="text-[9px]">{filtroPeriodoLabel}</Badge>}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                {evolKeys.map(mes => {
                                  const ev = (ma.evolucaoMensal as any)[mes];
                                  const pctMes = Math.round((ev.total / maxEvolTotal) * 100);
                                  const pctP = ev.total > 0 ? Math.round((ev.pecas / ev.total) * 100) : 0;
                                  return (
                                    <div key={mes} className="cursor-pointer hover:bg-muted/30 rounded p-1 -mx-1 transition-colors"
                                      onClick={() => { const [a,m] = mes.split("-"); setFiltroAno(Number(a)); setFiltroMes(Number(m)); }}>
                                      <div className="flex items-center justify-between text-xs mb-0.5">
                                        <span className="font-medium">{fmtMesAno(mes)}</span>
                                        <span className="font-bold">{fmt(ev.total)} <span className="text-muted-foreground font-normal">({ev.numOS} OS)</span></span>
                                      </div>
                                      <div className="h-3 bg-muted rounded-full overflow-hidden flex" style={{ width: `${Math.max(pctMes, 5)}%` }}>
                                        <div className="h-full bg-orange-500" style={{ width: `${pctP}%` }} />
                                        <div className="h-full bg-violet-500" style={{ width: `${100-pctP}%` }} />
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
                                <PieChart className="h-4 w-4 text-orange-600" />
                                Composição Geral
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="flex items-center gap-4">
                                <div className="relative h-28 w-28 mx-auto">
                                  <svg viewBox="0 0 36 36" className="h-28 w-28 transform -rotate-90">
                                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                                      className="text-orange-500" strokeDasharray={`${pctPecas} ${100-pctPecas}`} strokeLinecap="round" />
                                  </svg>
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-lg font-bold">{pctPecas}%</span>
                                  </div>
                                </div>
                                <div className="space-y-3 flex-1">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <div className="h-3 w-3 rounded-full bg-orange-500" />
                                      <span className="text-sm font-medium">Peças</span>
                                    </div>
                                    <p className="text-lg font-bold ml-5">{fmt(ma.categoriaTotais.pecas)}</p>
                                    <p className="text-[10px] text-muted-foreground ml-5">{ma.categoriaTotais.pecasCount} unidades</p>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <div className="h-3 w-3 rounded-full bg-violet-500" />
                                      <span className="text-sm font-medium">Serviços / MO</span>
                                    </div>
                                    <p className="text-lg font-bold ml-5">{fmt(ma.categoriaTotais.servicos)}</p>
                                    <p className="text-[10px] text-muted-foreground ml-5">{ma.categoriaTotais.servicosCount} lançamentos</p>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t pt-3">
                                <FinRow label="Total Geral" value={fmt(totalGeral)} bold />
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground text-sm">Dados indisponíveis</p></CardContent></Card>
                )}
              </TabsContent>

            </Tabs>
          </>
        )}
      </div>

      <Dialog open={!!custoMesDialog} onOpenChange={() => setCustoMesDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-orange-600" />
              Custos por Veículo — {custoMesDialog ? fmtMesAno(custoMesDialog) : ""}
            </DialogTitle>
          </DialogHeader>
          {d && custoMesDialog && (d as any).custosMensaisVeiculo?.[custoMesDialog] ? (() => {
            const veics = Object.values((d as any).custosMensaisVeiculo[custoMesDialog]) as Array<{placa: string; modelo: string; combustivel: number; manutencao: number; multas: number}>;
            const sorted = [...veics].sort((a, b) => (b.combustivel + b.manutencao + b.multas) - (a.combustivel + a.manutencao + a.multas));
            const totalMes = (d.custosTotaisByMonth as any)[custoMesDialog];
            return (
              <div className="space-y-3">
                {totalMes && (
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-200 text-center">
                      <p className="text-[10px] text-blue-600 uppercase font-medium">Combustível</p>
                      <p className="text-sm font-bold text-blue-700">{fmt(totalMes.combustivel)}</p>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
                      <p className="text-[10px] text-emerald-600 uppercase font-medium">Manutenção</p>
                      <p className="text-sm font-bold text-emerald-700">{fmt(totalMes.manutencao)}</p>
                    </div>
                    <div className="p-2.5 bg-red-50 rounded-lg border border-red-200 text-center">
                      <p className="text-[10px] text-red-600 uppercase font-medium">Multas</p>
                      <p className="text-sm font-bold text-red-700">{fmt(totalMes.multas)}</p>
                    </div>
                  </div>
                )}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-xs">
                        <th className="text-left p-2 font-medium">Veículo</th>
                        <th className="text-right p-2 font-medium text-blue-600">Combustível</th>
                        <th className="text-right p-2 font-medium text-emerald-600">Manutenção</th>
                        <th className="text-right p-2 font-medium text-red-600">Multas</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((v, i) => {
                        const total = v.combustivel + v.manutencao + v.multas;
                        return (
                          <tr key={i} className="border-t hover:bg-muted/30">
                            <td className="p-2">
                              <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-1.5">{v.placa}</span>
                              <span className="text-xs text-muted-foreground">{v.modelo}</span>
                            </td>
                            <td className="text-right p-2 text-xs">{v.combustivel > 0 ? fmt(v.combustivel) : "—"}</td>
                            <td className="text-right p-2 text-xs">{v.manutencao > 0 ? fmt(v.manutencao) : "—"}</td>
                            <td className="text-right p-2 text-xs">{v.multas > 0 ? fmt(v.multas) : "—"}</td>
                            <td className="text-right p-2 text-xs font-bold">{fmt(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })() : (
            <p className="text-sm text-muted-foreground">Nenhum dado para este mês.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!idadeDialog} onOpenChange={() => setIdadeDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-600" />
              Veículos — {idadeDialog}
            </DialogTitle>
          </DialogHeader>
          {d && idadeDialog && (d as any).idadeVeiculos?.[idadeDialog] ? (
            <div className="space-y-2">
              {([...((d as any).idadeVeiculos[idadeDialog] as Array<{id: number, placa: string, modelo: string, marca: string, ano: string, idade: number}>)].sort((a, b) => a.idade - b.idade)).map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Car className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{v.modelo}</p>
                    <p className="text-xs text-muted-foreground">{v.marca} — Ano {v.ano}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-mono text-sm font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{v.placa}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{v.idade} ano{v.idade !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum veículo nesta faixa.</p>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function KpiCard({
  icon: Icon, label, value, onClick, color, bg, sub, tip,
}: {
  icon: any; label: string; value: any; onClick?: () => void; color: string; bg: string; sub?: string; tip?: string;
}) {
  return (
    <Card className={`${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={onClick} title={tip}>
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
