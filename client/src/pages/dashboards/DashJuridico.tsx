import { SEMANTIC_COLORS, CHART_PALETTE } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import BrazilMap from "@/components/BrazilMap";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gavel, DollarSign, AlertTriangle, Scale, Calendar, FileText, TrendingUp, ShieldAlert, ArrowLeft, MapPin } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const RISCO_COLORS: Record<string, string> = {
  "alto": SEMANTIC_COLORS.riscoAlto, "medio": SEMANTIC_COLORS.riscoMedio, "baixo": SEMANTIC_COLORS.riscoBaixo, "remoto": SEMANTIC_COLORS.riscoRemoto,
};

export default function DashJuridico() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const { data, isLoading } = trpc.dashboards.juridico.useQuery({ companyId }, { enabled: companyId > 0 });

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard Jurídico</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1">Processos trabalhistas, valores e riscos</p>
          </div>
          <PrintActions title="Dashboard Jurídico" />
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <DashKpi label="Total Processos" value={data.resumo.totalProcessos} icon={Gavel} color="blue" />
              <DashKpi label="Ativos" value={data.resumo.processosAtivos} icon={AlertTriangle} color="red" />
              <DashKpi label="Encerrados" value={data.resumo.processosEncerrados} icon={FileText} color="green" />
              <DashKpi label="Valor em Risco" value={fmtBRL(data.resumo.valorEmRisco)} icon={ShieldAlert} color="orange" />
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <DashKpi label="Valor da Causa" value={fmtBRL(data.resumo.totalValorCausa)} icon={DollarSign} color="red" />
              <DashKpi label="Condenação" value={fmtBRL(data.resumo.totalValorCondenacao)} icon={Scale} color="purple" />
              <DashKpi label="Acordos" value={fmtBRL(data.resumo.totalValorAcordo)} icon={TrendingUp} color="teal" />
              <DashKpi label="Valor Pago" value={fmtBRL(data.resumo.totalValorPago)} icon={DollarSign} color="slate" />
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <DashChart
                title="Processos por Status"
                type="doughnut"
                labels={data.porStatus.map(s => s.label)}
                datasets={[{ data: data.porStatus.map(s => s.value), backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2], CHART_PALETTE[3], CHART_PALETTE[4], CHART_PALETTE[5]] }]}
                height={240}
              />
              <DashChart
                title="Processos por Risco"
                type="doughnut"
                labels={data.porRisco.map(r => r.label)}
                datasets={[{ data: data.porRisco.map(r => r.value), backgroundColor: data.porRisco.map(r => RISCO_COLORS[r.label] || SEMANTIC_COLORS.neutro) }]}
                height={240}
              />
              <DashChart
                title="Processos por Fase"
                type="pie"
                labels={data.porFase.map(f => f.label)}
                datasets={[{ data: data.porFase.map(f => f.value) }]}
                height={240}
              />
            </div>

            {/* Tipo de Ação */}
            {data.porTipo.length > 0 && (
              <DashChart
                title="Processos por Tipo de Ação"
                type="horizontalBar"
                labels={data.porTipo.map(t => t.label)}
                datasets={[{ label: "Processos", data: data.porTipo.map(t => t.value), backgroundColor: CHART_PALETTE[0] }]}
                height={Math.max(200, data.porTipo.length * 35)}
              />
            )}

            {/* Valor em Risco por Nível */}
            {data.valorPorRisco.length > 0 && (
              <DashChart
                title="Valor em Risco por Nível"
                type="bar"
                labels={data.valorPorRisco.map(r => r.risco.charAt(0).toUpperCase() + r.risco.slice(1))}
                datasets={[{ label: "Valor em Risco", data: data.valorPorRisco.map(r => r.valor), backgroundColor: data.valorPorRisco.map(r => RISCO_COLORS[r.risco] || SEMANTIC_COLORS.neutro) }]}
                height={280}
                valueFormatter={(v) => fmtBRL(v)}
                onChartClick={(info) => {
                  const risco = data.valorPorRisco[info.dataIndex]?.risco;
                  if (risco) alert(`Risco ${risco.charAt(0).toUpperCase() + risco.slice(1)}:\n\nValor total: ${fmtBRL(info.value)}`);
                }}
              />
            )}

            {/* Evolução mensal */}
            {data.evolucaoMensal.length > 0 && (() => {
              // Filter out entries without valid date ("Desconhecido") to avoid undefined labels
              const validEntries = data.evolucaoMensal.filter(r => r.mes && r.mes !== "Desconhecido" && r.mes.includes("-"));
              const unknownCount = data.evolucaoMensal.filter(r => !r.mes || r.mes === "Desconhecido" || !r.mes.includes("-")).reduce((s, r) => s + r.count, 0);
              // Add unknown at the end if any
              const entries = unknownCount > 0 ? [...validEntries, { mes: "_sem_data", count: unknownCount }] : validEntries;
              return entries.length > 0 ? (
                <DashChart
                  title="Novos Processos por Mês (data de distribuição)"
                  type="bar"
                  labels={entries.map(r => {
                    if (r.mes === "_sem_data") return "Sem data";
                    const parts = r.mes.split("-");
                    if (parts.length === 2) return `${parts[1]}/${parts[0].slice(2)}`;
                    return r.mes;
                  })}
                  datasets={[{ label: "Processos", data: entries.map(r => r.count), backgroundColor: SEMANTIC_COLORS.negativo }]}
                  height={260}
                />
              ) : null;
            })()}

            {/* Top Assuntos (DataJud) */}
            {(data as any).topAssuntos?.length > 0 && (
              <DashChart
                title="Assuntos Mais Comuns nos Processos (DataJud)"
                type="horizontalBar"
                labels={(data as any).topAssuntos.map((a: any) => a.assunto.length > 40 ? a.assunto.slice(0, 40) + "..." : a.assunto)}
                datasets={[{ label: "Ocorrências", data: (data as any).topAssuntos.map((a: any) => a.count), backgroundColor: CHART_PALETTE[4] }]}
                height={Math.max(200, (data as any).topAssuntos.length * 35)}
              />
            )}

            {/* Top Pedidos (se houver) */}
            {data.topPedidos.length > 0 && (
              <DashChart
                title="Pedidos Mais Comuns nos Processos"
                type="horizontalBar"
                labels={data.topPedidos.map(p => p.pedido.length > 35 ? p.pedido.slice(0, 35) + "..." : p.pedido)}
                datasets={[{ label: "Ocorrências", data: data.topPedidos.map(p => p.count), backgroundColor: CHART_PALETTE[3] }]}
                height={Math.max(200, data.topPedidos.length * 30)}
              />
            )}

            {/* Mapa do Brasil - Processos por Estado */}
            <BrazilMap
              title="Distribuição Geográfica dos Processos"
              icon={<MapPin className="h-4 w-4 text-red-500" />}
              data={(data as any).porEstado || []}
              colorScheme="red"
              onStateClick={(state, name) => {
                const count = (data as any).porEstado?.find((s: any) => s.state === state)?.count || 0;
                alert(`${name} (${state}): ${count} processo${count !== 1 ? 's' : ''}`);
              }}
            />

            {/* Próximas Audiências */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  Próximas Audiências
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.proximasAudiencias.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma audiência agendada</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Data</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Processo</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Reclamante</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Vara</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Risco</th>
                          <th className="py-2 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.proximasAudiencias.map((a, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-semibold">{a.data ? new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                            <td className="py-2 pr-3 text-xs font-mono">{a.numero}</td>
                            <td className="py-2 pr-3 font-medium truncate max-w-[150px]">{a.reclamante}</td>
                            <td className="py-2 pr-3 text-muted-foreground text-xs">{a.vara}</td>
                            <td className="py-2 pr-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${a.risco === "alto" ? "bg-red-100 text-red-700" : a.risco === "medio" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                {a.risco}
                              </span>
                            </td>
                            <td className="py-2 text-xs text-muted-foreground">{a.status?.replace(/_/g, " ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
