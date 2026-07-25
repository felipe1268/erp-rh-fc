import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, ChartClickInfo } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Handshake, Store, Receipt, CreditCard, CheckCircle, Clock, XCircle,
  DollarSign, Users, TrendingUp, Loader2, ArrowLeft, Filter, Wallet,
  Timer, BarChart3, Download, ArrowUp, ArrowDown, Minus, Eye,
  ChevronLeft, ChevronRight, ShoppingCart, FileText,
} from "lucide-react";
import { Link } from "wouter";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Versão "short" mantida apenas para eixos de gráfico (onde o espaço é apertado).
// KPIs, tabelas e drill-downs usam o valor completo em R$ por preferência do usuário.
const fmtBRLShort = (v: number) => fmtBRL(v);
// Rev. 3067 — padronização: SEMPRE valor completo em BRL (R$ X.XXX,XX), sem abreviar.
const fmtBRLAxis = (v: number) => fmtBRL(v);
const fmtDateBR = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = String(s).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return d.split("-").reverse().join("/");
};

const MESES_LBL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const STATUS_LANC: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-700 border-amber-300" },
  aprovado: { label: "Aprovado", className: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  rejeitado: { label: "Rejeitado", className: "bg-red-100 text-red-700 border-red-300" },
};

const TIPO_LBL: Record<string, string> = {
  farmacia: "Farmácia",
  posto_combustivel: "Posto",
  restaurante: "Restaurante",
  mercado: "Mercado",
  outros: "Outros",
};

