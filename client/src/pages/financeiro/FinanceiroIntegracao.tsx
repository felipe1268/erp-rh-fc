import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, Download, AlertTriangle, CheckCircle, XCircle,
  Clock, TrendingUp, TrendingDown, Activity, Zap, RotateCcw,
  Calendar, Building2, ArrowRight, Bell, ShieldCheck, BarChart2,
  DollarSign, Layers, FileText, Play, History
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtK(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}K`;
  return fmt(v);
}
function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMes(m: string) {
  const [y, mo] = m.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(mo) - 1]}/${y}`;
}
function nivelColor(n: string) {
  if (n === "critical") return "bg-red-100 text-red-700 border-red-200";
  if (n === "warning") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}
function nivelLabel(n: string) {
  if (n === "critical") return "Crítico";
  if (n === "warning") return "Atenção";
  return "Info";
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

const MODULO_LABELS: Record<string, string> = {
  folha_clt: "Folha CLT", pagamento_pj: "Pagamento PJ",
  terceiro_medicao: "Terceiros (Medição)", pagamento_parceiro: "Parceiros",
  frota_abastecimento: "Frotas — Combustível", frota_manutencao: "Frotas — Manutenção",
  beneficio_vr: "Benefícios VR", beneficio_va: "Benefícios VA",
  seguro_vida: "Seguro de Vida", adiantamento_salario: "Adiantamentos",
  pro_labore: "Pró-Labore", planejamento_compra: "Planejamento",
  almoxarifado: "Almoxarifado", processo_trabalhista: "Processos Trabalhistas",
  guia_tributaria: "Guias Tributárias", medicao_obra: "Medições de Obra",
  medicao_pj_receita: "Medições PJ (Receita)", terceiro_cobravel: "Terceiros Cobráveis",
  compras: "Compras / OC", sistema: "Sistema",
};

export default function FinanceiroIntegracao() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [mes, setMes] = useState(getMesAtual());
  const [tab, setTab] = useState<"overview" | "alertas" | "aprovacoes" | "log">("overview");
  const [mesesRetro, setMesesRetro] = useState("6");
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingRetro, setLoadingRetro] = useState(false);
  const [loadingAlertas, setLoadingAlertas] = useState(false);

  const meses12 = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: indicadores, isLoading: loadInd, refetch: refetchInd } =
    (trpc as any).financial.getIndicadores.useQuery(
      { companyId, periodo: mes },
      { enabled: !!companyId }
    );

  const { data: kpis, isLoading: loadKpi, refetch: refetchKpi } =
    (trpc as any).financial.getKpis.useQuery(
      { companyId, periodo: mes },
      { enabled: !!companyId }
    );

  const { data: modulos, isLoading: loadMod, refetch: refetchMod } =
    (trpc as any).financial.getResumoModulos.useQuery(
      { companyId, periodo: mes },
      { enabled: !!companyId }
    );

  const { data: alertas, isLoading: loadAlerts, refetch: refetchAlerts } =
    (trpc as any).financial.getAlerts.useQuery(
      { companyId, resolvido: false, limit: 100 },
      { enabled: !!companyId }
    );

  const { data: aprovacoes, isLoading: loadAprov, refetch: refetchAprov } =
    (trpc as any).financial.getApprovals.useQuery(
      { companyId, status: "pendente", limit: 100 },
      { enabled: !!companyId }
    );

  const { data: importLog, isLoading: loadLog, refetch: refetchLog } =
    (trpc as any).financial.getImportLog.useQuery(
      { companyId, limit: 50 },
      { enabled: !!companyId }
    );

  const importarAgora = (trpc as any).financial.importarAgora.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "Importação concluída", description: `${r.totalImportado} lançamentos importados` });
      setLoadingImport(false);
      refetchInd(); refetchKpi(); refetchMod(); refetchLog();
    },
    onError: (e: any) => {
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
      setLoadingImport(false);
    },
  });

  const retroacaoHistorica = (trpc as any).financial.retroacaoHistorica.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "Retroação concluída", description: `${r.totalImportado} lançamentos históricos importados` });
      setLoadingRetro(false);
      refetchInd(); refetchKpi(); refetchMod(); refetchLog();
    },
    onError: (e: any) => {
      toast({ title: "Erro na retroação", description: e.message, variant: "destructive" });
      setLoadingRetro(false);
    },
  });

  const gerarAlertasVencimento = (trpc as any).financial.gerarAlertasVencimento.useMutation({
    onSuccess: (r: any) => {
      toast({ title: "Alertas gerados", description: `${r.gerados} alertas de vencimento criados` });
      setLoadingAlertas(false);
      refetchAlerts();
    },
    onError: (e: any) => {
      toast({ title: "Erro ao gerar alertas", description: e.message, variant: "destructive" });
      setLoadingAlertas(false);
    },
  });

  const resolveAlert = (trpc as any).financial.resolveAlert.useMutation({
    onSuccess: () => refetchAlerts(),
  });

  const resolveApproval = (trpc as any).financial.resolveApproval.useMutation({
    onSuccess: () => refetchAprov(),
  });

  const alertasCriticos = (alertas ?? []).filter((a: any) => a.nivel === "critical").length;
  const alertasWarning = (alertas ?? []).filter((a: any) => a.nivel === "warning").length;
  const aprovPendentes = (aprovacoes ?? []).length;

  const totalModReceitaPrev = (modulos ?? []).filter((m: any) => m.tipo === "receita")
    .reduce((s: number, m: any) => s + parseFloat(m.total_previsto ?? 0), 0);
  const totalModDespesaPrev = (modulos ?? []).filter((m: any) => m.tipo === "despesa")
    .reduce((s: number, m: any) => s + parseFloat(m.total_previsto ?? 0), 0);

  function handleImportar() {
    setLoadingImport(true);
    importarAgora.mutate({ companyId, mesRef: mes });
  }
  function handleRetroacao() {
    setLoadingRetro(true);
    retroacaoHistorica.mutate({ companyId, meses: parseInt(mesesRetro) });
  }
  function handleGerarAlertas() {
    setLoadingAlertas(true);
    gerarAlertasVencimento.mutate({ companyId });
  }

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      tab === t
        ? "bg-white shadow-sm text-gray-900"
        : "text-gray-500 hover:text-gray-700"
    }`;

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integração Financeira</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Lançamentos automáticos de todos os módulos · Alçadas COSO · KPIs financeiros
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                <SelectValue>{fmtMes(mes)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {meses12.map(m => <SelectItem key={m} value={m}>{fmtMes(m)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleImportar} disabled={loadingImport || !companyId}
            >
              {loadingImport
                ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Play className="w-3.5 h-3.5 mr-1.5" />}
              Importar Agora
            </Button>
          </div>
        </div>

        {/* CARDS RÁPIDOS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-500" /> Receita Prevista
              </div>
              <p className="text-xl font-bold text-gray-900">
                {loadInd ? "..." : fmtK(indicadores?.receita ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-500" /> Despesa Prevista
              </div>
              <p className="text-xl font-bold text-gray-900">
                {loadInd ? "..." : fmtK(indicadores?.despesa ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${(alertasCriticos > 0) ? "ring-1 ring-red-200" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Bell className="w-3.5 h-3.5 text-amber-500" /> Alertas Ativos
              </div>
              <p className="text-xl font-bold text-gray-900">
                {loadAlerts ? "..." : (alertas ?? []).length}
              </p>
              {alertasCriticos > 0 && (
                <p className="text-[11px] text-red-600 mt-0.5">{alertasCriticos} crítico{alertasCriticos !== 1 ? "s" : ""}</p>
              )}
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${aprovPendentes > 0 ? "ring-1 ring-amber-200" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Aprovações Pendentes
              </div>
              <p className="text-xl font-bold text-gray-900">
                {loadAprov ? "..." : aprovPendentes}
              </p>
              {indicadores?.vencidos > 0 && (
                <p className="text-[11px] text-red-600 mt-0.5">{fmtK(indicadores.vencidos)} vencidos</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* TABS */}
        <div className="bg-gray-100 rounded-lg p-1 flex gap-1 w-full sm:w-auto sm:inline-flex">
          <button className={tabClass("overview")} onClick={() => setTab("overview")}>
            <BarChart2 className="w-3.5 h-3.5 inline mr-1.5" />KPIs & Módulos
          </button>
          <button className={tabClass("alertas")} onClick={() => setTab("alertas")}>
            <Bell className="w-3.5 h-3.5 inline mr-1.5" />
            Alertas {alertasCriticos > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1">{alertasCriticos}</span>}
          </button>
          <button className={tabClass("aprovacoes")} onClick={() => setTab("aprovacoes")}>
            <ShieldCheck className="w-3.5 h-3.5 inline mr-1.5" />
            Aprovações {aprovPendentes > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full px-1">{aprovPendentes}</span>}
          </button>
          <button className={tabClass("log")} onClick={() => setTab("log")}>
            <History className="w-3.5 h-3.5 inline mr-1.5" />Log de Importação
          </button>
        </div>

        {/* TAB: OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-5">

            {/* KPIs Financeiros */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  KPIs Financeiros — {fmtMes(mes)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadKpi ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Calculando KPIs...</p>
                ) : !kpis ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Sem dados de KPI para o período.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <KpiCard label="DSO (Dias de Recebimento)" value={`${(kpis.dso ?? 0).toFixed(1)} dias`}
                      sub="Days Sales Outstanding" icon={<Clock className="w-4 h-4 text-blue-500" />}
                      alert={(kpis.dso ?? 0) > 45} />
                    <KpiCard label="DPO (Dias de Pagamento)" value={`${(kpis.dpo ?? 0).toFixed(1)} dias`}
                      sub="Days Payables Outstanding" icon={<Clock className="w-4 h-4 text-green-500" />} />
                    <KpiCard label="Caixa Livre (FCL)" value={fmtK(kpis.caixaLivre ?? 0)}
                      sub="FCO − CAPEX" icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
                      alert={(kpis.caixaLivre ?? 0) < 0} />
                    <KpiCard label="Burn Rate" value={fmtK(kpis.burnRate ?? 0)}
                      sub="Custos fixos/mês" icon={<Zap className="w-4 h-4 text-orange-500" />} />
                    <KpiCard label="Capital de Giro Líquido" value={fmtK(kpis.capitalGiroLiquido ?? 0)}
                      sub="Ativo − Passivo Corrente" icon={<TrendingUp className="w-4 h-4 text-violet-500" />}
                      alert={(kpis.capitalGiroLiquido ?? 0) < 0} />
                    <KpiCard label="Liquidez Corrente" value={(kpis.liquidezCorrente ?? 0).toFixed(2)}
                      sub="AC / PC" icon={<BarChart2 className="w-4 h-4 text-cyan-500" />}
                      alert={(kpis.liquidezCorrente ?? 1) < 1} />
                    <KpiCard label="Margem Bruta" value={`${(kpis.margemBruta ?? 0).toFixed(1)}%`}
                      sub="(Receita − Despesa) / Receita" icon={<TrendingUp className="w-4 h-4 text-green-600" />}
                      alert={(kpis.margemBruta ?? 0) < 10} />
                    <KpiCard label="Inadimplência" value={fmtK(kpis.totalInadimplente ?? 0)}
                      sub="A receber vencido" icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
                      alert={(kpis.totalInadimplente ?? 0) > 0} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resumo por Módulo */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  Lançamentos por Módulo — {fmtMes(mes)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadMod ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Carregando...</p>
                ) : !(modulos ?? []).length ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">Nenhum lançamento integrado ainda.</p>
                    <p className="text-xs text-gray-400 mt-1">Use "Importar Agora" ou aguarde o job automático (a cada 60 min).</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-gray-500">
                          <th className="pb-2 font-medium">Módulo</th>
                          <th className="pb-2 font-medium">Tipo</th>
                          <th className="pb-2 font-medium text-right">Qtd.</th>
                          <th className="pb-2 font-medium text-right">Previsto</th>
                          <th className="pb-2 font-medium text-right">Realizado</th>
                          <th className="pb-2 font-medium text-right">Pendente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(modulos ?? []).map((m: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="py-2 font-medium">
                              {MODULO_LABELS[m.origemModulo] ?? m.origemModulo}
                            </td>
                            <td className="py-2">
                              <Badge variant="outline" className={
                                m.tipo === "receita"
                                  ? "text-green-700 border-green-200 bg-green-50 text-[11px]"
                                  : "text-red-700 border-red-200 bg-red-50 text-[11px]"
                              }>
                                {m.tipo === "receita" ? "Receita" : "Despesa"}
                              </Badge>
                            </td>
                            <td className="py-2 text-right text-gray-600">{m.qtd}</td>
                            <td className="py-2 text-right font-medium">{fmtK(parseFloat(m.total_previsto ?? 0))}</td>
                            <td className="py-2 text-right text-green-700">{fmtK(parseFloat(m.total_realizado ?? 0))}</td>
                            <td className="py-2 text-right text-amber-700">{fmtK(parseFloat(m.total_pendente ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-semibold text-sm">
                          <td className="pt-2 text-gray-900" colSpan={3}>TOTAL</td>
                          <td className="pt-2 text-right">{fmtK(totalModReceitaPrev + totalModDespesaPrev)}</td>
                          <td className="pt-2 text-right text-green-700">—</td>
                          <td className="pt-2 text-right text-amber-700">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ações Avançadas */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-gray-500" />
                  Ações Avançadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Importação manual */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Play className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-sm">Importar Agora</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Executa imediatamente a importação de todos os módulos para o mês selecionado.
                    </p>
                    <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleImportar} disabled={loadingImport || !companyId}>
                      {loadingImport && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      {loadingImport ? "Importando..." : `Importar ${fmtMes(mes)}`}
                    </Button>
                  </div>

                  {/* Retroação histórica */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-violet-600" />
                      <span className="font-medium text-sm">Retroação Histórica</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Reimporta dados históricos dos últimos N meses retroativamente.
                    </p>
                    <div className="flex gap-2">
                      <Select value={mesesRetro} onValueChange={setMesesRetro}>
                        <SelectTrigger className="h-8 text-sm w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["1","3","6","12","24"].map(v => (
                            <SelectItem key={v} value={v}>{v} {parseInt(v) === 1 ? "mês" : "meses"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="flex-1"
                        onClick={handleRetroacao} disabled={loadingRetro || !companyId}>
                        {loadingRetro && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                        {loadingRetro ? "Processando..." : "Executar"}
                      </Button>
                    </div>
                  </div>

                  {/* Gerar alertas */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-600" />
                      <span className="font-medium text-sm">Gerar Alertas de Vencimento</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Varre todos os lançamentos e cria alertas para vencimentos próximos (7 dias) e atrasados.
                    </p>
                    <Button size="sm" variant="outline" className="w-full"
                      onClick={handleGerarAlertas} disabled={loadingAlertas || !companyId}>
                      {loadingAlertas && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      {loadingAlertas ? "Gerando..." : "Gerar Alertas"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB: ALERTAS */}
        {tab === "alertas" && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  Alertas Financeiros Ativos
                </CardTitle>
                <div className="flex gap-2">
                  {alertasCriticos > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-200">{alertasCriticos} crítico{alertasCriticos !== 1 ? "s" : ""}</Badge>
                  )}
                  {alertasWarning > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">{alertasWarning} atenção</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadAlerts ? (
                <p className="text-sm text-gray-400 py-6 text-center">Carregando alertas...</p>
              ) : !(alertas ?? []).length ? (
                <div className="py-10 text-center">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhum alerta ativo.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={handleGerarAlertas} disabled={loadingAlertas || !companyId}>
                    Verificar vencimentos agora
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(alertas ?? []).map((a: any) => (
                    <div key={a.id} className={`flex items-start justify-between gap-4 p-3 rounded-lg border ${nivelColor(a.nivel)}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[10px] ${nivelColor(a.nivel)} border`}>{nivelLabel(a.nivel)}</Badge>
                          {a.origemModulo && (
                            <span className="text-[10px] text-gray-500">{MODULO_LABELS[a.origemModulo] ?? a.origemModulo}</span>
                          )}
                        </div>
                        <p className="font-medium text-sm mt-0.5 truncate">{a.titulo}</p>
                        {a.descricao && <p className="text-xs text-gray-600 mt-0.5 truncate">{a.descricao}</p>}
                        <p className="text-[10px] text-gray-500 mt-1">{fmtDate(a.dataReferencia)} · {a.responsavelNome ?? "—"}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        {a.valorReferencia && (
                          <span className="text-xs font-semibold">{fmtK(parseFloat(a.valorReferencia))}</span>
                        )}
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs whitespace-nowrap"
                          onClick={() => resolveAlert.mutate({ id: a.id, companyId })}
                          disabled={resolveAlert.isLoading}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />Resolver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB: APROVAÇÕES */}
        {tab === "aprovacoes" && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                Aprovações Pendentes — Alçada COSO
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadAprov ? (
                <p className="text-sm text-gray-400 py-6 text-center">Carregando aprovações...</p>
              ) : !(aprovacoes ?? []).length ? (
                <div className="py-10 text-center">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhuma aprovação pendente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(aprovacoes ?? []).map((ap: any) => (
                    <div key={ap.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-amber-100 bg-amber-50/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${
                            ap.nivel === "diretoria"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : ap.nivel === "gerente"
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : "bg-blue-100 text-blue-700 border-blue-200"
                          } border`}>
                            {ap.nivel === "diretoria" ? "Diretoria" : ap.nivel === "gerente" ? "Gerente" : "Coordenador"}
                          </Badge>
                          <span className="text-xs text-gray-500">Alçada COSO</span>
                        </div>
                        <p className="font-semibold text-sm mt-1">{fmt(parseFloat(ap.valor ?? 0))}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Solicitante: {ap.solicitanteNome ?? "—"} · {fmtDate(ap.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => resolveApproval.mutate({ id: ap.id, companyId, status: "aprovado" })}
                          disabled={resolveApproval.isLoading}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />Aprovar
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => resolveApproval.mutate({ id: ap.id, companyId, status: "recusado" })}
                          disabled={resolveApproval.isLoading}
                        >
                          <XCircle className="w-3 h-3 mr-1" />Recusar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB: LOG */}
        {tab === "log" && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Log de Importação Automática
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadLog ? (
                <p className="text-sm text-gray-400 py-6 text-center">Carregando log...</p>
              ) : !(importLog ?? []).length ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-gray-400">Nenhuma importação registrada ainda.</p>
                  <p className="text-xs text-gray-400 mt-1">Execute "Importar Agora" para gerar o primeiro registro.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-gray-500">
                        <th className="pb-2 font-medium">Data/Hora</th>
                        <th className="pb-2 font-medium">Módulo</th>
                        <th className="pb-2 font-medium">Mês Ref.</th>
                        <th className="pb-2 font-medium text-right">Importados</th>
                        <th className="pb-2 font-medium text-right">Erros</th>
                        <th className="pb-2 font-medium">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(importLog ?? []).map((l: any) => (
                        <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-1.5 text-xs text-gray-500">{fmtDate(l.executadoEm)}</td>
                          <td className="py-1.5 font-medium">{MODULO_LABELS[l.origemModulo] ?? l.origemModulo ?? "—"}</td>
                          <td className="py-1.5 text-gray-600">{l.mesReferencia ? fmtMes(l.mesReferencia) : "—"}</td>
                          <td className="py-1.5 text-right">
                            <span className="text-green-700 font-medium">{l.totalImportados ?? 0}</span>
                          </td>
                          <td className="py-1.5 text-right">
                            {(l.totalErros ?? 0) > 0
                              ? <span className="text-red-600 font-medium">{l.totalErros}</span>
                              : <span className="text-gray-400">0</span>}
                          </td>
                          <td className="py-1.5 text-xs text-gray-500 max-w-[200px] truncate">{l.detalhes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, sub, icon, alert }: {
  label: string; value: string; sub: string; icon: ReactNode; alert?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border ${alert ? "border-red-200 bg-red-50/30" : "border-gray-100 bg-gray-50/50"}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className={`text-xs font-medium ${alert ? "text-red-600" : "text-gray-500"}`}>{label}</span>
        {alert && <AlertTriangle className="w-3 h-3 text-red-500 ml-auto" />}
      </div>
      <p className={`text-xl font-bold ${alert ? "text-red-700" : "text-gray-900"}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
