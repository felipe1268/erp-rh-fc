import { useState, useCallback, useRef, useEffect } from "react";
import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL, getChartColors } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import MapaFuncionariosInterativo from "@/components/MapaFuncionariosInterativo";
import DrillDownModal from "@/components/DrillDownModal";
import PrintActions from "@/components/PrintActions";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import TabelaComparativaAnual, { type LinhaInd } from "@/components/TabelaComparativaAnual";
import ComparativoAnosFuncionarios from "@/components/ComparativoAnosFuncionarios";
import HeadcountAnualFuncionarios from "@/components/HeadcountAnualFuncionarios";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users as UsersIcon, UserPlus, UserMinus, RefreshCw, Scale } from "lucide-react";

const FUNC_INDICADORES: LinhaInd[] = [
  { chave: "ativos", label: "Funcionários Ativos (fim do mês)", icone: UsersIcon, cor: "blue", lowerIsBetter: false,
    pegar: r => Number(r.ativos) || 0, format: v => `${v}`, drill: { tipo: "ativosMes" },
    alertaPct: 10, hint: "Quedas grandes podem refletir desligamentos em massa ou fim de obra.",
    acoes: ["Cruzar com Aviso Prévio: desligamentos no mês.", "Verificar fim de obras (encerramento de equipe inteira).", "Avaliar reposição: vagas abertas vs. necessidade da obra."] },
  { chave: "admissoes", label: "Admissões no mês", icone: UserPlus, cor: "green", lowerIsBetter: false,
    pegar: r => Number(r.admissoes) || 0, format: v => `${v}`, drill: { tipo: "admissaoMes" },
    alertaPct: 50, hint: "Picos sazonais ok; volumes inesperados merecem revisão de quadro.",
    acoes: ["Conferir se admissões estão na previsão orçamentária.", "Validar exames admissionais e ASOs (NR-7).", "Confirmar registro no eSocial S-2200 dentro do prazo."] },
  { chave: "demissoes", label: "Demissões no mês", icone: UserMinus, cor: "red", lowerIsBetter: true,
    pegar: r => Number(r.demissoes) || 0, format: v => `${v}`, drill: { tipo: "demissaoMes" },
    alertaPct: 50, hint: "Pico de saídas → investigar clima, salário, segurança, fim de obra.",
    acoes: ["Realizar entrevista de desligamento estruturada.", "Cruzar com pesquisa de clima do trimestre.", "Conferir se rescisões foram pagas no prazo (10 dias).", "Mapear funções/obras com mais saídas (turnover concentrado)."] },
  { chave: "saldo", label: "Saldo (Adm − Dem)", icone: Scale, cor: "teal", lowerIsBetter: false,
    pegar: r => Number(r.saldo) || 0, format: v => v > 0 ? `+${v}` : `${v}`, drill: { tipo: "movimentacaoMes" },
    alertaAbsoluto: v => v < -5,
    hint: "Saldo negativo persistente reduz quadro — risco para cronograma.",
    acoes: ["Saldo negativo 3 meses seguidos: rever política de retenção.", "Comparar saldo com plano de obras do trimestre."] },
  { chave: "turnover", label: "Turnover (%)", icone: RefreshCw, cor: "orange", lowerIsBetter: true,
    pegar: r => Number(r.turnoverPct) || 0, format: v => `${v.toFixed(1)}%`, drill: { tipo: "movimentacaoMes" },
    alertaAbsoluto: v => v > 5,
    hint: "Benchmark construção civil: 3-5%/mês saudável. Acima: alerta de retenção (CBIC, FGV).",
    acoes: ["Turnover > 5%/mês por 3 meses: ação imediata em retenção.", "Mapear top 3 motivos de saída (entrevistas).", "Avaliar pacote de benefícios vs. concorrência local.", "Conferir custo de turnover (estimativa: 3-6× salário por reposição)."] },
];
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Trophy, AlertTriangle, Calendar, MapPin, Briefcase, Heart, TrendingUp, TrendingDown, Clock, ArrowLeft, Search, ChevronDown, X } from "lucide-react";
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

