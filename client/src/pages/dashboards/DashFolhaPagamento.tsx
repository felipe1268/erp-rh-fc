import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import TabelaComparativaAnual, { type LinhaInd } from "@/components/TabelaComparativaAnual";
import { Wallet as WalletIcon, Users as UsersIcon, Banknote, ShieldCheck, Receipt as ReceiptIcon, PiggyBank } from "lucide-react";

const FOLHA_INDICADORES: LinhaInd[] = [
  { chave: "custoTotal", label: "Custo Total da Folha", icone: WalletIcon, cor: "blue", lowerIsBetter: false,
    pegar: r => Number(r.custoTotalMes) || Number(r.custoTotal) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    alertaPct: 15, hint: "Variação > 15% mês a mês exige justificativa (admissões, dissídio, 13º).",
    acoes: ["Comparar com headcount: aumento proporcional ao quadro?", "Verificar dissídio do mês (CCT da categoria).", "Cruzar com horas extras: pico de HE infla folha.", "Conferir adicional de insalubridade/periculosidade novos."] },
  { chave: "totalFunc", label: "Funcionários na Folha", icone: UsersIcon, cor: "blue", lowerIsBetter: false,
    pegar: r => Number(r.totalFuncionarios) || 0, format: v => `${v}`,
    alertaPct: 10, hint: "Quedas grandes podem indicar desligamentos em massa ou falha de processamento.",
    acoes: ["Cruzar com Aviso Prévio: desligamentos no mês.", "Verificar se houve fim de obra ou redução de equipe.", "Confirmar se todos os ativos foram processados (não ficaram fora)."] },
  { chave: "proventos", label: "Total de Proventos", icone: Banknote, cor: "green", lowerIsBetter: false,
    pegar: r => Number(r.totalProventosMes) || Number(r.totalProventos) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    alertaPct: 15, hint: "Soma de salário + HE + adicionais + bônus.",
    acoes: ["Validar variações com folha de medição.", "Conferir se 13º (nov/dez) infla artificialmente o mês."] },
  { chave: "liquido", label: "Líquido Pago", icone: PiggyBank, cor: "teal", lowerIsBetter: false,
    pegar: r => Number(r.totalLiquidoMes) || Number(r.totalLiquido) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    alertaPct: 15, hint: "Valor que efetivamente cai na conta dos funcionários.",
    acoes: ["Cruzar com extrato bancário do mês.", "Conferir se houve pagamentos retroativos."] },
  { chave: "fgts", label: "FGTS", icone: ShieldCheck, cor: "orange", lowerIsBetter: false,
    pegar: r => Number(r.totalFgtsMes) || Number(r.totalFgts) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    alertaPct: 15, hint: "8% sobre proventos — depósito até dia 20 do mês seguinte (Lei 8.036/90).",
    acoes: ["Conferir com guia FGTS gerada no eSocial.", "Validar atraso na quitação (multa de 0,5% ao mês + correção)."] },
  { chave: "inss", label: "INSS Total (Empresa+Func)", icone: ReceiptIcon, cor: "red", lowerIsBetter: false,
    pegar: r => Number(r.totalInssMes) || Number(r.totalInss) || 0,
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    alertaPct: 15, hint: "DARF/GPS — recolhimento até dia 20 do mês seguinte.",
    acoes: ["Conferir alíquota (~28% incluindo terceiros e RAT).", "Validar com DCTFWeb."] },
];
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Building2, Landmark, ArrowLeft, HandCoins, Search, ArrowUp, ArrowDown, Minus, X, AlertTriangle, Lightbulb, Eye, Calculator, Info } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import AlertaDivergenciaFolha from "@/components/AlertaDivergenciaFolha";

function fmtBRL(v: number) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number) {
  if (!isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

type KpiKey = "custoTotal" | "proventos" | "adiantamento" | "descontos" | "liquido" | "fgts" | "inss" | "irrf";

const KPI_META: Record<KpiKey, {
  label: string;
  field: keyof any;
  detailField: string;
  color: string;
  bg: string;
  border: string;
  ring: string;
  icon: any;
  hint: string;
  evolField?: string;
}> = {
  custoTotal:    { label: "Custo Total",         field: "custoTotalMes",        detailField: "bruto",            color: "text-red-600",     bg: "bg-red-50",     border: "border-l-red-500",     ring: "ring-red-200",     icon: DollarSign,   hint: "Proventos + INSS patronal estimado (~20%) + FGTS (8%)." },
  proventos:     { label: "Total Proventos",     field: "totalProventosMes",    detailField: "proventos",        color: "text-green-600",   bg: "bg-green-50",   border: "border-l-green-500",   ring: "ring-green-200",   icon: TrendingUp,   hint: "Soma de salário + horas extras + adicionais.", evolField: "proventos" },
  adiantamento:  { label: "Adiantamento (Vale)", field: "totalAdiantamentoMes", detailField: "adiantamento",     color: "text-orange-600",  bg: "bg-orange-50",  border: "border-l-orange-500",  ring: "ring-orange-200",  icon: HandCoins,    hint: "Vale já pago antes da folha. Não é desconto real." },
  descontos:     { label: "Descontos (sem vale)",field: "totalDescontosMes",    detailField: "descontosSemVale", color: "text-red-600",     bg: "bg-red-50",     border: "border-l-red-500",     ring: "ring-red-200",     icon: TrendingDown, hint: "Faltas, VR, VT, INSS, IRRF e demais. Não inclui adiantamento.", evolField: "descontos" },
  liquido:       { label: "Líquido Total",       field: "totalLiquidoMes",      detailField: "liquido",          color: "text-blue-600",    bg: "bg-blue-50",    border: "border-l-blue-500",    ring: "ring-blue-200",    icon: Wallet,       hint: "Líquido a pagar na folha. Pago total = vale + líquido.", evolField: "liquido" },
  fgts:          { label: "FGTS",                field: "totalFgtsMes",         detailField: "fgts",             color: "text-teal-600",    bg: "bg-teal-50",    border: "border-l-teal-500",    ring: "ring-teal-200",    icon: Landmark,     hint: "FGTS calculado sobre os proventos do mês.", evolField: "fgts" },
  inss:          { label: "INSS",                field: "totalInssMes",         detailField: "inss",             color: "text-purple-600",  bg: "bg-purple-50",  border: "border-l-purple-500",  ring: "ring-purple-200",  icon: Building2,    hint: "INSS retido do empregado.", evolField: "inss" },
  irrf:          { label: "IRRF",                field: "totalIrrfMes",         detailField: "irrf",             color: "text-slate-600",   bg: "bg-slate-50",   border: "border-l-slate-500",   ring: "ring-slate-200",   icon: DollarSign,   hint: "Imposto de renda retido na fonte." },
};

function FolhaKpi({ meta, value, sub, onClick }: { meta: typeof KPI_META[KpiKey]; value: number; sub?: string; onClick: () => void }) {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={meta.hint}
      className={`text-left bg-card border border-border ${meta.border} border-l-4 rounded-lg shadow-sm hover:shadow-md hover:scale-[1.02] focus:outline-none focus-visible:ring-2 ${meta.ring} transition-all p-3 sm:p-4 flex flex-col gap-2 min-h-[110px]`}
    >
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${meta.color}`} />
        </div>
        <p className="text-xs text-muted-foreground font-medium leading-tight">{meta.label}</p>
      </div>
      <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${meta.color} break-words leading-tight tabular-nums`}>
        {fmtBRL(value)}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-auto">{sub}</p>}
    </button>
  );
}

