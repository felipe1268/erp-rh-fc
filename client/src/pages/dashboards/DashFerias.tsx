import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import TabelaComparativaAnual, { type LinhaInd } from "@/components/TabelaComparativaAnual";
import { CheckCircle2 as CheckIcon, AlertTriangle as AlertIcon, DollarSign as DollarIcon } from "lucide-react";

const FERIAS_INDICADORES: LinhaInd[] = [
  { chave: "iniciadas", label: "Férias Iniciadas no mês", icone: Palmtree, cor: "green", lowerIsBetter: false,
    pegar: r => Number(r.iniciadas) || 0, format: v => `${v}`,
    alertaPct: 50, hint: "Concentração em poucos meses pode comprometer obras (sazonalidade).",
    acoes: ["Distribuir férias ao longo do ano para evitar parar obra.", "Conferir aviso prévio de 30 dias (CLT Art. 135).", "Validar pagamento até 2 dias antes do início (Art. 145).", "Comunicar coletivas com 15 dias de antecedência ao MTE."] },
  { chave: "concluidas", label: "Férias Concluídas", icone: CheckIcon, cor: "blue", lowerIsBetter: false,
    pegar: r => Number(r.concluidas) || 0, format: v => `${v}`,
    alertaPct: 50, hint: "Férias finalizadas no mês — funcionário retorna ao trabalho.",
    acoes: ["Confirmar retorno do funcionário no eSocial S-2230.", "Validar reposição na obra durante o gozo."] },
  { chave: "emGozo", label: "Em Gozo (fim do mês)", icone: Sun, cor: "yellow", lowerIsBetter: false,
    pegar: r => Number(r.emGozo) || 0, format: v => `${v}`,
    hint: "Funcionários atualmente em férias — impacta efetivo disponível.",
    acoes: ["Garantir cobertura de função na obra.", "Conferir se há substituto designado para cargos críticos."] },
  { chave: "vencidas", label: "Vencidas (passivo)", icone: AlertIcon, cor: "red", lowerIsBetter: true,
    pegar: r => Number(r.vencidas) || 0, format: v => `${v}`,
    alertaAbsoluto: v => v > 0,
    hint: "CLT obriga gozo dentro de 12 meses do período concessivo. Vencidas viram pagamento em dobro (Art. 137).",
    acoes: ["URGENTE: programar gozo imediato ou pagar em dobro.", "Identificar funcionários e enviar comunicado obrigatório.", "Conferir se há acordo individual válido para fracionar.", "Mapear causa: chefia bloqueando ou funcionário recusando."] },
  { chave: "custoIniciadas", label: "Custo das Férias Iniciadas", icone: DollarIcon, cor: "purple", lowerIsBetter: false,
    pegar: r => Number(r.custoIniciadas) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    alertaPct: 50, hint: "Soma de férias + 1/3 + abono pecuniário das férias iniciadas no mês.",
    acoes: ["Garantir provisão financeira (pagamento até D-2 do gozo).", "Conferir cálculo: salário + médias HE/adicionais + 1/3 constitucional.", "Validar abono pecuniário (até 1/3 dos dias, opcional)."] },
];

