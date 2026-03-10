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
import FullScreenDialog from "@/components/FullScreenDialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  HardHat, Users, Building2, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight,
  UserX, TrendingUp, TrendingDown, ArrowRightLeft, Eye, Calendar, ClipboardList,
  Loader2, User, Printer, FileDown,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { nowBrasilia } from "@/lib/dateUtils";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function DashEfetivoObra() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [ano, setAno] = useState(currentYear);
  const [mes, setMes] = useState(currentMonth);

  // Dialog states
  const [equipeDialogOpen, setEquipeDialogOpen] = useState(false);
  const [selectedObra, setSelectedObra] = useState<{ id: number; nome: string; obraIds?: number[] } | null>(null);
  const [drillDialogOpen, setDrillDialogOpen] = useState(false);
  const [drillData, setDrillData] = useState<{ title: string; items: any[] } | null>(null);

  const mesRef = `${ano}-${String(mes).padStart(2, '0')}`;

  // Dados
  const { data: efetivoPorObra, isLoading: loadingEfetivo } = trpc.obras.efetivoPorObra.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: historicoData, isLoading: loadingHistorico } = trpc.obras.efetivoHistorico.useQuery(
    { companyId: queryCompanyId, meses: 24, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: semObra, isLoading: loadingSemObra } = trpc.obras.semObra.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: inconsistenciasCount } = trpc.obras.inconsistenciasCount.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: dashMensal } = trpc.obras.efetivoDashMensal.useQuery(
    { companyId: queryCompanyId, mesRef, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: equipeData, isLoading: loadingEquipe } = trpc.obras.equipeObra.useQuery(
    { obraId: selectedObra?.id || 0, companyId: queryCompanyId, ...(selectedObra?.obraIds && selectedObra.obraIds.length > 1 ? { obraIds: selectedObra.obraIds } : {}), ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: !!selectedObra && (isConstrutoras ? companyIds.length > 0 : companyId > 0) }
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

  const openEquipe = (obraId: number, obraNome: string, obraIds?: number[]) => {
    setSelectedObra({ id: obraId, nome: obraNome, obraIds });
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
                          <Button variant="ghost" size="sm" className="text-xs text-blue-700 gap-1" onClick={() => openEquipe(o.obraId, o.obraNome, o.obraIds)}>
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
                    <th className="p-2 text-center text-xs font-semibold text-blue-700">Ativos</th>
                    <th className="p-2 text-center text-xs font-semibold text-red-400">Aviso</th>
                    <th className="p-2 text-center text-xs font-semibold text-orange-600">Disp.</th>
                    <th className="p-2 text-center text-xs font-semibold text-amber-600">Férias</th>
                    <th className="p-2 text-center text-xs font-semibold text-yellow-600">Afast.</th>             <th className="text-center p-3 font-medium">% do Total</th>
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
                        <td className="p-2 text-center text-sm text-blue-700 font-medium">{obra.qtdAtivo || 0}</td>
                        <td className="p-2 text-center text-sm text-red-400 font-medium">{obra.qtdAviso || 0}</td>
                        <td className="p-2 text-center text-sm text-orange-600 font-medium">{obra.qtdAvisoDispensado || 0}</td>
                        <td className="p-2 text-center text-sm text-amber-600 font-medium">{obra.qtdFerias || 0}</td>
                        <td className="p-2 text-center text-sm text-yellow-600 font-medium">{obra.qtdAfastado || 0}</td>
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
                            onClick={() => openEquipe(obra.obraId, obra.obraNome, obra.obraIds)}
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
                      <td className="p-2 text-center text-sm text-muted-foreground">—</td>
                      <td className="p-2 text-center text-sm text-muted-foreground">—</td>
                      <td className="p-2 text-center text-sm text-muted-foreground">—</td>
                      <td className="p-2 text-center text-sm text-muted-foreground">—</td>
                      <td className="p-2 text-center text-sm text-muted-foreground">—</td>
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
                    <td className="p-2 text-center text-sm font-semibold text-blue-700">{obrasSorted.reduce((s: number, o: any) => s + (o.qtdAtivo || 0), 0)}</td>
                    <td className="p-2 text-center text-sm font-semibold text-red-400">{obrasSorted.reduce((s: number, o: any) => s + (o.qtdAviso || 0), 0)}</td>
                    <td className="p-2 text-center text-sm font-semibold text-orange-600">{obrasSorted.reduce((s: number, o: any) => s + (o.qtdAvisoDispensado || 0), 0)}</td>
                    <td className="p-2 text-center text-sm font-semibold text-amber-600">{obrasSorted.reduce((s: number, o: any) => s + (o.qtdFerias || 0), 0)}</td>
                    <td className="p-2 text-center text-sm font-semibold text-yellow-600">{obrasSorted.reduce((s: number, o: any) => s + (o.qtdAfastado || 0), 0)}</td>
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
      <EquipeFullScreenDialog
        open={equipeDialogOpen}
        onClose={() => setEquipeDialogOpen(false)}
        obraNome={selectedObra?.nome || ''}
        equipeData={equipeData as any[] || []}
        loading={loadingEquipe}
      />

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

/* ─── Componente: FullScreen Equipe da Obra ─── */
const STATUS_BAR_COLORS: Record<string, string> = {
  Ativo: '#2563eb',            // azul
  Aviso: '#ef4444',            // vermelho
  AvisoDispensado: '#f97316',  // laranja
  Ferias: '#f59e0b',           // âmbar
  Afastado: '#a855f7',         // roxo
  Licenca: '#06b6d4',          // ciano
  Recluso: '#6b7280',          // cinza
  Desligado: '#374151',        // cinza escuro
  Lista_Negra: '#111827',      // preto
};
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Ativo: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Aviso: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  AvisoDispensado: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  Ferias: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  Afastado: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Licenca: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  Recluso: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
  Desligado: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
  Lista_Negra: { bg: 'bg-gray-200', text: 'text-gray-900', border: 'border-gray-400' },
};
const STATUS_LABELS: Record<string, string> = {
  Ativo: 'Ativos', Aviso: 'Aviso Prévio', AvisoDispensado: 'Dispensado (7d)', Ferias: 'Férias', Afastado: 'Afastados',
  Licenca: 'Licença', Recluso: 'Reclusos', Desligado: 'Desligados', Lista_Negra: 'Lista Negra',
};

function EquipeFullScreenDialog({ open, onClose, obraNome, equipeData, loading }: {
  open: boolean; onClose: () => void; obraNome: string; equipeData: any[]; loading: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [chartFilter, setChartFilter] = useState<{ funcao?: string; status?: string } | null>(null);
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const removeAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Filtrar por busca + filtro do gráfico
  const filtered = useMemo(() => {
    let result = equipeData;
    // Filtro do gráfico (clique na barra)
    if (chartFilter) {
      if (chartFilter.funcao) {
        result = result.filter((e: any) => (e.funcao || 'Sem Função') === chartFilter.funcao);
      }
      if (chartFilter.status) {
        result = result.filter((e: any) => (e.status || 'Outro') === chartFilter.status);
      }
    }
    // Filtro de busca texto
    if (busca) {
      const s = removeAccents(busca);
      result = result.filter((e: any) =>
        removeAccents(e.nomeCompleto || '').includes(s) ||
        removeAccents(e.funcao || '').includes(s) ||
        removeAccents(e.setor || '').includes(s)
      );
    }
    return result;
  }, [equipeData, busca, chartFilter]);

  // Histograma por função COM breakdown por status
  const funcaoHistStacked = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const e of equipeData) {
      const f = e.funcao || 'Sem Função';
      const s = e.status || 'Outro';
      if (!map[f]) map[f] = {};
      map[f][s] = (map[f][s] || 0) + 1;
    }
    // Ordenar por total decrescente
    return Object.entries(map)
      .map(([funcao, statuses]) => ({
        funcao,
        statuses,
        total: Object.values(statuses).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [equipeData]);

  // Todos os status - sempre mostra a legenda completa
  const ALL_STATUS_ORDER = ['Ativo', 'Aviso', 'Ferias', 'Afastado', 'Licenca', 'Recluso'];
  const allStatuses = ALL_STATUS_ORDER;
  // Status presentes nos dados (para o gráfico empilhado)
  const presentStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const e of equipeData) set.add(e.status || 'Outro');
    return ALL_STATUS_ORDER.filter(s => set.has(s));
  }, [equipeData]);

  // Agrupar por função para tabela
  const groupedByFuncao = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of filtered) {
      const f = e.funcao || 'Sem Função';
      if (!map[f]) map[f] = [];
      map[f].push(e);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // Status summary
  const statusSummary = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of equipeData) {
      const s = e.status || 'Outro';
      map[s] = (map[s] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [equipeData]);

  const maxBar = funcaoHistStacked.length > 0 ? funcaoHistStacked[0].total : 1;

  const handlePrint = () => {
    window.print();
  };

  const handlePDF = () => {
    setTimeout(() => window.print(), 300);
  };

  const logoUrl = selectedCompany?.logoUrl || 'https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png';
  const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || 'FC Engenharia';
  const cnpj = selectedCompany?.cnpj || '';
  const userName = user?.name || user?.username || 'Usuário não identificado';

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      title={`Equipe — ${obraNome}`}
      subtitle={`${equipeData.length} funcionário(s) alocado(s) nesta obra`}
      icon={<HardHat className="h-6 w-6" />}
      headerActions={
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            className="text-white hover:bg-white/20 gap-1 border border-white/30 text-xs h-8"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePDF}
            className="text-white hover:bg-white/20 gap-1 border border-white/30 text-xs h-8"
          >
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : equipeData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">Nenhum funcionário alocado</p>
          <p className="text-sm">Aloque funcionários nesta obra para visualizar a equipe.</p>
        </div>
      ) : (
        <div className="space-y-6 p-4 equipe-print-area">
          {/* Print Header - só aparece na impressão */}
          <div className="hidden print:block equipe-print-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '8px' }}>
              <img src={logoUrl} alt="Logo" style={{ height: '48px', objectFit: 'contain' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1B2A4A' }}>{nomeEmpresa}</div>
                {cnpj && <div style={{ fontSize: '11px', color: '#666' }}>CNPJ: {cnpj}</div>}
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1B2A4A', textAlign: 'center', marginTop: '4px' }}>
              Relatório de Equipe — {obraNome}
            </div>
            <div style={{ fontSize: '10px', color: '#999', textAlign: 'center', marginTop: '4px', paddingBottom: '8px', borderBottom: '2px solid #1B2A4A' }}>
              Impresso em: {nowBrasilia()}
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-3">
            {statusSummary.map(([status, count]) => {
              const c = STATUS_COLORS[status] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
              return (
                <div key={status} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${c.bg} ${c.border}`}
                  style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                  <span className={`text-sm font-semibold ${c.text}`}>{count}</span>
                  <span className={`text-xs ${c.text}`}>{STATUS_LABELS[status] || status}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-50 border-slate-200">
              <span className="text-sm font-semibold text-slate-700">{equipeData.length}</span>
              <span className="text-xs text-slate-600">Total</span>
            </div>
          </div>

          {/* Legenda de cores */}
          <div className="flex flex-wrap gap-3 text-xs print:gap-2">
            {allStatuses.map(status => (
              <div key={status} className="flex items-center gap-1.5">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: STATUS_BAR_COLORS[status] || '#9ca3af', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}
                />
                <span className="text-muted-foreground">{STATUS_LABELS[status] || status}</span>
              </div>
            ))}
          </div>

          {/* Histograma por Função - Barras empilhadas por status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-indigo-600" />
                Distribuição por Função
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {funcaoHistStacked.map(({ funcao, statuses, total }) => (
                  <div key={funcao} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 sm:w-44 truncate text-right" title={funcao}>{funcao}</span>
                    <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden flex" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                      {presentStatuses.map(status => {
                        const count = statuses[status] || 0;
                        if (count === 0) return null;
                        const pct = (count / maxBar) * 100;
                        return (
                          <div
                            key={status}
                            className="h-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                            style={{
                              width: `${Math.max(pct, 3)}%`,
                              backgroundColor: STATUS_BAR_COLORS[status] || '#9ca3af',
                              WebkitPrintColorAdjust: 'exact',
                              printColorAdjust: 'exact' as any,
                              opacity: chartFilter && (chartFilter.funcao !== funcao || chartFilter.status !== status) ? 0.4 : 1,
                            }}
                            title={`${STATUS_LABELS[status] || status}: ${count} — Clique para filtrar`}
                            onClick={() => {
                              if (chartFilter?.funcao === funcao && chartFilter?.status === status) {
                                setChartFilter(null); // toggle off
                              } else {
                                setChartFilter({ funcao, status });
                              }
                            }}
                          >
                            {count >= 2 && <span className="text-[9px] font-bold text-white">{count}</span>}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-xs font-semibold text-foreground w-8 text-right">{total}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filtro ativo do gráfico */}
          {chartFilter && (
            <div className="flex items-center gap-2 print:hidden">
              <Badge variant="secondary" className="gap-1.5 text-xs py-1 px-3">
                Filtro: {chartFilter.funcao} — {STATUS_LABELS[chartFilter.status || ''] || chartFilter.status}
                <button onClick={() => setChartFilter(null)} className="ml-1 hover:text-destructive">
                  <span className="text-xs">✕</span>
                </button>
              </Badge>
              <span className="text-xs text-muted-foreground">{filtered.length} funcionário(s)</span>
            </div>
          )}

          {/* Busca - ocultar na impressão */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 print:hidden">
            <Input
              placeholder="Buscar por nome, função ou setor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full sm:max-w-md"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {filtered.length} de {equipeData.length} funcionários
            </span>
          </div>

          {/* Tabela agrupada por função */}
          {groupedByFuncao.map(([funcao, emps]) => (
            <div key={funcao}>
              <div className="flex items-center gap-2 mb-2 mt-4">
                <div className="h-2 w-2 rounded-full bg-blue-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }} />
                <h3 className="text-sm font-semibold text-foreground">{funcao}</h3>
                <Badge variant="secondary" className="text-[10px]">{emps.length}</Badge>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Nome</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead>Admissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emps.map((emp: any) => {
                    const sc = STATUS_COLORS[emp.status] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium text-sm">{emp.nomeCompleto}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.setor || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${sc.bg} ${sc.text} ${sc.border}`}
                            style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                            {emp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {emp.dataInicioObra ? new Date(emp.dataInicioObra + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {emp.dataAdmissao ? new Date(emp.dataAdmissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
          ))}

          {/* Total geral */}
          <div className="border-t pt-3 mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold">TOTAL GERAL</span>
            <span className="text-lg font-bold">{equipeData.length} funcionários</span>
          </div>

          {/* Rodapé LGPD - só aparece na impressão */}
          <div className="hidden print:block equipe-print-footer-lgpd">
            <div style={{
              marginTop: '20px', paddingTop: '8px', borderTop: '1px solid #ccc',
              fontSize: '8px', color: '#888', textAlign: 'center', lineHeight: '1.6',
            }}>
              <p style={{ margin: 0 }}>
                <strong>Documento gerado por:</strong> {userName} | <strong>Data/Hora:</strong> {nowBrasilia()} | <strong>Sistema:</strong> FC Gestão Integrada
              </p>
              <p style={{ margin: '2px 0 0 0', fontSize: '7px', color: '#aaa' }}>
                Este documento contém dados pessoais protegidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).
                É proibida a reprodução, distribuição ou compartilhamento sem autorização.
                O uso indevido está sujeito às sanções previstas na legislação vigente.
              </p>
            </div>
          </div>
        </div>
      )}
    </FullScreenDialog>
  );
}
