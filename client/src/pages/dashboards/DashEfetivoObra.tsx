import { useState, useMemo } from "react";
import { CHART_PALETTE, getChartColors } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HardHat, Users, Building2, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, UserX, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function DashEfetivoObra() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);

  // Dados
  const { data: efetivoPorObra, isLoading: loadingEfetivo } = trpc.obras.efetivoPorObra.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const { data: historicoData, isLoading: loadingHistorico } = trpc.obras.efetivoHistorico.useQuery(
    { companyId, meses: 24 },
    { enabled: companyId > 0 }
  );
  const { data: semObra, isLoading: loadingSemObra } = trpc.obras.semObra.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const { data: inconsistenciasCount } = trpc.obras.inconsistenciasCount.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const isLoading = loadingEfetivo || loadingHistorico || loadingSemObra;

  // Filtrar histórico pelo ano selecionado
  const historicoFiltrado = useMemo(() => {
    if (!historicoData) return [];
    return (historicoData as any[]).filter((h: any) => h.mes.startsWith(String(ano)));
  }, [historicoData, ano]);

  // KPIs
  const totalFuncionariosAlocados = useMemo(() => {
    if (!efetivoPorObra) return 0;
    return (efetivoPorObra as any[]).reduce((acc: number, o: any) => acc + (o.efetivo || 0), 0);
  }, [efetivoPorObra]);

  const totalObrasComEfetivo = useMemo(() => {
    if (!efetivoPorObra) return 0;
    return (efetivoPorObra as any[]).filter((o: any) => o.efetivo > 0).length;
  }, [efetivoPorObra]);

  const totalSemObra = (semObra as any[] || []).length;
  const totalInconsistencias = (inconsistenciasCount as any)?.count || 0;

  // Histograma: efetivo por obra (barras horizontais)
  const obraLabels = useMemo(() => {
    if (!efetivoPorObra) return [];
    return (efetivoPorObra as any[])
      .sort((a: any, b: any) => (b.efetivo || 0) - (a.efetivo || 0))
      .map((o: any) => o.obraNome || `Obra #${o.obraId}`);
  }, [efetivoPorObra]);

  const obraValues = useMemo(() => {
    if (!efetivoPorObra) return [];
    return (efetivoPorObra as any[])
      .sort((a: any, b: any) => (b.efetivo || 0) - (a.efetivo || 0))
      .map((o: any) => o.efetivo || 0);
  }, [efetivoPorObra]);

  // Evolução mensal: stacked bar chart por obra
  const mesesDoAno = useMemo(() => {
    const meses: string[] = [];
    for (let m = 1; m <= 12; m++) {
      meses.push(`${ano}-${String(m).padStart(2, '0')}`);
    }
    return meses;
  }, [ano]);

  const mesesLabels = useMemo(() => {
    return mesesDoAno.map(m => {
      const [, mes] = m.split('-');
      const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      return nomes[parseInt(mes) - 1] || mes;
    });
  }, [mesesDoAno]);

  const obrasUnicas = useMemo(() => {
    if (!historicoFiltrado.length) return [];
    const set = new Map<number, string>();
    historicoFiltrado.forEach((h: any) => {
      if (!set.has(h.obraId)) set.set(h.obraId, h.obraNome);
    });
    return Array.from(set.entries()).map(([id, nome]) => ({ id, nome }));
  }, [historicoFiltrado]);

  const evolucaoDatasets = useMemo(() => {
    const colors = getChartColors(obrasUnicas.length);
    return obrasUnicas.map((obra, idx) => ({
      label: obra.nome,
      data: mesesDoAno.map(mes => {
        const found = historicoFiltrado.find((h: any) => h.obraId === obra.id && h.mes === mes);
        return found ? found.efetivo : 0;
      }),
      backgroundColor: colors[idx] || CHART_PALETTE[idx % CHART_PALETTE.length],
    }));
  }, [obrasUnicas, mesesDoAno, historicoFiltrado]);

  // Total mensal (linha de tendência)
  const totalMensal = useMemo(() => {
    return mesesDoAno.map(mes => {
      return historicoFiltrado
        .filter((h: any) => h.mes === mes)
        .reduce((acc: number, h: any) => acc + h.efetivo, 0);
    });
  }, [mesesDoAno, historicoFiltrado]);

  // Variação mês a mês
  const variacao = useMemo(() => {
    const nonZero = totalMensal.filter(v => v > 0);
    if (nonZero.length < 2) return null;
    const ultimo = nonZero[nonZero.length - 1];
    const penultimo = nonZero[nonZero.length - 2];
    const diff = ultimo - penultimo;
    const pct = penultimo > 0 ? ((diff / penultimo) * 100).toFixed(1) : '0';
    return { diff, pct, cresceu: diff >= 0 };
  }, [totalMensal]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboards">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="h-10 w-10 rounded-lg bg-orange-600 flex items-center justify-center">
              <HardHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Efetivo por Obra</h1>
              <p className="text-sm text-muted-foreground">
                Distribuição e evolução da mão de obra por obra
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Seletor de Ano */}
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold min-w-[4rem] text-center">{ano}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a + 1)} disabled={ano >= currentYear}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <PrintActions title="Efetivo por Obra" />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashKpi
            label="Funcionários Alocados"
            value={totalFuncionariosAlocados}
            color="blue"
            icon={Users}
            sub="Em obras ativas"
          />
          <DashKpi
            label="Obras com Efetivo"
            value={totalObrasComEfetivo}
            color="green"
            icon={Building2}
            sub="Obras em atividade"
          />
          <DashKpi
            label="Sem Obra Vinculada"
            value={totalSemObra}
            color={totalSemObra > 0 ? "amber" : "green"}
            icon={UserX}
            sub={totalSemObra > 0 ? "Precisam ser alocados" : "Todos alocados"}
          />
          <DashKpi
            label="Inconsistências"
            value={totalInconsistencias}
            color={totalInconsistencias > 0 ? "red" : "green"}
            icon={AlertTriangle}
            sub={totalInconsistencias > 0 ? "Ponto x Alocação" : "Nenhuma pendência"}
          />
        </div>

        {/* Variação */}
        {variacao && (
          <Card className="border-l-4" style={{ borderLeftColor: variacao.cresceu ? '#22c55e' : '#ef4444' }}>
            <CardContent className="py-3 flex items-center gap-3">
              {variacao.cresceu ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
              <span className="text-sm">
                Efetivo total {variacao.cresceu ? 'cresceu' : 'reduziu'}{' '}
                <strong>{Math.abs(variacao.diff)} funcionário{Math.abs(variacao.diff) !== 1 ? 's' : ''}</strong>{' '}
                ({variacao.cresceu ? '+' : ''}{variacao.pct}%) em relação ao mês anterior
              </span>
            </CardContent>
          </Card>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Histograma: Efetivo por Obra (atual) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <HardHat className="h-4 w-4 text-orange-600" />
                Efetivo Atual por Obra
              </CardTitle>
            </CardHeader>
            <CardContent>
              {obraLabels.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  Nenhuma obra com funcionários alocados
                </div>
              ) : (
                <DashChart
                  title=""
                  type="bar"
                  labels={obraLabels}
                  datasets={[{
                    label: "Funcionários",
                    data: obraValues,
                    backgroundColor: getChartColors(obraLabels.length),
                  }]}
                  height={Math.max(200, obraLabels.length * 35)}
                  showPercentage={false}
                />
              )}
            </CardContent>
          </Card>

          {/* Distribuição percentual (pizza) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Distribuição Percentual
              </CardTitle>
            </CardHeader>
            <CardContent>
              {obraLabels.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  Sem dados
                </div>
              ) : (
                <DashChart
                  title=""
                  type="doughnut"
                  labels={obraLabels}
                  datasets={[{
                    label: "Funcionários",
                    data: obraValues,
                    backgroundColor: getChartColors(obraLabels.length),
                  }]}
                  height={280}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Evolução Mensal (stacked bar) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-indigo-600" />
              Evolução Mensal do Efetivo — {ano}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evolucaoDatasets.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sem dados de histórico para {ano}
              </div>
            ) : (
              <DashChart
                title=""
                type="bar"
                labels={mesesLabels}
                datasets={evolucaoDatasets}
                height={320}
                showPercentage={false}
              />
            )}
          </CardContent>
        </Card>

        {/* Tabela de Efetivo Detalhado */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Detalhamento por Obra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Obra</th>
                    <th className="text-center p-3 font-medium">Efetivo Atual</th>
                    <th className="text-center p-3 font-medium">% do Total</th>
                    <th className="text-right p-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(efetivoPorObra as any[] || [])
                    .sort((a: any, b: any) => (b.efetivo || 0) - (a.efetivo || 0))
                    .map((obra: any, idx: number) => {
                      const pct = totalFuncionariosAlocados > 0
                        ? ((obra.efetivo / totalFuncionariosAlocados) * 100).toFixed(1)
                        : '0';
                      return (
                        <tr key={obra.obraId || idx} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: getChartColors(obraLabels.length)[idx] || CHART_PALETTE[0] }}
                              />
                              <span className="font-medium">{obra.obraNome || `Obra #${obra.obraId}`}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-lg">{obra.efetivo || 0}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: getChartColors(obraLabels.length)[idx] || CHART_PALETTE[0],
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">{pct}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <Link href="/obras/efetivo">
                              <Button variant="ghost" size="sm" className="text-xs">
                                Ver equipe
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  {totalSemObra > 0 && (
                    <tr className="border-b bg-amber-50/50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <UserX className="h-3 w-3 text-amber-600" />
                          <span className="font-medium text-amber-700">Sem Obra Vinculada</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-lg text-amber-700">{totalSemObra}</td>
                      <td className="p-3 text-center text-xs text-amber-600">—</td>
                      <td className="p-3 text-right">
                        <Link href="/obras/efetivo">
                          <Button variant="ghost" size="sm" className="text-xs text-amber-700">
                            Alocar
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Alertas de Inconsistência */}
        {totalInconsistencias > 0 && (
          <Card className="border-red-200 bg-red-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Inconsistências Ponto x Alocação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-red-600 mb-3">
                Existem <strong>{totalInconsistencias}</strong> registro{totalInconsistencias !== 1 ? 's' : ''} de funcionários que bateram ponto em obra diferente da alocação principal.
              </p>
              <Link href="/obras/efetivo">
                <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-100">
                  Resolver Inconsistências
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
