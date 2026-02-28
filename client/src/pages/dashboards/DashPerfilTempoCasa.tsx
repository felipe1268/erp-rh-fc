import { useState, useMemo } from "react";
import { CHART_PALETTE, getChartColors, SEMANTIC_COLORS } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, UserSearch, TrendingUp, TrendingDown, ArrowLeft,
  Sparkles, ThumbsUp, ThumbsDown, AlertTriangle, Target, Loader2,
  Brain, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

type FaixaItem = { label: string; value: number };
type FaixaData = {
  label: string;
  total: number;
  estadoCivil: FaixaItem[];
  sexo: FaixaItem[];
  faixaEtaria: FaixaItem[];
  estado: FaixaItem[];
  cidade: FaixaItem[];
  funcao: FaixaItem[];
  setor: FaixaItem[];
  obra: FaixaItem[];
  advertencias: number;
  atestados: number;
  funcionarios: { nome: string; funcao: string; tempo: string; advertencias: number; atestados: number }[];
};

type AnaliseIA = {
  pontosPositivos: { titulo: string; descricao: string; acaoSugerida: string }[];
  pontosNegativos: { titulo: string; descricao: string; acaoSugerida: string }[];
  perfilIdeal: string;
  alertas: string[];
};

const FAIXA_COLORS: Record<string, string> = {
  '< 3 meses': '#EF5350',
  '3-6 meses': '#F5A962',
  '6-12 meses': '#F7CB73',
  '1-2 anos': '#5CC5CF',
  '2-5 anos': '#5B8DEF',
  '5+ anos': '#67C587',
};