export default function DashParceiros() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;

  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState<string>("todos");
  const [parceiroId, setParceiroId] = useState<string>("todos");
  const [tipoConvenio, setTipoConvenio] = useState<string>("todos");
  const [drillDialog, setDrillDialog] = useState<{ title: string; items: any[] } | null>(null);
  const [detalheLanc, setDetalheLanc] = useState<any | null>(null);

  const { data, isLoading } = trpc.dashboards.parceiros.useQuery(
    {
      companyId: queryCompanyId,
      ano,
      mes: mes !== "todos" ? Number(mes) : undefined,
      parceiroId: parceiroId !== "todos" ? Number(parceiroId) : undefined,
      tipoConvenio: tipoConvenio !== "todos" ? tipoConvenio : undefined,
      ...(isConstrutoras ? { companyIds } : {}),
    },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  const anoOptions = useMemo(() => {
    const curr = new Date().getFullYear();
    const fromData = data?.filtros?.anosDisponiveis ?? [];
    const merged = new Set<number>([curr - 1, curr, curr + 1, ...fromData]);
    return [...merged].sort((a, b) => b - a);
  }, [data]);

  const drillByStatus = (status: string) => {
    if (!data?.detalhes) return;
    const items = data.detalhes.filter((d: any) => d.status === status);
    setDrillDialog({ title: `Lançamentos — ${STATUS_LANC[status]?.label || status}`, items });
  };

  const drillByParceiro = (info: ChartClickInfo) => {
    if (!data?.rankingParceiros || !data?.detalhes) return;
    const p = data.rankingParceiros[info.dataIndex];
    if (!p) return;
    const items = data.detalhes.filter((d: any) => d.parceiroNome === p.nome);
    setDrillDialog({ title: `Lançamentos — ${p.nome}`, items });
  };

  const drillByMesIdx = (mIdx: number) => {
    if (!data?.detalhes) return;
    const items = data.detalhes.filter((d: any) => Number(String(d.dataCompra).slice(5, 7)) === mIdx + 1);
    setDrillDialog({ title: `Lançamentos — ${MESES_FULL[mIdx]}/${ano}`, items });
  };

  const drillByMes = (info: ChartClickInfo) => drillByMesIdx(info.dataIndex);

  const drillByColaborador = (employeeId: number | null | undefined, nome: string) => {
    if (!data?.detalhes) return;
    const items = data.detalhes.filter((d: any) =>
      employeeId != null ? d.employeeId === employeeId : d.employeeNome === nome
    );
    setDrillDialog({ title: `Lançamentos — ${nome}`, items });
  };

  // Comparativo Mês a Mês — padrão Folha de Pagamento (Δ vs mês anterior)
  const comparativoMensal = useMemo(() => {
    if (!data?.evolucaoMensal) return [] as any[];
    const ev = data.evolucaoMensal as any[];
    const pag = (data.pagamentosPorMes as any[]) || [];
    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / Math.abs(b)) * 100);
    return ev.map((cur, i) => {
      const prev = i > 0 ? ev[i - 1] : null;
      const pgCur = pag[i] || { valorPago: 0, valorAPagar: 0 };
      const pgPrev = i > 0 ? (pag[i - 1] || { valorPago: 0, valorAPagar: 0 }) : null;
      const fields = ["lancamentos", "valor", "aprovados", "pendentes", "rejeitados", "valorAprovado", "valorPago", "valorAPagar"] as const;
      const allCur: any = { ...cur, valorPago: pgCur.valorPago, valorAPagar: pgCur.valorAPagar };
      const allPrev: any = prev ? { ...prev, valorPago: pgPrev?.valorPago ?? 0, valorAPagar: pgPrev?.valorAPagar ?? 0 } : null;
      const deltas: Record<string, { abs: number; pct: number } | null> = {};
      for (const f of fields) {
        if (!allPrev) { deltas[f] = null; continue; }
        const a = Number(allCur[f] || 0), b = Number(allPrev[f] || 0);
        deltas[f] = { abs: a - b, pct: pct(a, b) };
      }
      return {
        mIdx: i,
        label: `${MESES_LBL[i]}/${String(ano).slice(2)}`,
        ...allCur,
        deltas,
      };
    });
  }, [data, ano]);

  if (isLoading || !data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      </DashboardLayout>
    );
  }

  const { resumo } = data;

  return (
    <DashboardLayout>
      <div className="w-full mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-5 print:py-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Link href="/dashboards">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Dashboards
              </Button>
            </Link>
            <div className="h-10 w-10 rounded-xl bg-purple-500 flex items-center justify-center">
              <Handshake className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard Parceiros</h1>
              <p className="text-sm text-muted-foreground">
                Gestão integrada — Lançamentos, Aprovações, Guia de Descontos e Pagamentos
              </p>
            </div>
          </div>
          <PrintActions title={`Dashboard Parceiros — ${ano}`} />
        </div>

        {/* Seletor visual de Ano + Mês (estilo cartão com pílulas) */}
        <Card className="print:hidden">
          <CardContent className="p-4 sm:p-5">
            {/* Linha 1: navegação de ano + legenda */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  onClick={() => setAno(ano - 1)}
                  aria-label="Ano anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
                  {ano.toLocaleString("pt-BR")}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  onClick={() => setAno(ano + 1)}
                  aria-label="Próximo ano"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
                {/* Rev. 4569 — botão Ano todo (padrão PeriodSelectorCard) */}
                <button
                  type="button"
                  onClick={() => setMes("todos")}
                  className={`ml-1 h-8 px-3 rounded-full text-xs sm:text-sm font-medium transition-all ${
                    mes === "todos"
                      ? "bg-foreground text-background font-bold"
                      : "bg-gray-100 text-gray-700 hover:opacity-80"
                  }`}
                >
                  Ano todo
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs sm:text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Com lançamento
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Consolidado
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-300" /> Sem dados
                </span>
              </div>
            </div>

            {/* Linha 2: pílulas dos 12 meses */}
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2 mt-4">
              {MESES_LBL.map((lbl, i) => {
                const evRow: any = (data.evolucaoMensal as any[])?.[i] || {};
                const lanc = Number(evRow.lancamentos || 0);
                const pend = Number(evRow.pendentes || 0);
                const rej  = Number(evRow.rejeitados || 0);
                let dot = "bg-gray-200 text-gray-700";
                if (lanc > 0 && pend === 0 && rej === 0) dot = "bg-green-100 text-green-800";
                else if (lanc > 0) dot = "bg-blue-100 text-blue-800";
                const mNum = String(i + 1);
                const isSelected = mes === mNum;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMes(isSelected ? "todos" : mNum)}
                    className={`h-9 rounded-full text-sm font-medium transition-all ${dot} ${
                      isSelected ? "ring-2 ring-foreground ring-offset-1 font-bold" : "hover:opacity-80"
                    }`}
                    title={lanc === 0 ? "Sem dados" : `${lanc} lançamento(s)${pend || rej ? " — pendências em aberto" : " — consolidado"}`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Filtros adicionais (Tipo + Parceiro) */}
        <Card className="print:hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" /> Filtros:
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de Convênio</label>
                <Select value={tipoConvenio} onValueChange={setTipoConvenio}>
                  <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {(data.filtros.tipos as any[]).map(t => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Parceiro</label>
                <Select value={parceiroId} onValueChange={setParceiroId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os parceiros</SelectItem>
                    {(data.filtros.parceiros as any[]).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(mes !== "todos" || parceiroId !== "todos" || tipoConvenio !== "todos") && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => { setMes("todos"); setParceiroId("todos"); setTipoConvenio("todos"); }}
                >Limpar</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPIs principais */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <DashKpi label="Parceiros Ativos" value={resumo.parceirosAtivos} sub={`${resumo.parceirosCadastrados} cadastrados`} icon={Store} color="purple" />
          <DashKpi label="Lançamentos" value={resumo.totalLancamentos} sub={`${resumo.colaboradoresUtilizando} colaboradores`} icon={Receipt} color="blue" />
          <DashKpi label="Valor Total" value={fmtBRLShort(resumo.valorTotal)} sub={`${ano}${mes !== "todos" ? "/" + String(mes).padStart(2, "0") : ""}`} icon={DollarSign} color="indigo" />
          <DashKpi label="Pendentes" value={resumo.pendentes} sub={fmtBRLShort(resumo.valorPendente)} icon={Clock} color="yellow" onClick={() => drillByStatus("pendente")} />
          <DashKpi label="Aprovados" value={resumo.aprovados} sub={fmtBRLShort(resumo.valorAprovado)} icon={CheckCircle} color="green" onClick={() => drillByStatus("aprovado")} />
          <DashKpi label="Rejeitados" value={resumo.rejeitados} sub={fmtBRLShort(resumo.valorRejeitado)} icon={XCircle} color="red" onClick={() => drillByStatus("rejeitado")} />
        </div>

        {/* KPIs secundários */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Taxa de Aprovação" value={`${resumo.taxaAprovacao.toFixed(1)}%`} sub="Aprovados / decididos" icon={TrendingUp} color="teal" />
          <DashKpi label="SLA Aprovação" value={`${resumo.slaDias.toFixed(1)} dias`} sub="Lançamento → aprovação" icon={Timer} color="slate" />
          <DashKpi label="Total Pago" value={fmtBRLShort(resumo.valorPago)} sub={`${resumo.pagamentosPagos} pagamentos`} icon={Wallet} color="green" />
          <DashKpi label="A Pagar" value={fmtBRLShort(resumo.valorAPagar)} sub={`${resumo.pagamentosPendentes} pendentes`} icon={CreditCard} color="orange" />
        </div>

        {/* Charts: Evolução + Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <DashChart
              title="Evolução Mensal de Lançamentos"
              type="bar"
              labels={data.evolucaoMensal.map((m: any) => m.label)}
              datasets={[
                { label: "Aprovados", data: data.evolucaoMensal.map((m: any) => m.aprovados), backgroundColor: "#10B981" },
                { label: "Pendentes", data: data.evolucaoMensal.map((m: any) => m.pendentes), backgroundColor: "#F59E0B" },
                { label: "Rejeitados", data: data.evolucaoMensal.map((m: any) => m.rejeitados), backgroundColor: "#DC2626" },
              ]}
              height={280}
              onChartClick={drillByMes}
            />
          </div>
          <DashChart
            title="Status dos Lançamentos"
            type="doughnut"
            labels={["Aprovados", "Pendentes", "Rejeitados"]}
            datasets={[{
              data: [resumo.aprovados, resumo.pendentes, resumo.rejeitados],
              backgroundColor: ["#10B981", "#F59E0B", "#DC2626"],
            }]}
            height={280}
            onChartClick={(info) => {
              const map: Record<string, string> = { Aprovados: "aprovado", Pendentes: "pendente", Rejeitados: "rejeitado" };
              drillByStatus(map[info.label]);
            }}
          />
        </div>

        {/* Valor mensal + Pagamentos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashChart
            title="Valor Aprovado por Mês"
            type="line"
            labels={data.evolucaoMensal.map((m: any) => m.label)}
            datasets={[{
              label: "Valor Aprovado (R$)",
              data: data.evolucaoMensal.map((m: any) => m.valorAprovado),
              borderColor: "#8B5CF6", backgroundColor: "rgba(139,92,246,0.15)", fill: true, tension: 0.3,
            }]}
            valueFormatter={fmtBRLAxis}
            height={260}
          />
          <DashChart
            title="Pagamentos a Parceiros (Pago vs A Pagar)"
            type="bar"
            labels={data.pagamentosPorMes.map((m: any) => m.label)}
            datasets={[
              { label: "Pago", data: data.pagamentosPorMes.map((m: any) => m.valorPago), backgroundColor: "#059669" },
              { label: "A Pagar", data: data.pagamentosPorMes.map((m: any) => m.valorAPagar), backgroundColor: "#F97316" },
            ]}
            valueFormatter={fmtBRLAxis}
            height={260}
          />
        </div>

        {/* Comparativo Mês a Mês — só faz sentido sem filtro de mês (visão 12 meses) */}
        {mes === "todos" && comparativoMensal.some((r: any) => r.lancamentos > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                Comparativo Mês a Mês — Lançamentos vs período anterior ({ano})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em qualquer linha para abrir o <strong>detalhamento completo</strong> daquele mês.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th rowSpan={2} className="py-2 px-3 font-medium text-muted-foreground border-b">Mês</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-blue-700 border-b text-center">Lançamentos</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-purple-700 border-b text-center">Valor Total</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-emerald-700 border-b text-center">Aprovados</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-amber-700 border-b text-center hidden md:table-cell">Pendentes</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-red-700 border-b text-center hidden md:table-cell">Rejeitados</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-green-700 border-b text-center hidden lg:table-cell">Pago</th>
                    <th colSpan={2} className="py-1 px-3 font-medium text-orange-700 border-b text-center hidden lg:table-cell">A Pagar</th>
                  </tr>
                  <tr className="text-right text-xs text-muted-foreground">
                    <th className="py-1 px-3 border-b">Qtd</th>
                    <th className="py-1 px-3 border-b">Δ</th>
                    <th className="py-1 px-3 border-b">Valor</th>
                    <th className="py-1 px-3 border-b">Δ</th>
                    <th className="py-1 px-3 border-b">Qtd</th>
                    <th className="py-1 px-3 border-b">Δ</th>
                    <th className="py-1 px-3 border-b hidden md:table-cell">Qtd</th>
                    <th className="py-1 px-3 border-b hidden md:table-cell">Δ</th>
                    <th className="py-1 px-3 border-b hidden md:table-cell">Qtd</th>
                    <th className="py-1 px-3 border-b hidden md:table-cell">Δ</th>
                    <th className="py-1 px-3 border-b hidden lg:table-cell">R$</th>
                    <th className="py-1 px-3 border-b hidden lg:table-cell">Δ</th>
                    <th className="py-1 px-3 border-b hidden lg:table-cell">R$</th>
                    <th className="py-1 px-3 border-b hidden lg:table-cell">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativoMensal.map((r: any) => {
                    const isMesAtual = r.mIdx + 1 === new Date().getMonth() + 1 && ano === new Date().getFullYear();
                    const renderDelta = (d: { abs: number; pct: number } | null, invertido = false, isMoney = false) => {
                      if (!d) return <span className="text-muted-foreground">—</span>;
                      if (Math.abs(d.abs) < 0.01) return <span className="text-muted-foreground inline-flex items-center gap-0.5"><Minus className="h-3 w-3" />0%</span>;
                      const subiu = d.abs > 0;
                      const ruim = invertido ? subiu : !subiu;
                      const cor = ruim ? "text-red-600" : "text-green-600";
                      return (
                        <span className={`inline-flex items-center gap-0.5 font-semibold ${cor} tabular-nums text-xs`}>
                          {subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          {d.pct >= 0 ? "+" : ""}{d.pct.toFixed(0)}%
                          {isMoney && <span className="text-[10px] font-normal text-muted-foreground hidden xl:inline">({subiu ? "+" : "−"}{fmtBRLShort(Math.abs(d.abs))})</span>}
                        </span>
                      );
                    };
                    const vazio = r.lancamentos === 0;
                    return (
                      <tr
                        key={r.mIdx}
                        onClick={() => !vazio && drillByMesIdx(r.mIdx)}
                        className={`border-b transition-colors ${vazio ? "opacity-50" : "cursor-pointer hover:bg-purple-50/40"} ${isMesAtual ? "bg-purple-50/40 font-semibold" : ""}`}
                        title={vazio ? "Sem lançamentos neste mês" : `Ver lançamentos de ${r.label}`}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {!vazio && <Eye className="h-3.5 w-3.5 text-purple-500 opacity-60" />}
                            <span>{r.label}</span>
                            {isMesAtual && <span className="text-[10px] uppercase text-purple-700">atual</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.lancamentos}</td>
                        <td className="py-2 px-3 text-right">{renderDelta(r.deltas.lancamentos, false)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtBRLShort(r.valor)}</td>
                        <td className="py-2 px-3 text-right">{renderDelta(r.deltas.valor, false, true)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{r.aprovados}</td>
                        <td className="py-2 px-3 text-right">{renderDelta(r.deltas.aprovados, false)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{r.pendentes}</td>
                        <td className="py-2 px-3 text-right hidden md:table-cell">{renderDelta(r.deltas.pendentes, true)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{r.rejeitados}</td>
                        <td className="py-2 px-3 text-right hidden md:table-cell">{renderDelta(r.deltas.rejeitados, true)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRLShort(r.valorPago)}</td>
                        <td className="py-2 px-3 text-right hidden lg:table-cell">{renderDelta(r.deltas.valorPago, false, true)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRLShort(r.valorAPagar)}</td>
                        <td className="py-2 px-3 text-right hidden lg:table-cell">{renderDelta(r.deltas.valorAPagar, true, true)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 font-semibold border-t-2">
                    <td className="py-2 px-3">TOTAL {ano}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{comparativoMensal.reduce((a: number, r: any) => a + r.lancamentos, 0)}</td>
                    <td></td>
                    <td className="py-2 px-3 text-right tabular-nums text-purple-700">{fmtBRLShort(comparativoMensal.reduce((a: number, r: any) => a + r.valor, 0))}</td>
                    <td></td>
                    <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{comparativoMensal.reduce((a: number, r: any) => a + r.aprovados, 0)}</td>
                    <td></td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell text-amber-700">{comparativoMensal.reduce((a: number, r: any) => a + r.pendentes, 0)}</td>
                    <td className="hidden md:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell text-red-700">{comparativoMensal.reduce((a: number, r: any) => a + r.rejeitados, 0)}</td>
                    <td className="hidden md:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell text-green-700">{fmtBRLShort(comparativoMensal.reduce((a: number, r: any) => a + r.valorPago, 0))}</td>
                    <td className="hidden lg:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell text-orange-700">{fmtBRLShort(comparativoMensal.reduce((a: number, r: any) => a + r.valorAPagar, 0))}</td>
                    <td className="hidden lg:table-cell"></td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-[11px] text-muted-foreground mt-2 px-1">
                <strong>Como ler:</strong> setas <span className="text-green-600 font-semibold">verdes</span> = movimento favorável (lançamentos/valor/aprovados/pago subindo, pendentes/rejeitados/a pagar caindo). Setas <span className="text-red-600 font-semibold">vermelhas</span> = atenção. Δ é o percentual vs o mês anterior.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Rankings + Tipo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4 text-purple-500" /> Top Parceiros por Valor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rankingParceiros.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento no período.</p>
              ) : (
                <DashChart
                  title=""
                  type="horizontalBar"
                  labels={data.rankingParceiros.map((p: any) => p.nome)}
                  datasets={[{
                    label: "Valor (R$)",
                    data: data.rankingParceiros.map((p: any) => p.valor),
                    backgroundColor: "#8B5CF6",
                  }]}
                  valueFormatter={fmtBRLAxis}
                  height={Math.max(220, data.rankingParceiros.length * 32)}
                  onChartClick={drillByParceiro}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" /> Top Colaboradores por Valor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rankingColaboradores.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento no período.</p>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto">
                  {data.rankingColaboradores.map((c: any, i: number) => (
                    <button
                      key={c.employeeId}
                      type="button"
                      onClick={() => drillByColaborador(c.employeeId, c.nome)}
                      className="w-full flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-purple-50 cursor-pointer text-left transition-colors group"
                      title="Clique para ver todos os lançamentos deste colaborador"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-bold w-5 text-right ${i < 3 ? "text-purple-600" : "text-muted-foreground"}`}>{i + 1}</span>
                        <Eye className="h-3.5 w-3.5 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-purple-700">{c.nome}</p>
                          <p className="text-xs text-muted-foreground">{c.lancamentos} lanç.</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-purple-600 shrink-0">{fmtBRL(c.valor)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Por Tipo de Convênio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" /> Análise por Tipo de Convênio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.porTipoConvenio.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum dado por tipo de convênio.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-right py-2 px-2">Parceiros</th>
                      <th className="text-right py-2 px-2">Lançamentos</th>
                      <th className="text-right py-2 px-2">Valor Total</th>
                      <th className="text-right py-2 px-2">Ticket Médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porTipoConvenio.map((t: any) => (
                      <tr key={t.tipo} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-2 font-medium">{t.label}</td>
                        <td className="text-right py-2 px-2">{t.parceiros}</td>
                        <td className="text-right py-2 px-2">{t.lancamentos}</td>
                        <td className="text-right py-2 px-2 font-semibold text-purple-600">{fmtBRL(t.valor)}</td>
                        <td className="text-right py-2 px-2 text-muted-foreground">
                          {t.lancamentos > 0 ? fmtBRL(t.valor / t.lancamentos) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalhes (top 100) */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-500" /> Lançamentos Recentes
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{data.detalhes.length} de {resumo.totalLancamentos}</Badge>
          </CardHeader>
          <CardContent>
            {data.detalhes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento no período filtrado.</p>
            ) : (
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b sticky top-0 bg-card">
                    <tr>
                      <th className="text-left py-2 px-2">Data</th>
                      <th className="text-left py-2 px-2">Parceiro</th>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-left py-2 px-2">Colaborador</th>
                      <th className="text-right py-2 px-2">Valor</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-center py-2 px-2">Competência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detalhes.map((d: any) => {
                      const st = STATUS_LANC[d.status] || { label: d.status, className: "bg-muted" };
                      return (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1.5 px-2 whitespace-nowrap">{fmtDateBR(d.dataCompra)}</td>
                          <td className="py-1.5 px-2 truncate max-w-[200px]" title={d.parceiroNome}>{d.parceiroNome}</td>
                          <td className="py-1.5 px-2 text-xs text-muted-foreground">{TIPO_LBL[d.tipoConvenio] || d.tipoConvenio}</td>
                          <td className="py-1.5 px-2 truncate max-w-[200px]" title={d.employeeNome}>{d.employeeNome}</td>
                          <td className="text-right py-1.5 px-2 font-medium">{fmtBRL(d.valor)}</td>
                          <td className="text-center py-1.5 px-2">
                            <Badge variant="outline" className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                          </td>
                          <td className="text-center py-1.5 px-2 text-xs text-muted-foreground">
                            {d.competenciaDesconto ? d.competenciaDesconto.split("-").reverse().join("/") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <PrintFooterLGPD />
      </div>

      {/* Drill-down — tela cheia */}
      <FullScreenDialog
        open={!!drillDialog}
        onClose={() => setDrillDialog(null)}
        title={drillDialog?.title || "Detalhes"}
        subtitle={drillDialog ? `${drillDialog.items.length} lançamento(s) — Total ${fmtBRL(drillDialog.items.reduce((a: number, x: any) => a + Number(x.valor || 0), 0))}` : undefined}
        icon={<Receipt className="h-5 w-5 text-white" />}
        zIndex={80}
        headerActions={
          drillDialog && drillDialog.items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 gap-1.5 border border-white/30"
              onClick={() => exportCsv(drillDialog.title, drillDialog.items)}
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
          ) : null
        }
      >
        <Card>
          <CardContent className="p-3 sm:p-6">
            {!drillDialog || drillDialog.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Nenhum lançamento encontrado.</p>
            ) : (
              <>
                {/* KPIs do drill */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <DashKpi label="Lançamentos" value={drillDialog.items.length} icon={Receipt} color="blue" />
                  <DashKpi label="Valor Total" value={fmtBRLShort(drillDialog.items.reduce((a: number, x: any) => a + Number(x.valor || 0), 0))} icon={DollarSign} color="purple" />
                  <DashKpi label="Parceiros" value={new Set(drillDialog.items.map((x: any) => x.parceiroNome)).size} icon={Store} color="indigo" />
                  <DashKpi label="Colaboradores" value={new Set(drillDialog.items.map((x: any) => x.employeeNome)).size} icon={Users} color="teal" />
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-left py-2 px-3">Parceiro</th>
                        <th className="text-left py-2 px-3">Tipo</th>
                        <th className="text-left py-2 px-3">Colaborador</th>
                        <th className="text-left py-2 px-3">Itens</th>
                        <th className="text-right py-2 px-3">Valor</th>
                        <th className="text-center py-2 px-3">Status</th>
                        <th className="text-center py-2 px-3">Competência</th>
                        <th className="text-left py-2 px-3">Aprovado em</th>
                        <th className="text-center py-2 px-3">Comprov.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDialog.items.map((d: any) => {
                        const st = STATUS_LANC[d.status] || { label: d.status, className: "bg-muted" };
                        return (
                          <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-1.5 px-3 whitespace-nowrap">{fmtDateBR(d.dataCompra)}</td>
                            <td className="py-1.5 px-3">{d.parceiroNome}</td>
                            <td className="py-1.5 px-3 text-xs text-muted-foreground">{TIPO_LBL[d.tipoConvenio] || d.tipoConvenio}</td>
                            <td className="py-1.5 px-3">
                              <button
                                type="button"
                                onClick={() => drillByColaborador(d.employeeId, d.employeeNome)}
                                className="text-left hover:text-purple-700 hover:underline inline-flex items-center gap-1"
                                title="Ver todos os lançamentos deste colaborador"
                              >
                                <Eye className="h-3 w-3 opacity-50" />{d.employeeNome}
                              </button>
                            </td>
                            <td className="py-1.5 px-3 text-xs">
                              <button
                                type="button"
                                onClick={() => setDetalheLanc(d)}
                                className="text-left hover:text-purple-700 hover:underline inline-flex items-center gap-1 max-w-[260px]"
                                title="Clique para ver o que o funcionário comprou (itens + comprovante)"
                              >
                                <Eye className="h-3 w-3 opacity-50 shrink-0" />
                                <span className="truncate text-muted-foreground">{d.descricaoItens || "Ver compra"}</span>
                              </button>
                            </td>
                            <td className="text-right py-1.5 px-3 font-medium">{fmtBRL(d.valor)}</td>
                            <td className="text-center py-1.5 px-3">
                              <Badge variant="outline" className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                            </td>
                            <td className="text-center py-1.5 px-3 text-xs text-muted-foreground">
                              {d.competenciaDesconto ? d.competenciaDesconto.split("-").reverse().join("/") : "—"}
                            </td>
                            <td className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                              {d.aprovadoEm ? fmtDateBR(d.aprovadoEm) : "—"}
                            </td>
                            <td className="text-center py-1.5 px-3">
                              {d.comprovanteUrl ? (
                                <a
                                  href={d.comprovanteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                                  title="Abrir comprovante em nova aba"
                                >
                                  <Eye className="h-3.5 w-3.5" /> Ver
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30 font-semibold">
                        <td colSpan={5} className="py-2 px-3 text-right">TOTAL</td>
                        <td className="text-right py-2 px-3 text-purple-600">
                          {fmtBRL(drillDialog.items.reduce((a: number, x: any) => a + Number(x.valor || 0), 0))}
                        </td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </FullScreenDialog>

      {/* ===== Sub-dialog: detalhes da compra (o que o funcionário comprou) ===== */}
      <Dialog open={!!detalheLanc} onOpenChange={(o) => !o && setDetalheLanc(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detalheLanc && (() => {
            const st = STATUS_LANC[detalheLanc.status] || { label: detalheLanc.status, className: "bg-muted" };
            const url: string = detalheLanc.comprovanteUrl || "";
            const isPdf = /\.pdf(\?|$)/i.test(url);
            const isImg = /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|$)/i.test(url);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-purple-600" />
                    Compra em {detalheLanc.parceiroNome}
                  </DialogTitle>
                  <DialogDescription>
                    {fmtDateBR(detalheLanc.dataCompra)} — {detalheLanc.employeeNome}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase font-bold text-purple-700">Valor</p>
                      <p className="text-xl font-bold text-purple-900 mt-1 font-mono">{fmtBRL(detalheLanc.valor)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase font-bold text-blue-700">Tipo</p>
                      <p className="text-sm font-semibold text-blue-900 mt-2">{TIPO_LBL[detalheLanc.tipoConvenio] || detalheLanc.tipoConvenio || "—"}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase font-bold text-amber-700">Status</p>
                      <Badge variant="outline" className={`mt-2 ${st.className}`}>{st.label}</Badge>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase font-bold text-green-700">Competência Desconto</p>
                      <p className="text-sm font-semibold text-green-900 mt-2">
                        {detalheLanc.competenciaDesconto ? detalheLanc.competenciaDesconto.split("-").reverse().join("/") : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Itens / Descrição */}
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <p className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center gap-1">
                      <ShoppingCart className="h-4 w-4" /> Itens / Descrição da compra
                    </p>
                    {detalheLanc.descricaoItens ? (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{detalheLanc.descricaoItens}</p>
                    ) : (
                      <p className="text-sm text-gray-500 italic">O colaborador não informou a descrição dos itens. Confira no comprovante abaixo.</p>
                    )}
                  </div>

                  {/* Motivo de rejeição */}
                  {detalheLanc.status === "rejeitado" && detalheLanc.motivoRejeicao && (
                    <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-red-700 uppercase mb-1">Motivo da rejeição</p>
                      <p className="text-sm text-red-800">{detalheLanc.motivoRejeicao}</p>
                    </div>
                  )}

                  {/* Aprovação */}
                  {detalheLanc.aprovadoEm && (
                    <p className="text-xs text-muted-foreground">Aprovado em <strong>{fmtDateBR(detalheLanc.aprovadoEm)}</strong></p>
                  )}

                  {/* Comprovante */}
                  <div className="border rounded-lg overflow-hidden bg-gray-100">
                    <div className="flex items-center justify-between px-3 py-2 bg-white border-b">
                      <p className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1">
                        <FileText className="h-4 w-4" /> Comprovante
                      </p>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" /> Abrir em nova aba
                        </a>
                      )}
                    </div>
                    {!url ? (
                      <div className="p-8 text-center text-sm text-gray-500">
                        Nenhum comprovante anexado a este lançamento.
                      </div>
                    ) : isImg ? (
                      <img src={url} alt="Comprovante" className="w-full max-h-[60vh] object-contain bg-white" />
                    ) : isPdf ? (
                      <iframe src={url} className="w-full h-[60vh] bg-white" title="Comprovante PDF" />
                    ) : (
                      <div className="p-6 text-center text-sm text-gray-600">
                        Tipo de arquivo não suportado para visualização inline. Use o link "Abrir em nova aba".
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function exportCsv(title: string, items: any[]) {
  const header = ["Data", "Parceiro", "Tipo", "Colaborador", "Valor", "Status", "Competencia", "AprovadoEm"];
  const rows = items.map((d: any) => [
    fmtDateBR(d.dataCompra),
    d.parceiroNome,
    TIPO_LBL[d.tipoConvenio] || d.tipoConvenio,
    d.employeeNome,
    String(d.valor).replace(".", ","),
    d.status,
    d.competenciaDesconto ? d.competenciaDesconto.split("-").reverse().join("/") : "",
    d.aprovadoEm ? fmtDateBR(d.aprovadoEm) : "",
  ]);
  const csv = [header, ...rows].map(r => r.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\d]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
