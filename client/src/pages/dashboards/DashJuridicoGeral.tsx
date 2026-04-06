import { CHART_PALETTE } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Gavel, DollarSign, AlertTriangle, ShieldAlert,
  Loader2, BookOpen, Receipt, FileText,
  ArrowLeft, BarChart3
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useMemo } from "react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBRL0(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const RISCO_COLORS: Record<string, string> = {
  critico: "#ef4444",
  alto: "#f97316",
  medio: "#eab308",
  baixo: "#22c55e",
};

const RISCO_ORDER = ["critico", "alto", "medio", "baixo"];

export default function DashJuridicoGeral() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const enabled = isConstrutoras ? companyIds.length > 0 : companyId > 0;
  const queryArgs = { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) };

  const trab = trpc.dashboards.juridico.useQuery(queryArgs, { enabled });
  const trib = trpc.dashboards.tributario.useQuery(queryArgs, { enabled });
  const civ = trpc.dashboards.civil.useQuery(queryArgs, { enabled });

  const isLoading = trab.isLoading || trib.isLoading || civ.isLoading;

  const consolidated = useMemo(() => {
    const trabData = trab.data;
    const tribData = trib.data;
    const civData = civ.data;

    const trabTotal = trabData?.resumo?.totalProcessos ?? 0;
    const trabAtivos = trabData?.resumo?.processosAtivos ?? 0;
    const trabEncerrados = trabData?.resumo?.processosEncerrados ?? 0;
    const trabValorCausa = trabData?.resumo?.totalValorCausa ?? 0;

    const tribTotal = tribData?.resumo?.totalProcessos ?? 0;
    const tribAtivos = tribData?.resumo?.processosAtivos ?? 0;
    const tribEncerrados = tribData?.resumo?.processosEncerrados ?? 0;
    const tribValorCausa = tribData?.resumo?.totalValorCausa ?? 0;

    const civTotal = civData?.resumo?.totalProcessos ?? 0;
    const civAtivosCount = civData?.resumo?.processosAtivos ?? 0;
    const civEncerrados = civData?.resumo?.processosEncerrados ?? 0;
    const civValorCausa = civData?.resumo?.totalValorCausa ?? 0;

    const totalGeral = trabTotal + tribTotal + civTotal;
    const ativosGeral = trabAtivos + tribAtivos + civAtivosCount;
    const encerradosGeral = trabEncerrados + tribEncerrados + civEncerrados;
    const valorCausaGeral = trabValorCausa + tribValorCausa + civValorCausa;

    const riscoTrab: Record<string, number> = {};
    const riscoTrabValor: Record<string, number> = {};
    if (trabData?.porRisco) {
      for (const r of trabData.porRisco) {
        const key = r.label.toLowerCase();
        riscoTrab[key] = (riscoTrab[key] || 0) + r.value;
      }
    }
    if (trabData?.valorPorRisco) {
      for (const r of trabData.valorPorRisco) {
        riscoTrabValor[r.risco] = (riscoTrabValor[r.risco] || 0) + r.valor;
      }
    }

    const riscoTrib: Record<string, number> = {};
    const riscoTribValor: Record<string, number> = {};
    if (tribData?.porRisco) {
      for (const r of tribData.porRisco) {
        const key = r.label.toLowerCase();
        riscoTrib[key] = (riscoTrib[key] || 0) + r.value;
      }
    }
    if (tribData?.valorPorRisco) {
      for (const r of tribData.valorPorRisco) {
        riscoTribValor[r.risco] = (riscoTribValor[r.risco] || 0) + r.valor;
      }
    }

    const riscoCiv: Record<string, number> = {};
    const riscoCivValor: Record<string, number> = {};
    if (civData?.porRisco) {
      for (const r of civData.porRisco) {
        const key = r.label.toLowerCase();
        riscoCiv[key] = (riscoCiv[key] || 0) + r.value;
      }
    }
    if (civData?.valorPorRisco) {
      for (const r of civData.valorPorRisco) {
        riscoCivValor[r.risco] = (riscoCivValor[r.risco] || 0) + r.valor;
      }
    }

    const allRiscos = [...new Set([...Object.keys(riscoTrab), ...Object.keys(riscoTrib), ...Object.keys(riscoCiv)])];
    const riscoConsolidado = RISCO_ORDER.filter(r => allRiscos.includes(r)).map(r => ({
      risco: r,
      label: r.charAt(0).toUpperCase() + r.slice(1),
      trabalhista: riscoTrab[r] || 0,
      tributario: riscoTrib[r] || 0,
      civil: riscoCiv[r] || 0,
      total: (riscoTrab[r] || 0) + (riscoTrib[r] || 0) + (riscoCiv[r] || 0),
      valorTrab: riscoTrabValor[r] || 0,
      valorTrib: riscoTribValor[r] || 0,
      valorCiv: riscoCivValor[r] || 0,
      valorTotal: (riscoTrabValor[r] || 0) + (riscoTribValor[r] || 0) + (riscoCivValor[r] || 0),
    }));

    const altoCriticoGeral = riscoConsolidado
      .filter(r => r.risco === "alto" || r.risco === "critico")
      .reduce((s, r) => s + r.total, 0);

    const valorRiscoGeral = riscoConsolidado
      .filter(r => r.risco === "alto" || r.risco === "critico")
      .reduce((s, r) => s + r.valorTotal, 0);

    return {
      totalGeral,
      ativosGeral,
      encerradosGeral,
      valorCausaGeral,
      altoCriticoGeral,
      valorRiscoGeral,
      trabTotal, tribTotal, civTotal,
      trabAtivos, tribAtivos, civAtivosCount,
      trabValorCausa, tribValorCausa, civValorCausa,
      riscoConsolidado,
    };
  }, [trab.data, trib.data, civ.data]);

  const [, setLocation] = useLocation();

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
              <Link href="/painel/juridico" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar ao Painel Jurídico</Link>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              Dashboard Geral Jurídico
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1">Visão consolidada: Trabalhista + Tributário + Cível</p>
          </div>
          <PrintActions title="Dashboard Geral Jurídico" />
        </div>

        {!enabled ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : consolidated.totalGeral === 0 ? (
          <div className="text-center py-16 text-muted-foreground">Nenhum processo jurídico encontrado para esta empresa.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <DashKpi label="Total Processos" value={consolidated.totalGeral} icon={Gavel} color="blue" />
              <DashKpi label="Ativos" value={consolidated.ativosGeral} icon={AlertTriangle} color="amber" />
              <DashKpi label="Encerrados" value={consolidated.encerradosGeral} icon={FileText} color="green" />
              <DashKpi label="Alto/Crítico" value={consolidated.altoCriticoGeral} icon={ShieldAlert} color="red" />
              <DashKpi label="Valor em Causa" value={fmtBRL0(consolidated.valorCausaGeral)} icon={DollarSign} color="orange" />
              <DashKpi label="Risco Alto/Crítico" value={fmtBRL0(consolidated.valorRiscoGeral)} icon={ShieldAlert} color="red" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/processos-trabalhistas")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gavel className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-sm">Trabalhista</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-700">{consolidated.trabTotal}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{consolidated.trabAtivos}</p>
                      <p className="text-[10px] text-muted-foreground">Ativos</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-600">{fmtBRL0(consolidated.trabValorCausa)}</p>
                      <p className="text-[10px] text-muted-foreground">Valor</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-teal-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/processos-tributarios")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="h-5 w-5 text-teal-600" />
                    <h3 className="font-semibold text-sm">Tributário</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-bold text-teal-700">{consolidated.tribTotal}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{consolidated.tribAtivos}</p>
                      <p className="text-[10px] text-muted-foreground">Ativos</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-600">{fmtBRL0(consolidated.tribValorCausa)}</p>
                      <p className="text-[10px] text-muted-foreground">Valor</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-indigo-500 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/processos-civis")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-sm">Cível</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-bold text-indigo-700">{consolidated.civTotal}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{consolidated.civAtivosCount}</p>
                      <p className="text-[10px] text-muted-foreground">Ativos</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-600">{fmtBRL0(consolidated.civValorCausa)}</p>
                      <p className="text-[10px] text-muted-foreground">Valor</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DashChart
                title="Distribuição por Área"
                type="doughnut"
                labels={["Trabalhista", "Tributário", "Cível"]}
                datasets={[{
                  data: [consolidated.trabTotal, consolidated.tribTotal, consolidated.civTotal],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2], CHART_PALETTE[4]]
                }]}
                height={260}
              />
              <DashChart
                title="Valor em Causa por Área"
                type="doughnut"
                labels={["Trabalhista", "Tributário", "Cível"]}
                datasets={[{
                  data: [consolidated.trabValorCausa, consolidated.tribValorCausa, consolidated.civValorCausa],
                  backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2], CHART_PALETTE[4]]
                }]}
                height={260}
                valueFormatter={fmtBRL}
              />
            </div>

            {consolidated.riscoConsolidado.length > 0 && (
              <DashChart
                title="Processos por Nível de Risco (todas as áreas)"
                type="bar"
                labels={consolidated.riscoConsolidado.map(r => r.label)}
                datasets={[
                  { label: "Trabalhista", data: consolidated.riscoConsolidado.map(r => r.trabalhista), backgroundColor: CHART_PALETTE[0] },
                  { label: "Tributário", data: consolidated.riscoConsolidado.map(r => r.tributario), backgroundColor: CHART_PALETTE[2] },
                  { label: "Cível", data: consolidated.riscoConsolidado.map(r => r.civil), backgroundColor: CHART_PALETTE[4] },
                ]}
                height={300}
              />
            )}

            {consolidated.riscoConsolidado.length > 0 && (
              <DashChart
                title="Valor em Risco por Nível (todas as áreas)"
                type="bar"
                labels={consolidated.riscoConsolidado.map(r => r.label)}
                datasets={[
                  { label: "Trabalhista", data: consolidated.riscoConsolidado.map(r => r.valorTrab), backgroundColor: CHART_PALETTE[0] },
                  { label: "Tributário", data: consolidated.riscoConsolidado.map(r => r.valorTrib), backgroundColor: CHART_PALETTE[2] },
                  { label: "Cível", data: consolidated.riscoConsolidado.map(r => r.valorCiv), backgroundColor: CHART_PALETTE[4] },
                ]}
                height={300}
                valueFormatter={fmtBRL}
              />
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  Matriz de Risco Consolidada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="p-2.5 font-medium">Nível</th>
                        <th className="p-2.5 font-medium text-center">Trabalhista</th>
                        <th className="p-2.5 font-medium text-center">Tributário</th>
                        <th className="p-2.5 font-medium text-center">Cível</th>
                        <th className="p-2.5 font-medium text-center">Total</th>
                        <th className="p-2.5 font-medium text-right">Valor Trabalhista</th>
                        <th className="p-2.5 font-medium text-right">Valor Tributário</th>
                        <th className="p-2.5 font-medium text-right">Valor Cível</th>
                        <th className="p-2.5 font-medium text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidated.riscoConsolidado.map(r => (
                        <tr key={r.risco} className="border-b hover:bg-muted/30">
                          <td className="p-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISCO_COLORS[r.risco] }} />
                              <span className="font-medium">{r.label}</span>
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-semibold">{r.trabalhista}</td>
                          <td className="p-2.5 text-center font-semibold">{r.tributario}</td>
                          <td className="p-2.5 text-center font-semibold">{r.civil}</td>
                          <td className="p-2.5 text-center font-bold">{r.total}</td>
                          <td className="p-2.5 text-right text-xs">{fmtBRL(r.valorTrab)}</td>
                          <td className="p-2.5 text-right text-xs">{fmtBRL(r.valorTrib)}</td>
                          <td className="p-2.5 text-right text-xs">{fmtBRL(r.valorCiv)}</td>
                          <td className="p-2.5 text-right font-semibold">{fmtBRL(r.valorTotal)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/50 font-bold">
                        <td className="p-2.5">Total Geral</td>
                        <td className="p-2.5 text-center">{consolidated.riscoConsolidado.reduce((s, r) => s + r.trabalhista, 0)}</td>
                        <td className="p-2.5 text-center">{consolidated.riscoConsolidado.reduce((s, r) => s + r.tributario, 0)}</td>
                        <td className="p-2.5 text-center">{consolidated.riscoConsolidado.reduce((s, r) => s + r.civil, 0)}</td>
                        <td className="p-2.5 text-center">{consolidated.riscoConsolidado.reduce((s, r) => s + r.total, 0)}</td>
                        <td className="p-2.5 text-right">{fmtBRL(consolidated.riscoConsolidado.reduce((s, r) => s + r.valorTrab, 0))}</td>
                        <td className="p-2.5 text-right">{fmtBRL(consolidated.riscoConsolidado.reduce((s, r) => s + r.valorTrib, 0))}</td>
                        <td className="p-2.5 text-right">{fmtBRL(consolidated.riscoConsolidado.reduce((s, r) => s + r.valorCiv, 0))}</td>
                        <td className="p-2.5 text-right">{fmtBRL(consolidated.riscoConsolidado.reduce((s, r) => s + r.valorTotal, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/dashboards/juridico")}>
                <CardContent className="p-4 text-center">
                  <Gavel className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <p className="font-semibold text-sm">Dashboard Trabalhista</p>
                  <p className="text-xs text-muted-foreground mt-1">Ver análise detalhada</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/dashboards/tributario")}>
                <CardContent className="p-4 text-center">
                  <Receipt className="h-8 w-8 text-teal-600 mx-auto mb-2" />
                  <p className="font-semibold text-sm">Dashboard Tributário</p>
                  <p className="text-xs text-muted-foreground mt-1">Ver análise detalhada</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/dashboards/civil")}>
                <CardContent className="p-4 text-center">
                  <BookOpen className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                  <p className="font-semibold text-sm">Dashboard Cível</p>
                  <p className="text-xs text-muted-foreground mt-1">Ver análise detalhada</p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
