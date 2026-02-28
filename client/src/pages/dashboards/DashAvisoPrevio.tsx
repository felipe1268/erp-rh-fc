import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle, Clock, DollarSign, Users, CalendarDays,
  TrendingUp, Building2, Briefcase, Timer, ShieldAlert,
  CheckCircle2, XCircle, ArrowRight, Loader2, X, Ban,
  Wallet, Receipt, BarChart3
} from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Formata número para moeda brasileira: R$ 3.561,47 */
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata número curto para eixos dos gráficos: R$ 3,5 mil / R$ 1,2 mi */
function fmtBRLShort(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtBRL(v);
}

/** Formata valor de string do DB para exibição: "3561.47" -> "R$ 3.561,47" */
function fmtValorStr(v: string | null | undefined) {
  if (!v) return "-";
  const n = parseFloat(v);
  if (isNaN(n)) return "-";
  return fmtBRL(n);
}

function fmtTipoLabel(tipo: string) {
  const map: Record<string, string> = {
    empregador_trabalhado: "Empregador (Trabalhado)",
    empregador_indenizado: "Empregador (Indenizado)",
    empregado_trabalhado: "Empregado (Trabalhado)",
    empregado_indenizado: "Empregado (Indenizado)",
  };
  return map[tipo] || tipo;
}

function fmtReducaoLabel(r: string) {
  const map: Record<string, string> = {
    "2h_dia": "2h/dia",
    "7_dias_corridos": "7 dias corridos",
    nenhuma: "Nenhuma",
  };
  return map[r] || r;
}