import { dataLimiteInicioGozoFerias } from "@/lib/dateUtils";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, DollarSign, Users, AlertTriangle, Clock,
  CheckCircle2, Loader2, X, Sun, Palmtree, TrendingUp,
  Building2, ArrowRight, Timer, ShieldAlert, Wallet,
  BarChart3, PieChart, CalendarClock, CalendarCheck, Ban,
  ChevronLeft, ChevronRight, ArrowLeft, Search, Download
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), sem abreviar.
function fmtBRLShort(v: number) {
  return fmtBRL(v);
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function DashFerias() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const [ano, setAno] = useState(new Date().getFullYear());
  const [drillDialog, setDrillDialog] = useState<{ title: string; items: any[] } | null>(null);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillStatusFilter, setDrillStatusFilter] = useState<string>("todos");
  const [ganttEmployeeId, setGanttEmployeeId] = useState<number | null>(null);

  const feriasDoFunc = trpc.avisoPrevio.ferias.feriasDoFuncionario.useQuery(
    { companyId: queryCompanyId, employeeId: ganttEmployeeId!, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: !!ganttEmployeeId && !!companyId }
  );

  const { data, isLoading } = trpc.dashboards.ferias.useQuery(
    { companyId: queryCompanyId, ano, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const { data: comparativo, isLoading: loadingComp } = trpc.dashboards.feriasComparativo.useQuery(
    { companyId: queryCompanyId, ano, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const anoOptions = useMemo(() => {
    const curr = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => curr - 2 + i);
  }, []);

  // Drill-down helpers
  function drillByStatus(statusFilter: string) {
    if (!data?.feriasLista) return;
    const items = data.feriasLista.filter((f: any) => {
      if (statusFilter === "vencida") return f.status === "vencida" || f.vencida === 1;
      return f.status === statusFilter;
    });
    const labels: Record<string, string> = {
      pendente: "Férias a Vencer", agendada: "Agendadas", vencida: "Vencidas",
      em_gozo: "Em Gozo", concluida: "Concluídas", cancelada: "Canceladas",
    };
    setDrillDialog({ title: `Férias — ${labels[statusFilter] || statusFilter}`, items });
  }

  function drillByFinanceiro(tipo: "provisao" | "a_pagar" | "vencidas" | "concluido") {
    if (!data?.feriasLista) return;
    let items: any[] = [];
    let title = "";
    switch (tipo) {
      case "provisao":
        items = data.feriasLista;
        title = "Provisão Total — Todos os Períodos";
        break;
      case "a_pagar":
        items = data.feriasLista.filter((f: any) => f.status === "pendente" || f.status === "agendada");
        title = "A Pagar — A Vencer + Agendadas";
        break;
      case "vencidas":
        items = data.feriasLista.filter((f: any) => f.status === "vencida" || f.vencida === 1);
        title = "Custo Vencidas";
        break;
      case "concluido":
        items = data.feriasLista.filter((f: any) => f.status === "concluida");
        title = "Já Pago — Concluídos";
        break;
    }
    setDrillDialog({ title, items });
  }

  function drillByChart(info: ChartClickInfo, chartType: string) {
    if (!data?.feriasLista) return;
    let items: any[] = [];
    let title = "";

    if (chartType === "status") {
      const statusMap: Record<string, string> = {
        "Férias a Vencer": "pendente", "Agendadas": "agendada", "Vencidas": "vencida",
        "Em Gozo": "em_gozo", "Concluídas": "concluida",
      };
      const st = statusMap[info.label] || "";
      items = data.feriasLista.filter((f: any) => st === "vencida" ? (f.status === "vencida" || f.vencida === 1) : f.status === st);
      title = `Férias — ${info.label}`;
    } else if (chartType === "timeline") {
      const mesIdx = info.dataIndex;
      const mesInicio = new Date(ano, mesIdx, 1);
      const mesFim = new Date(ano, mesIdx + 1, 0);
      // Rev. 1870/1962: filtro depende da série clicada (datasetIndex 0=Em Gozo, 1=Iniciando, 2=Finalizando, 3=Concluídas)
      // Guard `!dataInicio || !dataFim` aplicado a TODAS as séries para parear com backend (dashboards.ts L2604-2611).
      const dsIdx = info.datasetIndex;
      const baseList = data.feriasLista.filter((f: any) => !!f.dataInicio && !!f.dataFim);
      if (dsIdx === 1) {
        items = baseList.filter((f: any) => { const d = new Date(f.dataInicio); return d >= mesInicio && d <= mesFim; });
        title = `Férias iniciando em ${MESES[mesIdx]} ${ano}`;
      } else if (dsIdx === 2) {
        items = baseList.filter((f: any) => { const d = new Date(f.dataFim); return d >= mesInicio && d <= mesFim; });
        title = `Férias finalizando em ${MESES[mesIdx]} ${ano}`;
      } else if (dsIdx === 3) {
        items = baseList.filter((f: any) => {
          if (f.status !== "concluida") return false;
          const d = new Date(f.dataFim); return d >= mesInicio && d <= mesFim;
        });
        title = `Férias concluídas em ${MESES[mesIdx]} ${ano}`;
      } else {
        items = baseList.filter((f: any) => {
          const di = new Date(f.dataInicio), df = new Date(f.dataFim);
          return di <= mesFim && df >= mesInicio;
        });
        title = `Colaboradores em Gozo — ${MESES[mesIdx]} ${ano}`;
      }
    } else if (chartType === "setorVencidas") {
      const setor = info.label;
      items = data.feriasLista.filter((f: any) => (f.status === "vencida" || f.vencida === 1) && (f.setor || "Não informado") === setor);
      title = `Férias Vencidas — ${setor}`;
    } else if (chartType === "obra") {
      items = data.feriasLista;
      title = `Férias por Obra — ${info.label}`;
    } else if (chartType === "custoSetor") {
      const setor = info.label;
      items = data.feriasLista.filter((f: any) => (f.setor || "Não informado") === setor);
      title = `Custo de Férias — ${setor}`;
    } else if (chartType === "custoMensal") {
      const mesIdx = info.dataIndex;
      items = data.feriasLista.filter((f: any) => {
        const d = f.dataInicio;
        if (!d) return false;
        const dt = new Date(d);
        return dt.getFullYear() === ano && dt.getMonth() === mesIdx;
      });
      title = `Custo Férias — ${MESES[mesIdx]} ${ano}`;
    }

    if (items.length > 0) setDrillDialog({ title, items });
  }

  // Rev. 1611 — Drill-down dos donuts (Períodos / Fracionamento) e linhas
  // de "Indicadores Adicionais". Filtra `data.feriasLista` por critério.
  function drillByPeriodo(tipo: "primeiro" | "segundo") {
    if (!data?.feriasLista) return;
    const items = data.feriasLista.filter((f: any) =>
      tipo === "primeiro" ? (f.numeroPeriodo || 1) === 1 : (f.numeroPeriodo || 1) >= 2
    );
    setDrillDialog({
      title: tipo === "primeiro" ? "1º Período Aquisitivo" : "2º+ Período (Acumulado)",
      items,
    });
  }
  function drillByFracionamento(qtde: 1 | 2 | 3) {
    if (!data?.feriasLista) return;
    const items = data.feriasLista.filter((f: any) => (f.fracionamento || 1) === qtde);
    const titles: Record<number, string> = {
      1: "Férias Integrais (30 dias)",
      2: "Férias em 2 Períodos",
      3: "Férias em 3 Períodos",
    };
    setDrillDialog({ title: titles[qtde], items });
  }
  function drillByIndicador(
    tipo: "abono" | "dobro" | "sugerido" | "alteradoRh" | "vence30" | "vence60"
  ) {
    if (!data?.feriasLista) return;
    // Mesma fórmula do backend (server/routers/dashboards.ts ~2395-2408):
    // `new Date()` sem zerar horas, comparação direta com `periodoConcessivoFim`.
    const hoje = new Date();
    const em30 = new Date(hoje); em30.setDate(em30.getDate() + 30);
    const em60 = new Date(hoje); em60.setDate(em60.getDate() + 60);
    let items: any[] = [];
    let title = "";
    switch (tipo) {
      case "abono":
        items = data.feriasLista.filter((f: any) => f.abonoPecuniario === 1);
        title = "Abono Pecuniário (1/3 Convertido)"; break;
      case "dobro":
        items = data.feriasLista.filter((f: any) => f.pagamentoEmDobro === 1);
        title = "Pagamento em Dobro (CLT Art. 137)"; break;
      case "sugerido":
        items = data.feriasLista.filter((f: any) => !!f.dataSugeridaInicio);
        title = "Datas Sugeridas pelo Sistema"; break;
      case "alteradoRh":
        items = data.feriasLista.filter((f: any) => f.dataAlteradaPeloRh === 1);
        title = "Datas Alteradas pelo RH"; break;
      case "vence30":
      case "vence60": {
        const limite = tipo === "vence30" ? em30 : em60;
        items = data.feriasLista.filter((f: any) => {
          if (f.status !== "pendente" && f.status !== "agendada") return false;
          if (!f.periodoConcessivoFim) return false;
          const fim = new Date(f.periodoConcessivoFim);
          return fim >= hoje && fim <= limite;
        });
        title = tipo === "vence30" ? "Vencem em 30 dias" : "Vencem em 60 dias";
        break;
      }
    }
    setDrillDialog({ title, items });
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e3a5f]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-[#94A3B8]">
          <Palmtree className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum dado de férias encontrado.</p>
        </div>
      </DashboardLayout>
    );
  }

  const { kpis, financeiro, statusDist, timelineMensal, topSetoresVencidas, custoMensalDist,
    feriasObra, setorDist, custoPorSetor, periodos, fracionamento, rhOverride, alertas,
    topFuncionariosVencidos } = data;

  return (
    <DashboardLayout>
    <div className="space-y-6 print:space-y-4" id="dash-ferias">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <Palmtree className="w-7 h-7 text-[#10B981]" />
            Dashboard de Férias
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Visão completa dos períodos aquisitivos, concessivos e financeiro — CLT Art. 129-145
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg px-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAno(a => a - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-[#0F172A] min-w-[50px] text-center">{ano}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAno(a => a + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <PrintActions title={`Dashboard Férias — ${ano}`} />
        </div>
      </div>

      {/* Alertas */}
      {(alertas.vencendo30dias > 0 || kpis.vencidas > 0) && (
        <div className="flex flex-wrap gap-3">
          {kpis.vencidas > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => drillByStatus("vencida")}>
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <span className="text-sm font-medium text-red-700">{kpis.vencidas} férias vencidas — período concessivo expirado</span>
              <ArrowRight className="w-4 h-4 text-red-400" />
            </div>
          )}
          {alertas.vencendo30dias > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium text-amber-700">{alertas.vencendo30dias} férias vencem nos próximos 30 dias</span>
            </div>
          )}
          {alertas.vencendo60dias > alertas.vencendo30dias && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-blue-700">{alertas.vencendo60dias} férias vencem nos próximos 60 dias</span>
            </div>
          )}
        </div>
      )}

      {/* KPIs - Status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="cursor-pointer" onClick={() => setDrillDialog({ title: "Todas as Férias", items: data.feriasLista })}>
          <DashKpi label="TOTAL" value={kpis.total} color="slate" icon={CalendarDays} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("pendente")}>
          <DashKpi label="A VENCER" value={kpis.pendentes} color="amber" icon={Clock} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("agendada")}>
          <DashKpi label="AGENDADAS" value={kpis.agendadas} color="blue" icon={CalendarCheck} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("vencida")}>
          <DashKpi label="VENCIDAS" value={kpis.vencidas} color="red" icon={AlertTriangle} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("em_gozo")}>
          <DashKpi label="EM GOZO" value={kpis.emGozo} color="green" icon={Sun} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("concluida")}>
          <DashKpi label="CONCLUÍDAS" value={kpis.concluidas} color="gray" icon={CheckCircle2} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("cancelada")}>
          <DashKpi label="CANCELADAS" value={kpis.canceladas} color="slate" icon={Ban} />
        </div>
      </div>

      {/* KPIs - Financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-[#5B8DEF] bg-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-blue-300 transition-all" onClick={() => drillByFinanceiro("provisao")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Provisão Total</p>
            <p className="text-xl font-bold text-[#0F172A] mt-1">{fmtBRL(financeiro.custoTotalEstimado)}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{kpis.total} períodos em {ano}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#F59E0B] bg-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-amber-300 transition-all" onClick={() => drillByFinanceiro("a_pagar")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">A Pagar (Pendente + Agendada)</p>
            <p className="text-xl font-bold text-[#F59E0B] mt-1">{fmtBRL(financeiro.custoPendente)}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{kpis.pendentes + kpis.agendadas} períodos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#EF4444] bg-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-red-300 transition-all" onClick={() => drillByFinanceiro("vencidas")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Custo Vencidas</p>
            <p className="text-xl font-bold text-[#EF4444] mt-1">{fmtBRL(financeiro.custoVencidas)}</p>
            <div className="flex items-center gap-2 mt-1">
              {financeiro.pagamentosEmDobro > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{financeiro.pagamentosEmDobro} em dobro</Badge>
              )}
              <span className="text-xs text-[#94A3B8]">{kpis.vencidas} períodos</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#10B981] bg-white cursor-pointer hover:shadow-md hover:ring-2 hover:ring-emerald-300 transition-all" onClick={() => drillByFinanceiro("concluido")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide">Já Pago (Concluído)</p>
            <p className="text-xl font-bold text-[#10B981] mt-1">{fmtBRL(financeiro.custoConcluido)}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{kpis.concluidas} períodos concluídos</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de proporção financeira */}
      {financeiro.custoTotalEstimado > 0 && (
        <Card className="bg-white">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide mb-3">Proporção Financeira</p>
            <div className="flex h-6 rounded-full overflow-hidden bg-[#F1F5F9]">
              {financeiro.custoConcluido > 0 && (
                <div className="bg-[#10B981] flex items-center justify-center text-[10px] text-white font-bold transition-all"
                  style={{ width: `${(financeiro.custoConcluido / financeiro.custoTotalEstimado * 100).toFixed(1)}%` }}
                  title={`Concluído: ${fmtBRL(financeiro.custoConcluido)}`}>
                  {(financeiro.custoConcluido / financeiro.custoTotalEstimado * 100) > 8 ? `${(financeiro.custoConcluido / financeiro.custoTotalEstimado * 100).toFixed(0)}%` : ""}
                </div>
              )}
              {financeiro.custoEmGozo > 0 && (
                <div className="bg-[#5CC5CF] flex items-center justify-center text-[10px] text-white font-bold transition-all"
                  style={{ width: `${(financeiro.custoEmGozo / financeiro.custoTotalEstimado * 100).toFixed(1)}%` }}
                  title={`Em Gozo: ${fmtBRL(financeiro.custoEmGozo)}`}>
                  {(financeiro.custoEmGozo / financeiro.custoTotalEstimado * 100) > 8 ? `${(financeiro.custoEmGozo / financeiro.custoTotalEstimado * 100).toFixed(0)}%` : ""}
                </div>
              )}
              {financeiro.custoPendente > 0 && (
                <div className="bg-[#F59E0B] flex items-center justify-center text-[10px] text-white font-bold transition-all"
                  style={{ width: `${(financeiro.custoPendente / financeiro.custoTotalEstimado * 100).toFixed(1)}%` }}
                  title={`Pendente: ${fmtBRL(financeiro.custoPendente)}`}>
                  {(financeiro.custoPendente / financeiro.custoTotalEstimado * 100) > 8 ? `${(financeiro.custoPendente / financeiro.custoTotalEstimado * 100).toFixed(0)}%` : ""}
                </div>
              )}
              {financeiro.custoVencidas > 0 && (
                <div className="bg-[#EF4444] flex items-center justify-center text-[10px] text-white font-bold transition-all"
                  style={{ width: `${(financeiro.custoVencidas / financeiro.custoTotalEstimado * 100).toFixed(1)}%` }}
                  title={`Vencidas: ${fmtBRL(financeiro.custoVencidas)}`}>
                  {(financeiro.custoVencidas / financeiro.custoTotalEstimado * 100) > 8 ? `${(financeiro.custoVencidas / financeiro.custoTotalEstimado * 100).toFixed(0)}%` : ""}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#10B981]" /> Concluído</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#5CC5CF]" /> Em Gozo</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#F59E0B]" /> Pendente/Agendada</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#EF4444]" /> Vencidas</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos - Linha 1: Timeline + Status Donut */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <DashChart
            title={`Colaboradores em Férias por Mês — ${ano}`}
            type="bar"
            labels={MESES}
            datasets={[
              // Rev. 1961/1962 — Paleta padrão "Regra de Ouro" do dashboard de Férias:
              //   Em Gozo = turquesa #5CC5CF | Iniciando = lavanda #A78BDB | Finalizando = pêssego CHART_PALETTE[2] | Concluídas = verde #10B981
              //   (renomeado "Em Férias" → "Em Gozo" pra unificar terminologia com donut + barra Proporção Financeira).
              { label: "Em Gozo", data: timelineMensal.map(t => t.emFerias), backgroundColor: "#5CC5CF" },
              { label: "Iniciando", data: timelineMensal.map(t => t.iniciando), backgroundColor: "#A78BDB" },
              { label: "Finalizando", data: timelineMensal.map(t => t.finalizando), backgroundColor: CHART_PALETTE[2] },
              { label: "Concluídas", data: timelineMensal.map(t => (t as any).concluidas ?? 0), backgroundColor: "#10B981" },
            ]}
            height={300}
            onChartClick={(info) => drillByChart(info, "timeline")}
          />
        </div>
        <DashChart
          title="Distribuição por Status"
          type="doughnut"
          labels={statusDist.map(s => s.label)}
          datasets={[{ data: statusDist.map(s => s.value), backgroundColor: statusDist.map(s => s.color) }]}
          height={300}
          onChartClick={(info) => drillByChart(info, "status")}
        />
      </div>

      {/* Gráficos - Linha 2: Custo Mensal + Custo por Setor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashChart
          title={`Custo Mensal Projetado — ${ano}`}
          type="bar"
          labels={MESES}
          datasets={[{
            label: "Custo (R$)",
            data: custoMensalDist.map(c => c.valor),
            backgroundColor: CHART_PALETTE[0],
          }]}
          height={280}
          valueFormatter={fmtBRLShort}
          onChartClick={(info) => drillByChart(info, "custoMensal")}
        />
        <DashChart
          title="Custo por Setor"
          type="bar"
          labels={custoPorSetor.map(c => c.setor)}
          datasets={[{
            label: "Custo (R$)",
            data: custoPorSetor.map(c => c.valor),
            backgroundColor: CHART_PALETTE.slice(0, custoPorSetor.length),
          }]}
          height={280}
          valueFormatter={fmtBRLShort}
          onChartClick={(info) => drillByChart(info, "custoSetor")}
        />
      </div>

      {/* Gráficos - Linha 3: Setores Vencidas + Férias por Obra */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topSetoresVencidas.length > 0 && (
          <DashChart
            title="Setores com Mais Férias Vencidas"
            type="bar"
            labels={topSetoresVencidas.map(s => s.setor)}
            datasets={[{
              label: "Vencidas",
              data: topSetoresVencidas.map(s => s.count),
              backgroundColor: "#EF4444",
            }]}
            height={280}
            onChartClick={(info) => drillByChart(info, "setorVencidas")}
          />
        )}
        {feriasObra.length > 0 && (
          <DashChart
            title="Férias por Obra"
            type="bar"
            labels={feriasObra.map(o => o.obra)}
            datasets={[
              { label: "Total", data: feriasObra.map(o => o.total), backgroundColor: CHART_PALETTE[0] },
              { label: "Vencidas", data: feriasObra.map(o => o.vencidas), backgroundColor: "#EF4444" },
              { label: "A Vencer", data: feriasObra.map(o => o.pendentes), backgroundColor: "#F59E0B" },
            ]}
            height={280}
            onChartClick={(info) => drillByChart(info, "obra")}
          />
        )}
      </div>

      {/* Gráficos - Linha 4: Períodos + Fracionamento + RH Override */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <DashChart
          title="1º Período vs 2º+ Período"
          type="doughnut"
          labels={["1º Período", "2º+ Período"]}
          datasets={[{
            data: [periodos.primeiroPeriodo, periodos.segundoPeriodo],
            backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2]],
          }]}
          height={250}
          onChartClick={(info) => drillByPeriodo(info.dataIndex === 0 ? "primeiro" : "segundo")}
        />
        <DashChart
          title="Fracionamento de Férias"
          type="doughnut"
          labels={["Integral (30d)", "2 Períodos", "3 Períodos"]}
          datasets={[{
            data: [fracionamento.periodo1, fracionamento.periodo2, fracionamento.periodo3],
            backgroundColor: [CHART_PALETTE[1], CHART_PALETTE[3], CHART_PALETTE[4]],
          }]}
          height={250}
          onChartClick={(info) => drillByFracionamento((info.dataIndex + 1) as 1 | 2 | 3)}
        />
        <Card className="bg-white">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-[#0F172A]">Indicadores Adicionais</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {/* Rev. 1611 — Cada linha agora é clicável e abre a tabela
                com a lista de funcionários daquela métrica. */}
            {([
              { key: "abono", label: "Abono Pecuniário", value: financeiro.totalAbonoPecuniario, badge: "bg-blue-100 text-blue-700", hoverRing: "hover:ring-blue-300" },
              { key: "dobro", label: "Pagamento em Dobro", value: financeiro.pagamentosEmDobro, badge: financeiro.pagamentosEmDobro > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500", hoverRing: "hover:ring-red-300" },
              { key: "sugerido", label: "Datas Sugeridas pelo Sistema", value: rhOverride.totalSugerido, badge: "bg-green-100 text-green-700", hoverRing: "hover:ring-green-300" },
              { key: "alteradoRh", label: "Alteradas pelo RH", value: rhOverride.totalAlteradoRH, badge: "bg-purple-100 text-purple-700", hoverRing: "hover:ring-purple-300" },
              { key: "vence30", label: "Vencem em 30 dias", value: alertas.vencendo30dias, badge: "bg-amber-100 text-amber-700", hoverRing: "hover:ring-amber-300" },
              { key: "vence60", label: "Vencem em 60 dias", value: alertas.vencendo60dias, badge: "bg-blue-100 text-blue-700", hoverRing: "hover:ring-blue-300" },
            ] as const).map(row => {
              const disabled = !row.value;
              return (
                <button
                  key={row.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => drillByIndicador(row.key as any)}
                  title={disabled ? "Sem registros nesta métrica" : "Clique para ver os funcionários"}
                  className={`w-full flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] text-left transition-all ${disabled ? "opacity-60 cursor-not-allowed" : `cursor-pointer hover:bg-white hover:shadow-sm hover:ring-1 ${row.hoverRing}`}`}
                >
                  <span className="text-xs text-[#64748B] flex items-center gap-1.5">
                    {row.label}
                    {!disabled && <ArrowRight className="w-3 h-3 text-[#CBD5E1]" />}
                  </span>
                  <Badge variant="secondary" className={row.badge}>{row.value}</Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Top Funcionários com Férias Vencidas */}
      {topFuncionariosVencidos.length > 0 && (
        <Card className="bg-white">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Funcionários com Mais Férias Vencidas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0]">
                    <th className="text-left py-2 text-xs font-medium text-[#64748B]">Funcionário</th>
                    <th className="text-left py-2 text-xs font-medium text-[#64748B]">Função</th>
                    <th className="text-left py-2 text-xs font-medium text-[#64748B]">Setor</th>
                    <th className="text-center py-2 text-xs font-medium text-[#64748B]">Períodos Vencidos</th>
                  </tr>
                </thead>
                <tbody>
                  {topFuncionariosVencidos.map((f: any, i: number) => (
                    <tr key={f.employeeId} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2">
                        <button
                          onClick={() => setGanttEmployeeId(f.employeeId)}
                          className="text-[#1e3a5f] hover:underline font-medium cursor-pointer bg-transparent border-none p-0 text-left"
                        >
                          {f.nome}
                        </button>
                      </td>
                      <td className="py-2 text-[#64748B]">{f.funcao}</td>
                      <td className="py-2 text-[#64748B]">{f.setor}</td>
                      <td className="py-2 text-center">
                        <Badge variant="destructive">{f.count}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Férias por Setor (tabela) */}
      {setorDist.length > 0 && (
        <Card className="bg-white">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#5B8DEF]" />
              Resumo por Setor
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0]">
                    <th className="text-left py-2 text-xs font-medium text-[#64748B]">Setor</th>
                    <th className="text-center py-2 text-xs font-medium text-[#64748B]">Total</th>
                    <th className="text-center py-2 text-xs font-medium text-[#64748B]">Vencidas</th>
                    <th className="text-center py-2 text-xs font-medium text-[#64748B]">A Vencer</th>
                  </tr>
                </thead>
                <tbody>
                  {setorDist.map((s: any) => (
                    <tr key={s.setor} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2 font-medium text-[#0F172A]">{s.setor}</td>
                      <td className="py-2 text-center">{s.total}</td>
                      <td className="py-2 text-center">
                        {s.vencidas > 0 ? <Badge variant="destructive" className="text-[10px]">{s.vencidas}</Badge> : <span className="text-[#94A3B8]">0</span>}
                      </td>
                      <td className="py-2 text-center">
                        {s.pendentes > 0 ? <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px]">{s.pendentes}</Badge> : <span className="text-[#94A3B8]">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rev. 1612 — Drill-down Dialog: full-screen, layout moderno,
           busca, filtro de status, KPIs no topo, export CSV, sem cortes. */}
      <Dialog open={!!drillDialog} onOpenChange={(open) => { if (!open) { setDrillDialog(null); setDrillSearch(""); setDrillStatusFilter("todos"); } }}>
        <DialogContent resizable={false} className="w-screen sm:w-[98vw] sm:max-w-[1600px] h-[100dvh] sm:h-[95vh] max-h-[100dvh] sm:max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none sm:rounded-lg">
          {(() => {
            const fmtDate = (d: string | null | undefined) => {
              if (!d) return "—";
              const s = String(d).slice(0, 10);
              return s.includes("-") ? s.split("-").reverse().join("/") : s;
            };
            const statusColors: Record<string, string> = {
              pendente: "bg-amber-100 text-amber-700 border-amber-200",
              agendada: "bg-blue-100 text-blue-700 border-blue-200",
              vencida: "bg-red-100 text-red-700 border-red-200",
              em_gozo: "bg-green-100 text-green-700 border-green-200",
              concluida: "bg-gray-100 text-gray-700 border-gray-200",
              cancelada: "bg-slate-100 text-slate-500 border-slate-200",
            };
            const statusLabel: Record<string, string> = {
              pendente: "Pendente", agendada: "Agendada", vencida: "Vencida",
              em_gozo: "Em Gozo", concluida: "Concluída", cancelada: "Cancelada",
            };
            const items = drillDialog?.items || [];
            // Distribuição de status p/ chips de filtro
            const statusCounts = items.reduce((acc: Record<string, number>, f: any) => {
              const s = f.status || "—"; acc[s] = (acc[s] || 0) + 1; return acc;
            }, {});
            const totalValor = items.reduce((s: number, f: any) => s + (parseFloat(f.valorTotal || "0") || 0), 0);
            const totalEmDobro = items.filter((f: any) => f.pagamentoEmDobro === 1).length;
            const totalAbono = items.filter((f: any) => f.abonoPecuniario === 1).length;
            // Filtro local
            const q = drillSearch.trim().toLowerCase();
            const filtered = items.filter((f: any) => {
              if (drillStatusFilter !== "todos" && f.status !== drillStatusFilter) return false;
              if (!q) return true;
              return [f.nomeCompleto, f.funcao, f.setor].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q));
            });
            const exportCsv = () => {
              const header = ["Funcionário", "Função", "Setor", "Per. Aquisitivo Início", "Per. Aquisitivo Fim", "Limite p/ iniciar gozo", "Início Gozo", "Fim Gozo", "Dias", "Valor", "Status", "Pag. Dobro", "Abono Pec.", "Alterado RH"];
              const rows = filtered.map((f: any) => [
                f.nomeCompleto || "", f.funcao || "", f.setor || "",
                fmtDate(f.periodoAquisitivoInicio), fmtDate(f.periodoAquisitivoFim),
                fmtDate(dataLimiteInicioGozoFerias(f.periodoConcessivoFim) as any),
                fmtDate(f.dataInicio), fmtDate(f.dataFim),
                String(f.diasGozo || 30),
                f.valorTotal ? parseFloat(f.valorTotal).toFixed(2).replace(".", ",") : "",
                statusLabel[f.status] || f.status || "",
                f.pagamentoEmDobro === 1 ? "Sim" : "",
                f.abonoPecuniario === 1 ? "Sim" : "",
                f.dataAlteradaPeloRh === 1 ? "Sim" : "",
              ]);
              const csv = [header, ...rows].map(r => r.map((c: any) => {
                const s = String(c ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              }).join(";")).join("\n");
              const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `ferias-${(drillDialog?.title || "drill").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}-${ano}.csv`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            };
            return (
              <>
                {/* Header sticky */}
                <DialogHeader className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-emerald-50/60 via-white to-white shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl text-[#0F172A]">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                          <Palmtree className="w-5 h-5" />
                        </span>
                        <span className="truncate">{drillDialog?.title}</span>
                        <Badge variant="secondary" className="ml-1 bg-[#0F172A] text-white shrink-0">{items.length}</Badge>
                      </DialogTitle>
                      <p className="text-xs text-[#64748B] mt-1 ml-11">Lista detalhada de funcionários — ano de referência {ano}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={exportCsv} className="shrink-0 gap-1.5" disabled={!filtered.length}>
                      <Download className="w-4 h-4" /> CSV
                    </Button>
                  </div>

                  {/* Linha de KPIs do recorte */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-11">
                    <div className="px-2.5 py-1 rounded-md bg-white border border-[#E2E8F0] text-xs">
                      <span className="text-[#64748B]">Valor total: </span>
                      <span className="font-semibold text-[#0F172A]">{fmtBRL(totalValor)}</span>
                    </div>
                    {totalEmDobro > 0 && (
                      <div className="px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                        <span className="font-medium">{totalEmDobro}</span> em dobro
                      </div>
                    )}
                    {totalAbono > 0 && (
                      <div className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700">
                        <span className="font-medium">{totalAbono}</span> com abono
                      </div>
                    )}
                  </div>

                  {/* Busca + chips de status */}
                  <div className="flex flex-col sm:flex-row gap-2 mt-3 ml-11">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                      <Input
                        placeholder="Buscar por nome, função ou setor…"
                        value={drillSearch}
                        onChange={(e) => setDrillSearch(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDrillStatusFilter("todos")}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${drillStatusFilter === "todos" ? "bg-[#0F172A] text-white border-[#0F172A]" : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
                      >Todos · {items.length}</button>
                      {Object.entries(statusCounts).filter(([s]) => s !== "—").map(([s, n]) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setDrillStatusFilter(s)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${drillStatusFilter === s ? statusColors[s] + " font-medium" : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
                        >{statusLabel[s] || s} · {n as number}</button>
                      ))}
                    </div>
                  </div>
                </DialogHeader>

                {/* Tabela com scroll interno e header sticky */}
                <div className="flex-1 min-h-0 overflow-auto">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[#94A3B8] py-16">
                      <Palmtree className="w-12 h-12 opacity-40 mb-2" />
                      <p className="text-sm">Nenhum registro corresponde aos filtros.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead className="sticky top-0 z-10 bg-[#F8FAFC]/95 backdrop-blur">
                        <tr>
                          <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0]">Funcionário</th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Função</th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Setor</th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Per. Aquisitivo</th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">Limite Gozo</th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Início</th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Fim</th>
                          <th className="text-center py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Dias</th>
                          <th className="text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Valor</th>
                          <th className="text-center py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] border-b border-[#E2E8F0] whitespace-nowrap">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((f: any, idx: number) => (
                          <tr key={f.id} className={`group border-b border-[#F1F5F9] hover:bg-emerald-50/40 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]"}`}>
                            <td className="py-2.5 px-4 align-top">
                              <div className="flex items-start gap-2">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] text-[10px] font-bold shrink-0 mt-0.5">
                                  {(f.nomeCompleto || "?").trim().split(/\s+/).slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <Link href={`/colaboradores?id=${f.employeeId}`} className="text-[#0F172A] hover:text-[#1e3a5f] hover:underline font-medium text-sm leading-tight block">
                                    {f.nomeCompleto}
                                  </Link>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    {f.dataAlteradaPeloRh === 1 && (
                                      <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0 font-medium">RH</Badge>
                                    )}
                                    {f.abonoPecuniario === 1 && (
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0 font-medium">Abono</Badge>
                                    )}
                                    {(() => {
                                      // Rev. 1966 — Badge só faz sentido em Vencidas (passivo Art. 137 CLT)
                                      // e, mesmo lá, só importa a distinção 1º vs 2º+ (regra da dobra). O
                                      // número exato do período (9º, 13º) é detalhe operacional e vive no
                                      // raio-x do colaborador. Demais drills (Finalizando/Iniciando/Concluídas/
                                      // Em Gozo/financeiros) não exibem badge — evita ruído visual.
                                      const isVencidasDrill = (drillDialog?.title || "").toLowerCase().includes("vencidas");
                                      if (!isVencidasDrill) return null;
                                      const np = f.numeroPeriodo || 1;
                                      const isPrimeiro = np <= 1;
                                      const cls = isPrimeiro ? "bg-slate-100 text-slate-600" : "bg-red-100 text-red-700";
                                      const label = isPrimeiro ? "1º período" : "2º+ período";
                                      const title = isPrimeiro
                                        ? "1º período aquisitivo — passivo simples (1 férias vencida)"
                                        : "2º+ período aquisitivo — passivo de pagamento em dobro (Art. 137 CLT)";
                                      return (
                                        <Badge variant="secondary" className={`${cls} text-[9px] px-1.5 py-0 font-medium`} title={title}>{label}</Badge>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[#475569] align-top whitespace-nowrap">{f.funcao || "—"}</td>
                            <td className="py-2.5 px-3 text-xs text-[#475569] align-top whitespace-nowrap">{f.setor || "—"}</td>
                            <td className="py-2.5 px-3 text-xs text-[#475569] align-top whitespace-nowrap font-mono">
                              {fmtDate(f.periodoAquisitivoInicio)}<span className="text-[#CBD5E1] mx-1">→</span>{fmtDate(f.periodoAquisitivoFim)}
                            </td>
                            <td className="py-2.5 px-3 text-xs align-top whitespace-nowrap font-mono" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">
                              {(() => {
                                const limite = dataLimiteInicioGozoFerias(f.periodoConcessivoFim) as any;
                                const isVencida = f.status === "vencida" || f.vencida === 1;
                                return <span className={isVencida ? "text-red-600 font-medium" : "text-[#475569]"}>{fmtDate(limite)}</span>;
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[#475569] align-top whitespace-nowrap font-mono">{fmtDate(f.dataInicio)}</td>
                            <td className="py-2.5 px-3 text-xs text-[#475569] align-top whitespace-nowrap font-mono">{fmtDate(f.dataFim)}</td>
                            <td className="py-2.5 px-3 text-xs text-center text-[#0F172A] font-semibold align-top">{f.diasGozo || 30}</td>
                            <td className="py-2.5 px-3 text-xs text-right font-semibold text-[#0F172A] align-top whitespace-nowrap">{f.valorTotal ? fmtBRL(parseFloat(f.valorTotal)) : "—"}</td>
                            <td className="py-2.5 px-4 text-center align-top whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <Badge className={`text-[10px] border ${statusColors[f.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                  {statusLabel[f.status] || f.status}
                                </Badge>
                                {f.pagamentoEmDobro === 1 && (
                                  <Badge variant="destructive" className="text-[9px] px-1.5">2x</Badge>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Footer com contagem */}
                <div className="px-5 sm:px-6 py-2.5 border-t border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B] flex items-center justify-between shrink-0">
                  <span>Exibindo <span className="font-semibold text-[#0F172A]">{filtered.length}</span> de <span className="font-semibold text-[#0F172A]">{items.length}</span> registros</span>
                  <span className="hidden sm:inline">Clique no nome para abrir a ficha do colaborador</span>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog de Férias do Funcionário */}
      <Dialog open={!!ganttEmployeeId} onOpenChange={() => setGanttEmployeeId(null)}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palmtree className="w-5 h-5 text-[#10B981]" />
              Férias do Funcionário
            </DialogTitle>
          </DialogHeader>
          {feriasDoFunc.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : feriasDoFunc.data ? (() => {
            const allPeriodos = [
              ...feriasDoFunc.data.periodosRegistrados.map((p: any) => ({ ...p, source: 'db' })),
              ...feriasDoFunc.data.periodosNaoRegistrados.map((p: any) => ({ ...p, source: 'calc' })),
            ];
            const { resumo } = feriasDoFunc.data;
            return (
            <div className="space-y-4">
              {/* Info do Funcionário */}
              <div className="bg-muted/30 rounded-lg p-4">
                <h3 className="font-bold text-lg">{feriasDoFunc.data.funcionario.nome}</h3>
                <p className="text-sm text-muted-foreground">
                  {feriasDoFunc.data.funcionario.cargo || '-'} | CPF: {feriasDoFunc.data.funcionario.cpf || '-'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Admissão: {feriasDoFunc.data.funcionario.dataAdmissao ? new Date(feriasDoFunc.data.funcionario.dataAdmissao + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                  {feriasDoFunc.data.funcionario.salarioBase && ` | Salário: R$ ${feriasDoFunc.data.funcionario.salarioBase}`}
                </p>
              </div>

              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{resumo.totalPeriodos}</p>
                  <p className="text-xs text-blue-600">Total Períodos</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{resumo.totalVencidas}</p>
                  <p className="text-xs text-red-600">Vencidas</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {fmtBRL(typeof resumo.valorTotalEstimado === 'number' ? resumo.valorTotalEstimado : parseFloat(String(resumo.valorTotalEstimado || '0')))}
                  </p>
                  <p className="text-xs text-green-600">Valor Total</p>
                </div>
              </div>

              {/* Tabela de Períodos */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">#</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Período Aquisitivo</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Concessivo Até</th>
                      <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Valor</th>
                      <th className="py-2 px-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPeriodos.map((p: any, i: number) => {
                      const statusColors: Record<string, string> = {
                        prevista: 'bg-blue-100 text-blue-700',
                        vencida: 'bg-red-100 text-red-700',
                        agendada: 'bg-amber-100 text-amber-700',
                        em_gozo: 'bg-green-100 text-green-700',
                        concluida: 'bg-gray-100 text-gray-700',
                      };
                      const statusLabel: Record<string, string> = {
                        prevista: 'Prevista', vencida: 'Vencida', agendada: 'Agendada',
                        em_gozo: 'Em Gozo', concluida: 'Concluída',
                      };
                      const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                      const st = p.vencida ? 'vencida' : (p.status || 'prevista');
                      return (
                        <tr key={i} className={`border-b hover:bg-muted/20 ${p.vencida ? 'bg-red-50/50' : ''}`}>
                          <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 px-3">{fmtDate(p.inicio)} a {fmtDate(p.fim)}</td>
                          <td className="py-2 px-3" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">{fmtDate(dataLimiteInicioGozoFerias(p.fimConcessivo))}</td>
                          <td className="py-2 px-3 text-right font-semibold">{fmtBRL(parseFloat(p.valorEstimado || '0'))}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge className={`text-[10px] ${statusColors[st] || 'bg-gray-100 text-gray-700'}`}>
                              {statusLabel[st] || st}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="text-center">
                <Link href={`/ferias`}>
                  <Button variant="outline" size="sm">
                    <ArrowRight className="h-4 w-4 mr-1" /> Ir para Gestão de Férias
                  </Button>
                </Link>
              </div>
            </div>
            );
          })() : (
            <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado.</p>
          )}
        </DialogContent>
      </Dialog>

      <TabelaComparativaAnual
        meses={comparativo?.meses || []}
        indicadores={FERIAS_INDICADORES}
        isLoading={loadingComp}
        titulo={`Tendência mês-a-mês — ${ano}`}
        subtitulo="Janeiro até o mês corrente · clique em qualquer linha para análise aprofundada"
      />
    </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
