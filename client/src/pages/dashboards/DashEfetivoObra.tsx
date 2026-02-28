import { useState, useMemo } from "react";
import { CHART_PALETTE, getChartColors } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  HardHat, Users, Building2, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight,
  UserX, TrendingUp, TrendingDown, ArrowRightLeft, Eye, Calendar, ClipboardList,
  Loader2, User,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function DashEfetivoObra() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [ano, setAno] = useState(currentYear);
  const [mes, setMes] = useState(currentMonth);

  // Dialog states
  const [equipeDialogOpen, setEquipeDialogOpen] = useState(false);
  const [selectedObra, setSelectedObra] = useState<{ id: number; nome: string } | null>(null);
  const [drillDialogOpen, setDrillDialogOpen] = useState(false);
  const [drillData, setDrillData] = useState<{ title: string; items: any[] } | null>(null);

  const mesRef = `${ano}-${String(mes).padStart(2, '0')}`;

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
  const { data: dashMensal } = trpc.obras.efetivoDashMensal.useQuery(
    { companyId, mesRef },
    { enabled: companyId > 0 }
  );
  const { data: equipeData, isLoading: loadingEquipe } = trpc.obras.equipeObra.useQuery(
    { obraId: selectedObra?.id || 0, companyId },
    { enabled: !!selectedObra && companyId > 0 }
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
    return (efetivoPorObra as any[]).filter((o: any) => (o.efetivo || 0) > 0).length;
  }, [efetivoPorObra]);

  const totalSemObra = (semObra as any[] || []).length;
  const totalInconsistencias = (inconsistenciasCount as any)?.count || 0;

  // Dados do mês selecionado
  const dadosMes = useMemo(() => {
    if (!dashMensal) return null;
    return dashMensal as any;
  }, [dashMensal]);

  // Histograma: efetivo por obra (barras)
  const obrasSorted = useMemo(() => {
    if (!efetivoPorObra) return [];
    return (efetivoPorObra as any[])
      .sort((a: any, b: any) => (b.efetivo || 0) - (a.efetivo || 0));
  }, [efetivoPorObra]);

  const obraLabels = useMemo(() => obrasSorted.map((o: any) => o.obraNome || `Obra #${o.obraId}`), [obrasSorted]);
  const obraValues = useMemo(() => obrasSorted.map((o: any) => o.efetivo || 0), [obrasSorted]);

  // Evolução mensal: stacked bar chart por obra
  const mesesDoAno = useMemo(() => {
    const meses: string[] = [];
    for (let m = 1; m <= 12; m++) {
      meses.push(`${ano}-${String(m).padStart(2, '0')}`);
    }
    return meses;
  }, [ano]);

  const mesesLabels = useMemo(() => mesesDoAno.map(m => {
    const [, mesN] = m.split('-');
    return MESES_NOMES[parseInt(mesN) - 1] || mesN;
  }), [mesesDoAno]);

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
      data: mesesDoAno.map(m => {
        const found = historicoFiltrado.find((h: any) => h.obraId === obra.id && h.mes === m);
        return found ? found.efetivo : 0;
      }),
      backgroundColor: colors[idx] || CHART_PALETTE[idx % CHART_PALETTE.length],
    }));
  }, [obrasUnicas, mesesDoAno, historicoFiltrado]);

  // Total mensal (tendência)
  const totalMensal = useMemo(() => {
    return mesesDoAno.map(m => {
      return historicoFiltrado
        .filter((h: any) => h.mes === m)
        .reduce((acc: number, h: any) => acc + h.efetivo, 0);
    });
  }, [mesesDoAno, historicoFiltrado]);

  // Variação
  const variacao = useMemo(() => {
    const nonZero = totalMensal.filter(v => v > 0);
    if (nonZero.length < 2) return null;
    const ultimo = nonZero[nonZero.length - 1];
    const penultimo = nonZero[nonZero.length - 2];
    const diff = ultimo - penultimo;
    const pct = penultimo > 0 ? ((diff / penultimo) * 100).toFixed(1) : '0';
    return { diff, pct, cresceu: diff >= 0 };
  }, [totalMensal]);

  // Chart click handlers
  const handleBarClick = (info: ChartClickInfo) => {
    const obra = obrasSorted[info.dataIndex];
    if (obra) {
      setSelectedObra({ id: obra.obraId, nome: obra.obraNome });
      setEquipeDialogOpen(true);
    }
  };

  const handlePieClick = (info: ChartClickInfo) => {
    const obra = obrasSorted[info.dataIndex];
    if (obra) {
      setSelectedObra({ id: obra.obraId, nome: obra.obraNome });
      setEquipeDialogOpen(true);
    }
  };

  const handleEvolucaoClick = (info: ChartClickInfo) => {
    const mesClicked = mesesDoAno[info.dataIndex];
    const obraClicked = obrasUnicas[info.datasetIndex];
    if (mesClicked && obraClicked) {
      const [, mesN] = mesClicked.split('-');
      const mesNome = MESES_NOMES[parseInt(mesN) - 1];
      const efetivo = historicoFiltrado.find((h: any) => h.obraId === obraClicked.id && h.mes === mesClicked);
      setDrillData({
        title: `${obraClicked.nome} — ${mesNome}/${ano}`,
        items: [{
          label: 'Funcionários alocados',
          value: efetivo?.efetivo || 0,
        }],
      });
      setDrillDialogOpen(true);
    }
  };

  const openEquipe = (obraId: number, obraNome: string) => {
    setSelectedObra({ id: obraId, nome: obraNome });
    setEquipeDialogOpen(true);
  };

  // Navigate months
  const prevMonth = () => {
    if (mes === 1) { setMes(12); setAno(a => a - 1); }
    else setMes(m => m - 1);
  };
  const nextMonth = () => {
    if (ano === currentYear && mes >= currentMonth) return;
    if (mes === 12) { setMes(1); setAno(a => a + 1); }
    else setMes(m => m + 1);
  };

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
          <div className="flex items-center gap-3 flex-wrap">
            {/* Seletor de Mês */}
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 min-w-[8rem] justify-center">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-bold">{MESES_NOMES[mes - 1]} {ano}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} disabled={ano === currentYear && mes >= currentMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Seletor de Ano (para gráfico evolução) */}
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold min-w-[3rem] text-center">{ano}</span>
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

        {/* Dados do Mês Selecionado */}
        {dadosMes && (dadosMes as any).porObra?.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                <ClipboardList className="h-4 w-4" />
                Resumo de {MESES_NOMES[mes - 1]}/{ano} — Alocação x Ponto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-blue-100/50">
                      <th className="text-left p-2 font-medium">Obra</th>
                      <th className="text-center p-2 font-medium">Alocados</th>
                      <th className="text-center p-2 font-medium">Com Ponto</th>
                      <th className="text-center p-2 font-medium">Dias Ponto</th>
                      <th className="text-right p-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((dadosMes as any).porObra || []).map((o: any, idx: number) => (
                      <tr key={o.obraId} className="border-b hover:bg-blue-50/50 transition-colors">
                        <td className="p-2 font-medium">{o.obraNome}</td>
                        <td className="p-2 text-center">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{o.alocados}</Badge>
                        </td>
                        <td className="p-2 text-center">
                          {o.comPonto > 0 ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{o.comPonto}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-2 text-center text-xs text-muted-foreground">{o.diasPonto || '—'}</td>
                        <td className="p-2 text-right">
                          <Button variant="ghost" size="sm" className="text-xs text-blue-700 gap-1" onClick={() => openEquipe(o.obraId, o.obraNome)}>
                            <Eye className="h-3 w-3" /> Ver equipe
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <span className="text-[10px] text-muted-foreground font-normal ml-1">(clique para ver equipe)</span>
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
                  onChartClick={handleBarClick}
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
                <span className="text-[10px] text-muted-foreground font-normal ml-1">(clique para ver equipe)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {obraLabels.length === 0 || obraValues.every((v: number) => v === 0) ? (
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
                  onChartClick={handlePieClick}
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
              <span className="text-[10px] text-muted-foreground font-normal ml-1">(clique nas barras para detalhes)</span>
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
                onChartClick={handleEvolucaoClick}
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
                  {obrasSorted.map((obra: any, idx: number) => {
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs gap-1 text-blue-700 hover:text-blue-900"
                            onClick={() => openEquipe(obra.obraId, obra.obraNome)}
                          >
                            <Eye className="h-3 w-3" /> Ver equipe
                          </Button>
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
                  {/* Linha de TOTAL */}
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td className="p-3">
                      <span className="font-bold text-slate-800">TOTAL GERAL</span>
                    </td>
                    <td className="p-3 text-center font-bold text-lg text-slate-800">{totalFuncionariosAlocados + totalSemObra}</td>
                    <td className="p-3 text-center">
                      <span className="text-xs font-semibold text-slate-600">100%</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-xs text-slate-500">{obrasSorted.length} obras</span>
                    </td>
                  </tr>
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

      {/* Dialog: Ver Equipe da Obra */}
      <Dialog open={equipeDialogOpen} onOpenChange={setEquipeDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-orange-600" />
              Equipe — {selectedObra?.nome}
            </DialogTitle>
            <DialogDescription>
              {loadingEquipe ? 'Carregando...' : `${(equipeData as any[] || []).length} funcionário(s) alocado(s)`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {loadingEquipe ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (equipeData as any[] || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum funcionário alocado nesta obra.</p>
            ) : (
              (equipeData as any[]).map((emp: any) => (
                <div key={emp.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-blue-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{emp.nomeCompleto}</p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      {emp.funcao && <span>{emp.funcao}</span>}
                      {emp.setor && <span>• {emp.setor}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${
                      emp.status === 'Ativo' ? 'bg-green-50 text-green-700 border-green-200' :
                      emp.status === 'Ferias' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-gray-50 text-gray-700 border-gray-200'
                    }`}>
                      {emp.status}
                    </Badge>
                    {emp.dataInicioObra && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Desde {new Date(emp.dataInicioObra + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Drill-down de gráfico */}
      <Dialog open={drillDialogOpen} onOpenChange={setDrillDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
              {drillData?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {drillData?.items.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-lg font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