export default function DashFolhaPagamento() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const _now = new Date();
  const [ano, setAno] = useState(_now.getFullYear());
  const [mes, setMes] = useState(_now.getMonth() + 1);
  const mesStr = useMemo(() => `${ano}-${String(mes).padStart(2, "0")}`, [ano, mes]);
  const { data, isLoading } = trpc.dashboards.folhaPagamento.useQuery(
    { companyId: queryCompanyId, mesReferencia: mesStr, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: comparativoAnual, isLoading: loadingCompAnual } = trpc.dashboards.folhaPagamentoComparativo.useQuery(
    { companyId: queryCompanyId, mesReferencia: mesStr, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const [, navigate] = useLocation();
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [busca, setBusca] = useState("");
  const [mesDetalhe, setMesDetalhe] = useState<string | null>(null);

  const mesLabel = useMemo(() => {
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[mes - 1]}/${ano}`;
  }, [ano, mes]);

  // Tabela comparativa mês a mês — proventos, descontos, líquido, FGTS, INSS
  // com delta (R$ + %) vs mês anterior. Usado tanto pela tabela quanto pelos
  // pontos de atenção.
  const comparativo = useMemo(() => {
    if (!data?.evolucaoMensal || data.evolucaoMensal.length === 0) return [] as any[];
    const ev = [...(data.evolucaoMensal as any[])].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / Math.abs(b)) * 100);
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return ev.map((cur, i) => {
      const prev = i > 0 ? ev[i - 1] : null;
      const [y, m] = String(cur.mes).split("-");
      const label = `${meses[parseInt(m) - 1]}/${y.slice(2)}`;
      const fields = ["proventos", "descontos", "liquido", "fgts", "inss"] as const;
      const deltas: Record<string, { abs: number; pct: number } | null> = {};
      for (const f of fields) {
        if (!prev) { deltas[f] = null; continue; }
        const a = Number(cur[f] || 0), b = Number(prev[f] || 0);
        deltas[f] = { abs: a - b, pct: pct(a, b) };
      }
      return {
        mes: cur.mes, label,
        proventos: Number(cur.proventos || 0),
        descontos: Number(cur.descontos || 0),
        liquido:   Number(cur.liquido   || 0),
        fgts:      Number(cur.fgts      || 0),
        inss:      Number(cur.inss      || 0),
        funcionarios: Number(cur.funcionarios || 0),
        deltas,
      };
    });
  }, [data]);

  // Pontos de atenção — heurísticas para apoiar redução de custos
  const pontosAtencao = useMemo(() => {
    const pts: { tipo: "alerta" | "info"; titulo: string; descricao: string }[] = [];
    if (comparativo.length < 2) return pts;
    const ult = comparativo[comparativo.length - 1];
    const ante = comparativo[comparativo.length - 2];
    const fmtP = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

    // 1) Descontos crescendo forte vs mês anterior
    if (ult.deltas.descontos && ult.deltas.descontos.pct >= 15 && ult.deltas.descontos.abs > 0) {
      pts.push({
        tipo: "alerta",
        titulo: `Descontos subiram ${fmtP(ult.deltas.descontos.pct)} em ${ult.label}`,
        descricao: `Aumento de ${fmtBRL(ult.deltas.descontos.abs)} vs ${ante.label}. Avaliar faltas, atrasos, atestados e descontos manuais lançados no mês.`,
      });
    }
    // 2) Líquido caindo (custo subindo sem que o líquido acompanhe pode indicar mais encargos)
    if (ult.deltas.liquido && ult.deltas.liquido.pct <= -10 && ult.deltas.liquido.abs < 0) {
      pts.push({
        tipo: "alerta",
        titulo: `Líquido pago caiu ${fmtP(ult.deltas.liquido.pct)} em ${ult.label}`,
        descricao: `Redução de ${fmtBRL(Math.abs(ult.deltas.liquido.abs))}. Verifique se houve afastamentos, férias coletivas ou aumento de descontos.`,
      });
    }
    // 3) FGTS / INSS subindo desproporcionalmente
    for (const enc of ["fgts", "inss"] as const) {
      if (ult.deltas[enc] && ult.deltas[enc]!.pct >= 15 && ult.deltas[enc]!.abs > 0) {
        const provPct = ult.deltas.proventos?.pct ?? 0;
        if (ult.deltas[enc]!.pct - provPct >= 5) {
          pts.push({
            tipo: "alerta",
            titulo: `${enc.toUpperCase()} cresceu mais do que os proventos em ${ult.label}`,
            descricao: `${enc.toUpperCase()} ${fmtP(ult.deltas[enc]!.pct)} vs Proventos ${fmtP(provPct)}. Revisar bases de cálculo, horas extras e benefícios tributáveis.`,
          });
        }
      }
    }
    // 4) Aumento consistente de descontos por 3 meses
    if (comparativo.length >= 4) {
      const ultimos3 = comparativo.slice(-3);
      const todosSubindo = ultimos3.every(c => c.deltas.descontos && c.deltas.descontos.pct > 0);
      if (todosSubindo) {
        pts.push({
          tipo: "alerta",
          titulo: "Descontos em alta há 3 meses consecutivos",
          descricao: "Tendência sustentada — bom momento para auditar lançamentos manuais, rever política de VR/VT e reforçar controle de ponto.",
        });
      }
    }
    // 5) Funcionários caindo mas custo subindo (indicador de horas extras / adicionais)
    if (ult.deltas.proventos && ult.deltas.proventos.pct > 5 && ult.funcionarios <= ante.funcionarios) {
      pts.push({
        tipo: "alerta",
        titulo: `Custo cresceu ${fmtP(ult.deltas.proventos.pct)} sem aumento de quadro`,
        descricao: `${ult.funcionarios} funcionários (vs ${ante.funcionarios} no mês anterior). Forte indício de horas extras, adicionais ou reajustes — abrir o relatório de HE para investigar.`,
      });
    }
    // 6) Bom momento — nenhum item subindo
    if (pts.length === 0) {
      pts.push({
        tipo: "info",
        titulo: `Sem alertas relevantes em ${ult.label}`,
        descricao: "Nenhum item da folha apresentou variação anômala vs o mês anterior.",
      });
    }
    return pts;
  }, [comparativo]);

  // Variação mês a mês (R$ vs mês anterior) para cada métrica
  const variacao = useMemo(() => {
    if (!data?.evolucaoMensal || data.evolucaoMensal.length < 2) return null;
    const ev = data.evolucaoMensal as any[];
    const labels: string[] = [];
    const vProv: number[] = [], vDesc: number[] = [], vLiq: number[] = [], vFgts: number[] = [], vInss: number[] = [];
    for (let i = 1; i < ev.length; i++) {
      const cur = ev[i], prev = ev[i - 1];
      const [y, m] = String(cur.mes).split("-");
      labels.push(`${m}/${y.slice(2)}`);
      const diff = (a: number, b: number) => +(a - b).toFixed(2);
      vProv.push(diff(cur.proventos, prev.proventos));
      vDesc.push(diff(cur.descontos, prev.descontos));
      vLiq.push(diff(cur.liquido,    prev.liquido));
      vFgts.push(diff(cur.fgts,      prev.fgts));
      vInss.push(diff(cur.inss,      prev.inss));
    }
    return { labels, vProv, vDesc, vLiq, vFgts, vInss };
  }, [data]);

  // Dados atuais e mês anterior — para o "delta" mostrado no modal
  const evolAtualEAnterior = useMemo(() => {
    if (!data?.evolucaoMensal || data.evolucaoMensal.length === 0) return { atual: null as any, anterior: null as any };
    const ev = data.evolucaoMensal as any[];
    const idx = ev.findIndex(r => r.mes === mes);
    if (idx === -1) return { atual: null, anterior: null };
    return { atual: ev[idx], anterior: idx > 0 ? ev[idx - 1] : null };
  }, [data, mes]);

  const detalhes: any[] = (data as any)?.detalhesPorFuncionario || [];
  const meta = openKpi ? KPI_META[openKpi] : null;
  const detalhesOrdenados = useMemo(() => {
    if (!meta) return [];
    const term = busca.trim().toLowerCase();
    const filtrados = term
      ? detalhes.filter(d => (d.nome || "").toLowerCase().includes(term) || (d.funcao || "").toLowerCase().includes(term) || (d.banco || "").toLowerCase().includes(term))
      : detalhes;
    const f = meta.detailField as string;
    return [...filtrados].sort((a, b) => (b[f] || 0) - (a[f] || 0));
  }, [detalhes, meta, busca]);

  const totalKpi = meta && data ? Number((data.resumo as any)[meta.field] || 0) : 0;

  // Delta atual vs anterior para o KPI aberto
  const deltaInfo = useMemo(() => {
    if (!meta || !openKpi) return null;
    const { atual, anterior } = evolAtualEAnterior;
    const evolKey = meta.evolField;
    if (!evolKey || !atual || !anterior) return null;
    const cur = Number(atual[evolKey] || 0);
    const prev = Number(anterior[evolKey] || 0);
    const diff = cur - prev;
    const pct = prev === 0 ? 0 : (diff / Math.abs(prev)) * 100;
    return { cur, prev, diff, pct };
  }, [meta, openKpi, evolAtualEAnterior]);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Folha de Pagamento</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise de custos e encargos — {mesLabel}</p>
          </div>
          <PrintActions title="Dashboard Folha de Pagamento" />
        </div>

        {/* Seletor de período — padrão ERP */}
        <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={setMes} />

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs principais — 1 col mobile, 2 sm, 3 md, 5 xl */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <FolhaKpi meta={KPI_META.custoTotal}    value={data.resumo.custoTotalMes}              sub={`${data.resumo.totalFuncionarios} funcionários`} onClick={() => setOpenKpi("custoTotal")} />
              <FolhaKpi meta={KPI_META.proventos}     value={data.resumo.totalProventosMes}                                                                onClick={() => setOpenKpi("proventos")} />
              <FolhaKpi meta={KPI_META.adiantamento}  value={(data.resumo as any).totalAdiantamentoMes ?? 0}                                                onClick={() => setOpenKpi("adiantamento")} />
              <FolhaKpi meta={KPI_META.descontos}     value={data.resumo.totalDescontosMes}                                                                 onClick={() => setOpenKpi("descontos")} />
              <FolhaKpi meta={KPI_META.liquido}       value={data.resumo.totalLiquidoMes}                                                                   onClick={() => setOpenKpi("liquido")} />
            </div>
            <p className="text-xs text-muted-foreground -mt-3 px-1">
              <strong>Pago total</strong> ao funcionário no mês = <strong>Adiantamento (vale)</strong> + <strong>Líquido Total</strong> = {fmtBRL(((data.resumo as any).totalAdiantamentoMes ?? 0) + data.resumo.totalLiquidoMes)}.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FolhaKpi meta={KPI_META.fgts} value={data.resumo.totalFgtsMes} onClick={() => setOpenKpi("fgts")} />
              <FolhaKpi meta={KPI_META.inss} value={data.resumo.totalInssMes} onClick={() => setOpenKpi("inss")} />
              <FolhaKpi meta={KPI_META.irrf} value={data.resumo.totalIrrfMes} onClick={() => setOpenKpi("irrf")} />
            </div>

            {/* Alerta de Divergência */}
            <AlertaDivergenciaFolha mesReferencia={mesStr} mesLabel={mesLabel} variant="compact" />

            {/* Evolução mensal */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Evolução Mensal da Folha (últimos 12 meses)"
                type="line"
                labels={data.evolucaoMensal.map((r: any) => { const [y, m] = r.mes.split("-"); return `${m}/${y.slice(2)}`; })}
                datasets={[
                  { label: "Proventos", data: data.evolucaoMensal.map((r: any) => r.proventos), borderColor: SEMANTIC_COLORS.proventos, backgroundColor: CHART_FILL.verde,    fill: false, tension: 0.3 },
                  { label: "Descontos", data: data.evolucaoMensal.map((r: any) => r.descontos), borderColor: SEMANTIC_COLORS.descontos, backgroundColor: CHART_FILL.vermelho, fill: false, tension: 0.3 },
                  { label: "Líquido",   data: data.evolucaoMensal.map((r: any) => r.liquido),   borderColor: SEMANTIC_COLORS.liquido,   backgroundColor: CHART_FILL.azul,     fill: true,  tension: 0.3 },
                ]}
                height={300}
                valueFormatter={fmtBRL}
              />
            )}

            {/* Variação Mês a Mês — cards claros e diretos */}
            {comparativo.length >= 2 && (() => {
              const ult = comparativo[comparativo.length - 1];
              const ante = comparativo[comparativo.length - 2];
              const itens = [
                { key: "proventos", label: "Proventos", color: "green",  invertido: false, hint: "Subir é normal (HE, reajustes). Acima do esperado pode indicar custo de mão de obra crescendo." },
                { key: "descontos", label: "Descontos", color: "red",    invertido: true,  hint: "Subir indica mais faltas, atrasos ou descontos manuais — atenção." },
                { key: "liquido",   label: "Líquido",   color: "blue",   invertido: false, hint: "Subir é favorável. Cair pode indicar afastamentos ou aumento de descontos." },
                { key: "fgts",      label: "FGTS",      color: "teal",   invertido: true,  hint: "Sobe junto com proventos. Crescimento desproporcional merece análise." },
                { key: "inss",      label: "INSS",      color: "purple", invertido: true,  hint: "Sobe junto com proventos. Crescimento desproporcional merece análise." },
              ] as const;
              const corMap: Record<string, { bg: string; bd: string; tx: string }> = {
                green:  { bg: "bg-green-50",  bd: "border-l-green-500",  tx: "text-green-700" },
                red:    { bg: "bg-red-50",    bd: "border-l-red-500",    tx: "text-red-700" },
                blue:   { bg: "bg-blue-50",   bd: "border-l-blue-500",   tx: "text-blue-700" },
                teal:   { bg: "bg-teal-50",   bd: "border-l-teal-500",   tx: "text-teal-700" },
                purple: { bg: "bg-purple-50", bd: "border-l-purple-500", tx: "text-purple-700" },
              };
              return (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      Variação Mês a Mês — {ante.label} → {ult.label}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Info className="h-3.5 w-3.5 text-blue-500" />
                      Comparação direta entre os dois últimos meses fechados. Verde = movimento favorável; vermelho = atenção. Passe o mouse para entender cada métrica.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {itens.map((it) => {
                        const cur = ult[it.key], prev = ante[it.key];
                        const abs = cur - prev;
                        const pct = prev === 0 ? (cur > 0 ? 100 : 0) : (abs / Math.abs(prev)) * 100;
                        const subiu = abs > 0;
                        const estavel = Math.abs(abs) < 0.01;
                        const ruim = !estavel && (it.invertido ? subiu : !subiu);
                        const corDelta = estavel ? "text-muted-foreground" : ruim ? "text-red-600" : "text-green-600";
                        const Arrow = estavel ? Minus : subiu ? ArrowUp : ArrowDown;
                        const c = corMap[it.color];
                        return (
                          <div key={it.key} className={`rounded-lg border ${c.bd} border-l-4 ${c.bg} p-3`} title={it.hint}>
                            <p className={`text-xs font-semibold uppercase tracking-wide ${c.tx}`}>{it.label}</p>
                            <div className={`flex items-center gap-1.5 mt-2 ${corDelta}`}>
                              <Arrow className="h-5 w-5" />
                              <span className="text-2xl font-bold tabular-nums leading-none">
                                {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                              </span>
                            </div>
                            <p className={`text-sm font-semibold tabular-nums mt-1 ${corDelta}`}>
                              {subiu ? "+" : estavel ? "" : "−"}{fmtBRL(Math.abs(abs))}
                            </p>
                            <div className="border-t border-border/60 mt-2 pt-2 space-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                              <div className="flex justify-between"><span>{ante.label}:</span><span>{fmtBRL(prev)}</span></div>
                              <div className="flex justify-between font-semibold text-foreground"><span>{ult.label}:</span><span>{fmtBRL(cur)}</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Tabela Comparativa Mês a Mês */}
            {comparativo.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Comparativo Mês a Mês — Folha vs período anterior
                  </CardTitle>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                    <Info className="h-3.5 w-3.5 text-blue-500" />
                    Clique em qualquer linha para abrir a <strong>memória de cálculo completa</strong> daquele mês (todos os funcionários, todos os componentes).
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="text-left">
                        <th rowSpan={2} className="py-2 px-3 font-medium text-muted-foreground border-b">Mês</th>
                        <th rowSpan={2} className="py-2 px-3 font-medium text-muted-foreground border-b text-right hidden md:table-cell">Func.</th>
                        <th colSpan={2} className="py-1 px-3 font-medium text-green-700 border-b text-center">Proventos</th>
                        <th colSpan={2} className="py-1 px-3 font-medium text-red-700 border-b text-center">Descontos</th>
                        <th colSpan={2} className="py-1 px-3 font-medium text-blue-700 border-b text-center">Líquido</th>
                        <th colSpan={2} className="py-1 px-3 font-medium text-teal-700 border-b text-center hidden lg:table-cell">FGTS</th>
                        <th colSpan={2} className="py-1 px-3 font-medium text-purple-700 border-b text-center hidden lg:table-cell">INSS</th>
                      </tr>
                      <tr className="text-right text-xs text-muted-foreground">
                        <th className="py-1 px-3 border-b">Valor</th>
                        <th className="py-1 px-3 border-b">Δ vs ant.</th>
                        <th className="py-1 px-3 border-b">Valor</th>
                        <th className="py-1 px-3 border-b">Δ vs ant.</th>
                        <th className="py-1 px-3 border-b">Valor</th>
                        <th className="py-1 px-3 border-b">Δ vs ant.</th>
                        <th className="py-1 px-3 border-b hidden lg:table-cell">Valor</th>
                        <th className="py-1 px-3 border-b hidden lg:table-cell">Δ vs ant.</th>
                        <th className="py-1 px-3 border-b hidden lg:table-cell">Valor</th>
                        <th className="py-1 px-3 border-b hidden lg:table-cell">Δ vs ant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparativo.map((r: any, i: number) => {
                        const isUlt = i === comparativo.length - 1;
                        const renderDelta = (d: { abs: number; pct: number } | null, invertido = false) => {
                          if (!d) return <span className="text-muted-foreground">—</span>;
                          if (Math.abs(d.abs) < 0.01) return <span className="text-muted-foreground inline-flex items-center gap-1"><Minus className="h-3 w-3" />0,0%</span>;
                          // invertido=true → subir é ruim (descontos). Para proventos/líquido, subir é bom.
                          const subiu = d.abs > 0;
                          const ruim = invertido ? subiu : !subiu;
                          const cor = ruim ? "text-red-600" : "text-green-600";
                          return (
                            <span className={`inline-flex items-center gap-1 font-semibold ${cor} tabular-nums`}>
                              {subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {d.pct >= 0 ? "+" : ""}{d.pct.toFixed(1)}%
                              <span className="text-[10px] font-normal text-muted-foreground">({subiu ? "+" : "−"}{fmtBRL(Math.abs(d.abs))})</span>
                            </span>
                          );
                        };
                        return (
                          <tr
                            key={r.mes}
                            onClick={() => setMesDetalhe(r.mes)}
                            className={`border-b cursor-pointer transition-colors ${isUlt ? "bg-blue-50/50 font-semibold hover:bg-blue-100/60" : "hover:bg-blue-50/40"}`}
                            title={`Ver memória de cálculo completa de ${r.label}`}
                          >
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3.5 w-3.5 text-blue-500 opacity-60" />
                                <span>{r.label}</span>
                                {isUlt && <span className="text-[10px] uppercase text-blue-700">atual</span>}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{r.funcionarios}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{fmtBRL(r.proventos)}</td>
                            <td className="py-2 px-3 text-right">{renderDelta(r.deltas.proventos, false)}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{fmtBRL(r.descontos)}</td>
                            <td className="py-2 px-3 text-right">{renderDelta(r.deltas.descontos, true)}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{fmtBRL(r.liquido)}</td>
                            <td className="py-2 px-3 text-right">{renderDelta(r.deltas.liquido, false)}</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(r.fgts)}</td>
                            <td className="py-2 px-3 text-right hidden lg:table-cell">{renderDelta(r.deltas.fgts, true)}</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(r.inss)}</td>
                            <td className="py-2 px-3 text-right hidden lg:table-cell">{renderDelta(r.deltas.inss, true)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-muted-foreground mt-2 px-1">
                    <strong>Como ler:</strong> setas <span className="text-green-600 font-semibold">verdes</span> = movimento favorável (proventos/líquido subindo, descontos/encargos caindo). Setas <span className="text-red-600 font-semibold">vermelhas</span> = atenção.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Pontos de Atenção — sugestões para redução de custos */}
            {pontosAtencao.length > 0 && (
              <Card className="border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                    <Lightbulb className="h-4 w-4" />
                    Pontos de Atenção — oportunidades para redução de custos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pontosAtencao.map((p, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${p.tipo === "alerta" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}
                    >
                      {p.tipo === "alerta"
                        ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        : <Lightbulb className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />}
                      <div>
                        <p className={`text-sm font-semibold ${p.tipo === "alerta" ? "text-amber-900" : "text-blue-900"}`}>{p.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Encargos mensais */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Encargos Mensais (FGTS + INSS)"
                type="bar"
                labels={data.evolucaoMensal.map((r: any) => { const [y, m] = r.mes.split("-"); return `${m}/${y.slice(2)}`; })}
                datasets={[
                  { label: "FGTS", data: data.evolucaoMensal.map((r: any) => r.fgts), backgroundColor: SEMANTIC_COLORS.fgts },
                  { label: "INSS", data: data.evolucaoMensal.map((r: any) => r.inss), backgroundColor: SEMANTIC_COLORS.inss },
                ]}
                height={280}
                valueFormatter={fmtBRL}
              />
            )}

            {/* Custo por Função + Banco */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DashChart
                title="Custo por Função (Top 10)"
                type="horizontalBar"
                labels={data.porFuncao.map((f: any) => f.funcao)}
                datasets={[{ label: "Custo Total", data: data.porFuncao.map((f: any) => f.custo), backgroundColor: CHART_PALETTE[0] }]}
                height={280}
                valueFormatter={fmtBRL}
              />
              <DashChart
                title="Pagamentos por Banco"
                type="doughnut"
                labels={data.porBanco.map((b: any) => b.banco)}
                datasets={[{ data: data.porBanco.map((b: any) => b.valor) }]}
                height={280}
                valueFormatter={fmtBRL}
              />
            </div>

            {/* Top Salários */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  Top 10 Maiores Salários Brutos — {mesLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topSalarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado de folha para o período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4 font-medium text-muted-foreground">#</th>
                          <th className="py-2 pr-4 font-medium text-muted-foreground">Nome</th>
                          <th className="py-2 pr-4 font-medium text-muted-foreground">Função</th>
                          <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Bruto</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Líquido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topSalarios.map((s: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer" onClick={() => navigate("/folha-pagamento")}>
                            <td className="py-2 pr-4 font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{s.nome}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{s.funcao}</td>
                            <td className="py-2 pr-4 text-right font-semibold text-green-600">{fmtBRL(s.bruto)}</td>
                            <td className="py-2 text-right font-semibold text-blue-600">{fmtBRL(s.liquido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Modal Full-Screen por KPI */}
      <Dialog open={!!openKpi} onOpenChange={(o) => { if (!o) { setOpenKpi(null); setBusca(""); } }}>
        <DialogContent className="!w-screen !max-w-none h-screen p-0 gap-0 rounded-none flex flex-col" showCloseButton={false} resizable={false}>
          {meta && (
            <>
              <DialogHeader className="px-6 py-4 border-b bg-background sticky top-0 z-10 flex-row items-start justify-between gap-4 space-y-0">
                <div className="flex items-start gap-3">
                  <div className={`h-12 w-12 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                    <meta.icon className={`h-6 w-6 ${meta.color}`} />
                  </div>
                  <div>
                    <DialogTitle className={`text-2xl font-bold ${meta.color}`}>
                      {meta.label} — {mesLabel}
                    </DialogTitle>
                    <DialogDescription className="text-sm mt-1">{meta.hint}</DialogDescription>
                    <div className="flex flex-wrap items-baseline gap-4 mt-3">
                      <div>
                        <span className="text-xs text-muted-foreground">Total do mês</span>
                        <p className={`text-3xl font-bold ${meta.color} tabular-nums`}>{fmtBRL(totalKpi)}</p>
                      </div>
                      {deltaInfo && (
                        <div>
                          <span className="text-xs text-muted-foreground">vs mês anterior ({fmtBRL(deltaInfo.prev)})</span>
                          <p className={`text-lg font-semibold flex items-center gap-1 ${deltaInfo.diff > 0 ? "text-red-600" : deltaInfo.diff < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            {deltaInfo.diff > 0 ? <ArrowUp className="h-4 w-4" /> : deltaInfo.diff < 0 ? <ArrowDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                            {fmtBRL(Math.abs(deltaInfo.diff))} ({fmtPct(deltaInfo.pct)})
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-muted-foreground">Funcionários no mês</span>
                        <p className="text-lg font-semibold">{detalhes.length}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setOpenKpi(null); setBusca(""); }} aria-label="Fechar">
                  <X className="h-5 w-5" />
                </Button>
              </DialogHeader>

              <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
                {/* Mini-gráfico de evolução do item (se aplicável) */}
                {meta.evolField && data && data.evolucaoMensal.length > 1 && (
                  <DashChart
                    title={`Evolução de ${meta.label} — últimos meses`}
                    type="line"
                    labels={data.evolucaoMensal.map((r: any) => { const [y, m] = r.mes.split("-"); return `${m}/${y.slice(2)}`; })}
                    datasets={[{
                      label: meta.label,
                      data: data.evolucaoMensal.map((r: any) => Number(r[meta.evolField as string] || 0)),
                      borderColor: meta.color.includes("red") ? "#dc2626" : meta.color.includes("green") ? "#16a34a" : meta.color.includes("blue") ? "#2563eb" : meta.color.includes("teal") ? "#0d9488" : meta.color.includes("purple") ? "#7c3aed" : meta.color.includes("orange") ? "#ea580c" : "#475569",
                      backgroundColor: CHART_FILL.azul,
                      fill: true,
                      tension: 0.3,
                    }]}
                    height={220}
                    valueFormatter={fmtBRL}
                  />
                )}

                {/* Busca */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, função ou banco..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">{detalhesOrdenados.length} de {detalhes.length}</span>
                </div>

                {/* Tabela detalhada */}
                {detalhesOrdenados.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum funcionário encontrado.</div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr className="text-left">
                          <th className="py-2 px-3 font-medium text-muted-foreground">#</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Nome</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Função</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground hidden xl:table-cell">Banco</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden sm:table-cell">Bruto</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden lg:table-cell">Vale</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden lg:table-cell">Desc. Reais</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden xl:table-cell">INSS</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden xl:table-cell">IRRF</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden xl:table-cell">FGTS</th>
                          <th className={`py-2 px-3 font-bold text-right ${meta.color}`}>{meta.label}</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden sm:table-cell">Líquido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhesOrdenados.map((d: any, i: number) => (
                          <tr key={d.employeeId ?? i} className="border-t hover:bg-muted/30">
                            <td className="py-2 px-3 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="py-2 px-3 font-medium">
                              <div>{d.nome}</div>
                              <div className="text-xs text-muted-foreground md:hidden">{d.funcao}</div>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{d.funcao}</td>
                            <td className="py-2 px-3 text-muted-foreground hidden xl:table-cell">{d.banco}</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden sm:table-cell">{fmtBRL(d.bruto)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-orange-600 hidden lg:table-cell">{fmtBRL(d.adiantamento)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden lg:table-cell">{fmtBRL(d.descontosSemVale)}</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">{fmtBRL(d.inss)}</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">{fmtBRL(d.irrf)}</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">{fmtBRL(d.fgts)}</td>
                            <td className={`py-2 px-3 text-right tabular-nums font-bold ${meta.color}`}>{fmtBRL(d[meta.detailField as string] || 0)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-blue-600 font-semibold hidden sm:table-cell">{fmtBRL(d.liquido)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 sticky bottom-0">
                        <tr className="border-t font-bold">
                          <td colSpan={2} className="py-2 px-3">Totais</td>
                          <td className="py-2 px-3 hidden md:table-cell" />
                          <td className="py-2 px-3 hidden xl:table-cell" />
                          <td className="py-2 px-3 text-right tabular-nums hidden sm:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.bruto || 0), 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-orange-600 hidden lg:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.adiantamento || 0), 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden lg:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.descontosSemVale || 0), 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.inss || 0), 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.irrf || 0), 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden xl:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.fgts || 0), 0))}</td>
                          <td className={`py-2 px-3 text-right tabular-nums ${meta.color}`}>{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d[meta.detailField as string] || 0), 0))}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-blue-600 hidden sm:table-cell">{fmtBRL(detalhesOrdenados.reduce((a, d) => a + (d.liquido || 0), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal — Memória de Cálculo Completa por Mês */}
      <MemoriaCalculoMesModal
        mes={mesDetalhe}
        queryCompanyId={queryCompanyId}
        companyIds={companyIds}
        isConstrutoras={isConstrutoras}
        comparativo={comparativo}
        onClose={() => setMesDetalhe(null)}
      />

      <TabelaComparativaAnual
        meses={comparativoAnual?.meses || []}
        indicadores={FOLHA_INDICADORES}
        isLoading={loadingCompAnual}
        titulo={`Tendência mês-a-mês — ${mes.split("-")[0]}`}
        subtitulo="Janeiro até o mês de referência · clique em qualquer linha para análise aprofundada"
      />

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// ============================================================
// Modal — Memória de Cálculo Completa do Mês
// Abre ao clicar em uma linha da Tabela Comparativa Mês a Mês.
// Carrega os detalhes daquele mês e mostra: KPIs, comparação com
// mês anterior (composição) e a tabela detalhada por funcionário.
// ============================================================
function MemoriaCalculoMesModal({
  mes, queryCompanyId, companyIds, isConstrutoras, comparativo, onClose,
}: {
  mes: string | null;
  queryCompanyId: number;
  companyIds: number[];
  isConstrutoras: boolean;
  comparativo: any[];
  onClose: () => void;
}) {
  const [busca, setBusca] = useState("");
  const open = !!mes;
  const { data, isLoading } = trpc.dashboards.folhaPagamento.useQuery(
    { companyId: queryCompanyId, mesReferencia: mes || "", ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: open && (isConstrutoras ? companyIds.length > 0 : queryCompanyId > 0) }
  );

  const mesLabel = useMemo(() => {
    if (!mes) return "";
    const [y, m] = mes.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }, [mes]);

  // Linha do comparativo correspondente ao mês aberto (já contém deltas vs anterior)
  const linha = useMemo(() => comparativo.find((c: any) => c.mes === mes) || null, [comparativo, mes]);
  const linhaAnt = useMemo(() => {
    if (!mes) return null;
    const idx = comparativo.findIndex((c: any) => c.mes === mes);
    return idx > 0 ? comparativo[idx - 1] : null;
  }, [comparativo, mes]);

  const detalhes: any[] = (data as any)?.detalhesPorFuncionario || [];
  const detalhesFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    const arr = term
      ? detalhes.filter(d => (d.nome || "").toLowerCase().includes(term) || (d.funcao || "").toLowerCase().includes(term) || (d.banco || "").toLowerCase().includes(term))
      : detalhes;
    return [...arr].sort((a, b) => (b.bruto || 0) - (a.bruto || 0));
  }, [detalhes, busca]);

  const totais = useMemo(() => {
    const sum = (k: string) => detalhesFiltrados.reduce((a, d) => a + (d[k] || 0), 0);
    return {
      bruto: sum("bruto"), adiantamento: sum("adiantamento"), descontosSemVale: sum("descontosSemVale"),
      faltas: sum("faltas"), vrFaltas: sum("vrFaltas"), vtFaltas: sum("vtFaltas"),
      inss: sum("inss"), irrf: sum("irrf"), fgts: sum("fgts"), liquido: sum("liquido"),
    };
  }, [detalhesFiltrados]);

  // Mini-card de comparação: valor + delta vs mês anterior
  const CompCard = ({ label, valor, ant, color, invertido = false, hint }: { label: string; valor: number; ant: number | null; color: string; invertido?: boolean; hint?: string }) => {
    const diff = ant != null ? valor - ant : 0;
    const pct = ant != null && ant !== 0 ? (diff / Math.abs(ant)) * 100 : 0;
    const subiu = diff > 0;
    const ruim = ant != null && Math.abs(diff) >= 0.01 ? (invertido ? subiu : !subiu) : false;
    const corDelta = ant == null || Math.abs(diff) < 0.01 ? "text-muted-foreground" : ruim ? "text-red-600" : "text-green-600";
    return (
      <div className={`rounded-lg border bg-card p-3 border-l-4 ${color}`} title={hint}>
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold tabular-nums mt-1">{fmtBRL(valor)}</p>
        {ant != null && (
          <p className={`text-[11px] mt-1 inline-flex items-center gap-1 ${corDelta} tabular-nums`}>
            {Math.abs(diff) < 0.01 ? <Minus className="h-3 w-3" /> : subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}% ({subiu ? "+" : "−"}{fmtBRL(Math.abs(diff))}) vs ant.
          </p>
        )}
        {hint && <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{hint}</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setBusca(""); } }}>
      <DialogContent
        showCloseButton={false}
        resizable={false}
        className="!w-screen !max-w-none h-screen p-0 gap-0 rounded-none flex flex-col"
      >
        <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between space-y-0 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-lg">Memória de Cálculo Completa — {mesLabel}</DialogTitle>
              <DialogDescription className="text-xs">
                Composição detalhada da folha do mês, comparação vs mês anterior e detalhamento por funcionário.
              </DialogDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => { onClose(); setBusca(""); }} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
          {isLoading || !data ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Resumo no topo */}
              <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <div><strong>{(data.resumo as any).totalFuncionarios ?? 0}</strong> funcionários processados</div>
                <div className="text-muted-foreground">Mês de referência: <strong className="text-foreground">{mesLabel}</strong></div>
                {linhaAnt && <div className="text-muted-foreground">Comparado com: <strong className="text-foreground">{linhaAnt.label}</strong></div>}
              </div>

              {/* Composição (cards com delta vs anterior) */}
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-500" />
                  Composição da Folha — valor + variação vs mês anterior
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <CompCard label="Custo Total" valor={(data.resumo as any).custoTotalMes || 0}
                            ant={null} color="border-l-red-500"
                            hint="Proventos + INSS patronal estimado (~20%) + FGTS (8%)." />
                  <CompCard label="Total Proventos" valor={(data.resumo as any).totalProventosMes || 0}
                            ant={linhaAnt?.proventos ?? null} color="border-l-green-500"
                            hint="Salário base + horas extras + adicionais." />
                  <CompCard label="Adiantamento (Vale)" valor={(data.resumo as any).totalAdiantamentoMes || 0}
                            ant={null} color="border-l-orange-500" invertido
                            hint="Vale pago antes da folha. Não é desconto real." />
                  <CompCard label="Descontos (sem vale)" valor={(data.resumo as any).totalDescontosMes || 0}
                            ant={linhaAnt?.descontos ?? null} color="border-l-red-500" invertido
                            hint="Faltas, VR, VT, INSS, IRRF e demais descontos." />
                  <CompCard label="Líquido Total" valor={(data.resumo as any).totalLiquidoMes || 0}
                            ant={linhaAnt?.liquido ?? null} color="border-l-blue-500"
                            hint="Líquido a pagar. Pago total = vale + líquido." />
                  <CompCard label="FGTS" valor={(data.resumo as any).totalFgtsMes || 0}
                            ant={linhaAnt?.fgts ?? null} color="border-l-teal-500" invertido
                            hint="FGTS calculado sobre os proventos do mês." />
                  <CompCard label="INSS" valor={(data.resumo as any).totalInssMes || 0}
                            ant={linhaAnt?.inss ?? null} color="border-l-purple-500" invertido
                            hint="INSS retido do empregado." />
                  <CompCard label="IRRF" valor={(data.resumo as any).totalIrrfMes || 0}
                            ant={null} color="border-l-slate-500" invertido
                            hint="Imposto de Renda Retido na Fonte." />
                </div>
              </div>

              {/* Equação Pago Total */}
              <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 p-3 text-sm">
                <p className="font-semibold text-blue-900 mb-1 flex items-center gap-1.5"><Info className="h-4 w-4" /> Como o pago total é calculado</p>
                <p className="text-blue-900 tabular-nums">
                  <strong>Pago total ao funcionário</strong> = Adiantamento (Vale) + Líquido Total ={" "}
                  <span className="font-bold">
                    {fmtBRL(((data.resumo as any).totalAdiantamentoMes ?? 0) + ((data.resumo as any).totalLiquidoMes ?? 0))}
                  </span>
                </p>
                <p className="text-blue-800/70 text-xs mt-1">
                  O <em>vale</em> não aparece em "Descontos" porque já foi pago. Se aparecesse, o valor seria contado em dobro.
                </p>
              </div>

              {/* Legenda de colunas */}
              <div className="rounded-lg border bg-card p-3">
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Legenda das colunas da tabela abaixo
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <div><strong className="text-foreground">Bruto</strong>: total de proventos antes de descontos.</div>
                  <div><strong className="text-orange-600">Vale</strong>: adiantamento pago durante o mês.</div>
                  <div><strong className="text-red-600">Desc. Reais</strong>: descontos da folha excluindo o vale.</div>
                  <div><strong className="text-foreground">Faltas</strong>: desconto por faltas/atrasos.</div>
                  <div><strong className="text-foreground">VR/VT Faltas</strong>: desconto de vale-refeição/transporte por faltas.</div>
                  <div><strong className="text-purple-700">INSS</strong>: contribuição previdenciária do empregado.</div>
                  <div><strong className="text-slate-700">IRRF</strong>: imposto de renda retido.</div>
                  <div><strong className="text-teal-700">FGTS</strong>: depósito do mês (8% sobre os proventos).</div>
                  <div><strong className="text-blue-600">Líquido</strong>: valor a receber na folha (sem o vale).</div>
                </div>
              </div>

              {/* Busca */}
              <div className="flex items-center gap-2 sticky top-0 bg-background py-1 z-10">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, função ou banco..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <span className="text-sm text-muted-foreground">{detalhesFiltrados.length} de {detalhes.length}</span>
              </div>

              {/* Tabela detalhada por funcionário */}
              {detalhesFiltrados.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Nenhum funcionário encontrado neste mês.</div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left">
                        <th className="py-2 px-3 font-medium text-muted-foreground">#</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground">Nome</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Função</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground hidden xl:table-cell">Banco</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground text-right">Bruto</th>
                        <th className="py-2 px-3 font-medium text-orange-600 text-right hidden sm:table-cell">Vale</th>
                        <th className="py-2 px-3 font-medium text-red-600 text-right hidden sm:table-cell">Desc. Reais</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden lg:table-cell">Faltas</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden lg:table-cell">VR Faltas</th>
                        <th className="py-2 px-3 font-medium text-muted-foreground text-right hidden lg:table-cell">VT Faltas</th>
                        <th className="py-2 px-3 font-medium text-purple-700 text-right hidden xl:table-cell">INSS</th>
                        <th className="py-2 px-3 font-medium text-slate-700 text-right hidden xl:table-cell">IRRF</th>
                        <th className="py-2 px-3 font-medium text-teal-700 text-right hidden xl:table-cell">FGTS</th>
                        <th className="py-2 px-3 font-bold text-blue-600 text-right">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhesFiltrados.map((d: any, i: number) => (
                        <tr key={d.employeeId ?? i} className="border-t hover:bg-muted/30">
                          <td className="py-2 px-3 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="py-2 px-3 font-medium">
                            <div>{d.nome}</div>
                            <div className="text-xs text-muted-foreground md:hidden">{d.funcao}</div>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{d.funcao}</td>
                          <td className="py-2 px-3 text-muted-foreground hidden xl:table-cell">{d.banco}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtBRL(d.bruto)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-orange-600 hidden sm:table-cell">{fmtBRL(d.adiantamento)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden sm:table-cell">{fmtBRL(d.descontosSemVale)}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(d.faltas)}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(d.vrFaltas)}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(d.vtFaltas)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-purple-700 hidden xl:table-cell">{fmtBRL(d.inss)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-700 hidden xl:table-cell">{fmtBRL(d.irrf)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-teal-700 hidden xl:table-cell">{fmtBRL(d.fgts)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-blue-600 font-bold">{fmtBRL(d.liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/40 sticky bottom-0">
                      <tr className="border-t font-bold">
                        <td colSpan={2} className="py-2 px-3">Totais</td>
                        <td className="py-2 px-3 hidden md:table-cell" />
                        <td className="py-2 px-3 hidden xl:table-cell" />
                        <td className="py-2 px-3 text-right tabular-nums">{fmtBRL(totais.bruto)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-orange-600 hidden sm:table-cell">{fmtBRL(totais.adiantamento)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden sm:table-cell">{fmtBRL(totais.descontosSemVale)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(totais.faltas)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(totais.vrFaltas)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden lg:table-cell">{fmtBRL(totais.vtFaltas)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-purple-700 hidden xl:table-cell">{fmtBRL(totais.inss)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-700 hidden xl:table-cell">{fmtBRL(totais.irrf)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-teal-700 hidden xl:table-cell">{fmtBRL(totais.fgts)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-blue-600">{fmtBRL(totais.liquido)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
