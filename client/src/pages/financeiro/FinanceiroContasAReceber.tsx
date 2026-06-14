import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Building2,
  FileText, Clock, CheckCircle2, ReceiptText, Send, ThumbsUp, AlertCircle,
  TrendingUp, Wallet, BadgeCheck, CalendarClock, DollarSign, ChevronDown, ChevronUp,
  Pencil, Trash2, AlertTriangle, ArrowRight, BookOpen, BarChart2, Info,
  X, ExternalLink, Download, Search, Clock3,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RechTooltip, Legend,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function BRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function parseBRL(s: string): number {
  const clean = s.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function formatBRLInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const commaIdx = cleaned.indexOf(",");
  let intPart = commaIdx >= 0 ? cleaned.slice(0, commaIdx) : cleaned;
  const decPart = commaIdx >= 0 ? cleaned.slice(commaIdx + 1, commaIdx + 3) : null;
  intPart = intPart.replace(/^0+(\d)/, "$1");
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart !== null ? `${intPart},${decPart}` : intPart;
}

const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_CHAVE = (ano: number) =>
  Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);

const FORMAS_PAGAMENTO = ["PIX","TED","Boleto","Cheque","Dinheiro","Cartão","Outro"];

// ─── Status ───────────────────────────────────────────────────────────────────

type StatusKey =
  | "pendente" | "a_faturar" | "medicao_enviada" | "aprovada_parcial"
  | "faturado" | "a_receber" | "recebido_parcial" | "recebido_total"
  | "cancelado";