function fmtStatus(s: string) {
  const map: Record<string, string> = {
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  return map[s] || s;
}

function statusColor(s: string) {
  if (s === "em_andamento") return "bg-amber-100 text-amber-700";
  if (s === "concluido") return "bg-green-100 text-green-700";
  if (s === "cancelado") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

export default function DashAvisoPrevio() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const { data, isLoading } = trpc.dashboards.avisoPrevio.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const [drillDown, setDrillDown] = useState<{ type: string; label: string } | null>(null);

  // Filtra avisos pelo drill-down selecionado
  const drillDownAvisos = useMemo(() => {
    if (!drillDown || !data) return [];
    return data.avisos.filter((a: any) => {
      if (drillDown.type === 'funcao') {
        const funcao = a.funcao || a.nomeCompleto;
        return funcao === drillDown.label || (funcao && funcao.startsWith(drillDown.label.replace('...', '')));
      }
      if (drillDown.type === 'setor') {
        return (a.setor || 'Sem Setor') === drillDown.label || (a.setor || 'Não informado') === drillDown.label;
      }
      if (drillDown.type === 'status') {
        return a.status === drillDown.label;
      }
      if (drillDown.type === 'tipo') {
        return a.tipo === drillDown.label;
      }
      if (drillDown.type === 'dias') {
        return String(a.diasAviso) === drillDown.label;
      }
      if (drillDown.type === 'anos') {
        return String(a.anosServico || 0) === drillDown.label;
      }
      if (drillDown.type === 'custoSetor') {
        return (a.setor || 'Não informado') === drillDown.label;
      }
      if (drillDown.type === 'mes') {
        const d = a.dataInicio ? new Date(a.dataInicio) : null;
        if (!d) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === drillDown.label;
      }
      if (drillDown.type === 'reducao') {
        const r = a.reducaoJornada || 'nenhuma';
        if (drillDown.label === '2h por dia') return r === '2h_dia';
        if (drillDown.label === '7 dias corridos') return r === '7_dias_corridos';
        if (drillDown.label === 'Nenhuma') return r === 'nenhuma' || !a.reducaoJornada;
        return false;
      }
      return false;
    });
  }, [drillDown, data]);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="text-sm text-muted-foreground hover:text-foreground">Dashboards</Link>
              <span className="text-muted-foreground">/</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Aviso Prévio</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise completa de avisos prévios, custos e prazos</p>
          </div>
          <PrintActions title="Dashboard Aviso Prévio" />
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* ===== SEÇÃO 1: RESUMO QUANTITATIVO ===== */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashKpi label="Total de Avisos" value={data.total} icon={AlertTriangle} color="blue" />
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'status', label: 'em_andamento' })}>
                <DashKpi label="Em Andamento" value={data.emAndamento} icon={Clock} color="orange" />
              </div>
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'status', label: 'concluido' })}>
                <DashKpi label="Concluídos" value={data.concluidos} icon={CheckCircle2} color="green" />
              </div>
              <div className="cursor-pointer" onClick={() => setDrillDown({ type: 'status', label: 'cancelado' })}>
                <DashKpi label="Cancelados" value={data.cancelados} icon={XCircle} color="red" />
              </div>
            </div>

            {/* ===== SEÇÃO 2: RESUMO FINANCEIRO (visão rápida) ===== */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Wallet className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Resumo Financeiro</h3>
                    <p className="text-[10px] text-muted-foreground">Visão consolidada dos custos de rescisão</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Custo Total */}
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-3 sm:p-4 text-center">
                    <DollarSign className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-700 tabular-nums">{fmtBRL(data.valorTotalEstimado)}</p>
                    <p className="text-[10px] sm:text-xs text-blue-600 font-medium mt-1">Custo Total Estimado</p>
                  </div>
                  {/* Em Andamento */}
                  <div className="rounded-xl border-2 border-orange-200 bg-orange-50/50 p-3 sm:p-4 text-center">
                    <Clock className="h-5 w-5 text-orange-500 mx-auto mb-1" />
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-orange-700 tabular-nums">{fmtBRL(data.valorEmAndamento)}</p>
                    <p className="text-[10px] sm:text-xs text-orange-600 font-medium mt-1">Custo Em Andamento</p>
                  </div>
                  {/* Concluído */}
                  <div className="rounded-xl border-2 border-green-200 bg-green-50/50 p-3 sm:p-4 text-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-700 tabular-nums">{fmtBRL(data.valorConcluido)}</p>
                    <p className="text-[10px] sm:text-xs text-green-600 font-medium mt-1">Custo Concluído</p>
                  </div>
                  {/* Cancelado */}
                  <div className="rounded-xl border-2 border-gray-200 bg-gray-50/50 p-3 sm:p-4 text-center">
                    <Ban className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-gray-500 tabular-nums">{fmtBRL(data.valorCancelado)}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 font-medium mt-1">Custo Cancelado</p>
                  </div>
                </div>
                {/* Barra visual de proporção */}
                {data.valorTotalEstimado > 0 && (
                  <div className="mt-4">
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                      {data.valorEmAndamento > 0 && (
                        <div
                          className="bg-orange-400 transition-all"
                          style={{ width: `${(data.valorEmAndamento / data.valorTotalEstimado) * 100}%` }}
                          title={`Em Andamento: ${fmtBRL(data.valorEmAndamento)} (${((data.valorEmAndamento / data.valorTotalEstimado) * 100).toFixed(1)}%)`}
                        />
                      )}
                      {data.valorConcluido > 0 && (
                        <div
                          className="bg-green-400 transition-all"
                          style={{ width: `${(data.valorConcluido / data.valorTotalEstimado) * 100}%` }}
                          title={`Concluído: ${fmtBRL(data.valorConcluido)} (${((data.valorConcluido / data.valorTotalEstimado) * 100).toFixed(1)}%)`}
                        />
                      )}
                      {data.valorCancelado > 0 && (
                        <div
                          className="bg-gray-300 transition-all"
                          style={{ width: `${(data.valorCancelado / data.valorTotalEstimado) * 100}%` }}
                          title={`Cancelado: ${fmtBRL(data.valorCancelado)} (${((data.valorCancelado / data.valorTotalEstimado) * 100).toFixed(1)}%)`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400 inline-block" /> Em Andamento ({data.valorTotalEstimado > 0 ? ((data.valorEmAndamento / data.valorTotalEstimado) * 100).toFixed(1) : 0}%)</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400 inline-block" /> Concluído ({data.valorTotalEstimado > 0 ? ((data.valorConcluido / data.valorTotalEstimado) * 100).toFixed(1) : 0}%)</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-300 inline-block" /> Cancelado ({data.valorTotalEstimado > 0 ? ((data.valorCancelado / data.valorTotalEstimado) * 100).toFixed(1) : 0}%)</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ===== SEÇÃO 3: ALERTAS ===== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DashKpi label="Vencendo em 7 dias" value={data.vencendo7dias} icon={ShieldAlert} color="red" sub="Atenção imediata" />
              <DashKpi label="Vencendo em 30 dias" value={data.vencendo30dias} icon={CalendarDays} color="yellow" sub="Planejamento" />
            </div>

            {/* ===== SEÇÃO 4: GRÁFICOS — Tipo + Redução ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DashChart
                title="Distribuição por Tipo de Aviso"
                type="doughnut"
                labels={[
                  "Empregador (Trabalhado)",
                  "Empregador (Indenizado)",
                  "Empregado (Trabalhado)",
                  "Empregado (Indenizado)",
                ]}
                datasets={[{
                  data: [
                    data.empregadorTrabalhado,
                    data.empregadorIndenizado,
                    data.empregadoTrabalhado,
                    data.empregadoIndenizado,
                  ],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2], CHART_PALETTE[1], CHART_PALETTE[3]],
                }]}
                height={280}
                onChartClick={(info) => {
                  const tipoMap: Record<string, string> = {
                    "Empregador (Trabalhado)": "empregador_trabalhado",
                    "Empregador (Indenizado)": "empregador_indenizado",
                    "Empregado (Trabalhado)": "empregado_trabalhado",
                    "Empregado (Indenizado)": "empregado_indenizado",
                  };
                  setDrillDown({ type: 'tipo', label: tipoMap[info.label] || info.label });
                }}
              />
              <DashChart
                title="Redução de Jornada (Art. 488 CLT)"
                type="doughnut"
                labels={["2h por dia", "7 dias corridos", "Nenhuma"]}
                datasets={[{
                  data: [data.reducao2h, data.reducao7dias, data.semReducao],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2], SEMANTIC_COLORS.neutro],
                }]}
                height={280}
                onChartClick={(info) => {
                  setDrillDown({ type: 'reducao', label: info.label });
                }}
              />
            </div>

            {/* ===== SEÇÃO 5: Evolução Mensal ===== */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Evolução Mensal de Avisos Prévios"
                type="bar"
                labels={data.evolucaoMensal.map((r: any) => {
                  const [y, m] = r.mes.split("-");
                  return `${m}/${y.slice(2)}`;
                })}
                datasets={[
                  {
                    label: "Trabalhado",
                    data: data.evolucaoMensal.map((r: any) => r.trabalhado),
                    backgroundColor: CHART_PALETTE[0],
                  },
                  {
                    label: "Indenizado",
                    data: data.evolucaoMensal.map((r: any) => r.indenizado),
                    backgroundColor: CHART_PALETTE[2],
                  },
                ]}
                height={280}
                onChartClick={(info) => {
                  const mesData = data.evolucaoMensal[info.dataIndex];
                  if (mesData) setDrillDown({ type: 'mes', label: mesData.mes });
                }}
              />
            )}

            {/* ===== SEÇÃO 6: Por Setor + Por Função ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.setorDist.length > 0 && (
                <DashChart
                  title="Avisos por Setor"
                  type="horizontalBar"
                  labels={data.setorDist.map((s: any) => s.setor)}
                  datasets={[{
                    label: "Avisos",
                    data: data.setorDist.map((s: any) => s.count),
                    backgroundColor: CHART_PALETTE[0],
                  }]}
                  height={Math.max(200, data.setorDist.length * 40)}
                  onChartClick={(info) => setDrillDown({ type: 'setor', label: info.label })}
                />
              )}
              {data.funcaoDist.length > 0 && (
                <DashChart
                  title="Top 10 Funções com Avisos"
                  type="horizontalBar"
                  labels={data.funcaoDist.map((f: any) => f.funcao.length > 25 ? f.funcao.slice(0, 25) + "..." : f.funcao)}
                  datasets={[{
                    label: "Avisos",
                    data: data.funcaoDist.map((f: any) => f.count),
                    backgroundColor: CHART_PALETTE[3],
                  }]}
                  height={Math.max(200, data.funcaoDist.length * 40)}
                  onChartClick={(info) => {
                    const fullLabel = data.funcaoDist[info.dataIndex]?.funcao || info.label;
                    setDrillDown({ type: 'funcao', label: fullLabel });
                  }}
                />
              )}
            </div>

            {/* ===== SEÇÃO 7: Custo por Setor ===== */}
            {data.custoPorSetor.length > 0 && (
              <DashChart
                title="Custo Estimado de Rescisão por Setor"
                type="bar"
                labels={data.custoPorSetor.map((s: any) => s.setor)}
                datasets={[{
                  label: "Valor (R$)",
                  data: data.custoPorSetor.map((s: any) => s.valor),
                  backgroundColor: data.custoPorSetor.map((_: any, i: number) => CHART_PALETTE[i % CHART_PALETTE.length]),
                }]}
                height={280}
                valueFormatter={fmtBRLShort}
                onChartClick={(info) => {
                  setDrillDown({ type: 'custoSetor', label: info.label });
                }}
              />
            )}

            {/* ===== SEÇÃO 8: Composição das Rescisões ===== */}
            {data.breakdownRescisao.some((b: any) => b.valor > 0) && (
              <DashChart
                title="Composição Total das Rescisões"
                type="bar"
                labels={data.breakdownRescisao.map((b: any) => b.componente)}
                datasets={[{
                  label: "Valor Total (R$)",
                  data: data.breakdownRescisao.map((b: any) => b.valor),
                  backgroundColor: [
                    CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2],
                    CHART_PALETTE[4], SEMANTIC_COLORS.negativo, CHART_PALETTE[3],
                  ],
                }]}
                height={280}
                valueFormatter={fmtBRLShort}
              />
            )}

            {/* ===== SEÇÃO 9: Dias de Aviso + Anos de Serviço ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.diasAvisoDist.length > 0 && (
                <DashChart
                  title="Distribuição de Dias de Aviso (Lei 12.506/2011)"
                  type="bar"
                  labels={data.diasAvisoDist.map((d: any) => `${d.dias} dias`)}
                  datasets={[{
                    label: "Avisos",
                    data: data.diasAvisoDist.map((d: any) => d.count),
                    backgroundColor: CHART_PALETTE[4],
                  }]}
                  height={260}
                  onChartClick={(info) => {
                    const diasStr = info.label.replace(' dias', '');
                    setDrillDown({ type: 'dias', label: diasStr });
                  }}
                />
              )}
              {data.anosServicoDist.length > 0 && (
                <DashChart
                  title="Distribuição por Anos de Serviço"
                  type="bar"
                  labels={data.anosServicoDist.map((a: any) => a.anos === 0 ? "< 1 ano" : `${a.anos} ano${a.anos > 1 ? "s" : ""}`)}
                  datasets={[{
                    label: "Avisos",
                    data: data.anosServicoDist.map((a: any) => a.count),
                    backgroundColor: CHART_PALETTE[1],
                  }]}
                  height={260}
                  onChartClick={(info) => {
                    const anosData = data.anosServicoDist[info.dataIndex];
                    if (anosData) setDrillDown({ type: 'anos', label: String(anosData.anos) });
                  }}
                />
              )}
            </div>

            {/* ===== SEÇÃO 10: Tabela Detalhada ===== */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Avisos Prévios Detalhados ({data.avisos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.avisos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum aviso prévio registrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Funcionário</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Tipo</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Início</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Fim</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Dias</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Redução</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Setor</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Valor Est.</th>
                          <th className="py-2 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.avisos.map((a: any) => (
                          <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{a.nomeCompleto}</td>
                            <td className="py-2 pr-3 text-xs">{fmtTipoLabel(a.tipo)}</td>
                            <td className="py-2 pr-3 text-xs">{a.dataInicio ? new Date(a.dataInicio + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                            <td className="py-2 pr-3 text-xs font-semibold">{a.dataFim ? new Date(a.dataFim + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                            <td className="py-2 pr-3 text-center font-mono">{a.diasAviso}</td>
                            <td className="py-2 pr-3 text-xs">{fmtReducaoLabel(a.reducaoJornada || "nenhuma")}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{a.setor || "-"}</td>
                            <td className="py-2 pr-3 text-xs font-semibold text-right tabular-nums">
                              {fmtValorStr(a.valorEstimadoTotal)}
                            </td>
                            <td className="py-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor(a.status)}`}>
                                {fmtStatus(a.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ===== DRILL-DOWN DIALOG ===== */}
            <Dialog open={!!drillDown} onOpenChange={(open) => !open && setDrillDown(null)}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    {drillDown?.type === 'funcao' ? <Briefcase className="h-5 w-5 text-purple-500" /> :
                     drillDown?.type === 'setor' || drillDown?.type === 'custoSetor' ? <Building2 className="h-5 w-5 text-blue-500" /> :
                     drillDown?.type === 'status' ? <BarChart3 className="h-5 w-5 text-blue-500" /> :
                     <AlertTriangle className="h-5 w-5 text-amber-500" />}
                    {drillDown?.type === 'funcao' ? `Função: ${drillDown?.label}` :
                     drillDown?.type === 'setor' || drillDown?.type === 'custoSetor' ? `Setor: ${drillDown?.label}` :
                     drillDown?.type === 'status' ? `Status: ${fmtStatus(drillDown?.label || '')}` :
                     drillDown?.type === 'tipo' ? `Tipo: ${fmtTipoLabel(drillDown?.label || '')}` :
                     drillDown?.type === 'dias' ? `Dias de Aviso: ${drillDown?.label}` :
                     drillDown?.type === 'anos' ? `Anos de Serviço: ${drillDown?.label === '0' ? '< 1 ano' : drillDown?.label + ' ano(s)'}` :
                     drillDown?.type === 'mes' ? `Mês: ${drillDown?.label}` :
                     drillDown?.type === 'reducao' ? `Redução: ${drillDown?.label}` :
                     drillDown?.label}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    {drillDownAvisos.length} aviso(s) prévio(s) encontrado(s)
                    {drillDownAvisos.length > 0 && (
                      <span className="ml-2 font-semibold text-red-600">
                        Total: {fmtBRL(drillDownAvisos.reduce((sum: number, a: any) => sum + parseFloat(a.valorEstimadoTotal || '0'), 0))}
                      </span>
                    )}
                  </p>
                  {drillDownAvisos.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Nenhum aviso encontrado para este filtro.</p>
                  ) : (
                    <div className="space-y-2">
                      {drillDownAvisos.map((a: any) => (
                        <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{a.nomeCompleto}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtTipoLabel(a.tipo)} · {a.diasAviso} dias · {fmtReducaoLabel(a.reducaoJornada || 'nenhuma')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {a.dataInicio ? new Date(a.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : '-'} → {a.dataFim ? new Date(a.dataFim + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                            </p>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <p className="font-bold text-sm text-red-600">{fmtValorStr(a.valorEstimadoTotal)}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusColor(a.status)}`}>
                              {fmtStatus(a.status)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* ===== INFORMAÇÃO LEGAL ===== */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Briefcase className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">Lei 12.506/2011 - Aviso Prévio Proporcional</p>
                    <p>O aviso prévio é de 30 dias para empregados com até 1 ano de serviço, acrescido de 3 dias por ano adicional, até o máximo de 90 dias. A redução de jornada (Art. 488 CLT) permite ao empregado reduzir 2 horas diárias ou faltar 7 dias corridos durante o aviso trabalhado.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