export default function DashPerfilTempoCasa() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [selectedFaixa, setSelectedFaixa] = useState<string | null>(null);
  const [showIA, setShowIA] = useState(false);
  const [expandedPositive, setExpandedPositive] = useState<number | null>(null);
  const [expandedNegative, setExpandedNegative] = useState<number | null>(null);

  const { data, isLoading } = trpc.dashboards.perfilTempoCasa.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const analiseMutation = trpc.dashboards.analiseIAPerfil.useMutation({
    onSuccess: () => {
      setShowIA(true);
      toast.success("Análise IA concluída!");
    },
    onError: (err) => {
      toast.error("Erro na análise IA: " + err.message);
    },
  });

  const faixas = (data?.faixas || []) as FaixaData[];
  const totalAtivos = data?.totalAtivos || 0;

  // Faixa selecionada para detalhamento
  const faixaDetail = useMemo(() => {
    if (!selectedFaixa) return null;
    return faixas.find(f => f.label === selectedFaixa) || null;
  }, [selectedFaixa, faixas]);

  // Chart data: distribuição por faixa de tempo
  const faixaLabels = faixas.map(f => f.label);
  const faixaValues = faixas.map(f => f.total);
  const faixaColors = faixas.map(f => FAIXA_COLORS[f.label] || CHART_PALETTE[0]);

  // Tabela de correlação
  const correlationData = useMemo(() => {
    return faixas.map(f => ({
      faixa: f.label,
      total: f.total,
      pctTotal: totalAtivos > 0 ? ((f.total / totalAtivos) * 100).toFixed(1) : '0',
      topEstadoCivil: f.estadoCivil[0]?.label || '-',
      topSexo: f.sexo[0]?.label || '-',
      topIdade: f.faixaEtaria[0]?.label || '-',
      topFuncao: f.funcao[0]?.label || '-',
      topEstado: f.estado[0]?.label || '-',
      topObra: f.obra[0]?.label || '-',
      advPorFunc: f.total > 0 ? (f.advertencias / f.total).toFixed(2) : '0',
      atestPorFunc: f.total > 0 ? (f.atestados / f.total).toFixed(2) : '0',
    }));
  }, [faixas, totalAtivos]);

  // Stacked bar chart: sexo por faixa
  const sexoLabels = ['Masculino', 'Feminino', 'Outro'];
  const sexoDatasets = sexoLabels.map((sexo, i) => ({
    label: sexo,
    data: faixas.map(f => {
      const item = f.sexo.find(s => s.label === sexo);
      return item?.value || 0;
    }),
    backgroundColor: [SEMANTIC_COLORS.masculino, SEMANTIC_COLORS.feminino, SEMANTIC_COLORS.outro][i],
  }));

  // Stacked bar: faixa etária por tempo de casa
  const idadeLabels = ['18-24', '25-34', '35-44', '45-54', '55+'];
  const idadeDatasets = idadeLabels.map((idade, i) => ({
    label: idade,
    data: faixas.map(f => {
      const item = f.faixaEtaria.find(e => e.label === idade);
      return item?.value || 0;
    }),
    backgroundColor: getChartColors(5)[i],
  }));

  // Advertências e atestados por faixa
  const advAtestLabels = faixas.map(f => f.label);
  const advAtestDatasets = [
    {
      label: 'Adv./Func.',
      data: faixas.map(f => f.total > 0 ? Number((f.advertencias / f.total).toFixed(2)) : 0),
      backgroundColor: SEMANTIC_COLORS.alerta,
    },
    {
      label: 'Atest./Func.',
      data: faixas.map(f => f.total > 0 ? Number((f.atestados / f.total).toFixed(2)) : 0),
      backgroundColor: SEMANTIC_COLORS.info,
    },
  ];

  const analiseIA = analiseMutation.data?.analise as AnaliseIA | null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-muted-foreground">Carregando dados...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PrintHeader title="Dashboard - Análise de Perfil por Tempo de Casa" />
      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboards">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Análise de Perfil por Tempo de Casa</h1>
              <p className="text-sm text-muted-foreground">Análise comparativa de funcionários agrupados por tempo de empresa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => analiseMutation.mutate({ companyId })}
              disabled={analiseMutation.isPending}
              className="gap-2"
            >
              {analiseMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {analiseMutation.isPending ? "Analisando..." : "Gerar Análise IA"}
            </Button>
            <PrintActions title="Perfil por Tempo de Casa" />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {faixas.map((f, i) => (
            <div
              key={f.label}
              className="cursor-pointer"
              onClick={() => setSelectedFaixa(selectedFaixa === f.label ? null : f.label)}
            >
              <DashKpi
                label={f.label}
                value={f.total}
                color={['red', 'orange', 'yellow', 'teal', 'blue', 'green'][i] || 'blue'}
                icon={[Clock, Clock, Clock, Users, Users, Users][i]}
                sub={`${totalAtivos > 0 ? ((f.total / totalAtivos) * 100).toFixed(0) : 0}% do total`}
                active={selectedFaixa === f.label}
              />
            </div>
          ))}
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Histograma principal */}
          <DashChart
            title="Distribuição por Tempo de Casa"
            type="bar"
            labels={faixaLabels}
            datasets={[{
              label: 'Funcionários',
              data: faixaValues,
              backgroundColor: faixaColors,
            }]}
            height={300}
            onChartClick={(info) => setSelectedFaixa(info.label)}
          />

          {/* Sexo por faixa */}
          <DashChart
            title="Gênero por Tempo de Casa"
            type="bar"
            labels={faixaLabels}
            datasets={sexoDatasets}
            height={300}
          />
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Faixa etária por tempo */}
          <DashChart
            title="Faixa Etária por Tempo de Casa"
            type="bar"
            labels={faixaLabels}
            datasets={idadeDatasets}
            height={300}
          />

          {/* Advertências e Atestados por faixa */}
          <DashChart
            title="Média de Advertências e Atestados por Funcionário"
            type="bar"
            labels={advAtestLabels}
            datasets={advAtestDatasets}
            height={300}
          />
        </div>

        {/* Tabela de Correlação */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              Tabela de Correlação — Perfil por Faixa de Tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-semibold">Faixa</th>
                    <th className="text-center p-2 font-semibold">Qtd</th>
                    <th className="text-center p-2 font-semibold">%</th>
                    <th className="text-left p-2 font-semibold">Gênero Predominante</th>
                    <th className="text-left p-2 font-semibold">Idade Predominante</th>
                    <th className="text-left p-2 font-semibold">Estado Civil</th>
                    <th className="text-left p-2 font-semibold">Função Principal</th>
                    <th className="text-left p-2 font-semibold">UF</th>
                    <th className="text-left p-2 font-semibold">Obra</th>
                    <th className="text-center p-2 font-semibold">Adv./Func</th>
                    <th className="text-center p-2 font-semibold">Atest./Func</th>
                  </tr>
                </thead>
                <tbody>
                  {correlationData.map((row, i) => (
                    <tr
                      key={row.faixa}
                      className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${selectedFaixa === row.faixa ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                      onClick={() => setSelectedFaixa(selectedFaixa === row.faixa ? null : row.faixa)}
                    >
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          style={{ borderColor: FAIXA_COLORS[row.faixa], color: FAIXA_COLORS[row.faixa] }}
                        >
                          {row.faixa}
                        </Badge>
                      </td>
                      <td className="text-center p-2 font-semibold">{row.total}</td>
                      <td className="text-center p-2">{row.pctTotal}%</td>
                      <td className="p-2">{row.topSexo}</td>
                      <td className="p-2">{row.topIdade}</td>
                      <td className="p-2">{row.topEstadoCivil}</td>
                      <td className="p-2 max-w-[150px] truncate" title={row.topFuncao}>{row.topFuncao}</td>
                      <td className="p-2">{row.topEstado}</td>
                      <td className="p-2 max-w-[120px] truncate" title={row.topObra}>{row.topObra}</td>
                      <td className="text-center p-2">
                        <span className={Number(row.advPorFunc) > 1 ? 'text-red-500 font-semibold' : ''}>
                          {row.advPorFunc}
                        </span>
                      </td>
                      <td className="text-center p-2">
                        <span className={Number(row.atestPorFunc) > 2 ? 'text-orange-500 font-semibold' : ''}>
                          {row.atestPorFunc}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Detalhe da faixa selecionada */}
        {faixaDetail && (
          <Card className="border-2" style={{ borderColor: FAIXA_COLORS[faixaDetail.label] || '#5B8DEF' }}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserSearch className="h-5 w-5" style={{ color: FAIXA_COLORS[faixaDetail.label] }} />
                  Detalhamento: {faixaDetail.label} ({faixaDetail.total} funcionários)
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedFaixa(null)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="perfil">
                <TabsList className="mb-4">
                  <TabsTrigger value="perfil">Perfil</TabsTrigger>
                  <TabsTrigger value="funcoes">Funções & Obras</TabsTrigger>
                  <TabsTrigger value="lista">Lista de Funcionários</TabsTrigger>
                </TabsList>

                <TabsContent value="perfil">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Gênero */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Gênero</h4>
                      {faixaDetail.sexo.map(s => (
                        <div key={s.label} className="flex justify-between text-sm py-1">
                          <span>{s.label}</span>
                          <span className="font-semibold">{s.value} ({faixaDetail.total > 0 ? ((s.value / faixaDetail.total) * 100).toFixed(0) : 0}%)</span>
                        </div>
                      ))}
                    </div>
                    {/* Faixa Etária */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Faixa Etária</h4>
                      {faixaDetail.faixaEtaria.map(e => (
                        <div key={e.label} className="flex justify-between text-sm py-1">
                          <span>{e.label}</span>
                          <span className="font-semibold">{e.value}</span>
                        </div>
                      ))}
                    </div>
                    {/* Estado Civil */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Estado Civil</h4>
                      {faixaDetail.estadoCivil.map(e => (
                        <div key={e.label} className="flex justify-between text-sm py-1">
                          <span>{e.label}</span>
                          <span className="font-semibold">{e.value}</span>
                        </div>
                      ))}
                    </div>
                    {/* UF */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Estado (UF)</h4>
                      {faixaDetail.estado.slice(0, 5).map(e => (
                        <div key={e.label} className="flex justify-between text-sm py-1">
                          <span>{e.label}</span>
                          <span className="font-semibold">{e.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <p className="text-2xl font-bold text-orange-600">{faixaDetail.advertencias}</p>
                      <p className="text-xs text-muted-foreground">Advertências</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{faixaDetail.atestados}</p>
                      <p className="text-xs text-muted-foreground">Atestados</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">
                        {faixaDetail.total > 0 ? (faixaDetail.advertencias / faixaDetail.total).toFixed(2) : '0'}
                      </p>
                      <p className="text-xs text-muted-foreground">Adv./Func.</p>
                    </div>
                    <div className="text-center p-3 bg-teal-50 dark:bg-teal-950 rounded-lg">
                      <p className="text-2xl font-bold text-teal-600">
                        {faixaDetail.total > 0 ? (faixaDetail.atestados / faixaDetail.total).toFixed(2) : '0'}
                      </p>
                      <p className="text-xs text-muted-foreground">Atest./Func.</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="funcoes">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Top Funções</h4>
                      {faixaDetail.funcao.slice(0, 8).map((f, i) => (
                        <div key={f.label} className="flex justify-between text-sm py-1 border-b border-dashed">
                          <span className="truncate max-w-[200px]" title={f.label}>{i + 1}. {f.label}</span>
                          <span className="font-semibold ml-2">{f.value}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Top Setores</h4>
                      {faixaDetail.setor.slice(0, 8).map((s, i) => (
                        <div key={s.label} className="flex justify-between text-sm py-1 border-b border-dashed">
                          <span className="truncate max-w-[200px]" title={s.label}>{i + 1}. {s.label}</span>
                          <span className="font-semibold ml-2">{s.value}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Top Obras</h4>
                      {faixaDetail.obra.slice(0, 8).map((o, i) => (
                        <div key={o.label} className="flex justify-between text-sm py-1 border-b border-dashed">
                          <span className="truncate max-w-[200px]" title={o.label}>{i + 1}. {o.label}</span>
                          <span className="font-semibold ml-2">{o.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="lista">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2">Nome</th>
                          <th className="text-left p-2">Função</th>
                          <th className="text-center p-2">Advertências</th>
                          <th className="text-center p-2">Atestados</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faixaDetail.funcionarios
                          .sort((a, b) => (b.advertencias + b.atestados) - (a.advertencias + a.atestados))
                          .map((func, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{func.nome}</td>
                            <td className="p-2 text-muted-foreground">{func.funcao}</td>
                            <td className="text-center p-2">
                              {func.advertencias > 0 ? (
                                <Badge variant="destructive" className="text-xs">{func.advertencias}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="text-center p-2">
                              {func.atestados > 0 ? (
                                <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">{func.atestados}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Análise IA */}
        {showIA && analiseIA && (
          <Card className="border-2 border-purple-200 dark:border-purple-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Análise Inteligente — Perfil por Tempo de Casa
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => analiseMutation.mutate({ companyId })}
                  disabled={analiseMutation.isPending}
                  className="gap-1"
                >
                  <RefreshCw className={`h-3 w-3 ${analiseMutation.isPending ? 'animate-spin' : ''}`} />
                  Regenerar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Perfil Ideal */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Target className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Perfil Ideal de Contratação</h4>
                    <p className="text-sm text-blue-600 dark:text-blue-400">{analiseIA.perfilIdeal}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pontos Positivos */}
                <div>
                  <h3 className="font-semibold text-green-700 dark:text-green-400 flex items-center gap-2 mb-3">
                    <ThumbsUp className="h-5 w-5" />
                    O que Aproveitar (Padrões de Retenção)
                  </h3>
                  <div className="space-y-3">
                    {analiseIA.pontosPositivos.map((p, i) => (
                      <div
                        key={i}
                        className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800 cursor-pointer transition-all hover:shadow-sm"
                        onClick={() => setExpandedPositive(expandedPositive === i ? null : i)}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm text-green-800 dark:text-green-300">{p.titulo}</h4>
                          {expandedPositive === i ? (
                            <ChevronUp className="h-4 w-4 text-green-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        {expandedPositive === i && (
                          <div className="mt-2 space-y-2">
                            <p className="text-sm text-green-700 dark:text-green-400">{p.descricao}</p>
                            <div className="flex items-start gap-2 pt-1 border-t border-green-200 dark:border-green-700">
                              <TrendingUp className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                              <p className="text-xs font-medium text-green-600 dark:text-green-400">{p.acaoSugerida}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pontos Negativos */}
                <div>
                  <h3 className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-2 mb-3">
                    <ThumbsDown className="h-5 w-5" />
                    O que Evitar / Melhorar
                  </h3>
                  <div className="space-y-3">
                    {analiseIA.pontosNegativos.map((p, i) => (
                      <div
                        key={i}
                        className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800 cursor-pointer transition-all hover:shadow-sm"
                        onClick={() => setExpandedNegative(expandedNegative === i ? null : i)}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm text-red-800 dark:text-red-300">{p.titulo}</h4>
                          {expandedNegative === i ? (
                            <ChevronUp className="h-4 w-4 text-red-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        {expandedNegative === i && (
                          <div className="mt-2 space-y-2">
                            <p className="text-sm text-red-700 dark:text-red-400">{p.descricao}</p>
                            <div className="flex items-start gap-2 pt-1 border-t border-red-200 dark:border-red-700">
                              <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                              <p className="text-xs font-medium text-red-600 dark:text-red-400">{p.acaoSugerida}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Alertas */}
              {analiseIA.alertas.length > 0 && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <h4 className="font-semibold text-yellow-700 dark:text-yellow-300 flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Alertas
                  </h4>
                  <ul className="space-y-1">
                    {analiseIA.alertas.map((a, i) => (
                      <li key={i} className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                        <span className="text-yellow-500 mt-1">•</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading state for IA */}
        {analiseMutation.isPending && (
          <Card className="border-2 border-purple-200 dark:border-purple-800">
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <Brain className="h-12 w-12 text-purple-400 animate-pulse" />
                  <Sparkles className="h-5 w-5 text-yellow-400 absolute -top-1 -right-1 animate-bounce" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-purple-700 dark:text-purple-300">Analisando perfis dos funcionários...</p>
                  <p className="text-sm text-muted-foreground mt-1">A IA está cruzando dados de tempo de casa, advertências, atestados e perfil demográfico</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
