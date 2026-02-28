import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, DollarSign, Users, AlertTriangle, Clock,
  CheckCircle2, Loader2, X, Sun, Palmtree, TrendingUp,
  Building2, ArrowRight, Timer, ShieldAlert, Wallet,
  BarChart3, PieChart, CalendarClock, CalendarCheck, Ban,
  ChevronLeft, ChevronRight, ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBRLShort(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtBRL(v);
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function DashFerias() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [ano, setAno] = useState(new Date().getFullYear());
  const [drillDialog, setDrillDialog] = useState<{ title: string; items: any[] } | null>(null);
  const [ganttEmployeeId, setGanttEmployeeId] = useState<number | null>(null);

  const feriasDoFunc = trpc.avisoPrevio.ferias.feriasDoFuncionario.useQuery(
    { companyId, employeeId: ganttEmployeeId! },
    { enabled: !!ganttEmployeeId && !!companyId }
  );

  const { data, isLoading } = trpc.dashboards.ferias.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
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
      pendente: "Pendentes", agendada: "Agendadas", vencida: "Vencidas",
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
        title = "A Pagar — Pendentes + Agendadas";
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
        "Pendentes": "pendente", "Agendadas": "agendada", "Vencidas": "vencida",
        "Em Gozo": "em_gozo", "Concluídas": "concluida",
      };
      const st = statusMap[info.label] || "";
      items = data.feriasLista.filter((f: any) => st === "vencida" ? (f.status === "vencida" || f.vencida === 1) : f.status === st);
      title = `Férias — ${info.label}`;
    } else if (chartType === "timeline") {
      const mesIdx = info.dataIndex;
      const mesInicio = new Date(ano, mesIdx, 1);
      const mesFim = new Date(ano, mesIdx + 1, 0);
      items = data.feriasLista.filter((f: any) => {
        if (!f.dataInicio || !f.dataFim) return false;
        const di = new Date(f.dataInicio);
        const df = new Date(f.dataFim);
        return di <= mesFim && df >= mesInicio;
      });
      title = `Colaboradores em Férias — ${MESES[mesIdx]} ${ano}`;
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="cursor-pointer" onClick={() => setDrillDialog({ title: "Todas as Férias", items: data.feriasLista })}>
          <DashKpi label="TOTAL" value={kpis.total} color="slate" icon={CalendarDays} />
        </div>
        <div className="cursor-pointer" onClick={() => drillByStatus("pendente")}>
          <DashKpi label="PENDENTES" value={kpis.pendentes} color="amber" icon={Clock} />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                <div className="bg-[#3B82F6] flex items-center justify-center text-[10px] text-white font-bold transition-all"
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
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#3B82F6]" /> Em Gozo</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#F59E0B]" /> Pendente/Agendada</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#EF4444]" /> Vencidas</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos - Linha 1: Timeline + Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DashChart
            title={`Colaboradores em Férias por Mês — ${ano}`}
            type="bar"
            labels={MESES}
            datasets={[
              { label: "Em Férias", data: timelineMensal.map(t => t.emFerias), backgroundColor: CHART_PALETTE[0] },
              { label: "Iniciando", data: timelineMensal.map(t => t.iniciando), backgroundColor: CHART_PALETTE[1] },
              { label: "Finalizando", data: timelineMensal.map(t => t.finalizando), backgroundColor: CHART_PALETTE[2] },
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              { label: "Pendentes", data: feriasObra.map(o => o.pendentes), backgroundColor: "#F59E0B" },
            ]}
            height={280}
            onChartClick={(info) => drillByChart(info, "obra")}
          />
        )}
      </div>

      {/* Gráficos - Linha 4: Períodos + Fracionamento + RH Override */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashChart
          title="1º Período vs 2º+ Período"
          type="doughnut"
          labels={["1º Período", "2º+ Período"]}
          datasets={[{
            data: [periodos.primeiroPeriodo, periodos.segundoPeriodo],
            backgroundColor: [CHART_PALETTE[0], CHART_PALETTE[2]],
          }]}
          height={250}
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
        />
        <Card className="bg-white">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-[#0F172A]">Indicadores Adicionais</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
              <span className="text-xs text-[#64748B]">Abono Pecuniário</span>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">{financeiro.totalAbonoPecuniario}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
              <span className="text-xs text-[#64748B]">Pagamento em Dobro</span>
              <Badge variant={financeiro.pagamentosEmDobro > 0 ? "destructive" : "secondary"} className={financeiro.pagamentosEmDobro === 0 ? "bg-gray-100 text-gray-500" : ""}>{financeiro.pagamentosEmDobro}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
              <span className="text-xs text-[#64748B]">Datas Sugeridas pelo Sistema</span>
              <Badge variant="secondary" className="bg-green-100 text-green-700">{rhOverride.totalSugerido}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
              <span className="text-xs text-[#64748B]">Alteradas pelo RH</span>
              <Badge variant="secondary" className="bg-purple-100 text-purple-700">{rhOverride.totalAlteradoRH}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
              <span className="text-xs text-[#64748B]">Vencem em 30 dias</span>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">{alertas.vencendo30dias}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC]">
              <span className="text-xs text-[#64748B]">Vencem em 60 dias</span>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">{alertas.vencendo60dias}</Badge>
            </div>
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
                    <th className="text-center py-2 text-xs font-medium text-[#64748B]">Pendentes</th>
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

      {/* Drill-down Dialog */}
      <Dialog open={!!drillDialog} onOpenChange={() => setDrillDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palmtree className="w-5 h-5 text-[#10B981]" />
              {drillDialog?.title}
              <Badge variant="secondary" className="ml-2">{drillDialog?.items.length || 0}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Funcionário</th>
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Função</th>
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Setor</th>
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Per. Aquisitivo</th>
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Concessivo Até</th>
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Início</th>
                  <th className="text-left py-2 text-xs font-medium text-[#64748B]">Fim</th>
                  <th className="text-center py-2 text-xs font-medium text-[#64748B]">Dias</th>
                  <th className="text-right py-2 text-xs font-medium text-[#64748B]">Valor</th>
                  <th className="text-center py-2 text-xs font-medium text-[#64748B]">Status</th>
                </tr>
              </thead>
              <tbody>
                {drillDialog?.items.map((f: any) => {
                  const statusColors: Record<string, string> = {
                    pendente: "bg-amber-100 text-amber-700",
                    agendada: "bg-blue-100 text-blue-700",
                    vencida: "bg-red-100 text-red-700",
                    em_gozo: "bg-green-100 text-green-700",
                    concluida: "bg-gray-100 text-gray-700",
                    cancelada: "bg-slate-100 text-slate-500",
                  };
                  const statusLabel: Record<string, string> = {
                    pendente: "Pendente", agendada: "Agendada", vencida: "Vencida",
                    em_gozo: "Em Gozo", concluida: "Concluída", cancelada: "Cancelada",
                  };
                  const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
                  return (
                    <tr key={f.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2">
                        <Link href={`/colaboradores?id=${f.employeeId}`} className="text-[#1e3a5f] hover:underline font-medium text-xs">
                          {f.nomeCompleto}
                        </Link>
                        {f.dataAlteradaPeloRH === 1 && (
                          <Badge variant="secondary" className="ml-1 bg-purple-100 text-purple-700 text-[9px] px-1">RH</Badge>
                        )}
                      </td>
                      <td className="py-2 text-xs text-[#64748B]">{f.funcao}</td>
                      <td className="py-2 text-xs text-[#64748B]">{f.setor}</td>
                      <td className="py-2 text-xs text-[#64748B]">{fmtDate(f.periodoAquisitivoInicio)} — {fmtDate(f.periodoAquisitivoFim)}</td>
                      <td className="py-2 text-xs text-[#64748B]">{fmtDate(f.periodoConcessivoFim)}</td>
                      <td className="py-2 text-xs text-[#64748B]">{fmtDate(f.dataInicio)}</td>
                      <td className="py-2 text-xs text-[#64748B]">{fmtDate(f.dataFim)}</td>
                      <td className="py-2 text-xs text-center">{f.diasGozo || 30}</td>
                      <td className="py-2 text-xs text-right font-medium">{f.valorTotal ? fmtBRL(parseFloat(f.valorTotal)) : "—"}</td>
                      <td className="py-2 text-center">
                        <Badge className={`text-[10px] ${statusColors[f.status] || "bg-gray-100 text-gray-700"}`}>
                          {statusLabel[f.status] || f.status}
                        </Badge>
                        {f.pagamentoEmDobro === 1 && (
                          <Badge variant="destructive" className="ml-1 text-[9px] px-1">2x</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                          <td className="py-2 px-3">{fmtDate(p.fimConcessivo)}</td>
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
    </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
