import { useState, useCallback } from "react";
import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL, getChartColors } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import BrazilMap from "@/components/BrazilMap";
import DrillDownModal from "@/components/DrillDownModal";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Trophy, AlertTriangle, Calendar, MapPin, Briefcase, Heart, TrendingUp, TrendingDown, Clock, ArrowLeft } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

function calcAge(dateStr: string | null) {
  if (!dateStr) return "-";
  const birth = new Date(dateStr + "T00:00:00");
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)) + " anos";
}

function calcTenure(dateStr: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  const months = Math.floor((Date.now() - d.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 12) return `${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}a ${rem}m` : `${years} anos`;
}

const STATUS_COLORS: Record<string, string> = {
  "Ativo": SEMANTIC_COLORS.ativo, "Ferias": SEMANTIC_COLORS.ferias, "Afastado": SEMANTIC_COLORS.alerta,
  "Licenca": SEMANTIC_COLORS.licenca, "Desligado": SEMANTIC_COLORS.desligado, "Recluso": SEMANTIC_COLORS.recluso, "Lista_Negra": SEMANTIC_COLORS.listaNegra,
};

export default function DashFuncionarios() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const { data, isLoading } = trpc.dashboards.funcionarios.useQuery({ companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) }, { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 });

  // Drill-down state
  const [drillDown, setDrillDown] = useState<{ open: boolean; title: string; filterType: string; filterValue: string }>({
    open: false, title: "", filterType: "", filterValue: "",
  });

  const openDrillDown = useCallback((title: string, filterType: string, filterValue: string) => {
    setDrillDown({ open: true, title, filterType, filterValue });
  }, []);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  if (!data) return (
    <DashboardLayout>
      <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
    </DashboardLayout>
  );

  // Preparar dados para pirâmide etária
  const faixas = ["14-20", "21-25", "26-30", "31-40", "41-50", "51-60", "61+"];
  const mascData = faixas.map(f => {
    const item = data.ageDist.find(a => a.faixa === f && a.sexo === "M");
    return item ? item.count : 0;
  });
  const femData = faixas.map(f => {
    const item = data.ageDist.find(a => a.faixa === f && a.sexo === "F");
    return item ? item.count : 0;
  });

  // Turnover
  const allMonthsArr = [...data.turnover.admissoes.map(a => a.mes), ...data.turnover.demissoes.map(d => d.mes)];
  const allMonths = new Set(allMonthsArr);
  const sortedMonths = Array.from(allMonths).sort();
  const admData = sortedMonths.map(m => data.turnover.admissoes.find(a => a.mes === m)?.count || 0);
  const demData = sortedMonths.map(m => data.turnover.demissoes.find(d => d.mes === m)?.count || 0);
  const monthLabels = sortedMonths.map(m => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard de Funcionários</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise completa do quadro de pessoal</p>
          </div>
          <PrintActions title="Dashboard Funcionários" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashKpi label="Ativos" value={data.resumo.totalAtivos} icon={UserCheck} color="green" />
          <DashKpi label="Desligados" value={data.resumo.totalDesligados ?? (data.resumo.totalGeral - data.resumo.totalAtivos)} icon={UserX} color="red" />
          <DashKpi label="Advertências" value={data.rankingAdvertencias.reduce((s, r) => s + r.total, 0)} icon={AlertTriangle} color="orange" />
          <DashKpi label="Atestados" value={data.rankingAtestados.reduce((s, r) => s + r.totalAtestados, 0)} icon={Calendar} color="blue" />
        </div>

        {/* Destaques */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.destaques.maisVelho && (
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium uppercase">Mais Velho</p>
                <p className="font-semibold text-sm mt-1 truncate">{data.destaques.maisVelho.nome}</p>
                <p className="text-xs text-muted-foreground">{data.destaques.maisVelho.funcao} · {calcAge(data.destaques.maisVelho.data)}</p>
              </CardContent>
            </Card>
          )}
          {data.destaques.maisNovo && (
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium uppercase">Mais Novo</p>
                <p className="font-semibold text-sm mt-1 truncate">{data.destaques.maisNovo.nome}</p>
                <p className="text-xs text-muted-foreground">{data.destaques.maisNovo.funcao} · {calcAge(data.destaques.maisNovo.data)}</p>
              </CardContent>
            </Card>
          )}
          {data.destaques.maiorTempo && (
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium uppercase">Maior Tempo de Casa</p>
                <p className="font-semibold text-sm mt-1 truncate">{data.destaques.maiorTempo.nome}</p>
                <p className="text-xs text-muted-foreground">{data.destaques.maiorTempo.funcao} · {calcTenure(data.destaques.maiorTempo.data)}</p>
              </CardContent>
            </Card>
          )}
          {data.destaques.menorTempo && (
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium uppercase">Contratação Mais Recente</p>
                <p className="font-semibold text-sm mt-1 truncate">{data.destaques.menorTempo.nome}</p>
                <p className="text-xs text-muted-foreground">{data.destaques.menorTempo.funcao} · {calcTenure(data.destaques.menorTempo.data)}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Gráficos - Linha 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(() => {
            // Gráfico de status mostra apenas ativos (Desligado já está no card KPI)
            const activeStatuses = data.statusDist.filter(s => s.label !== 'Desligado');
            return <DashChart
              title="Status dos Funcionários Ativos"
              type="doughnut"
              labels={activeStatuses.map(s => s.label)}
              datasets={[{ data: activeStatuses.map(s => s.value), backgroundColor: activeStatuses.map(s => STATUS_COLORS[s.label] || SEMANTIC_COLORS.neutro) }]}
              height={240}
              onChartClick={(info) => openDrillDown(`Status: ${info.label}`, "status", info.label)}
            />;
          })()}
          <DashChart
            title="Distribuição por Gênero"
            type="pie"
            labels={data.sexDist.map(s => s.label)}
            datasets={[{ data: data.sexDist.map(s => s.value), backgroundColor: data.sexDist.map(s => s.label === 'M' ? SEMANTIC_COLORS.masculino : s.label === 'F' ? SEMANTIC_COLORS.feminino : SEMANTIC_COLORS.neutro) }]}
            height={240}
            onChartClick={(info) => openDrillDown(`Gênero: ${info.label === 'M' ? 'Masculino' : info.label === 'F' ? 'Feminino' : info.label}`, "sexo", info.label)}
          />
          <DashChart
            title="Tipo de Contrato"
            type="doughnut"
            labels={data.contratoDist.map(s => s.label)}
            datasets={[{ data: data.contratoDist.map(s => s.value) }]}
            height={240}
            onChartClick={(info) => openDrillDown(`Contrato: ${info.label}`, "tipoContrato", info.label)}
          />
        </div>

        {/* Pirâmide Etária */}
        <DashChart
          title="Pirâmide Etária por Gênero"
          type="bar"
          labels={faixas}
          datasets={[
            { label: "Masculino", data: mascData, backgroundColor: SEMANTIC_COLORS.masculino },
            { label: "Feminino", data: femData, backgroundColor: SEMANTIC_COLORS.feminino },
          ]}
          height={280}
          onChartClick={(info) => {
            const sexo = info.datasetLabel === "Masculino" ? "M" : "F";
            openDrillDown(`${info.label} · ${info.datasetLabel}`, "faixaEtariaSexo", `${info.label}|${sexo}`);
          }}
        />

        {/* Gráficos - Linha 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashChart
            title="Top 10 Funções"
            type="horizontalBar"
            labels={data.funcaoDist.map(s => s.label)}
            datasets={[{ label: "Funcionários", data: data.funcaoDist.map(s => s.value), backgroundColor: CHART_PALETTE[0] }]}
            height={280}
            onChartClick={(info) => openDrillDown(`Função: ${info.label}`, "funcao", info.label)}
          />
          <DashChart
            title="Top 10 Setores"
            type="horizontalBar"
            labels={data.setorDist.map(s => s.label)}
            datasets={[{ label: "Funcionários", data: data.setorDist.map(s => s.value), backgroundColor: CHART_PALETTE[1] }]}
            height={280}
            onChartClick={(info) => openDrillDown(`Setor: ${info.label}`, "setor", info.label)}
          />
        </div>

        {/* Tempo de empresa e Cidade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashChart
            title="Tempo de Empresa"
            type="bar"
            labels={data.tenureDist.map(s => s.label)}
            datasets={[{ label: "Funcionários", data: data.tenureDist.map(s => s.value), backgroundColor: CHART_PALETTE[4] }]}
            height={260}
            onChartClick={(info) => openDrillDown(`Tempo: ${info.label}`, "tempoEmpresa", info.label)}
          />
          <DashChart
            title="Top 10 Cidades"
            type="horizontalBar"
            labels={data.cidadeDist.map(s => s.label)}
            datasets={[{ label: "Funcionários", data: data.cidadeDist.map(s => s.value), backgroundColor: CHART_PALETTE[5] }]}
            height={260}
            onChartClick={(info) => openDrillDown(`Cidade: ${info.label}`, "cidade", info.label)}
          />
        </div>

        {/* Mapa do Brasil - Funcionários por Estado */}
        <BrazilMap
          title="Distribuição de Funcionários por Estado"
          icon={<MapPin className="h-4 w-4 text-blue-500" />}
          data={(data as any).estadoDist || []}
          colorScheme="blue"
          onStateClick={(state, name) => {
            const count = (data as any).estadoDist?.find((s: any) => s.state === state)?.count || 0;
            if (count > 0) openDrillDown(`Estado: ${name} (${state})`, "estado", state);
          }}
        />

        {/* Estado Civil */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashChart
            title="Estado Civil"
            type="pie"
            labels={data.estadoCivilDist.map(s => s.label.replace(/_/g, " "))}
            datasets={[{ data: data.estadoCivilDist.map(s => s.value) }]}
            height={240}
            onChartClick={(info) => openDrillDown(`Estado Civil: ${info.label}`, "estadoCivil", info.label)}
          />
          <DashChart
            title="Advertências por Tipo"
            type="doughnut"
            labels={data.advertenciasTipo.map(s => s.label)}
            datasets={[{ data: data.advertenciasTipo.map(s => s.value), backgroundColor: [SEMANTIC_COLORS.negativo, SEMANTIC_COLORS.alerta, CHART_PALETTE[9], CHART_PALETTE[3], CHART_PALETTE[4]] }]}
            height={240}
          />
        </div>

        {/* Turnover */}
        {sortedMonths.length > 0 && (
          <DashChart
            title="Admissões x Demissões (últimos 12 meses)"
            type="bar"
            labels={monthLabels}
            datasets={[
              { label: "Admissões", data: admData, backgroundColor: SEMANTIC_COLORS.admissao },
              { label: "Demissões", data: demData, backgroundColor: SEMANTIC_COLORS.demissao },
            ]}
            height={280}
            onChartClick={(info) => {
              // Convert label "03/25" back to "2025-03"
              const [mo, y] = info.label.split("/");
              const fullYear = `20${y}`;
              const mesRef = `${fullYear}-${mo}`;
              const tipo = info.datasetLabel === "Admissões" ? "admissaoMes" : "demissaoMes";
              const tipoLabel = info.datasetLabel === "Admissões" ? "Admissões" : "Demissões";
              openDrillDown(`${tipoLabel} em ${mo}/${fullYear}`, tipo, mesRef);
            }}
          />
        )}

        {/* Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ranking de Advertências */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Ranking de Advertências
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rankingAdvertencias.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma advertência registrada</p>
              ) : (
                <div className="space-y-2">
                  {data.rankingAdvertencias.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium truncate max-w-[180px]">{r.nome}</p>
                          <p className="text-xs text-muted-foreground">{r.funcao}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-red-600">{r.total}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ranking de Atestados */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-orange-500" />
                Ranking de Atestados / Faltas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rankingAtestados.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum atestado registrado</p>
              ) : (
                <div className="space-y-2">
                  {data.rankingAtestados.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium truncate max-w-[180px]">{r.nome}</p>
                          <p className="text-xs text-muted-foreground">{r.funcao}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-orange-600">{r.totalAtestados} atestados</span>
                        <p className="text-xs text-muted-foreground">{r.totalDias} dias afastado</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Drill-Down Modal */}
      <DrillDownModal
        open={drillDown.open}
        onOpenChange={(open) => setDrillDown(prev => ({ ...prev, open }))}
        title={drillDown.title}
        filterType={drillDown.filterType}
        filterValue={drillDown.filterValue}
      />
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