const STATUS_CFG: Record<string, { label: string; cell: string; badge: string; icon: any }> = {
  previsto:              { label: "Previsto",         cell: "bg-indigo-50 text-indigo-500",  badge: "bg-indigo-100 text-indigo-600", icon: CalendarClock },
  previsao_faturamento:  { label: "Prev. Faturamento",cell: "bg-orange-50 text-orange-600",  badge: "bg-orange-100 text-orange-600", icon: TrendingUp },
  pendente:              { label: "Pendente",         cell: "bg-gray-50 text-gray-500",      badge: "bg-gray-100 text-gray-500",     icon: Clock },
  a_faturar:             { label: "A Faturar",        cell: "bg-amber-50 text-amber-700",    badge: "bg-amber-100 text-amber-700",   icon: Clock },
  medicao_enviada:       { label: "Med. Enviada",     cell: "bg-sky-50 text-sky-700",        badge: "bg-sky-100 text-sky-700",       icon: Send },
  aprovada_parcial:      { label: "Aprov. Parcial",   cell: "bg-orange-50 text-orange-700",  badge: "bg-orange-100 text-orange-700", icon: ThumbsUp },
  faturado:              { label: "Faturado",         cell: "bg-blue-50 text-blue-700",      badge: "bg-blue-100 text-blue-700",     icon: FileText },
  a_receber:             { label: "A Receber",        cell: "bg-purple-50 text-purple-700",  badge: "bg-purple-100 text-purple-700", icon: ReceiptText },
  recebido_parcial:      { label: "Parc. Recebido",   cell: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300", badge: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  recebido_total:        { label: "Recebido",         cell: "bg-green-50 text-green-700",    badge: "bg-green-100 text-green-700",   icon: BadgeCheck },
  cancelado:             { label: "Cancelado",        cell: "bg-gray-50 text-gray-300",      badge: "bg-gray-100 text-gray-400",     icon: AlertCircle },
};

const STATUS_NEXT: Record<string, string> = {
  a_faturar: "medicao_enviada",
  medicao_enviada: "aprovada_parcial",
  aprovada_parcial: "faturado",
  faturado: "a_receber",
  a_receber: "recebido_total",
  recebido_parcial: "recebido_total",
};

function resolveStatus(m: MedicaoCell): string {
  // Camada 4: Recebido
  // 'confirmado' = PM confirmada pelo módulo Financeiro via "Dar Baixa" — trata como recebido_total
  if (m.statusFinanceiro && ["recebido_total","recebido_parcial","confirmado"].includes(m.statusFinanceiro)) {
    // Detecta recebimento parcial: valor recebido menor que o previsto
    if (m.valorRecebido > 0 && m.valorRecebido < m.valor - 0.01) return "recebido_parcial";
    return "recebido_total";
  }
  // Camada 4b: statusMedicao='confirmado' (PM confirmada sem FR vinculado)
  if (m.statusMedicao === "confirmado") {
    if (m.valorRecebido > 0 && m.valorRecebido < m.valor - 0.01) return "recebido_parcial";
    return "recebido_total";
  }
  // Camada 3: Faturado / A Receber ('confirmado' já tratado acima — excluir para evitar fallback)
  if (m.statusFinanceiro && m.statusFinanceiro !== "previsto" && m.statusFinanceiro !== "previsao_faturamento" && m.statusFinanceiro !== "confirmado") return m.statusFinanceiro;
  if (m.statusMedicao === "aprovada" || m.statusMedicao === "faturada") return "faturado";
  if (m.valor > 0 && m.statusMedicao !== "previsto") return "a_faturar";
  // Camada 2: Previsão de Faturamento (avanço físico)
  if (m.valorPrevisao > 0 && m.valorPrevisto === 0) return "previsao_faturamento";
  // Camada 1: Previsto (cronograma)
  if (m.statusMedicao === "previsto" || m.valorPrevisto > 0) return "previsto";
  if (m.valor > 0) return "previsto";
  return "pendente";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedicaoCell {
  id: number;
  competencia: string;
  numero: number;
  valorPrevisto: number;
  valorContratoBL: number;
  valorMedido: number;
  valorPrevisao: number;
  percentualPrevisto: number;
  percentualMedido: number;
  statusMedicao: string;
  statusFinanceiro: string | null;
  frId: number | null;
  nfNumero: string | null;
  dataVencimento: string | null;
  dataRecebimento: string | null;
  valorRecebido: number;
  contaBancariaId: number | null;
  valor: number;
}

interface ObraRow {
  projetoId: number;
  obraId: number | null;
  obraNome: string;
  cliente: string;
  valorContrato: number;
  totalRecebidoHistorico: number;
  avancoFisicoReal: number | null;
  saldoContrato: number;
  medicoes: MedicaoCell[];
  byMes: Record<string, MedicaoCell>;
  totalAno: number;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroContasAReceber() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [showNew, setShowNew] = useState(false);
  const [detalhe, setDetalhe] = useState<{ obra: ObraRow; mes: string; cell: MedicaoCell } | null>(null);
  const [baixa, setBaixa] = useState<{ obra: ObraRow; mes: string; cell: MedicaoCell } | null>(null);
  const [viewMode, setViewMode] = useState<"cronograma" | "contrato">("cronograma");
  const [optimisticCells, setOptimisticCells] = useState<Record<string, Partial<MedicaoCell>>>({});
  const [kpiPanel, setKpiPanel] = useState<string | null>(null);
  const [filterProjeto, setFilterProjeto] = useState("");
  const [chartSeries, setChartSeries] = useState({ previsto: true, recebido: true, acum: true });
  const toggleSerie = (key: keyof typeof chartSeries) =>
    setChartSeries(prev => ({ ...prev, [key]: !prev[key] }));

  // Mês corrente para highlight e alertas de atraso
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  // ─── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = (trpc as any).financial.getContasReceberMatrix.useQuery(
    { companyId, ano },
    { enabled: !!companyId, staleTime: 0, refetchOnWindowFocus: true }
  );

  const mesesChave = MESES_CHAVE(ano);

  const obras: ObraRow[] = (data?.projetos ?? []).map((p: any) => {
    const byMes: Record<string, MedicaoCell> = {};
    for (const [mes, raw] of Object.entries(p.meses ?? {})) {
      const r = raw as any;
      const valorPrevisao = r.valorPrevisao ?? 0;
      const valorDisplay = r.valorMedido > 0 ? r.valorMedido : (r.valorPrevisto > 0 ? r.valorPrevisto : valorPrevisao);
      if (valorDisplay === 0 && valorPrevisao === 0) continue;
      byMes[mes] = {
        id: r.medicaoId ?? 0,
        competencia: mes,
        numero: 0,
        valorPrevisto: r.valorPrevisto,
        valorContratoBL: r.valorContratoBL ?? r.valorPrevisto,
        valorMedido: r.valorMedido,
        valorPrevisao,
        percentualPrevisto: 0,
        percentualMedido: 0,
        statusMedicao: r.status ?? "previsto",
        statusFinanceiro: (r.status && r.status !== "previsto") ? r.status : null,
        frId: r.frId ?? null,
        nfNumero: r.nfNumero ?? null,
        dataVencimento: r.dataVencimento ?? null,
        dataRecebimento: r.dataRecebimento ?? null,
        valorRecebido: r.valorRecebido ?? 0,
        contaBancariaId: r.contaBancariaId ?? null,
        valor: valorDisplay,
      };
    }
    const totalAno = Object.values(byMes).reduce((s: number, c: any) => s + (c as MedicaoCell).valor, 0);
    return {
      ...p,
      totalRecebidoHistorico: p.totalRecebidoHistorico ?? 0,
      saldoContrato: p.saldoContrato ?? Math.max(0, (p.valorContrato ?? 0) - (p.totalRecebidoHistorico ?? 0)),
      byMes,
      totalAno,
    } as ObraRow;
  });

  const kpis = data?.kpis ?? { totalContrato: 0, totalPrevisto: 0, totalPrevisaoFaturamento: 0, totalFaturado: 0, totalAReceber: 0, totalRecebido: 0 };
  const totaisMes: Record<string, number> = data?.totaisMes ?? {};

  // ─── Dados do Gráfico de Fluxo de Caixa ─────────────────────────────────────
  const chartData = mesesChave.map((mes, i) => {
    const previsto = obras.reduce((s, o) => {
      const cell = o.byMes[mes];
      return cell ? s + cell.valor : s;
    }, 0);
    const recebido = obras.reduce((s, o) => {
      const cell = o.byMes[mes];
      return cell && cell.valorRecebido > 0 ? s + cell.valorRecebido : s;
    }, 0);
    return { mes: MESES_CURTOS[i], previsto, recebido, mesKey: mes };
  });

  // ─── Export CSV ──────────────────────────────────────────────────────────────
  function exportToCSV() {
    const headers = ["Projeto", "Cliente", ...MESES_CURTOS, "Total Ano"];
    const rows = obras.map(o => {
      const mesesVals = mesesChave.map(mk => {
        const cell = o.byMes[mk];
        return cell ? cell.valor.toFixed(2).replace(".", ",") : "0,00";
      });
      return [o.obraNome, o.cliente || "", ...mesesVals, o.totalAno.toFixed(2).replace(".", ",")];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-receber-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Obras filtradas ──────────────────────────────────────────────────────────
  const obrasFiltradas = filterProjeto.trim()
    ? obras.filter(o => o.obraNome.toLowerCase().includes(filterProjeto.toLowerCase()) ||
        (o.cliente || "").toLowerCase().includes(filterProjeto.toLowerCase()))
    : obras;

  // Recalcular "A Faturar" diretamente dos dados de obras (mesma lógica do painel)
  // para garantir que o card KPI bata com o total do painel de detalhes.
  const PENDING_STATUSES = new Set(["previsto","previsao_faturamento","a_faturar"]);
  const totalPrevisaoFaturamentoReal = obras.reduce((total, o) => {
    return total + mesesChave.reduce((s, mes) => {
      const cell = o.byMes[mes];
      if (!cell || cell.valor <= 0) return s;
      const st = resolveStatus(cell);
      return PENDING_STATUSES.has(st) ? s + cell.valor : s;
    }, 0);
  }, 0);

  // Mutations
  const updateMut = (trpc as any).financial.updateRevenueStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); setDetalhe(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const createMut = (trpc as any).financial.createRevenue.useMutation({
    onSuccess: () => { toast({ title: "Medição criada!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const baixaMut = (trpc as any).financial.registrarRecebimento.useMutation({
    onMutate: (variables: any) => {
      setBaixa(null);
      toast({ title: "✅ Recebimento registrado!", description: "Valor atualizado em todos os módulos." });
      const isFullyPaid = !(variables.valorRecebido > 0 && variables.valorRecebido < (variables.valorPrevisto ?? 0) - 0.01);
      const key = `${variables.projetoId}_${variables.competencia}`;
      setOptimisticCells(prev => ({
        ...prev,
        [key]: {
          statusFinanceiro: isFullyPaid ? "recebido_total" : "recebido_parcial",
          valorRecebido: variables.valorRecebido,
          dataRecebimento: variables.dataRecebimento ?? null,
        },
      }));
    },
    onSuccess: () => {
      refetch().then(() => setOptimisticCells({}));
    },
    onError: (e: any) => {
      setOptimisticCells({});
      toast({ title: "Erro ao registrar", description: e.message, variant: "destructive" });
    },
  });

  const cancelarMut = (trpc as any).financial.cancelarRecebimento.useMutation({
    onMutate: () => {
      setBaixa(null);
      toast({ title: "Recebimento cancelado", description: "O registro foi removido." });
    },
    onSuccess: () => {
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de Faturamento</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {viewMode === "contrato" ? "Previsto original do contrato (baseline)" : "Cronograma atualizado conforme avanço"}
              {" · "}atualizado automaticamente
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle Contrato / Cronograma */}
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode("contrato")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "contrato"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Contrato
              </button>
              <button
                onClick={() => setViewMode("cronograma")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "cronograma"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Cronograma
              </button>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
              <button onClick={() => setAno(a => a - 1)} className="p-1 hover:bg-white rounded transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-sm font-semibold text-gray-800 w-12 text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="p-1 hover:bg-white rounded transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <Button variant="outline" onClick={exportToCSV} className="h-9 border-gray-200 text-gray-600 hover:text-gray-900" title="Exportar CSV">
              <Download className="w-4 h-4 mr-1.5" />CSV
            </Button>
            <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
              <Plus className="w-4 h-4 mr-1.5" />Nova Medição
            </Button>
          </div>
        </div>

        {/* Banner do modo de visualização */}
        <div className={`flex items-start gap-2.5 px-4 py-2.5 rounded-xl text-xs border ${
          viewMode === "contrato"
            ? "bg-indigo-50 border-indigo-200 text-indigo-800"
            : "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          {viewMode === "contrato"
            ? <BookOpen className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
            : <BarChart2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          }
          <div>
            {viewMode === "contrato" ? (
              <>
                <span className="font-semibold">Visão Contrato (Baseline): </span>
                Exibe o valor original assinado no contrato para cada mês, sem considerar avanço físico ou reprogramações. Use para comparar o que foi combinado inicialmente com o que está sendo faturado.
              </>
            ) : (
              <>
                <span className="font-semibold">Visão Cronograma (Atualizado): </span>
                Exibe o valor previsto recalculado conforme o avanço físico real e o cronograma mais recente. Use para acompanhar o faturamento real e o fluxo de caixa do projeto.
              </>
            )}
          </div>
        </div>

        {/* KPIs — 2 linhas de 3 */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard icon={Wallet}        label="Total Contratos"       value={BRL(kpis.totalContrato)}               color="text-gray-700"   bg="bg-gray-50"     onClick={() => setKpiPanel("totalContrato")} />
          <KpiCard icon={CalendarClock} label="Previsto no Ano"       value={BRL(kpis.totalPrevisto)}               color="text-blue-700"   bg="bg-blue-50"     onClick={() => setKpiPanel("totalPrevisto")} />
          <KpiCard icon={TrendingUp}    label="A Faturar (Previsto)"  value={BRL(totalPrevisaoFaturamentoReal)}      color="text-orange-600" bg="bg-orange-50"   onClick={() => setKpiPanel("totalPrevisaoFaturamento")}
            sub="Meses ainda não faturados no cronograma" />
          <KpiCard icon={FileText}      label="Já Faturado"           value={BRL(kpis.totalFaturado)}               color="text-blue-700"   bg="bg-blue-50"     onClick={() => setKpiPanel("totalFaturado")} />
          <KpiCard icon={ReceiptText}   label="A Receber"             value={BRL(kpis.totalAReceber)}               color="text-purple-700" bg="bg-purple-50"   onClick={() => setKpiPanel("totalAReceber")}
            sub={kpis.totalAReceber > 0 ? "Faturado ainda não recebido" : "Tudo faturado já foi recebido"} />
          <KpiCard icon={CheckCircle2}  label="Recebido"              value={BRL(kpis.totalRecebido)}               color="text-green-700"  bg="bg-green-50"    onClick={() => setKpiPanel("totalRecebido")} />
        </div>

        {/* KPI Detail Panel */}
        {kpiPanel && (
          <KpiDetailPanel
            kpiKey={kpiPanel}
            obras={obras}
            mesesChave={mesesChave}
            kpis={kpis}
            ano={ano}
            onClose={() => setKpiPanel(null)}
          />
        )}

        {/* Filtro + Matriz */}
        <div className="space-y-2">
          {/* Barra de busca rápida */}
          {obras.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filtrar por projeto ou cliente..."
                  value={filterProjeto}
                  onChange={e => setFilterProjeto(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                />
              </div>
              {filterProjeto && (
                <button onClick={() => setFilterProjeto("")} className="text-xs text-gray-400 hover:text-gray-600">
                  Limpar
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {obrasFiltradas.length} de {obras.length} projeto(s)
              </span>
            </div>
          )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-gray-400 text-sm">Carregando cronograma...</div>
          ) : obras.length === 0 ? (
            <div className="p-16 text-center">
              <Building2 className="w-9 h-9 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Nenhum projeto encontrado para {ano}</p>
              <p className="text-gray-400 text-xs mt-1">Cadastre o cronograma financeiro no módulo de Planejamento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#1e2d40] text-white">
                    <th className="sticky left-0 z-30 bg-[#1e2d40] px-3 py-3 text-left text-xs font-semibold min-w-[270px] shadow-[2px_0_6px_rgba(0,0,0,0.18)]">
                      Obra / Cliente
                    </th>
                    {mesesChave.map((mk, i) => (
                      <th key={mk} className={`px-2 py-3 text-center text-xs font-semibold min-w-[110px] relative ${mk === mesAtual ? "bg-blue-700" : ""}`}>
                        {MESES_CURTOS[i]}
                        {mk === mesAtual && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-blue-200 font-normal">Atual</span>}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right text-xs font-semibold min-w-[160px] bg-[#162130]">
                      Totais da Obra
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {obrasFiltradas.map((obra, idx) => (
                    <ObraTableRow
                      key={obra.projetoId}
                      obra={obra}
                      mesesChave={mesesChave}
                      zebra={idx % 2 === 0}
                      viewMode={viewMode}
                      cellOverrides={optimisticCells}
                      mesAtual={mesAtual}
                      onCellClick={(mes, cell) => {
                        setBaixa({ obra, mes, cell });
                      }}
                      onDetalheClick={(mes, cell) => setDetalhe({ obra, mes, cell })}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1e2d40] text-white font-semibold">
                    <td className="sticky left-0 z-30 bg-[#1e2d40] px-4 py-3 text-xs shadow-[2px_0_6px_rgba(0,0,0,0.18)]">TOTAL</td>
                    {mesesChave.map(mk => (
                      <td key={mk} className="px-2 py-3 text-center text-xs">
                        {totaisMes[mk] ? BRL(totaisMes[mk]) : <span className="text-gray-500">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right text-xs bg-[#162130]">
                      <div className="space-y-0.5">
                        <div>
                          <p className="text-[8px] text-gray-400 uppercase">Faturado</p>
                          <p>{BRL(obras.reduce((s, o) => s + o.totalRecebidoHistorico, 0))}</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-orange-300 uppercase">Saldo</p>
                          <p className="text-orange-300">{BRL(obras.reduce((s, o) => s + Math.max(0, o.saldoContrato), 0))}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        </div>{/* end filtro + matriz space-y-2 */}

        {/* Legenda */}
        {obras.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            {/* Título */}
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Legenda — Status das Células</p>
            </div>

            {/* Grid de status */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([
                { s: "previsto",             desc: "Parcela planejada no cronograma, ainda não faturada" },
                { s: "previsao_faturamento", desc: "Estimativa de faturamento baseada no avanço físico real" },
                { s: "a_faturar",            desc: "Medição registrada — NF ainda não emitida ao cliente" },
                { s: "medicao_enviada",      desc: "Medição enviada ao cliente, aguardando aprovação" },
                { s: "faturado",             desc: "NF emitida — boleto/pix enviado, aguardando vencimento" },
                { s: "a_receber",            desc: "Faturado e no prazo — aguardando pagamento pelo cliente" },
                { s: "recebido_parcial",     desc: "Valor recebido parcialmente — saldo ainda em aberto" },
                { s: "recebido_total",       desc: "Pagamento integral confirmado e registrado" },
              ] as { s: string; desc: string }[]).map(({ s, desc }) => {
                const cfg = STATUS_CFG[s];
                if (!cfg) return null;
                const Icon = cfg.icon;
                return (
                  <div key={s} className="flex items-start gap-2">
                    <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold shrink-0 ${cfg.badge}`}>
                      <Icon className="w-3 h-3" />{cfg.label}
                    </span>
                    <span className="text-[11px] text-gray-500 leading-tight pt-0.5">{desc}</span>
                  </div>
                );
              })}
            </div>

            {/* Separador modos */}
            <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold">
                  <BookOpen className="w-3 h-3" />Contrato
                </span>
                <span className="text-[11px] text-gray-500">Valor original do contrato assinado (baseline imutável)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold">
                  <BarChart2 className="w-3 h-3" />Cronograma
                </span>
                <span className="text-[11px] text-gray-500">Previsão recalculada conforme avanço físico e cronograma atual</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Gráfico de Fluxo de Caixa ── (abaixo da legenda) */}
        {!isLoading && obras.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Previsão de Recebimentos — {ano}</h2>
                <p className="text-xs text-gray-400">Previsto a receber vs Efetivamente recebido por mês · clique na legenda para ativar/desativar</p>
              </div>
              {/* Legenda interativa — cada item é um toggle */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => toggleSerie("previsto")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all select-none ${chartSeries.previsto ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-400 line-through"}`}
                >
                  <span className={`inline-block w-3 h-3 rounded-sm transition-colors ${chartSeries.previsto ? "bg-blue-300" : "bg-gray-300"}`} />
                  Previsto
                </button>
                <button
                  onClick={() => toggleSerie("recebido")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all select-none ${chartSeries.recebido ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-400 line-through"}`}
                >
                  <span className={`inline-block w-3 h-3 rounded-sm transition-colors ${chartSeries.recebido ? "bg-green-500" : "bg-gray-300"}`} />
                  Recebido
                </button>
                <button
                  onClick={() => toggleSerie("acum")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all select-none ${chartSeries.acum ? "border-orange-200 bg-orange-50 text-orange-600" : "border-gray-200 bg-gray-50 text-gray-400 line-through"}`}
                >
                  <span className={`inline-block w-5 border-t-2 transition-colors ${chartSeries.acum ? "border-orange-400 border-dashed" : "border-gray-300"}`} />
                  Acum. Recebido
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)}
                  tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={48}
                />
                <RechTooltip
                  formatter={(value: number, name: string) => {
                    if (!chartSeries.previsto && name === "previsto") return [null, null] as any;
                    if (!chartSeries.recebido && name === "recebido") return [null, null] as any;
                    return [BRL(value as number), name === "previsto" ? "Previsto" : name === "recebido" ? "Recebido" : "Acum. Recebido"];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                {chartSeries.previsto && (
                  <Bar dataKey="previsto" name="previsto" fill="#bfdbfe" radius={[3,3,0,0]} maxBarSize={34} />
                )}
                {chartSeries.recebido && (
                  <Bar dataKey="recebido" name="recebido" fill="#22c55e" radius={[3,3,0,0]} maxBarSize={34} />
                )}
                {chartSeries.acum && (
                  <Line
                    dataKey="recebido"
                    name="acum"
                    type="monotone"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 3"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Modal Dar Baixa */}
      {baixa && (
        <DarBaixaModal
          obra={baixa.obra}
          mes={baixa.mes}
          cell={baixa.cell}
          companyId={companyId}
          isPending={baixaMut.isPending || cancelarMut.isPending}
          onClose={() => setBaixa(null)}
          onSave={(payload) => baixaMut.mutate(payload)}
          onCancel={(frId, medicaoId, projetoId, competencia) => cancelarMut.mutate({ companyId, frId, medicaoId, projetoId, competencia })}
          onVerDetalhes={() => { setDetalhe(baixa); setBaixa(null); }}
        />
      )}

      {/* Painel de Detalhe (fluxo completo) */}
      {detalhe && (
        <DetalhePanel
          obra={detalhe.obra}
          mes={detalhe.mes}
          cell={detalhe.cell}
          onClose={() => setDetalhe(null)}
          onUpdateStatus={(frId, status, obs) =>
            updateMut.mutate({ id: frId, companyId, status, observacoes: obs })
          }
          isPending={updateMut.isPending}
        />
      )}

      {/* Modal Nova Medição */}
      {showNew && (
        <NovaMedicaoModal
          companyId={companyId}
          obras={obras}
          onClose={() => setShowNew(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}
    </DashboardLayout>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, bg, sub, onClick }: {
  icon: any; label: string; value: string; color: string; bg: string; sub?: string; onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-100 p-4 ${bg} ${onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all select-none group" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        {onClick && <ExternalLink className={`w-3 h-3 ml-auto opacity-0 group-hover:opacity-60 transition-opacity ${color}`} />}
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── KPI Detail Panel (full-screen overlay) ──────────────────────────────────

const MESES_NOMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function mesLabel(mes: string) {
  const [, m] = mes.split("-");
  return MESES_NOMES[parseInt(m, 10) - 1] ?? mes;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, badge: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

function KpiDetailPanel({
  kpiKey, obras, mesesChave, kpis, ano, onClose
}: {
  kpiKey: string;
  obras: ObraRow[];
  mesesChave: string[];
  kpis: any;
  ano: number;
  onClose: () => void;
}) {
  const RECEBIDO_ST = new Set(["recebido_total","recebido_parcial","confirmado"]);
  const FATURADO_ST = new Set(["faturado","a_receber","recebido_parcial","recebido_total","confirmado"]);

  let title = "";
  let subtitle = "";
  let totalLabel = "";
  let totalValue = 0;
  let content: React.ReactNode = null;

  if (kpiKey === "totalContrato") {
    title = "Total de Contratos";
    subtitle = `${obras.length} projeto(s) ativo(s) em ${ano}`;
    totalLabel = "Total";
    totalValue = kpis.totalContrato;
    content = (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
            <th className="py-2 pr-4 font-medium">Projeto</th>
            <th className="py-2 pr-4 font-medium">Cliente</th>
            <th className="py-2 pr-4 font-medium text-right">Valor Contrato</th>
            <th className="py-2 pr-4 font-medium text-right">Já Recebido</th>
            <th className="py-2 font-medium text-right">Saldo a Receber</th>
          </tr>
        </thead>
        <tbody>
          {obras.map((o, i) => (
            <tr key={o.projetoId} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
              <td className="py-3 pr-4 font-medium text-gray-900">{o.obraNome}</td>
              <td className="py-3 pr-4 text-gray-500">{o.cliente || "—"}</td>
              <td className="py-3 pr-4 text-right font-semibold text-gray-800">{BRL(o.valorContrato ?? 0)}</td>
              <td className="py-3 pr-4 text-right text-green-700 font-medium">{BRL(o.totalRecebidoHistorico ?? 0)}</td>
              <td className="py-3 text-right font-semibold text-purple-700">{BRL(o.saldoContrato ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  else if (kpiKey === "totalPrevisto") {
    title = "Previsto no Ano";
    subtitle = `Cronograma financeiro de ${ano} por mês`;
    totalLabel = "Total Previsto";
    totalValue = kpis.totalPrevisto;
    const rows: { mes: string; obras: { nome: string; val: number }[]; total: number }[] = mesesChave.map(mes => {
      const items = obras
        .filter(o => o.byMes[mes] && o.byMes[mes].valor > 0)
        .map(o => ({ nome: o.obraNome, val: o.byMes[mes].valor }));
      return { mes, obras: items, total: items.reduce((s, x) => s + x.val, 0) };
    }).filter(r => r.total > 0);
    content = (
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-gray-400 text-sm py-8 text-center">Nenhum valor previsto cadastrado para {ano}.</p>}
        {rows.map(r => (
          <div key={r.mes} className="rounded-lg border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between bg-blue-50 px-4 py-2">
              <span className="font-semibold text-blue-800 text-sm">{mesLabel(r.mes)}</span>
              <span className="font-bold text-blue-900 text-sm">{BRL(r.total)}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {r.obras.map(ob => (
                <div key={ob.nome} className="flex items-center justify-between px-4 py-2 text-xs text-gray-600">
                  <span>{ob.nome}</span>
                  <span className="font-medium text-gray-800">{BRL(ob.val)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  else if (kpiKey === "totalPrevisaoFaturamento") {
    title = "A Faturar — Pipeline de Faturamento";
    subtitle = "Meses programados + projetos com saldo sem cronograma";
    totalLabel = "Total a Faturar";

    // Seção 1: meses com valor no cronograma (previsto, previsao_faturamento, a_faturar)
    const PENDING_ST = new Set(["previsto","previsao_faturamento","a_faturar"]);
    type PendRow = { obra: string; mes: string; val: number; status: string };
    const scheduled: PendRow[] = [];
    const obrasComAgenda = new Set<number>();
    for (const o of obras) {
      for (const mes of mesesChave) {
        const cell = o.byMes[mes];
        if (!cell) continue;
        const st = resolveStatus(cell);
        if (PENDING_ST.has(st) && cell.valor > 0) {
          scheduled.push({ obra: o.obraNome, mes, val: cell.valor, status: st });
          obrasComAgenda.add(o.projetoId);
        }
      }
    }

    // Seção 2: projetos com saldo de contrato mas sem meses agendados para faturar
    const semAgenda = obras.filter(o => !obrasComAgenda.has(o.projetoId) && (o.saldoContrato ?? 0) > 0);

    // Total real = soma das linhas exibidas (garante consistência com o header)
    totalValue = scheduled.reduce((s, r) => s + r.val, 0);

    content = (
      <div className="space-y-8">
        {/* Seção 1 — Meses com cronograma */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-orange-500" />
            Meses programados no cronograma
            <span className="ml-auto text-xs font-normal text-gray-400">{scheduled.length} entrada(s)</span>
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="py-2 pr-4 font-medium">Projeto</th>
                <th className="py-2 pr-4 font-medium">Mês</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 font-medium text-right">Valor Previsto</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400 text-sm">Nenhum mês programado no cronograma.</td></tr>
              )}
              {scheduled.map((r, i) => (
                <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{r.obra}</td>
                  <td className="py-3 pr-4 text-gray-600">{mesLabel(r.mes)}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === "a_faturar" ? "bg-yellow-100 text-yellow-700"
                      : r.status === "previsao_faturamento" ? "bg-orange-100 text-orange-700"
                      : "bg-indigo-100 text-indigo-700"
                    }`}>
                      {r.status === "a_faturar" ? "Med. Pendente" : r.status === "previsao_faturamento" ? "Avanço Físico" : "Cronograma"}
                    </span>
                  </td>
                  <td className="py-3 text-right font-semibold text-orange-700">{BRL(r.val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Seção 2 — Projetos com saldo sem agenda */}
        {semAgenda.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Projetos com saldo sem cronograma futuro
            </h3>
            <p className="text-xs text-gray-400 mb-3">Estes projetos têm valor contratual a receber mas sem meses programados. Cadastre o cronograma no módulo de Planejamento.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="py-2 pr-4 font-medium">Projeto</th>
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium text-right">Valor Contrato</th>
                  <th className="py-2 pr-4 font-medium text-right">Já Recebido</th>
                  <th className="py-2 font-medium text-right">Saldo a Faturar</th>
                </tr>
              </thead>
              <tbody>
                {semAgenda.map((o, i) => (
                  <tr key={o.projetoId} className={`border-b border-amber-50 ${i % 2 === 0 ? "" : "bg-amber-50/30"}`}>
                    <td className="py-3 pr-4 font-medium text-gray-900">{o.obraNome}</td>
                    <td className="py-3 pr-4 text-gray-500">{o.cliente || "—"}</td>
                    <td className="py-3 pr-4 text-right text-gray-700">{BRL(o.valorContrato ?? 0)}</td>
                    <td className="py-3 pr-4 text-right text-green-700">{BRL(o.totalRecebidoHistorico ?? 0)}</td>
                    <td className="py-3 text-right font-bold text-amber-700">{BRL(o.saldoContrato ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  else if (kpiKey === "totalFaturado") {
    title = "Já Faturado";
    subtitle = "Medições e recebimentos confirmados no ano";
    totalLabel = "Total Faturado";
    totalValue = kpis.totalFaturado;
    const rows: { obra: string; mes: string; val: number; status: string; nf: string | null; dataRec: string | null }[] = [];
    for (const o of obras) {
      for (const mes of mesesChave) {
        const cell = o.byMes[mes];
        if (!cell) continue;
        const st = resolveStatus(cell);
        if (FATURADO_ST.has(st)) {
          rows.push({ obra: o.obraNome, mes, val: cell.valor, status: st, nf: cell.nfNumero, dataRec: cell.dataRecebimento });
        }
      }
    }
    // Ordenar do recebimento mais recente para o mais antigo; sem data vai para o fim
    rows.sort((a, b) => {
      if (!a.dataRec && !b.dataRec) return b.val - a.val;
      if (!a.dataRec) return 1;
      if (!b.dataRec) return -1;
      return new Date(b.dataRec).getTime() - new Date(a.dataRec).getTime();
    });
    content = (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
            <th className="py-2 pr-4 font-medium">Projeto</th>
            <th className="py-2 pr-4 font-medium">Mês</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Recebido em</th>
            <th className="py-2 pr-4 font-medium">NF</th>
            <th className="py-2 font-medium text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-gray-400">Nenhuma medição faturada registrada.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
              <td className="py-3 pr-4 font-medium text-gray-900">{r.obra}</td>
              <td className="py-3 pr-4 text-gray-600">{mesLabel(r.mes)}</td>
              <td className="py-3 pr-4"><StatusBadge status={r.status} /></td>
              <td className="py-3 pr-4 text-gray-700 font-medium">
                {r.dataRec ? new Date(r.dataRec).toLocaleDateString("pt-BR") : <span className="text-gray-300">—</span>}
              </td>
              <td className="py-3 pr-4 text-gray-500 text-xs">{r.nf || "—"}</td>
              <td className="py-3 text-right font-semibold text-blue-700">{BRL(r.val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  else if (kpiKey === "totalAReceber") {
    title = "A Receber";
    subtitle = "Faturado mas ainda não recebido";
    totalLabel = "Total a Receber";
    totalValue = kpis.totalAReceber;
    const rows: { obra: string; mes: string; val: number; dataVenc: string | null }[] = [];
    for (const o of obras) {
      for (const mes of mesesChave) {
        const cell = o.byMes[mes];
        if (!cell) continue;
        const st = resolveStatus(cell);
        if (st === "a_receber" || st === "faturado") {
          rows.push({ obra: o.obraNome, mes, val: cell.valor, dataVenc: cell.dataVencimento });
        }
      }
    }
    content = (
      <div>
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Tudo faturado já foi recebido!</p>
            <p className="text-gray-400 text-sm mt-1">Não há valores pendentes de recebimento.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="py-2 pr-4 font-medium">Projeto</th>
                <th className="py-2 pr-4 font-medium">Mês</th>
                <th className="py-2 pr-4 font-medium">Vencimento</th>
                <th className="py-2 font-medium text-right">Valor a Receber</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{r.obra}</td>
                  <td className="py-3 pr-4 text-gray-600">{mesLabel(r.mes)}</td>
                  <td className="py-3 pr-4 text-gray-500">{r.dataVenc ? new Date(r.dataVenc).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="py-3 text-right font-semibold text-purple-700">{BRL(r.val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  else if (kpiKey === "totalRecebido") {
    title = "Recebido";
    subtitle = "Pagamentos confirmados no ano";
    totalLabel = "Total Recebido";
    totalValue = kpis.totalRecebido;
    const rows: { obra: string; mes: string; val: number; valRec: number; dataRec: string | null; nf: string | null; status: string }[] = [];
    for (const o of obras) {
      for (const mes of mesesChave) {
        const cell = o.byMes[mes];
        if (!cell) continue;
        const st = resolveStatus(cell);
        if (RECEBIDO_ST.has(st)) {
          rows.push({
            obra: o.obraNome, mes, val: cell.valor,
            valRec: cell.valorRecebido > 0 ? cell.valorRecebido : cell.valor,
            dataRec: cell.dataRecebimento,
            nf: cell.nfNumero,
            status: st,
          });
        }
      }
    }
    content = (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
            <th className="py-2 pr-4 font-medium">Projeto</th>
            <th className="py-2 pr-4 font-medium">Mês</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Recebido em</th>
            <th className="py-2 pr-4 font-medium">NF</th>
            <th className="py-2 font-medium text-right">Valor Recebido</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-gray-400">Nenhum recebimento registrado.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
              <td className="py-3 pr-4 font-medium text-gray-900">{r.obra}</td>
              <td className="py-3 pr-4 text-gray-600">{mesLabel(r.mes)}</td>
              <td className="py-3 pr-4"><StatusBadge status={r.status} /></td>
              <td className="py-3 pr-4 text-gray-500">{r.dataRec ? new Date(r.dataRec).toLocaleDateString("pt-BR") : "—"}</td>
              <td className="py-3 pr-4 text-gray-500 text-xs">{r.nf || "—"}</td>
              <td className="py-3 text-right font-bold text-green-700">{BRL(r.valRec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-200 bg-white shadow-sm shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{totalLabel}</p>
            <p className="text-3xl font-bold text-gray-900">{BRL(totalValue)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {content}
      </div>
    </div>
  );
}

function ObraTableRow({ obra, mesesChave, zebra, viewMode, cellOverrides, mesAtual, onCellClick, onDetalheClick }: {
  obra: ObraRow;
  mesesChave: string[];
  zebra: boolean;
  viewMode: "cronograma" | "contrato";
  cellOverrides: Record<string, Partial<MedicaoCell>>;
  mesAtual: string;
  onCellClick: (mes: string, cell: MedicaoCell) => void;
  onDetalheClick: (mes: string, cell: MedicaoCell) => void;
}) {
  const rowBg = zebra ? "bg-white" : "bg-gray-50";
  const hasPartial = mesesChave.some(mk => {
    const rawC = obra.byMes[mk];
    const ov = cellOverrides[`${obra.projetoId}_${mk}`];
    const c = ov ? { ...rawC, ...ov } : rawC;
    return c && resolveStatus(c) === "recebido_parcial";
  });

  // Alertas: meses passados com status que ainda precisam faturar
  const hasOverdue = mesesChave.some(mk => {
    if (mk >= mesAtual) return false;
    const rawC = obra.byMes[mk];
    const ov = cellOverrides[`${obra.projetoId}_${mk}`];
    const c = ov ? { ...rawC, ...ov } : rawC;
    if (!c || c.valor <= 0) return false;
    const s = resolveStatus(c);
    return s === "a_faturar" || s === "previsto" || s === "previsao_faturamento";
  });

  // % de execução financeira
  const pctExecucao = obra.valorContrato > 0
    ? Math.min(100, Math.round((obra.totalRecebidoHistorico / obra.valorContrato) * 100))
    : null;

  // Rev. 1346: "A Faturar no Período" — soma o que está previsto/medido nos meses da
  // visualização atual (ano selecionado) e ainda não foi recebido. Considera overrides
  // otimistas (cellOverrides) para refletir baixas em andamento.
  const aFaturarPeriodo = mesesChave.reduce((s, mk) => {
    const rawC = obra.byMes[mk];
    if (!rawC) return s;
    const ov = cellOverrides[`${obra.projetoId}_${mk}`];
    const c = ov ? { ...rawC, ...ov } as MedicaoCell : rawC;
    const valorBase = c.valor || 0;
    const recebido = c.valorRecebido || 0;
    return s + Math.max(0, valorBase - recebido);
  }, 0);

  return (
    <tr className={`border-b border-gray-100 hover:bg-blue-50/20 transition-colors ${rowBg} ${hasOverdue ? "border-l-4 border-l-red-400" : hasPartial ? "border-l-4 border-l-amber-400" : ""}`}>
      {/* Obra */}
      <td className={`sticky left-0 z-20 px-3 py-3 ${rowBg} shadow-[2px_0_6px_rgba(0,0,0,0.08)] min-w-[270px]`}>
        {/* Cabeçalho: ícone + nome + badge */}
        <div className="flex items-start gap-2 mb-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasOverdue ? "bg-red-100" : hasPartial ? "bg-amber-100" : "bg-blue-100"}`}>
            {hasOverdue
              ? <Clock3 className="w-4 h-4 text-red-600" />
              : hasPartial
                ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                : <Building2 className="w-4 h-4 text-blue-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-800 leading-tight truncate max-w-[200px]">{obra.obraNome}</p>
            <p className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5">{obra.cliente || "—"}</p>
          </div>
          {hasOverdue && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 rounded-md text-[9px] font-bold text-red-700 shrink-0">
              <Clock3 className="w-2.5 h-2.5" />Atrasado
            </span>
          )}
          {!hasOverdue && hasPartial && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 rounded-md text-[9px] font-bold text-amber-700 shrink-0">
              <AlertTriangle className="w-2.5 h-2.5" />Parcial
            </span>
          )}
        </div>

        {/* Barras de progresso: Financeiro e Físico */}
        {pctExecucao !== null && (() => {
          const pctFisicoRaw = obra.avancoFisicoReal !== null
            ? Math.min(100, obra.avancoFisicoReal)
            : null;
          const pctFisicoLabel = pctFisicoRaw !== null
            ? (Number.isInteger(pctFisicoRaw) ? `${pctFisicoRaw}` : pctFisicoRaw.toFixed(2))
            : null;
          const diff = pctFisicoRaw !== null ? pctFisicoRaw - pctExecucao : null;
          const isAtrasado = diff !== null && diff > 5;
          const isAdiantado = diff !== null && diff < -5;
          return (
            <div className="space-y-1.5 mb-2">
              {/* Financeiro */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-500 font-medium">Financeiro</span>
                  <span className={`text-[10px] font-bold ${pctExecucao >= 75 ? "text-emerald-600" : pctExecucao >= 40 ? "text-blue-600" : "text-orange-500"}`}>
                    {pctExecucao}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${pctExecucao >= 75 ? "bg-emerald-500" : pctExecucao >= 40 ? "bg-blue-500" : "bg-orange-400"}`}
                    style={{ width: `${pctExecucao}%` }}
                  />
                </div>
              </div>

              {/* Físico (cronograma) */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-500 font-medium">Físico (cronograma)</span>
                  {pctFisicoRaw !== null ? (
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isAtrasado ? "text-red-500" : isAdiantado ? "text-emerald-600" : "text-gray-600"}`}>
                      {isAtrasado && "↑"}{isAdiantado && "↓"}{pctFisicoLabel}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300 italic">sem dados</span>
                  )}
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  {pctFisicoRaw !== null ? (
                    <div
                      className={`h-2 rounded-full transition-all ${isAtrasado ? "bg-red-400" : isAdiantado ? "bg-emerald-400" : "bg-gray-400"}`}
                      style={{ width: `${pctFisicoRaw}%` }}
                    />
                  ) : (
                    <div className="h-2 rounded-full bg-gray-200 w-full opacity-40" style={{ backgroundImage: "repeating-linear-gradient(90deg,transparent,transparent 4px,#d1d5db 4px,#d1d5db 6px)" }} />
                  )}
                </div>
                {diff !== null && Math.abs(diff) > 5 && (
                  <p className={`text-[9px] font-semibold mt-0.5 ${isAtrasado ? "text-red-500" : "text-emerald-600"}`}>
                    {isAtrasado ? `↑ Físico +${diff!.toFixed(1)}pp à frente do financeiro` : `↑ Financeiro +${Math.abs(diff!).toFixed(1)}pp à frente do físico`}
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Valores Recebido / Saldo */}
        <div className="flex gap-3 border-t border-gray-100 pt-1.5">
          {obra.totalRecebidoHistorico > 0 && (
            <div>
              <p className="text-[9px] text-gray-400 mb-0.5">Recebido</p>
              <p className="text-[11px] font-bold text-emerald-700 leading-none">{BRL(obra.totalRecebidoHistorico)}</p>
            </div>
          )}
          {obra.saldoContrato > 0 && (
            <div>
              <p className="text-[9px] text-gray-400 mb-0.5">Saldo</p>
              <p className="text-[11px] font-bold text-orange-600 leading-none">{BRL(obra.saldoContrato)}</p>
            </div>
          )}
        </div>
      </td>

      {/* Células por mês */}
      {mesesChave.map(mk => {
        const rawCell = obra.byMes[mk];
        const ov = cellOverrides[`${obra.projetoId}_${mk}`];
        const cell = (rawCell && ov) ? { ...rawCell, ...ov } : rawCell;

        const isCurrentMes = mk === mesAtual;
        if (!cell || cell.valor === 0) {
          return (
            <td key={mk} className={`px-2 py-2.5 text-center ${isCurrentMes ? "bg-blue-50/60" : ""}`}>
              <span className="text-gray-200 text-xs">—</span>
            </td>
          );
        }
        const status = resolveStatus(cell);
        const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
        const Icon = cfg.icon;
        const isRecebido = status === "recebido_total" || status === "recebido_parcial";

        // Alertas de atraso: mês passado + status pendente
        const isOverdueCell = mk < mesAtual && (status === "a_faturar" || status === "previsto" || status === "previsao_faturamento");

        // Modo de visualização: contrato (baseline) vs cronograma (revisão atual)
        const noMedicao = status === "previsto" || status === "previsao_faturamento";
        // Valor a exibir no Balão 1: baseline quando modo=contrato e célula sem medição real
        const valorExibido = (viewMode === "contrato" && noMedicao && cell.valorContratoBL > 0)
          ? cell.valorContratoBL
          : cell.valor;
        // Indicador de divergência: só exibe em modo cronograma quando revisto ≠ baseline
        const blDivergence = viewMode === "cronograma" && noMedicao && cell.valorContratoBL > 0 &&
          Math.abs(cell.valorContratoBL - cell.valorPrevisto) > cell.valorContratoBL * 0.05;
        const blAbaixo = blDivergence && cell.valorPrevisto < cell.valorContratoBL;
        // Barra de progresso e diferença
        const pctRecebido = valorExibido > 0 ? Math.min(100, (cell.valorRecebido / valorExibido) * 100) : 0;
        const isParcial = status === "recebido_parcial";
        const diferenca = cell.valorRecebido > 0 ? valorExibido - cell.valorRecebido : 0;

        // Tooltip content (usando apenas campos existentes no MedicaoCell)
        const tooltipLines: string[] = [];
        if (cell.nfNumero) tooltipLines.push(`NF: ${cell.nfNumero}`);
        if (cell.dataVencimento) tooltipLines.push(`Venc.: ${new Date(cell.dataVencimento).toLocaleDateString("pt-BR")}`);
        if (cell.dataRecebimento) tooltipLines.push(`Recebido em: ${new Date(cell.dataRecebimento).toLocaleDateString("pt-BR")}`);
        if (cell.valorRecebido > 0 && cell.valorRecebido < cell.valor) tooltipLines.push(`Recebido: ${BRL(cell.valorRecebido)} / ${BRL(cell.valor)}`);
        if (cell.valorMedido > 0 && cell.valorMedido !== cell.valorPrevisto) tooltipLines.push(`Medido: ${BRL(cell.valorMedido)}`);

        return (
          <td key={mk} className={`px-1 py-1 text-center relative ${isCurrentMes ? "bg-blue-50/40" : ""} ${isOverdueCell ? "bg-red-50/40" : ""}`}>
            {isOverdueCell && (
              <div className="absolute top-1 right-1 z-10">
                <Clock3 className="w-2.5 h-2.5 text-red-400" />
              </div>
            )}
            <div className="relative group">
              {/* Tooltip */}
              {tooltipLines.length > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block pointer-events-none">
                  <div className="bg-gray-900 text-white text-[10px] rounded-lg px-2.5 py-2 shadow-xl min-w-[140px] text-left space-y-0.5 whitespace-nowrap">
                    {tooltipLines.map((l, li) => <div key={li}>{l}</div>)}
                  </div>
                  <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                </div>
              )}
              <button
                onClick={() => onCellClick(mk, cell)}
                className={`w-full flex flex-col gap-0.5 transition-all hover:opacity-90 cursor-pointer ${isOverdueCell ? "ring-1 ring-red-300 rounded-md" : ""}`}
              >
                {/* ── Balão 1: Status + Previsto — cor neutra fixa ── */}
                <div className={`w-full rounded-md px-2 py-1 border ${viewMode === "contrato" ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 ${cfg.badge} mb-0.5`}>
                    <Icon className="w-2.5 h-2.5 shrink-0" />
                    <span className="text-[8px] leading-none font-medium">{cfg.label}</span>
                  </div>
                  {noMedicao && (
                    <p className={`text-[7px] leading-none mb-0.5 ${viewMode === "contrato" ? "text-indigo-400" : "text-slate-400"}`}>
                      {viewMode === "contrato" ? "Contrato (BL)" : "Cronograma"}
                    </p>
                  )}
                  <p className={`font-semibold text-[11px] leading-tight ${viewMode === "contrato" ? "text-indigo-700" : "text-slate-700"}`}>
                    {BRL(valorExibido)}
                  </p>
                  {blDivergence && (
                    <p className={`text-[8px] mt-0.5 ${blAbaixo ? "text-red-600" : "text-emerald-600"}`}>
                      {blAbaixo ? "↓" : "↑"} Ctr: {BRL(cell.valorContratoBL)}
                    </p>
                  )}
                </div>

                {/* ── Balão 2: Recebido — sempre verde ── */}
                {cell.valorRecebido > 0 && (
                  <div className="w-full rounded-md px-2 py-1.5 bg-green-50 border border-green-300">
                    <p className="text-[8px] font-medium leading-none mb-0.5 text-green-600">Recebido</p>
                    <p className="font-bold text-sm leading-tight text-green-700">
                      {BRL(cell.valorRecebido)}
                    </p>
                    <div className="mt-1 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${pctRecebido}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* ── Balão 3: Diferença Previsto × Realizado ── */}
                {cell.valorRecebido > 0 && diferenca !== 0 && (
                  <div className={`w-full rounded-md px-2 py-1 ${diferenca > 0 ? "bg-orange-50 border border-orange-200" : "bg-sky-50 border border-sky-200"}`}>
                    <p className={`text-[8px] leading-none mb-0.5 ${diferenca > 0 ? "text-orange-500" : "text-sky-500"}`}>
                      {diferenca > 0 ? "Saldo a receber" : "Recebido a mais"}
                    </p>
                    <p className={`font-bold text-[11px] leading-tight ${diferenca > 0 ? "text-orange-700" : "text-sky-700"}`}>
                      {BRL(Math.abs(diferenca))}
                    </p>
                  </div>
                )}
              </button>
              {/* Ícone "detalhes" para células já recebidas */}
              {!isRecebido && (
                <div
                  className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => { e.stopPropagation(); onDetalheClick(mk, cell); }}
                  title="Ver detalhes / fluxo de status"
                >
                  <div className="w-4 h-4 bg-gray-400 hover:bg-gray-600 rounded-full flex items-center justify-center cursor-pointer">
                    <span className="text-white text-[8px] font-bold leading-none">···</span>
                  </div>
                </div>
              )}
            </div>
          </td>
        );
      })}

      {/* Totais da obra */}
      <td className="px-3 py-2.5 text-right bg-gray-50 border-l border-gray-200 min-w-[160px]">
        {/* Contrato */}
        {obra.valorContrato > 0 && (
          <div className="mb-1.5">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Contrato</p>
            <p className="text-xs font-bold text-gray-700">{BRL(obra.valorContrato)}</p>
          </div>
        )}
        {/* Total Faturado */}
        <div className="mb-1.5">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Total Faturado</p>
          <p className="text-xs font-bold text-emerald-700">{BRL(obra.totalRecebidoHistorico)}</p>
          {obra.valorContrato > 0 && (
            <p className="text-[9px] text-gray-400">
              {((obra.totalRecebidoHistorico / obra.valorContrato) * 100).toFixed(0)}% do contrato
            </p>
          )}
        </div>
        {/* A Faturar no Período (ano selecionado) — Rev. 1346 */}
        {aFaturarPeriodo > 0 && (
          <div className="mb-1.5" title={`Soma do previsto nos meses de ${mesesChave[0]?.slice(0,4) ?? ""} ainda não recebido`}>
            <p className="text-[9px] text-blue-500 uppercase tracking-wide leading-none mb-0.5">A Faturar no Período</p>
            <p className="text-xs font-bold text-blue-700">{BRL(aFaturarPeriodo)}</p>
          </div>
        )}
        {/* Saldo a Faturar */}
        {obra.saldoContrato > 0 && (
          <div>
            <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Saldo a Faturar</p>
            <p className="text-xs font-bold text-orange-600">{BRL(obra.saldoContrato)}</p>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Modal Dar Baixa ──────────────────────────────────────────────────────────

function DarBaixaModal({ obra, mes, cell, companyId, isPending, onClose, onSave, onCancel, onVerDetalhes }: {
  obra: ObraRow; mes: string; cell: MedicaoCell; companyId: number;
  isPending: boolean;
  onClose: () => void;
  onSave: (d: any) => void;
  onCancel: (frId: number, medicaoId: number | null, projetoId: number, competencia: string) => void;
  onVerDetalhes: () => void;
}) {
  const mesIdx = parseInt(mes.slice(5, 7)) - 1;
  const anoStr = mes.slice(0, 4);
  const hoje = new Date().toISOString().split("T")[0];
  const isEdit = !!(cell.frId && (cell.statusMedicao === "recebido_total" || cell.statusMedicao === "recebido_parcial" || cell.statusFinanceiro === "recebido_total" || cell.statusFinanceiro === "recebido_parcial"));

  const initValor = isEdit && cell.valorRecebido > 0
    ? cell.valorRecebido.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : cell.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { toast } = useToast();
  const [valorStr, setValorStr] = useState(initValor);
  const [data, setData] = useState(isEdit && cell.dataRecebimento ? cell.dataRecebimento.slice(0, 10) : hoje);
  const [forma, setForma] = useState("PIX");
  const [obs, setObs] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState<number | null>(cell.contaBancariaId ?? null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [step, setStep] = useState<"form" | "carry">("form");
  // Rev. 2655 — juros/descontos/outros + comprovante
  const [jurosStr, setJurosStr] = useState("");
  const [descontosStr, setDescontosStr] = useState("");
  const [outrosStr, setOutrosStr] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState("");
  const [comprovanteNome, setComprovanteNome] = useState("");
  const [uploadingComp, setUploadingComp] = useState(false);

  // Rev. 2540 — contas bancárias para o seletor da baixa
  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Rev. 2655 — upload de comprovante (PDF/Word/imagem)
  const uploadCompMut = (trpc as any).financial.uploadComprovante.useMutation();
  const handleUploadComprovante = async (file: File) => {
    setUploadingComp(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await uploadCompMut.mutateAsync({ fileName: file.name, fileBase64: base64, contentType: file.type || "application/octet-stream" });
      setComprovanteUrl(res.url);
      setComprovanteNome(file.name);
      toast({ title: "Comprovante anexado!" });
    } catch (e: any) {
      toast({ title: "Erro ao anexar", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingComp(false);
    }
  };

  const valorBase = parseBRL(valorStr);
  const jurosNum = parseBRL(jurosStr);
  const descontosNum = parseBRL(descontosStr);
  const outrosNum = parseBRL(outrosStr);
  // Rev. 2655 — total = valor + juros − descontos + outros (±) → vira valorRecebido
  const valorNum = valorBase + jurosNum - descontosNum + outrosNum;
  const valido = valorBase > 0 && data;
  const diferenca = cell.valor - valorNum;
  const isParcial = valorNum > 0 && diferenca > 0.01;

  function handleSave(carryNote?: string) {
    if (!valido) return;
    onSave({
      companyId,
      projetoId: obra.projetoId,
      obraId: obra.obraId,
      obraNome: obra.obraNome,
      clienteNome: obra.cliente,
      competencia: mes,
      valorPrevisto: cell.valorPrevisto || cell.valor,
      valorRecebido: valorNum,
      dataRecebimento: data,
      formaPagamento: forma,
      contaBancariaId,
      frId: cell.frId,
      observacoes: [obs, carryNote].filter(Boolean).join(" | ") || undefined,
      juros: jurosNum || undefined,
      descontos: descontosNum || undefined,
      outros: outrosNum || undefined,
      comprovanteUrl: comprovanteUrl || undefined,
    });
  }

  function handleConfirmClick() {
    if (!valido) return;
    if (isParcial && !isEdit) {
      setStep("carry");
    } else {
      handleSave();
    }
  }

  const headerGradient = isEdit
    ? "bg-gradient-to-r from-blue-600 to-indigo-500"
    : "bg-gradient-to-r from-green-600 to-emerald-500";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        {/* Cabeçalho colorido */}
        <div className={`${headerGradient} px-5 py-4 text-white`}>
          <div className="flex items-center gap-2 mb-1">
            {isEdit ? <Pencil className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
            <DialogHeader>
              <DialogTitle className="text-white text-base font-bold">
                {isEdit ? "Editar Recebimento" : "Registrar Recebimento"}
              </DialogTitle>
            </DialogHeader>
          </div>
          <p className="text-sm font-semibold opacity-90 truncate">{obra.obraNome}</p>
          <p className="text-xs opacity-75">{MESES_CURTOS[mesIdx]} {anoStr} · Previsto: {BRL(cell.valor)}</p>

          {/* Saldo de Contrato — dentro do header colorido */}
          {obra.valorContrato > 0 && (
            <div className="bg-white/15 rounded-lg mt-3 px-3 py-2 flex items-center justify-between gap-2">
              <div className="text-center">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">Contrato</p>
                <p className="text-xs font-bold text-white">{BRL(obra.valorContrato)}</p>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div className="text-center">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">Recebido</p>
                <p className="text-xs font-bold text-white">{BRL(obra.totalRecebidoHistorico)}</p>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div className="text-center">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">Saldo</p>
                <p className={`text-xs font-bold ${obra.saldoContrato > 0 ? "text-emerald-300" : "text-white"}`}>
                  {BRL(obra.saldoContrato)}
                </p>
              </div>
            </div>
          )}
        </div>

        {step === "form" && <div className="p-5 space-y-4">
          {/* Valor */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Valor (R$)</Label>
            <Input
              value={valorStr}
              onChange={e => setValorStr(formatBRLInput(e.target.value))}
              onFocus={e => e.target.select()}
              className="text-lg font-bold text-center h-11 border-2 focus:border-green-500"
              placeholder="0,00"
            />
            {isParcial && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1 mb-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Recebimento parcial</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Previsto</span>
                    <span className="font-medium">{BRL(cell.valor)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Recebendo</span>
                    <span className="font-bold text-green-700">{BRL(valorNum)}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-1 mt-1 flex justify-between text-xs">
                    <span className="font-semibold text-amber-700">Diferença</span>
                    <span className="font-bold text-amber-700">- {BRL(diferenca)}</span>
                  </div>
                </div>
              </div>
            )}
            {valorNum > 0 && valorNum > cell.valor && (
              <p className="text-xs text-blue-600 mt-1">✓ Acima do previsto</p>
            )}
          </div>

          {/* Rev. 2655 — Juros / Descontos / Outros */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-gray-600 font-semibold mb-1 block">Juros</Label>
              <Input value={jurosStr} onChange={e => setJurosStr(formatBRLInput(e.target.value))} className="h-9 text-sm" placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 font-semibold mb-1 block">Descontos</Label>
              <Input value={descontosStr} onChange={e => setDescontosStr(formatBRLInput(e.target.value))} className="h-9 text-sm" placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 font-semibold mb-1 block">Outros (±)</Label>
              <Input value={outrosStr} onChange={e => setOutrosStr(formatBRLInput(e.target.value))} className="h-9 text-sm" placeholder="0,00" />
            </div>
          </div>
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-green-800">Total a receber</span>
            <span className="text-lg font-bold text-green-700">{BRL(valorNum)}</span>
          </div>

          {/* Data */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Data do recebimento</Label>
            <Input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Forma de pagamento */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conta bancária (Rev. 2540) */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Conta bancária</Label>
            <Select
              value={contaBancariaId != null ? String(contaBancariaId) : "none"}
              onValueChange={v => setContaBancariaId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Não informar —</SelectItem>
                {(bankAccounts ?? []).filter((a: any) => a.ativo).map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {[a.descricao || a.banco, a.agencia ? `Ag ${a.agencia}` : null, a.conta ? `CC ${a.conta}` : null].filter(Boolean).join(" · ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rev. 2655 — Comprovante (PDF/Word/imagem) */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Comprovante / Documento</Label>
            <Input type="file" accept=".pdf,.doc,.docx,image/*" className="h-9 text-sm"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadComprovante(f); }} disabled={uploadingComp} />
            {uploadingComp && <p className="text-xs text-gray-500 mt-1">Enviando…</p>}
            {comprovanteUrl && !uploadingComp && (
              <p className="text-xs text-green-700 mt-1">
                Anexado: <a href={comprovanteUrl} target="_blank" rel="noreferrer" className="underline">{comprovanteNome || "ver arquivo"}</a>
              </p>
            )}
          </div>

          {/* Observação (colapsável) */}
          <ObsField value={obs} onChange={setObs} />

          {/* Botão principal */}
          <Button
            className={`w-full h-11 text-sm font-bold text-white ${isEdit ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}`}
            disabled={!valido || isPending || uploadingComp}
            onClick={handleConfirmClick}
          >
            {isPending ? "Salvando..." : isEdit ? "✓ Salvar Alterações" : isParcial ? "Continuar →" : "✓ Confirmar Recebimento"}
          </Button>

          {/* Cancelar recebimento (só em modo edição) */}
          {isEdit && cell.frId && (
            <div className="border-t border-gray-100 pt-3">
              {!confirmCancel ? (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors py-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Cancelar recebimento
                </button>
              ) : (
                <div className="bg-red-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-red-700 font-medium text-center">Confirmar cancelamento do recebimento?</p>
                  <p className="text-xs text-red-500 text-center">Esta ação não pode ser desfeita.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="flex-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md py-1.5"
                    >
                      Não
                    </button>
                    <button
                      onClick={() => onCancel(cell.frId!, cell.id || null, obra.projetoId, mes)}
                      disabled={isPending}
                      className="flex-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-md py-1.5 font-semibold disabled:opacity-50"
                    >
                      {isPending ? "..." : "Sim, cancelar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onVerDetalhes}
            className="w-full text-xs text-gray-400 hover:text-gray-600 text-center transition-colors"
          >
            Ver fluxo completo de status →
          </button>
        </div>}

        {step === "carry" && (
          <div className="p-5">
            {/* Resumo da diferença */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-bold text-amber-800">Recebimento parcial registrado</span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor previsto</span>
                  <span className="font-medium">{BRL(cell.valor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor recebido</span>
                  <span className="font-bold text-green-700">{BRL(valorNum)}</span>
                </div>
                <div className="border-t border-amber-200 pt-1.5 mt-1.5 flex justify-between">
                  <span className="font-bold text-amber-800">Diferença em aberto</span>
                  <span className="font-bold text-amber-800">{BRL(diferenca)}</span>
                </div>
              </div>
            </div>

            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
              A diferença de <span className="text-amber-700">{BRL(diferenca)}</span> deve ser relançada no próximo mês?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleSave(`Diferença de ${BRL(diferenca)} relançada no próximo mês sem correção`)}
                disabled={isPending}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-medium text-blue-800 transition-colors disabled:opacity-50"
              >
                <span>Sim, sem correção</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSave(`Diferença de ${BRL(diferenca)} relançada no próximo mês com correção monetária`)}
                disabled={isPending}
                className="w-full flex items-center justify-between px-4 py-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-sm font-medium text-orange-800 transition-colors disabled:opacity-50"
              >
                <span>Sim, com correção monetária</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSave()}
                disabled={isPending}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 transition-colors disabled:opacity-50"
              >
                Não, registrar apenas o valor recebido
              </button>
            </div>

            <button
              onClick={() => setStep("form")}
              className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 text-center transition-colors"
            >
              ← Voltar e corrigir valor
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ObsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "Ocultar observação" : "Adicionar observação (opcional)"}
      </button>
      {open && (
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          placeholder="Ex: pagamento parcial referente à medição nº 3..."
          className="mt-2 text-sm"
        />
      )}
    </div>
  );
}

// ─── Painel de Detalhe (fluxo completo de status) ────────────────────────────

function DetalhePanel({ obra, mes, cell, onClose, onUpdateStatus, isPending }: {
  obra: ObraRow; mes: string; cell: MedicaoCell;
  onClose: () => void;
  onUpdateStatus: (frId: number, status: string, obs: string) => void;
  isPending: boolean;
}) {
  const [obs, setObs] = useState("");
  const status = resolveStatus(cell);
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  const Icon = cfg.icon;
  const nextStatus = STATUS_NEXT[status];
  const [mesIdx, anoStr] = [parseInt(mes.slice(5, 7)) - 1, mes.slice(0, 4)];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[400px] h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">{MESES_CURTOS[mesIdx]} {anoStr}</p>
              <h3 className="text-base font-bold text-gray-900 mt-0.5">{obra.obraNome}</h3>
              <p className="text-xs text-gray-500">{obra.cliente}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">×</button>
          </div>

          {/* Status atual */}
          <div className={`rounded-xl p-4 ${cfg.cell}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4" />
              <span className="text-xs font-semibold">{cfg.label}</span>
            </div>
            <p className="text-2xl font-bold">{BRL(cell.valor)}</p>
            {cell.valorRecebido > 0 && (
              <p className="text-sm font-semibold mt-1">Recebido: {BRL(cell.valorRecebido)}</p>
            )}
          </div>

          {/* Detalhes */}
          <div className="space-y-2 text-sm">
            <Row label="Valor Previsto"  value={BRL(cell.valorPrevisto)} />
            <Row label="Valor Medido"    value={cell.valorMedido > 0 ? BRL(cell.valorMedido) : "—"} />
            <Row label="NF"              value={cell.nfNumero || "Não emitida"} />
            <Row label="Vencimento"      value={cell.dataVencimento ? fmtDate(cell.dataVencimento) : "—"} />
            <Row label="Recebimento"     value={cell.dataRecebimento ? fmtDate(cell.dataRecebimento) : "—"} />
            {cell.valorRecebido > 0 && (
              <Row label="Valor Recebido" value={BRL(cell.valorRecebido)} />
            )}
          </div>

          {/* Ação de avanço de status */}
          {cell.frId && nextStatus && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <Label className="text-xs text-gray-500">Observação (opcional)</Label>
              <Textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={2}
                placeholder="Informe observações se necessário..."
                className="text-sm"
              />
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isPending}
                onClick={() => onUpdateStatus(cell.frId!, nextStatus, obs)}
              >
                Avançar para {STATUS_CFG[nextStatus]?.label}
              </Button>
            </div>
          )}
          {!cell.frId && (
            <p className="text-xs text-gray-400 text-center pt-2">
              Esta medição ainda não possui lançamento financeiro.
              Será criada automaticamente na próxima sincronização.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

// ─── Modal Nova Medição ───────────────────────────────────────────────────────

function NovaMedicaoModal({ companyId, obras, onClose, onSave, isPending }: {
  companyId: number;
  obras: ObraRow[];
  onClose: () => void;
  onSave: (d: any) => void;
  isPending: boolean;
}) {
  const hoje = new Date();
  const [form, setForm] = useState({
    obraId: obras[0]?.obraId ?? 0,
    obraNome: obras[0]?.obraNome ?? "",
    clienteNome: obras[0]?.cliente ?? "",
    valorContrato: obras[0]?.valorContrato ?? 0,
    medicaoNumero: 1,
    valorMedicao: "",
    dataVencimento: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-28`,
    observacoes: "",
  });

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function handleObraChange(projetoId: string) {
    const obra = obras.find(o => String(o.projetoId) === projetoId);
    if (obra) {
      set("obraId", obra.obraId ?? 0);
      set("obraNome", obra.obraNome);
      set("clienteNome", obra.cliente);
      set("valorContrato", obra.valorContrato);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Medição Manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Obra</Label>
            <Select onValueChange={handleObraChange} defaultValue={String(obras[0]?.projetoId)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione a obra" />
              </SelectTrigger>
              <SelectContent>
                {obras.map(o => (
                  <SelectItem key={o.projetoId} value={String(o.projetoId)}>{o.obraNome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nº Medição</Label>
              <Input type="number" value={form.medicaoNumero} onChange={e => set("medicaoNumero", +e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={form.valorMedicao} onChange={e => set("valorMedicao", formatBRLInput(e.target.value))} className="h-9 text-sm" placeholder="0,00" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Data de Vencimento</Label>
            <Input type="date" value={form.dataVencimento} onChange={e => set("dataVencimento", e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isPending || !form.valorMedicao}
            onClick={() => onSave({
              companyId,
              obraId: form.obraId,
              obraNome: form.obraNome,
              clienteNome: form.clienteNome,
              valorContrato: form.valorContrato,
              medicaoNumero: form.medicaoNumero,
              valorMedicao: parseBRL(form.valorMedicao),
              dataVencimento: form.dataVencimento,
              observacoes: form.observacoes,
            })}
          >
            {isPending ? "Criando..." : "Criar Medição"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
