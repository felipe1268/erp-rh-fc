import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle, Clock, DollarSign, Users, CalendarDays,
  TrendingUp, Building2, Briefcase, Timer, ShieldAlert,
  CheckCircle2, XCircle, ArrowRight, Loader2
} from "lucide-react";
import { Link } from "wouter";

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
            {/* KPIs Principais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashKpi label="Total de Avisos" value={data.total} icon={AlertTriangle} color="blue" />
              <DashKpi label="Em Andamento" value={data.emAndamento} icon={Clock} color="orange" />
              <DashKpi label="Concluídos" value={data.concluidos} icon={CheckCircle2} color="green" />
              <DashKpi label="Cancelados" value={data.cancelados} icon={XCircle} color="red" />
            </div>

            {/* KPIs Financeiros e Alertas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashKpi label="Custo Total Estimado" value={fmtBRL(data.valorTotalEstimado)} icon={DollarSign} color="red" />
              <DashKpi label="Custo Em Andamento" value={fmtBRL(data.valorEmAndamento)} icon={DollarSign} color="orange" />
              <DashKpi label="Vencendo em 7 dias" value={data.vencendo7dias} icon={ShieldAlert} color="red" sub="Atenção imediata" />
              <DashKpi label="Vencendo em 30 dias" value={data.vencendo30dias} icon={CalendarDays} color="yellow" sub="Planejamento" />
            </div>

            {/* Row: Tipo de Aviso + Redução de Jornada */}
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
              />
            </div>

            {/* Evolução Mensal */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Evolução Mensal de Avisos Prévios"
                type="bar"
                labels={data.evolucaoMensal.map(r => {
                  const [y, m] = r.mes.split("-");
                  return `${m}/${y.slice(2)}`;
                })}
                datasets={[
                  {
                    label: "Trabalhado",
                    data: data.evolucaoMensal.map(r => r.trabalhado),
                    backgroundColor: CHART_PALETTE[0],
                  },
                  {
                    label: "Indenizado",
                    data: data.evolucaoMensal.map(r => r.indenizado),
                    backgroundColor: CHART_PALETTE[2],
                  },
                ]}
                height={280}
              />
            )}

            {/* Row: Por Setor + Por Função */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.setorDist.length > 0 && (
                <DashChart
                  title="Avisos por Setor"
                  type="horizontalBar"
                  labels={data.setorDist.map(s => s.setor)}
                  datasets={[{
                    label: "Avisos",
                    data: data.setorDist.map(s => s.count),
                    backgroundColor: CHART_PALETTE[0],
                  }]}
                  height={Math.max(200, data.setorDist.length * 40)}
                />
              )}
              {data.funcaoDist.length > 0 && (
                <DashChart
                  title="Top 10 Funções com Avisos"
                  type="horizontalBar"
                  labels={data.funcaoDist.map(f => f.funcao.length > 25 ? f.funcao.slice(0, 25) + "..." : f.funcao)}
                  datasets={[{
                    label: "Avisos",
                    data: data.funcaoDist.map(f => f.count),
                    backgroundColor: CHART_PALETTE[3],
                  }]}
                  height={Math.max(200, data.funcaoDist.length * 40)}
                />
              )}
            </div>

            {/* Custo por Setor - com formatação BRL */}
            {data.custoPorSetor.length > 0 && (
              <DashChart
                title="Custo Estimado de Rescisão por Setor"
                type="bar"
                labels={data.custoPorSetor.map(s => s.setor)}
                datasets={[{
                  label: "Valor (R$)",
                  data: data.custoPorSetor.map(s => s.valor),
                  backgroundColor: data.custoPorSetor.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
                }]}
                height={280}
                valueFormatter={fmtBRLShort}
              />
            )}

            {/* Breakdown da Rescisão - com formatação BRL */}
            {data.breakdownRescisao.some(b => b.valor > 0) && (
              <DashChart
                title="Composição Total das Rescisões"
                type="bar"
                labels={data.breakdownRescisao.map(b => b.componente)}
                datasets={[{
                  label: "Valor Total (R$)",
                  data: data.breakdownRescisao.map(b => b.valor),
                  backgroundColor: [
                    CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2],
                    CHART_PALETTE[4], SEMANTIC_COLORS.negativo, CHART_PALETTE[3],
                  ],
                }]}
                height={280}
                valueFormatter={fmtBRLShort}
              />
            )}

            {/* Row: Dias de Aviso + Anos de Serviço */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.diasAvisoDist.length > 0 && (
                <DashChart
                  title="Distribuição de Dias de Aviso (Lei 12.506/2011)"
                  type="bar"
                  labels={data.diasAvisoDist.map(d => `${d.dias} dias`)}
                  datasets={[{
                    label: "Avisos",
                    data: data.diasAvisoDist.map(d => d.count),
                    backgroundColor: CHART_PALETTE[4],
                  }]}
                  height={260}
                />
              )}
              {data.anosServicoDist.length > 0 && (
                <DashChart
                  title="Distribuição por Anos de Serviço"
                  type="bar"
                  labels={data.anosServicoDist.map(a => a.anos === 0 ? "< 1 ano" : `${a.anos} ano${a.anos > 1 ? "s" : ""}`)}
                  datasets={[{
                    label: "Avisos",
                    data: data.anosServicoDist.map(a => a.count),
                    backgroundColor: CHART_PALETTE[1],
                  }]}
                  height={260}
                />
              )}
            </div>

            {/* Tabela Detalhada */}
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
                        {data.avisos.map((a) => (
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

            {/* Informação Legal */}
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