// Rev. 2620 — avatar com foto do funcionário nos rankings (fallback: inicial do nome).
function RankAvatar({ src, nome }: { src?: string | null; nome?: string }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (src && !err) {
    return (
      <img
        src={src}
        alt={nome || ""}
        loading="lazy"
        onError={() => setErr(true)}
        className="h-9 w-9 rounded-full object-cover shrink-0 border border-border bg-muted"
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
      {nome?.charAt(0) || "?"}
    </div>
  );
}

export default function DashFuncionarios() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const anoAtual = new Date().getFullYear();
  const [anoAnalise, setAnoAnalise] = useState(anoAtual);
  const [mesAnalise, setMesAnalise] = useState(new Date().getMonth() + 1);
  const isAnoAtual = anoAnalise === anoAtual;
  const { data, isLoading, isError } = trpc.dashboards.funcionarios.useQuery({ companyId: queryCompanyId, ano: anoAnalise, ...(isConstrutoras ? { companyIds } : {}) }, { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 });
  const { data: comparativo, isLoading: loadingComp } = trpc.dashboards.funcionariosComparativo.useQuery(
    { companyId: queryCompanyId, ano: anoAnalise, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: anual, isLoading: loadingAnual } = trpc.dashboards.funcionariosAnual.useQuery(
    { companyId: queryCompanyId, ano: anoAnalise, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  // Rev. 2627 — headcount ativo ao fim de cada ano desde a fundação (independe do "Ano de análise").
  const { data: headcountAnual, isLoading: loadingHeadcount } = trpc.dashboards.funcionariosHeadcountAnual.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  // Rev. 2637 — anos do seletor desde a fundação (reusa o headcount anual);
  // fallback de 7 anos enquanto carrega. Garante que anoAtual sempre exista.
  const anosDisponiveis = (() => {
    const fromData = headcountAnual?.anos?.map(a => a.ano) ?? [];
    const set = new Set<number>(fromData.length ? fromData : Array.from({ length: 7 }, (_, i) => anoAtual - i));
    set.add(anoAtual);
    return Array.from(set).sort((a, b) => b - a);
  })();

  // Drill-down state
  const [drillDown, setDrillDown] = useState<{ open: boolean; title: string; filterType: string; filterValue: string }>({
    open: false, title: "", filterType: "", filterValue: "",
  });

  const openDrillDown = useCallback((title: string, filterType: string, filterValue: string) => {
    // Drill-down opera sobre os dados ATUAIS — só faz sentido no ano corrente.
    // Em anos passados (snapshot) abrir a lista atual seria enganoso.
    if (!isAnoAtual) return;
    setDrillDown({ open: true, title, filterType, filterValue });
  }, [isAnoAtual]);

  // Rev. 2627 — drill do headcount anual: snapshot por DATAS, sempre válido
  // (independe do "Ano de análise"). Lista o quadro ativo ao fim do ano clicado.
  const openAnoDrill = useCallback((ano: number) => {
    setDrillDown({ open: true, title: `Funcionários ativos ao fim de ${ano}`, filterType: "ativosAno", filterValue: String(ano) });
  }, []);

  // Análise por função — combobox state
  const [selectedFuncao, setSelectedFuncao] = useState<string | null>(null);
  const [funcaoSearch, setFuncaoSearch] = useState("");
  const [funcaoDropOpen, setFuncaoDropOpen] = useState(false);
  const funcaoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (funcaoRef.current && !funcaoRef.current.contains(e.target as Node)) setFuncaoDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  if (isError) return (
    <DashboardLayout>
      <div className="text-center py-16 text-destructive">Erro ao carregar o dashboard. Tente novamente mais tarde.</div>
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

        {/* Seletor de período — padrão ERP */}
        <PeriodSelectorCard ano={anoAnalise} mes={mesAnalise} onAno={setAnoAnalise} onMes={setMesAnalise} />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashKpi label="Ativos" value={data.resumo.totalAtivos} icon={UserCheck} color="green" sub={isAnoAtual ? "hoje" : `fim de ${anoAnalise}`} />
          <DashKpi label="Desligados" value={data.resumo.totalDesligados ?? (data.resumo.totalGeral - data.resumo.totalAtivos)} icon={UserX} color="red" sub={`em ${anoAnalise}`} />
          <DashKpi label="Advertências" value={data.rankingAdvertencias.reduce((s, r) => s + r.total, 0)} icon={AlertTriangle} color="orange" sub={`em ${anoAnalise}`} />
          <DashKpi label="Atestados" value={data.rankingAtestados.reduce((s, r) => s + r.totalAtestados, 0)} icon={Calendar} color="blue" sub={`em ${anoAnalise}`} />
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
              title={isAnoAtual ? "Status dos Funcionários Ativos" : `Status dos Ativos — fim de ${anoAnalise}`}
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

        {/* ── Análise por Função ── */}
        {(() => {
          const allFuncoes = (data as any).funcaoAll as { label: string; value: number }[] || [];
          const funcaoStatusRaw = (data as any).funcaoStatusDist as { funcao: string; status: string; count: number }[] || [];

          const filteredFuncoes = allFuncoes.filter(f =>
            f.label.toLowerCase().includes(funcaoSearch.toLowerCase())
          );

          // Dados do status para a função selecionada
          const statusRows = selectedFuncao
            ? funcaoStatusRaw.filter(r => r.funcao === selectedFuncao)
            : [];
          const totalFuncao = statusRows.reduce((s, r) => s + r.count, 0);

          // Merge Ferias_em_gozo → Ferias, Lista_Negra → Desligado para exibição
          const statusMerged: Record<string, number> = {};
          for (const r of statusRows) {
            const label = r.status === 'Lista_Negra' ? 'Desligado' : r.status;
            statusMerged[label] = (statusMerged[label] || 0) + r.count;
          }
          const statusLabels = Object.keys(statusMerged);
          const statusValues = statusLabels.map(l => statusMerged[l]);
          const statusBgColors = statusLabels.map(l => STATUS_COLORS[l] || SEMANTIC_COLORS.neutro);

          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  Análise por Função
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {/* Combobox seletor */}
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    <div className="relative w-full sm:w-80" ref={funcaoRef}>
                      <button
                        type="button"
                        onClick={() => setFuncaoDropOpen(v => !v)}
                        className="w-full flex items-center justify-between gap-2 border border-input rounded-md px-3 py-2 text-sm bg-background hover:bg-accent transition-colors"
                      >
                        <span className={selectedFuncao ? "text-foreground" : "text-muted-foreground"}>
                          {selectedFuncao || "Selecione uma função…"}
                        </span>
                        <div className="flex items-center gap-1">
                          {selectedFuncao && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); setSelectedFuncao(null); setFuncaoSearch(""); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setSelectedFuncao(null); setFuncaoSearch(""); }}}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                      {funcaoDropOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg">
                          <div className="p-2 border-b border-border">
                            <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50">
                              <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <input
                                autoFocus
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                placeholder="Buscar função…"
                                value={funcaoSearch}
                                onChange={e => setFuncaoSearch(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="max-h-56 overflow-y-auto py-1">
                            {filteredFuncoes.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-3 py-2">Nenhuma função encontrada</p>
                            ) : filteredFuncoes.map(f => (
                              <button
                                key={f.label}
                                type="button"
                                onClick={() => { setSelectedFuncao(f.label); setFuncaoSearch(""); setFuncaoDropOpen(false); }}
                                className={`w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent transition-colors ${selectedFuncao === f.label ? "bg-primary/10 font-medium" : ""}`}
                              >
                                <span className="truncate text-left">{f.label}</span>
                                <span className="ml-2 text-xs text-muted-foreground shrink-0">{f.value}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {selectedFuncao && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-semibold px-3 py-1.5 rounded-full">
                          <Users className="h-3.5 w-3.5" />
                          {totalFuncao} {totalFuncao === 1 ? "funcionário" : "funcionários"}
                        </span>
                        <button
                          type="button"
                          onClick={() => openDrillDown(`Função: ${selectedFuncao}`, "funcao", selectedFuncao)}
                          className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                        >
                          Ver lista
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Conteúdo quando função selecionada */}
                  {selectedFuncao ? (
                    statusLabels.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado disponível para esta função.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        {/* Barras de status */}
                        <DashChart
                          title={`Status — ${selectedFuncao}`}
                          type="horizontalBar"
                          labels={statusLabels}
                          datasets={[{ label: "Funcionários", data: statusValues, backgroundColor: statusBgColors }]}
                          height={220}
                          onChartClick={(info) => openDrillDown(`${selectedFuncao} · ${info.label}`, "funcaoStatus", `${selectedFuncao}|${info.label}`)}
                        />
                        {/* Barras horizontais — ranking de funções com destaque */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Posição no ranking geral</p>
                          {allFuncoes.slice(0, 12).map((f, i) => {
                            const maxVal = allFuncoes[0]?.value || 1;
                            const pct = Math.round((f.value / maxVal) * 100);
                            const isSelected = f.label === selectedFuncao;
                            return (
                              <div
                                key={f.label}
                                className={`flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}`}
                                onClick={() => { setSelectedFuncao(f.label); openDrillDown(`Função: ${f.label}`, "funcao", f.label); }}
                              >
                                <span className={`text-xs w-5 text-right shrink-0 ${isSelected ? "font-bold text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={`text-xs truncate ${isSelected ? "font-semibold text-primary" : ""}`}>{f.label}</span>
                                    <span className={`text-xs ml-1 shrink-0 ${isSelected ? "font-bold text-primary" : "text-muted-foreground"}`}>{f.value}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${isSelected ? "bg-primary" : "bg-primary/30"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {allFuncoes.length > 12 && !allFuncoes.slice(0, 12).find(f => f.label === selectedFuncao) && (
                            <p className="text-xs text-muted-foreground pt-1">
                              "{selectedFuncao}" está na posição #{allFuncoes.findIndex(f => f.label === selectedFuncao) + 1} de {allFuncoes.length}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    /* Estado vazio — mostra top 8 funções como barras clicáveis */
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground mb-3">Selecione uma função acima ou clique em uma barra para analisar</p>
                      {allFuncoes.slice(0, 8).map((f, i) => {
                        const maxVal = allFuncoes[0]?.value || 1;
                        const pct = Math.round((f.value / maxVal) * 100);
                        return (
                          <div
                            key={f.label}
                            className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 transition-colors"
                            onClick={() => { setSelectedFuncao(f.label); openDrillDown(`Função: ${f.label}`, "funcao", f.label); }}
                          >
                            <span className="text-xs w-5 text-right text-muted-foreground shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs truncate">{f.label}</span>
                                <span className="text-xs text-muted-foreground ml-1 shrink-0">{f.value}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

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

        {/* Mapa Interativo — Brasil → Estado → Cidade → Pins por rua */}
        <MapaFuncionariosInterativo
          stateDist={(data as any).estadoDist || []}
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
            title={`Admissões x Demissões — ${anoAnalise}`}
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
                  {data.rankingAdvertencias.map((r, i) => {
                    const inner = (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${i < 3 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                          <RankAvatar src={(r as any).fotoUrl} nome={r.nome} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[140px] sm:max-w-[180px]">{r.nome}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[140px] sm:max-w-[180px]">{r.funcao}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-red-600 shrink-0">{r.total}</span>
                      </>
                    );
                    const eid = (r as any).employeeId;
                    return eid ? (
                      <Link key={i} href={`/raio-x/${eid}`} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 hover:bg-muted/50 rounded-md px-1 -mx-1 transition-colors">
                        {inner}
                      </Link>
                    ) : (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        {inner}
                      </div>
                    );
                  })}
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
                  {data.rankingAtestados.map((r, i) => {
                    const inner = (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${i < 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                          <RankAvatar src={(r as any).fotoUrl} nome={r.nome} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[120px] sm:max-w-[160px]">{r.nome}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[160px]">{r.funcao}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-orange-600">{r.totalAtestados} atestados</span>
                          <p className="text-xs text-muted-foreground">{r.totalDias} dias afastado</p>
                        </div>
                      </>
                    );
                    const eid = (r as any).employeeId;
                    return eid ? (
                      <Link key={i} href={`/raio-x/${eid}`} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 hover:bg-muted/50 rounded-md px-1 -mx-1 transition-colors">
                        {inner}
                      </Link>
                    ) : (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <HeadcountAnualFuncionarios
        data={headcountAnual}
        isLoading={loadingHeadcount}
        onSelectAno={openAnoDrill}
      />

      <ComparativoAnosFuncionarios
        data={anual}
        isLoading={loadingAnual}
        anoRef={anoAnalise}
      />

      <TabelaComparativaAnual
        meses={comparativo?.meses || []}
        indicadores={FUNC_INDICADORES}
        isLoading={loadingComp}
        titulo={`Movimentação mês-a-mês — ${anoAnalise}`}
        subtitulo="Headcount, admissões, demissões e turnover · clique em qualquer linha para análise aprofundada"
      />

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
